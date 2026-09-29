# Quyết định Giai đoạn 0 — Thanh toán số cấp thôn

Ngày chốt: 2026-09-29 · Nguồn câu hỏi: `specs/ke-hoach-thon-so.md` (GĐ0), SRS mục 8, Brief mục 8.

Trạng thái:

- **Chốt**: đã quyết trong buổi làm việc ngày 2026-09-29.
- **Đề xuất**: con số do dev đề xuất, chờ thôn / sếp xác nhận. Được dùng để thiết kế nhưng có thể đổi.
- **Cần xác minh pháp lý**: code được, chưa bật thật cho đến khi pháp chế xác nhận.

## 1. Kiến trúc

| # | Quyết định | ID liên quan | Trạng thái |
| --- | --- | --- | --- |
| 0.1 | Hiện thực PA3 bằng cách mở rộng POS Shop, không viết ứng dụng độc lập. Xem ADR-0002 | NFR-01, ADR-0001 | Chốt (ADR-0002 chờ sếp duyệt) |
| 0.2 | Tenant thuộc thôn không được dùng chế độ tài khoản VietQR chung cho nhiều shop; phải có tài khoản nhận riêng. Cửa hàng thường (`kind=shop`) giữ hành vi cũ | BR-02, FR-05, SEC-01 | Chốt |
| 0.4 | Người nhận dùng ngân hàng ngoài MB / BIDV: dùng QR chuyển khoản thường, người nhận xác nhận thủ công. Giao dịch ghi `source='manual'`, báo cáo đánh dấu riêng | FR-07, ADR-0001 | Chốt |
| 0.5 | Code tiếp phần webhook. Tài khoản cá nhân chỉ bật nhận webhook thật khi đã lưu sự đồng ý của chủ tài khoản (ai, lúc nào). Tài khoản quỹ không cần bước này. Pháp chế xác minh song song | SEC-06 | Chốt; cần xác minh pháp lý |

## 2. Quỹ và công đức

| # | Quyết định | ID liên quan | Trạng thái |
| --- | --- | --- | --- |
| 0.3 | Mỗi quỹ / chương trình công đức có một tài khoản nhận riêng. Webhook định tuyến về quỹ theo số tài khoản | BR-06, BR-03, FR-04, FR-12 | Chốt |
| 0.6 | Người duyệt chi: trưởng thôn hoặc người được trưởng thôn ủy quyền (vai trò `approver`). Người lập và người duyệt phải khác nhau. Không cho duyệt khoản chi vượt tồn quỹ | BR-05, FR-14, SEC-04, ERR-06 | Chốt |
| 0.8 | Báo cáo quỹ xem theo khoảng thời gian tự chọn (tháng, quý, năm hoặc từ ngày – đến ngày). Không chốt sổ. Sửa sai bằng bút toán điều chỉnh | BR-12, FR-17, BR-04 | Chốt |
| 0.8b | Công khai danh sách công đức gồm tên và số tiền. Thủ quỹ ẩn được tên từng dòng khi người đóng góp xin ẩn danh; trang công khai hiện "Người hảo tâm", giữ số tiền. Mỗi lần ẩn / hiện ghi nhật ký | SEC-02, SEC-06, US-09 | Chốt; cần xác minh pháp lý |
| BR-13 | Có ghi nhận tiền mặt, chỉ trong sổ quỹ: thủ quỹ nhập khoản thu tiền mặt, nguồn `cash`. Người bán không nhập tiền mặt. Cấp requirement mới FR-19 | BR-13 | Chốt |
| FR-04 | Trưởng thôn tạo quỹ / chương trình công đức | FR-04 | Chốt |

Requirement mới cấp từ quyết định trên:

| ID | Requirement | Căn cứ |
| --- | --- | --- |
| FR-19 | Thủ quỹ ghi nhận khoản thu tiền mặt vào quỹ, lưu người lập, thời điểm, nguồn `cash`; báo cáo quỹ tách riêng thu tiền mặt và thu chuyển khoản | BR-13 |
| FR-20 | Thủ quỹ đánh dấu ẩn danh từng khoản công đức; trang công khai hiện "Người hảo tâm" cho dòng đã ẩn; thao tác ẩn / hiện ghi nhật ký | 0.8b, SEC-02, SEC-06 |

