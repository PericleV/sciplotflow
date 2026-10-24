// The nodes of the third statistics package: Power & sample size (no data: a calculator), Bootstrap & permutation,
// Distribution fit, Agreement & reliability, Method comparison and Logistic regression. Each runs the methods of
// stat3.ts and gives its tables and a report in words.
import { pick } from './extract.ts';
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import * as H from './hypo.ts';
import { chi2Sf, normInv, normSf } from './dist.ts';
import { andersonDarling, betaCdf, betaLogPdf, cohenKappa, cronbach, deming, effectFor, fleissKappa, hosmerLemeshow, iccAll, ksTest, linCCC, logistic, nFor, passingBablok, permutation, powerOf, bootstrap, PAIRED, TWO_SAMPLE, type PowerAlt, type PowerTest, type ResampleStat } from './stat3.ts';
import { fitMLE, fisherCov, logLik, paramCI, suspendedOf } from './reliability.ts';
import { makeDist, PARAM_NAMES, type ProbDist } from './probplot.ts';
import { nelderMead } from './reliability.ts';
import { byName, chosen, fp, f3, isText, levelOf, sig, table, type Row, type StatOut } from './statnodes.ts';
import { designOf } from './statnodes2.ts';

// solve: what is found from the others; effect: d, f, r, w, the hazard ratio, or (prop) p2 with p1; n: per group for
// t2, anova, prop, else in all; ratio: n2 / n1; k: anova's groups, χ²'s df; events: log-rank's share with the event
export type PowerData = { test: PowerTest; solve: 'power' | 'n' | 'effect'; effect: number; n: number; power: number; alpha: number; alt: PowerAlt; ratio: number; k: number; p1: number; events: number };
// mode: a bootstrap interval, or a permutation test; the samples: columns (the first, or the first two), or a value
// column split by a factor of two levels; q: the percentile of 'pct'; B: the resamples; seed: their start
export type ResampleData = { mode: 'bootstrap' | 'permutation'; layout: 'columns' | 'indexed'; cols: string; value: string; factor: string; stat: ResampleStat; q: number; B: number; ci: 'percentile' | 'basic' | 'bca'; level: number; alt: 'two-sided' | 'less' | 'greater'; seed: number };
export type FitDist = ProbDist | 'beta';
// censor: a column of the status (failed 1, suspended 0: the life data); dists: those fitted
export type DistFitData = { col: string; censor: string; dists: FitDist[]; level: number };
export type AgreeData = { mode: 'kappa' | 'icc' | 'alpha' | 'ccc'; cols: string; weights: 'none' | 'linear' | 'quadratic'; level: number; alpha: number };
// x: the reference method, y: the other; lambda: the ratio of their error variances (Deming)
export type MethCompData = { x: string; y: string; method: 'pb' | 'deming' | 'both'; lambda: number; level: number };
export type LogisticData = { y: string; positive: string; xs: string; factors: string; refs?: Record<string, string>; interact: boolean; intercept: boolean; threshold: number; alpha: number };

const err = (e: string): StatOut => ({ tables: {}, report: [], warnings: [], errors: [e] });
const natural = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
const pctTxt = (v: number) => `${fmtNum(100 * v, 3)} %`;

