// Functions of a whole column in a formula: mean(A), median, sd, sum, min, max, count, first, last of an input column
// (one argument: min(A, B) and max(A, B) stay the functions of two numbers, row by row) — the empty and masked values
// left out. With a condition, only the rows where it is true: mean(A, B > 5), sum, median, sd, count, first, last
// (first(A, between(B, 10, 20) or B == 7): A in the first row where B is between 10 and 20 or is 7), and minif(A, cond),
// maxif(A, cond); at(A, 12): A in row 12. Each is replaced by a value of its own (`__max_A`) added to vals. The condition
// is a formula of the columns and single values, row by row (i or row: the row, n: the rows). Used by Math column,
// Columns and the formulas of a Workbook. Pure.
import { compile, seedOf } from './expr.ts';
import type { Column, Scalar } from './table.ts';

export const isCol = (v: Column | Scalar): v is Column => 'values' in v;
const ALL = ['mean', 'median', 'sd', 'sum', 'min', 'max', 'count', 'first', 'last'] as const;
// (with a condition: min and max of two arguments are the functions of two numbers, so minif, maxif)
const WHERE = ['mean', 'median', 'sd', 'sum', 'count', 'first', 'last', 'minif', 'maxif'] as const;
type Fn = (typeof ALL)[number] | (typeof WHERE)[number];
export const COLUMN_FUNCTION_NAMES = [...new Set<string>([...ALL, ...WHERE, 'at'])];
const CALL = new RegExp(`\\b(${COLUMN_FUNCTION_NAMES.join('|')})\\s*\\(`, 'g');
const LETTER = /^\s*([A-Z]{1,2})\s*$/;

// the statistic of the values kept (in their order); first / last: the first and last of them
function statOf(fn: Fn, v: number[]): number {
  const s = fn === 'median' || fn === 'min' || fn === 'max' || fn === 'minif' || fn === 'maxif' ? [...v].sort((a, b) => a - b) : v;
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = v.length ? sum / v.length : NaN;
  switch (fn) {
    case 'mean':
      return mean;
    case 'sum':
      return sum;
    case 'count':
      return v.length;
    case 'min':
    case 'minif':
      return s.length ? s[0] : NaN;
    case 'max':
    case 'maxif':
      return s.length ? s[s.length - 1] : NaN;
    case 'first':
      return v.length ? v[0] : NaN;
    case 'last':
      return v.length ? v[v.length - 1] : NaN;
    case 'median':
      return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN;
    default:
      return v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1)) : NaN;
  }
}

// the end of a call whose “(” is at `open`, and its arguments (split at the commas outside parentheses); null: not closed
function callArgs(src: string, open: number): { end: number; args: string[] } | null {
  let depth = 0;
  let from = open + 1;
  const args: string[] = [];
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        args.push(src.slice(from, k));
        return { end: k + 1, args: args.length === 1 && !args[0].trim() ? [] : args };
      }
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(from, k));
      from = k + 1;
    }
  }
  return null;
}

// The rows where a condition is true (a formula of the columns and single values of vals, row by row), or why not
export function rowsWhere(cond: string, vals: Record<string, Column | Scalar>, notes?: string[]): { on: Uint8Array; n: number } | string {
  const f = compile(withColumnFunctions(cond, vals, notes));
  if (typeof f === 'string') return f;
  const unknown = f.names.filter((x) => !(x in vals) && x !== 'i' && x !== 'row' && x !== 'n');
  if (unknown.length) return `unknown name${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}`;
  const cols = f.names.filter((x) => x in vals && isCol(vals[x])).map((x) => [x, (vals[x] as Column).values] as const);
  const n = cols.length ? Math.max(...cols.map(([, a]) => a.length)) : 0;
  const v: Record<string, number> = { n };
  for (const x of f.names) if (x in vals && !isCol(vals[x])) v[x] = (vals[x] as Scalar).value;
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    v.i = v.row = i + 1;
    for (const [x, a] of cols) v[x] = i < a.length ? a[i] : NaN;
    const t = f.fn(v);
    on[i] = t && !Number.isNaN(t) ? 1 : 0;
  }
  return { on, n };
}

