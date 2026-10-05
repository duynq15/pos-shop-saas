// Tiện ích dùng chung cho toàn bộ giao diện.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let CURRENCY = '₫';
export const setCurrency = (c) => { CURRENCY = c || '₫'; };
export const currency = () => CURRENCY;

export const nf = new Intl.NumberFormat('vi-VN');
export const num = (n) => nf.format(Number(n) || 0);
export const money = (n) => `${num(Math.round(Number(n) || 0))} ${CURRENCY}`;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const monthStart = () => today().slice(0, 8) + '01';
// Ngân hàng Việt Nam: [mã BIN NAPAS, tên]. BIN cần để dựng VietQR (cùng số tài khoản có thể có ở nhiều ngân hàng).
export const BANKS = [
  ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'], ['970422', 'MB Bank'], ['970407', 'Techcombank'],
  ['970416', 'ACB'], ['970432', 'VPBank'], ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970437', 'HDBank'], ['970441', 'VIB'], ['970443', 'SHB'],
  ['970426', 'MSB'], ['970448', 'OCB'], ['970431', 'Eximbank'], ['970429', 'SCB'], ['970400', 'SaigonBank'], ['970409', 'BacABank'], ['970438', 'BaoVietBank'],
  ['970449', 'LPBank'], ['970452', 'KienLongBank'], ['970454', 'VietCapitalBank'], ['970425', 'ABBank'], ['970419', 'NCB'], ['970428', 'NamABank'],
  ['970427', 'VietABank'], ['970430', 'PGBank'], ['970412', 'PVcomBank'], ['970414', 'Oceanbank'], ['970433', 'VietBank'], ['970440', 'SeABank'],
  ['546034', 'CAKE'], ['546035', 'Ubank'], ['963388', 'Timo'],
];
// Tên gọi quen thuộc để tìm: gõ "quân đội" ra MB, "ngoại thương" ra Vietcombank.
const BANK_ALIAS = {
  970436: 'ngoai thuong', 970415: 'cong thuong', 970418: 'dau tu phat trien', 970405: 'nong nghiep',
  970422: 'quan doi military', 970407: 'ky thuong', 970416: 'a chau', 970432: 'viet nam thinh vuong',
  970423: 'tien phong', 970403: 'sai gon thuong tin', 970443: 'sai gon ha noi', 970426: 'hang hai', 970449: 'buu dien lien viet',
};
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const bankName = (bin, name) => (BANKS.find((b) => b[0] === bin || b[1] === name) || [])[1] || '';

// Ô chọn ngân hàng có tìm kiếm (combobox ARIA). Hành vi gắn một lần cho toàn trang qua ủy quyền sự kiện,
// nên chỉ cần chèn HTML của bankField vào form. name: tên đã lưu, dùng khi BIN cũ nhập tay bị sai.
export const bankField = (id, bin, name) => `<div class="combo"><input class="field" id="${id}" data-combo="bank" role="combobox"
  aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list" autocomplete="off" spellcheck="false"
  placeholder="Gõ để tìm: MB, Vietcom, quân đội…" value="${esc(bankName(bin, name))}">
  <ul class="combo-list" id="${id}-list" role="listbox" hidden></ul></div>`;

// Trả [bin, tên] theo nội dung ô; rỗng -> null; gõ không khớp -> undefined.
export function bankOf(value) {
  const v = fold(value);
  if (!v) return null;
  return BANKS.find(([b, n]) => fold(n) === v || b === v);
}

// Xếp hạng: tên bắt đầu bằng chữ gõ > khớp đầu một từ (tên hoặc tên gọi) > khớp giữa chữ. "mb" ra MB Bank trước Vietcombank.
function bankMatches(q) {
  const v = fold(q);
  if (!v) return BANKS;
  const rank = ([b, n]) => {
    const name = fold(n); const words = (name + ' ' + (BANK_ALIAS[b] || '')).split(/\s+/);
    if (name.startsWith(v) || b.startsWith(v)) return 0;
    if (words.some((w) => w.startsWith(v)) || (BANK_ALIAS[b] || '').startsWith(v)) return 1;
    if (name.includes(v) || (BANK_ALIAS[b] || '').includes(v)) return 2;
    return 9;
  };
  return BANKS.map((x) => [x, rank(x)]).filter(([, r]) => r < 9).sort((a, b) => a[1] - b[1]).map(([x]) => x);
}

