import { $, esc, num, modal, closeModal, toast } from '../util.js';
import { api, loadPriceLists, state } from '../store.js';

export async function openPriceLists() {
  let lists = await loadPriceLists();
  renderList(lists);

  async function renderList() {
    lists = await loadPriceLists();
    modal(`<h2>Bảng giá</h2>
      <p class="muted">Bảng giá dùng để áp giá bán riêng cho từng nhóm khách (lẻ, buôn...). Chọn một bảng để chỉnh giá.</p>
      <div class="tbl-wrap" style="box-shadow:none">
        <table class="grid"><thead><tr><th>Tên bảng giá</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${lists.map((l) => `<tr data-id="${l.id}">
          <td class="name">${esc(l.name)} ${l.is_default ? '<span class="badge paid">Mặc định</span>' : ''}</td>
          <td class="muted">${esc(l.note || '')}</td>
          <td class="r"><button class="btn sm" data-act="items">Chỉnh giá</button>
            <button class="btn sm" data-act="edit">Sửa</button>
            ${l.is_default ? '' : '<button class="btn sm danger" data-act="del">Xóa</button>'}</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div class="modal-actions"><button class="btn primary" id="pl-add">+ Thêm bảng giá</button><button class="btn" id="pl-close">Đóng</button></div>`);
    $('#pl-close').onclick = closeModal;
    $('#pl-add').onclick = () => {
      const name = prompt('Tên bảng giá mới:');
      if (name) api('/api/price-lists', { method: 'POST', body: { name } }).then(() => toast('Đã thêm')).then(renderList).catch((e) => toast(e.message, true));
    };
    $('#modal-box').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = Number(btn.closest('tr').dataset.id);
      const list = lists.find((l) => l.id === id);
      if (btn.dataset.act === 'items') return openItems(list);
      if (btn.dataset.act === 'edit') {
        const name = prompt('Tên bảng giá:', list.name);
        if (name) api('/api/price-lists/' + id, { method: 'PUT', body: { ...list, name } }).then(renderList).catch((er) => toast(er.message, true));
      }
      if (btn.dataset.act === 'del' && confirm(`Xóa bảng giá "${list.name}"?`)) {
        api('/api/price-lists/' + id, { method: 'DELETE' }).then(() => toast('Đã xóa')).then(renderList).catch((er) => toast(er.message, true));
      }
    });
  }

  async function openItems(list) {
    const [products, existing] = await Promise.all([api('/api/products?all=1&limit=1000'), api(`/api/price-lists/${list.id}/items`)]);
    const priceMap = Object.fromEntries(existing.map((i) => [i.unit_id, i.price]));
    const rows = [];
    for (const p of products) for (const u of p.units || []) {
      rows.push({ unit_id: u.id, product: p.name, unit: u.name, base: u.sell_price, price: priceMap[u.id] ?? '' });
    }
    const rowHTML = (r) => `<tr data-unit="${r.unit_id}" data-name="${esc((r.product + ' ' + r.unit).toLowerCase())}">
      <td>${esc(r.product)}<span class="sub">${esc(r.unit)} · giá gốc ${num(r.base)}</span></td>
      <td class="r"><input class="field pl-price" type="number" min="0" value="${r.price}" style="width:130px;text-align:right"></td>
    </tr>`;
    modal(`<h2>Giá cho "${esc(list.name)}"</h2>
      <input class="field" id="pl-search" placeholder="Tìm sản phẩm..." style="margin-bottom:10px">
      <div class="scroll-x" style="max-height:52vh;overflow:auto"><table class="line-items"><thead><tr><th>Sản phẩm / đơn vị</th><th class="r">Giá bán</th></tr></thead>
      <tbody id="pl-body">${rows.map(rowHTML).join('')}</tbody></table></div>
      <p class="muted">Để trống = dùng giá gốc của sản phẩm.</p>
      <div class="modal-actions"><button class="btn primary" id="pl-save">Lưu giá</button><button class="btn" id="pl-back">Quay lại</button></div>`);
    $('#pl-back').onclick = renderList;
    $('#pl-search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      for (const tr of document.querySelectorAll('#pl-body tr')) tr.style.display = tr.dataset.name.includes(q) ? '' : 'none';
    };
    $('#pl-save').onclick = async () => {
      const items = [];
      for (const tr of document.querySelectorAll('#pl-body tr')) {
        const v = tr.querySelector('.pl-price').value;
        if (v !== '') items.push({ unit_id: Number(tr.dataset.unit), price: Number(v) });
      }
      try { await api(`/api/price-lists/${list.id}/items`, { method: 'PUT', body: { items } }); toast('Đã lưu bảng giá'); renderList(); } catch (e) { toast(e.message, true); }
    };
  }
}
