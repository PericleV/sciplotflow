// Set column values (as Origin's): a column of a Workbook's own table given by a formula of the sheet's columns, computed
// again whenever they change. The formula names a column by its letter as shown (A, B …) or [its name]; it is kept by
// the columns' keys ([@o3]: a column of its own table, 3 its place as read; [@i:name]: an input's), so moving or
// renaming a column changes only how it is shown. Its rows: all, or those chosen (ranges, a list, where conditions are
// true), the others kept as they are or emptied. The formulas are computed in the order they need one another (one that
// needs itself, through others, is said and left empty). Pure.
import { compile, seedOf } from './expr.ts';
import { isCol, withColumnFunctions } from './colfns.ts';
import { formulaShown, formulaStored } from './columns.ts';
import { selectRows, type RowSelect } from './rowsel.ts';
import { columnLetter } from './csv.ts';
import { roleOf, type Column, type Scalar } from './table.ts';

// others: the rows not chosen kept as they were (absent) or emptied; seed: of its random values (rand() …)
export type ColFormula = { formula: string; rows?: RowSelect; others?: 'keep' | 'empty'; seed?: number };

// the columns of a sheet as the formulas name them: their keys and names, in the order shown
const linesOf = (columns: Column[], keys: string[]) => columns.map((c, j) => ({ from: keys[j] ?? `#${j}`, name: c.name }));
// the formula as written (letters and names shown) kept by the keys, and back
export const formulaKept = (shown: string, columns: Column[], keys: string[]) => formulaStored(shown, linesOf(columns, keys));
export const formulaOfKept = (kept: string, columns: Column[], keys: string[]) => formulaShown(kept, linesOf(columns, keys));

const REF = /\[@?([^\]]+)\]/g;
// the keys a kept formula uses
export const keysUsed = (kept: string) => [...kept.matchAll(REF)].map((m) => m[1]);

export type FormulaColumn = { values: Float64Array; notes: string[]; changed: number } | string;

// One column by its formula: j its place among the columns shown (its own values kept on the rows not chosen); seedKey:
// what makes its random values its own (the sheet and the column)
export function formulaColumn(f: ColFormula, columns: Column[], keys: string[], j: number, seedKey = ''): FormulaColumn {
  const src = f.formula.trim();
  if (!src) return 'write a formula, e.g. A * 2 or (B − C) / C * 100';
  const at = new Map(keys.map((k, q) => [k, q]));
  let missing = '';
  // every column named: its letter as shown now
  const text = src.replace(REF, (_w, k: string) => {
    const q = at.get(k);
    if (q === undefined) {
      missing ||= k.startsWith('i:') ? k.slice(2) : k;
      return 'NaN';
    }
    return columnLetter(q);
  });
  if (missing) return `a column it uses is not on the sheet any more${/^o\d+$/.test(missing) ? '' : ` (${missing})`}`;
  // (the columns by their letters; the functions of whole columns add their values: single values)
  const vals: Record<string, Column | Scalar> = {};
  columns.forEach((c, q) => (vals[columnLetter(q)] = c));
  const notes: string[] = [];
  const g = compile(withColumnFunctions(text, vals, notes), undefined, { seed: seedOf(`${seedKey}|${f.seed ?? 0}`) });
  if (typeof g === 'string') return g;
  const unknown = g.names.filter((x) => !(x in vals) && x !== 'i' && x !== 'n');
  if (unknown.length) return `unknown name${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}: a column is its letter (A, B …) or [its name]; i the row, n the rows`;
  const used = g.names.flatMap((x) => (x in vals && isCol(vals[x]) ? [[x, (vals[x] as Column).values] as const] : []));
  const own = columns[j]?.values ?? new Float64Array(0);
  const n = Math.max(own.length, ...used.map(([, a]) => a.length));
  // the rows chosen (all: every one)
  let rows: number[] | null = null;
  if (f.rows && f.rows.mode !== 'all') {
    const X = columns.find((_, q) => roleOf(columns, q) === 'x');
    const s = selectRows(f.rows, n, X, columns);
    if (typeof s === 'string') return `rows: ${s}`;
    rows = s.rows;
  }
  const out = f.others === 'empty' && rows ? new Float64Array(n).fill(NaN) : Float64Array.from({ length: n }, (_, i) => (i < own.length ? own[i] : NaN));
  const v: Record<string, number> = { n };
  for (const x of g.names) if (x in vals && !isCol(vals[x])) v[x] = (vals[x] as Scalar).value;
  const one = (i: number) => {
    v.i = i + 1;
    for (const [x, a] of used) v[x] = i < a.length ? a[i] : NaN;
    out[i] = g.fn(v);
  };
  if (rows) rows.forEach(one);
  else for (let i = 0; i < n; i++) one(i);
  return { values: out, notes, changed: rows ? rows.length : n };
}

// Every formula of a sheet (by its own column's place as read) computed, in the order they need one another: the columns
// with their values, what is said (a formula that cannot be computed: its column empty)
export function applyFormulas(columns: Column[], keys: string[], formulas: Record<string, ColFormula> | undefined, sheet = ''): { columns: Column[]; warnings: string[] } {
  const list = Object.entries(formulas ?? {}).flatMap(([place, f]) => {
    const j = keys.indexOf(`o${place}`);
    return j >= 0 && f.formula.trim() ? [{ key: `o${place}`, j, f }] : [];
  });
  if (!list.length) return { columns, warnings: [] };
  const out = [...columns];
  const warnings: string[] = [];
  const byKey = new Map(list.map((x) => [x.key, x]));
  const done = new Set<string>();
  const busy = new Set<string>();
  const said = (j: number) => (columns[j].name && columns[j].name !== columnLetter(j) ? `${columnLetter(j)} (${columns[j].name})` : columnLetter(j));
  const run = (x: (typeof list)[number]): boolean => {
    if (done.has(x.key)) return true;
    if (busy.has(x.key)) return false;
    busy.add(x.key);
    // (the formulas it needs, first)
    for (const k of keysUsed(x.f.formula))
      if (k !== x.key && byKey.has(k) && !run(byKey.get(k)!)) {
        busy.delete(x.key);
        return false;
      }
    busy.delete(x.key);
    done.add(x.key);
    const r = keysUsed(x.f.formula).includes(x.key) ? 'the formula uses its own column' : formulaColumn(x.f, out, keys, x.j, `${sheet}|${x.key}`);
    if (typeof r === 'string') {
      warnings.push(`Column ${said(x.j)}: ${r}.`);
      out[x.j] = { ...out[x.j], values: new Float64Array(out[x.j].values.length).fill(NaN), text: undefined };
      return true;
    }
    warnings.push(...r.notes.map((t) => `Column ${said(x.j)}: ${t}`));
    const { text: _t, ...rest } = out[x.j];
    out[x.j] = { ...rest, values: r.values };
    return true;
  };
  for (const x of list)
    if (!run(x)) {
      warnings.push(`Column ${said(x.j)}: its formula and others need one another in a loop; left empty.`);
      done.add(x.key);
      out[x.j] = { ...out[x.j], values: new Float64Array(out[x.j].values.length).fill(NaN), text: undefined };
    }
  return { columns: out, warnings };
}
