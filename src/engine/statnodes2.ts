// The nodes of the second statistics package: Adjust p-values, Contingency tables, ROC curve, Survival (Kaplan–Meier)
// and Linear regression. Each reads its dataset, runs the methods of stat2.ts and gives its tables and a report in
// words (as the other statistics nodes: statnodes.ts).
import { pick } from './extract.ts';
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import * as H from './hypo.ts';
import { chiSquare, gTest, fisherExact, mcnemar, association, twoByTwo, expected, padjust, aucDeLong, delongTest, rocPoints, kaplanMeier, survivalAt, logRank, leastSquares, type PAdjust, type KM } from './stat2.ts';
import { chi2Sf, normInv, tInv, tP2, fSf } from './dist.ts';
import { byName, chosen, fp, f3, isText, levelOf, sig, table, type Row, type StatOut } from './statnodes.ts';

export type PAdjustData = { col: string; method: PAdjust; alpha: number };
// layout: raw (a row per observation: the category of its row and of its column), table (the counts as a table: a
// column of row names, a column of counts for every column of the table), counts (a column of counts with the two
// categories beside it); test: independence (χ², G, Fisher), McNemar (a paired 2 × 2), a goodness of fit (one
// category: its counts against the proportions expected, equal or a column)
export type ContingencyData = { layout: 'raw' | 'table' | 'counts'; rowCol: string; colCol: string; count: string; cols: string; test: 'independence' | 'mcnemar' | 'gof'; yates: boolean; expected: string; alpha: number };
// truth: the column of the true class, positive its value that is positive (empty: the first found); scores: the
// columns of the scores (a curve each); dir: a higher score means positive, a lower, or as the medians say; cutoff:
// how the best threshold is chosen (Youden's J, the point nearest (0, 1), a sensitivity or a specificity reached)
export type RocData = { truth: string; positive: string; scores: string; dir: 'auto' | 'higher' | 'lower'; cutoff: 'youden' | 'closest' | 'sens' | 'spec'; target: number; alpha: number };
// eventIs: the value of the event column that means the event (empty: any number but 0); group: the column of the
// groups (empty: one curve); at: the times of the numbers at risk and of S(t) (empty: about six, round)
export type SurvivalData = { time: string; event: string; eventIs: string; group: string; test: 'logrank' | 'gehan' | 'tarone'; pairs: boolean; ci: 'loglog' | 'plain' | 'log'; at: string; alpha: number };
// xs: the predictors; factors: those of them read as categories (text columns always are), refs: the reference level
// of each (absent: the first in their natural order); interact: every two predictors' interaction; weights: a column of σ (weights
// 1/σ²) or none
export type RegressData = { y: string; xs: string; factors: string; refs?: Record<string, string>; interact: boolean; intercept: boolean; weights: string; alpha: number };

const natural = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
const err = (e: string): StatOut => ({ tables: {}, report: [], warnings: [], errors: [e] });
const pct = (v: number) => `${fmtNum(100 * v, 3)} %`;
const named = (v: number) => (Number.isFinite(v) ? f3(v) : 'n/a');

// ---- Adjust p-values ----
const P_NAMES: Record<PAdjust, string> = { bonferroni: 'Bonferroni', holm: 'Holm', hochberg: 'Hochberg', hommel: 'Hommel', bh: 'Benjamini–Hochberg (FDR)', by: 'Benjamini–Yekutieli (FDR)' };
export function pAdjustNode(ds: Dataset, d: PAdjustData): StatOut {
  // (the column: chosen, else one named p, else the first whose name has a p in it)
  const c = d.col ? byName(ds, d.col) : (ds.columns.find((q) => /^p$/i.test(q.name.trim())) ?? ds.columns.find((q) => /(^|[\s(_-])p([\s)_-]|$)|p-?value/i.test(q.name)));
  if (!c) return err(d.col ? `No column “${d.col}”.` : 'Choose the column of the p-values.');
  const p = Array.from(c.values);
  if (p.some((v) => Number.isFinite(v) && (v < 0 || v > 1))) return err(`${c.name}: p-values are between 0 and 1.`);
  const adj = padjust(p, d.method);
  const n = p.filter(Number.isFinite).length;
  const nRaw = p.filter((v) => v < d.alpha).length;
  const nAdj = adj.filter((v) => v < d.alpha).length;
  const out: Dataset = {
    name: `${ds.name} adjusted`,
    columns: [...ds.columns, { ...column(`p adjusted (${P_NAMES[d.method]})`, Float64Array.from(adj)), role: 'none' }, { ...column(`Significant (α = ${d.alpha})`, new Float64Array(adj.length).fill(NaN), adj.map((v) => sig(v, d.alpha))), role: 'label' }],
  };
  const report = [`${P_NAMES[d.method]}, ${n} test${n === 1 ? '' : 's'}: ${nAdj} significant at α = ${d.alpha} (${nRaw} before the adjustment).`];
  return { tables: { out }, report, warnings: [], errors: [] };
}

