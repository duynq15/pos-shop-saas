// Kiểm thử giao diện end-to-end bằng Playwright (chạy: node test/ui.test.js, cần server ở PORT 3111)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3111';
(async () => {
  const R = [];
  const ok = (name, cond, extra = '') => R.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !/status of (400|401|403|404)/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = () => 'PL UI'; });
  const api = (url, opts) => page.evaluate(async ([u, o]) => (await fetch(u, o)).json(), [url, opts]);
  const wait = (ms) => page.waitForTimeout(ms);
  const view = async (v) => { await page.evaluate((x) => window.showView(x), v); await wait(500); };
  try {
    await page.goto(BASE);
    await page.waitForSelector('#login-screen:not(.hidden)');
    ok('Login screen shown', await page.locator('#login-screen').isVisible());
    await page.locator('#login-user').fill('admin');
    await page.locator('#login-pass').fill('sai-mat-khau');
    await page.locator('#login-submit').click(); await wait(500);
    ok('Wrong password shows error', (await page.locator('#login-error').innerText()).length > 0);
    await page.locator('#login-pass').fill('admin123');
    await page.locator('#login-submit').click();
    await page.waitForSelector('#scan-input'); await wait(400);
    ok('App loads after login', await page.locator('#app-loading.hidden').count() === 1);
    ok('Nav rendered per role', await page.locator('.nav-item[data-view]').count() === 8);
    ok('Reports submenu', await page.locator('#subs-report-overview .nav-sub').count() === 5);
    ok('User box shows name', (await page.locator('#sidebar-user').innerText()).length > 0);
    // Người dùng
    await view('users');
    await page.locator('#u-new').click(); await wait(300);
    await page.locator('#uf-user').fill('nv01'); await page.locator('#uf-name').fill('Nhân Viên 1');
    await page.locator('#uf-pass').fill('123456'); await page.locator('#uf-role').selectOption('cashier');
    await page.locator('#uf-save').click(); await wait(600);
    ok('Add user via UI', (await page.locator('#u-body').innerText()).includes('nv01'));

    // ================= SETTINGS =================
    await view('settings');
    await page.locator('[data-s="shop_name"]').fill('Tạp hóa Duy');
    await page.locator('[data-s="shop_phone"]').fill('0900000000');
    await page.locator('#bank-select').selectOption('970422');
    await page.locator('[data-s="bank_account"]').fill('0123456789');
    await page.locator('[data-s="account_holder"]').fill('NGUYEN VAN A');
    await page.locator('#btn-save-settings').click(); await wait(500);
    const s = (await api('/api/settings')).data;
    ok('Settings save', s.bank_bin === '970422' && s.bank_name === 'MB Bank' && s.shop_name === 'Tạp hóa Duy');
    await page.locator('#btn-test-qr').click(); await wait(700);
    ok('Settings test QR image', (await page.locator('#qr-test img').count()) === 1);
    await page.locator('#btn-backup-now').click(); await wait(800);
    ok('Backup created in settings', (await page.locator('#backup-list tr').count()) >= 1);
    await page.locator('#btn-vqr-test').click(); await wait(600);
    ok('VietQR test button', (await page.locator('#vqr-test-result').innerText()).toLowerCase().includes('mock'));

    // ================= PRODUCTS =================
    await view('products');
    const before = await page.locator('#prod-body tr').count();
    await page.locator('#btn-new-prod').click(); await wait(300);
    await page.locator('#f-barcode').fill('1234567890123');
    await page.locator('#f-name').fill('Test Sản phẩm A');
    await page.locator('#f-cost').fill('5000'); await page.locator('#f-price').fill('8000');
    await page.locator('#f-stock').fill('10'); await page.locator('#f-min').fill('3');
    await page.locator('#unit-add').click();
    await page.locator('.unit-row .u-name').fill('Thùng');
    await page.locator('.unit-row .u-conv').fill('24');
    await page.locator('.unit-row .u-price').fill('200000');
    await page.locator('#f-save').click(); await wait(600);
    ok('Product add via form', (await page.locator('#prod-body tr').count()) === before + 1);
    let p = (await api('/api/products/barcode/1234567890123')).data;
    ok('Product has unit', p && p.units.length === 2);
    await page.locator('#btn-new-prod').click(); await wait(300);
    await page.locator('#f-barcode').fill('1234567890123'); await page.locator('#f-name').fill('Dup'); await page.locator('#f-price').fill('1');
    await page.locator('#f-save').click(); await wait(400);
    ok('Duplicate barcode toast', /đã tồn tại/.test(await page.locator('#toast').innerText()));
    await page.keyboard.press('Escape'); await wait(200);
    await page.locator('#prod-q').fill('Test Sản'); await wait(600);
    ok('Product search', (await page.locator('#prod-body tr').count()) === 1);
    await page.locator('#prod-body tr [data-act="edit"]').click(); await wait(300);
    await page.locator('#f-price').fill('9000'); await page.locator('#f-save').click(); await wait(600);
    p = (await api('/api/products/barcode/1234567890123')).data;
    ok('Product edit price', p.sell_price === 9000);
    await view('products'); await page.locator('#prod-q').fill('Test Sản'); await wait(600);
    await page.locator('#prod-body tr [data-act="stock"]').click(); await wait(300);
    await page.locator('#s-qty').fill('5'); await page.locator('#s-cost').fill('5500'); await page.locator('#s-save').click(); await wait(600);
    p = (await api('/api/products/barcode/1234567890123')).data;
    ok('Stock import form', p.stock === 15 && p.cost_price === 5500);
    await page.locator('#prod-body tr [data-act="stock"]').click(); await wait(300);
    await page.locator('#s-type').selectOption('adjust'); await page.locator('#s-qty').fill('2'); await page.locator('#s-save').click(); await wait(600);
    p = (await api('/api/products/barcode/1234567890123')).data;
    ok('Stock adjust form', p.stock === 2);
    await view('products'); await page.locator('#prod-q').fill(''); await wait(400);
    await page.locator('#prod-low').check(); await wait(600);
    ok('Low stock filter', (await page.locator('#prod-body').innerText()).includes('Test Sản phẩm A'));
    await page.locator('#prod-low').uncheck(); await wait(400);
    await page.locator('#btn-cat').click(); await wait(300);
    await page.locator('#cat-new').fill('Danh mục test'); await page.locator('#cat-add').click(); await wait(500);
    let cats = (await api('/api/categories')).data;
    ok('Category add modal', cats.some((c) => c.name === 'Danh mục test'));
    const cid = cats.find((c) => c.name === 'Danh mục test').id;
    await page.locator(`#cat-list [data-id="${cid}"]`).click(); await wait(500);
    cats = (await api('/api/categories')).data;
    ok('Category delete modal', !cats.some((c) => c.name === 'Danh mục test'));
    await page.keyboard.press('Escape'); await wait(200);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.locator('#btn-export').click()]);
    ok('CSV export download', !!dl, dl ? dl.suggestedFilename() : 'none');
    // tem nhãn
    await page.locator('#prod-q').fill('Test Sản'); await wait(500);
    await page.locator('#prod-body tr [data-act="label"]').click(); await wait(300);
    ok('Label modal opens', (await page.locator('#lbl-print').count()) === 1);
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.locator('#lbl-print').click(); await wait(300);
    ok('Label print renders barcode svg', await page.evaluate(() => window.__printed === 1 && document.querySelectorAll('#print-area .label svg').length >= 1));
    await page.keyboard.press('Escape'); await wait(200);

    // Sinh mã vạch nội bộ
    await page.locator('#btn-new-prod').click(); await wait(300);
    await page.locator('#f-name').fill('SP nội bộ');
    await page.locator('#f-price').fill('12000');
    await page.locator('#f-gen').click(); await wait(500);
    const genCode = await page.locator('#f-barcode').inputValue();
    ok('Auto-generate internal barcode', /^2\d{12}$/.test(genCode), genCode);
    await page.locator('#f-save').click(); await wait(600);
    ok('Generated barcode saved', (await api('/api/products/barcode/' + genCode)).ok === true);
    await page.locator('#btn-gen-barcodes').click(); await wait(800);
    ok('Bulk generate button', /sinh/i.test(await page.locator('#toast').innerText()));

    // ================= POS =================
    await view('pos');
    ok('F1 focuses scan', await page.evaluate(() => document.activeElement.id === 'scan-input'));
    const scan = page.locator('#scan-input');
    await scan.fill('8934588012136'); await scan.press('Enter'); await wait(400);
    await scan.fill('8934588012136'); await scan.press('Enter'); await wait(400);
    ok('Scan merges qty', (await page.locator('#cart-body tr').count()) === 1 && (await page.locator('#cart-body [data-act="qty"]').inputValue()) === '2');
    // đổi đơn vị sang Thùng ×24
    await page.locator('#cart-body .unit-sel').selectOption({ label: 'Thùng ×24' }); await wait(600);
    const unitTotal = (await page.locator('#sum-total').innerText()).replace(/\D/g, '');
    ok('Unit conversion price', unitTotal === '450000', unitTotal);
    await page.locator('#cart-body [data-act="del"]').click(); await wait(300);
    await scan.fill('3*8934563138165'); await scan.press('Enter'); await wait(400);
    ok('3*barcode prefix', (await page.locator('#cart-body [data-act="qty"]').first().inputValue()) === '3');
    await scan.fill('nước mắm'); await wait(600);
    ok('Type-ahead suggestions', (await page.locator('#suggest .item').count()) >= 1);
    await scan.press('Enter'); await wait(400);
    ok('Suggest Enter adds item', (await page.locator('#cart-body tr').count()) === 2);
    await page.locator('#btn-misc').click(); await wait(300);
    await page.locator('#m-name').fill('Túi nilon'); await page.locator('#m-price').fill('2000'); await page.locator('#m-ok').click(); await wait(400);
    ok('Misc item modal', (await page.locator('#cart-body tr').count()) === 3);
    await page.locator('#cart-body tr').nth(0).locator('[data-act="inc"]').click(); await wait(300);
    ok('Inc qty button', (await page.locator('#cart-body tr').nth(0).locator('[data-act="qty"]').inputValue()) === '2');
    await page.locator('#cart-body tr').nth(1).locator('[data-act="del"]').click(); await wait(300);
    ok('Delete row button', (await page.locator('#cart-body tr').count()) === 2);
    await page.locator('#discount').fill('5000'); await wait(500);
    const totalAfterDisc = Number((await page.locator('#sum-total').innerText()).replace(/\D/g, ''));
    ok('Discount applied', totalAfterDisc > 0);
    await page.locator('#quick-cash button').first().click(); await wait(200);
    const paidVal = Number(await page.locator('#paid').inputValue());
    ok('Quick cash fills paid', paidVal === totalAfterDisc);
    await page.locator('#paid').fill('1000');
    await page.keyboard.press('F9'); await wait(400);
    ok('Insufficient cash blocked', /chưa đủ/.test(await page.locator('#toast').innerText()));
    await page.locator('#paid').fill('500000');
    await page.locator('#cust-name').fill('Anh Ba');
    await page.keyboard.press('F9'); await wait(800);
    ok('F9 cash pay -> receipt', (await page.locator('#modal:not(.hidden) .receipt').count()) === 1);
    const rc = (await page.locator('.receipt').innerText()).toLowerCase();
    ok('Receipt content', rc.includes('tạp hóa duy') && rc.includes('anh ba') && rc.includes('tiền thừa'), rc.replace(/\n/g, ' ').slice(0, 120));
    ok('Cart cleared after pay', (await page.locator('#cart-body tr').count()) === 0);
    await page.keyboard.press('Escape'); await wait(200);
    ok('Esc closes modal', (await page.locator('#modal.hidden').count()) === 1);

    // Thanh toán hỗn hợp
    await scan.fill('2000000000035'); await scan.press('Enter'); await wait(400);
    await page.locator('.seg-btn[data-method="mixed"]').click(); await wait(300);
    const mixTotal = Number((await page.locator('#sum-total').innerText()).replace(/\D/g, ''));
    await page.locator('.mix-cash').fill(String(mixTotal)); await page.locator('.mix-transfer').fill('0'); await wait(200);
    await page.locator('#btn-pay').click(); await wait(800);
    ok('Mixed payment receipt', (await page.locator('#modal:not(.hidden) .receipt').count()) === 1);
    await page.keyboard.press('Escape'); await wait(300);

    // Chuyển khoản
    await scan.fill('2000000000011'); await scan.press('Enter'); await wait(400);
    await page.locator('.seg-btn[data-method="transfer"]').click(); await wait(200);
    ok('Transfer hides cash box', (await page.locator('#cash-box.hidden').count()) === 1);
    await page.locator('#btn-pay').click(); await wait(900);
    const qrTxt = await page.locator('#modal-box').innerText();
    ok('VietQR modal', (await page.locator('#modal-box .qr-wrap img').count()) === 1 && qrTxt.includes('MB Bank'));
    await page.locator('#q-confirm').click(); await wait(700);
    ok('QR confirm shows receipt', (await page.locator('#modal-box .receipt').count()) === 1);
    await page.keyboard.press('Escape'); await wait(300);

    // VietQR động: tự xác nhận khi nhận tiền (mock)
    await page.evaluate(() => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vqr_enabled: '1', vqr_env: 'mock', bank_account: '99990001' }) }));
    await wait(400);
    await scan.fill('2000000000035'); await scan.press('Enter'); await wait(400);
    await page.locator('.seg-btn[data-method="transfer"]').click(); await wait(200);
    await page.locator('#btn-pay').click(); await wait(1200);
    ok('Dynamic VietQR modal', (await page.locator('#modal-box .qr-wrap img').count()) === 1 && (await page.locator('#modal-box').innerText()).includes('Đang chờ'));
    ok('Mock simulate button visible', (await page.locator('#q-simulate').count()) === 1);
    await page.locator('#q-simulate').click(); await wait(900);
    ok('Auto receipt after payment', (await page.locator('#modal-box .receipt').count()) === 1);
    await page.keyboard.press('Escape'); await wait(300);
    await page.evaluate(() => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vqr_enabled: '0' }) }));

    // Treo đơn
    await scan.fill('8935001111222'); await scan.press('Enter'); await wait(400);
    await page.locator('#btn-hold').click(); await wait(600);
    ok('Hold order count', (await page.locator('#held-count').innerText()) === '1' && (await page.locator('#cart-body tr').count()) === 0);
    await page.locator('#btn-held').click(); await wait(500);
    ok('Held modal has row', (await page.locator('#modal .line-items tbody tr').count()) === 1);
    await page.locator('#modal [data-act="open"]').click(); await wait(700);
    ok('Held order restored', (await page.locator('#cart-body').innerText()).includes('Oreo'));
    await page.locator('#btn-clear').click(); await wait(300);

    // Barcode lạ -> tạo nhanh
    await scan.fill('9999999999999'); await scan.press('Enter'); await wait(700);
    ok('Unknown barcode -> form prefilled', (await page.locator('#f-barcode').inputValue()) === '9999999999999');
    await page.locator('#f-name').fill('Hàng mới quét'); await page.locator('#f-price').fill('12000'); await page.locator('#f-save').click(); await wait(700);
    ok('New product auto in cart', (await page.locator('#cart-body').innerText()).includes('Hàng mới quét'));
    await page.locator('#btn-clear').click(); await wait(300);

    // ================= INVOICES =================
    await view('invoices');
    ok('Invoice rows', (await page.locator('#inv-body tr').count()) >= 2);
    await page.locator('#inv-status').selectOption('paid'); await wait(600);
    ok('Status filter paid', (await page.locator('#inv-body tr').count()) >= 1);
    await page.locator('#inv-status').selectOption(''); await wait(400);
    await page.locator('#inv-q').fill('Anh Ba'); await page.locator('#inv-q').press('Enter'); await wait(600);
    ok('Search by customer', (await page.locator('#inv-body').innerText()).includes('Anh Ba'));
    await page.locator('#inv-body tr [data-act="view"]').first().click(); await wait(600);
    ok('View opens receipt', (await page.locator('#modal-box .receipt').count()) === 1);
    ok('Return button present', (await page.locator('#r-return').count()) === 1);
    await page.locator('#r-return').click(); await wait(600);
    await page.locator('#modal .ret-qty').first().fill('1');
    await page.locator('#ret-save').click(); await wait(800);
    ok('Return receipt created', (await page.locator('#modal-box .receipt').innerText()).includes('PHIẾU TRẢ HÀNG'));
    await page.keyboard.press('Escape'); await wait(300);

    // ================= INVENTORY =================
    await view('inventory');
    ok('Inventory stock stats', (await page.locator('#inv-body .stat').count()) >= 4);
    await page.locator('#inv-tabs .tab[data-tab="purchases"]').click(); await wait(600);
    await page.locator('#pu-new').click(); await wait(600);
    await page.locator('#pu-product').selectOption({ index: 1 }); await wait(300);
    await page.locator('#pu-qty').fill('20'); await page.locator('#pu-cost').fill('3000');
    await page.locator('#pu-add').click(); await wait(300);
    ok('Purchase line added', (await page.locator('#pu-lines tr').count()) >= 1);
    await page.locator('#pu-save-receive').click(); await wait(900);
    ok('Purchase list has row', (await page.locator('#pu-body tr').count()) >= 1);
    await page.locator('#inv-tabs .tab[data-tab="ledger"]').click(); await wait(700);
    ok('Ledger has purchase move', (await page.locator('#lg-body').innerText()).includes('Nhập hàng'));
    await page.locator('#inv-tabs .tab[data-tab="checks"]').click(); await wait(600);
    await page.locator('#ck-new').click(); await wait(400);
    await page.locator('#ck-create').click(); await wait(700);
    ok('Stock check editor opens', (await page.locator('#ck-body tr').count()) >= 1);
    await page.keyboard.press('Escape'); await wait(300);

    // ================= PROMOTIONS =================
    await view('promotions');
    await page.locator('#pm-new').click(); await wait(300);
    await page.locator('#pm-name').fill('KM test 5%');
    await page.locator('#pm-value').fill('5');
    await page.locator('#pm-save').click(); await wait(600);
    ok('Promotion created', (await page.locator('#pm-body').innerText()).includes('KM test 5%'));

    // ================= REPORTS (mỗi submenu = màn hình riêng) =================
    await view('report-overview');
    ok('Report stats cards', (await page.locator('#rp-stats .stat').count()) >= 10);
    ok('Report top chart', (await page.locator('#rp-top').innerText()).length > 0);
    await page.locator('#view-report-overview [data-range="month"]').click(); await wait(700);
    ok('Month range', (await page.locator('#view-report-overview [data-role="from"]').inputValue()).endsWith('-01'));

    await view('report-analytics');
    ok('Analytics section renders', (await page.locator('#an-abc').count()) === 1 && (await page.locator('#an-reorder').count()) === 1);

    await view('report-products');
    ok('Product report section', (await page.locator('#rp-prod').count()) === 1);

    await view('report-vat');
    ok('VAT report section', (await page.locator('#rp-vat').count()) === 1);

    // ================= VIETQR TRANSACTIONS (module riêng) =================
    await view('vietqr');
    ok('VietQR module table', (await page.locator('#vqt-body').count()) === 1);
    ok('VietQR summary cards', (await page.locator('#vqt-stats .stat').count()) === 4);
    ok('VietQR tabs', (await page.locator('#vqt-tabs .tab').count()) === 2);

    // ================= MOBILE =================
    await page.setViewportSize({ width: 400, height: 820 });
    await view('pos'); await wait(400);
    ok('No horizontal overflow 400px', !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)));
    ok('Mobile topbar visible', await page.locator('.mobile-topbar').isVisible());
  } catch (e) { R.push('EXCEPTION: ' + e.message.split('\n')[0]); }
  R.push('--- JS errors: ' + (errors.length ? errors.join(' || ') : 'none'));
  console.log(R.join('\n'));
  console.log(`\n${R.filter((x) => x.startsWith('PASS')).length}/${R.filter((x) => /^(PASS|FAIL)/.test(x)).length} passed`);
  await browser.close();
  process.exit(R.some((x) => x.startsWith('FAIL') || x.startsWith('EXCEPTION')) ? 1 : 0);
})();
