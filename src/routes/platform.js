'use strict';

const express = require('express');
const crypto = require('crypto');
const { control, audit, getPlatformSettings, setPlatformSettings, TENANT_KINDS } = require('../control');
const { bankAccountOf, accountConflict, CONFLICT_MSG } = require('../lib/community');
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

// kind + community_id của tenant (GĐ1.2). Trả { error } hoặc { kind, communityId }.
function tenantCommunity(body, current = {}) {
  const kind = body.kind === undefined ? (current.kind || 'shop') : str(body.kind, 20);
  if (!TENANT_KINDS.includes(kind)) return { error: 'Loại cửa hàng không hợp lệ (shop / seller / community)' };
  let communityId = body.community_id === undefined ? (current.community_id ?? null) : (body.community_id ? Number(body.community_id) : null);
  if (communityId != null) {
    const c = control.prepare('SELECT id FROM communities WHERE id=?').get(communityId);
    if (!c) return { error: 'Không tìm thấy cộng đồng' };
  }
  if (kind !== 'shop' && communityId == null) return { error: 'Người bán / sổ quỹ cộng đồng phải thuộc một cộng đồng' };
  return { kind, communityId };
}

// ---------- Cộng đồng (GĐ1.1, NFR-05) ----------
const COMMUNITY_TYPES = ['village'];
router.get('/communities', wrap((req, res) => {
  ok(res, control.prepare(`SELECT c.*, (SELECT COUNT(*) FROM tenants t WHERE t.community_id=c.id) AS tenant_count
    FROM communities c ORDER BY c.id`).all());
}));

