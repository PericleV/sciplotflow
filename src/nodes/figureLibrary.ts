// The user's own library of figures for Figure Drawings, kept in this browser (IndexedDB): each a set of objects (their
// points from the top-left corner of their box, w × h mm), named; added from a drawing or from SVG files, inserted into
// any drawing, written to a file and read back (to share them). And the saved styles of objects (localStorage).
import type { AnnotationItem } from '../types.ts';

export type LibFigure = { id: string; name: string; saved: number; w: number; h: number; items: AnnotationItem[] };

const DB = 'graph-flow-figures';
const STORE = 'figures';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((ok, fail) => {
      if (typeof indexedDB === 'undefined') return fail(new Error('This browser keeps no data (IndexedDB).'));
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
export const listFigures = () => run<LibFigure[]>('readonly', (s) => s.getAll() as IDBRequest<LibFigure[]>).then((l) => l.sort((a, b) => a.name.localeCompare(b.name)));
export const saveFigure = (f: LibFigure) => run('readwrite', (s) => s.put(f));
export const deleteFigure = (id: string) => run('readwrite', (s) => s.delete(id));
export const newFigureId = () => `fig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// the whole library as a file, and read back (figures with the same id replaced)
export const libraryFile = (list: LibFigure[]) => JSON.stringify({ format: 'graph-flow-figures', version: 1, figures: list });
export function readLibraryFile(text: string): LibFigure[] {
  const j = JSON.parse(text) as { format?: string; figures?: LibFigure[] };
  if (j.format !== 'graph-flow-figures' || !Array.isArray(j.figures)) throw new Error('Not a Graph Flow figure library.');
  return j.figures.filter((f) => f && typeof f.id === 'string' && Array.isArray(f.items) && f.w > 0 && f.h > 0);
}

// ---- saved styles: the look of a shape or a text, by name ----
export type SavedStyle = { name: string; kind: 'shape' | 'text'; style: Record<string, unknown> };
const STYLES = 'graph-flow-drawing-styles';
export function listStyles(): SavedStyle[] {
  try {
    const v = JSON.parse(localStorage.getItem(STYLES) ?? '[]') as SavedStyle[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveStyles(list: SavedStyle[]) {
  try {
    localStorage.setItem(STYLES, JSON.stringify(list));
  } catch {
    // no room: kept for this session only
  }
}
// what a style is: everything but the points, the texts and the links to other objects
const NOT_STYLE = new Set(['kind', 'coords', 'x1', 'y1', 'x2', 'y2', 'points', 'bends', 'curve', 'd', 'href', 'ref', 'from', 'to', 'text', 'text2', 'x', 'y', 'onPath', 'pathD', 'attach', 'z', 'rotation', 'len', 'n', 'a1', 'a2', 'elbowAt']);
export const styleOf = (spec: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(spec).filter(([k, v]) => !NOT_STYLE.has(k) && v !== undefined));

// the style copied (Copy style), pasted on other objects of its kind
let copiedStyle: { kind: string; style: Record<string, unknown> } | null = null;
export const copyStyle = (it: AnnotationItem | undefined) => {
  if (it) copiedStyle = { kind: it.type, style: styleOf(it.spec as Record<string, unknown>) };
};
export const pasteStyle = (items: AnnotationItem[], sel: string[]): AnnotationItem[] | null => {
  const c = copiedStyle;
  return c ? items.map((it) => (sel.includes(it.id) && it.type === c.kind ? ({ ...it, spec: { ...it.spec, ...c.style } } as AnnotationItem) : it)) : null;
};
