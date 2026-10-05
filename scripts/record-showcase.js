// Video demo trình bày (không phải video kiểm thử): nhịp chậm, màn tiêu đề, phụ đề theo ngôn ngữ nghiệp vụ.
// Mỗi phần một video 1280x720, sau đó ghép thành một video tổng.
//
//   DATA_DIR=/tmp/showcase npm run seed:demo
//   PORT=3399 NO_BACKUP=1 DATA_DIR=/tmp/showcase npm start
//   CONGDUC=/congduc/<token> BASE=http://localhost:3399 node scripts/record-showcase.js
//
// Ra videos/demo-*.webm; chuyển MP4 + ghép bằng ffmpeg (xem cuối file / hướng dẫn trong commit).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3399';
const OUT = path.join(__dirname, '..', 'videos');
const PW = 'demo1234';
const VIEW = { width: 1280, height: 720 };
const PHONE_W = 400; // khung điện thoại đặt giữa màn hình cho phần người bán
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const expect = (part, what, cond) => { if (!cond) { problems.push(`${part}: ${what}`); console.log('  ! ' + what); } };

const OVERLAY = `(() => {
  if (window.__demo) return; window.__demo = 1;
  const s = document.createElement('style');
  s.textContent = '#demo-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:min(860px,94vw);z-index:2147483647;'
    + 'background:rgba(15,23,42,.94);color:#fff;font:600 20px/1.45 "Be Vietnam Pro",system-ui,sans-serif;padding:12px 22px;border-radius:12px;'
    + 'box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center;pointer-events:none;transition:opacity .35s}'
    + '#demo-cap small{display:block;font-weight:600;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#FBBF24;margin-bottom:3px}'
    + '#demo-ptr{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(217,119,6,.45);border:3px solid #D97706;z-index:2147483646;'
    + 'pointer-events:none;transform:translate(-50%,-50%);transition:left .45s ease,top .45s ease}'
    + '#demo-ptr.click{animation:dp .45s}@keyframes dp{50%{transform:translate(-50%,-50%) scale(1.9);background:rgba(217,119,6,.75)}}'
    + '.demo-hl{outline:3px solid #F59E0B!important;outline-offset:4px;border-radius:8px;transition:outline-color .3s}';
  document.head.appendChild(s);
  const c = document.createElement('div'); c.id = 'demo-cap'; c.style.opacity = 0; document.body.appendChild(c);
  const p = document.createElement('div'); p.id = 'demo-ptr'; p.style.left = '-60px'; document.body.appendChild(p);
  document.addEventListener('mousemove', (e) => { p.style.left = e.clientX + 'px'; p.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mousedown', () => { p.classList.remove('click'); void p.offsetWidth; p.classList.add('click'); }, true);
})()`;

const say = async (page, title, text, ms = 3200) => {
  await page.evaluate(OVERLAY).catch(() => {});
  await page.evaluate(([t, x]) => { const c = document.getElementById('demo-cap'); if (c) { c.innerHTML = (t ? `<small>${t}</small>` : '') + x; c.style.opacity = 1; } }, [title, text]).catch(() => {});
  await wait(ms);
};
const hide = (page) => page.evaluate(() => { const c = document.getElementById('demo-cap'); if (c) c.style.opacity = 0; }).catch(() => {});
async function point(page, target, ms = 900) {
  const loc = typeof target === 'string' ? page.locator(target).first() : target;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 }); }
  await wait(ms);
  return loc;
}
async function highlight(page, target, ms = 2200) {
  const loc = await point(page, target, 300);
  await loc.evaluate((el) => el.classList.add('demo-hl')).catch(() => {});
  await wait(ms);
  await loc.evaluate((el) => el.classList.remove('demo-hl')).catch(() => {});
}
async function click(page, target, ms = 1100) { const loc = await point(page, target, 450); await loc.click(); await wait(ms); }
async function type(page, sel, text, ms = 700) {
  await click(page, sel, 300);
  await page.locator(sel).first().fill('');
  await page.locator(sel).first().pressSequentially(String(text), { delay: 85 });
  await wait(ms);
}
async function login(page, user, label, pass = PW) {
  await page.context().clearCookies();
  await page.goto(BASE); await page.evaluate(OVERLAY);
  await page.waitForSelector('#login-screen:not(.hidden)');
  await say(page, 'Đăng nhập', label, 1600);
  await type(page, '#login-user', user, 200);
  await page.fill('#login-pass', pass);
  await click(page, '#login-submit', 400);
  await page.waitForSelector('#login-screen', { state: 'hidden' });
  await page.evaluate(OVERLAY); await wait(1300);
}
async function view(page, v) { await page.evaluate((x) => window.showView(x), v); await page.evaluate(OVERLAY); await wait(1400); }

