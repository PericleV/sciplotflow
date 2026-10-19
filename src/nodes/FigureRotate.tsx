// Turning a 3D view with the mouse (⟲ Rotate): a drag on a 3D figure — alone or in a Merge — changes its azimuth
// (across) and its elevation (up and down; Shift: only the azimuth, Alt: only the elevation). Drawn at once on screen,
// written into its 3D plot node when the mouse is released (Ctrl+Z goes back).
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { toPt, type Figure } from '../figure/spec.ts';
import type { AppNode } from '../types.ts';
import { hitAt } from './figureRanges.ts';

export type Turn = { node: string; azim: number; elev: number; cam?: { k: number; dx: number; dy: number } };
// degrees per pixel dragged
const RATE = 0.5;

export function FigureRotateLayer({ fig, onTurn }: { fig: Figure; onTurn: (t: Turn | null) => void }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const st = useRef<{ node: string; azim: number; elev: number; cx: number; cy: number; last: Turn } | null>(null);
  const frameReq = useRef(0);
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const hit = hitAt(fig, W, H, ((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height);
    const S = hit?.ax.curves.find((c) => c.three?.node)?.three;
    if (!S?.node) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track
    }
    const t = { node: S.node, azim: S.azim, elev: S.elev };
    st.current = { ...t, cx: e.clientX, cy: e.clientY, last: t };
  };
  const move = (e: RPointerEvent) => {
    const s = st.current;
    if (!s) return;
    const dx = e.altKey ? 0 : e.clientX - s.cx;
    const dy = e.shiftKey ? 0 : e.clientY - s.cy;
    const azim = ((((s.azim - dx * RATE + 180) % 360) + 360) % 360) - 180;
    const elev = Math.max(-90, Math.min(90, s.elev + dy * RATE));
    s.last = { node: s.node, azim, elev };
    cancelAnimationFrame(frameReq.current);
    frameReq.current = requestAnimationFrame(() => onTurn(s.last));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    cancelAnimationFrame(frameReq.current);
    const { azim, elev } = s.last;
    if (azim === s.azim && elev === s.elev) return onTurn(null);
    // kept on screen until the node's new figure comes back
    onTurn(s.last);
    updateNodeData(s.node, { azim: Math.round(azim), elev: Math.round(elev) });
  };
  return (
    <div
      className="figure-zoom nodrag nowheel"
      style={{ cursor: 'grab' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      title="Drag on a 3D view to turn it: across the azimuth, up and down the elevation (Shift: only the azimuth, Alt: only the elevation). Esc: off"
    />
  );
}
