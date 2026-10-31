import { glyph } from '../public/pixelfont.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(data) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class CellCanvas {
  constructor(width, height, palette) {
    this.width = width;
    this.height = height;
    this.palette = palette;
    this.colour = Object.fromEntries(Object.keys(palette).map((name, i) => [name, i]));
    this.rows = new Uint8Array((width + 1) * height);
  }

  rect(x, y, w, h, name) {
    const ci = this.colour[name];
    const x0 = Math.max(0, Math.round(x));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y));
    const y1 = Math.min(this.height, Math.round(y + h));
    if (x1 <= x0) return;
    for (let row = y0; row < y1; row++) {
      const start = row * (this.width + 1) + 1;
      this.rows.fill(ci, start + x0, start + x1);
    }
  }

  cell(x, y, size, name, ground = 'bg') {
    this.rect(x, y, size, size, name);
    const r = Math.round(size * 0.2);
    if (r < 2) return;
    const gi = this.colour[ground];
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const s = Math.round(size);
    for (let dy = 0; dy < r; dy++) {
      for (let dx = 0; dx < r; dx++) {
        if ((r - dx - 0.5) ** 2 + (r - dy - 0.5) ** 2 <= r * r) continue;
        for (const [px, py] of [[x0 + dx, y0 + dy], [x0 + s - 1 - dx, y0 + dy], [x0 + dx, y0 + s - 1 - dy], [x0 + s - 1 - dx, y0 + s - 1 - dy]]) {
          if (px >= 0 && px < this.width && py >= 0 && py < this.height) this.rows[py * (this.width + 1) + 1 + px] = gi;
        }
      }
    }
  }

  measure(text, pitch) {
    let cols = 0;
    for (const ch of text) cols += (glyph(ch)?.[0].length ?? 3) + 1;
    return Math.max(0, cols - 1) * pitch;
  }

  fitPitch(text, pitch, maxWidth) {
    let p = pitch;
    while (p > 2 && this.measure(text, p) > maxWidth) p--;
    return p;
  }

  text(text, x, y, pitch, name, { align = 'left', gap = 0.18 } = {}) {
    let cx = align === 'right' ? x - this.measure(text, pitch) : align === 'center' ? x - this.measure(text, pitch) / 2 : x;
    const size = Math.max(1, pitch * (1 - gap));
    for (const ch of text) {
      const rows = glyph(ch) ?? glyph(' ');
      rows.forEach((bits, ry) => {
        [...bits].forEach((bit, rx) => { if (bit === '1') this.cell(cx + rx * pitch, y + ry * pitch, size, name); });
      });
      cx += (rows[0].length + 1) * pitch;
    }
    return 7 * pitch;
  }

  async png() {
    const names = Object.keys(this.palette);
    const plte = new Uint8Array(names.length * 3);
    names.forEach((n, i) => plte.set(hex(this.palette[n]), i * 3));
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, this.width);
    view.setUint32(4, this.height);
    ihdr.set([8, 3, 0, 0, 0], 8);
    const idat = await zlib(this.rows);
    const parts = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('PLTE', plte),
      chunk('IDAT', idat),
      chunk('IEND', new Uint8Array()),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }
}
