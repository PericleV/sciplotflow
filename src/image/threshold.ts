// Thresholds of the Image analysis node: global ones from the histogram (the 16 methods of ImageJ — those scikit-image
// also has computed as it does: Otsu, IsoData, Li, Mean, Minimum, Triangle, Yen —) and local ones (a threshold for every
// pixel from its neighbourhood). A threshold T: the objects are the values above it (bright objects on a dark ground).
// Pure.
import { gaussian, reflect } from './raster.ts';
import { medianFilter, meanFilter, minMaxFilter, varianceFilter } from './filters.ts';

export type GlobalMethod = 'default' | 'huang' | 'intermodes' | 'isodata' | 'li' | 'maxentropy' | 'mean' | 'minerror' | 'minimum' | 'moments' | 'otsu' | 'percentile' | 'renyi' | 'shanbhag' | 'triangle' | 'yen';
export const GLOBAL_METHODS: [GlobalMethod, string][] = [
  ['default', 'Default (ImageJ IsoData)'],
  ['huang', 'Huang'],
  ['intermodes', 'Intermodes'],
  ['isodata', 'IsoData'],
  ['li', 'Li'],
  ['maxentropy', 'MaxEntropy'],
  ['mean', 'Mean'],
  ['minerror', 'MinError'],
  ['minimum', 'Minimum'],
  ['moments', 'Moments'],
  ['otsu', 'Otsu'],
  ['percentile', 'Percentile'],
  ['renyi', 'RenyiEntropy'],
  ['shanbhag', 'Shanbhag'],
  ['triangle', 'Triangle'],
  ['yen', 'Yen'],
];

// The histogram the methods work on: values that are all whole numbers over less than 256 levels (8-bit data) one bin
// per value from the lowest to the highest (as scikit-image does for integers); others 256 equal bins from the lowest
// to the highest value (numpy.histogram: the last bin closed). centers: the value of each bin; edge(k): the upper edge.
export type Hist = { counts: Float64Array; centers: Float64Array; edge: (k: number) => number; integer: boolean };
export function threshHistogram(c: Float32Array): Hist | null {
  let lo = Infinity;
  let hi = -Infinity;
  let integer = true;
  for (const v of c) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (integer && v !== Math.round(v)) integer = false;
  }
  if (!Number.isFinite(lo)) return null;
  if (integer && hi - lo < 256) {
    const n = hi - lo + 1;
    const counts = new Float64Array(n);
    for (const v of c) if (Number.isFinite(v)) counts[v - lo]++;
    return { counts, centers: Float64Array.from({ length: n }, (_, k) => lo + k), edge: (k) => lo + k, integer: true };
  }
  const bins = 256;
  const width = (hi - lo) / bins || 1;
  const counts = new Float64Array(bins);
  for (const v of c) {
    if (!Number.isFinite(v)) continue;
    const b = Math.floor((v - lo) / width);
    counts[b >= bins ? bins - 1 : b < 0 ? 0 : b]++;
  }
  return { counts, centers: Float64Array.from({ length: bins }, (_, k) => lo + (k + 0.5) * width), edge: (k) => lo + (k + 1) * width, integer: false };
}

const cumsum = (a: ArrayLike<number>) => {
  const o = new Float64Array(a.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) o[i] = s += a[i];
  return o;
};
const argmax = (a: ArrayLike<number>) => {
  let k = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[k] || (Number.isNaN(a[k]) && !Number.isNaN(a[i]))) k = i;
  return k;
};

// ---- as scikit-image ----

