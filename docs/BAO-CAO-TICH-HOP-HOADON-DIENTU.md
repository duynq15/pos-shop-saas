# BÁO CÁO ĐÁNH GIÁ & KẾ HOẠCH TÍCH HỢP

## Module xuất hoá đơn điện tử tự động (Tingo Pay · VietQR) vào POS Shop

Phiên bản 1.0 · Tháng 09/2026 · Nội bộ
Nguồn: `Tai_lieu_ky_thuat_API_Service_Xuat_Hoa_Don.md` (Tingo Pay, v1.1)
Đối tượng đọc: chủ dự án, kỹ thuật, CSKH

---

## 1. Mục đích và phạm vi

Báo cáo đánh giá mức độ sẵn sàng của POS Shop để tích hợp bộ API **xuất hoá đơn điện tử tự động** của Tingo Pay/VietQR, chỉ rõ:

- Tài liệu API cung cấp những gì.
- POS Shop hiện đã có gì, còn thiếu gì.
- Kiến trúc và kế hoạch triển khai đề xuất.
- Điều kiện tiên quyết, rủi ro, tiêu chí nghiệm thu.

**Phạm vi kỹ thuật:** luồng tạo đơn hàng kèm QR thanh toán → nhận callback giao dịch → phát hành hoá đơn tự động → nhận callback hoá đơn → tra cứu/tải PDF.

---

## 2. Tóm tắt bộ API của Tingo Pay / VietQR

### 2.1 Môi trường

| Môi trường | Base URL |
| --- | --- |
| Kiểm thử (dev) | `https://dev.vietqr.org/vqr` |
| Vận hành (prod) | `https://api.vietqr.org/vqr` |

Dữ liệu `application/json`; riêng tải PDF trả nhị phân.

### 2.2 API do VietQR cung cấp (POS Shop gọi ra)

| API | Endpoint | Mục đích |
| --- | --- | --- |
| Get Token | `POST /api/token_generate` | Lấy Bearer Token (Basic Auth) |
| **Tạo đơn hàng** | `POST /api/qr/generate-customer-order` | Tạo đơn hàng (hàng hoá + người mua) và mã VietQR |
| Tra cứu đơn hàng | `POST /api/order/query` | Lấy trạng thái đơn theo `orderId` |
| Tra cứu hoá đơn | `POST /api/invoice/query` | Lấy hoá đơn theo `orderId`/`invoiceId` |
| Tải PDF hoá đơn | `GET /api/invoice/export-pdf?invoiceId=...` | Tải PDF |
| Kiểm tra cấu hình | `GET /api/invoice-config/status?bankAccount=...` | Kiểm tra tài khoản sẵn sàng xuất hoá đơn |

### 2.3 API do POS Shop phải triển khai (VietQR gọi vào)

| API | Endpoint (basepath của POS = `vqr`) | Trạng thái trong POS Shop |
| --- | --- | --- |
| Get Token | `POST /vqr/api/token_generate` | ✅ Đã có |
| Callback giao dịch | `POST /vqr/bank/api/transaction-sync` | ✅ Đã có |
| **Callback hoá đơn** | `POST /vqr/api/invoice-sync` | ❌ **Chưa có** |

### 2.4 Luồng nghiệp vụ

```
Get Token → Tạo đơn hàng (orderId + items + buyer) → nhận mã VietQR
→ Người mua thanh toán → Callback giao dịch (orderId)
→ Xuất hoá đơn tự động (theo cấu hình trên cổng VietQR)
→ Callback hoá đơn (orderId) → Tra cứu đơn/hoá đơn/tải PDF
```

**Khoá liên kết xuyên suốt:** `orderId` (đối tác truyền khi tạo đơn; trả về trong mọi callback và dùng để tra cứu).

### 2.5 Điều kiện sử dụng dịch vụ (quan trọng)

