// The checks of the second statistics package (Adjust p-values, Contingency tables, ROC curve, Survival, Linear
// regression) against statsmodels, SciPy, lifelines and scikit-learn (scripts/fixtures/tests2-ref.py → tests2-ref.json).
import { readFileSync } from 'node:fs';
import { column, type Column, type Dataset } from '../src/engine/table.ts';
import { padjust, type PAdjust } from '../src/engine/stat2.ts';
import { contingencyNode, pAdjustNode, regressNode, rocNode, survivalNode } from '../src/engine/statnodes2.ts';
import { CONTINGENCY_DEFAULTS, PADJUST_DEFAULTS, REGRESS_DEFAULTS, ROC_DEFAULTS, SURVIVAL_DEFAULTS } from '../src/defaults.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkStat2(ok: Ok) {
  const R = JSON.parse(readFileSync(new URL('./fixtures/tests2-ref.json', import.meta.url), 'utf8'));
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
  const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const num = (name: string, v: number[]): Column => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const val = (ds: Dataset | undefined, col: string, row = 0) => ds?.columns.find((c) => c.name === col)?.values[row] ?? NaN;
  const rowOf = (ds: Dataset | undefined, col: string, name: string) => ds?.columns.find((c) => c.name === col)?.text?.indexOf(name) ?? -1;

  // ---- p-values adjusted: every method as statsmodels's multipletests (as R's p.adjust) ----
  {
    const P = R.padjust;
    const bad = (['bonferroni', 'holm', 'hochberg', 'hommel', 'bh', 'by'] as PAdjust[]).filter((m) => padjust(P.p, m).some((v, i) => !near(v, P[m][i], 1e-12)));
    const ds: Dataset = { name: 'tests', columns: [txt('Gene', P.p.map((_: number, i: number) => `g${i + 1}`)), num('p', [...P.p, NaN].slice(0, P.p.length))] };
    const r = pAdjustNode(ds, { ...PADJUST_DEFAULTS, method: 'bh' });
    const outCol = r.tables.out?.columns.find((c) => c.name.startsWith('p adjusted'));
    ok(!bad.length && !!outCol && near(outCol.values[0], P.bh[0], 1e-12) && r.report.length === 1, `adjust p-values: Bonferroni, Holm, Hochberg, Hommel, BH, BY as statsmodels${bad.length ? ` (not: ${bad.join(', ')})` : ''}; the node finds the p column`);
  }

  // ---- contingency tables ----
  {
    const C = R.rxc;
    const table = (t: number[][]): Dataset => ({ name: 't', columns: [txt('Group', t.map((_, i) => `r${i + 1}`)), ...t[0].map((_, j) => num(`c${j + 1}`, t.map((r) => r[j])))] });
    const r = contingencyNode(table(C.t), { ...CONTINGENCY_DEFAULTS, layout: 'table' });
    const T = r.tables.out;
    const pRow = (name: string) => rowOf(T, 'Test', name);
    const ok1 = near(val(T, 'Statistic', pRow('Pearson χ²')), C.chi2, 1e-10) && near(val(T, 'p', pRow('Pearson χ²')), C.p, 1e-9) && near(val(T, 'Statistic', pRow('G-test (likelihood ratio)')), C.G, 1e-10) && near(val(T, 'p', pRow('Fisher’s exact test')), C.fisher, 1e-9) && near(val(r.tables.measures, 'Value', 0), C.V, 1e-10) && near(val(r.tables.measures, 'Value', 1), C.C, 1e-10);
    // (the same table as raw rows: the same χ²)
    const raw: string[][] = [];
    C.t.forEach((row: number[], i: number) => row.forEach((n, j) => { for (let k = 0; k < n; k++) raw.push([`r${i + 1}`, `c${j + 1}`]); }));
    const rr = contingencyNode({ name: 'raw', columns: [txt('A', raw.map((q) => q[0])), txt('B', raw.map((q) => q[1]))] }, { ...CONTINGENCY_DEFAULTS, rowCol: 'A', colCol: 'B' });
    const ok2 = near(val(rr.tables.out, 'Statistic', 0), C.chi2, 1e-10);
    const D = R.two;
    const r2 = contingencyNode(table(D.t), { ...CONTINGENCY_DEFAULTS, layout: 'table', yates: true });
    const T2 = r2.tables.out;
    const M2 = r2.tables.measures;
    const mrow = (n: string) => M2?.columns[0].text?.findIndex((t) => t.startsWith(n)) ?? -1;
    const ok3 =
      near(val(T2, 'Statistic', rowOf(T2, 'Test', 'Pearson χ²')), D.chi2, 1e-10) &&
      near(val(T2, 'Statistic', rowOf(T2, 'Test', 'χ² with Yates’s correction')), D.yates, 1e-10) &&
      near(val(T2, 'p', rowOf(T2, 'Test', 'Fisher’s exact test')), D.fisher, 1e-9) &&
      near(val(M2, 'Value', mrow('Odds ratio')), D.or, 1e-10) &&
      near(val(M2, 'CI low', mrow('Odds ratio')), D.orCI[0], 1e-8) &&
      near(val(M2, 'CI high', mrow('Odds ratio')), D.orCI[1], 1e-8) &&
      near(val(M2, 'Value', mrow('Relative risk')), D.rr, 1e-10) &&
      near(val(M2, 'CI low', mrow('Relative risk')), D.rrCI[0], 1e-8) &&
      near(val(M2, 'CI high', mrow('Relative risk')), D.rrCI[1], 1e-8) &&
      near(Math.abs(val(M2, 'Value', mrow('φ'))), D.phi, 1e-10);
    const mc = contingencyNode(table(D.mcnemar.t), { ...CONTINGENCY_DEFAULTS, layout: 'table', test: 'mcnemar', yates: true });
    const ok4 = near(val(mc.tables.out, 'Statistic', 0), D.mcnemar.stat, 1e-12) && near(val(mc.tables.out, 'p', 0), D.mcnemar.p, 1e-10) && near(val(mc.tables.out, 'p', 1), D.mcnemar.exact, 1e-10);
    const sm = contingencyNode(table(D.small.t), { ...CONTINGENCY_DEFAULTS, layout: 'table' });
    const ok5 = near(val(sm.tables.out, 'p', rowOf(sm.tables.out, 'Test', 'Fisher’s exact test')), D.small.fisher, 1e-9) && sm.warnings.some((w) => /under 5/.test(w)) && /Fisher/.test(sm.report[0]);
    const G = R.gof;
    const gf = contingencyNode({ name: 'g', columns: [txt('Colour', ['a', 'b', 'c', 'd']), num('n', G.obs), num('expected', G.exp)] }, { ...CONTINGENCY_DEFAULTS, layout: 'table', test: 'gof', cols: 'n', expected: 'expected' });
    const ok6 = near(val(gf.tables.out, 'Statistic', 0), G.chi2, 1e-10) && near(val(gf.tables.out, 'p', 0), G.p, 1e-9);
    ok(ok1 && ok2 && ok3 && ok4 && ok5 && ok6, `contingency: r × c χ², G, Fisher, V, C (${ok1}); raw rows (${ok2}); 2 × 2 Yates, Fisher, odds ratio, relative risk with CI, φ (${ok3}); McNemar (${ok4}); a sparse table → Fisher (${ok5}); goodness of fit (${ok6})`);
  }

  // ---- ROC ----
  {
    const O = R.roc;
    const ds: Dataset = { name: 'roc', columns: [num('Disease', O.y), num('Marker A', O.s1), num('Marker B', O.s2)] };
    const r = rocNode(ds, { ...ROC_DEFAULTS, truth: 'Disease', scores: 'Marker A, Marker B' });
    const A = r.tables.out;
    const cv = r.tables.curves;
    const fx = cv?.columns[0].values ?? new Float64Array();
    const fy = cv?.columns[1].values ?? new Float64Array();
    const nPts = Array.from(fx).filter(Number.isFinite).length;
    const curveOk = nPts === O.fpr.length && O.fpr.every((v: number, i: number) => near(fx[i], v, 1e-12) && near(fy[i], O.tpr[i], 1e-12));
    const opt = r.tables.optimal;
    const ok1 = near(val(A, 'AUC', 0), O.auc1, 1e-12) && near(val(A, 'AUC', 1), O.auc2, 1e-12) && near(val(A, 'SE', 0), O.se1, 1e-10) && near(val(A, 'SE', 1), O.se2, 1e-10);
    const ok2 = near(val(r.tables.compare, 'z', 0), O.z, 1e-9) && near(val(r.tables.compare, 'p', 0), O.p, 1e-9);
    const ok3 = near(val(opt, 'Threshold', 0), O.youdenThr, 1e-12) && near(val(opt, 'Sensitivity', 0), O.youdenSens, 1e-12) && near(val(opt, 'Specificity', 0), O.youdenSpec, 1e-12);
    // (a lower score meaning positive: the same curve, found by itself)
    const neg = rocNode({ name: 'r', columns: [num('Disease', O.y), num('Minus', O.s1.map((v: number) => -v))] }, { ...ROC_DEFAULTS, truth: 'Disease', scores: 'Minus' });
    ok(ok1 && ok2 && ok3 && curveOk && near(val(neg.tables.out, 'AUC', 0), O.auc1, 1e-12), `ROC: AUC ${val(A, 'AUC', 0).toFixed(4)} and its DeLong SE as scikit-learn and the definition (${ok1}); DeLong's test of two (${ok2}); the curve as roc_curve (${curveOk}); Youden's threshold (${ok3}); a lower score, found`);
  }

  // ---- survival ----
  {
    const S = R.surv;
    const ds: Dataset = { name: 's', columns: [num('Months', [...S.tA, ...S.tB, ...S.tC]), num('Died', [...S.eA, ...S.eB, ...S.eC]), txt('Arm', [...S.tA.map(() => 'A'), ...S.tB.map(() => 'B'), ...S.tC.map(() => 'C')])] };
    const one: Dataset = { name: 's', columns: [num('Months', S.tA), num('Died', S.eA)] };
    const r1 = survivalNode(one, { ...SURVIVAL_DEFAULTS, time: 'Months', event: 'Died' });
    const cv = r1.tables.curves!;
    // (lifelines: S at 0 and every time of the data; ours from (0, 1) and at every time with events or censoring)
    const ts = cv.columns[0].values;
    const kmOk = S.times.every((t: number, i: number) => {
      const k = Array.from(ts).lastIndexOf(t);
      if (k < 0) return t === 0;
      const lo = cv.columns[2].values[k];
      const hi = cv.columns[3].values[k];
      return near(cv.columns[1].values[k], S.S[i], 1e-12) && (S.S[i] === 1 || (near(lo, S.lo[i], 1e-9) && near(hi, S.hi[i], 1e-9)));
    });
    const sum = r1.tables.summary;
    const medOk = near(val(sum, 'Median survival'), S.median, 1e-12) && near(val(sum, 'Median CI low'), S.medLo, 1e-12) && (S.medHi === null ? !Number.isFinite(val(sum, 'Median CI high')) : near(val(sum, 'Median CI high'), S.medHi, 1e-12));
    const two = survivalNode({ name: 's', columns: ds.columns.map((c) => ({ ...c, values: c.values.slice(0, S.tA.length + S.tB.length), ...(c.text ? { text: c.text.slice(0, S.tA.length + S.tB.length) } : {}) })) }, { ...SURVIVAL_DEFAULTS, time: 'Months', event: 'Died', group: 'Arm' });
    const lrOk = near(val(two.tables.out, 'χ²'), S.lr2, 1e-9) && near(val(two.tables.out, 'p'), S.p2, 1e-9);
    const hrOk = near(val(two.tables.hazard, 'Hazard ratio'), S.hr[0], 1e-10) && near(val(two.tables.hazard, 'CI low'), S.hr[1], 1e-9) && near(val(two.tables.hazard, 'CI high'), S.hr[2], 1e-9);
    const w = (test: 'logrank' | 'gehan' | 'tarone') => val(survivalNode(ds, { ...SURVIVAL_DEFAULTS, time: 'Months', event: 'Died', group: 'Arm', test }).tables.out, 'χ²');
    const wOk = near(w('logrank'), S.lr3, 1e-9) && near(w('gehan'), S.gehan3, 1e-9) && near(w('tarone'), S.tarone3, 1e-9);
    const three = survivalNode(ds, { ...SURVIVAL_DEFAULTS, time: 'Months', event: 'Died', group: 'Arm' });
    const pairsOk = (three.tables.out?.columns[0].values.length ?? 0) === 4 && !!three.tables.atrisk && !!three.tables.censored;
    ok(kmOk && medOk && lrOk && hrOk && wOk && pairsOk, `survival: Kaplan–Meier with its log–log band as lifelines (${kmOk}); the median ${val(sum, 'Median survival')} and its CI (${medOk}); log-rank of two (${lrOk}); the Mantel–Haenszel hazard ratio (${hrOk}); log-rank, Gehan–Wilcoxon, Tarone–Ware of three (${wOk}); every two compared, at risk, censored (${pairsOk})`);
  }

  // ---- the linear model ----
  {
    const G = R.reg;
    const D = G.data;
    const ds: Dataset = { name: 'r', columns: [num('x1', D.x1), num('x2', D.x2), txt('g', D.g), num('y', D.y), num('s', D.s)] };
    const r = regressNode(ds, { ...REGRESS_DEFAULTS, y: 'y', xs: 'x1, x2, g' });
    const co = r.tables.out!;
    // (statsmodels's names: Intercept, C(g, …)[T.high], …, x1, x2)
    const ours = (sm: string) => (sm === 'Intercept' ? 'Intercept' : sm.startsWith('C(g') ? `g [${/\[T\.(.+)\]$/.exec(sm)![1]}]` : sm);
    const terms = co.columns[0].text ?? [];
    const coefOk = G.names.every((nm: string, i: number) => {
      const k = terms.indexOf(ours(nm));
      return k >= 0 && near(val(co, 'Estimate', k), G.b[i], 1e-9) && near(val(co, 'SE', k), G.se[i], 1e-9) && near(val(co, 't', k), G.t[i], 1e-9) && near(val(co, 'p', k), G.p[i], 1e-8) && near(val(co, 'CI low', k), G.ci[i][0], 1e-9) && (nm === 'Intercept' || near(val(co, 'VIF', k), G.vif[i - 1], 1e-8));
    });
    const mo = r.tables.model!;
    const st = (n: string) => val(mo, 'Value', mo.columns[0].text!.indexOf(n));
    const modelOk = near(st('R²'), G.r2, 1e-10) && near(st('Adjusted R²'), G.adj, 1e-10) && near(st('F'), G.F, 1e-9) && near(st('p (F)'), G.pF, 1e-8) && near(st('AIC'), G.aic, 1e-10) && near(st('BIC'), G.bic, 1e-10) && near(st('Durbin–Watson'), G.dw, 1e-10) && near(st('Breusch–Pagan LM'), G.bp, 1e-9) && near(st('p (Breusch–Pagan)'), G.pbp, 1e-8);
    const fi = r.tables.fitted!;
    const col = (n: string) => fi.columns.find((c) => c.name === n)!.values;
    const diagOk = G.lev.every((v: number, i: number) => near(col('Leverage')[i], v, 1e-9)) && G.stud.every((v: number, i: number) => near(col('Studentized residual')[i], v, 1e-9)) && G.cook.every((v: number, i: number) => near(col('Cook’s distance')[i], v, 1e-8));
    // (Type II: statsmodels's rows g, x1, x2, Residual; ours x1, x2, g, Residual)
    const an = r.tables.anova!;
    const arow = (n: string) => an.columns[0].text!.indexOf(n);
    const anovaOk = [['g', 0], ['x1', 1], ['x2', 2], ['Residual', 3]].every(([n, i]) => near(val(an, 'SS', arow(n as string)), G.anova[i as number][0], 1e-9) && val(an, 'df', arow(n as string)) === G.anova[i as number][1]);
    const ri = regressNode(ds, { ...REGRESS_DEFAULTS, y: 'y', xs: 'x1, x2, g', interact: true });
    const rim = ri.tables.model!;
    const ria = ri.tables.anova!;
    const smRow = (nm: string) => G.inter.rows.indexOf(nm);
    const ref = "C(g, Treatment(reference='ctrl'))";
    const pairs: [string, string][] = [['x1', 'x1'], ['g', ref], ['x1 × g', `x1:${ref}`], ['x1 × x2', 'x1:x2'], ['x2 × g', `x2:${ref}`]];
    const interOk = near(val(rim, 'Value', rim.columns[0].text!.indexOf('R²')), G.inter.r2, 1e-10) && pairs.every(([o, s]) => near(val(ria, 'SS', ria.columns[0].text!.indexOf(o)), G.inter.anova[smRow(s)][0], 1e-8));
    const rw = regressNode(ds, { ...REGRESS_DEFAULTS, y: 'y', xs: 'x1, x2, g', weights: 's' });
    const cw = rw.tables.out!;
    const wlsOk = G.names.every((nm: string, i: number) => {
      const k = cw.columns[0].text!.indexOf(ours(nm));
      return near(val(cw, 'Estimate', k), G.wls.b[i], 1e-9) && near(val(cw, 'SE', k), G.wls.se[i], 1e-9);
    }) && near(val(rw.tables.model, 'Value', 1), G.wls.r2, 1e-10) && near(val(rw.tables.model, 'Value', rw.tables.model!.columns[0].text!.indexOf('AIC')), G.wls.aic, 1e-10);
    ok(coefOk && modelOk && diagOk && anovaOk && interOk && wlsOk, `linear regression: coefficients, SE, t, p, CI, VIF as statsmodels (${coefOk}); R², F, AIC, BIC, Durbin–Watson, Breusch–Pagan (${modelOk}); leverage, studentized residuals, Cook's distance (${diagOk}); Type II ANOVA (${anovaOk}); interactions (${interOk}); weighted (${wlsOk})`);
    void rel;
  }
}
