// GĐ3.5 (NFR-03): ba quy tắc tự kiểm, chạy với thời điểm giả trên DATA_DIR tạm.
// Chạy: node test/checks.test.js
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-'));
const db = require('../src/db');
const { control } = require('../src/control');
const { runChecks } = require('../src/lib/checks');
const R = []; const ok = (n, c, x = '') => R.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);

const at = (s) => new Date(s.replace(' ', 'T'));
const alerts = (kind) => control.prepare("SELECT * FROM alerts WHERE tenant_code='default' AND kind=? AND resolved_at IS NULL").all(kind);
const ins = db.runWith('default', (c) => c.prepare('INSERT INTO vietqr_transactions(transactionid,amount,trans_type,category,created_at,dup_of) VALUES (?,?,?,?,?,?)'));
const run = (sql) => db.runWith('default', (c) => c.exec(sql));

// Giao dịch đều đặn 10 ngày (01 → 10/9), một khoản chưa phân loại ngày 05/9
for (let d = 1; d <= 10; d++) db.runWith('default', () => ins.run(`OK-${d}`, 1000, 'C', d === 5 ? 'unclassified' : 'sale', `2026-09-${String(d).padStart(2, '0')} 10:00:00`, null));

// 1) Chưa phân loại quá 3 ngày (mặc định cộng đồng)
runChecks(at('2026-09-07 12:00:00'));
ok('stale: not yet (2 days)', alerts('unclassified_stale').length === 0);
runChecks(at('2026-09-10 12:00:00'));
const st = alerts('unclassified_stale');
ok('stale: raised after 3 days', st.length === 1 && /1 giao dịch/.test(st[0].message), st[0] && st[0].message);
runChecks(at('2026-09-10 13:00:00'));
ok('stale: rerun does not duplicate', alerts('unclassified_stale').length === 1);
run("UPDATE vietqr_transactions SET category='other' WHERE transactionid='OK-5'");
runChecks(at('2026-09-10 14:00:00'));
ok('stale: auto-resolves once classified', alerts('unclassified_stale').length === 0);

// 2) Mã trùng mới phát sinh trong 7 ngày (dòng thứ hai mang dup_of để lọt qua index duy nhất, như dữ liệu cũ)
db.runWith('default', () => ins.run('DUP-X', 500, 'C', 'sale', '2026-09-10 08:00:00', null));
db.runWith('default', () => ins.run('DUP-X', 500, 'C', 'sale', '2026-09-10 09:00:00', 1));
runChecks(at('2026-09-10 15:00:00'));
ok('duplicate: recent duplicate raised', alerts('duplicate_txn').some((a) => a.ref === 'DUP-X'));
db.runWith('default', () => ins.run('DUP-OLD', 500, 'C', 'sale', '2026-07-01 09:00:00', null));
db.runWith('default', () => ins.run('DUP-OLD', 500, 'C', 'sale', '2026-07-01 09:05:00', 1));
runChecks(at('2026-09-10 15:00:00'));
ok('duplicate: old duplicates (already marked) not alerted', !alerts('duplicate_txn').some((a) => a.ref === 'DUP-OLD'));

// 3) Im lặng > 24 giờ khi tuần trước ngày nào cũng có
runChecks(at('2026-09-11 08:00:00'));
ok('silent: 22h is fine', alerts('webhook_silent').length === 0);
runChecks(at('2026-09-12 12:00:00'));
ok('silent: raised after 24h of silence', alerts('webhook_silent').length === 1);
db.runWith('default', () => ins.run('OK-13', 1000, 'C', 'sale', '2026-09-13 09:00:00', null));
runChecks(at('2026-09-13 10:00:00'));
ok('silent: resolves when payments resume', alerts('webhook_silent').length === 0);
ok('resolved alerts kept as history', control.prepare("SELECT COUNT(*) n FROM alerts WHERE resolved_at IS NOT NULL").get().n >= 2);

// Tenant ít giao dịch: im lặng không báo
control.prepare("INSERT INTO tenants(code,name,plan) VALUES ('quiet','Ít giao dịch','standard')").run();
db.runWith('quiet', (c) => c.prepare("INSERT INTO vietqr_transactions(transactionid,amount,trans_type,category,created_at) VALUES ('Q1',1,'C','sale','2026-09-01 10:00:00')").run());
runChecks(at('2026-09-20 10:00:00'));
ok('silent: quiet tenant not alerted', control.prepare("SELECT COUNT(*) n FROM alerts WHERE tenant_code='quiet' AND resolved_at IS NULL").get().n === 0);

// 4) Quỹ hết hạn thu tự chuyển Ngừng thu, có thông báo; khoá sổ chặn ghi bút toán ở tầng DB (SKHGDT-3647)
const { autoStopExpired } = require('../src/routes/funds');
control.prepare("INSERT INTO tenants(code,name,plan,status,kind) VALUES ('quy-x','Quỹ X','standard','active','community')").run();
const fx = (sql, ...a) => db.runWith('quy-x', (c) => c.prepare(sql).run(...a));
fx("INSERT INTO funds(code,name,end_date) VALUES ('het-han','Quỹ hết hạn','2000-01-01')");
fx("INSERT INTO funds(code,name,end_date) VALUES ('con-han','Quỹ còn hạn','2999-01-01')");
ok('auto-stop: one expired fund stopped', autoStopExpired() === 1);
const fq = (code) => db.runWith('quy-x', (c) => c.prepare('SELECT * FROM funds WHERE code=?').get(code));
ok('auto-stop: expired -> closed with stop time, other untouched', fq('het-han').status === 'closed' && !!fq('het-han').stopped_at && fq('con-han').status === 'active');
ok('auto-stop: notice recorded', db.runWith('quy-x', (c) => c.prepare("SELECT COUNT(*) n FROM fund_notices WHERE kind='auto_stop'").get().n) === 1);
ok('auto-stop: rerun is a no-op', autoStopExpired() === 0);
fx("UPDATE funds SET locked_at='2026-01-01' WHERE code='het-han'");
let blocked = false;
try { fx("INSERT INTO fund_entries(code,fund_id,type,amount,status) VALUES ('PT-X',?, 'in', 1000, 'approved')", fq('het-han').id); } catch (e) { blocked = /khoá sổ/.test(e.message); }
ok('locked fund: DB trigger refuses new entries', blocked);

console.log(R.join('\n'));
const failed = R.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${R.length - failed}/${R.length} passed`);
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
