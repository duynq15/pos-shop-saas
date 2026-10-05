# ADR-0006: Chế độ người bán nhỏ dùng lại hóa đơn, hạng mục là nhãn của cộng đồng

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-02
- **Liên quan:** FR-03, FR-10, FR-11, FR-16, NFR-02, BR-11, AC-01-1, AC-01-3, AC-02-1, AC-02-2, AC-03-1, AC-03-2, ERR-04, ERR-09, SKHGDT-3240

## Bối cảnh

Người bán trong thôn (hàng rau, quán nước) cần nhận tiền chuyển khoản thật nhanh trên điện thoại, mỗi lần bán gắn với một hạng mục hàng dùng chung của thôn. POS hiện có xoay quanh hóa đơn, sản phẩm và tồn kho, quá nặng với các hộ này. Nhưng toàn bộ phần webhook, chống trùng, hàng chờ phân loại, báo cáo và tổng hợp cộng đồng đều đang tính trên bảng hóa đơn.

## Quyết định

- **Mỗi lần nhận tiền nhanh là một hóa đơn.** Hóa đơn chuyển khoản có một dòng hàng tự do, không gắn sản phẩm, nên không đụng tới tồn kho. Không thêm bảng "giao dịch nhanh" riêng. Nhờ vậy webhook, chống trùng (GĐ3.4), hàng chờ (GĐ3.2), báo cáo và tổng hợp cộng đồng dùng lại được nguyên vẹn.
- **Danh mục hạng mục nằm ở cộng đồng.**
  - Bảng `community_categories` đặt trong `control.db`, không sao chép xuống DB của từng người bán.
  - Chỉ tenant cộng đồng có quyền `community.categories` mới sửa danh mục. Cần kiểm theo loại tenant, vì chủ tenant người bán có quyền `*`.
  - So trùng tên dựa trên `name_key`, là tên đã chuẩn hóa NFC và chuyển chữ thường. Không dùng được `NOCASE` của SQLite vì nó chỉ xử lý ký tự ASCII.
  - Danh mục không xóa được, chỉ ẩn.
- **Hóa đơn lưu cả id lẫn tên hạng mục tại thời điểm bán.** Đổi tên hạng mục sau này không làm sai báo cáo cũ. Mỗi giao dịch gắn một hạng mục (FR-11).
- **Hạng mục chỉ là nhãn.** Người bán được đổi hạng mục của giao dịch sau khi bán, mỗi lần đổi đều ghi nhật ký. Số tiền vẫn bất biến như GĐ3.
- **QR tĩnh dán quầy.**
  - QR được dựng trên server từ tài khoản của người bán. Thiếu hoặc sai thông tin tài khoản thì không tạo QR (ERR-09).
  - Tiền vào qua QR tĩnh không có mã đối soát, nên rơi vào hàng chờ. Phân loại "Bán hàng" sẽ tạo hóa đơn đã thanh toán kèm hạng mục.
- **Báo cáo người bán.** Doanh thu bằng tiền bán trừ tiền trả hàng. Khoản trả hàng tính vào hạng mục của hóa đơn gốc. Có thêm dòng "Chưa gắn hạng mục", nên tổng các hạng mục luôn bằng tổng doanh thu.
- **Giao diện.**
  - Người bán vẫn có đủ menu POS. Màn "Nhận tiền" được mở đầu tiên.
  - Một lần bán chỉ cần 2–3 chạm. Nút cao ít nhất 48px, ô hạng mục cao 64px.
  - Cài được thành PWA (có manifest và icon PNG sinh bằng zlib). Không làm chế độ offline, vì không có mạng thì cũng không nhận được tiền chuyển khoản.

## Hệ quả

- Không có mô hình dữ liệu thứ hai cho tiền của người bán. Mọi báo cáo và đối soát đều đi qua một đường duy nhất.
- Danh sách hóa đơn của người bán sẽ có nhiều hóa đơn một dòng. Đây là hành vi chấp nhận được.
- Sửa lỗi phát sinh khi làm: `makeCode` trước đây sinh số chứng từ bằng "đếm số dòng + 1", nên khi dãy số có lỗ hổng (do seed hay do hóa đơn tạo từ hàng chờ) thì bị trùng mã. Giờ dùng "số lớn nhất + 1".

## Còn mở

- Người bán có muốn ẩn hẳn menu POS không: hiện giữ nguyên menu. Thêm tùy chọn theo từng người bán khi thôn yêu cầu.
- Gắn nhiều hạng mục cho một giao dịch (FR-11): hiện chỉ một. Thêm bảng nối khi có nhu cầu.
