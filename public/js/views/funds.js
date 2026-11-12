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
<div class="view-head"><div><h1>Sổ quỹ</h1><div class="sub">Các quỹ của thôn: thu, chi, công khai</div></div>
  <div class="fd-head-btns"><button class="btn hidden" id="fd-types">Loại quỹ</button><button class="btn hidden" id="fd-accounts">${icon('bank')} Tài khoản nhận tiền</button>
  <button class="btn primary hidden" id="fd-new-fund">+ Tạo quỹ mới</button></div></div>
<div id="fd-alerts"></div>
<div class="fd-layout" id="fd-layout">
  <aside class="fd-list card" aria-label="Danh sách quỹ">
    <div class="seg fd-filter" id="fd-filter" role="tablist">
      <button class="seg-btn active" data-st="collecting">Đang thu</button><button class="seg-btn" data-st="stopped">Ngừng thu</button>
      <button class="seg-btn" data-st="locked">Khoá sổ</button><button class="seg-btn" data-st="">Tất cả</button>
    </div>
    <input class="field fd-search" id="fd-search" placeholder="Tìm quỹ" aria-label="Tìm quỹ">
    <div id="fd-tabs" class="fd-items" role="listbox" aria-label="Chọn quỹ"></div>
  </aside>
  <section class="fd-detail" id="fd-body"><div class="card fd-empty">Đang tải…</div></section>
</div>`;
    $('#fd-new-fund').onclick = () => openFundForm(null);
    $('#fd-types').onclick = () => openTypes();
    $('#fd-accounts').onclick = () => openAccounts();
    $('#fd-tabs').onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      activeId = Number(b.dataset.id); tab = null; openDetailPane(); renderChips(); render();
    };
    $('#fd-filter').onclick = (e) => {
      const b = e.target.closest('[data-st]'); if (!b) return;
      filter = b.dataset.st; renderChips();
    };
    $('#fd-search').oninput = () => renderChips();
  },

  async show() { pane(false); await loadFunds(); await renderAlerts($('#fd-alerts'), api); renderNotices(); },
};

let filter = 'collecting';
let renderGen = 0;
// Điện thoại: danh sách và chi tiết là hai màn; máy tính: hai cột cạnh nhau
const pane = (open) => { $('#fd-layout').classList.toggle('show-detail', open); $('#fd-layout').closest('.view')?.classList.toggle('fd-open', open); };
const openDetailPane = () => { pane(true); window.scrollTo({ top: 0 }); };

// Báo Admin: quỹ tự ngừng thu khi hết hạn và đề nghị mở khoá sổ đang chờ
async function renderNotices() {
  let list = [];
  try { list = await api('/api/fund-notices'); } catch { return; }
  const auto = list.filter((n) => n.kind === 'auto_stop');
  if (auto.length) $('#fd-alerts').insertAdjacentHTML('beforeend', auto.map((n) => `<div class="alert-bar" role="status"><b>Tự ngừng thu:</b> ${esc(n.message)}
    <span class="muted">· ${esc(viDate(n.created_at.slice(0, 10)))}</span></div>`).join(''));
}

async function loadFunds() {
  funds = await api('/api/funds');
  for (const id of ['fd-new-fund', 'fd-types', 'fd-accounts']) $('#' + id).classList.toggle('hidden', !can('fund.manage'));
  if (!activeId || !funds.some((f) => f.id === activeId)) activeId = (funds.find((f) => f.state === 'collecting') || funds[0])?.id ?? null;
  renderChips();
  await render();
}

const STATE_COUNT = (st) => funds.filter((f) => !st || f.state === st).length;
function renderChips() {
  const q = $('#fd-search').value.trim().toLowerCase();
  document.querySelectorAll('#fd-filter [data-st]').forEach((b) => {
    b.classList.toggle('active', b.dataset.st === filter);
    b.textContent = `${{ collecting: 'Đang thu', stopped: 'Ngừng thu', locked: 'Khoá sổ', '': 'Tất cả' }[b.dataset.st]} (${STATE_COUNT(b.dataset.st)})`;
  });
  const list = funds.filter((f) => (!filter || f.state === filter) && (!q || f.name.toLowerCase().includes(q)));
  $('#fd-tabs').innerHTML = list.map((f) => `<button class="fd-item ${f.id === activeId ? 'active' : ''}" role="option" aria-selected="${f.id === activeId}" data-id="${f.id}">
    <span class="n">${esc(f.name)}</span>
    <span class="m"><span class="badge ${STATE_BADGE[f.state]}">${esc(f.state_label)}</span>${f.nature ? `<span>${NATURE[f.nature]}</span>` : ''}</span>
    <span class="b">${money(f.balance)}</span></button>`).join('')
    || `<p class="muted fd-hint">Không có quỹ ${filter ? 'ở trạng thái này' : ''}.</p>`;
}

const NATURE = { mandatory: 'Bắt buộc', campaign: 'Vận động', voluntary: 'Tự nguyện' };
const PAY = { both: 'Tiền mặt và chuyển khoản', cash: 'Chỉ tiền mặt', transfer: 'Chỉ chuyển khoản' };
const canTransfer = (f) => (f.payment_methods || 'both') !== 'cash';
const viDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const STATE_BADGE = { collecting: 'paid', stopped: 'pending', locked: 'cancelled' };

// Băng trạng thái: Đang thu (hạn thu) / Ngừng thu (vẫn chi) / Khoá sổ (không thu, không chi)
function stateBanner(f, manage) {
  const inspect = can('fund.inspect');
  if (f.state === 'collecting') {
    const overdue = f.end_date && f.end_date < today();
    return `<div class="fd-state ${overdue ? 'fd-overdue' : ''}">
      ${f.end_date ? `<span>Hạn thu ${viDate(f.end_date)}${overdue ? ' · đã quá hạn, hệ thống sẽ tự ngừng thu' : ''}</span>` : '<span class="muted">Chưa đặt hạn thu</span>'}
      ${f.round > 1 ? `<span class="muted">Đợt ${f.round} · nội dung CK ${esc(f.transfer_content)}</span>` : ''}
      ${manage ? '<button class="btn sm" id="fd-stop">Ngừng thu</button>' : ''}</div>`;
  }
  if (f.state === 'stopped') {
    return `<div class="fd-state fd-stopped">
      <span>Ngừng thu từ ${viDate((f.stopped_at || '').slice(0, 10))} · vẫn chi được</span>
      ${f.stop_note ? `<p>${esc(f.stop_note)}</p>` : ''}
      ${f.unlocked_at ? `<p class="low">Đã mở khoá sổ ngày ${viDate(f.unlocked_at.slice(0, 10))} – lý do: ${esc(f.unlock_reason || '')}</p>` : ''}
      ${manage ? '<button class="btn sm primary" id="fd-resume">Mở thu lại</button>' : ''}
      ${inspect ? '<button class="btn sm" id="fd-lock">Khoá sổ</button>' : ''}</div>`;
  }
  return `<div class="fd-state fd-closed">
    <span>Không thu, không chi · số dư khi khoá sổ <b>${money(f.lock_balance)}</b></span>
    <span class="muted">${viDate((f.locked_at || '').slice(0, 10))}${f.locked_by_name ? ' · ' + esc(f.locked_by_name) : ''}</span>
    ${f.lock_note ? `<p>${esc(f.lock_note)}</p>` : ''}
    ${f.lock_doc_id ? `<a class="btn sm" href="/api/fund-documents/${f.lock_doc_id}" target="_blank" rel="noopener">Xem biên bản khoá sổ</a>` : ''}
    ${manage || inspect || can('fund.approve') ? '<button class="btn sm" id="fd-unlock">Mở khoá sổ…</button>' : ''}
    ${manage ? '<button class="btn sm" id="fd-clone">Tạo quỹ mới từ quỹ này</button>' : ''}</div>`;
}

// Một dòng thông tin quỹ (nhãn bên trái, giá trị bên phải); trống thì hiện "Chưa có" để người quản lý biết cần bổ sung
const infoRow = (k, v, hint) => `<div class="fd-dl"><span>${k}</span><b>${v || `<i class="muted">${hint || 'Chưa có'}</i>`}</b></div>`;

function bodyTemplate(f) {
  const collecting = f.state === 'collecting';
  const manage = can('fund.manage');
  const editable = manage && f.state !== 'locked';
  // Ngừng thu vẫn chi: thủ quỹ lập phiếu chi / điều chỉnh; thu tiền chỉ khi Đang thu
  const canIn = can('fund.entry') && collecting;
  const canOut = can('fund.entry') && f.state !== 'locked';
  const hasQr = collecting && canTransfer(f) && f.bank_account && f.bank_bin;
  return `
