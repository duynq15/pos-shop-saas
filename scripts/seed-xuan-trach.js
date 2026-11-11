'use strict';

/*
 * Dữ liệu mẫu đầy đủ cho thôn Xuân Trạch (tenant quy-xuan-trach) theo thiết kế App Làng Số (W03, W03a, W03b).
 * Chỉ thêm / cập nhật, không xoá và không sửa bút toán đã có. Chạy lại nhiều lần không nhân đôi.
 *
 *   node scripts/seed-xuan-trach.js --render <dir>              # máy có Playwright: in tài liệu PDF có dấu ra <dir>
 *   DATA_DIR=/data node scripts/seed-xuan-trach.js [--pdf <dir>] # ghi dữ liệu; thiếu PDF thì dùng PDF chữ không dấu
 *
 * Việc làm:
 *  - Bật "nhiều quỹ dùng chung một tài khoản"; quỹ chưa có tài khoản dùng tài khoản của Quỹ Chuyển đổi số (để có QR),
 *    mỗi quỹ một mã nội dung chuyển khoản (QT26, KH26…).
 *  - Mỗi quỹ: tính chất (Bắt buộc / Vận động / Tự nguyện), mức đóng, đơn vị quản lý, hình thức nộp, nội dung dài, tài liệu đính kèm.
 *  - Thêm: Quỹ vận động Màn hình LED (mục tiêu 100 triệu), Quỹ quốc phòng – an ninh 2026 (ngừng thu, vẫn chi),
 *    Quỹ phòng chống thiên tai 2025 (đã khoá sổ, có biên bản).
 *  - Khoản thu gắn mã hộ thật (danh sách hộ đồng bộ từ Hành chính) để App hiện "Tôi đã đóng / Cần đóng".
 */

const path = require('path');
const fs = require('fs');

const TENANT = 'quy-xuan-trach';
const SHARED_FROM = 'quy-duong-xom-dong'; // Quỹ Chuyển đổi số: tài khoản thôn đang dùng
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

