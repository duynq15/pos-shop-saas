# API Sổ quỹ thôn

Tài liệu cho App / Web người dân và hệ thống bên ngoài muốn lấy dữ liệu quỹ thôn.

- Địa chỉ gốc: `https://<máy chủ>` (ví dụ `https://thanhtoanso.example.vn`)
- Dữ liệu trả về: JSON `{ "ok": true, "data": ... }`. Khi lỗi: `{ "ok": false, "error": "..." }` hoặc `{ "error": "..." }` cùng mã HTTP 4xx.
- Tiền: số nguyên, đơn vị đồng (VND). Ngày: chuỗi `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:MM:SS` theo giờ Việt Nam.

Có hai nhóm API:

| Nhóm | Dùng cho | Xác thực |
|---|---|---|
| 1. API công khai | App / Web người dân: xem các đợt thu, danh sách người đóng, tạo mã QR để nộp tiền | Mã liên kết công khai của thôn (không cần đăng nhập) |
| 2. API quản lý | Ban quản lý quỹ: tạo quỹ, ghi thu, nhập Excel | Tài khoản sổ quỹ (cookie phiên) |

---

## 1. API công khai (App / Web người dân)

### Lấy mã liên kết công khai

1. Quản trị nền tảng bật **Công khai đợt thu & công đức** cho thôn (màn Cộng đồng).
2. Trong sổ quỹ, bấm **Chia sẻ / nhắc đóng quỹ**. Link có dạng `https://<máy chủ>/congduc/<TOKEN>`. Phần `<TOKEN>` là mã dùng cho API.

Chỉ những quỹ đang hoạt động và được đánh dấu **Công khai trên trang người nộp** mới xuất hiện trong API công khai.
Nếu thôn tắt công khai, mọi API dưới đây trả về `404`.

API công khai cho phép gọi từ trình duyệt ở tên miền khác (CORS `Access-Control-Allow-Origin: *`) và chỉ cho đọc.

### 1.1. Danh sách đợt thu của thôn

```
GET /public/api/donations/<TOKEN>
```

Ví dụ trả về:

```json
{
  "ok": true,
  "data": {
    "community_name": "Thôn An Phú",
    "programs": [
      {
        "id": 2,
        "name": "Công đức tu sửa đình làng",
        "kind": "donation",
        "fund_type": "Công đức",
        "category": "Cả thôn",
        "contribution": "voluntary",
        "target_amount": null,
        "description": "Chương trình công đức năm nay",
        "start_date": "2026-10-01",
        "end_date": "2026-12-31",
        "bank_account": "9612345678",
        "bank_name": "MB Bank",
        "account_holder": "BAN QUAN LY THON AN PHU",
        "qrDataUrl": "data:image/png;base64,iVBORw0...",
        "total": 12500000,
        "spent": 3000000,
        "balance": 9500000,
        "entries": [
          { "type": "in", "name": "Nguyễn Văn An", "anonymous": false, "amount": 500000, "note": "", "date": "2026-11-09" },
          { "type": "in", "name": null, "anonymous": true, "amount": 200000, "note": "", "date": "2026-11-08" },
          { "type": "out", "name": null, "anonymous": false, "amount": 3000000, "note": "Mua ngói", "date": "2026-11-05" }
        ]
      }
    ]
  }
}
```

Ý nghĩa các trường của một đợt thu:

