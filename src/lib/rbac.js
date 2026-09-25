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
];

const ROLES = {
  owner: { name: 'Chủ cửa hàng', perms: ['*'], maxDiscount: 100 },
  manager: {
    name: 'Quản lý',
    perms: ['pos.*', 'invoice.*', 'product.*', 'stock.*', 'purchase.*', 'supplier.*', 'report.*', 'promo.manage', 'backup.restore', 'einvoice.config', 'vietqr.config'],
    maxDiscount: 100,
  },
  cashier: {
    name: 'Thu ngân',
    perms: ['pos.sell', 'pos.hold', 'pos.discount', 'pos.misc', 'invoice.view', 'invoice.print', 'product.view', 'stock.view', 'report.view'],
    maxDiscount: 10,
  },
  sales: {
    name: 'Nhân viên bán hàng',
    perms: ['pos.sell', 'pos.hold', 'pos.misc', 'invoice.view', 'invoice.print', 'product.view', 'stock.view'],
    maxDiscount: 5,
  },
  warehouse: {
    name: 'Thủ kho',
    perms: ['stock.*', 'purchase.*', 'supplier.view', 'product.view', 'report.view'],
    maxDiscount: 0,
  },
  accountant: {
    name: 'Kế toán',
    perms: ['invoice.view', 'invoice.print', 'invoice.einvoice', 'report.*', 'product.view', 'product.view_cost', 'supplier.view', 'einvoice.config'],
    maxDiscount: 0,
  },
  viewer: {
    name: 'Chỉ xem',
    perms: ['product.view', 'stock.view', 'invoice.view', 'supplier.view', 'report.view'],
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

const roleName = (r) => (ROLES[r] ? ROLES[r].name : r);
const maxDiscount = (r) => (ROLES[r] ? ROLES[r].maxDiscount : 0);

module.exports = { PERMISSIONS, ROLES, permsFor, has, roleName, maxDiscount };
