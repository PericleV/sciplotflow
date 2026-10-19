// Functions of a whole column in a formula: mean(A), median, sd, sum, min, max, count, first, last of an input column
// (one argument: min(A, B) and max(A, B) stay the functions of two numbers, row by row) — the empty and masked values
// left out. Each is replaced by a value of its own (`__max_A`) added to vals. Used by Math column and Columns. Pure.
import type { Column, Scalar } from './table.ts';

export const isCol = (v: Column | Scalar): v is Column => 'values' in v;
const COLUMN_FNS = ['mean', 'median', 'sd', 'sum', 'min', 'max', 'count', 'first', 'last'] as const;
export function withColumnFunctions(src: string, vals: Record<string, Column | Scalar>): string {
  return src.replace(new RegExp(`\\b(${COLUMN_FNS.join('|')})\\(\\s*([A-Z]{1,2})\\s*\\)`, 'g'), (whole, fn: (typeof COLUMN_FNS)[number], letter: string) => {
    const c = vals[letter];
    if (!c || !isCol(c)) return whole;
    const name = `__${fn}_${letter}`;
    if (!(name in vals)) {
      const v: number[] = [];
      for (let i = 0; i < c.values.length; i++) if (Number.isFinite(c.values[i]) && !c.mask?.[i]) v.push(c.values[i]);
      const s = [...v].sort((a, b) => a - b);
      const sum = v.reduce((a, b) => a + b, 0);
      const mean = v.length ? sum / v.length : NaN;
      const value =
        fn === 'mean' ? mean
        : fn === 'sum' ? sum
        : fn === 'count' ? v.length
        : fn === 'min' ? (s.length ? s[0] : NaN)
        : fn === 'max' ? (s.length ? s[s.length - 1] : NaN)
        : fn === 'first' ? (v.length ? v[0] : NaN)
        : fn === 'last' ? (v.length ? v[v.length - 1] : NaN)
        : fn === 'median' ? (s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN)
        : v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1)) : NaN;
      vals[name] = { name: `${fn}(${letter})`, value };
    }
    return name;
  });
}
