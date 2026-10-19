// A range of x drawn on a figure with the mouse (“↔ Add a range”, as on the graph of a Fit): dragged across a frame, its
// two ends in the units of its bottom axis; then the tool turns off. Its edges are dragged later as a band's.
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { toPt, type Figure } from '../figure/spec.ts';
import { between, hitAt, type Hit } from './figureRanges.ts';

export type XRange = { lo: number; hi: number };

export function FigureRangeLayer({ fig, width, height, onAdd }: { fig: Figure; width: number; height: number; onAdd: (r: XRange) => void }) {
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width; // pt per px
  const st = useRef<{ hit: Hit; x: number } | null>(null);
  const [band, setBand] = useState<{ x0: number; x1: number; y: number; h: number } | null>(null);
  const pt = (e: { currentTarget: EventTarget; clientX: number; clientY: number }) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * width * k) / b.width, ((e.clientY - b.top) * height * k) / b.height];
  };
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
    st.current = { hit, x };
    setBand({ x0: x, x1: x, y: hit.frame.y, h: hit.frame.h });
  };
  const move = (e: RPointerEvent) => {
    const s = st.current;
    if (!s) return;
    const [x] = pt(e);
    const f = s.hit.frame;
    setBand({ x0: s.x, x1: Math.min(f.x + f.w, Math.max(f.x, x)), y: f.y, h: f.h });
  };
  const up = (e: RPointerEvent) => {
    const s = st.current;
    st.current = null;
    setBand(null);
    if (!s) return;
    const [x] = pt(e);
    if (Math.abs(x - s.x) < 3 * k) return;
    const [lo, hi] = between(s.hit.scales.get('bottom')!, s.x, x);
    onAdd({ lo: +lo.toPrecision(5), hi: +hi.toPrecision(5) });
  };
  return (
    <div className="figure-zoom nodrag nowheel" style={{ cursor: 'col-resize' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} title="Drag across the frame: a range of x (then the tool turns off; its edges can be dragged at any time)">
      {band && <div className="figure-range-band" style={{ left: Math.min(band.x0, band.x1) / k, top: band.y / k, width: Math.abs(band.x1 - band.x0) / k, height: band.h / k }} />}
    </div>
  );
}
