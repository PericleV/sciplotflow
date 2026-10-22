// Group nodes: a node holding a graph of its own. Inside, a “Group input” node gives what
// reaches the group's input ports and a “Group output” node takes what leaves by its output ports. For the evaluation
// the groups are opened in place: their nodes get ids `group/inner`, their connections are joined to the outside ones.
import type { Edge } from '@xyflow/react';
import type { AppNode, GroupData, GroupPort } from '../types.ts';
import { maxOf, minOf } from './minmax.ts';

export const GROUP_IN = 'group-in';
export const GROUP_OUT = 'group-out';

// (a Batch is a group too, but not opened in place: it runs its steps once per file, evaluate.ts)
const isGroup = (n: AppNode): n is Extract<AppNode, { type: 'subgraph' }> => n.type === 'subgraph' && !n.data.batch;

// The whole graph with every group opened in place (recursively).
export function flattenGroups(nodes: AppNode[], edges: Edge[], prefix = ''): { nodes: AppNode[]; edges: Edge[] } {
  if (!nodes.some(isGroup)) return prefix ? { nodes: nodes.map((n) => ({ ...n, id: prefix + n.id })), edges: edges.map((e) => ({ ...e, id: prefix + e.id, source: prefix + e.source, target: prefix + e.target })) } : { nodes, edges };
  const outN: AppNode[] = [];
  const outE: Edge[] = [];
  // where the edges leaving / entering a group connect inside it
  const inner = new Map<string, { nodes: AppNode[]; edges: Edge[]; data: GroupData }>();
  for (const n of nodes) {
    if (isGroup(n)) {
      const f = flattenGroups(n.data.nodes, n.data.edges, `${prefix}${n.id}/`);
      inner.set(n.id, { ...f, data: n.data });
      outN.push(...f.nodes.filter((x) => !x.id.endsWith(`/${GROUP_IN}`) && !x.id.endsWith(`/${GROUP_OUT}`)));
      outE.push(...f.edges.filter((e) => !e.source.endsWith(`/${GROUP_IN}`) && !e.target.endsWith(`/${GROUP_OUT}`)));
    } else outN.push(prefix ? { ...n, id: prefix + n.id } : n);
  }
  // what an output port of a group is, inside: [source, sourceHandle] (through nested groups)
  const resolveOut = (g: string, handle: string): [string, string | null | undefined][] => {
    const gi = inner.get(g)!;
    const gin = `${prefix}${g}/${GROUP_OUT}`;
    return gi.edges.filter((e) => e.target === gin && e.targetHandle === handle).map((e) => [e.source, e.sourceHandle]);
  };
  const resolveIn = (g: string, handle: string): [string, string | null | undefined][] => {
    const gi = inner.get(g)!;
    const gin = `${prefix}${g}/${GROUP_IN}`;
    return gi.edges.filter((e) => e.source === gin && e.sourceHandle === handle).map((e) => [e.target, e.targetHandle]);
  };
  // edges inside a group from its input node: joined later, with the outside sources
  for (const e of edges) {
    const sources: [string, string | null | undefined][] = inner.has(e.source) ? resolveOut(e.source, e.sourceHandle ?? '') : [[prefix + e.source, e.sourceHandle]];
    const targets: [string, string | null | undefined][] = inner.has(e.target) ? resolveIn(e.target, e.targetHandle ?? '') : [[prefix + e.target, e.targetHandle]];
    for (const [s, sh] of sources) for (const [t, th] of targets) outE.push({ id: `${prefix}${e.id}|${s}|${t}|${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th });
  }
  return { nodes: outN, edges: outE };
}

// ---- making a group from selected nodes, and opening it back ----
const uid = (t: string) => `${t}-${crypto.randomUUID().slice(0, 8)}`;

export function makeGroup(nodes: AppNode[], edges: Edge[], ids: string[], label: (n: AppNode, handle: string | null | undefined) => string, typeOf: (n: AppNode, handle: string | null | undefined) => string | null): { nodes: AppNode[]; edges: Edge[]; groupId: string } | null {
  const sel = new Set(nodes.filter((n) => ids.includes(n.id) && n.type !== 'frame').map((n) => n.id));
  if (!sel.size) return null;
  const members = nodes.filter((n) => sel.has(n.id));
  const minX = minOf(members.map((n) => n.position.x));
  const minY = minOf(members.map((n) => n.position.y));
  const maxX = maxOf(members.map((n) => n.position.x + (n.measured?.width ?? 300)));
  const inputs: GroupPort[] = [];
  const outputs: GroupPort[] = [];
  const innerEdges: Edge[] = edges.filter((e) => sel.has(e.source) && sel.has(e.target));
  const outerEdges: Edge[] = edges.filter((e) => !sel.has(e.source) && !sel.has(e.target));
  const gid = uid('group');
  // an input per outside source (node + port) feeding the selection
  for (const e of edges.filter((x) => !sel.has(x.source) && sel.has(x.target))) {
    const key = `${e.source}:${e.sourceHandle ?? ''}`;
    let port = inputs.find((p) => p.key === key);
    if (!port) {
      const src = nodes.find((n) => n.id === e.source);
      // named after what comes in
      port = { id: `in-${inputs.length}`, label: src ? label(src, e.sourceHandle) : 'in', key, type: (src && typeOf(src, e.sourceHandle)) || 'any' };
      inputs.push(port);
      outerEdges.push({ id: `e-${e.source}-${e.sourceHandle}-${gid}-${port.id}`, source: e.source, sourceHandle: e.sourceHandle, target: gid, targetHandle: port.id });
    }
    innerEdges.push({ id: `e-in-${port.id}-${e.target}-${e.targetHandle}`, source: GROUP_IN, sourceHandle: port.id, target: e.target, targetHandle: e.targetHandle });
  }
  // an output per inside source (node + port) feeding outside nodes
  for (const e of edges.filter((x) => sel.has(x.source) && !sel.has(x.target))) {
    const key = `${e.source}:${e.sourceHandle ?? ''}`;
    let port = outputs.find((p) => p.key === key);
    if (!port) {
      const src = nodes.find((n) => n.id === e.source)!;
      port = { id: `out-${outputs.length}`, label: label(src, e.sourceHandle), key, type: typeOf(src, e.sourceHandle) || 'any' };
      outputs.push(port);
      innerEdges.push({ id: `e-out-${e.source}-${e.sourceHandle}-${port.id}`, source: e.source, sourceHandle: e.sourceHandle, target: GROUP_OUT, targetHandle: port.id });
    }
    outerEdges.push({ id: `e-${gid}-${port.id}-${e.target}-${e.targetHandle}`, source: gid, sourceHandle: port.id, target: e.target, targetHandle: e.targetHandle });
  }
  const innerNodes: AppNode[] = [
    { id: GROUP_IN, type: 'groupin', position: { x: -400, y: 0 }, data: {} } as AppNode,
    ...members.map((n) => ({ ...n, parentId: undefined, extent: undefined, selected: false, position: { x: n.position.x - minX, y: n.position.y - minY } }) as AppNode),
    { id: GROUP_OUT, type: 'groupout', position: { x: maxX - minX + 120, y: 0 }, data: {} } as AppNode,
  ];
  const group = { id: gid, type: 'subgraph', position: { x: minX, y: minY }, selected: true, data: { name: 'Group', nodes: innerNodes, edges: innerEdges, inputs, outputs } } as AppNode;
  return { nodes: [...nodes.filter((n) => !sel.has(n.id)).map((n) => ({ ...n, selected: false }) as AppNode), group], edges: outerEdges, groupId: gid };
}

// A Batch with no steps yet (from the Nodes panel): its files in, nothing kept; the steps added inside on one file
export function emptyBatch(): GroupData {
  return {
    name: 'Batch',
    nodes: [{ id: GROUP_IN, type: 'groupin', position: { x: -400, y: 0 }, data: {} } as AppNode, { id: GROUP_OUT, type: 'groupout', position: { x: 400, y: 0 }, data: {} } as AppNode],
    edges: [],
    inputs: [{ id: 'in-0', label: 'files', type: 'dataset' }],
    outputs: [],
    batch: {},
  };
}

// The port a Group output offers to add an output: what is connected to it becomes a new output of the group
export const NEW_OUT = 'new-out';

// A group just made, as a Batch: its first input the files (inside: one file, a dataset); what it keeps, its outputs
// as they were (inside, what left the selection) or, when nothing left it, what the last nodes of its steps give
// (those whose output goes nowhere inside); outside, its own outputs (a row per file, a sheet per file, all rows), the
// connections from its old outputs dropped.
export function asBatch(nodes: AppNode[], edges: Edge[], gid: string, label: (n: AppNode, handle: string) => string, typeOf: (n: AppNode, handle: string) => string | null): { nodes: AppNode[]; edges: Edge[] } {
  const out = nodes.map((n) => {
    if (n.id !== gid || n.type !== 'subgraph') return n;
    const d = n.data;
    const inputs = d.inputs.map((p, k) => (k === 0 ? { ...p, label: 'files', type: 'dataset' } : p));
    let outputs = d.outputs;
    let inner = d.edges;
    if (!outputs.length) {
      const steps = d.nodes.filter((q) => q.type !== 'groupin' && q.type !== 'groupout');
      const ends = steps.filter((q) => !d.edges.some((e) => e.source === q.id) && typeOf(q, 'out'));
      outputs = ends.map((q, k) => ({ id: `out-${k}`, label: label(q, 'out'), type: typeOf(q, 'out') ?? 'any' }));
      inner = [...d.edges, ...ends.map((q, k) => ({ id: `e-out-${q.id}-out-out-${k}`, source: q.id, sourceHandle: 'out', target: GROUP_OUT, targetHandle: `out-${k}` }))];
    }
    return { ...n, data: { ...d, name: 'Batch', inputs, outputs, edges: inner, batch: {} } } as AppNode;
  });
  return { nodes: out, edges: edges.filter((e) => e.source !== gid) };
}

// Its nodes back in the graph (with new ids, so a template used twice does not collide), its connections joined.
export function ungroupNode(nodes: AppNode[], edges: Edge[], gid: string): { nodes: AppNode[]; edges: Edge[] } | null {
  const g = nodes.find((n) => n.id === gid);
  if (!g || g.type !== 'subgraph') return null;
  const d = g.data;
  const rename = new Map(d.nodes.filter((n) => n.type !== 'groupin' && n.type !== 'groupout').map((n) => [n.id, uid(n.type)]));
  const back = d.nodes.filter((n) => rename.has(n.id)).map((n) => ({ ...n, id: rename.get(n.id)!, position: { x: g.position.x + n.position.x, y: g.position.y + n.position.y }, selected: true }) as AppNode);
  const out: Edge[] = edges.filter((e) => e.source !== gid && e.target !== gid);
  for (const e of d.edges) if (rename.has(e.source) && rename.has(e.target)) out.push({ ...e, id: `${e.id}~`, source: rename.get(e.source)!, target: rename.get(e.target)! });
  // outside → group input → inside
  for (const e of edges.filter((x) => x.target === gid))
    for (const ie of d.edges.filter((x) => x.source === GROUP_IN && x.sourceHandle === e.targetHandle && rename.has(x.target)))
      out.push({ id: `e-${e.source}-${e.sourceHandle}-${rename.get(ie.target)}-${ie.targetHandle}`, source: e.source, sourceHandle: e.sourceHandle, target: rename.get(ie.target)!, targetHandle: ie.targetHandle });
  // inside → group output → outside
  for (const e of edges.filter((x) => x.source === gid))
    for (const ie of d.edges.filter((x) => x.target === GROUP_OUT && x.targetHandle === e.sourceHandle && rename.has(x.source)))
      out.push({ id: `e-${rename.get(ie.source)}-${ie.sourceHandle}-${e.target}-${e.targetHandle}`, source: rename.get(ie.source)!, sourceHandle: ie.sourceHandle, target: e.target, targetHandle: e.targetHandle });
  return { nodes: [...nodes.filter((n) => n.id !== gid).map((n) => ({ ...n, selected: false }) as AppNode), ...back], edges: out };
}

// The graph seen from inside groups, put back together: `stack` holds the levels above, outermost first.
export type Level = { groupId: string; nodes: AppNode[]; edges: Edge[] };
export function composeRoot(stack: Level[], nodes: AppNode[], edges: Edge[]): { nodes: AppNode[]; edges: Edge[] } {
  let cur = { nodes, edges };
  for (let i = stack.length - 1; i >= 0; i--) {
    const lv = stack[i];
    cur = { nodes: lv.nodes.map((n) => (n.id === lv.groupId && n.type === 'subgraph' ? ({ ...n, data: { ...n.data, nodes: cur.nodes, edges: cur.edges } } as AppNode) : n)), edges: lv.edges };
  }
  return cur;
}
