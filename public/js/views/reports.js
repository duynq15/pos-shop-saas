import { $, esc, num, money, today, addDays, monthStart } from '../util.js';
import { api } from '../store.js';
import { icon } from '../icons.js';

const CFG = {
  overview: { label: 'Tổng quan', icon: icon('chart'), desc: 'Doanh thu, lợi nhuận và tình hình bán hàng' },
  products: { label: 'Báo cáo sản phẩm', icon: icon('package'), desc: 'Doanh thu, lợi nhuận, số lượng theo từng sản phẩm' },
  vat: { label: 'Thuế VAT', icon: icon('percent'), desc: 'Thuế GTGT đầu ra, đầu vào và thuế phải nộp' },
  analytics: { label: 'Phân tích thông minh', icon: icon('trend'), desc: 'ABC/Pareto, gợi ý nhập hàng, mua kèm, bất thường' },
};

const head = (section, extra = '') => `
<div class="rp-head">
  <div><h1>Báo cáo · ${CFG[section].label}</h1><div class="sub">${CFG[section].desc}</div></div>
  <div class="rp-filter">
    <div class="seg" data-role="seg">
      <button class="seg-btn" data-range="today">Hôm nay</button>
      <button class="seg-btn" data-range="yesterday">Hôm qua</button>
      <button class="seg-btn" data-range="week">7 ngày</button>
      <button class="seg-btn" data-range="month">Tháng này</button>
    </div>
    <input type="date" class="field" data-role="from"><input type="date" class="field" data-role="to">
    <button class="btn primary" data-role="go">Xem</button>${extra}
  </div>
</div>`;

const stat = (ic, k, v, cls = '', sub = '') => `<div class="stat ${cls}"><div class="k"><span class="ic">${ic}</span>${k}</div><div class="v">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

function shell(section) {
  if (section === 'overview') return `${head(section, '<button class="btn" data-export="sales">Xuất Excel</button>')}
<div class="stats" id="rp-stats"></div>
<div class="grid2" style="margin-bottom:14px">
  <div class="card"><div class="sec-title">Doanh thu theo ngày</div><div id="rp-days"></div></div>
  <div class="card"><div class="sec-title">Top sản phẩm bán chạy</div><div id="rp-top"></div></div>
</div>
<div class="grid2" style="margin-bottom:14px">
  <div class="card"><div class="sec-title">Doanh thu theo danh mục</div><div id="rp-cat"></div></div>
  <div class="card"><div class="sec-title">Doanh thu theo giờ</div><div id="rp-hours"></div></div>
</div>
<div class="grid2">
  <div class="card"><div class="sec-title">Sản phẩm sắp hết hàng <span class="hint" id="rp-low-n"></span></div><div class="tbl-wrap" style="box-shadow:none;max-height:300px"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Tồn</th><th class="r">Tối thiểu</th></tr></thead><tbody id="rp-low"></tbody></table></div></div>
  <div class="card"><div class="sec-title">Hàng bán chậm / tồn lâu</div><div class="tbl-wrap" style="box-shadow:none;max-height:300px"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Tồn</th><th class="r">Giá trị tồn</th><th class="r">Đã bán</th></tr></thead><tbody id="rp-slow"></tbody></table></div></div>
</div>`;

  if (section === 'products') return `${head(section, '<button class="btn" id="rp-prod-export">Xuất Excel</button>')}
<div class="stats" id="rp-prod-stats"></div>
<div class="card">
  <div class="sec-title">Bảng sản phẩm <span class="hint" id="rp-prod-n"></span></div>
  <div class="toolbar" style="margin-bottom:10px">
    <input class="field grow" id="rp-prod-q" placeholder="Tìm sản phẩm...">
    <select class="field" id="rp-prod-sort"><option value="revenue">Xếp theo doanh thu</option><option value="qty">Xếp theo số lượng</option><option value="profit">Xếp theo lợi nhuận</option><option value="name">Xếp theo tên</option></select>
    <button class="btn" id="rp-prod-view">Xem</button>
  </div>
  <div class="tbl-wrap" style="box-shadow:none;max-height:520px"><table class="grid"><thead><tr>
    <th>#</th><th>Sản phẩm</th><th class="r">SL bán</th><th class="r">Doanh thu</th><th class="r">Lợi nhuận</th><th class="r">Tỷ lệ LN</th><th class="r">Giá TB</th>
  </tr></thead><tbody id="rp-prod"></tbody></table></div>
</div>`;

  if (section === 'vat') return `${head(section)}