// ---- Contingency tables ----
type Crosstab = { rows: string[]; cols: string[]; t: number[][]; first?: number[] };
function crosstab(ds: Dataset, d: ContingencyData, one: boolean): Crosstab | string {
  const need = (name: string, what: string) => (name ? (byName(ds, name) ?? `No column “${name}”.`) : `Choose ${what}.`);
  if (d.layout === 'table') {
    const counts = chosen(ds, d.cols);
    if (typeof counts === 'string') return counts;
    const nameCol = d.rowCol ? byName(ds, d.rowCol) : ds.columns.find(isText);
    const cs = counts.filter((c) => c !== nameCol && !isText(c));
    const use = one ? cs.slice(0, 1) : cs;
    if (!use.length) return 'Choose the columns of the counts.';
    const n = use[0].values.length;
    const rows: string[] = [];
    const t: number[][] = [];
    for (let i = 0; i < n; i++) {
      const v = use.map((c) => c.values[i]);
      if (v.every((x) => !Number.isFinite(x))) continue;
      rows.push(nameCol ? levelOf(nameCol, i) || `${i + 1}` : `${i + 1}`);
      t.push(v.map((x) => (Number.isFinite(x) ? x : 0)));
    }
    return { rows, cols: use.map((c) => c.name), t };
  }
  const rc = need(d.rowCol, 'the column of the rows’ categories');
  if (typeof rc === 'string') return rc;
  const cc = one ? null : need(d.colCol, 'the column of the columns’ categories');
  if (typeof cc === 'string') return cc;
  const wc = d.layout === 'counts' ? need(d.count, 'the column of the counts') : null;
  if (typeof wc === 'string') return wc;
  const rows: string[] = [];
  const cols: string[] = one ? ['Count'] : [];
  const first: number[] = [];
  const cells = new Map<string, number>();
  for (let i = 0; i < rc.values.length; i++) {
    const r = levelOf(rc, i);
    const c = cc ? levelOf(cc, i) : 'Count';
    const w = wc ? wc.values[i] : 1;
    if (!r || !c || !Number.isFinite(w)) continue;
    if (!rows.includes(r)) {
      rows.push(r);
      first.push(i);
    }
    if (!cols.includes(c)) cols.push(c);
    cells.set(`${r}\u0000${c}`, (cells.get(`${r}\u0000${c}`) ?? 0) + w);
  }
  return { rows, cols, t: rows.map((r) => cols.map((c) => cells.get(`${r}\u0000${c}`) ?? 0)), first };
}
export function contingencyNode(ds: Dataset, d: ContingencyData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const ct = crosstab(ds, d, d.test === 'gof');
  if (typeof ct === 'string') return err(ct);
  const { rows, cols, t } = ct;
  const n = t.flat().reduce((x, y) => x + y, 0);
  if (!(n > 0)) return err('No counts.');
  if (t.flat().some((v) => v < 0 || Math.abs(v - Math.round(v)) > 1e-9)) warnings.push('Some counts are not whole numbers: the exact tests take them rounded.');
  // ---- a goodness of fit ----
  if (d.test === 'gof') {
    const obs = t.map((r) => r[0]);
    if (obs.length < 2) return err('A goodness of fit: 2 categories or more.');
    let prop = obs.map(() => 1 / obs.length);
    if (d.expected) {
      const ec = byName(ds, d.expected);
      if (!ec) return err(`No column “${d.expected}”.`);
      const raw = obs.map((_, k) => ec.values[d.layout === 'table' ? k : (ct.first?.[k] ?? k)]);
      if (raw.some((v) => !(v >= 0))) return err(`${d.expected}: an expected proportion (or count) for every category.`);
      const s = raw.reduce((x, y) => x + y, 0);
      prop = raw.map((v) => v / s);
    }
    const e = prop.map((q) => q * n);
    const x2 = obs.reduce((s, o, k) => s + (o - e[k]) ** 2 / e[k], 0);
    const g2 = obs.reduce((s, o, k) => s + (o > 0 ? 2 * o * Math.log(o / e[k]) : 0), 0);
    const df = obs.length - 1;
    const tests: Row[] = [
      { Test: 'χ² goodness of fit', Statistic: x2, df, p: chi2Sf(x2, df), [`Significant (α = ${a})`]: sig(chi2Sf(x2, df), a) },
      { Test: 'G-test of fit', Statistic: g2, df, p: chi2Sf(g2, df), [`Significant (α = ${a})`]: sig(chi2Sf(g2, df), a) },
    ];
    if (e.some((v) => v < 5)) warnings.push('Some expected counts are under 5: the χ² p is only approximate.');
    report.push(`χ²(${df}) = ${f3(x2)}, ${fp(chi2Sf(x2, df))}: the counts ${chi2Sf(x2, df) < a ? 'differ from' : 'do not differ from'} the proportions expected at α = ${a}.`);
    const cells = table(
      'cells',
      rows.map((r, k) => ({ Category: r, Observed: obs[k], Expected: e[k], 'Observed %': (100 * obs[k]) / n, 'Expected %': 100 * prop[k], Residual: (obs[k] - e[k]) / Math.sqrt(e[k]) })),
      { Category: 'x', Observed: 'y' },
    );
    return { tables: { out: table('tests', tests), cells }, report, warnings, errors: [] };
  }
  if (rows.length < 2 || cols.length < 2) return err(`A contingency table of 2 × 2 or more: ${rows.length} × ${cols.length} found.`);
  const rs = t.map((r) => r.reduce((x, y) => x + y, 0));
  const cs = cols.map((_, j) => t.reduce((s, r) => s + r[j], 0));
  // the table as it is read, with its totals
  const wide = table('table', [...rows.map((r, i) => ({ '': r, ...Object.fromEntries(cols.map((c, j) => [c, t[i][j]])), Total: rs[i] })), { '': 'Total', ...Object.fromEntries(cols.map((c, j) => [c, cs[j]])), Total: n }]);
  // ---- McNemar ----
  if (d.test === 'mcnemar') {
    if (rows.length !== 2 || cols.length !== 2) return err(`McNemar: a 2 × 2 table of paired answers (before × after): ${rows.length} × ${cols.length} found.`);
    const m = mcnemar(t, d.yates);
    const tests: Row[] = [
      { Test: `McNemar χ²${d.yates ? ' (continuity corrected)' : ''}`, Statistic: m.stat, df: 1, p: m.p, [`Significant (α = ${a})`]: sig(m.p, a) },
      { Test: 'McNemar exact (binomial)', Statistic: NaN, df: NaN, p: m.exactP, [`Significant (α = ${a})`]: sig(m.exactP, a) },
    ];
    const [b, c] = [t[0][1], t[1][0]];
    report.push(`McNemar: ${b} pairs ${rows[0]} → ${cols[1]} against ${c} ${rows[1]} → ${cols[0]}; χ²(1) = ${f3(m.stat)}, ${fp(m.p)} (exact ${fp(m.exactP)}): the two answers ${m.exactP < a ? 'differ' : 'do not differ'} at α = ${a}.`);
    const measures = table('measures', [{ Measure: 'Paired odds ratio (b / c)', Value: c > 0 ? b / c : NaN }]);
    return { tables: { out: table('tests', tests), measures, table: wide }, report, warnings, errors: [] };
  }
  // ---- independence ----
  const e = expected(t);
  const x2 = chiSquare(t, false);
  const yates = rows.length === 2 && cols.length === 2 && d.yates ? chiSquare(t, true) : null;
  const g = gTest(t);
  const fi = fisherExact(t.map((r) => r.map((v) => Math.round(v))));
  const tests: Row[] = [
    { Test: 'Pearson χ²', Statistic: x2.stat, df: x2.df, p: x2.p, [`Significant (α = ${a})`]: sig(x2.p, a), Note: '' },
    ...(yates ? [{ Test: 'χ² with Yates’s correction', Statistic: yates.stat, df: 1, p: yates.p, [`Significant (α = ${a})`]: sig(yates.p, a), Note: '' }] : []),
    { Test: 'G-test (likelihood ratio)', Statistic: g.stat, df: g.df, p: g.p, [`Significant (α = ${a})`]: sig(g.p, a), Note: '' },
    { Test: 'Fisher’s exact test', Statistic: NaN, df: NaN, p: fi.p, [`Significant (α = ${a})`]: sig(fi.p, a), Note: fi.how === 'exact' ? 'exact' : `Monte Carlo, ${fi.sims} tables` },
  ];
  const small = e.flat().filter((v) => v < 5).length;
  if (small) warnings.push(`${small} expected count${small > 1 ? 's are' : ' is'} under 5: take Fisher’s exact test.`);
  const as = association(t);
  const meas: Row[] = [{ Measure: 'Cramér’s V', Value: as.V, 'CI low': NaN, 'CI high': NaN }];
  if (rows.length === 2 && cols.length === 2) {
    const q = twoByTwo(t, lvl);
    meas.push(
      { Measure: 'φ', Value: as.phi, 'CI low': NaN, 'CI high': NaN },
      { Measure: 'Odds ratio', Value: q.or, 'CI low': q.orLo, 'CI high': q.orHi },
      { Measure: `Relative risk (${cols[0]})`, Value: q.rr, 'CI low': q.rrLo, 'CI high': q.rrHi },
      { Measure: `Risk difference (${cols[0]})`, Value: q.rd, 'CI low': q.rdLo, 'CI high': q.rdHi },
    );
    if (q.haldane) warnings.push('A cell is 0: the odds ratio with 0.5 added to every cell (Haldane–Anscombe).');
    report.push(`Odds ratio ${f3(q.or)} (${Math.round(lvl * 100)} % CI ${f3(q.orLo)} to ${f3(q.orHi)}); the risk of ${cols[0]} in ${rows[0]} ${f3(q.rr)} times that in ${rows[1]}.`);
  } else meas.push({ Measure: 'Contingency coefficient', Value: as.C, 'CI low': NaN, 'CI high': NaN });
  const main = small ? fi : x2;
  report.unshift(`${small ? `Fisher’s exact test, ${fp(fi.p)}` : `χ²(${x2.df}) = ${f3(x2.stat)}, ${fp(x2.p)}`}: ${rows.length} × ${cols.length}, N = ${fmtNum(n, 6)}; the rows and the columns ${main.p < a ? 'are' : 'are not'} associated at α = ${a} (Cramér’s V = ${f3(as.V)}).`);
  const cells = table(
    'cells',
    rows.flatMap((r, i) =>
      cols.map((c, j) => ({
        Row: r,
        Column: c,
        Observed: t[i][j],
        Expected: e[i][j],
        'Row %': (100 * t[i][j]) / rs[i],
        'Column %': (100 * t[i][j]) / cs[j],
        'Total %': (100 * t[i][j]) / n,
        'Adjusted residual': (t[i][j] - e[i][j]) / Math.sqrt(e[i][j] * (1 - rs[i] / n) * (1 - cs[j] / n)),
        'χ² part': (t[i][j] - e[i][j]) ** 2 / e[i][j],
      })),
    ),
  );
  return { tables: { out: table('tests', tests), measures: table('measures', meas), cells, table: wide }, report, warnings, errors: [] };
}

