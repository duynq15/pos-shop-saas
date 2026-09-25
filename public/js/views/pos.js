import { $, $$, esc, num, money, uid, debounce, toast, modal, closeModal, beep } from '../util.js';
import { api, state, defaultPriceListId, loadPriceLists } from '../store.js';
import { openProductForm } from './product-form.js';
import { showReceipt, showTransferQR } from './receipt.js';

let cart = [];
let priceListId = null;
let priceMap = {};
let preview = null;
let method = 'cash';
let reqId = 0;
let sugItems = [];
let sugIdx = -1;

const localPrice = (c) => (c.price != null && c.price !== '' ? Number(c.price) : (priceMap[c.unit_id] ?? (c.unit_price != null ? c.unit_price : 0)));
const localGross = (c) => Math.max(0, Math.round(localPrice(c) * c.qty));

function bodyItems() {
  return cart.map((c) => ({
    product_id: c.product_id,
    unit_id: c.unit_id || null,
    name: c.name,
    unit_name: c.unit_name,
    qty: c.qty,
    price: c.price,
    discount: c.discount,
  }));
}
function previewBody() {
  return { items: bodyItems(), price_list_id: priceListId, manual_discount: Number($('#discount')?.value) || 0 };
}
function localTotal() {
  let sub = 0;
  let disc = 0;
  for (const c of cart) { sub += localGross(c); disc += Number(c.discount) || 0; }
  const manual = Number($('#discount')?.value) || 0;
  return Math.max(0, sub - disc - manual);
}

let schedulePreview;
async function loadPriceMap(listId) {
  if (!listId) { priceMap = {}; return; }
  try {
    const items = await api(`/api/price-lists/${listId}/items`);
    priceMap = Object.fromEntries(items.map((i) => [i.unit_id, i.price]));
  } catch { priceMap = {}; }
}

