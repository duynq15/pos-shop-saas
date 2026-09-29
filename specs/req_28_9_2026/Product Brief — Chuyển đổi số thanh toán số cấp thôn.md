# Product Brief — Chuyển đổi số thanh toán số cấp thôn

Sep 27, 2026 · @Hiên

Hệ thống số hóa toàn bộ dòng tiền trong một thôn — mua bán của người dân, thu chi quỹ chung, công đức — và tự sinh báo cáo cho từng bên liên quan. Brief này chỉ dựa trên yêu cầu đầu vào; mọi điểm chưa có dữ liệu đều để mở.

Quy ước đọc:

- **\[NEED DECISION\]**: thông tin chưa xác định, cần anh/chị/ban lãnh đạo thôn chốt.
- **Đề xuất PM**: hướng đi PM gợi ý để có cái mà quyết, chưa phải thông tin đã xác nhận.
- **Cần xác minh pháp lý**: điểm chạm đến quy định thanh toán, thuế, hóa đơn, dữ liệu cá nhân — phải có người chuyên môn kiểm tra, brief không khẳng định.

## 1. Problem

Dòng tiền trong thôn đang phân tán, không ai có bức tranh tổng. Mỗi bên chỉ thấy phần của mình, và phần đó thường không có số liệu tự động.

| Bên liên quan | Vấn đề hiện tại (suy ra từ lợi ích mong muốn) |
| --- | --- |
| Người bán trong thôn | Không có thống kê doanh thu theo hạng mục; khó lên hộ kinh doanh; chưa xuất được hóa đơn |
| Thủ quỹ / kế toán thôn | Thu, chi quỹ và công đức phải tổng hợp tay |
| Ban lãnh đạo thôn | Không đo được mức độ chuyển đổi số: bao nhiêu người bán, bao nhiêu giao dịch, tổng tiền |
| Nhà cung cấp đối tác | Không có số liệu bán hàng theo hạng mục trong thôn; chưa có kênh gắn bó dài hạn |
| Người dân mua | Không biết một năm đã chi bao nhiêu, cho những gì |
| Thôn | Chưa có mô hình chuyển đổi số thanh toán để làm điểm sáng |
| SKHG | Chưa có giải pháp thanh toán cấp thôn đã kiểm chứng để nhân rộng |

Tư duy nền: coi thôn như một doanh nghiệp lớn, mọi giao dịch đều đi qua một hệ thống ghi nhận chung.

**Chưa có số liệu hiện trạng** \[NEED DECISION\]: quy mô thôn (số hộ, số người bán, số quỹ), tỷ lệ đang dùng tiền mặt / chuyển khoản, cách thủ quỹ đang ghi sổ. Không có các số này thì chưa đặt được mục tiêu đo lường.

## 2. Target Users

Sáu nhóm người dùng trực tiếp, cộng SKHG ở vai trò vận hành. Nhóm quyết định thành bại là người bán và thủ quỹ: họ tạo ra dữ liệu, các nhóm còn lại chỉ đọc báo cáo.

| Nhóm | Vai trò trong hệ thống | Cần gì | Thiết bị / năng lực số |
| --- | --- | --- | --- |
| Người bán trong thôn | Nhận tiền, tạo dữ liệu bán hàng | Thống kê doanh thu, hạng mục; lên hộ kinh doanh; hóa đơn tự động | \[NEED DECISION\] |
| Thủ quỹ / kế toán thôn | Ghi nhận thu chi quỹ, công đức | Báo cáo thu chi tự động | \[NEED DECISION\] |
| Ban lãnh đạo thôn | Xem tổng quan, truyền thông | Số người bán đã chuyển đổi, số giao dịch, tổng tiền | \[NEED DECISION\] |
| Nhà cung cấp đối tác | Cung cấp hàng cho người bán / người dân | Thống kê bán hàng theo hạng mục; quan hệ đối tác dài hạn | \[NEED DECISION\] |
| Người dân mua | Thanh toán, đóng góp | Thống kê chi tiêu cả năm theo hạng mục | \[NEED DECISION\] |
| Người đóng góp công đức | Ủng hộ chương trình chung | \[NEED DECISION\] — đầu vào chưa nêu lợi ích riêng | \[NEED DECISION\] |
| SKHG | Triển khai, vận hành, hoàn thiện sản phẩm | Mô hình chuẩn để nhân rộng | — |

&#91;NEED DECISION\] cho cả bảng:

