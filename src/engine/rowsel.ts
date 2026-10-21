// The rows a statistics node works on: all, ranges (by the row number or by the value of X, "+ break" adds one), a
// list as in Math column rules ("3, 7-12, 20-end") or where: conditions chosen (a column, a comparison, a value), or
// written as a formula (a condition of x, the columns A, B, C …, i and n).
import { columnLetter } from './csv.ts';
import { compile } from './expr.ts';
import { parseRows } from './rows.ts';
import { findColumn, fmtNum, type Column } from './table.ts';

export type RowRange = { from: number; to: number }; // NaN: from the first / up to the last
// A condition of a row: a column ('' = the X column) compared with a value (between: from v to v2, both included),
// or empty / not empty
export type RowOp = '<' | '<=' | '=' | '!=' | '>=' | '>' | 'between' | 'empty' | 'filled';
export type RowCond = { col: string; op: RowOp; v?: number; v2?: number };
// rule: the formula; conds: the conditions chosen, all of them true (join 'all') or any one (join 'any'); formula: the
// formula used instead of the conditions (absent: when it is written and there are no conditions, as older projects)
export type RowSelect = { mode: 'all' | 'range' | 'list' | 'rule'; by?: 'row' | 'x'; ranges?: RowRange[]; list?: string; rule?: string; conds?: RowCond[]; join?: 'all' | 'any'; formula?: boolean };
export const usesFormula = (s: RowSelect) => s.formula ?? (!s.conds?.length && !!s.rule?.trim());
export const ROW_OPS: [RowOp, string][] = [
  ['<', '<'],
  ['<=', '≤'],
  ['=', '='],
  ['!=', '≠'],
  ['>=', '≥'],
  ['>', '>'],
  ['between', 'between'],
  ['empty', 'is empty'],
  ['filled', 'is not empty'],
];
const needs = (op: RowOp) => (op === 'empty' || op === 'filled' ? 0 : op === 'between' ? 2 : 1);
// a condition with what it needs (its values given)
export const condReady = (c: RowCond) => (needs(c.op) < 1 || Number.isFinite(c.v)) && (needs(c.op) < 2 || Number.isFinite(c.v2));
// The conditions as a formula (x: the X column, a column named: its letter); null: a column not found
export function condsFormula(conds: RowCond[], join: 'all' | 'any', x: Column | undefined, cols: Column[]): string | null {
  const parts: string[] = [];
  for (const c of conds.filter(condReady)) {
    const col = c.col ? findColumn(cols, c.col) : x;
    if (!col) return null;
    const v = c.col ? columnLetter(cols.indexOf(col)) : 'x';
    const n = (a: number | undefined) => String(+(a ?? NaN).toPrecision(15));
    const one =
      c.op === 'empty' ? `isnan(${v})` : c.op === 'filled' ? `(not isnan(${v}))` : c.op === 'between' ? `${v} >= ${n(Math.min(c.v!, c.v2!))} and ${v} <= ${n(Math.max(c.v!, c.v2!))}` : `${v} ${c.op === '=' ? '==' : c.op} ${n(c.v)}`;
    parts.push(conds.length > 1 && c.op === 'between' && join === 'any' ? `(${one})` : one);
  }
  return parts.join(join === 'any' ? ' or ' : ' and ');
}
const cellEmpty = (c: Column, i: number) => !(i < c.values.length && Number.isFinite(c.values[i])) && !c.text?.[i]?.trim();
// one condition on one row
function condTrue(c: RowCond, col: Column, i: number): boolean {
  if (c.op === 'empty') return cellEmpty(col, i);
  if (c.op === 'filled') return !cellEmpty(col, i);
  const a = i < col.values.length ? col.values[i] : NaN;
  if (!Number.isFinite(a)) return false;
  const v = c.v!;
  switch (c.op) {
    case '<':
      return a < v;
    case '<=':
      return a <= v;
    case '=':
      return Math.abs(a - v) <= 1e-12 * Math.max(1, Math.abs(v));
    case '!=':
      return Math.abs(a - v) > 1e-12 * Math.max(1, Math.abs(v));
    case '>=':
      return a >= v;
    case '>':
      return a > v;
    case 'between':
      return a >= Math.min(v, c.v2!) && a <= Math.max(v, c.v2!);
  }
}
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
      if (!usesFormula(s)) {
        const conds = (s.conds ?? []).filter(condReady);
        if (!conds.length) return { rows: all(), text: '' };
        const used: Column[] = [];
        for (const c of conds) {
          const col = c.col ? findColumn(cols, c.col) : x;
          if (!col) return c.col ? `No column “${c.col}” for the condition.` : 'A condition on X needs an X column.';
          used.push(col);
        }
        const any = s.join === 'any';
        const rows = all().filter((i) => (any ? conds.some((c, k) => condTrue(c, used[k], i)) : conds.every((c, k) => condTrue(c, used[k], i))));
        const name = (k: number) => (conds[k].col ? used[k].name : 'x');
        const said = conds.map((c, k) => (c.op === 'empty' ? `${name(k)} is empty` : c.op === 'filled' ? `${name(k)} is not empty` : c.op === 'between' ? `${name(k)} between ${fmtNum(c.v!, 6)} and ${fmtNum(c.v2!, 6)}` : `${name(k)} ${ROW_OPS.find(([o]) => o === c.op)![1]} ${fmtNum(c.v!, 6)}`));
        return { rows, text: `where ${said.join(any ? ' or ' : ' and ')}` };
      }
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
