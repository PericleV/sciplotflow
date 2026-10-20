// One curve split into several: a sweep saved in one long table (θ from 40 to 90, again from 40 to 90 … for every
// value of a parameter) is many curves, not one. The groups of rows are found from X (where it starts again, or where a
// value repeats) or given by a column (equal values = one curve), or are blocks of N rows, or the cycles of a scan that
// goes and comes back (a cyclic voltammogram: X up, down, back to where it started). A column constant within every
// group and changing between them (the swept parameter) names the curves and colours them.
import { fmtNum, valueText, type Column } from './table.ts';
import { maxOf, minOf } from './minmax.ts';

export type SplitMode = 'none' | 'auto' | 'column' | 'repeat' | 'every' | 'cycles' | 'direction' | 'jump';
// The cycles of a scan: where one starts — where the scan started (going its first way), at every upper or lower
// turn, or where the column crosses a value going up or down; the pieces that are not a whole cycle (the scan started
// or stopped in the middle of one) kept, left out or joined to the cycle next to them; every cycle cut into its way up
// and its way down (halves). tol: the turn tolerance, % of the column's range (0.5).
export type CycleOpts = { start?: 'start' | 'top' | 'bottom' | 'value'; at?: number; dir?: 'up' | 'down'; partial?: 'keep' | 'drop' | 'join'; halves?: boolean; tol?: number };
export type CurveSplit = {
  mode: SplitMode;
  column?: string; // 'column': the column whose equal values make a curve (the dataset's, or the group port)
  every?: number; // 'every': rows per curve
  jump?: number; // 'jump': a new block where the column changes by more than this (absent: 5 × its usual step)
  cycle?: CycleOpts; // 'cycles', 'direction' (tol, partial)
  groups?: string; // the curves drawn, by number: "1-10, 20, 1:5:end" ('' = all)
  color?: 'map' | 'palette' | 'same'; // the colour map of the curve's style over the group values, the palette, one colour
};
export type RowGroups = {
  rows: number[][]; // the rows of each group, in their order
  values: number[]; // the value of each group (the parameter, else its number)
  texts?: string[]; // text values of a text column
  name: string; // what the values are ('' = the group number)
  word?: string; // without a name: “cycle 2” instead of “curve 2”
  labels?: string[]; // the name of every group in full, when the word and its number do not say it (“cycle 2 · up”)
  parts?: boolean[]; // the groups that are not a whole cycle (segment)
  how: string; // how they were found, for the node
};

export const MAX_GROUPS = 5000;

function rangeOf(x: ArrayLike<number>, idx: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const i of idx) if (Number.isFinite(x[i])) [lo, hi] = [Math.min(lo, x[i]), Math.max(hi, x[i])];
  return [lo, hi];
}

// The turning points of X along the rows `idx` (positions in idx) and whether each is an upper one: where it goes back
// by more than a small tolerance (tol: a fraction of its range, 0.5 %), so the noise of a measured potential does not
// turn it.
export function turnPoints(x: ArrayLike<number>, idx: number[], tolFrac = 0.005): { k: number; top: boolean }[] {
  const [lo, hi] = rangeOf(x, idx);
  const tol = tolFrac * (hi - lo || 1);
  const out: { k: number; top: boolean }[] = [];
  let dir = 0;
  let ext = 0;
  for (let k = 1; k < idx.length; k++) {
    const d = x[idx[k]] - x[idx[ext]];
    if (!Number.isFinite(d)) continue;
    if (dir === 0) {
      if (Math.abs(d) > tol) [dir, ext] = [Math.sign(d), k];
    } else if (d * dir > 0) ext = k;
    else if (-d * dir > tol) {
      out.push({ k: ext, top: dir > 0 });
      dir = -dir;
      ext = k;
    }
  }
  return out;
}
export const turns = (x: ArrayLike<number>, idx: number[], tolFrac = 0.005) => turnPoints(x, idx, tolFrac).map((t) => t.k);

// The pieces of a curve where X goes one way (up or down) between two turns; the turning point in both pieces.
export function segmentRows(x: ArrayLike<number>, idx: number[], tolFrac = 0.005): number[][] {
  const t = turns(x, idx, tolFrac);
  const cuts = [0, ...t, idx.length - 1];
  const out: number[][] = [];
  for (let j = 0; j + 1 < cuts.length; j++) {
    const seg = idx.slice(cuts[j], cuts[j + 1] + 1);
    if (seg.length >= 2) out.push(seg);
  }
  return out;
}