// ---- ROC curve ----
export function rocNode(ds: Dataset, d: RocData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const tc = byName(ds, d.truth);
  if (!tc) return err(d.truth ? `No column “${d.truth}”.` : 'Choose the column of the true class (diseased or not, 1 or 0 …).');
  const levels = [...new Set(Array.from(tc.values, (_, i) => levelOf(tc, i)).filter(Boolean))];
  if (levels.length !== 2) return err(`${tc.name}: two classes are needed, ${levels.length} found${levels.length > 2 ? ` (${levels.slice(0, 5).join(', ')} …): filter the rows first` : ''}.`);
  // (positive: the value chosen, else 1, yes, positive … else the second in order)
  const posName = d.positive && levels.includes(d.positive) ? d.positive : (levels.find((l) => /^(1|yes|true|pos|positive|case|disease|diseased|sick|ill)$/i.test(l)) ?? [...levels].sort()[1]);
  const negName = levels.find((l) => l !== posName)!;
  const sc = chosen(ds, d.scores);
  if (typeof sc === 'string') return err(sc);
  const scores = sc.filter((c) => c !== tc && !isText(c));
  if (!scores.length) return err('Choose the column(s) of the scores (the test’s values).');
  const rowsOk = (c: Column) => Array.from(c.values, (_, i) => i).filter((i) => Number.isFinite(c.values[i]) && levelOf(tc, i));
  const curves: Column[] = [];
  const auc: Row[] = [];
  const thr: Row[] = [];
  const best: Row[] = [];
  const signs: number[] = [];
  for (const c of scores) {
    const idx = rowsOk(c);
    const pos = idx.filter((i) => levelOf(tc, i) === posName).map((i) => c.values[i]);
    const neg = idx.filter((i) => levelOf(tc, i) === negName).map((i) => c.values[i]);
    if (pos.length < 2 || neg.length < 2) return err(`${c.name}: at least 2 positives and 2 negatives with a score.`);
    const sign = d.dir === 'lower' ? -1 : d.dir === 'higher' ? 1 : H.median(pos) >= H.median(neg) ? 1 : -1;
    signs.push(sign);
    const [P, N] = [pos.map((v) => sign * v), neg.map((v) => sign * v)];
    const r = aucDeLong(P, N, lvl);
    const pts = rocPoints(P, N);
    curves.push({ ...column(`1 − Specificity (${c.name})`, Float64Array.from(pts, (q) => 1 - q.spec)), role: 'x' }, { ...column(`Sensitivity (${c.name})`, Float64Array.from(pts, (q) => q.sens)), role: 'y' });
    auc.push({ Score: c.name, Direction: sign > 0 ? `higher = ${posName}` : `lower = ${posName}`, Positives: pos.length, Negatives: neg.length, AUC: r.auc, SE: r.se, 'CI low': r.lo, 'CI high': r.hi, 'p (AUC = 0.5)': r.p, [`Significant (α = ${a})`]: sig(r.p, a) });
    const rowsT = pts.slice(1).map((q) => {
      const ppv = q.tp / (q.tp + q.fp);
      const npv = q.tn / (q.tn + q.fn);
      return { q, ppv, npv, j: q.sens + q.spec - 1 };
    });
    rowsT.forEach(({ q, ppv, npv, j }) =>
      thr.push({ Score: c.name, Threshold: sign * q.thr, Rule: sign > 0 ? '≥' : '≤', Sensitivity: q.sens, Specificity: q.spec, PPV: ppv, NPV: npv, Accuracy: (q.tp + q.tn) / (pos.length + neg.length), 'Youden J': j, 'LR+': q.spec < 1 ? q.sens / (1 - q.spec) : NaN, 'LR−': q.spec > 0 ? (1 - q.sens) / q.spec : NaN }),
    );
    // (the best threshold by the rule chosen)
    const pickBest = () => {
      if (d.cutoff === 'closest') return rowsT.reduce((x, y) => ((1 - y.q.sens) ** 2 + (1 - y.q.spec) ** 2 < (1 - x.q.sens) ** 2 + (1 - x.q.spec) ** 2 ? y : x));
      if (d.cutoff === 'sens') return rowsT.filter((r2) => r2.q.sens >= d.target).reduce((x, y) => (y.q.spec > x.q.spec ? y : x), rowsT[rowsT.length - 1]);
      if (d.cutoff === 'spec') return [...rowsT].reverse().filter((r2) => r2.q.spec >= d.target).reduce((x, y) => (y.q.sens > x.q.sens ? y : x), rowsT[0]);
      return rowsT.reduce((x, y) => (y.j > x.j ? y : x));
    };
    const b = pickBest();
    best.push({ Score: c.name, Threshold: sign * b.q.thr, Rule: sign > 0 ? `${posName} when ≥` : `${posName} when ≤`, Sensitivity: b.q.sens, Specificity: b.q.spec, PPV: b.ppv, NPV: b.npv, TP: b.q.tp, FP: b.q.fp, FN: b.q.fn, TN: b.q.tn });
    report.push(`${c.name}: AUC = ${f3(r.auc)} (${Math.round(lvl * 100)} % CI ${f3(r.lo)} to ${f3(r.hi)}), ${fp(r.p)}; best threshold ${sign > 0 ? '≥' : '≤'} ${fmtNum(sign * b.q.thr, 5)}: sensitivity ${pct(b.q.sens)}, specificity ${pct(b.q.spec)}.`);
  }
  // (two scores or more of the same rows: DeLong's test of every pair)
  const tables: Record<string, Dataset> = {};
  if (scores.length > 1) {
    const rowsAll = Array.from(tc.values, (_, i) => i).filter((i) => levelOf(tc, i) && scores.every((c) => Number.isFinite(c.values[i])));
    const cmp: Row[] = [];
    for (let x = 0; x < scores.length; x++)
      for (let y = x + 1; y < scores.length; y++) {
        const get = (k: number, cls: string) => rowsAll.filter((i) => levelOf(tc, i) === cls).map((i) => signs[k] * scores[k].values[i]);
        const r = delongTest(get(x, posName), get(x, negName), get(y, posName), get(y, negName));
        const z = normInv(1 - a / 2);
        cmp.push({ Pair: `${scores[x].name} − ${scores[y].name}`, 'AUC difference': r.diff, SE: r.se, 'CI low': r.diff - z * r.se, 'CI high': r.diff + z * r.se, z: r.z, p: r.p, [`Significant (α = ${a})`]: sig(r.p, a) });
        report.push(`DeLong: ${scores[x].name} − ${scores[y].name} = ${f3(r.diff)}, ${fp(r.p)}.`);
      }
    if (rowsAll.length < Math.max(...scores.map((c) => rowsOk(c).length))) warnings.push('The comparison uses only the rows with every score.');
    tables.compare = table('compare', cmp);
  }
  // (the curves: of different lengths, padded)
  const len = Math.max(...curves.map((c) => c.values.length));
  const pad = (c: Column): Column => ({ ...c, values: Float64Array.from({ length: len }, (_, i) => (i < c.values.length ? c.values[i] : NaN)) });
  return { tables: { out: table('AUC', auc), curves: { name: 'ROC curves', columns: curves.map(pad) }, thresholds: table('thresholds', thr), optimal: table('optimal', best), ...tables }, report, warnings, errors: [] };
}

