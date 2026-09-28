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

const DAYS = 180;

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

  return { code: store.code, name: store.name, products: pool.length, invoices: invoiceCount, returns: returnCount, items: itemCount, revenue: grossRevenue, skipped: false };
}

/* ===================== Chạy ===================== */
console.log('\n  Sinh dữ liệu mẫu POS Shop');
console.log('  ------------------------------');
console.log('  DATA_DIR: ' + DATA_DIR + '\n');

const results = [];
for (const s of STORES) results.push(seedStore(s));

let tProducts = 0, tInvoices = 0, tRevenue = 0, tReturns = 0;
for (const r of results) {
  if (r.skipped) { console.log(`  • ${r.code.padEnd(18)} bỏ qua (đã có ${r.invoices} hóa đơn)`); continue; }
  tProducts += r.products; tInvoices += r.invoices; tRevenue += r.revenue; tReturns += r.returns;
  console.log(`  • ${r.code.padEnd(18)} ${String(r.products).padStart(3)} SP · ${String(r.invoices).padStart(5)} HĐ · ${String(r.returns).padStart(4)} trả · ${money(Math.round(r.revenue)).padStart(15)}`);
}
console.log('\n  ------------------------------');
console.log(`  Tổng: ${results.filter((r) => !r.skipped).length} cửa hàng mới · ${tProducts} sản phẩm · ${tInvoices} hóa đơn · ${tReturns} phiếu trả`);
console.log(`  Doanh thu mẫu: ${money(Math.round(tRevenue))}`);
console.log('\n  Chạy:  DATA_DIR="' + DATA_DIR + '" npm start');
console.log('  Rồi bật báo cáo thống kê giao dịch trong Quản trị nền tảng (tài khoản root).\n');
