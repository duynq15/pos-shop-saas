'use strict';

const express = require('express');
const db = require('../db');
const { ok, wrap, round } = require('../lib/util');
const { can, requirePerm } = require('../middleware');

const router = express.Router();
const DATE = "date(i.created_at)";

function range(q) {
  const f = q.from || new Date().toISOString().slice(0, 10);
  const t = q.to || f;
  return { from: f, to: t };
}

router.get('/reports/summary', wrap((req, res) => {
  const { from, to } = range(req.query);
  const P = [from, to];

  const sale = db.prepare(`SELECT COUNT(*) AS invoices, COALESCE(SUM(total),0) AS revenue,
      COALESCE(SUM(item_discount+order_discount),0) AS discount
    FROM invoices i WHERE i.status='paid' AND i.type='sale' AND ${DATE}>=date(?) AND ${DATE}<=date(?)`).get(...P);
  const ret = db.prepare(`SELECT COUNT(*) AS invoices, COALESCE(SUM(total),0) AS revenue
    FROM invoices i WHERE i.status='paid' AND i.type='return' AND ${DATE}>=date(?) AND ${DATE}<=date(?)`).get(...P);

  const profitRow = db.prepare(`SELECT COALESCE(SUM((ii.line_total - ii.cost_price*ii.base_qty) * CASE WHEN i.type='return' THEN -1 ELSE 1 END),0) AS profit,
      COALESCE(SUM(ii.base_qty * CASE WHEN i.type='return' THEN -1 ELSE 1 END),0) AS items
    FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
    WHERE i.status='paid' AND ${DATE}>=date(?) AND ${DATE}<=date(?)`).get(...P);

  const pays = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) AS amount
    FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
    WHERE i.status='paid' AND ${DATE}>=date(?) AND ${DATE}<=date(?) GROUP BY p.method`).all(...P);
  const payMap = { cash: 0, transfer: 0, card: 0, ewallet: 0 };
  for (const p of pays) payMap[p.method] = (payMap[p.method] || 0) + p.amount;

  const pending = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) total FROM invoices WHERE status='pending' AND type='sale'`).get();

  const byDay = db.prepare(`SELECT ${DATE} AS day, COUNT(*) AS invoices,
      COALESCE(SUM(CASE WHEN i.type='return' THEN -i.total ELSE i.total END),0) AS revenue,
      COALESCE(SUM(CASE WHEN i.type='return' THEN -i.total ELSE i.total END),0) AS net
    FROM invoices i WHERE i.status='paid' AND ${DATE}>=date(?) AND ${DATE}<=date(?) GROUP BY day ORDER BY day`).all(...P);

  const byHour = db.prepare(`SELECT strftime('%H', i.created_at) AS hour, COUNT(*) AS invoices, COALESCE(SUM(i.total),0) AS revenue
    FROM invoices i WHERE i.status='paid' AND i.type='sale' AND ${DATE}>=date(?) AND ${DATE}<=date(?) GROUP BY hour ORDER BY hour`).all(...P);

  const top = db.prepare(`SELECT ii.product_id, ii.name, SUM(ii.base_qty) AS qty, SUM(ii.line_total) AS revenue,
      SUM(ii.line_total - ii.cost_price*ii.base_qty) AS profit
    FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
    WHERE i.status='paid' AND i.type='sale' AND ${DATE}>=date(?) AND ${DATE}<=date(?)
    GROUP BY ii.product_id, ii.name ORDER BY revenue DESC LIMIT 10`).all(...P);

  const byCategory = db.prepare(`SELECT COALESCE(c.name,'Khác') AS category, SUM(ii.base_qty) AS qty, SUM(ii.line_total) AS revenue,
      SUM(ii.line_total - ii.cost_price*ii.base_qty) AS profit
    FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
    LEFT JOIN products p ON p.id=ii.product_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE i.status='paid' AND i.type='sale' AND ${DATE}>=date(?) AND ${DATE}<=date(?)
    GROUP BY category ORDER BY revenue DESC`).all(...P);

  const lowStock = db.prepare('SELECT id,name,stock,min_stock,unit FROM products WHERE active=1 AND stock<=min_stock ORDER BY stock LIMIT 100').all();

  const vatRow = db.prepare(`SELECT COALESCE(SUM(CASE WHEN i.type='return' THEN -i.vat_amount ELSE i.vat_amount END),0) AS vat,
      COALESCE(SUM(CASE WHEN i.type='return' THEN -i.net_amount ELSE i.net_amount END),0) AS net
    FROM invoices i WHERE i.status='paid' AND ${DATE}>=date(?) AND ${DATE}<=date(?)`).get(...P);
  const revenue = sale.revenue - ret.revenue;
  const items = profitRow.items;
  const out = {
    from, to,
    invoices: sale.invoices,
    returns: ret.invoices,
    return_amount: ret.revenue,
    revenue,
    gross_revenue: sale.revenue,
    discount: sale.discount,
    net: vatRow.net,
    vat: vatRow.vat,
    profit: profitRow.profit,
    items,
    avg_order: sale.invoices ? round(revenue / sale.invoices) : 0,
    cash: payMap.cash,
    transfer: payMap.transfer,
    card: payMap.card,
    ewallet: payMap.ewallet,
    pending,
    byDay, byHour, top, byCategory, lowStock,
  };
  // Ẩn lợi nhuận nếu người dùng không có quyền
  if (!can(req, 'report.profit')) {
    delete out.profit;
    for (const k of ['top', 'byCategory']) out[k] = (out[k] || []).map((r) => { const { profit, ...rest } = r; return rest; });
  }
  ok(res, out);
}));

