// Màn hình sổ quỹ (GĐ2.8): chọn quỹ, số liệu nhanh, việc cần làm, sổ thu chi, báo cáo kỳ.
// Bố cục theo việc hằng ngày của thủ quỹ: thu tiền là thao tác chính; duyệt chi gom vào "Việc cần làm".
import { $, esc, nf, money, today, monthStart, modal, closeModal, toast, printHTML, bankField, bankOf, renderAlerts } from '../util.js';
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
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
// Cách đóng; amount = nhãn ô số tiền (không có = không cần mức)
const CONTRIB = {
  household: { label: 'Theo hộ', amount: 'Mức đóng mỗi hộ' },
  person: { label: 'Theo nhân khẩu', amount: 'Mức đóng mỗi người' },
  voluntary: { label: 'Tùy tâm (không quy định mức)' },
  goal: { label: 'Huy động theo mục tiêu', amount: 'Tổng số tiền cần huy động' },
};
const PERIOD = { year: 'mỗi năm', month: 'mỗi tháng' };
const contribText = (f) => {
  const c = CONTRIB[f.contribution] || CONTRIB.household;
  if (!c.amount) return 'Đóng tùy tâm';
  return f.target_amount ? `${c.amount}: ${money(f.target_amount)}${f.contribution !== 'goal' && PERIOD[f.period] ? ' ' + PERIOD[f.period] : ''}` : c.label;
};

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
<div id="fd-alerts"></div>
<div class="fd-chips" id="fd-tabs" role="tablist" aria-label="Chọn quỹ"></div>
<div id="fd-body"><div class="card fd-empty">Đang tải…</div></div>`;
    $('#fd-new-fund').onclick = () => openFundForm(null);
    $('#fd-tabs').onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      activeId = Number(b.dataset.id); tab = null; renderChips(); render();
    };
  },

  async show() { await loadFunds(); await renderAlerts($('#fd-alerts'), api); renderNotices(); },
};

// Báo Admin: quỹ tự ngừng thu khi hết hạn và đề nghị mở khoá sổ đang chờ
async function renderNotices() {
  let list = [];
  try { list = await api('/api/fund-notices'); } catch { return; }
  const auto = list.filter((n) => n.kind === 'auto_stop');
  if (auto.length) $('#fd-alerts').insertAdjacentHTML('beforeend', auto.map((n) => `<div class="alert-bar" role="status"><b>Tự ngừng thu:</b> ${esc(n.message)}
    <span class="muted">· ${esc(n.created_at.slice(0, 16))}</span></div>`).join(''));
}

async function loadFunds() {
  funds = await api('/api/funds');
  $('#fd-new-fund').classList.toggle('hidden', !can('fund.manage'));
  if (!activeId || !funds.some((f) => f.id === activeId)) activeId = funds[0]?.id ?? null;
  renderChips();
  await render();
}

function renderChips() {
  $('#fd-tabs').innerHTML = funds.map((f) => `<button class="fd-chip ${f.id === activeId ? 'active' : ''} ${f.state !== 'collecting' ? 'closed' : ''}"
    role="tab" aria-selected="${f.id === activeId}" data-id="${f.id}">
    <span class="n">${esc(f.name)}</span><span class="b">${f.state === 'collecting' ? '' : esc(f.state_label) + ' · '}${money(f.balance)}</span></button>`).join('');
}

const NATURE = { mandatory: 'Bắt buộc', campaign: 'Vận động', voluntary: 'Tự nguyện' };
const viDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const STATE_BADGE = { collecting: 'paid', stopped: 'pending', locked: 'cancelled' };

// Băng trạng thái: Đang thu (hạn thu) / Ngừng thu (vẫn chi) / Khoá sổ (không thu, không chi)
function stateBanner(f, manage) {
  const inspect = can('fund.inspect');
  if (f.state === 'collecting') {
    const overdue = f.end_date && f.end_date < today();
    return `<div class="card fd-state ${overdue ? 'fd-overdue' : ''}"><span class="badge paid">Đang thu</span>
      ${f.end_date ? `<span>Hạn thu ${viDate(f.end_date)}${overdue ? ' · đã quá hạn, hệ thống sẽ tự ngừng thu' : ''}</span>` : '<span>Chưa đặt hạn thu</span>'}
      ${f.round > 1 ? `<span class="muted">Đợt ${f.round} · nội dung CK ${esc(f.transfer_content)}</span>` : ''}
      ${manage ? '<button class="btn sm" id="fd-stop">Ngừng thu</button>' : ''}</div>`;
  }
  if (f.state === 'stopped') {
    return `<div class="card fd-state fd-stopped"><span class="badge pending">Ngừng thu</span>
      <span>Ngừng thu từ ${viDate((f.stopped_at || '').slice(0, 10))} · vẫn chi</span>
      ${f.stop_note ? `<p>${esc(f.stop_note)}</p>` : ''}
      ${f.unlocked_at ? `<p class="low">Đã mở khoá sổ ngày ${viDate(f.unlocked_at.slice(0, 10))} – lý do: ${esc(f.unlock_reason || '')}</p>` : ''}
      ${manage ? '<button class="btn sm primary" id="fd-resume">Mở thu lại</button>' : ''}
      ${inspect ? '<button class="btn sm" id="fd-lock">Khoá sổ</button>' : ''}</div>`;
  }
  return `<div class="card fd-state fd-closed"><span class="badge cancelled">Khoá sổ</span>
    <span>Không thu, không chi · số dư khi khoá sổ <b>${money(f.lock_balance)}</b></span>
    <span class="muted">${viDate((f.locked_at || '').slice(0, 10))}${f.locked_by_name ? ' · ' + esc(f.locked_by_name) : ''}</span>
    ${f.lock_note ? `<p>${esc(f.lock_note)}</p>` : ''}
    ${f.lock_doc_id ? `<a class="btn sm" href="/api/fund-documents/${f.lock_doc_id}" target="_blank" rel="noopener">Xem biên bản khoá sổ</a>` : ''}
    ${manage || inspect || can('fund.approve') ? '<button class="btn sm" id="fd-unlock">Mở khoá sổ…</button>' : ''}
    ${manage ? '<button class="btn sm" id="fd-clone">Tạo quỹ mới từ quỹ này</button>' : ''}</div>`;
}

function bodyTemplate(f) {
  const collecting = f.state === 'collecting';
  const manage = can('fund.manage');
  // Ngừng thu vẫn chi: thủ quỹ lập phiếu chi / điều chỉnh; thu tiền chỉ khi Đang thu
  const canIn = can('fund.entry') && collecting;
  const canOut = can('fund.entry') && f.state !== 'locked';
  const entry = canOut;
  return `