<button class="btn sm fd-back" id="fd-back">← Danh sách quỹ</button>
<div class="card fd-head">
  <div class="fd-head-top">
    <div class="fd-title"><h2>${esc(f.name)}</h2>
      <div class="fd-tags"><span class="badge ${STATE_BADGE[f.state]}">${esc(f.state_label)}</span>
        ${f.fund_type ? `<span class="badge">${esc(f.fund_type)}</span>` : ''}${f.nature ? `<span class="badge">${NATURE[f.nature]}</span>` : ''}
        ${f.is_public ? '<span class="badge paid">Công khai</span>' : '<span class="badge">Không công khai</span>'}</div></div>
    <div class="fd-head-acts">
      ${editable ? `<button class="btn" id="fd-edit-fund">${icon('settings')} Sửa thông tin quỹ</button>` : ''}
      ${canIn ? '<button class="btn primary fd-desk" id="fd-in">+ Thu tiền</button>' : ''}
      ${canOut ? '<button class="btn fd-desk" id="fd-out">+ Lập phiếu chi</button>' : ''}
      ${hasQr ? `<button class="btn" id="fd-qr">${icon('card')} QR nhận tiền</button>` : ''}
      <details class="fd-menu"><summary class="btn" aria-label="Thao tác khác">Thêm ▾</summary><div>
        ${collecting ? '<button class="mi" id="fd-share">Chia sẻ / nhắc đóng quỹ</button>' : ''}
        ${canIn ? '<button class="mi" id="fd-import">Nhập khoản thu từ Excel</button>' : ''}
        ${canOut ? '<button class="mi" id="fd-adjust">Lập bút toán điều chỉnh</button>' : ''}
        ${manage ? '<button class="mi" id="fd-clone-2">Tạo quỹ mới từ quỹ này</button>' : ''}
      </div></details>
    </div>
  </div>
  ${stateBanner(f, manage)}
  <div class="fd-progress" id="fd-progress" hidden></div>
</div>
<div class="stats fd-stats">
  <div class="stat primary"><div class="k">Tồn quỹ</div><div class="v">${money(f.balance)}</div></div>
  <div class="stat ok"><div class="k">Thu tháng này</div><div class="v" id="fd-m-in">…</div></div>
  <div class="stat danger"><div class="k">Chi tháng này</div><div class="v" id="fd-m-out">…</div></div>
  <div class="stat warn"><div class="k">Việc cần làm</div><div class="v" id="fd-m-todo">…</div></div>
</div>
<div class="tabs" id="fd-subtabs">
  <button class="tab" data-tab="info">Thông tin quỹ</button>
  <button class="tab" data-tab="todo">Việc cần làm <span class="fd-count" id="fd-todo-count"></span></button>
  <button class="tab" data-tab="ledger">Sổ thu chi</button>
  <button class="tab" data-tab="houses">Theo hộ</button>
  <button class="tab" data-tab="report">Báo cáo</button>
