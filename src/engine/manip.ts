// Data manipulation: points of a dataset masked (kept, but left out of fits, smoothing, statistics …), deleted, or
// moved, chosen on its graph. Every change is an operation in a list, applied in order, each one undone on its own; the
// rows are those of the input (counted from 1, as in the worksheet). A mask travels with the columns: Math column and
// the others pass it on, Plot draws masked points grey or hides them.
import { parseRows } from './rows.ts';
import { rowsText } from './split.ts';
import { column, findColumn, type Column, type Dataset } from './table.ts';
import { maxOf } from './minmax.ts';

export type ManipKind = 'mask' | 'unmask' | 'delete' | 'move' | 'scale' | 'set';
// rows: "3, 7-12"; move: dx, dy added; scale: × factor on `axis`; set: `axis` = value. n: the rows the input had then.
export type ManipOp = { kind: ManipKind; rows: string; n: number; dx?: number; dy?: number; axis?: 'x' | 'y'; factor?: number; value?: number };

// The state of every input row after the operations (for the node's graph and table).
export const ROW_MASKED = 1;
export const ROW_DELETED = 2;
export const ROW_CHANGED = 4;
export const ROW_ADDED = 8;

// x, y, state: the input rows, then the points added (state ROW_ADDED); nIn: the input rows
export type ManipResult = { dataset: Dataset; x: Float64Array; y: Float64Array; state: Uint8Array; nIn: number; warnings: string[] };

// OR of the masks of some columns, over n rows (null when none is masked).
export function maskOf(cols: (Column | undefined)[], n: number): Uint8Array | null {
  let out: Uint8Array | null = null;
  for (const c of cols) {
    if (!c?.mask) continue;
    out ??= new Uint8Array(n);
    for (let i = 0; i < Math.min(n, c.mask.length); i++) if (c.mask[i]) out[i] = 1;
  }
  return out;
}

export function applyManip(ds: Dataset, xName: string, yName: string, ops: ManipOp[], added: { x: number; y: number }[] = [], addAt: 'end' | 'start' | 'sorted' = 'end'): ManipResult | string {
  const xi = ds.columns.indexOf(findColumn(ds.columns, xName)!);
  const yi = ds.columns.indexOf(findColumn(ds.columns, yName)!);
  if (yi < 0) return yName ? `No column “${yName}” in the dataset.` : 'Choose the Y column.';
  const n = Math.max(0, maxOf(ds.columns.map((c) => c.values.length)));
  const x = xi >= 0 ? Float64Array.from(ds.columns[xi].values) : Float64Array.from({ length: n }, (_, i) => i + 1);
  const y = Float64Array.from(ds.columns[yi].values);
  const state = new Uint8Array(n);
  const inMask = maskOf(ds.columns, n);
  if (inMask) for (let i = 0; i < n; i++) if (inMask[i]) state[i] |= ROW_MASKED;
  const warnings: string[] = [];
  let changedX = false;
  let changedY = false;
  ops.forEach((op, k) => {
    if (op.n !== n) warnings.push(`Operation ${k + 1} was made on ${op.n} rows, the data now have ${n}: its rows may not be the same.`);
    const rows = parseRows(op.rows, n);
    if (typeof rows === 'string') {
      warnings.push(`Operation ${k + 1}: ${rows}`);
      return;
    }
    for (const i of rows) {
      if (state[i] & ROW_DELETED) continue;
      switch (op.kind) {
        case 'mask':
          state[i] |= ROW_MASKED;
          break;
        case 'unmask':
          state[i] &= ~ROW_MASKED;
          break;
        case 'delete':
          state[i] |= ROW_DELETED;
          break;
        case 'move':
          if (op.dx) {
            if (xi < 0) break;
            x[i] += op.dx;
            changedX = true;
          }
          if (op.dy) {
            y[i] += op.dy;
            changedY = true;
          }
          state[i] |= ROW_CHANGED;
          break;
        case 'scale':
        case 'set': {
          const arr = op.axis === 'x' ? x : y;
          if (op.axis === 'x' && xi < 0) break;
          arr[i] = op.kind === 'scale' ? arr[i] * (op.factor ?? 1) : (op.value ?? NaN);
          if (op.axis === 'x') changedX = true;
          else changedY = true;
          state[i] |= ROW_CHANGED;
          break;
        }
      }
    }
  });
  // the output: the moved values, the mask, and without the deleted rows
  const keep: number[] = [];
  for (let i = 0; i < n; i++) if (!(state[i] & ROW_DELETED)) keep.push(i);
  const all = keep.length === n;
  let anyMask = false;
  for (let i = 0; i < n; i++) if (state[i] & ROW_MASKED && !(state[i] & ROW_DELETED)) anyMask = true;
  const columns = ds.columns.map((c, j) => {
    const vals = j === xi && changedX ? x : j === yi && changedY ? y : c.values;
    const values = all ? vals : Float64Array.from(keep, (i) => (i < vals.length ? vals[i] : NaN));
    const text = c.text && (all ? c.text : keep.map((i) => c.text![i] ?? ''));
    const mask = anyMask ? Uint8Array.from(keep, (i) => (state[i] & ROW_MASKED ? 1 : 0)) : undefined;
    const out = column(c.name, values, text);
    return { ...out, ...(c.role ? { role: c.role } : {}), ...(mask ? { mask } : {}) };
  });
  const pts = added.filter((p) => Number.isFinite(p.y) && (xi < 0 || Number.isFinite(p.x)));
  const outCols = pts.length ? withAdded(columns, xi, yi, pts, addAt) : columns;
  const ax = Float64Array.from([...x, ...pts.map((p) => p.x)]);
  const ay = Float64Array.from([...y, ...pts.map((p) => p.y)]);
  const st = Uint8Array.from([...state, ...pts.map(() => ROW_ADDED)]);
  return { dataset: { name: ds.name, columns: outCols }, x: ax, y: ay, state: st, nIn: n, warnings };
}

