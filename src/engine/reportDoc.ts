// Report: the results that reach it (the parameters of a Fit, the tables of a test, statistics, single values, columns,
// matrices) written as one document — a block for every input (its title, its tables, a text of yours under it), a
// title, the date, a text before and after — as Markdown or as plain text with the columns aligned. A value and its
// error side by side become “1.234 ± 0.012”; a table of a few rows and many columns is laid on its side (a row per
// quantity).
import { pick } from './extract.ts';
import type { Matrix } from './matrix.ts';
import { fmtPm } from './report.ts';
import { fmtNum, type Column, type Dataset } from './table.ts';

// layout: as it comes (a row per row), on its side (a row per column), or automatic (on its side for a few rows and many
// columns); cols: the columns shown (2, B-D, names, A*; empty: all)
export type ReportItem = { title?: string; cols?: string; text?: string; hidden?: boolean; layout?: 'auto' | 'rows' | 'columns' };
// items: the settings of every input, by its port (0 = A …); digits: significant digits; pm: a value and its error as
// one cell; maxRows: the rows shown of a long table (the others counted)
export type ReportData = { title: string; intro: string; outro: string; date: boolean; digits: number; pm: boolean; maxRows: number; items?: Record<string, ReportItem> };

export type ReportTable = { name?: string; head: string[]; rows: string[][]; more?: number };
export type ReportBlock = { port: number; title: string; line?: string; tables: ReportTable[]; text: string; warnings: string[] };
// what reaches an input: a dataset, a column, a value, a workbook (every sheet a table) or a matrix
export type ReportValue =
  | { t: 'dataset'; v: Dataset }
  | { t: 'column'; v: Column }
  | { t: 'scalar'; v: { name: string; value: number } }
  | { t: 'workbook'; v: { name: string; sheets: Dataset[] } }
  | { t: 'matrix'; v: Matrix };

// the error of the column before it: designated ±Y / ±X, or named “… error”
const isErrorOf = (e: Column | undefined, c: Column) => !!e && (e.role === 'yerr' || e.role === 'xerr' || e.name === `${c.name} error`) && c.role !== 'yerr' && c.role !== 'xerr';

// a table of a dataset: its columns chosen, the errors joined to their values, laid as asked
export function datasetTable(ds: Dataset, item: ReportItem, d: Pick<ReportData, 'digits' | 'pm' | 'maxRows'>, warnings: string[]): ReportTable {
  let cols = ds.columns;
  if (item.cols?.trim()) {
    const p = pick(item.cols, cols.map((c) => c.name), true);
    if (p.missing.length) warnings.push(`No column ${p.missing.map((m) => `“${m}”`).join(', ')} in “${ds.name}”.`);
    cols = p.found.map((j) => cols[j]);
  }
  const n = Math.max(0, ...cols.map((c) => c.values.length));
  const num = (v: number) => (Number.isNaN(v) ? '' : fmtNum(v, Math.max(1, Math.min(15, Math.round(d.digits) || 4))));
  const cell = (c: Column, i: number) => (i >= c.values.length ? '' : c.text?.[i]?.trim() ? c.text[i] : num(c.values[i]));
  // the columns as they are written: a value with its error one column
  const shown: { name: string; at: (i: number) => string }[] = [];
  for (let j = 0; j < cols.length; j++) {
    const c = cols[j];
    const e = cols[j + 1];
    if (d.pm && isErrorOf(e, c)) {
      // named for both when the error is not just “… error” (Mean ± SD)
      shown.push({ name: e!.name === `${c.name} error` ? c.name : `${c.name} ± ${e!.name}`, at: (i) => (i >= c.values.length || Number.isNaN(c.values[i]) ? cell(c, i) : Number.isFinite(e!.values[i]) ? fmtPm(c.values[i], e!.values[i]) : num(c.values[i])) });
      j++;
    } else shown.push({ name: c.name, at: (i) => cell(c, i) });
  }
  const side = item.layout === 'columns' || ((item.layout ?? 'auto') === 'auto' && n > 0 && n <= 3 && shown.length > 5);
  const rows = Math.min(n, Math.max(1, Math.round(d.maxRows) || 50));
  if (!side) return { head: shown.map((s) => s.name), rows: Array.from({ length: rows }, (_, i) => shown.map((s) => s.at(i))), ...(n > rows ? { more: n - rows } : {}) };
  // on its side: a row per quantity, a column per row of the table (named by its first column when it names them)
  const first = cols[0];
  const named = n > 0 && (first?.role === 'x' || !!first?.text) && shown[0]?.name === first?.name;
  const qs = named ? shown.slice(1) : shown;
  // a text names the column itself (y (mV)); a number with its column's name (fit 1)
  const heads = Array.from({ length: n }, (_, i) => (named ? (first.text?.[i]?.trim() ? first.text[i] : `${first.name} ${shown[0].at(i)}`) : n === 1 ? 'value' : `row ${i + 1}`));
  return { head: ['', ...heads], rows: qs.map((s) => [s.name, ...Array.from({ length: n }, (_, i) => s.at(i))]) };
}

