import { $, esc, money, modal, closeModal, toast, printHTML } from '../util.js';
import { state } from '../store.js';
import { barcodeSVG } from '../barcode.js';

export function labelHTML(p, opts = {}) {
  const s = state.settings;
  const w = (Number(s.label_width) || 40) * 3.7;
  const showName = s.label_show_name !== '0';
  const showPrice = s.label_show_price !== '0';
  const showBar = s.label_show_barcode !== '0';
  const showShop = s.label_show_shop === '1';
  const code = p.barcode || p.sku || '';
  const bar = showBar && code ? barcodeSVG(code, { moduleWidth: 1.6, height: 34, showText: true }) : null;
  return `<div class="label" style="width:${w}px">
    ${showShop ? `<div class="ln" style="font-weight:400;font-size:9px">${esc(s.shop_name)}</div>` : ''}
    ${showName ? `<div class="ln">${esc(p.name)}</div>` : ''}
    ${showPrice ? `<div class="lp">${money(p.sell_price)}</div>` : ''}
    ${bar ? bar.svg : `<div style="font:11px monospace">${esc(code)}</div>`}
  </div>`;
}

export function openLabelPrint(products) {
  if (!products.length) return toast('Chưa chọn sản phẩm', true);
  modal(`<h2>In tem nhãn</h2>
    <p class="muted">Chọn số lượng tem cho mỗi sản phẩm. Khổ tem: ${esc(state.settings.label_width)}×${esc(state.settings.label_height)}mm.</p>
    <div class="scroll-x" style="max-height:46vh;overflow:auto"><table class="line-items"><thead><tr><th>Sản phẩm</th><th class="r">Giá</th><th class="c">Số tem</th></tr></thead>
      <tbody>${products.map((p, i) => `<tr data-i="${i}">
        <td>${esc(p.name)}<span class="sub">${esc(p.barcode || p.sku || '')}</span></td>
        <td class="r">${money(p.sell_price)}</td>
        <td class="c"><input class="field lbl-count" type="number" min="0" value="1" style="width:76px;text-align:center"></td>
      </tr>`).join('')}</tbody></table></div>
    <div class="modal-actions"><button class="btn primary" id="lbl-print">🖨 In tem</button><button class="btn" id="lbl-close">Đóng</button></div>`);
  $('#lbl-close').onclick = closeModal;
  $('#lbl-print').onclick = () => {
    const html = [];
    for (const tr of document.querySelectorAll('#modal tbody tr')) {
      const p = products[Number(tr.dataset.i)];
      const n = Number(tr.querySelector('.lbl-count').value) || 0;
      for (let i = 0; i < n; i++) html.push(labelHTML(p));
    }
    if (!html.length) return toast('Chưa chọn số lượng tem', true);
    printHTML(`<div class="label-sheet">${html.join('')}</div>`);
  };
}