// The formula with every function of a whole column replaced by its value (put in vals); notes: what to say about them
// (no row where the condition is true, several rows for first / last, a condition that cannot be computed)
export function withColumnFunctions(src: string, vals: Record<string, Column | Scalar>, notes?: string[]): string {
  let out = '';
  let at = 0;
  // (a search of its own: a condition inside is read by this function again)
  const re = new RegExp(CALL.source, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const fn = m[1] as Fn | 'at';
    const open = m.index + m[0].length - 1;
    const call = callArgs(src, open);
    const letter = call ? LETTER.exec(call.args[0] ?? '')?.[1] : undefined;
    const c = letter ? vals[letter] : undefined;
    const value = call && c && isCol(c) ? columnFunction(fn, letter!, c, call.args, src.slice(m.index, call.end), vals, notes) : null;
    if (value === null) continue;
    out += src.slice(at, m.index) + value;
    at = call!.end;
    re.lastIndex = call!.end;
  }
  return out + src.slice(at);
}

// a call of a column function: the name of its value (put in vals), or null when it is not one (min(A, B) …)
function columnFunction(fn: Fn | 'at', letter: string, c: Column, args: string[], text: string, vals: Record<string, Column | Scalar>, notes?: string[]): string | null {
  const keep = (i: number) => Number.isFinite(c.values[i]) && !c.mask?.[i];
  const put = (name: string, label: string, value: number) => {
    if (!(name in vals)) vals[name] = { name: label, value };
    return name;
  };
  if (args.length === 1) {
    if (!(ALL as readonly string[]).includes(fn)) return null;
    const name = `__${fn}_${letter}`;
    if (name in vals) return name;
    const v: number[] = [];
    for (let i = 0; i < c.values.length; i++) if (keep(i)) v.push(c.values[i]);
    return put(name, `${fn}(${letter})`, statOf(fn as Fn, v));
  }
  if (args.length !== 2 || (fn !== 'at' && !(WHERE as readonly string[]).includes(fn))) return null;
  const name = `__${fn}_${letter}_${seedOf(text).toString(36)}`;
  if (name in vals) return name;
  if (fn === 'at') {
    // the row: a formula of single values and n
    const f = compile(withColumnFunctions(args[1], vals, notes));
    const bad = typeof f === 'string' ? f : f.names.filter((x) => x !== 'n' && !(x in vals && !isCol(vals[x]))).map((x) => `${x} is not one value`)[0];
    if (bad) {
      notes?.push(`${text}: ${bad}`);
      return put(name, text, NaN);
    }
    const g = f as Exclude<typeof f, string>;
    const v: Record<string, number> = { n: c.values.length };
    for (const x of g.names) if (x !== 'n') v[x] = (vals[x] as Scalar).value;
    const k = Math.round(g.fn(v));
    if (!(k >= 1 && k <= c.values.length)) {
      notes?.push(`${text}: no row ${Number.isFinite(k) ? k : '(not a number)'} (the column has ${c.values.length} rows).`);
      return put(name, text, NaN);
    }
    return put(name, text, c.mask?.[k - 1] ? NaN : c.values[k - 1]);
  }
  const w = rowsWhere(args[1], vals, notes);
  if (typeof w === 'string') {
    notes?.push(`${text}: ${w}`);
    return put(name, text, NaN);
  }
  const rows: number[] = [];
  for (let i = 0; i < c.values.length; i++) if (i < w.n && w.on[i] && keep(i)) rows.push(i);
  if (!rows.length && fn !== 'count' && fn !== 'sum') notes?.push(`${text}: no row where ${args[1].trim()} (with a value of ${letter}).`);
  else if ((fn === 'first' || fn === 'last') && rows.length > 1) notes?.push(`${text}: ${rows.length} rows match, the ${fn} used (row ${(fn === 'first' ? rows[0] : rows[rows.length - 1]) + 1}).`);
  return put(name, text, statOf(fn, rows.map((i) => c.values[i])));
}