// ---- Power & sample size ----
export const EFFECT_NAMES: Record<PowerTest, string> = { t1: 'd (Cohen)', paired: 'd (Cohen, of the differences)', t2: 'd (Cohen)', anova: 'f (Cohen)', prop: 'p2', corr: 'r', chi2: 'w (Cohen)', logrank: 'hazard ratio' };
const TEST_NAMES: Record<PowerTest, string> = { t1: 'one-sample t-test', paired: 'paired t-test', t2: 'two-sample t-test', anova: 'one-way ANOVA', prop: 'two proportions', corr: 'correlation', chi2: 'χ² test', logrank: 'log-rank test' };
export const perGroup = (t: PowerTest) => t === 't2' || t === 'anova' || t === 'prop';
export function powerNode(d: PowerData): StatOut {
  const q = { test: d.test, alt: d.alt, alpha: d.alpha, ratio: d.ratio > 0 ? d.ratio : 1, k: Math.max(d.test === 'anova' ? 2 : 1, Math.round(d.k)), p1: d.p1, events: d.events };
  if (!(d.alpha > 0 && d.alpha < 0.5)) return err('α between 0 and 0.5.');
  if (d.test === 'prop' && !(d.p1 > 0 && d.p1 < 1)) return err('p1, the first proportion, between 0 and 1.');
  if (d.test === 'logrank' && !(d.events > 0 && d.events <= 1)) return err('The share of the subjects with the event, between 0 and 1.');
  const okEffect = (e: number) => (d.test === 'prop' ? e > 0 && e < 1 && e !== d.p1 : d.test === 'corr' ? Math.abs(e) > 0 && Math.abs(e) < 1 : d.test === 'logrank' ? e > 0 && e !== 1 : e !== 0 && Number.isFinite(e));
  let { effect, n, power } = d;
  if (d.solve !== 'effect' && !okEffect(effect)) return err(`The effect (${EFFECT_NAMES[d.test]}): ${d.test === 'prop' ? 'a proportion other than p1' : d.test === 'corr' ? 'between −1 and 1, not 0' : d.test === 'logrank' ? 'positive, not 1' : 'not 0'}.`);
  if (d.solve !== 'n' && !(n >= 2)) return err('The size: 2 or more.');
  if (d.solve !== 'power' && !(power > 0 && power < 1)) return err('The power wanted, between 0 and 1 (0.8: found 4 times in 5).');
  if (d.solve === 'power') power = powerOf(q, n, effect);
  else if (d.solve === 'n') n = nFor(q, effect, power);
  else effect = effectFor(q, n, power);
  const nAll = perGroup(d.test) ? (d.test === 'anova' ? n * q.k : n * (1 + q.ratio)) : n;
  const unit = perGroup(d.test) ? (d.test === 'anova' || q.ratio === 1 ? 'per group' : 'in the first group') : 'in all';
  const rows: Row[] = [
    { Quantity: 'Test', Value: NaN, Note: `${TEST_NAMES[d.test]}, ${d.alt}` },
    { Quantity: 'α', Value: d.alpha, Note: '' },
    ...(d.test === 'prop' ? [{ Quantity: 'p1', Value: d.p1, Note: '' }] : []),
    { Quantity: EFFECT_NAMES[d.test], Value: effect, Note: d.solve === 'effect' ? 'found' : '' },
    { Quantity: `n (${unit})`, Value: n, Note: d.solve === 'n' ? 'found' : '' },
    { Quantity: 'N (in all)', Value: nAll, Note: '' },
    ...(d.test === 'logrank' ? [{ Quantity: 'Events needed', Value: Math.ceil(nAll * d.events), Note: '' }] : []),
    { Quantity: 'Power', Value: power, Note: d.solve === 'power' ? 'found' : '' },
  ];
  const report: string[] = [];
  if (!Number.isFinite(d.solve === 'n' ? n : d.solve === 'effect' ? effect : power)) report.push(d.solve === 'n' ? 'No size reaches this power (over 10 million).' : 'No effect reaches this power at this size.');
  else if (d.solve === 'power') report.push(`${TEST_NAMES[d.test]}: with n = ${fmtNum(n, 6)} ${unit} and ${EFFECT_NAMES[d.test]} = ${fmtNum(effect, 4)}, the power is ${pctTxt(power)} at α = ${d.alpha}.`);
  else if (d.solve === 'n') report.push(`${TEST_NAMES[d.test]}: n = ${n} ${unit} (N = ${fmtNum(nAll, 6)}) for a power of ${pctTxt(power)} at ${EFFECT_NAMES[d.test]} = ${fmtNum(effect, 4)}, α = ${d.alpha}.`);
  else report.push(`${TEST_NAMES[d.test]}: with n = ${fmtNum(n, 6)} ${unit}, the smallest ${EFFECT_NAMES[d.test]} found ${pctTxt(power)} of the time is ${fmtNum(effect, 4)} (α = ${d.alpha}).`);
  if (d.test === 'logrank' && Number.isFinite(nAll)) report.push(`${Math.ceil(nAll * d.events)} events are needed (Schoenfeld): the size depends on how many reach the event.`);
  // (the curve: the power against n, up to about twice the n found)
  const top = Math.max(10, Math.ceil(2 * (Number.isFinite(n) ? n : 50)));
  const lo = d.test === 'corr' ? 4 : 2;
  const ns = [...new Set(Array.from({ length: 60 }, (_, i) => Math.round(lo + ((top - lo) * i) / 59)))];
  const ef = Number.isFinite(effect) ? effect : d.effect;
  const curve: Dataset = { name: 'power curve', columns: [{ ...column(perGroup(d.test) ? `n (${unit})` : 'N', Float64Array.from(ns)), role: 'x' }, { ...column('Power', Float64Array.from(ns, (v) => powerOf(q, v, ef))), role: 'y' }] };
  return { tables: { out: table('power', rows), curve }, report, warnings: [], errors: [] };
}

