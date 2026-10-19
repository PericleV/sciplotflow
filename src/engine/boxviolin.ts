// Box & violin (boxes, violins, half violins, rainclouds). The groups: the columns
// of a table, or raw values by group (and subgroup: the series). A box: the quartiles (linear interpolation), the median, the
// whiskers — the furthest values within k·IQR of the box (Tukey), percentiles 5–95 or 10–90, min – max, or mean ± SD —,
// the notch (median ± 1.57·IQR/√n), the mean, the values beyond the whiskers; a violin: the Gaussian kernel density
// (Scott, Silverman, a width) from the smallest to the largest value or past them, its width scaled alike for all, by its
// own largest density, or by the number of values. Pure: the statistics of the boxes and the
// Gaussian kernel densities of the violins.
import { kde, kdeWidth } from './histogram.ts';
import { percentile } from './stats.ts';
import type { SigElement, SigSpec } from './signif.ts';
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import { curveStyle, PALETTE, withLook, type BarLook, type BoxItem, type Curve, type ElementLook } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type Whisker = 'iqr' | 'p5' | 'p10' | 'minmax' | 'sd';
export type BoxSpec = {
  mode: 'table' | 'raw';
  ys: string; // table: the columns, each a group ('' = the designated Y)
  value: string; // raw
  group: string;
  sub: string;
  kind: 'box' | 'violin' | 'both' | 'half' | 'raincloud';
  whisker: Whisker;
  k: number; // the whiskers of 'iqr': k·IQR (1.5)
  notch: boolean;
  mean: boolean;
  outliers: boolean;
  inner: 'box' | 'quartiles' | 'none'; // inside a violin
  bandwidth: 'scott' | 'silverman' | 'value';
  bw: number;
  cut: 'data' | 'extend'; // the violin from the smallest to the largest value, or two bandwidths past them
  scale: 'width' | 'area' | 'count';
  split: boolean; // two subgroups: a half violin each, side by side
  points: 'none' | 'jitter' | 'swarm';
  horizontal: boolean;
  width: number; // the part of a category its boxes take (0.8)
  gap: number;
  colorBy: 'series' | 'category';
  colors?: string[];
  colors2?: string[]; // a gradient each: to this colour at the base ('' = a plain colour)
  looks?: (ElementLook | null)[]; // a look of its own for any subgroup (or group): edge, opacity, hatching, median
  opacity: number;
  edgeColor: string;
  edgeWidth: number;
  barLook?: Partial<BarLook>;
  medianColor: string;
  medianWidth: number;
  sig?: Partial<SigSpec>; // significance brackets between the boxes
  showN?: boolean; // “n = …” written under every box (its number of values)
};

export type BoxStats = { n: number; mean: number; sd: number; min: number; max: number; q1: number; med: number; q3: number; wlo: number; whi: number; cilo: number; cihi: number; outliers: number[] };
export function boxStats(values: number[], whisker: Whisker, k = 1.5): BoxStats {
  const x = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = x.length;
  const mean = n ? x.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  const [q1, med, q3] = [percentile(x, 0.25), percentile(x, 0.5), percentile(x, 0.75)];
  const iqr = q3 - q1;
  let wlo: number;
  let whi: number;
  if (whisker === 'sd') [wlo, whi] = [mean - sd, mean + sd];
  else {
    // the furthest values within the limits (never inside the box)
    const [lo, hi] = whisker === 'iqr' ? [q1 - k * iqr, q3 + k * iqr] : whisker === 'minmax' ? [x[0], x[n - 1]] : whisker === 'p5' ? [percentile(x, 0.05), percentile(x, 0.95)] : [percentile(x, 0.1), percentile(x, 0.9)];
    const up = x.filter((v) => v <= hi);
    const down = x.filter((v) => v >= lo);
    whi = !up.length || up[up.length - 1] < q3 ? q3 : up[up.length - 1];
    wlo = !down.length || down[0] > q1 ? q1 : down[0];
  }
  const half = (1.57 * iqr) / Math.sqrt(n);
  return { n, mean, sd, min: x[0], max: x[n - 1], q1, med, q3, wlo, whi, cilo: med - half, cihi: med + half, outliers: x.filter((v) => v < wlo || v > whi) };
}
// the density of a violin at 100 points, from the smallest to the largest value, or two bandwidths past
export function violinStats(values: number[], bandwidth: BoxSpec['bandwidth'], bw: number, cut: BoxSpec['cut']) {
  const x = values.filter(Number.isFinite);
  const h = bandwidth === 'value' && bw > 0 ? bw : kdeWidth(x, bandwidth === 'silverman' ? 'silverman' : 'scott');
  const [lo, hi] = [minOf(x), maxOf(x)];
  const [a, b] = cut === 'extend' ? [lo - 2 * h, hi + 2 * h] : [lo, hi];
  const f = kde(x, h);
  const coords = Array.from({ length: 100 }, (_, i) => a + ((b - a) * i) / 99);
  return { h, coords, vals: coords.map(f) };
}