${stateBanner(f, manage)}
<div class="fd-meta muted">
  <span class="badge ${f.kind === 'donation' ? 'sale' : ''}">${esc(f.fund_type || (f.kind === 'donation' ? 'Công đức' : 'Quỹ chung'))}</span>
  ${f.nature ? `<span class="badge">${NATURE[f.nature]}</span>` : ''}
  ${f.category ? `<span class="badge">${esc(f.category)}</span>` : ''}
  ${f.is_public ? '<span class="badge paid">Công khai</span>' : ''}
  <span>Phụ trách: ${esc(f.manager_name || 'chưa giao')}</span>
  <span>${f.bank_account ? `TK ${esc(f.bank_account)}${f.bank_name ? ' · ' + esc(f.bank_name) : ''}` : 'Chưa khai tài khoản nhận'}</span>
  <span>${esc(contribText(f))}</span>
</div>
<div class="stats fd-stats">
  <div class="stat primary"><div class="k">Tồn quỹ</div><div class="v">${money(f.balance)}</div></div>
  <div class="stat ok"><div class="k">Thu tháng này</div><div class="v" id="fd-m-in">…</div></div>
  <div class="stat danger"><div class="k">Chi tháng này</div><div class="v" id="fd-m-out">…</div></div>
  <div class="stat warn"><div class="k">Việc cần làm</div><div class="v" id="fd-m-todo">…</div></div>
</div>
<div class="toolbar fd-actions">
  ${canIn ? '<button class="btn primary fd-desk" id="fd-in">+ Thu tiền</button>' : ''}
  ${canOut ? '<button class="btn fd-desk" id="fd-out">+ Lập phiếu chi</button>' : ''}
  ${collecting ? `<button class="btn" id="fd-qr">${icon('card')} QR nhận tiền</button>
  <button class="btn" id="fd-share">Chia sẻ / nhắc đóng quỹ</button>` : ''}
  <button class="btn" id="fd-docs">Nội dung &amp; tài liệu</button>
  ${entry || manage ? `<details class="fd-menu"><summary class="btn" aria-label="Thao tác khác">Thêm ▾</summary><div>
    ${canIn ? '<button class="mi" id="fd-import">Nhập khoản thu từ Excel</button>' : ''}
    ${canOut ? '<button class="mi" id="fd-adjust">Lập bút toán điều chỉnh</button>' : ''}
    ${manage && f.state !== 'locked' ? '<button class="mi" id="fd-edit-fund">Sửa thông tin quỹ</button>' : ''}
    ${manage ? '<button class="mi" id="fd-clone-2">Tạo quỹ mới từ quỹ này</button>' : ''}
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
  <div class="card fd-recon">
    <h3>Đối soát sao kê ngân hàng</h3>
    <p class="muted fd-form-hint">So tổng tiền vào trên sao kê của kỳ đang chọn với tiền vào qua ngân hàng đã ghi sổ (không tính tiền mặt).
      Lệch thì bổ sung khoản thiếu bằng "Thu tiền" (chuyển khoản, có mã giao dịch) rồi đối soát lại.</p>
    <div class="fd-recon-row">
      <div><span class="muted">Hệ thống ghi nhận</span><b id="fd-rc-sys">…</b></div>
      <label class="fld">Tổng tiền vào theo sao kê<input class="field fd-amount" id="fd-rc-stmt" inputmode="numeric" autocomplete="off" placeholder="0"></label>
      <div><span class="muted">Chênh lệch</span><b id="fd-rc-diff">—</b></div>
    </div>
    <label class="fld" id="fd-rc-note-wrap" hidden>Nguyên nhân chênh lệch *<input class="field" id="fd-rc-note" placeholder="Ví dụ: thiếu khoản 20.000 ngày 01, sẽ bổ sung"></label>
    ${can('fund.entry') ? '<div class="toolbar"><button class="btn primary" id="fd-rc-save">Lưu biên bản đối soát</button></div>' : ''}
    <div id="fd-rc-history"></div>
  </div>
</section>
${entry ? `<div class="fd-bar">${canIn ? '<button class="btn primary" id="fd-in-m">+ Thu tiền</button>' : ''}<button class="btn" id="fd-out-m">+ Phiếu chi</button></div>` : ''}`;
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
  on('fd-share', () => openShare(f));
  on('fd-edit-fund', () => { $('.fd-menu').open = false; openFundForm(f); });
  on('fd-adjust', () => { $('.fd-menu').open = false; openEntryForm(f, 'adjust'); });
  on('fd-import', () => { $('.fd-menu').open = false; openImport(f); });
  on('fd-stop', () => openStop(f));
  on('fd-resume', () => openResume(f));
  on('fd-lock', () => openLock(f));
  on('fd-unlock', () => openUnlock(f));
  on('fd-clone', () => cloneFund(f));
  on('fd-clone-2', () => { $('.fd-menu').open = false; cloneFund(f); });
  on('fd-docs', () => openDocs(f));
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
  // GĐ3.2: tiền vào tài khoản quỹ nhưng chưa ghi được sổ (quỹ đóng, không rõ quỹ…) chờ thủ quỹ phân loại.
  // Hàng chờ chung của cộng đồng nên hiện ở mọi quỹ.
  let queue = [];
  if (can('fund.entry')) { try { queue = (await api('/api/vietqr/unclassified')).items; } catch { queue = []; } }
  todo = [...drafts, ...submitted];
  const actionable = queue.length + drafts.length + (can('fund.approve') ? submitted.filter((e) => e.created_by !== auth.user.id).length : 0);
  $('#fd-m-todo').textContent = actionable ? `${actionable} việc` : 'Không có';
  $('#fd-todo-count').textContent = actionable || '';
  $('#fd-pending-body').innerHTML = queue.map(queueCard).join('') + todo.map(taskCard).join('') || `<div class="card fd-empty">
    <p><b>Không có việc cần làm.</b></p>
    <p class="muted">${can('fund.approve') ? 'Khoản chi do thủ quỹ gửi sẽ hiện ở đây để bạn duyệt.' : 'Phiếu chi nháp, khoản đang chờ duyệt và tiền vào chưa rõ quỹ sẽ hiện ở đây.'}</p></div>`;
  $('#fd-pending-body').onclick = (ev) => {
    const q = ev.target.closest('[data-queue]');
    if (q) return openQueueClassify(queue.find((x) => String(x.id) === q.dataset.queue), f);
    const b = ev.target.closest('[data-act]'); if (!b) return;
    taskAction(f, b.dataset.act, todo.find((x) => String(x.id) === b.dataset.id));
  };
}

