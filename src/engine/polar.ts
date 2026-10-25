// Polar and radar charts. Polar: θ and one r column or more, every one a curve — line (drawn along θ: a line
// between two points at the same r is an arc), symbols, filled to the centre, or bars (a wedge each, a wind rose); θ in
// degrees or radians, 0° at the right (east) or at the top (north), counterclockwise or clockwise, a sector of the
// circle (a half circle for a radiation pattern), any range of r (dB below 0 too). Radar: a spoke per category, a
// closed polygon per series (filled), the grid as polygons or circles. The grid: circles (or polygons) at nice values of
// r, spokes every so many degrees, their labels. Pure: the geometry is computed in the renderer from the frame.
import { niceStep } from '../figure/ticks.ts';
import { column } from './table.ts';
import { curveStyle, PALETTE, type Curve, type Dash, type ElementLook, type PolarAxes, type PolarSeries, type SymbolFill, type SymbolShape } from '../figure/spec.ts';
import type { BarTable } from './barchart.ts';
import { maxOf, minOf } from './minmax.ts';

export type PolarSpec = {
  kind: 'polar' | 'radar';
  theta: string; // polar: the angle column ('' = the designated X)
  rs: string; // polar: the r columns ('' = the designated Y)
  unit: 'deg' | 'rad';
  cat: string; // radar: the categories (spokes) ('' = the first column of text, else the row number)
  ys: string; // radar: the series ('' = the designated Y)
  mode: 'line' | 'scatter' | 'linesymbol' | 'bars';
  fill: boolean; // filled to the centre (radar: the polygon)
  close: boolean; // polar: the line closed (the last point back to the first)
  barWidth: number; // degrees (NaN: the step between the angles)
  zero: 'E' | 'N' | 'W' | 'S'; // where 0° is (paxes.zeroAngle: any angle)
  clockwise: boolean;
  from: number; // the sector shown, degrees (0 – 360 = all)
  to: number;
  rMin: number; // NaN: automatic (0, or the data's minimum when below 0)
  rMax: number;
  rTicks: number; // about this many circles
  thetaStep: number; // degrees between spokes
  thetaLabels: 'deg' | 'compass' | 'compass16' | 'rad' | 'custom' | 'none';
  rLabelAngle: number; // degrees: where the values of r are written
  gridShape: 'circle' | 'polygon'; // radar: the grid
  colors?: string[];
  looks?: (ElementLook | null)[];
  lineWidth: number;
  symbol: SymbolShape;
  symbolSize: number;
  symbolFill: SymbolFill;
  opacity: number; // of the fill
  gridColor: string;
  paxes?: PolarAxes; // the axes' own look (the Axes tab)
};

export type PolarResult = { curves: Curve[]; warnings: string[] };

const R2D = 180 / Math.PI;

// the circles of r: nice values from rMin to rMax
export function rTicksOf(lo: number, hi: number, count: number): number[] {
  const step = niceStep(hi - lo, Math.max(2, count));
  const out: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(+(k * step).toPrecision(12));
  return out.filter((v) => v > lo + 1e-12 * Math.abs(hi - lo));
}

// the circles of r every `step` from lo to hi (lo itself left out: the centre)
function stepTicks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(+(k * step).toPrecision(12));
  return out.filter((v) => v > lo + 1e-12 * Math.abs(hi - lo));
}

