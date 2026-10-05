// Nhận tiền nhanh cho người bán nhỏ (GĐ4.1, 4.4 — FR-03, FR-11, NFR-02, AC-01-1, AC-01-3, AC-02-1).
// Ba chạm: nhập số tiền → chạm hạng mục → khách quét QR. Mỗi lần nhận tiền là một hóa đơn chuyển khoản
// một dòng hàng tự do, nên webhook, chống trùng, hàng chờ và báo cáo dùng lại nguyên vẹn.
import { $, esc, nf, money, today, monthStart, modal, closeModal, toast } from '../util.js';
import { api, state } from '../store.js';
import { isProd, can } from '../auth.js';
import { icon } from '../icons.js';

const QUICK = [10000, 20000, 50000, 100000, 200000, 500000];
const SLOW_MS = 15 * 60 * 1000; // AC-01-3: quá 15 phút coi là sự cố kết nối
let cats = [];
let amount = 0;
let timer = null;

const short = (n) => (n >= 1e6 ? `${n / 1e6}tr` : `${n / 1e3}k`);
const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
const refresh = () => { loadToday(); loadReport(document.querySelector('#qp-rp-range .seg-btn.active')?.dataset.r || 'month'); };

export default {
  id: 'quickpay',
  label: 'Nhận tiền',
  icon: icon('wallet'),

  mount(el) {
    el.innerHTML = `
<div class="qp">
  <div class="qp-amount-box">
    <label for="qp-amount" class="muted">Số tiền khách trả</label>
    <input id="qp-amount" class="qp-amount" inputmode="numeric" autocomplete="off" placeholder="0" aria-describedby="qp-unit">
    <span id="qp-unit" class="qp-unit">₫</span>
  </div>
  <div class="qp-quick" id="qp-quick">${QUICK.map((v) => `<button type="button" class="btn" data-q="${v}">+${short(v)}</button>`).join('')}
    <button type="button" class="btn ghost" data-q="0" aria-label="Xóa số tiền">Xóa</button></div>
  <p class="muted qp-step" id="qp-step">Chạm hạng mục để hiện mã QR</p>
  <div class="qp-cats" id="qp-cats"></div>
  <div class="qp-foot">
    <button class="btn" id="qp-static">${icon('card')} QR dán quầy</button>
  </div>
  <div class="card qp-today">
    <h3>Hôm nay <span class="muted" id="qp-sum"></span></h3>
    <div id="qp-list"></div>
  </div>
  <div class="card qp-report">
    <h3>Doanh thu</h3>
    <div class="seg" id="qp-rp-range">
      <button class="seg-btn active" data-r="month">Tháng này</button><button class="seg-btn" data-r="last">Tháng trước</button><button class="seg-btn" data-r="year">Năm nay</button>
    </div>
    <div class="qp-rp-total" id="qp-rp-total"></div>
    <div id="qp-rp-cats"></div>
    <details class="qp-rp-days"><summary>Theo ngày</summary><div id="qp-rp-days"></div></details>
  </div>
</div>`;
    const input = $('#qp-amount');
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 11);
      amount = Number(d) || 0;
      input.value = d ? nf.format(amount) : '';
    });
    $('#qp-quick').onclick = (e) => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      amount = Number(b.dataset.q) ? amount + Number(b.dataset.q) : 0;
      input.value = amount ? nf.format(amount) : '';
    };
    $('#qp-cats').onclick = (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      charge(b.dataset.cat === '0' ? null : Number(b.dataset.cat));
    };
    $('#qp-static').onclick = openStaticQr;
    $('#qp-list').onclick = (e) => { const r = e.target.closest('[data-inv]'); if (r) openRetag(Number(r.dataset.inv)); };
    $('#qp-rp-range').onclick = (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      document.querySelectorAll('#qp-rp-range .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      loadReport(b.dataset.r);
    };
  },

  async show() {
    try { cats = await api('/api/community/categories'); } catch { cats = []; }
    $('#qp-cats').innerHTML = cats.map((c) => `<button class="qp-cat" data-cat="${c.id}">${esc(c.name)}</button>`).join('')
      + `<button class="qp-cat other" data-cat="0">${cats.length ? 'Khác / chưa chọn' : 'Tạo mã QR'}</button>`;
    $('#qp-step').textContent = cats.length ? 'Chạm hạng mục để hiện mã QR' : 'Bấm để hiện mã QR';
    setTimeout(() => $('#qp-amount').focus(), 50);
    loadToday();
    loadReport(document.querySelector('#qp-rp-range .seg-btn.active')?.dataset.r || 'month');
  },
};

