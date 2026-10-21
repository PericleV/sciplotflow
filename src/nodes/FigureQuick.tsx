// The quick bar over an annotation clicked on a figure (of a Plot, a Merge or a Figure Drawing), placed above it (below
// when there is no room): its changes written into the node it belongs to.
import { useNodesData, useReactFlow } from '@xyflow/react';
import { shapeSpec } from '../engine/evaluate.ts';
import { TEXT_SPEC_DEFAULTS, type ShapeSpec, type TextSpec } from '../figure/spec.ts';
import type { AnnotationItem, AppNode } from '../types.ts';
import { QuickBar } from '../ui/QuickBar.tsx';

// where: the object (its node, its id) and its box on the figure, in the figure's pixels
export type QuickAt = { node: string; item: string; x: number; y: number; w: number; h: number; big: boolean };

export function FigureQuick({ at, width, onClose }: { at: QuickAt; width: number; onClose: () => void }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const nd = useNodesData<AppNode>(at.node);
  const items = (nd?.data as { annotations?: AnnotationItem[] } | undefined)?.annotations;
  const it = items?.find((x) => x.id === at.item);
  if (!items || !it || it.type === 'colorbar') return null;
  const write = (list: AnnotationItem[]) => updateNodeData(at.node, { annotations: list });
  const patch = (p: object) => write(items.map((x) => (x.id === it.id ? ({ ...x, spec: { ...x.spec, ...p } } as AnnotationItem) : x)));
  // a drawing's objects: their order is their layer; else each has its layer z (below 0: under the data; never 0)
  const drawing = nd?.type === 'drawing';
  const z = it.spec.z ?? (it.type === 'text' ? TEXT_SPEC_DEFAULTS.z : 1);
  const step = (d: number) => {
    if (drawing) {
      const rest = items.filter((x) => x.id !== it.id);
      return write(d > 0 ? [...rest, it] : [it, ...rest]);
    }
    const n = z + d;
    patch({ z: n === 0 ? n + d : n });
  };
  // above the object and its turning handle, inside the figure; below it when it is at the top
  const top = at.y - 54 >= 0 ? at.y - 54 : at.y + at.h + 6;
  const left = Math.max(0, Math.min(at.x, width - 320));
  return (
    <QuickBar
      target={it.type === 'shape' ? { kind: 'shape', s: shapeSpec(it.spec) as ShapeSpec } : { kind: 'text', s: { ...TEXT_SPEC_DEFAULTS, ...it.spec } as TextSpec }}
      onShape={patch}
      onText={patch}
      front={() => step(1)}
      back={() => step(-1)}
      remove={() => {
        write(items.filter((x) => x.id !== it.id));
        onClose();
      }}
      style={{ left, top }}
    />
  );
}
