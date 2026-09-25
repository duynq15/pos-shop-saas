'use strict';

const { round, bad } = require('./util');

// Tải các khuyến mãi đang hiệu lực tại một thời điểm.
function loadActivePromotions(db, dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT * FROM promotions
        WHERE active=1
          AND (start_date IS NULL OR start_date='' OR date(start_date)<=date(?))
          AND (end_date   IS NULL OR end_date=''   OR date(end_date)>=date(?))
        ORDER BY priority DESC, id DESC`
    )
    .all(d, d);
}

// Giá của một đơn vị theo bảng giá (fallback về giá bán của đơn vị).
function resolveUnitPrice(db, priceListId, productId, unitId, fallback) {
  if (priceListId && unitId) {
    const row = db.prepare('SELECT price FROM price_list_items WHERE price_list_id=? AND unit_id=?').get(priceListId, unitId);
    if (row && row.price != null) return round(row.price);
  }
  return round(fallback);
}

function getBaseUnit(db, productId) {
  return db.prepare('SELECT * FROM product_units WHERE product_id=? AND is_base=1 LIMIT 1').get(productId);
}

function getUnit(db, productId, unitId) {
  if (unitId) {
    const u = db.prepare('SELECT * FROM product_units WHERE id=? AND product_id=?').get(unitId, productId);
    if (u) return u;
  }
  return getBaseUnit(db, productId);
}

function bestItemPromo(promotions, product, qty) {
  let best = null;
  for (const p of promotions) {
    if (p.kind !== 'item') continue;
    if (p.target_type === 'category' && Number(p.target_id) !== Number(product.category_id)) continue;
    if (p.target_type === 'product' && Number(p.target_id) !== Number(product.id)) continue;
    if (Number(p.min_qty || 0) > 0 && qty < Number(p.min_qty)) continue;
    const value = Number(p.discount_value) || 0;
    const score = p.discount_type === 'percent' ? value : value;
    if (!best || score > best.score || (score === best.score && p.priority > best.priority)) {
      best = { promo: p, score };
    }
  }
  return best ? best.promo : null;
}

// Tính toán giá & khuyến mãi cho một giỏ hàng. Dùng chung cho xem trước và tạo hóa đơn.
function priceCart(db, cart) {
  const items = Array.isArray(cart.items) ? cart.items : [];
  if (!items.length) bad('Hóa đơn chưa có sản phẩm');
  const priceListId = cart.price_list_id ? Number(cart.price_list_id) : null;
  const promotions = loadActivePromotions(db, cart.date);

  const lines = [];
  let grossSubtotal = 0;
  let itemDiscount = 0;

  for (const raw of items) {
    const qty = Number(raw.qty);
    if (!qty || qty <= 0) bad('Số lượng không hợp lệ');
    let product = null;
    let unit = null;
    if (raw.product_id) {
      product = db.prepare('SELECT * FROM products WHERE id=?').get(Number(raw.product_id));
      if (!product) bad('Không tìm thấy sản phẩm trong giỏ');
      unit = getUnit(db, product.id, raw.unit_id);
    }
    const conversion = unit ? Number(unit.conversion) || 1 : 1;
    const baseQty = qty * conversion;

    let price;
    if (raw.price != null && raw.price !== '') price = round(raw.price);
    else if (unit) price = resolveUnitPrice(db, priceListId, product.id, unit.id, unit.sell_price);
    else price = round(product ? product.sell_price : 0);

    const gross = Math.max(0, round(price * qty));
    let discount = 0;
    let promoId = null;
    let promoName = null;

    if (raw.discount != null && raw.discount !== '') {
      discount = Math.min(gross, Math.max(0, round(raw.discount)));
    } else if (product) {
      const promo = bestItemPromo(promotions, product, baseQty);
      if (promo) {
        discount = promo.discount_type === 'percent' ? round((gross * Number(promo.discount_value)) / 100) : round(Number(promo.discount_value) * qty);
        discount = Math.min(gross, Math.max(0, discount));
        promoId = promo.id;
        promoName = promo.name;
      }
    }
    const lineTotal = gross - discount;
    grossSubtotal += gross;
    itemDiscount += discount;

    lines.push({
      product_id: product ? product.id : null,
      name: raw.name || (product ? product.name : 'Hàng lẻ'),
      barcode: product ? product.barcode : null,
      unit_id: unit ? unit.id : null,
      unit_name: raw.unit_name || (unit ? unit.name : ''),
      conversion,
      qty,
      base_qty: baseQty,
      price,
      cost_price: product ? round(product.cost_price) : round(raw.cost_price || 0),
      gross,
      discount,
      promo_id: promoId,
      promo_name: promoName,
      line_total: lineTotal,
      note: raw.note || null,
    });
  }

  const subtotal = grossSubtotal - itemDiscount;

  // Khuyến mãi cấp hóa đơn: chọn mức giảm tốt nhất đủ điều kiện.
  let promoOrderDiscount = 0;
  let orderPromo = null;
  for (const p of promotions) {
    if (p.kind !== 'order') continue;
    if (Number(p.min_subtotal || 0) > subtotal) continue;
    const v = p.discount_type === 'percent' ? round((subtotal * Number(p.discount_value)) / 100) : round(Number(p.discount_value));
    if (v > promoOrderDiscount) {
      promoOrderDiscount = v;
      orderPromo = p;
    }
  }
  promoOrderDiscount = Math.min(promoOrderDiscount, subtotal);

  let manualDiscount = Math.max(0, round(cart.manual_discount || cart.discount || 0));
  let orderDiscount = promoOrderDiscount + manualDiscount;
  if (orderDiscount > subtotal) {
    manualDiscount = Math.max(0, subtotal - promoOrderDiscount);
    orderDiscount = subtotal;
  }
  const total = Math.max(0, subtotal - orderDiscount);

  return {
    items: lines,
    gross_subtotal: grossSubtotal,
    item_discount: itemDiscount,
    subtotal,
    promo_order_id: orderPromo ? orderPromo.id : null,
    promo_order_name: orderPromo ? orderPromo.name : null,
    promo_discount: promoOrderDiscount,
    manual_discount: manualDiscount,
    order_discount: orderDiscount,
    discount: itemDiscount + orderDiscount,
    total,
    price_list_id: priceListId,
    item_count: lines.reduce((s, l) => s + l.qty, 0),
  };
}

module.exports = { priceCart, loadActivePromotions, resolveUnitPrice };