function otsu(H: Hist): number {
  const { counts: n, centers: x } = H;
  const w1 = cumsum(n);
  const w2 = cumsum(Float64Array.from(n).reverse()).reverse();
  const m1 = cumsum(Float64Array.from(n, (v, i) => v * x[i])).map((v, i) => v / w1[i]);
  const m2r = cumsum(Float64Array.from(n, (v, i) => v * x[i]).reverse());
  const m2 = Float64Array.from(m2r, (v, i) => v / w2[n.length - 1 - i]).reverse();
  let best = -Infinity;
  let k = 0;
  for (let i = 0; i < n.length - 1; i++) {
    const v = w1[i] * w2[i + 1] * (m1[i] - m2[i + 1]) ** 2;
    if (v > best) [best, k] = [v, i];
  }
  return x[k];
}
function yen(H: Hist): number {
  const { counts: n, centers: x } = H;
  if (n.length === 1) return x[0];
  const tot = n.reduce((a, b) => a + b, 0);
  const pmf = Float64Array.from(n, (v) => v / tot);
  const P1 = cumsum(pmf);
  const P1sq = cumsum(pmf.map((v) => v * v));
  const P2sq = cumsum(Float64Array.from(pmf).reverse().map((v) => v * v)).reverse();
  const crit = Float64Array.from({ length: n.length - 1 }, (_, i) => Math.log((1 / (P1sq[i] * P2sq[i + 1])) * (P1[i] * (1 - P1[i])) ** 2));
  return x[argmax(crit)];
}
function isodata(H: Hist): number {
  const { counts: n, centers: x } = H;
  if (n.length === 1) return x[0];
  const csl = cumsum(n);
  const total = csl[csl.length - 1];
  const csi = cumsum(Float64Array.from(n, (v, i) => v * x[i]));
  const sumI = csi[csi.length - 1];
  const bw = x[1] - x[0];
  for (let i = 0; i < n.length - 1; i++) {
    const lower = csi[i] / csl[i];
    const higher = (sumI - csi[i]) / (total - csl[i]);
    const d = (lower + higher) / 2 - x[i];
    if (d >= 0 && d < bw) return x[i];
  }
  return x[0];
}
// Li (minimum cross entropy), iterated as scikit-image: on the values (whole numbers: on the histogram)
function li(c: Float32Array, H: Hist): number {
  const vals = Array.from(c).filter(Number.isFinite);
  let min = Infinity;
  for (const v of vals) if (v < min) min = v;
  if (vals.every((v) => v === vals[0])) return vals[0];
  const im = vals.map((v) => v - min);
  let tol: number;
  if (H.integer) tol = 0.5;
  else {
    const u = [...new Set(im)].sort((a, b) => a - b);
    let d = Infinity;
    for (let i = 1; i < u.length; i++) d = Math.min(d, u[i] - u[i - 1]);
    tol = d / 2;
  }
  let next = im.reduce((a, b) => a + b, 0) / im.length;
  let cur = -2 * tol;
  const centers = Array.from(H.centers, (v) => v - min);
  while (Math.abs(next - cur) > tol) {
    cur = next;
    let sf = 0;
    let nf = 0;
    let sb = 0;
    let nb = 0;
    if (H.integer)
      centers.forEach((v, i) => {
        if (v > cur) [sf, nf] = [sf + v * H.counts[i], nf + H.counts[i]];
        else [sb, nb] = [sb + v * H.counts[i], nb + H.counts[i]];
      });
    else
      for (const v of im) {
        if (v > cur) [sf, nf] = [sf + v, nf + 1];
        else [sb, nb] = [sb + v, nb + 1];
      }
    const mf = sf / nf;
    const mb = sb / nb;
    if (mb === 0) break;
    next = (mb - mf) / (Math.log(mb) - Math.log(mf));
  }
  return next + min;
}
function minimum(H: Hist): number | string {
  let s = Float64Array.from(H.counts);
  const maxima = (a: Float64Array) => {
    const idx: number[] = [];
    let dir = 1;
    for (let i = 0; i < a.length - 1; i++) {
      if (dir > 0) {
        if (a[i + 1] < a[i]) {
          dir = -1;
          idx.push(i);
        }
      } else if (a[i + 1] > a[i]) dir = 1;
    }
    return idx;
  };
  let mx = maxima(s);
  for (let it = 0; it < 10000 && mx.length >= 3; it++) {
    // a running mean of 3, the ends mirrored (scipy uniform_filter1d, 'reflect')
    const t = new Float64Array(s.length);
    for (let i = 0; i < s.length; i++) t[i] = (s[reflect(i - 1, s.length)] + s[i] + s[reflect(i + 1, s.length)]) / 3;
    s = t;
    mx = maxima(s);
  }
  if (mx.length !== 2) return 'Minimum: the histogram does not have two peaks.';
  let k = mx[0];
  for (let i = mx[0]; i <= mx[1]; i++) if (s[i] < s[k]) k = i;
  return H.centers[k];
}
function triangle(H: Hist): number {
  let h = Float64Array.from(H.counts);
  const nb = h.length;
  let peak = argmax(h);
  const ph = h[peak];
  const nz = Array.from(h.keys()).filter((i) => h[i] > 0);
  let low = nz[0];
  const high = nz[nz.length - 1];
  if (low === high) return H.centers[low];
  const flip = peak - low < high - peak;
  if (flip) {
    h = h.reverse();
    low = nb - high - 1;
    peak = nb - peak - 1;
  }
  const width = peak - low;
  const norm = Math.hypot(ph, width);
  let best = -Infinity;
  let k = low;
  for (let x = 0; x < width; x++) {
    const len = (ph / norm) * x - (width / norm) * h[x + low];
    if (len > best) [best, k] = [len, x + low];
  }
  if (flip) k = nb - k - 1;
  return H.centers[k];
}

