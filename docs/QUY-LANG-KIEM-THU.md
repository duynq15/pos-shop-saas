# Quỹ làng: mô tả tính năng và kịch bản kiểm thử

Tài liệu cho Tester. Môi trường: https://thanhtoanso.sangkienhunggia.app (đăng nhập tài khoản của thôn, vào menu **Sổ quỹ**).
Dữ liệu mẫu đầy đủ: thôn **Xuân Trạch**. API cho App / Web người dân: `docs/API-SO-QUY.md`.

## 1. Vai trò

| Vai trò | Được làm | Không được làm |
|---|---|---|
| Thủ quỹ | Thu tiền, lập phiếu chi (kèm ảnh chứng từ), nhập Excel, bút toán điều chỉnh, đối soát sao kê, ẩn tên người ủng hộ | Tạo / sửa quỹ, duyệt chi, sửa danh mục |
| Người duyệt chi | Duyệt / từ chối phiếu chi; tạo, sửa quỹ; quản lý loại quỹ và tài khoản nhận tiền; cùng duyệt mở khoá sổ | Thu tiền, lập phiếu |
| Ban lãnh đạo (Trưởng thôn) | Xem toàn bộ; tạo, sửa quỹ; quản lý loại quỹ và tài khoản | Thu, chi, duyệt chi |
| Trưởng ban kiểm tra | Xem toàn bộ; khoá sổ (kèm biên bản); duyệt mở khoá sổ | Thu, chi, duyệt chi, sửa quỹ |

Thủ quỹ chỉ thấy quỹ được giao cho mình và quỹ chưa giao ai.

## 2. Màn hình Sổ quỹ

**Máy tính:** bên trái là danh sách quỹ, bên phải là chi tiết quỹ đang chọn.
**Điện thoại:** màn đầu là danh sách quỹ. Bấm một quỹ để mở chi tiết, bấm **← Danh sách quỹ** để quay lại.

- **Danh sách quỹ:** lọc Đang thu / Ngừng thu / Khoá sổ / Tất cả (có số lượng), ô tìm theo tên. Mỗi dòng có tên, trạng thái, tính chất, tồn quỹ.
- **Đầu trang chi tiết:**
  - tên quỹ và các nhãn (trạng thái, loại, tính chất, công khai hay không)
  - nút **Sửa thông tin quỹ**, **+ Thu tiền**, **+ Lập phiếu chi**, **QR nhận tiền**; menu **Thêm** gồm Chia sẻ, Nhập Excel, Điều chỉnh, Tạo quỹ mới từ quỹ này
  - băng trạng thái (hạn thu, nút Ngừng thu / Mở thu lại / Khoá sổ)
  - thanh tiến độ nếu quỹ có mục tiêu
- **Số liệu:** Tồn quỹ, Thu tháng này, Chi tháng này, Việc cần làm.
- **Các tab:**
  - **Thông tin quỹ:** ba thẻ Thông tin chung / Nhận tiền / Nội dung chi tiết, mỗi thẻ có nút **Sửa**. Tài liệu đính kèm (xem, thêm, gỡ) nằm ngay trong thẻ Nội dung.
  - **Việc cần làm:** phiếu nháp, phiếu chờ duyệt, tiền vào chưa rõ quỹ.
  - **Sổ thu chi:** lọc theo ngày, loại, trạng thái; bấm dòng để xem chi tiết.
  - **Theo hộ:** từng hộ đã đóng bao nhiêu, còn thiếu, được miễn; lọc và tìm; đồng bộ danh sách hộ từ trang Hành chính.
  - **Báo cáo:** báo cáo kỳ, xuất Excel, in, đối soát sao kê ngân hàng.
- Nút đầu trang (chỉ người có quyền quản lý quỹ): **Loại quỹ**, **Tài khoản nhận tiền**, **+ Tạo quỹ mới**.

Trên điện thoại có thanh cố định ở đáy với hai nút **+ Thu tiền** và **+ Phiếu chi**.

## 3. Danh mục

### 3.1. Loại quỹ
Mỗi loại quỹ gắn sẵn một tính chất: **Bắt buộc**, **Vận động** hoặc **Tự nguyện**. Khi tạo quỹ chỉ chọn loại, tính chất tự đi theo; không có ô nhập tính chất riêng nên không chọn sai được.
Đổi danh mục không làm thay đổi các quỹ đã tạo. Quỹ cũ có loại đã bị xoá khỏi danh mục vẫn giữ loại của nó.

