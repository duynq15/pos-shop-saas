**TINGO PAY**

**TÀI LIỆU KỸ THUẬT API SERVICE**

**Module xuất hoá đơn tự động**

Phiên bản 1.1 · Tháng 09/2026 · Dành cho đối tác tích hợp

# Mục lục

**1. Giới thiệu**

**2. Môi trường kết nối**

**3. Xác thực**

**4. Luồng nghiệp vụ**

**5. Điều kiện sử dụng dịch vụ**

**6. Đặc tả API**

6.1 API Get Token

6.2 API Tạo đơn hàng

6.3 API Callback giao dịch

6.4 API Tra cứu đơn hàng

6.5 API Tra cứu hoá đơn

6.6 API Tải file PDF hoá đơn

6.7 API Callback hoá đơn

6.8 API Kiểm tra cấu hình xuất hoá đơn

**7. Thuế suất và cách tính tiền**

**8. Trạng thái đơn hàng và hoá đơn**

8.1 Đơn hàng — status

8.2 Đơn hàng — invoiceStatus

8.3 Hoá đơn — status

**9. Mã lỗi**

# 1. Giới thiệu

Tài liệu mô tả bộ API Service của module xuất hoá đơn tự động. Đối tác sử dụng bộ API này để tạo đơn hàng kèm mã thanh toán VietQR, nhận thông báo khi giao dịch thành công, và theo dõi hoá đơn điện tử được phát hành từ đơn hàng đó.

Khóa liên kết giữa đơn hàng, giao dịch thanh toán và hoá đơn là orderId.

Đối tác truyền orderId khi tạo đơn hàng. Cùng giá trị orderId được trả về trong callback giao dịch và dùng để tra cứu đơn hàng, tra cứu hoá đơn.

# 2. Môi trường kết nối

|  |  |
| --- | --- |
| **Môi trường** | **Base URL** |
| Kiểm thử | https://dev.vietqr.org/vqr |
| Vận hành | https://api.vietqr.org/vqr |

Toàn bộ API sử dụng HTTPS. Định dạng dữ liệu: application/json, trừ API tải PDF trả về file nhị phân.

# 3. Xác thực

Có hai chiều xác thực.

**Đối tác gọi API của VietQR**

* Gọi API Get Token với header Authorization: Basic Base64(username:password). Username và password do VietQR cấp sau khi khai báo kết nối.
* Dùng access\_token nhận được để gọi các API tạo đơn hàng, tra cứu đơn hàng, tra cứu hoá đơn, tải PDF và kiểm tra cấu hình.
* Header: Authorization: Bearer <access\_token>.
* Token có hiệu lực 300 giây. Hết hạn thì gọi lại API Get Token.

**VietQR gọi API của đối tác**

* Đối tác triển khai API Get Token và cung cấp username, password cho VietQR.
* VietQR lấy Bearer Token từ API Get Token của đối tác, sau đó gửi callback giao dịch và callback hoá đơn.

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| access\_token | String | Bearer Token |
| token\_type | String | Bearer |
| expires\_in | Integer | Thời hạn token, đơn vị giây. Giá trị: 300 |

# 4. Luồng nghiệp vụ

Module xử lý theo thứ tự: xác thực, tạo đơn hàng, thanh toán, nhận giao dịch, xuất hoá đơn, tra cứu kết quả.

|  |  |
| --- | --- |
| **Bước** | **Mô tả** |
| 1 | Đối tác gọi API Get Token của VietQR. |
| 2 | Đối tác gọi API Tạo đơn hàng: gửi danh sách hàng hoá, người mua và thông tin tài khoản nhận tiền. Hệ thống tạo đơn hàng, gán orderId, tính tổng tiền từ các dòng hàng và trả mã VietQR. |
| 3 | Người mua thanh toán bằng cách quét mã VietQR. Trên môi trường kiểm thử, đối tác gọi API giả lập thanh toán. |
| 4 | Khi giao dịch thành công, VietQR gửi callback giao dịch tới hệ thống đối tác. Trường orderId trong callback chính là orderId của đơn hàng đã tạo ở bước 2. |
| 5 | Hệ thống đối soát đơn hàng theo orderId. Nếu cấu hình xuất hoá đơn của tài khoản ngân hàng đang bật, hệ thống phát hành hoá đơn điện tử theo đúng hàng hoá và người mua trên đơn. |
| 6 | Khi hoá đơn được phát hành, VietQR gửi callback hoá đơn tới hệ thống đối tác, kèm orderId. |
| 7 | Đối tác có thể tra cứu đơn hàng, tra cứu hoá đơn hoặc tải file PDF theo orderId hoặc invoiceId. |

