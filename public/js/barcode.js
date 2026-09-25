// Sinh mã vạch dạng SVG (không cần thư viện ngoài).
// Hỗ trợ EAN-13 (mã bán lẻ 13 số) và Code128B (chuỗi ký tự ASCII).

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13Checksum(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function ean13Bits(code) {
  let d = String(code).replace(/\D/g, '');
  if (d.length === 12) d += ean13Checksum(d);
  if (d.length !== 13) return null;
  const first = Number(d[0]);
  const parity = EAN_PARITY[first];
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    const digit = Number(d[i]);
    bits += parity[i - 1] === 'L' ? EAN_L[digit] : EAN_G[digit];
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(d[i])];
  bits += '101';
  return { bits, text: d };
}

const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

function code128Bits(text) {
  const clean = String(text).split('').filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n <= 126; }).join('');
  if (!clean) return null;
  const values = clean.split('').map((c) => c.charCodeAt(0) - 32);
  let sum = 104; // Start B
  values.forEach((v, i) => { sum += v * (i + 1); });
  const check = sum % 103;
  const seq = [104, ...values, check, 106];
  let bits = '';
  for (const s of seq) {
    const widths = C128[s];
    for (let i = 0; i < widths.length; i++) {
      const w = Number(widths[i]);
      bits += (i % 2 === 0 ? '1' : '0').repeat(w);
    }
  }
  return { bits, text: clean };
}

function renderSVG(bits, { moduleWidth = 2, height = 56, text = '', showText = true, quiet = 10 } = {}) {
  const mw = moduleWidth;
  const leftPad = quiet * mw;
  const width = bits.length * mw + leftPad * 2;
  const textH = showText ? 18 : 0;
  const totalH = height + textH;
  const rects = [];
  let x = leftPad;
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let run = 1;
      while (bits[i + run] === '1') run++;
      rects.push(`<rect x="${x.toFixed(1)}" y="0" width="${(run * mw).toFixed(1)}" height="${height}" />`);
      x += run * mw; i += run;
    } else {
      let run = 1;
      while (bits[i + run] === '0') run++;
      x += run * mw; i += run;
    }
  }
  const txt = showText && text ? `<text x="${(width / 2).toFixed(1)}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="13" letter-spacing="2">${text}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(1)} ${totalH}" width="${width.toFixed(1)}" height="${totalH}" role="img"><g fill="#000">${rects.join('')}</g>${txt}</svg>`;
}

export function barcodeSVG(code, opts = {}) {
  const raw = String(code ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13 || digits.length === 12) {
    const e = ean13Bits(digits);
    if (e) return { svg: renderSVG(e.bits, { ...opts, text: e.text }), format: 'EAN-13', text: e.text };
  }
  const c = code128Bits(raw);
  if (!c) return null;
  return { svg: renderSVG(c.bits, { ...opts, text: c.text }), format: 'Code128', text: c.text };
}
