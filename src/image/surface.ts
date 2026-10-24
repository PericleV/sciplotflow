// Surface (Image analysis, AFM): the image as heights. Its form taken off (a plane or a polynomial fitted, the highest
// part left out of the fit), the areal roughness of a region (ISO 25178: Sa, Sq, Sp, Sv, Sz, Ssk, Sku, Sdq, Sdr), the
// roughness of a profile (ISO 4287: Ra, Rq, Rp, Rv, Rt, Rz, Rsk, Rku; its mean line straight or a Gaussian of cut-off
// λc, ISO 16610-21), the histogram of the heights with the material ratio, the radial power spectral density, the
// autocorrelation (its correlation length, Sal and Str) and the mean height of a region (a step between two). Pure.
import { fft2, nextPow2 } from './fft2d.ts';

// what the heights and the selections may be given in: the lengths, in nm
export const LENGTH_NM: Record<string, number> = { pm: 1e-3, Å: 0.1, A: 0.1, nm: 1, µm: 1e3, um: 1e3, mm: 1e6, m: 1e9 };

export type SurfaceSpec = {
  zUnit?: string; // the unit of the heights (absent: none)
  zScale?: number; // one value of the image is so many zUnit (absent: 1)
  areal?: boolean; // ISO 25178 of the image and of every area selection
  profile?: boolean; // ISO 4287 along every line selection
  lc?: number; // the cut-off λc of the profiles (in the calibrated unit; absent: their mean line straight)
  hist?: boolean; // the histogram of the heights
  bins?: number;
  psd?: boolean; // the radial power spectral density
  acf?: boolean; // the autocorrelation, its correlation length, Sal and Str
  step?: [string, string]; // the ids of two area selections: the step between their mean heights
};

// ---- the form taken off ----
// A polynomial in x and y of `order` (1: a plane) fitted to the image by least squares and taken off; exclude: the
// highest % of what is left after a first fit left out of a second one (particles on a substrate: the substrate
// levelled); zero: the mean of the result at 0, its lowest point, or the image's own mean kept
export function levelSurface(c: Float32Array, w: number, h: number, order: number, exclude: number, zero: 'mean' | 'min' | 'keep'): Float32Array {
  const terms: [number, number][] = [];
  for (let s = 0; s <= order; s++) for (let j = 0; j <= s; j++) terms.push([s - j, j]);
  const T = terms.length;
  const sx = (x: number) => (w > 1 ? (2 * x) / (w - 1) - 1 : 0);
  const sy = (y: number) => (h > 1 ? (2 * y) / (h - 1) - 1 : 0);
  // (the powers of x and y of a pixel)
  const basis = (x: number, y: number, out: Float64Array) => {
    const [u, v] = [sx(x), sy(y)];
    for (let t = 0; t < T; t++) out[t] = u ** terms[t][0] * v ** terms[t][1];
  };
  // (fitted on a pixel in every `step`: some 250 000 of them)
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 250000)));
  const b = new Float64Array(T);
  const fit = (taken: (x: number, y: number, v: number) => boolean): Float64Array => {
    const A = new Float64Array(T * T);
    const r = new Float64Array(T);
    for (let y = 0; y < h; y += step)
      for (let x = 0; x < w; x += step) {
        const v = c[y * w + x];
        if (!Number.isFinite(v) || !taken(x, y, v)) continue;
        basis(x, y, b);
        for (let i = 0; i < T; i++) {
          r[i] += b[i] * v;
          for (let j = 0; j < T; j++) A[i * T + j] += b[i] * b[j];
        }
      }
    return solve(A, r, T);
  };
  const at = (co: Float64Array, x: number, y: number) => {
    basis(x, y, b);
    let s = 0;
    for (let t = 0; t < T; t++) s += co[t] * b[t];
    return s;
  };
  let co = fit(() => true);
  if (exclude > 0) {
    const res: number[] = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (Number.isFinite(c[y * w + x])) res.push(c[y * w + x] - at(co, x, y));
    res.sort((p, q) => p - q);
    const cut = res[Math.min(res.length - 1, Math.floor((res.length * (100 - exclude)) / 100))] ?? Infinity;
    const first = co;
    co = fit((x, y, v) => v - at(first, x, y) <= cut);
  }
  const out = new Float32Array(w * h);
  let [sum, n, lo] = [0, 0, Infinity];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = c[y * w + x] - at(co, x, y);
      out[y * w + x] = v;
      if (Number.isFinite(v)) [sum, n, lo] = [sum + v, n + 1, Math.min(lo, v)];
    }
  let mean0 = 0;
  for (let k = 0; k < w * h; k++) if (Number.isFinite(c[k])) mean0 += c[k];
  mean0 /= n || 1;
  const shift = zero === 'min' ? lo : zero === 'mean' ? sum / (n || 1) : sum / (n || 1) - mean0;
  if (shift) for (let k = 0; k < out.length; k++) out[k] -= shift;
  return out;
}
// A · x = r (T × T, Gauss–Jordan with the largest pivot); a column with no pivot: 0
function solve(A: Float64Array, r: Float64Array, T: number): Float64Array {
  const M = Float64Array.from(A);
  const x = Float64Array.from(r);
  for (let i = 0; i < T; i++) {
    let p = i;
    for (let k = i + 1; k < T; k++) if (Math.abs(M[k * T + i]) > Math.abs(M[p * T + i])) p = k;
    if (Math.abs(M[p * T + i]) < 1e-12) continue;
    if (p !== i) {
      for (let j = 0; j < T; j++) [M[i * T + j], M[p * T + j]] = [M[p * T + j], M[i * T + j]];
      [x[i], x[p]] = [x[p], x[i]];
    }
    for (let k = 0; k < T; k++) {
      if (k === i) continue;
      const f = M[k * T + i] / M[i * T + i];
      if (!f) continue;
      for (let j = i; j < T; j++) M[k * T + j] -= f * M[i * T + j];
      x[k] -= f * x[i];
    }
  }
  return Float64Array.from({ length: T }, (_, i) => (Math.abs(M[i * T + i]) < 1e-12 ? 0 : x[i] / M[i * T + i]));
}