// ---- Bootstrap & permutation ----
const STAT_NAMES: Record<ResampleStat, string> = { mean: 'mean', median: 'median', sd: 'SD', cv: 'CV (%)', pct: 'percentile', diffmean: 'difference of the means', diffmedian: 'difference of the medians', ratiomean: 'ratio of the means', pearson: 'Pearson r', spearman: 'Spearman ρ' };
export function resampleNode(ds: Dataset, d: ResampleData): StatOut {
  const report: string[] = [];
  const warnings: string[] = [];
  const two = TWO_SAMPLE.includes(d.stat);
  const paired = PAIRED.includes(d.stat);
  let a: number[] = [];
  let b: number[] = [];
  let names: string[] = [];
  if (d.layout === 'indexed') {
    const v = byName(ds, d.value);
    const f = byName(ds, d.factor);
    if (!v) return err(d.value ? `No column “${d.value}”.` : 'Choose the value column.');
    if (!f) return err(d.factor ? `No column “${d.factor}”.` : 'Choose the factor column (the group of every row).');
    const lv: string[] = [];
    for (let i = 0; i < v.values.length; i++) if (Number.isFinite(v.values[i]) && levelOf(f, i) && !lv.includes(levelOf(f, i))) lv.push(levelOf(f, i));
    if (lv.length !== 2) return err(`The factor has ${lv.length} groups: two are needed.`);
    names = lv;
    for (let i = 0; i < v.values.length; i++) if (Number.isFinite(v.values[i])) (levelOf(f, i) === lv[0] ? a : levelOf(f, i) === lv[1] ? b : []).push(v.values[i]);
  } else {
    const cs = chosen(ds, d.cols);
    if (typeof cs === 'string') return err(cs);
    const num = cs.filter((c) => !isText(c));
    const need = two || paired ? 2 : 1;
    if (num.length < need) return err(need === 2 ? 'Choose two columns.' : 'Choose a column.');
    names = num.slice(0, need).map((c) => c.name);
    if (paired) {
      for (let i = 0; i < num[0].values.length; i++)
        if (Number.isFinite(num[0].values[i]) && Number.isFinite(num[1].values[i])) {
          a.push(num[0].values[i]);
          b.push(num[1].values[i]);
        }
    } else {
      a = Array.from(num[0].values).filter(Number.isFinite);
      if (two) b = Array.from(num[1].values).filter(Number.isFinite);
    }
  }
  if (!two && !paired && d.mode === 'permutation') return err('A permutation test compares two groups or two paired columns: choose a difference, a ratio or a correlation.');
  if (a.length < 3 || ((two || paired) && b.length < 3)) return err('At least 3 values in every sample.');
  const B = Math.max(99, Math.min(1e6, Math.round(d.B)));
  const what = `${STAT_NAMES[d.stat]}${d.stat === 'pct' ? ` (${fmtNum(100 * d.q, 4)} %)` : ''}${two ? ` (${names[0]} − ${names[1]})`.replace('−', d.stat === 'ratiomean' ? '/' : '−') : paired ? ` (${names[0]}, ${names[1]})` : ` of ${names[0]}`}`;
  if (d.mode === 'permutation') {
    const r = permutation(d.stat, a, b, B, d.alt, d.seed);
    report.push(`Permutation test of the ${what}: ${fmtNum(r.est, 5)}, ${fp(r.p)} (${r.exact ? `exact, every one of ${r.dist.length} arrangements` : `${r.dist.length} at random`}).`);
    return {
      tables: { out: table('permutation', [{ Statistic: what, Estimate: r.est, p: r.p, Alternative: d.alt, Arrangements: r.dist.length, Kind: r.exact ? 'exact' : 'Monte Carlo' }]), distribution: { name: 'permutations', columns: [{ ...column(`Permuted ${STAT_NAMES[d.stat]}`, Float64Array.from(r.dist)), role: 'y' }] } },
      report,
      warnings,
      errors: [],
    };
  }
  const r = bootstrap(d.stat, a, b, B, d.level, d.ci, d.seed, d.q);
  const CI: Record<ResampleData['ci'], string> = { percentile: 'percentile', basic: 'basic', bca: 'BCa' };
  report.push(`Bootstrap of the ${what}: ${fmtNum(r.est, 5)}, ${Math.round(100 * d.level)} % CI ${fmtNum(r.lo, 5)} to ${fmtNum(r.hi, 5)} (${CI[d.ci]}, ${B} resamples); SE ${fmtNum(r.se, 4)}, bias ${fmtNum(r.bias, 3)}.`);
  if (!Number.isFinite(r.lo) || !Number.isFinite(r.hi)) warnings.push('The interval could not be found (too few distinct resamples).');
  return {
    tables: { out: table('bootstrap', [{ Statistic: what, Estimate: r.est, Bias: r.bias, SE: r.se, 'CI low': r.lo, 'CI high': r.hi, Method: CI[d.ci], Resamples: B }]), distribution: { name: 'bootstrap', columns: [{ ...column(`Bootstrap ${STAT_NAMES[d.stat]}`, Float64Array.from(r.dist)), role: 'y' }] } },
    report,
    warnings,
    errors: [],
  };
}

