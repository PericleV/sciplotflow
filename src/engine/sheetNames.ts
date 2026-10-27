// Rename sheets: the sheets of a workbook given new names — typed one by one, or by a find / replace (text or a
// regular expression), or written from what their names say (a pattern read as in a Batch: “…Append{n}”, then a
// template: “{n} K”) —, put in an order (as they come, by name, by the first value read) and some left out. The new
// names go on to every node after it (Sheets to columns, the legends of a Plot, a Batch over the sheets). Pure.
import type { Dataset, Workbook } from './table.ts';
import { patternOf, readName } from './batch.ts';
import type { RenameSheetsData } from '../types.ts';

export type SheetRename = { from: string; to: string; read: string; dropped: boolean };

// the names compared as people read them: numbers in their order (run 2 before run 10)
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function renameSheets(book: Workbook, d: RenameSheetsData): { book: Workbook; rows: SheetRename[]; warnings: string[] } {
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
  let unread = 0;
  const rows = book.sheets.map((s, k) => {
    const from = s.name;
    const vals = p ? readName(from, p) : null;
    if (p && !vals) unread++;
    let to = from;
    if (p && vals && d.template?.trim()) {
      to = d.template.replace(/\{\s*([^{}]+?)\s*\}/g, (all, name: string) => {
        const j = p.parts.findIndex((q) => q.name.toLowerCase() === name.toLowerCase());
        if (j >= 0) return String(vals[j]);
        if (name === 'name') return from;
        if (name === 'n') return String(k + 1);
        return all;
      });
    }
    if (find) to = to.replace(find, d.replace ?? '');
    const typed = d.names?.[from]?.trim();
    if (typed) to = typed;
    return { from, to: to.trim() || from, read: vals && p ? p.parts.map((q, j) => `${q.name} = ${vals[j]}`).join(', ') : '', dropped: !!d.drop?.includes(from), value: vals?.find((v) => typeof v === 'number') as number | undefined, ds: s };
  });
  if (p && unread) warnings.push(`${unread} of ${rows.length} names do not match the pattern (kept as they are).`);
  // the order, then the names met twice numbered (“T 300 (2)”)
  const kept = rows.filter((r) => !r.dropped);
  if (d.order === 'name') kept.sort((a, b) => natural(a.to, b.to));
  else if (d.order === 'value') kept.sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity) || natural(a.to, b.to));
  const seen = new Map<string, number>();
  const sheets: Dataset[] = kept.map((r) => {
    const n = (seen.get(r.to) ?? 0) + 1;
    seen.set(r.to, n);
    if (n > 1) r.to = `${r.to} (${n})`;
    return { ...r.ds, name: r.to };
  });
  return { book: { ...book, sheets }, rows: rows.map(({ from, to, read, dropped }) => ({ from, to, read, dropped })), warnings };
}
