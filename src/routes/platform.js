'use strict';

const express = require('express');
const crypto = require('crypto');
const { control, audit, getPlatformSettings, setPlatformSettings, TENANT_KINDS, communitySettings, validateCommunitySettings, communityRoleLabels } = require('../control');
const { bankAccountOf, accountConflict, CONFLICT_MSG } = require('../lib/community');
const db = require('../db');
const { ok, fail, wrap, str } = require('../lib/util');
const { hashPassword } = require('../lib/auth');
const rbac = require('../lib/rbac');
const { runChecks, openAlerts, latency } = require('../lib/checks');
const { isPlatform, can, inPlatformScope, platformAuthorize } = require('../middleware');

const router = express.Router();
router.use((req, res, next) => {
  if (!isPlatform(req)) return fail(res, 'Chỉ quản trị nền tảng', 403);
  next();
});
// Quyền theo route (GĐ1.7)
const need = (perm) => (req, res, next) => {
  const denied = platformAuthorize(req, perm);
  return denied ? fail(res, denied, 403) : next();
};
// Phạm vi dữ liệu: null = toàn bộ; mảng id cộng đồng khi vai trò scope='assigned'
const scopeIds = (req) => req.platform.communities;
const scopeSql = (req, col) => {
  const ids = scopeIds(req);
  return ids ? ` AND ${col} IN (${ids.map(Number).join(',') || 'NULL'})` : '';
};
const outOfScope = (res) => fail(res, 'Ngoài phạm vi cộng đồng được giao', 403);

const codeOk = (c) => /^[a-z0-9_-]{2,30}$/.test(c);

// kind + community_id của tenant (GĐ1.2). Trả { error } hoặc { kind, communityId }.
function tenantCommunity(body, current = {}) {
  const kind = body.kind === undefined ? (current.kind || 'shop') : str(body.kind, 20);
  if (!TENANT_KINDS.includes(kind)) return { error: 'Loại cửa hàng không hợp lệ (shop / seller / community)' };
  let communityId = body.community_id === undefined ? (current.community_id ?? null) : (body.community_id ? Number(body.community_id) : null);
  if (communityId != null) {
    const c = control.prepare('SELECT id, status FROM communities WHERE id=?').get(communityId);
    if (!c) return { error: 'Không tìm thấy cộng đồng' };
    // GĐ1.6: không gán mới vào cộng đồng tạm ngưng; tenant đang ở trong thì giữ nguyên
    if (c.status !== 'active' && communityId !== (current.community_id ?? null)) return { error: 'Cộng đồng đang tạm ngưng, không gán thêm được' };
  }
  if (kind !== 'shop' && communityId == null) return { error: 'Người bán / sổ quỹ cộng đồng phải thuộc một cộng đồng' };
  return { kind, communityId };
}

// ---------- Loại cộng đồng (GĐ1.6, NFR-05, US-13) ----------
const communityType = (code) => control.prepare('SELECT * FROM community_types WHERE code=?').get(code);
const typeUsage = (code) => control.prepare('SELECT COUNT(*) c FROM communities WHERE type=?').get(code).c;
const typeLabels = (body, cur = {}) => ({
  name: str(body.name, 80) || cur.name,
  approver_label: body.approver_label === undefined ? cur.approver_label : (str(body.approver_label, 80) || null),
  leader_label: body.leader_label === undefined ? cur.leader_label : (str(body.leader_label, 80) || null),
  sort_order: body.sort_order === undefined || body.sort_order === '' ? (cur.sort_order ?? 0) : Number(body.sort_order),
});

router.get('/community-types', need('communities.view'), wrap((req, res) => {
  ok(res, control.prepare(`SELECT ct.*, (SELECT COUNT(*) FROM communities c WHERE c.type=ct.code) AS community_count
    FROM community_types ct ORDER BY ct.sort_order, ct.id`).all());
}));

