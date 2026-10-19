// Probability plots (ECDF, Q-Q, P-P, probability axes): a sample against a distribution. ECDF: the empirical cumulative distribution as steps
// (or 1 − F, a percent, a count), the distribution's CDF over it, a band (pointwise, or the simultaneous one of
// Dvoretzky–Kiefer–Wolfowitz). Q-Q: the sorted values against the distribution's quantiles at their plotting positions
// (Blom, Benard, Hazen, Van der Waerden, Filliben). P-P: the distribution's CDF at every value against its
// position. Probability: the values against their positions on a probability axis — the distribution's straight line.
// The distribution: Normal, Lognormal, Exponential, Weibull, Gamma, Logistic, Gumbel, Uniform; fitted by maximum
// likelihood (the location 0 for the positive ones) or given. A line: the distribution, least squares, through the
// quartiles, y = x; a pointwise band around it (the standard error of an order
// statistic). Per group: the parameters, the probability plot correlation r (PPCC), the least-squares
// line, Anderson–Darling A² (p for Normal / Lognormal, the 5 % critical value for Exponential, Logistic, Gumbel),
// Kolmogorov–Smirnov D. Life data (reliability.ts): values still running when the test stopped (suspended, right
// censored) — Johnson's adjusted positions, the fit with them (maximum likelihood) or by rank regression (RRX, RRY), a
// threshold γ (3 parameters), Fisher intervals of the parameters and of the B lives, Kaplan–Meier as the ECDF; the
// parameters written on the figure, the 63.2 % (Weibull's η) or 50 % line. Pure.
import { igamma, lgamma, normCdf, normInv } from './dist.ts';
import { adjustedPositions, bLife, canRegress, fisherCov, fitMLE, fitRR, fitThreshold, kaplanMeier, paramCI } from './reliability.ts';
import { andersonDarling } from './hypo.ts';
import { percentile } from './stats.ts';
import { column, type Column, type Dataset } from './table.ts';
import { probT } from '../figure/ticks.ts';
import { curveStyle, PALETTE, type Curve, type Dash, type ElementLook, type ProbAxis, type SymbolFill, type SymbolShape } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type ProbDist = 'normal' | 'lognormal' | 'exponential' | 'weibull' | 'gamma' | 'logistic' | 'gumbel' | 'uniform';
export type PlotPositions = 'blom' | 'benard' | 'hazen' | 'vdw' | 'filliben';
export type ProbKind = 'ecdf' | 'qq' | 'pp' | 'prob';
export type ProbSpec = {
  kind: ProbKind;
  mode: 'table' | 'raw';
  ys: string; // table: the columns, each a group ('' = the designated Y)
  value: string; // raw: the values and the column of their groups
  group: string;
  dist: ProbDist;
  params: 'fit' | 'given';
  p1: number; // given: the parameters (PARAM_NAMES)
  p2: number;
  positions: PlotPositions;
  qqAxis: 'standard' | 'data'; // Q-Q: the quantiles of the standard distribution (location 0, scale 1), or the fitted one
  line: 'dist' | 'lsq' | 'quartiles' | 'identity' | 'none';
  band: 'none' | 'pointwise' | 'dkw';
  level: number; // the band's confidence, %
  ecdfY: 'probability' | 'percent' | 'count';
  complementary: boolean; // ECDF: 1 − F (survival)
  ecdfLook: 'steps' | 'points' | 'both';
  swap: boolean; // the two axes exchanged
  colors?: string[];
  looks?: (ElementLook | null)[]; // a look of its own for any group: its points, line and band
  symbol: SymbolShape;
  symbolSize: number;
  symbolFill: SymbolFill;
  lineColor: string; // '' = auto: red for one group, else the group's colour
  lineWidth: number;
  lineDash: Dash;
  bandDash: Dash;
  // life data: a column of the status of every value (1 / F failed, 0 / S suspended); how the parameters are found
  // (maximum likelihood, rank regression X on Y or Y on X); a threshold γ (3 parameters, the positive distributions);
  // the B lives (“1, 10”: the values by which 1 % and 10 % failed, with intervals); the parameters written on the
  // figure (a corner); the 63.2 % line (Weibull: η; else the median, 50 %)
  censor?: string;
  method?: 'mle' | 'rrx' | 'rry';
  threshold?: boolean;
  bLives?: string;
  paramBox?: 'none' | 'tl' | 'tr' | 'bl' | 'br';
  refLine?: boolean;
};

export const DIST_NAMES: Record<ProbDist, string> = { normal: 'Normal', lognormal: 'Lognormal', exponential: 'Exponential', weibull: 'Weibull', gamma: 'Gamma', logistic: 'Logistic', gumbel: 'Gumbel', uniform: 'Uniform' };
export const PARAM_NAMES: Record<ProbDist, string[]> = {
  normal: ['μ', 'σ'],
  lognormal: ['μ (of ln x)', 'σ (of ln x)'],
  exponential: ['β (mean)'],
  weibull: ['k (shape)', 'λ (scale)'],
  gamma: ['a (shape)', 'θ (scale)'],
  logistic: ['μ', 's'],
  gumbel: ['μ', 'β'],
  uniform: ['a (min)', 'b (max)'],
};
const POSITIVE = new Set<ProbDist>(['lognormal', 'exponential', 'weibull', 'gamma']);
// the probability axis on which a distribution's CDF is straight (the data on a log axis for Lognormal and Weibull);
// Uniform: a linear axis; Gamma: none (its shape): its quantiles with the percents written at them
export const PROB_AXIS: Partial<Record<ProbDist, ProbAxis>> = { normal: 'normal', lognormal: 'normal', exponential: 'exp', weibull: 'sev', logistic: 'logistic', gumbel: 'lev' };
export const LOG_DATA = new Set<ProbDist>(['lognormal', 'weibull']);