// ---- areal roughness (ISO 25178) ----
export type Areal = { n: number; mean: number; Sa: number; Sq: number; Sp: number; Sv: number; Sz: number; Ssk: number; Sku: number; Sdq: number; Sdr: number };
// The heights z (w × h) of a region (inside: the pixels of it; null: all), from their mean; slope: what a difference
// of heights between two neighbours is as a slope (z's unit / the pixel's size in the same unit; NaN: no Sdq, Sdr)
export function arealParams(z: ArrayLike<number>, w: number, h: number, inside: ((x: number, y: number) => boolean) | null, slope: number): Areal {
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && Number.isFinite(z[y * w + x]) && (!inside || inside(x, y));
  let [n, s] = [0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ok(x, y)) [n, s] = [n + 1, s + z[y * w + x]];
  const m = s / (n || 1);
  let [a, q2, q3, q4, hi, lo] = [0, 0, 0, 0, -Infinity, Infinity];
  let [g2, dr, ng] = [0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!ok(x, y)) continue;
      const v = z[y * w + x] - m;
      a += Math.abs(v);
      q2 += v * v;
      q3 += v * v * v;
      q4 += v * v * v * v;
      if (v > hi) hi = v;
      if (v < lo) lo = v;
      // (the slope: central differences where both neighbours are in it)
      if (Number.isFinite(slope) && ok(x - 1, y) && ok(x + 1, y) && ok(x, y - 1) && ok(x, y + 1)) {
        const gx = ((z[y * w + x + 1] - z[y * w + x - 1]) / 2) * slope;
        const gy = ((z[(y + 1) * w + x] - z[(y - 1) * w + x]) / 2) * slope;
        g2 += gx * gx + gy * gy;
        dr += Math.sqrt(1 + gx * gx + gy * gy) - 1;
        ng++;
      }
    }
  const Sq = Math.sqrt(q2 / (n || 1));
  return {
    n,
    mean: n ? m : NaN,
    Sa: n ? a / n : NaN,
    Sq: n ? Sq : NaN,
    Sp: n ? hi : NaN,
    Sv: n ? -lo : NaN,
    Sz: n ? hi - lo : NaN,
    Ssk: n && Sq ? q3 / n / Sq ** 3 : NaN,
    Sku: n && Sq ? q4 / n / Sq ** 4 : NaN,
    Sdq: ng ? Math.sqrt(g2 / ng) : NaN,
    Sdr: ng ? (100 * dr) / ng : NaN,
  };
}

