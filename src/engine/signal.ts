// Signal processing: smoothing (adjacent averaging, Savitzky–Golay, median, Gaussian, LOWESS, FFT low-pass), the
// FFT, interpolation (linear, natural cubic spline, Akima, PCHIP), convolution and deconvolution (Wiener,
// Richardson–Lucy). Checked against reference values (npm run check). The data: arrays of finite numbers; the smoothing
// filters work on the points as they come (equally spaced X assumed), LOWESS and the interpolation on X.
import { maxOf } from './minmax.ts';

// ---- the edges: the values a filter reads beyond the ends ----
// reflect: d c b a | a b c d | d c b a (reflect); mirror: d c b | a b c d | c b a; nearest: a a a | …
export type Edge = 'reflect' | 'mirror' | 'nearest' | 'zero' | 'shrink';
function at(y: ArrayLike<number>, i: number, mode: Edge): number {
  const n = y.length;
  if (i >= 0 && i < n) return y[i];
  if (mode === 'zero') return 0;
  if (mode === 'nearest' || n === 1) return y[i < 0 ? 0 : n - 1];
  if (mode === 'mirror') {
    const p = 2 * (n - 1);
    let j = ((i % p) + p) % p;
    if (j >= n) j = p - j;
    return y[j];
  }
  // reflect (the edge value repeated)
  const p = 2 * n;
  let j = ((i % p) + p) % p;
  if (j >= n) j = p - 1 - j;
  return y[j];
}
// a filter with weights w (odd length, centred); shrink: the window cut at the ends (and the weights renormalized)
function filter(y: ArrayLike<number>, w: number[], mode: Edge): number[] {
  const n = y.length;
  const h = (w.length - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    if (mode === 'shrink') {
      const r = Math.min(h, i, n - 1 - i);
      let [s, ws] = [0, 0];
      for (let k = -r; k <= r; k++) {
        s += w[h + k] * y[i + k];
        ws += w[h + k];
      }
      return s / ws;
    }
    let s = 0;
    for (let k = -h; k <= h; k++) s += w[h + k] * at(y, i + k, mode);
    return s;
  });
}

export function movingAverage(y: ArrayLike<number>, points: number, mode: Edge): number[] {
  const m = Math.max(1, Math.floor(points));
  // an even window: one more point on the left
  if (m % 2 === 0) {
    const n = y.length;
    return Array.from({ length: n }, (_, i) => {
      let s = 0;
      for (let k = -m / 2; k < m / 2; k++) s += at(y, i + k, mode === 'shrink' ? 'nearest' : mode);
      return s / m;
    });
  }
  return filter(y, new Array<number>(m).fill(1 / m), mode);
}
export function gaussianSmooth(y: ArrayLike<number>, sigma: number, mode: Edge, truncate = 4): number[] {
  const r = Math.max(1, Math.floor(truncate * sigma + 0.5));
  const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp((-0.5 * (k - r) ** 2) / (sigma * sigma)));
  const s = w.reduce((a, b) => a + b, 0);
  return filter(
    y,
    w.map((v) => v / s),
    mode,
  );
}
export function medianFilter(y: ArrayLike<number>, points: number, mode: Edge): number[] {
  const m = Math.max(1, Math.floor(points) | 1);
  const h = (m - 1) / 2;
  const n = y.length;
  return Array.from({ length: n }, (_, i) => {
    const r = mode === 'shrink' ? Math.min(h, i, n - 1 - i) : h;
    const win: number[] = [];
    for (let k = -r; k <= r; k++) win.push(at(y, i + k, mode === 'shrink' ? 'nearest' : mode));
    win.sort((a, b) => a - b);
    return win[(win.length - 1) / 2];
  });
}