// ---- the distributions ----
type Std = { ppf: (p: number) => number; cdf: (z: number) => number; pdf: (z: number) => number };
// a distribution: its standard form (location 0, scale 1, the shape kept) moved and stretched
export type Dist = { kind: ProbDist; params: number[]; loc: number; scale: number; std: Std; cdf: (x: number) => number; ppf: (p: number) => number; pdf: (x: number) => number };
const npdf = (z: number) => Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);

// the quantile of the standard gamma: Newton on P(a, z) = p kept inside a bracket (Wilson–Hilferty start)
function gammaPpf(a: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let z = a * (1 - 1 / (9 * a) + normInv(p) / (3 * Math.sqrt(a))) ** 3;
  if (!(z > 0)) z = Math.exp((Math.log(p) + Math.log(a) + lgamma(a)) / a);
  let [lo, hi] = [0, Infinity];
  for (let k = 0; k < 200; k++) {
    const f = igamma(a, z) - p;
    if (f < 0) lo = z;
    else hi = z;
    const d = Math.exp((a - 1) * Math.log(z) - z - lgamma(a));
    let next = z - f / d;
    if (!(next > lo && next < hi)) next = hi === Infinity ? z * 2 : (lo + hi) / 2;
    if (Math.abs(next - z) <= 1e-15 * z) return next;
    z = next;
  }
  return z;
}

export function makeDist(kind: ProbDist, p: number[]): Dist {
  const [a, b] = p;
  let std: Std;
  let [loc, scale] = [0, 1];
  switch (kind) {
    case 'normal':
      std = { ppf: normInv, cdf: normCdf, pdf: npdf };
      [loc, scale] = [a, b];
      break;
    case 'lognormal':
      std = { ppf: (q) => Math.exp(b * normInv(q)), cdf: (z) => (z > 0 ? normCdf(Math.log(z) / b) : 0), pdf: (z) => (z > 0 ? npdf(Math.log(z) / b) / (b * z) : 0) };
      scale = Math.exp(a);
      break;
    case 'exponential':
      std = { ppf: (q) => -Math.log1p(-q), cdf: (z) => (z > 0 ? -Math.expm1(-z) : 0), pdf: (z) => (z >= 0 ? Math.exp(-z) : 0) };
      scale = a;
      break;
    case 'weibull':
      std = { ppf: (q) => (-Math.log1p(-q)) ** (1 / a), cdf: (z) => (z > 0 ? -Math.expm1(-(z ** a)) : 0), pdf: (z) => (z > 0 ? a * z ** (a - 1) * Math.exp(-(z ** a)) : 0) };
      scale = b;
      break;
    case 'gamma':
      std = { ppf: (q) => gammaPpf(a, q), cdf: (z) => igamma(a, z), pdf: (z) => (z > 0 ? Math.exp((a - 1) * Math.log(z) - z - lgamma(a)) : 0) };
      scale = b;
      break;
    case 'logistic':
      std = {
        ppf: (q) => Math.log(q / (1 - q)),
        cdf: (z) => 1 / (1 + Math.exp(-z)),
        pdf: (z) => {
          const e = Math.exp(-Math.abs(z));
          return e / (1 + e) ** 2;
        },
      };
      [loc, scale] = [a, b];
      break;
    case 'gumbel':
      std = { ppf: (q) => -Math.log(-Math.log(q)), cdf: (z) => Math.exp(-Math.exp(-z)), pdf: (z) => Math.exp(-z - Math.exp(-z)) };
      [loc, scale] = [a, b];
      break;
    case 'uniform':
      std = { ppf: (q) => q, cdf: (z) => Math.min(1, Math.max(0, z)), pdf: (z) => (z >= 0 && z <= 1 ? 1 : 0) };
      [loc, scale] = [a, b - a];
      break;
  }
  return { kind, params: p, loc, scale, std, cdf: (x) => std.cdf((x - loc) / scale), ppf: (q) => loc + scale * std.ppf(q), pdf: (x) => std.pdf((x - loc) / scale) / scale };
}
// what is wrong with given parameters ('' = nothing)
export function badParams(kind: ProbDist, p: number[]): string {
  const names = PARAM_NAMES[kind];
  if (p.slice(0, names.length).some((v) => !Number.isFinite(v))) return `Write the parameters: ${names.join(', ')}.`;
  if (kind === 'uniform') return p[1] > p[0] ? '' : 'Uniform: b must be larger than a.';
  if (kind === 'normal' || kind === 'lognormal' || kind === 'logistic' || kind === 'gumbel') return p[1] > 0 ? '' : `${names[1]} must be positive.`;
  return p.slice(0, names.length).every((v) => v > 0) ? '' : `${names.join(' and ')} must be positive.`;
}

