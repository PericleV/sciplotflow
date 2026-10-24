// The statistics nodes: the data shaped as the test needs it — columns (each group a column), indexed (a value column
// and factor columns) or subjects (a row per subject, a column per condition) — the tests run, and their tables:
// results, groups (N, mean, SD, SE, CI …), post-hoc comparisons, and a report in words.
import { pick } from './extract.ts';
import { column, fmtNum, roleOf, type Column, type Dataset } from './table.ts';
import * as H from './hypo.ts';
import { maxOf } from './minmax.ts';
import { powerAnova, powerT, sampleSizeAnova, sampleSizeT } from './power.ts';
import { clusterOrder, pca } from './multivar.ts';
import { bothWithin, dunnett, factorCols, interCols, mixedDesign, mixedModel, type RMRow } from './rmstats.ts';

export type StatLayout = 'columns' | 'indexed' | 'subjects';
// cols: the columns (columns, subjects; empty: the Y ones, else every numeric one); value, factor, factor2: indexed
export type StatInput = { layout: StatLayout; cols: string; value: string; factor: string; factor2?: string; alpha: number };
export type NormData = StatInput & { outliers: 'none' | 'grubbs' | 'dixon' };
// power: the power of the test at the effect found, and the size needed for `target` (absent: 0.8)
export type TTestData = StatInput & { test: 'one' | 'two' | 'paired'; mu: number; equalVar: boolean; alt: H.Alt; power?: boolean; target?: number };
// two-rm: two-way with repeated measures (within: B within the subjects and A between them, or both within); mixed: a
// linear mixed model (REML, a random intercept per subject: repeated measures with values missing); subject: the column
// of the subjects (indexed data); post 'dunnett': every group against the control (its name; absent: the first)
export type AnovaData = StatInput & { design: 'one' | 'two' | 'repeated' | 'two-rm' | 'mixed'; welch: boolean; post: H.PostHocMethod | 'dunnett' | 'none'; power?: boolean; target?: number; subject?: string; within?: 'b' | 'both'; control?: string };
export type NonparData = StatInput & { test: 'mw' | 'wilcoxon' | 'sign' | 'kruskal' | 'friedman'; mu: number; alt: H.Alt; post: 'holm' | 'bonferroni' | 'none' };
// pca: the principal components (of the correlations or the covariances); order: the matrix in the order of a
// clustering (related columns together)
export type CorrData = { cols: string; method: 'pearson' | 'spearman' | 'kendall'; alpha: number; pca?: boolean; pcaOn?: 'corr' | 'cov'; order?: 'given' | 'cluster' };

// levels: the values of some columns, for the node's choices (the positive class, the reference of a category …)
export type StatOut = { tables: Record<string, Dataset>; report: string[]; warnings: string[]; errors: string[]; levels?: Record<string, string[]> };

