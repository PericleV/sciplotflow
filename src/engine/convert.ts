// Text ↔ numbers: the cells of a column read as numbers by rules (a decimal comma, thousands separators, a unit after
// the number — moved into the column's name —, percents, “1.23 ± 0.05” and “1.23(5)” as a value and its error, “<0.01”,
// “3×10^-4”, the first number in any text), or numbers written as text (a format, a template). Used by the Convert
// columns node, by the worksheets (a column whose text looks like numbers: converted when asked) and by Transpose and
// Stack columns (names read as numbers, numbers written as names). Pure.
import { bareName, column, unitOf, withUnit, type Column } from './table.ts';

export type ToNumberRules = {
  decimal: 'auto' | '.' | ',';
  thousands: boolean; // 1 200,5 · 1,200.5 · 1.200,5: the separators of thousands left out
  units: boolean; // “300 K”: 300, the unit into the column's name
  percent: 'number' | 'fraction'; // “25 %”: 25 (the name in %) or 0.25
  pm: boolean; // “1.23 ± 0.05”, “1.23(5)”: the value, and its error in a column of its own (±Y)
  below: 'empty' | 'limit' | 'half'; // “<0.01”: empty, 0.01, or 0.005 (“>100”: empty or 100)
  times10: boolean; // “3×10^-4”, “3·10⁻⁴”, “3x10-4”: 3e-4
  first: boolean; // any text: its first number (“Sample_300K_2h” → 300)
};
export const TO_NUMBER_DEFAULTS: ToNumberRules = { decimal: 'auto', thousands: true, units: true, percent: 'number', pm: true, below: 'empty', times10: true, first: false };

export type ToTextRules = { format: 'auto' | 'fixed' | 'sig' | 'sci'; digits: number; comma: boolean; template: string };
export const TO_TEXT_DEFAULTS: ToTextRules = { format: 'auto', digits: 3, comma: false, template: '{v}' };

// cells that mean “no value”: left empty, not counted as failures
const EMPTY = new Set(['', '-', '–', '—', 'na', 'n/a', 'n.a.', 'nd', 'n.d.', 'none', 'null', 'nan', '?', 'lod', '<lod', 'bdl', '<bdl', 'loq', '<loq']);
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const NUM = String.raw`[+\-−]?(?:\d[\d\s.,'’]*\d|\d)(?:[eE][+\-−]?\d+)?|[+\-−]?[.,]\d+(?:[eE][+\-−]?\d+)?`;

// what one cell says: its value, its error, its unit; null: not a number by these rules; 'empty': a mark of no value
export type Cell = { v: number; err?: number; unit?: string } | null | 'empty';

