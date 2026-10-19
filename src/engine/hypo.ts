// Statistical tests: normality and outliers, t-tests and variances, ANOVA (one-way, Welch,
// two-way, repeated measures) with post-hoc comparisons, nonparametric tests, correlations. Checked against reference
// values (npm run check). Every test takes plain arrays of finite numbers.
import { binomTest2, chi2Sf, fCdf, fSf, lgamma, normCdf, normInv, normSf, ptukey, tCdf, tInv, tP2 } from './dist.ts';
import { maxOf, minOf } from './minmax.ts';

export type Alt = 'two-sided' | 'less' | 'greater';
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const mean = (a: number[]) => sum(a) / a.length;
export function variance(a: number[]): number {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
}
export const sd = (a: number[]) => Math.sqrt(variance(a));
export function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
// the p of a statistic with a symmetric distribution, for the alternative asked (cdf: P(T ≤ t))
const pAlt = (cdf: number, sf: number, alt: Alt) => (alt === 'less' ? cdf : alt === 'greater' ? sf : Math.min(1, 2 * Math.min(cdf, sf)));
const pT = (t: number, df: number, alt: Alt) => pAlt(tCdf(t, df), tCdf(-t, df), alt);

// ranks (ties: the mean rank) and Σ(t³ − t) of the ties
export function ranks(a: number[]): { r: number[]; ties: number } {
  const o = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Array<number>(a.length);
  let ties = 0;
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && a[o[j + 1]] === a[o[i]]) j++;
    const rk = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[o[k]] = rk;
    const t = j - i + 1;
    ties += t * t * t - t;
    i = j + 1;
  }
  return { r, ties };
}

// p-values corrected for multiple comparisons
export function adjust(p: number[], how: 'holm' | 'bonferroni' | 'none'): number[] {
  const m = p.length;
  if (how === 'none') return p.slice();
  if (how === 'bonferroni') return p.map((v) => Math.min(1, v * m));
  const o = p.map((_, i) => i).sort((i, j) => p[i] - p[j]);
  const out = new Array<number>(m);
  let run = 0;
  o.forEach((i, k) => {
    run = Math.max(run, Math.min(1, (m - k) * p[i]));
    out[i] = run;
  });
  return out;
}

// ---- descriptive, per group ----
export type GroupStats = { name: string; n: number; mean: number; sd: number; se: number; lo: number; hi: number; median: number; min: number; max: number };
export function groupStats(name: string, a: number[], level = 0.95): GroupStats {
  const n = a.length;
  const m = mean(a);
  const s = n > 1 ? sd(a) : NaN;
  const se = s / Math.sqrt(n);
  const t = n > 1 ? tInv(0.5 + level / 2, n - 1) : NaN;
  return { name, n, mean: m, sd: s, se, lo: m - t * se, hi: m + t * se, median: median(a), min: minOf(a), max: maxOf(a) };
}

// ---- normality ----
export type TestResult = { test: string; stat: number; statName: string; df?: number; df2?: number; p: number; note?: string };

// Shapiro–Wilk, from Royston's approximations (P. Royston, Statistics and Computing 2, 117 (1992); Applied Statistics 44,
// 547 (1995)). The weights: m_i = Φ⁻¹((i − 3/8) / (n + 1/4)), the two outermost corrected by polynomials in u = 1/√n, the
// others m_i / √φ; W = (Σ a_i x_(i))² / Σ (x_i − x̄)². Its p: n = 3 exactly, (6/π)(asin √W − asin √(3/4)); 4 ≤ n ≤ 11:
// −ln(γ − ln(1 − W)) normal, γ = 0.459 n − 2.273; n ≥ 12: ln(1 − W) normal — their means and SDs polynomials in n or
// ln n. 3 ≤ n ≤ 5000.
export function shapiroWilk(xs: number[]): TestResult {
  const res = (stat: number, p: number, note?: string): TestResult => ({ test: 'Shapiro–Wilk', statName: 'W', stat, p, ...(note ? { note } : {}) });
  const x = [...xs].sort((p, q) => p - q);
  const n = x.length;
  if (n < 3) return res(NaN, NaN, 'needs 3 values or more');
  if (x[n - 1] - x[0] < 1e-19 * Math.max(1, Math.abs(x[0]))) return res(NaN, NaN, 'all values equal');
  // a polynomial c0 + c1 v + c2 v² + …
  const poly = (c: number[], v: number) => c.reduceRight((acc, ci) => acc * v + ci, 0);
  // the weights of the upper half (the lower half: the same, negative)
  const half = Math.floor(n / 2);
  const w = new Array<number>(half).fill(0); // w[k]: the weight of x_(n−k) (and −w[k] of x_(k+1))
  if (n === 3) w[0] = Math.SQRT1_2;
  else {
    const m = Array.from({ length: half }, (_, k) => -normInv((k + 1 - 0.375) / (n + 0.25))); // m of x_(n−k), > 0
    const mm = 2 * m.reduce((t, v) => t + v * v, 0);
    const u = 1 / Math.sqrt(n);
    const an = m[0] / Math.sqrt(mm) + poly([0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], u);
    if (n > 5) {
      const an1 = m[1] / Math.sqrt(mm) + poly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], u);
      const phi = (mm - 2 * m[0] ** 2 - 2 * m[1] ** 2) / (1 - 2 * an ** 2 - 2 * an1 ** 2);
      w[0] = an;
      w[1] = an1;
      for (let k = 2; k < half; k++) w[k] = m[k] / Math.sqrt(phi);
    } else {
      const phi = (mm - 2 * m[0] ** 2) / (1 - 2 * an ** 2);
      w[0] = an;
      for (let k = 1; k < half; k++) w[k] = m[k] / Math.sqrt(phi);
    }
  }
  // W: the linear combination of the ordered values, squared, over their sum of squares (centred, scaled by the range)
  const range = x[n - 1] - x[0];
  const mean = x.reduce((t, v) => t + v, 0) / n;
  let b = 0;
  for (let k = 0; k < half; k++) b += w[k] * (x[n - 1 - k] - x[k]);
  const ss = x.reduce((t, v) => t + ((v - mean) / range) ** 2, 0);
  const W = Math.min(1, (b / range) ** 2 / ss);
  if (n === 3) return res(W, Math.min(1, Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75))))));
  const ln1w = Math.log1p(-W);
  let z: number;
  if (n <= 11) {
    const gamma = 0.459 * n - 2.273;
    if (ln1w >= gamma) return res(W, 1e-99);
    z = (-Math.log(gamma - ln1w) - poly([0.544, -0.39978, 0.025054, -6.714e-4], n)) / Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
  } else {
    const ln = Math.log(n);
    z = (ln1w - poly([-1.5861, -0.31082, -0.083751, 0.0038915], ln)) / Math.exp(poly([-0.4803, -0.082676, 0.0030302], ln));
  }
  return res(W, normSf(z), n > 5000 ? 'n > 5000: the p is approximate' : undefined);
}

