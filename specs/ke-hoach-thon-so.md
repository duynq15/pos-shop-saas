# Kế hoạch — Cải tiến POS Shop thành nền tảng thanh toán số cấp thôn

Sep 29, 2026 · Nguồn: `specs/req_28_9_2026/` (Product Brief, SRS, Phương án kiến trúc, ADR-0001)

Mục tiêu: mở rộng POS Shop hiện tại để đáp ứng MVP "Chuyển đổi số thanh toán số cấp thôn", tận dụng phần VietQR (QR động, webhook, đối soát) đã chạy, thay vì viết ứng dụng độc lập từ đầu.

Quy ước: mọi hạng mục ghi ID requirement trong SRS. Kích thước công việc ghi tương đối (S / M / L), chưa phải ước lượng ngày công. Điểm chưa chốt ghi **[NEED DECISION]**.

---

## Giai đoạn 0 — Chốt quyết định (chưa code)

**Đã chốt ngày 2026-09-29.** Kết quả: `specs/quyet-dinh-gd0.md` và `specs/adr/0002-hien-thuc-pa3-bang-mo-rong-pos-shop.md`. Bảng dưới giữ lại để truy vết câu hỏi gốc.

| # | Việc | Liên quan | Ai quyết |
| --- | --- | --- | --- |
| 0.1 | Viết **ADR-0002**: "Hiện thực PA3 bằng cách mở rộng POS Shop", thay cho "ứng dụng độc lập" của ADR-0001 | ADR-0001, NFR-01 | Sếp |
| 0.2 | **Tắt chế độ "một tài khoản VietQR nhận tiền cho nhiều shop"** (commit `1fbb26e`, `89a840e`) đối với tenant thuộc thôn. Tiền phải vào thẳng tài khoản người bán / quỹ | BR-02, FR-05, SEC-01 | Bắt buộc |
| 0.3 | Chốt tài khoản nhận tiền quỹ / công đức đứng tên ai; tài khoản đó có đăng ký được với VietQR (MB / BIDV) không | BR-06, FR-04 | Thôn |
| 0.4 | Người bán dùng ngân hàng khác MB / BIDV thì xử lý thế nào (yêu cầu mở TK, hay chấp nhận ghi nhận thủ công) | ADR-0001, FR-07 | Sếp |
| 0.5 | Xác minh pháp lý: quyền nhận biến động số dư tài khoản cá nhân, sự đồng ý của người dùng | SEC-06 | Pháp chế |
| 0.6 | Ai duyệt khoản chi; khoản chi có được vượt tồn quỹ không | BR-05, FR-14 | Thôn |
| 0.7 | Định nghĩa "người bán đã chuyển đổi số"; ban lãnh đạo xem chi tiết từng người bán hay chỉ tổng hợp | BR-07, BR-09 | Sếp + thôn |
| 0.8 | Kỳ báo cáo và ngày chốt sổ quỹ; có công khai danh sách công đức không | BR-12, SEC-02 | Thôn |
| 0.9 | Mô hình dữ liệu: "thôn" hay "cộng đồng" tổng quát | NFR-05, US-13 | Dev + chủ dự án |

Đầu ra: ADR-0002 + danh sách câu trả lời, cập nhật vào SRS mục 8.

---

## Giai đoạn 1 — Nền "Cộng đồng" (NFR-05, FR-01, FR-02)

Hiện tại chỉ có hai cấp: nền tảng → cửa hàng. Cần thêm cấp cộng đồng ở giữa. Thôn là một loại cộng đồng (`type='village'`); sau này thêm tổ dân phố, giáo xứ, chùa, chợ, hội nhóm mà không đổi schema (quyết định 0.9). Giao diện hiện nhãn theo `type` ("Thôn" với thôn thí điểm).

| # | Việc | Chi tiết | Cỡ |
| --- | --- | --- | --- |
| 1.1 | Bảng `communities` trong `control.db` | mã, tên, `type` (MVP chỉ `village`), địa bàn, trạng thái | S |
| 1.2 | Gắn `tenants.community_id` và `tenants.kind` | `kind`: `shop` (POS đầy đủ), `seller` (người bán nhỏ), `community` (tenant chứa sổ quỹ của cộng đồng). Mỗi tenant thuộc tối đa một cộng đồng | S |
| 1.3 | Vai trò mới trong `src/lib/rbac.js` | `treasurer` (thủ quỹ), `approver` (trưởng thôn / người được ủy quyền: duyệt chi, tạo quỹ, quản lý danh mục hạng mục), `community_leader` (ban lãnh đạo) + nhóm quyền `fund.*`, `community.report`, `community.categories` | M |
| 1.4 | Phạm vi truy cập theo cộng đồng | `community_leader` chỉ đọc số liệu **tổng hợp** của tenant cùng `community_id`, không xem doanh thu từng người bán (BR-09); không dùng quyền `root` | M |
| 1.5 | Màn hình quản trị cộng đồng cho `root` | tạo cộng đồng, gán cửa hàng / người bán vào cộng đồng, tạo tài khoản ban lãnh đạo, thủ quỹ | M |

