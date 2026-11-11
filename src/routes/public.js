'use strict';

// Báo cáo thống kê giao dịch (cho ban điều hành) — góc nhìn trung lập của nền tảng.
// Trọng tâm: tổng giá trị giao dịch số, tổng số giao dịch, mức tham gia thanh toán số
// (đối tác cung cấp & đối tác thanh toán), phân trong/ngoài khu vực, nhóm sản phẩm.
// KHÔNG trả lợi nhuận/giá vốn. Không dùng khái niệm "bán hàng/doanh thu/cửa hàng".
//
//   GET /r/:token                          -> trang HTML
//   GET /public/api/report/:token          -> JSON (from,to,partner,area,category,q)
//   GET /public/api/report/:token/pdf      -> PDF A4 (server render)
//   GET /public/api/report/:token/groups.xlsx -> Excel nhóm sản phẩm

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { control, getPlatformSettings, communitySettings } = require('../control');
const db = require('../db');
const { ok, wrap, str } = require('../lib/util');
const { sendXlsx } = require('../lib/xlsx');
const { renderPdf, available } = require('../lib/pdf');
const { fundQr, fundSummary } = require('./funds');

const router = express.Router(); // mount tại /public/api
// API công khai, chỉ đọc: App / Web người dân gọi thẳng từ trình duyệt (docs/API-SO-QUY.md)
router.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Max-Age': '600' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const CACHE_TTL_MS = 60 * 1000;

const publicConfig = () => {
  const s = getPlatformSettings();
  return { enabled: s.public_report_enabled === '1', token: s.public_report_token || '' };
};