// A root of f in [a, b] (f(a), f(b) of opposite signs): Brent's method (R. P. Brent, Algorithms for Minimization
// without Derivatives, 1973, ch. 4) — a bracket kept around the root; each step the inverse quadratic interpolation
// through the last three points (or the secant through two), taken only when it falls well inside the bracket and
// shrinks it fast enough, else bisection.
function brent(f: (x: number) => number, lo: number, hi: number, tol = 1e-15): number {
  let [a, b] = [lo, hi];
  let [fa, fb] = [f(a), f(b)];
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return NaN;
  // b: the best guess (|f(b)| smallest), a: the other end of the bracket, c: the previous b
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let [c, fc] = [a, fa];
  let bisected = true;
  let before = c; // the b before c (for the step-size test after an interpolation)
  for (let k = 0; k < 500; k++) {
    const t = 2 * Number.EPSILON * Math.abs(b) + tol / 2;
    if (fb === 0 || Math.abs(b - a) / 2 <= t) return b;
    // the candidate: inverse quadratic interpolation when the three values differ, else the secant
    let s: number;
    if (fa !== fc && fb !== fc) s = (a * fb * fc) / ((fa - fb) * (fa - fc)) + (b * fa * fc) / ((fb - fa) * (fb - fc)) + (c * fa * fb) / ((fc - fa) * (fc - fb));
    else s = b - (fb * (b - a)) / (fb - fa);
    // rejected (bisection instead): outside ((3a + b) / 4, b), or not halving the step of the step before
    const lowEnd = (3 * a + b) / 4;
    const outside = !(s > Math.min(lowEnd, b) && s < Math.max(lowEnd, b));
    const slow: boolean = bisected ? Math.abs(s - b) >= Math.abs(b - c) / 2 || Math.abs(b - c) < t : Math.abs(s - b) >= Math.abs(c - before) / 2 || Math.abs(c - before) < t;
    bisected = outside || slow;
    if (bisected) s = (a + b) / 2;
    const fs = f(s);
    before = c;
    [c, fc] = [b, fb];
    // the new bracket: s with whichever end has the other sign
    if (fa * fs < 0) [b, fb] = [s, fs];
    else [a, fa, b, fb] = [b, fb, s, fs];
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }
  return b;
}
// ψ(x) and ψ′(x) (x > 0): the recurrence up to 6, then the asymptotic series
function digamma(x: number): number {
  let r = 0;
  for (; x < 6; x++) r -= 1 / x;
  const f = 1 / (x * x);
  return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}

const meanOf = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
// maximum likelihood (the location fixed at 0 for the positive distributions)
export function fitDist(kind: ProbDist, x: number[]): number[] {
  const n = x.length;
  const m = meanOf(x);
  const sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / n);
  switch (kind) {
    case 'normal':
      return [m, sd];
    case 'lognormal':
      return fitDist('normal', x.map(Math.log));
    case 'exponential':
      return [m];
    case 'uniform':
      return [minOf(x), maxOf(x)];
    case 'weibull': {
      // 1/k + mean(ln y) = Σ y^k ln y / Σ y^k (y = x / max, so the powers stay finite)
      const c = maxOf(x);
      const ly = x.map((v) => Math.log(v / c));
      const ml = meanOf(ly);
      const f = (lk: number) => {
        const k = Math.exp(lk);
        let [s0, s1] = [0, 0];
        for (const l of ly) {
          const w = Math.exp(k * l);
          s0 += w;
          s1 += w * l;
        }
        return s1 / s0 - 1 / k - ml;
      };
      const k = Math.exp(brent(f, Math.log(1e-4), Math.log(1e4)));
      return [k, c * meanOf(ly.map((l) => Math.exp(k * l))) ** (1 / k)];
    }
    case 'gamma': {
      // ln a − ψ(a) = ln(mean) − mean(ln x)
      const s = Math.log(m) - meanOf(x.map(Math.log));
      const a = Math.exp(brent((la) => la - digamma(Math.exp(la)) - s, Math.log(1e-6), Math.log(1e8)));
      return [a, m / a];
    }
    case 'logistic': {
      // Σ tanh(z/2) = 0 (μ) and Σ z·tanh(z/2) = n (s), z = (x − μ)/s
      const [lo, hi] = [minOf(x), maxOf(x)];
      const muOf = (s: number) => brent((mu) => x.reduce((t, v) => t + Math.tanh((v - mu) / (2 * s)), 0), lo, hi);
      const g = (ls: number) => {
        const s = Math.exp(ls);
        const mu = muOf(s);
        return x.reduce((t, v) => t + ((v - mu) / s) * Math.tanh((v - mu) / (2 * s)), 0) - n;
      };
      const s = Math.exp(brent(g, Math.log(sd * 1e-4), Math.log(sd * 10)));
      return [muOf(s), s];
    }
    case 'gumbel': {
      // β = mean − Σ x e^{−x/β} / Σ e^{−x/β}; μ = −β ln(mean e^{−x/β})
      const x0 = minOf(x);
      const wsum = (b: number) => {
        let [s0, s1] = [0, 0];
        for (const v of x) {
          const w = Math.exp(-(v - x0) / b);
          s0 += w;
          s1 += w * v;
        }
        return [s0, s1];
      };
      const b = Math.exp(
        brent(
          (lb) => {
            const bb = Math.exp(lb);
            const [s0, s1] = wsum(bb);
            return m - s1 / s0 - bb;
          },
          Math.log(sd * 1e-4),
          Math.log(sd * 10),
        ),
      );
      return [x0 - b * Math.log(wsum(b)[0] / n), b];
    }
  }
}

// the plotting positions of n sorted values: (i − a)/(n + 1 − 2a), or Filliben's
export function plotPositions(n: number, how: PlotPositions): number[] {
  if (how === 'filliben') {
    const last = 0.5 ** (1 / n);
    return Array.from({ length: n }, (_, k) => (n === 1 ? 0.5 : k === 0 ? 1 - last : k === n - 1 ? last : (k + 1 - 0.3175) / (n + 0.365)));
  }
  const a = how === 'blom' ? 0.375 : how === 'benard' ? 0.3 : how === 'hazen' ? 0.5 : 0;
  return Array.from({ length: n }, (_, k) => (k + 1 - a) / (n + 1 - 2 * a));
}

