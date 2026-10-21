// Filter & sort rows and Clean data: the rows of a whole dataset chosen, merged, sorted, thinned; the missing values
// filled or the rows dropped; the outliers found and masked, dropped or replaced — with a table of what changed.
import { tInv } from './dist.ts';
import { pick } from './extract.ts';
import { selectRows, type RowSelect } from './rowsel.ts';
import { interpolator } from './signal.ts';
import { column, curvesByRole, findColumn, roleOf, type Column, type Dataset } from './table.ts';
import { maxOf, minOf } from './minmax.ts';

// the rows of every column taken (k = an input row), the masks and texts too
function takeRows(ds: Dataset, rows: number[]): Column[] {
  return ds.columns.map((c) => ({
    ...c,
    values: Float64Array.from(rows, (i) => (i < c.values.length ? c.values[i] : NaN)),
    ...(c.text ? { text: rows.map((i) => c.text![i] ?? '') } : {}),
    ...(c.mask ? { mask: Uint8Array.from(rows, (i) => c.mask![i] ?? 0) } : {}),
  }));
}
const designatedX = (ds: Dataset) => ds.columns.find((_, j) => roleOf(ds.columns, j) === 'x');

// ---- Filter & sort rows ----
// a sort key: a column, from the largest value down (desc) or from the smallest up
export type SortKey = { col: string; desc: boolean };
export type FilterData = {
  rows: RowSelect; // the rows kept: all, ranges (by row or X), a list, a rule (a condition of x, A, B …, i, n)
  dup: 'keep' | 'first' | 'mean'; // rows with the same value of dupCol: kept, the first one, or merged (the numbers averaged)
  dupCol: string; // '' = the designated X; a list (2, B-D, names): repeated in all of them together
  sortBy: string; // '' = not sorted (older projects; `sorts` when present)
  desc: boolean;
  // sorted by several columns: by the first, rows equal in it by the second, and so on (older projects; `sortRules`
  // when present)
  sorts?: SortKey[];
  // the sort rules, applied in turn (absent: one rule from `sorts` / `sortBy`)
  sortRules?: SortRule[];
  // a workbook on the input: its sheet (absent: the first); '*': every sheet, a workbook out
  sheet?: string;
  // after sorting: only the first N rows kept (absent or 0: all), as the 5 largest values; or the last N
  top?: number;
  topFrom?: 'start' | 'end';
  every: number; // one row in every N (1: all)
  // the rows empty in every column: kept (absent) or removed
  empty?: 'keep' | 'remove';
};
// the sort keys of a filter (an older project: its one column)
export const sortKeysOf = (d: Pick<FilterData, 'sorts' | 'sortBy' | 'desc'>): SortKey[] => d.sorts ?? (d.sortBy ? [{ col: d.sortBy, desc: d.desc }] : []);
// A sort rule: the columns it moves (cols: '' = whole rows, every column with them; else a list: 2-4, B-D, names) —
// by columns (keys: the first, rows equal in it by the next …), each column by its own values (desc: largest first),
// or put in the reverse order (the last row first)
export type SortRule = { cols?: string; how: 'by' | 'own' | 'reverse'; keys?: SortKey[]; desc?: boolean };
// the sort rules of a filter (an older project: one rule of whole rows by its keys)
export function sortRulesOf(d: Pick<FilterData, 'sorts' | 'sortBy' | 'desc' | 'sortRules'>): SortRule[] {
  if (d.sortRules) return d.sortRules;
  const keys = sortKeysOf(d);
  return keys.length ? [{ how: 'by', keys }] : [];
}

