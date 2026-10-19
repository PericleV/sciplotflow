// Peak analyzer: a baseline, the peaks found (or placed), measured on the data, or fitted together as a
// sum — every peak of its own shape — to separate the ones that overlap (peak deconvolution).
import { voigtFwhm, voigtProfile, voigtSG } from './faddeeva.ts';
import { baselineOf, curveThrough, type BaseMethod, type BaseOptions } from './baselines.ts';
import { pointsCurve, type Pt } from './calculus.ts';
import { peakAt, pvArea, type Baseline, type PeakShape } from './fitModels.ts';
import { maxOf, minOf } from './minmax.ts';

// fitted with the peaks: constant, linear, quadratic; fixed (not fitted, under the peaks): none, the line between the
// ends, another column, and the other common ones (src/engine/baselines.ts)
export type BaseKind = 'none' | 'constant' | 'linear' | 'quadratic' | 'ends' | 'column' | Exclude<BaseMethod, 'zero' | 'line' | 'curve'>;
export const FITTED_BASES: BaseKind[] = ['constant', 'linear', 'quadratic'];
export const isFitted = (b: BaseKind): b is Baseline => FITTED_BASES.includes(b);

// a peak of the list: its shape and where it is (the start of the fit); a doublet (spin–orbit): a second peak of the
// same shape and width at x + dx, its area `ratio` of this one's — linked to it in the fit
// from, to: a region drawn on the graph — the peak is at the maximum (or the minimum: at) of the data over the baseline in
// it, and its centre stays in it in the fit; without: at x
export type PeakItem = { shape: PeakShape; x: number; doublet?: { dx: number; ratio: number }; from?: number; to?: number; at?: 'max' | 'min' };
// the settings a Run of the Peak analyzer was made with (a key: the same settings, the same key — whatever their order)
export function peakRunKey(d: object): string {
  const skip = new Set(['showResid', 'ran', 'needRun']);
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(norm(Object.fromEntries(Object.entries(d).filter(([k]) => !skip.has(k)))));
}
// the place of a peak in its region: the largest (or the most negative) of z there, refined by a parabola; NaN: no point
export function regionPeak(X: number[], z: number[], from: number, to: number, at: 'max' | 'min'): number {
  const [a, b] = from <= to ? [from, to] : [to, from];
  let best = -1;
  for (let i = 0; i < X.length; i++) if (X[i] >= a && X[i] <= b && (best < 0 || (at === 'max' ? z[i] > z[best] : z[i] < z[best]))) best = i;
  if (best < 0) return NaN;
  if (best > 0 && best < X.length - 1 && X[best - 1] >= a && X[best + 1] <= b) {
    const [x0, x1, x2] = [X[best - 1], X[best], X[best + 1]];
    const [y0, y1, y2] = [z[best - 1], z[best], z[best + 1]];
    const den = (x0 - x1) * (x0 - x2) * (x1 - x2);
    const A = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / den;
    const B = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / den;
    const v = -B / (2 * A);
    if (Number.isFinite(v) && v >= x0 && v <= x2) return v;
  }
  return X[best];
}
export type FindOptions = { sign: 'peaks' | 'dips' | 'both'; count: number; minHeight: number; shoulders: boolean };
export type Found = { x: number; height: number; w: number; i: number };

// ---- the baseline (fixed kinds), on the points of a run in the order of X ----
// the common method of a kind (none: y = 0, ends: the line, column: another curve)
export const baseMethodOf = (kind: BaseKind): BaseMethod => (kind === 'none' || isFitted(kind) ? 'zero' : kind === 'ends' ? 'line' : kind === 'column' ? 'curve' : kind);
export const baseKindOf = (m: BaseMethod): BaseKind => (m === 'zero' ? 'none' : m === 'line' ? 'ends' : m === 'curve' ? 'column' : m);
export function fixedBaseline(kind: BaseKind, X: number[], Y: number[], o: { points?: Pt[]; interp?: 'linear' | 'spline'; curve?: { x: ArrayLike<number>; y: ArrayLike<number> }; opts?: BaseOptions; value?: number }): number[] {
  if (!X.length) return [];
  const m = baseMethodOf(kind);
  let f: ((x: number) => number) | null = null;
  if (m === 'points') f = pointsCurve(o.points ?? [], o.interp ?? 'linear');
  else if (m === 'curve' && o.curve) {
    const c = o.curve;
    const idx = Array.from({ length: c.x.length }, (_, i) => i).filter((i) => Number.isFinite(c.x[i]) && Number.isFinite(c.y[i]));
    idx.sort((a, b) => c.x[a] - c.x[b]);
    f = curveThrough(idx.map((i) => c.x[i]), idx.map((i) => c.y[i]));
  }
  return baselineOf(m, X, Y, o.opts, { value: o.value, curve: f });
}

