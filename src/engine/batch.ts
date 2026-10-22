// Batch: the steps of a group run on every file (every sheet of a workbook: several files opened together in an
// Import), one after the other, and what they give gathered. The pure part: the values read from a file's name by a
// pattern (“sample_{T}C_{t}h”), the order of the files, and the three outputs made of every file's results: a table
// with a row per file, a workbook with a sheet per file, every file's rows one under the other. The run itself is in
// evaluate.ts (it evaluates the group's graph once per file).
import { column, type Column, type Dataset, type Scalar, type Workbook } from './table.ts';

// pattern: “{Name}” takes a number, “{Name:text}” a word, the rest is written as in the names (empty: nothing read);
// order: the files as they come, by name (numbers in their order: run 2 before run 10), or by the first value read;
// show: the file the steps are shown on inside (its place in that order; absent: the first); own: a file's own
// settings of some steps — by the file's name, the step's id, only the settings changed (the others: the common ones)
export type BatchOwn = Record<string, Record<string, Record<string, unknown>>>;
export type BatchSpec = { pattern?: string; order?: 'given' | 'name' | 'value'; show?: number; own?: BatchOwn };
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
export type FileRun = { name: string; values: { label: string; value: number }[]; tables: { label: string; ds: Dataset }[]; errors: string[] };

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

// the three outputs: a row per file (its name, what its name says, its values, the one row of a table it gave);
// a sheet per file (and per table when the steps give several); every file's rows one under the other (of its first
// table), the file and what its name says before them
export function gather(runs: FileRun[], read: ((number | string)[] | null)[], parts: Part[]): { table: Dataset; sheets: Workbook; stacked: Dataset | null } {
  const n = runs.length;
  const cols: Column[] = [textCol('File', runs.map((r) => r.name)), ...parts.map((q, k) => partCol(q, read.map((r) => r?.[k])))];
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
  if (firsts.some(Boolean)) {
    const names: string[] = [];
    for (const ds of firsts) for (const c of ds?.columns ?? []) if (!names.includes(c.name)) names.push(c.name);
    const rows = firsts.map((ds) => Math.max(0, ...(ds?.columns.map((c) => c.values.length) ?? [0])));
    const total = rows.reduce((a, b) => a + b, 0);
    const rep = <T,>(f: (i: number) => T) => runs.flatMap((_, i) => Array.from({ length: rows[i] }, () => f(i)));
    const out: Column[] = [textCol('File', rep((i) => runs[i].name)), ...parts.map((q, k) => partCol(q, rep((i) => read[i]?.[k])))];
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

// a value of an output: kept as the file's value (a scalar), or its table (a dataset; a column: a table of it)
export function resultOf(label: string, v: { t: string; v: unknown } | undefined, run: FileRun) {
  if (!v) return;
  if (v.t === 'scalar') run.values.push({ label, value: (v.v as Scalar).value });
  else if (v.t === 'dataset') run.tables.push({ label, ds: v.v as Dataset });
  else if (v.t === 'column') run.tables.push({ label, ds: { name: label, columns: [v.v as Column] } });
}
