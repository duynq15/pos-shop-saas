'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { control, audit, getPlatformSettings, nextPaymentRef, saveQrOrder, getQrOrder, getQrOrders } = require('../control');
const { ok, fail, wrap, str, round, today } = require('../lib/util');
const { sendXlsx } = require('../lib/xlsx');
const { requirePerm, can } = require('../middleware');
const { openAlerts } = require('../lib/checks');
const { bankTime } = require('../lib/vqr-time');
const { accountConflict, CONFLICT_MSG } = require('../lib/community');
const { generateQR, getToken, bases, testCallbackUrl } = require('../payments/vietqr');
const funds = require('./funds');
const { makeCode } = require('../lib/codes');
const { getSettings } = require('./admin');
const { categoryFor } = require('./community');

const router = express.Router();   // API phía app (đã đăng nhập), mount /api
const webhook = express.Router();  // API mở cho VietQR gọi vào, mount /vqr

/* ===================== Tiện ích ===================== */
const GLOBAL_SECRET = () => process.env.VQR_SECRET || 'posshop-vqr-dev-secret';
const globalUser = () => process.env.VQR_EXPOSED_USER || 'posshop';
const globalPass = () => process.env.VQR_EXPOSED_PASS || 'posshop-secret';
const randId = () => crypto.randomBytes(8).toString('hex');

function readSettings() {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
}
const settingsOf = (code) => db.runWith(code, readSettings);

// Cấu hình VietQR hiệu dụng: ưu tiên của shop, fallback credentials dùng chung cấp nền tảng.
function vqrSettings() {
  const st = readSettings();
  let p = {};
  try { p = getPlatformSettings(); } catch { p = {}; }
  const inherit = !st.vqr_username && !st.vqr_password && !!(p.vqr_username && p.vqr_password);
  const isProd = process.env.NODE_ENV === 'production';
  return {
    ...st,
    vqr_username: st.vqr_username || p.vqr_username || '',
    vqr_password: st.vqr_password || p.vqr_password || '',
    vqr_env: isProd ? 'prod' : (inherit ? (p.vqr_env || st.vqr_env || 'mock') : (st.vqr_env || 'mock')),
    _inherited: inherit,
  };
}

function signToken(payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', GLOBAL_SECRET()).update(p).digest('base64url');
  return `${p}.${s}`;
}
function verifyToken(token) {
  try {
    const [p, s] = String(token || '').split('.');
    if (!p || !s) return null;
    const want = crypto.createHmac('sha256', GLOBAL_SECRET()).update(p).digest('base64url');
    if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
    const obj = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (obj.exp && obj.exp * 1000 < Date.now()) return null;
    return obj;
  } catch { return null; }
}

// Tìm tenant có exposed username/password trùng (nếu cấu hình theo từng shop).
function findExposedTenant(user, pass) {
  for (const t of control.prepare('SELECT code FROM tenants').all()) {
    const s = settingsOf(t.code);
    if (s.vqr_exposed_username && s.vqr_exposed_username === user && s.vqr_exposed_password === pass) return t.code;
  }
  return null;
}

const norm = (v) => String(v || '').replace(/[\s.-]/g, '');
function resolveTenantByBank(account) {
  const acc = norm(account);
  if (!acc) return null;
  for (const t of control.prepare('SELECT code FROM tenants').all()) {
    const s = settingsOf(t.code);
    if (s.bank_account && norm(s.bank_account) === acc) return t.code;
  }
  return null;
}

