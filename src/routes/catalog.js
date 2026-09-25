'use strict';

const express = require('express');
const db = require('../db');
const { ok, fail, wrap, bad, round, num, str, bool } = require('../lib/util');
const { nextInternalBarcode } = require('../lib/barcode');
const { getSettings } = require('./admin');
const { requirePerm, can } = require('../middleware');

const router = express.Router();

// Ẩn giá vốn/giá nhập nếu người dùng không có quyền xem giá vốn.
function stripCost(req, products) {
  if (can(req, 'product.view_cost')) return products;
  for (const p of products) {
    if (p) delete p.cost_price;
  }
  return products;
}

/* ===================== DANH MỤC ===================== */
router.get('/categories', wrap((req, res) => {
  ok(res, db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all());
}));
router.post('/categories', requirePerm('product.edit'), wrap((req, res) => {
  const name = str(req.body.name, 120);
  if (!name) bad('Tên danh mục trống');
  try {
    const r = db.prepare('INSERT INTO categories(name, description) VALUES (?,?)').run(name, str(req.body.description));
    ok(res, db.prepare('SELECT * FROM categories WHERE id=?').get(Number(r.lastInsertRowid)));
  } catch (e) {
    if (/UNIQUE/.test(e.message)) bad('Danh mục đã tồn tại');
    throw e;
  }
}));
router.put('/categories/:id', requirePerm('product.edit'), wrap((req, res) => {
  const id = Number(req.params.id);
  const name = str(req.body.name, 120);
  if (!name) bad('Tên danh mục trống');
  db.prepare('UPDATE categories SET name=?, description=? WHERE id=?').run(name, str(req.body.description), id);
  ok(res, db.prepare('SELECT * FROM categories WHERE id=?').get(id));
}));
router.delete('/categories/:id', requirePerm('product.edit'), wrap((req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

/* ===================== SẢN PHẨM ===================== */
const PRODUCT_SELECT = `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

function unitsOf(productIds) {
  if (!productIds.length) return {};
  const placeholders = productIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM product_units WHERE product_id IN (${placeholders}) ORDER BY is_base DESC, sort_order, id`).all(...productIds);
  const map = {};
  for (const u of rows) (map[u.product_id] = map[u.product_id] || []).push(u);
  return map;
}
function attachUnits(products) {
  const map = unitsOf(products.map((p) => p.id));
  for (const p of products) p.units = map[p.id] || [];
  return products;
}

router.get('/products', wrap((req, res) => {
  const q = str(req.query.q, 120);
  const cat = req.query.category_id;
  const low = req.query.low === '1';
  const all = req.query.all === '1';
  const type = req.query.type;
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
  let sql = PRODUCT_SELECT + ' WHERE 1=1';
  const params = [];
  if (!all) sql += ' AND p.active=1';
  if (q) { sql += ' AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (cat) { sql += ' AND p.category_id=?'; params.push(Number(cat)); }
  if (type) { sql += ' AND p.product_type=?'; params.push(type); }
  if (low) sql += ' AND p.stock <= p.min_stock';
  sql += ' ORDER BY p.name LIMIT ?';
  params.push(limit);
  ok(res, stripCost(req, attachUnits(db.prepare(sql).all(...params))));
}));

// Tra cứu theo mã vạch sản phẩm hoặc mã vạch của đơn vị quy đổi
router.get('/products/barcode/:code', wrap((req, res) => {
  const code = str(req.params.code, 80);
  const product = db.prepare(PRODUCT_SELECT + ' WHERE p.barcode=? AND p.active=1').get(code);
  if (product) {
    attachUnits([product]);
    product.matched_unit_id = product.units.find((u) => u.is_base)?.id || null;
    product.matched_unit_name = product.unit;
    product.matched_conversion = 1;
    return ok(res, stripCost(req, [product])[0]);
  }
  const unit = db.prepare('SELECT * FROM product_units WHERE barcode=?').get(code);
  if (unit) {
    const p2 = db.prepare(PRODUCT_SELECT + ' WHERE p.id=? AND p.active=1').get(unit.product_id);
    if (p2) {
      attachUnits([p2]);
      p2.matched_unit_id = unit.id;
      p2.matched_unit_name = unit.name;
      p2.matched_conversion = unit.conversion;
      return ok(res, stripCost(req, [p2])[0]);
    }
  }
  fail(res, 'Không tìm thấy sản phẩm với mã này', 404);
}));

router.get('/products/:id', wrap((req, res) => {
  const p = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(Number(req.params.id));
  if (!p) return fail(res, 'Không tìm thấy sản phẩm', 404);
  attachUnits([p]);
  ok(res, stripCost(req, [p])[0]);
}));

function validateProduct(b) {
  if (!str(b.name)) bad('Tên sản phẩm trống');
  if (b.sell_price == null || Number(b.sell_price) < 0) bad('Giá bán không hợp lệ');
}

function saveUnits(productId, body) {
  const base = db.prepare('SELECT * FROM product_units WHERE product_id=? AND is_base=1').get(productId);
  const baseData = [str(body.unit, 40) || 'cái', round(body.sell_price), str(body.barcode, 80) || null, productId];
  if (base) db.prepare('UPDATE product_units SET name=?, sell_price=?, barcode=? WHERE id=?').run(baseData[0], baseData[1], baseData[2], base.id);
  else db.prepare('INSERT INTO product_units(product_id,name,conversion,sell_price,barcode,is_base,sort_order) VALUES (?,?,1,?,?,1,0)').run(productId, baseData[0], baseData[1], baseData[2]);

  const incoming = Array.isArray(body.units) ? body.units : [];
  const keepIds = [];
  let order = 1;
  for (const u of incoming) {
    const name = str(u.name, 40);
    const conversion = num(u.conversion);
    if (!name || conversion <= 1) continue;
    const sell = u.sell_price == null || u.sell_price === '' ? round(body.sell_price) * conversion : round(u.sell_price);
    const barcode = str(u.barcode, 80) || null;
    if (u.id) {
      db.prepare('UPDATE product_units SET name=?, conversion=?, sell_price=?, barcode=?, sort_order=? WHERE id=? AND product_id=?')
        .run(name, conversion, sell, barcode, order++, Number(u.id), productId);
      keepIds.push(Number(u.id));
    } else {
      const r = db.prepare('INSERT INTO product_units(product_id,name,conversion,sell_price,barcode,is_base,sort_order) VALUES (?,?,?,?,?,0,?)')
        .run(productId, name, conversion, sell, barcode, order++);
      keepIds.push(Number(r.lastInsertRowid));
    }
  }
  const existing = db.prepare('SELECT id FROM product_units WHERE product_id=? AND is_base=0').all(productId);
  for (const row of existing) if (!keepIds.includes(row.id)) db.prepare('DELETE FROM product_units WHERE id=?').run(row.id);
}

router.post('/products', requirePerm('product.create'), wrap((req, res) => {
  const b = req.body || {};
  validateProduct(b);
  try {
    const r = db.prepare(`INSERT INTO products(barcode,sku,name,category_id,unit,cost_price,sell_price,stock,min_stock,max_stock,location,
        product_type,is_weighted,allow_negative,warranty_months,weight,description,image,vat_rate)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      str(b.barcode, 80) || null, str(b.sku, 60) || null, str(b.name, 200), b.category_id || null, str(b.unit, 40) || 'cái',
      round(b.cost_price), round(b.sell_price), num(b.stock || 0), num(b.min_stock || 0), num(b.max_stock || 0), str(b.location, 60) || null,
      str(b.product_type) || 'goods', bool(b.is_weighted), bool(b.allow_negative), round(b.warranty_months), num(b.weight || 0), str(b.description, 2000) || null, b.image || null, num(b.vat_rate || 0));
    const id = Number(r.lastInsertRowid);
    saveUnits(id, b);
    if (num(b.stock || 0) !== 0) {
      db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,note,stock_after) VALUES(?,?,'init','init','Tồn đầu',?)`).run(id, num(b.stock), num(b.stock));
    }
    const p = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(id);
    attachUnits([p]);
    ok(res, p);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) bad('Mã vạch đã tồn tại');
    throw e;
  }
}));

