'use strict';

// Danh sách hộ của thôn, lấy từ trang Hành chính (repo thon-thong-minh, GET /tich-hop/so-quy/ho) bằng khoá chung.
//   LANGSO_HANHCHINH_API  vd https://hanhchinh.xaphuongvietnam.vn/api
//   LANGSO_KHOA_TICH_HOP  khoá chung (bên Hành chính: LS_KHOA_TICH_HOP_SO_QUY)
// Thôn chọn theo mã cộng đồng SKHG (communities.skhg_code). Không có SĐT thật: mỗi hộ kèm phone_keys = HMAC(khoá, SĐT).
const crypto = require('crypto');
const db = require('../db');
const { control } = require('../control');
const { ApiError, bad, str } = require('./util');
const { removeVietnamese } = require('./vietqr');

const API = () => (process.env.LANGSO_HANHCHINH_API || '').replace(/\/+$/, '');
const KEY = () => process.env.LANGSO_KHOA_TICH_HOP || '';
const configured = () => !!(API() && KEY());

// Phải băm giống hệt bên Hành chính (app/modules/tich_hop/router_so_quy.py, bam_khop)
const phoneKey = (phone) => crypto.createHmac('sha256', KEY()).update(phone).digest('hex');
const normPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.startsWith('84') && d.length === 11 ? '0' + d.slice(2) : d;
};

