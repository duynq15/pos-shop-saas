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

- **Chuông thông báo** (góc trên, mọi màn hình): gom cảnh báo hệ thống (webhook ngân hàng im lặng, tiền vào lâu chưa phân loại, giao dịch trùng) và tin của quỹ 14 ngày gần nhất. Cảnh báo nặng làm chuông đỏ. Bấm một tin để đi thẳng tới quỹ / việc liên quan; **Đã xem** xoá số chưa đọc. Không còn dải cảnh báo vàng ở đầu trang.
- **Cần xử lý** (nút trên cùng danh sách quỹ, có số việc): gom việc của cả thôn theo nhóm:
  - người duyệt: **Chờ bạn duyệt** (Duyệt / Từ chối / Xem chứng từ ngay tại chỗ), **Đề nghị mở khoá sổ chờ bạn ký**
  - thủ quỹ: **Phiếu nháp của bạn** (Sửa / Thêm ảnh / Gửi duyệt), **Tiền vào chưa rõ quỹ** (Ghi vào quỹ), **Bạn đã gửi, đang chờ duyệt**
  - mở Sổ quỹ lần đầu mà có việc thì vào thẳng màn này
- **Danh sách quỹ:** chia nhóm Đang thu / Ngừng thu / Khoá sổ (nhóm Khoá sổ thu gọn), ô tìm theo tên. Mỗi dòng có tên, tính chất, tồn quỹ, số ngày còn lại / quá hạn, thanh tiến độ nếu có mục tiêu, chấm cam nếu quỹ có việc chờ.
- **Đầu trang chi tiết:**
  - tên quỹ và các nhãn (trạng thái, loại, tính chất, công khai hay không)
  - nút theo vai trò: thủ quỹ thấy **+ Thu tiền**, **+ Lập phiếu chi**; người quản lý thấy **Sửa thông tin quỹ**; có **QR nhận tiền** khi quỹ nhận chuyển khoản; menu **Thêm** gồm Chia sẻ, Nhập Excel, Điều chỉnh, Tạo quỹ mới từ quỹ này
  - băng trạng thái (hạn thu, nút Ngừng thu / Mở thu lại / Khoá sổ)
  - dải vàng "Quỹ chưa có …, Bổ sung ngay" khi thiếu tài khoản, nội dung, hạn thu
  - dải "N việc cần xử lý ở quỹ này" mở Cần xử lý lọc theo quỹ
  - số liệu: **Tồn quỹ** (to), Thu tháng này, Chi tháng này; thanh tiến độ nếu quỹ có mục tiêu
- **Các tab:**
  - **Sổ thu chi** (mặc định với thủ quỹ): 3 tháng gần nhất, chia theo tháng kèm tổng Thu / Chi của tháng; tìm theo người nộp, nội dung, mã; lọc nhanh Tất cả / Thu / Chi / Chờ duyệt; **Xem thêm 3 tháng trước**; bấm dòng để xem chi tiết.
  - **Thông tin quỹ:** ba thẻ Thông tin chung / Nhận tiền / Nội dung chi tiết, mỗi thẻ có nút **Sửa**. Tài liệu đính kèm (xem, thêm, gỡ) nằm ngay trong thẻ Nội dung.
  - **Theo hộ:** từng hộ đã đóng bao nhiêu, còn thiếu, được miễn; lọc và tìm; đồng bộ danh sách hộ từ trang Hành chính.
  - **Báo cáo:** chọn nhanh Tháng này / Tháng trước / Quý này / Năm nay / Tuỳ chọn; báo cáo dạng sổ (Tồn đầu kỳ, Thu chuyển khoản, Thu tiền mặt, Chi, Điều chỉnh nếu có, Tồn cuối kỳ); Xuất Excel, In; **Đối soát sao kê ngân hàng** thu gọn, bấm để mở.
