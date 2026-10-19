// Points placed with the mouse on a figure (1D plot ▸ a curve ▸ Fill under ▸ to points; a polygon annotation): a click
// adds one, a point is dragged to move it, a double click removes it; in the units of the axes of that curve (or of an
// Axes chosen by its key), or in % of its frame (or of the page: on no Axes); kept sorted by X or in the order placed
// (a polygon: shown closed).
export type PlaceSpec = { curve?: string; axes?: string; coords?: 'data' | 'percent'; sorted?: boolean; closed?: boolean; points: Pt2[]; onPoints: (p: Pt2[]) => void };
import { useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { toPt, type Figure } from '../figure/spec.ts';
import { hitAt, type Hit } from './figureRanges.ts';
import type { Pt2 } from './points.ts';

export function FigurePointsLayer({ fig, width, height, curve = '', axes: axesKey, coords = 'data', sorted = true, closed = false, points, onPoints }: { fig: Figure; width: number; height: number } & PlaceSpec) {
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width; // pt per px
  const [drag, setDrag] = useState<{ j: number; p: Pt2; fresh: boolean } | null>(null);
  const dragRef = useRef(drag);
  const set = (d: typeof drag) => {
    dragRef.current = d;
    setDrag(d);
  };
  // the frame of the curve and its scales (the axes the curve is on, else the bottom / left ones)
  const ax = (axesKey !== undefined ? fig.axes.find((a) => a.key === axesKey) : undefined) ?? fig.axes.find((a) => a.curves.some((c) => c.key === curve)) ?? fig.axes[0];
  const c = ax?.curves.find((q) => q.key === curve);
  const pos = ax?.style.pos;
  // % of the frame (or of the page when the shape is on no Axes)
  const box = axesKey === '' || !pos ? { x: 0, y: 0, w: W, h: H } : { x: (pos.x / 100) * W, y: (pos.y / 100) * H, w: (pos.w / 100) * W, h: (pos.h / 100) * H };
  const hit: Hit | null = ax && pos ? hitAt(fig, W, H, ((pos.x + pos.w / 2) / 100) * W, ((pos.y + pos.h / 2) / 100) * H) : null;
  if (coords === 'data' && !hit) return null;
  const sx =
    coords === 'percent' || !hit
      ? { f: (v: number) => box.x + (v / 100) * box.w, inv: (p: number) => ((p - box.x) / box.w) * 100 }
      : hit.scales.get(c && hit.xKeys.includes(c.style.axisX) ? c.style.axisX : hit.xKeys[0])!;
  const sy =
    coords === 'percent' || !hit
      ? { f: (v: number) => box.y + (v / 100) * box.h, inv: (p: number) => ((p - box.y) / box.h) * 100 }
      : hit.scales.get(c && hit.yKeys.includes(c.style.axisY) ? c.style.axisY : hit.yKeys[0])!;
  const pt = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): Pt2 => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * width * k) / b.width, ((e.clientY - b.top) * height * k) / b.height];
  };
  const toData = ([px, py]: Pt2): Pt2 => [sx.inv(px), sy.inv(py)];
  const near = (q: Pt2) => points.findIndex(([x, y]) => Math.abs(sx.f(x) - q[0]) < 6 * k && Math.abs(sy.f(y) - q[1]) < 6 * k);
  const shown = drag ? (drag.fresh ? [...points, drag.p] : points.map((p, j) => (j === drag.j ? drag.p : p))) : points;
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track
    }
    const q = pt(e);
    const j = near(q);
    set(j >= 0 ? { j, p: points[j], fresh: false } : { j: points.length, p: toData(q), fresh: true });
  };
  const move = (e: RPointerEvent) => {
    const d = dragRef.current;
    if (d) set({ ...d, p: toData(pt(e)) });
  };
  const up = () => {
    const d = dragRef.current;
    set(null);
    if (!d) return;
    const next = d.fresh ? [...points, d.p] : points.map((p, j) => (j === d.j ? d.p : p));
    onPoints(sorted ? [...next].sort((a, b) => a[0] - b[0]) : next);
  };
  const dbl = (e: RMouseEvent) => {
    const j = near(pt(e));
    if (j >= 0) onPoints(points.filter((_, i) => i !== j));
  };
  return (
    <div className="figure-zoom nodrag nowheel" style={{ cursor: 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={dbl} title={sorted ? 'Click: a point of the fill line; drag a point to move it; double-click to remove it' : 'Click: the next point; drag a point to move it; double-click to remove it'}>
      <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        <polyline points={[...shown, ...(closed && shown.length > 2 ? [shown[0]] : [])].map(([x, y]) => `${sx.f(x) / k},${sy.f(y) / k}`).join(' ')} fill="none" stroke="#222" strokeDasharray="4 3" strokeWidth={1} />
        {shown.map(([x, y], j) => (
          <rect key={j} x={sx.f(x) / k - 4} y={sy.f(y) / k - 4} width={8} height={8} fill="#fff" stroke="#222" strokeWidth={1.4} />
        ))}
      </svg>
    </div>
  );
}