// ---- Survival (Kaplan–Meier) ----
// about six round times from 0 to the end
function roundTimes(max: number): number[] {
  if (!(max > 0)) return [0];
  const raw = max / 5;
  const p = 10 ** Math.floor(Math.log10(raw));
  const s = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw)!;
  return Array.from({ length: Math.floor(max / s + 1e-9) + 1 }, (_, i) => +(i * s).toPrecision(12));
}
export function survivalNode(ds: Dataset, d: SurvivalData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const tc = byName(ds, d.time);
  if (!tc) return err(d.time ? `No column “${d.time}”.` : 'Choose the column of the times (to the event, or to the last follow-up).');
  const ec = byName(ds, d.event);
  if (!ec) return err(d.event ? `No column “${d.event}”.` : 'Choose the column that says if the event happened (1) or the time is censored (0).');
  const gc = d.group ? byName(ds, d.group) : undefined;
  if (d.group && !gc) return err(`No column “${d.group}”.`);
  const isEvent = (i: number) => (d.eventIs ? levelOf(ec, i) === d.eventIs : Number.isFinite(ec.values[i]) ? ec.values[i] !== 0 : /^(yes|true|dead|died|event|failed|1)$/i.test(levelOf(ec, i)));
  const names: string[] = [];
  const time: number[] = [];
  const ev: boolean[] = [];
  const grp: number[] = [];
  let neg = 0;
  for (let i = 0; i < tc.values.length; i++) {
    const t = tc.values[i];
    const known = Number.isFinite(ec.values[i]) || levelOf(ec, i);
    const g = gc ? levelOf(gc, i) : 'All';
    if (!Number.isFinite(t) || !known || !g) continue;
    if (t < 0) {
      neg++;
      continue;
    }
    let k = names.indexOf(g);
    if (k < 0) k = names.push(g) - 1;
    time.push(t);
    ev.push(isEvent(i));
    grp.push(k);
  }
  if (neg) warnings.push(`${neg} negative time${neg > 1 ? 's' : ''} left out.`);
  if (time.length < 2) return err('At least 2 subjects with a time and an event mark.');
  if (!ev.some(Boolean)) return err('No event: every time is censored (check the event column and the value that means the event).');
  const kms: KM[] = names.map((_, k) => kaplanMeier(time.filter((_, i) => grp[i] === k), ev.filter((_, i) => grp[i] === k), lvl, d.ci));
  // the curves: a pair of columns for every group, starting at (0, 1); the censored times on their curve
  const cols: Column[] = [];
  const cens: Column[] = [];
  kms.forEach((km, k) => {
    const g = names[k];
    const pts = [{ t: 0, s: 1, lo: 1, hi: 1 }, ...km.steps.map((q) => ({ t: q.t, s: q.s, lo: q.lo, hi: q.hi }))];
    cols.push({ ...column(`Time (${g})`, Float64Array.from(pts, (q) => q.t)), role: 'x' }, { ...column(`Survival (${g})`, Float64Array.from(pts, (q) => q.s)), role: 'y' }, { ...column(`Lower (${g})`, Float64Array.from(pts, (q) => q.lo)), role: 'none' }, { ...column(`Upper (${g})`, Float64Array.from(pts, (q) => q.hi)), role: 'none' });
    const c = km.steps.filter((q) => q.censored > 0);
    cens.push({ ...column(`Censored time (${g})`, Float64Array.from(c, (q) => q.t)), role: 'x' }, { ...column(`Censored (${g})`, Float64Array.from(c, (q) => q.s)), role: 'y' });
  });
  const padTo = (cs: Column[]): Column[] => {
    const len = Math.max(0, ...cs.map((c) => c.values.length));
    return cs.map((c) => ({ ...c, values: Float64Array.from({ length: len }, (_, i) => (i < c.values.length ? c.values[i] : NaN)) }));
  };
  // (the times of S(t) and of the numbers at risk)
  const given = d.at
    .split(/[\s,;]+/)
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0);
  const at = given.length ? given : roundTimes(Math.max(...time));
  const summary = table(
    'summary',
    kms.map((km, k) => ({
      Group: names[k],
      N: km.n,
      Events: km.events,
      Censored: km.n - km.events,
      'Median survival': km.median,
      'Median CI low': km.medLo,
      'Median CI high': km.medHi,
      ...Object.fromEntries(at.filter((t) => t > 0).map((t) => [`S(${fmtNum(t, 6)})`, survivalAt(km, t)])),
    })),
  );
  const atRisk = table(
    'at risk',
    at.map((t) => ({ Time: t, ...Object.fromEntries(names.map((g, k) => [g, time.filter((v, i) => grp[i] === k && v >= t).length])) })),
    { Time: 'x' },
  );
  kms.forEach((km, k) => report.push(`${names[k]}: ${km.events} events of ${km.n}; median survival ${Number.isFinite(km.median) ? `${fmtNum(km.median, 5)} (${Math.round(lvl * 100)} % CI ${named(km.medLo)} to ${Number.isFinite(km.medHi) ? fmtNum(km.medHi, 5) : 'not reached'})` : 'not reached'}.`));
  const tables: Record<string, Dataset> = { curves: { name: 'survival curves', columns: padTo(cols) }, censored: { name: 'censored', columns: padTo(cens) }, summary, atrisk: atRisk };
  if (names.length > 1) {
    const TN: Record<SurvivalData['test'], string> = { logrank: 'Log-rank (Mantel–Cox)', gehan: 'Gehan–Breslow–Wilcoxon', tarone: 'Tarone–Ware' };
    const lr = logRank(time, ev, grp, names.length, d.test, lvl);
    const rows: Row[] = [{ Comparison: names.join(' vs '), Test: TN[d.test], 'χ²': lr.chi2, df: lr.df, p: lr.p, 'p (Holm)': NaN, [`Significant (α = ${a})`]: sig(lr.p, a) }];
    report.push(`${TN[d.test]}: χ²(${lr.df}) = ${f3(lr.chi2)}, ${fp(lr.p)}: the survival ${lr.p < a ? 'differs' : 'does not differ'} between the groups at α = ${a}.`);
    if (d.pairs && names.length > 2) {
      const pr: Row[] = [];
      for (let x = 0; x < names.length; x++)
        for (let y = x + 1; y < names.length; y++) {
          const keep = grp.map((g, i) => (g === x || g === y ? i : -1)).filter((i) => i >= 0);
          const r = logRank(
            keep.map((i) => time[i]),
            keep.map((i) => ev[i]),
            keep.map((i) => (grp[i] === x ? 0 : 1)),
            2,
            d.test,
            lvl,
          );
          pr.push({ Comparison: `${names[x]} vs ${names[y]}`, Test: TN[d.test], 'χ²': r.chi2, df: r.df, p: r.p });
        }
      const adj = padjust(
        pr.map((r) => r.p as number),
        'holm',
      );
      pr.forEach((r, i) => rows.push({ ...r, 'p (Holm)': adj[i], [`Significant (α = ${a})`]: sig(adj[i], a) }));
    }
    tables.out = table('test', rows);
    if (names.length === 2 && lr.hr !== undefined) {
      tables.hazard = table('hazard ratio', [{ Comparison: `${names[1]} / ${names[0]}`, 'Hazard ratio': lr.hr, 'CI low': lr.hrLo!, 'CI high': lr.hrHi!, 'Observed (1)': lr.O[0], 'Expected (1)': lr.E[0], 'Observed (2)': lr.O[1], 'Expected (2)': lr.E[1] }]);
      report.push(`Hazard ratio ${names[1]} / ${names[0]} = ${f3(lr.hr)} (${Math.round(lvl * 100)} % CI ${f3(lr.hrLo!)} to ${f3(lr.hrHi!)}, Mantel–Haenszel).`);
    }
  } else tables.out = summary;
  return { tables, report, warnings, errors: [] };
}

