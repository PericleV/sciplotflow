// Tables reshaped: Convert columns (text read as numbers, numbers written as text), Transpose (the rows become the
// columns — one node either way: twice gives the table back) and Stack
// columns (columns one under the other: a long table of the name, the X and the value — the reverse of Split into
// columns). Pure.
import { columnRuns } from './batch.ts';
import { formatNumber, fromTemplate, numbersInNames, TO_NUMBER_DEFAULTS, TO_TEXT_DEFAULTS, toNumbers, toText, type ToNumberRules, type ToTextRules } from './convert.ts';
import { pick } from './extract.ts';
import { column, findColumn, fmtNum, unitOf, withUnit, bareName, type Column, type Dataset, type Workbook } from './table.ts';
import { maxOf } from './minmax.ts';

// cols: the columns (2-6, B-F, names; empty: none, until chosen)
export type ConvertData = { to: 'numbers' | 'text'; cols: string; num?: Partial<ToNumberRules>; txt?: Partial<ToTextRules> };
// as: once shown as Columns to rows (kept in saved projects, no longer used); names: the column whose values name the new columns ('': the first,
// '#': the row numbers); fmt: how a number is written as a name (its template: “{v} V”); head: the old names, a first
// column of text, of the numbers in them, or left out; headName: that column's name (empty: found from the names)
export type TransposeData = { as?: 'cols'; names: string; fmt?: Partial<ToTextRules>; head: 'text' | 'number' | 'none'; headName?: string };
// cols, xFrom, x: as a Batch over columns (the columns, and their X); key: each column's name as text or as a number
// (the value it keeps from Split into columns or Transpose, else the number in its name); keyName, valueName: the
// names of the new columns (empty: found)
export type StackData = { cols: string; xFrom?: 'one' | 'left' | 'row'; x?: string; key: 'text' | 'number'; keyName?: string; valueName?: string };
// Columns to sheets (the reverse of Sheets to columns): a sheet per column (cols, xFrom, x: as a Batch over columns;
// every sheet its X, the column and its ±Y), or a sheet per value of a column (by: its name; every sheet the rows of
// that value, all the columns); sheet: of a workbook coming in, the one taken (absent: the first)
export type ToSheetsData = { mode: 'columns' | 'values'; cols: string; xFrom?: 'one' | 'left' | 'row'; x?: string; by?: string; sheet?: string };
export const MAX_SHEETS = 500;

const MAX_COLS = 10_000;
const rowsOf = (ds: Dataset) => Math.max(0, maxOf(ds.columns.map((c) => c.values.length)));
// names made different: “a”, “a (2)” …
function unique(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((n) => {
    const k = (used.get(n) ?? 0) + 1;
    used.set(n, k);
    return k > 1 ? `${n} (${k})` : n;
  });
}
const cellOf = (c: Column, i: number) => (c.text?.[i]?.trim() ? c.text[i] : Number.isFinite(c.values[i]) ? String(c.values[i]) : '');

// ---- Convert columns ----
export function convertTable(ds: Dataset, d: ConvertData): { dataset: Dataset; warnings: string[]; changed: string[] } | string {
  const num: ToNumberRules = { ...TO_NUMBER_DEFAULTS, ...d.num };
  const txt: ToTextRules = { ...TO_TEXT_DEFAULTS, ...d.txt };
  // (none written: nothing converted until asked — the node lists the columns whose text looks like numbers)
  if (!d.cols.trim()) return { dataset: ds, warnings: [], changed: [] };
  const p = pick(d.cols, ds.columns.map((c) => c.name), true);
  if (p.missing.length) return `Columns: not found: ${p.missing.join(', ')}.`;
  const chosen = p.found;
  const warnings: string[] = [];
  const changed: string[] = [];
  const columns: Column[] = [];
  ds.columns.forEach((c, j) => {
    if (!chosen.includes(j)) return columns.push(c);
    changed.push(c.name);
    if (d.to === 'text') return columns.push(toText(c, txt));
    const r = toNumbers(c, num);
    columns.push(...r.columns);
    if (r.failed.length) warnings.push(`${c.name}: ${r.failed.length} cell${r.failed.length === 1 ? '' : 's'} not read as numbers (left empty): ${r.failed.slice(0, 4).map((f) => `row ${f.row + 1} “${f.text}”`).join(', ')}${r.failed.length > 4 ? ' …' : ''}.`);
    if (r.units.length) warnings.push(`${c.name}: different units (${r.units.join(', ')}): the numbers kept as written, the units left out.`);
  });
  return { dataset: { name: ds.name, columns }, warnings, changed };
}

