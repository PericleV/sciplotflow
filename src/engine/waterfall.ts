// Waterfall (offset curves, ridgeline plots): the curves of a sweep — every Y column with its X — drawn one behind the other, each shifted by a step in X
// and Y (% of the data's range, or in its units); the curve in front hides those behind (filled with the page's colour
// down to its own baseline: hidden lines), or every curve filled in its colour (a ridgeline); coloured each its own or
// by the colour map of the swept value Z (from Split into columns, the numbers in the names, or the order), with a
// colour bar; Z written at every curve; every curve its own look (⚙). Pure: the curves are drawn by the renderer.
import { column, type Column, type Dataset } from './table.ts';
import { minOf, maxOf } from './minmax.ts';
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { curveStyle, PALETTE, type ColorMapName, type Curve, type Dash, type ElementLook, type SymbolFill, type SymbolShape } from '../figure/spec.ts';

export type WaterfallSpec = {
  x: string; // the X of every curve ('' = each Y's own designated X)
  ys: string; // the Y columns, a curve each ('' = the designated Y columns)
  z: 'auto' | 'key' | 'name' | 'order'; // the swept value of each curve: auto = the blocks' value, else a number in the names, else 1, 2 …
  zTitle: string; // its name ('' = the blocks', else “Z”)
  units: 'percent' | 'data'; // the steps: % of the data's range, or in its units
  dx: number;
  dy: number;
  // how the curves are spaced: even steps, in proportion to their Z, a list (offsetsX / offsetsY, a shift a curve in its
  // order), automatic (no curve touching those in front, dy the gap), or by height (dy % of the height of the curve in
  // front)
  spacing?: 'even' | 'z' | 'list' | 'auto' | 'height';
  offsetsX?: string;
  offsetsY?: string;
  normalize: 'none' | 'max'; // every curve divided by its largest |y| first
  front: 'first' | 'last'; // the curve in front (lowest)
  fill: 'hide' | 'color' | 'none'; // hidden lines (the page's colour), a fill in the curve's colour, or none
  fillColor: string; // 'hide': '' = the page's background; 'color': '' = the curve's
  fillOpacity: number; // 'color'
  colorMap: 'own' | ColorMapName; // each its own colour, or by Z on a colour map
  cmapColors?: string[]; // the custom map's colours
  reverse: boolean;
  colorbar: boolean;
  colors?: string[];
  looks?: (ElementLook | null)[];
  mode: 'line' | 'linesymbol';
  lineWidth: number;
  dash: Dash;
  symbol: SymbolShape;
  symbolSize: number;
  symbolFill: SymbolFill;
  baselines: boolean; // every curve's zero (its baseline) as a thin line
  baselineColor: string;
  labels: 'none' | 'right' | 'left' | 'rightIn' | 'leftIn'; // Z written after the end (before the start) of every curve, or above its end (start), in the frame
  labelText: string; // '{z}' is the value: “{z} nm”, “d = {z}” ('' = '{z}')
  labelDecimals: number; // NaN = as needed
  labelSize: number; // pt, NaN = the page's
  labelColor: string; // '' = the curve's
};

export type WaterfallRun = { name: string; z: number; x: ArrayLike<number>; y: ArrayLike<number> };
export type WaterfallResult = { curves: Curve[]; data: Dataset; colorRange: [number, number] | null; warnings: string[] };

const fmtZ = (v: number, dec: number) => (Number.isFinite(dec) ? v.toFixed(Math.max(0, Math.min(8, dec))) : String(+v.toPrecision(6))).replace('-', '−');

