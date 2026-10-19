// Histogram with its distribution curves: the bins (rules from the data — auto,
// Sturges, Scott, Freedman–Diaconis, √n, Rice — a count, a width from a start, or the edges given), every bin
// [a, b) but the last [a, b]; the heights as counts, %, probabilities or densities (of the values counted), cumulative or
// not; several columns overlapped, stacked or side by side. Fits on it: from the data (Normal: mean and SD with n − 1 as
// n − 1; two normals and the Cauchy / Lorentz by maximum likelihood; a Gaussian kernel density), or fitted to the bars
// (least squares: a Gaussian, two Gaussians, a Lorentzian, several Gaussians or Lorentzians together); each with its
// errors, χ² of the counts, AIC. Every fit can take only a range of x (one peak of several): the bars in it, or the
// values in it — a normal or a Cauchy then by the likelihood of the values cut to the range (its tails outside counted
// as missing, so the width is not too small) — its curve drawn over that range (or all the bins).
import { fitDist, makeDist, PARAM_NAMES, type ProbDist } from './probplot.ts';
import { fisherCov, paramSE } from './reliability.ts';
import { chi2Sf, normCdf } from './dist.ts';
import { runFits, type FitParamSpec } from './fit.ts';
import type { Model } from './fitModels.ts';
import { invert } from './lm.ts';
import { percentile } from './stats.ts';
import { column, type Column, type Dataset } from './table.ts';
import { curveStyle, PALETTE, withLook, type BarLook, type Curve, type Dash, type ElementLook } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type BinMode = 'auto' | 'sturges' | 'scott' | 'fd' | 'sqrt' | 'rice' | 'count' | 'width' | 'edges';
export type HistNorm = 'count' | 'percent' | 'probability' | 'density';
export type HistFitKind = 'normal' | 'binormal' | 'lorentz' | 'kernel' | 'gaussN' | 'lorentzN' | 'lognormal' | 'weibull' | 'exponential' | 'gamma';
// the distributions of positive values fitted by maximum likelihood (Probability plot's), over the bars
const DIST_FITS = new Set<HistFitKind>(['lognormal', 'weibull', 'exponential', 'gamma']);
// on: the range it takes (its number, from 0) — absent: as the histogram says (every range on its own with A fit per
// range, else all of them together; no range: all the data); drawAll: its curve over all the bins (else over its
// ranges). gaussN, lorentzN (fitted to the bars): peaks of them together, started at the positions written in starts
// (“1.2, 3.4”), else at the highest bars; parts: every peak drawn too.
export type HistFit = { kind: HistFitKind; method: 'data' | 'bars'; offset?: boolean; bandwidth?: 'scott' | 'silverman' | 'value'; bw?: number; color?: string; width?: number; dash?: Dash; on?: number; drawAll?: boolean; peaks?: number; starts?: string; parts?: boolean };
export type HistRange = { lo: number; hi: number };
export type HistSpec = {
  ys: string;
  // log: the bins equal on a log scale (positive values; the width in decades)
  bins: { mode: BinMode; count: number; width: number; start: number; edges: string; from: number; to: number; log?: boolean };
  norm: HistNorm;
  cumulative: boolean;
  multi: 'overlap' | 'stack' | 'side';
  look: 'bars' | 'step' | 'stepfilled';
  gap: number; // the part of a bin left empty between bars (0 … 0.9)
  opacity: number;
  edgeWidth: number; // pt
  edgeColor: string; // '' = the colour of the bars
  colors?: string[];
  looks?: (ElementLook | null)[]; // a look of its own for any column: edge, opacity, hatching, and the line of every fit
  barLook?: Partial<BarLook>; // hatching, the edge's line, rounded corners, gradient, shadow
  fits: HistFit[];
  // the fit ranges of x (dragged on the figure, as in Fit); rangeFits: every range fitted on its own
  ranges?: HistRange[];
  rangeFits?: boolean;
  weights?: string; // a column of weights: every value counted that many times ('' = once)
  marks?: { mean?: boolean; median?: boolean }; // a vertical line at the mean / the median of every column
  rug?: boolean; // every value a short tick along the bottom of the frame, in its column's colour
};

const SQ2PI = Math.sqrt(2 * Math.PI);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sdOf = (v: number[], ddof: number) => {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - ddof));
};

// ---- the bins ----
// the rules: a width from the data, then as many equal bins as cover min … max (or the range given)
export function binEdges(values: number[], b: HistSpec['bins']): number[] | string {
  // equal on a log scale: the bins of the logs, back
  if (b.log && b.mode !== 'edges') {
    const pos = values.filter((x) => Number.isFinite(x) && x > 0);
    if (!pos.length) return 'Bins on a log scale need values above 0.';
    const lg = (x: number) => (Number.isFinite(x) && x > 0 ? Math.log10(x) : NaN);
    const e = binEdges(pos.map(Math.log10), { ...b, log: false, from: lg(b.from), to: lg(b.to), start: lg(b.start) });
    return typeof e === 'string' ? e : e.map((x) => 10 ** x);
  }
  const v = values.filter(Number.isFinite);
  if (b.mode === 'edges') {
    const e = b.edges
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map(Number);
    if (e.length < 2 || e.some((x) => !Number.isFinite(x))) return 'Write the edges of the bins: two numbers at least (0, 1, 2.5, 5).';
    for (let k = 1; k < e.length; k++) if (!(e[k] > e[k - 1])) return 'The edges of the bins must increase.';
    return e;
  }
  if (!v.length) return 'No value to count.';
  let lo = Number.isFinite(b.from) ? b.from : minOf(v);
  let hi = Number.isFinite(b.to) ? b.to : maxOf(v);
  if (hi < lo) [lo, hi] = [hi, lo];
  if (lo === hi) [lo, hi] = [lo - 0.5, hi + 0.5];
  if (b.mode === 'width') {
    const w = b.width;
    if (!(w > 0)) return 'Write the width of the bins.';
    const start = Number.isFinite(b.start) ? b.start : lo;
    const k0 = Math.floor((lo - start) / w + 1e-9);
    const k1 = Math.ceil((hi - start) / w - 1e-9);
    if (k1 - k0 > 1e5) return 'Too many bins (more than 100 000).';
    return Array.from({ length: Math.max(1, k1 - k0) + 1 }, (_, k) => start + (k0 + k) * w);
  }
  let n: number;
  if (b.mode === 'count') n = Math.max(1, Math.floor(b.count) || 10);
  else {
    // the values in the range (those are kept for the estimators)
    const r = v.filter((x) => x >= lo && x <= hi);
    const N = r.length;
    const ptp = hi - lo;
    const s = [...r].sort((p, q) => p - q);
    const fd = 2 * (percentile(s, 0.75) - percentile(s, 0.25)) * N ** (-1 / 3);
    const sturges = ptp / (Math.log2(N) + 1);
    const width =
      b.mode === 'sqrt' ? ptp / Math.sqrt(N) : b.mode === 'sturges' ? sturges : b.mode === 'rice' ? ptp / (2 * N ** (1 / 3)) : b.mode === 'scott' ? (((24 * Math.sqrt(Math.PI)) / N) ** (1 / 3)) * sdOf(r, 0) : b.mode === 'fd' ? fd : fd > 0 ? Math.min(fd, sturges) : sturges;
    n = width > 0 ? Math.ceil(ptp / width) : 1;
  }
  if (n > 1e5) return 'Too many bins (more than 100 000).';
  return Array.from({ length: n + 1 }, (_, k) => (k === n ? hi : lo + ((hi - lo) * k) / n));
}