router.post('/community-types', need('community_types.manage'), wrap((req, res) => {
  const code = str(req.body.code, 30).toLowerCase();
  const v = typeLabels(req.body);
  if (!codeOk(code)) return fail(res, 'Mã loại chỉ gồm a-z, 0-9, _ , - (2–30 ký tự)');
  if (!v.name) return fail(res, 'Nhập tên loại cộng đồng');
  if (!Number.isInteger(v.sort_order)) return fail(res, 'Thứ tự không hợp lệ');
  if (communityType(code)) return fail(res, 'Mã loại đã tồn tại');
  const r = control.prepare('INSERT INTO community_types(code,name,approver_label,leader_label,sort_order) VALUES (?,?,?,?,?)')
    .run(code, v.name, v.approver_label || null, v.leader_label || null, v.sort_order);
  const id = Number(r.lastInsertRowid);
  audit({ userId: req.user.id, username: req.user.username, action: 'community_type.create', entity: 'community_type', entityId: id, detail: code, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM community_types WHERE id=?').get(id));
}));

// Không đổi mã; tạm ngưng chỉ chặn tạo cộng đồng mới thuộc loại này
router.put('/community-types/:id', need('community_types.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const t = control.prepare('SELECT * FROM community_types WHERE id=?').get(id);
  if (!t) return fail(res, 'Không tìm thấy loại cộng đồng', 404);
  if (req.body.code !== undefined && str(req.body.code, 30).toLowerCase() !== t.code) return fail(res, 'Không được đổi mã loại cộng đồng');
  const v = typeLabels(req.body, t);
  if (!Number.isInteger(v.sort_order)) return fail(res, 'Thứ tự không hợp lệ');
  const status = str(req.body.status, 20) || t.status;
  if (!['active', 'suspended'].includes(status)) return fail(res, 'Trạng thái không hợp lệ');
  control.prepare('UPDATE community_types SET name=?, approver_label=?, leader_label=?, sort_order=?, status=? WHERE id=?')
    .run(v.name, v.approver_label, v.leader_label, v.sort_order, status, id);
  audit({ userId: req.user.id, username: req.user.username, action: 'community_type.update', entity: 'community_type', entityId: id, detail: t.code, ip: req.ip });
  ok(res, control.prepare('SELECT * FROM community_types WHERE id=?').get(id));
}));

router.delete('/community-types/:id', need('community_types.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const t = control.prepare('SELECT * FROM community_types WHERE id=?').get(id);
  if (!t) return fail(res, 'Không tìm thấy loại cộng đồng', 404);
  const n = typeUsage(t.code);
  if (n) return fail(res, `Loại cộng đồng đang dùng cho ${n} cộng đồng, không xóa được`);
  control.prepare('DELETE FROM community_types WHERE id=?').run(id);
  audit({ userId: req.user.id, username: req.user.username, action: 'community_type.delete', entity: 'community_type', entityId: id, detail: t.code, ip: req.ip });
  ok(res, { id });
}));

// ---------- Cộng đồng (GĐ1.1, GĐ1.6, NFR-05) ----------
const communityOut = (c) => (c ? { ...c, settings: communitySettings(c.settings), donations_url: c.donations_token ? '/congduc/' + c.donations_token : '' } : c);
// Sinh token khi bật công khai danh sách công đức (GĐ2.9), giữ nguyên nếu đã có.
function ensureDonationsToken(c, settings) {
  if (!settings.public_donations || c.donations_token) return c.donations_token || null;
  return crypto.randomBytes(16).toString('hex');
}
const communityById = (id) => control.prepare('SELECT * FROM communities WHERE id=?').get(id);
const communityTenantCount = (id) => control.prepare('SELECT COUNT(*) c FROM tenants WHERE community_id=?').get(id).c;

router.get('/communities', need('communities.view'), wrap((req, res) => {
  ok(res, control.prepare(`SELECT c.*, ct.name AS type_name, (SELECT COUNT(*) FROM tenants t WHERE t.community_id=c.id) AS tenant_count
    FROM communities c LEFT JOIN community_types ct ON ct.code = c.type WHERE 1=1${scopeSql(req, 'c.id')} ORDER BY c.id`).all().map(communityOut));
}));

