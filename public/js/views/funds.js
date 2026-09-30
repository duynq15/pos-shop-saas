// Màn hình thủ quỹ (GĐ2.8): danh sách quỹ, QR, sổ thu chi, khoản chờ duyệt, báo cáo kỳ.
import { $, esc, money, today, monthStart, modal, closeModal, toast, printHTML } from '../util.js';
import { api } from '../store.js';
import { auth, can } from '../auth.js';
import { icon } from '../icons.js';

const TYPE_LABEL = { in: 'Thu', out: 'Chi', adjust: 'Điều chỉnh' };
const SRC_LABEL = { vietqr: 'VietQR', manual: 'Chuyển khoản khác', cash: 'Tiền mặt' };
const STATUS_BADGE = { draft: 'draft', submitted: 'pending', approved: 'paid', rejected: 'cancelled' };
const STATUS_LABEL = { draft: 'Nháp', submitted: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
const signed = (e) => (e.type === 'out' ? -e.amount : e.amount);

let funds = [];
let activeId = null;
let lastReport = null;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default {
  id: 'funds',
  label: 'Sổ quỹ',
  icon: icon('wallet'),

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Sổ quỹ</h1><div class="sub">Quỹ chung và công đức của cộng đồng</div></div>
  <button class="btn primary hidden" id="fd-new-fund">+ Quỹ mới</button></div>
<div class="tabs" id="fd-tabs"></div>
<div id="fd-body" class="empty">Đang tải…</div>`;
    $('#fd-new-fund').onclick = () => openFundForm(null);
    $('#fd-tabs').onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      activeId = Number(b.dataset.id); render();
    };
  },

  async show() { await loadFunds(); },
};

async function loadFunds() {
  funds = await api('/api/funds');
  $('#fd-new-fund').classList.toggle('hidden', !can('fund.manage'));
  if (!activeId || !funds.some((f) => f.id === activeId)) activeId = funds[0]?.id ?? null;
  $('#fd-tabs').innerHTML = funds.map((f) => `<button class="tab ${f.id === activeId ? 'active' : ''}" data-id="${f.id}">
    ${esc(f.name)}${f.status === 'closed' ? ' (đã đóng)' : ''}</button>`).join('');
  render();
}

function bodyTemplate(f) {
  return `
<div class="stats" style="margin:14px 0">
  <div class="stat primary"><div class="k">Tồn quỹ</div><div class="v">${money(f.balance)}</div></div>
  <div class="stat"><div class="k">Tài khoản nhận</div><div class="v" style="font-size:15px">${esc(f.bank_account || '—')}</div></div>
  <div class="stat"><div class="k">Trạng thái</div><div class="v" style="font-size:15px">${f.status === 'active' ? 'Đang hoạt động' : 'Đã đóng'}</div></div>
</div>
<div class="toolbar" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
  ${can('fund.entry') ? `<button class="btn ok sm" id="fd-in">+ Thu tiền mặt</button>
  <button class="btn sm" id="fd-out">+ Lập phiếu chi</button>
  <button class="btn sm" id="fd-adjust">+ Điều chỉnh</button>` : ''}
  <button class="btn sm" id="fd-qr">Xem QR</button>
  ${can('fund.manage') ? '<button class="btn sm" id="fd-edit-fund">Sửa quỹ</button>' : ''}
</div>

<div class="card">
  <h3>${icon('clock')} Khoản chờ duyệt</h3>
  <div class="tbl-wrap"><table class="grid"><thead><tr>
    <th>Mã</th><th>Loại</th><th class="r">Số tiền</th><th>Ghi chú</th><th>Người lập</th><th></th>
  </tr></thead><tbody id="fd-pending-body"><tr><td colspan="6" class="empty">Đang tải…</td></tr></tbody></table></div>
</div>

<div class="card">
  <h3>${icon('receipt')} Sổ thu chi</h3>
  <div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
    <input type="date" class="field" id="fd-le-from" value="${monthStart()}"> <input type="date" class="field" id="fd-le-to" value="${today()}">
    <select class="field" id="fd-le-type"><option value="">Tất cả loại</option><option value="in">Thu</option><option value="out">Chi</option><option value="adjust">Điều chỉnh</option></select>
    <select class="field" id="fd-le-status"><option value="">Tất cả trạng thái</option><option value="draft">Nháp</option><option value="submitted">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option></select>
    <button class="btn sm" id="fd-le-filter">Lọc</button>
  </div>
  <div class="tbl-wrap"><table class="grid"><thead><tr>
    <th>Ngày</th><th>Mã</th><th>Loại</th><th class="r">Số tiền</th><th>Nguồn</th><th>Người nộp / ghi chú</th><th>Trạng thái</th><th></th>
  </tr></thead><tbody id="fd-ledger-body"><tr><td colspan="8" class="empty">Đang tải…</td></tr></tbody></table></div>
</div>

<div class="card">
  <h3>${icon('chart')} Báo cáo kỳ</h3>
  <div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
    <input type="date" class="field" id="fd-rp-from" value="${monthStart()}"> <input type="date" class="field" id="fd-rp-to" value="${today()}">
    <button class="btn sm primary" id="fd-rp-view">Xem</button>
    ${can('report.export') ? '<button class="btn sm" id="fd-rp-export">Xuất Excel</button>' : ''}
    <button class="btn sm" id="fd-rp-print">In</button>
  </div>
  <div class="stats" id="fd-rp-stats"></div>
</div>`;
}

async function render() {
  const f = funds.find((x) => x.id === activeId);
  const body = $('#fd-body');
  if (!f) { body.innerHTML = '<div class="card empty">Chưa có quỹ nào</div>'; return; }
  body.innerHTML = bodyTemplate(f);
  $('#fd-qr').onclick = () => openQr(f);
  if (can('fund.manage')) $('#fd-edit-fund').onclick = () => openFundForm(f);
  if (can('fund.entry')) {
    $('#fd-in').onclick = () => openEntryForm(f, 'in');
    $('#fd-out').onclick = () => openEntryForm(f, 'out');
    $('#fd-adjust').onclick = () => openEntryForm(f, 'adjust');
  }
  $('#fd-le-filter').onclick = () => loadLedger(f.id);
  $('#fd-rp-view').onclick = () => loadReport(f.id);
  if (can('report.export')) {
    $('#fd-rp-export').onclick = () => {
      const from = $('#fd-rp-from').value || today(); const to = $('#fd-rp-to').value || from;
      window.location.href = `/api/funds/${f.id}/report/export?from=${from}&to=${to}`;
    };
  }
  $('#fd-rp-print').onclick = () => printReport(f);
  await Promise.all([loadPending(f.id), loadLedger(f.id)]);
}

function pendingActions(e) {
  const out = [];
  if (e.status === 'draft' && can('fund.entry')) out.push(`<button class="btn sm" data-act="submit" data-id="${e.id}">Gửi duyệt</button>`);
  if (e.status === 'submitted' && can('fund.approve')) {
    out.push(`<button class="btn sm ok" data-act="approve" data-id="${e.id}">Duyệt</button>`);
    out.push(`<button class="btn sm danger" data-act="reject" data-id="${e.id}">Từ chối</button>`);
  }
  return out.join(' ');
}

async function loadPending(fundId) {
  const { entries } = await api(`/api/funds/${fundId}/entries?status=submitted`);
  let list = entries;
  if (can('fund.entry') && !can('fund.approve')) {
    const { entries: drafts } = await api(`/api/funds/${fundId}/entries?status=draft`);
    list = [...drafts.filter((e) => e.created_by === auth.user.id), ...entries];
  }
  $('#fd-pending-body').innerHTML = list.map((e) => `<tr>
    <td>${esc(e.code)}</td><td>${TYPE_LABEL[e.type]}</td>
    <td class="r">${money(signed(e))}</td>
    <td class="muted">${esc(e.note || '')}</td><td class="muted">${esc(e.created_by_name || '')}</td>
    <td class="r">${pendingActions(e)}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty">Không có khoản chờ</td></tr>';
  $('#fd-pending-body').onclick = async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id; const act = b.dataset.act;
    try {
      if (act === 'reject') {
        const reason = prompt('Lý do từ chối?');
        if (!reason) return;
        await api(`/api/fund-entries/${id}/reject`, { method: 'POST', body: { reason } });
      } else {
        await api(`/api/fund-entries/${id}/${act}`, { method: 'POST' });
      }
      toast('Đã cập nhật'); await loadFunds();
    } catch (e) { toast(e.message, true); }
  };
}

