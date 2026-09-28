import { $, esc, num, money, today, toast, modal, closeModal } from '../util.js';
import { api } from '../store.js';
import { isProd } from '../auth.js';

let tenants = [];
let plans = [];

export default {
  id: 'platform',
  label: 'Cửa hàng',
  icon: '🏢',

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Quản trị nền tảng</h1><div class="sub" id="pf-stats"></div></div>
  <button class="btn primary" id="pf-new">+ Thêm cửa hàng</button></div>
<div class="card" style="margin-bottom:14px"><h3>Báo cáo theo cửa hàng</h3>
  <div class="toolbar"><input type="date" class="field" id="pr-from"><input type="date" class="field" id="pr-to"><button class="btn primary" id="pr-view">Xem</button><span class="spacer"></span><span id="pr-total" class="muted"></span></div>
  <div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr>
    <th>Cửa hàng</th><th class="r">Số HĐ</th><th class="r">Doanh thu</th><th class="r">Lợi nhuận</th><th class="r">Sản phẩm</th><th class="r">Sắp hết</th><th>Trạng thái</th>
  </tr></thead><tbody id="pr-body"></tbody></table></div>
</div>
<div class="card" style="margin-bottom:14px"><h3>VietQR dùng chung (nền tảng)</h3>
  <p class="muted">Dùng khi nhiều shop chung một tài khoản VietQR. Shop để trống Username/Password sẽ dùng bộ này; mỗi shop vẫn tự nhập số tài khoản ngân hàng của mình.</p>
  <div class="form-grid">
    <label class="fld">Môi trường<select class="field" id="pv-env">${isProd() ? '<option value="prod">prod</option>' : '<option value="mock">mock</option><option value="dev">dev</option><option value="prod">prod</option>'}</select></label>
    <label class="fld">Username VietQR<input class="field" id="pv-user" autocapitalize="none"></label>
    <label class="fld full">Password VietQR (để trống nếu không đổi)<input class="field" id="pv-pass" type="password"></label>
  </div>
  <div class="toolbar"><button class="btn primary" id="pv-save">Lưu</button><span id="pv-status" class="muted"></span></div>
</div>
<div class="card" style="margin-bottom:14px"><h3>Báo cáo thống kê giao dịch (công khai)</h3>
  <p class="muted">Bật để có trang thống kê giao dịch thanh toán số cho ban điều hành, chia sẻ bằng <b>link bí mật</b> (không cần đăng nhập; chỉ hiển thị chỉ số giao dịch và mức tham gia, không có giá vốn/lợi nhuận). Đổi link bất cứ lúc nào để thu hồi quyền xem.</p>
  <label class="chk"><input type="checkbox" id="pp-enabled"> Bật báo cáo công khai</label>
  <div class="toolbar" style="margin-top:8px">
    <input class="field" id="pp-url" readonly placeholder="Chưa có liên kết" style="flex:1">
    <button class="btn" id="pp-copy">Sao chép</button>
    <button class="btn" id="pp-open">Mở</button>
    <button class="btn" id="pp-rotate">Đổi link</button>
    <button class="btn primary" id="pp-save">Lưu</button>
  </div>
  <div class="muted" id="pp-status" style="margin-top:6px"></div>
</div>
<div class="tbl-wrap"><table class="grid"><thead><tr>
  <th>Mã</th><th>Tên đối tác</th><th>Khu vực</th><th>Gói</th><th class="r">Người dùng</th><th>Hết hạn</th><th>Trạng thái</th><th></th>
</tr></thead><tbody id="pf-body"></tbody></table></div>`;
    $('#pf-new').onclick = () => openForm(null);
    $('#pr-view').onclick = loadReport;
    $('#pv-save').onclick = saveVqrConfig;
    $('#pp-save').onclick = savePublicReport;
    $('#pp-rotate').onclick = rotatePublicReport;
    $('#pp-open').onclick = () => { const u = $('#pp-url').value; if (u) window.open(u, '_blank', 'noopener'); };
    $('#pp-copy').onclick = copyPublicLink;
    $('#pf-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const t = tenants.find((x) => x.id === Number(btn.closest('tr').dataset.id));
      if (btn.dataset.act === 'edit') openForm(t);
      if (btn.dataset.act === 'users') openUsers(t);
      if (btn.dataset.act === 'toggle') {
        const status = t.status === 'active' ? 'suspended' : 'active';
        await api('/api/platform/tenants/' + t.id, { method: 'PUT', body: { ...t, status } });
        toast(status === 'active' ? 'Đã mở lại' : 'Đã tạm ngưng'); load();
      }
    });
  },

  async show() {
    if (!$('#pr-from').value) { $('#pr-from').value = today(); $('#pr-to').value = today(); }
    await load();
    loadReport();
    loadVqrConfig();
    loadPublicReport();
  },
};

const publicUrl = (u) => (u ? location.origin + u : '');

async function loadPublicReport() {
  try {
    const r = await api('/api/platform/public-report');
    $('#pp-enabled').checked = !!r.enabled;
    $('#pp-url').value = publicUrl(r.url);
    $('#pp-status').textContent = r.enabled ? 'Đang bật — ai có link đều xem được.' : 'Đang tắt.';
  } catch (e) { $('#pp-status').textContent = e.message; }
}

async function savePublicReport() {
  try {
    const r = await api('/api/platform/public-report', { method: 'PUT', body: { enabled: $('#pp-enabled').checked } });
    $('#pp-url').value = publicUrl(r.url);
    $('#pp-status').textContent = r.enabled ? 'Đang bật — ai có link đều xem được.' : 'Đang tắt.';
    toast(r.enabled ? 'Đã bật báo cáo công khai' : 'Đã tắt báo cáo công khai');
  } catch (e) { toast(e.message, true); }
}

async function rotatePublicReport() {
  if (!confirm('Đổi link? Link cũ sẽ ngừng hoạt động ngay.')) return;
  try {
    const r = await api('/api/platform/public-report/rotate', { method: 'POST' });
    $('#pp-url').value = publicUrl(r.url);
    $('#pp-status').textContent = 'Đã đổi link. Hãy chia sẻ link mới.';
    toast('Đã đổi link báo cáo');
  } catch (e) { toast(e.message, true); }
}

async function copyPublicLink() {
  const u = $('#pp-url').value;
  if (!u) return toast('Chưa có liên kết', true);
  try {
    await navigator.clipboard.writeText(u);
    toast('Đã sao chép liên kết');
  } catch {
    $('#pp-url').select();
    document.execCommand('copy');
    toast('Đã sao chép liên kết');
  }
}

async function loadVqrConfig() {
  try {
    const r = await api('/api/platform/vietqr');
    $('#pv-env').value = r.vqr_env || 'mock';
    $('#pv-user').value = r.vqr_username || '';
    $('#pv-pass').value = '';
    $('#pv-status').textContent = r.has_password ? 'Đã có mật khẩu (để trống nếu không đổi).' : 'Chưa có mật khẩu.';
  } catch (e) { $('#pv-status').textContent = e.message; }
}

async function saveVqrConfig() {
  try {
    const r = await api('/api/platform/vietqr', { method: 'PUT', body: { vqr_env: $('#pv-env').value, vqr_username: $('#pv-user').value, vqr_password: $('#pv-pass').value } });
    $('#pv-pass').value = '';
    $('#pv-status').textContent = 'Đã lưu. ' + (r.has_password ? 'Có mật khẩu.' : 'Chưa có mật khẩu.');
    toast('Đã lưu VietQR dùng chung');
  } catch (e) { toast(e.message, true); }
}

async function loadReport() {
  const from = $('#pr-from').value || today();
  const to = $('#pr-to').value || from;
  try {
    const r = await api(`/api/platform/reports?from=${from}&to=${to}`);
    $('#pr-total').textContent = `Tổng: ${num(r.totals.invoices)} hóa đơn · ${money(r.totals.revenue)}`;
    $('#pr-body').innerHTML = r.rows.map((t) => `<tr>
      <td>${esc(t.name)}<span class="sub">${esc(t.code)}</span></td>
      <td class="r">${num(t.invoices || 0)}</td>
      <td class="r"><b>${money(t.revenue || 0)}</b></td>
      <td class="r">${money(t.profit || 0)}</td>
      <td class="r">${num(t.products || 0)}</td>
      <td class="r ${t.low_stock ? 'low' : ''}">${num(t.low_stock || 0)}</td>
      <td>${t.status === 'active' ? '<span class="badge paid">Hoạt động</span>' : '<span class="badge cancelled">Tạm ngưng</span>'}</td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">Chưa có cửa hàng</td></tr>';
  } catch (e) { $('#pr-body').innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`; }
}

const expired = (t) => t.expires_at && t.expires_at < new Date().toISOString().slice(0, 19).replace('T', ' ');

async function load() {
  [tenants, plans] = await Promise.all([api('/api/platform/tenants'), api('/api/platform/plans')]);
  const stats = await api('/api/platform/stats');
  $('#pf-stats').textContent = `${stats.tenants} cửa hàng · ${stats.users} người dùng · ${plans.length} gói`;
  $('#pf-body').innerHTML = tenants.map((t) => `<tr data-id="${t.id}">
    <td><code>${esc(t.code)}</code></td><td><b>${esc(t.name)}</b></td>
    <td>${t.area ? esc(t.area) : '<span class="muted">Ngoài khu vực</span>'}</td>
    <td>${esc(plans.find((p) => p.code === t.plan)?.name || t.plan)}</td>
    <td class="r">${t.user_count}</td>
    <td class="${expired(t) ? 'low' : 'muted'}">${t.expires_at ? esc(t.expires_at.slice(0, 10)) : '—'}</td>
    <td>${t.status === 'active' ? '<span class="badge paid">Hoạt động</span>' : '<span class="badge cancelled">Tạm ngưng</span>'}</td>
    <td class="r"><button class="btn sm" data-act="users">Người dùng</button>
      <button class="btn sm" data-act="edit">Sửa</button>
      <button class="btn sm" data-act="toggle">${t.status === 'active' ? 'Tạm ngưng' : 'Mở lại'}</button></td>
  </tr>`).join('') || '<tr><td colspan="8" class="empty">Chưa có đối tác</td></tr>';
}

const planOptions = (sel) => plans.map((p) => `<option value="${p.code}" ${p.code === sel ? 'selected' : ''}>${esc(p.name)} · ${p.max_users} user · ${p.max_products} SP</option>`).join('');

function openForm(t) {
  const isNew = !t;
  const d = t || { plan: 'standard' };
  modal(`<h2>${isNew ? 'Thêm cửa hàng' : 'Sửa cửa hàng: ' + esc(d.name)}</h2>
    <div class="form-grid">
      ${isNew ? `
        <label class="fld">Mã cửa hàng *<input class="field" id="tf-code" placeholder="vd: taphoa-an" autocapitalize="none"></label>
        <label class="fld">Tài khoản chủ *<input class="field" id="tf-owner" autocapitalize="none"></label>
        <label class="fld">Mật khẩu chủ *<input class="field" id="tf-pass" type="password"></label>
        <label class="fld">Tên chủ cửa hàng<input class="field" id="tf-owner-name"></label>` : ''}
      <label class="fld">Tên đối tác *<input class="field" id="tf-name" value="${esc(d.name || '')}"></label>
      <label class="fld">Khu vực<input class="field" id="tf-area" placeholder="VD: Thôn A (để trống = ngoài khu vực)" value="${esc(d.area || '')}"></label>
      <label class="fld">Gói dịch vụ<select class="field" id="tf-plan">${planOptions(d.plan)}</select></label>
      <label class="fld">Hết hạn (để trống = không giới hạn)<input class="field" id="tf-exp" type="date" value="${d.expires_at ? esc(d.expires_at.slice(0, 10)) : ''}"></label>
      ${isNew ? '' : '<label class="fld">Trạng thái<select class="field" id="tf-status"><option value="active" ' + (d.status === 'active' ? 'selected' : '') + '>Hoạt động</option><option value="suspended" ' + (d.status !== 'active' ? 'selected' : '') + '>Tạm ngưng</option></select></label>'}
    </div>
    <p class="muted">Mã cửa hàng chỉ gồm a-z, 0-9, gạch dưới, gạch ngang.</p>
    <div class="modal-actions"><button class="btn primary" id="tf-save">Lưu</button><button class="btn" id="tf-close">Đóng</button></div>`);
  $('#tf-close').onclick = closeModal;
  $('#tf-save').onclick = async () => {
    const body = {
      name: $('#tf-name').value.trim(), area: $('#tf-area').value.trim(), plan: $('#tf-plan').value,
      expires_at: $('#tf-exp').value || null,
    };
    if (isNew) Object.assign(body, {
      code: $('#tf-code').value.trim(), owner_username: $('#tf-owner').value.trim(),
      owner_password: $('#tf-pass').value, owner_name: $('#tf-owner-name').value.trim(),
    });
    else body.status = $('#tf-status').value;
    try {
      await api(isNew ? '/api/platform/tenants' : '/api/platform/tenants/' + t.id, { method: isNew ? 'POST' : 'PUT', body });
      toast('Đã lưu'); closeModal(); load();
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