// Large texts of a project (imported files, workbook sheets) kept in the browser's IndexedDB, each once: the projects
// kept in the browser (the autosave, the saved projects, the last session) carry a short reference instead of
// megabytes of text, so saving after every change stays instant and fits the browser's small localStorage. A project
// downloaded or shared keeps its texts.
import type { Project } from './project.ts';
import type { AppNode } from './types.ts';

const BIG = 50_000; // characters: smaller texts stay in the project
const DB = 'graph-flow';
const STORE = 'texts';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((ok, fail) => {
      if (typeof indexedDB === 'undefined') return fail(new Error('no IndexedDB'));
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => fail(rq.error);
    });
  return dbp;
}
const stored = new Set<string>();
async function put(key: string, text: string) {
  if (stored.has(key)) return;
  stored.add(key);
  try {
    const d = await db();
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(text, key);
  } catch {
    stored.delete(key);
  }
}
async function get(key: string): Promise<string | undefined> {
  try {
    const d = await db();
    return await new Promise((ok) => {
      const rq = d.transaction(STORE).objectStore(STORE).get(key);
      rq.onsuccess = () => ok(typeof rq.result === 'string' ? rq.result : undefined);
      rq.onerror = () => ok(undefined);
    });
  } catch {
    return undefined;
  }
}

// a key for a text: the same text, the same key (the browser hashes a string once; the last few texts are kept)
const keys = new Map<string, string>();
let next = 0;
function keyOf(text: string): string {
  let k = keys.get(text);
  if (!k) {
    k = `t${Date.now().toString(36)}${(next++).toString(36)}`;
    keys.set(text, k);
    if (keys.size > 30) keys.delete(keys.keys().next().value!);
  }
  return k;
}

type Sheetish = { text: string; textRef?: string };
const refSheets = <S extends Sheetish>(sheets: S[] | undefined) => sheets?.map((s) => (s.text.length > BIG ? ({ ...s, text: '', textRef: ref(s.text) } as S) : s));
function ref(text: string) {
  const k = keyOf(text);
  void put(k, text);
  return k;
}
function refNode(n: AppNode): AppNode {
  if (n.type === 'import') {
    const d = n.data;
    const big = d.text.length > BIG;
    if (!big && !d.sheets?.some((s) => s.text.length > BIG)) return n;
    return { ...n, data: { ...d, ...(big ? { text: '', textRef: ref(d.text) } : {}), ...(d.sheets ? { sheets: refSheets(d.sheets) } : {}) } } as AppNode;
  }
  if (n.type === 'book' && n.data.sheets.some((s) => s.text.length > BIG)) return { ...n, data: { ...n.data, sheets: refSheets(n.data.sheets)! } } as AppNode;
  // an image: its pixels (megabytes of base64) as a reference
  if (n.type === 'image' && n.data.pixels && n.data.pixels.data.length > BIG) return { ...n, data: { ...n.data, pixels: { ...n.data.pixels, data: '', dataRef: ref(n.data.pixels.data) } } } as AppNode;
  if (n.type === 'subgraph') return { ...n, data: { ...n.data, nodes: n.data.nodes.map(refNode) } } as AppNode;
  return n;
}
// the project as kept in the browser: big texts as references (written to IndexedDB)
export const withRefs = (p: Project): Project => ({ ...p, nodes: p.nodes.map(refNode) });

const hasRef = (n: AppNode): boolean =>
  n.type === 'import' ? !!n.data.textRef || !!n.data.sheets?.some((s) => s.textRef)
  : n.type === 'book' ? n.data.sheets.some((s) => s.textRef)
  : n.type === 'image' ? !!n.data.pixels?.dataRef
  : n.type === 'subgraph' ? n.data.nodes.some(hasRef)
  : false;
export const hasRefs = (p: Project) => p.nodes.some(hasRef);

async function fill<S extends Sheetish>(sheets: S[] | undefined, lost: string[]) {
  return sheets && (await Promise.all(sheets.map(async (s) => (s.textRef ? await back(s.textRef, s, lost) : s))));
}
async function back<S extends Sheetish>(key: string, s: S, lost: string[]): Promise<S> {
  const t = await get(key);
  if (t === undefined) lost.push(key);
  else stored.add(key);
  const { textRef: _r, ...rest } = s;
  return t === undefined ? s : ({ ...rest, text: t } as S);
}
async function fillNode(n: AppNode, lost: string[]): Promise<AppNode> {
  if (n.type === 'import') {
    const d = n.data;
    const main = d.textRef ? await back(d.textRef, { text: d.text, textRef: d.textRef }, lost) : null;
    const { textRef: _r, ...rest } = d;
    return { ...n, data: { ...(main && !main.textRef ? rest : d), ...(main ? { text: main.text } : {}), ...(d.sheets ? { sheets: await fill(d.sheets, lost) } : {}) } } as AppNode;
  }
  if (n.type === 'book') return { ...n, data: { ...n.data, sheets: (await fill(n.data.sheets, lost))! } } as AppNode;
  if (n.type === 'image' && n.data.pixels?.dataRef) {
    const t = await get(n.data.pixels.dataRef);
    if (t === undefined) {
      lost.push(n.data.pixels.dataRef);
      return n;
    }
    stored.add(n.data.pixels.dataRef);
    const { dataRef: _r, ...px } = n.data.pixels;
    return { ...n, data: { ...n.data, pixels: { ...px, data: t } } } as AppNode;
  }
  if (n.type === 'subgraph') return { ...n, data: { ...n.data, nodes: await Promise.all(n.data.nodes.map((q) => fillNode(q, lost))) } } as AppNode;
  return n;
}
// the project with its texts back (lost: the texts the browser no longer has)
export async function withTexts(p: Project): Promise<{ project: Project; lost: number }> {
  const lost: string[] = [];
  const nodes = await Promise.all(p.nodes.map((n) => fillNode(n, lost)));
  return { project: { ...p, nodes }, lost: lost.length };
}
