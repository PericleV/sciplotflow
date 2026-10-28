// Undo / redo of the graph (nodes, connections, parameters, labels, groups). A step is recorded when the graph has been
// quiet for a moment, so a drag or a typed word is one step. The results of runs (optimizer runs, filter designs) are
// not part of the history: undo never removes them.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { AppNode } from './types.ts';
import { withoutNameIds } from './nameIds.ts';

type Snap = { nodes: AppNode[]; edges: Edge[] };
const LIMIT = 100;
const QUIET_MS = 350;

// Node data fields written by runs, kept as they are when undoing.
const PROTECTED: Partial<Record<AppNode['type'], string[]>> = {};

const omit = (d: Record<string, unknown>, keys: string[] | undefined) => {
  if (!keys) return d;
  const out = { ...d };
  for (const k of keys) delete out[k];
  return out;
};
// The text of a node's data, kept by its data object (an imported file is counted by its id, not its text): a drag or a
// change of one node does not serialize the others — nor megabytes of data — again.
const dataKeys = new WeakMap<object, string>();
const dataKey = (n: AppNode) => {
  const hit = dataKeys.get(n.data);
  if (hit !== undefined) return hit;
  const d = omit(n.data, PROTECTED[n.type]);
  // (the ids of the names a node uses are kept by themselves, src/nameIds.ts: not a step)
  const k = JSON.stringify(n.type === 'import' ? { ...d, text: undefined } : d, withoutNameIds);
  dataKeys.set(n.data, k);
  return k;
};
// What an undo step compares: no selection, sizes measured by the browser or run results.
const keyOf = (s: Snap) =>
  JSON.stringify([
    s.nodes.map((n) => [n.id, n.type, n.position, n.parentId, n.width, n.height, dataKey(n)]),
    s.edges.map((e) => [e.id, e.source, e.sourceHandle, e.target, e.targetHandle]),
  ]);

// external: while it is set (working together), undo and redo are its own (only the changes made here)
export function useHistory(nodes: AppNode[], edges: Edge[], setNodes: (f: (ns: AppNode[]) => AppNode[]) => void, setEdges: (es: Edge[]) => void, external?: { current: { undo: () => void; redo: () => void } | null }) {
  const h = useRef({ past: [] as Snap[], future: [] as Snap[], current: null as Snap | null, key: '', timer: 0 as ReturnType<typeof setTimeout> | 0 });
  const latest = useRef<Snap>({ nodes, edges });
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });
  const sync = useCallback(() => setFlags({ canUndo: h.current.past.length > 0, canRedo: h.current.future.length > 0 }), []);

  const commit = useCallback(() => {
    const s = h.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = 0;
    const snap = latest.current;
    const key = keyOf(snap);
    if (key === s.key) return;
    if (s.current) {
      s.past.push(s.current);
      if (s.past.length > LIMIT) s.past.shift();
      s.future = [];
    }
    s.current = snap;
    s.key = key;
    sync();
  }, [sync]);

  useEffect(() => {
    latest.current = { nodes, edges };
    const s = h.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(commit, QUIET_MS);
  }, [nodes, edges, commit]);

  const apply = useCallback(
    (snap: Snap) => {
      // run results stay as they are now
      setNodes((now) => {
        const byId = new Map(now.map((n) => [n.id, n]));
        return snap.nodes.map((n) => {
          const keys = PROTECTED[n.type];
          const cur = byId.get(n.id);
          const kept = keys && cur ? Object.fromEntries(keys.map((k) => [k, (cur.data as Record<string, unknown>)[k]])) : {};
          return { ...n, selected: false, data: { ...n.data, ...kept } } as AppNode;
        });
      });
      setEdges(snap.edges.map((e) => ({ ...e, selected: false })));
      h.current.current = snap;
      h.current.key = keyOf(snap);
      sync();
    },
    [setNodes, setEdges, sync],
  );

  const undo = useCallback(() => {
    if (external?.current) return external.current.undo();
    commit();
    const s = h.current;
    const prev = s.past.pop();
    if (!prev || !s.current) return;
    s.future.push(s.current);
    apply(prev);
  }, [commit, apply, external]);

  const redo = useCallback(() => {
    if (external?.current) return external.current.redo();
    commit();
    const s = h.current;
    const next = s.future.pop();
    if (!next || !s.current) return;
    s.past.push(s.current);
    apply(next);
  }, [commit, apply, external]);

  // a loaded project starts a new history
  const reset = useCallback(() => {
    const s = h.current;
    s.past = [];
    s.future = [];
    s.current = null;
    s.key = '';
    sync();
  }, [sync]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      // inside a text field the field's own undo applies
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [undo, redo]);

  return { undo, redo, reset, ...flags };
}
