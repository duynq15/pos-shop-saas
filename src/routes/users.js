'use strict';

const express = require('express');
const { control, audit } = require('../control');
const { ok, fail, wrap, str, bool } = require('../lib/util');
const { hashPassword } = require('../lib/auth');
const rbac = require('../lib/rbac');
const { requirePerm } = require('../middleware');

const router = express.Router();

const publicUser = (u) => ({ id: u.id, username: u.username, full_name: u.full_name, phone: u.phone, email: u.email, role: u.role, role_name: rbac.roleName(u.role), active: u.active, last_login: u.last_login });

router.get('/roles', requirePerm('user.manage'), (req, res) => ok(res, Object.entries(rbac.ROLES).map(([code, r]) => ({ code, name: r.name }))));

router.get('/users', requirePerm('user.manage'), wrap((req, res) => {
  const rows = control.prepare('SELECT * FROM users WHERE tenant_id=? ORDER BY id').all(req.user.tenant_id);
  ok(res, rows.map(publicUser));
}));

router.post('/users', requirePerm('user.manage'), wrap((req, res) => {
  const username = str(req.body.username, 60).toLowerCase();
  const password = String(req.body.password || '');
  const role = str(req.body.role, 30);
  if (!username) return fail(res, 'Nhập tên đăng nhập');
  if (password.length < 6) return fail(res, 'Mật khẩu tối thiểu 6 ký tự');
  if (!rbac.ROLES[role]) return fail(res, 'Vai trò không hợp lệ');
  if (control.prepare('SELECT id FROM users WHERE lower(username)=?').get(username)) return fail(res, 'Tên đăng nhập đã tồn tại');
  const r = control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,phone,email,role,pin_hash) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.tenant_id, username, hashPassword(password), str(req.body.full_name, 120) || null, str(req.body.phone, 40) || null,
      str(req.body.email, 120) || null, role, req.body.pin ? hashPassword(String(req.body.pin)) : null);
  const id = Number(r.lastInsertRowid);
  audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username, action: 'user.create', entity: 'user', entityId: id, ip: req.ip });
  ok(res, publicUser(control.prepare('SELECT * FROM users WHERE id=?').get(id)));
}));

router.put('/users/:id', requirePerm('user.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const u = control.prepare('SELECT * FROM users WHERE id=? AND tenant_id=?').get(id, req.user.tenant_id);
  if (!u) return fail(res, 'Không tìm thấy người dùng', 404);
  const role = req.body.role ? str(req.body.role, 30) : u.role;
  if (!rbac.ROLES[role]) return fail(res, 'Vai trò không hợp lệ');
  const active = req.body.active === undefined ? u.active : bool(req.body.active);
  if (id === req.user.id && active === 0) return fail(res, 'Không thể tự khóa tài khoản của mình');
  control.prepare('UPDATE users SET full_name=?, phone=?, email=?, role=?, active=? WHERE id=?')
    .run(str(req.body.full_name, 120) || u.full_name, str(req.body.phone, 40) || null, str(req.body.email, 120) || null, role, active, id);
  if (req.body.password) {
    if (String(req.body.password).length < 6) return fail(res, 'Mật khẩu tối thiểu 6 ký tự');
    control.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(req.body.password)), id);
  }
  if (req.body.pin) control.prepare('UPDATE users SET pin_hash=? WHERE id=?').run(hashPassword(String(req.body.pin)), id);
  audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username, action: 'user.update', entity: 'user', entityId: id, ip: req.ip });
  ok(res, publicUser(control.prepare('SELECT * FROM users WHERE id=?').get(id)));
}));

router.delete('/users/:id', requirePerm('user.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return fail(res, 'Không thể xóa tài khoản đang đăng nhập');
  const u = control.prepare('SELECT * FROM users WHERE id=? AND tenant_id=?').get(id, req.user.tenant_id);
  if (!u) return fail(res, 'Không tìm thấy người dùng', 404);
  if (u.role === 'owner' && control.prepare("SELECT COUNT(*) c FROM users WHERE tenant_id=? AND role='owner' AND active=1").get(req.user.tenant_id).c <= 1) {
    return fail(res, 'Phải còn ít nhất một chủ cửa hàng');
  }
  control.prepare('UPDATE users SET active=0 WHERE id=?').run(id);
  audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username, action: 'user.disable', entity: 'user', entityId: id, ip: req.ip });
  ok(res, true);
}));

module.exports = router;
