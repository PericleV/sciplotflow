// The methods of the third statistics package: the power and the sample size of the common tests (the t-tests, the
// one-way ANOVA, two proportions, a correlation, χ², the log-rank test), the bootstrap (percentile, basic and BCa
// intervals, as SciPy) and permutation tests, distributions fitted by maximum likelihood and ranked (AIC, BIC, the
// exact Kolmogorov–Smirnov p, Anderson–Darling), agreement and reliability (Cohen's κ, weighted or not, Fleiss's κ, the
// six ICC, Cronbach's α, Lin's concordance), method comparison (Passing–Bablok with its CUSUM test of linearity, Deming)
// and the binary logistic regression (Newton's method; Hosmer–Lemeshow). Pure. Checked against statsmodels, SciPy and
// pingouin (scripts/fixtures/tests3-ref.py).
import { chi2Cdf, chi2Sf, fSf, ibeta, lgamma, normCdf, normInv, normSf, tInv, tP2 } from './dist.ts';
import { fInv, powerAnova, powerT } from './power.ts';
import { leastSquares } from './stat2.ts';

// ---- a seeded random generator (mulberry32) ----
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
// a quantile as numpy's default (linear between the order statistics)
export function quantile(s: number[], p: number): number {
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[Math.min(s.length - 1, lo + 1)] ?? s[lo]) - s[lo]);
}