Kiểm thử: AC-03-3 (người bán A không thấy dữ liệu B), ERR-08 (truy cập ngoài quyền bị chặn).

---

## Giai đoạn 2 — Sổ quỹ và công đức (FR-04, FR-12 → FR-15, FR-17)

Ưu tiên cao nhất theo Brief: thủ quỹ là một người, dễ đào tạo, lợi ích rõ. Dữ liệu nằm trong DB của tenant `kind=community`.

| # | Việc | Chi tiết | Cỡ |
| --- | --- | --- | --- |
| 2.1 | Bảng `funds` | quỹ chung / chương trình công đức, tài khoản nhận, người phụ trách, trạng thái | S |
| 2.2 | Bảng `fund_entries` | thu / chi / điều chỉnh; số tiền; nguồn (`vietqr`, `manual` cho ngân hàng ngoài MB / BIDV, `cash` theo FR-19); tham chiếu giao dịch ngân hàng; người lập, người duyệt, thời điểm; cờ `an_danh` (FR-20) | M |
| 2.3 | QR riêng cho từng quỹ | tái dùng `generateQR`, `orderId` mang tiền tố quỹ; hỗ trợ QR tĩnh để in dán | M |
| 2.4 | Định tuyến webhook về quỹ | mở rộng `/bank/api/transaction-sync`: khớp theo số tài khoản quỹ hoặc `orderId` → ghi `fund_entries` loại thu | M |
| 2.5 | Lập khoản chi kèm ảnh chứng từ | thêm lưu file (`data/tenants/<mã>/attachments/`), giới hạn loại / dung lượng file | M |
| 2.6 | Luồng duyệt chi | trạng thái `draft → submitted → approved / rejected`; chỉ trừ tồn quỹ khi `approved`; chặn duyệt khi khoản chi vượt tồn quỹ | M |
| 2.7 | Tồn quỹ và báo cáo kỳ | kỳ tự chọn, không chốt sổ (BR-12); tồn đầu kỳ + thu − chi đã duyệt = tồn cuối kỳ; tách thu chuyển khoản / tiền mặt; xuất Excel / PDF (tái dùng `xlsx.js`, `pdf.js`) | M |
| 2.8 | Màn hình thủ quỹ | danh sách quỹ, QR, sổ thu chi, nhập thu tiền mặt (FR-19), khoản chờ duyệt, báo cáo | L |
| 2.9 | Danh sách công đức công khai | tên + số tiền theo chương trình; dòng `an_danh` hiện "Người hảo tâm"; ẩn / hiện ghi nhật ký (FR-20). Chỉ bật công khai khi pháp chế xác nhận | S |

Kiểm thử: AC-06-1, AC-07-1, AC-07-2, AC-08-1, AC-09-1, ERR-05 (thiếu chứng từ), ERR-06 (tự duyệt), chi vượt tồn bị chặn, FR-19, FR-20.

---

## Giai đoạn 3 — Phân loại giao dịch và bất biến (FR-08, FR-09, SEC-05, ERR-01 → ERR-03)

**Đã làm (SKHGDT-3238, 2026-10-02).** Thiết kế và quyết định: `specs/adr/0005-doi-soat-va-bat-bien-giao-dich.md`. Thêm 3.0 vá token webhook chéo tenant, phát hiện khi rà soát GĐ2.

| # | Việc | Chi tiết | Cỡ |
| --- | --- | --- | --- |
| 3.1 | Trường `category` cho giao dịch | `sale` / `fund` / `donation`; suy ra từ tenant và quỹ nhận; không tự gán khi không chắc | S |
| 3.2 | Hàng chờ phân loại (ERR-03) | giao dịch chưa khớp không vào báo cáo cho đến khi có người phân loại (thủ quỹ với tài khoản quỹ, người bán với tài khoản của mình); cảnh báo khi tồn quá 3 ngày | M |
| 3.3 | Bút toán điều chỉnh | không cho sửa / xóa giao dịch và `fund_entries`; sửa sai bằng bút toán đảo có lý do | M |
| 3.4 | Nhật ký không sửa được | trigger SQLite chặn `UPDATE` / `DELETE` trên `audit_logs`, `vietqr_transactions`, `fund_entries` | S |
| 3.5 | Chống ghi trùng (ERR-02) | ràng buộc duy nhất theo `transactionid` ngân hàng; webhook lặp lại trả OK nhưng không ghi thêm | S |
| 3.6 | Đối soát định kỳ (ERR-01, NFR-03) | tự kiểm mỗi đêm (chưa phân loại > 3 ngày, trùng mã, > 24 giờ không có webhook); thủ quỹ đối soát sao kê hằng tháng; mở rộng báo cáo đối soát hiện có sang quỹ (Đề xuất) | M |
| 3.7 | Theo dõi độ trễ (AC-01-3) | lưu thời điểm ngân hàng và thời điểm ghi nhận; mục tiêu 95% trong 1 phút; quá 15 phút báo sự cố (ERR-10) (Đề xuất) | S |