### 3.2. Tài khoản nhận tiền
Đây là danh sách tài khoản ngân hàng của thôn; quỹ **chọn** tài khoản trong danh sách, không gõ tay.
- Một tài khoản dùng chung được cho nhiều quỹ. Mỗi quỹ có **mã nội dung chuyển khoản** riêng (vd QT26), tiền về được chia theo mã đó.
- Khoản chuyển khoản thiếu mã vào mục **Chưa phân loại** để thủ quỹ chọn quỹ.
- Sửa ngân hàng hoặc chủ tài khoản thì các quỹ đang dùng tài khoản đó cập nhật theo, trừ quỹ đã khoá sổ.
- Tài khoản đang có quỹ dùng thì không xoá và không đổi số được.
- Không trùng tài khoản của thôn khác hay của cửa hàng.

### 3.3. Đã bỏ
**Phạm vi thu theo xóm / đoàn thể** đã bỏ khỏi form quỹ và màn Cài đặt. Ô "Xóm / địa chỉ" khi thu tiền cũng đã bỏ: chọn mã hộ thì tên chủ hộ và xóm tự điền theo danh sách hộ.

## 4. Form tạo / sửa quỹ (4 bước)

1. **Quỹ gì:** tên, loại quỹ (tính chất hiện theo loại), đơn vị quản lý, thủ quỹ phụ trách.
2. **Đóng thế nào:**
   - cách đóng: theo hộ / theo nhân khẩu / tuỳ tâm / theo mục tiêu
   - mức đóng (ẩn khi tuỳ tâm), chu kỳ (năm, tháng, một lần), diện hộ được miễn
   - ngày bắt đầu, hạn thu
3. **Nhận tiền:**
   - hình thức nộp: Tiền mặt và chuyển khoản / Chỉ tiền mặt / Chỉ chuyển khoản
   - tài khoản nhận và mã nội dung chuyển khoản, cả hai ẩn khi chọn Chỉ tiền mặt
4. **Công khai cho người dân:** bật / tắt hiện trên App Làng Số, nội dung chi tiết.

Từ form có thể mở **Sửa danh mục loại quỹ** và **Quản lý danh sách tài khoản**. Khi quay lại, các ô đã nhập dở vẫn còn.

## 5. Quy tắc nghiệp vụ cần kiểm

| Mã | Quy tắc |
|---|---|
| R1 | Khoản thu ghi sổ ngay. Phiếu chi phải có ảnh chứng từ và được Người duyệt chi duyệt mới trừ tồn quỹ. |
| R2 | Không xoá bút toán. Sai thì lập bút toán điều chỉnh (cần duyệt). |
| R3 | Quỹ **Chỉ tiền mặt**: không có QR; thu chuyển khoản (tay hoặc Excel) bị từ chối. Quỹ **Chỉ chuyển khoản**: thu tiền mặt bị từ chối. |
| R4 | **Ngừng thu**: không thu, không QR, vẫn lập và duyệt phiếu chi. Hết hạn thu thì hệ thống tự ngừng thu. |
| R5 | **Mở thu lại**: tạo đợt mới, nội dung chuyển khoản thêm `-D2`, `-D3`… Ai quét QR đợt cũ thì tiền vào Chưa phân loại. |
| R6 | **Khoá sổ** (Trưởng ban kiểm tra): cần biên bản; còn phiếu nháp / chờ duyệt hoặc phiếu chi thiếu chứng từ thì không khoá được. Đã khoá thì không thu, không chi, không sửa. |
| R7 | **Mở khoá sổ**: cần lý do và biên bản; Người duyệt chi và Trưởng ban kiểm tra cùng duyệt (hai người khác nhau). Quỹ mở về Ngừng thu. |
| R8 | Quỹ dùng chung tài khoản bắt buộc có mã nội dung chuyển khoản khác nhau. |
| R9 | Nhập Excel: tất cả hoặc không. Có dòng lỗi thì không ghi dòng nào và báo lỗi từng dòng. Mã giao dịch trùng bị chặn. |
| R10 | Người ủng hộ xin ẩn danh: trang công khai hiện "Người hảo tâm". |

## 6. Kịch bản kiểm thử chính

