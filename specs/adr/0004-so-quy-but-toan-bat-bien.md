# ADR-0004: Sổ quỹ là sổ bút toán bất biến, tồn quỹ tính từ tổng

- **Trạng thái:** Accepted
- **Ngày:** 2026-09-29
- **Liên quan:** FR-12 → FR-15, BR-03, BR-04, BR-05, ERR-06, SKHGDT-3231

## Bối cảnh

Tenant cộng đồng (`kind='community'`) cần quản lý nhiều quỹ: quỹ chung và quỹ công đức. Tiền quỹ là tiền của dân, nên mọi con số phải truy vết được. Một khoản đã ghi sổ không được biến mất hay đổi số, và không một người nào được tự chi.

## Quyết định

- Hai bảng trong DB của tenant: `funds` và `fund_entries`. Không có bảng số dư. Tồn quỹ là tổng các bút toán `approved`: `in` cộng, `out` trừ, `adjust` mang dấu.
- Khoản thu (tiền mặt, hoặc chuyển khoản nhập tay có `bank_ref`) được ghi sổ ngay, vì tiền đã vào quỹ. Khoản chi và bút toán điều chỉnh đi luồng `draft → submitted → approved/rejected`.
- Người duyệt phải khác người lập, kể cả chủ tài khoản có quyền `*`. Kiểm tồn và ghi duyệt nằm trong cùng một `BEGIN IMMEDIATE`, nên tồn quỹ không bao giờ âm.
- BR-04 được giữ ở tầng DB bằng trigger: không cho xóa bút toán, không cho đổi số tiền, quỹ, loại hay trạng thái của bút toán đã chốt. Muốn sửa sai thì lập bút toán `adjust`, trỏ `ref_entry_id` tới bút toán gốc và ghi lý do.
- Tài khoản nhận của quỹ phải riêng: không trùng tài khoản của bất kỳ tenant nào, cũng không trùng quỹ khác (BR-02). Việc kiểm tra quét DB của các tenant cộng đồng.
- Quỹ đã đóng không nhận bút toán mới. Đây là mặc định vì câu hỏi này còn [NEED DECISION]; mở lại quỹ được bằng `PATCH status=active`.

## Hệ quả

- Tồn quỹ luôn khớp với sổ và không cần đối soát số dư. Chi phí là một câu `SUM` mỗi lần đọc, đủ nhanh ở quy mô thôn nhờ index `(fund_id, status, created_at)`.
- Sửa sai tạo thêm dòng thay vì sửa dòng cũ. Báo cáo phải hiển thị bút toán điều chỉnh cùng bút toán gốc.
- Kiểm tài khoản trùng phải quét DB từng tenant. Khi số thôn lớn, cần đưa tài khoản quỹ lên `control.db`.
- Nguồn `vietqr` chỉ do webhook ghi (GĐ2.4), không nhập tay.

## Bổ sung GĐ2.3 — QR riêng cho từng quỹ (2026-09-30)

- `funds` thêm `bank_bin`, `bank_name` để đủ dữ liệu dựng VietQR (`buildVietQR` cần BIN ngân hàng, không chỉ số tài khoản).
- Không thêm bảng theo dõi đơn hàng cho quỹ (khác `qr_orders` của hóa đơn). Vì tài khoản nhận của quỹ đã bảo đảm duy nhất toàn hệ thống (BR-02), riêng số tài khoản đủ để webhook xác định đúng tenant và đúng quỹ (`resolveFundByBank`), không cần orderId.
- Hai loại QR: `GET /funds/:id/qr` (tĩnh, không số tiền, để in dán) và `POST /funds/:id/qr` (động, có số tiền, chỉ `fund.entry`). Cả hai không tạo bút toán trước — bút toán chỉ sinh ra khi tiền thật về qua webhook, giữ nguyên tắc "khoản thu ghi sổ ngay khi có thật" của GĐ2.1.
- `processFundPayment` dùng lại bảng `vietqr_transactions` sẵn có để chống xử lý trùng theo `transactionid`, không cần bảng riêng.
- Thiếu (để sau): không lưu trước người ủng hộ/ghi chú khi tạo QR động; bút toán tự động từ VietQR sẽ trống các trường này, thủ quỹ bổ sung tay khi cần.