// The blocks between cuts (positions in idx), each cut point in both blocks (whole loops, aligned X): the first and
// last position of each.
function between(idx: number[], cuts: number[]): [number, number][] {
  const at = [...new Set(cuts.filter((c) => c > 0 && c < idx.length - 1))].sort((a, b) => a - b);
  const b = [0, ...at, idx.length - 1];
  const out: [number, number][] = [];
  for (let j = 0; j + 1 < b.length; j++) if (b[j + 1] > b[j]) out.push([b[j], b[j + 1]]);
  return out;
}

// Two blocks made one (a point both have counted once).
export const joined = (a: number[], b: number[]) => (a.length && b.length && a[a.length - 1] === b[0] ? [...a, ...b.slice(1)] : [...a, ...b]);

// The cycles of a scan. A cycle starts where the scan started (it ends where X, after turning twice, comes back there
// going the first way), at every upper (lower) turn, or where X crosses a value going up (down) after turning twice;
// the point where one ends is the first of the next. parts: the pieces that are not whole — fewer turns inside than a
// cycle has, or not back where they started (2 % of the range, or the tolerance when larger).
function cycleRows(x: ArrayLike<number>, idx: number[], o: CycleOpts = {}): { rows: number[][]; parts: boolean[]; how: string } | string | null {
  const tolFrac = (o.tol ?? 0.5) / 100;
  const tp = turnPoints(x, idx, tolFrac);
  if (!tp.length) return null;
  const [lo, hi] = rangeOf(x, idx);
  const tol = tolFrac * (hi - lo || 1);
  const start = o.start ?? 'start';
  let cuts: number[];
  let how: string;
  if (start === 'top' || start === 'bottom') {
    cuts = tp.filter((t) => t.top === (start === 'top')).map((t) => t.k);
    how = `from every ${start === 'top' ? 'upper' : 'lower'} turn`;
  } else {
    const v = start === 'value' ? (o.at ?? NaN) : x[idx[0]];
    if (!Number.isFinite(v)) return 'Cycles ▸ Starts at a value: write the value.';
    let d = start === 'value' ? (o.dir === 'down' ? -1 : 1) : 0;
    for (let k = 1; k < idx.length && !d; k++) if (Math.abs(x[idx[k]] - v) > tol) d = Math.sign(x[idx[k]] - v);
    const t = new Set(tp.map((q) => q.k));
    cuts = [];
    // from where it started: a cycle after two turns; at a value: the first crossing at once, then after two turns
    let seen = start === 'value' ? 2 : 0;
    for (let k = 1; k < idx.length; k++) {
      if (t.has(k - 1)) seen++;
      const [a, b] = [x[idx[k - 1]], x[idx[k]]];
      if (seen >= 2 && (b - a) * d > 0 && (a - v) * d <= tol && (b - v) * d > 0) {
        // the point nearest the value closes this cycle and opens the next
        cuts.push(Math.abs(a - v) <= Math.abs(b - v) ? k - 1 : k);
        seen = 0;
      }
    }
    how = start === 'value' ? `from where it crosses ${fmtNum(v)} going ${d > 0 ? 'up' : 'down'}` : '(up, down, back)';
  }
  const spans = between(idx, cuts);
  const close = Math.max(tol, 0.02 * (hi - lo || 1));
  const need = start === 'top' || start === 'bottom' ? 1 : 2;
  const parts = spans.map(([a, b]) => {
    let inner = 0;
    for (const t of tp) if (t.k > a && t.k < b) inner++;
    return inner < need || !(Math.abs(x[idx[b]] - x[idx[a]]) <= close);
  });
  return { rows: spans.map(([a, b]) => idx.slice(a, b + 1)), parts, how };
}

// The segments where X goes one way; parts: those that start or end neither at a turn nor at the end of X's range
// (the scan started or stopped on the way).
function segmentGroups(x: ArrayLike<number>, idx: number[], tolFrac: number): { rows: number[][]; parts: boolean[] } {
  const rows = segmentRows(x, idx, tolFrac);
  const t = new Set(turns(x, idx, tolFrac).map((k) => idx[k]));
  const [lo, hi] = rangeOf(x, idx);
  const close = Math.max(tolFrac, 0.02) * (hi - lo || 1);
  const atEnd = (i: number) => t.has(i) || Math.abs(x[i] - lo) <= close || Math.abs(x[i] - hi) <= close;
  return { rows, parts: rows.map((r) => !atEnd(r[0]) || !atEnd(r[r.length - 1])) };
}