/* ===================== Xử lý thanh toán (dùng chung) ===================== */
// p: { transactionid, bankaccount, amount, content, orderId, transType, raw }
function processPayment(code, p) {
  return db.runWith(code, () => {
    // Không có mã giao dịch ngân hàng thì không chống trùng được: chỉ lưu để đối soát, không xác nhận hóa đơn (ERR-02)
    const txnId = str(p.transactionid, 80);
    if (!txnId) return { ref: '', message: 'Thiếu mã giao dịch ngân hàng, không ghi nhận', paid: false };
    const orderId = str(p.orderId, 20) || str(p.content, 23);
    const amount = round(p.amount);
    const bank = str(p.bankaccount, 40);
    const content = str(p.content, 60);
    const transType = str(p.transType, 2) || 'C';
    const raw = JSON.stringify(p.raw || {});

    const existing = db.prepare('SELECT * FROM vietqr_transactions WHERE transactionid=?').get(txnId);
    if (existing) {
      const inv = existing.invoice_id ? db.prepare('SELECT id,status FROM invoices WHERE id=?').get(existing.invoice_id) : null;
      return { ref: existing.order_id || '', message: 'Giao dịch đã xử lý trước đó', paid: !!(inv && inv.status === 'paid') };
    }

    let inv = db.prepare('SELECT * FROM invoices WHERE payment_ref=? AND type=?').get(orderId, 'sale');
    if (!inv && content) inv = db.prepare('SELECT * FROM invoices WHERE payment_ref=? AND type=?').get(content, 'sale');
    // Dự phòng: tách mã đối soát P########## từ nội dung (nếu orderId không được trả về)
    if (!inv) {
      const m = String(orderId + ' ' + content).match(/P\d{10}/);
      if (m) inv = db.prepare('SELECT * FROM invoices WHERE payment_ref=? AND type=?').get(m[0], 'sale');
    }
    // ON CONFLICT DO NOTHING + index duy nhất: hai lần gửi đồng thời cùng mã chỉ ghi được một dòng
    const insRaw = db.prepare(`INSERT INTO vietqr_transactions(transactionid,invoice_id,bank_account,amount,content,order_id,trans_type,matched,note,raw_json,category,bank_time)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
    // Loại suy từ kết quả khớp: chỉ 'sale' khi đã gắn hóa đơn và khớp; tiền ra là 'refund'; còn lại chờ phân loại
    const ins = { run: (id, invId, bk, amt, ct, oid, tt, matched, note, rj) =>
      insRaw.run(id, invId, bk, amt, ct, oid, tt, matched, note, rj, tt === 'D' ? 'refund' : matched ? 'sale' : 'unclassified', bankTime(p.raw)) };

    if (!inv) {
      ins.run(txnId, null, bank, amount, content, orderId, transType, 0, 'Không tìm thấy hóa đơn', raw);
      return { ref: '', message: 'Không tìm thấy hóa đơn theo mã đối soát', paid: false };
    }
    // Chỉ hóa đơn đang chờ chuyển khoản mới được xác nhận. Hóa đơn đã thanh toán (khách chuyển trùng) hay đã hủy
    // (hàng đã trả về kho) thì giữ nguyên, tiền vào hàng chờ phân loại để chủ cửa hàng xử lý (hoàn tiền / thu khác).
    if (inv.status !== 'pending') {
      const why = inv.status === 'paid' ? 'Hóa đơn đã thanh toán trước đó, tiền về thêm lần nữa' : 'Hóa đơn đã hủy, tiền về sau khi hủy';
      ins.run(txnId, inv.id, bank, amount, content, orderId, transType, 0, why, raw);
      return { ref: orderId, message: why, paid: inv.status === 'paid' };
    }
    if (amount !== inv.total) {
      ins.run(txnId, inv.id, bank, amount, content, orderId, transType, 0, `Số tiền không khớp (nhận ${amount}, cần ${inv.total})`, raw);
      return { ref: orderId, message: `Số tiền không khớp (nhận ${amount}, cần ${inv.total})`, paid: false, mismatch: true };
    }
    // Ghi giao dịch trước; mã đã có (gửi lặp) thì dừng, không xác nhận hóa đơn lần hai. Cả khối trong một transaction.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!ins.run(txnId, inv.id, bank, amount, content, orderId, transType, 1, 'Đã thanh toán', raw).changes) {
        db.exec('ROLLBACK');
        return { ref: orderId, message: 'Giao dịch đã xử lý trước đó', paid: true };
      }
      db.prepare("UPDATE invoices SET status='paid', paid_amount=total, change_amount=0 WHERE id=?").run(inv.id);
      const hasPay = db.prepare('SELECT COUNT(*) c FROM invoice_payments WHERE invoice_id=?').get(inv.id).c;
      if (!hasPay) db.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,?,?,?)').run(inv.id, 'transfer', inv.total, 'VietQR ' + txnId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ref: orderId, message: 'Đã ghi nhận thanh toán', paid: true };
  });
}

/* ===================== Webhook mở cho VietQR ===================== */
// Bước 1: VietQR lấy token (Basic Auth do mình định nghĩa)
webhook.post('/api/token_generate', (req, res) => {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return res.status(400).json({ status: 'FAILED', message: 'MISSING_AUTH' });
  let user = '', pass = '';
  try {
    const dec = Buffer.from(m[1], 'base64').toString('utf8');
    const i = dec.indexOf(':');
    user = dec.slice(0, i); pass = dec.slice(i + 1);
  } catch { return res.status(400).json({ status: 'FAILED', message: 'BAD_AUTH' }); }
  const tenantCode = findExposedTenant(user, pass);
  const okGlobal = user === globalUser() && pass === globalPass();
  if (!tenantCode && !okGlobal) return res.status(401).json({ status: 'FAILED', message: 'INVALID_CREDENTIALS' });
  const access_token = signToken({ t: tenantCode || null, exp: Math.floor(Date.now() / 1000) + 300, jti: randId() });
  res.json({ access_token, token_type: 'Bearer', expires_in: 300 });
});

// Bước 2: VietQR đồng bộ biến động số dư (Bearer token)
webhook.post('/bank/api/transaction-sync', wrap((req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const pl = verifyToken(token);
  if (!pl) { console.warn('[vqr] transaction-sync: token không hợp lệ'); return res.status(401).json({ error: true, errorReason: 'INVALID_TOKEN', toastMessage: 'Invalid or expired token', object: null }); }
  const b = req.body || {};
  // Nhận diện shop theo orderId (đã ghi lúc tạo QR) -> đúng cho mọi mô hình,
  // kể cả khi tiền về một tài khoản quản lý chung. Dự phòng: theo tài khoản quỹ (GĐ2.3,
  // không trùng giữa các thôn theo BR-02; nhiều quỹ dùng chung thì chọn theo mã nội dung), rồi theo số TK của tenant, rồi theo token.
  const orderIdForResolve = str(b.orderId, 20) || ((String(b.content || '').match(/P\d{10}/) || [])[0] || '');
  const mapped = getQrOrder(orderIdForResolve);
  const fundHit = mapped ? null : funds.resolveFundByBank(b.bankaccount, b.content);
  const code = (mapped && mapped.tenant_code) || (fundHit && fundHit.tenantCode) || resolveTenantByBank(b.bankaccount) || pl.t;
  console.log(`[vqr] sync nhận: shop=${code || '?'} orderId=${b.orderId || ''} amount=${b.amount || ''} content=${b.content || ''}${fundHit ? ' quỹ=' + fundHit.fundId : ''}`);
  // GĐ3.0: token cấp bằng thông tin đăng nhập riêng của một tenant (pl.t) chỉ được ghi vào chính tenant đó.
  // Trước đây định tuyến theo số tài khoản / orderId nên token của shop A ghi được tiền vào shop B hoặc quỹ.
  // Token dùng chung của nền tảng (pl.t = null, VietQR gọi vào) vẫn định tuyến như cũ.
  if (pl.t && code && code !== pl.t) {
    console.warn(`[vqr] chặn ghi chéo tenant: token=${pl.t} đích=${code} txn=${str(b.transactionid, 80)}`);
    audit({ action: 'vqr.cross_tenant_blocked', entity: 'tenant', entityId: code, detail: JSON.stringify({ token_tenant: pl.t, transactionid: str(b.transactionid, 80), amount: b.amount }), ip: req.ip });
    return res.status(403).json({ error: true, errorReason: 'TENANT_MISMATCH', toastMessage: 'Token không thuộc tài khoản nhận tiền này', object: null });
  }
  if (!code) return res.status(400).json({ error: true, errorReason: 'TENANT_NOT_FOUND', toastMessage: 'Không xác định được cửa hàng theo tài khoản nhận tiền', object: null });
  try {
    const r = fundHit
      ? funds.processFundPayment(code, fundHit.fundId, { transactionid: b.transactionid, bankaccount: b.bankaccount, amount: b.amount, content: b.content, transType: b.transType, raw: b })
      : processPayment(code, { transactionid: b.transactionid, bankaccount: b.bankaccount, amount: b.amount, content: b.content, orderId: b.orderId, transType: b.transType, raw: b });
    res.json({ error: false, errorReason: null, toastMessage: r.message, object: { reftransactionid: r.ref } });
  } catch (e) {
    res.status(400).json({ error: true, errorReason: 'TRANSACTION_FAILED', toastMessage: e.message, object: null });
  }
}));

/* ===================== API phía app ===================== */
router.get('/vietqr/config', wrap((req, res) => {
  const s = vqrSettings();
  ok(res, {
    enabled: s.vqr_enabled === '1', env: s.vqr_env || 'mock',
    bank_code: s.vqr_bank_code || '', bank_account: s.bank_account || '', account_holder: s.account_holder || '',
    terminal_code: s.vqr_terminal_code || '', exposed_username: s.vqr_exposed_username || '',
    has_credentials: !!(s.vqr_username && s.vqr_password),
    inherited: !!s._inherited,
  });
}));

// Tạo QR động cho hóa đơn
router.post('/invoices/:id/vietqr', requirePerm('invoice.view'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const s = vqrSettings();
  if (s.vqr_enabled !== '1') return fail(res, 'VietQR động chưa bật trong Cài đặt');
  // GĐ0.2 (BR-02, SEC-01): kiểm lại khi tạo QR, phòng dữ liệu cũ hoặc tenant được gán vào cộng đồng sau khi đã khai tài khoản
  if (accountConflict(req.tenant.code, s.bank_account)) return fail(res, CONFLICT_MSG);
  let inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  if (!inv.payment_ref) {
    inv.payment_ref = nextPaymentRef();
    db.prepare('UPDATE invoices SET payment_ref=? WHERE id=?').run(inv.payment_ref, id);
  }
  saveQrOrder(inv.payment_ref, req.tenant.code, id, { amount: inv.total, bank_account: s.bank_account });
  try {
    const q = await generateQR(s, req.tenant.code, { amount: inv.total, orderId: inv.payment_ref, content: inv.payment_ref });
    saveQrOrder(inv.payment_ref, req.tenant.code, id, { amount: inv.total, content: q.content || inv.payment_ref, bank_account: s.bank_account });
    db.prepare('UPDATE invoices SET payment_content=? WHERE id=?').run(q.content || '', id);
    ok(res, { ...q, env: s.vqr_env || 'mock', invoice_id: id, total: inv.total, payment_ref: inv.payment_ref, status: inv.status });
  } catch (e) { fail(res, e.message, 502); }
}));

router.get('/invoices/:id/payment-status', requirePerm('invoice.view'), wrap((req, res) => {
  const inv = db.prepare('SELECT id,status,total,paid_amount,payment_ref FROM invoices WHERE id=?').get(Number(req.params.id));
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  ok(res, { id: inv.id, status: inv.status, paid: inv.status === 'paid', total: inv.total, payment_ref: inv.payment_ref });
}));

// Kiểm tra kết nối thật tới VietQR (lấy token + tạo thử 1 QR)
router.post('/vietqr/test', requirePerm('settings.edit'), wrap(async (req, res) => {
  const s = vqrSettings();
  const env = s.vqr_env || 'mock';
  const out = { env, bases: bases(env), token_ok: false, qr_ok: false, message: '' };
  if (env === 'mock') {
    out.message = 'Đang ở chế độ mock — không gọi VietQR thật.';
    out.qr_ok = true;
    return ok(res, out);
  }
  if (!s.vqr_username || !s.vqr_password) { out.message = 'Thiếu Username/Password VietQR trong Cài đặt.'; return ok(res, out); }
  if (!s.bank_account || !s.vqr_bank_code) { out.message = 'Thiếu Số tài khoản nhận tiền hoặc Mã ngân hàng (MB/BIDV).'; return ok(res, out); }
  try { await getToken(s, req.tenant.code); out.token_ok = true; }
  catch (e) { out.message = 'Lỗi lấy token: ' + e.message; return ok(res, out); }
  try {
    const orderId = 'TEST' + String(Date.now()).slice(-8);
    const q = await generateQR(s, req.tenant.code, { amount: 1000, orderId, content: orderId });
    out.qr_ok = true;
    out.message = 'Kết nối OK — tạo được QR thử.';
    out.sample = { orderId, content: q.content, bankName: q.bankName, bankAccount: q.bankAccount };
  } catch (e) { out.message = 'Lỗi tạo QR: ' + e.message; }
  ok(res, out);
}));

// Giả lập thanh toán qua Test Callback của VietQR (chỉ môi trường dev)
router.post('/vietqr/simulate-dev', requirePerm('pos.sell'), wrap(async (req, res) => {
  if (process.env.NODE_ENV === 'production') return fail(res, 'Không khả dụng ở môi trường production', 403);
  const s = vqrSettings();
  if ((s.vqr_env || 'mock') !== 'dev') return fail(res, 'Chỉ dùng được ở môi trường dev');
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(Number(req.body.invoice_id));
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  if (!inv.payment_content) return fail(res, 'Chưa có mã QR — hãy tạo QR (chuyển khoản) trước');
  let token;
  try { token = await getToken(s, req.tenant.code); } catch (e) { return fail(res, e.message, 502); }
  const body = { bankAccount: s.bank_account, content: inv.payment_content, amount: String(inv.total), bankCode: s.vqr_bank_code, transType: 'C' };
  try {
    const r = await fetch(testCallbackUrl('dev'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    ok(res, { vietqr: j, invoice_id: inv.id, content: inv.payment_content });
  } catch (e) { fail(res, e.message, 502); }
}));

// Mô phỏng thanh toán để test (không cần VietQR thật)
router.post('/vietqr/simulate', requirePerm('pos.sell'), wrap((req, res) => {
  if (process.env.NODE_ENV === 'production') return fail(res, 'Không khả dụng ở môi trường production', 403);
  const id = Number(req.body.invoice_id);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  const s = vqrSettings();
  const r = processPayment(req.tenant.code, {
    transactionid: 'SIM-' + randId(), bankaccount: s.bank_account, amount: req.body.amount != null ? req.body.amount : inv.total,
    content: inv.payment_ref, orderId: inv.payment_ref, transType: 'C', raw: { simulated: true, at: new Date().toISOString() },
  });
  ok(res, r);
}));

/* ===================== Module: Giao dịch VietQR (hợp nhất QR đã tạo + callback) ===================== */
function txList(req, paged) {
  const from = str(req.query.from, 10) || today();
  const to = str(req.query.to, 10) || from;
  const bank = str(req.query.bank, 40);
  const field = ['ref', 'order', 'content'].includes(req.query.field) ? req.query.field : 'ref';
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = ['success', 'pending', 'unmatched', 'refund'].includes(req.query.status) ? req.query.status : '';
  const holder = (db.prepare("SELECT value FROM settings WHERE key='account_holder'").get() || {}).value || '';

  const qrOrders = getQrOrders(req.tenant.code, from, to);
  const txns = db.prepare(`SELECT id, transactionid, invoice_id, bank_account, amount, content, order_id, trans_type, matched, note, category, created_at
    FROM vietqr_transactions WHERE dup_of IS NULL AND date(created_at)>=date(?) AND date(created_at)<=date(?) ORDER BY id DESC LIMIT 3000`).all(from, to);

  const ids = [...new Set([...qrOrders.map((o) => o.invoice_id), ...txns.map((t) => t.invoice_id)].filter(Boolean))];
  const codeMap = new Map();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT id, code FROM invoices WHERE id IN (${ph})`).all(...ids)) codeMap.set(r.id, r.code);
  }

  const orderMap = new Map(qrOrders.map((o) => [o.order_id, o]));
  const rows = [];
  const used = new Set();
  for (const t of txns) {
    const st = t.trans_type === 'D' ? 'refund' : (t.category && t.category !== 'unclassified' ? 'success' : 'unmatched');
    if (t.order_id && orderMap.has(t.order_id)) used.add(t.order_id);
    rows.push({
      ref: t.transactionid || '', amount: Number(t.amount) || 0, time: t.created_at,
      bank_account: t.bank_account || '', account_holder: holder,
      content: t.content || '', type: t.trans_type === 'D' ? 'Hoàn tiền' : 'QR giao dịch',
      note: t.note || '', order_id: t.order_id || '',
      invoice_code: t.invoice_id ? (codeMap.get(t.invoice_id) || '') : '', status: st,
      id: t.id, category: t.category || 'unclassified',
    });
  }
  for (const o of qrOrders) {
    if (used.has(o.order_id)) continue;
    rows.push({
      ref: '', amount: Number(o.amount) || 0, time: o.created_at,
      bank_account: o.bank_account || '', account_holder: holder,
      content: o.content || '', type: 'QR giao dịch', note: '', order_id: o.order_id || '',
      invoice_code: o.invoice_id ? (codeMap.get(o.invoice_id) || '') : '', status: 'pending',
    });
  }
  rows.sort((a, b) => String(b.time).localeCompare(String(a.time)));

  const nbank = (v) => String(v || '').replace(/[\s.-]/g, '');
  let data = rows;
  if (bank) data = data.filter((r) => nbank(r.bank_account) === nbank(bank));
  if (status) data = data.filter((r) => r.status === status);
  if (q) data = data.filter((r) => {
    if (field === 'order') return String(r.order_id).toLowerCase().includes(q) || String(r.invoice_code).toLowerCase().includes(q);
    if (field === 'content') return String(r.content).toLowerCase().includes(q);
    return String(r.ref).toLowerCase().includes(q) || String(r.order_id).toLowerCase().includes(q);
  });

  const sum = (arr) => arr.reduce((s, r) => s + (r.amount || 0), 0);
  const by = (st) => data.filter((r) => r.status === st);
  const summary = {
    total_count: data.length, total_amount: sum(data.filter((r) => r.status !== 'refund')),
    success_count: by('success').length, success_amount: sum(by('success')),
    unmatched_count: by('unmatched').length, unmatched_amount: sum(by('unmatched')),
    pending_count: by('pending').length, pending_amount: sum(by('pending')),
    refund_count: by('refund').length, refund_amount: sum(by('refund')),
  };

  if (paged === false) return { from, to, summary, rows: data };
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(200, Math.max(5, Number(req.query.size) || 20));
  return { from, to, summary, items: data.slice((page - 1) * size, page * size), total: data.length, page, size };
}

