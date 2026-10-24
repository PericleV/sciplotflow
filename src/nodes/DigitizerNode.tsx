// Digitizer: the image of a graph, its calibration (two points on each axis; the four corners; many points for a
// curved page), the sets of points (clicked, with their error bars, or found by their colour in an area), a
// magnifier, the values under the mouse; the dataset of every set.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { autoPoints, calibrate, inPolygon, SET_COLORS, type AutoSpec, type CalMode, type DigiPoint, type DigitizerData, type GridFit, type Px } from '../engine/digitize.ts';
import { fmtNum } from '../engine/table.ts';
import { DIGITIZER_DEFAULTS } from '../defaults.ts';
import type { AppNode, DigitizerNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { ZoomTools } from './ZoomTools.tsx';
import type { ZoomMode } from './plotZoom.ts';
import { Check, Field, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { Maximize2, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { IMAGE_ACCEPT, imageUrl } from '../imageFile.ts';

type Tool = 'none' | 'points' | 'errbar' | 'pipette' | 'area' | 'lasso' | 'exclude';
// a calibration point being placed: one of the axes / corners, or a new grid point
type Placing = { kind: 'axes' | 'corners'; k: number } | { kind: 'grid' } | null;
// what the mouse holds: a calibration point, a point of the active set (or an end of its error bar), a shape drawn
type Hold = { kind: 'axes' | 'corners' | 'grid' | 'point'; k: number; end?: 'hi' | 'lo'; at: Px } | { kind: 'shape'; tool: 'area' | 'lasso' | 'exclude'; path: Px[] } | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number } | { kind: 'zoom'; a: Px; b: Px } | null;
type View = { ox: number; oy: number; s: number }; // the image pixel at the top left, screen px per image px

const AXES = ['X₁', 'X₂', 'Y₁', 'Y₂'];
const CORNERS = ['bottom left', 'bottom right', 'top right', 'top left'];
const CAL_COLOR = '#e67e00';
const NEAR = 7; // screen px
const HINT: Record<Tool, string> = {
  none: 'Drag a calibration point to move it (the arrow keys: 1 px; Shift: 0.1 px). Wheel: zoom around the mouse.',
  points: 'Click on the curve: a point of the active set; drag a point to move it, double-click to remove it.',
  errbar: 'Click above or below a point: the upper or lower end of its error bar (double-click an end: removed).',
  pipette: 'Click on the curve: its colour is the one looked for (then back to Points).',
  area: 'Drag a rectangle: the area searched (then back to Points).',
  lasso: 'Draw around the curve: the area searched (then back to Points).',
  exclude: 'Drag a rectangle over text, the legend, another curve: left out of the search (then back to Points).',
};

// an image file (or pasted) as a data URL (a TIFF as a PNG): a large photo made smaller (3000 px at most, JPEG)
async function readImage(file: Blob): Promise<{ url: string; w: number; h: number }> {
  const url = await imageUrl(file);
  const img = await loadImg(url);
  if (file.size < 1.5e6 && Math.max(img.naturalWidth, img.naturalHeight) <= 3000) return { url, w: img.naturalWidth, h: img.naturalHeight };
  const k = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  [c.width, c.height] = [Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k)];
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height };
}
const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => no(new Error('Not an image'));
    i.src = url;
  });

