'use strict';

// Sinh mã chứng từ dạng <PREFIX><YYYYMMDD>-<STT 4 số>.
// Node chạy đơn luồng và các handler tạo chứng từ đều đồng bộ (không await)
// nên thao tác đếm + chèn an toàn trên nhiều máy LAN.
function makeCode(db, prefix, table, column = 'code', date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const like = `${prefix}${ymd}%`;
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} LIKE ?`).get(like);
  return `${prefix}${ymd}-${String(row.c + 1).padStart(4, '0')}`;
}

module.exports = { makeCode, nextPaymentRef };

// Mã đối soát thanh toán ngắn (<=13 ký tự) dùng làm orderId/content cho VietQR.
function nextPaymentRef(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='payment_ref_seq'").get();
  let seq = Number((row && row.value) || 0) + 1;
  const code = 'P' + String(seq).padStart(10, '0');
  db.prepare("INSERT INTO settings(key,value) VALUES('payment_ref_seq',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(seq));
  return code;
}
