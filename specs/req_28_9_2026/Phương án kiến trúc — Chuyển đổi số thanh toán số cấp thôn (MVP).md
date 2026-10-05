# Phương án kiến trúc — Chuyển đổi số thanh toán số cấp thôn (MVP)

Sep 28, 2026 · @Hiên

**Quyết định: chọn Phương án 3** — ứng dụng độc lập, ghi nhận tự động qua kết nối ngân hàng. Điều kiện đi kèm: chốt đối tác và xác minh pháp lý về quyền đọc giao dịch tài khoản trước khi ký hợp đồng.

Ba phương án dưới đây khác nhau ở hai quyết định SRS còn để mở: **FR-07** (ghi nhận giao dịch thủ công hay tự động) và **NFR-01** (hệ thống độc lập hay nằm trong sản phẩm SKHG sẵn có). Cả ba đều tuân thủ FR-05 / SEC-01: tiền đi thẳng vào tài khoản người nhận, hệ thống không giữ tiền.

|  | Nơi đặt hệ thống | Cách ghi nhận giao dịch (FR-07) |
| --- | --- | --- |
| PA1 | Ứng dụng độc lập | Thủ công (phương án B) |
| PA2 | Module trong Làng Văn Hiến | Thủ công trước, chừa cổng tích hợp |
| PA3 | Ứng dụng độc lập | Tự động qua ngân hàng / đối tác (phương án A) |

Đây là ba tổ hợp tiêu biểu, không phải toàn bộ khả năng: ví dụ Làng Văn Hiến + ghi nhận tự động cũng là một lựa chọn.

Nguyên tắc viết: công nghệ nêu ở mức loại, vì chưa có thông tin stack chuẩn của SKHG \[NEED DECISION\]. Chi phí chỉ so sánh tương đối và nêu các khoản phát sinh; con số cụ thể cần ước lượng hoặc báo giá riêng.

## Phương án 1 — Ứng dụng độc lập, ghi nhận thủ công

&#91;embedded content: PA1 · luồng tiền và luồng dữ liệu\]

Tiền không đi qua hệ thống. Người bán hoặc thủ quỹ thấy tiền vào qua thông báo ngân hàng, rồi mở ứng dụng xác nhận giao dịch và gắn hạng mục.

| Tiêu chí | Nội dung |
| --- | --- |
| Architecture | Một ứng dụng web chạy tốt trên điện thoại (PWA) + một backend nguyên khối (monolith) cung cấp REST API + một CSDL quan hệ + kho lưu ảnh chứng từ. QR nhận tiền tạo từ thông tin tài khoản của người bán / quỹ. Không kết nối ngân hàng. |
| Technology | QR chuyển khoản theo chuẩn VietQR (cần xác minh điều kiện sử dụng); framework web và CSDL theo stack SKHG đang dùng \[NEED DECISION\]; lưu trữ file cho ảnh chứng từ; hosting cloud cỡ nhỏ. |
| Advantages | Triển khai nhanh nhất; không phụ thuộc đối tác ngân hàng; không đụng quyền đọc tài khoản của người dân; ít rủi ro pháp lý thanh toán; đủ để kiểm chứng hành vi người bán và thủ quỹ ở thôn thí điểm. |
| Disadvantages | Số liệu phụ thuộc việc người nhận có xác nhận đủ không (ERR-01, ERR-02); US-06 "tự động" không đạt — phải viết lại story; số tiền do người nhận tự nhập, không kiểm chứng được; đối soát với sao kê làm tay; báo cáo cho ban lãnh đạo kém tin cậy hơn. |
| Cost | Thấp nhất trong ba phương án. Gồm công phát triển, hosting nhỏ, công đào tạo và hỗ trợ người bán. Không có phí đối tác. Con số cụ thể \[NEED DECISION\]. |
| Scalability | Về kỹ thuật, nhân sang thôn khác dễ nếu cấu hình theo thôn (NFR-05). Chất lượng dữ liệu thì không tự nhân rộng: mỗi thôn mới cần đào tạo lại thói quen xác nhận. |
| Complexity | Thấp: một ứng dụng, một CSDL, không tích hợp bên ngoài. |
| Security | Bề mặt tấn công nhỏ; hệ thống không cầm thông tin đăng nhập ngân hàng. Cần làm đủ SEC-02 (phân quyền), SEC-03 (xác thực), SEC-05 (nhật ký không sửa được). Rủi ro chính là nhập sai hoặc khai thiếu, không phải tấn công. |
| Khi nào nên sử dụng | Khi cần thí điểm nhanh để chứng minh người bán, thủ quỹ chịu dùng; chưa chốt được đối tác ngân hàng; ngân sách thấp; quy mô giao dịch ở thôn thí điểm đủ nhỏ để xác nhận tay. |

## Phương án 2 — Module trong nền tảng Làng Văn Hiến

