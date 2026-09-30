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

## Bổ sung GĐ2.5 — ảnh chứng từ (2026-09-30)

- `fund_entries` thêm cột `attachment` (tên file, không lưu đường dẫn).
- Không thêm thư viện multipart. Ảnh gửi qua body JSON dạng `data:image/jpeg;base64,...`, dùng `express.json({limit:'8mb'})` sẵn có.
- Chỉ nhận JPEG/PNG/WebP, tối đa 5MB sau giải mã.
- File lưu tại `data/tenants/<mã>/attachments/<mã chứng từ>.<đuôi>`. Tên file luôn do server đặt theo mã chứng từ, không lấy từ input, nên không cần chặn path traversal.
- Không có endpoint sửa ảnh sau khi tạo — khớp nguyên tắc bất biến của bút toán.
- `res.sendFile` cần `dotfiles: 'allow'` vì `DATA_DIR` có thể nằm dưới thư mục chấm, cùng lý do đã gặp ở `backup.js`.

## Bổ sung GĐ2.7 — tồn quỹ và báo cáo kỳ (2026-09-30)

- `GET /funds/:id/report?from&to`: không có bảng hay cờ "chốt sổ" nào — mỗi lần gọi tính lại từ `fund_entries` (BR-12). Tồn đầu kỳ = tổng approved trước `from`; trong kỳ tách `income_bank` (nguồn `vietqr`+`manual`) và `income_cash` (`cash`); tồn cuối kỳ = đầu kỳ + thu ngân hàng + thu tiền mặt + điều chỉnh − chi.
- `GET /funds/:id/report/export`: xuất Excel bằng `sendXlsx` có sẵn, không thêm code dựng file. Quyền `report.export` giữ nguyên phân quyền hiện tại (chủ tài khoản + thủ quỹ).
- Không dựng PDF phía server: `lib/pdf.js` chỉ render được từ một URL công khai (Playwright), không hợp với báo cáo nội bộ cần đăng nhập. Màn hình thủ quỹ (GĐ2.8) dùng `window.print()` + CSS `@media print` — cách đã dùng cho hóa đơn và trang công khai — thay vì route PDF mới.

## Bổ sung GĐ2.8 — màn hình thủ quỹ (2026-09-30)

- Một view `public/js/views/funds.js` (`id: 'funds'`), đăng ký `kinds: ['community']`, theo đúng khuôn các view khác (`community.js`, `promotions.js`): chọn quỹ bằng tab, số dư + hành động, khoản chờ duyệt, sổ thu chi có lọc, báo cáo kỳ.
- Bỏ trường "người phụ trách" khỏi form quỹ dù đã nêu trong đề xuất: `/api/users` cần quyền `user.manage` mà `approver` (người có `fund.manage`) lại không có, nên dropdown sẽ lỗi 403 với đúng vai trò cần dùng nó. Trường `manager_user_id` vẫn còn ở API, thêm UI khi có endpoint tra cứu người dùng phù hợp quyền.
- Ảnh chứng từ: đọc file qua `FileReader` thành `data:` URL trước khi gửi, khớp thiết kế backend GĐ2.5 (không multipart).
- "In" báo cáo dùng lại `printHTML()` có sẵn (đổ bảng vào `#print-area`), không thêm CSS in mới.
- Test UI: tạo quỹ, thu tiền mặt cập nhật số dư, sổ thu chi hiển thị, QR tĩnh render ảnh, báo cáo kỳ hiện đủ 6 chỉ số. (Không test luồng duyệt trong UI vì chỉ có một tài khoản chủ đăng nhập — ERR-06 chặn tự duyệt; luồng duyệt đã có test API đầy đủ.)

## Bổ sung GĐ2.9 — danh sách công đức công khai (2026-09-30)

- `communities` thêm cột `donations_token`, sinh một lần khi `settings.public_donations` chuyển sang `true` (giữ nguyên khi tắt/bật lại), y hệt cách `public_report_token` của báo cáo nền tảng đang làm — không thêm cơ chế mới.
- `GET /public/api/donations/:token` (không cần đăng nhập) chỉ liệt kê quỹ `kind='donation'`, chỉ bút toán `type='in' AND status='approved'`; dòng `anonymous=1` trả `name: null` để trang hiện "Người hảo tâm". Sai token hoặc cờ đang tắt đều trả 404 như nhau.
- Trang `public/donations.html` + `public/js/donations.js`, dùng lại `report.css` (không thêm CSS mới), mounted tại `GET /congduc/:token`.
- Việc bật/tắt đã được ghi log từ trước (audit `community.update` có sẵn từ GĐ1.6) — không cần thêm gì cho yêu cầu "ẩn/hiện ghi nhật ký" (FR-20).
- Form sửa cộng đồng hiện link công khai (đọc-only + nút sao chép) khi đã có token, theo đúng mẫu `#pp-url` của báo cáo nền tảng.
- Bỏ qua: nút đổi (rotate) token — thêm sau nếu cần.
