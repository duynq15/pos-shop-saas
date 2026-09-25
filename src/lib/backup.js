'use strict';

const fs = require('fs');
const path = require('path');

const SQLITE_HEADER = 'SQLite format 3\u0000';

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const backupsDir = (dataDir) => path.join(dataDir, 'backups');

// Tạo bản sao lưu nhất quán bằng VACUUM INTO (an toàn cả khi đang bật WAL).
function createBackup(db, dataDir) {
  const dir = backupsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `pos-${stamp()}.db`;
  const dest = path.join(dir, name);
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  const st = fs.statSync(dest);
  return { name, size: st.size, mtime: st.mtime.toISOString() };
}

function listBackups(dataDir) {
  const dir = backupsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^[A-Za-z0-9._-]+\.db$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

function pruneBackups(dataDir, keep) {
  const list = listBackups(dataDir);
  const k = Math.max(1, Number(keep) || 30);
  let removed = 0;
  for (const b of list.slice(k)) {
    try { fs.unlinkSync(path.join(backupsDir(dataDir), b.name)); removed++; } catch { /* ignore */ }
  }
  return removed;
}

// Chỉ cho phép tên file hợp lệ nằm trong thư mục backups.
function resolveBackup(dataDir, name) {
  if (!name || !/^[A-Za-z0-9._-]+\.db$/.test(name)) return null;
  const full = path.join(backupsDir(dataDir), name);
  if (path.dirname(path.resolve(full)) !== path.resolve(backupsDir(dataDir))) return null;
  return fs.existsSync(full) ? full : null;
}

function isSqliteFile(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return buf.toString('utf8').startsWith(SQLITE_HEADER) || buf.toString('latin1').startsWith('SQLite format 3');
  } catch { return false; }
}

// Đưa bản sao lưu vào diện chờ; sẽ được áp dụng ở lần khởi động kế tiếp.
function stageRestore(dataDir, name) {
  const file = resolveBackup(dataDir, name);
  if (!file) return { ok: false, error: 'Không tìm thấy bản sao lưu' };
  if (!isSqliteFile(file)) return { ok: false, error: 'File sao lưu không hợp lệ' };
  fs.copyFileSync(file, path.join(dataDir, 'restore.pending'));
  return { ok: true };
}

// Áp dụng phục hồi đang chờ (gọi trước khi mở DB).
function applyPendingRestore(dataDir) {
  const pending = path.join(dataDir, 'restore.pending');
  if (!fs.existsSync(pending)) return false;
  if (!isSqliteFile(pending)) { try { fs.unlinkSync(pending); } catch { /* ignore */ } return false; }
  const dbPath = path.join(dataDir, 'pos.db');
  try {
    if (fs.existsSync(dbPath)) fs.renameSync(dbPath, path.join(dataDir, `pos.db.before-restore-${stamp()}`));
    for (const ext of ['-wal', '-shm']) { const p = dbPath + ext; if (fs.existsSync(p)) fs.unlinkSync(p); }
    fs.renameSync(pending, dbPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { createBackup, listBackups, pruneBackups, resolveBackup, stageRestore, applyPendingRestore, backupsDir, isSqliteFile };
