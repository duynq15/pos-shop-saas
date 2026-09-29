'use strict';

// Kiểm tra tài khoản nhận tiền riêng cho tenant thuộc cộng đồng (GĐ0.2 — BR-02, FR-05, SEC-01).
const db = require('../db');
const { sharedAccountConflict } = require('../control');

const bankAccountOf = (code) => db.runWith(code, (conn) =>
  (conn.prepare("SELECT value FROM settings WHERE key='bank_account'").get() || {}).value || '');

// communityId: truyền khi đang đổi cộng đồng của tenant (chưa lưu); bỏ qua để đọc từ DB.
function accountConflict(tenantCode, account, communityId) {
  return sharedAccountConflict(tenantCode, account, bankAccountOf, communityId);
}

const CONFLICT_MSG = 'Tài khoản nhận tiền phải là tài khoản riêng, không dùng chung với cửa hàng khác (BR-02)';

module.exports = { bankAccountOf, accountConflict, CONFLICT_MSG };
