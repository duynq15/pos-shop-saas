# API Sổ quỹ thôn

Tài liệu cho App / Web người dân và hệ thống bên ngoài muốn lấy dữ liệu quỹ thôn.

- Địa chỉ gốc: `https://thanhtoanso.sangkienhunggia.app`
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

1. Tài khoản root vào **Nền tảng › Cộng đồng**, mở thôn, tích **Công khai đợt thu & công đức**, Lưu.
2. Ô **Link người nộp** hiện `https://thanhtoanso.sangkienhunggia.app/congduc/<TOKEN>` (trong sổ quỹ: nút **Chia sẻ / nhắc đóng quỹ**). Phần `<TOKEN>` là mã dùng cho API. Tắt rồi bật lại không đổi token.

Chỉ những quỹ được đánh dấu **Công khai trên trang người nộp** mới xuất hiện, ở cả ba trạng thái (xem bên dưới).
Nếu thôn tắt công khai, mọi API dưới đây trả về `404`.

API công khai cho phép gọi từ trình duyệt ở tên miền khác (CORS `Access-Control-Allow-Origin: *`) và chỉ cho đọc.

### Ba trạng thái của quỹ

| `state` | `state_label` | `status_text` (hiển thị sẵn) | Thu | Chi | QR |
|---|---|---|---|---|---|
| `collecting` | Đang thu | `Hạn thu 31/12/2026` | Có | Có | Có |
| `stopped` | Ngừng thu | `Ngừng thu từ 31/10/2026 · vẫn chi` | Không | Có | Không (`qr_note`: "Quỹ đang ngừng thu") |
| `locked` | Khoá sổ | `Đã khoá sổ ngày 31/12/2025` | Không | Không | Không (`qr_note`: "Quỹ đã khoá sổ", App hiển thị QR mờ kèm nhãn) |

- Hết hạn thu (`end_date`), hệ thống tự chuyển quỹ sang **Ngừng thu** và báo Admin.
- **Mở thu lại** (từ Ngừng thu) tạo đợt mới: `round` tăng, `transfer_content` đổi (ví dụ `QPAN26-D2`), QR mới. Tiền chuyển theo QR đợt cũ không tự vào sổ.
- **Khoá sổ** là chốt cuối. Có `lock_balance` (số dư khi khoá) và `minutes_url` (biên bản khoá sổ).
- **Mở khoá sổ** chỉ khi có sai sót, cần 2 người duyệt. Quỹ về Ngừng thu và `unlock_text` = "Đã mở khoá sổ ngày … – lý do …" (App nên hiển thị dòng này).

### 1.1. Danh sách quỹ của thôn

```
GET /public/api/donations/<TOKEN>
```

Ví dụ trả về (rút gọn):