Kiểm thử: ERR-02, ERR-03, ERR-07.

---

## Giai đoạn 4 — Chế độ người bán nhỏ (FR-03, FR-11, FR-16, NFR-02)

POS hiện tại theo hóa đơn / sản phẩm / tồn kho, quá nặng với hàng quán trong thôn.

| # | Việc | Chi tiết | Cỡ |
| --- | --- | --- | --- |
| 4.1 | Màn hình "Nhận tiền nhanh" | nhập số tiền → chọn hạng mục → hiện QR; báo "đã nhận tiền" khi webhook về | M |
| 4.2 | QR tĩnh của người bán | in dán quầy; giao dịch về được gắn hạng mục sau (FR-11) | S |
| 4.3 | Danh mục hạng mục dùng chung của cộng đồng | trưởng thôn quản lý ở cấp cộng đồng, đồng bộ xuống tenant người bán; người bán chỉ chọn, không thêm (BR-11) | M |
| 4.4 | Giao diện tối giản cho điện thoại | chữ to, ít bước; cài như PWA | M |
| 4.5 | Báo cáo người bán | doanh thu theo ngày / tháng / hạng mục; dòng "Chưa gắn hạng mục" (ERR-04) | S |

Kiểm thử: AC-01-1, AC-01-3, AC-02-1, AC-02-2, AC-03-1, AC-03-2, ERR-04, ERR-09.

---

## Giai đoạn 5 — Báo cáo ban lãnh đạo (FR-18)

| # | Việc | Chi tiết | Cỡ |
| --- | --- | --- | --- |
| 5.1 | Tổng hợp theo cộng đồng | số người bán đã chuyển đổi (có giao dịch đầu tiên, BR-07), tổng số giao dịch, tổng tiền; tách theo loại mua bán / quỹ / công đức | M |
| 5.2 | Mức chi tiết theo BR-09 | chỉ tổng hợp; API không trả doanh thu từng người bán cho `community_leader`, có test | S |
| 5.3 | Trang công khai cho truyền thông | tái dùng link báo cáo công khai theo token; chỉ số liệu tổng hợp | S |

Kiểm thử: AC-10-1.

---

## Giai đoạn 6 — Thí điểm

| # | Việc |
| --- | --- |
| 6.1 | Dựng dữ liệu thôn thí điểm: người bán, quỹ, chương trình công đức, danh mục hạng mục |
| 6.2 | Đăng ký tài khoản nhận với VietQR cho từng người bán và quỹ |
| 6.3 | Đào tạo thủ quỹ trước, người bán sau |
| 6.4 | Chạy đối soát định kỳ, ghi nhận lỗi thực tế |
| 6.5 | Đo chỉ tiêu thành công theo `quyet-dinh-gd0.md` mục 4 (Đề xuất: 3 tháng, ≥ 50% người bán chuyển đổi, ≥ 30% dùng đều) |

---

## Thứ tự và phụ thuộc

```
GĐ0 (quyết định)
  └─ GĐ1 (nền thôn, vai trò)
       ├─ GĐ2 (sổ quỹ, công đức)  ← làm trước, ra được giá trị sớm
       │    └─ GĐ3 (phân loại, bất biến, đối soát)
       ├─ GĐ4 (người bán nhỏ)     ← song song với GĐ3 nếu đủ người
       └─ GĐ5 (báo cáo ban lãnh đạo) ← cần dữ liệu từ GĐ2 và GĐ4
            └─ GĐ6 (thí điểm)
```

Mốc đề xuất: sau GĐ1 + GĐ2 có thể cho thủ quỹ dùng thử sớm, trước khi làm phần người bán.

## Rủi ro chính

| Rủi ro | Hướng xử lý |
| --- | --- |
| Chế độ tài khoản chung bị bật cho tenant thuộc cộng đồng, khiến hệ thống thành trung gian thanh toán | GĐ0.2: chặn ở mức code, có test |
| VietQR chỉ hỗ trợ MB / BIDV, người bán dùng ngân hàng khác | GĐ0.4: chốt chính sách trước khi thí điểm |
| Pháp lý chưa xong khi đã code xong | Code GĐ1–GĐ3 không phụ thuộc pháp lý; chỉ bật webhook thật cho tài khoản cá nhân khi 0.5 xong |
| Thêm cấp cộng đồng làm hỏng tính năng POS hiện có | Chạy lại toàn bộ `npm test` sau mỗi giai đoạn; tenant `kind=shop` giữ nguyên hành vi |
| Người bán ngại minh bạch doanh thu | Quyết định 0.7 (BR-09) và truyền thông trước khi thí điểm |

## Việc đầu tiên nên làm

1. Gửi sếp ADR-0002 để duyệt; gửi pháp chế danh sách `quyet-dinh-gd0.md` mục 5.
2. Làm GĐ0.2 (chặn tài khoản chung cho tenant thuộc cộng đồng) cùng GĐ1.1–1.2 (bảng `communities`, `tenants.community_id`, `tenants.kind`), vì cần có hai cột này mới chặn được.
