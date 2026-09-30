// Màn hình sổ quỹ (GĐ2.8): chọn quỹ, số liệu nhanh, việc cần làm, sổ thu chi, báo cáo kỳ.
// Bố cục theo việc hằng ngày của thủ quỹ: thu tiền là thao tác chính; duyệt chi gom vào "Việc cần làm".
import { $, esc, nf, money, today, monthStart, modal, closeModal, toast, printHTML } from '../util.js';
import { api } from '../store.js';
import { auth, can } from '../auth.js';
import { icon } from '../icons.js';

const TYPE_LABEL = { in: 'Thu', out: 'Chi', adjust: 'Điều chỉnh' };
const SRC_LABEL = { vietqr: 'VietQR', manual: 'Chuyển khoản', cash: 'Tiền mặt' };
const STATUS_BADGE = { draft: 'draft', submitted: 'pending', approved: 'paid', rejected: 'cancelled' };
const STATUS_LABEL = { draft: 'Nháp', submitted: 'Chờ duyệt', approved: 'Đã ghi sổ', rejected: 'Từ chối' };
const QUICK = [50000, 100000, 200000, 500000, 1000000];
const signed = (e) => (e.type === 'out' ? -e.amount : e.amount);
const signedMoney = (n) => `<span class="${n < 0 ? 'fd-neg' : 'fd-pos'}">${n < 0 ? '−' : '+'}${money(Math.abs(n))}</span>`;
const who = (e) => (e.anonymous ? 'Người hảo tâm' : (e.payer_name || ''));
const shortMoney = (n) => (n >= 1e6 ? `${n / 1e6}tr` : `${n / 1e3}k`);

let funds = [];
let activeId = null;
let tab = null; // 'todo' | 'ledger' | 'report'
let todo = [];
let lastReport = null;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Khoảng ngày chọn nhanh cho báo cáo
function presetRange(p) {
  const d = new Date();
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (p === 'last') return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (p === 'quarter') return { from: ymd(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)), to: today() };
  if (p === 'year') return { from: `${d.getFullYear()}-01-01`, to: today() };
  return { from: monthStart(), to: today() };
}

