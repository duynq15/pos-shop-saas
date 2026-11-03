// Lớp gọi API thống nhất: trả về `data` hoặc ném lỗi với thông điệp tiếng Việt.

async function request(url, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('Mất kết nối tới máy chủ');
  }
  if (raw) return res;
  if (res.status === 401) {
    try { window.dispatchEvent(new Event('auth:required')); } catch { /* ignore */ }
    // Giữ lời báo của máy chủ (vd. sai mật khẩu khi đăng nhập), không thì báo hết phiên
    const msg = await res.json().then((j) => j.error, () => '');
    throw Object.assign(new Error(msg || 'Chưa đăng nhập hoặc phiên hết hạn'), { status: 401 });
  }
  let json;
  try { json = await res.json(); } catch { throw new Error('Phản hồi không hợp lệ từ máy chủ'); }
  if (!json.ok) throw Object.assign(new Error(json.error || 'Lỗi không xác định'), { status: res.status });
  return json.data;
}

export const api = (url, opts) => request(url, opts);
export const get = (url) => request(url);
export const post = (url, body) => request(url, { method: 'POST', body });
export const put = (url, body) => request(url, { method: 'PUT', body });
export const del = (url) => request(url, { method: 'DELETE' });

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) if (v !== '' && v != null && v !== false) p.set(k, v);
  return p.toString();
};
