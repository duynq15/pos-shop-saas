# SRS — Chuyển đổi số thanh toán số cấp thôn (MVP)

Sep 27, 2026 · @Hiên

SRS này chỉ phủ phạm vi MVP trong Product Brief: ghi nhận và báo cáo giao dịch của người bán, quỹ chung, công đức tại một thôn thí điểm. Mọi requirement đều truy vết về một mục trong Brief; mục nào Brief chưa có căn cứ thì không viết thành requirement mà đưa vào mục 8.

- **Nguồn:** Product Brief — Chuyển đổi số thanh toán số cấp thôn (bản hiện tại). Quyết định đã chốt trong Brief: hệ thống **không giữ tiền**, chỉ ghi nhận giao dịch chuyển khoản trực tiếp.
- **Ngoài phạm vi SRS:** các story "Sau" trong Brief (US-04, 05, 11, 12, 13) và toàn bộ mục Out of Scope.
- **Quy ước ID:** FR (chức năng), NFR (phi chức năng), US (user story — giữ nguyên ID của Brief), AC (tiêu chí nghiệm thu, dạng AC-\<số US>-\<thứ tự>), BR (quy tắc — giữ nguyên ID của Brief), ERR (lỗi), SEC (bảo mật).
- **Trạng thái:** *Chốt* = đã quyết trong Brief; *Đề xuất* = đề xuất PM trong Brief, chờ xác nhận; **\[NEED DECISION\]** = chưa xác định, chưa thể thiết kế chi tiết.

## 1. Functional Requirements

18 requirement, chia theo 6 nhóm của phạm vi MVP trong Brief (mục 4). Cột "Căn cứ" trỏ về mục Brief tương ứng.

| ID | Nhóm | Requirement | Căn cứ | Trạng thái |
| --- | --- | --- | --- | --- |
| FR-01 | Người dùng | Hệ thống cho phép đăng ký người dùng với một trong ba vai trò: người bán, thủ quỹ, ban lãnh đạo | MVP-1 | Chốt phạm vi; cách đăng ký, xác thực \[NEED DECISION\] |
| FR-02 | Người dùng | Hệ thống giới hạn dữ liệu và chức năng theo vai trò: người bán chỉ thấy dữ liệu của mình, thủ quỹ chỉ thấy quỹ được giao | BR-08 | Đề xuất |
| FR-03 | QR | Hệ thống tạo và hiển thị mã QR nhận tiền cho từng người bán, gắn với tài khoản ngân hàng của người bán đó | MVP-2, US-01 | Chốt |
| FR-04 | QR | Hệ thống cho phép tạo quỹ / chương trình công đức; mỗi quỹ / chương trình có một QR nhận tiền riêng | MVP-2, US-09, BR-03 | Chốt; ai được tạo quỹ \[NEED DECISION\] |
| FR-05 | Ghi nhận | Tiền đi thẳng vào tài khoản người nhận; hệ thống không giữ tiền và không thực hiện lệnh chuyển tiền | BR-02 | Chốt |
| FR-06 | Ghi nhận | Hệ thống ghi nhận mỗi giao dịch với tối thiểu: thời điểm, số tiền, người / quỹ nhận, loại giao dịch | MVP-3 | Chốt; danh sách trường đầy đủ \[NEED DECISION\] |
| FR-07 | Ghi nhận | Cơ chế đưa giao dịch vào hệ thống: tự động qua kết nối ngân hàng / đối tác thanh toán (phương án A, theo Phương án kiến trúc 3) | MVP-3 | Chốt; đối tác cụ thể \[NEED DECISION\] |
| FR-08 | Ghi nhận | Mỗi giao dịch được phân vào đúng một loại: mua bán, quỹ chung, công đức | BR-01 | Chốt |
| FR-09 | Ghi nhận | Giao dịch đã ghi nhận không xóa được; sửa sai bằng bút toán điều chỉnh, lưu lịch sử | BR-04 | Đề xuất |
| FR-10 | Hạng mục | Hệ thống quản lý danh mục hạng mục hàng dùng chung cho cả thôn | MVP-4, BR-11 | Chốt; người quản lý danh mục \[NEED DECISION\] |
| FR-11 | Hạng mục | Người bán gắn hạng mục cho giao dịch bán hàng | MVP-4, US-02 | Chốt; một hay nhiều hạng mục / giao dịch \[NEED DECISION\] |
| FR-12 | Sổ quỹ | Khoản thu vào quỹ / chương trình được ghi nhận theo đúng quỹ nhận | MVP-5, US-06 | Chốt |
| FR-13 | Sổ quỹ | Thủ quỹ lập khoản chi của quỹ, kèm ảnh chứng từ | MVP-5, US-07 | Chốt |
| FR-14 | Sổ quỹ | Khoản chi phải được một người khác người lập duyệt trước khi ghi sổ | BR-05 | Đề xuất; vai trò người duyệt \[NEED DECISION\] |
| FR-15 | Sổ quỹ | Hệ thống tính tồn quỹ theo từng quỹ | MVP-5 | Chốt |
| FR-16 | Báo cáo | Báo cáo người bán: doanh thu theo ngày, tháng và theo hạng mục | MVP-6, US-03 | Chốt |
| FR-17 | Báo cáo | Báo cáo thủ quỹ: thu, chi, tồn theo từng quỹ và theo kỳ | MVP-6, US-08, BR-12 | Chốt; kỳ báo cáo, ngày chốt sổ \[NEED DECISION\] |
| FR-18 | Báo cáo | Báo cáo ban lãnh đạo: số người bán đã chuyển đổi số, tổng số giao dịch, tổng số tiền | MVP-6, US-10, BR-07, BR-09 | Chốt; định nghĩa "đã chuyển đổi" và mức chi tiết được xem \[NEED DECISION\] |

