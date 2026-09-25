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

module.exports = { makeCode };
