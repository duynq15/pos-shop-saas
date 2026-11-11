'use strict';

// Sổ quỹ cộng đồng (GĐ2.1–2.2 — FR-04, FR-12 → FR-15, BR-03, BR-04, BR-05, SEC-04, ERR-06).
// Chỉ tenant kind=community dùng. Khoản thu ghi sổ ngay; khoản chi và điều chỉnh đi luồng
// draft → submitted → approved / rejected, người duyệt khác người lập, tồn quỹ không được âm.
const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const { control, audit } = require('../control');
const { ok, fail, wrap, bad, int, str, bool, round, today } = require('../lib/util');
const { makeCode } = require('../lib/codes');
const { normAccount, bankAccountOf, fundByAccount } = require('../lib/community');

const { requirePerm, can } = require('../middleware');
const QRCode = require('qrcode');
const { buildVietQR, removeVietnamese } = require('../lib/vietqr');
const { sendXlsx, readXlsx } = require('../lib/xlsx');
const { bankTime } = require('../lib/vqr-time');

const router = express.Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = { in: 'PT', out: 'PC', adjust: 'DC' };
// Trần mỗi bút toán: 100 tỷ đồng. Giữ tổng trong vùng số nguyên an toàn của JS và SQLite, chặn số gõ nhầm.
const MAX_AMOUNT = 100_000_000_000;
const amountOk = (n, signedOk) => Number.isSafeInteger(n) && Math.abs(n) <= MAX_AMOUNT && (signedOk ? n !== 0 : n > 0);
// Cách đóng: mức mỗi hộ / mỗi nhân khẩu / tùy tâm (không mức) / tổng cần huy động
const CONTRIBUTION = ['household', 'person', 'voluntary', 'goal'];
// Tính chất quỹ: bắt buộc (theo nghị quyết thôn / pháp luật), vận động, tự nguyện
const NATURES = ['mandatory', 'campaign', 'voluntary'];
const NOT_COLLECTING = 'Quỹ đang ngừng thu. Mở thu lại nếu cần thu thêm';
const LOCKED_MSG = 'Quỹ đã khoá sổ: không thu, không chi. Sửa sai cần đề nghị mở khoá sổ';

// Mã quỹ tự sinh từ tên (người dùng không phải nghĩ mã): "Quỹ khuyến học 2026" -> quy-khuyen-hoc-2026, trùng thì thêm -2, -3…
function fundCode(name) {
  const base = removeVietnamese(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 26).replace(/-+$/, '') || 'quy';
  let code = base.length >= 2 ? base : 'quy-' + base;
  for (let i = 2; db.prepare('SELECT 1 FROM funds WHERE code=?').get(code); i++) code = `${base}-${i}`;
  return code;
}

// Ngày thu nhập tay (vào sổ cũ): YYYY-MM-DD, không ở tương lai. Trả chuỗi giờ địa phương để ghi created_at/approved_at.
function entryDate(d) {
  if (d == null || d === '' || d === today()) return null;
  const t = new Date(d + 'T00:00:00Z');
  if (!DAY.test(d) || Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d) bad('Ngày thu không hợp lệ'); // chặn cả 30/02
  if (d > today()) bad('Ngày thu không được ở tương lai');
  return d + ' 12:00:00';
}

// Mọi route sổ quỹ chỉ cho tenant cộng đồng (trước đây /fund-entries lọt khỏi chốt này).
router.use(['/funds', '/fund-entries', '/fund-treasurers', '/fund-notices', '/fund-documents', '/fund-requests'], (req, res, next) => {
  if (!req.tenant || req.tenant.kind !== 'community') return fail(res, 'Sổ quỹ chỉ dành cho tài khoản cộng đồng', 403);
  next();
});

const log = (req, action, entity, id, detail) => audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username,
  action, entity, entityId: id, detail: detail ? JSON.stringify(detail) : null, ip: req.ip });

// Tồn quỹ = thu − chi ± điều chỉnh, chỉ tính bút toán đã duyệt
const BALANCE = `COALESCE(SUM(CASE WHEN status='approved' THEN CASE type WHEN 'out' THEN -amount ELSE amount END END),0)`;
const balanceOf = (fundId) => Number(db.prepare(`SELECT ${BALANCE} b FROM fund_entries WHERE fund_id=?`).get(fundId).b);
const managerName = (userId) => {
  if (!userId) return null;
  const u = control.prepare('SELECT full_name, username FROM users WHERE id=?').get(userId);
  return u ? (u.full_name || u.username) : null;
};
// state: collecting (Đang thu) | stopped (Ngừng thu) | locked (Khoá sổ); transfer_content = nội dung chuyển khoản của đợt hiện tại
const withState = (f) => ({ ...f, state: stateOf(f), state_label: STATE_LABEL[stateOf(f)], transfer_content: transferRef(f) });
const getFund = (id) => {
  const f = db.prepare('SELECT * FROM funds WHERE id=?').get(Number(id));
  return f ? withState({ ...f, balance: balanceOf(f.id), manager_name: managerName(f.manager_user_id) }) : null;
};
const getEntry = (id) => db.prepare('SELECT * FROM fund_entries WHERE id=?').get(Number(id));

