// Text tables (CSV, TSV, instrument exports): delimiter and decimal separator (automatic or chosen), lines skipped at
// the top, comment lines (starting with the characters chosen, or ! # % // found by themselves) left out wherever they
// are — the names taken from the last one before the data when it holds them —, then the header lines (the names; a
// units line, written into the names; a comments line, left out), then the data. Touchstone files (.sNp) have their own
// reader (touchstone.ts): readTable chooses. Pure: also used by the scripts.
import { column, withUnit, type Dataset } from './table.ts';
import { maxOf } from './minmax.ts';
import { isTouchstone, parseTouchstone, type TouchstoneInfo } from './touchstone.ts';

export type Delimiter = 'auto' | ',' | ';' | '\t' | ' ' | '|' | 'custom';
export type Decimal = 'auto' | '.' | ',';
export type CsvOptions = {
  delimiter: Delimiter;
  custom?: string; // delimiter 'custom': its characters (one or more; \t is a tab)
  decimal: Decimal;
  skip: number; // lines skipped at the top (instrument headers, notes)
  // header lines after the skipped ones, counted from 1; 0 = none; nameLine -1 = automatic (line 1 when it holds text)
  nameLine: number;
  unitLine: number; // its cells go into the names: “Wavelength” + “nm” → “Wavelength (nm)”
  commentLine: number; // a line of comments: left out
  skipEnd?: number; // lines left out at the end (a footer some instruments write)
  missing?: string; // cells meaning “no value”, comma-separated: N/A, -, --, -999 (empty cells)
  thousands?: '' | ',' | '.' | ' ' | "'"; // a thousands separator taken out of the numbers (1,234.5 · 1.234,5 · 1 234,5)
  encoding?: string; // of the text file, used when it is opened (absent / 'auto': found from its bytes)
  // comment lines: 'auto' — lines starting with ! # % or //; '' (or absent: older projects) none; else the marks, one or
  // more separated by spaces (“#”, “! %”, “REM”); commentEnd: a mark after the data of a line starts a comment too
  comment?: string;
  commentEnd?: boolean;
  // the names from the last comment line before the data, when it has as many as the data has columns
  namesFromComment?: boolean;
  // what the file is: a text table, a Touchstone file (.sNp), or found by itself (absent: older projects — a table)
  format?: 'auto' | 'table' | 'touchstone';
  // Touchstone: the dB and the phase of every parameter added (or its real and imaginary parts)
  touchExtra?: boolean;
};
export const CSV_DEFAULTS: CsvOptions = { delimiter: 'auto', decimal: 'auto', skip: 0, nameLine: -1, unitLine: 0, commentLine: 0, comment: 'auto', namesFromComment: true, format: 'auto', touchExtra: true };

// header: the lines left out before the data (skipped, comments), to show; touchstone: what a Touchstone file holds
export type CsvResult = { dataset: Dataset; delimiter: string; decimal: Exclude<Decimal, 'auto'>; headerLines: number; dataLines: number; warnings: string[]; header?: string[]; commentNames?: boolean; touchstone?: TouchstoneInfo };

// the marks that start a comment line
const AUTO_MARKS = ['!', '#', '%', '//'];
const marksOf = (c: string | undefined) => (c === 'auto' ? AUTO_MARKS : (c ?? '').trim().split(/\s+/).filter(Boolean));

// Is this line a comment (the marks of the options)?
export const isCommentLine = (line: string, comment: string | undefined) => {
  const t = line.trimStart();
  return marksOf(comment).some((m) => t.startsWith(m));
};

// A table read from a text file: a Touchstone file by its own reader (by its name or its option line, when the format
// lets it), else as a text table.
export function readTable(text: string, o: CsvOptions, name = 'data', fileName = ''): CsvResult {
  const fmt = o.format ?? 'table';
  if (fmt === 'touchstone' || (fmt === 'auto' && isTouchstone(text, fileName))) {
    const t = parseTouchstone(text, fileName, name, o.touchExtra !== false);
    const n = t.dataset.columns[0]?.values.length ?? 0;
    return { dataset: t.dataset, delimiter: ' ', decimal: '.', headerLines: 0, dataLines: n, warnings: t.warnings, header: t.header, touchstone: t.info };
  }
  return parseCsv(text, o, name);
}