// ---- Distribution fit ----
export const DIST_LABEL: Record<FitDist, string> = { normal: 'Normal', lognormal: 'Lognormal', exponential: 'Exponential', weibull: 'Weibull', gamma: 'Gamma', logistic: 'Logistic', gumbel: 'Gumbel', uniform: 'Uniform', beta: 'Beta' };
const POSITIVE = new Set<FitDist>(['lognormal', 'exponential', 'weibull', 'gamma']);
type Fitted = { kind: FitDist; p: number[]; names: string[]; ll: number; k: number; cdf: (x: number) => number; pdf: (x: number) => number; ci: [number, number][] };
function fitBeta(x: number[], level: number): Fitted {
  const m = H.mean(x);
  const v = H.variance(x);
  const c = (m * (1 - m)) / v - 1;
  const nll = (t: number[]) => -x.reduce((s, q) => s + betaLogPdf(q, Math.exp(t[0]), Math.exp(t[1])), 0);
  let t = nelderMead(nll, [Math.log(Math.max(0.05, m * c)), Math.log(Math.max(0.05, (1 - m) * c))], [0.3, 0.3]);
  t = nelderMead(nll, t, [0.05, 0.05]);
  const [a, b] = t.map(Math.exp);
  // (the intervals on the log scale, from the numerical information)
  const h = 1e-4;
  const f = (u: number[]) => -nll(u);
  const H2 = [
    [(f([t[0] + h, t[1]]) - 2 * f(t) + f([t[0] - h, t[1]])) / (h * h), (f([t[0] + h, t[1] + h]) - f([t[0] + h, t[1] - h]) - f([t[0] - h, t[1] + h]) + f([t[0] - h, t[1] - h])) / (4 * h * h)],
    [0, (f([t[0], t[1] + h]) - 2 * f(t) + f([t[0], t[1] - h])) / (h * h)],
  ];
  H2[1][0] = H2[0][1];
  const det = H2[0][0] * H2[1][1] - H2[0][1] * H2[1][0];
  const cov = [
    [-H2[1][1] / det, H2[0][1] / det],
    [H2[1][0] / det, -H2[0][0] / det],
  ];
  const z = normInv(1 - (1 - level) / 2);
  const ci = t.map((v, i): [number, number] => [Math.exp(v - z * Math.sqrt(cov[i][i])), Math.exp(v + z * Math.sqrt(cov[i][i]))]);
  return { kind: 'beta', p: [a, b], names: ['α', 'β'], ll: -nll(t), k: 2, cdf: (q) => betaCdf(q, a, b), pdf: (q) => Math.exp(betaLogPdf(q, a, b)), ci };
}
export function distFitNode(ds: Dataset, d: DistFitData): StatOut {
  const report: string[] = [];
  const warnings: string[] = [];
  const c = d.col ? byName(ds, d.col) : chosen(ds, '');
  const col = Array.isArray(c) ? c.find((q) => !isText(q)) : c;
  if (!col || typeof col === 'string') return err(d.col ? `No column “${d.col}”.` : 'Choose the column of the values.');
  const sc = d.censor ? byName(ds, d.censor) : undefined;
  if (d.censor && !sc) return err(`No column “${d.censor}”.`);
  const fail: number[] = [];
  const susp: number[] = [];
  for (let i = 0; i < col.values.length; i++) {
    const v = col.values[i];
    if (!Number.isFinite(v)) continue;
    const s = sc ? suspendedOf(sc.text?.[i], sc.values[i]) : false;
    if (s === null) continue;
    (s ? susp : fail).push(v);
  }
  const all = [...fail, ...susp];
  if (fail.length < 3) return err('At least 3 values (failures) are needed.');
  const kinds = (d.dists.length ? d.dists : (Object.keys(DIST_LABEL) as FitDist[])).filter((k) => {
    if (POSITIVE.has(k) && all.some((v) => v <= 0)) return false;
    if (k === 'beta' && (all.some((v) => v <= 0 || v >= 1) || susp.length)) return false;
    if (k === 'uniform' && susp.length) return false;
    return true;
  });
  const left = (d.dists.length ? d.dists : (Object.keys(DIST_LABEL) as FitDist[])).filter((k) => !kinds.includes(k));
  if (left.length) warnings.push(`Not fitted: ${left.map((k) => DIST_LABEL[k]).join(', ')} (${left.some((k) => k === 'beta') ? 'Beta: values between 0 and 1; ' : ''}the positive ones: values over 0${susp.length ? '; Uniform and Beta: no suspensions' : ''}).`);
  if (!kinds.length) return err('No distribution can be fitted to these values.');
  const fits: Fitted[] = kinds.map((kind) => {
    if (kind === 'beta') return fitBeta(fail, d.level);
    const p = fitMLE(kind, fail, susp);
    const D = makeDist(kind, p);
    const cov = kind === 'uniform' ? null : fisherCov(kind, p, fail, susp);
    return { kind, p, names: PARAM_NAMES[kind], ll: logLik(kind, p, fail, susp), k: p.length, cdf: D.cdf, pdf: D.pdf, ci: kind === 'uniform' ? p.map((): [number, number] => [NaN, NaN]) : paramCI(kind, p, cov, 100 * d.level) };
  });
  const n = all.length;
  const aic = fits.map((f) => -2 * f.ll + 2 * f.k);
  const best = Math.min(...aic);
  const wsum = aic.reduce((s, v) => s + Math.exp(-(v - best) / 2), 0);
  const rows = fits
    .map((f, i) => {
      const gof = susp.length ? null : ksTest(fail, f.cdf);
      return {
        Distribution: DIST_LABEL[f.kind],
        Parameters: f.p.map((v, j) => `${f.names[j]} = ${fmtNum(v, 5)}`).join(', '),
        'Log-likelihood': f.ll,
        AIC: aic[i],
        'ΔAIC': aic[i] - best,
        'Akaike weight': Math.exp(-(aic[i] - best) / 2) / wsum,
        BIC: -2 * f.ll + Math.log(n) * f.k,
        'KS D': gof?.D ?? NaN,
        'KS p': gof?.p ?? NaN,
        'AD A²': susp.length ? NaN : andersonDarling(fail, f.cdf),
      };
    })
    .sort((x, y) => x.AIC - y.AIC);
  const params: Row[] = fits.flatMap((f) => f.p.map((v, j) => ({ Distribution: DIST_LABEL[f.kind], Parameter: f.names[j], Value: v, 'CI low': f.ci[j][0], 'CI high': f.ci[j][1] })));
  // (the curves over the range of the values and a little past it)
  const [lo, hi] = [Math.min(...all), Math.max(...all)];
  const pad = 0.1 * (hi - lo || 1);
  const x0 = kinds.some((k) => POSITIVE.has(k) || k === 'beta') ? Math.max(kinds.includes('beta') ? 1e-6 : 0, lo - pad) : lo - pad;
  const x1 = kinds.includes('beta') ? Math.min(1 - 1e-6, hi + pad) : hi + pad;
  const xs = Array.from({ length: 201 }, (_, i) => x0 + ((x1 - x0) * i) / 200);
  const curves: Dataset = {
    name: 'fitted distributions',
    columns: [{ ...column(col.name, Float64Array.from(xs)), role: 'x' }, ...fits.map((f): Column => ({ ...column(`PDF (${DIST_LABEL[f.kind]})`, Float64Array.from(xs, (v) => f.pdf(v))), role: 'y' })), ...fits.map((f): Column => ({ ...column(`CDF (${DIST_LABEL[f.kind]})`, Float64Array.from(xs, (v) => f.cdf(v))), role: 'none' }))],
  };
  const b0 = rows[0];
  report.push(`${n} values${susp.length ? ` (${susp.length} suspended)` : ''}: the best by AIC is ${b0.Distribution} (${b0.Parameters}; Akaike weight ${fmtNum(b0['Akaike weight'], 3)}).`);
  if (rows.length > 1 && rows[1]['ΔAIC'] < 2) report.push(`${rows[1].Distribution} fits almost as well (ΔAIC = ${fmtNum(rows[1]['ΔAIC'], 3)} < 2).`);
  if (!susp.length && Number.isFinite(b0['KS p'])) report.push(`Kolmogorov–Smirnov: D = ${f3(b0['KS D'])}, ${fp(b0['KS p'])} (the parameters fitted to the same data: the p is too large, a guide).`);
  return { tables: { out: table('fits', rows), parameters: table('parameters', params), curves }, report, warnings, errors: [] };
}