router.get('/vietqr/transactions', requirePerm('report.view'), wrap((req, res) => ok(res, txList(req, true))));

router.get('/vietqr/transactions/export', requirePerm('report.export'), wrap((req, res) => {
  const { from, to, rows } = txList(req, false);
  const label = { success: 'Thành công', pending: 'Chờ thanh toán', unmatched: 'Chưa khớp', refund: 'Hoàn tiền' };
  const out = rows.map((r, i) => ({
    'STT': i + 1, 'Mã tham chiếu': r.ref, 'Số tiền': r.amount, 'Thời gian': r.time,
    'Tài khoản ngân hàng': r.bank_account, 'Chủ tài khoản': r.account_holder, 'Nội dung': r.content,
    'Loại giao dịch': r.type, 'Ghi chú': r.note, 'Mã đơn hàng': r.order_id, 'Hóa đơn': r.invoice_code,
    'Trạng thái': label[r.status] || r.status,
  }));
  sendXlsx(res, `giao-dich-vietqr-${from}_${to}`, out, { sheet: 'Giao dich VietQR' });
}));

/* ===================== Hàng chờ phân loại (GĐ3.2 — ERR-03, FR-08) ===================== */
// Giao dịch tiền vào chưa xác định được loại không vào báo cáo cho đến khi có người phân loại.
// Cửa hàng: gắn với hóa đơn đang chờ chuyển khoản cùng số tiền, hoặc ghi là "thu khác".
//   Quyền invoice.cancel (chủ, quản lý): gắn giao dịch = xác nhận đã nhận tiền, thu ngân không tự làm.
// Cộng đồng: thủ quỹ chọn quỹ để ghi sổ (sinh bút toán thu approved, bank_ref = mã giao dịch).
const auditOf = (req, action, id, detail) => audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username,
  action, entity: 'vietqr_transaction', entityId: id, detail: JSON.stringify(detail), ip: req.ip });