const MGMT = 'Ban quản lý thôn Xuân Trạch';
// code: mã quỹ (funds.code). Quỹ có sẵn chỉ cập nhật; quỹ "add" tạo mới.
const FUNDS = {
  'quy-thon': { transfer_code: 'QT26', nature: 'mandatory', contribution: 'household', target: 300000, period: 'year', managed_by: MGMT,
    pay: 'both', shared: true, exempt: 'Hộ nghèo\nHộ có người có công', public: 1,
    content: [
      'Quỹ thôn là quỹ chung của thôn Xuân Trạch, do nhân dân đóng góp theo Nghị quyết Hội nghị nhân dân thôn ngày 15/01/2026.',
      'Mục đích sử dụng: trả tiền điện chiếu sáng đường thôn (42 bóng), duy tu nhà văn hoá, chè nước hội họp, thăm hỏi ốm đau, phúng viếng, quà cho gia đình chính sách dịp lễ Tết, phát quang đường làng và các việc chung khác do Ban quản lý thôn đề xuất.',
      'Đối tượng: các hộ gia đình thường trú trên địa bàn thôn. Hộ nghèo và hộ có người có công được miễn đóng.',
      'Mức đóng: 300.000 đồng/hộ/năm. Thời hạn nộp: trước ngày 31/12/2026, có thể nộp một lần hoặc nhiều lần.',
      'Hình thức nộp: tiền mặt tại thủ quỹ (bà Nguyễn Thị Lan, nhà văn hoá thôn, sáng thứ Bảy hằng tuần) hoặc chuyển khoản theo mã QR. Khi chuyển khoản, ghi nội dung "<mã hộ> QT26" để hệ thống tự ghi sổ đúng hộ.',
      'Quản lý: thủ quỹ thu và lập phiếu chi; Trưởng thôn duyệt chi; Ban kiểm tra đối soát hằng tháng và khoá sổ cuối năm. Sổ thu chi công khai trên App Làng Số và niêm yết tại nhà văn hoá.',
    ] },
  'quy-khuyen-hoc': { transfer_code: 'KH26', nature: 'campaign', contribution: 'voluntary', target: null, period: null, managed_by: 'Chi hội Khuyến học thôn',
    pay: 'both', shared: true, public: 1,
    content: [
      'Quỹ khuyến học thôn Xuân Trạch khen thưởng học sinh giỏi, tân sinh viên và hỗ trợ học sinh có hoàn cảnh khó khăn, góp phần xây dựng "Dòng họ hiếu học, gia đình hiếu học".',
      'Nguồn quỹ: vận động con em xa quê, các dòng họ, doanh nghiệp, nhà hảo tâm và nhân dân trong thôn; số dư chuyển sang từ các quỹ đã tất toán (Quỹ Trung thu 2026).',
      'Mức thưởng năm học 2025–2026: học sinh giỏi cấp tỉnh 500.000 đồng; học sinh giỏi, tiên tiến 300.000 đồng; tân sinh viên 1.000.000 đồng; học sinh khó khăn 300.000 đồng/suất quà khai giảng.',
      'Hình thức nộp: tùy tâm, tiền mặt tại Chi hội Khuyến học hoặc chuyển khoản theo mã QR với nội dung KH26.',
      'Danh sách khen thưởng, hỗ trợ được Chi hội thông qua và công khai trước lễ tổng kết năm học tại nhà văn hoá thôn.',
    ] },
  [SHARED_FROM]: { transfer_code: 'CDS26', nature: 'campaign', contribution: 'goal', target: 168000000, period: null, managed_by: 'Ban vận động công trình xóm Đông',
    pay: 'both', shared: true, public: 1,
    content: [
      'Vận động nhân dân đóng góp bê tông hoá 620 m đường trục xóm Đông, mặt đường rộng 3 m, dày 18 cm, có rãnh thoát nước một bên.',
      'Tổng dự toán: 168.000.000 đồng (vật liệu 112 triệu, nhân công và máy 56 triệu). UBND xã hỗ trợ 30 tấn xi măng; phần còn lại nhân dân đóng góp.',
      'Căn cứ: Nghị quyết Hội nghị nhân dân thôn ngày 05/07/2026 và Tờ trình của Ban vận động công trình xóm Đông.',
      'Đối tượng vận động: các hộ xóm Đông và hộ có đất dọc tuyến; khuyến khích con em xa quê, nhà hảo tâm cùng chung tay.',
      'Hình thức nộp: tiền mặt tại Ban vận động hoặc chuyển khoản theo mã QR với nội dung CDS26.',
      'Tiến độ: đợt 1 (310 m) đã đổ xong ngày 20/09/2026; đợt 2 (310 m còn lại) đang thi công. Quyết toán công khai sau khi nghiệm thu.',
    ] },
  'quy-trung-thu': { transfer_code: 'TT26', nature: 'voluntary', contribution: 'voluntary', target: null, period: null, managed_by: 'Chi đoàn thanh niên thôn',
    pay: 'both', shared: false, public: 1,
    content: [
      'Quỹ tổ chức Tết Trung thu năm 2026 cho thiếu nhi thôn Xuân Trạch: đêm hội rước đèn, phá cỗ và tặng quà cho 150 cháu.',
      'Nguồn quỹ: nhân dân, các dòng họ, doanh nghiệp và con em xa quê ủng hộ tùy tâm.',
      'Kết quả: đã tổ chức đêm hội ngày 25/09/2026, trao 150 suất quà (65.000 đồng/suất). Quỹ đã tất toán, số dư chuyển sang Quỹ khuyến học theo biên bản tất toán.',
    ] },
  'cd12345': { transfer_code: 'CX26', nature: 'voluntary', contribution: 'goal', target: 24000000, period: null, managed_by: 'Hội Phụ nữ thôn', pay: 'both', shared: false, public: 1,
    content: [
      'Vận động trồng cây xanh dọc đường trục thôn và khuôn viên nhà văn hoá, hưởng ứng chương trình "Một tỷ cây xanh".',
      'Kế hoạch: trồng 120 cây sao đen, bằng lăng dọc 1,2 km đường trục; mỗi cây kèm cọc chống và rọ bảo vệ.',
      'Hình thức: ủng hộ tùy tâm bằng tiền mặt hoặc chuyển khoản; nhận ủng hộ bằng cây giống, công trồng và chăm sóc.',
    ] },
  'man-hinh-led': { add: true, name: 'Quỹ vận động Màn hình LED', kind: 'general', fund_type: 'Vận động công trình', category: 'Cả thôn',
    transfer_code: 'LED26', nature: 'campaign', contribution: 'goal', target: 100000000, period: null, managed_by: MGMT,
    pay: 'transfer', shared: true, public: 1, start: '2026-09-15', end: '2026-12-31',
    description: 'Lắp màn hình LED ngoài trời tại sân nhà văn hoá thôn phục vụ họp thôn, tuyên truyền và văn hoá văn nghệ.',
    content: [
      'Ủng hộ lắp đặt màn hình LED ngoài trời tại sân nhà văn hoá thôn Xuân Trạch, phục vụ họp thôn, tuyên truyền chủ trương, chiếu phim, văn nghệ và các ngày lễ lớn.',
      'Mục tiêu huy động: 100.000.000 đồng, gồm màn hình LED P4 ngoài trời 3 m x 2 m (68 triệu), khung thép mạ kẽm và mái che (14 triệu), bộ xử lý hình ảnh, âm thanh (11 triệu), điện, chống sét, lắp đặt (7 triệu).',
      'Căn cứ: Nghị quyết Hội nghị nhân dân thôn ngày 10/09/2026 và Tờ trình của Ban quản lý thôn kèm 3 báo giá thiết bị.',
      'Đối tượng vận động: toàn thể nhân dân, con em xa quê, các dòng họ, doanh nghiệp và nhà hảo tâm. Đóng góp tùy tâm, không bắt buộc.',
      'Hình thức nộp: chỉ nhận chuyển khoản theo mã QR trên App Làng Số (nội dung LED26) để đối soát tự động và công khai từng khoản.',
      'Thời gian vận động: 15/09/2026 – 31/12/2026. Danh sách ủng hộ cập nhật trực tiếp; khi đủ kinh phí Ban quản lý thôn tổ chức lắp đặt, nghiệm thu và quyết toán công khai.',
    ] },
  'qp-an-2026': { add: true, name: 'Quỹ quốc phòng – an ninh 2026', kind: 'general', fund_type: 'Quỹ quốc phòng – an ninh', category: 'Cả thôn',
    transfer_code: 'QPAN26', nature: 'mandatory', contribution: 'household', target: 50000, period: 'year', managed_by: MGMT,
    pay: 'both', shared: true, public: 1, start: '2026-09-01', end: '2026-10-31',
    description: 'Thu theo Nghị quyết HĐND xã, mỗi hộ 50.000 đồng/năm. Đã ngừng thu từ 31/10/2026.',
    content: [
      'Căn cứ Nghị quyết của HĐND xã về mức đóng góp Quỹ quốc phòng – an ninh năm 2026.',
      'Đối tượng: các hộ gia đình thường trú trên địa bàn thôn. Mức đóng: 50.000 đồng/hộ/năm.',
      'Thời gian thu: từ 01/09/2026 đến 31/10/2026. Quỹ đã ngừng thu; số dư dùng hỗ trợ dân quân, tổ an ninh trật tự thôn theo quyết định của Ban chỉ huy quân sự xã.',
    ] },
  'pctt-2025': { add: true, name: 'Quỹ phòng chống thiên tai 2025', kind: 'general', fund_type: 'Quỹ phòng chống thiên tai', category: 'Cả thôn',
    transfer_code: 'PCTT25', nature: 'mandatory', contribution: 'person', target: 20000, period: 'year', managed_by: MGMT,
    pay: 'cash', shared: false, public: 1, start: '2025-03-01', end: '2025-06-30',
    description: 'Thu theo Luật Phòng, chống thiên tai; đã nộp đủ về Quỹ tỉnh và khoá sổ.',
    content: [
      'Thu theo Luật Phòng, chống thiên tai và Nghị định 78/2021/NĐ-CP: người lao động từ 18 tuổi đến tuổi nghỉ hưu đóng 20.000 đồng/người/năm.',
      'Thời gian thu: 01/03/2025 – 30/06/2025, nộp tiền mặt tại thủ quỹ thôn.',
      'Kết quả: đã nộp toàn bộ số thu về Quỹ phòng, chống thiên tai tỉnh theo giấy nộp tiền; Ban kiểm tra đã khoá sổ, số dư 0 đồng.',
    ] },
};
const DOCS = [
  ['quy-thon', 'doc', 'Nghị quyết Hội nghị nhân dân thôn năm 2026'],
  ['quy-thon', 'doc', 'Kế hoạch thu chi Quỹ thôn năm 2026'],
  ['quy-khuyen-hoc', 'doc', 'Quy chế hoạt động Quỹ khuyến học'],
  ['quy-khuyen-hoc', 'doc', 'Danh sách khen thưởng năm học 2025–2026'],
  [SHARED_FROM, 'doc', 'Tờ trình bê tông hoá đường xóm Đông'],
  [SHARED_FROM, 'doc', 'Dự toán công trình đường xóm Đông'],
  ['quy-trung-thu', 'doc', 'Kế hoạch tổ chức Trung thu 2026'],
  ['quy-trung-thu', 'doc', 'Biên bản tất toán Quỹ Trung thu 2026'],
  ['cd12345', 'doc', 'Kế hoạch trồng cây xanh đường trục thôn'],
  ['man-hinh-led', 'doc', 'Tờ trình lắp màn hình LED'],
  ['man-hinh-led', 'doc', 'Bảng báo giá thiết bị màn hình LED'],
  ['man-hinh-led', 'doc', 'Nghị quyết Hội nghị nhân dân ngày 10-09-2026'],
  ['qp-an-2026', 'doc', 'Nghị quyết HĐND xã về mức thu Quỹ quốc phòng – an ninh'],
  ['pctt-2025', 'doc', 'Giấy nộp tiền về Quỹ phòng chống thiên tai tỉnh'],
  ['pctt-2025', 'minutes', 'Biên bản khoá sổ Quỹ phòng chống thiên tai 2025'],
];
const docKey = (i) => `xt-doc-${i}.pdf`;
const fundName = (code, fallback) => FUNDS[code].name || fallback;

