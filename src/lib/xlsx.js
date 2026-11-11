'use strict';

// Tạo file .xlsx tối giản (ZIP + XML) không cần thư viện ngoài.
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(8, 8);      // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const isNum = (v) => typeof v === 'number' ? Number.isFinite(v) : (v !== '' && v != null && /^-?\d+(\.\d+)?$/.test(String(v).trim()));
const xmlText = (v) => `<c r="%R%"%S% t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
const xmlNum = (v) => `<c r="%R%"%S%><v>${Number(v)}</v></c>`;

// rows: mảng object. header (tuỳ chọn): { key: 'Tiêu đề' } — mặc định lấy key và tiêu đề = key.
function buildXlsx(rows, opts = {}) {
  const sheet = (opts.sheet || 'Sheet1').slice(0, 31) || 'Sheet1';
  const headerMap = opts.header || null;
  const keys = headerMap ? Object.keys(headerMap) : (rows.length ? Object.keys(rows[0]) : []);
  const titles = keys.map((k) => (headerMap ? headerMap[k] : k));
  const data = [titles, ...rows.map((r) => keys.map((k) => r[k]))];

  let sheetData = '';
  data.forEach((row, ri) => {
    const cells = row.map((v, ci) => {
      const r = colName(ci) + (ri + 1);
      const s = ri === 0 ? ' s="1"' : '';
      return isNum(v) && ri !== 0 ? xmlNum(v).replace('%R%', r).replace('%S%', s) : xmlText(v).replace('%R%', r).replace('%S%', s);
    }).join('');
    sheetData += `<row r="${ri + 1}">${cells}</row>`;
  });

  const widths = keys.map((k, ci) => {
    const maxLen = Math.max(String(titles[ci]).length, ...rows.map((r) => String(r[k] ?? '').length), 4);
    return `<col min="${ci + 1}" max="${ci + 1}" width="${Math.min(45, maxLen + 2)}" customWidth="1"/>`;
  }).join('');

  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${sheetData}</sheetData></worksheet>`) },
  ];
  return zip(files);
}

function sendXlsx(res, filename, rows, opts) {
  const buf = buildXlsx(rows, opts);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  res.send(buf);
}

// Đọc sheet đầu tiên của file .xlsx thành mảng dòng (mảng ô dạng chuỗi). Chỉ dùng zlib, không thư viện ngoài.
// ponytail: chỉ đọc giá trị ô (chuỗi, số, công thức đã tính sẵn), bỏ qua định dạng; ngày kiểu Excel trả về số serial.
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('File không phải Excel (.xlsx)');
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('File Excel bị lỗi');
    const method = buf.readUInt16LE(p + 10); const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28); const extra = buf.readUInt16LE(p + 30); const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nameLen + extra + comment;
  }
  return files;
}
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => unxml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function readXlsx(buf) {
  const files = unzip(buf);
  const shared = files['xl/sharedStrings.xml'] ? [...files['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('File Excel không có trang tính');
  const rows = [];
  for (const r of files[sheetName].toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]; const body = c[2] || '';
      const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1];
      const t = (/t="(\w+)"/.exec(attrs) || [])[1];
      const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
      const val = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? textOf(body) : unxml(v ?? '');
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}

module.exports = { buildXlsx, sendXlsx, readXlsx };