export default {
  id: 'pos',
  label: 'Bán hàng',
  icon: '🛒',
  key: 'F1',

  mount(el) {
    el.innerHTML = `
<div class="pos">
  <div class="pos-left">
    <div class="scan-bar">
      <input id="scan-input" placeholder="Quét mã vạch / gõ tên sản phẩm rồi Enter…" autocomplete="off">
      <button class="btn" id="btn-misc">+ Hàng lẻ</button>
      <button class="btn" id="btn-hold" title="Treo đơn lại">Treo</button>
      <button class="btn" id="btn-held">Đơn treo <span class="chip" id="held-count">0</span></button>
    </div>
    <div class="suggest" id="suggest"></div>
    <div class="cart-wrap">
      <table class="cart">
        <thead><tr><th style="width:34px">#</th><th>Sản phẩm</th><th>ĐVT</th><th class="r">Giá</th><th class="c">SL</th><th class="r">Giảm</th><th class="r">T.Tiền</th><th></th></tr></thead>
        <tbody id="cart-body"></tbody>
      </table>
      <div id="cart-empty" class="empty">Giỏ hàng trống. Quét mã vạch hoặc gõ tên để bắt đầu.</div>
    </div>
  </div>
  <div class="pos-right">
    <div class="card">
      <h3>Đơn hàng</h3>
      <label class="fld">Bảng giá<select class="field" id="price-list"></select></label>
      <div class="rowline"><span>Số món</span><b id="sum-count">0</b></div>
      <div class="rowline"><span>Tạm tính</span><b id="sum-sub">0</b></div>
      <div id="promo-box"></div>
      <div class="rowline"><span>Giảm giá đơn</span><input id="discount" class="field" type="number" min="0" value="0" style="width:140px;text-align:right"></div>
      <div class="rowline total"><span>TỔNG</span><b id="sum-total">0</b></div>
      <div id="warn-box"></div>
    </div>
    <div class="card">
      <h3>Thanh toán</h3>
      <div class="seg">
        <button class="seg-btn active" data-method="cash">💵 Tiền mặt</button>
        <button class="seg-btn" data-method="transfer">🏦 CK</button>
        <button class="seg-btn" data-method="card">💳 Thẻ</button>
        <button class="seg-btn" data-method="mixed">➕ Hỗn hợp</button>
      </div>
      <div id="cash-box">
        <div class="rowline"><span>Khách đưa</span><input id="paid" class="field" type="number" min="0" style="width:150px;text-align:right"></div>
        <div class="quick" id="quick-cash"></div>
        <div class="rowline"><span>Tiền thừa</span><b id="change">0</b></div>
      </div>
      <div id="mixed-box" class="hidden"></div>
    </div>
    <div class="card">
      <label class="fld">Khách hàng<input id="cust-name" class="field" placeholder="(tuỳ chọn)"></label>
      <label class="fld">Số điện thoại<input id="cust-phone" class="field"></label>
      <label class="fld">Ghi chú<input id="sale-note" class="field"></label>
    </div>
    <div class="pos-actions">
      <button id="btn-pay" class="btn primary big" disabled>THANH TOÁN <kbd>F9</kbd></button>
      <button id="btn-clear" class="btn ghost">Xóa giỏ hàng <kbd>Esc</kbd></button>
    </div>
  </div>
</div>`;

    schedulePreview = debounce(fetchPreview, 220);
    bindScan();
    bindCart();
    bindTotals();
    bindPayment();
    $('#btn-misc').onclick = addMisc;
    $('#btn-hold').onclick = holdOrder;
    $('#btn-held').onclick = openHeld;
    $('#btn-pay').onclick = pay;
    $('#btn-clear').onclick = () => { if (!cart.length || confirm('Xóa toàn bộ giỏ hàng?')) clearCart(); };
  },

  async show() {
    await loadPriceLists();
    priceListId = priceListId || defaultPriceListId();
    const sel = $('#price-list');
    sel.innerHTML = state.priceLists.map((l) => `<option value="${l.id}" ${l.id === priceListId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    if (!Object.keys(priceMap).length) await loadPriceMap(priceListId);
    await updateHeldCount();
    renderCart();
    setTimeout(() => $('#scan-input')?.focus(), 60);
  },

  onKey(e) {
    if (e.key === 'F9') { e.preventDefault(); pay(); return true; }
    if (e.key === 'Escape') {
      if (!$('#modal')?.classList.contains('hidden')) { closeModal(); return true; }
      if (!$('#suggest').classList.contains('hidden')) { hideSuggest(); return true; }
      if (cart.length && confirm('Xóa toàn bộ giỏ hàng?')) { clearCart(); return true; }
    }
    return false;
  },
};

/* ---------------- Scan & suggestions ---------------- */
function bindScan() {
  const scan = $('#scan-input');
  scan.addEventListener('input', () => {
    clearTimeout(scan._t);
    const q = scan.value.trim();
    if (q.length < 2 || /^\d{6,}$/.test(q)) return hideSuggest();
    scan._t = setTimeout(async () => {
      try {
        sugItems = (await api('/api/products?q=' + encodeURIComponent(q) + '&limit=12')).slice(0, 12);
      } catch { sugItems = []; }
      sugIdx = sugItems.length ? 0 : -1;
      renderSuggest();
    }, 150);
  });
  scan.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown' && sugItems.length) { e.preventDefault(); sugIdx = (sugIdx + 1) % sugItems.length; renderSuggest(); }
    else if (e.key === 'ArrowUp' && sugItems.length) { e.preventDefault(); sugIdx = (sugIdx - 1 + sugItems.length) % sugItems.length; renderSuggest(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = scan.value.trim();
      if (!q) return;
      if (sugItems.length && sugIdx >= 0 && !/^\d{6,}$/.test(q)) { addProduct(sugItems[sugIdx]); scan.value = ''; hideSuggest(); return; }
      let qty = 1, code = q;
      const m = q.match(/^(\d+)\*(.+)$/);
      if (m) { qty = Number(m[1]); code = m[2]; }
      try {
        const p = await api('/api/products/barcode/' + encodeURIComponent(code));
        addProduct(p, qty, p.matched_unit_id);
        scan.value = ''; hideSuggest();
      } catch {
        let list = [];
        try { list = await api('/api/products?q=' + encodeURIComponent(code)); } catch { /* ignore */ }
        if (list.length === 1) { addProduct(list[0], qty); scan.value = ''; hideSuggest(); return; }
        beep(false);
        if (confirm(`Không tìm thấy mã "${code}". Thêm sản phẩm mới với mã này?`)) {
          scan.value = '';
          openProductForm({ barcode: code }, (p) => addProduct(p, qty));
          lookupIntoForm(code);
        } else scan.select();
      }
    }
  });
  scan.addEventListener('blur', () => setTimeout(hideSuggest, 200));
}
function renderSuggest() {
  const s = $('#suggest');
  if (!sugItems.length) return hideSuggest();
  s.innerHTML = `<div class="list">${sugItems.map((p, i) => `<div class="item ${i === sugIdx ? 'sel' : ''}" data-i="${i}">
    <span>${esc(p.name)}<small>${esc(p.barcode || '')} · tồn ${num(p.stock)} ${esc(p.unit)}</small></span><b>${money(p.sell_price)}</b></div>`).join('')}</div>`;
}
function hideSuggest() { const s = $('#suggest'); if (s) s.innerHTML = ''; sugItems = []; sugIdx = -1; }

// Khi quét mã lạ: tra cứu online (nếu bật) và tự điền vào form đang mở.
async function lookupIntoForm(code) {
  if (state.settings.online_lookup !== '1') return;
  try {
    const r = await api('/api/barcode-lookup/' + encodeURIComponent(code));
    if (!r.found) return;
    if (!$('#f-name')) return; // form đã đóng
    if (!$('#f-name').value && r.name) $('#f-name').value = r.name;
    if (r.image && !$('#f-image')?.value) {
      $('#f-image').value = r.image;
      const img = $('#f-image-preview');
      if (img) { img.src = r.image; img.style.display = ''; }
    }
    if (!$('#f-desc')?.value) $('#f-desc').value = [r.brand, r.quantity, r.categories].filter(Boolean).join(' · ');
    toast('Đã lấy thông tin từ mã vạch');
  } catch { /* offline hoặc lỗi -> bỏ qua */ }
}

/* ---------------- Cart ---------------- */
function addProduct(p, qty = 1, unitId) {
  const units = p.units || [];
  const unit = units.find((u) => u.id === (unitId || p.matched_unit_id)) || units.find((u) => u.is_base) || (units[0] || null);
  const uidv = unit ? unit.id : null;
  const ex = cart.find((c) => c.product_id === p.id && c.unit_id === uidv);
  if (ex) ex.qty += qty;
  else cart.unshift({
    key: uid(), product_id: p.id, name: p.name, barcode: p.barcode,
    units, unit_id: uidv, unit_name: unit ? unit.name : p.unit, unit_price: unit ? unit.sell_price : p.sell_price,
    conversion: unit ? unit.conversion : 1, price: null, qty, stock: p.stock, allow_negative: p.allow_negative, discount: null,
  });
  beep(true);
  renderCart();
  $('#scan-input')?.focus();
}
function addMisc() {
  modal(`<h2>Hàng lẻ (không có mã)</h2>
    <div class="form-grid">
      <label class="fld full">Tên hàng<input class="field" id="m-name" value="Hàng lẻ"></label>
      <label class="fld">Giá bán<input class="field" id="m-price" type="number" min="0"></label>
      <label class="fld">Số lượng<input class="field" id="m-qty" type="number" min="1" value="1"></label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="m-ok">Thêm vào giỏ</button><button class="btn" id="m-close">Đóng</button></div>`, { focus: '#m-price' });
  $('#m-close').onclick = closeModal;
  const submit = () => {
    const price = Number($('#m-price').value);
    if (!price) return toast('Nhập giá bán', true);
    cart.unshift({ key: uid(), product_id: null, name: $('#m-name').value || 'Hàng lẻ', unit_id: null, unit_name: '', conversion: 1, price, qty: Number($('#m-qty').value) || 1, discount: null });
    closeModal(); renderCart(); $('#scan-input')?.focus();
  };
  $('#m-ok').onclick = submit;
  $('#modal-box').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function unitOptions(c) {
  if (!c.units || !c.units.length) return '';
  return c.units.map((u) => `<option value="${u.id}" ${u.id === c.unit_id ? 'selected' : ''}>${esc(u.name)}${u.conversion > 1 ? ' ×' + u.conversion : ''}</option>`).join('');
}

function renderCart() {
  const tb = $('#cart-body');
  if (!cart.length) preview = null;
  tb.innerHTML = cart.map((c, i) => {
    const pv = preview && preview.items && preview.items.length === cart.length ? preview.items[i] : null;
    const price = pv ? pv.price : localPrice(c);
    const disc = pv ? pv.discount : (Number(c.discount) || 0);
    const lineTotal = pv ? pv.line_total : localGross(c) - (Number(c.discount) || 0);
    const unitSel = c.product_id
      ? `<select class="unit-sel" data-act="unit">${unitOptions(c)}</select>`
      : `<span class="muted">${esc(c.unit_name || '—')}</span>`;
    return `<tr data-key="${c.key}">
    <td>${cart.length - i}</td>
    <td><span class="pname">${esc(c.name)}</span><span class="pmeta">${esc(c.barcode || '')}${c.stock != null && !c.allow_negative && pv && pv.base_qty > c.stock ? ' · <span class="low">vượt tồn (' + num(c.stock) + ')</span>' : ''}</span></td>
    <td>${unitSel}</td>
    <td class="r"><input class="pnum" data-act="price" type="number" value="${price}"></td>
    <td class="c"><span class="qty"><button data-act="dec">−</button><input type="number" data-act="qty" step="any" value="${c.qty}"><button data-act="inc">+</button></span></td>
    <td class="r"><input class="dnum" data-act="disc" type="number" min="0" value="${c.discount ?? ''}" placeholder="0"></td>
    <td class="r"><b class="lt">${money(lineTotal)}</b></td>
    <td><button class="del" data-act="del">✕</button></td></tr>`;
  }).join('');
  $('#cart-empty').classList.toggle('hidden', cart.length > 0);
  applyPreview();
  if (!cart.length) $('#btn-pay').disabled = true;
}

function bindCart() {
  const tb = $('#cart-body');
  const get = (e) => { const tr = e.target.closest('tr'); return cart.find((c) => c.key === tr.dataset.key); };
  tb.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act || !['inc', 'dec', 'del'].includes(act)) return;
    const c = get(e);
    if (act === 'inc') c.qty++;
    if (act === 'dec') { c.qty--; if (c.qty <= 0) cart = cart.filter((x) => x !== c); }
    if (act === 'del') cart = cart.filter((x) => x !== c);
    c.discount = c.discount ?? null;
    renderCart();
  });
  tb.addEventListener('change', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const c = get(e);
    if (act === 'qty') { c.qty = Number(e.target.value) || 1; if (c.qty <= 0) cart = cart.filter((x) => x !== c); }
    if (act === 'price') c.price = e.target.value === '' ? null : Number(e.target.value);
    if (act === 'disc') c.discount = e.target.value === '' ? null : Number(e.target.value);
    if (act === 'unit') {
      const u = (c.units || []).find((x) => x.id === Number(e.target.value));
      if (u) { c.unit_id = u.id; c.unit_name = u.name; c.conversion = u.conversion; c.unit_price = u.sell_price; c.price = null; }
    }
    renderCart();
  });
}

/* ---------------- Preview & totals ---------------- */
async function fetchPreview() {
  if (!cart.length) return;
  const token = ++reqId;
  try {
    const pv = await api('/api/checkout/preview', { method: 'POST', body: previewBody() });
    if (token !== reqId || pv.items.length !== cart.length) return;
    preview = pv;
    applyPreview();
  } catch (e) { /* im lặng */ }
}
function applyPreview() {
  const count = preview ? preview.item_count : cart.reduce((s, c) => s + c.qty, 0);
  const gross = preview ? preview.gross_subtotal : cart.reduce((s, c) => s + localGross(c), 0);
  const total = preview ? preview.total : localTotal();
  $('#sum-count').textContent = num(count);
  $('#sum-sub').textContent = money(gross);
  $('#sum-total').textContent = money(total);
  $('#btn-pay').disabled = cart.length === 0;

  let promo = '';
  if (preview && preview.item_discount) promo += `<div class="promo-line">Giảm giá hàng: -${money(preview.item_discount)}</div>`;
  if (preview && preview.promo_discount) promo += `<div class="promo-line">KM "${esc(preview.promo_order_name || '')}": -${money(preview.promo_discount)}</div>`;
  $('#promo-box').innerHTML = promo;

  $('#warn-box').innerHTML = (preview && preview.warnings && preview.warnings.length)
    ? preview.warnings.map((w) => `<div class="warn-line">⚠️ ${esc(w.message)}</div>`).join('') : '';

  // cập nhật lại ô giá nếu không đang nhập
  $$('#cart-body tr').forEach((tr, i) => {
    const pv = preview && preview.items && preview.items.length === cart.length ? preview.items[i] : null;
    if (!pv) return;
    const priceEl = $('[data-act="price"]', tr);
    if (priceEl && document.activeElement !== priceEl) priceEl.value = pv.price;
    const lt = $('.lt', tr); if (lt) lt.textContent = money(pv.line_total);
    const c = cart[i];
    const meta = $('.pmeta', tr);
    if (meta && c && c.stock != null && !c.allow_negative && pv.base_qty > c.stock) meta.innerHTML = `${esc(c.barcode || '')} · <span class="low">vượt tồn (${num(c.stock)})</span>`;
  });
  updateChange();
  renderQuick();
}

function bindTotals() {
  $('#discount').addEventListener('input', () => { schedulePreview(); applyLocalTotals(); });
  $('#price-list').addEventListener('change', async (e) => {
    priceListId = Number(e.target.value) || null;
    for (const c of cart) c.price = null;
    await loadPriceMap(priceListId);
    renderCart();
    schedulePreview();
  });
}
function applyLocalTotals() {
  if (!preview) { $('#sum-total').textContent = money(localTotal()); }
}
function renderQuick() {
  const t = preview ? preview.total : localTotal();
  const q = [...new Set([t, Math.ceil(t / 10000) * 10000, Math.ceil(t / 50000) * 50000, Math.ceil(t / 100000) * 100000, 200000, 500000, 1000000].filter((x) => x >= t))].slice(0, 6);
  $('#quick-cash').innerHTML = q.map((v) => `<button data-q="${v}">${num(v)}</button>`).join('');
}

/* ---------------- Payment ---------------- */
function bindPayment() {
  $('#quick-cash').addEventListener('click', (e) => { if (e.target.dataset.q) { $('#paid').value = e.target.dataset.q; updateChange(); } });
  $('#paid').addEventListener('input', updateChange);
  $$('.seg-btn').forEach((b) => b.onclick = () => {
    method = b.dataset.method;
    $$('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    $('#cash-box').classList.toggle('hidden', method !== 'cash');
    $('#mixed-box').classList.toggle('hidden', method !== 'mixed');
    renderMixed();
    $('#scan-input')?.focus();
  });
}
function updateChange() {
  const t = preview ? preview.total : localTotal();
  if (method === 'cash') {
    const paid = Number($('#paid').value);
    $('#change').textContent = money(paid ? paid - t : 0);
  } else if (method === 'mixed') {
    renderMixed();
  }
}
function renderMixed() {
  const t = preview ? preview.total : localTotal();
  let box = $('#mixed-box');
  if (box.dataset.built !== '1') {
    box.innerHTML = `<div class="rowline"><span>Tiền mặt</span><input class="field mix-cash" type="number" min="0" value="0" style="width:140px;text-align:right"></div>
      <div class="rowline"><span>Chuyển khoản</span><input class="field mix-transfer" type="number" min="0" value="0" style="width:140px;text-align:right"></div>
      <div class="rowline"><span>Còn thiếu</span><b class="mix-left">0</b></div>`;
    box.dataset.built = '1';
    $('.mix-cash', box).addEventListener('input', renderMixed);
    $('.mix-transfer', box).addEventListener('input', renderMixed);
  }
  const cash = Number($('.mix-cash', box).value) || 0;
  const tr = Number($('.mix-transfer', box).value) || 0;
  $('.mix-left', box).textContent = money(Math.max(0, t - cash - tr));
}
function mixedPayments(total) {
  const cash = Number($('.mix-cash').value) || 0;
  const tr = Number($('.mix-transfer').value) || 0;
  if (cash + tr < total) { toast('Tổng tiền thanh toán chưa đủ', true); return null; }
  const arr = [];
  if (cash > 0) arr.push({ method: 'cash', amount: Math.min(cash, total) });
  if (tr > 0) arr.push({ method: 'transfer', amount: Math.min(tr, total) });
  return arr;
}

async function pay() {
  if (!cart.length) return;
  const total = preview ? preview.total : localTotal();
  const body = {
    items: bodyItems(),
    price_list_id: priceListId,
    manual_discount: Number($('#discount').value) || 0,
    payment_method: method,
    customer_name: $('#cust-name').value.trim() || null,
    customer_phone: $('#cust-phone').value.trim() || null,
    note: $('#sale-note').value.trim() || null,
  };
  if (method === 'cash') {
    const paid = Number($('#paid').value) || total;
    if (paid < total) return toast('Khách đưa chưa đủ tiền', true);
    body.paid_amount = paid;
  } else if (method === 'mixed') {
    const arr = mixedPayments(total);
    if (!arr) return;
    body.payments = arr;
  }
  try {
    const inv = await api('/api/invoices', { method: 'POST', body });
    clearCart();
    if (inv.payment_method === 'transfer') showTransferQR(inv);
    else showReceipt(inv);
  } catch (e) { toast(e.message, true); }
}

function clearCart() {
  cart = []; preview = null;
  if ($('#discount')) $('#discount').value = 0;
  if ($('#paid')) $('#paid').value = '';
  if ($('#cust-name')) $('#cust-name').value = '';
  if ($('#cust-phone')) $('#cust-phone').value = '';
  if ($('#sale-note')) $('#sale-note').value = '';
  if ($('#mixed-box')) { $('#mixed-box').dataset.built = '0'; $('#mixed-box').innerHTML = ''; }
  renderCart();
  $('#scan-input')?.focus();
}

/* ---------------- Held orders ---------------- */
async function updateHeldCount() {
  try { const h = await api('/api/held-orders'); $('#held-count').textContent = h.length; } catch { /* ignore */ }
}
async function holdOrder() {
  if (!cart.length) return toast('Chưa có hàng để treo', true);
  try {
    await api('/api/held-orders', { method: 'POST', body: {
      cart: bodyItems(), price_list_id: priceListId, manual_discount: Number($('#discount').value) || 0,
      customer_name: $('#cust-name').value.trim() || null, customer_phone: $('#cust-phone').value.trim() || null,
      label: $('#cust-name').value.trim() || null,
    } });
    toast('Đã treo đơn'); clearCart(); updateHeldCount();
  } catch (e) { toast(e.message, true); }
}
async function openHeld() {
  const list = await api('/api/held-orders');
  modal(`<h2>Đơn treo (${list.length})</h2>
    <div class="scroll-x" style="max-height:56vh;overflow:auto"><table class="line-items"><thead><tr><th>Mã</th><th>Khách</th><th class="r">Tổng</th><th></th></tr></thead>
    <tbody>${list.map((h) => `<tr data-id="${h.id}"><td>${esc(h.label || h.code)}<span class="sub">${esc(h.created_at)}</span></td>
      <td>${esc(h.customer_name || '')}</td><td class="r"><b>${money(h.total)}</b></td>
      <td class="r"><button class="btn sm" data-act="open">Mở</button> <button class="btn sm danger" data-act="del">Xóa</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có đơn treo</td></tr>'}</tbody></table></div>
    <div class="modal-actions"><button class="btn" id="held-close">Đóng</button></div>`);
  $('#held-close').onclick = closeModal;
  $('#modal-box').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    if (btn.dataset.act === 'del') { await api('/api/held-orders/' + id, { method: 'DELETE' }); toast('Đã xóa'); openHeld(); updateHeldCount(); }
    if (btn.dataset.act === 'open') {
      const h = await api('/api/held-orders/' + id);
      cart = h.cart.map((c) => ({ ...c, key: uid() }));
      if (h.price_list_id) { priceListId = h.price_list_id; $('#price-list').value = priceListId; await loadPriceMap(priceListId); }
      $('#discount').value = 0;
      $('#cust-name').value = h.customer_name || '';
      $('#cust-phone').value = h.customer_phone || '';
      await api('/api/held-orders/' + id, { method: 'DELETE' });
      closeModal(); renderCart(); updateHeldCount();
    }
  });
}
