// The figure shown while an annotation is dragged by a handle (turned, stretched, bent): the annotations of its node
// drawn again from the node's new list, in place of the old ones, at once — the node gets the list when the mouse is let
// go (not the whole graph evaluated again at every move). A Figure Drawing's objects as the drawing draws them (faces,
// clips, components, lines stuck to shapes); a Plot's or a Merge's as theirs.
import { annotationsOf, drawingFigure } from '../engine/evaluate.ts';
import type { Annotation, Figure } from '../figure/spec.ts';
import type { AnnotationItem, AppNode, DrawingData } from '../types.ts';

// null: none of them found in the figure (then the node is updated as the mouse goes, as before)
export function liveFigure(fig: Figure, node: AppNode, after: AnnotationItem[]): Figure | null {
  const made = new Map<string, Annotation>();
  if (node.type === 'drawing') {
    for (const a of drawingFigure(node.id, { ...(node.data as DrawingData), annotations: after }).axes[0].annotations) made.set(a.key, a);
  } else for (const a of annotationsOf(after, node.id, [], [])) made.set(a.key, a);
  let hits = 0;
  const swap = (list: Annotation[]) =>
    list.map((a): Annotation => {
      const n = made.get(a.key);
      if (!n) return a;
      hits++;
      // (where it is drawn moved with the data under it, and a colour bar's curve: as they were)
      const keep = { ...(a.shift ? { shift: a.shift } : {}) };
      return n.kind === 'colorbar' && a.kind === 'colorbar' ? { ...n, ...keep, curve: a.curve } : ({ ...n, ...keep } as Annotation);
    });
  const out: Figure = { ...fig, annotations: swap(fig.annotations), axes: fig.axes.map((ax) => ({ ...ax, annotations: swap(ax.annotations) })) };
  return hits ? out : null;
}
