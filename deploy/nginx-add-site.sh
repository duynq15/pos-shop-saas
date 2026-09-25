#!/usr/bin/env bash
# Thêm site nginx cho POS Shop (proxy về app nội bộ) + cấp SSL.
# Chạy bằng root/sudo:
#   DOMAIN=thanhtoanso.sangkienhunggia.app PORT=3005 sudo -E bash deploy/nginx-add-site.sh

set -euo pipefail

DOMAIN="${DOMAIN:-thanhtoanso.sangkienhunggia.app}"
PORT="${PORT:-3005}"
NAME="${NAME:-$DOMAIN}"
CONF="/etc/nginx/sites-available/$NAME.conf"

if [ "$(id -u)" != "0" ]; then echo "Cần chạy bằng root/sudo."; exit 1; fi
if ! command -v nginx >/dev/null 2>&1; then echo "Chưa có nginx."; exit 1; fi

echo "→ Ghi cấu hình $CONF (proxy -> 127.0.0.1:$PORT)"
cat > "$CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "$CONF" "/etc/nginx/sites-enabled/$NAME.conf"
nginx -t
systemctl reload nginx
echo "→ Đã bật site $DOMAIN"

# SSL
if command -v certbot >/dev/null 2>&1; then
  echo "→ Cấp SSL (certbot)..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
    || echo "!! certbot cần chạy tay: certbot --nginx -d $DOMAIN"
else
  echo "Chưa có certbot. Cài rồi chạy lại:"
  echo "  apt-get update && apt-get install -y certbot python3-certbot-nginx"
  echo "  certbot --nginx -d $DOMAIN"
fi

echo
echo "→ Kiểm tra: curl -s https://$DOMAIN/api/health"