- Nhà cung cấp là ai: nhà phân phối bán cho tiệm tạp hóa trong thôn, hay đơn vị bán trực tiếp cho dân?
- Người đóng góp công đức có bao gồm người ngoài thôn (con cháu xa quê) không?
- Người dân có bắt buộc dùng app, hay chỉ cần quét QR bằng app ngân hàng sẵn có?

## 3. User Stories

Story bám sát lợi ích trong đầu vào. Cột MVP là đề xuất PM, xem lý do ở mục 4.

| ID | Là… | Tôi muốn… | Để… | MVP? |
| --- | --- | --- | --- | --- |
| US-01 | Người bán | nhận tiền bằng mã QR gắn với tài khoản của tôi | khách chuyển khoản nhanh, không cần tiền mặt | Có |
| US-02 | Người bán | mỗi giao dịch được gắn hạng mục hàng | biết mình bán nhóm hàng nào nhiều | Có |
| US-03 | Người bán | xem báo cáo doanh thu theo ngày / tháng / hạng mục | nắm tình hình kinh doanh | Có |
| US-04 | Người bán | có sẵn dữ liệu doanh thu khi đăng ký hộ kinh doanh | nâng cấp dễ dàng | Sau |
| US-05 | Người bán | hóa đơn được xuất tự động | không phải làm tay | Sau |
| US-06 | Thủ quỹ | mọi khoản thu vào quỹ được ghi nhận tự động theo từng quỹ | không phải tổng hợp tay | Có |
| US-07 | Thủ quỹ | ghi nhận khoản chi kèm chứng từ | quỹ minh bạch | Có |
| US-08 | Thủ quỹ | xem báo cáo thu, chi, tồn quỹ theo kỳ | báo cáo với thôn | Có |
| US-09 | Người đóng góp | quét QR công đức cho một chương trình cụ thể | tiền đi đúng mục đích | Có |
| US-10 | Ban lãnh đạo | xem số người bán đã chuyển đổi, số giao dịch, tổng tiền | đo tiến độ và truyền thông | Có |
| US-11 | Nhà cung cấp | xem thống kê bán hàng theo hạng mục của mình trong thôn | lên kế hoạch cung ứng | Sau |
| US-12 | Người dân | xem tổng chi tiêu một năm theo hạng mục | quản lý chi tiêu gia đình | Sau |
| US-13 | SKHG | nhân bản cấu hình sang thôn khác | nhân rộng mô hình | Sau |

&#91;NEED DECISION\]: Công khai danh sách người công đức (tên, số tiền) cho cả thôn xem hay không? Đầu vào chưa nêu, nhưng quyết định này ảnh hưởng thiết kế màn hình và quyền riêng tư.

## 4. MVP

**Đề xuất PM:** MVP chỉ *ghi nhận và báo cáo* giao dịch, không giữ tiền. Tiền đi thẳng từ tài khoản ngân hàng người trả sang tài khoản người nhận qua QR chuyển khoản; hệ thống ghi nhận và phân loại. Lý do: tránh phải xin phép hoạt động trung gian thanh toán, và rút ngắn thời gian triển khai.

Mục tiêu MVP: chứng minh được ở một thôn thí điểm rằng người bán và thủ quỹ dùng thật hằng ngày. Chỉ tiêu cụ thể \[NEED DECISION\].

**Phạm vi MVP:**

1. Đăng ký người dùng theo vai trò: người bán, thủ quỹ, ban lãnh đạo.
2. QR nhận tiền cho từng người bán và từng quỹ / chương trình công đức.
3. Ghi nhận giao dịch vào hệ thống. Cách ghi nhận \[NEED DECISION\]:
   - A. Tự động qua kết nối ngân hàng / đối tác thanh toán — chính xác nhưng phụ thuộc đối tác.
   - B. Người bán, thủ quỹ xác nhận thủ công khi nhận tiền — làm được ngay nhưng dễ thiếu sót.
4. Gắn hạng mục cho giao dịch bán hàng; danh mục hạng mục do thôn/SKHG định nghĩa sẵn.
5. Sổ quỹ: thu, chi (kèm ảnh chứng từ), tồn quỹ theo từng quỹ.
6. Báo cáo:
   - Người bán: doanh thu theo kỳ và hạng mục.
   - Thủ quỹ: thu, chi, tồn theo quỹ và kỳ.
   - Ban lãnh đạo: số người bán đã chuyển đổi, tổng số giao dịch, tổng số tiền.
