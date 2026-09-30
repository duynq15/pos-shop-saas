'use strict';

// Sổ quỹ cộng đồng (GĐ2.1–2.2 — FR-04, FR-12 → FR-15, BR-03, BR-04, BR-05, SEC-04, ERR-06).
// Chỉ tenant kind=community dùng. Khoản thu ghi sổ ngay; khoản chi và điều chỉnh đi luồng
// draft → submitted → approved / rejected, người duyệt khác người lập, tồn quỹ không được âm.
const express = require('express');
const db = require('../db');
const { control, audit } = require('../control');
const { ok, fail, wrap, bad, int, str, round } = require('../lib/util');
const { makeCode } = require('../lib/codes');
const { bankAccountOf } = require('../lib/community');
const { requirePerm } = require('../middleware');
const { generateQR } = require('../payments/vietqr');
const { vqrSettings } = require('../lib/vqr-settings');

const router = express.Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = { in: 'PT', out: 'PC', adjust: 'DC' };
const normAccount = (v) => String(v || '').replace(/[\s.-]/g, '');

router.use('/funds', (req, res, next) => {
  if (!req.tenant || req.tenant.kind !== 'community') return fail(res, 'Sổ quỹ chỉ dành cho tài khoản cộng đồng', 403);
  next();
});

const log = (req, action, entity, id, detail) => audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username,
  action, entity, entityId: id, detail: detail ? JSON.stringify(detail) : null, ip: req.ip });

// Tồn quỹ = thu − chi ± điều chỉnh, chỉ tính bút toán đã duyệt
const BALANCE = `COALESCE(SUM(CASE WHEN status='approved' THEN CASE type WHEN 'out' THEN -amount ELSE amount END END),0)`;
const balanceOf = (fundId) => Number(db.prepare(`SELECT ${BALANCE} b FROM fund_entries WHERE fund_id=?`).get(fundId).b);
const getFund = (id) => {
  const f = db.prepare('SELECT * FROM funds WHERE id=?').get(Number(id));
  return f ? { ...f, balance: balanceOf(f.id) } : null;
};
const getEntry = (id) => db.prepare('SELECT * FROM fund_entries WHERE id=?').get(Number(id));

// Tài khoản nhận của quỹ phải riêng: không trùng tài khoản của bất kỳ tenant nào, không trùng quỹ khác (quyết định 0.3, BR-02).
// ponytail: quét DB mọi tenant cộng đồng mỗi lần lưu; đủ cho vài chục thôn, nhiều hơn thì đưa tài khoản quỹ lên control.db.
function fundAccountTaken(account, selfFundId) {
  const acc = normAccount(account);
  if (!acc) return null;
  const tenants = control.prepare('SELECT code, kind FROM tenants').all();
  for (const t of tenants) if (normAccount(bankAccountOf(t.code)) === acc) return t.code;
  for (const t of tenants.filter((x) => x.kind === 'community')) {
    const hit = db.runWith(t.code, (conn) => conn.prepare('SELECT id, bank_account FROM funds').all())
      .find((f) => normAccount(f.bank_account) === acc && !(t.code === db.tenantCode && f.id === selfFundId));
    if (hit) return t.code;
  }
  return null;
}

function fundInput(b, current = {}) {
  const v = {
    name: b.name !== undefined ? str(b.name, 160) : current.name,
    kind: b.kind !== undefined ? b.kind : current.kind || 'general',
    bank_account: b.bank_account !== undefined ? normAccount(str(b.bank_account, 40)) || null : current.bank_account ?? null,
    bank_bin: b.bank_bin !== undefined ? str(b.bank_bin, 20) || null : current.bank_bin ?? null,
    bank_name: b.bank_name !== undefined ? str(b.bank_name, 80) || null : current.bank_name ?? null,
    account_holder: b.account_holder !== undefined ? str(b.account_holder, 120) || null : current.account_holder ?? null,
    manager_user_id: b.manager_user_id !== undefined ? (b.manager_user_id ? Number(b.manager_user_id) : null) : current.manager_user_id ?? null,
    description: b.description !== undefined ? str(b.description, 1000) || null : current.description ?? null,
    start_date: b.start_date !== undefined ? b.start_date || null : current.start_date ?? null,
    end_date: b.end_date !== undefined ? b.end_date || null : current.end_date ?? null,
    status: b.status !== undefined ? b.status : current.status || 'active',
  };
  if (!v.name) bad('Tên quỹ không được để trống');
  if (!['general', 'donation'].includes(v.kind)) bad('Loại quỹ không hợp lệ');
  if (!['active', 'closed'].includes(v.status)) bad('Trạng thái quỹ không hợp lệ');
  for (const d of [v.start_date, v.end_date]) if (d && !DAY.test(d)) bad('Ngày không hợp lệ');
  if (v.start_date && v.end_date && v.start_date > v.end_date) bad('Ngày kết thúc phải sau ngày bắt đầu');
  return v;
}

