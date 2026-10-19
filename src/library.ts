// The projects kept in this browser (Projects): every project worked on, by its id, saved by itself as it changes — the
// project, its name, when, its size, its nodes — in IndexedDB (room for many; the big imported texts are kept apart,
// once, by textStore). Opened, renamed, duplicated, deleted; all of them backed up in one file and restored from it. The
// projects kept before (localStorage, by name; the last session) come in by themselves.
import { listSaved, loadFromBrowser, deleteFromBrowser, parseProject, stringifyProject, type LastSession, type Project } from './project.ts';
import { newProjectId } from './figure/embed.ts';
import { withRefs, withTexts } from './textStore.ts';

export type LibEntry = { id: string; name: string; saved: number; size: number; nodes: number };
type Row = LibEntry & { text: string };

const DB = 'graph-flow-library';
const STORE = 'projects';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((ok, fail) => {
      if (typeof indexedDB === 'undefined') return fail(new Error('no IndexedDB'));
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'id' });
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => fail(rq.error);
    });
  return dbp;
}
function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((ok, fail) => {
        const rq = f(d.transaction(STORE, mode).objectStore(STORE));
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = () => fail(rq.error);
      }),
  );
}

// told when the list changes (a project saved by itself, renamed …)
const listeners = new Set<() => void>();
export const onLibrary = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const changed = () => listeners.forEach((l) => l());

const entryOf = ({ text: _t, ...e }: Row): LibEntry => e;
export const libList = (): Promise<LibEntry[]> =>
  run<Row[]>('readonly', (s) => s.getAll())
    .then((rows) => rows.map(entryOf).sort((a, b) => b.saved - a.saved))
    .catch(() => []);

// the project kept (its big texts as references: withTexts brings them back)
export async function libGet(id: string): Promise<Project | string> {
  try {
    const row = await run<Row | undefined>('readonly', (s) => s.get(id));
    return row ? parseProject(row.text) : 'This project is no longer in the browser.';
  } catch {
    return 'The browser storage is not available.';
  }
}

// kept under its id (a new one: a new entry), its name; false: the storage is full or unavailable
export async function libPut(p: Project, name: string, when = Date.now()): Promise<boolean> {
  const id = p.id || newProjectId();
  const text = stringifyProject(withRefs({ ...p, id, name }));
  try {
    await run('readwrite', (s) => s.put({ id, name, saved: when, size: text.length, nodes: p.nodes.length, text } satisfies Row));
    changed();
    return true;
  } catch {
    return false;
  }
}

export async function libRename(id: string, name: string) {
  const row = await run<Row | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
  if (!row) return;
  const p = parseProject(row.text);
  const text = typeof p === 'string' ? row.text : stringifyProject({ ...p, name });
  await run('readwrite', (s) => s.put({ ...row, name, text })).catch(() => undefined);
  changed();
}

// a copy under a new id and name; its id
export async function libDuplicate(id: string, name: string): Promise<string | null> {
  const p = await libGet(id);
  if (typeof p === 'string') return null;
  const nid = newProjectId();
  return (await libPut({ ...p, id: nid }, name)) ? nid : null;
}

export async function libDelete(id: string) {
  await run('readwrite', (s) => s.delete(id)).catch(() => undefined);
  changed();
}

// the projects kept before: by name in localStorage (moved here) and the last session (added when not here yet)
export async function libMigrate(last: LastSession | null) {
  const have = new Set((await libList()).map((e) => e.id));
  for (const e of listSaved()) {
    const p = loadFromBrowser(e.id);
    if (typeof p !== 'string' && (await libPut({ ...p, id: p.id || e.id }, e.name, e.saved))) deleteFromBrowser(e.id);
  }
  const lp = last?.project;
  if (lp?.nodes.length && lp.id && !have.has(lp.id)) await libPut(lp, lp.name || 'untitled', last!.saved);
}

// ---- a backup of all the projects: one file, their texts in it ----
export type Backup = { app: 'graph-flow-backup'; saved: number; projects: { name: string; saved: number; project: Project }[] };

export function backupText(items: Backup['projects']): string {
  return JSON.stringify({ app: 'graph-flow-backup', saved: Date.now(), projects: items } satisfies Backup);
}
// the projects of a backup file (each read as a project file is); an error message when it is not one
export function readBackup(text: string): { name: string; saved: number; project: Project }[] | string {
  let v: Partial<Backup>;
  try {
    v = JSON.parse(text) as Partial<Backup>;
  } catch {
    return 'The file is not valid JSON.';
  }
  if (v.app !== 'graph-flow-backup' || !Array.isArray(v.projects)) return 'This is not a SciPlotFlow backup (a file made by Projects ▸ Back up all).';
  const out: { name: string; saved: number; project: Project }[] = [];
  for (const it of v.projects) {
    const p = parseProject(JSON.stringify(it?.project ?? null));
    if (typeof p !== 'string') out.push({ name: String(it.name || p.name || 'untitled'), saved: Number(it.saved) || Date.now(), project: p });
  }
  return out;
}

// every project kept, with its texts, in one file's text
export async function libBackup(): Promise<{ text: string; count: number; lost: number }> {
  const items: Backup['projects'] = [];
  let lost = 0;
  for (const e of await libList()) {
    const p = await libGet(e.id);
    if (typeof p === 'string') continue;
    const r = await withTexts(p);
    lost += r.lost;
    items.push({ name: e.name, saved: e.saved, project: r.project });
  }
  return { text: backupText(items), count: items.length, lost };
}

// the projects of a backup kept here (a project already here, the same id: replaced when the backup's is newer)
export async function libRestore(text: string): Promise<number | string> {
  const items = readBackup(text);
  if (typeof items === 'string') return items;
  const have = new Map((await libList()).map((e) => [e.id, e.saved]));
  let n = 0;
  for (const it of items) {
    const id = it.project.id || newProjectId();
    if ((have.get(id) ?? 0) >= it.saved) continue;
    if (await libPut({ ...it.project, id }, it.name, it.saved)) n++;
  }
  return n;
}

// project files (or a backup) added to the list without opening them; a project here already (its id): kept beside it as
// another one. The number added, the files that could not be read
export async function libAddFiles(files: { name: string; text: string }[]): Promise<{ added: number; bad: string[] }> {
  const have = new Set((await libList()).map((e) => e.id));
  let added = 0;
  const bad: string[] = [];
  for (const f of files) {
    if (f.text.includes('"graph-flow-backup"')) {
      const r = await libRestore(f.text);
      if (typeof r === 'string') bad.push(f.name);
      else added += r;
      continue;
    }
    const p = parseProject(f.text);
    if (typeof p === 'string') {
      bad.push(f.name);
      continue;
    }
    const id = p.id && !have.has(p.id) ? p.id : newProjectId();
    have.add(id);
    if (await libPut({ ...p, id }, p.name || f.name.replace(/\.json$/i, '') || 'untitled')) added++;
  }
  return { added, bad };
}

// how much of the browser's room is used
export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { used: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}