function docHtml(code, name, fallbackFundName) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><meta charset="utf-8"><style>
    body{font-family:'Times New Roman','Liberation Serif','DejaVu Serif',serif;font-size:14pt;line-height:1.5;margin:0}
    .hd{display:flex;justify-content:space-between;text-align:center;font-size:12pt}.hd b{display:block}
    h1{text-align:center;font-size:15pt;margin:28px 0 4px}h2{text-align:center;font-size:13pt;font-weight:normal;font-style:italic;margin:0 0 20px}
    p{text-align:justify;margin:0 0 8px;text-indent:1.2cm}.sg{display:flex;justify-content:space-between;margin-top:36px;text-align:center}
  </style><div class="hd"><div>UBND XÃ XUÂN TRẠCH<b>THÔN XUÂN TRẠCH</b></div>
  <div><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b>Độc lập – Tự do – Hạnh phúc</div></div>
  <h1>${esc(name.toUpperCase())}</h1><h2>${esc(fundName(code, fallbackFundName))}</h2>
  ${FUNDS[code].content.map((p) => `<p>${esc(p)}</p>`).join('')}
  <p>Văn bản này được niêm yết tại nhà văn hoá thôn và công khai trên App Làng Số để nhân dân biết, giám sát.</p>
  <div class="sg"><div><b>THƯ KÝ</b><br><br><br>Nguyễn Thị Lan</div><div><i>Xuân Trạch, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</i><br><b>TRƯỞNG THÔN</b><br><br><br>(đã ký)</div></div>`;
}

// PDF chữ không dấu (Helvetica) khi không có bản in sẵn
function textPdf(lines) {
  const { removeVietnamese } = require('../src/lib/vietqr');
  const esc = (s) => String(s).replace(/[\\()]/g, (m) => '\\' + m);
  const wrap = (l) => removeVietnamese(l).match(/.{1,88}(\s|$)/g) || [''];
  const body = `BT /F1 10 Tf 50 790 Td 14 TL ${lines.flatMap(wrap).slice(0, 54).map((l) => `(${esc(l.trim())}) Tj T*`).join(' ')} ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`];
  let pdf = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function render(dir) {
  const { chromium } = require('playwright');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const names = { 'quy-thon': 'Quỹ thôn', 'quy-khuyen-hoc': 'Quỹ khuyến học', [SHARED_FROM]: 'Quỹ Chuyển đổi số',
    'quy-trung-thu': 'Quỹ Trung thu cho thiếu nhi 2026', 'cd12345': 'Ủng hộ Cây Xanh' };
  for (const [i, [code, , name]] of DOCS.entries()) {
    await page.setContent(docHtml(code, name, names[code]));
    await page.pdf({ path: path.join(dir, docKey(i)), format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2cm' } });
  }
  await browser.close();
  console.log(`Đã in ${DOCS.length} tài liệu vào ${dir}`);
}

function seed(pdfDir) {
  const db = require('../src/db');
  const { makeCode } = require('../src/lib/codes');
  const { removeVietnamese } = require('../src/lib/vietqr');
  const alnum = (x) => removeVietnamese(String(x || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let rs = 20261111; // số ngẫu nhiên cố định: chạy lại ra cùng dữ liệu
  const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ts = (d, h = 8 + Math.floor(rnd() * 11), m = Math.floor(rnd() * 60)) => `${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const dayAdd = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const TQ = 'Nguyễn Thị Lan';
  const stats = {};

  db.runWith(TENANT, (conn) => {
    const fund = (code) => conn.prepare('SELECT * FROM funds WHERE code=?').get(code);
    const src = fund(SHARED_FROM);
    if (!src || !src.bank_account) throw new Error(`Không thấy tài khoản của quỹ ${SHARED_FROM}`);
    const houses = conn.prepare('SELECT code, head_name, hamlet FROM households WHERE active=1 ORDER BY code').all();
    let hi = 0;
    const nextHouse = () => (houses.length ? houses[(hi++ * 7) % houses.length] : null); // rải đều danh sách hộ
    const group = (h) => (h && h.hamlet && h.hamlet !== 'Chưa rõ xóm' ? h.hamlet : null);
    const insEntry = conn.prepare(`INSERT INTO fund_entries(code,fund_id,type,amount,source,bank_ref,payer_name,payer_group,household_code,anonymous,note,status,
      created_by_name,created_at,approved_by_name,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'approved',?,?,?,?)`);
    const income = (f, date, amount, h, viaQr, note, payer) => {
      const at = ts(date);
      const code = makeCode(conn, 'PT', 'fund_entries', 'code', new Date(date + 'T12:00:00'));
      insEntry.run(code, f.id, 'in', amount, viaQr ? 'vietqr' : 'cash', viaQr ? `FTXT${code.replace(/\D/g, '')}` : null,
        h ? h.head_name : payer || null, group(h), h ? h.code : null, 0,
        viaQr ? `${h ? alnum(h.code) + ' ' : ''}${f.transfer_code} ${note}` : note,
        viaQr ? 'VietQR' : TQ, at, viaQr ? 'Hệ thống (VietQR)' : TQ, at);
      stats[f.code] = (stats[f.code] || 0) + 1;
    };
    const expense = (f, date, amount, note) => {
      const at = ts(date);
      insEntry.run(makeCode(conn, 'PC', 'fund_entries', 'code', new Date(date + 'T12:00:00')), f.id, 'out', amount, 'cash', null, null, null, null, 0, note,
        TQ, at, 'Trưởng thôn Xuân Trạch', at);
    };

    conn.exec('BEGIN IMMEDIATE');
    try {
      conn.prepare("INSERT INTO settings(key,value) VALUES ('fund_shared_account','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      const types = conn.prepare("SELECT value FROM settings WHERE key='fund_types'").get()?.value || '';
      if (!/Vận động công trình/.test(types)) {
        conn.prepare("INSERT INTO settings(key,value) VALUES ('fund_types',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .run((types ? types + '\n' : '') + 'Vận động công trình | Vận động');
      }

      for (const [code, d] of Object.entries(FUNDS)) {
        if (d.add && !fund(code)) {
          conn.prepare(`INSERT INTO funds(code,name,kind,fund_type,category,description,start_date,end_date,is_public,created_by) VALUES (?,?,?,?,?,?,?,?,1,NULL)`)
            .run(code, d.name, d.kind, d.fund_type, d.category, d.description, d.start, d.end);
        }
        const f = fund(code);
        if (!f) { console.log(`  • bỏ qua ${code}: không có quỹ`); continue; }
        const set = { transfer_code: d.transfer_code, nature: d.nature, managed_by: d.managed_by, payment_methods: d.pay,
          content: d.content.join('\n'), is_public: d.public };
        if ('contribution' in d) Object.assign(set, { contribution: d.contribution, target_amount: d.target, period: d.period });
        if (d.exempt) set.exempt = d.exempt;
        // Quỹ chưa có tài khoản: dùng chung tài khoản của thôn (không đè tài khoản quỹ đã khai)
        if (d.shared && !f.bank_account) Object.assign(set, { bank_account: src.bank_account, bank_bin: src.bank_bin, bank_name: src.bank_name, account_holder: src.account_holder });
        conn.prepare(`UPDATE funds SET ${Object.keys(set).map((k) => k + '=?').join(',')} WHERE id=?`).run(...Object.values(set), f.id);
      }

      // Quỹ thôn: khoản đóng theo hộ (mã hộ thật) để App tính "Đã đóng / Cần đóng"
      const qt = fund('quy-thon');
      if (qt && !conn.prepare('SELECT 1 FROM fund_entries WHERE fund_id=? AND household_code IS NOT NULL').get(qt.id)) {
        for (let i = 0; i < 46; i++) {
          const h = nextHouse();
          const amount = i % 9 === 4 ? 150000 : 300000; // vài hộ mới nộp một nửa
          income(qt, dayAdd('2026-09-02', Math.floor(i * 70 / 46)), amount, h, rnd() < 0.45, 'Đóng quỹ thôn năm 2026');
        }
      }

      // Màn hình LED: mục tiêu 100 triệu, đang vận động (khoảng 62%)
      const led = fund('man-hinh-led');
      if (led && !conn.prepare('SELECT 1 FROM fund_entries WHERE fund_id=?').get(led.id)) {
        const FAR = ['Anh Nguyễn Văn Hưng (Hà Nội)', 'Chị Lê Thị Thu (TP.HCM)', 'Gia đình anh Trần Đức Thắng (Hải Phòng)', 'Con cháu xa quê tại Bình Dương',
          'Công ty TNHH Xây dựng Xuân Trạch', 'Dòng họ Nguyễn Thế', 'Dòng họ Lê Văn', 'Anh Phạm Quốc Toản (Đức)', 'Chị Đỗ Thị Hằng (Nhật Bản)', 'Hội đồng hương Xuân Trạch tại Hà Nội'];
        const AMT = [200000, 300000, 500000, 500000, 1000000, 1000000, 2000000];
        const big = [10000000, 5000000, 5000000, 3000000];
        for (let i = 0; i < 48; i++) {
          const far = i % 4 === 1 || i < big.length;
          income(led, dayAdd('2026-09-16', Math.floor(i * 55 / 48)), i < big.length ? big[i] : pick(AMT), far ? null : nextHouse(), true, 'ung ho man hinh LED', far ? FAR[i % FAR.length] : null);
        }
        expense(led, '2026-10-20', 20000000, 'Đặt cọc 30% hợp đồng cung cấp màn hình LED P4 (Công ty CP Công nghệ Hiển thị Việt)');
      }

      // Quốc phòng – an ninh 2026: thu theo hộ đến 31/10, đã ngừng thu, vẫn chi sau ngày ngừng
      const qp = fund('qp-an-2026');
      if (qp && !conn.prepare('SELECT 1 FROM fund_entries WHERE fund_id=?').get(qp.id)) {
        for (let i = 0; i < 38; i++) income(qp, dayAdd('2026-09-03', Math.floor(i * 56 / 38)), 50000, nextHouse(), rnd() < 0.3, 'Đóng quỹ quốc phòng – an ninh 2026');
        expense(qp, '2026-11-05', 800000, 'Hỗ trợ tổ dân quân thôn tập huấn, trực bảo vệ tháng 11/2026');
        conn.prepare("UPDATE funds SET status='closed', stopped_at='2026-10-31 17:00:00', stopped_by_name='Hệ thống (hết hạn thu)' WHERE id=?").run(qp.id);
        conn.prepare("INSERT INTO fund_notices(fund_id,kind,message,created_at) VALUES (?,'auto_stop',?,'2026-10-31 17:00:00')")
          .run(qp.id, 'Quỹ quốc phòng – an ninh 2026: ngừng thu từ 31/10/2026 (hết hạn thu)');
      }

      // Phòng chống thiên tai 2025: thu xong, nộp về tỉnh, khoá sổ có biên bản (khoá sau khi ghi đủ bút toán)
      const pt = fund('pctt-2025');
      let ptTotal = 0;
      if (pt && !conn.prepare('SELECT 1 FROM fund_entries WHERE fund_id=?').get(pt.id)) {
        for (let i = 0; i < 30; i++) { income(pt, dayAdd('2025-03-05', Math.floor(i * 110 / 30)), 20000 * (1 + (i % 3)), nextHouse(), false, 'Đóng quỹ phòng chống thiên tai 2025'); ptTotal += 20000 * (1 + (i % 3)); }
        expense(pt, '2025-07-05', ptTotal, 'Nộp Quỹ phòng, chống thiên tai tỉnh (giấy nộp tiền số 125/GNT ngày 05/07/2025)');
        conn.prepare("UPDATE funds SET status='closed', stopped_at='2025-06-30 17:00:00', stopped_by_name='Hệ thống (hết hạn thu)' WHERE id=?").run(pt.id);
      }

      // Tài liệu đính kèm: chỉ thêm khi quỹ chưa có tài liệu nào
      const dir = path.join(db.DATA_DIR, 'attachments');
      fs.mkdirSync(dir, { recursive: true });
      const hasDocs = new Set(conn.prepare('SELECT DISTINCT fund_id FROM fund_documents').all().map((r) => r.fund_id));
      const insDoc = conn.prepare("INSERT INTO fund_documents(fund_id,kind,name,filename,mime,size,created_by_name) VALUES (?,?,?,?,'application/pdf',?,?)");
      for (const [i, [code, kind, name]] of DOCS.entries()) {
        const f = fund(code);
        if (!f || hasDocs.has(f.id)) continue;
        const pre = pdfDir && path.join(pdfDir, docKey(i));
        const buf = pre && fs.existsSync(pre) ? fs.readFileSync(pre) : textPdf([name.toUpperCase(), f.name, '', ...FUNDS[code].content]);
        const filename = `DOC-${f.id}-xt-${i}.pdf`;
        fs.writeFileSync(path.join(dir, filename), buf);
        const id = insDoc.run(f.id, kind, name + '.pdf', filename, buf.length, kind === 'minutes' ? 'Trưởng ban kiểm tra' : 'Trưởng thôn Xuân Trạch').lastInsertRowid;
        if (kind === 'minutes' && !f.locked_at) {
          conn.prepare("UPDATE funds SET locked_at='2025-07-10 09:00:00', locked_by_name='Trưởng ban kiểm tra', lock_note='Đã nộp đủ về Quỹ phòng, chống thiên tai tỉnh, số dư 0', lock_balance=0, lock_doc_id=? WHERE id=?")
            .run(id, f.id);
        }
      }
      conn.exec('COMMIT');
    } catch (e) { conn.exec('ROLLBACK'); throw e; }

    for (const f of conn.prepare('SELECT f.id, f.name, f.transfer_code, f.bank_account, f.payment_methods, f.status, f.locked_at IS NOT NULL locked, (SELECT COUNT(*) FROM fund_documents d WHERE d.fund_id=f.id) docs FROM funds f').all()) {
      console.log(`  ${String(f.id).padStart(2)} ${f.name.padEnd(36)} ${String(f.transfer_code).padEnd(7)} ${f.bank_account || '-'} ${f.payment_methods} ${f.status}${f.locked ? ' khoá sổ' : ''} · ${f.docs} tài liệu`);
    }
  });
  console.log('Khoản thu mới:', JSON.stringify(stats));
}

if (arg('--render')) render(arg('--render')).catch((e) => { console.error(e); process.exit(1); });
else seed(arg('--pdf'));
