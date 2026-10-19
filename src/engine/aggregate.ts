// A curve's repeated X brought to one point each (as a statistics plot's line of means): the mean or the median of the
// Y at every X, and its spread as the ±Y — the SD, the SE, the 95 % confidence interval of the mean (Student t), the
// min – max or the quartiles Q1 – Q3 (unequal + and −). X of numbers: in order; X of texts: in the order met. Masked rows
// left out. Pure.
import { tInv } from './dist.ts';
import { percentile } from './stats.ts';
import { column, type Column } from './table.ts';

export type AggStat = 'mean' | 'median';
export type AggErr = 'none' | 'sd' | 'se' | 'ci95' | 'minmax' | 'iqr';
export type AggSpec = { stat?: AggStat; err?: AggErr };

export function aggregateByX(x: Column, y: Column, spec: AggSpec): { x: Column; y: Column; plus?: Column; minus?: Column; n: number[] } {
  const stat = spec.stat ?? 'mean';
  const err = spec.err ?? 'none';
  const text = !!x.text?.some((t) => t?.trim());
  const groups = new Map<string, { at: number; label: string; ys: number[] }>();
  const n = Math.min(x.values.length, y.values.length);
  for (let i = 0; i < n; i++) {
    const v = y.values[i];
    if (!Number.isFinite(v) || x.mask?.[i] || y.mask?.[i]) continue;
    const label = text ? (x.text?.[i]?.trim() ?? '') : '';
    if (text ? !label : !Number.isFinite(x.values[i])) continue;
    const key = text ? label : String(x.values[i]);
    const g = groups.get(key) ?? { at: x.values[i], label, ys: [] };
    g.ys.push(v);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  if (!text) list.sort((a, b) => a.at - b.at);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a: number[]) => {
    if (a.length < 2) return NaN;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  };
  const centre: number[] = [];
  const plus: number[] = [];
  const minus: number[] = [];
  for (const g of list) {
    const s = [...g.ys].sort((a, b) => a - b);
    const c = stat === 'median' ? percentile(s, 0.5) : mean(s);
    centre.push(c);
    let [up, down] = [NaN, NaN];
    if (err === 'sd') up = down = sd(s);
    else if (err === 'se') up = down = sd(s) / Math.sqrt(s.length);
    else if (err === 'ci95') up = down = s.length > 1 ? (tInv(0.975, s.length - 1) * sd(s)) / Math.sqrt(s.length) : NaN;
    else if (err === 'minmax') [up, down] = [s[s.length - 1] - c, c - s[0]];
    else if (err === 'iqr') [up, down] = [percentile(s, 0.75) - c, c - percentile(s, 0.25)];
    plus.push(up);
    minus.push(down);
  }
  const xs = column(x.name, Float64Array.from(list, (g) => (text ? NaN : g.at)), text ? list.map((g) => g.label) : undefined);
  const name = err === 'none' ? '' : { sd: 'SD', se: 'SE', ci95: '95 % CI', minmax: 'min – max', iqr: 'Q1 – Q3' }[err];
  return {
    x: { ...xs, ...(x.role ? { role: x.role } : {}) },
    y: { ...column(y.name, Float64Array.from(centre)), ...(y.role ? { role: y.role } : {}), ...(y.key ? { key: y.key } : {}) },
    ...(err !== 'none' ? { plus: column(`${name} +`, Float64Array.from(plus)), minus: column(`${name} −`, Float64Array.from(minus)) } : {}),
    n: list.map((g) => g.ys.length),
  };
}