| # | Vai trò | Bước | Kết quả mong đợi |
|---|---|---|---|
| 1 | Trưởng thôn | Sổ quỹ › **Tài khoản nhận tiền** › Thêm tài khoản (chọn ngân hàng bằng gõ "mb", "vietcom"…) | Tài khoản xuất hiện trong danh sách, chủ tài khoản viết hoa |
| 2 | Trưởng thôn | **Loại quỹ** › thêm "Ủng hộ màn hình LED" tính chất Vận động › Lưu | Lưu thành công; form tạo quỹ có loại mới |
| 3 | Trưởng thôn | **+ Tạo quỹ mới**: chọn loại "Ủng hộ màn hình LED" | Tính chất tự hiện "Vận động", không có ô chọn tính chất |
| 4 | Trưởng thôn | Tiếp: cách đóng "Huy động theo mục tiêu" 100.000.000, Chỉ chuyển khoản, chọn tài khoản ở bước 1, bật công khai › Tạo quỹ | Quỹ được chọn, mở tab Thông tin; có thanh tiến độ 0%; có nút QR |
| 5 | Trưởng thôn | Tạo quỹ thứ hai cùng tài khoản, cùng mã nội dung | Báo lỗi trùng mã; đổi mã khác thì lưu được |
| 6 | Trưởng thôn | Tab Thông tin › bấm **Sửa** ở thẻ Nhận tiền › đổi sang Chỉ tiền mặt | Ẩn ô tài khoản / mã; sau khi lưu không còn nút QR |
| 7 | Thủ quỹ | Thu tiền mặt cho quỹ Chỉ chuyển khoản (qua API hoặc file Excel có dòng "Tiền mặt") | Bị từ chối, báo "Quỹ chỉ nhận chuyển khoản" |
| 8 | Thủ quỹ | **+ Thu tiền** 50.000, chọn mã hộ | Tên chủ hộ tự điền; tồn quỹ tăng ngay; tab Theo hộ hiện hộ đã đóng |
| 9 | Thủ quỹ | **+ Lập phiếu chi** không ảnh › Lưu nháp | Việc cần làm: "Thiếu ảnh chứng từ", nút Gửi duyệt bị khoá |
| 10 | Người duyệt chi | Việc cần làm › Duyệt / Từ chối (bắt buộc lý do) | Duyệt: trừ tồn quỹ. Từ chối: thủ quỹ thấy lý do |
| 11 | Trưởng thôn | Ngừng thu › Mở thu lại (hạn mới, lý do) | Hiện "Đợt 2", nội dung CK có `-D2` |
| 12 | Trưởng ban kiểm tra | Ngừng thu › Khoá sổ (đính kèm biên bản) | Trạng thái Khoá sổ, không còn nút thu / chi / sửa |
| 13 | Trưởng ban kiểm tra + Người duyệt chi | Mở khoá sổ: gửi đề nghị, cả hai cùng duyệt | Quỹ về Ngừng thu, trang công khai hiện dòng "Đã mở khoá sổ…" |
| 14 | Trưởng thôn | **Tài khoản nhận tiền** › xoá tài khoản đang có quỹ dùng | Bị chặn, báo tên các quỹ đang dùng |
| 15 | Bất kỳ | Điện thoại (rộng 390px): danh sách › chọn quỹ › ← Danh sách quỹ | Không cuộn ngang; chuyển màn đúng; thanh Thu / Chi ở đáy |
| 16 | Người dân | Mở App Làng Số / trang công khai của thôn | Chỉ thấy quỹ bật công khai; quỹ Chỉ tiền mặt không có QR; người ẩn danh hiện "Người hảo tâm" |

## 7. Dữ liệu mẫu Xuân Trạch

| Quỹ | Trạng thái | Điểm để kiểm |
|---|---|---|
| Quỹ thôn | Đang thu | Bắt buộc, 300.000 đ/hộ/năm, miễn hộ nghèo; nhiều khoản gắn mã hộ |
| Quỹ khuyến học | Đang thu | Vận động, tuỳ tâm |
| Quỹ Chuyển đổi số | Đang thu | Mục tiêu 168 triệu; tài khoản dùng chung |
| Ủng hộ Cây Xanh | Đang thu | Tự nguyện, mục tiêu 24 triệu, tài khoản riêng |
| Quỹ vận động Màn hình LED | Đang thu | Mục tiêu 100 triệu, chỉ chuyển khoản |
| Quỹ Ngày hội Đại đoàn kết 2026 | Đang thu | Quỹ thật (DDK26) |
| Quỹ Trung thu 2026 | Ngừng thu | Đã tất toán |
| Quỹ quốc phòng – an ninh 2026 | Ngừng thu | Có khoản chi sau ngày ngừng thu |
| Quỹ phòng chống thiên tai 2025 | Khoá sổ | Chỉ tiền mặt, có biên bản khoá sổ |

Lưu ý: tính năng "Của tôi" trên App (Tôi đã đóng / Cần đóng) cần trang Hành chính có số điện thoại của hộ; hiện dữ liệu hộ chưa có số điện thoại.
