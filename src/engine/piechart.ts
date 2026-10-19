// Pie and doughnut (and nested rings): every category a slice,
// its angle its share of the total; a value column per ring (the first outside). From a table (the categories and
// their value columns) or from raw values counted / summed / averaged by group (the Bar chart's tables). The start
// angle (90° = 12 o'clock) and the direction, the slices sorted, the small ones merged into “Other”, a hole (doughnut),
// rings apart; the labels — name, value, percent — inside or outside on leader lines (automatic: outside when the slice
// is small), the total or a text in the centre; every category its colour and its own look (opacity, edge, hatching,
// moved out). The angles from the start, counterclockwise. Pure.
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import type { BarTable } from './barchart.ts';
import { curveStyle, PALETTE, type Curve, type ElementLook, type TextStyle, type WedgeItem } from '../figure/spec.ts';

export type PieSpec = {
  mode: 'table' | 'raw';
  cat: string; // table: the categories ('' = the designated X, else the first column of text, else the row number)
  ys: string; // table: the value columns, a ring each ('' = the designated Y)
  value: string; // raw: the values ('' = count the rows)
  group: string; // raw: the categories
  stat: 'count' | 'sum' | 'mean';
  // what is drawn: a pie, a doughnut (a hole: hole, else half the radius), or nested rings (a ring per value column);
  // absent (older projects): rings for several value columns, else a doughnut when it has a hole, else a pie
  kind?: 'pie' | 'doughnut' | 'rings';
  hole: number; // 0 … 0.9 of the radius (0: a pie)
  size: number; // the radius, % of half the frame's smaller side
  at?: number; // the centre across the frame, % of its width (50: the middle; less leaves room for a legend at the right)
  start: number; // degrees, counterclockwise from 3 o'clock (90: 12 o'clock)
  clockwise: boolean;
  sort: 'none' | 'desc' | 'asc';
  other: number; // %: slices smaller than this merged into “Other” (0: none)
  ringGap: number; // between rings, % of the radius
  labels: 'none' | 'percent' | 'value' | 'name' | 'namePercent' | 'nameValue' | 'nameOutPercentIn';
  labelPos: 'auto' | 'inside' | 'outside';
  decimals: number; // NaN: automatic
  hideBelow: number; // %: smaller slices not labelled
  center: 'none' | 'total' | 'text';
  centerText: string;
  colors?: string[]; // the categories'
  looks?: (ElementLook | null)[];
  opacity: number;
  edgeColor: string;
  edgeWidth: number;
  labelStyle?: TextStyle;
};

export type PieKind = NonNullable<PieSpec['kind']>;
export type PieResult = { curves: Curve[]; table: Dataset; categories: string[]; warnings: string[]; kind: PieKind };
// the kind drawn: chosen, else as older projects drew it
export const pieKind = (d: Pick<PieSpec, 'kind' | 'hole'>, columns: number): PieKind => d.kind ?? (columns > 1 ? 'rings' : (d.hole || 0) > 0 ? 'doughnut' : 'pie');

const fmt = (v: number, dec: number) => (Number.isFinite(dec) ? v.toFixed(Math.max(0, Math.min(10, dec))) : fmtNum(v, 4));

// the slices of one ring: [from, to] in degrees (counterclockwise: the angle grows from the start)
export function pieAngles(values: number[], start: number, clockwise: boolean): [number, number][] {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  let acc = 0;
  return values.map((v) => {
    const t1 = start + (clockwise ? -1 : 1) * 360 * (acc / total);
    acc += v;
    const t2 = start + (clockwise ? -1 : 1) * 360 * (acc / total);
    return [Math.min(t1, t2), Math.max(t1, t2)];
  });
}

