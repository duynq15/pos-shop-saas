'use strict';

// Đọc cấu hình VietQR hiệu dụng của tenant hiện tại (dùng chung cho hóa đơn và quỹ).
const db = require('../db');
const { getPlatformSettings } = require('../control');

function readSettings() {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
}

// Ưu tiên tài khoản VietQR của chính tenant, fallback credentials dùng chung cấp nền tảng.
function vqrSettings() {
  const st = readSettings();
  let p = {};
  try { p = getPlatformSettings(); } catch { p = {}; }
  const inherit = !st.vqr_username && !st.vqr_password && !!(p.vqr_username && p.vqr_password);
  const isProd = process.env.NODE_ENV === 'production';
  return {
    ...st,
    vqr_username: st.vqr_username || p.vqr_username || '',
    vqr_password: st.vqr_password || p.vqr_password || '',
    vqr_env: isProd ? 'prod' : (inherit ? (p.vqr_env || st.vqr_env || 'mock') : (st.vqr_env || 'mock')),
    _inherited: inherit,
  };
}

module.exports = { readSettings, vqrSettings };
