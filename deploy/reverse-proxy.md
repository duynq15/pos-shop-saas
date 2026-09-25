# Cắm vào reverse proxy sẵn có (VPS đã chạy app khác)

VPS `auto-worker` đã chiếm cổng 80/443 (DDH trên 3001...). Vì vậy ta **không chạy Caddy riêng**, mà:
- Chạy POS Shop ở **cổng nội bộ `127.0.0.1:3005`** (compose `docker-compose.vps.yml`).
- Thêm 1 site vào reverse proxy sẵn có, trỏ về `thanhtoanso.sangkienhunggia.app`.

## Bước 1 — Chạy app (không Caddy)
```bash
cd /opt/pos-shop-saas
docker compose -f docker-compose.vps.yml up -d --build
curl -s http://127.0.0.1:3005/api/health   # {"ok":true,...}
```

## Bước 2 — Thêm site vào reverse proxy
Chạy `sudo ss -ltnp | grep -E ':80 |:443 '` và `docker ps` để biết proxy nào đang giữ cổng.

### Nếu là NGINX (host)
Tạo `/etc/nginx/sites-available/thanhtoanso.conf`:
```nginx
server {
    listen 80;
    server_name thanhtoanso.sangkienhunggia.app;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/thanhtoanso.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d thanhtoanso.sangkienhunggia.app   # cấp SSL
```

### Nếu là CADDY (host hoặc container) — thêm vào Caddyfile sẵn có
```
thanhtoanso.sangkienhunggia.app {
    encode gzip
    reverse_proxy 127.0.0.1:3005
}
```
(Nếu Caddy chạy trong container và app ở host: thay `127.0.0.1` bằng `172.17.0.1` hoặc `host.docker.internal`.)

### Nếu là TRAEFIK
Thêm label vào service `app` trong `docker-compose.vps.yml`:
```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.posshop.rule=Host(`thanhtoanso.sangkienhunggia.app`)"
      - "traefik.http.routers.posshop.entrypoints=websecure"
      - "traefik.http.routers.posshop.tls.certresolver=letsencrypt"
      - "traefik.http.services.posshop.loadbalancer.server.port=3000"
    networks: [traefik]
```
(và gắn network của Traefik.)

## Bước 3 — Kiểm tra
```bash
curl -s https://thanhtoanso.sangkienhunggia.app/api/health
```
Mở `https://thanhtoanso.sangkienhunggia.app` → đăng nhập `admin` / (ADMIN_PASS trong `.env`).

## Bước 4 — Khai báo webhook VietQR (domain mới)
```
https://thanhtoanso.sangkienhunggia.app/vqr/api/token_generate
https://thanhtoanso.sangkienhunggia.app/vqr/bank/api/transaction-sync
```