// a plain number (its separators by dec), NaN when it is not one
function plain(s: string, dec: '.' | ',', thousands: boolean): number {
  let t = s.replace(/−/g, '-').trim();
  if (!t) return NaN;
  // (spaces inside: only between groups of three digits)
  if (/\s/.test(t)) {
    if (!thousands || !/^[+-]?\d{1,3}(\s\d{3})+([.,]\d*)?([eE][+-]?\d+)?$/.test(t)) return NaN;
    t = t.replace(/\s+/g, '');
  }
  const other = dec === '.' ? ',' : '.';
  if (thousands) {
    // (the other separator, or ’ ', only between groups of three digits)
    const groups = new RegExp(`^[+-]?\\d{1,3}([${other === '.' ? '.' : ','}'’]\\d{3})+([${dec === '.' ? '.' : ','}]\\d*)?([eE][+-]?\\d+)?$`);
    if (groups.test(t)) t = t.replace(new RegExp(`[${other === '.' ? '.' : ','}'’]`, 'g'), '');
  }
  if (t.includes(other)) return NaN;
  if (dec === ',') t = t.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

// The decimal separator of a column's cells: a comma when the cells read with it (and not with a point) are more
function decimalOf(cells: string[]): '.' | ',' {
  let [dot, comma] = [0, 0];
  for (const c of cells) {
    const s = c.trim();
    if (/\d,\d/.test(s) && !/\d\.\d/.test(s)) {
      // (1,200 alone: thousands, unless the column also has 1,5 or 1,25)
      if (!/^\D*\d{1,3}(,\d{3})+\D*$/.test(s)) comma++;
    } else if (/\d\.\d/.test(s) && !/\d,\d/.test(s)) {
      if (!/^\D*\d{1,3}(\.\d{3})+\D*$/.test(s)) dot++;
    } else if (/\d\.\d{3},\d/.test(s)) comma++;
    else if (/\d,\d{3}\.\d/.test(s)) dot++;
  }
  return comma > dot ? ',' : '.';
}

// One cell read by the rules (dec: the decimal separator of its column)
export function readCell(raw: string, r: ToNumberRules, dec: '.' | ','): Cell {
  let s = raw.trim();
  if (EMPTY.has(s.toLowerCase())) return 'empty';
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (c) => SUP[c]);
  const whole = new RegExp(`^(${NUM})$`);
  if (whole.test(s)) {
    const v = plain(s, dec, r.thousands);
    if (!Number.isNaN(v)) return { v };
  }
  // (×10^n after a number)
  const pow = (t: string) => {
    if (!r.times10) return t;
    return t.replace(new RegExp(`(${NUM})\\s*[×xX·*]\\s*10\\s*\\^?\\s*\\(?([+\\-−]?\\d+)\\)?`), (_m, a: string, e: string) => {
      const v = plain(a, dec, r.thousands);
      return Number.isNaN(v) ? _m : String(Number(`${v}e${e.replace('−', '-')}`));
    });
  };
  const was = s;
  s = pow(s);
  if (s !== was && whole.test(s)) return { v: Number(s) };
  // “<0.01”, “≤ 0.01”, “> 100”
  const lim = /^([<>≤≥])\s*(.+)$/.exec(s);
  if (lim) {
    const inner = readCell(lim[2], { ...r, below: 'empty' }, dec);
    if (inner && inner !== 'empty') {
      if (r.below === 'empty') return 'empty';
      const below = lim[1] === '<' || lim[1] === '≤';
      return { ...inner, v: r.below === 'half' && below ? inner.v / 2 : inner.v };
    }
  }
  // a value and its error: “1.23 ± 0.05 eV”, “(1.23 ± 0.05) eV”, “1.23 +/- 0.05”, “1.23(5)”
  if (r.pm) {
    const m = new RegExp(`^\\(?\\s*(${NUM})\\s*(?:±|\\+/-|\\+-)\\s*(${NUM})\\s*\\)?\\s*(.*)$`).exec(s);
    if (m) {
      const [v, e] = [plain(m[1], dec, r.thousands), plain(m[2], dec, r.thousands)];
      if (!Number.isNaN(v) && !Number.isNaN(e)) return unitPart({ v, err: Math.abs(e) }, m[3], r);
    }
    const p = new RegExp(`^([+\\-−]?\\d*[.,]?\\d+)\\((\\d+)\\)\\s*(.*)$`).exec(s);
    if (p) {
      const v = plain(p[1], dec, false);
      const decimals = (p[1].split(/[.,]/)[1] ?? '').length;
      if (!Number.isNaN(v)) return unitPart({ v, err: Number(p[2]) * 10 ** -decimals }, p[3], r);
    }
  }
  // a number and a unit after it: “300 K”, “1,5 eV”, “25 %”
  const u = new RegExp(`^(${NUM})\\s*([^\\d\\s].*)$`).exec(s);
  if (u) {
    const v = plain(u[1], dec, r.thousands);
    if (!Number.isNaN(v)) {
      const got = unitPart({ v }, u[2], r);
      if (got) return got;
    }
  }
  if (r.first) {
    const f = new RegExp(`(${NUM})`).exec(s.replace(/_/g, ' '));
    if (f) {
      const v = plain(f[1], dec, false);
      if (!Number.isNaN(v)) return { v };
    }
  }
  return null;
}
// (what follows the number: nothing, or a unit when units are read; a percent by its rule)
function unitPart(c: { v: number; err?: number }, rest: string, r: ToNumberRules): Cell {
  const unit = rest.trim();
  if (!unit) return c;
  if (!r.units || unit.length > 12 || /\d{2,}/.test(unit)) return r.first ? c : null;
  if (unit === '%' && r.percent === 'fraction') return { v: c.v / 100, ...(c.err !== undefined ? { err: c.err / 100 } : {}) };
  return { ...c, unit };
}

