// Zoom and pan on a 3D plot: its camera — the scene zoomed k times and moved in its frame — changed with the mouse and
// kept in the node (what is seen is what is exported; Ctrl+Z goes back). Zoom: the rectangle dragged fills the frame;
// the wheel: around the cursor; Pan: the scene dragged (shown at once, kept when let go).
import { useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { toPt, type Figure, type ThreeCam } from '../figure/spec.ts';
import type { AppNode } from '../types.ts';
import type { Turn } from './FigureRotate.tsx';
import { threeAt, type ThreeHit } from './figure3d.ts';
import type { ZoomMode } from './plotZoom.ts';

const NO_CAM: ThreeCam = { k: 1, dx: 0, dy: 0 };
const camOf = (h: ThreeHit): ThreeCam => h.S.cam ?? NO_CAM;

export function Figure3DZoomLayer({ fig, width, mode, onTurn }: { fig: Figure; width: number; height: number; mode: ZoomMode; onTurn: (t: Turn | null) => void }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width; // pt per px
  const st = useRef<{ hit: ThreeHit; x: number; y: number; last: ThreeCam } | null>(null);
  const frameReq = useRef(0);
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  if (mode === 'none') return null;
  const pt = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const tidy = (c: ThreeCam): ThreeCam | undefined => {
    const r = (v: number) => +v.toPrecision(6);
    return Math.abs(c.k - 1) < 1e-6 && Math.abs(c.dx) < 1e-6 && Math.abs(c.dy) < 1e-6 ? undefined : { k: r(c.k), dx: r(c.dx), dy: r(c.dy) };
  };
  const commit = (h: ThreeHit, c: ThreeCam) => updateNodeData(h.node, { cam: tidy(c) });
  const show = (h: ThreeHit, c: ThreeCam) => onTurn({ node: h.node, azim: h.S.azim, elev: h.S.elev, cam: c });
  // the camera zoomed f times about a place (pt): that place stays where it is
  const zoomAbout = (h: ThreeHit, c: ThreeCam, f: number, px: number, py: number): ThreeCam => {
    const fr = h.frame;
    const [cx, cy] = [fr.x + fr.w / 2 + c.dx * fr.w, fr.y + fr.h / 2 + c.dy * fr.h];
    const [nx, ny] = [px - (px - cx) * f, py - (py - cy) * f];
    return { k: Math.max(0.05, Math.min(200, c.k * f)), dx: (nx - fr.x - fr.w / 2) / fr.w, dy: (ny - fr.y - fr.h / 2) / fr.h };
  };
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = pt(e);
    const hit = threeAt(fig, W, H, x, y);
    if (!hit) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track
    }
    st.current = { hit, x, y, last: camOf(hit) };
    if (mode === 'zoom') setRect({ x0: x, y0: y, x1: x, y1: y });
  };
  const move = (e: RPointerEvent) => {
    const s = st.current;
    if (!s) return;
    const [x, y] = pt(e);
    if (mode === 'zoom') return setRect({ x0: s.x, y0: s.y, x1: x, y1: y });
    const c0 = camOf(s.hit);
    s.last = { k: c0.k, dx: c0.dx + (x - s.x) / s.hit.frame.w, dy: c0.dy + (y - s.y) / s.hit.frame.h };
    cancelAnimationFrame(frameReq.current);
    frameReq.current = requestAnimationFrame(() => show(s.hit, s.last));
  };
  const up = (e: RPointerEvent) => {
    const s = st.current;
    st.current = null;
    setRect(null);
    if (!s) return;
    cancelAnimationFrame(frameReq.current);
    if (mode === 'pan') {
      show(s.hit, s.last);
      return commit(s.hit, s.last);
    }
    const [x, y] = pt(e);
    const [rw, rh] = [Math.abs(x - s.x), Math.abs(y - s.y)];
    if (rw < 4 * k || rh < 4 * k) return;
    // the rectangle fills the frame: zoomed about its middle, then that middle moved to the frame's
    const fr = s.hit.frame;
    const f = Math.min(fr.w / rw, fr.h / rh);
    const [mx, my] = [(x + s.x) / 2, (y + s.y) / 2];
    const z = zoomAbout(s.hit, camOf(s.hit), f, mx, my);
    const c = { ...z, dx: z.dx + (fr.x + fr.w / 2 - mx) / fr.w, dy: z.dy + (fr.y + fr.h / 2 - my) / fr.h };
    show(s.hit, c);
    commit(s.hit, c);
  };
  const wheel = (e: RWheelEvent) => {
    if (!e.deltaY) return;
    const [x, y] = pt(e);
    const hit = threeAt(fig, W, H, x, y);
    if (!hit) return;
    e.stopPropagation();
    const c = zoomAbout(hit, camOf(hit), e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y);
    show(hit, c);
    commit(hit, c);
  };
  return (
    <div className="figure-zoom nodrag nowheel" style={{ cursor: mode === 'pan' ? 'grab' : 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} title={mode === 'zoom' ? 'Drag a rectangle on the 3D view: it fills the frame; the wheel zooms around the cursor' : 'Drag to move the 3D view; the wheel zooms'}>
      {rect && <div className="figure-zoom-rect" style={{ left: Math.min(rect.x0, rect.x1) / k, top: Math.min(rect.y0, rect.y1) / k, width: Math.abs(rect.x1 - rect.x0) / k, height: Math.abs(rect.y1 - rect.y0) / k }} />}
    </div>
  );
}