&#91;embedded content: PA2 · module mới trong nền tảng sẵn có\]

Thanh toán số thành một module mới, dùng lại xác thực, người dùng và cấu hình theo thôn của Làng Văn Hiến. Đường nét đứt là phần chừa sẵn cho kết nối ngân hàng, chưa làm trong MVP.

| Tiêu chí | Nội dung |
| --- | --- |
| Architecture | Thêm module Thanh toán số vào backend REST API hiện có của Làng Văn Hiến; thêm màn hình vào web / app của nền tảng; dùng chung xác thực và CSDL. Ghi nhận thủ công như PA1, thiết kế sẵn một cổng để gắn ghi nhận tự động sau. Mô hình triển khai (mỗi thôn một bản clone hay dùng chung) \[NEED DECISION — cần xác nhận kiến trúc hiện tại\]. |
| Technology | Theo stack hiện tại của Làng Văn Hiến \[NEED DECISION\]; QR theo chuẩn VietQR; thêm kho lưu ảnh chứng từ nếu nền tảng chưa có. |
| Advantages | Không làm lại phần nền (đăng nhập, vai trò, cấu hình thôn); thôn đã dùng Làng Văn Hiến có sẵn người dùng; thanh toán gắn vào bộ giải pháp chuyển đổi số thôn, hợp với mục tiêu nhân rộng của SKHG; dễ truyền thông trên kênh sẵn có của thôn. |
| Disadvantages | Phụ thuộc kiến trúc và nợ kỹ thuật của Làng Văn Hiến; mỗi thay đổi cần kiểm thử hồi quy các module còn lại; thôn chưa dùng Làng Văn Hiến phải triển khai cả nền tảng; dữ liệu tài chính nằm chung hệ thống với nội dung công khai; nếu mỗi thôn một bản clone thì cập nhật module phải triển khai lại nhiều nơi. Vẫn mang nhược điểm ghi nhận tay của PA1 cho đến khi gắn cổng tự động. |
| Cost | Phát triển thấp đến trung bình vì dùng lại nền. Chi phí ẩn: kiểm thử hồi quy, nâng mức bảo mật cả nền tảng cho dữ liệu tài chính. Không có phí đối tác trong MVP. Con số cụ thể \[NEED DECISION\]. |
| Scalability | Đi theo khả năng mở rộng của Làng Văn Hiến. Nhân rộng nhanh ở thôn đã dùng nền tảng; chậm hơn ở thôn chưa dùng. |
| Complexity | Trung bình: code mới ít, nhưng phải hiểu và không phá các module hiện có. |
| Security | Phải tách quyền dữ liệu tài chính khỏi quyền quản trị nội dung (quản trị website không mặc nhiên thấy giao dịch); SEC-02, SEC-03, SEC-05 áp dụng trên nền tài khoản chung; mức bảo mật hiện tại của nền tảng cần được đánh giá trước \[NEED DECISION\]. |
| Khi nào nên sử dụng | Khi thôn thí điểm đã hoặc sẽ dùng Làng Văn Hiến; khi SKHG muốn bán thanh toán số như một phần của bộ giải pháp làng; khi kiến trúc hiện tại của nền tảng cho phép thêm module mà không phải sửa lớn. |

## Phương án 3 — Ứng dụng độc lập, ghi nhận tự động qua kết nối ngân hàng

&#91;embedded content: PA3 · ghi nhận tự động qua kết nối ngân hàng\]

QR động mang mã tham chiếu của người bán hoặc quỹ. Khi tiền vào, ngân hàng hoặc đối tác báo về hệ thống, hệ thống khớp mã và ghi sổ. Giao dịch không khớp được mã rơi vào ERR-03 và cần người phân loại.