// Màn tiêu đề: trang HTML tự dựng, cùng palette app
async function titleCard(page, kicker, title, lines, ms = 4200) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;600;700;800&display=swap">
    <style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0F1E4A,#1E40AF);
    font-family:"Be Vietnam Pro",system-ui,sans-serif;color:#fff}.w{max-width:900px;padding:40px;text-align:left}
    .k{color:#FBBF24;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:18px}
    h1{font-size:54px;line-height:1.15;margin:10px 0 22px;font-weight:800}ul{margin:0;padding:0;list-style:none}
    li{font-size:22px;line-height:1.6;color:#DBEAFE;padding-left:26px;position:relative}li:before{content:"";position:absolute;left:0;top:14px;width:10px;height:10px;border-radius:50%;background:#FBBF24}
    .f{margin-top:28px;font-size:15px;color:#93C5FD}</style></head><body><div class="w"><div class="k">${kicker}</div><h1>${title}</h1>
    <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><div class="f">POS Shop · Chuyển đổi số thanh toán cấp thôn</div></div></body></html>`);
  await wait(ms);
}

// Phần người bán quay ở khổ điện thoại, đặt trong khung giữa video 1280x720.
// Trang khung được trả về tại chính origin của app (page.route), nên iframe cùng site và cookie SameSite=Lax vẫn gửi.
async function phoneStage(page, url) {
  const stageUrl = BASE + '/__demo-phone';
  await page.route(stageUrl, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:linear-gradient(135deg,#E0E7FF,#F8FAFC);
    display:flex;align-items:center;justify-content:center;font-family:system-ui}.phone{width:${PHONE_W}px;height:690px;border-radius:34px;background:#0F172A;padding:12px;
    box-shadow:0 30px 60px -20px rgba(15,23,42,.45)}iframe{width:100%;height:100%;border:0;border-radius:24px;background:#fff}</style></head>
    <body><div class="phone"><iframe id="app" src="${url}"></iframe></div></body></html>` }));
  await page.goto(stageUrl);
  await wait(800);
  return page.frameLocator('#app');
}

const PARTS = [];

/* ============ Mở đầu ============ */
PARTS.push(['00-mo-dau', async (page) => {
  await titleCard(page, 'Demo sản phẩm', 'Chuyển đổi số thanh toán cấp thôn', [
    'Người bán nhận tiền bằng mã QR, tiền vào thẳng tài khoản của mình',
    'Thủ quỹ quản lý quỹ chung và công đức minh bạch',
    'Ban lãnh đạo theo dõi tiến độ, nền tảng quản trị nhiều cộng đồng',
  ], 6500);
}]);