router.get('/reports/products', wrap((req, res) => {
  const { from, to } = range(req.query);
  const sort = { revenue: 'revenue', qty: 'qty', profit: 'profit', name: 'name' }[req.query.sort] || 'revenue';
  const rows = db.prepare(`SELECT ii.product_id, ii.name, SUM(ii.base_qty) AS qty, SUM(ii.line_total) AS revenue,
      SUM(ii.line_total - ii.cost_price*ii.base_qty) AS profit, AVG(ii.price) AS avg_price
    FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
    WHERE i.status='paid' AND i.type='sale' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)
    GROUP BY ii.product_id, ii.name ORDER BY ${sort} DESC LIMIT 500`).all(from, to);
  ok(res, rows);
}));

router.get('/reports/inventory', wrap((req, res) => {
  const rows = db.prepare(`SELECT p.id, p.name, p.sku, p.barcode, p.unit, p.stock, p.min_stock, p.cost_price, p.sell_price,
      (p.stock*p.cost_price) AS stock_value, COALESCE(c.name,'') AS category_name
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY stock_value DESC`).all();
  const totals = rows.reduce((a, r) => ({ stock_value: a.stock_value + r.stock_value, retail_value: a.retail_value + r.stock * r.sell_price }), { stock_value: 0, retail_value: 0 });
  ok(res, { items: rows, ...totals });
}));

router.get('/reports/slow-moving', wrap((req, res) => {
  const { from, to } = range(req.query);
  const rows = db.prepare(`SELECT p.id, p.name, p.unit, p.stock, p.cost_price, (p.stock*p.cost_price) AS stock_value,
      COALESCE(SUM(ii.base_qty),0) AS sold
    FROM products p
    LEFT JOIN invoice_items ii ON ii.product_id=p.id
    LEFT JOIN invoices i ON i.id=ii.invoice_id AND i.status='paid' AND i.type='sale' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)
    WHERE p.active=1
    GROUP BY p.id ORDER BY sold ASC, stock_value DESC LIMIT 200`).all(from, to);
  ok(res, rows);
}));

router.get('/reports/purchases', wrap((req, res) => {
  const { from, to } = range(req.query);
  const rows = db.prepare(`SELECT COALESCE(supplier_name,'Khác') AS supplier, COUNT(*) AS orders, COALESCE(SUM(total),0) AS total
    FROM purchases WHERE status='received' AND date(created_at)>=date(?) AND date(created_at)<=date(?)
    GROUP BY supplier ORDER BY total DESC`).all(from, to);
  ok(res, rows);
}));

/* ===================== XUẤT CSV ===================== */
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return '\ufeff' + lines.join('\n');
}