// Z of every curve: the blocks' value (all the curves have one), a number in every name, or the order
export function waterfallZ(cols: { name: string; key?: { name: string; value: number } }[], how: WaterfallSpec['z']): { z: number[]; title: string } {
  const keyed = cols.length > 0 && cols.every((c) => c.key && Number.isFinite(c.key.value)) && new Set(cols.map((c) => c.key!.name)).size === 1;
  const nums = cols.map((c) => {
    const m = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(c.name.replace(/\(.*?\)/g, ''));
    return m ? Number(m[0]) : NaN;
  });
  const named = cols.length > 0 && nums.every(Number.isFinite) && new Set(nums).size === nums.length;
  if ((how === 'auto' || how === 'key') && keyed) return { z: cols.map((c) => c.key!.value), title: cols[0].key!.name };
  if ((how === 'auto' || how === 'name') && named) return { z: nums, title: '' };
  return { z: cols.map((_, j) => j + 1), title: '' };
}

// a curve read at any X (linear between its points sorted by X; NaN outside them)
function reader(x: ArrayLike<number>, y: ArrayLike<number>) {
  const pts = Array.from(x, (u, i) => [u, y[i]] as [number, number]).filter(([u, w]) => Number.isFinite(u) && Number.isFinite(w));
  pts.sort((p, q) => p[0] - q[0]);
  return (t: number) => {
    if (!pts.length || t < pts[0][0] || t > pts[pts.length - 1][0]) return NaN;
    let [lo, hi] = [0, pts.length - 1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (pts[m][0] <= t) lo = m;
      else hi = m;
    }
    const [a, b] = [pts[lo], pts[hi]];
    return b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
  };
}

// The shift of every curve (data units). even: the step times its place from the front; z: the same total spread in
// proportion to the curves' Z (real thicknesses, temperatures …); list: written for every curve, in its order (the
// units chosen; past the list the last step goes on); auto: every curve raised just enough to clear all those in front
// of it, plus a gap (the Y step), X shifted by the X step; height: each curve above the one in front of it by a part
// (the Y step, %) of that curve's own height.
export function waterfallShifts(runs: WaterfallRun[], ys: Float64Array[], zs: number[], place: number[], d: WaterfallSpec, stepX: number, stepY: number, xRange: number, yRange: number, warnings: string[]): { offX: number[]; offY: number[] } {
  const N = runs.length;
  let offX = place.map((p) => p * stepX);
  let offY = place.map((p) => p * stepY);
  const f2b = runs.map((_, j) => j).sort((a, b) => place[a] - place[b]);
  const spacing = d.spacing ?? 'even';
  if (spacing === 'z') {
    const [z0, z1] = [zs[f2b[0]], zs[f2b[N - 1]]];
    if (N > 1 && zs.every(Number.isFinite) && z1 !== z0) {
      const t = zs.map((z) => (z - z0) / (z1 - z0));
      offX = t.map((q) => q * (N - 1) * stepX);
      offY = t.map((q) => q * (N - 1) * stepY);
    } else if (N > 1) warnings.push('Spacing by Z: the curves have no Z (or the front and back ones the same): even steps.');
  } else if (spacing === 'list') {
    const pct = d.units === 'percent';
    const list = (s: string | undefined, range: number, step: number) => {
      const v = (s ?? '')
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number)
        .map((q) => (pct ? (q / 100) * range : q));
      if (!v.length) return null;
      // past the list: the last step goes on (or the even step)
      const last = v.length > 1 ? v[v.length - 1] - v[v.length - 2] : step;
      return runs.map((_, j) => (j < v.length ? (Number.isFinite(v[j]) ? v[j] : 0) : v[v.length - 1] + (j - v.length + 1) * last));
    };
    offX = list(d.offsetsX, xRange, stepX) ?? offX;
    offY = list(d.offsetsY, yRange, stepY) ?? offY;
  } else if (spacing === 'auto') {
    const read = runs.map((r, j) => reader(Float64Array.from(r.x, (u) => u + offX[j]), ys[j]));
    offY = runs.map(() => 0);
    for (let k = 1; k < N; k++) {
      const j = f2b[k];
      let need = -Infinity;
      for (let q = 0; q < k; q++) {
        const i = f2b[q];
        // how far j must rise to be above i, at the points of both
        for (let p = 0; p < runs[i].x.length; p++) {
          const t = runs[i].x[p] + offX[i];
          const g = ys[i][p] + offY[i] - read[j](t);
          if (g > need) need = g;
        }
        for (let p = 0; p < runs[j].x.length; p++) {
          const t = runs[j].x[p] + offX[j];
          const g = read[i](t) + offY[i] - ys[j][p];
          if (g > need) need = g;
        }
      }
      const prev = offY[f2b[k - 1]];
      offY[j] = Number.isFinite(need) ? Math.max(prev, need + stepY) : prev;
    }
  } else if (spacing === 'height') {
    const part = (Number.isFinite(d.dy) ? d.dy : 0) / 100;
    offY = runs.map(() => 0);
    for (let k = 1; k < N; k++) {
      const i = f2b[k - 1];
      const fin = Array.from(ys[i]).filter(Number.isFinite);
      const h = fin.length ? maxOf(fin) - minOf(fin) : 0;
      offY[f2b[k]] = offY[i] + part * h;
    }
  }
  return { offX, offY };
}