// ---- power and sample size ----
// the noncentral χ²: P(X ≤ x) = Σ Poisson(j; λ/2) P(χ²(k + 2j) ≤ x)
export function ncx2Cdf(x: number, k: number, lambda: number): number {
  if (x <= 0) return 0;
  if (!(lambda > 0)) return chi2Cdf(x, k);
  const h = lambda / 2;
  const j0 = Math.floor(h);
  const lp = (j: number) => -h + j * Math.log(h) - lgamma(j + 1);
  let s = 0;
  for (let j = j0; j < j0 + 100000; j++) {
    const w = Math.exp(lp(j));
    s += w * chi2Cdf(x, k + 2 * j);
    if (w < 1e-17 && j > j0 + 5) break;
  }
  for (let j = j0 - 1; j >= 0; j--) {
    const w = Math.exp(lp(j));
    s += w * chi2Cdf(x, k + 2 * j);
    if (w < 1e-17) break;
  }
  return Math.min(1, s);
}
export type PowerTest = 't1' | 'paired' | 't2' | 'anova' | 'prop' | 'corr' | 'chi2' | 'logrank';
export type PowerAlt = 'two-sided' | 'one-sided';
// what every test needs: n (the size: per group for t2, anova, prop; else in all), the effect (d, f, r, w, the HR;
// prop: p2 with p1), ratio (n2 / n1), k (anova: the groups; chi2: the df), events (logrank: the share with the event)
export type PowerQ = { test: PowerTest; alt: PowerAlt; alpha: number; ratio: number; k: number; p1: number; events: number };
// Cohen's h of two proportions
export const cohenH = (p1: number, p2: number) => 2 * Math.asin(Math.sqrt(p2)) - 2 * Math.asin(Math.sqrt(p1));
// the power of a normal test: its noncentrality δ (the standardized effect × √n)
const normalPower = (delta: number, alpha: number, alt: PowerAlt) => {
  if (alt === 'one-sided') return normSf(normInv(1 - alpha) - Math.abs(delta));
  const z = normInv(1 - alpha / 2);
  return normSf(z - delta) + normCdf(-z - delta);
};
export function powerOf(q: PowerQ, n: number, effect: number): number {
  const alt = q.alt === 'one-sided' ? 'greater' : 'two-sided';
  switch (q.test) {
    case 't1':
    case 'paired':
      return powerT(Math.abs(effect), n, null, q.alpha, alt);
    case 't2':
      return powerT(Math.abs(effect), n, q.ratio * n, q.alpha, alt);
    case 'anova':
      return powerAnova(Math.abs(effect), q.k, n * q.k, q.alpha);
    case 'prop': {
      // (as statsmodels's NormalIndPower with Cohen's h)
      const n2 = q.ratio * n;
      return normalPower(Math.abs(cohenH(q.p1, effect)) * Math.sqrt(1 / (1 / n + 1 / n2)), q.alpha, q.alt);
    }
    case 'corr':
      // (Fisher's z: atanh r · √(n − 3))
      return n > 3 ? normalPower(Math.abs(Math.atanh(effect)) * Math.sqrt(n - 3), q.alpha, q.alt) : NaN;
    case 'chi2': {
      // (as statsmodels's GofChisquarePower: λ = w² N, df given)
      const crit = chi2Quantile(1 - q.alpha, q.k);
      return 1 - ncx2Cdf(crit, q.k, effect * effect * n);
    }
    case 'logrank': {
      // (Schoenfeld: the events d = N · their share; √(d p (1 − p)) |ln HR|)
      const p = 1 / (1 + q.ratio);
      return normalPower(Math.sqrt(n * q.events * p * (1 - p)) * Math.abs(Math.log(effect)), q.alpha, q.alt);
    }
  }
}
// the χ² with P(X ≤ x) = p
export function chi2Quantile(p: number, k: number): number {
  let [lo, hi] = [0, Math.max(1, k)];
  while (chi2Cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (chi2Cdf(m, k) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
// the smallest whole n with the power wanted (NaN beyond 10⁷)
export function nFor(q: PowerQ, effect: number, power: number): number {
  const min = q.test === 'corr' ? 4 : 2;
  const pw = (n: number) => powerOf(q, n, effect);
  let [lo, hi] = [min, min * 2];
  if (pw(min) >= power) return min;
  while (!(pw(hi) >= power)) {
    lo = hi;
    hi *= 2;
    if (hi > 1e7) return NaN;
  }
  while (hi - lo > 1) {
    const m = Math.floor((lo + hi) / 2);
    if (pw(m) >= power) hi = m;
    else lo = m;
  }
  return hi;
}
// the smallest effect found with the power wanted at n: d, f, w up to 20; r up to 0.9999; p2 from p1 to 1; HR from 1
// down to 0
export function effectFor(q: PowerQ, n: number, power: number): number {
  const at = (u: number) => (q.test === 'prop' ? q.p1 + u * (1 - q.p1) : q.test === 'logrank' ? Math.exp(-20 * u) : q.test === 'corr' ? 0.9999 * u : 20 * u);
  const pw = (u: number) => powerOf(q, n, at(u));
  if (!(pw(1 - 1e-9) >= power)) return NaN;
  let [lo, hi] = [1e-12, 1 - 1e-9];
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (pw(m) >= power) hi = m;
    else lo = m;
  }
  return at(hi);
}

// ---- bootstrap and permutation ----
export type ResampleStat = 'mean' | 'median' | 'sd' | 'cv' | 'pct' | 'diffmean' | 'diffmedian' | 'ratiomean' | 'pearson' | 'spearman';
export const TWO_SAMPLE: ResampleStat[] = ['diffmean', 'diffmedian', 'ratiomean'];
export const PAIRED: ResampleStat[] = ['pearson', 'spearman'];
const sdOf = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
const medianOf = (a: number[]) => quantile(sorted(a), 0.5);
function ranksOf(a: number[]): number[] {
  const o = a.map((_, i) => i).sort((x, y) => a[x] - a[y]);
  const r = new Array<number>(a.length);
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && a[o[j + 1]] === a[o[i]]) j++;
    for (let k = i; k <= j; k++) r[o[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
const pearsonR = (x: number[], y: number[]) => {
  const [mx, my] = [mean(x), mean(y)];
  let [sxy, sxx, syy] = [0, 0, 0];
  for (let i = 0; i < x.length; i++) [sxy, sxx, syy] = [sxy + (x[i] - mx) * (y[i] - my), sxx + (x[i] - mx) ** 2, syy + (y[i] - my) ** 2];
  return sxy / Math.sqrt(sxx * syy);
};
// a statistic of one sample (a), of two (a, b), or of pairs (a[i], b[i])
export function statOf(kind: ResampleStat, a: number[], b: number[] = [], q = 0.5): number {
  switch (kind) {
    case 'mean':
      return mean(a);
    case 'median':
      return medianOf(a);
    case 'sd':
      return sdOf(a);
    case 'cv':
      return (100 * sdOf(a)) / mean(a);
    case 'pct':
      return quantile(sorted(a), q);
    case 'diffmean':
      return mean(a) - mean(b);
    case 'diffmedian':
      return medianOf(a) - medianOf(b);
    case 'ratiomean':
      return mean(a) / mean(b);
    case 'pearson':
      return pearsonR(a, b);
    case 'spearman':
      return pearsonR(ranksOf(a), ranksOf(b));
  }
}
export type Boot = { est: number; bias: number; se: number; lo: number; hi: number; dist: number[] };
// The bootstrap: B resamples (with replacement: of a; of a and of b each; of the pairs), the estimate's bias and SE,
// its interval: percentile, basic or BCa (the bias correction and the acceleration from the jackknife, as SciPy)
export function bootstrap(kind: ResampleStat, a: number[], b: number[], B: number, level: number, method: 'percentile' | 'basic' | 'bca', seed: number, q = 0.5): Boot {
  const rnd = seeded(seed);
  const pick = (x: number[]) => Array.from(x, () => x[Math.floor(rnd() * x.length)]);
  const paired = PAIRED.includes(kind);
  const two = TWO_SAMPLE.includes(kind);
  const est = statOf(kind, a, b, q);
  const dist: number[] = [];
  for (let k = 0; k < B; k++) {
    if (paired) {
      const idx = Array.from(a, () => Math.floor(rnd() * a.length));
      dist.push(
        statOf(
          kind,
          idx.map((i) => a[i]),
          idx.map((i) => b[i]),
          q,
        ),
      );
    } else dist.push(statOf(kind, pick(a), two ? pick(b) : [], q));
  }
  const s = sorted(dist.filter(Number.isFinite));
  const m = mean(s);
  const se = Math.sqrt(s.reduce((x, v) => x + (v - m) ** 2, 0) / (s.length - 1));
  const al = (1 - level) / 2;
  let [plo, phi] = [al, 1 - al];
  if (method === 'bca') {
    // (z0: where the estimate is among the resamples, ties halved; a: from the jackknife of every sample)
    const below = s.filter((v) => v < est).length;
    const atOrBelow = s.filter((v) => v <= est).length;
    const z0 = normInv((below + atOrBelow) / (2 * s.length));
    const jack: number[][] = [];
    if (paired) jack.push(a.map((_, i) => statOf(kind, a.filter((_, j) => j !== i), b.filter((_, j) => j !== i), q)));
    else {
      jack.push(a.map((_, i) => statOf(kind, a.filter((_, j) => j !== i), b, q)));
      if (two) jack.push(b.map((_, i) => statOf(kind, a, b.filter((_, j) => j !== i), q)));
    }
    let [num, den] = [0, 0];
    for (const J of jack) {
      const jm = mean(J);
      for (const v of J) {
        num += (jm - v) ** 3;
        den += (jm - v) ** 2;
      }
    }
    const acc = num / (6 * den ** 1.5);
    const adj = (p: number) => {
      const z = normInv(p);
      return normCdf(z0 + (z0 + z) / (1 - acc * (z0 + z)));
    };
    [plo, phi] = [adj(al), adj(1 - al)];
  }
  let [lo, hi] = [quantile(s, plo), quantile(s, phi)];
  if (method === 'basic') [lo, hi] = [2 * est - hi, 2 * est - lo];
  return { est, bias: m - est, se, lo, hi, dist };
}
// every way of choosing k of n (in order), up to `max` of them, else null
function combinations(n: number, k: number, max: number): number[][] | null {
  let count = 1;
  for (let i = 0; i < k; i++) count = (count * (n - i)) / (i + 1);
  if (count > max) return null;
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i <= n - (k - cur.length); i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}
// every order of n, up to `max` of them, else null
function permutations(n: number, max: number): number[][] | null {
  let count = 1;
  for (let i = 2; i <= n; i++) count *= i;
  if (count > max) return null;
  const out: number[][] = [];
  const a = Array.from({ length: n }, (_, i) => i);
  const rec = (k: number) => {
    if (k === n) {
      out.push([...a]);
      return;
    }
    for (let i = k; i < n; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      rec(k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  rec(0);
  return out;
}
export type Perm = { est: number; p: number; exact: boolean; dist: number[] };
// The permutation test of two samples (the labels shuffled) or of pairs (one side shuffled): every arrangement when
// they are at most B, else B at random (the p then (count + 1) / (B + 1)); two-sided p = 2 · the smaller tail, as SciPy
export function permutation(kind: ResampleStat, a: number[], b: number[], B: number, alt: 'two-sided' | 'less' | 'greater', seed: number): Perm {
  const est = statOf(kind, a, b);
  const paired = PAIRED.includes(kind);
  const pool = [...a, ...b];
  const [n1, n] = [a.length, pool.length];
  const dist: number[] = [];
  let exact = true;
  if (paired) {
    const all = permutations(a.length, B);
    if (all)
      for (const o of all)
        dist.push(
          statOf(
            kind,
            a,
            o.map((i) => b[i]),
          ),
        );
    else {
      exact = false;
      const rnd = seeded(seed);
      for (let k = 0; k < B; k++) {
        const o = b.map((_, i) => i);
        for (let i = o.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [o[i], o[j]] = [o[j], o[i]];
        }
        dist.push(
          statOf(
            kind,
            a,
            o.map((i) => b[i]),
          ),
        );
      }
    }
  } else {
    const all = combinations(n, n1, B);
    if (all)
      for (const c of all) {
        const inA = new Set(c);
        dist.push(
          statOf(
            kind,
            c.map((i) => pool[i]),
            pool.filter((_, i) => !inA.has(i)),
          ),
        );
      }
    else {
      exact = false;
      const rnd = seeded(seed);
      const o = pool.map((_, i) => i);
      for (let k = 0; k < B; k++) {
        for (let i = o.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [o[i], o[j]] = [o[j], o[i]];
        }
        dist.push(
          statOf(
            kind,
            o.slice(0, n1).map((i) => pool[i]),
            o.slice(n1).map((i) => pool[i]),
          ),
        );
      }
    }
  }
  // (a tolerance for the rounding of equal statistics, as SciPy)
  const g = Math.abs(est) * 1e-14 * 100;
  const le = dist.filter((v) => v <= est + g).length;
  const ge = dist.filter((v) => v >= est - g).length;
  const N = dist.length;
  const [pl, pg] = exact ? [le / N, ge / N] : [(le + 1) / (N + 1), (ge + 1) / (N + 1)];
  const p = alt === 'less' ? pl : alt === 'greater' ? pg : Math.min(1, 2 * Math.min(pl, pg));
  return { est, p, exact, dist };
}

// ---- goodness of fit ----
// The exact distribution of Kolmogorov's D: P(D_n < d) by Marsaglia, Tsang and Wang (2003), a matrix power
export function kolmogorovCdf(n: number, d: number): number {
  if (d <= 0) return 0;
  if (d >= 1) return 1;
  // (large n: the asymptotic series)
  if (n > 2000) {
    const t = d * Math.sqrt(n);
    let s = 0;
    for (let k = 1; k < 100; k++) s += 2 * (-1) ** (k - 1) * Math.exp(-2 * k * k * t * t);
    return 1 - s;
  }
  const k = Math.floor(n * d) + 1;
  const m = 2 * k - 1;
  const h = k - n * d;
  const H = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) H[i * m + j] = i - j + 1 < 0 ? 0 : 1;
  for (let i = 0; i < m; i++) {
    H[i * m] -= h ** (i + 1);
    H[(m - 1) * m + i] -= h ** (m - i);
  }
  H[(m - 1) * m] += 2 * h - 1 > 0 ? (2 * h - 1) ** m : 0;
  for (let i = 0; i < m; i++)
    for (let j = 0; j < m; j++)
      if (i - j + 1 > 0) for (let g = 1; g <= i - j + 1; g++) H[i * m + j] /= g;
  const mul = (A: Float64Array, B: Float64Array) => {
    const C = new Float64Array(m * m);
    for (let i = 0; i < m; i++)
      for (let l = 0; l < m; l++) {
        const a = A[i * m + l];
        if (a) for (let j = 0; j < m; j++) C[i * m + j] += a * B[l * m + j];
      }
    return C;
  };
  // (H^n by squaring, with the exponents kept apart: 10^e)
  const pow = (A: Float64Array, e: number): [Float64Array, number] => {
    if (e === 1) return [A, 0];
    const [V, ev] = pow(A, Math.floor(e / 2));
    let B = mul(V, V);
    let eb = 2 * ev;
    if (e % 2 === 1) B = mul(A, B);
    if (B[(k - 1) * m + k - 1] > 1e140) {
      for (let i = 0; i < m * m; i++) B[i] *= 1e-140;
      eb += 140;
    }
    return [B, eb];
  };
  const [Q, eq] = pow(H, n);
  let s = Q[(k - 1) * m + k - 1];
  let e = eq;
  for (let i = 1; i <= n; i++) {
    s = (s * i) / n;
    if (s < 1e-140) {
      s *= 1e140;
      e -= 140;
    }
  }
  return Math.min(1, Math.max(0, s * 10 ** e));
}
// Kolmogorov–Smirnov's D of a sample against a CDF and its p (exact), Anderson–Darling's A²
export function ksTest(x: number[], cdf: (v: number) => number): { D: number; p: number } {
  const s = sorted(x);
  const n = s.length;
  let D = 0;
  s.forEach((v, i) => {
    const F = cdf(v);
    D = Math.max(D, (i + 1) / n - F, F - i / n);
  });
  return { D, p: 1 - kolmogorovCdf(n, D) };
}
export function andersonDarling(x: number[], cdf: (v: number) => number): number {
  const s = sorted(x);
  const n = s.length;
  let S = 0;
  for (let i = 0; i < n; i++) {
    const F1 = Math.min(1 - 1e-300, Math.max(1e-300, cdf(s[i])));
    const F2 = Math.min(1 - 1e-300, Math.max(1e-300, cdf(s[n - 1 - i])));
    S += (2 * i + 1) * (Math.log(F1) + Math.log(1 - F2));
  }
  return -n - S / n;
}
// the beta distribution (0 < x < 1): its log density, its CDF, its maximum likelihood (Nelder–Mead on ln a, ln b
// from the moments)
export const betaLogPdf = (x: number, a: number, b: number) => (x > 0 && x < 1 ? (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lgamma(a) + lgamma(b) - lgamma(a + b)) : -Infinity);
export const betaCdf = (x: number, a: number, b: number) => (x <= 0 ? 0 : x >= 1 ? 1 : ibeta(a, b, x));

// ---- agreement and reliability ----
export type Kappa = { kappa: number; se: number; se0: number; lo: number; hi: number; z: number; p: number; po: number; pe: number };
// Cohen's κ of a square table (rows: rater 1, columns: rater 2), unweighted or with linear or quadratic weights of the
// categories' order; the asymptotic SE (Fleiss, Cohen and Everitt 1969) and the one under κ = 0 for the test (as
// statsmodels's cohens_kappa)
export function cohenKappa(t: number[][], wt: 'none' | 'linear' | 'quadratic', level = 0.95): Kappa {
  const k = t.length;
  const n = t.flat().reduce((a, b) => a + b, 0);
  const p = t.map((r) => r.map((v) => v / n));
  const fr = p.map((r) => r.reduce((a, b) => a + b, 0));
  const fc = p[0].map((_, j) => p.reduce((a, r) => a + r[j], 0));
  // (agreement weights: 1 on the diagonal, less the farther apart)
  const w = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (wt === 'none' ? (i === j ? 1 : 0) : wt === 'linear' ? 1 - Math.abs(i - j) / (k - 1) : 1 - (i - j) ** 2 / (k - 1) ** 2)));
  let [po, pe] = [0, 0];
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      po += w[i][j] * p[i][j];
      pe += w[i][j] * fr[i] * fc[j];
    }
  const kappa = (po - pe) / (1 - pe);
  const wr = fr.map((_, i) => fc.reduce((s, c, j) => s + c * w[i][j], 0));
  const wc = fc.map((_, j) => fr.reduce((s, r, i) => s + r * w[i][j], 0));
  let [a, a0] = [0, 0];
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      a += p[i][j] * (w[i][j] - (wr[i] + wc[j]) * (1 - kappa)) ** 2;
      a0 += fr[i] * fc[j] * (w[i][j] - (wr[i] + wc[j])) ** 2;
    }
  const fac = 1 / ((1 - pe) ** 2 * n);
  const se = Math.sqrt(Math.max(0, (a - (kappa - pe * (1 - kappa)) ** 2) * fac));
  const se0 = Math.sqrt(Math.max(0, (a0 - pe * pe) * fac));
  const z = normInv(1 - (1 - level) / 2);
  return { kappa, se, se0, lo: kappa - z * se, hi: kappa + z * se, z: kappa / se0, p: 2 * normSf(Math.abs(kappa / se0)), po, pe };
}
// Fleiss's κ: counts[i][c] the raters who put subject i in category c (the same number of raters for all); its SE
// under κ = 0 (Fleiss, Nee and Landis 1979), z and p
export function fleissKappa(counts: number[][]): { kappa: number; se0: number; z: number; p: number; pBar: number; pe: number } {
  const N = counts.length;
  const m = counts[0].reduce((a, b) => a + b, 0);
  const pj = counts[0].map((_, c) => counts.reduce((s, r) => s + r[c], 0) / (N * m));
  const Pi = counts.map((r) => (r.reduce((s, v) => s + v * v, 0) - m) / (m * (m - 1)));
  const pBar = mean(Pi);
  const pe = pj.reduce((s, v) => s + v * v, 0);
  const kappa = (pBar - pe) / (1 - pe);
  const sq = pj.reduce((s, v) => s + v * (1 - v), 0);
  const se0 = (Math.sqrt(2) / (sq * Math.sqrt(N * m * (m - 1)))) * Math.sqrt(sq * sq - pj.reduce((s, v) => s + v * (1 - v) * (1 - 2 * v), 0));
  return { kappa, se0, z: kappa / se0, p: 2 * normSf(Math.abs(kappa / se0)), pBar, pe };
}
export type ICCRow = { type: string; name: string; icc: number; F: number; df1: number; df2: number; p: number; lo: number; hi: number };
// The six ICC (Shrout and Fleiss 1979; McGraw and Wong 1996) of n subjects (rows) × k raters (columns), complete;
// their F tests and intervals (as pingouin)
export function iccAll(m: number[][], level = 0.95): ICCRow[] {
  const n = m.length;
  const k = m[0].length;
  const g = mean(m.flat());
  const rm = m.map((r) => mean(r));
  const cm = m[0].map((_, j) => mean(m.map((r) => r[j])));
  const ssr = k * rm.reduce((s, v) => s + (v - g) ** 2, 0);
  const ssc = n * cm.reduce((s, v) => s + (v - g) ** 2, 0);
  const sst = m.flat().reduce((s, v) => s + (v - g) ** 2, 0);
  const sse = sst - ssr - ssc;
  const msb = ssr / (n - 1);
  const msj = ssc / (k - 1);
  const mse = sse / ((n - 1) * (k - 1));
  const msw = (ssc + sse) / (n * (k - 1));
  const icc1 = (msb - msw) / (msb + (k - 1) * msw);
  const icc2 = (msb - mse) / (msb + (k - 1) * mse + (k * (msj - mse)) / n);
  const icc3 = (msb - mse) / (msb + (k - 1) * mse);
  const f1 = msb / msw;
  const f3 = msb / mse;
  const [d1, d1k, d2k] = [n - 1, n * (k - 1), (n - 1) * (k - 1)];
  const a = 1 - level;
  const f1l = f1 / fInv(1 - a / 2, d1, d1k);
  const f1u = f1 * fInv(1 - a / 2, d1k, d1);
  const f3l = f3 / fInv(1 - a / 2, d1, d2k);
  const f3u = f3 * fInv(1 - a / 2, d2k, d1);
  const fj = msj / mse;
  const vn = d2k * (k * icc2 * fj + n * (1 + (k - 1) * icc2) - k * icc2) ** 2;
  const vd = d1 * k * k * icc2 * icc2 * fj * fj + (n * (1 + (k - 1) * icc2) - k * icc2) ** 2;
  const v = vn / vd;
  const f2u = fInv(1 - a / 2, n - 1, v);
  const f2l = fInv(1 - a / 2, v, n - 1);
  const l2 = (n * (msb - f2u * mse)) / (f2u * (k * msj + (k * n - k - n) * mse) + n * msb);
  const u2 = (n * (f2l * msb - mse)) / (k * msj + (k * n - k - n) * mse + n * f2l * msb);
  const p1 = fSf(f1, d1, d1k);
  const p3 = fSf(f3, d1, d2k);
  const one = (l: number, u: number): [number, number] => [(l - 1) / (l + k - 1), (u - 1) / (u + k - 1)];
  const [l1, u1] = one(f1l, f1u);
  const [l3, u3] = one(f3l, f3u);
  return [
    { type: 'ICC(1,1)', name: 'one-way, single rater', icc: icc1, F: f1, df1: d1, df2: d1k, p: p1, lo: l1, hi: u1 },
    { type: 'ICC(A,1)', name: 'two-way, absolute agreement, single (ICC2)', icc: icc2, F: f3, df1: d1, df2: d2k, p: p3, lo: l2, hi: u2 },
    { type: 'ICC(C,1)', name: 'two-way, consistency, single (ICC3)', icc: icc3, F: f3, df1: d1, df2: d2k, p: p3, lo: l3, hi: u3 },
    { type: 'ICC(1,k)', name: 'one-way, mean of the raters', icc: (msb - msw) / msb, F: f1, df1: d1, df2: d1k, p: p1, lo: 1 - 1 / f1l, hi: 1 - 1 / f1u },
    { type: 'ICC(A,k)', name: 'two-way, absolute agreement, mean', icc: (msb - mse) / (msb + (msj - mse) / n), F: f3, df1: d1, df2: d2k, p: p3, lo: (l2 * k) / (1 + l2 * (k - 1)), hi: (u2 * k) / (1 + u2 * (k - 1)) },
    { type: 'ICC(C,k)', name: 'two-way, consistency, mean', icc: (msb - mse) / msb, F: f3, df1: d1, df2: d2k, p: p3, lo: 1 - 1 / f3l, hi: 1 - 1 / f3u },
  ];
}
const varS = (a: number[]) => {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
};
// Cronbach's α of n subjects × k items, its interval (Feldt 1965, as pingouin); every item: α without it, its
// correlation with the total of the others
export function cronbach(m: number[][], level = 0.95): { alpha: number; lo: number; hi: number; items: { drop: number; r: number; mean: number; sd: number }[] } {
  const n = m.length;
  const k = m[0].length;
  const alphaOf = (cols: number[]) => {
    const kk = cols.length;
    const tot = m.map((r) => cols.reduce((s, j) => s + r[j], 0));
    return (kk / (kk - 1)) * (1 - cols.reduce((s, j) => s + varS(m.map((r) => r[j])), 0) / varS(tot));
  };
  const all = Array.from({ length: k }, (_, j) => j);
  const alpha = alphaOf(all);
  const a = 1 - level;
  const [d1, d2] = [n - 1, (n - 1) * (k - 1)];
  const lo = 1 - (1 - alpha) * fInv(1 - a / 2, d1, d2);
  const hi = 1 - (1 - alpha) * fInv(a / 2, d1, d2);
  const items = all.map((j) => {
    const x = m.map((r) => r[j]);
    const rest = m.map((r) => r.reduce((s, v, q) => s + (q === j ? 0 : v), 0));
    return { drop: k > 2 ? alphaOf(all.filter((q) => q !== j)) : NaN, r: pearsonR(x, rest), mean: mean(x), sd: Math.sqrt(varS(x)) };
  });
  return { alpha, lo, hi, items };
}
// Lin's concordance correlation of two columns (the moments over n) and its interval from Fisher's z (Lin 1989, 2000)
export function linCCC(x: number[], y: number[], level = 0.95): { ccc: number; lo: number; hi: number; r: number; shift: number; scale: number } {
  const n = x.length;
  const [mx, my] = [mean(x), mean(y)];
  const sx2 = x.reduce((s, v) => s + (v - mx) ** 2, 0) / n;
  const sy2 = y.reduce((s, v) => s + (v - my) ** 2, 0) / n;
  const sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / n;
  const ccc = (2 * sxy) / (sx2 + sy2 + (mx - my) ** 2);
  const r = sxy / Math.sqrt(sx2 * sy2);
  const u = (mx - my) / Math.sqrt(Math.sqrt(sx2 * sy2));
  const c2 = ccc * ccc;
  const varZ = (1 / (n - 2)) * (((1 - r * r) * c2) / ((1 - c2) * r * r) + (2 * ccc ** 3 * (1 - ccc) * u * u) / (r * (1 - c2) ** 2) - (c2 * c2 * u ** 4) / (2 * r * r * (1 - c2) ** 2));
  const z = normInv(1 - (1 - level) / 2);
  const t = Math.atanh(ccc);
  return { ccc, lo: Math.tanh(t - z * Math.sqrt(varZ)), hi: Math.tanh(t + z * Math.sqrt(varZ)), r, shift: u, scale: Math.sqrt(sx2 / sy2) };
}

// ---- method comparison ----
// Passing–Bablok (1983): the slope the shifted median of the slopes of every two points (those of −1 and 0 / 0 left
// out; K the slopes under −1), its interval from the ranks; the intercept the median of y − b x, its interval from
// the slope's; the CUSUM test of linearity (the points above and below the line along it, Kolmogorov's limit)
export function passingBablok(x: number[], y: number[], level = 0.95): { b: number; bLo: number; bHi: number; a: number; aLo: number; aHi: number; cusum: number; pLinear: number } {
  const n = x.length;
  const S: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      if (dx === 0 && dy === 0) continue;
      const s = dx === 0 ? (dy > 0 ? Infinity : -Infinity) : dy / dx;
      if (s === -1) continue;
      S.push(s);
    }
  S.sort((p, q) => p - q);
  const N = S.length;
  const K = S.filter((s) => s < -1).length;
  const at = (i: number) => S[Math.min(N - 1, Math.max(0, i - 1))];
  const b = N % 2 ? at((N + 1) / 2 + K) : 0.5 * (at(N / 2 + K) + at(N / 2 + 1 + K));
  const C = normInv(1 - (1 - level) / 2) * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18);
  const M1 = Math.round((N - C) / 2);
  const M2 = N - M1 + 1;
  const bLo = at(M1 + K);
  const bHi = at(M2 + K);
  const med = (v: number[]) => quantile(sorted(v), 0.5);
  const a = med(y.map((v, i) => v - b * x[i]));
  const aLo = med(y.map((v, i) => v - bHi * x[i]));
  const aHi = med(y.map((v, i) => v - bLo * x[i]));
  // (CUSUM: the residuals' signs, scored so they add up to 0, in the order of their projections on the line)
  const res = y.map((v, i) => v - a - b * x[i]);
  const l = res.filter((r) => r > 0).length;
  const L = res.filter((r) => r < 0).length;
  const score = res.map((r) => (r > 0 ? Math.sqrt(L / l) : r < 0 ? -Math.sqrt(l / L) : 0));
  const D = x.map((v, i) => (y[i] + v / b - a) / Math.sqrt(1 + 1 / (b * b)));
  const order = D.map((_, i) => i).sort((p, q) => D[p] - D[q]);
  let [cs, mx] = [0, 0];
  for (const i of order) {
    cs += score[i];
    mx = Math.max(mx, Math.abs(cs));
  }
  const H = mx / Math.sqrt(L + 1);
  // (Kolmogorov's limiting distribution)
  let q = 0;
  for (let k = 1; k < 100; k++) q += 2 * (-1) ** (k - 1) * Math.exp(-2 * k * k * H * H);
  return { b, bLo, bHi, a, aLo, aHi, cusum: H, pLinear: Math.min(1, Math.max(0, q)) };
}
// Deming's regression with the ratio λ of the error variances (of y to x; 1: orthogonal), its SE by the jackknife
// and the t interval (as Linnet 1993 and R's mcr)
export function deming(x: number[], y: number[], lambda = 1, level = 0.95): { b: number; a: number; seB: number; seA: number; bLo: number; bHi: number; aLo: number; aHi: number } {
  const fit = (xx: number[], yy: number[]) => {
    const [mx, my] = [mean(xx), mean(yy)];
    let [sxx, syy, sxy] = [0, 0, 0];
    for (let i = 0; i < xx.length; i++) [sxx, syy, sxy] = [sxx + (xx[i] - mx) ** 2, syy + (yy[i] - my) ** 2, sxy + (xx[i] - mx) * (yy[i] - my)];
    const b = (syy - lambda * sxx + Math.sqrt((syy - lambda * sxx) ** 2 + 4 * lambda * sxy * sxy)) / (2 * sxy);
    return { b, a: my - b * mx };
  };
  const n = x.length;
  const f = fit(x, y);
  const jb: number[] = [];
  const ja: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = fit(
      x.filter((_, j) => j !== i),
      y.filter((_, j) => j !== i),
    );
    jb.push(r.b);
    ja.push(r.a);
  }
  const jse = (v: number[]) => {
    const m = mean(v);
    return Math.sqrt(((n - 1) / n) * v.reduce((s, q) => s + (q - m) ** 2, 0));
  };
  const [seB, seA] = [jse(jb), jse(ja)];
  const t = tInv(1 - (1 - level) / 2, n - 2);
  return { b: f.b, a: f.a, seB, seA, bLo: f.b - t * seB, bHi: f.b + t * seB, aLo: f.a - t * seA, aHi: f.a + t * seA };
}

