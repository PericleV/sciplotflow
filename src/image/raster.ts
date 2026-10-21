// Images as the Image analysis node works with them: the pixels kept in the project (the original values, 8 or 16 bit
// or float, gray or RGB, compressed), and a raster of floats the editing steps change. Pure: no page, no canvas (the
// evaluator, its worker and the checks all use it).
import { deflateSync, inflateSync } from 'fflate';

// The pixels as kept in the node: w × h, 1 (gray) or 3 (RGB) channels interleaved, of 8 or 16 bit (unsigned) or 32 bit
// (float), little-endian, deflated and in base64. scale: the size of a pixel read from the file (TIFF), when it has one.
// dataRef: in the projects kept in the browser, the data stored apart (textStore) under this key
export type ImgPixels = { w: number; h: number; ch: 1 | 3; depth: 8 | 16 | 32; data: string; dataRef?: string; scale?: { size: number; unit: string } };

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
  for (const c of chans) for (const v of c) if (Number.isFinite(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
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

// one row or column filtered by a kernel (centre at kernel.length >> 1), the edge mirrored
function conv1(src: Float32Array, dst: Float32Array, n: number, stride: number, off: number, k: Float64Array, tmp: Float64Array) {
  const r = k.length >> 1;
  for (let i = 0; i < n; i++) tmp[i] = src[off + i * stride];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < k.length; j++) s += k[j] * tmp[reflect(i + j - r, n)];
    dst[off + i * stride] = s;
  }
}
// a channel filtered by kx along the rows and ky along the columns
export function separable(c: Float32Array, w: number, h: number, kx: Float64Array, ky: Float64Array): Float32Array {
  const a = new Float32Array(c.length);
  const b = new Float32Array(c.length);
  const tmp = new Float64Array(Math.max(w, h));
  for (let y = 0; y < h; y++) conv1(c, a, w, 1, y * w, kx, tmp);
  for (let x = 0; x < w; x++) conv1(a, b, h, w, x, ky, tmp);
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

// the histogram of a channel in `bins` bins over [lo, hi] (values outside go to the end bins); NaN left out
export function histogram(c: Float32Array, lo: number, hi: number, bins = 256): Float64Array {
  const hst = new Float64Array(bins);
  const k = bins / (hi - lo || 1);
  for (const v of c) {
    if (!Number.isFinite(v)) continue;
    const b = Math.floor((v - lo) * k);
    hst[b < 0 ? 0 : b >= bins ? bins - 1 : b]++;
  }
  return hst;
}
// the value under which a fraction q of the samples lie (0 ≤ q ≤ 1), from a sorted copy
export function quantile(c: Float32Array, q: number): number {
  const s = Float32Array.from(c.filter(Number.isFinite)).sort();
  if (!s.length) return NaN;
  const p = Math.min(s.length - 1, Math.max(0, q * (s.length - 1)));
  const a = Math.floor(p);
  return s[a] + (s[Math.min(s.length - 1, a + 1)] - s[a]) * (p - a);
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