| Tiêu chí | Nội dung |
| --- | --- |
| Architecture | Backend có lớp tích hợp nhận thông báo biến động số dư (webhook), hàng đợi xử lý, bộ khớp giao dịch theo mã trên QR, module đối soát với sao kê, CSDL giao dịch; web / app cho ba vai trò. |
| Technology | Hoặc API ngân hàng (Open API), hoặc dịch vụ bên thứ ba đồng bộ giao dịch ngân hàng qua webhook — cần khảo sát nhà cung cấp \[NEED DECISION\]; QR động theo chuẩn VietQR có nội dung chuyển khoản; hàng đợi tin nhắn; framework và CSDL theo stack SKHG \[NEED DECISION\]. |
| Advantages | Đạt đúng US-06 "tự động"; số tiền lấy từ ngân hàng nên tin cậy; người bán không phải thao tác thêm; đối soát tự động giảm ERR-01, ERR-02; số liệu cho ban lãnh đạo đủ để truyền thông và làm mô hình nhân rộng. |
| Disadvantages | Phụ thuộc đối tác (hợp đồng, thủ tục, phí, thay đổi API); người bán có thể dùng nhiều ngân hàng khác nhau — hoặc tích hợp nhiều nơi, hoặc yêu cầu dùng ngân hàng chỉ định; cần quyền đọc giao dịch tài khoản cá nhân, vướng vấn đề đồng ý và pháp lý; người trả sửa nội dung chuyển khoản thì không khớp được; thời gian triển khai dài nhất. |
| Cost | Cao nhất trong ba phương án. Gồm công phát triển lớp tích hợp và đối soát, phí đối tác (cần báo giá), vận hành hệ thống nhận webhook liên tục, giám sát lỗi tích hợp. Con số cụ thể \[NEED DECISION\]. |
| Scalability | Tốt nhất về chất lượng dữ liệu: thôn mới không cần đào tạo thói quen xác nhận. Hàng đợi chịu được lượng giao dịch tăng. Giới hạn nằm ở số ngân hàng / đối tác tích hợp được. |
| Complexity | Cao: tích hợp bên ngoài, xử lý bất đồng bộ, khớp giao dịch, đối soát, xử lý gián đoạn kết nối (ERR-10). |
| Security | Nhận dữ liệu tài chính từ bên ngoài: phải xác thực nguồn webhook, chống giả mạo thông báo, bảo vệ khóa / token API. Quyền đọc giao dịch tài khoản cá nhân là rủi ro lớn nhất — chỉ lấy dữ liệu cần cho FR-06; SEC-06 cần xác minh pháp lý trước khi ký với đối tác. |
| Khi nào nên sử dụng | Khi đã chốt được đối tác và xác minh xong pháp lý; người bán, thôn chấp nhận điều kiện tài khoản của đối tác; số liệu chính xác là điều kiện bắt buộc cho truyền thông hoặc nhân rộng; có ngân sách và thời gian cho tích hợp. |

## So sánh ba phương án

Không phương án nào thắng ở mọi tiêu chí: PA1 rẻ và nhanh nhưng số liệu yếu, PA3 số liệu mạnh nhưng đắt và phụ thuộc đối tác, PA2 phụ thuộc vào việc thôn có dùng Làng Văn Hiến hay không.

| Tiêu chí | PA1 — Độc lập, thủ công | PA2 — Module Làng Văn Hiến | PA3 — Độc lập, tự động |
| --- | --- | --- | --- |
| Đáp ứng FR-07 | Phương án B | B trước, chừa đường cho A | Phương án A |
| Đáp ứng US-06 "tự động" | Không | Chưa, đến khi gắn cổng | Có |
| Độ tin cậy số liệu | Thấp nhất | Như PA1 trong MVP | Cao nhất |
| Chi phí (tương đối) | Thấp | Thấp – trung bình | Cao |
| Thời gian ra MVP (tương đối) | Nhanh nhất | Phụ thuộc kiến trúc hiện tại | Chậm nhất |
| Độ phức tạp | Thấp | Trung bình | Cao |
| Phụ thuộc bên ngoài | Không | Nền tảng Làng Văn Hiến | Ngân hàng / đối tác |
| Rủi ro pháp lý chính | Thấp | Thấp | Quyền đọc giao dịch tài khoản cá nhân |
| Nhân rộng | Dễ về kỹ thuật, cần đào tạo lại | Nhanh ở thôn đã dùng nền tảng | Tốt, giới hạn bởi số ngân hàng tích hợp |

Các ô "tương đối" chỉ so ba phương án với nhau, chưa có ước lượng công hay báo giá.

## Thông tin cần có để chọn phương án

Bốn câu trả lời đầu gần như tự loại được phương án; các câu còn lại dùng để ước lượng chi phí.

- [ ] Thôn thí điểm đã hoặc sẽ dùng Làng Văn Hiến chưa? (loại hoặc giữ PA2)
- [ ] Có đối tác ngân hàng / dịch vụ đồng bộ giao dịch nào sẵn sàng hợp tác, và pháp lý có cho phép đọc giao dịch tài khoản của người bán không? (loại hoặc giữ PA3)
- [ ] Người bán trong thôn đang dùng bao nhiêu ngân hàng khác nhau? Có chấp nhận mở tài khoản ở ngân hàng chỉ định không?
- [ ] Số liệu chính xác có phải điều kiện bắt buộc ngay từ thí điểm, hay chấp nhận xác nhận tay giai đoạn đầu?
- [ ] Kiến trúc hiện tại của Làng Văn Hiến: stack, mô hình triển khai theo thôn, mức bảo mật hiện có.
- [ ] Stack công nghệ chuẩn của SKHG cho sản phẩm mới.
- [ ] Ngân sách và mốc thời gian của giai đoạn thí điểm.
- [ ] Quy mô giao dịch dự kiến ở thôn thí điểm (để biết xác nhận tay có khả thi không).
