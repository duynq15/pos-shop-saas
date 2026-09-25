#!/usr/bin/env bash
# One-click deploy POS Shop (SaaS) lên VPS bằng Docker + Caddy (tự SSL).
#
# Cách dùng trên VPS:
#   REPO_URL=https://github.com/<user>/pos-shop-saas.git \
#   DOMAIN=thanhtoanso.sangkienhunggia.app \
#   bash <(curl -fsSL https://raw.githubusercontent.com/<user>/pos-shop-saas/main/deploy/oneclick.sh)
#
# Hoặc chạy tại thư mục đã clone:
#   REPO_URL=$(git -C . remote get-url origin) bash deploy/oneclick.sh

set -euo pipefail

REPO_URL="${REPO_URL:-}"
DOMAIN="${DOMAIN:-thanhtoanso.sangkienhunggia.app}"
DIR="${DIR:-/opt/pos-shop-saas}"
BRANCH="${BRANCH:-main}"

say() { printf '\n\033[1;34m→ %s\033[0m\n' "$*"; }
gen() { head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20; }

if [ -z "$REPO_URL" ] && [ ! -d "$DIR/.git" ]; then
  echo "Thiếu REPO_URL. Ví dụ: REPO_URL=https://github.com/user/pos-shop-saas.git bash deploy/oneclick.sh"
  exit 1
fi

# 1) Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Cài Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Chưa có Docker Compose v2. Cài rồi chạy lại."; exit 1
fi

# 2) Mã nguồn
if [ -d "$DIR/.git" ]; then
  say "Cập nhật mã nguồn ($BRANCH)..."
  git -C "$DIR" fetch --all
  git -C "$DIR" checkout "$BRANCH"
  git -C "$DIR" pull origin "$BRANCH"
else
  say "Clone mã nguồn vào $DIR..."
  mkdir -p "$(dirname "$DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$DIR"
fi
cd "$DIR"

# 3) .env (chỉ tạo nếu chưa có — không ghi đè cấu hình cũ)
if [ ! -f .env ]; then
  say "Tạo .env với mật khẩu ngẫu nhiên..."
  cat > .env <<EOF
PORT=3000
HOST=0.0.0.0
DATA_DIR=/data
VQR_EXPOSED_USER=posshop
VQR_EXPOSED_PASS=$(gen)
VQR_SECRET=$(gen)
ROOT_PASS=$(gen)
ADMIN_PASS=$(gen)
SHOP_NAME=Cửa hàng mặc định
EOF
  chmod 600 .env
  echo "  Mật khẩu tạo sẵn (xem lại trong $DIR/.env):"
  grep -E "ADMIN_PASS|ROOT_PASS|VQR_EXPOSED_PASS" .env | sed 's/^/    /'
fi

# 4) Chạy
if [ "${MODE:-caddy}" = "caddy" ]; then
  say "Cấu hình Caddy cho $DOMAIN..."
  cat > deploy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy app:3000
}
EOF
  COMPOSE_FILE=docker-compose.prod.yml
  HEALTH_URL="https://$DOMAIN/api/health"
else
  say "Chế độ proxy (không Caddy) — app ở 127.0.0.1:3005..."
  COMPOSE_FILE=docker-compose.vps.yml
  HEALTH_URL="http://127.0.0.1:3005/api/health"
fi

say "Build & khởi động (có thể mất 1–3 phút)..."
docker compose -f "$COMPOSE_FILE" up -d --build

say "Kiểm tra..."
code=""
for i in 1 2 3 4 5 6; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 "$HEALTH_URL" || true)
  [ "$code" = "200" ] && break
  sleep 5
done
echo "  Health: ${code:-lỗi}"

if [ "${MODE:-caddy}" = "caddy" ]; then
cat <<EOF

✅ Hoàn tất.
   Truy cập:  https://$DOMAIN
   Đăng nhập: admin / (ADMIN_PASS trong $DIR/.env)
   Webhook VietQR khai báo cho đối tác:
     https://$DOMAIN/vqr/api/token_generate
     https://$DOMAIN/vqr/bank/api/transaction-sync
   Quản trị: docker compose -f $COMPOSE_FILE ps|logs|restart
EOF
else
cat <<EOF

✅ App đã chạy nội bộ tại http://127.0.0.1:3005
   VPS đã có reverse proxy giữ cổng 80/443 → thêm 1 site trỏ về 127.0.0.1:3005
   (xem deploy/reverse-proxy.md; nginx dùng certbot --nginx -d $DOMAIN).
   Sau đó: https://$DOMAIN · admin / (ADMIN_PASS trong $DIR/.env)
   Webhook VietQR khai báo cho đối tác:
     https://$DOMAIN/vqr/api/token_generate
     https://$DOMAIN/vqr/bank/api/transaction-sync
   Quản trị: docker compose -f $COMPOSE_FILE ps|logs|restart
EOF
fi
