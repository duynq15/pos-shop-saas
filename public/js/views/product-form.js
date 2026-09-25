import { $, $$, esc, num, modal, closeModal, toast } from '../util.js';
import { api, state } from '../store.js';

function unitRows(units) {
  return (units || []).filter((u) => !u.is_base).map((u) => `
    <tr class="unit-row">
      <td><input class="field u-name" value="${esc(u.name)}" placeholder="VD: Thùng"></td>
      <td><input class="field u-conv" type="number" min="2" step="any" value="${u.conversion || ''}" placeholder="24"></td>
      <td><input class="field u-price" type="number" min="0" value="${u.sell_price ?? ''}"></td>
      <td><input class="field u-barcode" value="${esc(u.barcode || '')}"></td>
      <td><input type="hidden" class="u-id" value="${u.id || ''}"><button type="button" class="btn sm u-gen">Tự sinh</button> <button type="button" class="del u-del">✕</button></td>
    </tr>`).join('');
}

export function openProductForm(product = {}, onSaved) {
  const isNew = !product.id;
  const p = product;
  const cats = state.categories.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  modal(`<h2>${isNew ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</h2>
    <div class="form-grid">
      <label class="fld full">Tên sản phẩm *<input class="field" id="f-name" value="${esc(p.name || '')}"></label>
      <div class="fld">Mã vạch
        <span class="input-group">
          <input class="field" id="f-barcode" value="${esc(p.barcode || '')}" ${isNew ? 'autofocus' : ''}>
          <button type="button" class="btn sm" id="f-gen">Tự sinh</button>
          <button type="button" class="btn sm" id="f-lookup" title="Tra cứu thông tin theo mã vạch (cần internet)">Tra cứu</button>
        </span>
      </div>
      <label class="fld">Mã SKU<input class="field" id="f-sku" value="${esc(p.sku || '')}"></label>
      <div class="fld full">Ảnh sản phẩm (URL)
        <input class="field" id="f-image" value="${esc(p.image || '')}" placeholder="https://...">
        <img id="f-image-preview" class="thumb-lg" src="${esc(p.image || '')}" onerror="this.style.display='none'" style="${p.image ? '' : 'display:none'}">
      </div>
      <label class="fld">Danh mục<select class="field" id="f-cat"><option value="">—</option>${cats}</select></label>
      <label class="fld">Loại hàng
        <select class="field" id="f-type">
          <option value="goods" ${p.product_type !== 'service' ? 'selected' : ''}>Hàng hóa</option>
          <option value="service" ${p.product_type === 'service' ? 'selected' : ''}>Dịch vụ</option>
        </select>
      </label>
      <label class="fld">Đơn vị cơ bản<input class="field" id="f-unit" value="${esc(p.unit || 'cái')}"></label>
      <label class="fld">Vị trí / kệ<input class="field" id="f-location" value="${esc(p.location || '')}"></label>
      <label class="fld">Giá vốn<input class="field" id="f-cost" type="number" min="0" value="${p.cost_price ?? 0}"></label>
      <label class="fld">Giá bán *<input class="field" id="f-price" type="number" min="0" value="${p.sell_price ?? ''}"></label>
      <label class="fld">${isNew ? 'Tồn đầu' : 'Tồn hiện tại'}<input class="field" id="f-stock" type="number" step="any" value="${p.stock ?? 0}" ${isNew ? '' : 'disabled'}></label>
      <label class="fld">Tồn tối thiểu<input class="field" id="f-min" type="number" step="any" value="${p.min_stock ?? 0}"></label>
      <label class="fld">Tồn tối đa<input class="field" id="f-max" type="number" step="any" value="${p.max_stock ?? 0}"></label>
      <label class="fld">Bảo hành (tháng)<input class="field" id="f-warranty" type="number" min="0" value="${p.warranty_months ?? 0}"></label>
      <label class="fld">Khối lượng (g)<input class="field" id="f-weight" type="number" min="0" value="${p.weight ?? 0}"></label>
      <label class="fld full">Mô tả<input class="field" id="f-desc" value="${esc(p.description || '')}"></label>
      <label class="chk full"><input type="checkbox" id="f-negative" ${p.allow_negative ? 'checked' : ''}> Cho phép bán âm kho</label>
    </div>
    <h3 style="margin-top:16px">Đơn vị quy đổi</h3>
    <div class="scroll-x"><table class="line-items">
      <thead><tr><th>Tên đơn vị</th><th>Hệ số (=? đơn vị cơ bản)</th><th>Giá bán</th><th>Mã vạch riêng</th><th></th></tr></thead>
      <tbody id="unit-body">${unitRows(p.units)}</tbody>
    </table></div>
    <button type="button" class="btn sm" id="unit-add" style="margin-top:6px">+ Thêm đơn vị</button>
    <div class="modal-actions">
      <button class="btn primary" id="f-save">Lưu</button>
      <button class="btn" id="f-close">Đóng</button>
    </div>`);
  $('#f-close').onclick = closeModal;
  if (isNew) setTimeout(() => ($('#f-barcode').value ? $('#f-name') : $('#f-barcode')).focus(), 50);

  $('#unit-add').onclick = () => {
    const tr = document.createElement('tr');
    tr.className = 'unit-row';
    tr.innerHTML = `<td><input class="field u-name" placeholder="VD: Thùng"></td>
      <td><input class="field u-conv" type="number" min="2" step="any" placeholder="24"></td>
      <td><input class="field u-price" type="number" min="0"></td>
      <td><input class="field u-barcode"></td>
      <td><input type="hidden" class="u-id"><button type="button" class="btn sm u-gen">Tự sinh</button> <button type="button" class="del u-del">✕</button></td>`;
    $('#unit-body').appendChild(tr);
  };
  $('#unit-body').addEventListener('click', (e) => {
    if (e.target.classList.contains('u-del')) e.target.closest('tr').remove();
    else if (e.target.classList.contains('u-gen')) genBarcode($('.u-barcode', e.target.closest('tr')));
  });

  $('#f-gen').onclick = () => genBarcode($('#f-barcode'));
  $('#f-image').addEventListener('input', (e) => {
    const img = $('#f-image-preview');
    img.src = e.target.value.trim();
    img.style.display = e.target.value.trim() ? '' : 'none';
  });
  $('#f-lookup').onclick = async () => {
    const code = $('#f-barcode').value.trim();
    if (!code) return toast('Nhập hoặc quét mã vạch trước', true);
    toast('Đang tra cứu...');
    try {
      const r = await api('/api/barcode-lookup/' + encodeURIComponent(code));
      if (!r.found) return toast('Không tìm thấy thông tin cho mã này', true);
      if (!$('#f-name').value && r.name) $('#f-name').value = r.name;
      if (r.image) { $('#f-image').value = r.image; $('#f-image-preview').src = r.image; $('#f-image-preview').style.display = ''; }
      if (!$('#f-desc').value) $('#f-desc').value = [r.brand, r.quantity, r.categories].filter(Boolean).join(' · ');
      toast('Đã lấy thông tin từ mã vạch');
    } catch (e) { toast(e.message, true); }
  };

  const save = async () => {
    const units = $$('#unit-body .unit-row').map((tr) => ({
      id: $(`.u-id`, tr).value || undefined,
      name: $('.u-name', tr).value.trim(),
      conversion: $('.u-conv', tr).value,
      sell_price: $('.u-price', tr).value,
      barcode: $('.u-barcode', tr).value.trim(),
    })).filter((u) => u.name && Number(u.conversion) > 1);
    const body = {
      name: $('#f-name').value.trim(),
      barcode: $('#f-barcode').value.trim(),
      sku: $('#f-sku').value.trim(),
      image: $('#f-image').value.trim() || null,
      category_id: $('#f-cat').value || null,
      product_type: $('#f-type').value,
      unit: $('#f-unit').value.trim() || 'cái',
      location: $('#f-location').value.trim(),
      cost_price: $('#f-cost').value,
      sell_price: $('#f-price').value,
      stock: isNew ? $('#f-stock').value : undefined,
      min_stock: $('#f-min').value,
      max_stock: $('#f-max').value,
      warranty_months: $('#f-warranty').value,
      weight: $('#f-weight').value,
      description: $('#f-desc').value,
      allow_negative: $('#f-negative').checked ? 1 : 0,
      units,
    };
    try {
      const saved = await api(isNew ? '/api/products' : '/api/products/' + p.id, { method: isNew ? 'POST' : 'PUT', body });
      toast('Đã lưu sản phẩm');
      closeModal();
      if (onSaved) onSaved(saved);
    } catch (e) { toast(e.message, true); }
  };
  $('#f-save').onclick = save;
  $('#modal-box').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); save(); } });
}

