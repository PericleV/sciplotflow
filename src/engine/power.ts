// The power of a test and the sample size it needs — at an effect size (Cohen's d for the t-tests, Cohen's f for the
// one-way ANOVA) and α: the probability of finding the effect when it is there, from the noncentral t and F
// distributions (as statsmodels' TTestPower, TTestIndPower, FTestAnovaPower). Pure.
import { fCdf, ibeta, nctCdf, tInv } from './dist.ts';

export type Alt = 'two-sided' | 'less' | 'greater';
// the t-tests: one sample / paired (n), or two samples (n1, n2; ratio n2 / n1)
export function powerT(d: number, n1: number, n2: number | null, alpha: number, alt: Alt): number {
  const two = n2 !== null;
  const df = two ? n1 + n2 - 2 : n1 - 1;
  if (!(df > 0)) return NaN;
  const delta = two ? d * Math.sqrt((n1 * n2) / (n1 + n2)) : d * Math.sqrt(n1);
  if (alt === 'two-sided') {
    const c = tInv(1 - alpha / 2, df);
    return 1 - nctCdf(c, df, delta) + nctCdf(-c, df, delta);
  }
  const c = tInv(1 - alpha, df);
  return alt === 'greater' ? 1 - nctCdf(c, df, delta) : nctCdf(-c, df, delta);
}
// the smallest n (per group: n1 = n, n2 = ratio·n) with this power; NaN beyond a million
export function sampleSizeT(d: number, power: number, alpha: number, alt: Alt, two: boolean, ratio = 1): number {
  if (!(Math.abs(d) > 0) || !(power > 0 && power < 1)) return NaN;
  const pw = (n: number) => powerT(alt === 'less' ? -Math.abs(d) : Math.abs(d), n, two ? Math.max(2, Math.ceil(ratio * n)) : null, alpha, alt);
  let [lo, hi] = [2, 4];
  while (pw(hi) < power) {
    lo = hi;
    hi *= 2;
    if (hi > 1e6) return NaN;
  }
  while (hi - lo > 1) {
    const m = Math.floor((lo + hi) / 2);
    if (pw(m) >= power) hi = m;
    else lo = m;
  }
  return pw(lo) >= power ? lo : hi;
}

// the noncentral F: P(F ≤ f) = Σ Poisson(j; λ/2)·I_x(d1/2 + j, d2/2), x = d1·f / (d1·f + d2)
export function ncfCdf(f: number, d1: number, d2: number, lambda: number): number {
  if (f <= 0) return 0;
  if (!(lambda > 0)) return fCdf(f, d1, d2);
  const x = (d1 * f) / (d1 * f + d2);
  const h = lambda / 2;
  // from the largest Poisson term outward
  const k0 = Math.floor(h);
  const lp = (j: number) => -h + j * Math.log(h) - lgammaInt(j + 1);
  let s = 0;
  for (let j = k0; j < k0 + 10000; j++) {
    const w = Math.exp(lp(j));
    s += w * ibeta(d1 / 2 + j, d2 / 2, x);
    if (w < 1e-16 && j > k0 + 5) break;
  }
  for (let j = k0 - 1; j >= 0; j--) {
    const w = Math.exp(lp(j));
    s += w * ibeta(d1 / 2 + j, d2 / 2, x);
    if (w < 1e-16) break;
  }
  return Math.min(1, s);
}
// ln Γ(n) for a whole n ≥ 1 (Stirling's series past 20)
function lgammaInt(n: number): number {
  if (n < 20) {
    let s = 0;
    for (let k = 2; k < n; k++) s += Math.log(k);
    return s;
  }
  const z = n;
  return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * z) - 1 / (360 * z ** 3) + 1 / (1260 * z ** 5);
}
// the F with P(F ≤ f) = p
export function fInv(p: number, d1: number, d2: number): number {
  let [lo, hi] = [0, 1];
  while (fCdf(hi, d1, d2) < p) hi *= 2;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (fCdf(m, d1, d2) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
// the one-way ANOVA: k groups, N values in all, Cohen's f (λ = f²·N)
export function powerAnova(f: number, k: number, N: number, alpha: number): number {
  const [d1, d2] = [k - 1, N - k];
  if (!(d1 > 0 && d2 > 0)) return NaN;
  const c = fInv(1 - alpha, d1, d2);
  return 1 - ncfCdf(c, d1, d2, f * f * N);
}
// the smallest N in all (equal groups: a multiple of k) with this power
export function sampleSizeAnova(f: number, k: number, power: number, alpha: number): number {
  if (!(f > 0) || !(power > 0 && power < 1) || k < 2) return NaN;
  const pw = (n: number) => powerAnova(f, k, n * k, alpha);
  let [lo, hi] = [2, 4];
  while (pw(hi) < power) {
    lo = hi;
    hi *= 2;
    if (hi > 1e6) return NaN;
  }
  while (hi - lo > 1) {
    const m = Math.floor((lo + hi) / 2);
    if (pw(m) >= power) hi = m;
    else lo = m;
  }
  return (pw(lo) >= power ? lo : hi) * k;
}