export default {
  id: 'funds',
  label: 'Sổ quỹ',
  icon: icon('wallet'),

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Sổ quỹ</h1><div class="sub">Quỹ chung và công đức của cộng đồng</div></div>
  <button class="btn hidden" id="fd-new-fund">+ Quỹ mới</button></div>
<div class="fd-chips" id="fd-tabs" role="tablist" aria-label="Chọn quỹ"></div>
<div id="fd-body"><div class="card fd-empty">Đang tải…</div></div>`;
    $('#fd-new-fund').onclick = () => openFundForm(null);
    $('#fd-tabs').onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      activeId = Number(b.dataset.id); tab = null; renderChips(); render();
    };
  },

  async show() { await loadFunds(); },
};

async function loadFunds() {
  funds = await api('/api/funds');
  $('#fd-new-fund').classList.toggle('hidden', !can('fund.manage'));
  if (!activeId || !funds.some((f) => f.id === activeId)) activeId = funds[0]?.id ?? null;
  renderChips();
  await render();
}

function renderChips() {
  $('#fd-tabs').innerHTML = funds.map((f) => `<button class="fd-chip ${f.id === activeId ? 'active' : ''} ${f.status === 'closed' ? 'closed' : ''}"
    role="tab" aria-selected="${f.id === activeId}" data-id="${f.id}">
    <span class="n">${esc(f.name)}</span><span class="b">${money(f.balance)}</span></button>`).join('');
}

function bodyTemplate(f) {
  const entry = can('fund.entry') && f.status === 'active';
  return `
<div class="fd-meta muted">
  ${f.kind === 'donation' ? '<span class="badge sale">Công đức</span>' : '<span class="badge">Quỹ chung</span>'}
  ${f.status === 'active' ? '' : '<span class="badge cancelled">Đã đóng</span>'}
  <span>${f.bank_account ? `TK ${esc(f.bank_account)}${f.bank_name ? ' · ' + esc(f.bank_name) : ''}` : 'Chưa khai tài khoản nhận'}</span>
</div>
<div class="stats fd-stats">
  <div class="stat primary"><div class="k">Tồn quỹ</div><div class="v">${money(f.balance)}</div></div>
  <div class="stat ok"><div class="k">Thu tháng này</div><div class="v" id="fd-m-in">…</div></div>
  <div class="stat danger"><div class="k">Chi tháng này</div><div class="v" id="fd-m-out">…</div></div>
  <div class="stat warn"><div class="k">Việc cần làm</div><div class="v" id="fd-m-todo">…</div></div>
</div>
<div class="toolbar fd-actions">
  ${entry ? `<button class="btn primary fd-desk" id="fd-in">+ Thu tiền</button>
  <button class="btn fd-desk" id="fd-out">+ Lập phiếu chi</button>` : ''}
  <button class="btn" id="fd-qr">${icon('card')} QR nhận tiền</button>
  ${entry || can('fund.manage') ? `<details class="fd-menu"><summary class="btn" aria-label="Thao tác khác">Thêm ▾</summary><div>
    ${entry ? '<button class="mi" id="fd-adjust">Lập bút toán điều chỉnh</button>' : ''}
    ${can('fund.manage') ? '<button class="mi" id="fd-edit-fund">Sửa thông tin quỹ</button>' : ''}
  </div></details>` : ''}
</div>
<div class="tabs" id="fd-subtabs">
  <button class="tab" data-tab="todo">Việc cần làm <span class="fd-count" id="fd-todo-count"></span></button>
  <button class="tab" data-tab="ledger">Sổ thu chi</button>
  <button class="tab" data-tab="report">Báo cáo</button>
</div>
<section data-pane="todo"><div class="fd-todo" id="fd-pending-body"></div></section>
<section data-pane="ledger" hidden>
  <div class="toolbar">
    <input type="date" class="field" id="fd-le-from" value="${monthStart()}" aria-label="Từ ngày">
    <input type="date" class="field" id="fd-le-to" value="${today()}" aria-label="Đến ngày">
    <select class="field" id="fd-le-type" aria-label="Loại"><option value="">Thu và chi</option><option value="in">Chỉ thu</option><option value="out">Chỉ chi</option><option value="adjust">Điều chỉnh</option></select>
    <select class="field" id="fd-le-status" aria-label="Trạng thái"><option value="">Mọi trạng thái</option><option value="approved">Đã ghi sổ</option><option value="submitted">Chờ duyệt</option><option value="draft">Nháp</option><option value="rejected">Từ chối</option></select>
  </div>
  <div class="tbl-wrap"><table class="grid fd-ledger"><thead><tr>
    <th>Ngày</th><th>Nội dung</th><th class="r">Số tiền</th><th>Trạng thái</th>
  </tr></thead><tbody id="fd-ledger-body"></tbody></table></div>
  <p class="muted fd-hint">Bấm vào một dòng để xem chi tiết, ảnh chứng từ, ẩn / hiện tên người ủng hộ.</p>
</section>
<section data-pane="report" hidden>
  <div class="toolbar">
    <div class="seg" id="fd-rp-preset">
      <button class="seg-btn active" data-p="month">Tháng này</button><button class="seg-btn" data-p="last">Tháng trước</button>
      <button class="seg-btn" data-p="quarter">Quý này</button><button class="seg-btn" data-p="year">Năm nay</button>
    </div>
    <input type="date" class="field" id="fd-rp-from" value="${monthStart()}" aria-label="Từ ngày">
    <input type="date" class="field" id="fd-rp-to" value="${today()}" aria-label="Đến ngày">
    <button class="btn" id="fd-rp-view">Xem</button>
    <span class="fd-spacer"></span>
    ${can('report.export') ? '<button class="btn" id="fd-rp-export">Xuất Excel</button>' : ''}
    <button class="btn" id="fd-rp-print">In báo cáo</button>
  </div>
  <div class="stats" id="fd-rp-stats"></div>
  <p class="muted fd-hint">Tồn cuối kỳ = tồn đầu kỳ + thu − chi ± điều chỉnh. Chỉ tính khoản đã ghi sổ, theo ngày ghi sổ.</p>
</section>
${entry ? `<div class="fd-bar"><button class="btn primary" id="fd-in-m">+ Thu tiền</button><button class="btn" id="fd-out-m">+ Phiếu chi</button></div>` : ''}`;
}

async function render() {
  const f = funds.find((x) => x.id === activeId);
  const body = $('#fd-body');
  if (!f) {
    body.innerHTML = `<div class="card fd-empty"><p>Chưa có quỹ nào.</p>
      ${can('fund.manage') ? '<button class="btn primary" id="fd-first-fund">+ Tạo quỹ đầu tiên</button>' : '<p class="muted">Người duyệt chi sẽ tạo quỹ.</p>'}</div>`;
    $('#fd-first-fund')?.addEventListener('click', () => openFundForm(null));
    return;
  }
  body.innerHTML = bodyTemplate(f);
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('fd-qr', () => openQr(f));
  on('fd-edit-fund', () => { $('.fd-menu').open = false; openFundForm(f); });
  on('fd-adjust', () => { $('.fd-menu').open = false; openEntryForm(f, 'adjust'); });
  for (const id of ['fd-in', 'fd-in-m']) on(id, () => openEntryForm(f, 'in'));
  for (const id of ['fd-out', 'fd-out-m']) on(id, () => openEntryForm(f, 'out'));
  $('#fd-subtabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab, f); };
  for (const id of ['fd-le-from', 'fd-le-to', 'fd-le-type', 'fd-le-status']) $('#' + id).onchange = () => loadLedger(f.id);
  $('#fd-ledger-body').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openDetail(f, Number(tr.dataset.id)); };
  $('#fd-ledger-body').onkeydown = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(f, Number(tr.dataset.id)); } };
  $('#fd-rp-preset').onclick = (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    document.querySelectorAll('#fd-rp-preset .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    const r = presetRange(b.dataset.p); $('#fd-rp-from').value = r.from; $('#fd-rp-to').value = r.to; loadReport(f.id);
  };
  on('fd-rp-view', () => { document.querySelectorAll('#fd-rp-preset .seg-btn').forEach((x) => x.classList.remove('active')); loadReport(f.id); });
  on('fd-rp-export', () => { window.location.href = `/api/funds/${f.id}/report/export?from=${$('#fd-rp-from').value}&to=${$('#fd-rp-to').value}`; });
  on('fd-rp-print', () => printReport(f));

  const [month] = await Promise.all([
    api(`/api/funds/${f.id}/report?from=${monthStart()}&to=${today()}`),
    loadTodo(f),
  ]);
  $('#fd-m-in').textContent = money(month.income_bank + month.income_cash);
  $('#fd-m-out').textContent = money(month.expense);
  showTab(tab || (todo.length ? 'todo' : 'ledger'), f);
}

function showTab(name, f) {
  tab = name;
  document.querySelectorAll('#fd-subtabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('#fd-body [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  if (name === 'ledger') loadLedger(f.id);
  if (name === 'report') loadReport(f.id);
}

/* ---------------- Việc cần làm ---------------- */
// Người duyệt: khoản người khác gửi. Thủ quỹ: phiếu nháp của mình + khoản mình đã gửi đang chờ.
async function loadTodo(f) {
  const { entries: submitted } = await api(`/api/funds/${f.id}/entries?status=submitted`);
  let drafts = [];
  if (can('fund.entry')) drafts = (await api(`/api/funds/${f.id}/entries?status=draft`)).entries.filter((e) => e.created_by === auth.user.id);
  todo = [...drafts, ...submitted];
  const actionable = drafts.length + (can('fund.approve') ? submitted.filter((e) => e.created_by !== auth.user.id).length : 0);
  $('#fd-m-todo').textContent = actionable ? `${actionable} việc` : 'Không có';
  $('#fd-todo-count').textContent = actionable || '';
  $('#fd-pending-body').innerHTML = todo.map(taskCard).join('') || `<div class="card fd-empty">
    <p><b>Không có việc cần làm.</b></p>
    <p class="muted">${can('fund.approve') ? 'Khoản chi do thủ quỹ gửi sẽ hiện ở đây để bạn duyệt.' : 'Phiếu chi nháp và khoản đang chờ duyệt sẽ hiện ở đây.'}</p></div>`;
  $('#fd-pending-body').onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    taskAction(f, b.dataset.act, todo.find((x) => String(x.id) === b.dataset.id));
  };
}

function taskCard(e) {
  const mine = e.created_by === auth.user.id;
  const missing = e.type === 'out' && !e.attachment;
  let acts = '';
  let state = '';
  if (e.status === 'draft') {
    state = missing ? '<span class="badge pending">Thiếu ảnh chứng từ</span>' : '<span class="badge">Nháp, chưa gửi</span>';
    acts = `<button class="btn" data-act="edit" data-id="${e.id}">${missing ? 'Thêm ảnh' : 'Sửa'}</button>
      <button class="btn primary" data-act="submit" data-id="${e.id}" ${missing ? 'disabled title="Cần ảnh chứng từ trước"' : ''}>Gửi duyệt</button>`;
  } else if (!mine && can('fund.approve')) {
    state = '<span class="badge pending">Chờ bạn duyệt</span>';
    acts = `${e.attachment ? `<button class="btn" data-act="view" data-id="${e.id}">Xem chứng từ</button>` : ''}
      <button class="btn danger" data-act="reject" data-id="${e.id}">Từ chối</button>
      <button class="btn ok" data-act="approve" data-id="${e.id}">Duyệt</button>`;
  } else {
    state = '<span class="badge pending">Đang chờ duyệt</span>';
  }
  return `<div class="fd-task ${e.status}">
    <div class="fd-task-main">
      <div class="fd-task-amt">${signedMoney(signed(e))}</div>
      <div>${esc(e.note || TYPE_LABEL[e.type])}</div>
      <div class="meta">${esc(e.code)} · ${TYPE_LABEL[e.type]} · ${esc(e.created_by_name || '')} · ${esc((e.created_at || '').slice(0, 16))}</div>
    </div>
    <div class="fd-task-side">${state}<div class="acts">${acts}</div></div>
  </div>`;
}

async function taskAction(f, act, e) {
  if (!e) return;
  if (act === 'edit') return openEntryForm(f, e.type, e);
  if (act === 'view') return openDetail(f, e.id, e);
  if (act === 'reject') return openReject(e);
  try {
    await api(`/api/fund-entries/${e.id}/${act}`, { method: 'POST' });
    toast(act === 'approve' ? `Đã duyệt, ghi sổ ${money(e.amount)}` : 'Đã gửi duyệt');
    await loadFunds();
  } catch (err) { toast(err.message, true); }
}

function openReject(e) {
  modal(`<h2>Từ chối ${esc(e.code)}</h2>
    <p class="muted">${esc(e.note || '')} · ${money(e.amount)}</p>
    <label class="fld">Lý do từ chối *<textarea class="field fd-textarea" id="fd-rj-reason" rows="3" placeholder="Ví dụ: ảnh chứng từ mờ, số tiền không khớp"></textarea></label>
    <div class="modal-actions"><button class="btn" id="fd-rj-close">Hủy</button><button class="btn danger" id="fd-rj-ok">Từ chối khoản chi</button></div>`, { focus: '#fd-rj-reason' });
  $('#fd-rj-close').onclick = closeModal;
  $('#fd-rj-ok').onclick = async () => {
    const reason = $('#fd-rj-reason').value.trim();
    if (!reason) { toast('Nhập lý do để người lập biết cần sửa gì', true); return; }
    try {
      await api(`/api/fund-entries/${e.id}/reject`, { method: 'POST', body: { reason } });
      toast('Đã từ chối'); closeModal(); await loadFunds();
    } catch (err) { toast(err.message, true); }
  };
}

/* ---------------- Sổ thu chi ---------------- */
async function loadLedger(fundId) {
  const q = new URLSearchParams();
  for (const [k, id] of [['from', 'fd-le-from'], ['to', 'fd-le-to'], ['type', 'fd-le-type'], ['status', 'fd-le-status']]) {
    const v = $('#' + id)?.value; if (v) q.set(k, v);
  }
  const { entries } = await api(`/api/funds/${fundId}/entries?${q.toString()}`);
  $('#fd-ledger-body').innerHTML = entries.map((e) => `<tr data-id="${e.id}" tabindex="0">
    <td class="d">${esc((e.created_at || '').slice(0, 10))}<span class="sub">${esc(e.code)}</span></td>
    <td class="c"><span class="name">${esc(who(e) || e.note || TYPE_LABEL[e.type])}</span>
      <span class="sub">${SRC_LABEL[e.source] && e.type === 'in' ? SRC_LABEL[e.source] : TYPE_LABEL[e.type]}${who(e) && e.note ? ' · ' + esc(e.note) : ''}${e.attachment ? ' · có ảnh' : ''}</span></td>
    <td class="a r">${signedMoney(signed(e))}</td>
    <td class="s"><span class="badge ${STATUS_BADGE[e.status]}">${STATUS_LABEL[e.status]}</span></td>
  </tr>`).join('') || `<tr><td colspan="4" class="fd-empty">Không có bút toán trong khoảng này. Thử đổi ngày hoặc bỏ bộ lọc.</td></tr>`;
}

async function openDetail(f, id, known) {
  const e = known || (await api(`/api/funds/${f.id}/entries?status=`)).entries.find((x) => x.id === id);
  if (!e) return;
  const row = (k, v) => (v ? `<div class="fd-dl"><span>${k}</span><b>${v}</b></div>` : '');
  modal(`<h2>${esc(e.code)} <span class="badge ${STATUS_BADGE[e.status]}">${STATUS_LABEL[e.status]}</span></h2>
    <div class="fd-detail-amt">${signedMoney(signed(e))}</div>
    ${row('Loại', TYPE_LABEL[e.type] + (e.type === 'in' ? ' · ' + (SRC_LABEL[e.source] || e.source) : ''))}
    ${row('Người nộp', e.type === 'in' ? esc(e.payer_name || 'Chưa rõ tên') + (e.anonymous ? ' <span class="badge">Ẩn trên trang công khai</span>' : '') : '')}
    ${row('Ghi chú', esc(e.note || ''))}
    ${row('Mã giao dịch ngân hàng', esc(e.bank_ref || ''))}
    ${row('Người lập', esc(e.created_by_name || '') + ' · ' + esc((e.created_at || '').slice(0, 16)))}
    ${row(e.status === 'rejected' ? 'Người từ chối' : 'Người duyệt', e.approved_by_name ? esc(e.approved_by_name) + ' · ' + esc((e.approved_at || '').slice(0, 16)) : '')}
    ${row('Lý do từ chối', esc(e.reject_reason || ''))}
    ${e.attachment ? `<a href="/api/fund-entries/${e.id}/attachment" target="_blank" rel="noopener"><img class="fd-receipt" src="/api/fund-entries/${e.id}/attachment" alt="Ảnh chứng từ ${esc(e.code)}"></a>` : ''}
    <div class="modal-actions">
      ${e.type === 'in' && can('fund.anonymize') ? `<button class="btn" id="fd-dt-anon">${e.anonymous ? 'Hiện tên trên trang công khai' : 'Ẩn tên trên trang công khai'}</button>` : ''}
      <button class="btn primary" id="fd-dt-close">Đóng</button></div>`);
  $('#fd-dt-close').onclick = closeModal;
  const anon = $('#fd-dt-anon');
  if (anon) anon.onclick = async () => {
    try {
      await api(`/api/fund-entries/${e.id}/anonymous`, { method: 'POST', body: { anonymous: !e.anonymous } });
      toast(e.anonymous ? 'Đã hiện tên người ủng hộ' : 'Đã ẩn tên người ủng hộ'); closeModal(); await loadLedger(f.id);
    } catch (err) { toast(err.message, true); }
  };
}

/* ---------------- Báo cáo kỳ ---------------- */
async function loadReport(fundId) {
  const from = $('#fd-rp-from').value || today(); const to = $('#fd-rp-to').value || from;
  try {
    const r = await api(`/api/funds/${fundId}/report?from=${from}&to=${to}`);
    lastReport = r;
    $('#fd-rp-stats').innerHTML = [
      ['Tồn đầu kỳ', r.opening_balance, ''], ['Thu chuyển khoản', r.income_bank, 'ok'], ['Thu tiền mặt', r.income_cash, 'ok'],
      ['Chi', r.expense, 'danger'], ['Điều chỉnh', r.adjust, ''], ['Tồn cuối kỳ', r.closing_balance, 'primary'],
    ].map(([k, v, cls]) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${money(v)}</div></div>`).join('');
  } catch (e) { toast(e.message, true); }
}

