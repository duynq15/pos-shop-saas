import { $, esc, num, money, today, addDays, monthStart } from '../util.js';
import { api } from '../store.js';

export default {
  id: 'reports',
  label: 'Báo cáo',
  icon: '📊',
  key: 'F5',

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Báo cáo</h1><div class="sub" id="rp-range"></div></div></div>
<div class="toolbar">
  <button class="btn" data-range="today">Hôm nay</button>
  <button class="btn" data-range="yesterday">Hôm qua</button>
  <button class="btn" data-range="week">7 ngày</button>
  <button class="btn" data-range="month">Tháng này</button>
  <input type="date" class="field" id="rp-from"><input type="date" class="field" id="rp-to">
  <button class="btn primary" id="btn-rp">Xem</button>
  <span class="spacer"></span>
  <button class="btn" data-export="sales">CSV bán hàng</button>
  <button class="btn" data-export="products">CSV sản phẩm</button>
</div>
<div class="stats" id="rp-stats"></div>
<div class="grid2" style="margin-bottom:14px">
  <div class="card"><h3>Doanh thu theo ngày</h3><div id="rp-days"></div></div>
  <div class="card"><h3>Top sản phẩm bán chạy</h3><div id="rp-top"></div></div>
</div>
<div class="grid2" style="margin-bottom:14px">
  <div class="card"><h3>Doanh thu theo danh mục</h3><div id="rp-cat"></div></div>
  <div class="card"><h3>Doanh thu theo giờ</h3><div id="rp-hours"></div></div>
</div>
<div class="card" style="margin-bottom:14px"><h3>⚠️ Sản phẩm sắp hết hàng</h3><div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Tồn</th><th class="r">Tối thiểu</th></tr></thead><tbody id="rp-low"></tbody></table></div></div>
<div class="card"><h3>🐢 Hàng bán chậm / tồn lâu</h3><div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Tồn</th><th class="r">Giá trị tồn</th><th class="r">Đã bán</th></tr></thead><tbody id="rp-slow"></tbody></table></div></div>
<div class="card" style="margin-top:14px"><h3>Thuế GTGT (VAT)</h3><div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr><th>Loại</th><th class="r">Giá trị</th><th class="r">Tiền thuế</th></tr></thead><tbody id="rp-vat"></tbody></table></div><div class="rowline total"><span>VAT phải nộp (đầu ra − đầu vào)</span><b id="rp-vat-pay">0</b></div></div>`;
    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-range]');
      if (r) return setRange(r.dataset.range);
      const ex = e.target.closest('[data-export]');
      if (ex) return exportCSV(ex.dataset.export);
      if (e.target.id === 'btn-rp') return load();
    });
  },

  show() { setRange('today'); },
};

function setRange(r) {
  const t = today();
  let f = t, to = t;
  if (r === 'yesterday') f = to = addDays(t, -1);
  else if (r === 'week') f = addDays(t, -6);
  else if (r === 'month') f = monthStart();
  $('#rp-from').value = f; $('#rp-to').value = to;
  load();
}

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

async function load() {
  const from = $('#rp-from').value, to = $('#rp-to').value;
  $('#rp-range').textContent = `Từ ${from} đến ${to}`;
  const [r, inv, slow, vat] = await Promise.all([
    api(`/api/reports/summary?from=${from}&to=${to}`),
    api('/api/reports/inventory'),
    api(`/api/reports/slow-moving?from=${from}&to=${to}`),
    api(`/api/reports/vat?from=${from}&to=${to}`),
  ]);
  const cards = [
    ['Doanh thu thuần', money(r.revenue), 'primary'],
    ['Lợi nhuận gộp', money(r.profit), 'ok'],
    ['Số hóa đơn', num(r.invoices), ''],
    ['Số món bán', num(r.items), ''],
    ['Giá trị TB/đơn', money(r.avg_order), ''],
    ['Giảm giá', money(r.discount), 'warn'],
    ['Tiền mặt', money(r.cash), ''],
    ['Chuyển khoản', money(r.transfer), ''],
    ['Thẻ', money(r.card), ''],
    ['Phiếu trả hàng', `${num(r.returns)} · ${money(r.return_amount)}`, r.returns ? 'danger' : ''],
    ['Giá trị tồn kho', money(inv.stock_value), ''],
    ['Chờ chuyển khoản', `${num(r.pending.c)} HĐ · ${money(r.pending.total)}`, r.pending.c ? 'warn' : ''],
  ];
  $('#rp-stats').innerHTML = cards.map(([k, v, cls]) => `<div class="stat ${cls}"><span class="k">${k}</span><div class="v">${v}</div></div>`).join('');
  $('#rp-days').innerHTML = colChart(r.byDay, 'revenue', 'day');
  $('#rp-top').innerHTML = barList(r.top, 'revenue', 'name');
  $('#rp-cat').innerHTML = barList(r.byCategory, 'revenue', 'category');
  $('#rp-hours').innerHTML = colChart(r.byHour, 'revenue', 'hour');
  $('#rp-low').innerHTML = r.lowStock.map((p) => `<tr><td>${esc(p.name)}</td><td class="r low">${num(p.stock)} ${esc(p.unit)}</td><td class="r">${num(p.min_stock)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Không có sản phẩm sắp hết</td></tr>';
  $('#rp-slow').innerHTML = slow.slice(0, 20).map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${num(p.stock)} ${esc(p.unit)}</td><td class="r">${num(p.stock_value)}</td><td class="r">${num(p.sold)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có dữ liệu</td></tr>';
  const vatRows = [
    ...vat.output.map((t) => `<tr><td>Bán ra · VAT ${t.rate}%</td><td class="r">${num(t.taxable)}</td><td class="r">${num(t.tax)}</td></tr>`),
    ...vat.input.map((t) => `<tr><td>Mua vào · VAT ${t.rate}%</td><td class="r">${num(t.base)}</td><td class="r">${num(t.tax)}</td></tr>`),
  ];
  $('#rp-vat').innerHTML = vatRows.join('') || '<tr><td colspan="3" class="empty">Chưa có dữ liệu thuế</td></tr>';
  $('#rp-vat-pay').textContent = money(vat.payable);
}

function exportCSV(type) {
  const from = $('#rp-from').value, to = $('#rp-to').value;
  window.location.href = `/api/reports/export?type=${type}&from=${from}&to=${to}`;
}
