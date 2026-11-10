// The scales of a node's working graph, kept with the node (graphScale.ts)
import { useNodeId, useNodesData, useReactFlow } from '@xyflow/react';
import type { GraphScale } from './graphScale.ts';

// the node's scales, and setting them (an axis as the graph has it by itself: nothing kept)
export function useGraphScale(): [GraphScale, (s: GraphScale) => void] {
  const id = useNodeId();
  const node = useNodesData(id ?? '');
  const { updateNodeData } = useReactFlow();
  const sc = ((node?.data as { graphScale?: GraphScale } | undefined)?.graphScale ?? {}) as GraphScale;
  const set = (s: GraphScale) => {
    if (!id) return;
    const kept: GraphScale = { ...(s.x ? { x: s.x } : {}), ...(s.y ? { y: s.y } : {}) };
    updateNodeData(id, { graphScale: kept.x || kept.y ? kept : undefined });
  };
  return [sc, set];
}
