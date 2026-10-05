import { $, $$, esc, num, money, toast, modal, closeModal, downloadCSV, debounce } from '../util.js';
import { api, state, loadCategories } from '../store.js';
import { openProductForm, openStockAdjust } from './product-form.js';
import { openPriceLists } from './price-lists.js';
import { openLabelPrint } from './labels.js';
import { icon } from '../icons.js';

let products = [];
let loadT;

export default {
  id: 'products',
  label: 'Sản phẩm',
  icon: icon('package'),
  key: 'F2',

  mount(el) {
    el.innerHTML = `
<div class="view-head"><div><h1>Sản phẩm &amp; giá</h1><div class="sub" id="prod-count"></div></div></div>
<div class="toolbar">
  <input class="field grow" id="prod-q" placeholder="Tìm tên / mã vạch / SKU...">
  <select class="field" id="prod-cat"><option value="">Tất cả danh mục</option></select>
  <label class="chk"><input type="checkbox" id="prod-low"> Sắp hết</label>
  <label class="chk"><input type="checkbox" id="prod-inactive"> Ngừng bán</label>
  <span class="spacer"></span>
  <button class="btn" id="btn-cat">Danh mục</button>
  <button class="btn" id="btn-price-lists">Bảng giá</button>
  <button class="btn" id="btn-gen-barcodes" title="Sinh mã vạch nội bộ cho sản phẩm/đơn vị chưa có mã">Sinh mã nội bộ</button>
  <button class="btn" id="btn-export">Xuất CSV</button>
  <button class="btn primary" id="btn-new-prod">+ Thêm sản phẩm</button>
</div>
<div class="tbl-wrap">
  <table class="grid"><thead><tr>
    <th>Mã vạch</th><th>SKU</th><th>Tên</th><th>Danh mục</th><th>ĐVT</th>
    <th class="r">Giá vốn</th><th class="r">Giá bán</th><th class="r">Tồn</th><th></th>
  </tr></thead><tbody id="prod-body"></tbody></table>
</div>`;

    loadT = debounce(load, 220);
    $('#prod-q').addEventListener('input', loadT);
    $('#prod-cat').addEventListener('change', load);
    $('#prod-low').addEventListener('change', load);
    $('#prod-inactive').addEventListener('change', load);
    $('#btn-new-prod').onclick = () => openProductForm({}, () => load());
    $('#btn-cat').onclick = openCategories;
    $('#btn-price-lists').onclick = openPriceLists;
    $('#btn-export').onclick = exportCSV;
    $('#btn-gen-barcodes').onclick = generateBarcodes;
    $('#prod-body').addEventListener('click', onRowAction);
  },

  async show() {
    await loadCategories();
    const sel = $('#prod-cat');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tất cả danh mục</option>' + state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = cur;
    await load();
  },
};

async function load() {
  const q = $('#prod-q').value.trim();
  const cat = $('#prod-cat').value;
  const low = $('#prod-low').checked ? 1 : 0;
  const all = $('#prod-inactive').checked ? 1 : 0;
  products = await api(`/api/products?q=${encodeURIComponent(q)}&category_id=${cat}&low=${low}&all=${all}&limit=1000`);
  $('#prod-count').textContent = `${products.length} sản phẩm`;
  $('#prod-body').innerHTML = products.map((p) => {
    const units = (p.units || []).filter((u) => !u.is_base);
    const unitCell = `${esc(p.unit)}${units.length ? `<span class="sub">${units.map((u) => `${esc(u.name)}×${num(u.conversion)}`).join(', ')}</span>` : ''}`;
    const lowCls = p.stock <= p.min_stock ? 'low' : '';
    return `<tr data-id="${p.id}">
      <td><code>${esc(p.barcode || '—')}</code></td>
      <td class="muted">${esc(p.sku || '')}</td>
      <td>${p.image ? `<img class="thumb" src="${esc(p.image)}" onerror="this.style.display='none'">` : ''}<span class="name">${esc(p.name)}</span>${p.active ? '' : ' <span class="badge cancelled">Ngừng bán</span>'}</td>
      <td>${esc(p.category_name || '')}</td>
      <td>${unitCell}</td>
      <td class="r">${num(p.cost_price)}</td>
      <td class="r"><b>${num(p.sell_price)}</b></td>
      <td class="r ${lowCls}">${num(p.stock)}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn sm" data-act="stock">Tồn</button>
        <button class="btn sm" data-act="label">Tem</button>
        <button class="btn sm" data-act="edit">Sửa</button>
        <button class="btn sm danger" data-act="del">Xóa</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="9" class="empty">Không có sản phẩm</td></tr>';
}

async function onRowAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(e.target.closest('tr').dataset.id);
  const p = products.find((x) => x.id === id);
  const act = btn.dataset.act;
  if (act === 'edit') openProductForm(p, () => load());
  if (act === 'label') openLabelPrint([p]);
  if (act === 'stock') openStockAdjust(p, () => load());
  if (act === 'del' && confirm(`Xóa "${p.name}"? Sản phẩm sẽ bị ẩn, hóa đơn cũ vẫn giữ.`)) {
    await api('/api/products/' + p.id, { method: 'DELETE' }); toast('Đã xóa'); load();
  }
}

function openCategories() {
  const render = async () => {
    await loadCategories();
    modal(`<h2>Danh mục</h2>
      <ul id="cat-list" style="padding-left:18px;line-height:2">${state.categories.map((c) => `<li>${esc(c.name)} <button class="del" data-id="${c.id}">✕</button></li>`).join('')}</ul>
      <div class="toolbar" style="margin-top:10px"><input class="field grow" id="cat-new" placeholder="Tên danh mục mới"><button class="btn primary" id="cat-add">Thêm</button><button class="btn" id="cat-close">Đóng</button></div>`);
    $('#cat-close').onclick = closeModal;
    $('#cat-add').onclick = async () => {
      try { await api('/api/categories', { method: 'POST', body: { name: $('#cat-new').value } }); toast('Đã thêm'); render(); } catch (e) { toast(e.message, true); }
    };
    $('#modal-box').addEventListener('click', async (e) => {
      if (e.target.dataset.id && confirm('Xóa danh mục?')) { await api('/api/categories/' + e.target.dataset.id, { method: 'DELETE' }); render(); }
    });
  };
  render();
}

async function generateBarcodes() {
  if (!confirm('Sinh mã vạch nội bộ (EAN-13, tiền tố 2) cho tất cả sản phẩm và đơn vị chưa có mã?')) return;
  try {
    const r = await api('/api/products/barcodes/generate', { method: 'POST', body: { include_units: true } });
    toast(`Đã sinh ${r.products} mã sản phẩm, ${r.units} mã đơn vị`);
    load();
  } catch (e) { toast(e.message, true); }
}

function exportCSV() {
  const rows = [['Mã vạch', 'SKU', 'Tên', 'Danh mục', 'ĐVT', 'Giá vốn', 'Giá bán', 'Tồn', 'Tồn tối thiểu'],
    ...products.map((p) => [p.barcode || '', p.sku || '', p.name, p.category_name || '', p.unit, p.cost_price, p.sell_price, p.stock, p.min_stock])];
  downloadCSV(`san-pham-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
