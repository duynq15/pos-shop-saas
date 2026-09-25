# Hướng dẫn test VietQR bằng Postman

Áp dụng cho bản **`pos-shop-saas`** (đa cửa hàng). Gồm 2 phần:
- **A. Test luồng trong app** (mock, không cần tài khoản VietQR) — làm được ngay.
- **B. Test webhook** (VietQR gọi vào hệ thống) — mô phỏng đúng hợp đồng API của VietQR.

---

## 0. Chuẩn bị

Chạy server:
```bash
cd pos-shop-saas
npm install
npm start
# mặc định http://localhost:3000
```

Đăng nhập bằng `admin / admin123` (đổi ngay nếu dùng thật).

**Biến Postman gợi ý** (Environment):
| Biến | Giá trị |
|---|---|
| `base` | `http://localhost:3000` |
| `token` | (để trống, tự lưu ở bước webhook) |

> Postman tự lưu cookie `pos_session` sau bước đăng nhập (đảm bảo **Settings → General → Cookies = On**). Dùng đúng một host (`localhost`) cho mọi request để cookie khớp.

---

## A. Luồng trong app

### A1. Đăng nhập
`POST {{base}}/api/auth/login` — Body raw JSON:
```json
{ "username": "admin", "password": "admin123" }
```
Mong đợi: `200`, `data.user.role = "owner"`. (Không cần copy token; Postman giữ cookie.)

### A2. Bật VietQR động (mock)
`PUT {{base}}/api/settings` — Body:
```json
{
  "vqr_enabled": "1",
  "vqr_env": "mock",
  "bank_account": "99990001",
  "bank_name": "MB Bank",
  "bank_bin": "970422",
  "account_holder": "NGUYEN VAN A"
}
```
Mong đợi: `data.vqr_enabled = "1"`.

Kiểm tra: `GET {{base}}/api/vietqr/config` → `{ enabled: true, env: "mock", ... }`.

### A3. Tạo hóa đơn chuyển khoản
`POST {{base}}/api/invoices` — Body:
```json
{ "items": [{ "product_id": 2, "qty": 2 }], "payment_method": "transfer" }
```
Mong đợi: `data.status = "pending"`, `data.payment_ref` dạng `P0000000001` (nhớ giá trị này).

### A4. Tạo QR động
`POST {{base}}/api/invoices/{{id}}/vietqr` (id lấy từ A3).
Mong đợi: `data.qrDataUrl` bắt đầu `data:image/png;base64,...`, `data.mock = true`.
> Dán `qrDataUrl` vào trình duyệt để xem QR.

### A5. Kiểm tra trạng thái
`GET {{base}}/api/invoices/{{id}}/payment-status`
Mong đợi: `{ status: "pending", paid: false }`.

### A6. Mô phỏng khách đã chuyển tiền
`POST {{base}}/api/vietqr/simulate` — Body:
```json
{ "invoice_id": 1 }
```
Mong đợi: `{ paid: true, message: "Đã ghi nhận thanh toán" }`.

Kiểm tra lại A5 → `paid: true`. Mở app: hóa đơn chuyển sang **Đã thanh toán**.

---

## B. Test webhook (hợp đồng API của VietQR)

### B1. Lấy token (đối tác cấp cho VietQR)
`POST {{base}}/vqr/api/token_generate`
- Tab **Authorization → Basic Auth**: Username `posshop`, Password `posshop-secret`
  (mặc định; đổi bằng biến môi trường `VQR_EXPOSED_USER`, `VQR_EXPOSED_PASS`).

Mong đợi:
```json
{ "access_token": "....", "token_type": "Bearer", "expires_in": 300 }
```
Copy `access_token` (token sống 300 giây).

### B2. Đồng bộ biến động số dư (giả lập ngân hàng báo có)
`POST {{base}}/vqr/bank/api/transaction-sync`
- Tab **Authorization → Bearer Token** = `access_token` ở B1.
- Body raw JSON (điền `amount`/`orderId`/`content` theo hóa đơn đang `pending`):
```json
{
  "bankaccount": "99990001",
  "amount": 20000,
  "content": "P0000000002",
  "orderId": "P0000000002",
  "transactionid": "TXN-001",
  "transType": "C"
}
```
Mong đợi:
```json
{ "error": false, "errorReason": null, "toastMessage": "Đã ghi nhận thanh toán",
  "object": { "reftransactionid": "P0000000002" } }
```

**Các ca kiểm tra quan trọng:**
| Ca | Cách làm | Mong đợi |
|---|---|---|
| Bình thường | như trên | hóa đơn `paid`, 1 thanh toán |
| Trùng (idempotent) | gọi lại y hệt `transactionid` | `toastMessage` = "Giao dịch đã xử lý trước đó", **không** cộng tiền lần 2 |
| Lệch tiền | đổi `amount` thành `1000` | `toastMessage` = "Số tiền không khớp…", hóa đơn **vẫn pending** |
| Sai token | Bearer `bad` | HTTP `401` |
| Sai Basic auth | Basic `x:y` | HTTP `401` |
| Không rõ cửa hàng | `bankaccount` lạ, token global | HTTP `400` `TENANT_NOT_FOUND` |

> Sau mỗi lần test nhớ tạo hóa đơn mới (mã `payment_ref` mới) hoặc dùng `transactionid` mới.

---

## C. Chạy thật với sandbox VietQR

1. Trong **Cài đặt → VietQR động**, điền:
   - `Môi trường = dev`
   - `Mã ngân hàng = MB` (hoặc `BIDV`)
   - `bank_account`, `account_holder` = tài khoản test VietQR cấp
   - `Username/Password VietQR` = tài khoản test do VietQR cấp
2. **Webhook phải có URL public.** Máy local dùng tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   # hoặc: ngrok http 3000
   ```
   Lấy URL (vd `https://abc.trycloudflare.com`).
3. Khai báo với VietQR (trang `https://vietqr.vn/merchant/request`):
   - **Địa chỉ kết nối:** `https://abc.trycloudflare.com`
   - **URL Path:** `/vqr`
   - **Basic Auth:** Username/Password bạn đặt (khớp `VQR_EXPOSED_USER`/`VQR_EXPOSED_PASS`)
4. Tạo QR động trong app (chuyển khoản) → quét bằng app ngân hàng test → VietQR gọi `transaction-sync` vào webhook → hóa đơn tự **Đã thanh toán**.
5. Dùng **API Test Callback** của VietQR (`dev.vietqr.org/.../test/transaction-callback`) để giả lập thay vì chuyển tiền thật.

Đặt biến môi trường khi chạy:
```bash
VQR_EXPOSED_USER=posshop VQR_EXPOSED_PASS=... VQR_SECRET=... npm start
```
> Đổi `VQR_SECRET` và mật khẩu trước khi GoLive.

---

## D. Ghi chú kỹ thuật

- `orderId` ≤ 13 ký tự, `content` ≤ 23 ký tự, không dấu — app đã tự sinh `payment_ref` (`P##########`).
- Token VietQR hết hạn 300s; hệ thống tự cache và làm mới.
- Đối soát: bảng `vietqr_transactions` lưu mọi giao dịch (chống trùng theo `transactionid`).
- Chế độ `mock` sinh QR nội bộ, không gọi internet — dùng để test/dev.
