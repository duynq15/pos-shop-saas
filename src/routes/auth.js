'use strict';

const express = require('express');
const { control, audit, newToken, tokenHash, tenantExpired, communityRoleLabels, platformRole } = require('../control');
const { ok, fail, wrap, str } = require('../lib/util');
const { hashPassword, verifyPassword, sessionCookie, clearCookie, parseCookies, COOKIE } = require('../lib/auth');
const rbac = require('../lib/rbac');
const { SESSION_TTL_MS } = require('../middleware');
const skhg = require('../lib/skhg');

const router = express.Router();

// Giới hạn đăng nhập sai theo IP (chống dò mật khẩu)
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 10;
function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.ts > WINDOW_MS) { attempts.set(ip, { count: 1, ts: now }); return false; }
  a.count++;
  return a.count > MAX_TRIES;
}

const fmtUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

function createSession(user, req) {
  const { token, hash } = newToken();
  const expires = fmtUtc(new Date(Date.now() + SESSION_TTL_MS));
  control.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,ip,user_agent) VALUES (?,?,?,?,?,?)')
    .run(hash, user.id, user.tenant_id, expires, req.ip || null, str(req.headers['user-agent'], 200) || null);
  return token;
}

const payload = (user, tenant, pr = user.tenant_id == null ? platformRole(user.role) : null) => ({
  user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role,
    role_name: pr ? pr.name : rbac.roleName(user.role, communityRoleLabels(tenant && tenant.community_id)), tenant_id: user.tenant_id },
  tenant: tenant ? { code: tenant.code, name: tenant.name, status: tenant.status, kind: tenant.kind || 'shop', community_id: tenant.community_id ?? null } : null,
  permissions: user.tenant_id == null ? (pr ? pr.permissions : []) : rbac.permsFor(user.role),
  app_env: process.env.NODE_ENV || 'development',
});

router.post('/login', wrap((req, res) => {
  if (tooMany(req.ip)) return fail(res, 'Quá nhiều lần đăng nhập sai, vui lòng thử lại sau', 429);
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
    if (tenant && tenantExpired(tenant)) return fail(res, 'Cửa hàng đã hết hạn sử dụng', 403);
  }
  const token = createSession(user, req);
  control.prepare("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?").run(user.id);
  audit({ tenantId: user.tenant_id, userId: user.id, username: user.username, action: 'login', ip: req.ip });
  attempts.delete(req.ip);
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), !!req.secure));
  ok(res, payload(user, tenant));
}));

// Đăng nhập một lần từ Làng Số: trang mở <web>/?thon=<mã>#sso=<token SKHG>, giao diện gửi token lên đây.
router.post('/sso', wrap(async (req, res) => {
  if (tooMany(req.ip)) return fail(res, 'Quá nhiều lần đăng nhập sai, vui lòng thử lại sau', 429);
  const { tenant, user } = await skhg.accountFor(str(req.body.token, 4000), str(req.body.thon, 80));
  if (tenantExpired(tenant)) return fail(res, 'Cửa hàng đã hết hạn sử dụng', 403);
  const token = createSession(user, req);
  control.prepare("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?").run(user.id);
  audit({ tenantId: user.tenant_id, userId: user.id, username: user.username, action: 'login', detail: 'sso lang-so', ip: req.ip });
  attempts.delete(req.ip);
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), !!req.secure));
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
  ok(res, { user: req.user, tenant: req.tenant || null, permissions: req.permissions, app_env: process.env.NODE_ENV || 'development' });
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
