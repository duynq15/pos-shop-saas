'use strict';

/*
 * Sinh dữ liệu mẫu đa dạng cho POS Shop (nhiều cửa hàng, sản phẩm, hóa đơn, doanh thu).
 *
 * Cách dùng:
 *   npm run seed:demo                     # mặc định DATA_DIR=./data-demo
 *   DATA_DIR=./data npm run seed:demo     # ghi thẳng vào dữ liệu thật (cẩn thận)
 *   node scripts/seed-demo.js --reset     # xóa DATA_DIR rồi tạo lại từ đầu
 *
 * Script chỉ ghi thêm khi cửa hàng chưa có hóa đơn, nên chạy lại không nhân đôi dữ liệu.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data-demo');
process.env.DATA_DIR = DATA_DIR;

if (process.argv.includes('--reset') && fs.existsSync(DATA_DIR)) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('  [reset] đã xóa ' + DATA_DIR);
}

const { control } = require('../src/control');
const db = require('../src/db');
const { hashPassword } = require('../src/lib/auth');
const { removeVietnamese } = require('../src/lib/vietqr');

/* ===================== Tiện ích ===================== */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pad = (n, w) => String(n).padStart(w, '0');
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`;
}
const money = (n) => n.toLocaleString('vi-VN') + ' ₫';

/* ===================== Danh mục sản phẩm ===================== */
// [danh mục, tên, đvt, giá vốn, giá bán, vat%, độ phổ biến 1..5]
const CATALOG = [
  ['Đồ uống', 'Nước suối Aquafina 500ml', 'chai', 3500, 5000, 8, 5],
  ['Đồ uống', 'Coca Cola lon 330ml', 'lon', 8000, 10000, 8, 5],
  ['Đồ uống', 'Pepsi lon 330ml', 'lon', 8000, 10000, 8, 4],
  ['Đồ uống', 'Trà xanh C2 455ml', 'chai', 8000, 11000, 8, 4],
  ['Đồ uống', 'Nước tăng lực Sting 330ml', 'lon', 9000, 12000, 8, 4],
  ['Đồ uống', 'Sữa tươi TH True Milk 1L', 'hộp', 30000, 38000, 8, 3],
  ['Đồ uống', 'Bia Heineken lon 330ml', 'lon', 17000, 22000, 10, 4],
  ['Đồ uống', 'Bia Tiger lon 330ml', 'lon', 15000, 20000, 10, 4],
  ['Đồ uống', 'Nước ngọt Sprite lon 320ml', 'lon', 8000, 10000, 8, 3],
  ['Đồ uống', 'Cà phê G7 hộp 50 gói', 'hộp', 105000, 128000, 8, 3],
  ['Đồ uống', 'Trà Lipton hộp 25 túi', 'hộp', 42000, 55000, 8, 2],
  ['Đồ uống', 'Sữa đặc Ông Thọ 380g', 'lon', 22000, 27000, 8, 3],
  ['Tạp hóa', 'Mì Hảo Hảo tôm chua cay', 'gói', 3500, 4500, 8, 5],
  ['Tạp hóa', 'Mì Omachi 2 trứng', 'gói', 7000, 9000, 8, 4],
  ['Tạp hóa', 'Phở Bò Acecook', 'gói', 5000, 6500, 8, 3],
  ['Tạp hóa', 'Nước mắm Nam Ngư 500ml', 'chai', 22000, 28000, 8, 4],
  ['Tạp hóa', 'Dầu ăn Simply 1L', 'chai', 48000, 55000, 8, 3],
  ['Tạp hóa', 'Đường Biên Hòa 1kg', 'túi', 20000, 25000, 8, 4],
  ['Tạp hóa', 'Muối i-ốt 500g', 'gói', 5000, 7000, 8, 3],
  ['Tạp hóa', 'Bột ngọt Ajinomoto 454g', 'túi', 38000, 46000, 8, 3],
  ['Tạp hóa', 'Gạo ST25 túi 5kg', 'túi', 145000, 175000, 0, 4],
  ['Tạp hóa', 'Nước tương Chinsu 500ml', 'chai', 18000, 24000, 8, 3],
  ['Tạp hóa', 'Tương ớt Chinsu 500g', 'chai', 17000, 23000, 8, 3],
  ['Tạp hóa', 'Hạt nêm Knorr 400g', 'túi', 32000, 40000, 8, 3],
  ['Hóa mỹ phẩm', 'Bột giặt OMO 3kg', 'túi', 145000, 165000, 10, 3],
  ['Hóa mỹ phẩm', 'Nước rửa chén Sunlight 750g', 'chai', 25000, 32000, 10, 4],
  ['Hóa mỹ phẩm', 'Kem đánh răng P/S 180g', 'tuýp', 22000, 29000, 8, 3],
  ['Hóa mỹ phẩm', 'Dầu gội Clear 630ml', 'chai', 95000, 120000, 10, 2],
  ['Hóa mỹ phẩm', 'Sữa tắm Dove 500ml', 'chai', 110000, 139000, 10, 2],
  ['Hóa mỹ phẩm', 'Nước xả Comfort 800ml', 'túi', 55000, 68000, 10, 3],
  ['Hóa mỹ phẩm', 'Giấy vệ sinh An An (lố 10)', 'lố', 45000, 58000, 8, 3],
  ['Hóa mỹ phẩm', 'Khăn giấy ăn hộp', 'hộp', 22000, 30000, 8, 2],
  ['Bánh kẹo', 'Bánh Oreo hộp 133g', 'hộp', 12000, 18000, 8, 4],
  ['Bánh kẹo', 'Kẹo Alpenliebe gói', 'gói', 9000, 13000, 8, 3],
  ['Bánh kẹo', 'Snack Oishi gói', 'gói', 8000, 11000, 8, 4],
  ['Bánh kẹo', 'Bánh quy Cosy hộp', 'hộp', 25000, 33000, 8, 2],
  ['Bánh kẹo', 'Socola KitKat', 'thanh', 12000, 17000, 10, 3],
  ['Bánh kẹo', 'Kẹo mút Chupa Chups', 'cây', 4000, 6000, 8, 2],
  ['Đồ gia dụng', 'Chảo chống dính 26cm', 'cái', 120000, 165000, 10, 2],
  ['Đồ gia dụng', 'Nồi inox 3 đáy 24cm', 'cái', 210000, 290000, 10, 2],
  ['Đồ gia dụng', 'Rổ nhựa Duy Tân lớn', 'cái', 18000, 25000, 10, 2],
  ['Đồ gia dụng', 'Thùng rác nhựa 15L', 'cái', 45000, 65000, 10, 2],
  ['Đồ gia dụng', 'Bóng đèn LED 9W Rạng Đông', 'cái', 28000, 38000, 10, 3],
  ['Đồ gia dụng', 'Ổ cắm điện Lioa 3 lỗ', 'cái', 65000, 85000, 10, 2],
  ['Đồ gia dụng', 'Móc treo quần áo (lố 10)', 'lố', 15000, 22000, 10, 2],
  ['Đồ gia dụng', 'Ca nhựa 1.5L', 'cái', 20000, 28000, 10, 2],
  ['Đồ gia dụng', 'Bộ dao thớt inox', 'bộ', 90000, 130000, 10, 1],
  ['Đồ gia dụng', 'Bình thủy tinh 1L', 'cái', 60000, 85000, 10, 1],
  ['Khác', 'Pin tiểu AA (vỉ 4)', 'vỉ', 20000, 30000, 8, 3],
  ['Khác', 'Quạt mini tích điện', 'cái', 180000, 250000, 10, 1],
  ['Khác', 'Sạc điện thoại 20W', 'cái', 80000, 120000, 10, 2],
  ['Khác', 'Băng keo trong', 'cuộn', 8000, 12000, 8, 2],
  ['Khác', 'Túi nilon đựng rác (cuộn)', 'cuộn', 15000, 22000, 8, 3]
];

const CUSTOMERS = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Thu Dung', 'Hoàng Văn Em',
  'Vũ Thị Phương', 'Đặng Minh Quân', 'Bùi Thị Hoa', 'Đỗ Văn Kiên', 'Ngô Thanh Lan',
  'Anh Tuấn', 'Chị Mai', 'Chú Bảy', 'Cô Tư', 'Khách vãng lai', 'Công ty TNHH Phát Đạt',
  'Quán ăn Cô Hạnh', 'Tạp hóa Bà Tám', 'Trường mầm non Hoa Sen', 'Văn phòng số 12'
];

// Hồ sơ cửa hàng: quy mô, sản phẩm chủ đạo, xu hướng tăng trưởng, cơ cấu thanh toán.
const STORES = [
  { code: 'default', name: 'Tạp hóa trung tâm', area: 'Thôn A', base: 9, growth: 1.15, emphasis: {}, mix: { cash: 0.5, transfer: 0.35, card: 0.1, ewallet: 0.05 } },
  { code: 'demo-taphoa', name: 'Tạp hóa Minh Anh', area: 'Thôn A', base: 13, growth: 1.25, emphasis: { 'Tạp hóa': 1.6, 'Đồ uống': 1.4, 'Bánh kẹo': 1.2 }, mix: { cash: 0.6, transfer: 0.28, card: 0.06, ewallet: 0.06 } },
  { code: 'demo-sieuthi', name: 'Siêu thị mini An Khang', area: 'Thôn B', base: 17, growth: 1.35, emphasis: { 'Hóa mỹ phẩm': 1.4, 'Tạp hóa': 1.3, 'Đồ uống': 1.2 }, mix: { cash: 0.42, transfer: 0.38, card: 0.12, ewallet: 0.08 } },
  { code: 'demo-dienmay', name: 'Điện máy Hùng Cường', area: '', base: 4.5, growth: 1.1, emphasis: { 'Đồ gia dụng': 2.2, 'Khác': 1.4 }, mix: { cash: 0.3, transfer: 0.4, card: 0.22, ewallet: 0.08 } },
  { code: 'demo-mypham', name: 'Mỹ phẩm & chăm sóc Hồng', area: 'Thôn B', base: 7, growth: 1.4, emphasis: { 'Hóa mỹ phẩm': 2.0, 'Bánh kẹo': 1.1 }, mix: { cash: 0.35, transfer: 0.35, card: 0.15, ewallet: 0.15 } },
  { code: 'demo-doanhnghiep', name: 'Bán hàng công nghiệp Đại Phát', area: '', base: 6, growth: 1.2, emphasis: { 'Tạp hóa': 1.8, 'Đồ uống': 1.6 }, mix: { cash: 0.2, transfer: 0.55, card: 0.15, ewallet: 0.1 } },
  { code: 'demo-online', name: 'Cửa hàng online 24/7', area: '', base: 10, growth: 1.6, emphasis: { 'Đồ uống': 1.3, 'Bánh kẹo': 1.3, 'Khác': 1.2 }, mix: { cash: 0.15, transfer: 0.4, card: 0.15, ewallet: 0.3 } },
  { code: 'demo-thucpham', name: 'Thực phẩm sạch Green', area: 'Thôn C', base: 8, growth: 1.3, emphasis: { 'Tạp hóa': 1.5, 'Đồ uống': 1.2 }, mix: { cash: 0.4, transfer: 0.35, card: 0.1, ewallet: 0.15 } }
];

// Người bán nhỏ (GĐ4): không có danh mục sản phẩm/tồn kho, chỉ nhận tiền nhanh theo hạng mục cộng đồng.
// [mã, tên, cộng đồng, hạng mục hay bán (trọng số), giá trung bình, lần bán/ngày]
const SMALL_SELLERS = [
  ['ban-rau-ba-nam', 'Hàng rau bà Năm', 'thon-a', { 'Rau củ': 6, 'Tạp hóa': 1 }, 35000, 9],
  ['quan-nuoc-co-ut', 'Quán nước cô Út', 'thon-a', { 'Đồ uống': 6, 'Ăn uống': 3 }, 22000, 14],
  ['sua-xe-anh-tu', 'Sửa xe anh Tư', 'thon-b', { 'Dịch vụ': 8, 'Tạp hóa': 1 }, 90000, 4],
  ['thit-heo-chu-sau', 'Thịt heo chú Sáu', 'cho-c', { 'Thịt cá': 8 }, 120000, 7],
  ['banh-mi-chi-hai', 'Bánh mì chị Hai', 'cho-c', { 'Ăn uống': 7, 'Đồ uống': 2 }, 18000, 18],
];

const DAYS = 180;

// Cộng đồng mẫu (GĐ1): người bán thuộc cộng đồng dùng tài khoản ngân hàng riêng (BR-02).
const COMMUNITIES = [
  { code: 'thon-a', name: 'Thôn An Phú', type: 'village', area: 'Thôn A', contact: 'Ông Nguyễn Văn Hải', sellers: ['demo-taphoa'] },
  { code: 'thon-b', name: 'Thôn Bình Minh', type: 'village', area: 'Thôn B', contact: 'Bà Trần Thị Lựu', sellers: ['demo-sieuthi', 'demo-mypham'] },
  { code: 'cho-c', name: 'Chợ Phước Hòa', type: 'market', area: 'Thôn C', contact: 'Ông Lê Văn Tâm', sellers: ['demo-thucpham'] },
  { code: 'chua-pl', name: 'Chùa Phước Lâm', type: 'pagoda', area: 'Thôn A', contact: 'Thầy Thích Minh Tâm', sellers: [] }
];
const SUPPLIERS = [
  ['Công ty CP Hàng tiêu dùng Masan', 'Chị Thảo', 30], ['NPP Nước giải khát Suntory PepsiCo', 'Anh Khoa', 15],
  ['Đại lý Unilever Miền Nam', 'Anh Phúc', 30], ['Kho sỉ Bình Tây', 'Cô Sáu', 0],
  ['Công ty TNHH Gia dụng Sunhouse', 'Anh Long', 45], ['NPP Bánh kẹo Kinh Đô', 'Chị Ngân', 15]
];
const pw = hashPassword('demo1234');
function addUser(tenantId, username, fullName, role) {
  const u = control.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (u) return u.id;
  return Number(control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,phone,role) VALUES (?,?,?,?,?,?)')
    .run(tenantId, username, pw, fullName, '09' + pad(hash(username) % 1e8, 8), role).lastInsertRowid);
}

/* ===================== Nạp một cửa hàng ===================== */
function seedStore(store) {
  const exists = control.prepare('SELECT id FROM tenants WHERE code=?').get(store.code);
  let tenantId;
  if (!exists) {
    const r = control.prepare('INSERT INTO tenants(code,name,plan,status,area) VALUES (?,?,?,?,?)')
      .run(store.code, store.name, 'standard', 'active', store.area || null);
    tenantId = Number(r.lastInsertRowid);
  } else {
    tenantId = exists.id;
    control.prepare('UPDATE tenants SET area=? WHERE id=?').run(store.area || null, tenantId);
  }
  const owner = control.prepare('SELECT id FROM users WHERE username=?').get(store.code + '-owner');
  if (!owner) {
    control.prepare('INSERT INTO users(tenant_id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)')
      .run(tenantId, store.code + '-owner', hashPassword('demo1234'), 'Chủ ' + store.name, 'owner');
  }

  const conn = db.getTenantDb(store.code);
  const now = new Date();
  conn.prepare('UPDATE settings SET value=? WHERE key=?').run(store.name, 'shop_name');
  conn.prepare('UPDATE settings SET value=? WHERE key=?').run('Địa chỉ demo ' + store.code, 'shop_address');
  conn.prepare('UPDATE settings SET value=? WHERE key=?').run('0900' + pad(1000000 + (hash(store.code) % 8999999), 7), 'shop_phone');
  conn.prepare('UPDATE settings SET value=? WHERE key=?').run('inclusive', 'vat_mode');
  conn.prepare('UPDATE settings SET value=? WHERE key=?').run('8', 'vat_default_rate');

  // Mỗi cửa hàng một tài khoản nhận tiền riêng (BR-02), VietQR chạy chế độ mock
  const holder = ('Chu ' + store.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[Đđ]/g, 'D').toUpperCase();
  for (const [k, v] of [['bank_account', '1' + pad(hash('acc' + store.code) % 1e11, 11)], ['account_holder', holder], ['vqr_enabled', '1'], ['vqr_env', 'mock']]) {
    conn.prepare('UPDATE settings SET value=? WHERE key=?').run(v, k);
  }
  for (const [suffix, name, role] of [['quanly', 'Quản lý', 'manager'], ['thungan', 'Thu ngân', 'cashier'], ['thungan2', 'Thu ngân ca tối', 'cashier'], ['kho', 'Thủ kho', 'warehouse'], ['ketoan', 'Kế toán', 'accountant']]) {
    addUser(tenantId, `${store.code}-${suffix}`, `${name} ${store.name}`, role);
  }

  const existing = conn.prepare("SELECT COUNT(*) c FROM invoices").get().c;
  if (existing > 0) return { code: store.code, skipped: true, invoices: existing };

  const rnd = mulberry32(hash(store.code) ^ 0x9e3779b9);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);

  const catId = (name) => conn.prepare('SELECT id FROM categories WHERE name=?').get(name).id;
  const catIds = {};
  for (const n of ['Tạp hóa', 'Đồ gia dụng', 'Đồ uống', 'Hóa mỹ phẩm', 'Bánh kẹo', 'Khác']) catIds[n] = catId(n);

  // ---------- Sản phẩm ----------
  const insProduct = conn.prepare(`INSERT INTO products(barcode,sku,name,category_id,unit,cost_price,sell_price,stock,min_stock,max_stock,location,vat_rate,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insUnit = conn.prepare('INSERT INTO product_units(product_id,name,conversion,sell_price,barcode,is_base,sort_order) VALUES (?,?,?,?,?,?,?)');
  const pool = [];
  let sp = 0;
  for (const [cat, name, unit, cost, sell, vat, pop] of CATALOG) {
    const emph = store.emphasis[cat] || 1;
    if (rnd() > Math.min(0.98, 0.62 * emph + (pop / 5) * 0.25)) continue; // mỗi shop một danh mục khác nhau
    const priceVar = 1 + between(-0.05, 0.07);
    const c = Math.round(cost * (1 + between(-0.03, 0.05)) / 100) * 100;
    const s = Math.round((sell * priceVar) / 500) * 500;
    sp++;
    const barcode = '2' + pad(hash(store.code + name) % 1e12, 12);
    const created = fmtDate(new Date(now.getTime() - between(200, 400) * 86400000));
    const minStock = Math.max(2, Math.round(between(3, 20)));
    const stock = Math.max(0, Math.round(between(0, 180)));
    const maxStock = minStock * 12;
    const r = insProduct.run(barcode, 'SP' + pad(sp, 4), name, catIds[cat], unit, c, s, stock, minStock, maxStock,
      'K' + (1 + Math.floor(rnd() * 9)), vat, created, created);
    const pid = Number(r.lastInsertRowid);
    insUnit.run(pid, unit, 1, s, barcode, 1, 0);
    pool.push({ id: pid, name, unit, cost: c, sell: s, vat, pop, weight: pop * emph });
  }
  const totalWeight = pool.reduce((a, p) => a + p.weight, 0);
  const randomProduct = () => {
    let x = rnd() * totalWeight;
    for (const p of pool) { x -= p.weight; if (x <= 0) return p; }
    return pool[pool.length - 1];
  };

  // ---------- Hóa đơn ----------
  const insInvoice = conn.prepare(`INSERT INTO invoices(code,type,parent_id,subtotal,item_discount,order_discount,discount,total,payment_method,paid_amount,change_amount,customer_name,customer_phone,status,created_at,net_amount,vat_amount,payment_ref)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insItem = conn.prepare(`INSERT INTO invoice_items(invoice_id,product_id,name,barcode,unit_id,unit_name,conversion,qty,base_qty,price,cost_price,discount,line_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insPay = conn.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note,created_at) VALUES (?,?,?,?,?)');
  const insTax = conn.prepare('INSERT INTO invoice_tax_lines(invoice_id,rate,taxable_amount,tax_amount) VALUES (?,?,?,?)');

  const daySeq = new Map();
  const saleIds = [];
  let refSeq = 1000000 + (hash(store.code) % 9000000);
  let invoiceCount = 0, returnCount = 0, itemCount = 0, grossRevenue = 0;

  const methods = Object.entries(store.mix);
  const pickMethod = () => { let x = rnd(), acc = 0; for (const [m, w] of methods) { acc += w; if (x <= acc) return m; } return 'cash'; };

  const buildInvoice = (dateObj, kind, parent) => {
    const items = [];
    const nItems = 1 + Math.floor(rnd() * (kind === 'return' ? 3 : 4.6));
    for (let i = 0; i < nItems; i++) {
      const p = randomProduct();
      let qty = 1 + Math.floor(rnd() * 4);
      if (p.pop >= 4 && rnd() < 0.25) qty += 1 + Math.floor(rnd() * 5);
      const price = p.sell;
      const disc = rnd() < 0.12 ? Math.round((price * qty) * between(0.03, 0.12) / 100) * 100 : 0;
      items.push({ p, qty, price, disc, gross: price * qty - disc });
    }
    let subtotal = 0, itemDiscount = 0, total = 0;
    const taxMap = new Map();
    let netSum = 0, vatSum = 0;
    for (const it of items) {
      subtotal += it.price * it.qty;
      itemDiscount += it.disc;
      total += it.gross;
      if (it.p.vat > 0) {
        const net = Math.round(it.gross / (1 + it.p.vat / 100));
        const tax = it.gross - net;
        netSum += net; vatSum += tax;
        taxMap.set(it.p.vat, (taxMap.get(it.p.vat) || 0) + tax);
      } else { netSum += it.gross; }
    }

    const day = fmtDate(dateObj).slice(0, 10);
    const seq = (daySeq.get(day) || 0) + 1; daySeq.set(day, seq);
    const prefix = kind === 'return' ? 'TH' : 'HD';
    const code = `${prefix}${day.replace(/-/g, '')}-${pad(seq, 4)}`;

    let status = 'paid';
    const ageDays = (now - dateObj) / 86400000;
    if (kind === 'sale' && ageDays < 3 && rnd() < 0.08) status = 'pending';
    else if (kind === 'sale' && rnd() < 0.015) status = 'cancelled';

    const method = pickMethod();
    const paymentRef = method === 'transfer' ? 'P' + pad(refSeq++, 10) : null;
    const cust = rnd() < 0.55 ? pick(CUSTOMERS) : null;
    const phone = cust && rnd() < 0.5 ? '09' + pad(Math.floor(rnd() * 1e8), 8) : null;
    const createdAt = fmtDate(dateObj);

    const r = insInvoice.run(code, kind, parent ? parent.id : null, subtotal, itemDiscount, 0, itemDiscount, total,
      method, status === 'paid' ? total : 0, 0, cust, phone, status, createdAt, netSum, vatSum, paymentRef);
    const invId = Number(r.lastInsertRowid);
    for (const it of items) {
      insItem.run(invId, it.p.id, it.p.name, null, null, it.p.unit, 1, it.qty, it.qty, it.price, it.p.cost, it.disc, it.gross);
      itemCount++;
    }
    if (status === 'paid' && kind === 'sale') insPay.run(invId, method, total, 'Thanh toán ' + method, createdAt);
    for (const [rate, tax] of taxMap) {
      const taxable = Math.round((total && vatSum) ? (tax / (vatSum || 1)) * netSum : 0);
      insTax.run(invId, rate, taxable || Math.round(items.filter((x) => x.p.vat === rate).reduce((a, x) => a + x.gross, 0) / (1 + rate / 100)), tax);
    }
    return { id: invId, total, code, createdAt, items };
  };

  conn.exec('BEGIN');
  for (let d = DAYS - 1; d >= 0; d--) {
    const dateObj = new Date(now.getTime() - d * 86400000);
    const dow = dateObj.getDay();
    const weekend = (dow === 0 || dow === 6) ? 1.35 : 1.0;
    const trend = 1 + ((DAYS - d) / DAYS) * (store.growth - 1);
    const season = 1 + 0.18 * Math.sin((dateObj.getMonth() + 1) / 12 * Math.PI * 2);
    const n = Math.max(0, Math.round(store.base * weekend * trend * season * between(0.65, 1.35)));
    for (let k = 0; k < n; k++) {
      const t = new Date(dateObj); t.setHours(7 + Math.floor(rnd() * 14), Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
      const inv = buildInvoice(t, 'sale', null);
      if (inv) { invoiceCount++; grossRevenue += inv.total; if (rnd() < 0.6) saleIds.push(inv); }
      // Phiếu trả hàng: ~2% hóa đơn, tham chiếu hóa đơn gần đây
      if (saleIds.length > 5 && rnd() < 0.02) {
        const parent = saleIds[Math.floor(rnd() * saleIds.length)];
        const rt = new Date(t.getTime() + 3600000);
        buildInvoice(rt, 'return', { id: parent.id });
        returnCount++;
      }
    }
  }
  conn.exec('COMMIT');

  const extra = seedExtras(conn, pool, catIds, rnd, between, now);
  return { ...extra, code: store.code, name: store.name, products: pool.length, invoices: invoiceCount, returns: returnCount, items: itemCount, revenue: grossRevenue, skipped: false };
}

/* ===================== NCC, nhập hàng, khuyến mãi, kiểm kho, VietQR ===================== */
function seedExtras(conn, pool, catIds, rnd, between, now) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const daysAgo = (d) => { const t = new Date(now.getTime() - d * 86400000); t.setHours(8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0); return t; };
  const codeOf = (prefix, table, t) => {
    const ymd = fmtDate(t).slice(0, 10).replace(/-/g, '');
    return `${prefix}${ymd}-${pad(conn.prepare(`SELECT COUNT(*) c FROM ${table} WHERE code LIKE ?`).get(prefix + ymd + '%').c + 1, 4)}`;
  };
  conn.exec('BEGIN');

  // Nhà cung cấp
  const sups = SUPPLIERS.filter(() => rnd() < 0.8).map(([name, contact, terms]) => {
    const r = conn.prepare('INSERT INTO suppliers(name,contact_name,phone,address,tax_code,payment_terms_days,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(name, contact, '028' + pad(hash(name) % 1e7, 7), 'KCN Tân Bình, TP.HCM', '03' + pad(hash(name) % 1e8, 8), terms, fmtDate(daysAgo(200)));
    return { id: Number(r.lastInsertRowid), name, bought: 0 };
  });

  // Phiếu nhập: khoảng mỗi 6–11 ngày một phiếu đã nhập kho, thêm 2 phiếu nháp gần đây
  const insPur = conn.prepare('INSERT INTO purchases(code,supplier_id,supplier_name,note,total,status,created_at,received_at) VALUES (?,?,?,?,?,?,?,?)');
  const insPurItem = conn.prepare('INSERT INTO purchase_items(purchase_id,product_id,name,unit_name,conversion,qty,base_qty,cost_price,line_total,vat_rate) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insMove = conn.prepare('INSERT INTO stock_moves(product_id,qty,type,ref_type,ref,unit_name,conversion,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  let purchases = 0;
  const purchase = (t, status) => {
    const sup = pick(sups);
    const lines = [...pool].sort(() => rnd() - 0.5).slice(0, 4 + Math.floor(rnd() * 7))
      .map((p) => ({ p, qty: 12 * (1 + Math.floor(rnd() * 5)) }));
    const code = codeOf('PN', 'purchases', t);
    const total = lines.reduce((a, l) => a + l.p.cost * l.qty, 0);
    const at = fmtDate(t);
    const id = Number(insPur.run(code, sup.id, sup.name, status === 'draft' ? 'Chờ hàng về' : null, total, status, at, status === 'received' ? at : null).lastInsertRowid);
    for (const { p, qty } of lines) {
      insPurItem.run(id, p.id, p.name, p.unit, 1, qty, qty, p.cost, p.cost * qty, p.vat);
      if (status === 'received') insMove.run(p.id, qty, 'purchase', 'purchase', code, p.unit, 1, sup.name, at);
    }
    if (status === 'received') sup.bought += total;
    purchases++;
  };
  if (sups.length) {
    for (let d = DAYS - 5; d > 3; d -= 6 + Math.floor(rnd() * 6)) purchase(daysAgo(d), 'received');
    purchase(daysAgo(1), 'draft');
    purchase(daysAgo(0), 'draft');
    // Trả NCC 70–90% công nợ, chia 2–4 đợt; phần còn lại là công nợ phải trả
    for (const s of sups) {
      let left = Math.round(s.bought * between(0.7, 0.9) / 1000) * 1000;
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n && left > 0; i++) {
        const amt = i === n - 1 ? left : Math.round(left / (n - i) / 1000) * 1000;
        const at = fmtDate(daysAgo(Math.round(DAYS - (i + 1) * DAYS / (n + 1))));
        conn.prepare('INSERT INTO supplier_payments(supplier_id,amount,method,note,paid_at,created_at) VALUES (?,?,?,?,?,?)')
          .run(s.id, amt, rnd() < 0.6 ? 'transfer' : 'cash', 'Thanh toán đợt ' + (i + 1), at, at);
        left -= amt;
      }
    }
  }

  // Điều chỉnh tồn thủ công
  for (let i = 0; i < 6; i++) {
    const p = pick(pool);
    insMove.run(p.id, -(1 + Math.floor(rnd() * 3)), 'adjust', 'adjust', null, p.unit, 1,
      pick(['Hàng vỡ', 'Hết hạn sử dụng', 'Hao hụt', 'Bao bì hỏng']), fmtDate(daysAgo(Math.floor(rnd() * 90))));
  }

  // Khuyến mãi: 2 đang chạy, 1 sắp tới, 1 đã kết thúc
  const day = (d) => fmtDate(new Date(now.getTime() + d * 86400000)).slice(0, 10);
  const [cname, cid] = pick(Object.entries(catIds));
  const star = pool.reduce((a, p) => (p.weight > a.weight ? p : a), pool[0]);
  const insPromo = conn.prepare('INSERT INTO promotions(name,kind,discount_type,discount_value,target_type,target_id,min_subtotal,min_qty,start_date,end_date,priority,active,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insPromo.run('Giảm 5% hóa đơn từ 300.000 ₫', 'order', 'percent', 5, 'all', null, 300000, 0, day(-20), day(40), 1, 1, null);
  insPromo.run(`Giảm 10% nhóm ${cname}`, 'item', 'percent', 10, 'category', cid, 0, 0, day(-5), day(25), 2, 1, null);
  insPromo.run(`Mua từ 6 ${star.unit} ${star.name} giảm 2.000 ₫`, 'item', 'amount', 2000, 'product', star.id, 0, 6, day(3), day(33), 3, 1, 'Sắp diễn ra');
  insPromo.run('Tết Nguyên Đán giảm 30.000 ₫', 'order', 'amount', 30000, 'all', null, 500000, 0, day(-150), day(-130), 0, 0, 'Đã kết thúc');

  // Kiểm kho: 1 phiếu đã chốt, 1 phiếu nháp đang đếm dở
  const insCheck = conn.prepare('INSERT INTO stock_checks(code,note,scope,status,created_at,completed_at) VALUES (?,?,?,?,?,?)');
  const insCheckItem = conn.prepare('INSERT INTO stock_check_items(check_id,product_id,name,unit_name,system_qty,counted_qty,diff,cost_price,note) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const [age, status] of [[30, 'completed'], [0, 'draft']]) {
    const t = daysAgo(age);
    const id = Number(insCheck.run(codeOf('KK', 'stock_checks', t), status === 'draft' ? 'Kiểm kho cuối tháng' : 'Kiểm kho định kỳ', 'all', status, fmtDate(t), status === 'completed' ? fmtDate(t) : null).lastInsertRowid);
    let diffValue = 0;
    for (const p of pool.slice(0, 15)) {
      const sys = conn.prepare('SELECT stock FROM products WHERE id=?').get(p.id).stock;
      const counted = status === 'draft' && rnd() < 0.4 ? null : Math.max(0, sys - (rnd() < 0.25 ? 1 + Math.floor(rnd() * 3) : 0));
      const diff = counted == null ? 0 : counted - sys;
      diffValue += diff * p.cost;
      insCheckItem.run(id, p.id, p.name, p.unit, sys, counted, diff, p.cost, diff ? 'Lệch khi đếm' : null);
    }
    conn.prepare('UPDATE stock_checks SET diff_value=? WHERE id=?').run(diffValue, id);
  }

  // Giao dịch VietQR 60 ngày gần nhất: khớp hóa đơn chuyển khoản, vài giao dịch không khớp và hoàn tiền
  const account = conn.prepare("SELECT value FROM settings WHERE key='bank_account'").get().value;
  const insTx = conn.prepare("INSERT INTO vietqr_transactions(transactionid,invoice_id,bank_account,amount,content,order_id,trans_type,matched,note,created_at,category) VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='D' THEN 'refund' WHEN ?=1 THEN 'sale' ELSE 'unclassified' END)");
  let txSeq = hash(account) % 1e6, txns = 0;
  // a = [invoice_id, account, amount, content, order_id, trans_type, matched, note, created_at]
  const tx = (...a) => { insTx.run('FT' + pad(txSeq++, 10), ...a, a[5], a[6]); txns++; };
  for (const inv of conn.prepare("SELECT id,total,payment_ref,created_at FROM invoices WHERE type='sale' AND status='paid' AND payment_method='transfer' AND created_at>=?").all(fmtDate(daysAgo(60)))) {
    tx(inv.id, account, inv.total, `${inv.payment_ref} thanh toan hoa don`, inv.payment_ref, 'C', 1, null, inv.created_at);
    if (rnd() < 0.04) tx(null, account, Math.round(inv.total * between(0.2, 1) / 1000) * 1000, 'CK chuyen tien', null, 'C', 0, 'Không tìm thấy hóa đơn', inv.created_at);
    if (rnd() < 0.01) tx(inv.id, account, inv.total, `Hoan tien ${inv.payment_ref}`, inv.payment_ref, 'D', 1, 'Hoàn tiền cho khách', inv.created_at);
  }
  conn.exec('COMMIT');
  return { suppliers: sups.length, purchases, txns };
}

/* ===================== Sổ quỹ mẫu (GĐ2) ===================== */
// Mỗi cộng đồng: Quỹ chung + một chương trình công đức, có thu tiền mặt / VietQR, một khoản chi đã duyệt,
// một khoản chờ duyệt. Ghi thẳng DB (không qua API) nên phải tự giữ đúng luật: người duyệt khác người lập,
// chi không vượt tồn, khoản chi có ảnh chứng từ.
// Ảnh chứng từ mẫu: PNG thật 240x320 (giấy biên nhận có các dòng kẻ), dựng bằng zlib, không cần thư viện ảnh.
function receiptPng() {
  const zlib = require('zlib');
  const w = 240, h = 320;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const line = y > 40 && y % 24 === 0 && x > 20 && x < (y % 48 ? 220 : 160);
      const head = y > 14 && y < 30 && x > 60 && x < 180;
      const v = head ? 60 : line ? 150 : 250;
      raw.fill(v, y * (w * 3 + 1) + 1 + x * 3, y * (w * 3 + 1) + 4 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const RECEIPT_PNG = receiptPng();
const DONORS = ['Ông Nguyễn Văn Thành', 'Bà Lê Thị Hoa', 'Gia đình anh Tuấn', 'Chị Phạm Thu Hà', 'Ông Trần Văn Bảy', 'Bà Võ Thị Mai', 'Anh Đỗ Minh Khoa', 'Cô Hồ Thị Lan',
  'Gia đình ông Lê Văn Đức', 'Bà Nguyễn Thị Sen', 'Anh Trần Quốc Việt (Hà Nội)', 'Chị Đinh Thu Trang', 'Ông bà Phạm Văn Lộc', 'Cháu Hoàng Gia Bảo',
  'Hội phụ nữ thôn', 'Chi hội cựu chiến binh', 'Doanh nghiệp tư nhân Hòa Bình', 'Con cháu xa quê tại TP.HCM', 'Ông Võ Văn Mười', 'Bà Đặng Thị Cúc'];
function seedFunds(code, c) {
  const conn = db.getTenantDb(code);
  const u = (suffix) => control.prepare('SELECT id, full_name FROM users WHERE username=?').get(`${c.code}-${suffix}`);
  const tq = u('thuquy'); const dy = u('duyet');
  const rnd = mulberry32(hash('funds-' + c.code));
  const acc = (i) => '96' + pad(hash(c.code + i) % 1e8, 8);
  const dir = path.join(DATA_DIR, 'tenants', code, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  conn.prepare("UPDATE settings SET value=? WHERE key='fund_groups' AND value=''").run(c.type === 'pagoda' ? 'Ban hộ tự\nĐạo tràng'
    : 'Xóm 1\nXóm 2\nXóm 3\nHội Phụ nữ\nHội Cựu chiến binh\nChi đoàn thanh niên');
  // Công đức công khai trên trang người nộp; quỹ chung không
  const insFund = conn.prepare(`INSERT INTO funds(code,name,kind,fund_type,is_public,contribution,bank_account,bank_bin,bank_name,account_holder,manager_user_id,description,created_by)
    VALUES (?,?,?,CASE ?3 WHEN 'donation' THEN 'Công đức' ELSE 'Quỹ chung' END,?3='donation',CASE ?3 WHEN 'donation' THEN 'voluntary' ELSE 'household' END,?,'970422','MB Bank',?,?,?,?)`);
  const insEntry = conn.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,payer_name,anonymous,note,attachment,status,
    created_by,created_by_name,created_at,approved_by,approved_by_name,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Cùng khuôn makeCode: số thứ tự đếm riêng theo tiền tố + ngày
  const seqs = {};
  const entryCode = (prefix, d) => {
    const k = prefix + fmtDate(d).slice(0, 10).replace(/-/g, '');
    if (seqs[k] === undefined) seqs[k] = conn.prepare('SELECT COUNT(*) n FROM fund_entries WHERE code LIKE ?').get(k + '%').n;
    seqs[k] += 1; return `${k}-${pad(seqs[k], 4)}`;
  };
  conn.exec('BEGIN');
  const FUNDS = c.type === 'pagoda'
    ? [['quy-chung', 'Quỹ nhà chùa', 'general', 'Điện nước, hương đèn, sinh hoạt', 30],
      ['cong-duc', 'Công đức đúc chuông', 'donation', 'Đúc đại hồng chung', 45],
      ['phat-dan', 'Lễ Phật đản', 'donation', 'Tổ chức đại lễ Phật đản', 25]]
    : [['quy-chung', 'Quỹ chung ' + c.name, 'general', 'Chi tiêu chung, sửa đường, điện chiếu sáng', 22],
      ['cong-duc', 'Công đức tu sửa đình làng', 'donation', 'Chương trình công đức năm nay', 28],
      ['khuyen-hoc', 'Quỹ khuyến học', 'donation', 'Thưởng học sinh giỏi, hỗ trợ học sinh khó khăn', 16],
      ['tet-2026', 'Chương trình Tết cho hộ nghèo', 'donation', 'Đã kết thúc, quyết toán xong', 10]];
  for (const [fcode, name, kind, desc, nIn] of FUNDS) {
    if (conn.prepare('SELECT 1 FROM funds WHERE code=?').get(fcode)) continue; // chạy lại seed: giữ quỹ đã có
    const fid = Number(insFund.run(fcode, name, kind, acc(fcode), 'BAN QUAN LY ' + removeVietnamese(c.name).toUpperCase(), tq.id, desc, dy.id).lastInsertRowid);
    let balance = 0;
    const closed = fcode === 'tet-2026';
    const span = closed ? 180 : 170; // quỹ đã đóng: giao dịch cách đây 3–6 tháng
    for (let i = 0; i < nIn; i++) {
      const d = new Date(Date.now() - (closed ? 90 + (span - 90) * (1 - i / nIn) : span * (1 - i / nIn)) * 86400000 - rnd() * 6 * 3600000);
      const amount = (Math.round(rnd() * 19) + 1) * 50000;
      const viaQr = rnd() < 0.6;
      const anon = rnd() < 0.2;
      insEntry.run(entryCode('PT', d), fid, 'in', amount, viaQr ? 'vietqr' : 'cash', viaQr ? `FT${hash(fcode + i + c.code)}` : null,
        viaQr && rnd() < 0.3 ? null : DONORS[Math.floor(rnd() * DONORS.length)], anon ? 1 : 0, viaQr ? 'Chuyen khoan ung ho' : 'Thu tiền mặt',
        null, 'approved', viaQr ? null : tq.id, viaQr ? 'VietQR' : tq.full_name, fmtDate(d),
        viaQr ? null : tq.id, viaQr ? 'Hệ thống (VietQR)' : tq.full_name, fmtDate(d));
      balance += amount;
    }
    const spend = (days, amount, note, status) => {
      const d = new Date(Date.now() - days * 86400000);
      const ecode = entryCode('PC', d);
      const file = `${ecode}-seed.png`;
      fs.writeFileSync(path.join(dir, file), RECEIPT_PNG);
      insEntry.run(ecode, fid, 'out', amount, 'cash', null, null, 0, note, file, status, tq.id, tq.full_name, fmtDate(d),
        status === 'approved' ? dy.id : null, status === 'approved' ? dy.full_name : null, status === 'approved' ? fmtDate(new Date(d.getTime() + 86400000)) : null);
    };
    const NOTES = {
      'quy-chung': ['Thay bóng đèn đường xóm', 'Sửa cống thoát nước', 'Mua loa phát thanh', 'Phát quang bụi rậm'],
      'cong-duc': ['Mua ngói lợp mái đình', 'Thuê thợ sơn cột', 'Mua gỗ lim làm cửa', 'Sơn lại cột đình'],
      'khuyen-hoc': ['Thưởng học sinh giỏi học kỳ I', 'Mua sách vở cho học sinh', 'Hỗ trợ học phí em Lan', 'Mua cặp sách'],
      'tet-2026': ['Mua 40 suất quà Tết', 'Chở quà tới hộ nghèo', 'Mua gạo phát Tết'],
      'phat-dan': ['Thuê rạp, âm thanh', 'Hoa đăng, đèn lồng', 'Cơm chay phục vụ khách'],
    }[fcode] || ['Chi phí chung'];
    let spent = 0;
    if (closed) {
      // Quỹ đã quyết toán: chi hết các khoản, không còn khoản dở, đóng quỹ + một biên bản đối soát khớp
      for (const [k, n] of NOTES.entries()) { const a = k === NOTES.length - 1 ? balance - spent : Math.round(balance / NOTES.length / 10000) * 10000; spend(95 - k * 2, a, n, 'approved'); spent += a; }
      conn.prepare("UPDATE funds SET status='closed' WHERE id=?").run(fid);
    } else {
      for (let k = 0; k < NOTES.length - 1; k++) {
        const a = Math.min(Math.round((balance - spent) * 0.18 / 10000) * 10000, balance - spent);
        if (a > 0) { spend(150 - k * 35, a, NOTES[k], 'approved'); spent += a; }
      }
      spend(2, Math.min(300000, balance - spent), NOTES[NOTES.length - 1], 'submitted');
      if (fcode === 'quy-chung') {
        // Một phiếu bị từ chối và một phiếu nháp thiếu chứng từ để thấy đủ luồng
        const d = new Date(Date.now() - 20 * 86400000); const ec = entryCode('PC', d);
        insEntry.run(ec, fid, 'out', 1500000, 'cash', null, null, 0, 'Mua bàn ghế (báo giá cao)', null, 'rejected', tq.id, tq.full_name, fmtDate(d), dy.id, dy.full_name, fmtDate(d));
        conn.prepare('UPDATE fund_entries SET reject_reason=? WHERE code=?').run('Báo giá cao, xin thêm 2 báo giá khác', ec);
        const d2 = new Date(Date.now() - 1 * 86400000);
        insEntry.run(entryCode('PC', d2), fid, 'out', 120000, 'cash', null, null, 0, 'Mua dây điện', null, 'draft', tq.id, tq.full_name, fmtDate(d2), null, null, null);
      }
    }
    // Biên bản đối soát tháng trước (khớp) cho mọi quỹ; quỹ chung có thêm một biên bản lệch có ghi chú
    const recIns = conn.prepare(`INSERT INTO fund_reconciliations(fund_id,period_from,period_to,statement_in,system_in,diff,note,created_by,created_by_name,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const lm = new Date(); const lmFrom = new Date(lm.getFullYear(), lm.getMonth() - 1, 1); const lmTo = new Date(lm.getFullYear(), lm.getMonth(), 0);
    const ymd = (x) => fmtDate(x).slice(0, 10);
    const sys = conn.prepare(`SELECT COALESCE(SUM(amount),0) s FROM fund_entries WHERE fund_id=? AND status='approved' AND type='in'
      AND source IN ('vietqr','manual') AND date(approved_at)>=date(?) AND date(approved_at)<=date(?)`).get(fid, ymd(lmFrom), ymd(lmTo)).s;
    recIns.run(fid, ymd(lmFrom), ymd(lmTo), sys, sys, 0, null, tq.id, tq.full_name, fmtDate(new Date(lm.getFullYear(), lm.getMonth(), 2, 9)));
    if (fcode === 'quy-chung') {
      recIns.run(fid, ymd(lmFrom), ymd(lmTo), sys + 50000, sys, 50000, 'Thiếu 1 khoản 50.000 ngày 15, ngân hàng báo chậm, đã bổ sung sau', tq.id, tq.full_name, fmtDate(new Date(lm.getFullYear(), lm.getMonth(), 1, 16)));
    }
  }
  conn.exec('COMMIT');
}

/* ===================== Hạng mục dùng chung + giao dịch nhận tiền nhanh (GĐ4) ===================== */
const CATS = ['Rau củ', 'Thịt cá', 'Tạp hóa', 'Đồ uống', 'Ăn uống', 'Dịch vụ', 'Trái cây', 'Đồ khô'];
function seedCategories(communityId, c) {
  const key = (v) => String(v).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const ins = control.prepare('INSERT OR IGNORE INTO community_categories(community_id,name,name_key,sort_order) VALUES (?,?,?,?)');
  CATS.forEach((n, i) => ins.run(communityId, n, key(n), i + 1));
  ins.run(communityId, 'Hàng mùa vụ (ngưng)', key('Hàng mùa vụ (ngưng)'), 99);
  control.prepare("UPDATE community_categories SET status='hidden' WHERE community_id=? AND name_key=?").run(communityId, key('Hàng mùa vụ (ngưng)'));
  const cats = control.prepare("SELECT id, name FROM community_categories WHERE community_id=? AND status='active' ORDER BY sort_order").all(communityId);
  // Mỗi người bán của cộng đồng: ~40 lần nhận tiền nhanh trong 20 ngày, ~15% chưa gắn hạng mục (ERR-04)
  const small = SMALL_SELLERS.filter((x) => x[2] === c.code);
  for (const code of [...c.sellers, ...small.map((x) => x[0])]) {
    const conn = db.getTenantDb(code);
    if (conn.prepare("SELECT COUNT(*) n FROM invoices WHERE item_category_id IS NOT NULL").get().n) continue;
    const prof = small.find((x) => x[0] === code);
    const weighted = prof ? cats.flatMap((ct) => Array(prof[3][ct.name] || 0).fill(ct)) : cats;
    const days = prof ? 120 : 20; const perDay = prof ? prof[5] : 2; const avg = prof ? prof[4] : 100000;
    const rnd = mulberry32(hash('qp-' + code));
    const insInv = conn.prepare(`INSERT INTO invoices(code,type,subtotal,discount,net_amount,total,payment_method,paid_amount,change_amount,status,item_category_id,item_category_name,created_at)
      VALUES (?,'sale',?,0,?,?,'transfer',?,0,'paid',?,?,?)`);
    const insItem = conn.prepare('INSERT INTO invoice_items(invoice_id,name,qty,base_qty,price,line_total) VALUES (?,?,1,1,?,?)');
    const insPay = conn.prepare("INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,'transfer',?,'Nhận tiền nhanh')");
    const seqs = {};
    conn.exec('BEGIN');
    const total = Math.round(days * perDay * (prof ? 0.85 : 1));
    for (let i = 0; i < total; i++) {
      // Giao dịch dày hơn về gần đây (thôn đang chuyển đổi số dần)
      const back = Math.floor(Math.pow(rnd(), 1.6) * days);
      const d = new Date(Date.now() - back * 86400000); d.setHours(6 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), 0, 0);
      if (d > new Date()) d.setTime(Date.now() - 3600000);
      const ymd = fmtDate(d).slice(0, 10).replace(/-/g, '');
      if (seqs[ymd] === undefined) seqs[ymd] = conn.prepare('SELECT COUNT(*) n FROM invoices WHERE code LIKE ?').get('NT' + ymd + '%').n;
      const invCode = `NT${ymd}-${pad(++seqs[ymd], 4)}`;
      const amount = Math.max(5000, Math.round(avg * (0.3 + rnd() * 1.4) / 1000) * 1000);
      const cat = rnd() < 0.12 ? null : weighted[Math.floor(rnd() * weighted.length)];
      const id = Number(insInv.run(invCode, amount, amount, amount, amount, cat ? cat.id : null, cat ? cat.name : null, fmtDate(d)).lastInsertRowid);
      insItem.run(id, cat ? cat.name : 'Bán hàng', amount, amount);
      insPay.run(id, amount);
    }
    conn.exec('COMMIT');
    if (prof) seedQueue(code, conn);
  }
}

// Tạo tenant người bán nhỏ (GĐ4): tài khoản riêng, chủ + 1 người phụ bán
function seedSmallSellers() {
  for (const [code, name, com] of SMALL_SELLERS) {
    const cid = control.prepare('SELECT id FROM communities WHERE code=?').get(com)?.id;
    if (!cid) continue;
    let t = control.prepare('SELECT id FROM tenants WHERE code=?').get(code);
    if (!t) t = { id: Number(control.prepare("INSERT INTO tenants(code,name,plan,status,area,kind,community_id) VALUES (?,?,'standard','active',?,'seller',?)")
      .run(code, name, COMMUNITIES.find((x) => x.code === com).area, cid).lastInsertRowid) };
    const conn = db.getTenantDb(code);
    const holder = removeVietnamese(name).toUpperCase();
    for (const [k, v] of [['shop_name', name], ['bank_account', '8' + pad(hash('acc' + code) % 1e9, 9)], ['bank_bin', '970422'], ['bank_name', 'MB Bank'],
      ['account_holder', holder], ['vqr_enabled', '1'], ['vqr_env', 'mock']]) {
      conn.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
    }
    addUser(t.id, code + '-owner', 'Chủ ' + name, 'owner');
    addUser(t.id, code + '-phu', 'Người phụ bán ' + name, 'cashier');
  }
}

// Giao dịch VietQR qua QR dán quầy (không có mã đối soát) chờ người bán phân loại; vài khoản đã cũ để có cảnh báo
function seedQueue(code, conn) {
  if (conn.prepare("SELECT COUNT(*) n FROM vietqr_transactions WHERE transactionid LIKE 'QR-%'").get().n) return;
  const acc = conn.prepare("SELECT value FROM settings WHERE key='bank_account'").get().value;
  const ins = conn.prepare(`INSERT INTO vietqr_transactions(transactionid,bank_account,amount,content,order_id,trans_type,matched,note,category,created_at)
    VALUES (?,?,?,?,'','C',0,'Không tìm thấy hóa đơn','unclassified',?)`);
  const rnd = mulberry32(hash('q-' + code));
  [0.2, 1, 5, 9].forEach((daysAgo, i) => ins.run(`QR-${code}-${i}`, acc, Math.round((20 + rnd() * 180)) * 1000,
    ['CK tien hang', 'chuyen tien', 'Ung ho', 'mua rau'][i], fmtDate(new Date(Date.now() - daysAgo * 86400000))));
}

/* ===================== Cộng đồng và nhân sự nền tảng ===================== */
function seedCommunities() {
  for (const c of COMMUNITIES) {
    let row = control.prepare('SELECT id FROM communities WHERE code=?').get(c.code);
    if (!row) {
      const settings = JSON.stringify({ public_donations: c.type === 'village', unclassified_alert_days: 3 });
      // Bật công khai công đức thì cần token cho link /congduc/<token> (GĐ2.9)
      const token = c.type === 'village' ? require('crypto').randomBytes(16).toString('hex') : null;
      row = { id: Number(control.prepare('INSERT INTO communities(code,name,type,area,contact_name,contact_phone,note,settings,donations_token) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(c.code, c.name, c.type, c.area, c.contact, '09' + pad(hash(c.code) % 1e8, 8), 'Dữ liệu mẫu', settings, token).lastInsertRowid) };
    }
    // Dữ liệu cũ: đã bật công khai nhưng chưa có token (token thêm ở GĐ2.9)
    const cur = control.prepare('SELECT settings, donations_token FROM communities WHERE id=?').get(row.id);
    if (!cur.donations_token && JSON.parse(cur.settings || '{}').public_donations) {
      control.prepare('UPDATE communities SET donations_token=? WHERE id=?').run(require('crypto').randomBytes(16).toString('hex'), row.id);
    }
    for (const s of c.sellers) control.prepare("UPDATE tenants SET kind='seller', community_id=? WHERE code=?").run(row.id, s);
    // Sổ quỹ cộng đồng với 3 vai trò: thủ quỹ nhập, người duyệt, trưởng cộng đồng xem tổng hợp
    const fundCode = 'quy-' + c.code;
    let t = control.prepare('SELECT id FROM tenants WHERE code=?').get(fundCode);
    if (!t) t = { id: Number(control.prepare("INSERT INTO tenants(code,name,plan,status,area,kind,community_id) VALUES (?,?,'standard','active',?,'community',?)")
      .run(fundCode, 'Sổ quỹ ' + c.name, c.area, row.id).lastInsertRowid) };
    db.getTenantDb(fundCode).prepare('UPDATE settings SET value=? WHERE key=?').run('Sổ quỹ ' + c.name, 'shop_name');
    const lb = control.prepare('SELECT approver_label, leader_label FROM community_types WHERE code=?').get(c.type) || {};
    addUser(t.id, `${c.code}-thuquy`, 'Thủ quỹ ' + c.name, 'treasurer');
    addUser(t.id, `${c.code}-duyet`, `${lb.approver_label || 'Người duyệt'} ${c.name}`, 'approver');
    addUser(t.id, `${c.code}-truong`, `${lb.leader_label || 'Trưởng'} ${c.name}`, 'community_leader');
    seedFunds(fundCode, c);
    seedSmallSellers();
    seedCategories(row.id, c);
  }
  for (const [u, name, role] of [['vanhanh', 'Nhân viên vận hành', 'platform_ops'], ['hotro', 'Nhân viên hỗ trợ', 'platform_support'],
    ['kythuat', 'Kỹ sư VietQR', 'platform_tech'], ['ql-thon-a', 'Cán bộ phụ trách Thôn An Phú', 'platform_community']]) addUser(null, u, name, role);
  control.prepare('INSERT OR IGNORE INTO platform_user_communities(user_id,community_id) VALUES (?,?)')
    .run(control.prepare('SELECT id FROM users WHERE username=?').get('ql-thon-a').id, control.prepare('SELECT id FROM communities WHERE code=?').get('thon-a').id);
  const { getPlatformSettings, setPlatformSettings } = require('../src/control');
  if (!getPlatformSettings().public_report_token) setPlatformSettings({ public_report_enabled: '1', public_report_token: require('crypto').randomBytes(16).toString('hex') });
  return getPlatformSettings().public_report_token;
}

/* ===================== Chạy ===================== */
console.log('\n  Sinh dữ liệu mẫu POS Shop');
console.log('  ------------------------------');
console.log('  DATA_DIR: ' + DATA_DIR + '\n');

const results = [];
for (const s of STORES) results.push(seedStore(s));
const reportToken = seedCommunities();
require('../src/lib/checks').runChecks();

let tProducts = 0, tInvoices = 0, tRevenue = 0, tReturns = 0;
for (const r of results) {
  if (r.skipped) { console.log(`  • ${r.code.padEnd(18)} bỏ qua (đã có ${r.invoices} hóa đơn)`); continue; }
  tProducts += r.products; tInvoices += r.invoices; tRevenue += r.revenue; tReturns += r.returns;
  console.log(`  • ${r.code.padEnd(18)} ${String(r.products).padStart(3)} SP · ${String(r.invoices).padStart(5)} HĐ · ${String(r.returns).padStart(4)} trả · ${String(r.purchases).padStart(3)} PN · ${String(r.txns).padStart(4)} GD QR · ${money(Math.round(r.revenue)).padStart(15)}`);
}
console.log('\n  ------------------------------');
console.log(`  Tổng: ${results.filter((r) => !r.skipped).length} cửa hàng mới · ${tProducts} sản phẩm · ${tInvoices} hóa đơn · ${tReturns} phiếu trả`);
console.log(`  Doanh thu mẫu: ${money(Math.round(tRevenue))}`);
console.log('\n  Chạy:  DATA_DIR="' + DATA_DIR + '" npm start');
console.log('  Báo cáo công khai: /r/' + reportToken);
for (const c of control.prepare('SELECT code, donations_token FROM communities WHERE donations_token IS NOT NULL').all()) {
  console.log(`  Công đức công khai ${c.code}: /congduc/${c.donations_token}`);
}
console.log('  Tài khoản (mật khẩu demo1234): <mã-cửa-hàng>-owner|quanly|thungan|kho|ketoan,');
console.log('    thon-a-thuquy|duyet|truong (tương tự thon-b, cho-c, chua-pl), vanhanh, hotro, kythuat, ql-thon-a.');
console.log('  Người bán nhỏ: ' + SMALL_SELLERS.map((x) => x[0] + '-owner').join(', ') + ' (và <mã>-phu).\n');
