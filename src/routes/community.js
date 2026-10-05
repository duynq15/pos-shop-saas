'use strict';

// Số liệu tổng hợp cộng đồng cho ban lãnh đạo (GĐ1.4 — FR-18, BR-07, BR-09, ERR-08).
// Chỉ trả số tổng; không có trường nào theo từng người bán.
const express = require('express');
const db = require('../db');
const { control } = require('../control');
const { ok, fail, wrap } = require('../lib/util');
const { requirePerm } = require('../middleware');

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
  const today = new Date().toISOString().slice(0, 10);
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

module.exports = router;
module.exports.communityScope = communityScope;
