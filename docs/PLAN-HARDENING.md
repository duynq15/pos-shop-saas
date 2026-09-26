# Kế hoạch củng cố & hoàn thiện – POS Shop SaaS

> Kế hoạch chi tiết sau đợt đánh giá kiến trúc ngày 26/09/2026.
> Mục tiêu: đưa hệ thống từ trạng thái "chạy được" sang "bán được, vận hành an toàn".
> Thời lượng ước tính: 5–6 tuần cho 1 dev toàn thời gian (4 tuần nếu 2 dev).
> Bản 2 (26/09/2026): sửa theo phản biện đối chiếu code, xem mục 9.

## 0. Tóm tắt hiện trạng

| Hạng mục | Điểm hiện tại | Mục tiêu sau kế hoạch |
|---|---|---|
| Kiến trúc & cách ly tenant | 8/10 | 8/10 (giữ nguyên, bổ sung ánh xạ tenant) |
| Bảo mật | 4/10 | 8/10 |
| Chất lượng code | 7/10 | 8/10 |
| Kiểm thử | 6/10 | 8/10 |
| Vận hành / DevOps | 6/10 | 8/10 |
| Tài liệu | 6/10 | 8/10 |

Nguyên tắc xuyên suốt:
- Không đổi kiến trúc SQLite-per-tenant. Kiến trúc này phù hợp quy mô hiện tại.
- Mỗi sprint kết thúc bằng bộ test xanh và một bản deploy được lên VPS.
- Sửa lỗi bảo mật trước, tính năng mới sau.

## 1. Lộ trình tổng thể

| Sprint | Tên | Mục tiêu | Thời lượng |
|---|---|---|---|
| S1 | Vá bảo mật khẩn | RBAC, lộ secret, `fail()` không dừng, CSRF, secret production, test phân quyền + cách ly tenant | 4 ngày |
| S2 | Phiên, mã chứng từ, dữ liệu | Session, sequence atomic, mã hóa secret at-rest, validate input, rà XSS, lỗi trả về | 5 ngày |
| S3 | Vận hành production | Log, health, backup offsite có mã hóa, harness test, CI | 7 ngày |
| S4 | Hiệu năng & mở rộng | Ánh xạ tenant, cache kết nối, helmet/CSP, tài liệu | 5 ngày |
| S5 | Dự phòng & nghiệm thu | Diễn tập restore, kiểm thử tải, checklist go-live | 5 ngày |

Mốc:
- **M1 (hết S1):** không còn lỗi nghiêm trọng. Có thể cho khách dùng thử nội bộ.
- **M2 (hết S3):** vận hành được trên VPS, có giám sát và backup ngoài máy.
- **M3 (hết S5):** go-live thương mại.

## 2. Sprint 1 – Vá bảo mật khẩn (4 ngày)

### 2.1 Áp dụng RBAC cho toàn bộ route nghiệp vụ

Ma trận quyền đã có trong `src/lib/rbac.js` nhưng phần lớn route chưa gọi `requirePerm`. Bảng dưới liệt kê đích đến của từng route.

**`src/routes/inventory.js` (0/23 route có guard)**

| Route | Quyền |
|---|---|
| GET /suppliers, /suppliers/payables, /suppliers/:id/payments | `supplier.view` |
| POST /suppliers, PUT /suppliers/:id, DELETE /suppliers/:id | `supplier.edit` |
| POST /suppliers/:id/payments, DELETE /supplier-payments/:id | `supplier.edit` |
| GET /purchases, /purchases/:id | `purchase.create` hoặc `stock.view` |
| POST /purchases, PUT /purchases/:id, DELETE /purchases/:id | `purchase.create` |
| POST /purchases/:id/receive, /purchases/:id/cancel | `purchase.receive` |
| GET /stock-checks, /stock-checks/:id | `stock.view` |
| POST /stock-checks, PUT /stock-checks/:id, DELETE /stock-checks/:id, POST /stock-checks/:id/complete | `stockcheck.do` |
| GET /stock/moves, /stock/summary | `stock.view` |

**`src/routes/backup.js` (0/5)**: toàn bộ router dùng `router.use(requirePerm('backup.restore'))`.

**`src/routes/reports.js` (2/8)**

