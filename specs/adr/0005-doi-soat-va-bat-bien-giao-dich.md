# ADR-0005: Giao dịch ngân hàng bất biến, phân loại một chiều, tự kiểm hằng đêm

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-02
- **Liên quan:** FR-08, FR-09, SEC-05, NFR-03, ERR-01 → ERR-03, ERR-07, ERR-10, AC-01-3, SKHGDT-3238

## Bối cảnh

Sau GĐ2, tiền vào đã được ghi tự động qua webhook VietQR. Rà soát cho thấy bốn chỗ hở.

- Token webhook của một cửa hàng ghi được tiền vào cửa hàng khác hoặc vào quỹ.
- Hai lần gửi đồng thời cùng một mã giao dịch có thể cùng lọt qua bước kiểm tra trùng.
- Giao dịch không khớp hóa đơn chỉ nằm ở trạng thái "chưa khớp". Không có ai chịu trách nhiệm xử lý, và chưa có loại giao dịch (FR-08).
- Giao dịch ngân hàng và nhật ký vẫn xóa hoặc sửa được bằng SQL.

## Quyết định

- **Token webhook gắn với tenant.**
  - Token cấp bằng thông tin đăng nhập riêng của một tenant chỉ ghi được vào chính tenant đó. Ghi sang tenant khác thì trả 403 `TENANT_MISMATCH` và ghi nhật ký.
  - Token dùng chung của nền tảng (VietQR gọi vào) vẫn định tuyến theo `orderId` hoặc số tài khoản.
- **Một mã giao dịch, một dòng.**
  - Có index duy nhất một phần trên `transactionid`.
  - Khi ghi, dòng giao dịch được chèn trước bằng `INSERT … ON CONFLICT DO NOTHING` trong `BEGIN IMMEDIATE`. Mã đã có thì dừng, không xác nhận hóa đơn hay ghi sổ quỹ lần hai.
  - Dòng trùng có sẵn ở DB cũ không bị xóa: dòng thứ hai trở đi được đánh dấu `dup_of` và loại khỏi báo cáo.
  - Webhook thiếu mã giao dịch thì không ghi nhận.
- **Phân loại một chiều.**
  - `category` nhận một trong các giá trị: `sale`, `fund`, `donation`, `other`, `refund`, `unclassified`. Server tự suy ra, không chắc thì để `unclassified`.
  - Giao dịch `unclassified` không vào báo cáo.
  - Người phân loại: chủ cửa hàng hoặc quản lý (`invoice.cancel`) gắn giao dịch với hóa đơn chờ cùng số tiền, hoặc ghi "thu khác" kèm lý do. Thủ quỹ (`fund.entry`) chọn quỹ để ghi sổ.
  - Đã phân loại thì trigger chặn đổi lại. Sai thì xử lý bằng hủy hóa đơn hoặc bút toán điều chỉnh.
- **Bất biến ở tầng DB.**
  - Trigger chặn xóa `vietqr_transactions` và chặn đổi số tiền, mã, tài khoản, nội dung, thời điểm của nó.
  - Trigger chặn sửa và xóa `audit_logs` và `fund_reconciliations`.
  - Các cột phân loại và đối soát vẫn đổi được.
- **Tự kiểm hằng đêm** (`src/lib/checks.js`).
  - Chạy lúc 02:00 và một lần sau khi khởi động, chỉ dùng `setTimeout`, không thêm thư viện cron.
  - Ba quy tắc: giao dịch chưa phân loại quá N ngày (cấu hình theo cộng đồng); mã giao dịch trùng mới phát sinh trong 7 ngày; quá 24 giờ không có giao dịch trong khi tuần trước có ít nhất 5 ngày có giao dịch.
  - Cảnh báo lưu ở `control.db/alerts`. Mỗi cảnh báo đang mở là duy nhất theo (tenant, loại, đối tượng). Hết điều kiện thì tự đóng và giữ làm lịch sử.
- **Đối soát sao kê theo kỳ.**
  - Thủ quỹ nhập tổng tiền vào theo sao kê; hệ thống so với tiền vào qua ngân hàng đã ghi sổ.
  - Có lệch thì bắt buộc ghi nguyên nhân. Biên bản không sửa, không xóa được.
- **Độ trễ.**
  - Đo khi webhook có gửi thời điểm ngân hàng ghi nhận (`bank_time`). Không có thì báo "chưa đo được", không đoán.

## Hệ quả

- Báo cáo doanh thu và tồn quỹ chỉ phản ánh tiền đã được xác định loại. Tiền chưa rõ nằm ở hàng chờ, có người chịu trách nhiệm và có cảnh báo.
- Mọi sửa sai đều để lại dấu vết. Không có đường nào xóa tiền khỏi hệ thống.
- Kiểm tra cảnh báo phải quét DB của từng tenant mỗi đêm. Khi số tenant lớn thì cần chia lô hoặc đưa chỉ số lên `control.db`.
- Bài học khi làm: migration dùng `ADD COLUMN … DEFAULT` đã gán sẵn giá trị cho mọi dòng cũ, nên bước suy loại `WHERE category IS NULL` không chạy. Phải chạy thử migration trên **bản sao dữ liệu thật**, không chỉ trên DB mới.

## Còn mở

- [NEED DECISION] Tên trường thời điểm giao dịch trong payload VietQR. Hiện đọc vài tên phổ biến.
- Thông báo (email, Zalo) khi có cảnh báo: Brief chưa yêu cầu.
- Đối soát cả số dư tài khoản quỹ: cần ghi phương thức chi (tiền mặt hay chuyển khoản) cho phiếu chi.
