// Fit additions: a straight line with errors on X and on Y (York 2004; Deming when the errors are constant), and the
// comparisons — two models on the same data (χ², R², AIC, AICc, BIC, Akaike weights, the F-test of nested models) and
// several runs with the same parameters or each its own (the global fit with every parameter shared against separate
// fits: an F-test).
import { fSf, tInv } from './dist.ts';
import type { FitBand, FitRunData, FitStats, RunResult } from './fit.ts';
import type { ModelSpec } from './fitModels.ts';
import { LIBRARY } from './fitModels.ts';
import { column, type Column, type Dataset } from './table.ts';
import { maxOf, minOf } from './minmax.ts';

// York (2004), the errors not correlated: the slope by iteration, its error from the weights W = 1 / (σy² + b²·σx²);
// the errors scaled by √(χ² / (n − 2)) as every fit here. χ² = Σ W·(y − a − b·x)².
export function yorkLine(xs: number[], ys: number[], sx: number[], sy: number[]): { a: number; b: number; cov: number[][]; chi2: number; iterations: number } | string {
  const n = xs.length;
  if (n < 3) return 'York: three points at least.';
  const vx = sx.map((s) => s * s);
  const vy = sy.map((s) => s * s);
  // the start: ordinary least squares
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  xs.forEach((x, i) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (ys[i] - my);
  });
  if (!(sxx > 0)) return 'York: every X is the same.';
  let b = sxy / sxx;
  let W: number[] = [];
  let Xb = 0;
  let Yb = 0;
  let beta: number[] = [];
  let it = 0;
  for (; it < 500; it++) {
    W = vx.map((v, i) => 1 / (vy[i] + b * b * v));
    if (W.some((w) => !Number.isFinite(w))) return 'York: a point with no error on X nor on Y.';
    const sw = W.reduce((s, w) => s + w, 0);
    Xb = W.reduce((s, w, i) => s + w * xs[i], 0) / sw;
    Yb = W.reduce((s, w, i) => s + w * ys[i], 0) / sw;
    beta = W.map((w, i) => w * ((xs[i] - Xb) * vy[i] + b * (ys[i] - Yb) * vx[i]));
    let num = 0;
    let den = 0;
    W.forEach((w, i) => {
      num += w * beta[i] * (ys[i] - Yb);
      den += w * beta[i] * (xs[i] - Xb);
    });
    const nb = num / den;
    if (!Number.isFinite(nb)) return 'York: the slope could not be found.';
    const done = Math.abs(nb - b) <= 1e-15 * Math.max(1, Math.abs(nb));
    b = nb;
    if (done) break;
  }
  W = vx.map((v, i) => 1 / (vy[i] + b * b * v));
  const sw = W.reduce((s, w) => s + w, 0);
  const a = Yb - b * Xb;
  // the adjusted points x = X̄ + β, their weighted mean, the errors
  const xa = beta.map((v) => Xb + v);
  const xm = W.reduce((s, w, i) => s + w * xa[i], 0) / sw;
  const vb = 1 / W.reduce((s, w, i) => s + w * (xa[i] - xm) ** 2, 0);
  const chi2 = W.reduce((s, w, i) => s + w * (ys[i] - a - b * xs[i]) ** 2, 0);
  const scale = chi2 / (n - 2);
  const va = 1 / sw + xm * xm * vb;
  const cab = -xm * vb;
  return { a, b, cov: [[va * scale, cab * scale], [cab * scale, vb * scale]], chi2, iterations: it + 1 };
}

