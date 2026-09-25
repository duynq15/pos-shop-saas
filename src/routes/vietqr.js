'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { control } = require('../control');
const { ok, fail, wrap, str, round } = require('../lib/util');
const { requirePerm } = require('../middleware');
const { generateQR, getToken, bases } = require('../payments/vietqr');

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
    const txnId = str(p.transactionid, 80) || 'AUTO-' + Date.now();
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
    const ins = db.prepare(`INSERT INTO vietqr_transactions(transactionid,invoice_id,bank_account,amount,content,order_id,trans_type,matched,note,raw_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);

    if (!inv) {
      ins.run(txnId, null, bank, amount, content, orderId, transType, 0, 'Không tìm thấy hóa đơn', raw);
      return { ref: '', message: 'Không tìm thấy hóa đơn theo mã đối soát', paid: false };
    }
    if (inv.status === 'paid') {
      ins.run(txnId, inv.id, bank, amount, content, orderId, transType, 1, 'Hóa đơn đã thanh toán trước đó', raw);
      return { ref: orderId, message: 'Hóa đơn đã thanh toán', paid: true };
    }
    if (amount !== inv.total) {
      ins.run(txnId, inv.id, bank, amount, content, orderId, transType, 0, `Số tiền không khớp (nhận ${amount}, cần ${inv.total})`, raw);
      return { ref: orderId, message: `Số tiền không khớp (nhận ${amount}, cần ${inv.total})`, paid: false, mismatch: true };
    }
    db.prepare("UPDATE invoices SET status='paid', paid_amount=total, change_amount=0 WHERE id=?").run(inv.id);
    const hasPay = db.prepare('SELECT COUNT(*) c FROM invoice_payments WHERE invoice_id=?').get(inv.id).c;
    if (!hasPay) db.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,?,?,?)').run(inv.id, 'transfer', inv.total, 'VietQR ' + txnId);
    ins.run(txnId, inv.id, bank, amount, content, orderId, transType, 1, 'Đã thanh toán', raw);
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
  if (!pl) return res.status(401).json({ error: true, errorReason: 'INVALID_TOKEN', toastMessage: 'Invalid or expired token', object: null });
  const b = req.body || {};
  const code = pl.t || resolveTenantByBank(b.bankaccount);
  if (!code) return res.status(400).json({ error: true, errorReason: 'TENANT_NOT_FOUND', toastMessage: 'Không xác định được cửa hàng theo tài khoản nhận tiền', object: null });
  try {
    const r = processPayment(code, { transactionid: b.transactionid, bankaccount: b.bankaccount, amount: b.amount, content: b.content, orderId: b.orderId, transType: b.transType, raw: b });
    res.json({ error: false, errorReason: null, toastMessage: r.message, object: { reftransactionid: r.ref } });
  } catch (e) {
    res.status(400).json({ error: true, errorReason: 'TRANSACTION_FAILED', toastMessage: e.message, object: null });
  }
}));

/* ===================== API phía app ===================== */
router.get('/vietqr/config', wrap((req, res) => {
  const s = readSettings();
  ok(res, {
    enabled: s.vqr_enabled === '1', env: s.vqr_env || 'mock',
    bank_code: s.vqr_bank_code || '', bank_account: s.bank_account || '', account_holder: s.account_holder || '',
    terminal_code: s.vqr_terminal_code || '', exposed_username: s.vqr_exposed_username || '',
    has_credentials: !!(s.vqr_username && s.vqr_password),
  });
}));

// Tạo QR động cho hóa đơn
router.post('/invoices/:id/vietqr', requirePerm('invoice.view'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const s = readSettings();
  if (s.vqr_enabled !== '1') fail(res, 'VietQR động chưa bật trong Cài đặt');
  let inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  if (!inv.payment_ref) {
    const { nextPaymentRef } = require('../lib/codes');
    inv.payment_ref = nextPaymentRef(db);
    db.prepare('UPDATE invoices SET payment_ref=? WHERE id=?').run(inv.payment_ref, id);
  }
  try {
    const q = await generateQR(s, req.tenant.code, { amount: inv.total, orderId: inv.payment_ref, content: inv.payment_ref });
    ok(res, { ...q, invoice_id: id, total: inv.total, payment_ref: inv.payment_ref, status: inv.status });
  } catch (e) { fail(res, e.message, 502); }
}));

router.get('/invoices/:id/payment-status', requirePerm('invoice.view'), wrap((req, res) => {
  const inv = db.prepare('SELECT id,status,total,paid_amount,payment_ref FROM invoices WHERE id=?').get(Number(req.params.id));
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  ok(res, { id: inv.id, status: inv.status, paid: inv.status === 'paid', total: inv.total, payment_ref: inv.payment_ref });
}));

// Kiểm tra kết nối thật tới VietQR (lấy token + tạo thử 1 QR)
router.post('/vietqr/test', requirePerm('settings.edit'), wrap(async (req, res) => {
  const s = readSettings();
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

// Mô phỏng thanh toán để test (không cần VietQR thật)
router.post('/vietqr/simulate', requirePerm('pos.sell'), wrap((req, res) => {
  const id = Number(req.body.invoice_id);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  const s = readSettings();
  const r = processPayment(req.tenant.code, {
    transactionid: 'SIM-' + randId(), bankaccount: s.bank_account, amount: req.body.amount != null ? req.body.amount : inv.total,
    content: inv.payment_ref, orderId: inv.payment_ref, transType: 'C', raw: { simulated: true, at: new Date().toISOString() },
  });
  ok(res, r);
}));

module.exports = { router, webhook, processPayment };
