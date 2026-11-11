'use strict';

// Lớp database đa tenant: mỗi cửa hàng có một file SQLite riêng trong data/tenants/<code>/pos.db
// và một kết nối riêng (cách ly mạnh). Trong lúc xử lý request, module này định tuyến
// tới đúng DB của tenant qua AsyncLocalStorage, nên các route hiện tại dùng `db.prepare(...)`
// không cần sửa.

const { DatabaseSync } = require('node:sqlite');
const { AsyncLocalStorage } = require('node:async_hooks');
const path = require('path');
const fs = require('fs');
const { applyPendingRestore } = require('./lib/backup');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });

const cache = new Map();
const als = new AsyncLocalStorage();

const safeCode = (code) => String(code || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'default';
const tenantDir = (code) => path.join(TENANTS_DIR, safeCode(code));

/* ===================== SCHEMA NGHIỆP VỤ (mỗi tenant) ===================== */
function ensureSchema(conn, { withDemo = false } = {}) {
  conn.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE,
    sku TEXT,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'cái',
    cost_price INTEGER DEFAULT 0,
    sell_price INTEGER NOT NULL DEFAULT 0,
    stock REAL DEFAULT 0,
    min_stock REAL DEFAULT 0,
    max_stock REAL DEFAULT 0,
    location TEXT,
    product_type TEXT DEFAULT 'goods',
    is_weighted INTEGER DEFAULT 0,
    allow_negative INTEGER DEFAULT 0,
    warranty_months INTEGER DEFAULT 0,
    weight REAL DEFAULT 0,
    description TEXT,
    image TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

  CREATE TABLE IF NOT EXISTS product_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    conversion REAL NOT NULL DEFAULT 1,
    sell_price INTEGER NOT NULL DEFAULT 0,
    barcode TEXT,
    is_base INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_units_product ON product_units(product_id);
  CREATE INDEX IF NOT EXISTS idx_units_barcode ON product_units(barcode);

  CREATE TABLE IF NOT EXISTS price_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    note TEXT,
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS price_list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES product_units(id) ON DELETE CASCADE,
    price INTEGER NOT NULL DEFAULT 0,
    UNIQUE(price_list_id, unit_id)
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'order',
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_value REAL NOT NULL DEFAULT 0,
    target_type TEXT DEFAULT 'all',
    target_id INTEGER,
    min_subtotal INTEGER DEFAULT 0,
    min_qty REAL DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    priority INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'sale',
    parent_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    subtotal INTEGER NOT NULL DEFAULT 0,
    item_discount INTEGER NOT NULL DEFAULT 0,
    order_discount INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    paid_amount INTEGER DEFAULT 0,
    change_amount INTEGER DEFAULT 0,
    price_list_id INTEGER,
    promo_order_id INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'paid',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
  CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    unit_id INTEGER,
    unit_name TEXT,
    conversion REAL DEFAULT 1,
    qty REAL NOT NULL,
    base_qty REAL DEFAULT 0,
    price INTEGER NOT NULL,
    cost_price INTEGER DEFAULT 0,
    discount INTEGER DEFAULT 0,
    promo_id INTEGER,
    promo_name TEXT,
    line_total INTEGER NOT NULL,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS invoice_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    method TEXT NOT NULL DEFAULT 'cash',
    amount INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS held_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    label TEXT,
    cart_json TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    note TEXT,
    total INTEGER DEFAULT 0,
    item_count REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    email TEXT,
    note TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT,
    note TEXT,
    total INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    received_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);

  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    unit_id INTEGER,
    unit_name TEXT,
    conversion REAL DEFAULT 1,
    qty REAL NOT NULL,
    base_qty REAL DEFAULT 0,
    cost_price INTEGER NOT NULL DEFAULT 0,
    line_total INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 0,
    method TEXT DEFAULT 'cash',
    note TEXT,
    paid_at TEXT DEFAULT (datetime('now','localtime')),
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS stock_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    note TEXT,
    scope TEXT DEFAULT 'all',
    category_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    diff_value INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS stock_check_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL REFERENCES stock_checks(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT,
    unit_name TEXT,
    system_qty REAL DEFAULT 0,
    counted_qty REAL,
    diff REAL DEFAULT 0,
    cost_price INTEGER DEFAULT 0,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS stock_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty REAL NOT NULL,
    type TEXT NOT NULL,
    ref_type TEXT,
    ref TEXT,
    unit_id INTEGER,
    unit_name TEXT,
    conversion REAL DEFAULT 1,
    stock_after REAL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_moves_product ON stock_moves(product_id);
  CREATE INDEX IF NOT EXISTS idx_moves_created ON stock_moves(created_at);

  CREATE TABLE IF NOT EXISTS vietqr_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transactionid TEXT,
    invoice_id INTEGER,
    bank_account TEXT,
    amount INTEGER DEFAULT 0,
    content TEXT,
    order_id TEXT,
    trans_type TEXT,
    matched INTEGER DEFAULT 0,
    note TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_vqr_txn ON vietqr_transactions(transactionid);
  CREATE INDEX IF NOT EXISTS idx_vqr_order ON vietqr_transactions(order_id);

  -- Sổ quỹ cộng đồng (GĐ2.1–2.2 — FR-04, FR-12 → FR-15, BR-03, BR-04, BR-05)
  CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general','donation')),
    category TEXT,
    target_amount INTEGER,
    is_public INTEGER NOT NULL DEFAULT 0,
    bank_account TEXT,
    bank_bin TEXT,
    bank_name TEXT,
    account_holder TEXT,
    manager_user_id INTEGER,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_funds_account ON funds(bank_account) WHERE bank_account IS NOT NULL AND bank_account <> '';

  -- Thu (in) và chi (out) lưu số dương; điều chỉnh (adjust) lưu số có dấu và trỏ về bút toán được sửa.
  -- Chỉ bút toán approved mới tính vào tồn quỹ.
  CREATE TABLE IF NOT EXISTS fund_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    fund_id INTEGER NOT NULL REFERENCES funds(id),
    type TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
    amount INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'cash' CHECK (source IN ('vietqr','manual','cash')),
    bank_ref TEXT UNIQUE,
    payer_name TEXT,
    anonymous INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    ref_entry_id INTEGER REFERENCES fund_entries(id),
    attachment TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
    created_by INTEGER,
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    approved_by INTEGER,
    approved_by_name TEXT,
    approved_at TEXT,
    reject_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fund_entries_fund ON fund_entries(fund_id, status, created_at);

  -- BR-04: không xóa bút toán; bút toán đã chốt (approved/rejected) không đổi số tiền, quỹ, loại hay trạng thái
  CREATE TRIGGER IF NOT EXISTS trg_fund_entries_no_delete BEFORE DELETE ON fund_entries
  BEGIN SELECT RAISE(ABORT, 'Không được xóa bút toán quỹ (BR-04)'); END;
  CREATE TRIGGER IF NOT EXISTS trg_fund_entries_locked BEFORE UPDATE ON fund_entries
  WHEN OLD.status IN ('approved','rejected') AND (NEW.amount <> OLD.amount OR NEW.fund_id <> OLD.fund_id
    OR NEW.type <> OLD.type OR NEW.status <> OLD.status)
  BEGIN SELECT RAISE(ABORT, 'Bút toán đã chốt, sửa sai bằng bút toán điều chỉnh (BR-04)'); END;

  CREATE TABLE IF NOT EXISTS invoice_tax_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    rate REAL NOT NULL DEFAULT 0,
    taxable_amount INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `);

  // ---------- Migration: thêm cột còn thiếu cho DB cũ ----------
  const columns = (table) => conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const ensureColumn = (table, name, def) => { if (!columns(table).includes(name)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`); };
  const ensureColumnWithDefault = (table, name, def, seedExpr) => {
    if (!columns(table).includes(name)) { conn.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`); conn.exec(`UPDATE ${table} SET ${name} = ${seedExpr}`); }
  };

  ensureColumn('categories', 'description', 'TEXT');
  ensureColumn('categories', 'sort_order', 'INTEGER DEFAULT 0');
  ensureColumn('products', 'sku', 'TEXT');
  ensureColumn('products', 'max_stock', 'REAL DEFAULT 0');
  ensureColumn('products', 'location', 'TEXT');
  ensureColumn('products', 'product_type', "TEXT DEFAULT 'goods'");
  ensureColumn('products', 'is_weighted', 'INTEGER DEFAULT 0');
  ensureColumn('products', 'allow_negative', 'INTEGER DEFAULT 0');
  ensureColumn('products', 'warranty_months', 'INTEGER DEFAULT 0');
  ensureColumn('products', 'weight', 'REAL DEFAULT 0');
  ensureColumn('products', 'description', 'TEXT');
  ensureColumn('products', 'image', 'TEXT');
  ensureColumn('products', 'vat_rate', 'REAL DEFAULT 0');
  ensureColumn('invoices', 'net_amount', 'INTEGER DEFAULT 0');
  ensureColumn('invoices', 'vat_amount', 'INTEGER DEFAULT 0');
  ensureColumn('purchase_items', 'vat_rate', 'REAL DEFAULT 0');
  ensureColumn('suppliers', 'tax_code', 'TEXT');
  ensureColumn('suppliers', 'contact_name', 'TEXT');
  ensureColumn('suppliers', 'payment_terms_days', 'INTEGER DEFAULT 0');
  ensureColumn('invoices', 'type', "TEXT DEFAULT 'sale'");
  ensureColumn('invoices', 'parent_id', 'INTEGER');
  ensureColumn('invoices', 'item_discount', 'INTEGER DEFAULT 0');
  ensureColumn('invoices', 'order_discount', 'INTEGER DEFAULT 0');
  ensureColumn('invoices', 'price_list_id', 'INTEGER');
  ensureColumn('invoices', 'promo_order_id', 'INTEGER');
  ensureColumn('invoices', 'payment_ref', 'TEXT');
  ensureColumn('invoices', 'payment_content', 'TEXT');
  // GĐ4.3 (FR-11): một hạng mục / giao dịch. Lưu id + tên tại thời điểm bán (đổi tên hạng mục không làm sai báo cáo cũ).
  ensureColumn('invoices', 'item_category_id', 'INTEGER');
  ensureColumn('invoices', 'item_category_name', 'TEXT');
  conn.exec('CREATE INDEX IF NOT EXISTS idx_invoices_itemcat ON invoices(item_category_id)');
  conn.exec('CREATE INDEX IF NOT EXISTS idx_invoices_payref ON invoices(payment_ref)');
  // GĐ2.3, GĐ2.5: cột thêm sau khi bảng quỹ đã có ở DB cũ
  ensureColumn('funds', 'bank_bin', 'TEXT');
  ensureColumn('funds', 'bank_name', 'TEXT');
  ensureColumn('fund_entries', 'attachment', 'TEXT');
  // GĐ3.4 (ERR-02): mỗi mã giao dịch ngân hàng chỉ ghi một lần. Dòng trùng có sẵn ở DB cũ không xóa (BR-04):
  // giữ dòng đầu, các dòng sau đánh dấu dup_of = id dòng đầu và không tính vào báo cáo.
  ensureColumn('vietqr_transactions', 'dup_of', 'INTEGER');
  // GĐ3.6 (NFR-03, ERR-01): biên bản đối soát sao kê của quỹ. So tổng tiền vào theo sao kê với tiền vào
  // qua ngân hàng đã ghi sổ (vietqr + manual). Biên bản là hồ sơ: không sửa, không xóa.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS fund_reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id INTEGER NOT NULL REFERENCES funds(id),
      period_from TEXT NOT NULL, period_to TEXT NOT NULL,
      statement_in INTEGER NOT NULL, system_in INTEGER NOT NULL, diff INTEGER NOT NULL,
      note TEXT, created_by INTEGER, created_by_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_fund_recon ON fund_reconciliations(fund_id, period_to);
    CREATE TRIGGER IF NOT EXISTS trg_fund_recon_locked BEFORE UPDATE ON fund_reconciliations
      BEGIN SELECT RAISE(ABORT, 'Biên bản đối soát không sửa được (BR-04)'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fund_recon_no_delete BEFORE DELETE ON fund_reconciliations
      BEGIN SELECT RAISE(ABORT, 'Biên bản đối soát không xóa được (BR-04)'); END;`);
  // Đợt thu: loại quỹ/đợt, mức đóng dự kiến và cờ công khai trên trang người nộp
  ensureColumn('funds', 'category', 'TEXT');
  ensureColumn('funds', 'target_amount', 'INTEGER');
  // Loại quỹ do thôn tự đặt (danh sách trong Cài đặt) và cách đóng: target_amount là mức mỗi hộ / mỗi người / tổng cần huy động
  // Công khai chỉ theo cờ is_public: quỹ công đức cũ (trước đây tự công khai) được bật cờ một lần khi thêm cột.
  if (!columns('funds').includes('fund_type')) {
    conn.exec("ALTER TABLE funds ADD COLUMN fund_type TEXT");
    conn.exec("UPDATE funds SET fund_type = CASE kind WHEN 'donation' THEN 'Công đức' ELSE 'Quỹ chung' END, is_public = CASE kind WHEN 'donation' THEN 1 ELSE is_public END");
  }
  ensureColumn('funds', 'contribution', "TEXT DEFAULT 'household'");
  // Vòng đời quỹ (SKHGDT-3647): status 'active' = Đang thu; 'closed' = Ngừng thu (vẫn chi); 'closed' + locked_at = Khoá sổ.
  // round: đợt thu thứ mấy (mở thu lại thì tăng), nội dung chuyển khoản = transfer_code + "-D<round>".
  // Quỹ đã "đóng" ở bản trước (status='closed') được coi là Ngừng thu từ lúc nâng cấp.
  if (!columns('funds').includes('stopped_at')) {
    conn.exec('ALTER TABLE funds ADD COLUMN stopped_at TEXT');
    conn.exec("UPDATE funds SET stopped_at = datetime('now','localtime') WHERE status='closed'");
  }
  for (const [name, def] of [['nature', 'TEXT'], ['content', 'TEXT'], ['transfer_code', 'TEXT'], ['round', 'INTEGER NOT NULL DEFAULT 1'],
    ['stopped_by_name', 'TEXT'], ['stop_note', 'TEXT'],
    ['locked_at', 'TEXT'], ['locked_by_name', 'TEXT'], ['lock_note', 'TEXT'], ['lock_balance', 'INTEGER'], ['lock_doc_id', 'INTEGER'],
    ['unlocked_at', 'TEXT'], ['unlock_reason', 'TEXT'],
    // App Làng Số: chu kỳ mức đóng ('year' | 'month' | NULL = mỗi đợt) và đơn vị quản lý quỹ (Hội Khuyến học, Ban quản lý thôn…)
    ['period', 'TEXT'], ['managed_by', 'TEXT']]) {
    ensureColumn('funds', name, def);
  }
  ensureColumn('fund_entries', 'round', 'INTEGER');
  ensureColumn('fund_entries', 'payer_group', 'TEXT'); // xóm / địa chỉ người nộp
  conn.exec(`
    -- Nội dung quỹ: văn bản, tờ trình, biên bản (PDF / ảnh / Word / Excel). kind='minutes' là biên bản khoá / mở khoá sổ.
    CREATE TABLE IF NOT EXISTS fund_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id INTEGER NOT NULL REFERENCES funds(id),
      kind TEXT NOT NULL DEFAULT 'doc' CHECK (kind IN ('doc','minutes')),
      name TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
      created_by_name TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    -- Đề nghị khoá sổ (Ban kiểm tra xác nhận) và mở khoá sổ (Trưởng thôn + Trưởng ban kiểm tra, hai người khác nhau).
    CREATE TABLE IF NOT EXISTS fund_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id INTEGER NOT NULL REFERENCES funds(id),
      action TEXT NOT NULL CHECK (action IN ('lock','unlock')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','rejected')),
      reason TEXT NOT NULL, balance_note TEXT, doc_id INTEGER REFERENCES fund_documents(id),
      requested_by INTEGER, requested_by_name TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
      approver_id INTEGER, approver_name TEXT, approver_at TEXT,
      inspector_id INTEGER, inspector_name TEXT, inspector_at TEXT,
      reject_reason TEXT, rejected_by_name TEXT, done_at TEXT
    );
    -- Thông báo cho người dân / App Làng Số (mở thu lại, tự ngừng thu, mở khoá sổ…)
    CREATE TABLE IF NOT EXISTS fund_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id INTEGER NOT NULL REFERENCES funds(id),
      kind TEXT NOT NULL, message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    -- Khoá sổ chặn ở tầng DB: không thêm bút toán, không đổi số tiền / trạng thái / chứng từ (vẫn ẩn / hiện tên được)
    CREATE TRIGGER IF NOT EXISTS trg_fund_locked_insert BEFORE INSERT ON fund_entries
      WHEN (SELECT locked_at FROM funds WHERE id=NEW.fund_id) IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'Quỹ đã khoá sổ'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fund_locked_update BEFORE UPDATE ON fund_entries
      WHEN (SELECT locked_at FROM funds WHERE id=NEW.fund_id) IS NOT NULL
        AND (NEW.amount <> OLD.amount OR NEW.status <> OLD.status OR NEW.note IS NOT OLD.note OR NEW.attachment IS NOT OLD.attachment)
      BEGIN SELECT RAISE(ABORT, 'Quỹ đã khoá sổ'); END;`);
  ensureColumnWithDefault('funds', 'is_public', 'INTEGER NOT NULL DEFAULT 0', '0');
  // GĐ3.1 (FR-08, BR-01): mỗi giao dịch thuộc đúng một loại. Suy ra lúc ghi; không chắc thì 'unclassified' (ERR-03).
  // ADD COLUMN ... DEFAULT gán 'unclassified' cho mọi dòng cũ, nên phải suy loại ngay lúc thêm cột (chỉ chạy một lần):
  // khớp hóa đơn -> sale, tiền ra -> refund, còn lại giữ 'unclassified' chờ phân loại.
  ensureColumnWithDefault('vietqr_transactions', 'category',
    "TEXT DEFAULT 'unclassified' CHECK (category IN ('sale','fund','donation','other','refund','unclassified'))",
    "CASE WHEN trans_type='D' THEN 'refund' WHEN matched=1 AND invoice_id IS NOT NULL THEN 'sale' ELSE 'unclassified' END");
  ensureColumn('vietqr_transactions', 'classified_by', 'TEXT');
  ensureColumn('vietqr_transactions', 'classified_at', 'TEXT');
  // GĐ3.7 (AC-01-3): thời điểm ngân hàng ghi nhận, nếu webhook có gửi. Chưa có thì độ trễ không đo được.
  ensureColumn('vietqr_transactions', 'bank_time', 'TEXT');
  conn.exec(`UPDATE vietqr_transactions SET dup_of = (SELECT MIN(v2.id) FROM vietqr_transactions v2 WHERE v2.transactionid = vietqr_transactions.transactionid)
    WHERE dup_of IS NULL AND transactionid IS NOT NULL AND transactionid <> ''
      AND id > (SELECT MIN(v2.id) FROM vietqr_transactions v2 WHERE v2.transactionid = vietqr_transactions.transactionid)`);
  conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_vqr_txn ON vietqr_transactions(transactionid) WHERE dup_of IS NULL AND transactionid IS NOT NULL AND transactionid <> ''");
  // GĐ3.3 (FR-09, ERR-07): giao dịch ngân hàng đã nhận không xóa, không đổi số tiền / mã / tài khoản / thời điểm.
  // Chỉ được đổi các cột phân loại và đối soát (invoice_id, matched, note, category, dup_of).
  conn.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_vqr_no_delete BEFORE DELETE ON vietqr_transactions
      BEGIN SELECT RAISE(ABORT, 'Không được xóa giao dịch ngân hàng (BR-04)'); END;
    CREATE TRIGGER IF NOT EXISTS trg_vqr_locked BEFORE UPDATE ON vietqr_transactions
      WHEN NEW.transactionid IS NOT OLD.transactionid OR NEW.amount IS NOT OLD.amount OR NEW.bank_account IS NOT OLD.bank_account
        OR NEW.trans_type IS NOT OLD.trans_type OR NEW.content IS NOT OLD.content OR NEW.raw_json IS NOT OLD.raw_json OR NEW.created_at IS NOT OLD.created_at
      BEGIN SELECT RAISE(ABORT, 'Giao dịch ngân hàng không sửa được, chỉ phân loại (BR-04)'); END;`);
  // Đã phân loại xong thì không phân loại lại (sửa sai qua hủy hóa đơn / bút toán điều chỉnh)
  conn.exec(`CREATE TRIGGER IF NOT EXISTS trg_vqr_classified BEFORE UPDATE OF category ON vietqr_transactions
    WHEN OLD.category IS NOT NULL AND OLD.category <> 'unclassified' AND NEW.category IS NOT OLD.category
    BEGIN SELECT RAISE(ABORT, 'Giao dịch đã phân loại, không đổi được (BR-04)'); END;`);
  ensureColumn('invoice_items', 'unit_id', 'INTEGER');
  ensureColumn('invoice_items', 'unit_name', 'TEXT');
  ensureColumnWithDefault('invoice_items', 'conversion', 'REAL DEFAULT 1', '1');
  ensureColumnWithDefault('invoice_items', 'base_qty', 'REAL DEFAULT 0', 'qty');
  ensureColumn('invoice_items', 'discount', 'INTEGER DEFAULT 0');
  ensureColumn('invoice_items', 'promo_id', 'INTEGER');
  ensureColumn('invoice_items', 'promo_name', 'TEXT');
  ensureColumn('invoice_items', 'note', 'TEXT');
  ensureColumn('stock_moves', 'unit_id', 'INTEGER');
  ensureColumn('stock_moves', 'unit_name', 'TEXT');
  ensureColumn('stock_moves', 'conversion', 'REAL DEFAULT 1');
  ensureColumn('stock_moves', 'ref_type', 'TEXT');
  ensureColumn('stock_moves', 'stock_after', 'REAL');
  conn.exec("UPDATE stock_moves SET ref_type = type WHERE ref_type IS NULL");

  // ---------- Settings mặc định ----------
  const defaults = {
    shop_name: 'Cửa hàng tạp hóa & gia dụng', shop_address: '', shop_phone: '', shop_tax_code: '',
    bank_bin: '970436', bank_name: 'Vietcombank', bank_account: '', account_holder: '',
    invoice_footer: 'Cảm ơn quý khách. Hẹn gặp lại!',
    invoice_prefix: 'HD', return_prefix: 'TH', purchase_prefix: 'PN', stockcheck_prefix: 'KK',
    currency: '₫', vat_rate: '0', allow_negative_stock: '0', default_price_list_id: '', low_stock_alert: '1',
    receipt_width: '80', label_width: '40', label_height: '30', label_show_name: '1', label_show_price: '1',
    label_show_barcode: '1', label_show_shop: '1', round_total: '0', print_after_pay: '0',
    internal_barcode_seq: '0', online_lookup: '1', lookup_url: '', backup_enabled: '1', backup_keep: '30',
    vat_mode: 'inclusive', vat_default_rate: '0',
    payment_ref_seq: '0',
    vqr_enabled: '0', vqr_env: 'mock', vqr_bank_code: '', vqr_username: '', vqr_password: '',
    vqr_terminal_code: '', vqr_exposed_username: '', vqr_exposed_password: '', vqr_secret_key: '',
    vqr_mock_autopay: '0',
    // Sổ quỹ thôn: danh sách loại quỹ và xóm / đoàn thể (mỗi dòng một mục), thôn tự sửa trong Cài đặt
    fund_types: 'Quỹ chung | Bắt buộc\nQuỹ quốc phòng – an ninh | Bắt buộc\nQuỹ phòng chống thiên tai | Bắt buộc\nCông đức | Tự nguyện\nKhuyến học | Vận động\nThiện nguyện | Tự nguyện', fund_groups: '',
  };
  const insSetting = conn.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
  for (const [k, v] of Object.entries(defaults)) insSetting.run(k, v);

  // ---------- Danh mục mặc định ----------
  if (conn.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
    const ins = conn.prepare('INSERT INTO categories(name, sort_order) VALUES (?,?)');
    let i = 0;
    for (const n of ['Tạp hóa', 'Đồ gia dụng', 'Đồ uống', 'Hóa mỹ phẩm', 'Bánh kẹo', 'Khác']) ins.run(n, i++);
  }

  // ---------- Bảng giá mặc định ----------
  if (conn.prepare('SELECT COUNT(*) c FROM price_lists').get().c === 0) {
    conn.prepare('INSERT INTO price_lists(name, is_default, sort_order, note) VALUES (?,?,?,?)').run('Giá bán lẻ', 1, 0, 'Áp dụng mặc định');
    conn.prepare('INSERT INTO price_lists(name, is_default, sort_order, note) VALUES (?,?,?,?)').run('Giá bán buôn', 0, 1, 'Cho khách mua sỉ');
  }
  const dpl = conn.prepare("SELECT value FROM settings WHERE key='default_price_list_id'").get();
  if (!dpl || !dpl.value) {
    const d = conn.prepare('SELECT id FROM price_lists WHERE is_default=1 ORDER BY id LIMIT 1').get();
    if (d) conn.prepare("UPDATE settings SET value=? WHERE key='default_price_list_id'").run(String(d.id));
  }

  // ---------- Sản phẩm mẫu (chỉ tenant mặc định) ----------
  if (withDemo && conn.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
    const cat = (n) => conn.prepare('SELECT id FROM categories WHERE name=?').get(n).id;
    const ins = conn.prepare(`INSERT INTO products(barcode,sku,name,category_id,unit,cost_price,sell_price,stock,min_stock,location)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insUnit = conn.prepare('INSERT INTO product_units(product_id,name,conversion,sell_price,barcode,is_base,sort_order) VALUES (?,?,?,?,?,?,?)');
    const seed = [
      ['8934673101059', 'SP0001', 'Nước suối Aquafina 500ml', 'Đồ uống', 'chai', 3500, 5000, 120, 24, 'A1'],
      ['8934588012136', 'SP0002', 'Coca Cola lon 330ml', 'Đồ uống', 'lon', 8000, 10000, 96, 24, 'A2'],
      ['8934563138165', 'SP0003', 'Mì Hảo Hảo tôm chua cay', 'Tạp hóa', 'gói', 3500, 4500, 300, 50, 'B1'],
      ['8936017360108', 'SP0004', 'Nước mắm Nam Ngư 500ml', 'Tạp hóa', 'chai', 22000, 28000, 30, 5, 'B2'],
      ['8934868157007', 'SP0005', 'Dầu ăn Simply 1L', 'Tạp hóa', 'chai', 48000, 55000, 25, 5, 'B3'],
      ['8935049501114', 'SP0006', 'Bột giặt OMO 3kg', 'Hóa mỹ phẩm', 'túi', 145000, 165000, 15, 3, 'C1'],
      ['8934822101633', 'SP0007', 'Nước rửa chén Sunlight 750g', 'Hóa mỹ phẩm', 'chai', 25000, 32000, 20, 5, 'C2'],
      ['8938505970054', 'SP0008', 'Kem đánh răng P/S 180g', 'Hóa mỹ phẩm', 'tuýp', 22000, 29000, 20, 5, 'C3'],
      ['2000000000011', 'SP0009', 'Chảo chống dính 26cm', 'Đồ gia dụng', 'cái', 120000, 165000, 8, 2, 'D1'],
      ['2000000000028', 'SP0010', 'Nồi inox 3 đáy 24cm', 'Đồ gia dụng', 'cái', 210000, 290000, 5, 1, 'D2'],
      ['2000000000035', 'SP0011', 'Rổ nhựa Duy Tân lớn', 'Đồ gia dụng', 'cái', 18000, 25000, 20, 5, 'D3'],
      ['2000000000042', 'SP0012', 'Thùng rác nhựa 15L', 'Đồ gia dụng', 'cái', 45000, 65000, 10, 2, 'D4'],
      ['2000000000059', 'SP0013', 'Bóng đèn LED 9W Rạng Đông', 'Đồ gia dụng', 'cái', 28000, 38000, 30, 10, 'D5'],
      ['2000000000066', 'SP0014', 'Ổ cắm điện Lioa 3 lỗ', 'Đồ gia dụng', 'cái', 65000, 85000, 10, 3, 'D6'],
      ['2000000000073', 'SP0015', 'Móc treo quần áo (lố 10)', 'Đồ gia dụng', 'lố', 15000, 22000, 25, 5, 'D7'],
      ['8935001111222', 'SP0016', 'Bánh Oreo hộp 133g', 'Bánh kẹo', 'hộp', 12000, 18000, 40, 10, 'E1'],
      ['8935001111333', 'SP0017', 'Kẹo Alpenliebe gói', 'Bánh kẹo', 'gói', 9000, 13000, 50, 10, 'E2'],
    ];
    const unitsFor = { SP0002: ['Thùng', 24, 225000], SP0001: ['Thùng', 24, 108000], SP0003: ['Thùng', 30, 128000], SP0009: ['Thùng', 6, 900000] };
    for (const s of seed) {
      const r = ins.run(s[0], s[1], s[2], cat(s[3]), s[4], s[5], s[6], s[7], s[8], s[9]);
      const pid = Number(r.lastInsertRowid);
      insUnit.run(pid, s[4], 1, s[6], s[0], 1, 0);
      const extra = unitsFor[s[1]];
      if (extra) insUnit.run(pid, extra[0], extra[1], extra[2], `${s[0]}-${extra[1]}`, 0, 1);
    }
  }

  // ---------- Backfill đơn vị cơ bản ----------
  const missingUnits = conn.prepare(`SELECT p.* FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_units u WHERE u.product_id=p.id)`).all();
  const insBaseUnit = conn.prepare('INSERT INTO product_units(product_id,name,conversion,sell_price,barcode,is_base,sort_order) VALUES (?,?,?,?,?,?,?)');
  for (const p of missingUnits) insBaseUnit.run(p.id, p.unit || 'cái', 1, p.sell_price, p.barcode, 1, 0);

  // ---------- Khuyến mãi mẫu (tạm tắt) ----------
  if (withDemo && conn.prepare('SELECT COUNT(*) c FROM promotions').get().c === 0) {
    const insPromo = conn.prepare(`INSERT INTO promotions(name,kind,discount_type,discount_value,target_type,min_subtotal,min_qty,active,note)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    insPromo.run('Giảm 10% hóa đơn từ 500.000', 'order', 'percent', 10, 'all', 500000, 0, 0, 'Ví dụ khuyến mãi hóa đơn');
    insPromo.run('Mua 10 gói giảm 5% (Mì Hảo Hảo)', 'item', 'percent', 5, 'all', 0, 10, 0, 'Ví dụ khuyến mãi sản phẩm');
  }
}

/* ===================== QUẢN LÝ KẾT NỐI TENANT ===================== */
function getTenantDb(code) {
  const key = safeCode(code);
  if (cache.has(key)) return cache.get(key);
  const dir = tenantDir(key);
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'pos.db');

  // Di trú dữ liệu cũ: data/pos.db -> data/tenants/default/pos.db
  if (key === 'default' && !fs.existsSync(dbPath)) {
    const legacy = path.join(DATA_DIR, 'pos.db');
    if (fs.existsSync(legacy)) {
      fs.renameSync(legacy, dbPath);
      for (const ext of ['-wal', '-shm']) {
        const p = legacy + ext;
        if (fs.existsSync(p)) fs.renameSync(p, dbPath + ext);
      }
    }
  }

  applyPendingRestore(dir);
  const conn = new DatabaseSync(dbPath);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  ensureSchema(conn, { withDemo: key === 'default' });
  conn.__dir = dir;
  conn.__code = key;
  cache.set(key, conn);
  return conn;
}

/* ===================== ĐỊNH TUYẾN THEO PHIÊN ===================== */
const current = () => als.getStore() || getTenantDb('default');

const db = {
  prepare: (...a) => current().prepare(...a),
  exec: (...a) => current().exec(...a),
  get tenantCode() { return current().__code; },
  get DATA_DIR() { return current().__dir; },
};

// Chạy một hàm trong ngữ cảnh DB của tenant.
function runWith(code, fn) {
  const conn = getTenantDb(code);
  return als.run(conn, () => fn(conn));
}

module.exports = db;
module.exports.DATA_DIR_ROOT = DATA_DIR;
module.exports.TENANTS_DIR = TENANTS_DIR;
module.exports.getTenantDb = getTenantDb;
module.exports.runWith = runWith;
module.exports.ensureSchema = ensureSchema;
