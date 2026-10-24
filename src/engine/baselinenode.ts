// Baseline correction: every Y column with the baseline under it taken off (subtracted, or divided by) — every baseline
// of Integrate, Peak analyzer and Peak width (src/engine/baselines.ts: a value, the line between the ends, the lowest
// point, the rubber band, points placed on the graph, another curve, the iterative polynomial, ALS, airPLS, arPLS, SNIP,
// Shirley, Tougaard), found in every range drawn on the graph (outside them the data as they are, or nothing), or a
// polynomial through the ranges drawn on the background (the parts with no peak), under all the data. Pure.
import { column, type Column, type Dataset } from './table.ts';
import { baselineOf, type BaseMethod, type BaseOptions } from './baselines.ts';
import { pointsCurve, type Pt } from './calculus.ts';
import { pointsOf, regionRuns, runPoints, type RegionSpec, type RegionView } from './regionruns.ts';

// method: a baseline of the list, or 'background' (a polynomial of bgOrder through the points of the ranges); the curve
// of 'curve': a column of the data (on the X of the run) or the curve on the “baseline” port; mode: subtracted or
// divided by; outside the ranges: the data as they are, or empty; original: the data kept beside the corrected curve
export type BaselineData = RegionSpec & {
  method: BaseMethod | 'background';
  base: number;
  baseOpt?: BaseOptions;
  baseInterp?: 'linear' | 'spline';
  basePoints?: Pt[];
  runBasePoints?: Record<string, Pt[]>;
  baseFrom?: 'column' | 'port';
  baseColumn?: string;
  bgOrder: number;
  mode: 'subtract' | 'divide';
  outside: 'keep' | 'empty';
  original: boolean;
};

// the value of a curve (X ascending) by straight lines, flat past its ends
function lineThrough(cx: number[], cy: number[]): (x: number) => number {
  return (v) => {
    const n = cx.length;
    if (!n) return NaN;
    if (v <= cx[0]) return cy[0];
    if (v >= cx[n - 1]) return cy[n - 1];
    let [lo, hi] = [0, n - 1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cx[m] <= v) lo = m;
      else hi = m;
    }
    return cy[lo] + ((v - cx[lo]) * (cy[hi] - cy[lo])) / (cx[hi] - cx[lo] || 1);
  };
}