// Ảnh chứng từ (GĐ2.5 — dữ liệu base64 trong body JSON, không thêm thư viện multipart).
const ATTACH_MAX = 5 * 1024 * 1024; // 5MB sau giải mã
// Nhận diện loại ảnh theo byte đầu file, không tin kiểu do trình duyệt khai.
function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
// Tên file theo mã chứng từ + số lần sửa, để bản ảnh cũ của phiếu nháp không bị ghi đè mất dấu.
function saveAttachment(dataUrl, code) {
  const m = /^data:image\/[a-z]+;base64,([a-zA-Z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) bad('Ảnh chứng từ không hợp lệ');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > ATTACH_MAX) bad('Ảnh chứng từ tối đa 5MB');
  const ext = imageExt(buf);
  if (!ext) bad('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
  const dir = path.join(db.DATA_DIR, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${code}-${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return filename;
}

// Tài liệu của quỹ (nghị quyết, tờ trình, biên bản…): PDF, ảnh, Word, Excel. Nhận diện theo byte đầu file, không tin đuôi file.
const DOC_MAX = 10 * 1024 * 1024;
function docType(buf, name) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return ['pdf', 'application/pdf'];
  const img = imageExt(buf);
  if (img) return [img, 'image/' + (img === 'jpg' ? 'jpeg' : img)];
  const ext = (String(name).toLowerCase().match(/\.(docx|xlsx|doc|xls)$/) || [])[1];
  if (buf.readUInt32LE(0) === 0x04034b50 && (ext === 'docx' || ext === 'xlsx')) {
    return [ext, ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  }
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && (ext === 'doc' || ext === 'xls')) {
    return [ext, ext === 'doc' ? 'application/msword' : 'application/vnd.ms-excel'];
  }
  return null;
}
// file: { name, data } với data là data URL / base64
function saveDocument(req, fundId, file, kind = 'doc', fallbackName = 'Tài liệu') {
  const buf = Buffer.from(String(file?.data || '').replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length) bad('Tệp đính kèm trống');
  if (buf.length > DOC_MAX) bad('Tệp tối đa 10MB');
  const t = docType(buf, file?.name);
  if (!t) bad('Chỉ nhận PDF, ảnh (JPG, PNG, WebP), Word hoặc Excel');
  const dir = path.join(db.DATA_DIR, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `DOC-${fundId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${t[0]}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  const name = str(file?.name, 160).replace(/[\\/]/g, '_') || `${fallbackName}.${t[0]}`;
  const r = db.prepare('INSERT INTO fund_documents(fund_id,kind,name,filename,mime,size,created_by_name) VALUES (?,?,?,?,?,?,?)')
    .run(fundId, kind, name, filename, t[1], buf.length, byName(req));
  return db.prepare('SELECT * FROM fund_documents WHERE id=?').get(r.lastInsertRowid);
}
function sendDocument(res, d) {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Type': d.mime,
    'Content-Disposition': `${d.mime === 'application/pdf' || d.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.name)}` });
  res.sendFile(path.join(db.DATA_DIR, 'attachments', d.filename), { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ ok: false, error: 'Không tìm thấy tệp' });
  });
}
const docsOf = (fundId) => db.prepare('SELECT id, kind, name, mime, size, created_by_name, created_at FROM fund_documents WHERE fund_id=? ORDER BY kind, id').all(fundId);

// Tài khoản nhận của quỹ phải riêng: không trùng tài khoản của bất kỳ tenant nào, không trùng quỹ khác (quyết định 0.3, BR-02).
function fundAccountTaken(account, selfFundId) {
  if (!normAccount(account)) return false;
  const others = control.prepare('SELECT code FROM tenants').all();
  return others.some((t) => normAccount(bankAccountOf(t.code)) === normAccount(account))
    || !!fundByAccount(account, { tenantCode: db.tenantCode, fundId: selfFundId });
}

function fundInput(b, current = {}) {
  const v = {
    name: b.name !== undefined ? str(b.name, 160) : current.name,
    // kind chỉ còn dùng để phân loại giao dịch VietQR (fund/donation); suy từ loại quỹ khi client không gửi
    kind: b.kind !== undefined ? b.kind : b.fund_type !== undefined ? (/công đức|cong duc/i.test(String(b.fund_type)) ? 'donation' : 'general') : current.kind || 'general',
    category: b.category !== undefined ? str(b.category, 80) || null : current.category ?? null,
    fund_type: b.fund_type !== undefined ? str(b.fund_type, 80) || null : current.fund_type ?? null,
    contribution: b.contribution !== undefined ? b.contribution : current.contribution || 'household',
    target_amount: b.target_amount !== undefined
      ? (b.target_amount === '' || b.target_amount === null ? null : int(b.target_amount))
      : current.target_amount ?? null,
    // Quỹ công đức tạo mới qua API mà không nói gì về công khai thì công khai như trước
    is_public: b.is_public !== undefined ? (b.is_public ? 1 : 0) : (current.is_public ?? (b.kind === 'donation' ? 1 : 0)),
    bank_account: b.bank_account !== undefined ? normAccount(str(b.bank_account, 40)) || null : current.bank_account ?? null,
    bank_bin: b.bank_bin !== undefined ? str(b.bank_bin, 20) || null : current.bank_bin ?? null,
    bank_name: b.bank_name !== undefined ? str(b.bank_name, 80) || null : current.bank_name ?? null,
    account_holder: b.account_holder !== undefined ? str(b.account_holder, 120) || null : current.account_holder ?? null,
    manager_user_id: b.manager_user_id !== undefined ? (b.manager_user_id ? Number(b.manager_user_id) : null) : current.manager_user_id ?? null,
    description: b.description !== undefined ? str(b.description, 1000) || null : current.description ?? null,
    // Nội dung chi tiết (văn bản dài, xuống dòng giữ nguyên); file đính kèm ở fund_documents
    content: b.content !== undefined ? str(b.content, 20000) || null : current.content ?? null,
    nature: b.nature !== undefined ? b.nature || null : current.nature ?? null,
    transfer_code: b.transfer_code !== undefined ? removeVietnamese(str(b.transfer_code, 18)).toUpperCase().replace(/[^A-Z0-9]/g, '') || null : current.transfer_code ?? null,
    start_date: b.start_date !== undefined ? b.start_date || null : current.start_date ?? null,
    end_date: b.end_date !== undefined ? b.end_date || null : current.end_date ?? null,
    status: b.status !== undefined ? b.status : current.status || 'active',
  };
  if (!v.name) bad('Tên quỹ không được để trống');
  if (!['general', 'donation'].includes(v.kind)) bad('Loại quỹ không hợp lệ');
  if (!['active', 'closed'].includes(v.status)) bad('Trạng thái quỹ không hợp lệ');
  if (!CONTRIBUTION.includes(v.contribution)) bad('Cách đóng không hợp lệ');
  if (v.nature && !NATURES.includes(v.nature)) bad('Tính chất quỹ phải là Bắt buộc, Vận động hoặc Tự nguyện');
  if (v.contribution === 'voluntary') v.target_amount = null; // tùy tâm: không có mức
  if (v.target_amount != null && (!Number.isSafeInteger(v.target_amount) || v.target_amount < 0 || v.target_amount > MAX_AMOUNT)) {
    bad('Mức đóng dự kiến không hợp lệ (tối đa 100 tỷ đồng)');
  }
  if (v.bank_bin && !/^\d{6}$/.test(v.bank_bin)) bad('Mã ngân hàng không hợp lệ, chọn ngân hàng trong danh sách');
  for (const d of [v.start_date, v.end_date]) if (d && !DAY.test(d)) bad('Ngày không hợp lệ');
  if (v.start_date && v.end_date && v.start_date > v.end_date) bad('Ngày kết thúc phải sau ngày bắt đầu');
  return v;
}

// Người phụ trách phải là thủ quỹ đang hoạt động của cộng đồng này.
function checkManager(req, userId) {
  if (userId && !control.prepare("SELECT 1 FROM users WHERE id=? AND tenant_id=? AND role='treasurer' AND active=1").get(userId, req.user.tenant_id)) {
    bad('Người phụ trách phải là thủ quỹ của cộng đồng này');
  }
}

// BR-08: thủ quỹ chỉ thấy quỹ được giao. Quỹ chưa giao ai thì mọi thủ quỹ đều thấy.
// Người duyệt, ban lãnh đạo, chủ tài khoản (có fund.manage hoặc không có fund.entry) thấy mọi quỹ.
// ponytail: quỹ chưa giao ai mở cho mọi thủ quỹ; muốn bắt buộc giao thì bỏ nhánh manager_user_id IS NULL.
const scoped = (req) => req.user.role === 'treasurer';
const SCOPE_SQL = '(f.manager_user_id IS NULL OR f.manager_user_id=?)';
const canSeeFund = (req, f) => !scoped(req) || f.manager_user_id == null || f.manager_user_id === req.user.id;
function fundFor(req, id) {
  const f = getFund(id);
  return f && canSeeFund(req, f) ? f : null;
}
function entryFor(req, id) {
  const e = getEntry(id);
  if (!e) return null;
  const f = db.prepare('SELECT manager_user_id FROM funds WHERE id=?').get(e.fund_id);
  return canSeeFund(req, f) ? e : null;
}

/* ===================== QUỸ ===================== */
router.get('/funds', requirePerm('fund.view'), wrap((req, res) => {
  const where = scoped(req) ? 'WHERE ' + SCOPE_SQL : '';
  const args = scoped(req) ? [req.user.id] : [];
  const rows = db.prepare(`SELECT f.*, (SELECT ${BALANCE} FROM fund_entries WHERE fund_id=f.id) balance FROM funds f ${where} ORDER BY f.locked_at IS NOT NULL, f.status, f.id`).all(...args);
  ok(res, rows.map((f) => withState({ ...f, manager_name: managerName(f.manager_user_id) })));
}));

// Thông báo vòng đời quỹ 14 ngày gần nhất (tự ngừng thu, mở thu lại, khoá / mở khoá) cho Admin sổ quỹ
router.get('/fund-notices', requirePerm('fund.view'), wrap((req, res) => {
  ok(res, db.prepare(`SELECT n.*, f.name fund_name FROM fund_notices n JOIN funds f ON f.id=n.fund_id
    WHERE n.created_at >= datetime('now','localtime','-14 days') ORDER BY n.id DESC LIMIT 20`).all());
}));

// Danh sách thủ quỹ để chọn người phụ trách quỹ (người có fund.manage không cần quyền user.manage).
router.get('/fund-treasurers', requirePerm('fund.manage'), wrap((req, res) => {
  ok(res, control.prepare("SELECT id, username, full_name FROM users WHERE tenant_id=? AND role='treasurer' AND active=1 ORDER BY full_name, username").all(req.user.tenant_id));
}));

router.get('/funds/:id', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  ok(res, f);
}));

router.post('/funds', requirePerm('fund.manage'), wrap((req, res) => {
  const b = req.body || {};
  const v = fundInput(b);
  // Mã quỹ không bắt buộc: bỏ trống thì tự sinh từ tên. Ai gửi mã (API) thì kiểm như cũ.
  let code = str(b.code, 30).toLowerCase();
  if (code) {
    if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(code)) bad('Mã quỹ gồm 2–30 ký tự a-z, 0-9, dấu gạch ngang');
    if (db.prepare('SELECT 1 FROM funds WHERE code=?').get(code)) bad('Mã quỹ đã tồn tại');
  } else code = fundCode(v.name);
  checkManager(req, v.manager_user_id);
  if (fundAccountTaken(v.bank_account)) bad('Tài khoản nhận của quỹ phải là tài khoản riêng, không trùng cửa hàng hay quỹ khác (BR-02)');
  const r = db.prepare(`INSERT INTO funds(code,name,kind,category,fund_type,nature,contribution,target_amount,is_public,bank_account,bank_bin,bank_name,account_holder,
    manager_user_id,description,content,transfer_code,start_date,end_date,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)`)
    .run(code, v.name, v.kind, v.category, v.fund_type, v.nature, v.contribution, v.target_amount, v.is_public, v.bank_account, v.bank_bin, v.bank_name, v.account_holder,
      v.manager_user_id, v.description, v.content, v.transfer_code || shortCode(v.name), v.start_date, v.end_date, req.user.id);
  const f = getFund(r.lastInsertRowid);
  log(req, 'fund.create', 'fund', f.id, { code, name: v.name });
  ok(res, f);
}));

/* ===================== Vòng đời quỹ (SKHGDT-3647) ===================== */
// Đang thu (active) -> Ngừng thu (closed: không thu, vẫn chi) -> Khoá sổ (closed + locked_at: không thu, không chi).
// Ngừng thu mở thu lại được (đợt mới, nội dung chuyển khoản mới). Khoá sổ chỉ mở khi có sai sót, cần 2 người duyệt, mở về Ngừng thu.
const stateOf = (f) => (f.locked_at ? 'locked' : f.status === 'active' ? 'collecting' : 'stopped');
const STATE_LABEL = { collecting: 'Đang thu', stopped: 'Ngừng thu', locked: 'Khoá sổ' };
const byName = (req) => req.user.full_name || req.user.username;
const notice = (fundId, kind, message) => db.prepare('INSERT INTO fund_notices(fund_id,kind,message) VALUES (?,?,?)').run(fundId, kind, message);
const viDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
// Nội dung chuyển khoản: mã ngắn của quỹ + số đợt (AN26-D2). Ngân hàng giới hạn ~25 ký tự, bỏ dấu.
const transferRef = (f) => `${f.transfer_code || removeVietnamese(f.name).slice(0, 18)}${f.round > 1 ? '-D' + f.round : ''}`;
function shortCode(name) {
  const words = removeVietnamese(name).toUpperCase().split(/\s+/).filter((w) => w && !/^(QUY|CHUONG|TRINH|DOT)$/.test(w));
  const year = (String(name).match(/\b(20\d\d)\b/) || [])[1];
  const letters = words.filter((w) => !/^\d+$/.test(w)).map((w) => w[0]).join('').slice(0, 6) || 'QUY';
  return letters + (year ? year.slice(2) : '');
}

function assertNoOpen(fundId, what) {
  const open = db.prepare("SELECT COUNT(*) n FROM fund_entries WHERE fund_id=? AND status IN ('draft','submitted')").get(fundId).n;
  if (open) bad(`Còn ${open} khoản nháp hoặc chờ duyệt. Duyệt, từ chối hoặc để người lập xử lý trước khi ${what}`);
}
// Tổng kết quỹ: dùng khi ngừng thu, khoá sổ và trên trang công khai
function fundSummary(f) {
  const s = db.prepare(`SELECT COUNT(CASE WHEN type='in' THEN 1 END) donors,
      COALESCE(SUM(CASE WHEN type='in' THEN amount END),0) total_in, COALESCE(SUM(CASE WHEN type='out' THEN amount END),0) total_out,
      COALESCE(SUM(CASE WHEN type='adjust' THEN amount END),0) adjust,
      COUNT(CASE WHEN type='out' AND (attachment IS NULL OR attachment='') THEN 1 END) out_no_receipt
    FROM fund_entries WHERE fund_id=? AND status='approved'`).get(f.id);
  const pending = db.prepare("SELECT COUNT(*) n FROM fund_entries WHERE fund_id=? AND status IN ('draft','submitted')").get(f.id).n;
  const balance = s.total_in - s.total_out + s.adjust;
  // % chỉ có nghĩa với mục tiêu huy động (tổng); mức theo hộ / người không biết số hộ nên không tính
  const progress = f.contribution === 'goal' && f.target_amount ? Math.round((s.total_in / f.target_amount) * 100) : null;
  return { donors: s.donors, total_in: s.total_in, total_out: s.total_out, adjust: s.adjust, balance, pending, progress, out_no_receipt: s.out_no_receipt };
}

function stopFund(fundId, by, note, auto) {
  db.prepare("UPDATE funds SET status='closed', stopped_at=datetime('now','localtime'), stopped_by_name=?, stop_note=? WHERE id=? AND status='active'")
    .run(by, note || null, fundId);
  const f = getFund(fundId);
  notice(fundId, auto ? 'auto_stop' : 'stop', `${f.name}: ngừng thu từ ${viDate(f.stopped_at.slice(0, 10))}${auto ? ' (hết hạn thu)' : ''}`);
  return f;
}

router.get('/funds/:id/summary', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  ok(res, fundSummary(f));
}));

router.get('/funds/:id/documents', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  ok(res, docsOf(f.id));
}));
router.post('/funds/:id/documents', requirePerm('fund.manage'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (f.locked_at) bad(LOCKED_MSG);
  const d = saveDocument(req, f.id, req.body || {});
  log(req, 'fund.document_add', 'fund', f.id, { doc: d.id, name: d.name });
  ok(res, d);
}));
// Gỡ tài liệu nội dung (không gỡ biên bản; file giữ lại trên đĩa để đối chiếu)
router.delete('/fund-documents/:id', requirePerm('fund.manage'), wrap((req, res) => {
  const d = db.prepare('SELECT * FROM fund_documents WHERE id=?').get(Number(req.params.id));
  const f = d && fundFor(req, d.fund_id);
  if (!f) return fail(res, 'Không tìm thấy tài liệu', 404);
  if (d.kind === 'minutes') bad('Biên bản khoá / mở khoá sổ không gỡ được');
  if (f.locked_at) bad(LOCKED_MSG);
  db.prepare('DELETE FROM fund_documents WHERE id=?').run(d.id);
  log(req, 'fund.document_remove', 'fund', f.id, { doc: d.id, name: d.name });
  ok(res, true);
}));
router.get('/fund-documents/:id', requirePerm('fund.view'), wrap((req, res) => {
  const d = db.prepare('SELECT * FROM fund_documents WHERE id=?').get(Number(req.params.id));
  if (!d || !fundFor(req, d.fund_id)) return fail(res, 'Không tìm thấy tài liệu', 404);
  sendDocument(res, d);
}));

// Ngừng thu: tiền chuyển theo QR cũ không tự vào sổ nữa (vào mục chưa phân loại); phiếu chi vẫn lập, duyệt bình thường.
router.post('/funds/:id/stop', requirePerm('fund.manage'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (stateOf(f) !== 'collecting') bad('Quỹ không ở trạng thái Đang thu');
  const out = stopFund(f.id, byName(req), str((req.body || {}).note, 1000));
  log(req, 'fund.stop', 'fund', f.id, { ...fundSummary(f), note: (req.body || {}).note });
  ok(res, out);
}));

// Mở thu lại: bắt buộc hạn thu mới + lý do. Tạo đợt mới (round+1) -> nội dung chuyển khoản, QR mới; QR đợt cũ không còn được nhận.
router.post('/funds/:id/resume', requirePerm('fund.manage'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (stateOf(f) !== 'stopped') bad(f.locked_at ? 'Quỹ đã khoá sổ, không mở thu lại. Tạo quỹ mới từ quỹ này' : 'Quỹ đang thu');
  const b = req.body || {};
  const until = str(b.end_date, 10);
  if (!DAY.test(until) || until < today()) bad('Nhập hạn thu mới (từ hôm nay trở đi)');
  const reason = str(b.reason, 500);
  if (!reason) bad('Ghi lý do mở thu lại (gia hạn, thu bổ sung…)');
  db.prepare(`UPDATE funds SET status='active', round=round+1, end_date=?, stopped_at=NULL, stopped_by_name=NULL, stop_note=NULL,
    transfer_code=COALESCE(transfer_code, ?) WHERE id=?`).run(until, shortCode(f.name), f.id);
  const g = getFund(f.id);
  notice(f.id, 'resume', `${g.name} mở thu lại (đợt ${g.round}) đến ngày ${viDate(until)}. Nội dung chuyển khoản: ${transferRef(g)}`);
  log(req, 'fund.resume', 'fund', f.id, { round: g.round, end_date: until, reason });
  ok(res, g);
}));

// Khoá sổ: chốt cuối, do Ban kiểm tra xác nhận. Điều kiện: đã ngừng thu, hết phiếu dở, khoản chi đủ chứng từ,
// số dư = 0 hoặc ghi rõ xử lý số dư. Có biên bản (file) đính kèm.
router.post('/funds/:id/lock', requirePerm('fund.inspect'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (stateOf(f) !== 'stopped') bad(f.locked_at ? 'Quỹ đã khoá sổ' : 'Phải ngừng thu trước khi khoá sổ');
  const b = req.body || {};
  assertNoOpen(f.id, 'khoá sổ');
  const s = fundSummary(f);
  if (s.out_no_receipt) bad(`Còn ${s.out_no_receipt} khoản chi chưa có chứng từ`);
  const balanceNote = str(b.balance_note, 500);
  if (s.balance !== 0 && !balanceNote) bad(`Số dư còn ${s.balance.toLocaleString('vi-VN')} ₫. Ghi rõ cách xử lý số dư (kết chuyển sang quỹ nào, hoặc giữ lại)`);
  if (!b.minutes) bad('Đính kèm biên bản khoá sổ');
  db.exec('BEGIN IMMEDIATE');
  try {
    const doc = saveDocument(req, f.id, b.minutes, 'minutes', 'Biên bản khoá sổ');
    // unlocked_at / unlock_reason giữ lại: trang công khai vẫn thấy quỹ từng được mở khoá và lý do
    db.prepare(`UPDATE funds SET locked_at=datetime('now','localtime'), locked_by_name=?, lock_note=?, lock_balance=?, lock_doc_id=? WHERE id=?`).run(byName(req), [str(b.note, 1000), balanceNote].filter(Boolean).join('\n') || null, s.balance, doc.id, f.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  notice(f.id, 'lock', `${f.name} đã khoá sổ. Số dư khi khoá sổ: ${s.balance.toLocaleString('vi-VN')} ₫`);
  log(req, 'fund.lock', 'fund', f.id, { ...s, balance_note: balanceNote });
  ok(res, getFund(f.id));
}));

// Mở khoá sổ (chỉ khi có sai sót): đề nghị kèm lý do + biên bản; Trưởng thôn (fund.approve) và Trưởng ban kiểm tra (fund.inspect)
// cùng duyệt, hai người khác nhau. Đủ hai chữ ký thì quỹ về Ngừng thu, sửa sai bằng bút toán điều chỉnh.
router.post('/funds/:id/unlock-requests', requirePerm('fund.view'), wrap((req, res) => {
  if (!can(req, 'fund.approve') && !can(req, 'fund.inspect') && !can(req, 'fund.manage')) bad('Không có quyền đề nghị mở khoá sổ', 403);
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (!f.locked_at) bad('Quỹ chưa khoá sổ');
  if (db.prepare("SELECT 1 FROM fund_requests WHERE fund_id=? AND action='unlock' AND status='pending'").get(f.id)) bad('Đã có đề nghị mở khoá đang chờ duyệt');
  const b = req.body || {};
  const reason = str(b.reason, 1000);
  if (!reason) bad('Ghi lý do mở khoá sổ (sai sót gì)');
  if (!b.minutes) bad('Đính kèm biên bản mở khoá sổ');
  const doc = saveDocument(req, f.id, b.minutes, 'minutes', 'Biên bản mở khoá sổ');
  const r = db.prepare("INSERT INTO fund_requests(fund_id,action,reason,doc_id,requested_by,requested_by_name) VALUES (?,'unlock',?,?,?,?)")
    .run(f.id, reason, doc.id, req.user.id, byName(req));
  log(req, 'fund.unlock_request', 'fund', f.id, { reason });
  ok(res, db.prepare('SELECT * FROM fund_requests WHERE id=?').get(r.lastInsertRowid));
}));

router.get('/funds/:id/unlock-requests', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  ok(res, db.prepare("SELECT * FROM fund_requests WHERE fund_id=? AND action='unlock' ORDER BY id DESC").all(f.id));
}));

router.post('/fund-requests/:id/approve', requirePerm('fund.view'), wrap((req, res) => {
  const r = db.prepare('SELECT * FROM fund_requests WHERE id=?').get(Number(req.params.id));
  if (!r || r.status !== 'pending') bad('Đề nghị không còn chờ duyệt');
  if (!fundFor(req, r.fund_id)) return fail(res, 'Không tìm thấy quỹ', 404);
  const slot = can(req, 'fund.inspect') && !r.inspector_id ? 'inspector' : can(req, 'fund.approve') && !r.approver_id ? 'approver' : null;
  if (!slot) bad('Bạn không có quyền duyệt hoặc đã duyệt đề nghị này', 403);
  if (r.approver_id === req.user.id || r.inspector_id === req.user.id) bad('Hai người duyệt phải khác nhau', 403);
  db.prepare(`UPDATE fund_requests SET ${slot}_id=?, ${slot}_name=?, ${slot}_at=datetime('now','localtime') WHERE id=?`).run(req.user.id, byName(req), r.id);
  const now = db.prepare('SELECT * FROM fund_requests WHERE id=?').get(r.id);
  log(req, 'fund.unlock_sign', 'fund', r.fund_id, { request: r.id, as: slot });
  if (now.approver_id && now.inspector_id) {
    db.prepare("UPDATE fund_requests SET status='done', done_at=datetime('now','localtime') WHERE id=?").run(r.id);
    db.prepare("UPDATE funds SET locked_at=NULL, unlocked_at=datetime('now','localtime'), unlock_reason=? WHERE id=?").run(r.reason, r.fund_id);
    const f = getFund(r.fund_id);
    notice(f.id, 'unlock', `${f.name}: đã mở khoá sổ ngày ${viDate(f.unlocked_at.slice(0, 10))} – lý do: ${r.reason}`);
    log(req, 'fund.unlock', 'fund', f.id, { request: r.id, reason: r.reason });
  }
  ok(res, db.prepare('SELECT * FROM fund_requests WHERE id=?').get(r.id));
}));

router.post('/fund-requests/:id/reject', requirePerm('fund.view'), wrap((req, res) => {
  const r = db.prepare('SELECT * FROM fund_requests WHERE id=?').get(Number(req.params.id));
  if (!r || r.status !== 'pending') bad('Đề nghị không còn chờ duyệt');
  if (!fundFor(req, r.fund_id)) return fail(res, 'Không tìm thấy quỹ', 404);
  if (!can(req, 'fund.inspect') && !can(req, 'fund.approve')) bad('Không có quyền', 403);
  const reason = str((req.body || {}).reason, 500);
  if (!reason) bad('Ghi lý do từ chối');
  db.prepare("UPDATE fund_requests SET status='rejected', reject_reason=?, rejected_by_name=?, done_at=datetime('now','localtime') WHERE id=?").run(reason, byName(req), r.id);
  log(req, 'fund.unlock_reject', 'fund', r.fund_id, { request: r.id, reason });
  ok(res, db.prepare('SELECT * FROM fund_requests WHERE id=?').get(r.id));
}));

// Tạo quỹ từ quỹ cũ (năm / đợt sau): chép cấu hình, không chép tài khoản (mỗi quỹ một tài khoản riêng), số dư, bút toán.
router.post('/funds/:id/clone', requirePerm('fund.manage'), wrap((req, res) => {
  const src = fundFor(req, req.params.id);
  if (!src) return fail(res, 'Không tìm thấy quỹ', 404);
  const b = req.body || {};
  const name = str(b.name, 160) || src.name.replace(/\b20\d\d\b/, (y) => String(Number(y) + 1));
  if (name === src.name) bad('Đặt tên quỹ mới khác quỹ cũ (ví dụ thêm năm)');
  const code = fundCode(name);
  const r = db.prepare(`INSERT INTO funds(code,name,kind,category,fund_type,nature,contribution,target_amount,is_public,manager_user_id,description,content,status,created_by)
    SELECT ?,?,kind,category,fund_type,nature,contribution,target_amount,is_public,manager_user_id,description,content,'active',? FROM funds WHERE id=?`)
    .run(code, name, req.user.id, src.id);
  log(req, 'fund.clone', 'fund', r.lastInsertRowid, { from: src.id, name });
  ok(res, getFund(r.lastInsertRowid));
}));

// Hết hạn thu thì tự Ngừng thu và báo Admin (chạy mỗi giờ + lúc khởi động, xem server.js). Trả số quỹ đã chuyển.
function autoStopExpired() {
  let n = 0;
  for (const t of control.prepare("SELECT id, code FROM tenants WHERE kind='community' AND status='active'").all()) {
    db.runWith(t.code, () => {
      for (const f of db.prepare("SELECT id, name, end_date FROM funds WHERE status='active' AND end_date IS NOT NULL AND end_date < ?").all(today())) {
        stopFund(f.id, 'Hệ thống (hết hạn thu)', `Tự ngừng thu vì hết hạn ${viDate(f.end_date)}`, true);
        audit({ tenantId: t.id, userId: null, username: 'system', action: 'fund.auto_stop', entity: 'fund', entityId: f.id, detail: JSON.stringify({ end_date: f.end_date }) });
        n++;
      }
    });
  }
  return n;
}

// Sửa thông tin quỹ. Trạng thái chỉ đổi qua /stop, /resume, /lock, mở khoá. Quỹ đã khoá sổ không sửa được.
router.patch('/funds/:id', requirePerm('fund.manage'), wrap((req, res) => {
  const cur = fundFor(req, req.params.id);
  if (!cur) return fail(res, 'Không tìm thấy quỹ', 404);
  if (cur.locked_at) bad('Quỹ đã khoá sổ, không sửa được');
  const b = { ...(req.body || {}) };
  if (b.status !== undefined && b.status !== cur.status) bad('Đổi trạng thái bằng nút Ngừng thu / Mở thu lại / Khoá sổ');
  delete b.status;
  const v = fundInput(b, cur);
  checkManager(req, v.manager_user_id);
  if (v.bank_account !== cur.bank_account && fundAccountTaken(v.bank_account, cur.id)) bad('Tài khoản nhận của quỹ phải là tài khoản riêng, không trùng cửa hàng hay quỹ khác (BR-02)');
  db.prepare(`UPDATE funds SET name=?,kind=?,category=?,fund_type=?,nature=?,contribution=?,target_amount=?,is_public=?,bank_account=?,bank_bin=?,bank_name=?,account_holder=?,
    manager_user_id=?,description=?,content=?,transfer_code=?,start_date=?,end_date=? WHERE id=?`)
    .run(v.name, v.kind, v.category, v.fund_type, v.nature, v.contribution, v.target_amount, v.is_public, v.bank_account, v.bank_bin, v.bank_name, v.account_holder,
      v.manager_user_id, v.description, v.content, v.transfer_code, v.start_date, v.end_date, cur.id);
  log(req, 'fund.update', 'fund', cur.id, req.body);
  ok(res, getFund(cur.id));
}));

/* ===================== QR (GĐ2.3) ===================== */
// Dựng chuỗi VietQR (NAPAS) ngay tại máy chủ, không gọi API VietQR: tiền về được định tuyến theo
// số tài khoản quỹ (BR-02), không cần orderId, nên QR in dán vẫn dùng được khi mất mạng hoặc đổi môi trường.
async function fundQr(f, amount) {
  if (!f.bank_account || !f.bank_bin) bad('Quỹ chưa cấu hình tài khoản ngân hàng (số tài khoản + mã ngân hàng)');
  const qrCode = buildVietQR({ bankBin: f.bank_bin, accountNo: f.bank_account, amount, message: transferRef(f).slice(0, 25) });
  const qrDataUrl = await QRCode.toDataURL(qrCode, { width: 340, margin: 1, errorCorrectionLevel: 'M' });
  return { qrCode, qrDataUrl, fund_id: f.id, round: f.round, transfer_content: transferRef(f), bank_name: f.bank_name, bank_account: f.bank_account, account_holder: f.account_holder };
}

// QR tĩnh để in dán: không mã hóa số tiền.
router.get('/funds/:id/qr', requirePerm('fund.view'), wrap(async (req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  ok(res, await fundQr(f));
}));

// QR có số tiền. Không tạo bút toán trước; chỉ ghi sổ khi tiền thật về (webhook).
router.post('/funds/:id/qr', requirePerm('fund.entry'), wrap(async (req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (f.status !== 'active') bad(NOT_COLLECTING);
  const amount = int((req.body || {}).amount);
  if (!amountOk(amount)) bad('Số tiền không hợp lệ (tối đa 100 tỷ đồng)');
  ok(res, { ...(await fundQr(f, amount)), amount });
}));

/* ===================== BÚT TOÁN ===================== */
router.get('/funds/:id/entries', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
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
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (f.locked_at) bad(LOCKED_MSG);
  const b = req.body || {};
  const type = b.type;
  if (!PREFIX[type]) bad('Loại bút toán không hợp lệ');
  // Ngừng thu: không ghi thu, vẫn lập phiếu chi / điều chỉnh
  if (type === 'in' && f.status !== 'active') bad(NOT_COLLECTING);
  const amount = int(b.amount);
  if (!amountOk(amount, type === 'adjust')) bad('Số tiền không hợp lệ (tối đa 100 tỷ đồng)');
  const source = type === 'in' ? b.source || 'cash' : 'cash';
  if (!['cash', 'manual'].includes(source)) bad('Nguồn thu không hợp lệ');
  const note = str(b.note, 500) || null;
  let ref = null;
  if (type === 'adjust') {
    ref = getEntry(b.ref_entry_id);
    if (!ref || ref.fund_id !== f.id || ref.status !== 'approved') bad('Điều chỉnh phải trỏ tới một bút toán đã ghi sổ của quỹ này');
    if (!note) bad('Điều chỉnh phải ghi lý do');
  }
  if (type === 'in') {
    const e = insertIncome(req, f, { ...b, amount, source, note });
    log(req, 'fund_entry.create', 'fund_entry', e.id, { code: e.code, type, amount, date: b.date || undefined });
    return ok(res, e);
  }
  const code = makeCode(db, PREFIX[type], 'fund_entries');
  const attachment = b.attachment ? saveAttachment(b.attachment, code) : null;
  const r = db.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,note,ref_entry_id,attachment,status,created_by,created_by_name)
    VALUES (?,?,?,?,'cash',?,?,?,'draft',?,?)`).run(code, f.id, type, amount, note, ref ? ref.id : null, attachment, req.user.id, req.user.full_name || req.user.username);
  const e = getEntry(r.lastInsertRowid);
  log(req, 'fund_entry.create', 'fund_entry', e.id, { code: e.code, type, amount });
  ok(res, e);
}));

