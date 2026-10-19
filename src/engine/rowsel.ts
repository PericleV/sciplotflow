// The rows a statistics node works on: all, ranges (by the row number or by the value of X, "+ break" adds one), a
// list as in Math column rules ("3, 7-12, 20-end") or a rule (a condition of x, the columns A, B, C …, i and n).
import { columnLetter } from './csv.ts';
import { compile } from './expr.ts';
import { parseRows } from './rows.ts';
import { fmtNum, type Column } from './table.ts';

export type RowRange = { from: number; to: number }; // NaN: from the first / up to the last
export type RowSelect = { mode: 'all' | 'range' | 'list' | 'rule'; by?: 'row' | 'x'; ranges?: RowRange[]; list?: string; rule?: string };
export const ROWSEL_ALL: RowSelect = { mode: 'all' };

// The rows chosen (from 0, in order) of n rows, and a short text of the choice; x: the X column (ranges by X, x in a
// rule), cols: the columns named A, B, C … in a rule.
export function selectRows(sel: RowSelect | undefined, n: number, x: Column | undefined, cols: Column[]): { rows: number[]; text: string } | string {
  const all = () => Array.from({ length: n }, (_, i) => i);
  const s = sel ?? ROWSEL_ALL;
  switch (s.mode) {
    case 'all':
      return { rows: all(), text: '' };
    case 'range': {
      const ranges = (s.ranges ?? []).filter((r) => Number.isFinite(r.from) || Number.isFinite(r.to));
      if (!ranges.length) return { rows: all(), text: '' };
      const byX = s.by === 'x';
      if (byX && !x) return 'Ranges by X need an X column.';
      const keep = new Uint8Array(n);
      for (const r of ranges) {
        if (byX) {
          const lo = Number.isFinite(r.from) ? r.from : -Infinity;
          const hi = Number.isFinite(r.to) ? r.to : Infinity;
          const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
          for (let i = 0; i < n; i++) if (x!.values[i] >= a && x!.values[i] <= b) keep[i] = 1;
        } else {
          const a = Number.isFinite(r.from) ? Math.floor(r.from) : 1;
          const b = Number.isFinite(r.to) ? Math.floor(r.to) : n;
          for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(n, Math.max(a, b)); i++) keep[i - 1] = 1;
        }
      }
      const rows = all().filter((i) => keep[i]);
      const one = (r: RowRange) => `${Number.isFinite(r.from) ? fmtNum(r.from, 6) : byX ? '' : '1'}–${Number.isFinite(r.to) ? fmtNum(r.to, 6) : byX ? '' : 'end'}`;
      return { rows, text: `${byX ? `${x!.name} in ` : 'rows '}${ranges.map(one).join(', ')}` };
    }
    case 'list': {
      if (!s.list?.trim()) return { rows: all(), text: '' };
      const p = parseRows(s.list, n);
      return typeof p === 'string' ? p : { rows: p, text: `rows ${s.list.trim()}` };
    }
    case 'rule': {
      const src = s.rule?.trim();
      if (!src) return { rows: all(), text: '' };
      const f = compile(src);
      if (typeof f === 'string') return f;
      const letters = cols.map((_, k) => columnLetter(k));
      const bad = f.names.filter((v) => v !== 'i' && v !== 'n' && !(v === 'x' && x) && !letters.includes(v));
      if (bad.length) return `Unknown name${bad.length > 1 ? 's' : ''} ${bad.join(', ')} in the rule: it may use ${x ? 'x (the X column), ' : ''}the columns ${letters.length ? `${letters[0]}${letters.length > 1 ? ` … ${letters[letters.length - 1]}` : ''}` : '(none)'}, i (the row, 1 … n) and n.`;
      const used = f.names.filter((v) => letters.includes(v)).map((v) => [v, cols[letters.indexOf(v)].values] as const);
      const vars: Record<string, number> = { i: 0, n };
      const rows: number[] = [];
      for (let i = 0; i < n; i++) {
        vars.i = i + 1;
        if (x) vars.x = x.values[i];
        for (const [v, a] of used) vars[v] = i < a.length ? a[i] : NaN;
        if (f.fn(vars) > 0) rows.push(i);
      }
      return { rows, text: `where ${src}` };
    }
  }
}
