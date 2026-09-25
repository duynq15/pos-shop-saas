import { $, esc, num, money, modal, closeModal, toast, printHTML, methodLabel, statusBadge } from '../util.js';
import { api, state } from '../store.js';

export function receiptHTML(inv, qr) {
  const s = state.settings;
  const isReturn = inv.type === 'return';
  const pay = inv.payments && inv.payments.length
    ? inv.payments.map((p) => `${methodLabel(p.method)}: ${num(p.amount)}`).join('<br>')
    : methodLabel(inv.payment_method);
  return `<div class="receipt">
    <h4>${esc(s.shop_name)}</h4>
    ${s.shop_address ? `<div class="ct">${esc(s.shop_address)}</div>` : ''}
    ${s.shop_phone ? `<div class="ct">ĐT: ${esc(s.shop_phone)}</div>` : ''}
    <hr><div class="ct"><b>${isReturn ? 'PHIẾU TRẢ HÀNG' : 'HÓA ĐƠN BÁN HÀNG'}</b></div>
    <div>Số: ${esc(inv.code)}</div>
    <div>Ngày: ${esc(inv.created_at)}</div>
    ${inv.customer_name ? `<div>Khách: ${esc(inv.customer_name)}${inv.customer_phone ? ' - ' + esc(inv.customer_phone) : ''}</div>` : ''}
    <hr><table>${inv.items.map((it) => `<tr><td colspan="3">${esc(it.name)}</td></tr>
      <tr><td>${num(it.qty)} ${esc(it.unit_name || '')} x ${num(it.price)}</td><td></td><td style="text-align:right">${num(it.line_total)}</td></tr>`).join('')}</table>
    <hr><table>
      <tr><td>Tạm tính</td><td style="text-align:right">${num(inv.subtotal)}</td></tr>
      ${inv.item_discount ? `<tr><td>Giảm giá hàng</td><td style="text-align:right">-${num(inv.item_discount)}</td></tr>` : ''}
      ${inv.order_discount ? `<tr><td>Giảm giá đơn</td><td style="text-align:right">-${num(inv.order_discount)}</td></tr>` : ''}
      <tr class="tot"><td>${isReturn ? 'TIỀN TRẢ' : 'TỔNG CỘNG'}</td><td style="text-align:right">${num(inv.total)} ${esc(s.currency)}</td></tr>
      <tr><td>Thanh toán</td><td style="text-align:right">${pay}</td></tr>
      ${inv.payment_method === 'cash' ? `<tr><td>Khách đưa</td><td style="text-align:right">${num(inv.paid_amount)}</td></tr><tr><td>Tiền thừa</td><td style="text-align:right">${num(inv.change_amount)}</td></tr>` : ''}
      ${inv.status === 'pending' ? `<tr><td colspan="2" class="ct"><b>CHỜ CHUYỂN KHOẢN</b></td></tr>` : ''}
    </table>
    ${qr ? `<hr><div class="ct">Quét mã để chuyển khoản</div><img src="${qr.dataUrl}"><div class="ct">${esc(qr.bank_name)} - ${esc(qr.bank_account)}<br>${esc(qr.account_holder)}</div>` : ''}
    <hr><div class="ct">${esc(s.invoice_footer)}</div>
  </div>`;
}

export function printReceipt(inv, qr) { printHTML(receiptHTML(inv, qr)); }

async function qrFor(inv) {
  if (inv.payment_method === 'transfer' && state.settings.bank_account) {
    try { return await api(`/api/qr?amount=${inv.total}&message=${encodeURIComponent(inv.code)}`); } catch { return null; }
  }
  return null;
}

