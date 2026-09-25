# Kế hoạch triển khai – POS Shop (SaaS đa cửa hàng)

> Tài liệu này mô tả lộ trình đưa phần mềm POS Shop từ bản đơn tenant (SQLite, chạy LAN)
> thành sản phẩm **SaaS tập trung: một link chung, nhiều cửa hàng (tenant), mỗi shop một tài khoản**.
> Tài liệu thiết kế kỹ thuật chi tiết xem tại [`DESIGN.md`](./DESIGN.md).

> **Trạng thái đã triển khai:** nền tảng **đa cửa hàng + đăng nhập một link + phân quyền** (P1/P2) đã có bản chạy —
> mỗi cửa hàng một database riêng, RBAC, ẩn giá vốn/lợi nhuận theo vai trò, nhật ký thao tác.
> Giai đoạn đầu dùng SQLite **database-per-tenant** để chạy được ngay; sẽ chuyển **PostgreSQL** khi quy mô lớn (xem DESIGN).

---

## 1. Mục tiêu & phạm vi

**Mục tiêu**
- Cấp phần mềm cho **nhiều cửa hàng** dùng **chung một link truy cập**, mỗi shop một tài khoản riêng, dữ liệu tách biệt.
- Giữ và hoàn thiện nghiệp vụ **bán hàng & kho** đã có.
- Bổ sung: **phân quyền**, **hóa đơn điện tử**, **VAT**, **nhà cung cấp + mua hàng**, **thống kê theo phân quyền**.
- Có mô hình **thu phí/gói dịch vụ** và **quản trị nền tảng** (nhà phát hành).

**Ngoài phạm vi giai đoạn đầu**
- App di động native (dùng web responsive/PWA).
- Sản xuất/BOM, ERP đầy đủ, CRM nâng cao.
- Đồng bộ offline hai chiều phức tạp (xem mục 7 – quyết định offline).

---

## 2. Quyết định đã chốt

| # | Hạng mục | Quyết định |
|---|---|---|
| D1 | Mô hình triển khai | **SaaS tập trung, một link chung, nhiều tenant** (thay cho on-prem từng shop) |
| D2 | Cách ly dữ liệu | Mỗi shop một tài khoản; `tenant_id` trên mọi bảng + PostgreSQL Row-Level Security |
| D3 | Nhà cung cấp = ? | "Nhà" = **cửa hàng**; thống kê theo từng sản phẩm và từng cửa hàng |
| D4 | Hóa đơn điện tử | Bắt buộc dùng **nhà cung cấp được cấp phép** + **chữ ký số**; loại **HĐĐT khởi tạo từ máy tính tiền** |
| D5 | VAT | Cấu hình **0 / 5 / 8 / 10%**, có **hiệu lực theo thời gian**; hỗ trợ giá **gồm hoặc chưa gồm VAT** |
| D6 | Thanh toán | Tích hợp **VietQR API động + callback** tự động xác nhận thanh toán |
| D7 | Phân quyền | **2 tầng**: nền tảng (nhà phát hành) và cửa hàng (RBAC chi tiết) |
| D8 | Hạ tầng | VPS + PostgreSQL + Docker + Nginx/SSL |

> Các quyết định còn mở xem mục 8.

---

## 3. Hiện trạng (điểm xuất phát)

- Backend Node.js + Express 5 + SQLite (`node:sqlite`), frontend vanilla ES modules, không cần build.
- Nghiệp vụ đã có: bán hàng (đơn vị quy đổi, bảng giá, khuyến mãi, thanh toán hỗn hợp, đơn treo, đổi trả), kho (nhập hàng, nhà cung cấp cơ bản, kiểm kho, sổ kho), hóa đơn, báo cáo, sinh mã vạch nội bộ + in tem, VietQR **tĩnh** (QR tự sinh + xác nhận tay), **sao lưu tự động/phục hồi**.
- Chưa có: đăng nhập/phân quyền, đa tenant, VAT, hóa đơn điện tử, VietQR động/callback.
- Kiểm thử: 94 test API + 63 test UI (Playwright), chạy trên DB tạm.

---

## 4. Kiến trúc đích (tóm tắt)

```
1 domain duy nhất
├── /login    → shop/user đăng nhập; hệ thống nhận diện tenant
├── /app      → giao diện bán hàng (ẩn/hiện theo quyền)
├── /admin    → quản trị nền tảng (nhà phát hành)
└── /vqr      → webhook VietQR mở ra cho đối tác gọi vào
1 server (VPS) + PostgreSQL + nhiều tenant dùng chung
```

Chi tiết xem [`DESIGN.md`](./DESIGN.md).

---

## 5. Lộ trình theo giai đoạn

