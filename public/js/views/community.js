// Số liệu tổng hợp của cộng đồng cho ban lãnh đạo (GĐ1.5, FR-18, BR-07, BR-09).
// Chỉ hiện số tổng; API không trả số liệu từng người bán.
import { $, esc, num, money, today, monthStart, toast } from '../util.js';
import { api } from '../store.js';
import { can } from '../auth.js';
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
<div class="stats" id="cm-stats"></div>
<div class="card hidden" id="cm-cat-card">
  <h3>Hạng mục hàng dùng chung</h3>
  <p class="muted" style="margin:-6px 0 12px;font-size:13px">Người bán trong cộng đồng chọn hạng mục từ danh sách này khi nhận tiền; họ không tự thêm được.
    Hạng mục đã dùng thì không xóa, chỉ ẩn.</p>
  <form class="toolbar" id="cm-cat-form"><input class="field" id="cm-cat-name" placeholder="Tên hạng mục mới, ví dụ: Rau củ" maxlength="60" style="flex:1;min-width:180px">
    <button class="btn primary" type="submit">Thêm</button></form>
  <div class="tbl-wrap"><table class="grid"><thead><tr><th>Hạng mục</th><th>Trạng thái</th><th></th></tr></thead><tbody id="cm-cat-body"></tbody></table></div>
</div>`;
    $('#cm-view').onclick = load;
    $('#cm-cat-form').onsubmit = async (e) => {
      e.preventDefault();
      try { renderCats(await api('/api/community/categories', { method: 'POST', body: { name: $('#cm-cat-name').value } })); $('#cm-cat-name').value = ''; toast('Đã thêm hạng mục'); }
      catch (err) { toast(err.message, true); }
    };
    $('#cm-cat-body').onclick = async (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      const id = b.dataset.cat; const act = b.dataset.act;
      let body;
      if (act === 'rename') {
        const input = b.closest('tr').querySelector('input');
        body = { name: input.value };
      } else body = { status: act === 'hide' ? 'hidden' : 'active' };
      try { renderCats(await api('/api/community/categories/' + id, { method: 'PATCH', body })); toast('Đã cập nhật'); }
      catch (err) { toast(err.message, true); }
    };
  },

  async show() {
    if (!$('#cm-from').value) { $('#cm-from').value = monthStart(); $('#cm-to').value = today(); }
    await load();
    if (can('community.categories')) {
      $('#cm-cat-card').classList.remove('hidden');
      try { renderCats(await api('/api/community/categories?all=1')); } catch (e) { toast(e.message, true); }
    }
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

function renderCats(list) {
  $('#cm-cat-body').innerHTML = list.map((c) => `<tr>
    <td><input class="field" value="${esc(c.name)}" maxlength="60" aria-label="Tên hạng mục" style="width:100%;max-width:280px"></td>
    <td>${c.status === 'active' ? '<span class="badge paid">Đang dùng</span>' : '<span class="badge">Đã ẩn</span>'}</td>
    <td class="r" style="white-space:nowrap"><button class="btn sm" data-cat="${c.id}" data-act="rename">Lưu tên</button>
      ${c.status === 'active' ? `<button class="btn sm" data-cat="${c.id}" data-act="hide">Ẩn</button>` : `<button class="btn sm" data-cat="${c.id}" data-act="show">Dùng lại</button>`}</td>
  </tr>`).join('') || '<tr><td colspan="3" class="empty">Chưa có hạng mục. Thêm hạng mục đầu tiên ở trên.</td></tr>';
}