router.post('/communities', wrap((req, res) => {
  const code = str(req.body.code, 30).toLowerCase();
  const name = str(req.body.name, 160);
  const type = str(req.body.type, 20) || 'village';
  if (!codeOk(code)) return fail(res, 'Mã cộng đồng chỉ gồm a-z, 0-9, _ , - (2–30 ký tự)');
  if (!name) return fail(res, 'Nhập tên cộng đồng');
  if (!COMMUNITY_TYPES.includes(type)) return fail(res, 'Loại cộng đồng không hợp lệ');
  if (control.prepare('SELECT id FROM communities WHERE code=?').get(code)) return fail(res, 'Mã cộng đồng đã tồn tại');
  const r = control.prepare('INSERT INTO communities(code,name,type,area) VALUES (?,?,?,?)').run(code, name, type, str(req.body.area, 120) || null);
  const id = Number(r.lastInsertRowid);
  audit({ userId: req.user.id, username: req.user.username, action: 'community.create', entity: 'community', entityId: id, detail: code, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM communities WHERE id=?').get(id));
}));

router.put('/communities/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const c = control.prepare('SELECT * FROM communities WHERE id=?').get(id);
  if (!c) return fail(res, 'Không tìm thấy cộng đồng', 404);
  const status = str(req.body.status, 20) || c.status;
  if (!['active', 'suspended'].includes(status)) return fail(res, 'Trạng thái không hợp lệ');
  control.prepare('UPDATE communities SET name=?, area=?, status=? WHERE id=?')
    .run(str(req.body.name, 160) || c.name, req.body.area === undefined ? c.area : (str(req.body.area, 120) || null), status, id);
  audit({ userId: req.user.id, username: req.user.username, action: 'community.update', entity: 'community', entityId: id, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM communities WHERE id=?').get(id));
}));

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
  const tc = tenantCommunity(req.body);
  if (tc.error) return fail(res, tc.error);

  const r = control.prepare('INSERT INTO tenants(code,name,plan,area,note,expires_at,kind,community_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(code, name, str(req.body.plan, 30) || 'standard', str(req.body.area, 120) || null, str(req.body.note, 300) || null, str(req.body.expires_at, 30) || null, tc.kind, tc.communityId);
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
  const tc = tenantCommunity(req.body, t);
  if (tc.error) return fail(res, tc.error);
  // GĐ0.2 (BR-02, SEC-01): không gán vào cộng đồng khi tài khoản nhận tiền đang dùng chung
  if (tc.communityId != null && !t.community_id) {
    const other = accountConflict(t.code, bankAccountOf(t.code), tc.communityId);
    if (other) return fail(res, `${CONFLICT_MSG}. Trùng với: ${other}`);
  }
  control.prepare('UPDATE tenants SET name=?, status=?, plan=?, area=?, note=?, expires_at=?, kind=?, community_id=? WHERE id=?')
    .run(str(req.body.name, 160) || t.name, str(req.body.status, 20) || t.status, str(req.body.plan, 30) || t.plan,
      req.body.area === undefined ? t.area : (str(req.body.area, 120) || null), str(req.body.note, 300) || null,
      req.body.expires_at === undefined ? t.expires_at : (str(req.body.expires_at, 30) || null), tc.kind, tc.communityId, id);
  const changed = t.kind !== tc.kind || (t.community_id ?? null) !== tc.communityId;
  audit({ userId: req.user.id, username: req.user.username, action: 'tenant.update', entity: 'tenant', entityId: id,
    detail: changed ? `kind=${tc.kind} community_id=${tc.communityId ?? ''}` : undefined, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM tenants WHERE id=?').get(id));
}));

router.get('/users', wrap((req, res) => {
  const tid = req.query.tenant_id ? Number(req.query.tenant_id) : null;
  const rows = tid
    ? control.prepare('SELECT * FROM users WHERE tenant_id=? ORDER BY id').all(tid)
    : control.prepare('SELECT * FROM users ORDER BY tenant_id, id').all();
  ok(res, rows.map((u) => ({ id: u.id, tenant_id: u.tenant_id, username: u.username, full_name: u.full_name, role: u.role, role_name: rbac.roleName(u.role), active: u.active, last_login: u.last_login })));
}));

router.get('/stats', wrap((req, res) => {
  const tenants = control.prepare('SELECT COUNT(*) c FROM tenants').get().c;
  const users = control.prepare('SELECT COUNT(*) c FROM users WHERE tenant_id IS NOT NULL').get().c;
  const byStatus = control.prepare('SELECT status, COUNT(*) c FROM tenants GROUP BY status').all();
  ok(res, { tenants, users, by_status: byStatus, roles: Object.keys(rbac.ROLES) });
}));

// Báo cáo theo từng cửa hàng (chỉ quản trị nền tảng)
router.get('/reports', wrap((req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = str(req.query.from, 20) || today;
  const to = str(req.query.to, 20) || from;
  const list = control.prepare('SELECT code,name,status,plan FROM tenants ORDER BY name').all();
  const rows = list.map((t) => {
    try {
      return db.runWith(t.code, () => {
        const s = db.prepare(`SELECT COUNT(*) invoices, COALESCE(SUM(total),0) revenue FROM invoices
          WHERE status='paid' AND type='sale' AND date(created_at)>=date(?) AND date(created_at)<=date(?)`).get(from, to);
        const ret = db.prepare(`SELECT COALESCE(SUM(total),0) r FROM invoices
          WHERE status='paid' AND type='return' AND date(created_at)>=date(?) AND date(created_at)<=date(?)`).get(from, to).r;
        const profit = db.prepare(`SELECT COALESCE(SUM((ii.line_total - ii.cost_price*ii.base_qty) * CASE WHEN i.type='return' THEN -1 ELSE 1 END),0) p
          FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
          WHERE i.status='paid' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)`).get(from, to).p;
        const prod = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c;
        const low = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1 AND stock<=min_stock').get().c;
        return { code: t.code, name: t.name, status: t.status, plan: t.plan, invoices: s.invoices, revenue: s.revenue - ret, profit, products: prod, low_stock: low };
      });
    } catch (e) {
      return { code: t.code, name: t.name, status: t.status, plan: t.plan, error: e.message };
    }
  });
  const totals = rows.reduce((a, r) => ({ invoices: a.invoices + (r.invoices || 0), revenue: a.revenue + (r.revenue || 0), profit: a.profit + (r.profit || 0) }), { invoices: 0, revenue: 0, profit: 0 });
  ok(res, { from, to, rows, totals });
}));

// VietQR dùng chung cấp nền tảng (chỉ quản trị nền tảng cấu hình)
router.get('/vietqr', wrap((req, res) => {
  const s = getPlatformSettings();
  ok(res, { vqr_env: s.vqr_env || 'mock', vqr_username: s.vqr_username || '', has_password: !!s.vqr_password });
}));
router.put('/vietqr', wrap((req, res) => {
  const body = { vqr_env: ['mock', 'dev', 'prod'].includes(str(req.body.vqr_env)) ? str(req.body.vqr_env) : 'mock', vqr_username: str(req.body.vqr_username, 120) };
  if (req.body.vqr_password !== undefined && req.body.vqr_password !== '') body.vqr_password = String(req.body.vqr_password);
  setPlatformSettings(body);
  const s = getPlatformSettings();
  ok(res, { vqr_env: s.vqr_env || 'mock', vqr_username: s.vqr_username || '', has_password: !!s.vqr_password });
}));

// Báo cáo tổng thể công khai: bật/tắt, lấy link chia sẻ, đổi link (token).
function publicReport() {
  const s = getPlatformSettings();
  const token = s.public_report_token || '';
  return { enabled: s.public_report_enabled === '1', token, url: token ? '/r/' + token : '' };
}
const newToken = () => crypto.randomBytes(16).toString('hex');

router.get('/public-report', wrap((req, res) => ok(res, publicReport())));

router.put('/public-report', wrap((req, res) => {
  const s = getPlatformSettings();
  const enabled = req.body.enabled ? '1' : '0';
  const token = s.public_report_token || newToken();
  setPlatformSettings({ public_report_enabled: enabled, public_report_token: token });
  audit({ userId: req.user.id, username: req.user.username, action: 'publicreport.update', entity: 'platform', detail: enabled === '1' ? 'on' : 'off', ip: req.ip });
  ok(res, publicReport());
}));

router.post('/public-report/rotate', wrap((req, res) => {
  setPlatformSettings({ public_report_token: newToken() });
  audit({ userId: req.user.id, username: req.user.username, action: 'publicreport.rotate', entity: 'platform', ip: req.ip });
  ok(res, publicReport());
}));

module.exports = router;
