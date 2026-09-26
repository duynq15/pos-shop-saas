import { $, esc, num, money, today, addDays, monthStart } from '../util.js';
import { api, state } from '../store.js';
import { can } from '../auth.js';

const V = { from: today(), to: today(), preset: 'today', bank: '', field: 'ref', q: '', status: '', page: 1, size: 20 };

const ST = {
  success: ['badge paid', 'Thành công'],
  pending: ['badge pending', 'Chờ thanh toán'],
  unmatched: ['badge cancelled', 'Chưa khớp'],
  refund: ['badge return', 'Hoàn tiền'],
};

export default {
  id: 'vietqr',
  label: 'Giao dịch VietQR',
  icon: '🏦',

  mount(el) {
    el.innerHTML = `
<div class="view-head">
  <div><h1>Giao dịch VietQR</h1><div class="sub" id="vqt-range"></div></div>
  <div class="toolbar" style="margin:0">
    ${can('report.export') ? '<button class="btn" id="vqt-export">📥 Xuất Excel</button>' : ''}
  </div>
</div>

<div class="card">
  <div class="filters">
    <label class="fld"><span>Tài khoản ngân hàng</span>
      <select class="field" id="vqt-bank"></select></label>
    <label class="fld"><span>Lọc theo</span>
      <select class="field" id="vqt-field">
        <option value="ref">Mã giao dịch</option>
        <option value="order">Mã đơn hàng</option>
        <option value="content">Nội dung</option>
      </select></label>
    <label class="fld"><span>Tìm kiếm</span>
      <input class="field" id="vqt-q" placeholder="Nhập giá trị tìm kiếm"></label>
    <label class="fld"><span>Thời gian</span>
      <select class="field" id="vqt-preset">
        <option value="today">Hôm nay</option>
        <option value="yesterday">Hôm qua</option>
        <option value="week">7 ngày</option>
        <option value="month">Tháng này</option>
        <option value="custom">Tùy chọn</option>
      </select></label>
    <label class="fld span2"><span>Tùy chọn thời gian</span>
      <span class="range2"><input type="date" class="field" id="vqt-from"><input type="date" class="field" id="vqt-to"></span></label>
  </div>
  <div class="filters-actions">
    <button class="btn" id="vqt-clear">✕ Xóa bộ lọc</button>
    <button class="btn primary" id="vqt-search">🔍 Tìm kiếm</button>
  </div>
</div>

<div class="stats" id="vqt-stats"></div>

<div class="tabs" id="vqt-tabs"></div>

<div class="card">
  <div class="toolbar" style="margin-bottom:10px">
    <b id="vqt-title">Danh sách giao dịch</b>
    <span class="spacer"></span>
    <button class="btn" id="vqt-newqr">＋ Tạo QR giao dịch</button>
  </div>
  <div class="tbl-wrap"><table class="grid"><thead><tr>
    <th>STT</th><th>Mã tham chiếu</th><th class="r">Số tiền (đ)</th><th>Thời gian TT / Tạo</th>
    <th>Tài khoản NH</th><th>Chủ tài khoản</th><th>Nội dung TT</th><th>Loại giao dịch</th>
    <th>Mã đơn hàng</th><th>Trạng thái</th>
  </tr></thead><tbody id="vqt-body"></tbody></table></div>
  <div class="toolbar" id="vqt-pager" style="justify-content:flex-end;margin:10px 0 0"></div>
</div>`;

    // Mỗi cửa hàng chỉ có 1 tài khoản ngân hàng → mặc định chọn luôn tài khoản của shop.
    const ba = state.settings?.bank_account || '';
    const holder = state.settings?.account_holder ? ' · ' + state.settings.account_holder : '';
    $('#vqt-bank').innerHTML = ba
      ? `<option value="${esc(ba)}" selected>${esc(ba + holder)}</option>`
      : '<option value="">Chưa cấu hình tài khoản</option>';
    V.bank = ba;

    el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.id === 'vqt-search') { V.q = $('#vqt-q').value.trim(); V.page = 1; return load(); }
      if (t.id === 'vqt-clear') return clearFilter();
      if (t.id === 'vqt-export') { window.location.href = '/api/vietqr/transactions/export?' + qs(false); return; }
      if (t.id === 'vqt-newqr') { if (window.showView) window.showView('pos'); return; }
      if (t.id === 'vqt-prev') { V.page = Math.max(1, V.page - 1); return load(); }
      if (t.id === 'vqt-next') { V.page += 1; return load(); }
      const tab = t.closest('[data-status]');
      if (tab) { V.status = tab.dataset.status; V.page = 1; return load(); }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'vqt-bank') { V.bank = t.value; V.page = 1; return load(); }
      if (t.id === 'vqt-field') { V.field = t.value; return; }
      if (t.id === 'vqt-preset') { setPreset(t.value); return load(); }
      if (t.id === 'vqt-from' || t.id === 'vqt-to') { V.preset = 'custom'; $('#vqt-preset').value = 'custom'; V.from = $('#vqt-from').value; V.to = $('#vqt-to').value; V.page = 1; return load(); }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'vqt-q') { V.q = e.target.value.trim(); V.page = 1; load(); } });
  },

  show() { setPreset(V.preset || 'today'); load(); },
};

