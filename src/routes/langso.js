'use strict';

// API cho cổng quản trị Làng Số (repo lang-so), mục Thanh toán số: số liệu, khoản chờ duyệt và hoạt động sổ quỹ của một thôn.
// Trình duyệt bên Làng Số gọi thẳng (CORS *), xác thực bằng token SKHG (Authorization: Bearer), không dùng cookie.
// ?thon=<mã cộng đồng>. Chỉ tài khoản sổ quỹ của thôn (trùng SĐT / email SKHG) mới xem được.
const express = require('express');
const db = require('../db');
const rbac = require('../lib/rbac');
const { ok, wrap, bad, ymd } = require('../lib/util');
const { accountFor } = require('../lib/skhg');
const { communityScope, sellerStats } = require('./community');
const { balanceOf } = require('./funds');

const router = express.Router();
const ADMIN = '/?view=funds';

router.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '600' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const bearer = (req) => (/^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '') || [])[1];
const scope = (fn) => wrap(async (req, res) => {
  const a = await accountFor(bearer(req), req.query.thon);
  if (!rbac.has(rbac.permsFor(a.user.role), 'fund.view')) bad('Tài khoản không có quyền xem sổ quỹ', 403);
  // Thủ quỹ chỉ thấy quỹ được giao (và quỹ chưa giao ai), như trong web
  const mine = a.user.role === 'treasurer' ? ' AND (f.manager_user_id IS NULL OR f.manager_user_id=' + Number(a.user.id) + ')' : '';
  ok(res, db.runWith(a.tenant.code, () => fn(a, mine)));
});

router.get('/stats', scope(({ tenant }, mine) => {
  const now = new Date();
  const monthOf = (k) => ymd(new Date(now.getFullYear(), now.getMonth() + k, 1)).slice(0, 7);
  const rows = db.prepare(`SELECT substr(e.approved_at,1,7) m, COUNT(CASE WHEN e.type='in' THEN 1 END) n,
      SUM(CASE WHEN e.type='in' THEN e.amount ELSE 0 END) i, SUM(CASE WHEN e.type='out' THEN e.amount ELSE 0 END) o
    FROM fund_entries e JOIN funds f ON f.id=e.fund_id WHERE e.status='approved' AND e.approved_at>=?${mine} GROUP BY m`).all(monthOf(-5) + '-01');
  const months = [-5, -4, -3, -2, -1, 0].map((k) => {
    const r = rows.find((x) => x.m === monthOf(k)) || {};
    return { month: monthOf(k), count: Number(r.n || 0), in: Number(r.i || 0), out: Number(r.o || 0) };
  });
  const pending = db.prepare(`SELECT COUNT(*) n FROM fund_entries e JOIN funds f ON f.id=e.fund_id WHERE e.status='submitted'${mine}`).get().n;
  const funds = db.prepare(`SELECT f.id, f.name, f.kind FROM funds f WHERE f.status='active'${mine} ORDER BY f.id`).all()
    .map((f) => ({ name: f.name, kind: f.kind, balance: balanceOf(f.id) }));
  // Giao dịch bán (hóa đơn đã thanh toán) của các người bán trong thôn, tháng này
  const sales = { count: 0, amount: 0 };
  for (const code of communityScope({ tenant }) || []) {
    const s = sellerStats(code, monthOf(0) + '-01', ymd(now));
    sales.count += s.count;
    sales.amount += s.amount;
  }
  return { month: months[5], pending: Number(pending), sales, months, funds };
}));

router.get('/todo', scope((a, mine) => db.prepare(`SELECT e.code, e.type, e.amount, e.note, e.created_by_name, e.created_at, f.name fund
  FROM fund_entries e JOIN funds f ON f.id=e.fund_id WHERE e.status='submitted'${mine} ORDER BY e.created_at, e.id`).all()
  .map((x) => ({ ...x, admin: ADMIN }))));

router.get('/activity', scope((a, mine) => db.prepare(`SELECT e.code, e.type, e.amount, e.source, e.note, e.approved_by_name, e.approved_at, f.name fund,
    CASE WHEN e.anonymous THEN NULL ELSE e.payer_name END payer
  FROM fund_entries e JOIN funds f ON f.id=e.fund_id WHERE e.status='approved'${mine} ORDER BY e.approved_at DESC, e.id DESC LIMIT 30`).all()
  .map((x) => ({ ...x, admin: ADMIN }))));

module.exports = router;
