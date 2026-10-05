// Quay video demo + kiểm thử từng ticket (GĐ1–GĐ4). Mỗi ticket một video WebM, có phụ đề tiếng Việt trên màn hình.
// Mỗi bước vừa thao tác vừa kiểm tra kết quả; cuối cùng in bảng PASS/FAIL.
//
//   DATA_DIR=/tmp/demo node scripts/seed-demo.js           # dữ liệu mẫu riêng cho video
//   PORT=3399 DATA_DIR=/tmp/demo npm start                  # server ở cổng khác
//   CONGDUC=/congduc/<token> BASE=http://localhost:3399 node scripts/record-demo.js [SKHGDT-3229 ...]
//   (CONGDUC lấy từ dòng "Công đức công khai thon-a" khi chạy seed)
//
// Video ra thư mục videos/ (đã .gitignore), kèm ket-qua.json. Chuyển MP4:
//   for f in videos/*.webm; do ffmpeg -i "$f" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${f%.webm}.mp4"; done
// Kịch bản ghi dữ liệu vào DB (thu tiền, duyệt, phân loại…): chạy trên DATA_DIR riêng, seed lại trước mỗi lần quay.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3399';
const OUT = path.join(__dirname, '..', 'videos');
const PW = 'demo1234';
const R = [];
const check = (ticket, name, cond, extra = '') => { R.push({ ticket, name, ok: !!cond, extra }); console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Phụ đề + con trỏ chuột hiển thị trong video (Playwright không quay con trỏ thật)
const OVERLAY = `(() => {
  if (window.__demo) return; window.__demo = 1;
  const s = document.createElement('style');
  s.textContent = '#demo-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:92vw;z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;'
    + 'font:600 18px/1.4 "Be Vietnam Pro",system-ui,sans-serif;padding:10px 18px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);text-align:center;pointer-events:none;transition:opacity .2s}'
    + '#demo-cap small{display:block;font-weight:500;font-size:13px;color:#93C5FD;margin-bottom:2px}'
    + '#demo-ptr{position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(217,119,6,.55);border:2px solid #D97706;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);transition:left .25s,top .25s}'
    + '#demo-ptr.click{animation:dp .35s}@keyframes dp{50%{transform:translate(-50%,-50%) scale(1.8)}}';
  document.head.appendChild(s);
  const c = document.createElement('div'); c.id = 'demo-cap'; c.style.opacity = 0; document.body.appendChild(c);
  const p = document.createElement('div'); p.id = 'demo-ptr'; p.style.left = '-50px'; document.body.appendChild(p);
  document.addEventListener('mousemove', (e) => { p.style.left = e.clientX + 'px'; p.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mousedown', () => { p.classList.remove('click'); void p.offsetWidth; p.classList.add('click'); }, true);
})()`;

async function caption(page, title, text, ms = 1800) {
  await page.evaluate(OVERLAY).catch(() => {});
  await page.evaluate(([t, x]) => { const c = document.getElementById('demo-cap'); if (!c) return; c.innerHTML = (t ? `<small>${t}</small>` : '') + x; c.style.opacity = 1; }, [title, text]).catch(() => {});
  await wait(ms);
}
async function click(page, sel, opts = {}) {
  const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await wait(200); }
  await loc.click(opts); await wait(500);
}
async function type(page, sel, text) {
  await click(page, sel);
  await page.locator(sel).first().fill('');
  await page.locator(sel).first().pressSequentially(String(text), { delay: 45 });
  await wait(300);
}
async function login(page, user, pass = PW) {
  await page.context().clearCookies();
  await page.goto(BASE); await page.evaluate(OVERLAY);
  await page.waitForSelector('#login-screen:not(.hidden)');
  await caption(page, 'Đăng nhập', `Tài khoản <b>${user}</b>`, 900);
  await type(page, '#login-user', user);
  await page.fill('#login-pass', pass);
  await click(page, '#login-submit');
  await page.waitForSelector('#login-screen', { state: 'hidden' });
  await page.evaluate(OVERLAY); await wait(900);
}
async function go(page, view) { await page.evaluate((v) => window.showView(v), view); await page.evaluate(OVERLAY); await wait(1000); }
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '');

