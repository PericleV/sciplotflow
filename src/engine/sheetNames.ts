// Sheets (once Rename sheets): the sheets of a workbook arranged as the Columns node arranges columns — a row each,
// moved with the mouse, kept or left out, its new name typed —, sheets added (a copy of one, an empty one with its
// columns named, the tables on the ports A, B …), and every name changed at once: a find / replace (text or a regular
// expression), or written from what the names say (a pattern read as in a Batch: “…Append{n}”, then a template: “{n}
// K”); an order (as they come or as moved, by name, by the first value read). The new names go on to every node after
// it (Sheets to columns, the legends of a Plot, a Batch over the sheets). Pure.
//
// The settings know a sheet by its key: a sheet of the workbook by its name as it comes (one renamed upstream since: the
// name the settings give it, refs.ts), a sheet on a port by {A} (a workbook's: {A}:its name), a sheet added by = and its
// id.
import { column, type Dataset, type Workbook } from './table.ts';
import { patternOf, readName } from './batch.ts';
import { inOrder, knownAs } from './refs.ts';
import type { RenameSheetsData } from '../types.ts';

// a row of the list: its key, its name as it comes, its new name, what its name said, left out or not; added: a copy or
// an empty sheet made here (its settings in the node), port: the letter of the port it comes from
export type SheetRename = { key: string; from: string; to: string; read: string; dropped: boolean; added?: 'copy' | 'empty'; port?: string };
// a table on a port A, B …: a dataset (one sheet) or a workbook (all its sheets)
export type SheetsInput = { letter: string; value: Dataset | Workbook; book: boolean };

// the names compared as people read them: numbers in their order (run 2 before run 10)
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// node: the node's id (the ids of the sheets added here)
export function renameSheets(book: Workbook, d: RenameSheetsData, inputs: SheetsInput[] = [], node = ''): { book: Workbook; rows: SheetRename[]; warnings: string[] } {
  const warnings: string[] = [];
  // the find: text, or a regular expression (its groups $1 … in the replacement)
  let find: RegExp | null = null;
  if (d.find) {
    try {
      find = new RegExp(d.regex ? d.find : d.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    } catch (e) {
      warnings.push(`Find: ${(e as Error).message}`);
    }
  }
  // the pattern read from the names, and the template written from it
  const pat = d.pattern?.trim() ? patternOf(d.pattern.trim()) : null;
  if (typeof pat === 'string') warnings.push(`Pattern: ${pat}`);
  const p = pat && typeof pat !== 'string' ? pat : null;
  // the sheets as they come: the workbook's (by the names the settings know them by), the ports'
  const added = d.added ?? [];
  const known = knownAs('sheets', book.sheets, [...Object.keys(d.names ?? {}), ...(d.drop ?? []), ...(d.moved ?? []), ...added.flatMap((a) => (a.kind === 'copy' && a.copy ? [a.copy] : []))].filter((q) => !/^[={]/.test(q)));
  const from: { key: string; ds: Dataset; port?: string }[] = book.sheets.map((s, j) => ({ key: known[j], ds: s }));
  for (const i of inputs) {
    if (i.book) for (const s of (i.value as Workbook).sheets) from.push({ key: `{${i.letter}}:${s.name}`, ds: s, port: i.letter });
    else from.push({ key: `{${i.letter}}`, ds: i.value as Dataset, port: i.letter });
  }
  let unread = 0;
  const rows = from.map(({ key, ds, port }, k) => {
    const name = ds.name;
    const vals = p ? readName(name, p) : null;
    if (p && !vals) unread++;
    let to = name;
    if (p && vals && d.template?.trim()) {
      to = d.template.replace(/\{\s*([^{}]+?)\s*\}/g, (all, part: string) => {
        const j = p.parts.findIndex((q) => q.name.toLowerCase() === part.toLowerCase());
        if (j >= 0) return String(vals[j]);
        if (part === 'name') return name;
        if (part === 'n') return String(k + 1);
        return all;
      });
    }
    if (find) to = to.replace(find, d.replace ?? '');
    const typed = d.names?.[key]?.trim();
    if (typed) to = typed;
    return { key, from: name, to: to.trim() || name, read: vals && p ? p.parts.map((q, j) => `${q.name} = ${vals[j]}`).join(', ') : '', dropped: !!d.drop?.includes(key), value: vals?.find((v) => typeof v === 'number') as number | undefined, ds, ...(port ? { port } : {}) };
  });
  if (p && unread) warnings.push(`${unread} of ${rows.length} names do not match the pattern (kept as they are).`);
  // the sheets added, in their order: a copy of a sheet (of those above, left out or not), or empty with its columns
  // named (as many rows as asked); their names as given
  for (const a of added) {
    let ds: Dataset;
    const name = a.name.trim() || (a.kind === 'copy' ? 'Copy' : 'Sheet');
    if (a.kind === 'copy') {
      const src = rows.find((r) => r.key === a.copy);
      if (!src) warnings.push(a.copy ? `“${name}”: no sheet “${a.copy}” to copy.` : `“${name}”: choose the sheet it copies.`);
      ds = { ...(src?.ds ?? { columns: [] }), name, id: `${node}:=${a.id}` };
    } else {
      const n = Math.max(0, Math.min(1e6, Math.floor(a.rows ?? 10)));
      const names = (a.cols ?? '').split(',').map((q) => q.trim()).filter(Boolean);
      ds = { name, id: `${node}:=${a.id}`, columns: names.map((c) => column(c, new Float64Array(n).fill(NaN))) };
    }
    const key = `=${a.id}`;
    rows.push({ key, from: name, to: d.names?.[key]?.trim() || name, read: '', dropped: !!d.drop?.includes(key), value: undefined, ds });
  }
  // the order: as moved by hand (the others after them), by name, or by the value read
  let order = inOrder(rows.map((r) => r.key), d.moved);
  if (d.order === 'name') order = [...order].sort((a, b) => natural(rows[a].to, rows[b].to));
  else if (d.order === 'value') order = [...order].sort((a, b) => (rows[a].value ?? Infinity) - (rows[b].value ?? Infinity) || natural(rows[a].to, rows[b].to));
  const shown = order.map((j) => rows[j]);
  // the names met twice numbered (“T 300 (2)”)
  const seen = new Map<string, number>();
  const sheets: Dataset[] = [];
  for (const r of shown) {
    if (r.dropped) continue;
    const n = (seen.get(r.to) ?? 0) + 1;
    seen.set(r.to, n);
    if (n > 1) r.to = `${r.to} (${n})`;
    sheets.push({ ...r.ds, name: r.to });
  }
  const kind = (key: string) => added.find((a) => `=${a.id}` === key)?.kind;
  return {
    book: { ...book, sheets },
    rows: shown.map(({ key, from, to, read, dropped, port }) => ({ key, from, to, read, dropped, ...(kind(key) ? { added: kind(key) } : {}), ...(port ? { port } : {}) })),
    warnings,
  };
}
