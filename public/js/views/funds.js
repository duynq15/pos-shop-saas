// Màn hình sổ quỹ (GĐ2.8): chọn quỹ, số liệu nhanh, sổ thu chi, báo cáo kỳ.
// Bố cục theo việc hằng ngày: thu tiền là thao tác chính; việc chờ (duyệt chi, nháp, tiền chưa rõ quỹ) gom vào hộp "Cần xử lý" của cả thôn.
import { $, esc, nf, money, today, monthStart, modal, closeModal, toast, printHTML, bankField, bankOf, fold } from '../util.js';
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
let tab = null; // 'info' | 'ledger' | 'houses' | 'report'
let view = null; // 'fund' | 'inbox'; null = chưa chọn (mở lần đầu: có việc thì vào Cần xử lý)
let inbox = { items: [], unclassified: 0, by_fund: {}, count: 0 };
let ledger = { fundId: null, months: 3, q: '', entries: [] };
let lastReport = null;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
// Ngày đầu tháng của n tháng gần nhất (tính cả tháng này)
const monthsAgo = (n) => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() - n + 1, 1)); };
// Khoảng ngày chọn nhanh cho báo cáo
function presetRange(p) {
  const d = new Date();
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
<div class="fd-layout" id="fd-layout">
  <aside class="fd-list card" aria-label="Danh sách quỹ">
    <button class="fd-inbox-btn" id="fd-inbox-btn" hidden></button>
    <div class="fd-search-wrap">${icon('search')}<input class="field fd-search" id="fd-search" type="search" placeholder="Tìm quỹ" aria-label="Tìm quỹ"></div>
    <nav id="fd-tabs" class="fd-items" aria-label="Chọn quỹ"></nav>
  </aside>
  <section class="fd-detail" id="fd-body"><div class="card fd-empty">Đang tải…</div></section>
</div>`;
    $('#fd-new-fund').onclick = () => openFundForm(null);
    $('#fd-types').onclick = () => openTypes();
    $('#fd-accounts').onclick = () => openAccounts();
    $('#fd-tabs').onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      activeId = Number(b.dataset.id); view = 'fund'; tab = null; openDetailPane(); renderChips(); render();
    };
    $('#fd-inbox-btn').onclick = () => { view = 'inbox'; openDetailPane(); renderChips(); render(); };
    $('#fd-search').oninput = () => renderChips();
    // Chuông thông báo bấm vào một mục: mở đúng quỹ hoặc hộp Cần xử lý
    window.addEventListener('funds:goto', () => { if (funds.length) goto(); });
  },

  async show() {
    const first = view === null;
    pane(false); await loadFunds();
    if (first && view === 'inbox') openDetailPane(); // điện thoại: có việc thì mở thẳng Cần xử lý như máy tính
    goto();
  },
};

let renderGen = 0;
// Điện thoại: danh sách và chi tiết là hai màn; máy tính: hai cột cạnh nhau
const pane = (open) => { $('#fd-layout').classList.toggle('show-detail', open); $('#fd-layout').closest('.view')?.classList.toggle('fd-open', open); };
const openDetailPane = () => { pane(true); window.scrollTo({ top: 0 }); };

async function goto() {
  const t = window.__openFund;
  if (t == null) return;
  window.__openFund = null;
  if (t === 'inbox') view = 'inbox';
  else { activeId = t; view = 'fund'; tab = null; }
  openDetailPane(); renderChips(); await render();
}

async function loadInbox() {
  try { inbox = await api('/api/fund-inbox'); } catch { /* giữ dữ liệu cũ */ }
}

async function loadFunds() {
  [funds] = await Promise.all([api('/api/funds'), loadInbox()]);
  window.dispatchEvent(new Event('notices:changed')); // chuông cập nhật theo việc vừa xử lý
  for (const id of ['fd-new-fund', 'fd-types', 'fd-accounts']) $('#' + id).classList.toggle('hidden', !can('fund.manage'));
  if (!activeId || !funds.some((f) => f.id === activeId)) activeId = (funds.find((f) => f.state === 'collecting') || funds[0])?.id ?? null;
  if (view === null) view = inbox.count ? 'inbox' : 'fund';
  renderChips();
  await render();
}

// Danh sách quỹ chia nhóm theo trạng thái; nhóm Khoá sổ thu gọn (ít khi mở)
const GROUPS = [['collecting', 'Đang thu'], ['stopped', 'Ngừng thu'], ['locked', 'Khoá sổ']];
const daysLeft = (f) => (f.end_date ? Math.round((new Date(f.end_date) - new Date(today())) / 864e5) : null);
const goalPct = (f, got) => (f.contribution === 'goal' && f.target_amount ? Math.min(100, Math.round((got / f.target_amount) * 100)) : null);
function fundItem(f) {
  const on = view === 'fund' && f.id === activeId;
  const n = inbox.by_fund?.[f.id];
  const d = f.state === 'collecting' ? daysLeft(f) : null;
  const pct = goalPct(f, f.collected || 0);
  const due = d == null ? '' : `<span class="${d < 0 ? 'fd-late' : d <= 7 ? 'fd-soon' : ''}">${d < 0 ? 'quá hạn thu' : d === 0 ? 'hết hạn hôm nay' : `còn ${d} ngày`}</span>`;
  return `<button class="fd-item ${on ? 'active' : ''}" data-id="${f.id}" ${on ? 'aria-current="true"' : ''}>
    <span class="n">${esc(f.name)}${n ? ` <span class="fd-dot" aria-label="${n} việc cần xử lý">${n}</span>` : ''}</span>
    <span class="m">${[f.nature ? NATURE[f.nature] : esc(f.fund_type || ''), due].filter(Boolean).join(' · ')}</span>
    <span class="b">${money(f.balance)}</span>
    ${pct != null ? `<span class="fd-mini" title="Đạt ${pct}% mục tiêu"><span style="width:${pct}%"></span></span>` : ''}</button>`;
}
function renderChips() {
  const q = fold($('#fd-search').value);
  const ib = $('#fd-inbox-btn');
  ib.hidden = !inbox.count && !inbox.items.length;
  ib.classList.toggle('active', view === 'inbox');
  ib.classList.toggle('calm', !inbox.count);
  ib.innerHTML = `${icon('bell')}<span>Cần xử lý</span>${inbox.count ? `<b class="fd-count">${inbox.count}</b>` : '<span class="muted fd-small">đang chờ người khác</span>'}`;
  const list = funds.filter((f) => !q || fold(f.name).includes(q));
  $('#fd-tabs').innerHTML = GROUPS.map(([st, label]) => {
    const g = list.filter((f) => f.state === st);
    if (!g.length) return '';
    const items = g.map(fundItem).join('');
    const open = st !== 'locked' || q || (view === 'fund' && g.some((f) => f.id === activeId));
    return `<details class="fd-group" ${open ? 'open' : ''}><summary>${label} <span class="muted">(${g.length})</span></summary>${items}</details>`;
  }).join('') || `<p class="muted fd-hint">${q ? 'Không tìm thấy quỹ nào.' : 'Chưa có quỹ nào.'}</p>`;
}

const NATURE = { mandatory: 'Bắt buộc', campaign: 'Vận động', voluntary: 'Tự nguyện' };
const PAY = { both: 'Tiền mặt và chuyển khoản', cash: 'Chỉ tiền mặt', transfer: 'Chỉ chuyển khoản' };
const canTransfer = (f) => (f.payment_methods || 'both') !== 'cash';
const viDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const viDay = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const STATE_BADGE = { collecting: 'paid', stopped: 'pending', locked: 'cancelled' };

// Câu trạng thái kèm thao tác ngay tại chỗ: Đang thu (hạn thu) / Ngừng thu (vẫn chi) / Khoá sổ (không thu, không chi)
function stateBanner(f, manage) {
  const inspect = can('fund.inspect');
  if (f.state === 'collecting') {
    const d = daysLeft(f);
    return `<div class="fd-state ${d != null && d < 0 ? 'fd-overdue' : ''}">
      <span>${f.end_date ? `Đang thu, hạn ${viDate(f.end_date)}${d < 0 ? ' · đã quá hạn, hệ thống sẽ tự ngừng thu' : d <= 7 ? ` · còn ${d} ngày` : ''}` : 'Đang thu · chưa đặt hạn thu'}</span>
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
    <span>Đã khoá sổ ${viDate((f.locked_at || '').slice(0, 10))}${f.locked_by_name ? ' · ' + esc(f.locked_by_name) : ''} · số dư khi khoá <b>${money(f.lock_balance)}</b></span>
    ${f.lock_note ? `<p>${esc(f.lock_note)}</p>` : ''}
    ${f.lock_doc_id ? `<a class="btn sm" href="/api/fund-documents/${f.lock_doc_id}" target="_blank" rel="noopener">Xem biên bản khoá sổ</a>` : ''}
    ${manage || inspect || can('fund.approve') ? '<button class="btn sm" id="fd-unlock">Mở khoá sổ…</button>' : ''}
    ${manage ? '<button class="btn sm" id="fd-clone">Tạo quỹ mới từ quỹ này</button>' : ''}</div>`;
}

// Một dòng thông tin quỹ (nhãn bên trái, giá trị bên phải); trống thì hiện "Chưa có" để người quản lý biết cần bổ sung
const infoRow = (k, v, hint) => `<div class="fd-dl"><span>${k}</span><b>${v || `<i class="muted">${hint || 'Chưa có'}</i>`}</b></div>`;

// Thông tin còn thiếu làm quỹ chạy không trọn (không có QR, người dân không biết quỹ để làm gì)
function missingBits(f) {
  const out = [];
  if (f.state === 'collecting' && canTransfer(f) && !f.bank_account) out.push('chưa chọn tài khoản nhận tiền nên chưa có mã QR');
  if (f.is_public && !f.content) out.push('chưa có nội dung giới thiệu cho người dân');
  return out;
}

// Nút chính theo vai trò: thủ quỹ thu / chi; người quản lý sửa quỹ, chia sẻ. Việc ít dùng vào menu "Thêm".
function bodyTemplate(f) {
  const collecting = f.state === 'collecting';
  const manage = can('fund.manage');
  const editable = manage && f.state !== 'locked';
  // Ngừng thu vẫn chi: thủ quỹ lập phiếu chi / điều chỉnh; thu tiền chỉ khi Đang thu
  const canIn = can('fund.entry') && collecting;
  const canOut = can('fund.entry') && f.state !== 'locked';
  const hasQr = collecting && canTransfer(f) && f.bank_account && f.bank_bin;
  const todoN = inbox.by_fund?.[f.id];
  const miss = editable ? missingBits(f) : [];
  const menu = [
    collecting && '<button class="mi" id="fd-share">Chia sẻ / nhắc đóng quỹ</button>',
    canIn && '<button class="mi" id="fd-import">Nhập khoản thu từ Excel</button>',
    canOut && '<button class="mi" id="fd-adjust">Lập bút toán điều chỉnh</button>',
    manage && '<button class="mi" id="fd-clone-2">Tạo quỹ mới từ quỹ này</button>',
  ].filter(Boolean);
  return `
<button class="btn sm fd-back" id="fd-back">← Danh sách quỹ</button>
<div class="card fd-head">
  <div class="fd-head-top">
    <div class="fd-title"><h2>${esc(f.name)}</h2>
      <div class="fd-tags"><span class="badge ${STATE_BADGE[f.state]}">${esc(f.state_label)}</span>
        ${f.fund_type ? `<span class="badge">${esc(f.fund_type)}</span>` : ''}${f.nature ? `<span class="badge fd-n-${f.nature}">${NATURE[f.nature]}</span>` : ''}
        ${f.is_public ? '<span class="badge paid">Công khai</span>' : '<span class="badge">Không công khai</span>'}</div></div>
    <div class="fd-head-acts">
      ${canIn ? '<button class="btn primary fd-desk" id="fd-in">+ Thu tiền</button>' : ''}
      ${canOut ? '<button class="btn fd-desk" id="fd-out">+ Lập phiếu chi</button>' : ''}
      ${editable ? `<button class="btn" id="fd-edit-fund">${icon('settings')} Sửa thông tin quỹ</button>` : ''}
      ${hasQr ? `<button class="btn" id="fd-qr">${icon('card')} QR nhận tiền</button>` : ''}
      ${menu.length ? `<details class="fd-menu"><summary class="btn" aria-label="Thao tác khác">Thêm ▾</summary><div>${menu.join('')}</div></details>` : ''}
    </div>
  </div>
  ${stateBanner(f, manage)}
  ${miss.length ? `<div class="fd-missing"><span>Quỹ ${miss.join(', ')}.</span><button class="btn sm primary" id="fd-fix">Bổ sung ngay</button></div>` : ''}
  ${todoN ? `<button class="fd-todo-strip" id="fd-todo-strip">${icon('bell')}<span><b>${todoN} việc</b> cần xử lý ở quỹ này</span><span class="go">Xem ›</span></button>` : ''}
  <div class="fd-kpis">
    <div class="fd-kpi main"><span>Tồn quỹ</span><b id="fd-balance">${money(f.balance)}</b></div>
    <div class="fd-kpi"><span>Thu tháng này</span><b id="fd-m-in" class="fd-pos">…</b></div>
    <div class="fd-kpi"><span>Chi tháng này</span><b id="fd-m-out" class="fd-neg">…</b></div>
  </div>
  <div class="fd-progress" id="fd-progress" hidden></div>
</div>
<div class="tabs" id="fd-subtabs" role="tablist">
  <button class="tab" role="tab" data-tab="ledger">Sổ thu chi</button>
  <button class="tab" role="tab" data-tab="info">Thông tin quỹ</button>
  <button class="tab" role="tab" data-tab="houses">Theo hộ</button>
  <button class="tab" role="tab" data-tab="report">Báo cáo</button>
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
<section data-pane="ledger" hidden>
  <div class="fd-le-tools">
    <div class="fd-search-wrap">${icon('search')}<input class="field" id="fd-le-q" type="search" placeholder="Tìm người nộp, nội dung, mã" aria-label="Tìm trong sổ" value="${esc(ledger.fundId === f.id ? ledger.q : '')}"></div>
    <div class="seg" id="fd-le-kind" role="group" aria-label="Lọc sổ">
      <button class="seg-btn active" aria-pressed="true" data-k="">Tất cả</button><button class="seg-btn" aria-pressed="false" data-k="in">Thu</button>
      <button class="seg-btn" aria-pressed="false" data-k="out">Chi</button><button class="seg-btn" aria-pressed="false" data-k="pending">Chờ duyệt</button>
    </div>
  </div>
  <div class="tbl-wrap"><table class="grid fd-ledger" id="fd-ledger-table"><thead><tr>
    <th>Ngày</th><th>Nội dung</th><th class="r">Số tiền</th><th><span class="sr-only">Trạng thái</span></th>
  </tr></thead><tbody id="fd-ledger-body"><tr><td colspan="4" class="fd-empty">Đang tải…</td></tr></tbody></table></div>
  <div class="fd-le-more" id="fd-le-more"></div>
</section>
<section data-pane="houses" hidden><div id="fd-hh-body" class="muted">Đang tải…</div></section>
<section data-pane="report" hidden>
  <div class="fd-rp-tools">
    <div class="seg" id="fd-rp-preset" role="group" aria-label="Kỳ báo cáo">
      <button class="seg-btn active" aria-pressed="true" data-p="month">Tháng này</button><button class="seg-btn" data-p="last">Tháng trước</button>
      <button class="seg-btn" data-p="quarter">Quý này</button><button class="seg-btn" data-p="year">Năm nay</button><button class="seg-btn" data-p="custom">Tuỳ chọn</button>
    </div>
    <div class="fd-rp-out">${can('report.export') ? '<button class="btn" id="fd-rp-export">Xuất Excel</button>' : ''}<button class="btn" id="fd-rp-print">In báo cáo</button></div>
  </div>
  <div class="toolbar" id="fd-rp-custom" hidden>
    <label class="fd-inline">Từ<input type="date" class="field" id="fd-rp-from" value="${monthStart()}"></label>
    <label class="fd-inline">đến<input type="date" class="field" id="fd-rp-to" value="${today()}"></label>
    <button class="btn primary" id="fd-rp-view">Xem</button>
  </div>
  <div class="card fd-stmt-card"><table class="fd-stmt" id="fd-rp-stats"></table>
    <p class="muted fd-hint">Chỉ tính khoản đã ghi sổ, theo ngày ghi sổ.</p></div>
  ${canTransfer(f) ? `<details class="card fd-recon" id="fd-recon">
    <summary><b>Đối soát sao kê ngân hàng</b><span class="muted" id="fd-rc-last"></span></summary>
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
  </details>` : ''}
</section>
${canOut ? `<div class="fd-bar">${canIn ? '<button class="btn primary" id="fd-in-m">+ Thu tiền</button>' : ''}<button class="btn" id="fd-out-m">+ Phiếu chi</button></div>` : ''}`;
}

async function render() {
  if (view === 'inbox') return renderInbox();
  const f = funds.find((x) => x.id === activeId);
  const body = $('#fd-body');
  if (!f) return renderStart();
  body.innerHTML = bodyTemplate(f);
  const gen = ++renderGen; // bấm quỹ khác trong lúc đang tải: bỏ kết quả cũ
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  const menu = (fn) => () => { $('.fd-menu').open = false; fn(); };
  on('fd-back', () => pane(false));
  on('fd-qr', () => openQr(f));
  on('fd-qr-2', () => openQr(f));
  on('fd-share', menu(() => openShare(f)));
  on('fd-edit-fund', () => openFundForm(f));
  on('fd-fix', () => openFundForm(f));
  on('fd-todo-strip', () => { view = 'inbox'; inboxFund = f.id; renderChips(); render(); });
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
  bindLedger(f);
  bindReport(f);

  const [month, sum] = await Promise.all([
    api(`/api/funds/${f.id}/report?from=${monthStart()}&to=${today()}`),
    f.target_amount && f.contribution === 'goal' ? api(`/api/funds/${f.id}/summary`).catch(() => null) : null,
  ]);
  if (gen !== renderGen) return;
  $('#fd-m-in').textContent = money(month.income_bank + month.income_cash);
  $('#fd-m-out').textContent = money(month.expense);
  // Quỹ có mục tiêu: thanh tiến độ ngay dưới số liệu
  if (sum && sum.progress != null) {
    const pg = $('#fd-progress');
    pg.hidden = false;
    pg.innerHTML = `<div class="fd-bar-track" role="progressbar" aria-label="Tiến độ huy động" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, sum.progress)}"><span style="width:${Math.min(100, sum.progress)}%"></span></div>
      <span>Đã huy động <b>${money(sum.total_in)}</b> / ${money(f.target_amount)} (${sum.progress}%) · ${nf.format(sum.donors)} lượt đóng góp</span>`;
  }
  showTab(tab || (can('fund.entry') ? 'ledger' : 'info'), f);
}

function showTab(name, f) {
  tab = name;
  document.querySelectorAll('#fd-subtabs .tab').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('#fd-body [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  if (name === 'info') loadDocs(f);
  if (name === 'ledger') loadLedger(f);
  if (name === 'houses') loadHouseholds(f);
  if (name === 'report') loadReport(f);
}

/* ---------------- Bắt đầu nhanh (thôn chưa có quỹ) ---------------- */
async function renderStart() {
  const body = $('#fd-body');
  if (!can('fund.manage')) {
    body.innerHTML = '<div class="card fd-empty"><p><b>Chưa có quỹ nào.</b></p><p class="muted">Trưởng thôn hoặc người duyệt chi sẽ tạo quỹ.</p></div>';
    return;
  }
  const accounts = await api('/api/fund-accounts').catch(() => []);
  const step = (done, title, text, btn) => `<li class="${done ? 'done' : ''}"><span class="fd-step-n">${done ? '✓' : ''}</span>
    <div><b>${title}</b><span class="muted">${text}</span></div>${btn || ''}</li>`;
  body.innerHTML = `<div class="card fd-onboard"><h2>Bắt đầu dùng Sổ quỹ</h2>
    <p class="muted">Bốn bước, khoảng năm phút. Làm xong bước nào thì bước đó có dấu tích.</p>
    <ol class="fd-steps">
      ${step(accounts.length, 'Khai tài khoản nhận tiền', accounts.length ? `Đã có ${accounts.length} tài khoản.` : 'Tài khoản ngân hàng của thôn. Bỏ qua nếu chỉ thu tiền mặt.', '<button class="btn" id="fd-ob-acc">Tài khoản</button>')}
      ${step(false, 'Xem lại loại quỹ', 'Mỗi loại gắn sẵn tính chất Bắt buộc, Vận động hoặc Tự nguyện.', '<button class="btn" id="fd-ob-types">Loại quỹ</button>')}
      ${step(false, 'Tạo quỹ đầu tiên', 'Tên quỹ, cách đóng, tài khoản nhận tiền.', '<button class="btn primary" id="fd-first-fund">+ Tạo quỹ</button>')}
      ${step(false, 'Công khai cho người dân', 'Bật "Hiện trên App Làng Số" trong form quỹ, rồi gửi link qua Zalo bằng nút Chia sẻ.')}
    </ol></div>`;
  $('#fd-ob-acc').onclick = () => openAccounts();
  $('#fd-ob-types').onclick = () => openTypes();
  $('#fd-first-fund').onclick = () => openFundForm(null);
}

/* ---------------- Cần xử lý (cả thôn) ---------------- */
// Người duyệt: phiếu người khác gửi. Thủ quỹ: phiếu nháp của mình, khoản mình đã gửi, tiền vào chưa rõ quỹ.
// Kiểm tra / duyệt: đề nghị mở khoá sổ chờ ký. Mỗi mục xử lý ngay tại chỗ.
let inboxFund = null; // chỉ xem việc của một quỹ (bấm dải "N việc" ở đầu quỹ)
const viDT = (s) => (s ? `${viDay(s.slice(0, 10))} ${s.slice(11, 16)}` : '');
async function renderInbox() {
  const gen = ++renderGen;
  let queue = [];
  if (inbox.unclassified && can('fund.entry') && !inboxFund) { try { queue = (await api('/api/vietqr/unclassified')).items; } catch { queue = []; } }
  if (gen !== renderGen) return;
  const items = inbox.items.filter((x) => !inboxFund || x.fund_id === inboxFund);
  const by = (a) => items.filter((x) => x.act === a);
  const groups = [
    ['Chờ bạn duyệt', by('approve').map(taskCard)],
    ['Đề nghị mở khoá sổ chờ bạn ký', by('sign').map(unlockCard)],
    ['Phiếu nháp của bạn', by('draft').map(taskCard)],
    ['Tiền vào chưa rõ quỹ', queue.map(queueCard)],
    ['Bạn đã gửi, đang chờ duyệt', by('waiting').map(taskCard)],
  ].filter(([, l]) => l.length);
  const name = inboxFund && funds.find((x) => x.id === inboxFund)?.name;
  $('#fd-body').innerHTML = `<button class="btn sm fd-back" id="fd-back">← Danh sách quỹ</button>
  <div id="fd-inbox">
    <div class="fd-inbox-head"><h2>Cần xử lý${name ? ` <span class="muted">· ${esc(name)}</span>` : ''}</h2>
      ${inboxFund ? '<button class="btn sm" id="fd-ib-all">Xem việc cả thôn</button>' : ''}</div>
    ${groups.map(([t, l]) => `<section class="fd-ib-group"><h3>${t} <span class="muted">(${l.length})</span></h3><div class="fd-todo">${l.join('')}</div></section>`).join('')
      || `<div class="card fd-empty"><p><b>Không còn việc nào.</b></p><p class="muted">${can('fund.approve') ? 'Phiếu chi thủ quỹ gửi sẽ hiện ở đây để bạn duyệt.' : 'Phiếu nháp, khoản chờ duyệt và tiền vào chưa rõ quỹ sẽ hiện ở đây.'}</p></div>`}
  </div>`;
  $('#fd-back').onclick = () => pane(false);
  const all = $('#fd-ib-all'); if (all) all.onclick = () => { inboxFund = null; render(); };
  $('#fd-inbox').onclick = (ev) => {
    const q = ev.target.closest('[data-queue]');
    if (q) return openQueueClassify(queue.find((x) => String(x.id) === q.dataset.queue));
    const u = ev.target.closest('[data-unlock]');
    if (u) return openUnlock(funds.find((x) => x.id === Number(u.dataset.unlock)));
    const b = ev.target.closest('[data-act]');
    if (b) taskAction(b.dataset.act, Number(b.dataset.id));
  };
}

function queueCard(t) {
  return `<div class="fd-task">
    <div class="fd-task-main">
      <div class="fd-task-amt">${signedMoney(t.amount)}</div>
      <div>${esc(t.content || 'Chuyển khoản không có nội dung')}</div>
      <div class="meta">VietQR · ${esc(t.transactionid)} · TK ${esc(t.bank_account || '')} · ${esc(viDT(t.created_at))}${t.age_days ? ` · đã ${t.age_days} ngày` : ''}</div>
    </div>
    <div class="fd-task-side"><span class="badge pending">Chưa rõ quỹ</span>
      <div class="acts"><button class="btn primary" data-queue="${t.id}">Ghi vào quỹ</button></div></div>
  </div>`;
}

function unlockCard(x) {
  const r = x.request;
  return `<div class="fd-task">
    <div class="fd-task-main">
      <div class="fd-task-fund">${esc(x.fund_name || '')}</div>
      <div><b>Đề nghị mở khoá sổ</b> của ${esc(r.requested_by_name || '')}</div>
      <div class="meta">${esc(r.reason || '')} · ${esc(viDT(r.created_at))}</div>
    </div>
    <div class="fd-task-side"><span class="badge pending">Chờ bạn ký</span>
      <div class="acts"><button class="btn primary" data-unlock="${x.fund_id}">Xem và ký</button></div></div>
  </div>`;
}

// Tiền vào thiếu mã quỹ: đoán quỹ theo mã nội dung CK có trong nội dung (vd mã đợt cũ), không đoán được thì bắt chọn
function openQueueClassify(t) {
  if (!t) return;
  const active = funds.filter((x) => x.status === 'active');
  const guess = active.find((x) => x.transfer_code && fold(t.content).includes(fold(x.transfer_code)));
  modal(`<h2>Ghi tiền vào quỹ</h2>
    <p class="muted" style="margin:-8px 0 14px">${money(t.amount)} · ${esc(t.transactionid)} · ${esc(viDT(t.created_at))}<br>Nội dung: ${esc(t.content || '—')}</p>
    <label class="fld">Quỹ nhận *<select class="field" id="fd-q-fund"><option value="">— Chọn quỹ —</option>${active.map((x) => `<option value="${x.id}" ${x.id === guess?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    ${guess ? '<p class="muted fd-small">Đã chọn sẵn theo mã trong nội dung chuyển khoản. Kiểm tra lại trước khi ghi.</p>' : ''}
    <p class="muted fd-small">Ghi xong là khoản thu đã ghi sổ, không đổi quỹ được nữa. Sai thì lập bút toán điều chỉnh.</p>
    <div class="modal-actions"><button class="btn" id="fd-q-cancel">Hủy</button><button class="btn primary" id="fd-q-ok">Ghi sổ</button></div>`);
  $('#fd-q-cancel').onclick = closeModal;
  $('#fd-q-ok').onclick = async () => {
    const fund_id = Number($('#fd-q-fund').value);
    if (!fund_id) { toast('Chọn quỹ nhận khoản tiền này', true); $('#fd-q-fund').focus(); return; }
    try {
      await api(`/api/vietqr/transactions/${t.id}/classify`, { method: 'POST', body: { fund_id } });
      toast(`Đã ghi ${money(t.amount)} vào quỹ`); closeModal(); await loadFunds();
    } catch (e) { toast(e.message, true); }
  };
}

