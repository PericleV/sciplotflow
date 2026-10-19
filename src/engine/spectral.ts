// Spectral and noise analysis of evenly sampled signals (fs: the samples per unit of X), as SciPy does them: Welch's
// power spectral density and the cross spectrum (segments with overlap, a periodic window, each detrended), the
// coherence, the spectrogram, the analytic signal (Hilbert: envelope, phase, frequency), IIR filters (Butterworth and
// Chebyshev type I designed by the bilinear transform, in second-order sections, causal or forward–backward with
// SciPy's padding), the overlapping Allan deviation, and the continuous wavelet transform (Morlet). Pure.
import { fft } from './signal.ts';

export type Win = 'hann' | 'hamming' | 'blackman' | 'none';
// the periodic window of n points (as SciPy's get_window)
export function periodicWindow(kind: Win, n: number): number[] {
  return Array.from({ length: n }, (_, k) => {
    const c = (2 * Math.PI * k) / n;
    return kind === 'hann' ? 0.5 - 0.5 * Math.cos(c) : kind === 'hamming' ? 0.54 - 0.46 * Math.cos(c) : kind === 'blackman' ? 0.42 - 0.5 * Math.cos(c) + 0.08 * Math.cos(2 * c) : 1;
  });
}

type Detrend = 'constant' | 'linear' | 'none';
function detrended(v: number[], how: Detrend): number[] {
  const n = v.length;
  if (how === 'none' || !n) return v;
  if (how === 'constant') {
    const m = v.reduce((a, b) => a + b, 0) / n;
    return v.map((u) => u - m);
  }
  const mt = (n - 1) / 2;
  const my = v.reduce((a, b) => a + b, 0) / n;
  let [sxy, sxx] = [0, 0];
  v.forEach((u, i) => {
    sxy += (i - mt) * (u - my);
    sxx += (i - mt) ** 2;
  });
  const b = sxx ? sxy / sxx : 0;
  return v.map((u, i) => u - my - b * (i - mt));
}

