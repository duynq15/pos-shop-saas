# Deploy lên VPS – thanhtoanso.sangkienhunggia.app

Bộ file đã sẵn sàng: `Dockerfile`, `docker-compose.prod.yml` (app + Caddy tự SSL), `deploy/Caddyfile`, `.env.example`.

## 1. Trỏ DNS
Tạo bản ghi **A**: `thanhtoanso` → **IP VPS** (trong trang quản lý tên miền `sangkienhunggia.app`).
Kiểm tra: `dig +short thanhtoanso.sangkienhunggia.app` phải ra IP VPS. (Caddy cần DNS trỏ đúng mới cấp được SSL.)

## 2. Cài Docker trên VPS (Ubuntu)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # rồi logout/login lại
docker compose version
```

## 3. Đưa mã nguồn lên VPS
Từ máy đang có code:
```bash
rsync -av --exclude node_modules --exclude data --exclude data-dev \
  pos-shop-saas/ user@<IP_VPS>:/opt/pos-shop-saas/
```
(hoặc `git clone` nếu bạn đã đẩy lên repo.)

## 4. Cấu hình `.env`
Trên VPS:
```bash
cd /opt/pos-shop-saas
cp .env.example .env
nano .env
```
Sửa các giá trị quan trọng:
```
VQR_EXPOSED_USER=posshop
VQR_EXPOSED_PASS=<mật khẩu mạnh>
VQR_SECRET=<chuỗi bí mật>
ROOT_PASS=<mật khẩu root mạnh>
ADMIN_PASS=<mật khẩu admin mạnh>
SHOP_NAME=Cửa hàng mặc định
```

## 5. Mở firewall
```bash
sudo ufw allow 22,80,443/tcp
```

## 6. Chạy
```bash
cd /opt/pos-shop-saas
docker compose -f docker-compose.prod.yml up -d --build
```
Caddy tự xin chứng chỉ SSL cho `thanhtoanso.sangkienhunggia.app`.

## 7. Kiểm tra
```bash
curl -s https://thanhtoanso.sangkienhunggia.app/api/health
# {"ok":true,...}
```
Mở `https://thanhtoanso.sangkienhunggia.app` → đăng nhập `admin / <ADMIN_PASS>`.

## 8. Cập nhật webhook VietQR (quan trọng)
Khai báo lại với VietQR URL mới (thay URL tunnel):
```
https://thanhtoanso.sangkienhunggia.app/vqr/api/token_generate
https://thanhtoanso.sangkienhunggia.app/vqr/bank/api/transaction-sync
```
Basic Auth: `posshop / <VQR_EXPOSED_PASS>`, URL Path: `/vqr`.

## 9. Cập nhật phần mềm về sau
```bash
cd /opt/pos-shop-saas
git pull            # hoặc rsync lại mã nguồn
docker compose -f docker-compose.prod.yml up -d --build
```

## 10. Sao lưu
- Dữ liệu nằm trong **volume Docker** `pos-data` (mỗi tenant một DB).
- Trong app: **Cài đặt → Dữ liệu & sao lưu** có nút Sao lưu/Tải/Phục hồi.
- Hoặc backup volume:
```bash
docker run --rm -v pos-shop-saas_pos-data:/data -v $PWD:/backup alpine \
  tar czf /backup/pos-backup-$(date +%F).tgz -C /data .
```

## Lệnh quản trị
```bash
docker compose -f docker-compose.prod.yml ps        # trạng thái
docker compose -f docker-compose.prod.yml logs -f   # xem log
docker compose -f docker-compose.prod.yml restart   # khởi động lại
docker compose -f docker-compose.prod.yml down      # dừng
```
