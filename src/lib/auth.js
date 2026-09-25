'use strict';

const crypto = require('crypto');

// Băm mật khẩu bằng scrypt (không cần thư viện ngoài).
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(pw, stored) {
  try {
    const [alg, salt, key] = String(stored).split('$');
    if (alg !== 'scrypt' || !salt || !key) return false;
    const calc = crypto.scryptSync(String(pw), salt, 64);
    const want = Buffer.from(key, 'hex');
    return calc.length === want.length && crypto.timingSafeEqual(calc, want);
  } catch {
    return false;
  }
}

const COOKIE = 'pos_session';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAgeSec, secure = false) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

module.exports = { hashPassword, verifyPassword, parseCookies, sessionCookie, clearCookie, COOKIE };