```json
{
  "ok": true,
  "data": {
    "community_name": "Thôn An Phú",
    "summary": {
      "funds": 8, "collecting": 6, "stopped": 1, "locked": 1,
      "balance": 208500000, "month_from": "2026-11-01", "month_income": 12300000, "month_expense": 8250000,
      "updated_at": "2026-11-08 08:00:00"
    },
    "notices": [
      { "fund_id": 5, "kind": "auto_stop", "message": "Quỹ quốc phòng – an ninh 2026: ngừng thu từ 31/10/2026 (hết hạn thu)", "created_at": "2026-10-31 17:00:00" }
    ],
    "programs": [
      {
        "id": 5,
        "code": "qp-an",
        "name": "Quỹ quốc phòng – an ninh 2026",
        "fund_type": "Quỹ quốc phòng – an ninh",
        "nature": "mandatory",
        "nature_label": "Bắt buộc",
        "category": "Cả thôn",
        "contribution": "household",
        "target_amount": 50000,
        "period": "year",
        "contribution_text": "50.000 đ/hộ/năm",
        "managed_by": "Ban chỉ huy quân sự thôn",
        "description": "Thu theo Nghị quyết HĐND xã, mỗi hộ 50.000 đ/năm",
        "content": "Căn cứ Nghị quyết HĐND xã …\nĐối tượng: …",
        "documents": [ { "id": 3, "name": "Nghị quyết HĐND xã.pdf", "mime": "application/pdf", "size": 182044, "url": "/public/api/donations/<TOKEN>/documents/3" } ],
        "start_date": "2026-09-01",
        "end_date": "2026-10-31",
        "state": "stopped",
        "state_label": "Ngừng thu",
        "status_text": "Ngừng thu từ 31/10/2026 · vẫn chi",
        "round": 1,
        "stopped_at": "2026-10-31 17:00:00",
        "locked_at": null, "lock_balance": null, "minutes_url": null,
        "unlocked_at": null, "unlock_reason": null, "unlock_text": null,
        "bank_account": null, "bank_name": null, "account_holder": null,
        "transfer_content": null, "qrDataUrl": null, "qr_note": "Quỹ đang ngừng thu",
        "total": 1500000, "spent": 600000, "balance": 900000, "donors": 30, "progress": null,
        "month": { "from": "2026-11-01", "in_count": 0, "income": 0, "out_count": 1, "expense": 600000 },
        "updated_at": "2026-11-08 09:12:00",
        "entries": [
          { "id": 41, "code": "PC-20261108-001", "type": "out", "type_label": "Chi", "name": null, "anonymous": false, "group": null,
            "amount": 600000, "note": "Hỗ trợ dân quân trực Tết", "date": "2026-11-08", "after_stop": true, "receipts": 1 },
          { "id": 37, "code": "PT-20261030-004", "type": "in", "type_label": "Thu", "name": "Nguyễn Văn An", "anonymous": false, "group": "Xóm Đình",
            "amount": 50000, "note": "Đóng quỹ", "date": "2026-10-30", "after_stop": false,
            "source": "vietqr", "source_label": "QR qua ngân hàng", "bank_ref": "FT26303845510", "match_text": "Tự khớp sao kê ngân hàng" }
        ],
        "notices": [ { "kind": "auto_stop", "message": "…", "created_at": "2026-10-31 17:00:00" } ]
      }
    ]
  }
}
```

Ý nghĩa các trường của một quỹ:

| Trường | Ý nghĩa |
|---|---|
| `id`, `code` | Mã số quỹ (dùng cho API chi tiết / QR) và mã chữ |
| `name` | Tên quỹ |
| `fund_type` | Loại quỹ do thôn đặt (Quỹ chung, Quỹ quốc phòng – an ninh, Công đức, Khuyến học…) |
| `nature`, `nature_label` | Tính chất: `mandatory` Bắt buộc, `campaign` Vận động, `voluntary` Tự nguyện (`null` nếu chưa chọn) |
| `category` | Phạm vi thu: `Cả thôn` hoặc tên xóm / đoàn thể. `null` ở quỹ cũ = cả thôn |
| `contribution` | Cách đóng: `household` theo hộ, `person` theo nhân khẩu, `voluntary` tùy tâm, `goal` huy động theo mục tiêu |
| `target_amount` | Mức mỗi hộ / mỗi người / tổng mục tiêu theo `contribution`. `null` khi tùy tâm |
| `period` | Chu kỳ của mức đóng: `year` mỗi năm, `month` mỗi tháng, `null` một lần cho đợt thu |
| `contribution_text` | Mức đóng hiển thị sẵn: `400.000 đ/hộ/năm`, `50.000 đ/người`, `Tuỳ tâm`, `Mục tiêu 300.000.000 đ` |
| `managed_by` | Đơn vị quản lý quỹ (Ban quản lý thôn, Hội Khuyến học…), `null` nếu chưa nhập |
| `description` | Mô tả ngắn |
| `content` | Nội dung chi tiết (văn bản nhiều dòng, giữ nguyên xuống dòng; hiển thị dạng text, không phải HTML) |
| `documents` | Tài liệu đính kèm (nghị quyết, tờ trình, ảnh…): `name`, `mime`, `size` (byte), `url` |
| `start_date`, `end_date` | Bắt đầu thu, hạn thu |
| `state`, `state_label`, `status_text` | Trạng thái (xem bảng trên) |
| `round` | Đợt thu thứ mấy (tăng khi mở thu lại) |
| `stopped_at` | Thời điểm ngừng thu |
| `locked_at`, `lock_balance`, `minutes_url` | Thời điểm khoá sổ, số dư khi khoá sổ, link biên bản khoá sổ |
| `unlocked_at`, `unlock_reason`, `unlock_text` | Lần mở khoá sổ gần nhất (nếu có) |
| `bank_account`, `bank_name`, `account_holder` | Tài khoản nhận tiền (chỉ khi Đang thu) |
| `transfer_content` | Nội dung chuyển khoản của đợt hiện tại (chỉ khi Đang thu), ví dụ `QPAN26-D2` |
| `qrDataUrl` | Ảnh QR (PNG data URL) khi Đang thu; `null` khi Ngừng thu / Khoá sổ / chưa khai tài khoản |
| `qr_note` | Nhãn thay QR: "Quỹ đang ngừng thu" / "Quỹ đã khoá sổ" |
| `total`, `spent`, `balance` | Tổng đã thu, đã chi, số dư (trên toàn bộ sổ) |
| `donors` | Số lượt đóng góp |
| `progress` | % đạt mục tiêu (chỉ `contribution = goal`) |
| `month` | Tháng hiện tại: `in_count`, `income` (thu), `out_count`, `expense` (chi) |
| `updated_at` | Lần ghi sổ gần nhất (dòng "cập nhật 08/11") |
| `entries` | Tối đa 300 khoản gần nhất. Quỹ nhiều giao dịch: dùng API thu chi ở mục 1.1c (lọc, phân trang) |
| `notices` | 20 thông báo gần nhất của quỹ (mở thu lại, tự ngừng thu, khoá / mở khoá sổ) |