| Phase | Tên | Nội dung chính | Thời lượng | Phụ thuộc |
|---|---|---|---|---|
| **P0** | Chốt & chuẩn bị | Chốt mô hình merchant VietQR, chọn NCC HĐĐT, hosting, mô hình thu phí; kế toán xác nhận VAT/mẫu hóa đơn | 1 tuần | Bên ngoài |
| **P1** | Nền tảng multi-tenant | PostgreSQL, `tenant_id`, RLS, auth 2 tầng, super-admin, login một link, migration từ SQLite | 3–4 tuần | P0 |
| **P2** | Phân quyền & audit | RBAC chi tiết, vai trò mặc định, ẩn giá vốn/lợi nhuận ở server, nhật ký thao tác, PIN thu ngân | 2 tuần | P1 |
| **P3** | Nhà cung cấp & mua hàng | Hồ sơ NCC, bảng giá nhập, lịch sử giá, công nợ NCC, trả hàng NCC | 2 tuần | P1 |
| **P4** | VAT | `vat_rate` theo sản phẩm, giá gồm/chưa gồm, `invoice_tax_lines`, báo cáo mua vào/bán ra | 1–2 tuần | P1, kế toán |
| **P5** | Hóa đơn điện tử | Adapter đa NCC, phát hành/điều chỉnh/thay thế/hủy, lưu XML/PDF, gửi khách, retry/đối soát | 3–5 tuần | P0, P4 |
| **P6** | VietQR động & callback | Client token/QR, webhook token_generate + transaction-sync, tự xác nhận thanh toán, chống trùng | 1–2 tuần | P1 (song song P3–P5) |
| **P7** | Thống kê thông minh | Dashboard theo vai trò, ABC/Pareto, hàng chết, dự báo, bất thường, theo NCC; thống kê nền tảng | 2–3 tuần | P2, P3 |
| **P8** | Thu phí & onboarding | Gói/giới hạn, đăng ký self-serve, thanh toán phí, landing, kích hoạt | 2–3 tuần | P1 |
| **P9** | Production & hardening | Docker, SSL, backup `pg_dump`, monitoring, rate limit, 2FA admin, tải | 2 tuần | P1–P8 |

**Mốc quan trọng**
- **M1 – Nội bộ dùng được:** hết P1+P2+P3 (multi-tenant + phân quyền + kho/NCC).
- **M2 – Hợp pháp để bán:** hết P4+P5+P6 (VAT + HĐĐT + thanh toán tự động).
- **M3 – Thương mại hoá:** hết P7+P8 (thống kê + thu phí/onboarding).
- **M4 – Go-live production:** hết P9.

**Ước lượng tổng:** ~16–22 tuần (1–2 dev toàn thời gian), chưa kể thời gian chờ hợp đồng nhà cung cấp HĐĐT và nghiệm thu GoLive.

---

## 6. Chi tiết từng giai đoạn

### P0 – Chốt & chuẩn bị
- **Việc:** chốt mô hình merchant VietQR (mỗi shop / master merchant), chọn NCC HĐĐT, chọn ngân hàng (MB/BIDV), chọn VPS/domain, mô hình thu phí; kế toán xác nhận thuế suất, mẫu/ký hiệu hóa đơn, nghĩa vụ hộ kinh doanh.
- **Đầu ra:** biên bản quyết định; thông tin khai báo merchant gửi VietQR; hợp đồng NCC HĐĐT khởi động.
- **Nghiệm thu:** các mục ở bảng D1–D8 + mục 8 được trả lời.

### P1 – Nền tảng multi-tenant
- **Việc:** chuyển DB sang PostgreSQL; thêm `tenant_id` + RLS; tách `settings` theo tenant; đăng nhập (email/username + mật khẩu) với tenant resolution; tài khoản super-admin; migration/seed; lớp repository tự chèn `tenant_id`.
- **Đầu ra:** một link duy nhất, nhiều tenant đăng nhập, dữ liệu không rò rỉ.
- **Nghiệm thu:** test cách ly dữ liệu (tenant A không thấy dữ liệu tenant B ở mọi API); login/logout; super-admin quản lý tenant.

### P2 – Phân quyền & audit
- **Việc:** vai trò & quyền (mục D7, chi tiết ở DESIGN); ẩn giá vốn/lợi nhuận ở server; audit log; PIN nhanh; tự khóa màn hình.
- **Nghiệm thu:** thu ngân không đọc được field giá vốn/lợi nhuận qua API; mọi thao tác nhạy cảm có log.

### P3 – Nhà cung cấp & mua hàng
- **Việc:** mở rộng `suppliers` (MST, liên hệ, điều khoản), bảng giá nhập, lịch sử giá, công nợ NCC + phiếu chi, trả hàng NCC.
- **Nghiệm thu:** nhập hàng cập nhật giá vốn; công nợ NCC = mua − trả; báo cáo theo NCC.

### P4 – VAT
- **Việc:** `products.vat_rate` (0/5/8/10) có hiệu lực theo thời gian; chế độ giá gồm/chưa gồm VAT; `invoice_tax_lines`; in hóa đơn có dòng thuế; báo cáo VAT.
- **Nghiệm thu:** một hóa đơn nhiều thuế suất tách đúng; làm tròn theo quy tắc kế toán chốt; 8% tự về 10% sau 31/12/2026.

### P5 – Hóa đơn điện tử
- **Việc:** adapter đa NCC (`issue/adjust/replace/cancel/getStatus`); cấu hình theo tenant (MST, tài khoản, mẫu/ký hiệu, ký số); lưu XML/PDF; gửi email; hàng đợi + retry; đối soát; xử lý đổi trả = hóa đơn điều chỉnh giảm.
- **Nghiệm thu:** phát hành trên sandbox NCC đạt; in/tải XML/PDF; điều chỉnh/hủy đúng nghiệp vụ.

