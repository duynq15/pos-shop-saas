'use strict';

const express = require('express');
const path = require('path');
const os = require('os');

const { fail } = require('./src/lib/util');
const db = require('./src/db');
const { control } = require('./src/control');
const { attachSession, requireAuth, tenantContext } = require('./src/middleware');

const authRoutes = require('./src/routes/auth');
const usersRoutes = require('./src/routes/users');
const platformRoutes = require('./src/routes/platform');
const admin = require('./src/routes/admin');
const catalog = require('./src/routes/catalog');
const sales = require('./src/routes/sales');
const inventory = require('./src/routes/inventory');
const reports = require('./src/routes/reports');
const backup = require('./src/routes/backup');
const vietqr = require('./src/routes/vietqr');
const publicRoutes = require('./src/routes/public');
const community = require('./src/routes/community');
const funds = require('./src/routes/funds');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.locals.port = PORT;
app.set('trust proxy', 1);

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } }));

// Webhook công khai cho VietQR gọi vào (không cần đăng nhập)
app.use('/vqr', vietqr.webhook);

// Báo cáo thống kê giao dịch công khai (chia sẻ bằng link token, không cần đăng nhập)
app.get('/r/:token', publicRoutes.page);
app.use('/public/api', publicRoutes.router);

// Xác thực & định tuyến theo tenant
app.use(attachSession);
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api', tenantContext);

// API nghiệp vụ
app.use('/api/platform', platformRoutes);
app.use('/api', (req, res, next) => {
  if (req.user && req.user.role === 'platform') return fail(res, 'Quản trị nền tảng chỉ dùng mục Cửa hàng', 403);
  next();
});
app.use('/api', usersRoutes);
app.use('/api', community);
app.use('/api', funds);
app.use('/api', admin.router);
app.use('/api', backup.router);
app.use('/api', vietqr.router);
app.use('/api', catalog);
app.use('/api', sales);
app.use('/api', inventory);
app.use('/api', reports);

app.use('/api', (req, res) => fail(res, 'Không tìm thấy API: ' + req.method + ' ' + req.originalUrl, 404));

app.use((err, req, res, next) => {
  // Response already sent: log only; passing on to finalhandler would destroy a keep-alive socket
  if (res.headersSent) return console.error(err);
  const code = Number.isInteger(err.code) ? err.code : 500;
  if (code >= 500) console.error(err);
  fail(res, err.message || 'Lỗi máy chủ', code);
});

function lanUrls() {
  const urls = [`http://localhost:${PORT}`];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
  }
  return urls;
}

function autoBackup() {
  try {
    for (const t of control.prepare('SELECT code FROM tenants').all()) {
      db.runWith(t.code, () => {
        const enabled = db.prepare("SELECT value FROM settings WHERE key='backup_enabled'").get();
        if (enabled && enabled.value === '0') return;
        backup.createBackup(db, db.DATA_DIR);
        const keep = db.prepare("SELECT value FROM settings WHERE key='backup_keep'").get();
        backup.pruneBackups(db.DATA_DIR, Number(keep && keep.value) || 30);
      });
    }
  } catch (e) {
    console.error('  Sao lưu tự động lỗi:', e.message);
  }
}

app.listen(PORT, HOST, () => {
  console.log('\n  POS Shop đang chạy');
  console.log('  ------------------------------');
  for (const u of lanUrls()) console.log('  • ' + u);
  const tenants = control.prepare('SELECT COUNT(*) c FROM tenants').get().c;
  console.log(`\n  ${tenants} cửa hàng · đăng nhập bằng tài khoản được cấp\n`);

  if (process.env.NO_BACKUP !== '1') {
    setTimeout(autoBackup, 4000).unref?.();
    setInterval(autoBackup, 6 * 60 * 60 * 1000).unref?.();
  }
});

module.exports = app;
