// What the values on an axis of a 1D plot are: numbers; categories — every text (or number taken as a name) at a place
// 1, 2, 3 … (in the order of the data, sorted, or as listed), points spread around it when asked; dates, times and
// durations — their seconds. Found over all the curves on the axis (they share its categories), the columns of the
// curves replaced by their places (their texts kept). Pure.
import { column, type Column } from './table.ts';
import { parseTime, type TimeKind } from '../figure/timeaxis.ts';
import type { AxisSpec } from '../figure/spec.ts';

// a cell as text: its text, else its number
const cell = (c: Column, i: number) => {
  const t = c.text?.[i]?.trim();
  if (t) return t;
  const v = c.values[i];
  return Number.isFinite(v) ? String(+v.toPrecision(12)) : '';
};
// a column of text: some cells hold a text that is not a number
const texty = (c: Column) => !!c.text && c.text.some((t, i) => !!t?.trim() && !Number.isFinite(c.values[i]));

export type AxisValues = { kind: 'number' } | { kind: 'category'; cats: string[] } | { kind: 'time'; time: TimeKind };

// What the columns on an axis hold, as the axis asks (auto: text → categories, or times when every text reads as one).
export function axisValues(cols: Column[], spec: Pick<AxisSpec, 'kind' | 'catOrder' | 'catList' | 'dateOrder'>): AxisValues {
  const kind = spec.kind ?? 'auto';
  if (kind === 'number' || !cols.length) return { kind: 'number' };
  const order = spec.dateOrder ?? 'dmy';
  const anyText = cols.some(texty);
  if (kind === 'time' || (kind === 'auto' && anyText)) {
    // every non-empty cell a date (or every one a time / duration)
    const kinds = new Set<TimeKind>();
    let ok = true;
    for (const c of cols)
      for (let i = 0; i < c.values.length && ok; i++) {
        const t = c.text?.[i]?.trim();
        if (!t) continue;
        const p = parseTime(t, order);
        if (p) kinds.add(p.kind);
        else ok = false;
      }
    if (ok && kinds.size === 1) return { kind: 'time', time: [...kinds][0] };
    if (kind === 'time') return { kind: 'time', time: 'duration' };
  }
  if (kind === 'auto' && !anyText) return { kind: 'number' };
  // categories: in the order of the data, sorted, or as listed (the others after them)
  const seen: string[] = [];
  const has = new Set<string>();
  for (const c of cols)
    for (let i = 0; i < c.values.length; i++) {
      const t = cell(c, i);
      if (t && !has.has(t)) {
        has.add(t);
        seen.push(t);
      }
    }
  let cats = seen;
  if (spec.catOrder === 'sorted') cats = [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  else if (spec.catOrder === 'custom') {
    const listed = (spec.catList ?? '')
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => has.has(s));
    const set = new Set(listed);
    cats = [...new Set(listed), ...seen.filter((s) => !set.has(s))];
  }
  return { kind: 'category', cats };
}

// A column's values on the axis: the places of its categories (spread by ±jitter, the same for a row every time), or
// its times in seconds. The column keeps its name and its texts.
export function placeColumn(c: Column, a: AxisValues, spec: Pick<AxisSpec, 'dateOrder' | 'jitter'>, spread: boolean): Column {
  if (a.kind === 'number') return c;
  const n = c.values.length;
  const out = new Float64Array(n);
  if (a.kind === 'category') {
    const at = new Map(a.cats.map((t, k) => [t, k + 1]));
    const j = spread ? Math.min(0.45, Math.max(0, spec.jitter ?? 0)) : 0;
    for (let i = 0; i < n; i++) {
      const p = at.get(cell(c, i));
      // a fixed spread for every row: the fractional part of i·φ, from −j to +j
      out[i] = p === undefined ? NaN : p + (j ? (((i * 0.6180339887498949) % 1) * 2 - 1) * j : 0);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const t = c.text?.[i]?.trim();
      out[i] = t ? (parseTime(t, spec.dateOrder ?? 'dmy')?.v ?? NaN) : c.values[i];
    }
  }
  return { ...column(c.name, out, c.text ?? Array.from({ length: n }, (_, i) => cell(c, i))), ...(c.role ? { role: c.role } : {}) };
}