// elements: every box as a group the significance brackets compare (its place, the top of what is drawn, its values);
// span: the values' range drawn
export type BoxResult = { curves: Curve[]; table: Dataset; categoryTicks: string; catLo: number; catHi: number; elements: SigElement[]; span: [number, number]; warnings: string[] };

type Group = { cat: string; series: string; values: number[] };

export const keyOf = (c: Column, i: number) => (c.text?.[i]?.trim() ? c.text[i].trim() : Number.isFinite(c.values[i]) ? fmtNum(c.values[i], 10) : '');
// the groups: every column of a table, or the raw values by group and subgroup (in the order met)
export function boxGroups(d: BoxSpec, cols: Column[], value?: Column, group?: Column, sub?: Column): { cats: string[]; series: string[]; groups: Group[] } {
  if (d.mode === 'table') {
    const series = ['values'];
    return { cats: cols.map((c) => c.name), series, groups: cols.map((c) => ({ cat: c.name, series: series[0], values: Array.from(c.values).filter(Number.isFinite) })) };
  }
  const cats: string[] = [];
  const series: string[] = [];
  const cells = new Map<string, number[]>();
  for (let i = 0; i < (value?.values.length ?? 0); i++) {
    const v = value!.values[i];
    const g = group ? keyOf(group, i) : '';
    const s = sub ? keyOf(sub, i) : value!.name;
    if (!Number.isFinite(v) || !g || !s) continue;
    if (!cats.includes(g)) cats.push(g);
    if (!series.includes(s)) series.push(s);
    const k = `${g}\u0000${s}`;
    cells.set(k, [...(cells.get(k) ?? []), v]);
  }
  return { cats, series, groups: cats.flatMap((c) => series.map((s) => ({ cat: c, series: s, values: cells.get(`${c}\u0000${s}`) ?? [] }))) };
}

