// Runs the graph evaluation when something that changes a result changes (not when a node moves or is labelled): in a
// worker (evalWorker.ts — the interface never waits), else here.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types.ts';
import { evaluateGraph, logicalData, newCache, type NodeResult } from './evaluate.ts';
import type { EvalNode, EvalReply, EvalRequest } from './evalWorker.ts';
import type { PyResult } from './python.ts';
import { requestRun } from '../python/runner.ts';
import { allMathSizes, mathSizesVersion } from '../math/sizes.ts';
import { onMathDrawn } from '../math/store.ts';

export type EngineState = { results: Map<string, NodeResult> };
export const EngineContext = createContext<EngineState>({ results: new Map() });
export const useNodeResult = (id: string) => useContext(EngineContext).results.get(id);

// The text of a node's settings, kept by its data object: React Flow keeps the same object while the node is only
// moved or selected, so a drag does not serialize every node again.
const keyCache = new WeakMap<object, string>();
const dataKey = (n: AppNode) => {
  const hit = keyCache.get(n.data);
  if (hit !== undefined) return hit;
  const k = JSON.stringify([n.type, logicalData(n)]);
  keyCache.set(n.data, k);
  return k;
};
export const logicalKey = (nodes: AppNode[], edges: Edge[]) =>
  `${nodes.map((n) => `${n.id}\t${dataKey(n)}`).join('\n')}\n--\n${edges.map((e) => `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`).join('\n')}`;

// A node's settings object numbered once: the worker is sent the settings of a node only when its number changed
const versions = new WeakMap<object, number>();
let lastVersion = 0;
const versionOf = (d: object) => {
  let v = versions.get(d);
  if (v === undefined) versions.set(d, (v = ++lastVersion));
  return v;
};

// The evaluation's client: the newest graph waits while the worker is busy (those between are skipped); without a
// worker (or when it fails) the graph is evaluated here.
function engineClient(onResults: (r: Map<string, NodeResult>) => void) {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./evalWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  const cache = newCache();
  const held = new Map<string, number>(); // node id → the version of its settings the worker holds
  let prev = new Map<string, NodeResult>();
  let busy = false;
  let waiting: { nodes: AppNode[]; edges: Edge[] } | null = null;
  let last: { nodes: AppNode[]; edges: Edge[] } | null = null;
  let seq = 0;
  // the results of Python scripts to send with the next evaluation
  let pyPending: [string, PyResult][] = [];
  // the formulas whose sizes the worker has (the figures measured with them)
  const mathSent = new Set<string>();
  let mathHere = mathSizesVersion();
  const here = (nodes: AppNode[], edges: Edge[]) => {
    mathHere = mathSizesVersion();
    last = { nodes, edges };
    for (const [id, result] of pyPending) cache.py.set(id, { seq: (cache.py.get(id)?.seq ?? 0) + 1, result });
    pyPending = [];
    onResults((prev = evaluateGraph(nodes, edges, cache)));
  };
  const fail = () => {
    worker?.terminate();
    worker = null;
    busy = false;
    if (last) here(last.nodes, last.edges);
  };
  const post = (nodes: AppNode[], edges: Edge[]) => {
    if (!worker) return here(nodes, edges);
    busy = true;
    last = { nodes, edges };
    const ids = new Set<string>();
    const list: EvalNode[] = nodes.map((n) => {
      ids.add(n.id);
      const ver = versionOf(n.data);
      const has = held.get(n.id) === ver;
      held.set(n.id, ver);
      return has ? { id: n.id, type: n.type, ver } : { id: n.id, type: n.type, ver, data: n.data };
    });
    for (const id of [...held.keys()]) if (!ids.has(id)) held.delete(id);
    const math = allMathSizes().filter(([k]) => !mathSent.has(k));
    for (const [k] of math) mathSent.add(k);
    const req: EvalRequest = { seq: ++seq, nodes: list, edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })), ...(pyPending.length ? { py: pyPending } : {}), ...(math.length ? { math } : {}) };
    pyPending = [];
    try {
      worker.postMessage(req);
    } catch {
      fail();
    }
  };
  if (worker) {
    worker.onmessage = (e: MessageEvent<EvalReply>) => {
      busy = false;
      const changed = new Map(e.data.changed);
      const next = new Map<string, NodeResult>();
      for (const id of e.data.ids) {
        const r = changed.get(id) ?? prev.get(id);
        if (r) next.set(id, r);
      }
      prev = next;
      if (waiting) {
        const w = waiting;
        waiting = null;
        post(w.nodes, w.edges);
      }
      // the newest results shown even while a newer graph is computed (a long computation shows its progress)
      onResults(next);
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
  }
  // a formula drawn: the figures that measured it laid out again with its size
  const offMath = onMathDrawn(() => {
    const l = last;
    if (!l) return;
    if (worker ? allMathSizes().length === mathSent.size : mathSizesVersion() === mathHere) return;
    if (busy) waiting = waiting ?? l;
    else post(l.nodes, l.edges);
  });
  return {
    submit(nodes: AppNode[], edges: Edge[]) {
      if (busy) waiting = { nodes, edges };
      else post(nodes, edges);
    },
    // a Python script's result: the graph evaluated again with it
    setPy(id: string, result: PyResult) {
      pyPending.push([id, result]);
      const l = last;
      if (!l) return;
      if (busy) waiting = waiting ?? l;
      else post(l.nodes, l.edges);
    },
    dispose: () => {
      offMath();
      worker?.terminate();
    },
  };
}

export function useEngine(nodes: AppNode[], edges: Edge[]): EngineState {
  const key = logicalKey(nodes, edges);
  const [state, setState] = useState<EngineState>(() => ({ results: new Map() }));
  const client = useRef<ReturnType<typeof engineClient> | null>(null);
  useEffect(() => {
    const c = engineClient((results) => setState({ results }));
    client.current = c;
    return () => c.dispose();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => client.current?.submit(nodes, edges), [key]);
  // the Python scripts that ask for a run: run (one at a time), their results back into the evaluation
  useEffect(() => {
    for (const [id, r] of state.results) {
      const job = r.view.py?.job;
      if (job) requestRun(id, job, (nid, result) => client.current?.setPy(nid, result));
    }
  }, [state]);
  return state;
}
