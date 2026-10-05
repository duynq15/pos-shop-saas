'use strict';

const TOKEN = (location.pathname.split('/')[2] || '').trim();
const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat('vi-VN');
const money = (n) => nf.format(Math.round(Number(n) || 0)) + ' ₫';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function programCard(p) {
  const rows = p.entries.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.anonymous ? 'Người hảo tâm' : (e.name || 'Chưa rõ tên'))}</td><td class="r">${money(e.amount)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="rp-hint">Chưa có khoản ủng hộ</td></tr>';
  return `<div class="rp-card"><div class="rp-card-head"><h2>${esc(p.name)}</h2><div class="rp-hint">Tổng: ${money(p.total)}</div></div>
    <div class="rp-table-wrap"><table class="rp-table"><thead><tr><th>Ngày</th><th>Người ủng hộ</th><th class="r">Số tiền</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

(async function load() {
  try {
    const res = await fetch(`/public/api/donations/${TOKEN}`);
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Không tải được danh sách');
    const data = json.data;
    $('#dn-title').textContent = data.community_name;
    document.title = `Công đức — ${data.community_name}`;
    $('#dn-loading').remove();
    $('#dn-programs').innerHTML = data.programs.length
      ? data.programs.map(programCard).join('')
      : '<div class="rp-empty">Chưa có chương trình công đức nào</div>';
  } catch (e) {
    $('#dn-loading').textContent = e.message;
  }
})();
