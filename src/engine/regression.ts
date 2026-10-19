// Regression on several predictors: linear least squares (the coefficients with their standard errors, t, p and
// confidence intervals, R², adjusted R², the F-test of the model, AIC and BIC, the variance inflation of every
// predictor) and logistic regression for a yes / no response (fitted by Newton's method — iteratively reweighted least
// squares: the coefficients with z, p and the odds ratios, the deviance, McFadden's R², the likelihood-ratio test).
// As statsmodels' OLS and Logit. Pure.
import { chi2Sf, fSf, normInv, normSf, tInv, tP2 } from './dist.ts';
import { invert } from './lm.ts';

export type Coef = { name: string; value: number; se: number; stat: number; p: number; lo: number; hi: number; vif?: number; odds?: number; oddsLo?: number; oddsHi?: number };
export type RegResult = {
  kind: 'linear' | 'logistic';
  coefs: Coef[];
  n: number;
  fitted: number[];
  resid: number[];
  stats: Record<string, number>;
  warnings: string[];
};

// the design matrix: 1 and the predictors, a row per observation
const design = (X: number[][]) => X.map((r) => [1, ...r]);
function xtx(A: number[][], w?: number[]): number[][] {
  const p = A[0].length;
  const M = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  A.forEach((r, i) => {
    const wi = w ? w[i] : 1;
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) M[a][b] += wi * r[a] * r[b];
  });
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) M[a][b] = M[b][a];
  return M;
}
const matVec = (M: number[][], v: number[]) => M.map((r) => r.reduce((s, q, j) => s + q * v[j], 0));

