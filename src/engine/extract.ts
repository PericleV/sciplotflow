// Sheets to columns: columns taken out of the sheets of a workbook by rules — "column 1 of every sheet is X, columns 2 and 5
// are Y", "from the sheets whose name holds run: Absorbance" — into one dataset whose columns carry their designation
// (X, Y, ±Y …), ready for a quick plot. Sheets and columns are chosen with the same short list:
//   1, 3-5      by number (from 1; "2-end" up to the last)
//   B, D-F      columns by letter (as in the worksheet)
//   Absorbance  by name (no matter the case); A1-A3 from one name to another; run*, *abs*  names matching a pattern
//   *           all;   !3, !Notes  leave out (after the others: "*, !1" = all but the first)
import { bareName, ROLE_LABELS, roleOf, type Column, type ColumnRole, type Dataset } from './table.ts';
import { foundAs, resolve } from './refs.ts';

export type ExtractRule = { sheets: string; columns: string; role: ColumnRole };
// how the columns of the result are named: "Sheet 1: Absorbance", "Absorbance", or by their sheet ("Sheet 1")
export type ExtractNames = 'sheet-column' | 'column' | 'sheet';

const letterIndex = (s: string) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const glob = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');

// The places (from 0) of the names a list picks, in their order; `letters`: B, D-F name columns.
// cols: the columns named (their ids: a name renamed since, or at its place in another source, found too — refs.ts)
export function pick(spec: string, names: string[], letters: boolean, cols?: { name: string; id?: string }[]): { found: number[]; missing: string[] } {
  const n = names.length;
  const lower = names.map((x) => x.trim().toLowerCase());
  const bare = names.map((x) => bareName(x).toLowerCase());
  // by name, or the only name that differs just by a unit (“A1” finds “A1 (a.u.)”), or by its id
  const indexOfName = (t: string) => {
    const k = lower.indexOf(t.trim().toLowerCase());
    if (k >= 0) return cols ? (foundAs('cols', t.trim(), cols[k]), k) : k;
    const b = bareName(t).toLowerCase();
    if (bare.filter((x) => x === b).length === 1) return bare.indexOf(b);
    const c = cols ? resolve('cols', cols, t.trim()) : undefined;
    return c ? cols!.indexOf(c) : -1;
  };
  // the whole text one name (chosen from a list: “Reflectance, s (a.u.)” is not two columns)
  const whole = spec.includes(',') ? lower.indexOf(spec.trim().toLowerCase()) : -1;
  if (whole >= 0) return { found: [whole], missing: [] };
  const take = new Set<number>();
  const drop = new Set<number>();
  const missing: string[] = [];
  const tokens = spec.split(',').map((t) => t.trim()).filter(Boolean);
  if (!tokens.length || tokens.every((t) => t.startsWith('!'))) for (let k = 0; k < n; k++) take.add(k);
  for (const raw of tokens) {
    const not = raw.startsWith('!');
    const t = not ? raw.slice(1).trim() : raw;
    const into = not ? drop : take;
    const at = (k: number) => k >= 0 && k < n && (into.add(k), true);
    let m: RegExpExecArray | null;
    const byName = indexOfName(t);
    if (t === '*' || t.toLowerCase() === 'all') for (let k = 0; k < n; k++) into.add(k);
    else if (byName >= 0) into.add(byName);
    else if ((m = /^(\d+)\s*(?:-\s*(\d+|end))?$/i.exec(t))) {
      const a = Number(m[1]);
      const b = m[2] ? (m[2].toLowerCase() === 'end' ? n : Number(m[2])) : a;
      let any = false;
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) any = at(k - 1) || any;
      if (!any) missing.push(raw);
    } else if (letters && (m = /^([A-Z]{1,2})\s*(?:-\s*([A-Z]{1,2}))?$/.exec(t))) {
      const a = letterIndex(m[1]);
      const b = m[2] ? letterIndex(m[2]) : a;
      let any = false;
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) any = at(k) || any;
      if (!any) missing.push(raw);
    } else if ((m = /^(.+?)\s*-\s*(.+)$/.exec(t)) && indexOfName(m[1]) >= 0 && indexOfName(m[2]) >= 0) {
      // names: A1-A3 = from the column A1 to the column A3
      const a = indexOfName(m[1]);
      const b = indexOfName(m[2]);
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) into.add(k);
    } else if (t.includes('*')) {
      const re = glob(t);
      let any = false;
      names.forEach((x, k) => re.test(x.trim()) && (into.add(k), (any = true)));
      if (!any) missing.push(raw);
    } else missing.push(raw);
  }
  return { found: [...take].filter((k) => !drop.has(k)), missing: missing.filter((x) => !x.startsWith('!')) };
}