const isMissing = (w: string | number) => typeof w === 'number' && !Number.isFinite(w);
// two cells of a column compared: numbers, or text in its natural order; empty cells last whatever the order
function compareCells(s: Column, desc: boolean, a: number, b: number): number {
  const val = (i: number) => (i >= s.values.length ? NaN : s.text?.[i]?.trim() ? s.text[i] : s.values[i]);
  const [u, v] = [val(a), val(b)];
  if (isMissing(u) || isMissing(v)) return isMissing(u) === isMissing(v) ? 0 : isMissing(u) ? 1 : -1;
  const c = typeof u === 'string' || typeof v === 'string' ? String(u).localeCompare(String(v), undefined, { numeric: true }) : (u as number) - (v as number);
  return desc ? -c : c;
}
// a column with its rows in a new order (idx: the rows taken; past its end: empty)
function reordered(c: Column, idx: number[]): Column {
  return {
    ...c,
    values: Float64Array.from(idx, (i) => (i < c.values.length ? c.values[i] : NaN)),
    ...(c.text ? { text: idx.map((i) => c.text![i] ?? '') } : {}),
    ...(c.mask ? { mask: Uint8Array.from(idx, (i) => c.mask![i] ?? 0) } : {}),
  };
}
// the order of the rows 0 … n−1 sorted by the keys in turn (stable)
function sortedOrder(n: number, by: { s: Column; desc: boolean }[]): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => {
    for (const k of by) {
      const c = compareCells(k.s, k.desc, a, b);
      if (c) return c;
    }
    return a - b;
  });
  return idx;
}
// One sort rule on the columns: their new columns, what it did, or why not
function applySortRule(cols: Column[], r: SortRule): { cols: Column[]; text: string } | string | null {
  const len = (cs: Column[]) => Math.max(0, maxOf(cs.map((c) => c.values.length)));
  // the columns moved
  let moved: number[];
  if (r.cols?.trim()) {
    const one = findColumn(cols, r.cols);
    if (one) moved = [cols.indexOf(one)];
    else {
      const p = pick(r.cols, cols.map((c) => c.name), true);
      if (p.missing.length || !p.found.length) return `Sort: no column ${(p.missing.length ? p.missing : [r.cols]).map((m) => `“${m}”`).join(', ')}.`;
      moved = p.found;
    }
  } else moved = cols.map((_, j) => j);
  const whole = !r.cols?.trim();
  const which = whole ? 'rows' : moved.map((j) => cols[j].name).join(', ');
  const out = [...cols];
  if (r.how === 'reverse') {
    // the rows with data reversed; the empty rows after them (a sheet longer than its data) stay at the end
    const filled = (cs: Column[]) => {
      let k = len(cs);
      while (k > 0 && cs.every((c) => !(k - 1 < c.values.length && Number.isFinite(c.values[k - 1])) && !c.text?.[k - 1]?.trim())) k--;
      return k;
    };
    const order = (m: number, total: number) => [...Array.from({ length: m }, (_, i) => m - 1 - i), ...Array.from({ length: total - m }, (_, i) => m + i)];
    if (whole) {
      const idx = order(filled(cols), len(cols));
      return { cols: cols.map((c) => reordered(c, idx)), text: 'the rows reversed' };
    }
    for (const j of moved) out[j] = reordered(cols[j], order(filled([cols[j]]), cols[j].values.length));
    return { cols: out, text: `${which} reversed` };
  }
  if (r.how === 'own') {
    for (const j of moved) out[j] = reordered(cols[j], sortedOrder(cols[j].values.length, [{ s: cols[j], desc: !!r.desc }]));
    return { cols: out, text: `${whole ? 'every column' : which} sorted on its own${r.desc ? ' (largest first)' : ''}` };
  }
  const keys = (r.keys ?? []).filter((k) => k.col);
  if (!keys.length) return null;
  const by: { s: Column; desc: boolean }[] = [];
  for (const k of keys) {
    const s = findColumn(cols, k.col);
    if (!s) return `No column “${k.col}” to sort by.`;
    by.push({ s, desc: k.desc });
  }
  const idx = sortedOrder(len([...by.map((k) => k.s), ...moved.map((j) => cols[j])]), by);
  for (const j of moved) out[j] = reordered(cols[j], idx);
  return { cols: out, text: `${whole ? 'sorted' : `${which} sorted`} by ${by.map((k) => `${k.s.name}${k.desc ? ' (largest first)' : ''}`).join(', then ')}` };
}
export function filterRows(ds: Dataset, d: FilterData): { dataset: Dataset; report: string; text: string } | string {
  const n = Math.max(0, maxOf(ds.columns.map((c) => c.values.length)));
  const X = designatedX(ds);
  const sel = selectRows(d.rows, n, X, ds.columns);
  if (typeof sel === 'string') return sel;
  let rows = sel.rows;
  let cols = takeRows(ds, rows);
  const steps: string[] = [];
  if (sel.text) steps.push(`kept ${sel.text}`);
  // the rows empty in every column removed
  if (d.empty === 'remove') {
    const keep = rows.map((_, k) => k).filter((k) => cols.some((c) => Number.isFinite(c.values[k]) || !!c.text?.[k]?.trim()));
    if (keep.length < rows.length) {
      steps.push(`${rows.length - keep.length} empty row${rows.length - keep.length > 1 ? 's' : ''} removed`);
      rows = keep.map((k) => rows[k]);
      cols = cols.map((c) => reordered(c, keep));
    }
  }
  // duplicates
  if (d.dup !== 'keep') {
    // repeated in one column, or in several together (a list: the same sample on the same day)
    let keys: Column[];
    if (!d.dupCol) {
      const x = designatedX({ name: '', columns: cols }) ?? cols[0];
      if (!x) return 'No column to find duplicates in.';
      keys = [x];
    } else {
      const one = findColumn(cols, d.dupCol);
      const p = one ? null : pick(d.dupCol, cols.map((c) => c.name), true);
      if (p && (p.missing.length || !p.found.length)) return `No column ${(p.missing.length ? p.missing : [d.dupCol]).map((m) => `“${m}”`).join(', ')}.`;
      keys = one ? [one] : p!.found.map((j) => cols[j]);
    }
    const key = { name: keys.map((c) => c.name).join(' + ') };
    const cell = (c: Column, i: number) => (c.text?.[i]?.trim() ? `t:${c.text[i]}` : `v:${c.values[i]}`);
    const groups = new Map<string, number[]>();
    for (let i = 0; i < rows.length; i++) {
      const k = keys.map((c) => cell(c, i)).join('\u0001');
      const g = groups.get(k);
      if (g) g.push(i);
      else groups.set(k, [i]);
    }
    const firsts = [...groups.values()];
    const merged = firsts.filter((g) => g.length > 1).length;
    if (d.dup === 'first') {
      const keep = firsts.map((g) => g[0]).sort((a, b) => a - b);
      cols = cols.map((c) => ({ ...c, values: Float64Array.from(keep, (i) => c.values[i]), ...(c.text ? { text: keep.map((i) => c.text![i]) } : {}), ...(c.mask ? { mask: Uint8Array.from(keep, (i) => c.mask![i]) } : {}) }));
    } else {
      // merged: every numeric column averaged over the rows of the group (the text of the first)
      cols = cols.map((c) => ({
        ...c,
        values: Float64Array.from(firsts, (g) => {
          const v = g.map((i) => c.values[i]).filter(Number.isFinite);
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
        }),
        ...(c.text ? { text: firsts.map((g) => c.text![g[0]]) } : {}),
        ...(c.mask ? { mask: Uint8Array.from(firsts, (g) => (g.every((i) => c.mask![i]) ? 1 : 0)) } : {}),
      }));
    }
    rows = firsts.map((g) => g[0]);
    if (merged) steps.push(`${merged} repeated value${merged > 1 ? 's' : ''} of ${key.name} ${d.dup === 'first' ? 'kept once' : 'averaged'}`);
  }
  // the sort rules in turn
  for (const rule of sortRulesOf(d)) {
    const r = applySortRule(cols, rule);
    if (r === null) continue;
    if (typeof r === 'string') return r;
    cols = r.cols;
    steps.push(r.text);
  }
  // only the first (or the last) N rows
  const top = Math.max(0, Math.floor(d.top ?? 0) || 0);
  const len0 = Math.max(0, maxOf(cols.map((c) => c.values.length)));
  if (top > 0 && top < len0) {
    const [a, b] = d.topFrom === 'end' ? [len0 - top, len0] : [0, top];
    cols = cols.map((c) => ({ ...c, values: c.values.slice(a, b), ...(c.text ? { text: c.text.slice(a, b) } : {}), ...(c.mask ? { mask: c.mask.slice(a, b) } : {}) }));
    steps.push(`the ${d.topFrom === 'end' ? 'last' : 'first'} ${top} row${top > 1 ? 's' : ''} kept`);
  }
  // one in every N
  const every = Math.max(1, Math.floor(d.every) || 1);
  if (every > 1) {
    const len = Math.max(0, maxOf(cols.map((c) => c.values.length)));
    const keep = Array.from({ length: Math.ceil(len / every) }, (_, k) => k * every);
    cols = cols.map((c) => ({ ...c, values: Float64Array.from(keep, (i) => c.values[i]), ...(c.text ? { text: keep.map((i) => c.text![i]) } : {}), ...(c.mask ? { mask: Uint8Array.from(keep, (i) => c.mask![i]) } : {}) }));
    steps.push(`one row in every ${every}`);
  }
  const out = Math.max(0, maxOf(cols.map((c) => c.values.length)));
  return { dataset: { name: ds.name, columns: cols }, report: `${n} → ${out} rows${steps.length ? `: ${steps.join('; ')}` : ''}.`, text: sel.text };
}