| Trường | Ý nghĩa |
|---|---|
| `id` | Mã số quỹ, dùng cho API tạo QR |
| `name` | Tên quỹ / đợt thu |
| `fund_type` | Loại quỹ do thôn đặt (Quỹ chung, Công đức, Khuyến học, Ủng hộ lũ lụt…) |
| `category` | Phạm vi thu: `Cả thôn` hoặc tên xóm / đoàn thể (Xóm 1, Hội Phụ nữ…). `null` ở quỹ cũ chưa chọn = cả thôn |
| `contribution` | Cách đóng: `household` theo hộ, `person` theo nhân khẩu, `voluntary` tùy tâm, `goal` huy động theo mục tiêu |
| `target_amount` | Mức đóng mỗi hộ (`household`), mỗi người (`person`) hoặc tổng mục tiêu (`goal`). `null` khi tùy tâm |
| `start_date`, `end_date` | Thời gian thu (có thể `null`) |
| `bank_account`, `bank_name`, `account_holder` | Tài khoản nhận tiền riêng của quỹ |
| `qrDataUrl` | Ảnh mã QR chuyển khoản (người nộp tự nhập số tiền), dạng data URL PNG, dùng thẳng trong `<img src>`. `null` nếu quỹ chưa khai tài khoản |
| `total` | Tổng đã thu |
| `spent` | Tổng đã chi |
| `balance` | Còn lại (đã tính bút toán điều chỉnh) |
| `entries` | Tối đa 300 khoản gần nhất đã ghi sổ, mới nhất trước |

Một khoản trong `entries`:

| Trường | Ý nghĩa |
|---|---|
| `type` | `in` thu, `out` chi, `adjust` điều chỉnh (số tiền có thể âm) |
| `name` | Tên người nộp. `null` khi người nộp xin ẩn danh hoặc không rõ tên |
| `anonymous` | `true` thì hiển thị "Người hảo tâm" |
| `amount` | Số tiền |
| `note` | Nội dung (với khoản chi: chi cho việc gì) |
| `date` | Ngày ghi sổ |

### 1.2. Tạo mã QR đúng số tiền

```
GET /public/api/donations/<TOKEN>/funds/<id>/qr?amount=200000
```

- `amount` không bắt buộc. Bỏ trống thì trả QR để người nộp tự nhập số tiền.
- Nội dung chuyển khoản trong QR là tên quỹ (không dấu). Tiền chuyển vào tài khoản quỹ được tự ghi vào sổ.

```json
{
  "ok": true,
  "data": {
    "qrCode": "00020101021238570010A000000727...",
    "qrDataUrl": "data:image/png;base64,iVBORw0...",
    "fund_id": 2,
    "bank_name": "MB Bank",
    "bank_account": "9612345678",
    "account_holder": "BAN QUAN LY THON AN PHU",
    "amount": 200000
  }
}
```

`qrCode` là chuỗi VietQR (chuẩn NAPAS), dùng khi App muốn tự vẽ QR hoặc mở app ngân hàng.

Lỗi thường gặp: `404` (sai token, thôn tắt công khai, quỹ không công khai), `400` (số tiền không hợp lệ, quỹ chưa khai tài khoản).

### Ví dụ gọi từ App (JavaScript)

```js
const BASE = 'https://<máy chủ>';
const TOKEN = '<TOKEN>';
const res = await fetch(`${BASE}/public/api/donations/${TOKEN}`);
const { data } = await res.json();
for (const p of data.programs) console.log(p.name, p.total, p.balance);

const qr = await (await fetch(`${BASE}/public/api/donations/${TOKEN}/funds/${data.programs[0].id}/qr?amount=200000`)).json();
document.querySelector('#qr').src = qr.data.qrDataUrl;
```

---

## 2. API quản lý (Ban quản lý quỹ)

Dùng tài khoản sổ quỹ của thôn. Đăng nhập trước, sau đó gửi kèm cookie phiên ở mọi lệnh.

```
POST /api/auth/login
{ "username": "thon-a-thuquy", "password": "..." }
```

Quyền theo vai trò:

| Vai trò | Được làm |
|---|---|
| Thủ quỹ | Xem quỹ, ghi thu, nhập Excel, lập phiếu chi |
| Người duyệt chi | Xem, tạo / sửa quỹ, duyệt chi. Không ghi thu |
| Ban lãnh đạo | Xem, tạo / sửa quỹ |
| Quản trị sổ quỹ | Toàn quyền |

### 2.1. Danh sách quỹ

```
GET /api/funds
```

