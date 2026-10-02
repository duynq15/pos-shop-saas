'use strict';

// Thời điểm ngân hàng ghi nhận giao dịch (GĐ3.7, AC-01-3). Tài liệu VietQR trong repo chưa có trường này;
// nhận các tên hay gặp nếu đối tác gửi. Không có / không đọc được thì trả null (không đoán).
// ponytail: chỉ đọc vài tên trường phổ biến; xác nhận tên thật với VietQR rồi rút gọn còn đúng một trường.
const FIELDS = ['transactiontime', 'transactionTime', 'transTime', 'timePaid', 'time'];

function bankTime(body) {
  for (const k of FIELDS) {
    const v = body && body[k];
    if (v === undefined || v === null || v === '') continue;
    // Số: giây hoặc mili giây epoch. Chuỗi: ISO hoặc "YYYY-MM-DD HH:mm:ss".
    const n = Number(v);
    const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) continue;
    // Bỏ giá trị vô lý (tương lai quá 5 phút hoặc cũ hơn 30 ngày): không dùng để đo
    const age = Date.now() - d.getTime();
    if (age < -5 * 60 * 1000 || age > 30 * 86400 * 1000) return null;
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  return null;
}

module.exports = { bankTime };