// ---- the binary logistic regression ----
export type Logit = { b: number[]; se: number[]; ll: number; ll0: number; iter: number; converged: boolean; p: number[]; separated: boolean };
// Newton's method (iteratively reweighted least squares) from 0; the SE from the inverse of the information
export function logistic(X: number[][], y: number[]): Logit {
  const n = X.length;
  const k = X[0].length;
  let b = new Array<number>(k).fill(0);
  const probs = (bb: number[]) => X.map((r) => 1 / (1 + Math.exp(-r.reduce((s, v, j) => s + v * bb[j], 0))));
  const llOf = (p: number[]) => y.reduce((s, v, i) => s + (v ? Math.log(Math.max(1e-300, p[i])) : Math.log(Math.max(1e-300, 1 - p[i]))), 0);
  let p = probs(b);
  let ll = llOf(p);
  let converged = false;
  let iter = 0;
  for (; iter < 100; iter++) {
    // (the working response z = Xb + (y − p) / w, weights w = p (1 − p): least squares on √w X, √w z)
    const w = p.map((q) => Math.max(1e-12, q * (1 - q)));
    const eta = X.map((r) => r.reduce((s, v, j) => s + v * b[j], 0));
    const z = eta.map((e, i) => e + (y[i] - p[i]) / w[i]);
    const sw = w.map(Math.sqrt);
    const ls = leastSquares(
      X.map((r, i) => r.map((v) => v * sw[i])),
      z.map((v, i) => v * sw[i]),
    );
    const nb = ls.b.map((v) => (Number.isFinite(v) ? v : 0));
    const np = probs(nb);
    const nll = llOf(np);
    const step = Math.max(...nb.map((v, j) => Math.abs(v - b[j])));
    [b, p] = [nb, np];
    const prev = ll;
    ll = nll;
    if (Math.abs(nll - prev) < 1e-10 * (Math.abs(prev) + 1e-10) && step < 1e-8) {
      converged = true;
      break;
    }
  }
  const w = p.map((q) => q * (1 - q));
  const inf = leastSquares(
    X.map((r, i) => r.map((v) => v * Math.sqrt(w[i]))),
    new Array<number>(n).fill(0),
  ).xtxInv;
  const se = b.map((_, j) => Math.sqrt(inf[j][j]));
  const ybar = mean(y);
  const ll0 = n * (ybar > 0 && ybar < 1 ? ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar) : 0);
  const separated = !converged || b.some((v) => Math.abs(v) > 25) || p.some((q) => q < 1e-10 || q > 1 - 1e-10);
  return { b, se, ll, ll0, iter, converged, p, separated };
}
// Hosmer–Lemeshow: the rows in g groups by the deciles of the probability (the breaks the quantiles, repeated ones
// once, as R's ResourceSelection), Σ (O − E)² / E over both outcomes, df = groups − 2
export function hosmerLemeshow(y: number[], p: number[], g = 10): { chi2: number; df: number; p: number; groups: number } {
  const s = sorted(p);
  const br = [...new Set(Array.from({ length: g + 1 }, (_, i) => quantile(s, i / g)))];
  const G = br.length - 1;
  const o1 = new Array<number>(G).fill(0);
  const e1 = new Array<number>(G).fill(0);
  const cnt = new Array<number>(G).fill(0);
  p.forEach((q, i) => {
    // (the interval (b[j], b[j + 1]], the first with its lower end)
    let j = 0;
    while (j < G - 1 && q > br[j + 1]) j++;
    o1[j] += y[i];
    e1[j] += q;
    cnt[j]++;
  });
  let chi2 = 0;
  for (let j = 0; j < G; j++) {
    if (e1[j] > 0) chi2 += (o1[j] - e1[j]) ** 2 / e1[j];
    const e0 = cnt[j] - e1[j];
    if (e0 > 0) chi2 += (cnt[j] - o1[j] - e0) ** 2 / e0;
  }
  return { chi2, df: G - 2, p: G > 2 ? chi2Sf(chi2, G - 2) : NaN, groups: G };
}
export { tP2 };
