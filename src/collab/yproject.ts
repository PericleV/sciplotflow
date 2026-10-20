// The project as a shared document (Yjs, a CRDT), for working on it together in real time: every peer keeps a copy,
// the changes of each are merged without conflicts, and all the copies end the same.
//
// Written as a difference: only what changed since the project before (nodes added or removed, a node moved, framed,
// sized, a field of its data) — a node object that is still the same object is not looked at. Read back the same way:
// only the nodes the document changed are made again, the others stay the very objects they were (the evaluation's
// cache and the drawing of the nodes keep them).
//
// What merges: a node's type, place, frame and size, and every top-level field of its data, are each one value — two
// peers changing different fields of the same node both keep theirs; the same field, one of them wins (the same one on
// every peer). The order of the nodes (the drawing order) and of the connections (the order of several on one port) is
// an order number per item, ties broken by the id. Read back, the project is always whole: a connection to a node that
// is gone, or a frame that is gone, is dropped (one peer removed a node while another connected to it), a frame comes
// before the nodes in it. Pure: no page, no network (the transport is apart).
import * as Y from 'yjs';
import type { Edge } from '@xyflow/react';
import { PROJECT_VERSION, type Project } from '../project.ts';
import type { AppNode } from '../types.ts';

type Rec = Record<string, unknown>;
const NODE_KEYS = ['type', 'position', 'parentId', 'width', 'height'] as const;
const EDGE_KEYS = ['source', 'sourceHandle', 'target', 'targetHandle'] as const;

// A value is kept in the document as it is (the project's values are plain JSON — NaN and ±Infinity too — and never
// changed in place): no copy, so the document and the page share the very same value, and comparing them is at once
// (an imported file of 100 MB is never copied nor read through again). Values are compared by identity first; two
// objects that are not the same one, by their text.
const NONFINITE = '$num';
const replacer = (_: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? { [NONFINITE]: String(v) } : v);
const textOf = (v: unknown) => JSON.stringify(v, replacer);
const same = (a: unknown, b: unknown) => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  return textOf(a) === textOf(b);
};
const plain = (v: unknown): unknown => v;

export type YProject = { doc: Y.Doc; nodes: Y.Map<Y.Map<unknown>>; edges: Y.Map<Y.Map<unknown>>; meta: Y.Map<unknown> };
export const yProject = (doc: Y.Doc): YProject => ({ doc, nodes: doc.getMap('nodes'), edges: doc.getMap('edges'), meta: doc.getMap('meta') });

// a field written when it differs (absent: removed)
function put(m: Y.Map<unknown>, k: string, v: unknown) {
  if (v === undefined) {
    if (m.has(k)) m.delete(k);
  } else if (!m.has(k) || !same(m.get(k), v)) m.set(k, plain(v));
}

// the items in the order of the document: by their order number, then their id
const orderOf = (map: Y.Map<Y.Map<unknown>>, id: string) => {
  const o = map.get(id)?.get('order');
  return typeof o === 'number' ? o : Infinity;
};
function ordered(map: Y.Map<Y.Map<unknown>>): string[] {
  return [...map.keys()].sort((a, b) => orderOf(map, a) - orderOf(map, b) || (a < b ? -1 : a > b ? 1 : 0));
}
// The order of the items written here: a new one between its neighbours (the others keep their numbers, a peer's new
// items too); the items moved here (brought to the front) — or no base — all numbered in this order.
function placeOrder(map: Y.Map<Y.Map<unknown>>, ids: string[], baseIds: string[] | null) {
  const now = new Set(ids);
  const known = baseIds ? new Set(baseIds) : null;
  const a = known ? ids.filter((id) => known.has(id)) : [];
  const b = baseIds ? baseIds.filter((id) => now.has(id)) : [];
  if (!known || a.length !== b.length || a.some((id, k) => id !== b[k])) {
    ids.forEach((id, k) => {
      const m = map.get(id);
      if (m && m.get('order') !== k) m.set('order', k);
    });
    return;
  }
  ids.forEach((id, k) => {
    const m = map.get(id);
    if (!m || typeof m.get('order') === 'number') return;
    let lo = -Infinity;
    for (let j = k - 1; j >= 0 && !Number.isFinite(lo); j--) lo = orderOf(map, ids[j]);
    let hi = Infinity;
    for (let j = k + 1; j < ids.length && !Number.isFinite(hi); j++) hi = orderOf(map, ids[j]);
    m.set('order', Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : Number.isFinite(lo) ? lo + 1 : Number.isFinite(hi) ? hi - 1 : 0);
  });
}

