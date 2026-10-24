// The worksheet of an Import: what was changed by hand in the table read from the file (or typed into an empty one),
// kept apart from the file so the file stays as it is and every change can be undone. Rows and columns are named by
// their place in the table as read; new ones come after the last.
import { columnLetter, parseCsv, parseNumber, type CsvOptions } from './csv.ts';
import { column, withUnit, type Column, type ColumnRole, type Dataset } from './table.ts';
import { maxOf } from './minmax.ts';
import { toNumbers, type ToNumberRules } from './convert.ts';

export type SheetEdits = {
  cells?: Record<string, string>; // "row:col" → the cell as typed
  // column → its header (unit / comment: older projects — the unit is written into the name, the comment left out)
  cols?: Record<string, ColumnHead>;
  delRows?: number[];
  delCols?: number[];
  addRows?: number; // empty rows after the last
  addCols?: number; // empty columns after the last
  order?: number[]; // the columns (by their place as read) in the order shown — moved with the mouse; others after them
  rowOrder?: number[]; // the rows (by their place as read) in the order shown — a row inserted between; others after them
  locked?: number[]; // the columns (by their place as read) locked: their name and values not changed, not deleted
};
// How the worksheet of an Import or a Workbook is drawn: the node's width and the table's height (dragged at its corner),
// the rows' height (one for all), every column's width (by its name). Pixels of the canvas; absent: the defaults.
export type SheetLook = { w?: number; h?: number; rowH?: number; cols?: Record<string, number> };
// The table as shown: which row / column of the table as read each shown one is.
export type SheetMap = { rows: number[]; cols: number[]; baseRows: number; baseCols: number };

export const hasEdits = (e: SheetEdits | undefined) =>
  !!e && (Object.keys(e.cells ?? {}).length > 0 || Object.keys(e.cols ?? {}).length > 0 || !!e.delRows?.length || !!e.delCols?.length || !!e.addRows || !!e.addCols || !!e.order?.length || !!e.rowOrder?.length);
export const editCount = (e: SheetEdits | undefined) =>
  !e ? 0 : Object.keys(e.cells ?? {}).length + Object.keys(e.cols ?? {}).length + (e.delRows?.length ?? 0) + (e.delCols?.length ?? 0) + (e.addRows ?? 0) + (e.addCols ?? 0) + (e.order?.length ? 1 : 0) + (e.rowOrder?.length ? 1 : 0);

export type ColumnHead = { name?: string; role?: ColumnRole; unit?: string; comment?: string };
const withHead = (c: Column, h: ColumnHead): Column => ({
  ...c,
  ...(h.name !== undefined || h.unit ? { name: withUnit(h.name ?? c.name, h.unit) } : {}),
  ...(h.role ? { role: h.role } : {}),
});

export function applySheet(base: Dataset, e: SheetEdits | undefined, decimal: '.' | ','): { dataset: Dataset; map: SheetMap } {
  const baseRows = Math.max(0, maxOf(base.columns.map((c) => c.values.length)));
  const baseCols = base.columns.length;
  const nRows = baseRows + Math.max(0, Math.floor(e?.addRows ?? 0));
  const nCols = baseCols + Math.max(0, Math.floor(e?.addCols ?? 0));
  const delR = new Set(e?.delRows ?? []);
  const delC = new Set(e?.delCols ?? []);
  const rows = Array.from({ length: nRows }, (_, r) => r).filter((r) => !delR.has(r));
  const cols = Array.from({ length: nCols }, (_, c) => c).filter((c) => !delC.has(c));
  // the columns moved, the rows inserted between: in the order given, those not in it after them as they were
  const sortBy = (list: number[], order: number[] | undefined) => {
    if (!order?.length) return;
    const pos = new Map(order.map((c, k) => [c, k]));
    list.sort((a, b) => (pos.get(a) ?? 1e9 + a) - (pos.get(b) ?? 1e9 + b));
  };
  sortBy(cols, e?.order);
  sortBy(rows, e?.rowOrder);
  const cells = e?.cells ?? {};
  const edited = new Set(Object.keys(cells).map((k) => Number(k.split(':')[1])));
  const columns: Column[] = cols.map((c) => {
    const src = base.columns[c];
    const head = e?.cols?.[c] ?? {};
    // a column of the file with no cell changed keeps its arrays (no copy), with its header as changed
    if (src && !edited.has(c) && !delR.size && nRows === baseRows && !e?.rowOrder?.length) return e?.cols?.[c] ? withHead(src, head) : src;
    const values = new Float64Array(rows.length);
    let text: string[] | undefined;
    rows.forEach((r, i) => {
      const typed = cells[`${r}:${c}`];
      if (typed !== undefined) {
        // typed with either decimal separator (1.5 or 1,5)
        let v = parseNumber(typed, decimal);
        if (Number.isNaN(v)) v = parseNumber(typed, decimal === ',' ? '.' : ',');
        values[i] = v;
        if (Number.isNaN(v) && typed.trim() !== '' && typed.trim().toLowerCase() !== 'nan') {
          text ??= new Array<string>(rows.length).fill('');
        }
        if (text) text[i] = typed;
      } else {
        values[i] = src && r < src.values.length ? src.values[r] : NaN;
        if (src?.text) {
          text ??= new Array<string>(rows.length).fill('');
          text[i] = src.text[r] ?? '';
        }
      }
    });
    // cells read as numbers before the first text cell
    if (text) rows.forEach((_, i) => text![i] === '' && Number.isFinite(values[i]) && (text![i] = String(values[i])));
    return withHead(column(src?.name ?? columnLetter(c), values, text), { ...(src?.role ? { role: src.role } : {}), ...head });
  });
  return { dataset: { name: base.name, columns }, map: { rows, cols, baseRows, baseCols } };
}

