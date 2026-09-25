'use strict';

// Database điều khiển (control): quản lý tenant, người dùng, phiên đăng nhập, nhật ký.
// Tách khỏi database nghiệp vụ của từng cửa hàng.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { hashPassword } = require('./lib/auth');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const control = new DatabaseSync(path.join(DATA_DIR, 'control.db'));
control.DATA_DIR = DATA_DIR;
control.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'standard',
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'cashier',
  pin_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, id);
`);

// ---------- Seed: tenant mặc định + tài khoản chủ + quản trị nền tảng ----------
function seed() {
  const insTenant = control.prepare('INSERT INTO tenants(code,name,plan) VALUES (?,?,?)');
  let tenant = control.prepare("SELECT * FROM tenants WHERE code='default'").get();
  if (!tenant) {
    const name = process.env.SHOP_NAME || 'Cửa hàng mặc định';
    const r = insTenant.run('default', name, 'standard');
    tenant = control.prepare('SELECT * FROM tenants WHERE id=?').get(Number(r.lastInsertRowid));
  }
  const addUser = control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)');
  // Chủ cửa hàng mặc định
  if (!control.prepare("SELECT id FROM users WHERE username='admin'").get()) {
    addUser.run(tenant.id, 'admin', hashPassword(process.env.ADMIN_PASS || 'admin123'), 'Chủ cửa hàng', 'owner');
  }
  // Quản trị nền tảng (không thuộc tenant)
  if (!control.prepare("SELECT id FROM users WHERE username='root'").get()) {
    addUser.run(null, 'root', hashPassword(process.env.ROOT_PASS || 'root123'), 'Quản trị nền tảng', 'platform');
  }
  return tenant;
}
seed();

// ---------- Audit ----------
function audit({ tenantId, userId, username, action, entity, entityId, detail, ip }) {
  try {
    control.prepare(`INSERT INTO audit_logs(tenant_id,user_id,username,action,entity,entity_id,detail,ip)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      tenantId == null ? null : tenantId, userId == null ? null : userId, username || null,
      String(action || ''), entity || null, entityId == null ? null : String(entityId), detail || null, ip || null);
  } catch { /* không chặn luồng chính vì lỗi log */ }
}

function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}
const tokenHash = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

module.exports = { control, DATA_DIR, audit, newToken, tokenHash };
