// Generates build/icon.png (512×512) without dependencies: node build/make-icon.js
// The cone sits on a dark rounded tile with a play-button badge, so it is clearly
// distinguishable from the official VLC icon (this is an unofficial app).
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const S = 512, SS = 4; // 4×4 supersampling
const px = Buffer.alloc(S * S * 4);

// shapes in 0..1 space; later entries paint on top
const ORANGE = [255, 136, 0], WHITE = [245, 245, 245], DARK = [204, 102, 0], TILE = [28, 28, 30], EDGE = [52, 52, 56];
const trap = (y0, y1, hw0, hw1, c) => ({ y0, y1, hw0, hw1, c });
const K = 0.66, CX = 0.46, CY = 0.10;                     // cone scale and offset inside the tile
const shapes = [
  trap(0.80, 0.94, 0.44, 0.46, DARK),    // base shadow
  trap(0.78, 0.90, 0.42, 0.44, ORANGE),  // base
  trap(0.06, 0.80, 0.07, 0.31, ORANGE),  // cone body
  trap(0.30, 0.44, 0.15, 0.20, WHITE),   // stripe 1
  trap(0.58, 0.72, 0.23, 0.28, WHITE),   // stripe 2
];
function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r)), cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && Math.hypot(x - cx, y - cy) <= r;
}
function color(x, y) {
  let col = null;
  if (roundRect(x, y, 0.04, 0.04, 0.96, 0.96, 0.22)) col = EDGE;          // tile border
  if (roundRect(x, y, 0.055, 0.055, 0.945, 0.945, 0.205)) col = TILE;     // tile
  const u = (x - CX) / K + 0.5, v = (y - CY) / K;                         // cone, scaled into the tile
  for (const s of shapes) {
    if (v < s.y0 || v > s.y1) continue;
    const t = (v - s.y0) / (s.y1 - s.y0), hw = s.hw0 + (s.hw1 - s.hw0) * t;
    if (Math.abs(u - 0.5) <= hw) col = s.c;
  }
  // play badge (bottom right): white circle with a dark play triangle
  const bx = 0.75, by = 0.75, br = 0.15;
  if (Math.hypot(x - bx, y - by) <= br + 0.025) col = TILE;
  if (Math.hypot(x - bx, y - by) <= br) {
    col = WHITE;
    const tx = x - (bx - 0.045), ty = y - by;                              // triangle pointing right
    if (tx >= 0 && tx <= 0.12 && Math.abs(ty) <= 0.075 * (1 - tx / 0.12)) col = TILE;
  }
  return col;
}
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const c = color((x + (sx + .5) / SS) / S, (y + (sy + .5) / SS) / S);
    if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
  }
  const i = (y * S + x) * 4, n = SS * SS;
  if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = 255 * a / n; }
}
// PNG encode
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log('icon.png written', png.length, 'bytes');
