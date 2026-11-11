'use strict';

const TOKEN = (location.pathname.split('/')[2] || '').trim();
const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat('vi-VN');
const money = (n) => nf.format(Math.round(Number(n) || 0)) + ' ₫';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseMoney = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;
const TYPE = { in: 'Thu', out: 'Chi', adjust: 'Điều chỉnh' };
const CONTRIB = { household: 'Mức đóng mỗi hộ', person: 'Mức đóng mỗi người', goal: 'Mục tiêu huy động' };

function entryRows(p) {
  return p.entries.map((e) => {
    const name = e.type === 'in' ? (e.anonymous ? 'Người hảo tâm' : (e.name || 'Chưa rõ tên')) : (e.note || TYPE[e.type]);
    const negative = e.type === 'out' || e.amount < 0;
    const sign = negative ? '-' : '+';
    const cls = negative ? 'dn-out' : 'dn-in';
    const tag = e.after_stop ? ' <span class="dn-tag">chi sau ngày ngừng thu</span>' : '';
    return `<tr><td>${esc(e.date)}</td><td>${esc(name)}${tag}</td><td class="r ${cls}">${sign}${money(Math.abs(e.amount))}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="rp-hint">Chưa có khoản nào</td></tr>';
}

// Khoá sổ: QR làm mờ + nhãn; ngừng thu: không QR, ghi rõ vẫn chi
function stateBlock(p) {
  if (p.state === 'locked') {
    return `<div class="dn-pay dn-locked"><div class="dn-qr dn-qr-off" aria-hidden="true"><span>Quỹ đã khoá sổ</span></div>
      <div class="dn-pay-side"><b>Không thu, không chi</b>
        <span>Số dư khi khoá sổ: <b>${money(p.lock_balance)}</b></span>
        ${p.minutes_url ? `<a class="rp-btn" href="${esc(p.minutes_url)}" target="_blank" rel="noopener">Xem biên bản khoá sổ</a>` : ''}</div></div>`;
  }
  if (p.state === 'stopped') return `<div class="rp-empty">${esc(p.status_text)}. Quỹ không nhận thêm tiền.</div>`;
  return qrBlock(p);
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
      <p class="rp-hint">Mở app ngân hàng, quét mã để chuyển. Giữ nguyên nội dung chuyển khoản <b>${esc(p.transfer_content || '')}</b>.</p>
    </div>
  </div>`;
}

const STATE_CLS = { collecting: 'dn-st-on', stopped: 'dn-st-stop', locked: 'dn-st-lock' };
function programCard(p) {
  const facts = [
    `<span class="dn-chip ${STATE_CLS[p.state] || ''}">${esc(p.state_label || '')}</span>`,
    p.nature_label ? `<span class="dn-chip">${esc(p.nature_label)}</span>` : '',
    p.category ? `<span class="dn-chip">${esc(p.category)}</span>` : '',
    p.status_text ? `<span class="rp-hint">${esc(p.status_text)}</span>` : '',
    p.contribution === 'voluntary' ? '<span class="rp-hint">Đóng góp tùy tâm</span>'
      : p.target_amount ? `<span class="rp-hint">${CONTRIB[p.contribution] || CONTRIB.household}: <b>${money(p.target_amount)}</b></span>` : '',
    p.progress != null ? `<span class="rp-hint">Đạt <b>${p.progress}%</b> mục tiêu</span>` : '',
  ].filter(Boolean).join(' ');
  const docs = (p.documents || []).map((d) => `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>`).join(' · ');
  return `<div class="rp-card" id="fund-${p.id}">
    <div class="rp-card-head"><div><h2>${esc(p.name)}</h2><div class="dn-facts">${facts}</div></div>
      <div class="rp-hint">Đã thu: <b>${money(p.total)}</b></div></div>
    ${p.unlock_text ? `<p class="dn-desc dn-warn">${esc(p.unlock_text)}</p>` : ''}
    ${p.description ? `<p class="dn-desc">${esc(p.description)}</p>` : ''}
    ${p.content ? `<details class="dn-content"><summary>Nội dung chi tiết</summary><div>${esc(p.content)}</div></details>` : ''}
    ${docs ? `<p class="dn-desc">Tài liệu: ${docs}</p>` : ''}
    ${stateBlock(p)}
    <div class="dn-sum">
      <span>${nf.format(p.donors || 0)} lượt đóng góp</span>
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
    const open = data.programs.filter((p) => p.state === 'collecting');
    const done = data.programs.filter((p) => p.state !== 'collecting');
    const notices = (data.notices || []).slice(0, 5);
    $('#dn-programs').innerHTML = (notices.length ? `<div class="rp-card dn-notices"><h2>Thông báo</h2><ul>${notices.map((n) =>
      `<li>${esc(n.message)} <span class="rp-hint">${esc(n.created_at.slice(0, 10))}</span></li>`).join('')}</ul></div>` : '')
      + (open.length ? open.map(programCard).join('') : '<div class="rp-empty">Hiện chưa có quỹ nào đang thu</div>')
      + (done.length ? `<h2 class="dn-done-title">Ngừng thu &amp; đã khoá sổ</h2>${done.map(programCard).join('')}` : '');
    bindQr(data.programs);
  } catch (e) {
    $('#dn-loading').textContent = e.message;
  }
})();