|  |
| --- |
| Get Token  → Tạo đơn hàng (orderId, items, buyer) + nhận mã VietQR  → Thanh toán  → Callback giao dịch (orderId)  → Xuất hoá đơn tự động  → Callback hoá đơn (orderId)  → Tra cứu đơn hàng / hoá đơn / tải PDF |

|  |
| --- |
| **Lưu ý:** Một đơn hàng tương ứng một giao dịch thanh toán và một hoá đơn gốc. Mọi đối soát giữa các bước đều dùng orderId. |

# 5. Điều kiện sử dụng dịch vụ

* Đã đăng ký tài khoản Tingo Pay.
* Đã liên kết tài khoản ngân hàng nhận tiền.
* Đã khai báo thông tin kết nối API và nhận username, password.
* Đã triển khai API Get Token và API Callback giao dịch trên hệ thống đối tác.
* Đã hoàn tất cấu hình xuất hoá đơn tự động trên cổng VietQR.vn hoặc ứng dụng VietQR: liên kết nhà cung cấp hoá đơn điện tử, chọn ký hiệu hoá đơn, bật cấu hình cho tài khoản ngân hàng, thiết lập khung giờ phát hành và thời gian chờ.

Cấu hình xuất hoá đơn thực hiện trên cổng VietQR, không thực hiện bằng API. API Kiểm tra cấu hình xuất hoá đơn dùng để xác nhận tài khoản đã sẵn sàng trước khi vận hành.

Nếu chưa bật cấu hình hoặc chưa có ký hiệu hoá đơn, đơn hàng và thanh toán vẫn được xử lý. Hoá đơn không được phát hành cho đến khi cấu hình đầy đủ.

# 6. Đặc tả API

API do VietQR cung cấp — đối tác gọi tới VietQR

|  |  |  |
| --- | --- | --- |
| **API** | **Endpoint** | **Mục đích** |
| Get Token | POST /api/token\_generate | Lấy Bearer Token |
| Tạo đơn hàng | POST /api/qr/generate-customer-order | Tạo đơn hàng và mã VietQR |
| Tra cứu đơn hàng | POST /api/order/query | Lấy trạng thái đơn hàng theo orderId |
| Tra cứu hoá đơn | POST /api/invoice/query | Lấy thông tin hoá đơn theo orderId hoặc invoiceId |
| Tải PDF hoá đơn | GET /api/invoice/export-pdf | Tải file PDF hoá đơn đã phát hành |
| Kiểm tra cấu hình | GET /api/invoice-config/status | Kiểm tra tài khoản đã sẵn sàng xuất hoá đơn |

API do đối tác triển khai — VietQR gọi tới hệ thống đối tác

|  |  |  |
| --- | --- | --- |
| **API** | **Endpoint** | **Mục đích** |
| Get Token | POST /<basepath>/api/token\_generate | Cấp Bearer Token cho VietQR |
| Callback giao dịch | POST /<basepath>/bank/api/transaction-sync | Nhận thông báo thanh toán, kèm orderId |
| Callback hoá đơn | POST /<basepath>/api/invoice-sync | Nhận thông báo kết quả phát hành hoá đơn, kèm orderId |

## 6.1 API Get Token

Cấp Bearer Token để đối tác gọi các API của module.

**POST** /vqr/api/token\_generate

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/api/token\_generate |
| Vận hành | https://api.vietqr.org/vqr/api/token\_generate |

### 6.1.1 Headers

|  |  |  |
| --- | --- | --- |
| **Name** | **Bắt buộc** | **Giá trị** |
| Authorization | Có | Basic Base64(username:password) |

Request không có body.

### 6.1.2 Response thành công — HTTP 200

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| access\_token | String | Bearer Token |
| token\_type | String | Bearer |
| expires\_in | Integer | 300 |

|  |
| --- |
| {  "access\_token": "eyJhbGciOiJIUzUxMiJ9....",  "token\_type": "Bearer",  "expires\_in": 300 } |

### 6.1.3 Response lỗi

|  |  |
| --- | --- |
| **HTTP** | **Mô tả** |
| 401 | Thiếu hoặc sai thông tin Basic Authentication |
| 400 | Không tạo được token |

### 6.1.4 Ví dụ

|  |
| --- |
| curl --location --request POST 'https://api.vietqr.org/vqr/api/token\_generate' \  --header 'Authorization: Basic <Base64(username:password)>' |

Đối tác cũng triển khai API Get Token trên hệ thống của mình với cùng cấu trúc request và response, để VietQR lấy token trước khi gửi callback.

## 6.2 API Tạo đơn hàng

Tạo đơn hàng gồm danh sách hàng hoá, thông tin người mua và mã VietQR để thanh toán. Số tiền trên mã VietQR bằng tổng thành tiền các dòng hàng, đã gồm thuế GTGT.

