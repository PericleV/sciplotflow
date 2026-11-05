// The ids of the sheets and columns, and how a node finds the ones it names. A sheet's id is its source's (the node
// that made it, the file read) and its place there: “import-1~a3f2:s0”; a column's is its sheet's and its own place as
// read: “import-1~a3f2:s0:c2”. An id stays with its sheet / column when it is renamed, moved, or others are deleted; the
// nodes that only pass a column on keep its id.
// A node names its columns and sheets as they were when chosen; `nameIds` (in its data) keeps the ids they had then. A name
// is found: as it is written; else by its id (renamed since: the new name shown); else without its unit (older projects);
// else, a source of another file or node with the same layout, by its place (“Intensity” is now “Counts”: said in a
// warning until the node is told to keep it).
// at: the place of each name in the list it was found in, and how many the list had ([place, count]): when nothing else
// finds it, the item at that place of a list as long (another table of the same layout, its names all different)
export type DataRefs = { cols?: Record<string, string[]>; sheets?: Record<string, string[]>; at?: { cols?: Record<string, [number, number]>; sheets?: Record<string, [number, number]> } };
export type RefKind = 'cols' | 'sheets';
// A name found by its place (the source changed): what was asked, what was found, its id.
export type PlaceMatch = { kind: RefKind; asked: string; got: string; id: string };
// What a node's evaluation found: the ids of the names found as written or by id (to keep), the names found under
// another name (shown so), those found by their place.
export type Aliases = { cols?: Record<string, string>; sheets?: Record<string, string> };
export type Resolved = { learned: DataRefs; aliases: Aliases; place: PlaceMatch[]; misses: [RefKind, string][] };

// misses: the names not found as written (their refs decide what is found: a result kept is valid while they stay)
type Ctx = { refs?: DataRefs; learned: Record<RefKind, Map<string, Set<string>>>; at: Record<RefKind, Map<string, [number, number]>>; aliases: Record<RefKind, Map<string, string>>; place: PlaceMatch[]; misses: [RefKind, string][] };
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
// The places of these keys (ids, places as read) in the order shown: those of `order` first, in its order (sheets moved
// with the mouse); the others after them, as they come.
export function inOrder<K>(keys: K[], order: K[] | undefined): number[] {
  const at = keys.map((_, i) => i);
  if (!order?.length) return at;
  const pos = new Map(order.map((q, i) => [q, i]));
  return at.sort((a, b) => (pos.get(keys[a]) ?? 1e9 + a) - (pos.get(keys[b]) ?? 1e9 + b));
}

