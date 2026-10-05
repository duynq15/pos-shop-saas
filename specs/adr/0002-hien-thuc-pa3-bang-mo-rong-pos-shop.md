# ADR-0002: Hiện thực PA3 bằng cách mở rộng POS Shop, không viết ứng dụng độc lập

- **Trạng thái:** Proposed — chờ sếp duyệt
- **Ngày:** 2026-09-29
- **Liên quan:** ADR-0001, NFR-01, NFR-05, US-13, FR-03, FR-04, FR-05, FR-07, BR-02, SEC-01, SEC-06
- **Thay thế một phần:** ADR-0001, chỉ ở ý "ứng dụng độc lập". Quyết định chọn PA3 và FR-07 phương án A (ghi nhận tự động) giữ nguyên.

## Bối cảnh

ADR-0001 chọn PA3: ứng dụng độc lập, ghi nhận tự động qua kết nối ngân hàng. Lúc đó chưa xét đến việc SKHG đã có sẵn POS Shop, một hệ thống nhiều cửa hàng (multi-tenant) có các phần PA3 cần:

- QR động theo chuẩn VietQR, gắn mã đơn (`src/payments/vietqr.js`).
- Webhook nhận biến động số dư có xác thực token (`/bank/api/transaction-sync`), khớp giao dịch theo số tài khoản hoặc mã đơn, lưu giao dịch không khớp để xử lý sau.
- Báo cáo đối soát VietQR, xuất Excel / PDF.
- Phân quyền theo vai trò (`src/lib/rbac.js`), nhật ký thao tác (`audit_logs`), mỗi tenant một CSDL riêng.

Các phương án đã xét:

1. Viết ứng dụng độc lập như ADR-0001: làm lại toàn bộ phần trên, thời gian ra MVP dài nhất.
2. Mở rộng POS Shop: thêm cấp thôn, sổ quỹ, chế độ người bán nhỏ trên nền có sẵn.

## Quyết định

Chọn phương án 2: hiện thực PA3 bằng cách mở rộng POS Shop.

- Thêm cấp **cộng đồng** giữa nền tảng và cửa hàng; thôn là một loại cộng đồng (`communities.type='village'`), để sau này nhân rộng sang tổ dân phố, giáo xứ, chợ… không đổi schema (quyết định 0.9). Mỗi tenant có `kind`: `shop` (POS đầy đủ, giữ nguyên hành vi hiện tại), `seller` (người bán nhỏ), `community` (chứa sổ quỹ của cộng đồng).
- Tenant thuộc cộng đồng **không được** dùng chế độ "một tài khoản VietQR nhận tiền cho nhiều shop". Tiền phải vào thẳng tài khoản người bán / quỹ (BR-02, FR-05, SEC-01). Chặn ở mức code, có test.
- Tenant `kind=shop` giữ nguyên mọi tính năng hiện tại; toàn bộ test hiện có phải tiếp tục qua.

## Hệ quả

Tích cực:

- Dùng lại QR, webhook, đối soát, phân quyền, nhật ký đang chạy; ra MVP nhanh hơn viết mới.
- Một nền tảng cho cả cửa hàng thường và thôn; SKHG vận hành một hệ thống.
- Cấu hình theo cộng đồng qua bảng `communities`, không viết cứng cho thôn thí điểm (NFR-05).

Phải chấp nhận:

- Kế thừa giới hạn của tích hợp VietQR hiện tại: chỉ MB / BIDV. Ngân hàng khác xử lý bằng ghi nhận thủ công, đánh dấu `source='manual'` (xem quyết định 0.4).
- Thay đổi ở lớp dùng chung (webhook, phân quyền) có thể ảnh hưởng cửa hàng hiện có; phải chạy lại toàn bộ `bash test/run.sh` sau mỗi giai đoạn.
- Dữ liệu tài chính của thôn nằm chung nền tảng với cửa hàng thương mại; phạm vi truy cập theo thôn phải chặt (FR-02, SEC-02, ERR-08).

Điều kiện đi kèm:

- [ ] Webhook thật cho tài khoản cá nhân chỉ bật khi đã lưu sự đồng ý của chủ tài khoản (ai, lúc nào). Tài khoản quỹ không cần bước này. Pháp chế xác minh SEC-06 song song với việc code.
- [ ] Các điều kiện còn mở của ADR-0001 (đối tác cụ thể, pháp lý, nhiều ngân hàng) vẫn giữ nguyên.
