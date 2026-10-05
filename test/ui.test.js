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
    await page.locator('#bank-select').fill('mb'); await page.locator('#bank-select-list [role=option]').first().click();
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

    // ================= CỘNG ĐỒNG (GĐ1.5, NFR-05, FR-02) =================
    const loginAs = async (user, pass, sel) => {
      const c = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const pg = await c.newPage();
      pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await pg.goto(BASE);
      await pg.waitForSelector('#login-screen:not(.hidden)');
      await pg.locator('#login-user').fill(user);
      await pg.locator('#login-pass').fill(pass);
      await pg.locator('#login-submit').click();
      await pg.waitForSelector(sel); await pg.waitForTimeout(500);
      return { c, pg };
    };
    const root = await loginAs('root', 'root123', '#pf-body');
    const go = async (pg, v, sel) => { await pg.locator(`.nav-item[data-view="${v}"]`).click(); await pg.waitForSelector(sel); await pg.waitForTimeout(300); };
    const rootNavs = await root.pg.locator('.nav-item[data-view]').evaluateAll((els) => els.map((x) => x.dataset.view));
    ok('Root sees 5 platform menus', ['platform', 'platform-communities', 'platform-reports', 'platform-config', 'platform-staff'].every((v) => rootNavs.includes(v)), rootNavs.join(','));
    await go(root.pg, 'platform-communities', '#pc-card');
    const rapi = (url, body) => root.pg.evaluate(async ([u, b]) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json(), [url, body]);
    ok('Root sees community card', await root.pg.locator('#pc-card').isVisible());
    const cm = await rapi('/api/platform/communities', { code: 'ui-thon', name: 'Thôn UI', type: 'village', area: 'Xã UI' });
    const qt = await rapi('/api/platform/tenants', { code: 'ui-quy', name: 'Quỹ thôn UI', kind: 'community', community_id: cm.data.id, owner_username: 'uiquy', owner_password: 'uiquy123' });
    await root.pg.reload(); await root.pg.waitForSelector('#pf-body tr[data-id]'); await root.pg.waitForTimeout(500);
    const pfText = await root.pg.locator('#pf-body').innerText();
    await go(root.pg, 'platform-communities', '#pc-body tr[data-id]');
    ok('Community listed with tenant count', /Thôn UI/.test(await root.pg.locator('#pc-body').innerText()) && /Sổ quỹ cộng đồng/.test(pfText), qt.error || '');
    await go(root.pg, 'platform', '#pf-body tr[data-id]');
    await root.pg.locator('#pf-new').click(); await root.pg.waitForTimeout(300);
    ok('Tenant form has kind + community selects', (await root.pg.locator('#tf-kind option').count()) === 3 && (await root.pg.locator('#tf-community option').count()) >= 2);
    await root.pg.locator('#tf-close').click(); await root.pg.waitForTimeout(200);
    // GĐ1.6: configurable community types + community config
    await rapi('/api/platform/community-types', { code: 'ui-xu', name: 'Giáo xứ UI', approver_label: 'Cha xứ' });
    await root.pg.reload(); await root.pg.waitForSelector('#pf-body'); await go(root.pg, 'platform-communities', '#ct-body tr[data-id]');
    ok('Community type card lists types', /Thôn/.test(await root.pg.locator('#ct-body').innerText()) && /Giáo xứ UI/.test(await root.pg.locator('#ct-body').innerText()));
    await root.pg.locator('#pc-new').click(); await root.pg.waitForTimeout(300);
    ok('New type in community type select', (await root.pg.locator('#cf-type option').allInnerTexts()).includes('Giáo xứ UI'));
    ok('Community form has config fields', await root.pg.locator('#cf-contact').isVisible() && await root.pg.locator('#cf-public').count() === 1 && await root.pg.locator('#cf-alert-days').inputValue() === '3');
    await root.pg.locator('#cf-close').click(); await root.pg.waitForTimeout(200);
    await root.pg.locator('#pc-body tr', { hasText: 'Thôn UI' }).locator('[data-act="members"]').click(); await root.pg.waitForTimeout(400);
    ok('Members modal lists community tenants', /ui-quy/.test(await root.pg.locator('#cm-body').innerText()));
    // GĐ1.7: vai trò nền tảng, thẻ ẩn theo quyền
    await root.pg.locator('#cm-close').click(); await root.pg.waitForTimeout(200);
    await go(root.pg, 'platform-staff', '#rl-body tr');
    ok('Root sees roles + staff cards', await root.pg.locator('#rl-card').isVisible() && await root.pg.locator('#st-card').isVisible() && (await root.pg.locator('#rl-body tr').count()) >= 5);
    await root.pg.locator('#rl-new').click(); await root.pg.waitForTimeout(300);
    ok('Role form has permission matrix', (await root.pg.locator('#rf-perms input[type=checkbox]').count()) >= 10);
    await root.pg.locator('#rf-close').click(); await root.pg.waitForTimeout(200);
    await rapi('/api/platform/staff', { username: 'uisup', password: 'uisup123', role: 'platform_support' });
    await root.c.close();
    const sup = await loginAs('uisup', 'uisup123', '#pf-body tr');
    const shown = async (id) => sup.pg.locator('#' + id).isVisible();
    const supNavs = await sup.pg.locator('.nav-item[data-view]').evaluateAll((els) => els.map((x) => x.dataset.view));
    ok('Support: only permitted menus (no config/staff)', supNavs.join(',') === 'platform,platform-communities,platform-reports', supNavs.join(','));
    ok('Support: create/edit buttons hidden', !(await shown('pf-new')) && (await sup.pg.locator('#pf-body [data-act="edit"]').count()) === 0);
    await go(sup.pg, 'platform-communities', '#pc-card');
    ok('Support sees communities read-only', await shown('pc-card') && !(await shown('pc-new')) && !(await shown('ct-new')));
    await sup.c.close();
    const quy = await loginAs('uiquy', 'uiquy123', '.nav-item[data-view]');
    const navs = await quy.pg.locator('.nav-item[data-view]').evaluateAll((els) => els.map((x) => x.dataset.view));
    ok('Community tenant has no POS menu', !['pos', 'products', 'inventory', 'promotions'].some((v) => navs.includes(v)), navs.join(','));
    ok('Community tenant has community menu', navs.includes('community'));
    await quy.pg.evaluate(() => window.showView('community')); await quy.pg.waitForTimeout(700);
    ok('Community summary renders', (await quy.pg.locator('#cm-stats .stat').count()) === 4);
    // ---------- Sổ quỹ (GĐ2.8) ----------
    ok('Funds menu present', navs.includes('funds'));
    await quy.pg.evaluate(() => window.showView('funds')); await quy.pg.waitForTimeout(500);
    await quy.pg.locator('#fd-new-fund').click(); await quy.pg.waitForTimeout(300);
    await quy.pg.locator('#fd-f-code').fill('ui-quy-chung');
    await quy.pg.locator('#fd-f-name').fill('Quỹ UI');
    await quy.pg.locator('#fd-f-account').fill('UIQUYACC');
    await quy.pg.locator('#fd-f-bin').fill('quân đội');
    ok('Bank search by alias, no diacritics needed', (await quy.pg.locator('#fd-f-bin-list [role=option]').allInnerTexts()).join('|').startsWith('MB Bank'));
    await quy.pg.locator('#fd-f-bin').press('ArrowDown'); await quy.pg.locator('#fd-f-bin').press('Enter');
    await quy.pg.locator('#fd-f-save').click(); await quy.pg.waitForTimeout(500);
    ok('Fund created and listed', (await quy.pg.locator('#fd-tabs').innerText()).includes('Quỹ UI'));
    const uiFund = (await quy.pg.evaluate(async () => (await (await fetch('/api/funds')).json()).data)).find((f) => f.code === 'ui-quy-chung');
    ok('Bank search saves BIN + name', uiFund && uiFund.bank_bin === '970422' && uiFund.bank_name === 'MB Bank', JSON.stringify(uiFund && [uiFund.bank_bin, uiFund.bank_name]));
    await quy.pg.locator('#fd-in').click(); await quy.pg.waitForTimeout(300);
    await quy.pg.locator('#fd-e-amount').pressSequentially('50000');
    ok('Money input formats thousands', (await quy.pg.locator('#fd-e-amount').inputValue()) === '50.000');
    await quy.pg.locator('#fd-e-payer').fill('Bà Năm');
    await quy.pg.locator('#fd-e-save').click(); await quy.pg.waitForTimeout(700);
    const balTxt = await quy.pg.locator('#fd-body .stat.primary .v').first().innerText();
    ok('Cash income updates balance', balTxt.includes('50.000'), balTxt);
    await quy.pg.locator('#fd-subtabs [data-tab="ledger"]').click(); await quy.pg.waitForTimeout(500);
    ok('Ledger shows the entry', (await quy.pg.locator('#fd-ledger-body').innerText()).includes('Bà Năm'));
    await quy.pg.locator('#fd-ledger-body tr', { hasText: 'Bà Năm' }).click(); await quy.pg.waitForTimeout(400);
    ok('Entry detail opens with anonymity toggle', (await quy.pg.locator('#fd-dt-anon').count()) === 1);
    await quy.pg.locator('#fd-dt-close').click(); await quy.pg.waitForTimeout(200);
    await quy.pg.locator('#fd-out').click(); await quy.pg.waitForTimeout(300);
    await quy.pg.locator('#fd-e-amount').fill('10000'); await quy.pg.locator('#fd-e-note').fill('Mua nước');
    await quy.pg.locator('#fd-e-save').click(); await quy.pg.waitForTimeout(700);
    ok('Draft without receipt shows in todo, submit disabled', (await quy.pg.locator('#fd-pending-body').innerText()).includes('Thiếu ảnh chứng từ')
      && await quy.pg.locator('#fd-pending-body [data-act="submit"]').isDisabled());
    await quy.pg.locator('#fd-qr').click(); await quy.pg.waitForTimeout(600);
    ok('Static fund QR renders', (await quy.pg.locator('#fd-qr-body img').count()) === 1);
    await quy.pg.locator('#fd-qr-close').click(); await quy.pg.waitForTimeout(200);
    await quy.pg.locator('#fd-subtabs [data-tab="report"]').click(); await quy.pg.waitForTimeout(600);
    ok('Period report renders', (await quy.pg.locator('#fd-rp-stats .stat').count()) === 6);
    await quy.pg.waitForTimeout(400);
    await quy.pg.locator('#fd-rc-stmt').pressSequentially('999999');
    // Quỹ này chỉ có thu tiền mặt nên hệ thống ghi nhận 0 qua ngân hàng; sao kê 999.999 -> lệch +999.999
    ok('Reconcile shows diff and asks for a note', /Sổ thiếu 999\.999/.test(await quy.pg.locator('#fd-rc-diff').innerText()) && await quy.pg.locator('#fd-rc-note-wrap').isVisible(),
      await quy.pg.locator('#fd-rc-diff').innerText());
    await quy.pg.setViewportSize({ width: 400, height: 820 }); await quy.pg.waitForTimeout(300);
    ok('Funds: no horizontal overflow 400px', !(await quy.pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)));
    ok('Funds: mobile action bar visible', await quy.pg.locator('.fd-bar').isVisible());
    await quy.c.close();
  } catch (e) { R.push('EXCEPTION: ' + e.message.split('\n')[0]); }
  R.push('--- JS errors: ' + (errors.length ? errors.join(' || ') : 'none'));
  console.log(R.join('\n'));
  console.log(`\n${R.filter((x) => x.startsWith('PASS')).length}/${R.filter((x) => /^(PASS|FAIL)/.test(x)).length} passed`);
  await browser.close();
  process.exit(R.some((x) => x.startsWith('FAIL') || x.startsWith('EXCEPTION')) ? 1 : 0);
})();
