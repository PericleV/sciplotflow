// Columns: the columns of a dataset renamed, designated, left out
// and put in another order — by hand, column by column, kept by the column's name (a file read again with the same
// columns keeps them) —, every name changed at once (find / replace, a prefix, a suffix), the names taken from a row of
// the data or from the values of a column; columns added (a formula of the others, a value, a copy); and the names as a
// column of their own. Pure.
//
// A formula names a column of the data by its name as it comes in ([Wavelength (nm)]), a column added here by its id
// ([=c1]) and an input of the node by its letter ({A}); a column written by its letter in the list (A, B … as in a
// spreadsheet) is kept as [@its key]: renaming or moving a column in the node changes only how the formula is shown
// (formulaShown / formulaStored translate), never what it computes.
import { compile } from './expr.ts';
import { pick } from './extract.ts';
import { isCol, withColumnFunctions } from './colfns.ts';
import { GEN_SPEC_DEFAULTS, generatedValues, type GenSpec } from './gencol.ts';
import { roleOf, type Column, type ColumnRole, type Dataset, type Scalar } from './table.ts';

// one column's own settings: by its name (after the names row; a column added: '=' and its id): its new name,
// designation, kept or not
export type ColumnItem = { from: string; name?: string; role?: ColumnRole; keep?: boolean };
// a column added: a formula, one value in every row, a column of an input or a copy of one ([name], [=id], {A}; its
// name, when it has none of its own), or generated (as Generate column, as many rows as the data); its place: its item's
export type ComputedKind = 'formula' | 'value' | 'copy' | 'generate';
export type ComputedColumn = { id: string; name: string; kind?: ComputedKind; formula?: string; value?: number; copy?: string; gen?: Partial<GenSpec> };
// the names of columns from the values of a column ([name] of the data or {A}), in order: of all the others, the Y
// columns, or a list (2-4, B-D, names); the column itself left out of the data when drop
export type NamesFrom = { col: string; to?: 'others' | 'y' | 'list'; list?: string; drop?: boolean };
export type ColumnsSpec = {
  items?: ColumnItem[]; // in the order wanted (the columns not listed after them, in their order)
  // several names changed at once: the columns they apply to (all, the Y columns, a list — 2-4, B-D, names —, those
  // ticked: their names), a list of new names given to them in order, then replace, before, after
  renameOn?: 'all' | 'y' | 'list' | 'ticked';
  renameList?: string;
  renamePick?: string[];
  names?: string;
  find?: string;
  replace?: string;
  prefix?: string;
  suffix?: string;
  namesRow?: number; // 1 … n: this row gives the names (and is taken out of the data); 0 / absent: none
  namesFrom?: NamesFrom;
  computed?: ComputedColumn[]; // computed in this order (a formula may use those above it)
};
// every column as it comes out: its key (its name in, after the names row; a column added: '=' and its id), its name
// out, designation, kept, rows
// input: a column connected to a port A, B … (its key {A}): a column of its own, at the end unless moved
export type ColumnLine = { from: string; name: string; auto: string; role: ColumnRole; keep: boolean; rows: number; computed?: boolean; input?: boolean };
export type ColumnsResult = { dataset: Dataset; names: Column; lines: ColumnLine[]; warnings: string[] };
export type Inputs = Record<string, Column | Scalar>;

// a cell as text (a number as written, else the text)
const cellOf = (c: Column, i: number) => {
  const t = c.text?.[i]?.trim();
  if (t) return t;
  const v = c.values[i];
  return Number.isFinite(v) ? String(v) : '';
};