router.put('/products/:id', requirePerm('product.edit'), wrap((req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  validateProduct(b);
  try {
    db.prepare(`UPDATE products SET barcode=?,sku=?,name=?,category_id=?,unit=?,cost_price=?,sell_price=?,min_stock=?,max_stock=?,location=?,
        product_type=?,is_weighted=?,allow_negative=?,warranty_months=?,weight=?,description=?,image=?,vat_rate=?,active=?,updated_at=datetime('now','localtime')
      WHERE id=?`).run(
      str(b.barcode, 80) || null, str(b.sku, 60) || null, str(b.name, 200), b.category_id || null, str(b.unit, 40) || 'cái',
      round(b.cost_price), round(b.sell_price), num(b.min_stock || 0), num(b.max_stock || 0), str(b.location, 60) || null,
      str(b.product_type) || 'goods', bool(b.is_weighted), bool(b.allow_negative), round(b.warranty_months), num(b.weight || 0),
      str(b.description, 2000) || null, b.image || null, num(b.vat_rate || 0), b.active === 0 ? 0 : 1, id);
    saveUnits(id, b);
    const p = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(id);
    attachUnits([p]);
    ok(res, p);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) bad('Mã vạch đã tồn tại');
    throw e;
  }
}));

router.delete('/products/:id', requirePerm('product.delete'), wrap((req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));
router.post('/products/:id/restore', requirePerm('product.edit'), wrap((req, res) => {
  db.prepare('UPDATE products SET active=1 WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

// Nhập kho / điều chỉnh tồn (giữ tương thích API cũ)
router.post('/products/:id/stock', requirePerm('stock.adjust'), wrap((req, res) => {
  const id = Number(req.params.id);
  const qty = num(req.body.qty);
  const type = req.body.type === 'adjust' ? 'adjust' : 'import';
  if (!qty && type !== 'adjust') bad('Số lượng không hợp lệ');
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) bad('Không tìm thấy sản phẩm');
  db.exec('BEGIN');
  try {
    let after;
    if (type === 'adjust') {
      db.prepare('UPDATE products SET stock=? WHERE id=?').run(qty, id);
      after = qty;
    } else {
      db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(qty, id);
      if (req.body.cost_price != null) db.prepare('UPDATE products SET cost_price=? WHERE id=?').run(round(req.body.cost_price), id);
      after = p.stock + qty;
    }
    db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,note,stock_after) VALUES(?,?,?,?,?,?)`)
      .run(id, type === 'adjust' ? qty - p.stock : qty, type, type, str(req.body.note, 300) || null, after);
    db.exec('COMMIT');
    const np = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(id);
    attachUnits([np]);
    ok(res, np);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

router.get('/products/:id/moves', wrap((req, res) => {
  ok(res, db.prepare('SELECT * FROM stock_moves WHERE product_id=? ORDER BY id DESC LIMIT 300').all(Number(req.params.id)));
}));

/* ===================== MÃ VẠCH NỘI BỘ & TRA CỨU ===================== */
// Lấy một mã vạch nội bộ mới (EAN-13, tiền tố 2) để điền vào form.
router.get('/barcodes/next', wrap((req, res) => {
  ok(res, { code: nextInternalBarcode(db) });
}));

// Sinh hàng loạt cho các sản phẩm/đơn vị chưa có mã vạch.
router.post('/products/barcodes/generate', requirePerm('product.edit'), wrap((req, res) => {
  const includeUnits = bool(req.body && req.body.include_units);
  let products = 0;
  let units = 0;
  db.exec('BEGIN');
  try {
    const missing = db.prepare("SELECT id FROM products WHERE active=1 AND (barcode IS NULL OR barcode='')").all();
    const upProd = db.prepare('UPDATE products SET barcode=? WHERE id=?');
    for (const p of missing) {
      const code = nextInternalBarcode(db);
      upProd.run(code, p.id);
      db.prepare('UPDATE product_units SET barcode=? WHERE product_id=? AND is_base=1 AND (barcode IS NULL OR barcode=?)').run(code, p.id, '');
      products++;
    }
    if (includeUnits) {
      const missUnits = db.prepare("SELECT id FROM product_units WHERE is_base=0 AND (barcode IS NULL OR barcode='')").all();
      const upUnit = db.prepare('UPDATE product_units SET barcode=? WHERE id=?');
      for (const u of missUnits) { upUnit.run(nextInternalBarcode(db), u.id); units++; }
    }
    db.exec('COMMIT');
    ok(res, { products, units });
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

// Tra cứu thông tin sản phẩm theo mã vạch qua dịch vụ online (mặc định Open Food Facts).
router.get('/barcode-lookup/:code', wrap(async (req, res) => {
  const s = getSettings();
  if (s.online_lookup !== '1') fail(res, 'Tra cứu online đang tắt trong Cài đặt');
  const code = str(req.params.code, 40).replace(/\D/g, '');
  if (!code) fail(res, 'Mã vạch không hợp lệ');
  const url = s.lookup_url && s.lookup_url.includes('{code}')
    ? s.lookup_url.replace('{code}', encodeURIComponent(code))
    : `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_vi,generic_name,brands,image_front_url,image_url,categories,quantity`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'POS-Shop/2.0 (offline POS)' } });
    clearTimeout(timer);
    if (!r.ok) return ok(res, { found: false, code });
    const j = await r.json();
    const p = (j && j.product) || j || {};
    const name = p.product_name_vi || p.product_name || p.generic_name || '';
    const image = p.image_front_url || p.image_url || null;
    if (!name && !image) return ok(res, { found: false, code });
    ok(res, { found: true, code, name: str(name, 200), brand: str(p.brands, 150), image, categories: str(p.categories, 250), quantity: str(p.quantity, 60), source: 'openfoodfacts' });
  } catch (e) {
    clearTimeout(timer);
    fail(res, 'Không tra cứu được (cần kết nối internet)', 502);
  }
}));

/* ===================== ĐƠN VỊ QUY ĐỔI ===================== */
router.get('/products/:id/units', wrap((req, res) => {
  ok(res, db.prepare('SELECT * FROM product_units WHERE product_id=? ORDER BY is_base DESC, sort_order, id').all(Number(req.params.id)));
}));
router.post('/products/:id/units', requirePerm('product.edit'), wrap((req, res) => {
  const productId = Number(req.params.id);
  const name = str(req.body.name, 40);
  const conversion = num(req.body.conversion);
  if (!name) bad('Tên đơn vị trống');
  if (conversion <= 1) bad('Hệ số quy đổi phải lớn hơn 1');
  const r = db.prepare('INSERT INTO product_units(product_id,name,conversion,sell_price,barcode,is_base,sort_order) VALUES (?,?,?,?,?,0,?)')
    .run(productId, name, conversion, round(req.body.sell_price), str(req.body.barcode, 80) || null, round(req.body.sort_order));
  ok(res, db.prepare('SELECT * FROM product_units WHERE id=?').get(Number(r.lastInsertRowid)));
}));
router.put('/units/:id', requirePerm('product.edit'), wrap((req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM product_units WHERE id=?').get(id);
  if (!u) bad('Không tìm thấy đơn vị');
  db.prepare('UPDATE product_units SET name=?, conversion=?, sell_price=?, barcode=?, sort_order=? WHERE id=?').run(
    str(req.body.name, 40) || u.name, u.is_base ? 1 : num(req.body.conversion), round(req.body.sell_price), str(req.body.barcode, 80) || null, round(req.body.sort_order), id);
  ok(res, db.prepare('SELECT * FROM product_units WHERE id=?').get(id));
}));
router.delete('/units/:id', requirePerm('product.edit'), wrap((req, res) => {
  const u = db.prepare('SELECT * FROM product_units WHERE id=?').get(Number(req.params.id));
  if (u && u.is_base) bad('Không thể xóa đơn vị cơ bản');
  db.prepare('DELETE FROM product_units WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

/* ===================== BẢNG GIÁ ===================== */
router.get('/price-lists', wrap((req, res) => ok(res, db.prepare('SELECT * FROM price_lists ORDER BY sort_order, id').all())));
router.post('/price-lists', requirePerm('settings.edit'), wrap((req, res) => {
  const name = str(req.body.name, 80);
  if (!name) bad('Tên bảng giá trống');
  try {
    const r = db.prepare('INSERT INTO price_lists(name, note, sort_order) VALUES (?,?,?)').run(name, str(req.body.note, 300) || null, round(req.body.sort_order));
    ok(res, db.prepare('SELECT * FROM price_lists WHERE id=?').get(Number(r.lastInsertRowid)));
  } catch (e) { if (/UNIQUE/.test(e.message)) bad('Bảng giá đã tồn tại'); throw e; }
}));
router.put('/price-lists/:id', requirePerm('settings.edit'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (bool(req.body.is_default)) db.prepare('UPDATE price_lists SET is_default=0').run();
  db.prepare('UPDATE price_lists SET name=?, note=?, sort_order=?, is_default=? WHERE id=?').run(
    str(req.body.name, 80), str(req.body.note, 300) || null, round(req.body.sort_order), bool(req.body.is_default), id);
  ok(res, db.prepare('SELECT * FROM price_lists WHERE id=?').get(id));
}));
router.delete('/price-lists/:id', requirePerm('settings.edit'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (db.prepare('SELECT is_default FROM price_lists WHERE id=?').get(id)?.is_default) bad('Không thể xóa bảng giá mặc định');
  db.prepare('DELETE FROM price_lists WHERE id=?').run(id);
  ok(res, true);
}));
router.get('/price-lists/:id/items', wrap((req, res) => {
  ok(res, db.prepare(`SELECT pli.*, u.name AS unit_name, u.product_id, p.name AS product_name
    FROM price_list_items pli JOIN product_units u ON u.id=pli.unit_id JOIN products p ON p.id=u.product_id
    WHERE pli.price_list_id=? ORDER BY p.name`).all(Number(req.params.id)));
}));
router.put('/price-lists/:id/items', requirePerm('settings.edit'), wrap((req, res) => {
  const id = Number(req.params.id);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  db.exec('BEGIN');
  try {
    const up = db.prepare(`INSERT INTO price_list_items(price_list_id,unit_id,price) VALUES(?,?,?)
      ON CONFLICT(price_list_id,unit_id) DO UPDATE SET price=excluded.price`);
    for (const it of items) up.run(id, Number(it.unit_id), round(it.price));
    db.exec('COMMIT');
    ok(res, true);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

module.exports = router;
