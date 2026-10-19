// Scatter matrix: every pair of k columns, row i
// against column j. Off the diagonal: the points (coloured by group), a least-squares line, or the correlation written
// (Pearson / Spearman, with stars); on the diagonal: the histogram or the kernel density of the column (scaled into its
// row's range, so a row shares one Y), or its name. The panels' contents only: the evaluator makes a figure
// of each and puts them on a grid (the Merge's: X shared by column, Y by row, numbers on the outer panels). Pure.
import { binEdges, histCounts, kde, kdeWidth, type HistSpec } from './histogram.ts';
import * as H from './hypo.ts';
import { stars } from './signif.ts';
import { column, type Column, type Dataset } from './table.ts';
import { curveStyle, PALETTE, type Curve, type ElementLook, type SymbolShape } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type MatrixSpec = {
  cols: string; // the columns ('' = the designated Y, else every column of numbers)
  group: string; // a column of groups for the colours ('' = none)
  diag: 'hist' | 'kde' | 'name' | 'none';
  lower: 'scatter' | 'corr' | 'none';
  upper: 'scatter' | 'corr' | 'none';
  method: 'pearson' | 'spearman';
  fit: boolean; // a least-squares line in the scatter panels
  symbol: SymbolShape;
  symbolSize: number;
  opacity: number;
  colors?: string[];
  looks?: (ElementLook | null)[];
  gap: number; // pt between the panels
};

export type Cell = { i: number; j: number; curves: Curve[]; text?: string; textSize?: number };
export type MatrixResult = { cells: Cell[]; k: number; groups: string[]; corr: Dataset; warnings: string[] };

const finite = (v: number[]) => v.filter(Number.isFinite);
// the bins of a diagonal histogram: the automatic ones
const AUTO_BINS: HistSpec['bins'] = { mode: 'auto', count: 10, width: NaN, start: NaN, edges: '', from: NaN, to: NaN };