router.get('/reports/export', wrap((req, res) => {
  const { from, to } = range(req.query);
  const type = req.query.type || 'sales';
  let rows = [];
  let name = 'bao-cao';
  if (type === 'sales') {
    name = `ban-hang-${from}_${to}`;
    rows = db.prepare(`SELECT i.code AS 'Mã HĐ', i.created_at AS 'Thời gian', i.type AS 'Loại', i.customer_name AS 'Khách hàng',
        i.payment_method AS 'Thanh toán', i.subtotal AS 'Tạm tính', i.discount AS 'Giảm giá', i.total AS 'Tổng', i.status AS 'Trạng thái'
      FROM invoices i WHERE date(i.created_at)>=date(?) AND date(i.created_at)<=date(?) ORDER BY i.id DESC`).all(from, to);
  } else if (type === 'products') {
    name = `san-pham-${from}_${to}`;
    rows = db.prepare(`SELECT ii.name AS 'Sản phẩm', SUM(ii.base_qty) AS 'SL bán', SUM(ii.line_total) AS 'Doanh thu',
        SUM(ii.line_total - ii.cost_price*ii.base_qty) AS 'Lợi nhuận'
      FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
      WHERE i.status='paid' AND i.type='sale' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)
      GROUP BY ii.product_id, ii.name ORDER BY SUM(ii.line_total) DESC`).all(from, to);
  } else if (type === 'inventory') {
    name = 'ton-kho';
    rows = db.prepare(`SELECT p.barcode AS 'Mã vạch', p.sku AS 'SKU', p.name AS 'Tên', COALESCE(c.name,'') AS 'Danh mục',
        p.unit AS 'ĐVT', p.stock AS 'Tồn', p.min_stock AS 'Tồn tối thiểu', p.cost_price AS 'Giá vốn', p.sell_price AS 'Giá bán',
        (p.stock*p.cost_price) AS 'Giá trị tồn'
      FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.name`).all();
  }
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(csv);
}));

router.get('/reports/vat', wrap((req, res) => {
  const { from, to } = range(req.query);
  const output = db.prepare(`SELECT t.rate,
      SUM(CASE WHEN i.type='return' THEN -t.taxable_amount ELSE t.taxable_amount END) AS taxable,
      SUM(CASE WHEN i.type='return' THEN -t.tax_amount ELSE t.tax_amount END) AS tax
    FROM invoice_tax_lines t JOIN invoices i ON i.id=t.invoice_id
    WHERE i.status='paid' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)
    GROUP BY t.rate ORDER BY t.rate`).all(from, to);
  const input = db.prepare(`SELECT pi.vat_rate AS rate, SUM(pi.line_total) AS base,
      SUM(ROUND(pi.line_total*pi.vat_rate/100)) AS tax
    FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id
    WHERE p.status='received' AND pi.vat_rate>0 AND date(p.created_at)>=date(?) AND date(p.created_at)<=date(?)
    GROUP BY pi.vat_rate ORDER BY pi.vat_rate`).all(from, to);
  const outputTax = output.reduce((s, r) => s + (r.tax || 0), 0);
  const inputTax = input.reduce((s, r) => s + (r.tax || 0), 0);
  ok(res, { from, to, output, input, output_tax: outputTax, input_tax: inputTax, payable: outputTax - inputTax });
}));

