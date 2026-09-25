# Đăng ký VietQR cho từng cửa hàng

Mô hình: **mỗi cửa hàng có tài khoản VietQR riêng, tiền về tài khoản MB/BIDV của chính shop đó**.
Nền tảng (bên bạn) cung cấp **một webhook chung**; mỗi shop khai báo cùng URL nhưng **Basic Auth và tài khoản ngân hàng riêng**.

```
Khách quét QR → tiền vào TK MB/BIDV của shop → VietQR gọi webhook nền tảng
             → hệ thống nhận diện shop (theo token hoặc số TK) → tự xác nhận hóa đơn
```

---

## A. Chuẩn bị cho mỗi shop
- Giấy tờ: GPKD / hộ kinh doanh, mã số thuế, người đại diện.
- **Tài khoản ngân hàng MB hoặc BIDV** (VietQR hiện chỉ hỗ trợ MB/BIDV).
- Email/SĐT liên hệ.

## B. Chuẩn bị phía nền tảng (1 lần)
1. **URL public** trỏ tới máy chủ phần mềm (domain + HTTPS). Test tạm: `cloudflared tunnel --url http://localhost:3000`.
2. **URL Path**: `/vqr` → hai endpoint:
   - `POST {URL}/vqr/api/token_generate`
   - `POST {URL}/vqr/bank/api/transaction-sync`
3. **Basic Auth** do mình tự đặt (mỗi shop một cặp), lưu vào phần mềm: `vqr_exposed_username` / `vqr_exposed_password`.
4. Biến môi trường `VQR_SECRET` (chuỗi bí mật ký token, đổi trước khi GoLive).

## C. Các bước đăng ký (cho mỗi shop)
1. Truy cập **https://vietqr.vn/merchant/request** (hoặc liên hệ sales VietQR).
2. Khai báo theo mẫu:

| Trường | Giá trị |
|---|---|
| Tên Merchant | Tên cửa hàng (không dấu) |
| Địa chỉ kết nối (URL/IP+PORT) | domain/tunnel của nền tảng |
| URL Path | `/vqr` |
| Địa chỉ KH (mã KH, không dấu) | mã nội bộ của shop (vd `POSSHOP-A`) |
| Ngân hàng thụ hưởng | **MB** hoặc **BIDV** |
| Số TK + Chủ TK (không dấu) | tài khoản nhận tiền của shop |
| Basic Auth Username/Password | **mình tự đặt**, khớp `vqr_exposed_username/password` |

3. Gửi thông tin → VietQR kiểm tra, duyệt, rồi **cấp lại `username`/`password`** để gọi API (môi trường test).

## D. Cấu hình trong phần mềm (cho tenant đó)
Vào **Cài đặt**:
- Thẻ *Tài khoản nhận chuyển khoản*: Số TK, Chủ TK, Ngân hàng.
- Thẻ *VietQR động*: tick bật, **Môi trường = dev**, **Mã ngân hàng = MB/BIDV**,
  `Username/Password VietQR` (do VietQR cấp), `Basic user/pass` (khớp bước C2).
- Bấm **Kiểm tra kết nối** → cần thấy `Token: OK · QR: OK`.
- Bán hàng chuyển khoản thử → quét QR bằng app ngân hàng (số tiền nhỏ) → hóa đơn tự "Đã thanh toán".

## E. Nghiệm thu & GoLive
- Kiểm tra vài giao dịch test, đối chiếu với VietQR.
- Đổi **Môi trường = prod** (`api.vietqr.org`), cập nhật Basic Auth/secret thật.

## F. Lưu ý
- Nhiều shop: khai báo **cùng URL/Path**, mỗi shop một Basic Auth + tài khoản ngân hàng. Webhook tự nhận diện shop theo token (nếu dùng Basic riêng) hoặc theo số tài khoản.
- **Hóa đơn điện tử là việc khác** — cần hợp đồng với nhà cung cấp HĐĐT được cấp phép (MISA/Viettel/VNPT…). VietQR chỉ lo thanh toán.
- Trong lúc chờ tài khoản, dùng **chế độ mock** để chạy thử toàn bộ luồng nội bộ.
