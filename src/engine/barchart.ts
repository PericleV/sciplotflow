// Bar chart (grouped, stacked, 100 % stacked, floating; vertical or horizontal; values written on the bars). The data: a table — categories (text or numbers; else the row number) and one or more value columns,
// each a series, with its ± errors —, or raw values with a group (and a subgroup) column: every bar a statistic of its
// values (mean, median, sum, count) with its error (SD, SE, 95 % CI, min – max, Q1 – Q3), the values drawn over it if
// asked. Bars grouped side by side, stacked (positives up, negatives down), 100 % stacked, overlapped, or floating
// (from the first column to the next ones); vertical or horizontal; their values written. Pure.
import { tInv } from './dist.ts';
import { percentile } from './stats.ts';
import type { SigElement, SigSpec } from './signif.ts';
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import { curveStyle, PALETTE, withLook, type BarLook, type Curve, type ElementLook, type TextStyle } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type BarStat = 'mean' | 'median' | 'sum' | 'count';
export type BarErr = 'none' | 'sd' | 'se' | 'ci95' | 'minmax' | 'q1q3';
export type BarSpec = {
  mode: 'table' | 'raw';
  cat: string; // table: the categories ('' = the designated X, else the row number)
  ys: string; // table: the value columns ('' = the designated Y)
  errs: string; // table: their ± errors, in the same order ('' = the designated ±Y)
  value: string; // raw: the values ('' = the first designated Y)
  group: string; // raw: the groups (categories)
  sub: string; // raw: the subgroups (series; '' = none)
  stat: BarStat;
  err: BarErr;
  points: boolean; // raw: every value drawn over its bar
  arrange: 'grouped' | 'stacked' | 'percent' | 'overlap' | 'floating' | 'waterfall';
  wfTotal?: boolean; // waterfall: a last bar with the total
  wfConnect?: boolean; // waterfall: lines from every bar's end to the next one's start
  horizontal: boolean;
  width: number; // the part of a category its bars take (0.8 by default)
  gap: number; // grouped: the part of a bar's slot left empty
  base: number; // the bars start here (grouped, overlapped)
  colorBy: 'series' | 'category';
  colors?: string[];
  colors2?: string[]; // a gradient each: to this colour at the base ('' = a plain colour)
  looks?: (ElementLook | null)[]; // a look of its own for any series (or category): edge, opacity, hatching, error bars
  opacity: number;
  edgeColor: string;
  edgeWidth: number;
  barLook?: Partial<BarLook>;
  errCap: number; // pt
  errWidth: number; // pt
  errDir: 'both' | 'plus';
  labels: 'none' | 'top' | 'inside' | 'center';
  decimals: number; // NaN = automatic
  hideBelow: number; // % of the category's total (stacked) or of the largest value: smaller ones not written
  labelStyle?: TextStyle;
  sig?: Partial<SigSpec>; // significance brackets between the bars
  overlayRight?: boolean; // the curves of the overlay port on a second axis (right; top for horizontal bars)
  sort?: 'none' | 'desc' | 'asc'; // the categories by their value (stacked: their total), largest or smallest first
};

export type BarTable = { name: string; categories: { pos: number; label: string }[]; series: { name: string; values: number[]; plus: number[]; minus: number[]; n?: number[]; raw?: number[][] }[]; textCats: boolean };

// the categories in the order of their value — the first series', or the total of all when stacked — largest first
// (desc) or smallest first (asc); placed again at 1, 2, 3 … (categories of text only: numbers keep their places)
export function sortTable(t: BarTable, how: 'desc' | 'asc', total: boolean): BarTable {
  if (!t.textCats || t.categories.length < 2) return t;
  const key = (i: number) => (total ? t.series.reduce((s, q) => s + (Number.isFinite(q.values[i]) ? q.values[i] : 0), 0) : t.series[0]?.values[i] ?? NaN);
  const order = t.categories.map((_, i) => i).sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    if (!Number.isFinite(ka)) return 1;
    if (!Number.isFinite(kb)) return -1;
    return how === 'desc' ? kb - ka : ka - kb;
  });
  const pick = <T,>(a: T[] | undefined) => (a ? order.map((i) => a[i]) : undefined);
  return {
    ...t,
    categories: order.map((i, k) => ({ pos: k + 1, label: t.categories[i].label })),
    series: t.series.map((q) => ({ ...q, values: pick(q.values)!, plus: pick(q.plus)!, minus: pick(q.minus)!, ...(q.n ? { n: pick(q.n) } : {}), ...(q.raw ? { raw: pick(q.raw) } : {}) })),
  };
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => (v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean(v)) ** 2, 0) / (v.length - 1)) : NaN);
const keyOf = (c: Column, i: number) => (c.text?.[i]?.trim() ? c.text[i].trim() : Number.isFinite(c.values[i]) ? fmtNum(c.values[i], 10) : '');