| Route | Quyền |
|---|---|
| GET /reports/summary, /products, /inventory, /slow-moving, /vat | `report.view` |
| GET /reports/analytics | đã có `report.view` (reports.js:194), giữ nguyên |
| GET /reports/purchases | `report.supplier` |
| GET /reports/export | `report.export` |
| Trường `profit`, `cost_price` trong mọi báo cáo | đã có `can(req,'report.profit')` ở reports.js:89 cho summary, cần áp dụng cho các báo cáo còn lại |

Hiện trạng reports.js: 1 route có `requirePerm`, 1 chỗ kiểm `can()` trong thân hàm, 6 route còn lại mở hoàn toàn.

**`src/routes/sales.js` (3/11)**

| Route | Quyền |
|---|---|
| POST /checkout/preview, GET/POST/DELETE /held-orders | `pos.sell` |
| GET /invoices, /invoices/:id, /invoices/:id/returnable | `invoice.view` |
| POST /invoices/:id/confirm | `pos.sell` + kiểm trạng thái phải là `pending` |
| POST /invoices (type=return) | thêm `pos.return` |

**`src/routes/catalog.js` (17/26)**

| Route | Quyền |
|---|---|
| GET /categories, /products, /products/:id, /products/barcode/:code, /products/:id/units | `product.view` |
| GET /products/:id/moves | `stock.view` |
| GET /barcodes/next, /barcode-lookup/:code | `product.create` |
| GET /price-lists, /price-lists/:id/items | `product.view` |
| POST/PUT/DELETE /price-lists, PUT /price-lists/:id/items | `product.edit` |
| Trường `cost_price` trong GET /products | chỉ trả khi có `product.view_cost` |

**`src/routes/admin.js`**

| Route | Quyền |
|---|---|
| GET /settings | mọi user đăng nhập, nhưng lọc key nhạy cảm (xem 2.2) |
| GET /info, /info/qr, /qr | `settings.edit` |
| GET /promotions | `pos.sell` |

Cách làm gọn: tạo helper `guard(perm)` trong `src/middleware.js` và dùng `router.use(path, guard)` theo nhóm để tránh lặp.

### 2.2 Lọc bí mật khỏi GET /api/settings

- Tạo danh sách `SECRET_KEYS = ['vqr_username','vqr_password','vqr_exposed_password','vqr_secret_key']` trong `src/routes/admin.js`.
- `GET /settings`: nếu không có `settings.edit`, xóa các key trên khỏi kết quả.
- Có `settings.edit`: trả `vqr_password` dưới dạng `'••••'` và cờ `has_credentials`. Frontend chỉ gửi mật khẩu mới khi người dùng nhập lại.
- Frontend `public/js/views/settings.js`: sửa form để không hiển thị mật khẩu cũ.

### 2.3 Loại bỏ lớp lỗi `fail()` không dừng handler

`fail()` chỉ ghi response, không ném lỗi. Gọi mà không `return` thì handler chạy tiếp và gửi response lần hai. Có 9 chỗ:

| Vị trí | Hậu quả |
|---|---|
| `src/routes/admin.js:54` | Nặng nhất: chưa cấu hình ngân hàng vẫn chạy `buildVietQR` + `ok()`, ném `Cannot set headers after they are sent` |
| `src/routes/catalog.js:276,278` | Tra cứu barcode vẫn gọi Internet dù đã tắt, gửi 2 response |
| `src/routes/vietqr.js:160,208,211` | Tạo QR khi chưa bật, mô phỏng dev sai môi trường, vẫn chạy tiếp và gọi VietQR thật |
| `src/routes/catalog.js:107,296`, `src/routes/vietqr.js:172,219` | Câu cuối trong hàm hoặc trong `catch`, hiện vô hại, sửa cho nhất quán |

Cách sửa gốc, không dựa vào `grep`:
- Trong route handler chỉ dùng `bad(msg, code)` (ném `ApiError`). Error handler ở `server.js` đã xử lý.
- Thay toàn bộ `fail(res, ...)` trong `src/routes/*.js` bằng `bad(...)` hoặc `return fail(...)` với `return` bắt buộc.
- Giữ `fail()` chỉ cho `server.js` (404 và error handler).
- CI: bước kiểm tra `grep -rn 'fail(' src/routes` phải trả về rỗng. Đây là kiểm tra cấu trúc (không còn hàm đó trong thư mục), không phải kiểm tra khoảng trắng nên tin cậy được.

### 2.4 Bắt buộc secret trong production