// ---- Clean data ----
export type CleanData = {
  cols: string; // the columns cleaned ('' = the Y columns)
  missing: 'keep' | 'remove' | 'linear' | 'spline' | 'previous' | 'next' | 'constant' | 'movmean';
  value: number; // missing: constant
  window: number; // movmean, movmedian: points
  outliers: 'none' | 'median' | 'quartiles' | 'movmedian' | 'grubbs' | 'gesd';
  k: number; // median, movmedian: × the scaled MAD; quartiles: × the IQR
  alpha: number; // Grubbs, GESD
  action: 'mask' | 'remove' | 'linear' | 'median' | 'clip';
};
export type Change = { row: number; column: string; old: number; new: number; why: string };

const med = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN;
};
const quantile = (s: number[], p: number) => {
  const h = (s.length - 1) * p;
  return s[Math.floor(h)] + (h - Math.floor(h)) * (s[Math.ceil(h)] - s[Math.floor(h)]);
};
// the outliers of v (only its finite values): their indices, and the bounds (for clipping)
export function findOutliers(v: number[], how: CleanData['outliers'], k: number, alpha: number, window: number): { out: Set<number>; lo: number[]; hi: number[] } {
  const n = v.length;
  const ok = v.map((_, i) => i).filter((i) => Number.isFinite(v[i]));
  const out = new Set<number>();
  let lo = new Array<number>(n).fill(-Infinity);
  let hi = new Array<number>(n).fill(Infinity);
  if (how === 'median' || how === 'quartiles') {
    const vals = ok.map((i) => v[i]);
    let a: number;
    let b: number;
    if (how === 'median') {
      const m = med(vals);
      const s = 1.4826 * med(vals.map((x) => Math.abs(x - m)));
      [a, b] = [m - k * s, m + k * s];
    } else {
      const s = [...vals].sort((p, q) => p - q);
      const [q1, q3] = [quantile(s, 0.25), quantile(s, 0.75)];
      [a, b] = [q1 - k * (q3 - q1), q3 + k * (q3 - q1)];
    }
    lo = lo.map(() => a);
    hi = hi.map(() => b);
  } else if (how === 'movmedian') {
    const h = Math.max(1, Math.floor(Math.max(3, window) / 2));
    for (let p = 0; p < ok.length; p++) {
      const win = ok.slice(Math.max(0, p - h), Math.min(ok.length, p + h + 1)).map((i) => v[i]);
      const m = med(win);
      const s = 1.4826 * med(win.map((x) => Math.abs(x - m)));
      [lo[ok[p]], hi[ok[p]]] = [m - k * s, m + k * s];
    }
  } else if (how === 'grubbs' || how === 'gesd') {
    // Grubbs repeated while it finds one; GESD (Rosner 1983) up to 10 % of the values
    const left = [...ok];
    const maxOut = how === 'gesd' ? Math.max(1, Math.ceil(0.1 * ok.length)) : ok.length - 2;
    const R: number[] = [];
    const L: number[] = [];
    const cand: number[] = [];
    for (let i = 1; i <= maxOut && left.length > 2; i++) {
      const m = left.reduce((s, j) => s + v[j], 0) / left.length;
      const sd = Math.sqrt(left.reduce((s, j) => s + (v[j] - m) ** 2, 0) / (left.length - 1));
      if (!(sd > 0)) break;
      let far = 0;
      left.forEach((j, q) => Math.abs(v[j] - m) > Math.abs(v[left[far]] - m) && (far = q));
      const nn = left.length;
      const Ri = Math.abs(v[left[far]] - m) / sd;
      const t = tInv(1 - alpha / (2 * nn), nn - 2);
      const lam = ((nn - 1) * t) / Math.sqrt((nn - 2 + t * t) * nn);
      if (how === 'grubbs' && Ri <= lam) break;
      R.push(Ri);
      L.push(lam);
      cand.push(left[far]);
      left.splice(far, 1);
    }
    let count = how === 'grubbs' ? cand.length : 0;
    if (how === 'gesd') for (let i = R.length; i >= 1; i--) if (R[i - 1] > L[i - 1]) {
      count = i;
      break;
    }
    cand.slice(0, count).forEach((j) => out.add(j));
    // the bounds: the extremes of the values kept
    const kept = ok.filter((j) => !out.has(j)).map((j) => v[j]);
    lo = lo.map(() => minOf(kept));
    hi = hi.map(() => maxOf(kept));
    return { out, lo, hi };
  }
  if (how !== 'none') for (const i of ok) if (v[i] < lo[i] || v[i] > hi[i]) out.add(i);
  return { out, lo, hi };
}

