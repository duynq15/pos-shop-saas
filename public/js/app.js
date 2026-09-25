import { bootstrap, state } from './store.js';
import { $, $$, closeModal } from './util.js';
import { auth, loadMe, login, logout, can } from './auth.js';
import pos from './views/pos.js';
import products from './views/products.js';
import inventory from './views/inventory.js';
import invoices from './views/invoices.js';
import reports from './views/reports.js';
import promotions from './views/promotions.js';
import usersView from './views/users.js';
import settings from './views/settings.js';
import platformView from './views/platform.js';

const VIEWS = [
  { mod: pos, perm: 'pos.sell' },
  { mod: products, perm: 'product.view' },
  { mod: inventory, perm: 'stock.view' },
  { mod: invoices, perm: 'invoice.view' },
  { mod: reports, perm: 'report.view' },
  { mod: promotions, perm: 'promo.manage' },
  { mod: usersView, perm: 'user.manage' },
  { mod: settings, perm: 'settings.edit' },
  { mod: platformView, perm: 'platform' },
];

const registry = {};
const mounted = new Set();
let current = null;

const allowed = (perm) => {
  if (perm === 'platform') return auth.isPlatform;
  if (auth.isPlatform) return false;
  return can(perm);
};

function build() {
  const main = $('#main');
  const navList = $('#nav-list');
  navList.innerHTML = '';
  for (const { mod, perm } of VIEWS) {
    if (!allowed(perm)) continue;
    let sec = document.getElementById('view-' + mod.id);
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'view';
      sec.id = 'view-' + mod.id;
      main.appendChild(sec);
    }
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.view = mod.id;
    btn.innerHTML = `<span class="nav-icon">${mod.icon}</span><span class="nav-label">${mod.label}</span>${mod.key ? `<kbd>${mod.key}</kbd>` : ''}`;
    btn.onclick = () => { showView(mod.id); closeMenu(); };
    navList.appendChild(btn);
    registry[mod.id] = { ...mod, el: sec, btn };
  }
}

export function showView(id) {
  const r = registry[id];
  if (!r) return;
  if (current && registry[current]?.hide) registry[current].hide();
  current = id;
  $$('.view').forEach((x) => x.classList.toggle('active', x.id === 'view-' + id));
  $$('.nav-item[data-view]').forEach((x) => x.classList.toggle('active', x.dataset.view === id));
  if (!mounted.has(id)) { r.mount(r.el); mounted.add(id); }
  if (r.show) r.show();
  $('#mobile-title').textContent = r.label;
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
  const roleName = { owner: 'Chủ cửa hàng', manager: 'Quản lý', cashier: 'Thu ngân', sales: 'NV bán hàng', warehouse: 'Thủ kho', accountant: 'Kế toán', viewer: 'Chỉ xem', platform: 'Quản trị nền tảng' }[u.role] || u.role;
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
    await bootstrap();
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