export type WelchOptions = { nperseg: number; overlap: number; window: Win; detrend: Detrend; scaling: 'density' | 'spectrum' };
// the segments of a signal: start indices
function segmentStarts(n: number, nperseg: number, noverlap: number): number[] {
  const step = Math.max(1, nperseg - noverlap);
  const out: number[] = [];
  for (let s = 0; s + nperseg <= n; s += step) out.push(s);
  return out;
}
function segmentFft(x: number[], s: number, nseg: number, w: number[], detrend: Detrend) {
  const seg = detrended(x.slice(s, s + nseg), detrend).map((u, i) => u * w[i]);
  return fft(seg, new Array<number>(nseg).fill(0));
}
// the cross spectral density of x and y (x = y: the power spectral density), one-sided, averaged over the segments
export function csd(x: number[], y: number[], fs: number, o: WelchOptions): { f: number[]; re: number[]; im: number[]; segments: number } {
  const n = Math.min(x.length, y.length);
  const nseg = Math.max(2, Math.min(Math.round(o.nperseg), n));
  const nover = Math.min(nseg - 1, Math.max(0, Math.round(o.overlap * nseg)));
  const w = periodicWindow(o.window, nseg);
  const scale = o.scaling === 'density' ? 1 / (fs * w.reduce((a, b) => a + b * b, 0)) : 1 / w.reduce((a, b) => a + b, 0) ** 2;
  const starts = segmentStarts(n, nseg, nover);
  const half = Math.floor(nseg / 2) + 1;
  const re = new Array<number>(half).fill(0);
  const im = new Array<number>(half).fill(0);
  for (const s of starts) {
    const [xr, xi] = segmentFft(x, s, nseg, w, o.detrend);
    const [yr, yi] = x === y ? [xr, xi] : segmentFft(y, s, nseg, w, o.detrend);
    for (let k = 0; k < half; k++) {
      // conj(X)·Y
      re[k] += xr[k] * yr[k] + xi[k] * yi[k];
      im[k] += xr[k] * yi[k] - xi[k] * yr[k];
    }
  }
  const m = starts.length || 1;
  for (let k = 0; k < half; k++) {
    // one-sided: the frequencies but 0 (and Nyquist for an even length) counted twice
    const two = k === 0 || (nseg % 2 === 0 && k === half - 1) ? 1 : 2;
    re[k] = (re[k] * scale * two) / m;
    im[k] = (im[k] * scale * two) / m;
  }
  return { f: Array.from({ length: half }, (_, k) => (k * fs) / nseg), re, im, segments: starts.length };
}
export function welch(x: number[], fs: number, o: WelchOptions) {
  const r = csd(x, x, fs, o);
  return { f: r.f, p: r.re, segments: r.segments };
}
// the magnitude-squared coherence |Pxy|² / (Pxx·Pyy), and the phase of the cross spectrum (degrees)
export function coherence(x: number[], y: number[], fs: number, o: WelchOptions) {
  const pxy = csd(x, y, fs, o);
  const pxx = csd(x, x, fs, o).re;
  const pyy = csd(y, y, fs, o).re;
  return { f: pxy.f, c: pxy.re.map((r, k) => (r * r + pxy.im[k] ** 2) / (pxx[k] * pyy[k])), phase: pxy.re.map((r, k) => (Math.atan2(pxy.im[k], r) * 180) / Math.PI), segments: pxy.segments };
}
// the spectrogram: the power spectral density of every segment, at its middle
export function spectrogram(x: number[], fs: number, o: WelchOptions): { t: number[]; f: number[]; p: number[][] } {
  const n = x.length;
  const nseg = Math.max(2, Math.min(Math.round(o.nperseg), n));
  const nover = Math.min(nseg - 1, Math.max(0, Math.round(o.overlap * nseg)));
  const w = periodicWindow(o.window, nseg);
  const scale = o.scaling === 'density' ? 1 / (fs * w.reduce((a, b) => a + b * b, 0)) : 1 / w.reduce((a, b) => a + b, 0) ** 2;
  const half = Math.floor(nseg / 2) + 1;
  const starts = segmentStarts(n, nseg, nover);
  const p = starts.map((s) => {
    const [r, i] = segmentFft(x, s, nseg, w, o.detrend);
    return Array.from({ length: half }, (_, k) => (r[k] * r[k] + i[k] * i[k]) * scale * (k === 0 || (nseg % 2 === 0 && k === half - 1) ? 1 : 2));
  });
  return { t: starts.map((s) => (s + nseg / 2) / fs), f: Array.from({ length: half }, (_, k) => (k * fs) / nseg), p };
}

// ---- the analytic signal (Hilbert) ----
export function hilbert(x: number[]): { re: number[]; im: number[] } {
  const n = x.length;
  const [R, I] = fft(x.slice(), new Array<number>(n).fill(0));
  const h = Array.from({ length: n }, (_, k) => (k === 0 || (n % 2 === 0 && k === n / 2) ? 1 : k < n / 2 ? 2 : 0));
  const [r, i] = fft(R.map((v, k) => v * h[k]), I.map((v, k) => v * h[k]), true);
  return { re: r, im: i };
}
// the envelope, the phase (radians, unwrapped) and the frequency (its rate / 2π, in 1 / the unit of X)
export function analytic(x: number[], fs: number): { envelope: number[]; phase: number[]; freq: number[] } {
  const z = hilbert(x);
  const envelope = z.re.map((r, k) => Math.hypot(r, z.im[k]));
  const phase: number[] = [];
  let off = 0;
  z.re.forEach((r, k) => {
    const a = Math.atan2(z.im[k], r);
    if (k > 0) {
      const d = a + off - phase[k - 1];
      if (d > Math.PI) off -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      else if (d < -Math.PI) off += 2 * Math.PI * Math.round(-d / (2 * Math.PI));
    }
    phase.push(a + off);
  });
  const n = x.length;
  const freq = phase.map((_, k) => {
    const [a, b] = [Math.max(0, k - 1), Math.min(n - 1, k + 1)];
    return b > a ? ((phase[b] - phase[a]) / (b - a)) * (fs / (2 * Math.PI)) : NaN;
  });
  return { envelope, phase, freq };
}