// York on every run: the results as the other fits give them (a + b·x on a grid, its band, the residuals)
export function yorkRuns(runs: (FitRunData & { sx: number[] })[], band: FitBand, points: number): { runs: RunResult[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: RunResult[] = [];
  for (const run of runs) {
    const r = yorkLine(run.xs, run.ys, run.sx, run.sig);
    if (typeof r === 'string') {
      warnings.push(`${run.label}: ${r}`);
      continue;
    }
    const n = run.xs.length;
    const dof = n - 2;
    const my = run.ys.reduce((s, v) => s + v, 0) / n;
    let ssr = 0;
    let sst = 0;
    run.xs.forEach((x, i) => {
      ssr += (run.ys[i] - r.a - r.b * x) ** 2;
      sst += (run.ys[i] - my) ** 2;
    });
    const r2 = sst > 0 ? 1 - ssr / sst : NaN;
    const stats: FitStats = { n, dof, chi2: r.chi2, redChi2: r.chi2 / dof, r2, adjR2: 1 - ((1 - r2) * (n - 1)) / dof, rmse: Math.sqrt(ssr / n), iterations: r.iterations };
    const lo = minOf(run.xs);
    const hi = maxOf(run.xs);
    const m = Math.max(2, Math.min(20000, Math.floor(points) || 400));
    const x = Float64Array.from({ length: m }, (_, k) => lo + ((hi - lo) * k) / (m - 1));
    const t = tInv(0.975, dof);
    const C = r.cov;
    const bandOf = (v: number) => t * Math.sqrt(Math.max(0, C[0][0] + 2 * v * C[0][1] + v * v * C[1][1] + (band === 'prediction' ? stats.redChi2 : 0)));
    out.push({
      label: run.label,
      value: run.value,
      params: [
        { name: 'a', value: r.a, error: Math.sqrt(C[0][0]), fixed: false, shared: false },
        { name: 'b', value: r.b, error: Math.sqrt(C[1][1]), fixed: false, shared: false },
      ],
      stats,
      curve: { x, y: Float64Array.from(x, (v) => r.a + r.b * v), band: band === 'none' ? null : Float64Array.from(x, bandOf) },
      resid: { x: run.xs, r: run.xs.map((v, i) => run.ys[i] - r.a - r.b * v) },
    });
  }
  return { runs: out, warnings };
}

// ---- comparisons ----
export const modelName = (s: ModelSpec) => (s.kind === 'formula' ? s.formula.trim() || 'formula' : s.kind === 'ode' ? 'equations' : s.kind === 'complex' ? 'complex formula' : s.model === 'poly' ? `polynomial (degree ${s.degree})` : (LIBRARY[s.model]?.label ?? s.model));

// one fit (a model on a run, or several runs together): its χ², points, free parameters
export type Scored = { group: string; fit: string; k: number; n: number; chi2: number; r2: number };
// AIC = N·ln(χ²/N) + 2K, AICc = AIC + 2K(K + 1)/(N − K − 1), BIC = N·ln(χ²/N) + K·ln N, K = the free parameters + 1
export function criteria(s: Scored) {
  const K = s.k + 1;
  const base = s.n * Math.log(s.chi2 / s.n);
  const aic = base + 2 * K;
  return { aic, aicc: s.n - K - 1 > 0 ? aic + (2 * K * (K + 1)) / (s.n - K - 1) : NaN, bic: base + K * Math.log(s.n) };
}
// The F-test of two nested fits: the simpler (fewer parameters) against the fuller one.
export function fTest(simple: Scored, full: Scored): { F: number; d1: number; d2: number; p: number } | null {
  const [a, b] = simple.k <= full.k ? [simple, full] : [full, simple];
  const d1 = b.k - a.k;
  const d2 = b.n - b.k;
  if (d1 <= 0 || d2 <= 0) return null;
  const F = (a.chi2 - b.chi2) / d1 / (b.chi2 / d2);
  return { F, d1, d2, p: F > 0 ? fSf(F, d1, d2) : 1 };
}
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? Number(v.toPrecision(d)).toString() : '—');
const fmtP = (p: number) => (p < 1e-4 ? p.toExponential(1) : fmt(p, 3));
// The rows of a comparison (two fits), and the report: the Akaike weights (by AICc, else AIC), the F-test.
export function compare(pair: [Scored, Scored], nested: boolean): { rows: (Scored & ReturnType<typeof criteria> & { weight: number; F: number; p: number })[]; report: string[] } {
  const cr = pair.map(criteria);
  const by = cr.every((c) => Number.isFinite(c.aicc)) ? 'aicc' : 'aic';
  const best = Math.min(cr[0][by], cr[1][by]);
  const e = cr.map((c) => Math.exp(-(c[by] - best) / 2));
  const w = e.map((v) => v / (e[0] + e[1]));
  const f = nested ? fTest(pair[0], pair[1]) : null;
  const rows = pair.map((s, i) => ({ ...s, ...cr[i], weight: w[i], F: i === 1 && f ? f.F : NaN, p: i === 1 && f ? f.p : NaN }));
  const win = w[0] >= w[1] ? 0 : 1;
  const report = [`${pair[0].group}: ${pair[win].fit} preferred by ${by === 'aicc' ? 'AICc' : 'AIC'} (Δ = ${fmt(Math.abs(cr[1][by] - cr[0][by]), 3)}, weight ${fmt(w[win], 3)}); BIC: ${cr[0].bic <= cr[1].bic ? pair[0].fit : pair[1].fit}.`];
  if (f) {
    const [simple, full] = pair[0].k <= pair[1].k ? pair : [pair[1], pair[0]];
    report.push(f.F > 0 ? `  F(${f.d1}, ${f.d2}) = ${fmt(f.F)}, p = ${fmtP(f.p)}: ${f.p < 0.05 ? `${full.fit} is significantly better (p < 0.05)` : `${full.fit} is not significantly better — keep ${simple.fit}`}.` : `  ${full.fit}, with more parameters, fits worse: not nested, or not converged (try other start values).`);
  } else if (nested && pair[0].k === pair[1].k) report.push('  The same number of parameters: no F-test (AIC only).');
  return { rows, report };
}
// the comparisons as a table: a row per fit
export function compareTable(rows: ReturnType<typeof compare>['rows']): Dataset {
  const num = (name: string, f: (r: (typeof rows)[number]) => number, role: Column['role'] = 'none'): Column => ({ ...column(name, Float64Array.from(rows, f)), role });
  const txt = (name: string, f: (r: (typeof rows)[number]) => string): Column => ({ ...column(name, Float64Array.from(rows, () => NaN), rows.map(f)), role: 'label' });
  return {
    name: 'fit comparison',
    columns: [
      txt('data', (r) => r.group),
      txt('fit', (r) => r.fit),
      num('parameters', (r) => r.k),
      num('N', (r) => r.n),
      num('χ²', (r) => r.chi2),
      num('reduced χ²', (r) => r.chi2 / (r.n - r.k)),
      num('R²', (r) => r.r2),
      num('AIC', (r) => r.aic),
      num('AICc', (r) => r.aicc),
      num('BIC', (r) => r.bic),
      num('Akaike weight', (r) => r.weight),
      num('F', (r) => r.F),
      num('p', (r) => r.p),
    ],
  };
}