// ---- Linear regression ----
export type Term = { name: string; vars: string[]; cols: number[] };
// The design of a linear model: the intercept, every predictor (a category its dummies against its reference, the
// first in natural order unless chosen), every two predictors' interaction; the rows complete (Y by rowOk)
export type Design = { xs: Column[]; rowsUsed: number[]; names: string[]; cols: number[][]; terms: Term[] };
export type DesignSpec = { xs: string; factors: string; refs?: Record<string, string>; interact: boolean; intercept: boolean };
export function designOf(ds: Dataset, d: DesignSpec, yc: Column, rowOk: (i: number) => boolean): Design | string {
  if (!d.xs.trim()) return 'Choose the predictors (X).';
  const px = pick(d.xs, ds.columns.map((c) => c.name), true, ds.columns);
  if (px.missing.length) return `Predictors: no ${px.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
  const xs = px.found.map((j) => ds.columns[j]).filter((c) => c !== yc);
  if (!xs.length) return 'Choose the predictors (X), other than Y.';
  const fset = new Set(d.factors.trim() ? pick(d.factors, ds.columns.map((c) => c.name), true, ds.columns).found.map((j) => ds.columns[j].name) : []);
  const isCat = (c: Column) => isText(c) || fset.has(c.name);
  // (the complete rows)
  const rowsUsed: number[] = [];
  for (let i = 0; i < yc.values.length; i++) {
    if (!rowOk(i)) continue;
    if (xs.some((c) => (isCat(c) ? !levelOf(c, i) : !Number.isFinite(c.values[i])))) continue;
    rowsUsed.push(i);
  }
  // (the design: the intercept, every predictor — a category its dummies against its reference —, the interactions)
  const names: string[] = [];
  const cols: number[][] = [];
  const terms: Term[] = [];
  const add = (name: string, v: number[]) => {
    names.push(name);
    cols.push(v);
    return cols.length - 1;
  };
  if (d.intercept) add('Intercept', rowsUsed.map(() => 1));
  const main: Term[] = xs.map((c) => {
    if (!isCat(c)) return { name: c.name, vars: [c.name], cols: [add(c.name, rowsUsed.map((i) => c.values[i]))] };
    const lv: string[] = [];
    rowsUsed.forEach((i) => !lv.includes(levelOf(c, i)) && lv.push(levelOf(c, i)));
    // (in their natural order: I, II, III; 2 before 10)
    lv.sort(natural);
    const ref = d.refs?.[c.name] && lv.includes(d.refs[c.name]) ? d.refs[c.name] : lv[0];
    const others = lv.filter((l) => l !== ref);
    return { name: c.name, vars: [c.name], cols: others.map((l) => add(`${c.name} [${l}]`, rowsUsed.map((i) => (levelOf(c, i) === l ? 1 : 0)))) };
  });
  terms.push(...main);
  if (d.interact)
    for (let x = 0; x < main.length; x++)
      for (let y = x + 1; y < main.length; y++) {
        const T: Term = { name: `${main[x].name} × ${main[y].name}`, vars: [main[x].name, main[y].name], cols: [] };
        for (const p of main[x].cols) for (const q of main[y].cols) T.cols.push(add(`${names[p]} × ${names[q]}`, cols[p].map((v, i) => v * cols[q][i])));
        terms.push(T);
      }
  return { xs, rowsUsed, names, cols, terms };
}
export function regressNode(ds: Dataset, d: RegressData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const yc = byName(ds, d.y);
  if (!yc) return err(d.y ? `No column “${d.y}”.` : 'Choose Y, the column explained.');
  const wc = d.weights ? byName(ds, d.weights) : undefined;
  if (d.weights && !wc) return err(`No column “${d.weights}”.`);
  const dz = designOf(ds, d, yc, (i) => Number.isFinite(yc.values[i]) && (!wc || wc.values[i] > 0));
  if (typeof dz === 'string') return err(dz);
  const { xs, rowsUsed, names, cols, terms } = dz;
  const n = rowsUsed.length;
  const p = cols.length;
  if (n <= p) return err(`${n} complete rows for ${p} coefficients: more rows are needed.`);
  const w = rowsUsed.map((i) => (wc ? 1 / wc.values[i] ** 2 : 1));
  const sw = w.map(Math.sqrt);
  const y = rowsUsed.map((i) => yc.values[i]);
  const Xr = (use: number[]) => rowsUsed.map((_, r) => use.map((j) => cols[j][r] * sw[r]));
  const ys = y.map((v, r) => v * sw[r]);
  const all = cols.map((_, j) => j);
  const ls = leastSquares(Xr(all), ys);
  if (ls.aliased.some(Boolean)) warnings.push(`Depend on the others (left out): ${names.filter((_, j) => ls.aliased[j]).join(', ')}.`);
  const k = ls.rank;
  const dfE = n - k;
  const mse = ls.sse / dfE;
  const s = Math.sqrt(mse);
  const tq = tInv(1 - a / 2, dfE);
  // (R²: about the weighted mean with an intercept, about 0 without)
  const sw2 = w.reduce((x, v) => x + v, 0);
  const ym = d.intercept ? y.reduce((x, v, r) => x + w[r] * v, 0) / sw2 : 0;
  const sst = y.reduce((x, v, r) => x + w[r] * (v - ym) ** 2, 0);
  const r2 = 1 - ls.sse / sst;
  const dfM = k - (d.intercept ? 1 : 0);
  const adj = 1 - ((1 - r2) * (n - (d.intercept ? 1 : 0))) / dfE;
  const F = dfM > 0 ? (sst - ls.sse) / dfM / mse : NaN;
  const pF = dfM > 0 ? fSf(F, dfM, dfE) : NaN;
  const llf = -(n / 2) * (Math.log(2 * Math.PI) + Math.log(ls.sse / n) + 1) + 0.5 * w.reduce((x, v) => x + Math.log(v), 0);
  const aic = -2 * llf + 2 * k;
  const bic = -2 * llf + Math.log(n) * k;
  // (the coefficients, standardized, their VIF)
  const sdOf = (v: number[]) => Math.sqrt(H.variance(v));
  const sdY = sdOf(y);
  const vif = (j: number) => {
    if (names[j] === 'Intercept') return NaN;
    const others = all.filter((q) => q !== j && !ls.aliased[q]);
    const hasConst = others.some((q) => cols[q].every((v) => v === 1));
    const r = leastSquares(
      rowsUsed.map((_, rr) => others.map((q) => cols[q][rr])),
      cols[j],
    );
    const mj = hasConst ? cols[j].reduce((x, v) => x + v, 0) / n : 0;
    const tss = cols[j].reduce((x, v) => x + (v - mj) ** 2, 0);
    return tss > 0 ? 1 / (r.sse / tss) : NaN;
  };
  const coef: Row[] = names.map((nm, j) => {
    const b = ls.b[j];
    const se = Math.sqrt(mse * ls.xtxInv[j][j]);
    const t = b / se;
    const pv = tP2(t, dfE);
    return { Term: nm, Estimate: b, SE: se, t, p: pv, 'CI low': b - tq * se, 'CI high': b + tq * se, 'Standardized β': nm === 'Intercept' ? NaN : (b * sdOf(cols[j])) / sdY, VIF: vif(j), [`Significant (α = ${a})`]: sig(pv, a) };
  });
  // (Type II ANOVA: every term against the model of the terms that do not contain it)
  const sseOf = (use: number[]) => leastSquares(Xr(use), ys).sse;
  const anova: Row[] = terms.map((T) => {
    const without = all.filter((j) => !terms.some((U) => U.cols.includes(j) && T.vars.every((v) => U.vars.includes(v))));
    const withT = [...without, ...T.cols];
    const ss = sseOf(without) - sseOf(withT);
    const df = T.cols.filter((j) => !ls.aliased[j]).length;
    const Ft = ss / df / mse;
    return { Source: T.name, SS: ss, df, MS: ss / df, F: Ft, p: fSf(Ft, df, dfE) };
  });
  anova.push({ Source: 'Residual', SS: ls.sse, df: dfE, MS: mse, F: NaN, p: NaN });
  // (the fitted values, the diagnostics)
  const fit = rowsUsed.map((_, r) => all.reduce((x, j) => x + (ls.aliased[j] ? 0 : cols[j][r] * ls.b[j]), 0));
  const e = y.map((v, r) => v - fit[r]);
  const stud = e.map((v, r) => (v * sw[r]) / (s * Math.sqrt(Math.max(1e-12, 1 - ls.h[r]))));
  const cook = stud.map((rr, r) => ((rr * rr) / k) * (ls.h[r] / (1 - ls.h[r])));
  const dw = e.slice(1).reduce((x, v, r) => x + (v - e[r]) ** 2, 0) / e.reduce((x, v) => x + v * v, 0);
  // (Breusch–Pagan, Koenker's studentized form: n R² of e² on the predictors)
  const e2 = e.map((v, r) => (v * sw[r]) ** 2);
  const aux = leastSquares(
    rowsUsed.map((_, r) => all.map((j) => cols[j][r])),
    e2,
  );
  const e2m = e2.reduce((x, v) => x + v, 0) / n;
  const bpR2 = 1 - aux.sse / e2.reduce((x, v) => x + (v - e2m) ** 2, 0);
  const bp = n * bpR2;
  const bpDf = aux.rank - 1;
  const sw3 = n >= 3 && n <= 5000 ? H.shapiroWilk(e) : null;
  const model: Row[] = [
    { Statistic: 'N', Value: n },
    { Statistic: 'R²', Value: r2 },
    { Statistic: 'Adjusted R²', Value: adj },
    { Statistic: 'RMSE (σ)', Value: s },
    { Statistic: 'F', Value: F },
    { Statistic: 'df model', Value: dfM },
    { Statistic: 'df residual', Value: dfE },
    { Statistic: 'p (F)', Value: pF },
    { Statistic: 'AIC', Value: aic },
    { Statistic: 'BIC', Value: bic },
    { Statistic: 'Durbin–Watson', Value: dw },
    { Statistic: 'Breusch–Pagan LM', Value: bp },
    { Statistic: 'p (Breusch–Pagan)', Value: bpDf > 0 ? chi2Sf(bp, bpDf) : NaN },
    { Statistic: 'Shapiro–Wilk W (residuals)', Value: sw3?.stat ?? NaN },
    { Statistic: 'p (Shapiro–Wilk)', Value: sw3?.p ?? NaN },
  ];
  const fitted: Dataset = {
    name: 'fitted',
    columns: [
      { ...column('Row', Float64Array.from(rowsUsed, (i) => i + 1)), role: 'none' },
      { ...column(`${yc.name}`, Float64Array.from(y)), role: 'none' },
      { ...column('Predicted', Float64Array.from(fit)), role: 'x' },
      { ...column('Residual', Float64Array.from(e)), role: 'y' },
      { ...column('Studentized residual', Float64Array.from(stud)), role: 'none' },
      { ...column('Leverage', Float64Array.from(ls.h)), role: 'none' },
      { ...column('Cook’s distance', Float64Array.from(cook)), role: 'none' },
      { ...column('Influential', new Float64Array(n).fill(NaN), cook.map((c) => (c > 4 / n ? 'yes' : ''))), role: 'label' },
    ],
  };
  report.push(`${yc.name} on ${xs.map((c) => c.name).join(', ')}${d.interact && xs.length > 1 ? ' with their interactions' : ''}: R² = ${f3(r2)} (adjusted ${f3(adj)}), F(${dfM}, ${dfE}) = ${f3(F)}, ${fp(pF)}; N = ${n}.`);
  const sigTerms = coef.filter((c) => c.Term !== 'Intercept' && (c.p as number) < a).map((c) => c.Term);
  report.push(sigTerms.length ? `Significant at α = ${a}: ${sigTerms.join(', ')}.` : `No predictor is significant at α = ${a}.`);
  const nInf = cook.filter((c) => c > 4 / n).length;
  if (nInf) report.push(`${nInf} influential point${nInf > 1 ? 's' : ''} (Cook’s distance over 4/N): see the fitted table.`);
  if (coef.some((c) => (c.VIF as number) > 10)) warnings.push('A VIF over 10: predictors that nearly repeat each other (collinear); their coefficients are uncertain.');
  if (bpDf > 0 && chi2Sf(bp, bpDf) < a) warnings.push('Breusch–Pagan: the spread of the residuals changes with the predictors (heteroscedasticity).');
  if (sw3 && sw3.p < a) warnings.push('Shapiro–Wilk: the residuals are not normal.');
  void lvl;
  return { tables: { out: table('coefficients', coef), anova: table('ANOVA', anova), model: table('model', model), fitted }, report, warnings, errors: [] };
}

// What a node waits for, in words
export const STAT_WAIT: Record<string, string> = {
  padjust: 'Connect a table with a column of p-values (a test node’s output …).',
  contingency: 'Connect a dataset: a row per observation (two columns of categories), or a table of counts.',
  roc: 'Connect a dataset: a row per case, its true class and its score(s).',
  survival: 'Connect a dataset: a row per subject, its time, the event (1) or censored (0), its group.',
  regress: 'Connect a dataset: Y and the predictors, a row per observation.',
};
// The values of the columns a node chooses among: the true class (ROC), the event column (Survival), the categories
// among the predictors (Linear regression)
export function statLevels(ds: Dataset, n: { type: string; data: unknown }): Record<string, string[]> | undefined {
  const lv = (name: string, max = 50) => {
    const c = byName(ds, name);
    if (!c) return [];
    const out: string[] = [];
    for (let i = 0; i < c.values.length && out.length <= max; i++) {
      const v = levelOf(c, i);
      if (v && !out.includes(v)) out.push(v);
    }
    return out.length > max ? [] : out;
  };
  if (n.type === 'roc') return { truth: lv((n.data as RocData).truth) };
  if (n.type === 'survival') return { event: lv((n.data as SurvivalData).event) };
  if (n.type === 'regress') {
    const d = n.data as RegressData;
    if (!d.xs.trim()) return undefined;
    const names = ds.columns.map((c) => c.name);
    const fset = new Set(d.factors.trim() ? pick(d.factors, names, true, ds.columns).found.map((j) => names[j]) : []);
    const xs = pick(d.xs, names, true, ds.columns).found.map((j) => ds.columns[j]);
    const cats = xs.filter((c) => c.name !== d.y && (isText(c) || fset.has(c.name)));
    return cats.length ? Object.fromEntries(cats.map((c) => [c.name, lv(c.name).sort(natural)])) : undefined;
  }
  return undefined;
}
