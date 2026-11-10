import { $, $$, esc, toast, modal, closeModal, setCurrency, fmtDT, bankField, bankOf } from '../util.js';
import { api, state, loadSettings, loadPriceLists } from '../store.js';
import { showLanInfo } from './lan.js';
import { isProd, auth } from '../auth.js';
import { icon } from '../icons.js';

export default {
  id: 'settings',
  label: 'Cài đặt',
  icon: icon('settings'),

  mount(el) {
    el.innerHTML = auth.tenant?.kind === 'community' ? FUND_SETTINGS : `
<div class="view-head"><div><h1>Cài đặt</h1><div class="sub">Thông tin cửa hàng, thanh toán, in ấn và kết nối</div></div>
  <button class="btn primary" id="btn-save-settings">Lưu cài đặt</button></div>
<div class="grid2">
  <div class="card">
    <h3>Thông tin cửa hàng</h3>
    <label class="fld">Tên cửa hàng<input class="field" data-s="shop_name"></label>
    <label class="fld">Địa chỉ<input class="field" data-s="shop_address"></label>
    <div class="form-grid">
      <label class="fld">Điện thoại<input class="field" data-s="shop_phone"></label>
      <label class="fld">Mã số thuế<input class="field" data-s="shop_tax_code"></label>
      <label class="fld">Tiền tố hóa đơn<input class="field" data-s="invoice_prefix"></label>
      <label class="fld">Tiền tố trả hàng<input class="field" data-s="return_prefix"></label>
      <label class="fld">Tiền tố nhập hàng<input class="field" data-s="purchase_prefix"></label>
      <label class="fld">Tiền tố kiểm kho<input class="field" data-s="stockcheck_prefix"></label>
    </div>
    <label class="fld">Lời cảm ơn cuối hóa đơn<input class="field" data-s="invoice_footer"></label>
  </div>

  <div class="card">
    <h3>Tài khoản nhận chuyển khoản (VietQR)</h3>
    <label class="fld">Ngân hàng<span id="bank-slot"></span></label>
    <div class="form-grid">
      <label class="fld">Số tài khoản<input class="field" data-s="bank_account" placeholder="VD: 0123456789"></label>
      <label class="fld">Chủ tài khoản<input class="field" data-s="account_holder" placeholder="NGUYEN VAN A"></label>
    </div>
    <div class="toolbar" style="margin-top:6px"><button class="btn" id="btn-test-qr">Thử mã QR</button></div>
    <div id="qr-test"></div>
  </div>

  <div class="card">
    <h3>VietQR động (thanh toán tự động)</h3>
    <p class="muted">Bật để tạo QR động và tự xác nhận khi khách chuyển khoản. Môi trường <b>mock</b> để thử không cần tài khoản VietQR.</p>
    <label class="chk"><input type="checkbox" data-s="vqr_enabled"> Bật VietQR động</label>
    <div class="form-grid" style="margin-top:10px">
      <label class="fld">Môi trường<select class="field" data-s="vqr_env">${isProd() ? '<option value="prod">prod (thật)</option>' : '<option value="mock">mock (thử)</option><option value="dev">dev (sandbox)</option><option value="prod">prod (thật)</option>'}</select></label>
      <label class="fld">Mã ngân hàng (VietQR)<input class="field" data-s="vqr_bank_code" placeholder="MB / BIDV"></label>
      <label class="fld">Terminal code<input class="field" data-s="vqr_terminal_code"></label>
      <label class="fld">Username VietQR<input class="field" data-s="vqr_username" autocapitalize="none"></label>
      <label class="fld">Password VietQR<input class="field" data-s="vqr_password" type="password"></label>
      <label class="fld">Basic user (cấp cho VietQR)<input class="field" data-s="vqr_exposed_username" autocapitalize="none"></label>
      <label class="fld">Basic pass (cấp cho VietQR)<input class="field" data-s="vqr_exposed_password" type="password"></label>
    </div>
    <p class="muted">Để trống <b>Username/Password VietQR</b> để dùng tài khoản VietQR dùng chung của nền tảng. Mỗi shop chỉ cần nhập <b>Số tài khoản ngân hàng</b> của mình.</p>
    <p class="muted">Webhook cho VietQR: <code>/vqr/api/token_generate</code> · <code>/vqr/bank/api/transaction-sync</code></p>
    <div class="toolbar" style="margin-top:8px"><button class="btn" id="btn-vqr-test" type="button">Kiểm tra kết nối</button></div>
    <div id="vqr-test-result"></div>
  </div>

  <div class="card">
    <h3>Bán hàng &amp; kho</h3>
    <div class="form-grid">
      <label class="fld">Bảng giá mặc định<select class="field" data-s="default_price_list_id" id="pl-select"></select></label>
      <label class="fld">Đơn vị tiền tệ<input class="field" data-s="currency"></label>
      <label class="fld">Cách tính giá &amp; VAT<select class="field" data-s="vat_mode"><option value="inclusive">Giá đã gồm VAT</option><option value="exclusive">Giá chưa gồm VAT</option></select></label>
      <label class="fld">Thuế VAT mặc định (%)<input class="field" type="number" min="0" max="100" data-s="vat_default_rate"></label>
    </div>
    <label class="chk" style="margin-bottom:10px"><input type="checkbox" data-s="allow_negative_stock"> Cho phép bán âm kho</label>
    <label class="chk" style="margin-bottom:10px"><input type="checkbox" data-s="low_stock_alert"> Cảnh báo sắp hết hàng</label>
    <label class="chk"><input type="checkbox" data-s="print_after_pay"> Tự mở hộp thoại in sau khi thanh toán</label>
    <label class="chk"><input type="checkbox" data-s="online_lookup"> Tra cứu thông tin sản phẩm online theo mã vạch (cần internet)</label>
    <label class="fld" style="margin-top:10px">Dịch vụ tra cứu tùy chọn (dùng <code>{code}</code>, để trống = Open Food Facts)
      <input class="field" data-s="lookup_url" placeholder="https://world.openfoodfacts.org/api/v2/product/{code}.json">
    </label>
  </div>

  <div class="card">
    <h3>In tem nhãn</h3>
    <div class="form-grid">
      <label class="fld">Khổ tem rộng (mm)<input class="field" type="number" data-s="label_width" min="20"></label>
      <label class="fld">Khổ tem cao (mm)<input class="field" type="number" data-s="label_height" min="15"></label>
    </div>
    <label class="chk" style="margin-bottom:8px"><input type="checkbox" data-s="label_show_shop"> In tên cửa hàng</label><br>
    <label class="chk" style="margin-bottom:8px"><input type="checkbox" data-s="label_show_name"> In tên sản phẩm</label><br>
    <label class="chk" style="margin-bottom:8px"><input type="checkbox" data-s="label_show_price"> In giá bán</label><br>
    <label class="chk"><input type="checkbox" data-s="label_show_barcode"> In mã vạch</label>
  </div>

  <div class="card">
    <h3>Kết nối thiết bị khác (LAN)</h3>
    <p class="muted">Điện thoại/máy tính bảng trong cùng Wi-Fi truy cập phần mềm qua địa chỉ máy chủ.</p>
    <button class="btn" id="btn-lan-settings">Xem địa chỉ &amp; mã QR</button>
  </div>

  <div class="card">
    <h3>Dữ liệu &amp; sao lưu</h3>
    <p class="muted">Phần mềm tự sao lưu định kỳ vào <code>data/backups/</code>. Dữ liệu gốc: <code>data/pos.db</code>.</p>
    <label class="chk"><input type="checkbox" data-s="backup_enabled"> Tự động sao lưu</label>
    <label class="fld" style="margin-top:10px">Số bản giữ lại<input class="field" type="number" min="1" data-s="backup_keep"></label>
    <div class="toolbar">
      <button class="btn primary" id="btn-backup-now" type="button">Sao lưu ngay</button>
      <button class="btn" data-export="inventory">Xuất tồn kho (Excel)</button>
      <button class="btn" data-export="sales">Xuất hóa đơn (Excel)</button>
    </div>
    <div id="backup-list" class="scroll-x" style="margin-top:8px"></div>
  </div>
</div>`;

    $('#btn-save-settings').onclick = save;
    $('#btn-backup-now').onclick = async () => {
      try { const b = await api('/api/backup/now', { method: 'POST' }); toast('Đã sao lưu ' + b.name); renderBackups(); }
      catch (e) { toast(e.message, true); }
    };
    $('#backup-list').addEventListener('click', onBackupClick);
    if (auth.tenant?.kind === 'community') return;
    $('#btn-test-qr').onclick = testQR;
    $('#btn-lan-settings').onclick = showLanInfo;
    $('#btn-vqr-test').onclick = async () => {
      const el = $('#vqr-test-result');
      el.innerHTML = '<div class="hint">Đang kiểm tra…</div>';
      try {
        const r = await api('/api/vietqr/test', { method: 'POST' });
        el.innerHTML = `<div class="hint">Môi trường: <b>${esc(r.env)}</b> · Token: <b>${r.token_ok ? 'OK' : 'lỗi'}</b> · QR: <b>${r.qr_ok ? 'OK' : 'lỗi'}</b><br>${esc(r.message || '')}</div>`;
      } catch (e) { el.innerHTML = `<div class="low">${esc(e.message)}</div>`; }
    };
    el.addEventListener('click', (e) => {
      const ex = e.target.closest('[data-export]');
      if (ex) window.location.href = `/api/reports/export?type=${ex.dataset.export}&from=2000-01-01&to=2999-12-31`;
    });
  },

  async show() {
    const fund = auth.tenant?.kind === 'community';
    await Promise.all([loadSettings(), fund || loadPriceLists()]);
    if (!fund) {
      $('#bank-slot').innerHTML = bankField('bank-select', state.settings.bank_bin, state.settings.bank_name);
      $('#pl-select').innerHTML = state.priceLists.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    }
    for (const el of $$('[data-s]')) {
      if (el.type === 'checkbox') el.checked = state.settings[el.dataset.s] === '1';
      else el.value = state.settings[el.dataset.s] ?? '';
    }
    $('#qr-test').innerHTML = '';
    renderBackups();
  },
};