- Có tài khoản **Tingo Pay**, đã liên kết tài khoản ngân hàng nhận tiền.
- Đã khai báo kết nối API, nhận `username`/`password`.
- Đã triển khai API Get Token + Callback giao dịch (POS đã có) **và Callback hoá đơn** (POS chưa có).
- Cấu hình xuất hoá đơn tự động thực hiện **trên cổng VietQR.vn/app, KHÔNG qua API**: liên kết nhà cung cấp HĐĐT, chọn **ký hiệu hoá đơn**, **bật cho tài khoản ngân hàng**, đặt **khung giờ phát hành** và **thời gian chờ**.

> **Hệ quả:** nếu chưa cấu hình/ký hiệu, đơn hàng và thanh toán vẫn chạy bình thường, hoá đơn **không** phát hành (`invoiceStatus = NONE/SKIPPED`). Tức module e-invoice có thể bật/tắt độc lập, không chặn bán hàng — rất phù hợp để triển khai theo giai đoạn.

---

## 3. Hiện trạng POS Shop (liên quan hoá đơn / VAT / VietQR)

| Hạng mục | Hiện trạng trong repo | Ảnh hưởng tới tích hợp |
| --- | --- | --- |
| Tạo QR động | `src/payments/vietqr.js` gọi `/qr/generate-customer` (chỉ tạo QR, không items/buyer) | **Phải chuyển sang `/qr/generate-customer-order`** để đơn hàng mang hàng hoá + người mua, từ đó mới tự xuất hoá đơn |
| Callback giao dịch | `src/routes/vietqr.js` → `/vqr/bank/api/transaction-sync`, idempotent theo `transactionid` | Dùng lại được; cần bổ sung định tuyến theo `orderId` (đã có) |
| Get Token cho VietQR | `POST /vqr/api/token_generate` (Basic do mình định nghĩa) | ✅ Khớp tài liệu |
| Callback hoá đơn | Chưa có | **Cần thêm** `/vqr/api/invoice-sync` |
| `orderId` | Dùng `invoices.payment_ref` = `P` + 10 chữ số (11 ký tự, cấp số toàn cục) | ✅ Hợp lệ (≤13, không dấu); đảm bảo **không trùng** nhờ cấp số toàn cục |
| `content` | Cũng là `payment_ref` (11 ký tự) | ✅ Hợp lệ (≤23) |
| VAT | `products.vat_rate REAL`; `src/lib/pricing.js` tách net/tax theo từng mức; lưu `invoice_tax_lines` | ✅ Có dữ liệu thuế; cần **map** mức thuế sang chuỗi cho phép |
| Người mua | `invoices` chỉ có `customer_name`, `customer_phone` | ⚠️ **Thiếu** công ty, MST, địa chỉ, email |
| Quyền | RBAC đã có `invoice.einvoice`, `einvoice.config` (`src/lib/rbac.js`) | ✅ Chỗ hook quyền đã định sẵn |
| Gói dịch vụ | Plans `basic`/`pro` đã gắn feature `einvoice` (`src/control.js`) | ✅ Có sẵn cơ chế gate theo gói |
| Sản phẩm bán theo cân | Hỗ trợ `is_weighted`, `qty REAL` (vd 0.5kg) | ⚠️ API chỉ nhận `quantity` **Integer ≥ 1** → xung đột |
| Chiết khấu | Khuyến mãi + giảm giá dòng/hoá đơn (`discount`, `promo_*`) | ⚠️ API **không có** trường chiết khấu → phải “nhồi” vào đơn giá |

---

## 4. Đối chiếu: dùng được ngay / khoảng trống

### 4.1 Dùng lại được
- Hạ tầng webhook, Get Token, `orderId`/`content` hợp lệ, dữ liệu thuế theo dòng, quyền và gói dịch vụ.
- Callback giao dịch + cơ chế idempotent theo `transactionid`.

### 4.2 Khoảng trống phải bù

