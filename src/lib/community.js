'use strict';

// Kiểm tra tài khoản nhận tiền riêng cho tenant thuộc cộng đồng (GĐ0.2 — BR-02, FR-05, SEC-01).
const db = require('../db');
const { control, sharedAccountConflict } = require('../control');

const normAccount = (v) => String(v || '').replace(/[\s.-]/g, '');
const bankAccountOf = (code) => db.runWith(code, (conn) =>
  (conn.prepare("SELECT value FROM settings WHERE key='bank_account'").get() || {}).value || '');

// Quỹ đang dùng tài khoản này (GĐ2.3). Webhook định tuyến tiền về quỹ theo số tài khoản,
// nên tài khoản quỹ không được trùng với bất kỳ tenant hay quỹ nào khác.
// skip: { tenantCode, fundId } — bỏ qua chính quỹ đang sửa.
// ponytail: quét DB mọi tenant cộng đồng; đủ cho vài chục thôn, nhiều hơn thì đưa tài khoản quỹ lên control.db.
function fundByAccount(account, skip = {}) {
  const acc = normAccount(account);
  if (!acc) return null;
  for (const t of control.prepare("SELECT code FROM tenants WHERE kind='community'").all()) {
    const hit = db.runWith(t.code, (conn) => conn.prepare('SELECT id, bank_account FROM funds').all())
      .find((f) => normAccount(f.bank_account) === acc && !(t.code === skip.tenantCode && f.id === skip.fundId));
    if (hit) return { tenantCode: t.code, fundId: hit.id };
  }
  return null;
}

// communityId: truyền khi đang đổi cộng đồng của tenant (chưa lưu); bỏ qua để đọc từ DB.
function accountConflict(tenantCode, account, communityId) {
  const fund = fundByAccount(account);
  if (fund) return fund.tenantCode;
  return sharedAccountConflict(tenantCode, account, bankAccountOf, communityId);
}

const CONFLICT_MSG = 'Tài khoản nhận tiền phải là tài khoản riêng, không dùng chung với cửa hàng khác (BR-02)';

module.exports = { normAccount, bankAccountOf, fundByAccount, accountConflict, CONFLICT_MSG };
