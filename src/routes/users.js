'use strict';

const express = require('express');
const { control, audit, planOf, communityRoleLabels } = require('../control');
const { ok, fail, wrap, str, bool } = require('../lib/util');
const { hashPassword } = require('../lib/auth');
const rbac = require('../lib/rbac');
const { requirePerm } = require('../middleware');

const router = express.Router();

const publicUser = (u, labels) => ({ id: u.id, username: u.username, full_name: u.full_name, phone: u.phone, email: u.email, role: u.role, role_name: rbac.roleName(u.role, labels), active: u.active, last_login: u.last_login, skhg: !!u.skhg_id });

// Chỉ vai trò hợp với loại tenant hiện tại (FR-02)
const tenantKind = (req) => (req.tenant && req.tenant.kind) || 'shop';
const labelsOf = (req) => communityRoleLabels(req.tenant && req.tenant.community_id);
router.get('/roles', requirePerm('user.manage'), (req, res) =>
  ok(res, rbac.rolesFor(tenantKind(req)).map((code) => ({ code, name: rbac.roleName(code, labelsOf(req)), desc: code === 'owner' && tenantKind(req) === 'community' ? 'Toàn quyền sổ quỹ: người dùng, cài đặt, quỹ.' : rbac.ROLES[code].desc || '' }))));

router.get('/users', requirePerm('user.manage'), wrap((req, res) => {
  const rows = control.prepare('SELECT * FROM users WHERE tenant_id=? ORDER BY id').all(req.user.tenant_id);
  ok(res, rows.map((u) => publicUser(u, labelsOf(req))));
}));

router.post('/users', requirePerm('user.manage'), wrap((req, res) => {
  const username = str(req.body.username, 60).toLowerCase();
  const password = String(req.body.password || '');
  const role = str(req.body.role, 30);
  if (!username) return fail(res, 'Nhập tên đăng nhập');
  if (password.length < 6) return fail(res, 'Mật khẩu tối thiểu 6 ký tự');
  if (!rbac.ROLES[role]) return fail(res, 'Vai trò không hợp lệ');
  if (!rbac.roleAllowed(role, tenantKind(req))) return fail(res, 'Vai trò không dùng được cho loại cửa hàng này');
  if (control.prepare('SELECT id FROM users WHERE lower(username)=?').get(username)) return fail(res, 'Tên đăng nhập đã tồn tại');
  const tenant = control.prepare('SELECT * FROM tenants WHERE id=?').get(req.user.tenant_id);
  const plan = planOf(tenant);
  const ucnt = control.prepare('SELECT COUNT(*) c FROM users WHERE tenant_id=? AND active=1 AND skhg_id IS NULL').get(req.user.tenant_id).c; // thành viên SKHG tự tạo không chiếm suất gói
  if (plan && plan.max_users && ucnt >= plan.max_users) return fail(res, `Gói "${plan.name}" chỉ cho tối đa ${plan.max_users} người dùng`);
  const r = control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,phone,email,role,pin_hash) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.tenant_id, username, hashPassword(password), str(req.body.full_name, 120) || null, str(req.body.phone, 40) || null,
      str(req.body.email, 120) || null, role, req.body.pin ? hashPassword(String(req.body.pin)) : null);
  const id = Number(r.lastInsertRowid);
  audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username, action: 'user.create', entity: 'user', entityId: id, ip: req.ip });
  ok(res, publicUser(control.prepare('SELECT * FROM users WHERE id=?').get(id), labelsOf(req)));
}));

router.put('/users/:id', requirePerm('user.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const u = control.prepare('SELECT * FROM users WHERE id=? AND tenant_id=?').get(id, req.user.tenant_id);
  if (!u) return fail(res, 'Không tìm thấy người dùng', 404);
  const role = req.body.role ? str(req.body.role, 30) : u.role;
  if (!rbac.ROLES[role]) return fail(res, 'Vai trò không hợp lệ');
  // Chỉ chặn khi đổi vai trò, để vẫn sửa được thông tin người dùng cũ (FR-02)
  if (role !== u.role && !rbac.roleAllowed(role, tenantKind(req))) return fail(res, 'Vai trò không dùng được cho loại cửa hàng này');
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
  ok(res, publicUser(control.prepare('SELECT * FROM users WHERE id=?').get(id), labelsOf(req)));
}));

router.delete('/users/:id', requirePerm('user.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return fail(res, 'Không thể xóa tài khoản đang đăng nhập');
  const u = control.prepare('SELECT * FROM users WHERE id=? AND tenant_id=?').get(id, req.user.tenant_id);
  if (!u) return fail(res, 'Không tìm thấy người dùng', 404);
  if (u.role === 'owner' && control.prepare("SELECT COUNT(*) c FROM users WHERE tenant_id=? AND role='owner' AND active=1").get(req.user.tenant_id).c <= 1) {
    return fail(res, tenantKind(req) === 'community' ? 'Phải còn ít nhất một quản trị sổ quỹ' : 'Phải còn ít nhất một chủ cửa hàng');
  }
  control.prepare('UPDATE users SET active=0 WHERE id=?').run(id);
  audit({ tenantId: req.user.tenant_id, userId: req.user.id, username: req.user.username, action: 'user.disable', entity: 'user', entityId: id, ip: req.ip });
  ok(res, true);
}));

module.exports = router;
