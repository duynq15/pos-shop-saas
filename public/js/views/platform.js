import { $, esc, num, money, today, toast, modal, closeModal, confirmDialog } from '../util.js';
import { api } from '../store.js';
import { isProd } from '../auth.js';

let tenants = [];
let plans = [];
let communities = [];
let communityTypes = [];

// Nhãn theo loại tenant (GĐ1.5). Loại cộng đồng lấy từ /community-types (GĐ1.6)
const KIND_LABEL = { shop: 'Cửa hàng', seller: 'Người bán', community: 'Sổ quỹ cộng đồng' };
const statusBadge = (s) => (s === 'active' ? '<span class="badge paid">Hoạt động</span>' : '<span class="badge cancelled">Tạm ngưng</span>');
const communityName = (id) => communities.find((c) => c.id === id)?.name || '';

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
<div class="card" style="margin-bottom:14px" id="ct-card"><div class="toolbar"><h3 style="margin:0">Loại cộng đồng</h3><span class="spacer"></span><button class="btn primary" id="ct-new">+ Thêm loại</button></div>
  <p class="muted">Thôn, giáo xứ, chợ… Nhãn vai trò duyệt chi và ban lãnh đạo hiển thị theo loại; quyền không đổi. Tạm ngưng loại thì không tạo được cộng đồng mới của loại đó.</p>
  <div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr>
    <th>Mã</th><th>Tên</th><th>Người duyệt chi</th><th>Ban lãnh đạo</th><th class="r">Số cộng đồng</th><th>Trạng thái</th><th></th>
  </tr></thead><tbody id="ct-body"></tbody></table></div>
</div>
<div class="card" style="margin-bottom:14px" id="pc-card"><div class="toolbar"><h3 style="margin:0">Cộng đồng</h3><span class="spacer"></span><button class="btn primary" id="pc-new">+ Thêm cộng đồng</button></div>
  <p class="muted">Cộng đồng (thôn, tổ dân phố, giáo xứ, chợ…) gom người bán và sổ quỹ. Gán cửa hàng vào cộng đồng ở form Sửa cửa hàng. Tài khoản thủ quỹ, người duyệt chi, ban lãnh đạo (nhãn theo loại cộng đồng) do chủ tenant sổ quỹ tạo trong màn Người dùng.</p>
  <div class="tbl-wrap" style="box-shadow:none"><table class="grid"><thead><tr>
    <th>Mã</th><th>Tên</th><th>Loại</th><th>Địa bàn</th><th class="r">Số tenant</th><th>Trạng thái</th><th></th>
  </tr></thead><tbody id="pc-body"></tbody></table></div>
</div>
<div class="tbl-wrap"><table class="grid"><thead><tr>
  <th>Mã</th><th>Tên đối tác</th><th>Loại</th><th>Cộng đồng</th><th>Khu vực</th><th>Gói</th><th class="r">Người dùng</th><th>Hết hạn</th><th>Trạng thái</th><th></th>
