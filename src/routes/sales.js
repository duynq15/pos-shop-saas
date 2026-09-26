'use strict';

const express = require('express');
const db = require('../db');
const { ok, fail, wrap, bad, round, num, str, bool } = require('../lib/util');
const { priceCart } = require('../lib/pricing');
const { makeCode } = require('../lib/codes');
const { nextPaymentRef } = require('../control');
const { getSettings } = require('./admin');
const { requirePerm } = require('../middleware');

const router = express.Router();
const settings = () => getSettings();

const PAY_METHODS = ['cash', 'transfer', 'card', 'ewallet'];
const methodLabel = (m) => ({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', ewallet: 'Ví điện tử', mixed: 'Hỗn hợp', points: 'Điểm' }[m] || m);

/* ===================== XEM TRƯỚC GIỎ HÀNG ===================== */
router.post('/checkout/preview', wrap((req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || !body.items.length) {
    return ok(res, { items: [], subtotal: 0, total: 0, discount: 0, item_discount: 0, order_discount: 0, gross_subtotal: 0, item_count: 0, warnings: [] });
  }
  const priced = priceCart(db, body);
  const warnings = [];
  for (const line of priced.items) {
    if (!line.product_id) continue;
    const p = db.prepare('SELECT id,name,stock,unit,allow_negative FROM products WHERE id=?').get(line.product_id);
    if (p && !p.allow_negative && line.base_qty > p.stock) {
      warnings.push({ product_id: p.id, name: p.name, message: `"${p.name}" chỉ còn ${p.stock} ${p.unit}, bán ${line.base_qty} ${p.unit}` });
    }
  }
  ok(res, { ...priced, warnings });
}));

/* ===================== ĐƠN TREO ===================== */
router.get('/held-orders', wrap((req, res) => {
  ok(res, db.prepare('SELECT id,code,label,customer_name,customer_phone,note,total,item_count,created_at FROM held_orders ORDER BY id DESC LIMIT 100').all());
}));
router.get('/held-orders/:id', wrap((req, res) => {
  const h = db.prepare('SELECT * FROM held_orders WHERE id=?').get(Number(req.params.id));
  if (!h) return fail(res, 'Không tìm thấy đơn treo', 404);
  h.cart = JSON.parse(h.cart_json);
  ok(res, h);
}));
router.post('/held-orders', wrap((req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.cart) || !b.cart.length) bad('Chưa có hàng để treo');
  const priced = priceCart(db, { items: b.cart, price_list_id: b.price_list_id, manual_discount: b.manual_discount });
  const code = makeCode(db, 'DT', 'held_orders');
  const r = db.prepare(`INSERT INTO held_orders(code,label,cart_json,customer_name,customer_phone,note,total,item_count)
    VALUES (?,?,?,?,?,?,?,?)`).run(code, str(b.label, 80) || null, JSON.stringify(b.cart), str(b.customer_name, 120) || null, str(b.customer_phone, 40) || null, str(b.note, 300) || null, priced.total, priced.item_count);
  ok(res, db.prepare('SELECT * FROM held_orders WHERE id=?').get(Number(r.lastInsertRowid)));
}));
router.delete('/held-orders/:id', wrap((req, res) => {
  db.prepare('DELETE FROM held_orders WHERE id=?').run(Number(req.params.id));
  ok(res, true);
}));

/* ===================== HÓA ĐƠN ===================== */
function buildPayments(body, total, method) {
  const payments = [];
  let tendered = total, change = 0;
  if (method === 'cash') {
    tendered = body.paid_amount != null && body.paid_amount !== '' ? round(body.paid_amount) : total;
    if (tendered < total) bad('Khách đưa chưa đủ tiền');
    change = tendered - total;
    payments.push({ method: 'cash', amount: total });
  } else if (method === 'mixed') {
    const list = Array.isArray(body.payments) ? body.payments : [];
    let sum = 0;
    let hasCash = false;
    for (const p of list) {
      const a = round(p.amount);
      if (a > 0) { payments.push({ method: PAID_SAFE(p.method), amount: a }); sum += a; if (p.method === 'cash') hasCash = true; }
    }
    if (sum < total) bad('Tổng tiền khách trả chưa đủ');
    tendered = sum;
    change = hasCash ? Math.max(0, sum - total) : 0;
  } else {
    payments.push({ method, amount: total });
  }
  return { payments, tendered, change };
}
const PAID_SAFE = (m) => (PAY_METHODS.includes(m) ? m : 'cash');

