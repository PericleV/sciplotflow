// The wavelet methods of the Wavelet node. The continuous transform as Torrence and Compo (1998) (Morlet, Paul, DOG;
// the scales s0·2^(j·dj), the cone of influence, the significance against red noise, the global and scale-averaged
// spectra) and the wavelet coherence of two signals as Grinsted, Moore and Jevrejeva (2004) — both as pycwt. The
// maximal overlap discrete transform (MODWT, Percival and Walden 2000) and its multiresolution analysis (as
// PyWavelets' mra with the stationary transform). Denoising by the discrete transform with the universal, SURE and
// Bayes thresholds. The peaks found along the ridges of a Ricker transform (as SciPy's find_peaks_cwt). Pure.
import { fft } from './signal.ts';
import { lgamma } from './dist.ts';
import { chi2Quantile } from './stat3.ts';
import { dwt, highPass, idwt } from './wavelet.ts';
import { WAVELET_FILTERS } from './waveletFilters.ts';

// ---- the mother wavelets ----
export type MotherKind = 'morlet' | 'paul' | 'dog';
export type Mother = { kind: MotherKind; param: number; psiFt: (f: number) => [number, number]; flambda: number; coi: number; dofmin: number; cdelta: number; gamma: number; deltaj0: number };
export function mother(kind: MotherKind, param?: number): Mother {
  if (kind === 'paul') {
    const m = param ?? 4;
    let fact = 1;
    for (let k = 2; k < 2 * m; k++) fact *= k;
    const c = 2 ** m / Math.sqrt(m * fact);
    return { kind, param: m, psiFt: (f) => [f > 0 ? c * f ** m * Math.exp(-f) : 0, 0], flambda: (4 * Math.PI) / (2 * m + 1), coi: Math.SQRT2, dofmin: 2, cdelta: m === 4 ? 1.132 : NaN, gamma: m === 4 ? 1.17 : NaN, deltaj0: m === 4 ? 1.5 : NaN };
  }
  if (kind === 'dog') {
    const m = param ?? 2;
    // −i^m / √Γ(m + ½) · f^m e^(−f²/2)
    const g = 1 / Math.sqrt(Math.exp(lgamma(m + 0.5)));
    const ip = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ][m % 4];
    return { kind, param: m, psiFt: (f) => [-ip[0] * g * f ** m * Math.exp(-0.5 * f * f), -ip[1] * g * f ** m * Math.exp(-0.5 * f * f)], flambda: (2 * Math.PI) / Math.sqrt(m + 0.5), coi: Math.SQRT1_2, dofmin: 1, cdelta: m === 2 ? 3.541 : m === 6 ? 1.966 : NaN, gamma: m === 2 ? 1.43 : m === 6 ? 1.37 : NaN, deltaj0: m === 2 ? 1.4 : m === 6 ? 0.97 : NaN };
  }
  const w0 = param ?? 6;
  return { kind: 'morlet', param: w0, psiFt: (f) => [Math.PI ** -0.25 * Math.exp(-0.5 * (f - w0) ** 2), 0], flambda: (4 * Math.PI) / (w0 + Math.sqrt(2 + w0 * w0)), coi: Math.SQRT1_2, dofmin: 2, cdelta: w0 === 6 ? 0.776 : NaN, gamma: w0 === 6 ? 2.32 : NaN, deltaj0: w0 === 6 ? 0.6 : NaN };
}
const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// ---- the continuous transform ----
export type CWT = { re: Float64Array[]; im: Float64Array[]; scales: number[]; periods: number[]; coi: number[] };
// W(s, t) of x (sampled every dt) at the scales s0·2^(j·dj), j = 0 … J (s0 NaN: 2·dt / λ; J NaN: log2(n·dt/s0)/dj), the
// signal padded with zeros to a power of 2 (as pycwt); the cone of influence in periods at every t
export function cwt(x: number[], dt: number, dj: number, s0: number, J: number, mo: Mother): CWT {
  const n0 = x.length;
  const S0 = Number.isFinite(s0) && s0 > 0 ? s0 : (2 * dt) / mo.flambda;
  const JJ = Number.isFinite(J) && J >= 0 ? Math.round(J) : Math.round(Math.log2((n0 * dt) / S0) / dj);
  const scales = Array.from({ length: JJ + 1 }, (_, j) => S0 * 2 ** (j * dj));
  const N = nextPow2(n0);
  const [Xr, Xi] = fft([...x, ...new Array<number>(N - n0).fill(0)], new Array<number>(N).fill(0));
  const w = Array.from({ length: N }, (_, k) => ((2 * Math.PI) / (N * dt)) * (k < N / 2 ? k : k - N));
  const w1 = (2 * Math.PI) / (N * dt);
  const re: Float64Array[] = [];
  const im: Float64Array[] = [];
  for (const s of scales) {
    const norm = Math.sqrt(s * w1 * N);
    const pr = new Array<number>(N);
    const pi = new Array<number>(N);
    for (let k = 0; k < N; k++) {
      // (X · conj(ψ̂(sω)) · √(s ω₁ N))
      const [a, b] = mo.psiFt(s * w[k]);
      const [cr, ci] = [norm * a, -norm * b];
      pr[k] = Xr[k] * cr - Xi[k] * ci;
      pi[k] = Xr[k] * ci + Xi[k] * cr;
    }
    const [r, i] = fft(pr, pi, true);
    re.push(Float64Array.from(r.slice(0, n0)));
    im.push(Float64Array.from(i.slice(0, n0)));
  }
  const coi = Array.from({ length: n0 }, (_, t) => mo.flambda * mo.coi * dt * (n0 / 2 - Math.abs(t - (n0 - 1) / 2)));
  return { re, im, scales, periods: scales.map((s) => mo.flambda * s), coi };
}
// the lag-1 autocorrelation (of the deviations from the mean)
export function lag1(x: number[]): number {
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  let [c0, c1] = [0, 0];
  for (let i = 0; i < x.length; i++) {
    c0 += (x[i] - m) ** 2;
    if (i) c1 += (x[i] - m) * (x[i - 1] - m);
  }
  return c1 / c0;
}
// The power that is significant at `level` against red noise of lag-1 autocorrelation alpha and variance `variance`
// (Torrence and Compo 1998): of the power at every scale (test 0) or of its mean over n0 times, the global spectrum
// (test 1, the degrees of freedom of the time average)
export function cwtSignificance(variance: number, dt: number, scales: number[], test: 0 | 1, alpha: number, level: number, mo: Mother, n0: number): number[] {
  return scales.map((s) => {
    const f = dt / (mo.flambda * s);
    const theor = (variance * (1 - alpha * alpha)) / (1 + alpha * alpha - 2 * alpha * Math.cos(2 * Math.PI * f));
    let dof = mo.dofmin;
    if (test === 1) dof = Math.max(mo.dofmin, mo.dofmin * Math.sqrt(1 + ((n0 * dt) / mo.gamma / s) ** 2));
    return (theor * chi2Quantile(level, dof)) / dof;
  });
}
// the scale-averaged power over the scales from p1 to p2 (in periods), at every time: dj·dt / Cδ · Σ |W|² / s
export function scaleAverage(c: CWT, dj: number, dt: number, mo: Mother, p1: number, p2: number): number[] {
  const n = c.re[0]?.length ?? 0;
  const out = new Array<number>(n).fill(0);
  c.scales.forEach((s, j) => {
    if (c.periods[j] < p1 || c.periods[j] > p2) return;
    for (let t = 0; t < n; t++) out[t] += (c.re[j][t] ** 2 + c.im[j][t] ** 2) / s;
  });
  return out.map((v) => (v * dj * dt) / mo.cdelta);
}

