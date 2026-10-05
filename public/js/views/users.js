import { $, esc, toast, modal, closeModal, statusBadge } from '../util.js';
import { api } from '../store.js';
import { icon } from '../icons.js';

let users = [];
let roles = [];

export default {
  id: 'users',
  label: 'Người dùng',
  icon: icon('user'),

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Người dùng</h1><div class="sub" id="u-count"></div></div>
  <button class="btn primary" id="u-new">+ Thêm người dùng</button></div>
<div class="tbl-wrap"><table class="grid"><thead><tr>
  <th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th>
</tr></thead><tbody id="u-body"></tbody></table></div>`;
    $('#u-new').onclick = () => openForm(null);
    $('#u-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const u = users.find((x) => x.id === Number(btn.closest('tr').dataset.id));
      if (btn.dataset.act === 'edit') openForm(u);
      if (btn.dataset.act === 'del' && confirm(`Khóa tài khoản "${u.username}"?`)) {
        api('/api/users/' + u.id, { method: 'DELETE' }).then(() => { toast('Đã khóa'); load(); }).catch((er) => toast(er.message, true));
      }
    });
  },

  async show() { await load(); },
};

async function load() {
  users = await api('/api/users');
  roles = await api('/api/roles');
  $('#u-count').textContent = `${users.length} người dùng`;
  $('#u-body').innerHTML = users.map((u) => `<tr data-id="${u.id}">
    <td><b>${esc(u.username)}</b></td><td>${esc(u.full_name || '')}</td>
    <td>${esc(u.role_name || u.role)}</td>
    <td>${u.active ? '<span class="badge paid">Hoạt động</span>' : '<span class="badge cancelled">Đã khóa</span>'}</td>
    <td class="muted">${esc(u.last_login || '—')}</td>
    <td class="r"><button class="btn sm" data-act="edit">Sửa</button>${u.active ? ' <button class="btn sm danger" data-act="del">Khóa</button>' : ''}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có người dùng</td></tr>';
}

function openForm(u) {
  const isNew = !u;
  const d = u || { role: 'cashier', active: 1 };
  modal(`<h2>${isNew ? 'Thêm' : 'Sửa'} người dùng</h2>
    <div class="form-grid">
      <label class="fld">Tài khoản *<input class="field" id="uf-user" value="${esc(d.username || '')}" ${isNew ? '' : 'disabled'} autocapitalize="none"></label>
      <label class="fld">Họ tên<input class="field" id="uf-name" value="${esc(d.full_name || '')}"></label>
      <label class="fld">Điện thoại<input class="field" id="uf-phone" value="${esc(d.phone || '')}"></label>
      <label class="fld">Vai trò<select class="field" id="uf-role">${roles.map((r) => `<option value="${r.code}" ${r.code === d.role ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label class="fld">${isNew ? 'Mật khẩu *' : 'Mật khẩu mới (để trống nếu không đổi)'}<input class="field" id="uf-pass" type="password" autocomplete="new-password"></label>
      <label class="fld">Mã PIN (đổi ca nhanh)<input class="field" id="uf-pin" inputmode="numeric"></label>
      ${isNew ? '' : `<label class="chk full"><input type="checkbox" id="uf-active" ${d.active ? 'checked' : ''}> Đang hoạt động</label>`}
    </div>
    <div class="modal-actions"><button class="btn primary" id="uf-save">Lưu</button><button class="btn" id="uf-close">Đóng</button></div>`);
  $('#uf-close').onclick = closeModal;
  $('#uf-save').onclick = async () => {
    const body = {
      username: $('#uf-user').value.trim(),
      full_name: $('#uf-name').value.trim(),
      phone: $('#uf-phone').value.trim(),
      role: $('#uf-role').value,
      password: $('#uf-pass').value || undefined,
      pin: $('#uf-pin').value || undefined,
    };
    if (!isNew) body.active = $('#uf-active').checked ? 1 : 0;
    try {
      await api(isNew ? '/api/users' : '/api/users/' + u.id, { method: isNew ? 'POST' : 'PUT', body });
      toast('Đã lưu'); closeModal(); load();
    } catch (e) { toast(e.message, true); }
  };
}
