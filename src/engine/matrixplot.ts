// A matrix drawn by the Contour / heatmap as it draws a grid (the same engine and options), with what belongs to
// a matrix — the axes by the column and row numbers (row 1 at the top, as a matrix is written, or at the bottom, as a
// map) or by its X and Y, square cells, the values written in the cells (black or white by the colour under them), the
// names of the rows and columns on the axes. Pure.
import type { ContourResult, ContourSpec, Grid } from './contour.ts';
import { hiddenBy } from './hide.ts';
import type { Matrix } from './matrix.ts';
import { column } from './table.ts';
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { AXIS_DEFAULTS, curveStyle, type AxesStyle, type AxisSpec, type Curve } from '../figure/spec.ts';

export type MatrixPlotSpec = {
  axesFrom: 'index' | 'coords'; // the column and row numbers, or the matrix's X and Y (the numbers when it has none)
  rowOne: 'top' | 'bottom';
  square: boolean; // a cell as wide as it is high (1 unit of Y = 1 unit of X)
  cellValues: boolean;
  cellDecimals: number; // NaN: 3 significant digits
  cellSize: number; // pt; NaN: the figure's text size × 0.85
  cellColor: string; // '' = black or white by the colour under the value
  names: boolean; // the matrix's row and column names on the axes (by the numbers)
};
export const MAX_CELL_LABELS = 2500;

// the matrix as a grid: X, Y increasing (z[j·nx + i] at xs[i], ys[j]), the names of the axes
export function matrixGrid(M: Matrix, d: MatrixPlotSpec): { g: Grid; names: { x: string; y: string; z: string }; order: { cols: number[]; rows: number[] } } | string {
  const [m, n] = [M.rows, M.cols];
  if (!m || !n) return 'The matrix is empty.';
  const index = (k: number) => Array.from({ length: k }, (_, i) => i + 1);
  const coords = d.axesFrom === 'coords';
  const xs0 = coords && M.xs?.length === n ? M.xs : index(n);
  const ys0 = coords && M.ys?.length === m ? M.ys : index(m);
  for (const [v, what] of [
    [xs0, 'X of the columns'],
    [ys0, 'Y of the rows'],
  ] as const)
    if (v.some((q) => !Number.isFinite(q)) || new Set(v).size !== v.length) return `The ${what}: every one a number, each a different one (else: Axes from ▸ the numbers).`;
  const cols = index(n).map((k) => k - 1).sort((a, b) => xs0[a] - xs0[b]);
  const rows = index(m).map((k) => k - 1).sort((a, b) => ys0[a] - ys0[b]);
  const z = new Float64Array(m * n);
  rows.forEach((r, j) => cols.forEach((c, i) => (z[j * n + i] = M.v[r * n + c])));
  return {
    g: { xs: cols.map((c) => xs0[c]), ys: rows.map((r) => ys0[r]), z },
    names: coords ? { x: M.xName || (M.xs ? 'X' : 'column'), y: M.yName || (M.ys ? 'Y' : 'row'), z: M.name || 'Z' } : { x: 'column', y: 'row', z: M.name || 'Z' },
    order: { cols, rows },
  };
}

// the luminance of a colour: white text over dark colours
const dark = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const v = parseInt(m[1], 16);
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255) < 0.3;
};
const fmtCellValue = (v: number, dec: number) => (Number.isFinite(dec) ? v.toFixed(Math.max(0, Math.min(8, Math.floor(dec)))) : String(+v.toPrecision(3))).replace('-', '−');