// ---- the roughness of a profile (ISO 4287) ----
export type ProfileR = { n: number; Ra: number; Rq: number; Rp: number; Rv: number; Rt: number; Rz: number; Rsk: number; Rku: number; mean: Float64Array };
// The heights v of a profile sampled every `step` (in the calibrated unit): its mean line (straight, by least squares;
// or a Gaussian of cut-off λc, the same unit: the waviness, what is longer than λc), the roughness from it; Rz the mean
// of the largest height in five equal parts
export function profileParams(v: ArrayLike<number>, step: number, lc = NaN): ProfileR {
  const n = v.length;
  const mean = new Float64Array(n);
  if (lc > 0 && step > 0) {
    const al = Math.sqrt(Math.LN2 / Math.PI) * lc;
    const R = Math.ceil(lc / step);
    const wt = Float64Array.from({ length: R + 1 }, (_, j) => Math.exp(-Math.PI * ((j * step) / al) ** 2));
    for (let i = 0; i < n; i++) {
      let [s, sw] = [0, 0];
      for (let j = -R; j <= R; j++) {
        const k = i + j;
        if (k < 0 || k >= n || !Number.isFinite(v[k])) continue;
        s += wt[Math.abs(j)] * v[k];
        sw += wt[Math.abs(j)];
      }
      mean[i] = sw ? s / sw : NaN;
    }
  } else {
    let [sx, sy, sxx, sxy, m] = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) if (Number.isFinite(v[i])) [sx, sy, sxx, sxy, m] = [sx + i, sy + v[i], sxx + i * i, sxy + i * v[i], m + 1];
    const den = m * sxx - sx * sx;
    const b = den ? (m * sxy - sx * sy) / den : 0;
    const a = m ? (sy - b * sx) / m : 0;
    for (let i = 0; i < n; i++) mean[i] = a + b * i;
  }
  const r: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(v[i]) && Number.isFinite(mean[i])) r.push(v[i] - mean[i]);
  const m = r.length;
  if (!m) return { n: 0, Ra: NaN, Rq: NaN, Rp: NaN, Rv: NaN, Rt: NaN, Rz: NaN, Rsk: NaN, Rku: NaN, mean };
  let [a, q2, q3, q4] = [0, 0, 0, 0];
  for (const x of r) [a, q2, q3, q4] = [a + Math.abs(x), q2 + x * x, q3 + x ** 3, q4 + x ** 4];
  const Rq = Math.sqrt(q2 / m);
  const Rp = Math.max(...r);
  const Rv = -Math.min(...r);
  const parts = Math.min(5, m);
  let rz = 0;
  for (let p = 0; p < parts; p++) {
    const part = r.slice(Math.floor((p * m) / parts), Math.floor(((p + 1) * m) / parts));
    rz += Math.max(...part) - Math.min(...part);
  }
  return { n: m, Ra: a / m, Rq, Rp, Rv, Rt: Rp + Rv, Rz: rz / parts, Rsk: Rq ? q3 / m / Rq ** 3 : NaN, Rku: Rq ? q4 / m / Rq ** 4 : NaN, mean };
}

