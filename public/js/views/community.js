// Số liệu tổng hợp của cộng đồng cho ban lãnh đạo (GĐ1.5, FR-18, BR-07, BR-09).
// Chỉ hiện số tổng; API không trả số liệu từng người bán.
import { $, esc, num, money, today, monthStart } from '../util.js';
import { api } from '../store.js';
import { icon } from '../icons.js';

const stat = (k, v, cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

export default {
  id: 'community',
  label: 'Cộng đồng',
  icon: icon('home'),

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Tổng hợp cộng đồng</h1><div class="sub">Chỉ số liệu tổng hợp, không có doanh thu từng người bán</div></div></div>
<div class="toolbar" style="margin-bottom:14px">
  <input type="date" class="field" id="cm-from"> <input type="date" class="field" id="cm-to">
  <button class="btn primary" id="cm-view">Xem</button>
</div>
<div class="stats" id="cm-stats"></div>`;
    $('#cm-view').onclick = load;
  },

  async show() {
    if (!$('#cm-from').value) { $('#cm-from').value = monthStart(); $('#cm-to').value = today(); }
    await load();
  },
};

async function load() {
  const from = $('#cm-from').value || today();
  const to = $('#cm-to').value || from;
  try {
    const s = await api(`/api/community/summary?from=${from}&to=${to}`);
    $('#cm-stats').innerHTML = stat('Người bán', num(s.sellers))
      + stat('Đã chuyển đổi số', `${num(s.converted_sellers)} / ${num(s.sellers)}`, 'primary')
      + stat('Số giao dịch', num(s.transactions))
      + stat('Tổng tiền', money(s.amount));
  } catch (e) { $('#cm-stats').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
