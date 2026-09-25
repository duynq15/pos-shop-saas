#!/bin/bash
# Chạy phần mềm bán hàng rồi tự mở trình duyệt
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
(sleep 1.5; xdg-open http://localhost:3000 >/dev/null 2>&1 || true) &
npm start