**POST** /vqr/api/qr/generate-customer-order

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/api/qr/generate-customer-order |
| Vận hành | https://api.vietqr.org/vqr/api/qr/generate-customer-order |

### 6.2.1 Headers

|  |  |  |
| --- | --- | --- |
| **Name** | **Bắt buộc** | **Giá trị** |
| Content-Type | Có | application/json |
| Authorization | Có | Bearer <access\_token> |

### 6.2.2 Request — thông tin thanh toán

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| bankCode | String | Có | Mã ngân hàng của tài khoản nhận tiền. Ví dụ: TPB, MB, BIDV. |
| bankAccount | String | Có | Số tài khoản ngân hàng nhận tiền. Tài khoản phải đã liên kết và đã khai báo kết nối. |
| userBankName | String | Có | Tên chủ tài khoản, không dấu. |
| content | String | Có | Nội dung chuyển tiền. Tối đa 23 ký tự, không dấu, không ký tự đặc biệt. |
| transType | String | Không | C: ghi có. D: ghi nợ. Mặc định C. |
| orderId | String | Không | Mã đơn hàng phía đối tác. Tối đa 13 ký tự, không dấu, không ký tự đặc biệt, không trùng. Nếu không gửi, hệ thống sinh mã dạng VQR-XXXXXXXX. orderId này dùng xuyên suốt callback và tra cứu. |
| qrType | Integer | Không | Loại mã thanh toán. Module này tạo mã động. Giá trị sử dụng: 0. |
| sign | String | Không | Chữ ký, nếu đối tác được yêu cầu ký request. |
| urlLink | String | Không | Đường dẫn chuyển đến sau thanh toán. |
| note | String | Không | Ghi chú. |
| additionalData | List | Không | Dữ liệu bổ sung do đối tác định nghĩa. |

|  |
| --- |
| **Lưu ý:** Không gửi field amount. Hệ thống tự tính amount = tổng (unitPriceAfterTax × quantity) của toàn bộ items. |

### 6.2.3 Request — buyer

Object. Không bắt buộc. Không gửi buyer thì hoá đơn ghi người mua vãng lai.

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| name | String | Không | Họ tên người mua. |
| companyName | String | Không | Tên đơn vị người mua. |
| taxCode | String | Không | Mã số thuế người mua. |
| address | String | Không | Địa chỉ người mua. |
| phone | String | Không | Số điện thoại người mua. |
| email | String | Không | Email nhận hoá đơn. |

### 6.2.4 Request — items

Mảng. Bắt buộc. Tối thiểu một phần tử.

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| code | String | Không | Mã hàng hoá, dịch vụ. |
| name | String | Có | Tên hàng hoá, dịch vụ. Không được rỗng. |
| quantity | Integer | Có | Số lượng. Giá trị tối thiểu: 1. |
| unit | String | Không | Đơn vị tính. Ví dụ: Lon, Cái, Lần. |
| unitPriceAfterTax | Long | Có | Đơn giá đã gồm thuế GTGT, đơn vị VND, số nguyên. Giá trị phải lớn hơn 0. |
| taxRate | String | Có | Thuế suất. Giá trị hợp lệ: "0", "5", "8", "10", "KCT", "KKKNT", "KHAC". |

### 6.2.5 Request mẫu

|  |
| --- |
| {  "content": "TT don pepsi08024",  "bankAccount": "05643598501",  "bankCode": "TPB",  "userBankName": "VU DUY ANH",  "transType": "C",  "orderId": "pepsi08024",  "qrType": 0,  "buyer": {  "name": "Tran Van B",  "taxCode": "9876543210",  "address": "12 Nguyen Hue, Q1, TP.HCM",  "phone": "0901234567",  "email": "b@example.com"  },  "items": [  {  "code": "SP001",  "name": "Pepsi lon 330ml",  "quantity": 5,  "unit": "Lon",  "unitPriceAfterTax": 10000,  "taxRate": "8"  },  {  "code": "SP002",  "name": "Coca lon 330ml",  "quantity": 2,  "unit": "Lon",  "unitPriceAfterTax": 10000,  "taxRate": "KCT"  }  ] } |

Với dữ liệu trên, số tiền thanh toán = 5 × 10.000 + 2 × 10.000 = 70.000 VND. orderId = pepsi08024.