| # | Khoảng trống | Mức độ | Ghi chú |
| --- | --- | --- | --- |
| G1 | Chưa gọi API `generate-customer-order` (đang chỉ tạo QR) | Cao | Điều kiện bắt buộc để có hoá đơn |
| G2 | Chưa có endpoint `POST /vqr/api/invoice-sync` | Cao | Không nhận được kết quả phát hành |
| G3 | Thiếu thông tin người mua (MST, công ty, địa chỉ, email) | Cao | Hoá đơn cần cho khách doanh nghiệp |
| G4 | Chưa map `vat_rate` (REAL) → chuỗi `0/5/8/10/KCT/KKKNT/KHAC` | Trung bình | Mức lạ → `KHAC` |
| G5 | Hàng bán theo cân (qty lẻ) không biểu diễn được | Trung bình | Cần chính sách làm tròn/loại trừ |
| G6 | Không biểu diễn chiết khấu trên hoá đơn | Trung bình | Nhồi vào đơn giá hoặc bỏ |
| G7 | Chưa có API tra cứu đơn/hoá đơn/tải PDF, chưa có UI xem/tải PDF | Trung bình | Phục vụ CSKH |
| G8 | Chưa có màn hình cấu hình + kiểm tra `invoice-config/status` | Trung bình | Chỉ đọc; cấu hình làm trên cổng VietQR |
| G9 | Chưa lưu trạng thái e-invoice theo hoá đơn | Trung bình | Thêm cột/bảng |
| G10 | Chưa lưu thông tin lúc **tạo QR**; dashboard chỉ có dữ liệu **callback** | Trung bình | Lưu `qr_orders` (số tiền/nội dung/thời điểm) + đối chiếu |

---

## 5. Kiến trúc tích hợp đề xuất

```
POS Shop                                                     Tingo Pay / VietQR
──────────────────────────────────────────────────────────── ───────────────────────
[Cài đặt] bật e-invoice + ký hiệu, STK ──┐
[POS] Bán hàng (items + buyer)             │
   └─ nếu e-invoice ON & ready ────────────┼─► POST /vqr/api/qr/generate-customer-order
       (đơn hàng + QR)                      │        (items, buyer, orderId=payment_ref)
   ◄── qrCode/qrImage/link ────────────────┘        ← trả mã QR
[Hiển thị QR] người mua quét & chuyển tiền ─────────────────────────────►  Ngân hàng
   ◄── POST /vqr/bank/api/transaction-sync (orderId) ───────────────────  (đã có, giữ)
[Đánh dấu hoá đơn đã thanh toán]                                        VietQR tự phát hành
   ◄── POST /vqr/api/invoice-sync (orderId, invoiceId, status…) ─────────  (MỚI)
[Lưu trạng thái]  ──► POST /api/order/query khi cần đối soát
[Xem/tải]        ──► GET /api/invoice/export-pdf?invoiceId=...  (MỚI, phục vụ CSKH)
[Kiểm tra sẵn sàng] ──► GET /api/invoice-config/status?bankAccount=...  (MỚI)
```

### 5.1 Thay đổi dữ liệu (per-tenant DB)
- `invoices`: thêm
  - `buyer_company_name`, `buyer_tax_code`, `buyer_address`, `buyer_email` (G3).
  - `einvoice_status` (`NONE|WAITING|ISSUED|FAILED|SKIPPED`), `einvoice_id`, `einvoice_code`, `einvoice_serial`, `einvoice_number`, `einvoice_issued_at`, `einvoice_pdf` (đường dẫn nếu tự lưu) (G9).
- (Tuỳ chọn) bảng `einvoice_events(invoice_id, order_id, payload_json, created_at)` để lưu vết callback.
- Bảng `customers` (tuỳ chọn, giai đoạn sau) để chọn nhanh khách doanh nghiệp.