function comboOpen(input) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  const items = bankMatches(bankOf(input.value) ? '' : input.value);
  const cur = bankOf(input.value);
  list.innerHTML = items.map(([b, n], k) => `<li role="option" id="${list.id}-${k}" data-v="${esc(n)}" aria-selected="${cur && cur[0] === b}">
    <span>${esc(n)}</span><span class="b">${b}</span></li>`).join('') || '<li class="none">Không tìm thấy ngân hàng</li>';
  // Mở lên trên nếu phía dưới không đủ chỗ (form nằm trong hộp thoại có thanh cuộn)
  const box = input.closest('.modal-box')?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
  const r = input.getBoundingClientRect();
  const below = box.bottom - r.bottom; const above = r.top - box.top;
  list.classList.toggle('up', below < 220 && above > below);
  list.style.maxHeight = Math.max(140, Math.min(280, (list.classList.contains('up') ? above : below) - 12)) + 'px';
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  comboActive(input, items.findIndex(([b]) => cur && cur[0] === b));
}
function comboClose(input) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  if (list) list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}
function comboActive(input, k) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  const opts = [...list.querySelectorAll('[role=option]')];
  opts.forEach((o, x) => o.classList.toggle('active', x === k));
  if (opts[k]) { input.setAttribute('aria-activedescendant', opts[k].id); opts[k].scrollIntoView({ block: 'nearest' }); }
  else input.removeAttribute('aria-activedescendant');
}
function comboPick(input, value) {
  input.value = value;
  comboClose(input);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
const isCombo = (el) => el && el.matches && el.matches('input[data-combo="bank"]');
document.addEventListener('focusin', (e) => { if (isCombo(e.target)) { e.target.select(); comboOpen(e.target); } });
document.addEventListener('input', (e) => { if (isCombo(e.target)) comboOpen(e.target); });
document.addEventListener('focusout', (e) => {
  if (!isCombo(e.target)) return;
  const input = e.target;
  // Gõ dở mà chỉ còn một ngân hàng khớp thì chọn luôn
  const m = bankOf(input.value) ? null : bankMatches(input.value);
  if (m && m.length === 1 && input.value.trim()) input.value = m[0][1];
  comboClose(input);
});
document.addEventListener('mousedown', (e) => {
  const li = e.target.closest('.combo-list [role=option]'); if (!li) return;
  e.preventDefault();
  comboPick(li.closest('.combo').querySelector('input'), li.dataset.v);
});
document.addEventListener('keydown', (e) => {
  if (!isCombo(e.target)) return;
  const input = e.target;
  const list = document.getElementById(input.getAttribute('aria-controls'));
  const opts = [...list.querySelectorAll('[role=option]')];
  const k = opts.findIndex((o) => o.classList.contains('active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (list.hidden) return comboOpen(input);
    comboActive(input, e.key === 'ArrowDown' ? Math.min(opts.length - 1, k + 1) : Math.max(0, k - 1));
  } else if (e.key === 'Enter' && !list.hidden) {
    const pick = opts[k] || (opts.length === 1 ? opts[0] : null);
    if (pick) { e.preventDefault(); comboPick(input, pick.dataset.v); }
  } else if (e.key === 'Escape' && !list.hidden) {
    e.preventDefault(); e.stopPropagation(); comboClose(input);
  }
}, true);
// Dải cảnh báo tự kiểm (GĐ3.5). Chèn vào el; không có cảnh báo thì để trống.
export async function renderAlerts(el, api) {
  if (!el) return;
  let list = [];
  try { list = await api('/api/alerts'); } catch { list = []; }
  el.innerHTML = list.map((a) => `<div class="alert-bar ${a.kind}" role="status"><b>Cảnh báo:</b> ${esc(a.message)}
    <span class="muted">· phát hiện ${esc(String(a.created_at || '').slice(0, 16))}</span></div>`).join('');
}
export const fmtDT = (s) => (s ? String(s).slice(0, 16) : '');

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- Toast ---------------- */
let toastT;
export function toast(msg, err = false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* ---------------- Modal ---------------- */
export function modal(html, opts = {}) {
  let box = $('#modal');
  if (!box) {
    box = document.createElement('div');
    box.id = 'modal';
    box.className = 'modal hidden';
    box.innerHTML = '<div class="modal-box" id="modal-box"></div>';
    document.body.appendChild(box);
    box.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  }
  const inner = $('#modal-box');
  inner.className = 'modal-box ' + (opts.wide ? 'wide' : '');
  inner.innerHTML = html;
  box.classList.remove('hidden');
  if (opts.focus) setTimeout(() => { const f = $(opts.focus); if (f) f.focus(); }, 40);
  return inner;
}
export function closeModal() {
  const box = $('#modal');
  if (box) box.classList.add('hidden');
  if (window.__onModalClose) { const f = window.__onModalClose; window.__onModalClose = null; f(); }
}

/* ---------------- Confirm ---------------- */
export const confirmDialog = (msg) => Promise.resolve(window.confirm(msg));

/* ---------------- Sound ---------------- */
export function beep(okSound = true) {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = okSound ? 1200 : 300; o.type = 'square'; g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (okSound ? 0.07 : 0.25));
  } catch { /* ignore */ }
}

/* ---------------- CSV ---------------- */
export function downloadCSV(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- Trạng thái ---------------- */
export const statusLabel = (s) => ({ paid: 'Đã thanh toán', pending: 'Chờ chuyển khoản', cancelled: 'Đã hủy', draft: 'Nháp', received: 'Đã nhập', completed: 'Đã chốt' }[s] || s);
export const statusBadge = (s) => `<span class="badge ${s}">${statusLabel(s)}</span>`;
export const methodLabel = (m) => ({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', ewallet: 'Ví điện tử', mixed: 'Hỗn hợp' }[m] || m || '');
export const moveTypeLabel = (t) => ({ init: 'Tồn đầu', sale: 'Bán hàng', return: 'Trả hàng', purchase: 'Nhập hàng', import: 'Nhập kho', adjust: 'Điều chỉnh', check: 'Kiểm kho', cancel: 'Hủy' }[t] || t);

export async function printHTML(html) {
  let area = $('#print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
  area.innerHTML = html;
  window.print();
}
