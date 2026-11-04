# POS Shop – Phần mềm bán hàng & quản lý kho chuyên nghiệp

Phần mềm bán hàng cho cửa hàng tạp hóa/gia dụng, thiết kế theo hướng chuyên nghiệp (thao tác nhanh, kho đầy đủ, báo cáo sâu), hỗ trợ **nhiều cửa hàng trên cùng một máy chủ, đăng nhập một link**, và **phân quyền nhân viên**.

Dữ liệu lưu bằng SQLite: mỗi cửa hàng một database riêng trong `data/tenants/<mã>/pos.db`, thông tin đăng nhập/cửa hàng ở `data/control.db`. Không cần internet, không cần cài cơ sở dữ liệu.

## Tài liệu
- **Kế hoạch triển khai (roadmap):** [`docs/ROADMAP.md`](docs/ROADMAP.md) — lộ trình SaaS nhiều cửa hàng, VAT, hóa đơn điện tử, VietQR.
- **Thiết kế kỹ thuật:** [`docs/DESIGN.md`](docs/DESIGN.md) — kiến trúc đa tenant, mô hình dữ liệu, RBAC, VAT, HĐĐT, thanh toán VietQR.

> Đã có: **đa cửa hàng + đăng nhập + phân quyền**. Đang tiếp: VAT, hóa đơn điện tử, VietQR động, thống kê nâng cao.

## Yêu cầu
- **Node.js 22.5 trở lên** (dùng module `node:sqlite` có sẵn, không cần cài thêm gì).

## Cài đặt & chạy
```bash
npm install
npm start
```
Mở trình duyệt tại `http://localhost:3000` và **đăng nhập**.

Tài khoản tạo sẵn lần đầu:
| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `admin123` | Chủ cửa hàng (cửa hàng mặc định) |
| `root` | `root123` | Quản trị nền tảng (tạo cửa hàng khác) |

> **Đổi mật khẩu ngay** sau khi cài. Có thể đặt qua biến môi trường `ADMIN_PASS`, `ROOT_PASS`, `SHOP_NAME` khi chạy lần đầu.

Sau khi chạy, terminal in ra các địa chỉ LAN. Trong **Cài đặt → Kết nối thiết bị khác** có mã QR để điện thoại/máy tính bảng mở nhanh. Các máy phải cùng Wi‑Fi.

## Tính năng

### Tài khoản & phân quyền
- Đăng nhập bằng tài khoản/mật khẩu; phiên an toàn (cookie httpOnly), khóa màn hình.
- Vai trò: **Chủ cửa hàng, Quản lý, Thu ngân, Nhân viên bán hàng, Thủ kho, Kế toán, Chỉ xem**.
- **Ẩn giá vốn/lợi nhuận ở server** với vai trò không có quyền (thu ngân không thấy giá vốn, không sửa giá, không hủy hóa đơn).
- Quản lý người dùng, nhật ký thao tác.

### Nhiều cửa hàng (một link)
- Nhiều cửa hàng dùng chung một máy chủ/đường dẫn, mỗi cửa hàng **một tài khoản riêng** và **database riêng** (cách ly dữ liệu).
- Quản trị nền tảng (`root`) tạo/tạm ngưng cửa hàng, tạo tài khoản chủ.

### Bán hàng (F1)
- Quét mã vạch bằng đầu đọc USB, gõ tên để tìm nhanh, nhập `3*mã` để thêm 3 cái, bán **hàng lẻ** không mã.
- **Đơn vị quy đổi** (thùng/lon, lố/cái…): mỗi đơn vị có giá và mã vạch riêng, tồn kho quy đổi tự động.
- **Nhiều bảng giá** (lẻ, buôn…): chọn bảng giá ngay khi bán.
- **Khuyến mãi tự động**: giảm theo hóa đơn hoặc theo sản phẩm/danh mục (điều kiện số lượng, giá trị), cộng thêm giảm giá tay theo dòng và theo đơn.
- **Thanh toán linh hoạt**: tiền mặt, chuyển khoản (sinh **VietQR** chuẩn NAPAS), thẻ, ví điện tử, **thanh toán hỗn hợp**.
- **Đơn treo**: cất giỏ hàng đang dở, mở lại bất cứ lúc nào.
- **Đổi trả hàng**: tạo phiếu trả từ hóa đơn gốc, tự hoàn kho, hỗ trợ trả một phần.
- In hóa đơn khổ 80mm/58mm (Ctrl+P), in kèm QR chuyển khoản.
- Phím tắt: `F1` bán hàng, `F9` thanh toán, `Esc` xóa giỏ / đóng hộp thoại.