<div class="stats" id="rp-vat-stats"></div>
<div class="card">
  <div class="sec-title">Chi tiết thuế GTGT</div>
  <div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr><th>Loại</th><th class="r">Giá trị hàng</th><th class="r">Tiền thuế</th></tr></thead><tbody id="rp-vat"></tbody></table></div>
  <div class="rowline total"><span>VAT phải nộp (đầu ra − đầu vào)</span><b id="rp-vat-pay">0</b></div>
</div>`;

  return `${head(section)}
<div class="grid2" style="margin-bottom:14px">
  <div class="card"><div class="sec-title">Nhóm ABC (doanh thu) <span class="hint" id="an-abc-n"></span></div><div class="tbl-wrap" style="box-shadow:none;max-height:320px"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Doanh thu</th><th class="c">% lũy kế</th><th class="c">Nhóm</th></tr></thead><tbody id="an-abc"></tbody></table></div></div>
  <div class="card"><div class="sec-title">Gợi ý nhập hàng</div><div class="tbl-wrap" style="box-shadow:none;max-height:320px"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Tồn</th><th class="r">/ngày</th><th class="r">Đủ dùng</th><th class="r">Đề xuất</th></tr></thead><tbody id="an-reorder"></tbody></table></div></div>
</div>
<div class="grid2">
  <div class="card"><div class="sec-title">Thường mua kèm</div><div class="tbl-wrap" style="box-shadow:none;max-height:240px"><table class="grid"><thead><tr><th>Cặp sản phẩm</th><th class="r">Số lần</th></tr></thead><tbody id="an-basket"></tbody></table></div></div>
  <div class="card"><div class="sec-title">Bất thường (giảm giá cao)</div><div class="tbl-wrap" style="box-shadow:none;max-height:240px"><table class="grid"><thead><tr><th>Hóa đơn</th><th class="r">Giảm %</th><th class="r">Tổng</th></tr></thead><tbody id="an-anom"></tbody></table></div></div>