// Columns of the worksheet read as numbers (by the rules of Convert columns), written into its changes: every cell read
// gets its number typed in its place (a mark of no value, n.d., is emptied; a cell not read stays as it is), the unit
// goes into the name, and the errors (1.23 ± 0.05) into a column of their own after it (±Y). which: each column's place
// in the table shown (ds) and in the table as read.
export function convertInSheet(e: SheetEdits, map: SheetMap, ds: Dataset, which: { shown: number; read: number }[], r: ToNumberRules): SheetEdits {
  const cells = { ...e.cells };
  const heads: Record<string, ColumnHead> = { ...e.cols };
  const order = [...map.cols];
  let added = e.addCols ?? 0;
  for (const { shown, read } of [...which].sort((a, b) => b.shown - a.shown)) {
    const col = ds.columns[shown];
    if (!col) continue;
    const res = toNumbers(col, r);
    const failed = new Set(res.failed.map((f) => f.row));
    const [main, err] = res.columns;
    map.rows.forEach((row, i) => {
      if (i >= col.values.length || failed.has(i) || !col.text?.[i]?.trim()) return;
      cells[`${row}:${read}`] = Number.isFinite(main.values[i]) ? String(main.values[i]) : '';
    });
    if (main.name !== col.name) heads[read] = { ...heads[read], name: main.name, unit: undefined };
    if (err) {
      const at = map.baseCols + added++;
      order.splice(order.indexOf(read) + 1, 0, at);
      heads[at] = { name: err.name, role: 'yerr' };
      map.rows.forEach((row, i) => {
        if (Number.isFinite(err.values[i])) cells[`${row}:${at}`] = String(err.values[i]);
      });
    }
  }
  return { ...e, cells, cols: heads, ...(added !== (e.addCols ?? 0) ? { addCols: added, order } : {}) };
}

// The table of a Workbook sheet as text: a line of names, then the rows, tab-separated (numbers in full, text cells as
// written). Read back by readSheet.
export function sheetText(ds: Dataset): string {
  const clean = (t: string) => t.replace(/[\t\r\n]+/g, ' ');
  const cell = (c: Column, i: number) => {
    if (i >= c.values.length) return '';
    const v = c.values[i];
    if (Number.isFinite(v)) return String(v);
    if (c.text?.[i]) return clean(c.text[i]);
    return Number.isNaN(v) ? '' : String(v);
  };
  const n = Math.max(0, maxOf(ds.columns.map((c) => c.values.length)));
  const lines = [ds.columns.map((c) => clean(c.name)).join('\t')];
  for (let i = 0; i < n; i++) lines.push(ds.columns.map((c) => cell(c, i)).join('\t'));
  return lines.join('\n');
}
const BOOK_CSV: CsvOptions = { delimiter: '\t', decimal: '.', skip: 0, nameLine: 1, unitLine: 0, commentLine: 0 };
export function readSheet(text: string, name: string): Dataset {
  return text ? { ...parseCsv(text, BOOK_CSV, name).dataset, name } : { name, columns: [] };
}

