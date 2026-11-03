import { bootstrap, state } from './store.js';
import { $, $$, closeModal } from './util.js';
import { auth, loadMe, login, ssoLogin, skhgLogin, logout, can } from './auth.js';
import pos from './views/pos.js';
import products from './views/products.js';
import inventory from './views/inventory.js';
import invoices from './views/invoices.js';
import { makeReportView } from './views/reports.js';
import vietqr from './views/vietqr.js';
import promotions from './views/promotions.js';
import usersView from './views/users.js';
import settings from './views/settings.js';
import { platformViews } from './views/platform.js';
import communityView from './views/community.js';
import fundsView from './views/funds.js';
import quickpay from './views/quickpay.js';
import { icon } from './icons.js';
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

const reportOverview = makeReportView('overview');
const reportProducts = makeReportView('products');
const reportVat = makeReportView('vat');
const reportAnalytics = makeReportView('analytics');

// kinds: loại tenant được thấy mục này; bỏ trống = mọi loại (GĐ1.5, NFR-05).
const POS_KINDS = ['shop', 'seller'];
const VIEWS = [
  // Người bán nhỏ: màn đầu tiên là Nhận tiền nhanh (GĐ4.1); vẫn giữ đủ menu POS
  { mod: quickpay, perm: 'pos.sell', kinds: ['seller'] },
  { mod: pos, perm: 'pos.sell', kinds: POS_KINDS },
  { mod: products, perm: 'product.view', kinds: POS_KINDS },
  { mod: inventory, perm: 'stock.view', kinds: POS_KINDS },
  { mod: invoices, perm: 'invoice.view' },
  {
    mod: reportOverview, perm: 'report.view',
    subs: [
      { view: 'report-overview', label: 'Tổng quan' },
      { view: 'report-products', label: 'Báo cáo sản phẩm' },
      { view: 'report-vat', label: 'Thuế VAT' },
      { view: 'report-analytics', label: 'Phân tích thông minh' },
      { view: 'vietqr', label: 'Giao dịch VietQR' },
    ],
  },
  { mod: reportProducts, perm: 'report.view', subOnly: true },
  { mod: reportVat, perm: 'report.view', subOnly: true },
  { mod: reportAnalytics, perm: 'report.view', subOnly: true },
  { mod: vietqr, perm: 'report.view', subOnly: true },
  { mod: promotions, perm: 'promo.manage', kinds: POS_KINDS },
  { mod: communityView, perm: 'community.report', kinds: ['community'] },
  { mod: fundsView, perm: 'fund.view', kinds: ['community'] },
  { mod: usersView, perm: 'user.manage' },
  { mod: settings, perm: 'settings.edit' },
  // Menu quản trị nền tảng: hiện khi có một trong các quyền của menu (GĐ1.7)
  ...platformViews.map((mod) => ({ mod, perm: 'platform', any: mod.perms })),
];

const registry = {};
const mounted = new Set();
let current = null;

const allowed = (perm, any) => {
  if (perm === 'platform') return auth.isPlatform && (!any || any.some(can));
  if (auth.isPlatform) return false;
  return can(perm);
};

const kindOk = (kinds) => !kinds || kinds.includes(auth.tenant?.kind || 'shop');
const entryFor = (id) => VIEWS.find((v) => v.mod.id === id) || {};
// Tab cha của một màn con (Báo cáo › Thuế VAT…) để tab trên cùng vẫn sáng
const groupOf = (id) => VIEWS.find((v) => v.subs?.some((s) => s.view === id))?.mod.id || id;