// Anderson–Darling A² of sorted values against a distribution
function adStat(x: number[], F: (v: number) => number): number {
  const n = x.length;
  const c = (v: number) => Math.min(1 - 1e-16, Math.max(1e-300, v));
  let s = 0;
  for (let i = 0; i < n; i++) s += (2 * i + 1) * (Math.log(c(F(x[i]))) + Math.log(c(1 - F(x[n - 1 - i]))));
  return -n - s / n;
}
// the 5 % critical values of Anderson–Darling (the tables of Stephens), for the fitted Exponential, Logistic, Gumbel
const crit5 = (kind: ProbDist, n: number) => (kind === 'exponential' ? 1.321 / (1 + 0.6 / n) : kind === 'logistic' ? 0.66 / (1 + 0.25 / n) : kind === 'gumbel' ? 0.757 / (1 + 0.2 / Math.sqrt(n)) : NaN);

// a straight line u = a + b·v, v = h(p), u = g(x): where the plot is linear
type Lin = { h: (p: number) => number; g: (x: number) => number; gi: (u: number) => number };
const ident = (x: number) => x;
function linFor(kind: ProbKind, D: Dist, qqAxis: ProbSpec['qqAxis']): Lin {
  if (kind === 'prob') {
    const ax = PROB_AXIS[D.kind];
    const h = ax ? (p: number) => probT(ax, 100 * p) : D.kind === 'uniform' ? ident : D.std.ppf;
    return LOG_DATA.has(D.kind) ? { h, g: Math.log, gi: Math.exp } : { h, g: ident, gi: ident };
  }
  return { h: kind === 'qq' && qqAxis === 'data' ? D.ppf : D.std.ppf, g: ident, gi: ident };
}
function lsq(v: number[], u: number[]) {
  const [mv, mu] = [meanOf(v), meanOf(u)];
  let [svv, suu, svu] = [0, 0, 0];
  for (let i = 0; i < v.length; i++) {
    svv += (v[i] - mv) ** 2;
    suu += (u[i] - mu) ** 2;
    svu += (v[i] - mv) * (u[i] - mu);
  }
  const b = svu / svv;
  return { a: mu - b * mv, b, r: svu / Math.sqrt(svv * suu) };
}

// susp: every value's status (true: suspended — still running when the test stopped)
export type ProbGroup = { name: string; values: number[]; susp?: boolean[] };
export type BLife = { p: number; value: number; lo: number; hi: number };
export type ProbRow = { group: string; n: number; params: number[]; r: number; slope: number; intercept: number; a2: number; p: number; crit5: number; ks: number; failures: number; suspended: number; gamma: number; ci: [number, number][]; bLives: BLife[] };
export type ProbResult = {
  curves: Curve[];
  stats: Dataset;
  points: Dataset;
  rows: ProbRow[];
  // how the probability axis (prob) is drawn: a probability scale, linear (Uniform: 0 – 100 %), or Gamma's quantiles
  // with the percents written at them (`ticks`)
  axis: { prob?: ProbAxis; logData: boolean; ticks?: string };
  warnings: string[];
  // the parameters of every group, a line each (for the box on the figure)
  text: string[];
};

const LINE_RED = '#D62728';
const PCTS = [0.1, 1, 5, 10, 20, 30, 50, 70, 80, 90, 95, 99, 99.9];
const fmt = (v: number) => String(+v.toPrecision(10));