// what changed here in a node, against the base (its fields; its data, field by field)
function nodeDiffers(n: AppNode, b: AppNode): boolean {
  const [nr, br] = [n as unknown as Rec, b as unknown as Rec];
  if (NODE_KEYS.some((k) => nr[k] !== br[k] && !same(nr[k], br[k]))) return true;
  const [nd, bd] = [n.data as Rec, b.data as Rec];
  if (nd === bd) return false;
  for (const k of new Set([...Object.keys(nd), ...Object.keys(bd)])) if (nd[k] !== bd[k] && !same(nd[k], bd[k])) return true;
  return false;
}
const edgeDiffers = (e: Edge, b: Edge) => EDGE_KEYS.some((k) => (e as unknown as Rec)[k] !== (b as unknown as Rec)[k]);

// The project changed here written into the document: only what differs from `base` — the project these changes were
// made on (the document as this side last saw it). So a change of another peer that came in meanwhile, and is not yet
// in `p`, is never written back over: a node another peer added stays, one it removed is not brought back (unless it
// was changed here). No base: the project is the whole truth (what the document has more is removed). One transaction,
// with this origin (a peer knows its own changes by it).
export function writeProject(y: YProject, p: Project, base?: Project | null, origin: unknown = null) {
  const was = new Map((base?.nodes ?? []).map((n) => [n.id, n]));
  const wasE = new Map((base?.edges ?? []).map((e) => [e.id, e]));
  y.doc.transact(() => {
    if ((!base || (p.name ?? '') !== (base.name ?? '')) && (y.meta.get('name') ?? '') !== (p.name ?? '')) y.meta.set('name', p.name ?? '');
    if (p.id && !y.meta.has('id')) y.meta.set('id', p.id);
    // removed here
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const id of base ? [...was.keys()] : [...y.nodes.keys()]) if (!ids.has(id) && y.nodes.has(id)) y.nodes.delete(id);
    for (const n of p.nodes) {
      const b = was.get(n.id);
      if (b && (b === n || !nodeDiffers(n, b))) continue;
      let m = y.nodes.get(n.id);
      // new here, removed by another peer while it was changed here, or not known to the base: written whole (a field
      // equal to the document's costs nothing)
      const whole = !m || !b;
      if (!m) {
        m = new Y.Map();
        y.nodes.set(n.id, m);
        m.set('data', new Y.Map());
      }
      const nr = n as unknown as Rec;
      const br = b as unknown as Rec | undefined;
      for (const k of NODE_KEYS) if (whole || (nr[k] !== br![k] && !same(nr[k], br![k]))) put(m, k, nr[k]);
      const d = m.get('data') as Y.Map<unknown>;
      const nd = n.data as Rec;
      const bd = b?.data as Rec | undefined;
      if (!whole && nd === bd) continue;
      const keys = new Set([...Object.keys(nd), ...(whole ? [...d.keys()] : Object.keys(bd!))]);
      for (const k of keys) if (whole || (nd[k] !== bd![k] && !same(nd[k], bd![k]))) put(d, k, nd[k]);
    }
    placeOrder(y.nodes, p.nodes.map((n) => n.id), base ? base.nodes.map((n) => n.id) : null);
    const eids = new Set(p.edges.map((e) => e.id));
    for (const id of base ? [...wasE.keys()] : [...y.edges.keys()]) if (!eids.has(id) && y.edges.has(id)) y.edges.delete(id);
    for (const e of p.edges) {
      const b = wasE.get(e.id);
      if (b && (b === e || !edgeDiffers(e, b))) continue;
      let m = y.edges.get(e.id);
      if (!m) {
        m = new Y.Map();
        y.edges.set(e.id, m);
      }
      for (const k of EDGE_KEYS) put(m, k, (e as unknown as Rec)[k]);
    }
    placeOrder(y.edges, p.edges.map((e) => e.id), base ? base.edges.map((e) => e.id) : null);
    // a connection to a node that is gone (removed by one peer while another connected to it) taken out
    for (const [id, m] of [...y.edges.entries()]) if (!y.nodes.has(m.get('source') as string) || !y.nodes.has(m.get('target') as string)) y.edges.delete(id);
  }, origin);
}