// a light moving average (odd window), for finding the peaks in noisy data
function smooth(z: number[], half: number): number[] {
  if (half < 1) return z;
  return z.map((_, i) => {
    let [s, m] = [0, 0];
    for (let j = Math.max(0, i - half); j <= Math.min(z.length - 1, i + half); j++) [s, m] = [s + z[j], m + 1];
    return s / m;
  });
}

// The full width at half height of z (above 0) around i, from the crossings found between the points.
export function fwhmAt(X: number[], z: number[], i: number): number {
  const h = z[i] / 2;
  if (!(Math.abs(h) > 0)) return NaN;
  const s = Math.sign(z[i]);
  let a = i;
  while (a > 0 && s * z[a] > s * h) a--;
  let b = i;
  while (b < z.length - 1 && s * z[b] > s * h) b++;
  const cross = (p: number, q: number) => (z[q] === z[p] ? X[p] : X[p] + ((h - z[p]) * (X[q] - X[p])) / (z[q] - z[p]));
  const xl = a < i && s * z[a] <= s * h ? cross(a, a + 1) : X[a];
  const xr = b > i && s * z[b] <= s * h ? cross(b - 1, b) : X[b];
  return Math.abs(xr - xl);
}

// The peaks of z (the data over its baseline, X ascending): local maxima (dips: minima) by their prominence — both
// their height and their prominence at least minHeight % of the largest —; with shoulders, also the minima of the second derivative (a peak hidden in the side of
// another). The `count` most prominent, from left to right.
export function findPeaksIn(X: number[], z: number[], o: FindOptions): Found[] {
  const n = X.length;
  if (n < 3) return [];
  const half = Math.max(1, Math.round(n / 150));
  const signs = o.sign === 'peaks' ? [1] : o.sign === 'dips' ? [-1] : [1, -1];
  const out: (Found & { prom: number })[] = [];
  const top = maxOf(z.map(Math.abs)) || 1;
  for (const sg of signs) {
    const s = smooth(z.map((v) => sg * v), half);
    const maxima: (Found & { prom: number })[] = [];
    for (let i = 1; i < n - 1; i++) {
      if (!(s[i] >= s[i - 1] && s[i] > s[i + 1] && s[i] > 0) || s[i] < (o.minHeight / 100) * top) continue;
      // prominence: above the higher of the lowest points on either side before a higher point
      let [l, lm] = [i, s[i]];
      while (l > 0 && s[l - 1] <= s[i]) lm = Math.min(lm, s[--l]);
      let [r, rm] = [i, s[i]];
      while (r < n - 1 && s[r + 1] <= s[i]) rm = Math.min(rm, s[++r]);
      const prom = s[i] - Math.max(lm, rm);
      // a bump of the noise on the side of a peak: high, but not standing out
      if (prom < (Math.max(o.minHeight, 1) / 100) * top) continue;
      maxima.push({ x: X[i], height: sg * s[i], w: fwhmAt(X, s, i), i, prom });
    }
    out.push(...maxima);
    if (o.shoulders) {
      // the minima of the (more smoothed) second derivative, deep enough, away from the maxima and from each other
      const ss = smooth(s, Math.max(2, Math.round(n / 80)));
      const d2 = ss.map((_, i) => (i === 0 || i === n - 1 ? 0 : (ss[i + 1] - 2 * ss[i] + ss[i - 1]) / Math.max(1e-300, ((X[i + 1] - X[i - 1]) / 2) ** 2)));
      const deep = Math.max(0, maxOf(d2.map((v) => -v)));
      const sh: (Found & { prom: number })[] = [];
      for (let i = 2; i < n - 2; i++) {
        if (!(d2[i] < -0.1 * deep && d2[i] <= d2[i - 1] && d2[i] < d2[i + 1] && s[i] >= (o.minHeight / 100) * top)) continue;
        const w = fwhmAt(X, s, i);
        const near = (f: Found) => Math.abs(f.x - X[i]) < Math.max((f.w || 0) / 2, ((X[n - 1] - X[0]) / n) * 3);
        if (maxima.some(near) || sh.some(near)) continue;
        sh.push({ x: X[i], height: sg * s[i], w, i, prom: (s[i] * -d2[i]) / (deep || 1) });
      }
      out.push(...sh);
    }
  }
  return out
    .sort((a, b) => b.prom - a.prom)
    .slice(0, Math.max(1, Math.floor(o.count) || 1))
    .sort((a, b) => a.x - b.x)
    .map(({ prom: _p, ...f }) => f);
}

