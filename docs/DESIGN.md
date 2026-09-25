# Thiết kế kỹ thuật – POS Shop (SaaS đa cửa hàng)

> Tài liệu thiết kế chi tiết cho phiên bản SaaS nhiều cửa hàng (tenant), một link truy cập.
> Lộ trình & tiến độ xem [`ROADMAP.md`](./ROADMAP.md).

## Mục lục
1. [Nguyên tắc thiết kế](#1-nguyên-tắc-thiết-kế)
2. [Stack công nghệ](#2-stack-công-nghệ)
3. [Đa tenant (multi-tenancy)](#3-đa-tenant-multi-tenancy)
4. [Xác thực & phân quyền](#4-xác-thực--phân-quyền)
5. [Mô hình dữ liệu](#5-mô-hình-dữ-liệu)
6. [VAT](#6-vat)
7. [Hóa đơn điện tử](#7-hóa-đơn-điện-tử)
8. [Thanh toán VietQR (động + callback)](#8-thanh-toán-vietqr)
9. [Nhà cung cấp, mua hàng & công nợ](#9-nhà-cung-cấp-mua-hàng--công-nợ)
10. [Thống kê & phân tích](#10-thống-kê--phân-tích)
11. [Bề mặt API](#11-bề-mặt-api)
12. [Kiến trúc frontend](#12-kiến-trúc-frontend)
13. [Triển khai & vận hành](#13-triển-khai--vận-hành)
14. [Bảo mật](#14-bảo-mật)
15. [Kiểm thử](#15-kiểm-thử)
16. [Chuyển đổi từ bản hiện tại](#16-chuyển-đổi-từ-bản-hiện-tại)
17. [Phụ lục](#17-phụ-lục)

---

## 1. Nguyên tắc thiết kế

1. **Cách ly dữ liệu là trên hết.** Mọi bảng nghiệp vụ có `tenant_id`; mọi truy vấn bắt buộc lọc tenant; PostgreSQL Row-Level Security làm lớp chặn thứ hai.
2. **Phân quyền thực thi ở server.** Không bao giờ gửi dữ liệu nhạy cảm (giá vốn/lợi nhuận) xuống client rồi ẩn bằng CSS.
3. **Adapter cho dịch vụ ngoài.** Hóa đơn điện tử và VietQR đều đi qua interface chung để đổi nhà cung cấp không phải sửa lõi.
4. **Idempotent với sự kiện ngoài.** Callback/thanh toán có thể trùng; xử lý theo khoá duy nhất.
5. **Không phá dữ liệu.** Migration có version + rollback; backup trước mỗi lần nâng cấp.
6. **Offline-first chỉ khi cần.** Mặc định online; kiến trúc mở để thêm hàng đợi offline sau.

---

## 2. Stack công nghệ

| Lớp | Chọn | Lý do |
|---|---|---|
| Backend | Node.js + Express 5 | Đang dùng, nhẹ, quen thuộc |
| DB | **PostgreSQL 16** | Đa tenant, ghi đồng thời, RLS, PITR |
| Truy cập DB | `pg` + lớp repository tự viết | Kiểm soát chèn `tenant_id`, tránh ORM nặng |
| Cache/queue | Redis (tuỳ chọn) | Cache token VietQR, hàng đợi HĐĐT, rate limit |
| Auth | Session cookie `httpOnly` + bảng `sessions` | An toàn hơn localStorage; thu hồi được |
| Băm mật khẩu | argon2id (hoặc bcrypt) | Chuẩn hiện đại |
| Frontend | Vanilla ES modules (giữ nguyên) | Không build, nhanh, gọn |
| Deploy | Docker + Nginx + SSL | Chuẩn, dễ nhân bản |
| Test | Node test + Playwright | Đang có (94 API + 63 UI) |

---

## 3. Đa tenant (multi-tenancy)

### 3.1 Mô hình
**Shared database, shared schema, cột `tenant_id`** (không tách schema/DB riêng từng shop) để vận hành đơn giản; tăng cường bằng **RLS**.

```
tenants (1) ──< users, products, invoices, ... (n)   [mọi bảng có tenant_id]
platform_users (super admin) — tách riêng, không thuộc tenant
```

### 3.2 Nhận diện tenant
- Người dùng đăng nhập tại một link chung `/login`.
- Tài khoản (email/username) là **duy nhất trong toàn hệ thống** ⇒ suy ra tenant từ tài khoản.
- Session lưu `tenant_id`; middleware gắn `req.tenantId` cho mọi request.
- Webhook công khai (VietQR/HĐĐT) nhận diện tenant bằng `bankaccount`/`terminalCode`/`tenant_code`, không bằng session.

### 3.3 Thực thi cách ly
- **Lớp repository:** mọi câu lệnh tự chèn `WHERE tenant_id = $tenantId`; cấm truy vấn thô không qua lớp này.
- **RLS:** `CREATE POLICY tenant_isolation USING (tenant_id = current_setting('app.tenant_id')::int)`; trước mỗi request đặt `SET app.tenant_id`.
- **Test cách ly:** bộ test bắt buộc — tài khoản tenant A gọi mọi API không được thấy dữ liệu tenant B (kể cả truy cập theo `id`).

### 3.4 Trạng thái tenant
`active | trial | suspended | cancelled`. Hết hạn/trial → giới hạn tính năng (read-only hoặc chặn bán) theo gói.

---

## 4. Xác thực & phân quyền

### 4.1 Hai tầng

**Tầng nền tảng (nhà phát hành)** — `platform_users`:

| Vai trò | Quyền |
|---|---|
| Super Admin | Quản lý tenant, gói, license; xem thống kê tổng hợp |
| Support | Xem/hỗ trợ 1 tenant khi được yêu cầu (có ghi log, có thời hạn) |
| Billing | Thu phí, gia hạn, hóa đơn dịch vụ |

**Tầng cửa hàng (tenant)** — `users`:

| Vai trò | Mô tả |
|---|---|
| Chủ shop (owner) | Toàn quyền trong tenant |
| Quản lý (manager) | Bán, kho, NCC, khuyến mãi, xem lợi nhuận; không quản lý user/hệ thống |
| Thu ngân (cashier) | Bán, treo đơn, giảm giá trong hạn mức, in; **không** thấy giá vốn/lợi nhuận, không sửa giá, không hủy HĐ |
| Thủ kho (warehouse) | Kho, nhập hàng, kiểm kho; không bán, không tài chính |
| Kế toán (accountant) | VAT, HĐĐT, công nợ, báo cáo; không tạo giao dịch bán |
| Nhân viên bán hàng (sales) | Như thu ngân, hạn mức giảm giá thấp hơn |
| Chỉ xem (viewer) | Chỉ đọc báo cáo/nhật ký |

### 4.2 Mô hình RBAC
- `permissions` (mã quyền) — ví dụ:
  `pos.sell, pos.discount, pos.change_price, pos.return, pos.hold,`
  `invoice.view, invoice.print, invoice.cancel, invoice.einvoice,`
  `product.view, product.create, product.edit, product.delete, product.view_cost,`
  `stock.view, stock.adjust, purchase.create, purchase.receive, stockcheck.do,`
  `supplier.view, supplier.edit, payable.pay,`
  `report.view, report.profit, report.supplier, report.export,`
  `settings.edit, user.manage, backup.restore, einvoice.config, vietqr.config`
- `roles` + `role_permissions` + `user_permissions` (override cộng/trừ theo user).
- Middleware `requirePerm('product.edit')`; danh sách field nhạy cảm bị lọc ở tầng serializer nếu thiếu `*.view_cost` / `report.profit`.
- Hạn mức giảm giá theo vai trò: `roles.max_discount_percent`, `max_discount_amount`.

### 4.3 Phiên & bảo mật đăng nhập
- Bảng `sessions(token_hash, tenant_id, user_id, ip, user_agent, expires_at, revoked_at)`.
- Cookie `httpOnly; Secure; SameSite=Lax`; CSRF token cho thao tác ghi.
- **PIN** cho thu ngân (đổi ca nhanh, khóa màn hình), mật khẩu đầy đủ cho quản lý.
- Giới hạn đăng nhập sai (rate limit), tự khóa màn hình sau thời gian cấu hình.
- 2FA (TOTP) cho tài khoản nền tảng.

### 4.4 Audit log
`audit_logs(tenant_id, user_id, action, entity, entity_id, before_json, after_json, ip, created_at)`.
Ghi cho: hủy/điều chỉnh hóa đơn, sửa giá, điều chỉnh kho, thay đổi quyền, đăng nhập, phục hồi dữ liệu.

---

## 5. Mô hình dữ liệu

### 5.1 Bảng nền tảng
```
plans(id, code, name, price, billing_cycle, limits_json, features_json, active)
tenants(id, code UNIQUE, name, status, plan_id, trial_ends_at, created_at)
subscriptions(id, tenant_id, plan_id, status, started_at, current_period_end)
platform_users(id, username UNIQUE, password_hash, full_name, role, active, last_login)
platform_audit_logs(id, platform_user_id, action, entity, entity_id, before_json, after_json, ip, created_at)
```

### 5.2 Bảng nghiệp vụ (tất cả có `tenant_id`)
```
users(id, tenant_id, username, password_hash, full_name, phone, email, role_id, pin_hash, active, last_login)
roles(id, tenant_id NULL, name, is_system, max_discount_percent, max_discount_amount)
permissions(code PK, group_name, description)
role_permissions(role_id, permission_code)
user_permissions(user_id, permission_code, allow)
sessions(id, tenant_id, user_id, token_hash, ip, user_agent, expires_at, revoked_at)
audit_logs(id, tenant_id, user_id, action, entity, entity_id, before_json, after_json, ip, created_at)

settings(tenant_id, key, value, PRIMARY KEY(tenant_id, key))

categories(id, tenant_id, name, description, sort_order)
products(id, tenant_id, barcode, sku, name, category_id, unit, cost_price, sell_price,
         stock, min_stock, max_stock, location, product_type, is_weighted, allow_negative,
         warranty_months, weight, description, image, vat_rate, active, created_at, updated_at)
product_units(id, tenant_id, product_id, name, conversion, sell_price, barcode, is_base, sort_order)
price_lists(id, tenant_id, name, note, is_default, sort_order)
price_list_items(id, tenant_id, price_list_id, unit_id, price, UNIQUE(price_list_id, unit_id))
promotions(id, tenant_id, name, kind, discount_type, discount_value, target_type, target_id,
           min_subtotal, min_qty, start_date, end_date, priority, active, note)

suppliers(id, tenant_id, name, tax_code, contact_name, phone, address, email, note,
          payment_terms_days, active, created_at)
supplier_price_items(id, tenant_id, supplier_id, product_id, unit_id, price, updated_at)
supplier_payments(id, tenant_id, supplier_id, amount, method, note, paid_at, created_at)

purchases(id, tenant_id, code, supplier_id, supplier_name, note, total, status, created_at, received_at)
purchase_items(id, tenant_id, purchase_id, product_id, name, unit_id, unit_name, conversion,
               qty, base_qty, cost_price, line_total, vat_rate)
purchase_returns(id, tenant_id, code, purchase_id, supplier_id, total, note, created_at)
purchase_return_items(..., purchase_return_id, product_id, unit_id, qty, base_qty, cost_price, line_total)

stock_checks(id, tenant_id, code, note, scope, category_id, status, diff_value, created_at, completed_at)
stock_check_items(id, tenant_id, check_id, product_id, name, unit_name, system_qty, counted_qty, diff, cost_price, note)
stock_moves(id, tenant_id, product_id, qty, type, ref_type, ref, unit_id, unit_name,
            conversion, stock_after, note, created_at)

invoices(id, tenant_id, code, type, parent_id, subtotal, item_discount, order_discount, discount,
         net_amount, vat_amount, gross_amount, vat_mode, total, payment_method, paid_amount,
         change_amount, price_list_id, promo_order_id, payment_ref, customer_id,
         customer_name, customer_phone, customer_tax_code, customer_address, note, status,
         einvoice_status, created_at)
invoice_items(id, tenant_id, invoice_id, product_id, name, barcode, unit_id, unit_name, conversion,
              qty, base_qty, price, cost_price, discount, promo_id, promo_name,
              vat_rate, vat_amount, line_total, note)
invoice_tax_lines(id, tenant_id, invoice_id, rate, taxable_amount, tax_amount)
invoice_payments(id, tenant_id, invoice_id, method, amount, note, created_at)
held_orders(id, tenant_id, code, label, cart_json, customer_name, customer_phone, note, total, item_count, created_at)

customers(id, tenant_id, name, phone, email, address, tax_code, price_list_id, debt_limit,
          balance, loyalty_points, note, active)      -- dùng cho công nợ khách về sau
customer_payments(id, tenant_id, customer_id, invoice_id, amount, method, note, paid_at)

einvoices(id, tenant_id, invoice_id, provider, status, provider_invoice_no, tax_code,
          lookup_code, template_code, serial, xml_path, pdf_path, issued_at, error, attempt_count)
vietqr_transactions(id, tenant_id, transactionid UNIQUE, invoice_id, bank_account, amount,
                    content, order_id, trans_type, matched, raw_json, created_at)

backup_meta(id, tenant_id, name, size, location, created_at)   -- nếu sao lưu theo tenant
```

### 5.3 Quy ước tiền & làm tròn
- Tiền lưu **số nguyên VND** (`BIGINT`).
- `net_amount` (chưa thuế), `vat_amount`, `gross_amount`/`total` (đã thuế).
- Làm tròn theo quy tắc kế toán chốt: mặc định làm tròn **theo dòng** rồi cộng; cấu hình `round_scope = line | invoice`.
- `base_qty = qty × conversion` (tồn luôn tính theo đơn vị cơ bản).

---

## 6. VAT

- `products.vat_rate` ∈ {0, 5, 8, 10} (cấu hình được).
- **Thuế suất có hiệu lực theo thời gian:** bảng `vat_rates(rate, effective_from, effective_to)` để 8% tự về 10% sau khi hết hiệu lực.
  - Tham chiếu hiện hành: 8% là mức giảm tạm thời, áp dụng đến hết **31/12/2026** (Nghị quyết 204/2025/QH15; Nghị định 174/2025/NĐ-CP). *Cần kế toán xác nhận.*
- **Chế độ giá:** `vat_mode = inclusive` (giá đã gồm VAT) hoặc `exclusive`; đặt mặc định theo tenant, ghi đè theo sản phẩm.
- Tính toán:
  - inclusive: `net = round(gross / (1 + rate/100))`, `vat = gross − net`.
  - exclusive: `vat = round(net × rate/100)`, `gross = net + vat`.
- `invoice_tax_lines` tách theo từng mức thuế (bắt buộc khi hóa đơn nhiều mức).
- Báo cáo: bảng kê **mua vào / bán ra** theo thuế suất, tổng VAT đầu vào/đầu ra, đối chiếu, phụ lục giảm thuế.
- Hóa đơn in/hóa đơn điện tử hiển thị cột: Thành tiền (chưa thuế) – Thuế suất – Tiền thuế – Tổng.

---

## 7. Hóa đơn điện tử

### 7.1 Nguyên tắc pháp lý
Phần mềm **không tự phát hành** hóa đơn; phải qua **nhà cung cấp được cấp phép** + **chữ ký số** + **đăng ký mẫu/ký hiệu** với cơ quan thuế. Loại áp dụng cho POS: **hóa đơn điện tử khởi tạo từ máy tính tiền**.
> Tham chiếu: **Thông tư 91/2026/TT-BTC**, **Nghị định 254/2026/NĐ-CP**, ký hiệu hóa đơn theo **Thông tư 32/2025/TT-BTC**. *Cần kế toán/nhà cung cấp xác nhận.*

### 7.2 Adapter
```js
// src/einvoice/index.js
interface EInvoiceProvider {
  issue(invoice): { providerInvoiceNo, taxCode, lookupCode, xml, pdf }
  adjust(original, adjustment): {...}
  replace(original, replacement): {...}
  cancel(einvoice, reason): {...}
  getStatus(einvoice): { status, ... }
  downloadFiles(einvoice): { xml, pdf }
}
```
```
src/einvoice/
  index.js            # chọn provider theo cấu hình tenant
  providers/misa.js
  providers/viettel.js
  providers/vnpt.js
  providers/bkav.js
```

### 7.3 Cấu hình theo tenant
`settings`: `einvoice_provider`, `einvoice_env`, `einvoice_tax_code`, `einvoice_username`, `einvoice_password_enc`, `einvoice_template_code`, `einvoice_serial`, `einvoice_sign_mode` (hsm/usb/remote), thông tin ký số.
Thông tin đăng nhập **mã hóa khi lưu**, giải mã chỉ trong lúc gọi API.

### 7.4 Luồng phát hành
1. Hoàn tất thanh toán → build payload (người mua, MST, dòng hàng, thuế suất, net/VAT/gross).
2. Gọi provider → nhận số hóa đơn + mã tra cứu; lưu **XML + PDF**; cập nhật `invoices.einvoice_status`.
3. Gửi email/khách hàng (tuỳ chọn); in lại khi cần.
4. **Hàng đợi + retry** khi lỗi mạng; đánh dấu chờ phát hành nếu chưa xong.

### 7.5 Ca biên
- Điều chỉnh/thay thế/hủy theo thời hạn luật định; liên kết hóa đơn gốc.
- **Đổi trả hàng** ⇒ hóa đơn điều chỉnh giảm.
- Người mua **cá nhân vs doanh nghiệp** (bắt MST/tên/địa chỉ).
- Mất mạng: hàng đợi; nếu provider không hỗ trợ cấp số offline → cảnh báo rõ.
- Đối soát định kỳ với provider.

---

## 8. Thanh toán VietQR

> VietQR là dịch vụ **thanh toán/biến động số dư**, **khác** hóa đơn điện tử (mục 7).

### 8.1 Chiều ra – tạo QR động (server mình gọi VietQR)
- `POST {vqr_oauth_base}/vqr/api/token_generate` — `Authorization: Basic base64(username:password)` → `access_token` (hết hạn **300s**) ⇒ **cache + tự refresh**.
- `POST {vqr_api_base}/vqr/api/qr/generate-customer` — Bearer token. Body: `bankCode, bankAccount, userBankName, content, qrType, amount, orderId, transType, terminalCode, serviceCode, urlLink, sign`.
- Môi trường: Test `https://dev.vietqr.org`, Prod `https://api.vietqr.org`.

### 8.2 Chiều vào – webhook (mình mở cho VietQR gọi)
Basepath cấu hình (ví dụ `/vqr`):
- `POST /vqr/api/token_generate` — **Basic Auth do mình đặt**; trả `{ access_token, token_type:"Bearer", expires_in }` (JWT HS512 ký bằng secret nội bộ).
- `POST /vqr/bank/api/transaction-sync` — `Authorization: Bearer <token>`; body:
  `bankaccount, amount, transType, content, transactionid, transactiontime(ms), referencenumber, orderId, terminalCode, subTerminalCode, serviceCode, urlLink, sign`.
  Trả `{ error:false, errorReason:null, toastMessage:"...", object:{ reftransactionid } }` (hoặc 400 khi lỗi).

### 8.3 Ánh xạ & đối soát
- `invoices.payment_ref`: **mã ngắn ≤13 ký tự** dùng làm `orderId`; `content` ≤23 ký tự, không dấu.
- Callback → tìm `vietqr_transactions.transactionid` (idempotent) → khớp `orderId` → hóa đơn.
- Kiểm tra `amount` = `total`; lệch → **không tự xác nhận**, đánh dấu cần kiểm tra.
- Đúng → thêm `invoice_payments`, chuyển hóa đơn sang `paid`.

### 8.4 Luồng POS
1. Chọn "Chuyển khoản" → tạo QR động → hiển thị QR + số tiền + chờ.
2. POS polling trạng thái (hoặc WebSocket) mỗi ~2–3s.
3. Callback xác nhận → POS tự hiện hóa đơn. Vẫn có nút "Đã nhận tiền" thủ công dự phòng.
4. Ghép HĐĐT: sau khi nhận tiền → tự phát hành hóa đơn điện tử (nếu bật).

### 8.5 Ràng buộc đã biết
| Ràng buộc | Xử lý |
|---|---|
| `content` ≤ 23 ký tự, không dấu/đặc biệt | Sinh `payment_ref` an toàn |
| `orderId` ≤ 13 ký tự, không dấu | `payment_ref` ≤13 |
| Token 300s | Cache + refresh |
| Chỉ hỗ trợ MB/BIDV | Chốt ngân hàng |
| Callback có thể trùng | `transactionid UNIQUE` + idempotent |
| Cần URL public | Deploy public (SaaS) |

### 8.6 Mô hình nhiều cửa hàng (cần chốt với VietQR)
- **(A) Mỗi shop là merchant riêng:** tiền về TK từng shop; mỗi shop cấu hình credentials riêng; callback định tuyến theo `bankaccount` → tenant.
- **(B) Master merchant (tổng đại lý) + điểm bán:** dùng bộ API đồng bộ tổng đại lý/điểm bán; quản lý tập trung nhưng **tiền về TK bên bạn** ⇒ cần lưu ý pháp lý trung gian thanh toán.

### 8.7 Mock để kiểm thử
Module `src/payments/vietqr/mock.js` mô phỏng `token_generate`, `generate-customer`, `transaction-callback` để test toàn bộ luồng không cần internet/credentials.

---

## 9. Nhà cung cấp, mua hàng & công nợ

- **Hồ sơ NCC:** tên, MST, người liên hệ, địa chỉ, email, điều khoản thanh toán.
- **Bảng giá nhập** theo NCC (`supplier_price_items`) + **lịch sử giá** (từ `purchase_items`).
- **Phiếu nhập:** nháp → nhận hàng (cập nhật tồn, giá vốn bình quân/gần nhất), hủy có hoàn tác.
- **Trả hàng NCC** (`purchase_returns`).
- **Công nợ NCC:** `nợ = Σ purchases.received − Σ supplier_payments`; phiếu chi; báo cáo công nợ.
- Thống kê NCC: chi tiêu, giá nhập tăng/giảm, tỷ lệ trả hàng.

---

## 10. Thống kê & phân tích

### 10.1 Dashboard theo vai trò
- **Thu ngân:** doanh thu ca, số đơn, đơn treo, hàng bán chạy trong ca. Ẩn lợi nhuận.
- **Quản lý:** doanh thu, tồn kho, cảnh báo, hiệu suất nhân viên, công nợ.
- **Chủ:** lợi nhuận/biên, dòng tiền, VAT, theo SP/danh mục/NCC, đa điểm bán.
- **Nền tảng:** số tenant, doanh thu theo gói, mức dùng, tenant hoạt động/ngưng.

### 10.2 Phân tích
- **ABC/Pareto**, **hàng chết/tồn lâu**, **sell-through**.
- **Gợi ý điểm đặt hàng lại** + **dự báo nhu cầu** (moving average/mùa vụ).
- **Phát hiện bất thường:** giảm giá bất thường, hủy HĐ nhiều, chênh lệch kiểm kho.
- **Phân tích giỏ hàng** (mua kèm).
- **Hiệu suất NCC**.

### 10.3 Kỹ thuật
- Bảng tổng hợp `daily_metrics` / materialized view theo tenant; cập nhật theo lịch hoặc sau mỗi hóa đơn.
- Truy vấn báo cáo đọc bảng tổng hợp để nhanh; số liệu chi tiết tính on-demand.
- Mọi chỉ số nhạy cảm lọc theo quyền (`report.profit`, `product.view_cost`).

---

## 11. Bề mặt API

Giữ chữ ký hiện có để tương thích, thêm nhóm mới. Tiền tố `/api`.

- **Auth:** `POST /auth/login`, `/auth/logout`, `GET /auth/me`, `POST /auth/pin`, `POST /auth/change-password`.
- **Platform (super admin):** `/platform/tenants`, `/platform/plans`, `/platform/stats`.
- **Users/Roles:** `/users`, `/roles`, `/permissions`, `PUT /users/:id/permissions`.
- **Catalog:** (đã có) `/categories`, `/products`, `/products/barcode/:code`, `/barcodes/next`, `/products/barcodes/generate`, `/barcode-lookup/:code`, `/price-lists`, `/promotions`, `/units/:id`.
- **Sales:** (đã có) `/checkout/preview`, `/held-orders`, `/invoices`, `/invoices/:id/confirm|cancel|returnable`.
- **Inventory:** (đã có + mở rộng) `/suppliers`, `/purchases`, `/purchases/:id/receive|cancel`, `/purchase-returns`, `/stock-checks`, `/stock/moves`, `/stock/summary`.
- **VAT/E-invoice:** `/einvoices/:invoiceId/issue|adjust|replace|cancel|download`, `/einvoice/config`.
- **VietQR:** `GET /vietqr/config`; webhook tách basepath: `/vqr/api/token_generate`, `/vqr/bank/api/transaction-sync`; `GET /invoices/:id/payment-status`.
- **Reports:** (đã có + mở rộng) `/reports/summary|products|categories|inventory|slow-moving|purchases|vat`.
- **Admin:** `/settings`, `/info`, `/backups`, `/backup/now`, `/backups/:name/download|restore`.

---

## 12. Kiến trúc frontend

- Giữ ES modules, không build. Bổ sung: `js/auth.js`, `js/views/users.js`, `js/views/suppliers.js`, `js/views/einvoice-config.js`, `js/views/platform.js`.
- **Điều hướng theo quyền:** ẩn/hiện menu & nút dựa trên danh sách quyền trả từ `/auth/me`; nhưng **server vẫn là nơi quyết định**.
- POS chuyển khoản: hiển thị QR động + trạng thái chờ + tự cập nhật khi callback.
- Màn hình cấu hình: tài khoản/ký số HĐĐT, VietQR, gói dịch vụ.

---

## 13. Triển khai & vận hành

```
Internet ── Nginx (SSL, rate limit) ── Node/Express ── PostgreSQL
                                        └─ Redis (cache/queue)
```
- **Docker Compose:** `app`, `db`, `nginx`, `redis`.
- **Biến môi trường:** `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `VQR_*`, `EINVOICE_*`, `PUBLIC_URL`.
- **Backup:** `pg_dump` hằng ngày + lưu offsite; PITR bật WAL archive. Diễn tập restore định kỳ.
- **Monitoring:** health check, log (xoay vòng/Pino), error tracking (Sentry), cảnh báo.
- **Scale:** Node stateless (session trong DB/Redis) → chạy nhiều instance sau Nginx; Postgres read-replica khi cần.
- **Cập nhật:** blue-green/rolling; migration có version; backup trước deploy.

---

## 14. Bảo mật

| Nguy cơ | Kiểm soát |
|---|---|
| Rò rỉ dữ liệu tenant | `tenant_id` + RLS + repository + test cách ly |
| Leo thang quyền | RBAC ở server; kiểm tra quyền mọi endpoint; audit |
| Lộ credentials HĐĐT/VietQR | Mã hóa khi lưu; không log; tách theo tenant |
| Callback giả mạo | Basic + Bearer token + chữ ký `sign` + IP allowlist; idempotent |
| CSRF/XSS | Cookie `SameSite`, CSRF token, escape output |
| Brute force | Rate limit đăng nhập, khóa tạm, 2FA admin |
| Mất dữ liệu | Backup + PITR + diễn tập restore |
| SQL injection | Tham số hoá truy vấn, không nối chuỗi |

---

## 15. Kiểm thử

- **API test:** giữ & mở rộng (hiện 94). Bổ sung: cách ly tenant, phân quyền, VAT, HĐĐT (mock provider), VietQR (mock), công nợ NCC.
- **UI test (Playwright):** giữ & mở rộng (hiện 63) cho luồng đăng nhập, quyền, POS chuyển khoản chờ, cấu hình.
- **Test cách ly tenant là bắt buộc** trong CI.
- **Mock dịch vụ ngoài** (HĐĐT, VietQR) để test tất định, không phụ thuộc mạng.
- **Diễn tập backup/restore** định kỳ.

---

## 16. Chuyển đổi từ bản hiện tại

1. **Viết lại lớp DB** sang PostgreSQL, giữ nguyên hình dạng API để test cũ tái sử dụng.
2. **Thêm `tenant_id`** mọi bảng; dữ liệu đơn tenant hiện tại gán vào "tenant nền tảng" hoặc tenant mẫu.
3. **Chuẩn hoá `settings`** thành `settings(tenant_id, key, value)`.
4. **Bọc mọi truy vấn** qua repository chèn tenant.
5. **Giữ tương thích endpoint** trong giai đoạn chuyển tiếp.
6. **Backup** bản SQLite trước khi chuyển; viết script import dữ liệu cũ nếu cần.

---

## 17. Phụ lục

### 17.1 Khoá cấu hình (settings) tiêu biểu
`shop_name, shop_address, shop_phone, shop_tax_code, invoice_prefix, return_prefix, purchase_prefix, stockcheck_prefix, currency, default_price_list_id, allow_negative_stock, low_stock_alert, print_after_pay, label_*, online_lookup, lookup_url, backup_enabled, backup_keep,`
`vat_mode, vat_rate_default, round_scope,`
`einvoice_provider, einvoice_env, einvoice_tax_code, einvoice_username, einvoice_password_enc, einvoice_template_code, einvoice_serial, einvoice_sign_mode,`
`vqr_env, vqr_api_base, vqr_oauth_base, vqr_username, vqr_password, vqr_bank_code, vqr_bank_account, vqr_account_holder, vqr_terminal_code, vqr_exposed_username, vqr_exposed_password_hash, vqr_secret_key`.

### 17.2 Thuật ngữ
- **Tenant:** một cửa hàng (đơn vị dữ liệu độc lập).
- **RBAC:** phân quyền theo vai trò.
- **RLS:** Row-Level Security của PostgreSQL.
- **HĐĐT:** hóa đơn điện tử.
- **BĐSD:** biến động số dư.

### 17.3 Tham chiếu pháp lý (cần kế toán xác nhận)
- VAT 2026: các mức 0/5/8/10%; 8% áp dụng đến hết **31/12/2026** (Nghị quyết 204/2025/QH15; Nghị định 174/2025/NĐ-CP).
- Hóa đơn điện tử từ máy tính tiền: **Thông tư 91/2026/TT-BTC**, **Nghị định 254/2026/NĐ-CP**.
- Ký hiệu hóa đơn: **Thông tư 32/2025/TT-BTC**.

### 17.4 Tham chiếu VietQR
- Tài liệu: `https://api.vietqr.vn/vi/...` (bản markdown thêm `.md`); khai báo merchant: `https://vietqr.vn/merchant/request`.
- Endpoint Test: `https://dev.vietqr.org`; Prod: `https://api.vietqr.org`.
- Hỗ trợ liên kết ngân hàng hiện tại: **MB, BIDV**.