Một khoản trong `entries`:

| Trường | Ý nghĩa |
|---|---|
| `id`, `code` | Mã số và số chứng từ (PT… phiếu thu, PC… phiếu chi, DC… điều chỉnh) |
| `type`, `type_label` | `in` Thu, `out` Chi, `adjust` Điều chỉnh (số tiền có thể âm) |
| `name` | Tên người nộp. `null` khi người nộp xin ẩn danh hoặc không rõ tên |
| `anonymous` | `true` thì hiển thị "Người hảo tâm" |
| `group` | Xóm / địa chỉ người nộp (khoản thu, không ẩn danh), `null` nếu không ghi |
| `source`, `source_label` | Khoản thu: `vietqr` "QR qua ngân hàng", `manual` "Chuyển khoản", `cash` "Tiền mặt" |
| `bank_ref` | Khoản thu qua ngân hàng: mã giao dịch trên sao kê |
| `match_text` | Khoản thu: cách đối chiếu ("Tự khớp sao kê ngân hàng", "Thủ quỹ ghi theo sao kê ngân hàng", "Thủ quỹ ghi sổ, có biên nhận") |
| `receipts` | Khoản chi: số ảnh chứng từ (0 hoặc 1) |
| `amount` | Số tiền |
| `note` | Nội dung (với khoản chi: chi cho việc gì) |
| `date` | Ngày ghi sổ |
| `after_stop` | `true` nếu là khoản chi / điều chỉnh phát sinh sau ngày ngừng thu (để thấy quỹ vẫn chi) |

`summary` ở cấp thôn (đầu trang Quỹ làng): `funds` số quỹ công khai, `collecting` / `stopped` / `locked` số quỹ theo trạng thái, `balance` tổng số dư, `month_income` / `month_expense` thu chi từ `month_from` (đầu tháng này), `updated_at` lần ghi sổ gần nhất.

`notices` ở cấp thôn: 30 thông báo mới nhất của mọi quỹ công khai, `kind` thuộc `resume` (mở thu lại), `auto_stop` (tự ngừng thu), `stop`, `lock`, `unlock`.

### 1.1b. Chi tiết một quỹ, tài liệu