// ---- the coherence (Morlet) ----
// the smoothing of Torrence and Webster (1999), Grinsted et al. (2004), as pycwt: in time a Gaussian of the scale (its
// transform exp(−½ (s/dt)² k²), the row padded to a power of 2), in scale a boxcar 2·δj₀/dj wide (its ends halves)
function smooth(re: Float64Array[], im: Float64Array[], dt: number, dj: number, scales: number[], mo: Mother): { re: number[][]; im: number[][] } {
  const n = re[0].length;
  const N = nextPow2(n);
  const k = Array.from({ length: N }, (_, q) => ((2 * Math.PI) / N) * (q < N / 2 ? q : q - N));
  const Tr: number[][] = [];
  const Ti: number[][] = [];
  scales.forEach((s, j) => {
    const [a, b] = fft([...re[j], ...new Array<number>(N - n).fill(0)], [...im[j], ...new Array<number>(N - n).fill(0)]);
    const sn = s / dt;
    const F = k.map((v) => Math.exp(-0.5 * sn * sn * v * v));
    const [r, i] = fft(
      a.map((v, q) => v * F[q]),
      b.map((v, q) => v * F[q]),
      true,
    );
    Tr.push(r.slice(0, n));
    Ti.push(i.slice(0, n));
  });
  const L = Math.round((mo.deltaj0 / dj) * 2);
  const win = Array.from({ length: L }, (_, q) => (q === 0 || q === L - 1 ? 0.5 : 1));
  const ws = win.reduce((a, b) => a + b, 0);
  const off = (L - 1) >> 1;
  const conv = (T: number[][]) =>
    T.map((_, j) => {
      const row = new Array<number>(n).fill(0);
      for (let q = 0; q < L; q++) {
        const src = j + off - q;
        if (src < 0 || src >= T.length) continue;
        for (let t = 0; t < n; t++) row[t] += (win[q] / ws) * T[src][t];
      }
      return row;
    });
  return { re: conv(Tr), im: conv(Ti) };
}
// The wavelet coherence of two signals (each from its mean, by its SD) and the phase of their cross-wavelet transform
export function coherence(x: number[], y: number[], dt: number, dj: number, s0: number, J: number): { wct: number[][]; phase: number[][]; c: CWT } {
  const mo = mother('morlet', 6);
  const z = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    return v.map((q) => (q - m) / sd);
  };
  const A = cwt(z(x), dt, dj, s0, J, mo);
  const B = cwt(z(y), dt, dj, s0, J, mo);
  const n = x.length;
  const p1 = A.re.map((r, j) => Float64Array.from(r, (v, t) => (v * v + A.im[j][t] ** 2) / A.scales[j]));
  const p2 = B.re.map((r, j) => Float64Array.from(r, (v, t) => (v * v + B.im[j][t] ** 2) / A.scales[j]));
  const zero = A.re.map(() => new Float64Array(n));
  // (W12 = W1 · conj W2)
  const cr = A.re.map((r, j) => Float64Array.from(r, (v, t) => v * B.re[j][t] + A.im[j][t] * B.im[j][t]));
  const ci = A.re.map((r, j) => Float64Array.from(r, (v, t) => A.im[j][t] * B.re[j][t] - v * B.im[j][t]));
  const S1 = smooth(p1, zero, dt, dj, A.scales, mo).re;
  const S2 = smooth(p2, zero, dt, dj, A.scales, mo).re;
  const S12 = smooth(
    cr.map((r, j) => r.map((v) => v / A.scales[j])),
    ci.map((r, j) => r.map((v) => v / A.scales[j])),
    dt,
    dj,
    A.scales,
    mo,
  );
  const wct = A.scales.map((_, j) => Array.from({ length: n }, (_, t) => (S12.re[j][t] ** 2 + S12.im[j][t] ** 2) / (S1[j][t] * S2[j][t])));
  const phase = A.scales.map((_, j) => Array.from({ length: n }, (_, t) => Math.atan2(ci[j][t], cr[j][t])));
  return { wct, phase, c: A };
}