// ---------- Phân tích thông minh ----------
router.get('/reports/analytics', requirePerm('report.view'), wrap((req, res) => {
  const { from, to } = range(req.query);
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);

  // ABC (Pareto) theo doanh thu sản phẩm
  const prod = db.prepare(`SELECT ii.product_id, ii.name, SUM(ii.base_qty) AS qty, SUM(ii.line_total) AS revenue
    FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
    WHERE i.status='paid' AND i.type='sale' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)
    GROUP BY ii.product_id, ii.name ORDER BY revenue DESC`).all(from, to);
  const totalRev = prod.reduce((s, p) => s + p.revenue, 0) || 1;
  let cum = 0;
  const abc = prod.map((p) => {
    cum += p.revenue;
    const share = cum / totalRev;
    return { ...p, cum_share: Number((share * 100).toFixed(1)), class: share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C' };
  }).slice(0, 50);

  // Gợi ý nhập hàng: dựa trên tốc độ bán và tồn hiện tại
  const reorder = db.prepare(`SELECT p.id, p.name, p.unit, p.stock, p.min_stock,
      COALESCE((SELECT SUM(ii.base_qty) FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
        WHERE ii.product_id=p.id AND i.status='paid' AND i.type='sale' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)),0) AS sold
    FROM products p WHERE p.active=1`).all(from, to).map((p) => {
    const perDay = p.sold / days;
    const cover = perDay > 0 ? p.stock / perDay : 999;
    const suggest = Math.max(0, Math.ceil(perDay * days * 0.5 - p.stock));
    return { id: p.id, name: p.name, unit: p.unit, stock: p.stock, min_stock: p.min_stock, per_day: Number(perDay.toFixed(2)), days_cover: Number(cover.toFixed(1)), suggest };
  }).filter((p) => p.stock <= p.min_stock || p.days_cover < 7).sort((a, b) => a.days_cover - b.days_cover).slice(0, 30);

  // Thường mua kèm (top cặp sản phẩm cùng hóa đơn)
  const basket = db.prepare(`SELECT a.name AS a, b.name AS b, COUNT(*) AS times
    FROM invoice_items a JOIN invoice_items b ON a.invoice_id=b.invoice_id AND a.product_id<b.product_id
    JOIN invoices i ON i.id=a.invoice_id
    WHERE i.status='paid' AND i.type='sale' AND date(i.created_at)>=date(?) AND date(i.created_at)<=date(?)
    GROUP BY a.name, b.name ORDER BY times DESC LIMIT 10`).all(from, to);

  // Bất thường: hóa đơn giảm giá cao
  const anomalies = db.prepare(`SELECT code, total, discount, created_at, customer_name,
      ROUND(discount*100.0/NULLIF(subtotal,0)) AS pct
    FROM invoices WHERE status='paid' AND type='sale' AND date(created_at)>=date(?) AND date(created_at)<=date(?)
      AND subtotal>0 AND discount*100.0/subtotal>=30 ORDER BY pct DESC LIMIT 20`).all(from, to);
  const cancelled = db.prepare(`SELECT COUNT(*) c FROM invoices WHERE status='cancelled' AND date(created_at)>=date(?) AND date(created_at)<=date(?)`).get(from, to).c;

  ok(res, { from, to, days, abc, reorder, basket, anomalies, cancelled });
}));

// ---------- Giao dịch VietQR (từ dữ liệu callback đã nhận) ----------
router.get('/reports/vietqr', requirePerm('report.view'), wrap((req, res) => {
  const { from, to } = range(req.query);
  const matched = req.query.matched;
  const q = (req.query.q || '').trim();
  let sql = `SELECT v.id, v.transactionid, v.invoice_id, v.bank_account, v.amount, v.content, v.order_id,
      v.trans_type, v.matched, v.note, v.created_at, i.code AS invoice_code
    FROM vietqr_transactions v LEFT JOIN invoices i ON i.id=v.invoice_id
    WHERE date(v.created_at)>=date(?) AND date(v.created_at)<=date(?)`;
  const params = [from, to];
  if (matched === '1') sql += ' AND v.matched=1';
  if (matched === '0') sql += ' AND v.matched=0';
  if (q) { sql += ' AND (v.order_id LIKE ? OR v.content LIKE ? OR v.transactionid LIKE ? OR i.code LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY v.id DESC LIMIT 1000';
  const items = db.prepare(sql).all(...params);
  const summary = db.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN v.trans_type='C' THEN v.amount ELSE 0 END),0) AS received,
      SUM(CASE WHEN v.matched=1 THEN 1 ELSE 0 END) AS matched_count,
      SUM(CASE WHEN v.matched=0 THEN 1 ELSE 0 END) AS unmatched_count
    FROM vietqr_transactions v WHERE date(v.created_at)>=date(?) AND date(v.created_at)<=date(?)`).get(from, to);
  ok(res, { from, to, summary, items });
}));

router.get('/reports/vietqr/export', requirePerm('report.export'), wrap((req, res) => {
  const { from, to } = range(req.query);
  const rows = db.prepare(`SELECT v.created_at AS 'Thời gian', v.transactionid AS 'Mã giao dịch',
      i.code AS 'Hóa đơn', v.order_id AS 'Mã đối soát', v.amount AS 'Số tiền', v.trans_type AS 'Loại',
      v.bank_account AS 'Tài khoản nhận', v.content AS 'Nội dung',
      CASE WHEN v.matched=1 THEN 'Khớp' ELSE 'Chưa khớp' END AS 'Trạng thái', v.note AS 'Ghi chú'
    FROM vietqr_transactions v LEFT JOIN invoices i ON i.id=v.invoice_id
    WHERE date(v.created_at)>=date(?) AND date(v.created_at)<=date(?) ORDER BY v.id DESC`).all(from, to);
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vietqr-${from}_${to}.csv"`);
  res.send(csv);
}));

module.exports = router;