function taskCard(x) {
  const e = x.entry;
  const missing = e.type === 'out' && !e.attachment;
  let acts = '';
  let state = '';
  if (x.act === 'draft') {
    state = missing ? '<span class="badge pending">Thiếu ảnh chứng từ</span>' : '<span class="badge">Nháp, chưa gửi</span>';
    acts = `<button class="btn" data-act="edit" data-id="${e.id}">${missing ? 'Thêm ảnh' : 'Sửa'}</button>
      <button class="btn primary" data-act="submit" data-id="${e.id}" ${missing ? 'disabled title="Cần ảnh chứng từ trước"' : ''}>Gửi duyệt</button>`;
  } else if (x.act === 'approve') {
    state = '<span class="badge pending">Chờ bạn duyệt</span>';
    acts = `${e.attachment ? `<button class="btn" data-act="view" data-id="${e.id}">Xem chứng từ</button>` : ''}
      <button class="btn danger" data-act="reject" data-id="${e.id}">Từ chối</button>
      <button class="btn ok" data-act="approve" data-id="${e.id}">Duyệt</button>`;
  } else {
    state = '<span class="badge pending">Đang chờ duyệt</span>';
  }
  return `<div class="fd-task ${e.status}">
    <div class="fd-task-main">
      <div class="fd-task-fund">${esc(x.fund_name || '')}</div>
      <div class="fd-task-amt">${signedMoney(signed(e))}</div>
      <div>${esc(e.note || TYPE_LABEL[e.type])}</div>
      <div class="meta">${esc(e.code)} · ${TYPE_LABEL[e.type]} · ${esc(e.created_by_name || '')} · ${esc(viDT(e.created_at))}</div>
    </div>
    <div class="fd-task-side">${state}<div class="acts">${acts}</div></div>
  </div>`;
}

