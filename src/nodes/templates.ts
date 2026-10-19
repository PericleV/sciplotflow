// Templates: group nodes saved under a name in this browser, offered in the Nodes panel (My templates) for any project.
import { useSyncExternalStore } from 'react';
import type { GroupData } from '../types.ts';
import { mergedNodes } from '../project.ts';

export type GroupTemplate = { id: string; name: string; data: GroupData };
const KEY = 'graph-flow:templates';
const listeners = new Set<() => void>();
let cache: GroupTemplate[] | null = null;

function load(): GroupTemplate[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as GroupTemplate[];
    // templates saved before nodes were merged into others: their insides converted as a project's are
    cache = Array.isArray(v) ? v.map((t) => (t?.data ? { ...t, data: { ...t.data, ...(mergedNodes(t.data.nodes, t.data.edges) as Pick<GroupData, 'nodes' | 'edges'>) } } : t)) : [];
  } catch {
    cache = [];
  }
  return cache;
}
function save(list: GroupTemplate[]): boolean {
  cache = list;
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const listTemplates = () => load();
export const useTemplates = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
  );
// The inside of a group, without what the browser measured or selected.
const clean = (d: GroupData): GroupData => ({
  ...d,
  nodes: d.nodes.map(({ id, type, position, data }) => ({ id, type, position, data }) as GroupData['nodes'][number]),
  edges: d.edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle })),
});
export function saveTemplate(name: string, data: GroupData): boolean {
  const list = load().filter((t) => t.name !== name);
  return save([...list, { id: `t${Date.now().toString(36)}`, name, data: structuredClone(clean({ ...data, name })) }]);
}
export const forgetTemplate = (id: string) => save(load().filter((t) => t.id !== id));
export const templateById = (id: string) => load().find((t) => t.id === id);