// Khoản thu ghi sổ ngay. b.date (YYYY-MM-DD) để vào sổ khoản thu ngày cũ (sổ giấy, sao kê); mã chứng từ theo ngày đó.
// Chuyển khoản (manual) có mã giao dịch thì không ghi trùng một giao dịch hai lần.
function insertIncome(req, f, b) {
  const when = entryDate(b.date);
  const bankRef = b.source === 'manual' ? str(b.bank_ref, 80) || null : null;
  if (bankRef && db.prepare('SELECT 1 FROM fund_entries WHERE bank_ref=?').get(bankRef)) bad(`Giao dịch ngân hàng ${bankRef} đã được ghi sổ`);
  const code = makeCode(db, PREFIX.in, 'fund_entries', 'code', when ? new Date(b.date + 'T12:00:00') : new Date());
  const attachment = b.attachment ? saveAttachment(b.attachment, code) : null;
  const by = req.user.full_name || req.user.username;
  const at = when ? '?' : "datetime('now','localtime')";
  const r = db.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,payer_name,anonymous,note,attachment,status,created_by,created_by_name,approved_by,approved_by_name,created_at,approved_at)
    VALUES (?,?,'in',?,?,?,?,?,?,?,'approved',?,?,?,?,${at},${at})`).run(
    code, f.id, b.amount, b.source, bankRef, str(b.payer_name, 120) || null, b.anonymous ? 1 : 0, b.note || null, attachment,
    req.user.id, by, req.user.id, by, ...(when ? [when, when] : []));
  return getEntry(r.lastInsertRowid);
}

// Nhập khoản thu hàng loạt (sổ giấy, sao kê, file Excel đã đọc ở trình duyệt). Tất cả hoặc không:
// còn dòng lỗi thì không ghi gì và trả về lỗi từng dòng để sửa file. ?dry=1 chỉ kiểm, không ghi.
// ponytail: chỉ nhập khoản thu; phiếu chi vẫn từng phiếu một vì cần ảnh chứng từ và người duyệt.
const IMPORT_MAX = 2000;
// file: data URL / base64 của .xlsx hoặc .csv theo file mẫu. Dòng 1 là tiêu đề; cột nhận theo tiêu đề (bỏ dấu), không theo vị trí.
const IMPORT_COLS = { ngay: 'date', 'nguoi nop': 'payer_name', 'so tien': 'amount', 'hinh thuc': 'source', 'ma giao dich': 'bank_ref', 'ghi chu': 'note', 'an danh': 'anonymous' };
function fileRows(file) {
  const buf = Buffer.from(String(file).replace(/^data:[^,]*,/, ''), 'base64');
  if (buf.length > ATTACH_MAX) bad('File quá 5MB');
  let table;
  if (buf.readUInt32LE(0) === 0x04034b50) {
    try { table = readXlsx(buf); } catch (e) { bad(e.message); }
  } else {
    // CSV: dấu phẩy hoặc chấm phẩy (Excel tiếng Việt), ô có thể bọc ngoặc kép
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    table = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => [...l.matchAll(new RegExp(`("([^"]|"")*"|[^${sep}]*)(${sep}|$)`, 'g'))]
      .slice(0, -1).map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
  }
  const keys = (table[0] || []).map((h) => IMPORT_COLS[removeVietnamese(String(h).replace(/\(.*$/, '')).toLowerCase().trim()]);
  if (!keys.includes('amount')) bad('Không thấy cột "Số tiền". Dùng file mẫu để nhập');
  return table.slice(1).map((r, i) => {
    const o = { line: i + 2 };
    keys.forEach((k, ci) => { if (k) o[k] = r[ci] ?? ''; });
    return o;
  }).filter((o) => Object.keys(o).some((k) => k !== 'line' && String(o[k]).trim()));
}
// Ngày trong file: YYYY-MM-DD, DD/MM/YYYY (Excel tiếng Việt) hoặc số serial ngày của Excel. Trống = hôm nay.
function importDate(v) {
  const s = str(v, 20);
  let m;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000).toISOString().slice(0, 10);
  return s.slice(0, 10);
}
const SOURCE_ALIAS = { 'tien mat': 'cash', cash: 'cash', '': 'cash', 'chuyen khoan': 'manual', ck: 'manual', manual: 'manual', bank: 'manual' };
router.post('/funds/:id/import', requirePerm('fund.entry'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  if (f.status !== 'active') bad(NOT_COLLECTING);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : req.body?.file ? fileRows(req.body.file) : null;
  if (!rows || !rows.length) bad('File không có dòng nào');
  if (rows.length > IMPORT_MAX) bad(`Mỗi lần nhập tối đa ${IMPORT_MAX} dòng`);
  const errors = [];
  const seenRefs = new Set();
  const clean = rows.map((x, i) => {
    const line = Number(x?.line) || i + 2; // dòng 1 của file là tiêu đề
    const err = (m) => { errors.push({ line, error: m }); return null; };
    const amount = Math.round(Number(String(x?.amount ?? '').replace(/[^\d-]/g, '')));
    if (!amountOk(amount)) return err('Số tiền không hợp lệ');
    const source = SOURCE_ALIAS[removeVietnamese(String(x?.source ?? '')).toLowerCase()];
    if (!source) return err('Hình thức phải là "Tiền mặt" hoặc "Chuyển khoản"');
    const date = importDate(x?.date);
    try { entryDate(date); } catch (e) { return err(e.message); }
    const bankRef = source === 'manual' ? str(x?.bank_ref, 80) : '';
    if (bankRef && (seenRefs.has(bankRef) || db.prepare('SELECT 1 FROM fund_entries WHERE bank_ref=?').get(bankRef))) return err(`Mã giao dịch ${bankRef} bị trùng`);
    if (bankRef) seenRefs.add(bankRef);
    return { amount, source, date, bank_ref: bankRef, payer_name: x?.payer_name, anonymous: /^(x|1|có|co|true)$/i.test(str(x?.anonymous, 10)), note: str(x?.note, 500) };
  });
  const total = clean.reduce((s, x) => s + (x ? x.amount : 0), 0);
  if (errors.length || req.query.dry === '1') return ok(res, { count: rows.length, total, errors, imported: 0 });
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const x of clean) insertIncome(req, f, x);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  log(req, 'fund_entry.import', 'fund', f.id, { count: clean.length, total });
  ok(res, { count: clean.length, total, errors: [], imported: clean.length });
}));

