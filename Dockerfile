# POS Shop – SaaS (đa cửa hàng)
FROM node:24-alpine

WORKDIR /app

# Giờ địa phương: "hôm nay", báo cáo theo ngày và kiểm tra 02:00 đều tính theo giờ VN
RUN apk add --no-cache tzdata
ENV TZ=Asia/Ho_Chi_Minh

# Cài phụ thuộc trước để tận dụng cache layer
COPY package*.json ./
RUN npm install --omit=dev

# Mã nguồn
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