// ---- small linear algebra: least squares by the normal equations (Gauss–Jordan) ----
function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-300;
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r) => r[n]);
}
// the polynomial of degree p through (t, y) by least squares: its coefficients
function polyfit(t: number[], y: number[], p: number): number[] {
  const A = Array.from({ length: p + 1 }, (_, a) => Array.from({ length: p + 1 }, (_, b) => t.reduce((s, v) => s + v ** (a + b), 0)));
  const r = Array.from({ length: p + 1 }, (_, a) => t.reduce((s, v, i) => s + v ** a * y[i], 0));
  return solve(A, r);
}
const polyval = (c: number[], t: number) => c.reduceRight((s, v) => s * t + v, 0);

// Savitzky–Golay (window points, polynomial degree): the least-squares polynomial of each window read at its centre;
// edges: 'interp' — the polynomial of the first / last window read at the end points (the default) — or padded
export function savgol(y: ArrayLike<number>, points: number, order: number, mode: Edge | 'interp'): number[] {
  const m = Math.max(3, Math.floor(points) | 1);
  const p = Math.min(order, m - 1);
  const h = (m - 1) / 2;
  const n = y.length;
  if (n < m) return Array.from(y);
  // the weights at the centre: row 0 of the pseudo-inverse of the Vandermonde matrix
  const t = Array.from({ length: m }, (_, i) => i - h);
  const w = t.map((_, j) => {
    const e = t.map((__, i) => (i === j ? 1 : 0));
    return polyfit(t, e, p)[0];
  });
  if (mode !== 'interp') return filter(y, w, mode);
  const out = filter(y, w, 'nearest');
  const ends = (from: number) => {
    const c = polyfit(t, Array.from({ length: m }, (_, i) => y[from + i]), p);
    return (i: number) => polyval(c, i - from - h);
  };
  const a = ends(0);
  const b = ends(n - m);
  for (let i = 0; i < h; i++) out[i] = a(i);
  for (let i = n - h; i < n; i++) out[i] = b(i);
  return out;
}

// LOWESS (Cleveland 1979): at every x a straight line fitted to the frac·n nearest points with tricube weights; then
// `iter` robustness passes (bisquare weights of the residuals)
export function lowess(x: ArrayLike<number>, y: ArrayLike<number>, frac: number, iter = 3): number[] {
  const n = x.length;
  const o = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  const X = o.map((i) => x[i]);
  const Y = o.map((i) => y[i]);
  const k = Math.max(2, Math.min(n, Math.floor(frac * n + 1e-10)));
  let rob = new Array<number>(n).fill(1);
  let fit = new Array<number>(n).fill(0);
  for (let it = 0; it <= iter; it++) {
    let lo = 0;
    fit = X.map((xi, i) => {
      // the window: the k points nearest xi (it slides with i)
      while (lo + k < n && xi - X[lo] > X[lo + k] - xi) lo++;
      const hi = lo + k - 1;
      const hmax = Math.max(xi - X[lo], X[hi] - xi);
      let [sw, sx, sy, sxx, sxy] = [0, 0, 0, 0, 0];
      for (let j = lo; j <= hi; j++) {
        const u = hmax > 0 ? Math.abs(X[j] - xi) / hmax : 0;
        const w = (u < 1 ? (1 - u ** 3) ** 3 : 0) * rob[j];
        sw += w;
        sx += w * X[j];
        sy += w * Y[j];
        sxx += w * X[j] * X[j];
        sxy += w * X[j] * Y[j];
      }
      if (sw <= 0) return Y[i];
      const mx = sx / sw;
      const my = sy / sw;
      const vx = sxx / sw - mx * mx;
      const b = vx > 1e-12 * (Math.abs(mx) + 1) ** 2 ? (sxy / sw - mx * my) / vx : 0;
      return my + b * (xi - mx);
    });
    if (it === iter) break;
    const res = Y.map((v, i) => Math.abs(v - fit[i]));
    const sr = [...res].sort((p, q) => p - q);
    const med = n % 2 ? sr[(n - 1) / 2] : (sr[n / 2 - 1] + sr[n / 2]) / 2;
    if (!(med > 0)) break;
    rob = res.map((r) => {
      const u = r / (6 * med);
      return u < 1 ? (1 - u * u) ** 2 : 0;
    });
  }
  const out = new Array<number>(n);
  o.forEach((i, k2) => (out[i] = fit[k2]));
  return out;
}

