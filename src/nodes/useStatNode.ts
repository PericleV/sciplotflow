// A statistics node's result, the names of the columns it was given, and a setter of its settings
import { useReactFlow } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { AppNode } from '../types.ts';

export function useNode<T>(id: string) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  return { r, names: (r?.view.available ?? []).map((c) => c.name), set: (p: Partial<T>) => updateNodeData(id, p as Record<string, unknown>) };
}
