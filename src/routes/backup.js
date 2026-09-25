'use strict';

const fs = require('fs');
const express = require('express');
const db = require('../db');
const { ok, fail, wrap, bad, num } = require('../lib/util');
const { createBackup, listBackups, pruneBackups, resolveBackup, stageRestore } = require('../lib/backup');

const router = express.Router();

const keepCount = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key='backup_keep'").get();
  return Math.max(1, Number(row && row.value) || 30);
};
const enabled = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key='backup_enabled'").get();
  return !row || row.value === '1';
};

router.get('/backups', wrap((req, res) => {
  ok(res, { enabled: enabled(), keep: keepCount(), items: listBackups(db.DATA_DIR) });
}));

router.post('/backup/now', wrap((req, res) => {
  const info = createBackup(db, db.DATA_DIR);
  pruneBackups(db.DATA_DIR, keepCount());
  ok(res, info);
}));

router.get('/backups/:name/download', wrap((req, res) => {
  const file = resolveBackup(db.DATA_DIR, req.params.name);
  if (!file) return fail(res, 'Không tìm thấy bản sao lưu', 404);
  res.download(file, req.params.name);
}));

router.delete('/backups/:name', wrap((req, res) => {
  const file = resolveBackup(db.DATA_DIR, req.params.name);
  if (!file) return fail(res, 'Không tìm thấy bản sao lưu', 404);
  fs.unlinkSync(file);
  ok(res, true);
}));

router.post('/backups/:name/restore', wrap((req, res) => {
  const r = stageRestore(db.DATA_DIR, req.params.name);
  if (!r.ok) bad(r.error);
  ok(res, { staged: true, message: 'Đã xếp lịch phục hồi. Khởi động lại phần mềm để áp dụng.' });
}));

module.exports = { router, createBackup, pruneBackups, enabled, keepCount };