async function taskAction(act, id) {
  const x = inbox.items.find((i) => i.entry?.id === id);
  if (!x) return;
  const e = x.entry;
  const f = funds.find((g) => g.id === x.fund_id);
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
// Mặc định 3 tháng gần nhất, chia theo tháng kèm tổng thu / chi đã ghi sổ; tìm và lọc ngay trên máy, không gọi lại máy chủ.
const monthVi = (m) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;
const sumOf = (list, type) => list.reduce((s, e) => s + (e.status === 'approved' && e.type === type ? e.amount : 0), 0);
function bindLedger(f) {
  if (ledger.fundId !== f.id) ledger = { fundId: f.id, months: 3, q: '', kind: '', entries: [], from: '' };
  const seg = $('#fd-le-kind');
  const sync = () => seg.querySelectorAll('[data-k]').forEach((b) => { const on = b.dataset.k === ledger.kind; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  sync();
  seg.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; ledger.kind = b.dataset.k; sync(); renderLedger(); };
  $('#fd-le-q').oninput = (e) => { ledger.q = e.target.value; renderLedger(); };
  const body = $('#fd-ledger-body');
  body.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openDetail(f, Number(tr.dataset.id)); };
  body.onkeydown = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(f, Number(tr.dataset.id)); } };
  $('#fd-le-more').onclick = (e) => { if (e.target.closest('#fd-le-older')) { ledger.months += 3; loadLedger(f); } };
}