export function autoExtract(sheets: Dataset[], rules: ExtractRule[], names: ExtractNames): { dataset: Dataset; warnings: string[]; picked: number } {
  const warnings: string[] = [];
  // every sheet: its columns chosen, with their designation (the first rule naming a column decides)
  const chosen = sheets.map(() => new Map<number, ColumnRole>());
  rules.forEach((r, k) => {
    const sh = pick(r.sheets, sheets.map((s) => s.name), false);
    if (sh.missing.length) warnings.push(`Rule ${k + 1}: no sheet ${sh.missing.map((x) => `“${x}”`).join(', ')}.`);
    let count = 0;
    const lacking: string[] = [];
    for (const s of sh.found) {
      const cols = pick(r.columns, sheets[s].columns.map((c) => c.name), true);
      if (cols.missing.length) lacking.push(sheets[s].name);
      for (const c of cols.found) {
        if (!chosen[s].has(c)) chosen[s].set(c, r.role);
        count++;
      }
    }
    if (lacking.length) warnings.push(`Rule ${k + 1}: column${r.columns.includes(',') ? 's' : ''} “${r.columns}” not found in ${lacking.length === 1 ? `sheet “${lacking[0]}”` : `${lacking.length} sheets`}.`);
    if (!count && sh.found.length) warnings.push(`Rule ${k + 1} takes no column.`);
  });
  // in each sheet, the columns in their order there (so a ±Y follows its Y, a Y its X)
  const several = chosen.filter((m) => m.size).length > 1;
  const out: Column[] = [];
  sheets.forEach((s, j) =>
    [...chosen[j]]
      .sort((a, b) => a[0] - b[0])
      .forEach(([c, role]) => {
        const col = s.columns[c];
        const name = names === 'column' ? col.name : names === 'sheet' && role === 'y' ? s.name : several || names === 'sheet' ? `${s.name}: ${col.name}` : col.name;
        out.push({ ...col, name, role });
      }),
  );
  // names must differ (a Plot takes its columns by name)
  const seen = new Map<string, number>();
  for (const c of out) {
    const k = seen.get(c.name) ?? 0;
    seen.set(c.name, k + 1);
    if (k) c.name = `${c.name} (${k + 1})`;
  }
  return { dataset: { name: sheets.length === 1 ? sheets[0].name : 'extracted', columns: out }, warnings, picked: out.length };
}

// The simple choice as rules: the sheets ticked (by name; none given: all), and every column of the first of them by its
// place with its designation (null / absent: the sheet's own; 'none': not taken) — the same columns of every sheet.
export function simpleRules(sheets: Dataset[], pickNames: string[] | undefined, roles: (ColumnRole | null)[] | undefined): { rules: ExtractRule[]; first?: Dataset; columns: { name: string; role: ColumnRole }[] } {
  const idx = sheets.map((s, k) => (!pickNames || pickNames.includes(s.name) ? k : -1)).filter((k) => k >= 0);
  const first = sheets[idx[0]];
  if (!first) return { rules: [], columns: [] };
  const columns = first.columns.map((c, j) => ({ name: c.name, role: roles?.[j] ?? roleOf(first.columns, j) }));
  const which = idx.map((k) => k + 1).join(', ');
  return { first, columns, rules: columns.flatMap((c, j) => (c.role === 'none' ? [] : [{ sheets: which, columns: String(j + 1), role: c.role }])) };
}

export const ROLE_OPTIONS =(Object.entries(ROLE_LABELS) as [ColumnRole, string][]).filter(([r]) => r !== 'none');