async function loadLedger(fundId) {
  const q = new URLSearchParams();
  for (const [k, id] of [['from', 'fd-le-from'], ['to', 'fd-le-to'], ['type', 'fd-le-type'], ['status', 'fd-le-status']]) {
    const v = $('#' + id)?.value; if (v) q.set(k, v);
  }
  const { entries } = await api(`/api/funds/${fundId}/entries?${q.toString()}`);
  $('#fd-ledger-body').innerHTML = entries.map((e) => `<tr>
    <td class="muted">${esc((e.created_at || '').slice(0, 16))}</td>
    <td>${esc(e.code)}</td><td>${TYPE_LABEL[e.type]}</td>
    <td class="r">${money(signed(e))}</td>
    <td class="muted">${SRC_LABEL[e.source] || e.source}</td>
    <td class="muted">${esc(e.anonymous ? 'Người hảo tâm' : (e.payer_name || e.note || ''))}</td>
    <td><span class="badge ${STATUS_BADGE[e.status]}">${STATUS_LABEL[e.status]}</span></td>
    <td class="r">${e.attachment ? `<a class="btn sm" href="/api/fund-entries/${e.id}/attachment" target="_blank" rel="noopener">Ảnh</a>` : ''}
      ${e.type === 'in' && can('fund.anonymize') ? `<button class="btn sm" data-anon="${e.anonymous ? 0 : 1}" data-id="${e.id}">${e.anonymous ? 'Hiện tên' : 'Ẩn tên'}</button>` : ''}</td>
  </tr>`).join('') || '<tr><td colspan="8" class="empty">Không có bút toán</td></tr>';
  $('#fd-ledger-body').onclick = async (ev) => {
    const b = ev.target.closest('[data-anon]'); if (!b) return;
    try {
      await api(`/api/fund-entries/${b.dataset.id}/anonymous`, { method: 'POST', body: { anonymous: b.dataset.anon === '1' } });
      toast(b.dataset.anon === '1' ? 'Đã ẩn tên người ủng hộ' : 'Đã hiện tên người ủng hộ'); await loadLedger(fundId);
    } catch (e) { toast(e.message, true); }
  };
}

