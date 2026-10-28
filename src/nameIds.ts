// The ids of the columns and sheets a node names (engine/refs.ts), kept in its data (`nameIds`) as its evaluation finds
// them: once known, a column renamed, or a source of the same layout connected instead, is still found. Kept by
// themselves (not an undo step, not a change of the project).
import type { AppNode } from './types.ts';
import type { NodeResult } from './engine/evaluate.ts';
import { mergeRefs, sameRefs, type DataRefs } from './engine/refs.ts';

const idsOf = (n: AppNode) => (n.data as { nameIds?: DataRefs }).nameIds;
const withIds = (n: AppNode, nameIds: DataRefs | undefined) => ({ ...n, data: { ...n.data, nameIds } }) as AppNode;

// The nodes with what their results learned (a group's and a Batch's steps too: their results are under `group/…`);
// null when nothing changed. prefix: the level shown (`group/`, '' at the top).
export function learnNameIds(nodes: AppNode[], results: Map<string, NodeResult>, prefix = ''): AppNode[] | null {
  let changed = false;
  const out = nodes.map((n) => {
    let m = n;
    const learned = results.get(prefix + n.id)?.found?.learned;
    if (learned) {
      const next = mergeRefs(idsOf(n), learned);
      if (!sameRefs(next, idsOf(n))) m = withIds(n, next);
    }
    if (m.type === 'subgraph') {
      const inner = learnNameIds(m.data.nodes, results, `${prefix}${n.id}/`);
      if (inner) m = { ...m, data: { ...m.data, nodes: inner } } as AppNode;
    }
    if (m !== n) changed = true;
    return m;
  });
  return changed ? out : null;
}

// The ids of a node and of the nodes inside it (a group): what the evaluation is sent again for when they change.
export function nameIdsKey(n: AppNode): unknown {
  if (n.type === 'subgraph') return n.data.nodes.map(nameIdsKey);
  return idsOf(n) ?? null;
}
// Node data without the ids (what an undo step compares).
export const withoutNameIds = (k: string, v: unknown) => (k === 'nameIds' ? undefined : v);
