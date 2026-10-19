// The live figures and pictures of a Note: the figure a node gives now, the number of a picture in its document.
import type { Node as PMNode } from '@tiptap/pm/model';
import type { useNodeResult } from '../engine/engine.ts';
import type { Figure } from '../figure/spec.ts';
import { PICTURES } from './richDoc.ts';

// the figure a node gives now (its figure output, else the one it shows)
export function figureOfResult(r: ReturnType<typeof useNodeResult>): Figure | undefined {
  const out = r?.outputs?.figure;
  return out?.t === 'figure' ? out.v : (r?.view?.figure as Figure | undefined);
}

// the number of the picture at pos: 1 + the pictures (figures and images) before it in the document
export function pictureNumber(doc: PMNode, pos: number): number {
  let k = 1;
  doc.descendants((n, p) => {
    if (p >= pos) return false;
    if (PICTURES.has(n.type.name)) k++;
    return true;
  });
  return k;
}

