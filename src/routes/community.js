'use strict';

// Số liệu tổng hợp cộng đồng cho ban lãnh đạo (GĐ1.4 — FR-18, BR-07, BR-09, ERR-08).
// Chỉ trả số tổng; không có trường nào theo từng người bán.
const express = require('express');
const db = require('../db');
const { control, audit, communitySettings } = require('../control');
const { ok, fail, wrap, bad, str, int, today: todayLocal } = require('../lib/util');
const { requirePerm, can } = require('../middleware');

const router = express.Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Tenant bán hàng (seller, shop) cùng cộng đồng với tenant đang đăng nhập.
// Chỉ tenant kind=community mới có phạm vi; tenant khác nhận null.
function communityScope(req) {
  const t = req.tenant;
  if (!t || t.kind !== 'community' || !t.community_id) return null;
  return control.prepare("SELECT code FROM tenants WHERE community_id=? AND kind IN ('seller','shop') ORDER BY id")
    .all(t.community_id).map((r) => r.code);
}

// "Giao dịch" = hóa đơn bán đã thanh toán. Giao dịch VietQR đã khớp đã nằm trong hóa đơn;
// giao dịch chưa khớp chưa vào báo cáo cho đến khi được phân loại (ERR-03).
function sellerStats(code, from, to) {
  return db.runWith(code, (conn) => {
    const range = conn.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM invoices
      WHERE status='paid' AND type='sale' AND date(created_at)>=date(?) AND date(created_at)<=date(?)`).get(from, to);
    const first = conn.prepare(`SELECT 1 FROM invoices WHERE status='paid' AND type='sale' AND date(created_at)<=date(?) LIMIT 1`).get(to);
    return { count: Number(range.c), amount: Number(range.s), converted: !!first };
  });
}

router.get('/community/summary', requirePerm('community.report'), wrap((req, res) => {
  const codes = communityScope(req);
  if (!codes) return fail(res, 'Chỉ tài khoản của cộng đồng mới xem được báo cáo cộng đồng', 403);
  const cm = control.prepare('SELECT status FROM communities WHERE id=?').get(req.tenant.community_id);
  if (!cm || cm.status !== 'active') return fail(res, 'Cộng đồng đang tạm ngưng', 403);
  const today = todayLocal();
  const from = DAY.test(req.query.from || '') ? req.query.from : today;
  const to = DAY.test(req.query.to || '') ? req.query.to : from;
  if (from > to) return fail(res, 'Khoảng thời gian không hợp lệ');
  const sum = { sellers: codes.length, converted_sellers: 0, transactions: 0, amount: 0 };
  for (const code of codes) {
    const s = sellerStats(code, from, to);
    sum.transactions += s.count;
    sum.amount += s.amount;
    if (s.converted) sum.converted_sellers += 1;
  }
  ok(res, { community_id: req.tenant.community_id, from, to, ...sum });
}));

// Link công khai để người dân xem đợt thu / công đức và quét QR. Chỉ trả khi nền tảng đã bật công khai.
router.get('/community/public-link', requirePerm('fund.view'), wrap((req, res) => {
  const cid = myCommunity(req);
  if (!cid) return fail(res, 'Chỉ tài khoản thuộc cộng đồng mới có link công khai', 403);
  const c = control.prepare('SELECT settings, donations_token FROM communities WHERE id=?').get(cid);
  const enabled = !!(c && c.donations_token && communitySettings(c.settings).public_donations);
  ok(res, { enabled, url: enabled ? '/congduc/' + c.donations_token : null });
}));

/* ===================== Hạng mục hàng dùng chung (GĐ4.3 — FR-10, BR-11, AC-02-2) ===================== */
// Danh mục thuộc cộng đồng (control.db). Mọi tenant trong cộng đồng đọc được; chỉ community.categories sửa.
const catLog = (req, action, id, detail) => audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username,
  action, entity: 'community_category', entityId: id, detail: JSON.stringify(detail), ip: req.ip });
const nameKey = (v) => String(v).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const myCommunity = (req) => (req.tenant && req.tenant.community_id) || null;
const categoriesOf = (communityId, all) => control.prepare(`SELECT id, name, sort_order, status FROM community_categories
  WHERE community_id=?${all ? '' : " AND status='active'"} ORDER BY status, sort_order, name`).all(communityId);
// Hạng mục hợp lệ cho tenant hiện tại: thuộc đúng cộng đồng và đang dùng. Dùng khi người bán gắn hạng mục.
function categoryFor(req, id) {
  const cid = myCommunity(req);
  if (!cid || !id) return null;
  return control.prepare("SELECT id, name FROM community_categories WHERE id=? AND community_id=? AND status='active'").get(Number(id), cid) || null;
}

router.get('/community/categories', wrap((req, res) => {
  const cid = myCommunity(req);
  if (!cid) return ok(res, []);
  ok(res, categoriesOf(cid, req.tenant.kind === 'community' && can(req, 'community.categories') && req.query.all === '1'));
}));

// Sửa danh mục: chỉ tenant cộng đồng (trưởng thôn / người được ủy quyền). Chủ tenant người bán có quyền '*'
// nên phải chặn theo loại tenant, không chỉ theo quyền (BR-11: người bán chỉ chọn).
const manageCategories = (req, res, next) => (req.tenant && req.tenant.kind === 'community'
  ? requirePerm('community.categories')(req, res, next) : fail(res, 'Chỉ trưởng thôn quản lý danh mục hạng mục', 403));

router.post('/community/categories', manageCategories, wrap((req, res) => {
  const cid = myCommunity(req);
  if (!cid) return fail(res, 'Chỉ tài khoản thuộc cộng đồng mới quản lý hạng mục', 403);
  const name = str((req.body || {}).name, 60);
  if (!name) bad('Nhập tên hạng mục');
  if (control.prepare('SELECT 1 FROM community_categories WHERE community_id=? AND name_key=?').get(cid, nameKey(name))) bad('Hạng mục đã có');
  const max = control.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM community_categories WHERE community_id=?').get(cid).m;
  const r = control.prepare('INSERT INTO community_categories(community_id,name,name_key,sort_order) VALUES (?,?,?,?)').run(cid, name, nameKey(name), max + 1);
  catLog(req, 'category.create', r.lastInsertRowid, { name });
  ok(res, categoriesOf(cid, true));
}));

router.patch('/community/categories/:id', manageCategories, wrap((req, res) => {
  const cid = myCommunity(req);
  const cur = cid && control.prepare('SELECT * FROM community_categories WHERE id=? AND community_id=?').get(Number(req.params.id), cid);
  if (!cur) return fail(res, 'Không tìm thấy hạng mục', 404);
  const b = req.body || {};
  const name = b.name !== undefined ? str(b.name, 60) : cur.name;
  if (!name) bad('Nhập tên hạng mục');
  if (control.prepare('SELECT 1 FROM community_categories WHERE community_id=? AND name_key=? AND id<>?').get(cid, nameKey(name), cur.id)) bad('Hạng mục đã có');
  const status = b.status !== undefined ? b.status : cur.status;
  if (!['active', 'hidden'].includes(status)) bad('Trạng thái không hợp lệ');
  const sort = b.sort_order !== undefined ? int(b.sort_order) : cur.sort_order;
  control.prepare('UPDATE community_categories SET name=?, name_key=?, status=?, sort_order=? WHERE id=?').run(name, nameKey(name), status, sort, cur.id);
  catLog(req, 'category.update', cur.id, { from: { name: cur.name, status: cur.status }, to: { name, status } });
  ok(res, categoriesOf(cid, true));
}));

module.exports = router;
module.exports.communityScope = communityScope;
module.exports.categoryFor = categoryFor;
module.exports.sellerStats = sellerStats;