// The pieces that are not whole left out, or joined to the next one (the first) or to the one before (the others).
function partsDone(rows: number[][], parts: boolean[], how: 'keep' | 'drop' | 'join' | undefined): { rows: number[][]; parts: boolean[] } {
  if (!how || how === 'keep') return { rows, parts };
  if (how === 'drop') {
    const keep = rows.map((_, k) => !parts[k]);
    return { rows: rows.filter((_, k) => keep[k]), parts: parts.filter((_, k) => keep[k]) };
  }
  // a whole block takes in the pieces next to it; with none, the pieces stay one block (still not whole)
  const out: number[][] = [];
  const outParts: boolean[] = [];
  let carry: number[] | null = null;
  rows.forEach((r0, k) => {
    const r: number[] = carry ? joined(carry, r0) : r0;
    carry = null;
    if (parts[k] && !out.length && k < rows.length - 1) carry = r;
    else if (parts[k] && out.length) out[out.length - 1] = joined(out[out.length - 1], r);
    else {
      out.push(r);
      outParts.push(!!parts[k]);
    }
  });
  if (carry) {
    out.push(carry);
    outParts.push(true);
  }
  return { rows: out, parts: outParts };
}

// Where the column jumps: a new block where it changes by more than `by` from one row to the next (absent: 5 × the
// median change — any change when most rows repeat the value before).
export function jumpRows(x: ArrayLike<number>, idx: number[], by?: number): { rows: number[][]; thr: number; auto: boolean } {
  const d: number[] = [];
  for (let k = 1; k < idx.length; k++) {
    const v = Math.abs(x[idx[k]] - x[idx[k - 1]]);
    if (Number.isFinite(v)) d.push(v);
  }
  d.sort((a, b) => a - b);
  const auto = !(by !== undefined && by > 0);
  const thr = auto ? 5 * (d.length ? d[Math.floor(d.length / 2)] : 0) : by!;
  const rows: number[][] = [];
  let cur: number[] = idx.length ? [idx[0]] : [];
  for (let k = 1; k < idx.length; k++) {
    if (Math.abs(x[idx[k]] - x[idx[k - 1]]) > thr) {
      rows.push(cur);
      cur = [];
    }
    cur.push(idx[k]);
  }
  if (cur.length) rows.push(cur);
  return { rows, thr, auto };
}

// Where X starts again: a sweep repeated in the same direction (sawtooth), or back and forth (zigzag).
export function restarts(x: ArrayLike<number>, idx: number[]): number[][] | null {
  let pos = 0;
  let neg = 0;
  for (let k = 1; k < idx.length; k++) {
    const d = x[idx[k]] - x[idx[k - 1]];
    if (d > 0) pos++;
    else if (d < 0) neg++;
  }
  if (!pos || !neg) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const i of idx) if (Number.isFinite(x[i])) [lo, hi] = [Math.min(lo, x[i]), Math.max(hi, x[i])];
  const out: number[][] = [];
  let cur: number[] = [idx[0]];
  if (Math.max(pos, neg) >= 3 * Math.min(pos, neg)) {
    // sawtooth: a jump back against the usual direction (not a small jitter) starts a new curve
    const dir = pos > neg ? 1 : -1;
    for (let k = 1; k < idx.length; k++) {
      const d = x[idx[k]] - x[idx[k - 1]];
      if (d * dir < 0 && Math.abs(d) > 0.25 * (hi - lo)) {
        out.push(cur);
        cur = [];
      }
      cur.push(idx[k]);
    }
  } else {
    // zigzag: every turn starts a new curve
    let last = 0;
    for (let k = 1; k < idx.length; k++) {
      const d = x[idx[k]] - x[idx[k - 1]];
      const s = Math.sign(d);
      if (s && last && s !== last) {
        out.push(cur);
        cur = [idx[k - 1]];
      }
      if (s) last = s;
      cur.push(idx[k]);
    }
  }
  out.push(cur);
  // scattered X (unordered samples) is not a sweep: the curves would be a few points each
  const lens = out.map((r) => r.length).sort((a, b) => a - b);
  return out.length > 1 && lens[Math.floor(lens.length / 2)] >= 3 ? out : null;
}