// ---- the FFT (any length: radix 2, else Bluestein) ----
export function fft(re: number[], im: number[], inverse = false): [number[], number[]] {
  const n = re.length;
  if (n <= 1) return [re.slice(), im.slice()];
  if ((n & (n - 1)) === 0) return radix2(re, im, inverse);
  // Bluestein: the DFT as a convolution with a chirp, done by power-of-two FFTs
  const s = inverse ? 1 : -1;
  const m = 1 << Math.ceil(Math.log2(2 * n - 1));
  const cw = Array.from({ length: n }, (_, k) => Math.cos((Math.PI * ((k * k) % (2 * n))) / n));
  const sw = Array.from({ length: n }, (_, k) => s * Math.sin((Math.PI * ((k * k) % (2 * n))) / n));
  const ar = new Array<number>(m).fill(0);
  const ai = new Array<number>(m).fill(0);
  for (let k = 0; k < n; k++) {
    ar[k] = re[k] * cw[k] - im[k] * sw[k];
    ai[k] = re[k] * sw[k] + im[k] * cw[k];
  }
  const br = new Array<number>(m).fill(0);
  const bi = new Array<number>(m).fill(0);
  br[0] = cw[0];
  bi[0] = -sw[0];
  for (let k = 1; k < n; k++) {
    br[k] = br[m - k] = cw[k];
    bi[k] = bi[m - k] = -sw[k];
  }
  const [Ar, Ai] = radix2(ar, ai, false);
  const [Br, Bi] = radix2(br, bi, false);
  const cr = Ar.map((v, k) => v * Br[k] - Ai[k] * Bi[k]);
  const ci = Ar.map((v, k) => v * Bi[k] + Ai[k] * Br[k]);
  const [Cr, Ci] = radix2(cr, ci, true);
  const or = new Array<number>(n);
  const oi = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    or[k] = Cr[k] * cw[k] - Ci[k] * sw[k];
    oi[k] = Cr[k] * sw[k] + Ci[k] * cw[k];
  }
  return inverse ? [or.map((v) => v / n), oi.map((v) => v / n)] : [or, oi];
}
function radix2(re0: number[], im0: number[], inverse: boolean): [number[], number[]] {
  const n = re0.length;
  const re = re0.slice();
  const im = im0.slice();
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const [c, s] = [Math.cos(ang * k), Math.sin(ang * k)];
        const [ur, ui] = [re[i + k], im[i + k]];
        const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
        const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
  }
  return inverse ? [re.map((v) => v / n), im.map((v) => v / n)] : [re, im];
}
// the windows (symmetric: Hann, Hamming, Blackman)
export type Window = 'none' | 'hann' | 'hamming' | 'blackman';
export function windowOf(kind: Window, n: number): number[] {
  if (kind === 'none' || n < 2) return new Array<number>(n).fill(1);
  return Array.from({ length: n }, (_, k) => {
    const c = (2 * Math.PI * k) / (n - 1);
    return kind === 'hann' ? 0.5 - 0.5 * Math.cos(c) : kind === 'hamming' ? 0.54 - 0.46 * Math.cos(c) : 0.42 - 0.5 * Math.cos(c) + 0.08 * Math.cos(2 * c);
  });
}
// the one-sided spectrum of a real signal sampled every dx: frequency, amplitude (the amplitude of a sine, corrected for
// the window), phase (degrees)
export function spectrum(y: number[], dx: number, win: Window, detrend: 'none' | 'mean' | 'linear', pad: boolean): { f: number[]; amp: number[]; phase: number[]; re: number[]; im: number[] } {
  let v = y.slice();
  const n0 = v.length;
  if (detrend === 'mean') {
    const m = v.reduce((a, b) => a + b, 0) / n0;
    v = v.map((u) => u - m);
  } else if (detrend === 'linear') {
    const t = v.map((_, i) => i);
    const c = polyfit(t, v, 1);
    v = v.map((u, i) => u - polyval(c, i));
  }
  const w = windowOf(win, n0);
  v = v.map((u, i) => u * w[i]);
  const gain = w.reduce((a, b) => a + b, 0) / n0;
  const n = pad ? 1 << Math.ceil(Math.log2(n0)) : n0;
  const re = [...v, ...new Array<number>(n - n0).fill(0)];
  const [R, I] = fft(re, new Array<number>(n).fill(0));
  const half = Math.floor(n / 2) + 1;
  const f = Array.from({ length: half }, (_, k) => k / (n * dx));
  const amp = f.map((_, k) => (Math.hypot(R[k], I[k]) / n0 / gain) * (k === 0 || (n % 2 === 0 && k === n / 2) ? 1 : 2));
  const phase = f.map((_, k) => (Math.atan2(I[k], R[k]) * 180) / Math.PI);
  return { f, amp, phase, re: R.slice(0, half), im: I.slice(0, half) };
}
// an FFT filter: the frequencies passed (ideal, or a Butterworth-shaped response of order `order`) — low / high pass
// at f1, band pass / stop between f1 and f2; the ends mirrored first (less wrap-around), then cut back
export type FilterKind = 'low' | 'high' | 'band' | 'stop';
export function fftFilter(y: number[], dx: number, kind: FilterKind, f1: number, f2: number, order: number, mirror: boolean): number[] {
  const n0 = y.length;
  const v = mirror ? [...y.slice(1).reverse(), ...y, ...y.slice(0, -1).reverse()] : y.slice();
  const n = v.length;
  const [R, I] = fft(v, new Array<number>(n).fill(0));
  const lowpass = (f: number, fc: number) => (order > 0 ? 1 / Math.sqrt(1 + (f / fc) ** (2 * order)) : f <= fc ? 1 : 0);
  const H = (f: number) => {
    if (kind === 'low') return lowpass(f, f1);
    if (kind === 'high') return 1 - lowpass(f, f1);
    const [a, b] = [Math.min(f1, f2), Math.max(f1, f2)];
    const band = lowpass(f, b) * (1 - lowpass(f, a));
    return kind === 'band' ? band : 1 - band;
  };
  for (let k = 0; k < n; k++) {
    const f = Math.min(k, n - k) / (n * dx);
    const g = H(f);
    R[k] *= g;
    I[k] *= g;
  }
  const [out] = fft(R, I, true);
  return mirror ? out.slice(n0 - 1, 2 * n0 - 1) : out;
}