// Sổ quỹ thôn chỉ cần: thông tin thôn, danh sách loại quỹ, xóm / đoàn thể, sao lưu. Tài khoản nhận tiền khai ở từng quỹ.
const FUND_SETTINGS = `
<div class="view-head"><div><h1>Cài đặt</h1><div class="sub">Thông tin thôn và danh mục dùng khi tạo quỹ</div></div>
  <button class="btn primary" id="btn-save-settings">Lưu cài đặt</button></div>
<div class="grid2">
  <div class="card">
    <h3>Thông tin thôn / tổ chức</h3>
    <label class="fld">Tên hiển thị<input class="field" data-s="shop_name" placeholder="Ví dụ: Ban quản lý quỹ thôn An Phú"></label>
    <label class="fld">Địa chỉ<input class="field" data-s="shop_address"></label>
    <label class="fld">Điện thoại liên hệ<input class="field" data-s="shop_phone" inputmode="tel"></label>
  </div>
  <div class="card">
    <h3>Loại quỹ</h3>
    <p class="muted">Mỗi dòng một loại, có thể ghi kèm tính chất sau dấu <b>|</b>: <code>Bắt buộc</code>, <code>Vận động</code> hoặc <code>Tự nguyện</code>.
      Ví dụ: <code>Quỹ quốc phòng – an ninh | Bắt buộc</code>, <code>Ủng hộ lũ lụt | Vận động</code>, <code>Công đức | Tự nguyện</code>.</p>
    <textarea class="field fd-textarea" rows="6" data-s="fund_types"></textarea>
  </div>
  <div class="card">
    <h3>Xóm / đoàn thể</h3>
    <p class="muted">Mỗi dòng một xóm hoặc đoàn thể, ví dụ: Xóm 1, Xóm 2, Hội Phụ nữ, Hội Cựu chiến binh, Chi đoàn thanh niên.
      Dùng để chọn phạm vi thu của từng quỹ (mặc định là cả thôn).</p>
    <textarea class="field fd-textarea" rows="6" data-s="fund_groups"></textarea>
  </div>
  <div class="card">
    <h3>Dữ liệu &amp; sao lưu</h3>
    <p class="muted">Phần mềm tự sao lưu sổ quỹ định kỳ.</p>
    <label class="chk"><input type="checkbox" data-s="backup_enabled"> Tự động sao lưu</label>
    <label class="fld" style="margin-top:10px">Số bản giữ lại<input class="field" type="number" min="1" data-s="backup_keep"></label>
    <div class="toolbar"><button class="btn primary" id="btn-backup-now" type="button">Sao lưu ngay</button></div>
    <div id="backup-list" class="scroll-x" style="margin-top:8px"></div>
  </div>
</div>`;