// the count of every bin: [a, b) but the last one [a, b]; the values outside left out
export function histCounts(values: number[], edges: number[], weights?: number[]): number[] {
  const n = edges.length - 1;
  const c = new Array<number>(n).fill(0);
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    // a value counted once, or its weight
    const w = weights ? weights[i] : 1;
    if (!Number.isFinite(x) || !Number.isFinite(w) || x < edges[0] || x > edges[n]) continue;
    if (x === edges[n]) {
      c[n - 1] += w;
      continue;
    }
    let a = 0;
    let b = n;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (x >= edges[m]) a = m;
      else b = m;
    }
    c[a] += w;
  }
  return c;
}

// ---- the distributions fitted from the data ----
export function normalFit(v: number[]) {
  const n = v.length;
  const mu = mean(v);
  const sd = sdOf(v, 1);
  return { mu, sd, seMu: sd / Math.sqrt(n), seSd: sd / Math.sqrt(2 * (n - 1)), loglik: v.reduce((a, x) => a - Math.log(sd * SQ2PI) - (x - mu) ** 2 / (2 * sd * sd), 0) };
}
// Cauchy (Lorentz) by maximum likelihood: Newton's steps (halved while the likelihood does not grow); errors from the
// observed information
export function cauchyFit(v: number[]) {
  const n = v.length;
  const s = [...v].sort((a, b) => a - b);
  let x0 = percentile(s, 0.5);
  let g = Math.max(1e-12, (percentile(s, 0.75) - percentile(s, 0.25)) / 2);
  const ll = (a: number, b: number) => v.reduce((t, x) => t + Math.log(b) - Math.log(b * b + (x - a) ** 2), 0) - n * Math.log(Math.PI);
  const parts = (a: number, b: number) => {
    let [ga, gb, haa, hbb, hab] = [0, n / b, 0, -n / (b * b), 0];
    for (const x of v) {
      const d = x - a;
      const q = b * b + d * d;
      ga += (2 * d) / q;
      gb -= (2 * b) / q;
      haa += (2 * (d * d - b * b)) / (q * q);
      hbb -= (2 * (d * d - b * b)) / (q * q);
      hab -= (4 * b * d) / (q * q);
    }
    return { ga, gb, haa, hbb, hab };
  };
  let cur = ll(x0, g);
  for (let it = 0; it < 200; it++) {
    const { ga, gb, haa, hbb, hab } = parts(x0, g);
    const det = haa * hbb - hab * hab;
    // Newton when the Hessian is negative definite, else a gradient step
    let [da, db] = det > 0 && haa < 0 ? [-(hbb * ga - hab * gb) / det, -(haa * gb - hab * ga) / det] : [ga * g * g * 1e-2, gb * g * g * 1e-2];
    let t = 1;
    let next = -Infinity;
    for (; t > 1e-12; t /= 2) {
      const [a, b] = [x0 + t * da, g + t * db];
      if (b > 0 && (next = ll(a, b)) >= cur) break;
    }
    if (t <= 1e-12) break;
    const step = Math.abs(t * da) + Math.abs(t * db);
    [x0, g] = [x0 + t * da, g + t * db];
    const gain = next - cur;
    cur = next;
    if (gain < 1e-14 * Math.abs(cur) && step < 1e-12 * (Math.abs(x0) + g)) break;
  }
  const { haa, hbb, hab } = parts(x0, g);
  const cov = invert([
    [-haa, -hab],
    [-hab, -hbb],
  ]);
  return { x0, g, seX0: cov ? Math.sqrt(cov[0][0]) : NaN, seG: cov ? Math.sqrt(cov[1][1]) : NaN, loglik: cur };
}
// two normals by maximum likelihood (EM, started from the halves of the sorted values); sorted by the mean; errors from
// the observed information (numerical) of (w₁, μ₁, σ₁, μ₂, σ₂)
export function mixtureFit(v: number[]) {
  const n = v.length;
  const s = [...v].sort((a, b) => a - b);
  const h = Math.floor(n / 2);
  let [w1, m1, s1, m2, s2] = [0.5, mean(s.slice(0, h)), sdOf(s.slice(0, h), 0) || 1, mean(s.slice(h)), sdOf(s.slice(h), 0) || 1];
  const pdf = (x: number, m: number, sd: number) => Math.exp(-((x - m) ** 2) / (2 * sd * sd)) / (sd * SQ2PI);
  const ll = (p: number[]) => v.reduce((t, x) => t + Math.log(p[0] * pdf(x, p[1], p[2]) + (1 - p[0]) * pdf(x, p[3], p[4])), 0);
  let prev = -Infinity;
  for (let it = 0; it < 50000; it++) {
    let [r1s, r1x, r1xx, r2s, r2x, r2xx] = [0, 0, 0, 0, 0, 0];
    let cur = 0;
    for (const x of v) {
      const a = w1 * pdf(x, m1, s1);
      const b = (1 - w1) * pdf(x, m2, s2);
      const t = a + b;
      cur += Math.log(t);
      const r = a / t;
      [r1s, r1x, r1xx] = [r1s + r, r1x + r * x, r1xx + r * x * x];
      [r2s, r2x, r2xx] = [r2s + 1 - r, r2x + (1 - r) * x, r2xx + (1 - r) * x * x];
    }
    w1 = r1s / n;
    m1 = r1x / r1s;
    m2 = r2x / r2s;
    s1 = Math.sqrt(Math.max(1e-300, r1xx / r1s - m1 * m1));
    s2 = Math.sqrt(Math.max(1e-300, r2xx / r2s - m2 * m2));
    if (Math.abs(cur - prev) < 1e-13 * Math.abs(cur)) break;
    prev = cur;
  }
  if (m1 > m2) [w1, m1, s1, m2, s2] = [1 - w1, m2, s2, m1, s1];
  const p = [w1, m1, s1, m2, s2];
  // the observed information: the Hessian of −log L by central differences
  const H = p.map(() => p.map(() => 0));
  const hs = p.map((q) => 1e-4 * Math.max(Math.abs(q), 1e-3));
  for (let i = 0; i < 5; i++)
    for (let j = i; j < 5; j++) {
      const at = (di: number, dj: number) => {
        const q = p.slice();
        q[i] += di * hs[i];
        q[j] += dj * hs[j];
        return -ll(q);
      };
      H[i][j] = H[j][i] = (at(1, 1) - at(1, -1) - at(-1, 1) + at(-1, -1)) / (4 * hs[i] * hs[j]);
    }
  const cov = invert(H);
  const se = p.map((_, i) => (cov && cov[i][i] > 0 ? Math.sqrt(cov[i][i]) : NaN));
  return { w1, m1, s1, w2: 1 - w1, m2, s2, se, loglik: ll(p) };
}
// The minimum of f (a few parameters) by the downhill simplex of Nelder and Mead, from x0 with first steps `step`.
function simplexMin(f: (p: number[]) => number, x0: number[], step: number[], iters = 4000): number[] {
  const F = (p: number[]) => {
    const v = f(p);
    return Number.isFinite(v) ? v : Infinity;
  };
  const n = x0.length;
  let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step[i] : v)))];
  let vals = pts.map(F);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
    pts = order.map((i) => pts[i]);
    vals = order.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) <= 1e-13 * (Math.abs(vals[0]) + 1e-300) && it > 20) break;
    const c = x0.map((_, j) => pts.slice(0, n).reduce((t, p) => t + p[j], 0) / n);
    const at = (t: number) => c.map((v, j) => v + t * (pts[n][j] - v));
    const r = at(-1);
    const fr = F(r);
    if (fr < vals[0]) {
      const e = at(-2);
      const fe = F(e);
      [pts[n], vals[n]] = fe < fr ? [e, fe] : [r, fr];
    } else if (fr < vals[n - 1]) [pts[n], vals[n]] = [r, fr];
    else {
      const k = at(fr < vals[n] ? -0.5 : 0.5);
      const fk = F(k);
      if (fk < Math.min(fr, vals[n])) [pts[n], vals[n]] = [k, fk];
      else {
        pts = pts.map((p) => p.map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])));
        vals = pts.map(F);
      }
    }
  }
  return pts[vals.indexOf(Math.min(...vals))];
}
// A normal or a Cauchy from values cut to ranges [a, b] (an end may be infinite): the likelihood of every value given
// that it fell in them; errors from the observed information. mass: the part of the distribution in the ranges.
export function truncatedFit(v: number[], ivs: [number, number][], kind: 'normal' | 'cauchy') {
  const n = v.length;
  const s = [...v].sort((p, q) => p - q);
  const cdf = (x: number, m: number, sc: number) => (x === -Infinity ? 0 : x === Infinity ? 1 : kind === 'normal' ? normCdf((x - m) / sc) : 0.5 + Math.atan((x - m) / sc) / Math.PI);
  const logpdf = (x: number, m: number, sc: number) => (kind === 'normal' ? -Math.log(sc * SQ2PI) - (x - m) ** 2 / (2 * sc * sc) : Math.log(sc / Math.PI) - Math.log(sc * sc + (x - m) ** 2));
  const massOf = (m: number, sc: number) => ivs.reduce((t, [a, b]) => t + cdf(b, m, sc) - cdf(a, m, sc), 0);
  const nll = (m: number, sc: number) => {
    if (!(sc > 0)) return Infinity;
    const mass = massOf(m, sc);
    if (!(mass > 0)) return Infinity;
    let t = n * Math.log(mass);
    for (const x of v) t -= logpdf(x, m, sc);
    return t;
  };
  const m0 = kind === 'normal' ? mean(v) : percentile(s, 0.5);
  const s0 = Math.max(1e-12, kind === 'normal' ? sdOf(v, 1) || 1 : (percentile(s, 0.75) - percentile(s, 0.25)) / 2 || 1);
  const [m, ls] = simplexMin((p) => nll(p[0], Math.exp(p[1])), [m0, Math.log(s0)], [s0 * 0.5, 0.3]);
  const sc = Math.exp(ls);
  // the observed information: the Hessian of −log L in (location, scale) by central differences
  const p = [m, sc];
  const hs = [1e-4 * Math.max(sc, 1e-12), 1e-4 * sc];
  const at = (i: number, j: number, di: number, dj: number) => {
    const q = p.slice();
    q[i] += di * hs[i];
    q[j] += dj * hs[j];
    return nll(q[0], q[1]);
  };
  const H = [0, 1].map((i) => [0, 1].map((j) => (at(i, j, 1, 1) - at(i, j, 1, -1) - at(i, j, -1, 1) + at(i, j, -1, -1)) / (4 * hs[i] * hs[j])));
  const cov = invert(H);
  return { loc: m, scale: sc, seLoc: cov && cov[0][0] > 0 ? Math.sqrt(cov[0][0]) : NaN, seScale: cov && cov[1][1] > 0 ? Math.sqrt(cov[1][1]) : NaN, loglik: -nll(m, sc), mass: massOf(m, sc) };
}

