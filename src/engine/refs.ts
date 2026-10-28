// The ids of the sheets and columns, and how a node finds the ones it names. A sheet's id is its source's (the node
// that made it, the file read) and its place there: “import-1~a3f2:s0”; a column's is its sheet's and its own place as
// read: “import-1~a3f2:s0:c2”. An id stays with its sheet / column when it is renamed, moved, or others are deleted; the
// nodes that only pass a column on keep its id.
// A node names its columns and sheets as they were when chosen; `nameIds` (in its data) keeps the ids they had then. A name
// is found: as it is written; else by its id (renamed since: the new name shown); else without its unit (older projects);
// else, a source of another file or node with the same layout, by its place (“Intensity” is now “Counts”: said in a
// warning until the node is told to keep it).
export type DataRefs = { cols?: Record<string, string[]>; sheets?: Record<string, string[]> };
export type RefKind = 'cols' | 'sheets';
// A name found by its place (the source changed): what was asked, what was found, its id.
export type PlaceMatch = { kind: RefKind; asked: string; got: string; id: string };
// What a node's evaluation found: the ids of the names found as written or by id (to keep), the names found under
// another name (shown so), those found by their place.
export type Aliases = { cols?: Record<string, string>; sheets?: Record<string, string> };
export type Resolved = { learned: DataRefs; aliases: Aliases; place: PlaceMatch[]; misses: [RefKind, string][] };

// misses: the names not found as written (their refs decide what is found: a result kept is valid while they stay)
type Ctx = { refs?: DataRefs; learned: Record<RefKind, Map<string, Set<string>>>; aliases: Record<RefKind, Map<string, string>>; place: PlaceMatch[]; misses: [RefKind, string][] };
let ctx: Ctx | null = null;

// An id as its source and its place there (a column: its sheet's place and its own, “s0:c2”; a sheet: “s0”): the same
// place in another source of the same layout.
export function splitId(id: string): { source: string; place: string } {
  const m = /^(.*?):((?:[^:]*:)?c\d+)$/.exec(id) ?? /^(.*):([^:]*)$/.exec(id);
  return m ? { source: m[1], place: m[2] } : { source: '', place: id };
}
export const sheetId = (source: string, k: number) => `${source}:s${k}`;
// an Import's source: the node and the file read into it (another file: other ids, its columns found by name or place)
export const importSource = (node: string, textId: string) => (textId ? `${node}~${textId}` : node);
export const columnId = (sheet: string, k: number) => `${sheet}:c${k}`;

// A node's evaluation (with the sheet taken from a workbook on its port) under its references: what it finds is noted.
export type RefScope = Ctx;
export const newScope = (refs: DataRefs | undefined): RefScope => ({ refs, learned: { cols: new Map(), sheets: new Map() }, aliases: { cols: new Map(), sheets: new Map() }, place: [], misses: [] });
export function inScope<T>(scope: RefScope, f: () => T): T {
  const prev = ctx;
  ctx = scope;
  try {
    return f();
  } finally {
    ctx = prev;
  }
}
export function findings(c: RefScope): Resolved {
  const rec = (m: Map<string, Set<string>>) => Object.fromEntries([...m].map(([k, s]) => [k, [...s]]));
  const learned: DataRefs = {};
  const aliases: Aliases = {};
  for (const kind of ['cols', 'sheets'] as const) {
    if (c.learned[kind].size) learned[kind] = rec(c.learned[kind]);
    if (c.aliases[kind].size) aliases[kind] = Object.fromEntries(c.aliases[kind]);
  }
  return { learned, aliases, place: c.place, misses: c.misses };
}
export const hasFindings = (f: Resolved) => !!(f.learned.cols || f.learned.sheets || f.aliases.cols || f.aliases.sheets || f.place.length || f.misses.length);
// What decides a result found with these misses: their refs (a result kept while they are the same).
export const missKey = (refs: DataRefs | undefined, misses: [RefKind, string][]) => (misses.length ? JSON.stringify(misses.map(([k, q]) => refs?.[k]?.[q] ?? null)) : '');
export const sameRefs = (a: DataRefs | undefined, b: DataRefs | undefined) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