// the values standardized with their mean and SD (n − 1), sorted
const zSorted = (a: number[]) => {
  const m = mean(a);
  const s = sd(a);
  return a.map((v) => (v - m) / s).sort((p, q) => p - q);
};
// Anderson–Darling (A², and A*² = A²(1 + 0.75/n + 2.25/n²) with the p of D'Agostino & Stephens 1986)
export function andersonDarling(a: number[]): TestResult {
  const n = a.length;
  if (n < 8) return { test: 'Anderson–Darling', statName: 'A²', stat: NaN, p: NaN, note: 'needs 8 values or more' };
  const z = zSorted(a);
  let s = 0;
  for (let i = 0; i < n; i++) s += (2 * i + 1) * (Math.log(normCdf(z[i])) + Math.log(normSf(z[n - 1 - i])));
  const A2 = -n - s / n;
  const A = A2 * (1 + 0.75 / n + 2.25 / (n * n));
  const p = A >= 0.6 ? Math.exp(1.2937 - 5.709 * A + 0.0186 * A * A) : A >= 0.34 ? Math.exp(0.9177 - 4.279 * A - 1.38 * A * A) : A >= 0.2 ? 1 - Math.exp(-8.318 + 42.796 * A - 59.938 * A * A) : 1 - Math.exp(-13.436 + 101.14 * A - 223.73 * A * A);
  return { test: 'Anderson–Darling', statName: 'A²', stat: A2, p: Math.min(1, Math.max(0, p)) };
}
// Kolmogorov–Smirnov with the mean and SD estimated (Lilliefors; the p of Dallal & Wilkinson 1986)
export function lilliefors(a: number[]): TestResult {
  const n = a.length;
  if (n < 5) return { test: 'Kolmogorov–Smirnov (Lilliefors)', statName: 'D', stat: NaN, p: NaN, note: 'needs 5 values or more' };
  const z = zSorted(a);
  let D = 0;
  z.forEach((v, i) => {
    const F = normCdf(v);
    D = Math.max(D, (i + 1) / n - F, F - i / n);
  });
  const [Kd, nd] = n <= 100 ? [D, n] : [D * (n / 100) ** 0.49, 100];
  let p = Math.exp(-7.01256 * Kd * Kd * (nd + 2.78019) + 2.99587 * Kd * Math.sqrt(nd + 2.78019) - 0.122119 + 0.974598 / Math.sqrt(nd) + 1.67997 / nd);
  if (p > 0.1) {
    const K = (Math.sqrt(n) - 0.01 + 0.85 / Math.sqrt(n)) * D;
    p = K <= 0.302 ? 1 : K <= 0.5 ? 2.76773 - 19.828315 * K + 80.709644 * K ** 2 - 138.55152 * K ** 3 + 81.218052 * K ** 4 : K <= 0.9 ? -4.901232 + 40.662806 * K - 97.490286 * K ** 2 + 94.029866 * K ** 3 - 32.355711 * K ** 4 : K <= 1.31 ? 6.198765 - 19.558097 * K + 23.186922 * K ** 2 - 12.234627 * K ** 3 + 2.423045 * K ** 4 : 0;
  }
  return { test: 'Kolmogorov–Smirnov (Lilliefors)', statName: 'D', stat: D, p: Math.min(1, Math.max(0, p)) };
}
// D'Agostino–Pearson K² (the skewness and kurtosis tests together)
export function dagostino(a: number[]): TestResult {
  const n = a.length;
  if (n < 8) return { test: "D'Agostino–Pearson", statName: 'K²', stat: NaN, p: NaN, note: 'needs 8 values or more' };
  const m = mean(a);
  const m2 = sum(a.map((v) => (v - m) ** 2)) / n;
  const m3 = sum(a.map((v) => (v - m) ** 3)) / n;
  const m4 = sum(a.map((v) => (v - m) ** 4)) / n;
  const b2s = m3 / m2 ** 1.5;
  let y = b2s * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(0.5 * Math.log(W2));
  const alpha = Math.sqrt(2 / (W2 - 1));
  if (y === 0) y = 1;
  const Zs = delta * Math.log(y / alpha + Math.sqrt((y / alpha) ** 2 + 1));
  const b2 = m4 / (m2 * m2);
  const E = (3 * (n - 1)) / (n + 1);
  const varb2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5));
  const xk = (b2 - E) / Math.sqrt(varb2);
  const sb1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) * Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / sb1) * (2 / sb1 + Math.sqrt(1 + 4 / (sb1 * sb1)));
  const t1 = 1 - 2 / (9 * A);
  const den = 1 + xk * Math.sqrt(2 / (A - 4));
  const t2 = Math.sign(den) * Math.cbrt((1 - 2 / A) / Math.abs(den));
  const Zk = (t1 - t2) / Math.sqrt(2 / (9 * A));
  const K2 = Zs * Zs + Zk * Zk;
  return { test: "D'Agostino–Pearson", statName: 'K²', stat: K2, df: 2, p: chi2Sf(K2, 2), ...(n < 20 ? { note: 'n < 20: the kurtosis part is approximate' } : {}) };
}

