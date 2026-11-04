'use strict';

// Tài khoản Sáng Kiến Hưng Gia (SKHG) của cổng quản trị Làng Số (repo lang-so).
// Làng Số gửi token SKHG của người dùng; token được xác minh bằng GET <SKHG_API_BASE>/current-profile-2 (như Làng Văn hiến,
// Trạm hỗ trợ) rồi đối chiếu SĐT / email với tài khoản quản trị sổ quỹ của thôn.
const crypto = require('crypto');
const { control, audit } = require('../control');
const { ApiError, bad } = require('./util');
const { hashPassword } = require('./auth');

const API = (process.env.SKHG_API_BASE || 'https://app.sangkienhunggia.vn/api/v1').replace(/\/+$/, '');
const TTL = 5 * 60 * 1000;
const cache = new Map();

// Người dùng SKHG của token, null khi token sai / hết hạn. Làng Số gọi API ở mỗi trang nên nhớ kết quả 5 phút.
async function profile(token) {
  token = String(token || '').trim();
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && Date.now() - hit.t < TTL) return hit.u;
  let r, d;
  try {
    // SKHG nằm sau Cloudflare, chặn tên trình duyệt mặc định của thư viện HTTP
    r = await fetch(API + '/current-profile-2', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, 'User-Agent': 'ThanhToanSo/1.0' },
      signal: AbortSignal.timeout(10000) });
    d = r.ok ? await r.json() : null;
  } catch {
    throw new ApiError('Không kết nối được máy chủ Sáng Kiến Hưng Gia', 502);
  }
  if (!r.ok && r.status !== 401 && r.status !== 403) throw new ApiError('Không kết nối được máy chủ Sáng Kiến Hưng Gia', 502);
  let u = null;
  if (d && typeof d === 'object' && d.success !== false && d.status !== false) {
    u = 'data' in d ? d.data : d; // {data: {user: {...}}} | {data: {...}} | {...}
    u = u && typeof u === 'object' ? u.user || u : null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(token, { u, t: Date.now() });
  return u;
}

// SĐT dạng 0xxxxxxxxx ('' nếu không có)
const phoneOf = (u) => {
  const d = String(u.phone || u.phone_number || '').replace(/\D/g, '');
  return d.startsWith('84') && d.length === 11 ? '0' + d.slice(2) : d;
};

// Thôn theo mã cộng đồng, kèm tenant sổ quỹ của thôn.
function communityOf(code) {
  const community = control.prepare("SELECT * FROM communities WHERE code=? AND status='active'").get(String(code || ''));
  const tenant = community && control.prepare("SELECT * FROM tenants WHERE community_id=? AND kind='community' AND status<>'suspended' ORDER BY id LIMIT 1").get(community.id);
  if (!tenant) bad('Không tìm thấy thôn', 404);
  return { community, tenant };
}

// Tài khoản sổ quỹ trùng người dùng SKHG: tên đăng nhập, SĐT hoặc email trùng.
const MATCH = '(lower(username) IN (?,?) OR phone=? OR lower(email)=?)';
const matchArgs = (u) => {
  const phone = phoneOf(u) || null;
  const email = String(u.email || '').trim().toLowerCase() || null;
  return [phone, email, phone, email];
};
const NO_ACCOUNT = 'Tài khoản Sáng Kiến Hưng Gia chưa có tài khoản sổ quỹ của thôn (SĐT hoặc email phải trùng) và không là thành viên cộng đồng của thôn trên Sáng Kiến Hưng Gia. Nhờ chủ sổ quỹ thêm bạn ở mục Người dùng.';

// Vai trò sổ quỹ theo tư cách thành viên cộng đồng SKHG `code` (current-profile-2: families = cộng đồng {id, code},
// user_families = thành viên {family_id, approved, family_role.slug}, như lang-so src/auth.js). Admin cộng đồng (nhom_truong) duyệt chi,
// thành viên đã duyệt chỉ xem; không phải thành viên: null. Không bao giờ tự cấp thủ quỹ (cầm tiền), chủ sổ quỹ gán tay.
function memberRole(u, code) {
  code = String(code || '').toUpperCase();
  if (!code) return null;
  const ids = (u.families || []).filter((f) => String(f?.code || '').toUpperCase() === code).map((f) => f.id);
  const m = (u.user_families || []).filter((x) => ids.includes(x?.family_id) && (x.approved === 1 || x.approved === true));
  if (!m.length) return null;
  return m.some((x) => x.family_role?.slug === 'nhom_truong') ? 'approver' : 'community_leader';
}