Trả mảng quỹ, mỗi quỹ gồm các trường ở mục 1.1 cùng `code`, `status` (`active` / `closed`), `is_public`, `manager_name` (thủ quỹ phụ trách) và `balance` (tồn quỹ).

### 2.2. Tạo / sửa quỹ

```
POST  /api/funds
PATCH /api/funds/<id>
{
  "name": "Quỹ khuyến học 2026",
  "fund_type": "Khuyến học",
  "category": "Xóm 1",
  "contribution": "person",
  "target_amount": 50000,
  "is_public": 1,
  "start_date": "2026-11-01",
  "end_date": "2026-12-31",
  "bank_account": "9612345678",
  "bank_bin": "970422",
  "bank_name": "MB Bank",
  "account_holder": "BAN QUAN LY THON AN PHU"
}
```

- `code` không bắt buộc. Bỏ trống thì hệ thống tự sinh từ tên (ví dụ `quy-khuyen-hoc-2026`).
- `contribution` thuộc `household`, `person`, `voluntary`, `goal`. Với `voluntary` thì `target_amount` luôn là `null`.
- Tài khoản nhận tiền của mỗi quỹ phải riêng, không trùng quỹ hay cửa hàng khác.

### 2.3. Ghi một khoản thu

```
POST /api/funds/<id>/entries
{
  "type": "in",
  "amount": 200000,
  "source": "cash",
  "date": "2026-11-02",
  "payer_name": "Nguyễn Văn An",
  "anonymous": false,
  "note": "Đóng quỹ xóm 1"
}
```

- `source`: `cash` (tiền mặt, ghi tay) hoặc `manual` (chuyển khoản vào tài khoản quỹ chưa có trong sổ). Tiền chuyển qua mã QR của quỹ tự vào sổ, không cần gọi API này.
- `bank_ref`: mã giao dịch ngân hàng, dùng khi `source = manual`. Một mã chỉ ghi được một lần.
- `date`: ngày thu, không được ở tương lai. Bỏ trống thì lấy hôm nay.

Khoản thu ghi sổ ngay. Phiếu chi (`type: out`) vẫn theo luồng nháp, gửi duyệt rồi người duyệt đồng ý.

### 2.4. Nhập khoản thu từ Excel / CSV

```
GET  /api/funds/<id>/import-template          # tải file mẫu .xlsx
POST /api/funds/<id>/import?dry=1             # chỉ kiểm tra, không ghi
POST /api/funds/<id>/import                   # ghi sổ
{ "file": "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDB..." }
```

- `file`: nội dung file `.xlsx` hoặc `.csv` mã hóa base64 (có hoặc không kèm tiền tố `data:`), tối đa 5MB và 2000 dòng.
- Thay cho `file`, có thể gửi `rows`: `[{ "date", "payer_name", "amount", "source", "bank_ref", "note", "anonymous" }]`.
- Dòng đầu của file là tiêu đề. Các cột: **Ngày** (`YYYY-MM-DD` hoặc `DD/MM/YYYY`), **Người nộp**, **Số tiền**, **Hình thức** (`Tiền mặt` / `Chuyển khoản`), **Mã giao dịch**, **Ghi chú**, **Ẩn danh** (ghi `x` nếu ẩn danh).
- Hoặc ghi cả file, hoặc không ghi dòng nào: còn một dòng lỗi là không ghi gì, và API trả về lỗi theo từng dòng.

```json
{ "ok": true, "data": { "count": 3, "total": 300000, "imported": 0,
  "errors": [ { "line": 4, "error": "Số tiền không hợp lệ" } ] } }
```

### 2.5. Sổ thu chi và báo cáo

```
GET /api/funds/<id>/entries?from=2026-11-01&to=2026-11-30&type=in&status=approved
GET /api/funds/<id>/report?from=2026-11-01&to=2026-11-30
GET /api/funds/<id>/report/export?from=...&to=...   # file Excel
```

`report` trả về `opening_balance`, `income_cash`, `income_bank`, `expense`, `adjust`, `closing_balance` và danh sách bút toán trong kỳ.