function Board(props: { data: DigitizerData; set: (p: Partial<DigitizerData>) => void; img: HTMLImageElement | null; width: number; height: number; tool: Tool; placing: Placing; onPlaced: () => void; zoom: ZoomMode; view: View | null; setView: (v: View | null) => void; pixels: () => ImageData | null; loupe: boolean; onToolDone: () => void }) {
  const { data: d, set, img, width: W, height: H, tool, placing } = props;
  const cv = useRef<HTMLCanvasElement>(null);
  const [hold, setHold] = useState<Hold>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<{ kind: 'axes' | 'corners' | 'grid'; k: number } | null>(null);
  const cal = useMemo(() => (d.image ? calibrate(d) : null), [d]);
  // the view: fitted to the canvas, or the one zoomed to
  const fit = useMemo<View>(() => {
    const s = d.w && d.h ? Math.min(W / d.w, H / d.h) : 1;
    return { s, ox: -(W / s - d.w) / 2, oy: -(H / s - d.h) / 2 };
  }, [d.w, d.h, W, H]);
  const v = props.view ?? fit;
  const toImg = (x: number, y: number): Px => ({ u: v.ox + x / v.s, v: v.oy + y / v.s });
  const sx = (p: Px) => (p.u - v.ox) * v.s;
  const sy = (p: Px) => (p.v - v.oy) * v.s;
  const set0 = d.sets[Math.min(d.active, d.sets.length - 1)];
  const mark = { size: d.mark?.size ?? 9, width: d.mark?.width ?? 1.5 };
  // the directions of the X and Y axes of the graph at a point, on the screen (unit vectors): where X alone and where
  // Y alone change — from the calibration, else the image's own
  const arms = (p: Px): [number, number][] => {
    if (!cal || typeof cal === 'string') return [[1, 0], [0, 1]];
    const h = 0.5;
    const [a, b, c, e] = [cal.toData({ u: p.u + h, v: p.v }), cal.toData({ u: p.u - h, v: p.v }), cal.toData({ u: p.u, v: p.v + h }), cal.toData({ u: p.u, v: p.v - h })];
    const [xu, yu, xv, yv] = [(a.x - b.x) / (2 * h), (a.y - b.y) / (2 * h), (c.x - e.x) / (2 * h), (c.y - e.y) / (2 * h)];
    const det = xu * yv - xv * yu;
    if (!Number.isFinite(det) || det === 0) return [[1, 0], [0, 1]];
    // the pixel steps for (dx, dy) = (1, 0) and (0, 1): the inverse of the map's derivative
    const unit = (u: number, v: number): [number, number] => {
      const l = Math.hypot(u, v) || 1;
      return [u / l, v / l];
    };
    return [unit(yv / det, -yu / det), unit(-xv / det, xu / det)];
  };
  // the positions while dragged
  const live = (kind: string, k: number, end?: string): Px | null => (hold && 'at' in hold && hold.kind === kind && hold.k === k && hold.end === end ? hold.at : null);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, W, H);
    if (!img) {
      g.fillStyle = '#888888';
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Open an image of a graph, paste one (Ctrl+V) or drop it here', W / 2, H / 2);
      return;
    }
    g.imageSmoothingEnabled = v.s < 3;
    g.drawImage(img, -v.ox * v.s, -v.oy * v.s, d.w * v.s, d.h * v.s);
    const cross = (p: Px, color: string, label: string, big = false) => {
      const [x, y] = [sx(p), sy(p)];
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - 9, y);
      g.lineTo(x + 9, y);
      g.moveTo(x, y - 9);
      g.lineTo(x, y + 9);
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = big ? 2 : 1.2;
      g.stroke();
      g.font = 'bold 11px system-ui, sans-serif';
      g.textAlign = 'left';
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.strokeText(label, x + 6, y - 6);
      g.fillStyle = color;
      g.fillText(label, x + 6, y - 6);
    };
    // a point: a + whose arms run along the X and Y of the graph (turned with a turned image), on a white halo
    const plus = (x: number, y: number, [a, b]: [number, number][], color: string, len: number, width: number) => {
      g.beginPath();
      for (const [dx, dy] of [a, b]) {
        g.moveTo(x - dx * len, y - dy * len);
        g.lineTo(x + dx * len, y + dy * len);
      }
      g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      g.lineWidth = width + 2;
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.stroke();
    };
    // the areas: searched (blue), left out (red)
    const poly = (p: Px[], color: string, fill: string) => {
      if (p.length < 2) return;
      g.beginPath();
      p.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](sx(q), sy(q)));
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.setLineDash([5, 3]);
      g.strokeStyle = color;
      g.lineWidth = 1.2;
      g.stroke();
      g.setLineDash([]);
    };
    if (d.auto.area.length >= 3) poly(d.auto.area, '#1f6fd6', 'rgba(31, 111, 214, 0.06)');
    for (const e of d.auto.exclude) poly(e, '#d62728', 'rgba(214, 39, 40, 0.12)');
    if (hold?.kind === 'shape') poly(hold.path, hold.tool === 'exclude' ? '#d62728' : '#1f6fd6', 'rgba(0, 0, 0, 0.04)');
    if (hold?.kind === 'zoom') {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(sx(hold.a), sx(hold.b)), Math.min(sy(hold.a), sy(hold.b)), Math.abs(sx(hold.b) - sx(hold.a)), Math.abs(sy(hold.b) - sy(hold.a)));
      g.setLineDash([]);
    }
    // the calibration
    if (d.cal === 'axes') {
      const a = d.axes.map((p, k) => live('axes', k) ?? p);
      for (const [i, j] of [
        [0, 1],
        [2, 3],
      ])
        if (a[i] && a[j]) {
          g.strokeStyle = 'rgba(230, 126, 0, 0.6)';
          g.setLineDash([6, 4]);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(sx(a[i]!), sy(a[i]!));
          g.lineTo(sx(a[j]!), sy(a[j]!));
          g.stroke();
          g.setLineDash([]);
        }
      a.forEach((p, k) => p && cross(p, CAL_COLOR, AXES[k], sel?.kind === 'axes' && sel.k === k));
    } else if (d.cal === 'corners') {
      const c = d.corners.map((p, k) => live('corners', k) ?? p);
      if (c.every(Boolean)) poly(c as Px[], CAL_COLOR, 'rgba(0, 0, 0, 0)');
      c.forEach((p, k) => p && cross(p, CAL_COLOR, ['BL', 'BR', 'TR', 'TL'][k], sel?.kind === 'corners' && sel.k === k));
    } else
      d.grid.forEach((p, k) => {
        const r = typeof cal === 'object' && cal?.resid?.[k];
        const bad = r && (Math.abs(r.dx) > 1 || Math.abs(r.dy) > 1);
        cross(live('grid', k) ?? p, bad ? '#d62728' : CAL_COLOR, String(k + 1), sel?.kind === 'grid' && sel.k === k);
      });
    // the sets: the active one larger, its error bars
    d.sets.forEach((s, j) => {
      const act = j === d.active;
      s.points.forEach((p0, i) => {
        const p = (act && live('point', i)) || p0;
        const ends = [act ? (live('point', i, 'hi') ?? p0.hi) : p0.hi, act ? (live('point', i, 'lo') ?? p0.lo) : p0.lo];
        g.strokeStyle = s.color;
        g.lineWidth = 1.2;
        for (const e of ends)
          if (e) {
            // the bar: to its end (along the Y axis of a turned image), a cap across
            const [ax, ay] = [sx(e) - sx(p), sy(e) - sy(p)];
            const l = Math.hypot(ax, ay) || 1;
            g.beginPath();
            g.moveTo(sx(p), sy(p));
            g.lineTo(sx(e), sy(e));
            g.moveTo(sx(e) - (4 * ay) / l, sy(e) + (4 * ax) / l);
            g.lineTo(sx(e) + (4 * ay) / l, sy(e) - (4 * ax) / l);
            g.stroke();
          }
        plus(sx(p), sy(p), arms(p), s.color, act ? mark.size : mark.size * 0.75, mark.width);
      });
    });
    // the magnifier beside the cursor (up and to the right; to the other side near an edge), and the values under it
    if (mouse) {
      const p = toImg(mouse.x, mouse.y);
      const m = Math.max(4, v.s * 4);
      const R = 50;
      const off = 26 + R;
      const cx = mouse.x + off + R <= W ? mouse.x + off : mouse.x - off;
      const cy = mouse.y - off - R >= 0 ? mouse.y - off : mouse.y + off;
      if (props.loupe) {
        g.save();
        g.beginPath();
        g.arc(cx, cy, R, 0, 2 * Math.PI);
        g.fillStyle = '#ffffff';
        g.fill();
        g.clip();
        g.imageSmoothingEnabled = false;
        g.drawImage(img, p.u - R / m, p.v - R / m, (2 * R) / m, (2 * R) / m, cx - R, cy - R, 2 * R, 2 * R);
        // the points placed, magnified with the image
        const lx = (q: Px) => cx + (q.u - p.u) * m;
        const ly = (q: Px) => cy + (q.v - p.v) * m;
        d.sets.forEach((s) => s.points.forEach((q) => plus(lx(q), ly(q), arms(q), s.color, mark.size * 1.6, mark.width)));
        for (const q of [...(d.cal === 'axes' ? d.axes : d.cal === 'corners' ? d.corners : d.grid)]) {
          if (!q) continue;
          g.strokeStyle = CAL_COLOR;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(lx(q) - 8, ly(q));
          g.lineTo(lx(q) + 8, ly(q));
          g.moveTo(lx(q), ly(q) - 8);
          g.lineTo(lx(q), ly(q) + 8);
          g.stroke();
        }
        g.strokeStyle = 'rgba(214, 39, 40, 0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - R, cy);
        g.lineTo(cx + R, cy);
        g.moveTo(cx, cy - R);
        g.lineTo(cx, cy + R);
        g.stroke();
        g.restore();
        g.strokeStyle = '#555555';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cx, cy, R, 0, 2 * Math.PI);
        g.stroke();
      }
      const q = cal && typeof cal !== 'string' ? cal.toData(p) : null;
      const txt = q ? `X = ${fmtNum(q.x, 5)}   Y = ${fmtNum(q.y, 5)}` : `pixel ${p.u.toFixed(1)}, ${p.v.toFixed(1)}`;
      g.font = '11px system-ui, sans-serif';
      const tw = g.measureText(txt).width;
      g.fillStyle = 'rgba(255, 255, 255, 0.9)';
      g.fillRect(4, H - 20, tw + 10, 16);
      g.fillStyle = '#222222';
      g.textAlign = 'left';
      g.fillText(txt, 9, H - 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, d, v.ox, v.oy, v.s, W, H, hold, mouse, sel, cal, props.loupe]);

  // the mouse
  const at = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const near = (p: Px | null | undefined, x: number, y: number) => !!p && Math.hypot(sx(p) - x, sy(p) - y) <= NEAR;
  const calHit = (x: number, y: number): { kind: 'axes' | 'corners' | 'grid'; k: number } | null => {
    const list = d.cal === 'axes' ? d.axes : d.cal === 'corners' ? d.corners : d.grid;
    const k = list.findIndex((p) => near(p, x, y));
    return k >= 0 ? { kind: d.cal, k } : null;
  };
  const pointHit = (x: number, y: number) => set0?.points.findIndex((p) => near(p, x, y)) ?? -1;
  const endHit = (x: number, y: number): { k: number; end: 'hi' | 'lo' } | null => {
    for (let k = 0; k < (set0?.points.length ?? 0); k++) for (const end of ['hi', 'lo'] as const) if (near(set0.points[k][end], x, y)) return { k, end };
    return null;
  };
  const setPoints = (points: DigiPoint[]) => set({ sets: d.sets.map((s, j) => (j === d.active ? { ...s, points } : s)) });
  const placeCal = (p: Px) => {
    if (!placing) return;
    if (placing.kind === 'grid') {
      // a new grid point: its values those of the last one (the next tick usually shares one of them)
      const last = d.grid[d.grid.length - 1];
      set({ grid: [...d.grid, { ...p, x: last?.x ?? NaN, y: last?.y ?? NaN }] });
      setSel({ kind: 'grid', k: d.grid.length });
    } else if (placing.kind === 'axes') {
      set({ axes: d.axes.map((q, k) => (k === placing.k ? { ...p, val: q?.val ?? NaN } : q)) });
      setSel({ kind: 'axes', k: placing.k });
    } else {
      set({ corners: d.corners.map((q, k) => (k === placing.k ? p : q)) });
      setSel({ kind: 'corners', k: placing.k });
    }
    props.onPlaced();
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    const { x, y } = at(e);
    const p = toImg(x, y);
    // the drags keep the mouse (a capture refused by the browser is not needed for a click)
    try {
      cv.current!.setPointerCapture(e.pointerId);
    } catch {
      /* a click still works */
    }
    if (e.button === 1 || props.zoom === 'pan') return setHold({ kind: 'pan', sx: x, sy: y, ox: v.ox, oy: v.oy });
    if (props.zoom === 'zoom') return setHold({ kind: 'zoom', a: p, b: p });
    if (placing) return placeCal(p);
    const c = calHit(x, y);
    if (c) {
      setSel(c);
      return setHold({ ...c, at: c.kind === 'axes' ? d.axes[c.k]! : c.kind === 'corners' ? d.corners[c.k]! : d.grid[c.k] });
    }
    if (tool === 'pipette') {
      const px = props.pixels();
      if (!px) return;
      const [u0, v0] = [Math.floor(p.u), Math.floor(p.v)];
      let [r, gg, b, n] = [0, 0, 0, 0];
      for (let dv = -1; dv <= 1; dv++)
        for (let du = -1; du <= 1; du++) {
          const [u, w] = [u0 + du, v0 + dv];
          if (u < 0 || w < 0 || u >= px.width || w >= px.height) continue;
          const o = 4 * (w * px.width + u);
          [r, gg, b, n] = [r + px.data[o], gg + px.data[o + 1], b + px.data[o + 2], n + 1];
        }
      if (n) set({ auto: { ...d.auto, color: [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] } });
      props.onToolDone();
      return;
    }
    if (tool === 'area' || tool === 'lasso' || tool === 'exclude') return setHold({ kind: 'shape', tool, path: [p] });
    if (tool === 'errbar') {
      const h = endHit(x, y);
      if (h) return setHold({ kind: 'point', k: h.k, end: h.end, at: set0.points[h.k][h.end]! });
      if (!set0?.points.length) return;
      // the nearest point across: its upper end above it, its lower end below
      const k = set0.points.reduce((b, q, i) => (Math.abs(q.u - p.u) < Math.abs(set0.points[b].u - p.u) ? i : b), 0);
      const q = set0.points[k];
      setPoints(set0.points.map((o, i) => (i === k ? { ...o, [p.v < q.v ? 'hi' : 'lo']: p } : o)));
      return;
    }
    if (tool === 'points') {
      const k = pointHit(x, y);
      if (k >= 0) return setHold({ kind: 'point', k, at: set0.points[k] });
      setPoints([...(set0?.points ?? []), p]);
    }
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = at(e);
    setMouse({ x, y });
    if (!hold) return;
    const p = toImg(x, y);
    if (hold.kind === 'pan') props.setView({ s: v.s, ox: hold.ox - (x - hold.sx) / v.s, oy: hold.oy - (y - hold.sy) / v.s });
    else if (hold.kind === 'zoom') setHold({ ...hold, b: p });
    else if (hold.kind === 'shape') setHold({ ...hold, path: hold.tool === 'lasso' ? [...hold.path, p] : [hold.path[0], p] });
    else setHold({ ...hold, at: p });
  };
  const up = () => {
    const h = hold;
    setHold(null);
    if (!h) return;
    if (h.kind === 'zoom') {
      const [a, b] = [h.a, h.b];
      const [w, hh] = [Math.abs(b.u - a.u), Math.abs(b.v - a.v)];
      if (w * v.s > 4 && hh * v.s > 4) {
        const s = Math.min(W / w, H / hh);
        props.setView({ s, ox: (a.u + b.u) / 2 - W / s / 2, oy: (a.v + b.v) / 2 - H / s / 2 });
      }
    } else if (h.kind === 'shape') {
      const pts = h.tool === 'lasso' ? h.path.filter((_, i) => i % 2 === 0 || i === h.path.length - 1) : h.path.length === 2 ? [h.path[0], { u: h.path[1].u, v: h.path[0].v }, h.path[1], { u: h.path[0].u, v: h.path[1].v }] : [];
      if (pts.length < 3) return;
      if (h.tool === 'exclude') set({ auto: { ...d.auto, exclude: [...d.auto.exclude, pts] } });
      else set({ auto: { ...d.auto, area: pts } });
      props.onToolDone();
    } else if (h.kind === 'axes') set({ axes: d.axes.map((q, k) => (k === h.k ? { ...h.at, val: q!.val } : q)) });
    else if (h.kind === 'corners') set({ corners: d.corners.map((q, k) => (k === h.k ? h.at : q)) });
    else if (h.kind === 'grid') set({ grid: d.grid.map((q, k) => (k === h.k ? { ...q, ...h.at } : q)) });
    else if (h.kind === 'point') setPoints(set0.points.map((q, k) => (k === h.k ? (h.end ? { ...q, [h.end]: h.at } : { ...q, ...h.at }) : q)));
  };
  const dbl = (e: RMouseEvent<HTMLCanvasElement>) => {
    const { x, y } = at(e);
    if (tool === 'points') {
      const k = pointHit(x, y);
      if (k >= 0) setPoints(set0.points.filter((_, i) => i !== k));
    } else if (tool === 'errbar') {
      const h = endHit(x, y);
      if (h) setPoints(set0.points.map((q, i) => (i === h.k ? { ...q, [h.end]: undefined } : q)));
    }
  };
  const wheel = (e: RWheelEvent<HTMLCanvasElement>) => {
    if (!img) return;
    const { x, y } = at(e);
    const p = toImg(x, y);
    const s = Math.min(64, Math.max(fit.s / 4, v.s * (e.deltaY > 0 ? 1 / 1.2 : 1.2)));
    props.setView({ s, ox: p.u - x / s, oy: p.v - y / s });
  };
  // the arrow keys move the calibration point chosen (1 px; Shift: 0.1 px)
  const key = (e: RKeyboardEvent) => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir || !sel) return;
    e.preventDefault();
    e.stopPropagation();
    const f = e.shiftKey ? 0.1 : 1;
    const mv = <T extends Px>(q: T): T => ({ ...q, u: q.u + dir[0] * f, v: q.v + dir[1] * f });
    if (sel.kind === 'axes') set({ axes: d.axes.map((q, k) => (k === sel.k && q ? mv(q) : q)) });
    else if (sel.kind === 'corners') set({ corners: d.corners.map((q, k) => (k === sel.k && q ? mv(q) : q)) });
    else set({ grid: d.grid.map((q, k) => (k === sel.k ? mv(q) : q)) });
  };
  const cursor = props.zoom === 'pan' || hold?.kind === 'pan' ? 'grab' : placing || props.zoom === 'zoom' || tool !== 'none' ? 'crosshair' : 'default';
  return (
    <canvas
      ref={cv}
      className="nodrag nowheel digitizer-board"
      tabIndex={0}
      style={{ width: W, height: H, cursor }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => setMouse(null)}
      onDoubleClick={dbl}
      onWheel={wheel}
      onKeyDown={key}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

export function DigitizerNodeView({ id, data }: NodeProps<DigitizerNode>) {
  const { updateNodeData, addNodes, getNode } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const d = data;
  const set = (p: Partial<DigitizerData>) => updateNodeData(id, p);
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const img = loaded && loaded.url === d.image ? loaded.img : null;
  const [tool, setTool] = useState<Tool>('points');
  const [placing, setPlacing] = useState<Placing>(null);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [big, setBig] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const pix = useRef<{ url: string; data: ImageData } | null>(null);
  useEffect(() => {
    let live = true;
    if (d.image) loadImg(d.image).then((i) => live && setLoaded({ url: d.image, img: i }), () => live && setErr('The image could not be read.'));
    return () => {
      live = false;
    };
  }, [d.image]);
  // the pixels of the image (for the pipette and the search), read once
  const pixels = () => {
    if (!img) return null;
    if (pix.current?.url === d.image) return pix.current.data;
    const c = document.createElement('canvas');
    [c.width, c.height] = [d.w, d.h];
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, d.w, d.h);
    pix.current = { url: d.image, data: g.getImageData(0, 0, d.w, d.h) };
    return pix.current.data;
  };
  const open = async (f: Blob | null | undefined, name: string) => {
    if (!f) return;
    try {
      const { url, w, h } = await readImage(f);
      setErr('');
      setView(null);
      set({ image: url, imageName: name, w, h });
    } catch {
      setErr('Not an image (PNG, JPEG, GIF, WebP, BMP, SVG).');
    }
  };
  const paste = async () => {
    try {
      for (const it of await navigator.clipboard.read()) {
        const t = it.types.find((x) => x.startsWith('image/'));
        if (t) return void open(await it.getType(t), 'pasted image');
      }
      setErr('No image on the clipboard.');
    } catch {
      setErr('The clipboard could not be read: press Ctrl+V on the node instead.');
    }
  };
  const cal = useMemo(() => (d.image ? calibrate(d) : null), [d]);
  const setAuto = (p: Partial<AutoSpec>) => set({ auto: { ...d.auto, ...p } });
  const act = Math.min(d.active, d.sets.length - 1);
  const find = () => {
    const px = pixels();
    if (!px || !d.auto.color) return;
    const found = autoPoints({ data: px.data, w: px.width, h: px.height }, d.auto);
    // the points of the active set inside the area are replaced, the others kept
    const keep = d.sets[act].points.filter((p) => d.auto.area.length >= 3 && !inPolygon(d.auto.area, p));
    set({ sets: d.sets.map((s, j) => (j === act ? { ...s, points: [...keep, ...found] } : s)) });
  };
  // a tool chosen (not switched off by a second click: Points is the tool to come back to)
  const pick = (t: Tool) => {
    setTool(t);
    setPlacing(null);
    setZoom('none');
  };
  const place = (p: Placing) => {
    // the tool stays (Points again after the calibration point is placed)
    setPlacing(placing && p && JSON.stringify(placing) === JSON.stringify(p) ? null : p);
    setZoom('none');
  };
  const copy = () => {
    const me = getNode(id);
    addNodes({ id: `digitizer-${crypto.randomUUID().slice(0, 8)}`, type: 'digitizer', position: { x: (me?.position.x ?? 0) + 60, y: (me?.position.y ?? 0) + 60 }, data: { ...DIGITIZER_DEFAULTS, image: d.image, imageName: d.imageName, w: d.w, h: d.h } } as AppNode);
  };
  const out = r?.outputs.out;
  const btn = (on: boolean) => `nodrag${on ? ' on' : ''}`;
  const board = (w: number, h: number) => <Board data={d} set={set} img={img} width={w} height={h} tool={tool} placing={placing} onPlaced={() => setPlacing(placing?.kind === 'grid' ? placing : null)} onToolDone={() => setTool('points')} zoom={zoom} view={view} setView={setView} pixels={pixels} loupe={d.loupe !== false} />;
  const tools = (
    <>
      <div className="row wrap">
        <button className={btn(tool === 'points')} title={HINT.points} onClick={() => pick('points')}>
          Points
        </button>
        <button className={btn(tool === 'errbar')} title={HINT.errbar} onClick={() => pick('errbar')}>
          Error bars
        </button>
        <button className={btn(d.loupe !== false)} title="A magnifier beside the cursor: the pixels under it, enlarged" onClick={() => set({ loupe: d.loupe === false })}>
          Magnifier
        </button>
      </div>
      <div className="row wrap">
        <ZoomTools mode={zoom} setMode={(m) => (setZoom(m), setTool(m === 'none' ? 'points' : 'none'), setPlacing(null))} onRescale={() => setView(null)} onZoomOut={() => setView(null)} zoomed={!!view} />
        <span className="grow" />
        <button className="nodrag" title="The image large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
      <div className="hint digi-hint">{placing ? (placing.kind === 'grid' ? 'Click on a tick or a crossing of the grid: a reference point (then write its X and Y); again for the next one.' : `Click on the image: ${placing.kind === 'axes' ? AXES[placing.k] : `the ${CORNERS[placing.k]} corner`}.`) : zoom !== 'none' ? 'Zoom: drag a rectangle · Pan: drag the image (also the middle button, at any time).' : HINT[tool]}</div>
    </>
  );
  return (
    <div
      className="node node-digitizer"
      onPaste={(e) => {
        const f = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
        if (f) {
          e.preventDefault();
          void open(f, 'pasted image');
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const f = e.dataTransfer.files[0];
        if (f) {
          e.preventDefault();
          void open(f, f.name);
        }
      }}
    >
      <NodeOptions>
      <div className="row">
        <button className="nodrag" onClick={() => file.current?.click()}>
          Open image
        </button>
        <button className="nodrag" title="An image from the clipboard (or Ctrl+V on the node)" onClick={() => void paste()}>
          Paste
        </button>
        <span className="muted ellipsis grow">{d.imageName || 'no image'}</span>
        {d.image && (
          <button className="nodrag" title="A new Digitizer with this image (another panel of the same figure)" onClick={copy}>
            Copy image to a new Digitizer
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void open(f, f?.name ?? 'image');
          }}
        />
      </div>
      {err && <div className="msg warn">{err}</div>}
      <details open>
        <summary>Axes</summary>
        <div className="col-form">
          <span>Calibration</span>
          <Select<CalMode>
            value={d.cal}
            options={[
              ['axes', '2 points on each axis (straight or tilted)'],
              ['corners', 'the 4 corners of the frame (perspective)'],
              ['grid', 'many points (curved page, lens)'],
            ]}
            onChange={(c) => (set({ cal: c }), setPlacing(null))}
          />
        </div>
        {d.cal === 'axes' && (
          <div className="digi-cal">
            {AXES.map((lab, k) => (
              <span key={k} className="row">
                <button className={btn(placing?.kind === 'axes' && placing.k === k)} title={`Then click on the image: ${lab}, a point of the ${k < 2 ? 'X' : 'Y'} axis whose value you know (a tick)`} onClick={() => place({ kind: 'axes', k })}>
                  {d.axes[k] ? `✓ ${lab}` : lab}
                </button>
                <NumInput className="short" value={d.axes[k]?.val ?? NaN} placeholder={k < 2 ? 'X value' : 'Y value'} onChange={(val) => set({ axes: d.axes.map((q, j) => (j === k ? { u: q?.u ?? NaN, v: q?.v ?? NaN, val } : q)) })} />
              </span>
            ))}
          </div>
        )}
        {d.cal === 'corners' && (
          <>
            <div className="digi-cal">
              {CORNERS.map((lab, k) => (
                <button key={k} className={btn(placing?.kind === 'corners' && placing.k === k)} title={`Then click on the image: the ${lab} corner of the frame`} onClick={() => place({ kind: 'corners', k })}>
                  {d.corners[k] ? `✓ ${lab}` : lab}
                </button>
              ))}
            </div>
            <div className="grid2">
              <Field label="X left – right">
                <NumInput className="short" value={d.xRange[0]} onChange={(a) => set({ xRange: [a, d.xRange[1]] })} />
                <NumInput className="short" value={d.xRange[1]} onChange={(b) => set({ xRange: [d.xRange[0], b] })} />
              </Field>
              <Field label="Y bottom – top">
                <NumInput className="short" value={d.yRange[0]} onChange={(a) => set({ yRange: [a, d.yRange[1]] })} />
                <NumInput className="short" value={d.yRange[1]} onChange={(b) => set({ yRange: [d.yRange[0], b] })} />
              </Field>
            </div>
          </>
        )}
        {d.cal === 'grid' && (
          <>
            <div className="row wrap">
              <button className={btn(placing?.kind === 'grid')} title="Then click on the image, point after point: ticks on the axes, crossings of the grid, the corners; spread over the graph" onClick={() => place({ kind: 'grid' })}>
                + Reference points
              </button>
              <Field label="Map">
                <Select<GridFit>
                  value={d.gridFit}
                  options={[
                    ['tps', 'thin-plate spline (through every point)'],
                    ['poly2', 'polynomial, degree 2'],
                    ['poly3', 'polynomial, degree 3'],
                  ]}
                  onChange={(gridFit) => set({ gridFit })}
                />
              </Field>
            </div>
            {d.grid.length > 0 && (
              <div className="digi-grid">
                <span className="muted">#</span>
                <span className="muted">X</span>
                <span className="muted">Y</span>
                <span className="muted" title="The error of the point, in % of the range (spline: the map made without it)">error %</span>
                <span />
                {d.grid.map((p, k) => {
                  const e = typeof cal === 'object' && cal?.resid?.[k];
                  const worst = e ? Math.max(Math.abs(e.dx), Math.abs(e.dy)) : NaN;
                  return (
                    <span key={k} className="digi-grid-row">
                      <b>{k + 1}</b>
                      <NumInput value={p.x} onChange={(x) => set({ grid: d.grid.map((q, j) => (j === k ? { ...q, x } : q)) })} />
                      <NumInput value={p.y} onChange={(y) => set({ grid: d.grid.map((q, j) => (j === k ? { ...q, y } : q)) })} />
                      <span className={`mono${worst > 1 ? ' bad' : ''}`}>{Number.isFinite(worst) ? worst.toFixed(2) : '—'}</span>
                      <button className="nodrag ts-btn" title="Remove this point" onClick={() => set({ grid: d.grid.filter((_, j) => j !== k) })}>
                        <X {...IC} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="row wrap">
          <Check label="Log X" value={d.logX} onChange={(logX) => set({ logX })} />
          <Check label="Log Y" value={d.logY} onChange={(logY) => set({ logY })} />
          <Field label="X title">
            <TextInput value={d.xName} placeholder="Wavelength (nm)" onChange={(xName) => set({ xName })} />
          </Field>
          <Field label="Y title">
            <TextInput value={d.yName} placeholder="Absorbance" onChange={(yName) => set({ yName })} />
          </Field>
        </div>
        {d.image && <div className={typeof cal === 'string' ? 'hint' : 'hint ok'}>{typeof cal === 'string' ? cal : cal?.note}</div>}
      </details>
      <details open>
        <summary>Sets</summary>
        <div className="digi-sets">
          {d.sets.map((s, j) => (
            <span key={j} className={`row digi-set${j === act ? ' on' : ''}`} onClick={() => j !== act && set({ active: j })}>
              <input className="nodrag" type="radio" checked={j === act} onChange={() => set({ active: j })} title="The active set: the points clicked or found go to it" />
              <input className="nodrag digi-color" type="color" value={s.color} onChange={(e) => set({ sets: d.sets.map((q, i) => (i === j ? { ...q, color: e.target.value } : q)) })} />
              <TextInput value={s.name} onChange={(name) => set({ sets: d.sets.map((q, i) => (i === j ? { ...q, name } : q)) })} />
              <span className="muted">{s.points.length} points</span>
              <button className="nodrag ts-btn" title="Remove every point of this set" disabled={!s.points.length} onClick={() => set({ sets: d.sets.map((q, i) => (i === j ? { ...q, points: [] } : q)) })}>
                Clear
              </button>
              <button className="nodrag ts-btn" title="Remove this set" disabled={d.sets.length < 2} onClick={() => set({ sets: d.sets.filter((_, i) => i !== j), active: Math.max(0, act >= j ? act - 1 : act) })}>
                <X {...IC} />
              </button>
            </span>
          ))}
        </div>
        <div className="row wrap">
          <button className="nodrag" onClick={() => set({ sets: [...d.sets, { name: `Set ${d.sets.length + 1}`, color: SET_COLORS[d.sets.length % SET_COLORS.length], points: [] }], active: d.sets.length })}>
            + Set
          </button>
          <Field label="+ length" title="The arms of the + of a point (screen px) and its line">
            <NumInput className="tiny" min={2} max={60} step={1} value={d.mark?.size ?? 9} onChange={(size) => set({ mark: { size: Math.min(60, Math.max(2, size || 9)), width: d.mark?.width ?? 1.5 } })} />
            <span>Line</span>
            <NumInput className="tiny" min={0.5} max={5} step={0.5} value={d.mark?.width ?? 1.5} onChange={(width) => set({ mark: { size: d.mark?.size ?? 9, width: Math.min(5, Math.max(0.5, width || 1.5)) } })} />
          </Field>
          <Field label="Points in the output">
            <Select<DigitizerData['order']>
              value={d.order}
              options={[
                ['x', 'in the order of X'],
                ['click', 'in the order placed'],
              ]}
              onChange={(order) => set({ order })}
            />
          </Field>
        </div>
      </details>
      <details open={!!d.auto.color}>
        <summary>Auto (by colour)</summary>
        <div className="row wrap">
          <button className={btn(tool === 'pipette')} title={HINT.pipette} onClick={() => pick('pipette')}>
            Pipette
          </button>
          <span className="digi-swatch" style={{ background: d.auto.color ? `rgb(${d.auto.color.join(',')})` : 'transparent' }} title={d.auto.color ? `rgb(${d.auto.color.join(', ')})` : 'no colour yet'} />
          <Field label="Tolerance %">
            <NumInput className="tiny" min={1} max={100} step={1} value={d.auto.tol} onChange={(tol) => setAuto({ tol: Math.min(100, Math.max(1, tol || 20)) })} />
          </Field>
          <Select<AutoSpec['mode']>
            value={d.auto.mode}
            options={[
              ['line', 'a curve (a line)'],
              ['markers', 'markers (symbols)'],
            ]}
            onChange={(mode) => setAuto({ mode })}
          />
          {d.auto.mode === 'line' ? (
            <Field label="A point every" title="Pixels of the image across">
              <NumInput className="tiny" min={1} step={1} value={d.auto.step} onChange={(step) => setAuto({ step: Math.max(1, Math.floor(step) || 1) })} />
              <span className="muted">px</span>
            </Field>
          ) : (
            <Field label="Size" title="The size of a marker, in pixels of the image (smaller or larger blobs are left out)">
              <NumInput className="tiny" min={1} step={1} value={d.auto.minSize} onChange={(minSize) => setAuto({ minSize: Math.max(1, Math.floor(minSize) || 1) })} />
              <span>–</span>
              <NumInput className="tiny" min={1} step={10} value={d.auto.maxSize} onChange={(maxSize) => setAuto({ maxSize: Math.max(1, Math.floor(maxSize) || 400) })} />
            </Field>
          )}
        </div>
        <div className="row wrap">
          <button className={btn(tool === 'area')} title={HINT.area} onClick={() => pick('area')}>
            Area
          </button>
          <button className={btn(tool === 'lasso')} title={HINT.lasso} onClick={() => pick('lasso')}>
            Lasso
          </button>
          <button className={btn(tool === 'exclude')} title={HINT.exclude} onClick={() => pick('exclude')}>
            Exclude
          </button>
          {(d.auto.area.length > 0 || d.auto.exclude.length > 0) && (
            <button className="nodrag" title="The whole image searched again" onClick={() => setAuto({ area: [], exclude: [] })}>
              Clear areas
            </button>
          )}
          <span className="grow" />
          <button className="nodrag" disabled={!d.auto.color || !img} title={`The points of that colour ${d.auto.area.length >= 3 ? 'in the area' : 'in the whole image'} into the active set (its points in the area replaced)`} onClick={find}>
            Find points
          </button>
        </div>
      </details>
      </NodeOptions>
      {tools}
      {board(520, 380)}
      <NodeOptions>
      {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={4} />}
      </NodeOptions>
      <ResultSummary result={r} />
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {board(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1500)), Math.max(360, Math.min((window.innerHeight || 800) * 0.78, 900)))}
            </div>
          </div>,
          document.body,
        )}
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" title="X, Y (and ±Y from the error bars) of every set" />
    </div>
  );
}
