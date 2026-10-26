// The values that travel along the connections. A column: its values and one header, its name (with the unit in it,
// “Wavelength (nm)”). Numbers are Float64Array (missing / text cells are NaN); a column read
// from text keeps the text cells too (labels), shown in the tables.
export type Column = {
  name: string; // its only header: the unit goes in the name, “Wavelength (nm)”
  values: Float64Array;
  text?: string[]; // the cells as written, for a column that is (partly) text
  role?: ColumnRole; // its designation in the worksheet (X, Y, Z …); absent: see roleOf
  mask?: Uint8Array; // 1: a masked row (Data manipulation) — kept, but left out of fits, statistics …; drawn grey or hidden
  // the block it was cut from (Split into columns): what the blocks are (“cavity d (nm)”, “cycle”) and this one's value —
  // a Fit, Pick points, Integrate of several such columns give their results against it; a Plot colours by it
  key?: { name: string; value: number };
  band?: boolean; // ±Y that is a band (a fit's confidence band): drawn shaded
};
// The column designations: what a quick plot does with the column.
export type ColumnRole = 'x' | 'y' | 'z' | 'xerr' | 'yerr' | 'label' | 'none';
export const ROLE_LABELS: Record<ColumnRole, string> = { x: 'X', y: 'Y', z: 'Z', xerr: '±X', yerr: '±Y', label: 'Label', none: '–' };
// The designation of the j-th column: its own, else X for the first and Y for the others.
export const roleOf = (cols: { role?: ColumnRole }[], j: number): ColumnRole => cols[j]?.role ?? (j === 0 ? 'x' : 'y');
export type Dataset = { name: string; columns: Column[] };
// The sheets of a spreadsheet file, or several files read together (each a sheet).
export type Workbook = { name: string; sheets: Dataset[] };

// The curves the designations ask for: every Y with the nearest X on its left (else the first X), a ±Y
// or ±X with the nearest Y on its left; a Group column splits the curves into one per value.
export type RoleCurve = { x: string; y: string; yerr?: string; xerr?: string };
export function curvesByRole(cols: { name: string; role?: ColumnRole }[]): { curves: RoleCurve[] } {
  const curves: RoleCurve[] = [];
  let x = '';
  const firstX = cols.find((_, j) => roleOf(cols, j) === 'x')?.name ?? '';
  cols.forEach((c, j) => {
    const r = roleOf(cols, j);
    if (r === 'x') x = c.name;
    else if (r === 'y') curves.push({ x: x || firstX, y: c.name });
    else if ((r === 'yerr' || r === 'xerr') && curves.length) curves[curves.length - 1][r] ??= c.name;
  });
  return { curves };
}
export type Scalar = { name: string; value: number };
// Data of a curve: x, y and optionally the errors of y and x. No style: processing nodes take and give series.
// yErrLo: the − error of y when it differs from the + one (yErr)
// group: which run each row belongs to (a Fit of every run of a sweep): Plot splits the curve by it
export type Series = { name: string; x: Column; y: Column; yErr?: Column; xErr?: Column; yErrLo?: Column };

export const column = (name: string, values: Float64Array, text?: string[]): Column => ({ name, values, ...(text ? { text } : {}) });
// A name with a unit after it (a units line of a file, older projects): “Wavelength” + “nm” → “Wavelength (nm)”.
export const withUnit = (name: string, unit: string | undefined) => (unit?.trim() ? `${name} (${unit.trim()})` : name);

// The unit written at the end of a name: “Wavelength (nm)” → “nm” ('' when none).
export const unitOf = (name: string) => /[([]\s*([^()[\]]+?)\s*[)\]]\s*$/.exec(name)?.[1] ?? '';
// The name without the unit at its end: “Wavelength (nm)” → “Wavelength”.
export const bareName = (name: string) => name.replace(/\s*[([]\s*[^()[\]]+?\s*[)\]]\s*$/, '').trim();
// A column by its name; else the only one whose name differs just by a unit (“Wavelength” finds “Wavelength (nm)”:
// projects made when the unit was apart from the name).
export function findColumn<C extends { name: string }>(cols: C[], name: string): C | undefined {
  const exact = cols.find((c) => c.name === name);
  if (exact || !name) return exact;
  const b = bareName(name).toLowerCase();
  const near = cols.filter((c) => bareName(c.name).toLowerCase() === b);
  return near.length === 1 ? near[0] : undefined;
}
// A value of a named quantity: “d (nm)”, 150 → “d = 150 nm” (a text value without the unit).
export const valueText = (name: string, v: string, isText = false) => {
  const u = unitOf(name);
  return `${u ? bareName(name) : name} = ${v}${u && !isText ? ` ${u}` : ''}`;
};
// The name of a column as shown (a dash when it has none).
export const titleOf = (c: { name: string }) => c.name || '—';

// Row numbers 1 … n: the X of a column without an X column.
export const rowIndex = (n: number): Column => column('Row', Float64Array.from({ length: n }, (_, i) => i + 1));

export function finiteCount(v: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i])) n++;
  return n;
}

// A short, readable number for tables and node texts.
// A number in scientific notation: written short (1e16, 2.5e-9) when very large or very small, or out (1·10¹⁶); read
// from 1e16, 1E16, 1x10^16, 1*10^16, 1·10¹⁶ or 10^16 (a decimal comma too; NaN when it is none of them)
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function sciText(v: number): string {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  return a !== 0 && (a >= 1e5 || a < 1e-3) ? Number(v.toPrecision(12)).toExponential().replace('e+', 'e') : String(Number(v.toPrecision(12)));
}
export function sciPretty(v: number): string {
  const t = sciText(v);
  const m = /^(-?[\d.]+)e(-?\d+)$/.exec(t);
  return m ? `${m[1]}·10${[...m[2]].map((c) => (c === '-' ? '⁻' : SUP[+c])).join('')}` : t;
}
export function parseSci(s: string): number {
  const t = s
    .trim()
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+$/, (e) => `^${[...e].map((c) => (c === '⁻' ? '-' : c === '⁺' ? '+' : String(SUP.indexOf(c)))).join('')}`);
  if (!t) return NaN;
  const m = /^(?:([+-]?(?:\d+\.?\d*|\.\d+))[*x×·X])?10\^([+-]?\d+)$/.exec(t);
  if (m) return (m[1] === undefined ? 1 : Number(m[1])) * 10 ** Number(m[2]);
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t) ? Number(t) : NaN;
}
export function fmtNum(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? '—' : v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, digits - 2)).replace(/\.?0+e/, 'e');
  return String(+v.toPrecision(digits));
}

// The cell of row i as shown: the text of a text cell, else the number.
export const cellText = (c: Column, i: number) => (c.text && c.text[i] !== undefined && !Number.isFinite(c.values[i]) ? c.text[i] : fmtNum(c.values[i]));
