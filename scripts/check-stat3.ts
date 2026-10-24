// The checks of the third statistics package (Power & sample size, Bootstrap & permutation, Distribution fit,
// Agreement & reliability, Method comparison, Logistic regression) against statsmodels, SciPy and pingouin
// (scripts/fixtures/tests3-ref.py → tests3-ref.json).
import { readFileSync } from 'node:fs';
import { column, type Column, type Dataset } from '../src/engine/table.ts';
import { kolmogorovCdf, nFor, powerOf, effectFor, type PowerQ } from '../src/engine/stat3.ts';
import { agreeNode, distFitNode, logisticNode, methCompNode, powerNode, resampleNode } from '../src/engine/statnodes3.ts';
import { AGREE_DEFAULTS, DISTFIT_DEFAULTS, LOGISTIC_DEFAULTS, METHCOMP_DEFAULTS, POWER_DEFAULTS, RESAMPLE_DEFAULTS } from '../src/defaults.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkStat3(ok: Ok) {
  const R = JSON.parse(readFileSync(new URL('./fixtures/tests3-ref.json', import.meta.url), 'utf8'));
  const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const num = (name: string, v: number[]): Column => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const val = (ds: Dataset | undefined, col: string, row = 0) => ds?.columns.find((c) => c.name === col)?.values[row] ?? NaN;
  const rowOf = (ds: Dataset | undefined, col: string, name: string) => ds?.columns.find((c) => c.name === col)?.text?.indexOf(name) ?? -1;

  // ---- power: as statsmodels (the sizes found: the next whole number) ----
  {
    const P = R.power;
    const q = (o: Partial<PowerQ>): PowerQ => ({ test: 't2', alt: 'two-sided', alpha: 0.05, ratio: 1, k: 3, p1: 0.3, events: 0.6, ...o });
    const checks: [string, boolean][] = [
      ['t2 n', nFor(q({}), 0.5, 0.8) === Math.ceil(P.t2_n)],
      ['t2 n ratio 2', nFor(q({ ratio: 2 }), 0.4, 0.9) === Math.ceil(P.t2_n_r2)],
      ['t2 power', near(powerOf(q({}), 30, 0.5), P.t2_pow, 1e-8)],
      ['t2 one-sided', near(powerOf(q({ alt: 'one-sided' }), 30, 0.5), P.t2_pow_one, 1e-8)],
      ['t2 effect', near(effectFor(q({}), 40, 0.8), P.t2_d, 1e-6)],
      ['t1 power', near(powerOf(q({ test: 't1' }), 50, 0.3), P.t1_pow, 1e-8)],
      ['anova power', near(powerOf(q({ test: 'anova', k: 4 }), 30, 0.25), P.anova_pow, 1e-7)],
      ['prop power', near(powerOf(q({ test: 'prop', p1: 0.3 }), 100, 0.45), P.prop_pow, 1e-10)],
      ['prop n', nFor(q({ test: 'prop', p1: 0.3 }), 0.45, 0.8) === Math.ceil(P.prop_n)],
      ['chi2 power', near(powerOf(q({ test: 'chi2', k: 3 }), 100, 0.3), P.chi2_pow, 1e-7)],
      ['corr power', near(powerOf(q({ test: 'corr' }), 80, 0.3), P.corr_pow, 1e-10)],
      ['log-rank power', near(powerOf(q({ test: 'logrank', events: 0.6 }), 200, 0.6), P.lr_pow, 1e-10)],
    ];
    const node = powerNode({ ...POWER_DEFAULTS });
    const bad = checks.filter(([, v]) => !v).map(([n]) => n);
    ok(!bad.length && val(node.tables.out, 'Value', rowOf(node.tables.out, 'Quantity', 'n (per group)')) === Math.ceil(P.t2_n) && (node.tables.curve?.columns[0].values.length ?? 0) > 20, `power and sample size as statsmodels${bad.length ? ` (not: ${bad.join(', ')})` : ''}; the node and its curve`);
  }

  // ---- bootstrap and permutation: the intervals as SciPy's within the resampling noise, the exact permutation p ----
  {
    const B = R.boot;
    const ds: Dataset = { name: 'b', columns: [num('A', B.a), num('B', [...B.b, ...new Array(B.a.length - B.b.length).fill(NaN)])] };
    const run = (o: object) => resampleNode(ds, { ...RESAMPLE_DEFAULTS, B: 100000, ...o }).tables.out;
    const med = run({ stat: 'median', cols: 'A', ci: 'bca' });
    const mn = run({ stat: 'mean', cols: 'A', ci: 'percentile' });
    const df = run({ stat: 'diffmean', cols: 'A, B', ci: 'bca' });
    const within = (t: Dataset | undefined, r: number[]) => Math.abs(val(t, 'CI low') - r[0]) < 0.08 * r[2] && Math.abs(val(t, 'CI high') - r[1]) < 0.08 * r[2] && Math.abs(val(t, 'SE') / r[2] - 1) < 0.03;
    const bootOk = within(med, B.med) && within(mn, B.mean) && within(df, B.diff);
    const P = B.perm;
    const pt = resampleNode({ name: 'p', columns: [num('A', P.a), num('B', [...P.b, NaN])] }, { ...RESAMPLE_DEFAULTS, mode: 'permutation', stat: 'diffmean', cols: 'A, B' }).tables.out;
    const C = B.pcorr;
    const pc = resampleNode({ name: 'c', columns: [num('X', C.x), num('Y', C.y)] }, { ...RESAMPLE_DEFAULTS, mode: 'permutation', stat: 'pearson', cols: 'X, Y' }).tables.out;
    const permOk = near(val(pt, 'p'), P.p, 1e-10) && near(val(pt, 'Estimate'), P.stat, 1e-12) && near(val(pc, 'p'), C.p, 1e-10) && pt?.columns.find((c) => c.name === 'Kind')?.text?.[0] === 'exact';
    ok(bootOk && permOk, `bootstrap: BCa median, percentile mean, BCa difference of means as SciPy within the resampling noise (${bootOk}); permutation tests exact as SciPy (${permOk})`);
  }

  // ---- distributions ----
  {
    const D = R.dist;
    const r = distFitNode({ name: 'd', columns: [num('Life (h)', D.x)] }, { ...DISTFIT_DEFAULTS, dists: ['normal', 'lognormal', 'exponential', 'weibull', 'gamma', 'logistic', 'gumbel', 'uniform'] });
    const T = r.tables.out!;
    const ll = (name: string) => val(T, 'Log-likelihood', rowOf(T, 'Distribution', name));
    const names: [string, string][] = [['normal', 'Normal'], ['lognormal', 'Lognormal'], ['exponential', 'Exponential'], ['weibull', 'Weibull'], ['gamma', 'Gamma'], ['logistic', 'Logistic'], ['gumbel', 'Gumbel'], ['uniform', 'Uniform']];
    // (as large as SciPy's maximum, or larger: the optimizers differ by less than 1e-6)
    const llBad = names.filter(([k, nm]) => !(ll(nm) >= D.ll[k] - 1e-6 && ll(nm) - D.ll[k] < 1e-3)).map(([, nm]) => nm);
    const n = rowOf(T, 'Distribution', 'Normal');
    const ksOk = near(val(T, 'KS D', n), D.ks[0], 1e-9) && near(val(T, 'KS p', n), D.ks[1], 1e-7) && near(val(T, 'AD A²', n), D.ad, 1e-9);
    // (SciPy's kstwo exact up to n = 140, then an approximation: ours exact by Marsaglia, Tsang and Wang)
    const kcdf = D.kscdf.every(([nn, d, p]: number[]) => near(kolmogorovCdf(nn, d), p, nn > 140 ? 1e-6 : 1e-9));
    const aics = Array.from(T.columns.find((c) => c.name === 'AIC')!.values);
    const best = aics.every((v, i) => !i || v >= aics[i - 1]);
    const bt = distFitNode({ name: 'b', columns: [num('Fraction', D.beta.x)] }, { ...DISTFIT_DEFAULTS, dists: ['beta'] }).tables.out!;
    const betaOk = val(bt, 'Log-likelihood') >= D.beta.ll - 1e-6;
    ok(!llBad.length && ksOk && kcdf && best && betaOk, `distribution fit: the maximum likelihood of 8 distributions as SciPy${llBad.length ? ` (not: ${llBad.join(', ')})` : ''}; Kolmogorov–Smirnov exact and Anderson–Darling (${ksOk}); Kolmogorov's CDF as scipy.stats.kstwo (${kcdf}); ranked by AIC (${best}); Beta (${betaOk})`);
  }

  // ---- agreement and reliability ----
  {
    const K = R.kappa;
    const ds: Dataset = { name: 'k', columns: [txt('R1', K.r1), txt('R2', K.r2), txt('R3', K.r3)] };
    const kOk = (['none', 'linear', 'quadratic'] as const).every((w, i) => {
      const ref = K[['None', 'linear', 'quadratic'][i]];
      const t = agreeNode(ds, { ...AGREE_DEFAULTS, mode: 'kappa', cols: 'R1, R2', weights: w }).tables.out;
      return near(val(t, 'Value'), ref[0], 1e-12) && near(val(t, 'SE'), ref[1], 1e-10) && near(val(t, 'CI low'), ref[2], 1e-10) && near(val(t, 'z'), ref[4], 1e-9) && near(val(t, 'p'), ref[5], 1e-9);
    });
    const fl = agreeNode(ds, { ...AGREE_DEFAULTS, mode: 'kappa', cols: 'R1, R2, R3' }).tables.out;
    const flOk = near(val(fl, 'Value'), K.fleiss, 1e-12);
    const M = R.rel.M as number[][];
    const rd: Dataset = { name: 'r', columns: [0, 1, 2, 3].map((j) => num(`Rater ${j + 1}`, M.map((r) => r[j]))) };
    const ic = agreeNode(rd, { ...AGREE_DEFAULTS, mode: 'icc' }).tables.out!;
    const iccOk = (R.rel.icc as number[][]).every((ref, i) => near(val(ic, 'ICC', i), ref[0], 1e-10) && near(val(ic, 'F', i), ref[1], 1e-9) && near(val(ic, 'p', i), ref[3], 1e-7) && Math.abs(val(ic, 'CI low', i) - R.rel.ci[i][0]) <= 0.0051 && Math.abs(val(ic, 'CI high', i) - R.rel.ci[i][1]) <= 0.0051);
    const it = R.rel.items as number[][];
    const al = agreeNode({ name: 'a', columns: [0, 1, 2, 3, 4].map((j) => num(`Item ${j + 1}`, it.map((r) => r[j]))) }, { ...AGREE_DEFAULTS, mode: 'alpha' }).tables.out;
    const alOk = near(val(al, 'Value'), R.rel.alpha[0], 1e-10) && near(val(al, 'CI low'), R.rel.alpha[1], 1e-7) && near(val(al, 'CI high'), R.rel.alpha[2], 1e-7);
    const cc = agreeNode(rd, { ...AGREE_DEFAULTS, mode: 'ccc', cols: 'Rater 1, Rater 2' }).tables.out;
    const ccOk = near(val(cc, 'Value'), R.rel.ccc[0], 1e-12) && near(val(cc, 'CI low'), R.rel.ccc[1], 1e-10) && near(val(cc, 'CI high'), R.rel.ccc[2], 1e-10);
    ok(kOk && flOk && iccOk && alOk && ccOk, `agreement: Cohen's κ unweighted, linear, quadratic with SE, CI, z, p as statsmodels (${kOk}); Fleiss's κ (${flOk}); the six ICC with F, p as pingouin, the CI as its (rounded to 0.01) (${iccOk}); Cronbach's α with Feldt's CI (${alOk}); Lin's concordance (${ccOk})`);
  }

  // ---- method comparison ----
  {
    const M = R.meth;
    const ds: Dataset = { name: 'm', columns: [num('Analyzer A', M.x), num('Analyzer B', M.y)] };
    const t = methCompNode(ds, { ...METHCOMP_DEFAULTS, x: 'Analyzer A', y: 'Analyzer B' }).tables.out!;
    const pb = M.pb as number[];
    const pbOk = near(val(t, 'Slope', 0), pb[0], 1e-12) && near(val(t, 'Slope CI low', 0), pb[1], 1e-12) && near(val(t, 'Slope CI high', 0), pb[2], 1e-12) && near(val(t, 'Intercept', 0), pb[3], 1e-12) && near(val(t, 'Intercept CI low', 0), pb[4], 1e-12) && near(val(t, 'Intercept CI high', 0), pb[5], 1e-12);
    const dmOk = near(val(t, 'Slope', 1), M.deming[0], 1e-12) && near(val(t, 'Intercept', 1), M.deming[1], 1e-12) && near(val(t, 'Slope SE', 1), M.deming[2], 1e-9) && near(val(t, 'Intercept SE', 1), M.deming[3], 1e-9);
    const t2 = methCompNode(ds, { ...METHCOMP_DEFAULTS, x: 'Analyzer A', y: 'Analyzer B', method: 'deming', lambda: 2 }).tables.out!;
    const dm2 = near(val(t2, 'Slope', 0), M.deming2[0], 1e-12);
    // (exact lines: y = 2x + 1 gives slope 2 and intercept 1; Passing–Bablok of y on x the inverse of x on y)
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const ex = methCompNode({ name: 'e', columns: [num('x', xs), num('y', xs.map((v) => 2 * v + 1))] }, { ...METHCOMP_DEFAULTS, x: 'x', y: 'y', method: 'pb' }).tables.out;
    const inv = methCompNode({ name: 'i', columns: [num('A', M.y), num('B', M.x)] }, { ...METHCOMP_DEFAULTS, x: 'A', y: 'B', method: 'pb' }).tables.out;
    const propOk = near(val(ex, 'Slope'), 2, 1e-12) && near(val(ex, 'Intercept'), 1, 1e-12) && Math.abs(val(inv, 'Slope') * pb[0] - 1) < 0.01;
    ok(pbOk && dmOk && dm2 && propOk, `method comparison: Passing–Bablok slope, intercept and their intervals (${pbOk}); Deming with jackknife SE, λ 1 and 2 (${dmOk && dm2}); an exact line and the symmetry of Passing–Bablok (${propOk})`);
  }

  // ---- the logistic regression ----
  {
    const L = R.logit;
    const ds: Dataset = { name: 'l', columns: [num('Age', L.age), num('Dose', L.dose), txt('Sex', L.sex), txt('Response', L.y)] };
    const r = logisticNode(ds, { ...LOGISTIC_DEFAULTS, y: 'Response', xs: 'Age, Dose, Sex' });
    const co = r.tables.out!;
    const coefOk = ['Intercept', 'Age', 'Dose', 'Sex [M]'].every((nm, i) => {
      const k = rowOf(co, 'Term', nm);
      return near(val(co, 'Estimate', k), L.b[i], 1e-7) && near(val(co, 'SE', k), L.se[i], 1e-6) && near(val(co, 'p', k), L.p[i], 1e-6);
    });
    const mo = r.tables.model!;
    const st = (n: string) => val(mo, 'Value', rowOf(mo, 'Statistic', n));
    const modelOk = near(st('Log-likelihood'), L.ll, 1e-9) && near(st('Log-likelihood (null)'), L.ll0, 1e-9) && near(st('LR χ²'), L.lr, 1e-7) && near(st('p (LR)'), L.pLR, 1e-6) && near(st('McFadden R²'), L.mcfadden, 1e-8) && near(st('AIC'), L.aic, 1e-9) && near(st('BIC'), L.bic, 1e-9);
    const hlOk = near(st('Hosmer–Lemeshow χ²'), L.hl, 1e-6) && st('Hosmer–Lemeshow df') === L.hlDf;
    const pr = r.tables.fitted!.columns.find((c) => c.name === 'Probability')!.values;
    const probOk = (L.prob as number[]).every((v, i) => near(pr[i], v, 1e-7));
    ok(coefOk && modelOk && hlOk && probOk, `logistic regression: coefficients, SE, p as statsmodels's Logit (${coefOk}); log-likelihoods, LR test, McFadden R², AIC, BIC (${modelOk}); Hosmer–Lemeshow (${hlOk}); the probabilities (${probOk})`);
  }
}
