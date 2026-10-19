// Bland–Altman (Bland & Altman 1986, 1999): how two methods measuring the same things
// agree. Every pair as a point: X the mean of the two (or A, or B as the reference, or their geometric mean), Y their
// difference A − B, the difference in % of their mean, or the ratio A/B (on a log axis: the limits from the logs). The
// bias (the mean difference) and the limits of agreement bias ± z·SD (z = 1.96 for 95 %), with their confidence
// intervals — approximate (SE of a limit s·√(1/n + z²/(2(n − 1))), Bland & Altman 1999) or exact (Carkeet 2015, the
// noncentral t); nonparametric limits (the median, the 2.5th and 97.5th percentiles); limits from a regression
// (Bland & Altman 1999: the differences regressed on X, the absolute residuals on X, limits b₀ + b₁x ± z·√(π/2)·(c₀ + c₁x)).
// The regression of the differences on X (proportional bias: slope, p), the line of equality. Pure.
import { nctInv, normInv, tCdf, tInv } from './dist.ts';
import { percentile } from './stats.ts';
import { bareName, column, fmtNum, unitOf, type Column, type Dataset } from './table.ts';
import { curveStyle, PALETTE, type Curve, type Dash, type ElementLook, type SymbolFill, type SymbolShape } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type BASpec = {
  a: string; // the two methods ('' = the first two Y)
  b: string;
  group: string; // a column of groups for the colours ('' = none)
  x: 'mean' | 'a' | 'b' | 'gmean';
  y: 'diff' | 'pct' | 'ratio';
  loa: 'parametric' | 'nonparametric' | 'regression';
  level: number; // the limits, % (95: bias ± 1.96·SD)
  ci: 'none' | 'approx' | 'exact';
  ciLevel: number;
  regLine: boolean; // the regression of the differences on X
  zeroLine: boolean; // the line of equality (0, or ratio 1)
  labels: boolean; // the values written at the right end of the lines
  colors?: string[]; // the groups' points
  looks?: (ElementLook | null)[];
  lineColors?: string[]; // the lines (BA_LINES)
  lineLooks?: (ElementLook | null)[];
  symbol: SymbolShape;
  symbolSize: number;
  symbolFill: SymbolFill;
  lineWidth: number;
  ciOpacity: number;
};
export const BA_LINES = ['bias', 'upper limit', 'lower limit', 'regression', 'equality'];
export const BA_LINE_COLORS = ['#000000', '#D62728', '#D62728', '#0072B2', '#888888'];
const BA_LINE_DASH: Dash[] = ['solid', 'dash', 'dash', 'dot', 'solid'];

export type BAStats = {
  group: string;
  n: number;
  bias: number;
  sd: number; // of the differences (ratio: of their logs)
  biasCI: [number, number];
  lower: number;
  lowerCI: [number, number];
  upper: number;
  upperCI: [number, number];
  slope: number; // the differences regressed on X
  intercept: number;
  r: number;
  pSlope: number;
  reg?: { b0: number; b1: number; c0: number; c1: number }; // the regression-based limits
  within: number; // the pairs between the limits, %
};