// File mẫu để thủ quỹ điền rồi nhập lại
router.get('/funds/:id/import-template', requirePerm('fund.entry'), wrap((req, res) => {
  sendXlsx(res, 'mau-nhap-khoan-thu', [
    { date: today(), payer_name: 'Nguyễn Văn A', amount: 200000, source: 'Tiền mặt', bank_ref: '', note: 'Đóng quỹ xóm 1', anonymous: '' },
    { date: today(), payer_name: 'Trần Thị B', amount: 500000, source: 'Chuyển khoản', bank_ref: 'FT2611100001', note: '', anonymous: 'x' },
  ], { sheet: 'Khoan thu', header: IMPORT_HEADER });
}));
const IMPORT_HEADER = { date: 'Ngày (YYYY-MM-DD)', payer_name: 'Người nộp', amount: 'Số tiền', source: 'Hình thức', bank_ref: 'Mã giao dịch', note: 'Ghi chú', anonymous: 'Ẩn danh (x)' };

router.get('/fund-entries/:id/attachment', requirePerm('fund.view'), wrap((req, res) => {
  const e = entryFor(req, req.params.id);
  if (!e || !e.attachment) return fail(res, 'Không có ảnh chứng từ', 404);
  // dotfiles: 'allow' — DATA_DIR có thể nằm dưới thư mục chấm (giống backup.js); tên file
  // luôn do server đặt theo mã chứng từ nên không có rủi ro path traversal.
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(db.DATA_DIR, 'attachments', e.attachment), { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) fail(res, 'Không tìm thấy ảnh', 404);
  });
}));