function validToken(given) {
  const { token } = publicConfig();
  if (!token || !given) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const { ymd: iso } = require('../lib/util'); // ngày theo giờ địa phương, không UTC
function parseRange(q) {
  const today = new Date();
  const defFrom = new Date(today.getTime() - 29 * 86400000);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : iso(defFrom);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : iso(today);
  return from <= to ? { from, to } : { from: to, to: from };
}
function parseFilters(q) {
  return { partner: str(q.partner, 40), area: str(q.area, 120), category: str(q.category, 80), q: str(q.q, 80) };
}
const inArea = (area, f) => {
  if (!f) return true;
  if (f === 'inside') return !!area;
  if (f === 'outside') return !area;
  return (area || '') === f;
};

/* ===================== Tổng hợp theo đối tác ===================== */
let curRange = [];
function collectPartner(code, f) {
  return db.runWith(code, () => {
    const t = control.prepare('SELECT code,name,status,area FROM tenants WHERE code=?').get(code);
    const meta = { code, name: (t && t.name) || code, status: (t && t.status) || 'active', area: (t && t.area) || '' };
    const pay = db.prepare(`SELECT
        COALESCE(SUM(p.amount),0) all_value,
        COALESCE(SUM(CASE WHEN p.method='transfer' THEN p.amount ELSE 0 END),0) digital_value,
        COALESCE(SUM(CASE WHEN p.method='transfer' THEN 1 ELSE 0 END),0) digital_txns,
        COUNT(*) all_txns
      FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
      WHERE i.status='paid' AND date(i.created_at) BETWEEN date(?) AND date(?)`).get(...curRange);

    const rets = db.prepare(`SELECT COUNT(*) c FROM invoices
      WHERE status='paid' AND type='return' AND date(created_at) BETWEEN date(?) AND date(?)`).get(...curRange).c;

    const payers = db.prepare(`SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(i.customer_phone),''), NULLIF(TRIM(i.customer_name),''))) c
      FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
      WHERE i.status='paid' AND p.method='transfer' AND date(i.created_at) BETWEEN date(?) AND date(?)
        AND (COALESCE(TRIM(i.customer_phone),'')<>'' OR COALESCE(TRIM(i.customer_name),'')<>'')`).get(...curRange).c;

    const items = db.prepare(`SELECT COALESCE(SUM(ii.base_qty),0) items
      FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
      WHERE i.status='paid' AND date(i.created_at) BETWEEN date(?) AND date(?)
        AND EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.invoice_id=i.id AND ip.method='transfer')`).get(...curRange).items;

    const products = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c;
    const low = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1 AND stock<=min_stock').get().c;
    const allCategories = db.prepare('SELECT name FROM categories ORDER BY sort_order, name').all().map((x) => x.name);

    const days = db.prepare(`SELECT date(i.created_at) day, COALESCE(SUM(p.amount),0) value, COUNT(*) txns
      FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
      WHERE i.status='paid' AND p.method='transfer' AND date(i.created_at) BETWEEN date(?) AND date(?)
      GROUP BY day`).all(...curRange);

    let grpSql = `SELECT COALESCE(c.name,'Khác') category,
        COUNT(DISTINCT ii.product_id) products,
        COALESCE(SUM(ii.base_qty),0) qty,
        COALESCE(SUM(ii.line_total),0) value
      FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
      LEFT JOIN products p ON p.id=ii.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE i.status='paid' AND date(i.created_at) BETWEEN date(?) AND date(?)
        AND EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.invoice_id=i.id AND ip.method='transfer')`;
    const grpParams = [...curRange];
    if (f.category) { grpSql += " AND COALESCE(c.name,'Khác')=?"; grpParams.push(f.category); }
    if (f.q) { grpSql += ' AND ii.name LIKE ?'; grpParams.push('%' + f.q + '%'); }
    grpSql += ' GROUP BY category';
    const groups = db.prepare(grpSql).all(...grpParams);

    return { ...meta, all_value: pay.all_value || 0, digital_value: pay.digital_value || 0, digital_txns: pay.digital_txns || 0, all_txns: pay.all_txns || 0, returns: rets, payers, items, products, low_stock: low, allCategories, days, groups };
  });
}

function aggregate(from, to, f) {
  curRange = [from, to];
  f = f || {};
  const tenants = control.prepare('SELECT code FROM tenants ORDER BY id').all();
  const dayMap = new Map();
  const groupMap = new Map();
  const areaMap = new Map();
  const included = [];
  const partnerOptions = [];
  const areaSet = new Map();
  const catSet = new Set();
  let failed = 0;

  for (const { code } of tenants) {
    let c;
    try { c = collectPartner(code, f); } catch { failed++; continue; }
    for (const n of c.allCategories) catSet.add(n);
    if (!c.digital_txns && !c.products) continue;
    partnerOptions.push({ code: c.code, name: c.name, area: c.area });
    if (c.area) areaSet.set(c.area, true);
    if (f.partner && f.partner !== code) continue;
    if (f.area && !inArea(c.area, f.area)) continue;
    included.push(c);
    for (const d of c.days) {
      const cur = dayMap.get(d.day) || { day: d.day, value: 0, txns: 0 };
      cur.value += d.value; cur.txns += d.txns; dayMap.set(d.day, cur);
    }
    for (const g of c.groups) {
      const cur = groupMap.get(g.category) || { category: g.category, products: 0, qty: 0, value: 0 };
      cur.products += g.products; cur.qty += g.qty; cur.value += g.value; groupMap.set(g.category, cur);
    }
    const label = c.area || 'Ngoài khu vực';
    const cur = areaMap.get(label) || { label, partners: 0, txns: 0, value: 0, inside: !!c.area };
    cur.partners += 1; cur.txns += c.digital_txns; cur.value += c.digital_value; areaMap.set(label, cur);
  }

  const byDay = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const monthMap = new Map();
  for (const d of byDay) {
    const m = d.day.slice(0, 7);
    const cur = monthMap.get(m) || { month: m, value: 0, txns: 0 };
    cur.value += d.value; cur.txns += d.txns; monthMap.set(m, cur);
  }

  const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
  const value = sum(included, 'digital_value');
  const txns = sum(included, 'digital_txns');
  const allValue = sum(included, 'all_value');
  const items = sum(included, 'items');
  const returns = sum(included, 'returns');
  const payers = sum(included, 'payers');

  const partners = included.slice()
    .map((c) => ({ code: c.code, name: c.name, area: c.area, inside: !!c.area, txns: c.digital_txns, value: c.digital_value, payers: c.payers, share: value ? Number((c.digital_value * 100 / value).toFixed(1)) : 0 }))
    .sort((a, b) => b.value - a.value);

  const partnersInside = partners.filter((p) => p.inside).length;
  const partnersOutside = partners.length - partnersInside;

  const groups = [...groupMap.values()].sort((a, b) => b.value - a.value)
    .map((g) => ({ ...g, share: value ? Number((g.value * 100 / value).toFixed(1)) : 0 }));

  const areas = [...areaMap.values()].sort((a, b) => b.value - a.value)
    .map((a) => ({ ...a, share: value ? Number((a.value * 100 / value).toFixed(1)) : 0 }));

  const areaOptions = [{ value: 'inside', label: 'Trong khu vực' }, { value: 'outside', label: 'Ngoài khu vực' }, ...[...areaSet.keys()].map((a) => ({ value: a, label: a }))];

  return {
    generated_at: new Date().toISOString(),
    from, to,
    filters: f,
    filter_options: {
      partners: partnerOptions,
      areas: areaOptions,
      categories: [...catSet].sort((a, b) => a.localeCompare(b, 'vi')),
    },
    totals: {
      partners: partners.length,
      partners_total: tenants.length,
      failed,
      partners_inside: partnersInside,
      partners_outside: partnersOutside,
      partners_txn: payers,
      txns,
      value,
      value_all: allValue,
      digital_share: allValue ? Number((value * 100 / allValue).toFixed(1)) : 0,
      partners_avg_txn: txns ? Math.round(value / txns) : 0,
      items,
      returns,
      products: sum(included, 'products'),
      low_stock: sum(included, 'low_stock'),
    },
    partners,
    by_day: byDay,
    by_month: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    areas,
    groups,
  };
}

let cache = { key: '', at: 0, data: null };
function report(from, to, f) {
  const key = `${from}|${to}|${publicConfig().token}|${f.partner}|${f.area}|${f.category}|${f.q}`;
  if (cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = aggregate(from, to, f);
  cache = { key, at: Date.now(), data };
  return data;
}

/* ===================== Routes ===================== */
router.get('/report/:token', wrap((req, res) => {
  const cfg = publicConfig();
  if (!cfg.enabled || !cfg.token) return res.status(404).json({ error: 'Báo cáo công khai chưa được bật' });
  if (!validToken(req.params.token)) return res.status(404).json({ error: 'Liên kết không hợp lệ' });
  const { from, to } = parseRange(req.query);
  ok(res, report(from, to, parseFilters(req.query)));
}));

const pdfName = (from, to) => `thong-ke-giao-dich-${from}_${to}.pdf`;

router.get('/report/:token/pdf', wrap(async (req, res) => {
  const cfg = publicConfig();
  if (!cfg.enabled || !cfg.token || !validToken(req.params.token)) return res.status(404).json({ error: 'Liên kết không hợp lệ hoặc đã hết hiệu lực' });
  if (!available()) return res.status(501).json({ error: 'Máy chủ chưa hỗ trợ tạo PDF tự động' });
  const { from, to } = parseRange(req.query);
  const f = parseFilters(req.query);
  const qs = new URLSearchParams({ from, to, static: '1' });
  for (const k of ['partner', 'area', 'category', 'q']) if (f[k]) qs.set(k, f[k]);
  const url = `${req.protocol}://${req.get('host')}/r/${encodeURIComponent(cfg.token)}?${qs.toString()}`;
  try {
    const buf = await renderPdf(url);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfName(from, to)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: 'Không tạo được PDF: ' + e.message });
  }
}));

