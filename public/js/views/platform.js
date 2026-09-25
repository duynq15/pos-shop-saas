import { $, esc, toast, modal, closeModal } from '../util.js';
import { api } from '../store.js';

let tenants = [];

export default {
  id: 'platform',
  label: 'Cửa hàng',
  icon: '🏢',

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Quản trị nền tảng</h1><div class="sub" id="pf-stats"></div></div>
  <button class="btn primary" id="pf-new">+ Thêm cửa hàng</button></div>
<div class="tbl-wrap"><table class="grid"><thead><tr>
  <th>Mã</th><th>Tên cửa hàng</th><th>Gói</th><th class="r">Người dùng</th><th>Trạng thái</th><th></th>
</tr></thead><tbody id="pf-body"></tbody></table></div>`;
    $('#pf-new').onclick = openForm;
    $('#pf-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const t = tenants.find((x) => x.id === Number(btn.closest('tr').dataset.id));
      if (btn.dataset.act === 'toggle') {
        const status = t.status === 'active' ? 'suspended' : 'active';
        await api('/api/platform/tenants/' + t.id, { method: 'PUT', body: { ...t, status } });
        toast(status === 'active' ? 'Đã mở lại' : 'Đã tạm ngưng'); load();
      }
      if (btn.dataset.act === 'users') openUsers(t);
    });
  },

  async show() { await load(); },
};

async function load() {
  tenants = await api('/api/platform/tenants');
  const stats = await api('/api/platform/stats');
  $('#pf-stats').textContent = `${stats.tenants} cửa hàng · ${stats.users} người dùng`;
  $('#pf-body').innerHTML = tenants.map((t) => `<tr data-id="${t.id}">
    <td><code>${esc(t.code)}</code></td><td><b>${esc(t.name)}</b></td><td>${esc(t.plan)}</td>
    <td class="r">${t.user_count}</td>
    <td>${t.status === 'active' ? '<span class="badge paid">Hoạt động</span>' : '<span class="badge cancelled">Tạm ngưng</span>'}</td>
    <td class="r"><button class="btn sm" data-act="users">Người dùng</button>
      <button class="btn sm" data-act="toggle">${t.status === 'active' ? 'Tạm ngưng' : 'Mở lại'}</button></td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có cửa hàng</td></tr>';
}

function openForm() {
  modal(`<h2>Thêm cửa hàng</h2>
    <div class="form-grid">
      <label class="fld">Mã cửa hàng *<input class="field" id="tf-code" placeholder="vd: taphoa-an" autocapitalize="none"></label>
      <label class="fld">Tên cửa hàng *<input class="field" id="tf-name"></label>
      <label class="fld">Gói<input class="field" id="tf-plan" value="standard"></label>
      <label class="fld">Tài khoản chủ *<input class="field" id="tf-owner" autocapitalize="none"></label>
      <label class="fld">Mật khẩu chủ *<input class="field" id="tf-pass" type="password"></label>
      <label class="fld">Tên chủ cửa hàng<input class="field" id="tf-owner-name"></label>
    </div>
    <p class="muted">Mã cửa hàng chỉ gồm a-z, 0-9, gạch dưới, gạch ngang.</p>
    <div class="modal-actions"><button class="btn primary" id="tf-save">Tạo cửa hàng</button><button class="btn" id="tf-close">Đóng</button></div>`);
  $('#tf-close').onclick = closeModal;
  $('#tf-save').onclick = async () => {
    try {
      await api('/api/platform/tenants', { method: 'POST', body: {
        code: $('#tf-code').value.trim(), name: $('#tf-name').value.trim(), plan: $('#tf-plan').value.trim(),
        owner_username: $('#tf-owner').value.trim(), owner_password: $('#tf-pass').value, owner_name: $('#tf-owner-name').value.trim(),
      } });
      toast('Đã tạo cửa hàng'); closeModal(); load();
    } catch (e) { toast(e.message, true); }
  };
}

async function openUsers(t) {
  const rows = await api('/api/platform/users?tenant_id=' + t.id);
  modal(`<h2>Người dùng – ${esc(t.name)}</h2>
    <div class="scroll-x"><table class="line-items"><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th></tr></thead>
      <tbody>${rows.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.full_name || '')}</td><td>${esc(u.role)}</td>
      <td>${u.active ? 'Hoạt động' : 'Đã khóa'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có</td></tr>'}</tbody></table></div>
    <div class="modal-actions"><button class="btn" id="pu-close">Đóng</button></div>`);
  $('#pu-close').onclick = closeModal;
}
