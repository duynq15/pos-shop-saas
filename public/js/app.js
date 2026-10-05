import { bootstrap, state } from './store.js';
import { $, $$, closeModal } from './util.js';
import { auth, loadMe, login, logout, can } from './auth.js';
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
const collapsed = new Set();

function setGroup(id, open) {
  const wrap = document.getElementById('subs-' + id);
  const btn = document.querySelector(`.nav-item[data-view="${id}"]`);
  if (!wrap) return;
  wrap.classList.toggle('hidden', !open);
  if (btn) btn.classList.toggle('open', open);
  if (open) collapsed.delete(id); else collapsed.add(id);
}
function toggleGroup(id) { setGroup(id, collapsed.has(id)); }

function build() {
  const main = $('#main');
  const navList = $('#nav-list');
  navList.innerHTML = '';
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
    btn.innerHTML = `<span class="nav-icon">${mod.icon}</span><span class="nav-label">${mod.label}</span>`
      + (subs ? '<span class="caret">▾</span>' : (mod.key ? `<kbd>${mod.key}</kbd>` : ''));
    btn.onclick = (e) => {
      if (subs && e.target.classList.contains('caret')) { toggleGroup(mod.id); return; }
      showView(mod.id);
      if (subs) setGroup(mod.id, !collapsed.has(mod.id));
      closeMenu();
    };
    navList.appendChild(btn);
    registry[mod.id].btn = btn;
    if (subs) {
      const wrap = document.createElement('div');
      wrap.className = 'nav-subs';
      wrap.id = 'subs-' + mod.id;
      for (const s of subs) {
        const se = entryFor(s.view);
        if (!allowed(se.perm) || !kindOk(se.kinds)) continue;
        const sb = document.createElement('button');
        sb.className = 'nav-sub';
        sb.dataset.subview = s.view;
        if (s.anchor) sb.dataset.anchor = s.anchor;
        sb.textContent = s.label;
        sb.onclick = () => { showView(s.view, s.anchor); setGroup(mod.id, true); closeMenu(); };
        wrap.appendChild(sb);
      }
      navList.appendChild(wrap);
      setGroup(mod.id, true);
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
  $$('.nav-item[data-view]').forEach((x) => x.classList.toggle('active', x.dataset.view === id));
  $$('.nav-sub').forEach((x) => {
    const match = x.dataset.subview === id && (anchor || '') === (x.dataset.anchor || '');
    x.classList.toggle('active', match);
  });
  if (!mounted.has(id)) { r.mount(r.el); mounted.add(id); }
  if (!same && r.show) r.show();
  $('#mobile-title').textContent = r.label;
  if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}
window.showView = showView;

function openMenu() { document.body.classList.add('menu-open'); }
function closeMenu() { document.body.classList.remove('menu-open'); }

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
  if (el) el.textContent = name.length > 22 ? 'POS Shop' : name;
  document.title = `${name} – POS Shop`;
}

function renderUser() {
  const el = $('#sidebar-user');
  if (!el) return;
  const u = auth.user;
  if (!u) { el.innerHTML = ''; return; }
  const roleName = u.role_name || u.role;
  el.innerHTML = `<div class="su-name">${esc(u.full_name || u.username)}</div>
    <div class="su-meta">${esc(roleName)}${auth.tenant ? ' · ' + esc(auth.tenant.name) : ''}</div>
    <button class="btn sm" id="btn-logout">Đăng xuất</button>`;
  $('#btn-logout').onclick = async () => { await logout(); location.reload(); };
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showLogin() {
  document.body.classList.remove('menu-open');
  $('#app-loading')?.classList.add('hidden');
  $('#login-screen')?.classList.remove('hidden');
  setTimeout(() => $('#login-user')?.focus(), 50);
}

let loginBound = false;
function bindLogin() {
  if (loginBound) return;
  loginBound = true;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-submit');
    const err = $('#login-error');
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
    try {
      await login($('#login-user').value.trim(), $('#login-pass').value);
      await start();
    } catch (ex) {
      err.textContent = ex.message || 'Đăng nhập thất bại';
      btn.disabled = false; btn.textContent = 'Đăng nhập';
    }
  });
  window.addEventListener('auth:required', () => { if (auth.user) { auth.user = null; } showLogin(); });
}

async function boot() {
  try {
    if (!auth.isPlatform) await bootstrap();
    refreshBrand();
    renderUser();
    build();
    const first = Object.keys(registry)[0];
    if (first) showView(first);
    const ver = $('#app-version');
    if (ver && state.info) ver.textContent = `Node ${state.info.node?.replace('v', '')} · SaaS`;
    $('#btn-menu')?.addEventListener('click', openMenu);
    $('#nav-overlay')?.addEventListener('click', closeMenu);
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