</div>
<section data-pane="info" hidden>
  <div class="fd-info">
    <div class="card"><div class="fd-card-h"><h3>Thông tin chung</h3>${editable ? '<button class="btn sm" data-edit>Sửa</button>' : ''}</div>
      ${infoRow('Loại quỹ', esc(f.fund_type || ''))}
      ${infoRow('Tính chất', NATURE[f.nature] || '')}
      ${infoRow('Mức đóng', esc(contribText(f)))}
      ${infoRow('Diện được miễn', esc(lines(f.exempt).join(', ')), 'Không có')}
      ${infoRow('Bắt đầu thu', viDate(f.start_date))}
      ${infoRow('Hạn thu', viDate(f.end_date), 'Không đặt hạn')}
      ${infoRow('Đơn vị quản lý', esc(f.managed_by || ''))}
      ${infoRow('Thủ quỹ phụ trách', esc(f.manager_name || ''), 'Mọi thủ quỹ')}
    </div>
    <div class="card"><div class="fd-card-h"><h3>Nhận tiền</h3>${editable ? '<button class="btn sm" data-edit>Sửa</button>' : ''}</div>
      ${infoRow('Hình thức nộp', PAY[f.payment_methods || 'both'])}
      ${canTransfer(f) ? `${infoRow('Tài khoản nhận', f.bank_account ? `${esc(f.bank_account)}` : '', 'Chưa chọn tài khoản — chưa có QR')}
      ${infoRow('Ngân hàng', esc(f.bank_name || ''))}
      ${infoRow('Chủ tài khoản', esc(f.account_holder || ''))}
      ${infoRow('Nội dung chuyển khoản', esc(f.transfer_content || ''))}` : ''}
      ${infoRow('Trang công khai', f.is_public ? 'Có, người dân xem được' : 'Không')}
      ${hasQr ? '<div class="toolbar fd-card-foot"><button class="btn sm" id="fd-qr-2">Xem / in mã QR</button></div>' : ''}
    </div>
    <div class="card fd-wide"><div class="fd-card-h"><h3>Nội dung chi tiết</h3>${editable ? '<button class="btn sm" data-edit>Sửa</button>' : ''}</div>
      ${f.content ? `<div class="fd-content">${esc(f.content)}</div>` : '<p class="muted">Chưa có nội dung. Nên ghi mục đích, căn cứ, đối tượng, mức đóng, cách nộp để người dân đọc trên App.</p>'}
      <h3 class="fd-sub-h">Tài liệu đính kèm</h3><div id="fd-docs-body" class="muted">Đang tải…</div>
    </div>
  </div>
