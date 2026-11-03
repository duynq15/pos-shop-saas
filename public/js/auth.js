// Trạng thái đăng nhập + kiểm tra quyền ở phía giao diện.
import { get, post } from './api.js';

export const auth = { user: null, tenant: null, permissions: [], isPlatform: false, appEnv: 'development' };

export const isProd = () => auth.appEnv === 'production';

export function can(perm) {
  const list = auth.permissions || [];
  if (list.includes('*')) return true;
  return list.some((p) => p === perm || (p.endsWith('.*') && perm.startsWith(p.slice(0, -1))));
}

export function applyAuth(data) {
  auth.user = data.user || null;
  auth.tenant = data.tenant || null;
  auth.permissions = data.permissions || [];
  auth.isPlatform = !!(data.user && data.user.tenant_id == null);
  auth.appEnv = data.app_env || 'development';
}

export async function loadMe() {
  try {
    const d = await get('/api/auth/me');
    applyAuth(d);
    return true;
  } catch (e) {
    if (e.status === 401) return false;
    throw e;
  }
}

export async function login(username, password) {
  const d = await post('/api/auth/login', { username, password });
  applyAuth(d);
  return d;
}

// Đăng nhập một lần từ Làng Số bằng token Sáng Kiến Hưng Gia
export async function ssoLogin(token, thon) {
  applyAuth(await post('/api/auth/sso', { token, thon }));
}

// Đăng nhập bằng SĐT/email + mật khẩu Sáng Kiến Hưng Gia. Khớp nhiều thôn: trả { choose: [{code,name}] }, gọi lại kèm `thon`.
export async function skhgLogin(account, password, thon) {
  const d = await post('/api/auth/skhg', { account, password, thon });
  if (!d.choose) applyAuth(d);
  return d;
}

export async function logout() {
  try { await post('/api/auth/logout'); } catch { /* ignore */ }
  auth.user = null; auth.tenant = null; auth.permissions = []; auth.isPlatform = false;
}