// A peak measured on the data (no fit): between the places where it meets its baseline or the valley next to another
// peak; its height, FWHM, area, centroid.
export type Measured = { x: number; height: number; fwhm: number; area: number; centroid: number; from: number; to: number };
export function measurePeaks(X: number[], z: number[], at: number[]): Measured[] {
  const idx = at.map((x) => X.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(X[b] - x) ? i : b), 0));
  return idx.map((i, k) => {
    const s = Math.sign(z[i]) || 1;
    const lo = k > 0 ? idx[k - 1] : 0;
    const hi = k < idx.length - 1 ? idx[k + 1] : X.length - 1;
    // the limits: back to the baseline, or the lowest point before the next peak
    let a = i;
    while (a > lo && s * z[a - 1] > 0 && !(s * z[a - 1] > s * z[a] && a < i)) a--;
    let b = i;
    while (b < hi && s * z[b + 1] > 0 && !(s * z[b + 1] > s * z[b] && b > i)) b++;
    let [area, mx] = [0, 0];
    for (let j = a; j < b; j++) {
      const d = X[j + 1] - X[j];
      area += ((z[j] + z[j + 1]) / 2) * d;
      mx += ((X[j] * z[j] + X[j + 1] * z[j + 1]) / 2) * d;
    }
    return { x: X[i], height: z[i], fwhm: fwhmAt(X, z, i), area, centroid: area ? mx / area : NaN, from: X[a], to: X[b] };
  });
}

// A fitted peak measured: its top (value and place), FWHM and area — the area of a Gaussian, Lorentzian, pseudo-Voigt,
// Voigt from its formula (the whole peak), of a Fano and a Doniach–Šunjić (its tail never ends) over the X given.
export function fittedPeak(shape: PeakShape, p: number[], o: number, X: number[]): { x: number; height: number; fwhm: number; area: number } {
  const [A, xc, w] = [p[o], p[o + 1], Math.abs(p[o + 2])];
  // μ: the Lorentzian part of the area (1 a Lorentzian, 0 a Gaussian)
  if (shape === 'voigtx') {
    const [s, g] = voigtSG(w, p[o + 3]);
    return { x: xc, height: A, fwhm: voigtFwhm(w, p[o + 3]), area: A / voigtProfile(0, s, g) };
  }
  if (shape !== 'fano' && shape !== 'ds') return { x: xc, height: A, fwhm: w, area: pvArea(A, w, shape === 'voigt' ? p[o + 3] : shape === 'lorentz' ? 1 : 0) };
  // a Fano: on a fine grid over the data
  const [x0, x1] = [minOf(X), maxOf(X)];
  const m = 4000;
  const gx = Array.from({ length: m }, (_, k) => x0 + ((x1 - x0) * k) / (m - 1));
  const gz = gx.map((x) => peakAt(shape, x, p, o));
  let k = 0;
  for (let j = 1; j < m; j++) if (Math.abs(gz[j]) > Math.abs(gz[k])) k = j;
  let area = 0;
  for (let j = 0; j < m - 1; j++) area += ((gz[j] + gz[j + 1]) / 2) * (gx[j + 1] - gx[j]);
  return { x: gx[k], height: gz[k], fwhm: fwhmAt(gx, gz, k), area };
}