// a statistic of the values and its error below / above it
export function barStat(v: number[], stat: BarStat, err: BarErr): { value: number; minus: number; plus: number } {
  const s = [...v].sort((a, b) => a - b);
  const value = !v.length ? NaN : stat === 'mean' ? mean(v) : stat === 'median' ? percentile(s, 0.5) : stat === 'sum' ? v.reduce((a, b) => a + b, 0) : v.length;
  let e = NaN;
  let [lo, hi] = [NaN, NaN];
  if (err === 'sd') e = sd(v);
  else if (err === 'se') e = sd(v) / Math.sqrt(v.length);
  else if (err === 'ci95') e = v.length > 1 ? (tInv(0.975, v.length - 1) * sd(v)) / Math.sqrt(v.length) : NaN;
  else if (err === 'minmax') [lo, hi] = [s[0], s[s.length - 1]];
  else if (err === 'q1q3') [lo, hi] = [percentile(s, 0.25), percentile(s, 0.75)];
  if (err === 'minmax' || err === 'q1q3') return { value, minus: value - lo, plus: hi - value };
  return { value, minus: e, plus: e };
}

// the bars of the raw values: a category for every group (in the order met), a series for every subgroup
export function rawTable(values: Column, groups: Column, subs: Column | undefined, stat: BarStat, err: BarErr, name: string): BarTable {
  const cats: string[] = [];
  const series: string[] = [];
  const cells = new Map<string, number[]>();
  const n = values.values.length;
  for (let i = 0; i < n; i++) {
    const v = values.values[i];
    const g = keyOf(groups, i);
    if (!Number.isFinite(v) || !g) continue;
    const s = subs ? keyOf(subs, i) : name;
    if (!s) continue;
    if (!cats.includes(g)) cats.push(g);
    if (!series.includes(s)) series.push(s);
    const k = `${g}\u0000${s}`;
    cells.set(k, [...(cells.get(k) ?? []), v]);
  }
  return {
    name,
    textCats: true,
    categories: cats.map((label, j) => ({ pos: j + 1, label })),
    series: series.map((s) => {
      const st = cats.map((g) => barStat(cells.get(`${g}\u0000${s}`) ?? [], stat, err));
      return { name: s, values: st.map((q) => q.value), plus: st.map((q) => q.plus), minus: st.map((q) => q.minus), n: cats.map((g) => cells.get(`${g}\u0000${s}`)?.length ?? 0), raw: cats.map((g) => cells.get(`${g}\u0000${s}`) ?? []) };
    }),
  };
}

// the bars of a table: the categories (text, numbers, else the row number) and every value column with its errors
export function wideTable(cat: Column | undefined, ys: Column[], errs: (Column | undefined)[]): BarTable {
  const n = Math.max(0, maxOf(ys.map((c) => c.values.length)));
  const numeric = !!cat && !cat.text?.some((t) => t?.trim()) && Array.from({ length: n }, (_, i) => cat.values[i]).every(Number.isFinite);
  const categories = Array.from({ length: n }, (_, i) => (numeric ? { pos: cat!.values[i], label: fmtNum(cat!.values[i], 6) } : { pos: i + 1, label: cat ? keyOf(cat, i) : String(i + 1) }));
  return {
    name: ys.map((c) => c.name).join(', '),
    textCats: !numeric,
    categories,
    series: ys.map((y, j) => {
      const e = errs[j];
      const err = Array.from({ length: n }, (_, i) => (e && Number.isFinite(e.values[i]) ? Math.abs(e.values[i]) : NaN));
      return { name: y.name, values: Array.from({ length: n }, (_, i) => y.values[i] ?? NaN), plus: err, minus: err };
    }),
  };
}

// elements: every bar as a group the significance brackets compare (its place, its top with its error, its values)
export type BarResult = { curves: Curve[]; values: Dataset; categoryTicks: string; catLo: number; catHi: number; elements: SigElement[]; span: [number, number]; warnings: string[] };