const getTxn = (id) => db.prepare("SELECT * FROM vietqr_transactions WHERE id=? AND dup_of IS NULL").get(Number(id));
const isCommunity = (req) => req.tenant && req.tenant.kind === 'community';
const classifyPerm = (req, res, next) => {
  const perm = isCommunity(req) ? 'fund.entry' : 'invoice.cancel';
  return requirePerm(perm)(req, res, next);
};

router.get('/vietqr/unclassified', classifyPerm, wrap((req, res) => {
  const items = db.prepare(`SELECT id, transactionid, bank_account, amount, content, order_id, note, created_at,
      CAST((julianday('now','localtime') - julianday(created_at)) AS INTEGER) AS age_days
    FROM vietqr_transactions WHERE dup_of IS NULL AND category='unclassified' AND trans_type='C' ORDER BY id DESC LIMIT 500`).all();
  // Gợi ý: hóa đơn chờ chuyển khoản cùng số tiền (cửa hàng) hoặc danh sách quỹ đang hoạt động (cộng đồng)
  const options = isCommunity(req)
    ? { funds: db.prepare("SELECT id, name, kind FROM funds WHERE status='active' ORDER BY id").all() }
    : { invoices: db.prepare(`SELECT id, code, total, customer_name, created_at FROM invoices
        WHERE type='sale' AND status='pending' ORDER BY id DESC LIMIT 200`).all() };
  ok(res, { items, ...options });
}));