// the bandwidth of a Gaussian kernel density (Scott n^(−1/5), Silverman (3n/4)^(−1/5), times the SD with n − 1)
export const kdeWidth = (v: number[], rule: 'scott' | 'silverman') => sdOf(v, 1) * (rule === 'scott' ? v.length ** (-1 / 5) : ((3 * v.length) / 4) ** (-1 / 5));
export const kde = (v: number[], h: number) => (x: number) => v.reduce((t, xi) => t + Math.exp(-((x - xi) ** 2) / (2 * h * h)), 0) / (v.length * h * SQ2PI);

// ---- the models fitted to the bars ----
const gaussModel = (offset: boolean, two: boolean): Model => ({
  params: [
    { name: two ? 'A1' : 'A', kind: 'amp' },
    { name: two ? 'xc1' : 'xc', kind: 'x' },
    { name: two ? 'σ1' : 'σ', kind: 'width' },
    ...(two
      ? [
          { name: 'A2', kind: 'amp' as const },
          { name: 'xc2', kind: 'x' as const },
          { name: 'σ2', kind: 'width' as const },
        ]
      : []),
    { name: 'y0', kind: 'offset' },
  ],
  f: (x, p) => p[0] * Math.exp(-((x - p[1]) ** 2) / (2 * p[2] * p[2])) + (two ? p[3] * Math.exp(-((x - p[4]) ** 2) / (2 * p[5] * p[5])) : 0) + (offset ? p[two ? 6 : 3] : 0),
  guess: () => [],
  note: '',
});
// N Gaussians or Lorentzians together (A, xc, σ or γ of each), and an offset
const peaksModel = (shape: 'gauss' | 'lorentz', N: number, offset: boolean): Model => ({
  params: [
    ...Array.from({ length: N }, (_, i) => [
      { name: `A${i + 1}`, kind: 'amp' as const },
      { name: `xc${i + 1}`, kind: 'x' as const },
      { name: `${shape === 'gauss' ? 'σ' : 'γ'}${i + 1}`, kind: 'width' as const },
    ]).flat(),
    { name: 'y0', kind: 'offset' },
  ],
  f: (x, p) => {
    let t = offset ? p[3 * N] : 0;
    for (let i = 0; i < N; i++) t += shape === 'gauss' ? p[3 * i] * Math.exp(-((x - p[3 * i + 1]) ** 2) / (2 * p[3 * i + 2] * p[3 * i + 2])) : p[3 * i] / (1 + ((x - p[3 * i + 1]) / p[3 * i + 2]) ** 2);
    return t;
  },
  guess: () => [],
  note: '',
});
// where N peaks start: the positions written, else the highest bars that stand above their neighbours (then spread
// over the range)
export function peakStarts(xs: number[], ys: number[], N: number, written: string | undefined): number[] {
  const typed = (written ?? '')
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  if (typed.length >= N) return typed.slice(0, N);
  const tops = ys
    .map((y, i) => ({ x: xs[i], y, i }))
    .filter(({ y, i }) => y > 0 && (i === 0 || y >= ys[i - 1]) && (i === ys.length - 1 || y >= ys[i + 1]))
    .sort((p, q) => q.y - p.y);
  const out = [...typed];
  const minGap = xs.length > 1 ? 2 * Math.abs(xs[1] - xs[0]) : 0;
  for (const t of tops) if (out.length < N && out.every((x) => Math.abs(x - t.x) >= minGap)) out.push(t.x);
  const [lo, hi] = [minOf(xs), maxOf(xs)];
  for (let k = 0; out.length < N; k++) out.push(lo + ((hi - lo) * (k + 1)) / (N + 1));
  return out.sort((p, q) => p - q);
}
const lorentzModel = (offset: boolean): Model => ({
  params: [
    { name: 'A', kind: 'amp' },
    { name: 'xc', kind: 'x' },
    { name: 'γ', kind: 'width' },
    { name: 'y0', kind: 'offset' },
  ],
  f: (x, p) => p[0] / (1 + ((x - p[1]) / p[2]) ** 2) + (offset ? p[3] : 0),
  guess: () => [],
  note: '',
});