/* ============ Phần 1: Quản trị nền tảng & cộng đồng (SKHGDT-3229) ============ */
PARTS.push(['01-cong-dong', async (page) => {
  const P = 'Phần 1';
  await titleCard(page, 'Phần 1 · SKHGDT-3229', 'Nền cộng đồng và phân quyền', ['Một nền tảng, nhiều thôn / chợ / chùa', 'Mỗi vai trò chỉ thấy đúng phần việc của mình']);
  await login(page, 'root', 'Quản trị nền tảng', 'root123');
  await view(page, 'platform-communities');
  await say(page, 'Cộng đồng', 'Mỗi thôn, chợ, chùa là một cộng đồng. Loại cộng đồng cấu hình được, không viết cứng cho một thôn.');
  await highlight(page, '#pc-body');
  const comTxt = await page.locator('#pc-body').innerText();
  expect(P, 'có đủ cộng đồng mẫu', ['Thôn An Phú', 'Chùa Phước Lâm'].every((n) => comTxt.includes(n)));
  await click(page, page.locator('#pc-body tr', { hasText: 'Thôn An Phú' }).locator('[data-act="members"]'));
  await say(page, 'Thành viên Thôn An Phú', 'Người bán trong thôn và tài khoản sổ quỹ của thôn. Mỗi người bán nhận tiền vào tài khoản riêng.');
  await click(page, '#cm-close');
  await view(page, 'platform-staff');
  await say(page, 'Vai trò nền tảng', 'Vận hành, hỗ trợ, kỹ thuật, cán bộ phụ trách từng cộng đồng: mỗi vai trò một bộ quyền.');
  await highlight(page, '#rl-body', 1800);
  await login(page, 'ql-thon-a', 'Cán bộ phụ trách Thôn An Phú');
  await view(page, 'platform-communities');
  await say(page, 'Phân quyền theo phạm vi', 'Cán bộ phụ trách chỉ thấy cộng đồng được giao, không thấy thôn khác.');
  expect(P, 'cán bộ chỉ thấy thôn A', !(await page.locator('#pc-body').innerText()).includes('Bình Minh'));
  await login(page, 'thon-a-truong', 'Trưởng thôn (ban lãnh đạo)');
  await view(page, 'community');
  await say(page, 'Ban lãnh đạo thôn', 'Chỉ xem số tổng hợp: bao nhiêu người bán đã chuyển đổi, bao nhiêu giao dịch. Không xem doanh thu từng nhà.', 4200);
  await highlight(page, '#cm-stats', 2000);
  await hide(page); await wait(600);
}]);