// ---- Transpose ----
export function transposeTable(ds: Dataset, d: TransposeData): { dataset: Dataset; warnings: string[] } | string {
  const n = rowsOf(ds);
  if (!ds.columns.length || !n) return 'The table is empty.';
  if (n > MAX_COLS) return `${n} rows: at most ${MAX_COLS} can become columns.`;
  const byRow = d.names === '#';
  const ni = byRow ? -1 : d.names.trim() ? ds.columns.indexOf(findColumn(ds.columns, d.names) as Column) : 0;
  if (!byRow && ni < 0) return `Names from: no column “${d.names}”.`;
  const namesCol = ni >= 0 ? ds.columns[ni] : undefined;
  const data = ds.columns.filter((_, j) => j !== ni);
  if (!data.length) return 'Nothing to turn: the table has only the column of the names.';
  const fmt: ToTextRules = { ...TO_TEXT_DEFAULTS, ...d.fmt };
  const tpl = fmt.template || '{v}';
  const warnings: string[] = [];
  // (the new columns' names: the cells of the names' column — a number as the format writes it —, else the row)
  const names = unique(
    Array.from({ length: n }, (_, i) => {
      if (!namesCol) return fromTemplate(String(i + 1), tpl);
      const t = namesCol.text?.[i]?.trim();
      if (t) return t;
      const v = namesCol.values[i];
      return Number.isFinite(v) ? fromTemplate(formatNumber(v, fmt), tpl) : `Row ${i + 1}`;
    }),
  );
  const out: Column[] = [];
  if (d.head !== 'none') {
    const old = data.map((c) => c.name);
    if (d.head === 'number') {
      const r = numbersInNames(old, 'Value');
      if (r.failed.length) warnings.push(`No number in ${r.failed.length} name${r.failed.length === 1 ? '' : 's'}: ${r.failed.slice(0, 4).join(', ')}${r.failed.length > 4 ? ' …' : ''} (left empty).`);
      out.push({ ...column(d.headName?.trim() || r.name, Float64Array.from(r.values)), role: 'x' });
    } else out.push({ ...column(d.headName?.trim() || 'Name', new Float64Array(old.length).fill(NaN), old), role: 'label' });
  }
  // (a column of the names' numbers: each new column knows its value — a Fit or a Plot of them gives it)
  const keyName = namesCol && namesCol.values.some(Number.isFinite) ? namesCol.name : '';
  for (let i = 0; i < n; i++) {
    const values = Float64Array.from(data, (c) => (i < c.values.length ? c.values[i] : NaN));
    const hasText = data.some((c) => c.text?.[i]?.trim() && !Number.isFinite(c.values[i]));
    const col: Column = { ...column(names[i], values, hasText ? data.map((c) => c.text?.[i] ?? cellOf(c, i)) : undefined), role: 'y' };
    if (keyName && Number.isFinite(namesCol!.values[i])) col.key = { name: keyName, value: namesCol!.values[i] };
    out.push(col);
  }
  return { dataset: { name: ds.name, columns: out }, warnings };
}

