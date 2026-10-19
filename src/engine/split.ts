// One curve split into several: a sweep saved in one long table (θ from 40 to 90, again from 40 to 90 … for every
// value of a parameter) is many curves, not one. The groups of rows are found from X (where it starts again, or where a
// value repeats) or given by a column (equal values = one curve), or are blocks of N rows, or the cycles of a scan that
// goes and comes back (a cyclic voltammogram: X up, down, back to where it started). A column constant within every
// group and changing between them (the swept parameter) names the curves and colours them.
import { fmtNum, valueText, type Column } from './table.ts';
import { maxOf, minOf } from './minmax.ts';

export type SplitMode = 'none' | 'auto' | 'column' | 'repeat' | 'every' | 'cycles' | 'direction';
export type CurveSplit = {
  mode: SplitMode;
  column?: string; // 'column': the column whose equal values make a curve (the dataset's, or the group port)
  every?: number; // 'every': rows per curve
  groups?: string; // the curves drawn, by number: "1-10, 20, 1:5:end" ('' = all)
  color?: 'map' | 'palette' | 'same'; // the colour map of the curve's style over the group values, the palette, one colour
};
export type RowGroups = {
  rows: number[][]; // the rows of each group, in their order
  values: number[]; // the value of each group (the parameter, else its number)
  texts?: string[]; // text values of a text column
  name: string; // what the values are ('' = the group number)
  word?: string; // without a name: “cycle 2” instead of “curve 2”
  how: string; // how they were found, for the node
};

export const MAX_GROUPS = 5000;

// The turning points of X along the rows `idx` (positions in idx): where it goes back by more than a small tolerance
// (0.5 % of its range), so the noise of a measured potential does not turn it.
export function turns(x: ArrayLike<number>, idx: number[]): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const i of idx) if (Number.isFinite(x[i])) [lo, hi] = [Math.min(lo, x[i]), Math.max(hi, x[i])];
  const tol = 0.005 * (hi - lo || 1);
  const out: number[] = [];
  let dir = 0;
  let ext = 0;
  for (let k = 1; k < idx.length; k++) {
    const d = x[idx[k]] - x[idx[ext]];
    if (!Number.isFinite(d)) continue;
    if (dir === 0) {
      if (Math.abs(d) > tol) [dir, ext] = [Math.sign(d), k];
    } else if (d * dir > 0) ext = k;
    else if (-d * dir > tol) {
      out.push(ext);
      dir = -dir;
      ext = k;
    }
  }
  return out;
}

// The pieces of a curve where X goes one way (up or down) between two turns; the turning point in both pieces.
export function segmentRows(x: ArrayLike<number>, idx: number[]): number[][] {
  const t = turns(x, idx);
  const cuts = [0, ...t, idx.length - 1];
  const out: number[][] = [];
  for (let j = 0; j + 1 < cuts.length; j++) {
    const seg = idx.slice(cuts[j], cuts[j + 1] + 1);
    if (seg.length >= 2) out.push(seg);
  }
  return out;
}

// The cycles of a scan: a cycle ends where X, after turning twice, comes back to where it started going the first way;
// the point where one ends is the first of the next.
function cycleRows(x: ArrayLike<number>, idx: number[]): number[][] | null {
  const t = new Set(turns(x, idx));
  if (!t.size) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const i of idx) if (Number.isFinite(x[i])) [lo, hi] = [Math.min(lo, x[i]), Math.max(hi, x[i])];
  const tol = 0.005 * (hi - lo || 1);
  const xs = x[idx[0]];
  let d0 = 0;
  for (let k = 1; k < idx.length && !d0; k++) if (Math.abs(x[idx[k]] - xs) > tol) d0 = Math.sign(x[idx[k]] - xs);
  const out: number[][] = [];
  let start = 0;
  let seen = 0;
  for (let k = 1; k < idx.length; k++) {
    if (t.has(k - 1)) seen++;
    const [a, b] = [x[idx[k - 1]], x[idx[k]]];
    if (seen >= 2 && (b - a) * d0 > 0 && (a - xs) * d0 <= tol && (b - xs) * d0 > 0) {
      // the point nearest the start closes this cycle and opens the next (both have it: whole loops, aligned X)
      const c = Math.abs(a - xs) <= Math.abs(b - xs) ? k - 1 : k;
      out.push(idx.slice(start, c + 1));
      start = c;
      seen = 0;
    }
  }
  out.push(idx.slice(start));
  return out.length > 1 || t.size ? out.filter((r) => r.length > 1) : null;
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
  if (s.mode === 'direction') {
    const segs = segmentRows(x.values, idx);
    if (segs.length < 2) return `${x.name || 'X'} never changes direction: one block.`;
    if (segs.length > MAX_GROUPS) return `${segs.length} pieces: too many (at most ${MAX_GROUPS}).`;
    return { rows: segs, values: segs.map((_, k) => k + 1), name: '', word: 'segment', how: `where ${x.name || 'X'} changes direction` };
  }
  if (s.mode === 'cycles') {
    const c = cycleRows(x.values, idx);
    if (!c) return `${x.name || 'X'} does not go back: no cycles.`;
    if (c.length > MAX_GROUPS) return `${c.length} cycles: too many (at most ${MAX_GROUPS}).`;
    return { rows: c, values: c.map((_, k) => k + 1), name: '', word: 'cycle', how: `the cycles of ${x.name || 'X'} (up, down, back)` };
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
