// The graph evaluated off the main thread (the interface never waits for a computation). It keeps the evaluation's
// cache and every node's settings: a message brings the nodes (the settings only of those changed since — a large
// imported text is sent once) and the edges; the reply gives the ids of all the results and only the results that
// changed (the others keep their objects on the main thread: figures not redrawn).
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types.ts';
import { evaluateGraph, newCache, type NodeResult } from './evaluate.ts';
import type { PyResult } from './python.ts';
import { setMathSizes, type MathSize } from '../math/sizes.ts';

export type EvalNode = { id: string; type: string; ver: number; data?: unknown };
// py: the results of Python scripts run since (by node id); math: the sizes of the formulas drawn since
export type EvalRequest = { seq: number; nodes: EvalNode[]; edges: Edge[]; py?: [string, PyResult][]; math?: [string, MathSize][] };
export type EvalReply = { seq: number; ids: string[]; changed: [string, NodeResult][] };

const cache = newCache();
const held = new Map<string, { type: string; data: unknown }>();
let sent = new Map<string, NodeResult>();

// a copy without what cannot be posted (a function): only when the posting failed
function plain(v: unknown, seen = new Map<object, unknown>()): unknown {
  if (typeof v === 'function') return undefined;
  if (!v || typeof v !== 'object' || ArrayBuffer.isView(v)) return v;
  if (seen.has(v)) return seen.get(v);
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    seen.set(v, out);
    for (const x of v) out.push(plain(x, seen));
    return out;
  }
  if (v instanceof Map) {
    const out = new Map();
    seen.set(v, out);
    for (const [k, x] of v) out.set(k, plain(x, seen));
    return out;
  }
  if (v instanceof Set) return new Set([...v].map((x) => plain(x, seen)));
  const out: Record<string, unknown> = {};
  seen.set(v, out);
  for (const [k, x] of Object.entries(v)) if (typeof x !== 'function') out[k] = plain(x, seen);
  return out;
}

self.onmessage = (e: MessageEvent<EvalRequest>) => {
  const { seq, nodes, edges, py, math } = e.data;
  for (const [id, result] of py ?? []) cache.py.set(id, { seq: (cache.py.get(id)?.seq ?? 0) + 1, result });
  if (math) setMathSizes(math);
  const ids = new Set<string>();
  const list = nodes.map((q) => {
    ids.add(q.id);
    if (q.data !== undefined) held.set(q.id, { type: q.type, data: q.data });
    const h = held.get(q.id)!;
    return { id: q.id, type: h.type, position: { x: 0, y: 0 }, data: h.data } as AppNode;
  });
  for (const id of [...held.keys()]) if (!ids.has(id)) held.delete(id);
  const results = evaluateGraph(list, edges, cache);
  const changed: [string, NodeResult][] = [];
  for (const [id, r] of results) if (sent.get(id) !== r) changed.push([id, r]);
  sent = results;
  const reply: EvalReply = { seq, ids: [...results.keys()], changed };
  try {
    self.postMessage(reply);
  } catch {
    self.postMessage({ ...reply, changed: changed.map(([id, r]) => [id, plain(r)]) });
  }
};