router.post('/communities', need('communities.manage'), wrap((req, res) => {
  if (scopeIds(req)) return fail(res, 'Chỉ nhân sự phạm vi toàn bộ được tạo cộng đồng', 403);
  const code = str(req.body.code, 30).toLowerCase();
  const name = str(req.body.name, 160);
  const type = str(req.body.type, 30);
  if (!codeOk(code)) return fail(res, 'Mã cộng đồng chỉ gồm a-z, 0-9, _ , - (2–30 ký tự)');
  if (!name) return fail(res, 'Nhập tên cộng đồng');
  const ct = communityType(type);
  if (!type) return fail(res, 'Chọn loại cộng đồng');
  if (!ct || ct.status !== 'active') return fail(res, 'Loại cộng đồng không hợp lệ hoặc đang tạm ngưng');
  if (control.prepare('SELECT id FROM communities WHERE code=?').get(code)) return fail(res, 'Mã cộng đồng đã tồn tại');
  const st = validateCommunitySettings(req.body.settings === undefined ? {} : req.body.settings, '{}');
  if (st.error) return fail(res, st.error);
  const donationsToken = st.value.public_donations ? crypto.randomBytes(16).toString('hex') : null;
  const r = control.prepare('INSERT INTO communities(code,name,type,area,contact_name,contact_phone,note,settings,donations_token) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(code, name, type, str(req.body.area, 120) || null, str(req.body.contact_name, 120) || null,
      str(req.body.contact_phone, 30) || null, str(req.body.note, 500) || null, JSON.stringify(st.value), donationsToken);
  const id = Number(r.lastInsertRowid);
  audit({ userId: req.user.id, username: req.user.username, action: 'community.create', entity: 'community', entityId: id, detail: code, ip: req.ip });
  ok(res, communityOut(communityById(id)));
}));

router.put('/communities/:id', need('communities.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (!inPlatformScope(req, id)) return outOfScope(res);
  const c = communityById(id);
  if (!c) return fail(res, 'Không tìm thấy cộng đồng', 404);
  const status = str(req.body.status, 20) || c.status;
  if (!['active', 'suspended'].includes(status)) return fail(res, 'Trạng thái không hợp lệ');
  let type = c.type;
  if (req.body.type !== undefined && str(req.body.type, 30) !== c.type) {
    type = str(req.body.type, 30);
    const ct = communityType(type);
    if (!ct || ct.status !== 'active') return fail(res, 'Loại cộng đồng không hợp lệ hoặc đang tạm ngưng');
    if (communityTenantCount(id)) return fail(res, 'Chỉ đổi loại khi cộng đồng chưa có cửa hàng / người bán');
  }
  let settings = c.settings;
  let donationsToken = c.donations_token;
  if (req.body.settings !== undefined) {
    const st = validateCommunitySettings(req.body.settings, c.settings);
    if (st.error) return fail(res, st.error);
    settings = JSON.stringify(st.value);
    donationsToken = ensureDonationsToken(c, st.value);
  }
  const keep = (k, n) => (req.body[k] === undefined ? c[k] : (str(req.body[k], n) || null));
  control.prepare('UPDATE communities SET name=?, type=?, area=?, status=?, contact_name=?, contact_phone=?, note=?, settings=?, donations_token=? WHERE id=?')
    .run(str(req.body.name, 160) || c.name, type, keep('area', 120), status, keep('contact_name', 120), keep('contact_phone', 30),
      keep('note', 500), settings, donationsToken, id);
  audit({ userId: req.user.id, username: req.user.username, action: 'community.update', entity: 'community', entityId: id,
    detail: status !== c.status ? `status=${status}` : undefined, ip: req.ip });
  ok(res, communityOut(communityById(id)));
}));

// Xóa cứng, chỉ khi không còn tenant (sổ quỹ nằm trong tenant nên không mất dữ liệu tài chính)
router.delete('/communities/:id', need('communities.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (!inPlatformScope(req, id)) return outOfScope(res);
  const c = communityById(id);
  if (!c) return fail(res, 'Không tìm thấy cộng đồng', 404);
  const n = communityTenantCount(id);
  if (n) return fail(res, `Cộng đồng còn ${n} cửa hàng / người bán, gỡ hoặc chuyển trước khi xóa`);
  control.prepare('DELETE FROM communities WHERE id=?').run(id);
  audit({ userId: req.user.id, username: req.user.username, action: 'community.delete', entity: 'community', entityId: id, detail: c.code, ip: req.ip });
  ok(res, { id });
}));

router.get('/communities/:id/tenants', need('communities.view'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (!inPlatformScope(req, id)) return outOfScope(res);
  if (!communityById(id)) return fail(res, 'Không tìm thấy cộng đồng', 404);
  ok(res, control.prepare('SELECT id, code, name, kind, status FROM tenants WHERE community_id=? ORDER BY kind, code').all(id));
}));