// ---- Stack columns ----
export function stackColumns(ds: Dataset, d: StackData): { dataset: Dataset; warnings: string[] } | string {
  const runs = columnRuns(ds, { cols: d.cols, xFrom: d.xFrom, x: d.x });
  if (typeof runs === 'string') return runs;
  const warnings: string[] = [];
  const ys = runs.map((r) => r.columns[1]);
  // (the numbers: the value each column keeps from where it was cut or turned, else the number in its name)
  const kept = ys.every((c) => c.key && c.key.name === ys[0].key?.name);
  const keys = d.key !== 'number' ? null : kept ? { values: ys.map((c) => c.key!.value), name: ys[0].key!.name, failed: [] } : numbersInNames(ys.map((c) => c.name), 'Name');
  if (keys?.failed.length) warnings.push(`No number in ${keys.failed.length} name${keys.failed.length === 1 ? '' : 's'}: ${keys.failed.slice(0, 4).join(', ')}${keys.failed.length > 4 ? ' …' : ''} (left empty).`);
  const [kv, kt, xv, yv, ev]: [number[], string[], number[], number[], number[]] = [[], [], [], [], []];
  const xText: string[] = [];
  let xHasText = false;
  const hasErr = runs.some((r) => r.columns[2]?.role === 'yerr');
  runs.forEach((r, k) => {
    const [X, Y, E] = r.columns;
    const m = Math.max(X.values.length, Y.values.length);
    for (let i = 0; i < m; i++) {
      const [x, y] = [X.values[i] ?? NaN, Y.values[i] ?? NaN];
      // (a row empty in both: left out)
      if (!Number.isFinite(y) && !Number.isFinite(x) && !X.text?.[i]?.trim()) continue;
      kv.push(keys ? keys.values[k] : NaN);
      kt.push(Y.name);
      xv.push(x);
      xText.push(X.text?.[i] ?? '');
      if (X.text?.[i]?.trim() && !Number.isFinite(x)) xHasText = true;
      yv.push(y);
      ev.push(E?.role === 'yerr' ? (E.values[i] ?? NaN) : NaN);
    }
  });
  const keyCol: Column = keys ? { ...column(d.keyName?.trim() || keys.name, Float64Array.from(kv)), role: 'none' } : { ...column(d.keyName?.trim() || 'Name', new Float64Array(kt.length).fill(NaN), kt), role: 'label' };
  const X0 = runs[0].columns[0];
  const xName = runs.every((r) => r.columns[0].name === X0.name) ? X0.name : 'X';
  // (the values: named as asked, else by the unit the columns share)
  const units = [...new Set(ys.map((c) => unitOf(c.name)))];
  const valueName = d.valueName?.trim() || (units.length === 1 && units[0] && d.key === 'text' ? withUnit('Value', units[0]) : 'Value');
  const cols: Column[] = [keyCol, { ...column(xName, Float64Array.from(xv), xHasText ? xText : undefined), role: 'x' }, { ...column(valueName, Float64Array.from(yv)), role: 'y' }];
  if (hasErr) cols.push({ ...column(withUnit(`${bareName(valueName)} error`, unitOf(valueName)), Float64Array.from(ev)), role: 'yerr' });
  return { dataset: { name: ds.name, columns: cols }, warnings };
}

// A table made a workbook: a sheet per column (with its X and its ±Y), or a sheet per value of a column (its rows)
export function columnsToSheets(ds: Dataset, d: ToSheetsData): { book: Workbook; warnings: string[] } | string {
  const warnings: string[] = [];
  let sheets: Dataset[];
  if (d.mode === 'values') {
    if (!d.by?.trim()) return 'Choose the column whose values make the sheets.';
    const by = findColumn(ds.columns, d.by);
    if (!by) return `By: no column “${d.by}”.`;
    // (the rows of every value, in the order the values first come; an empty cell its own sheet, “(empty)”)
    const groups = new Map<string, number[]>();
    for (let i = 0; i < by.values.length; i++) {
      const t = by.text?.[i];
      const key = t !== undefined && t !== '' && !Number.isFinite(by.values[i]) ? t : Number.isFinite(by.values[i]) ? fmtNum(by.values[i]) : '(empty)';
      const g = groups.get(key);
      if (g) g.push(i);
      else groups.set(key, [i]);
    }
    sheets = [...groups].map(([key, rows]) => ({
      name: key,
      columns: ds.columns.map((c) => ({ ...c, values: Float64Array.from(rows, (i) => (i < c.values.length ? c.values[i] : NaN)), ...(c.text ? { text: rows.map((i) => c.text![i] ?? '') } : {}) })),
    }));
  } else {
    const runs = columnRuns(ds, d);
    if (typeof runs === 'string') return runs;
    sheets = runs;
  }
  if (sheets.length > MAX_SHEETS) {
    warnings.push(`${sheets.length} sheets: the first ${MAX_SHEETS} kept.`);
    sheets = sheets.slice(0, MAX_SHEETS);
  }
  // (the names of the sheets kept different: a name met twice numbered)
  const seen = new Map<string, number>();
  sheets = sheets.map((sh) => {
    const k = (seen.get(sh.name) ?? 0) + 1;
    seen.set(sh.name, k);
    return k > 1 ? { ...sh, name: `${sh.name} (${k})` } : sh;
  });
  return { book: { name: ds.name, sheets }, warnings };
}