export function cleanData(ds: Dataset, d: CleanData): { dataset: Dataset; changes: Change[]; report: string[] } | string {
  const all = ds.columns;
  let targets: Column[];
  if (d.cols.trim()) {
    const p = pick(d.cols, all.map((c) => c.name), true);
    if (p.missing.length) return `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
    targets = p.found.map((j) => all[j]);
  } else targets = all.filter((_, j) => roleOf(all, j) === 'y');
  if (!targets.length) return 'Choose the columns to clean (or designate them Y).';
  const n = Math.max(0, maxOf(all.map((c) => c.values.length)));
  const roles = curvesByRole(all).curves;
  const xOf = (c: Column) => findColumn(all, roles.find((r) => findColumn(all, r.y) === c)?.x ?? '') ?? designatedX(ds);
  const changes: Change[] = [];
  const drop = new Set<number>();
  const report: string[] = [];
  const masks = new Map<string, Uint8Array>();
  const newVals = new Map<string, Float64Array>();
  for (const c of targets) {
    const X = xOf(c);
    const xv = (i: number) => (X ? X.values[i] : i + 1);
    const v = Array.from({ length: n }, (_, i) => (i < c.values.length ? c.values[i] : NaN));
    // missing values: the rows whose X is a number but not this value
    const miss = v.map((_, i) => i).filter((i) => !Number.isFinite(v[i]) && Number.isFinite(xv(i)) && !c.text?.[i]?.trim());
    if (miss.length && d.missing !== 'keep') {
      if (d.missing === 'remove') miss.forEach((i) => drop.add(i));
      else {
        const good = v.map((_, i) => i).filter((i) => Number.isFinite(v[i]) && Number.isFinite(xv(i)));
        const f = d.missing === 'linear' || d.missing === 'spline' ? interpolator(good.map(xv), good.map((i) => v[i]), d.missing, 'constant') : null;
        for (const i of miss) {
          let w = NaN;
          if (f) w = f(xv(i));
          else if (d.missing === 'constant') w = d.value;
          else if (d.missing === 'previous') for (let j = i - 1; j >= 0 && !Number.isFinite(w); j--) w = v[j];
          else if (d.missing === 'next') for (let j = i + 1; j < n && !Number.isFinite(w); j++) w = v[j];
          else {
            const h = Math.max(1, Math.floor(d.window / 2));
            const near = v.slice(Math.max(0, i - h), i + h + 1).filter(Number.isFinite);
            w = near.length ? near.reduce((a, b) => a + b, 0) / near.length : NaN;
          }
          changes.push({ row: i + 1, column: c.name, old: NaN, new: w, why: `missing → ${d.missing}` });
          v[i] = w;
        }
      }
      report.push(`${c.name}: ${miss.length} missing value${miss.length > 1 ? 's' : ''} ${d.missing === 'remove' ? '— their rows removed' : `filled (${d.missing})`}.`);
    }
    // outliers
    if (d.outliers !== 'none') {
      const { out, lo, hi } = findOutliers(v, d.outliers, d.k, d.alpha, d.window);
      const idx = [...out].sort((a, b) => a - b);
      if (idx.length) {
        const mask = new Uint8Array(n);
        c.mask?.forEach((m, i) => (mask[i] = m));
        const good = v.map((_, i) => i).filter((i) => Number.isFinite(v[i]) && !out.has(i) && Number.isFinite(xv(i)));
        const f = d.action === 'linear' ? interpolator(good.map(xv), good.map((i) => v[i]), 'linear', 'constant') : null;
        const h = Math.max(1, Math.floor(Math.max(3, d.window) / 2));
        for (const i of idx) {
          let w = v[i];
          if (d.action === 'mask') mask[i] = 1;
          else if (d.action === 'remove') drop.add(i);
          else if (d.action === 'linear') w = f!(xv(i));
          else if (d.action === 'median') w = med(v.slice(Math.max(0, i - h), i + h + 1).filter((x, q) => Number.isFinite(x) && !out.has(Math.max(0, i - h) + q)));
          else w = Math.min(hi[i], Math.max(lo[i], v[i]));
          changes.push({ row: i + 1, column: c.name, old: v[i], new: d.action === 'mask' || d.action === 'remove' ? NaN : w, why: `outlier (${d.outliers}) → ${d.action}` });
          v[i] = w;
        }
        if (d.action === 'mask') masks.set(c.name, mask);
      }
      report.push(`${c.name}: ${idx.length} outlier${idx.length === 1 ? '' : 's'} (${d.outliers})${idx.length ? ` — ${d.action === 'mask' ? 'masked' : d.action === 'remove' ? 'their rows removed' : d.action === 'clip' ? 'clipped to the bounds' : `replaced (${d.action === 'linear' ? 'interpolated' : 'the median around'})`}: row${idx.length > 1 ? 's' : ''} ${idx.slice(0, 12).map((i) => i + 1).join(', ')}${idx.length > 12 ? ' …' : ''}` : ''}.`);
    }
    newVals.set(c.name, Float64Array.from(v));
  }
  const keep = Array.from({ length: n }, (_, i) => i).filter((i) => !drop.has(i));
  const columns = all.map((c) => {
    const vals = newVals.get(c.name) ?? c.values;
    const mask = masks.get(c.name) ?? c.mask;
    return {
      ...c,
      values: Float64Array.from(keep, (i) => (i < vals.length ? vals[i] : NaN)),
      ...(c.text ? { text: keep.map((i) => c.text![i] ?? '') } : {}),
      ...(mask ? { mask: Uint8Array.from(keep, (i) => mask[i] ?? 0) } : {}),
    };
  });
  if (drop.size) report.push(`${drop.size} row${drop.size > 1 ? 's' : ''} removed: ${n} → ${keep.length}.`);
  if (!report.length) report.push('Nothing to clean.');
  return { dataset: { name: ds.name, columns }, changes, report };
}
export const changesTable = (ch: Change[]): Dataset => ({
  name: 'changes',
  columns: [
    { ...column('row', Float64Array.from(ch, (c) => c.row)), role: 'x' },
    { ...column('column', Float64Array.from(ch, () => NaN), ch.map((c) => c.column)), role: 'label' },
    { ...column('old', Float64Array.from(ch, (c) => c.old)), role: 'y' },
    { ...column('new', Float64Array.from(ch, (c) => c.new)), role: 'y' },
    { ...column('why', Float64Array.from(ch, () => NaN), ch.map((c) => c.why)), role: 'label' },
  ],
});