/* ============ Phần 2: Sổ quỹ & công đức (SKHGDT-3231) ============ */
PARTS.push(['02-so-quy', async (page) => {
  const P = 'Phần 2';
  await titleCard(page, 'Phần 2 · SKHGDT-3231', 'Sổ quỹ và công đức', ['Thu ghi sổ ngay, chi phải có chứng từ và người duyệt', 'Tồn quỹ không bao giờ âm, bút toán không xóa được', 'Công khai danh sách công đức']);
  await login(page, 'thon-a-thuquy', 'Thủ quỹ Thôn An Phú');
  await view(page, 'funds');
  await say(page, 'Màn hình thủ quỹ', 'Mỗi quỹ một thẻ, kèm tồn quỹ. Bên dưới là thu, chi tháng này và việc cần làm.', 3800);
  await highlight(page, '#fd-tabs', 1600);
  await highlight(page, '.fd-stats', 1800);
  await say(page, 'Thu tiền mặt', 'Bà con nộp tiền mặt: thủ quỹ nhập số tiền, tên người nộp, ghi sổ ngay.', 2400);
  await click(page, '#fd-in');
  await page.locator('#fd-e-amount').pressSequentially('500000', { delay: 110 }); await wait(500);
  await type(page, '#fd-e-payer', 'Bà Nguyễn Thị Sen');
  await click(page, '#fd-e-save', 1500);
  await say(page, 'Đã ghi sổ', 'Tồn quỹ tăng ngay 500.000 ₫.', 2400);
  await highlight(page, '#fd-body .stat.primary', 1600);
  await say(page, 'Lập phiếu chi', 'Chi tiền phải có ảnh chứng từ và phải được người khác duyệt.', 2600);
  await click(page, '#fd-out');
  await page.locator('#fd-e-amount').pressSequentially('350000', { delay: 110 });
  await type(page, '#fd-e-note', 'Thay bóng đèn đường ngõ 3');
  const png = path.join(require('os').tmpdir(), 'hoa-don-demo.png');
  fs.copyFileSync(path.join(__dirname, '..', 'public', 'icon-512.png'), png);
  await page.setInputFiles('#fd-e-file', png); await wait(1200);
  await say(page, 'Ảnh chứng từ', 'Chụp hóa đơn bằng điện thoại, có xem trước ngay.', 2200);
  await click(page, '#fd-e-send', 1600);
  await login(page, 'thon-a-duyet', 'Người duyệt chi (trưởng thôn hoặc người được ủy quyền)');
  await view(page, 'funds');
  await say(page, 'Việc chờ duyệt', 'Người duyệt thấy khoản chi đang chờ, xem chứng từ rồi duyệt hoặc từ chối.', 3200);
  const card = page.locator('.fd-task', { hasText: 'ngõ 3' });
  await click(page, card.locator('[data-act="view"]'), 2200);
  await click(page, '#fd-dt-close');
  await click(page, card.locator('[data-act="approve"]'), 1600);
  await say(page, 'Đã duyệt', 'Khoản chi được ghi sổ và trừ vào tồn quỹ. Hệ thống chặn duyệt nếu khoản chi vượt tồn quỹ.', 3400);
  await click(page, '#fd-subtabs [data-tab="ledger"]', 1400);
  await say(page, 'Sổ thu chi', 'Thu màu xanh, chi màu đỏ. Mọi bút toán giữ nguyên lịch sử, sai thì lập bút toán điều chỉnh.', 3600);
  await click(page, '#fd-subtabs [data-tab="report"]', 600);
  await click(page, '#fd-rp-preset [data-p="quarter"]', 1400);
  await say(page, 'Báo cáo kỳ', 'Tồn đầu kỳ, thu chuyển khoản, thu tiền mặt, chi, tồn cuối kỳ. Xuất Excel hoặc in để báo cáo với thôn.', 3800);
  expect(P, 'báo cáo 6 chỉ số', (await page.locator('#fd-rp-stats .stat').count()) === 6);
  if (process.env.CONGDUC) {
    await page.context().clearCookies();
    await page.goto(BASE + process.env.CONGDUC); await page.evaluate(OVERLAY); await wait(1200);
    await say(page, 'Công khai công đức', 'Trang công khai cho bà con xem. Ai xin giấu tên thì hiện "Người hảo tâm".', 3800);
    await page.mouse.move(640, 400); await page.mouse.wheel(0, 380); await wait(2200);
  }
  await hide(page); await wait(600);
}]);

