// Reshaping tables: one long table cut into blocks laid side by side (Split into columns: wl, n then wl, k under it → wl, n, k), and columns or datasets put one under the other (Combine columns —
// “Stack Columns”: after, before, inserted at a row, interleaved, or sorted by X).
import { pick } from './extract.ts';
import { restarts, splitRows, takeRows } from './split.ts';
import { column, fmtNum, roleOf, valueText, type Column, type ColumnRole, type Dataset } from './table.ts';
import { maxOf } from './minmax.ts';

// ---- Split into columns ----

export type BlockMode = 'auto' | 'text' | 'restart' | 'column' | 'repeat' | 'every' | 'cycles' | 'direction';
export type UnstackSpec = {
  x: string; // the X column ('' = the designated X)
  ys: string; // the columns cut into blocks: a list (2, B-D, names, A*; '' = all the others but the group column)
  by: BlockMode;
  column?: string; // by: the column whose equal values make one block
  every?: number; // every: rows per block
  names: string; // the names of the new columns, in order ("n, k"; '' or a missing one = automatic)
  xs: 'first' | 'each'; // only the X of the first block, or the X of every block before its columns
};
export type BlockInfo = { name: string; rows: number; first: number; last: number; x0: number; x1: number };
export type UnstackResult = { dataset: Dataset; values: Column; blocks: BlockInfo[]; how: string; warnings: string[] };

const finite = (c: Column, i: number) => Number.isFinite(c.values[i]);
const cellOf = (c: Column, i: number) => (c.text && !finite(c, i) ? (c.text[i] ?? '').trim() : '');

// Blocks cut at the rows whose X is not a number (a header written again in the middle: “wl,k”, or an empty line).
// head: the text of each block's header row in every column (the first block: none)
function textBlocks(X: Column, n: number): { rows: number[][]; head: (number | null)[] } | null {
  const rows: number[][] = [];
  const head: (number | null)[] = [];
  let cur: number[] = [];
  let sep: number | null = null;
  for (let i = 0; i < n; i++) {
    if (finite(X, i)) {
      if (!cur.length) head.push(rows.length ? sep : null);
      cur.push(i);
    } else if (cur.length) {
      rows.push(cur);
      cur = [];
      sep = i;
    } else if (rows.length && cellOf(X, i)) sep = i; // several separator lines (an empty one, then “wl,k”): the one with text
  }
  if (cur.length) rows.push(cur);
  return rows.length > 1 ? { rows, head: head.slice(0, rows.length) } : null;
}

// Names made unique: a second “wl” becomes “wl_2”.
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((nm) => {
    const k = (seen.get(nm) ?? 0) + 1;
    seen.set(nm, k);
    let out = k === 1 ? nm : `${nm}_${k}`;
    while (k > 1 && names.includes(out)) out += '_';
    return out;
  });
}

