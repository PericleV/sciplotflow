// The runs of a signal node with ranges (Baseline correction, Waveform measurements, Step detection, Event averaging,
// Wavelet, Fractional calculus …): every Y column with its X (the designated one on its left, unless X is chosen), its
// points (masked and missing left out) in the order of X, cut by the ranges drawn on the graph (common, or of every run)
// — and what their graph needs (the points of every run, which are used). Pure.
import { pick } from './extract.ts';
import { curvesByRole, findColumn, roleOf, rowIndex, type Column, type Dataset } from './table.ts';
import { maskOf } from './manip.ts';
import { regionRows, type Pt, type Region } from './calculus.ts';
import { maxOf } from './minmax.ts';

// the X, the Y columns (empty: the designated Y), the ranges (none: all X), common or of every run
export type RegionSpec = { x: string; ys: string; regions: Region[]; regionsBy?: 'all' | 'run'; runRegions?: Record<string, Region[]> };
export type Run = {
  label: string;
  X: Column;
  Y: Column;
  slot: number; // its place among the Y
  idx: number[]; // the rows used, in the order of X
  parts: { region: Region; rows: number[]; index: number }[]; // the rows of every range (index −1: all X)
};
// What the graph of a node with ranges shows: the points of every run (x, y, run, used), and of every run a line over
// the data (base), a curve below with its title (lower) and more lines and a band there, marks and segments on top
export type RegionView = {
  x: Float64Array;
  y: Float64Array;
  run: Int32Array;
  used: Uint8Array;
  labels: string[];
  xName: string;
  yNames: string[];
  base: ({ x: number[]; y: number[] } | null)[];
  baseName?: string;
  baseColor?: string;
  lower: ({ x: number[]; y: number[] } | null)[];
  lowerTitle: string;
  lowerMore?: { x: number[]; y: number[]; color: string }[][];
  lowerBand?: ({ x: number[]; lo: number[]; hi: number[] } | null)[];
  marks?: { x: number; y: number; color: string; down: boolean }[][];
  segments?: { x0: number; y0: number; x1: number; y1: number; color: string }[][];
  // the values to show under the graph of every run (a line of text each)
  notes?: string[][];
};

export type Runs = { runs: Run[]; X0: Column; n: number; available: Column[] };
export function regionRuns(ds: Dataset, d: RegionSpec): Runs | { error: string } | { waiting: string } {
  const cols = ds.columns;
  let Ys: Column[];
  if (d.ys.trim()) {
    const p = pick(d.ys, cols.map((c) => c.name), true, cols);
    if (p.missing.length) return { error: `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.` };
    Ys = p.found.map((j) => cols[j]);
  } else Ys = cols.filter((_, j) => roleOf(cols, j) === 'y');
  const roles = curvesByRole(cols).curves;
  if (d.x && d.x !== '-' && !findColumn(cols, d.x)) return { error: `No column “${d.x}” in the dataset.` };
  const xOf = (y: Column) => (d.x === '-' ? undefined : findColumn(cols, d.x || (roles.find((c) => findColumn(cols, c.y) === y)?.x ?? roles[0]?.x ?? '')));
  Ys = Ys.filter((y) => xOf(y) !== y && y.values.some(Number.isFinite));
  if (!Ys.length) return { waiting: 'Choose the Y columns (or designate them Y in the worksheet).' };
  const n = maxOf(Ys.map((c) => c.values.length));
  const regionsOf = (label: string) => (d.regionsBy === 'run' && d.runRegions?.[label]?.length ? d.runRegions[label] : d.regions);
  const runs: Run[] = Ys.map((Y, k) => {
    const X = xOf(Y) ?? rowIndex(Y.values.length);
    const mask = maskOf([X, Y], n);
    const valid: number[] = [];
    for (let i = 0; i < Y.values.length; i++) if (Number.isFinite(X.values[i]) && Number.isFinite(Y.values[i]) && !mask?.[i]) valid.push(i);
    const idx = [...valid].sort((a, b) => X.values[a] - X.values[b]);
    return { label: Y.name, X, Y, slot: k, idx, parts: regionRows(X.values, idx, regionsOf(Y.name)) };
  });
  return { runs, X0: runs[0].X, n, available: cols };
}
// the points of every run for the graph, and which of them are inside the ranges
export function runPoints(runs: Run[], n: number): Pick<RegionView, 'x' | 'y' | 'run' | 'used' | 'labels'> {
  const m = runs.length * n;
  const x = new Float64Array(m).fill(NaN);
  const y = new Float64Array(m).fill(NaN);
  const run = new Int32Array(m).fill(-1);
  const used = new Uint8Array(m);
  runs.forEach((r, k) => {
    for (const i of r.idx) {
      x[k * n + i] = r.X.values[i];
      y[k * n + i] = r.Y.values[i];
      run[k * n + i] = k;
    }
    for (const p of r.parts) for (const i of p.rows) used[k * n + i] = 1;
  });
  return { x, y, run, used, labels: runs.map((r) => r.label) };
}
// the baseline points of a run (common, or its own)
export const pointsOf = (d: { regionsBy?: 'all' | 'run'; basePoints?: Pt[]; runBasePoints?: Record<string, Pt[]> }, label: string) => (d.regionsBy === 'run' && d.runBasePoints?.[label]?.length ? d.runBasePoints[label] : (d.basePoints ?? []));
