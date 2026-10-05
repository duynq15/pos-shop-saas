'use strict';

const express = require('express');
const os = require('os');
const QRCode = require('qrcode');
const db = require('../db');
const { ok, fail, wrap, bad, round, num, str, bool } = require('../lib/util');
const { requirePerm } = require('../middleware');
const { buildVietQR } = require('../lib/vietqr');
const { accountConflict, CONFLICT_MSG } = require('../lib/community');

const router = express.Router();

/* ===================== CÀI ĐẶT ===================== */
function getSettings() {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
router.get('/settings', wrap((req, res) => ok(res, getSettings())));
router.put('/settings', requirePerm('settings.edit'), wrap((req, res) => {
  // GĐ0.2 (BR-02, SEC-01): tài khoản nhận tiền của tenant thuộc cộng đồng phải là tài khoản riêng
  const body = req.body || {};
  if (body.bank_account !== undefined && req.tenant && accountConflict(req.tenant.code, body.bank_account)) {
    return fail(res, CONFLICT_MSG);
  }
  const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(req.body || {})) up.run(str(k, 60), String(v ?? ''));
  ok(res, getSettings());
}));

/* ===================== THÔNG TIN MÁY CHỦ (LAN) ===================== */
router.get('/info', wrap((req, res) => {
  const port = req.app.locals.port || process.env.PORT || 3000;
  const urls = [{ name: 'Máy này', url: `http://localhost:${port}` }];
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push({ name: iface, url: `http://${a.address}:${port}` });
    }
  }
  ok(res, { hostname: os.hostname(), port, urls, platform: process.platform, node: process.version, time: new Date().toISOString() });
}));

router.get('/info/qr', wrap(async (req, res) => {
  const port = req.app.locals.port || process.env.PORT || 3000;
  let target = str(req.query.url, 200);
  if (!target) {
    for (const [, addrs] of Object.entries(os.networkInterfaces())) {
      const a = (addrs || []).find((x) => x.family === 'IPv4' && !x.internal);
      if (a) { target = `http://${a.address}:${port}`; break; }
    }
  }
  if (!target) target = `http://localhost:${port}`;
  const dataUrl = await QRCode.toDataURL(target, { width: 260, margin: 1 });
  ok(res, { url: target, dataUrl });
}));

/* ===================== QR CHUYỂN KHOẢN ===================== */
router.get('/qr', wrap(async (req, res) => {
  const s = getSettings();
  if (!s.bank_account || !s.bank_bin) return fail(res, 'Chưa cấu hình tài khoản ngân hàng trong Cài đặt');
  const amount = round(req.query.amount || 0);
  const message = str(req.query.message, 120);
  const payload = buildVietQR({ bankBin: s.bank_bin, accountNo: s.bank_account, amount, message });
  const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
  ok(res, { payload, dataUrl, bank_name: s.bank_name, bank_account: s.bank_account, account_holder: s.account_holder, amount, message });
}));

/* ===================== KHUYẾN MÃI ===================== */
router.get('/promotions', wrap((req, res) => {
  const activeOnly = req.query.active === '1';
  let sql = 'SELECT * FROM promotions';
  if (activeOnly) sql += ' WHERE active=1';
  sql += ' ORDER BY active DESC, priority DESC, id DESC';
  ok(res, db.prepare(sql).all());
}));
function validatePromo(b) {
  if (!str(b.name)) bad('Tên khuyến mãi trống');
  if (!['order', 'item'].includes(b.kind)) bad('Loại khuyến mãi không hợp lệ');
  if (!['percent', 'amount'].includes(b.discount_type)) bad('Kiểu giảm giá không hợp lệ');
  if (num(b.discount_value) <= 0) bad('Giá trị giảm phải lớn hơn 0');
  if (b.kind === 'order' && b.discount_type === 'percent' && num(b.discount_value) > 100) bad('Phần trăm giảm tối đa 100%');
}
router.post('/promotions', requirePerm('promo.manage'), wrap((req, res) => {
  const b = req.body || {};
  validatePromo(b);
  const r = db.prepare(`INSERT INTO promotions(name,kind,discount_type,discount_value,target_type,target_id,min_subtotal,min_qty,start_date,end_date,priority,active,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    str(b.name, 120), b.kind, b.discount_type, num(b.discount_value), str(b.target_type) || 'all', b.target_id || null,
    round(b.min_subtotal), num(b.min_qty || 0), str(b.start_date, 20) || null, str(b.end_date, 20) || null, round(b.priority), bool(b.active) || (b.active === undefined ? 1 : 0), str(b.note, 300) || null);
  ok(res, db.prepare('SELECT * FROM promotions WHERE id=?').get(Number(r.lastInsertRowid)));
}));
router.put('/promotions/:id', requirePerm('promo.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  validatePromo(b);
  db.prepare(`UPDATE promotions SET name=?,kind=?,discount_type=?,discount_value=?,target_type=?,target_id=?,min_subtotal=?,min_qty=?,start_date=?,end_date=?,priority=?,active=?,note=? WHERE id=?`).run(
    str(b.name, 120), b.kind, b.discount_type, num(b.discount_value), str(b.target_type) || 'all', b.target_id || null,
    round(b.min_subtotal), num(b.min_qty || 0), str(b.start_date, 20) || null, str(b.end_date, 20) || null, round(b.priority), bool(b.active), str(b.note, 300) || null, id);
  ok(res, db.prepare('SELECT * FROM promotions WHERE id=?').get(id));
}));
router.delete('/promotions/:id', requirePerm('promo.manage'), wrap((req, res) => {
  db.prepare('DELETE FROM promotions WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

module.exports = { router, getSettings };