Trong `server.js`, trước khi `listen`:
```
if (process.env.NODE_ENV === 'production') {
  for (const k of ['VQR_SECRET', 'ROOT_PASS', 'ADMIN_PASS', 'VQR_EXPOSED_PASS']) {
    if (!process.env[k]) { console.error('Thiếu biến môi trường ' + k); process.exit(1); }
  }
}
```
- Bỏ giá trị mặc định cho `VQR_SECRET` và `VQR_EXPOSED_PASS` trong `src/routes/vietqr.js`. Ở môi trường dev, sinh ngẫu nhiên khi khởi động và in ra console.
- `deploy/oneclick.sh`: tự sinh `VQR_SECRET` bằng `openssl rand -hex 32` khi tạo `.env`.
- Sau khi seed `root`/`admin` với mật khẩu mặc định: bắt đổi mật khẩu ở lần đăng nhập đầu (cột `must_change_password` trong `users`).

### 2.5 Chống CSRF

Session bằng cookie `SameSite=Lax`, không có token CSRF, không kiểm `Origin`. Lax chặn POST từ site khác trên trình duyệt hiện đại, nhưng không chặn khi người dùng bấm link dẫn tới GET có tác dụng phụ, và không bảo vệ trình duyệt cũ. Sửa rẻ:
- Middleware trước `/api`: với method khác GET/HEAD/OPTIONS, yêu cầu header `Sec-Fetch-Site` là `same-origin`/`none`, hoặc `Origin` khớp `Host`. Sai thì 403.
- Bỏ qua kiểm tra này cho `/vqr/*` (webhook máy gọi máy, không dùng cookie).
- Rà route GET có tác dụng phụ: hiện không có, giữ nguyên quy ước GET chỉ đọc.
- Thêm `SameSite=Strict` cho cookie nếu UI không cần mở từ link ngoài (POS chạy nội bộ, nên được).

### 2.6 Test phân quyền và cách ly tenant

Tạo `test/rbac.test.js`:
- Tạo tenant test, tạo một user cho mỗi role: owner, manager, cashier, sales, warehouse, accountant, viewer.
- Bảng dữ liệu: ~25 route nhạy cảm x 7 role, mong đợi 200 hoặc 403.
- Bổ sung vào `test/run.sh`.

Kiểm tra thêm:
- Cashier gọi `GET /api/settings` không thấy `vqr_password`.
- Viewer gọi `GET /api/backups/x/download` nhận 403.
- Cashier gọi `POST /invoices/:id/confirm` trên hóa đơn `cancelled` nhận 400.
- POST không có `Origin`/`Sec-Fetch-Site` hợp lệ nhận 403.

Test cách ly tenant (`test/tenant.test.js`), quan trọng nhất với mô hình SQLite-per-tenant:
- Root tạo tenant A và B, mỗi tenant một owner.
- Owner A tạo sản phẩm, hóa đơn, nhà cung cấp, backup.
- Owner B: `GET /products/:idA`, `GET /invoices/:idA`, `GET /backups/<tênA>/download`, `POST /invoices/:idA/cancel` đều phải 404 hoặc 403, không bao giờ 200.
- Webhook giả lập với `bank_account` của A không được đổi trạng thái hóa đơn của B.
- User A bị đổi `tenant_id` trực tiếp trong control.db giữa phiên: request kế tiếp phải vào DB mới, không dính cache.

**Nghiệm thu S1:** `test/rbac.test.js` và `test/tenant.test.js` xanh, `grep 'fail(' src/routes` rỗng, khởi động production thiếu secret sẽ dừng, POST thiếu Origin bị 403.

## 3. Sprint 2 – Phiên, mã chứng từ, dữ liệu vào (5 ngày)

### 3.1 Quản lý phiên đăng nhập
- Job trong `server.js`: mỗi giờ chạy `DELETE FROM sessions WHERE expires_at < now`.
- Đổi mật khẩu (`/auth/change-password`) và admin sửa/khóa user (`PUT /users/:id`): xóa mọi session của user đó trừ session hiện tại.
- Thêm `PUT /users/:id/sessions/revoke` cho owner.
- Kiểm tra hết hạn gói (`tenantExpired`) trong `requireAuth`, không chỉ lúc login. Câu SELECT trong `attachSession` (`src/middleware.js:17`) hiện chưa lấy `t.expires_at`, phải thêm cột này và `t.plan` vào query rồi gắn vào `req.tenant`. Không cần query thêm.
- Rate-limit login: chuyển `Map` sang bảng `login_attempts` trong control.db để sống qua restart. Dọn dẹp cùng job trên.

