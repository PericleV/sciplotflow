// Reshaping tables: one long table cut into blocks laid side by side (Split into columns: wl, n then wl, k under it → wl, n, k), and columns or datasets put one under the other (Combine columns —
// “Stack Columns”: after, before, inserted at a row, interleaved, or sorted by X).
import { pick } from './extract.ts';
import { joined, restarts, splitRows, takeRows, type CycleOpts } from './split.ts';
import { parseRows } from './rows.ts';
import { column, findColumn, fmtNum, roleOf, valueText, type Column, type ColumnRole, type Dataset, type Workbook } from './table.ts';
import { maxOf } from './minmax.ts';

// ---- Split into columns ----

export type BlockMode = 'auto' | 'text' | 'restart' | 'column' | 'repeat' | 'every' | 'cycles' | 'direction' | 'jump';
// the rule applied again inside every block (by a column, then the cycles of the potential in each)
export type ThenMode = 'none' | 'cycles' | 'direction' | 'jump' | 'restart' | 'every';
export type UnstackSpec = {
  sheet?: string; // from a workbook, by name (absent: the first sheet)
  x: string; // the X column ('' = the designated X)
  ys: string; // the columns cut into blocks: a list (2, B-D, names, A*; '' = all the others but the group column)
  by: BlockMode;
  column?: string; // by: the column whose equal values make one block (absent: `from`)
  every?: number; // every: rows per block
  names: string; // the names of the new columns, in order ("n, k"; '' or a missing one = automatic) — older projects
  // the names given to the blocks (by their place, from 0; '' or absent: automatic): the block's column takes it (several
  // Y columns: “n · name”, “k · name”)
  blockNames?: string[];
  // 'block': the blocks without a name of their own numbered “R · 1”, “R · 2” … (new nodes); absent: “R”, “R_2” … (older)
  naming?: 'block';
  xs: 'first' | 'each'; // only the X of the first block, or the X of every block before its columns
  // the column the blocks are found from — where it starts again, jumps, turns, repeats ('' or absent = X)
  from?: string;
  jump?: number; // jump: a new block where the column changes by more than this (absent: 5 × its usual step)
  // cycles (and direction: tol, partial): where a cycle starts, the pieces not whole, halves, the turn tolerance (%)
  cycleStart?: CycleOpts['start'];
  cycleAt?: number;
  cycleDir?: CycleOpts['dir'];
  partial?: CycleOpts['partial'];
  halves?: boolean;
  tol?: number;
  then?: ThenMode; // the rule applied again inside every block
  rows?: string; // the rows used ("100-2900"; '' = all)
  keep?: string; // the blocks kept: "2:end", "1-3, 5", "!1", "last" ('' = all)
  cuts?: number[]; // cuts placed by hand: a block starts at these rows (from 1)
  uncut?: number[]; // cuts of the rule taken away: the block starting at these rows joined to the one before
  cutRows?: number; // the rows of the table when the cuts were placed by hand (a warning when it changes)
  graph?: 'rows' | 'curves'; // the node's graph: the column the blocks are found from, along the rows; or the curves
  // cuts at levels (lines across the graph at a value): a block cut wherever the column crosses it — the column the blocks
  // are found from (on absent), or the first Y (on 'y'); going up, down, or either (dir absent)
  levels?: SplitLevel[];
};
export type SplitLevel = { value: number; on?: 'y'; dir?: 'up' | 'down' };
export type BlockInfo = { name: string; rows: number; first: number; last: number; x0: number; x1: number; kept?: boolean; part?: boolean };
// The node's graph: the column the blocks are found from and the curves, every block's rows, the cuts (from 1: the
// first row of the block after them; of the rule or placed by hand), the rows used
export type SplitGraph = {
  n: number;
  f: { name: string; values: Float64Array };
  x: { name: string; values: Float64Array };
  ys: { name: string; values: Float64Array }[];
  blocks: { rows: number[]; kept: boolean; part: boolean; name: string }[];
  cuts: { row: number; hand: boolean; level?: boolean }[]; // level: made by a level line (moved and removed with it)
  levels: { value: number; on: 'from' | 'y'; dir?: 'up' | 'down' }[];
  contiguous: boolean; // every block a run of rows (the cuts can be drawn and moved)
  rows?: [number, number]; // the rows used, when one range (from 1)
};
export type UnstackResult = { dataset: Dataset; long: Dataset; values: Column; blocks: BlockInfo[]; how: string; warnings: string[]; graph?: SplitGraph };