// a polar figure: the series (θ in degrees, r), the frame (the r range, the grid, the labels), drawn by the renderer
export function polarChart(series: { name: string; theta: number[]; r: number[] }[], d: PolarSpec, spokes?: string[]): PolarResult | string {
  const warnings: string[] = [];
  const all = series.flatMap((s) => s.r.filter(Number.isFinite));
  if (!all.length) return 'No values of r.';
  const dataMin = minOf(all);
  const dataMax = maxOf(all);
  let lo = Number.isFinite(d.rMin) ? d.rMin : dataMin < 0 ? dataMin : 0;
  let hi = Number.isFinite(d.rMax) ? d.rMax : dataMax;
  if (!Number.isFinite(d.rMax)) {
    // up to a nice value
    const step = niceStep(hi - lo, Math.max(2, d.rTicks || 5));
    hi = Math.ceil(hi / step - 1e-9) * step;
  }
  if (!Number.isFinite(d.rMin) && lo < 0) lo = Math.floor(lo / niceStep(hi - lo, Math.max(2, d.rTicks || 5)) + 1e-9) * niceStep(hi - lo, Math.max(2, d.rTicks || 5));
  if (!(hi > lo)) [lo, hi] = [lo - 1, lo + 1];
  if (all.some((v) => v < lo)) warnings.push(`Values of r below ${lo} are drawn at the centre.`);
  const items: PolarSeries[] = series.map((s, j) => {
    const L = d.looks?.[j];
    const color = d.colors?.[j] || PALETTE[(j + 1) % PALETTE.length];
    const mode = d.mode;
    return {
      name: s.name,
      theta: s.theta,
      r: s.r,
      color,
      mode,
      fill: d.fill,
      opacity: L?.opacity ?? d.opacity,
      close: d.kind === 'radar' || d.close,
      lineWidth: L?.line?.width ?? d.lineWidth,
      dash: (L?.line?.dash ?? 'solid') as Dash,
      showLine: L?.line?.show !== false,
      symbol: L?.symbol ?? d.symbol,
      symbolSize: L?.symbolSize ?? d.symbolSize,
      symbolFill: L?.symbolFill ?? d.symbolFill,
      showPoints: L?.points !== false,
      barWidth: Number.isFinite(d.barWidth) && d.barWidth > 0 ? d.barWidth : 0,
    };
  });
  const sector: [number, number] = d.kind === 'radar' ? [0, 360] : [Math.max(-360, Math.min(d.from, d.to)), Math.min(720, Math.max(d.from, d.to))];
  const empty = () => ({ name: '', x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) });
  const curves: Curve[] = [
    {
      key: 'polar',
      label: 'polar',
      noLegend: true,
      series: empty(),
      style: curveStyle({ color: d.gridColor || '#b0b0b0' }),
      polar: {
        series: items,
        lo,
        hi,
        rTicks: d.paxes?.rStep && d.paxes.rStep > 0 && (hi - lo) / d.paxes.rStep <= 200 ? stepTicks(lo, hi, d.paxes.rStep) : rTicksOf(lo, hi, d.rTicks || 5),
        // where 0° is: an angle of its own, else E, N, W, S (a radar: at the top)
        zeroDeg: d.kind === 'radar' ? 90 : Number.isFinite(d.paxes?.zeroAngle) ? d.paxes!.zeroAngle! : { E: 0, N: 90, W: 180, S: 270 }[d.zero] ?? 0,
        ...(d.paxes ? { ax: d.paxes } : {}),
        // a radar: the first spoke at the top, the others clockwise
        zero: d.kind === 'radar' ? 'N' : d.zero,
        clockwise: d.kind === 'radar' ? true : d.clockwise,
        sector,
        thetaStep: d.kind === 'radar' ? 360 / Math.max(1, spokes?.length ?? 1) : Math.max(1, d.thetaStep || 30),
        thetaLabels: d.thetaLabels,
        rLabelAngle: d.rLabelAngle,
        gridShape: d.kind === 'radar' ? d.gridShape : 'circle',
        ...(spokes ? { spokes } : {}),
      },
    },
    // the series in the legend, each in its look (one series alone: not listed)
    ...items.map((s, j) => ({
      key: `pol:${j}`,
      label: s.name,
      ...(items.length === 1 ? { noLegend: true } : {}),
      series: empty(),
      style: curveStyle({ mode: s.mode === 'bars' ? 'line' : s.mode === 'scatter' ? 'scatter' : s.mode === 'linesymbol' ? 'linesymbol' : 'line', color: s.color, lineWidth: s.lineWidth, dash: s.dash, symbol: s.symbol, symbolSize: s.symbolSize, symbolFill: s.symbolFill, ...(s.fill || s.mode === 'bars' ? { fill: 'zero' as const, fillColor: s.color, fillOpacity: s.mode === 'bars' ? Math.max(0.6, s.opacity) : s.opacity } : {}) }),
    })),
  ];
  return { curves, warnings };
}

// θ values: degrees from the column (radians converted)
export const toDegrees = (v: ArrayLike<number>, unit: PolarSpec['unit']) => Array.from(v, (x) => (unit === 'rad' ? x * R2D : x));

// radar: the categories as spokes (evenly around), a series per value column
export function radarSeries(t: BarTable): { spokes: string[]; series: { name: string; theta: number[]; r: number[] }[] } {
  const n = t.categories.length;
  return { spokes: t.categories.map((c) => c.label), series: t.series.map((s) => ({ name: s.name, theta: t.categories.map((_, i) => (360 * i) / n), r: s.values })) };
}