async function charge(catId) {
  if (!amount) { toast('Nhập số tiền trước', true); $('#qp-amount').focus(); return; }
  if (amount > 100_000_000_000) { toast('Số tiền quá lớn', true); return; }
  const cat = cats.find((c) => c.id === catId);
  let inv;
  try {
    inv = await api('/api/invoices', { method: 'POST', body: {
      items: [{ name: cat ? cat.name : 'Bán hàng', price: amount, qty: 1 }], payment_method: 'transfer', item_category_id: catId || undefined,
    } });
  } catch (e) { toast(e.message, true); return; }
  if (inv.status !== 'pending') { toast('Cài đặt chưa có tài khoản nhận tiền nên không tạo được QR', true); return; }
  let qr = null; let mock = false;
  try { const d = await api(`/api/invoices/${inv.id}/vietqr`, { method: 'POST' }); qr = d.qrDataUrl; mock = !!d.mock; } catch { /* dùng QR thường có số tiền */ }
  if (!qr) {
    try { qr = (await api(`/api/qr?amount=${inv.total}&message=${encodeURIComponent(inv.payment_ref || inv.code)}`)).dataUrl; } catch (e) { toast(e.message, true); return; }
  }
  const started = Date.now();
  modal(`<div class="qp-pay" id="qp-pay">
      <div class="qp-pay-amt">${money(inv.total)}</div>
      <div class="muted">${esc(cat ? cat.name : 'Chưa gắn hạng mục')}</div>
      <img src="${qr}" alt="Mã QR chuyển khoản ${money(inv.total)}">
      <div class="muted">${esc(state.settings.bank_name || '')} · ${esc(state.settings.bank_account || '')}</div>
      <div class="qp-wait" id="qp-wait" role="status">Đang chờ khách chuyển khoản…</div>
    </div>
    <div class="modal-actions" style="justify-content:center">
      ${!isProd() && mock ? '<button class="btn" id="qp-sim">Mô phỏng khách đã chuyển</button>' : ''}
      ${can('invoice.cancel') ? '<button class="btn" id="qp-cancel">Hủy giao dịch</button>' : ''}
      <button class="btn primary" id="qp-done">Xong</button>
    </div>`);
  const done = (paid) => {
    stop();
    if (paid) {
      $('#qp-pay').classList.add('ok');
      $('#qp-wait').innerHTML = `${icon('check')} Đã nhận ${money(inv.total)}`;
      $('#qp-cancel')?.remove(); $('#qp-sim')?.remove();
      $('#qp-amount').value = ''; amount = 0;
      refresh();
    }
  };
  window.__onModalClose = () => { stop(); refresh(); };
  $('#qp-done').onclick = closeModal;
  if ($('#qp-cancel')) $('#qp-cancel').onclick = async () => {
    try { await api(`/api/invoices/${inv.id}/cancel`, { method: 'POST', body: { reason: 'Khách không chuyển' } }); toast('Đã hủy giao dịch'); closeModal(); }
    catch (e) { toast(e.message, true); }
  };
  if ($('#qp-sim')) $('#qp-sim').onclick = async () => { try { await api('/api/vietqr/simulate', { method: 'POST', body: { invoice_id: inv.id } }); } catch (e) { toast(e.message, true); } };
  timer = setInterval(async () => {
    try {
      const s = await api(`/api/invoices/${inv.id}/payment-status`);
      if (s.paid) return done(true);
      if (Date.now() - started > SLOW_MS && !$('#qp-wait').classList.contains('slow')) {
        $('#qp-wait').classList.add('slow');
        $('#qp-wait').textContent = 'Chưa xác nhận được. Kiểm tra app ngân hàng: nếu đã có tiền, bấm Xong; giao dịch sẽ được ghi khi ngân hàng báo về.';
      }
    } catch { /* bỏ qua, thử lại lần sau */ }
  }, 3000);
}