export function scatterMatrix(cols: Column[], groupOf: string[] | null, d: MatrixSpec): MatrixResult | string {
  const k = cols.length;
  if (k < 2) return 'Choose 2 columns or more.';
  if (k > 10) return `${k} columns: a scatter matrix of 10 at most.`;
  const warnings: string[] = [];
  const n = minOf(cols.map((c) => c.values.length));
  const groups = groupOf ? [...new Set(groupOf.slice(0, n).filter(Boolean))] : ['all'];
  const rowsOf = (g: string) => Array.from({ length: n }, (_, r) => r).filter((r) => !groupOf || groupOf[r] === g);
  const colorOf = (gi: number) => d.colors?.[gi] || PALETTE[(gi + 1) % PALETTE.length];
  // every column's range (the row's Y, the column's X)
  const range = cols.map((c) => {
    const v = finite(Array.from(c.values).slice(0, n));
    return [minOf(v), maxOf(v)] as [number, number];
  });
  const cells: Cell[] = [];
  // every group listed once in the legend: by its points in the first scatter panel
  const listed = new Set<number>();
  const corrRows: { a: string; b: string; r: number; p: number; n: number }[] = [];
  const pairOf = (i: number, j: number) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let r = 0; r < n; r++) {
      const [x, y] = [cols[j].values[r], cols[i].values[r]];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x);
        ys.push(y);
      }
    }
    return { xs, ys };
  };
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      const curves: Curve[] = [];
      const [xn, yn] = [cols[j].name, cols[i].name];
      const series = (x: number[], y: number[], name = yn) => ({ name, x: column(xn, Float64Array.from(x)), y: column(name, Float64Array.from(y)) });
      // an invisible corner pair: every panel of a row / column spans its variables' ranges (corr and name panels too)
      curves.push({ key: `span:${i}:${j}`, label: 'span', noLegend: true, series: series(range[j], range[i]), style: curveStyle({ mode: 'scatter', symbolSize: 0.01, symbolOpacity: 0, color: '#ffffff' }) });
      if (i === j) {
        const [lo, hi] = range[i];
        const vals = groups.map((g) => finite(rowsOf(g).map((r) => cols[i].values[r])));
        if (d.diag === 'hist') {
          const edges = binEdges(finite(Array.from(cols[i].values).slice(0, n)), AUTO_BINS);
          if (typeof edges !== 'string') {
            const counts = vals.map((v) => histCounts(v, edges));
            const top = Math.max(1, maxOf(counts.flat()));
            counts.forEach((cnt, gi) => {
              const L = d.looks?.[gi];
              const h = cnt.map((c) => lo + (0.9 * (hi - lo) * c) / top);
              curves.push({
                key: `hist:${i}:${gi}`,
                label: groups[gi],
                noLegend: true,
                series: series(edges.slice(0, -1).map((e, b) => (e + edges[b + 1]) / 2), h),
                style: curveStyle({ mode: 'line', color: colorOf(gi), lineWidth: 0.5, fillColor: colorOf(gi), fillOpacity: L?.opacity ?? (groups.length > 1 ? 0.45 : 0.7), edgeColor: '#ffffff' }),
                bars: { lo: Float64Array.from(edges.slice(0, -1)), hi: Float64Array.from(edges.slice(1)), base: Float64Array.from(cnt, () => lo), look: 'bars' },
              });
            });
          }
        } else if (d.diag === 'kde') {
          const xs = Array.from({ length: 101 }, (_, q) => range[i][0] + ((range[i][1] - range[i][0]) * q) / 100);
          const ys = vals.map((v) => (v.length > 1 ? xs.map(kde(v, kdeWidth(v, 'scott'))) : xs.map(() => NaN)));
          const top = Math.max(maxOf(ys.flat().filter(Number.isFinite)), 1e-300);
          ys.forEach((y, gi) =>
            curves.push({ key: `kde:${i}:${gi}`, label: groups[gi], noLegend: true, series: series(xs, y.map((v) => lo + (0.9 * (hi - lo) * v) / top)), style: curveStyle({ mode: 'line', color: colorOf(gi), lineWidth: 1.2, fill: 'formula', fillFormula: String(lo), fillColor: colorOf(gi), fillOpacity: 0.25 }) }),
          );
        }
        cells.push({ i, j, curves, ...(d.diag === 'name' ? { text: cols[i].name, textSize: 1.3 } : {}) });
        continue;
      }
      const kind = i > j ? d.lower : d.upper;
      if (kind === 'corr' || (i < j && d.upper === 'scatter') || (i > j && d.lower === 'scatter')) {
        // the correlation of the pair (all the points), once per pair in the table
        const { xs, ys } = pairOf(i, j);
        const c = xs.length > 2 ? (d.method === 'spearman' ? H.spearman(xs, ys) : H.pearson(xs, ys)) : { r: NaN, p: NaN, n: xs.length };
        if (i > j) corrRows.push({ a: yn, b: xn, r: c.r, p: c.p, n: xs.length });
        if (kind === 'corr') {
          cells.push({ i, j, curves, text: `${d.method === 'spearman' ? 'ρ' : 'r'} = ${Number.isFinite(c.r) ? c.r.toFixed(2).replace('-', '−') : '—'}${Number.isFinite(c.p) && c.p < 0.05 ? ` ${stars(c.p)}` : ''}`, textSize: 0.9 + 0.6 * (Number.isFinite(c.r) ? Math.abs(c.r) : 0) });
          continue;
        }
      }
      if (kind === 'none') {
        cells.push({ i, j, curves });
        continue;
      }
      groups.forEach((g, gi) => {
        const L = d.looks?.[gi];
        const rows = rowsOf(g).filter((r) => Number.isFinite(cols[j].values[r]) && Number.isFinite(cols[i].values[r]));
        curves.push({
          key: `pts:${i}:${j}:${gi}`,
          label: g,
          ...(groups.length === 1 || listed.has(gi) ? { noLegend: true } : (listed.add(gi), {})),
          series: series(rows.map((r) => cols[j].values[r]), rows.map((r) => cols[i].values[r]), g),
          style: curveStyle({ mode: 'scatter', color: colorOf(gi), symbol: L?.symbol ?? d.symbol, symbolSize: L?.symbolSize ?? d.symbolSize, symbolFill: L?.symbolFill ?? 'filled', symbolOpacity: d.opacity, symbolEdge: 0, ...(L?.points === false ? { show: false } : {}) }),
        });
      });
      if (d.fit) {
        const { xs, ys } = pairOf(i, j);
        if (xs.length > 2) {
          const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
          const my = ys.reduce((s, v) => s + v, 0) / ys.length;
          const b = xs.reduce((s, v, q) => s + (v - mx) * (ys[q] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
          const [x0, x1] = range[j];
          curves.push({ key: `fit:${i}:${j}`, label: 'least squares', noLegend: true, series: series([x0, x1], [my + b * (x0 - mx), my + b * (x1 - mx)]), style: curveStyle({ mode: 'line', color: '#000000', lineWidth: 0.8 }) });
        }
      }
      cells.push({ i, j, curves });
    }
  if (groupOf && groups.length > 12) warnings.push(`${groups.length} groups: colours repeat.`);
  const corr: Dataset = {
    name: 'correlations',
    columns: [
      { ...column('variable 1', Float64Array.from(corrRows, () => NaN), corrRows.map((c) => c.a)), role: 'label' },
      { ...column('variable 2', Float64Array.from(corrRows, () => NaN), corrRows.map((c) => c.b)), role: 'label' },
      { ...column(d.method === 'spearman' ? 'ρ' : 'r', Float64Array.from(corrRows, (c) => c.r)), role: 'none' },
      { ...column('p', Float64Array.from(corrRows, (c) => c.p)), role: 'none' },
      { ...column('N', Float64Array.from(corrRows, (c) => c.n)), role: 'none' },
    ],
  };
  return { cells, k, groups, corr, warnings };
}