// ---- as ImageJ (on 256 bins: 8-bit data over 0 … 255, others over their range), from the papers ----

// the histogram as ImageJ's methods see it: 8-bit data over the whole 0 … 255
function ijHistogram(H: Hist): { d: Float64Array; value: (k: number) => number } {
  if (H.integer && H.centers[0] >= 0 && H.centers[H.centers.length - 1] <= 255) {
    const d = new Float64Array(256);
    H.centers.forEach((v, i) => (d[v] = H.counts[i]));
    return { d, value: (k) => k };
  }
  if (H.integer) {
    const d = new Float64Array(256);
    const lo = H.centers[0];
    H.centers.forEach((v, i) => (d[v - lo] = H.counts[i]));
    return { d, value: (k) => k + lo };
  }
  return { d: H.counts, value: (k) => H.edge(k) };
}
const partialSum = (y: Float64Array, j: number) => {
  let s = 0;
  for (let i = 0; i <= j; i++) s += y[i];
  return s;
};
function ijDefault(d0: Float64Array): number {
  const d = Float64Array.from(d0);
  // ImageJ's Default: a mode more than twice the next highest count is lowered to 1.5 × that count
  let mode = 0;
  for (let i = 1; i < d.length; i++) if (d[i] > d[mode]) mode = i;
  let second = 0;
  for (let i = 0; i < d.length; i++) if (i !== mode && d[i] > second) second = d[i];
  if (d[mode] > 2 * second && second !== 0) d[mode] = Math.trunc(second * 1.5);
  const maxV = d.length - 1;
  d[0] = 0;
  d[maxV] = 0;
  let min = 0;
  while (d[min] === 0 && min < maxV) min++;
  let max = maxV;
  while (d[max] === 0 && max > 0) max--;
  if (min >= max) return d.length >> 1;
  let moving = min;
  let result = 0;
  do {
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let s4 = 0;
    for (let i = min; i <= moving; i++) [s1, s2] = [s1 + i * d[i], s2 + d[i]];
    for (let i = moving + 1; i <= max; i++) [s3, s4] = [s3 + i * d[i], s4 + d[i]];
    result = (s1 / s2 + s3 / s4) / 2;
    moving++;
  } while (moving + 1 <= result && moving < max - 1);
  return Math.round(result);
}
function huang(d: Float64Array): number {
  let first = 0;
  while (first < d.length && d[first] === 0) first++;
  let last = d.length - 1;
  while (last > first && d[last] === 0) last--;
  if (first >= last) return first;
  const term = 1 / (last - first);
  const mu0 = new Float64Array(d.length);
  let sp = 0;
  let np = 0;
  for (let i = first; i < d.length; i++) {
    sp += i * d[i];
    np += d[i];
    mu0[i] = sp / np;
  }
  const mu1 = new Float64Array(d.length);
  sp = 0;
  np = 0;
  for (let i = last; i > 0; i--) {
    sp += i * d[i];
    np += d[i];
    mu1[i - 1] = sp / np;
  }
  let best = Infinity;
  let t = 0;
  const ent = (m: number) => (m < 1e-6 || m > 0.999999 ? 0 : -m * Math.log(m) - (1 - m) * Math.log(1 - m));
  for (let it = 0; it < d.length; it++) {
    let e = 0;
    for (let i = 0; i <= it; i++) e += d[i] * ent(1 / (1 + term * Math.abs(i - mu0[it])));
    for (let i = it + 1; i < d.length; i++) e += d[i] * ent(1 / (1 + term * Math.abs(i - mu1[it])));
    if (e < best) [best, t] = [e, it];
  }
  return t;
}
const modes = (y: Float64Array) => {
  let m = 0;
  for (let k = 1; k < y.length - 1; k++) if (y[k - 1] < y[k] && y[k + 1] < y[k]) m++;
  return m;
};
function intermodes(d: Float64Array): number | string {
  let y = Float64Array.from(d);
  let it = 0;
  while (modes(y) !== 2) {
    const z = new Float64Array(y.length);
    let prev = 0;
    let cur = 0;
    let next = y[0];
    for (let i = 0; i < y.length - 1; i++) {
      prev = cur;
      cur = next;
      next = y[i + 1];
      z[i] = (prev + cur + next) / 3;
    }
    z[y.length - 1] = (cur + next) / 3;
    y = z;
    if (++it > 10000) return 'Intermodes: the histogram does not have two peaks.';
  }
  let tt = 0;
  for (let i = 1; i < y.length - 1; i++) if (y[i - 1] < y[i] && y[i + 1] < y[i]) tt += i;
  return Math.floor(tt / 2);
}
// the normalised histogram, its cumulative sums and the first and last bins worth trying (MaxEntropy, Renyi, Shanbhag)
function entropyBase(d: Float64Array) {
  const total = d.reduce((a, b) => a + b, 0);
  const norm = Float64Array.from(d, (v) => v / total);
  const P1 = cumsum(norm);
  const P2 = Float64Array.from(P1, (v) => 1 - v);
  let first = 0;
  for (let i = 0; i < d.length; i++)
    if (Math.abs(P1[i]) >= 2.220446049250313e-16) {
      first = i;
      break;
    }
  let last = d.length - 1;
  for (let i = d.length - 1; i >= first; i--)
    if (Math.abs(P2[i]) >= 2.220446049250313e-16) {
      last = i;
      break;
    }
  return { norm, P1, P2, first, last };
}
function maxEntropy(d: Float64Array): number {
  const { norm, P1, P2, first, last } = entropyBase(d);
  let best = -Infinity;
  let t = 0;
  for (let it = first; it <= last; it++) {
    let eb = 0;
    for (let i = 0; i <= it; i++) if (d[i]) eb -= (norm[i] / P1[it]) * Math.log(norm[i] / P1[it]);
    let eo = 0;
    for (let i = it + 1; i < d.length; i++) if (d[i]) eo -= (norm[i] / P2[it]) * Math.log(norm[i] / P2[it]);
    if (eb + eo > best) [best, t] = [eb + eo, it];
  }
  return t;
}
function renyi(d: Float64Array): number {
  const { norm, P1, P2, first, last } = entropyBase(d);
  const tMax = maxEntropy(d);
  const alphaT = (alpha: number) => {
    const term = 1 / (1 - alpha);
    let best = 0;
    let t = 0;
    for (let it = first; it <= last; it++) {
      let eb = 0;
      for (let i = 0; i <= it; i++) eb += alpha === 0.5 ? Math.sqrt(norm[i] / P1[it]) : (norm[i] * norm[i]) / (P1[it] * P1[it]);
      let eo = 0;
      for (let i = it + 1; i < d.length; i++) eo += alpha === 0.5 ? Math.sqrt(norm[i] / P2[it]) : (norm[i] * norm[i]) / (P2[it] * P2[it]);
      const tot = term * (eb * eo > 0 ? Math.log(eb * eo) : 0);
      if (tot > best) [best, t] = [tot, it];
    }
    return t;
  };
  let t1 = alphaT(0.5);
  let t2 = tMax;
  let t3 = alphaT(2);
  if (t2 < t1) [t1, t2] = [t2, t1];
  if (t3 < t2) [t2, t3] = [t3, t2];
  if (t2 < t1) [t1, t2] = [t2, t1];
  let b1: number;
  let b2: number;
  let b3: number;
  if (Math.abs(t1 - t2) <= 5) [b1, b2, b3] = Math.abs(t2 - t3) <= 5 ? [1, 2, 1] : [0, 1, 3];
  else [b1, b2, b3] = Math.abs(t2 - t3) <= 5 ? [3, 1, 0] : [1, 2, 1];
  const omega = P1[t3] - P1[t1];
  return Math.trunc(t1 * (P1[t1] + 0.25 * omega * b1) + 0.25 * t2 * omega * b2 + t3 * (P2[t3] + 0.25 * omega * b3));
}
function shanbhag(d: Float64Array): number {
  const { norm, P1, P2, first, last } = entropyBase(d);
  let best = Infinity;
  let t = 0;
  for (let it = first; it <= last; it++) {
    let eb = 0;
    let term = 0.5 / P1[it];
    for (let i = 1; i <= it; i++) eb -= norm[i] * Math.log(1 - term * P1[i - 1]);
    eb *= term;
    let eo = 0;
    term = 0.5 / P2[it];
    for (let i = it + 1; i < d.length; i++) eo -= norm[i] * Math.log(1 - term * P2[i]);
    eo *= term;
    const tot = Math.abs(eb - eo);
    if (tot < best) [best, t] = [tot, it];
  }
  return t;
}
function minError(d: Float64Array): number {
  const A = (j: number) => partialSum(d, j);
  const B = (j: number) => {
    let s = 0;
    for (let i = 0; i <= j; i++) s += i * d[i];
    return s;
  };
  const C = (j: number) => {
    let s = 0;
    for (let i = 0; i <= j; i++) s += i * i * d[i];
    return s;
  };
  const end = d.length - 1;
  let t = Math.floor(B(end) / A(end));
  let prev = -2;
  for (let guard = 0; t !== prev && guard < 10000; guard++) {
    const mu = B(t) / A(t);
    const nu = (B(end) - B(t)) / (A(end) - A(t));
    const p = A(t) / A(end);
    const q = (A(end) - A(t)) / A(end);
    const s2 = C(t) / A(t) - mu * mu;
    const t2 = (C(end) - C(t)) / (A(end) - A(t)) - nu * nu;
    const w0 = 1 / s2 - 1 / t2;
    const w1 = mu / s2 - nu / t2;
    const w2 = (mu * mu) / s2 - (nu * nu) / t2 + Math.log10((s2 * q * q) / (t2 * p * p));
    const sq = w1 * w1 - w0 * w2;
    if (sq < 0) break;
    prev = t;
    const tmp = (w1 + Math.sqrt(sq)) / w0;
    t = Number.isNaN(tmp) ? prev : Math.floor(tmp);
  }
  return t;
}
function moments(d: Float64Array): number {
  const total = d.reduce((a, b) => a + b, 0);
  const h = Float64Array.from(d, (v) => v / total);
  let m1 = 0;
  let m2 = 0;
  let m3 = 0;
  for (let i = 0; i < h.length; i++) {
    m1 += i * h[i];
    m2 += i * i * h[i];
    m3 += i * i * i * h[i];
  }
  const m0 = 1;
  const cd = m0 * m2 - m1 * m1;
  const c0 = (-m2 * m2 + m1 * m3) / cd;
  const c1 = (m0 * -m3 + m2 * m1) / cd;
  const z0 = 0.5 * (-c1 - Math.sqrt(c1 * c1 - 4 * c0));
  const z1 = 0.5 * (-c1 + Math.sqrt(c1 * c1 - 4 * c0));
  const p0 = (z1 - m1) / (z1 - z0);
  let s = 0;
  for (let i = 0; i < h.length; i++) {
    s += h[i];
    if (s > p0) return i;
  }
  return h.length - 1;
}
function percentile(d: Float64Array, p = 0.5): number {
  const total = d.reduce((a, b) => a + b, 0);
  let best = Infinity;
  let t = 0;
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    s += d[i];
    const v = Math.abs(s / total - p);
    if (v < best) [best, t] = [v, i];
  }
  return t;
}