async function loadLedger(f) {
  const from = monthsAgo(ledger.months);
  const { entries } = await api(`/api/funds/${f.id}/entries?from=${from}`);
  if (ledger.fundId !== f.id || !$('#fd-ledger-body')) return;
  Object.assign(ledger, { entries, from });
  renderLedger();
}

function renderLedger() {
  const q = fold(ledger.q);
  const k = ledger.kind;
  const rows = ledger.entries.filter((e) => (!k || (k === 'pending' ? e.status === 'draft' || e.status === 'submitted' : e.type === k))
    && (!q || fold(`${who(e)} ${e.note || ''} ${e.code} ${e.bank_ref || ''}`).includes(q)));
  const months = new Map();
  for (const e of rows) { const m = (e.created_at || '').slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(e); }
  $('#fd-ledger-body').innerHTML = [...months].map(([m, list]) => {
    const all = ledger.entries.filter((e) => (e.created_at || '').startsWith(m)); // tổng của cả tháng, không theo bộ lọc
    return `<tr class="fd-month"><th colspan="4" scope="colgroup"><span>${monthVi(m)}</span>
      <span class="fd-month-sum">Thu <b class="fd-pos">${money(sumOf(all, 'in'))}</b> · Chi <b class="fd-neg">${money(sumOf(all, 'out'))}</b></span></th></tr>`
      + list.map((e) => `<tr data-id="${e.id}" tabindex="0">
    <td class="d">${viDay((e.created_at || '').slice(0, 10))}<span class="sub">${esc(e.code)}</span></td>
    <td class="c"><span class="name">${esc(who(e) || e.note || TYPE_LABEL[e.type])}</span>
      <span class="sub">${e.type === 'in' && SRC_LABEL[e.source] ? SRC_LABEL[e.source] : TYPE_LABEL[e.type]}${who(e) && e.note ? ' · ' + esc(e.note) : ''}${e.attachment ? ' · có ảnh' : ''}</span></td>
    <td class="a r">${signedMoney(signed(e))}</td>
    <td class="s">${e.status === 'approved' ? '' : `<span class="badge ${STATUS_BADGE[e.status]}">${STATUS_LABEL[e.status]}</span>`}</td>
  </tr>`).join('');
  }).join('') || `<tr><td colspan="4" class="fd-empty">${q || k ? 'Không có khoản nào khớp. Thử bỏ bớt bộ lọc.' : `Chưa có khoản nào từ ${viDate(ledger.from)}.`}</td></tr>`;
  // ponytail: luôn cho xem thêm vì bút toán có thể ghi lùi ngày trước ngày mở quỹ; máy chủ trả tối đa 1.000 khoản
  $('#fd-le-more').innerHTML = `<span class="muted">Đang xem từ ${viDate(ledger.from)}${ledger.entries.length >= 1000 ? ' · chỉ hiện 1.000 khoản mới nhất' : ''}</span>
    <button class="btn sm" id="fd-le-older">Xem thêm 3 tháng trước</button>`;
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
      <button class="btn primary" id="fd-dt-close">Đóng</button></div>`, { cls: "fd-sheet" });
  $('#fd-dt-close').onclick = closeModal;
  const anon = $('#fd-dt-anon');
  if (anon) anon.onclick = async () => {
    try {
      await api(`/api/fund-entries/${e.id}/anonymous`, { method: 'POST', body: { anonymous: !e.anonymous } });
      toast(e.anonymous ? 'Đã hiện tên người ủng hộ' : 'Đã ẩn tên người ủng hộ'); closeModal(); await loadLedger(f);
    } catch (err) { toast(err.message, true); }
  };
}

/* ---------------- Báo cáo kỳ ---------------- */
// Dạng sổ: tồn đầu + thu − chi ± điều chỉnh = tồn cuối, đọc từ trên xuống như sổ giấy
function bindReport(f) {
  const seg = $('#fd-rp-preset');
  seg.onclick = (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    seg.querySelectorAll('[data-p]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
    const custom = b.dataset.p === 'custom';
    $('#fd-rp-custom').hidden = !custom;
    if (custom) { $('#fd-rp-from').focus(); return; }
    const r = presetRange(b.dataset.p); $('#fd-rp-from').value = r.from; $('#fd-rp-to').value = r.to; loadReport(f);
  };
  $('#fd-rp-view').onclick = () => loadReport(f);
  const exp = $('#fd-rp-export');
  if (exp) exp.onclick = () => { window.location.href = `/api/funds/${f.id}/report/export?from=${$('#fd-rp-from').value}&to=${$('#fd-rp-to').value}`; };
  $('#fd-rp-print').onclick = () => printReport(f);
}

async function loadReport(f) {
  const from = $('#fd-rp-from').value || today(); const to = $('#fd-rp-to').value || from;
  try {
    const r = await api(`/api/funds/${f.id}/report?from=${from}&to=${to}`);
    if (!$('#fd-rp-stats')) return;
    lastReport = r;
    const row = (k, v, cls = '') => `<tr class="${cls}"><th scope="row">${k}</th><td class="r">${v}</td></tr>`;
    const sign = (n) => (n ? `${n < 0 ? '−' : '+'}${money(Math.abs(n))}` : money(0));
    $('#fd-rp-stats').innerHTML = `<caption>Từ ${viDate(from)} đến ${viDate(to)}</caption>
      ${row('Tồn đầu kỳ', money(r.opening_balance), 'fd-st-open')}
      ${row('Thu chuyển khoản', sign(r.income_bank), 'fd-st-in')}
      ${row('Thu tiền mặt', sign(r.income_cash), 'fd-st-in')}
      ${row('Chi', sign(-r.expense), 'fd-st-out')}
      ${r.adjust ? row('Điều chỉnh', sign(r.adjust)) : ''}
      ${row('Tồn cuối kỳ', money(r.closing_balance), 'fd-st-close')}`;
    if ($('#fd-recon')) await loadReconcile(f.id, from, to);
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
      activeId = saved.id; view = 'fund'; tab = 'info'; pane(true); await loadFunds();
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

// Ảnh chụp điện thoại thường 3–8MB: thu về cạnh dài 1600px, JPEG, vẫn đọc rõ chữ trên hoá đơn và gửi nhanh qua 3G.
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } catch { return fileToDataUrl(file); } finally { URL.revokeObjectURL(url); }
}

// Thu / chi trên điện thoại: một cột, ô tiền to, nút lưu luôn ở đáy. draft: phiếu nháp cần sửa.
async function openEntryForm(f, type, draft) {
  const title = draft ? 'Sửa phiếu ' + draft.code : { in: 'Thu tiền', out: 'Lập phiếu chi', adjust: 'Bút toán điều chỉnh' }[type];
  let refOptions = '';
  if (type === 'adjust' && !draft) {
    const { entries } = await api(`/api/funds/${f.id}/entries?status=approved`);
    if (!entries.length) { toast('Chưa có bút toán đã ghi sổ để điều chỉnh', true); return; }
    refOptions = entries.map((e) => `<option value="${e.id}">${esc(e.code)} · ${esc(who(e) || e.note || '')} · ${money(signed(e))}</option>`).join('');
  }
  // Chỉ mở đúng hình thức quỹ cho phép (quỹ có thể chỉ nhận tiền mặt hoặc chỉ chuyển khoản)
  const pay = f.payment_methods || 'both';
  let src = pay === 'transfer' ? 'manual' : 'cash';
  const hint = {
    in: 'Ghi sổ ngay. Tiền chuyển qua mã QR của quỹ tự vào sổ, không cần nhập lại.',
    out: 'Cần ảnh chứng từ và người duyệt đồng ý mới trừ vào tồn quỹ.',
    adjust: 'Sửa sai bút toán đã ghi sổ: số âm để giảm, số dương để tăng. Cần người duyệt.',
  }[type];
  const inFields = `
    ${pay === 'both' ? `<div class="fld fd-src">Hình thức<div class="seg" id="fd-e-src" role="group" aria-label="Hình thức">
      <button type="button" class="seg-btn active" data-s="cash" aria-pressed="true">Tiền mặt</button><button type="button" class="seg-btn" data-s="manual" aria-pressed="false">Chuyển khoản</button></div></div>`
      : `<p class="fd-src muted">Quỹ chỉ nhận ${pay === 'cash' ? 'tiền mặt' : 'chuyển khoản'}.</p>`}
    <label class="fld" id="fd-e-ref-wrap" ${src === 'manual' ? '' : 'hidden'}>Mã giao dịch ngân hàng<input class="field" id="fd-e-bankref" placeholder="Trên sao kê / tin nhắn ngân hàng, để không ghi trùng"></label>
    <div id="fd-e-hh-wrap" hidden><label class="fld">Hộ nộp<input class="field" id="fd-e-house" autocomplete="off" enterkeyhint="search" placeholder="Gõ tên chủ hộ hoặc mã hộ (không bắt buộc)"></label>
      <div class="fd-hh-list" id="fd-e-hh-list" hidden></div></div>
    <label class="fld">Người nộp<input class="field" id="fd-e-payer" placeholder="Để trống nếu không rõ"></label>
    <label class="chk fd-chk"><input type="checkbox" id="fd-e-anon"> Người nộp xin ẩn danh (trang công khai hiện "Người hảo tâm")</label>
    <div class="fd-when"><span>Ngày thu</span><b id="fd-e-date-txt">hôm nay</b><button type="button" class="linkbtn" id="fd-e-date-btn">Đổi ngày</button>
      <input class="field" id="fd-e-date" type="date" value="${today()}" max="${today()}" aria-label="Ngày thu" hidden></div>`;
  const photoBox = `<div class="fd-shot">
      <span class="fd-drop-img" id="fd-e-preview">${draft?.attachment ? `<img src="/api/fund-entries/${draft.id}/attachment" alt="Ảnh chứng từ đã lưu">` : icon('receipt')}</span>
      <span class="muted" id="fd-e-file-name">${draft?.attachment ? 'Đã có ảnh. Chụp lại nếu cần thay.' : 'Ảnh hoá đơn, giấy biên nhận. Bắt buộc trước khi gửi duyệt.'}</span>
      <div class="fd-shot-acts">
        <label class="btn primary fd-cam">${icon('camera')} Chụp chứng từ<input type="file" id="fd-e-cam" accept="image/jpeg,image/png,image/webp" capture="environment"></label>
        <label class="btn">Chọn ảnh có sẵn<input type="file" id="fd-e-file" accept="image/jpeg,image/png,image/webp"></label>
      </div></div>`;
  modal(`<div class="fd-sheet-h"><div><h2>${title}</h2><span class="muted">${esc(f.name)}</span></div>
      <button type="button" class="icon-btn" id="fd-e-close" aria-label="Đóng">✕</button></div>
    <label class="fld">Số tiền *<input class="field fd-amount" id="fd-e-amount" inputmode="${type === 'adjust' ? 'text' : 'numeric'}" autocomplete="off" placeholder="0"
      value="${draft ? (draft.amount < 0 ? '-' : '') + nf.format(Math.abs(draft.amount)) : ''}"></label>
    ${type !== 'adjust' ? `<div class="fd-quick" role="group" aria-label="Số tiền nhanh">${QUICK.map((v) => `<button type="button" class="btn" data-q="${v}">${shortMoney(v)}</button>`).join('')}</div>` : ''}
    ${type === 'in' ? inFields : ''}
    ${type === 'adjust' && !draft ? `<label class="fld">Bút toán cần sửa *<select class="field" id="fd-e-ref">${refOptions}</select></label>` : ''}
    <label class="fld">${type === 'in' ? 'Ghi chú' : type === 'out' ? 'Chi cho việc gì *' : 'Lý do điều chỉnh *'}<input class="field" id="fd-e-note" value="${esc(draft?.note || '')}"></label>
    ${type === 'out' ? photoBox : ''}
    <p class="muted fd-form-hint">${hint}</p>
    <div class="modal-actions">
      ${type === 'in' ? '<button class="btn" id="fd-e-next">Ghi và thu tiếp</button><button class="btn primary" id="fd-e-save">Ghi sổ</button>'
        : '<button class="btn" id="fd-e-save">Lưu nháp</button><button class="btn primary" id="fd-e-send">Lưu và gửi duyệt</button>'}
    </div>`, { cls: 'fd-sheet', focus: '#fd-e-amount' });
  const amt = $('#fd-e-amount');
  bindMoney(amt, type === 'adjust');
  document.querySelectorAll('.fd-quick [data-q]').forEach((b) => { b.onclick = () => { amt.value = nf.format(Number(b.dataset.q)); amt.focus(); }; });
  const seg = $('#fd-e-src');
  if (seg) seg.onclick = (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    src = b.dataset.s;
    seg.querySelectorAll('[data-s]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
    $('#fd-e-ref-wrap').hidden = src !== 'manual';
  };
  // Hộ nộp: tìm theo tên chủ hộ, mã hộ hoặc xóm (danh sách đồng bộ từ Hành chính); chọn hộ thì điền sẵn người nộp
  let houses = []; let house = null;
  const hIn = $('#fd-e-house');
  if (hIn) api('/api/households').then((r) => {
    houses = r.households; if (!houses.length) return;
    $('#fd-e-hh-wrap').hidden = false;
    const list = $('#fd-e-hh-list');
    hIn.oninput = () => {
      house = null;
      const q = fold(hIn.value);
      const hits = q ? houses.filter((h) => fold(`${h.code} ${h.head_name || ''} ${h.hamlet || ''}`).includes(q)).slice(0, 6) : [];
      list.innerHTML = hits.map((h) => `<button type="button" data-code="${esc(h.code)}"><b>${esc(h.head_name || '')}</b> <span class="muted">· ${esc(h.code)}${h.hamlet ? ' · ' + esc(h.hamlet) : ''}</span></button>`).join('');
      list.hidden = !hits.length;
    };
    list.onclick = (e) => {
      const b = e.target.closest('[data-code]'); if (!b) return;
      house = houses.find((h) => h.code === b.dataset.code);
      hIn.value = `${house.head_name || ''} · ${house.code}`; list.hidden = true;
      if (!$('#fd-e-payer').value) $('#fd-e-payer').value = house.head_name || '';
    };
  }).catch(() => {});
  const dIn = $('#fd-e-date');
  if (dIn) {
    $('#fd-e-date-btn').onclick = () => { dIn.hidden = false; $('#fd-e-date-btn').hidden = true; dIn.focus(); };
    dIn.onchange = () => { $('#fd-e-date-txt').textContent = !dIn.value || dIn.value === today() ? 'hôm nay' : viDate(dIn.value); };
  }
  // Ảnh chứng từ: chụp bằng camera sau hoặc chọn ảnh có sẵn; thu nhỏ trước khi gửi
  let photo = null;
  for (const id of ['fd-e-cam', 'fd-e-file']) {
    const inp = $('#' + id);
    if (inp) inp.onchange = async () => {
      const fl = inp.files[0]; if (!fl) return;
      photo = await shrinkPhoto(fl); inp.value = '';
      $('#fd-e-preview').innerHTML = `<img src="${photo}" alt="Ảnh chứng từ vừa chọn">`;
      $('#fd-e-file-name').textContent = 'Đã có ảnh. Chụp lại nếu cần thay.';
    };
  }
  $('#fd-e-close').onclick = closeModal;
  let busy = false; // mạng chậm bấm hai lần: không ghi trùng
  const save = async (send, next) => {
    if (busy) return;
    const body = { amount: parseMoney(amt.value), note: $('#fd-e-note').value };
    if (!body.amount) { toast('Nhập số tiền', true); amt.focus(); return; }
    if (!draft) body.type = type;
    if (type === 'in') {
      const code = house?.code || houses.find((h) => h.code === hIn.value.trim())?.code;
      Object.assign(body, { household_code: code, payer_name: $('#fd-e-payer').value, anonymous: $('#fd-e-anon').checked, source: src, date: dIn.value });
      if (src === 'manual') body.bank_ref = $('#fd-e-bankref').value;
    }
    if (type === 'adjust' && !draft) body.ref_entry_id = $('#fd-e-ref').value;
    if (photo) body.attachment = photo;
    if (send && type === 'out' && !photo && !draft?.attachment) { toast('Cần ảnh chứng từ trước khi gửi duyệt', true); return; }
    busy = true;
    try {
      const e = draft ? await api(`/api/fund-entries/${draft.id}`, { method: 'PATCH', body }) : await api(`/api/funds/${f.id}/entries`, { method: 'POST', body });
      if (send) await api(`/api/fund-entries/${e.id}/submit`, { method: 'POST' });
      toast(type === 'in' ? `Đã ghi sổ ${money(e.amount)}` : send ? 'Đã gửi duyệt' : 'Đã lưu nháp');
      // Nháp còn phải gửi: mở Cần xử lý của quỹ này; đã ghi / đã gửi: về sổ để thấy khoản vừa lập
      if (type !== 'in' && !send) { view = 'inbox'; inboxFund = f.id; } else { view = 'fund'; tab = 'ledger'; }
      if (next) { // thu tiếp người sau: giữ hình thức và ngày, xoá phần còn lại
        for (const id of ['fd-e-amount', 'fd-e-payer', 'fd-e-note', 'fd-e-house', 'fd-e-bankref']) $('#' + id).value = '';
        $('#fd-e-anon').checked = false; house = null; amt.focus();
      } else closeModal();
      await loadFunds();
    } catch (err) { toast(err.message, true); } finally { busy = false; }
  };
  $('#fd-e-save').onclick = () => save(false);
  const nx = $('#fd-e-next'); if (nx) nx.onclick = () => save(false, true);
  const send = $('#fd-e-send'); if (send) send.onclick = () => save(true);
}
