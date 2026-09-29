'use strict';

const { control, tokenHash, communityRoleLabels } = require('./control');
const db = require('./db');
const { parseCookies, COOKIE } = require('./lib/auth');
const rbac = require('./lib/rbac');
const { fail } = require('./lib/util');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ

// Gắn thông tin phiên (nếu có) vào req: user, role, tenant, permissions.
function attachSession(req, res, next) {
  req.user = null;
  req.permissions = [];
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = control.prepare(`SELECT s.expires_at, u.id, u.username, u.full_name, u.role, u.tenant_id, u.active,
        t.code AS tenant_code, t.name AS tenant_name, t.status AS tenant_status,
        t.kind AS tenant_kind, t.community_id AS tenant_community_id
      FROM sessions s JOIN users u ON u.id = s.user_id
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ?`).get(tokenHash(token));
    if (row && row.active && row.expires_at > nowUtc()) {
      req.user = { id: row.id, username: row.username, full_name: row.full_name, role: row.role, role_name: rbac.roleName(row.role, communityRoleLabels(row.tenant_community_id)), tenant_id: row.tenant_id };
      req.tenant = row.tenant_id ? { code: row.tenant_code, name: row.tenant_name, status: row.tenant_status,
        kind: row.tenant_kind || 'shop', community_id: row.tenant_community_id ?? null } : null;
      req.permissions = row.role === 'platform' ? ['*'] : rbac.permsFor(row.role);
    }
  }
  next();
}

const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function requireAuth(req, res, next) {
  if (!req.user) return fail(res, 'Chưa đăng nhập', 401);
  if (req.tenant && req.tenant.status === 'suspended') return fail(res, 'Cửa hàng đang tạm ngưng', 403);
  next();
}

// Định tuyến DB theo tenant trong suốt request.
function tenantContext(req, res, next) {
  if (!req.user || !req.tenant) return next();
  db.runWith(req.tenant.code, () => next());
}

const can = (req, perm) => rbac.has(req.permissions, perm);
function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 'Chưa đăng nhập', 401);
    if (!can(req, perm)) return fail(res, 'Không có quyền: ' + perm, 403);
    next();
  };
}

const isPlatform = (req) => req.user && req.user.role === 'platform';

module.exports = { attachSession, requireAuth, tenantContext, requirePerm, can, isPlatform, SESSION_TTL_MS, nowUtc };