```
GET /public/api/donations/<TOKEN>/funds/<id>              # một quỹ, cùng cấu trúc như trên
GET /public/api/donations/<TOKEN>/documents/<docId>       # tải tài liệu / biên bản (PDF, ảnh mở trực tiếp; Word, Excel tải về)
```

### 1.1c. Thu chi của một quỹ (lọc, phân trang, tải Excel)

```
GET /public/api/donations/<TOKEN>/funds/<id>/entries?from=2026-11-01&to=2026-11-30&type=in&q=Hoa&page=1&limit=20
GET /public/api/donations/<TOKEN>/funds/<id>/entries.xlsx?from=...&to=...&type=...&q=...    # tải Excel, cùng bộ lọc
```

- Tham số đều không bắt buộc. `from`, `to`: `YYYY-MM-DD` (ngày ghi sổ). `type`: `in` / `out`. `q`: tìm theo tên người nộp, xóm, nội dung, số chứng từ, mã giao dịch (không tìm theo tên người ẩn danh). `limit`: `20` / `50` / `100` (mặc định 20). `page` từ 1.
- "Tháng 11/2026" = `from=2026-11-01&to=2026-11-30`; "Năm 2026" = `from=2026-01-01&to=2026-12-31`.

```json
{
  "ok": true,
  "data": {
    "total_count": 1248, "total_income": 386400000, "total_expense": 290200000,
    "page": 1, "pages": 63, "limit": 20,
    "months": [ { "month": "2026-11", "count": 8, "income": 2400000, "expense": 8250000 } ],
    "entries": [ { "id": 52, "code": "PT-20261108-002", "type": "in", "name": "Lê Thị Hoa", "group": "Xóm Đông", "amount": 400000, "...": "như mục 1.1" } ]
  }
}
```

`months`: tiêu đề nhóm cho các tháng có trên trang này (số giao dịch, thu, chi của cả tháng theo bộ lọc).

### 1.1d. Báo cáo tháng

```
GET /public/api/donations/<TOKEN>/report?month=2026-10      # bỏ month = tháng trước
```

```json
{
  "ok": true,
  "data": {
    "community_name": "Thôn An Phú", "month": "2026-10", "from": "2026-10-01", "to": "2026-10-31",
    "funds": [ { "id": 1, "name": "Quỹ phúc lợi thôn", "opening_balance": 104450000, "income": 0, "expense": 3200000, "adjust": 0, "closing_balance": 101250000, "entries": 1 } ],
    "totals": { "opening_balance": 104450000, "income": 0, "expense": 3200000, "adjust": 0, "closing_balance": 101250000 }
  }
}
```

### 1.2. Tạo mã QR đúng số tiền

```
GET /public/api/donations/<TOKEN>/funds/<id>/qr?amount=200000
```

- `amount` không bắt buộc. Bỏ trống thì trả QR để người nộp tự nhập số tiền.
- Chỉ quỹ **Đang thu** mới tạo được QR (quỹ khác trả `404`).
- Nội dung chuyển khoản trong QR là `transfer_content` của đợt hiện tại. Tiền chuyển vào tài khoản quỹ với nội dung này được tự ghi vào sổ.

```json
{
  "ok": true,
  "data": {
    "qrCode": "00020101021238570010A000000727...",
    "qrDataUrl": "data:image/png;base64,iVBORw0...",
    "fund_id": 2,
    "round": 1,
    "transfer_content": "CDTSDL",
    "bank_name": "MB Bank",
    "bank_account": "9612345678",
    "account_holder": "BAN QUAN LY THON AN PHU",
    "amount": 200000
  }
}
```

`qrCode` là chuỗi VietQR (chuẩn NAPAS), dùng khi App muốn tự vẽ QR hoặc mở app ngân hàng.

Lỗi thường gặp: `404` (sai token, thôn tắt công khai, quỹ không công khai), `400` (số tiền không hợp lệ, quỹ chưa khai tài khoản).

### 1.3. Của tôi: khoản đóng của hộ người dân (đăng nhập SKHG)