async function loadReport(fundId) {
  const from = $('#fd-rp-from').value || today(); const to = $('#fd-rp-to').value || from;
  const r = await api(`/api/funds/${fundId}/report?from=${from}&to=${to}`);
  lastReport = r;
  $('#fd-rp-stats').innerHTML = [
    ['Tồn đầu kỳ', r.opening_balance, ''], ['Thu ngân hàng', r.income_bank, 'ok'], ['Thu tiền mặt', r.income_cash, 'ok'],
    ['Chi', r.expense, 'danger'], ['Điều chỉnh', r.adjust, ''], ['Tồn cuối kỳ', r.closing_balance, 'primary'],
  ].map(([k, v, cls]) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${money(v)}</div></div>`).join('');
}

function printReport(f) {
  if (!lastReport) { toast('Hãy bấm Xem trước', true); return; }
  const r = lastReport;
  const rows = r.entries.map((e) => `<tr><td>${esc((e.created_at || '').slice(0, 10))}</td><td>${esc(e.code)}</td>
    <td>${TYPE_LABEL[e.type]}</td><td style="text-align:right">${money(signed(e))}</td>
    <td>${esc(e.anonymous ? 'Người hảo tâm' : (e.payer_name || ''))}</td><td>${esc(e.note || '')}</td></tr>`).join('');
  printHTML(`<h2>Báo cáo quỹ ${esc(f.name)}</h2><p>Từ ${r.from} đến ${r.to}</p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:16px">
      <tr><td>Tồn đầu kỳ</td><td style="text-align:right">${money(r.opening_balance)}</td></tr>
      <tr><td>Thu ngân hàng</td><td style="text-align:right">${money(r.income_bank)}</td></tr>
      <tr><td>Thu tiền mặt</td><td style="text-align:right">${money(r.income_cash)}</td></tr>
      <tr><td>Chi</td><td style="text-align:right">${money(r.expense)}</td></tr>
      <tr><td>Điều chỉnh</td><td style="text-align:right">${money(r.adjust)}</td></tr>
      <tr><td><b>Tồn cuối kỳ</b></td><td style="text-align:right"><b>${money(r.closing_balance)}</b></td></tr>
    </table>
    <h3>Chi tiết bút toán</h3>
    <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">
      <tr><th>Ngày</th><th>Mã</th><th>Loại</th><th>Số tiền</th><th>Người nộp</th><th>Ghi chú</th></tr>${rows}
    </table>`);
}

async function openQr(f) {
  modal(`<h2>QR nhận tiền — ${esc(f.name)}</h2><div id="fd-qr-body">Đang tải…</div>
    ${can('fund.entry') ? `<div class="toolbar" style="margin-top:10px">
      <input type="number" class="field" id="fd-qr-amount" placeholder="Số tiền yêu cầu">
      <button class="btn sm primary" id="fd-qr-gen">Tạo QR động</button></div>` : ''}
    <div class="modal-actions"><button class="btn" id="fd-qr-close">Đóng</button></div>`);
  $('#fd-qr-close').onclick = closeModal;
  try {
    const q = await api(`/api/funds/${f.id}/qr`);
    $('#fd-qr-body').innerHTML = `<img src="${q.qrDataUrl}" alt="QR" style="width:240px;height:240px;display:block;margin:0 auto">
      <p class="muted" style="text-align:center">${esc(q.bank_name || '')} · ${esc(f.bank_account || '')}</p>`;
  } catch (e) { $('#fd-qr-body').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  if (can('fund.entry')) {
    $('#fd-qr-gen').onclick = async () => {
      const amount = $('#fd-qr-amount').value;
      if (!amount) return;
      try {
        const q = await api(`/api/funds/${f.id}/qr`, { method: 'POST', body: { amount } });
        $('#fd-qr-body').innerHTML = `<img src="${q.qrDataUrl}" alt="QR" style="width:240px;height:240px;display:block;margin:0 auto">
          <p class="muted" style="text-align:center">${money(q.amount)}</p>`;
      } catch (e) { toast(e.message, true); }
    };
  }
}

function openFundForm(f) {
  const isNew = !f;
  const d = f || { kind: 'general', status: 'active' };
  modal(`<h2>${isNew ? 'Quỹ mới' : 'Sửa quỹ'}</h2>
    <div class="form-grid">
      ${isNew ? '<label class="fld">Mã quỹ *<input class="field" id="fd-f-code"></label>' : ''}
      <label class="fld ${isNew ? '' : 'full'}">Tên quỹ *<input class="field" id="fd-f-name" value="${esc(d.name || '')}"></label>
      <label class="fld">Loại<select class="field" id="fd-f-kind">
        <option value="general" ${d.kind === 'general' ? 'selected' : ''}>Quỹ chung</option>
        <option value="donation" ${d.kind === 'donation' ? 'selected' : ''}>Công đức</option></select></label>
      <label class="fld">Số tài khoản<input class="field" id="fd-f-account" value="${esc(d.bank_account || '')}"></label>
      <label class="fld">Mã ngân hàng (BIN)<input class="field" id="fd-f-bin" value="${esc(d.bank_bin || '')}"></label>
      <label class="fld">Tên ngân hàng<input class="field" id="fd-f-bankname" value="${esc(d.bank_name || '')}"></label>
      <label class="fld">Chủ tài khoản<input class="field" id="fd-f-holder" value="${esc(d.account_holder || '')}"></label>
      ${!isNew ? `<label class="fld">Trạng thái<select class="field" id="fd-f-status">
        <option value="active" ${d.status === 'active' ? 'selected' : ''}>Đang hoạt động</option>
        <option value="closed" ${d.status === 'closed' ? 'selected' : ''}>Đã đóng</option></select></label>` : ''}
    </div>
    <div class="modal-actions"><button class="btn primary" id="fd-f-save">Lưu</button><button class="btn" id="fd-f-close">Đóng</button></div>`);
  $('#fd-f-close').onclick = closeModal;
  $('#fd-f-save').onclick = async () => {
    const body = {
      name: $('#fd-f-name').value, kind: $('#fd-f-kind').value, bank_account: $('#fd-f-account').value,
      bank_bin: $('#fd-f-bin').value, bank_name: $('#fd-f-bankname').value, account_holder: $('#fd-f-holder').value,
    };
    if (isNew) body.code = $('#fd-f-code').value; else body.status = $('#fd-f-status').value;
    try {
      const saved = await api(isNew ? '/api/funds' : `/api/funds/${f.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast('Đã lưu quỹ'); closeModal();
      activeId = saved.id; await loadFunds();
    } catch (e) { toast(e.message, true); }
  };
}

