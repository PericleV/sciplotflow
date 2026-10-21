// An image of the Image analysis node as it is shown: its values through a colour table (gray, viridis …) over a
// range, a mask in a colour over the image under it, RGB as it is; and a PNG of it (written here, no canvas: the
// evaluator's worker and the checks make figures too). Pure.
import { zlibSync } from 'fflate';
import { COLOR_MAPS } from '../figure/colors.ts';
import type { ColorMapName } from '../figure/spec.ts';
import type { Raster } from './raster.ts';

export type Lut = Exclude<ColorMapName, 'custom'>;
const hexRgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
// 256 colours of a map (r, g, b in turn)
const tables = new Map<string, Uint8Array>();
export function lutTable(name: Lut, invert = false): Uint8Array {
  const key = `${name}${invert ? '-' : ''}`;
  let t = tables.get(key);
  if (t) return t;
  const stops = COLOR_MAPS[name].stops.map(hexRgb);
  t = new Uint8Array(256 * 3);
  for (let k = 0; k < 256; k++) {
    const x = ((invert ? 255 - k : k) / 255) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    for (let c = 0; c < 3; c++) t[k * 3 + c] = Math.round(stops[i][c] + f * (stops[i + 1][c] - stops[i][c]));
  }
  tables.set(key, t);
  return t;
}

// The pixels shown (RGBA): gray through the table over [lo, hi] (absent: the raster's range); RGB over its range; a
// mask white on black — or, `under` given, the image under it with the mask in `color` at `alpha`
export function toRGBA(r: Raster, o: { lut?: Lut; lo?: number; hi?: number; under?: Raster; color?: string; alpha?: number } = {}): Uint8ClampedArray {
  const n = r.w * r.h;
  const out = new Uint8ClampedArray(n * 4);
  if (r.kind === 'mask' && o.under) {
    const base = toRGBA(o.under, { lut: o.lut });
    const [cr, cg, cb] = hexRgb(o.color ?? '#ff3b30');
    const a = o.alpha ?? 0.5;
    const m = r.ch[0];
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      if (m[i]) {
        out[k] = base[k] * (1 - a) + cr * a;
        out[k + 1] = base[k + 1] * (1 - a) + cg * a;
        out[k + 2] = base[k + 2] * (1 - a) + cb * a;
      } else [out[k], out[k + 1], out[k + 2]] = [base[k], base[k + 1], base[k + 2]];
      out[k + 3] = 255;
    }
    return out;
  }
  const lo = o.lo ?? r.lo;
  const hi = o.hi ?? r.hi;
  const k255 = 255 / (hi - lo || 1);
  if (r.ch.length >= 3) {
    const [R, G, B] = r.ch;
    for (let i = 0; i < n; i++) {
      out[i * 4] = (R[i] - lo) * k255;
      out[i * 4 + 1] = (G[i] - lo) * k255;
      out[i * 4 + 2] = (B[i] - lo) * k255;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  const c = r.ch[0];
  if (r.kind === 'mask') {
    for (let i = 0; i < n; i++) {
      const v = c[i] ? 255 : 0;
      out.set([v, v, v, 255], i * 4);
    }
    return out;
  }
  const t = lutTable(o.lut ?? 'gray');
  for (let i = 0; i < n; i++) {
    const v = c[i];
    const b = Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round((v - lo) * k255))) : 0;
    out[i * 4] = t[b * 3];
    out[i * 4 + 1] = t[b * 3 + 1];
    out[i * 4 + 2] = t[b * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---- PNG ----

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
// An RGB PNG of RGBA pixels (alpha dropped), every row unfiltered; dpi in its pHYs when given
export function encodePNG(rgba: Uint8ClampedArray, w: number, h: number, dpi?: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 3);
    raw[o] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw.set([rgba[i], rgba[i + 1], rgba[i + 2]], o + 1 + x * 3);
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr)];
  if (dpi) {
    const p = new Uint8Array(9);
    const pv = new DataView(p.buffer);
    const ppm = Math.round(dpi / 0.0254);
    pv.setUint32(0, ppm);
    pv.setUint32(4, ppm);
    p[8] = 1;
    parts.push(chunk('pHYs', p));
  }
  parts.push(chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
export function pngDataUrl(rgba: Uint8ClampedArray, w: number, h: number): string {
  const bytes = encodePNG(rgba, w, h);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
}
