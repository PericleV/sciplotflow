// Batch: the steps of a group run on every file (every sheet of a workbook: several files opened together in an
// Import), one after the other, and what they give gathered. The pure part: the values read from a file's name by a
// pattern (“sample_{T}C_{t}h”), the order of the files, and the three outputs made of every file's results: a table
// with a row per file, a workbook with a sheet per file, every file's rows one under the other. The run itself is in
// evaluate.ts (it evaluates the group's graph once per file).
import { column, findColumn, roleOf, type Column, type Dataset, type Scalar, type Workbook } from './table.ts';
import { pick } from './extract.ts';
import { sourcePort } from './ports.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, GroupPort } from '../types.ts';
import type { Figure } from '../figure/spec.ts';

// The names of a group's ports: the one given by hand, else the one made; a name met twice numbered (“Smooth (2)”), as
// the results of a Batch are gathered by their names
export function portNames(ports: GroupPort[]): string[] {
  const seen = new Map<string, number>();
  return ports.map((p) => {
    const base = p.name?.trim() || p.label;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return k > 1 ? `${base} (${k})` : base;
  });
}

// pattern: “{Name}” takes a number, “{Name:text}” a word, the rest is written as in the names (empty: nothing read);
// order: the files as they come, by name (numbers in their order: run 2 before run 10), or by the first value read;
// show: the file the steps are shown on inside (its place in that order; absent: the first); own: a file's own
// settings of some steps — by the file's name, the step's id, only the settings changed (the others: the common ones)
export type BatchOwn = Record<string, Record<string, Record<string, unknown>>>;
// over 'columns': the steps run on every column of one table (not on every file) — sheet: of a workbook, by its name
// (absent: the first); cols: the columns (2-6, B-F, names, R*, !C; empty: every Y); xFrom: their X — one column for all
// (x: its name; empty: the designated X), the X on the left of each (its designations: X, Y, X, Y …), or the row number;
// long: the tables of more than one row, every file's rows one under the other (absent) or its columns side by side
// each: the steps whose changes are made for the file (or column) shown, not for all (a step with own settings of some
// file is one too); skip: by the file's (or column's) name, the steps that do not run on it
export type BatchSpec = { pattern?: string; order?: 'given' | 'name' | 'value'; show?: number; own?: BatchOwn; each?: string[]; skip?: Record<string, string[]>; over?: 'columns'; sheet?: string; cols?: string; xFrom?: 'one' | 'left' | 'row'; x?: string; long?: 'side' };
// the steps whose changes go to the file shown only: chosen so, or with own settings of some file already
export function eachSteps(spec: BatchSpec): Set<string> {
  return new Set([...(spec.each ?? []), ...Object.values(spec.own ?? {}).flatMap((o) => Object.keys(o))]);
}
// The steps without those skipped for one file (or column): a step skipped passes on what reaches it (its first input)
// on the outputs that give the same kind of data (a table to a table: Smooth, Normalize, Filter rows …); its other
// outputs give nothing (a Fit's parameters), so what is kept from them is empty for that file
export function skipSteps(nodes: AppNode[], edges: Edge[], skip: string[] | undefined): { nodes: AppNode[]; edges: Edge[] } {
  if (!skip?.length) return { nodes, edges };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kind = (id: string, handle: string | null | undefined) => {
    const n = byId.get(id);
    return !n ? null : n.type === 'groupin' ? 'dataset' : sourcePort(n, handle);
  };
  let es = edges;
  const out = nodes.map((n) => {
    if (!skip.includes(n.id) || n.type === 'groupin' || n.type === 'groupout') return n;
    const inn = es.find((e) => e.target === n.id);
    const passes = inn ? kind(inn.source, inn.sourceHandle) : null;
    es = es.flatMap((e) => {
      if (e.target === n.id) return e === inn ? [{ ...e, targetHandle: 'in' }] : [];
      if (e.source === n.id) return passes && kind(n.id, e.sourceHandle) === passes ? [{ ...e, sourceHandle: 'out' }] : [];
      return [e];
    });
    return { id: n.id, type: 'reroute', position: n.position, data: {} } as AppNode;
  });
  return { nodes: out, edges: es };
}
// the steps with a file's own settings over the common ones
export function withOwn<T extends { id: string; data: unknown }>(nodes: T[], own: Record<string, Record<string, unknown>> | undefined): T[] {
  if (!own || !Object.keys(own).length) return nodes;
  return nodes.map((n) => (own[n.id] ? ({ ...n, data: { ...(n.data as object), ...own[n.id] } } as T) : n));
}
// the own settings tidied: no step without any, no file without any (none at all: absent)
export function tidyOwn(own: BatchOwn): BatchOwn | undefined {
  const out: BatchOwn = {};
  for (const [file, steps] of Object.entries(own)) {
    const kept = Object.fromEntries(Object.entries(steps).filter(([, v]) => v && Object.keys(v).length));
    if (Object.keys(kept).length) out[file] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

// what one file gave: the values of the steps' outputs (scalars), their tables (datasets), and its errors
// (figures: the Plots kept, a figure each, for a Merge)
export type FileRun = { name: string; values: { label: string; value: number }[]; tables: { label: string; ds: Dataset }[]; errors: string[]; figures?: { label: string; fig: Figure }[] };

type Part = { name: string; text: boolean };
// the pattern as a regular expression, and the names of its parts (in order)
export function patternOf(pattern: string): { re: RegExp; parts: Part[] } | string {
  const parts: Part[] = [];
  let src = '';
  const tokens = pattern.split(/(\{[^{}]*\})/);
  for (const t of tokens) {
    const m = /^\{\s*([^:{}]+?)\s*(?::\s*(text|number)\s*)?\}$/.exec(t);
    if (m) {
      parts.push({ name: m[1], text: m[2] === 'text' });
      src += m[2] === 'text' ? '(.+?)' : '([-+]?\\d+(?:[.,]\\d+)?(?:[eE][-+]?\\d+)?)';
    } else if (/[{}]/.test(t)) return `“${t}” is not a part: write {Name} for a number, {Name:text} for a word.`;
    else src += t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (!parts.length) return 'The pattern reads nothing: put {Name} where a number is in the file names.';
  return { re: new RegExp(`^${src}$`, 'i'), parts };
}

// what a name says by the pattern (null: it does not match)
export function readName(name: string, p: { re: RegExp; parts: Part[] }): (number | string)[] | null {
  const m = p.re.exec(name.trim());
  if (!m) return null;
  return p.parts.map((q, k) => (q.text ? m[k + 1] : Number(m[k + 1].replace(',', '.'))));
}

// Names in the texts of a figure kept from a run (a legend, an axis title, a text on it, the page's name): {name} (also
// {file}, {column}) the file's or column's name, {T} … what its name says by the pattern; only the names known are
// filled, an index (C_{OX}, x^{2}) is left alone. Every other value as it was (the same objects when nothing changed).
export function fillNames<T>(o: T, vals: Record<string, string>): T {
  const keys = new Map(Object.entries(vals).map(([k, v]) => [k.toLowerCase(), v]));
  const re = /(^|[^_^\\])\{\s*([A-Za-z][\w ]*?)\s*\}/g;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes('{') ? v.replace(re, (all, pre: string, name: string) => (keys.has(name.toLowerCase()) ? pre + keys.get(name.toLowerCase()) : all)) : v;
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => {
        const y = walk(x);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      let out: Record<string, unknown> | null = null;
      for (const [k, x] of Object.entries(v)) {
        const y = walk(x);
        if (y !== x) (out ??= { ...(v as Record<string, unknown>) })[k] = y;
      }
      return out ?? v;
    }
    return v;
  };
  return walk(o) as T;
}
// the names of a run: its own (as {name}, {file}, {column}) and what it says by the pattern
export const runNames = (name: string, read: (number | string)[] | null, parts: { name: string }[]): Record<string, string> => ({ name, file: name, column: name, ...Object.fromEntries(parts.map((q, k) => [q.name, read ? String(read[k]) : ''])) });

// what a name says, written out: “T = 300, run = a”
export const readText = (read: (number | string)[] | null, parts: { name: string }[]) => (read ? parts.map((q, k) => `${q.name} = ${read[k]}`).join(', ') : '');

// a pattern guessed from the names: their numbers that differ from file to file become {V1}, {V2} … (one: {V}), the
// rest written as it is — when every name has the same shape (the same text between its numbers); null: no shape
// shared
export function guessPattern(names: string[]): string | null {
  const NUM = /[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?/g;
  const split = (s: string) => {
    const texts: string[] = [];
    const nums: string[] = [];
    let at = 0;
    for (const m of s.trim().matchAll(NUM)) {
      texts.push(s.trim().slice(at, m.index));
      nums.push(m[0]);
      at = m.index! + m[0].length;
    }
    texts.push(s.trim().slice(at));
    return { texts, nums };
  };
  const all = names.filter((n) => n.trim()).map(split);
  if (all.length < 2) return null;
  const [first] = all;
  if (!all.every((q) => q.nums.length === first.nums.length && q.texts.every((t, k) => t === first.texts[k]))) return null;
  const varies = first.nums.map((_, k) => all.some((q) => q.nums[k] !== first.nums[k]));
  const n = varies.filter(Boolean).length;
  if (!n) return null;
  let j = 0;
  let out = first.texts[0];
  first.nums.forEach((num, k) => {
    out += varies[k] ? `{${n === 1 ? 'V' : `V${++j}`}}` : num;
    out += first.texts[k + 1];
  });
  return out;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// the files in the order asked, with what their names say
export function orderFiles<T extends { name: string }>(files: T[], spec: BatchSpec): { files: T[]; read: ((number | string)[] | null)[]; parts: Part[]; warnings: string[] } {
  const warnings: string[] = [];
  const pat = spec.pattern?.trim() ? patternOf(spec.pattern.trim()) : null;
  if (typeof pat === 'string') warnings.push(pat);
  const p = pat && typeof pat !== 'string' ? pat : null;
  let rows = files.map((f) => ({ f, r: p ? readName(f.name, p) : null }));
  if (p) {
    const miss = rows.filter((x) => !x.r).map((x) => x.f.name);
    if (miss.length) warnings.push(`${miss.length} file name${miss.length > 1 ? 's do' : ' does'} not match the pattern: ${miss.slice(0, 3).join(', ')}${miss.length > 3 ? ' …' : ''}.`);
  }
  if (spec.order === 'name') rows = [...rows].sort((a, b) => natural(a.f.name, b.f.name));
  else if (spec.order === 'value' && p) {
    const key = (x: (typeof rows)[number]) => x.r?.[0];
    rows = [...rows].sort((a, b) => {
      const [u, v] = [key(a), key(b)];
      if (u === undefined || v === undefined) return u === undefined ? (v === undefined ? 0 : 1) : -1;
      return typeof u === 'number' && typeof v === 'number' ? u - v : natural(String(u), String(v));
    });
  }
  return { files: rows.map((x) => x.f), read: rows.map((x) => x.r), parts: p?.parts ?? [], warnings };
}

// a column of numbers or of words
const numCol = (name: string, v: number[]): Column => column(name, Float64Array.from(v));
const textCol = (name: string, t: string[]): Column => column(name, Float64Array.from(t, () => NaN), t);
const partCol = (q: Part, vals: (number | string | undefined)[]): Column =>
  q.text ? textCol(q.name, vals.map((v) => (v === undefined ? '' : String(v)))) : numCol(q.name, vals.map((v) => (typeof v === 'number' ? v : NaN)));

// Every file's table side by side: its columns named after the file (“Counts (sample_25C)”), each with its designation;
// one X for all when every file has the same X (as many values, equal), else every file's X before its columns
export function sideBySide(runs: { name: string; ds: Dataset | undefined }[]): Dataset | null {
  const got = runs.filter((r): r is { name: string; ds: Dataset } => !!r.ds?.columns.length);
  if (!got.length) return null;
  const xOf = (ds: Dataset) => ds.columns.findIndex((_, j) => roleOf(ds.columns, j) === 'x');
  const xs = got.map((r) => xOf(r.ds));
  const X0 = xs[0] >= 0 ? got[0].ds.columns[xs[0]] : undefined;
  const same =
    !!X0 &&
    xs.every((j, i) => {
      const X = j >= 0 ? got[i].ds.columns[j] : undefined;
      if (!X || X.values.length !== X0.values.length) return false;
      const tol = 1e-12 * Math.max(1, ...Array.from(X0.values, (v) => (Number.isFinite(v) ? Math.abs(v) : 0)));
      return X.values.every((v, k) => (Number.isNaN(v) && Number.isNaN(X0.values[k])) || Math.abs(v - X0.values[k]) <= tol);
    });
  const named = (c: Column, run: string): Column => ({ ...c, name: `${c.name} (${run})` });
  const out: Column[] = same ? [{ ...X0!, role: 'x' }] : [];
  got.forEach((r, i) => {
    r.ds.columns.forEach((c, j) => {
      if (j === xs[i] && same) return;
      out.push({ ...named(c, r.name), role: roleOf(r.ds.columns, j) });
    });
  });
  return { name: 'all files', columns: out };
}

// the three outputs: a row per file (its name, what its name says, its values, the one row of a table it gave);
// a sheet per file (and per table when the steps give several); every file's rows one under the other (of its first
// table), the file and what its name says before them — or, side, its columns side by side
// (unit: what a run is — its column in the table and the rows: File, or Column for a batch over columns)
export function gather(runs: FileRun[], read: ((number | string)[] | null)[], parts: Part[], unit = 'File', side = false): { table: Dataset; sheets: Workbook; stacked: Dataset | null } {
  const n = runs.length;
  const cols: Column[] = [textCol(unit, runs.map((r) => r.name)), ...parts.map((q, k) => partCol(q, read.map((r) => r?.[k])))];
  // the values, by their label (a file without one: empty)
  const labels = [...new Set(runs.flatMap((r) => r.values.map((v) => v.label)))];
  for (const l of labels) cols.push(numCol(l, runs.map((r) => r.values.find((v) => v.label === l)?.value ?? NaN)));
  // a table of one row: its numeric columns as values of the file
  const oneRow = new Map<string, number[]>();
  runs.forEach((r, i) => {
    for (const t of r.tables) {
      if (Math.max(0, ...t.ds.columns.map((c) => c.values.length)) !== 1) continue;
      for (const c of t.ds.columns) {
        if (c.text?.[0]?.trim() && !Number.isFinite(c.values[0])) continue;
        const key = r.tables.length > 1 ? `${t.label}: ${c.name}` : c.name;
        const v = oneRow.get(key) ?? new Array<number>(n).fill(NaN);
        v[i] = c.values[0];
        oneRow.set(key, v);
      }
    }
  });
  // (a column empty for every file says nothing: left out)
  for (const [k, v] of oneRow) if (!labels.includes(k) && v.some(Number.isFinite)) cols.push(numCol(k, v));
  const sheets: Dataset[] = runs.flatMap((r) => r.tables.map((t) => ({ name: r.tables.length > 1 ? `${r.name} · ${t.label}` : r.name, columns: t.ds.columns })));
  // stacked: the first table of every file, its columns matched by name (in the order first met)
  const firsts = runs.map((r) => r.tables[0]?.ds);
  let stacked: Dataset | null = null;
  // (side by side: only tables of more than one row; one row per file stays a row per file)
  if (side && firsts.some((ds) => Math.max(0, ...(ds?.columns.map((c) => c.values.length) ?? [0])) > 1)) stacked = sideBySide(runs.map((r, i) => ({ name: r.name, ds: firsts[i] })));
  else if (firsts.some(Boolean)) {
    const names: string[] = [];
    for (const ds of firsts) for (const c of ds?.columns ?? []) if (!names.includes(c.name)) names.push(c.name);
    const rows = firsts.map((ds) => Math.max(0, ...(ds?.columns.map((c) => c.values.length) ?? [0])));
    const total = rows.reduce((a, b) => a + b, 0);
    const rep = <T,>(f: (i: number) => T) => runs.flatMap((_, i) => Array.from({ length: rows[i] }, () => f(i)));
    const out: Column[] = [textCol(unit, rep((i) => runs[i].name)), ...parts.map((q, k) => partCol(q, rep((i) => read[i]?.[k])))];
    for (const name of names) {
      const values = new Float64Array(total).fill(NaN);
      let text: string[] | undefined;
      let at = 0;
      firsts.forEach((ds, i) => {
        const c = ds?.columns.find((q) => q.name === name);
        if (c) {
          values.set(c.values.subarray(0, rows[i]), at);
          if (c.text) {
            text ??= new Array<string>(total).fill('');
            c.text.slice(0, rows[i]).forEach((t, j) => (text![at + j] = t));
          }
        }
        at += rows[i];
      });
      const role = firsts.find((ds) => ds?.columns.some((q) => q.name === name))?.columns.find((q) => q.name === name)?.role;
      out.push({ ...column(name, values, text), ...(role ? { role } : {}) });
    }
    stacked = { name: 'all files', columns: out };
  }
  return { table: { name: 'batch', columns: cols }, sheets: { name: 'batch', sheets }, stacked };
}

// One result kept, on a port of its own (its label): a value, or a table of one row (a Fit's parameters), gives a table
// with a row per run; a longer table, every run's rows one under the other (the run and what its name says before them)
// or, side, its columns side by side; null: no run gave it
export function gatherOne(runs: FileRun[], read: ((number | string)[] | null)[], parts: Part[], label: string, unit = 'File', side = false): Dataset | null {
  const only = runs.map((r) => ({ ...r, values: r.values.filter((v) => v.label === label), tables: r.tables.filter((t) => t.label === label) }));
  if (!only.some((r) => r.values.length || r.tables.length)) return null;
  const long = only.some((r) => r.tables.some((t) => Math.max(0, ...t.ds.columns.map((c) => c.values.length)) > 1));
  const g = gather(only, read, parts, unit, side);
  return { ...(long && g.stacked ? g.stacked : g.table), name: label };
}

// a value of an output: kept as the file's value (a scalar), or its table (a dataset; a column: a table of it)
export function resultOf(label: string, v: { t: string; v: unknown } | undefined, run: FileRun) {
  if (!v) return;
  if (v.t === 'scalar') run.values.push({ label, value: (v.v as Scalar).value });
  else if (v.t === 'dataset') run.tables.push({ label, ds: v.v as Dataset });
  else if (v.t === 'column') run.tables.push({ label, ds: { name: label, columns: [v.v as Column] } });
  else if (v.t === 'figure') (run.figures ??= []).push({ label, fig: v.v as Figure });
}

// ---- Over columns: every column of a table a run of its own ----

// The runs of a Batch over the columns of a table: for every column chosen, a table of its X (designated X) and it
// (designated Y), with the ±Y designated right after it; named as the column. A list that finds nothing, an X not
// there: said.
export function columnRuns(ds: Dataset, spec: Pick<BatchSpec, 'cols' | 'xFrom' | 'x'>): Dataset[] | string {
  const cols = ds.columns;
  const names = cols.map((c) => c.name);
  const role = (j: number) => roleOf(cols, j);
  const how = spec.xFrom ?? 'one';
  // the X of all (one): chosen by its name, else the designated one, else the first column
  let xAll = -1;
  if (how === 'one') {
    xAll = spec.x?.trim() ? cols.indexOf(findColumn(cols, spec.x) as Column) : cols.findIndex((_, j) => role(j) === 'x');
    if (spec.x?.trim() && xAll < 0) return `X: no column “${spec.x}”.`;
    if (xAll < 0) xAll = 0;
  }
  let chosen: number[];
  if (spec.cols?.trim()) {
    const p = pick(spec.cols, names, true);
    if (p.missing.length) return `Columns: not found: ${p.missing.join(', ')}.`;
    chosen = p.found;
  } else chosen = cols.flatMap((_, j) => (role(j) === 'y' && j !== xAll ? [j] : []));
  chosen = chosen.filter((j) => j !== xAll);
  if (!chosen.length) return 'Columns: none to run on (write them, e.g. B-F, or designate some columns Y).';
  const rowNumber = (n: number): Column => ({ ...column('Row', Float64Array.from({ length: n }, (_, i) => i + 1)), role: 'x' });
  return chosen.map((j) => {
    const Y = cols[j];
    let X: Column;
    if (how === 'row') X = rowNumber(Y.values.length);
    else if (how === 'left') {
      let k = j - 1;
      while (k >= 0 && role(k) !== 'x') k--;
      X = k >= 0 ? cols[k] : rowNumber(Y.values.length);
    } else X = cols[xAll];
    const out: Column[] = [{ ...X, role: 'x' }, { ...Y, role: 'y' }];
    // (its error, designated ±Y right after it, goes with it)
    if (role(j + 1) === 'yerr' && !chosen.includes(j + 1)) out.push({ ...cols[j + 1], role: 'yerr' });
    return { name: Y.name, columns: out };
  });
}