### 5.2 Settings (per-tenant)
- `einvoice_enabled` (`0/1`), `einvoice_auto` (`0/1` tự xuất khi thanh toán).
- `einvoice_username`, `einvoice_password` (hoặc dùng chung credentials với VietQR), `einvoice_bank_account`, `einvoice_bank_code`.
- `einvoice_serial`, `einvoice_from_time`, `einvoice_to_time`, `einvoice_waiting_hour` (đồng bộ từ `invoice-config/status`).

### 5.3 Endpoint mới (phía app)
- `POST /api/invoices/:id/einvoice` — xuất/thử xuất hoá đơn cho 1 hoá đơn.
- `GET  /api/invoices/:id/einvoice` — trạng thái + thông tin hoá đơn (gọi `invoice/query`).
- `GET  /api/invoices/:id/einvoice/pdf` — tải PDF (proxy `export-pdf`).
- `GET  /api/einvoice/config` và `POST /api/einvoice/config/check` — đọc/kiểm tra `invoice-config/status`.

### 5.4 Endpoint webhook mới
- `POST /vqr/api/invoice-sync` — xác thực Bearer, định tuyến theo `orderId` (dùng chung cơ chế với transaction-sync), cập nhật trạng thái hoá đơn, **idempotent theo `invoiceId`**, luôn trả HTTP 200 khi đã nhận/lưu; luôn log `[einvoice]`.

---

### 5.5 Báo cáo & đối soát giao dịch (dashboard)

**Xác nhận từ nhà cung cấp (trao đổi 26/09/2026):**
- VietQR **KHÔNG cung cấp API báo cáo/thống kê**. Dữ liệu giao dịch chỉ xem/xuất được trên web `vietqr.vn` / `v1.vietqr.vn`.
- Muốn hiển thị trong phần mềm, đối tác phải **tự lưu rồi đối chiếu** từ 2 nguồn:
  1. **Lúc tạo QR** (`generate-customer-order`): `orderId`, số tiền, nội dung, STK, thời điểm → trạng thái **chờ thanh toán**.
  2. **Lúc callback** (`/vqr/bank/api/transaction-sync`): mã giao dịch, số tiền, nội dung, `orderId`, thời điểm → trạng thái **đã thanh toán**.
- **Đối chiếu theo `orderId`** (và số tiền/nội dung) → dựng dashboard giao dịch.

**Hiện trạng POS Shop:** đã có dashboard "Giao dịch VietQR" và xuất CSV từ dữ liệu **callback** (`/reports/vietqr`, `/reports/vietqr/export`; UI `public/js/views/reports.js`).
**Thiếu:** chưa lưu thông tin **lúc tạo QR** nên chưa thấy các QR **đã tạo nhưng chưa nhận tiền**.

**Cập nhật đề xuất:**
- Lưu bản ghi QR lúc tạo: `qr_orders(order_id, tenant_code, invoice_id, amount, content, bank_account, created_at)`.
- Dashboard 3 trạng thái: **Chờ thanh toán** (có QR, chưa callback) · **Đã thanh toán** (khớp) · **Chưa khớp** (callback không tìm thấy QR).
- Lọc theo ngày/trạng thái/từ khoá + **xuất CSV** để đối soát kế toán.
- Ghi chú: đây là "module báo cáo" chạy trên dữ liệu **tự lưu**, không phụ thuộc API báo cáo của VietQR.

---

## 6. Mapping dữ liệu POS → API (chi tiết)

### 6.1 Thông tin thanh toán

| API field | Nguồn POS | Ghi chú |
| --- | --- | --- |
| `bankCode` | `settings.vqr_bank_code` (hoặc `bank_bin`) | Map sang mã VietQR (TPB, MB, BIDV…) |
| `bankAccount` | `settings.bank_account` | Phải đã liên kết ở VietQR |
| `userBankName` | `settings.account_holder` / `shop_name`, bỏ dấu, ≤50 | Dùng `removeVietnamese()` |
| `content` | `invoices.payment_ref` | 11 ký tự, hợp lệ ≤23 |
| `orderId` | `invoices.payment_ref` | 11 ký tự, hợp lệ ≤13, **không trùng** |
| `transType` | `"C"` | Cố định ghi có |