// The points added as rows: at the end, at the start, or each where its X belongs (X ascending or descending); there
// the other numeric columns are read between the rows around it (straight line), at the ends they stay empty.
function withAdded(cols: Column[], xi: number, yi: number, pts: { x: number; y: number }[], at: 'end' | 'start' | 'sorted'): Column[] {
  const n = Math.max(0, maxOf(cols.map((c) => c.values.length)));
  // the rows of the output: an input row (r) or an added point (p), with t: where between its two neighbours
  type Row = { r: number } | { p: { x: number; y: number }; lo: number; hi: number; t: number };
  let rows: Row[] = Array.from({ length: n }, (_, r) => ({ r }));
  const blank = (p: { x: number; y: number }): Row => ({ p, lo: -1, hi: -1, t: 0 });
  if (at === 'end') rows = [...rows, ...pts.map(blank)];
  else if (at === 'start') rows = [...pts.map(blank), ...rows];
  else if (xi < 0) rows = [...rows, ...pts.map(blank)];
  else {
    const X = cols[xi].values;
    const finiteRows = rows.filter((q) => 'r' in q && Number.isFinite(X[q.r])) as { r: number }[];
    const up = finiteRows.length < 2 || X[finiteRows[finiteRows.length - 1].r] >= X[finiteRows[0].r];
    for (const p of [...pts].sort((a, b) => (up ? a.x - b.x : b.x - a.x))) {
      const xOf = (q: Row) => ('r' in q ? X[q.r] : q.p.x);
      let k = rows.findIndex((q) => Number.isFinite(xOf(q)) && (up ? xOf(q) > p.x : xOf(q) < p.x));
      if (k < 0) k = rows.length;
      // the input rows around it (for the other columns)
      let lo = -1;
      for (let j = k - 1; j >= 0; j--) if ('r' in rows[j]) {
        lo = (rows[j] as { r: number }).r;
        break;
      }
      let hi = -1;
      for (let j = k; j < rows.length; j++) if ('r' in rows[j]) {
        hi = (rows[j] as { r: number }).r;
        break;
      }
      const t = lo >= 0 && hi >= 0 && X[hi] !== X[lo] ? (p.x - X[lo]) / (X[hi] - X[lo]) : 0;
      rows.splice(k, 0, { p, lo: lo >= 0 && hi >= 0 ? lo : -1, hi: lo >= 0 && hi >= 0 ? hi : -1, t });
    }
  }
  return cols.map((c, j) => {
    const values = Float64Array.from(rows, (q) => {
      if ('r' in q) return q.r < c.values.length ? c.values[q.r] : NaN;
      if (j === xi) return q.p.x;
      if (j === yi) return q.p.y;
      if (q.lo < 0 || c.text) return NaN;
      return c.values[q.lo] + q.t * (c.values[q.hi] - c.values[q.lo]);
    });
    const text = c.text && rows.map((q) => ('r' in q ? (c.text![q.r] ?? '') : ''));
    const mask = c.mask && Uint8Array.from(rows, (q) => ('r' in q ? (c.mask![q.r] ?? 0) : 0));
    return { ...c, values, ...(text ? { text } : {}), ...(mask ? { mask } : {}) };
  });
}

// The operations with their rows counted again after some rows were deleted (Apply to the Import): rows deleted drop out.
export function renumber(ops: ManipOp[], deleted: Set<number>, n: number): ManipOp[] {
  const shift = new Int32Array(n + 1);
  for (let i = 0, d = 0; i < n; i++) {
    shift[i] = d;
    if (deleted.has(i)) d++;
  }
  const left = n - deleted.size;
  return ops.flatMap((op) => {
    const rows = parseRows(op.rows, n);
    if (typeof rows === 'string') return [op];
    const kept = rows.filter((i) => !deleted.has(i)).map((i) => i - shift[i] + 1);
    return kept.length ? [{ ...op, rows: rowsText(kept), n: left }] : [];
  });
}
