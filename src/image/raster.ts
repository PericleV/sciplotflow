// Images as the Image analysis node works with them: the pixels kept in the project (the original values, 8 or 16 bit
// or float, gray or RGB, compressed), and a raster of floats the editing steps change. Pure: no page, no canvas (the
// evaluator, its worker and the checks all use it).
import { deflateSync, inflateSync } from 'fflate';

// The pixels as kept in the node: w × h, 1 (gray) or 3 (RGB) channels interleaved, of 8 or 16 bit (unsigned) or 32 bit
// (float), little-endian, deflated and in base64. scale: the size of a pixel read from the file (TIFF), when it has one.
// dataRef: in the projects kept in the browser, the data stored apart (textStore) under this key. zUnit: the values
// are heights in this unit (a height map read: AFM)
export type ImgPixels = { w: number; h: number; ch: 1 | 3; depth: 8 | 16 | 32; data: string; dataRef?: string; scale?: { size: number; unit: string }; zUnit?: string };

// A raster: one Float32Array per channel (row after row); its kind (gray, RGB, a mask of 0 / 1) and its nominal range
// (0–255, 0–65535; float: the data's), used by the steps that work on the range (levels, curves, invert …)
export type Raster = { w: number; h: number; ch: Float32Array[]; kind: 'gray' | 'rgb' | 'mask'; lo: number; hi: number };

const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => {
  const t = atob(s);
  const u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u;
};

// The pixels of interleaved samples (any typed array of w·h·ch values) as kept in the node
export function packPixels(w: number, h: number, ch: 1 | 3, depth: 8 | 16 | 32, samples: ArrayLike<number>, scale?: ImgPixels['scale']): ImgPixels {
  const n = w * h * ch;
  let bytes: Uint8Array;
  if (depth === 8) bytes = Uint8Array.from({ length: n }, (_, i) => samples[i]);
  else {
    const buf = new ArrayBuffer(n * (depth === 16 ? 2 : 4));
    const dv = new DataView(buf);
    for (let i = 0; i < n; i++) {
      if (depth === 16) dv.setUint16(i * 2, samples[i], true);
      else dv.setFloat32(i * 4, samples[i], true);
    }
    bytes = new Uint8Array(buf);
  }
  return { w, h, ch, depth, data: b64(deflateSync(bytes, { level: 6 })), ...(scale ? { scale } : {}) };
}

// the nominal range of a depth (float: the data's own)
function rangeOf(depth: ImgPixels['depth'], chans: Float32Array[]): [number, number] {
  if (depth === 8) return [0, 255];
  if (depth === 16) return [0, 65535];
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of chans)
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      // (NaN and ±∞ left out: v − v is 0 only for a finite v)
      if (v - v !== 0) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  return Number.isFinite(lo) ? (lo === hi ? [lo, lo + 1] : [lo, hi]) : [0, 1];
}