Requirement có điều kiện, chỉ áp dụng nếu thôn chọn: ghi nhận giao dịch tiền mặt (BR-13) \[NEED DECISION\] — chưa cấp ID cho đến khi có quyết định.

## 2. Non-functional Requirements

Brief có rất ít căn cứ phi chức năng, nên chỉ có 5 NFR. Hiệu năng, độ sẵn sàng, số người dùng đồng thời, thời gian lưu trữ chưa có căn cứ — đưa vào mục 8, không đặt số.

| ID | Loại | Requirement | Căn cứ | Trạng thái |
| --- | --- | --- | --- | --- |
| NFR-01 | Nền tảng | Hệ thống chạy trên nền tảng được chọn: app di động, web, hoặc tích hợp vào sản phẩm SKHG sẵn có | MVP-7 | \[NEED DECISION\] |
| NFR-02 | Khả dụng | Người bán và thủ quỹ thao tác được hằng ngày, kể cả người ít dùng smartphone | Mục tiêu MVP; Risk "người cao tuổi" | Chốt hướng; tiêu chí đo \[NEED DECISION\] |
| NFR-03 | Toàn vẹn dữ liệu | Số liệu trên hệ thống phải khớp với tiền thực nhận; có cơ chế đối soát định kỳ | Risk "ghi nhận bỏ sót" | Đề xuất; kỳ đối soát \[NEED DECISION\] |
| NFR-04 | Truy vết | Mọi tạo mới, điều chỉnh giao dịch và khoản chi đều lưu người thực hiện và thời điểm | BR-04, BR-05 | Đề xuất |
| NFR-05 | Nhân rộng | Danh mục, quỹ, vai trò được cấu hình theo thôn, không viết cứng cho thôn thí điểm | Risk "phụ thuộc cá nhân"; mục tiêu SKHG | Đề xuất; mức độ cần cho MVP \[NEED DECISION\] |

## 3. User Stories

8 story MVP, giữ nguyên ID và nội dung của Brief, thêm cột truy vết sang FR.

| ID | Là… | Tôi muốn… | Để… | FR liên quan |
| --- | --- | --- | --- | --- |
| US-01 | Người bán | nhận tiền bằng mã QR gắn với tài khoản của tôi | khách chuyển khoản nhanh, không cần tiền mặt | FR-01, FR-03, FR-05 |
| US-02 | Người bán | mỗi giao dịch được gắn hạng mục hàng | biết mình bán nhóm hàng nào nhiều | FR-10, FR-11 |
| US-03 | Người bán | xem báo cáo doanh thu theo ngày / tháng / hạng mục | nắm tình hình kinh doanh | FR-02, FR-16 |
| US-06 | Thủ quỹ | mọi khoản thu vào quỹ được ghi nhận tự động theo từng quỹ | không phải tổng hợp tay | FR-06, FR-07, FR-12 |
| US-07 | Thủ quỹ | ghi nhận khoản chi kèm chứng từ | quỹ minh bạch | FR-13, FR-14 |
| US-08 | Thủ quỹ | xem báo cáo thu, chi, tồn quỹ theo kỳ | báo cáo với thôn | FR-15, FR-17 |
| US-09 | Người đóng góp | quét QR công đức cho một chương trình cụ thể | tiền đi đúng mục đích | FR-04, FR-08 |
| US-10 | Ban lãnh đạo | xem số người bán đã chuyển đổi, số giao dịch, tổng tiền | đo tiến độ và truyền thông | FR-18 |

