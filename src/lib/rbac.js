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
    name: 'Người duyệt chi',
    kinds: COMMUNITY_KINDS,
    perms: ['fund.view', 'fund.manage', 'fund.approve', 'community.categories', 'community.report'],
    maxDiscount: 0,
  },
  community_leader: {
    name: 'Ban lãnh đạo',
    kinds: COMMUNITY_KINDS,
    // Ban lãnh đạo được xem toàn bộ sổ quỹ và cấu hình quỹ/tài khoản nhận tiền,
    // nhưng vẫn tách khỏi thủ quỹ (nhập liệu) và người duyệt chi.
    perms: ['community.report', 'fund.view', 'fund.manage'],
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

// labels: nhãn theo loại cộng đồng (GĐ1.6), chỉ đổi tên hiển thị, không đổi quyền
const LABEL_FIELD = { approver: 'approver_label', community_leader: 'leader_label' };
const roleName = (r, labels) => {
  if (r === 'platform') return 'Quản trị nền tảng';
  // Chủ tài khoản của tenant cộng đồng là người quản trị sổ quỹ, không phải chủ cửa hàng.
  if (r === 'owner' && labels) return 'Quản trị sổ quỹ';
  if (labels && LABEL_FIELD[r] && labels[LABEL_FIELD[r]]) return labels[LABEL_FIELD[r]];
  return ROLES[r] ? ROLES[r].name : r;
};
const maxDiscount = (r) => (ROLES[r] ? ROLES[r].maxDiscount : 0);

// Quyền nền tảng (GĐ1.7). Gán cho vai trò trong platform_roles; '*' chỉ dành cho vai trò hệ thống
const PLATFORM_PERMS = [
  { code: 'tenants.view', label: 'Xem cửa hàng', group: 'Cửa hàng' },
  { code: 'tenants.manage', label: 'Sửa cửa hàng', group: 'Cửa hàng' },
  { code: 'tenants.create_owner', label: 'Tạo cửa hàng + tài khoản chủ', group: 'Cửa hàng' },
  { code: 'communities.view', label: 'Xem cộng đồng', group: 'Cộng đồng' },
  { code: 'communities.manage', label: 'Quản lý cộng đồng', group: 'Cộng đồng' },
  { code: 'community_types.manage', label: 'Quản lý loại cộng đồng', group: 'Cộng đồng' },
  { code: 'users.view', label: 'Xem tài khoản', group: 'Tài khoản' },
  { code: 'staff.manage', label: 'Quản lý vai trò, nhân sự nền tảng', group: 'Tài khoản' },
  { code: 'reports.view', label: 'Xem báo cáo', group: 'Báo cáo' },
  { code: 'vietqr.manage', label: 'Cấu hình VietQR', group: 'Hệ thống' },
  { code: 'public_report.manage', label: 'Báo cáo công khai', group: 'Hệ thống' },
];

module.exports = { PLATFORM_PERMS, PERMISSIONS, ROLES, permsFor, has, roleName, maxDiscount, roleAllowed, rolesFor };