7. Nền tảng triển khai: app di động, web hay tích hợp vào sản phẩm sẵn có của SKHG \[NEED DECISION\].

**Thứ tự ưu tiên nếu phải cắt tiếp:** giữ quỹ và công đức trước (thủ quỹ là một người, dễ đào tạo, lợi ích rõ), người bán sau.

## 5. Out of Scope

Các mục dưới đây nằm ngoài MVP; đa số vẫn là mục tiêu dài hạn trong đầu vào, chỉ lùi sang giai đoạn sau.

| Hạng mục | Lý do để ngoài MVP |
| --- | --- |
| Giữ tiền, ví điện tử, trung gian thanh toán | Cần giấy phép; rủi ro pháp lý lớn (cần xác minh pháp lý) |
| Xuất hóa đơn điện tử tự động | Phụ thuộc đối tác hóa đơn và tình trạng thuế của từng người bán |
| Hỗ trợ thủ tục lên hộ kinh doanh | Cần quy trình với cơ quan đăng ký; MVP chỉ chuẩn bị dữ liệu doanh thu |
| Cổng cho nhà cung cấp đối tác | Chưa rõ nhà cung cấp là ai và dữ liệu nào được chia sẻ |
| Báo cáo chi tiêu cá nhân cho người dân | Cần định danh người mua; MVP ghi nhận theo người nhận tiền |
| Quản lý tồn kho, bán hàng (POS) của người bán | Không có trong đầu vào |
| Cho vay, tín dụng, chấm điểm | Không có trong đầu vào |
| Triển khai nhiều thôn cùng lúc | MVP chỉ chạy một thôn thí điểm |
| Thu thuế, phí thay cơ quan nhà nước | Không có trong đầu vào |

## 6. Business Rules

Các quy tắc có nền từ đầu vào hoặc là đề xuất PM; quy tắc nào chưa có căn cứ thì để \[NEED DECISION\].

| ID | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-01 | Mỗi giao dịch thuộc đúng một loại: mua bán, quỹ chung, công đức | Đầu vào |
| BR-02 | Tiền đi thẳng vào tài khoản người nhận; hệ thống không giữ tiền | Đề xuất PM |
| BR-03 | Mỗi giao dịch quỹ và công đức gắn với đúng một quỹ / chương trình | Đề xuất PM |
| BR-04 | Giao dịch đã ghi nhận không được xóa; sửa sai bằng bút toán điều chỉnh có lưu lịch sử | Đề xuất PM |
| BR-05 | Khoản chi quỹ phải có người lập và người duyệt khác nhau | Đề xuất PM; người duyệt \[NEED DECISION\] |
| BR-06 | Tài khoản nhận tiền quỹ là tài khoản của ai (thôn, cá nhân thủ quỹ, tổ chức khác) | \[NEED DECISION\] |
| BR-07 | Người bán được tính là "đã chuyển đổi số" khi nào (đăng ký xong, có giao dịch đầu tiên, hay đạt tần suất tối thiểu) | \[NEED DECISION\] |
| BR-08 | Người bán chỉ xem dữ liệu của mình; thủ quỹ chỉ xem quỹ được giao | Đề xuất PM |
| BR-09 | Ban lãnh đạo xem số liệu tổng hợp; xem chi tiết từng người bán hay không | \[NEED DECISION\] |
| BR-10 | Dữ liệu chia sẻ cho nhà cung cấp chỉ ở mức tổng hợp theo hạng mục, cần người bán đồng ý | Đề xuất PM; cần xác minh pháp lý |
| BR-11 | Danh mục hạng mục hàng dùng chung cả thôn, do ai quản lý | \[NEED DECISION\] |
| BR-12 | Kỳ báo cáo quỹ (tháng, quý, năm) và ngày chốt sổ | \[NEED DECISION\] |
| BR-13 | Giao dịch tiền mặt có được nhập vào hệ thống không | \[NEED DECISION\] |

## 7. Risks

Rủi ro lớn nhất không nằm ở công nghệ mà ở chỗ người bán có chịu minh bạch doanh thu hay không.