export async function showReceipt(inv) {
  const qr = await qrFor(inv);
  const isReturn = inv.type === 'return';
  modal(`<h2>${isReturn ? 'Phiếu trả hàng' : 'Hóa đơn'} ${esc(inv.code)} ${statusBadge(inv.status)}</h2>
    ${receiptHTML(inv, qr)}
    <div class="modal-actions">
      <button class="btn primary" id="r-print">🖨 In</button>
      ${inv.status === 'pending' ? `<button class="btn ok" id="r-confirm">✔ Đã nhận tiền</button>` : ''}
      ${!isReturn && inv.status !== 'cancelled' ? `<button class="btn" id="r-return">↩ Trả hàng</button>` : ''}
      ${inv.status !== 'cancelled' ? `<button class="btn danger" id="r-cancel">Hủy</button>` : ''}
      <button class="btn" id="r-close">Đóng</button>
    </div>`);
  $('#r-print').onclick = () => printReceipt(inv, qr);
  $('#r-close').onclick = closeModal;
  if ($('#r-confirm')) $('#r-confirm').onclick = async () => {
    try { const i = await api(`/api/invoices/${inv.id}/confirm`, { method: 'POST' }); toast('Đã xác nhận thanh toán'); showReceipt(i); } catch (e) { toast(e.message, true); }
  };
  if ($('#r-return')) $('#r-return').onclick = () => openReturn(inv);
  if ($('#r-cancel')) $('#r-cancel').onclick = async () => {
    if (!confirm('Hủy hóa đơn này? Hàng sẽ được hoàn lại kho.')) return;
    try { const i = await api(`/api/invoices/${inv.id}/cancel`, { method: 'POST' }); toast('Đã hủy hóa đơn'); showReceipt(i); } catch (e) { toast(e.message, true); }
  };
}

export async function showTransferQR(inv) {
  let qr = null;
  let dynamic = false;
  let isMock = false;
  // Ưu tiên QR động (VietQR API) nếu đã bật
  try {
    const d = await api(`/api/invoices/${inv.id}/vietqr`, { method: 'POST' });
    qr = { dataUrl: d.qrDataUrl, bank_name: d.bankName || state.settings.bank_name, bank_account: d.bankAccount || state.settings.bank_account, account_holder: state.settings.account_holder, content: d.content || d.payment_ref };
    dynamic = true;
    isMock = !!d.mock;
  } catch { /* bỏ qua, dùng QR tĩnh */ }
  if (!qr) {
    try { qr = await api(`/api/qr?amount=${inv.total}&message=${encodeURIComponent(inv.code)}`); } catch (e) { toast(e.message, true); }
    if (qr) qr.content = inv.code;
  }
  modal(`<h2>Chuyển khoản – ${esc(inv.code)}</h2>
    <div class="qr-wrap">
      ${qr ? `<img src="${qr.dataUrl}" alt="VietQR">` : '<p class="low">Chưa cấu hình tài khoản ngân hàng (Cài đặt).</p>'}
      <div class="amt">${money(inv.total)}</div>
      ${qr ? `<div class="info">${esc(qr.bank_name)} · <b>${esc(qr.bank_account)}</b><br>${esc(qr.account_holder)}<br>Nội dung: <b>${esc(qr.content || inv.code)}</b></div>` : ''}
      ${inv.status === 'pending' ? `<div class="hint" id="q-wait">${dynamic ? 'Đang chờ khách chuyển khoản… (tự cập nhật khi nhận tiền)' : 'Sau khi nhận tiền, bấm "Đã nhận tiền"'}</div>` : ''}
    </div>
    <div class="modal-actions" style="justify-content:center">
      ${inv.status === 'pending' && isMock ? `<button class="btn" id="q-simulate">🧪 Mô phỏng đã chuyển tiền</button>` : ''}
      ${inv.status === 'pending' ? `<button class="btn primary" id="q-confirm">✔ Đã nhận tiền</button>` : ''}
      <button class="btn" id="q-print">🖨 In hóa đơn</button>
      <button class="btn" id="q-close">Đóng</button>
    </div>`);
  if ($('#q-confirm')) $('#q-confirm').onclick = async () => { stopPoll(); const i = await api(`/api/invoices/${inv.id}/confirm`, { method: 'POST' }); toast('Đã xác nhận thanh toán'); showReceipt(i); };
  $('#q-print').onclick = () => printReceipt(inv, qr);
  $('#q-close').onclick = closeModal;

  // Tự động cập nhật khi VietQR báo đã thanh toán
  let timer = null;
  const stopPoll = () => { if (timer) { clearInterval(timer); timer = null; } window.__onModalClose = null; };
  window.__onModalClose = stopPoll;
  if ($('#q-simulate')) $('#q-simulate').onclick = async () => {
    try {
      await api('/api/vietqr/simulate', { method: 'POST', body: { invoice_id: inv.id } });
      stopPoll();
      toast('Đã nhận thanh toán');
      showReceipt(await api('/api/invoices/' + inv.id));
    } catch (e) { toast(e.message, true); }
  };
  if (inv.status === 'pending') {
    timer = setInterval(async () => {
      try {
        const s = await api(`/api/invoices/${inv.id}/payment-status`);
        if (s.paid) {
          stopPoll();
          const full = await api('/api/invoices/' + inv.id);
          toast('Đã nhận thanh toán');
          showReceipt(full);
        }
      } catch { /* bỏ qua */ }
    }, 3000);
  }
}

