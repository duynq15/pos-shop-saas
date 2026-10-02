// GĐ3.3 (BR-04, FR-09, SEC-05, ERR-07): bảng tiền và nhật ký bất biến ở tầng DB, kể cả khi chạy SQL trực tiếp.
// Chạy: node test/immutability.test.js (tự tạo DATA_DIR tạm)
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'immut-'));
const db = require('../src/db');
const { control } = require('../src/control');
const R = []; const ok = (n, c, x = '') => R.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);
const blocked = (fn) => { try { fn(); return false; } catch (e) { return /BR-04|SEC-05/.test(e.message); } };

db.runWith('default', (c) => {
  c.prepare("INSERT INTO vietqr_transactions(transactionid,amount,bank_account,trans_type,content) VALUES ('IMM-1',5000,'111','C','x')").run();
  ok('vqr: delete blocked', blocked(() => c.exec("DELETE FROM vietqr_transactions WHERE transactionid='IMM-1'")));
  ok('vqr: amount change blocked', blocked(() => c.exec("UPDATE vietqr_transactions SET amount=1 WHERE transactionid='IMM-1'")));
  ok('vqr: transaction id change blocked', blocked(() => c.exec("UPDATE vietqr_transactions SET transactionid='X' WHERE transactionid='IMM-1'")));
  ok('vqr: bank account change blocked', blocked(() => c.exec("UPDATE vietqr_transactions SET bank_account='999' WHERE transactionid='IMM-1'")));
  let reclass = false;
  try { c.exec("UPDATE vietqr_transactions SET matched=1, note='Đã phân loại' WHERE transactionid='IMM-1'"); reclass = true; } catch { /* ghi nhận ở dưới */ }
  ok('vqr: classification columns still editable', reclass);
  c.exec("UPDATE vietqr_transactions SET category='sale' WHERE transactionid='IMM-1'");
  ok('vqr: classified transaction cannot be reclassified', blocked(() => c.exec("UPDATE vietqr_transactions SET category='fund' WHERE transactionid='IMM-1'")));
  c.prepare("INSERT INTO vietqr_transactions(transactionid,amount,trans_type) VALUES ('IMM-2',1,'C')").run();
  ok('vqr: rows inserted without category default to unclassified (ERR-03)', c.prepare("SELECT category FROM vietqr_transactions WHERE transactionid='IMM-2'").get().category === 'unclassified');
  ok('vqr: unknown category rejected', (() => { try { c.exec("UPDATE vietqr_transactions SET category='xyz' WHERE transactionid='IMM-2'"); return false; } catch { return true; } })());
});
control.prepare("INSERT INTO audit_logs(action) VALUES ('test.immut')").run();
ok('audit: update blocked', blocked(() => control.exec("UPDATE audit_logs SET action='x' WHERE action='test.immut'")));
ok('audit: delete blocked', blocked(() => control.exec("DELETE FROM audit_logs WHERE action='test.immut'")));

console.log(R.join('\n'));
const failed = R.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${R.length - failed}/${R.length} passed`);
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