router.post('/vietqr/transactions/:id/classify', classifyPerm, wrap((req, res) => {
  const t = getTxn(req.params.id);
  if (!t) return fail(res, 'Không tìm thấy giao dịch', 404);
  if (t.category !== 'unclassified' || t.trans_type !== 'C') return fail(res, 'Giao dịch đã được phân loại');
  const b = req.body || {};
  const by = req.user.full_name || req.user.username;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (isCommunity(req)) {
      const r = funds.bookUnclassified(req, t, Number(b.fund_id), by);
      db.prepare("UPDATE vietqr_transactions SET category=?, matched=1, note=?, classified_by=?, classified_at=datetime('now','localtime') WHERE id=?")
        .run(r.category, 'Đã ghi vào quỹ ' + r.fund.name, by, t.id);
      auditOf(req, 'vqr.classify', t.id, { transactionid: t.transactionid, fund_id: r.fund.id, entry: r.code });
    } else if (b.invoice_id) {
      const inv = db.prepare("SELECT * FROM invoices WHERE id=? AND type='sale'").get(Number(b.invoice_id));
      if (!inv) throw Object.assign(new Error('Không tìm thấy hóa đơn'), { code: 404 });
      if (inv.status !== 'pending') throw Object.assign(new Error('Chỉ gắn được với hóa đơn đang chờ chuyển khoản'), { code: 400 });
      if (inv.total !== t.amount) throw Object.assign(new Error(`Số tiền không khớp hóa đơn (giao dịch ${t.amount}, hóa đơn ${inv.total})`), { code: 400 });
      db.prepare("UPDATE invoices SET status='paid', paid_amount=total, change_amount=0 WHERE id=?").run(inv.id);
      if (!db.prepare('SELECT COUNT(*) c FROM invoice_payments WHERE invoice_id=?').get(inv.id).c) {
        db.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,?,?,?)').run(inv.id, 'transfer', inv.total, 'VietQR ' + t.transactionid + ' (phân loại tay)');
      }
      db.prepare("UPDATE vietqr_transactions SET category='sale', matched=1, invoice_id=?, note=?, classified_by=?, classified_at=datetime('now','localtime') WHERE id=?")
        .run(inv.id, 'Gắn hóa đơn ' + inv.code, by, t.id);
      auditOf(req, 'vqr.classify', t.id, { transactionid: t.transactionid, invoice: inv.code });
    } else if (b.category === 'sale') {
      // GĐ4.2: tiền vào qua QR tĩnh (không có mã đối soát) -> người bán xác nhận là bán hàng, kèm hạng mục.
      // Tạo hóa đơn đã thanh toán một dòng hàng tự do, nên báo cáo doanh thu / hạng mục / cộng đồng dùng lại được.
      const cat = b.item_category_id ? categoryFor(req, b.item_category_id) : null;
      if (b.item_category_id && !cat) throw Object.assign(new Error('Hạng mục không có trong danh mục của cộng đồng'), { code: 400 });
      const code = makeCode(db, getSettings().invoice_prefix || 'HD', 'invoices');
      const label = cat ? cat.name : 'Bán hàng (QR tĩnh)';
      const r = db.prepare(`INSERT INTO invoices(code,type,subtotal,discount,net_amount,total,payment_method,paid_amount,change_amount,note,status,item_category_id,item_category_name,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, 'sale', t.amount, 0, t.amount, t.amount, 'transfer', t.amount, 0,
        'Từ giao dịch ' + t.transactionid, 'paid', cat ? cat.id : null, cat ? cat.name : null, t.created_at);
      const invId = Number(r.lastInsertRowid);
      db.prepare(`INSERT INTO invoice_items(invoice_id,product_id,name,qty,base_qty,price,line_total) VALUES (?,?,?,?,?,?,?)`).run(invId, null, label, 1, 1, t.amount, t.amount);
      db.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,?,?,?)').run(invId, 'transfer', t.amount, 'VietQR ' + t.transactionid);
      db.prepare("UPDATE vietqr_transactions SET category='sale', matched=1, invoice_id=?, note=?, classified_by=?, classified_at=datetime('now','localtime') WHERE id=?")
        .run(invId, 'Bán hàng ' + code + (cat ? ' · ' + cat.name : ''), by, t.id);
      auditOf(req, 'vqr.classify', t.id, { transactionid: t.transactionid, category: 'sale', invoice: code, item_category: cat && cat.name });
    } else if (b.category === 'other') {
      const reason = str(b.reason, 300);
      if (!reason) throw Object.assign(new Error('Ghi lý do khi đánh dấu là thu khác'), { code: 400 });
      db.prepare("UPDATE vietqr_transactions SET category='other', note=?, classified_by=?, classified_at=datetime('now','localtime') WHERE id=?")
        .run('Thu khác: ' + reason, by, t.id);
      auditOf(req, 'vqr.classify', t.id, { transactionid: t.transactionid, category: 'other', reason });
    } else {
      throw Object.assign(new Error('Chọn hóa đơn để gắn, xác nhận là bán hàng, hoặc đánh dấu là thu khác'), { code: 400 });
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  ok(res, getTxn(t.id));
}));

// Cảnh báo tự kiểm của tenant (GĐ3.5): chủ / quản lý (report.view) và thủ quỹ (fund.view) xem
router.get('/alerts', (req, res, next) => (can(req, 'report.view') || can(req, 'fund.view') ? next() : fail(res, 'Không có quyền', 403)),
  wrap((req, res) => ok(res, openAlerts([req.tenant.code]))));

// Chuông thông báo: cảnh báo tự kiểm đang mở + thông báo vòng đời quỹ 14 ngày gần nhất.
// unread: mục mới hơn lần xem cuối của người dùng. Bấm "Đã xem" thì ghi mốc thời gian.
const ALERT_LINK = { unclassified_stale: 'unclassified', duplicate_txn: 'transactions', webhook_silent: 'transactions' };
router.get('/notifications', (req, res, next) => (can(req, 'report.view') || can(req, 'fund.view') ? next() : fail(res, 'Không có quyền', 403)),
  wrap((req, res) => {
    const seen = control.prepare('SELECT notices_seen_at FROM users WHERE id=?').get(req.user.id)?.notices_seen_at || '';
    const items = openAlerts([req.tenant.code]).map((a) => ({ id: 'a' + a.id, level: a.kind === 'webhook_silent' ? 'danger' : 'warn', kind: a.kind,
      message: a.message, at: a.last_seen_at || a.created_at, link: ALERT_LINK[a.kind] }));
    if (isCommunity(req)) {
      for (const n of db.prepare(`SELECT n.id, n.kind, n.message, n.created_at, n.fund_id FROM fund_notices n
          WHERE n.created_at >= datetime('now','localtime','-14 days') ORDER BY n.id DESC LIMIT 30`).all()) {
        items.push({ id: 'n' + n.id, level: 'info', kind: n.kind, message: n.message, at: n.created_at, link: 'fund', fund_id: n.fund_id });
      }
    }
    items.sort((x, y) => String(y.at).localeCompare(String(x.at)));
    for (const it of items) it.unread = String(it.at) > seen;
    ok(res, { items, unread: items.filter((x) => x.unread).length, danger: items.some((x) => x.level === 'danger'), seen_at: seen || null });
  }));
router.post('/notifications/seen', wrap((req, res) => {
  control.prepare("UPDATE users SET notices_seen_at=datetime('now','localtime') WHERE id=?").run(req.user.id);
  ok(res, { seen: true });
}));

module.exports = { router, webhook, processPayment };