// The threshold of a channel by a method (a value: the objects are above it), or why not
export function globalThreshold(c: Float32Array, method: GlobalMethod): number | string {
  const H = threshHistogram(c);
  if (!H) return 'The image has no values.';
  if (method === 'mean') {
    let s = 0;
    let n = 0;
    for (const v of c) if (Number.isFinite(v)) [s, n] = [s + v, n + 1];
    return s / n;
  }
  if (method === 'otsu') return H.counts.length === 1 ? H.centers[0] : otsu(H);
  if (method === 'yen') return yen(H);
  if (method === 'isodata') return isodata(H);
  if (method === 'li') return li(c, H);
  if (method === 'minimum') return minimum(H);
  if (method === 'triangle') return triangle(H);
  const { d, value } = ijHistogram(H);
  const k =
    method === 'default' ? ijDefault(d)
    : method === 'huang' ? huang(d)
    : method === 'intermodes' ? intermodes(d)
    : method === 'maxentropy' ? maxEntropy(d)
    : method === 'renyi' ? renyi(d)
    : method === 'shanbhag' ? shanbhag(d)
    : method === 'minerror' ? minError(d)
    : method === 'moments' ? moments(d)
    : percentile(d);
  return typeof k === 'string' ? k : value(k);
}

// ---- local ----