/* ============ Phần 3: Đối soát & minh bạch (SKHGDT-3238) ============ */
PARTS.push(['03-doi-soat', async (page) => {
  const P = 'Phần 3';
  await titleCard(page, 'Phần 3 · SKHGDT-3238', 'Phân loại, đối soát và minh bạch', ['Tiền chưa rõ nguồn không lọt vào báo cáo', 'Tự kiểm mỗi đêm và cảnh báo', 'Đối chiếu sao kê ngân hàng hằng tháng']);
  await login(page, 'demo-taphoa-owner', 'Chủ tiệm tạp hóa Minh Anh');
  await view(page, 'vietqr');
  await page.selectOption('#vqt-preset', 'custom');
  await page.fill('#vqt-from', '2026-01-01'); await page.dispatchEvent('#vqt-from', 'change'); await wait(1200);
  await say(page, 'Cảnh báo tự động', 'Mỗi đêm hệ thống tự kiểm: có tiền vào chưa rõ là của hóa đơn nào quá 3 ngày thì báo ngay.', 3800);
  await highlight(page, '#vqt-alerts', 1800);
  await click(page, '#vqt-tabs [data-status="unmatched"]', 1200);
  await say(page, 'Hàng chờ phân loại', 'Các khoản này chưa tính vào doanh thu cho đến khi chủ tiệm xác nhận.', 3200);
  await click(page, page.locator('#vqt-body tr.vqt-pending').first(), 1400);
  await say(page, 'Phân loại', 'Gắn vào hóa đơn đang chờ, xác nhận là bán hàng, hoặc ghi là thu khác kèm lý do.', 3200);
  await page.check('input[name="vq-k"][value="other"]'); await wait(500);
  await type(page, '#vq-reason', 'Khách trả nợ tuần trước');
  await click(page, '#vq-ok', 1500);
  await say(page, 'Không đổi lại được', 'Đã phân loại là cố định và có ghi nhật ký. Không ai xóa được giao dịch ngân hàng.', 3400);
  await login(page, 'thon-a-thuquy', 'Thủ quỹ Thôn An Phú');
  await view(page, 'funds');
  await click(page, '#fd-subtabs [data-tab="report"]', 600);
  await click(page, '#fd-rp-preset [data-p="last"]', 1400);
  await point(page, '.fd-recon', 600);
  await say(page, 'Đối soát sao kê', 'Cuối tháng, thủ quỹ nhập tổng tiền vào theo sao kê ngân hàng. Hệ thống so với sổ.', 3400);
  const n = Number((await page.locator('#fd-rc-sys').innerText()).split(' ')[0].replace(/\D/g, '')) || 0;
  await type(page, '#fd-rc-stmt', String(n + 50000), 900);
  await say(page, 'Phát hiện chênh lệch', 'Sổ thiếu 50.000 ₫: phải ghi nguyên nhân rồi mới lưu được biên bản.', 3200);
  await type(page, '#fd-rc-note', 'Thiếu khoản 50.000 ngày 15, ngân hàng báo chậm');
  await click(page, '#fd-rc-save', 1500);
  await highlight(page, '#fd-rc-history', 2200);
  expect(P, 'biên bản lưu', (await page.locator('#fd-rc-history').innerText()).includes('ngân hàng báo chậm'));
  await hide(page); await wait(600);
}]);