function printReport(f) {
  if (!lastReport) { toast('Đang tải báo cáo, thử lại sau giây lát', true); return; }
  const r = lastReport;
  const rows = r.entries.map((e) => `<tr><td>${esc((e.approved_at || '').slice(0, 10))}</td><td>${esc(e.code)}</td>
    <td>${TYPE_LABEL[e.type]}</td><td style="text-align:right">${money(signed(e))}</td>
    <td>${esc(who(e))}</td><td>${esc(e.note || '')}</td></tr>`).join('');
  printHTML(`<h2>Báo cáo quỹ ${esc(f.name)}</h2><p>Từ ${r.from} đến ${r.to}</p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:16px">
      <tr><td>Tồn đầu kỳ</td><td style="text-align:right">${money(r.opening_balance)}</td></tr>
      <tr><td>Thu chuyển khoản</td><td style="text-align:right">${money(r.income_bank)}</td></tr>
      <tr><td>Thu tiền mặt</td><td style="text-align:right">${money(r.income_cash)}</td></tr>
      <tr><td>Chi</td><td style="text-align:right">${money(r.expense)}</td></tr>
      <tr><td>Điều chỉnh</td><td style="text-align:right">${money(r.adjust)}</td></tr>
      <tr><td><b>Tồn cuối kỳ</b></td><td style="text-align:right"><b>${money(r.closing_balance)}</b></td></tr>
    </table>
    <h3>Chi tiết bút toán</h3>
    <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">
      <tr><th>Ngày ghi sổ</th><th>Mã</th><th>Loại</th><th>Số tiền</th><th>Người nộp</th><th>Ghi chú</th></tr>${rows}
    </table>`);
}