// Mã hộ trong nội dung chuyển khoản: chỉ chữ và số, vd "XT-0123" -> "XT0123"
const alnum = (x) => removeVietnamese(String(x || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');

const rowOf = (h) => h && ({ code: h.code, head_name: h.head_name, hamlet: h.hamlet, address: h.address, members: h.members,
  categories: JSON.parse(h.categories || '[]'), active: !!h.active, synced_at: h.synced_at });

// Đồng bộ hộ cho tenant hiện tại (gọi trong db.runWith). Trả số hộ.
async function syncHouseholds(skhgCode) {
  if (!configured()) bad('Chưa cấu hình kết nối trang Hành chính (LANGSO_HANHCHINH_API, LANGSO_KHOA_TICH_HOP)');
  if (!skhgCode) bad('Thôn chưa liên kết mã cộng đồng Sáng Kiến Hưng Gia');
  let r, d;
  try {
    r = await fetch(`${API()}/tich-hop/so-quy/ho?cong_dong=${encodeURIComponent(skhgCode)}`,
      { headers: { 'X-Khoa-Tich-Hop': KEY(), Accept: 'application/json', 'User-Agent': 'ThanhToanSo/1.0' }, signal: AbortSignal.timeout(30000) });
    d = r.ok ? await r.json() : null;
  } catch { throw new ApiError('Không kết nối được trang Hành chính', 502); }
  if (r.status === 404) bad('Trang Hành chính không có thôn liên kết mã cộng đồng ' + skhgCode, 404);
  if (!d || !Array.isArray(d.ho)) throw new ApiError(`Trang Hành chính trả lỗi (${r.status})`, 502);
  return saveHouseholds(d.ho);
}

// Ghi danh sách hộ (cũng dùng khi nhập tay / test). Hộ không còn trong danh sách: active=0.
function saveHouseholds(list) {
  const up = db.prepare(`INSERT INTO households(code,head_name,hamlet,address,members,categories,phone_keys,active,synced_at)
    VALUES (?,?,?,?,?,?,?,1,datetime('now','localtime'))
    ON CONFLICT(code) DO UPDATE SET head_name=excluded.head_name, hamlet=excluded.hamlet, address=excluded.address, members=excluded.members,
      categories=excluded.categories, phone_keys=excluded.phone_keys, active=1, synced_at=excluded.synced_at`);
  const codes = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const h of list) {
      const code = str(h.ma_ho, 20);
      if (!code) continue;
      codes.push(code);
      up.run(code, str(h.chu_ho, 120) || null, str(h.xom, 80) || null, str(h.dia_chi, 200) || null, Math.max(0, Number(h.so_nhan_khau) || 0),
        JSON.stringify((h.dien_ho || []).map((x) => str(x, 80))), JSON.stringify((h.sdt_khop || []).map((x) => str(x, 64))));
    }
    db.prepare(`UPDATE households SET active=0 WHERE code NOT IN (SELECT value FROM json_each(?))`).run(JSON.stringify(codes));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return codes.length;
}

// Đồng bộ mọi thôn đã liên kết (chạy mỗi đêm). Lỗi một thôn không chặn thôn khác.
async function syncAll() {
  if (!configured()) return 0;
  let n = 0;
  for (const t of control.prepare(`SELECT t.code, c.skhg_code FROM tenants t JOIN communities c ON c.id=t.community_id
      WHERE t.kind='community' AND t.status='active' AND c.skhg_code IS NOT NULL AND c.skhg_code<>''`).all()) {
    try { n += await db.runWith(t.code, () => syncHouseholds(t.skhg_code)); } catch (e) { console.error(`  Đồng bộ hộ ${t.code} lỗi:`, e.message); }
  }
  return n;
}

const getHousehold = (code) => rowOf(db.prepare('SELECT * FROM households WHERE code=?').get(String(code || '')));
// Hộ trong nội dung chuyển khoản: mã hộ (bỏ dấu gạch) là một từ riêng, vd "XT0123 PL26".
function householdInContent(content) {
  const words = removeVietnamese(String(content || '')).toUpperCase().split(/[^A-Z0-9-]+/).map(alnum).filter(Boolean);
  if (!words.length) return null;
  const hit = db.prepare(`SELECT code FROM households WHERE active=1 AND upper(replace(replace(code,'-',''),' ','')) IN (SELECT value FROM json_each(?))`)
    .get(JSON.stringify(words));
  return hit ? hit.code : null;
}
// Hộ của người dùng theo SĐT (tài khoản SKHG)
function householdsByPhone(phone) {
  const p = normPhone(phone);
  if (!p || !KEY()) return [];
  return db.prepare("SELECT h.* FROM households h, json_each(h.phone_keys) k WHERE h.active=1 AND k.value=?").all(phoneKey(p)).map(rowOf);
}

// Khoản phải đóng của một hộ cho một quỹ, trong kỳ hiện tại.
//   household: mức × 1; person: mức × số nhân khẩu; voluntary / goal: không có mức (null).
//   Kỳ: period year = năm nay, month = tháng này, null = cả đợt (từ đầu).
//   Hộ thuộc diện miễn (funds.exempt, mỗi dòng một diện) thì phải đóng 0.
function periodStart(f, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  if (f.period === 'year') return `${now.getFullYear()}-01-01`;
  if (f.period === 'month') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  return null;
}
function dueOf(f, h) {
  if (!['household', 'person'].includes(f.contribution) || !f.target_amount) return { due: null, exempt: false };
  const exempt = String(f.exempt || '').split('\n').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (h.categories.some((c) => exempt.includes(String(c).trim().toLowerCase()))) return { due: 0, exempt: true };
  return { due: f.target_amount * (f.contribution === 'person' ? Math.max(1, h.members) : 1), exempt: false };
}
function paidBy(f, code) {
  const from = periodStart(f);
  return Number(db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM fund_entries WHERE fund_id=? AND household_code=? AND type='in' AND status='approved'
    ${from ? 'AND date(approved_at)>=date(?)' : ''}`).get(f.id, code, ...(from ? [from] : [])).s);
}
// Nội dung chuyển khoản riêng của hộ: "<mã hộ> <mã quỹ>". Mã hộ đứng trước vì QR cắt nội dung ở 25 ký tự
// (quỹ cũ chưa có mã ngắn dùng tên quỹ làm nội dung).
const householdTransfer = (ref, code) => `${alnum(code)} ${ref}`;

module.exports = { configured, phoneKey, normPhone, syncHouseholds, saveHouseholds, syncAll, getHousehold, householdInContent,
  householdsByPhone, dueOf, paidBy, periodStart, householdTransfer, rowOf };