export function linearRegression(X: number[][], y: number[], names: string[], level = 0.95): RegResult | string {
  const n = y.length;
  const A = design(X);
  const p = A[0]?.length ?? 1;
  if (n <= p) return `${n} observations for ${p} coefficients: more are needed.`;
  const inv = invert(xtx(A));
  if (!inv) return 'The predictors depend on each other (one is a combination of the others): no unique fit.';
  const beta = matVec(inv, A[0].map((_, j) => A.reduce((s, r, i) => s + r[j] * y[i], 0)));
  const fitted = A.map((r) => r.reduce((s, q, j) => s + q * beta[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const sse = resid.reduce((s, v) => s + v * v, 0);
  const my = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const dfE = n - p;
  const s2 = sse / dfE;
  const t = tInv(1 - (1 - level) / 2, dfE);
  const vifs = names.map((_, k) => {
    if (names.length < 2) return 1;
    const others = X.map((r) => r.filter((__, j) => j !== k));
    const r = linearRegression(others, X.map((q) => q[k]), names.filter((__, j) => j !== k), level);
    return typeof r === 'string' ? Infinity : 1 / (1 - r.stats['R²']);
  });
  const coefs: Coef[] = beta.map((b, j) => {
    const se = Math.sqrt(Math.max(0, s2 * inv[j][j]));
    const st = b / se;
    return { name: j === 0 ? 'intercept' : names[j - 1], value: b, se, stat: st, p: tP2(st, dfE), lo: b - t * se, hi: b + t * se, ...(j > 0 ? { vif: vifs[j - 1] } : {}) };
  });
  const k = p - 1;
  const r2 = sst > 0 ? 1 - sse / sst : NaN;
  const F = k > 0 ? (sst - sse) / k / s2 : NaN;
  // the log-likelihood (normal errors) for AIC and BIC
  const ll = (-n / 2) * (Math.log(2 * Math.PI) + Math.log(sse / n) + 1);
  return {
    kind: 'linear',
    coefs,
    n,
    fitted,
    resid,
    stats: { N: n, 'R²': r2, 'adj. R²': 1 - ((1 - r2) * (n - 1)) / dfE, F, 'p (F)': k > 0 ? fSf(F, k, dfE) : NaN, 'df model': k, 'df residual': dfE, RMSE: Math.sqrt(s2), 'log-likelihood': ll, AIC: -2 * ll + 2 * p, BIC: -2 * ll + p * Math.log(n) },
    warnings: vifs.some((v) => v > 10) ? [`Strongly related predictors (VIF > 10: ${names.filter((_, j) => vifs[j] > 10).join(', ')}): their coefficients are uncertain.`] : [],
  };
}

export function logisticRegression(X: number[][], y: number[], names: string[], level = 0.95): RegResult | string {
  const n = y.length;
  if (y.some((v) => v !== 0 && v !== 1)) return 'Logistic regression: the response must be 0 or 1 (two levels).';
  const A = design(X);
  const p = A[0]?.length ?? 1;
  if (n <= p) return `${n} observations for ${p} coefficients: more are needed.`;
  const ones = y.reduce((s, v) => s + v, 0);
  if (ones === 0 || ones === n) return 'Logistic regression: the response has one level only.';
  let beta = new Array<number>(p).fill(0);
  beta[0] = Math.log(ones / (n - ones));
  const prob = (b: number[]) => A.map((r) => 1 / (1 + Math.exp(-r.reduce((s, q, j) => s + q * b[j], 0))));
  const llOf = (pr: number[]) => y.reduce((s, v, i) => s + (v ? Math.log(Math.max(pr[i], 1e-300)) : Math.log(Math.max(1 - pr[i], 1e-300))), 0);
  const warnings: string[] = [];
  let pr = prob(beta);
  let ll = llOf(pr);
  let inv: number[][] | null = null;
  let it = 0;
  for (; it < 100; it++) {
    const w = pr.map((q) => Math.max(q * (1 - q), 1e-12));
    inv = invert(xtx(A, w));
    if (!inv) return 'Logistic regression: the predictors depend on each other.';
    const grad = A[0].map((_, j) => A.reduce((s, r, i) => s + r[j] * (y[i] - pr[i]), 0));
    const step = matVec(inv, grad);
    // a step halved until the likelihood grows
    let t = 1;
    let next = beta.map((b, j) => b + step[j]);
    let pn = prob(next);
    let lln = llOf(pn);
    while (lln < ll - 1e-12 && t > 1e-6) {
      t /= 2;
      next = beta.map((b, j) => b + t * step[j]);
      pn = prob(next);
      lln = llOf(pn);
    }
    const change = Math.max(...step.map((s, j) => Math.abs(t * s) / Math.max(1, Math.abs(beta[j]))));
    [beta, pr, ll] = [next, pn, lln];
    if (change < 1e-10) break;
  }
  const w = pr.map((q) => Math.max(q * (1 - q), 1e-300));
  inv = invert(xtx(A, w));
  if (!inv) return 'Logistic regression: the predictors depend on each other.';
  if (beta.some((b) => Math.abs(b) > 30) || pr.every((q, i) => Math.abs(q - y[i]) < 1e-6)) warnings.push('The two levels are (almost) perfectly separated by the predictors: the coefficients run away, their errors are not meaningful.');
  const ll0 = ones * Math.log(ones / n) + (n - ones) * Math.log(1 - ones / n);
  const z = normInv(1 - (1 - level) / 2);
  const coefs: Coef[] = beta.map((b, j) => {
    const se = Math.sqrt(Math.max(0, inv![j][j]));
    const st = b / se;
    return { name: j === 0 ? 'intercept' : names[j - 1], value: b, se, stat: st, p: 2 * normSf(Math.abs(st)), lo: b - z * se, hi: b + z * se, odds: Math.exp(b), oddsLo: Math.exp(b - z * se), oddsHi: Math.exp(b + z * se) };
  });
  const lr = 2 * (ll - ll0);
  return {
    kind: 'logistic',
    coefs,
    n,
    fitted: pr,
    resid: y.map((v, i) => v - pr[i]),
    stats: { N: n, 'log-likelihood': ll, 'null log-likelihood': ll0, deviance: -2 * ll, "McFadden's R²": 1 - ll / ll0, 'LR χ²': lr, 'p (LR)': chi2Sf(lr, p - 1), AIC: -2 * ll + 2 * p, BIC: -2 * ll + p * Math.log(n), iterations: it + 1, 'correctly classified %': (100 * pr.filter((q, i) => (q >= 0.5 ? 1 : 0) === y[i]).length) / n },
    warnings,
  };
}
