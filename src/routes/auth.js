'use strict';

const express = require('express');
const { control, audit, newToken, tokenHash } = require('../control');
const { ok, fail, wrap, str } = require('../lib/util');
const { hashPassword, verifyPassword, sessionCookie, clearCookie, parseCookies, COOKIE } = require('../lib/auth');
const rbac = require('../lib/rbac');
const { SESSION_TTL_MS } = require('../middleware');

const router = express.Router();

const fmtUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

function createSession(user, req) {
  const { token, hash } = newToken();
  const expires = fmtUtc(new Date(Date.now() + SESSION_TTL_MS));
  control.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,ip,user_agent) VALUES (?,?,?,?,?,?)')
    .run(hash, user.id, user.tenant_id, expires, req.ip || null, str(req.headers['user-agent'], 200) || null);
  return token;
}

const payload = (user, tenant) => ({
  user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, tenant_id: user.tenant_id },
  tenant: tenant ? { code: tenant.code, name: tenant.name, status: tenant.status } : null,
  permissions: user.role === 'platform' ? ['*'] : rbac.permsFor(user.role),
});

router.post('/login', wrap((req, res) => {
  const username = str(req.body.username, 80).toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) return fail(res, 'Nhập tài khoản và mật khẩu');
  const user = control.prepare('SELECT * FROM users WHERE lower(username)=?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    audit({ action: 'login_failed', entity: 'user', entityId: username, ip: req.ip });
    return fail(res, 'Tài khoản hoặc mật khẩu không đúng', 401);
  }
  if (!user.active) return fail(res, 'Tài khoản đã bị khóa', 403);
  let tenant = null;
  if (user.tenant_id) {
    tenant = control.prepare('SELECT * FROM tenants WHERE id=?').get(user.tenant_id);
    if (tenant && tenant.status === 'suspended') return fail(res, 'Cửa hàng đang tạm ngưng', 403);
  }
  const token = createSession(user, req);
  control.prepare("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?").run(user.id);
  audit({ tenantId: user.tenant_id, userId: user.id, username: user.username, action: 'login', ip: req.ip });
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
  ok(res, payload(user, tenant));
}));

router.post('/logout', wrap((req, res) => {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) control.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
  res.setHeader('Set-Cookie', clearCookie());
  ok(res, true);
}));

router.get('/me', wrap((req, res) => {
  if (!req.user) return fail(res, 'Chưa đăng nhập', 401);
  ok(res, { user: req.user, tenant: req.tenant || null, permissions: req.permissions });
}));

router.post('/change-password', wrap((req, res) => {
  if (!req.user) return fail(res, 'Chưa đăng nhập', 401);
  const oldPw = String(req.body.old_password || '');
  const newPw = String(req.body.new_password || '');
  if (newPw.length < 6) return fail(res, 'Mật khẩu mới tối thiểu 6 ký tự');
  const user = control.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(oldPw, user.password_hash)) return fail(res, 'Mật khẩu hiện tại không đúng');
  control.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(newPw), user.id);
  audit({ tenantId: user.tenant_id, userId: user.id, username: user.username, action: 'change_password' });
  ok(res, true);
}));

module.exports = router;