function checkManager(req, userId) {
  if (userId && !control.prepare('SELECT 1 FROM users WHERE id=? AND tenant_id=?').get(userId, req.user.tenant_id)) bad('Người phụ trách không thuộc cộng đồng này');
}

/* ===================== QUỸ ===================== */
router.get('/funds', requirePerm('fund.view'), wrap((req, res) => {
  ok(res, db.prepare(`SELECT f.*, (SELECT ${BALANCE} FROM fund_entries WHERE fund_id=f.id) balance FROM funds f ORDER BY f.status, f.id`).all());
}));

router.get('/funds/:id', requirePerm('fund.view'), wrap((req, res) => {
  const f = getFund(req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  ok(res, f);
}));

router.post('/funds', requirePerm('fund.manage'), wrap((req, res) => {
  const b = req.body || {};
  const code = str(b.code, 30).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(code)) bad('Mã quỹ gồm 2–30 ký tự a-z, 0-9, dấu gạch ngang');
  if (db.prepare('SELECT 1 FROM funds WHERE code=?').get(code)) bad('Mã quỹ đã tồn tại');
  const v = fundInput(b);
  checkManager(req, v.manager_user_id);
  if (fundAccountTaken(v.bank_account)) bad('Tài khoản nhận của quỹ phải là tài khoản riêng, không trùng cửa hàng hay quỹ khác (BR-02)');
  const r = db.prepare(`INSERT INTO funds(code,name,kind,bank_account,bank_bin,bank_name,account_holder,manager_user_id,description,start_date,end_date,status,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, v.name, v.kind, v.bank_account, v.bank_bin, v.bank_name, v.account_holder, v.manager_user_id, v.description, v.start_date, v.end_date, v.status, req.user.id);
  const f = getFund(r.lastInsertRowid);
  log(req, 'fund.create', 'fund', f.id, { code, name: v.name });
  ok(res, f);
}));

router.patch('/funds/:id', requirePerm('fund.manage'), wrap((req, res) => {
  const cur = getFund(req.params.id);
  if (!cur) return fail(res, 'Không tìm thấy quỹ', 404);
  const v = fundInput(req.body || {}, cur);
  checkManager(req, v.manager_user_id);
  if (v.bank_account !== cur.bank_account && fundAccountTaken(v.bank_account, cur.id)) bad('Tài khoản nhận của quỹ phải là tài khoản riêng, không trùng cửa hàng hay quỹ khác (BR-02)');
  db.prepare(`UPDATE funds SET name=?,kind=?,bank_account=?,bank_bin=?,bank_name=?,account_holder=?,manager_user_id=?,description=?,start_date=?,end_date=?,status=? WHERE id=?`)
    .run(v.name, v.kind, v.bank_account, v.bank_bin, v.bank_name, v.account_holder, v.manager_user_id, v.description, v.start_date, v.end_date, v.status, cur.id);
  log(req, 'fund.update', 'fund', cur.id, req.body);
  ok(res, getFund(cur.id));
}));

/* ===================== QR (GĐ2.3 — reuse generateQR, tài khoản quỹ luôn riêng theo BR-02) ===================== */
function fundQrSettings(f) {
  return { ...vqrSettings(), bank_account: f.bank_account, bank_bin: f.bank_bin, bank_name: f.bank_name || '' };
}

// QR tĩnh để in dán: không mã hóa số tiền.
router.get('/funds/:id/qr', requirePerm('fund.view'), wrap(async (req, res) => {
  const f = getFund(req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (!f.bank_account || !f.bank_bin) bad('Quỹ chưa cấu hình tài khoản ngân hàng (số tài khoản + mã ngân hàng)');
  const q = await generateQR(fundQrSettings(f), req.tenant.code, { content: f.name });
  ok(res, { ...q, fund_id: f.id, bank_name: f.bank_name, account_holder: f.account_holder });
}));

// QR động yêu cầu một số tiền cụ thể. Không tạo bút toán trước; chỉ ghi sổ khi tiền thật về (webhook).
router.post('/funds/:id/qr', requirePerm('fund.entry'), wrap(async (req, res) => {
  const f = getFund(req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (f.status !== 'active') bad('Quỹ đã đóng');
  if (!f.bank_account || !f.bank_bin) bad('Quỹ chưa cấu hình tài khoản ngân hàng (số tài khoản + mã ngân hàng)');
  const amount = int((req.body || {}).amount);
  if (amount <= 0) bad('Số tiền không hợp lệ');
  const q = await generateQR(fundQrSettings(f), req.tenant.code, { amount, content: f.name });
  ok(res, { ...q, fund_id: f.id, amount });
}));

/* ===================== BÚT TOÁN ===================== */
router.get('/funds/:id/entries', requirePerm('fund.view'), wrap((req, res) => {
  const f = getFund(req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  const q = req.query;
  const where = ['fund_id=?']; const args = [f.id];
  if (DAY.test(q.from || '')) { where.push('date(created_at)>=date(?)'); args.push(q.from); }
  if (DAY.test(q.to || '')) { where.push('date(created_at)<=date(?)'); args.push(q.to); }
  if (PREFIX[q.type]) { where.push('type=?'); args.push(q.type); }
  if (['draft', 'submitted', 'approved', 'rejected'].includes(q.status)) { where.push('status=?'); args.push(q.status); }
  ok(res, { fund: f, entries: db.prepare(`SELECT * FROM fund_entries WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 1000`).all(...args) });
}));

// Thủ quỹ nhập: thu tiền mặt / chuyển khoản ngân hàng ngoài (ghi sổ ngay), lập phiếu chi hoặc điều chỉnh (nháp).
// Nguồn vietqr chỉ đến từ webhook (GĐ2.4), không nhập tay.
router.post('/funds/:id/entries', requirePerm('fund.entry'), wrap((req, res) => {
  const f = getFund(req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (f.status !== 'active') bad('Quỹ đã đóng, không ghi thêm bút toán');
  const b = req.body || {};
  const type = b.type;
  if (!PREFIX[type]) bad('Loại bút toán không hợp lệ');
  const amount = int(b.amount);
  if (type === 'adjust' ? amount === 0 : amount <= 0) bad('Số tiền không hợp lệ');
  const source = type === 'in' ? b.source || 'cash' : 'cash';
  if (!['cash', 'manual'].includes(source)) bad('Nguồn thu không hợp lệ');
  const note = str(b.note, 500) || null;
  let ref = null;
  if (type === 'adjust') {
    ref = getEntry(b.ref_entry_id);
    if (!ref || ref.fund_id !== f.id || ref.status !== 'approved') bad('Điều chỉnh phải trỏ tới một bút toán đã ghi sổ của quỹ này');
    if (!note) bad('Điều chỉnh phải ghi lý do');
  }
  const status = type === 'in' ? 'approved' : 'draft';
  const bankRef = type === 'in' && source === 'manual' ? str(b.bank_ref, 80) || null : null;
  if (bankRef && db.prepare('SELECT 1 FROM fund_entries WHERE bank_ref=?').get(bankRef)) bad('Giao dịch ngân hàng này đã được ghi sổ');
  const now = status === 'approved' ? "datetime('now','localtime')" : 'NULL';
  const r = db.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,payer_name,anonymous,note,ref_entry_id,status,created_by,created_by_name,approved_by,approved_by_name,approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${now})`).run(
    makeCode(db, PREFIX[type], 'fund_entries'), f.id, type, amount, source, bankRef,
    type === 'in' ? str(b.payer_name, 120) || null : null, type === 'in' && b.anonymous ? 1 : 0, note, ref ? ref.id : null, status,
    req.user.id, req.user.full_name || req.user.username,
    status === 'approved' ? req.user.id : null, status === 'approved' ? req.user.full_name || req.user.username : null);
  const e = getEntry(r.lastInsertRowid);
  log(req, 'fund_entry.create', 'fund_entry', e.id, { code: e.code, type, amount });
  ok(res, e);
}));