async function loadToday() {
  try {
    const r = await api(`/api/invoices?from=${today()}&to=${today()}&type=sale`);
    const list = (r.items || r).filter((i) => i.status !== 'cancelled');
    const paid = list.filter((i) => i.status === 'paid');
    $('#qp-sum').textContent = `· ${paid.length} lần · ${money(paid.reduce((s, i) => s + i.total, 0))}`;
    $('#qp-list').innerHTML = list.slice(0, 30).map((i) => `<button class="qp-row" data-inv="${i.id}">
        <span class="t">${esc(String(i.created_at || '').slice(11, 16))}</span>
        <span class="c">${esc(i.item_category_name || 'Chưa gắn hạng mục')}</span>
        <span class="a ${i.status === 'paid' ? 'fd-pos' : ''}">${money(i.total)}</span>
        <span class="s">${i.status === 'paid' ? 'Đã nhận' : 'Chờ'}</span></button>`).join('')
      || '<p class="muted" style="text-align:center;margin:12px 0">Chưa có giao dịch hôm nay</p>';
  } catch (e) { $('#qp-list').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

// AC-02-1: gắn / đổi hạng mục sau (hạng mục là nhãn, không đổi tiền)
async function openRetag(id) {
  let inv;
  try { inv = await api('/api/invoices/' + id); } catch (e) { toast(e.message, true); return; }
  modal(`<h2>${money(inv.total)} · ${esc(String(inv.created_at || '').slice(11, 16))}</h2>
    <p class="muted" style="margin:-8px 0 12px">Chọn hạng mục cho giao dịch này</p>
    <div class="qp-cats">${cats.map((c) => `<button class="qp-cat ${c.id === inv.item_category_id ? 'active' : ''}" data-set="${c.id}">${esc(c.name)}</button>`).join('')}
      <button class="qp-cat other ${inv.item_category_id ? '' : 'active'}" data-set="0">Chưa gắn</button></div>
    <div class="modal-actions"><button class="btn" id="qp-rt-close">Đóng</button></div>`);
  $('#qp-rt-close').onclick = closeModal;
  document.querySelector('#modal-box .qp-cats').onclick = async (e) => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    try {
      await api(`/api/invoices/${id}/category`, { method: 'POST', body: { item_category_id: Number(b.dataset.set) || null } });
      toast('Đã cập nhật hạng mục'); closeModal(); refresh();
    } catch (err) { toast(err.message, true); }
  };
}

// 4.2: QR tĩnh để in dán quầy (khách tự nhập số tiền; tiền về vào hàng chờ phân loại)
async function openStaticQr() {
  let q;
  try { q = await api('/api/qr'); } catch (e) { toast(e.message, true); return; }
  modal(`<h2>QR dán quầy</h2>
    <div class="qp-pay"><img src="${q.dataUrl}" alt="Mã QR nhận tiền dán quầy">
      <b>${esc(q.account_holder || state.settings.shop_name || '')}</b>
      <span class="muted">${esc(q.bank_name || '')} · ${esc(q.bank_account || '')}</span></div>
    <p class="muted" style="font-size:12.5px">Khách quét và tự nhập số tiền. Tiền về sẽ nằm ở mục "Chờ phân loại" (Giao dịch VietQR) để bạn chọn hạng mục.</p>
    <div class="modal-actions"><button class="btn" id="qp-st-print">In</button><button class="btn primary" id="qp-st-close">Đóng</button></div>`);
  $('#qp-st-close').onclick = closeModal;
  $('#qp-st-print').onclick = () => {
    const w = document.getElementById('print-area') || Object.assign(document.createElement('div'), { id: 'print-area' });
    document.body.appendChild(w);
    w.innerHTML = `<div style="text-align:center;font-family:sans-serif;padding:24px"><h2>${esc(state.settings.shop_name || '')}</h2>
      <img src="${q.dataUrl}" style="width:320px;height:320px"><p style="font-size:18px"><b>${esc(q.account_holder || '')}</b><br>${esc(q.bank_name || '')} · ${esc(q.bank_account || '')}</p>
      <p>Quét mã để chuyển khoản</p></div>`;
    window.print();
  };
}

/* ---------------- Báo cáo người bán (GĐ4.5 — FR-16, ERR-04) ---------------- */
function rangeOf(r) {
  const d = new Date(); const p = (x) => String(x).padStart(2, '0');
  const ymd = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  if (r === 'last') return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)), by: 'day' };
  if (r === 'year') return { from: `${d.getFullYear()}-01-01`, to: today(), by: 'month' };
  return { from: monthStart(), to: today(), by: 'day' };
}
async function loadReport(r) {
  const q = rangeOf(r);
  try {
    const d = await api(`/api/reports/seller?from=${q.from}&to=${q.to}&by=${q.by}`);
    $('#qp-rp-total').innerHTML = `<b>${money(d.revenue)}</b><span class="muted">${d.sales} lần bán</span>`;
    const max = Math.max(1, ...d.categories.map((c) => Math.abs(c.revenue)));
    $('#qp-rp-cats').innerHTML = d.categories.map((c) => `<div class="qp-bar ${c.uncategorized ? 'none' : ''}">
        <span class="n">${esc(c.name)}</span><span class="v">${money(c.revenue)}</span>
        <span class="track"><span class="fill" style="width:${Math.round(Math.abs(c.revenue) / max * 100)}%"></span></span></div>`).join('')
      || '<p class="muted" style="text-align:center">Chưa có doanh thu trong kỳ</p>';
    $('#qp-rp-days').innerHTML = d.periods.slice().reverse().map((p) => `<div class="qp-day"><span>${esc(p.period)}</span><span class="muted">${p.sales} lần</span><b>${money(p.revenue)}</b></div>`).join('')
      || '<p class="muted">Không có dữ liệu</p>';
  } catch (e) { $('#qp-rp-cats').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
