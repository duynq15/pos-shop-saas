'use strict';

// Render trang báo cáo công khai thành PDF do server tự tạo (Playwright/Chromium).
// Nhờ vậy PDF không có đầu trang/chân trang của trình duyệt (không lộ URL chứa token)
// và giữ được đầy đủ màu (printBackground). Nếu máy chủ không có Playwright, route gọi
// sẽ trả lỗi và giao diện tự chuyển sang hộp thoại in của trình duyệt.

let browserP = null;

function available() {
  try { require.resolve('playwright'); return true; } catch { return false; }
}

async function getBrowser() {
  if (!browserP) {
    const { chromium } = require('playwright');
    browserP = chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      .catch((e) => { browserP = null; throw e; });
  }
  return browserP;
}

async function renderPdf(url) {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1700 } });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(
      () => { const el = document.getElementById('rp-generated'); return !!el && el.textContent.trim().length > 0; },
      null, { timeout: 20000 },
    ).catch(() => {});
    await page.waitForTimeout(500);
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { renderPdf, available };