// A column read as numbers. Its cells as written (its text, else its numbers); a column with nothing to read gives
// itself. columns: the column (its unit in the name when every number had the same one) and, when some cell had an
// error, the error column after it (±Y); failed: the rows read as nothing (their text: kept out, listed); units: the
// different units met when they were not all the same (the numbers kept as they were written)
export function toNumbers(col: Column, r: ToNumberRules): { columns: Column[]; failed: { row: number; text: string }[]; converted: number; units: string[] } {
  const n = col.values.length;
  const cells = Array.from({ length: n }, (_, i) => col.text?.[i] ?? (Number.isFinite(col.values[i]) ? String(col.values[i]) : ''));
  const dec = r.decimal === 'auto' ? decimalOf(cells) : r.decimal;
  const values = new Float64Array(n).fill(NaN);
  const errs = new Float64Array(n).fill(NaN);
  const failed: { row: number; text: string }[] = [];
  const units = new Map<string, number>();
  let [converted, hasErr] = [0, false];
  cells.forEach((c, i) => {
    // (a number already: kept)
    if (!col.text?.[i] && Number.isFinite(col.values[i])) {
      values[i] = col.values[i];
      return;
    }
    const got = readCell(c, r, dec);
    if (got === 'empty') return;
    if (!got) {
      failed.push({ row: i, text: c });
      return;
    }
    values[i] = got.v;
    converted++;
    if (got.err !== undefined) [errs[i], hasErr] = [got.err, true];
    if (got.unit) units.set(got.unit, (units.get(got.unit) ?? 0) + 1);
  });
  // (one unit for all: into the name, unless the name has one already)
  const one = units.size === 1 ? [...units.keys()][0] : '';
  const name = one && !unitOf(col.name) ? withUnit(col.name, one) : col.name;
  const { text: _t, ...rest } = col;
  const main: Column = { ...rest, name, values };
  const err: Column[] = hasErr ? [{ ...column(withUnit(`${bareName(name)} error`, unitOf(name)), errs), role: 'yerr' }] : [];
  return { columns: [main, ...err], failed, converted, units: units.size > 1 ? [...units.keys()] : [] };
}

// How many text cells of a column read as numbers by the rules (a column that is not text: none), and some of them
export function looksNumeric(col: Column, r: ToNumberRules = TO_NUMBER_DEFAULTS): { text: number; numeric: number; examples: string[] } {
  if (!col.text) return { text: 0, numeric: 0, examples: [] };
  const cells = col.text.filter((t, i) => t.trim() && !Number.isFinite(col.values[i]));
  const dec = r.decimal === 'auto' ? decimalOf(col.text) : r.decimal;
  const ok = cells.filter((t) => {
    const c = readCell(t, r, dec);
    return c && c !== 'empty';
  });
  return { text: cells.length, numeric: ok.length, examples: ok.slice(0, 3) };
}

// A name with a number in it, cut there: “Wavelength 400 nm” → Wavelength, 400, nm; null: no number
export function splitNumber(name: string): { prefix: string; v: number; suffix: string } | null {
  const m = new RegExp(`^(.*?)(${NUM})\\s*(.*)$`).exec(name.replace(/_/g, ' '));
  if (!m) return null;
  const dec = /\d,\d/.test(m[2]) && !/\d\.\d/.test(m[2]) ? ',' : '.';
  const c = readCell(m[2], TO_NUMBER_DEFAULTS, dec);
  if (!c || c === 'empty') return null;
  return { prefix: m[1].replace(/[\s:=_-]+$/, '').trim(), v: c.v, suffix: m[3].trim() };
}
// The numbers in some names, and the name of a column of them: what the names share before the number, and the unit
// they share after it (“Wavelength 400 nm”, “Wavelength 410 nm” → “Wavelength (nm)”; none shared: fallback)
export function numbersInNames(names: string[], fallback: string): { values: number[]; name: string; failed: string[] } {
  const got = names.map(splitNumber);
  const ok = got.filter((g): g is NonNullable<typeof g> => !!g);
  const same = (xs: string[]) => (xs.length && xs.every((x) => x === xs[0]) ? xs[0] : '');
  const prefix = same(ok.map((g) => g.prefix));
  const unit = same(ok.map((g) => g.suffix));
  return {
    values: got.map((g) => g?.v ?? NaN),
    name: withUnit(prefix || fallback, unit.length <= 12 ? unit : ''),
    failed: names.filter((_, i) => !got[i]),
  };
}

// A number written by the rules (no template)
export function formatNumber(v: number, r: ToTextRules): string {
  if (!Number.isFinite(v)) return '';
  const d = Math.max(0, Math.min(15, Math.round(r.digits)));
  const s =
    r.format === 'fixed' ? v.toFixed(d)
    : r.format === 'sig' ? v.toPrecision(Math.max(1, d))
    : r.format === 'sci' ? v.toExponential(d)
    : String(+v.toPrecision(12));
  return r.comma ? s.replace('.', ',') : s;
}
// a number in the template (“{v} V”); a template without {v}: the number after it
export const fromTemplate = (s: string, template: string) => (template.includes('{v}') ? template.replaceAll('{v}', s) : `${template}${s}`).trim();

// A column written as text (numbers by the rules and the template; text cells as they are)
export function toText(col: Column, r: ToTextRules): Column {
  const text = Array.from({ length: col.values.length }, (_, i) => (Number.isFinite(col.values[i]) ? fromTemplate(formatNumber(col.values[i], r), r.template || '{v}') : (col.text?.[i] ?? '')));
  return { ...col, values: new Float64Array(col.values.length).fill(NaN), text };
}
