# Triển khai môi trường dev

Có 2 cách để có **URL public** cho VietQR gọi webhook.

## Cách 1 – Nhanh: tunnel từ máy đang chạy (không cần server)

Dùng khi cần URL dev gấp để test với VietQR.

```bash
# 1) Chạy app ở chế độ dev (ví dụ cổng 3200, dữ liệu riêng)
cd pos-shop-saas
PORT=3200 HOST=127.0.0.1 DATA_DIR=./data-dev \
  VQR_EXPOSED_USER=posshop VQR_EXPOSED_PASS=mat-khau-cua-ban VQR_SECRET=chuoi-bi-mat \
  node server.js &

# 2) Mở tunnel (đã cài cloudflared)
cloudflared tunnel --url http://localhost:3200 --no-autoupdate
# -> in ra URL dạng https://xxxx.trycloudflare.com
```

Webhook để khai báo với VietQR:
```
https://xxxx.trycloudflare.com/vqr/api/token_generate
https://xxxx.trycloudflare.com/vqr/bank/api/transaction-sync
```
> URL `trycloudflare.com` **đổi mỗi lần chạy**. Muốn cố định, dùng Cách 2 hoặc named tunnel có domain.

## Cách 2 – Ổn định: Docker trên VPS

```bash
# Trên VPS (đã cài docker + compose)
git clone <repo> && cd pos-shop-saas
cp .env.example .env      # sửa PORT, mật khẩu, VQR_EXPOSED_*, VQR_SECRET
docker compose up -d --build
```

Đặt sau reverse proxy có SSL (Nginx/Caddy) trỏ về cổng 3000. Ví dụ Caddy:
```
pos-dev.tenban.vn {
    reverse_proxy 127.0.0.1:3000
}
```
Webhook khi đó là:
```
https://pos-dev.tenban.vn/vqr/api/token_generate
https://pos-dev.tenban.vn/vqr/bank/api/transaction-sync
```

## Biến môi trường quan trọng
| Biến | Ý nghĩa |
|---|---|
| `DATA_DIR` | Nơi lưu dữ liệu (control.db + từng tenant). Đặt volume để không mất khi rebuild |
| `VQR_EXPOSED_USER` / `VQR_EXPOSED_PASS` | Basic Auth **mình cấp cho VietQR** để gọi webhook |
| `VQR_SECRET` | Chuỗi ký token callback — đổi trước GoLive |
| `PORT` / `HOST` | Cổng/địa chỉ lắng nghe |

## Kiểm tra sau khi dựng
```bash
curl https://<url>/api/health                 # {"ok":true,...}
# Lấy token webhook (Basic Auth):
curl -u $VQR_EXPOSED_USER:$VQR_EXPOSED_PASS -X POST https://<url>/vqr/api/token_generate
```
Sau đó vào **Cài đặt → VietQR động** của shop, nhập credentials do VietQR cấp, bấm **Kiểm tra kết nối**.

## Bảo mật tối thiểu trước khi mở public
- Đổi mật khẩu `root`/`admin` và `VQR_EXPOSED_PASS`, `VQR_SECRET`.
- Nên thêm HTTPS (tunnel đã có sẵn https) và cân nhắc giới hạn IP cho endpoint đăng nhập.