// ---- interpolation ----
export type InterpMethod = 'linear' | 'spline' | 'akima' | 'pchip' | 'nearest';
export type Extrap = 'none' | 'constant' | 'linear' | 'method';
// the curve through (x, y) — x ascending, repeated x averaged — read at u
export function interpolator(x0: number[], y0: number[], method: InterpMethod, extrap: Extrap): (u: number) => number {
  // sorted, the repeated X averaged
  const o = x0.map((_, i) => i).sort((a, b) => x0[a] - x0[b]);
  const x: number[] = [];
  const y: number[] = [];
  for (let k = 0; k < o.length; ) {
    let j = k;
    let s = 0;
    while (j < o.length && x0[o[j]] === x0[o[k]]) s += y0[o[j++]];
    x.push(x0[o[k]]);
    y.push(s / (j - k));
    k = j;
  }
  const n = x.length;
  if (n === 0) return () => NaN;
  if (n === 1) return (u) => (extrap === 'none' && u !== x[0] ? NaN : y[0]);
  const hs = x.slice(1).map((v, i) => v - x[i]);
  const ms = hs.map((h, i) => (y[i + 1] - y[i]) / h);
  // the derivative at every point (Hermite methods), or the second derivatives (spline)
  let d: number[] = [];
  let M: number[] = [];
  if (method === 'spline') {
    // natural: M0 = Mn = 0 (tridiagonal system)
    M = new Array<number>(n).fill(0);
    if (n > 2) {
      const a = new Array<number>(n).fill(0);
      const b = new Array<number>(n).fill(1);
      const c = new Array<number>(n).fill(0);
      const r = new Array<number>(n).fill(0);
      for (let i = 1; i < n - 1; i++) {
        a[i] = hs[i - 1];
        b[i] = 2 * (hs[i - 1] + hs[i]);
        c[i] = hs[i];
        r[i] = 6 * (ms[i] - ms[i - 1]);
      }
      for (let i = 1; i < n; i++) {
        const w = a[i] / b[i - 1];
        b[i] -= w * c[i - 1];
        r[i] -= w * r[i - 1];
      }
      M[n - 1] = r[n - 1] / b[n - 1];
      for (let i = n - 2; i >= 0; i--) M[i] = (r[i] - c[i] * M[i + 1]) / b[i];
    }
  } else if (method === 'akima') {
    // Akima: the slopes extended by two at each end
    const m = [3 * ms[0] - 2 * (ms[1] ?? ms[0]), 2 * ms[0] - (ms[1] ?? ms[0]), ...ms, 2 * ms[n - 2] - (ms[n - 3] ?? ms[n - 2]), 3 * ms[n - 2] - 2 * (ms[n - 3] ?? ms[n - 2])];
    const f1 = Array.from({ length: n }, (_, i) => Math.abs(m[i + 3] - m[i + 2]));
    const f2 = Array.from({ length: n }, (_, i) => Math.abs(m[i + 1] - m[i]));
    const f12 = f1.map((v, i) => v + f2[i]);
    const big = maxOf(f12);
    d = f12.map((v, i) => (v > 1e-9 * big ? (f1[i] * m[i + 1] + f2[i] * m[i + 2]) / v : 0.5 * (m[i + 3] + m[i])));
  } else if (method === 'pchip') {
    d = new Array<number>(n).fill(0);
    if (n === 2) d = [ms[0], ms[0]];
    else {
      for (let k = 1; k < n - 1; k++) {
        if (ms[k - 1] * ms[k] <= 0) continue;
        const w1 = 2 * hs[k] + hs[k - 1];
        const w2 = hs[k] + 2 * hs[k - 1];
        d[k] = (w1 + w2) / (w1 / ms[k - 1] + w2 / ms[k]);
      }
      const edge = (h0: number, h1: number, m0: number, m1: number) => {
        let e = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
        if (Math.sign(e) !== Math.sign(m0)) e = 0;
        else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(e) > Math.abs(3 * m0)) e = 3 * m0;
        return e;
      };
      d[0] = edge(hs[0], hs[1], ms[0], ms[1]);
      d[n - 1] = edge(hs[n - 2], hs[n - 3], ms[n - 2], ms[n - 3]);
    }
  }
  // the piece i (x[i] … x[i+1]) read at u (also beyond its ends: the polynomial goes on)
  const piece = (i: number, u: number) => {
    const h = hs[i];
    if (method === 'linear') return y[i] + ms[i] * (u - x[i]);
    if (method === 'nearest') return u - x[i] < x[i + 1] - u ? y[i] : y[i + 1];
    if (method === 'spline') {
      const [A, B] = [(x[i + 1] - u) / h, (u - x[i]) / h];
      return A * y[i] + B * y[i + 1] + (((A ** 3 - A) * M[i] + (B ** 3 - B) * M[i + 1]) * h * h) / 6;
    }
    const t = (u - x[i]) / h;
    const [h00, h10, h01, h11] = [2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2];
    return h00 * y[i] + h10 * h * d[i] + h01 * y[i + 1] + h11 * h * d[i + 1];
  };
  return (u: number) => {
    if (!Number.isFinite(u)) return NaN;
    if (u < x[0] || u > x[n - 1]) {
      const left = u < x[0];
      if (extrap === 'none') return NaN;
      if (extrap === 'constant') return left ? y[0] : y[n - 1];
      if (extrap === 'linear') return left ? y[0] + ms[0] * (u - x[0]) : y[n - 1] + ms[n - 2] * (u - x[n - 1]);
      return piece(left ? 0 : n - 2, u);
    }
    let [a, b] = [0, n - 1];
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (x[m] <= u) a = m;
      else b = m;
    }
    return piece(a, u);
  };
}

