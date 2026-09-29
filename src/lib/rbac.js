'use strict';

// Ma trận quyền theo vai trò. Hỗ trợ wildcard: '*' (tất cả) và tiền tố 'nhóm.*'.
// Giai đoạn sau có thể chuyển sang bảng roles/permissions trong DB.

const PERMISSIONS = [
  'pos.sell', 'pos.hold', 'pos.discount', 'pos.change_price', 'pos.return', 'pos.misc',
  'invoice.view', 'invoice.print', 'invoice.cancel', 'invoice.einvoice',
  'product.view', 'product.create', 'product.edit', 'product.delete', 'product.view_cost',
  'stock.view', 'stock.adjust', 'purchase.create', 'purchase.receive', 'stockcheck.do',
  'supplier.view', 'supplier.edit',
  'report.view', 'report.profit', 'report.supplier', 'report.export',
  'promo.manage', 'settings.edit', 'user.manage', 'backup.restore', 'einvoice.config', 'vietqr.config',
  // Sổ quỹ và cộng đồng (GĐ1.3)
  'fund.view',            // xem quỹ, sổ thu chi, tồn quỹ (FR-15, FR-17)
  'fund.manage',          // tạo / sửa quỹ, chương trình công đức (FR-04)
  'fund.entry',           // lập khoản thu, chi, thu tiền mặt (FR-13, FR-19)
  'fund.approve',         // duyệt / từ chối khoản chi (FR-14, BR-05)
  'fund.anonymize',       // ẩn / hiện tên người công đức (FR-20)
  'community.report',     // báo cáo tổng hợp cộng đồng (FR-18, BR-09)
  'community.categories', // danh mục hạng mục dùng chung (FR-10, BR-11)
];

// Loại tenant được dùng vai trò (FR-02). Thiếu `kinds` = mọi loại.
const POS_KINDS = ['shop', 'seller'];
const COMMUNITY_KINDS = ['community'];

const ROLES = {
  owner: { name: 'Chủ cửa hàng', perms: ['*'], maxDiscount: 100 },
  manager: {
    name: 'Quản lý',
    kinds: POS_KINDS,
    perms: ['pos.*', 'invoice.*', 'product.*', 'stock.*', 'purchase.*', 'supplier.*', 'report.*', 'promo.manage', 'backup.restore', 'einvoice.config', 'vietqr.config'],
    maxDiscount: 100,
  },
  cashier: {
    name: 'Thu ngân',
    kinds: POS_KINDS,
    perms: ['pos.sell', 'pos.hold', 'pos.discount', 'pos.misc', 'invoice.view', 'invoice.print', 'product.view', 'stock.view', 'report.view'],
    maxDiscount: 10,
  },
  sales: {
    name: 'Nhân viên bán hàng',
    kinds: POS_KINDS,
    perms: ['pos.sell', 'pos.hold', 'pos.misc', 'invoice.view', 'invoice.print', 'product.view', 'stock.view'],
    maxDiscount: 5,
  },
  warehouse: {
    name: 'Thủ kho',
    kinds: POS_KINDS,
    perms: ['stock.*', 'purchase.*', 'supplier.view', 'product.view', 'report.view'],
    maxDiscount: 0,
  },
  accountant: {
    name: 'Kế toán',
    kinds: POS_KINDS,
    perms: ['invoice.view', 'invoice.print', 'invoice.einvoice', 'report.*', 'product.view', 'product.view_cost', 'supplier.view', 'einvoice.config'],
    maxDiscount: 0,
  },
  viewer: {
    name: 'Chỉ xem',
    kinds: POS_KINDS,
    perms: ['product.view', 'stock.view', 'invoice.view', 'supplier.view', 'report.view'],
    maxDiscount: 0,
  },
  // Vai trò của tenant cộng đồng (GĐ1.3, SEC-04: thủ quỹ không có quyền duyệt chi)
  treasurer: {
    name: 'Thủ quỹ',
    kinds: COMMUNITY_KINDS,
    perms: ['fund.view', 'fund.entry', 'fund.anonymize', 'report.export'],
    maxDiscount: 0,
  },
  approver: {
    name: 'Trưởng thôn / người duyệt',
    kinds: COMMUNITY_KINDS,
    perms: ['fund.view', 'fund.manage', 'fund.approve', 'community.categories', 'community.report'],
    maxDiscount: 0,
  },
  community_leader: {
    name: 'Ban lãnh đạo',
    kinds: COMMUNITY_KINDS,
    perms: ['community.report', 'fund.view'],
    maxDiscount: 0,
  },
};

function permsFor(role) {
  return ROLES[role] ? ROLES[role].perms : [];
}

function has(list, code) {
  for (const p of list || []) {
    if (p === '*') return true;
    if (p === code) return true;
    if (p.endsWith('.*') && code.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

// Vai trò có dùng được ở tenant loại `kind` không (FR-02). Tenant không rõ loại coi như 'shop'.
function roleAllowed(role, kind) {
  const r = ROLES[role];
  if (!r) return false;
  return !r.kinds || r.kinds.includes(kind || 'shop');
}
const rolesFor = (kind) => Object.keys(ROLES).filter((code) => roleAllowed(code, kind));

const roleName = (r) => (r === 'platform' ? 'Quản trị nền tảng' : ROLES[r] ? ROLES[r].name : r);
const maxDiscount = (r) => (ROLES[r] ? ROLES[r].maxDiscount : 0);

module.exports = { PERMISSIONS, ROLES, permsFor, has, roleName, maxDiscount, roleAllowed, rolesFor };