App gửi token tài khoản Sáng Kiến Hưng Gia của người dân. Máy chủ lấy SĐT của tài khoản, tìm hộ có thành viên trùng SĐT trong danh sách hộ đồng bộ từ trang Hành chính (Hộ & nhân khẩu), rồi chỉ trả dữ liệu của hộ đó.

```
GET /public/api/donations/<TOKEN>/me                    Authorization: Bearer <token SKHG>
GET /public/api/donations/<TOKEN>/me?ho=XT-0001         # người thuộc nhiều hộ: chọn hộ (danh sách ở "households")
GET /public/api/donations/<TOKEN>/me/entries?fund=<id>  # giao dịch của hộ tôi (mọi quỹ công khai hoặc một quỹ)
```

```json
{
  "ok": true,
  "data": {
    "user": { "name": "Nguyễn Văn Hùng" },
    "household": { "code": "XT-0001", "head_name": "Nguyễn Văn Hùng", "hamlet": "Xóm Đình", "members": 4, "categories": [] },
    "households": [ { "code": "XT-0001", "...": "..." } ],
    "summary": { "owing_count": 2, "owing_total": 300000, "next_deadline": "2026-11-30", "paid_this_year": 1150000 },
    "funds": [
      { "id": 3, "name": "Quỹ khuyến học", "state": "collecting", "nature_label": "Vận động", "contribution_text": "200.000 đ/hộ",
        "period": null, "period_from": null, "end_date": "2026-11-30",
        "due": 200000, "exempt": false, "paid": 0, "remaining": 200000, "done": false, "status_text": "Cần đóng 200.000 đ",
        "transfer_content": "XT0001 KH26", "bank_account": "9612345678", "bank_name": "MB Bank", "account_holder": "QUY THON XUAN TRACH",
        "qrDataUrl": "data:image/png;base64,..." },
      { "id": 1, "name": "Quỹ phúc lợi thôn", "due": 400000, "paid": 400000, "remaining": 0, "done": true, "status_text": "Đã đóng đủ", "...": "..." }
    ]
  }
}
```

- `due`: số phải đóng trong kỳ hiện tại = mức × 1 (theo hộ) hoặc × số nhân khẩu (theo người). `null` với quỹ tuỳ tâm / mục tiêu. `0` và `exempt: true` khi hộ thuộc diện được miễn của quỹ.
- `paid`: hộ đã đóng trong kỳ (`period_from`: đầu năm khi `period = year`, đầu tháng khi `month`, cả đợt khi `null`).
- `transfer_content` + `qrDataUrl`: QR riêng của hộ (có sẵn số tiền còn thiếu). Tiền chuyển với nội dung này tự ghi đúng vào hộ, nên "Tôi đã đóng" cập nhật ngay khi ngân hàng báo về. Chỉ có khi quỹ Đang thu.
- Dùng cho: "Tôi đã đóng / Cần đóng …", "Khoản đóng của tôi · còn 2 khoản", màn Đóng quỹ, "Chỉ giao dịch của tôi" (`/me/entries`).
- Lỗi: `401` token SKHG sai / hết hạn; `404` kèm `error` khi tài khoản không có SĐT hoặc SĐT chưa có trong danh sách hộ (App hiển thị lý do, hướng dẫn liên hệ cán bộ thôn).

### Ví dụ gọi từ App (JavaScript)