// ---- convolution and deconvolution (the kernel sampled on the signal's step, centred, area 1) ----
export type KernelShape = 'gauss' | 'lorentz' | 'box';
export function kernelOf(shape: KernelShape, fwhm: number, dx: number, maxLen: number): number[] {
  const w = Math.abs(fwhm / dx);
  const half = Math.min(Math.floor(maxLen / 2), Math.ceil(shape === 'gauss' ? 3 * w : shape === 'lorentz' ? 20 * w : w / 2));
  const k = Array.from({ length: 2 * half + 1 }, (_, i) => {
    const t = i - half;
    if (shape === 'gauss') return Math.exp((-4 * Math.LN2 * t * t) / (w * w));
    if (shape === 'lorentz') return 1 / (1 + ((2 * t) / w) ** 2);
    return Math.abs(t) <= w / 2 + 1e-9 ? 1 : 0;
  });
  const s = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / s);
}
// a kernel given as data: centred on its maximum, area 1
export function kernelFrom(values: number[]): number[] {
  const s = values.reduce((a, b) => a + b, 0) || 1;
  let c = 0;
  values.forEach((v, i) => v > values[c] && (c = i));
  const half = Math.max(c, values.length - 1 - c);
  return Array.from({ length: 2 * half + 1 }, (_, i) => (values[c - half + i] ?? 0) / s);
}
// the signal convolved with the kernel, the same length (the ends: zero, reflect or nearest)
export function convolve(y: number[], k: number[], mode: Edge): number[] {
  const h = (k.length - 1) / 2;
  const n = y.length;
  return Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (let j = 0; j < k.length; j++) s += k[j] * at(y, i + h - j, mode === 'shrink' ? 'nearest' : mode);
    return s;
  });
}
// Wiener deconvolution: Y·K*/(|K|² + λ·max|K|²) on the signal padded (reflect) to twice its length
export function wiener(y: number[], k: number[], lambda: number): number[] {
  const n0 = y.length;
  const pad = Math.max(k.length, Math.floor(n0 / 2));
  const v = Array.from({ length: n0 + 2 * pad }, (_, i) => at(y, i - pad, 'reflect'));
  const n = v.length;
  const kk = new Array<number>(n).fill(0);
  const h = (k.length - 1) / 2;
  k.forEach((w, j) => (kk[(((j - h) % n) + n) % n] = w));
  const [Yr, Yi] = fft(v, new Array<number>(n).fill(0));
  const [Kr, Ki] = fft(kk, new Array<number>(n).fill(0));
  const k2 = Kr.map((r, i) => r * r + Ki[i] * Ki[i]);
  const reg = lambda * maxOf(k2);
  const Xr = Yr.map((r, i) => (r * Kr[i] + Yi[i] * Ki[i]) / (k2[i] + reg));
  const Xi = Yr.map((r, i) => (Yi[i] * Kr[i] - r * Ki[i]) / (k2[i] + reg));
  const [out] = fft(Xr, Xi, true);
  return out.slice(pad, pad + n0);
}
// Richardson–Lucy: u ← u · (K̃ ⊛ (y / (K ⊛ u))), starting from y (for data ≥ 0)
export function richardsonLucy(y: number[], k: number[], iterations: number, mode: Edge = 'reflect'): number[] {
  const flip = [...k].reverse();
  let u = y.map((v) => Math.max(v, 0));
  for (let it = 0; it < iterations; it++) {
    const c = convolve(u, k, mode);
    const ratio = y.map((v, i) => (c[i] > 1e-300 ? v / c[i] : 0));
    const corr = convolve(ratio, flip, mode);
    u = u.map((v, i) => v * corr[i]);
  }
  return u;
}