### Sản phẩm & giá (F2)
- Thông tin đầy đủ: mã vạch, SKU, danh mục, giá vốn/giá bán, vị trí kệ, bảo hành, khối lượng, ảnh, tồn min/max.
- Quản lý **đơn vị quy đổi** và **bảng giá** riêng cho từng nhóm khách.
- **Mã vạch linh hoạt**:
  - Sản phẩm có mã nhà sản xuất (EAN‑13…) → dùng luôn.
  - Sản phẩm **không có mã** (bán cân, đổ rời, gia dụng) → bấm **Tự sinh** để tạo mã nội bộ EAN‑13 (tiền tố `2`, đúng chuẩn GS1 cho nội bộ cửa hàng), hoặc **Sinh mã nội bộ** một lần cho toàn bộ sản phẩm/đơn vị còn thiếu mã.
  - **Tra cứu online** theo mã vạch để tự điền tên/ảnh/danh mục (mặc định Open Food Facts, có thể đổi URL dịch vụ trong Cài đặt; cần internet).
- **In tem nhãn mã vạch** (EAN‑13/Code128) với khổ tem tùy chỉnh.
- Lọc sắp hết, hàng ngừng bán, xuất CSV.

### Kho (F3)
- **Tồn kho**: giá trị tồn theo giá vốn/giá bán, cảnh báo sắp hết/hết hàng.
- **Nhập hàng**: phiếu nhập nhiều dòng, quản lý nhà cung cấp, cập nhật giá vốn, nhập kho/cancel có hoàn tác.
- **Kiểm kho**: tạo phiếu kiểm, nhập số thực tế, chốt và tự điều chỉnh tồn + tính chênh lệch giá trị.
- **Sổ kho**: toàn bộ biến động xuất/nhập theo thời gian, lọc và xuất CSV.

### Hóa đơn (F4)
- Lọc theo ngày, trạng thái, hình thức thanh toán; xem/in lại; hủy (tự hoàn kho).
- Tách riêng tab **Bán hàng** và **Trả hàng**.

### Báo cáo (F5)
- Doanh thu thuần, lợi nhuận gộp, số đơn, số món, giá trị trung bình/đơn, giảm giá.
- Doanh thu theo tiền mặt/chuyển khoản/thẻ, phiếu trả hàng, chờ chuyển khoản, giá trị tồn kho.
- Biểu đồ doanh thu theo ngày, theo giờ, theo danh mục, top sản phẩm bán chạy.
- Hàng sắp hết, hàng bán chậm/tồn lâu, xuất CSV.

### Khuyến mãi (F6) & Cài đặt
- Tạo/quản lý chương trình khuyến mãi, bật/tắt, đặt thời gian hiệu lực.
- Cài đặt cửa hàng, tiền tố chứng từ, tài khoản ngân hàng (VietQR), quy tắc bán âm kho, khổ tem nhãn, kết nối LAN, sao lưu.

### Báo cáo thống kê giao dịch công khai (nền tảng)
- Trang thống kê giao dịch thanh toán số cho **ban điều hành**, góc nhìn trung lập: **tổng giá trị giao dịch**, **tổng số giao dịch**, **mức tham gia thanh toán số** (đối tác cung cấp và đối tác thanh toán), giá trị theo ngày/tháng.
- Phân **trong khu vực / ngoài khu vực** theo trường **Khu vực** của từng đối tác (cấu hình ở màn Quản trị nền tảng).
- **Nhóm sản phẩm** kèm nút **Xuất Excel** danh sách nhóm + sản phẩm để tìm nhà cung cấp.
- **Bộ lọc**: đối tác, khu vực, nhóm sản phẩm, tên sản phẩm.
- Chia sẻ bằng **link bí mật** khó đoán (`/r/<token>`), người nhận xem **không cần đăng nhập**. Không hiển thị giá vốn/lợi nhuận.
- Bật/tắt, sao chép và **đổi link** (thu hồi quyền xem) trong **Quản trị nền tảng** (tài khoản `root`).
- Nút **Xuất PDF**: server tự render PDF A4 đầy đủ màu (không có URL/chân trang trình duyệt). Cần Playwright (đã có sẵn ở môi trường dev: `npm i -D playwright && npx playwright install chromium`). Nếu máy chủ không có Playwright, nút tự chuyển sang hộp thoại in của trình duyệt.

### Kết nối Làng Số (mục Thanh toán số)
- Cổng quản trị Làng Số (repo `lang-so`) gọi `GET /api/lang-so/stats|todo|activity?thon=<mã cộng đồng>` kèm `Authorization: Bearer <token SKHG>` (CORS mở).
  - `stats`: thu, chi, số khoản thu đã ghi sổ theo tháng (6 tháng), số khoản chờ duyệt, số dư từng quỹ, giao dịch bán của người bán trong tháng.
  - `todo`: các khoản đã gửi duyệt. `activity`: 30 khoản đã ghi sổ gần nhất (ẩn tên người nộp ẩn danh).