// FR-20: thủ quỹ ẩn / hiện tên người công đức sau khi ghi sổ; mỗi lần đổi ghi nhật ký.
// Chỉ đổi cờ hiển thị, không đụng số tiền nên không vướng trigger BR-04.
router.post('/fund-entries/:id/anonymous', requirePerm('fund.anonymize'), wrap((req, res) => {
  const e = entryFor(req, req.params.id);
  if (!e) return fail(res, 'Không tìm thấy bút toán', 404);
  if (e.type !== 'in') bad('Chỉ khoản thu mới ẩn / hiện tên được');
  // Ẩn tên theo yêu cầu người đóng góp vẫn cho phép sau khi đóng quỹ: chỉ đổi hiển thị, không đổi số liệu (FR-20)
  const anonymous = (req.body || {}).anonymous ? 1 : 0;
  db.prepare('UPDATE fund_entries SET anonymous=? WHERE id=?').run(anonymous, e.id);
  log(req, anonymous ? 'fund_entry.hide_name' : 'fund_entry.show_name', 'fund_entry', e.id, { code: e.code });
  ok(res, getEntry(e.id));
}));

// Người lập sửa phiếu nháp của mình (số tiền, ghi chú, ảnh) trước khi gửi duyệt.
// Phiếu đã gửi / đã chốt không sửa được; sai thì từ chối hoặc lập điều chỉnh (BR-04).
router.patch('/fund-entries/:id', requirePerm('fund.entry'), wrap((req, res) => transition(req, res, 'draft', (e) => {
  if (e.created_by !== req.user.id) bad('Chỉ người lập được sửa phiếu nháp');
  const b = req.body || {};
  const amount = b.amount !== undefined ? int(b.amount) : e.amount;
  if (!amountOk(amount, e.type === 'adjust')) bad('Số tiền không hợp lệ (tối đa 100 tỷ đồng)');
  const note = b.note !== undefined ? str(b.note, 500) || null : e.note;
  if (e.type === 'adjust' && !note) bad('Điều chỉnh phải ghi lý do');
  const attachment = b.attachment ? saveAttachment(b.attachment, e.code) : e.attachment;
  db.prepare('UPDATE fund_entries SET amount=?, note=?, attachment=? WHERE id=?').run(amount, note, attachment, e.id);
  log(req, 'fund_entry.update', 'fund_entry', e.id, { amount, note, attachment: attachment !== e.attachment });
})));