async function renderBackups() {
  const el = document.getElementById('backup-list');
  if (!el) return;
  try {
    const r = await api('/api/backups');
    el.innerHTML = `<table class="line-items"><thead><tr><th>Bản sao lưu</th><th class="r">Dung lượng</th><th></th></tr></thead>
      <tbody>${r.items.map((b) => `<tr data-name="${esc(b.name)}">
        <td>${esc(fmtDT(b.mtime))}<span class="sub">${esc(b.name)}</span></td>
        <td class="r">${(b.size / 1024).toFixed(0)} KB</td>
        <td class="r"><button class="btn sm" data-bk="download">Tải</button>
          <button class="btn sm" data-bk="restore">Phục hồi</button>
          <button class="btn sm danger" data-bk="delete">Xóa</button></td></tr>`).join('')
        || '<tr><td colspan="3" class="empty">Chưa có bản sao lưu</td></tr>'}</tbody></table>`;
  } catch { el.innerHTML = ''; }
}

async function onBackupClick(e) {
  const btn = e.target.closest('[data-bk]');
  if (!btn) return;
  const name = btn.closest('tr').dataset.name;
  if (btn.dataset.bk === 'download') { window.location.href = `/api/backups/${encodeURIComponent(name)}/download`; return; }
  if (btn.dataset.bk === 'delete') {
    if (!confirm('Xóa bản sao lưu này?')) return;
    try { await api('/api/backups/' + encodeURIComponent(name), { method: 'DELETE' }); toast('Đã xóa'); renderBackups(); } catch (er) { toast(er.message, true); }
  }
  if (btn.dataset.bk === 'restore') {
    if (!confirm('Phục hồi từ bản này? Bạn cần KHỞI ĐỘNG LẠI phần mềm để áp dụng.\nDữ liệu hiện tại sẽ được giữ lại một bản an toàn trước khi thay.')) return;
    try { const r = await api(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }); alert(r.message); }
    catch (er) { toast(er.message, true); }
  }
}

async function save() {
  const body = {};
  for (const el of $$('[data-s]')) body[el.dataset.s] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
  if ($('#bank-select')) {
    const bank = bankOf($('#bank-select').value);
    if (bank === undefined) { toast('Chọn ngân hàng trong danh sách gợi ý', true); $('#bank-select').focus(); return; }
    body.bank_bin = bank ? bank[0] : '';
    body.bank_name = bank ? bank[1] : '';
  }
  try {
    state.settings = await api('/api/settings', { method: 'PUT', body });
    setCurrency(state.settings.currency || '₫');
    const name = state.settings.shop_name || 'POS Shop';
    $('#brand-name').textContent = name.length > 22 ? 'POS Shop' : name;
    document.title = `${name} – POS Shop`;
    toast('Đã lưu cài đặt');
  } catch (e) { toast(e.message, true); }
}

async function testQR() {
  try {
    const q = await api('/api/qr?amount=10000&message=TEST');
    $('#qr-test').innerHTML = `<div class="qr-wrap"><img src="${q.dataUrl}"><div class="info">Quét thử bằng app ngân hàng: 10.000 · ${esc(q.bank_name)} ${esc(q.bank_account)}</div></div>`;
  } catch (e) { toast(e.message, true); }
}