// Gỡ cửa hàng thường khỏi cộng đồng. Người bán / sổ quỹ bắt buộc thuộc cộng đồng: chuyển bằng sửa tenant
router.post('/communities/:id/remove-tenant', need('communities.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (!inPlatformScope(req, id)) return outOfScope(res);
  const t = control.prepare('SELECT * FROM tenants WHERE id=? AND community_id=?').get(Number(req.body.tenant_id), id);
  if (!t) return fail(res, 'Cửa hàng không thuộc cộng đồng này', 404);
  if ((t.kind || 'shop') !== 'shop') return fail(res, 'Người bán / sổ quỹ cộng đồng phải thuộc một cộng đồng; sửa cửa hàng để chuyển sang cộng đồng khác');
  control.prepare('UPDATE tenants SET community_id=NULL WHERE id=?').run(t.id);
  audit({ userId: req.user.id, username: req.user.username, action: 'tenant.update', entity: 'tenant', entityId: t.id,
    detail: `kind=${t.kind || 'shop'} community_id=`, ip: req.ip });
  ok(res, { id: t.id });
}));

router.get('/plans', need('tenants.view'), wrap((req, res) => {
  ok(res, control.prepare('SELECT * FROM plans WHERE active=1 ORDER BY price').all());
}));

router.get('/tenants', need('tenants.view'), wrap((req, res) => {
  const rows = control.prepare(`SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS user_count
    FROM tenants t WHERE 1=1${scopeSql(req, 't.community_id')} ORDER BY t.id`).all();
  ok(res, rows);
}));