function matrixTable(M: Matrix, d: Pick<ReportData, 'digits' | 'maxRows'>): ReportTable {
  const rows = Math.min(M.rows, Math.max(1, Math.round(d.maxRows) || 50));
  const num = (v: number) => (Number.isNaN(v) ? '' : fmtNum(v, Math.max(1, Math.min(15, Math.round(d.digits) || 4))));
  const colName = (j: number) => M.colNames?.[j] ?? (M.xs ? num(M.xs[j]) : String(j + 1));
  const rowName = (i: number) => M.rowNames?.[i] ?? (M.ys ? num(M.ys[i]) : String(i + 1));
  return { head: ['', ...Array.from({ length: M.cols }, (_, j) => colName(j))], rows: Array.from({ length: rows }, (_, i) => [rowName(i), ...Array.from({ length: M.cols }, (_, j) => num(M.v[i * M.cols + j]))]), ...(M.rows > rows ? { more: M.rows - rows } : {}) };
}

// the block of an input
export function reportBlock(port: number, title: string, v: ReportValue, item: ReportItem, d: ReportData): ReportBlock {
  const warnings: string[] = [];
  const base = { port, title: item.title?.trim() || title, text: item.text ?? '', warnings };
  switch (v.t) {
    case 'scalar':
      return { ...base, line: `${v.v.name || 'value'} = ${fmtNum(v.v.value, Math.max(1, Math.round(d.digits) || 4))}`, tables: [] };
    case 'column':
      // one value: a line
      if (v.v.values.length === 1 && !item.cols?.trim()) return { ...base, line: `${v.v.name || 'value'} = ${v.v.text?.[0]?.trim() || fmtNum(v.v.values[0], Math.max(1, Math.round(d.digits) || 4))}`, tables: [] };
      return { ...base, tables: [datasetTable({ name: v.v.name, columns: [v.v] }, { ...item, layout: item.layout === 'columns' ? 'columns' : 'rows' }, d, warnings)] };
    case 'dataset':
      return { ...base, tables: [datasetTable(v.v, item, d, warnings)] };
    case 'workbook':
      return { ...base, tables: v.v.sheets.map((s) => ({ ...datasetTable(s, item, d, warnings), name: s.name })) };
    case 'matrix':
      return { ...base, line: `${v.v.name || 'matrix'}: ${v.v.rows} × ${v.v.cols}`, tables: [matrixTable(v.v, d)] };
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// the document as Markdown
export function reportMarkdown(d: ReportData, blocks: ReportBlock[], date = today()): string {
  const out: string[] = [];
  if (d.title.trim()) out.push(`# ${d.title.trim()}`, '');
  if (d.date) out.push(`*${date}*`, '');
  if (d.intro.trim()) out.push(d.intro.trim(), '');
  for (const b of blocks) {
    out.push(`## ${b.title}`, '');
    if (b.line) out.push(b.line, '');
    for (const t of b.tables) {
      if (t.name) out.push(`**${t.name}**`, '');
      if (t.head.length) {
        out.push(`| ${t.head.map(mdCell).join(' | ')} |`, `|${t.head.map(() => ' --- ').join('|')}|`, ...t.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`));
        if (t.more) out.push('', `*… ${t.more} more row${t.more === 1 ? '' : 's'}*`);
        out.push('');
      }
    }
    if (b.text.trim()) out.push(b.text.trim(), '');
  }
  if (d.outro.trim()) out.push(d.outro.trim(), '');
  return `${out.join('\n').trimEnd()}\n`;
}

// a table as text, its columns aligned (numbers to the right)
export function textTable(t: ReportTable): string[] {
  const all = [t.head, ...t.rows];
  const w = t.head.map((_, j) => Math.max(...all.map((r) => (r[j] ?? '').length)));
  // a column of numbers: to the right, its name too
  const isNum = (s: string) => /^[−-]?[\d.]/.test(s);
  const right = t.head.map((_, j) => t.rows.some((r) => isNum(r[j] ?? '')) && t.rows.every((r) => !r[j] || isNum(r[j])));
  const line = (r: string[]) => r.map((c, j) => (right[j] ? (c ?? '').padStart(w[j]) : (c ?? '').padEnd(w[j]))).join('  ').trimEnd();
  return [line(t.head), w.map((x) => '-'.repeat(x)).join('  '), ...t.rows.map(line), ...(t.more ? [`… ${t.more} more row${t.more === 1 ? '' : 's'}`] : [])];
}

// the document as plain text
export function reportText(d: ReportData, blocks: ReportBlock[], date = today()): string {
  const out: string[] = [];
  const title = d.title.trim();
  if (title) out.push(title, '='.repeat(title.length), '');
  if (d.date) out.push(date, '');
  if (d.intro.trim()) out.push(d.intro.trim(), '');
  for (const b of blocks) {
    out.push(b.title, '-'.repeat(b.title.length), '');
    if (b.line) out.push(b.line, '');
    for (const t of b.tables) {
      if (t.name) out.push(`${t.name}:`);
      if (t.head.length) out.push(...textTable(t), '');
    }
    if (b.text.trim()) out.push(b.text.trim(), '');
  }
  if (d.outro.trim()) out.push(d.outro.trim(), '');
  return `${out.join('\n').trimEnd()}\n`;
}
