import { $, $$, esc, num, money, toast, modal, closeModal, downloadCSV, statusBadge, moveTypeLabel, today, addDays } from '../util.js';
import { api, state, loadSuppliers, loadCategories } from '../store.js';
import { icon } from '../icons.js';

let tab = 'stock';
let productsCache = null;

async function allProducts() {
  if (!productsCache) productsCache = await api('/api/products?all=1&limit=1000');
  return productsCache;
}

export default {
  id: 'inventory',
  label: 'Kho',
  icon: icon('tag'),
  key: 'F3',

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Quản lý kho</h1><div class="sub">Tồn kho · Nhập hàng · Kiểm kho · Sổ kho</div></div></div>
<div class="tabs" id="inv-tabs">
  <button class="tab active" data-tab="stock">Tồn kho</button>
  <button class="tab" data-tab="purchases">Nhập hàng</button>
  <button class="tab" data-tab="checks">Kiểm kho</button>
  <button class="tab" data-tab="ledger">Sổ kho</button>
</div>
<div id="inv-body"></div>`;
    $('#inv-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      tab = b.dataset.tab;
      $$('#inv-tabs .tab').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
  },

  async show() {
    productsCache = null;
    await loadCategories();
    render();
  },
};

function render() {
  if (tab === 'stock') renderStock();
  else if (tab === 'purchases') renderPurchases();
  else if (tab === 'checks') renderChecks();
  else renderLedger();
}

/* ===================== TỒN KHO ===================== */
async function renderStock() {
  const [summary, products] = await Promise.all([api('/api/stock/summary'), allProducts()]);
  $('#inv-body').innerHTML = `
    <div class="stats">
      <div class="stat primary"><span class="k">Giá trị tồn (giá vốn)</span><div class="v">${money(summary.total_value)}</div></div>
      <div class="stat"><span class="k">Giá trị theo giá bán</span><div class="v">${money(summary.retail_value)}</div></div>
      <div class="stat"><span class="k">Tổng số lượng</span><div class="v">${num(summary.total_qty)}</div></div>
      <div class="stat ${summary.low_stock ? 'warn' : ''}"><span class="k">Sắp hết hàng</span><div class="v">${num(summary.low_stock)}</div></div>
      <div class="stat ${summary.out_of_stock ? 'danger' : ''}"><span class="k">Hết hàng</span><div class="v">${num(summary.out_of_stock)}</div></div>
    </div>
    <div class="toolbar">
      <input class="field grow" id="st-q" placeholder="Tìm sản phẩm...">
      <label class="chk"><input type="checkbox" id="st-low"> Chỉ hiện sắp hết</label>
      <span class="spacer"></span>
      <button class="btn" id="st-export">Xuất CSV</button>
    </div>
    <div class="tbl-wrap"><table class="grid"><thead><tr>
      <th>Mã vạch</th><th>Tên</th><th>Danh mục</th><th class="r">Tồn</th><th class="r">Tồn tối thiểu</th>
      <th class="r">Giá vốn</th><th class="r">Giá trị tồn</th><th></th></tr></thead>
      <tbody id="st-body"></tbody></table></div>`;
  const paint = () => {
    const q = $('#st-q').value.toLowerCase();
    const low = $('#st-low').checked;
    const rows = products.filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)) && (!low || p.stock <= p.min_stock));
    $('#st-body').innerHTML = rows.map((p) => `<tr data-id="${p.id}">
      <td><code>${esc(p.barcode || '—')}</code></td><td><span class="name">${esc(p.name)}</span></td>
      <td>${esc(p.category_name || '')}</td>
      <td class="r ${p.stock <= p.min_stock ? 'low' : ''}">${num(p.stock)} ${esc(p.unit)}</td>
      <td class="r muted">${num(p.min_stock)}</td>
      <td class="r">${num(p.cost_price)}</td>
      <td class="r">${num(p.stock * p.cost_price)}</td>
      <td class="r"><button class="btn sm" data-act="adj">Điều chỉnh</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Không có sản phẩm</td></tr>';
  };
  paint();
  $('#st-q').addEventListener('input', paint);
  $('#st-low').addEventListener('change', paint);
  $('#st-export').onclick = () => downloadCSV(`ton-kho-${today()}.csv`, [['Mã vạch', 'Tên', 'Danh mục', 'Tồn', 'Tồn tối thiểu', 'Giá vốn', 'Giá trị tồn'],
    ...products.map((p) => [p.barcode || '', p.name, p.category_name || '', p.stock, p.min_stock, p.cost_price, p.stock * p.cost_price])]);
  $('#st-body').addEventListener('click', (e) => {
    if (e.target.dataset.act !== 'adj') return;
    const p = products.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    openAdjust(p).then(() => { productsCache = null; renderStock(); });
  });
}