const fundLocked = (e) => !!db.prepare('SELECT locked_at FROM funds WHERE id=?').get(e.fund_id).locked_at;

function transition(req, res, from, fn) {
  const e = entryFor(req, req.params.id);
  if (!e) return fail(res, 'Không tìm thấy bút toán', 404);
  if (fundLocked(e)) bad(LOCKED_MSG);
  if (e.status !== from) bad('Bút toán không ở trạng thái cho phép thao tác này');
  fn(e);
  ok(res, getEntry(e.id));
}

router.post('/fund-entries/:id/submit', requirePerm('fund.entry'), wrap((req, res) => transition(req, res, 'draft', (e) => {
  if (e.created_by !== req.user.id) bad('Chỉ người lập được gửi duyệt');
  if (e.type === 'out' && !e.attachment) bad('Khoản chi phải có ảnh chứng từ trước khi gửi duyệt (ERR-05)');
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

/* ===================== Báo cáo kỳ (GĐ2.7 — BR-12: không chốt sổ, luôn tính lại theo kỳ) ===================== */
// Kỳ tính theo ngày ghi sổ (approved_at): khoản chi lập ngày 1, duyệt ngày 5 thuộc kỳ chứa ngày 5.
const rangeOf = (q) => { const f = q.from || today(); const t = q.to || f; return { from: f, to: t }; };
const SRC_LABEL = { vietqr: 'VietQR', manual: 'Chuyển khoản khác', cash: 'Tiền mặt' };
const TYPE_LABEL = { in: 'Thu', out: 'Chi', adjust: 'Điều chỉnh' };

function fundPeriod(fundId, from, to) {
  if (!DAY.test(from) || !DAY.test(to) || from > to) bad('Khoảng ngày không hợp lệ');
  const opening = Number(db.prepare(`SELECT COALESCE(SUM(CASE type WHEN 'out' THEN -amount ELSE amount END),0) b
    FROM fund_entries WHERE fund_id=? AND status='approved' AND date(approved_at)<date(?)`).get(fundId, from).b);
  const sums = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='in' AND source IN ('vietqr','manual') THEN amount END),0) income_bank,
      COALESCE(SUM(CASE WHEN type='in' AND source='cash' THEN amount END),0) income_cash,
      COALESCE(SUM(CASE WHEN type='out' THEN amount END),0) expense,
      COALESCE(SUM(CASE WHEN type='adjust' THEN amount END),0) adjust
    FROM fund_entries WHERE fund_id=? AND status='approved' AND date(approved_at)>=date(?) AND date(approved_at)<=date(?)`)
    .get(fundId, from, to);
  const entries = db.prepare(`SELECT * FROM fund_entries WHERE fund_id=? AND status='approved'
    AND date(approved_at)>=date(?) AND date(approved_at)<=date(?) ORDER BY approved_at, id`).all(fundId, from, to);
  const closing = opening + sums.income_bank + sums.income_cash + sums.adjust - sums.expense;
  return { from, to, opening_balance: opening, income_bank: sums.income_bank, income_cash: sums.income_cash,
    expense: sums.expense, adjust: sums.adjust, closing_balance: closing, entries };
}

router.get('/funds/:id/report', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  const { from, to } = rangeOf(req.query);
  ok(res, { fund: f, ...fundPeriod(f.id, from, to) });
}));

router.get('/funds/:id/report/export', requirePerm('report.export'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  const { from, to } = rangeOf(req.query);
  const { entries } = fundPeriod(f.id, from, to);
  const rows = entries.map((e) => ({
    'Ngày ghi sổ': e.approved_at, 'Mã chứng từ': e.code, 'Loại': TYPE_LABEL[e.type],
    'Nguồn': SRC_LABEL[e.source] || e.source,
    'Số tiền': e.type === 'out' ? -e.amount : e.amount,
    'Người nộp': e.anonymous ? 'Người hảo tâm' : (e.payer_name || ''),
    'Ghi chú': e.note || '', 'Người lập': e.created_by_name || '', 'Người duyệt': e.approved_by_name || '',
  }));
  sendXlsx(res, `so-quy-${f.code}-${from}_${to}`, rows, { sheet: 'So quy' });
}));

/* ===================== Đối soát sao kê (GĐ3.6 — NFR-03, ERR-01) ===================== */
// Thủ quỹ nhập tổng tiền vào theo sao kê ngân hàng của kỳ; hệ thống so với tiền vào qua ngân hàng đã ghi sổ.
// Lệch thì bổ sung khoản thiếu bằng "Thu tiền" nguồn chuyển khoản (manual, có mã giao dịch) rồi đối soát lại.
// ponytail: chỉ đối soát chiều tiền vào; phiếu chi chưa ghi chi bằng tiền mặt hay chuyển khoản. Thêm cột
// phương thức chi cho fund_entries khi thôn cần đối soát cả số dư tài khoản.
function bankIncome(fundId, from, to) {
  if (!DAY.test(from) || !DAY.test(to) || from > to) bad('Khoảng ngày không hợp lệ');
  const entries = db.prepare(`SELECT id, code, amount, source, bank_ref, payer_name, anonymous, note, approved_at FROM fund_entries
    WHERE fund_id=? AND status='approved' AND type='in' AND source IN ('vietqr','manual')
      AND date(approved_at)>=date(?) AND date(approved_at)<=date(?) ORDER BY approved_at, id`).all(fundId, from, to);
  return { total: entries.reduce((s, e) => s + e.amount, 0), entries };
}

router.get('/funds/:id/reconcile', requirePerm('fund.view'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  const { from, to } = rangeOf(req.query);
  const inc = bankIncome(f.id, from, to);
  const history = db.prepare('SELECT * FROM fund_reconciliations WHERE fund_id=? ORDER BY id DESC LIMIT 24').all(f.id);
  ok(res, { from, to, system_in: inc.total, count: inc.entries.length, entries: inc.entries, history });
}));

router.post('/funds/:id/reconciliations', requirePerm('fund.entry'), wrap((req, res) => {
  const f = fundFor(req, req.params.id);
  if (!f) return fail(res, 'Không tìm thấy quỹ', 404);
  const b = req.body || {};
  const from = str(b.from, 10); const to = str(b.to, 10);
  const statement = int(b.statement_in);
  if (!Number.isSafeInteger(statement) || statement < 0 || statement > MAX_AMOUNT * 100) bad('Tổng tiền vào theo sao kê không hợp lệ');
  const inc = bankIncome(f.id, from, to);
  const diff = statement - inc.total;
  const note = str(b.note, 500) || null;
  if (diff !== 0 && !note) bad(`Lệch ${diff.toLocaleString('vi-VN')} ₫. Ghi chú nguyên nhân (ví dụ: khoản nào thiếu, sẽ bổ sung khi nào)`);
  const r = db.prepare(`INSERT INTO fund_reconciliations(fund_id,period_from,period_to,statement_in,system_in,diff,note,created_by,created_by_name)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(f.id, from, to, statement, inc.total, diff, note, req.user.id, req.user.full_name || req.user.username);
  log(req, 'fund.reconcile', 'fund', f.id, { from, to, statement_in: statement, system_in: inc.total, diff });
  ok(res, db.prepare('SELECT * FROM fund_reconciliations WHERE id=?').get(r.lastInsertRowid));
}));