function applyStock(line, direction, refType, refCode) {
  // direction: -1 bán/hủy, +1 trả/nhập
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(line.product_id);
  if (!p) return;
  const delta = direction * line.base_qty;
  const s = settings();
  if (direction < 0 && !p.allow_negative && s.allow_negative_stock !== '1' && p.stock + delta < -0.0001) {
    bad(`"${p.name}" không đủ tồn kho (còn ${p.stock} ${p.unit}, cần ${line.base_qty} ${p.unit})`);
  }
  const after = round(p.stock + delta);
  db.prepare('UPDATE products SET stock=? WHERE id=?').run(p.stock + delta, p.id);
  db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,ref,unit_id,unit_name,conversion,stock_after,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(p.id, delta, direction < 0 ? (refType === 'return' ? 'return' : 'sale') : 'return', refType, refCode, line.unit_id, line.unit_name, line.conversion, after, null);
}

router.post('/invoices', requirePerm('pos.sell'), wrap((req, res) => {
  const b = req.body || {};
  const type = b.type === 'return' ? 'return' : 'sale';
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) bad('Hóa đơn chưa có sản phẩm');

  const priced = priceCart(db, b);
  const s = settings();
  const method = type === 'return' ? PAID_SAFE(b.payment_method === 'mixed' ? 'cash' : b.payment_method) : (b.payment_method || 'cash');
  const paid = buildPayments(b, priced.total, method === 'mixed' ? 'mixed' : method);
  let status = b.status === 'pending' ? 'pending' : 'paid';
  if (type === 'sale' && method === 'transfer' && s.bank_account && !b.status) status = 'pending';

  db.exec('BEGIN');
  try {
    const prefix = type === 'return' ? s.return_prefix || 'TH' : s.invoice_prefix || 'HD';
    const code = makeCode(db, prefix, 'invoices');
    const paymentRef = type === 'sale' ? nextPaymentRef(db) : null;
    const r = db.prepare(`INSERT INTO invoices(code,type,parent_id,subtotal,item_discount,order_discount,discount,net_amount,vat_amount,total,payment_method,paid_amount,change_amount,price_list_id,promo_order_id,payment_ref,customer_name,customer_phone,note,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      code, type, b.parent_id ? Number(b.parent_id) : null, priced.subtotal, priced.item_discount, priced.order_discount, priced.discount,
      priced.net_amount || 0, priced.vat_amount || 0, priced.total, method, paid.tendered, paid.change, priced.price_list_id, priced.promo_order_id, paymentRef,
      str(b.customer_name, 120) || null, str(b.customer_phone, 40) || null, str(b.note, 500) || null, status);
    const invId = Number(r.lastInsertRowid);

    const insItem = db.prepare(`INSERT INTO invoice_items(invoice_id,product_id,name,barcode,unit_id,unit_name,conversion,qty,base_qty,price,cost_price,discount,promo_id,promo_name,line_total,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of priced.items) {
      insItem.run(invId, l.product_id, l.name, l.barcode, l.unit_id, l.unit_name, l.conversion, l.qty, l.base_qty, l.price, l.cost_price, l.discount, l.promo_id, l.promo_name, l.line_total, l.note);
      if (l.product_id) applyStock(l, type === 'return' ? 1 : -1, type, code);
    }
    const insTax = db.prepare('INSERT INTO invoice_tax_lines(invoice_id,rate,taxable_amount,tax_amount) VALUES (?,?,?,?)');
    for (const t of priced.tax_lines || []) if (t.tax_amount !== 0 || Number(t.rate) > 0) insTax.run(invId, t.rate, t.taxable_amount, t.tax_amount);
    const insPay = db.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,?,?,?)');
    if (status === 'paid') {
      for (const p of paid.payments) insPay.run(invId, p.method, type === 'return' ? -p.amount : p.amount, null);
    }

    db.exec('COMMIT');
    ok(res, getInvoice(invId));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

function getInvoice(id) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return null;
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id').all(id);
  inv.payments = db.prepare('SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY id').all(id);
  inv.tax_lines = db.prepare('SELECT rate,taxable_amount,tax_amount FROM invoice_tax_lines WHERE invoice_id=? ORDER BY rate').all(id);
  inv.method_label = methodLabel(inv.payment_method);
  return inv;
}

router.get('/invoices', wrap((req, res) => {
  const { from, to, q, method, status, type } = req.query;
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date(created_at)>=date(?)'; params.push(from); }
  if (to) { sql += ' AND date(created_at)<=date(?)'; params.push(to); }
  if (q) { sql += ' AND (code LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (method) { sql += ' AND payment_method=?'; params.push(method); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (type) { sql += ' AND type=?'; params.push(type); }
  sql += ' ORDER BY id DESC LIMIT 1000';
  ok(res, db.prepare(sql).all(...params));
}));

router.get('/invoices/:id', wrap((req, res) => {
  const inv = getInvoice(Number(req.params.id));
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  ok(res, inv);
}));

// Thông tin phục vụ đổi trả: các mặt hàng còn có thể trả
router.get('/invoices/:id/returnable', wrap((req, res) => {
  const id = Number(req.params.id);
  const inv = getInvoice(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  if (inv.type !== 'sale') bad('Chỉ đổi trả cho hóa đơn bán');
  const returned = db.prepare(`SELECT product_id, SUM(base_qty) qty FROM invoice_items ii
    JOIN invoices i ON i.id=ii.invoice_id WHERE i.type='return' AND i.parent_id=? GROUP BY product_id`).all(id);
  const map = Object.fromEntries(returned.map((r) => [r.product_id, r.qty]));
  inv.items = inv.items.map((it) => ({ ...it, returned_base_qty: map[it.product_id] || 0, returnable_base_qty: Math.max(0, (it.base_qty || it.qty) - (map[it.product_id] || 0)) }));
  ok(res, inv);
}));

router.post('/invoices/:id/confirm', wrap((req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  db.prepare(`UPDATE invoices SET status='paid', paid_amount=total, change_amount=0 WHERE id=?`).run(id);
  const hasPay = db.prepare('SELECT COUNT(*) c FROM invoice_payments WHERE invoice_id=?').get(id).c;
  if (!hasPay) db.prepare('INSERT INTO invoice_payments(invoice_id,method,amount,note) VALUES (?,?,?,?)').run(id, inv.payment_method === 'cash' ? 'cash' : 'transfer', inv.total, 'Xác nhận thủ công');
  ok(res, getInvoice(id));
}));

router.post('/invoices/:id/cancel', requirePerm('invoice.cancel'), wrap((req, res) => {
  const id = Number(req.params.id);
  const inv = getInvoice(id);
  if (!inv) return fail(res, 'Không tìm thấy hóa đơn', 404);
  if (inv.status === 'cancelled') bad('Hóa đơn đã hủy');
  db.exec('BEGIN');
  try {
    for (const it of inv.items) {
      if (!it.product_id) continue;
      const direction = inv.type === 'return' ? -1 : 1; // hủy bán -> hoàn kho; hủy trả -> trừ lại
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      if (!p) continue;
      const baseQty = it.base_qty || it.qty;
      const after = round(p.stock + direction * baseQty);
      db.prepare('UPDATE products SET stock=? WHERE id=?').run(p.stock + direction * baseQty, it.product_id);
      db.prepare(`INSERT INTO stock_moves(product_id,qty,type,ref_type,ref,unit_id,unit_name,conversion,stock_after,note)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(it.product_id, direction * baseQty, 'cancel', 'cancel', inv.code, it.unit_id, it.unit_name, it.conversion, after, 'Hủy ' + inv.code);
    }
    db.prepare(`UPDATE invoices SET status='cancelled' WHERE id=?`).run(id);
    db.exec('COMMIT');
    ok(res, getInvoice(id));
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}));

module.exports = router;
