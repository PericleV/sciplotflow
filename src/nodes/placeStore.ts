// Which polygon annotation has its points placed with the mouse now (set by its editor, read by the figure of the
// same node): a node id and the annotation's id, or none.
import { useSyncExternalStore } from 'react';

export type ShapePlacing = { node: string; item: string } | null;
let current: ShapePlacing = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function setShapePlacing(p: ShapePlacing) {
  current = p;
  listeners.forEach((l) => l());
}
export const useShapePlacing = () => useSyncExternalStore(subscribe, () => current);

// "x y; x y" ⇄ points
export const parsePoints = (s: string): [number, number][] =>
  s
    .split(';')
    .map((p) => p.trim().split(/[\s,]+/).map(Number))
    .filter((p) => p.length >= 2 && p.every(Number.isFinite))
    .map((p) => [p[0], p[1]]);
export const writePoints = (pts: [number, number][]) => pts.map(([x, y]) => `${+x.toPrecision(6)} ${+y.toPrecision(6)}`).join('; ');
