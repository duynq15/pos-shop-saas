# Test manual trên môi trường dev (VietQR thật)

Áp dụng cho dev instance đang chạy (xem `deploy/README.md`). Dùng **Test Callback của VietQR dev** để mô phỏng tiền về ngay trên giao diện — không cần quét mã thật.

> URL và tài khoản đăng nhập do người triển khai cung cấp riêng (không lưu trong tài liệu vì là thông tin truy cập).

## 1. Đăng nhập
Mở URL dev → đăng nhập bằng tài khoản chủ cửa hàng.

## 2. Kiểm tra cấu hình VietQR
Vào **Cài đặt (⚙️)**:
- Thẻ *Tài khoản nhận chuyển khoản*: Số TK test, Chủ TK, Ngân hàng (MB).
- Thẻ *VietQR động*: đã bật, **Môi trường = dev**, Mã ngân hàng = `MB`, có Username/Password VietQR.
- Bấm **Kiểm tra kết nối** → cần thấy **Token: OK · QR: OK**.

## 3. Bán hàng chuyển khoản
1. Vào **Bán hàng (F1)**.
2. Thêm sản phẩm (gõ tên/quét mã).
3. Chọn phương thức **🏦 CK**.
4. Bấm **THANH TOÁN (F9)**.

## 4. Màn QR động (từ VietQR thật)
- Ảnh QR động (tạo bởi VietQR dev), số tiền, dòng `Mã HĐ … · ID …`.
- Nội dung chuyển khoản dạng `VQRxxxx P##########`.
- Nút **🧪 Mô phỏng thanh toán (dev)**.

## 5. Giả lập tiền về
Bấm **🧪 Mô phỏng thanh toán (dev)** → hệ thống gọi *Test Callback* của VietQR → VietQR gọi lại webhook → **hóa đơn tự chuyển "Đã thanh toán"** (trong vài giây, nhờ cơ chế tự cập nhật).

Kiểm tra ở **Hóa đơn (F4)**: trạng thái **Đã thanh toán**, hình thức **Chuyển khoản**.

## 6. (Tùy chọn) Quét QR thật bằng app ngân hàng
Mở màn QR (bước 4) → dùng app ngân hàng quét → chuyển số tiền nhỏ vào tài khoản MB test. Tiền về thì webhook cũng tự xác nhận tương tự.

## 7. Các nút khác
| Nút | Ý nghĩa |
|---|---|
| 🧪 Mô phỏng thanh toán (dev) | Giả lập qua Test Callback VietQR (chỉ ở dev) |
| ✔ Đã nhận tiền | Xác nhận thủ công (dự phòng) |
| 🖨 In hóa đơn / Đóng | In / đóng |

## 8. Lỗi thường gặp
| Hiện tượng | Nguyên nhân |
|---|---|
| Không hiện nút Mô phỏng (dev) | Chưa chọn Môi trường = `dev`, hoặc QR chưa tạo được |
| `Kiểm tra kết nối` báo lỗi token | Sai Username/Password VietQR, hoặc chưa có mạng |
| Bấm Mô phỏng nhưng không tự xác nhận | URL webhook đổi (tunnel restart) → báo lại VietQR; hoặc sai số tài khoản |
| Callback "Không tìm thấy hóa đơn" | `orderId` không khớp `payment_ref` (thường do tạo hóa đơn cũ) |
