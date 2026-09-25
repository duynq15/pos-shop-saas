# Test tay VietQR trên giao diện

Áp dụng bản **`pos-shop-saas`**. Không cần Postman — dùng nút **Mô phỏng** có sẵn khi ở chế độ `mock`.

## 1. Chạy phần mềm
```bash
cd pos-shop-saas
npm start
```
Mở `http://localhost:3000`, đăng nhập `admin / admin123`.

## 2. Bật VietQR động (chế độ mock)
Vào **Cài đặt (⚙️)**:
- Thẻ **Tài khoản nhận chuyển khoản (VietQR)**: điền
  - Số tài khoản: `99990001`
  - Chủ tài khoản: `NGUYEN VAN A`
  - Ngân hàng: chọn 1 ngân hàng bất kỳ
- Thẻ **VietQR động (thanh toán tự động)**:
  - Tick **Bật VietQR động**
  - Môi trường: **mock (thử)**
- Bấm **Lưu cài đặt**.

## 3. Bán hàng chuyển khoản
1. Vào **Bán hàng (F1)**.
2. Quét mã / gõ tên để thêm sản phẩm (vd quét `8934588012136`).
3. Chọn phương thức **🏦 CK** (chuyển khoản).
4. Bấm **THANH TOÁN** (hoặc `F9`).

## 4. Màn QR động hiện ra
- Ảnh QR, số tiền, nội dung = mã đối soát dạng `P##########`.
- Dòng chữ: *"Đang chờ khách chuyển khoản… (tự cập nhật khi nhận tiền)"*.
- Ở chế độ mock có nút **🧪 Mô phỏng đã chuyển tiền**.

## 5. Kiểm tra tự xác nhận
Bấm **🧪 Mô phỏng đã chuyển tiền** → phần mềm báo *"Đã nhận thanh toán"* và **tự hiện hóa đơn**.
Kiểm tra lại ở **Hóa đơn (F4)**: hóa đơn đó trạng thái **Đã thanh toán**, hình thức **Chuyển khoản**.

## 6. Các nút khác trên màn QR
| Nút | Khi nào | Tác dụng |
|---|---|---|
| 🧪 Mô phỏng đã chuyển tiền | Chỉ ở `mock` | Giả lập ngân hàng báo có → tự xác nhận |
| ✔ Đã nhận tiền | Khi hóa đơn đang chờ | Xác nhận thủ công (dự phòng) |
| 🖨 In hóa đơn | Luôn | In hóa đơn |
| Đóng | Luôn | Đóng hộp thoại |

## 7. Test tự cập nhật không bấm nút (tùy chọn)
Mở màn QR (bước 4) rồi để yên. Dùng Postman gọi `POST /api/vietqr/simulate` với `invoice_id` của hóa đơn → sau ~3 giây màn hình **tự** chuyển sang hóa đơn đã thanh toán (cơ chế polling).

## 8. Test QR tĩnh (khi tắt VietQR động)
Vào Cài đặt → **bỏ tick "Bật VietQR động"** → bán hàng chọn CK → màn hình hiện QR tĩnh và nút **✔ Đã nhận tiền** (không có nút Mô phỏng).

## 9. Lưu ý
- Chế độ **mock** chỉ để thử, sinh QR nội bộ, không gọi internet.
- Muốn chạy thật: đặt **Môi trường = dev**, nhập **Username/Password VietQR** (do VietQR cấp), **Mã ngân hàng = MB/BIDV**, và webhook phải có URL public (xem `VIETQR-POSTMAN.md`).