export async function openReturn(inv) {
  let data;
  try { data = await api(`/api/invoices/${inv.id}/returnable`); } catch (e) { return toast(e.message, true); }
  const rows = data.items.map((it) => {
    const maxBase = it.returnable_base_qty;
    const maxQty = Math.floor(maxBase / (it.conversion || 1));
    return `<tr data-id="${it.id}" data-conv="${it.conversion || 1}" data-price="${it.price}" data-unit="${it.unit_id || ''}">
      <td>${esc(it.name)}<span class="sub">${esc(it.unit_name || '')} · đã mua ${num(it.qty)}</span></td>
      <td style="text-align:right">${num(it.price)}</td>
      <td class="c"><input type="number" class="field ret-qty" min="0" max="${maxQty}" value="0" style="width:80px;text-align:center" data-max="${maxQty}"></td>
      <td class="c muted">${num(maxQty)}</td></tr>`;
  }).join('');
  modal(`<h2>Trả hàng – ${esc(inv.code)}</h2>
    <div class="scroll-x"><table class="line-items">
      <thead><tr><th>Sản phẩm</th><th class="r">Đơn giá</th><th class="c">SL trả</th><th class="c">Tối đa</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="form-grid" style="margin-top:12px">
      <label class="fld">Hình thức trả
        <select class="field" id="ret-method"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select>
      </label>
      <label class="fld">Lý do<input class="field" id="ret-note" placeholder="(tuỳ chọn)"></label>
    </div>
    <div class="modal-actions">
      <button class="btn primary" id="ret-save">Xác nhận trả hàng</button>
      <button class="btn" id="ret-close">Đóng</button>
    </div>`);
  $('#ret-close').onclick = closeModal;
  $('#ret-save').onclick = async () => {
    const body = [];
    const trs = document.querySelectorAll('#modal .line-items tbody tr');
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      const tr = trs[i];
      const qty = Number(tr.querySelector('.ret-qty').value) || 0;
      if (qty <= 0) continue;
      body.push({ product_id: it.product_id, unit_id: it.unit_id, name: it.name, unit_name: it.unit_name, qty, price: Math.round(it.line_total / it.qty), discount: 0 });
    }
    if (!body.length) return toast('Chưa chọn sản phẩm để trả', true);
    try {
      const inv2 = await api('/api/invoices', { method: 'POST', body: { type: 'return', parent_id: inv.id, items: body, payment_method: $('#ret-method').value, note: $('#ret-note').value } });
      toast('Đã tạo phiếu trả hàng');
      showReceipt(inv2);
    } catch (e) { toast(e.message, true); }
  };
}