</tr></thead><tbody id="pf-body"></tbody></table></div>`;
    $('#pf-new').onclick = () => openForm(null);
    $('#pr-view').onclick = loadReport;
    $('#pv-save').onclick = saveVqrConfig;
    $('#pp-save').onclick = savePublicReport;
    $('#pp-rotate').onclick = rotatePublicReport;
    $('#pp-open').onclick = () => { const u = $('#pp-url').value; if (u) window.open(u, '_blank', 'noopener'); };
    $('#pp-copy').onclick = copyPublicLink;
    $('#pc-new').onclick = () => openCommunity(null);
    $('#ct-new').onclick = () => openType(null);
    $('#ct-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const t = communityTypes.find((x) => x.id === Number(btn.closest('tr').dataset.id));
      if (btn.dataset.act === 'edit') return openType(t);
      try {
        if (btn.dataset.act === 'toggle') await api('/api/platform/community-types/' + t.id, { method: 'PUT', body: { status: t.status === 'active' ? 'suspended' : 'active' } });
        if (btn.dataset.act === 'del') {
          if (!(await confirmDialog(`Xóa loại "${t.name}"?`))) return;
          await api('/api/platform/community-types/' + t.id, { method: 'DELETE' });
        }
        toast('Đã lưu'); load();
      } catch (err) { toast(err.message, true); }
    });
    $('#pc-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const c = communities.find((x) => x.id === Number(btn.closest('tr').dataset.id));
      if (btn.dataset.act === 'edit') openCommunity(c);
      if (btn.dataset.act === 'members') openMembers(c);
      if (btn.dataset.act === 'del') {
        if (!(await confirmDialog(`Xóa cộng đồng "${c.name}"?`))) return;
        try { await api('/api/platform/communities/' + c.id, { method: 'DELETE' }); toast('Đã xóa'); load(); } catch (err) { toast(err.message, true); }
      }
      if (btn.dataset.act === 'toggle') {
        const status = c.status === 'active' ? 'suspended' : 'active';
        try {
          await api('/api/platform/communities/' + c.id, { method: 'PUT', body: { status } });
          toast(status === 'active' ? 'Đã mở lại' : 'Đã tạm ngưng'); load();
        } catch (err) { toast(err.message, true); }
      }
    });
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
  [tenants, plans, communities, communityTypes] = await Promise.all([api('/api/platform/tenants'), api('/api/platform/plans'), api('/api/platform/communities'), api('/api/platform/community-types')]);
  const stats = await api('/api/platform/stats');
  $('#pf-stats').textContent = `${stats.tenants} cửa hàng · ${stats.users} người dùng · ${plans.length} gói`;
  $('#pf-body').innerHTML = tenants.map((t) => `<tr data-id="${t.id}">
    <td><code>${esc(t.code)}</code></td><td><b>${esc(t.name)}</b></td>
    <td>${esc(KIND_LABEL[t.kind || 'shop'] || t.kind)}</td>
    <td>${t.community_id ? esc(communityName(t.community_id)) : '<span class="muted">—</span>'}</td>
    <td>${t.area ? esc(t.area) : '<span class="muted">Ngoài khu vực</span>'}</td>
    <td>${esc(plans.find((p) => p.code === t.plan)?.name || t.plan)}</td>
    <td class="r">${t.user_count}</td>
    <td class="${expired(t) ? 'low' : 'muted'}">${t.expires_at ? esc(t.expires_at.slice(0, 10)) : '—'}</td>
    <td>${t.status === 'active' ? '<span class="badge paid">Hoạt động</span>' : '<span class="badge cancelled">Tạm ngưng</span>'}</td>
    <td class="r"><button class="btn sm" data-act="users">Người dùng</button>
      <button class="btn sm" data-act="edit">Sửa</button>
      <button class="btn sm" data-act="toggle">${t.status === 'active' ? 'Tạm ngưng' : 'Mở lại'}</button></td>
  </tr>`).join('') || '<tr><td colspan="10" class="empty">Chưa có đối tác</td></tr>';
  $('#pc-body').innerHTML = communities.map((c) => `<tr data-id="${c.id}">
    <td><code>${esc(c.code)}</code></td><td><b>${esc(c.name)}</b></td>
    <td>${esc(c.type_name || c.type)}</td>
    <td>${c.area ? esc(c.area) : '<span class="muted">—</span>'}</td>
    <td class="r">${num(c.tenant_count)}</td>
    <td>${statusBadge(c.status)}</td>
    <td class="r"><button class="btn sm" data-act="members">Thành viên</button>
      <button class="btn sm" data-act="edit">Sửa</button>
      <button class="btn sm" data-act="toggle">${c.status === 'active' ? 'Tạm ngưng' : 'Mở lại'}</button>
      <button class="btn sm" data-act="del">Xóa</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có cộng đồng</td></tr>';
  $('#ct-body').innerHTML = communityTypes.map((t) => `<tr data-id="${t.id}">
    <td><code>${esc(t.code)}</code></td><td><b>${esc(t.name)}</b></td>
    <td>${esc(t.approver_label)}</td><td>${esc(t.leader_label)}</td>
    <td class="r">${num(t.community_count)}</td>
    <td>${statusBadge(t.status)}</td>
    <td class="r"><button class="btn sm" data-act="edit">Sửa</button>
      <button class="btn sm" data-act="toggle">${t.status === 'active' ? 'Tạm ngưng' : 'Mở lại'}</button>
      <button class="btn sm" data-act="del">Xóa</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có loại cộng đồng</td></tr>';
}

function openType(t) {
  const isNew = !t;
  const d = t || { sort_order: 0 };
  modal(`<h2>${isNew ? 'Thêm loại cộng đồng' : 'Sửa loại: ' + esc(d.name)}</h2>
    <div class="form-grid">
      ${isNew ? '<label class="fld">Mã loại *<input class="field" id="ctf-code" placeholder="vd: giao-xu" autocapitalize="none"></label>' : ''}
      <label class="fld">Tên *<input class="field" id="ctf-name" placeholder="vd: Giáo xứ" value="${esc(d.name || '')}"></label>
      <label class="fld">Nhãn người duyệt chi<input class="field" id="ctf-approver" placeholder="vd: Cha xứ" value="${esc(d.approver_label || '')}"></label>
      <label class="fld">Nhãn ban lãnh đạo<input class="field" id="ctf-leader" placeholder="vd: Hội đồng giáo xứ" value="${esc(d.leader_label || '')}"></label>
      <label class="fld">Thứ tự<input class="field" id="ctf-sort" type="number" value="${Number(d.sort_order) || 0}"></label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="ctf-save">Lưu</button><button class="btn" id="ctf-close">Đóng</button></div>`);
  $('#ctf-close').onclick = closeModal;
  $('#ctf-save').onclick = async () => {
    const body = { name: $('#ctf-name').value.trim(), approver_label: $('#ctf-approver').value.trim(), leader_label: $('#ctf-leader').value.trim(), sort_order: Number($('#ctf-sort').value) || 0 };
    if (isNew) body.code = $('#ctf-code').value.trim();
    try {
      await api(isNew ? '/api/platform/community-types' : '/api/platform/community-types/' + t.id, { method: isNew ? 'POST' : 'PUT', body });
      toast('Đã lưu'); closeModal(); load();
    } catch (e) { toast(e.message, true); }
  };
}

async function openMembers(c) {
  let rows;
  try { rows = await api('/api/platform/communities/' + c.id + '/tenants'); } catch (e) { return toast(e.message, true); }
  modal(`<h2>Thành viên – ${esc(c.name)}</h2>
    <div class="scroll-x"><table class="line-items"><thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody id="cm-body">${rows.map((t) => `<tr data-id="${t.id}"><td><code>${esc(t.code)}</code></td><td>${esc(t.name)}</td>
      <td>${esc(KIND_LABEL[t.kind] || t.kind)}</td><td>${statusBadge(t.status)}</td>
      <td class="r">${t.kind === 'shop' ? '<button class="btn sm" data-act="remove">Gỡ</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có thành viên</td></tr>'}</tbody></table></div>
    <p class="muted">Chỉ gỡ được cửa hàng thường. Người bán và sổ quỹ bắt buộc thuộc cộng đồng: đổi cộng đồng ở form Sửa cửa hàng.</p>
    <div class="modal-actions"><button class="btn" id="cm-close">Đóng</button></div>`);
  $('#cm-close').onclick = closeModal;
  $('#cm-body').onclick = async (e) => {
    const btn = e.target.closest('[data-act="remove"]'); if (!btn) return;
    try {
      await api('/api/platform/communities/' + c.id + '/remove-tenant', { method: 'POST', body: { tenant_id: Number(btn.closest('tr').dataset.id) } });
      toast('Đã gỡ'); await load(); openMembers(communities.find((x) => x.id === c.id) || c);
    } catch (err) { toast(err.message, true); }
  };
}

function openCommunity(c) {
  const isNew = !c;
  const d = c || { type: communityTypes.find((t) => t.status === 'active')?.code, settings: {} };
  const st = d.settings || {};
  // Loại tạm ngưng không chọn được cho cộng đồng mới; giữ loại hiện tại khi sửa
  const typeOpts = communityTypes.filter((t) => t.status === 'active' || t.code === d.type)
    .map((t) => `<option value="${esc(t.code)}" ${t.code === d.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  modal(`<h2>${isNew ? 'Thêm cộng đồng' : 'Sửa cộng đồng: ' + esc(d.name)}</h2>
    <div class="form-grid">
      ${isNew ? '<label class="fld">Mã cộng đồng *<input class="field" id="cf-code" placeholder="vd: thon-a" autocapitalize="none"></label>' : ''}
      <label class="fld">Loại<select class="field" id="cf-type">${typeOpts}</select></label>
      <label class="fld">Tên *<input class="field" id="cf-name" value="${esc(d.name || '')}"></label>
      <label class="fld">Địa bàn<input class="field" id="cf-area" value="${esc(d.area || '')}"></label>
      <label class="fld">Người liên hệ<input class="field" id="cf-contact" value="${esc(d.contact_name || '')}"></label>
      <label class="fld">Điện thoại liên hệ<input class="field" id="cf-phone" type="tel" value="${esc(d.contact_phone || '')}"></label>
      <label class="fld full">Ghi chú<input class="field" id="cf-note" value="${esc(d.note || '')}"></label>
      <label class="fld">Cảnh báo giao dịch chưa phân loại sau (ngày)<input class="field" id="cf-alert-days" type="number" min="1" max="90" value="${Number(st.unclassified_alert_days) || 3}"></label>
      <label class="chk"><input type="checkbox" id="cf-public" ${st.public_donations ? 'checked' : ''}> Công khai danh sách công đức</label>
    </div>
    ${isNew ? '' : '<p class="muted">Chỉ đổi loại được khi cộng đồng chưa có cửa hàng / người bán.</p>'}
    <div class="modal-actions"><button class="btn primary" id="cf-save">Lưu</button><button class="btn" id="cf-close">Đóng</button></div>`);
  $('#cf-close').onclick = closeModal;
  $('#cf-save').onclick = async () => {
    const body = {
      name: $('#cf-name').value.trim(), area: $('#cf-area').value.trim(), type: $('#cf-type').value,
      contact_name: $('#cf-contact').value.trim(), contact_phone: $('#cf-phone').value.trim(), note: $('#cf-note').value.trim(),
      settings: { public_donations: $('#cf-public').checked, unclassified_alert_days: Number($('#cf-alert-days').value) },
    };
    if (isNew) body.code = $('#cf-code').value.trim();
    else if (body.type === c.type) delete body.type;
    try {
      await api(isNew ? '/api/platform/communities' : '/api/platform/communities/' + c.id, { method: isNew ? 'POST' : 'PUT', body });
      toast('Đã lưu'); closeModal(); load();
    } catch (e) { toast(e.message, true); }
  };
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
      <label class="fld">Loại<select class="field" id="tf-kind">${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${k === (d.kind || 'shop') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="fld">Cộng đồng<select class="field" id="tf-community"><option value="">— Không thuộc cộng đồng —</option>${communities.map((c) => `<option value="${c.id}" ${c.id === d.community_id ? 'selected' : ''}>${esc(c.name)} (${esc(c.code)})</option>`).join('')}</select></label>
      <label class="fld">Gói dịch vụ<select class="field" id="tf-plan">${planOptions(d.plan)}</select></label>
      <label class="fld">Hết hạn (để trống = không giới hạn)<input class="field" id="tf-exp" type="date" value="${d.expires_at ? esc(d.expires_at.slice(0, 10)) : ''}"></label>
      ${isNew ? '' : '<label class="fld">Trạng thái<select class="field" id="tf-status"><option value="active" ' + (d.status === 'active' ? 'selected' : '') + '>Hoạt động</option><option value="suspended" ' + (d.status !== 'active' ? 'selected' : '') + '>Tạm ngưng</option></select></label>'}
    </div>
    <p class="muted">Người bán và sổ quỹ cộng đồng phải thuộc một cộng đồng, và phải dùng tài khoản nhận tiền riêng (BR-02). Mã cửa hàng chỉ gồm a-z, 0-9, gạch dưới, gạch ngang.</p>
    <div class="modal-actions"><button class="btn primary" id="tf-save">Lưu</button><button class="btn" id="tf-close">Đóng</button></div>`);
  $('#tf-close').onclick = closeModal;
  $('#tf-save').onclick = async () => {
    const body = {
      name: $('#tf-name').value.trim(), area: $('#tf-area').value.trim(), plan: $('#tf-plan').value,
      expires_at: $('#tf-exp').value || null,
      kind: $('#tf-kind').value, community_id: $('#tf-community').value ? Number($('#tf-community').value) : null,
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
      <tbody>${rows.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.full_name || '')}</td><td>${esc(u.role_name || u.role)}</td>
      <td>${u.active ? 'Hoạt động' : 'Đã khóa'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có</td></tr>'}</tbody></table></div>
    <div class="modal-actions"><button class="btn" id="pu-close">Đóng</button></div>`);
  $('#pu-close').onclick = closeModal;
}