async function record(name, viewport, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: OUT, size: viewport }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  console.log(`\n▶ ${name}`);
  try { await fn(page); } catch (e) { check(name, 'Kịch bản chạy hết không lỗi', false, e.message.split('\n')[0]); }
  check(name, 'Không có lỗi JavaScript', !errs.length, errs.join(' | ').slice(0, 160));
  const v = page.video();
  await ctx.close(); await browser.close();
  const file = path.join(OUT, `${name}.webm`);
  if (v) fs.renameSync(await v.path(), file);
  return file;
}

/* ============================ Kịch bản ============================ */
const DESK = { width: 1366, height: 820 };
const PHONE = { width: 414, height: 860 };

const SCENES = {
  // GĐ1: nền cộng đồng, vai trò, phân quyền nền tảng
  'SKHGDT-3229': async (page) => {
    const T = 'SKHGDT-3229';
    await login(page, 'root', 'root123');
    await caption(page, 'GĐ1 · Nền cộng đồng', 'Quản trị nền tảng: các menu tách riêng theo quyền');
    check(T, 'Root thấy đủ 5 menu nền tảng', (await page.locator('.nav-item[data-view^="platform"]').count()) === 5);
    await go(page, 'platform-communities');
    await caption(page, 'Cộng đồng', 'Thôn, chợ, chùa… là các loại cộng đồng cấu hình được');
    const comText = await text(page, '#pc-body');
    check(T, 'Danh sách có 4 cộng đồng mẫu (thôn A, B, chợ C, chùa)', ['Thôn An Phú', 'Thôn Bình Minh', 'Chợ Phước Hòa', 'Chùa Phước Lâm'].every((n) => comText.includes(n)));
    await click(page, page.locator('#pc-body tr', { hasText: 'Thôn An Phú' }).locator('[data-act="members"]'));
    await caption(page, 'Thành viên cộng đồng', 'Người bán và tài khoản sổ quỹ thuộc Thôn An Phú');
    check(T, 'Thôn A có người bán nhỏ trong danh sách thành viên', (await text(page, '#cm-body')).includes('Hàng rau bà Năm'));
    await click(page, '#cm-close');
    await go(page, 'platform-staff');
    await caption(page, 'Vai trò nền tảng (SEC-04)', 'Ma trận quyền: vận hành, hỗ trợ, kỹ thuật, phụ trách cộng đồng');
    check(T, 'Có bảng vai trò và nhân sự', (await page.locator('#rl-body tr').count()) >= 5 && (await page.locator('#st-body tr').count()) >= 4);

    await login(page, 'hotro');
    await caption(page, 'Nhân sự hỗ trợ (ERR-08)', 'Chỉ thấy menu được cấp, không có nút tạo / sửa');
    const sNavs = await page.locator('.nav-item[data-view]').evaluateAll((e) => e.map((x) => x.dataset.view));
    check(T, 'Hỗ trợ không thấy menu cấu hình / nhân sự', !sNavs.includes('platform-config') && !sNavs.includes('platform-staff'), sNavs.join(','));

    await login(page, 'ql-thon-a');
    await go(page, 'platform-communities');
    await caption(page, 'Phụ trách theo phạm vi (ERR-08)', 'Cán bộ thôn A chỉ thấy cộng đồng được giao');
    const scoped = await text(page, '#pc-body');
    check(T, 'Cán bộ thôn A chỉ thấy Thôn An Phú', scoped.includes('Thôn An Phú') && !scoped.includes('Thôn Bình Minh'));

    await login(page, 'thon-a-truong');
    await caption(page, 'Ban lãnh đạo thôn (BR-09)', 'Chỉ số tổng hợp, không có doanh thu từng người bán');
    await go(page, 'community');
    const stats = await page.locator('#cm-stats .stat').count();
    check(T, 'Tổng hợp cộng đồng hiện 4 chỉ số', stats === 4);
    const navs = await page.locator('.nav-item[data-view]').evaluateAll((e) => e.map((x) => x.dataset.view));
    check(T, 'Ban lãnh đạo không có menu bán hàng', !navs.includes('pos') && !navs.includes('invoices'), navs.join(','));
    const api = await page.evaluate(async () => (await fetch('/api/invoices')).status);
    check(T, 'Gọi thẳng API hóa đơn bị chặn 403', api === 403);
    await caption(page, 'Kết thúc GĐ1', 'Phân quyền theo vai trò và theo phạm vi cộng đồng', 1500);
  },

  // GĐ2: sổ quỹ và công đức
  'SKHGDT-3231': async (page) => {
    const T = 'SKHGDT-3231';
    await login(page, 'thon-a-thuquy');
    await go(page, 'funds');
    await caption(page, 'GĐ2 · Sổ quỹ', 'Thủ quỹ thấy các quỹ, tồn quỹ, thu chi tháng này và việc cần làm');
    check(T, 'Có 4 quỹ của thôn (gồm quỹ Tết đã đóng)', (await page.locator('#fd-tabs .fd-chip').count()) === 4);
    check(T, 'Tab Việc cần làm có thẻ việc', (await page.locator('#fd-pending-body .fd-task').count()) >= 1);
    await caption(page, 'Thu tiền mặt (FR-19)', 'Gõ số tiền, tự thêm dấu chấm hàng nghìn');
    await click(page, '#fd-in');
    await page.locator('#fd-e-amount').pressSequentially('250000', { delay: 60 });
    check(T, 'Ô tiền định dạng 250.000', (await page.inputValue('#fd-e-amount')) === '250.000');
    await type(page, '#fd-e-payer', 'Bà Nguyễn Thị Sen');
    const bal0 = await text(page, '#fd-body .stat.primary .v');
    await click(page, '#fd-e-save'); await wait(800);
    const bal1 = await text(page, '#fd-body .stat.primary .v');
    check(T, 'Thu ghi sổ ngay, tồn quỹ tăng', bal0 !== bal1, `${bal0} → ${bal1}`);
    await caption(page, 'Lập phiếu chi (ERR-05)', 'Chưa có ảnh chứng từ thì không gửi duyệt được');
    await click(page, '#fd-out');
    await type(page, '#fd-e-amount', '80000');
    await type(page, '#fd-e-note', 'Mua bóng đèn ngõ 3');
    await click(page, '#fd-e-save'); await wait(800);
    const draft = page.locator('.fd-task', { hasText: 'Mua bóng đèn ngõ 3' });
    check(T, 'Phiếu nháp hiện "Thiếu ảnh chứng từ", nút Gửi duyệt bị khóa', (await draft.innerText()).includes('Thiếu ảnh') && await draft.locator('[data-act="submit"]').isDisabled());
    await caption(page, 'Bổ sung ảnh chứng từ', 'Sửa phiếu nháp, chọn ảnh, rồi gửi duyệt');
    await click(page, draft.locator('[data-act="edit"]'));
    const png = path.join(require('os').tmpdir(), 'chung-tu-demo.png');
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    await page.setInputFiles('#fd-e-file', png); await wait(500);
    await click(page, '#fd-e-send'); await wait(900);
    check(T, 'Gửi duyệt thành công', (await text(page, '#toast')).includes('gửi duyệt') || (await page.locator('.fd-task', { hasText: 'Mua bóng đèn ngõ 3' }).innerText()).includes('chờ'));

    await login(page, 'thon-a-duyet');
    await go(page, 'funds');
    await caption(page, 'Người duyệt (BR-05, ERR-06)', 'Duyệt hoặc từ chối khoản chi do người khác lập');
    const card = page.locator('.fd-task', { hasText: 'Mua bóng đèn ngõ 3' });
    await click(page, card.locator('[data-act="view"]'));
    check(T, 'Xem được ảnh chứng từ', (await page.locator('#modal-box img.fd-receipt').count()) === 1);
    await click(page, '#fd-dt-close');
    await click(page, card.locator('[data-act="approve"]')); await wait(800);
    check(T, 'Duyệt xong, thẻ biến mất', (await page.locator('.fd-task', { hasText: 'Mua bóng đèn ngõ 3' }).count()) === 0);
    await caption(page, 'Từ chối phải ghi lý do', 'Khoản "Phát quang bụi rậm" đang chờ');
    const rej = page.locator('.fd-task', { hasText: 'bụi rậm' }).first();
    if (await rej.count()) {
      await click(page, rej.locator('[data-act="reject"]'));
      await type(page, '#fd-rj-reason', 'Thiếu báo giá, bổ sung giúp');
      await click(page, '#fd-rj-ok'); await wait(700);
      check(T, 'Từ chối kèm lý do thành công', (await text(page, '#toast')).includes('từ chối'));
    }
    await caption(page, 'Sổ thu chi', 'Thu xanh, chi đỏ; bấm dòng xem chi tiết');
    await click(page, '#fd-subtabs [data-tab="ledger"]');
    check(T, 'Sổ thu chi có dòng thu và chi', (await page.locator('#fd-ledger-body .fd-pos').count()) > 0 && (await page.locator('#fd-ledger-body .fd-neg').count()) > 0);
    await caption(page, 'Báo cáo kỳ (BR-12)', 'Tồn đầu kỳ + thu − chi ± điều chỉnh = tồn cuối kỳ');
    await click(page, '#fd-subtabs [data-tab="report"]');
    await click(page, '#fd-rp-preset [data-p="quarter"]'); await wait(800);
    check(T, 'Báo cáo kỳ đủ 6 chỉ số', (await page.locator('#fd-rp-stats .stat').count()) === 6);
    await caption(page, 'Quỹ đã đóng', 'Quỹ Tết đã quyết toán: không còn nút nhập');
    await click(page, page.locator('#fd-tabs .fd-chip', { hasText: 'Tết' }));
    check(T, 'Quỹ đã đóng không có nút Thu tiền', (await page.locator('#fd-in').count()) === 0);

    await page.context().clearCookies();
    const link = process.env.CONGDUC || '';
    if (link) {
      await page.goto(BASE + link); await page.evaluate(OVERLAY); await wait(800);
      await caption(page, 'Trang công đức công khai (FR-20)', 'Chỉ quỹ công đức, người xin ẩn danh hiện "Người hảo tâm"', 2200);
      const pub = await text(page, '#dn-programs');
      check(T, 'Trang công khai có "Người hảo tâm", không lộ quỹ chung', pub.includes('Người hảo tâm') && !pub.includes('Quỹ chung'));
      await page.mouse.wheel(0, 500); await wait(800);
    }
    await caption(page, 'Kết thúc GĐ2', 'Sổ bút toán bất biến, người duyệt khác người lập, chi không vượt tồn', 1500);
  },

  // GĐ3: phân loại, bất biến, đối soát, cảnh báo
  'SKHGDT-3238': async (page) => {
    const T = 'SKHGDT-3238';
    await login(page, 'demo-taphoa-owner');
    await go(page, 'vietqr');
    await caption(page, 'GĐ3 · Cảnh báo tự kiểm (NFR-03)', 'Giao dịch chưa phân loại quá 3 ngày được báo ngay đầu trang');
    await page.selectOption('#vqt-preset', 'custom');
    await page.fill('#vqt-from', '2026-01-01'); await page.dispatchEvent('#vqt-from', 'change'); await wait(900);
    check(T, 'Dải cảnh báo hiện', (await text(page, '#vqt-alerts')).includes('chưa phân loại'));
    await caption(page, 'Hàng chờ phân loại (ERR-03)', 'Tiền chưa rõ thuộc hóa đơn nào không vào báo cáo');
    await click(page, '#vqt-tabs [data-status="unmatched"]'); await wait(700);
    const before = await page.locator('#vqt-body tr.vqt-pending').count();
    check(T, 'Có giao dịch chờ phân loại', before > 0, String(before));
    await click(page, page.locator('#vqt-body tr.vqt-pending').first());
    await caption(page, 'Phân loại', 'Chọn "Thu khác" thì bắt buộc ghi lý do');
    await page.check('input[name="vq-k"][value="other"]');
    await click(page, '#vq-ok'); await wait(500);
    check(T, 'Thiếu lý do bị chặn', (await text(page, '#toast')).includes('lý do'));
    await type(page, '#vq-reason', 'Khách trả nợ cũ');
    await click(page, '#vq-ok'); await wait(900);
    check(T, 'Phân loại xong, hàng chờ giảm 1', (await page.locator('#vqt-body tr.vqt-pending').count()) === before - 1);

    await login(page, 'demo-taphoa-thungan');
    await go(page, 'vietqr');
    await page.selectOption('#vqt-preset', 'custom');
    await page.fill('#vqt-from', '2026-01-01'); await page.dispatchEvent('#vqt-from', 'change'); await wait(800);
    await click(page, '#vqt-tabs [data-status="unmatched"]'); await wait(600);
    await caption(page, 'Thu ngân không được phân loại', 'Phân loại = xác nhận đã nhận tiền, chỉ chủ / quản lý');
    check(T, 'Thu ngân không có dòng bấm được', (await page.locator('#vqt-body tr.vqt-pending').count()) === 0);

    await login(page, 'thon-a-thuquy');
    await go(page, 'funds');
    await caption(page, 'Đối soát sao kê (ERR-01)', 'So tổng tiền vào theo sao kê với sổ; lệch phải ghi nguyên nhân');
    await click(page, '#fd-subtabs [data-tab="report"]');
    await click(page, '#fd-rp-preset [data-p="last"]'); await wait(900);
    await page.locator('.fd-recon').scrollIntoViewIfNeeded();
    const n = Number((await text(page, '#fd-rc-sys')).split(' ')[0].replace(/\D/g, '')) || 0;
    await type(page, '#fd-rc-stmt', String(n + 30000));
    check(T, 'Hiện "Sổ thiếu 30.000"', (await text(page, '#fd-rc-diff')).includes('30.000'));
    await type(page, '#fd-rc-note', 'Thiếu khoản 30.000 ngày 12, đã báo ngân hàng');
    await click(page, '#fd-rc-save'); await wait(900);
    check(T, 'Biên bản đối soát lưu vào lịch sử', (await text(page, '#fd-rc-history')).includes('Thiếu khoản 30.000'));
    await caption(page, 'Lịch sử đối soát', 'Biên bản không sửa, không xóa được', 1800);

    await login(page, 'root', 'root123');
    await caption(page, 'Bất biến & nhật ký (ERR-07, SEC-05)', 'Không có API xóa giao dịch; nhật ký khóa ở tầng CSDL');
    const del = await page.evaluate(async () => (await fetch('/api/vietqr/transactions/1', { method: 'DELETE' })).status);
    check(T, 'Không có đường xóa giao dịch (404/403)', del === 404 || del === 403, String(del));
    const alerts = await page.evaluate(async () => (await (await fetch('/api/platform/alerts')).json()).data.length);
    check(T, 'Nền tảng thấy danh sách cảnh báo', alerts > 0, String(alerts));
    await caption(page, 'Kết thúc GĐ3', 'Tiền chưa rõ có người xử lý; không có đường xóa tiền khỏi hệ thống', 1600);
  },

  // GĐ4: người bán nhỏ — quay ở khổ điện thoại
  'SKHGDT-3240': async (page) => {
    const T = 'SKHGDT-3240';
    await login(page, 'thon-a-duyet');
    await go(page, 'community');
    await caption(page, 'GĐ4 · Hạng mục dùng chung (BR-11)', 'Trưởng thôn quản lý; người bán chỉ chọn');
    await page.locator('#cm-cat-card').scrollIntoViewIfNeeded();
    await type(page, '#cm-cat-name', 'Hoa tươi');
    await click(page, '#cm-cat-form button[type=submit]'); await wait(700);
    check(T, 'Thêm hạng mục "Hoa tươi"', (await page.locator('#cm-cat-body input').evaluateAll((e) => e.map((x) => x.value))).includes('Hoa tươi'));
    await type(page, '#cm-cat-name', 'hoa TƯƠI');
    await click(page, '#cm-cat-form button[type=submit]'); await wait(600);
    check(T, 'Trùng tên (khác hoa/thường có dấu) bị chặn', (await text(page, '#toast')).includes('đã có'));

    await login(page, 'ban-rau-ba-nam-owner');
    await caption(page, 'Nhận tiền nhanh (4.1)', 'Màn đầu tiên của người bán: số tiền → hạng mục → QR');
    check(T, 'Màn mở đầu là Nhận tiền', await page.evaluate(() => document.querySelector('.view.active')?.id) === 'view-quickpay');
    check(T, 'Có hạng mục mới "Hoa tươi" để chọn', (await page.locator('#qp-cats .qp-cat').allInnerTexts()).includes('Hoa tươi'));
    let taps = 0;
    await click(page, '#qp-quick [data-q="50000"]'); taps++;
    await click(page, '#qp-quick [data-q="20000"]'); taps++;
    await caption(page, 'Chạm hạng mục', 'Tổng 3 chạm cho một lần bán');
    await click(page, page.locator('#qp-cats .qp-cat', { hasText: 'Rau củ' })); taps++;
    await page.waitForSelector('#qp-pay img', { timeout: 6000 });
    check(T, `QR có số tiền sau ${taps} chạm`, (await text(page, '.qp-pay-amt')).includes('70.000'));
    await caption(page, 'Khách quét mã', 'Khi ngân hàng báo về, màn hình tự chuyển xanh', 1500);
    await click(page, '#qp-sim'); await wait(4200);
    check(T, 'Hiện "Đã nhận 70.000"', (await text(page, '#qp-wait')).includes('Đã nhận'));
    await click(page, '#qp-done'); await wait(700);
    await caption(page, 'Đổi hạng mục sau (AC-02-1)', 'Hạng mục là nhãn, đổi được, có ghi nhật ký');
    await click(page, page.locator('#qp-list .qp-row').first());
    await click(page, page.locator('#modal-box [data-set]', { hasText: 'Trái cây' }));
    check(T, 'Dòng mới nhất đổi sang "Trái cây"', (await text(page, '#qp-list .qp-row')).includes('Trái cây'));
    await caption(page, 'QR dán quầy (4.2)', 'Khách tự nhập số tiền; tiền về vào hàng chờ phân loại');
    await click(page, '#qp-static'); await wait(700);
    check(T, 'QR dán quầy hiển thị', (await page.locator('#modal-box .qp-pay img').count()) === 1);
    await click(page, '#qp-st-close');
    await caption(page, 'Báo cáo người bán (4.5)', 'Doanh thu theo hạng mục; có dòng "Chưa gắn hạng mục"');
    await page.locator('.qp-report').scrollIntoViewIfNeeded(); await wait(800);
    const cats = await page.locator('#qp-rp-cats .qp-bar .n').allInnerTexts();
    check(T, 'Báo cáo có "Rau củ" và "Chưa gắn hạng mục"', cats.includes('Rau củ') && cats.includes('Chưa gắn hạng mục'), cats.join(','));
    const rep = await page.evaluate(async () => (await (await fetch('/api/reports/seller?from=2000-01-01&to=2999-12-31')).json()).data);
    check(T, 'Tổng các hạng mục = tổng doanh thu (AC-03-2)', rep.categories.reduce((s, c) => s + c.revenue, 0) === rep.revenue);
    check(T, 'Không tràn ngang trên điện thoại', !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)));

    await login(page, 'ban-rau-ba-nam-phu');
    await caption(page, 'Người phụ bán (thu ngân)', 'Bán được, nhưng không có nút hủy giao dịch');
    await click(page, '#qp-quick [data-q="10000"]');
    await click(page, page.locator('#qp-cats .qp-cat').first());
    await page.waitForSelector('#qp-pay img', { timeout: 6000 });
    check(T, 'Người phụ bán không có nút Hủy', (await page.locator('#qp-cancel').count()) === 0);
    await click(page, '#qp-done');
    await caption(page, 'Kết thúc GĐ4', 'Người bán nhỏ: nhận tiền 3 chạm, hạng mục chung của thôn', 1600);
  },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
  for (const t of want) await record(t, t === 'SKHGDT-3240' ? PHONE : DESK, SCENES[t]);
  const fail = R.filter((x) => !x.ok);
  console.log(`\n${R.length - fail.length}/${R.length} kiểm tra đạt`);
  for (const f of fail) console.log(`  FAIL [${f.ticket}] ${f.name} ${f.extra}`);
  fs.writeFileSync(path.join(OUT, 'ket-qua.json'), JSON.stringify(R, null, 2));
  process.exit(fail.length ? 1 : 0);
})();