// ---- the references of a formula: [key] a column of the data or added (=id), [@key] the same written by its letter,
// {A} an input ----
const REF = /\[([^\]]+)\]|\{([A-Z]{1,2})\}/g;
// a column's letter in the list (A … Z, AA …), by its place
export const lineLetter = (k: number) => (k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(64 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26)));
// the references and the bare letters of a formula as written (a [ not closed yet, being typed: left as it is)
const SHOWN = /\[([^\]]+)\]|\[[^\]]*$|\{[A-Z]{1,2}\}|\b([A-Z]{1,2})\b(?!\s*\()/g;
// the formula as stored, shown with the names the columns have now (a column kept by its letter: its letter now)
export function formulaShown(stored: string, lines: Pick<ColumnLine, 'from' | 'name'>[]): string {
  return stored.replace(REF, (whole, key: string | undefined) => {
    if (key === undefined) return whole;
    if (key.startsWith('@')) {
      const k = lines.findIndex((l) => l.from === key.slice(1));
      // its column gone: shown by the name it had
      return k >= 0 ? lineLetter(k) : `[${key.slice(1)}]`;
    }
    const L = lines.find((l) => l.from === key);
    return L ? `[${L.name}]` : whole;
  });
}
// the formula as written (the names and letters shown) stored by the columns' keys: a name out first, else a name in;
// a letter of the list as [@key]
export function formulaStored(shown: string, lines: Pick<ColumnLine, 'from' | 'name'>[]): string {
  return shown.replace(SHOWN, (whole, name: string | undefined, letter: string | undefined) => {
    if (letter !== undefined) {
      const L = lines.find((_, k) => lineLetter(k) === letter);
      return L ? `[@${L.from}]` : whole;
    }
    if (name === undefined) return whole;
    const L = lines.find((l) => l.name === name) ?? lines.find((l) => l.from === name);
    return L ? `[${L.from}]` : whole;
  });
}

// a column added, of `rows` rows (those of its columns, else of the data): its values, or why not
function computeColumn(c: ComputedColumn, get: (ref: string) => Column | Scalar | null, rows: number): Column | string {
  const kind = c.kind ?? 'formula';
  const name = c.name.trim() || 'Column';
  if (kind === 'value') return { name, values: new Float64Array(rows).fill(Number.isFinite(c.value) ? c.value! : NaN) };
  if (kind === 'generate') {
    if (rows < 1) return 'the data have no rows';
    const v = generatedValues({ ...GEN_SPEC_DEFAULTS, ...c.gen }, rows);
    return typeof v === 'string' ? v : { name, values: v };
  }
  if (kind === 'copy') {
    const src = c.copy ? get(c.copy) : null;
    if (!src) return c.copy ? `no column ${c.copy}` : 'choose the column';
    const named = c.name.trim() || src.name;
    if (!isCol(src)) return { name: named, values: new Float64Array(rows).fill(src.value) };
    const { key: _k, role: _r, ...rest } = src;
    return { ...rest, name: named, values: Float64Array.from(src.values), ...(src.text ? { text: [...src.text] } : {}) };
  }
  const src = (c.formula ?? '').trim();
  if (!src) return 'write a formula, e.g. B / C * 100';
  // every reference a letter of its own (A, B …), then the functions of whole columns, compiled
  const refs = new Map<string, string>();
  const vals: Inputs = {};
  let missing = '';
  // a letter not met in the list stays as it is (unknown): the references take the other letters
  const bare = new Set([...src.replace(REF, ' ').matchAll(/\b[A-Z]{1,2}\b/g)].map((m) => m[0]));
  let next = 0;
  const free = () => {
    while (bare.has(lineLetter(next))) next++;
    return lineLetter(next++);
  };
  const text = src.replace(REF, (whole) => {
    if (!refs.has(whole)) {
      const v = get(whole);
      if (!v) missing ||= whole.startsWith('[@') ? `[${whole.slice(2)}` : whole;
      const x = free();
      refs.set(whole, x);
      if (v) vals[x] = v;
    }
    return refs.get(whole)!;
  });
  if (missing) return `no column ${missing}`;
  const f = compile(withColumnFunctions(text, vals));
  if (typeof f === 'string') return f;
  const bad = f.names.filter((x) => !(x in vals) && x !== 'i' && x !== 'n');
  if (bad.length) return `unknown name${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: write a column as its letter (A, B …) or [its name], an input as {A}`;
  const cols = f.names.filter((x) => x in vals && isCol(vals[x])).map((x) => [x, (vals[x] as Column).values] as const);
  const n = cols.length ? Math.max(...cols.map(([, a]) => a.length)) : rows;
  const v: Record<string, number> = { n };
  for (const x of f.names) if (x in vals && !isCol(vals[x])) v[x] = (vals[x] as Scalar).value;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v.i = i + 1;
    for (const [x, a] of cols) v[x] = i < a.length ? a[i] : NaN;
    out[i] = f.fn(v);
  }
  return { name, values: out };
}