function build() {
  const main = $('#main');
  const navList = $('#nav-list');
  const subRow = $('#nav-subrow');
  navList.innerHTML = '';
  subRow.innerHTML = '';
  for (const entry of VIEWS) {
    const { mod, perm, subs, subOnly, kinds } = entry;
    if (!allowed(perm, entry.any) || !kindOk(kinds)) continue;
    let sec = document.getElementById('view-' + mod.id);
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'view';
      sec.id = 'view-' + mod.id;
      main.appendChild(sec);
    }
    registry[mod.id] = { ...mod, el: sec, btn: null };
    if (subOnly) continue; // đăng ký view nhưng không hiện mục top-level
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (subs ? ' has-subs' : '');
    btn.dataset.view = mod.id;
    btn.innerHTML = `<span class="nav-icon">${mod.icon}</span><span class="nav-label">${mod.label.replace(/ · .*/, '')}</span>`;
    btn.onclick = () => showView(mod.id);
    navList.appendChild(btn);
    registry[mod.id].btn = btn;
    if (subs) {
      const wrap = document.createElement('div');
      wrap.className = 'nav-subs hidden';
      wrap.id = 'subs-' + mod.id;
      for (const s of subs) {
        const se = entryFor(s.view);
        if (!allowed(se.perm) || !kindOk(se.kinds)) continue;
        const sb = document.createElement('button');
        sb.className = 'nav-sub';
        sb.dataset.subview = s.view;
        if (s.anchor) sb.dataset.anchor = s.anchor;
        sb.textContent = s.label;
        sb.onclick = () => showView(s.view, s.anchor);
        wrap.appendChild(sb);
      }
      subRow.appendChild(wrap);
    }
  }
}

export function showView(id, anchor) {
  const r = registry[id];
  if (!r) return;
  const same = current === id;
  if (current && registry[current]?.hide) registry[current].hide();
  current = id;
  $$('.view').forEach((x) => x.classList.toggle('active', x.id === 'view-' + id));
  const group = groupOf(id);
  $$('.nav-item[data-view]').forEach((x) => {
    const on = x.dataset.view === group;
    x.classList.toggle('active', on);
    if (on) { x.setAttribute('aria-current', 'page'); x.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else x.removeAttribute('aria-current');
  });
  $$('.nav-subs').forEach((x) => x.classList.toggle('hidden', x.id !== 'subs-' + group));
  $$('.nav-sub').forEach((x) => {
    const match = x.dataset.subview === id && (anchor || '') === (x.dataset.anchor || '');
    x.classList.toggle('active', match);
  });
  if (!mounted.has(id)) { r.mount(r.el); mounted.add(id); }
  if (!same && r.show) r.show();
  if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}
window.showView = showView;

document.addEventListener('keydown', (e) => {
  const r = registry[current];
  if (r?.onKey) { if (r.onKey(e) === true) return; }
  if (e.defaultPrevented) return;
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) { closeModal(); return; }
  for (const id of Object.keys(registry)) {
    const v = registry[id];
    if (v.key && e.key === v.key) { e.preventDefault(); showView(id); return; }
  }
});

export function refreshBrand() {
  const name = state.settings.shop_name || 'POS Shop';
  const el = $('#brand-name');
  if (el) { el.textContent = name; el.title = name; }
  document.title = `${name} – POS Shop`;
}

