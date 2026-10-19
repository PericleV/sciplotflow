// Zoom and pan with the mouse on the working graphs of the nodes (Fit, Differentiate / Integrate, Data manipulation):
// a rectangle dragged (Zoom), the wheel around the cursor (Shift: X only, Alt: Y only), the view dragged (Pan). Only
// while Zoom or Pan is on; the view is the node's own (not saved), Rescale returns to all the data.
import { useRef, useState } from 'react';

export type View = { x0: number; x1: number; y0: number; y1: number };
export type ZoomMode = 'none' | 'zoom' | 'pan';
// The box shown: the view chosen, an axis not chosen (NaN, after ↺ X or ↺ Y) or no view at all as the data.
export const viewBox = (v: View | null | undefined, auto: View): View =>
  v ? { x0: Number.isFinite(v.x0) ? v.x0 : auto.x0, x1: Number.isFinite(v.x1) ? v.x1 : auto.x1, y0: Number.isFinite(v.y0) ? v.y0 : auto.y0, y1: Number.isFinite(v.y1) ? v.y1 : auto.y1 } : auto;
// ↺ X / ↺ Y: one axis as the data again (the other as it is); both: no view
export function rescaleAxis(v: View | null, which: 'x' | 'y'): View | null {
  if (!v) return null;
  const next = which === 'x' ? { ...v, x0: NaN, x1: NaN } : { ...v, y0: NaN, y1: NaN };
  return [next.x0, next.x1, next.y0, next.y1].some(Number.isFinite) ? next : null;
}
// the frame of the data in px (left, top, width, height)
export type Frame = { l: number; t: number; w: number; h: number };

// A view scaled by f around (cx, cy) in data units.
export function zoomAt(v: View, cx: number, cy: number, f: number, which: 'both' | 'x' | 'y'): View {
  const zx = which !== 'y';
  const zy = which !== 'x';
  return {
    x0: zx ? cx + (v.x0 - cx) * f : v.x0,
    x1: zx ? cx + (v.x1 - cx) * f : v.x1,
    y0: zy ? cy + (v.y0 - cy) * f : v.y0,
    y1: zy ? cy + (v.y1 - cy) * f : v.y1,
  };
}
export const whichOf = (e: { shiftKey: boolean; altKey: boolean }): 'both' | 'x' | 'y' => (e.shiftKey ? 'x' : e.altKey ? 'y' : 'both');

// The mouse on a graph whose data box is `box` in the frame `fr`: the handlers return true when they used the event (a
// zoom or pan mode is on), the rectangle being dragged is drawn by the graph.
export function usePlotZoom(mode: ZoomMode, fr: Frame, box: View, onView: (v: View | null) => void) {
  const st = useRef<{ kind: 'rect' | 'pan'; px: number; py: number; box: View; shift: 'both' | 'x' | 'y' } | null>(null);
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const toData = (px: number, py: number, b: View = box) => ({ x: b.x0 + ((px - fr.l) / fr.w) * (b.x1 - b.x0), y: b.y0 + (1 - (py - fr.t) / fr.h) * (b.y1 - b.y0) });
  const down = (px: number, py: number, e: { shiftKey: boolean; altKey: boolean }) => {
    if (mode === 'none') return false;
    st.current = { kind: mode === 'zoom' ? 'rect' : 'pan', px, py, box, shift: whichOf(e) };
    if (mode === 'zoom') setRect({ x0: px, y0: py, x1: px, y1: py });
    return true;
  };
  const move = (px: number, py: number) => {
    const s = st.current;
    if (!s) return mode !== 'none';
    if (s.kind === 'rect') setRect({ x0: s.px, y0: s.py, x1: px, y1: py });
    else {
      const dx = ((px - s.px) / fr.w) * (s.box.x1 - s.box.x0);
      const dy = ((py - s.py) / fr.h) * (s.box.y1 - s.box.y0);
      onView({ x0: s.box.x0 - dx, x1: s.box.x1 - dx, y0: s.box.y0 + dy, y1: s.box.y1 + dy });
    }
    return true;
  };
  const up = (px: number, py: number) => {
    const s = st.current;
    st.current = null;
    setRect(null);
    if (!s) return mode !== 'none';
    if (s.kind === 'rect' && (Math.abs(px - s.px) > 4 || Math.abs(py - s.py) > 4)) {
      const a = toData(Math.min(px, s.px), Math.max(py, s.py), s.box);
      const b = toData(Math.max(px, s.px), Math.min(py, s.py), s.box);
      // Shift: only X, Alt: only Y (the other kept)
      onView({ x0: s.shift === 'y' ? s.box.x0 : a.x, x1: s.shift === 'y' ? s.box.x1 : b.x, y0: s.shift === 'x' ? s.box.y0 : a.y, y1: s.shift === 'x' ? s.box.y1 : b.y });
    }
    return true;
  };
  const wheel = (px: number, py: number, deltaY: number, e: { shiftKey: boolean; altKey: boolean }) => {
    if (mode === 'none' || !deltaY) return false;
    const c = toData(px, py);
    onView(zoomAt(box, c.x, c.y, deltaY > 0 ? 1.2 : 1 / 1.2, whichOf(e)));
    return true;
  };
  return { down, move, up, wheel, rect, dragging: () => !!st.current };
}