// The first row (1 …) where two X differ over the rows they both have, −1 when they agree (a block a row longer than
// another, e.g. the last cycle of a scan ending on its first point, still agrees).
const sameX = (a: Column, b: Column) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a.values) if (Number.isFinite(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  const tol = 1e-9 * (hi - lo || 1);
  const n = Math.min(a.values.length, b.values.length);
  for (let i = 0; i < n; i++) if (!(Math.abs(a.values[i] - b.values[i]) <= tol) && !(Number.isNaN(a.values[i]) && Number.isNaN(b.values[i]))) return i + 1;
  return -1;
};

// A column of labels in runs (S1, S1 … S2, S2 …): text and no numbers, two labels or more, every one in a single run of
// more than one row (empty cells skipped) — the blocks of a table written one under another.
export function labelRuns(c: Column): boolean {
  if (!c.text || c.values.some(Number.isFinite)) return false;
  const seen = new Set<string>();
  let prev = '';
  let rows = 0;
  for (const raw of c.text) {
    const t = (raw ?? '').trim();
    if (!t) continue;
    rows++;
    if (t === prev) continue;
    if (seen.has(t)) return false;
    seen.add(t);
    prev = t;
  }
  return seen.size >= 2 && rows > seen.size;
}

// A column padded with empty rows to `n` rows.
function padded(c: Column, n: number): Column {
  if (c.values.length === n) return c;
  const values = new Float64Array(n).fill(NaN);
  values.set(c.values.subarray(0, n));
  const mask = c.mask ? new Uint8Array(n) : undefined;
  if (mask && c.mask) mask.set(c.mask.subarray(0, n));
  return { ...c, values, ...(c.text ? { text: Array.from({ length: n }, (_, i) => c.text![i] ?? '') } : {}), ...(mask ? { mask } : {}) };
}

export function unstack(ds: Dataset, s: UnstackSpec): UnstackResult | string {
  const cols = ds.columns;
  if (!cols.length) return 'The dataset has no columns.';
  let xi = s.x ? cols.findIndex((c) => c.name === s.x) : Math.max(0, cols.findIndex((_, j) => roleOf(cols, j) === 'x'));
  if (xi < 0) return `No column “${s.x}” in the dataset.`;
  let X = cols[xi];
  // auto: a column of labels in runs (S1, S1 … S2, S2 …) makes the blocks; X itself such labels: the blocks are its
  // labels, the X of the curves the first column with numbers
  let labels: Column | undefined;
  let note = '';
  if (s.by === 'auto') {
    if (labelRuns(X)) {
      const nx = cols.find((c, j) => c !== X && roleOf(cols, j) === 'x' && c.values.some(Number.isFinite)) ?? cols.find((c) => c !== X && c.values.some(Number.isFinite));
      if (nx) {
        labels = X;
        note = `; X: ${nx.name} (${X.name} holds labels)`;
        X = nx;
        xi = cols.indexOf(nx);
      }
    } else labels = cols.find((c, j) => c !== X && roleOf(cols, j) !== 'x' && labelRuns(c));
  }
  const groupCol = s.by === 'column' ? cols.find((c) => c.name === s.column) : labels;
  if (s.by === 'column' && !groupCol) return s.column ? `No column “${s.column}” in the dataset.` : 'Choose the column whose equal values make one block.';
  const names = cols.map((c) => c.name);
  let yIdx: number[];
  if (s.ys.trim()) {
    const p = pick(s.ys, names, true);
    if (p.missing.length) return `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
    yIdx = p.found.filter((j) => j !== xi);
  } else yIdx = cols.map((_, j) => j).filter((j) => j !== xi && cols[j] !== groupCol && roleOf(cols, j) !== 'none' && roleOf(cols, j) !== 'x');
  if (!yIdx.length) return 'Choose the columns to cut into blocks (the dataset has only its X).';
  let Ys = yIdx.map((j) => cols[j]);
  const n = Math.max(X.values.length, maxOf(Ys.map((c) => c.values.length)));

  // the blocks
  let rows: number[][] | null = null;
  let head: (number | null)[] = [];
  let values: number[] = [];
  let texts: string[] | undefined;
  let vName = '';
  let word = ''; // blocks without a name: “cycle 2”
  let how = '';
  const numbered = (r: number[][]) => r.map((_, k) => k + 1);
  if (labels) {
    const g = splitRows({ mode: 'column' }, X, Array.from({ length: n }, (_, i) => i), labels, []);
    if (typeof g === 'string') return g;
    if (g) [rows, values, texts, vName, how] = [g.rows, g.values, g.texts, g.name, `by the labels of ${labels.name}${note}`];
  }
  if (!rows && (s.by === 'auto' || s.by === 'text')) {
    const t = textBlocks(X, n);
    if (t) {
      [rows, head, values, how] = [t.rows, t.head, numbered(t.rows), `at the lines where ${X.name || 'X'} is not a number`];
    } else if (s.by === 'text') return `No line in the middle where ${X.name || 'X'} is not a number (a header written again, an empty line).`;
  }
  const valid = Array.from({ length: n }, (_, i) => i).filter((i) => finite(X, i));
  if (!rows && (s.by === 'auto' || s.by === 'restart')) {
    const r = restarts(X.values, valid);
    if (r) [rows, values, how] = [r, numbered(r), `where ${X.name || 'X'} starts again`];
    else if (s.by === 'restart') return `${X.name || 'X'} never starts again: one block.`;
  }
  if (!rows && s.by !== 'auto' && s.by !== 'text' && s.by !== 'restart') {
    const g = splitRows({ mode: s.by, every: s.every }, X, s.by === 'column' ? Array.from({ length: n }, (_, i) => i) : valid, groupCol, cols.filter((c) => !Ys.includes(c)));
    if (typeof g === 'string') return g;
    if (g) [rows, values, texts, vName, word, how] = [g.rows, g.values, g.texts, g.name, g.word ?? '', g.how];
  }
  if (!rows) return X.values.some(Number.isFinite) ? `No blocks found (no line where ${X.name || 'X'} is not a number, ${X.name || 'X'} never starts again, no column of labels): choose how the blocks are found — Blocks ▸ by a column, every N rows …` : `${X.name || 'X'} has no numbers (labels?): choose a column with numbers as X, and Blocks ▸ by a column (${X.name || 'X'}).`;
  // a map in long form (X, a swept value, Z: 500 sweeps and more) splits too; very many columns are still refused
  if (rows.length > 20000) return `${rows.length} blocks found (${how}): too many columns (at most 20 000).`;
  const R: number[][] = rows;
  // a column with one value in every block, not the same in all: the swept parameter
  const constantIn = (c: Column): number[] | null => {
    const v: number[] = R.map((r) => c.values[r[0]]);
    return v.every(Number.isFinite) && R.every((r, k) => r.every((i) => c.values[i] === v[k])) && new Set(v).size > 1 ? v : null;
  };
  if (!head.length) {
    // the columns not chosen by hand: the swept parameter is not cut into blocks (it names them)
    const swept = s.ys.trim() ? [] : Ys.filter((c) => constantIn(c));
    if (swept.length && swept.length < Ys.length) Ys = Ys.filter((c) => !swept.includes(c));
    if (!vName)
      for (const c of [...swept, ...cols.filter((x) => x !== X && !Ys.includes(x))]) {
        const v = constantIn(c);
        if (v) {
          [values, vName] = [v, c.name];
          break;
        }
      }
  }
  const blockText = (k: number) => texts?.[k] ?? fmtNum(values[k], 4);

  // the new columns: X (once, or before each block) and every Y of every block
  const own = s.names
    .split(',')
    .map((t) => t.trim());
  let o = 0;
  const out: Column[] = [];
  const roles: ColumnRole[] = [];
  const warnings: string[] = [];
  // only the first X: the longest block's (a block may have a row more, as the last cycle of a scan)
  const longest = rows.reduce((a, r, k) => (r.length > rows![a].length ? k : a), 0);
  const refX = takeRows(X, rows[longest]);
  const blocks: BlockInfo[] = [];
  rows.forEach((r, k) => {
    const bx = takeRows(X, r);
    const h = head[k];
    if (s.xs === 'each' || k === 0) {
      const xName = k === 0 ? X.name : (h !== null && h !== undefined && cellOf(X, h)) || X.name;
      out.push({ ...(s.xs === 'each' ? bx : refX), name: xName });
      roles.push('x');
    }
    if (s.xs !== 'each' && k !== longest) {
      const d = sameX(refX, bx);
      if (d !== -1) warnings.push(`Block ${k + 1}: its ${X.name || 'X'} differs from block ${longest + 1} (row ${d}: ${fmtNum(bx.values[d - 1])}, block ${longest + 1} ${fmtNum(refX.values[d - 1])}) — X out ▸ “an X before every block” keeps each one.`);
    }
    Ys.forEach((Y) => {
      const fromHead = h !== null && h !== undefined ? cellOf(Y, h) : '';
      // “Current (mA) · cycle 2”, “R · cavity d = 150 nm” (no comma: lists of columns are cut at commas)
      const auto = word ? `${Y.name} · ${word} ${k + 1}` : k === 0 && !vName && !texts ? Y.name : fromHead || (vName || texts ? `${Y.name} · ${vName ? valueText(vName, blockText(k), !!texts) : blockText(k)}` : `${Y.name}_${k + 1}`);
      const nm = own[o++] || auto;
      const c = takeRows(Y, r);
      // the block's value travels with its column (the swept parameter, the cycle, the segment)
      const key = vName || word ? { name: vName || word, value: values[k] } : head.length ? undefined : { name: 'block', value: k + 1 };
      out.push({ ...c, name: nm, ...(key ? { key } : {}) });
      const role = Y.role && Y.role !== 'x' && Y.role !== 'none' ? Y.role : 'y';
      roles.push(role);
    });
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const v of bx.values) if (Number.isFinite(v)) [x0, x1] = [Math.min(x0, v), Math.max(x1, v)];
    blocks.push({ name: out[out.length - Ys.length].name, rows: r.length, first: r[0] + 1, last: r[r.length - 1] + 1, x0, x1 });
  });
  if (rows.length > 500) warnings.push(`${rows.length} blocks: ${rows.length} columns — a map of them (Contour / heatmap ▸ a matrix, or its X, Y, Z columns directly) draws faster than as many curves.`);
  if (own.filter(Boolean).length > o) warnings.push(`Names: ${own.filter(Boolean).length} given, ${o} new columns.`);
  const len = maxOf(out.map((c) => c.values.length));
  const unique = uniqueNames(out.map((c) => c.name));
  const columns = out.map((c, k) => ({ ...padded(c, len), name: unique[k], role: roles[k] }));
  const vals = column(vName || word || 'block', Float64Array.from(values), texts);
  return { dataset: { name: ds.name, columns }, values: vals, blocks, how, warnings };
}

// ---- Combine columns ----

export type CombineHow = 'after' | 'before' | 'insert' | 'interleave' | 'sortx';
export type CombineSpec = {
  how: CombineHow;
  at: number; // insert: the next inputs go after this row of the first one (0 = before it)
  match: 'name' | 'position'; // datasets: columns matched by their name or their place
  x: string; // sortx: the X column of the datasets ('' = the designated one)
  dup: 'all' | 'mean' | 'first'; // sortx: rows with the same X — all kept, their mean, the first one
};
export type CombineResult = { dataset: Dataset; source: Column; warnings: string[] };

// A row of an input: which input (k) and which row (i); null = an empty cell (a column missing in that input).
type Ref = { k: number; i: number };

function gather(c: Column | undefined, refs: Ref[], k: number): { values: Float64Array; text?: string[]; mask?: Uint8Array } {
  const values = new Float64Array(refs.length);
  const anyText = !!c?.text;
  const text = anyText ? new Array<string>(refs.length).fill('') : undefined;
  const mask = c?.mask ? new Uint8Array(refs.length) : undefined;
  refs.forEach((r, j) => {
    if (r.k !== k || !c) return;
    values[j] = r.i < c.values.length ? c.values[r.i] : NaN;
    if (text && c.text) text[j] = c.text[r.i] ?? '';
    if (mask && c.mask) mask[j] = c.mask[r.i] ?? 0;
  });
  return { values, ...(text ? { text } : {}), ...(mask ? { mask } : {}) };
}

// inputs: in the order of their ports (a column is a dataset of one column); names: of the inputs, for the source
export function combine(inputs: Dataset[], s: CombineSpec): CombineResult | string {
  if (!inputs.length) return 'Connect columns or datasets to A, B, C …';
  const warnings: string[] = [];
  const lens = inputs.map((d) => Math.max(0, maxOf(d.columns.map((c) => c.values.length))));
  // the columns of the result: by name (all names, in the order first met) or by place
  type Slot = { name: string; role?: ColumnRole; from: (Column | undefined)[] };
  const slots: Slot[] = [];
  if (s.match === 'name') {
    for (const d of inputs)
      for (const c of d.columns) if (!slots.some((x) => x.name === c.name)) slots.push({ name: c.name, ...(c.role ? { role: c.role } : {}), from: [] });
    for (const sl of slots) sl.from = inputs.map((d) => d.columns.find((c) => c.name === sl.name));
    if (inputs.length > 1 && slots.some((sl) => sl.from.some((c) => !c)))
      warnings.push(`Not every input has the columns ${slots.filter((sl) => sl.from.some((c) => !c)).map((sl) => `“${sl.name}”`).join(', ')}: empty cells there (or match the columns by position).`);
  } else {
    const m = maxOf(inputs.map((d) => d.columns.length));
    for (let j = 0; j < m; j++) {
      const c0 = inputs.map((d) => d.columns[j]).find(Boolean)!;
      slots.push({ name: c0.name, ...(c0.role ? { role: c0.role } : {}), from: inputs.map((d) => d.columns[j]) });
    }
    if (new Set(inputs.map((d) => d.columns.length)).size > 1) warnings.push(`The inputs have ${inputs.map((d) => d.columns.length).join(', ')} columns: empty cells where one is missing.`);
  }

  // the order of the rows
  const seq = (k: number) => Array.from({ length: lens[k] }, (_, i) => ({ k, i }));
  let refs: Ref[] = [];
  if (s.how === 'after' || s.how === 'sortx') refs = inputs.flatMap((_, k) => seq(k));
  else if (s.how === 'before') refs = inputs.map((_, k) => seq(k)).reverse().flat();
  else if (s.how === 'insert') {
    const at = Math.min(lens[0], Math.max(0, Math.floor(s.at || 0)));
    if (!(s.at >= 0) || s.at > lens[0]) warnings.push(`Insert after row ${s.at}: the first input has ${lens[0]} rows — ${at === 0 ? 'put before it' : 'put after its last row'}.`);
    const first = seq(0);
    refs = [...first.slice(0, at), ...inputs.slice(1).flatMap((_, j) => seq(j + 1)), ...first.slice(at)];
  } else {
    for (let i = 0; i < maxOf(lens); i++) for (let k = 0; k < inputs.length; k++) if (i < lens[k]) refs.push({ k, i });
  }

  if (s.how === 'sortx') {
    const xs = s.x ? slots.findIndex((sl) => sl.name === s.x) : Math.max(0, slots.findIndex((sl) => sl.role === 'x'));
    if (xs < 0) return `No column “${s.x}” in the inputs.`;
    const xv = (r: Ref) => {
      const c = slots[xs].from[r.k];
      return c && r.i < c.values.length ? c.values[r.i] : NaN;
    };
    // stable: equal X keep the order of the inputs; empty X at the end
    refs = refs.map((r, j) => ({ r, j, v: xv(r) })).sort((a, b) => (Number.isNaN(a.v) ? (Number.isNaN(b.v) ? a.j - b.j : 1) : Number.isNaN(b.v) ? -1 : a.v - b.v || a.j - b.j)).map((e) => e.r);
    if (s.dup !== 'all') {
      // rows with the same X: one row (the first, or the mean of every column)
      const groups: Ref[][] = [];
      for (const r of refs) {
        const last = groups[groups.length - 1];
        if (last && Number.isFinite(xv(r)) && xv(last[0]) === xv(r)) last.push(r);
        else groups.push([r]);
      }
      if (groups.length < refs.length) {
        const cols = slots.map((sl) => {
          const values = new Float64Array(groups.length);
          groups.forEach((g, j) => {
            const v = g.map((r) => {
              const c = sl.from[r.k];
              return c && r.i < c.values.length ? c.values[r.i] : NaN;
            });
            const fin = v.filter(Number.isFinite);
            values[j] = s.dup === 'first' ? v[0] : fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : NaN;
          });
          return { ...column(sl.name, values), ...(sl.role ? { role: sl.role } : {}) };
        });
        const src = column('source', Float64Array.from(groups, (g) => (g.length > 1 && s.dup === 'mean' ? NaN : g[0].k + 1)));
        warnings.push(`${refs.length - groups.length} row${refs.length - groups.length === 1 ? '' : 's'} with an X already met: ${s.dup === 'first' ? 'the first one kept' : 'replaced by the mean'}.`);
        return { dataset: { name: inputs[0].name, columns: cols }, source: src, warnings };
      }
    }
  }
  const columns = slots.map((sl) => {
    const parts = sl.from.map((c, k) => gather(c, refs, k));
    const values = new Float64Array(refs.length).fill(NaN);
    const anyText = parts.some((p) => p.text);
    const text = anyText ? new Array<string>(refs.length).fill('') : undefined;
    const anyMask = parts.some((p) => p.mask);
    const mask = anyMask ? new Uint8Array(refs.length) : undefined;
    refs.forEach((r, j) => {
      if (!sl.from[r.k]) return;
      const p = parts[r.k];
      values[j] = p.values[j];
      if (text) text[j] = p.text?.[j] ?? '';
      if (mask) mask[j] = p.mask?.[j] ?? 0;
    });
    return { ...column(sl.name, values, text), ...(sl.role ? { role: sl.role } : {}), ...(mask ? { mask } : {}) };
  });
  const source = column('source', Float64Array.from(refs, (r) => r.k + 1));
  return { dataset: { name: inputs[0].name, columns }, source, warnings };
}