// The default colours of a waterfall: increase, decrease, total
export const WATERFALL_COLORS = ['#009E73', '#D55E00', '#0072B2'];

// A waterfall (bridge) chart: every value of the first column a step from the running total —
// up (an increase) or down (a decrease) —, a last bar with the total, lines joining the steps; three colours (and own
// looks): increase, decrease, total.
function waterfall(t: BarTable, d: BarSpec): BarResult | string {
  const s = t.series[0];
  const cats = [...t.categories];
  const vals = [...s.values];
  if (d.wfTotal !== false) {
    const step = cats.length > 1 ? cats[cats.length - 1].pos - cats[cats.length - 2].pos : 1;
    cats.push({ pos: cats[cats.length - 1].pos + step, label: 'Total' });
  }
  const W = Math.min(1, Math.max(0.05, d.width || 0.8));
  let run = 0;
  const steps = cats.map((c, i) => {
    const total = d.wfTotal !== false && i === cats.length - 1;
    const v = total ? run : Number.isFinite(vals[i]) ? vals[i] : 0;
    const base = total ? 0 : run;
    if (!total) run += v;
    return { c, base, top: base + v, v, kind: total ? 2 : v >= 0 ? 0 : 1 };
  });
  const fmt = (v: number) => (!Number.isFinite(v) ? '' : Number.isFinite(d.decimals) ? v.toFixed(Math.max(0, Math.min(10, d.decimals))) : fmtNum(v, 4));
  const names = ['Increase', 'Decrease', 'Total'];
  const curves: Curve[] = [0, 1, 2].map((kind) => {
    const sel = steps.filter((q) => q.kind === kind);
    const color = d.colors?.[kind] || WATERFALL_COLORS[kind];
    const own = withLook(curveStyle({ mode: 'line', color, lineWidth: d.edgeWidth, fillColor: color, fillOpacity: d.opacity, edgeColor: d.edgeColor }), d.barLook, d.looks?.[kind]);
    const lo = sel.map((q) => q.c.pos - W / 2);
    const hi = sel.map((q) => q.c.pos + W / 2);
    const text = d.labels === 'none' ? undefined : sel.map((q) => (q.kind === 2 ? fmt(q.v) : `${q.v >= 0 ? '+' : '−'}${fmt(Math.abs(q.v))}`));
    const centers = sel.map((q) => q.c.pos);
    return {
      key: `wf:${kind}`,
      label: names[kind],
      ...(sel.length ? {} : { noLegend: true }),
      series: d.horizontal ? { name: names[kind], x: column(s.name, Float64Array.from(sel, (q) => q.top)), y: column('category', Float64Array.from(centers)) } : { name: names[kind], x: column('category', Float64Array.from(centers)), y: column(s.name, Float64Array.from(sel, (q) => q.top)) },
      style: own.style,
      bars: { lo: Float64Array.from(lo), hi: Float64Array.from(hi), base: Float64Array.from(sel, (q) => q.base), look: 'bars', horizontal: d.horizontal, ...(own.look ? { style: own.look } : {}), ...(d.colors2?.[kind] ? { colors2: sel.map(() => d.colors2![kind]) } : {}), ...(text ? { labels: { text, pos: d.labels as 'top' | 'inside' | 'center', style: d.labelStyle ?? {} } } : {}) },
    } satisfies Curve;
  });
  // the connectors: from the end of a step to the start of the next (at the running total), a thin dashed line
  if (d.wfConnect !== false) {
    const xs: number[] = [];
    const ys: number[] = [];
    steps.slice(0, -1).forEach((q, i) => {
      const nx = steps[i + 1];
      const level = nx.kind === 2 ? nx.top : nx.base;
      xs.push(q.c.pos + W / 2, nx.c.pos - W / 2, NaN);
      ys.push(level, level, NaN);
    });
    const [a, b] = d.horizontal ? [ys, xs] : [xs, ys];
    curves.push({ key: 'wf:lines', label: 'connectors', noLegend: true, series: { name: 'connectors', x: column('x', Float64Array.from(a)), y: column('y', Float64Array.from(b)) }, style: curveStyle({ mode: 'line', color: '#555555', lineWidth: 0.6, dash: 'dash' }) });
  }
  const values: Dataset = {
    name: 'waterfall',
    columns: [
      { ...column('category', Float64Array.from(steps, () => NaN), steps.map((q) => q.c.label)), role: 'label' },
      { ...column('change', Float64Array.from(steps, (q) => q.v)), role: 'y' },
      { ...column('from', Float64Array.from(steps, (q) => q.base)), role: 'none' },
      { ...column('to', Float64Array.from(steps, (q) => q.top)), role: 'none' },
    ],
  };
  const tops = steps.flatMap((q) => [q.base, q.top]);
  return {
    curves,
    values,
    categoryTicks: cats.map((c) => `${c.pos}=${c.label.replace(/[\n=]/g, ' ')}`).join('\n'),
    catLo: cats[0].pos - W / 2,
    catHi: cats[cats.length - 1].pos + W / 2,
    elements: steps.map((q) => ({ name: q.c.label, cat: q.c.label, series: s.name, pos: q.c.pos, top: Math.max(q.base, q.top) })),
    span: [Math.min(0, minOf(tops)), maxOf(tops)],
    warnings: t.series.length > 1 ? ['A waterfall shows the first value column only.'] : [],
  };
}

