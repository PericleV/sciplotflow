// A table written out: as text (CSV, tab-separated, any delimiter — the decimal point or comma, the header, missing and
// masked values, the digits, the line ends, a byte-order mark for Excel) or as a spreadsheet (.xlsx, a sheet each).
import { ROLE_LABELS, roleOf, type Dataset } from './table.ts';

// format: a text file or an Excel book; delimiter: as in Import (comma, semicolon, tab, spaces, bar, other — `custom`, one
// or more characters, \t a tab); ext: the file's extension (auto: .csv for a comma or a semicolon, .tsv for a tab, else
// .txt); header: the names, none; roles: a second line with the designations (X, Y, ±Y …); missing: what an empty number
// is written as; masked: kept, left empty, or their rows left out; digits: 0 = every digit (the shortest exact form),
// else so many significant ones; sheets: the one shown, or all (xlsx: one book; text: a .zip of a file each)
export type TableFormat = 'text' | 'xlsx';
export type ExportDelimiter = ',' | ';' | '\t' | ' ' | '|' | 'custom';
export type TableExport = {
  format: TableFormat;
  delimiter: ExportDelimiter;
  custom?: string;
  ext: 'auto' | 'csv' | 'tsv' | 'txt' | 'dat';
  decimal: '.' | ',';
  header: 'names' | 'none';
  roles: boolean;
  missing: '' | 'NaN' | '--';
  masked: 'keep' | 'empty' | 'drop';
  digits: number;
  lineEnd: 'lf' | 'crlf';
  bom: boolean;
  sheets: 'shown' | 'all';
};
export const TABLE_EXPORT_DEFAULTS: TableExport = { format: 'text', delimiter: ',', ext: 'auto', decimal: '.', header: 'names', roles: false, missing: '', masked: 'keep', digits: 0, lineEnd: 'crlf', bom: true, sheets: 'shown' };

// the settings, with the defaults (the first form of these settings — csv / tsv / txt — read too)
export function exportOptions(v: Partial<TableExport> | undefined): TableExport {
  const o = { ...TABLE_EXPORT_DEFAULTS, ...v } as TableExport;
  const first = { format: o.format as string, delimiter: o.delimiter as string };
  if (first.format === 'csv') return { ...o, format: 'text', delimiter: o.decimal === ',' ? ';' : ',' };
  if (first.format === 'tsv') return { ...o, format: 'text', delimiter: '\t' };
  if (first.format === 'txt') return { ...o, format: 'text', ...(![',', ';', '\t', ' ', '|'].includes(first.delimiter) ? { delimiter: 'custom', custom: first.delimiter } : {}) };
  return o;
}
// the delimiter written between the cells
export const delimiterOf = (o: TableExport): string => (o.delimiter === 'custom' ? (o.custom || ';').replace(/\\t/g, '\t') : o.delimiter);
export function extensionOf(o: TableExport): string {
  if (o.format === 'xlsx') return 'xlsx';
  if (o.ext !== 'auto') return o.ext;
  return o.delimiter === ',' || o.delimiter === ';' ? 'csv' : o.delimiter === '\t' ? 'tsv' : 'txt';
}

// a number as text: every digit, or so many significant ones (trailing zeros dropped)
export function numberText(v: number, o: Pick<TableExport, 'digits' | 'decimal' | 'missing'>): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? o.missing : v > 0 ? 'Inf' : '-Inf';
  const s = o.digits > 0 ? String(Number(v.toPrecision(Math.min(17, Math.max(1, Math.round(o.digits)))))) : String(v);
  return o.decimal === ',' ? s.replace('.', ',') : s;
}

// the rows of the table as cells: numbers as numbers (for a spreadsheet), texts, null for an empty cell and NaN for a
// missing number
export function tableCells(ds: Dataset, o: TableExport): (string | number | null)[][] {
  const cols = ds.columns;
  const n = Math.max(0, ...cols.map((c) => c.values.length));
  const masked = (i: number, j: number) => !!cols[j].mask?.[i];
  const out: (string | number | null)[][] = [];
  if (o.header === 'names') out.push(cols.map((c) => c.name));
  if (o.roles) out.push(cols.map((_, j) => ROLE_LABELS[roleOf(cols, j)]));
  for (let i = 0; i < n; i++) {
    if (o.masked === 'drop' && cols.some((_, j) => masked(i, j))) continue;
    out.push(
      cols.map((c, j) => {
        if (i >= c.values.length || (o.masked === 'empty' && masked(i, j))) return null;
        const v = c.values[i];
        if (!Number.isNaN(v)) return v;
        return c.text?.[i]?.trim() ? c.text[i] : NaN;
      }),
    );
  }
  return out;
}

// a cell in quotes when it holds the delimiter, a quote or a line break (the quotes in it doubled)
const quoted = (s: string, delim: string) => (s.includes(delim) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// the table as text
export function tableText(ds: Dataset, o: TableExport): string {
  const delim = delimiterOf(o);
  const eol = o.lineEnd === 'crlf' ? '\r\n' : '\n';
  const lines = tableCells(ds, o).map((row) => row.map((c) => (c === null ? '' : typeof c === 'number' ? quoted(numberText(c, o), delim) : quoted(c, delim))).join(delim));
  return lines.join(eol) + eol;
}

// a file name without the characters a file system refuses
export const safeName = (s: string) => (s.trim() || 'table').replace(/[\\/:*?"<>|]+/g, '_');
