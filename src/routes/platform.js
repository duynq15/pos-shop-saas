'use strict';

const express = require('express');
const { control, audit } = require('../control');
const db = require('../db');
const { ok, fail, wrap, str } = require('../lib/util');
const { hashPassword } = require('../lib/auth');
const rbac = require('../lib/rbac');
const { isPlatform } = require('../middleware');

const router = express.Router();
router.use((req, res, next) => {
  if (!isPlatform(req)) return fail(res, 'Chỉ quản trị nền tảng', 403);
  next();
});

const codeOk = (c) => /^[a-z0-9_-]{2,30}$/.test(c);

router.get('/plans', wrap((req, res) => {
  ok(res, control.prepare('SELECT * FROM plans WHERE active=1 ORDER BY price').all());
}));

router.get('/tenants', wrap((req, res) => {
  const rows = control.prepare(`SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS user_count
    FROM tenants t ORDER BY t.id`).all();
  ok(res, rows);
}));

router.post('/tenants', wrap((req, res) => {
  const code = str(req.body.code, 30).toLowerCase();
  const name = str(req.body.name, 160);
  if (!codeOk(code)) return fail(res, 'Mã cửa hàng chỉ gồm a-z, 0-9, _ , - (2–30 ký tự)');
  if (!name) return fail(res, 'Nhập tên cửa hàng');
  if (control.prepare('SELECT id FROM tenants WHERE code=?').get(code)) return fail(res, 'Mã cửa hàng đã tồn tại');
  const ownerUser = str(req.body.owner_username, 60).toLowerCase();
  const ownerPass = String(req.body.owner_password || '');
  if (!ownerUser || ownerPass.length < 6) return fail(res, 'Cần tài khoản chủ (tối thiểu 6 ký tự mật khẩu)');
  if (control.prepare('SELECT id FROM users WHERE lower(username)=?').get(ownerUser)) return fail(res, 'Tên đăng nhập chủ đã tồn tại');

  const r = control.prepare('INSERT INTO tenants(code,name,plan,note,expires_at) VALUES (?,?,?,?,?)')
    .run(code, name, str(req.body.plan, 30) || 'standard', str(req.body.note, 300) || null, str(req.body.expires_at, 30) || null);
  const tenantId = Number(r.lastInsertRowid);
  control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)')
    .run(tenantId, ownerUser, hashPassword(ownerPass), str(req.body.owner_name, 120) || 'Chủ cửa hàng', 'owner');
  db.getTenantDb(code); // khởi tạo database nghiệp vụ cho cửa hàng
  // Đặt tên cửa hàng trong cấu hình tenant
  db.runWith(code, (conn) => conn.prepare("UPDATE settings SET value=? WHERE key='shop_name'").run(name));
  audit({ userId: req.user.id, username: req.user.username, action: 'tenant.create', entity: 'tenant', entityId: tenantId, detail: code, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId));
}));

router.put('/tenants/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const t = control.prepare('SELECT * FROM tenants WHERE id=?').get(id);
  if (!t) return fail(res, 'Không tìm thấy cửa hàng', 404);
  control.prepare('UPDATE tenants SET name=?, status=?, plan=?, note=?, expires_at=? WHERE id=?')
    .run(str(req.body.name, 160) || t.name, str(req.body.status, 20) || t.status, str(req.body.plan, 30) || t.plan, str(req.body.note, 300) || null,
      req.body.expires_at === undefined ? t.expires_at : (str(req.body.expires_at, 30) || null), id);
  audit({ userId: req.user.id, username: req.user.username, action: 'tenant.update', entity: 'tenant', entityId: id, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM tenants WHERE id=?').get(id));
}));

router.get('/users', wrap((req, res) => {
  const tid = req.query.tenant_id ? Number(req.query.tenant_id) : null;
  const rows = tid
    ? control.prepare('SELECT * FROM users WHERE tenant_id=? ORDER BY id').all(tid)
    : control.prepare('SELECT * FROM users ORDER BY tenant_id, id').all();
  ok(res, rows.map((u) => ({ id: u.id, tenant_id: u.tenant_id, username: u.username, full_name: u.full_name, role: u.role, active: u.active, last_login: u.last_login })));
}));

router.get('/stats', wrap((req, res) => {
  const tenants = control.prepare('SELECT COUNT(*) c FROM tenants').get().c;
  const users = control.prepare('SELECT COUNT(*) c FROM users WHERE tenant_id IS NOT NULL').get().c;
  const byStatus = control.prepare('SELECT status, COUNT(*) c FROM tenants GROUP BY status').all();
  ok(res, { tenants, users, by_status: byStatus, roles: Object.keys(rbac.ROLES) });
}));

module.exports = router;