// ---- outliers ----
export type Outlier = { test: string; index: number; value: number; stat: number; p: number; crit?: number; outlier: boolean };
// Grubbs (the value farthest from the mean; two-sided)
export function grubbs(a: number[], alpha = 0.05): Outlier | null {
  const n = a.length;
  if (n < 3) return null;
  const m = mean(a);
  const s = sd(a);
  let k = 0;
  a.forEach((v, i) => Math.abs(v - m) > Math.abs(a[k] - m) && (k = i));
  const G = Math.abs(a[k] - m) / s;
  const t2 = (n * (n - 2) * G * G) / ((n - 1) ** 2 - n * G * G);
  const p = t2 > 0 ? Math.min(1, 2 * n * tCdf(-Math.sqrt(t2), n - 2)) : 1;
  const tc = tInv(1 - alpha / (2 * n), n - 2);
  const crit = ((n - 1) / Math.sqrt(n)) * Math.sqrt((tc * tc) / (n - 2 + tc * tc));
  return { test: 'Grubbs', index: k, value: a[k], stat: G, p, crit, outlier: G > crit };
}
// Dixon's Q (r10 = gap / range; 3 ≤ n ≤ 10; critical values at 90 %, 95 %, 99 %, Rorabacher 1991)
const DIXON: Record<number, [number, number, number]> = { 3: [0.941, 0.97, 0.994], 4: [0.765, 0.829, 0.926], 5: [0.642, 0.71, 0.821], 6: [0.56, 0.625, 0.74], 7: [0.507, 0.568, 0.68], 8: [0.468, 0.526, 0.634], 9: [0.437, 0.493, 0.598], 10: [0.412, 0.466, 0.568] };
export function dixonQ(a: number[], alpha = 0.05): Outlier | null {
  const n = a.length;
  if (n < 3 || n > 10) return null;
  const o = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
  const range = a[o[n - 1]] - a[o[0]];
  if (!(range > 0)) return null;
  const lo = (a[o[1]] - a[o[0]]) / range;
  const hi = (a[o[n - 1]] - a[o[n - 2]]) / range;
  const [Q, k] = hi >= lo ? [hi, o[n - 1]] : [lo, o[0]];
  const crit = DIXON[n][alpha <= 0.01 ? 2 : alpha <= 0.05 ? 1 : 0];
  return { test: 'Dixon Q', index: k, value: a[k], stat: Q, p: NaN, crit, outlier: Q > crit };
}