### 3.2 Mã chứng từ và mã đối soát bằng sequence atomic
- `nextPaymentRef` hiện tại (`src/lib/codes.js:16-22`) làm SELECT rồi INSERT rời nhau, không có transaction. Trong `sales.js:118` nó nằm trong BEGIN của hóa đơn nên tạm an toàn, nhưng ở `vietqr.js:165` gọi trần. Không nhân bản cách này.
- Viết một hàm `nextSeq(db, key)` dùng một câu lệnh duy nhất:
  `INSERT INTO settings(key,value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING value`
  SQLite hỗ trợ RETURNING từ 3.35, Node 22 `node:sqlite` đủ mới. Một câu lệnh nên atomic kể cả ngoài transaction.
- `nextPaymentRef` và `makeCode` đều gọi `nextSeq`. `makeCode` dùng khóa `seq_<prefix>_<yyyymmdd>`.
- Migration một lần: với mỗi prefix, khởi tạo sequence hôm nay bằng số thứ tự lớn nhất đang có (`MAX(substr(code, -4))`) để không trùng.
- Tách bảng: chuyển các khóa `seq_*`, `payment_ref_seq`, `internal_barcode_seq` sang bảng `sequences(key, value)` riêng, tránh lẫn với cài đặt người dùng và tránh bị `PUT /settings` ghi đè.
- Test: tạo hóa đơn, hủy, tạo tiếp ra số mới; 50 request `POST /invoices` song song không trùng `code` và `payment_ref`.

### 3.3 Validate đầu vào
- `src/routes/inventory.js:83`: `cost_price` phải `>= 0`, `qty > 0`.
- `src/routes/reports.js`: hàm `dateRange(req.query)` dùng chung, kiểm tra định dạng `YYYY-MM-DD`, `from <= to`, tối đa 366 ngày. Trả 400 nếu sai.
- `src/routes/reports.js:136` (`toCsv`): tiền tố ký tự `'` cho ô bắt đầu bằng `= + - @`.
- `src/lib/vietqr.js`: kiểm tra độ dài `bankBin`, `accountNo` tối đa 99 ký tự, chỉ chữ số.
- `src/routes/admin.js` PUT /settings: whitelist key được phép ghi theo danh sách `defaults` trong `src/db.js`, từ chối key lạ.

### 3.4 Mã hóa bí mật VietQR khi lưu

`PUT /settings` (`admin.js:21`) ghi thẳng `vqr_password`, `vqr_secret_key`, `vqr_exposed_password` dạng plaintext vào `pos.db` của tenant. Ai có file DB (backup, download, lỗi RBAC) đọc được hết. Mục 2.2 chỉ che khi đọc qua API.
- Thêm `ENCRYPTION_KEY` (32 byte hex) vào biến môi trường bắt buộc ở production.
- `src/lib/secrets.js`: `encrypt(text)` trả `enc:v1:<iv>:<tag>:<cipher>` bằng AES-256-GCM; `decrypt()` nhận cả giá trị plaintext cũ để tương thích.
- `PUT /settings`: với key trong `SECRET_KEYS`, mã hóa trước khi ghi. `vqr_exposed_password` chỉ dùng để so sánh nên lưu scrypt hash thay vì mã hóa.
- Chỉ `src/payments/vietqr.js` và webhook `token_generate` được gọi `decrypt()`/`verifyPassword()`.
- Migration khi khởi động: quét mọi tenant, giá trị chưa có tiền tố `enc:` thì mã hóa lại.
- Mất `ENCRYPTION_KEY` là mất credential VietQR, phải nhập lại. Ghi rõ trong `deploy/README.md` và đưa key vào quy trình backup (lưu riêng, không cùng chỗ với file backup).

### 3.5 Rà soát XSS phía giao diện

Dữ liệu người dùng (tên sản phẩm, khách hàng, ghi chú) hiển thị cho user khác cùng tenant. Kiểm tra nhanh cho thấy các chỗ `innerHTML` đều đi qua `esc()`, 4 chỗ chưa escape chỉ nằm trong `confirm()` nên không thực thi HTML. Vẫn cần:
- Rà thủ công toàn bộ 60+ chỗ `innerHTML` trong `public/js`, ghi vào checklist.
- Test UI: tạo sản phẩm tên `<img src=x onerror=window.__xss=1>`, mở POS, danh sách, báo cáo, hóa đơn in, kiểm tra `window.__xss` không được đặt.
- Script CI: cảnh báo dòng có `innerHTML` và `${` nhưng không có `esc(`.