async function openEntryForm(f, type) {
  const title = { in: 'Thu tiền mặt', out: 'Lập phiếu chi', adjust: 'Điều chỉnh' }[type];
  let refOptions = '';
  if (type === 'adjust') {
    const { entries } = await api(`/api/funds/${f.id}/entries?status=approved`);
    refOptions = entries.map((e) => `<option value="${e.id}">${esc(e.code)} — ${money(signed(e))}</option>`).join('');
  }
  modal(`<h2>${title}</h2>
    <div class="form-grid">
      <label class="fld full">Số tiền *<input class="field" type="number" id="fd-e-amount"></label>
      ${type === 'in' ? `<label class="fld">Người nộp<input class="field" id="fd-e-payer"></label>
        <label class="chk">Ẩn danh<input type="checkbox" id="fd-e-anon"></label>` : ''}
      ${type === 'adjust' ? `<label class="fld full">Bút toán gốc *<select class="field" id="fd-e-ref">${refOptions}</select></label>` : ''}
      <label class="fld full">Ghi chú${type !== 'in' ? ' *' : ''}<input class="field" id="fd-e-note"></label>
      ${type === 'out' ? '<label class="fld full">Ảnh chứng từ * (bắt buộc trước khi gửi duyệt)<input class="field" type="file" id="fd-e-file" accept="image/jpeg,image/png,image/webp"></label>' : ''}
    </div>
    <div class="modal-actions"><button class="btn primary" id="fd-e-save">Lưu</button><button class="btn" id="fd-e-close">Đóng</button></div>`);
  $('#fd-e-close').onclick = closeModal;
  $('#fd-e-save').onclick = async () => {
    const body = { type, amount: $('#fd-e-amount').value, note: $('#fd-e-note').value };
    if (type === 'in') { body.payer_name = $('#fd-e-payer').value; body.anonymous = $('#fd-e-anon').checked; body.source = 'cash'; }
    if (type === 'adjust') body.ref_entry_id = $('#fd-e-ref').value;
    if (type === 'out') {
      const file = $('#fd-e-file').files[0];
      if (file) body.attachment = await fileToDataUrl(file);
    }
    try {
      await api(`/api/funds/${f.id}/entries`, { method: 'POST', body });
      toast('Đã lưu'); closeModal(); await loadFunds();
    } catch (e) { toast(e.message, true); }
  };
}