// A node's evaluation (with the sheet taken from a workbook on its port) under its references: what it finds is noted.
export type RefScope = Ctx;
export const newScope = (refs: DataRefs | undefined): RefScope => ({ refs, learned: { cols: new Map(), sheets: new Map() }, at: { cols: new Map(), sheets: new Map() }, aliases: { cols: new Map(), sheets: new Map() }, place: [], misses: [] });
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
    if (c.at[kind].size) learned.at = { ...learned.at, [kind]: Object.fromEntries(c.at[kind]) };
    if (c.aliases[kind].size) aliases[kind] = Object.fromEntries(c.aliases[kind]);
  }
  return { learned, aliases, place: c.place, misses: c.misses };
}
export const hasFindings = (f: Resolved) => !!(f.learned.cols || f.learned.sheets || f.learned.at || f.aliases.cols || f.aliases.sheets || f.place.length || f.misses.length);
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
// the nodes a source went through after its file or node (`import~file>smooth#0`: “>smooth#0”; none: '')
const chainOf = (source: string) => {
  const k = source.indexOf('>');
  return k < 0 ? '' : source.slice(k);
};
// The one item at the place of this id in another source (another node, another file: not another sheet of the same
// one) — none, or more than one: undefined. Its own source still among them: the item was taken out, not replaced.
// (the nodes a column went through count: “Sample (smoothed)” of another file is at the place of “Sample (smoothed)”, not
// of “Sample”)
// loose: another chain of nodes too — the only item made by a node at that place, made as the one asked (“Sample
// (normalized) (smoothed)” → “Sample (smoothed)”, its last node's first column of it)
function byPlace<C extends { id?: string }>(list: C[], id: string, loose = false): C | undefined {
  const want = splitId(id);
  const chain = chainOf(want.source);
  let hit: C | undefined;
  let other: C | undefined;
  let hits = 0;
  let others = 0;
  for (const c of list) {
    if (c.id === undefined) continue;
    const q = splitId(c.id);
    if (q.source === want.source) return undefined;
    if (q.place !== want.place) continue;
    const ch = chainOf(q.source);
    if (ch === chain) [hit, hits] = [c, hits + 1];
    else if (loose && chain && ch && lastMade(ch) === lastMade(chain)) [other, others] = [c, others + 1];
  }
  return hits === 1 ? hit : !hits && others === 1 ? other : undefined;
}
// which column of an input the last node made (“>smooth#0”: “#0”)
const lastMade = (chain: string) => chain.slice(chain.lastIndexOf('#'));
// (the place of a name in its list, and how many the list has)
const learnAt = <C,>(kind: RefKind, name: string, list: C[], item: C) => {
  const k = list.indexOf(item);
  if (ctx && k >= 0) ctx.at[kind].set(name, [k, list.length]);
};
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
    if (exact) {
      learn(kind, name, exact.id);
      learnAt(kind, name, list, exact);
    }
    return exact;
  }
  if (ctx && !ctx.misses.some(([k, q]) => k === kind && q === name)) ctx.misses.push([kind, name]);
  const ids = ctx?.refs?.[kind]?.[name];
  const same = ids?.length ? byIds(list, ids) : undefined;
  if (same) {
    learn(kind, name, same.id);
    learnAt(kind, name, list, same);
    ctx!.aliases[kind].set(name, same.name);
    return same;
  }
  const n = near?.();
  if (n) {
    learn(kind, name, n.id);
    learnAt(kind, name, list, n);
    return n;
  }
  const placed = (c: C) => {
    if (!ctx) return c;
    ctx.aliases[kind].set(name, c.name);
    if (!ctx.place.some((q) => q.kind === kind && q.asked === name)) ctx.place.push({ kind, asked: name, got: c.name, id: c.id ?? '' });
    return c;
  };
  const moved = ids?.length === 1 ? byPlace(list, ids[0]) : undefined;
  if (moved) return placed(moved);
  // then the item at the place it had in a list as long (the same layout, the names all different) — unless the source
  // it came from is still there (it was taken out, not replaced)
  const from = ids?.length ? new Set(ids.map((q) => splitId(q).source)) : null;
  if (from && list.some((c) => c.id !== undefined && from.has(splitId(c.id).source))) return undefined;
  const at = ctx?.refs?.at?.[kind]?.[name];
  if (at && at[1] === list.length && list[at[0]]) return placed(list[at[0]]);
  // last, the place it came from in another chain of nodes
  const loose = ids?.length === 1 ? byPlace(list, ids[0], true) : undefined;
  return loose ? placed(loose) : undefined;
}
// A sheet or column found otherwise than by resolve (at the place given, when names repeat): its id kept all the same.
export function foundAs<C extends { id?: string }>(kind: RefKind, name: string, item: C | undefined): C | undefined {
  if (item) learn(kind, name, item.id);
  return item;
}
// A sheet of a workbook by its name (as resolve: renamed, or at its place in another source).
export const findSheet = <S extends { name: string; id?: string }>(sheets: S[], name: string): S | undefined => resolve('sheets', sheets, name);
// The names a node's settings (kept by name) know these sheets / columns by: as they are now; one renamed since (or, another
// source of the same layout, at the place of one) the name the settings give it, unless they name it as it is now too.
export function knownAs<C extends { name: string; id?: string }>(kind: RefKind, list: C[], named: Iterable<string>): string[] {
  const known = list.map((c) => c.name);
  const asked = new Set(named);
  for (const name of asked) {
    const c = name ? resolve(kind, list, name) : undefined;
    const j = c ? list.indexOf(c) : -1;
    if (j >= 0 && known[j] === c!.name && c!.name !== name && !asked.has(c!.name)) known[j] = name;
  }
  return known;
}

// The node's references with what an evaluation found: the names found as written or by id get the ids they have now
// (the others kept as they were: not looked up this time, or found by their place and not kept yet).
export function mergeRefs(refs: DataRefs | undefined, learned: DataRefs): DataRefs | undefined {
  let out = refs;
  for (const kind of ['cols', 'sheets'] as const) {
    const add = learned[kind];
    if (add)
      for (const [name, ids] of Object.entries(add)) {
        const had = out?.[kind]?.[name];
        if (had && had.length === ids.length && had.every((q, i) => q === ids[i])) continue;
        out = { ...out, [kind]: { ...out?.[kind], [name]: ids } };
      }
    // (the places: as found now)
    for (const [name, at] of Object.entries(learned.at?.[kind] ?? {})) {
      const had = out?.at?.[kind]?.[name];
      if (had && had[0] === at[0] && had[1] === at[1]) continue;
      out = { ...out, at: { ...out?.at, [kind]: { ...out?.at?.[kind], [name]: at } } };
    }
  }
  return out;
}
// The names found by their place kept: from now on they mean the columns / sheets found.
export function keepPlaces(refs: DataRefs | undefined, place: PlaceMatch[]): DataRefs | undefined {
  let out = refs;
  for (const p of place) if (p.id) out = { ...out, [p.kind]: { ...out?.[p.kind], [p.asked]: [p.id] } };
  return out;
}