- Token được xác minh qua `<SKHG_API_BASE>/current-profile-2` (nhớ 5 phút) rồi đối chiếu với tài khoản đang hoạt động của tenant sổ quỹ của thôn có tên đăng nhập, SĐT hoặc email trùng tài khoản SKHG. Thủ quỹ chỉ thấy quỹ được giao.
- Nút vào quản trị bên Làng Số mở `/?thon=<mã>&view=funds#sso=<token>`: giao diện gửi token lên `POST /api/auth/sso`, đăng nhập rồi mở sổ quỹ.
- Đăng nhập trực tiếp bằng tài khoản Sáng Kiến Hưng Gia (như Làng Văn hiến): màn đăng nhập có nút "Đăng nhập bằng tài khoản Sáng Kiến Hưng Gia", gửi SĐT/email + mật khẩu lên `POST /api/auth/skhg`.
  - Máy chủ gọi `<SKHG_API_BASE>/login` lấy token, xác minh qua `current-profile-2`, đối chiếu như trên với mọi sổ quỹ của thôn, rồi gọi `/logout` của SKHG. Mật khẩu SKHG chỉ chuyển tiếp, không lưu.
  - Tên trần (không có `@`, không phải SĐT) được hiểu là `<tên>@xaphuongvietnam.vn`, giống Làng Số.
  - Khớp nhiều thôn: trả `{ choose: [{code, name}] }`, người dùng chọn thôn rồi gửi lại kèm `thon`. Không khớp sổ quỹ nào: báo lỗi, chủ sổ quỹ tự thêm người ở mục Người dùng (SĐT hoặc email trùng tài khoản SKHG).

- Thành viên cộng đồng SKHG: quản trị nền tảng điền mã cộng đồng SKHG (vd. `LGHZKS`) ở màn Cộng đồng. Thành viên đã duyệt chưa có tài khoản được tự tạo tài khoản, chỉ vào qua SKHG: admin cộng đồng (`nhom_truong`) là Người duyệt chi, thành viên khác chỉ xem, không bao giờ tự cấp thủ quỹ. Vai trò đồng bộ mỗi lần đăng nhập; rời cộng đồng thì bị chặn và mất phiên.

## Đầu đọc mã vạch
Cắm đầu đọc USB, để con trỏ ở ô quét rồi quét. Đa số đầu đọc gửi mã kèm Enter, phần mềm tự nhận.

## Cấu trúc mã nguồn
```
server.js                 # khởi động server, đăng nhập, định tuyến tenant, in địa chỉ LAN
src/
  control.js              # control DB: cửa hàng, người dùng, phiên, nhật ký
  db.js                   # quản lý DB riêng từng tenant + schema + migration + dữ liệu mẫu
  middleware.js           # phiên đăng nhập, chặn theo quyền, định tuyến tenant
  lib/                    # util, auth, RBAC, sinh mã, engine giá/khuyến mãi, VietQR, sao lưu, barcode
  routes/                 # auth, users, platform, admin, catalog, sales, inventory, reports, backup
public/
  index.html              # giao diện SPA (ES modules, không cần build)
  style.css               # giao diện responsive desktop + mobile
  js/                     # api, auth, store, util, barcode + các màn hình (views/)
test/
  run.sh                  # chạy toàn bộ kiểm thử trên DB tạm
  api.test.js             # 105 test API
  ui.test.js              # 67 test giao diện (Playwright)
```

## Sao lưu & phục hồi
- Phần mềm **tự động sao lưu** database của từng cửa hàng vào `data/tenants/<mã>/backups/` (khi khởi động và mỗi 6 giờ), tự dọn bản cũ theo số bản giữ lại.
- Trong **Cài đặt → Dữ liệu & sao lưu**: bật/tắt tự động sao lưu, đặt số bản giữ lại, **Sao lưu ngay**, **Tải** bản sao lưu, **Phục hồi**, **Xóa**.
- Phục hồi được áp dụng ở lần **khởi động lại** kế tiếp; bản dữ liệu hiện tại được tự động giữ lại thành `pos.db.before-restore-*` để an toàn.
- Nên copy cả thư mục `data/backups/` ra USB/Drive định kỳ.

## Kiểm thử
```bash
npm i -D playwright && npx playwright install chromium   # một lần
npm test        # chạy 105 test API + 67 test giao diện trên DB tạm
```

## Dữ liệu mẫu (để xem báo cáo phong phú)
```bash
npm run seed:demo                       # tạo ~8 cửa hàng, ~360 sản phẩm, ~16.000 hóa đơn trong 6 tháng vào ./data-demo
npm run seed:demo -- --reset            # xóa ./data-demo rồi tạo lại từ đầu
DATA_DIR=./data npm run seed:demo       # ghi thẳng vào dữ liệu thật (chỉ thêm khi cửa hàng chưa có hóa đơn)
DATA_DIR=./data-demo npm start          # chạy thử với dữ liệu mẫu
```
Sau khi chạy, đăng nhập `root`/`root123`, vào **Cửa hàng → Báo cáo tổng thể công khai**, bật và sao chép link để xem.