// ---- t-tests and variances ----
export type TTest = TestResult & { diff: number; lo: number; hi: number; d: number };
function tResult(test: string, t: number, df: number, diff: number, se: number, d: number, alt: Alt, level: number): TTest {
  const q = tInv(alt === 'two-sided' ? 0.5 + level / 2 : level, df);
  const lo = alt === 'less' ? -Infinity : diff - q * se;
  const hi = alt === 'greater' ? Infinity : diff + q * se;
  return { test, statName: 't', stat: t, df, p: pT(t, df, alt), diff, lo, hi, d };
}
export function tOne(a: number[], mu: number, alt: Alt = 'two-sided', level = 0.95): TTest {
  const n = a.length;
  const s = sd(a);
  const diff = mean(a) - mu;
  return tResult('One-sample t', diff / (s / Math.sqrt(n)), n - 1, diff, s / Math.sqrt(n), diff / s, alt, level);
}
export function tTwo(a: number[], b: number[], equalVar: boolean, alt: Alt = 'two-sided', level = 0.95): TTest {
  const [n1, n2] = [a.length, b.length];
  const [v1, v2] = [variance(a), variance(b)];
  const diff = mean(a) - mean(b);
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  if (equalVar) {
    const se = sp * Math.sqrt(1 / n1 + 1 / n2);
    return tResult('Two-sample t (equal variances)', diff / se, n1 + n2 - 2, diff, se, diff / sp, alt, level);
  }
  const [q1, q2] = [v1 / n1, v2 / n2];
  const se = Math.sqrt(q1 + q2);
  const df = (q1 + q2) ** 2 / (q1 * q1 / (n1 - 1) + (q2 * q2) / (n2 - 1));
  return tResult('Welch t (unequal variances)', diff / se, df, diff, se, diff / sp, alt, level);
}
export function tPaired(a: number[], b: number[], alt: Alt = 'two-sided', level = 0.95): TTest {
  const d = a.map((v, i) => v - b[i]);
  const r = tOne(d, 0, alt, level);
  return { ...r, test: 'Paired t' };
}
export function fTest(a: number[], b: number[]): TestResult {
  const F = variance(a) / variance(b);
  const [d1, d2] = [a.length - 1, b.length - 1];
  return { test: 'F test (two variances)', statName: 'F', stat: F, df: d1, df2: d2, p: Math.min(1, 2 * Math.min(fCdf(F, d1, d2), fSf(F, d1, d2))) };
}
// Levene (center: mean), or Brown–Forsythe (center: median)
export function levene(groups: number[][], center: 'mean' | 'median' = 'median'): TestResult {
  const z = groups.map((g) => {
    const c = center === 'mean' ? mean(g) : median(g);
    return g.map((v) => Math.abs(v - c));
  });
  const r = oneWay(z);
  return { test: center === 'mean' ? 'Levene (mean)' : 'Brown–Forsythe (Levene, median)', statName: 'F', stat: r.F, df: r.df1, df2: r.df2, p: r.p };
}
export function bartlett(groups: number[][]): TestResult {
  const k = groups.length;
  const ns = groups.map((g) => g.length);
  const N = sum(ns);
  const vs = groups.map(variance);
  const sp = sum(vs.map((v, i) => (ns[i] - 1) * v)) / (N - k);
  const num = (N - k) * Math.log(sp) - sum(vs.map((v, i) => (ns[i] - 1) * Math.log(v)));
  const den = 1 + (1 / (3 * (k - 1))) * (sum(ns.map((n) => 1 / (n - 1))) - 1 / (N - k));
  const T = num / den;
  return { test: 'Bartlett', statName: 'χ²', stat: T, df: k - 1, p: chi2Sf(T, k - 1) };
}

// ---- ANOVA ----
export type OneWay = { F: number; df1: number; df2: number; p: number; ssb: number; ssw: number; mse: number; eta2: number; omega2: number };
export function oneWay(groups: number[][]): OneWay {
  const all = groups.flat();
  const N = all.length;
  const k = groups.length;
  const gm = mean(all);
  const ssb = sum(groups.map((g) => g.length * (mean(g) - gm) ** 2));
  const ssw = sum(groups.map((g) => {
    const m = mean(g);
    return sum(g.map((v) => (v - m) ** 2));
  }));
  const [df1, df2] = [k - 1, N - k];
  const mse = ssw / df2;
  const F = ssb / df1 / mse;
  const sst = ssb + ssw;
  return { F, df1, df2, p: fSf(F, df1, df2), ssb, ssw, mse, eta2: ssb / sst, omega2: (ssb - df1 * mse) / (sst + mse) };
}
// Welch's ANOVA (unequal variances)
export function welchAnova(groups: number[][]): { F: number; df1: number; df2: number; p: number } {
  const k = groups.length;
  const w = groups.map((g) => g.length / variance(g));
  const W = sum(w);
  const xw = sum(groups.map((g, i) => w[i] * mean(g))) / W;
  const A = sum(groups.map((g, i) => w[i] * (mean(g) - xw) ** 2)) / (k - 1);
  const tmp = sum(groups.map((g, i) => (1 - w[i] / W) ** 2 / (g.length - 1)));
  const B = 1 + ((2 * (k - 2)) / (k * k - 1)) * tmp;
  const F = A / B;
  const df2 = (k * k - 1) / (3 * tmp);
  return { F, df1: k - 1, df2, p: fSf(F, k - 1, df2) };
}

