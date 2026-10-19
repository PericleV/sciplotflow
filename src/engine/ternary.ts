// Ternary: three parts of a whole —
// A, B, C — as a point in an equilateral triangle (A at the top, B at the bottom left, C at the bottom right); every row
// normalized to its sum (fractions or %). Points, lines, or both, a curve per group (a column of groups: its colours and
// own looks); the grid every step (0.1, 0.2 …), the values along the edges (A's on the left edge, B's on the bottom, C's
// on the right, counterclockwise), the names at the corners. Pure: the triangle is drawn by the renderer.
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { maxOf, minOf } from './minmax.ts';
import type { ColorMapName } from '../figure/spec.ts';
import { column } from './table.ts';
import { curveStyle, PALETTE, type Curve, type ElementLook, type SymbolFill, type SymbolShape, type TernarySeries } from '../figure/spec.ts';

export type TernarySpec = {
  a: string; // the three columns ('' = the first three columns of numbers)
  b: string;
  c: string;
  group: string; // a column of groups ('' = none)
  scale: 'fraction' | 'percent';
  mode: 'scatter' | 'line' | 'linesymbol';
  step: number; // the grid, as a fraction (0.1)
  gridColor: string;
  colors?: string[];
  looks?: (ElementLook | null)[];
  symbol: SymbolShape;
  symbolSize: number;
  symbolFill: SymbolFill;
  lineWidth: number;
  // the points coloured by the values of a column (a map over their range; a colour bar), not by group
  colorBy?: string;
  cmap?: ColorMapName;
  cmapReverse?: boolean;
};

// a row as fractions of its sum (NaN when it has no positive sum or a part is missing / negative)
export function normalize(a: number, b: number, c: number): [number, number, number] {
  const s = a + b + c;
  if (![a, b, c].every((v) => Number.isFinite(v) && v >= 0) || !(s > 0)) return [NaN, NaN, NaN];
  return [a / s, b / s, c / s];
}
// a point of the triangle (side 1, B at (0, 0), C at (1, 0), A at (1/2, √3/2))
export const ternaryXY = (a: number, _b: number, c: number): [number, number] => [c + a / 2, (a * Math.sqrt(3)) / 2];

export function ternaryChart(rows: { group: string; a: number; b: number; c: number; v?: number }[], d: TernarySpec, names: [string, string, string]): { curves: Curve[]; warnings: string[] } | string {
  const warnings: string[] = [];
  const groups = [...new Set(rows.map((r) => r.group))];
  // coloured by a column: the range of its values, a colour each point
  const byValue = rows.some((r) => r.v !== undefined);
  const vs = rows.map((r) => r.v ?? NaN).filter(Number.isFinite);
  const range: [number, number] = vs.length ? [minOf(vs), maxOf(vs)] : [0, 1];
  if (!(range[1] > range[0])) range[1] = range[0] + 1;
  const stops = stopsOf(d.cmap ?? 'viridis', []);
  const colorOfV = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? mapColor(stops, mapT(v, range[0], range[1], false, !!d.cmapReverse)) : '#bbbbbb');
  let bad = 0;
  const series: TernarySeries[] = groups.map((g, gi) => {
    const L = d.looks?.[gi];
    const own = rows.filter((r) => r.group === g);
    const pts = own.map((r) => normalize(r.a, r.b, r.c));
    bad += pts.filter((p) => Number.isNaN(p[0])).length;
    return {
      name: g,
      a: pts.map((p) => p[0]),
      b: pts.map((p) => p[1]),
      c: pts.map((p) => p[2]),
      color: d.colors?.[gi] || PALETTE[(gi + 1) % PALETTE.length],
      mode: d.mode,
      lineWidth: L?.line?.width ?? d.lineWidth,
      dash: L?.line?.dash ?? 'solid',
      showLine: L?.line?.show !== false,
      symbol: L?.symbol ?? d.symbol,
      symbolSize: L?.symbolSize ?? d.symbolSize,
      symbolFill: L?.symbolFill ?? d.symbolFill,
      showPoints: L?.points !== false,
      ...(byValue ? { colors: own.map((r) => colorOfV(r.v)) } : {}),
    };
  });
  if (bad) warnings.push(`${bad} row(s) left out: a part missing or below 0, or a sum of 0.`);
  if (!series.some((s) => s.a.some(Number.isFinite))) return 'No rows with three parts.';
  const empty = () => ({ name: '', x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) });
  const one = groups.length === 1;
  return {
    curves: [
      { key: 'ternary', label: 'ternary', noLegend: true, series: empty(), style: curveStyle({ color: d.gridColor || '#b0b0b0', ...(byValue ? { colorBy: 'column' as const, cmap: d.cmap ?? 'viridis', cmapReverse: !!d.cmapReverse } : {}) }), ...(byValue ? { colorRange: range } : {}), ternary: { series, step: Math.min(0.5, Math.max(0.01, d.step || 0.1)), percent: d.scale === 'percent', names } },
      ...series.map((s, j) => ({ key: `ter:${j}`, label: s.name, ...(one ? { noLegend: true } : {}), series: empty(), style: curveStyle({ mode: s.mode, color: s.color, lineWidth: s.lineWidth, dash: s.dash, symbol: s.symbol, symbolSize: s.symbolSize, symbolFill: s.symbolFill }) })),
    ],
    warnings,
  };
}