### 3.6 Chuẩn hóa lỗi trả về
- `server.js` error handler: với mã >= 500 trả `'Lỗi máy chủ'` chung, ghi `err` đầy đủ ra log kèm `req.id`.
- Thêm `req.id` (UUID) ở đầu chuỗi middleware, đưa vào header `X-Request-Id` và log.

### 3.7 Toàn vẹn dữ liệu nhỏ
- `src/routes/catalog.js` `saveUnits`: xóa `price_list_items` mồ côi khi xóa đơn vị (đã có FK CASCADE, chỉ cần kiểm tra `foreign_keys = ON` thực sự hoạt động trên kết nối tenant, viết test).
- `DELETE /suppliers/:id`: từ chối nếu còn phiếu nhập tham chiếu, hoặc chuyển sang `active = 0`.
- `applyStock` trong `sales.js:96`: lưu giá trị đã `round` vào `products.stock` cho khớp `stock_after`.

**Nghiệm thu S2:** test API xanh, 50 hóa đơn song song không trùng mã, cashier hết hạn gói bị 403 giữa phiên, `pos.db` không còn chuỗi `vqr_password` plaintext, test XSS xanh.

## 4. Sprint 3 – Vận hành production (7 ngày)

### 4.1 Logging và giám sát
- Thêm `pino` (1 dependency). Log JSON ra stdout: `req.id`, tenant, user, method, path, status, thời gian.
- Không log body, không log cookie, không log mật khẩu VietQR.
- `GET /api/health` mở rộng: kiểm tra `control.db` đọc được, dung lượng đĩa `DATA_DIR` còn trên 10%, số tenant đang mở. Trả 503 nếu lỗi.
- Docker `HEALTHCHECK` gọi `/api/health`.
- Caddy/nginx: bật access log, xoay vòng theo ngày.

### 4.2 Backup offsite có mã hóa
- Backup `control.db` hiện chưa có trong `autoBackup`. Thêm `VACUUM INTO` cho control.db vào `DATA_DIR/backups/control-<stamp>.db`.
- File backup chứa dữ liệu khách và (sau S2) credential đã mã hóa nhưng vẫn là toàn bộ sổ sách của cửa hàng. Không đẩy plaintext lên S3.
- Dùng rclone với remote kiểu `crypt` bọc ngoài remote S3/B2/Drive: mã hóa tên file và nội dung phía client, key nằm trong `rclone.conf` trên VPS. Không cần sửa code mã hóa, chỉ cấu hình.
- Container: tách backup thành sidecar `rclone` chạy cron 1 lần/ngày, `rclone sync /data/backups crypt:pos-backups`, không cài rclone vào image app.
- Giữ 6 giờ/lần cục bộ, đẩy offsite 1 lần/ngày, remote giữ 30 ngày.
- Lưu `rclone.conf` (chứa key crypt) và `ENCRYPTION_KEY` ở nơi thứ hai ngoài VPS (password manager của chủ dự án). Mất hai thứ này thì backup vô dụng.
- Tài liệu `deploy/BACKUP.md`: cấu hình rclone crypt, cách lấy file về, cách restore.

### 4.3 Sửa harness kiểm thử

Nguyên nhân thật của lần chạy đỏ (`fetch failed`, `ECONNRESET`/`ECONNREFUSED`): vòng chờ trong `test/run.sh` chỉ thử tối đa 30 lần x 0,2 giây rồi chạy test dù server chưa lên. `curl` trả exit 0 với HTTP 401 nên `/api/settings` không phải vấn đề. Tái hiện được khi server khởi động chậm hơn 6 giây. Ngoài ra `>/dev/null 2>&1` che mất log server nên không thấy lý do.
- Vòng chờ: tối đa 30 giây, nếu hết mà server chưa lên thì in log server và thoát mã 1, không chạy test.
- Chờ `/api/health` trả 200 (không cần đăng nhập, rõ nghĩa hơn).
- Ghi log server ra `$TMP/server.log`, in ra khi test đỏ.
- `trap 'kill $PID; rm -rf $TMP' EXIT` để luôn dọn kể cả khi test crash.
- `NO_BACKUP=1` khi chạy test để không chạy `autoBackup` trên DB tạm.
- Thêm `npm run test:api`, `test:ui`, `test:rbac`, `test:tenant` riêng.

