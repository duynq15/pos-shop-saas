'use strict';

const TOKEN = (location.pathname.split('/')[2] || '').trim();
const QS = new URLSearchParams(location.search);
const STATIC = QS.has('static') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat('vi-VN');

const money = (n) => nf.format(Math.round(Number(n) || 0)) + ' ₫';
const num = (n) => nf.format(Number(n) || 0);
function moneyShort(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' tr';
  if (Math.abs(n) >= 1e3) return nf.format(Math.round(n / 1e3)) + 'k';
  return nf.format(n);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayLabel = (s) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const monthLabel = (s) => { const [y, m] = s.split('-'); return `T${Number(m)}/${y.slice(2)}`; };
function fmtValue(v, fmt) {
  if (fmt === 'money') return money(v);
  if (fmt === 'dec') return (Math.round(Number(v) * 100) / 100).toFixed(2).replace('.', ',');
  if (fmt === 'int') return num(Math.round(Number(v)));
  return String(v);
}

const state = { from: '', to: '', preset: 30, filters: { partner: '', area: '', category: '', q: '' } };

function apiQuery() {
  const p = new URLSearchParams({ from: state.from, to: state.to });
  for (const k of ['partner', 'area', 'category', 'q']) if (state.filters[k]) p.set(k, state.filters[k]);
  return p.toString();
}

function applyPreset(days) {
  state.preset = days;
  state.to = iso(new Date());
  state.from = iso(addDays(new Date(), -(days - 1)));
  document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', Number(b.dataset.preset) === days));
  $('#rp-from').value = state.from;
  $('#rp-to').value = state.to;
}

async function load() {
  $('#rp-loading').hidden = false;
  $('#rp-error').hidden = true;
  try {
    const r = await fetch(`/public/api/report/${encodeURIComponent(TOKEN)}?${apiQuery()}`, { headers: { Accept: 'application/json' } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Lỗi ' + r.status));
    render(data.data || data);
  } catch (e) {
    $('#rp-error').hidden = false;
    $('#rp-error').textContent = 'Không tải được báo cáo: ' + e.message;
  } finally {
    $('#rp-loading').hidden = true;
  }
}

function render(d) {
  const t = d.totals || {};
  $('#rp-meta').textContent = `${dayLabel(d.from)} – ${dayLabel(d.to)}`;
  $('#rp-generated').textContent = 'Cập nhật ' + new Date(d.generated_at).toLocaleString('vi-VN');
  document.title = `Thống kê giao dịch số ${dayLabel(d.from)}–${dayLabel(d.to)}`;

  populateFilters(d.filter_options);
  renderKpis(t);
  renderDayChart(d.by_day || []);
  renderMonthChart(d.by_month || []);
  renderAreas(d.areas || []);
  renderPartners(d.partners || []);
  renderGroups(d.groups || []);
  renderDigital(t);
  renderOps(t);
  activate();
}

function kpi(cls, icon, k, v, fmt, s) {
  const numAttr = fmt === 'text' ? '' : ` data-num="${v}"`;
  return `<div class="rp-kpi ${cls}"><div class="k"><span class="ic">${icon}</span>${esc(k)}</div>`
    + `<div class="v"${numAttr} data-fmt="${fmt}">${fmtValue(v, fmt)}</div>`
    + `${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
}

function renderKpis(t) {
  $('#rp-kpis').innerHTML = [
    kpi('k1', '💳', 'Tổng giá trị giao dịch', t.value, 'money', `Giá trị TB/giao dịch ${moneyShort(t.partners_avg_txn)}`),
    kpi('k2', '🧾', 'Tổng số giao dịch', t.txns, 'int', `${num(t.returns)} giao dịch hoàn`),
    kpi('k3', '🤝', 'Đối tác cung cấp', t.partners, 'int', `Trong khu vực ${num(t.partners_inside)} · Ngoài khu vực ${num(t.partners_outside)}`),
    kpi('k4', '👥', 'Đối tác thanh toán', t.partners_txn, 'int', `Tỷ lệ thanh toán số ${t.digital_share}%`),
  ].join('');
}

/* ---------- Biểu đồ ngày ---------- */
function renderDayChart(rows) {
  const el = $('#rp-chart-day');
  if (!rows.length) { el.innerHTML = '<div class="rp-empty">Không có dữ liệu trong khoảng đã chọn</div>'; return; }
  const W = 820, H = 240, pad = { t: 16, r: 16, b: 30, l: 54 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const x = (i) => pad.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const pts = rows.map((r, i) => [x(i), y(r.value)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${pad.t + ih} L${pts[0][0].toFixed(1)},${pad.t + ih} Z`;
  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const gy = pad.t + (ih / 4) * g;
    grid += `<line x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${W - pad.r}" y2="${gy.toFixed(1)}" stroke="#eef2f9"/>`
      + `<text x="${pad.l - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" class="rp-axis">${moneyShort(max * (1 - g / 4))}</text>`;
  }
  const ticks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  let xlabels = '';
  for (const i of ticks) xlabels += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="rp-axis">${dayLabel(rows[i].day)}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Giá trị giao dịch theo ngày">
    <defs><linearGradient id="rpg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity=".4"/><stop offset="100%" stop-color="#3b82f6" stop-opacity=".03"/>
    </linearGradient></defs>
    ${grid}
    <path class="rp-area" d="${area}" fill="url(#rpg)"/>
    <path class="rp-line" d="${line}" fill="none" stroke="#2563eb" stroke-width="2.4" stroke-linejoin="round"/>
    ${xlabels}
  </svg>`;
  const p = el.querySelector('.rp-line');
  if (p && p.getTotalLength) { const L = p.getTotalLength(); p.style.setProperty('--len', L.toFixed(1)); }
  el.querySelector('.rp-area')?.classList.add('show');
}

/* ---------- Biểu đồ tháng ---------- */
function renderMonthChart(rows) {
  const el = $('#rp-chart-month');
  if (!rows.length) { el.innerHTML = '<div class="rp-empty">Không có dữ liệu</div>'; return; }
  const max = Math.max(1, ...rows.map((r) => r.value));
  el.innerHTML = rows.map((r) => {
    const h = Math.max(2, (r.value / max) * 100);
    return `<div class="rp-mbar" title="${monthLabel(r.month)}: ${money(r.value)} · ${num(r.txns)} giao dịch">
      <div class="bar" style="--h:${h.toFixed(1)}%"></div><div class="lbl">${monthLabel(r.month)}</div><div class="amt">${moneyShort(r.value)}</div></div>`;
  }).join('');
}

/* ---------- Cơ cấu khu vực ---------- */
function renderAreas(rows) {
  const el = $('#rp-areas');
  if (!rows.length) { el.innerHTML = '<div class="rp-empty">Không có dữ liệu</div>'; return; }
  const max = Math.max(1, ...rows.map((r) => r.value));
  el.innerHTML = rows.map((r) => `<div class="rp-bar-item${r.inside ? '' : ' cat'}">
    <div class="name" title="${esc(r.label)}">${esc(r.label)}<span class="qty">${num(r.partners)} đối tác · ${num(r.txns)} giao dịch</span></div>
    <div class="track"><div class="fill" style="--w:${Math.max(2, (r.value / max) * 100).toFixed(1)}%"></div><span class="val">${moneyShort(r.value)} · ${r.share}%</span></div>
  </div>`).join('');
}

/* ---------- Bảng đối tác ---------- */
function renderPartners(rows) {
  $('#rp-partner-hint').textContent = `${num(rows.length)} đối tác có giao dịch số`;
  $('#rp-partners tbody').innerHTML = rows.map((s, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td><div class="rp-store-name">${esc(s.name)}</div></td>
    <td>${s.inside ? `<span class="badge on">${esc(s.area)}</span>` : '<span class="badge off">Ngoài khu vực</span>'}</td>
    <td class="r">${num(s.txns)}</td>
    <td class="r"><b>${money(s.value)}</b></td>
    <td class="r"><span class="rp-share"><span class="track"><span class="fill" style="--w:${Math.max(2, s.share)}%"></span></span>${s.share}%</span></td>
    <td class="r">${num(s.payers)}</td>
  </tr>`).join('') || '<tr><td colspan="7" class="rp-empty">Chưa có đối tác</td></tr>';
}

/* ---------- Nhóm sản phẩm ---------- */
function renderGroups(rows) {
  const el = $('#rp-groups');
  if (!rows.length) { el.innerHTML = '<div class="rp-empty">Không có dữ liệu</div>'; return; }
  const max = Math.max(1, ...rows.map((r) => r.value));
  el.innerHTML = rows.map((r) => `<div class="rp-bar-item cat">
    <div class="name" title="${esc(r.category)}">${esc(r.category)}<span class="qty">${num(r.products)} sản phẩm · SL ${num(r.qty)}</span></div>
    <div class="track"><div class="fill" style="--w:${Math.max(2, (r.value / max) * 100).toFixed(1)}%"></div><span class="val">${moneyShort(r.value)} · ${r.share}%</span></div>
  </div>`).join('');
}

/* ---------- Cơ cấu thanh toán ---------- */
const PAY_COLORS = ['#2563eb', '#94a3b8'];
function renderDigital(t) {
  const el = $('#rp-donut'), lg = $('#rp-legend');
  const digital = Number(t.value) || 0;
  const other = Math.max(0, (Number(t.value_all) || 0) - digital);
  const total = digital + other || 1;
  const segs = [
    { label: 'Thanh toán số', amount: digital, color: PAY_COLORS[0] },
    { label: 'Hình thức khác', amount: other, color: PAY_COLORS[1] },
  ];
  let acc = 0;
  const stops = segs.map((s) => { const from = acc / total * 100; acc += s.amount; const to = acc / total * 100; return `${s.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`; });
  el.style.background = `conic-gradient(${stops.join(',')})`;
  el.innerHTML = `<div class="center"><b>${t.digital_share}%</b><span>thanh toán số</span></div>`;
  lg.innerHTML = segs.map((s) => `<div class="row">
    <span class="dot" style="background:${s.color}"></span>
    <span class="l-name">${s.label}</span>
    <span class="l-val">${money(s.amount)}</span>
    <span class="l-pct">${total ? (Number((s.amount * 100 / total).toFixed(1))) : 0}%</span>
  </div>`).join('');
}

/* ---------- Chỉ số giao dịch ---------- */
function renderOps(t) {
  const retRate = t.txns ? ((t.returns / t.txns) * 100).toFixed(1) : '0';
  const perTxn = t.txns ? (t.items / t.txns).toFixed(2) : '0';
  const ops = [
    ['Giá trị TB/giao dịch', money(t.partners_avg_txn)],
    ['Số sản phẩm/giao dịch', perTxn],
    ['Tỷ lệ giao dịch hoàn', retRate + '%'],
    ['Tổng giá trị ghi nhận', money(t.value_all)],
    ['Sản phẩm ghi nhận', num(t.products)],
    ['Sản phẩm sắp hết', num(t.low_stock)],
  ];
  $('#rp-ops').innerHTML = ops.map(([k, v]) => `<div class="rp-op"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join('');
}

/* ---------- Bộ lọc ---------- */
function fillSelect(sel, options, current, allLabel) {
  sel.innerHTML = `<option value="">${allLabel}</option>` + options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  sel.value = current || '';
}
function populateFilters(opts) {
  if (!opts) return;
  fillSelect($('#rp-f-partner'), (opts.partners || []).map((p) => ({ value: p.code, label: p.name })), state.filters.partner, 'Tất cả đối tác');
  fillSelect($('#rp-f-area'), opts.areas || [], state.filters.area, 'Tất cả khu vực');
  fillSelect($('#rp-f-category'), (opts.categories || []).map((c) => ({ value: c, label: c })), state.filters.category, 'Tất cả nhóm');
  $('#rp-f-q').value = state.filters.q || '';
  renderActive();
}
function renderActive() {
  const el = $('#rp-f-active');
  const chips = [];
  if (state.filters.partner) { const o = $('#rp-f-partner').selectedOptions[0]; chips.push('Đối tác: ' + (o ? o.textContent : state.filters.partner)); }
  if (state.filters.area) { const o = $('#rp-f-area').selectedOptions[0]; chips.push('Khu vực: ' + (o ? o.textContent : state.filters.area)); }
  if (state.filters.category) chips.push('Nhóm: ' + state.filters.category);
  if (state.filters.q) chips.push('Tên: ' + state.filters.q);
  el.hidden = chips.length === 0;
  el.innerHTML = chips.length ? 'Đang lọc: ' + chips.map((c) => `<span class="rp-chip">${esc(c)}</span>`).join('') : '';
}
function applyFilters() {
  state.filters.partner = $('#rp-f-partner').value;
  state.filters.area = $('#rp-f-area').value;
  state.filters.category = $('#rp-f-category').value;
  state.filters.q = $('#rp-f-q').value.trim();
  renderActive();
  load();
}
function resetFilters() {
  state.filters = { partner: '', area: '', category: '', q: '' };
  $('#rp-f-partner').value = ''; $('#rp-f-area').value = ''; $('#rp-f-category').value = ''; $('#rp-f-q').value = '';
  renderActive();
  load();
}

/* ---------- Hiệu ứng ---------- */
function animateCount(el) {
  if (el.dataset.num === undefined) return;
  const target = Number(el.dataset.num) || 0;
  const fmt = el.dataset.fmt;
  if (STATIC || !target) { el.textContent = fmtValue(target, fmt); return; }
  const dur = 850, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtValue(target * e, fmt);
    if (k < 1) requestAnimationFrame(step); else el.textContent = fmtValue(target, fmt);
  };
  requestAnimationFrame(step);
}
function activate() {
  document.querySelectorAll('.rp-card, .rp-kpi').forEach((el) => el.classList.add('rp-reveal'));
  const showAll = () => {
    document.querySelectorAll('.rp-reveal').forEach((el) => el.classList.add('in'));
    document.querySelectorAll('.rp-mbar').forEach((el) => el.classList.add('show'));
    document.querySelectorAll('.rp-bar-item').forEach((el) => el.classList.add('show'));
    document.querySelectorAll('.rp-share .fill, .rp-line, .rp-donut').forEach((el) => el.classList.add('show'));
  };
  if (STATIC) { showAll(); document.querySelectorAll('.v[data-num]').forEach(animateCount); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.rp-reveal').forEach((el) => io.observe(el));
  requestAnimationFrame(() => {
    document.querySelectorAll('.rp-mbar').forEach((el) => el.classList.add('show'));
    setTimeout(() => document.querySelectorAll('.rp-bar-item').forEach((el) => el.classList.add('show')), 80);
    document.querySelectorAll('.rp-share .fill, .rp-line, .rp-donut').forEach((el) => el.classList.add('show'));
  });
  document.querySelectorAll('.v[data-num]').forEach(animateCount);
}

/* ---------- Xuất ---------- */
function showToast(msg, ms = 5200) {
  const old = document.getElementById('rp-toast');
  if (old) old.remove();
  const d = document.createElement('div');
  d.id = 'rp-toast';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
async function exportPdf() {
  const btn = $('#rp-print'); const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang tạo PDF…';
  try {
    const r = await fetch(`/public/api/report/${encodeURIComponent(TOKEN)}/pdf?${apiQuery()}`);
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ('Lỗi ' + r.status)); }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `thong-ke-giao-dich-${state.from}_${state.to}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Đã tạo file PDF.', 2600);
  } catch (e) {
    showToast('Không tạo được PDF tự động (' + e.message + '). Đang mở hộp thoại in — chọn "Lưu dưới dạng PDF", bật "Đồ họa nền" và bỏ tick "Đầu trang và chân trang".');
    setTimeout(() => window.print(), 500);
  } finally { btn.disabled = false; btn.textContent = old; }
}
function exportGroups() {
  window.location.href = `/public/api/report/${encodeURIComponent(TOKEN)}/groups.xlsx?${apiQuery()}`;
}

/* ---------- Khởi động ---------- */
function init() {
  const days = Number(QS.get('days')) || 30;
  if (/^\d{4}-\d{2}-\d{2}$/.test(QS.get('from') || '') && /^\d{4}-\d{2}-\d{2}$/.test(QS.get('to') || '')) {
    state.from = QS.get('from'); state.to = QS.get('to');
    $('#rp-from').value = state.from; $('#rp-to').value = state.to;
  } else {
    applyPreset(days);
  }
  state.filters = { partner: QS.get('partner') || '', area: QS.get('area') || '', category: QS.get('category') || '', q: QS.get('q') || '' };
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { applyPreset(Number(b.dataset.preset)); load(); }));
  $('#rp-apply').addEventListener('click', () => {
    const f = $('#rp-from').value, t = $('#rp-to').value;
    if (f && t) { state.from = f; state.to = t; document.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active')); load(); }
  });
  $('#rp-f-apply').addEventListener('click', applyFilters);
  $('#rp-f-reset').addEventListener('click', resetFilters);
  $('#rp-f-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyFilters(); } });
  $('#rp-print').addEventListener('click', exportPdf);
  $('#rp-groups-export').addEventListener('click', exportGroups);
  if (!TOKEN) {
    $('#rp-error').hidden = false; $('#rp-error').textContent = 'Thiếu mã truy cập trong liên kết.';
    $('#rp-loading').hidden = true; return;
  }
  load();
}
init();
