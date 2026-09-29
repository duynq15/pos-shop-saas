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
  area TEXT,
  note TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Cộng đồng (NFR-05, quyết định 0.9): thôn là một loại (type='village')
CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'village',
  area TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Loại cộng đồng cấu hình được (GĐ1.6, NFR-05, US-13). Nhãn vai trò hiển thị theo loại
CREATE TABLE IF NOT EXISTS community_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  approver_label TEXT,
  leader_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  cycle TEXT DEFAULT 'month',
  max_users INTEGER DEFAULT 3,
  max_products INTEGER DEFAULT 500,
  features TEXT,
  active INTEGER DEFAULT 1
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

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS control_seqs (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS qr_orders (
  order_id TEXT PRIMARY KEY,
  tenant_code TEXT NOT NULL,
  invoice_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// Thêm cột còn thiếu (DB cũ)
function controlColumns(table) {
  return control.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
if (!controlColumns('tenants').includes('expires_at')) control.exec('ALTER TABLE tenants ADD COLUMN expires_at TEXT');
if (!controlColumns('tenants').includes('area')) control.exec('ALTER TABLE tenants ADD COLUMN area TEXT');
// GĐ1.2: loại tenant và cộng đồng. Tenant cũ nhận kind='shop', không thuộc cộng đồng (ADR-0002)
if (!controlColumns('tenants').includes('kind')) control.exec("ALTER TABLE tenants ADD COLUMN kind TEXT NOT NULL DEFAULT 'shop'");
if (!controlColumns('tenants').includes('community_id')) control.exec('ALTER TABLE tenants ADD COLUMN community_id INTEGER REFERENCES communities(id)');
// GĐ1.6: thông tin liên hệ và cấu hình riêng từng cộng đồng
for (const [col, def] of [['contact_name', 'TEXT'], ['contact_phone', 'TEXT'], ['note', 'TEXT'], ['settings', "TEXT NOT NULL DEFAULT '{}'"]]) {
  if (!controlColumns('communities').includes(col)) control.exec(`ALTER TABLE communities ADD COLUMN ${col} ${def}`);
}
if (!control.prepare('SELECT COUNT(*) c FROM community_types').get().c) {
  control.prepare('INSERT INTO community_types(code,name,approver_label,leader_label,sort_order) VALUES (?,?,?,?,?)')
    .run('village', 'Thôn', 'Trưởng thôn', 'Ban lãnh đạo thôn', 1);
}
for (const [col, def] of [['amount', 'INTEGER'], ['content', 'TEXT'], ['bank_account', 'TEXT']]) {
  if (!controlColumns('qr_orders').includes(col)) control.exec(`ALTER TABLE qr_orders ADD COLUMN ${col} ${def}`);
}

// ---------- Gói dịch vụ mặc định ----------
if (control.prepare('SELECT COUNT(*) c FROM plans').get().c === 0) {
  const ins = control.prepare('INSERT INTO plans(code,name,price,cycle,max_users,max_products,features) VALUES (?,?,?,?,?,?,?)');
  ins.run('trial', 'Dùng thử', 0, 'day', 2, 100, 'basic');
  ins.run('standard', 'Cơ bản', 200000, 'month', 5, 2000, 'basic,einvoice,vietqr');
  ins.run('pro', 'Chuyên nghiệp', 500000, 'month', 30, 20000, 'basic,einvoice,vietqr,analytics,multishop');
}

function planOf(tenant) {
  return control.prepare('SELECT * FROM plans WHERE code=?').get(tenant && tenant.plan) || control.prepare('SELECT * FROM plans WHERE code=?').get('standard');
}
function tenantExpired(tenant) {
  if (!tenant || !tenant.expires_at) return false;
  return tenant.expires_at < new Date().toISOString().slice(0, 19).replace('T', ' ');
}

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

function getPlatformSettings() {
  return Object.fromEntries(control.prepare('SELECT key,value FROM platform_settings').all().map((r) => [r.key, r.value]));
}
function setPlatformSettings(obj) {
  const up = control.prepare('INSERT INTO platform_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(obj || {})) up.run(String(k), String(v ?? ''));
  return getPlatformSettings();
}

// Cấp số toàn cục (dùng cho mã đối soát VietQR, không trùng giữa các shop)
function nextGlobalSeq(key) {
  const row = control.prepare(`INSERT INTO control_seqs(key,value) VALUES(?, '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1
    RETURNING value`).get(key);
  return Number(row.value);
}
function nextPaymentRef() {
  return 'P' + String(nextGlobalSeq('payment_ref')).padStart(10, '0');
}
function saveQrOrder(orderId, tenantCode, invoiceId, extra) {
  const e = extra || {};
  control.prepare(`INSERT INTO qr_orders(order_id,tenant_code,invoice_id,amount,content,bank_account)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET
      tenant_code=excluded.tenant_code,
      invoice_id=excluded.invoice_id,
      amount=COALESCE(excluded.amount, qr_orders.amount),
      content=COALESCE(excluded.content, qr_orders.content),
      bank_account=COALESCE(excluded.bank_account, qr_orders.bank_account)`)
    .run(String(orderId), String(tenantCode), invoiceId || null,
      e.amount == null ? null : Number(e.amount),
      e.content == null ? null : String(e.content),
      e.bank_account == null ? null : String(e.bank_account));
}
function getQrOrder(orderId) {
  if (!orderId) return null;
  return control.prepare('SELECT * FROM qr_orders WHERE order_id=?').get(String(orderId));
}
// Bản ghi QR đã tạo của một shop trong khoảng ngày (phục vụ dashboard đối soát).
function getQrOrders(tenantCode, from, to) {
  return control.prepare(`SELECT order_id, invoice_id, amount, content, bank_account, created_at
    FROM qr_orders WHERE tenant_code=? AND date(created_at)>=date(?) AND date(created_at)<=date(?)
    ORDER BY created_at DESC, rowid DESC LIMIT 2000`).all(String(tenantCode), from, to);
}

// ---------- Chặn tài khoản nhận tiền dùng chung (GĐ0.2 — BR-02, FR-05, SEC-01) ----------
// Tenant thuộc cộng đồng phải nhận tiền vào tài khoản riêng: số tài khoản không được trùng
// với bất kỳ tenant nào khác. Chiều ngược lại cũng chặn: shop thường không được khai trùng
// tài khoản của tenant thuộc cộng đồng. Hai shop thường trùng nhau vẫn được (hành vi cũ).
const TENANT_KINDS = ['shop', 'seller', 'community'];
const normAccount = (v) => String(v || '').replace(/[\s.-]/g, '');
function tenantByCode(code) {
  return control.prepare('SELECT * FROM tenants WHERE code=?').get(code);
}
// Trả về mã tenant đang dùng trùng tài khoản (vi phạm BR-02), hoặc null.
// readAccount(code) đọc bank_account trong DB của tenant (truyền vào để tránh vòng require với db.js).
function sharedAccountConflict(tenantCode, account, readAccount, communityId) {
  const acc = normAccount(account);
  if (!acc) return null;
  const self = tenantByCode(tenantCode);
  const selfInCommunity = communityId !== undefined ? !!communityId : !!(self && self.community_id);
  for (const t of control.prepare('SELECT code, community_id FROM tenants WHERE code<>?').all(tenantCode)) {
    if (!selfInCommunity && !t.community_id) continue;
    if (normAccount(readAccount(t.code)) === acc) return t.code;
  }
  return null;
}

// ---------- Cấu hình cộng đồng (GĐ1.6) ----------
// Chỉ nhận các khóa đã biết; giá trị mặc định dùng khi cộng đồng chưa cấu hình.
const COMMUNITY_SETTINGS = {
  public_donations: { def: false, parse: (v) => (typeof v === 'boolean' ? v : undefined) },
  unclassified_alert_days: { def: 3, parse: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 90 && v !== '' && v !== null ? Number(v) : undefined) },
};
function communitySettings(raw) {
  let obj = {};
  try { obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch { obj = {}; }
  const out = {};
  for (const [k, spec] of Object.entries(COMMUNITY_SETTINGS)) out[k] = obj[k] === undefined ? spec.def : obj[k];
  return out;
}
// Kiểm tra settings gửi lên. Trả { error } hoặc { value } đã gộp với giá trị hiện tại.
function validateCommunitySettings(input, current) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'Cấu hình cộng đồng không hợp lệ' };
  const value = communitySettings(current);
  for (const [k, v] of Object.entries(input)) {
    const spec = COMMUNITY_SETTINGS[k];
    if (!spec) return { error: `Khóa cấu hình không hợp lệ: ${k}` };
    const parsed = spec.parse(v);
    if (parsed === undefined) return { error: `Giá trị cấu hình không hợp lệ: ${k}` };
    value[k] = parsed;
  }
  return { value };
}
// Nhãn vai trò theo loại cộng đồng của tenant; null khi tenant không thuộc cộng đồng.
function communityRoleLabels(communityId) {
  if (!communityId) return null;
  return control.prepare(`SELECT ct.approver_label, ct.leader_label FROM communities c
    JOIN community_types ct ON ct.code = c.type WHERE c.id=?`).get(communityId) || null;
}

module.exports = { control, DATA_DIR, audit, newToken, tokenHash, planOf, tenantExpired, getPlatformSettings, setPlatformSettings, nextGlobalSeq, nextPaymentRef, saveQrOrder, getQrOrder, getQrOrders,
  TENANT_KINDS, tenantByCode, sharedAccountConflict, COMMUNITY_SETTINGS, communitySettings, validateCommunitySettings, communityRoleLabels };
