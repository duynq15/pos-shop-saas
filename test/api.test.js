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
// Ngày hôm nay theo giờ địa phương, khớp cách server tính (không UTC)
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const crc = (str) => { let c = 0xffff; for (const ch of str) { c ^= ch.charCodeAt(0) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };
// Máy chủ SKHG giả cho API Làng Số (server chạy với SKHG_API_BASE=http://localhost:3112)
const SKHG = {
  'tok-ok': [200, { success: true, data: { user: { phone: '84912345678', email: 'Ke.Toan@Example.vn' } } }],
  'tok-nouser': [200, { success: true, data: { phone: '0900000000' } }],
  'tok-bad': [401, { message: 'Unauthenticated' }],
  'tok-down': [500, {}],
};
// POST /login: tài khoản (đã chuẩn hóa) -> token; mật khẩu đúng là 'skhg-pass'. Ghi lại token đã /logout.
const SKHG_LOGIN = { '0912345678': 'tok-ok', 'khong.co@xaphuongvietnam.vn': 'tok-nouser', '0988000111': 'tok-multi' };
SKHG['tok-multi'] = [200, { success: true, data: { user: { phone: '0988000111' } } }];
// Thành viên cộng đồng SKHG "LGHZKS" (family id 98): admin, thành viên thường, chưa duyệt, đã rời cộng đồng
const member = (id, approved, slug) => [200, { success: true, data: { user: { id, name: 'Thành viên ' + id, families: [{ id: 98, code: 'LGHZKS' }, { id: 7, code: 'KHAC01' }],
  user_families: slug ? [{ family_id: 98, approved, family_role: { slug } }, { family_id: 7, approved: 1, family_role: { slug: 'nhom_truong' } }] : [] } } }];
Object.assign(SKHG, { 'tok-m-admin': member(901, 1, 'nhom_truong'), 'tok-m-user': member(902, 1, 'thanh_vien_thuong'),
  'tok-m-wait': member(903, 0, 'thanh_vien_thuong'), 'tok-m-left': member(901, 1, null) });
Object.assign(SKHG_LOGIN, { '0977000901': 'tok-m-admin', '0977000902': 'tok-m-user', '0977000903': 'tok-m-wait' });
const skhgLoggedOut = [];
// Trang Hành chính giả (GET /tich-hop/so-quy/ho, khoá "khoa-test"); HOUSES đổi được giữa các bước test
const phoneKey = (p) => require('crypto').createHmac('sha256', 'khoa-test').update(p).digest('hex');
let HOUSES = [
  { ma_ho: 'XT-0001', chu_ho: 'Trần Văn Hùng', xom: 'Xóm Đình', dia_chi: 'Ngõ 3', so_nhan_khau: 4, dien_ho: [], sdt_khop: [phoneKey('0912000111')] },
  { ma_ho: 'XT-0002', chu_ho: 'Lê Thị Nghèo', xom: 'Xóm Đông', dia_chi: null, so_nhan_khau: 2, dien_ho: ['Hộ nghèo'], sdt_khop: [] },
  { ma_ho: 'XT-0003', chu_ho: 'Phạm Văn C', xom: 'Xóm Đình', dia_chi: null, so_nhan_khau: 3, dien_ho: [], sdt_khop: [] },
];
Object.assign(SKHG, { 'tok-dan': [200, { success: true, data: { user: { id: 5001, name: 'Trần Văn Hùng', phone: '+84912000111' } } }],
  'tok-la': [200, { success: true, data: { user: { id: 5002, phone: '0900999888' } } }] });
require('http').createServer((rq, rs) => {
  const send = (code, body) => { rs.writeHead(rq.headers['user-agent'] === 'ThanhToanSo/1.0' ? code : 403, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(body)); };
  const auth = (rq.headers.authorization || '').replace('Bearer ', '');
  if (rq.url.endsWith('/login') && rq.method === 'POST') {
    let raw = '';
    rq.on('data', (c) => { raw += c; });
    rq.on('end', () => {
      const { email, password } = JSON.parse(raw || '{}');
      if (email === 'sap@xaphuongvietnam.vn') return send(503, {});
      const tok = password === 'skhg-pass' && SKHG_LOGIN[email];
      send(tok ? 200 : 422, tok ? { status: true, data: { access_token: tok } } : { status: false, message: 'Sai tài khoản hoặc mật khẩu' });
    });
    return;
  }
  if (rq.url.endsWith('/logout')) { skhgLoggedOut.push(auth); return send(200, { status: true }); }
  if (rq.url.startsWith('/tich-hop/so-quy/ho')) {
    if (rq.headers['x-khoa-tich-hop'] !== 'khoa-test') return send(401, {});
    return /cong_dong=LGHZKS/i.test(rq.url) ? send(200, { ma_thon: 'xt', ten_thon: 'Xuân Trạch', so_ho: HOUSES.length, ho: HOUSES }) : send(404, {});
  }
  const [code, body] = SKHG[auth] || [401, {}];
  send(rq.url.endsWith('/current-profile-2') ? code : 403, body);
}).listen(3112).unref();
const ls = (u, tok, o = {}) => fetch(B + '/lang-so' + u, { ...o, headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
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
  const cOwner = (await (await req('cadm', '/users')).json()).data.find((u) => u.username === 'quyaadmin');
  ok('community owner label is fund admin', cOwner && cOwner.role_name === 'Quản trị sổ quỹ', cOwner && cOwner.role_name);
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
  ok('BR-09: leader sees aggregate + configures fund, not entry/approve', perms.community_leader.includes('community.report')
    && perms.community_leader.includes('fund.view') && perms.community_leader.includes('fund.manage')
    && !['pos.sell', 'report.view', 'fund.entry', 'fund.approve'].some((p) => perms.community_leader.includes(p)));
  ok('community role cannot sell', (await (await req('c-community_leader', '/invoices', { method: 'POST', body: { items: [{ name: 'x', price: 1000, qty: 1 }] } })).json()).ok === false);
  const leaderId = (await (await req('cadm', '/users')).json()).data.find((u) => u.username === 'qa-community_leader').id;
  ok('FR-02: cannot switch community user to POS role', !(await (await req('cadm', '/users/' + leaderId, { method: 'PUT', body: { role: 'manager' } })).json()).ok);

  // ---------- Sổ quỹ (GĐ2.1–2.2 — FR-12 → FR-15, BR-03, BR-04, BR-05, ERR-06) ----------
  const cj = async (who, u, o) => (await req(who, u, o)).json();
  const fund = await cj('c-approver', '/funds', { method: 'POST', body: { code: 'cong-duc', name: 'Quỹ công đức', kind: 'donation', bank_account: 'QUY-A 001' } });
  ok('fund create (account normalised)', fund.ok && fund.data.bank_account === 'QUYA001' && fund.data.balance === 0);
  const fundMeta = await cj('cadm', '/funds/' + fund.data.id, { method: 'PATCH', body: { category: 'Thôn', target_amount: 200000, is_public: 1, bank_bin: '970422', bank_name: 'MB Bank', account_holder: 'Thôn A' } });
  ok('fund campaign fields saved', fundMeta.ok && fundMeta.data.category === 'Thôn' && fundMeta.data.target_amount === 200000 && fundMeta.data.is_public === 1, JSON.stringify(fundMeta.data));
  ok('fund payment methods default to both', fundMeta.data.payment_methods === 'both');
  ok('fund payment methods saved', (await cj('cadm', '/funds/' + fund.data.id, { method: 'PATCH', body: { payment_methods: 'transfer' } })).data.payment_methods === 'transfer');
  ok('bad payment method rejected', !(await cj('cadm', '/funds/' + fund.data.id, { method: 'PATCH', body: { payment_methods: 'card' } })).ok);
  await cj('cadm', '/funds/' + fund.data.id, { method: 'PATCH', body: { payment_methods: 'both' } });
  // Ban lãnh đạo được cấu hình quỹ và tài khoản nhận tiền, nhưng không nhập/duyệt chi
  const leaderFund = await cj('c-community_leader', '/funds', { method: 'POST', body: { code: 'quy-lanh-dao', name: 'Quỹ Ban lãnh đạo', bank_account: 'QUY-LD 001' } });
  ok('leader can create fund with bank account', leaderFund.ok && leaderFund.data.bank_account === 'QUYLD001');
  const leaderEdit = await cj('c-community_leader', '/funds/' + leaderFund.data.id, { method: 'PATCH', body: { category: 'Thôn', target_amount: 100000 } });
  ok('leader can configure fund campaign', leaderEdit.ok && leaderEdit.data.category === 'Thôn' && leaderEdit.data.target_amount === 100000);
  ok('fund account kept in the village account list', (await cj('cadm', '/fund-accounts')).data.some((a) => a.bank_account === 'QUYA001' && a.funds.some((x) => x.id === fund.data.id)));
  ok('shared account needs a distinct transfer code', /cùng mã/.test((await cj('cadm', '/funds', { method: 'POST', body: { code: 'quy-2', name: 'Quỹ 2', bank_account: 'QUYA001', transfer_code: fund.data.transfer_code } })).error || ''));
  const accNew = await cj('cadm', '/fund-accounts', { method: 'POST', body: { bank_account: 'ACC-LIST 01', bank_bin: '970422', bank_name: 'MB Bank', account_holder: 'Ban quan ly' } });
  ok('account list: add (normalised, holder upper-case)', accNew.ok && accNew.data.bank_account === 'ACCLIST01' && accNew.data.account_holder === 'BAN QUAN LY', JSON.stringify(accNew));
  ok('account list: no duplicate, no shop account', !(await cj('cadm', '/fund-accounts', { method: 'POST', body: { bank_account: 'ACCLIST01', bank_bin: '970422', account_holder: 'X' } })).ok
    && !(await cj('cadm', '/fund-accounts', { method: 'POST', body: { bank_account: 'SELLERA01', bank_bin: '970422', account_holder: 'X' } })).ok);
  const accFund = await cj('cadm', '/funds', { method: 'POST', body: { name: 'Quỹ chọn tài khoản', account_id: accNew.data.id } });
  ok('fund picks an account from the list', accFund.ok && accFund.data.bank_account === 'ACCLIST01' && accFund.data.bank_bin === '970422' && accFund.data.account_holder === 'BAN QUAN LY', JSON.stringify(accFund.data));
  await cj('cadm', '/fund-accounts/' + accNew.data.id, { method: 'PATCH', body: { account_holder: 'Thon A', bank_bin: '970436', bank_name: 'Vietcombank' } });
  ok('account edit flows to its funds', (await cj('cadm', '/funds/' + accFund.data.id)).data.account_holder === 'THON A' && (await cj('cadm', '/funds/' + accFund.data.id)).data.bank_name === 'Vietcombank');
  ok('account in use: cannot delete or change number', !(await cj('cadm', '/fund-accounts/' + accNew.data.id, { method: 'DELETE' })).ok
    && !(await cj('cadm', '/fund-accounts/' + accNew.data.id, { method: 'PATCH', body: { bank_account: 'ACCLIST02' } })).ok);
  ok('treasurer cannot manage accounts', (await req('c-treasurer', '/fund-accounts', { method: 'POST', body: { bank_account: 'X1', bank_bin: '970422', account_holder: 'X' } })).status === 403);
  await cj('cadm', '/funds/' + accFund.data.id, { method: 'PATCH', body: { account_id: null } });
  ok('account freed: delete works', (await cj('cadm', '/fund-accounts/' + accNew.data.id, { method: 'DELETE' })).ok);
  const ft = await cj('c-approver', '/fund-types', { method: 'PUT', body: { types: [{ name: 'Quỹ chung', nature: 'mandatory' }, { name: 'Ủng hộ LED', nature: 'campaign' }] } });
  ok('fund types: manager saves list with nature', ft.ok && ft.data.fund_types === 'Quỹ chung | Bắt buộc\nỦng hộ LED | Vận động', JSON.stringify(ft));
  ok('fund types: duplicate / bad nature rejected', !(await cj('cadm', '/fund-types', { method: 'PUT', body: { types: [{ name: 'A' }, { name: 'a' }] } })).ok
    && !(await cj('cadm', '/fund-types', { method: 'PUT', body: { types: [{ name: 'A', nature: 'x' }] } })).ok);
  ok('fund types: treasurer cannot edit', (await req('c-treasurer', '/fund-types', { method: 'PUT', body: { types: [{ name: 'A' }] } })).status === 403);
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
  const ibA = (await cj('c-approver', '/fund-inbox')).data;
  ok('inbox: approver gets the submitted expense to approve', ibA.items.some((x) => x.act === 'approve' && x.entry.id === out.data.id) && ibA.count >= 1, JSON.stringify(ibA.items.map((x) => x.act)));
  const ibT = (await cj('c-treasurer', '/fund-inbox')).data;
  ok('inbox: treasurer sees it as waiting, not as a task', ibT.items.some((x) => x.act === 'waiting' && x.entry.id === out.data.id) && !ibT.items.some((x) => x.act === 'approve'));
  const nt = (await cj('c-approver', '/notifications')).data;
  ok('notifications: items + unread count', Array.isArray(nt.items) && typeof nt.unread === 'number', JSON.stringify(nt).slice(0, 200));
  await cj('c-approver', '/notifications/seen', { method: 'POST' });
  ok('notifications: marking seen clears unread', (await cj('c-approver', '/notifications')).data.unread === 0);
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
  // Trang người nộp: chỉ mở khi nền tảng bật công khai; hiện QR + số tiền tuỳ chọn
  ok('public link hidden before platform enables', (await cj('cadm', '/community/public-link')).data.enabled === false);
  const pubCom = await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: true } } });
  ok('community public donations enabled', pubCom.ok && pubCom.data.settings.public_donations && /^\/congduc\/[a-f0-9]+$/.test(pubCom.data.donations_url || ''));
  ok('public link exposed to fund account after enabling', (await cj('cadm', '/community/public-link')).data.url === pubCom.data.donations_url);
  const donTok = (pubCom.data.donations_url || '').split('/').pop();
  await cj('cadm', '/funds/' + fid, { method: 'PATCH', body: { payment_methods: 'transfer' } });
  const pubFunds = await (await fetch(ROOT + '/public/api/donations/' + donTok)).json();
  const pubProg = pubFunds.ok && pubFunds.data.programs.find((p) => p.id === fid);
  ok('public payer page lists campaign with QR + totals', !!pubProg && !!pubProg.qrDataUrl && pubProg.total === 600000 && pubProg.balance === 350000, JSON.stringify(pubProg && { total: pubProg.total, balance: pubProg.balance }));
  const pubQr = await (await fetch(ROOT + '/public/api/donations/' + donTok + '/funds/' + fid + '/qr?amount=150000')).json();
  ok('public payer page creates QR with amount', pubQr.ok && pubQr.data.amount === 150000 && !!pubQr.data.qrDataUrl);
  ok('public fund exposes payment methods + transfer flag', pubProg.payment_methods === 'transfer' && pubProg.accept_transfer === true
    && pubProg.accept_cash === false && pubProg.payment_methods_label === 'Chuyển khoản', JSON.stringify(pubProg && { m: pubProg.payment_methods, cash: pubProg.accept_cash, tr: pubProg.accept_transfer }));
  await cj('cadm', '/funds/' + fid, { method: 'PATCH', body: { payment_methods: 'cash' } });
  const cashPub = await (await fetch(ROOT + '/public/api/donations/' + donTok)).json();
  const cashProg = cashPub.data.programs.find((p) => p.id === fid);
  ok('cash-only fund hides QR and blocks QR endpoint', cashProg.accept_transfer === false && !cashProg.qrDataUrl && cashProg.qr_note === 'Quỹ chỉ nhận tiền mặt, nộp cho thủ quỹ'
    && (await fetch(ROOT + '/public/api/donations/' + donTok + '/funds/' + fid + '/qr')).status === 404, JSON.stringify(cashProg && { tr: cashProg.accept_transfer, qr: !!cashProg.qrDataUrl, note: cashProg.qr_note }));
  const cashOnlyCk = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000, source: 'manual' } });
  const cashOnlyImp = await cj('c-treasurer', '/funds/' + fid + '/import?dry=1', { method: 'POST', body: { rows: [{ amount: 1000, source: 'Chuyển khoản' }] } });
  ok('cash-only fund rejects transfer entry + import line', !cashOnlyCk.ok && cashOnlyImp.data?.errors?.[0]?.error === 'Quỹ chỉ nhận tiền mặt', JSON.stringify(cashOnlyImp));
  await cj('cadm', '/funds/' + fid, { method: 'PATCH', body: { payment_methods: 'transfer' } });
  ok('transfer-only fund rejects cash entry', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).ok);
  await cj('cadm', '/funds/' + fid, { method: 'PATCH', body: { payment_methods: 'both' } });
  ok('public API allows cross-origin (App người dân)', (await fetch(ROOT + '/public/api/donations/' + donTok)).headers.get('access-control-allow-origin') === '*');

  // ---------- API cho Làng Số (SKHGDT-3532) ----------
  ok('lang-so: preflight CORS', await ls('/stats?thon=thon-a', null, { method: 'OPTIONS' }).then((r) => r.status === 204 && r.headers.get('access-control-allow-headers') === 'Authorization'));
  ok('lang-so: no token 401', (await ls('/stats?thon=thon-a')).status === 401);
  ok('lang-so: unknown thon 404', (await ls('/stats?thon=khong-co', 'tok-ok')).status === 404);
  ok('lang-so: bad SKHG token 401', (await ls('/todo?thon=thon-a', 'tok-bad')).status === 401);
  ok('lang-so: SKHG down 502', (await ls('/todo?thon=thon-a', 'tok-down')).status === 502);
  ok('lang-so: SKHG user without fund account 403', (await ls('/todo?thon=thon-a', 'tok-nouser')).status === 403);
  const apprId = (await cj('cadm', '/users')).data.find((u) => u.username === 'qa-approver').id;
  await cj('cadm', '/users/' + apprId, { method: 'PUT', body: { phone: '0912345678', email: 'ke.toan@example.vn' } });
  const lst = await ls('/stats?thon=thon-a', 'tok-ok');
  const lsStats = (await lst.json()).data;
  ok('lang-so: stats (phone 84… matches 0…)', lst.headers.get('access-control-allow-origin') === '*' && lsStats.months.length === 6
    && lsStats.month.in === 600000 && lsStats.month.count === 2 && lsStats.month.out === 200000 && lsStats.pending === 1
    && lsStats.funds.find((f) => f.name === 'Quỹ công đức').balance === 350000, JSON.stringify(lsStats));
  const td = (await (await ls('/todo?thon=thon-a', 'tok-ok')).json()).data;
  ok('lang-so: todo = submitted entries', td.length === 1 && td[0].amount === 400001 && td[0].type === 'out' && td[0].admin === '/?view=funds', JSON.stringify(td));
  const ac = (await (await ls('/activity?thon=thon-a', 'tok-ok')).json()).data;
  ok('lang-so: activity = approved entries, anonymous payer hidden', ac.length === 4 && ac[0].type === 'adjust' && ac.some((x) => x.payer === 'Ông Ba')
    && ac.filter((x) => x.type === 'in' && x.payer == null).length === 1 && !ac.some((x) => x.amount === 400001), JSON.stringify(ac));
  ok('lang-so: SSO bad token rejected', (await req('sso', '/auth/sso', { method: 'POST', body: { token: 'tok-bad', thon: 'thon-a' } })).status === 401);
  const sso = await cj('sso', '/auth/sso', { method: 'POST', body: { token: 'tok-ok', thon: 'thon-a' } });
  ok('lang-so: SSO logs in matching fund account', sso.ok && sso.data.user.username === 'qa-approver'
    && (await cj('sso', '/auth/me')).data.user.username === 'qa-approver');

  // ---------- Quỹ v2 (SKHGDT-3621): mã tự sinh, loại quỹ, cách đóng, ngày thu, nhập Excel/CSV ----------
  const v2 = await cj('cadm', '/funds', { method: 'POST', body: { name: 'Quỹ khuyến học 2026', fund_type: 'Khuyến học', category: 'Xóm 1', contribution: 'person', target_amount: 50000 } });
  ok('fund code auto-generated from name', v2.ok && v2.data.code === 'quy-khuyen-hoc-2026' && v2.data.fund_type === 'Khuyến học' && v2.data.contribution === 'person', JSON.stringify(v2.data));
  const v2b = await cj('cadm', '/funds', { method: 'POST', body: { name: 'Quỹ khuyến học 2026' } });
  ok('duplicate name gets suffixed code', v2b.ok && v2b.data.code === 'quy-khuyen-hoc-2026-2');
  ok('voluntary contribution drops amount', (await cj('cadm', '/funds/' + v2b.data.id, { method: 'PATCH', body: { contribution: 'voluntary', target_amount: 1000 } })).data.target_amount === null);
  ok('bad contribution rejected', !(await cj('cadm', '/funds/' + v2b.data.id, { method: 'PATCH', body: { contribution: 'xyz' } })).ok);
  ok('new general fund is not public by default', v2.data.is_public === 0);
  const v2id = v2.data.id;
  const back = await cj('c-treasurer', '/funds/' + v2id + '/entries', { method: 'POST', body: { type: 'in', amount: 70000, source: 'manual', bank_ref: 'FT-V2-1', date: '2026-01-15' } });
  ok('back-dated bank income recorded on that day', back.ok && back.data.approved_at.startsWith('2026-01-15') && /^PT20260115-/.test(back.data.code), JSON.stringify(back.data));
  ok('future date rejected', !(await cj('c-treasurer', '/funds/' + v2id + '/entries', { method: 'POST', body: { type: 'in', amount: 1000, date: '2999-01-01' } })).ok);
  ok('impossible date rejected', !(await cj('c-treasurer', '/funds/' + v2id + '/entries', { method: 'POST', body: { type: 'in', amount: 1000, date: '2026-02-30' } })).ok);
  const csv = 'Ngày (YYYY-MM-DD);Người nộp;Số tiền;Hình thức;Mã giao dịch;Ghi chú;Ẩn danh (x)\n'
    + '02/03/2026;Ông Tư;100.000;Tiền mặt;;Xóm 1;\n2026-03-03;"Bà Sáu; xóm 2";200000;Chuyển khoản;FT-V2-2;;x\n';
  const b64 = (s) => 'data:text/csv;base64,' + Buffer.from(s).toString('base64');
  const dry = await cj('c-treasurer', '/funds/' + v2id + '/import?dry=1', { method: 'POST', body: { file: b64(csv) } });
  ok('import dry-run counts without writing', dry.ok && dry.data.count === 2 && dry.data.total === 300000 && dry.data.imported === 0 && !dry.data.errors.length, JSON.stringify(dry));
  const badCsv = csv + '2026-03-04;X;abc;Tiền mặt;;;\n2026-03-04;Y;5000;Séc;;;\n2026-03-04;Z;5000;Chuyển khoản;FT-V2-1;;\n';
  const badImp = await cj('c-treasurer', '/funds/' + v2id + '/import', { method: 'POST', body: { file: b64(badCsv) } });
  ok('import reports each bad line, writes nothing', badImp.ok && badImp.data.imported === 0 && badImp.data.errors.map((e) => e.line).join() === '4,5,6', JSON.stringify(badImp.data.errors));
  ok('nothing written after failed import', (await cj('cadm', '/funds/' + v2id)).data.balance === 70000);
  const imp = await cj('c-treasurer', '/funds/' + v2id + '/import', { method: 'POST', body: { file: b64(csv) } });
  ok('import writes all rows', imp.ok && imp.data.imported === 2 && (await cj('cadm', '/funds/' + v2id)).data.balance === 370000);
  const impRows = (await cj('cadm', '/funds/' + v2id + '/entries')).data.entries;
  ok('imported rows keep date, source, anonymity', impRows.some((e) => e.payer_name === 'Ông Tư' && e.source === 'cash' && e.approved_at.startsWith('2026-03-02'))
    && impRows.some((e) => e.payer_name === 'Bà Sáu; xóm 2' && e.source === 'manual' && e.bank_ref === 'FT-V2-2' && e.anonymous === 1));
  ok('re-import same bank ref rejected', (await cj('c-treasurer', '/funds/' + v2id + '/import', { method: 'POST', body: { file: b64(csv) } })).data.errors.length === 1);
  const tpl = await req('c-treasurer', '/funds/' + v2id + '/import-template');
  const tplBuf = Buffer.from(await tpl.arrayBuffer());
  const xImp = await cj('c-treasurer', '/funds/' + v2id + '/import?dry=1', { method: 'POST', body: { file: tplBuf.toString('base64') } });
  ok('xlsx template downloads and re-imports', tpl.status === 200 && xImp.ok && xImp.data.count === 2 && !xImp.data.errors.length, JSON.stringify(xImp));
  ok('approver cannot import (BR-05)', (await req('c-approver', '/funds/' + v2id + '/import', { method: 'POST', body: { rows: [{ amount: 1 }] } })).status === 403);

  // ---------- Đăng nhập bằng mật khẩu SKHG (SKHGDT-3573) ----------
  const sk = (body) => cj('skhg', '/auth/skhg', { method: 'POST', body });
  const skWrong = await sk({ account: '0912 345 678', password: 'sai' });
  ok('skhg login: wrong password shows SKHG message', !skWrong.ok && skWrong.error === 'Sai tài khoản hoặc mật khẩu', JSON.stringify(skWrong));
  ok('skhg login: SKHG down 502', (await req('skhg', '/auth/skhg', { method: 'POST', body: { account: 'sap', password: 'x' } })).status === 502);
  const skNo = await sk({ account: 'khong.co', password: 'skhg-pass' });
  ok('skhg login: bare name -> @xaphuongvietnam.vn, no fund account 403', !skNo.ok && /chưa có tài khoản sổ quỹ/.test(skNo.error), JSON.stringify(skNo));
  const skOk = await sk({ account: '0912.345.678', password: 'skhg-pass' });
  ok('skhg login: SKHG token logged out after check (in background)', skhgLoggedOut.includes('tok-nouser'));
  ok('skhg login: phone matches fund account, session works', skOk.ok && skOk.data.user.username === 'qa-approver' && skOk.data.tenant.kind === 'community'
    && (await cj('skhg', '/auth/me')).data.user.username === 'qa-approver' && skhgLoggedOut.includes('tok-ok'), JSON.stringify(skOk));
  // Cùng SĐT ở hai sổ quỹ: phải chọn thôn
  await cj('cadm', '/users/' + apprId, { method: 'PUT', body: { phone: '0988000111', email: 'ke.toan@example.vn' } });
  await rootJ('/platform/tenants', { method: 'POST', body: { code: 'quy-a2', name: 'Quỹ thôn A (2)', owner_username: 'quya2admin', owner_password: '123456', kind: 'community', community_id: com.data.id } });
  await cj('a2', '/auth/login', { method: 'POST', body: { username: 'quya2admin', password: '123456' } });
  const a2Id = (await cj('a2', '/users')).data.find((u) => u.username === 'quya2admin').id;
  await cj('a2', '/users/' + a2Id, { method: 'PUT', body: { phone: '0988000111' } });
  const skMulti = await sk({ account: '0988000111', password: 'skhg-pass' });
  ok('skhg login: several villages -> choose list, no session', skMulti.ok && skMulti.data.choose?.length === 2
    && skMulti.data.choose.some((t) => t.code === 'quy-a2') && !skMulti.data.user, JSON.stringify(skMulti));
  const skPick = await sk({ account: '0988000111', password: 'skhg-pass', thon: 'quy-a2' });
  ok('skhg login: chosen village logs in', skPick.ok && skPick.data.user.username === 'quya2admin' && skPick.data.tenant.code === 'quy-a2', JSON.stringify(skPick));
  ok('skhg login: unknown village code 403', !(await sk({ account: '0988000111', password: 'skhg-pass', thon: 'khong-co' })).ok);

  // ---------- Thành viên cộng đồng SKHG vào sổ quỹ (SKHGDT-3577) ----------
  const mem = (jar, account) => cj(jar, '/auth/skhg', { method: 'POST', body: { account, password: 'skhg-pass', thon: 'quy-a' } });
  ok('skhg member: not linked yet 403', !(await mem('m1', '0977000901')).ok);
  ok('skhg member: bad SKHG community code rejected', !(await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { skhg_code: 'x!' } })).ok);
  ok('skhg member: link community code', (await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { skhg_code: 'lghzks' } })).data.skhg_code === 'LGHZKS');
  const m1 = await mem('m1', '0977000901');
  ok('skhg member: community admin -> approver account created', m1.ok && m1.data.user.role === 'approver' && m1.data.tenant.code === 'quy-a'
    && (await cj('m1', '/auth/me')).data.user.username === m1.data.user.username, JSON.stringify(m1));
  const m1b = await mem('m1', '0977000901');
  ok('skhg member: second login reuses account', m1b.ok && m1b.data.user.username === m1.data.user.username);
  ok('skhg member: approved member -> view only', (await mem('m2', '0977000902')).data?.user.role === 'community_leader');
  ok('skhg member: viewer cannot add entries', !(await cj('m2', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).ok);
  ok('skhg member: pending member 403', !(await mem('m3', '0977000903')).ok);
  ok('skhg member: no password login', !(await cj('m4', '/auth/login', { method: 'POST', body: { username: m1.data.user.username, password: '' } })).ok);
  // Rời cộng đồng trên SKHG: lần xác minh kế tiếp bị chặn, phiên cũ bị xóa
  SKHG_LOGIN['0977000901'] = 'tok-m-left';
  ok('skhg member: left community 403', !(await mem('m5', '0977000901')).ok);
  ok('skhg member: left community kills old session', (await req('m1', '/auth/me')).status === 401);
  await mem('m2', '0977000902'); // đăng nhập đúng xóa đếm lần sai theo IP, để các test đăng nhập sau không bị 429
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { skhg_code: '' } });
  await cj('cadm', '/users/' + apprId, { method: 'PUT', body: { phone: '0912345678', email: 'ke.toan@example.vn' } });

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
  const fundDay = localDay();
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
  ok('status not editable via PATCH', !(await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { status: 'closed' } })).ok);
  ok('stop collecting', (await cj('c-approver', '/funds/' + fid + '/stop', { method: 'POST', body: { note: 'Đủ chỉ tiêu' } })).data?.state === 'stopped');
  ok('stopped fund takes no income', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 } })).ok);
  await cj('c-treasurer', '/fund-entries/' + openDraft.data.id + '/submit', { method: 'POST' });
  ok('stopped fund still processes expenses', (await cj('c-approver', '/fund-entries/' + openDraft.data.id + '/reject', { method: 'POST', body: { reason: 'thử' } })).ok);
  ok('stopped fund: donor can still be anonymised (FR-20)', (await cj('c-treasurer', '/fund-entries/' + cashIn.data.id + '/anonymous', { method: 'POST', body: { anonymous: false } })).ok);
  ok('resume needs a new deadline', !(await cj('c-approver', '/funds/' + fid + '/resume', { method: 'POST', body: { reason: 'x' } })).ok);
  await cj('c-approver', '/funds/' + fid + '/resume', { method: 'POST', body: { end_date: '2999-12-31', reason: 'Gia hạn' } });
  ok('resume allowed', (await cj('c-treasurer', '/funds/' + fid)).data.state === 'collecting');

  // ---------- Vòng đời quỹ: Đang thu / Ngừng thu / Khoá sổ (SKHGDT-3647) ----------
  const callSum = await cj('c-treasurer', '/funds/' + fid + '/summary');
  ok('summary totals', callSum.ok && callSum.data.donors === 2 && callSum.data.pending === 0, JSON.stringify(callSum.data));
  ok('treasurer cannot stop collecting', (await req('c-treasurer', '/funds/' + fid + '/stop', { method: 'POST', body: {} })).status === 403);
  const round1 = (await cj('cadm', '/funds/' + fid)).data;
  ok('fund has transfer content + state label', !!round1.transfer_content && round1.state_label === 'Đang thu', JSON.stringify(round1));
  ok('stop', (await cj('c-approver', '/funds/' + fid + '/stop', { method: 'POST', body: {} })).data.state === 'stopped');
  ok('stopped: no QR with amount', !(await cj('c-treasurer', '/funds/' + fid + '/qr', { method: 'POST', body: { amount: 1000 } })).ok);
  ok('stopped: lock needs inspector', (await req('c-approver', '/funds/' + fid + '/lock', { method: 'POST', body: {} })).status === 403);
  // Mở thu lại: đợt mới, nội dung chuyển khoản mới; QR đợt cũ (nội dung cũ) không tự vào sổ
  const resumed = await cj('c-approver', '/funds/' + fid + '/resume', { method: 'POST', body: { end_date: '2999-01-31', reason: 'Thu bổ sung các hộ còn thiếu' } });
  const code1 = resumed.data.transfer_code;
  ok('resume opens new round with new transfer content', resumed.ok && resumed.data.round === round1.round + 1 && resumed.data.transfer_content === `${code1}-D${resumed.data.round}`
    && resumed.data.end_date === '2999-01-31', JSON.stringify(resumed.data));
  const qr2 = await cj('c-treasurer', '/funds/' + fid + '/qr', { method: 'POST', body: { amount: 10000 } });
  ok('new QR carries round content', qr2.ok && qr2.data.transfer_content === resumed.data.transfer_content && qr2.data.qrCode.includes(resumed.data.transfer_content));
  const hook = (id, content) => fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token },
    body: JSON.stringify({ bankaccount: 'QUYA001', amount: 20000, content, transType: 'C', transactionid: id }) }).then((r) => r.json());
  const balR2 = (await cj('cadm', '/funds/' + fid)).data.balance;
  await hook('R2-OLD', code1 + ' ung ho');
  ok('old-round QR payment not booked', (await cj('cadm', '/funds/' + fid)).data.balance === balR2);
  await hook('R2-NEW', `${code1} D${resumed.data.round} ung ho`);
  ok('new-round payment booked (dash optional)', (await cj('cadm', '/funds/' + fid)).data.balance === balR2 + 20000);
  await cj('c-approver', '/funds/' + fid + '/stop', { method: 'POST', body: {} });
  // Khoá sổ: Ban kiểm tra, đủ điều kiện
  const inspector = await cj('cadm', '/users', { method: 'POST', body: { username: 'qa-inspector', password: '123456', role: 'inspector', full_name: 'Trưởng ban kiểm tra' } });
  ok('create inspector', inspector.ok && inspector.data.role_name === 'Trưởng ban kiểm tra', JSON.stringify(inspector));
  await req('c-inspector', '/auth/login', { method: 'POST', body: { username: 'qa-inspector', password: '123456' } });
  const pdf = { name: 'bien-ban.pdf', data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 bien ban').toString('base64') };
  const pendingOut = await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, note: 'dở', attachment: receipt } });
  ok('stopped fund: treasurer can still create expense', pendingOut.ok);
  ok('lock blocked while entries open', /Còn 1 khoản/.test((await cj('c-inspector', '/funds/' + fid + '/lock', { method: 'POST', body: { minutes: pdf, balance_note: 'x' } })).error || ''));
  await cj('c-treasurer', '/fund-entries/' + pendingOut.data.id + '/submit', { method: 'POST' });
  await cj('c-approver', '/fund-entries/' + pendingOut.data.id + '/reject', { method: 'POST', body: { reason: 'khoá sổ' } });
  ok('lock needs balance note when balance > 0', /Số dư/.test((await cj('c-inspector', '/funds/' + fid + '/lock', { method: 'POST', body: { minutes: pdf } })).error || ''));
  ok('lock needs minutes', !(await cj('c-inspector', '/funds/' + fid + '/lock', { method: 'POST', body: { balance_note: 'Chuyển quỹ chung' } })).ok);
  ok('minutes must be a real document', !(await cj('c-inspector', '/funds/' + fid + '/lock', { method: 'POST', body: { balance_note: 'x', minutes: { name: 'a.pdf', data: 'data:application/pdf;base64,' + Buffer.from('<html>').toString('base64') } } })).ok);
  const locked = await cj('c-inspector', '/funds/' + fid + '/lock', { method: 'POST', body: { minutes: pdf, balance_note: 'Giữ lại cho đợt sau' } });
  ok('lock stores balance + minutes', locked.ok && locked.data.state === 'locked' && locked.data.lock_balance === balR2 + 20000 && !!locked.data.lock_doc_id, JSON.stringify(locked));
  ok('locked: no expense', !(await cj('c-treasurer', '/funds/' + fid + '/entries', { method: 'POST', body: { type: 'out', amount: 1000, note: 'x', attachment: receipt } })).ok);
  ok('locked: no edit', !(await cj('c-approver', '/funds/' + fid, { method: 'PATCH', body: { name: 'Đổi tên' } })).ok);
  ok('locked: cannot resume', !(await cj('c-approver', '/funds/' + fid + '/resume', { method: 'POST', body: { end_date: '2999-01-01', reason: 'x' } })).ok);
  ok('locked: name can still be hidden (FR-20)', (await cj('c-treasurer', '/fund-entries/' + cashIn.data.id + '/anonymous', { method: 'POST', body: { anonymous: false } })).ok);
  ok('minutes downloadable', (await req('cadm', '/fund-documents/' + locked.data.lock_doc_id)).headers.get('content-type') === 'application/pdf');
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: true } } });
  const pubLocked = (await (await fetch(ROOT + '/public/api/donations/' + donTok)).json()).data.programs.find((p) => p.id === fid);
  ok('public locked fund: label, balance, minutes link, no QR', pubLocked && pubLocked.state === 'locked' && /^Đã khoá sổ ngày \d\d\/\d\d\/\d{4}$/.test(pubLocked.status_text)
    && pubLocked.qrDataUrl === null && pubLocked.qr_note === 'Quỹ đã khoá sổ' && pubLocked.lock_balance === balR2 + 20000 && /\/documents\/\d+$/.test(pubLocked.minutes_url || ''), JSON.stringify(pubLocked && { ...pubLocked, entries: undefined }));
  ok('public minutes served', (await fetch(ROOT + pubLocked.minutes_url)).headers.get('content-type') === 'application/pdf');
  ok('public QR refused for locked fund', (await fetch(ROOT + '/public/api/donations/' + donTok + '/funds/' + fid + '/qr')).status === 404);
  // Mở khoá: lý do + biên bản + Trưởng thôn và Trưởng ban kiểm tra
  ok('unlock needs reason', !(await cj('c-approver', '/funds/' + fid + '/unlock-requests', { method: 'POST', body: { minutes: pdf } })).ok);
  const ureq = await cj('c-approver', '/funds/' + fid + '/unlock-requests', { method: 'POST', body: { reason: 'Ghi nhầm số tiền', minutes: pdf } });
  ok('unlock request created', ureq.ok && ureq.data.status === 'pending');
  ok('treasurer cannot sign unlock', (await req('c-treasurer', '/fund-requests/' + ureq.data.id + '/approve', { method: 'POST' })).status === 403);
  const s1 = await cj('c-approver', '/fund-requests/' + ureq.data.id + '/approve', { method: 'POST' });
  ok('one signature is not enough', s1.ok && s1.data.status === 'pending' && (await cj('cadm', '/funds/' + fid)).data.state === 'locked');
  ok('same person cannot sign twice', !(await cj('c-approver', '/fund-requests/' + ureq.data.id + '/approve', { method: 'POST' })).ok);
  const s2 = await cj('c-inspector', '/fund-requests/' + ureq.data.id + '/approve', { method: 'POST' });
  const unlocked = (await cj('cadm', '/funds/' + fid)).data;
  ok('two signatures unlock to Stopped (not Collecting)', s2.data?.status === 'done' && unlocked.state === 'stopped' && unlocked.unlock_reason === 'Ghi nhầm số tiền', JSON.stringify(s2));
  const pubUn = (await (await fetch(ROOT + '/public/api/donations/' + donTok + '/funds/' + fid)).json()).data;
  ok('public shows unlock line + notices', /^Đã mở khoá sổ ngày \d\d\/\d\d\/\d{4} – lý do: Ghi nhầm/.test(pubUn.unlock_text || '') && pubUn.notices.some((n) => n.kind === 'resume'), JSON.stringify(pubUn.notices));
  ok('stopped status text', /^Ngừng thu từ \d\d\/\d\d\/\d{4} · vẫn chi$/.test(pubUn.status_text), pubUn.status_text);
  // Tạo quỹ mới từ quỹ cũ, nội dung + tài liệu, tính chất
  const cloned = await cj('c-approver', '/funds/' + fid + '/clone', { method: 'POST', body: { name: 'Quỹ công đức 2027' } });
  ok('clone copies config, not account or entries', cloned.ok && cloned.data.state === 'collecting' && cloned.data.balance === 0 && cloned.data.bank_account === null && cloned.data.is_public === 1, JSON.stringify(cloned));
  ok('fund nature validated', !(await cj('c-approver', '/funds/' + cloned.data.id, { method: 'PATCH', body: { nature: 'xyz' } })).ok
    && (await cj('c-approver', '/funds/' + cloned.data.id, { method: 'PATCH', body: { nature: 'mandatory', content: 'Theo nghị quyết số 01' } })).data.nature === 'mandatory');
  const docAdd = await cj('c-approver', '/funds/' + cloned.data.id + '/documents', { method: 'POST', body: { name: 'Nghị quyết.pdf', data: pdf.data } });
  ok('fund document upload', docAdd.ok && docAdd.data.mime === 'application/pdf' && docAdd.data.kind === 'doc');
  ok('exe rejected as document', !(await cj('c-approver', '/funds/' + cloned.data.id + '/documents', { method: 'POST', body: { name: 'x.exe', data: Buffer.from('MZ....').toString('base64') } })).ok);
  const pubClone = (await (await fetch(ROOT + '/public/api/donations/' + donTok + '/funds/' + cloned.data.id)).json()).data;
  ok('public: nature label, content, documents', pubClone.nature_label === 'Bắt buộc' && pubClone.content === 'Theo nghị quyết số 01' && pubClone.documents.length === 1);
  // App Làng Số: mức đóng, đơn vị quản lý, thu chi lọc / phân trang, tháng này, báo cáo tháng
  ok('period validated', !(await cj('c-approver', '/funds/' + cloned.data.id, { method: 'PATCH', body: { period: 'week' } })).ok);
  await cj('c-approver', '/funds/' + cloned.data.id, { method: 'PATCH', body: { contribution: 'household', target_amount: 400000, period: 'year', managed_by: 'Ban quản lý thôn', end_date: '2999-12-31' } });
  await cj('c-treasurer', '/funds/' + cloned.data.id + '/entries', { method: 'POST', body: { type: 'in', amount: 400000, payer_name: 'Lê Thị Hoa', payer_group: 'Xóm Đông', source: 'manual', bank_ref: 'FT-LS-1' } });
  await cj('c-treasurer', '/funds/' + cloned.data.id + '/entries', { method: 'POST', body: { type: 'in', amount: 400000, payer_name: 'Bí Mật', payer_group: 'Xóm Kín', anonymous: true } });
  for (let i = 0; i < 21; i++) await cj('c-treasurer', '/funds/' + cloned.data.id + '/entries', { method: 'POST', body: { type: 'in', amount: 1000 + i } });
  const lsBase = ROOT + '/public/api/donations/' + donTok;
  const lsAll = (await (await fetch(lsBase)).json()).data;
  const lsFund = lsAll.programs.find((p) => p.id === cloned.data.id);
  ok('public: contribution text, managed by, month, updated', lsFund.contribution_text === '400.000 đ/hộ/năm' && lsFund.managed_by === 'Ban quản lý thôn'
    && lsFund.month.income === 800000 + 21 * 1000 + 210 && !!lsFund.updated_at, JSON.stringify({ t: lsFund.contribution_text, m: lsFund.month }));
  ok('public: community summary counts states', lsAll.summary.funds === lsAll.programs.length && lsAll.summary.collecting + lsAll.summary.stopped + lsAll.summary.locked === lsAll.programs.length
    && lsAll.summary.balance === lsAll.programs.reduce((s, p) => s + p.balance, 0), JSON.stringify(lsAll.summary));
  const pg1 = (await (await fetch(lsBase + '/funds/' + cloned.data.id + '/entries?type=in')).json()).data;
  ok('public entries: 20 per page, totals, month header', pg1.entries.length === 20 && pg1.total_count === 23 && pg1.pages === 2 && pg1.months[0].count === 23, JSON.stringify({ ...pg1, entries: undefined }));
  const pg2 = (await (await fetch(lsBase + '/funds/' + cloned.data.id + '/entries?type=in&page=2&limit=20')).json()).data;
  ok('public entries: page 2', pg2.entries.length === 3 && pg2.page === 2);
  const hoa = (await (await fetch(lsBase + '/funds/' + cloned.data.id + '/entries?q=Hoa')).json()).data.entries;
  ok('public entries: search, source, group, bank ref', hoa.length === 1 && hoa[0].source_label === 'Chuyển khoản' && hoa[0].group === 'Xóm Đông' && hoa[0].bank_ref === 'FT-LS-1' && !!hoa[0].match_text, JSON.stringify(hoa));
  ok('public entries: search never matches anonymous name', (await (await fetch(lsBase + '/funds/' + cloned.data.id + '/entries?q=Bí')).json()).data.total_count === 0
    && !JSON.stringify(pg1).includes('Xóm Kín'));
  ok('public entries: bad filter 400', (await fetch(lsBase + '/funds/' + cloned.data.id + '/entries?from=hom-qua')).status === 400);
  const lsX = await fetch(lsBase + '/funds/' + cloned.data.id + '/entries.xlsx');
  ok('public entries Excel', lsX.status === 200 && (lsX.headers.get('content-type') || '').includes('spreadsheetml'));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const rep1 = (await (await fetch(lsBase + '/report?month=' + thisMonth)).json()).data;
  const repF = rep1.funds.find((x) => x.id === cloned.data.id);
  ok('public monthly report', repF && repF.income === 800000 + 21 * 1000 + 210 && repF.closing_balance === repF.opening_balance + repF.income - repF.expense + repF.adjust, JSON.stringify(repF));
  ok('public report: bad month 400', (await fetch(lsBase + '/report?month=2026-13')).status === 400);
  // Theo hộ: danh sách hộ từ trang Hành chính, QR riêng hộ, khoản phải đóng, API "của tôi" (đăng nhập SKHG)
  const cid = cloned.data.id;
  ok('households: sync needs SKHG community link', !(await cj('c-approver', '/households/sync', { method: 'POST' })).ok);
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { skhg_code: 'LGHZKS' } });
  ok('households: treasurer cannot sync', (await req('c-treasurer', '/households/sync', { method: 'POST' })).status === 403);
  const hs = await cj('c-approver', '/households/sync', { method: 'POST' });
  ok('households: synced from Hành chính', hs.ok && hs.data.count === 3, JSON.stringify(hs));
  const hl = (await cj('c-treasurer', '/households')).data;
  ok('households: listed without phone numbers', hl.count === 3 && hl.households[1].categories[0] === 'Hộ nghèo' && !JSON.stringify(hl).includes('0912000111') && !JSON.stringify(hl).includes(phoneKey('0912000111')));
  await cj('c-approver', '/funds/' + cid, { method: 'PATCH', body: { exempt: 'Hộ nghèo', bank_account: 'LANGSO01', bank_bin: '970422', bank_name: 'MB Bank', account_holder: 'QUY THON' } });
  const hIn = await cj('c-treasurer', '/funds/' + cid + '/entries', { method: 'POST', body: { type: 'in', amount: 400000, household_code: 'XT-0003' } });
  ok('households: manual income for a household fills name and hamlet', hIn.ok && hIn.data.household_code === 'XT-0003' && hIn.data.payer_name === 'Phạm Văn C' && hIn.data.payer_group === 'Xóm Đình', JSON.stringify(hIn));
  ok('households: unknown household rejected', !(await cj('c-treasurer', '/funds/' + cid + '/entries', { method: 'POST', body: { type: 'in', amount: 1000, household_code: 'XT-9999' } })).ok);
  const cRef = (await cj('cadm', '/funds/' + cid)).data.transfer_content;
  await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token },
    body: JSON.stringify({ bankaccount: 'LANGSO01', amount: 150000, content: `XT0001 ${cRef} chuyen tien`, transType: 'C', transactionid: 'HH-TXN-1' }) });
  const fh = (await cj('c-treasurer', '/funds/' + cid + '/households')).data;
  const by = Object.fromEntries(fh.households.map((h) => [h.code, h]));
  ok('households: webhook books to household from transfer content', by['XT-0001'].paid === 150000 && by['XT-0001'].due === 400000 && by['XT-0001'].remaining === 250000, JSON.stringify(by['XT-0001']));
  ok('households: exempt category and done', by['XT-0002'].exempt && by['XT-0002'].due === 0 && by['XT-0003'].done && fh.summary.done === 1 && fh.summary.exempt === 1, JSON.stringify(fh.summary));
  const meUrl = ROOT + '/public/api/donations/' + donTok + '/me';
  ok('me: needs SKHG login', (await fetch(meUrl)).status === 401);
  const meNo = await fetch(meUrl, { headers: { Authorization: 'Bearer tok-la' } });
  ok('me: phone not in household list 404 with reason', meNo.status === 404 && /danh sách hộ/.test((await meNo.json()).error));
  const me = (await (await fetch(meUrl, { headers: { Authorization: 'Bearer tok-dan' } })).json()).data;
  const meF = me.funds.find((x) => x.id === cid);
  ok('me: my household and what I owe', me.household.code === 'XT-0001' && meF.due === 400000 && meF.paid === 150000 && meF.remaining === 250000
    && meF.status_text === 'Cần đóng 250.000 đ' && meF.transfer_content.startsWith('XT0001 ') && !!meF.qrDataUrl && me.summary.owing_total >= 250000, JSON.stringify(meF));
  const meE = (await (await fetch(meUrl + '/entries', { headers: { Authorization: 'Bearer tok-dan' } })).json()).data.entries;
  ok('me: my entries only', meE.length === 1 && meE[0].amount === 150000 && meE[0].fund_name === 'Quỹ công đức 2027', JSON.stringify(meE));
  HOUSES = HOUSES.filter((h) => h.ma_ho !== 'XT-0003');
  await cj('c-approver', '/households/sync', { method: 'POST' });
  ok('households: removed household inactive after resync', (await cj('c-treasurer', '/households')).data.count === 2);
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { skhg_code: '' } });
  await cj('cadm', '/users/' + inspector.data.id, { method: 'DELETE' }); // trả suất người dùng của gói cho các test sau
  await rootJ('/platform/communities/' + com.data.id, { method: 'PUT', body: { settings: { public_donations: false } } });

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
    const d = localDay();
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
  ok('approver lists treasurers', treas.ok && treas.data.some((t) => t.username === 'qa-treasurer2'), JSON.stringify(treas));
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
  // Nhiều quỹ dùng chung một tài khoản: tiền về chia theo mã nội dung chuyển khoản
  ok('shared: needs a distinct transfer code', !(await cj('cadm', '/funds', { method: 'POST', body: { name: 'Quỹ khác', bank_account: 'QUYCHUNG01', transfer_code: (await cj('cadm', '/funds/' + fund2.data.id)).data.transfer_code } })).ok);
  await cj('c-approver', '/funds/' + fund2.data.id, { method: 'PATCH', body: { transfer_code: 'QC26' } });
  const sh = await cj('cadm', '/funds', { method: 'POST', body: { name: 'Quỹ khuyến học chung', bank_account: 'QUY CHUNG 01', transfer_code: 'KHC26', bank_bin: '970422', bank_name: 'MB Bank' } });
  ok('shared: second fund on the same account', sh.ok && sh.data.bank_account === 'QUYCHUNG01', JSON.stringify(sh));
  ok('shared: still not across villages / shops', !(await cj('cadm', '/funds', { method: 'POST', body: { name: 'Quỹ x', bank_account: 'SELLERA01', transfer_code: 'X1' } })).ok);
  const shSync = (id, amount, content) => fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token },
    body: JSON.stringify({ bankaccount: 'QUYCHUNG01', amount, content, transType: 'C', transactionid: id }) });
  const shB1 = (await cj('cadm', '/funds/' + sh.data.id)).data.balance; const shB2 = (await cj('cadm', '/funds/' + fund2.data.id)).data.balance;
  await shSync('SH-1', 30000, 'Nguyen Van A KHC26 dong quy');
  await shSync('SH-2', 40000, `${(await cj('cadm', '/funds/' + fund2.data.id)).data.transfer_content}-ung ho`);
  await shSync('SH-3', 50000, 'chuyen tien quy thon');
  await shSync('SH-4', 60000, 'KHC2 sai ma');
  ok('shared: routed by transfer code', (await cj('cadm', '/funds/' + sh.data.id)).data.balance === shB1 + 30000 && (await cj('cadm', '/funds/' + fund2.data.id)).data.balance === shB2 + 40000);
  const shQ = (await cj('c-treasurer', '/vietqr/unclassified')).data.items;
  ok('shared: no / partial code goes to the treasurer queue', ['SH-3', 'SH-4'].every((id) => shQ.some((x) => x.transactionid === id)) && !shQ.some((x) => x.transactionid === 'SH-1'));
  const shRc = (await cj('c-treasurer', '/funds/' + sh.data.id + '/reconcile?from=2000-01-01&to=2999-12-31')).data;
  ok('shared: reconcile covers the whole account', shRc.shared_funds.length === 2 && shRc.entries.some((e) => e.bank_ref === 'SH-2') && shRc.entries.some((e) => e.bank_ref === 'SH-1'), JSON.stringify(shRc.shared_funds));
  // Tiền vào tài khoản quỹ đang đóng -> hàng chờ của thủ quỹ; thủ quỹ chọn quỹ khác để ghi sổ
  await cj('c-approver', '/funds/' + fund2.data.id + '/stop', { method: 'POST', body: {} });
  await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ bankaccount: fund2.data.bank_account, amount: 60000, content: 'ung ho', transType: 'C', transactionid: 'FQ-1' }) });
  await cj('c-approver', '/funds/' + fund2.data.id + '/resume', { method: 'POST', body: { end_date: '2999-12-31', reason: 'thử' } });
  const fq = await cj('c-treasurer', '/vietqr/unclassified');
  const fq1 = fq.data.items.find((x) => x.transactionid === 'FQ-1');
  ok('ERR-03: payment to a closed fund waits in the treasurer queue', !!fq1 && fq.data.funds.length >= 1);
  ok('classify: leader cannot classify', (await req('c-community_leader', '/vietqr/transactions/' + fq1.id + '/classify', { method: 'POST', body: { fund_id: fid } })).status === 403);
  const fbal = (await cj('c-treasurer', '/funds/' + fund2.data.id)).data.balance;
  const fcls = await cj('c-treasurer', '/vietqr/transactions/' + fq1.id + '/classify', { method: 'POST', body: { fund_id: fund2.data.id } });
  ok('classify: treasurer books queued payment into a fund', fcls.ok && fcls.data.category === 'fund' && (await cj('c-treasurer', '/funds/' + fund2.data.id)).data.balance === fbal + 60000);

  // ---------- Phạm vi cộng đồng (GĐ1.4 — BR-07, BR-09, ERR-08) ----------
  const day = localDay();
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

  // ---------- GĐ4.3: hạng mục hàng dùng chung (FR-10, FR-11, BR-11, AC-02-1, AC-02-2) ----------
  {
    // Thôn A: người duyệt (community.categories) quản lý; người bán A (seller-a) chỉ chọn
    const mk = await cj('c-approver', '/community/categories', { method: 'POST', body: { name: 'Rau củ' } });
    ok('BR-11: approver creates category', mk.ok && mk.data.some((c) => c.name === 'Rau củ'));
    await cj('c-approver', '/community/categories', { method: 'POST', body: { name: 'Thịt cá' } });
    ok('BR-11: duplicate name rejected (case-insensitive)', !(await cj('c-approver', '/community/categories', { method: 'POST', body: { name: 'rau CỦ' } })).ok);
    ok('BR-11: seller cannot create category', (await req('sel', '/community/categories', { method: 'POST', body: { name: 'Tự thêm' } })).status === 403);
    ok('BR-11: seller owner cannot rename category', (await req('sel', '/community/categories/' + mk.data[0].id, { method: 'PATCH', body: { name: 'Đổi' } })).status === 403);
    ok('BR-11: treasurer cannot create category', (await req('c-treasurer', '/community/categories', { method: 'POST', body: { name: 'X' } })).status === 403);
    const selCats = (await (await req('sel', '/community/categories')).json()).data;
    const rau = selCats.find((c) => c.name === 'Rau củ'); const thit = selCats.find((c) => c.name === 'Thịt cá');
    ok('seller sees own community categories', !!rau && !!thit);
    // Thôn B có danh mục riêng; người bán A không dùng được
    await rootJ('/platform/tenants', { method: 'POST', body: { code: 'quy-b', name: 'Quỹ B', owner_username: 'quybown', owner_password: '123456', kind: 'community', community_id: comB.data.id } });
    await req('qb', '/auth/login', { method: 'POST', body: { username: 'quybown', password: '123456' } });
    const catB = (await (await req('qb', '/community/categories', { method: 'POST', body: { name: 'Hàng thôn B' } })).json()).data.find((c) => c.name === 'Hàng thôn B');
    ok('BR-11: seller B does not see A categories', !(await (await req('selb', '/community/categories')).json()).data.some((c) => c.name === 'Rau củ'));
    const crossInv = await (await req('sel', '/invoices', { method: 'POST', body: { items: [{ name: 'Rau', price: 3000, qty: 1 }], payment_method: 'cash', paid_amount: 3000, item_category_id: catB.id } })).json();
    ok('AC-02-2: seller cannot use another community category', !crossInv.ok);
    const withCat = await (await req('sel', '/invoices', { method: 'POST', body: { items: [{ name: 'Rau', price: 3000, qty: 1 }], payment_method: 'cash', paid_amount: 3000, item_category_id: rau.id } })).json();
    ok('AC-02-1: sale stored with category id + name', withCat.ok && withCat.data.item_category_id === rau.id && withCat.data.item_category_name === 'Rau củ');
    const re = await (await req('sel', '/invoices/' + withCat.data.id + '/category', { method: 'POST', body: { item_category_id: thit.id } })).json();
    ok('AC-02-1: seller can change category later', re.ok && re.data.item_category_name === 'Thịt cá');
    ok('AC-02-2: change to foreign category rejected', !(await (await req('sel', '/invoices/' + withCat.data.id + '/category', { method: 'POST', body: { item_category_id: catB.id } })).json()).ok);
    // Đổi tên hạng mục: hóa đơn cũ giữ tên lúc bán
    await cj('c-approver', '/community/categories/' + thit.id, { method: 'PATCH', body: { name: 'Thịt, cá tươi' } });
    ok('rename keeps old invoice label', (await (await req('sel', '/invoices/' + withCat.data.id)).json()).data.item_category_name === 'Thịt cá');
    // Ẩn: không chọn được nữa, nhưng không xóa
    await cj('c-approver', '/community/categories/' + rau.id, { method: 'PATCH', body: { status: 'hidden' } });
    ok('hidden category not offered to sellers', !(await (await req('sel', '/community/categories')).json()).data.some((c) => c.id === rau.id));
    ok('hidden category cannot be used', !(await (await req('sel', '/invoices', { method: 'POST', body: { items: [{ name: 'R', price: 1000, qty: 1 }], payment_method: 'cash', paid_amount: 1000, item_category_id: rau.id } })).json()).ok);
    ok('approver still sees hidden with all=1', (await cj('c-approver', '/community/categories?all=1')).data.some((c) => c.id === rau.id && c.status === 'hidden'));
    ok('shop outside any community has no categories', (await api('/community/categories')).data.length === 0);

    // ---------- GĐ4.2: QR tĩnh của người bán (FR-03, ERR-09) ----------
    const qrOk = await (await req('sel', '/qr')).json();
    ok('AC-01-1: seller static QR built on own account', qrOk.ok && qrOk.data.bank_account === 'SELLERA01' && !!qrOk.data.dataUrl, qrOk.error);
    ok('static QR has no amount', !/54\d{2}/.test(qrOk.data.payload.split('5303704')[1].split('5802VN')[0]));
    await req('selb', '/settings', { method: 'PUT', body: { bank_account: '' } });
    const qrNone = await (await req('selb', '/qr')).json();
    ok('ERR-09: no account -> no QR, clear message', !qrNone.ok && /Chưa khai số tài khoản/.test(qrNone.error));
    await req('selb', '/settings', { method: 'PUT', body: { bank_account: 'SELB-01!!', bank_bin: '970422' } });
    ok('ERR-09: malformed account -> no QR', !(await (await req('selb', '/qr')).json()).ok);
    await req('selb', '/settings', { method: 'PUT', body: { bank_account: 'SELLERB01', bank_bin: 'MB' } });
    ok('ERR-09: malformed bank BIN -> no QR', /Ngân hàng chưa chọn/.test((await (await req('selb', '/qr')).json()).error || ''));
    await req('selb', '/settings', { method: 'PUT', body: { bank_account: 'SELLERB01', bank_bin: '970422' } });
    // Tiền vào QR tĩnh: không có mã đối soát -> hàng chờ -> người bán xác nhận "Bán hàng" + hạng mục
    const gtok = (await (await fetch(ROOT + '/vqr/api/token_generate', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from('posshop:posshop-secret').toString('base64') } })).json()).access_token;
    await fetch(ROOT + '/vqr/bank/api/transaction-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + gtok }, body: JSON.stringify({ bankaccount: 'SELLERA01', amount: 25000, content: 'chuyen tien rau', transType: 'C', transactionid: 'STATIC-1' }) });
    const sq = (await (await req('sel', '/vietqr/unclassified')).json()).data.items.find((x) => x.transactionid === 'STATIC-1');
    ok('static-QR payment queued for the seller', !!sq);
    const before = (await (await req('sel', '/reports/summary?from=2000-01-01&to=2999-12-31')).json()).data;
    ok('sale classification rejects foreign category', !(await (await req('sel', '/vietqr/transactions/' + sq.id + '/classify', { method: 'POST', body: { category: 'sale', item_category_id: catB.id } })).json()).ok);
    const sc = await (await req('sel', '/vietqr/transactions/' + sq.id + '/classify', { method: 'POST', body: { category: 'sale', item_category_id: thit.id } })).json();
    ok('classify as sale creates a paid invoice with category', sc.ok && sc.data.category === 'sale' && !!sc.data.invoice_id);
    const scInv = (await (await req('sel', '/invoices/' + sc.data.invoice_id)).json()).data;
    ok('created invoice: paid, transfer, right amount and label', scInv.status === 'paid' && scInv.total === 25000 && scInv.payment_method === 'transfer' && scInv.item_category_name === 'Thịt, cá tươi' && scInv.payments.length === 1);
    const after = (await (await req('sel', '/reports/summary?from=2000-01-01&to=2999-12-31')).json()).data;
    ok('static-QR sale counts in revenue', JSON.stringify(after) !== JSON.stringify(before));

    // ---------- GĐ4.5: báo cáo người bán (FR-16, AC-03-1, AC-03-2, ERR-04) ----------
    const all = '?from=2000-01-01&to=2999-12-31';
    const rep = (await (await req('sel', '/reports/seller' + all)).json()).data;
    const sumCats = rep.categories.reduce((s, c) => s + c.revenue, 0);
    ok('AC-03-2: categories add up to total revenue', rep.revenue > 0 && sumCats === rep.revenue, sumCats + ' vs ' + rep.revenue);
    ok('ERR-04: uncategorised line present', rep.categories.some((c) => c.uncategorized && c.name === 'Chưa gắn hạng mục'));
    ok('AC-03-1: periods add up to total revenue', rep.periods.reduce((s, p) => s + p.revenue, 0) === rep.revenue);
    const sum = (await (await req('sel', '/reports/summary' + all)).json()).data;
    ok('AC-03-1: seller report total = POS summary revenue (sales − returns)', rep.revenue === sum.revenue, JSON.stringify([rep.revenue, sum.revenue]));
    const mon = (await (await req('sel', '/reports/seller' + all + '&by=month')).json()).data;
    ok('by month buckets YYYY-MM', mon.periods.every((p) => /^\d{4}-\d{2}$/.test(p.period)) && mon.revenue === rep.revenue);
    // Trả hàng một giao dịch có hạng mục: trừ vào đúng hạng mục đó
    const rInv = await (await req('sel', '/invoices', { method: 'POST', body: { items: [{ name: 'Cá', price: 40000, qty: 1 }], payment_method: 'cash', paid_amount: 40000, item_category_id: thit.id } })).json();
    const beforeRet = (await (await req('sel', '/reports/seller' + all)).json()).data.categories.find((c) => c.name === 'Thịt, cá tươi' || c.name === 'Thịt cá');
    await req('sel', '/invoices', { method: 'POST', body: { type: 'return', parent_id: rInv.data.id, items: [{ name: 'Cá', price: 40000, qty: 1 }], payment_method: 'cash', paid_amount: 40000 } });
    const afterRet = (await (await req('sel', '/reports/seller' + all)).json()).data;
    const catAfter = afterRet.categories.find((c) => c.name === beforeRet.name);
    ok('return subtracts from its original category', catAfter.revenue === beforeRet.revenue - 40000 && afterRet.categories.reduce((s, c) => s + c.revenue, 0) === afterRet.revenue,
      JSON.stringify([beforeRet.revenue, catAfter && catAfter.revenue]));
    ok('AC-03-3: seller B report excludes seller A', !(await (await req('selb', '/reports/seller' + all)).json()).data.categories.some((c) => c.name === 'Rau củ' || c.name === beforeRet.name));
    ok('seller report rejects inverted range', !(await (await req('sel', '/reports/seller?from=2026-12-31&to=2026-01-01')).json()).ok);
  }

  for (const f of ['/', '/style.css', '/js/app.js', '/js/util.js', '/js/views/pos.js', '/favicon.svg', '/report.html', '/report.css', '/js/report.js']) ok('static ' + f, (await fetch(ROOT + f)).status === 200);
  console.log(R.join('\n'));
  const pass = R.filter((x) => x.startsWith('PASS')).length;
  console.log(`\n${pass}/${R.length} passed`);
  process.exit(pass === R.length ? 0 : 1);
})().catch((e) => { console.log(R.filter((x) => x.startsWith('FAIL')).join('\n')); console.error(e); process.exit(1); });