// A list of names: one per line, else separated by ; or , (a name with a comma in it: one per line)
export function nameList(t: string): string[] {
  const sep = t.includes('\n') ? '\n' : t.includes(';') ? ';' : ',';
  return t
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function columnsOf(ds: Dataset, s: ColumnsSpec, inputs: Inputs = {}): ColumnsResult | string {
  const warnings: string[] = [];
  let cols = ds.columns;
  // the names from a row: the row taken out of every column
  const k = Math.floor(s.namesRow ?? 0);
  if (k >= 1) {
    const n = Math.max(0, ...cols.map((c) => c.values.length));
    if (k > n) return `Names from row ${k}: the data have ${n} rows.`;
    const i = k - 1;
    // the rows but the names row
    const keepRows = (len: number) => Array.from({ length: len }, (_, r) => r).filter((r) => r !== i);
    cols = cols.map((c): Column => {
      const rs = keepRows(c.values.length);
      const values = Float64Array.from(rs, (r) => c.values[r]);
      const text = c.text ? rs.map((r) => c.text![r] ?? '') : undefined;
      // a column that was text only for its header is numbers now
      const numbers = !text || text.every((t, r) => !t.trim() || Number.isFinite(values[r]));
      const { text: _t, mask: _m, ...rest } = c;
      return { ...rest, name: cellOf(c, i) || c.name, values, ...(numbers ? {} : { text }), ...(c.mask ? { mask: Uint8Array.from(rs, (r) => c.mask![r]) } : {}) };
    });
  }
  const dataCount = cols.length;
  const rows = Math.max(0, ...cols.map((c) => c.values.length));
  // the columns by key: those of the data by name, those added by '=' and their id, the inputs by {letter}
  const byKey = new Map<string, Column | Scalar>();
  cols.forEach((c) => !byKey.has(c.name) && byKey.set(c.name, c));
  const get = (ref: string): Column | Scalar | null => {
    const m = /^\[([^\]]+)\]$|^\{([A-Z]{1,2})\}$/.exec(ref.trim());
    if (!m) return null;
    if (m[2] !== undefined) return inputs[m[2]] ?? null;
    // by its letter: [@key]
    return byKey.get(m[1]) ?? (m[1].startsWith('@') ? byKey.get(m[1].slice(1)) : undefined) ?? null;
  };
  // the columns added, in their order
  const added: Column[] = [];
  for (const c of s.computed ?? []) {
    const r = computeColumn(c, get, rows);
    const col = typeof r === 'string' ? { name: c.name.trim() || 'Column', values: new Float64Array(rows).fill(NaN) } : r;
    if (typeof r === 'string') warnings.push(`“${col.name}”: ${r}.`);
    byKey.set(`=${c.id}`, col);
    added.push(col);
  }
  // the columns on the ports A, B … (not copied by a column added): columns of their own
  const copied = new Set((s.computed ?? []).flatMap((c) => (c.kind === 'copy' && c.copy ? [c.copy.trim()] : [])));
  const fromInputs = Object.entries(inputs).flatMap(([letter, v]): [string, Column][] => {
    if (!isCol(v) || copied.has(`{${letter}}`)) return [];
    const r = computeColumn({ id: letter, name: '', kind: 'copy', copy: `{${letter}}` }, get, rows);
    return typeof r === 'string' ? [] : [[`{${letter}}`, r]];
  });
  const addedEnd = dataCount + added.length;
  const keys = [...cols.map((c) => c.name), ...(s.computed ?? []).map((c) => `=${c.id}`), ...fromInputs.map(([k]) => k)];
  const all = [...cols, ...added, ...fromInputs.map(([, c]) => c)];
  // the names from a column: its values given in order to the columns chosen
  const given = new Map<number, string>();
  let dropped = -1;
  if (s.namesFrom?.col) {
    const nf = s.namesFrom;
    const src = get(nf.col);
    if (!src || !isCol(src)) warnings.push(`Names from a column: no column ${nf.col}.`);
    else {
      const self = cols.indexOf(src as Column);
      if (nf.drop && self >= 0) dropped = self;
      const values = Array.from({ length: src.values.length }, (_, i) => cellOf(src, i)).filter(Boolean);
      let targets: number[];
      if (nf.to === 'list') {
        const p = pick(nf.list ?? '', cols.map((c) => c.name), true);
        if (p.missing.length) warnings.push(`Names from a column: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the data.`);
        targets = p.found;
      } else targets = cols.map((_, j) => j).filter((j) => j !== self && (nf.to !== 'y' || roleOf(cols, j) === 'y'));
      targets.forEach((j, q) => q < values.length && given.set(j, values[q]));
      if (values.length !== targets.length) warnings.push(`Names from a column: ${values.length} name${values.length === 1 ? '' : 's'} for ${targets.length} column${targets.length === 1 ? '' : 's'}${values.length < targets.length ? ' (the others keep theirs)' : ''}.`);
    }
  }
  // several names changed at once (the columns of the data chosen): a name from the list, then replace, before, after
  const on = s.renameOn ?? 'all';
  let chosen: number[];
  if (on === 'list') {
    const p = pick(s.renameList ?? '', cols.map((c) => c.name), true);
    if (p.missing.length) warnings.push(`Rename: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the data.`);
    chosen = p.found;
  } else if (on === 'ticked') chosen = cols.map((_, j) => j).filter((j) => (s.renamePick ?? []).includes(cols[j].name));
  else chosen = cols.map((_, j) => j).filter((j) => on !== 'y' || roleOf(cols, j) === 'y');
  const target = new Set(chosen);
  const listNames = nameList(s.names ?? '');
  const fromList = new Map<number, string>();
  const auto = (name: string, j: number) => {
    if (!target.has(j)) return name;
    let t = fromList.get(j) ?? name;
    if (s.find) t = t.split(s.find).join(s.replace ?? '');
    return `${s.prefix ?? ''}${t}${s.suffix ?? ''}`;
  };
  // the order: the columns listed, then the others
  const items = s.items ?? [];
  const index = new Map(keys.map((key, j) => [key, j]));
  const listed = items.filter((it) => index.has(it.from));
  const missing = items.filter((it) => !index.has(it.from) && !it.from.startsWith('=') && !it.from.startsWith('{') && (it.name !== undefined || it.role || it.keep === false));
  if (missing.length) warnings.push(`Not in the data: ${missing.map((it) => `“${it.from}”`).join(', ')} (its settings kept).`);
  const seen = new Set<number>();
  const order: number[] = [];
  for (const it of listed) {
    const j = index.get(it.from)!;
    if (seen.has(j)) continue;
    seen.add(j);
    order.push(j);
  }
  keys.forEach((_, j) => !seen.has(j) && order.push(j));
  const own = new Map(items.map((it) => [it.from, it]));
  // the names of the list: to the columns chosen, in the order shown
  const inOrder = order.filter((j) => target.has(j));
  inOrder.forEach((j, q) => q < listNames.length && fromList.set(j, listNames[q]));
  if (listNames.length && listNames.length !== inOrder.length) warnings.push(`Rename: ${listNames.length} name${listNames.length === 1 ? '' : 's'} for ${inOrder.length} column${inOrder.length === 1 ? '' : 's'}${listNames.length < inOrder.length ? ' (the others keep theirs)' : ''}.`);
  const lines: ColumnLine[] = order.map((j) => {
    const c = all[j];
    const key = keys[j];
    const it = own.get(key);
    const computed = j >= dataCount && j < addedEnd;
    const input = j >= addedEnd;
    const a = computed || input ? c.name : auto(given.get(j) ?? c.name, j);
    const role = it?.role ?? (computed || input ? 'y' : roleOf(cols, j));
    return { from: key, name: it?.name?.trim() || a, auto: a, role, keep: it?.keep !== undefined ? it.keep !== false : j !== dropped, rows: c.values.length, ...(computed ? { computed: true } : {}), ...(input ? { input: true } : {}) };
  });
  // the names kept different (a Plot takes its columns by name)
  const used = new Map<string, number>();
  const out: Column[] = [];
  for (const [q, L] of lines.entries()) {
    if (!L.keep) continue;
    let name = L.name;
    const times = used.get(name) ?? 0;
    used.set(name, times + 1);
    if (times) name = `${name} (${times + 1})`;
    out.push({ ...all[order[q]], name, role: L.role });
  }
  if (!out.length) warnings.push('Every column is left out.');
  // the names as a column (the values: the blocks' values, when the columns have them)
  const names: Column = { name: 'Column', values: Float64Array.from(out, (c) => c.key?.value ?? NaN), text: out.map((c) => c.name), role: 'label' };
  return { dataset: { name: ds.name, columns: out }, names, lines, warnings };
}
