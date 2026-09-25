'use strict';

// Sinh mã vạch nội bộ dạng EAN-13 với tiền tố "2" (dải GS1 dành cho nội bộ cửa hàng).
// Bảo đảm duy nhất bằng bộ đếm lưu trong bảng settings.

function ean13Check(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function barcodeExists(db, code) {
  const row = db.prepare(
    `SELECT 1 FROM products WHERE barcode=? UNION SELECT 1 FROM product_units WHERE barcode=? LIMIT 1`
  ).get(code, code);
  return !!row;
}

function nextInternalBarcode(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='internal_barcode_seq'").get();
  let seq = Number((row && row.value) || 0);
  for (let n = 0; n < 1000000; n++) {
    seq++;
    if (seq > 99999999999) throw new Error('Đã hết dải mã vạch nội bộ');
    const body = '2' + String(seq).padStart(11, '0');
    const code = body + ean13Check(body);
    if (!barcodeExists(db, code)) {
      db.prepare("INSERT INTO settings(key,value) VALUES('internal_barcode_seq',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(seq));
      return code;
    }
  }
  throw new Error('Không sinh được mã vạch nội bộ');
}

module.exports = { ean13Check, nextInternalBarcode, barcodeExists };