// The same X values met again and again (1, 1, 2, 2, 3, 3 or 1, 2, 3, 1, 2, 3): the k-th time a value is met → curve k.
// strict (auto): every value met as often (a measured X repeating by chance is not a sweep)
function repeats(x: ArrayLike<number>, idx: number[], strict: boolean): number[][] | null {
  const seen = new Map<number, number>();
  const out: number[][] = [];
  for (const i of idx) {
    const v = x[i];
    const k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    (out[k] ??= []).push(i);
  }
  if (out.length < 2 || out.length > idx.length / 2) return null;
  const lens = out.map((r) => r.length);
  return !strict || minOf(lens) >= Math.max(2, 0.5 * maxOf(lens)) ? out : null;
}

// The groups of equal values of a column (text or numbers), in the order they are first met.
function byColumn(c: Column, idx: number[]): { rows: number[][]; values: number[]; texts?: string[] } {
  const at = new Map<string, number>();
  const rows: number[][] = [];
  const values: number[] = [];
  const texts: string[] = [];
  const text = (i: number) => (c.text && !Number.isFinite(c.values[i]) ? (c.text[i] ?? '') : '');
  for (const i of idx) {
    const t = text(i);
    const key = t ? `t${t}` : `n${c.values[i]}`;
    let k = at.get(key);
    if (k === undefined) {
      k = rows.length;
      at.set(key, k);
      rows.push([]);
      values.push(t ? k + 1 : c.values[i]);
      texts.push(t);
    }
    rows[k].push(i);
  }
  return { rows, values, ...(texts.some(Boolean) ? { texts: texts.map((t, k) => t || fmtNum(values[k])) } : {}) };
}

// A column with one value in each group, and not the same in all: the parameter of the sweep.
function constantIn(c: Column, rows: number[][]): number[] | null {
  const vals: number[] = [];
  for (const r of rows) {
    const v = c.values[r[0]];
    if (!Number.isFinite(v)) return null;
    for (const i of r) if (c.values[i] !== v) return null;
    vals.push(v);
  }
  return new Set(vals).size > 1 ? vals : null;
}