export const isText = (c: Column) => !!c.text && Array.from(c.values).every((v) => !Number.isFinite(v));
const finite = (c: Column) => Array.from(c.values).filter(Number.isFinite);
// the columns asked for (empty: every numeric column but the ones designated “–”)
export function chosen(ds: Dataset, spec: string): Column[] | string {
  const cols = ds.columns;
  if (spec.trim()) {
    const p = pick(spec, cols.map((c) => c.name), true);
    if (p.missing.length) return `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
    return p.found.map((j) => cols[j]);
  }
  // every numeric column (an X designated by default is a group too), except the ones designated “–”
  return cols.filter((c, j) => !isText(c) && roleOf(cols, j) !== 'none');
}
export const byName = (ds: Dataset, name: string) => ds.columns.find((c) => c.name === name);
// the level of row i of a factor column: its text, else its value
export const levelOf = (c: Column, i: number) => (c.text?.[i]?.trim() ? c.text[i].trim() : Number.isFinite(c.values[i]) ? fmtNum(c.values[i], 6) : '');

// groups: from columns (each a group) or from a value column split by a factor
export function groupsOf(ds: Dataset, d: StatInput): { names: string[]; groups: number[][] } | string {
  if (d.layout === 'indexed') {
    const v = byName(ds, d.value);
    const f = byName(ds, d.factor);
    if (!v) return d.value ? `No column “${d.value}”.` : 'Choose the value column.';
    if (!f) return d.factor ? `No column “${d.factor}”.` : 'Choose the factor column (the group of every row).';
    const names: string[] = [];
    const groups: number[][] = [];
    for (let i = 0; i < v.values.length; i++) {
      const lv = levelOf(f, i);
      if (!lv || !Number.isFinite(v.values[i])) continue;
      let k = names.indexOf(lv);
      if (k < 0) {
        k = names.length;
        names.push(lv);
        groups.push([]);
      }
      groups[k].push(v.values[i]);
    }
    return { names, groups };
  }
  const cols = chosen(ds, d.cols);
  if (typeof cols === 'string') return cols;
  return { names: cols.map((c) => c.name), groups: cols.map(finite) };
}
// subjects: a row per subject, a column per condition — the complete rows
export function subjectsOf(ds: Dataset, d: StatInput): { names: string[]; m: number[][]; dropped: number } | string {
  const cols = chosen(ds, d.cols);
  if (typeof cols === 'string') return cols;
  const n = Math.max(0, maxOf(cols.map((c) => c.values.length)));
  const m: number[][] = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const r = cols.map((c) => c.values[i]);
    if (r.every(Number.isFinite)) m.push(r);
    else if (r.some(Number.isFinite)) dropped++;
  }
  return { names: cols.map((c) => c.name), m, dropped };
}

// ---- tables ----
export type Row = Record<string, number | string>;
// a table from rows: a column per key (text keys: a text column), in the order the keys first appear
export function table(name: string, rows: Row[], roles: Record<string, Column['role']> = {}): Dataset {
  const keys: string[] = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => !keys.includes(k) && keys.push(k)));
  const columns = keys.map((k): Column => {
    const text = rows.some((r) => typeof r[k] === 'string');
    const c = text ? column(k, Float64Array.from(rows, () => NaN), rows.map((r) => (r[k] === undefined ? '' : String(r[k])))) : column(k, Float64Array.from(rows, (r) => (typeof r[k] === 'number' ? (r[k] as number) : NaN)));
    return { ...c, role: roles[k] ?? (text ? 'label' : 'none') };
  });
  return { name, columns };
}
export const sig = (p: number, a: number) => (Number.isFinite(p) ? (p < a ? 'yes' : 'no') : '');
export const fp = (p: number) => (!Number.isFinite(p) ? '—' : p < 0.0001 ? 'p < 0.0001' : `p = ${fmtNum(p, 3)}`);
export const f3 = (v: number) => fmtNum(v, 4);
// the groups: the group (a number with its name) as X, the mean as Y, the SE as ±Y — ready for a Plot
function groupTable(names: string[], groups: number[][], level: number): Dataset {
  const st = groups.map((g, i) => H.groupStats(names[i], g, level));
  const columns: Column[] = [
    { ...column('group', Float64Array.from(st, (_, i) => i + 1), names), role: 'x' },
    { ...column('N', Float64Array.from(st, (s) => s.n)), role: 'none' },
    { ...column('mean', Float64Array.from(st, (s) => s.mean)), role: 'y' },
    { ...column('SE', Float64Array.from(st, (s) => s.se)), role: 'yerr' },
    { ...column('SD', Float64Array.from(st, (s) => s.sd)), role: 'none' },
    { ...column(`CI ${Math.round(level * 100)} % low`, Float64Array.from(st, (s) => s.lo)), role: 'none' },
    { ...column(`CI ${Math.round(level * 100)} % high`, Float64Array.from(st, (s) => s.hi)), role: 'none' },
    { ...column('median', Float64Array.from(st, (s) => s.median)), role: 'none' },
    { ...column('min', Float64Array.from(st, (s) => s.min)), role: 'none' },
    { ...column('max', Float64Array.from(st, (s) => s.max)), role: 'none' },
  ];
  return { name: 'groups', columns };
}
const testRow = (t: H.TestResult, a: number, extra: Row = {}): Row => ({ test: t.test, statistic: t.statName, value: t.stat, ...(t.df !== undefined ? { df: t.df } : {}), ...(t.df2 !== undefined ? { df2: t.df2 } : {}), p: t.p, [`significant (α = ${a})`]: sig(t.p, a), ...extra, ...(t.note ? { note: t.note } : {}) });
const say = (t: H.TestResult) => `${t.test}: ${t.statName}${t.df !== undefined ? `(${fmtNum(t.df, 4)}${t.df2 !== undefined ? `, ${fmtNum(t.df2, 4)}` : ''})` : ''} = ${f3(t.stat)}, ${fp(t.p)}`;
const tooFew = (groups: number[][], names: string[], min: number) => {
  const k = groups.findIndex((g) => g.length < min);
  return k >= 0 ? `${names[k]}: ${groups[k].length} value${groups[k].length === 1 ? '' : 's'}: at least ${min} are needed.` : '';
};

// ---- Normality & outliers ----
export function normalityNode(ds: Dataset, d: NormData): StatOut {
  const g = d.layout === 'subjects' ? groupsOf(ds, { ...d, layout: 'columns' }) : groupsOf(ds, d);
  if (typeof g === 'string') return { tables: {}, report: [], warnings: [], errors: [g] };
  const a = d.alpha;
  const rows: Row[] = [];
  const out: Row[] = [];
  const report: string[] = [];
  g.groups.forEach((x, k) => {
    const name = g.names[k];
    const tests = [H.shapiroWilk(x), H.andersonDarling(x), H.lilliefors(x), H.dagostino(x)];
    tests.forEach((t) => rows.push({ group: name, N: x.length, ...testRow(t, a) }));
    const sw = tests[0];
    report.push(`${name} (N = ${x.length}): ${Number.isFinite(sw.p) ? (sw.p < a ? 'not normal' : 'consistent with normal') : '—'} (Shapiro–Wilk W = ${f3(sw.stat)}, ${fp(sw.p)})`);
    const o = d.outliers === 'grubbs' ? H.grubbs(x, a) : d.outliers === 'dixon' ? H.dixonQ(x, a) : null;
    if (d.outliers !== 'none') {
      if (!o) out.push({ group: name, test: d.outliers === 'dixon' ? 'Dixon Q' : 'Grubbs', note: d.outliers === 'dixon' ? 'needs 3 to 10 values' : 'needs 3 values or more' });
      else {
        out.push({ group: name, test: o.test, value: o.value, 'index (1 …)': o.index + 1, statistic: o.stat, critical: o.crit ?? NaN, p: o.p, outlier: o.outlier ? 'yes' : 'no' });
        if (o.outlier) report.push(`${name}: ${fmtNum(o.value, 6)} is an outlier (${o.test}, ${o.test === 'Grubbs' ? fp(o.p) : `Q = ${f3(o.stat)} > ${o.crit}`}).`);
      }
    }
  });
  return { tables: { out: table('normality', rows), outliers: table('outliers', out), groups: groupTable(g.names, g.groups, 1 - a) }, report, warnings: [], errors: [] };
}

// ---- t-tests ----
export function tTestNode(ds: Dataset, d: TTestData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const rows: Row[] = [];
  const report: string[] = [];
  const warnings: string[] = [];
  const est = (r: H.TTest): Row => ({ difference: r.diff, [`CI ${Math.round(lvl * 100)} % low`]: r.lo, [`CI ${Math.round(lvl * 100)} % high`]: r.hi, "Cohen's d": r.d });
  if (d.test === 'paired') {
    const s = subjectsOf(ds, { ...d, layout: 'subjects' });
    if (typeof s === 'string') return { tables: {}, report: [], warnings: [], errors: [s] };
    if (s.names.length !== 2) return { tables: {}, report: [], warnings: [], errors: [`A paired t-test takes two columns (before, after): ${s.names.length} chosen.`] };
    if (s.m.length < 2) return { tables: {}, report: [], warnings: [], errors: ['Fewer than 2 complete pairs.'] };
    if (s.dropped) warnings.push(`${s.dropped} incomplete row${s.dropped > 1 ? 's' : ''} left out.`);
    const [x, y] = [s.m.map((r) => r[0]), s.m.map((r) => r[1])];
    const r = H.tPaired(x, y, d.alt, lvl);
    rows.push(testRow(r, a, est(r)));
    report.push(`${say(r)}: the mean difference ${s.names[0]} − ${s.names[1]} = ${f3(r.diff)} [${f3(r.lo)}, ${f3(r.hi)}] ${r.p < a ? 'differs' : 'does not differ'} from 0 at α = ${a}.`);
    const pw = d.power ? tPower(r.d, x.length, null, d, report) : null;
    return { tables: { out: table('t-test', rows), groups: groupTable(s.names, [x, y], lvl), ...(pw ? { power: pw } : {}) }, report, warnings, errors: [] };
  }
  const g = groupsOf(ds, d);
  if (typeof g === 'string') return { tables: {}, report: [], warnings: [], errors: [g] };
  if (d.test === 'one') {
    const x = g.groups[0];
    if (!x || x.length < 2) return { tables: {}, report: [], warnings: [], errors: ['A one-sample t-test needs a column with 2 values or more.'] };
    if (g.groups.length > 1) warnings.push(`One-sample: only the first group (${g.names[0]}) is tested.`);
    const r = H.tOne(x, d.mu, d.alt, lvl);
    rows.push(testRow(r, a, est(r)));
    report.push(`${say(r)}: the mean of ${g.names[0]} (${f3(H.mean(x))}) ${r.p < a ? 'differs' : 'does not differ'} from ${d.mu} at α = ${a}.`);
    const pw = d.power ? tPower(r.d, x.length, null, d, report) : null;
    return { tables: { out: table('t-test', rows), groups: groupTable(g.names.slice(0, 1), [x], lvl), ...(pw ? { power: pw } : {}) }, report, warnings, errors: [] };
  }
  if (g.groups.length !== 2) return { tables: {}, report: [], warnings: [], errors: [`A two-sample t-test compares 2 groups: ${g.groups.length} found${d.layout === 'indexed' ? ' (levels of the factor)' : ''}.`] };
  const few = tooFew(g.groups, g.names, 2);
  if (few) return { tables: {}, report: [], warnings: [], errors: [few] };
  const [x, y] = g.groups;
  const r = H.tTwo(x, y, d.equalVar, d.alt, lvl);
  rows.push(testRow(r, a, est(r)));
  const f = H.fTest(x, y);
  const lv = H.levene([x, y], 'median');
  rows.push(testRow(f, a), testRow(lv, a));
  report.push(`${say(r)}: ${g.names[0]} − ${g.names[1]} = ${f3(r.diff)} [${f3(r.lo)}, ${f3(r.hi)}], the means ${r.p < a ? 'differ' : 'do not differ'} at α = ${a}.`);
  if (d.equalVar && lv.p < a) report.push(`The variances differ (Brown–Forsythe ${fp(lv.p)}): Welch's test (unequal variances) is the safer one.`);
  const pw = d.power ? tPower(r.d, x.length, y.length, d, report) : null;
  return { tables: { out: table('t-test', rows), groups: groupTable(g.names, g.groups, lvl), ...(pw ? { power: pw } : {}) }, report, warnings, errors: [] };
}

// ---- power ----
// the power at the effect found (Cohen's d) and the size needed for the target power (two samples: per group, as many
// in each as now in proportion)
function tPower(dEff: number, n1: number, n2: number | null, d: TTestData, report: string[]): Dataset {
  const target = d.target && d.target > 0 && d.target < 1 ? d.target : 0.8;
  const alt = d.alt === 'less' ? 'less' : d.alt === 'greater' ? 'greater' : 'two-sided';
  const p = powerT(dEff, n1, n2, d.alpha, alt);
  const ratio = n2 ? n2 / n1 : 1;
  const need = sampleSizeT(dEff, target, d.alpha, alt, n2 !== null, ratio);
  const who = n2 ? 'per group' : d.test === 'paired' ? 'pairs' : 'values';
  report.push(`Power: ${fmtNum(100 * p, 3)} % to find an effect of d = ${f3(dEff)} at α = ${d.alpha}; for ${fmtNum(100 * target, 3)} %: ${Number.isFinite(need) ? `${need}${n2 && ratio !== 1 ? ` and ${Math.ceil(ratio * need)}` : ''} ${who}` : 'more than a million'} (now ${n2 ? `${n1} and ${n2}` : n1}).`);
  return table('power', [{ "effect (Cohen's d)": dEff, α: d.alpha, N: n2 ? n1 + n2 : n1, power: p, 'target power': target, [`N needed (${who})`]: need }]);
}
function anovaPower(eta2: number, groups: number[][], d: AnovaData, report: string[]): Dataset {
  const target = d.target && d.target > 0 && d.target < 1 ? d.target : 0.8;
  const f = Math.sqrt(eta2 / (1 - eta2));
  const N = groups.reduce((s, g) => s + g.length, 0);
  const k = groups.length;
  const p = powerAnova(f, k, N, d.alpha);
  const need = sampleSizeAnova(f, k, target, d.alpha);
  report.push(`Power: ${fmtNum(100 * p, 3)} % to find an effect of f = ${f3(f)} at α = ${d.alpha}; for ${fmtNum(100 * target, 3)} %: ${Number.isFinite(need) ? `${need / k} per group (${need} in all)` : 'more than a million'} (now ${N}).`);
  return table('power', [{ "effect (Cohen's f)": f, 'η²': eta2, α: d.alpha, groups: k, N, power: p, 'target power': target, 'N needed (per group)': need / k, 'N needed (in all)': need }]);
}

// ---- ANOVA ----
const POST_NAMES: Record<H.PostHocMethod | 'dunnett', string> = { dunnett: 'Dunnett (against the control)',  tukey: 'Tukey HSD', bonferroni: 'Bonferroni', holm: 'Holm', scheffe: 'Scheffé', lsd: 'Fisher LSD', 'games-howell': 'Games–Howell' };
function pairTable(pairs: H.Pair[], names: string[], method: string, a: number, statName: string): Dataset {
  return table(
    'post hoc',
    pairs.map((q) => ({ pair: `${names[q.a]} − ${names[q.b]}`, method, difference: q.diff, SE: q.se, [statName]: q.stat, 'p (adjusted)': q.p, 'CI low': q.lo, 'CI high': q.hi, [`significant (α = ${a})`]: sig(q.p, a) })),
  );
}
const anovaTable = (rows: H.AnovaRow[]) => table('ANOVA', rows.map((r) => ({ source: r.source, SS: r.ss, df: r.df, MS: r.ms, F: r.F, p: r.p, 'partial η²': r.eta2p })));
export function anovaNode(ds: Dataset, d: AnovaData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const checks: Row[] = [];
  if (d.design === 'two-rm' || d.design === 'mixed') return rmAnova(ds, d);
  if (d.design === 'repeated') {
    const s = subjectsOf(ds, { ...d, layout: 'subjects' });
    if (typeof s === 'string') return { tables: {}, report: [], warnings: [], errors: [s] };
    if (s.names.length < 2 || s.m.length < 3) return { tables: {}, report: [], warnings: [], errors: ['Repeated measures: 2 conditions (columns) or more and 3 complete subjects (rows) or more.'] };
    if (s.dropped) warnings.push(`${s.dropped} incomplete subject${s.dropped > 1 ? 's' : ''} left out.`);
    const r = H.repeated(s.m);
    checks.push(testRow(r.mauchly, a, { 'Greenhouse–Geisser ε': r.gg, 'Huynh–Feldt ε': r.hf }));
    const c = r.rows[0];
    const sph = r.mauchly.p < a;
    report.push(`Conditions: F(${c.df}, ${r.dfE}) = ${f3(c.F)}, ${fp(c.p)}, partial η² = ${f3(c.eta2p)}.`);
    report.push(sph ? `Sphericity rejected (Mauchly ${fp(r.mauchly.p)}): Greenhouse–Geisser ε = ${f3(r.gg)}, ${fp(r.pGG)} (Huynh–Feldt ${fp(r.pHF)}).` : `Sphericity holds (Mauchly ${fp(r.mauchly.p)}).`);
    const rows = [...r.rows];
    rows.splice(1, 0, { ...c, source: 'Conditions (Greenhouse–Geisser)', df: c.df * r.gg, p: r.pGG }, { ...c, source: 'Conditions (Huynh–Feldt)', df: c.df * r.hf, p: r.pHF });
    const cols = s.names.map((_, j) => s.m.map((row) => row[j]));
    const tables: Record<string, Dataset> = { out: anovaTable(rows), groups: groupTable(s.names, cols, lvl), checks: table('checks', checks) };
    if (d.post === 'dunnett') {
      // every condition against the control, on the error of the repeated measures
      const ci = Math.max(0, s.names.indexOf(d.control ?? ''));
      const pairs = dunnett(cols, ci, r.mse, r.dfE, lvl);
      tables.posthoc = pairTable(pairs, s.names, POST_NAMES.dunnett, a, 't');
      const sg = pairs.filter((q) => q.p < a);
      report.push(`Dunnett against ${s.names[ci]}: ${sg.length ? sg.map((q) => `${s.names[q.a]} (${fp(q.p)})`).join('; ') : 'none differs'}.`);
    } else if (d.post !== 'none') {
      // paired t-tests between the conditions, adjusted (Bonferroni, else Holm)
      const how = d.post === 'bonferroni' ? 'bonferroni' : 'holm';
      const pairs: H.Pair[] = [];
      for (let i = 0; i < cols.length; i++)
        for (let j = i + 1; j < cols.length; j++) {
          const t = H.tPaired(cols[i], cols[j], 'two-sided', lvl);
          pairs.push({ a: i, b: j, diff: t.diff, se: t.diff / t.stat, stat: t.stat, p: t.p, lo: t.lo, hi: t.hi });
        }
      const adj = H.adjust(pairs.map((q) => q.p), how);
      pairs.forEach((q, i) => (q.p = adj[i]));
      tables.posthoc = pairTable(pairs, s.names, `paired t, ${how === 'holm' ? 'Holm' : 'Bonferroni'}`, a, 't');
    }
    return { tables, report, warnings, errors: [] };
  }
  if (d.design === 'two') {
    const v = byName(ds, d.value);
    const fa = byName(ds, d.factor);
    const fb = byName(ds, d.factor2 ?? '');
    if (!v || !fa || !fb) return { tables: {}, report: [], warnings: [], errors: ['Two-way ANOVA: the data indexed; choose the value column and the two factor columns.'] };
    const [an, bn]: [string[], string[]] = [[], []];
    const y: number[] = [];
    const ia: number[] = [];
    const ib: number[] = [];
    for (let i = 0; i < v.values.length; i++) {
      const [la, lb] = [levelOf(fa, i), levelOf(fb, i)];
      if (!la || !lb || !Number.isFinite(v.values[i])) continue;
      if (!an.includes(la)) an.push(la);
      if (!bn.includes(lb)) bn.push(lb);
      y.push(v.values[i]);
      ia.push(an.indexOf(la));
      ib.push(bn.indexOf(lb));
    }
    if (an.length < 2 || bn.length < 2) return { tables: {}, report: [], warnings: [], errors: [`Two-way ANOVA: each factor needs 2 levels or more (${fa.name}: ${an.length}, ${fb.name}: ${bn.length}).`] };
    const r = H.twoWay(y, ia, ib, an.length, bn.length);
    if (r.empty) warnings.push(`${r.empty} combination${r.empty > 1 ? 's' : ''} of the levels without data: the interaction is not fully estimable.`);
    r.rows[0].source = fa.name;
    r.rows[1].source = fb.name;
    r.rows[2].source = `${fa.name} × ${fb.name}`;
    r.rows.slice(0, 3).forEach((q) => report.push(`${q.source}: F(${q.df}, ${r.dfE}) = ${f3(q.F)}, ${fp(q.p)}, partial η² = ${f3(q.eta2p)}: ${q.p < a ? 'significant' : 'not significant'}.`));
    // the cells (every combination) as groups
    const names: string[] = [];
    const cells: number[][] = [];
    an.forEach((la, i) =>
      bn.forEach((lb, j) => {
        const g = y.filter((_, q) => ia[q] === i && ib[q] === j);
        if (g.length) {
          names.push(`${la} · ${lb}`);
          cells.push(g);
        }
      }),
    );
    const res = y.map((v2, q) => v2 - H.mean(cells[names.indexOf(`${an[ia[q]]} · ${bn[ib[q]]}`)]));
    checks.push(testRow(H.levene(cells.filter((g) => g.length > 1), 'median'), a), testRow({ ...H.shapiroWilk(res), test: 'Shapiro–Wilk (residuals)' }, a));
    const tables: Record<string, Dataset> = { out: anovaTable(r.rows), groups: groupTable(names, cells, lvl), checks: table('checks', checks) };
    if (d.post !== 'none') {
      // the levels of each factor compared over the other (on the MSE of the model)
      const method = d.post === 'games-howell' || d.post === 'dunnett' ? 'tukey' : d.post;
      const pa = H.postHoc(an.map((_, i) => y.filter((__, q) => ia[q] === i)), method, r.mse, r.dfE, lvl);
      const pb = H.postHoc(bn.map((_, i) => y.filter((__, q) => ib[q] === i)), method, r.mse, r.dfE, lvl);
      const ta = pairTable(pa, an, POST_NAMES[method], a, method === 'tukey' ? 'q' : method === 'scheffe' ? 'F' : 't');
      const tb = pairTable(pb, bn, POST_NAMES[method], a, method === 'tukey' ? 'q' : method === 'scheffe' ? 'F' : 't');
      tables.posthoc = { name: 'post hoc', columns: ta.columns.map((c, j) => ({ ...c, values: Float64Array.from([...c.values, ...tb.columns[j].values]), ...(c.text ? { text: [...c.text, ...(tb.columns[j].text ?? [])] } : {}) })) };
      if (d.post === 'games-howell' || d.post === 'dunnett') warnings.push(`Two-way: ${d.post === 'dunnett' ? 'Dunnett' : 'Games–Howell'} is for one factor; Tukey used.`);
    }
    return { tables, report, warnings, errors: [] };
  }
  // one-way
  const g = groupsOf(ds, d);
  if (typeof g === 'string') return { tables: {}, report: [], warnings: [], errors: [g] };
  if (g.groups.length < 2) return { tables: {}, report: [], warnings: [], errors: ['One-way ANOVA: 2 groups or more.'] };
  const few = tooFew(g.groups, g.names, 2);
  if (few) return { tables: {}, report: [], warnings: [], errors: [few] };
  const r = H.oneWay(g.groups);
  const rows: H.AnovaRow[] = [
    { source: 'Between groups', ss: r.ssb, df: r.df1, ms: r.ssb / r.df1, F: r.F, p: r.p, eta2p: r.eta2 },
    { source: 'Within groups (error)', ss: r.ssw, df: r.df2, ms: r.mse, F: NaN, p: NaN, eta2p: NaN },
    { source: 'Total (corrected)', ss: r.ssb + r.ssw, df: r.df1 + r.df2, ms: NaN, F: NaN, p: NaN, eta2p: NaN },
  ];
  report.push(`One-way ANOVA: F(${r.df1}, ${r.df2}) = ${f3(r.F)}, ${fp(r.p)}, η² = ${f3(r.eta2)}, ω² = ${f3(r.omega2)}: the means ${r.p < a ? 'differ' : 'do not differ'} at α = ${a}.`);
  const lv = H.levene(g.groups, 'median');
  const res = g.groups.flatMap((x) => x.map((v) => v - H.mean(x)));
  checks.push(testRow(lv, a), testRow({ ...H.shapiroWilk(res), test: 'Shapiro–Wilk (residuals)' }, a));
  if (d.welch) {
    const w = H.welchAnova(g.groups);
    rows.splice(1, 0, { source: "Welch's ANOVA", ss: NaN, df: w.df1, ms: NaN, F: w.F, p: w.p, eta2p: NaN });
    report.push(`Welch's ANOVA (unequal variances): F(${w.df1}, ${fmtNum(w.df2, 4)}) = ${f3(w.F)}, ${fp(w.p)}.`);
  } else if (lv.p < a) report.push(`The variances differ (Brown–Forsythe ${fp(lv.p)}): consider Welch's ANOVA and Games–Howell.`);
  const tables: Record<string, Dataset> = { out: anovaTable(rows), groups: groupTable(g.names, g.groups, lvl), checks: table('checks', checks) };
  if (d.power) tables.power = anovaPower(r.eta2, g.groups, d, report);
  if (d.post === 'dunnett') {
    const ci = Math.max(0, g.names.indexOf(d.control ?? ''));
    const pairs = dunnett(g.groups, ci, r.mse, r.df2, lvl);
    tables.posthoc = pairTable(pairs, g.names, POST_NAMES.dunnett, a, 't');
    const s = pairs.filter((q) => q.p < a);
    report.push(`Dunnett against ${g.names[ci]}: ${s.length ? s.map((q) => `${g.names[q.a]} (${fp(q.p)})`).join('; ') : 'none differs'}.`);
  } else if (d.post !== 'none') {
    const pairs = H.postHoc(g.groups, d.post, r.mse, r.df2, lvl);
    tables.posthoc = pairTable(pairs, g.names, POST_NAMES[d.post], a, d.post === 'tukey' || d.post === 'games-howell' ? 'q' : d.post === 'scheffe' ? 'F' : 't');
    const s = pairs.filter((q) => q.p < a);
    report.push(`${POST_NAMES[d.post]}: ${s.length ? s.map((q) => `${g.names[q.a]} ≠ ${g.names[q.b]} (${fp(q.p)})`).join('; ') : 'no pair differs'}.`);
  }
  return { tables, report, warnings, errors: [] };
}

// ---- two-way with repeated measures; the mixed model ----
// indexed data: a row per measurement — its value, factor A, factor B (two-way), its subject
function rmAnova(ds: Dataset, d: AnovaData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const fail = (m: string): StatOut => ({ tables: {}, report: [], warnings: [], errors: [m] });
  const v = byName(ds, d.value);
  const fa = byName(ds, d.factor);
  const fb = d.factor2 ? byName(ds, d.factor2) : undefined;
  const sj = byName(ds, d.subject ?? '');
  const mixed = d.design === 'mixed';
  if (!v || !fa || !sj || (!mixed && !fb)) return fail(mixed ? 'Mixed model: the data indexed; the value, factor A (factor B optional) and the column of the subjects.' : 'Two-way with repeated measures: the data indexed; the value, factor A, factor B and the column of the subjects.');
  const [an, bn, sn]: [string[], string[], string[]] = [[], [], []];
  const rows: { y: number; ia: number; ib: number; is: number }[] = [];
  for (let i = 0; i < v.values.length; i++) {
    const [la, lb, ls] = [levelOf(fa, i), fb ? levelOf(fb, i) : '·', levelOf(sj, i)];
    if (!la || !lb || !ls || !Number.isFinite(v.values[i])) continue;
    if (!an.includes(la)) an.push(la);
    if (!bn.includes(lb)) bn.push(lb);
    if (!sn.includes(ls)) sn.push(ls);
    rows.push({ y: v.values[i], ia: an.indexOf(la), ib: bn.indexOf(lb), is: sn.indexOf(ls) });
  }
  const A = fa.name;
  const Bn = fb?.name ?? '';
  // the cells (every combination) as groups
  const cellNames: string[] = [];
  const cells: number[][] = [];
  an.forEach((la, i) =>
    bn.forEach((lb, j) => {
      const g = rows.filter((r) => r.ia === i && r.ib === j).map((r) => r.y);
      if (g.length) {
        cellNames.push(fb ? `${la} · ${lb}` : la);
        cells.push(g);
      }
    }),
  );
  if (mixed) {
    if (an.length < 2) return fail(`Mixed model: ${A} needs 2 levels or more.`);
    const cA = factorCols(rows.map((r) => r.ia), an.length);
    const terms: { name: string; cols: number[][] }[] = [{ name: A, cols: cA }];
    if (fb && bn.length > 1) {
      const cB = factorCols(rows.map((r) => r.ib), bn.length);
      terms.push({ name: Bn, cols: cB }, { name: `${A} × ${Bn}`, cols: interCols(cA, cB) });
    }
    const fit = mixedModel(rows.map((r) => r.y), rows.map((r) => r.is), terms);
    if (typeof fit === 'string') return fail(`Mixed model: ${fit}.`);
    fit.tests.forEach((t) => report.push(`${t.source}: F(${t.df1}, ${fmtNum(t.df2, 4)}) = ${f3(t.F)}, ${fp(t.p)}: ${t.p < a ? 'significant' : 'not significant'}.`));
    report.push(`Subjects: σ² = ${f3(fit.sigmaU2)} (ICC ${f3(fit.icc)}), residual σ² = ${f3(fit.sigmaE2)}; ${fit.N} values of ${fit.subjects} subjects (REML; the df by Satterthwaite).`);
    return {
      tables: {
        out: table('mixed model', fit.tests.map((t) => ({ source: t.source, F: t.F, 'df (numerator)': t.df1, 'df (denominator)': t.df2, p: t.p, [`significant (α = ${a})`]: sig(t.p, a) }))),
        groups: groupTable(cellNames, cells, lvl),
        checks: table('checks', [
          { check: 'Variance between the subjects (random intercept)', value: fit.sigmaU2 },
          { check: 'Residual variance', value: fit.sigmaE2 },
          { check: 'Intraclass correlation', value: fit.icc },
          { check: 'REML log-likelihood', value: fit.logLik },
          { check: 'Values', value: fit.N },
          { check: 'Subjects', value: fit.subjects },
        ]),
      },
      report,
      warnings,
      errors: [],
    };
  }
  if (an.length < 2 || bn.length < 2) return fail(`Two-way with repeated measures: each factor needs 2 levels or more (${A}: ${an.length}, ${Bn}: ${bn.length}).`);
  // every subject's mean in every cell (several values in a cell: their mean)
  const both = d.within === 'both';
  const per = new Map<number, Map<string, number[]>>();
  for (const r of rows) {
    const m = per.get(r.is) ?? new Map<string, number[]>();
    const k = `${r.ia}|${r.ib}`;
    m.set(k, [...(m.get(k) ?? []), r.y]);
    per.set(r.is, m);
  }
  let doubled = 0;
  let dropped = 0;
  const cube: number[][][] = [];
  const m2: number[][] = [];
  const group: number[] = [];
  for (const [, m] of per) {
    if ([...m.values()].some((x) => x.length > 1)) doubled++;
    if (both) {
      const c = an.map((_, i) => bn.map((_, j) => m.get(`${i}|${j}`)));
      if (c.some((r) => r.some((x) => !x))) {
        dropped++;
        continue;
      }
      cube.push(c.map((r) => r.map((x) => H.mean(x!))));
    } else {
      const keys = [...m.keys()];
      const ia = new Set(keys.map((k) => k.split('|')[0]));
      if (ia.size > 1) return fail(`${A} changes within a subject: it is a factor within the subjects too; choose “both within”.`);
      const g = Number([...ia][0]);
      const row = bn.map((_, j) => m.get(`${g}|${j}`));
      if (row.some((x) => !x)) {
        dropped++;
        continue;
      }
      m2.push(row.map((x) => H.mean(x!)));
      group.push(g);
    }
  }
  if (doubled) warnings.push(`${doubled} subject${doubled > 1 ? 's have' : ' has'} several values in a cell: their mean taken.`);
  if (dropped) warnings.push(`${dropped} incomplete subject${dropped > 1 ? 's' : ''} left out (the mixed model keeps them).`);
  let res: { rows: RMRow[]; errors: { source: string; ss: number; df: number }[] } | string;
  if (both) res = cube.length >= 3 ? bothWithin(cube) : 'at least 3 complete subjects';
  else res = m2.length >= 3 ? mixedDesign(m2, group, an.length) : 'at least 3 complete subjects';
  if (typeof res === 'string') return fail(`Two-way with repeated measures: ${res}.`);
  const names: Record<string, string> = { A, B: Bn, 'A × B': `${A} × ${Bn}` };
  const checks: Row[] = [];
  const out: Row[] = [];
  for (const r of res.rows) {
    const src = names[r.source] ?? r.source;
    out.push({ source: src, SS: r.ss, df: r.df, MS: r.ms, F: r.F, 'error df': r.dfE, p: r.p, 'p (Greenhouse–Geisser)': r.pGG ?? NaN, 'p (Huynh–Feldt)': r.pHF ?? NaN, 'ε (Greenhouse–Geisser)': r.gg ?? NaN, 'partial η²': r.eta2p });
    report.push(`${src}: F(${r.df}, ${r.dfE}) = ${f3(r.F)}, ${fp(r.p)}${r.pGG !== undefined && r.gg! < 1 ? ` (Greenhouse–Geisser ε = ${f3(r.gg!)}, ${fp(r.pGG)})` : ''}, partial η² = ${f3(r.eta2p)}.`);
    if (r.mauchly) checks.push(testRow({ ...r.mauchly, test: `Mauchly (sphericity): ${src}` }, a, { 'Greenhouse–Geisser ε': r.gg!, 'Huynh–Feldt ε': r.hf! }));
  }
  for (const e of res.errors) out.push({ source: e.source.replace(/\bA\b/, A).replace(/\bB\b/, Bn), SS: e.ss, df: e.df, MS: e.ss / e.df, F: NaN, 'error df': NaN, p: NaN, 'p (Greenhouse–Geisser)': NaN, 'p (Huynh–Feldt)': NaN, 'ε (Greenhouse–Geisser)': NaN, 'partial η²': NaN });
  report.push(both ? `Both factors within the subjects (${cube.length} subjects).` : `${A} between the subjects, ${Bn} within them (${m2.length} subjects; unequal groups: Type III sums of squares).`);
  return { tables: { out: table('ANOVA', out), groups: groupTable(cellNames, cells, lvl), checks: table('checks', checks) }, report, warnings, errors: [] };
}

// ---- nonparametric ----
export function nonparNode(ds: Dataset, d: NonparData): StatOut {
  const a = d.alpha;
  const lvl = 1 - a;
  const report: string[] = [];
  const warnings: string[] = [];
  const medians = (names: string[], groups: number[][], extra?: number[]) =>
    table(
      'groups',
      groups.map((x, i) => {
        const s = [...x].sort((p, q) => p - q);
        const q = (f: number) => {
          const h = (s.length - 1) * f;
          return s[Math.floor(h)] + (h - Math.floor(h)) * (s[Math.ceil(h)] - s[Math.floor(h)]);
        };
        return { group: names[i], N: x.length, median: H.median(x), Q1: q(0.25), Q3: q(0.75), ...(extra ? { 'mean rank': extra[i] } : {}) };
      }),
      { group: 'x', median: 'y' },
    );
  const paired = d.test === 'friedman' || ((d.test === 'wilcoxon' || d.test === 'sign') && d.layout === 'subjects');
  if (paired) {
    const s = subjectsOf(ds, { ...d, layout: 'subjects' });
    if (typeof s === 'string') return { tables: {}, report: [], warnings: [], errors: [s] };
    if (s.dropped) warnings.push(`${s.dropped} incomplete row${s.dropped > 1 ? 's' : ''} left out.`);
    const cols = s.names.map((_, j) => s.m.map((r) => r[j]));
    if (d.test === 'friedman') {
      if (cols.length < 3 || s.m.length < 2) return { tables: {}, report: [], warnings: [], errors: ['Friedman: 3 conditions (columns) or more and 2 complete subjects or more.'] };
      const r = H.friedman(s.m);
      report.push(`${say(r)}: the conditions ${r.p < a ? 'differ' : 'do not differ'} at α = ${a}.`);
      return { tables: { out: table('test', [testRow(r, a)]), groups: medians(s.names, cols) }, report, warnings, errors: [] };
    }
    if (cols.length !== 2) return { tables: {}, report: [], warnings: [], errors: ['Paired: two columns (before, after).'] };
    const diff = s.m.map((r) => r[0] - r[1]);
    const r = d.test === 'sign' ? H.signTest(diff) : H.wilcoxon(diff, d.alt);
    report.push(`${say(r)}: ${s.names[0]} and ${s.names[1]} ${r.p < a ? 'differ' : 'do not differ'} at α = ${a}${r.note ? ` (${r.note})` : ''}.`);
    return { tables: { out: table('test', [testRow(r, a)]), groups: medians(s.names, cols) }, report, warnings, errors: [] };
  }
  const g = groupsOf(ds, d);
  if (typeof g === 'string') return { tables: {}, report: [], warnings: [], errors: [g] };
  if (d.test === 'wilcoxon' || d.test === 'sign') {
    // one sample: against the median μ
    const x = g.groups[0];
    if (!x?.length) return { tables: {}, report: [], warnings: [], errors: ['No values.'] };
    const r = d.test === 'sign' ? H.signTest(x.map((v) => v - d.mu)) : H.wilcoxon(x.map((v) => v - d.mu), d.alt);
    report.push(`${say(r)}: the median of ${g.names[0]} ${r.p < a ? 'differs' : 'does not differ'} from ${d.mu} at α = ${a}.`);
    return { tables: { out: table('test', [testRow(r, a)]), groups: medians(g.names.slice(0, 1), [x]) }, report, warnings, errors: [] };
  }
  if (d.test === 'mw') {
    if (g.groups.length !== 2) return { tables: {}, report: [], warnings: [], errors: [`Mann–Whitney compares 2 groups: ${g.groups.length} found.`] };
    const r = H.mannWhitney(g.groups[0], g.groups[1], d.alt);
    report.push(`${say(r)}: ${g.names[0]} and ${g.names[1]} ${r.p < a ? 'differ' : 'do not differ'} at α = ${a} (${r.note}).`);
    return { tables: { out: table('test', [testRow(r, a)]), groups: medians(g.names, g.groups) }, report, warnings, errors: [] };
  }
  if (g.groups.length < 2) return { tables: {}, report: [], warnings: [], errors: ['Kruskal–Wallis: 2 groups or more.'] };
  const r = H.kruskal(g.groups);
  report.push(`${say(r)}: the groups ${r.p < a ? 'differ' : 'do not differ'} at α = ${a}.`);
  const tables: Record<string, Dataset> = { out: table('test', [testRow(r, a)]), groups: medians(g.names, g.groups, r.meanRanks) };
  if (d.post !== 'none') {
    const pairs = H.dunn(g.groups, d.post);
    tables.posthoc = pairTable(pairs, g.names, `Dunn, ${d.post === 'holm' ? 'Holm' : 'Bonferroni'}`, a, 'z');
    const s = pairs.filter((q) => q.p < a);
    report.push(`Dunn: ${s.length ? s.map((q) => `${g.names[q.a]} ≠ ${g.names[q.b]} (${fp(q.p)})`).join('; ') : 'no pair differs'}.`);
  }
  void lvl;
  return { tables, report, warnings, errors: [] };
}

// ---- correlation ----
export function corrNode(ds: Dataset, d: CorrData): StatOut {
  const cols = chosen(ds, d.cols);
  if (typeof cols === 'string') return { tables: {}, report: [], warnings: [], errors: [cols] };
  if (cols.length < 2) return { tables: {}, report: [], warnings: [], errors: ['Correlation: 2 columns or more.'] };
  const a = d.alpha;
  const f = d.method === 'pearson' ? H.pearson : d.method === 'spearman' ? H.spearman : H.kendall;
  const name = d.method === 'pearson' ? 'Pearson r' : d.method === 'spearman' ? 'Spearman ρ' : 'Kendall τ-b';
  const rows: Row[] = [];
  const report: string[] = [];
  const mat = cols.map(() => cols.map(() => NaN));
  for (let i = 0; i < cols.length; i++)
    for (let j = i; j < cols.length; j++) {
      if (i === j) {
        mat[i][j] = 1;
        continue;
      }
      const ok = Array.from(cols[i].values.keys()).filter((q) => Number.isFinite(cols[i].values[q]) && Number.isFinite(cols[j].values[q]));
      if (ok.length < 3) continue;
      const c = f(ok.map((q) => cols[i].values[q]), ok.map((q) => cols[j].values[q]));
      mat[i][j] = mat[j][i] = c.r;
      rows.push({ X: cols[i].name, Y: cols[j].name, [name]: c.r, p: c.p, N: c.n, ...(d.method === 'pearson' ? { [`CI ${Math.round((1 - a) * 100)} % low`]: c.lo, [`CI ${Math.round((1 - a) * 100)} % high`]: c.hi } : {}), [`significant (α = ${a})`]: sig(c.p, a) });
      report.push(`${cols[i].name}: ${cols[j].name}: ${name} = ${f3(c.r)}, ${fp(c.p)}, N = ${c.n}`);
    }
  // the order of the columns: as given, or by a clustering of 1 − |r| (related ones together)
  const warnings: string[] = [];
  let ord = cols.map((_, i) => i);
  if (d.order === 'cluster') {
    if (mat.some((r) => r.some((v) => !Number.isFinite(v)))) warnings.push('Clustered order: a pair without enough values; the order as given.');
    else ord = clusterOrder(mat.map((r) => r.map((v) => 1 - Math.abs(v))));
  }
  const matrix: Dataset = { name: 'matrix', columns: [{ ...column('column', Float64Array.from(ord, (_, i) => i + 1), ord.map((i) => cols[i].name)), role: 'label' }, ...ord.map((j) => ({ ...column(cols[j].name, Float64Array.from(ord.map((i) => mat[i][j]))), role: 'none' as const }))] };
  const tables: Record<string, Dataset> = { out: table('pairs', rows), matrix };
  if (d.pca) {
    const pc = pca(cols.map((c) => Array.from(c.values)), d.pcaOn ?? 'corr');
    if (typeof pc === 'string') warnings.push(pc);
    else {
      const k = pc.values.length;
      let cum = 0;
      tables.pca = table(
        'components',
        pc.values.map((v, j) => {
          cum += pc.explained[j];
          return { component: `PC${j + 1}`, eigenvalue: v, '% of variance': pc.explained[j], 'cumulative %': cum };
        }),
        { component: 'x', '% of variance': 'y' },
      );
      tables.loadings = { name: 'loadings', columns: [{ ...column('variable', Float64Array.from(cols, (_, i) => i + 1), cols.map((c) => c.name)), role: 'label' }, ...Array.from({ length: k }, (_, j) => ({ ...column(`PC${j + 1}`, Float64Array.from(cols, (_, i) => pc.loadings[j][i])), role: (j === 0 ? 'x' : j === 1 ? 'y' : 'none') as Column['role'] }))] };
      tables.scores = { name: 'scores', columns: [{ ...column('row', Float64Array.from(pc.rows, (i) => i + 1)), role: 'none' }, ...Array.from({ length: k }, (_, j) => ({ ...column(`PC${j + 1}`, Float64Array.from(pc.scores, (s) => s[j])), role: (j === 0 ? 'x' : j === 1 ? 'y' : 'none') as Column['role'] }))] };
      const big = pc.explained.findIndex((_, j) => pc.explained.slice(0, j + 1).reduce((s2, v) => s2 + v, 0) >= 80);
      report.push(`Principal components (${d.pcaOn === 'cov' ? 'covariances' : 'correlations'}, ${pc.rows.length} complete rows): PC1 ${fmtNum(pc.explained[0], 3)} %, PC2 ${fmtNum(pc.explained[1] ?? NaN, 3)} % of the variance; ${big + 1} component${big ? 's' : ''} for 80 %.`);
    }
  }
  return { tables, report, warnings, errors: [] };
}