| Rủi ro | Tác động | Hướng giảm thiểu (đề xuất PM) |
| --- | --- | --- |
| Người bán ngại minh bạch doanh thu vì lo thuế | Tỷ lệ tham gia thấp, số liệu thiếu | Làm rõ ai được xem dữ liệu; truyền thông lợi ích trước; cần xác minh pháp lý về nghĩa vụ thuế |
| Pháp lý thanh toán: hệ thống bị xem là trung gian thanh toán | Phải dừng hoặc xin phép | Không giữ tiền (BR-02); cần xác minh pháp lý trước khi thiết kế |
| Dữ liệu cá nhân, giao dịch bị lộ hoặc dùng sai mục đích | Mất niềm tin, vi phạm quy định | Phân quyền chặt (BR-08, BR-09); cần xác minh pháp lý về bảo vệ dữ liệu cá nhân |
| Ghi nhận thủ công bị bỏ sót | Báo cáo sai, mất tin tưởng | Ưu tiên kết nối ngân hàng nếu khả thi; đối soát định kỳ |
| Phụ thuộc đối tác ngân hàng / thanh toán | Chậm tiến độ, phát sinh phí | Chốt đối tác sớm; có phương án B thủ công |
| Người cao tuổi, người ít dùng smartphone không tham gia | Thiếu dữ liệu, không phản ánh đúng "toàn thôn" | Quyết định cách xử lý tiền mặt (BR-13) |
| Minh bạch quỹ, công đức gây tranh cãi trong thôn | Xung đột nội bộ | Ban lãnh đạo chốt quy tắc công khai trước khi chạy |
| Nhà cung cấp tham gia vì mục đích quảng cáo, gây cảm giác thương mại hóa | Người dân phản ứng | Quy tắc lựa chọn và truyền thông đối tác do thôn quyết |
| Mô hình phụ thuộc cá nhân lãnh đạo thôn | Khó duy trì, khó nhân rộng | Tài liệu hóa quy trình; chuẩn hóa cấu hình để nhân bản |
| Chi phí vận hành, ai trả tiền chưa rõ | Không bền vững sau thí điểm | Chốt mô hình kinh doanh (xem mục 8) |

## 8. Câu hỏi cần trả lời trước khi bắt đầu

Nhóm A chặn thiết kế; chưa trả lời thì chưa nên viết SRS.

**A. Chặn thiết kế**

- [ ] Hệ thống không giữ tiền không, chỉ ghi nhận giao dịch chuyển khoản trực tiếp
- [ ] Giao dịch được ghi nhận bằng cách nào: kết nối ngân hàng / đối tác thanh toán, hay xác nhận thủ công? Nếu kết nối, đối tác nào?
- [ ] Tài khoản nhận tiền quỹ và công đức đứng tên ai?
- [ ] Thôn thí điểm là thôn nào; có bao nhiêu hộ, bao nhiêu người bán, bao nhiêu quỹ / chương trình công đức?
- [ ] Sản phẩm độc lập hay module của sản phẩm SKHG sẵn có (ví dụ Làng Văn Hiến)?
- [ ] Nền tảng: app di động, web, hay cả hai?

**B. Quy tắc nghiệp vụ**

- [ ] Định nghĩa "người bán đã chuyển đổi số"?
- [ ] Ai duyệt khoản chi quỹ?
- [ ] Công khai danh sách công đức đến mức nào?
- [ ] Ban lãnh đạo có xem chi tiết doanh thu từng người bán không?
- [ ] Có ghi nhận giao dịch tiền mặt không?
- [ ] Danh mục hạng mục hàng gồm những gì, ai quản lý?
- [ ] Kỳ báo cáo và ngày chốt sổ quỹ?

**C. Đối tác và người dân**

- [ ] Nhà cung cấp đối tác là ai; họ được xem dữ liệu gì; cam kết gì với thôn?
- [ ] Người dân có phải cài app để có báo cáo chi tiêu cá nhân không?
- [ ] Người đóng góp ngoài thôn có được tham gia không?

**D. Pháp lý (cần người chuyên môn)**

- [ ] Mô hình ghi nhận có phải xin phép hoạt động thanh toán không?
- [ ] Nghĩa vụ thuế, hóa đơn của người bán khi doanh thu được ghi nhận?
- [ ] Yêu cầu về bảo vệ dữ liệu cá nhân và sự đồng ý của người dùng?

**E. Kinh doanh và vận hành**

- [ ] Ai trả chi phí: thôn, người bán, nhà cung cấp, SKHG tài trợ giai đoạn thí điểm?
- [ ] Chỉ tiêu thành công của thí điểm (số người bán, số giao dịch, thời gian)?
- [ ] Thời hạn thí điểm và mốc ra mắt?
- [ ] Ai phía thôn là đầu mối; SKHG ai phụ trách triển khai, đào tạo, hỗ trợ?
- [ ] Điều kiện để nhân rộng sang thôn khác?