// ---- the whole histogram ----
export type HistSeries = { name: string; values: number[]; weights?: number[] };
export type FitParam = { name: string; value: number; error: number };
// range: the range of x it took (as text, '' for all); span: where its curve is drawn; parts: its peaks one by one
export type FitResult = { series: string; fit: string; method: string; range: string; params: FitParam[]; chi2: number; dof: number; p: number; r2: number; aic: number; curve: (x: number) => number; color: string; width: number; dash: Dash; span?: [number, number]; parts?: ((x: number) => number)[] };
export type HistResult = { edges: number[]; curves: Curve[]; fits: FitResult[]; bins: Dataset; table: Dataset; fitCurves: Dataset; warnings: string[] };

const FIT_NAMES: Record<HistFitKind, [string, string]> = { normal: ['Normal', 'Gaussian'], binormal: ['Two normals', 'Two Gaussians'], lorentz: ['Lorentz (Cauchy)', 'Lorentzian'], kernel: ['Kernel density', 'Kernel density'], gaussN: ['Gaussians', 'Gaussians'], lorentzN: ['Lorentzians', 'Lorentzians'], lognormal: ['Lognormal', 'Lognormal'], weibull: ['Weibull', 'Weibull'], exponential: ['Exponential', 'Exponential'], gamma: ['Gamma', 'Gamma'] };
const fmtR = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(4)) : '…');

