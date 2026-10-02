'use strict';

// Sinh mã chứng từ dạng <PREFIX><YYYYMMDD>-<STT 4 số>.
// Node chạy đơn luồng và các handler tạo chứng từ đều đồng bộ (không await)
// nên thao tác đếm + chèn an toàn trên nhiều máy LAN.
function makeCode(db, prefix, table, column = 'code', date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const like = `${prefix}${ymd}-%`;
  // Lấy số lớn nhất đã dùng + 1, không đếm dòng: dãy mã có lỗ hổng (chứng từ nhập từ nguồn khác, seed, phiếu bị bỏ)
  // thì COUNT + 1 sẽ trùng mã đã có và lỗi UNIQUE.
  const row = db.prepare(`SELECT MAX(CAST(substr(${column}, ?) AS INTEGER)) AS n FROM ${table} WHERE ${column} LIKE ?`)
    .get(prefix.length + ymd.length + 2, like);
  return `${prefix}${ymd}-${String((row.n || 0) + 1).padStart(4, '0')}`;
}

module.exports = { makeCode };