// Luôn tạo kèm tài khoản chủ nên cần thêm tenants.create_owner
router.post('/tenants', need('tenants.manage'), need('tenants.create_owner'), wrap((req, res) => {
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
  if (!inPlatformScope(req, tc.communityId)) return outOfScope(res);

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

router.put('/tenants/:id', need('tenants.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const t = control.prepare('SELECT * FROM tenants WHERE id=?').get(id);
  if (!t) return fail(res, 'Không tìm thấy cửa hàng', 404);
  if (!inPlatformScope(req, t.community_id ?? null)) return outOfScope(res);
  const tc = tenantCommunity(req.body, t);
  if (tc.error) return fail(res, tc.error);
  if (!inPlatformScope(req, tc.communityId)) return outOfScope(res);
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

const labelsFor = (tenantId) => {
  const t = tenantId && control.prepare('SELECT community_id FROM tenants WHERE id=?').get(tenantId);
  return communityRoleLabels(t && t.community_id);
};
// Tài khoản cửa hàng; nhân sự nền tảng xem ở /staff
router.get('/users', need('users.view'), wrap((req, res) => {
  const tid = req.query.tenant_id ? Number(req.query.tenant_id) : null;
  const scope = scopeSql(req, 't.community_id');
  const rows = control.prepare(`SELECT u.* FROM users u JOIN tenants t ON t.id = u.tenant_id
    WHERE 1=1${tid ? ' AND u.tenant_id=' + tid : ''}${scope} ORDER BY u.tenant_id, u.id`).all();
  ok(res, rows.map((u) => ({ id: u.id, tenant_id: u.tenant_id, username: u.username, full_name: u.full_name, role: u.role, role_name: rbac.roleName(u.role, labelsFor(u.tenant_id)), active: u.active, last_login: u.last_login })));
}));

router.get('/stats', need('reports.view'), wrap((req, res) => {
  const scope = scopeSql(req, 'community_id');
  const tenants = control.prepare(`SELECT COUNT(*) c FROM tenants WHERE 1=1${scope}`).get().c;
  const users = control.prepare(`SELECT COUNT(*) c FROM users WHERE tenant_id IN (SELECT id FROM tenants WHERE 1=1${scope})`).get().c;
  const byStatus = control.prepare(`SELECT status, COUNT(*) c FROM tenants WHERE 1=1${scope} GROUP BY status`).all();
  ok(res, { tenants, users, by_status: byStatus, roles: Object.keys(rbac.ROLES) });
}));

// Báo cáo theo từng cửa hàng (chỉ quản trị nền tảng)
// Cảnh báo tự kiểm (GĐ3.5), theo phạm vi cộng đồng của nhân sự
router.get('/alerts', need('reports.view'), wrap((req, res) => {
  const codes = control.prepare(`SELECT code FROM tenants t WHERE 1=1${scopeSql(req, 't.community_id')}`).all().map((t) => t.code);
  ok(res, openAlerts(codes));
}));
router.get('/latency', need('reports.view'), wrap((req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : day;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : from;
  const codes = control.prepare(`SELECT code FROM tenants t WHERE 1=1${scopeSql(req, 't.community_id')}`).all().map((t) => t.code);
  ok(res, { from, to, ...latency(codes, from, to) });
}));
router.post('/alerts/run', need('tenants.manage'), wrap((req, res) => {
  const n = runChecks();
  audit({ userId: req.user.id, username: req.user.username, action: 'checks.run', entity: 'platform', detail: String(n), ip: req.ip });
  ok(res, { findings: n });
}));

router.get('/reports', need('reports.view'), wrap((req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = str(req.query.from, 20) || today;
  const to = str(req.query.to, 20) || from;
  const list = control.prepare(`SELECT code,name,status,plan FROM tenants WHERE 1=1${scopeSql(req, 'community_id')} ORDER BY name`).all();
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
router.get('/vietqr', need('vietqr.manage'), wrap((req, res) => {
  const s = getPlatformSettings();
  ok(res, { vqr_env: s.vqr_env || 'mock', vqr_username: s.vqr_username || '', has_password: !!s.vqr_password });
}));
router.put('/vietqr', need('vietqr.manage'), wrap((req, res) => {
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

router.get('/public-report', need('public_report.manage'), wrap((req, res) => ok(res, publicReport())));

router.put('/public-report', need('public_report.manage'), wrap((req, res) => {
  const s = getPlatformSettings();
  const enabled = req.body.enabled ? '1' : '0';
  const token = s.public_report_token || newToken();
  setPlatformSettings({ public_report_enabled: enabled, public_report_token: token });
  audit({ userId: req.user.id, username: req.user.username, action: 'publicreport.update', entity: 'platform', detail: enabled === '1' ? 'on' : 'off', ip: req.ip });
  ok(res, publicReport());
}));

router.post('/public-report/rotate', need('public_report.manage'), wrap((req, res) => {
  setPlatformSettings({ public_report_token: newToken() });
  audit({ userId: req.user.id, username: req.user.username, action: 'publicreport.rotate', entity: 'platform', ip: req.ip });
  ok(res, publicReport());
}));

// ---------- Vai trò và nhân sự nền tảng (GĐ1.7, SEC-04) ----------
const PERM_CODES = rbac.PLATFORM_PERMS.map((p) => p.code);
const roleOut = (r) => ({ ...r,
  permissions: control.prepare('SELECT permission FROM platform_role_permissions WHERE role_id=? ORDER BY permission').all(r.id).map((x) => x.permission),
  user_count: control.prepare('SELECT COUNT(*) c FROM users WHERE tenant_id IS NULL AND role=?').get(r.code).c });
const roleById = (id) => control.prepare('SELECT * FROM platform_roles WHERE id=?').get(id);
// Kiểm tra và lọc danh sách quyền; trả { error } hoặc { value }
function permList(list) {
  if (!Array.isArray(list)) return { error: 'Danh sách quyền không hợp lệ' };
  const bad = list.find((p) => !PERM_CODES.includes(p));
  if (bad) return { error: 'Quyền không hợp lệ: ' + String(bad).slice(0, 40) };
  return { value: [...new Set(list)] };
}
function saveRolePerms(id, perms) {
  control.prepare('DELETE FROM platform_role_permissions WHERE role_id=?').run(id);
  const ins = control.prepare('INSERT INTO platform_role_permissions(role_id,permission) VALUES (?,?)');
  perms.forEach((p) => ins.run(id, p));
}
const logStaff = (req, action, entity, id, detail) =>
  audit({ userId: req.user.id, username: req.user.username, action, entity, entityId: id, detail, ip: req.ip });

router.get('/permissions', need('staff.manage'), (req, res) => ok(res, rbac.PLATFORM_PERMS));

router.get('/roles', need('staff.manage'), wrap((req, res) => {
  ok(res, control.prepare('SELECT * FROM platform_roles ORDER BY is_system DESC, id').all().map(roleOut));
}));

router.post('/roles', need('staff.manage'), wrap((req, res) => {
  const code = str(req.body.code, 30).toLowerCase();
  const name = str(req.body.name, 80);
  const scope = str(req.body.scope, 20) || 'all';
  if (!codeOk(code)) return fail(res, 'Mã vai trò chỉ gồm a-z, 0-9, _ , - (2–30 ký tự)');
  if (!name) return fail(res, 'Nhập tên vai trò');
  if (!['all', 'assigned'].includes(scope)) return fail(res, 'Phạm vi không hợp lệ');
  // Không trùng mã vai trò cửa hàng để users.role không nhập nhằng
  if (rbac.ROLES[code] || control.prepare('SELECT id FROM platform_roles WHERE code=?').get(code)) return fail(res, 'Mã vai trò đã tồn tại');
  const pl = permList(req.body.permissions || []);
  if (pl.error) return fail(res, pl.error);
  const id = Number(control.prepare('INSERT INTO platform_roles(code,name,description,scope) VALUES (?,?,?,?)')
    .run(code, name, str(req.body.description, 200) || null, scope).lastInsertRowid);
  saveRolePerms(id, pl.value);
  logStaff(req, 'platform_role.create', 'platform_role', id, `${code}: ${pl.value.join(',')}`);
  ok(res, roleOut(roleById(id)));
}));

router.put('/roles/:id', need('staff.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const r = roleById(id);
  if (!r) return fail(res, 'Không tìm thấy vai trò', 404);
  if (r.is_system) return fail(res, 'Không sửa được vai trò hệ thống');
  if (req.user.role === r.code) return fail(res, 'Không tự sửa vai trò của chính mình');
  if (req.body.code !== undefined && str(req.body.code, 30).toLowerCase() !== r.code) return fail(res, 'Không được đổi mã vai trò');
  const scope = str(req.body.scope, 20) || r.scope;
  const status = str(req.body.status, 20) || r.status;
  if (!['all', 'assigned'].includes(scope)) return fail(res, 'Phạm vi không hợp lệ');
  if (!['active', 'suspended'].includes(status)) return fail(res, 'Trạng thái không hợp lệ');
  let perms = null;
  if (req.body.permissions !== undefined) {
    const pl = permList(req.body.permissions);
    if (pl.error) return fail(res, pl.error);
    perms = pl.value;
  }
  control.prepare('UPDATE platform_roles SET name=?, description=?, scope=?, status=? WHERE id=?')
    .run(str(req.body.name, 80) || r.name, req.body.description === undefined ? r.description : (str(req.body.description, 200) || null), scope, status, id);
  if (perms) saveRolePerms(id, perms);
  logStaff(req, 'platform_role.update', 'platform_role', id, `${r.code}: scope=${scope} status=${status}${perms ? ' perms=' + perms.join(',') : ''}`);
  ok(res, roleOut(roleById(id)));
}));

router.delete('/roles/:id', need('staff.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const r = roleById(id);
  if (!r) return fail(res, 'Không tìm thấy vai trò', 404);
  if (r.is_system) return fail(res, 'Không xóa được vai trò hệ thống');
  const n = roleOut(r).user_count;
  if (n) return fail(res, `Vai trò đang gán cho ${n} nhân sự, không xóa được`);
  control.prepare('DELETE FROM platform_roles WHERE id=?').run(id);
  logStaff(req, 'platform_role.delete', 'platform_role', id, r.code);
  ok(res, { id });
}));

const staffOut = (u) => {
  const r = control.prepare('SELECT name, scope FROM platform_roles WHERE code=?').get(u.role);
  return { id: u.id, username: u.username, full_name: u.full_name, phone: u.phone, email: u.email, role: u.role,
    role_name: r ? r.name : u.role, scope: r ? r.scope : null, active: u.active, last_login: u.last_login,
    communities: control.prepare('SELECT community_id FROM platform_user_communities WHERE user_id=? ORDER BY community_id').all(u.id).map((x) => x.community_id) };
};
const staffById = (id) => control.prepare('SELECT * FROM users WHERE id=? AND tenant_id IS NULL').get(id);
const activeSuperAdmins = () => control.prepare("SELECT COUNT(*) c FROM users WHERE tenant_id IS NULL AND role='platform' AND active=1").get().c;
function communityIds(list) {
  if (!Array.isArray(list)) return { error: 'Danh sách cộng đồng không hợp lệ' };
  const ids = [...new Set(list.map(Number))];
  if (ids.some((id) => !communityById(id))) return { error: 'Không tìm thấy cộng đồng' };
  return { value: ids };
}
function saveStaffCommunities(userId, ids) {
  control.prepare('DELETE FROM platform_user_communities WHERE user_id=?').run(userId);
  const ins = control.prepare('INSERT INTO platform_user_communities(user_id,community_id) VALUES (?,?)');
  ids.forEach((c) => ins.run(userId, c));
}

router.get('/staff', need('staff.manage'), wrap((req, res) => {
  ok(res, control.prepare('SELECT * FROM users WHERE tenant_id IS NULL ORDER BY id').all().map(staffOut));
}));

router.post('/staff', need('staff.manage'), wrap((req, res) => {
  const username = str(req.body.username, 60).toLowerCase();
  const password = String(req.body.password || '');
  const role = str(req.body.role, 30);
  if (!/^[a-z0-9_.-]{3,60}$/.test(username)) return fail(res, 'Tên đăng nhập chỉ gồm a-z, 0-9, _ . - (3–60 ký tự)');
  if (password.length < 6) return fail(res, 'Mật khẩu tối thiểu 6 ký tự');
  if (!control.prepare('SELECT id FROM platform_roles WHERE code=?').get(role)) return fail(res, 'Vai trò nền tảng không hợp lệ');
  if (control.prepare('SELECT id FROM users WHERE lower(username)=?').get(username)) return fail(res, 'Tên đăng nhập đã tồn tại');
  const ci = communityIds(req.body.communities || []);
  if (ci.error) return fail(res, ci.error);
  const id = Number(control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,phone,email,role) VALUES (NULL,?,?,?,?,?,?)')
    .run(username, hashPassword(password), str(req.body.full_name, 120) || null, str(req.body.phone, 30) || null, str(req.body.email, 120) || null, role).lastInsertRowid);
  saveStaffCommunities(id, ci.value);
  logStaff(req, 'platform_staff.create', 'user', id, `${username} role=${role}`);
  ok(res, staffOut(staffById(id)));
}));

router.put('/staff/:id', need('staff.manage'), wrap((req, res) => {
  const id = Number(req.params.id);
  const u = staffById(id);
  if (!u) return fail(res, 'Không tìm thấy nhân sự nền tảng', 404);
  const role = req.body.role === undefined ? u.role : str(req.body.role, 30);
  const active = req.body.active === undefined ? u.active : (req.body.active ? 1 : 0);
  if (!control.prepare('SELECT id FROM platform_roles WHERE code=?').get(role)) return fail(res, 'Vai trò nền tảng không hợp lệ');
  if (id === req.user.id && (role !== u.role || !active)) return fail(res, 'Không tự đổi vai trò hoặc tự khóa tài khoản của mình');
  // Luôn giữ ít nhất một quản trị tối cao đang hoạt động
  if (u.role === 'platform' && u.active && (role !== 'platform' || !active) && activeSuperAdmins() <= 1) return fail(res, 'Phải còn ít nhất một quản trị tối cao');
  let ci = null;
  if (req.body.communities !== undefined) {
    ci = communityIds(req.body.communities);
    if (ci.error) return fail(res, ci.error);
  }
  const password = req.body.password ? String(req.body.password) : '';
  if (password && password.length < 6) return fail(res, 'Mật khẩu tối thiểu 6 ký tự');
  control.prepare('UPDATE users SET full_name=?, phone=?, email=?, role=?, active=? WHERE id=?')
    .run(req.body.full_name === undefined ? u.full_name : (str(req.body.full_name, 120) || null),
      req.body.phone === undefined ? u.phone : (str(req.body.phone, 30) || null),
      req.body.email === undefined ? u.email : (str(req.body.email, 120) || null), role, active, id);
  if (ci) saveStaffCommunities(id, ci.value);
  if (password) control.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), id);
  // Khóa hoặc đổi mật khẩu: hủy phiên đang mở
  if (!active || password) control.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  logStaff(req, 'platform_staff.update', 'user', id,
    `role=${role} active=${active}${ci ? ' communities=' + ci.value.join(',') : ''}${password ? ' password_reset' : ''}`);
  ok(res, staffOut(staffById(id)));
}));

module.exports = router;
