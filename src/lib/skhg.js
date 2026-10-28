'use strict';

// Tài khoản Sáng Kiến Hưng Gia (SKHG) của cổng quản trị Làng Số (repo lang-so).
// Làng Số gửi token SKHG của người dùng; token được xác minh bằng GET <SKHG_API_BASE>/current-profile-2 (như Làng Văn hiến,
// Trạm hỗ trợ) rồi đối chiếu SĐT / email với tài khoản quản trị sổ quỹ của thôn.
const { control } = require('../control');
const { ApiError, bad } = require('./util');

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

// Tài khoản quản trị sổ quỹ của thôn ứng với token SKHG: tên đăng nhập, SĐT hoặc email trùng tài khoản SKHG.
async function accountFor(token, code) {
  const { community, tenant } = communityOf(code);
  const u = await profile(token);
  if (!u) bad('Phiên đăng nhập Sáng Kiến Hưng Gia không hợp lệ', 401);
  const phone = phoneOf(u) || null;
  const email = String(u.email || '').trim().toLowerCase() || null;
  const user = control.prepare(`SELECT * FROM users WHERE tenant_id=? AND active=1
    AND (lower(username) IN (?,?) OR phone=? OR lower(email)=?) ORDER BY id LIMIT 1`).get(tenant.id, phone, email, phone, email);
  if (!user) bad('Tài khoản Sáng Kiến Hưng Gia chưa có tài khoản sổ quỹ của thôn (SĐT hoặc email phải trùng)', 403);
  return { community, tenant, user };
}

module.exports = { profile, accountFor };
