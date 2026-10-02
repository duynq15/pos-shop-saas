// Sinh icon PNG cho PWA (GĐ4.4) bằng zlib có sẵn, không thêm thư viện ảnh.
// Hình: nền xanh primary bo góc, ký hiệu "₫" vẽ bằng khối đơn giản. Chạy: node scripts/make-icons.js
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');

function png(size) {
  const bg = [0x1e, 0x40, 0xaf]; const fg = [255, 255, 255];
  const r = size * 0.18; // bo góc
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const inRound = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r); const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // "₫": thân chữ d (vòng tròn + cột phải), gạch ngang trên cột, gạch dưới chân
  const u = size / 100;
  const isGlyph = (x, y) => {
    const ring = Math.hypot(x - 46 * u, y - 52 * u); if (ring <= 18 * u && ring >= 10 * u) return true;
    if (x >= 60 * u && x <= 68 * u && y >= 22 * u && y <= 70 * u) return true;
    if (x >= 52 * u && x <= 76 * u && y >= 28 * u && y <= 33 * u) return true;
    if (x >= 28 * u && x <= 68 * u && y >= 76 * u && y <= 81 * u) return true;
    return false;
  };
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (!inRound(x + 0.5, y + 0.5)) { raw[o + 3] = 0; continue; }
      const c = isGlyph(x + 0.5, y + 0.5) ? fg : bg;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [192, 512]) fs.writeFileSync(path.join(__dirname, '..', 'public', `icon-${s}.png`), png(s));
console.log('Đã tạo public/icon-192.png, public/icon-512.png');