// ---- Agreement & reliability ----
export function agreeNode(ds: Dataset, d: AgreeData): StatOut {
  const report: string[] = [];
  const warnings: string[] = [];
  const lvl = d.level;
  const cs = chosen(ds, d.cols);
  if (typeof cs === 'string') return err(cs);
  if (d.mode === 'kappa') {
    if (cs.length < 2) return err('Choose the columns of the raters (2 or more).');
    const rows: string[][] = [];
    for (let i = 0; i < cs[0].values.length; i++) {
      const r = cs.map((c) => levelOf(c, i));
      if (r.every(Boolean)) rows.push(r);
    }
    if (rows.length < 2) return err('At least 2 subjects rated by every rater.');
    const cats = [...new Set(rows.flat())].sort(natural);
    if (cats.length < 2) return err('Every rating is the same: κ cannot be found.');
    if (cs.length === 2) {
      const t = cats.map((r) => cats.map((c) => rows.filter((q) => q[0] === r && q[1] === c).length));
      const k = cohenKappa(t, d.weights, lvl);
      const W = { none: '', linear: ', linear weights', quadratic: ', quadratic weights' }[d.weights];
      report.push(`Cohen’s κ${W} = ${f3(k.kappa)} (${Math.round(100 * lvl)} % CI ${f3(k.lo)} to ${f3(k.hi)}), ${fp(k.p)}; observed agreement ${pctTxt(k.po)}, expected by chance ${pctTxt(k.pe)}; ${landis(k.kappa)}.`);
      const out = table('kappa', [{ Statistic: `Cohen’s κ${W}`, Value: k.kappa, SE: k.se, 'CI low': k.lo, 'CI high': k.hi, z: k.z, p: k.p, [`Significant (α = ${d.alpha})`]: sig(k.p, d.alpha), 'Observed agreement': k.po, 'Chance agreement': k.pe, Subjects: rows.length }]);
      const wide = table('table', [...cats.map((r, i) => ({ [`${cs[0].name} \\ ${cs[1].name}`]: r, ...Object.fromEntries(cats.map((c, j) => [c, t[i][j]])) }))]);
      return { tables: { out, table: wide }, report, warnings, errors: [] };
    }
    const counts = rows.map((r) => cats.map((c) => r.filter((v) => v === c).length));
    const f = fleissKappa(counts);
    if (d.weights !== 'none') warnings.push('Fleiss’s κ (3 raters or more) has no weights: unweighted.');
    report.push(`Fleiss’s κ = ${f3(f.kappa)} (${cs.length} raters, ${rows.length} subjects), z = ${f3(f.z)}, ${fp(f.p)}; ${landis(f.kappa)}.`);
    return { tables: { out: table('kappa', [{ Statistic: 'Fleiss’s κ', Value: f.kappa, 'SE (κ = 0)': f.se0, z: f.z, p: f.p, [`Significant (α = ${d.alpha})`]: sig(f.p, d.alpha), 'Observed agreement': f.pBar, 'Chance agreement': f.pe, Subjects: rows.length, Raters: cs.length }]) }, report, warnings, errors: [] };
  }
  const num = cs.filter((c) => !isText(c));
  if (num.length < 2) return err('Choose the numeric columns (2 or more).');
  const m: number[][] = [];
  for (let i = 0; i < num[0].values.length; i++) {
    const r = num.map((c) => c.values[i]);
    if (r.every(Number.isFinite)) m.push(r);
  }
  const dropped = num[0].values.length - m.length;
  if (dropped > 0) warnings.push(`${dropped} incomplete row${dropped > 1 ? 's' : ''} left out.`);
  if (m.length < 3) return err('At least 3 complete rows.');
  if (d.mode === 'icc') {
    const r = iccAll(m, lvl);
    report.push(`${m.length} subjects, ${num.length} raters. ${r[1].type} (absolute agreement) = ${f3(r[1].icc)} (${Math.round(100 * lvl)} % CI ${f3(r[1].lo)} to ${f3(r[1].hi)}); ${r[2].type} (consistency) = ${f3(r[2].icc)}; ${koo(r[1].icc)}.`);
    return { tables: { out: table('ICC', r.map((q) => ({ Type: q.type, Model: q.name, ICC: q.icc, F: q.F, df1: q.df1, df2: q.df2, p: q.p, 'CI low': q.lo, 'CI high': q.hi }))) }, report, warnings, errors: [] };
  }
  if (d.mode === 'alpha') {
    const r = cronbach(m, lvl);
    report.push(`Cronbach’s α = ${f3(r.alpha)} (${Math.round(100 * lvl)} % CI ${f3(r.lo)} to ${f3(r.hi)}), ${num.length} items, ${m.length} subjects.`);
    const worst = r.items.reduce((x, y, i) => (y.drop > (r.items[x]?.drop ?? -Infinity) ? i : x), 0);
    if (r.items[worst].drop > r.alpha) report.push(`Without ${num[worst].name}, α would be ${f3(r.items[worst].drop)}.`);
    return {
      tables: { out: table('alpha', [{ Statistic: 'Cronbach’s α', Value: r.alpha, 'CI low': r.lo, 'CI high': r.hi, Items: num.length, Subjects: m.length }]), items: table('items', r.items.map((q, i) => ({ Item: num[i].name, Mean: q.mean, SD: q.sd, 'Item–rest r': q.r, 'α without it': q.drop }))) },
      report,
      warnings,
      errors: [],
    };
  }
  if (num.length !== 2) return err('Lin’s concordance compares two columns.');
  const r = linCCC(
    m.map((q) => q[0]),
    m.map((q) => q[1]),
    lvl,
  );
  report.push(`Lin’s concordance ρc = ${f3(r.ccc)} (${Math.round(100 * lvl)} % CI ${f3(r.lo)} to ${f3(r.hi)}): precision (Pearson r) ${f3(r.r)}, accuracy (Cb) ${f3(r.ccc / r.r)}.`);
  return { tables: { out: table('concordance', [{ Statistic: 'Lin’s ρc', Value: r.ccc, 'CI low': r.lo, 'CI high': r.hi, 'Pearson r': r.r, 'Bias factor Cb': r.ccc / r.r, 'Location shift u': r.shift, 'Scale shift v': r.scale, N: m.length }]) }, report, warnings, errors: [] };
}
// the words of Landis and Koch (1977) for a κ, of Koo and Li (2016) for an ICC
const landis = (k: number) => (k < 0 ? 'poor agreement' : k <= 0.2 ? 'slight agreement' : k <= 0.4 ? 'fair agreement' : k <= 0.6 ? 'moderate agreement' : k <= 0.8 ? 'substantial agreement' : 'almost perfect agreement') + ' (Landis and Koch)';
const koo = (v: number) => (v < 0.5 ? 'poor' : v < 0.75 ? 'moderate' : v < 0.9 ? 'good' : 'excellent') + ' reliability (Koo and Li)';