/* ---------------- QR ---------------- */
async function openQr(f) {
  modal(`<h2>QR nhận tiền — ${esc(f.name)}</h2>
    <div id="fd-qr-body" class="fd-qr">Đang tải…</div>
    ${can('fund.entry') && f.status === 'active' ? `<label class="fld">Yêu cầu một số tiền cụ thể (không bắt buộc)
      <input class="field fd-amount" id="fd-qr-amount" inputmode="numeric" autocomplete="off" placeholder="0"></label>
      <button class="btn" id="fd-qr-gen">Tạo QR có số tiền</button>` : ''}
    <div class="modal-actions"><button class="btn primary" id="fd-qr-close">Đóng</button></div>`);
  $('#fd-qr-close').onclick = closeModal;
  const show = (q, sub) => {
    $('#fd-qr-body').innerHTML = `<img src="${q.qrDataUrl}" alt="Mã QR chuyển khoản vào ${esc(f.name)}">
      <b>${esc(sub)}</b><span class="muted">${esc(q.bank_name || '')} · ${esc(f.bank_account || '')}${q.account_holder ? ' · ' + esc(q.account_holder) : ''}</span>`;
  };
  try { show(await api(`/api/funds/${f.id}/qr`), 'Người chuyển tự nhập số tiền. In ra để dán.'); } catch (e) { $('#fd-qr-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  const amt = $('#fd-qr-amount');
  if (!amt) return;
  bindMoney(amt);
  $('#fd-qr-gen').onclick = async () => {
    const amount = parseMoney(amt.value);
    if (!amount) { toast('Nhập số tiền', true); return; }
    try { show(await api(`/api/funds/${f.id}/qr`, { method: 'POST', body: { amount } }), 'Số tiền ' + money(amount)); } catch (e) { toast(e.message, true); }
  };
}

/* ---------------- Form quỹ ---------------- */
async function openFundForm(f) {
  const isNew = !f;
  const d = f || { kind: 'general', status: 'active' };
  let treasurers = [];
  try { treasurers = await api('/api/fund-treasurers'); } catch { /* không có quyền thì bỏ ô chọn */ }
  const tOpts = '<option value="">Chưa giao (mọi thủ quỹ)</option>' + treasurers.map((t) =>
    `<option value="${t.id}" ${t.id === d.manager_user_id ? 'selected' : ''}>${esc(t.full_name || t.username)}</option>`).join('');
  modal(`<h2>${isNew ? 'Quỹ mới' : 'Sửa quỹ'}</h2>
    <div class="form-grid">
      <label class="fld full">Tên quỹ *<input class="field" id="fd-f-name" value="${esc(d.name || '')}" placeholder="Ví dụ: Công đức tu sửa đình làng"></label>
      ${isNew ? '<label class="fld">Mã quỹ *<input class="field" id="fd-f-code" placeholder="vd: cong-duc-2026" autocapitalize="none"></label>' : ''}
      <label class="fld">Loại<select class="field" id="fd-f-kind">
        <option value="general" ${d.kind === 'general' ? 'selected' : ''}>Quỹ chung</option>
        <option value="donation" ${d.kind === 'donation' ? 'selected' : ''}>Công đức (được công khai)</option></select></label>
      <label class="fld">Thủ quỹ phụ trách<select class="field" id="fd-f-manager">${tOpts}</select></label>
      ${!isNew ? `<label class="fld">Trạng thái<select class="field" id="fd-f-status">
        <option value="active" ${d.status === 'active' ? 'selected' : ''}>Đang hoạt động</option>
        <option value="closed" ${d.status === 'closed' ? 'selected' : ''}>Đã đóng (không nhận thêm)</option></select></label>` : ''}
      <div class="full fd-section">Tài khoản nhận tiền (riêng của quỹ)</div>
      <label class="fld">Số tài khoản<input class="field" id="fd-f-account" inputmode="numeric" value="${esc(d.bank_account || '')}"></label>
      <label class="fld">Mã ngân hàng (BIN)<input class="field" id="fd-f-bin" inputmode="numeric" value="${esc(d.bank_bin || '')}" placeholder="MB: 970422"></label>
      <label class="fld">Tên ngân hàng<input class="field" id="fd-f-bankname" value="${esc(d.bank_name || '')}"></label>
      <label class="fld">Chủ tài khoản<input class="field" id="fd-f-holder" value="${esc(d.account_holder || '')}"></label>
    </div>
    <div class="modal-actions"><button class="btn" id="fd-f-close">Hủy</button><button class="btn primary" id="fd-f-save">Lưu quỹ</button></div>`, { focus: '#fd-f-name' });
  $('#fd-f-close').onclick = closeModal;
  $('#fd-f-save').onclick = async () => {
    const body = {
      name: $('#fd-f-name').value, kind: $('#fd-f-kind').value, bank_account: $('#fd-f-account').value,
      bank_bin: $('#fd-f-bin').value, bank_name: $('#fd-f-bankname').value, account_holder: $('#fd-f-holder').value,
      manager_user_id: $('#fd-f-manager').value || null,
    };
    if (isNew) body.code = $('#fd-f-code').value; else body.status = $('#fd-f-status').value;
    try {
      const saved = await api(isNew ? '/api/funds' : `/api/funds/${f.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast('Đã lưu quỹ'); closeModal();
      activeId = saved.id; await loadFunds();
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------------- Form bút toán ---------------- */
// Ô tiền: gõ số, tự thêm dấu chấm hàng nghìn. allowNeg cho bút toán điều chỉnh.
const parseMoney = (v) => Number(String(v).replace(/[^\d-]/g, '').replace(/(?!^)-/g, '')) || 0;
function bindMoney(el, allowNeg = false) {
  el.addEventListener('input', () => {
    const neg = allowNeg && el.value.trim().startsWith('-');
    const digits = el.value.replace(/\D/g, '');
    el.value = (neg ? '-' : '') + (digits ? nf.format(Number(digits)) : '');
  });
}

// draft: phiếu nháp cần sửa.
async function openEntryForm(f, type, draft) {
  const title = draft ? 'Sửa phiếu ' + draft.code : { in: 'Thu tiền', out: 'Lập phiếu chi', adjust: 'Bút toán điều chỉnh' }[type];
  let refOptions = '';
  if (type === 'adjust' && !draft) {
    const { entries } = await api(`/api/funds/${f.id}/entries?status=approved`);
    if (!entries.length) { toast('Chưa có bút toán đã ghi sổ để điều chỉnh', true); return; }
    refOptions = entries.map((e) => `<option value="${e.id}">${esc(e.code)} · ${esc(who(e) || e.note || '')} · ${money(signed(e))}</option>`).join('');
  }
  const hint = {
    in: 'Khoản thu ghi sổ ngay. Tiền chuyển khoản qua QR tự vào sổ, không cần nhập.',
    out: 'Phiếu chi cần ảnh chứng từ và phải được người duyệt đồng ý mới trừ vào tồn quỹ.',
    adjust: 'Dùng để sửa sai bút toán đã ghi sổ. Nhập số âm để giảm, số dương để tăng. Cần người duyệt.',
  }[type];
  modal(`<h2>${title}</h2>
    <p class="muted fd-form-hint">${hint}</p>
    <label class="fld">Số tiền *<input class="field fd-amount" id="fd-e-amount" inputmode="numeric" autocomplete="off" placeholder="0"
      value="${draft ? (draft.amount < 0 ? '-' : '') + nf.format(Math.abs(draft.amount)) : ''}"></label>
    ${type !== 'adjust' ? `<div class="fd-quick">${QUICK.map((v) => `<button type="button" class="btn sm" data-q="${v}">${shortMoney(v)}</button>`).join('')}</div>` : ''}
    ${type === 'in' ? `<label class="fld">Người nộp<input class="field" id="fd-e-payer" placeholder="Để trống nếu không rõ"></label>
      <label class="chk fd-chk"><input type="checkbox" id="fd-e-anon"> Người nộp xin ẩn danh (trang công khai hiện "Người hảo tâm")</label>` : ''}
    ${type === 'adjust' && !draft ? `<label class="fld">Bút toán cần sửa *<select class="field" id="fd-e-ref">${refOptions}</select></label>` : ''}
    <label class="fld">${type === 'in' ? 'Ghi chú' : type === 'out' ? 'Chi cho việc gì *' : 'Lý do điều chỉnh *'}<input class="field" id="fd-e-note" value="${esc(draft?.note || '')}"></label>
    ${type === 'out' ? `<label class="fd-drop" id="fd-e-drop">
      <input type="file" id="fd-e-file" accept="image/jpeg,image/png,image/webp">
      <span class="fd-drop-img" id="fd-e-preview">${draft?.attachment ? `<img src="/api/fund-entries/${draft.id}/attachment" alt="">` : icon('receipt')}</span>
      <span><b id="fd-e-file-name">${draft?.attachment ? 'Đã có ảnh — bấm để thay' : 'Chụp hoặc chọn ảnh chứng từ'}</b>
      <span class="muted">JPG, PNG hoặc WebP, tối đa 5MB. Bắt buộc trước khi gửi duyệt.</span></span></label>` : ''}
    <div class="modal-actions">
      <button class="btn" id="fd-e-close">Hủy</button>
      ${type === 'in' ? '<button class="btn primary" id="fd-e-save">Ghi sổ</button>'
        : `<button class="btn" id="fd-e-save">Lưu nháp</button><button class="btn primary" id="fd-e-send">Lưu và gửi duyệt</button>`}
    </div>`, { focus: '#fd-e-amount' });
  const amt = $('#fd-e-amount');
  bindMoney(amt, type === 'adjust');
  document.querySelectorAll('.fd-quick [data-q]').forEach((b) => { b.onclick = () => { amt.value = nf.format(Number(b.dataset.q)); amt.focus(); }; });
  const file = $('#fd-e-file');
  if (file) file.onchange = () => {
    const fl = file.files[0]; if (!fl) return;
    if (fl.size > 5 * 1024 * 1024) { toast('Ảnh quá 5MB, chọn ảnh nhỏ hơn', true); file.value = ''; return; }
    $('#fd-e-preview').innerHTML = `<img src="${URL.createObjectURL(fl)}" alt="">`;
    $('#fd-e-file-name').textContent = fl.name;
  };
  $('#fd-e-close').onclick = closeModal;
  const save = async (send) => {
    const body = { amount: parseMoney(amt.value), note: $('#fd-e-note').value };
    if (!body.amount) { toast('Nhập số tiền', true); amt.focus(); return; }
    if (!draft) body.type = type;
    if (type === 'in') { body.payer_name = $('#fd-e-payer').value; body.anonymous = $('#fd-e-anon').checked; body.source = 'cash'; }
    if (type === 'adjust' && !draft) body.ref_entry_id = $('#fd-e-ref').value;
    if (file?.files[0]) body.attachment = await fileToDataUrl(file.files[0]);
    if (send && type === 'out' && !body.attachment && !draft?.attachment) { toast('Cần ảnh chứng từ trước khi gửi duyệt', true); return; }
    try {
      const e = draft ? await api(`/api/fund-entries/${draft.id}`, { method: 'PATCH', body }) : await api(`/api/funds/${f.id}/entries`, { method: 'POST', body });
      if (send) await api(`/api/fund-entries/${e.id}/submit`, { method: 'POST' });
      toast(type === 'in' ? `Đã ghi sổ ${money(e.amount)}` : send ? 'Đã gửi duyệt' : 'Đã lưu nháp');
      closeModal();
      if (type !== 'in') tab = 'todo';
      await loadFunds();
    } catch (err) { toast(err.message, true); }
  };
  $('#fd-e-save').onclick = () => save(false);
  const send = $('#fd-e-send'); if (send) send.onclick = () => save(true);
}