### 4.4 CI
- GitHub Actions `.github/workflows/test.yml`: Node 22, `npm ci`, `npx playwright install chromium`, `npm test`. Chạy trên push và pull request.
- Job thứ hai: `docker build` để chắc Dockerfile không hỏng.

### 4.5 Bảo mật HTTP
- Thêm `helmet` với CSP: `default-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`. Kiểm tra lại các ảnh sản phẩm từ Open Food Facts (nếu hiển thị trực tiếp thì thêm domain vào `img-src`).
- Giới hạn `express.json` xuống `1mb` cho route thường, `8mb` chỉ cho route upload ảnh.
- Rate-limit chung cho `/vqr/*` (webhook công khai) 60 request/phút/IP.

**Nghiệm thu S3:** CI xanh trên GitHub, `docker compose up` trên VPS có healthcheck `healthy`, backup xuất hiện trên remote crypt sau 1 ngày và tải về giải mã được.

## 5. Sprint 4 – Hiệu năng và mở rộng (5 ngày)

### 5.1 Ánh xạ tenant cho webhook
- Thêm bảng `tenant_lookups(kind, value, tenant_code)` trong control.db với UNIQUE `(kind, value)`. `kind` gồm `bank_account` và `exposed_user`.
- Khi PUT /settings ghi `bank_account` hoặc `vqr_exposed_username`, đồng bộ vào bảng này (kèm hash mật khẩu exposed thay vì lưu plaintext).
- `src/routes/vietqr.js`: `resolveTenantByBank` và `findExposedTenant` tra bảng này, bỏ vòng lặp quét mọi tenant.
- Migration một lần: duyệt tất cả tenant hiện có, điền bảng.

### 5.2 Quản lý kết nối SQLite
- `src/db.js` cache mở mãi mọi tenant từng được chạm. Thêm LRU: tối đa `MAX_OPEN_TENANTS` (mặc định 200), đóng kết nối không dùng quá 30 phút.
- `autoBackup` hiện mở mọi tenant mỗi 6 giờ. Chỉ backup tenant có thay đổi (so `PRAGMA data_version` hoặc mtime file) để tiết kiệm I/O.
- Bật `PRAGMA busy_timeout = 5000` và `synchronous = NORMAL` cho từng kết nối.

### 5.3 Frontend
- Xử lý 403 tập trung trong `public/js/api.js` để hiện thông báo thân thiện (rà XSS đã chuyển lên S2, mục 3.5).
- Đồng bộ `can()` phía UI với ma trận quyền mới ở S1: ẩn nút/menu mà server sẽ từ chối.

### 5.4 Tài liệu
- Cập nhật `docs/DESIGN.md`: mục 2, 3, 13 mô tả đúng hiện trạng (SQLite-per-tenant, AsyncLocalStorage, Caddy). Giữ mục Postgres thành "Hướng mở rộng khi vượt 500 tenant".
- `docs/ROADMAP.md`: đánh dấu P1–P8 xong, P9 thay bằng kế hoạch này. Ghi rõ P5 (hóa đơn điện tử) chưa làm.
- `README.md`: thêm mục "Biến môi trường bắt buộc" và "Phân quyền theo vai trò".

**Nghiệm thu S4:** webhook với 100 tenant giả lập phản hồi dưới 50 ms; RSS của process ổn định sau 1 giờ chạy tải; CI có bước kiểm tra `innerHTML`.

## 6. Sprint 5 – Dự phòng và nghiệm thu (5 ngày)

### 6.1 Diễn tập restore
- Kịch bản 1: mất một tenant, restore từ backup cục bộ qua UI, restart container, xác nhận dữ liệu.
- Kịch bản 2: mất toàn bộ VPS, dựng VPS mới bằng `deploy/oneclick.sh`, khôi phục `rclone.conf` và `ENCRYPTION_KEY` từ nơi lưu thứ hai, kéo backup từ remote crypt, restore control.db và từng tenant. Ghi thời gian hoàn thành. Mục tiêu lần đầu dưới 2 giờ, sau khi viết runbook dưới 45 phút.
- Viết kết quả vào `deploy/BACKUP.md`.