// ---- Method comparison ----
export function methCompNode(ds: Dataset, d: MethCompData): StatOut {
  const report: string[] = [];
  const warnings: string[] = [];
  const xc = byName(ds, d.x);
  const yc = byName(ds, d.y);
  if (!xc) return err(d.x ? `No column “${d.x}”.` : 'Choose the reference method (X).');
  if (!yc) return err(d.y ? `No column “${d.y}”.` : 'Choose the method compared (Y).');
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < xc.values.length; i++)
    if (Number.isFinite(xc.values[i]) && Number.isFinite(yc.values[i])) {
      x.push(xc.values[i]);
      y.push(yc.values[i]);
    }
  if (x.length < 5) return err('At least 5 pairs of measurements.');
  const lvl = d.level;
  const rows: Row[] = [];
  const lines: Column[] = [];
  const [lo, hi] = [Math.min(...x), Math.max(...x)];
  const ends = [lo, hi];
  const res: Column[] = [{ ...column(xc.name, Float64Array.from(x)), role: 'x' }];
  const verdict = (bLo: number, bHi: number, aLo: number, aHi: number) => [aLo > 0 || aHi < 0 ? 'a constant difference (the intercept is not 0)' : '', bLo > 1 || bHi < 1 ? 'a proportional difference (the slope is not 1)' : ''].filter(Boolean);
  if (d.method !== 'deming') {
    const r = passingBablok(x, y, lvl);
    rows.push({ Method: 'Passing–Bablok', Slope: r.b, 'Slope CI low': r.bLo, 'Slope CI high': r.bHi, Intercept: r.a, 'Intercept CI low': r.aLo, 'Intercept CI high': r.aHi, 'Linearity (CUSUM) p': r.pLinear });
    lines.push({ ...column('Passing–Bablok', Float64Array.from(ends, (v) => r.a + r.b * v)), role: 'y' });
    res.push({ ...column('Residual (Passing–Bablok)', Float64Array.from(x, (v, i) => y[i] - r.a - r.b * v)), role: 'y' });
    const v = verdict(r.bLo, r.bHi, r.aLo, r.aHi);
    report.push(`Passing–Bablok: ${yc.name} = ${fmtNum(r.a, 4)} + ${fmtNum(r.b, 4)} · ${xc.name}; slope ${Math.round(100 * lvl)} % CI ${fmtNum(r.bLo, 4)} to ${fmtNum(r.bHi, 4)}, intercept ${fmtNum(r.aLo, 4)} to ${fmtNum(r.aHi, 4)}: ${v.length ? v.join(' and ') : 'the methods agree (slope 1 and intercept 0 within the intervals)'}.`);
    if (r.pLinear < 0.05) warnings.push(`Passing–Bablok: the CUSUM test says the relation is not linear (p = ${fmtNum(r.pLinear, 3)}): the method does not apply.`);
  }
  if (d.method !== 'pb') {
    const lam = d.lambda > 0 ? d.lambda : 1;
    const r = deming(x, y, lam, lvl);
    rows.push({ Method: `Deming (λ = ${fmtNum(lam, 4)})`, Slope: r.b, 'Slope CI low': r.bLo, 'Slope CI high': r.bHi, Intercept: r.a, 'Intercept CI low': r.aLo, 'Intercept CI high': r.aHi, 'Slope SE': r.seB, 'Intercept SE': r.seA });
    lines.push({ ...column('Deming', Float64Array.from(ends, (v) => r.a + r.b * v)), role: 'y' });
    res.push({ ...column('Residual (Deming)', Float64Array.from(x, (v, i) => y[i] - r.a - r.b * v)), role: 'y' });
    const v = verdict(r.bLo, r.bHi, r.aLo, r.aHi);
    report.push(`Deming: slope ${fmtNum(r.b, 4)} (${fmtNum(r.bLo, 4)} to ${fmtNum(r.bHi, 4)}), intercept ${fmtNum(r.a, 4)} (${fmtNum(r.aLo, 4)} to ${fmtNum(r.aHi, 4)}): ${v.length ? v.join(' and ') : 'the methods agree'}.`);
  }
  lines.push({ ...column('Identity (y = x)', Float64Array.from(ends)), role: 'y' });
  return { tables: { out: table('regression', rows), line: { name: 'lines', columns: [{ ...column(`${xc.name} (line)`, Float64Array.from(ends)), role: 'x' }, ...lines] }, residuals: { name: 'residuals', columns: res } }, report, warnings, errors: [] };
}