</div>`;
}

export function makeReportView(section) {
  let root = null;
  let from = today();
  let to = today();
  let prodRows = [];
  const q = (role) => root && root.querySelector(`[data-role="${role}"]`);

  function markSeg(r) {
    if (!root) return;
    root.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b.dataset.range === r));
  }

  function setRange(r) {
    const t = today();
    if (r === 'yesterday') { from = to = addDays(t, -1); }
    else if (r === 'week') { from = addDays(t, -6); to = t; }
    else if (r === 'month') { from = monthStart(); to = t; }
    else { from = to = t; }
    if (q('from')) q('from').value = from;
    if (q('to')) q('to').value = to;
    markSeg(r);
    load();
  }

  async function load() {
    const rangeEl = q('range');
    if (rangeEl) rangeEl.textContent = `Từ ${from} đến ${to}`;
    try {
      if (section === 'overview') await loadOverview();
      else if (section === 'products') await loadProducts();
      else if (section === 'vat') await loadVat();
      else await loadAnalytics();
    } catch (e) {
      const target = section === 'overview' ? $('#rp-stats') : section === 'products' ? $('#rp-prod') : section === 'vat' ? $('#rp-vat') : $('#an-abc');
      if (target) target.innerHTML = section === 'overview' ? `<div class="empty">${esc(e.message)}</div>` : `<tr><td class="empty">${esc(e.message)}</td></tr>`;
    }
  }

  async function loadOverview() {
    const [r, inv, slow] = await Promise.all([
      api(`/api/reports/summary?from=${from}&to=${to}`),
      api('/api/reports/inventory'),
      api(`/api/reports/slow-moving?from=${from}&to=${to}`),
    ]);
    const cards = [
      stat(icon('wallet'), 'Doanh thu thuần', money(r.revenue), 'primary', `${num(r.invoices)} hóa đơn`),
      stat(icon('trend'), 'Lợi nhuận gộp', money(r.profit), 'ok', r.revenue ? `${Math.round((r.profit / r.revenue) * 100)}% biên LN` : ''),
      stat(icon('receipt'), 'Số hóa đơn', num(r.invoices)),
      stat(icon('package'), 'Số món bán', num(r.items)),
      stat(icon('chart'), 'Giá trị TB/đơn', money(r.avg_order)),
      stat(icon('tag'), 'Giảm giá', money(r.discount), r.discount ? 'warn' : ''),
      stat(icon('wallet'), 'Tiền mặt', money(r.cash)),
      stat(icon('bank'), 'Chuyển khoản', money(r.transfer)),
      stat(icon('card'), 'Thẻ', money(r.card)),
      stat(icon('undo'), 'Phiếu trả hàng', num(r.returns), r.returns ? 'danger' : '', money(r.return_amount)),
      stat(icon('building'), 'Giá trị tồn kho', money(inv.stock_value)),
      stat(icon('clock'), 'Chờ chuyển khoản', `${num(r.pending.c)} HĐ`, r.pending.c ? 'warn' : '', money(r.pending.total)),
    ];
    $('#rp-stats').innerHTML = cards.join('');
    $('#rp-days').innerHTML = colChart(r.byDay, 'revenue', 'day');
    $('#rp-top').innerHTML = barList(r.top, 'revenue', 'name');
    $('#rp-cat').innerHTML = barList(r.byCategory, 'revenue', 'category');
    $('#rp-hours').innerHTML = colChart(r.byHour, 'revenue', 'hour');
    const ln = $('#rp-low-n'); if (ln) ln.textContent = r.lowStock.length ? `${r.lowStock.length} mặt hàng` : 'Không có';
    $('#rp-low').innerHTML = r.lowStock.map((p) => `<tr><td class="name">${esc(p.name)}</td><td class="r low">${num(p.stock)} ${esc(p.unit)}</td><td class="r">${num(p.min_stock)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Không có sản phẩm sắp hết</td></tr>';
    $('#rp-slow').innerHTML = slow.slice(0, 20).map((p) => `<tr><td class="name">${esc(p.name)}</td><td class="r">${num(p.stock)} ${esc(p.unit)}</td><td class="r">${num(p.stock_value)}</td><td class="r">${num(p.sold)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có dữ liệu</td></tr>';
  }

  async function loadProducts() {
    const sort = $('#rp-prod-sort')?.value || 'revenue';
    prodRows = await api(`/api/reports/products?from=${from}&to=${to}&sort=${sort}`);
    const rev = prodRows.reduce((s, p) => s + Number(p.revenue || 0), 0);
    const pro = prodRows.reduce((s, p) => s + Number(p.profit || 0), 0);
    const qty = prodRows.reduce((s, p) => s + Number(p.qty || 0), 0);
    const best = [...prodRows].sort((a, b) => b.revenue - a.revenue)[0];
    $('#rp-prod-stats').innerHTML = [
      stat(icon('wallet'), 'Tổng doanh thu', money(rev), 'primary', `${num(prodRows.length)} sản phẩm`),
      stat(icon('trend'), 'Tổng lợi nhuận', money(pro), 'ok', rev ? `${Math.round((pro / rev) * 100)}% biên LN` : ''),
      stat(icon('package'), 'Tổng SL bán', num(qty)),
      stat(icon('trend'), 'Bán chạy nhất', best ? esc(best.name) : '—'),
    ].join('');
    renderProducts();
  }

  function renderProducts() {
    const kw = ($('#rp-prod-q')?.value || '').trim().toLowerCase();
    const rows = kw ? prodRows.filter((p) => String(p.name).toLowerCase().includes(kw)) : prodRows;
    const n = $('#rp-prod-n'); if (n) n.textContent = `${rows.length} sản phẩm`;
    $('#rp-prod').innerHTML = rows.map((p, i) => {
      const margin = p.revenue ? Math.round((p.profit / p.revenue) * 100) : 0;
      return `<tr>
        <td><span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span></td>
        <td class="name">${esc(p.name)}</td>
        <td class="r">${num(p.qty)}</td>
        <td class="r"><b>${money(p.revenue)}</b></td>
        <td class="r" style="color:var(--ok)">${money(p.profit)}</td>
        <td class="r">${margin}%</td>
        <td class="r">${money(p.avg_price)}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Chưa có dữ liệu bán hàng</td></tr>';
  }

  async function loadVat() {
    const vat = await api(`/api/reports/vat?from=${from}&to=${to}`);
    const outVat = vat.output.reduce((s, t) => s + Number(t.tax || 0), 0);
    const inpVat = vat.input.reduce((s, t) => s + Number(t.tax || 0), 0);
    $('#rp-vat-stats').innerHTML = [
      stat(icon('up'), 'VAT đầu ra', money(outVat), 'primary'),
      stat(icon('down'), 'VAT đầu vào', money(inpVat)),
      stat(icon('receipt'), 'VAT phải nộp', money(vat.payable), vat.payable > 0 ? 'warn' : 'ok'),
    ].join('');
    const rows = [
      '<tr class="group-row"><td colspan="3">Bán ra (đầu ra)</td></tr>',
      ...vat.output.map((t) => `<tr><td>VAT ${t.rate}%</td><td class="r">${num(t.taxable)}</td><td class="r">${num(t.tax)}</td></tr>`),
      '<tr class="group-row"><td colspan="3">Mua vào (đầu vào)</td></tr>',
      ...vat.input.map((t) => `<tr><td>VAT ${t.rate}%</td><td class="r">${num(t.base)}</td><td class="r">${num(t.tax)}</td></tr>`),
    ];
    const body = $('#rp-vat');
    body.innerHTML = (vat.output.length || vat.input.length) ? rows.join('') : '<tr><td colspan="3" class="empty">Chưa có dữ liệu thuế</td></tr>';
    $('#rp-vat-pay').textContent = money(vat.payable);
  }

  async function loadAnalytics() {
    const ana = await api(`/api/reports/analytics?from=${from}&to=${to}`);
    const counts = { A: 0, B: 0, C: 0 };
    for (const p of ana.abc || []) counts[p.class] = (counts[p.class] || 0) + 1;
    const an = $('#an-abc-n'); if (an) an.textContent = `A: ${counts.A} · B: ${counts.B} · C: ${counts.C}`;
    $('#an-abc').innerHTML = (ana.abc || []).slice(0, 20).map((p) => `<tr><td class="name">${esc(p.name)}</td><td class="r">${num(p.revenue)}</td><td class="c">${p.cum_share}%</td><td class="c"><span class="badge ${p.class === 'A' ? 'paid' : p.class === 'B' ? 'pending' : 'cancelled'}">${p.class}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có dữ liệu</td></tr>';
    $('#an-reorder').innerHTML = (ana.reorder || []).map((p) => `<tr><td class="name">${esc(p.name)}</td><td class="r ${p.stock <= p.min_stock ? 'low' : ''}">${num(p.stock)}</td><td class="r">${p.per_day}</td><td class="r">${p.days_cover >= 999 ? '—' : p.days_cover}</td><td class="r"><b>${p.suggest}</b></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có gợi ý</td></tr>';
    $('#an-basket').innerHTML = (ana.basket || []).map((b) => `<tr><td>${esc(b.a)} + ${esc(b.b)}</td><td class="r"><b>${b.times}</b></td></tr>`).join('') || '<tr><td colspan="2" class="empty">Chưa có dữ liệu</td></tr>';
    $('#an-anom').innerHTML = (ana.anomalies || []).map((a) => `<tr><td><code>${esc(a.code)}</code></td><td class="r low">${a.pct}%</td><td class="r">${num(a.total)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">Không có bất thường · HĐ hủy: ${ana.cancelled}</td></tr>`;
  }

  function exportCSV(type) {
    window.location.href = `/api/reports/export?type=${type}&from=${from}&to=${to}`;
  }

  return {
    id: 'report-' + section,
    label: 'Báo cáo · ' + CFG[section].label,
    icon: CFG[section].icon,

    mount(el) {
      root = el;
      el.innerHTML = shell(section);
      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-range]');
        if (r) return setRange(r.dataset.range);
        const ex = e.target.closest('[data-export]');
        if (ex) return exportCSV(ex.dataset.export);
        if (e.target.dataset.role === 'go') return load();
        if (e.target.id === 'rp-prod-view') return loadProducts();
        if (e.target.id === 'rp-prod-export') { window.location.href = `/api/reports/export?type=products&from=${from}&to=${to}`; return; }
      });
      el.addEventListener('change', (e) => {
        if (e.target.dataset.role === 'from' || e.target.dataset.role === 'to') {
          from = q('from').value; to = q('to').value; markSeg(''); load();
        }
      });
      el.addEventListener('input', (e) => { if (e.target.id === 'rp-prod-q') renderProducts(); });
    },

    show() { setRange('today'); },
  };
}

export default makeReportView('overview');

function colChart(data, valueKey, labelKey) {
  if (!data.length) return '<div class="empty">Chưa có dữ liệu</div>';
  const max = Math.max(...data.map((d) => Math.abs(d[valueKey]))) || 1;
  return `<div class="cols">${data.map((d) => `<div class="col" title="${esc(d[labelKey])}: ${num(d[valueKey])}">
    <div class="bar" style="height:${Math.max(2, (Math.abs(d[valueKey]) / max) * 130)}px"></div>
    <div class="lbl">${esc(String(d[labelKey]).slice(-5))}</div></div>`).join('')}</div>`;
}
function barList(data, valueKey, labelKey, color) {
  if (!data.length) return '<div class="empty">Chưa có dữ liệu</div>';
  const max = Math.max(...data.map((d) => Math.abs(d[valueKey]))) || 1;
  return `<div class="bars">${data.map((d) => `<div class="bar-row">
    <span title="${esc(d[labelKey])}">${esc(String(d[labelKey]).slice(0, 18))}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${(Math.abs(d[valueKey]) / max) * 100}%;${color ? 'background:' + color : ''}"></span></span>
    <span class="val">${num(d[valueKey])}</span></div>`).join('')}</div>`;
}