### 6.2 Kiểm thử tải
- Script `test/load.js` dùng `autocannon`: 20 tenant, mỗi tenant 5 thu ngân, mỗi thu ngân 1 hóa đơn/3 giây trong 10 phút.
- Mục tiêu: p95 dưới 200 ms cho `POST /invoices`, không lỗi `SQLITE_BUSY`.
- Nếu có `SQLITE_BUSY`: xem lại `busy_timeout` và độ dài transaction.

### 6.3 Checklist go-live
- [ ] `.env` production có đủ `VQR_SECRET`, `VQR_EXPOSED_PASS`, `ROOT_PASS`, `ADMIN_PASS`, `ENCRYPTION_KEY`, không dùng giá trị mặc định.
- [ ] `ENCRYPTION_KEY` và `rclone.conf` đã lưu ở nơi thứ hai ngoài VPS.
- [ ] Đổi mật khẩu `root` và `admin`.
- [ ] HTTPS hoạt động, cookie có cờ `Secure`.
- [ ] Backup offsite đã có ít nhất 1 bản và đã restore thử.
- [ ] Healthcheck xanh, log xoay vòng.
- [ ] Test RBAC, API, UI xanh trên CI ở commit deploy.
- [ ] Đăng ký thông tin webhook với VietQR bằng domain thật, chạy `POST /vietqr/test` trên từng shop.
- [ ] Tài liệu vận hành có người thứ hai đọc và làm theo được.

## 7. Việc ngoài phạm vi kế hoạch này

- Hóa đơn điện tử (P5 trong ROADMAP): phụ thuộc hợp đồng nhà cung cấp, chưa có mã.
- Đăng ký self-serve và thanh toán phí gói (P8 một phần).
- Chuyển sang PostgreSQL: chỉ cân nhắc khi vượt 500 tenant hoặc cần nhiều instance app.
- 2FA cho tài khoản nền tảng: nên làm nhưng sau go-live.

## 8. Rủi ro của kế hoạch

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Thêm RBAC làm gãy luồng UI hiện có | Người dùng bị 403 bất ngờ | Test UI theo từng role trước khi merge, rà `can()` ở frontend |
| Đổi cách sinh mã chứng từ trùng số cũ | Lỗi UNIQUE khi tạo hóa đơn | Migration khởi tạo sequence từ số lớn nhất; test trên bản sao DB thật |
| Đóng kết nối SQLite theo LRU giữa lúc backup | File backup hỏng | Khóa tenant trong lúc `VACUUM INTO` |
| Playwright trên CI chậm/không ổn định | CI đỏ giả | Retry 1 lần, cache trình duyệt |
| Trượt tiến độ S3/S5 (CI, offsite, diễn tập DR, kiểm thử tải thường phát sinh việc) | Go-live chậm 1–2 tuần | Đã nới S3 lên 7 ngày, S5 lên 5 ngày; nếu vẫn trượt, cắt kiểm thử tải xuống 5 tenant và dời LRU kết nối (5.2) sang sau go-live |
| Mất `ENCRYPTION_KEY` | Mất credential VietQR mọi shop, phải nhập lại | Lưu key ở 2 nơi, kiểm tra trong checklist go-live |
| Mã hóa at-rest làm gãy luồng VietQR đang chạy | Không tạo được QR | Migration đọc được cả plaintext cũ, test `POST /vietqr/test` sau migrate |

## 9. Thay đổi so với bản 1

Sau phản biện đối chiếu code:
- Mở rộng danh sách `fail()` thiếu `return` từ 3 lên 9 chỗ, thêm `admin.js:54`; đổi cách sửa từ `grep` sang loại bỏ `fail()` khỏi route.
- Sửa bảng RBAC reports.js: `/reports/analytics` đã có guard; nêu đúng hiện trạng 1 `requirePerm` + 1 `can()`.
- Thêm chống CSRF (2.5), test cách ly tenant (2.6), mã hóa secret at-rest (3.4), rà XSS chuyển lên S2 (3.5), backup offsite mã hóa (4.2).
- `nextPaymentRef` xác định là không atomic; thay bằng một câu lệnh `UPSERT ... RETURNING`.
- Sửa lý do harness test đỏ: vòng chờ 6 giây không kiểm tra kết quả, không phải do HTTP 401.
- Ghi rõ `attachSession` phải SELECT thêm `expires_at`.
- Thời lượng tổng từ 4 tuần lên 5–6 tuần, thêm rủi ro trượt tiến độ.