function queueCard(t) {
  return `<div class="fd-task">
    <div class="fd-task-main">
      <div class="fd-task-amt">${signedMoney(t.amount)}</div>
      <div>${esc(t.content || 'Chuyển khoản không có nội dung')}</div>
      <div class="meta">VietQR · ${esc(t.transactionid)} · TK ${esc(t.bank_account || '')} · ${esc((t.created_at || '').slice(0, 16))}${t.age_days ? ` · đã ${t.age_days} ngày` : ''}</div>
    </div>
    <div class="fd-task-side"><span class="badge pending">Tiền vào chưa rõ quỹ</span>
      <div class="acts"><button class="btn primary" data-queue="${t.id}">Ghi vào quỹ</button></div></div>
  </div>`;
}

function openQueueClassify(t, current) {
  if (!t) return;
  const active = funds.filter((x) => x.status === 'active');
  modal(`<h2>Ghi tiền vào quỹ</h2>
    <p class="muted" style="margin:-8px 0 14px">${money(t.amount)} · ${esc(t.transactionid)} · ${esc((t.created_at || '').slice(0, 16))}<br>Nội dung: ${esc(t.content || '—')}</p>
    <label class="fld">Quỹ nhận *<select class="field" id="fd-q-fund">${active.map((x) => `<option value="${x.id}" ${x.id === current.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <p class="muted" style="font-size:12.5px">Ghi xong là khoản thu đã ghi sổ, không đổi quỹ được nữa. Sai thì lập bút toán điều chỉnh.</p>
    <div class="modal-actions"><button class="btn" id="fd-q-cancel">Hủy</button><button class="btn primary" id="fd-q-ok">Ghi sổ</button></div>`);
  $('#fd-q-cancel').onclick = closeModal;
  $('#fd-q-ok').onclick = async () => {
    try {
      await api(`/api/vietqr/transactions/${t.id}/classify`, { method: 'POST', body: { fund_id: Number($('#fd-q-fund').value) } });
      toast(`Đã ghi ${money(t.amount)} vào quỹ`); closeModal(); await loadFunds();
    } catch (e) { toast(e.message, true); }
  };
}

function taskCard(e) {
  const mine = e.created_by === auth.user.id;
  const closed = funds.find((x) => x.id === e.fund_id)?.state === 'locked';
  const missing = e.type === 'out' && !e.attachment;
  let acts = '';
  let state = '';
  if (closed) {
    state = '<span class="badge">Quỹ đã khoá sổ</span>';
  } else if (e.status === 'draft') {
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
    ${row('Xóm / địa chỉ', esc(e.payer_group || ''))}
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
    await loadReconcile(fundId, from, to);
  } catch (e) { toast(e.message, true); }
}

/* ---------------- Đối soát sao kê (GĐ3.6) ---------------- */
// Lệch khác 0 luôn là việc cần xử lý (sổ thiếu hoặc thừa so với sao kê), nên hiện màu cảnh báo chứ không xanh / đỏ.
const diffMoney = (d) => (d === 0 ? '<span class="fd-pos">Khớp</span>' : `<b class="fd-diff">${d > 0 ? 'Sổ thiếu ' : 'Sổ thừa '}${money(Math.abs(d))}</b>`);
async function loadReconcile(fundId, from, to) {
  const rc = await api(`/api/funds/${fundId}/reconcile?from=${from}&to=${to}`);
  $('#fd-rc-sys').textContent = money(rc.system_in) + ` (${rc.count} khoản)`;
  const stmt = $('#fd-rc-stmt');
  const update = () => {
    const v = stmt.value.trim() ? parseMoney(stmt.value) : null;
    const diff = v === null ? null : v - rc.system_in;
    $('#fd-rc-diff').innerHTML = diff === null ? '—' : diffMoney(diff);
    $('#fd-rc-note-wrap').hidden = !diff;
  };
  if (!stmt.dataset.bound) { bindMoney(stmt); stmt.dataset.bound = '1'; }
  stmt.oninput = update; update();
  const save = $('#fd-rc-save');
  if (save) save.onclick = async () => {
    if (!stmt.value.trim()) { toast('Nhập tổng tiền vào theo sao kê', true); stmt.focus(); return; }
    try {
      const r = await api(`/api/funds/${fundId}/reconciliations`, { method: 'POST', body: { from, to, statement_in: parseMoney(stmt.value), note: $('#fd-rc-note').value } });
      toast(r.diff ? `Đã lưu biên bản, lệch ${money(r.diff)}` : 'Đã lưu biên bản: khớp');
      stmt.value = ''; $('#fd-rc-note').value = ''; await loadReconcile(fundId, from, to);
    } catch (e) { toast(e.message, true); }
  };
  $('#fd-rc-history').innerHTML = rc.history.length ? `<div class="tbl-wrap"><table class="grid"><thead><tr>
      <th>Kỳ</th><th class="r">Sao kê</th><th class="r">Hệ thống</th><th class="r">Chênh</th><th>Ghi chú</th><th>Người lập</th></tr></thead><tbody>
      ${rc.history.map((h) => `<tr><td class="nw">${esc(h.period_from)} → ${esc(h.period_to)}</td><td class="r nw">${money(h.statement_in)}</td>
        <td class="r nw">${money(h.system_in)}</td><td class="r">${diffMoney(h.diff)}</td>
        <td class="muted">${esc(h.note || '')}</td><td class="muted">${esc(h.created_by_name || '')} · ${esc((h.created_at || '').slice(0, 16))}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted fd-hint">Chưa có biên bản đối soát nào.</p>';
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

/* ---------------- Chia sẻ / nhắc đóng quỹ ---------------- */
async function openShare(f) {
  let link;
  try { link = await api('/api/community/public-link'); } catch (e) { toast(e.message, true); return; }
  if (!link.enabled) {
    modal(`<h2>Chia sẻ đợt thu</h2>
      <p class="muted">Cộng đồng chưa bật trang công khai cho người nộp. Nhờ quản trị nền tảng bật
        <b>Công khai đợt thu &amp; công đức</b> ở màn Cộng đồng, sau đó thử lại.</p>
      <div class="modal-actions"><button class="btn primary" id="fd-sh-close">Đóng</button></div>`);
    $('#fd-sh-close').onclick = closeModal;
    return;
  }
  const url = location.origin + link.url + '#fund-' + f.id;
  const bits = [`Thông báo thu quỹ "${f.name}"${f.category ? ` (${f.category})` : ''}.`];
  bits.push(contribText(f) + '.');
  if (f.end_date) bits.push(`Hạn đóng: ${f.end_date}.`);
  if (f.bank_account) bits.push(`Chuyển khoản: ${f.bank_account}${f.bank_name ? ' - ' + f.bank_name : ''}${f.account_holder ? ' - ' + f.account_holder : ''}.`);
  bits.push(`Xem và quét mã tại: ${url}`);
  const message = bits.join(' ');
  modal(`<h2>Chia sẻ / nhắc đóng quỹ</h2>
    <p class="muted fd-form-hint">Sao chép nội dung dưới đây gửi vào nhóm Zalo / loa truyền thanh. Người dân mở link để xem QR và số tiền đã đóng.</p>
    <label class="fld">Nội dung nhắc<textarea class="field fd-textarea" id="fd-sh-msg" rows="5">${esc(message)}</textarea></label>
    <label class="fld">Link trang người nộp<input class="field" id="fd-sh-url" readonly value="${esc(url)}"></label>
    <div class="modal-actions"><button class="btn" id="fd-sh-open">Mở trang</button>
      <button class="btn primary" id="fd-sh-copy">Sao chép nội dung</button>
      <button class="btn" id="fd-sh-close">Đóng</button></div>`);
  $('#fd-sh-close').onclick = closeModal;
  $('#fd-sh-open').onclick = () => window.open(url, '_blank', 'noopener');
  $('#fd-sh-copy').onclick = async () => {
    const text = $('#fd-sh-msg').value;
    try {
      await navigator.clipboard.writeText(text);
      toast('Đã sao chép nội dung nhắc');
    } catch {
      $('#fd-sh-msg').select(); toast('Trình duyệt không cho sao chép, hãy bấm Ctrl+C', true);
    }
  };
}

/* ---------------- Vòng đời quỹ: Ngừng thu / Mở thu lại / Khoá sổ / Mở khoá ---------------- */
const fileOf = async (input) => (input.files[0] ? { name: input.files[0].name, data: await fileToDataUrl(input.files[0]) } : null);
const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp';
const sumRow = (k, v) => `<div><span class="muted">${k}</span><b>${v}</b></div>`;
async function summaryBlock(f) {
  const s = await api(`/api/funds/${f.id}/summary`);
  return { s, html: `<div class="fd-recon-row fd-sum">${sumRow('Đã thu', money(s.total_in))}${sumRow('Đã chi', money(s.total_out))}
    ${sumRow('Số dư', money(s.balance))}${sumRow('Lượt đóng góp', nf.format(s.donors))}${s.progress != null ? sumRow('Đạt mục tiêu', s.progress + '%') : ''}</div>` };
}
async function act(url, body, msg) {
  try { await api(url, { method: 'POST', body }); toast(msg); closeModal(); await loadFunds(); } catch (e) { toast(e.message, true); }
}

async function openStop(f) {
  let b; try { b = await summaryBlock(f); } catch (e) { toast(e.message, true); return; }
  modal(`<h2>Ngừng thu — ${esc(f.name)}</h2>${b.html}
    <p class="muted fd-form-hint">Sau khi ngừng thu: không nhận tiền, không tạo QR. Vẫn lập và duyệt phiếu chi. Mở thu lại được khi cần gia hạn hoặc thu bổ sung.
      Hết hạn thu thì hệ thống tự ngừng thu.</p>
    <label class="fld">Ghi chú (không bắt buộc)<input class="field" id="fd-st-note" placeholder="Ví dụ: Đã đủ chỉ tiêu"></label>
    <div class="modal-actions"><button class="btn" id="fd-st-cancel">Hủy</button><button class="btn danger" id="fd-st-save">Ngừng thu</button></div>`);
  $('#fd-st-cancel').onclick = closeModal;
  $('#fd-st-save').onclick = () => act(`/api/funds/${f.id}/stop`, { note: $('#fd-st-note').value }, 'Đã ngừng thu ' + f.name);
}

function openResume(f) {
  modal(`<h2>Mở thu lại — ${esc(f.name)}</h2>
    <p class="muted fd-form-hint">Tạo đợt thu mới (đợt ${f.round + 1}) với mã QR và nội dung chuyển khoản mới. QR đợt cũ hết hiệu lực: ai quét mã cũ,
      tiền vào mục chưa phân loại để thủ quỹ xử lý, không nộp nhầm. Người dân thấy thông báo mở thu lại trên trang công khai.</p>
    <label class="fld">Hạn thu mới *<input class="field" type="date" id="fd-rs-date" min="${today()}"></label>
    <label class="fld">Lý do *<input class="field" id="fd-rs-reason" placeholder="Ví dụ: Gia hạn cho các hộ còn thiếu"></label>
    <div class="modal-actions"><button class="btn" id="fd-rs-cancel">Hủy</button><button class="btn primary" id="fd-rs-save">Mở thu lại</button></div>`, { focus: '#fd-rs-date' });
  $('#fd-rs-cancel').onclick = closeModal;
  $('#fd-rs-save').onclick = () => act(`/api/funds/${f.id}/resume`, { end_date: $('#fd-rs-date').value, reason: $('#fd-rs-reason').value }, 'Đã mở thu lại');
}

// Khoá sổ: Ban kiểm tra xác nhận, kèm biên bản. Chốt cuối: không thu, không chi.
async function openLock(f) {
  let b; try { b = await summaryBlock(f); } catch (e) { toast(e.message, true); return; }
  const { s } = b;
  const blockers = [s.pending && `Còn ${s.pending} phiếu nháp / chờ duyệt`, s.out_no_receipt && `Còn ${s.out_no_receipt} khoản chi thiếu chứng từ`].filter(Boolean);
  modal(`<h2>Khoá sổ — ${esc(f.name)}</h2>${b.html}
    ${blockers.length ? `<p class="low">${blockers.join('. ')}. Xử lý xong mới khoá sổ được.</p>` : ''}
    <p class="muted fd-form-hint">Khoá sổ là chốt sổ cuối: không thu, không chi, không sửa. Chỉ mở lại khi có sai sót, cần Trưởng thôn và Trưởng ban kiểm tra cùng duyệt.
      Thu cho năm / đợt sau thì tạo quỹ mới.</p>
    ${s.balance ? `<label class="fld">Xử lý số dư ${money(s.balance)} *<input class="field" id="fd-lk-balance" placeholder="Ví dụ: Kết chuyển sang Quỹ chung theo biên bản họp ngày …"></label>` : ''}
    <label class="fld">Ghi chú<input class="field" id="fd-lk-note"></label>
    <label class="fld">Biên bản khoá sổ * (PDF, ảnh, Word)<input class="field" type="file" id="fd-lk-file" accept="${DOC_ACCEPT}"></label>
    <div class="modal-actions"><button class="btn" id="fd-lk-cancel">Hủy</button>
      <button class="btn danger" id="fd-lk-save" ${blockers.length ? 'disabled' : ''}>Xác nhận khoá sổ</button></div>`);
  $('#fd-lk-cancel').onclick = closeModal;
  $('#fd-lk-save').onclick = async () => {
    const minutes = await fileOf($('#fd-lk-file'));
    if (!minutes) { toast('Đính kèm biên bản khoá sổ', true); return; }
    act(`/api/funds/${f.id}/lock`, { minutes, note: $('#fd-lk-note').value, balance_note: $('#fd-lk-balance')?.value }, 'Đã khoá sổ ' + f.name);
  };
}

// Mở khoá sổ: lập đề nghị (lý do + biên bản) rồi Trưởng thôn và Trưởng ban kiểm tra cùng duyệt
async function openUnlock(f) {
  let reqs = [];
  try { reqs = await api(`/api/funds/${f.id}/unlock-requests`); } catch (e) { toast(e.message, true); return; }
  const pending = reqs.find((r) => r.status === 'pending');
  const sign = (who, at) => (at ? `<b>${esc(who)}</b> <span class="muted">${esc(at.slice(0, 16))}</span>` : '<span class="muted">chưa duyệt</span>');
  const canSign = pending && ((can('fund.inspect') && !pending.inspector_id) || (can('fund.approve') && !pending.approver_id))
    && pending.approver_id !== auth.user.id && pending.inspector_id !== auth.user.id;
  modal(`<h2>Mở khoá sổ — ${esc(f.name)}</h2>
    ${pending ? `<p>Đề nghị của <b>${esc(pending.requested_by_name || '')}</b> ngày ${esc(pending.created_at.slice(0, 10))}: ${esc(pending.reason)}</p>
      <p><a href="/api/fund-documents/${pending.doc_id}" target="_blank" rel="noopener">Xem biên bản mở khoá</a></p>
      <div class="fd-recon-row fd-sum"><div><span class="muted">Trưởng thôn</span>${sign(pending.approver_name, pending.approver_at)}</div>
        <div><span class="muted">Trưởng ban kiểm tra</span>${sign(pending.inspector_name, pending.inspector_at)}</div></div>
      ${canSign ? `<label class="fld">Lý do (nếu từ chối)<input class="field" id="fd-ul-rej"></label>` : ''}
      <div class="modal-actions"><button class="btn" id="fd-ul-cancel">Đóng</button>
        ${canSign ? '<button class="btn danger" id="fd-ul-reject">Từ chối</button><button class="btn primary" id="fd-ul-sign">Duyệt mở khoá</button>' : ''}</div>`
    : `<p class="muted fd-form-hint">Chỉ mở khoá khi có sai sót (ví dụ ghi nhầm số tiền). Cần lý do, biên bản, và Trưởng thôn + Trưởng ban kiểm tra cùng duyệt.
        Quỹ mở về trạng thái Ngừng thu; sửa sai bằng bút toán điều chỉnh, không sửa / xoá giao dịch cũ. Trang công khai hiện dòng "Đã mở khoá sổ ngày … – lý do …".</p>
      <label class="fld">Lý do (sai sót gì) *<input class="field" id="fd-ul-reason"></label>
      <label class="fld">Biên bản mở khoá * (PDF, ảnh, Word)<input class="field" type="file" id="fd-ul-file" accept="${DOC_ACCEPT}"></label>
      <div class="modal-actions"><button class="btn" id="fd-ul-cancel">Hủy</button><button class="btn primary" id="fd-ul-send">Gửi đề nghị</button></div>`}`);
  $('#fd-ul-cancel').onclick = closeModal;
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('fd-ul-send', async () => {
    const minutes = await fileOf($('#fd-ul-file'));
    if (!minutes) { toast('Đính kèm biên bản mở khoá', true); return; }
    act(`/api/funds/${f.id}/unlock-requests`, { reason: $('#fd-ul-reason').value, minutes }, 'Đã gửi đề nghị mở khoá');
  });
  on('fd-ul-sign', () => act(`/api/fund-requests/${pending.id}/approve`, {}, 'Đã duyệt'));
  on('fd-ul-reject', () => act(`/api/fund-requests/${pending.id}/reject`, { reason: $('#fd-ul-rej').value }, 'Đã từ chối đề nghị'));
}

async function cloneFund(f) {
  const name = prompt('Tên quỹ mới (chép loại, tính chất, cách đóng, nội dung; tài khoản nhận cần khai mới):', f.name.replace(/\b20\d\d\b/, (y) => Number(y) + 1));
  if (!name) return;
  try {
    const g = await api(`/api/funds/${f.id}/clone`, { method: 'POST', body: { name } });
    toast('Đã tạo ' + g.name); activeId = g.id; await loadFunds(); openFundForm(funds.find((x) => x.id === g.id));
  } catch (e) { toast(e.message, true); }
}

/* ---------------- Nội dung & tài liệu ---------------- */
async function openDocs(f) {
  let docs = [];
  try { docs = await api(`/api/funds/${f.id}/documents`); } catch (e) { toast(e.message, true); return; }
  const edit = can('fund.manage') && f.state !== 'locked';
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB');
  modal(`<h2>Nội dung &amp; tài liệu — ${esc(f.name)}</h2>
    ${f.content ? `<div class="fd-content">${esc(f.content)}</div>` : '<p class="muted">Chưa có nội dung chi tiết. Nhập ở "Sửa thông tin quỹ".</p>'}
    <h3>Tài liệu đính kèm</h3>
    <ul class="fd-docs">${docs.map((d) => `<li><a href="/api/fund-documents/${d.id}" target="_blank" rel="noopener">${esc(d.name)}</a>
      <span class="muted">${d.kind === 'minutes' ? 'Biên bản · ' : ''}${kb(d.size)} · ${esc(d.created_at.slice(0, 10))}</span>
      ${edit && d.kind === 'doc' ? `<button class="btn sm danger" data-del="${d.id}">Gỡ</button>` : ''}</li>`).join('') || '<li class="muted">Chưa có tài liệu</li>'}</ul>
    ${edit ? `<label class="fld">Thêm tài liệu (PDF, ảnh, Word, Excel, tối đa 10MB)<input class="field" type="file" id="fd-dc-file" accept="${DOC_ACCEPT}"></label>` : ''}
    <div class="modal-actions"><button class="btn" id="fd-dc-close">Đóng</button></div>`);
  $('#fd-dc-close').onclick = closeModal;
  const file = $('#fd-dc-file');
  if (file) file.onchange = async () => {
    try { await api(`/api/funds/${f.id}/documents`, { method: 'POST', body: await fileOf(file) }); toast('Đã thêm tài liệu'); openDocs(f); } catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll('.fd-docs [data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Gỡ tài liệu này khỏi quỹ?')) return;
      try { await api('/api/fund-documents/' + b.dataset.del, { method: 'DELETE' }); openDocs(f); } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------------- Nhập khoản thu từ Excel / CSV ---------------- */
// Kiểm file trước (dry), báo lỗi từng dòng; chỉ ghi sổ khi cả file hợp lệ.
function openImport(f) {
  modal(`<h2>Nhập khoản thu từ Excel</h2>
    <p class="muted fd-form-hint">Dùng cho khoản thu ghi tay trong sổ giấy hoặc tiền chuyển khoản lấy từ sao kê.
      Tải file mẫu, điền mỗi khoản một dòng (Ngày, Người nộp, Số tiền, Hình thức: Tiền mặt / Chuyển khoản, Mã giao dịch, Ghi chú) rồi chọn file.</p>
    <a class="btn" href="/api/funds/${f.id}/import-template" download>Tải file mẫu</a>
    <label class="fld" style="margin-top:12px">File Excel (.xlsx) hoặc CSV<input class="field" type="file" id="fd-im-file" accept=".xlsx,.csv"></label>
    <div id="fd-im-result"></div>
    <div class="modal-actions"><button class="btn" id="fd-im-close">Hủy</button><button class="btn primary" id="fd-im-save" disabled>Ghi sổ</button></div>`);
  let file = null;
  const send = (dry) => api(`/api/funds/${f.id}/import${dry ? '?dry=1' : ''}`, { method: 'POST', body: { file } });
  $('#fd-im-close').onclick = closeModal;
  $('#fd-im-file').onchange = async (e) => {
    const fl = e.target.files[0]; if (!fl) return;
    $('#fd-im-save').disabled = true;
    try {
      file = await fileToDataUrl(fl);
      const r = await send(true);
      $('#fd-im-result').innerHTML = r.errors.length
        ? `<p class="low">Có ${r.errors.length} dòng lỗi, chưa ghi gì. Sửa file rồi chọn lại:</p><ul>${r.errors.slice(0, 30).map((x) => `<li>Dòng ${x.line}: ${esc(x.error)}</li>`).join('')}</ul>`
        : `<p>${r.count} khoản thu, tổng <b>${money(r.total)}</b>. Bấm Ghi sổ để nhập.</p>`;
      $('#fd-im-save').disabled = !!r.errors.length;
    } catch (er) { $('#fd-im-result').innerHTML = `<p class="low">${esc(er.message)}</p>`; }
  };
  $('#fd-im-save').onclick = async () => {
    $('#fd-im-save').disabled = true;
    try {
      const r = await send(false);
      toast(`Đã ghi sổ ${r.imported} khoản thu, tổng ${money(r.total)}`);
      closeModal(); await loadFunds();
    } catch (er) { toast(er.message, true); $('#fd-im-save').disabled = false; }
  };
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
  const d = f || { status: 'active', contribution: 'household' };
  let treasurers = [];
  try { treasurers = await api('/api/fund-treasurers'); } catch { /* không có quyền thì bỏ ô chọn */ }
  const settings = await api('/api/settings');
  // Mỗi dòng loại quỹ trong Cài đặt: "Tên loại | Tính chất" (tính chất không bắt buộc), vd "Quỹ quốc phòng – an ninh | Bắt buộc"
  const typeNature = Object.fromEntries(lines(settings.fund_types).map((l) => {
    const [name, nat] = l.split('|').map((x) => x.trim());
    return [name, Object.keys(NATURE).find((k) => NATURE[k].toLowerCase() === String(nat || '').toLowerCase()) || ''];
  }));
  const types = Object.keys(typeNature);
  const groups = lines(settings.fund_groups);
  // Quỹ cũ có loại / phạm vi không còn trong danh sách vẫn giữ được giá trị đang lưu
  const options = (list, cur) => [...new Set([...list, ...(cur ? [cur] : [])])]
    .map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const tOpts = '<option value="">Chưa giao (mọi thủ quỹ)</option>' + treasurers.map((t) =>
    `<option value="${t.id}" ${t.id === d.manager_user_id ? 'selected' : ''}>${esc(t.full_name || t.username)}</option>`).join('');
  modal(`<h2>${isNew ? 'Quỹ mới' : 'Sửa quỹ'}</h2>
    <div class="form-grid">
      <label class="fld full">Tên quỹ *<input class="field" id="fd-f-name" value="${esc(d.name || '')}" placeholder="Ví dụ: Công đức tu sửa đình làng"></label>
      <label class="fld">Loại quỹ<select class="field" id="fd-f-type">${options(types, d.fund_type)}</select>
        <span class="muted fd-field-hint">Thêm loại quỹ khác trong Cài đặt.</span></label>
      <label class="fld">Tính chất<select class="field" id="fd-f-nature"><option value="">— Chọn —</option>${Object.entries(NATURE).map(([k, v]) =>
        `<option value="${k}" ${k === d.nature ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <span class="muted fd-field-hint">Bắt buộc: theo nghị quyết / quy định. Vận động: kêu gọi đóng góp. Tự nguyện: tùy tâm.</span></label>
      <label class="fld">Phạm vi thu<select class="field" id="fd-f-category">${options(['Cả thôn', ...groups], d.category || 'Cả thôn')}</select>
        <span class="muted fd-field-hint">${groups.length ? '' : 'Khai báo xóm, đoàn thể trong Cài đặt để chọn ở đây.'}</span></label>
      <label class="fld">Cách đóng<select class="field" id="fd-f-contrib">${Object.entries(CONTRIB).map(([k, v]) =>
        `<option value="${k}" ${k === (d.contribution || 'household') ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="fld" id="fd-f-target-wrap"><span id="fd-f-target-label"></span><input class="field fd-amount" id="fd-f-target" inputmode="numeric" autocomplete="off" placeholder="0"
        value="${d.target_amount ? nf.format(d.target_amount) : ''}"></label>
      <label class="fld" id="fd-f-period-wrap">Chu kỳ đóng<select class="field" id="fd-f-period"><option value="">Một lần cho đợt thu</option>${Object.entries(PERIOD).map(([k, v]) =>
        `<option value="${k}" ${k === d.period ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label>
      <label class="fld">Đơn vị quản lý<input class="field" id="fd-f-managed" maxlength="120" value="${esc(d.managed_by || '')}" placeholder="Ban quản lý thôn, Hội Khuyến học…"></label>
      <label class="fld">Bắt đầu thu<input class="field" id="fd-f-start" type="date" value="${esc(d.start_date || '')}"></label>
      <label class="fld">Hạn thu<input class="field" id="fd-f-end" type="date" value="${esc(d.end_date || '')}">
        <span class="muted fd-field-hint">Hết hạn thì hệ thống tự chuyển Ngừng thu.</span></label>
      <label class="fld">Mã nội dung chuyển khoản<input class="field" id="fd-f-tcode" maxlength="18" value="${esc(d.transfer_code || '')}" placeholder="Tự tạo, vd AN26">
        <span class="muted fd-field-hint">Mở thu lại sẽ thêm số đợt, vd AN26-D2.</span></label>
      <label class="fld full">Nội dung chi tiết<textarea class="field fd-textarea" id="fd-f-content" rows="5" placeholder="Mục đích, căn cứ (nghị quyết, tờ trình), đối tượng, mức đóng, cách thức nộp…">${esc(d.content || '')}</textarea>
        <span class="muted fd-field-hint">Văn bản, tờ trình, ảnh đính kèm thêm ở nút "Nội dung &amp; tài liệu" sau khi lưu.</span></label>
      <label class="chk full"><input type="checkbox" id="fd-f-public" ${d.is_public ? 'checked' : ''}> Công khai trên trang người nộp (ai có link đều xem được khoản thu)</label>
      <label class="fld">Thủ quỹ phụ trách<select class="field" id="fd-f-manager">${tOpts}</select>
        <span class="muted fd-field-hint" id="fd-f-manager-hint"></span></label>
      <div class="full fd-section">Tài khoản nhận tiền (riêng của quỹ)</div>
      <label class="fld">Số tài khoản<input class="field" id="fd-f-account" inputmode="numeric" value="${esc(d.bank_account || '')}"></label>
      <label class="fld">Ngân hàng${bankField('fd-f-bin', d.bank_bin, d.bank_name)}</label>
      <label class="fld">Chủ tài khoản<input class="field" id="fd-f-holder" value="${esc(d.account_holder || '')}"></label>
    </div>
    <div class="modal-actions"><button class="btn" id="fd-f-close">Hủy</button><button class="btn primary" id="fd-f-save">Lưu quỹ</button></div>`, { focus: '#fd-f-name' });
  // Nhắc khi có từ 2 thủ quỹ mà quỹ chưa giao ai (BR-08)
  const hint = () => {
    $('#fd-f-manager-hint').textContent = !$('#fd-f-manager').value && treasurers.length > 1
      ? `Quỹ chưa giao: cả ${treasurers.length} thủ quỹ đều xem và nhập được.` : '';
  };
  $('#fd-f-manager').onchange = hint; hint();
  const contrib = () => {
    const c = CONTRIB[$('#fd-f-contrib').value];
    $('#fd-f-target-wrap').hidden = !c.amount;
    $('#fd-f-period-wrap').hidden = !c.amount || $('#fd-f-contrib').value === 'goal';
    $('#fd-f-target-label').textContent = c.amount || '';
  };
  $('#fd-f-contrib').onchange = contrib; contrib();
  // Chọn loại quỹ thì gợi ý tính chất theo Cài đặt (vẫn đổi được)
  $('#fd-f-type').onchange = () => { const n = typeNature[$('#fd-f-type').value]; if (n) $('#fd-f-nature').value = n; };
  if (isNew) $('#fd-f-type').onchange();
  bindMoney($('#fd-f-target'));
  $('#fd-f-close').onclick = closeModal;
  $('#fd-f-save').onclick = async () => {
    const bank = bankOf($('#fd-f-bin').value);
    if (bank === undefined) { toast('Chọn ngân hàng trong danh sách gợi ý', true); $('#fd-f-bin').focus(); return; }
    const body = {
      name: $('#fd-f-name').value, fund_type: $('#fd-f-type').value, bank_account: $('#fd-f-account').value,
      category: $('#fd-f-category').value, contribution: $('#fd-f-contrib').value,
      target_amount: CONTRIB[$('#fd-f-contrib').value].amount ? parseMoney($('#fd-f-target').value) || null : null,
      is_public: $('#fd-f-public').checked ? 1 : 0,
      start_date: $('#fd-f-start').value || null, end_date: $('#fd-f-end').value || null,
      bank_bin: bank ? bank[0] : '', bank_name: bank ? bank[1] : '', account_holder: $('#fd-f-holder').value,
      manager_user_id: $('#fd-f-manager').value || null,
      nature: $('#fd-f-nature').value || null, managed_by: $('#fd-f-managed').value,
      period: ['household', 'person'].includes($('#fd-f-contrib').value) ? $('#fd-f-period').value || null : null, content: $('#fd-f-content').value, transfer_code: $('#fd-f-tcode').value,
    };
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
    in: 'Khoản thu ghi sổ ngay. Tiền chuyển qua mã QR của quỹ tự vào sổ, không cần nhập. Nhập ở đây tiền mặt và tiền chuyển khoản chưa có trong sổ.',
    out: 'Phiếu chi cần ảnh chứng từ và phải được người duyệt đồng ý mới trừ vào tồn quỹ.',
    adjust: 'Dùng để sửa sai bút toán đã ghi sổ. Nhập số âm để giảm, số dương để tăng. Cần người duyệt.',
  }[type];
  modal(`<h2>${title}</h2>
    <p class="muted fd-form-hint">${hint}</p>
    <label class="fld">Số tiền *<input class="field fd-amount" id="fd-e-amount" inputmode="numeric" autocomplete="off" placeholder="0"
      value="${draft ? (draft.amount < 0 ? '-' : '') + nf.format(Math.abs(draft.amount)) : ''}"></label>
    ${type !== 'adjust' ? `<div class="fd-quick">${QUICK.map((v) => `<button type="button" class="btn sm" data-q="${v}">${shortMoney(v)}</button>`).join('')}</div>` : ''}
    ${type === 'in' ? `<div class="form-grid">
        <label class="fld">Hình thức<select class="field" id="fd-e-source"><option value="cash">Tiền mặt (ghi tay)</option><option value="manual">Chuyển khoản vào tài khoản quỹ</option></select></label>
        <label class="fld">Ngày thu<input class="field" id="fd-e-date" type="date" value="${today()}" max="${today()}"></label>
      </div>
      <label class="fld" id="fd-e-ref-wrap" hidden>Mã giao dịch ngân hàng<input class="field" id="fd-e-bankref" placeholder="Trên sao kê / tin nhắn ngân hàng, để không ghi trùng"></label>
      <div class="form-grid">
        <label class="fld">Người nộp<input class="field" id="fd-e-payer" placeholder="Để trống nếu không rõ"></label>
        <label class="fld">Xóm / địa chỉ<input class="field" id="fd-e-group" maxlength="80" placeholder="Không bắt buộc"></label>
      </div>
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
  const src = $('#fd-e-source');
  if (src) src.onchange = () => { $('#fd-e-ref-wrap').hidden = src.value !== 'manual'; };
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
    if (type === 'in') {
      Object.assign(body, { payer_name: $('#fd-e-payer').value, payer_group: $('#fd-e-group').value, anonymous: $('#fd-e-anon').checked, source: src.value, date: $('#fd-e-date').value });
      if (src.value === 'manual') body.bank_ref = $('#fd-e-bankref').value;
    }
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