```js
const BASE = 'https://thanhtoanso.sangkienhunggia.app';
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
| Ban lãnh đạo | Xem, tạo / sửa quỹ, ngừng thu / mở thu lại |
| Trưởng ban kiểm tra | Xem; khoá sổ; duyệt mở khoá sổ |
| Quản trị sổ quỹ | Toàn quyền |

### 2.1. Danh sách quỹ

```
GET /api/funds
```

Trả mảng quỹ, mỗi quỹ gồm các trường ở mục 1.1 cùng `state`, `state_label`, `transfer_content`, `is_public`, `manager_name` (thủ quỹ phụ trách) và `balance` (tồn quỹ).

### 2.2. Tạo / sửa quỹ

```
POST  /api/funds
PATCH /api/funds/<id>
{
  "name": "Quỹ khuyến học 2026",
  "fund_type": "Khuyến học",
  "nature": "campaign",
  "content": "Mục đích, căn cứ, đối tượng…",
  "transfer_code": "KH26",
  "category": "Xóm 1",
  "contribution": "person",
  "target_amount": 50000,
  "period": "year",
  "managed_by": "Hội Khuyến học",
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
- `period`: `year` / `month` / `null` (một lần). `managed_by`: đơn vị quản lý, tối đa 120 ký tự.
- Tài khoản nhận tiền: mặc định mỗi quỹ một tài khoản riêng. Bật **Cài đặt › Cho phép nhiều quỹ dùng chung một tài khoản** (`PUT /api/settings { "fund_shared_account": "1" }`) thì nhiều quỹ của thôn nhập cùng số tài khoản; mỗi quỹ khi đó bắt buộc có `transfer_code` riêng. Tiền về được chia theo mã đó trong nội dung chuyển khoản (QR đã điền sẵn); không có mã thì vào mục Chưa phân loại để thủ quỹ chọn quỹ. Không bao giờ trùng tài khoản với thôn khác hay cửa hàng.
- `nature`: `mandatory` / `campaign` / `voluntary`. `transfer_code`: mã ngắn cho nội dung chuyển khoản (bỏ trống thì tự tạo).
- Không đổi trạng thái bằng PATCH (dùng mục 2.5). Quỹ đã khoá sổ không sửa được.

Tài liệu của quỹ:

```
GET    /api/funds/<id>/documents
POST   /api/funds/<id>/documents     { "name": "Nghị quyết.pdf", "data": "data:application/pdf;base64,..." }   # PDF, ảnh, Word, Excel ≤ 10MB
GET    /api/fund-documents/<docId>
DELETE /api/fund-documents/<docId>   # không gỡ được biên bản
```

### 2.3. Ghi một khoản thu

```
POST /api/funds/<id>/entries
{
  "type": "in",
  "amount": 200000,
  "source": "cash",
  "date": "2026-11-02",
  "payer_name": "Nguyễn Văn An",
  "payer_group": "Xóm Đình",
  "anonymous": false,
  "note": "Đóng quỹ xóm 1"
}
```

- `source`: `cash` (tiền mặt, ghi tay) hoặc `manual` (chuyển khoản vào tài khoản quỹ chưa có trong sổ). Tiền chuyển qua mã QR của quỹ tự vào sổ, không cần gọi API này.
- `bank_ref`: mã giao dịch ngân hàng, dùng khi `source = manual`. Một mã chỉ ghi được một lần.
- `payer_group`: xóm / địa chỉ người nộp (không bắt buộc), hiện trên trang công khai trừ khi ẩn danh.
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
- Thay cho `file`, có thể gửi `rows`: `[{ "date", "payer_name", "payer_group", "amount", "source", "bank_ref", "note", "anonymous" }]`.
- Dòng đầu của file là tiêu đề. Các cột: **Ngày** (`YYYY-MM-DD` hoặc `DD/MM/YYYY`), **Người nộp**, **Xóm** (không bắt buộc), **Số tiền**, **Hình thức** (`Tiền mặt` / `Chuyển khoản`), **Mã giao dịch**, **Ghi chú**, **Ẩn danh** (ghi `x` nếu ẩn danh).
- Hoặc ghi cả file, hoặc không ghi dòng nào: còn một dòng lỗi là không ghi gì, và API trả về lỗi theo từng dòng.

```json
{ "ok": true, "data": { "count": 3, "total": 300000, "imported": 0,
  "errors": [ { "line": 4, "error": "Số tiền không hợp lệ" } ] } }
```

### 2.5. Trạng thái quỹ: Ngừng thu, Mở thu lại, Khoá sổ, Mở khoá

```
GET  /api/funds/<id>/summary          # donors, total_in, total_out, balance, pending, out_no_receipt, progress
POST /api/funds/<id>/stop             { "note": "..." }                                    # quản lý quỹ
POST /api/funds/<id>/resume           { "end_date": "2026-12-31", "reason": "Gia hạn" }    # quản lý quỹ, bắt buộc hạn mới + lý do
POST /api/funds/<id>/lock             { "minutes": { "name": "bien-ban.pdf", "data": "..." }, "balance_note": "...", "note": "..." }   # Trưởng ban kiểm tra
POST /api/funds/<id>/unlock-requests  { "reason": "Ghi nhầm số tiền ...", "minutes": { ... } }
GET  /api/funds/<id>/unlock-requests
POST /api/fund-requests/<reqId>/approve      # Trưởng thôn (Người duyệt chi) và Trưởng ban kiểm tra, mỗi người một lần
POST /api/fund-requests/<reqId>/reject       { "reason": "..." }
POST /api/funds/<id>/clone            { "name": "Quỹ PCTT 2026" }                          # tạo quỹ mới từ quỹ cũ
GET  /api/fund-notices                       # thông báo 14 ngày gần nhất (tự ngừng thu…)
```

- **Ngừng thu**: không ghi thu, không tạo QR; phiếu chi vẫn lập và duyệt. Tiền chuyển vào sau đó nằm ở mục chưa phân loại.
- **Mở thu lại**: `round` + 1, nội dung chuyển khoản `<mã>-D<round>`. Tiền chuyển theo nội dung cũ vào mục chưa phân loại. Có thông báo cho người dân, ghi nhật ký.
- **Khoá sổ** cần: đang Ngừng thu, không còn phiếu nháp / chờ duyệt, mọi khoản chi có chứng từ, biên bản đính kèm, và nếu số dư khác 0 thì `balance_note` ghi rõ cách xử lý. Sau khi khoá: không thu, không chi, không sửa (chặn cả ở tầng cơ sở dữ liệu).
- **Mở khoá sổ**: đề nghị có lý do + biên bản; đủ chữ ký Trưởng thôn và Trưởng ban kiểm tra (hai người khác nhau) thì quỹ về Ngừng thu. Sửa sai bằng bút toán điều chỉnh.
- Thu cho năm / đợt sau: tạo quỹ mới (`clone` chép cấu hình, không chép tài khoản nhận và giao dịch).

### 2.6. Sổ thu chi và báo cáo

```
GET /api/funds/<id>/entries?from=2026-11-01&to=2026-11-30&type=in&status=approved
GET /api/funds/<id>/report?from=2026-11-01&to=2026-11-30
GET /api/funds/<id>/report/export?from=...&to=...   # file Excel
```

`report` trả về `opening_balance`, `income_cash`, `income_bank`, `expense`, `adjust`, `closing_balance` và danh sách bút toán trong kỳ.

### 2.7. Hộ dân

Danh sách hộ lấy từ trang Hành chính (Hộ & nhân khẩu) theo mã cộng đồng SKHG của thôn, tự đồng bộ mỗi đêm và khi bấm **Theo hộ › Đồng bộ danh sách hộ**. Sổ quỹ không lưu SĐT, chỉ lưu mã băm để tìm hộ của người đăng nhập App.

```
GET  /api/households?q=...            # mã hộ, chủ hộ, xóm, số nhân khẩu, diện hộ
POST /api/households/sync             # đồng bộ ngay (quản lý quỹ)
GET  /api/funds/<id>/households       # từng hộ: due, paid, remaining, exempt, done + tổng hợp
```

- Ghi thu cho một hộ: thêm `household_code` khi `POST /api/funds/<id>/entries` hoặc cột **Mã hộ** khi nhập Excel (tên chủ hộ, xóm tự điền).
- Quỹ: `exempt` = các diện hộ được miễn, mỗi dòng một diện (vd `Hộ nghèo`).
- Máy chủ cần `LANGSO_HANHCHINH_API` (vd `https://hanhchinh.xaphuongvietnam.vn/api`) và `LANGSO_KHOA_TICH_HOP` (trùng `LS_KHOA_TICH_HOP_SO_QUY` bên Hành chính).