// ---- the maximal overlap discrete transform ----
export const filterOf = (name: string) => WAVELET_FILTERS[name]?.h ?? WAVELET_FILTERS.db4.h;
// MODWT: at level j the wavelet and scaling coefficients W_j, V_j (the filters / √2, spread by 2^(j−1), circular)
export function modwt(x: number[], name: string, J: number): { W: number[][]; V: number[] } {
  const h = filterOf(name).map((v) => v / Math.SQRT2);
  const g = highPass(filterOf(name)).map((v) => v / Math.SQRT2);
  const N = x.length;
  const L = h.length;
  let V = x.slice();
  const W: number[][] = [];
  for (let j = 1; j <= J; j++) {
    const d = 2 ** (j - 1);
    const w = new Array<number>(N).fill(0);
    const v = new Array<number>(N).fill(0);
    for (let t = 0; t < N; t++)
      for (let l = 0; l < L; l++) {
        const q = V[(((t - d * l) % N) + N) % N];
        w[t] += g[l] * q;
        v[t] += h[l] * q;
      }
    W.push(w);
    V = v;
  }
  return { W, V };
}
// back from level J to the signal (the adjoint of every level)
function imodwt(W: number[][], V: number[], name: string): number[] {
  const h = filterOf(name).map((v) => v / Math.SQRT2);
  const g = highPass(filterOf(name)).map((v) => v / Math.SQRT2);
  const N = V.length;
  const L = h.length;
  let cur = V.slice();
  for (let j = W.length; j >= 1; j--) {
    const d = 2 ** (j - 1);
    const prev = new Array<number>(N).fill(0);
    for (let t = 0; t < N; t++)
      for (let l = 0; l < L; l++) {
        const q = (((t + d * l) % N) + N) % N;
        prev[t] += g[l] * W[j - 1][q] + h[l] * cur[q];
      }
    cur = prev;
  }
  return cur;
}
// The multiresolution analysis: the details D1 … DJ and the smooth SJ, every one a signal, adding up to x
export function mra(x: number[], name: string, J: number): { D: number[][]; S: number[] } {
  const { W, V } = modwt(x, name, J);
  const N = x.length;
  const zero = () => new Array<number>(N).fill(0);
  const D = W.map((_, j) => imodwt(W.map((w, q) => (q === j ? w : zero())), zero(), name));
  const S = imodwt(
    W.map(() => zero()),
    V,
    name,
  );
  return { D, S };
}