### 6.2 `items[]`

| API field | Nguồn POS | Xử lý |
| --- | --- | --- |
| `code` | `products.sku` / `barcode` | Có thể để trống |
| `name` | `invoice_items.name` | Không rỗng |
| `quantity` | `invoice_items.qty` | ⚠️ Phải **số nguyên ≥ 1** |
| `unit` | `invoice_items.unit_name` | vd `Lon`, `Cái` |
| `unitPriceAfterTax` | Đơn giá **đã gồm thuế**, sau chiết khấu | Long > 0 |
| `taxRate` | `products.vat_rate` | Map: `0→"0"`, `5→"5"`, `8→"8"`, `10→"10"`; khác → `"KHAC"`; (tuỳ chọn map `KCT/KKKNT`) |

**Xử lý VAT:** POS đã tính `gross_amount` (đã gồm thuế) cho từng dòng ở cả 2 chế độ `inclusive`/`exclusive` (`src/lib/pricing.js`). Dùng giá trị này để tính `unitPriceAfterTax = round(gross_amount_dòng / quantity)`.

**Xử lý chiết khấu (G6):** vì API không có trường chiết khấu, đề xuất **nhồi chiết khấu vào `unitPriceAfterTax`** để tổng hoá đơn = số tiền thực thu. Đánh đổi: hoá đơn không thể hiện “giảm giá” dạng dòng riêng — cần xác nhận với kế toán/đối tác.

**Hàng theo cân (G5):**
- Phương án A (khuyến nghị): với mặt hàng `is_weighted`, **làm tròn lên thành 1** và nhồi giá tương ứng (`unitPriceAfterTax = tổng dòng`), giữ tổng tiền đúng.
- Phương án B: **không** tự xuất hoá đơn cho đơn có hàng theo cân, đánh dấu `SKIPPED` để xử lý thủ công.
- Đề xuất chốt theo Phương án A và ghi chú trên hoá đơn.

### 6.3 `buyer` (G3)

| API field | Cột POS đề xuất |
| --- | --- |
| `name` | `customer_name` |
| `phone` | `customer_phone` |
| `companyName` | `buyer_company_name` (mới) |
| `taxCode` | `buyer_tax_code` (mới) |
| `address` | `buyer_address` (mới) |
| `email` | `buyer_email` (mới) |

Không gửi `buyer` → hoá đơn ghi khách vãng lai (mặc định cho bán lẻ).

---

## 7. Phân quyền (RBAC) cho module hoá đơn điện tử

### 7.1 Nguyên tắc
- Quyền **thực thi ở server** bằng `requirePerm(...)` (`src/middleware.js`); giao diện chỉ ẩn/hiện, không thay thế kiểm tra quyền.
- Quyền gán theo vai trò trong `src/lib/rbac.js` (hỗ trợ wildcard `*` và `nhóm.*`).
- Tách bạch **2 nhóm**: (a) *nghiệp vụ* — xem/phát hành hoá đơn; (b) *cấu hình* — bật và kết nối dịch vụ.
- **Độc lập với gói dịch vụ:** shop không có feature `einvoice` (theo `control.js`) thì chặn ở tầng plan, không liên quan tới vai trò.

### 7.2 Danh mục quyền (giữ tên đã có, không thêm mới nếu không cần)

| Quyền | Ý nghĩa | Áp cho |
| --- | --- | --- |
| `invoice.view` | Xem trạng thái hoá đơn + tải PDF | GET trạng thái, GET PDF |
| `invoice.einvoice` | Xuất/phát hành, xuất lại, đối soát hoá đơn | POST xuất hoá đơn |
| `einvoice.config` | Bật/tắt, nhập STK/ký hiệu/khung giờ, kiểm tra cấu hình | GET/POST cấu hình |
| `report.view` / `report.export` | Xem/xuất báo cáo thuế | `/reports/vat` (đã có) |