// Xuất Excel nhóm sản phẩm (phục vụ tìm nhà cung cấp)
router.get('/report/:token/groups.xlsx', wrap((req, res) => {
  const cfg = publicConfig();
  if (!cfg.enabled || !cfg.token || !validToken(req.params.token)) return res.status(404).json({ error: 'Liên kết không hợp lệ hoặc đã hết hiệu lực' });
  const { from, to } = parseRange(req.query);
  const f = parseFilters(req.query);
  curRange = [from, to];
  const tenants = control.prepare('SELECT code FROM tenants ORDER BY id').all();
  const rows = [];
  const seen = new Map();
  for (const { code } of tenants) {
    let t;
    try { t = control.prepare('SELECT area FROM tenants WHERE code=?').get(code); } catch { continue; }
    if (f.partner && f.partner !== code) continue;
    if (f.area && !inArea((t && t.area) || '', f.area)) continue;
    let list;
    try {
      list = db.runWith(code, () => {
        let sql = `SELECT ii.name name, ii.product_id product_id, COALESCE(c.name,'Khác') category,
            COALESCE(SUM(ii.base_qty),0) qty, COALESCE(SUM(ii.line_total),0) value
          FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
          LEFT JOIN products p ON p.id=ii.product_id LEFT JOIN categories c ON c.id=p.category_id
          WHERE i.status='paid' AND date(i.created_at) BETWEEN date(?) AND date(?)
            AND EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.invoice_id=i.id AND ip.method='transfer')`;
        const params = [from, to];
        if (f.category) { sql += " AND COALESCE(c.name,'Khác')=?"; params.push(f.category); }
        if (f.q) { sql += ' AND ii.name LIKE ?'; params.push('%' + f.q + '%'); }
        sql += ' GROUP BY category, ii.product_id, ii.name ORDER BY category, value DESC';
        return db.prepare(sql).all(...params);
      });
    } catch { continue; }
    for (const r of list) {
      const key = r.category + '\u0000' + r.name;
      if (seen.has(key)) { const x = seen.get(key); x.qty += r.qty; x.value += r.value; } else { const x = { category: r.category, name: r.name, qty: r.qty, value: r.value }; seen.set(key, x); rows.push(x); }
    }
  }
  rows.sort((a, b) => a.category.localeCompare(b.category, 'vi') || b.value - a.value);
  const out = rows.map((r) => ({ 'Nhóm sản phẩm': r.category, 'Sản phẩm': r.name, 'Số lượng': r.qty, 'Giá trị giao dịch': r.value }));
  sendXlsx(res, `nhom-san-pham-${from}_${to}`, out, { sheet: 'Nhom san pham' });
}));