/* ===================== Webhook VietQR (dùng bởi src/routes/vietqr.js) ===================== */
// Tài khoản của quỹ luôn duy nhất toàn hệ thống (BR-02), nên tài khoản đủ để xác định
// tenant + quỹ, không cần bảng theo dõi đơn hàng như luồng hóa đơn.
const resolveFundByBank = (account) => fundByAccount(account);

// p: { transactionid, bankaccount, amount, content, transType, raw }. Khoản thu ghi sổ ngay (approved),
// khớp nguyên tắc đã chốt ở GĐ2.1: tiền đã về quỹ thì ghi nhận luôn, không qua duyệt.
function processFundPayment(code, fundId, p) {
  return db.runWith(code, () => {
    // Webhook là dữ liệu không tin cậy: không có mã giao dịch ngân hàng thì không ghi sổ,
    // vì không chống được ghi trùng khi ngân hàng gửi lại.
    const txnId = str(p.transactionid, 80);
    if (!txnId) return { ref: '', message: 'Thiếu mã giao dịch ngân hàng, không ghi sổ', paid: false };
    const amount = round(p.amount);
    const bank = str(p.bankaccount, 40);
    const content = str(p.content, 60);
    const transType = str(p.transType, 2) || 'C';
    const raw = JSON.stringify(p.raw || {});
    if (db.prepare('SELECT 1 FROM vietqr_transactions WHERE transactionid=?').get(txnId)) {
      return { ref: '', message: 'Giao dịch đã xử lý trước đó', paid: true };
    }
    const f = getFund(fundId);
    const insRaw = db.prepare(`INSERT INTO vietqr_transactions(transactionid,invoice_id,bank_account,amount,content,order_id,trans_type,matched,note,raw_json,category,bank_time)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
    const insTxn = { run: (id, invId, bk, amt, ct, oid, tt, matched, note, rj) =>
      insRaw.run(id, invId, bk, amt, ct, oid, tt, matched, note, rj, tt === 'D' ? 'refund' : matched && f ? (f.kind === 'donation' ? 'donation' : 'fund') : 'unclassified', bankTime(p.raw)) };
    // Ngừng thu / khoá sổ: không tự ghi, để thủ quỹ xử lý ở mục chưa phân loại. Đang thu đợt mới thì nội dung chuyển khoản
    // phải có mã đợt mới (vd AN26-D2); chuyển theo QR đợt cũ (thiếu mã đợt) cũng vào mục chưa phân loại để không nộp nhầm.
    if (!f || f.status !== 'active') {
      insTxn.run(txnId, null, bank, amount, content, '', transType, 0, f ? 'Quỹ đang ngừng thu' : 'Quỹ không hoạt động', raw);
      return { ref: '', message: 'Quỹ không nhận tiền', paid: false };
    }
    const alnum = (x) => removeVietnamese(x).toUpperCase().replace(/[^A-Z0-9]/g, ''); // ngân hàng hay bỏ dấu gạch / khoảng trắng
    if (f.round > 1 && !alnum(content).includes(alnum(transferRef(f)))) {
      insTxn.run(txnId, null, bank, amount, content, '', transType, 0, `Nội dung không có mã đợt ${transferRef(f)} (QR đợt cũ)`, raw);
      return { ref: '', message: 'QR đợt cũ, chờ thủ quỹ xử lý', paid: false };
    }
    if (transType !== 'C' || !amountOk(amount)) {
      insTxn.run(txnId, null, bank, amount, content, '', transType, 0, 'Không phải giao dịch tiền vào', raw);
      return { ref: '', message: 'Không phải giao dịch tiền vào', paid: false };
    }
    const entryCode = makeCode(db, 'PT', 'fund_entries');
    db.exec('BEGIN IMMEDIATE');
    try {
    if (!insTxn.run(txnId, null, bank, amount, content, '', transType, 1, 'Đã ghi vào quỹ ' + f.name, raw).changes) {
      db.exec('ROLLBACK');
      return { ref: '', message: 'Giao dịch đã xử lý trước đó', paid: true };
    }
    db.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,note,status,created_by_name,approved_by_name,approved_at)
      VALUES (?,?,'in',?,'vietqr',?,?,'approved',?,?,datetime('now','localtime'))`)
      .run(entryCode, f.id, amount, txnId, content, 'VietQR', 'Hệ thống (VietQR)');
    db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ref: entryCode, message: 'Đã ghi vào quỹ ' + f.name, paid: true };
  });
}