export function histogram(series: HistSeries[], d: HistSpec, xName: string): HistResult | string {
  const warnings: string[] = [];
  const all = series.flatMap((s) => s.values.filter(Number.isFinite));
  if (!all.length) return 'No value to count: choose the columns (or designate them Y).';
  // one set of bins for all the columns (from all the values together)
  const edges = binEdges(all, d.bins);
  if (typeof edges === 'string') return edges;
  const nb = edges.length - 1;
  const widths = edges.slice(1).map((e, k) => e - edges[k]);
  const even = widths.every((w) => Math.abs(w - widths[0]) <= 1e-9 * Math.abs(widths[0]));
  const centers = widths.map((w, k) => edges[k] + w / 2);
  const counts = series.map((s) => histCounts(s.values, edges, s.weights));
  // the heights: of the values counted (inside the bins)
  const heightsOf = (c: number[]) => {
    const tot = c.reduce((a, b) => a + b, 0) || 1;
    const h = c.map((v, k) => (d.norm === 'count' ? v : d.norm === 'percent' ? (100 * v) / tot : d.norm === 'probability' ? v / tot : v / tot / widths[k]));
    if (!d.cumulative) return h;
    // cumulative: counts, %, or the probability up to the end of the bin (a density adds up to it too)
    const step = d.norm === 'density' ? h.map((v, k) => v * widths[k]) : h;
    let t = 0;
    return step.map((v) => (t += v));
  };
  const heights = counts.map(heightsOf);
  const colorOf = (j: number) => d.colors?.[j] || PALETTE[(j + 1) % PALETTE.length];
  // the bars: overlapped, stacked (each on the ones before), or side by side in the bin
  const k = series.length;
  const fill = Math.min(0.9, Math.max(0, d.gap || 0));
  const curves: Curve[] = series.map((s, j) => {
    const base = heights[0].map((_, b) => (d.multi === 'stack' ? heights.slice(0, j).reduce((t, h) => t + h[b], 0) : 0));
    const lo = edges.slice(0, -1).map((e, b) => {
      const w = widths[b] * (1 - fill);
      const x = e + (widths[b] * fill) / 2;
      return d.multi === 'side' && k > 1 && d.look === 'bars' ? x + (w / k) * j : x;
    });
    const hi = lo.map((x, b) => x + (d.multi === 'side' && k > 1 && d.look === 'bars' ? (widths[b] * (1 - fill)) / k : widths[b] * (1 - fill)));
    const top = heights[j].map((h, b) => base[b] + h);
    const color = colorOf(j);
    const own = withLook(curveStyle({ mode: 'line', color, lineWidth: d.edgeWidth, fillColor: color, fillOpacity: d.opacity, edgeColor: d.edgeColor }), d.barLook, d.looks?.[j]);
    return {
      key: `hist:${j}`,
      label: s.name,
      series: { name: s.name, x: column(xName, Float64Array.from(centers)), y: column(s.name, Float64Array.from(top)) },
      style: own.style,
      bars: { lo: Float64Array.from(lo), hi: Float64Array.from(hi), base: Float64Array.from(base), look: d.look, ...(own.look ? { style: own.look } : {}) },
    };
  });
  // the mean and the median of every column (weighted when the values have weights): vertical lines up to the highest bar
  if (d.marks?.mean || d.marks?.median) {
    const top = Math.max(0, ...curves.map((c) => Math.max(...Array.from(c.series.y.values).filter(Number.isFinite))));
    series.forEach((s, j) => {
      const pairs = s.values.map((x, i) => [x, s.weights ? s.weights[i] : 1] as const).filter(([x, w]) => Number.isFinite(x) && Number.isFinite(w) && w > 0);
      if (!pairs.length) return;
      const W = pairs.reduce((t, [, w]) => t + w, 0);
      const marks: [string, number, Dash][] = [];
      if (d.marks?.mean) marks.push(['mean', pairs.reduce((t, [x, w]) => t + x * w, 0) / W, 'dash']);
      if (d.marks?.median) {
        const sorted = [...pairs].sort((p, q) => p[0] - q[0]);
        // without weights: the middle value (the mean of the two middle ones); with: the value where half the weight is
        let acc = 0;
        const med = s.weights ? (sorted.find(([, w]) => (acc += w) >= W / 2)?.[0] ?? NaN) : percentile(sorted.map((p) => p[0]), 0.5);
        marks.push(['median', med, 'dot']);
      }
      for (const [what, m, dash] of marks)
        curves.push({ key: `hist:${j}:${what}`, label: `${series.length > 1 ? `${s.name} ` : ''}${what} ${fmtR(m)}`, series: { name: what, x: column(xName, Float64Array.of(m, m)), y: column(what, Float64Array.of(0, top)) }, style: curveStyle({ mode: 'line', color: colorOf(j), lineWidth: 1, dash }) });
    });
  }
  // the rug: every value a tick at the bottom (no y: it takes no part in the y range)
  if (d.rug)
    series.forEach((s, j) => {
      const v = s.values.filter(Number.isFinite);
      if (v.length) curves.push({ key: `hist:${j}:rug`, label: `${s.name} values`, noLegend: true, series: { name: s.name, x: column(xName, Float64Array.from(v)), y: column(s.name, new Float64Array(v.length).fill(NaN)) }, style: curveStyle({ mode: 'scatter', color: colorOf(j), lineWidth: 0.6, symbolSize: 0.01, symbolOpacity: 0, rug: 'x', rugLength: 5 }) });
    });
  // the fits, on every column: on all the data, or on the ranges (each one on its own — A fit per range, or a fit's own
  // range — or all of them together)
  const fits: FitResult[] = [];
  const ranges = (d.ranges ?? []).filter((q) => Number.isFinite(q.lo) || Number.isFinite(q.hi)).map((q): [number, number] => {
    const [u, w] = [Number.isFinite(q.lo) ? q.lo : -Infinity, Number.isFinite(q.hi) ? q.hi : Infinity];
    return u <= w ? [u, w] : [w, u];
  });
  const rangeText = ([u, w]: [number, number]) => `${fmtR(u)} – ${fmtR(w)}`;
  const jobsOf = (f: HistFit): { ivs: [number, number][]; label: string }[] => {
    if (!ranges.length) return [{ ivs: [], label: '' }];
    if (f.on !== undefined && ranges[f.on]) return [{ ivs: [ranges[f.on]], label: rangeText(ranges[f.on]) }];
    if (d.rangeFits) return ranges.map((q) => ({ ivs: [q], label: rangeText(q) }));
    return [{ ivs: ranges, label: ranges.map(rangeText).join(', ') }];
  };
  if (d.fits.length && d.cumulative) warnings.push('The fits are drawn on the histogram that is not cumulative: turn Cumulative off.');
  if (d.fits.length && !d.cumulative && !even && d.norm !== 'density') warnings.push('Bins of different widths: the curves fitted from the data match the heights only as densities (Height ▸ density).');
  const w0 = even ? widths[0] : widths.reduce((a, b) => a + b, 0) / nb;
  if (!d.cumulative)
    series.forEach((s, j) => {
      const vAll = s.values.filter(Number.isFinite);
      const inBins = counts[j].reduce((a, b) => a + b, 0) || 1;
      // a count expected from a probability → the height drawn
      const conv = d.norm === 'count' ? 1 : d.norm === 'percent' ? 100 / inBins : d.norm === 'probability' ? 1 / inBins : 1 / (inBins * w0);
      d.fits.forEach((f, fi) => jobsOf(f).forEach((job) => {
        // this column's own line for this fit, else the fit's
        const L = d.looks?.[j]?.fits?.[fi];
        if (L?.show === false) return;
        const color = L?.color || f.color || (k > 1 ? colorOf(j) : PALETTE[(fi + 2) % PALETTE.length]);
        const look = { color, width: L?.width ?? f.width ?? 1.5, dash: L?.dash ?? f.dash ?? ('solid' as Dash) };
        const many = f.kind === 'gaussN' || f.kind === 'lorentzN';
        const nPk = Math.max(2, Math.min(6, Math.round(f.peaks ?? 2) || 2));
        const name = many ? `${nPk} ${FIT_NAMES[f.kind][0]}` : FIT_NAMES[f.kind][f.kind === 'kernel' || f.method === 'data' ? 0 : 1];
        // its ranges: the values in them, the bins whose middle is in them, where its curve is drawn
        const ivs = job.ivs;
        const ranged = ivs.length > 0;
        const range = job.label;
        const inR = (x: number) => !ranged || ivs.some(([a, b]) => x >= a && x <= b);
        const [a, b] = ranged ? [Math.min(...ivs.map((q) => q[0])), Math.max(...ivs.map((q) => q[1]))] : [-Infinity, Infinity];
        const v = ranged ? vAll.filter(inR) : vAll;
        const N = v.length;
        const binsIn = centers.map((c) => inR(c));
        const span: [number, number] | undefined = ranged && !f.drawAll ? [Math.max(edges[0], a), Math.min(edges[nb], b)] : undefined;
        const base = { series: s.name, fit: name, range, ...look, ...(span ? { span } : {}) };
        // χ² of the counts against the counts expected in every bin of the range (bins expecting none left out)
        const chiOf = (expected: (b: number) => number, nPar: number) => {
          let chi2 = 0;
          let used = 0;
          counts[j].forEach((o, bi) => {
            if (!binsIn[bi]) return;
            const e = expected(bi);
            if (e > 0) {
              chi2 += (o - e) ** 2 / e;
              used++;
            }
          });
          const dof = used - nPar;
          return { chi2, dof, p: dof > 0 ? chi2Sf(chi2, dof) : NaN };
        };
        if (!many && (f.kind === 'kernel' || f.method === 'data' || DIST_FITS.has(f.kind))) {
          if (N < (f.kind === 'binormal' ? 5 : 2)) return warnings.push(`${s.name}: too few values${ranged ? ` in ${range}` : ''} for ${name}.`);
          let pdf: (x: number) => number;
          let cdf: (x: number) => number;
          let params: FitParam[];
          let loglik: number;
          let nPar: number;
          // the values the whole peak holds (more than those in the range when its tails go past it)
          let total = N;
          if (f.kind === 'normal') {
            const r = ranged ? truncatedFit(v, ivs, 'normal') : null;
            const n0 = r ? null : normalFit(v);
            const [mu, sd, seMu, seSd] = r ? [r.loc, r.scale, r.seLoc, r.seScale] : [n0!.mu, n0!.sd, n0!.seMu, n0!.seSd];
            pdf = (x) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd)) / (sd * SQ2PI);
            cdf = (x) => normCdf((x - mu) / sd);
            params = [
              { name: 'μ (mean)', value: mu, error: seMu },
              { name: 'σ (SD)', value: sd, error: seSd },
              { name: 'FWHM', value: 2 * Math.sqrt(2 * Math.LN2) * sd, error: 2 * Math.sqrt(2 * Math.LN2) * seSd },
            ];
            if (r) total = N / r.mass;
            [loglik, nPar] = [r ? r.loglik : n0!.loglik, 2];
          } else if (f.kind === 'lorentz') {
            const r = ranged ? truncatedFit(v, ivs, 'cauchy') : null;
            const c0 = r ? null : cauchyFit(v);
            const [x0, g, seX0, seG] = r ? [r.loc, r.scale, r.seLoc, r.seScale] : [c0!.x0, c0!.g, c0!.seX0, c0!.seG];
            pdf = (x) => g / (Math.PI * (g * g + (x - x0) ** 2));
            cdf = (x) => 0.5 + Math.atan((x - x0) / g) / Math.PI;
            params = [
              { name: 'xc', value: x0, error: seX0 },
              { name: 'γ (HWHM)', value: g, error: seG },
              { name: 'FWHM', value: 2 * g, error: 2 * seG },
            ];
            if (r) total = N / r.mass;
            [loglik, nPar] = [r ? r.loglik : c0!.loglik, 2];
          } else if (f.kind === 'binormal') {
            const r = mixtureFit(v);
            const g = (x: number, m: number, sd: number) => Math.exp(-((x - m) ** 2) / (2 * sd * sd)) / (sd * SQ2PI);
            pdf = (x) => r.w1 * g(x, r.m1, r.s1) + r.w2 * g(x, r.m2, r.s2);
            cdf = (x) => r.w1 * normCdf((x - r.m1) / r.s1) + r.w2 * normCdf((x - r.m2) / r.s2);
            params = [
              { name: 'w1', value: r.w1, error: r.se[0] },
              { name: 'μ1', value: r.m1, error: r.se[1] },
              { name: 'σ1', value: r.s1, error: r.se[2] },
              { name: 'w2', value: r.w2, error: r.se[0] },
              { name: 'μ2', value: r.m2, error: r.se[3] },
              { name: 'σ2', value: r.s2, error: r.se[4] },
            ];
            [loglik, nPar] = [r.loglik, 5];
          } else if (DIST_FITS.has(f.kind)) {
            // a distribution of positive values by maximum likelihood (the values ≤ 0 left out), its errors from the
            // Fisher matrix; its median
            const dk = f.kind as ProbDist;
            const pos = v.filter((x) => x > 0);
            if (pos.length < 2) return warnings.push(`${s.name}: too few values above 0 for ${name}.`);
            if (pos.length < v.length) warnings.push(`${s.name}, ${name}: ${v.length - pos.length} value(s) ≤ 0 left out.`);
            const p = fitDist(dk, pos);
            const D = makeDist(dk, p);
            pdf = D.pdf;
            cdf = D.cdf;
            const se = paramSE(dk, p, fisherCov(dk, p, pos, []));
            params = [...PARAM_NAMES[dk].map((nm, k) => ({ name: nm, value: p[k], error: se[k] })), { name: 'median', value: D.ppf(0.5), error: NaN }];
            loglik = pos.reduce((t, x) => t + Math.log(D.pdf(x)), 0);
            nPar = p.length;
            total = pos.length;
          } else {
            const h = f.bandwidth === 'value' && (f.bw ?? 0) > 0 ? f.bw! : kdeWidth(v, f.bandwidth === 'silverman' ? 'silverman' : 'scott');
            pdf = kde(v, h);
            cdf = (x) => v.reduce((t, xi) => t + normCdf((x - xi) / h), 0) / N;
            params = [{ name: 'bandwidth', value: h, error: NaN }];
            loglik = v.reduce((t, x) => t + Math.log(pdf(x)), 0);
            nPar = 0;
          }
          if (ranged) params.push({ name: 'n (in the range)', value: N, error: NaN });
          const chi = chiOf((bi) => total * (cdf(edges[bi + 1]) - cdf(edges[bi])), nPar + 1);
          fits.push({ ...base, method: f.kind === 'kernel' ? 'kernel' : 'from the data', params, ...chi, r2: NaN, aic: f.kind === 'kernel' ? NaN : 2 * nPar - 2 * loglik, curve: (x) => total * w0 * conv * pdf(x) });
          return;
        }
        // fitted to the bars (those of the range): least squares on the heights (no weights)
        const idx = centers.map((_, bi) => bi).filter((bi) => binsIn[bi]);
        const xs = idx.map((bi) => centers[bi]);
        const ys = idx.map((bi) => heights[j][bi]);
        const filled = idx.filter((bi) => counts[j][bi] > 0).length;
        const two = f.kind === 'binormal';
        const nNeed = many ? 3 * nPk : two ? 6 : 3;
        if (N < 3 || filled < nNeed) return warnings.push(`${s.name}: too few values or bins${ranged ? ` in ${range}` : ''} for ${name}.`);
        const model = many ? peaksModel(f.kind === 'gaussN' ? 'gauss' : 'lorentz', nPk, !!f.offset) : f.kind === 'lorentz' ? lorentzModel(!!f.offset) : gaussModel(!!f.offset, two);
        // starting values from the data (of the range)
        const nf = normalFit(v.length > 1 ? v : [0, 1]);
        const peak = maxOf(ys);
        const start: number[] = [];
        if (many) {
          const at = peakStarts(xs, ys, nPk, f.starts);
          const span0 = (maxOf(xs) - minOf(xs) || 1) / (4 * nPk);
          for (const x of at) {
            const near = xs.reduce((p, q, i) => (Math.abs(q - x) < Math.abs(xs[p] - x) ? i : p), 0);
            start.push(Math.max(ys[near], peak * 0.05), x, Math.max(span0, w0));
          }
          start.push(0);
        } else if (two) {
          const m = v.length >= 5 ? mixtureFit(v) : { w1: 0.5, m1: nf.mu - nf.sd, s1: nf.sd / 2, w2: 0.5, m2: nf.mu + nf.sd, s2: nf.sd / 2 };
          const amp = (w: number, sd: number) => (N * w0 * conv * w) / (sd * SQ2PI);
          start.push(amp(m.w1, m.s1), m.m1, m.s1, amp(m.w2, m.s2), m.m2, m.s2, 0);
        } else if (f.kind === 'lorentz') {
          const c = cauchyFit(v.length > 1 ? v : [0, 1]);
          start.push(peak, c.x0, c.g, 0);
        } else start.push(peak, nf.mu, nf.sd, 0);
        const specs: FitParamSpec[] = model.params.map((q, i) => ({ name: q.name, value: start[i], fixed: q.name === 'y0' && !f.offset, min: NaN, max: NaN, shared: false }));
        const res = runFits(model, specs, [{ label: s.name, value: j, xs, ys, sig: ys.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: 0 } });
        const r = res.runs[0];
        if (!r) return warnings.push(`${s.name}: ${name} could not be fitted.`, ...res.warnings);
        const p = r.params.map((q) => q.value);
        const e = r.params.map((q) => q.error);
        const ctx = { energy: false, xref: 0, run: 1 };
        const curve = (x: number) => model.f(x, p, ctx);
        const toCount = (bi: number) => (d.norm === 'count' ? 1 : d.norm === 'percent' ? inBins / 100 : d.norm === 'probability' ? inBins : inBins * widths[bi]);
        const free = r.stats.n - r.stats.dof;
        const chi = chiOf((bi) => curve(centers[bi]) * toCount(bi), free);
        const params: FitParam[] = [];
        const add = (nm: string, i: number) => params.push({ name: nm, value: p[i], error: e[i] });
        const fw = 2 * Math.sqrt(2 * Math.LN2);
        const y0 = f.offset ? p[model.params.length - 1] : 0;
        let parts: ((x: number) => number)[] | undefined;
        if (many) {
          const gauss = f.kind === 'gaussN';
          // the peaks from left to right
          const order = Array.from({ length: nPk }, (_, i) => i).sort((u, w) => p[3 * u + 1] - p[3 * w + 1]);
          order.forEach((i, t) => {
            const [ia, ix, is] = [3 * i, 3 * i + 1, 3 * i + 2];
            const sfx = String(t + 1);
            add(`xc${sfx}`, ix);
            add(`${gauss ? 'σ' : 'γ'}${sfx}`, is);
            const [A, S, eA, eS] = [p[ia], Math.abs(p[is]), e[ia], e[is]];
            const k2 = gauss ? SQ2PI : Math.PI;
            params.push({ name: `FWHM${sfx}`, value: (gauss ? fw : 2) * S, error: (gauss ? fw : 2) * eS }, { name: `height${sfx}`, value: A, error: eA }, { name: `area${sfx}`, value: k2 * A * S, error: k2 * Math.hypot(A * eS, S * eA) });
          });
          if (f.parts) parts = order.map((i) => (x: number) => y0 + (gauss ? p[3 * i] * Math.exp(-((x - p[3 * i + 1]) ** 2) / (2 * p[3 * i + 2] ** 2)) : p[3 * i] / (1 + ((x - p[3 * i + 1]) / p[3 * i + 2]) ** 2)));
        } else if (f.kind === 'lorentz') {
          add('xc', 1);
          add('γ (HWHM)', 2);
          params.push({ name: 'FWHM', value: 2 * p[2], error: 2 * e[2] }, { name: 'height', value: p[0], error: e[0] }, { name: 'area', value: Math.PI * p[0] * p[2], error: Math.PI * Math.hypot(p[0] * e[2], p[2] * e[0]) });
        } else
          for (let g = 0; g < (two ? 2 : 1); g++) {
            const [ia, ix, is] = [3 * g, 3 * g + 1, 3 * g + 2];
            const t = two ? String(g + 1) : '';
            add(`xc${t}`, ix);
            add(`σ${t}`, is);
            params.push({ name: `FWHM${t}`, value: fw * p[is], error: fw * e[is] }, { name: `height${t}`, value: p[ia], error: e[ia] }, { name: `area${t}`, value: SQ2PI * p[ia] * p[is], error: SQ2PI * Math.hypot(p[ia] * e[is], p[is] * e[ia]) });
          }
        if (f.offset) add('y0', model.params.length - 1);
        const nObs = r.stats.n;
        fits.push({ ...base, method: 'fitted to the bars', params, ...chi, r2: r.stats.r2, aic: nObs * Math.log(r.stats.chi2 / nObs) + 2 * (free + 1), curve, ...(parts ? { parts } : {}) });
      }));
    });
  // the fits drawn over the whole range of the bins (or their own), and in the legend; their peaks one by one dashed
  const lo = edges[0];
  const hi = edges[nb];
  const fitName = (f: FitResult) => {
    const more = [series.length > 1 ? f.series : '', f.range].filter(Boolean).join(', ');
    return `${f.fit}${more ? ` (${more})` : ''}`;
  };
  fits.forEach((f, i) => {
    const [a, b] = f.span ?? [lo, hi];
    const xs = Array.from({ length: 401 }, (_, t) => a + ((b - a) * t) / 400);
    const label = fitName(f);
    curves.push({ key: `fit:${i}`, label, series: { name: label, x: column(xName, Float64Array.from(xs)), y: column(label, Float64Array.from(xs, f.curve)) }, style: curveStyle({ mode: 'line', color: f.color, lineWidth: f.width, dash: f.dash }) });
    f.parts?.forEach((g, t) => curves.push({ key: `fit:${i}:${t}`, label: `${label} · peak ${t + 1}`, noLegend: true, series: { name: `peak ${t + 1}`, x: column(xName, Float64Array.from(xs)), y: column(`peak ${t + 1}`, Float64Array.from(xs, g)) }, style: curveStyle({ mode: 'line', color: f.color, lineWidth: Math.max(0.5, f.width * 0.6), dash: 'dash' }) }));
  });
  // the tables: the bins, the fits (a row per parameter: easy to read, to copy), the fitted curves
  const bins: Column[] = [{ ...column(`${xName} (centre)`, Float64Array.from(centers)), role: 'x' }, { ...column('from', Float64Array.from(edges.slice(0, -1))), role: 'none' }, { ...column('to', Float64Array.from(edges.slice(1))), role: 'none' }];
  const hName = d.cumulative ? `cumulative ${d.norm === 'density' ? 'probability' : d.norm}` : d.norm;
  series.forEach((s, j) => {
    bins.push({ ...column(`${s.name} count`, Float64Array.from(counts[j])), role: 'none' });
    bins.push({ ...column(`${s.name} ${hName}`, Float64Array.from(heights[j])), role: 'y' });
  });
  const rows = fits.flatMap((f) => [...f.params, { name: 'χ²', value: f.chi2, error: NaN }, { name: 'dof', value: f.dof, error: NaN }, { name: 'p (χ²)', value: f.p, error: NaN }, ...(Number.isFinite(f.r2) ? [{ name: 'R²', value: f.r2, error: NaN }] : []), ...(Number.isFinite(f.aic) ? [{ name: 'AIC', value: f.aic, error: NaN }] : [])].map((q) => ({ f, q })));
  const txt = (name: string, g: (r: (typeof rows)[number]) => string): Column => ({ ...column(name, Float64Array.from(rows, () => NaN), rows.map(g)), role: 'label' });
  const table: Dataset = {
    name: 'histogram fits',
    columns: [txt('column', (r) => r.f.series), txt('fit', (r) => `${r.f.fit} (${r.f.method})${r.f.range ? `, ${r.f.range}` : ''}`), txt('parameter', (r) => r.q.name), { ...column('value', Float64Array.from(rows, (r) => r.q.value)), role: 'none' }, { ...column('error', Float64Array.from(rows, (r) => r.q.error)), role: 'none' }],
  };
  // the fitted curves on one X over all the bins (a curve of a range: empty past it, as drawn)
  const xsAll = Array.from({ length: 401 }, (_, t) => lo + ((hi - lo) * t) / 400);
  const fitCurves: Dataset = { name: 'fitted curves', columns: [{ ...column(xName, Float64Array.from(xsAll)), role: 'x' }, ...fits.map((f): Column => ({ ...column(fitName(f), Float64Array.from(xsAll, (x) => (f.span && (x < f.span[0] || x > f.span[1]) ? NaN : f.curve(x)))), role: 'y' }))] };
  return { edges, curves, fits, bins: { name: 'bins', columns: bins }, table, fitCurves, warnings };
}
