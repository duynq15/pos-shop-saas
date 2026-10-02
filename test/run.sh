#!/bin/bash
# Chạy toàn bộ kiểm thử trên DB tạm (không đụng dữ liệu thật)
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
# API chạy với DATA_DIR nằm dưới thư mục chấm để bắt lỗi tải bản sao lưu (send bỏ qua dotfile)
mkdir -p "$TMP/.pos-data"
PORT=3111 DATA_DIR="$TMP/.pos-data" node server.js >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 30); do curl -s localhost:3111/api/settings >/dev/null 2>&1 && break; sleep 0.2; done
node test/api.test.js; A=$?
node test/immutability.test.js; I=$?
kill $PID; rm -rf "$TMP"; TMP=$(mktemp -d)
PORT=3111 DATA_DIR="$TMP" node server.js >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 30); do curl -s localhost:3111/api/settings >/dev/null 2>&1 && break; sleep 0.2; done
node test/ui.test.js; U=$?
kill $PID; rm -rf "$TMP"
[ $A -eq 0 ] && [ $I -eq 0 ] && [ $U -eq 0 ] && echo "ALL TESTS PASSED" || { echo "SOME TESTS FAILED"; exit 1; }