- **Form Thu tiền / Lập phiếu chi:** ô số tiền to và nút tiền nhanh (50k … 1tr); hình thức Tiền mặt / Chuyển khoản dạng nút bấm (chỉ hiện hình thức quỹ cho phép); ô **Hộ nộp** tìm theo tên chủ hộ hoặc mã hộ (khi thôn đã đồng bộ danh sách hộ); ngày thu mặc định hôm nay, bấm **Đổi ngày** để ghi lùi; **Ghi và thu tiếp** để nhập người sau mà không đóng form. Phiếu chi có nút **Chụp chứng từ** (mở camera sau trên điện thoại) và **Chọn ảnh có sẵn**; ảnh tự thu nhỏ trước khi gửi.
- Thôn chưa có quỹ: người quản lý thấy 4 bước **Bắt đầu dùng Sổ quỹ** (tài khoản, loại quỹ, tạo quỹ, công khai).
- Nút đầu trang (chỉ người có quyền quản lý quỹ): **Loại quỹ**, **Tài khoản nhận tiền**, **+ Tạo quỹ mới**.

Trên điện thoại: thanh cố định ở đáy với hai nút **+ Thu tiền** và **+ Phiếu chi**; form thu / chi trượt từ dưới lên, nút lưu luôn ở đáy.

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
| 8 | Thủ quỹ | **+ Thu tiền** 50.000, ô Hộ nộp gõ tên chủ hộ, chọn hộ › **Ghi và thu tiếp** | Tên người nộp tự điền; form trống lại để thu người sau; tồn quỹ tăng ngay; tab Theo hộ hiện hộ đã đóng |
| 9 | Thủ quỹ | **+ Lập phiếu chi** không ảnh › Lưu nháp | Mở Cần xử lý của quỹ: "Thiếu ảnh chứng từ", nút Gửi duyệt bị khoá; Thêm ảnh › **Chụp chứng từ** › Lưu và gửi duyệt thì vào nhóm "đang chờ duyệt" |
| 10 | Người duyệt chi | Đăng nhập › vào thẳng **Cần xử lý** › Duyệt / Từ chối (bắt buộc lý do) | Duyệt: trừ tồn quỹ, số việc giảm. Từ chối: thủ quỹ thấy lý do |
| 11 | Trưởng thôn | Ngừng thu › Mở thu lại (hạn mới, lý do) | Hiện "Đợt 2", nội dung CK có `-D2` |
| 12 | Trưởng ban kiểm tra | Ngừng thu › Khoá sổ (đính kèm biên bản) | Trạng thái Khoá sổ, không còn nút thu / chi / sửa |
| 13 | Trưởng ban kiểm tra + Người duyệt chi | Mở khoá sổ: gửi đề nghị, cả hai cùng duyệt | Quỹ về Ngừng thu, trang công khai hiện dòng "Đã mở khoá sổ…" |
| 14 | Trưởng thôn | **Tài khoản nhận tiền** › xoá tài khoản đang có quỹ dùng | Bị chặn, báo tên các quỹ đang dùng |
| 15 | Bất kỳ | Điện thoại (rộng 390px): danh sách › chọn quỹ › ← Danh sách quỹ | Không cuộn ngang; chuyển màn đúng; thanh Thu / Chi ở đáy |
| 16 | Người dân | Mở App Làng Số / trang công khai của thôn | Chỉ thấy quỹ bật công khai; quỹ Chỉ tiền mặt không có QR; người ẩn danh hiện "Người hảo tâm" |
| 17 | Bất kỳ | Bấm chuông › bấm một tin quỹ › **Đã xem** | Mở đúng quỹ; số chưa đọc về 0; cảnh báo webhook im lặng làm chuông đỏ |
| 18 | Thủ quỹ | Sổ thu chi › gõ tên người nộp, bấm Thu / Chi / Chờ duyệt, **Xem thêm 3 tháng trước** | Lọc ngay; tổng tháng không đổi theo bộ lọc; xem được tháng cũ |

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