// ---- Logistic regression ----
export function logisticNode(ds: Dataset, d: LogisticData): StatOut {
  const a = d.alpha;
  const report: string[] = [];
  const warnings: string[] = [];
  const yc = byName(ds, d.y);
  if (!yc) return err(d.y ? `No column “${d.y}”.` : 'Choose the outcome (Y: two values, yes / no, 1 / 0 …).');
  const levels = [...new Set(Array.from(yc.values, (_, i) => levelOf(yc, i)).filter(Boolean))];
  if (levels.length !== 2) return err(`${yc.name}: two outcomes are needed, ${levels.length} found.`);
  const posName = d.positive && levels.includes(d.positive) ? d.positive : (levels.find((l) => /^(1|yes|true|pos|positive|case|event|success|died|dead)$/i.test(l)) ?? [...levels].sort(natural)[1]);
  const dz = designOf(ds, { ...d, intercept: d.intercept }, yc, (i) => !!levelOf(yc, i));
  if (typeof dz === 'string') return err(dz);
  const { xs, rowsUsed, names, cols } = dz;
  const n = rowsUsed.length;
  const k = cols.length;
  if (n <= k + 1) return err(`${n} complete rows for ${k} coefficients: more rows are needed.`);
  const y = rowsUsed.map((i): number => (levelOf(yc, i) === posName ? 1 : 0));
  const events = y.reduce((s, v) => s + v, 0);
  if (events === 0 || events === n) return err(`Every row has the same outcome (${events ? posName : 'not ' + posName}).`);
  const X = rowsUsed.map((_, r) => cols.map((c) => c[r]));
  const L = logistic(X, y);
  if (L.separated) warnings.push('The outcome is (nearly) separated by the predictors: the coefficients grow without bound and their SE are not to be trusted.');
  const z = normInv(1 - a / 2);
  const coef: Row[] = names.map((nm, j) => {
    const b = L.b[j];
    const se = L.se[j];
    const zz = b / se;
    const p = 2 * normSf(Math.abs(zz));
    return { Term: nm, Estimate: b, SE: se, z: zz, p, 'CI low': b - z * se, 'CI high': b + z * se, 'Odds ratio': Math.exp(b), 'OR CI low': Math.exp(b - z * se), 'OR CI high': Math.exp(b + z * se), [`Significant (α = ${a})`]: sig(p, a) };
  });
  const lr = 2 * (L.ll - L.ll0);
  const dfM = k - (d.intercept ? 1 : 0);
  const pLR = chi2Sf(lr, dfM);
  const cs = 1 - Math.exp((2 * (L.ll0 - L.ll)) / n);
  const nag = cs / (1 - Math.exp((2 * L.ll0) / n));
  const hl = hosmerLemeshow(y, L.p);
  const thr = d.threshold > 0 && d.threshold < 1 ? d.threshold : 0.5;
  const pred = L.p.map((q) => (q >= thr ? 1 : 0));
  const tp = pred.filter((v, i) => v && y[i]).length;
  const fpN = pred.filter((v, i) => v && !y[i]).length;
  const fn = pred.filter((v, i) => !v && y[i]).length;
  const tn = n - tp - fpN - fn;
  const model: Row[] = [
    { Statistic: 'N', Value: n },
    { Statistic: `Events (${posName})`, Value: events },
    { Statistic: 'Log-likelihood', Value: L.ll },
    { Statistic: 'Log-likelihood (null)', Value: L.ll0 },
    { Statistic: 'LR χ²', Value: lr },
    { Statistic: 'df', Value: dfM },
    { Statistic: 'p (LR)', Value: pLR },
    { Statistic: 'McFadden R²', Value: 1 - L.ll / L.ll0 },
    { Statistic: 'Cox–Snell R²', Value: cs },
    { Statistic: 'Nagelkerke R²', Value: nag },
    { Statistic: 'AIC', Value: -2 * L.ll + 2 * k },
    { Statistic: 'BIC', Value: -2 * L.ll + Math.log(n) * k },
    { Statistic: 'Hosmer–Lemeshow χ²', Value: hl.chi2 },
    { Statistic: 'Hosmer–Lemeshow df', Value: hl.df },
    { Statistic: 'p (Hosmer–Lemeshow)', Value: hl.p },
    { Statistic: 'Iterations', Value: L.iter + 1 },
  ];
  const classification = table('classification', [
    { '': `Observed ${posName}`, [`Predicted ${posName}`]: tp, 'Predicted other': fn, '% correct': (100 * tp) / (tp + fn) },
    { '': 'Observed other', [`Predicted ${posName}`]: fpN, 'Predicted other': tn, '% correct': (100 * tn) / (tn + fpN) },
    { '': 'Overall', [`Predicted ${posName}`]: NaN, 'Predicted other': NaN, '% correct': (100 * (tp + tn)) / n },
  ]);
  const dev = L.p.map((q, i) => Math.sign(y[i] - q) * Math.sqrt(-2 * (y[i] ? Math.log(q) : Math.log(1 - q))));
  const fitted: Dataset = {
    name: 'fitted',
    columns: [
      { ...column('Row', Float64Array.from(rowsUsed, (i) => i + 1)), role: 'none' },
      { ...column('Observed', new Float64Array(n).fill(NaN), rowsUsed.map((i) => levelOf(yc, i))), role: 'label' },
      { ...column('Probability', Float64Array.from(L.p)), role: 'y' },
      { ...column('Predicted', new Float64Array(n).fill(NaN), pred.map((v) => (v ? posName : levels.find((l) => l !== posName)!))), role: 'label' },
      { ...column('Pearson residual', Float64Array.from(L.p, (q, i) => (y[i] - q) / Math.sqrt(q * (1 - q)))), role: 'none' },
      { ...column('Deviance residual', Float64Array.from(dev)), role: 'none' },
    ],
  };
  report.push(`P(${yc.name} = ${posName}) on ${xs.map((c) => c.name).join(', ')}: LR χ²(${dfM}) = ${f3(lr)}, ${fp(pLR)}; Nagelkerke R² = ${f3(nag)}; N = ${n} (${events} ${posName}).`);
  const sigT = coef.filter((c) => c.Term !== 'Intercept' && (c.p as number) < a);
  report.push(sigT.length ? `Significant at α = ${a}: ${sigT.map((c) => `${c.Term} (OR ${fmtNum(c['Odds ratio'] as number, 4)})`).join(', ')}.` : `No predictor is significant at α = ${a}.`);
  report.push(`At the threshold ${thr}: ${pctTxt((tp + tn) / n)} classified right; Hosmer–Lemeshow ${fp(hl.p)}${hl.p < a ? ': the probabilities do not fit the outcomes well' : ''}.`);
  if (events < 10 * dfM || n - events < 10 * dfM) warnings.push('Fewer than 10 events per predictor: the coefficients may be biased (more data, or fewer predictors).');
  return { tables: { out: table('coefficients', coef), model: table('model', model), classification, fitted }, report, warnings, errors: [] };
}