// A line of names split as the data is: by the delimiter, or — when that gives more names than columns (names with
// spaces in them, “Re (S11)”) — by tabs, by two spaces or more, by commas or semicolons.
function splitNames(line: string, delimiter: string, want: number): string[] | null {
  const tries = [splitLine(line, delimiter), line.trim().split(/\t+/), line.trim().split(/\s{2,}/), line.split(','), line.split(';')];
  for (const t of tries) {
    const cells = t.map((s) => s.trim());
    if (cells.length === want && cells.every(Boolean)) return cells;
  }
  return null;
}

const NUM_DOT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const NUM_COMMA = /^[+-]?(\d+,?\d*|,\d+)([eE][+-]?\d+)?$/;
const SPECIAL: Record<string, number> = { nan: NaN, inf: Infinity, '+inf': Infinity, '-inf': -Infinity, infinity: Infinity, '-infinity': -Infinity };

// A cell as a number (NaN when it is empty or text).
export function parseNumber(cell: string, decimal: '.' | ','): number {
  const s = cell.trim();
  if (!s) return NaN;
  if (decimal === '.') {
    // most cells: a plain number (Number() alone would also read hex, binary and '' — hence the first-character check)
    const c = s.charCodeAt(0);
    if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
      const v = Number(s);
      if (!Number.isNaN(v) && !/[xXbBoO]/.test(s)) return v;
    }
  }
  if (decimal === ',' ? NUM_COMMA.test(s) : NUM_DOT.test(s)) return Number(decimal === ',' ? s.replace(',', '.') : s);
  const sp = SPECIAL[s.toLowerCase()];
  return sp === undefined ? NaN : sp;
}
// A plain number in s[a, b) (spaces around it allowed; dec: the decimal separator's code): its value, NaN when the cell
// is empty, undefined when it is anything else (text, nan, inf …: read by parseNumber). The same numbers as NUM_DOT /
// NUM_COMMA, without a regular expression or a copy of the cell (a million rows read several times faster).
export function plainNumber(s: string, a: number, b: number, dec: number): number | undefined {
  while (a < b && s.charCodeAt(a) <= 32) a++;
  while (b > a && s.charCodeAt(b - 1) <= 32) b--;
  if (a === b) return NaN;
  let i = a;
  let c = s.charCodeAt(i);
  const neg = c === 45;
  if (c === 43 || c === 45) c = s.charCodeAt(++i);
  let digits = 0;
  let decAt = -1;
  let m = 0; // the digits as an integer (exact while they are 15 or fewer)
  let frac = 0;
  for (; i < b; c = s.charCodeAt(++i)) {
    if (c >= 48 && c <= 57) {
      digits++;
      m = m * 10 + (c - 48);
      if (decAt >= 0) frac++;
    } else if (c === dec && decAt < 0) decAt = i;
    else break;
  }
  if (!digits) return undefined;
  let e = 0;
  if (i < b) {
    if (c !== 101 && c !== 69) return undefined;
    c = s.charCodeAt(++i);
    const eneg = c === 45;
    if (c === 43 || c === 45) c = s.charCodeAt(++i);
    let ed = 0;
    for (; i < b; c = s.charCodeAt(++i)) {
      if (c >= 48 && c <= 57) {
        ed++;
        if (e < 1e6) e = e * 10 + (c - 48);
      } else return undefined;
    }
    if (!ed) return undefined;
    if (eneg) e = -e;
  }
  // exact (Clinger's fast path): ≤ 15 digits and a power of ten ≤ 10²² — one correctly rounded operation, the same
  // double as Number(); else Number() on the text
  const p = e - frac;
  if (digits <= 15 && p >= -22 && p <= 22) {
    const v = p < 0 ? m / P10[-p] : m * P10[p];
    return neg ? -v : v;
  }
  if (dec === 44 && decAt >= 0) return Number(`${s.slice(a, decAt)}.${s.slice(decAt + 1, b)}`);
  return Number(s.slice(a, b));
}
const P10 = Array.from({ length: 23 }, (_, k) => Number(`1e${k}`));
const isNumberCell = (s: string, decimal: '.' | ',') => {
  const t = s.trim();
  return t !== '' && (decimal === ',' ? NUM_COMMA.test(t) : NUM_DOT.test(t) || t.toLowerCase() in SPECIAL);
};