// How pasted lines are cut into cells (the worksheets, the cells of a Matrix): tabs (spreadsheets), else semicolons,
// else commas or spaces when every line has as many of them (a text file: “0.1879,1.28” or “0.1879  1.28”).
export function pasteSplitter(rows: string[]): (l: string) => string[] {
  const lines = rows.filter((l) => l.trim());
  if (lines.some((l) => l.includes('\t'))) return (l) => l.split('\t');
  if (lines.some((l) => l.includes(';'))) return (l) => l.split(';');
  const comma = (l: string) => l.split(',');
  const space = (l: string) => l.trim().split(/\s+/);
  const same = (f: (l: string) => string[]) => {
    const w = lines.map((l) => f(l).length);
    return w.length > 0 && w[0] > 1 && w.every((x) => x === w[0]);
  };
  if (same(comma)) return comma;
  if (same(space)) return space;
  return (l) => [l];
}


// ---- Fill (the handle at the corner of the selection dragged, as in a spreadsheet) ----

// a number as typed in a cell (a decimal comma too), else NaN
const cellNumber = (t: string) => (/^\s*[-+]?(\d+[.,]?\d*|[.,]\d+)([eE][-+]?\d+)?\s*$/.test(t) ? Number(t.trim().replace(',', '.')) : NaN);
const decimals = (t: string) => {
  const m = /[.,](\d+)(?![\d])/.exec(t.trim());
  return /e/i.test(t) ? -1 : m ? m[1].length : 0;
};
// The cells after `src` (count of them), going on from them: numbers — one copied (more: +1 each with `more`), several
// continued along their straight line (the least-squares one: their step when two), as many decimals as they have;
// texts ending in a number (Run 1, S01) — the number continued (zeros kept), the text before it the same; anything
// else repeated in turn. `more`: Ctrl held — the other way (a number counted on, a series copied).
export function fillSeries(src: string[], count: number, more = false): string[] {
  if (!src.length || count <= 0) return [];
  const cyc = () => Array.from({ length: count }, (_, k) => src[k % src.length]);
  const nums = src.map(cellNumber);
  if (nums.every(Number.isFinite)) {
    if ((src.length === 1) !== more) return cyc();
    const n = src.length;
    let [a, b] = [nums[0], 1];
    if (n > 1) {
      const mx = (n - 1) / 2;
      const my = nums.reduce((s, v) => s + v, 0) / n;
      let [sxy, sxx] = [0, 0];
      nums.forEach((v, i) => ((sxy += (i - mx) * (v - my)), (sxx += (i - mx) ** 2)));
      b = sxy / sxx;
      a = my - b * mx;
    }
    const d = Math.max(...src.map(decimals));
    const comma = src.some((t) => t.includes(','));
    return Array.from({ length: count }, (_, k) => {
      const v = a + b * (n + k);
      // (as many decimals as the cells; a trend that needs more: as it comes)
      const fixed = d < 0 ? '' : v.toFixed(Math.min(12, d));
      const t = fixed && Math.abs(Number(fixed) - v) <= 1e-9 * Math.max(1, Math.abs(v)) ? fixed : String(+v.toPrecision(10));
      return comma ? t.replace('.', ',') : t;
    });
  }
  // texts ending in a number, the same text before it
  const parts = src.map((t) => /^(.*?)(\d+)(\D*)$/.exec(t));
  if (!more && parts.every((p) => p && p[1] === parts[0]![1] && p[3] === parts[0]![3])) {
    const vals = parts.map((p) => Number(p![2]));
    const step = vals.length > 1 ? (vals[vals.length - 1] - vals[0]) / (vals.length - 1) : 1;
    const width = parts[0]![2].startsWith('0') ? parts[0]![2].length : 0;
    if (Number.isInteger(step))
      return Array.from({ length: count }, (_, k) => {
        const v = vals[vals.length - 1] + step * (k + 1);
        const t = String(Math.abs(v)).padStart(width, '0');
        return `${parts[0]![1]}${v < 0 ? '-' : ''}${t}${parts[0]![3]}`;
      });
  }
  return cyc();
}