// The others' changes put into what this side shows (`cur`: nodes with the page's own fields — selected, measured),
// a three-way merge: `base` is the project this side last wrote or showed, `next` the document now. A field the
// document changed since the base is taken, unless this side changed it too and has not sent it yet (that one stays,
// it goes out next); a node removed here and not yet sent stays removed, one added here stays (at the end); a node
// removed by the others goes. `changed`: the nodes the others changed since the base (the others are not compared —
// a node nobody changed stays the very object).
export function mergeNodes(cur: AppNode[], next: Project, base: Project, changed?: Set<string> | null): AppNode[] {
  const bs = new Map(base.nodes.map((n) => [n.id, n]));
  const nx = new Map(next.nodes.map((n) => [n.id, n]));
  const byId = new Map(cur.map((n) => [n.id, n]));
  const field = (c: unknown, b: unknown, n: unknown, known: boolean) => (!known || same(n, b) ? (known ? c : n) : c === b || same(c, b) ? n : c);
  const take = (n: AppNode): AppNode | null => {
    const c = byId.get(n.id);
    const b = bs.get(n.id);
    // removed here and not yet sent: stays removed (also when another peer changed it meanwhile)
    if (!c) return b ? null : n;
    if (changed && !changed.has(n.id)) return c;
    const out: Rec = { ...c };
    const [nr, br, cr] = [n as unknown as Rec, (b ?? {}) as Rec, c as unknown as Rec];
    let diff = false;
    for (const k of NODE_KEYS) {
      const v = field(cr[k], br[k], nr[k], !!b);
      if (v !== cr[k]) {
        diff = true;
        if (v === undefined) delete out[k];
        else out[k] = v;
      }
    }
    const [nd, bd, cd] = [n.data as Rec, (b?.data ?? {}) as Rec, c.data as Rec];
    const data: Rec = { ...cd };
    let dd = false;
    for (const k of new Set([...Object.keys(nd), ...Object.keys(bd), ...(b ? [] : Object.keys(cd))])) {
      const v = field(cd[k], bd[k], nd[k], !!b);
      if (v !== cd[k]) {
        dd = true;
        if (v === undefined) delete data[k];
        else data[k] = v;
      }
    }
    if (dd) out.data = data;
    return diff || dd ? (out as unknown as AppNode) : c;
  };
  // in the document, or added here and not yet sent (not in the base); the others removed what is in the base only
  const mine = cur.filter((c) => !nx.has(c.id) && !bs.has(c.id));
  return [...next.nodes.map(take).filter((n): n is AppNode => n !== null), ...mine];
}
export function mergeEdges(cur: Edge[], next: Project, base: Project): Edge[] {
  const bs = new Set(base.edges.map((e) => e.id));
  const nx = new Set(next.edges.map((e) => e.id));
  const byId = new Map(cur.map((e) => [e.id, e]));
  const ids = new Set(next.nodes.map((n) => n.id));
  const taken = next.edges.flatMap((e) => {
    const c = byId.get(e.id);
    // removed here and not yet sent: stays removed
    if (!c) return bs.has(e.id) ? [] : [e];
    return [!edgeDiffers(c, e) ? c : e];
  });
  // added here and not yet sent (both its nodes still there)
  const mine = cur.filter((c) => !nx.has(c.id) && !bs.has(c.id) && ids.has(c.source) && ids.has(c.target));
  return [...taken, ...mine];
}

function nodeOf(id: string, m: Y.Map<unknown>): AppNode {
  const out: Rec = { id, type: m.get('type'), position: m.get('position') ?? { x: 0, y: 0 }, data: (m.get('data') as Y.Map<unknown> | undefined)?.toJSON() ?? {} };
  for (const k of ['parentId', 'width', 'height'] as const) if (m.has(k)) out[k] = m.get(k);
  return out as unknown as AppNode;
}
function edgeOf(id: string, m: Y.Map<unknown>): Edge {
  const out: Rec = { id };
  for (const k of EDGE_KEYS) if (m.has(k)) out[k] = m.get(k);
  return out as unknown as Edge;
}