// ---- IIR filters ----
type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const csqrt = (a: C): C => {
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt(Math.max(0, (r + a[0]) / 2));
  const im = Math.sqrt(Math.max(0, (r - a[0]) / 2)) * (a[1] < 0 ? -1 : 1);
  return [re, im];
};
const cprod = (v: C[]): C => v.reduce((a, b) => cmul(a, b), [1, 0] as C);
type Zpk = { z: C[]; p: C[]; k: number };

export type IirKind = 'butter' | 'cheby1';
export type Band = 'low' | 'high' | 'band' | 'stop';
// the analog prototype (cut-off 1 rad/s)
function prototype(kind: IirKind, N: number, rp: number): Zpk {
  const p: C[] = [];
  for (let m = -N + 1; m < N; m += 2) {
    if (kind === 'butter') {
      const t = (Math.PI * m) / (2 * N);
      p.push([-Math.cos(t), -Math.sin(t)]);
    } else {
      const eps = Math.sqrt(10 ** (0.1 * rp) - 1);
      const mu = Math.asinh(1 / eps) / N;
      const th = (Math.PI * m) / (2 * N);
      // −sinh(mu + i·θ)
      p.push([-Math.sinh(mu) * Math.cos(th), -Math.cosh(mu) * Math.sin(th)]);
    }
  }
  let k = 1;
  if (kind === 'cheby1') {
    k = cprod(p.map((q) => [-q[0], -q[1]] as C))[0];
    if (N % 2 === 0) k /= Math.sqrt(1 + (10 ** (0.1 * rp) - 1));
  }
  return { z: [], p, k };
}
// the band transformations of the prototype, then the bilinear transform (SciPy's zpk algebra, fs = 2)
function digital(proto: Zpk, band: Band, w1: number, w2: number): Zpk {
  const fs = 2;
  const warp = (w: number) => 2 * fs * Math.tan((Math.PI * w) / fs);
  let { z, p, k } = proto;
  const deg = p.length - z.length;
  if (band === 'low' || band === 'high') {
    const wo = warp(w1);
    if (band === 'low') {
      z = z.map((q) => [q[0] * wo, q[1] * wo]);
      p = p.map((q) => [q[0] * wo, q[1] * wo]);
      k *= wo ** deg;
    } else {
      k *= cdiv(cprod(z.map((q) => [-q[0], -q[1]] as C)), cprod(p.map((q) => [-q[0], -q[1]] as C)))[0];
      z = [...z.map((q) => cdiv([wo, 0], q)), ...Array.from({ length: deg }, (): C => [0, 0])];
      p = p.map((q) => cdiv([wo, 0], q));
    }
  } else {
    const [a, b] = [warp(Math.min(w1, w2)), warp(Math.max(w1, w2))];
    const wo = Math.sqrt(a * b);
    const bw = b - a;
    const split = (v: C[], scale: (q: C) => C) =>
      v.flatMap((q) => {
        const s = scale(q);
        const r = csqrt(csub(cmul(s, s), [wo * wo, 0]));
        return [cadd(s, r), csub(s, r)];
      });
    if (band === 'band') {
      z = [...split(z, (q) => [(q[0] * bw) / 2, (q[1] * bw) / 2]), ...Array.from({ length: deg }, (): C => [0, 0])];
      p = split(p, (q) => [(q[0] * bw) / 2, (q[1] * bw) / 2]);
      k *= bw ** deg;
    } else {
      k *= cdiv(cprod(z.map((q) => [-q[0], -q[1]] as C)), cprod(p.map((q) => [-q[0], -q[1]] as C)))[0];
      z = [...split(z, (q) => cdiv([bw / 2, 0], q)), ...Array.from({ length: deg }, (): C => [0, wo]), ...Array.from({ length: deg }, (): C => [0, -wo])];
      p = split(p, (q) => cdiv([bw / 2, 0], q));
    }
  }
  // bilinear
  const fs2 = 2 * fs;
  const dz = p.length - z.length;
  const zz = [...z.map((q) => cdiv(cadd([fs2, 0], q), csub([fs2, 0], q))), ...Array.from({ length: dz }, (): C => [-1, 0])];
  const pz = p.map((q) => cdiv(cadd([fs2, 0], q), csub([fs2, 0], q)));
  const kz = k * cdiv(cprod(z.map((q) => csub([fs2, 0], q))), cprod(p.map((q) => csub([fs2, 0], q))))[0];
  return { z: zz, p: pz, k: kz };
}
// the roots in pairs (complex conjugates together, the real ones two by two)
function pairs(v: C[]): C[][] {
  const left = v.slice();
  const out: C[][] = [];
  const tol = 1e-9;
  // the complex ones with their conjugate
  for (let i = 0; i < left.length; i++) {
    const q = left[i];
    if (Math.abs(q[1]) <= tol) continue;
    if (q[1] < 0) continue;
    const j = left.findIndex((r, jj) => jj !== i && Math.abs(r[0] - q[0]) < 1e-7 * (1 + Math.abs(q[0])) && Math.abs(r[1] + q[1]) < 1e-7 * (1 + Math.abs(q[1])));
    out.push([q, j >= 0 ? left[j] : [q[0], -q[1]]]);
  }
  const reals = left.filter((q) => Math.abs(q[1]) <= tol).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < reals.length; i += 2) out.push(reals.slice(i, i + 2));
  return out;
}
// the second-order sections [b0 b1 b2 1 a1 a2], the gain in the first
export function designSos(kind: IirKind, N: number, band: Band, w1: number, w2: number, rp = 1): number[][] {
  const d = digital(prototype(kind, Math.max(1, Math.round(N)), rp), band, w1, w2);
  const pp = pairs(d.p);
  const zp = pairs(d.z);
  const poly = (r: C[]): [number, number, number] => (r.length === 2 ? [1, -(r[0][0] + r[1][0]), cmul(r[0], r[1])[0]] : r.length === 1 ? [1, -r[0][0], 0] : [1, 0, 0]);
  const n = Math.max(pp.length, zp.length);
  const sos: number[][] = [];
  for (let s = 0; s < n; s++) {
    const [b0, b1, b2] = poly(zp[s] ?? []);
    const [, a1, a2] = poly(pp[s] ?? []);
    sos.push([b0, b1, b2, 1, a1, a2]);
  }
  sos[0] = [sos[0][0] * d.k, sos[0][1] * d.k, sos[0][2] * d.k, 1, sos[0][4], sos[0][5]];
  return sos;
}
// filtering by the sections (direct form II transposed), from the states zi
export function sosfilt(sos: number[][], x: number[], zi?: number[][]): { y: number[]; zf: number[][] } {
  const z = sos.map((_, s) => (zi ? zi[s].slice() : [0, 0]));
  const y = x.slice();
  for (let s = 0; s < sos.length; s++) {
    const [b0, b1, b2, , a1, a2] = sos[s];
    let [z0, z1] = z[s];
    for (let i = 0; i < y.length; i++) {
      const u = y[i];
      const v = b0 * u + z0;
      z0 = b1 * u - a1 * v + z1;
      z1 = b2 * u - a2 * v;
      y[i] = v;
    }
    z[s] = [z0, z1];
  }
  return { y, zf: z };
}
// the states of every section at rest under a constant input of 1 (SciPy's sosfilt_zi)
function sosZi(sos: number[][]): number[][] {
  let scale = 1;
  return sos.map(([b0, b1, b2, , a1, a2]) => {
    // (I − Aᵀ)·zi = b[1:] − a[1:]·b0, A the companion of a
    const [r1, r2] = [b1 - a1 * b0, b2 - a2 * b0];
    const det = (1 + a1) * 1 - -1 * a2;
    const zi = [(r1 * 1 + 1 * r2) / det, ((1 + a1) * r2 - a2 * r1) / det].map((v) => v * scale);
    scale *= (b0 + b1 + b2) / (1 + a1 + a2);
    return zi;
  });
}
// forward and backward (no shift of phase), the ends extended by odd reflection as SciPy's sosfiltfilt
export function sosfiltfilt(sos: number[][], x: number[]): number[] {
  const n = x.length;
  const zeros = Math.min(sos.filter((s) => s[2] === 0).length, sos.filter((s) => s[5] === 0).length);
  const padlen = Math.min(n - 1, 3 * (2 * sos.length + 1 - zeros));
  const ext = [...Array.from({ length: padlen }, (_, i) => 2 * x[0] - x[padlen - i]), ...x, ...Array.from({ length: padlen }, (_, i) => 2 * x[n - 1] - x[n - 2 - i])];
  const zi = sosZi(sos);
  const f = sosfilt(sos, ext, zi.map((z) => z.map((v) => v * ext[0]))).y;
  const r = f.slice().reverse();
  const b = sosfilt(sos, r, zi.map((z) => z.map((v) => v * r[0]))).y.reverse();
  return b.slice(padlen, padlen + n);
}