### 6.2.6 Response thành công — HTTP 200

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| bankCode | String | Mã ngân hàng |
| bankName | String | Tên ngân hàng |
| bankAccount | String | Số tài khoản nhận tiền |
| userBankName | String | Tên chủ tài khoản |
| amount | String | Tổng tiền đơn hàng, đã gồm thuế GTGT |
| content | String | Nội dung chuyển tiền |
| qrCode | String | Chuỗi mã VietQR |
| imgId | String | Định danh ảnh ngân hàng |
| existing | Integer | 1: tạo thành công |
| transactionId | String | Định danh mã VietQR |
| transactionRefId | String | Mã tham chiếu mã VietQR |
| qrLink | String | Đường dẫn hiển thị mã VietQR |
| qrImage | String | Ảnh mã VietQR dạng Base64, nếu tài khoản có logo |
| orderId | String | Mã đơn hàng. Giá trị đối tác gửi hoặc hệ thống sinh |
| vaAccount | String | Tài khoản ảo, nếu ngân hàng hỗ trợ |
| terminalCode | String | Mã điểm bán, nếu có |
| subTerminalCode | String | Mã điểm bán phụ, nếu có |
| serviceCode | String | Mã sản phẩm, nếu có |
| additionalData | List | Dữ liệu bổ sung |

|  |
| --- |
| {  "bankCode": "TPB",  "bankName": "Ngan hang TMCP Tien Phong",  "bankAccount": "05643598501",  "userBankName": "VU DUY ANH",  "amount": "70000",  "content": "TT don pepsi08024",  "qrCode": "00020101021238...",  "imgId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  "existing": 1,  "transactionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  "transactionRefId": "base64\_ref",  "qrLink": "https://pro.vietqr.vn/qr-generated?token=...",  "orderId": "pepsi08024",  "vaAccount": "" } |

### 6.2.7 Response lỗi

|  |
| --- |
| {  "status": "FAILED",  "message": "E46" } |

|  |  |
| --- | --- |
| **Mã lỗi** | **Mô tả** |
| E46 | items không hợp lệ: rỗng, thiếu tên, số lượng nhỏ hơn 1, đơn giá không hợp lệ, thuế suất không đúng, hoặc tổng tiền bằng 0 |
| E34 | content hoặc orderId không đúng định dạng |
| E165 | orderId đã tồn tại |
| E25 | Không tìm thấy tài khoản ngân hàng đã liên kết |
| E77 | Tài khoản ngân hàng không khớp thông tin đăng ký |
| E76 | Đối tác chưa được cấp quyền sử dụng dịch vụ |
| E74 | Token không hợp lệ hoặc hết hạn |
| E05 | Lỗi hệ thống |

### 6.2.8 Ví dụ

|  |
| --- |
| curl --location 'https://api.vietqr.org/vqr/api/qr/generate-customer-order' \  --header 'Content-Type: application/json' \  --header 'Authorization: Bearer <access\_token>' \  --data '{ ... }' |

## 6.3 API Callback giao dịch

Đối tác triển khai API này trên hệ thống của mình. Khi người mua thanh toán thành công, VietQR gửi thông tin giao dịch tới endpoint này. Trường orderId trong nội dung gửi đi là mã đơn hàng đã tạo ở API Tạo đơn hàng. Đối tác dùng orderId để đối soát đơn hàng trên hệ thống của mình.

**POST** https://<host-doi-tac>/<basepath>/bank/api/transaction-sync

Đối tác cung cấp URL này khi khai báo kết nối.

### 6.3.1 Headers

|  |  |
| --- | --- |
| **Name** | **Giá trị** |
| Content-Type | application/json |
| Authorization | Bearer <token đối tác cấp qua API Get Token của đối tác> |

### 6.3.2 Request body — VietQR gửi tới đối tác

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| bankaccount | String | Có | Số tài khoản nhận tiền |
| amount | Long | Có | Số tiền giao dịch |
| transType | String | Có | C: ghi có. D: ghi nợ |
| content | String | Có | Nội dung chuyển tiền |
| transactionid | String | Có | Định danh giao dịch trên hệ thống VietQR |
| transactiontime | Long | Có | Thời điểm giao dịch, timestamp mili giây |
| referencenumber | String | Có | Mã tham chiếu giao dịch ngân hàng |
| orderId | String | Có | Mã đơn hàng. Khớp với orderId khi tạo đơn hàng |
| terminalCode | String | Không | Mã điểm bán |
| subTerminalCode | String | Không | Mã điểm bán phụ |
| serviceCode | String | Không | Mã sản phẩm, dịch vụ |
| urlLink | String | Không | Đường dẫn sau thanh toán |
| sign | String | Không | Chữ ký |