export function waterfallChart(runs: WaterfallRun[], d: WaterfallSpec, names: { x: string; z: string }, page: string): WaterfallResult | string {
  const warnings: string[] = [];
  if (!runs.length) return 'No curves: choose the Y columns.';
  // every curve as it is drawn (normalized first when asked)
  const ys = runs.map((r) => {
    const y = Float64Array.from(r.y);
    if (d.normalize === 'max') {
      const m = maxOf(Array.from(y, Math.abs).filter(Number.isFinite));
      if (m > 0) for (let i = 0; i < y.length; i++) y[i] /= m;
    }
    return y;
  });
  const finY = ys.flatMap((y) => Array.from(y).filter(Number.isFinite));
  const finX = runs.flatMap((r) => Array.from(r.x).filter(Number.isFinite));
  if (!finY.length || !finX.length) return 'No points: the curves have no numbers.';
  const yRange = maxOf(finY) - minOf(finY) || 1;
  const xRange = maxOf(finX) - minOf(finX) || 1;
  const pct = d.units === 'percent';
  const stepX = pct ? ((Number.isFinite(d.dx) ? d.dx : 0) / 100) * xRange : Number.isFinite(d.dx) ? d.dx : 0;
  const stepY = pct ? ((Number.isFinite(d.dy) ? d.dy : 0) / 100) * yRange : Number.isFinite(d.dy) ? d.dy : 0;
  const N = runs.length;
  // the place of each curve from the front (0: in front, the lowest); drawn from the back
  const place = runs.map((_, j) => (d.front === 'first' ? j : N - 1 - j));
  const order = runs.map((_, j) => j).sort((a, b) => place[b] - place[a]);
  const zs = runs.map((r) => r.z);
  // the shift of every curve in X and Y
  const { offX, offY } = waterfallShifts(runs, ys, zs, place, d, stepX, stepY, xRange, yRange, warnings);
  // the colours: each its own, or by Z on the map
  const fz = zs.filter(Number.isFinite);
  let range: [number, number] | null = null;
  const mapped = d.colorMap !== 'own' && fz.length > 0;
  if (mapped) {
    range = [minOf(fz), maxOf(fz)];
    if (!(range[1] > range[0])) range = [range[0] - 0.5, range[0] + 0.5];
  }
  const stops = mapped ? stopsOf(d.colorMap as ColorMapName, d.cmapColors ?? []) : null;
  // a colour chosen for a curve wins over the map's
  const colorOf = (j: number) => d.colors?.[j] || (stops && range ? mapColor(stops, mapT(zs[j], range[0], range[1], false, d.reverse)) : PALETTE[(j + 1) % PALETTE.length]);
  const bg = d.fillColor || (page && page !== 'none' ? page : '#ffffff');
  const curves: Curve[] = [];
  const dataCols: Column[] = [];
  const zTitle = d.zTitle || names.z || 'Z';
  for (const j of order) {
    const r = runs[j];
    const L = d.looks?.[j];
    const ox = offX[j];
    const oy = offY[j];
    const x = Float64Array.from(r.x, (v) => v + ox);
    const y = Float64Array.from(ys[j], (v) => v + oy);
    const color = colorOf(j);
    const fill = d.fill === 'none' ? 'none' : 'formula';
    const style = curveStyle({
      mode: d.mode === 'linesymbol' && L?.points !== false ? 'linesymbol' : 'line',
      color,
      lineWidth: L?.line?.width ?? d.lineWidth,
      dash: L?.line?.dash ?? d.dash,
      ...(L?.line?.show === false ? { lineOpacity: 0 } : {}),
      symbol: L?.symbol ?? d.symbol,
      symbolSize: L?.symbolSize ?? d.symbolSize,
      symbolFill: L?.symbolFill ?? d.symbolFill,
      fill,
      fillFormula: String(oy),
      fillColor: d.fill === 'hide' ? bg : d.fillColor,
      fillOpacity: d.fill === 'hide' ? 1 : (L?.opacity ?? d.fillOpacity),
      fillOver: true,
    });
    const curve: Curve = { key: `wf:${j}`, label: r.name, series: { name: r.name, x: column(names.x, x), y: column(r.name, y) }, style };
    if (mapped && range) {
      curve.group = { base: 'wf:all', index: j, count: N, value: zs[j], name: zTitle, range, color: 'map' };
      curve.colorRange = range;
      curve.style = { ...curve.style, cmap: d.colorMap as ColorMapName, cmapColors: d.cmapColors ?? curve.style.cmapColors, cmapReverse: d.reverse };
    }
    // its baseline, under the curve (over the fill of the curves behind)
    if (d.baselines) {
      const [x0, x1] = [minOf(Array.from(x).filter(Number.isFinite)), maxOf(Array.from(x).filter(Number.isFinite))];
      curves.push({ key: `wf-base:${j}`, label: `${r.name} baseline`, noLegend: true, series: { name: 'baseline', x: column(names.x, Float64Array.from([x0, x1])), y: column('baseline', Float64Array.from([oy, oy])) }, style: curveStyle({ mode: 'line', color: d.baselineColor || '#9a9a9a', lineWidth: 0.5 }) });
    }
    curves.push(curve);
    // Z written at its end (or start), beside the curve's last (first) point
    if (d.labels !== 'none') {
      const pts = Array.from(x, (v, i) => [v, y[i]]).filter(([u, w]) => Number.isFinite(u) && Number.isFinite(w));
      const atEnd = d.labels === 'right' || d.labels === 'rightIn';
      const end = pts.reduce((m, q) => ((atEnd ? q[0] > m[0] : q[0] < m[0]) ? q : m), pts[0] ?? [NaN, oy]);
      const at = end[0];
      const text = (d.labelText || '{z}').replace(/\{z\}/g, Number.isFinite(zs[j]) ? fmtZ(zs[j], d.labelDecimals) : r.name).replace(/\{name\}/g, r.name);
      curves.push({
        key: `wf-label:${j}`,
        label: text,
        noLegend: true,
        series: { name: 'label', x: column(names.x, Float64Array.from([at])), y: column('label', Float64Array.from([end[1]])) },
        labelValues: column('label', Float64Array.from([NaN]), [text]),
        style: curveStyle({ mode: 'line', color, lineWidth: 0, labels: 'column', labelPos: d.labels === 'right' ? 'right' : d.labels === 'left' ? 'left' : d.labels === 'rightIn' ? 'aboveLeft' : 'aboveRight', labelText: { color: d.labelColor || color, ...(d.labelSize > 0 ? { size: d.labelSize } : {}) } }),
      });
    }
    dataCols.push({ ...column(`${names.x} · ${r.name}`, x), role: 'x' }, { ...column(r.name, y), role: 'y' });
  }
  return { curves, data: { name: 'waterfall', columns: dataCols }, colorRange: range, warnings };
}