// ---- the distribution of the heights ----
// The histogram of the heights in `bins` bins: their centres, the counts, the density (1 / the unit) and the material
// ratio (the % of the surface at the bin's height or above it: the Abbott–Firestone curve)
export function heightHistogram(z: ArrayLike<number>, bins = 100): { at: number[]; count: number[]; density: number[]; ratio: number[] } {
  let [lo, hi, n] = [Infinity, -Infinity, 0];
  for (let i = 0; i < z.length; i++) if (Number.isFinite(z[i])) [lo, hi, n] = [Math.min(lo, z[i]), Math.max(hi, z[i]), n + 1];
  if (!n) return { at: [], count: [], density: [], ratio: [] };
  if (hi === lo) hi = lo + 1;
  const B = Math.max(2, Math.round(bins));
  const bw = (hi - lo) / B;
  const count = new Array<number>(B).fill(0);
  for (let i = 0; i < z.length; i++) if (Number.isFinite(z[i])) count[Math.min(B - 1, Math.floor((z[i] - lo) / bw))]++;
  const above = new Array<number>(B).fill(0);
  for (let k = B - 1, s = 0; k >= 0; k--) {
    // (half of its own bin: at its centre)
    above[k] = s + count[k] / 2;
    s += count[k];
  }
  return { at: count.map((_, k) => lo + (k + 0.5) * bw), count, density: count.map((c) => c / n / bw), ratio: above.map((a) => (100 * a) / n) };
}

// the heights from their mean, a Hann window over them (its power kept), zeros around: N × N
function windowed(z: ArrayLike<number>, w: number, h: number, N: number, hann: boolean): { re: Float64Array; n: number } {
  let [s, n] = [0, 0];
  for (let i = 0; i < w * h; i++) if (Number.isFinite(z[i])) [s, n] = [s + z[i], n + 1];
  const m = s / (n || 1);
  const win = (k: number, L: number) => (hann ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (k + 0.5)) / L) : 1);
  let w2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) w2 += (win(x, w) * win(y, h)) ** 2;
  const norm = Math.sqrt((w * h) / (w2 || 1));
  const re = new Float64Array(N * N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = z[y * w + x];
      if (Number.isFinite(v)) re[y * N + x] = (v - m) * win(x, w) * win(y, h) * norm;
    }
  return { re, n: n || 1 };
}

// ---- the power spectral density ----
// The radial PSD of the heights (z w × h, pixels of dx): its average in rings of the spatial frequency k (1 / dx's
// unit), in z² · unit² (∫ PSD 2πk dk = Sq²)
export function radialPSD(z: ArrayLike<number>, w: number, h: number, dx: number): { k: number[]; psd: number[] } {
  const N = Math.min(4096, nextPow2(Math.max(w, h)));
  const { re } = windowed(z, w, h, N, true);
  const im = new Float64Array(N * N);
  fft2(re, im, N);
  const half = N >> 1;
  const sum = new Float64Array(half);
  const cnt = new Float64Array(half);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x < half ? x : x - N;
      const v = y < half ? y : y - N;
      const r = Math.round(Math.hypot(u, v));
      if (r >= half) continue;
      sum[r] += re[y * N + x] ** 2 + im[y * N + x] ** 2;
      cnt[r]++;
    }
  const f = (dx * dx) / (w * h);
  const k: number[] = [];
  const psd: number[] = [];
  for (let r = 1; r < half; r++) {
    k.push(r / (N * dx));
    psd.push(cnt[r] ? (sum[r] / cnt[r]) * f : NaN);
  }
  return { k, psd };
}