// Splits a line; quoted fields ("a, b") keep their delimiters, "" inside quotes is a quote. Spaces: any run of
// whitespace separates.
export function splitLine(line: string, delim: string): string[] {
  if (delim === ' ') return line.trim().split(/\s+/);
  if (!delim) return [line.trim()];
  if (!line.includes('"')) return line.split(delim).map((s) => s.trim());
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (line.startsWith(delim, i)) {
      out.push(cur.trim());
      cur = '';
      i += delim.length - 1;
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export const textLines = (text: string) => text.replace(/^﻿/, '').split(/\r\n|\n|\r/);

// The delimiter that cuts the sample lines into the same number (> 1) of fields most often; tab, semicolon, comma,
// bar, then spaces when several do equally well.
function detectDelimiter(lines: string[], decimal: Decimal): { d: Exclude<Delimiter, 'auto'>; score: number } {
  const cands: Exclude<Delimiter, 'auto'>[] = decimal === ',' ? ['\t', ';', '|', ' '] : ['\t', ';', ',', '|', ' '];
  let best: Exclude<Delimiter, 'auto'> = cands.includes(',') ? ',' : ';';
  let bestScore = 0;
  for (const d of cands) {
    const counts = new Map<number, number>();
    for (const l of lines) {
      const n = splitLine(l, d).length;
      if (n > 1) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const score = Math.max(0, maxOf(counts.values())) / Math.max(1, lines.length);
    if (score > bestScore + 1e-9) [best, bestScore] = [d, score];
  }
  // a delimiter that cuts only a few lines (a header “Size (nm)” over one column of numbers): one column
  if (bestScore < 0.2) return { d: cands.includes(',') ? ',' : ';', score: 0 };
  return { d: best, score: bestScore };
}

// Decimal comma when the numbers of the data are written with commas (1,25) and none with points.
function detectDecimal(cells: string[]): '.' | ',' {
  let comma = 0;
  let dot = 0;
  for (const c of cells) {
    const t = c.trim();
    if (/^[+-]?\d+,\d+([eE][+-]?\d+)?$/.test(t)) comma++;
    else if (/^[+-]?\d*\.\d+([eE][+-]?\d+)?$/.test(t)) dot++;
  }
  return comma > 0 && dot === 0 ? ',' : '.';
}

const letters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letters(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
export const columnLetter = letters;

export function parseCsv(text: string, o: CsvOptions, name = 'data'): CsvResult {
  const warnings: string[] = [];
  let src = text.replace(/^﻿/, '');
  // line ends of old Macs only (\r): as \n
  if (!src.includes('\n') && src.includes('\r')) src = src.replace(/\r/g, '\n');
  // a footer left out: the last lines (after the empty ones at the end)
  const skipEnd = Math.max(0, Math.floor(o.skipEnd ?? 0));
  if (skipEnd) {
    let end = src.replace(/\s+$/, '').length;
    for (let k = 0; k < skipEnd && end > 0; k++) end = Math.max(0, src.lastIndexOf('\n', end - 1));
    src = src.slice(0, end);
  }
  // comment lines left out (after the lines skipped); the lines left out before the data kept, to show them
  const marks = marksOf(o.comment);
  const skip0 = Math.max(0, Math.floor(o.skip));
  const shownHeader: string[] = [];
  let lastComment = '';
  if (marks.length) {
    const isComment = (l: string) => {
      const t = l.trimStart();
      return marks.some((m) => t.startsWith(m));
    };
    // quick: is there any comment line at all?
    const any = src.split('\n', skip0 + 5000).slice(skip0).some(isComment) || (o.commentEnd ?? false);
    if (any) {
      const lines = src.split('\n');
      const out: string[] = lines.slice(0, skip0);
      shownHeader.push(...out.slice(0, 60));
      let data = false;
      for (let k = skip0; k < lines.length; k++) {
        let l = lines[k];
        if (isComment(l)) {
          if (!data) {
            if (shownHeader.length < 120) shownHeader.push(l);
            const t = l.trimStart();
            const m = marks.find((mk) => t.startsWith(mk))!;
            const body = t.slice(m.length).trim();
            if (body) lastComment = body;
          }
          continue;
        }
        if (o.commentEnd) {
          let at = -1;
          for (const m of marks) {
            const p = l.indexOf(m);
            if (p >= 0 && (at < 0 || p < at)) at = p;
          }
          if (at >= 0) l = l.slice(0, at);
        }
        if (l.trim()) data = true;
        out.push(l);
      }
      src = out.join('\n');
    }
  }
  if (!shownHeader.length && skip0) shownHeader.push(...textLines(src).slice(0, Math.min(skip0, 60)));
  // the start of line k (0 = the first; past the end: the text's length)
  const lineStart = (k: number) => {
    let p = 0;
    for (let j = 0; j < k; j++) {
      const q = src.indexOf('\n', p);
      if (q < 0) return src.length;
      p = q + 1;
    }
    return p;
  };
  // the first lines (skipped, the header, a sample) read as lines; the data then straight from the text
  const skip = Math.max(0, Math.floor(o.skip));
  const all = textLines(src.slice(0, lineStart(skip + Math.max(1, Math.floor(o.nameLine), Math.floor(o.unitLine), Math.floor(o.commentLine)) + 200)));
  while (all.length && all[all.length - 1].trim() === '') all.pop();
  const body = all.slice(skip);
  const sample = body.filter((l) => l.trim() !== '').slice(0, 40);
  // the decimal separator first from a guess with every delimiter but the comma (a comma may be either)
  let decimal: '.' | ',' = o.decimal === 'auto' ? '.' : o.decimal;
  let delimiter: string;
  if (o.delimiter === 'auto') {
    const noComma = detectDelimiter(sample, ',').d;
    const guess = o.decimal === 'auto' ? detectDecimal(sample.flatMap((l) => splitLine(l, noComma))) : decimal;
    const found = detectDelimiter(sample, guess);
    delimiter = found.d;
    // "1,2" with nothing else to cut the lines: comma-separated numbers rather than one column of decimal commas
    if (o.decimal === 'auto' && guess === ',' && found.score === 0) delimiter = ',';
    if (o.decimal === 'auto') decimal = delimiter === ',' ? '.' : guess;
  } else {
    delimiter = o.delimiter === 'custom' ? (o.custom ?? '').replace(/\\t/g, '\t') : o.delimiter;
    if (!delimiter) warnings.push('Write the delimiter (one or more characters).');
    if (o.decimal === 'auto') decimal = delimiter === ',' ? '.' : detectDecimal(sample.flatMap((l) => splitLine(l, delimiter)));
  }
  if (delimiter === decimal) warnings.push('The delimiter and the decimal separator are both “,”: numbers like 1,5 are split into two cells.');
  const thousands = o.thousands ?? '';
  if (thousands && thousands === decimal) warnings.push(`The thousands separator and the decimal separator are both “${thousands}”: choose another one.`);
  else if (thousands && thousands === delimiter) warnings.push(`The thousands separator is also the delimiter (“${thousands === ' ' ? 'spaces' : thousands}”): the numbers are cut into cells.`);
  // cells meaning “no value”: as text (N/A, -) and as numbers (-999)
  const miss = new Set((o.missing ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const missNum = new Set([...miss].map((s) => parseNumber(s, decimal)).filter((v) => !Number.isNaN(v)));

  // header lines (after the skipped ones)
  let nameLine = Math.floor(o.nameLine);
  const firstFields = body.length ? splitLine(body[0], delimiter) : [];
  if (nameLine < 0) nameLine = firstFields.some((c) => c.trim() !== '' && !isNumberCell(c, decimal)) ? 1 : 0;
  const unitLine = Math.max(0, Math.floor(o.unitLine));
  const commentLine = Math.max(0, Math.floor(o.commentLine));
  const headerLines = Math.max(nameLine, unitLine, commentLine);
  const header = (k: number) => (k > 0 && body[k - 1] !== undefined ? splitLine(body[k - 1], delimiter) : []);
  const names = header(nameLine);
  const units = header(unitLine);

  // one pass over the data, from the text by position straight into the columns (no line or cell strings for plain
  // numbers: a million rows fit, and fast); at most a row per line
  const from = lineStart(skip + headerLines);
  const L = src.length;
  let n = from < L ? 1 : 0;
  for (let q = src.indexOf('\n', from); q >= 0 && q < L - 1; q = src.indexOf('\n', q + 1)) n++;
  const cols: { values: Float64Array; text?: string[] }[] = [];
  const colAt = (j: number) => {
    while (cols.length <= j) cols.push({ values: new Float64Array(n).fill(NaN) });
    return cols[j];
  };
  for (let j = 0; j < names.length; j++) colAt(j);
  let i = 0;
  // the most cells a data line has (the columns of the data, whatever the line of names says)
  let dataCols = 0;
  const put = (j: number, cell0: string) => {
    const c = colAt(j);
    let cell = miss.has(cell0) ? '' : cell0;
    let v = parseNumber(thousands ? cell.split(thousands).join('') : cell, decimal);
    if (missNum.has(v)) {
      v = NaN;
      cell = '';
    }
    c.values[i] = v;
    if (Number.isNaN(v) && cell !== '' && cell.toLowerCase() !== 'nan') {
      // a text cell: the column keeps its cells as written (labels)
      c.text ??= new Array<string>(n).fill('');
    }
    if (c.text) c.text[i] = cell;
  };
  // a cell src[a, b): a plain number straight into its column, anything else as a string
  const decCode = decimal === ',' ? 44 : 46;
  const putAt = (j: number, a: number, b: number) => {
    let v = plainNumber(src, a, b, decCode);
    if (v === undefined) return put(j, src.slice(a, b).trim());
    if (missNum.has(v)) v = NaN;
    const c = colAt(j);
    c.values[i] = v;
    if (c.text) c.text[i] = Number.isNaN(v) ? '' : src.slice(a, b).trim();
  };
  const one = delimiter.length === 1 && delimiter !== ' ' ? delimiter.charCodeAt(0) : -1;
  let quote = src.indexOf('"', from); // the next quote (a line with one: cut by splitLine)
  for (let pos = from; pos < L; ) {
    let nl = src.indexOf('\n', pos);
    if (nl < 0) nl = L;
    let end = nl;
    if (end > pos && src.charCodeAt(end - 1) === 13) end--;
    let k = pos;
    while (k < end && src.charCodeAt(k) <= 32) k++;
    if (k < end) {
      if (quote >= 0 && quote < pos) quote = src.indexOf('"', pos);
      if (delimiter === ' ') {
        // any run of spaces separates
        let j = 0;
        while (k < end) {
          const a = k;
          while (k < end && src.charCodeAt(k) > 32) k++;
          putAt(j++, a, k);
          while (k < end && src.charCodeAt(k) <= 32) k++;
        }
        if (j > dataCols) dataCols = j;
      } else if (one >= 0 && !(quote >= 0 && quote < end)) {
        let j = 0;
        let a = pos;
        for (;;) {
          let b = a;
          while (b < end && src.charCodeAt(b) !== one) b++;
          putAt(j++, a, b);
          if (b >= end) break;
          a = b + 1;
        }
        if (j > dataCols) dataCols = j;
      } else {
        const cells = splitLine(src.slice(pos, end), delimiter);
        for (let j = 0; j < cells.length; j++) put(j, cells[j]);
        if (cells.length > dataCols) dataCols = cells.length;
      }
      i++;
    }
    pos = nl + 1;
  }
  let nCols = cols.length;
  // the names: a line of names cut into more names than the data has columns (“Re (S11)” cut at its space): cut again,
  // then no empty columns for the extra names; no line of names (the data from the first line) and a comment before the
  // data that names every column: its names
  let fromComment = false;
  if (nameLine > 0 && names.length > dataCols && dataCols > 0) {
    const again = splitNames(body[nameLine - 1] ?? '', delimiter, dataCols);
    if (again) {
      names.splice(0, names.length, ...again);
      nCols = dataCols;
    }
  } else if (nameLine === 0 && o.namesFromComment && lastComment && dataCols > 0) {
    const fromC = splitNames(lastComment, delimiter, dataCols);
    if (fromC) {
      names.splice(0, names.length, ...fromC);
      fromComment = true;
    }
  }
  const columns = [];
  for (let j = 0; j < nCols; j++) {
    const values = i < n ? cols[j].values.slice(0, i) : cols[j].values;
    let text = cols[j].text;
    if (text) {
      text.length = i;
      // cells read before the first text cell of the column
      for (let k = 0; k < i; k++) if (text[k] === '' && Number.isFinite(values[k])) text[k] = String(values[k]);
      if (text.every((t) => t === '')) text = undefined;
    }
    // the units line goes into the name: “Wavelength” + “nm” → “Wavelength (nm)”
    columns.push(column(withUnit((names[j] ?? '').trim() || letters(j), units[j]), values, text));
  }
  if (!i) warnings.push('No data lines: check the lines skipped and the header lines.');
  return { dataset: { name, columns }, delimiter, decimal, headerLines, dataLines: i, warnings, ...(shownHeader.length ? { header: shownHeader } : {}), ...(fromComment ? { commentNames: true } : {}) };
}
