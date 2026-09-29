import { $, esc, modal, closeModal, toast } from '../util.js';
import { api, state, loadPromotions, loadCategories } from '../store.js';
import { icon } from '../icons.js';

export default {
  id: 'promotions',
  label: 'Khuyến mãi',
  icon: icon('gift'),

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Khuyến mãi</h1><div class="sub">Tự động áp dụng khi bán hàng theo điều kiện</div></div>
  <button class="btn primary" id="pm-new">+ Thêm khuyến mãi</button></div>
<div class="tbl-wrap"><table class="grid"><thead><tr>
  <th>Tên</th><th>Loại</th><th>Điều kiện</th><th>Giảm</th><th>Thời gian</th><th>Trạng thái</th><th></th>
</tr></thead><tbody id="pm-body"></tbody></table></div>`;
    $('#pm-new').onclick = () => openForm(null);
    $('#pm-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const id = Number(btn.closest('tr').dataset.id);
      const p = state.promotions.find((x) => x.id === id);
      if (btn.dataset.act === 'edit') openForm(p);
      if (btn.dataset.act === 'toggle') { await api('/api/promotions/' + id, { method: 'PUT', body: { ...p, active: p.active ? 0 : 1 } }); reload(); }
      if (btn.dataset.act === 'del' && confirm(`Xóa khuyến mãi "${p.name}"?`)) { await api('/api/promotions/' + id, { method: 'DELETE' }); toast('Đã xóa'); reload(); }
    });
  },

  async show() { await loadPromotions(); await loadCategories(); render(); },
};

async function reload() { await loadPromotions(); render(); }

function condText(p) {
  if (p.kind === 'order') return `Hóa đơn từ ${Number(p.min_subtotal || 0).toLocaleString('vi-VN')}đ`;
  const target = p.target_type === 'category' ? (state.categories.find((c) => c.id === p.target_id)?.name || 'danh mục') : p.target_type === 'product' ? 'sản phẩm chọn' : 'mọi sản phẩm';
  return `Mua từ ${p.min_qty || 0} · ${target}`;
}
function render() {
  const list = state.promotions;
  $('#pm-body').innerHTML = list.map((p) => `<tr data-id="${p.id}">
    <td class="name">${esc(p.name)}</td>
    <td>${p.kind === 'order' ? 'Hóa đơn' : 'Sản phẩm'}</td>
    <td class="muted">${condText(p)}</td>
    <td>${p.discount_type === 'percent' ? p.discount_value + '%' : Number(p.discount_value).toLocaleString('vi-VN') + 'đ'}</td>
    <td class="muted">${esc(p.start_date || '—')} → ${esc(p.end_date || '—')}</td>
    <td>${p.active ? '<span class="badge paid">Đang chạy</span>' : '<span class="badge cancelled">Tắt</span>'}</td>
    <td class="r"><button class="btn sm" data-act="toggle">${p.active ? 'Tắt' : 'Bật'}</button>
      <button class="btn sm" data-act="edit">Sửa</button><button class="btn sm danger" data-act="del">Xóa</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có khuyến mãi</td></tr>';
}

function openForm(p) {
  const isNew = !p;
  const d = p || { kind: 'order', discount_type: 'percent', discount_value: '', target_type: 'all', min_subtotal: 0, min_qty: 0, active: 1, priority: 0 };
  const catOpts = state.categories.map((c) => `<option value="${c.id}" ${d.target_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  modal(`<h2>${isNew ? 'Thêm' : 'Sửa'} khuyến mãi</h2>
    <div class="form-grid">
      <label class="fld full">Tên chương trình *<input class="field" id="pm-name" value="${esc(d.name || '')}"></label>
      <label class="fld">Phạm vi
        <select class="field" id="pm-kind"><option value="order" ${d.kind === 'order' ? 'selected' : ''}>Theo hóa đơn</option><option value="item" ${d.kind === 'item' ? 'selected' : ''}>Theo sản phẩm</option></select></label>
      <label class="fld">Kiểu giảm
        <select class="field" id="pm-type"><option value="percent" ${d.discount_type === 'percent' ? 'selected' : ''}>Phần trăm (%)</option><option value="amount" ${d.discount_type === 'amount' ? 'selected' : ''}>Số tiền</option></select></label>
      <label class="fld">Giá trị giảm *<input class="field" id="pm-value" type="number" min="0" value="${d.discount_value}"></label>
      <label class="fld">Ưu tiên<input class="field" id="pm-priority" type="number" value="${d.priority || 0}"></label>
      <label class="fld" id="pm-min-sub-wrap">Đơn tối thiểu<input class="field" id="pm-min-sub" type="number" min="0" value="${d.min_subtotal || 0}"></label>
      <label class="fld" id="pm-min-qty-wrap">SL tối thiểu<input class="field" id="pm-min-qty" type="number" min="0" value="${d.min_qty || 0}"></label>
      <label class="fld" id="pm-target-wrap">Áp dụng cho
        <select class="field" id="pm-target"><option value="all" ${d.target_type === 'all' ? 'selected' : ''}>Mọi sản phẩm</option><option value="category" ${d.target_type === 'category' ? 'selected' : ''}>Theo danh mục</option></select></label>
      <label class="fld" id="pm-cat-wrap">Danh mục<select class="field" id="pm-cat">${catOpts}</select></label>
      <label class="fld">Từ ngày<input class="field" type="date" id="pm-start" value="${esc(d.start_date || '')}"></label>
      <label class="fld">Đến ngày<input class="field" type="date" id="pm-end" value="${esc(d.end_date || '')}"></label>
      <label class="chk full"><input type="checkbox" id="pm-active" ${d.active ? 'checked' : ''}> Kích hoạt</label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="pm-save">Lưu</button><button class="btn" id="pm-close">Đóng</button></div>`);
  const toggle = () => {
    const kind = $('#pm-kind').value;
    $('#pm-min-sub-wrap').style.display = kind === 'order' ? '' : 'none';
    $('#pm-min-qty-wrap').style.display = kind === 'item' ? '' : 'none';
    $('#pm-target-wrap').style.display = kind === 'item' ? '' : 'none';
    $('#pm-cat-wrap').style.display = kind === 'item' && $('#pm-target').value === 'category' ? '' : 'none';
  };
  $('#pm-kind').onchange = toggle; $('#pm-target').onchange = toggle; toggle();
  $('#pm-close').onclick = closeModal;
  $('#pm-save').onclick = async () => {
    const body = {
      name: $('#pm-name').value, kind: $('#pm-kind').value, discount_type: $('#pm-type').value,
      discount_value: $('#pm-value').value, priority: $('#pm-priority').value,
      min_subtotal: $('#pm-min-sub').value, min_qty: $('#pm-min-qty').value,
      target_type: $('#pm-target').value, target_id: $('#pm-target').value === 'category' ? $('#pm-cat').value : null,
      start_date: $('#pm-start').value, end_date: $('#pm-end').value, active: $('#pm-active').checked ? 1 : 0,
    };
    try {
      await api(isNew ? '/api/promotions' : '/api/promotions/' + p.id, { method: isNew ? 'POST' : 'PUT', body });
      toast('Đã lưu khuyến mãi'); closeModal(); reload();
    } catch (e) { toast(e.message, true); }
  };
}