function transition(req, res, from, fn) {
  const e = getEntry(req.params.id);
  if (!e) return fail(res, 'Không tìm thấy bút toán', 404);
  if (e.status !== from) bad('Bút toán không ở trạng thái cho phép thao tác này');
  fn(e);
  ok(res, getEntry(e.id));
}

router.post('/fund-entries/:id/submit', requirePerm('fund.entry'), wrap((req, res) => transition(req, res, 'draft', (e) => {
  if (e.created_by !== req.user.id) bad('Chỉ người lập được gửi duyệt');
  db.prepare("UPDATE fund_entries SET status='submitted' WHERE id=?").run(e.id);
  log(req, 'fund_entry.submit', 'fund_entry', e.id);
})));

router.post('/fund-entries/:id/approve', requirePerm('fund.approve'), wrap((req, res) => transition(req, res, 'submitted', (e) => {
  if (e.created_by === req.user.id) bad('Người duyệt phải khác người lập (ERR-06)', 403);
  const delta = e.type === 'out' ? -e.amount : e.amount;
  // Kiểm tồn và ghi sổ trong cùng giao dịch để hai lần duyệt đồng thời không cùng lọt
  db.exec('BEGIN IMMEDIATE');
  try {
    const bal = balanceOf(e.fund_id);
    if (delta < 0 && bal + delta < 0) bad(`Khoản chi vượt tồn quỹ (tồn ${bal.toLocaleString('vi-VN')} ₫)`);
    db.prepare("UPDATE fund_entries SET status='approved', approved_by=?, approved_by_name=?, approved_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.id, req.user.full_name || req.user.username, e.id);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  log(req, 'fund_entry.approve', 'fund_entry', e.id, { amount: e.amount, type: e.type });
})));

router.post('/fund-entries/:id/reject', requirePerm('fund.approve'), wrap((req, res) => transition(req, res, 'submitted', (e) => {
  if (e.created_by === req.user.id) bad('Người duyệt phải khác người lập (ERR-06)', 403);
  const reason = str((req.body || {}).reason, 500);
  if (!reason) bad('Phải ghi lý do từ chối');
  db.prepare("UPDATE fund_entries SET status='rejected', approved_by=?, approved_by_name=?, approved_at=datetime('now','localtime'), reject_reason=? WHERE id=?")
    .run(req.user.id, req.user.full_name || req.user.username, reason, e.id);
  log(req, 'fund_entry.reject', 'fund_entry', e.id, { reason });
})));

/* ===================== Webhook VietQR (dùng bởi src/routes/vietqr.js) ===================== */
// Tài khoản của quỹ luôn duy nhất toàn hệ thống (BR-02), nên tài khoản đủ để xác định
// tenant + quỹ, không cần bảng theo dõi đơn hàng như luồng hóa đơn.
function resolveFundByBank(account) {
  const acc = normAccount(account);
  if (!acc) return null;
  for (const t of control.prepare("SELECT code FROM tenants WHERE kind='community'").all()) {
    const hit = db.runWith(t.code, (conn) => conn.prepare('SELECT id FROM funds WHERE bank_account=?').get(acc));
    if (hit) return { tenantCode: t.code, fundId: hit.id };
  }
  return null;
}

// p: { transactionid, bankaccount, amount, content, transType, raw }. Khoản thu ghi sổ ngay (approved),
// khớp nguyên tắc đã chốt ở GĐ2.1: tiền đã về quỹ thì ghi nhận luôn, không qua duyệt.
function processFundPayment(code, fundId, p) {
  return db.runWith(code, () => {
    const txnId = str(p.transactionid, 80) || 'AUTO-' + Date.now();
    const amount = round(p.amount);
    const bank = str(p.bankaccount, 40);
    const content = str(p.content, 60);
    const transType = str(p.transType, 2) || 'C';
    const raw = JSON.stringify(p.raw || {});
    if (db.prepare('SELECT 1 FROM vietqr_transactions WHERE transactionid=?').get(txnId)) {
      return { ref: '', message: 'Giao dịch đã xử lý trước đó', paid: true };
    }
    const insTxn = db.prepare(`INSERT INTO vietqr_transactions(transactionid,invoice_id,bank_account,amount,content,order_id,trans_type,matched,note,raw_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const f = getFund(fundId);
    if (!f || f.status !== 'active') {
      insTxn.run(txnId, null, bank, amount, content, '', transType, 0, 'Quỹ không hoạt động', raw);
      return { ref: '', message: 'Quỹ không hoạt động', paid: false };
    }
    if (transType !== 'C') {
      insTxn.run(txnId, null, bank, amount, content, '', transType, 0, 'Không phải giao dịch tiền vào', raw);
      return { ref: '', message: 'Không phải giao dịch tiền vào', paid: false };
    }
    const entryCode = makeCode(db, 'PT', 'fund_entries');
    db.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,note,status,created_by_name,approved_by_name,approved_at)
      VALUES (?,?,'in',?,'vietqr',?,?,'approved',?,?,datetime('now','localtime'))`)
      .run(entryCode, f.id, amount, txnId, content, 'VietQR', 'Hệ thống (VietQR)');
    insTxn.run(txnId, null, bank, amount, content, '', transType, 1, 'Đã ghi vào quỹ ' + f.name, raw);
    return { ref: entryCode, message: 'Đã ghi vào quỹ ' + f.name, paid: true };
  });
}

module.exports = router;
module.exports.resolveFundByBank = resolveFundByBank;
module.exports.processFundPayment = processFundPayment;