export type LocalMethod = 'mean' | 'median' | 'gaussian' | 'niblack' | 'sauvola' | 'bernsen' | 'phansalkar';
export const LOCAL_METHODS: [LocalMethod, string][] = [
  ['mean', 'Mean'],
  ['median', 'Median'],
  ['gaussian', 'Gaussian'],
  ['niblack', 'Niblack'],
  ['sauvola', 'Sauvola'],
  ['bernsen', 'Bernsen'],
  ['phansalkar', 'Phansalkar'],
];

// the mean and the standard deviation over a square of `size` (odd), the edge mirrored without repeating it (as
// scikit-image's Niblack and Sauvola: numpy's 'reflect')
function meanStdSquare(c: Float32Array, w: number, h: number, size: number): { m: Float32Array; s: Float32Array } {
  const r = size >> 1;
  const mirror = (i: number, n: number) => {
    if (n === 1) return 0;
    const p = 2 * n - 2;
    i %= p;
    if (i < 0) i += p;
    return i < n ? i : p - i;
  };
  const m = new Float32Array(w * h);
  const s = new Float32Array(w * h);
  const n = size * size;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      let b = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = mirror(y + dy, h) * w;
        for (let dx = -r; dx <= r; dx++) {
          const v = c[yy + mirror(x + dx, w)];
          a += v;
          b += v * v;
        }
      }
      const mean = a / n;
      m[y * w + x] = mean;
      s[y * w + x] = Math.sqrt(Math.max(0, b / n - mean * mean));
    }
  return { m, s };
}