// ---- Allan deviation (overlapping), of a rate sampled every tau0 ----
export function allanDeviation(y: number[], tau0: number, spacing: 'octave' | 'decade' | 'all'): { tau: number[]; adev: number[]; terms: number[] } {
  const N = y.length;
  // the phase: the running sum
  const x = [0];
  for (const v of y) x.push(x[x.length - 1] + v * tau0);
  let ms: number[] = [];
  const top = Math.floor((N - 1) / 2);
  if (spacing === 'all') ms = Array.from({ length: top }, (_, i) => i + 1);
  else if (spacing === 'octave') for (let m = 1; m <= top; m *= 2) ms.push(m);
  else {
    const set = new Set<number>();
    for (let e = 0; 10 ** e <= top; e++) for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9]) if (k * 10 ** e <= top) set.add(k * 10 ** e);
    ms = [...set].sort((a, b) => a - b);
  }
  const tau: number[] = [];
  const adev: number[] = [];
  const terms: number[] = [];
  for (const m of ms) {
    const K = N + 1 - 2 * m;
    if (K < 1) break;
    let s = 0;
    for (let i = 0; i < K; i++) s += (x[i + 2 * m] - 2 * x[i + m] + x[i]) ** 2;
    const t = m * tau0;
    tau.push(t);
    adev.push(Math.sqrt(s / (2 * t * t * K)));
    terms.push(K);
  }
  return { tau, adev, terms };
}