> Đề xuất: **dùng `invoice.view`** cho cả xem và tải PDF (tránh phình quyền). Nếu cần chặt hơn, tách thêm `invoice.einvoice.view` — nhưng khi đó phải cập nhật cả 7 vai trò.

### 7.3 Ma trận vai trò × quyền

| Vai trò | Xem/tải PDF<br>`invoice.view` | Phát hành/xuất lại<br>`invoice.einvoice` | Cấu hình<br>`einvoice.config` |
| --- | :---: | :---: | :---: |
| owner (Chủ) | ✅ (`*`) | ✅ (`*`) | ✅ (`*`) |
| manager (Quản lý) | ✅ (`invoice.*`) | ✅ (`invoice.*`) | ✅ |
| accountant (Kế toán) | ✅ | ✅ | ✅ |
| cashier (Thu ngân) | ✅ | ❌ | ❌ |
| sales (NV bán hàng) | ✅ | ❌ | ❌ |
| warehouse (Thủ kho) | ❌ | ❌ | ❌ |
| viewer (Chỉ xem) | ✅ | ❌ | ❌ |

### 7.4 Ánh xạ endpoint → quyền

| Endpoint | Quyền | Ghi chú |
| --- | --- | --- |
| `POST /api/invoices/:id/einvoice` | `invoice.einvoice` | Xuất/xuất lại hoá đơn |
| `GET  /api/invoices/:id/einvoice` | `invoice.view` | Trạng thái + thông tin hoá đơn |
| `GET  /api/invoices/:id/einvoice/pdf` | `invoice.view` | Tải PDF |
| `GET  /api/einvoice/config` | `einvoice.config` | Đọc cấu hình |
| `POST /api/einvoice/config/check` | `einvoice.config` | Gọi `invoice-config/status` |
| `POST /vqr/api/invoice-sync` | *(Không dùng RBAC)* | Webhook; xác thực Bearer do `token_generate` cấp |

### 7.5 Ghi chú triển khai
- Hiện `invoice.einvoice` và `einvoice.config` **chỉ mới khai báo trong `rbac.js`**, chưa gắn `requirePerm` ở route nào → khi làm T4/T5/T6 phải gắn đúng.
- Webhook `/vqr/api/invoice-sync` **không** đi qua `attachSession/requirePerm`; xác thực bằng Bearer token (giống `transaction-sync`), không dùng phiên người dùng.
- Nút thao tác trên UI (Xuất hoá đơn / Tải PDF / cấu hình) phải ẩn theo quyền của người đăng nhập, song song với kiểm tra server.

---

## 8. Trạng thái & mã lỗi (để hiển thị/lưu)

**Đơn hàng — `status`:** `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`, `FAILED`.
**Đơn hàng — `invoiceStatus`:** `NONE`, `WAITING`, `ISSUED`, `FAILED`, `SKIPPED`.
**Hoá đơn — `status` (0–8):** `NOT_SENT_TO_AUTHORITY` → `WAITING_FOR_AUTHORITY` → `SENDING_TAX` → `AUTHORITY_CODE_GIVEN` → `AUTHORITY_CODE_NOT_GIVEN` → `AUTHORITY_ACCEPT` → `AUTHORITY_DENY` → `SEND_ERROR` → `SIGN_ERROR`.

**Mã lỗi cần hiển thị thân thiện:** E05, E25, E34, E46, E74, E76, E77, E96, E165.

---

## 9. Danh mục công việc & ước lượng

