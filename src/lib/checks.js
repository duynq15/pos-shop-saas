'use strict';

// Tự kiểm định kỳ (GĐ3.5 — NFR-03, ERR-02, ERR-03, ERR-10). Chạy mỗi đêm, kết quả lưu ở control.db/alerts.
// Mỗi cảnh báo có khóa (tenant + loại + đối tượng) nên chạy lại nhiều lần không sinh trùng;
// điều kiện hết thì cảnh báo tự đóng (resolved_at).
const db = require('../db');
const { control, communitySettings } = require('../control');

control.exec(`
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code TEXT NOT NULL,
  community_id INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('unclassified_stale','duplicate_txn','webhook_silent')),
  ref TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  last_seen_at TEXT DEFAULT (datetime('now','localtime')),
  resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_open ON alerts(tenant_code, kind, ref) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alert_tenant ON alerts(tenant_code, resolved_at);
`);

const HOUR = 3600 * 1000;
// Im lặng bao lâu thì báo (ERR-10); "thường ngày có" = có giao dịch ở ít nhất 5 trong 7 ngày trước đó.
const SILENT_HOURS = 24;
const ACTIVE_DAYS = 5;

// Kiểm một tenant, trả danh sách { kind, ref, message, count } đang đúng tại thời điểm `now`.
function findings(code, alertDays, now = new Date()) {
  return db.runWith(code, (c) => {
    const out = [];
    const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');
    const stale = c.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM vietqr_transactions
      WHERE dup_of IS NULL AND category='unclassified' AND trans_type='C'
        AND julianday(?, 'localtime') - julianday(created_at) > ?`).get(nowSql, alertDays);
    if (stale.n) out.push({ kind: 'unclassified_stale', ref: '', count: stale.n,
      message: `${stale.n} giao dịch chưa phân loại quá ${alertDays} ngày (${Number(stale.s).toLocaleString('vi-VN')} ₫)` });
    // Chỉ báo trùng mới phát sinh trong 7 ngày: dòng trùng cũ đã được migration đánh dấu dup_of và loại khỏi báo cáo
    for (const d of c.prepare(`SELECT transactionid, COUNT(*) n FROM vietqr_transactions
        WHERE transactionid IS NOT NULL AND transactionid <> '' GROUP BY transactionid
        HAVING COUNT(*) > 1 AND julianday(?, 'localtime') - julianday(MAX(created_at)) <= 7`).all(nowSql)) {
      out.push({ kind: 'duplicate_txn', ref: d.transactionid, count: d.n, message: `Mã giao dịch ${d.transactionid} xuất hiện ${d.n} lần` });
    }
    const last = c.prepare('SELECT MAX(created_at) t FROM vietqr_transactions').get().t;
    if (last) {
      const gapH = (now - new Date(last.replace(' ', 'T'))) / HOUR;
      const activeDays = c.prepare(`SELECT COUNT(DISTINCT date(created_at)) n FROM vietqr_transactions
        WHERE date(created_at) >= date(?, '-8 days') AND date(created_at) < date(?, '-1 day')`).get(last, last).n;
      if (gapH > SILENT_HOURS && activeDays >= ACTIVE_DAYS) {
        out.push({ kind: 'webhook_silent', ref: '', count: Math.floor(gapH),
          message: `${Math.floor(gapH)} giờ không nhận giao dịch nào, trong khi tuần trước ${activeDays} ngày có giao dịch. Kiểm tra kết nối ngân hàng` });
      }
    }
    return out;
  });
}

function runChecks(now = new Date()) {
  const tenants = control.prepare(`SELECT t.code, t.community_id, c.settings FROM tenants t
    LEFT JOIN communities c ON c.id = t.community_id WHERE t.status='active'`).all();
  const upsert = control.prepare(`INSERT INTO alerts(tenant_code, community_id, kind, ref, message, count) VALUES (?,?,?,?,?,?)
    ON CONFLICT(tenant_code, kind, ref) WHERE resolved_at IS NULL
    DO UPDATE SET message=excluded.message, count=excluded.count, last_seen_at=datetime('now','localtime')`);
  const open = control.prepare('SELECT id, kind, ref FROM alerts WHERE tenant_code=? AND resolved_at IS NULL');
  const resolve = control.prepare("UPDATE alerts SET resolved_at=datetime('now','localtime') WHERE id=?");
  let raised = 0;
  for (const t of tenants) {
    let found;
    try { found = findings(t.code, communitySettings(t.settings).unclassified_alert_days, now); } catch (e) { console.error(`  Tự kiểm ${t.code} lỗi:`, e.message); continue; }
    const keys = new Set(found.map((f) => f.kind + '|' + f.ref));
    for (const f of found) { upsert.run(t.code, t.community_id, f.kind, f.ref, f.message, f.count); raised++; }
    for (const a of open.all(t.code)) if (!keys.has(a.kind + '|' + a.ref)) resolve.run(a.id);
  }
  return raised;
}

// Cảnh báo đang mở của một tenant (màn của tenant) hoặc nhiều tenant (màn nền tảng)
const openAlerts = (codes) => (codes.length
  ? control.prepare(`SELECT * FROM alerts WHERE resolved_at IS NULL AND tenant_code IN (${codes.map(() => '?').join(',')}) ORDER BY id DESC`).all(...codes)
  : []);

module.exports = { runChecks, findings, openAlerts };