Lưu ý US-06: chữ "tự động" giữ nguyên vì FR-07 đã chốt ghi nhận tự động (phương án A).

## 4. Acceptance Criteria

Viết theo dạng Cho trước / Khi / Thì. Tiêu chí nào phụ thuộc quyết định chưa có thì ghi rõ, không đặt giá trị giả định.

| ID | Story | Cho trước | Khi | Thì |
| --- | --- | --- | --- | --- |
| AC-01-1 | US-01 | Người bán đã đăng ký và khai báo tài khoản ngân hàng | Người bán mở chức năng nhận tiền | Hệ thống hiển thị QR gắn với đúng tài khoản đó |
| AC-01-2 | US-01 | Khách quét QR của người bán | Khách chuyển khoản thành công | Tiền vào thẳng tài khoản người bán, không qua tài khoản trung gian |
| AC-01-3 | US-01 | Tiền đã vào tài khoản người bán | Giao dịch được đưa vào hệ thống theo FR-07 | Giao dịch xuất hiện trong danh sách của người bán, loại "mua bán". Thời gian tối đa để xuất hiện \[NEED DECISION\] |
| AC-02-1 | US-02 | Có giao dịch bán hàng đã ghi nhận | Người bán chọn hạng mục từ danh mục chung | Giao dịch lưu hạng mục đã chọn |
| AC-02-2 | US-02 | Danh mục hạng mục đã được thiết lập | Người bán gắn hạng mục | Chỉ chọn được hạng mục có trong danh mục; thêm hạng mục mới \[NEED DECISION\] |
| AC-03-1 | US-03 | Người bán có giao dịch trong kỳ | Người bán xem báo cáo theo ngày hoặc tháng | Tổng doanh thu bằng tổng số tiền các giao dịch mua bán của người đó trong kỳ |
| AC-03-2 | US-03 | Như trên | Người bán xem theo hạng mục | Doanh thu được chia theo từng hạng mục; tổng các hạng mục bằng tổng doanh thu |
| AC-03-3 | US-03 | Có hai người bán A, B | A xem báo cáo | A không thấy dữ liệu của B |
| AC-06-1 | US-06 | Quỹ X có QR riêng | Người dân chuyển tiền qua QR của quỹ X | Khoản thu được ghi vào quỹ X, không vào quỹ khác |
| AC-07-1 | US-07 | Thủ quỹ lập khoản chi | Thủ quỹ gửi khoản chi | Khoản chi phải có ít nhất một ảnh chứng từ |
| AC-07-2 | US-07 | Khoản chi đã gửi | Người duyệt (khác người lập) duyệt | Khoản chi được ghi sổ và trừ vào tồn quỹ |
| AC-08-1 | US-08 | Quỹ có thu, chi trong kỳ | Thủ quỹ xem báo cáo kỳ | Tồn cuối kỳ = tồn đầu kỳ + tổng thu − tổng chi đã duyệt |
| AC-09-1 | US-09 | Có nhiều chương trình công đức | Người đóng góp quét QR của chương trình Y | Khoản tiền được ghi nhận cho chương trình Y, loại "công đức" |
| AC-10-1 | US-10 | Có dữ liệu giao dịch trong thôn | Ban lãnh đạo xem báo cáo | Hiển thị số người bán đã chuyển đổi (theo BR-07), tổng số giao dịch, tổng số tiền; khớp tổng dữ liệu gốc |

AC-07-2 và AC-08-1 giả định khoản chi chỉ trừ tồn quỹ sau khi duyệt, theo BR-05 (Đề xuất). Nếu BR-05 không được chấp nhận, hai tiêu chí này phải sửa.

## 5. Business Rules

Giữ nguyên 13 quy tắc của Brief, cập nhật trạng thái theo quyết định mới nhất. BR-10 thuộc phần nhà cung cấp, nằm ngoài MVP.