function page(req, res) {
  const cfg = publicConfig();
  if (!cfg.enabled || !cfg.token) return res.status(404).type('html').send('<h1>404</h1><p>Báo cáo công khai chưa được bật.</p>');
  if (!validToken(req.params.token)) return res.status(404).type('html').send('<h1>404</h1><p>Liên kết không hợp lệ hoặc đã hết hiệu lực.</p>');
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'report.html'));
}

/* ===================== Đợt thu & công đức công khai (GĐ2.9, FR-20) ===================== */
// Token duy nhất trên communities.donations_token; 404 như nhau dù token sai hay cờ đang tắt.
function publicCommunity(token) {
  if (!token) return null;
  const c = control.prepare('SELECT id,name,settings,donations_token FROM communities WHERE donations_token=?').get(String(token));
  return c && communitySettings(c.settings).public_donations ? c : null;
}
const communityTenant = (communityId) => control.prepare("SELECT code FROM tenants WHERE community_id=? AND kind='community'").get(communityId);
// Quỹ công khai hiện ở mọi trạng thái: Đang thu (có QR), Ngừng thu (vẫn chi, không QR), Khoá sổ (không QR, có biên bản).
const PUBLIC_FUND_SELECT = "SELECT * FROM funds WHERE status='active' AND locked_at IS NULL AND is_public=1";
const publicFundSql = `SELECT * FROM funds WHERE is_public=1
  ORDER BY CASE WHEN locked_at IS NOT NULL THEN 2 WHEN status='active' THEN 0 ELSE 1 END, COALESCE(locked_at, stopped_at) DESC, id`;