| # | Công việc | Liên quan | Ước lượng |
| --- | --- | --- | --- |
| T1 | Thêm cột buyer + trạng thái e-invoice vào `invoices` (migration) | G3, G9 | 0.5 ngày |
| T2 | Chuyển tạo QR sang `generate-customer-order`, map `items`+`buyer`, xử lý VAT/chiết khấu/cân | G1, G4, G5, G6 | 2–3 ngày |
| T3 | Thêm webhook `POST /vqr/api/invoice-sync` (idempotent, log, trả 200) | G2 | 1 ngày |
| T4 | API app: xuất hoá đơn, xem trạng thái, tải PDF (proxy), check config — **gắn `requirePerm`** (mục 7.4) | G7, G8 | 1.5–2 ngày |
| T5 | UI: nhập thông tin người mua ở POS; hiển thị/trạng thái + nút “Tải hoá đơn”/“Xuất lại” — **ẩn/hiện theo quyền** | G3, G7 | 2 ngày |
| T6 | UI Cài đặt: bật e-invoice, STK/ký hiệu, khung giờ, nút “Kiểm tra cấu hình” — **chỉ vai trò có `einvoice.config`** | G8 | 1 ngày |
| T7 | Xử lý lỗi/edge: trùng orderId, token hết hạn, callback lặp, gói dịch vụ | — | 1 ngày |
| T8 | Test end-to-end dev (test callback) + test thật 1 giao dịch nhỏ | — | 1 ngày |
| T9 | Tài liệu vận hành + đào tạo CSKH | — | 0.5 ngày |
| T10 | **Dashboard đối soát giao dịch**: lưu thông tin QR lúc tạo (`qr_orders`), hiển thị Chờ/Đã/Chưa khớp, lọc + xuất CSV | G10, mục 5.5 | 1–1.5 ngày |

**Tổng ước lượng: ~12–14.5 ngày công.** Có thể chia 2 giai đoạn:
- **GĐ1 (bắt buộc, ~7–8.5 ngày):** T1, T2, T3, T6, T8, **T10** — có hoá đơn tự động + dashboard đối soát cơ bản.
- **GĐ2 (~5–6 ngày):** T4, T5, T7, T9 — tra cứu/PDF/UI hoàn chỉnh.

---

## 10. Điều kiện tiên quyết (làm trước, ngoài code)

1. **Hợp đồng/đăng ký Tingo Pay** và liên kết tài khoản ngân hàng nhận tiền.
2. **Khai báo kết nối API**, nhận `username/password`; cung cấp cho VietQR 3 URL callback của POS:
   - `https://thanhtoanso.sangkienhunggia.app/vqr/api/token_generate`
   - `https://thanhtoanso.sangkienhunggia.app/vqr/bank/api/transaction-sync`
   - `https://thanhtoanso.sangkienhunggia.app/vqr/api/invoice-sync` *(sau khi T3 xong)*
3. **Cấu hình trên cổng VietQR:** liên kết nhà cung cấp HĐĐT, **chọn ký hiệu hoá đơn**, **bật cho từng tài khoản ngân hàng**, đặt khung giờ/ thời gian chờ.
4. Xác nhận `ready = true` bằng API Kiểm tra cấu hình trước khi vận hành.

---

## 11. Rủi ro & câu hỏi mở

| # | Rủi ro / câu hỏi | Mức | Hướng xử lý |
| --- | --- | --- | --- |
| R1 | Hàng theo cân không biểu diễn được `quantity` lẻ | Cao | Chốt Phương án A/B ở mục 6.2 |
| R2 | Chiết khấu không hiển thị trên hoá đơn | Trung bình | Nhồi vào đơn giá; xác nhận kế toán |
| R3 | Khung giờ phát hành → hoá đơn phát sinh ngoài giờ bị `SKIPPED` | Trung bình | Hiển thị trạng thái rõ; cho xuất bù thủ công |
| R4 | Tài liệu ghi endpoint có/không tiền tố `/vqr` (bảng vs ví dụ) | Thấp | Xác nhận với đối tác; follow ví dụ |
| R5 | Callback lặp lại | Trung bình | Idempotent theo `invoiceId`/`transactionid` |
| R6 | Token 300s, VietQR gọi lại khi cần | Thấp | Đã xử lý ở token_generate hiện tại |
| R7 | Cấu hình bật/tắt theo **tài khoản ngân hàng** (không theo shop) | Trung bình | Nhiều shop dùng chung 1 TK → cần định tuyến theo `orderId` (đã có) |
| R8 | Nhà cung cấp HĐĐT/ký hiệu chưa sẵn sàng | Cao (phụ thuộc) | Làm song song; bật khi `ready=true` |