/* ============ Phần 4: Người bán nhỏ (SKHGDT-3240) — khung điện thoại ============ */
PARTS.push(['04-nguoi-ban', async (page) => {
  const P = 'Phần 4';
  await titleCard(page, 'Phần 4 · SKHGDT-3240', 'Người bán nhỏ nhận tiền bằng điện thoại', ['3 lần chạm cho một lần bán', 'Hạng mục hàng dùng chung của thôn', 'Báo cáo doanh thu theo hạng mục']);
  // Đăng nhập qua trang chính để có cookie, rồi nhúng app vào khung điện thoại
  // Đăng nhập bằng API (cùng cookie của context) để app chỉ chạy trong khung điện thoại
  await page.context().clearCookies();
  const lr = await page.context().request.post(BASE + '/api/auth/login', { data: { username: 'ban-rau-ba-nam-owner', password: PW } });
  expect(P, 'đăng nhập người bán', lr.ok());
  const app = await phoneStage(page, BASE + '/');
  await page.evaluate(OVERLAY);
  await app.locator('#qp-amount').waitFor({ timeout: 8000 });
  await wait(800);
  await say(page, 'Hàng rau bà Năm', 'Mở ứng dụng là vào ngay màn Nhận tiền. Có thể cài như ứng dụng trên điện thoại.', 3600);
  // Sự kiện chuột đi vào iframe nên con trỏ ở trang khung không tự theo: đặt vị trí bằng tay
  const ptr = (x, y, click) => page.evaluate(([px, py, c]) => { const p = document.getElementById('demo-ptr'); if (!p) return; p.style.left = px + 'px'; p.style.top = py + 'px';
    if (c) { p.classList.remove('click'); void p.offsetWidth; p.classList.add('click'); } }, [x, y, click]);
  const tap = async (sel) => {
    const loc = app.locator(sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (b) { await ptr(b.x + b.width / 2, b.y + b.height / 2); await wait(600); await ptr(b.x + b.width / 2, b.y + b.height / 2, true); }
    await loc.click(); await wait(900);
  };
  await say(page, 'Chạm 1, 2', 'Khách mua 70.000 ₫: chạm +50k rồi +20k.', 1800);
  await tap('#qp-quick [data-q="50000"]'); await tap('#qp-quick [data-q="20000"]');
  await say(page, 'Chạm 3', 'Chạm hạng mục "Rau củ" là hiện ngay mã QR có sẵn số tiền.', 2000);
  await tap('.qp-cat:has-text("Rau củ")');
  await app.locator('#qp-pay img').waitFor({ timeout: 8000 }); await wait(800);
  await say(page, 'Khách quét mã', 'Khách quét bằng app ngân hàng, tiền vào thẳng tài khoản của bà Năm.', 3000);
  await tap('#qp-sim'); await wait(3600);
  await say(page, 'Đã nhận tiền', 'Ngân hàng báo về, màn hình tự chuyển xanh. Không cần xem lại app ngân hàng.', 3400);
  expect(P, 'đã nhận', (await app.locator('#qp-wait').innerText()).includes('Đã nhận'));
  await tap('#qp-done');
  await app.locator('.qp-today').scrollIntoViewIfNeeded(); await wait(700);
  await say(page, 'Giao dịch hôm nay', 'Danh sách trong ngày, tổng tiền. Chạm vào một dòng để đổi hạng mục nếu chọn nhầm.', 3400);
  await app.locator('.qp-report').scrollIntoViewIfNeeded(); await wait(900);
  await say(page, 'Báo cáo của người bán', 'Doanh thu theo hạng mục và theo ngày. Bà Năm chỉ thấy số của mình.', 3800);
  await tap('#qp-rp-range [data-r="last"]'); await wait(1200);
  await app.locator('.qp-amount-box').scrollIntoViewIfNeeded(); await wait(500);
  await tap('#qp-static'); await wait(1000);
  await say(page, 'QR dán quầy', 'In QR dán ở quầy: khách tự nhập số tiền, cuối ngày bà Năm phân loại các khoản này.', 3600);
  await tap('#qp-st-close');
  await hide(page); await wait(500);
  // Trưởng thôn quản lý hạng mục
  await login(page, 'thon-a-duyet', 'Trưởng thôn quản lý danh mục');
  await view(page, 'community');
  await point(page, '#cm-cat-card', 600);
  await say(page, 'Hạng mục dùng chung', 'Trưởng thôn quản lý danh mục cho cả thôn; người bán chỉ chọn, không tự thêm.', 3600);
  await type(page, '#cm-cat-name', 'Hoa tươi');
  await click(page, '#cm-cat-form button[type=submit]', 1400);
  await say(page, 'Áp dụng ngay', 'Hạng mục mới xuất hiện trên điện thoại của mọi người bán trong thôn.', 3000);
  await hide(page); await wait(600);
}]);

/* ============ Kết ============ */
PARTS.push(['99-ket', async (page) => {
  await titleCard(page, 'Tóm tắt', 'Sẵn sàng thí điểm', [
    'Người bán: nhận tiền 3 chạm, tiền vào thẳng tài khoản riêng',
    'Thủ quỹ: sổ quỹ có chứng từ, người duyệt, đối soát sao kê',
    'Thôn: công khai công đức, ban lãnh đạo xem số tổng hợp',
    'Hệ thống: không giữ tiền, không xóa được giao dịch, tự cảnh báo',
  ], 7000);
}]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  for (const [name, fn] of PARTS) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    console.log('▶ ' + name);
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW }, locale: 'vi-VN', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    try { await fn(page); } catch (e) { problems.push(`${name}: ${e.message.split('\n')[0]}`); console.log('  ! ' + e.message.split('\n')[0]); }
    if (errs.length) problems.push(`${name}: JS ${errs.join(' | ')}`);
    const v = page.video(); await ctx.close(); await browser.close();
    if (v) fs.renameSync(await v.path(), path.join(OUT, `demo-${name}.webm`));
  }
  console.log(problems.length ? `\n${problems.length} vấn đề:\n` + problems.join('\n') : '\nQuay xong, không có vấn đề.');
  process.exit(problems.length ? 1 : 0);
})();