const NATURE_LABEL = { mandatory: 'Bắt buộc', campaign: 'Vận động', voluntary: 'Tự nguyện' };
const viDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

// Dòng trạng thái hiển thị sẵn cho web / App (đúng câu chữ của thiết kế Làng Số)
function statusText(f, state) {
  if (state === 'collecting') return f.end_date ? `Hạn thu ${viDate(f.end_date)}` : 'Đang thu';
  if (state === 'stopped') return f.stopped_at ? `Ngừng thu từ ${viDate(f.stopped_at.slice(0, 10))} · vẫn chi` : 'Ngừng thu · vẫn chi';
  return 'Không thu, không chi';
}

async function publicFund(f, token, { withEntries = true } = {}) {
  const { stateOf, STATE_LABEL, transferRef, docsOf } = pf();
  const state = stateOf(f);
  let qr = null;
  if (state === 'collecting') try { qr = await fundQr(f); } catch { qr = null; }
  const sum = fundSummary(f); // tổng trên toàn bộ bút toán, không chỉ 300 dòng hiển thị
  const docUrl = (id) => `/public/api/donations/${token}/documents/${id}`;
  const docs = docsOf(f.id);
  const minutes = f.lock_doc_id ? docs.find((d) => d.id === f.lock_doc_id) : null;
  const out = {
    id: f.id, code: f.code, name: f.name, kind: f.kind, fund_type: f.fund_type,
    nature: f.nature || null, nature_label: NATURE_LABEL[f.nature] || null,
    contribution: f.contribution, category: f.category, description: f.description, content: f.content || null,
    start_date: f.start_date, end_date: f.end_date, target_amount: f.target_amount,
    state, state_label: STATE_LABEL[state], status_text: statusText(f, state), round: f.round,
    // tương thích bản trước: status active | closed
    status: f.status,
    stopped_at: f.stopped_at || null,
    locked_at: f.locked_at || null, lock_balance: f.locked_at ? f.lock_balance : null,
    minutes_url: minutes ? docUrl(minutes.id) : null,
    unlocked_at: f.unlocked_at || null, unlock_reason: f.unlocked_at ? f.unlock_reason : null,
    unlock_text: f.unlocked_at ? `Đã mở khoá sổ ngày ${viDate(f.unlocked_at.slice(0, 10))} – lý do: ${f.unlock_reason}` : null,
    bank_account: state === 'collecting' ? f.bank_account : null, bank_name: state === 'collecting' ? f.bank_name : null,
    account_holder: state === 'collecting' ? f.account_holder : null,
    transfer_content: state === 'collecting' ? transferRef(f) : null,
    qrDataUrl: qr ? qr.qrDataUrl : null,
    qr_note: state === 'locked' ? 'Quỹ đã khoá sổ' : state === 'stopped' ? 'Quỹ đang ngừng thu' : null,
    total: sum.total_in, spent: sum.total_out, balance: sum.balance, donors: sum.donors, progress: sum.progress,
    documents: docs.filter((d) => d.kind === 'doc').map((d) => ({ id: d.id, name: d.name, mime: d.mime, size: d.size, url: docUrl(d.id) })),
  };
  if (withEntries) {
    out.entries = db.prepare(`SELECT type, payer_name, anonymous, amount, note, created_at, approved_at FROM fund_entries
      WHERE fund_id=? AND status='approved' ORDER BY created_at DESC, id DESC LIMIT 300`).all(f.id).map((e) => ({
      type: e.type,
      name: e.anonymous ? null : (e.payer_name || null),
      anonymous: !!e.anonymous,
      amount: e.amount,
      note: e.note || '',
      date: (e.created_at || '').slice(0, 10),
      // khoản chi phát sinh sau ngày ngừng thu (thấy quỹ vẫn chi)
      after_stop: !!(f.stopped_at && e.type !== 'in' && (e.approved_at || e.created_at) > f.stopped_at),
    }));
    out.notices = db.prepare('SELECT kind, message, created_at FROM fund_notices WHERE fund_id=? ORDER BY id DESC LIMIT 20').all(f.id);
  }
  return out;
}
// Nạp muộn: funds.js nạp public.js gián tiếp qua server; tránh vòng require lúc khởi động
const pf = () => require('./funds').publicFund;