// ---- denoising ----
export type Threshold = 'universal' | 'sure' | 'bayes';
const medianOf = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// the SURE threshold of coefficients d of noise 1 (Donoho and Johnstone 1995), the universal one when they are sparse
export function sureThreshold(d: number[]): number {
  const n = d.length;
  const univ = Math.sqrt(2 * Math.log(n));
  const s2 = d.reduce((a, v) => a + v * v - 1, 0) / n;
  if (s2 <= Math.log2(n) ** 1.5 / Math.sqrt(n)) return univ;
  const a = d.map((v) => v * v).sort((p, q) => p - q);
  let best = Infinity;
  let t = univ;
  let cum = 0;
  for (let k = 0; k < n; k++) {
    cum += a[k];
    const risk = n - 2 * (k + 1) + cum + (n - k - 1) * a[k];
    if (risk < best) [best, t] = [risk, Math.sqrt(a[k])];
  }
  return Math.min(t, univ);
}
// The details of the discrete transform (periodized; the signal extended symmetrically to a multiple of 2^level)
// thresholded, soft or hard: universal (σ√(2 ln n)), SURE or Bayes (σ² / σx at every level); σ from the finest details
// or of every level; the denoised signal and the thresholds of the levels (the finest last)
export function denoise(y: number[], name: string, level: number, rule: Threshold, mode: 'soft' | 'hard', perLevel: boolean): { y: number[]; thresholds: number[]; sigma: number[] } {
  const n = y.length;
  const maxLevel = Math.max(1, Math.floor(Math.log2(Math.max(2, n))) - 1);
  const lv = Math.max(1, Math.min(Math.round(level), maxLevel));
  const block = 2 ** lv;
  const m = Math.ceil(n / block) * block;
  const ext = y.slice();
  for (let i = 0; ext.length < m; i++) ext.push(y[n - 1 - (i % n)]);
  const c = dwt(ext, name, lv);
  const mad = (d: number[]) => medianOf(d.map(Math.abs)) / 0.6745;
  const sFine = mad(c[c.length - 1]);
  const thresholds: number[] = [];
  const sigma: number[] = [];
  for (let l = 1; l < c.length; l++) {
    const d = c[l];
    const s = perLevel ? mad(d) : sFine;
    let t: number;
    if (rule === 'universal') t = s * Math.sqrt(2 * Math.log(m));
    else if (rule === 'sure') t = s > 0 ? s * sureThreshold(d.map((v) => v / s)) : 0;
    else {
      const sy2 = d.reduce((a, v) => a + v * v, 0) / d.length;
      const sx = Math.sqrt(Math.max(sy2 - s * s, 0));
      t = sx > 0 ? (s * s) / sx : Math.max(...d.map(Math.abs));
    }
    thresholds.push(t);
    sigma.push(s);
    // (hard: the values at the threshold or above kept, as PyWavelets)
    c[l] = d.map((v) => (mode === 'hard' ? (Math.abs(v) >= t ? v : 0) : Math.sign(v) * Math.max(0, Math.abs(v) - t)));
  }
  return { y: idwt(c, name).slice(0, n), thresholds, sigma };
}
// ---- peaks along the ridges of a Ricker transform (SciPy's find_peaks_cwt) ----
function ricker(points: number, a: number): number[] {
  const A = 2 / (Math.sqrt(3 * a) * Math.PI ** 0.25);
  const n = Math.ceil(points);
  return Array.from({ length: n }, (_, i) => {
    const v = i - (points - 1) / 2;
    return A * (1 - (v * v) / (a * a)) * Math.exp(-(v * v) / (2 * a * a));
  });
}
export function rickerCwt(y: number[], widths: number[]): number[][] {
  const n = y.length;
  return widths.map((w) => {
    const k = ricker(Math.min(10 * w, n), w).reverse();
    const L = k.length;
    const off = (L - 1) >> 1;
    return Array.from({ length: n }, (_, i) => {
      let s = 0;
      for (let q = 0; q < L; q++) {
        const j = i + off - q;
        if (j >= 0 && j < n) s += k[q] * y[j];
      }
      return s;
    });
  });
}
const quantileLin = (a: number[], p: number) => {
  const s = [...a].sort((u, v) => u - v);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[Math.min(s.length - 1, lo + 1)] ?? s[lo]) - s[lo]);
};
export function peaksCwt(y: number[], widths: number[], o: { minSnr?: number; noisePerc?: number; minLength?: number; gap?: number; window?: number } = {}): { peaks: number[]; cwt: number[][] } {
  const M = rickerCwt(y, widths);
  const rows = M.length;
  const n = y.length;
  const maxDist = widths.map((w) => w / 4);
  const gap = o.gap ?? Math.ceil(widths[0]);
  // (the relative maxima of every row, the ends not)
  const isMax = M.map((r) => r.map((v, i) => i > 0 && i < n - 1 && v > r[i - 1] && v > r[i + 1]));
  const has = isMax.map((r) => r.some(Boolean));
  const start = has.lastIndexOf(true);
  if (start < 0) return { peaks: [], cwt: M };
  type Line = { rows: number[]; cols: number[]; gap: number };
  let lines: Line[] = [];
  isMax[start].forEach((v, c) => v && lines.push({ rows: [start], cols: [c], gap: 0 }));
  const done: Line[] = [];
  for (let row = start - 1; row >= 0; row--) {
    for (const l of lines) l.gap++;
    const prev = lines.map((l) => l.cols[l.cols.length - 1]);
    isMax[row].forEach((v, col) => {
      if (!v) return;
      let line: Line | null = null;
      if (prev.length) {
        let best = 0;
        for (let q = 1; q < prev.length; q++) if (Math.abs(col - prev[q]) < Math.abs(col - prev[best])) best = q;
        if (Math.abs(col - prev[best]) <= maxDist[row]) line = lines[best];
      }
      if (line) {
        line.cols.push(col);
        line.rows.push(row);
        line.gap = 0;
      } else lines.push({ rows: [row], cols: [col], gap: 0 });
    });
    for (let q = lines.length - 1; q >= 0; q--)
      if (lines[q].gap > gap) {
        done.push(lines[q]);
        lines.splice(q, 1);
      }
  }
  const all = [...done, ...lines].map((l) => {
    const o2 = l.rows.map((_, q) => q).sort((a, b) => l.rows[a] - l.rows[b]);
    return { rows: o2.map((q) => l.rows[q]), cols: o2.map((q) => l.cols[q]) };
  });
  const minLength = o.minLength ?? Math.ceil(rows / 4);
  const window = Math.floor(o.window ?? Math.ceil(n / 20));
  const hf = window >> 1;
  const odd = window % 2;
  const row0 = M[0];
  const noises = row0.map((_, i) => quantileLin(row0.slice(Math.max(i - hf, 0), Math.min(i + hf + odd, n)), (o.noisePerc ?? 10) / 100));
  const kept = all.filter((l) => l.rows.length >= minLength && Math.abs(M[l.rows[0]][l.cols[0]] / noises[l.cols[0]]) >= (o.minSnr ?? 1));
  return { peaks: kept.map((l) => l.cols[0]).sort((a, b) => a - b), cwt: M };
}
