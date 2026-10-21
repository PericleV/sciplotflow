// The graph of Translate & resize: every curve as it comes out (in its colour), and as it came in (a thin grey line, when
// asked); the curves moved with the mouse (Move: dragged; Alt: the curve under the mouse alone, Shift: along one axis)
// or resized as with a zoom (Resize: dragged across for X, up and down for Y; the wheel: X, Shift + wheel: Y); its limits
// zoomed, panned or typed (kept with the node, so the curves can be moved past the data).
import { useEffect, useRef, useState } from 'react';
import type { TranslateCurve } from '../engine/curvemath.ts';
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import { usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';

export type GraphTool = ZoomMode | 'move' | 'resize';
// a drag of the curves: so much in the units of the data from where it started (the curve under the mouse with Alt)
export type MoveDrag = { dx: number; dy: number; curve: string | null; done: boolean };
// a resize with the mouse: the factors on X and Y from where it started (1: not changed)
export type ResizeDrag = { kx: number; ky: number; done: boolean };

const M = { l: 52, r: 10, t: 8, b: 30 };
const COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000'];
const curveColor = (k: number) => COLORS[k % COLORS.length];

// the limits of the curves (with a margin)
function rangeOf(curves: TranslateCurve[], ghost: boolean): View {
  let [a, b, c, d] = [Infinity, -Infinity, Infinity, -Infinity];
  const take = (xs: number[], ys: number[]) =>
    xs.forEach((v, i) => {
      if (!Number.isFinite(v) || !Number.isFinite(ys[i])) return;
      [a, b, c, d] = [Math.min(a, v), Math.max(b, v), Math.min(c, ys[i]), Math.max(d, ys[i])];
    });
  for (const cv of curves) {
    take(cv.x, cv.y);
    if (ghost) take(cv.ox, cv.oy);
  }
  if (!Number.isFinite(a)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
  if (a === b) [a, b] = [a - 1, b + 1];
  if (c === d) [c, d] = [c - 1, d + 1];
  const px = (b - a) * 0.03;
  const py = (d - c) * 0.07;
  return { x0: a - px, x1: b + px, y0: c - py, y1: d + py };
}

export function TranslateGraph({ curves, xName, W, H, ghost, view, onView, zoomOut, tool, onMove, onResize }: { curves: TranslateCurve[]; xName: string; W: number; H: number; ghost: boolean; view: View | null; onView: (v: View | null) => void; zoomOut: number; tool: GraphTool; onMove: (d: MoveDrag) => void; onResize: (d: ResizeDrag) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const auto = rangeOf(curves, ghost);
  const box = viewBox(view, auto);
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const zoomMode: ZoomMode = tool === 'zoom' || tool === 'pan' ? tool : 'none';
  const z = usePlotZoom(zoomMode, { l: M.l, t: M.t, w: pw, h: ph }, box, onView);
  useEffect(() => {
    if (zoomOut) onView(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOut]);
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  // a drag going on: where it started (pixels), the box then (its units stay while the curves move), the curve held
  const drag = useRef<{ px: number; py: number; box: View; curve: string | null } | null>(null);
  const [cursor, setCursor] = useState('default');
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.rect(M.l, M.t, pw, ph);
    g.clip();
    const line = (xs: number[], ys: number[]) => {
      g.beginPath();
      let on = false;
      xs.forEach((v, i) => {
        const u = ys[i];
        if (!Number.isFinite(u) || !Number.isFinite(v)) return void (on = false);
        g[on ? 'lineTo' : 'moveTo'](fx(v), fy(u));
        on = true;
      });
      g.stroke();
    };
    // the curves as they came in: a thin, light line under the others
    if (ghost) {
      g.strokeStyle = 'rgba(120, 128, 140, 0.45)';
      g.lineWidth = 1;
      for (const c2 of curves) line(c2.ox, c2.oy);
    }
    curves.forEach((c2, k) => {
      g.strokeStyle = curveColor(k);
      g.lineWidth = 1.5;
      line(c2.x, c2.y);
      // few points: each shown
      if (c2.x.length <= 80) {
        g.fillStyle = curveColor(k);
        c2.x.forEach((v, i) => {
          if (!Number.isFinite(v) || !Number.isFinite(c2.y[i])) return;
          g.beginPath();
          g.arc(fx(v), fy(c2.y[i]), 1.8, 0, 2 * Math.PI);
          g.fill();
        });
      }
    });
    g.restore();
    g.strokeStyle = '#333333';
    g.lineWidth = 1;
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = '#333333';
    g.font = '10px system-ui, sans-serif';
    const sx = niceStep(box.x1 - box.x0, Math.max(3, Math.round(pw / 80)));
    for (let v = Math.ceil(box.x0 / sx) * sx; v <= box.x1 + sx * 1e-9; v += sx) {
      g.textAlign = 'center';
      g.fillText(fmtNum(Math.abs(v) < sx * 1e-9 ? 0 : v, 4), fx(v), H - M.b + 12);
    }
    const sy = niceStep(box.y1 - box.y0, Math.max(3, Math.round(ph / 40)));
    for (let v = Math.ceil(box.y0 / sy) * sy; v <= box.y1 + sy * 1e-9; v += sy) {
      g.textAlign = 'right';
      g.fillText(fmtNum(Math.abs(v) < sy * 1e-9 ? 0 : v, 4), M.l - 4, fy(v) + 3);
    }
    g.textAlign = 'center';
    g.fillText(xName, M.l + pw / 2, H - 3);
    // the names of the curves, each in its colour (several curves)
    if (curves.length > 1) {
      g.textAlign = 'left';
      let x = M.l + 6;
      curves.forEach((c2, k) => {
        if (x > M.l + pw - 30) return;
        g.fillStyle = curveColor(k);
        g.fillText(c2.name, x, M.t + 12);
        x += g.measureText(c2.name).width + 12;
      });
    }
    if (z.rect) {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      g.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves, ghost, xName, W, H, box.x0, box.x1, box.y0, box.y1, z.rect]);
  const at = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  // the curve nearest the mouse (its drawn points, within 10 px)
  const curveAt = (px: number, py: number): string | null => {
    let best: string | null = null;
    let dist = 10;
    for (const c2 of curves)
      c2.x.forEach((v, i) => {
        const d = Math.hypot(fx(v) - px, fy(c2.y[i]) - py);
        if (d < dist) [dist, best] = [d, c2.name];
      });
    return best;
  };
  // the move or resize so far (Shift: along the axis moved most)
  const follow = (px: number, py: number, shift: boolean, done: boolean) => {
    const s = drag.current;
    if (!s) return;
    let [ddx, ddy] = [px - s.px, py - s.py];
    if (shift) {
      if (Math.abs(ddx) > Math.abs(ddy)) ddy = 0;
      else ddx = 0;
    }
    // a move to about a thousandth of the graph (no long tails of decimals); a factor to 4 digits
    const round = (v: number, span: number) => {
      const q = Math.pow(10, Math.floor(Math.log10(Math.abs(span) / 1000 || 1)));
      return +(Math.round(v / q) * q).toPrecision(12);
    };
    // the cursor of a resize: the direction resized (across: X, up and down: Y)
    if (tool === 'resize' && Math.hypot(ddx, ddy) > 3) setCursor(Math.abs(ddx) >= Math.abs(ddy) ? 'ew-resize' : 'ns-resize');
    if (tool === 'move') onMove({ dx: round((ddx / pw) * (s.box.x1 - s.box.x0), s.box.x1 - s.box.x0), dy: round((-ddy / ph) * (s.box.y1 - s.box.y0), s.box.y1 - s.box.y0), curve: s.curve, done });
    else onResize({ kx: +Math.exp(ddx / 140).toPrecision(4), ky: +Math.exp(-ddy / 140).toPrecision(4), done });
  };
  const hint =
    tool === 'move'
      ? 'Drag the curves to move them (Alt: only the curve under the mouse; Shift: along one axis)'
      : tool === 'resize'
        ? 'Drag across to resize X, up or down to resize Y (Shift: one axis); the wheel: X, Shift + wheel: Y'
        : undefined;
  return (
    <div className="reader-host nodrag nowheel" title={hint}>
      <canvas
        ref={cv}
        className="signal-graph"
        tabIndex={0}
        style={{ width: W, height: H, cursor: tool === 'move' ? (drag.current ? 'grabbing' : 'grab') : tool === 'resize' ? (drag.current && cursor.endsWith('-resize') ? cursor : 'nesw-resize') : cursor }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          try {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          } catch {
            // a pointer the browser does not know (a synthetic event): followed without capture
          }
          const [px, py] = at(e);
          if (tool === 'move' || tool === 'resize') {
            drag.current = { px, py, box, curve: tool === 'move' && e.altKey ? curveAt(px, py) : null };
            setCursor('grabbing');
            return;
          }
          z.down(px, py, e);
        }}
        onPointerMove={(e) => {
          const [px, py] = at(e);
          if (drag.current) return follow(px, py, e.shiftKey, false);
          if (z.move(px, py)) setCursor(tool === 'pan' ? 'grab' : 'crosshair');
          else setCursor(tool === 'none' ? 'default' : 'crosshair');
        }}
        onPointerUp={(e) => {
          const [px, py] = at(e);
          if (drag.current) {
            follow(px, py, e.shiftKey, true);
            drag.current = null;
            setCursor('default');
            return;
          }
          z.up(px, py);
        }}
        onWheel={(e) => {
          if (tool === 'resize') {
            if (!e.deltaY) return;
            const k = Math.pow(1.1, -Math.sign(e.deltaY));
            onResize({ kx: e.shiftKey ? 1 : k, ky: e.shiftKey ? k : 1, done: true });
            return;
          }
          z.wheel(...at(e), e.deltaY, e);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            e.stopPropagation();
            onView(null);
          }
        }}
      />
    </div>
  );
}