// the q with P(Q ≤ q) = p (the studentized range): a bracket found by doubling, then the false position kept from
// stalling (the Illinois variant: the end that stays has its value halved) — a few evaluations instead of a bisection's
export function qtukey(p: number, k: number, df: number): number {
  let [lo, hi] = [0, 1];
  let fhi = ptukey(hi, k, df) - p;
  while (fhi < 0 && hi < 1e6) {
    lo = hi;
    hi *= 2;
    fhi = ptukey(hi, k, df) - p;
  }
  let flo = ptukey(lo, k, df) - p;
  let side = 0;
  for (let i = 0; i < 100; i++) {
    const x = (lo * fhi - hi * flo) / (fhi - flo);
    const fx = ptukey(x, k, df) - p;
    if (Math.abs(fx) < 1e-14 || hi - lo < 1e-12 * Math.max(1, x)) return x;
    if (fx < 0) {
      [lo, flo] = [x, fx];
      if (side === -1) fhi /= 2;
      side = -1;
    } else {
      [hi, fhi] = [x, fx];
      if (side === 1) flo /= 2;
      side = 1;
    }
  }
  return (lo + hi) / 2;
}
export type PostHocMethod = 'tukey' | 'bonferroni' | 'holm' | 'scheffe' | 'lsd' | 'games-howell';
export type Pair = { a: number; b: number; diff: number; se: number; stat: number; p: number; lo: number; hi: number };
// all pairs of groups: the difference of the means, its SE, the statistic, the p (adjusted by the method) and the CI
export function postHoc(groups: number[][], method: PostHocMethod, mse: number, dfE: number, level = 0.95): Pair[] {
  const k = groups.length;
  const ms = groups.map(mean);
  const ns = groups.map((g) => g.length);
  const vs = groups.map(variance);
  const out: Pair[] = [];
  for (let i = 0; i < k; i++)
    for (let j = i + 1; j < k; j++) {
      const diff = ms[i] - ms[j];
      if (method === 'tukey') {
        const se = Math.sqrt((mse / 2) * (1 / ns[i] + 1 / ns[j]));
        const q = Math.abs(diff) / se;
        const qc = qtukey(level, k, dfE);
        out.push({ a: i, b: j, diff, se: se * Math.SQRT2, stat: q, p: 1 - ptukey(q, k, dfE), lo: diff - qc * se, hi: diff + qc * se });
      } else if (method === 'games-howell') {
        const [q1, q2] = [vs[i] / ns[i], vs[j] / ns[j]];
        const se = Math.sqrt((q1 + q2) / 2);
        const df = (q1 + q2) ** 2 / (q1 * q1 / (ns[i] - 1) + (q2 * q2) / (ns[j] - 1));
        const q = Math.abs(diff) / se;
        const qc = qtukey(level, k, df);
        out.push({ a: i, b: j, diff, se: se * Math.SQRT2, stat: q, p: 1 - ptukey(q, k, df), lo: diff - qc * se, hi: diff + qc * se });
      } else if (method === 'scheffe') {
        const se = Math.sqrt(mse * (1 / ns[i] + 1 / ns[j]));
        const F = (diff * diff) / (se * se) / (k - 1);
        const crit = Math.sqrt((k - 1) * fInv(level, k - 1, dfE));
        out.push({ a: i, b: j, diff, se, stat: F, p: fSf(F, k - 1, dfE), lo: diff - crit * se, hi: diff + crit * se });
      } else {
        const se = Math.sqrt(mse * (1 / ns[i] + 1 / ns[j]));
        const t = diff / se;
        out.push({ a: i, b: j, diff, se, stat: t, p: tP2(t, dfE), lo: NaN, hi: NaN });
      }
    }
  if (method === 'bonferroni' || method === 'holm' || method === 'lsd') {
    const m = out.length;
    const adj = adjust(out.map((q) => q.p), method === 'lsd' ? 'none' : method);
    // the intervals: Bonferroni (and Holm, conservatively) at level 1 − α/m, LSD unadjusted
    const tc = tInv(1 - (1 - level) / (2 * (method === 'lsd' ? 1 : m)), dfE);
    out.forEach((q, i) => {
      q.p = adj[i];
      q.lo = q.diff - tc * q.se;
      q.hi = q.diff + tc * q.se;
    });
  }
  return out;
}
function fInv(p: number, d1: number, d2: number): number {
  let [lo, hi] = [0, 1];
  while (fCdf(hi, d1, d2) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (fCdf(mid, d1, d2) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// least squares: the residual sum of squares of y on the columns of X (Householder QR)
function rss(X: number[][], y: number[]): number {
  const n = y.length;
  const p = X[0]?.length ?? 0;
  const A = X.map((r) => r.slice());
  const b = y.slice();
  for (let j = 0; j < p; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i][j] * A[i][j];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) continue;
    const s = A[j][j] > 0 ? -norm : norm;
    const v = new Array<number>(n).fill(0);
    v[j] = A[j][j] - s;
    for (let i = j + 1; i < n; i++) v[i] = A[i][j];
    const vv = v.reduce((q, x) => q + x * x, 0);
    if (vv < 1e-300) continue;
    for (let c = j; c < p; c++) {
      let d = 0;
      for (let i = j; i < n; i++) d += v[i] * A[i][c];
      const f = (2 * d) / vv;
      for (let i = j; i < n; i++) A[i][c] -= f * v[i];
    }
    let d = 0;
    for (let i = j; i < n; i++) d += v[i] * b[i];
    const f = (2 * d) / vv;
    for (let i = j; i < n; i++) b[i] -= f * v[i];
  }
  // the rank: the columns whose diagonal is not ~0
  let r = 0;
  for (let j = 0; j < p; j++) if (Math.abs(A[j]?.[j] ?? 0) > 1e-9) r++;
  let s = 0;
  for (let i = r; i < n; i++) s += b[i] * b[i];
  return s;
}
// Two-way ANOVA with interaction, Type III sums of squares (sum-to-zero coding, unbalanced designs too)
export type AnovaRow = { source: string; ss: number; df: number; ms: number; F: number; p: number; eta2p: number };
export function twoWay(y: number[], fa: number[], fb: number[], na: number, nb: number): { rows: AnovaRow[]; mse: number; dfE: number; empty: number } {
  const N = y.length;
  const code = (lvl: number, n: number) => Array.from({ length: n - 1 }, (_, j) => (lvl === j ? 1 : lvl === n - 1 ? -1 : 0));
  const A = fa.map((l) => code(l, na));
  const B = fb.map((l) => code(l, nb));
  const AB = A.map((ra, i) => ra.flatMap((u) => B[i].map((v) => u * v)));
  const design = (useA: boolean, useB: boolean, useAB: boolean) => y.map((_, i) => [1, ...(useA ? A[i] : []), ...(useB ? B[i] : []), ...(useAB ? AB[i] : [])]);
  const cells = new Set(fa.map((a, i) => `${a}|${fb[i]}`)).size;
  const sseFull = rss(design(true, true, true), y);
  const dfE = N - cells;
  const mse = sseFull / dfE;
  const row = (source: string, ss: number, df: number): AnovaRow => {
    const ms = ss / df;
    const F = ms / mse;
    return { source, ss, df, ms, F, p: fSf(F, df, dfE), eta2p: ss / (ss + sseFull) };
  };
  const ssA = rss(design(false, true, true), y) - sseFull;
  const ssB = rss(design(true, false, true), y) - sseFull;
  const ssAB = rss(design(true, true, false), y) - sseFull;
  const gm = mean(y);
  const sst = sum(y.map((v) => (v - gm) ** 2));
  return {
    rows: [row('A', ssA, na - 1), row('B', ssB, nb - 1), row('A × B', ssAB, (na - 1) * (nb - 1)), { source: 'Error', ss: sseFull, df: dfE, ms: mse, F: NaN, p: NaN, eta2p: NaN }, { source: 'Total (corrected)', ss: sst, df: N - 1, ms: NaN, F: NaN, p: NaN, eta2p: NaN }],
    mse,
    dfE,
    empty: na * nb - cells,
  };
}

// One-way repeated measures: rows = subjects, columns = conditions (complete rows); Mauchly's test of sphericity and
// the Greenhouse–Geisser and Huynh–Feldt corrections
export function repeated(m: number[][]): { rows: AnovaRow[]; mse: number; dfE: number; mauchly: TestResult; gg: number; hf: number; pGG: number; pHF: number } {
  const n = m.length;
  const k = m[0].length;
  const gm = mean(m.flat());
  const cm = Array.from({ length: k }, (_, j) => mean(m.map((r) => r[j])));
  const rm = m.map(mean);
  const ssC = n * sum(cm.map((v) => (v - gm) ** 2));
  const ssS = k * sum(rm.map((v) => (v - gm) ** 2));
  const ssT = sum(m.flat().map((v) => (v - gm) ** 2));
  const ssE = ssT - ssC - ssS;
  const [df1, dfE] = [k - 1, (n - 1) * (k - 1)];
  const mse = ssE / dfE;
  const F = ssC / df1 / mse;
  // sphericity: orthonormal contrasts (Helmert), the covariance of the transformed data
  const C: number[][] = Array.from({ length: k - 1 }, (_, j) => {
    const v = Array.from({ length: k }, (_, i) => (i <= j ? 1 : i === j + 1 ? -(j + 1) : 0));
    const nrm = Math.sqrt(sum(v.map((x) => x * x)));
    return v.map((x) => x / nrm);
  });
  const Y = m.map((r) => C.map((c) => sum(c.map((x, i) => x * r[i]))));
  const p = k - 1;
  const ym = Array.from({ length: p }, (_, j) => mean(Y.map((r) => r[j])));
  const S = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => sum(Y.map((r) => (r[a] - ym[a]) * (r[b] - ym[b]))) / (n - 1)));
  const tr = sum(S.map((r, i) => r[i]));
  const tr2 = sum(S.map((r, a) => sum(r.map((v, b) => v * S[b][a]))));
  const W = det(S) / (tr / p) ** p;
  const f = 1 - (2 * p * p + p + 2) / (6 * p * (n - 1));
  const chi = -(n - 1) * f * Math.log(W);
  const dfM = (p * (p + 1)) / 2 - 1;
  const gg = Math.min(1, (tr * tr) / (p * tr2));
  const hf = Math.min(1, (n * p * gg - 2) / (p * (n - 1 - p * gg)));
  const mauchly: TestResult = k > 2 ? { test: 'Mauchly (sphericity)', statName: 'W', stat: W, df: dfM, p: chi2Sf(chi, dfM) } : { test: 'Mauchly (sphericity)', statName: 'W', stat: 1, p: NaN, note: 'two conditions: always spherical' };
  const pOf = (e: number) => fSf(F, df1 * e, dfE * e);
  return {
    rows: [
      { source: 'Conditions', ss: ssC, df: df1, ms: ssC / df1, F, p: fSf(F, df1, dfE), eta2p: ssC / (ssC + ssE) },
      { source: 'Subjects', ss: ssS, df: n - 1, ms: ssS / (n - 1), F: NaN, p: NaN, eta2p: NaN },
      { source: 'Error', ss: ssE, df: dfE, ms: mse, F: NaN, p: NaN, eta2p: NaN },
      { source: 'Total (corrected)', ss: ssT, df: n * k - 1, ms: NaN, F: NaN, p: NaN, eta2p: NaN },
    ],
    mse,
    dfE,
    mauchly,
    gg,
    hf,
    pGG: pOf(gg),
    pHF: pOf(hf),
  };
}
function det(a: number[][]): number {
  const n = a.length;
  const m = a.map((r) => r.slice());
  let d = 1;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[piv][i])) piv = r;
    if (Math.abs(m[piv][i]) < 1e-300) return 0;
    if (piv !== i) {
      [m[i], m[piv]] = [m[piv], m[i]];
      d = -d;
    }
    d *= m[i][i];
    for (let r = i + 1; r < n; r++) {
      const f = m[r][i] / m[i][i];
      for (let c = i; c < n; c++) m[r][c] -= f * m[i][c];
    }
  }
  return d;
}