// The local threshold of every pixel (scikit-image's threshold_local, Niblack, Sauvola: a square of `size`; ImageJ's
// Bernsen and Phansalkar: a disk of radius size / 2), then the mask of the objects (above it)
// p: offset (mean, median, gaussian: T − offset), k, r (Niblack, Sauvola, Phansalkar), contrast (Bernsen)
export function localThreshold(c: Float32Array, w: number, h: number, method: LocalMethod, size: number, p: { offset?: number; k?: number; r?: number; contrast?: number; lo: number; hi: number }): Float32Array {
  const odd = Math.max(3, size % 2 ? size : size + 1);
  const out = new Float32Array(w * h);
  if (method === 'mean' || method === 'median' || method === 'gaussian') {
    const T =
      method === 'gaussian' ? gaussian(c, w, h, (odd - 1) / 6)
      : method === 'median' ? medianFilter(c, w, h, odd >> 1, 'square')
      : meanFilter(c, w, h, odd >> 1, 'square');
    for (let i = 0; i < out.length; i++) out[i] = c[i] > T[i] - (p.offset ?? 0) ? 1 : 0;
    return out;
  }
  if (method === 'niblack' || method === 'sauvola') {
    const { m, s } = meanStdSquare(c, w, h, odd);
    const k = p.k ?? 0.2;
    const R = p.r ?? 0.5 * (p.hi - p.lo);
    for (let i = 0; i < out.length; i++) {
      const T = method === 'niblack' ? m[i] - k * s[i] : m[i] * (1 + k * (s[i] / R - 1));
      out[i] = c[i] > T ? 1 : 0;
    }
    return out;
  }
  const rad = Math.max(1, odd >> 1);
  if (method === 'bernsen') {
    const mn = minMaxFilter(c, w, h, rad, false);
    const mx = minMaxFilter(c, w, h, rad, true);
    const contrast = p.contrast ?? 15 * ((p.hi - p.lo) / 255);
    const mid = (p.lo + p.hi) / 2;
    for (let i = 0; i < out.length; i++) {
      const lm = (mx[i] + mn[i]) / 2;
      out[i] = mx[i] - mn[i] < contrast ? (lm >= mid ? 1 : 0) : c[i] >= lm ? 1 : 0;
    }
    return out;
  }
  // Phansalkar: on values scaled to 0 … 1
  const span = p.hi - p.lo || 1;
  const u = Float32Array.from(c, (v) => (v - p.lo) / span);
  const m = meanFilter(u, w, h, rad);
  const s = varianceFilter(u, w, h, rad, 'disk', true);
  const k = p.k ?? 0.25;
  const R = p.r ?? 0.5;
  for (let i = 0; i < out.length; i++) out[i] = u[i] > m[i] * (1 + 2 * Math.exp(-10 * m[i]) + k * (s[i] / R - 1)) ? 1 : 0;
  return out;
}