</section>
<section data-pane="todo" hidden><div class="fd-todo" id="fd-pending-body"></div></section>
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
<section data-pane="houses" hidden><div id="fd-hh-body" class="muted">Đang tải…</div></section>
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
${canOut ? `<div class="fd-bar">${canIn ? '<button class="btn primary" id="fd-in-m">+ Thu tiền</button>' : ''}<button class="btn" id="fd-out-m">+ Phiếu chi</button></div>` : ''}`;
}

async function render() {
  const f = funds.find((x) => x.id === activeId);
  const body = $('#fd-body');
  if (!f) {
    body.innerHTML = `<div class="card fd-empty"><p>Chưa có quỹ nào.</p>
      ${can('fund.manage') ? '<button class="btn primary" id="fd-first-fund">+ Tạo quỹ đầu tiên</button>' : '<p class="muted">Người quản lý quỹ sẽ tạo quỹ.</p>'}</div>`;
    $('#fd-first-fund')?.addEventListener('click', () => openFundForm(null));
    return;
  }
  body.innerHTML = bodyTemplate(f);
  const gen = ++renderGen; // bấm quỹ khác trong lúc đang tải: bỏ kết quả cũ
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  const menu = (fn) => () => { $('.fd-menu').open = false; fn(); };
  on('fd-back', () => pane(false));
  on('fd-qr', () => openQr(f));
  on('fd-qr-2', () => openQr(f));
  on('fd-share', menu(() => openShare(f)));
  on('fd-edit-fund', () => openFundForm(f));
  body.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openFundForm(f); });
  on('fd-adjust', menu(() => openEntryForm(f, 'adjust')));
  on('fd-import', menu(() => openImport(f)));
  on('fd-stop', () => openStop(f));
  on('fd-resume', () => openResume(f));
  on('fd-lock', () => openLock(f));
  on('fd-unlock', () => openUnlock(f));
  on('fd-clone', () => cloneFund(f));
  on('fd-clone-2', menu(() => cloneFund(f)));
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

  const [month, sum] = await Promise.all([
    api(`/api/funds/${f.id}/report?from=${monthStart()}&to=${today()}`),
    api(`/api/funds/${f.id}/summary`).catch(() => null),
    loadTodo(f, gen),
  ]);
  if (gen !== renderGen) return;
  $('#fd-m-in').textContent = money(month.income_bank + month.income_cash);
  $('#fd-m-out').textContent = money(month.expense);
  // Quỹ có mục tiêu: thanh tiến độ ngay dưới tên quỹ
  if (sum && sum.progress != null && f.target_amount) {
    const pg = $('#fd-progress');
    pg.hidden = false;
    pg.innerHTML = `<div class="fd-bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, sum.progress)}"><span style="width:${Math.min(100, sum.progress)}%"></span></div>
      <span>Đã huy động <b>${money(sum.total_in)}</b> / ${money(f.target_amount)} (${sum.progress}%) · ${nf.format(sum.donors)} lượt đóng góp</span>`;
  }
  showTab(tab || ($('#fd-todo-count').textContent ? 'todo' : 'info'), f);
}

function showTab(name, f) {
  tab = name;
  document.querySelectorAll('#fd-subtabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('#fd-body [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  if (name === 'info') loadDocs(f);
  if (name === 'ledger') loadLedger(f.id);
  if (name === 'houses') loadHouseholds(f);
  if (name === 'report') loadReport(f.id);
}

/* ---------------- Việc cần làm ---------------- */
// Người duyệt: khoản người khác gửi. Thủ quỹ: phiếu nháp của mình + khoản mình đã gửi đang chờ.
async function loadTodo(f, gen = renderGen) {
  const { entries: submitted } = await api(`/api/funds/${f.id}/entries?status=submitted`);
  let drafts = [];
  if (can('fund.entry')) drafts = (await api(`/api/funds/${f.id}/entries?status=draft`)).entries.filter((e) => e.created_by === auth.user.id);
  // GĐ3.2: tiền vào tài khoản quỹ nhưng chưa ghi được sổ (quỹ đóng, không rõ quỹ…) chờ thủ quỹ phân loại.
  // Hàng chờ chung của cộng đồng nên hiện ở mọi quỹ.
  let queue = [];
  if (can('fund.entry')) { try { queue = (await api('/api/vietqr/unclassified')).items; } catch { queue = []; } }
  if (gen !== renderGen) return;
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
  if (!$('#fd-ledger-body')) return;
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
    await loadReconcile(fundId, from, to);
  } catch (e) { toast(e.message, true); }
}

/* ---------------- Đối soát sao kê (GĐ3.6) ---------------- */
// Lệch khác 0 luôn là việc cần xử lý (sổ thiếu hoặc thừa so với sao kê), nên hiện màu cảnh báo chứ không xanh / đỏ.
const diffMoney = (d) => (d === 0 ? '<span class="fd-pos">Khớp</span>' : `<b class="fd-diff">${d > 0 ? 'Sổ thiếu ' : 'Sổ thừa '}${money(Math.abs(d))}</b>`);
async function loadReconcile(fundId, from, to) {
  const rc = await api(`/api/funds/${fundId}/reconcile?from=${from}&to=${to}`);
  $('#fd-rc-sys').textContent = money(rc.system_in) + ` (${rc.count} khoản)`
    + (rc.shared_funds?.length ? ` · cả tài khoản, gồm ${rc.shared_funds.length} quỹ: ${rc.shared_funds.map((x) => x.name).join(', ')}` : '');
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
  const bits = [`Thông báo thu quỹ "${f.name}".`];
  bits.push(contribText(f) + '.');
  if (f.end_date) bits.push(`Hạn đóng: ${f.end_date}.`);
  if (f.bank_account && canTransfer(f)) bits.push(`Chuyển khoản: ${f.bank_account}${f.bank_name ? ' - ' + f.bank_name : ''}${f.account_holder ? ' - ' + f.account_holder : ''}.`);
  if (f.payment_methods === 'cash') bits.push('Nộp tiền mặt trực tiếp cho thủ quỹ.');
  bits.push(`Xem chi tiết tại: ${url}`);
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

/* ---------------- Theo hộ & tài liệu ---------------- */
// Tab "Theo hộ": tình hình đóng của từng hộ (danh sách hộ đồng bộ từ trang Hành chính)
async function loadHouseholds(f, q = $('#fd-hh-q')?.value || '', only = $('#fd-hh-only')?.value || '') {
  const el = $('#fd-hh-body');
  let d;
  try { d = await api(`/api/funds/${f.id}/households`); } catch (e) { el.innerHTML = `<p class="low">${esc(e.message)}</p>`; return; }
  const meta = await api('/api/households').catch(() => ({}));
  if (!el.isConnected) return; // đã chuyển quỹ / vẽ lại trong lúc chờ
  const s = d.summary;
  const k = q.trim().toLowerCase();
  const rows = d.households.filter((h) => (!k || `${h.code} ${h.head_name || ''} ${h.hamlet || ''}`.toLowerCase().includes(k))
    && (!only || (only === 'owe' ? h.due != null && !h.done && !h.exempt : only === 'done' ? h.done : h.exempt)));
  const st = (h) => (h.exempt ? '<span class="badge">Miễn</span>' : h.due == null ? (h.paid ? '<span class="badge paid">Đã đóng</span>' : '<span class="muted">—</span>')
    : h.done ? '<span class="badge paid">Đủ</span>' : `<span class="badge pending">Thiếu ${money(h.remaining)}</span>`);
  el.className = '';
  el.innerHTML = !d.households.length
    ? `<div class="card fd-empty"><p><b>Chưa có danh sách hộ.</b></p><p class="muted">${meta.linked === false ? 'Thôn chưa liên kết mã cộng đồng Sáng Kiến Hưng Gia.' : 'Danh sách hộ lấy từ trang Hành chính (Hộ & nhân khẩu).'}</p>
      ${meta.configured && can('fund.manage') ? '<button class="btn" id="fd-hh-sync">Đồng bộ danh sách hộ</button>' : ''}</div>`
    : `<div class="stats fd-hh-stats">
        <div class="stat"><div class="k">Số hộ</div><div class="v">${nf.format(s.total)}</div></div>
        ${s.with_due ? `<div class="stat ok"><div class="k">Đã đóng đủ</div><div class="v">${nf.format(s.done)} / ${nf.format(s.with_due)}</div></div>` : ''}
        <div class="stat primary"><div class="k">Đã thu từ các hộ</div><div class="v">${money(s.paid)}</div></div>
        ${s.exempt ? `<div class="stat"><div class="k">Hộ được miễn</div><div class="v">${nf.format(s.exempt)}</div></div>` : ''}
      </div>
      <div class="toolbar">
        <input class="field" id="fd-hh-q" placeholder="Tìm mã hộ, chủ hộ" value="${esc(q)}" aria-label="Tìm hộ">
        <select class="field" id="fd-hh-only" aria-label="Lọc"><option value="">Tất cả hộ</option>${s.with_due ? '<option value="owe">Còn thiếu</option><option value="done">Đã đủ</option>' : ''}${s.exempt ? '<option value="exempt">Được miễn</option>' : ''}</select>
        <span class="fd-spacer"></span>
        ${meta.configured && can('fund.manage') ? `<span class="muted fd-small">${meta.synced_at ? 'Cập nhật ' + esc(viDate(meta.synced_at.slice(0, 10))) : ''}</span><button class="btn" id="fd-hh-sync">Đồng bộ danh sách hộ</button>` : ''}
      </div>
      <div class="tbl-wrap"><table class="grid fd-hh"><thead><tr><th>Mã hộ</th><th>Chủ hộ</th><th class="r">Đã đóng</th><th>Tình trạng</th></tr></thead>
        <tbody>${rows.slice(0, 300).map((h) => `<tr><td class="nw">${esc(h.code)}</td><td>${esc(h.head_name || '')}</td>
          <td class="r nw">${h.paid ? money(h.paid) : ''}</td><td>${st(h)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có hộ phù hợp</td></tr>'}</tbody></table></div>
      ${rows.length > 300 ? `<p class="muted fd-hint">Hiện 300 / ${rows.length} hộ. Gõ tìm để thu hẹp.</p>` : ''}`;
  const qi = $('#fd-hh-q');
  if (qi) qi.onchange = () => loadHouseholds(f);
  const oi = $('#fd-hh-only');
  if (oi) { oi.value = only; oi.onchange = () => loadHouseholds(f); }
  const sync = $('#fd-hh-sync');
  if (sync) sync.onclick = async () => {
    sync.disabled = true;
    try { const r = await api('/api/households/sync', { method: 'POST' }); toast(`Đã đồng bộ ${r.count} hộ`); loadHouseholds(f); } catch (e) { toast(e.message, true); sync.disabled = false; }
  };
}

// Tài liệu đính kèm, ngay trong tab Thông tin quỹ
async function loadDocs(f) {
  const el = $('#fd-docs-body');
  let docs = [];
  try { docs = await api(`/api/funds/${f.id}/documents`); } catch (e) { el.textContent = e.message; return; }
  if (!el.isConnected) return;
  const edit = can('fund.manage') && f.state !== 'locked';
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB');
  el.className = '';
  el.innerHTML = `<ul class="fd-docs">${docs.map((d) => `<li><a href="/api/fund-documents/${d.id}" target="_blank" rel="noopener">${icon('receipt')} ${esc(d.name)}</a>
      <span class="muted fd-small">${d.kind === 'minutes' ? 'Biên bản · ' : ''}${kb(d.size)} · ${esc(viDate(d.created_at.slice(0, 10)))}</span>
      ${edit && d.kind === 'doc' ? `<button class="btn sm" data-del="${d.id}" aria-label="Gỡ ${esc(d.name)}">Gỡ</button>` : ''}</li>`).join('') || '<li class="muted">Chưa có tài liệu</li>'}</ul>
    ${edit ? `<label class="btn fd-upload">+ Thêm tài liệu<input type="file" id="fd-dc-file" accept="${DOC_ACCEPT}"></label>
      <span class="muted fd-small">PDF, ảnh, Word, Excel, tối đa 10MB</span>` : ''}`;
  const file = $('#fd-dc-file');
  if (file) file.onchange = async () => {
    try { await api(`/api/funds/${f.id}/documents`, { method: 'POST', body: await fileOf(file) }); toast('Đã thêm tài liệu'); loadDocs(f); } catch (e) { toast(e.message, true); }
  };
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Gỡ tài liệu này khỏi quỹ?')) return;
      try { await api('/api/fund-documents/' + b.dataset.del, { method: 'DELETE' }); loadDocs(f); } catch (e) { toast(e.message, true); }
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

/* ---------------- Danh mục: loại quỹ, tài khoản nhận tiền ---------------- */
// Loại quỹ lưu ở Cài đặt (mỗi dòng "Tên | Tính chất"). Chọn loại thì tính chất đi theo loại, không nhập tay nữa.
const natureKey = (v) => Object.keys(NATURE).find((k) => NATURE[k].toLowerCase() === String(v || '').trim().toLowerCase()) || '';
const parseTypes = (text) => lines(text).map((l) => { const [name, nat] = l.split('|').map((x) => x.trim()); return { name, nature: natureKey(nat) }; });
const accLabel = (a) => `${a.bank_name || 'Ngân hàng'} · ${a.bank_account} · ${a.account_holder || ''}${a.label ? ' (' + a.label + ')' : ''}`;

async function openTypes(after) {
  const settings = await api('/api/settings');
  let types = parseTypes(settings.fund_types);
  const row = (t, i) => `<div class="fd-type-row" data-i="${i}">
    <input class="field" data-k="name" value="${esc(t.name)}" placeholder="Tên loại quỹ" aria-label="Tên loại quỹ">
    <select class="field" data-k="nature" aria-label="Tính chất">${Object.entries(NATURE).map(([k, v]) => `<option value="${k}" ${k === t.nature ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button class="btn sm" data-rm="${i}" aria-label="Xoá loại ${esc(t.name)}">Xoá</button></div>`;
  const draw = () => {
    $('#fd-ty-rows').innerHTML = types.map(row).join('');
    $('#fd-ty-rows').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { read(); types.splice(Number(b.dataset.rm), 1); draw(); }; });
  };
  const read = () => { types = [...$('#fd-ty-rows').querySelectorAll('.fd-type-row')].map((r) => ({ name: r.querySelector('[data-k=name]').value.trim(), nature: r.querySelector('[data-k=nature]').value })); };
  modal(`<h2>Loại quỹ</h2>
    <p class="muted fd-form-hint">Mỗi loại quỹ gắn sẵn một tính chất. Khi tạo quỹ chỉ cần chọn loại, tính chất tự đi theo, không phải chọn lại.
      Đổi danh mục không làm thay đổi các quỹ đã tạo.</p>
    <div id="fd-ty-rows" class="fd-type-list"></div>
    <button class="btn sm" id="fd-ty-add">+ Thêm loại quỹ</button>
    <div class="modal-actions"><button class="btn" id="fd-ty-close">Hủy</button><button class="btn primary" id="fd-ty-save">Lưu danh mục</button></div>`);
  draw();
  $('#fd-ty-add').onclick = () => { read(); types.push({ name: '', nature: 'mandatory' }); draw(); $('#fd-ty-rows .fd-type-row:last-child input').focus(); };
  $('#fd-ty-close').onclick = () => (after ? after() : closeModal());
  $('#fd-ty-save').onclick = async () => {
    read();
    try { await api('/api/fund-types', { method: 'PUT', body: { types } }); toast('Đã lưu loại quỹ'); after ? after() : closeModal(); } catch (e) { toast(e.message, true); }
  };
}

// Danh sách tài khoản nhận tiền của thôn. Quỹ chọn tài khoản trong danh sách này.
async function openAccounts(after) {
  let list = [];
  try { list = await api('/api/fund-accounts'); } catch (e) { toast(e.message, true); return; }
  const manage = can('fund.manage');
  modal(`<h2>Tài khoản nhận tiền</h2>
    <p class="muted fd-form-hint">Tài khoản ngân hàng của thôn dùng để nhận tiền chuyển khoản. Một tài khoản dùng được cho nhiều quỹ:
      mỗi quỹ có mã nội dung chuyển khoản riêng (vd QT26) nên tiền tự về đúng quỹ. Khoản ghi thiếu mã vào mục "Chưa phân loại" để thủ quỹ chọn quỹ.</p>
    <div id="fd-acc-form"></div>
    <div class="fd-acc-list">${list.map((a) => `<div class="card fd-acc">
      <div class="fd-acc-main"><div><b>${esc(a.bank_account)}</b> · ${esc(a.bank_name || '')} · ${esc(a.account_holder || '')}${a.label ? ` <span class="badge">${esc(a.label)}</span>` : ''}</div>
        <div class="muted fd-small">${a.funds.length ? 'Dùng cho: ' + a.funds.map((x) => `${esc(x.name)}${x.transfer_code ? ` (<code>${esc(x.transfer_code)}</code>)` : ''}`).join(', ') : 'Chưa quỹ nào dùng'}</div></div>
      ${manage ? `<div class="acts"><button class="btn sm" data-ed="${a.id}">Sửa</button>${a.funds.length ? '' : `<button class="btn sm" data-del="${a.id}">Xoá</button>`}</div>` : ''}
    </div>`).join('') || '<p class="muted">Chưa có tài khoản nào.</p>'}</div>
    <div class="modal-actions">${manage ? '<button class="btn" id="fd-acc-add">+ Thêm tài khoản</button>' : ''}<button class="btn primary" id="fd-acc-close">${after ? 'Quay lại' : 'Đóng'}</button></div>`, { wide: true });
  $('#fd-acc-close').onclick = () => (after ? after() : closeModal());
  const form = (a) => {
    const d = a || {};
    $('#fd-acc-form').innerHTML = `<div class="card fd-acc-edit"><h3>${a ? 'Sửa tài khoản' : 'Thêm tài khoản'}</h3>
      <div class="form-grid">
        <label class="fld">Ngân hàng *${bankField('fd-acc-bin', d.bank_bin, d.bank_name)}</label>
        <label class="fld">Số tài khoản *<input class="field" id="fd-acc-no" inputmode="numeric" value="${esc(d.bank_account || '')}" ${a?.funds.length ? 'readonly title="Tài khoản đang dùng cho quỹ, không đổi số được"' : ''}></label>
        <label class="fld">Chủ tài khoản *<input class="field" id="fd-acc-holder" value="${esc(d.account_holder || '')}" placeholder="Như trên ứng dụng ngân hàng"></label>
        <label class="fld">Tên gọi (không bắt buộc)<input class="field" id="fd-acc-label" value="${esc(d.label || '')}" placeholder="Ví dụ: Tài khoản chung của thôn"></label>
      </div>
      <div class="toolbar"><button class="btn" id="fd-acc-cancel">Hủy</button><button class="btn primary" id="fd-acc-save">Lưu tài khoản</button></div></div>`;
    $('#fd-acc-form').scrollIntoView({ block: 'nearest' });
    $('#fd-acc-bin').focus();
    $('#fd-acc-cancel').onclick = () => { $('#fd-acc-form').innerHTML = ''; };
    $('#fd-acc-save').onclick = async () => {
      const bank = bankOf($('#fd-acc-bin').value);
      if (!bank) { toast('Chọn ngân hàng trong danh sách gợi ý', true); $('#fd-acc-bin').focus(); return; }
      const body = { bank_bin: bank[0], bank_name: bank[1], bank_account: $('#fd-acc-no').value, account_holder: $('#fd-acc-holder').value, label: $('#fd-acc-label').value };
      try {
        await api(a ? `/api/fund-accounts/${a.id}` : '/api/fund-accounts', { method: a ? 'PATCH' : 'POST', body });
        toast('Đã lưu tài khoản'); await loadFunds(); openAccounts(after);
      } catch (e) { toast(e.message, true); }
    };
  };
  const add = $('#fd-acc-add'); if (add) add.onclick = () => form(null);
  document.querySelectorAll('.fd-acc [data-ed]').forEach((b) => { b.onclick = () => form(list.find((x) => x.id === Number(b.dataset.ed))); });
  document.querySelectorAll('.fd-acc [data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Xoá tài khoản này khỏi danh sách?')) return;
      try { await api('/api/fund-accounts/' + b.dataset.del, { method: 'DELETE' }); openAccounts(after); } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------------- Form quỹ ---------------- */
// Chia 4 phần theo thứ tự người quản lý nghĩ: quỹ gì → đóng thế nào → nhận tiền ở đâu → nội dung công khai.
// Ô nhập dở được giữ khi mở danh mục loại quỹ / tài khoản rồi quay lại.
async function openFundForm(f, keep) {
  const isNew = !f;
  const d = { ...(f || { status: 'active', contribution: 'household', is_public: 1 }), ...(keep || {}) };
  let treasurers = [];
  try { treasurers = await api('/api/fund-treasurers'); } catch { /* không có quyền thì bỏ ô chọn */ }
  const [settings, accounts] = await Promise.all([api('/api/settings'), api('/api/fund-accounts').catch(() => [])]);
  const types = parseTypes(settings.fund_types);
  if (d.fund_type && !types.some((t) => t.name === d.fund_type)) types.push({ name: d.fund_type, nature: d.nature || '' }); // quỹ cũ, loại đã bỏ khỏi danh mục
  const curAcc = accounts.find((a) => a.bank_account === d.bank_account);
  const tOpts = '<option value="">Mọi thủ quỹ</option>' + treasurers.map((t) =>
    `<option value="${t.id}" ${t.id === d.manager_user_id ? 'selected' : ''}>${esc(t.full_name || t.username)}</option>`).join('');
  const sec = (n, title, hint) => `<div class="full fd-step"><span class="fd-step-n">${n}</span><div><b>${title}</b>${hint ? `<span class="muted">${hint}</span>` : ''}</div></div>`;
  modal(`<h2>${isNew ? 'Tạo quỹ mới' : 'Sửa thông tin quỹ'}</h2>
    <div class="form-grid fd-form">
      ${sec(1, 'Quỹ gì')}
      <label class="fld full">Tên quỹ *<input class="field" id="fd-f-name" value="${esc(d.name || '')}" placeholder="Ví dụ: Quỹ vận động Màn hình LED"></label>
      <label class="fld">Loại quỹ *<select class="field" id="fd-f-type">${types.map((t) => `<option value="${esc(t.name)}" ${t.name === d.fund_type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        ${can('fund.manage') ? '<button type="button" class="linkbtn" id="fd-f-types">Sửa danh mục loại quỹ</button>' : ''}</label>
      <div class="fld"><span>Tính chất</span><div class="fd-nature" id="fd-f-nature-view"></div>
        <span class="muted fd-field-hint">Theo loại quỹ đã chọn.</span></div>
      <label class="fld">Đơn vị quản lý<input class="field" id="fd-f-managed" maxlength="120" value="${esc(d.managed_by || '')}" placeholder="Ban quản lý thôn, Hội Khuyến học…"></label>
      <label class="fld">Thủ quỹ phụ trách<select class="field" id="fd-f-manager">${tOpts}</select>
        <span class="muted fd-field-hint" id="fd-f-manager-hint"></span></label>

      ${sec(2, 'Đóng thế nào')}
      <label class="fld">Cách đóng<select class="field" id="fd-f-contrib">${Object.entries(CONTRIB).map(([k, v]) =>
        `<option value="${k}" ${k === (d.contribution || 'household') ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="fld" id="fd-f-target-wrap"><span id="fd-f-target-label"></span><input class="field fd-amount" id="fd-f-target" inputmode="numeric" autocomplete="off" placeholder="0"
        value="${d.target_amount ? nf.format(d.target_amount) : ''}"></label>
      <label class="fld" id="fd-f-period-wrap">Chu kỳ đóng<select class="field" id="fd-f-period"><option value="">Một lần cho đợt thu</option>${Object.entries(PERIOD).map(([k, v]) =>
        `<option value="${k}" ${k === d.period ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label>
      <label class="fld" id="fd-f-exempt-wrap">Diện hộ được miễn<input class="field" id="fd-f-exempt" maxlength="500" value="${esc((d.exempt || '').split('\n').join(', '))}" placeholder="Hộ nghèo, Gia đình chính sách">
        <span class="muted fd-field-hint">Theo tên diện hộ bên trang Hành chính, cách nhau dấu phẩy.</span></label>
      <label class="fld">Bắt đầu thu<input class="field" id="fd-f-start" type="date" value="${esc(d.start_date || '')}"></label>
      <label class="fld">Hạn thu<input class="field" id="fd-f-end" type="date" value="${esc(d.end_date || '')}">
        <span class="muted fd-field-hint">Hết hạn thì hệ thống tự chuyển Ngừng thu.</span></label>

      ${sec(3, 'Nhận tiền')}
      <div class="fld full"><span>Hình thức nộp</span><div class="seg fd-pay" id="fd-f-pay" role="radiogroup">${Object.entries(PAY).map(([k, v]) =>
        `<button type="button" class="seg-btn ${k === (d.payment_methods || 'both') ? 'active' : ''}" role="radio" aria-checked="${k === (d.payment_methods || 'both')}" data-v="${k}">${v}</button>`).join('')}</div></div>
      <label class="fld full" id="fd-f-acc-wrap">Tài khoản nhận tiền<select class="field" id="fd-f-acc">
          <option value="">— Chưa chọn (chưa có QR) —</option>
          ${accounts.map((a) => `<option value="${a.id}" ${a.id === (keep?.account_id ?? curAcc?.id) ? 'selected' : ''}>${esc(accLabel(a))}${a.funds.filter((x) => x.id !== f?.id).length ? ` · đang dùng cho ${a.funds.filter((x) => x.id !== f?.id).length} quỹ khác` : ''}</option>`).join('')}
        </select>
        ${can('fund.manage') ? '<button type="button" class="linkbtn" id="fd-f-accs">Quản lý danh sách tài khoản</button>' : ''}</label>
      <label class="fld" id="fd-f-tcode-wrap">Mã nội dung chuyển khoản<input class="field" id="fd-f-tcode" maxlength="18" value="${esc(d.transfer_code || '')}" placeholder="Tự tạo nếu để trống, vd QT26">
        <span class="muted fd-field-hint">Người nộp ghi mã này khi chuyển khoản (QR đã điền sẵn). Các quỹ dùng chung tài khoản phải có mã khác nhau.</span></label>

      ${sec(4, 'Công khai cho người dân')}
      <label class="chk full fd-public"><input type="checkbox" id="fd-f-public" ${d.is_public ? 'checked' : ''}> Hiện quỹ trên App Làng Số và trang công khai (người dân xem thu chi, quét QR)</label>
      <label class="fld full">Nội dung chi tiết<textarea class="field fd-textarea" id="fd-f-content" rows="6" placeholder="Mục đích, căn cứ (nghị quyết, tờ trình), đối tượng, mức đóng, cách nộp…">${esc(d.content || '')}</textarea>
        <span class="muted fd-field-hint">Văn bản, tờ trình, ảnh: thêm ở tab "Thông tin quỹ" sau khi lưu.</span></label>
    </div>
    <div class="modal-actions"><button class="btn" id="fd-f-close">Hủy</button><button class="btn primary" id="fd-f-save">${isNew ? 'Tạo quỹ' : 'Lưu thay đổi'}</button></div>`, { focus: keep ? null : '#fd-f-name', wide: true });
  const hint = () => {
    $('#fd-f-manager-hint').textContent = !$('#fd-f-manager').value && treasurers.length > 1
      ? `Cả ${treasurers.length} thủ quỹ đều xem và nhập được quỹ này.` : '';
  };
  $('#fd-f-manager').onchange = hint; hint();
  const nature = () => {
    const t = types.find((x) => x.name === $('#fd-f-type').value);
    // Quỹ cũ có tính chất khác danh mục: giữ nguyên tính chất đã lưu cho tới khi đổi loại quỹ
    const n = !isNew && d.nature && $('#fd-f-type').value === (f.fund_type || '') ? d.nature : t?.nature || '';
    $('#fd-f-nature-view').innerHTML = n ? `<span class="badge fd-n-${n}">${NATURE[n]}</span>` : '<span class="muted">Chưa gắn tính chất cho loại này</span>';
    return n;
  };
  $('#fd-f-type').onchange = nature; nature();
  const contrib = () => {
    const c = CONTRIB[$('#fd-f-contrib').value];
    $('#fd-f-target-wrap').hidden = !c.amount;
    $('#fd-f-period-wrap').hidden = !c.amount || $('#fd-f-contrib').value === 'goal';
    $('#fd-f-exempt-wrap').hidden = $('#fd-f-period-wrap').hidden;
    $('#fd-f-target-label').textContent = c.amount || '';
  };
  $('#fd-f-contrib').onchange = contrib; contrib();
  let pay = d.payment_methods || 'both';
  const payUi = () => {
    document.querySelectorAll('#fd-f-pay [data-v]').forEach((b) => { const on = b.dataset.v === pay; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); });
    $('#fd-f-acc-wrap').hidden = pay === 'cash';
    $('#fd-f-tcode-wrap').hidden = pay === 'cash';
  };
  $('#fd-f-pay').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { pay = b.dataset.v; payUi(); } };
  payUi();
  bindMoney($('#fd-f-target'));
  const collect = () => ({
    name: $('#fd-f-name').value, fund_type: $('#fd-f-type').value, nature: nature() || null,
    contribution: $('#fd-f-contrib').value,
    target_amount: CONTRIB[$('#fd-f-contrib').value].amount ? parseMoney($('#fd-f-target').value) || null : null,
    is_public: $('#fd-f-public').checked ? 1 : 0,
    start_date: $('#fd-f-start').value || null, end_date: $('#fd-f-end').value || null,
    manager_user_id: $('#fd-f-manager').value ? Number($('#fd-f-manager').value) : null,
    payment_methods: pay, managed_by: $('#fd-f-managed').value,
    exempt: $('#fd-f-exempt').value.split(',').map((x) => x.trim()).filter(Boolean).join('\n'),
    period: ['household', 'person'].includes($('#fd-f-contrib').value) ? $('#fd-f-period').value || null : null,
    content: $('#fd-f-content').value, transfer_code: $('#fd-f-tcode').value,
    account_id: pay === 'cash' ? null : ($('#fd-f-acc').value ? Number($('#fd-f-acc').value) : null),
  });
  const back = () => { const k = collect(); return () => openFundForm(f, k); };
  const ty = $('#fd-f-types'); if (ty) ty.onclick = () => openTypes(back());
  const ac = $('#fd-f-accs'); if (ac) ac.onclick = () => openAccounts(back());
  $('#fd-f-close').onclick = closeModal;
  $('#fd-f-save').onclick = async () => {
    const body = collect();
    if (!body.name.trim()) { toast('Nhập tên quỹ', true); $('#fd-f-name').focus(); return; }
    // Quỹ chỉ nhận tiền mặt: bỏ tài khoản; quỹ cũ khai tài khoản chưa có trong danh sách thì giữ nguyên
    if (body.account_id === null && pay !== 'cash' && d.bank_account && !curAcc) delete body.account_id;
    try {
      const saved = await api(isNew ? '/api/funds' : `/api/funds/${f.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast(isNew ? 'Đã tạo quỹ' : 'Đã lưu thông tin quỹ'); closeModal();
      activeId = saved.id; filter = ''; tab = 'info'; pane(true); await loadFunds();
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
  // Ô hình thức chỉ mở đúng hình thức quỹ cho phép (quỹ có thể chỉ nhận tiền mặt hoặc chỉ chuyển khoản)
  const pay = f.payment_methods || 'both';
  const sourceOpts = `${pay !== 'transfer' ? '<option value="cash">Tiền mặt (ghi tay)</option>' : ''}${pay !== 'cash' ? '<option value="manual">Chuyển khoản vào tài khoản quỹ</option>' : ''}`;
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
        <label class="fld">Hình thức<select class="field" id="fd-e-source">${sourceOpts}</select></label>
        <label class="fld">Ngày thu<input class="field" id="fd-e-date" type="date" value="${today()}" max="${today()}"></label>
      </div>
      <label class="fld" id="fd-e-ref-wrap" hidden>Mã giao dịch ngân hàng<input class="field" id="fd-e-bankref" placeholder="Trên sao kê / tin nhắn ngân hàng, để không ghi trùng"></label>
      <div class="form-grid">
        <label class="fld">Mã hộ<input class="field" id="fd-e-house" maxlength="20" list="fd-e-houses" placeholder="Không bắt buộc">
          <datalist id="fd-e-houses"></datalist></label>
        <label class="fld">Người nộp<input class="field" id="fd-e-payer" placeholder="Để trống nếu không rõ"></label>
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
  // Gợi ý mã hộ (danh sách đồng bộ từ Hành chính); chọn hộ thì điền sẵn tên chủ hộ và xóm
  if ($('#fd-e-house')) api('/api/households').then((r) => {
    const byCode = Object.fromEntries(r.households.map((h) => [h.code, h]));
    $('#fd-e-houses').innerHTML = r.households.map((h) => `<option value="${esc(h.code)}">${esc(h.head_name || '')} · ${esc(h.hamlet || '')}</option>`).join('');
    $('#fd-e-house').onchange = () => { const h = byCode[$('#fd-e-house').value.trim()]; if (h) $('#fd-e-payer').value = h.head_name || ''; };
  }).catch(() => {});
  if (src) { src.onchange = () => { $('#fd-e-ref-wrap').hidden = src.value !== 'manual'; }; src.onchange(); }
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
      Object.assign(body, { household_code: $('#fd-e-house').value.trim() || undefined, payer_name: $('#fd-e-payer').value, anonymous: $('#fd-e-anon').checked, source: src.value, date: $('#fd-e-date').value });
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