const meanOf = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const sdOf = (v: number[]) => {
  const m = meanOf(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};
function lsq(x: number[], y: number[]) {
  const n = x.length;
  const [mx, my] = [meanOf(x), meanOf(y)];
  let [sxx, syy, sxy] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  const b1 = sxx > 0 ? sxy / sxx : 0;
  const b0 = my - b1 * mx;
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  // the slope's t (n − 2 degrees of freedom)
  const s2 = n > 2 ? (syy - b1 * sxy) / (n - 2) : NaN;
  const t = b1 / Math.sqrt(s2 / sxx);
  const p = n > 2 && Number.isFinite(t) ? 2 * tCdf(-Math.abs(t), n - 2) : NaN;
  return { b0, b1, r, p };
}

// the agreement of differences e (ratio: their logs) at X x: the bias, the limits and their intervals, back on the plot's
// scale (ratio: exp)
export function baStats(group: string, x: number[], e: number[], d: Pick<BASpec, 'y' | 'loa' | 'level' | 'ci' | 'ciLevel'>, warnings: string[] = []): BAStats {
  const n = e.length;
  const back = (v: number) => (d.y === 'ratio' ? Math.exp(v) : v);
  const z = normInv(1 - (1 - Math.min(99.9, Math.max(50, d.level || 95)) / 100) / 2);
  const alpha = 1 - Math.min(99.9, Math.max(50, d.ciLevel || 95)) / 100;
  const tq = tInv(1 - alpha / 2, n - 1);
  const m = meanOf(e);
  const s = sdOf(e);
  const reg = lsq(x, e);
  const none: [number, number] = [NaN, NaN];
  const out: BAStats = { group, n, bias: NaN, sd: s, biasCI: none, lower: NaN, lowerCI: none, upper: NaN, upperCI: none, slope: reg.b1, intercept: reg.b0, r: reg.r, pSlope: reg.p, within: NaN };
  // the share of the pairs between two limits (on the differences' scale)
  const share = (lo: (i: number) => number, hi: (i: number) => number) => (100 * e.filter((v, i) => v >= lo(i) && v <= hi(i)).length) / n;
  if (d.loa === 'nonparametric') {
    const sorted = [...e].sort((a, b) => a - b);
    const q = (1 - Math.min(99.9, Math.max(50, d.level || 95)) / 100) / 2;
    const [lo, hi] = [percentile(sorted, q), percentile(sorted, 1 - q)];
    return { ...out, bias: back(percentile(sorted, 0.5)), lower: back(lo), upper: back(hi), within: share(() => lo, () => hi) };
  }
  out.within = share(() => m - z * s, () => m + z * s);
  const ci = d.ci !== 'none';
  out.bias = back(m);
  out.biasCI = ci ? [back(m - (tq * s) / Math.sqrt(n)), back(m + (tq * s) / Math.sqrt(n))] : none;
  out.lower = back(m - z * s);
  out.upper = back(m + z * s);
  if (ci) {
    let exact = d.ci === 'exact';
    if (exact && z * Math.sqrt(n) > 37) {
      warnings.push(`${group}: the exact intervals of the limits need z·√n ≤ 37 (n ≤ ${Math.floor((37 / z) ** 2)}); approximate ones are given.`);
      exact = false;
    }
    if (exact) {
      // Carkeet 2015: √n(θ − x̄)/s ~ noncentral t (n − 1, z√n) for the upper limit θ = μ + zσ
      const [ql, qh] = [nctInv(alpha / 2, n - 1, z * Math.sqrt(n)), nctInv(1 - alpha / 2, n - 1, z * Math.sqrt(n))];
      out.upperCI = [back(m + (s * ql) / Math.sqrt(n)), back(m + (s * qh) / Math.sqrt(n))];
      out.lowerCI = [back(m - (s * qh) / Math.sqrt(n)), back(m - (s * ql) / Math.sqrt(n))];
    } else {
      const se = s * Math.sqrt(1 / n + (z * z) / (2 * (n - 1)));
      out.lowerCI = [back(m - z * s - tq * se), back(m - z * s + tq * se)];
      out.upperCI = [back(m + z * s - tq * se), back(m + z * s + tq * se)];
    }
  }
  if (d.loa === 'regression') {
    // Bland & Altman 1999: the bias as a line of X, the spread from the absolute residuals
    const res = e.map((v, i) => Math.abs(v - (reg.b0 + reg.b1 * x[i])));
    const r2 = lsq(x, res);
    out.reg = { b0: reg.b0, b1: reg.b1, c0: r2.b0, c1: r2.b1 };
    const k = z * Math.sqrt(Math.PI / 2);
    out.within = share((i) => reg.b0 + reg.b1 * x[i] - k * (r2.b0 + r2.b1 * x[i]), (i) => reg.b0 + reg.b1 * x[i] + k * (r2.b0 + r2.b1 * x[i]));
  }
  return out;
}

export type BAGroup = { name: string; a: number[]; b: number[] };
export type BAResult = { curves: Curve[]; stats: Dataset; points: Dataset; rows: BAStats[]; xName: string; yName: string; logY: boolean; warnings: string[] };

export function blandAltman(groups: BAGroup[], d: BASpec, aName: string, bName: string): BAResult | string {
  const warnings: string[] = [];
  const ratio = d.y === 'ratio';
  const needPos = ratio || d.x === 'gmean';
  // every pair: its X and Y, its difference on the scale of the limits (ratio: the log)
  const pts = groups.map((g) => {
    const out = { name: g.name, x: [] as number[], y: [] as number[], e: [] as number[], a: [] as number[], b: [] as number[] };
    let dropped = 0;
    g.a.forEach((av, i) => {
      const bv = g.b[i];
      if (!Number.isFinite(av) || !Number.isFinite(bv)) return;
      if (needPos && !(av > 0 && bv > 0)) return void dropped++;
      const mean = (av + bv) / 2;
      const x = d.x === 'a' ? av : d.x === 'b' ? bv : d.x === 'gmean' ? Math.sqrt(av * bv) : mean;
      if (d.y === 'pct' && mean === 0) return void dropped++;
      const y = d.y === 'diff' ? av - bv : d.y === 'pct' ? (100 * (av - bv)) / mean : av / bv;
      out.x.push(x);
      out.y.push(y);
      out.e.push(ratio ? Math.log(y) : y);
      out.a.push(av);
      out.b.push(bv);
    });
    if (dropped) warnings.push(`${g.name}: ${dropped} pair(s) left out (${needPos ? 'a ratio or a geometric mean needs positive values' : 'a mean of 0'}).`);
    return out;
  });
  const all = { x: pts.flatMap((p) => p.x), e: pts.flatMap((p) => p.e) };
  if (all.x.length < 3) return 'Fewer than 3 pairs: choose the two methods (columns A and B).';
  const rows = [baStats('all', all.x, all.e, d, warnings)];
  if (groups.length > 1) for (const p of pts) if (p.x.length >= 3) rows.push(baStats(p.name, p.x, p.e, d, warnings));
  const S = rows[0];
  // the titles: the names without their unit, the unit once when both have the same (“A − B (mmHg)”)
  const unit = unitOf(aName) && unitOf(aName) === unitOf(bName) ? unitOf(aName) : '';
  const [an, bn] = unit ? [bareName(aName), bareName(bName)] : [aName, bName];
  const u = unit ? ` (${unit})` : '';
  const xName = d.x === 'a' ? aName : d.x === 'b' ? bName : d.x === 'gmean' ? `Geometric mean of ${an} and ${bn}${u}` : `Mean of ${an} and ${bn}${u}`;
  const yName = d.y === 'diff' ? `${an} − ${bn}${u}` : d.y === 'pct' ? `(${bareName(aName)} − ${bareName(bName)}) / mean (%)` : `${bareName(aName)} / ${bareName(bName)}`;
  const series = (xs: number[], ys: number[], name = yName) => ({ name, x: column(xName, Float64Array.from(xs)), y: column(name, Float64Array.from(ys)) });
  const curves: Curve[] = [];
  const one = groups.length === 1;
  // the points of every group
  pts.forEach((p, j) => {
    const L = d.looks?.[j];
    const color = d.colors?.[j] || PALETTE[(j + 1) % PALETTE.length];
    curves.push({ key: `ba:${j}`, label: p.name, ...(one ? { noLegend: true } : {}), series: series(p.x, p.y), style: curveStyle({ mode: 'scatter', color, symbol: L?.symbol ?? d.symbol, symbolSize: L?.symbolSize ?? d.symbolSize, symbolFill: L?.symbolFill ?? d.symbolFill, symbolEdge: 0.75, ...(L?.points === false ? { show: false } : {}) }) });
  });
  // the lines: across the points' X, a value written at their right end
  const [x0, x1] = [minOf(all.x), maxOf(all.x)];
  const z = normInv(1 - (1 - Math.min(99.9, Math.max(50, d.level || 95)) / 100) / 2);
  const zs = fmtNum(z, 3);
  // the values on the lines with one number of decimals (4 significant digits of the largest)
  const big = Math.max(...[S.bias, S.upper, S.lower].map(Math.abs).filter(Number.isFinite), 1e-12);
  const dec = Math.min(6, Math.max(0, 3 - Math.floor(Math.log10(big))));
  const fmt = (v: number) => v.toFixed(dec).replace('-', '−');
  const lineOf = (k: number) => {
    const L = d.lineLooks?.[k]?.line;
    return { show: L?.show !== false, color: d.lineColors?.[k] || BA_LINE_COLORS[k], width: L?.width ?? d.lineWidth, dash: L?.dash ?? BA_LINE_DASH[k] };
  };
  // a line; its text (the name over the value) written at its right end, outside the frame
  const addLine = (k: number, xs: number[], ys: number[], label: string, text: string) => {
    const l = lineOf(k);
    if (!l.show) return;
    const end = d.labels && !!text;
    curves.push({ key: `ba:line:${k}`, label: end ? text : label, noLegend: true, series: series(xs, ys, label), style: curveStyle({ mode: 'line', color: l.color, lineWidth: l.width, dash: l.dash, ...(end ? { endLabel: true } : {}) }) });
  };
  // a confidence band: a horizontal strip between two values, in the colour of its line
  const addBand = (k: number, [lo, hi]: [number, number]) => {
    const l = lineOf(k);
    if (!l.show || !Number.isFinite(lo) || !Number.isFinite(hi) || !(d.ciOpacity > 0)) return;
    curves.push({ key: `ba:ci:${k}`, label: `${BA_LINES[k]} CI`, noLegend: true, series: series([x0, x1], [hi, hi], `${BA_LINES[k]} CI`), style: curveStyle({ mode: 'line', color: l.color, lineWidth: 0, lineOpacity: 0, fill: 'points', fillPoints: `${x0}, ${lo}; ${x1}, ${lo}`, fillColor: l.color, fillOpacity: d.ciOpacity }) });
  };
  if (d.zeroLine) addLine(4, [x0, x1], ratio ? [1, 1] : [0, 0], 'equality', '');
  if (d.loa === 'regression' && S.reg) {
    // the limits as lines of X (ratio: curves, back from the logs)
    const { b0, b1, c0, c1 } = S.reg;
    const xs = Array.from({ length: ratio ? 60 : 2 }, (_, i) => x0 + ((x1 - x0) * i) / (ratio ? 59 : 1));
    const k = z * Math.sqrt(Math.PI / 2);
    const back = (v: number) => (ratio ? Math.exp(v) : v);
    addLine(0, xs, xs.map((x) => back(b0 + b1 * x)), 'bias', 'Mean');
    addLine(1, xs, xs.map((x) => back(b0 + b1 * x + k * (c0 + c1 * x))), 'upper limit', `+${zs} SD`);
    addLine(2, xs, xs.map((x) => back(b0 + b1 * x - k * (c0 + c1 * x))), 'lower limit', `−${zs} SD`);
    if ((c0 + c1 * x0) * (c0 + c1 * x1) < 0) warnings.push('The regression of the absolute residuals goes below 0 within the data: its limits cross there.');
  } else {
    const np = d.loa === 'nonparametric';
    const q = (100 - Math.min(99.9, Math.max(50, d.level || 95))) / 2;
    addBand(0, S.biasCI);
    addBand(1, S.upperCI);
    addBand(2, S.lowerCI);
    addLine(0, [x0, x1], [S.bias, S.bias], 'bias', `${np ? 'Median' : 'Mean'}\\\\${fmt(S.bias)}`);
    addLine(1, [x0, x1], [S.upper, S.upper], 'upper limit', `${np ? `${fmtNum(100 - q, 3)}th pct` : `+${zs} SD`}\\\\${fmt(S.upper)}`);
    addLine(2, [x0, x1], [S.lower, S.lower], 'lower limit', `${np ? `${fmtNum(q, 3)}th pct` : `−${zs} SD`}\\\\${fmt(S.lower)}`);
  }
  if (d.regLine) {
    const back = (v: number) => (ratio ? Math.exp(v) : v);
    const xs = Array.from({ length: ratio ? 60 : 2 }, (_, i) => x0 + ((x1 - x0) * i) / (ratio ? 59 : 1));
    addLine(3, xs, xs.map((x) => back(S.intercept + S.slope * x)), 'regression', '');
  }
  // the tables
  const num = (name: string, f: (r: BAStats) => number): Column => ({ ...column(name, Float64Array.from(rows, f)), role: 'none' });
  const label = (name: string, t: string[]): Column => ({ ...column(name, Float64Array.from(t, () => NaN), t), role: 'label' });
  const stats: Dataset = {
    name: 'bland-altman',
    columns: [
      label('group', rows.map((r) => r.group)),
      num('N', (r) => r.n),
      num(d.loa === 'nonparametric' ? 'median' : 'bias', (r) => r.bias),
      num(ratio ? 'SD (of ln)' : 'SD', (r) => r.sd),
      ...(d.ci !== 'none' && d.loa !== 'nonparametric' ? [num('bias CI low', (r) => r.biasCI[0]), num('bias CI high', (r) => r.biasCI[1])] : []),
      num('lower limit', (r) => r.lower),
      ...(d.ci !== 'none' && d.loa === 'parametric' ? [num('lower CI low', (r) => r.lowerCI[0]), num('lower CI high', (r) => r.lowerCI[1])] : []),
      num('upper limit', (r) => r.upper),
      ...(d.ci !== 'none' && d.loa === 'parametric' ? [num('upper CI low', (r) => r.upperCI[0]), num('upper CI high', (r) => r.upperCI[1])] : []),
      num('slope (vs X)', (r) => r.slope),
      num('intercept', (r) => r.intercept),
      num('r', (r) => r.r),
      num('p (slope)', (r) => r.pSlope),
      num('within limits (%)', (r) => r.within),
      ...(d.loa === 'regression' ? [num('b0', (r) => r.reg?.b0 ?? NaN), num('b1', (r) => r.reg?.b1 ?? NaN), num('c0 (|residual|)', (r) => r.reg?.c0 ?? NaN), num('c1 (|residual|)', (r) => r.reg?.c1 ?? NaN)] : []),
    ],
  };
  const flat = (f: (p: (typeof pts)[number]) => number[]) => Float64Array.from(pts.flatMap(f));
  const points: Dataset = {
    name: 'bland-altman points',
    columns: [
      label('group', pts.flatMap((p) => p.x.map(() => p.name))),
      { ...column(aName, flat((p) => p.a)), role: 'none' },
      { ...column(bName, flat((p) => p.b)), role: 'none' },
      { ...column(xName, flat((p) => p.x)), role: 'x' },
      { ...column(yName, flat((p) => p.y)), role: 'y' },
    ],
  };
  // a regression-based bias line in the ratio form is not on the stats' scale: the stats say what it is
  if (d.loa === 'regression' && d.ci !== 'none') warnings.push('Regression-based limits: no confidence intervals are drawn.');
  return { curves, stats, points, rows, xName, yName, logY: ratio, warnings: [...new Set(warnings)] };
}