| ID | Quy tắc | Trạng thái | Áp dụng cho |
| --- | --- | --- | --- |
| BR-01 | Mỗi giao dịch thuộc đúng một loại: mua bán, quỹ chung, công đức | Chốt | FR-08 |
| BR-02 | Tiền đi thẳng vào tài khoản người nhận; hệ thống không giữ tiền | Chốt | FR-05, SEC-01 |
| BR-03 | Mỗi giao dịch quỹ và công đức gắn với đúng một quỹ / chương trình | Đề xuất | FR-04, FR-12 |
| BR-04 | Giao dịch đã ghi nhận không được xóa; sửa sai bằng bút toán điều chỉnh có lưu lịch sử | Đề xuất | FR-09, NFR-04 |
| BR-05 | Khoản chi quỹ phải có người lập và người duyệt khác nhau | Đề xuất; người duyệt \[NEED DECISION\] | FR-14, SEC-04 |
| BR-06 | Tài khoản nhận tiền quỹ đứng tên ai (thôn, cá nhân thủ quỹ, tổ chức khác) | \[NEED DECISION\] | FR-04 |
| BR-07 | Điều kiện để người bán được tính là "đã chuyển đổi số" | \[NEED DECISION\] | FR-18 |
| BR-08 | Người bán chỉ xem dữ liệu của mình; thủ quỹ chỉ xem quỹ được giao | Đề xuất | FR-02, SEC-02 |
| BR-09 | Ban lãnh đạo xem số liệu tổng hợp; có xem chi tiết từng người bán không | \[NEED DECISION\] | FR-18, SEC-02 |
| BR-10 | Dữ liệu cho nhà cung cấp chỉ ở mức tổng hợp, cần người bán đồng ý | Ngoài MVP | — |
| BR-11 | Danh mục hạng mục hàng dùng chung cả thôn; ai quản lý | Chốt phần dùng chung; người quản lý \[NEED DECISION\] | FR-10 |
| BR-12 | Kỳ báo cáo quỹ và ngày chốt sổ | \[NEED DECISION\] | FR-17 |
| BR-13 | Có nhập giao dịch tiền mặt vào hệ thống không | \[NEED DECISION\] | Chưa cấp FR |

## 6. Error Cases

Mỗi lỗi suy ra trực tiếp từ một FR, BR hoặc rủi ro trong Brief. Nơi Brief chưa nói cách xử lý thì chỉ ghi yêu cầu tối thiểu và để \[NEED DECISION\].

| ID | Tình huống | Hành vi yêu cầu | Căn cứ |
| --- | --- | --- | --- |
| ERR-01 | Tiền đã vào tài khoản nhưng giao dịch không có trên hệ thống | Phát hiện được khi đối soát; cách bổ sung giao dịch \[NEED DECISION\] | NFR-03, Risk "bỏ sót" |
| ERR-02 | Một giao dịch bị ghi nhận hai lần | Không được tính trùng vào báo cáo; cách phát hiện \[NEED DECISION\] | NFR-03 |
| ERR-03 | Giao dịch không xác định được loại hoặc quỹ nhận | Hệ thống không tự gán; không đưa vào báo cáo cho đến khi được phân loại; người xử lý \[NEED DECISION\] | BR-01, BR-03 |
| ERR-04 | Giao dịch bán hàng chưa gắn hạng mục | Vẫn tính vào doanh thu tổng; hiển thị trong báo cáo hạng mục thế nào \[NEED DECISION\] | FR-11, FR-16 |
| ERR-05 | Khoản chi gửi đi không có ảnh chứng từ | Chặn gửi, báo thiếu chứng từ | FR-13, AC-07-1 |
| ERR-06 | Người lập khoản chi tự duyệt khoản chi của mình | Chặn, báo cần người duyệt khác | BR-05 |
| ERR-07 | Người dùng yêu cầu xóa giao dịch đã ghi nhận | Chặn xóa; chỉ cho tạo bút toán điều chỉnh | BR-04 |
| ERR-08 | Người dùng truy cập dữ liệu ngoài quyền | Từ chối truy cập | BR-08 |
| ERR-09 | Thông tin tài khoản ngân hàng khai báo không hợp lệ khi tạo QR | Không tạo QR; quy tắc kiểm tra \[NEED DECISION\] | FR-03 |
| ERR-10 | Kết nối ngân hàng / đối tác thanh toán bị gián đoạn | Áp dụng (FR-07 đã chốt phương án A); cách xử lý \[NEED DECISION\] | FR-07, Risk "phụ thuộc đối tác" |

