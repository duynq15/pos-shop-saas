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