// The project the document holds. `prev` and `changed` (the ids of the nodes the document changed since `prev`): the
// other nodes are taken from `prev` as they are. Always whole: no connection to a node that is not there, no frame that
// is not there (the node stays, out of it), frames before the nodes in them.
export function readProject(y: YProject, prev?: Project | null, changed?: Set<string>): Project {
  const was = new Map((prev?.nodes ?? []).map((n) => [n.id, n]));
  let nodes = ordered(y.nodes).map((id) => {
    const keep = was.get(id);
    return keep && changed && !changed.has(id) ? keep : nodeOf(id, y.nodes.get(id)!);
  });
  const ids = new Set(nodes.map((n) => n.id));
  // a frame that is gone: the node out of it
  nodes = nodes.map((n) => (n.parentId && !ids.has(n.parentId) ? (({ parentId: _p, ...rest }) => rest as AppNode)(n) : n));
  // frames before the nodes in them (React Flow draws a child after its parent)
  const placed = new Set<string>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sorted: AppNode[] = [];
  const visit = (n: AppNode, depth = 0) => {
    if (placed.has(n.id)) return;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent && depth < 64) visit(parent, depth + 1);
    if (placed.has(n.id)) return;
    placed.add(n.id);
    sorted.push(n);
  };
  nodes.forEach((n) => visit(n));
  const wasE = new Map((prev?.edges ?? []).map((e) => [e.id, e]));
  const edges = ordered(y.edges)
    .map((id) => {
      const e = edgeOf(id, y.edges.get(id)!);
      const keep = wasE.get(id);
      return keep && EDGE_KEYS.every((k) => (keep as unknown as Rec)[k] === (e as unknown as Rec)[k]) ? keep : e;
    })
    .filter((e) => ids.has(e.source) && ids.has(e.target));
  const name = y.meta.get('name');
  const id = y.meta.get('id');
  return { app: 'graph-flow', version: PROJECT_VERSION, nodes: sorted, edges, ...(typeof name === 'string' && name ? { name } : {}), ...(typeof id === 'string' && id ? { id } : {}) };
}

// A project kept in a document: the changes made here written into it (local), the changes that came into the
// document from elsewhere read back (onRemote: the project as it is now, its unchanged nodes the same objects).
export class ProjectBinding {
  readonly y: YProject;
  state: Project;
  private changed = new Set<string>();
  private others = new Set<string>();
  private listeners = new Set<(p: Project, prev: Project) => void>();
  constructor(doc: Y.Doc, start?: Project) {
    this.y = yProject(doc);
    // the nodes a transaction touched: a node added, removed or replaced (the map of nodes), or something inside one
    this.y.nodes.observeDeep((events) => {
      for (const ev of events) {
        if (ev.target === this.y.nodes) for (const k of ev.changes.keys.keys()) this.changed.add(k);
        else {
          const id = ev.path[0];
          if (typeof id === 'string') this.changed.add(id);
        }
      }
    });
    // state: always the project the document holds (its unchanged nodes kept as the same objects)
    doc.on('afterTransaction', (tr: Y.Transaction) => {
      if (!tr.changed.size) {
        this.changed.clear();
        return;
      }
      const prev = this.state;
      this.state = readProject(this.y, prev, this.changed);
      if (tr.origin !== this) for (const id of this.changed) this.others.add(id);
      this.changed.clear();
      if (tr.origin !== this) this.listeners.forEach((l) => l(this.state, prev));
    });
    this.state = readProject(this.y);
    if (start) this.local(start, null);
  }
  // the project as changed here, on `base` — the project these changes were made on (by default the document as it
  // is now; null: the project is the whole truth)
  local(p: Project, base: Project | null = this.state) {
    writeProject(this.y, p, base, this);
  }
  // the nodes changed by the others (or undone) since the last call: the ones mergeNodes compares
  takeChanged(): Set<string> {
    const out = this.others;
    this.others = new Set();
    return out;
  }
  onRemote(l: (p: Project, prev: Project) => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
}