// Tài khoản tự tạo cho thành viên cộng đồng SKHG của thôn; vai trò đồng bộ theo SKHG ở mỗi lần xác minh.
// Rời cộng đồng: chặn và xóa phiên. Chủ sổ quỹ khóa tài khoản: chặn (không tự mở lại).
// ponytail: phiên đang mở chỉ bị thu hồi ở lần xác minh SKHG kế tiếp; muốn tức thì thì cần SKHG gọi webhook khi rời cộng đồng.
function memberUser(u, tenant) {
  const sid = u.id == null ? '' : String(u.id);
  const c = sid && tenant.community_id && control.prepare("SELECT skhg_code FROM communities WHERE id=? AND status='active'").get(tenant.community_id);
  if (!c?.skhg_code) return null;
  const role = memberRole(u, c.skhg_code);
  let user = control.prepare('SELECT * FROM users WHERE tenant_id=? AND skhg_id=?').get(tenant.id, sid);
  if (!role) {
    if (user) control.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    return null;
  }
  if (!user) {
    // Mật khẩu ngẫu nhiên không ai biết: tài khoản này chỉ vào được qua SKHG
    const id = control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,role,skhg_id) VALUES (?,?,?,?,?,?)')
      .run(tenant.id, `skhg${sid}.${tenant.code}`, hashPassword(crypto.randomBytes(24).toString('hex')), String(u.name || u.user_name || '').slice(0, 120) || null, role, sid).lastInsertRowid;
    audit({ tenantId: tenant.id, action: 'user.create', entity: 'user', entityId: Number(id), detail: `thành viên cộng đồng SKHG (${role})` });
    user = control.prepare('SELECT * FROM users WHERE id=?').get(id);
  } else if (user.role !== role) {
    control.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
    user.role = role;
  }
  return user.active ? user : null;
}

// Tài khoản sổ quỹ khớp người dùng SKHG: tài khoản chủ sổ quỹ đã thêm (SĐT/email trùng) trước, không có thì theo thành viên cộng đồng.
const userFor = (u, tenant) => control.prepare(`SELECT * FROM users WHERE tenant_id=? AND active=1 AND skhg_id IS NULL AND ${MATCH} ORDER BY id LIMIT 1`)
  .get(tenant.id, ...matchArgs(u)) || memberUser(u, tenant);

// Tài khoản quản trị sổ quỹ của thôn ứng với token SKHG.
async function accountFor(token, code) {
  const { community, tenant } = communityOf(code);
  const u = await profile(token);
  if (!u) bad('Phiên đăng nhập Sáng Kiến Hưng Gia không hợp lệ', 401);
  const user = userFor(u, tenant);
  if (!user) bad(NO_ACCOUNT, 403);
  return { community, tenant, user };
}

// SKHG chỉ nhận SĐT hoặc email; tên trần như "thonxuantrach.demo" là tài khoản "<tên>@xaphuongvietnam.vn" (như lang-so src/auth.js).
// ponytail: một tên miền cố định cho mọi thôn; đưa ra .env khi có thôn cần tên miền riêng.
function normalizeAccount(a) {
  const s = String(a || '').trim();
  if (/^[\d\s.+-]+$/.test(s)) return s.replace(/[\s.-]/g, '');
  return s && !s.includes('@') ? s.toLowerCase() + '@xaphuongvietnam.vn' : s;
}

// Lỗi SKHG: message: "..." | message: { errors: { message } } | errors: { field: [...] }
function messageOf(d) {
  if (typeof d?.message === 'string') return d.message;
  const e = d?.message?.errors || d?.errors;
  if (!e) return '';
  if (typeof e.message === 'string') return e.message;
  return Object.values(e).flat().find((v) => typeof v === 'string') || '';
}

const skhgPost = (path, body, token) => fetch(API + path, { method: 'POST', body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000),
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'ThanhToanSo/1.0', ...(token && { Authorization: 'Bearer ' + token }) } });

// Đăng nhập trực tiếp bằng SĐT/email + mật khẩu SKHG (như Làng Văn hiến). Mật khẩu chỉ chuyển tiếp, không lưu.
// Trả { user, tenant } khi khớp đúng một sổ quỹ (hoặc sổ quỹ `tenantCode` đã chọn), { choose: [{code,name}] } khi khớp nhiều thôn.
async function loginWithPassword(account, password, tenantCode) {
  if (!account || !password) bad('Nhập số điện thoại hoặc email và mật khẩu Sáng Kiến Hưng Gia');
  let r, d;
  try {
    r = await skhgPost('/login', { email: normalizeAccount(account), password });
    d = await r.json().catch(() => ({}));
  } catch {
    throw new ApiError('Không kết nối được máy chủ Sáng Kiến Hưng Gia', 502);
  }
  const token = d?.data?.access_token;
  if (r.status >= 500) throw new ApiError('Không kết nối được máy chủ Sáng Kiến Hưng Gia', 502);
  if (!r.ok || d.status === false || d.success === false || !token) bad(messageOf(d) || 'Tài khoản hoặc mật khẩu Sáng Kiến Hưng Gia không đúng', 401);
  try {
    const u = await profile(token);
    if (!u) bad('Phiên đăng nhập Sáng Kiến Hưng Gia không hợp lệ', 401);
    const found = new Map(); // mã sổ quỹ -> { user, tenant }, tài khoản đầu tiên khớp của mỗi sổ quỹ
    for (const t of control.prepare("SELECT * FROM tenants WHERE kind='community' AND status<>'suspended' ORDER BY name").all()) {
      if (tenantCode && t.code !== tenantCode) continue;
      const user = userFor(u, t);
      if (user) found.set(t.code, { user, tenant: t });
    }
    if (!found.size) bad(NO_ACCOUNT, 403);
    if (found.size > 1) return { choose: [...found.values()].map(({ tenant: t }) => ({ code: t.code, name: t.name })) };
    return found.values().next().value;
  } finally {
    // Token SKHG chỉ dùng để xác minh; đăng xuất ngay để không để lại phiên
    skhgPost('/logout', {}, token).catch(() => {});
  }
}

module.exports = { profile, accountFor, loginWithPassword, normalizeAccount };