// the values written in the cells: one curve of labels in black, one in white (or one in the colour chosen)
export function cellCurves(g: Grid, r: ContourResult, d: MatrixPlotSpec & ContourSpec, names: { x: string; y: string }, warnings: string[]): Curve[] {
  if (!d.cellValues) return [];
  const [nx, ny] = [g.xs.length, g.ys.length];
  if (nx * ny > MAX_CELL_LABELS) {
    warnings.push(`The values in the cells: for ${MAX_CELL_LABELS.toLocaleString('en')} cells or fewer (this matrix has ${(nx * ny).toLocaleString('en')}).`);
    return [];
  }
  const hid = hiddenBy(d.hide);
  const [lo, hi] = r.range;
  const out = d.hide?.outside === 'hide';
  const stops = stopsOf(d.cmap, d.cmapColors);
  const filled = d.draw === 'filled' || d.draw === 'filledLines';
  const lv = r.levels;
  // the colour under a value: of the heatmap, or of its band between two levels
  const colorOf = (v: number) => {
    if (d.draw === 'lines') return '#ffffff';
    if (filled && lv.length) {
      let k = 0;
      while (k < lv.length && v >= lv[k]) k++;
      const a = k === 0 ? lo : lv[k - 1];
      const b = k === lv.length ? hi : lv[k];
      return mapColor(stops, mapT(d.log && a > 0 && b > 0 ? Math.sqrt(a * b) : (a + b) / 2, lo, hi, d.log, d.reverse));
    }
    return mapColor(stops, mapT(v, lo, hi, d.log, d.reverse));
  };
  const groups = new Map<string, { x: number[]; y: number[]; t: string[] }>();
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const v = g.z[j * nx + i];
      if (!Number.isFinite(v) || hid?.(v) || (out && (v < lo || v > hi))) continue;
      const color = d.cellColor || (dark(colorOf(v)) ? '#ffffff' : '#000000');
      if (!groups.has(color)) groups.set(color, { x: [], y: [], t: [] });
      const q = groups.get(color)!;
      q.x.push(g.xs[i]);
      q.y.push(g.ys[j]);
      q.t.push(fmtCellValue(v, d.cellDecimals));
    }
  return [...groups].map(([color, q], k) => ({
    key: `cells:${k}`,
    label: 'values',
    noLegend: true,
    series: { name: 'values', x: column(names.x, Float64Array.from(q.x)), y: column(names.y, Float64Array.from(q.y)) },
    style: curveStyle({ mode: 'line', color, lineWidth: 0, lineOpacity: 0, labels: 'column', labelPos: 'center', labelText: { color, ...(d.cellSize > 0 ? { size: d.cellSize } : {}) } }),
    labelValues: column('values', Float64Array.from(q.t, () => NaN), q.t),
  }));
}

// ticks at the numbers 1 … k (every one up to 15, every 2nd up to 30; more: automatic), with the names when asked
function indexTicks(k: number, names: string[] | undefined): string {
  const clean = (s: string) => s.replace(/[,=]/g, ' ').trim();
  if (names?.some((s) => s.trim()) && k <= 60) return Array.from({ length: k }, (_, i) => `${i + 1} = ${clean(names[i] ?? '') || i + 1}`).join(', ');
  if (k > 30) return '';
  const step = k <= 15 ? 1 : 2;
  return Array.from({ length: Math.ceil(k / step) }, (_, i) => String(1 + i * step)).join(', ');
}

// the axes of the figure: Y reversed for row 1 at the top (the Axes' “reversed” turns it over again), square cells,
// the numbers (and names) of the columns and rows as ticks — unless the Axes say otherwise
export function matrixAxes(a: Partial<AxesStyle> | undefined, d: MatrixPlotSpec, M: Matrix, order: { cols: number[]; rows: number[] }): Partial<AxesStyle> {
  const base = a ?? {};
  const x: AxisSpec = { ...AXIS_DEFAULTS, ...base.x };
  const y: AxisSpec = { ...AXIS_DEFAULTS, ...base.y };
  if (d.rowOne === 'top') y.reverse = !y.reverse;
  if (d.axesFrom === 'index') {
    const ticks = (s: AxisSpec, k: number, names: string[] | undefined) => {
      if (s.custom.trim() || (s.ticksBy && s.ticksBy !== 'auto')) return s;
      const t = indexTicks(k, d.names ? names : undefined);
      return t ? { ...s, custom: t, ticksBy: 'values' as const, minor: 0 } : s;
    };
    Object.assign(x, ticks(x, M.cols, M.colNames && order.cols.map((c) => M.colNames![c])));
    Object.assign(y, ticks(y, M.rows, M.rowNames && order.rows.map((r) => M.rowNames![r])));
  }
  return { ...base, x, y, ...(d.square && !(base.aspect && base.aspect > 0) ? { aspect: 1 } : {}) };
}