// ---- the autocorrelation ----
// The autocorrelation of the heights (normalised: 1 at no shift), averaged in rings (r in dx's unit); the correlation
// length (where it falls to 1/e) and, of ISO 25178, Sal (the shortest shift at which it falls to 0.2, in any direction)
// and Str (Sal / the longest such: near 0 a surface of one direction, near 1 the same every way; a direction in which
// it does not fall within half the image taken as that far). An image over 1024 px shrunk first
export function autocorrelation(z: ArrayLike<number>, w: number, h: number, dx: number): { r: number[]; acf: number[]; lcorr: number; Sal: number; Str: number } {
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 1024));
  const [ws, hs] = [Math.ceil(w / f), Math.ceil(h / f)];
  let src: ArrayLike<number> = z;
  if (f > 1) {
    const s = new Float64Array(ws * hs);
    const c = new Float64Array(ws * hs);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = z[y * w + x];
        if (!Number.isFinite(v)) continue;
        const k = Math.floor(y / f) * ws + Math.floor(x / f);
        s[k] += v;
        c[k]++;
      }
    src = s.map((v, k) => (c[k] ? v / c[k] : NaN));
  }
  const N = nextPow2(2 * Math.max(ws, hs));
  const { re } = windowed(src, ws, hs, N, false);
  const im = new Float64Array(N * N);
  fft2(re, im, N);
  for (let k = 0; k < N * N; k++) {
    re[k] = re[k] ** 2 + im[k] ** 2;
    im[k] = 0;
  }
  fft2(re, im, N, true);
  // (the sum over the pixels that overlap at the shift, divided by how many: the mean product)
  const c0 = re[0] / (ws * hs);
  const at = (tx: number, ty: number) => {
    const ov = (ws - Math.abs(tx)) * (hs - Math.abs(ty));
    return ov > 0 ? re[((ty + N) % N) * N + ((tx + N) % N)] / ov / (c0 || 1) : NaN;
  };
  const R = Math.floor(Math.min(ws, hs) / 2);
  const sum = new Float64Array(R + 1);
  const cnt = new Float64Array(R + 1);
  for (let ty = -R; ty <= R; ty++)
    for (let tx = -R; tx <= R; tx++) {
      const d = Math.round(Math.hypot(tx, ty));
      if (d > R) continue;
      sum[d] += at(tx, ty);
      cnt[d]++;
    }
  const acf = Array.from(sum, (s, d) => (cnt[d] ? s / cnt[d] : NaN));
  const step = dx * f;
  const fall = (vals: (t: number) => number, level: number, max: number): number => {
    let prev = 1;
    for (let t = 0.5; t <= max; t += 0.5) {
      const v = vals(t);
      if (v <= level) return t - 0.5 + (0.5 * (prev - level)) / (prev - v || 1);
      prev = v;
    }
    return NaN;
  };
  const lcorr = fall((t) => {
    const i = Math.floor(t);
    const fr = t - i;
    return (acf[i] ?? NaN) * (1 - fr) + (acf[i + 1] ?? acf[i] ?? NaN) * fr;
  }, 1 / Math.E, R);
  // (by direction: the value at a shift between the pixels, from its four)
  const bil = (x: number, y: number) => {
    const [x0, y0] = [Math.floor(x), Math.floor(y)];
    const [fx, fy] = [x - x0, y - y0];
    return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
  };
  const lens: number[] = [];
  for (let a = 0; a < 180; a++) {
    const [cx, cy] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
    const L = fall((t) => bil(t * cx, t * cy), 0.2, R - 1);
    lens.push(Number.isFinite(L) ? L : R - 1);
  }
  const Sal = Math.min(...lens);
  const longest = Math.max(...lens);
  return { r: acf.map((_, d) => d * step), acf, lcorr: lcorr * step, Sal: Sal * step, Str: longest > 0 ? Sal / longest : NaN };
}

// The mean height of a region, its standard deviation and how many pixels
export function regionHeight(z: ArrayLike<number>, w: number, h: number, inside: (x: number, y: number) => boolean): { mean: number; sd: number; n: number } {
  let [s, s2, n] = [0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = z[y * w + x];
      if (!Number.isFinite(v) || !inside(x, y)) continue;
      [s, s2, n] = [s + v, s2 + v * v, n + 1];
    }
  const m = s / (n || 1);
  return { mean: n ? m : NaN, sd: n > 1 ? Math.sqrt(Math.max(0, (s2 - n * m * m) / (n - 1))) : NaN, n };
}
