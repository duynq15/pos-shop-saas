'use strict';

const TOKEN = (location.pathname.split('/')[2] || '').trim();
const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat('vi-VN');
const money = (n) => nf.format(Math.round(Number(n) || 0)) + ' ₫';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseMoney = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;
const TYPE = { in: 'Thu', out: 'Chi', adjust: 'Điều chỉnh' };

function entryRows(p) {
  return p.entries.map((e) => {
    const name = e.type === 'in' ? (e.anonymous ? 'Người hảo tâm' : (e.name || 'Chưa rõ tên')) : (e.note || TYPE[e.type]);
    const negative = e.type === 'out' || e.amount < 0;
    const sign = negative ? '-' : '+';
    const cls = negative ? 'dn-out' : 'dn-in';
    return `<tr><td>${esc(e.date)}</td><td>${esc(name)}</td><td class="r ${cls}">${sign}${money(Math.abs(e.amount))}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="rp-hint">Chưa có khoản nào</td></tr>';
}

function qrBlock(p) {
  if (!p.qrDataUrl) return '<div class="rp-empty">Đợt thu chưa cấu hình tài khoản nhận tiền.</div>';
  return `<div class="dn-pay">
    <div class="dn-qr"><img id="dn-img-${p.id}" src="${p.qrDataUrl}" alt="Mã QR chuyển khoản ${esc(p.name)}"></div>
    <div class="dn-pay-side">
      <div class="dn-bank"><b>${esc(p.bank_name || 'Ngân hàng')}</b><span>STK ${esc(p.bank_account || '')}</span>
        ${p.account_holder ? `<span>Chủ TK: ${esc(p.account_holder)}</span>` : ''}</div>
      <label class="dn-amt">Số tiền muốn đóng
        <input id="dn-amt-${p.id}" inputmode="numeric" autocomplete="off" placeholder="Ví dụ: 200000">
      </label>
      <button class="rp-btn rp-btn-primary" data-qr="${p.id}">Tạo QR đúng số tiền</button>
      <p class="rp-hint">Mở app ngân hàng, quét mã để chuyển. Nội dung chuyển khoản ghi tên đợt thu.</p>
    </div>
  </div>`;
}

function programCard(p) {
  const facts = [
    p.category ? `<span class="dn-chip">${esc(p.category)}</span>` : '',
    p.start_date || p.end_date ? `<span class="rp-hint">${esc(p.start_date || '…')} → ${esc(p.end_date || '…')}</span>` : '',
    p.target_amount ? `<span class="rp-hint">Mức đóng dự kiến: <b>${money(p.target_amount)}</b></span>` : '',
  ].filter(Boolean).join(' ');
  return `<div class="rp-card" id="fund-${p.id}">
    <div class="rp-card-head"><div><h2>${esc(p.name)}</h2><div class="dn-facts">${facts}</div></div>
      <div class="rp-hint">Đã thu: <b>${money(p.total)}</b></div></div>
    ${p.description ? `<p class="dn-desc">${esc(p.description)}</p>` : ''}
    ${qrBlock(p)}
    <div class="dn-sum">
      <span>Đã thu <b class="dn-in">${money(p.total)}</b></span>
      <span>Đã chi <b class="dn-out">${money(p.spent)}</b></span>
      <span>Còn lại <b>${money(p.balance)}</b></span>
    </div>
    <div class="rp-table-wrap"><table class="rp-table"><thead><tr><th>Ngày</th><th>Người nộp / nội dung</th><th class="r">Số tiền</th></tr></thead>
      <tbody>${entryRows(p)}</tbody></table></div>
  </div>`;
}

function bindQr(programs) {
  document.querySelectorAll('[data-qr]').forEach((btn) => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.qr);
      const p = programs.find((x) => x.id === id);
      const input = document.getElementById('dn-amt-' + id);
      const amount = parseMoney(input?.value || '');
      if (amount) input.value = nf.format(amount);
      const url = `/public/api/donations/${TOKEN}/funds/${id}/qr` + (amount ? `?amount=${amount}` : '');
      btn.disabled = true;
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || 'Không tạo được mã QR');
        const img = document.getElementById('dn-img-' + id);
        if (img) img.src = json.data.qrDataUrl;
        btn.textContent = amount ? 'Đã tạo QR ' + money(amount) : 'Đã tạo QR';
      } catch (e) {
        btn.textContent = e.message;
        setTimeout(() => { btn.textContent = 'Tạo QR đúng số tiền'; }, 2500);
      } finally { btn.disabled = false; }
    };
  });
}

(async function load() {
  try {
    const res = await fetch(`/public/api/donations/${TOKEN}`);
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Không tải được danh sách');
    const data = json.data;
    $('#dn-title').textContent = data.community_name;
    document.title = `Đợt thu & công đức — ${data.community_name}`;
    $('#dn-loading').remove();
    $('#dn-programs').innerHTML = data.programs.length
      ? data.programs.map(programCard).join('')
      : '<div class="rp-empty">Chưa có đợt thu nào được công khai</div>';
    bindQr(data.programs);
  } catch (e) {
    $('#dn-loading').textContent = e.message;
  }
})();
