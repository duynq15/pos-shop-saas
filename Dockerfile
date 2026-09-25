# POS Shop – SaaS (đa cửa hàng)
FROM node:22-alpine

WORKDIR /app

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
