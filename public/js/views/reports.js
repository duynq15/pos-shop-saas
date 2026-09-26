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
<div class="card" style="margin-top:14px"><h3>Thuế GTGT (VAT)</h3><div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr><th>Loại</th><th class="r">Giá trị</th><th class="r">Tiền thuế</th></tr></thead><tbody id="rp-vat"></tbody></table></div><div class="rowline total"><span>VAT phải nộp (đầu ra − đầu vào)</span><b id="rp-vat-pay">0</b></div></div>
<div class="card" style="margin-top:14px"><h3>🧠 Phân tích thông minh</h3>
  <div class="grid2">
    <div><h4 style="margin:6px 0">Nhóm ABC (doanh thu)</h4><div class="tbl-wrap" style="box-shadow:none;max-height:260px"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Doanh thu</th><th class="c">% lũy kế</th><th class="c">Nhóm</th></tr></thead><tbody id="an-abc"></tbody></table></div></div>
    <div><h4 style="margin:6px 0">Gợi ý nhập hàng</h4><div class="tbl-wrap" style="box-shadow:none;max-height:260px"><table class="grid"><thead><tr><th>Sản phẩm</th><th class="r">Tồn</th><th class="r">/ngày</th><th class="r">Đủ dùng</th><th class="r">Đề xuất</th></tr></thead><tbody id="an-reorder"></tbody></table></div></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div><h4 style="margin:6px 0">Thường mua kèm</h4><div class="tbl-wrap" style="box-shadow:none;max-height:220px"><table class="grid"><thead><tr><th>Cặp sản phẩm</th><th class="r">Số lần</th></tr></thead><tbody id="an-basket"></tbody></table></div></div>
    <div><h4 style="margin:6px 0">Bất thường (giảm giá cao)</h4><div class="tbl-wrap" style="box-shadow:none;max-height:220px"><table class="grid"><thead><tr><th>Hóa đơn</th><th class="r">Giảm %</th><th class="r">Tổng</th></tr></thead><tbody id="an-anom"></tbody></table></div></div>
  </div>
</div>
<div class="card" style="margin-top:14px"><h3>🏦 Giao dịch VietQR</h3>
  <div id="vqr-sum" class="muted" style="margin-bottom:8px"></div>
  <div class="toolbar">
    <input class="field grow" id="vqr-q" placeholder="Tìm mã đối soát / mã giao dịch / hóa đơn...">
    <select class="field" id="vqr-matched"><option value="">Tất cả</option><option value="1">Đã khớp</option><option value="0">Chưa khớp</option></select>
    <button class="btn" id="vqr-filter">Lọc</button>
    <span class="spacer"></span>
    <button class="btn" id="vqr-export">Xuất CSV</button>
  </div>
  <div class="tbl-wrap" style="box-shadow:none;max-height:320px"><table class="grid"><thead><tr>
    <th>Thời gian</th><th>Mã GD</th><th>Hóa đơn</th><th class="r">Số tiền</th><th>Trạng thái</th><th>Đối soát</th>
  </tr></thead><tbody id="vqr-body"></tbody></table></div>
</div>`;
    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-range]');
      if (r) return setRange(r.dataset.range);
      const ex = e.target.closest('[data-export]');
      if (ex) return exportCSV(ex.dataset.export);
      if (e.target.id === 'btn-rp') return load();
      if (e.target.id === 'vqr-filter') return loadVietqr($('#rp-from').value, $('#rp-to').value);
      if (e.target.id === 'vqr-export') { window.location.href = `/api/reports/vietqr/export?from=${$('#rp-from').value}&to=${$('#rp-to').value}`; return; }
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
  const [r, inv, slow, vat, ana] = await Promise.all([
    api(`/api/reports/summary?from=${from}&to=${to}`),
    api('/api/reports/inventory'),
    api(`/api/reports/slow-moving?from=${from}&to=${to}`),
    api(`/api/reports/vat?from=${from}&to=${to}`),
    api(`/api/reports/analytics?from=${from}&to=${to}`),
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

  // Phân tích thông minh
  $('#an-abc').innerHTML = (ana.abc || []).slice(0, 20).map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${num(p.revenue)}</td><td class="c">${p.cum_share}%</td><td class="c"><span class="badge ${p.class === 'A' ? 'paid' : p.class === 'B' ? 'pending' : 'cancelled'}">${p.class}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có dữ liệu</td></tr>';
  $('#an-reorder').innerHTML = (ana.reorder || []).map((p) => `<tr><td>${esc(p.name)}</td><td class="r ${p.stock <= p.min_stock ? 'low' : ''}">${num(p.stock)}</td><td class="r">${p.per_day}</td><td class="r">${p.days_cover >= 999 ? '—' : p.days_cover}</td><td class="r"><b>${p.suggest}</b></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có gợi ý</td></tr>';
  $('#an-basket').innerHTML = (ana.basket || []).map((b) => `<tr><td>${esc(b.a)} + ${esc(b.b)}</td><td class="r">${b.times}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Chưa có dữ liệu</td></tr>';
  $('#an-anom').innerHTML = (ana.anomalies || []).map((a) => `<tr><td>${esc(a.code)}</td><td class="r low">${a.pct}%</td><td class="r">${num(a.total)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">Không có bất thường · HĐ hủy: ${ana.cancelled}</td></tr>`;
  await loadVietqr(from, to);
}

async function loadVietqr(from, to) {
  try {
    const params = new URLSearchParams({ from, to, q: $('#vqr-q').value.trim(), matched: $('#vqr-matched').value });
    const r = await api('/api/reports/vietqr?' + params);
    const s = r.summary || {};
    $('#vqr-sum').innerHTML = `Tổng <b>${num(s.count)}</b> giao dịch · Đã khớp <b>${num(s.matched_count)}</b> · Chưa khớp <b>${num(s.unmatched_count)}</b> · Tổng tiền nhận <b>${money(s.received)}</b>`;
    $('#vqr-body').innerHTML = (r.items || []).map((t) => `<tr>
      <td>${esc(t.created_at)}</td>
      <td><code>${esc(String(t.transactionid || '').slice(0, 12))}</code></td>
      <td>${esc(t.invoice_code || '—')}</td>
      <td class="r"><b>${money(t.amount)}</b></td>
      <td>${t.matched ? '<span class="badge paid">Đã khớp</span>' : '<span class="badge cancelled">Chưa khớp</span>'}</td>
      <td class="muted">${esc(t.note || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có giao dịch VietQR</td></tr>';
  } catch (e) { $('#vqr-body').innerHTML = `<tr><td colspan="6" class="empty">${esc(e.message)}</td></tr>`; }
}

function exportCSV(type) {
  const from = $('#rp-from').value, to = $('#rp-to').value;
  window.location.href = `/api/reports/export?type=${type}&from=${from}&to=${to}`;
}