// The blocks kept: "2:end", "1-3, 5", "first", "last", "!1" (all but the first) — rows of a list, from 1. Indices from 0.
export function keptBlocks(spec: string | undefined, n: number): Set<number> | string {
  const all = new Set(Array.from({ length: n }, (_, k) => k));
  if (!spec?.trim()) return all;
  const yes = new Set<number>();
  const no = new Set<number>();
  let any = false;
  for (const raw of spec.split(/[,;]/).map((t) => t.trim()).filter(Boolean)) {
    const neg = raw.startsWith('!');
    const t = (neg ? raw.slice(1) : raw).trim().toLowerCase().replace(/\bfirst\b/g, '1').replace(/\blast\b/g, 'end');
    const p = parseRows(t, n);
    if (typeof p === 'string') return `Keep: cannot read “${raw}”; write blocks as 2:end, 1-3, 5, first, last, or !1 (all but block 1).`;
    for (const k of p) (neg ? no : yes).add(k);
    if (!neg) any = true;
  }
  const out = any ? yes : all;
  for (const k of no) out.delete(k);
  return out;
}

// A block of the split: its rows, its value (the swept parameter, else its number), its text value, its full name
// when the rule gives one, whether it is a whole cycle, the header row over it
type Block = { rows: number[]; value: number; text?: string; label?: string; part: boolean; head: number | null };

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
  const groupName = s.column || s.from || '';
  const groupCol = s.by === 'column' ? cols.find((c) => c.name === groupName) : labels;
  if (s.by === 'column' && !groupCol) return groupName ? `No column “${groupName}” in the dataset.` : 'Choose the column whose equal values make one block.';
  // the column the blocks are found from: X, or another (the potential of a scan while X is the time …)
  const F = s.from ? cols.find((c) => c.name === s.from) : X;
  if (!F) return `From: no column “${s.from}” in the dataset.`;
  const fName = F.name || 'X';
  const names = cols.map((c) => c.name);
  let yIdx: number[];
  if (s.ys.trim()) {
    const p = pick(s.ys, names, true);
    if (p.missing.length) return `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
    yIdx = p.found.filter((j) => j !== xi);
  } else yIdx = cols.map((_, j) => j).filter((j) => j !== xi && cols[j] !== groupCol && cols[j] !== F && roleOf(cols, j) !== 'none' && roleOf(cols, j) !== 'x');
  if (!yIdx.length) return 'Choose the columns to cut into blocks (the dataset has only its X).';
  let Ys = yIdx.map((j) => cols[j]);
  const n = Math.max(X.values.length, maxOf(Ys.map((c) => c.values.length)));
  const warnings: string[] = [];

  // the rows used
  let taken: Set<number> | null = null;
  let takenRange: [number, number] | undefined;
  if (s.rows?.trim()) {
    const p = parseRows(s.rows, n);
    if (typeof p === 'string') return `Rows: ${p}`;
    if (!p.length) return `Rows: none of “${s.rows}” is in the table (${n} rows).`;
    taken = new Set(p);
    if (p[p.length - 1] - p[0] === p.length - 1) takenRange = [p[0] + 1, p[p.length - 1] + 1];
  }
  const all = Array.from({ length: n }, (_, i) => i).filter((i) => !taken || taken.has(i));
  const valid = all.filter((i) => finite(F, i));
  const cycle: CycleOpts = { start: s.cycleStart, at: s.cycleAt, dir: s.cycleDir, partial: s.partial, halves: s.halves, tol: s.tol };

  // the blocks
  let rows: number[][] | null = null;
  let head: (number | null)[] = [];
  let values: number[] = [];
  let texts: string[] | undefined;
  let blockLabels: string[] | undefined;
  let parts: boolean[] | undefined;
  let vName = '';
  let word = ''; // blocks without a name: “cycle 2”
  let how = '';
  const numbered = (r: number[][]) => r.map((_, k) => k + 1);
  if (labels) {
    const g = splitRows({ mode: 'column' }, X, all, labels, []);
    if (typeof g === 'string') return g;
    if (g) [rows, values, texts, vName, how] = [g.rows, g.values, g.texts, g.name, `by the labels of ${labels.name}${note}`];
  }
  if (!rows && (s.by === 'auto' || s.by === 'text')) {
    const t = textBlocks(X, n);
    if (t) {
      // only the rows used (a block left without any: out, with its header)
      const kept = t.rows.map((r) => r.filter((i) => !taken || taken.has(i)));
      const keep = kept.map((r) => r.length > 0);
      rows = kept.filter((_, k) => keep[k]);
      head = t.head.filter((_, k) => keep[k]);
      [values, how] = [numbered(rows), `at the lines where ${X.name || 'X'} is not a number`];
      if (!rows.length) return 'Rows: no row of the blocks is used.';
    } else if (s.by === 'text') return `No line in the middle where ${X.name || 'X'} is not a number (a header written again, an empty line).`;
  }
  if (!rows && (s.by === 'auto' || s.by === 'restart')) {
    const r = restarts(F.values, valid);
    if (r) [rows, values, how] = [r, numbered(r), `where ${fName} starts again`];
    else if (s.by === 'restart') return `${fName} never starts again: one block.`;
  }
  if (!rows && s.by !== 'auto' && s.by !== 'text' && s.by !== 'restart') {
    const g = splitRows({ mode: s.by, every: s.every, jump: s.jump, cycle }, F, s.by === 'column' ? all : valid, groupCol, cols.filter((c) => !Ys.includes(c)));
    if (typeof g === 'string') return g;
    if (g) [rows, values, texts, vName, word, how, blockLabels, parts] = [g.rows, g.values, g.texts, g.name, g.word ?? '', g.how, g.labels, g.parts];
  }
  if (!rows) return X.values.some(Number.isFinite) ? `No blocks found (no line where ${X.name || 'X'} is not a number, ${fName} never starts again, no column of labels): choose how the blocks are found; Blocks ▸ by a column, every N rows …` : `${X.name || 'X'} has no numbers (labels?): choose a column with numbers as X, and Blocks ▸ by a column (${X.name || 'X'}).`;
  const R: number[][] = rows;
  // a column with one value in every block, not the same in all: the swept parameter
  const constantIn = (c: Column): number[] | null => {
    const v: number[] = R.map((r) => c.values[r[0]]);
    return v.every(Number.isFinite) && R.every((r, k) => r.every((i) => c.values[i] === v[k])) && new Set(v).size > 1 ? v : null;
  };
  if (!head.length && !blockLabels) {
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
  const byHead = head.length > 0;
  let B: Block[] = R.map((r, k) => ({ rows: r, value: values[k], ...(texts ? { text: texts[k] } : {}), ...(blockLabels ? { label: blockLabels[k] } : {}), part: !!parts?.[k], head: head[k] ?? null }));
  const nameOfBlock = (b: Block, k: number) => b.label ?? (vName ? valueText(vName, b.text ?? fmtNum(b.value, 4), !!texts) : (b.text ?? `${word || 'block'} ${k + 1}`));

  // then, the rule again inside every block (the cycles of each run …)
  const then = s.then && s.then !== 'none' ? s.then : null;
  if (then) {
    const inner: Block[] = [];
    let innerHow = '';
    B.forEach((b, k) => {
      const outer = nameOfBlock(b, k);
      const idx = b.rows.filter((i) => finite(F, i));
      let g: { rows: number[][]; labels?: string[]; parts?: boolean[]; word?: string; how: string } | string | null;
      if (then === 'restart') {
        const r = restarts(F.values, idx);
        g = r ? { rows: r, how: `where ${fName} starts again` } : null;
      } else g = splitRows({ mode: then, every: s.every, jump: s.jump, cycle }, F, idx, undefined, []);
      if (!g || typeof g === 'string' || g.rows.length < 2) {
        // nothing found inside: the block stays whole
        inner.push({ ...b, label: outer, head: null });
        return;
      }
      innerHow = g.how;
      const gw = g.word ?? 'part';
      g.rows.forEach((r, j) => inner.push({ rows: r, value: 0, label: `${outer} · ${g.labels?.[j] ?? `${gw} ${j + 1}`}`, part: !!g.parts?.[j], head: null }));
    });
    if (innerHow) how += `; then in every block, ${innerHow}`;
    else warnings.push(`Then ▸ ${then}: nothing found inside the blocks (each kept whole).`);
    B = inner.map((b, k) => ({ ...b, value: k + 1 }));
    [vName, texts, word] = ['', undefined, 'block'];
  }

  // the cuts placed by hand, and the cuts of the rule taken away
  const shared = B.some((b, k) => k > 0 && B[k - 1].rows[B[k - 1].rows.length - 1] === b.rows[0]);
  const hadLabels = B.some((b) => b.label);
  let changed = false;
  if (s.uncut?.length) {
    const u = new Set(s.uncut.map((r) => r - 1));
    const out: Block[] = [];
    for (const b of B) {
      const p = out[out.length - 1];
      if (p && u.has(b.rows[0])) {
        out[out.length - 1] = { ...p, rows: joined(p.rows, b.rows), part: p.part && b.part };
        changed = true;
      } else out.push(b);
    }
    B = out;
  }
  const hand = new Set<number>();
  for (const r1 of [...new Set(s.cuts ?? [])].sort((a, b) => a - b)) {
    const r = r1 - 1;
    const k = B.findIndex((b) => {
      const p = b.rows.indexOf(r);
      return p > 0 && (!shared || p < b.rows.length - 1);
    });
    if (k < 0) continue;
    const b = B[k];
    const p = b.rows.indexOf(r);
    // a scan's blocks share the point between them: the cut point in both
    B.splice(k, 1, { ...b, rows: b.rows.slice(0, shared ? p + 1 : p) }, { ...b, rows: b.rows.slice(p), head: null });
    hand.add(r);
    changed = true;
  }
  if (changed) {
    // numbered again in their new order (a swept value or a text stays with the rows it named)
    B = B.map((b, k) => ({ ...b, value: vName || texts ? b.value : k + 1, label: undefined }));
    if (!vName && !texts) word = hadLabels ? 'block' : word || 'block';
    how += `; ${hand.size ? `${hand.size} cut${hand.size > 1 ? 's' : ''} by hand` : ''}${hand.size && s.uncut?.length ? ', ' : ''}${s.uncut?.length ? `${s.uncut.length} taken away` : ''}`;
  }
  // the cuts at levels: a block cut wherever the column crosses the value, going the way asked
  const lev = new Set<number>();
  for (const L of s.levels ?? []) {
    const C = L.on === 'y' ? (Ys[0] ?? F) : F;
    if (!Number.isFinite(L.value)) continue;
    const out: Block[] = [];
    for (const b of B) {
      const r = b.rows;
      let start = 0;
      for (let p = 1; p < r.length; p++) {
        const [v0, v1] = [C.values[r[p - 1]], C.values[r[p]]];
        const up = v0 < L.value && v1 >= L.value;
        const down = v0 > L.value && v1 <= L.value;
        if (!(L.dir === 'up' ? up : L.dir === 'down' ? down : up || down) || p === start) continue;
        out.push({ ...b, rows: r.slice(start, shared ? p + 1 : p), head: start ? null : b.head });
        start = p;
        lev.add(r[p]);
      }
      out.push(start ? { ...b, rows: r.slice(start), head: null } : b);
    }
    B = out;
  }
  if (lev.size) {
    B = B.map((b, k) => ({ ...b, value: vName || texts ? b.value : k + 1, label: undefined }));
    if (!vName && !texts) word = 'block';
    how += `; ${lev.size} cut${lev.size > 1 ? 's' : ''} at ${s.levels!.length === 1 ? 'a level' : `${s.levels!.length} levels`}`;
  }
  if ((s.cuts?.length || s.uncut?.length) && s.cutRows !== undefined && s.cutRows !== n) warnings.push(`The table has ${n} rows now, ${s.cutRows} when the cuts were placed by hand: check them on the graph.`);
  // a map in long form (X, a swept value, Z: 500 sweeps and more) splits too; very many columns are still refused
  if (B.length > 20000) return `${B.length} blocks found (${how}): too many columns (at most 20 000).`;

  // the blocks kept
  const keep = keptBlocks(s.keep, B.length);
  if (typeof keep === 'string') return keep;
  const K = B.map((_, k) => k).filter((k) => keep.has(k));
  if (!K.length) return `Keep: no block left of ${B.length} (“${s.keep}”).`;

  // the new columns: X (once, or before each block) and every Y of every block
  const own = s.names
    .split(',')
    .map((t) => t.trim());
  let o = 0;
  const out: Column[] = [];
  const roles: ColumnRole[] = [];
  // “Current (mA) · cycle 2”, “R · cavity d = 150 nm” (no comma: lists of columns are cut at commas); a block named in the
  // node: its name (several Y columns: “n · name”)
  const counted = s.naming === 'block';
  const autoName = (Y: Column, b: Block, k: number) => {
    const given = s.blockNames?.[k]?.trim();
    if (given) return Ys.length > 1 ? `${Y.name} · ${given}` : given;
    const fromHead = b.head !== null ? cellOf(Y, b.head) : '';
    const bt = b.text ?? fmtNum(b.value, 4);
    if (b.label) return `${Y.name} · ${b.label}`;
    if (word) return `${Y.name} · ${word} ${k + 1}`;
    if (k === 0 && !vName && !texts && !(counted && !fromHead && !byHead)) return Y.name;
    return fromHead || (vName || texts ? `${Y.name} · ${vName ? valueText(vName, bt, !!texts) : bt}` : counted ? `${Y.name} · ${k + 1}` : `${Y.name}_${k + 1}`);
  };
  // only the first X: the longest block's (a block may have a row more, as the last cycle of a scan)
  const longest = K.reduce((a, k) => (B[k].rows.length > B[a].rows.length ? k : a), K[0]);
  const refX = takeRows(X, B[longest].rows);
  const blocks: BlockInfo[] = [];
  B.forEach((b, k) => {
    const r = b.rows;
    const bx = takeRows(X, r);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const v of bx.values) if (Number.isFinite(v)) [x0, x1] = [Math.min(x0, v), Math.max(x1, v)];
    const info = { rows: r.length, first: r[0] + 1, last: r[r.length - 1] + 1, x0, x1, ...(b.part ? { part: true } : {}) };
    if (!keep.has(k)) {
      blocks.push({ name: autoName(Ys[0], b, k), ...info, kept: false });
      return;
    }
    const h = b.head;
    if (s.xs === 'each' || k === K[0]) {
      const xName = k === K[0] ? X.name : (h !== null && cellOf(X, h)) || X.name;
      out.push({ ...(s.xs === 'each' ? bx : refX), name: xName });
      roles.push('x');
    }
    if (s.xs !== 'each' && k !== longest) {
      const d = sameX(refX, bx);
      if (d !== -1) warnings.push(`Block ${k + 1}: its ${X.name || 'X'} differs from block ${longest + 1} (row ${d}: ${fmtNum(bx.values[d - 1])}, block ${longest + 1} ${fmtNum(refX.values[d - 1])}): X out ▸ “an X before every block” keeps each one.`);
    }
    Ys.forEach((Y) => {
      const nm = own[o++] || autoName(Y, b, k);
      const c = takeRows(Y, r);
      // the block's value travels with its column (the swept parameter, the cycle, the segment)
      const key = vName || word ? { name: vName || word, value: b.value } : byHead ? undefined : { name: 'block', value: k + 1 };
      out.push({ ...c, name: nm, ...(key ? { key } : {}) });
      const role = Y.role && Y.role !== 'x' && Y.role !== 'none' ? Y.role : 'y';
      roles.push(role);
    });
    blocks.push({ name: out[out.length - Ys.length].name, ...info, kept: true });
  });
  if (K.length > 500) warnings.push(`${K.length} blocks: ${K.length} columns: a map of them (Contour / heatmap ▸ a matrix, or its X, Y, Z columns directly) draws faster than as many curves.`);
  if (own.filter(Boolean).length > o) warnings.push(`Names: ${own.filter(Boolean).length} given, ${o} new columns.`);
  const len = maxOf(out.map((c) => c.values.length));
  const unique = uniqueNames(out.map((c) => c.name));
  const columns = out.map((c, k) => ({ ...padded(c, len), name: unique[k], role: roles[k] }));
  const vals = column(vName || word || 'block', Float64Array.from(K, (k) => B[k].value), texts ? K.map((k) => B[k].text ?? '') : undefined);

  // the long table: every row of the blocks kept, once, in the table's order, with its block (a point two blocks share:
  // the later one), its cycle or segment, and which way the column was going there
  const blockOf = new Int32Array(n).fill(-1);
  for (const k of K) for (const i of B[k].rows) blockOf[i] = k;
  const lrows: number[] = [];
  for (let i = 0; i < n; i++) if (blockOf[i] >= 0) lrows.push(i);
  const sweep = s.by === 'cycles' || s.by === 'direction' || then === 'cycles' || then === 'direction';
  const way = new Float64Array(n).fill(NaN);
  if (sweep)
    for (const k of K) {
      const r = B[k].rows;
      r.forEach((i, p) => {
        if (blockOf[i] !== k) return;
        const d = p < r.length - 1 ? F.values[r[p + 1]] - F.values[i] : p > 0 ? F.values[i] - F.values[r[p - 1]] : NaN;
        way[i] = d > 0 ? 1 : d < 0 ? -1 : NaN;
      });
    }
  const longCols: Column[] = cols.map((c, j) => ({ ...takeRows(c, lrows), role: roleOf(cols, j) }));
  longCols.push({ ...column('block', Float64Array.from(lrows, (i) => blockOf[i] + 1)), role: 'none' });
  if (word && word !== 'block' && !changed) longCols.push({ ...column(word, Float64Array.from(lrows, (i) => B[blockOf[i]].value)), role: 'none' });
  if (sweep) longCols.push({ ...column('direction', Float64Array.from(lrows, (i) => way[i]), lrows.map((i) => (way[i] > 0 ? 'up' : way[i] < 0 ? 'down' : ''))), role: 'none' });
  const longNames = uniqueNames(longCols.map((c) => c.name));
  const long = { name: `${ds.name} (long)`, columns: longCols.map((c, j) => ({ ...c, name: longNames[j] })) };

  // the node's graph (not for very large tables: too much to send and draw)
  const graph: SplitGraph | undefined =
    n <= 500000
      ? {
          n,
          f: { name: F.name, values: Float64Array.from(F.values) },
          x: { name: X.name, values: Float64Array.from(X.values) },
          ys: Ys.slice(0, 8).map((c) => ({ name: c.name, values: Float64Array.from(c.values) })),
          blocks: B.map((b, k) => ({ rows: b.rows, kept: keep.has(k), part: b.part, name: nameOfBlock(b, k) })),
          cuts: B.slice(1).map((b) => ({ row: b.rows[0] + 1, hand: hand.has(b.rows[0]), ...(lev.has(b.rows[0]) ? { level: true } : {}) })),
          levels: (s.levels ?? []).map((L) => ({ value: L.value, on: L.on === 'y' ? 'y' : 'from', ...(L.dir ? { dir: L.dir } : {}) })),
          contiguous: B.every((b) => b.rows.every((i, p) => p === 0 || i === b.rows[p - 1] + 1)),
          ...(takenRange ? { rows: takenRange } : {}),
        }
      : undefined;
  return { dataset: { name: ds.name, columns }, long, values: vals, blocks, how, warnings, ...(graph ? { graph } : {}) };
}

// ---- Combine columns ----

export type CombineHow = 'after' | 'before' | 'insert' | 'interleave' | 'sortx';
export type CombineSpec = {
  how: CombineHow;
  at: number; // insert: the next inputs go after this row of the first one (0 = before it)
  match: 'name' | 'position'; // datasets: columns matched by their name or their place
  x: string; // sortx: the X column of the datasets ('' = the designated one)
  dup: 'all' | 'mean' | 'first'; // sortx: rows with the same X — all kept, their mean, the first one
  desc?: boolean; // sortx: the largest first
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
    if (!(s.at >= 0) || s.at > lens[0]) warnings.push(`Insert after row ${s.at}: the first input has ${lens[0]} rows; ${at === 0 ? 'put before it' : 'put after its last row'}.`);
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
    const sign = s.desc ? -1 : 1;
    refs = refs.map((r, j) => ({ r, j, v: xv(r) })).sort((a, b) => (Number.isNaN(a.v) ? (Number.isNaN(b.v) ? a.j - b.j : 1) : Number.isNaN(b.v) ? -1 : sign * (a.v - b.v) || a.j - b.j)).map((e) => e.r);
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

// ---- Combine columns ▸ the node: what comes out ----

// One column (one under the other), side by side (a dataset), side by side in sheets (a workbook), into a table (the
// columns of the other inputs put into one of them: a dataset or a sheet of a workbook), tables one under the other
export type CombineMode = 'column' | 'side' | 'sheets' | 'into' | 'tables';
// into a table: an input's columns at the end, the start, after / before / instead of a column; or its column under /
// above a column (continuing it), inserted into it after a row, interleaved with it
export type IntoAction = 'end' | 'start' | 'after' | 'before' | 'replace' | 'under' | 'above' | 'insert' | 'interleave';
// the settings of one input: the column it gives (One column, and under / above … into a table; '' = its Y), its sheet
// (a workbook; '' = the first), new names of its columns (comma-separated), the sheet it goes to (in sheets), what it
// does into the table, the column of the table (ref) and the row (at)
export type CombinePort = { col?: string; sheet?: string; names?: string; sheetOut?: string; action?: IntoAction; ref?: string; at?: number };
// the settings as the node works with them (an older node's translated: combineSettings)
export type CombineSettings = {
  result: CombineMode;
  order: number[]; // the ports, in the order wanted (only those connected)
  ports: Record<string, CombinePort>;
  into: number; // into a table: the port of the table
  how: 'after' | 'interleave' | 'insert' | 'sortx';
  at: number;
  match: 'name' | 'position';
  x: string;
  dup: 'all' | 'mean' | 'first';
  desc: boolean;
  name: string;
};
// what is connected to a port
export type CombineInput = { port: number; v: { t: 'column'; v: Column } | { t: 'dataset'; v: Dataset } | { t: 'workbook'; v: Workbook } };
// the node's data (types.ts CombineData)
type CombineNodeData = Omit<CombineSpec, 'how'> & {
  how: CombineHow | 'side';
  name: string;
  where?: 'ports' | 'start' | 'after' | 'replace';
  ref?: string;
  names?: string;
  result?: CombineMode;
  order?: number[];
  ports?: Record<string, CombinePort>;
  into?: number;
  desc?: boolean;
};

// The settings of the node for the inputs connected: its own, or those an older node (no `result`) meant — side by side
// (after A, before A, after / in place of a column of A: into A), else columns → one column, a dataset → tables.
export function combineSettings(d: CombineNodeData, ins: { port: number; kind: CombineInput['v']['t']; cols: number }[]): CombineSettings {
  const present = ins.map((i) => i.port).sort((a, b) => a - b);
  let order = d.order ? [...d.order.filter((p) => present.includes(p)), ...present.filter((p) => !d.order!.includes(p))] : present;
  let how = d.how;
  if (how === 'before') {
    order = [...order].reverse();
    how = 'after';
  }
  const base = { order, ports: d.ports ?? {}, into: d.into ?? order[0] ?? 0, at: d.at, match: d.match, x: d.x, dup: d.dup, desc: !!d.desc, name: d.name };
  if (d.result) return { ...base, result: d.result, how: how === 'side' ? 'after' : how };
  if (how !== 'side') return { ...base, result: ins.every((i) => i.kind === 'column') ? 'column' : 'tables', how };
  // side by side, older: the names of the columns of B, C … in turn
  const names = (d.names ?? '').split(',').map((s) => s.trim());
  const ports: Record<string, CombinePort> = {};
  let k = 0;
  for (const p of order.slice(1)) {
    const n = ins.find((i) => i.port === p)?.cols ?? 1;
    const own = names.slice(k, k + n);
    k += n;
    if (own.some(Boolean)) ports[p] = { names: own.join(', ') };
  }
  const where = d.where ?? 'ports';
  if (where === 'after' || where === 'replace') {
    for (const p of order.slice(1)) ports[p] = { ...ports[p], action: where, ref: d.ref ?? '' };
    return { ...base, result: 'into', ports, into: order[0] ?? 0, how: 'after' };
  }
  return { ...base, result: 'side', ports, order: where === 'start' ? [...order.slice(1), ...order.slice(0, 1)] : order, how: 'after' };
}

// Columns side by side: the shorter ones end in empty cells, a name met twice becomes “name (2)”.
export function sideBySide(cols: Column[]): Column[] {
  const len = Math.max(0, maxOf(cols.map((c) => c.values.length)));
  const seen = new Set<string>();
  return cols.map((c) => {
    let nm = c.name;
    for (let k = 2; seen.has(nm); k++) nm = `${c.name} (${k})`;
    seen.add(nm);
    if (c.values.length === len) return nm === c.name ? c : { ...c, name: nm };
    const values = new Float64Array(len).fill(NaN);
    values.set(c.values);
    return { ...c, name: nm, values, ...(c.text ? { text: [...c.text, ...Array<string>(len - c.text.length).fill('')] } : {}), ...(c.mask ? { mask: undefined } : {}) };
  });
}

// the letter of a port (A, B …)
const portLetter = (p: number) => (p < 26 ? String.fromCharCode(65 + p) : String.fromCharCode(64 + Math.floor(p / 26)) + String.fromCharCode(65 + (p % 26)));
// an input as a table: a column alone, a dataset, the sheet chosen of a workbook
function tableOf(i: CombineInput, s: CombinePort | undefined): Dataset | string {
  if (i.v.t === 'column') return { name: i.v.v.name, columns: [i.v.v] };
  if (i.v.t === 'dataset') return i.v.v;
  const book = i.v.v;
  const sheet = s?.sheet ? book.sheets.find((q) => q.name === s.sheet) : book.sheets[0];
  return sheet ?? `${portLetter(i.port)}: no sheet “${s?.sheet ?? ''}” in the workbook.`;
}
// the column an input gives: itself, the one chosen, else its first Y (else its first column that is not X)
function columnOf(i: CombineInput, s: CombinePort | undefined): Column | string {
  if (i.v.t === 'column') return i.v.v;
  const t = tableOf(i, s);
  if (typeof t === 'string') return t;
  if (s?.col) return findColumn(t.columns, s.col) ?? `${portLetter(i.port)}: no column “${s.col}”.`;
  const y = t.columns.findIndex((_, j) => roleOf(t.columns, j) === 'y');
  const c = t.columns[y >= 0 ? y : t.columns.findIndex((_, j) => roleOf(t.columns, j) !== 'x')] ?? t.columns[0];
  return c ?? `${portLetter(i.port)}: no column.`;
}
// the columns of an input with the new names given to them
const renamed = (cols: Column[], names: string | undefined) => {
  const nm = (names ?? '').split(',').map((s) => s.trim());
  return cols.map((c, k) => (nm[k] ? { ...c, name: nm[k] } : c));
};
// two columns made one (the first keeps its name): b under / above a, inserted into a after row `at`, interleaved
function joinColumns(a: Column, b: Column, how: 'under' | 'above' | 'insert' | 'interleave', at: number): Column {
  const la = a.values.length;
  const lb = b.values.length;
  const refs: [0 | 1, number][] = [];
  const seq = (k: 0 | 1, n: number) => Array.from({ length: n }, (_, i): [0 | 1, number] => [k, i]);
  if (how === 'under') refs.push(...seq(0, la), ...seq(1, lb));
  else if (how === 'above') refs.push(...seq(1, lb), ...seq(0, la));
  else if (how === 'insert') {
    const k = Math.min(la, Math.max(0, Math.floor(at || 0)));
    refs.push(...seq(0, la).slice(0, k), ...seq(1, lb), ...seq(0, la).slice(k));
  } else for (let i = 0; i < Math.max(la, lb); i++) refs.push(...(i < la ? [[0, i] as [0, number]] : []), ...(i < lb ? [[1, i] as [1, number]] : []));
  const src = [a, b];
  const text = a.text || b.text ? refs.map(([k, i]) => src[k].text?.[i] ?? '') : undefined;
  const mask = a.mask || b.mask ? Uint8Array.from(refs, ([k, i]) => src[k].mask?.[i] ?? 0) : undefined;
  return { ...a, values: Float64Array.from(refs, ([k, i]) => src[k].values[i]), ...(text ? { text } : {}), ...(mask ? { mask } : {}) };
}

export type CombineOut = { out: CombineInput['v']; source?: Column; warnings: string[] } | string;

// The node: the inputs (in the order of their ports) combined as the settings say.
export function combineNode(ins: CombineInput[], s: CombineSettings): CombineOut {
  if (!ins.length) return 'Connect columns, datasets or workbooks to A, B, C …';
  const byPort = new Map(ins.map((i) => [i.port, i]));
  const ordered = s.order.map((p) => byPort.get(p)!).filter(Boolean);
  const port = (i: CombineInput) => s.ports[i.port];
  const warnings: string[] = [];
  const rowsDiffer = (sets: Dataset[]) => {
    const lens = [...new Set(sets.map((q) => Math.max(0, maxOf(q.columns.map((c) => c.values.length)))))];
    if (lens.length > 1) warnings.push(`The inputs have ${lens.join(', ')} rows: empty cells below the shorter ones.`);
  };
  if (s.result === 'column' || s.result === 'tables') {
    const sets: Dataset[] = [];
    for (const i of ordered) {
      if (s.result === 'column') {
        const c = columnOf(i, port(i));
        if (typeof c === 'string') return c;
        sets.push({ name: c.name, columns: [c] });
      } else {
        const t = tableOf(i, port(i));
        if (typeof t === 'string') return t;
        sets.push(t);
      }
    }
    const r = combine(sets, { how: s.how, at: s.at, match: s.result === 'column' ? 'position' : s.match, x: s.result === 'column' ? '' : s.x, dup: s.dup, desc: s.desc });
    if (typeof r === 'string') return r;
    // the source: the port of every row (1 = A, 2 = B …)
    const source = { ...r.source, values: Float64Array.from(r.source.values, (k) => (Number.isFinite(k) ? ordered[k - 1].port + 1 : k)) };
    if (s.result === 'column') {
      const c = r.dataset.columns[0];
      return { out: { t: 'column', v: { ...c, name: s.name.trim() || c.name } }, source, warnings: r.warnings };
    }
    return { out: { t: 'dataset', v: r.dataset }, source, warnings: r.warnings };
  }
  if (s.result === 'side' || s.result === 'sheets') {
    // in sheets: the inputs with the same sheet side by side, the sheets in the order first met
    const groups = new Map<string, Dataset[]>();
    for (const i of ordered) {
      const t = tableOf(i, port(i));
      if (typeof t === 'string') return t;
      const key = s.result === 'sheets' ? port(i)?.sheetOut?.trim() || 'Sheet 1' : '';
      groups.set(key, [...(groups.get(key) ?? []), { ...t, columns: renamed(t.columns, port(i)?.names) }]);
    }
    const sheets = [...groups].map(([key, sets]): Dataset => {
      rowsDiffer(sets);
      return { name: key || sets[0].name, columns: sideBySide(sets.flatMap((q) => q.columns)) };
    });
    if (s.result === 'side') return { out: { t: 'dataset', v: sheets[0] }, warnings };
    return { out: { t: 'workbook', v: { name: ordered[0] ? (tableOf(ordered[0], port(ordered[0])) as Dataset).name : 'Combined', sheets } }, warnings };
  }
  // into a table: the other inputs in turn
  const target = byPort.get(s.into) ?? ordered[0];
  const table = tableOf(target, port(target));
  if (typeof table === 'string') return table;
  let cols = [...table.columns];
  const lens = [Math.max(0, maxOf(cols.map((c) => c.values.length)))];
  for (const i of ordered) {
    if (i === target) continue;
    const ps = port(i) ?? {};
    const action = ps.action ?? 'end';
    const L = portLetter(i.port);
    const refAt = () => {
      if (!ps.ref) return `${L}: choose the column of ${portLetter(target.port)}.`;
      const c = findColumn(cols, ps.ref);
      return c ? cols.indexOf(c) : `${L}: no column “${ps.ref}” in ${portLetter(target.port)}.`;
    };
    if (action === 'under' || action === 'above' || action === 'insert' || action === 'interleave') {
      const j = refAt();
      if (typeof j === 'string') return j;
      const c = columnOf(i, ps);
      if (typeof c === 'string') return c;
      cols[j] = joinColumns(cols[j], c, action, ps.at ?? 0);
      continue;
    }
    const t = tableOf(i, ps);
    if (typeof t === 'string') return t;
    lens.push(Math.max(0, maxOf(t.columns.map((c) => c.values.length))));
    const added = renamed(t.columns, ps.names);
    if (action === 'end') cols = [...cols, ...added];
    else if (action === 'start') cols = [...added, ...cols];
    else {
      const j = refAt();
      if (typeof j === 'string') return j;
      cols = [...cols.slice(0, action === 'after' ? j + 1 : j), ...added, ...cols.slice(action === 'before' ? j : j + 1)];
    }
  }
  const ls = [...new Set(lens)];
  if (ls.length > 1) warnings.push(`The inputs have ${ls.join(', ')} rows: empty cells below the shorter ones.`);
  const ds: Dataset = { name: table.name, columns: sideBySide(cols) };
  if (target.v.t === 'workbook') {
    const book = target.v.v;
    return { out: { t: 'workbook', v: { ...book, sheets: book.sheets.map((q) => (q === table ? ds : q)) } }, warnings };
  }
  return { out: { t: 'dataset', v: ds }, warnings };
}
