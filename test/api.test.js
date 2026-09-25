// Kiểm thử API (chạy: node test/api.test.js, cần server ở PORT 3111 với DB mới)
const ROOT = process.env.BASE || 'http://localhost:3111';
const B = ROOT + '/api';
const R = []; const ok = (n, c, x = '') => R.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);
const jars = {};
const req = async (who, u, o = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (jars[who]) headers.Cookie = jars[who];
  const r = await fetch(B + u, { ...o, headers, body: o.body ? JSON.stringify(o.body) : undefined });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) jars[who] = sc.map((c) => c.split(';')[0]).join('; ');
  return r;
};
const api = async (u, o = {}) => (await req('admin', u, o)).json();
const crc = (str) => { let c = 0xffff; for (const ch of str) { c ^= ch.charCodeAt(0) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };
(async () => {
  let lg = await req('admin', '/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  lg = await lg.json();
  ok('login owner', lg.ok && lg.data.user.role === 'owner');
  let s = await api('/settings', { method: 'PUT', body: { shop_name: 'Tạp hóa Duy', bank_bin: '970422', bank_name: 'MB Bank', bank_account: '0123456789', account_holder: 'NGUYEN VAN A' } });
  ok('settings save', s.ok && s.data.bank_bin === '970422');
  let c = await api('/categories', { method: 'POST', body: { name: 'DM test' } }); ok('category add', c.ok);
  ok('category dup rejected', !(await api('/categories', { method: 'POST', body: { name: 'DM test' } })).ok);
  ok('category delete', (await api('/categories/' + c.data.id, { method: 'DELETE' })).ok);
  let p = await api('/products', { method: 'POST', body: { barcode: '1234567890123', name: 'Test SP A', sell_price: 8000, cost_price: 5000, stock: 10, min_stock: 3 } });
  ok('product add', p.ok && p.data.stock === 10); const pid = p.data.id;
  ok('product dup barcode rejected', !(await api('/products', { method: 'POST', body: { barcode: '1234567890123', name: 'x', sell_price: 1 } })).ok);
  ok('product no name rejected', !(await api('/products', { method: 'POST', body: { name: '', sell_price: 1 } })).ok);
  ok('product neg price rejected', !(await api('/products', { method: 'POST', body: { name: 'x', sell_price: -5 } })).ok);
  let e = await api('/products/' + pid, { method: 'PUT', body: { barcode: '1234567890123', name: 'Test SP A', sell_price: 9000, cost_price: 5000, min_stock: 3 } });
  ok('product edit', e.ok && e.data.sell_price === 9000 && e.data.stock === 10);
  let st = await api(`/products/${pid}/stock`, { method: 'POST', body: { type: 'import', qty: 5, cost_price: 5500 } });
  ok('stock import', st.data.stock === 15 && st.data.cost_price === 5500);
  st = await api(`/products/${pid}/stock`, { method: 'POST', body: { type: 'adjust', qty: 2 } }); ok('stock adjust', st.data.stock === 2);
  ok('stock invalid qty rejected', !(await api(`/products/${pid}/stock`, { method: 'POST', body: { qty: 'abc' } })).ok);
  ok('stock moves logged', (await api(`/products/${pid}/moves`)).data.length === 3);
  ok('low stock filter', (await api('/products?low=1')).data.some((x) => x.id === pid));
  ok('search by name', (await api('/products?q=Test%20SP')).data.length === 1);
  ok('search by barcode', (await api('/products?q=123456789')).data.length === 1);
  let bc = await api('/products/barcode/8934588012136'); ok('barcode lookup', bc.ok && bc.data.name.startsWith('Coca'));
  ok('barcode 404', !(await api('/products/barcode/000')).ok);
  const cocaBefore = bc.data.stock;
  ok('empty invoice rejected', !(await api('/invoices', { method: 'POST', body: { items: [] } })).ok);
  ok('zero qty rejected', !(await api('/invoices', { method: 'POST', body: { items: [{ product_id: 2, qty: 0 }] } })).ok);
  let inv = await api('/invoices', { method: 'POST', body: { items: [{ product_id: 2, qty: 3 }, { product_id: 3, qty: 3, price: 4500 }, { product_id: null, name: 'Túi nilon', price: 1500, qty: 1 }], discount: 5000, payment_method: 'cash', paid_amount: 50000, customer_name: 'Anh Ba' } });
  ok('cash invoice', inv.ok && inv.data.subtotal === 45000 && inv.data.total === 40000 && inv.data.change_amount === 10000 && inv.data.status === 'paid');
  ok('invoice code format', /^HD\d{8}-0001$/.test(inv.data.code), inv.data.code);
  ok('invoice items 3', inv.data.items.length === 3);
  const after = (await api('/products/barcode/8934588012136')).data.stock; ok('stock -3 after sale', cocaBefore - after === 3);
  let tr = await api('/invoices', { method: 'POST', body: { items: [{ product_id: 9, qty: 1 }], payment_method: 'transfer', status: 'pending' } });
  ok('transfer invoice pending', tr.data.status === 'pending' && tr.data.total === 165000);
  let qr = await api(`/qr?amount=${tr.data.total}&message=${tr.data.code}`);
  ok('qr generated', qr.ok && qr.data.dataUrl.startsWith('data:image/png') && qr.data.bank_name === 'MB Bank');
  const pl = qr.data.payload;
  ok('vietqr payload structure', pl.startsWith('000201') && pl.includes('A000000727') && pl.includes('0006970422') && pl.includes('QRIBFTTA') && pl.includes('5303704') && pl.includes('5406165000') && pl.includes(tr.data.code) && /6304[0-9A-F]{4}$/.test(pl));
  ok('vietqr crc valid', crc(pl.slice(0, -4)) === pl.slice(-4));
  ok('confirm transfer', (await api(`/invoices/${tr.data.id}/confirm`, { method: 'POST' })).data.status === 'paid');
  ok('invoice list 2', (await api('/invoices')).data.length === 2);
  ok('filter status paid', (await api('/invoices?status=paid')).data.length === 2);
  ok('filter method transfer', (await api('/invoices?method=transfer')).data.length === 1);
  ok('search customer', (await api('/invoices?q=Anh')).data.length === 1);
  ok('get invoice', (await api('/invoices/' + inv.data.id)).data.items.length === 3);
  ok('get invoice 404', !(await api('/invoices/9999')).ok);
  ok('cancel invoice', (await api(`/invoices/${inv.data.id}/cancel`, { method: 'POST' })).data.status === 'cancelled');
  ok('cancel twice rejected', !(await api(`/invoices/${inv.data.id}/cancel`, { method: 'POST' })).ok);
  ok('stock restored after cancel', (await api('/products/barcode/8934588012136')).data.stock === cocaBefore);
  ok('filter cancelled', (await api('/invoices?status=cancelled')).data.length === 1);
  let rp = (await api('/reports/summary')).data;
  ok('report revenue excludes cancelled', rp.revenue === 165000 && rp.invoices === 1 && rp.transfer === 165000 && rp.cash === 0);
  ok('report profit', rp.profit === 45000);
  ok('report top', rp.top[0] && rp.top[0].name.startsWith('Chảo'));
  ok('report lowStock', rp.lowStock.some((x) => x.id === pid));
  ok('report empty range', (await api('/reports/summary?from=2020-01-01&to=2020-01-02')).data.revenue === 0);
  await api('/products/' + pid, { method: 'DELETE' });
  ok('soft delete hides', !(await api('/products/barcode/1234567890123')).ok);
  ok('all=1 shows inactive', (await api('/products?all=1&q=Test')).data.length === 1);

  // ---------- Đơn vị quy đổi & bảng giá ----------
  let up = await api('/products', { method: 'POST', body: { barcode: 'UNITBASE1', name: 'SP đơn vị', sell_price: 10000, unit: 'cái', stock: 100, units: [{ name: 'Thùng', conversion: 12, sell_price: 100000, barcode: 'UNITBOX1' }] } });
  ok('product with units', up.ok && up.data.units.length === 2);
  const baseUnit = up.data.units.find((u) => u.is_base);
  const boxUnit = up.data.units.find((u) => !u.is_base);
  let ub = await api('/products/barcode/UNITBOX1');
  ok('unit barcode lookup', ub.ok && ub.data.matched_unit_name === 'Thùng' && ub.data.matched_conversion === 12);
  let priceList = await api('/price-lists', { method: 'POST', body: { name: 'PL Test' } });
  await api(`/price-lists/${priceList.data.id}/items`, { method: 'PUT', body: { items: [{ unit_id: baseUnit.id, price: 8500 }] } });
  let pv = await api('/checkout/preview', { method: 'POST', body: { items: [{ product_id: up.data.id, unit_id: baseUnit.id, qty: 1 }], price_list_id: priceList.data.id } });
  ok('price list price applied', pv.ok && pv.data.items[0].price === 8500);
  let pv2 = await api('/checkout/preview', { method: 'POST', body: { items: [{ product_id: up.data.id, unit_id: boxUnit.id, qty: 1 }] } });
  ok('unit default price & conversion', pv2.data.items[0].price === 100000 && pv2.data.items[0].base_qty === 12);
  ok('base unit cannot delete', !(await api('/units/' + baseUnit.id, { method: 'DELETE' })).ok);
  ok('extra unit delete ok', (await api('/units/' + boxUnit.id, { method: 'DELETE' })).ok);
  await api('/price-lists/' + priceList.data.id, { method: 'DELETE' });

  // ---------- Khuyến mãi ----------
  let promo = await api('/promotions', { method: 'POST', body: { name: 'KM 10%', kind: 'order', discount_type: 'percent', discount_value: 10, min_subtotal: 0, active: 1 } });
  ok('promotion create', promo.ok);
  let pv3 = await api('/checkout/preview', { method: 'POST', body: { items: [{ product_id: up.data.id, qty: 2, price: 10000 }] } });
  ok('order promo applied', pv3.data.promo_discount === 2000 && pv3.data.total === 18000);
  await api('/promotions/' + promo.data.id, { method: 'DELETE' });
  ok('promotion delete', (await api('/promotions')).data.every((p) => p.id !== promo.data.id));

  // ---------- Đơn treo ----------
  let ho = await api('/held-orders', { method: 'POST', body: { cart: [{ product_id: up.data.id, qty: 1, price: 10000 }], label: 'Khách A' } });
  ok('held order create', ho.ok && /^DT/.test(ho.data.code));
  ok('held list', (await api('/held-orders')).data.length >= 1);
  ok('held get cart', (await api('/held-orders/' + ho.data.id)).data.cart.length === 1);
  ok('held delete', (await api('/held-orders/' + ho.data.id, { method: 'DELETE' })).ok);

  // ---------- Nhập hàng ----------
  const beforeStock = (await api('/products/' + up.data.id)).data.stock;
  let pu = await api('/purchases', { method: 'POST', body: { supplier_name: 'NCC Test', items: [{ product_id: up.data.id, qty: 10, cost_price: 5000 }] } });
  ok('purchase draft', pu.ok && pu.data.status === 'draft' && pu.data.total === 50000);
  await api('/purchases/' + pu.data.id + '/receive', { method: 'POST' });
  let afterPu = (await api('/products/' + up.data.id)).data;
  ok('purchase receive stock & cost', afterPu.stock === beforeStock + 10 && afterPu.cost_price === 5000);
  ok('purchase cancel', (await api('/purchases/' + pu.data.id + '/cancel', { method: 'POST' })).ok);
  ok('purchase cancel restores stock', (await api('/products/' + up.data.id)).data.stock === beforeStock);

  // ---------- Kiểm kho ----------
  let ck = await api('/stock-checks', { method: 'POST', body: { scope: 'all', note: 'test' } });
  ok('stock check create', ck.ok && ck.data.items.length > 0 && ck.data.status === 'draft');
  const ckItem = ck.data.items.find((i) => i.product_id === up.data.id) || ck.data.items[0];
  const ckSys = ckItem.system_qty;
  await api('/stock-checks/' + ck.data.id, { method: 'PUT', body: { items: [{ id: ckItem.id, counted_qty: ckSys + 5 }] } });
  let ckDone = await api('/stock-checks/' + ck.data.id + '/complete', { method: 'POST' });
  ok('stock check complete', ckDone.ok && ckDone.data.status === 'completed');
  ok('stock check adjusts stock', (await api('/products/' + ckItem.product_id)).data.stock === ckSys + 5);

  // ---------- Đổi trả hàng ----------
  let saleInv = await api('/invoices', { method: 'POST', body: { items: [{ product_id: up.data.id, qty: 2, price: 20000 }], payment_method: 'cash', paid_amount: 40000 } });
  const stockBeforeReturn = (await api('/products/' + up.data.id)).data.stock;
  let ret = await api('/invoices/' + saleInv.data.id + '/returnable');
  ok('returnable info', ret.ok && ret.data.items[0].returnable_base_qty === 2);
  let retInv = await api('/invoices', { method: 'POST', body: { type: 'return', parent_id: saleInv.data.id, items: [{ product_id: up.data.id, qty: 1, price: 20000 }], payment_method: 'cash' } });
  ok('return invoice + refund', retInv.ok && retInv.data.type === 'return' && retInv.data.payments[0].amount === -20000);
  ok('return restores stock', (await api('/products/' + up.data.id)).data.stock === stockBeforeReturn + 1);

  // ---------- Thanh toán hỗn hợp ----------
  let mix = await api('/invoices', { method: 'POST', body: { items: [{ product_id: up.data.id, qty: 1, price: 10000 }], payment_method: 'mixed', payments: [{ method: 'cash', amount: 6000 }, { method: 'transfer', amount: 4000 }] } });
  ok('mixed payment', mix.ok && mix.data.payment_method === 'mixed' && mix.data.payments.length === 2);

  // ---------- Mã vạch nội bộ & tra cứu ----------
  const chk13 = (c) => { let sum = 0; for (let i = 0; i < 12; i++) sum += Number(c[i]) * (i % 2 === 0 ? 1 : 3); return (10 - (sum % 10)) % 10; };
  const genBc = await api('/barcodes/next');
  ok('internal barcode reserved', genBc.ok && /^2\d{12}$/.test(genBc.data.code));
  ok('internal barcode valid EAN-13', Number(genBc.data.code[12]) === chk13(genBc.data.code));
  const nb = await api('/products', { method: 'POST', body: { name: 'SP không mã', sell_price: 15000, stock: 5 } });
  ok('product without barcode', nb.ok && !nb.data.barcode);
  const genr = await api('/products/barcodes/generate', { method: 'POST', body: { include_units: true } });
  ok('bulk generate barcodes', genr.ok && genr.data.products >= 1);
  const nb2 = (await api('/products/' + nb.data.id)).data;
  ok('product got internal barcode', /^2\d{12}$/.test(nb2.barcode) && Number(nb2.barcode[12]) === chk13(nb2.barcode));
  await api('/settings', { method: 'PUT', body: { online_lookup: '0' } });
  ok('lookup disabled rejected', !(await api('/barcode-lookup/1234567890123')).ok);
  await api('/settings', { method: 'PUT', body: { online_lookup: '1' } });
  ok('lookup invalid code rejected', !(await api('/barcode-lookup/abc')).ok);

  // ---------- Sao lưu & phục hồi ----------
  const bkNow = await api('/backup/now', { method: 'POST' });
  ok('backup now', bkNow.ok && /^pos-\d{8}-\d{6}\.db$/.test(bkNow.data.name));
  const bkList = await api('/backups');
  ok('backup list', bkList.ok && bkList.data.items.length >= 1 && bkList.data.enabled === true);
  const bkName = bkList.data.items[0].name;
  const bkDl = await req('admin', '/backups/' + bkName + '/download');
  ok('backup download', bkDl.status === 200 && Number(bkDl.headers.get('content-length') || 0) > 0);
  const bkStage = await api('/backups/' + bkName + '/restore', { method: 'POST' });
  ok('backup restore staged', bkStage.ok && bkStage.data.staged === true);
  ok('backup invalid name rejected', !(await api('/backups/nope.db/restore', { method: 'POST' })).ok);
  const trav = await req('admin', '/backups/..%2Fpos.db/download');
  ok('backup path traversal blocked', trav.status === 404);

  // ---------- Thông tin & báo cáo mở rộng ----------
  ok('info endpoint', (await api('/info')).data.urls.length >= 1);
  ok('inventory report', (await api('/reports/inventory')).data.items.length > 0);
  ok('slow-moving report', Array.isArray((await api('/reports/slow-moving')).data));
  ok('search by sku', (await api('/products?q=SP0001')).data.some((x) => x.sku === 'SP0001'));
  const csvRes = await req('admin', '/reports/export?type=sales');
  ok('csv export', csvRes.status === 200 && /text\/csv/.test(csvRes.headers.get('content-type') || ''));

  // ---------- VietQR động & callback ----------
  const vset = await api('/settings', { method: 'PUT', body: { vqr_enabled: '1', vqr_env: 'mock', bank_account: '99990001', bank_name: 'MB Bank', bank_bin: '970422', account_holder: 'NGUYEN VAN A' } });
  ok('enable vietqr', vset.ok && vset.data.vqr_enabled === '1');
  ok('vietqr config enabled', (await api('/vietqr/config')).data.enabled === true);
  ok('vietqr test endpoint (mock)', (await api('/vietqr/test', { method: 'POST' })).data.qr_ok === true);
  ok('simulate-dev rejected in mock', !(await api('/vietqr/simulate-dev', { method: 'POST', body: { invoice_id: 1 } })).ok);
  const t1 = await api('/invoices', { method: 'POST', body: { items: [{ product_id: 2, qty: 2 }], payment_method: 'transfer' } });
  ok('transfer invoice has payment_ref', t1.ok && t1.data.status === 'pending' && /^P\d{10}$/.test(t1.data.payment_ref));
  const dyn = await api(`/invoices/${t1.data.id}/vietqr`, { method: 'POST' });
  ok('dynamic QR generated (mock)', dyn.ok && String(dyn.data.qrDataUrl).startsWith('data:image/png') && dyn.data.mock === true);
  ok('payment status pending', (await api(`/invoices/${t1.data.id}/payment-status`)).data.status === 'pending');
  const sim = await api('/vietqr/simulate', { method: 'POST', body: { invoice_id: t1.data.id } });
  ok('simulate marks paid', sim.ok && sim.data.paid === true);
  ok('invoice paid after simulate', (await api(`/invoices/${t1.data.id}/payment-status`)).data.paid === true);
  ok('simulate records one payment', (await api(`/invoices/${t1.data.id}`)).data.payments.length === 1);

  // Webhook VietQR gọi vào
  const t2 = await api('/invoices', { method: 'POST', body: { items: [{ product_id: 3, qty: 4 }], payment_method: 'transfer' } });
  const tokenRes = await fetch(ROOT + '/vqr/api/token_generate', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from('posshop:posshop-secret').toString('base64') } });
  const tok = await tokenRes.json();
  ok('webhook get token', tokenRes.status === 200 && !!tok.access_token && tok.token_type === 'Bearer' && tok.expires_in === 300);
  const syncBody = { bankaccount: '99990001', amount: t2.data.total, content: t2.data.payment_ref, orderId: t2.data.payment_ref, transactionid: 'TEST-TXN-1', transType: 'C' };
  const syncHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token };
  const sync1 = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: syncHeaders, body: JSON.stringify(syncBody) })).json();
  ok('webhook sync ok', sync1.error === false && sync1.object.reftransactionid === t2.data.payment_ref);
  ok('invoice paid via webhook', (await api(`/invoices/${t2.data.id}/payment-status`)).data.paid === true);
  const sync2 = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: syncHeaders, body: JSON.stringify(syncBody) })).json();
  ok('webhook idempotent', sync2.error === false && /đã xử lý/.test(sync2.toastMessage));
  ok('no duplicate payment', (await api(`/invoices/${t2.data.id}`)).data.payments.length === 1);

  // Số tiền không khớp -> không tự xác nhận
  const t3 = await api('/invoices', { method: 'POST', body: { items: [{ product_id: 2, qty: 1 }], payment_method: 'transfer' } });
  const syncBad = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: syncHeaders, body: JSON.stringify({ ...syncBody, orderId: t3.data.payment_ref, content: t3.data.payment_ref, transactionid: 'TEST-TXN-2', amount: 1000 }) })).json();
  ok('webhook mismatch not auto-paid', /không khớp/.test(syncBad.toastMessage) && (await api(`/invoices/${t3.data.id}/payment-status`)).data.paid === false);
  ok('webhook bad token 401', (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad' }, body: '{}' })).status === 401);
  ok('webhook bad basic auth', (await fetch(ROOT + '/vqr/api/token_generate', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from('x:y').toString('base64') } })).status === 401);
  // Mỗi shop một Basic Auth riêng (mô hình tiền về tài khoản từng shop)
  const exposed = await api('/settings', { method: 'PUT', body: { vqr_enabled: '1', vqr_env: 'mock', vqr_exposed_username: 'shopA', vqr_exposed_password: 'secretA' } });
  ok('set per-shop exposed creds', exposed.ok && exposed.data.vqr_exposed_username === 'shopA');
  const t4 = await api('/invoices', { method: 'POST', body: { items: [{ product_id: 2, qty: 1 }], payment_method: 'transfer' } });
  const tokA = await (await fetch(ROOT + '/vqr/api/token_generate', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from('shopA:secretA').toString('base64') } })).json();
  ok('per-shop token issued', !!tokA.access_token);
  const syncA = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokA.access_token }, body: JSON.stringify({ bankaccount: 'ACCOUNT-KHAC', amount: t4.data.total, content: t4.data.payment_ref, orderId: t4.data.payment_ref, transactionid: 'TENANT-TXN-1', transType: 'C' }) })).json();
  ok('per-shop token resolves tenant', syncA.error === false && (await api(`/invoices/${t4.data.id}/payment-status`)).data.paid === true);
  await api('/settings', { method: 'PUT', body: { vqr_enabled: '0' } });

  // ---------- Nhà cung cấp & công nợ ----------
  const sup = await api('/suppliers', { method: 'POST', body: { name: 'NCC Test', tax_code: '0311112222', payment_terms_days: 10 } });
  ok('supplier with fields', sup.ok && sup.data.tax_code === '0311112222' && sup.data.payment_terms_days === 10);
  const pu2 = await api('/purchases', { method: 'POST', body: { supplier_id: sup.data.id, items: [{ product_id: 2, qty: 10, cost_price: 5000 }] } });
  await api('/purchases/' + pu2.data.id + '/receive', { method: 'POST' });
  let pay = (await api('/suppliers/payables')).data.find((x) => x.id === sup.data.id);
  ok('payable after receive', pay && pay.purchased === 50000 && pay.paid === 0 && pay.balance === 50000);
  await api('/suppliers/' + sup.data.id + '/payments', { method: 'POST', body: { amount: 20000, method: 'cash' } });
  pay = (await api('/suppliers/payables')).data.find((x) => x.id === sup.data.id);
  ok('payable after payment', pay && pay.paid === 20000 && pay.balance === 30000);
  ok('supplier payments list', (await api('/suppliers/' + sup.data.id + '/payments')).data.length === 1);

  // ---------- Phân tích thông minh ----------
  const ana = await api('/reports/analytics');
  ok('analytics endpoint', ana.ok && Array.isArray(ana.data.abc) && Array.isArray(ana.data.reorder) && Array.isArray(ana.data.basket) && typeof ana.data.cancelled === 'number');

  // ---------- VAT ----------
  await api('/settings', { method: 'PUT', body: { vat_mode: 'inclusive' } });
  const vp = await api('/products', { method: 'POST', body: { name: 'SP VAT 10', sell_price: 11000, cost_price: 9000, vat_rate: 10, stock: 10 } });
  ok('product has vat_rate', vp.ok && Number(vp.data.vat_rate) === 10);
  const vinv = await api('/invoices', { method: 'POST', body: { items: [{ product_id: vp.data.id, qty: 1 }], payment_method: 'cash', paid_amount: 20000 } });
  ok('inclusive VAT computed', vinv.data.total === 11000 && vinv.data.net_amount === 10000 && vinv.data.vat_amount === 1000);
  ok('tax lines by rate', vinv.data.tax_lines.length === 1 && vinv.data.tax_lines[0].rate === 10 && vinv.data.tax_lines[0].tax_amount === 1000);
  await api('/settings', { method: 'PUT', body: { vat_mode: 'exclusive' } });
  const vinv2 = await api('/invoices', { method: 'POST', body: { items: [{ product_id: vp.data.id, qty: 1 }], payment_method: 'cash', paid_amount: 20000 } });
  ok('exclusive VAT added', vinv2.data.net_amount === 11000 && vinv2.data.vat_amount === 1100 && vinv2.data.total === 12100);
  const vrep = await api('/reports/vat');
  ok('vat report output', vrep.ok && vrep.data.output_tax >= 2100);
  await api('/settings', { method: 'PUT', body: { vat_mode: 'inclusive' } });

  // ---------- Phân quyền ----------
  ok('create cashier', (await api('/users', { method: 'POST', body: { username: 'thungan', password: '123456', role: 'cashier' } })).ok);
  let cl = await req('cash', '/auth/login', { method: 'POST', body: { username: 'thungan', password: '123456' } });
  cl = await cl.json();
  ok('cashier login perms', cl.ok && cl.data.permissions.includes('pos.sell') && !cl.data.permissions.includes('report.profit'));
  const cprod = await (await req('cash', '/products')).json();
  ok('cashier cannot see cost', cprod.ok && !('cost_price' in cprod.data[0]));
  const crep = await (await req('cash', '/reports/summary')).json();
  ok('cashier cannot see profit', crep.ok && !('profit' in crep.data));
  ok('cashier blocked from settings', !(await (await req('cash', '/settings', { method: 'PUT', body: { shop_name: 'x' } })).json()).ok);
  ok('owner can list users', (await api('/users')).ok && (await api('/users')).data.length >= 2);

  // ---------- Cách ly cửa hàng ----------
  await req('root', '/auth/login', { method: 'POST', body: { username: 'root', password: 'root123' } });
  const newT = await (await req('root', '/platform/tenants', { method: 'POST', body: { code: 'iso-shop', name: 'Shop Cách Ly', owner_username: 'isoadmin', owner_password: '123456' } })).json();
  ok('platform creates tenant', newT.ok && newT.data.code === 'iso-shop');
  let il = await req('iso', '/auth/login', { method: 'POST', body: { username: 'isoadmin', password: '123456' } });
  il = await il.json();
  ok('new tenant login', il.ok && il.data.tenant.code === 'iso-shop');
  const isoProducts = await (await req('iso', '/products')).json();
  ok('tenant isolation (new shop has no data)', isoProducts.ok && isoProducts.data.length === 0);
  const defProducts = await api('/products');
  ok('default tenant still has data', defProducts.data.length > 0);
  const plansRes = await (await req('root', '/platform/plans')).json();
  ok('platform plans list', plansRes.ok && plansRes.data.length >= 3);
  await req('root', '/platform/tenants', { method: 'POST', body: { code: 'exp-shop', name: 'Shop Het Han', owner_username: 'expadmin', owner_password: '123456', expires_at: '2000-01-01 00:00:00' } });
  const expLogin = await (await req('exp', '/auth/login', { method: 'POST', body: { username: 'expadmin', password: '123456' } })).json();
  ok('expired tenant blocked', !expLogin.ok);

  for (const f of ['/', '/style.css', '/js/app.js', '/js/util.js', '/js/views/pos.js', '/favicon.svg']) ok('static ' + f, (await fetch(ROOT + f)).status === 200);
  console.log(R.join('\n'));
  const pass = R.filter((x) => x.startsWith('PASS')).length;
  console.log(`\n${pass}/${R.length} passed`);
  process.exit(pass === R.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
