'use strict';

// Sinh chuỗi VietQR (chuẩn EMVCo / NAPAS 247) để tạo mã QR chuyển khoản.
function tlv(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function removeVietnamese(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVietQR({ bankBin, accountNo, amount, message }) {
  const account = tlv('00', 'A000000727') + tlv('01', tlv('00', bankBin) + tlv('01', accountNo)) + tlv('02', 'QRIBFTTA');
  let payload =
    tlv('00', '01') +
    tlv('01', amount ? '12' : '11') +
    tlv('38', account) +
    tlv('53', '704');
  if (amount) payload += tlv('54', String(Math.round(amount)));
  payload += tlv('58', 'VN');
  if (message) payload += tlv('62', tlv('08', removeVietnamese(message).slice(0, 50)));
  payload += '6304';
  return payload + crc16(payload);
}

module.exports = { buildVietQR, removeVietnamese, crc16 };
