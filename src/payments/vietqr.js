'use strict';

// Client gọi API VietQR (chiều ra): lấy token và tạo QR động.
// Có chế độ 'mock' để chạy/test khi chưa có tài khoản VietQR.

const QRCode = require('qrcode');
const { buildVietQR, removeVietnamese } = require('../lib/vietqr');

const tokenCache = new Map(); // tenantCode -> { token, exp }

function bases(env) {
  if (env === 'prod') return { token: 'https://api.vietqr.org/vqr/api/token_generate', qr: 'https://api.vietqr.org/vqr/api/qr/generate-customer' };
  return { token: 'https://dev.vietqr.org/vqr/api/token_generate', qr: 'https://dev.vietqr.org/vqr/api/qr/generate-customer' };
}

async function getToken(settings, tenantCode) {
  const cached = tokenCache.get(tenantCode);
  if (cached && cached.exp > Date.now() + 5000) return cached.token;
  if (!settings.vqr_username || !settings.vqr_password) throw new Error('Chưa cấu hình tài khoản VietQR (username/password)');
  const b = bases(settings.vqr_env);
  const basic = Buffer.from(`${settings.vqr_username}:${settings.vqr_password}`).toString('base64');
  const r = await fetch(b.token, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` } });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('VietQR: không lấy được token (' + (j.message || r.status) + ')');
  tokenCache.set(tenantCode, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 });
  return j.access_token;
}

// amount: number, orderId: <=13 ký tự không dấu, content: <=23 ký tự không dấu.
async function generateQR(settings, tenantCode, { amount, orderId, content }) {
  const env = settings.vqr_env || 'mock';
  const msg = (content || orderId || '').slice(0, 23);
  if (env === 'mock') {
    const payload = buildVietQR({ bankBin: settings.bank_bin, accountNo: settings.bank_account, amount, message: msg });
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 340, margin: 1, errorCorrectionLevel: 'M' });
    return {
      qrCode: payload, qrDataUrl, qrLink: null, mock: true,
      content: msg, orderId, transactionRefId: 'MOCK-' + Date.now().toString(36).toUpperCase(),
      bankName: settings.bank_name, bankAccount: settings.bank_account,
    };
  }
  const b = bases(env);
  const token = await getToken(settings, tenantCode);
  const body = {
    bankCode: settings.vqr_bank_code || '',
    bankAccount: settings.bank_account || '',
    userBankName: removeVietnamese(settings.account_holder || settings.shop_name || 'POS SHOP').slice(0, 50),
    content: msg,
    qrType: 0,
    amount: String(Math.round(amount)),
    orderId,
    transType: 'C',
  };
  if (settings.vqr_terminal_code) body.terminalCode = settings.vqr_terminal_code;
  const r = await fetch(b.qr, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.qrCode) throw new Error('VietQR: lỗi tạo QR (' + (j.message || r.status) + ')');
  const qrDataUrl = await QRCode.toDataURL(j.qrCode, { width: 340, margin: 1, errorCorrectionLevel: 'M' });
  return {
    qrCode: j.qrCode, qrDataUrl, qrLink: j.qrLink || null, mock: false,
    content: j.content || msg, orderId: j.orderId || orderId, transactionRefId: j.transactionRefId || '',
    bankName: j.bankName || settings.bank_name, bankAccount: j.bankAccount || settings.bank_account,
  };
}

module.exports = { getToken, generateQR };