## 3. Người bán và ban lãnh đạo

| # | Quyết định | ID liên quan | Trạng thái |
| --- | --- | --- | --- |
| 0.7 | Người bán được tính "đã chuyển đổi số" khi có giao dịch đầu tiên được ghi nhận | BR-07, FR-18 | Chốt |
| 0.7b | Ban lãnh đạo chỉ xem số liệu tổng hợp; không xem doanh thu từng người bán | BR-09, SEC-02 | Chốt |
| BR-11 | Danh mục hạng mục hàng dùng chung cả thôn, do trưởng thôn quản lý. Người bán chỉ chọn trong danh mục, không tự thêm | BR-11, FR-10, AC-02-2 | Chốt |

## 4. Vận hành

| # | Quyết định | ID liên quan | Trạng thái |
| --- | --- | --- | --- |
| NFR-03 | Hệ thống tự kiểm mỗi đêm và cảnh báo: giao dịch chưa phân loại quá 3 ngày (ERR-03); trùng mã giao dịch ngân hàng (ERR-02); quá 24 giờ không nhận webhook trong khi thường ngày có (ERR-10) | NFR-03, ERR-02, ERR-03, ERR-10 | Đề xuất |
| NFR-03 | Thủ quỹ đối soát với sao kê ngân hàng mỗi tháng; giao dịch thiếu (ERR-01) bổ sung bằng bút toán có lý do và người lập. Người bán không bắt buộc đối soát | NFR-03, ERR-01 | Đề xuất |
| AC-01-3 | 95% giao dịch xuất hiện trong 1 phút kể từ khi ngân hàng ghi nhận. Quá 15 phút coi là sự cố kết nối (ERR-10); màn nhận tiền báo "Chưa xác nhận được, kiểm tra app ngân hàng". Cần kiểm tra webhook có gửi thời điểm giao dịch để đo | AC-01-3, ERR-10 | Đề xuất |

Chỉ tiêu thí điểm (kế hoạch mục 6.5), **Đề xuất**, thay bằng số tuyệt đối khi biết quy mô thôn:

| Chỉ tiêu | Mốc |
| --- | --- |
| Thời gian | 3 tháng: tháng 1 chỉ quỹ; tháng 2–3 thêm người bán |
| Quỹ | 100% quỹ / chương trình công đức có QR riêng và báo cáo từ hệ thống ngay tháng 1 |
| Khoản chi | 100% khoản chi qua luồng duyệt và có chứng từ |
| Người bán đã chuyển đổi (BR-07) | ≥ 50% người bán đã đăng ký |
| Người bán dùng thật | ≥ 30% người bán có giao dịch ít nhất 3 / 4 tuần của tháng 3 |
| Chất lượng dữ liệu | Đối soát tháng không còn lệch chưa giải thích; hàng chờ phân loại xử lý hết trong 7 ngày |
| Hài lòng | Thủ quỹ xác nhận không còn tổng hợp sổ tay (khảo sát cuối kỳ) |

## 5. Danh sách gửi pháp chế (SEC-06)

- [ ] Quyền nhận biến động số dư tài khoản cá nhân của người bán; nội dung và cách lưu sự đồng ý (0.5).
- [ ] Công khai tên và số tiền người công đức; cơ chế ẩn danh theo yêu cầu có đủ không (0.8b).
- [ ] Mô hình ghi nhận không giữ tiền có phải xin phép hoạt động thanh toán không (Brief mục 8.D).

## 6. Còn mở

- [ ] Quy mô thôn thí điểm (số hộ, người bán, quỹ) — cần để đổi chỉ tiêu sang số tuyệt đối.
- [ ] FR-11: một giao dịch gắn một hay nhiều hạng mục. Tạm thiết kế một hạng mục / giao dịch.
- [ ] FR-01, SEC-03: cách đăng ký và xác thực. Tạm dùng đăng nhập hiện có của POS Shop.