|  |
| --- |
| {  "bankaccount": "05643598501",  "amount": 70000,  "transType": "C",  "content": "TT don pepsi08024",  "transactionid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  "transactiontime": 1757387821000,  "referencenumber": "FT260909xxxxxx",  "orderId": "pepsi08024" } |

|  |
| --- |
| **Lưu ý:** Đối soát đơn hàng bằng orderId. Ví dụ trên tương ứng đơn hàng pepsi08024 đã tạo trước đó. |

### 6.3.3 Response đối tác trả về

HTTP 200 — đã nhận thành công

|  |
| --- |
| {  "error": false,  "errorReason": "",  "toastMessage": "",  "object": {  "reftransactionid": "ma\_tham\_chieu\_phia\_doi\_tac"  } } |

HTTP 400 — không xử lý được

|  |
| --- |
| {  "error": true,  "errorReason": "INVALID\_TOKEN",  "toastMessage": "Token khong hop le",  "object": null } |

Đối tác cần trả HTTP 200 khi đã nhận và lưu giao dịch. Nếu không nhận được HTTP 200, VietQR gửi lại callback.

### 6.3.4 Môi trường kiểm thử

Trên môi trường kiểm thử, đối tác gọi API giả lập thanh toán sau khi tạo đơn hàng. Truyền đúng bankAccount, amount và content của đơn vừa tạo để hệ thống đối soát theo orderId và gửi callback giao dịch.

**POST** /vqr/bank/api/test/transaction-callback

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/bank/api/test/transaction-callback |

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| bankAccount | String | Có | Số tài khoản nhận tiền |
| content | String | Có | Nội dung chuyển tiền, trùng với đơn hàng |
| amount | Long | Có | Số tiền, trùng với tổng tiền đơn hàng |
| transType | String | Có | C |
| bankCode | String | Có | Mã ngân hàng |

## 6.4 API Tra cứu đơn hàng

Lấy trạng thái đơn hàng, chi tiết hàng hoá, người mua và tình trạng xuất hoá đơn theo orderId.

**POST** /vqr/api/order/query

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/api/order/query |
| Vận hành | https://api.vietqr.org/vqr/api/order/query |

### 6.4.1 Headers

|  |  |  |
| --- | --- | --- |
| **Name** | **Bắt buộc** | **Giá trị** |
| Content-Type | Có | application/json |
| Authorization | Có | Bearer <access\_token> |

### 6.4.2 Request

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| bankAccount | String | Có | Số tài khoản nhận tiền |
| orderId | String | Có | Mã đơn hàng |

|  |
| --- |
| {  "bankAccount": "05643598501",  "orderId": "pepsi08024" } |

### 6.4.3 Response thành công — HTTP 200

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| orderId | String | Mã đơn hàng |
| status | String | PENDING: chờ thanh toán. PAID: đã thanh toán. EXPIRED: hết hạn. CANCELLED: đã hủy. FAILED: lỗi |
| invoiceStatus | String | NONE: chưa xuất. WAITING: đang chờ xuất. ISSUED: đã phát hành. FAILED: xuất lỗi. SKIPPED: không xuất |
| invoiceId | String | Mã hoá đơn, có khi đã lập hoá đơn |
| amount | Long | Tổng tiền đã gồm thuế GTGT, đơn vị VND |
| bankAccount | String | Số tài khoản nhận tiền |
| bankCode | String | Mã ngân hàng |
| content | String | Nội dung chuyển tiền |
| createdAt | String | Thời điểm tạo đơn, ISO-8601, múi giờ Việt Nam |
| updatedAt | String | Thời điểm cập nhật gần nhất |
| paidAt | String | Thời điểm thanh toán. null nếu chưa thanh toán |
| buyer | Object | Người mua. null nếu vãng lai |
| items | Array | Danh sách hàng hoá, kèm tiền chưa thuế và tiền thuế từng dòng |

items[]

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| code | String | Mã hàng hoá |
| name | String | Tên hàng hoá |
| quantity | Integer | Số lượng |
| unit | String | Đơn vị tính |
| unitPriceAfterTax | Long | Đơn giá đã gồm thuế |
| taxRate | String | Thuế suất |
| lineAmountAfterTax | Long | Thành tiền đã gồm thuế = unitPriceAfterTax × quantity |
| linePreTax | Long | Thành tiền chưa thuế, đã làm tròn |
| lineTax | Long | Tiền thuế = lineAmountAfterTax − linePreTax |

|  |
| --- |
| {  "status": "SUCCESS",  "message": "",  "data": {  "orderId": "pepsi08024",  "status": "PAID",  "invoiceStatus": "ISSUED",  "invoiceId": "inv\_xxxxxxxx",  "amount": 70000,  "bankAccount": "05643598501",  "bankCode": "TPB",  "content": "TT don pepsi08024",  "createdAt": "2026-09-09T10:15:00+07:00",  "paidAt": "2026-09-09T10:17:01+07:00",  "buyer": {  "name": "Tran Van B",  "taxCode": "9876543210",  "email": "b@example.com"  },  "items": [  {  "code": "SP001",  "name": "Pepsi lon 330ml",  "quantity": 5,  "unit": "Lon",  "unitPriceAfterTax": 10000,  "taxRate": "8",  "lineAmountAfterTax": 50000,  "linePreTax": 46296,  "lineTax": 3704  }  ]  } } |

Mã lỗi: E46 thiếu tham số. E96 không tìm thấy đơn hàng. E74 token không hợp lệ. E76, E77 tài khoản không thuộc đối tác.

## 6.5 API Tra cứu hoá đơn

Lấy thông tin hoá đơn điện tử đã lập từ đơn hàng.

**POST** /vqr/api/invoice/query

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/api/invoice/query |
| Vận hành | https://api.vietqr.org/vqr/api/invoice/query |

### 6.5.1 Headers

|  |  |  |
| --- | --- | --- |
| **Name** | **Bắt buộc** | **Giá trị** |
| Content-Type | Có | application/json |
| Authorization | Có | Bearer <access\_token> |

### 6.5.2 Request

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| bankAccount | String | Có | Số tài khoản nhận tiền |
| orderId | String | Có, nếu không gửi invoiceId | Mã đơn hàng |
| invoiceId | String | Không | Mã hoá đơn nhận từ tra cứu đơn hàng hoặc callback hoá đơn |

|  |
| --- |
| {  "bankAccount": "05643598501",  "orderId": "pepsi08024" } |

### 6.5.3 Response thành công — HTTP 200

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| invoiceId | String | Mã hoá đơn |
| orderId | String | Mã đơn hàng nguồn |
| invoiceCode | String | Mã hoá đơn điện tử |
| serial | String | Ký hiệu hoá đơn |
| invoiceNumber | String | Số hoá đơn, khi đã được cấp |
| date | String | Ngày hoá đơn, định dạng yyyy-MM-dd |
| currency | String | VND |
| status | Integer | Trạng thái phát hành. Xem mục 8 |
| statusDesc | String | Mô tả trạng thái |
| paymentStatus | Integer | 0: chưa thanh toán. 1: đã thanh toán. 2: thanh toán một phần |
| customerName | String | Tên người mua |
| customerCompanyName | String | Tên đơn vị mua |
| customerTaxCode | String | Mã số thuế người mua |
| customerFullAddress | String | Địa chỉ người mua |
| customerPhone | String | Số điện thoại người mua |
| customerEmail | String | Email người mua |
| total | Long | Tổng tiền trước thuế |
| taxMoney | Long | Tổng tiền thuế |
| totalAfterTax | Long | Tổng thanh toán, đã gồm thuế |
| totalAfterTaxVnese | String | Tổng tiền bằng chữ |
| paymentMethod | Integer | 1: TM/CK. 2: tiền mặt. 3: chuyển khoản. 4: đối trừ công nợ. 5: không thu tiền. Thanh toán VietQR: 1 |
| invoiceProduct | Array | Danh sách dòng hàng trên hoá đơn |
| pdfAvailable | Boolean | true nếu có thể tải PDF |

invoiceProduct[]

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| no | Integer | Số thứ tự |
| productId | String | Mã hàng hoá |
| name | String | Tên hàng hoá, dịch vụ |
| unit | String | Đơn vị tính |
| quantity | Integer | Số lượng |
| unitPrice | Long | Đơn giá chưa thuế |
| unitPriceAfterTax | Long | Thành tiền đã gồm thuế |
| taxRate | String | Thuế suất |
| taxMoney | Long | Tiền thuế |
| totalUnitPrice | Long | Thành tiền chưa thuế |
| totalUnitPriceAfterTax | Long | Thành tiền đã gồm thuế |
| type | Integer | 1: hàng hoá, dịch vụ |

|  |
| --- |
| {  "status": "SUCCESS",  "message": "",  "data": {  "invoiceId": "inv\_xxxxxxxx",  "orderId": "pepsi08024",  "invoiceCode": "2C25TAA.............",  "serial": "C25TAA",  "invoiceNumber": "0000123",  "date": "2026-09-09",  "currency": "VND",  "status": 5,  "statusDesc": "AUTHORITY\_ACCEPT",  "paymentStatus": 1,  "customerName": "Tran Van B",  "customerTaxCode": "9876543210",  "total": 64815,  "taxMoney": 5185,  "totalAfterTax": 70000,  "paymentMethod": 1,  "pdfAvailable": true,  "invoiceProduct": []  } } |

Mã lỗi: E46 thiếu tham số. E96 không tìm thấy hoá đơn. E74 token không hợp lệ.

## 6.6 API Tải file PDF hoá đơn

Tải bản PDF của hoá đơn đã phát hành.

**GET** /vqr/api/invoice/export-pdf

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/api/invoice/export-pdf?invoiceId={invoiceId} |
| Vận hành | https://api.vietqr.org/vqr/api/invoice/export-pdf?invoiceId={invoiceId} |

|  |  |  |
| --- | --- | --- |
| **Tham số** | **Bắt buộc** | **Mô tả** |
| Authorization | Có | Bearer <access\_token> |
| invoiceId | Có | Mã hoá đơn, truyền trên query |

Response HTTP 200: Content-Type application/pdf, nội dung là file PDF.

Response HTTP 400: hoá đơn chưa phát hành hoặc không thuộc đối tác.

|  |
| --- |
| curl --location 'https://api.vietqr.org/vqr/api/invoice/export-pdf?invoiceId=inv\_xxxxxxxx' \  --header 'Authorization: Bearer <access\_token>' \  --output hoa-don.pdf |

## 6.7 API Callback hoá đơn

Đối tác triển khai API này trên hệ thống của mình. Khi hoá đơn được phát hành, VietQR gửi kết quả tới endpoint này. Trường orderId khớp với đơn hàng và với callback giao dịch trước đó.

**POST** https://<host-doi-tac>/<basepath>/api/invoice-sync

Đối tác cung cấp URL này khi khai báo kết nối.

### 6.7.1 Headers

|  |  |
| --- | --- |
| **Name** | **Giá trị** |
| Content-Type | application/json |
| Authorization | Bearer <token đối tác cấp qua API Get Token của đối tác> |

### 6.7.2 Request body — VietQR gửi tới đối tác

|  |  |  |  |
| --- | --- | --- | --- |
| **Field** | **Type** | **Bắt buộc** | **Mô tả** |
| bankAccount | String | Có | Số tài khoản nhận tiền |
| orderId | String | Có | Mã đơn hàng |
| invoiceId | String | Có | Mã hoá đơn |
| invoiceCode | String | Không | Mã hoá đơn điện tử |
| serial | String | Không | Ký hiệu hoá đơn |
| invoiceNumber | String | Không | Số hoá đơn, khi đã được cấp |
| date | String | Có | Ngày hoá đơn, yyyy-MM-dd |
| amount | Long | Có | Tổng tiền sau thuế |
| taxMoney | Long | Không | Tổng tiền thuế |
| status | Integer | Có | Trạng thái phát hành. Xem mục 8 |
| invoiceStatus | String | Có | WAITING, ISSUED, FAILED, SKIPPED |
| buyerName | String | Không | Tên người mua |
| buyerTaxCode | String | Không | Mã số thuế người mua |
| issuedAt | Long | Không | Thời điểm phát hành, timestamp mili giây |

|  |
| --- |
| {  "bankAccount": "05643598501",  "orderId": "pepsi08024",  "invoiceId": "inv\_xxxxxxxx",  "invoiceCode": "2C25TAA.............",  "serial": "C25TAA",  "invoiceNumber": "0000123",  "date": "2026-09-09",  "amount": 70000,  "taxMoney": 5185,  "status": 5,  "invoiceStatus": "ISSUED",  "buyerName": "Tran Van B",  "buyerTaxCode": "9876543210",  "issuedAt": 1757387820000 } |

### 6.7.3 Response đối tác trả về

|  |
| --- |
| {  "error": false,  "errorReason": "",  "toastMessage": "",  "object": {  "refid": "ma\_tham\_chieu\_phia\_doi\_tac"  } } |

Đối tác trả HTTP 200 khi đã nhận dữ liệu. VietQR gửi lại callback nếu không nhận được HTTP 200.

## 6.8 API Kiểm tra cấu hình xuất hoá đơn

Kiểm tra tài khoản ngân hàng đã được bật xuất hoá đơn tự động hay chưa. API chỉ đọc. Việc tạo và chỉnh sửa cấu hình thực hiện trên cổng VietQR.vn hoặc ứng dụng VietQR.

**GET** /vqr/api/invoice-config/status

|  |  |
| --- | --- |
| **Môi trường** | **URL** |
| Kiểm thử | https://dev.vietqr.org/vqr/api/invoice-config/status?bankAccount={stk} |
| Vận hành | https://api.vietqr.org/vqr/api/invoice-config/status?bankAccount={stk} |

|  |  |  |
| --- | --- | --- |
| **Tham số** | **Bắt buộc** | **Mô tả** |
| Authorization | Có | Bearer <access\_token> |
| bankAccount | Có | Số tài khoản nhận tiền, truyền trên query |

|  |  |  |
| --- | --- | --- |
| **Field** | **Type** | **Mô tả** |
| enabled | Boolean | true: đã bật xuất hoá đơn tự động |
| ready | Boolean | true: đã bật cấu hình và đã có ký hiệu hoá đơn |
| bankAccount | String | Số tài khoản |
| bankCode | String | Mã ngân hàng |
| invoiceSerial | String | Ký hiệu hoá đơn. Rỗng nếu chưa chọn |
| fromTime | String | Giờ bắt đầu cho phép xuất hoá đơn, HH:mm, múi giờ Việt Nam |
| toTime | String | Giờ kết thúc cho phép xuất hoá đơn, HH:mm, múi giờ Việt Nam |
| timeWaitingHour | Double | Thời gian chờ trước khi phát hành, đơn vị giờ |

|  |
| --- |
| {  "status": "SUCCESS",  "data": {  "enabled": true,  "ready": true,  "bankAccount": "05643598501",  "bankCode": "TPB",  "invoiceSerial": "C25TAA",  "fromTime": "00:00",  "toTime": "23:59",  "timeWaitingHour": 0.5  } } |

Nên kiểm tra ready = true trước khi đưa dịch vụ vào vận hành. Giao dịch phát sinh ngoài khung giờ fromTime–toTime vẫn được thanh toán và gửi callback giao dịch. Hoá đơn không xuất tự động, invoiceStatus = SKIPPED.

# 7. Thuế suất và cách tính tiền

|  |  |
| --- | --- |
| **taxRate** | **Thuế suất** |
| 0 | 0% |
| 5 | 5% |
| 8 | 8% |
| 10 | 10% |
| KCT | Không chịu thuế |
| KKKNT | Không kê khai, nộp thuế |
| KHAC | Khác |

Đối tác gửi đơn giá đã gồm thuế. Hệ thống tính từng dòng hàng như sau.

|  |
| --- |
| lineAmountAfterTax = unitPriceAfterTax × quantity taxRateFraction = 0,08 nếu taxRate = "8"; 0 nếu taxRate là KCT, KKKNT hoặc KHAC linePreTax = round(lineAmountAfterTax / (1 + taxRateFraction)) lineTax = lineAmountAfterTax − linePreTax  Tổng tiền thanh toán = Σ lineAmountAfterTax Tổng tiền trước thuế = Σ linePreTax Tổng tiền thuế = Σ lineTax |

Ví dụ: 5 lon, đơn giá 10.000 VND, taxRate = 8.

* lineAmountAfterTax = 50.000
* linePreTax = round(50.000 / 1,08) = 46.296
* lineTax = 3.704

# 8. Trạng thái đơn hàng và hoá đơn

## 8.1 Đơn hàng — status

|  |  |
| --- | --- |
| **Giá trị** | **Mô tả** |
| PENDING | Đã tạo đơn hàng, chờ thanh toán |
| PAID | Đã thanh toán |
| EXPIRED | Hết hạn thanh toán |
| CANCELLED | Đã hủy |
| FAILED | Thanh toán không thành công |

## 8.2 Đơn hàng — invoiceStatus

|  |  |
| --- | --- |
| **Giá trị** | **Mô tả** |
| NONE | Chưa đưa vào luồng xuất hoá đơn |
| WAITING | Đang chờ phát hành |
| ISSUED | Đã phát hành |
| FAILED | Phát hành không thành công |
| SKIPPED | Không xuất. Nguyên nhân: ngoài khung giờ, chưa có ký hiệu hoá đơn, hoặc cấu hình đang tắt |

## 8.3 Hoá đơn — status

|  |  |  |
| --- | --- | --- |
| **status** | **statusDesc** | **Mô tả** |
| 0 | NOT\_SENT\_TO\_AUTHORITY | Chưa gửi cơ quan thuế |
| 1 | WAITING\_FOR\_AUTHORITY | Đã ký, đang chờ cơ quan thuế |
| 2 | SENDING\_TAX | Đang gửi cơ quan thuế |
| 3 | AUTHORITY\_CODE\_GIVEN | Đã cấp mã |
| 4 | AUTHORITY\_CODE\_NOT\_GIVEN | Không cấp mã |
| 5 | AUTHORITY\_ACCEPT | Cơ quan thuế chấp nhận |
| 6 | AUTHORITY\_DENY | Cơ quan thuế từ chối |
| 7 | SEND\_ERROR | Gửi lỗi |
| 8 | SIGN\_ERROR | Ký lỗi |

# 9. Mã lỗi

|  |  |
| --- | --- |
| **Mã lỗi** | **Mô tả** |
| E05 | Lỗi hệ thống |
| E25 | Không tìm thấy tài khoản ngân hàng đã liên kết |
| E34 | content hoặc orderId không hợp lệ |
| E46 | Dữ liệu gửi lên không hợp lệ |
| E74 | Token không hợp lệ hoặc hết hạn |
| E76 | Đối tác chưa được cấp quyền sử dụng dịch vụ |
| E77 | Tài khoản ngân hàng không khớp thông tin đăng ký |
| E96 | Không tìm thấy đơn hàng hoặc hoá đơn |
| E165 | orderId đã tồn tại |