// The groups of the rows `idx` of a curve. `others`: the dataset's columns, where the swept parameter is looked for.
export function splitRows(s: CurveSplit, x: Column, idx: number[], groupCol: Column | undefined, others: Column[]): RowGroups | string | null {
  if (s.mode === 'none' || idx.length < 2) return null;
  let rows: number[][] | null = null;
  let how = '';
  if (s.mode === 'column') {
    if (!groupCol) return 'Choose the column whose equal values make one curve (or connect it to the “group” port).';
    const g = byColumn(groupCol, idx);
    if (g.rows.length > MAX_GROUPS) return `“${groupCol.name}” has ${g.rows.length} different values: too many curves (at most ${MAX_GROUPS}).`;
    return { ...g, name: groupCol.name, how: `by ${groupCol.name}` };
  }
  const o = s.cycle ?? {};
  const tolFrac = (o.tol ?? 0.5) / 100;
  // gone: how many pieces were left out or joined to a block next to them
  const partWord = (parts: boolean[], gone: number) => {
    const p = parts.filter(Boolean).length;
    const left = p ? `; ${p} not whole` : '';
    return gone ? `${left}; ${gone} piece${gone > 1 ? 's' : ''} not whole ${o.partial === 'join' ? 'joined to the block next to them' : 'left out'}` : left;
  };
  if (s.mode === 'direction') {
    const g = segmentGroups(x.values, idx, tolFrac);
    if (g.rows.length < 2) return `${x.name || 'X'} never changes direction: one block.`;
    const d = partsDone(g.rows, g.parts, o.partial);
    if (!d.rows.length) return 'No whole segment: every one starts or stops on the way (Incomplete ▸ keep them).';
    if (d.rows.length > MAX_GROUPS) return `${d.rows.length} pieces: too many (at most ${MAX_GROUPS}).`;
    return { rows: d.rows, values: d.rows.map((_, k) => k + 1), name: '', word: 'segment', parts: d.parts, how: `where ${x.name || 'X'} changes direction${partWord(d.parts, g.rows.length - d.rows.length)}` };
  }
  if (s.mode === 'cycles') {
    const c = cycleRows(x.values, idx, o);
    if (typeof c === 'string') return c;
    if (!c) return `${x.name || 'X'} does not go back: no cycles.`;
    const d = partsDone(c.rows, c.parts, o.partial);
    if (!d.rows.length) return 'No whole cycle: the scan never comes back where a cycle starts (Incomplete ▸ keep them, or another start).';
    const how = `the cycles of ${x.name || 'X'} ${c.how}${partWord(d.parts, c.rows.length - d.rows.length)}`;
    if (!o.halves) {
      if (d.rows.length > MAX_GROUPS) return `${d.rows.length} cycles: too many (at most ${MAX_GROUPS}).`;
      return { rows: d.rows, values: d.rows.map((_, k) => k + 1), name: '', word: 'cycle', parts: d.parts, how };
    }
    // every cycle cut where it turns: its way up and its way down, each named by the cycle
    const rows: number[][] = [];
    const values: number[] = [];
    const labels: string[] = [];
    const parts: boolean[] = [];
    d.rows.forEach((r, k) => {
      const segs = segmentRows(x.values, r, tolFrac);
      const ways = segs.map((g) => (x.values[g[g.length - 1]] >= x.values[g[0]] ? 'up' : 'down'));
      segs.forEach((g, j) => {
        rows.push(g);
        values.push(k + 1);
        // a way met twice in a cycle (a piece of the start joined to it): numbered
        labels.push(`cycle ${k + 1} · ${ways[j]}${ways.filter((w) => w === ways[j]).length > 1 ? ` ${ways.slice(0, j + 1).filter((w) => w === ways[j]).length}` : ''}`);
        parts.push(!!d.parts[k]);
      });
    });
    if (rows.length > MAX_GROUPS) return `${rows.length} halves: too many (at most ${MAX_GROUPS}).`;
    return { rows, values, name: '', word: 'cycle', labels, parts, how: `${how}; each cut into its way up and down` };
  }
  if (s.mode === 'jump') {
    const j = jumpRows(x.values, idx, s.jump);
    const t = `${fmtNum(j.thr, 4)}${j.auto ? ' (5 × its usual step)' : ''}`;
    if (j.rows.length < 2) return `${x.name || 'X'} never changes by more than ${t}: one block.`;
    if (j.rows.length > MAX_GROUPS) return `${j.rows.length} blocks: too many (at most ${MAX_GROUPS}).`;
    return { rows: j.rows, values: j.rows.map((_, k) => k + 1), name: '', how: `where ${x.name || 'X'} jumps by more than ${t}` };
  }
  if (s.mode === 'every') {
    const n = Math.floor(s.every ?? 0);
    if (!(n >= 1)) return 'Write how many rows make one curve.';
    rows = [];
    for (let k = 0; k < idx.length; k += n) rows.push(idx.slice(k, k + n));
    how = `every ${n} rows`;
  } else {
    if (s.mode === 'auto') {
      rows = restarts(x.values, idx);
      if (rows) how = `where ${x.name || 'X'} starts again`;
    }
    if (!rows) {
      rows = repeats(x.values, idx, s.mode === 'auto');
      if (rows) how = `${x.name || 'X'} values repeated`;
    }
    if (!rows) return s.mode === 'auto' ? null : `No value of ${x.name || 'X'} is repeated.`;
  }
  if (rows.length > MAX_GROUPS) return `${rows.length} curves found (${how}): too many (at most ${MAX_GROUPS}).`;
  // the swept parameter: a column constant in every group
  for (const c of others) {
    if (c === x) continue;
    const v = constantIn(c, rows);
    if (v) return { rows, values: v, name: c.name, how: `${how}; named by ${c.name}` };
  }
  return { rows, values: rows.map((_, k) => k + 1), name: '', how };
}

// The text of a group in the legend: "pore fraction = 0.25", or "curve 3".
export function groupText(g: RowGroups, k: number): string {
  const v = g.texts?.[k] ?? fmtNum(g.values[k], 4);
  if (!g.name) return `${g.word ?? 'curve'} ${k + 1}`;
  return valueText(g.name, v, !!g.texts);
}

// A column restricted to some of its rows.
export function takeRows(c: Column, rows: number[]): Column {
  const values = new Float64Array(rows.length);
  rows.forEach((i, k) => (values[k] = i < c.values.length ? c.values[i] : NaN));
  return { ...c, values, ...(c.text ? { text: rows.map((i) => c.text![i] ?? '') } : {}), ...(c.mask ? { mask: Uint8Array.from(rows, (i) => c.mask![i] ?? 0) } : {}) };
}

// Row numbers (from 1) as a short text: [1, 2, 3, 7, 9, 10] → "1-3, 7, 9-10".
export function rowsText(list: number[]): string {
  const s = [...new Set(list)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let k = 0; k < s.length; ) {
    let j = k;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > k ? `${s[k]}-${s[j]}` : `${s[k]}`);
    k = j + 1;
  }
  return parts.join(', ');
}