// The raster of kept pixels (decoded once per pixels object, or per key: the image's id, as a copy of the node's data
// sent again to the evaluator's worker is another object; the last few kept)
const decoded = new WeakMap<ImgPixels, Raster>();
const byKey = new Map<string, Raster>();
export function unpackPixels(p: ImgPixels, key?: string): Raster {
  const hit = decoded.get(p) ?? (key ? byKey.get(key) : undefined);
  if (hit) {
    decoded.set(p, hit);
    return hit;
  }
  const bytes = inflateSync(unb64(p.data));
  const n = p.w * p.h;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chans = Array.from({ length: p.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < p.ch; c++) {
      const k = i * p.ch + c;
      chans[c][i] = p.depth === 8 ? bytes[k] : p.depth === 16 ? dv.getUint16(k * 2, true) : dv.getFloat32(k * 4, true);
    }
  const [lo, hi] = rangeOf(p.depth, chans);
  const r: Raster = { w: p.w, h: p.h, ch: chans, kind: p.ch === 3 ? 'rgb' : 'gray', lo, hi };
  decoded.set(p, r);
  if (key) {
    byKey.set(key, r);
    if (byKey.size > 3) byKey.delete(byKey.keys().next().value!);
  }
  return r;
}

// every value of a channel mapped (a plain loop: Float32Array.from with a function is many times slower)
export function map1(c: ArrayLike<number>, f: (v: number, i: number) => number): Float32Array {
  const n = c.length;
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = f(c[i], i);
  return o;
}

// ---- the part of the original analysed: a crop (x, y, w, h in pixels) ----
export type Crop = [number, number, number, number];
// the crop kept inside the image, whole pixels (null: none, or nothing left)
export function cropBox(c: Crop | undefined, w: number, h: number): Crop | null {
  if (!c) return null;
  const x = Math.max(0, Math.min(w - 1, Math.round(c[0])));
  const y = Math.max(0, Math.min(h - 1, Math.round(c[1])));
  const cw = Math.max(1, Math.min(w - x, Math.round(c[2])));
  const ch = Math.max(1, Math.min(h - y, Math.round(c[3])));
  return cw === w && ch === h ? null : [x, y, cw, ch];
}
// the raster cut to the crop (its kind and range kept); the same raster when there is none
const crops = new WeakMap<Raster, { key: string; r: Raster }>();
export function cropRaster(r: Raster, c: Crop | undefined): Raster {
  const box = cropBox(c, r.w, r.h);
  if (!box) return r;
  const key = box.join();
  const hit = crops.get(r);
  if (hit?.key === key) return hit.r;
  const [x0, y0, w, h] = box;
  const ch = r.ch.map((src) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) out.set(src.subarray((y0 + y) * r.w + x0, (y0 + y) * r.w + x0 + w), y * w);
    return out;
  });
  const out = { ...r, w, h, ch };
  crops.set(r, { key, r: out });
  return out;
}
// the raster shrunk by a whole factor f: every block of f × f its mean (a mask: its majority) — a preview
export function shrinkRaster(r: Raster, f: number): Raster {
  if (f <= 1) return r;
  const [w, h] = [Math.ceil(r.w / f), Math.ceil(r.h / f)];
  const cnt = new Float32Array(w * h);
  for (let y = 0; y < r.h; y++) {
    const ro = Math.floor(y / f) * w;
    for (let x = 0; x < r.w; x++) cnt[ro + Math.floor(x / f)]++;
  }
  const ch = r.ch.map((c) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < r.h; y++) {
      const ro = Math.floor(y / f) * w;
      const o = y * r.w;
      for (let x = 0; x < r.w; x++) out[ro + Math.floor(x / f)] += c[o + x];
    }
    for (let k = 0; k < out.length; k++) out[k] = r.kind === 'mask' ? (out[k] / cnt[k] >= 0.5 ? 1 : 0) : out[k] / cnt[k];
    return out;
  });
  return { ...r, w, h, ch };
}
// The data bar an electron microscope writes under the image (its settings, the scale bar): the rows at the bottom
// mostly of one value (its background), with no more than a few rows of the image's texture between them — their number
// (0: none found; between 2 % and 40 % of the height)
export function dataBarRows(r: Raster): number {
  const g = r.ch.length === 1 ? r.ch[0] : luminance(r);
  const tol = (r.hi - r.lo) * 0.012;
  // a row of the bar: half or more of it within tol of its most frequent value
  const plain = (y: number) => {
    const row = g.subarray(y * r.w, (y + 1) * r.w);
    const counts = new Map<number, number>();
    for (let i = 0; i < row.length; i++) {
      const v = row[i];
      const b = Math.round((v - r.lo) / (tol || 1));
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    let best = 0;
    for (const [b, n] of counts) best = Math.max(best, n + (counts.get(b - 1) ?? 0) + (counts.get(b + 1) ?? 0));
    return best >= 0.5 * r.w;
  };
  let top = r.h;
  let miss = 0;
  for (let y = r.h - 1; y >= 0 && miss <= 3; y--) {
    if (plain(y)) {
      top = y;
      miss = 0;
    } else miss++;
  }
  const n = r.h - top;
  return n >= 0.02 * r.h && n <= 0.4 * r.h ? n : 0;
}

// ---- helpers of the steps ----

export const gray = (r: Raster): Float32Array => (r.ch.length === 1 ? r.ch[0] : luminance(r));
// the luminance of an RGB raster (Rec. 601 weights, as ImageJ and scikit-image: 0.299, 0.587, 0.114 … skimage uses
// 0.2125, 0.7154, 0.0721): here the weights given
export function luminance(r: Raster, wr = 0.299, wg = 0.587, wb = 0.114): Float32Array {
  const [R, G, B] = r.ch;
  const out = new Float32Array(r.w * r.h);
  for (let i = 0; i < out.length; i++) out[i] = wr * R[i] + wg * G[i] + wb * B[i];
  return out;
}
// a raster like another with new channels (its kind and range kept unless given)
export const withChannels = (r: Raster, ch: Float32Array[], p: Partial<Raster> = {}): Raster => ({ ...r, ch, ...p });
export const mapChannels = (r: Raster, f: (c: Float32Array) => Float32Array, p: Partial<Raster> = {}): Raster => withChannels(r, r.ch.map(f), p);

// the index of a sample past the edge, mirrored with the edge repeated (scipy.ndimage 'reflect': d c b a | a b c d)
export function reflect(i: number, n: number): number {
  if (n === 1) return 0;
  const p = 2 * n;
  i %= p;
  if (i < 0) i += p;
  return i < n ? i : p - 1 - i;
}

// the mirrored index of every place of a line of n with `pad` places past each end (reflect, read from a table)
export function mirrorTable(n: number, pad: number): Int32Array {
  const t = new Int32Array(n + 2 * pad);
  for (let i = 0; i < t.length; i++) t[i] = reflect(i - pad, n);
  return t;
}
// one row or column filtered by a kernel (centre at kernel.length >> 1), the edge mirrored: the line copied with its
// mirrored margins once, then a plain sum
function conv1(src: Float32Array, dst: Float32Array, n: number, stride: number, off: number, k: Float64Array, tmp: Float64Array, mt: Int32Array) {
  const r = k.length >> 1;
  const m = k.length;
  for (let i = 0; i < n + 2 * r; i++) tmp[i] = src[off + mt[i] * stride];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += k[j] * tmp[i + j];
    dst[off + i * stride] = s;
  }
}
// a channel filtered by kx along the rows and ky along the columns
export function separable(c: Float32Array, w: number, h: number, kx: Float64Array, ky: Float64Array): Float32Array {
  const a = new Float32Array(c.length);
  const b = new Float32Array(c.length);
  const tmp = new Float64Array(Math.max(w, h) + Math.max(kx.length, ky.length));
  const mx = mirrorTable(w, kx.length >> 1);
  const my = mirrorTable(h, ky.length >> 1);
  for (let y = 0; y < h; y++) conv1(c, a, w, 1, y * w, kx, tmp, mx);
  for (let x = 0; x < w; x++) conv1(a, b, h, w, x, ky, tmp, my);
  return b;
}
// a 1D Gaussian of σ (truncated at 4 σ, as scipy), normalised; order 1 / 2: its derivatives
export function gaussKernel(sigma: number, order: 0 | 1 | 2 = 0, truncate = 4): Float64Array {
  if (!(sigma > 0)) return Float64Array.of(1);
  const r = Math.max(1, Math.round(truncate * sigma));
  const k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += (k[i + r] = Math.exp((-0.5 * i * i) / (sigma * sigma)));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  if (order === 0) return k;
  // the derivatives of the sampled Gaussian (as scipy.ndimage.gaussian_filter1d)
  const out = new Float64Array(k.length);
  const s2 = sigma * sigma;
  for (let i = -r; i <= r; i++) out[i + r] = order === 1 ? (-i / s2) * k[i + r] : ((i * i - s2) / (s2 * s2)) * k[i + r];
  // scipy correlates with the kernel reversed: an odd one changes sign
  return order === 1 ? out.reverse() : out;
}
export const gaussian = (c: Float32Array, w: number, h: number, sigma: number) => separable(c, w, h, gaussKernel(sigma), gaussKernel(sigma));
// a wide Gaussian (a background: σ of tens of pixels) on the image shrunk by f (block means), then brought back between
// the blocks' centres — the same smooth surface to well under 1 % of the range, without a kernel of hundreds of taps
export function gaussianWide(c: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const f = Math.floor(sigma / 4);
  if (f < 2 || w < 4 * f || h < 4 * f) return gaussian(c, w, h, sigma);
  const [sw, sh] = [Math.ceil(w / f), Math.ceil(h / f)];
  const small = new Float32Array(sw * sh);
  const cnt = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) {
    const ro = Math.floor(y / f) * sw;
    for (let x = 0; x < w; x++) {
      const k = ro + Math.floor(x / f);
      small[k] += c[y * w + x];
      cnt[k]++;
    }
  }
  for (let k = 0; k < small.length; k++) small[k] /= cnt[k];
  const b = gaussian(small, sw, sh, Math.sqrt(Math.max(0.25, sigma * sigma - (f * f) / 12)) / f);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y - (f - 1) / 2) / f));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x - (f - 1) / 2) / f));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      out[y * w + x] = (b[y0 * sw + x0] * (1 - tx) + b[y0 * sw + x1] * tx) * (1 - ty) + (b[y1 * sw + x0] * (1 - tx) + b[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}

// the histogram of a channel in `bins` bins over [lo, hi] (values outside go to the end bins); NaN left out
export function histogram(c: Float32Array, lo: number, hi: number, bins = 256): Float64Array {
  const hst = new Float64Array(bins);
  const k = bins / (hi - lo || 1);
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    if (!Number.isFinite(v)) continue;
    const b = Math.floor((v - lo) * k);
    hst[b < 0 ? 0 : b >= bins ? bins - 1 : b]++;
  }
  return hst;
}
// the value under which a fraction q of the samples lie (0 ≤ q ≤ 1), from a sorted copy
// (the two order statistics around it by selection, not a sort of everything)
export function quantile(c: Float32Array, q: number): number {
  const all = new Float32Array(c.length);
  let n = 0;
  for (let i = 0; i < c.length; i++) if (c[i] - c[i] === 0) all[n++] = c[i];
  const s = all.subarray(0, n);
  if (!n) return NaN;
  const p = Math.min(s.length - 1, Math.max(0, q * (s.length - 1)));
  const a = Math.floor(p);
  const va = kth(s, a);
  if (a + 1 >= s.length || p === a) return va;
  // (after the selection, the values above a are all ≥ va: the next one is their least)
  let vb = Infinity;
  for (let i = a + 1; i < s.length; i++) if (s[i] < vb) vb = s[i];
  return va + (vb - va) * (p - a);
}
// the k-th smallest of a (reordered: smaller before it, larger after)
function kth(a: Float32Array, k: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pv = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pv) i++;
      while (a[j] > pv) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