async function genBarcode(input) {
  if (!input) return;
  try { const r = await api('/api/barcodes/next'); input.value = r.code; toast('Đã sinh mã ' + r.code); }
  catch (e) { toast(e.message, true); }
}

export function openStockAdjust(p, onDone) {
  modal(`<h2>Nhập / điều chỉnh kho</h2>
    <p><b>${esc(p.name)}</b> — tồn hiện tại: <b>${num(p.stock)} ${esc(p.unit)}</b></p>
    <div class="form-grid">
      <label class="fld">Hình thức<select class="field" id="s-type"><option value="import">Nhập thêm (+)</option><option value="adjust">Đặt lại tồn (=)</option></select></label>
      <label class="fld">Số lượng<input class="field" id="s-qty" type="number" step="any"></label>
      <label class="fld">Giá vốn mới (tuỳ chọn)<input class="field" id="s-cost" type="number" min="0" value="${p.cost_price}"></label>
      <label class="fld">Ghi chú<input class="field" id="s-note" placeholder="Nhà cung cấp, lý do..."></label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="s-save">Lưu</button><button class="btn" id="s-close">Đóng</button></div>`, { focus: '#s-qty' });
  $('#s-close').onclick = closeModal;
  const save = async () => {
    try {
      await api(`/api/products/${p.id}/stock`, { method: 'POST', body: { type: $('#s-type').value, qty: $('#s-qty').value, cost_price: $('#s-cost').value, note: $('#s-note').value } });
      toast('Đã cập nhật kho'); closeModal(); if (onDone) onDone();
    } catch (e) { toast(e.message, true); }
  };
  $('#s-save').onclick = save;
  $('#modal-box').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') save(); });
}