export function probPlot(groups: ProbGroup[], d: ProbSpec, valueName: string): ProbResult | string {
  const warnings: string[] = [];
  const kind = d.kind;
  if (d.params === 'given') {
    const bad = badParams(d.dist, [d.p1, d.p2]);
    if (bad) return bad;
  }
  // the choices that do not fit this kind
  const line = kind === 'pp' ? (d.line === 'none' ? 'none' : 'identity') : kind === 'ecdf' ? (d.line === 'none' ? 'none' : 'dist') : kind === 'prob' && d.line === 'identity' ? 'dist' : d.line;
  const band = d.band === 'none' ? 'none' : kind === 'pp' ? 'dkw' : kind === 'ecdf' ? d.band : 'pointwise';
  const level = Math.min(99.9, Math.max(50, d.level || 95));
  const zc = normInv(1 - (1 - level / 100) / 2);
  const curves: Curve[] = [];
  const rows: ProbRow[] = [];
  const pts: { group: string; x: number; p: number; q: number; z: number; F: number; e: number }[] = [];
  const one = groups.length === 1;
  const colorOf = (j: number) => d.colors?.[j] || PALETTE[(j + 1) % PALETTE.length];
  let axis: ProbResult['axis'] = { logData: kind === 'prob' && LOG_DATA.has(d.dist), ...(kind === 'prob' && PROB_AXIS[d.dist] ? { prob: PROB_AXIS[d.dist] } : {}) };
  const names = [d.kind === 'qq' ? (d.qqAxis === 'standard' ? `${DIST_NAMES[d.dist]} quantiles` : `${DIST_NAMES[d.dist]} quantiles (${valueName})`) : '', valueName];
  const pctName = 'Percent (%)';
  const ecdfName = d.ecdfY === 'count' ? (d.complementary ? 'Count above' : 'Cumulative count') : d.complementary ? (d.ecdfY === 'percent' ? 'Survival 1 − F (%)' : 'Survival 1 − F') : d.ecdfY === 'percent' ? 'Cumulative percent (%)' : 'Cumulative probability';
  const series = (xn: string, yn: string, x: number[], y: number[]) => ({ name: yn, x: column(xn, Float64Array.from(x)), y: column(yn, Float64Array.from(y)) });
  const text: string[] = [];
  const method = d.method ?? 'mle';
  const lives = (d.bLives ?? '')
    .split(/[,;\s]+/)
    .map((s) => Number(s.replace(',', '.')))
    .filter((p) => p > 0 && p < 100);
  groups.forEach((gr, j) => {
    // the values with their status, sorted (a suspension after a failure at the same value)
    let items = gr.values.map((v, i) => ({ v, s: !!gr.susp?.[i] })).filter((q) => Number.isFinite(q.v));
    if (POSITIVE.has(d.dist) && items.some((q) => q.v <= 0)) {
      warnings.push(`${gr.name}: ${items.filter((q) => q.v <= 0).length} value(s) ≤ 0 left out (${DIST_NAMES[d.dist]} is for positive values).`);
      items = items.filter((q) => q.v > 0);
    }
    items.sort((a, b) => a.v - b.v || Number(a.s) - Number(b.s));
    const all = items.map((q) => q.v);
    const susp = items.map((q) => q.s);
    const censored = susp.some(Boolean);
    // the failures: what is plotted
    const x = all.filter((_, i) => !susp[i]);
    const n = x.length;
    if (n < 3) {
      warnings.push(`${gr.name}: fewer than 3 ${censored ? 'failures' : 'values'}, left out.`);
      return;
    }
    if (x[0] === x[n - 1]) {
      warnings.push(`${gr.name}: every value is the same, left out.`);
      return;
    }
    if (censored && d.dist === 'uniform') {
      warnings.push(`${gr.name}: Uniform takes no suspended values — they are left out.`);
      susp.fill(false);
    }
    // the positions of the failures (Johnson's adjusted ranks with suspensions)
    const posAll = adjustedPositions(all, susp, d.positions);
    const pos = censored ? posAll : plotPositions(n, d.positions);
    // a threshold γ (3 parameters): every value less it
    const gamma = d.threshold && POSITIVE.has(d.dist) && d.params === 'fit' ? fitThreshold(d.dist, all, susp, pos, method) : 0;
    const xs = x.map((v) => v - gamma);
    const ss = all.filter((_, i) => susp[i]).map((v) => v - gamma);
    let params: number[];
    if (d.params === 'given') params = [d.p1, d.p2];
    else if (method !== 'mle' && canRegress(d.dist)) params = fitRR(d.dist, xs, pos, method)!;
    else {
      if (method !== 'mle') warnings.push(`${DIST_NAMES[d.dist]}: no rank regression (not straight on any axis) — maximum likelihood.`);
      params = fitMLE(d.dist, xs, ss);
    }
    const bad = badParams(d.dist, params);
    if (bad) {
      warnings.push(`${gr.name}: the fit failed (${bad})`);
      return;
    }
    const D = makeDist(d.dist, params);
    const lin = linFor(kind === 'pp' || kind === 'ecdf' ? 'qq' : kind, D, d.qqAxis);
    const v = pos.map(lin.h);
    const u = xs.map(lin.g);
    const ls = lsq(v, u);
    // the intervals of the parameters and the B lives (Fisher matrix of the likelihood with the suspensions)
    const cov = d.params === 'fit' ? fisherCov(d.dist, params, xs, ss) : null;
    const ci = d.params === 'fit' ? paramCI(d.dist, params, cov, level) : params.map((): [number, number] => [NaN, NaN]);
    const bl = lives.map((p) => ({ p, ...bLife(d.dist, params, gamma, p / 100, cov, level) }));
    const sig = (q: number) => String(+q.toPrecision(4));
    // one group: a line each (parameters, the count, every B life with its interval); several: a line per group
    const pnames = d.dist === 'weibull' ? ['β', 'η'] : PARAM_NAMES[d.dist].map((nm) => nm.replace(/ \(.*\)$/, ''));
    const parts = [
      pnames.map((nm, k) => `${nm} = ${sig(params[k])}`).join(', ') + (gamma ? `, γ = ${sig(gamma)}` : ''),
      censored ? `${n} failed, ${ss.length} suspended` : `n = ${n}`,
      ...bl.map((b) => `B${fmt(b.p)} = ${sig(b.value)}${groups.length === 1 && Number.isFinite(b.lo) ? ` [${sig(b.lo)}, ${sig(b.hi)}]` : ''}`),
    ];
    if (groups.length === 1) text.push(...parts);
    else text.push(`${gr.name}: ${parts.join(', ')}`);
    // the ECDF at every value (ties: the last of them)
    const ecdfAt = x.map((_, i) => {
      let k = i;
      while (k + 1 < n && x[k + 1] === x[i]) k++;
      return (k + 1) / n;
    });
    // the statistics (A² and D: of complete samples only)
    const ad = censored || gamma ? null : d.dist === 'normal' && d.params === 'fit' ? andersonDarling(x) : d.dist === 'lognormal' && d.params === 'fit' ? andersonDarling(x.map(Math.log)) : null;
    let ks = 0;
    xs.forEach((xv, i) => {
      const F = D.cdf(xv);
      ks = Math.max(ks, (i + 1) / n - F, F - i / n);
    });
    if (censored) warnings.push('With suspended values: A² and the KS D are left out (for complete samples).');
    rows.push({ group: gr.name, n: all.length, params, r: ls.r, slope: ls.b, intercept: ls.a, a2: censored ? NaN : ad ? ad.stat : adStat(xs, D.cdf), p: ad ? ad.p : NaN, crit5: d.params === 'fit' && !censored && !gamma ? crit5(d.dist, n) : NaN, ks: censored ? NaN : ks, failures: n, suspended: ss.length, gamma, ci, bLives: bl });
    x.forEach((xv, i) => pts.push({ group: gr.name, x: xv, p: pos[i], q: gamma + D.ppf(pos[i]), z: D.std.ppf(pos[i]), F: D.cdf(xv - gamma), e: censored ? pos[i] : ecdfAt[i] }));
    const color = colorOf(j);
    // the group's own look (else the node's): its points, its line, its band (the line's colour unless chosen)
    const L = d.looks?.[j];
    const lineColor = L?.line?.color || d.lineColor || (one ? LINE_RED : color);
    const lineWidth = L?.line?.width ?? d.lineWidth;
    const lineStyle = curveStyle({ mode: 'line', color: lineColor, lineWidth, dash: L?.line?.dash ?? d.lineDash });
    const bandStyle = curveStyle({ mode: 'line', color: L?.band?.color || lineColor, lineWidth: L?.band?.width ?? Math.max(0.25, lineWidth * 0.75), dash: L?.band?.dash ?? d.bandDash });
    const pointStyle = curveStyle({ mode: 'scatter', color, symbol: L?.symbol ?? d.symbol, symbolSize: L?.symbolSize ?? d.symbolSize, symbolFill: L?.symbolFill ?? d.symbolFill, symbolEdge: 0.75, ...(L?.points === false ? { show: false } : {}) });
    const lineOn = line !== 'none' && L?.line?.show !== false;
    const bandOn = band !== 'none' && L?.band?.show !== false;
    const key = `pp:${j}`;
    const bandLabel = `${fmt(level)} % band${band === 'dkw' ? ' (DKW)' : ''}`;
    const extra = (c: Curve): Curve => (one ? c : { ...c, noLegend: true });
    // the probabilities between the first and the last position, evenly on the logit (dense in the tails)
    const grid = (p0: number, p1: number, m = 121) => {
      const [l0, l1] = [Math.log(p0 / (1 - p0)), Math.log(p1 / (1 - p1))];
      return Array.from({ length: m }, (_, k) => 1 / (1 + Math.exp(-(l0 + ((l1 - l0) * k) / (m - 1)))));
    };
    if (kind === 'qq' || kind === 'prob') {
      // Probability: the probabilities on their axis (in %), or Gamma's quantiles
      const yOf = (p: number) => (kind === 'qq' ? NaN : PROB_AXIS[d.dist] || d.dist === 'uniform' ? 100 * p : lin.h(p));
      const xy = (vv: number, xx: number, p: number): [number, number] => (kind === 'qq' ? [vv, xx] : [xx, yOf(p)]);
      const [xn, yn] = kind === 'qq' ? names : [valueName, pctName];
      const P = x.map((xx, i) => xy(v[i], xx, pos[i]));
      curves.push({ key, label: gr.name, series: series(xn, yn, P.map((q) => q[0]), P.map((q) => q[1])), style: pointStyle });
      if (lineOn) {
        let [a, b] = [ls.a, ls.b];
        const [h1, h3] = [lin.h(0.25), lin.h(0.75)];
        if (line === 'dist') {
          b = (lin.g(D.ppf(0.75)) - lin.g(D.ppf(0.25))) / (h3 - h1);
          a = lin.g(D.ppf(0.25)) - b * h1;
        } else if (line === 'quartiles') {
          const [q1, q3] = [lin.g(percentile(x, 0.25)), lin.g(percentile(x, 0.75))];
          b = (q3 - q1) / (h3 - h1);
          a = q1 - b * h1;
        } else if (line === 'identity') [a, b] = [0, 1];
        const ps = grid(pos[0], pos[n - 1]);
        const L = ps.map((p) => xy(lin.h(p), gamma + lin.gi(a + b * lin.h(p)), p));
        const lineLabel = line === 'dist' ? `${DIST_NAMES[d.dist]} fit` : line === 'lsq' ? 'least squares line' : line === 'quartiles' ? 'quartile line' : 'y = x';
        curves.push(extra({ key: `${key}:line`, label: lineLabel, series: series(xn, yn, L.map((q) => q[0]), L.map((q) => q[1])), style: lineStyle }));
        if (bandOn && kind === 'prob' && cov && line === 'dist') {
          // a probability paper with fitted parameters: the Fisher-matrix bounds of the fit (in time: the B life at
          // every percent and its interval)
          for (const sgn of [1, -1]) {
            const B = ps.map((p) => {
              const b = bLife(d.dist, params, gamma, p, cov, level);
              return xy(lin.h(p), sgn > 0 ? b.hi : b.lo, p);
            });
            curves.push(extra({ key: `${key}:band${sgn > 0 ? 'hi' : 'lo'}`, label: `${fmt(level)} % confidence bounds`, series: series(xn, yn, B.map((q) => q[0]), B.map((q) => q[1])), style: bandStyle, ...(sgn < 0 ? { noLegend: true } : {}) }));
          }
        } else if (bandOn) {
          // the standard error of the order statistic at p, on the line's scale: b·h′(p)·√(p(1 − p)/n)
          const hp = (p: number) => {
            const e = 1e-6 * Math.min(p, 1 - p);
            return (lin.h(p + e) - lin.h(p - e)) / (2 * e);
          };
          for (const sgn of [1, -1]) {
            const B = ps.map((p) => xy(lin.h(p), gamma + lin.gi(a + b * lin.h(p) + sgn * zc * Math.abs(b) * hp(p) * Math.sqrt((p * (1 - p)) / n)), p));
            curves.push(extra({ key: `${key}:band${sgn > 0 ? 'hi' : 'lo'}`, label: bandLabel, series: series(xn, yn, B.map((q) => q[0]), B.map((q) => q[1])), style: bandStyle, ...(sgn < 0 ? { noLegend: true } : {}) }));
          }
        }
      }
      if (kind === 'prob' && d.refLine && (one || j === 0)) {
        const pr = d.dist === 'weibull' ? 1 - Math.exp(-1) : 0.5;
        const at = gamma + D.ppf(pr);
        const low = Math.min(pos[0], 0.01);
        const left = Math.min(x[0], at) * (LOG_DATA.has(d.dist) ? 0.5 : 1) - (LOG_DATA.has(d.dist) ? 0 : 0.05 * (x[n - 1] - x[0]));
        const R = [xy(NaN, left, pr), xy(NaN, at, pr), xy(NaN, at, low)];
        curves.push({ key: `${key}:ref`, label: `${fmt(+(100 * pr).toFixed(1))} %`, noLegend: true, series: series(xn, yn, R.map((q) => q[0]), R.map((q) => q[1])), style: curveStyle({ mode: 'line', color: '#777777', lineWidth: 0.6, dash: 'dash' }) });
      }
      if (kind === 'prob' && !PROB_AXIS[d.dist] && d.dist !== 'uniform') {
        // Gamma: the percents written at their quantiles (of the first group's shape)
        if (!axis.ticks) axis = { ...axis, ticks: PCTS.map((q) => `${fmt(lin.h(q / 100))}=${q}`).join(', ') };
        else if (j > 0) warnings.push('Gamma: the probability axis follows the shape of the first group.');
      }
    } else if (kind === 'pp') {
      const xn = `${DIST_NAMES[d.dist]} probability`;
      const yn = 'Empirical probability';
      curves.push({ key, label: gr.name, series: series(xn, yn, x.map(D.cdf), pos), style: pointStyle });
      if (lineOn && (one || j === 0)) curves.push(extra({ key: `${key}:line`, label: 'y = x', series: series(xn, yn, [0, 1], [0, 1]), style: one ? lineStyle : { ...lineStyle, color: '#000000' } }));
      if (bandOn) {
        const e = Math.sqrt(Math.log(2 / (1 - level / 100)) / (2 * n));
        curves.push(extra({ key: `${key}:bandhi`, label: bandLabel, series: series(xn, yn, [0, 1 - e, 1], [e, 1, 1]), style: bandStyle }));
        curves.push(extra({ key: `${key}:bandlo`, label: bandLabel, series: series(xn, yn, [0, e, 1], [0, 0, 1 - e]), style: bandStyle, noLegend: true }));
      }
    } else if (censored) {
      // with suspensions: Kaplan–Meier (F = 1 − S), its interval (Greenwood, log–log), the suspensions marked +
      const km = kaplanMeier(all, susp, level);
      const yOf = (F: number) => {
        const f = d.complementary ? 1 - F : F;
        return d.ecdfY === 'count' ? all.length * f : d.ecdfY === 'percent' ? 100 * f : f;
      };
      const span = all[all.length - 1] - all[0];
      const x0 = all[0] >= 0 ? Math.max(0, all[0] - 0.04 * span) : all[0] - 0.04 * span;
      const sx = [x0, ...km.t, all[all.length - 1]];
      const sF = [0, ...km.S.map((S) => 1 - S), 1 - km.S[km.S.length - 1]];
      curves.push({ key, label: gr.name, series: series(valueName, ecdfName, sx, sF.map(yOf)), style: curveStyle({ mode: 'step', stepKind: 'hv', color, lineWidth: d.lineWidth }) });
      if (km.censored.length) curves.push({ key: `${key}:susp`, label: 'suspended', noLegend: !one, series: series(valueName, ecdfName, km.censored.map((c) => c.t), km.censored.map((c) => yOf(1 - c.S))), style: curveStyle({ mode: 'scatter', color, symbol: 'plus', symbolSize: d.symbolSize + 1, symbolEdge: 0.8 }) });
      if (lineOn) {
        const lo = POSITIVE.has(d.dist) ? Math.max(gamma, x0) : x0;
        const gx = Array.from({ length: 201 }, (_, k) => lo + ((all[all.length - 1] + 0.04 * span - lo) * k) / 200);
        curves.push(extra({ key: `${key}:line`, label: `${DIST_NAMES[d.dist]} CDF`, series: series(valueName, ecdfName, gx, gx.map((g) => yOf(D.cdf(g - gamma)))), style: lineStyle }));
      }
      if (bandOn) {
        for (const [k2, arr] of [['hi', km.lo], ['lo', km.hi]] as const) {
          const bF = [0, ...arr.map((S) => 1 - S), 1 - arr[arr.length - 1]];
          curves.push(extra({ key: `${key}:band${k2}`, label: `${fmt(level)} % band (Greenwood)`, series: series(valueName, ecdfName, sx, bF.map(yOf)), style: { ...bandStyle, mode: 'step', stepKind: 'hv' }, ...(k2 === 'lo' ? { noLegend: true } : {}) }));
        }
      }
    } else {
      // ECDF: the distinct values and the share at or below each
      const ux: number[] = [];
      const uF: number[] = [];
      x.forEach((xv, i) => {
        if (i + 1 < n && x[i + 1] === xv) return;
        ux.push(xv);
        uF.push(ecdfAt[i]);
      });
      const yOf = (F: number) => {
        const f = d.complementary ? 1 - F : F;
        return d.ecdfY === 'count' ? n * f : d.ecdfY === 'percent' ? 100 * f : f;
      };
      const span = x[n - 1] - x[0];
      const pad = 0.04 * span;
      const steps = d.ecdfLook !== 'points';
      // the steps: from 0 before the first value (not below 0 when no value is), up at every value, to 1 past the last
      const sx = steps ? [x[0] >= 0 ? Math.max(0, x[0] - pad) : x[0] - pad, ...ux, x[n - 1] + pad] : ux;
      const sF = steps ? [0, ...uF, 1] : uF;
      const stepStyle = curveStyle({ mode: steps ? 'step' : 'scatter', stepKind: 'hv', color, lineWidth: d.lineWidth, symbol: d.symbol, symbolSize: d.symbolSize, symbolFill: d.symbolFill, symbolEdge: 0.75 });
      if (d.ecdfLook === 'both') {
        curves.push({ key, label: gr.name, series: series(valueName, ecdfName, sx, sF.map(yOf)), style: stepStyle });
        curves.push({ key: `${key}:pts`, label: gr.name, noLegend: true, series: series(valueName, ecdfName, ux, uF.map(yOf)), style: pointStyle });
      } else curves.push({ key, label: gr.name, series: series(valueName, ecdfName, sx, sF.map(yOf)), style: stepStyle });
      if (lineOn) {
        const lo = POSITIVE.has(d.dist) ? Math.max(0, x[0] - pad) : x[0] - pad;
        const gx = Array.from({ length: 201 }, (_, k) => lo + ((x[n - 1] + pad - lo) * k) / 200);
        curves.push(extra({ key: `${key}:line`, label: `${DIST_NAMES[d.dist]} CDF`, series: series(valueName, ecdfName, gx, gx.map((g) => yOf(D.cdf(g - gamma)))), style: lineStyle }));
      }
      if (bandOn) {
        const e = Math.sqrt(Math.log(2 / (1 - level / 100)) / (2 * n));
        const half = (F: number) => (band === 'dkw' ? e : zc * Math.sqrt((F * (1 - F)) / n));
        const bx = [x[0] - pad, ...ux, x[n - 1] + pad];
        const bF = [0, ...uF, 1];
        for (const sgn of [1, -1])
          curves.push(extra({ key: `${key}:band${sgn > 0 ? 'hi' : 'lo'}`, label: bandLabel, series: series(valueName, ecdfName, bx, bF.map((F) => yOf(Math.min(1, Math.max(0, F + sgn * half(F)))))), style: { ...bandStyle, mode: 'step', stepKind: 'hv' }, ...(sgn < 0 ? { noLegend: true } : {}) }));
      }
    }
  });
  if (!rows.length) return warnings.length ? warnings.join(' ') : 'No values: choose the columns (or the values and their groups).';
  // the axes exchanged: every curve's X and Y (steps then go up first)
  if (d.swap)
    for (const c of curves) {
      c.series = { ...c.series, name: c.series.x.name, x: c.series.y, y: c.series.x };
      if (c.style.mode === 'step') c.style = { ...c.style, stepKind: 'vh' };
    }
  const np = maxOf(rows.map((r) => r.params.length));
  const num = (name: string, f: (r: ProbRow) => number): Column => ({ ...column(name, Float64Array.from(rows, f)), role: 'none' });
  const label = (name: string, t: string[]): Column => ({ ...column(name, Float64Array.from(t, () => NaN), t), role: 'label' });
  const stats: Dataset = {
    name: 'probability plot',
    columns: [
      label('group', rows.map((r) => r.group)),
      num('N', (r) => r.n),
      ...(rows.some((r) => r.suspended) ? [num('failures', (r) => r.failures), num('suspended', (r) => r.suspended)] : []),
      ...PARAM_NAMES[d.dist].slice(0, np).flatMap((nm, k) => [num(nm, (r) => r.params[k]), ...(d.params === 'fit' ? [num(`${nm} ${fmt(level)} % lower`, (r) => r.ci[k]?.[0] ?? NaN), num(`${nm} ${fmt(level)} % upper`, (r) => r.ci[k]?.[1] ?? NaN)] : [])]),
      ...(rows.some((r) => r.gamma) ? [num('γ (threshold)', (r) => r.gamma)] : []),
      ...lives.flatMap((p, k) => [num(`B${fmt(p)}`, (r) => r.bLives[k].value), num(`B${fmt(p)} ${fmt(level)} % lower`, (r) => r.bLives[k].lo), num(`B${fmt(p)} ${fmt(level)} % upper`, (r) => r.bLives[k].hi)]),
      label('method', rows.map(() => (d.params === 'given' ? 'given' : method === 'mle' || !canRegress(d.dist) ? 'maximum likelihood' : method === 'rrx' ? 'rank regression X on Y' : 'rank regression Y on X'))),
      num('r (PPCC)', (r) => r.r),
      num('LS slope', (r) => r.slope),
      num('LS intercept', (r) => r.intercept),
      num('A²', (r) => r.a2),
      ...(rows.some((r) => Number.isFinite(r.p)) ? [num('p (A²)', (r) => r.p)] : []),
      ...(rows.some((r) => Number.isFinite(r.crit5)) ? [num('A² 5 % critical', (r) => r.crit5)] : []),
      num('KS D', (r) => r.ks),
    ],
  };
  const points: Dataset = {
    name: 'probability points',
    columns: [
      label('group', pts.map((q) => q.group)),
      { ...column(valueName, Float64Array.from(pts, (q) => q.x)), role: 'none' },
      { ...column('position', Float64Array.from(pts, (q) => q.p)), role: 'none' },
      { ...column('theoretical quantile', Float64Array.from(pts, (q) => q.q)), role: 'none' },
      { ...column('standard quantile', Float64Array.from(pts, (q) => q.z)), role: 'none' },
      { ...column('theoretical CDF', Float64Array.from(pts, (q) => q.F)), role: 'none' },
      { ...column('ECDF', Float64Array.from(pts, (q) => q.e)), role: 'none' },
    ],
  };
  return { curves, stats, points, rows, axis, warnings: [...new Set(warnings)], text };
}
