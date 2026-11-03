'use strict';

const express = require('express');
const db = require('../db');
const { ok, fail, wrap, bad, round, num, str, bool } = require('../lib/util');
const { makeCode } = require('../lib/codes');
const { getSettings } = require('./admin');

const router = express.Router();

/* ===================== NHÀ CUNG CẤP ===================== */
router.get('/suppliers', wrap((req, res) => {
  ok(res, db.prepare('SELECT * FROM suppliers ORDER BY name').all());
}));

// Công nợ nhà cung cấp: đã mua (phiếu đã nhập) - đã trả = còn nợ
router.get('/suppliers/payables', wrap((req, res) => {
  const rows = db.prepare(`SELECT s.id, s.name, s.phone, s.payment_terms_days,
      COALESCE((SELECT SUM(total) FROM purchases p WHERE p.supplier_id=s.id AND p.status='received'),0) AS purchased,
      COALESCE((SELECT SUM(amount) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) AS paid
    FROM suppliers s ORDER BY s.name`).all();
  ok(res, rows.map((r) => ({ ...r, balance: r.purchased - r.paid })));
}));

router.post('/suppliers', wrap((req, res) => {
  const name = str(req.body.name, 160);
  if (!name) bad('Tên nhà cung cấp trống');
  const r = db.prepare('INSERT INTO suppliers(name,phone,address,email,note,tax_code,contact_name,payment_terms_days) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, str(req.body.phone, 40) || null, str(req.body.address, 300) || null, str(req.body.email, 120) || null, str(req.body.note, 300) || null,
      str(req.body.tax_code, 40) || null, str(req.body.contact_name, 120) || null, round(req.body.payment_terms_days));
  ok(res, db.prepare('SELECT * FROM suppliers WHERE id=?').get(Number(r.lastInsertRowid)));
}));
router.put('/suppliers/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE suppliers SET name=?,phone=?,address=?,email=?,note=?,tax_code=?,contact_name=?,payment_terms_days=?,active=? WHERE id=?')
    .run(str(req.body.name, 160), str(req.body.phone, 40) || null, str(req.body.address, 300) || null, str(req.body.email, 120) || null, str(req.body.note, 300) || null,
      str(req.body.tax_code, 40) || null, str(req.body.contact_name, 120) || null, round(req.body.payment_terms_days), req.body.active === 0 ? 0 : 1, id);
  ok(res, db.prepare('SELECT * FROM suppliers WHERE id=?').get(id));
}));
router.delete('/suppliers/:id', wrap((req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

// Phiếu chi trả nhà cung cấp
router.get('/suppliers/:id/payments', wrap((req, res) => {
  ok(res, db.prepare('SELECT * FROM supplier_payments WHERE supplier_id=? ORDER BY id DESC').all(Number(req.params.id)));
}));
router.post('/suppliers/:id/payments', wrap((req, res) => {
  const id = Number(req.params.id);
  const sup = db.prepare('SELECT * FROM suppliers WHERE id=?').get(id);
  if (!sup) bad('Không tìm thấy nhà cung cấp');
  const amount = round(req.body.amount);
  if (!amount) bad('Số tiền không hợp lệ');
  const r = db.prepare('INSERT INTO supplier_payments(supplier_id,amount,method,note,paid_at) VALUES (?,?,?,?,?)')
    .run(id, amount, str(req.body.method, 20) || 'cash', str(req.body.note, 300) || null, str(req.body.paid_at, 30) || null);
  ok(res, db.prepare('SELECT * FROM supplier_payments WHERE id=?').get(Number(r.lastInsertRowid)));
}));
router.delete('/supplier-payments/:id', wrap((req, res) => {
  db.prepare('DELETE FROM supplier_payments WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

/* ===================== PHIẾU NHẬP HÀNG ===================== */
function unitInfo(productId, unitId) {
  if (unitId) {
    const u = db.prepare('SELECT * FROM product_units WHERE id=? AND product_id=?').get(Number(unitId), productId);
    if (u) return u;
  }
  return db.prepare('SELECT * FROM product_units WHERE product_id=? AND is_base=1 LIMIT 1').get(productId);
}

function pricePurchaseItems(items) {
  const lines = [];
  let total = 0;
  for (const it of items || []) {
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(Number(it.product_id));
    if (!product) bad('Không tìm thấy sản phẩm trong phiếu nhập');
    const qty = num(it.qty);
    if (!qty || qty <= 0) bad('Số lượng nhập không hợp lệ');
    const unit = unitInfo(product.id, it.unit_id);
    const conversion = unit ? Number(unit.conversion) || 1 : 1;
    const cost = round(it.cost_price != null ? it.cost_price : product.cost_price * conversion);
    const lineTotal = round(cost * qty);
    total += lineTotal;
    lines.push({ product_id: product.id, name: product.name, unit_id: unit ? unit.id : null, unit_name: unit ? unit.name : product.unit, conversion, qty, base_qty: qty * conversion, cost_price: cost, line_total: lineTotal });
  }
  return { lines, total };
}

function getPurchase(id) {
  const p = db.prepare('SELECT * FROM purchases WHERE id=?').get(id);
  if (!p) return null;
  p.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id=? ORDER BY id').all(id);
  return p;
}

router.get('/purchases', wrap((req, res) => {
  const { from, to, status, q } = req.query;
  let sql = 'SELECT * FROM purchases WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date(created_at)>=date(?)'; params.push(from); }
  if (to) { sql += ' AND date(created_at)<=date(?)'; params.push(to); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (q) { sql += ' AND (code LIKE ? OR supplier_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY id DESC LIMIT 500';
  ok(res, db.prepare(sql).all(...params));
}));

router.get('/purchases/:id', wrap((req, res) => {
  const p = getPurchase(Number(req.params.id));
  if (!p) return fail(res, 'Không tìm thấy phiếu nhập', 404);
  ok(res, p);
}));

router.post('/purchases', wrap((req, res) => {
  const b = req.body || {};
  const { lines, total } = pricePurchaseItems(b.items);
  if (!lines.length) bad('Phiếu nhập chưa có sản phẩm');
  const s = getSettings();
  const code = makeCode(db, s.purchase_prefix || 'PN', 'purchases');
  let supplierName = str(b.supplier_name, 160);
  if (b.supplier_id) {
    const sup = db.prepare('SELECT name FROM suppliers WHERE id=?').get(Number(b.supplier_id));
    if (sup) supplierName = sup.name;
  }
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO purchases(code,supplier_id,supplier_name,note,total,status) VALUES (?,?,?,?,?,?)')
      .run(code, b.supplier_id ? Number(b.supplier_id) : null, supplierName || null, str(b.note, 500) || null, total, 'draft');
    const pid = Number(r.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO purchase_items(purchase_id,product_id,name,unit_id,unit_name,conversion,qty,base_qty,cost_price,line_total) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lines) ins.run(pid, l.product_id, l.name, l.unit_id, l.unit_name, l.conversion, l.qty, l.base_qty, l.cost_price, l.line_total);
    db.exec('COMMIT');
    ok(res, getPurchase(pid));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

router.put('/purchases/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const p = getPurchase(id);
  if (!p) return fail(res, 'Không tìm thấy phiếu nhập', 404);
  if (p.status !== 'draft') bad('Chỉ sửa được phiếu nhập ở trạng thái nháp');
  const b = req.body || {};
  const { lines, total } = pricePurchaseItems(b.items);
  if (!lines.length) bad('Phiếu nhập chưa có sản phẩm');
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE purchases SET supplier_id=?, supplier_name=?, note=?, total=? WHERE id=?')
      .run(b.supplier_id ? Number(b.supplier_id) : null, str(b.supplier_name, 160) || null, str(b.note, 500) || null, total, id);
    db.prepare('DELETE FROM purchase_items WHERE purchase_id=?').run(id);
    const ins = db.prepare(`INSERT INTO purchase_items(purchase_id,product_id,name,unit_id,unit_name,conversion,qty,base_qty,cost_price,line_total) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lines) ins.run(id, l.product_id, l.name, l.unit_id, l.unit_name, l.conversion, l.qty, l.base_qty, l.cost_price, l.line_total);
    db.exec('COMMIT');
    ok(res, getPurchase(id));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

router.post('/purchases/:id/receive', wrap((req, res) => {
  const id = Number(req.params.id);
  const p = getPurchase(id);
  if (!p) return fail(res, 'Không tìm thấy phiếu nhập', 404);
  if (p.status === 'received') bad('Phiếu đã được nhập kho');
  if (p.status === 'cancelled') bad('Phiếu đã hủy');
  db.exec('BEGIN');
  try {
    for (const it of p.items) {
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      if (!prod) continue;
      const perBase = round(it.cost_price / (it.conversion || 1));
      const after = round(prod.stock + it.base_qty);
      db.prepare('UPDATE products SET stock=?, cost_price=? WHERE id=?').run(prod.stock + it.base_qty, perBase, prod.id);
      db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,ref,unit_id,unit_name,conversion,stock_after,note)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(prod.id, it.base_qty, 'purchase', 'purchase', p.code, it.unit_id, it.unit_name, it.conversion, after, p.supplier_name || null);
    }
    db.prepare(`UPDATE purchases SET status='received', received_at=datetime('now','localtime') WHERE id=?`).run(id);
    db.exec('COMMIT');
    ok(res, getPurchase(id));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

router.post('/purchases/:id/cancel', wrap((req, res) => {
  const id = Number(req.params.id);
  const p = getPurchase(id);
  if (!p) return fail(res, 'Không tìm thấy phiếu nhập', 404);
  if (p.status === 'cancelled') bad('Phiếu đã hủy');
  db.exec('BEGIN');
  try {
    if (p.status === 'received') {
      for (const it of p.items) {
        const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
        if (!prod) continue;
        const after = round(prod.stock - it.base_qty);
        db.prepare('UPDATE products SET stock=? WHERE id=?').run(prod.stock - it.base_qty, prod.id);
        db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,ref,unit_id,unit_name,conversion,stock_after,note)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(prod.id, -it.base_qty, 'cancel', 'purchase-cancel', p.code, it.unit_id, it.unit_name, it.conversion, after, 'Hủy phiếu nhập');
      }
    }
    db.prepare(`UPDATE purchases SET status='cancelled' WHERE id=?`).run(id);
    db.exec('COMMIT');
    ok(res, getPurchase(id));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

router.delete('/purchases/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const p = getPurchase(id);
  if (!p) return fail(res, 'Không tìm thấy phiếu nhập', 404);
  if (p.status !== 'draft') bad('Chỉ xóa được phiếu nháp');
  db.prepare('DELETE FROM purchases WHERE id=?').run(id);
  ok(res, true);
}));

/* ===================== KIỂM KHO ===================== */
function getCheck(id) {
  const c = db.prepare('SELECT * FROM stock_checks WHERE id=?').get(id);
  if (!c) return null;
  c.items = db.prepare('SELECT * FROM stock_check_items WHERE check_id=? ORDER BY name').all(id);
  return c;
}

router.get('/stock-checks', wrap((req, res) => {
  ok(res, db.prepare('SELECT * FROM stock_checks ORDER BY id DESC LIMIT 200').all());
}));
router.get('/stock-checks/:id', wrap((req, res) => {
  const c = getCheck(Number(req.params.id));
  if (!c) return fail(res, 'Không tìm thấy phiếu kiểm kho', 404);
  ok(res, c);
}));
router.post('/stock-checks', wrap((req, res) => {
  const b = req.body || {};
  const scope = b.scope === 'category' ? 'category' : 'all';
  const categoryId = scope === 'category' ? Number(b.category_id) : null;
  if (scope === 'category' && !categoryId) bad('Chưa chọn danh mục');
  let sql = 'SELECT * FROM products WHERE active=1';
  const params = [];
  if (scope === 'category') { sql += ' AND category_id=?'; params.push(categoryId); }
  sql += ' ORDER BY name';
  const products = db.prepare(sql).all(...params);
  if (!products.length) bad('Không có sản phẩm để kiểm kho');
  const s = getSettings();
  const code = makeCode(db, s.stockcheck_prefix || 'KK', 'stock_checks');
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO stock_checks(code,note,scope,category_id,status) VALUES (?,?,?,?,?)')
      .run(code, str(b.note, 500) || null, scope, categoryId, 'draft');
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO stock_check_items(check_id,product_id,name,unit_name,system_qty,counted_qty,diff,cost_price) VALUES (?,?,?,?,?,?,?,?)');
    for (const p of products) ins.run(id, p.id, p.name, p.unit, p.stock, null, 0, p.cost_price);
    db.exec('COMMIT');
    ok(res, getCheck(id));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));
router.put('/stock-checks/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM stock_checks WHERE id=?').get(id);
  if (!c) return fail(res, 'Không tìm thấy phiếu kiểm kho', 404);
  if (c.status !== 'draft') bad('Phiếu đã chốt, không sửa được');
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const up = db.prepare('UPDATE stock_check_items SET counted_qty=?, diff=?, note=? WHERE id=? AND check_id=?');
  for (const it of items) {
    const row = db.prepare('SELECT * FROM stock_check_items WHERE id=? AND check_id=?').get(Number(it.id), id);
    if (!row) continue;
    const counted = it.counted_qty === '' || it.counted_qty == null ? null : num(it.counted_qty);
    const diff = counted == null ? 0 : counted - row.system_qty;
    up.run(counted, diff, str(it.note, 300) || null, Number(it.id), id);
  }
  if (req.body.note != null) db.prepare('UPDATE stock_checks SET note=? WHERE id=?').run(str(req.body.note, 500) || null, id);
  ok(res, getCheck(id));
}));
router.post('/stock-checks/:id/complete', wrap((req, res) => {
  const id = Number(req.params.id);
  const c = getCheck(id);
  if (!c) return fail(res, 'Không tìm thấy phiếu kiểm kho', 404);
  if (c.status !== 'draft') bad('Phiếu đã chốt');
  const counted = c.items.filter((it) => it.counted_qty != null);
  if (!counted.length) bad('Chưa nhập số lượng thực tế');
  db.exec('BEGIN');
  try {
    let diffValue = 0;
    for (const it of c.items) {
      if (it.counted_qty == null) continue;
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      if (!prod) continue;
      const delta = it.counted_qty - it.system_qty;
      diffValue += round(delta * (it.cost_price || 0));
      if (delta !== 0) {
        db.prepare('UPDATE products SET stock=? WHERE id=?').run(it.counted_qty, prod.id);
        db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,ref,conversion,stock_after,note)
          VALUES (?,?,?,?,?,?,?,?)`).run(prod.id, delta, 'check', 'check', c.code, 1, it.counted_qty, 'Kiểm kho điều chỉnh');
      }
    }
    db.prepare(`UPDATE stock_checks SET status='completed', diff_value=?, completed_at=datetime('now','localtime') WHERE id=?`).run(diffValue, id);
    db.exec('COMMIT');
    ok(res, getCheck(id));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));
router.delete('/stock-checks/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM stock_checks WHERE id=?').get(id);
  if (!c) return fail(res, 'Không tìm thấy phiếu kiểm kho', 404);
  if (c.status === 'completed') bad('Không xóa được phiếu đã chốt');
  db.prepare('DELETE FROM stock_checks WHERE id=?').run(id);
  ok(res, true);
}));

/* ===================== SỔ KHO & TỔNG HỢP ===================== */
router.get('/stock/moves', wrap((req, res) => {
  const { product_id, type, ref_type, from, to, q } = req.query;
  let sql = `SELECT m.*, p.name AS product_name, p.unit AS product_unit FROM stock_moves m JOIN products p ON p.id=m.product_id WHERE 1=1`;
  const params = [];
  if (product_id) { sql += ' AND m.product_id=?'; params.push(Number(product_id)); }
  if (type) { sql += ' AND m.type=?'; params.push(type); }
  if (ref_type) { sql += ' AND m.ref_type=?'; params.push(ref_type); }
  if (from) { sql += ' AND date(m.created_at)>=date(?)'; params.push(from); }
  if (to) { sql += ' AND date(m.created_at)<=date(?)'; params.push(to); }
  if (q) { sql += ' AND (p.name LIKE ? OR m.ref LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY m.id DESC LIMIT 1000';
  ok(res, db.prepare(sql).all(...params));
}));

router.get('/stock/summary', wrap((req, res) => {
  const r = db.prepare(`SELECT COUNT(*) skus, COALESCE(SUM(stock),0) total_qty, COALESCE(SUM(stock*cost_price),0) total_value,
      COALESCE(SUM(stock*sell_price),0) retail_value FROM products WHERE active=1 AND IFNULL(product_type,'')<>'service'`).get();
  const low = db.prepare(`SELECT COUNT(*) c FROM products WHERE active=1 AND IFNULL(product_type,'')<>'service' AND min_stock>0 AND stock<=min_stock`).get().c;
  const out = db.prepare(`SELECT COUNT(*) c FROM products WHERE active=1 AND IFNULL(product_type,'')<>'service' AND stock<=0`).get().c;
  ok(res, { ...r, low_stock: low, out_of_stock: out });
}));

module.exports = router;