---

## 12. Tiêu chí nghiệm thu

- [ ] Tạo đơn CK → sinh QR; giao dịch thành công → hoá đơn **tự phát hành** khi cấu hình `ready=true`.
- [ ] `POST /vqr/api/invoice-sync` nhận callback, cập nhật đúng hoá đơn theo `orderId`, **idempotent**, luôn trả HTTP 200 và có log `[einvoice]`.
- [ ] Tắt cấu hình → đơn/thanh toán vẫn chạy, `invoiceStatus = NONE/SKIPPED` (không lỗi bán hàng).
- [ ] Thông tin người mua (MST/công ty/địa chỉ/email) lên đúng hoá đơn.
- [ ] **Dashboard đối soát:** hiển thị được cả QR **Chờ thanh toán** lẫn giao dịch **Chưa khớp**; lọc theo ngày/trạng thái/từ khoá; xuất CSV; số liệu khớp với thực thu.
- [ ] Tra cứu được trạng thái và **tải PDF** hoá đơn từ POS.
- [ ] Kiểm tra cấu hình hiển thị `ready/ ký hiệu/ khung giờ` đúng.
- [ ] **Phân quyền:** server chặn đúng (cashier/sales không phát hành & không cấu hình; chỉ owner/manager/accountant có `invoice.einvoice`); UI ẩn nút theo quyền; webhook `/vqr/api/invoice-sync` không dùng phiên người dùng.
- [ ] Gói dịch vụ: shop không có quyền `einvoice` không thấy chức năng.
- [ ] VAT/chiết khấu/hàng theo cân cho tổng tiền hoá đơn **khớp** số tiền thực thu.

---

## 13. Phụ lục

### 13.1 Bảng `taxRate`

| Giá trị | Nghĩa | Map từ POS |
| --- | --- | --- |
| `0` | 0% | `vat_rate = 0` |
| `5` | 5% | `vat_rate = 5` |
| `8` | 8% | `vat_rate = 8` |
| `10` | 10% | `vat_rate = 10` |
| `KCT` | Không chịu thuế | (tuỳ chọn) |
| `KKKNT` | Không kê khai, nộp thuế | (tuỳ chọn) |
| `KHAC` | Khác | mọi mức khác |

### 13.2 Công thức tiền (theo tài liệu)

```
lineAmountAfterTax = unitPriceAfterTax × quantity
linePreTax         = round(lineAmountAfterTax / (1 + taxRateFraction))
lineTax            = lineAmountAfterTax − linePreTax
Total              = Σ lineAmountAfterTax
```
Ví dụ: 5 × 10.000, taxRate 8 → preTax 46.296, tax 3.704, dòng 50.000.

### 13.3 Tham chiếu mã nguồn POS Shop

- `src/payments/vietqr.js` — client gọi API VietQR (`getToken`, `generateQR`).
- `src/routes/vietqr.js` — webhook `token_generate`, `transaction-sync`; API tạo QR/trạng thái/kiểm tra kết nối.
- `src/lib/pricing.js` — tính VAT inclusive/exclusive, `tax_lines`, `gross_amount`.
- `src/db.js` — schema `invoices`, `invoice_items`, `invoice_tax_lines`, `settings`.
- `src/lib/rbac.js` — quyền `invoice.einvoice`, `einvoice.config`.
- `src/control.js` — plans gắn feature `einvoice`.
- `docs/VIETQR-MANUAL.md`, `docs/VIETQR-REGISTER.md` — vận hành/đăng ký VietQR.

---

*Hết báo cáo.*