function renderUser() {
  const el = $('#sidebar-user');
  if (!el) return;
  const u = auth.user;
  if (!u) { el.innerHTML = ''; return; }
  const roleName = u.role_name || u.role;
  el.innerHTML = `<div class="su-text"><div class="su-name">${esc(u.full_name || u.username)}</div>
    <div class="su-meta">${esc(roleName)}</div></div>
    <button class="btn" id="btn-logout">Đăng xuất</button>`;
  $('#btn-logout').onclick = async () => { await logout(); location.reload(); };
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showLogin() {
  $('#app-loading')?.classList.add('hidden');
  $('#login-screen')?.classList.remove('hidden');
  setTimeout(() => $('#login-user')?.focus(), 50);
}

let loginBound = false;
let skhgMode = false; // true: đăng nhập bằng tài khoản Sáng Kiến Hưng Gia (SĐT/email + mật khẩu SKHG)
function setLoginMode(on) {
  skhgMode = on;
  $('#login-user-label').textContent = on ? 'Số điện thoại hoặc email Sáng Kiến Hưng Gia' : 'Tài khoản';
  $('#login-submit').textContent = on ? 'Đăng nhập bằng Sáng Kiến Hưng Gia' : 'Đăng nhập';
  $('#login-mode').textContent = on ? 'Đăng nhập bằng tài khoản Thanh toán số' : 'Đăng nhập bằng tài khoản Sáng Kiến Hưng Gia';
  $('#login-choose').hidden = true;
  $('#login-error').textContent = '';
  $('#login-user').focus();
}

function bindLogin() {
  if (loginBound) return;
  loginBound = true;
  $('#login-mode').onclick = () => setLoginMode(!skhgMode);
  const send = async (thon) => {
    const btn = $('#login-submit');
    const err = $('#login-error');
    const label = btn.textContent;
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
    try {
      const user = $('#login-user').value.trim(), pass = $('#login-pass').value;
      if (skhgMode) {
        const d = await skhgLogin(user, pass, thon);
        if (d.choose) { showChoose(d.choose); btn.disabled = false; btn.textContent = label; return; }
      } else await login(user, pass);
      await start();
    } catch (ex) {
      err.textContent = ex.message || 'Đăng nhập thất bại';
      btn.disabled = false; btn.textContent = label;
    }
  };
  // Một tài khoản SKHG quản lý sổ quỹ của nhiều thôn: chọn thôn rồi đăng nhập lại
  const showChoose = (list) => {
    const box = $('#login-choose');
    box.innerHTML = '<p>Bạn quản lý sổ quỹ của nhiều thôn. Chọn thôn để vào:</p>'
      + list.map((t) => `<button type="button" class="btn big" data-thon="${esc(t.code)}">${esc(t.name)}</button>`).join('');
    box.querySelectorAll('[data-thon]').forEach((b) => { b.onclick = () => send(b.dataset.thon); });
    box.hidden = false;
  };
  $('#login-form').addEventListener('submit', (e) => { e.preventDefault(); send(); });
  window.addEventListener('auth:required', () => { if (auth.user) { auth.user = null; } showLogin(); });
}

async function boot() {
  try {
    if (!auth.isPlatform) await bootstrap();
    refreshBrand();
    renderUser();
    build();
    // ?view=<id> (liên kết từ Làng Số) mở thẳng màn đó nếu tài khoản được xem
    const want = new URLSearchParams(location.search).get('view');
    const first = registry[want] ? want : Object.keys(registry)[0];
    if (first) showView(first);
    // Sổ quỹ thôn và tài khoản nền tảng không dùng máy bán hàng trong mạng LAN
    $('#btn-lan').hidden = auth.isPlatform || auth.tenant?.kind === 'community';
    $('#btn-lan')?.addEventListener('click', async () => {
      if (auth.isPlatform) return;
      const { showLanInfo } = await import('./views/lan.js');
      showLanInfo();
    });
  } catch (e) {
    $('#app-loading').innerHTML = `<p style="color:#e5484d">Không tải được dữ liệu: ${e.message}</p>`;
    return;
  }
  $('#app-loading').classList.add('hidden');
  $('#login-screen').classList.add('hidden');
}

async function start() {
  // Làng Số mở <web>/?thon=<mã>&view=funds#sso=<token SKHG>: đăng nhập bằng token rồi bỏ token khỏi thanh địa chỉ
  const sso = /[#&]sso=([^&]+)/.exec(location.hash);
  if (sso) {
    history.replaceState(null, '', location.pathname + location.search);
    try {
      await ssoLogin(decodeURIComponent(sso[1]), new URLSearchParams(location.search).get('thon'));
    } catch (e) {
      showLogin();
      $('#login-error').textContent = e.message;
      return;
    }
  }
  const authed = await loadMe();
  if (!authed) { showLogin(); return; }
  await boot();
}

(async function init() {
  bindLogin();
  try {
    await start();
  } catch (e) {
    $('#app-loading').innerHTML = `<p style="color:#e5484d">Lỗi khởi động: ${e.message}</p>`;
  }
})();