export function boxViolin(cats: string[], seriesNames: string[], groups: Group[], d: BoxSpec): BoxResult | string {
  const warnings: string[] = [];
  const k = seriesNames.length;
  if (!cats.length || !groups.some((g) => g.values.length)) return 'No values: choose the columns (or the values and their groups).';
  const split = d.split && k === 2 && d.kind !== 'box';
  if (d.split && !split) warnings.push('Split violins need two subgroups (and violins).');
  const W = Math.min(1, Math.max(0.1, d.width || 0.8));
  const slots = split ? 1 : k;
  const slot = W / slots;
  const g0 = Math.min(0.9, Math.max(0, d.gap || 0));
  const violin = d.kind !== 'box';
  // the violins' densities, then one scale for them all (area, count) or each by its own largest (width)
  const dens = groups.map((g) => (violin && g.values.length > 1 ? violinStats(g.values, d.bandwidth, d.bw, d.cut) : null));
  const top = maxOf(dens.map((v, i) => (v ? maxOf(v.vals) * (d.scale === 'count' ? groups[i].values.length : 1) : 0)));
  const which = (j: number, ci: number) => (d.colorBy === 'category' ? ci : j);
  const colorOf = (j: number, ci: number) => d.colors?.[which(j, ci)] || PALETTE[(which(j, ci) + 1) % PALETTE.length];
  const color2Of = (j: number, ci: number) => d.colors2?.[which(j, ci)] || '';
  const items: BoxItem[][] = seriesNames.map(() => []);
  const elements: SigElement[] = [];
  const stats: { g: Group; s: BoxStats; ci: number; j: number }[] = [];
  const lows: number[] = []; // the lowest point drawn of every box (for its n)
  const points: { j: number; across: number[]; along: number[] }[] = seriesNames.map((_, j) => ({ j, across: [], along: [] }));
  groups.forEach((g, gi) => {
    const ci = cats.indexOf(g.cat);
    const j = seriesNames.indexOf(g.series);
    if (!g.values.length) return;
    const s = boxStats(g.values, d.whisker, d.k || 1.5);
    stats.push({ g, s, ci, j });
    const pos = ci + 1 + (split ? 0 : (j - (slots - 1) / 2) * slot);
    const half = (slot * (1 - g0)) / 2;
    const v = dens[gi];
    const scaleBy = v ? (d.scale === 'width' ? maxOf(v.vals) : top / (d.scale === 'count' ? g.values.length : 1)) : 1;
    const side: BoxItem['side'] = split ? (j === 0 ? 'low' : 'high') : d.kind === 'half' || d.kind === 'raincloud' ? 'high' : 'both';
    // the box: full width alone, a third inside a violin, narrow in a raincloud
    const boxHalf = d.kind === 'box' ? half : d.kind === 'raincloud' ? half * 0.12 : half * 0.18;
    const showBox = d.kind === 'box' || d.kind === 'half' || d.kind === 'raincloud' || (violin && !split && d.inner === 'box') || d.kind === 'both';
    const it: BoxItem = {
      pos,
      half,
      side,
      fill: colorOf(j, ci),
      ...(color2Of(j, ci) ? { fill2: color2Of(j, ci) } : {}),
      ...(d.looks?.[which(j, ci)] ? { look: d.looks[which(j, ci)]! } : {}),
      vlo: Math.min(s.wlo, minOf((d.outliers ? s.outliers : [])), v ? v.coords[0] : Infinity),
      vhi: Math.max(s.whi, maxOf((d.outliers ? s.outliers : [])), v ? v.coords[99] : -Infinity),
      ...(showBox ? { box: { q1: s.q1, med: s.med, q3: s.q3, wlo: s.wlo, whi: s.whi, half: boxHalf, at: d.kind === 'half' ? pos - boxHalf * 1.2 : pos, ...(d.notch ? { notch: [s.cilo, s.cihi] as [number, number] } : {}) } } : {}),
      ...(d.mean ? { mean: s.mean } : {}),
      ...(d.outliers && (d.kind === 'box' || showBox) ? { outliers: s.outliers } : {}),
      ...(v ? { violin: { at: v.coords, w: v.vals.map((y) => (y / scaleBy) * half) } } : {}),
      ...(violin && (d.inner === 'quartiles' || split) ? { quartiles: [s.q1, s.med, s.q3] as [number, number, number] } : {}),
    };
    items[j].push(it);
    lows.push(Math.min(it.vlo, d.points !== 'none' ? minOf(g.values) : Infinity));
    elements.push({ name: k > 1 ? `${g.cat} / ${g.series}` : g.cat, cat: g.cat, series: g.series, pos, top: Math.max(it.vhi, d.points !== 'none' ? maxOf(g.values) : -Infinity), values: g.values });
    // the values themselves: spread across (jitter), or set side by side where they crowd (a simple swarm)
    if (d.points !== 'none') {
      const vals = [...g.values].sort((a, b) => a - b);
      const width = d.kind === 'raincloud' ? half * 0.5 : half * 0.6;
      const centre = d.kind === 'raincloud' ? pos - half * 0.45 : d.kind === 'half' ? pos - boxHalf * 1.2 : pos;
      if (d.points === 'jitter')
        vals.forEach((y, q) => {
          points[j].across.push(centre + ((((q + 1) * 0.6180339887) % 1) - 0.5) * width);
          points[j].along.push(y);
        });
      else {
        // values closer than a bin of 2 % of the range stand side by side, centred
        const span = (vals[vals.length - 1] - vals[0]) || 1;
        const bins = new Map<number, number[]>();
        for (const y of vals) {
          const b = Math.round((y - vals[0]) / (span * 0.02));
          bins.set(b, [...(bins.get(b) ?? []), y]);
        }
        for (const ys of bins.values()) {
          const stepW = Math.min(width / Math.max(1, ys.length - 1), half * 0.12);
          ys.forEach((y, q) => {
            points[j].across.push(centre + (q - (ys.length - 1) / 2) * stepW);
            points[j].along.push(y);
          });
        }
      }
    }
  });
  const curves: Curve[] = seriesNames.map((name, j) => {
    // a subgroup's own look (coloured by subgroup): its style, hatching and median, also in the legend
    const L = d.colorBy === 'category' ? null : d.looks?.[j];
    const own = withLook(curveStyle({ color: colorOf(j, 0), lineWidth: d.edgeWidth, fillColor: colorOf(j, 0), fillOpacity: d.opacity, edgeColor: d.edgeColor }), d.barLook, L);
    return {
      key: `box:${j}`,
      label: d.mode === 'table' && k === 1 ? 'values' : name,
      series: { name, x: column('category', Float64Array.from(items[j], (it) => it.pos)), y: column(name, Float64Array.from(items[j], (it) => it.box?.med ?? NaN)) },
      style: own.style,
      boxes: { items: items[j], horizontal: d.horizontal, ...(own.look ? { look: own.look } : {}), median: { color: L?.median || d.medianColor, width: d.medianWidth } },
      ...(d.colorBy === 'category' || (d.mode === 'table' && k === 1) ? { noLegend: true } : {}),
    };
  });
  // coloured by category: the categories in the legend
  if (d.colorBy === 'category')
    cats.forEach((c, ci) => {
      const own = withLook(curveStyle({ color: colorOf(0, ci), lineWidth: d.edgeWidth, fillColor: colorOf(0, ci), fillOpacity: d.opacity, edgeColor: d.edgeColor }), d.barLook, d.looks?.[ci]);
      curves.push({ key: `cat:${ci}`, label: c, series: { name: c, x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) }, style: own.style, bars: { lo: new Float64Array(0), hi: new Float64Array(0), base: new Float64Array(0), look: 'bars', colors2: [color2Of(0, ci)], ...(own.look ? { style: own.look } : {}) } });
    });
  for (const p of points)
    if (p.across.length) {
      const [x, y] = d.horizontal ? [p.along, p.across] : [p.across, p.along];
      curves.push({ key: `pts:${p.j}`, label: `${seriesNames[p.j]} (values)`, noLegend: true, series: { name: 'values', x: column('x', Float64Array.from(x)), y: column('y', Float64Array.from(y)) }, style: curveStyle({ mode: 'scatter', color: '#333333', symbol: 'circle', symbolSize: 3, symbolFill: d.kind === 'raincloud' ? 'filled' : 'white', symbolEdge: 0.5, symbolOpacity: d.kind === 'raincloud' ? 0.7 : 1 }) });
    }
  const all = items.flat();
  // “n = …” under every box, a little below its lowest point (the axis makes room for it)
  if (d.showN && elements.length) {
    const span = maxOf(elements.map((e) => e.top)) - minOf(lows) || 1;
    const along = lows.map((v) => v - 0.07 * span);
    const across = elements.map((e) => e.pos);
    const [x, y] = d.horizontal ? [along, across] : [across, along];
    curves.push({ key: 'box:n', label: 'n', noLegend: true, series: { name: 'n', x: column('x', Float64Array.from(x)), y: column('y', Float64Array.from(y)) }, labelValues: column('n', Float64Array.from(stats, () => NaN), stats.map((r) => `n = ${r.s.n}`)), style: curveStyle({ mode: 'scatter', symbolSize: 0.01, symbolOpacity: 0, labels: 'column', labelPos: 'center', labelText: { size: 7 } }) });
  }
  const num = (name: string, f: (r: (typeof stats)[number]) => number): Column => ({ ...column(name, Float64Array.from(stats, f)), role: 'none' });
  const table: Dataset = {
    name: 'box statistics',
    columns: [
      { ...column('group', Float64Array.from(stats, () => NaN), stats.map((r) => r.g.cat)), role: 'label' },
      ...(d.mode === 'raw' && k > 1 ? [{ ...column('subgroup', Float64Array.from(stats, () => NaN), stats.map((r) => r.g.series)), role: 'label' as const }] : []),
      num('N', (r) => r.s.n),
      num('mean', (r) => r.s.mean),
      num('SD', (r) => r.s.sd),
      num('min', (r) => r.s.min),
      num('Q1', (r) => r.s.q1),
      num('median', (r) => r.s.med),
      num('Q3', (r) => r.s.q3),
      num('max', (r) => r.s.max),
      num('whisker low', (r) => r.s.wlo),
      num('whisker high', (r) => r.s.whi),
      num('notch low', (r) => r.s.cilo),
      num('notch high', (r) => r.s.cihi),
      num('outliers', (r) => r.s.outliers.length),
    ],
  };
  return {
    curves,
    table,
    categoryTicks: cats.map((c, i) => `${i + 1}=${c.replace(/[\n=]/g, ' ')}`).join('\n'),
    catLo: minOf(all.map((it) => it.pos - it.half)),
    catHi: maxOf(all.map((it) => it.pos + it.half)),
    elements,
    span: [minOf(all.map((it) => it.vlo)), maxOf(elements.map((e) => e.top))],
    warnings,
  };
}
