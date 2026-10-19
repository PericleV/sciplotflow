// Zoom and pan on a figure (1D plot, Merge): the limits of the axes change in the Plot itself — what is seen is what
// is exported, Ctrl+Z goes back. A rectangle dragged (Zoom), the wheel around the cursor (Shift: X only, Alt: Y only),
// the view dragged (Pan); every axis of the frame under the mouse follows (Y2, Y3 … each in its own units). Rescale:
// the limits automatic again.
import { useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { toPt, type Figure } from '../figure/spec.ts';
import type { AppNode } from '../types.ts';
import { between, hitAt, withRanges, type Hit, type Ranges, figureAxesOf } from './figureRanges.ts';
import { whichOf, type ZoomMode } from './plotZoom.ts';

// The layer over a figure drawn `width` × `height` px, taking the mouse while Zoom or Pan is on.
export function FigureZoomLayer({ fig, width, height, mode, onRescale }: { fig: Figure; width: number; height: number; mode: ZoomMode; onRescale: () => void }) {
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width; // pt per px
  const st = useRef<{ hit: Hit; x: number; y: number; which: 'both' | 'x' | 'y' } | null>(null);
  const frameReq = useRef(0);
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const commit = (hit: Hit, r: Ranges) => {
    const node = hit.ax.node ?? fig.key;
    const n = node ? getNode(node) : undefined;
    const d = figureAxesOf(n);
    if (n && d) updateNodeData(n.id, { axes: withRanges(d.axes, r) });
  };
  const pt = (e: { currentTarget: EventTarget; clientX: number; clientY: number }) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * width * k) / b.width, ((e.clientY - b.top) * height * k) / b.height];
  };
  // every axis of the frame over new places of its two ends (pt)
  const spans = (hit: Hit, fx: (p: number) => number, fy: (p: number) => number, which: 'both' | 'x' | 'y'): Ranges => {
    const r: Ranges = {};
    const f = hit.frame;
    if (which !== 'y') for (const key of hit.xKeys) r[key] = between(hit.scales.get(key)!, fx(f.x), fx(f.x + f.w));
    if (which !== 'x') for (const key of hit.yKeys) r[key] = between(hit.scales.get(key)!, fy(f.y + f.h), fy(f.y));
    return r;
  };
  if (mode === 'none') return null;
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const [x, y] = pt(e);
    const hit = hitAt(fig, W, H, x, y);
    if (!hit) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track
    }
    st.current = { hit, x, y, which: whichOf(e) };
    if (mode === 'zoom') setRect({ x0: x, y0: y, x1: x, y1: y });
  };
  const move = (e: RPointerEvent) => {
    const s = st.current;
    if (!s) return;
    const [x, y] = pt(e);
    if (mode === 'zoom') return setRect({ x0: s.x, y0: s.y, x1: x, y1: y });
    // pan: the ends moved by the drag, from the scales when it started (no drift); once a frame
    cancelAnimationFrame(frameReq.current);
    frameReq.current = requestAnimationFrame(() => commit(s.hit, spans(s.hit, (p) => p - (x - s.x), (p) => p - (y - s.y), 'both')));
  };
  const up = (e: RPointerEvent) => {
    const s = st.current;
    st.current = null;
    setRect(null);
    if (!s || mode !== 'zoom') return;
    const [x, y] = pt(e);
    if (Math.abs(x - s.x) < 4 * k && Math.abs(y - s.y) < 4 * k) return;
    const r: Ranges = {};
    if (s.which !== 'y') for (const key of s.hit.xKeys) r[key] = between(s.hit.scales.get(key)!, s.x, x);
    if (s.which !== 'x') for (const key of s.hit.yKeys) r[key] = between(s.hit.scales.get(key)!, s.y, y);
    commit(s.hit, r);
  };
  const wheel = (e: RWheelEvent) => {
    if (!e.deltaY) return;
    const [x, y] = pt(e);
    const hit = hitAt(fig, W, H, x, y);
    if (!hit) return;
    const f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    commit(hit, spans(hit, (p) => x + (p - x) * f, (p) => y + (p - y) * f, whichOf(e)));
  };
  return (
    <div
      className="figure-zoom nodrag nowheel"
      tabIndex={0}
      style={{ cursor: mode === 'pan' ? 'grab' : 'crosshair' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onWheel={wheel}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          e.stopPropagation();
          onRescale();
        }
      }}
      title={mode === 'zoom' ? 'Drag a rectangle on a frame; the wheel zooms around the cursor (Shift: only X, Alt: only Y); Ctrl+A: all the data' : 'Drag to move the view; the wheel zooms; Ctrl+A: all the data'}
    >
      {rect && <div className="figure-zoom-rect" style={{ left: Math.min(rect.x0, rect.x1) / k, top: Math.min(rect.y0, rect.y1) / k, width: Math.abs(rect.x1 - rect.x0) / k, height: Math.abs(rect.y1 - rect.y0) / k }} />}
    </div>
  );
}