## 7. Security Requirements

Sáu yêu cầu, bám vào các quy tắc phân quyền và rủi ro dữ liệu trong Brief. Biện pháp kỹ thuật cụ thể (mã hóa, nơi lưu trữ, thời hạn lưu) chưa có căn cứ, để mục 8.

| ID | Requirement | Căn cứ | Trạng thái |
| --- | --- | --- | --- |
| SEC-01 | Hệ thống không lưu tiền, không khởi tạo lệnh chuyển tiền thay người dùng | BR-02 | Chốt |
| SEC-02 | Kiểm soát truy cập theo vai trò: người bán, thủ quỹ, ban lãnh đạo chỉ thấy phạm vi dữ liệu được phép | BR-08, BR-09 | Đề xuất; phạm vi của ban lãnh đạo \[NEED DECISION\] |
| SEC-03 | Người dùng phải được xác thực trước khi truy cập dữ liệu | FR-01 | Chốt; phương thức xác thực \[NEED DECISION\] |
| SEC-04 | Tách quyền lập và duyệt khoản chi | BR-05 | Đề xuất |
| SEC-05 | Nhật ký thao tác trên giao dịch và khoản chi không sửa, không xóa được | BR-04, NFR-04 | Đề xuất |
| SEC-06 | Xử lý dữ liệu cá nhân và dữ liệu giao dịch tuân thủ quy định bảo vệ dữ liệu cá nhân, kể cả việc lấy sự đồng ý của người dùng | Risk "dữ liệu bị lộ"; câu hỏi D Brief | Cần xác minh pháp lý |

Công khai danh sách người công đức (tên, số tiền) ảnh hưởng trực tiếp đến SEC-02 và SEC-06 nhưng vẫn là \[NEED DECISION\] trong Brief.

## 8. Các điểm \[NEED DECISION\] chặn SRS

FR-07 là điểm chặn lớn nhất: nó quyết định US-06, AC-01-3, ERR-01, ERR-02, ERR-10 và gần như toàn bộ thiết kế kỹ thuật.

**Chặn thiết kế**

- [ ] FR-07: đã chốt ghi nhận tự động. Còn mở: ngân hàng / đối tác nào?
- [ ] NFR-01: app di động, web, hay module của sản phẩm SKHG sẵn có?
- [ ] BR-06: tài khoản nhận tiền quỹ và công đức đứng tên ai?
- [ ] BR-13: có ghi nhận giao dịch tiền mặt không?

**Chặn chi tiết requirement**

- [ ] FR-01, SEC-03: cách đăng ký và phương thức xác thực.
- [ ] FR-04: ai được tạo quỹ / chương trình công đức?
- [ ] FR-06: danh sách trường dữ liệu đầy đủ của một giao dịch.
- [ ] FR-10, BR-11: danh mục hạng mục gồm gì, ai quản lý, người bán có được thêm không?
- [ ] FR-11: một giao dịch gắn một hay nhiều hạng mục?
- [ ] FR-14, BR-05: ai duyệt khoản chi?
- [ ] FR-17, BR-12: kỳ báo cáo và ngày chốt sổ.
- [ ] FR-18, BR-07, BR-09: định nghĩa "đã chuyển đổi số"; ban lãnh đạo xem chi tiết đến đâu.
- [ ] Công khai danh sách công đức đến mức nào?
- [ ] Cách xử lý các lỗi ERR-01 đến ERR-04, ERR-09, ERR-10.

**Chưa có căn cứ nên chưa viết requirement**

- [ ] Hiệu năng, độ sẵn sàng, số người dùng đồng thời.
- [ ] Thời hạn lưu trữ dữ liệu, sao lưu, khôi phục.
- [ ] Biện pháp kỹ thuật bảo vệ dữ liệu (mã hóa, nơi lưu trữ).
- [ ] Tiêu chí đo khả dụng cho NFR-02 và thời gian tối đa ở AC-01-3.
- [ ] Khoản chi có được vượt tồn quỹ không?
- [ ] Thông báo cho người dùng (khi có tiền vào, khi khoản chi cần duyệt) — Brief chưa nhắc.