// ---- continuous wavelet transform (Morlet, ω0) by FFTs (Torrence & Compo) ----
export function cwtMorlet(x: number[], dt: number, scales: number[], w0 = 6): { power: number[][]; freq: number[] } {
  const n0 = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / (n0 || 1);
  let n = 1;
  while (n < 2 * n0) n <<= 1;
  const re = [...x.map((v) => v - mean), ...new Array<number>(n - n0).fill(0)];
  const [R, I] = fft(re, new Array<number>(n).fill(0));
  const omega = Array.from({ length: n }, (_, k) => ((k <= n / 2 ? k : k - n) * 2 * Math.PI) / (n * dt));
  const norm = Math.PI ** -0.25;
  const power = scales.map((s) => {
    const f = Math.sqrt((2 * Math.PI * s) / dt);
    const hr: number[] = [];
    const hi: number[] = [];
    for (let k = 0; k < n; k++) {
      const psi = omega[k] > 0 ? f * norm * Math.exp(-((s * omega[k] - w0) ** 2) / 2) : 0;
      hr.push(R[k] * psi);
      hi.push(I[k] * psi);
    }
    const [wr, wi] = fft(hr, hi, true);
    return Array.from({ length: n0 }, (_, i) => wr[i] * wr[i] + wi[i] * wi[i]);
  });
  // the Fourier frequency of every scale
  const freq = scales.map((s) => (w0 + Math.sqrt(2 + w0 * w0)) / (4 * Math.PI * s));
  return { power, freq };
}
