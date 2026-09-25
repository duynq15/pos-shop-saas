import { $, esc, num, money, toast, statusBadge, methodLabel, today } from '../util.js';
import { api } from '../store.js';
import { showReceipt } from './receipt.js';

let type = 'sale';

export default {
  id: 'invoices',
  label: 'Hóa đơn',
  icon: '🧾',
  key: 'F4',

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Hóa đơn</h1><div class="sub" id="inv-count"></div></div></div>
<div class="tabs" id="inv-tabs">
  <button class="tab active" data-type="sale">Bán hàng</button>
  <button class="tab" data-type="return">Trả hàng</button>
</div>
<div class="toolbar">
  <input type="date" class="field" id="inv-from">
  <input type="date" class="field" id="inv-to">
  <input class="field grow" id="inv-q" placeholder="Mã HĐ / khách hàng / SĐT...">
  <select class="field" id="inv-status"><option value="">Mọi trạng thái</option><option value="paid">Đã thanh toán</option><option value="pending">Chờ chuyển khoản</option><option value="cancelled">Đã hủy</option></select>
  <select class="field" id="inv-method"><option value="">Mọi hình thức</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option><option value="card">Thẻ</option><option value="mixed">Hỗn hợp</option></select>
  <button class="btn" id="btn-inv-search">Lọc</button>
</div>
<div class="tbl-wrap"><table class="grid"><thead><tr>
  <th>Mã HĐ</th><th>Thời gian</th><th>Khách</th><th>Thanh toán</th><th class="r">Tổng</th><th>Trạng thái</th><th></th>
</tr></thead><tbody id="inv-body"></tbody></table></div>`;
    $('#inv-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      type = b.dataset.type;
      $('#inv-tabs .tab').forEach((x) => x.classList.toggle('active', x === b));
      load();
    });
    $('#btn-inv-search').onclick = load;
    $('#inv-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    $('#inv-status').addEventListener('change', load);
    $('#inv-method').addEventListener('change', load);
    $('#inv-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const id = e.target.closest('tr').dataset.id;
      const inv = await api('/api/invoices/' + id);
      showReceipt(inv);
    });
  },

  show() {
    if (!$('#inv-from').value) { $('#inv-from').value = today(); $('#inv-to').value = today(); }
    load();
  },
};

async function load() {
  const qs = new URLSearchParams({
    from: $('#inv-from').value, to: $('#inv-to').value, q: $('#inv-q').value.trim(),
    status: $('#inv-status').value, method: $('#inv-method').value, type,
  });
  const rows = await api('/api/invoices?' + qs);
  $('#inv-count').textContent = `${rows.length} ${type === 'return' ? 'phiếu trả' : 'hóa đơn'}`;
  $('#inv-body').innerHTML = rows.map((i) => `<tr data-id="${i.id}">
    <td><b>${esc(i.code)}</b></td><td>${esc(i.created_at)}</td>
    <td>${esc(i.customer_name || '')}${i.customer_phone ? `<span class="sub">${esc(i.customer_phone)}</span>` : ''}</td>
    <td>${methodLabel(i.payment_method)}</td>
    <td class="r"><b>${money(i.total)}</b>${i.discount ? `<span class="sub">giảm ${num(i.discount)}</span>` : ''}</td>
    <td>${statusBadge(i.status)}</td>
    <td class="r"><button class="btn sm" data-act="view">Xem / In</button></td></tr>`).join('')
    || `<tr><td colspan="7" class="empty">Không có ${type === 'return' ? 'phiếu trả' : 'hóa đơn'}</td></tr>`;
}