// ---- nonparametric ----
// Mann–Whitney U (U of the first group; exact without ties when a group has fewer than 8 values, else the normal
// approximation with the tie and continuity corrections)
export function mannWhitney(a: number[], b: number[], alt: Alt = 'two-sided'): TestResult {
  const [n1, n2] = [a.length, b.length];
  const { r, ties } = ranks([...a, ...b]);
  const R1 = sum(r.slice(0, n1));
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const exact = ties === 0 && Math.min(n1, n2) < 8;
  if (exact) {
    // the counts of U = 0 … n1·n2 (Mann & Whitney's recursion)
    const cnt = uCounts(n1, n2);
    const tot = sum(cnt);
    const cdf = (u: number) => sum(cnt.slice(0, Math.floor(u) + 1)) / tot;
    const sf = (u: number) => sum(cnt.slice(Math.ceil(u))) / tot;
    const p = alt === 'greater' ? sf(U1) : alt === 'less' ? cdf(U1) : Math.min(1, 2 * sf(Math.max(U1, U2)));
    return { test: 'Mann–Whitney U', statName: 'U', stat: U1, p, note: 'exact' };
  }
  const N = n1 + n2;
  const mu = (n1 * n2) / 2;
  const s = Math.sqrt(((n1 * n2) / 12) * (N + 1 - ties / (N * (N - 1))));
  const U = alt === 'two-sided' ? Math.max(U1, U2) : U1;
  let z = (U - mu) / s;
  // the continuity correction, toward the mean
  z = alt === 'less' ? (U - mu + 0.5) / s : (U - mu - 0.5) / s;
  const p = alt === 'two-sided' ? Math.min(1, 2 * normSf(z)) : alt === 'greater' ? normSf(z) : normCdf(z);
  return { test: 'Mann–Whitney U', statName: 'U', stat: U1, p, note: 'normal approximation' };
}
function uCounts(n1: number, n2: number): number[] {
  // f(n1, n2, u) = f(n1 − 1, n2, u − n2) + f(n1, n2 − 1, u)
  const memo = new Map<string, number[]>();
  const f = (a: number, b: number): number[] => {
    const key = `${a},${b}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let out: number[];
    if (a === 0 || b === 0) out = [1];
    else {
      const x = f(a - 1, b);
      const y = f(a, b - 1);
      out = new Array<number>(a * b + 1).fill(0);
      x.forEach((v, u) => (out[u + b] += v));
      y.forEach((v, u) => (out[u] += v));
    }
    memo.set(key, out);
    return out;
  };
  return f(n1, n2);
}
// Wilcoxon signed-rank (the differences; zeros dropped; exact for n ≤ 50 without ties or zeros, with them every sign
// for n ≤ 13, else the normal approximation)
export function wilcoxon(d0: number[], alt: Alt = 'two-sided'): TestResult {
  const d = d0.filter((v) => v !== 0);
  const n = d.length;
  if (n < 1) return { test: 'Wilcoxon signed-rank', statName: 'W', stat: NaN, p: NaN, note: 'all differences zero' };
  const { r, ties } = ranks(d.map(Math.abs));
  const Wp = sum(r.filter((_, i) => d[i] > 0));
  const Wm = sum(r.filter((_, i) => d[i] < 0));
  const zeros = d0.length - n;
  const exact = n <= 50 && zeros === 0 && ties === 0;
  const stat = alt === 'two-sided' ? Math.min(Wp, Wm) : Wp;
  if (!exact && d0.length <= 13) {
    // ties or zeros, a small sample: every one of the 2ⁿ signs with the ranks as they are (a permutation test)
    let le = 0;
    let ge = 0;
    const tot = 2 ** n;
    for (let m = 0; m < tot; m++) {
      let w = 0;
      for (let i = 0; i < n; i++) if (m & (1 << i)) w += r[i];
      if (w <= Wp + 1e-9) le++;
      if (w >= Wp - 1e-9) ge++;
    }
    const p = alt === 'greater' ? ge / tot : alt === 'less' ? le / tot : Math.min(1, (2 * Math.min(le, ge)) / tot);
    return { test: 'Wilcoxon signed-rank', statName: 'W', stat, p, note: 'exact (all the signs, ties kept)' };
  }
  if (exact) {
    // the counts of W+ = 0 … n(n+1)/2
    const max = (n * (n + 1)) / 2;
    let c = new Array<number>(max + 1).fill(0);
    c[0] = 1;
    for (let k = 1; k <= n; k++) {
      const nx = c.slice();
      for (let s = k; s <= max; s++) nx[s] += c[s - k];
      c = nx;
    }
    const tot = 2 ** n;
    const cdf = (w: number) => sum(c.slice(0, Math.floor(w) + 1)) / tot;
    const sf = (w: number) => sum(c.slice(Math.ceil(w))) / tot;
    const p = alt === 'greater' ? sf(Wp) : alt === 'less' ? cdf(Wp) : Math.min(1, 2 * cdf(stat));
    return { test: 'Wilcoxon signed-rank', statName: 'W', stat, p, note: 'exact' };
  }
  const mu = (n * (n + 1)) / 4;
  const s = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - ties / 48);
  const z = (stat - mu) / s;
  const p = alt === 'two-sided' ? Math.min(1, 2 * normCdf(-Math.abs(z))) : alt === 'greater' ? normSf(z) : normCdf(z);
  return { test: 'Wilcoxon signed-rank', statName: 'W', stat, p, note: 'normal approximation' };
}
export function signTest(d0: number[]): TestResult {
  const d = d0.filter((v) => v !== 0);
  const k = d.filter((v) => v > 0).length;
  return { test: 'Sign test', statName: 'n+', stat: k, p: d.length ? binomTest2(k, d.length) : NaN };
}
export function kruskal(groups: number[][]): TestResult & { meanRanks: number[] } {
  const all = groups.flat();
  const N = all.length;
  const { r, ties } = ranks(all);
  let o = 0;
  const R = groups.map((g) => {
    const s = sum(r.slice(o, o + g.length));
    o += g.length;
    return s;
  });
  let H = (12 / (N * (N + 1))) * sum(R.map((s, i) => (s * s) / groups[i].length)) - 3 * (N + 1);
  H /= 1 - ties / (N * N * N - N);
  return { test: 'Kruskal–Wallis', statName: 'H', stat: H, df: groups.length - 1, p: chi2Sf(H, groups.length - 1), meanRanks: R.map((s, i) => s / groups[i].length) };
}
// Dunn's test after Kruskal–Wallis (z of the mean ranks, ties corrected; p adjusted)
export function dunn(groups: number[][], how: 'holm' | 'bonferroni' | 'none' = 'holm'): Pair[] {
  const N = groups.flat().length;
  const { ties } = ranks(groups.flat());
  const mr = kruskal(groups).meanRanks;
  const out: Pair[] = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const se = Math.sqrt(((N * (N + 1)) / 12 - ties / (12 * (N - 1))) * (1 / groups[i].length + 1 / groups[j].length));
      const z = (mr[i] - mr[j]) / se;
      out.push({ a: i, b: j, diff: mr[i] - mr[j], se, stat: z, p: Math.min(1, 2 * normSf(Math.abs(z))), lo: NaN, hi: NaN });
    }
  const adj = adjust(out.map((q) => q.p), how);
  out.forEach((q, i) => (q.p = adj[i]));
  return out;
}
export function friedman(m: number[][]): TestResult {
  const n = m.length;
  const k = m[0].length;
  const R = new Array<number>(k).fill(0);
  let ties = 0;
  for (const row of m) {
    const rr = ranks(row);
    rr.r.forEach((v, j) => (R[j] += v));
    ties += rr.ties;
  }
  const c = 1 - ties / (n * k * (k * k - 1));
  const chi = ((12 / (n * k * (k + 1))) * sum(R.map((v) => v * v)) - 3 * n * (k + 1)) / c;
  return { test: 'Friedman', statName: 'χ²', stat: chi, df: k - 1, p: chi2Sf(chi, k - 1) };
}

// ---- correlation ----
export type Corr = { r: number; p: number; n: number; lo: number; hi: number };
export function pearson(x: number[], y: number[], level = 0.95): Corr {
  const n = x.length;
  const [mx, my] = [mean(x), mean(y)];
  let [sxy, sxx, syy] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const t = r * Math.sqrt((n - 2) / Math.max(1e-300, 1 - r * r));
  const z = Math.atanh(r);
  const h = normInv(0.5 + level / 2) / Math.sqrt(n - 3);
  return { r, p: Math.abs(r) === 1 ? 0 : tP2(t, n - 2), n, lo: n > 3 ? Math.tanh(z - h) : NaN, hi: n > 3 ? Math.tanh(z + h) : NaN };
}
export function spearman(x: number[], y: number[]): Corr {
  const c = pearson(ranks(x).r, ranks(y).r);
  return { ...c, lo: NaN, hi: NaN };
}
// Kendall's τ-b (exact without ties for n ≤ 33, else the normal approximation with ties)
export function kendall(x: number[], y: number[]): Corr {
  const n = x.length;
  let con = 0;
  let dis = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = Math.sign(x[i] - x[j]) * Math.sign(y[i] - y[j]);
      if (s > 0) con++;
      else if (s < 0) dis++;
    }
  const tieStats = (a: number[]) => {
    const cnt = new Map<number, number>();
    a.forEach((v) => cnt.set(v, (cnt.get(v) ?? 0) + 1));
    let [t, t0, t1] = [0, 0, 0];
    for (const c of cnt.values()) {
      t += (c * (c - 1)) / 2;
      t0 += c * (c - 1) * (c - 2);
      t1 += c * (c - 1) * (2 * c + 5);
    }
    return [t, t0, t1];
  };
  const [xt, x0, x1] = tieStats(x);
  const [yt, y0, y1] = tieStats(y);
  const tot = (n * (n - 1)) / 2;
  const cmd = con - dis;
  const tau = cmd / Math.sqrt((tot - xt) * (tot - yt));
  let p: number;
  if (xt === 0 && yt === 0 && (n <= 33 || Math.min(dis, tot - dis) <= 1)) {
    // the counts of permutations by their inversions (Mahonian numbers)
    let c = [1];
    for (let k = 2; k <= n; k++) {
      const nx = new Array<number>(c.length + k - 1).fill(0);
      c.forEach((v, i) => {
        for (let j = 0; j < k; j++) nx[i + j] += v;
      });
      c = nx;
    }
    const total = Math.exp(lgamma(n + 1));
    const m = Math.min(dis, tot - dis);
    p = Math.min(1, (2 * sum(c.slice(0, m + 1))) / total);
  } else {
    const mm = n * (n - 1);
    const v = (mm * (2 * n + 5) - x1 - y1) / 18 + (2 * xt * yt) / mm + (x0 * y0) / (9 * mm * (n - 2));
    p = Math.min(1, 2 * normSf(Math.abs(cmd) / Math.sqrt(v)));
  }
  return { r: tau, p, n, lo: NaN, hi: NaN };
}