// GĐ3.2: thủ quỹ ghi một giao dịch chưa phân loại vào quỹ. Gọi trong transaction của route phân loại.
function bookUnclassified(req, t, fundId, by) {
  const f = fundFor(req, fundId);
  if (!f) throw Object.assign(new Error('Không tìm thấy quỹ'), { code: 404 });
  if (f.status !== 'active') throw Object.assign(new Error(NOT_COLLECTING), { code: 400 });
  if (!amountOk(t.amount)) throw Object.assign(new Error('Số tiền giao dịch không hợp lệ'), { code: 400 });
  if (db.prepare('SELECT 1 FROM fund_entries WHERE bank_ref=?').get(t.transactionid)) throw Object.assign(new Error('Giao dịch này đã có trong sổ quỹ'), { code: 400 });
  const code = makeCode(db, 'PT', 'fund_entries');
  db.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,note,status,created_by,created_by_name,approved_by,approved_by_name,approved_at)
    VALUES (?,?,'in',?,'vietqr',?,?,'approved',?,?,?,?,datetime('now','localtime'))`)
    .run(code, f.id, t.amount, t.transactionid, t.content || 'Phân loại từ hàng chờ', req.user.id, by, req.user.id, by);
  log(req, 'fund_entry.create', 'fund_entry', null, { code, from_transaction: t.transactionid, amount: t.amount });
  return { fund: f, code, category: f.kind === 'donation' ? 'donation' : 'fund' };
}

module.exports = router;
module.exports.bookUnclassified = bookUnclassified;
module.exports.resolveFundByBank = resolveFundByBank;
module.exports.processFundPayment = processFundPayment;
module.exports.balanceOf = balanceOf;
module.exports.fundQr = fundQr;
module.exports.fundSummary = fundSummary;
module.exports.autoStopExpired = autoStopExpired;
module.exports.publicFund = { stateOf, STATE_LABEL, transferRef, docsOf, sendDocument };
