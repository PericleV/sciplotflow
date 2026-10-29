// Sheet tabs moved with the mouse: a tab dragged onto another takes its place (the others make room), marked where it
// goes while dragged.
import { useState, type DragEvent } from 'react';

export function useTabDrag(onMove: (from: number, to: number) => void) {
  const [moving, setMoving] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const end = () => {
    setMoving(null);
    setDropAt(null);
  };
  // the class it gets while another is dragged over it, and what makes it draggable
  const mark = (j: number) => (dropAt === j && moving !== null && moving !== j ? (moving < j ? ' drop-after' : ' drop-before') : '');
  const props = (j: number) => ({
    draggable: true,
    onDragStart: (ev: DragEvent) => {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(j));
      setMoving(j);
    },
    onDragOver: (ev: DragEvent) => {
      if (moving === null) return;
      ev.preventDefault();
      setDropAt(j);
    },
    onDragEnd: end,
    onDrop: (ev: DragEvent) => {
      ev.preventDefault();
      if (moving !== null && moving !== j) onMove(moving, j);
      end();
    },
  });
  return { mark, props };
}

// The shown sheet's place after the sheet at `from` moved to `to`.
export function shownAfterMove(k: number, from: number, to: number): number {
  if (k === from) return to;
  if (from < k && to >= k) return k - 1;
  if (from > k && to <= k) return k + 1;
  return k;
}