function qs(paged) {
  const p = new URLSearchParams({ from: V.from, to: V.to, bank: V.bank, field: V.field, q: V.q, status: V.status });
  if (paged) { p.set('page', V.page); p.set('size', V.size); }
  return p.toString();
}

function setPreset(p) {
  V.preset = p;
  const t = today();
  if (p === 'yesterday') { V.from = addDays(t, -1); V.to = addDays(t, -1); }
  else if (p === 'week') { V.from = addDays(t, -6); V.to = t; }
  else if (p === 'month') { V.from = monthStart(); V.to = t; }
  else if (p === 'today') { V.from = t; V.to = t; }
  const pf = $('#vqt-preset'); if (pf) pf.value = p;
  const ff = $('#vqt-from'), ft = $('#vqt-to'); if (ff) ff.value = V.from; if (ft) ft.value = V.to;
}

function clearFilter() {
  V.bank = ''; V.field = 'ref'; V.q = ''; V.status = ''; V.page = 1;
  setPreset('today');
  const b = $('#vqt-bank'); if (b) b.value = '';
  const f = $('#vqt-field'); if (f) f.value = 'ref';
  const q = $('#vqt-q'); if (q) q.value = '';
  load();
}

async function load() {
  const range = $('#vqt-range'); if (range) range.textContent = `Từ ${V.from} đến ${V.to}`;
  try {
    const r = await api('/api/vietqr/transactions?' + qs(true));
    renderStats(r.summary);
    renderTabs(r.summary);
    renderRows(r.items, r.page, r.size);
    renderPager(r.total, r.page, r.size);
  } catch (e) {
    $('#vqt-body').innerHTML = `<tr><td colspan="10" class="empty">${esc(e.message)}</td></tr>`;
  }
}

function renderStats(s) {
  const cards = [
    ['💳', 'Tất cả GD', num(s.total_count) + ' GD', money(s.total_amount), 'Doanh thu', 'primary'],
    ['✅', 'GD đã hoạch toán', num(s.success_count) + ' GD', money(s.success_amount), 'Doanh thu', 'ok'],
    ['⏳', 'GD chưa hoạch toán', num(s.unmatched_count) + ' GD', money(s.unmatched_amount), 'Doanh thu', 'warn'],
    ['↩️', 'GD hoàn tiền', num(s.refund_count) + ' GD', money(s.refund_amount), 'Chi phí', 'danger'],
  ];
  const el = $('#vqt-stats'); if (!el) return;
  el.innerHTML = cards.map(([ic, k, c, v, sub, cls]) => `<div class="stat ${cls}">
    <div class="k"><span class="ic">${ic}</span>${k}<span class="spacer"></span><span class="muted">${c}</span></div>
    <div class="v">${v}</div><div class="sub">${sub}</div></div>`).join('');
}

function renderTabs(s) {
  const el = $('#vqt-tabs'); if (!el) return;
  const tabs = [['', 'Tất cả', s.total_count], ['unmatched', 'Chờ phân loại', s.unmatched_count]];
  el.innerHTML = tabs.map(([v, t, c]) => `<button class="tab ${V.status === v ? 'active' : ''}" data-status="${v}">${t} <span class="chip" style="padding:1px 7px">${num(c)}</span></button>`).join('');
}

function renderRows(items, page, size) {
  const el = $('#vqt-body'); if (!el) return;
  el.innerHTML = (items || []).map((r, i) => {
    const [cls, label] = ST[r.status] || ['', r.status];
    const refund = r.status === 'refund';
    const amt = `${refund ? '- ' : '+ '}${num(r.amount)}`;
    const type = r.type === 'Hoàn tiền' ? '<span class="badge return">Hoàn tiền</span>' : '<span class="badge sale">QR giao dịch</span>';
    return `<tr>
      <td>${(page - 1) * size + i + 1}</td>
      <td>${r.ref ? `<code>${esc(r.ref)}</code>` : '<span class="muted">—</span>'}</td>
      <td class="r" style="color:${refund ? 'var(--danger)' : 'var(--ok)'};font-weight:600">${amt}</td>
      <td>${esc(r.time || '')}</td>
      <td>${esc(r.bank_account || '—')}</td>
      <td>${esc(r.account_holder || '—')}</td>
      <td class="muted">${esc(r.content || '')}</td>
      <td>${type}</td>
      <td>${r.order_id ? `<code>${esc(r.order_id)}</code>` : '—'}</td>
      <td><span class="${cls}">${label}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="empty">Chưa có giao dịch</td></tr>';
}

function renderPager(total, page, size) {
  const el = $('#vqt-pager'); if (!el) return;
  const pages = Math.max(1, Math.ceil(total / size));
  el.innerHTML = `<span class="muted">Hiển thị ${num(total)} · Trang ${page}/${pages}</span>
    <button class="btn sm" id="vqt-prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
    <button class="btn sm" id="vqt-next" ${page >= pages ? 'disabled' : ''}>›</button>`;
}