export function pieChart(t: BarTable, d: PieSpec): PieResult | string {
  const warnings: string[] = [];
  let cats = t.categories.map((c) => c.label);
  // the rings: a value per category, negative and missing ones as 0
  let rings = t.series.map((s) => ({ name: s.name, values: cats.map((_, i) => (Number.isFinite(s.values[i]) && s.values[i] > 0 ? s.values[i] : 0)) }));
  if (t.series.some((s) => s.values.some((v) => v < 0))) warnings.push('Negative values are left out of a pie.');
  if (!rings.length || !rings.some((r) => r.values.some((v) => v > 0))) return 'No values: choose the categories and their values.';
  // a pie or a doughnut: one value column; nested rings: a ring for each
  const kind = pieKind(d, rings.length);
  if (kind !== 'rings' && rings.length > 1) {
    warnings.push(`A ${kind} shows one value column, the first (“${rings[0].name}”): choose Nested rings to show them all.`);
    rings = rings.slice(0, 1);
  }
  if (kind === 'rings' && rings.length < 2) warnings.push('Nested rings: choose two value columns or more (Values: a ring each, the first outside).');
  // sorted by the first ring; small slices (of the first ring) merged into “Other”
  let order = cats.map((_, i) => i);
  if (d.sort !== 'none') order.sort((i, j) => (d.sort === 'desc' ? -1 : 1) * (rings[0].values[i] - rings[0].values[j]));
  const total0 = rings[0].values.reduce((s, v) => s + v, 0);
  if (d.other > 0) {
    const small = order.filter((i) => (100 * rings[0].values[i]) / total0 < d.other);
    if (small.length > 1) {
      order = order.filter((i) => !small.includes(i));
      cats = [...cats, 'Other'];
      rings = rings.map((r) => ({ ...r, values: [...r.values, small.reduce((s, i) => s + r.values[i], 0)] }));
      order.push(cats.length - 1);
    }
  }
  const colorOf = (i: number) => d.colors?.[i] || PALETTE[(i + 1) % PALETTE.length];
  const K = rings.length;
  const hole = kind === 'pie' ? 0 : Math.min(0.9, Math.max(0, d.hole > 0 ? d.hole : kind === 'doughnut' ? 0.5 : 0));
  const gap = K > 1 ? Math.min(0.2, Math.max(0, (d.ringGap || 0) / 100)) : 0;
  const width = (1 - hole - gap * (K - 1)) / K;
  const items: WedgeItem[] = [];
  const rows: { ring: string; cat: string; v: number; pct: number; a0: number; a1: number }[] = [];
  rings.forEach((ring, k) => {
    const vals = order.map((i) => ring.values[i]);
    const total = vals.reduce((s, v) => s + v, 0);
    const angles = pieAngles(vals, d.start, d.clockwise);
    const r1 = 1 - k * (width + gap);
    const r0 = r1 - width;
    order.forEach((i, q) => {
      const v = vals[q];
      if (!(v > 0)) return;
      const pct = (100 * v) / total;
      const [a0, a1] = angles[q];
      rows.push({ ring: ring.name, cat: cats[i], v, pct, a0, a1 });
      const L = d.looks?.[i] ?? undefined;
      const pctText = `${fmt(pct, Number.isFinite(d.decimals) ? d.decimals : 1)} %`;
      const text =
        d.labels === 'none' || pct < (d.hideBelow || 0)
          ? undefined
          : d.labels === 'percent' || d.labels === 'nameOutPercentIn'
            ? pctText
            : d.labels === 'value'
              ? fmt(v, d.decimals)
              : d.labels === 'name'
                ? cats[i]
                : d.labels === 'namePercent'
                  ? `${cats[i]} ${pctText}`
                  : `${cats[i]} ${fmt(v, d.decimals)}`;
      // outside: only the outer ring's labels can go out; automatic: when the slice is small or the label long. The name
      // out, the percent in: the percent always inside, the name outside
      const both = d.labels === 'nameOutPercentIn';
      const outside = k === 0 && !both && (d.labelPos === 'outside' || (d.labelPos === 'auto' && (a1 - a0 < 25 || (text?.length ?? 0) > 12)));
      const outer = both && k === 0 && d.labels !== 'none' ? cats[i] : undefined;
      items.push({ a0, a1, r0: Math.max(0, r0), r1, fill: colorOf(i), explode: Math.max(0, (L?.explode ?? 0) / 100), ...(L ? { look: L } : {}), ...(text ? { label: text, outside } : {}), ...(outer ? { outer } : {}) });
    });
  });
  // the total of the outer ring (the merged slices once)
  const totalAll = order.reduce((s, i) => s + rings[0].values[i], 0);
  const center = d.center === 'total' ? ['Total', fmt(totalAll, d.decimals)] : d.center === 'text' && d.centerText.trim() ? d.centerText.split('\n') : undefined;
  // (a pie chosen: its centre is not offered, so not said)
  if (d.center !== 'none' && hole === 0 && kind !== 'pie') warnings.push('A text in the centre needs a hole (a doughnut).');
  const empty = () => ({ name: '', x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) });
  const curves: Curve[] = [
    {
      key: 'pie',
      label: 'pie',
      noLegend: true,
      series: empty(),
      style: curveStyle({ color: '#000000', lineWidth: d.edgeWidth, edgeColor: d.edgeColor, fillOpacity: d.opacity }),
      wedges: { items, size: Math.min(1, Math.max(0.1, (d.size || 80) / 100)), at: Math.min(1, Math.max(0, (d.at ?? 50) / 100)), ...(center && hole > 0 ? { center } : {}), ...(d.labelStyle ? { labelStyle: d.labelStyle } : {}) },
    },
    // the categories in the legend, each with its colour and look
    ...order.map((i) => {
      const L = d.looks?.[i];
      return {
        key: `cat:${i}`,
        label: cats[i],
        series: empty(),
        style: curveStyle({ color: colorOf(i), lineWidth: L?.edgeWidth ?? d.edgeWidth, fillColor: colorOf(i), fillOpacity: L?.opacity ?? d.opacity, edgeColor: L?.edgeColor || d.edgeColor }),
        bars: { lo: new Float64Array(0), hi: new Float64Array(0), base: new Float64Array(0), look: 'bars' as const, ...(L?.hatch ? { style: { hatch: L.hatch, ...(L.hatchColor ? { hatchColor: L.hatchColor } : {}) } } : {}) },
      } satisfies Curve;
    }),
  ];
  const num = (name: string, f: (r: (typeof rows)[number]) => number): Column => ({ ...column(name, Float64Array.from(rows, f)), role: 'none' });
  const label = (name: string, tx: string[]): Column => ({ ...column(name, Float64Array.from(tx, () => NaN), tx), role: 'label' });
  const table: Dataset = {
    name: 'pie',
    columns: [...(K > 1 ? [label('ring', rows.map((r) => r.ring))] : []), label('category', rows.map((r) => r.cat)), num('value', (r) => r.v), num('percent', (r) => r.pct), num('from (°)', (r) => r.a0), num('to (°)', (r) => r.a1)],
  };
  return { curves, table, categories: cats, warnings, kind };
}