// What a node waits for, in words
export const STAT3_WAIT: Record<string, string> = {
  resample: 'Connect a dataset: the sample(s) as columns, or a value column with a factor of two groups.',
  distfit: 'Connect a dataset with a column of values (and, for life data, a column of their status).',
  agree: 'Connect a dataset: a row per subject, a column per rater (or per item).',
  methcomp: 'Connect a dataset: a row per sample, measured by both methods.',
  logistic: 'Connect a dataset: the outcome (two values) and the predictors, a row per observation.',
};
// the values of the outcome (Logistic regression: the positive one), and its categories' levels
export function stat3Levels(ds: Dataset, n: { type: string; data: unknown }): Record<string, string[]> | undefined {
  if (n.type !== 'logistic') return undefined;
  const d = n.data as LogisticData;
  const lv = (name: string) => {
    const c = byName(ds, name);
    if (!c) return [];
    const out: string[] = [];
    for (let i = 0; i < c.values.length && out.length <= 50; i++) {
      const v = levelOf(c, i);
      if (v && !out.includes(v)) out.push(v);
    }
    return out.length > 50 ? [] : out.sort(natural);
  };
  const res: Record<string, string[]> = { outcome: lv(d.y) };
  if (d.xs.trim()) {
    const names = ds.columns.map((c) => c.name);
    const fset = new Set(d.factors.trim() ? pick(d.factors, names, true).found.map((j) => names[j]) : []);
    for (const j of pick(d.xs, names, true).found) {
      const c = ds.columns[j];
      if (c.name !== d.y && (isText(c) || fset.has(c.name))) res[c.name] = lv(c.name);
    }
  }
  return res;
}