### P6 – VietQR động & callback
- **Việc:** client gọi `token_generate` (cache 300s) + `generate-customer`; mở webhook `token_generate` + `transaction-sync`; ánh xạ `orderId`→hóa đơn; chống trùng theo `transactionid`; lệch tiền thì cảnh báo.
- **Nghiệm thu:** dùng `test/transaction-callback` để mô phỏng → hóa đơn tự chuyển "đã thanh toán"; callback trùng không ghi 2 lần.

### P7 – Thống kê thông minh
- **Việc:** dashboard theo vai trò; ABC/Pareto; hàng chết/sell-through; gợi ý điểm đặt hàng lại; dự báo nhu cầu; phát hiện bất thường (giảm giá/hủy/chênh kiểm kho); phân tích giỏ hàng; hiệu suất NCC; thống kê tổng hợp cho nền tảng.
- **Nghiệm thu:** số liệu khớp sổ; ẩn chỉ số nhạy cảm theo quyền.

### P8 – Thu phí & onboarding
- **Việc:** gói & giới hạn (user, hóa đơn/tháng, tính năng); đăng ký self-serve; thanh toán phí (VNPay/MoMo/chuyển khoản); gia hạn/suspend; landing.
- **Nghiệm thu:** tạo tenant mới → dùng thử → nâng gói → hết hạn bị giới hạn đúng.

### P9 – Production & hardening
- **Việc:** Docker Compose, Nginx + SSL, `pg_dump` theo lịch + offsite, monitoring/log/error tracking, rate limiting, 2FA admin, kiểm thử tải.
- **Nghiệm thu:** backup/restore diễn tập thành công; không rò rỉ tenant; chịu tải mục tiêu.

---

## 7. Quyết định offline

SaaS một link ⇒ **cần internet**. Lựa chọn:
- **A. Online thuần (khuyến nghị giai đoạn đầu):** đơn giản, đúng mô hình.
- **B. PWA + hàng đợi offline:** bán tạm khi mất mạng, đồng bộ sau (phức tạp, rủi ro lệch kho/công nợ).
- **C. Agent tại shop + đồng bộ:** nặng, gần on-prem.

→ Mặc định **A**, thiết kế mở để nâng **B** sau nếu cần.

---

## 8. Việc cần chốt (open decisions)

1. **Mô hình merchant VietQR:** (A) mỗi shop một merchant → tiền về TK từng shop; (B) master merchant → tiền về TK bên bạn. Quyết định này ảnh hưởng pháp lý và thiết kế tenant.
2. **Nhà cung cấp HĐĐT** nào (MISA / Viettel / VNPT / BKAV / FPT), ai đứng tên hợp đồng.
3. **Ngân hàng nhận tiền:** MB hay BIDV.
4. **Hosting:** VPS của bạn hay tôi đề xuất; domain; SSL.
5. **Mô hình thu phí:** có làm subscription ngay không, hay cấp tài khoản thủ công giai đoạn đầu.
6. **Offline:** chọn A/B/C.
7. **Kế toán xác nhận:** thuế suất, quy tắc làm tròn, mẫu/ký hiệu hóa đơn, nghĩa vụ hộ kinh doanh.

---

## 9. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Phụ thuộc NCC HĐĐT (hợp đồng/nghiệm thu lâu) | Cao | Khởi động P0 ngay; làm adapter + mock song song |
| Sai quy tắc VAT/làm tròn | Cao | Kế toán chốt; test từng mức thuế; thuế suất theo thời gian |
| Rò rỉ dữ liệu giữa tenant | Rất cao | `tenant_id` + RLS + test cách ly + review |
| Callback VietQR trùng/lệch tiền | Trung bình | Idempotent theo `transactionid`; đối chiếu số tiền; hàng đợi |
| Refactor SQLite→Postgres phát sinh | Trung bình | Làm sớm (P1); lớp repository; test hồi quy |
| Mất dữ liệu khi nâng cấp | Cao | Migration có version + rollback; backup `pg_dump` trước mỗi deploy |
| Offline vs online | Trung bình | Chốt sớm (mục 7) |

---

## 10. Đội ngũ & công cụ

- **Tối thiểu:** 1 backend + 1 frontend (có thể kiêm); 1 người phụ trách kế toán/thuế phía bạn.
- **Công cụ:** Git, PostgreSQL, Docker, Playwright (đã có), hệ thống CI tuỳ chọn.
- **Nguyên tắc:** mọi tính năng mới đi kèm test API + UI; không deploy khi test đỏ.

---

## 11. Thứ tự bắt đầu đề xuất

1. **P0** (chốt & chuẩn bị) — song song khởi động hợp đồng NCC HĐĐT.
2. **P1** (nền tảng multi-tenant) — vì mọi thứ khác dựa trên nó.
3. **P2** (phân quyền) — để deploy an toàn.
4. Sau đó P3–P6 theo bảng.