async function openAdjust(p) {
  const { openStockAdjust } = await import('./product-form.js');
  return openStockAdjust(p);
}

/* ===================== NHẬP HÀNG ===================== */
async function renderPurchases() {
  const list = await api('/api/purchases?limit=500');
  $('#inv-body').innerHTML = `
    <div class="toolbar">
      <input type="date" class="field" id="pu-from" value="${addDays(today(), -30)}">
      <input type="date" class="field" id="pu-to" value="${today()}">
      <input class="field grow" id="pu-q" placeholder="Mã phiếu / nhà cung cấp...">
      <button class="btn" id="pu-filter">Lọc</button>
      <span class="spacer"></span>
      <button class="btn" id="pu-suppliers">Nhà cung cấp</button>
      <button class="btn primary" id="pu-new">+ Tạo phiếu nhập</button>
    </div>
    <div class="tbl-wrap"><table class="grid"><thead><tr>
      <th>Mã phiếu</th><th>Thời gian</th><th>Nhà cung cấp</th><th class="r">Tiền hàng</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody id="pu-body"></tbody></table></div>`;
  const paint = (rows) => {
    $('#pu-body').innerHTML = rows.map((p) => `<tr data-id="${p.id}">
      <td><b>${esc(p.code)}</b></td><td>${esc(p.created_at)}</td><td>${esc(p.supplier_name || '')}</td>
      <td class="r"><b>${money(p.total)}</b></td><td>${statusBadge(p.status)}</td>
      <td class="r"><button class="btn sm" data-act="view">Xem</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có phiếu nhập</td></tr>';
  };
  paint(list);
  const load = async () => {
    const rows = await api(`/api/purchases?from=${$('#pu-from').value}&to=${$('#pu-to').value}&q=${encodeURIComponent($('#pu-q').value)}`);
    paint(rows);
  };
  $('#pu-filter').onclick = load;
  $('#pu-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  $('#pu-new').onclick = () => openPurchaseForm(null, render);
  $('#pu-suppliers').onclick = openSuppliers;
  $('#pu-body').addEventListener('click', async (e) => {
    if (e.target.dataset.act !== 'view') return;
    const p = await api('/api/purchases/' + e.target.closest('tr').dataset.id);
    openPurchaseDetail(p);
  });
}

async function openPurchaseForm(existing, onDone) {
  const products = await allProducts();
  await loadSuppliers();
  const lines = existing ? existing.items.map((i) => ({ product_id: i.product_id, name: i.name, unit_id: i.unit_id, unit_name: i.unit_name, conversion: i.conversion, qty: i.qty, cost_price: i.cost_price })) : [];
  const prodOpts = products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  modal(`<h2>${existing ? 'Sửa' : 'Tạo'} phiếu nhập hàng</h2>
    <div class="toolbar">
      <select class="field" id="pu-product" style="min-width:220px"><option value="">— Chọn sản phẩm —</option>${prodOpts}</select>
      <select class="field" id="pu-unit"></select>
      <input class="field" id="pu-qty" type="number" step="any" placeholder="SL" style="width:90px">
      <input class="field" id="pu-cost" type="number" placeholder="Giá nhập" style="width:120px">
      <button class="btn" id="pu-add">Thêm</button>
    </div>
    <div class="scroll-x"><table class="line-items"><thead><tr><th>Sản phẩm</th><th>ĐVT</th><th class="r">SL</th><th class="r">Giá nhập</th><th class="r">Thành tiền</th><th></th></tr></thead>
      <tbody id="pu-lines"></tbody></table></div>
    <div class="rowline total"><span>TỔNG TIỀN HÀNG</span><b id="pu-total">0</b></div>
    <div class="form-grid" style="margin-top:12px">
      <label class="fld">Nhà cung cấp<select class="field" id="pu-supplier"><option value="">—</option>${state.suppliers.map((s) => `<option value="${s.id}" ${existing && existing.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="fld">Ghi chú<input class="field" id="pu-note" value="${esc(existing?.note || '')}"></label>
    </div>
    <div class="modal-actions">
      <button class="btn" id="pu-save">Lưu nháp</button>
      <button class="btn primary" id="pu-save-receive">Lưu &amp; nhập kho</button>
      <button class="btn" id="pu-close">Đóng</button>
    </div>`, { wide: true });

  const paintLines = () => {
    $('#pu-lines').innerHTML = lines.map((l, i) => `<tr><td>${esc(l.name)}</td><td>${esc(l.unit_name)}</td>
      <td class="r">${num(l.qty)}</td><td class="r">${num(l.cost_price)}</td><td class="r">${num(l.qty * l.cost_price)}</td>
      <td><button class="del" data-i="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có dòng hàng</td></tr>';
    $('#pu-total').textContent = money(lines.reduce((s, l) => s + l.qty * l.cost_price, 0));
  };
  paintLines();

  $('#pu-product').onchange = () => {
    const p = products.find((x) => x.id === Number($('#pu-product').value));
    const sel = $('#pu-unit');
    if (!p) { sel.innerHTML = ''; return; }
    sel.innerHTML = (p.units || []).map((u) => `<option value="${u.id}" data-conv="${u.conversion}">${esc(u.name)}${u.conversion > 1 ? ' ×' + u.conversion : ''}</option>`).join('');
    const u = (p.units || []).find((x) => x.is_base);
    $('#pu-cost').value = Math.round((p.cost_price || 0) * (u ? u.conversion : 1));
  };
  $('#pu-unit').onchange = () => {
    const p = products.find((x) => x.id === Number($('#pu-product').value));
    const u = (p?.units || []).find((x) => x.id === Number($('#pu-unit').value));
    if (p && u) $('#pu-cost').value = Math.round((p.cost_price || 0) * u.conversion);
  };
  $('#pu-add').onclick = () => {
    const p = products.find((x) => x.id === Number($('#pu-product').value));
    if (!p) return toast('Chọn sản phẩm', true);
    const u = (p.units || []).find((x) => x.id === Number($('#pu-unit').value)) || (p.units || [])[0];
    const qty = Number($('#pu-qty').value);
    const cost = Number($('#pu-cost').value);
    if (!qty) return toast('Nhập số lượng', true);
    lines.push({ product_id: p.id, name: p.name, unit_id: u ? u.id : null, unit_name: u ? u.name : p.unit, conversion: u ? u.conversion : 1, qty, cost_price: cost || 0 });
    $('#pu-qty').value = ''; paintLines();
  };
  $('#pu-lines').addEventListener('click', (e) => { if (e.target.dataset.i) { lines.splice(Number(e.target.dataset.i), 1); paintLines(); } });
  $('#pu-close').onclick = closeModal;

  const save = async (receive) => {
    if (!lines.length) return toast('Phiếu chưa có hàng', true);
    const body = { supplier_id: $('#pu-supplier').value || null, note: $('#pu-note').value, items: lines };
    try {
      const saved = existing
        ? await api('/api/purchases/' + existing.id, { method: 'PUT', body })
        : await api('/api/purchases', { method: 'POST', body });
      if (receive) await api(`/api/purchases/${saved.id}/receive`, { method: 'POST' });
      toast(receive ? 'Đã nhập kho' : 'Đã lưu phiếu');
      closeModal(); productsCache = null; onDone();
    } catch (e) { toast(e.message, true); }
  };
  $('#pu-save').onclick = () => save(false);
  $('#pu-save-receive').onclick = () => save(true);
}

async function openPurchaseDetail(p) {
  modal(`<h2>Phiếu nhập ${esc(p.code)} ${statusBadge(p.status)}</h2>
    <p class="muted">${esc(p.created_at)} · NCC: ${esc(p.supplier_name || '—')}${p.note ? ' · ' + esc(p.note) : ''}</p>
    <div class="scroll-x"><table class="line-items"><thead><tr><th>Sản phẩm</th><th>ĐVT</th><th class="r">SL</th><th class="r">Giá nhập</th><th class="r">Thành tiền</th></tr></thead>
    <tbody>${p.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.unit_name || '')}</td><td class="r">${num(i.qty)}</td><td class="r">${num(i.cost_price)}</td><td class="r">${num(i.line_total)}</td></tr>`).join('')}</tbody></table></div>
    <div class="rowline total"><span>TỔNG</span><b>${money(p.total)}</b></div>
    <div class="modal-actions">
      ${p.status === 'draft' ? `<button class="btn" id="pd-edit">Sửa</button><button class="btn primary" id="pd-receive">Nhập kho</button>` : ''}
      ${p.status !== 'cancelled' ? `<button class="btn danger" id="pd-cancel">Hủy phiếu</button>` : ''}
      <button class="btn" id="pd-close">Đóng</button>
    </div>`);
  $('#pd-close').onclick = closeModal;
  if ($('#pd-edit')) $('#pd-edit').onclick = () => openPurchaseForm(p, render);
  if ($('#pd-receive')) $('#pd-receive').onclick = async () => { try { await api(`/api/purchases/${p.id}/receive`, { method: 'POST' }); toast('Đã nhập kho'); closeModal(); productsCache = null; render(); } catch (e) { toast(e.message, true); } };
  if ($('#pd-cancel')) $('#pd-cancel').onclick = async () => { if (!confirm('Hủy phiếu nhập này?')) return; try { await api(`/api/purchases/${p.id}/cancel`, { method: 'POST' }); toast('Đã hủy'); closeModal(); productsCache = null; render(); } catch (e) { toast(e.message, true); } };
}

async function openSuppliers() {
  const rows = await api('/api/suppliers/payables');
  modal(`<h2>Nhà cung cấp &amp; công nợ</h2>
    <div class="scroll-x" style="max-height:52vh;overflow:auto"><table class="line-items"><thead><tr>
      <th>Nhà cung cấp</th><th>Điện thoại</th><th class="r">Đã mua</th><th class="r">Đã trả</th><th class="r">Còn nợ</th><th></th>
    </tr></thead>
    <tbody id="sup-body">${rows.map((r) => `<tr data-id="${r.id}"><td>${esc(r.name)}<span class="sub">${esc(r.tax_code || '')}</span></td>
      <td>${esc(r.phone || '')}</td><td class="r">${money(r.purchased)}</td><td class="r">${money(r.paid)}</td>
      <td class="r ${r.balance > 0 ? 'low' : ''}"><b>${money(r.balance)}</b></td>
      <td class="r"><button class="btn sm" data-act="pay">Trả tiền</button>
        <button class="btn sm" data-act="edit">Sửa</button>
        <button class="btn sm danger" data-act="del">Xóa</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có nhà cung cấp</td></tr>'}</tbody></table></div>
    <div class="toolbar" style="margin-top:10px">
      <input class="field" id="sup-name" placeholder="Tên NCC">
      <input class="field" id="sup-phone" placeholder="Điện thoại">
      <input class="field" id="sup-tax" placeholder="MST">
      <button class="btn primary" id="sup-add">Thêm</button>
      <button class="btn" id="sup-close">Đóng</button>
    </div>`);
  $('#sup-close').onclick = closeModal;
  $('#sup-add').onclick = async () => {
    try { await api('/api/suppliers', { method: 'POST', body: { name: $('#sup-name').value, phone: $('#sup-phone').value, tax_code: $('#sup-tax').value } }); toast('Đã thêm'); openSuppliers(); }
    catch (e) { toast(e.message, true); }
  };
  $('#sup-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const row = rows.find((x) => x.id === id);
    if (btn.dataset.act === 'del') { if (confirm(`Xóa "${row.name}"?`)) { await api('/api/suppliers/' + id, { method: 'DELETE' }); toast('Đã xóa'); openSuppliers(); } }
    if (btn.dataset.act === 'edit') openSupplierForm(row);
    if (btn.dataset.act === 'pay') openSupplierPayment(row);
  });
}

function openSupplierForm(s) {
  modal(`<h2>Sửa nhà cung cấp</h2>
    <div class="form-grid">
      <label class="fld">Tên *<input class="field" id="sf-name" value="${esc(s.name || '')}"></label>
      <label class="fld">Mã số thuế<input class="field" id="sf-tax" value="${esc(s.tax_code || '')}"></label>
      <label class="fld">Người liên hệ<input class="field" id="sf-contact" value="${esc(s.contact_name || '')}"></label>
      <label class="fld">Điện thoại<input class="field" id="sf-phone" value="${esc(s.phone || '')}"></label>
      <label class="fld">Điều khoản (ngày)<input class="field" id="sf-terms" type="number" min="0" value="${s.payment_terms_days || 0}"></label>
      <label class="fld">Địa chỉ<input class="field" id="sf-addr" value="${esc(s.address || '')}"></label>
      <label class="fld full">Ghi chú<input class="field" id="sf-note" value="${esc(s.note || '')}"></label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="sf-save">Lưu</button><button class="btn" id="sf-close">Đóng</button></div>`);
  $('#sf-close').onclick = closeModal;
  $('#sf-save').onclick = async () => {
    try {
      await api('/api/suppliers/' + s.id, { method: 'PUT', body: {
        name: $('#sf-name').value, tax_code: $('#sf-tax').value, contact_name: $('#sf-contact').value,
        phone: $('#sf-phone').value, payment_terms_days: $('#sf-terms').value, address: $('#sf-addr').value, note: $('#sf-note').value,
      } });
      toast('Đã lưu'); closeModal(); openSuppliers();
    } catch (e) { toast(e.message, true); }
  };
}

function openSupplierPayment(s) {
  modal(`<h2>Trả tiền – ${esc(s.name)}</h2>
    <p class="muted">Đang nợ: <b>${money(s.balance)}</b></p>
    <div class="form-grid">
      <label class="fld">Số tiền trả<input class="field" id="sp-amount" type="number" min="0" value="${s.balance > 0 ? s.balance : ''}"></label>
      <label class="fld">Hình thức<select class="field" id="sp-method"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></label>
      <label class="fld full">Ghi chú<input class="field" id="sp-note"></label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="sp-save">Lưu phiếu chi</button><button class="btn" id="sp-close">Đóng</button></div>`);
  $('#sp-close').onclick = closeModal;
  $('#sp-save').onclick = async () => {
    try {
      await api('/api/suppliers/' + s.id + '/payments', { method: 'POST', body: { amount: $('#sp-amount').value, method: $('#sp-method').value, note: $('#sp-note').value } });
      toast('Đã ghi phiếu chi'); closeModal(); openSuppliers();
    } catch (e) { toast(e.message, true); }
  };
}

/* ===================== KIỂM KHO ===================== */
async function renderChecks() {
  const list = await api('/api/stock-checks');
  $('#inv-body').innerHTML = `
    <div class="toolbar"><span class="muted">Kiểm kho giúp đối chiếu tồn thực tế và điều chỉnh chênh lệch.</span>
      <span class="spacer"></span><button class="btn primary" id="ck-new">+ Tạo phiếu kiểm kho</button></div>
    <div class="tbl-wrap"><table class="grid"><thead><tr>
      <th>Mã phiếu</th><th>Thời gian</th><th>Phạm vi</th><th class="r">Chênh lệch giá trị</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${list.map((c) => `<tr data-id="${c.id}">
        <td><b>${esc(c.code)}</b></td><td>${esc(c.created_at)}</td>
        <td>${c.scope === 'all' ? 'Toàn bộ' : 'Theo danh mục'}</td>
        <td class="r ${c.diff_value < 0 ? 'low' : ''}">${num(c.diff_value)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="r"><button class="btn sm" data-act="open">Mở</button>${c.status !== 'completed' ? ' <button class="btn sm danger" data-act="del">Xóa</button>' : ''}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có phiếu kiểm kho</td></tr>'}</tbody></table></div>`;
  $('#ck-new').onclick = openCheckCreate;
  $('#inv-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    if (btn.dataset.act === 'open') openCheckEditor(await api('/api/stock-checks/' + id));
    if (btn.dataset.act === 'del' && confirm('Xóa phiếu kiểm kho?')) { await api('/api/stock-checks/' + id, { method: 'DELETE' }); toast('Đã xóa'); renderChecks(); }
  });
}

async function openCheckCreate() {
  const cats = state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  modal(`<h2>Tạo phiếu kiểm kho</h2>
    <div class="form-grid">
      <label class="fld">Phạm vi<select class="field" id="ck-scope"><option value="all">Toàn bộ sản phẩm</option><option value="category">Theo danh mục</option></select></label>
      <label class="fld">Danh mục<select class="field" id="ck-cat" disabled><option value="">—</option>${cats}</select></label>
      <label class="fld full">Ghi chú<input class="field" id="ck-note"></label>
    </div>
    <div class="modal-actions"><button class="btn primary" id="ck-create">Tạo phiếu</button><button class="btn" id="ck-close">Đóng</button></div>`);
  $('#ck-close').onclick = closeModal;
  $('#ck-scope').onchange = (e) => { $('#ck-cat').disabled = e.target.value !== 'category'; };
  $('#ck-create').onclick = async () => {
    try {
      const c = await api('/api/stock-checks', { method: 'POST', body: { scope: $('#ck-scope').value, category_id: $('#ck-cat').value || null, note: $('#ck-note').value } });
      toast('Đã tạo phiếu kiểm kho'); renderChecks(); openCheckEditor(c);
    } catch (e) { toast(e.message, true); }
  };
}

function openCheckEditor(c) {
  const isDraft = c.status === 'draft';
  const rows = c.items.map((it) => `<tr data-id="${it.id}">
    <td>${esc(it.name)}<span class="sub">tồn hệ thống: ${num(it.system_qty)} ${esc(it.unit_name || '')}</span></td>
    <td class="c"><input class="field ck-count" type="number" step="any" value="${it.counted_qty ?? ''}" ${isDraft ? '' : 'disabled'} style="width:100px;text-align:center"></td>
    <td class="r ck-diff ${it.diff < 0 ? 'low' : ''}">${it.counted_qty == null ? '—' : num(it.diff)}</td>
    <td><input class="field ck-note" value="${esc(it.note || '')}" ${isDraft ? '' : 'disabled'}></td>
  </tr>`).join('');
  modal(`<h2>Phiếu kiểm kho ${esc(c.code)} ${statusBadge(c.status)}</h2>
    <p class="muted">${esc(c.created_at)}${c.note ? ' · ' + esc(c.note) : ''} · Nhập số lượng đếm thực tế, để trống nếu không kiểm.</p>
    <div class="scroll-x" style="max-height:52vh;overflow:auto"><table class="line-items"><thead><tr><th>Sản phẩm</th><th class="c">Thực tế</th><th class="r">Lệch</th><th>Ghi chú</th></tr></thead>
    <tbody id="ck-body">${rows}</tbody></table></div>
    <div class="modal-actions">
      ${isDraft ? `<button class="btn" id="ck-save">Lưu tạm</button><button class="btn primary" id="ck-complete">Chốt &amp; cập nhật tồn</button>` : ''}
      <button class="btn" id="ck-close2">Đóng</button>
    </div>`, { wide: true });
  $('#ck-close2').onclick = closeModal;
  const collect = () => [...document.querySelectorAll('#ck-body tr')].map((tr) => ({ id: Number(tr.dataset.id), counted_qty: tr.querySelector('.ck-count').value, note: tr.querySelector('.ck-note').value }));
  if (isDraft) {
    $('#ck-body').addEventListener('input', (e) => {
      if (!e.target.classList.contains('ck-count')) return;
      const tr = e.target.closest('tr');
      const sys = Number((tr.querySelector('.sub').textContent.match(/[\d.,]+/) || ['0'])[0].replace(/[.,]/g, '') || 0);
      const val = e.target.value === '' ? null : Number(e.target.value);
      const diff = val == null ? '—' : num(val - sys);
      tr.querySelector('.ck-diff').textContent = diff;
    });
    $('#ck-save').onclick = async () => { try { await api(`/api/stock-checks/${c.id}`, { method: 'PUT', body: { items: collect() } }); toast('Đã lưu'); } catch (e) { toast(e.message, true); } };
    $('#ck-complete').onclick = async () => {
      if (!confirm('Chốt phiếu và cập nhật tồn kho theo số thực tế?')) return;
      try {
        await api(`/api/stock-checks/${c.id}`, { method: 'PUT', body: { items: collect() } });
        await api(`/api/stock-checks/${c.id}/complete`, { method: 'POST' });
        toast('Đã chốt kiểm kho'); closeModal(); productsCache = null; renderChecks();
      } catch (e) { toast(e.message, true); }
    };
  }
}

/* ===================== SỔ KHO ===================== */
async function renderLedger() {
  $('#inv-body').innerHTML = `
    <div class="toolbar">
      <input type="date" class="field" id="lg-from" value="${addDays(today(), -30)}">
      <input type="date" class="field" id="lg-to" value="${today()}">
      <select class="field" id="lg-type"><option value="">Mọi loại</option><option value="sale">Bán hàng</option><option value="return">Trả hàng</option><option value="purchase">Nhập hàng</option><option value="check">Kiểm kho</option><option value="adjust">Điều chỉnh</option><option value="init">Tồn đầu</option><option value="cancel">Hủy</option></select>
      <input class="field grow" id="lg-q" placeholder="Tên sản phẩm / mã chứng từ...">
      <button class="btn" id="lg-filter">Lọc</button>
      <span class="spacer"></span>
      <button class="btn" id="lg-export">Xuất CSV</button>
    </div>
    <div class="tbl-wrap"><table class="grid"><thead><tr>
      <th>Thời gian</th><th>Sản phẩm</th><th>Loại</th><th class="r">Thay đổi</th><th class="r">Tồn sau</th><th>Chứng từ</th><th>Ghi chú</th></tr></thead>
      <tbody id="lg-body"></tbody></table></div>`;
  let rows = [];
  const load = async () => {
    rows = await api(`/api/stock/moves?from=${$('#lg-from').value}&to=${$('#lg-to').value}&type=${$('#lg-type').value}&q=${encodeURIComponent($('#lg-q').value)}`);
    $('#lg-body').innerHTML = rows.map((m) => `<tr>
      <td>${esc(m.created_at)}</td><td>${esc(m.product_name)}</td>
      <td>${moveTypeLabel(m.type)}</td>
      <td class="r ${m.qty < 0 ? 'low' : ''}">${m.qty > 0 ? '+' : ''}${num(m.qty)}</td>
      <td class="r">${m.stock_after == null ? '—' : num(m.stock_after)}</td>
      <td class="muted">${esc(m.ref || '')}</td><td class="muted">${esc(m.note || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Không có dữ liệu</td></tr>';
  };
  await load();
  $('#lg-filter').onclick = load;
  $('#lg-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  $('#lg-export').onclick = () => downloadCSV(`so-kho-${today()}.csv`, [['Thời gian', 'Sản phẩm', 'Loại', 'Thay đổi', 'Tồn sau', 'Chứng từ', 'Ghi chú'],
    ...rows.map((m) => [m.created_at, m.product_name, moveTypeLabel(m.type), m.qty, m.stock_after, m.ref || '', m.note || ''])]);
}
