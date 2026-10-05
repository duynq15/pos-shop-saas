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
  ok('excel export', csvRes.status === 200 && /spreadsheetml\.sheet/.test(csvRes.headers.get('content-type') || '') && /\.xlsx/.test(csvRes.headers.get('content-disposition') || ''));

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
  const vr = await api('/reports/vietqr');
  ok('vietqr transactions report', vr.ok && Array.isArray(vr.data.items) && Array.isArray(vr.data.orders) && vr.data.summary.count >= 1);

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

  // Webhook định tuyến theo SỐ TÀI KHOẢN (khi 1 tài khoản VietQR phục vụ nhiều shop)
  await req('iso', '/settings', { method: 'PUT', body: { bank_account: 'BANKISO' } });
  const isoInv = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Hàng test', price: 1000, qty: 1 }], payment_method: 'transfer' } })).json();
  ok('iso-shop transfer invoice', isoInv.ok && isoInv.data.status === 'pending');
  const tokRoute = await (await fetch(ROOT + '/vqr/api/token_generate', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from('shopA:secretA').toString('base64') } })).json();
  const syncRoute = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokRoute.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 1000, content: isoInv.data.payment_ref, orderId: isoInv.data.payment_ref, transactionid: 'ROUTE-1', transType: 'C' }) })).json();
  const isoStatus = await (await req('iso', '/invoices/' + isoInv.data.id + '/payment-status')).json();
  ok('GĐ3.0: tenant token cannot book into another tenant', syncRoute.errorReason === 'TENANT_MISMATCH' && isoStatus.data.paid === false);
  // Token dùng chung của nền tảng vẫn định tuyến theo số tài khoản
  const syncRouteG = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 1000, content: isoInv.data.payment_ref, orderId: isoInv.data.payment_ref, transactionid: 'ROUTE-1G', transType: 'C' }) })).json();
  const isoStatusG = await (await req('iso', '/invoices/' + isoInv.data.id + '/payment-status')).json();
  ok('webhook routes by bank account (platform token)', syncRouteG.error === false && isoStatusG.data.paid === true);
  // GĐ3.4 (ERR-02): cùng mã giao dịch gửi đồng thời chỉ ghi một dòng, hóa đơn chỉ có một lần thanh toán
  const dupInv = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Dup', price: 3000, qty: 1 }], payment_method: 'transfer' } })).json();
  const dupBody = JSON.stringify({ bankaccount: 'BANKISO', amount: 3000, content: dupInv.data.payment_ref, orderId: dupInv.data.payment_ref, transactionid: 'DUP-RACE', transType: 'C' });
  await Promise.all([1, 2, 3, 4].map(() => fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: dupBody })));
  const dupTx = (await (await req('iso', '/reports/vietqr?from=2000-01-01&to=2999-12-31&q=DUP-RACE')).json()).data;
  ok('ERR-02: concurrent duplicate webhook stored once', dupTx.items.filter((x) => x.transactionid === 'DUP-RACE').length === 1);
  ok('FR-08: matched invoice payment classified as sale', (await (await req('iso', '/vietqr/transactions?from=2000-01-01&to=2999-12-31&q=DUP-RACE')).json()).data.items[0].category === 'sale');
  const dupPays = (await (await req('iso', '/invoices/' + dupInv.data.id)).json()).data.payments || [];
  ok('ERR-02: invoice paid once', dupPays.length === 1);
  const noIdInv = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'NoId', price: 4000, qty: 1 }], payment_method: 'transfer' } })).json();
  await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 4000, content: noIdInv.data.payment_ref, orderId: noIdInv.data.payment_ref, transType: 'C' }) });
  ok('ERR-02: webhook without transactionid does not mark invoice paid', (await (await req('iso', '/invoices/' + noIdInv.data.id + '/payment-status')).json()).data.paid === false);
  // Tiền về cho hóa đơn đã hủy / đã thanh toán: không đổi hóa đơn, không tính doanh thu, vào hàng chờ
  {
    const cInv = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Hủy', price: 2500, qty: 1 }], payment_method: 'transfer' } })).json();
    await req('iso', '/invoices/' + cInv.data.id + '/cancel', { method: 'POST', body: { reason: 'khách đổi ý' } });
    await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 2500, content: cInv.data.payment_ref, orderId: cInv.data.payment_ref, transactionid: 'LATE-CANCEL', transType: 'C' }) });
    ok('payment after cancel does not revive the invoice', (await (await req('iso', '/invoices/' + cInv.data.id)).json()).data.status === 'cancelled');
    await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 3000, content: dupInv.data.payment_ref, orderId: dupInv.data.payment_ref, transactionid: 'PAID-TWICE', transType: 'C' }) });
    const q0 = (await (await req('iso', '/vietqr/unclassified')).json()).data.items.map((x) => x.transactionid);
    ok('late or second payment goes to the queue, not sales', q0.includes('LATE-CANCEL') && q0.includes('PAID-TWICE'));
    for (const id of ['LATE-CANCEL', 'PAID-TWICE']) {
      const row = (await (await req('iso', '/vietqr/unclassified')).json()).data.items.find((x) => x.transactionid === id);
      await req('iso', '/vietqr/transactions/' + row.id + '/classify', { method: 'POST', body: { category: 'other', reason: 'Sẽ hoàn tiền cho khách' } });
    }
  }

  // ---------- GĐ3.2: hàng chờ phân loại (ERR-03) ----------
  const qInv = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Chờ khớp', price: 8800, qty: 1 }], payment_method: 'transfer' } })).json();
  await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 8800, content: 'chuyen tien quen ghi ma', transType: 'C', transactionid: 'Q-1' }) });
  await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 1234, content: 'tien la', transType: 'C', transactionid: 'Q-2' }) });
  const queue = (await (await req('iso', '/vietqr/unclassified')).json()).data;
  const q1 = queue.items.find((x) => x.transactionid === 'Q-1'); const q2 = queue.items.find((x) => x.transactionid === 'Q-2');
  ok('ERR-03: unmatched payments land in the queue', !!q1 && !!q2 && queue.invoices.some((i) => i.id === qInv.data.id));
  const sumBefore = (await (await req('iso', '/reports/summary?from=2000-01-01&to=2999-12-31')).json()).data;
  ok('ERR-03: queued payment does not mark the invoice paid', (await (await req('iso', '/invoices/' + qInv.data.id + '/payment-status')).json()).data.paid === false);
  ok('classify: amount must match the invoice', !(await (await req('iso', '/vietqr/transactions/' + q2.id + '/classify', { method: 'POST', body: { invoice_id: qInv.data.id } })).json()).ok);
  const cls = await (await req('iso', '/vietqr/transactions/' + q1.id + '/classify', { method: 'POST', body: { invoice_id: qInv.data.id } })).json();
  ok('classify: attach to pending invoice marks it paid', cls.ok && cls.data.category === 'sale' && (await (await req('iso', '/invoices/' + qInv.data.id + '/payment-status')).json()).data.paid === true);
  const sumAfter = (await (await req('iso', '/reports/summary?from=2000-01-01&to=2999-12-31')).json()).data;
  ok('classify: revenue counts only after classification', JSON.stringify(sumAfter) !== JSON.stringify(sumBefore));
  ok('classify: cannot classify twice', !(await (await req('iso', '/vietqr/transactions/' + q1.id + '/classify', { method: 'POST', body: { category: 'other', reason: 'x' } })).json()).ok);
  ok('classify: other needs a reason', !(await (await req('iso', '/vietqr/transactions/' + q2.id + '/classify', { method: 'POST', body: { category: 'other' } })).json()).ok);
  ok('classify: mark as other income', (await (await req('iso', '/vietqr/transactions/' + q2.id + '/classify', { method: 'POST', body: { category: 'other', reason: 'Khách trả nợ cũ' } })).json()).data.category === 'other');
  ok('classify: queue drained', !(await (await req('iso', '/vietqr/unclassified')).json()).data.items.some((x) => ['Q-1', 'Q-2'].includes(x.transactionid)));

  // Định tuyến theo orderId (bản đồ QR) khi tiền về một tài khoản chung
  await req('iso', '/settings', { method: 'PUT', body: { vqr_enabled: '1', vqr_env: 'mock', bank_account: 'BANKISO' } });
  const isoInv2 = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Hàng test 2', price: 2000, qty: 1 }], payment_method: 'transfer' } })).json();
  await req('iso', '/invoices/' + isoInv2.data.id + '/vietqr', { method: 'POST' });
  const syncRoute2 = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'ACCOUNT-KHAC', amount: 2000, content: isoInv2.data.payment_ref, orderId: isoInv2.data.payment_ref, transactionid: 'ROUTE-2', transType: 'C' }) })).json();
  const isoStatus2 = await (await req('iso', '/invoices/' + isoInv2.data.id + '/payment-status')).json();
  ok('webhook routes by orderId map (shared account)', syncRoute2.error === false && isoStatus2.data.paid === true);

  const gA = await api('/invoices', { method: 'POST', body: { items: [{ name: 'g', price: 100, qty: 1 }], payment_method: 'cash' } });
  const gB = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'g', price: 100, qty: 1 }], payment_method: 'cash' } })).json();
  ok('payment_ref globally unique', gA.ok && gB.ok && gA.data.payment_ref !== gB.data.payment_ref);

  // Đối chiếu: QR đã tạo (đã thanh toán) và QR chờ thanh toán đều hiển thị
  const isoInv3 = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Chờ TT', price: 5000, qty: 1 }], payment_method: 'transfer' } })).json();
  await req('iso', '/invoices/' + isoInv3.data.id + '/vietqr', { method: 'POST' });
  const rq = await (await req('iso', '/reports/vietqr?from=2000-01-01&to=2999-12-31')).json();
  const roPaid = (rq.data.orders || []).find((o) => o.order_id === isoInv2.data.payment_ref);
  const roPending = (rq.data.orders || []).find((o) => o.order_id === isoInv3.data.payment_ref);
  ok('vietqr reconcile: paid QR flagged', !!roPaid && roPaid.paid === true && Number(roPaid.amount) === 2000);
  ok('vietqr reconcile: pending QR flagged', !!roPending && roPending.paid === false && rq.data.summary.pending_count >= 1);

  // Module Giao dịch VietQR (hợp nhất QR + callback)
  const vt = await (await req('iso', '/vietqr/transactions?from=2000-01-01&to=2999-12-31')).json();
  ok('vietqr module list', vt.ok && Array.isArray(vt.data.items) && typeof vt.data.summary.total_count === 'number');
  ok('vietqr module statuses', (vt.data.items || []).some((r) => r.status === 'success') && (vt.data.items || []).some((r) => r.status === 'pending') && typeof vt.data.summary.refund_count === 'number');
  const vtPend = await (await req('iso', '/vietqr/transactions?from=2000-01-01&to=2999-12-31&status=pending')).json();
  ok('vietqr module filter pending', (vtPend.data.items || []).length >= 1 && (vtPend.data.items || []).every((r) => r.status === 'pending'));
  const plansRes = await (await req('root', '/platform/plans')).json();
  ok('platform plans list', plansRes.ok && plansRes.data.length >= 3);
  const pvGet = await (await req('root', '/platform/vietqr')).json();
  ok('platform vietqr get', pvGet.ok && typeof pvGet.data.vqr_env === 'string');
  const pvPut = await (await req('root', '/platform/vietqr', { method: 'PUT', body: { vqr_env: 'mock', vqr_username: 'shared', vqr_password: 'sharedpass' } })).json();
  ok('platform vietqr save', pvPut.ok && pvPut.data.has_password === true);
  ok('shop inherits shared vietqr creds', (await api('/vietqr/config')).data.has_credentials === true);
  const preport = await (await req('root', '/platform/reports')).json();
  ok('platform per-store report', preport.ok && Array.isArray(preport.data.rows) && preport.data.rows.length >= 1);

  // ---------- Báo cáo thống kê giao dịch công khai ----------
  const pr = await (await req('root', '/platform/public-report', { method: 'PUT', body: { enabled: true } })).json();
  ok('public report enabled', pr.ok && pr.data.enabled === true && /^[a-f0-9]{32}$/.test(pr.data.token));
  const pubTok = pr.data.token;
  const pageRes = await fetch(ROOT + '/r/' + pubTok);
  ok('public report page served', pageRes.status === 200 && /text\/html/.test(pageRes.headers.get('content-type') || ''));
  const pub = await (await fetch(ROOT + '/public/api/report/' + pubTok + '?from=2000-01-01&to=2999-12-31')).json();
  ok('public report data', pub.ok && typeof pub.data.totals.value === 'number' && typeof pub.data.totals.txns === 'number' && Array.isArray(pub.data.partners) && Array.isArray(pub.data.by_day) && Array.isArray(pub.data.groups) && Array.isArray(pub.data.areas));
  const pubJson = JSON.stringify(pub.data);
  ok('public report hides profit/cost', pubJson.indexOf('profit') === -1 && pubJson.indexOf('cost') === -1);
  const grpRes = await fetch(ROOT + '/public/api/report/' + pubTok + '/groups.xlsx?from=2000-01-01&to=2999-12-31');
  ok('public report groups export', grpRes.status === 200 && /spreadsheetml\.sheet/.test(grpRes.headers.get('content-type') || ''));
  ok('public report bad token 404', (await fetch(ROOT + '/public/api/report/deadbeef')).status === 404);
  const prOff = await (await req('root', '/platform/public-report', { method: 'PUT', body: { enabled: false } })).json();
  ok('public report disabled 404', prOff.ok && (await fetch(ROOT + '/public/api/report/' + pubTok)).status === 404);
  await req('root', '/platform/tenants', { method: 'POST', body: { code: 'exp-shop', name: 'Shop Het Han', owner_username: 'expadmin', owner_password: '123456', expires_at: '2000-01-01 00:00:00' } });
  const expLogin = await (await req('exp', '/auth/login', { method: 'POST', body: { username: 'expadmin', password: '123456' } })).json();
  ok('expired tenant blocked', !expLogin.ok);

  // ---------- Cộng đồng (GĐ1.1–1.2, NFR-05) + chặn tài khoản chung (GĐ0.2 — BR-02, FR-05, SEC-01) ----------
  const rootJ = async (u, o) => (await req('root', u, o)).json();
  ok('alerts: tenant endpoint for owner', (await (await req('iso', '/alerts')).json()).ok === true);
  ok('alerts: platform endpoint + manual run', (await rootJ('/platform/alerts/run', { method: 'POST' })).ok && Array.isArray((await rootJ('/platform/alerts')).data));
  {
    const lat0 = await rootJ('/platform/latency');
    ok('latency: no bank_time yet -> nothing measured', lat0.ok && lat0.data.measured === 0);
    const inv = await (await req('iso', '/invoices', { method: 'POST', body: { items: [{ name: 'Lat', price: 1500, qty: 1 }], payment_method: 'transfer' } })).json();
    const sent = new Date(Date.now() - 42000).toISOString();
    await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: 'BANKISO', amount: 1500, content: inv.data.payment_ref, orderId: inv.data.payment_ref, transactionid: 'LAT-1', transType: 'C', transactiontime: sent }) });
    const lat = await rootJ('/platform/latency');
    ok('AC-01-3: latency measured from bank time', lat.data.measured === 1 && lat.data.p95 >= 40 && lat.data.p95 <= 60 && lat.data.within_60s === 100, JSON.stringify(lat.data));
  }
  const com = await rootJ('/platform/communities', { method: 'POST', body: { code: 'thon-a', name: 'Thôn A', type: 'village', area: 'Xã X' } });
  ok('community create (type village)', com.ok && com.data.type === 'village' && com.data.status === 'active');
  ok('community dup code rejected', !(await rootJ('/platform/communities', { method: 'POST', body: { code: 'thon-a', name: 'Trùng', type: 'village' } })).ok);
  ok('community bad type rejected', !(await rootJ('/platform/communities', { method: 'POST', body: { code: 'cho-b', name: 'Chợ B', type: 'no-such-type' } })).ok);
  ok('community update', (await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { name: 'Thôn A mới' } })).data.name === 'Thôn A mới');
  ok('tenant bad kind rejected', !(await rootJ('/platform/tenants', { method: 'POST', body: { code: 'bad-kind', name: 'x', owner_username: 'badkind', owner_password: '123456', kind: 'xyz' } })).ok);
  ok('seller without community rejected', !(await rootJ('/platform/tenants', { method: 'POST', body: { code: 'no-com', name: 'x', owner_username: 'nocom', owner_password: '123456', kind: 'seller' } })).ok);
  ok('tenant unknown community rejected', !(await rootJ('/platform/tenants', { method: 'POST', body: { code: 'no-com', name: 'x', owner_username: 'nocom', owner_password: '123456', kind: 'seller', community_id: 99999 } })).ok);
  const sel = await rootJ('/platform/tenants', { method: 'POST', body: { code: 'seller-a', name: 'Người bán A', owner_username: 'sellera', owner_password: '123456', kind: 'seller', community_id: com.data.id } });
  ok('seller tenant in community', sel.ok && sel.data.kind === 'seller' && sel.data.community_id === com.data.id);
  ok('old tenant defaults kind=shop', (await rootJ('/platform/tenants')).data.find((t) => t.code === 'iso-shop').kind === 'shop');
  await req('sel', '/auth/login', { method: 'POST', body: { username: 'sellera', password: '123456' } });
  const defAcc = (await api('/settings')).data.bank_account;
  ok('BR-02: seller cannot reuse another shop account', !(await (await req('sel', '/settings', { method: 'PUT', body: { bank_account: defAcc } })).json()).ok);
  ok('BR-02: formatting does not bypass check', !(await (await req('sel', '/settings', { method: 'PUT', body: { bank_account: defAcc.slice(0, 4) + ' ' + defAcc.slice(4) } })).json()).ok);
  const selSet = await (await req('sel', '/settings', { method: 'PUT', body: { bank_account: 'SELLERA01', vqr_enabled: '1', vqr_env: 'mock' } })).json();
  ok('BR-02: seller saves own account', selSet.ok && selSet.data.bank_account === 'SELLERA01');
  ok('BR-02: shop cannot reuse community tenant account', !(await api('/settings', { method: 'PUT', body: { bank_account: 'SELLERA01' } })).ok);
  ok('BR-02: other settings still saved without bank_account', (await (await req('sel', '/settings', { method: 'PUT', body: { shop_name: 'Quán A' } })).json()).ok);
  const selInv = await (await req('sel', '/invoices', { method: 'POST', body: { items: [{ name: 'Rau', price: 3000, qty: 1 }], payment_method: 'transfer' } })).json();
  const selQr = await (await req('sel', '/invoices/' + selInv.data.id + '/vietqr', { method: 'POST' })).json();
  ok('seller with own account creates VietQR', selQr.ok && !!selQr.data.payment_ref);
  ok('kind=shop: two shops may share account (old behaviour)', (await (await req('iso', '/settings', { method: 'PUT', body: { bank_account: defAcc } })).json()).ok);
  const assign = await rootJ('/platform/tenants/' + newT.data.id, { method: 'PUT', body: { kind: 'seller', community_id: com.data.id } });
  ok('BR-02: cannot join community while sharing account', !assign.ok && /BR-02/.test(assign.error || ''));
  await req('iso', '/settings', { method: 'PUT', body: { bank_account: 'BANKISO' } });
  const assign2 = await rootJ('/platform/tenants/' + newT.data.id, { method: 'PUT', body: { kind: 'seller', community_id: com.data.id } });
  ok('join community with own account', assign2.ok && assign2.data.community_id === com.data.id);
  ok('community lists tenant count', (await rootJ('/platform/communities')).data.find((c) => c.id === com.data.id).tenant_count === 2);
  ok('tenant cannot manage communities', (await req('admin', '/platform/communities')).status === 403);

  // ---------- Vai trò cộng đồng (GĐ1.3 — FR-02, BR-05, SEC-04, BR-09, BR-11) ----------
  await rootJ('/platform/tenants', { method: 'POST', body: { code: 'quy-a', name: 'Quỹ thôn A', owner_username: 'quyaadmin', owner_password: '123456', kind: 'community', community_id: com.data.id } });
  const cLogin = await (await req('cadm', '/auth/login', { method: 'POST', body: { username: 'quyaadmin', password: '123456' } })).json();
  ok('login payload has tenant kind + community', cLogin.data.tenant.kind === 'community' && cLogin.data.tenant.community_id === com.data.id);
  ok('me has tenant kind', (await (await req('cadm', '/auth/me')).json()).data.tenant.kind === 'community');
  const cRoles = (await (await req('cadm', '/roles')).json()).data.map((r) => r.code);
  ok('FR-02: community roles list', ['owner', 'treasurer', 'approver', 'community_leader'].every((r) => cRoles.includes(r)) && !cRoles.includes('cashier'));
  const sRoles = (await api('/roles')).data.map((r) => r.code);
  ok('FR-02: shop roles list excludes community roles', sRoles.includes('cashier') && !sRoles.includes('treasurer'));
  ok('FR-02: shop cannot create treasurer', !(await api('/users', { method: 'POST', body: { username: 'bad-treas', password: '123456', role: 'treasurer' } })).ok);
  ok('FR-02: community cannot create cashier', !(await (await req('cadm', '/users', { method: 'POST', body: { username: 'bad-cash', password: '123456', role: 'cashier' } })).json()).ok);
  const perms = {};
  for (const role of ['treasurer', 'approver', 'community_leader']) {
    const u = await (await req('cadm', '/users', { method: 'POST', body: { username: 'qa-' + role, password: '123456', role } })).json();
    ok('create ' + role, u.ok && u.data.role === role && !!u.data.role_name);
    const l = await (await req('c-' + role, '/auth/login', { method: 'POST', body: { username: 'qa-' + role, password: '123456' } })).json();
    perms[role] = l.data.permissions;
  }
  ok('SEC-04: treasurer cannot approve', perms.treasurer.includes('fund.entry') && !perms.treasurer.includes('fund.approve'));
  ok('BR-05: approver approves, does not enter', perms.approver.includes('fund.approve') && !perms.approver.includes('fund.entry'));
  ok('BR-11: approver manages categories', perms.approver.includes('community.categories'));
  ok('BR-09: leader only aggregate + fund view', perms.community_leader.includes('community.report') && perms.community_leader.includes('fund.view')
    && !['pos.sell', 'report.view', 'fund.entry'].some((p) => perms.community_leader.includes(p)));
  ok('community role cannot sell', (await (await req('c-community_leader', '/invoices', { method: 'POST', body: { items: [{ name: 'x', price: 1000, qty: 1 }] } })).json()).ok === false);
  const leaderId = (await (await req('cadm', '/users')).json()).data.find((u) => u.username === 'qa-community_leader').id;
  ok('FR-02: cannot switch community user to POS role', !(await (await req('cadm', '/users/' + leaderId, { method: 'PUT', body: { role: 'manager' } })).json()).ok);

  // ---------- Sổ quỹ (GĐ2.1–2.2 — FR-12 → FR-15, BR-03, BR-04, BR-05, ERR-06) ----------
  const cj = async (who, u, o) => (await req(who, u, o)).json();
  const fund = await cj('c-approver', '/funds', { method: 'POST', body: { code: 'cong-duc', name: 'Quỹ công đức', kind: 'donation', bank_account: 'QUY-A 001' } });
  ok('fund create (account normalised)', fund.ok && fund.data.bank_account === 'QUYA001' && fund.data.balance === 0);
  ok('fund dup account rejected', !(await cj('cadm', '/funds', { method: 'POST', body: { code: 'quy-2', name: 'Quỹ 2', bank_account: 'QUYA001' } })).ok);
  ok('fund cannot reuse shop account', !(await cj('cadm', '/funds', { method: 'POST', body: { code: 'quy-3', name: 'Quỹ 3', bank_account: 'SELLERA01' } })).ok);
  ok('treasurer cannot create fund', (await req('c-treasurer', '/funds', { method: 'POST', body: { code: 'quy-4', name: 'Quỹ 4' } })).status === 403);
  ok('shop tenant has no fund book', (await req('admin', '/funds')).status === 403 && (await req('admin', '/fund-entries/1/attachment')).status === 403);
  const fid = fund.data.id;
  const cashIn = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 500000, payer_name: 'Ông Ba', note: 'Công đức' } });
  ok('cash in recorded at once', cashIn.ok && cashIn.data.status === 'approved' && /^PT/.test(cashIn.data.code));
  await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 100000, anonymous: true } });
  ok('balance from approved entries', (await cj('c-community_leader', '/funds/' + fid)).data.balance === 600000);
  ok('leader cannot enter', (await req('c-community_leader', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).status === 403);
  ok('approver cannot enter (BR-05)', (await req('c-approver', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).status === 403);
  const receipt = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('chung-tu')]).toString('base64');
  const out = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 200000, note: 'Mua hương', attachment: receipt } });
  ok('out starts as draft', out.ok && out.data.status === 'draft' && /^PC/.test(out.data.code));
  ok('draft cannot be approved', !(await cj('c-approver', '/fund-entries/' + out.data.id + '/approve', { method: 'POST' })).ok);
  ok('submit', (await cj('c-treasurer', '/fund-entries/' + out.data.id + '/submit', { method: 'POST' })).data.status === 'submitted');
  ok('treasurer cannot approve (SEC-04)', (await req('c-treasurer', '/fund-entries/' + out.data.id + '/approve', { method: 'POST' })).status === 403);
  ok('approve', (await cj('c-approver', '/fund-entries/' + out.data.id + '/approve', { method: 'POST' })).data.status === 'approved');
  ok('balance after out', (await cj('cadm', '/funds/' + fid)).data.balance === 400000);
  // Chủ tài khoản có mọi quyền nhưng vẫn không được tự duyệt phiếu mình lập
  const noImg = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000 } });
  ok('ERR-05: expense without receipt cannot be submitted', !(await cj('c-treasurer', '/fund-entries/' + noImg.data.id + '/submit', { method: 'POST' })).ok);
  ok('draft editable only by creator', (await req('c-approver', '/fund-entries/' + noImg.data.id, { method: 'PATCH', body: { note: 'x' } })).status === 403
    && !(await cj('cadm', '/fund-entries/' + noImg.data.id, { method: 'PATCH', body: { note: 'x' } })).ok);
  const fixed = await cj('c-treasurer', '/fund-entries/' + noImg.data.id, { method: 'PATCH', body: { amount: 2000, attachment: receipt } });
  ok('creator adds receipt to own draft', fixed.ok && fixed.data.amount === 2000 && !!fixed.data.attachment);
  ok('draft with receipt can be submitted', (await cj('c-treasurer', '/fund-entries/' + noImg.data.id + '/submit', { method: 'POST' })).data.status === 'submitted');
  ok('submitted entry no longer editable', !(await cj('c-treasurer', '/fund-entries/' + noImg.data.id, { method: 'PATCH', body: { amount: 1 } })).ok);
  await cj('c-approver', '/fund-entries/' + noImg.data.id + '/reject', { method: 'POST', body: { reason: 'Test' } });
  const own = await cj('cadm', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, attachment: receipt } });
  await cj('cadm', '/fund-entries/' + own.data.id + '/submit', { method: 'POST' });
  ok('ERR-06: creator cannot approve own entry', (await req('cadm', '/fund-entries/' + own.data.id + '/approve', { method: 'POST' })).status === 403);
  ok('reject needs reason', !(await cj('c-approver', '/fund-entries/' + own.data.id + '/reject', { method: 'POST' })).ok);
  ok('reject', (await cj('c-approver', '/fund-entries/' + own.data.id + '/reject', { method: 'POST', body: { reason: 'Thiếu chứng từ' } })).data.status === 'rejected');
  const big = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 400001, attachment: receipt } });
  await cj('c-treasurer', '/fund-entries/' + big.data.id + '/submit', { method: 'POST' });
  ok('BR-03: overspend blocked', !(await cj('c-approver', '/fund-entries/' + big.data.id + '/approve', { method: 'POST' })).ok);
  ok('adjust needs ref + reason', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'adjust', amount: -50000 } })).ok);
  const adj = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'adjust', amount: -50000, ref_entry_id: cashIn.data.id, note: 'Ghi thừa 50.000' } });
  await cj('c-treasurer', '/fund-entries/' + adj.data.id + '/submit', { method: 'POST' });
  await cj('c-approver', '/fund-entries/' + adj.data.id + '/approve', { method: 'POST' });
  ok('adjust approved lowers balance', /^DC/.test(adj.data.code) && (await cj('cadm', '/funds/' + fid)).data.balance === 350000);
  ok('BR-04: no delete route', (await req('cadm', '/fund-entries/' + out.data.id, { method: 'DELETE' })).status === 404);
  const list = await cj('c-community_leader', '/funds/' + fid + '/entries?type=out&status=approved');
  ok('entries filter', list.ok && list.data.entries.length === 1 && list.data.entries[0].id === out.data.id);

  // ---------- Ảnh chứng từ (GĐ2.5) ----------
  const tinyJpeg = receipt;
  const outWithImg = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 5000, note: 'Mua giấy', attachment: tinyJpeg } });
  ok('expense entry with attachment', outWithImg.ok && !!outWithImg.data.attachment);
  const imgRes = await req('c-treasurer', '/fund-entries/' + outWithImg.data.id + '/attachment');
  ok('attachment downloads', imgRes.status === 200 && (await imgRes.text()).endsWith('chung-tu') && imgRes.headers.get('x-content-type-options') === 'nosniff');
  ok('fake image (wrong bytes) rejected', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, attachment: 'data:image/jpeg;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') } })).ok);
  ok('bad attachment format rejected', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, attachment: 'data:text/plain;base64,aGk=' } })).ok);
  const bigB64 = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5.2 * 1024 * 1024, 'a')]).toString('base64');
  ok('oversize attachment rejected', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, attachment: bigB64 } })).ok);
  ok('entry without attachment 404', (await req('c-treasurer', '/fund-entries/' + cashIn.data.id + '/attachment')).status === 404);

  // ---------- Báo cáo kỳ (GĐ2.7 — BR-12: không chốt sổ) ----------
  const fundDay = new Date().toISOString().slice(0, 10);
  const rep = await cj('c-community_leader', '/funds/' + fid + '/report?from=' + fundDay + '&to=' + fundDay);
  ok('period report matches balance', rep.ok && rep.data.opening_balance === 0 && rep.data.income_cash === 600000
    && rep.data.income_bank === 0 && rep.data.expense === 200000 && rep.data.adjust === -50000 && rep.data.closing_balance === 350000);
  ok('empty range returns opening as closing', (await cj('cadm', '/funds/' + fid + '/report?from=2000-01-01&to=2000-01-01')).data.closing_balance === 0);
  ok('inverted range rejected', !(await cj('cadm', '/funds/' + fid + '/report?from=' + fundDay + '&to=2000-01-01')).ok);
  ok('leader cannot export (no report.export)', (await req('c-community_leader', '/funds/' + fid + '/report/export?from=' + fundDay + '&to=' + fundDay)).status === 403);
  const expRes = await req('c-treasurer', '/funds/' + fid + '/report/export?from=' + fundDay + '&to=' + fundDay);
  ok('export xlsx', expRes.status === 200 && (expRes.headers.get('content-type') || '').includes('spreadsheetml'));

  // ---------- Danh sách công đức công khai (GĐ2.9, FR-20) ----------
  const pubOn = await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: true } } });
  ok('enabling public donations issues a token', pubOn.ok && !!pubOn.data.donations_url);
  const donToken = pubOn.data.donations_url.split('/').pop();
  const donJson = await (await fetch(ROOT + '/public/api/donations/' + donToken)).json();
  const donFund = donJson.data.programs.find((p) => p.name === 'Quỹ công đức');
  ok('public list shows only donation-kind funds', donJson.ok && !!donFund && !donJson.data.programs.some((p) => p.name === 'Quỹ chung'));
  ok('public total matches approved income only', donFund.total === 600000);
  ok('anonymous entry hides the name', donFund.entries.some((e) => e.name === null && e.anonymous === true && e.amount === 100000));
  const named = (await cj('c-treasurer', '/funds/' + fid + '/entries?type=in')).data.entries.find((e) => e.payer_name === 'Ông Ba');
  ok('FR-20: approver cannot toggle anonymity', (await req('c-approver', '/fund-entries/' + named.id + '/anonymous', { method: 'POST', body: { anonymous: true } })).status === 403);
  ok('FR-20: treasurer hides a donor name', (await cj('c-treasurer', '/fund-entries/' + named.id + '/anonymous', { method: 'POST', body: { anonymous: true } })).data.anonymous === 1);
  const donAfter = (await (await fetch(ROOT + '/public/api/donations/' + donToken)).json()).data.programs.find((p) => p.name === 'Quỹ công đức');
  ok('FR-20: hidden name no longer public', !JSON.stringify(donAfter).includes('Ông Ba') && donAfter.total === 600000);
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: false } } });
  const pubOn2 = await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: true } } });
  ok('token stays the same across toggle off/on', pubOn2.data.donations_url === pubOn.data.donations_url);
  ok('wrong token 404', (await fetch(ROOT + '/public/api/donations/bad-token')).status === 404);
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: false } } });
  ok('disabled flag 404 even with valid token', (await fetch(ROOT + '/public/api/donations/' + donToken)).status === 404);

  // Đóng quỹ = quyết toán: còn khoản dở thì không cho đóng; đã đóng thì không duyệt / sửa gì nữa.
  // Dọn các khoản dở do test phía trên để lại, như người duyệt phải làm thật trước khi đóng.
  for (const st of ['draft', 'submitted']) {
    for (const e of (await cj('cadm', '/funds/' + fid + '/entries?status=' + st)).data.entries) {
      if (st === 'draft') await cj('c-treasurer', '/fund-entries/' + e.id + '/submit', { method: 'POST' });
      await cj('c-approver', '/fund-entries/' + e.id + '/reject', { method: 'POST', body: { reason: 'dọn trước khi đóng' } });
    }
  }
  const openDraft = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, note: 'dở', attachment: receipt } });
  const closeBlocked = await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { status: 'closed' } });
  ok('cannot close fund with open entries', !closeBlocked.ok && /Còn 1 khoản/.test(closeBlocked.error), closeBlocked.error);
  await cj('c-treasurer', '/fund-entries/' + openDraft.data.id + '/submit', { method: 'POST' });
  await cj('c-approver', '/fund-entries/' + openDraft.data.id + '/reject', { method: 'POST', body: { reason: 'đóng quỹ' } });
  ok('close fund once nothing is open', (await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { status: 'closed' } })).data?.status === 'closed');
  ok('closed fund takes no entries', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).ok);
  ok('closed fund: no transitions on its entries', !(await cj('c-treasurer', '/fund-entries/' + openDraft.data.id + '/submit', { method: 'POST' })).ok);
  ok('closed fund: donor can still be anonymised (FR-20)', (await cj('c-treasurer', '/fund-entries/' + cashIn.data.id + '/anonymous', { method: 'POST', body: { anonymous: false } })).ok);
  await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { status: 'active' } });
  ok('reopen allowed', (await cj('c-treasurer', '/funds/' + fid)).data.status === 'active');

  // ---------- Ca biên và tấn công thử (rà soát GĐ1–2) ----------
  ok('amount over 100 billion rejected', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1e20 } })).ok);
  const badJson = await fetch(B + '/funds/' + fid + '/entries', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: jars['c-treasurer'] }, body: '{bad json' });
  ok('malformed JSON -> 400, not 500', badJson.status === 400);
  {
    await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 100000 } });
    const bal = (await cj('c-treasurer', '/funds/' + fid)).data.balance;
    const mk = async () => { const o = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: Math.ceil(bal * 0.6), note: 'race', attachment: receipt } }); await cj('c-treasurer', '/fund-entries/' + o.data.id + '/submit', { method: 'POST' }); return o.data.id; };
    const [x1, x2] = [await mk(), await mk()];
    const res = await Promise.all([x1, x2].map((id) => cj('c-approver', '/fund-entries/' + id + '/approve', { method: 'POST' })));
    ok('concurrent approvals cannot overdraw', res.filter((r) => r.ok).length === 1 && (await cj('c-treasurer', '/funds/' + fid)).data.balance >= 0);
    const loser = res[0].ok ? x2 : x1;
    await cj('c-approver', '/fund-entries/' + loser + '/reject', { method: 'POST', body: { reason: 'race test' } });
  }

  // ---------- GĐ3.6: đối soát sao kê (ERR-01) ----------
  {
    const d = new Date().toISOString().slice(0, 10);
    await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 45000, source: 'manual', bank_ref: 'SK-1' } });
    const rc = await cj('c-treasurer', '/funds/' + fid + '/reconcile?from=' + d + '&to=' + d);
    ok('reconcile: system bank income excludes cash', rc.ok && rc.data.system_in === rc.data.entries.reduce((s, e) => s + e.amount, 0) && rc.data.entries.every((e) => e.source !== 'cash'));
    ok('reconcile: mismatch needs a note', !(await cj('c-treasurer', '/funds/' + fid + '/reconciliations', { method: 'POST', body: { from: d, to: d, statement_in: rc.data.system_in + 20000 } })).ok);
    const rec = await cj('c-treasurer', '/funds/' + fid + '/reconciliations', { method: 'POST', body: { from: d, to: d, statement_in: rc.data.system_in + 20000, note: 'Thiếu 1 khoản 20.000 ngày 01, bổ sung sau' } });
    ok('reconcile: mismatch recorded with diff', rec.ok && rec.data.diff === 20000);
    ok('reconcile: matching period needs no note', (await cj('c-treasurer', '/funds/' + fid + '/reconciliations', { method: 'POST', body: { from: d, to: d, statement_in: rc.data.system_in } })).data.diff === 0);
    ok('reconcile: history listed, newest first', (await cj('c-community_leader', '/funds/' + fid + '/reconcile?from=' + d + '&to=' + d)).data.history[0].diff === 0);
    ok('reconcile: leader cannot record', (await req('c-community_leader', '/funds/' + fid + '/reconciliations', { method: 'POST', body: { from: d, to: d, statement_in: 0 } })).status === 403);
  }

  // ---------- Phạm vi thủ quỹ (BR-08, FR-02) ----------
  await req('cadm', '/users', { method: 'POST', body: { username: 'qa-treasurer2', password: '123456', role: 'treasurer' } });
  await req('c-treasurer2', '/auth/login', { method: 'POST', body: { username: 'qa-treasurer2', password: '123456' } });
  const treas = await cj('c-approver', '/fund-treasurers');
  ok('approver lists treasurers', treas.ok && treas.data.some((t) => t.username === 'qa-treasurer2'));
  const tq1 = treas.data.find((t) => t.username === 'qa-treasurer').id;
  ok('manager must be a treasurer', !(await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { manager_user_id: (await cj('cadm', '/auth/me')).data.user.id } })).ok);
  ok('assign fund to treasurer 1', (await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { manager_user_id: tq1 } })).data.manager_user_id === tq1);
  ok('BR-08: other treasurer cannot see assigned fund', !(await cj('c-treasurer2', '/funds')).data.some((f) => f.id === fid)
    && (await req('c-treasurer2', '/funds/' + fid)).status === 404
    && (await req('c-treasurer2', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).status === 404
    && (await req('c-treasurer2', '/fund-entries/' + out.data.id + '/attachment')).status === 404);
  ok('assigned treasurer and leader still see it', (await cj('c-treasurer', '/funds')).data.some((f) => f.id === fid)
    && (await cj('c-community_leader', '/funds')).data.some((f) => f.id === fid));
  await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { manager_user_id: null } });
  ok('unassigned fund open to every treasurer', (await cj('c-treasurer2', '/funds')).data.some((f) => f.id === fid));

  // ---------- QR quỹ (GĐ2.3 — reuse generateQR, tài khoản quỹ luôn riêng theo BR-02) ----------
  const fund2 = await cj('cadm', '/funds', { method: 'POST', body: { code: 'quy-chung', name: 'Quỹ chung', bank_account: 'QUYCHUNG01' } });
  ok('fund without bank_bin blocks QR', (await req('cadm', '/funds/' + fund2.data.id + '/qr')).status === 400);
  ok('bank BIN must be 6 digits', !(await cj('c-approver', '/funds/' + fund2.data.id, { method: 'PATCH', body: { bank_bin: 'MB: 970422' } })).ok);
  await cj('c-approver', '/funds/' + fund2.data.id, { method: 'PATCH', body: { bank_bin: '970422', bank_name: 'MB Bank' } });
  const staticQr = await cj('c-community_leader', '/funds/' + fund2.data.id + '/qr');
  ok('static fund QR has no amount', staticQr.ok && !!staticQr.data.qrDataUrl && !/54\d\d\d/.test(staticQr.data.qrCode.split('5303704')[1].split('5802VN')[0]) && staticQr.data.qrCode.includes('QUYCHUNG01'));
  ok('leader cannot request dynamic QR', (await req('c-community_leader', '/funds/' + fund2.data.id + '/qr', { method: 'POST', body: { amount: 100000 } })).status === 403);
  const dynQr = await cj('c-treasurer', '/funds/' + fund2.data.id + '/qr', { method: 'POST', body: { amount: 250000 } });
  ok('dynamic fund QR carries amount', dynQr.ok && dynQr.data.amount === 250000 && dynQr.data.qrCode.includes('250000'));
  const balBefore = (await cj('cadm', '/funds/' + fund2.data.id)).data.balance;
  const syncFund = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: 250000, content: 'Ung ho quy chung', transType: 'C', transactionid: 'FUND-TXN-1' }) })).json();
  ok('webhook routes to fund by bank account', syncFund.error === false);
  ok('FR-08: income into a general fund classified as fund', (await (await req('cadm', '/vietqr/transactions?from=2000-01-01&to=2999-12-31&q=FUND-TXN-1')).json()).data.items[0].category === 'fund');
  const syncFundShop = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokRoute.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: 999000, content: 'gia mao', transType: 'C', transactionid: 'FUND-FORGED' }) })).json();
  ok('GĐ3.0: shop token cannot book into a fund', syncFundShop.errorReason === 'TENANT_MISMATCH');
  ok('fund balance increases from webhook', (await cj('cadm', '/funds/' + fund2.data.id)).data.balance === balBefore + 250000);
  const syncFundAgain = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: 250000, content: 'Ung ho quy chung', transType: 'C', transactionid: 'FUND-TXN-1' }) })).json();
  ok('webhook fund payment idempotent', syncFundAgain.error === false && (await cj('cadm', '/funds/' + fund2.data.id)).data.balance === balBefore + 250000);
  const syncNoId = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: 7000, content: 'x', transType: 'C' }) })).json();
  ok('webhook without transactionid not booked', /Thiếu mã/.test(syncNoId.toastMessage) && (await cj('cadm', '/funds/' + fund2.data.id)).data.balance === balBefore + 250000);
  ok('BR-02: shop cannot take a fund account', !(await api('/settings', { method: 'PUT', body: { bank_account: 'QUY CHUNG 01' } })).ok);
  const syncNeg = await (await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: -5000, content: 'x', transType: 'C', transactionid: 'FUND-TXN-NEG' }) })).json();
  ok('webhook ignores non-positive amount', syncNeg.error === false && (await cj('cadm', '/funds/' + fund2.data.id)).data.balance === balBefore + 250000);
  // Tiền vào tài khoản quỹ đang đóng -> hàng chờ của thủ quỹ; thủ quỹ chọn quỹ khác để ghi sổ
  await cj('c-approver', '/funds/' + fund2.data.id, { method: 'PATCH', body: { status: 'closed' } });
  await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: 60000, content: 'ung ho', transType: 'C', transactionid: 'FQ-1' }) });
  await cj('c-approver', '/funds/' + fund2.data.id, { method: 'PATCH', body: { status: 'active' } });
  const fq = await cj('c-treasurer', '/vietqr/unclassified');
  const fq1 = fq.data.items.find((x) => x.transactionid === 'FQ-1');
  ok('ERR-03: payment to a closed fund waits in the treasurer queue', !!fq1 && fq.data.funds.length >= 1);
  ok('classify: leader cannot classify', (await req('c-community_leader', '/vietqr/transactions/' + fq1.id + '/classify', { method: 'POST', body: { fund_id: fid } })).status === 403);
  const fbal = (await cj('c-treasurer', '/funds/' + fund2.data.id)).data.balance;
  const fcls = await cj('c-treasurer', '/vietqr/transactions/' + fq1.id + '/classify', { method: 'POST', body: { fund_id: fund2.data.id } });
  ok('classify: treasurer books queued payment into a fund', fcls.ok && fcls.data.category === 'fund' && (await cj('c-treasurer', '/funds/' + fund2.data.id)).data.balance === fbal + 60000);

  // ---------- Phạm vi cộng đồng (GĐ1.4 — BR-07, BR-09, ERR-08) ----------
  const day = new Date().toISOString().slice(0, 10);
  // Cộng đồng B với người bán riêng: số của B không được lẫn vào A
  const comB = await rootJ('/platform/communities', { method: 'POST', body: { code: 'thon-b', name: 'Thôn B', type: 'village' } });
  await rootJ('/platform/tenants', { method: 'POST', body: { code: 'seller-b', name: 'Người bán B', owner_username: 'sellerb', owner_password: '123456', kind: 'seller', community_id: comB.data.id } });
  await req('selb', '/auth/login', { method: 'POST', body: { username: 'sellerb', password: '123456' } });
  await req('selb', '/invoices', { method: 'POST', body: { items: [{ name: 'Gạo', price: 777000, qty: 1 }], payment_method: 'cash', paid_amount: 777000 } });
  // Người bán A có thêm một hóa đơn đã thanh toán
  const paidA = await (await req('sel', '/invoices', { method: 'POST', body: { items: [{ name: 'Rau', price: 5000, qty: 2 }], payment_method: 'cash', paid_amount: 10000 } })).json();
  ok('seller A paid invoice', paidA.ok);
  // AC-03-3: người bán A không thấy dữ liệu của người bán B, kể cả đoán id
  const listA = await (await req('sel', '/invoices')).json();
  const listB = await (await req('selb', '/invoices')).json();
  const idB = listB.data.items ? listB.data.items[0].id : listB.data[0].id;
  ok('AC-03-3: seller A list has none of B', !JSON.stringify(listA).includes('777000') && !JSON.stringify(listA).includes('Gạo'));
  const peek = await req('sel', '/invoices/' + idB);
  ok('AC-03-3: seller A cannot open B invoice by id', !(await peek.text()).includes('Gạo'));
  ok('AC-03-3: seller A reports exclude B', !JSON.stringify(await (await req('sel', '/reports/summary?from=2000-01-01&to=2999-12-31')).json()).includes('777000'));
  const sumRes = await req('c-community_leader', '/community/summary?from=' + day + '&to=' + day);
  const summ = (await sumRes.json()).data;
  ok('BR-09: leader gets community summary', sumRes.status === 200 && summ.sellers === 2 && summ.community_id === com.data.id);
  // Thôn A: seller-a (1 hóa đơn 10.000) + iso-shop đã gia nhập (6 hóa đơn 1.000 + 2.000 + 3.000 + 8.800 + 1.500 + 100;
  // 3.000 từ test ERR-02, 8.800 từ test hàng chờ phân loại, 1.500 từ test độ trễ). Hóa đơn chờ VietQR không tính.
  ok('BR-07: converted = sellers with a paid sale', summ.converted_sellers === 2);
  ok('summary counts only own community', summ.transactions === 7 && summ.amount === 26400, JSON.stringify([summ.transactions, summ.amount]));
  ok('BR-09: summary has no per-seller data', !/seller-a|iso-shop|Người bán|Quán A/.test(JSON.stringify(summ)) && Object.values(summ).every((v) => typeof v !== 'object'));
  ok('summary rejects inverted range', (await req('c-community_leader', '/community/summary?from=' + day + '&to=2000-01-01')).status === 400);
  ok('ERR-08: seller owner cannot read community summary', (await req('sel', '/community/summary')).status === 403);
  ok('ERR-08: shop owner cannot read community summary', (await req('admin', '/community/summary')).status === 403);
  ok('ERR-08: treasurer lacks community.report', (await req('c-treasurer', '/community/summary')).status === 403);
  ok('ERR-08: leader cannot list invoices', (await req('c-community_leader', '/invoices')).status === 403);
  ok('ERR-08: leader cannot read POS reports', (await req('c-community_leader', '/reports/summary')).status === 403);
  ok('ERR-08: platform root has no community summary', (await req('root', '/community/summary')).status === 403);

  // ---------- Cấu hình loại cộng đồng + CRUD cộng đồng (GĐ1.6 — NFR-05, US-13, FR-02) ----------
  const types0 = await rootJ('/platform/community-types');
  ok('community types seeded with village', types0.ok && types0.data.some((t) => t.code === 'village' && t.name === 'Thôn' && t.approver_label === 'Trưởng thôn'));
  ok('preset community types seeded', ['village', 'residential-group', 'parish', 'pagoda', 'market', 'association'].every((c) => types0.data.some((t) => t.code === c)));
  ok('community without type rejected', !(await rootJ('/platform/communities', { method: 'POST', body: { code: 'no-type', name: 'Không loại' } })).ok);
  ok('non-root cannot list community types', (await req('admin', '/platform/community-types')).status === 403);
  ok('non-root cannot create community type', (await req('admin', '/platform/community-types', { method: 'POST', body: { code: 'x-type', name: 'X' } })).status === 403);
  const gx = await rootJ('/platform/community-types', { method: 'POST', body: { code: 'giao-xu', name: 'Giáo xứ', approver_label: 'Cha xứ', leader_label: 'Hội đồng giáo xứ', sort_order: 2 } });
  ok('community type create', gx.ok && gx.data.code === 'giao-xu' && gx.data.status === 'active');
  ok('community type dup code rejected', !(await rootJ('/platform/community-types', { method: 'POST', body: { code: 'giao-xu', name: 'Trùng' } })).ok);
  ok('community type code immutable', !(await rootJ('/platform/community-types/' + gx.data.id, { method: 'PUT', body: { code: 'khac' } })).ok);
  const gxU = await rootJ('/platform/community-types/' + gx.data.id, { method: 'PUT', body: { name: 'Giáo xứ (sửa)', sort_order: 3 } });
  ok('community type update', gxU.ok && gxU.data.name === 'Giáo xứ (sửa)' && gxU.data.sort_order === 3 && gxU.data.approver_label === 'Cha xứ');
  const tmpT = await rootJ('/platform/community-types', { method: 'POST', body: { code: 'tmp-type', name: 'Tạm' } });
  ok('unused community type delete', (await rootJ('/platform/community-types/' + tmpT.data.id, { method: 'DELETE' })).ok
    && !(await rootJ('/platform/community-types')).data.some((t) => t.code === 'tmp-type'));
  const vil = types0.data.find((t) => t.code === 'village');
  const delUsed = await rootJ('/platform/community-types/' + vil.id, { method: 'DELETE' });
  ok('community type in use cannot be deleted', !delUsed.ok && /đang dùng/.test(delUsed.error || ''));
  await rootJ('/platform/community-types/' + gx.data.id, { method: 'PUT', body: { status: 'suspended' } });
  ok('suspended type blocks new community', !(await rootJ('/platform/communities', { method: 'POST', body: { code: 'gx-bad', name: 'x', type: 'giao-xu' } })).ok);
  await rootJ('/platform/community-types/' + gx.data.id, { method: 'PUT', body: { status: 'active' } });

  // Cấu hình từng cộng đồng
  const gxc = await rootJ('/platform/communities', { method: 'POST', body: { code: 'gx-a', name: 'Giáo xứ A', type: 'giao-xu', contact_name: 'Ông B', contact_phone: '0900000000', note: 'Thí điểm' } });
  ok('community with contact + default settings', gxc.ok && gxc.data.contact_name === 'Ông B' && gxc.data.settings.public_donations === false && gxc.data.settings.unclassified_alert_days === 3);
  ok('community settings unknown key rejected', !(await rootJ('/platform/communities/' + gxc.data.id, { method: 'PUT', body: { settings: { foo: 1 } } })).ok);
  ok('community settings bad value rejected', !(await rootJ('/platform/communities/' + gxc.data.id, { method: 'PUT', body: { settings: { unclassified_alert_days: 0 } } })).ok
    && !(await rootJ('/platform/communities/' + gxc.data.id, { method: 'PUT', body: { settings: { public_donations: 'yes' } } })).ok);
  const gxs = await rootJ('/platform/communities/' + gxc.data.id, { method: 'PUT', body: { settings: { unclassified_alert_days: 5 } } });
  ok('community settings update merges', gxs.ok && gxs.data.settings.unclassified_alert_days === 5 && gxs.data.settings.public_donations === false);
  ok('change type of empty community', (await rootJ('/platform/communities/' + gxc.data.id, { method: 'PUT', body: { type: 'village' } })).data.type === 'village');
  await rootJ('/platform/communities/' + gxc.data.id, { method: 'PUT', body: { type: 'giao-xu' } });
  ok('change type of community with tenants rejected', !(await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { type: 'giao-xu' } })).ok);

  // Nhãn vai trò theo loại cộng đồng (chỉ đổi tên hiển thị)
  await rootJ('/platform/tenants', { method: 'POST', body: { code: 'quy-gx', name: 'Quỹ giáo xứ', owner_username: 'quygx', owner_password: '123456', kind: 'community', community_id: gxc.data.id } });
  await req('gxadm', '/auth/login', { method: 'POST', body: { username: 'quygx', password: '123456' } });
  const gxRoles = (await (await req('gxadm', '/roles')).json()).data;
  ok('role labels follow community type', gxRoles.find((r) => r.code === 'approver').name === 'Cha xứ' && gxRoles.find((r) => r.code === 'community_leader').name === 'Hội đồng giáo xứ');
  const gxAp = await (await req('gxadm', '/users', { method: 'POST', body: { username: 'gx-approver', password: '123456', role: 'approver' } })).json();
  ok('user role_name uses type label', gxAp.ok && gxAp.data.role_name === 'Cha xứ');
  const gxLogin = await (await req('gxap', '/auth/login', { method: 'POST', body: { username: 'gx-approver', password: '123456' } })).json();
  ok('login role_name uses type label, same perms', gxLogin.data.user.role_name === 'Cha xứ' && gxLogin.data.permissions.includes('fund.approve'));
  ok('village labels on village community', (await (await req('cadm', '/roles')).json()).data.find((r) => r.code === 'approver').name === 'Trưởng thôn');
  ok('platform users list uses type label', (await rootJ('/platform/users')).data.find((u) => u.username === 'gx-approver').role_name === 'Cha xứ');

  // Thành viên, gỡ, xóa
  const members = await rootJ('/platform/communities/' + com.data.id + '/tenants');
  ok('community members list', members.ok && members.data.some((t) => t.code === 'seller-a') && members.data.some((t) => t.code === 'quy-a'));
  const delCom = await rootJ('/platform/communities/' + com.data.id, { method: 'DELETE' });
  ok('delete community with tenants rejected', !delCom.ok && /còn \d+ cửa hàng/.test(delCom.error || ''));
  const shopM = await rootJ('/platform/tenants', { method: 'POST', body: { code: 'shop-gx', name: 'Shop GX', owner_username: 'shopgx', owner_password: '123456', kind: 'shop', community_id: gxc.data.id } });
  ok('remove shop from community', (await rootJ('/platform/communities/' + gxc.data.id + '/remove-tenant', { method: 'POST', body: { tenant_id: shopM.data.id } })).ok
    && (await rootJ('/platform/tenants')).data.find((t) => t.code === 'shop-gx').community_id === null);
  const selId = members.data.find((t) => t.code === 'seller-a').id;
  ok('cannot remove seller from community', !(await rootJ('/platform/communities/' + com.data.id + '/remove-tenant', { method: 'POST', body: { tenant_id: selId } })).ok);
  const emptyC = await rootJ('/platform/communities', { method: 'POST', body: { code: 'thon-rong', name: 'Thôn rỗng', type: 'village' } });
  ok('delete empty community', (await rootJ('/platform/communities/' + emptyC.data.id, { method: 'DELETE' })).ok
    && !(await rootJ('/platform/communities')).data.some((c) => c.code === 'thon-rong'));
  ok('non-root cannot delete community', (await req('admin', '/platform/communities/' + com.data.id, { method: 'DELETE' })).status === 403);

  // Tạm ngưng cộng đồng: chặn báo cáo và gán mới, không khóa đăng nhập
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { status: 'suspended' } });
  ok('suspended community summary 403', (await req('c-community_leader', '/community/summary')).status === 403);
  ok('suspended community blocks new assignment', !(await rootJ('/platform/tenants/' + shopM.data.id, { method: 'PUT', body: { community_id: com.data.id } })).ok);
  ok('suspended community keeps logins', (await (await req('c-community_leader', '/auth/me')).json()).ok);
  ok('suspended community keeps existing tenant editable', (await rootJ('/platform/tenants/' + selId, { method: 'PUT', body: { name: 'Người bán A2' } })).ok);
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { status: 'active' } });
  ok('reactivated community summary ok', (await req('c-community_leader', '/community/summary')).status === 200);

  // ---------- GĐ1.7: vai trò nền tảng (SEC-04, ERR-08) ----------
  const pPerms = await rootJ('/platform/permissions');
  ok('permission catalog', pPerms.ok && pPerms.data.some((p) => p.code === 'staff.manage' && p.group));
  const rolesL = await rootJ('/platform/roles');
  const sys = rolesL.data.find((r) => r.code === 'platform');
  ok('seeded platform roles', sys && sys.is_system && sys.permissions.includes('*') && ['platform_ops', 'platform_community', 'platform_support', 'platform_tech'].every((c) => rolesL.data.some((r) => r.code === c)));
  ok('system role not editable', !(await rootJ('/platform/roles/' + sys.id, { method: 'PUT', body: { name: 'X' } })).ok);
  ok('system role not deletable', !(await rootJ('/platform/roles/' + sys.id, { method: 'DELETE' })).ok);
  ok('role code clashing tenant role rejected', !(await rootJ('/platform/roles', { method: 'POST', body: { code: 'cashier', name: 'X' } })).ok);
  ok('unknown permission rejected', !(await rootJ('/platform/roles', { method: 'POST', body: { code: 'pf-x', name: 'X', permissions: ['*'] } })).ok);
  const mkStaff = async (username, role, communities = []) => {
    const r = await rootJ('/platform/staff', { method: 'POST', body: { username, password: 'staff123', role, communities } });
    await req(username, '/auth/login', { method: 'POST', body: { username, password: 'staff123' } });
    return r;
  };
  const pst = (who, u, o) => req(who, '/platform' + u, o).then((r) => r.status);
  const sOps = await mkStaff('ops1', 'platform_ops');
  ok('staff create', sOps.ok && sOps.data.role_name === 'Vận hành' && !('password_hash' in sOps.data));
  ok('staff username validated', !(await rootJ('/platform/staff', { method: 'POST', body: { username: 'A B', password: 'staff123', role: 'platform_ops' } })).ok);
  ok('staff bad role rejected', !(await rootJ('/platform/staff', { method: 'POST', body: { username: 'bad1', password: 'staff123', role: 'owner' } })).ok);
  const opsMe = await (await req('ops1', '/auth/me')).json();
  ok('staff login payload has role perms', opsMe.ok && opsMe.data.permissions.includes('tenants.manage') && !opsMe.data.permissions.includes('*'));
  ok('ops: tenants/communities/reports 200', (await pst('ops1', '/tenants')) === 200 && (await pst('ops1', '/communities')) === 200 && (await pst('ops1', '/reports')) === 200);
  ok('ops: vietqr/public-report/staff 403', (await pst('ops1', '/vietqr')) === 403 && (await pst('ops1', '/public-report')) === 403 && (await pst('ops1', '/staff')) === 403 && (await pst('ops1', '/roles')) === 403);
  ok('ops: cannot create tenant owner', (await pst('ops1', '/tenants', { method: 'POST', body: { code: 'ops-t', name: 'X', owner_username: 'opst', owner_password: '123456' } })) === 403);
  ok('ops: cannot manage community types', (await pst('ops1', '/community-types', { method: 'POST', body: { code: 'ops-ct', name: 'X' } })) === 403);
  await mkStaff('sup1', 'platform_support');
  ok('support: read only', (await pst('sup1', '/tenants')) === 200 && (await pst('sup1', '/tenants/' + selId, { method: 'PUT', body: { name: 'X' } })) === 403
    && (await pst('sup1', '/communities', { method: 'POST', body: { code: 'sup-c', name: 'X', type: 'village' } })) === 403);
  await mkStaff('tech1', 'platform_tech');
  ok('tech: vietqr ok, communities 403', (await pst('tech1', '/vietqr')) === 200 && (await pst('tech1', '/communities')) === 403 && (await pst('tech1', '/users')) === 403);
  const techVq = await (await req('tech1', '/platform/vietqr')).json();
  ok('vietqr password never returned', !JSON.stringify(techVq).includes('sharedpass'));
  // Phạm vi cộng đồng được giao (ERR-08)
  await mkStaff('cm1', 'platform_community', [com.data.id]);
  const cmComs = await (await req('cm1', '/platform/communities')).json();
  ok('ERR-08: scoped staff sees only assigned community', cmComs.ok && cmComs.data.length === 1 && cmComs.data[0].id === com.data.id);
  const cmTen = await (await req('cm1', '/platform/tenants')).json();
  ok('ERR-08: scoped staff sees only community tenants', cmTen.ok && cmTen.data.length > 0 && cmTen.data.every((t) => t.community_id === com.data.id));
  ok('ERR-08: scoped staff blocked on other community', (await pst('cm1', '/communities/' + gxc.data.id + '/tenants')) === 403
    && (await pst('cm1', '/communities/' + gxc.data.id, { method: 'PUT', body: { name: 'X' } })) === 403);
  ok('ERR-08: scoped staff blocked on out-of-scope tenant', (await pst('cm1', '/tenants/' + shopM.data.id, { method: 'PUT', body: { name: 'X' } })) === 403);
  ok('ERR-08: scoped staff cannot move tenant out of scope', (await pst('cm1', '/tenants/' + selId, { method: 'PUT', body: { community_id: gxc.data.id } })) === 403);
  ok('ERR-08: scoped staff cannot create community', (await pst('cm1', '/communities', { method: 'POST', body: { code: 'cm-c', name: 'X', type: 'village' } })) === 403);
  const cmUsers = await (await req('cm1', '/platform/users')).json();
  ok('ERR-08: scoped users list', cmUsers.ok && cmUsers.data.every((u) => cmTen.data.some((t) => t.id === u.tenant_id)));
  const cmRep = await (await req('cm1', '/platform/reports')).json();
  ok('ERR-08: scoped report', cmRep.ok && JSON.stringify(cmRep.data).indexOf('shop-gx') === -1);
  await mkStaff('cm2', 'platform_community');
  ok('ERR-08: scoped staff without assignment sees nothing', (await (await req('cm2', '/platform/tenants')).json()).data.length === 0 && (await (await req('cm2', '/platform/communities')).json()).data.length === 0);
  // Vai trò tùy chỉnh, tạm ngưng, xóa
  const cr = await rootJ('/platform/roles', { method: 'POST', body: { code: 'pf-audit', name: 'Kiểm tra', permissions: ['reports.view'] } });
  ok('custom role create', cr.ok && cr.data.permissions.join() === 'reports.view');
  ok('role code immutable', !(await rootJ('/platform/roles/' + cr.data.id, { method: 'PUT', body: { code: 'pf-other' } })).ok);
  await mkStaff('aud1', 'pf-audit');
  ok('custom role grants only its perms', (await pst('aud1', '/stats')) === 200 && (await pst('aud1', '/tenants')) === 403);
  await rootJ('/platform/roles/' + cr.data.id, { method: 'PUT', body: { permissions: ['reports.view', 'tenants.view'] } });
  ok('role perms change applies to live session', (await pst('aud1', '/tenants')) === 200);
  await rootJ('/platform/roles/' + cr.data.id, { method: 'PUT', body: { status: 'suspended' } });
  ok('suspended role has no access', (await pst('aud1', '/stats')) === 403);
  ok('role with users cannot be deleted', !(await rootJ('/platform/roles/' + cr.data.id, { method: 'DELETE' })).ok);
  const empty = await rootJ('/platform/roles', { method: 'POST', body: { code: 'pf-empty', name: 'Rỗng' } });
  ok('unused role deleted', (await rootJ('/platform/roles/' + empty.data.id, { method: 'DELETE' })).ok);
  // Tự bảo vệ
  const adm = await rootJ('/platform/roles', { method: 'POST', body: { code: 'pf-staff', name: 'Quản lý nhân sự', permissions: ['staff.manage'] } });
  const sAdm = await mkStaff('hr1', 'pf-staff');
  ok('cannot edit own role', (await (await req('hr1', '/platform/roles/' + adm.data.id, { method: 'PUT', body: { permissions: ['staff.manage', 'vietqr.manage'] } })).json()).ok === false);
  ok('cannot change own role', !(await (await req('hr1', '/platform/staff/' + sAdm.data.id, { method: 'PUT', body: { role: 'platform' } })).json()).ok);
  ok('cannot lock self', !(await (await req('hr1', '/platform/staff/' + sAdm.data.id, { method: 'PUT', body: { active: false } })).json()).ok);
  const rootId = (await rootJ('/platform/staff')).data.find((u) => u.username === 'root').id;
  ok('last super admin cannot be locked', !(await (await req('hr1', '/platform/staff/' + rootId, { method: 'PUT', body: { active: false } })).json()).ok);
  ok('last super admin cannot be downgraded', !(await (await req('hr1', '/platform/staff/' + rootId, { method: 'PUT', body: { role: 'platform_ops' } })).json()).ok);
  ok('platform role not assignable to tenant user', !(await api('/users', { method: 'POST', body: { username: 'pfx', password: '123456', full_name: 'X', role: 'platform_ops' } })).ok);
  ok('tenant owner cannot reach staff API', (await req('admin', '/platform/staff')).status === 403);
  // Khóa và đổi mật khẩu hủy phiên
  ok('lock staff', (await rootJ('/platform/staff/' + sOps.data.id, { method: 'PUT', body: { active: false } })).ok);
  ok('locked staff session revoked', (await req('ops1', '/platform/tenants')).status === 401);
  await rootJ('/platform/staff/' + sOps.data.id, { method: 'PUT', body: { active: true, password: 'newpass1' } });
  ok('reset password', (await (await req('ops1', '/auth/login', { method: 'POST', body: { username: 'ops1', password: 'newpass1' } })).json()).ok);
  const logs = await rootJ('/platform/staff');
  ok('staff list hides password', logs.ok && !JSON.stringify(logs.data).includes('password_hash'));

  for (const f of ['/', '/style.css', '/js/app.js', '/js/util.js', '/js/views/pos.js', '/favicon.svg', '/report.html', '/report.css', '/js/report.js']) ok('static ' + f, (await fetch(ROOT + f)).status === 200);
  console.log(R.join('\n'));
  const pass = R.filter((x) => x.startsWith('PASS')).length;
  console.log(`\n${pass}/${R.length} passed`);
  process.exit(pass === R.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