export function baselineNode(ds: Dataset, d: BaselineData, port?: { x: ArrayLike<number>; y: ArrayLike<number> }): { out: Dataset; base: Dataset; view: RegionView; warnings: string[] } | { error: string } | { waiting: string } {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const m = d.method;
  if (m === 'points' && !(d.basePoints?.length || Object.keys(d.runBasePoints ?? {}).length)) warnings.push('Baseline: place its points on the graph (Baseline points).');
  if (m === 'background' && !runs.some((r) => r.parts.some((p) => p.index >= 0))) return { waiting: 'Draw on the graph the ranges of the background (where there is no peak): Add a range, then drag.' };
  // (another curve: a column of the data, or the curve on the port, X ascending)
  let curveOf: ((x: number) => number) | null = null;
  if (m === 'curve') {
    if (d.baseFrom === 'port') {
      if (!port) return { error: 'Baseline: connect a curve to the “baseline” port (a dataset with X and Y, or a column).' };
      const o = Array.from(port.x, (_, i) => i)
        .filter((i) => Number.isFinite(port.x[i]) && Number.isFinite(port.y[i]))
        .sort((a, b) => port.x[a] - port.x[b]);
      curveOf = lineThrough(
        o.map((i) => port.x[i]),
        o.map((i) => port.y[i]),
      );
    } else if (!ds.columns.find((c) => c.name === d.baseColumn)) return { error: d.baseColumn ? `Baseline: no column “${d.baseColumn}”.` : 'Baseline: choose its column.' };
  }
  const corrected = runs.map(() => new Float64Array(n).fill(NaN));
  const baseVals = runs.map(() => new Float64Array(n).fill(NaN));
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: [], lower: [], lowerTitle: d.mode === 'divide' ? 'Data / baseline' : 'Data − baseline' };
  runs.forEach((run, k) => {
    const xv = run.X.values;
    const yv = run.Y.values;
    const b = baseVals[k];
    if (m === 'background') {
      // (the points of all the ranges: a polynomial through them, under every point)
      const rows = run.parts.flatMap((p) => p.rows);
      const [a, z] = [xv[run.idx[0]], xv[run.idx[run.idx.length - 1]]];
      const t = (v: number) => (z > a ? (2 * (v - a)) / (z - a) - 1 : 0);
      const order = Math.max(0, Math.min(Math.round(d.bgOrder), rows.length - 1, 10));
      const ts = rows.map((i) => t(xv[i]));
      const ys = rows.map((i) => yv[i]);
      const coef = polyCoefs(ts, ys, order);
      if (!coef) warnings.push(`${run.label}: too few points in the background ranges for a polynomial of degree ${order}.`);
      for (const i of run.idx) b[i] = coef ? coef.reduceRight((s, c) => s * t(xv[i]) + c, 0) : NaN;
    } else {
      const curve = m === 'points' ? pointsCurve(pointsOf(d, run.label), d.baseInterp ?? 'linear') : m === 'curve' ? (curveOf ?? colCurve(ds.columns.find((c) => c.name === d.baseColumn)!, run.X, run.idx)) : null;
      for (const part of run.parts) {
        const rows = part.rows;
        if (!rows.length) continue;
        const bl = baselineOf(
          m,
          rows.map((i) => xv[i]),
          rows.map((i) => yv[i]),
          d.baseOpt,
          { value: d.base, curve },
        );
        rows.forEach((i, j) => (b[i] = bl[j]));
      }
    }
    const inside = new Uint8Array(n);
    for (const p of run.parts) for (const i of p.rows) inside[i] = 1;
    const c = corrected[k];
    for (const i of run.idx) {
      if (m !== 'background' && !inside[i]) c[i] = d.outside === 'keep' ? yv[i] : NaN;
      else c[i] = d.mode === 'divide' ? yv[i] / b[i] : yv[i] - b[i];
    }
    view.base.push({ x: run.idx.map((i) => xv[i]), y: run.idx.map((i) => b[i]) });
    view.lower.push({ x: run.idx.map((i) => xv[i]), y: run.idx.map((i) => c[i]) });
  });
  // the dataset: X, (the data,) every Y corrected; the baseline of every Y
  const name = (y: Column) => `${y.name} ${d.mode === 'divide' ? '/ baseline' : '− baseline'}`;
  const cols: Column[] = [];
  const baseCols: Column[] = [];
  runs.forEach((run, k) => {
    if (k === 0 || run.X !== runs[k - 1].X) {
      cols.push({ ...run.X, role: 'x' });
      baseCols.push({ ...run.X, role: 'x' });
    }
    if (d.original) cols.push({ ...run.Y, role: 'y' });
    cols.push({ ...column(name(run.Y), corrected[k]), role: 'y' });
    baseCols.push({ ...column(`baseline (${run.Y.name})`, baseVals[k]), role: 'y' });
  });
  return { out: { name: `${ds.name} corrected`, columns: cols }, base: { name: 'baseline', columns: baseCols }, view, warnings };
}
// a column of the data as a curve on the X of a run (its points in the order of X)
function colCurve(c: Column, X: Column, idx: number[]): (x: number) => number {
  const rows = idx.filter((i) => Number.isFinite(c.values[i]));
  return lineThrough(
    rows.map((i) => X.values[i]),
    rows.map((i) => c.values[i]),
  );
}
// the coefficients (from the constant) of the polynomial of degree k through the points (t, y), by least squares
function polyCoefs(t: number[], y: number[], k: number): number[] | null {
  if (t.length <= k) return null;
  const m = k + 1;
  const A = Array.from({ length: m }, () => new Float64Array(m));
  const B = new Float64Array(m);
  for (let i = 0; i < t.length; i++) {
    let p = 1;
    const pw = [1];
    for (let j = 1; j < 2 * m; j++) pw.push((p *= t[i]));
    for (let r = 0; r < m; r++) {
      B[r] += pw[r] * y[i];
      for (let c = 0; c < m; c++) A[r][c] += pw[r + c];
    }
  }
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (!(Math.abs(A[piv][col]) > 1e-300)) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [B[col], B[piv]] = [B[piv], B[col]];
    for (let r = col + 1; r < m; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < m; c++) A[r][c] -= f * A[col][c];
      B[r] -= f * B[col];
    }
  }
  const c = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = B[r];
    for (let j = r + 1; j < m; j++) s -= A[r][j] * c[j];
    c[r] = s / A[r][r];
  }
  return c;
}