// The one item of the list with one of these ids (none, or more than one: undefined).
function byIds<C extends { id?: string }>(list: C[], ids: string[]): C | undefined {
  const want = new Set(ids);
  let hit: C | undefined;
  for (const c of list) {
    if (c.id === undefined || !want.has(c.id)) continue;
    if (hit) return undefined;
    hit = c;
  }
  return hit;
}
// The one item at the place of this id in another source (another node, another file: not another sheet of the same
// one) — none, or more than one: undefined.
function byPlace<C extends { id?: string }>(list: C[], id: string): C | undefined {
  const want = splitId(id);
  let hit: C | undefined;
  for (const c of list) {
    if (c.id === undefined) continue;
    const q = splitId(c.id);
    if (q.place !== want.place || q.source === want.source) continue;
    if (hit) return undefined;
    hit = c;
  }
  return hit;
}
const learn = (kind: RefKind, name: string, id: string | undefined) => {
  if (!ctx || id === undefined) return;
  const m = ctx.learned[kind];
  if (!m.has(name)) m.set(name, new Set());
  m.get(name)!.add(id);
};

// A sheet or column by its name, then by its id, then by `near` (the column without its unit), then by its place.
export function resolve<C extends { name: string; id?: string }>(kind: RefKind, list: C[], name: string, near?: () => C | undefined): C | undefined {
  const exact = list.find((c) => c.name === name);
  if (exact || !name) {
    if (exact) learn(kind, name, exact.id);
    return exact;
  }
  if (ctx && !ctx.misses.some(([k, q]) => k === kind && q === name)) ctx.misses.push([kind, name]);
  const ids = ctx?.refs?.[kind]?.[name];
  const same = ids?.length ? byIds(list, ids) : undefined;
  if (same) {
    learn(kind, name, same.id);
    ctx!.aliases[kind].set(name, same.name);
    return same;
  }
  const n = near?.();
  if (n) {
    learn(kind, name, n.id);
    return n;
  }
  if (ids?.length !== 1) return undefined;
  const moved = byPlace(list, ids[0]);
  if (moved && ctx) {
    ctx.aliases[kind].set(name, moved.name);
    if (!ctx.place.some((q) => q.kind === kind && q.asked === name)) ctx.place.push({ kind, asked: name, got: moved.name, id: moved.id! });
  }
  return moved;
}
// A sheet or column found otherwise than by resolve (at the place given, when names repeat): its id kept all the same.
export function foundAs<C extends { id?: string }>(kind: RefKind, name: string, item: C | undefined): C | undefined {
  if (item) learn(kind, name, item.id);
  return item;
}
// A sheet of a workbook by its name (as resolve: renamed, or at its place in another source).
export const findSheet = <S extends { name: string; id?: string }>(sheets: S[], name: string): S | undefined => resolve('sheets', sheets, name);

// The node's references with what an evaluation found: the names found as written or by id get the ids they have now
// (the others kept as they were: not looked up this time, or found by their place and not kept yet).
export function mergeRefs(refs: DataRefs | undefined, learned: DataRefs): DataRefs | undefined {
  let out = refs;
  for (const kind of ['cols', 'sheets'] as const) {
    const add = learned[kind];
    if (!add) continue;
    for (const [name, ids] of Object.entries(add)) {
      const had = out?.[kind]?.[name];
      if (had && had.length === ids.length && had.every((q, i) => q === ids[i])) continue;
      out = { ...out, [kind]: { ...out?.[kind], [name]: ids } };
    }
  }
  return out;
}
// The names found by their place kept: from now on they mean the columns / sheets found.
export function keepPlaces(refs: DataRefs | undefined, place: PlaceMatch[]): DataRefs | undefined {
  let out = refs;
  for (const p of place) out = { ...out, [p.kind]: { ...out?.[p.kind], [p.asked]: [p.id] } };
  return out;
}