function publicTenant(token) {
  const c = publicCommunity(token);
  if (!c) return null;
  return { c, tenant: communityTenant(c.id) };
}

async function donationsData(token) {
  const pt = publicTenant(token);
  if (!pt) return null;
  if (!pt.tenant) return { community_name: pt.c.name, programs: [], notices: [] };
  return db.runWith(pt.tenant.code, async () => {
    const programs = [];
    for (const f of db.prepare(publicFundSql).all()) programs.push(await publicFund(f, token));
    const notices = db.prepare(`SELECT n.fund_id, n.kind, n.message, n.created_at FROM fund_notices n JOIN funds f ON f.id=n.fund_id
      WHERE f.is_public=1 ORDER BY n.id DESC LIMIT 30`).all();
    return { community_name: pt.c.name, programs, notices };
  });
}

router.get('/donations/:token', wrap(async (req, res) => {
  const data = await donationsData(req.params.token);
  if (!data) return res.status(404).json({ error: 'Không tìm thấy' });
  ok(res, data);
}));

// Chi tiết một quỹ (App Làng Số mở trang chi tiết)
router.get('/donations/:token/funds/:id', wrap(async (req, res) => {
  const pt = publicTenant(req.params.token);
  if (!pt || !pt.tenant) return res.status(404).json({ error: 'Không tìm thấy' });
  const data = await db.runWith(pt.tenant.code, async () => {
    const f = db.prepare('SELECT * FROM funds WHERE is_public=1 AND id=?').get(Number(req.params.id));
    return f ? publicFund(f, req.params.token) : null;
  });
  if (!data) return res.status(404).json({ error: 'Không tìm thấy quỹ' });
  ok(res, data);
}));

// Tài liệu / biên bản của quỹ công khai
router.get('/donations/:token/documents/:docId', wrap((req, res) => {
  const pt = publicTenant(req.params.token);
  if (!pt || !pt.tenant) return res.status(404).json({ error: 'Không tìm thấy' });
  db.runWith(pt.tenant.code, () => {
    const d = db.prepare('SELECT d.* FROM fund_documents d JOIN funds f ON f.id=d.fund_id WHERE d.id=? AND f.is_public=1').get(Number(req.params.docId));
    if (!d) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    pf().sendDocument(res, d);
  });
}));

// QR đúng số tiền cho người nộp; chỉ với đợt thu công khai / công đức đang hoạt động.
router.get('/donations/:token/funds/:id/qr', wrap(async (req, res) => {
  const c = publicCommunity(req.params.token);
  if (!c) return res.status(404).json({ error: 'Không tìm thấy' });
  const tenant = communityTenant(c.id);
  if (!tenant) return res.status(404).json({ error: 'Không tìm thấy' });
  const f = db.runWith(tenant.code, () => db.prepare(PUBLIC_FUND_SELECT + ' AND id=?').get(Number(req.params.id)));
  if (!f) return res.status(404).json({ error: 'Không tìm thấy đợt thu' });
  let amount;
  if (req.query.amount !== undefined && req.query.amount !== '') {
    amount = Math.round(Number(String(req.query.amount).replace(/[^\d]/g, '')));
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_000) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }
  }
  try { ok(res, { ...(await fundQr(f, amount)), amount }); } catch (e) { res.status(400).json({ error: e.message }); }
}));

async function donationsPage(req, res) {
  if (!(await donationsData(req.params.token))) return res.status(404).type('html').send('<h1>404</h1><p>Không tìm thấy trang.</p>');
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'donations.html'));
}

module.exports = { router, page, donationsPage };