// The bars drawn: their place across (by the category and the series), from where to where along, their look.
export function barChart(t: BarTable, d: BarSpec): BarResult | string {
  const warnings: string[] = [];
  if (d.arrange === 'waterfall') return t.series.length && t.categories.length ? waterfall(t, d) : 'No bars: choose the columns.';
  const k = t.series.length;
  const nc = t.categories.length;
  if (!k || !nc) return 'No bars: choose the columns.';
  const pos = t.categories.map((c) => c.pos);
  const sorted = [...new Set(pos)].sort((a, b) => a - b);
  const step = sorted.length > 1 ? minOf(sorted.slice(1).map((v, i) => v - sorted[i])) : 1;
  const W = Math.min(1, Math.max(0.05, d.width || 0.8)) * step;
  const floating = d.arrange === 'floating';
  if (floating && k < 2) return 'Floating bars: two columns at least (from, to; more: the next ends).';
  // the bars to draw: one curve per series (floating: per segment from one column to the next)
  type Bar = { name: string; lo: number[]; hi: number[]; base: number[]; top: number[]; value: number[]; plus: number[]; minus: number[] };
  const bars: Bar[] = [];
  const across = (j: number, count: number) => {
    const w = count > 1 ? W / count : W;
    const off = count > 1 ? (j - (count - 1) / 2) * w : 0;
    const g = count > 1 ? Math.min(0.9, Math.max(0, d.gap || 0)) : 0;
    return { lo: pos.map((p) => p + off - (w * (1 - g)) / 2), hi: pos.map((p) => p + off + (w * (1 - g)) / 2) };
  };
  if (floating) {
    for (let j = 1; j < k; j++) {
      const a = across(0, 1);
      const from = t.series[j - 1].values;
      const to = t.series[j].values;
      bars.push({ name: k > 2 ? `${t.series[j - 1].name} – ${t.series[j].name}` : `${t.series[0].name} – ${t.series[1].name}`, ...a, base: [...from], top: [...to], value: to.map((v, i) => v - from[i]), plus: t.series[j].plus.map(() => NaN), minus: t.series[j].minus.map(() => NaN) });
    }
  } else {
    // stacked: the positive values one on the other upwards, the negative ones downwards; 100 %: of the category's total
    const total = pos.map((_, i) => t.series.reduce((s, q) => s + (Number.isFinite(q.values[i]) ? Math.abs(q.values[i]) : 0), 0));
    const up = pos.map(() => 0);
    const down = pos.map(() => 0);
    t.series.forEach((s, j) => {
      const grouped = d.arrange === 'grouped';
      const a = across(j, grouped ? k : 1);
      const vals = d.arrange === 'percent' ? s.values.map((v, i) => (total[i] > 0 ? (100 * v) / total[i] : NaN)) : s.values;
      const scale = d.arrange === 'percent' ? s.values.map((_, i) => (total[i] > 0 ? 100 / total[i] : NaN)) : s.values.map(() => 1);
      let base: number[];
      if (d.arrange === 'stacked' || d.arrange === 'percent') {
        base = vals.map((v, i) => (v >= 0 ? up[i] : down[i]));
        vals.forEach((v, i) => {
          if (!Number.isFinite(v)) return;
          if (v >= 0) up[i] += v;
          else down[i] += v;
        });
      } else base = vals.map(() => (Number.isFinite(d.base) ? d.base : 0));
      bars.push({ name: s.name, ...a, base, top: vals.map((v, i) => base[i] + v), value: vals, plus: s.plus.map((e, i) => e * scale[i]), minus: s.minus.map((e, i) => e * scale[i]) });
    });
    // grouped / overlapped: the bars go from the base line to the value itself
    if (d.arrange === 'grouped' || d.arrange === 'overlap') for (const b of bars) b.top = b.value.slice();
  }
  // the colours: by series (or segment), or by category
  const colorOf = (j: number) => d.colors?.[j] || PALETTE[(j + 1) % PALETTE.length];
  const catColors = t.categories.map((_, i) => colorOf(i));
  const catColors2 = t.categories.map((_, i) => d.colors2?.[i] || '');
  const byCat = d.colorBy === 'category';
  // the values written: the value of every bar (100 %: its percent), smaller ones than hideBelow % left out
  const fmt = (v: number) => (!Number.isFinite(v) ? '' : Number.isFinite(d.decimals) ? v.toFixed(Math.max(0, Math.min(10, d.decimals))) : fmtNum(v, 4));
  const largest = Math.max(maxOf(bars.flatMap((b) => b.value.filter(Number.isFinite).map(Math.abs))), 0);
  const catTotal = pos.map((_, i) => bars.reduce((s, b) => s + (Number.isFinite(b.value[i]) ? Math.abs(b.value[i]) : 0), 0));
  const curves: Curve[] = bars.map((b, j) => {
    const color = colorOf(j);
    const rel = (i: number) => (100 * Math.abs(b.value[i])) / ((d.arrange === 'stacked' || d.arrange === 'percent' ? catTotal[i] : largest) || 1);
    const text = d.labels === 'none' ? undefined : b.value.map((v, i) => (Number.isFinite(v) && rel(i) >= (d.hideBelow || 0) ? `${fmt(v)}${d.arrange === 'percent' ? ' %' : ''}` : ''));
    const centers = b.lo.map((l, i) => (l + b.hi[i]) / 2);
    const hasErr = d.mode === 'raw' ? d.err !== 'none' : b.plus.some(Number.isFinite);
    // a series' own look (coloured by series); by category every bar takes its category's
    const own = withLook(curveStyle({ mode: 'line', color, lineWidth: d.edgeWidth, fillColor: color, fillOpacity: d.opacity, edgeColor: d.edgeColor }), d.barLook, byCat ? null : d.looks?.[j]);
    return {
      key: `bar:${j}`,
      label: b.name,
      series: d.horizontal ? { name: b.name, x: column(b.name, Float64Array.from(b.top)), y: column('category', Float64Array.from(centers)) } : { name: b.name, x: column('category', Float64Array.from(centers)), y: column(b.name, Float64Array.from(b.top)) },
      style: own.style,
      bars: {
        lo: Float64Array.from(b.lo),
        hi: Float64Array.from(b.hi),
        base: Float64Array.from(b.base),
        look: 'bars',
        horizontal: d.horizontal,
        ...(own.look ? { style: own.look } : {}),
        ...(byCat ? { colors: catColors, colors2: catColors2, ...(d.looks?.some(Boolean) ? { looks: t.categories.map((_, i) => d.looks?.[i] ?? null) } : {}) } : d.colors2?.[j] ? { colors2: b.lo.map(() => d.colors2![j]) } : {}),
        ...(hasErr && !floating ? { err: { plus: Float64Array.from(b.plus, (e) => (Number.isFinite(e) ? e : 0)), minus: Float64Array.from(b.minus, (e) => (d.errDir === 'plus' || !Number.isFinite(e) ? 0 : e)), cap: d.errCap, width: d.errWidth, color: (!byCat && d.looks?.[j]?.err) || '' } } : {}),
        ...(text ? { labels: { text, pos: d.labels as 'top' | 'inside' | 'center', style: d.labelStyle ?? {} } } : {}),
      },
      // coloured by category: the categories in the legend instead
      ...(byCat ? { noLegend: true } : {}),
    };
  });
  if (byCat)
    t.categories.forEach((c, i) => {
      const own = withLook(curveStyle({ color: catColors[i], lineWidth: d.edgeWidth, fillColor: catColors[i], fillOpacity: d.opacity, edgeColor: d.edgeColor }), d.barLook, d.looks?.[i]);
      curves.push({ key: `cat:${i}`, label: c.label, series: { name: c.label, x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) }, style: own.style, bars: { lo: new Float64Array(0), hi: new Float64Array(0), base: new Float64Array(0), look: 'bars', colors2: [catColors2[i]], ...(own.look ? { style: own.look } : {}) } });
    });
  // the raw values over their bars, spread a little across (the same spread every time)
  const overBars = d.arrange === 'grouped' || d.arrange === 'overlap';
  if (d.mode === 'raw' && d.points && overBars)
    t.series.forEach((s, j) => {
      const b = bars[j];
      if (!b || !s.raw) return;
      const xs: number[] = [];
      const ys: number[] = [];
      s.raw.forEach((vals, i) => {
        const mid = (b.lo[i] + b.hi[i]) / 2;
        const w = b.hi[i] - b.lo[i];
        vals.forEach((v, q) => {
          const jitter = (((q + 1) * 0.6180339887) % 1) - 0.5;
          const across = mid + jitter * w * 0.5;
          xs.push(d.horizontal ? v : across);
          ys.push(d.horizontal ? across : v);
        });
      });
      curves.push({ key: `pts:${j}`, label: `${s.name} (values)`, noLegend: true, series: { name: `${s.name} values`, x: column('x', Float64Array.from(xs)), y: column('y', Float64Array.from(ys)) }, style: curveStyle({ mode: 'scatter', color: '#333333', symbol: 'circle', symbolSize: 3.5, symbolFill: 'white', symbolEdge: 0.6 }) });
    });
  if (d.mode === 'raw' && d.points && !overBars) warnings.push('The values are drawn over grouped or overlapped bars only.');
  // the categories on their axis (text: at their places), and what is drawn as a table
  const categoryTicks = t.textCats ? t.categories.map((c) => `${c.pos}=${c.label.replace(/[\n=]/g, ' ')}`).join('\n') : '';
  const lo = minOf(bars.flatMap((b) => b.lo));
  const hi = maxOf(bars.flatMap((b) => b.hi));
  const rows = bars.flatMap((b) => t.categories.map((c, i) => ({ c, b, i })));
  const values: Dataset = {
    name: 'bars',
    columns: [
      { ...column('category', Float64Array.from(rows, (r) => (t.textCats ? NaN : r.c.pos)), t.textCats ? rows.map((r) => r.c.label) : undefined), role: t.textCats ? 'label' : 'x' },
      { ...column('series', Float64Array.from(rows, () => NaN), rows.map((r) => r.b.name)), role: 'label' },
      { ...column('value', Float64Array.from(rows, (r) => r.b.value[r.i])), role: 'y' },
      { ...column('error −', Float64Array.from(rows, (r) => r.b.minus[r.i])), role: 'none' },
      { ...column('error +', Float64Array.from(rows, (r) => r.b.plus[r.i])), role: 'none' },
      ...(d.mode === 'raw' ? [{ ...column('N', Float64Array.from(rows, (r) => t.series.find((s) => s.name === r.b.name)?.n?.[r.i] ?? NaN)), role: 'none' as const }] : []),
    ],
  };
  // the bars as groups to compare: at their middle, up to their error (or their highest value drawn)
  const many = bars.length > 1;
  const elements: SigElement[] = bars.flatMap((b, j) =>
    t.categories.flatMap((c, i) => {
      if (!Number.isFinite(b.top[i])) return [];
      const raw = floating ? undefined : t.series[j]?.raw?.[i];
      const up = b.value[i] >= 0 ? b.top[i] + (Number.isFinite(b.plus[i]) ? b.plus[i] : 0) : b.base[i];
      const top = Math.max(up, b.top[i], d.points && raw?.length ? maxOf(raw) : -Infinity);
      return [{ name: many ? `${c.label} / ${b.name}` : c.label, cat: c.label, series: b.name, pos: (b.lo[i] + b.hi[i]) / 2, top, ...(raw ? { values: raw } : {}) }];
    }),
  );
  const low = Math.min(0, minOf(bars.flatMap((b) => b.base.filter(Number.isFinite))), minOf(bars.flatMap((b) => b.top.filter(Number.isFinite))));
  return { curves, values, categoryTicks, catLo: lo, catHi: hi, elements, span: [low, Math.max(maxOf(elements.map((e) => e.top)), low + 1)], warnings };
}
