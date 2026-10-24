// Phase digitizer: the image of a phase diagram, its calibration (as the Digitizer's), the frame of the diagram, the
// phase boundaries clicked as lines (caught on the frame and on each other), the regions they close (named, coloured,
// their labels moved), the lever rule at points placed on it, notes; a magnifier, the values under the mouse.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import {
  closestOnLine,
  createCalMapper,
  cornersOf,
  followFrame,
  pathOf,
  detectRegions,
  armsOf,
  evalPoints,
  pathText,
  frameOf,
  phaseFaces,
  regionFills,
  regionPhases,
  repairPhaseData,
  xAxisOf,
  snapPoint,
  type CalMapper,
  type CalMode,
  type Face,
  type GridFit,
  type LeverEvalResult,
  type PhaseCanvasNote,
  type PhaseDigitizerData,
  type PhaseLeverPoint,
  type PhaseRegion,
  type PhaseSpline,
  type Px,
} from '../engine/phasedigitize.ts';
import { parseRich, plainText } from '../figure/draw.ts';
import type { TextStyle } from '../figure/spec.ts';
import { fmtNum } from '../engine/table.ts';
import { PHASE_DIGITIZER_DEFAULTS } from '../defaults.ts';
import type { AppNode, PhaseDigitizerNode as PhaseDigitizerNodeType } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { ZoomTools } from './ZoomTools.tsx';
import type { ZoomMode } from './plotZoom.ts';
import { Check, Field, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
import { RichInput, TextStyleControls } from './fields.tsx';
import { AnnotationsEditor } from './AnnotationsEditor.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { Maximize2, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { IMAGE_ACCEPT, imageUrl } from '../imageFile.ts';

type Tool = 'none' | 'axes' | 'border' | 'spline' | 'point' | 'noteText' | 'noteArrow' | 'noteLine' | 'noteRect';
// a calibration point or a corner of the frame being placed, or a new grid point
type Placing = { kind: 'axes' | 'corners' | 'border'; k: number } | { kind: 'grid' } | null;
// what can be picked on the board (s: the line of a point; end: the end of a note)
type Item = { kind: 'axes' | 'corners' | 'grid' | 'border' | 'spline' | 'label' | 'lever' | 'note'; k: number; s?: number; end?: 'p1' | 'p2' };
// what the mouse holds: an item dragged (its place now: at), a note being drawn, the view moved or zoomed into
type Hold = (Item & { at: Px }) | { kind: 'draw'; note: 'arrow' | 'line' | 'rect'; a: Px; b: Px } | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number } | { kind: 'zoom'; a: Px; b: Px } | null;
type View = { ox: number; oy: number; s: number }; // the image pixel at the top left, screen px per image px
// the kind of the points clicked: the lever rule, a value read, a path down (cooled) or up (heated, compressed)
type NewPoint = 'lever' | 'read' | 'down' | 'up';
const NEW_POINTS: [NewPoint, string, string][] = [
  ['lever', 'Lever rule', 'The tie line to the boundaries left and right, the compositions of its ends, the amounts of the two phases (the arms a and b)'],
  ['read', 'Read', 'Only the region and the values there (a one-component P–T diagram, “which phase is there?”)'],
  ['down', 'Path ↓', 'Cooled at this X from the point: the boundaries crossed, the phases on the way, the microconstituents at an invariant line'],
  ['up', 'Path ↑', 'Heated (or compressed) at this X from the point: the boundaries crossed and the phases on the way'],
];

const AXES = ['X₁', 'X₂', 'Y₁', 'Y₂'];
const CORNER_VALUES = ['X left', 'X right', 'Y bottom', 'Y top'];
const CORNERS = ['bottom left', 'bottom right', 'top right', 'top left'];
const CAL_COLOR = '#e67e00';
const FRAME_COLOR = '#0ca678';
const LINE_COLOR = '#222222'; // the boundaries
const NEAR = 7; // screen px
const NULL4: (Px | null)[] = [null, null, null, null];
const HINT: Record<Tool, string> = {
  none: 'Select: drag a point, a name of a region or a point of a boundary (the arrow keys: 1 px; Shift: 0.1 px); double-click on a boundary: a point put there, on its point: removed; right click on a point of a boundary: a corner or smooth. Wheel: zoom.',
  axes: 'Axes: drag a calibration point (the buttons in the options place them, one after another).',
  border: 'Frame: drag its corners (the ends of the boundaries on it follow). No frame yet: click its corners in turn; bottom left, bottom right, top right, top left (Place again, in the options: anew).',
  spline: 'Draw boundary: click its points one after another; double-click (or Enter) ends it: on its first point it closes. Near a corner, a point or a line a point is caught (Alt: not); Backspace takes the last point back. Not drawing: drag a point of a boundary; right click on it: a corner or smooth.',
  point: 'Click in the diagram: a point of the kind chosen below (the lever rule, a value read, a path down or up). Drag it to move it, double-click to remove it.',
  noteText: 'Click on the diagram: a text (write it in the options).',
  noteArrow: 'Drag on the diagram: an arrow.',
  noteLine: 'Drag on the diagram: a line.',
  noteRect: 'Drag on the diagram: a box.',
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

const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(f.slice(k, k + 2), 16));
  return [r, g, b].every(Number.isFinite) ? `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})` : hex;
};

// rich text (\alpha, x^{2}, \bold{…}) on the canvas, centred at (cx, cy), on a light box when given (cx NaN: only
// measured); its size
function richText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, st: TextStyle | undefined, color: string, box?: string, edge?: string): { w: number; h: number } {
  const lines = parseRich(text);
  const size = st?.size ?? 11;
  const font = st?.font || 'system-ui, sans-serif';
  const fontOf = (r: (typeof lines)[number][number]) => `${r.italic || st?.italic ? 'italic ' : ''}${r.bold || (st?.bold ?? true) ? 'bold ' : ''}${Math.max(6, (r.size ?? size) + r.sizeDelta) * r.scale}px ${r.font || font}`;
  const widths = lines.map((l) =>
    l.reduce((w, r) => {
      g.font = fontOf(r);
      return w + g.measureText(r.t).width;
    }, 0),
  );
  const [W, lh] = [Math.max(4, ...widths), size * 1.25];
  const H = lines.length * lh;
  if (Number.isNaN(cx)) return { w: W, h: H };
  if (box) {
    g.fillStyle = box;
    g.beginPath();
    g.roundRect(cx - W / 2 - 4, cy - H / 2 - 2, W + 8, H + 4, 3);
    g.fill();
    g.strokeStyle = edge ?? 'rgba(0, 0, 0, 0.25)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  lines.forEach((l, i) => {
    let x = cx - widths[i] / 2;
    const y = cy - H / 2 + (i + 0.5) * lh;
    for (const r of l) {
      g.font = fontOf(r);
      g.fillStyle = r.color || st?.color || color;
      g.fillText(r.t, x, y + r.shift * size);
      x += g.measureText(r.t).width;
    }
  });
  return { w: W, h: H };
}

// the data with an item moved to `at` (a corner of the frame: all four written, the ends of the boundaries on it
// following)
function moved(d: PhaseDigitizerData, h: Item & { at: Px }, frame: Px[] | null): Partial<PhaseDigitizerData> {
  const at = h.at;
  switch (h.kind) {
    case 'axes':
      return { axes: d.axes.map((q, k) => (k === h.k ? { ...at, val: q?.val ?? NaN } : q)) };
    case 'corners':
      return { corners: (d.corners ?? NULL4).map((q, k) => (k === h.k ? at : q)) };
    case 'grid':
      return { grid: (d.grid ?? []).map((q, k) => (k === h.k ? { ...q, ...at } : q)) };
    case 'border': {
      const base = frame ?? d.border ?? NULL4;
      const border = [0, 1, 2, 3].map((k) => (k === h.k ? at : (base[k] ?? null)));
      return frame && border.every(Boolean) ? { border, showBorder: true, splines: followFrame(frame, border as Px[], d.splines) } : { border, showBorder: true };
    }
    case 'spline':
      return { splines: d.splines.map((s, i) => (i === h.s ? { ...s, points: s.points.map((q, k) => (k === h.k ? at : q)) } : s)) };
    case 'label':
      return { regions: d.regions.map((r, k) => (k === h.k ? { ...r, labelPt: at } : r)) };
    case 'lever':
      return { leverPoints: d.leverPoints.map((q, k) => (k === h.k ? { ...q, pt: at } : q)) };
    case 'note':
      return { notes: (d.notes ?? []).map((n, k) => (k === h.k ? { ...n, [h.end ?? 'p1']: at } : n)) };
  }
}
// where an item is now
function placeOf(d: PhaseDigitizerData, it: Item, frame: Px[] | null): Px | null {
  switch (it.kind) {
    case 'axes':
      return d.axes[it.k] ?? null;
    case 'corners':
      return d.corners?.[it.k] ?? null;
    case 'grid':
      return d.grid?.[it.k] ?? null;
    case 'border':
      return frame?.[it.k] ?? null;
    case 'spline':
      return d.splines[it.s ?? 0]?.points[it.k] ?? null;
    case 'label':
      return d.regions[it.k]?.labelPt ?? null;
    case 'lever':
      return d.leverPoints[it.k]?.pt ?? null;
    case 'note':
      return d.notes?.[it.k]?.[it.end ?? 'p1'] ?? null;
  }
}
// a boundary with a point put at k, or the point k taken out (its corners marked moving with the points)
const shift = (l: number[] | undefined, f: (k: number) => number | null) => (l ? l.map(f).filter((k): k is number => k !== null) : l);
function withPoint(s: PhaseSpline, k: number, p: Px): PhaseSpline {
  const f = (q: number) => (q >= k ? q + 1 : q);
  return { ...s, points: [...s.points.slice(0, k), p, ...s.points.slice(k)], corners: shift(s.corners, f), rounds: shift(s.rounds, f) };
}
function withoutPoint(s: PhaseSpline, k: number): PhaseSpline {
  const f = (q: number) => (q === k ? null : q > k ? q - 1 : q);
  const points = s.points.filter((_, j) => j !== k);
  return { ...s, points, corners: shift(s.corners, f), rounds: shift(s.rounds, f), ...(s.closed && points.length < 3 ? { closed: undefined } : {}) };
}
// the data with an item removed (null: it cannot be)
function removed(d: PhaseDigitizerData, it: Item): Partial<PhaseDigitizerData> | null {
  if (it.kind === 'spline') return { splines: d.splines.map((s, i) => (i === it.s ? withoutPoint(s, it.k) : s)) };
  if (it.kind === 'lever') return { leverPoints: d.leverPoints.filter((_, k) => k !== it.k) };
  if (it.kind === 'note') return { notes: (d.notes ?? []).filter((_, k) => k !== it.k) };
  if (it.kind === 'grid') return { grid: (d.grid ?? []).filter((_, k) => k !== it.k) };
  if (it.kind === 'label') return { regions: d.regions.filter((_, k) => k !== it.k) };
  return null;
}

// where a point put on a boundary goes among its points: between the two it lies between (within `near` image px of
// the line; null: not on it)
function insertOn(s: PhaseSpline, p: Px, near: number): number | null {
  const pts = s.points;
  if (pts.length < 2) return null;
  const curve = pathOf(s);
  const c = closestOnLine(p, curve);
  if (!c || c.dist > near) return null;
  // the points of the boundary are samples of its curve: the piece the nearest sample lies on
  let piece = 0;
  for (let i = 0, j = 0; i < curve.length && j < pts.length; i++)
    if (Math.abs(curve[i].u - pts[j].u) + Math.abs(curve[i].v - pts[j].v) < 1e-6) {
      if (i <= c.seg) piece = j;
      j++;
    }
  return piece + 1;
}

type BoardProps = {
  d: PhaseDigitizerData;
  set: (p: Partial<PhaseDigitizerData>) => void;
  img: HTMLImageElement | null;
  width: number;
  height: number;
  tool: Tool;
  setTool: (t: Tool) => void;
  placing: Placing;
  setPlacing: (p: Placing) => void;
  sel: Item | null;
  setSel: (s: Item | null) => void;
  zoom: ZoomMode;
  view: View | null;
  setView: (v: View | null) => void;
  mapper: CalMapper | string;
  frame: Px[] | null;
  faces: Face[];
  newPoint: NewPoint;
  drawing: number | null; // the boundary being drawn
  setDrawing: (k: number | null) => void;
};

function Board(props: BoardProps) {
  const { d, set, img, tool, placing, sel, setSel } = props;
  const cv = useRef<HTMLCanvasElement>(null);
  const [hold, setHold] = useState<Hold>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number; alt: boolean } | null>(null);
  // the canvas: the image's shape inside the room given
  const [W, H] = useMemo(() => {
    if (!d.w || !d.h) return [props.width, Math.round(props.height * 0.7)];
    const k = Math.min(props.width / d.w, props.height / d.h);
    return [Math.max(180, Math.round(d.w * k)), Math.max(130, Math.round(d.h * k))];
  }, [d.w, d.h, props.width, props.height]);
  const fit = useMemo<View>(() => {
    const s = d.w && d.h ? Math.min(W / d.w, H / d.h) : 1;
    return { s, ox: -(W / s - d.w) / 2, oy: -(H / s - d.h) / 2 };
  }, [d.w, d.h, W, H]);
  const v = props.view ?? fit;
  const toImg = (x: number, y: number): Px => ({ u: v.ox + x / v.s, v: v.oy + y / v.s });
  const sx = (p: Px) => (p.u - v.ox) * v.s;
  const sy = (p: Px) => (p.v - v.oy) * v.s;
  const splines = d.splines;
  const act = Math.max(0, Math.min(d.activeSpline || 0, splines.length - 1));
  const snapTol = (d.snapTol ?? 10) / v.s; // image px

  // the data as dragged (drawn live; written when the mouse is let go)
  const item = hold && 'at' in hold ? hold : null;
  const ld = useMemo(() => (item ? { ...d, ...moved(d, item, props.frame) } : d), [d, item, props.frame]);
  const calMoved = !!item && (item.kind === 'axes' || item.kind === 'corners' || item.kind === 'grid');
  const m = useMemo(() => (calMoved ? createCalMapper(ld) : props.mapper), [calMoved, ld, props.mapper]);
  const frame = useMemo(() => (item ? frameOf(ld, m) : props.frame), [item, ld, m, props.frame]);
  const faces = useMemo(() => (item && frame && item.kind !== 'lever' && item.kind !== 'note' && item.kind !== 'label' ? phaseFaces(frame, ld.splines) : props.faces), [item, frame, ld.splines, props.faces]);
  const evals = useMemo<LeverEvalResult[]>(() => (typeof m === 'string' ? [] : evalPoints(ld, m, frame, faces)), [m, ld, frame, faces]);
  const fills = useMemo(() => (ld.showRegions !== false ? regionFills(faces, ld.regions) : []), [faces, ld.regions, ld.showRegions]);

  // the point a click would add to the active line (caught on what is near), shown under the mouse
  const snapAt = (p: Px, alt: boolean) => (alt ? null : snapPoint(p, frame, ld.splines, act, snapTol));
  const adding = !!mouse && tool === 'spline' && !hold && !placing && props.zoom === 'none';
  const hoverSnap = useMemo(
    () => (adding && mouse ? snapAt(toImg(mouse.x, mouse.y), mouse.alt) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adding, mouse, frame, ld.splines, act, snapTol, v.ox, v.oy, v.s],
  );

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
    if (!img) return;
    // the image on white (a transparent image reads as on paper)
    g.fillStyle = '#ffffff';
    g.fillRect(-v.ox * v.s, -v.oy * v.s, d.w * v.s, d.h * v.s);
    g.imageSmoothingEnabled = v.s < 3;
    g.drawImage(img, -v.ox * v.s, -v.oy * v.s, d.w * v.s, d.h * v.s);
    const path = (pts: Px[], close = false) => {
      g.beginPath();
      pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](sx(p), sy(p)));
      if (close) g.closePath();
    };
    const dot = (p: Px, r: number, fill: string, edge = '#ffffff', w = 1.5) => {
      g.beginPath();
      g.arc(sx(p), sy(p), r, 0, 2 * Math.PI);
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = edge;
      g.lineWidth = w;
      g.stroke();
    };
    // the regions
    for (const f of fills) {
      const r = ld.regions[f.region];
      path(f.poly, true);
      g.fillStyle = rgba(r.color, r.opacity);
      g.fill();
    }
    // the frame and its corners
    if (frame && ld.showBorder !== false) {
      g.setLineDash([6, 4]);
      g.strokeStyle = FRAME_COLOR;
      g.lineWidth = tool === 'border' ? 2 : 1.4;
      path(frame, true);
      g.stroke();
      g.setLineDash([]);
      frame.forEach((p, k) => {
        const on = sel?.kind === 'border' && sel.k === k;
        g.fillStyle = '#ffffff';
        g.strokeStyle = FRAME_COLOR;
        g.lineWidth = on ? 2.5 : 1.5;
        g.fillRect(sx(p) - 4, sy(p) - 4, 8, 8);
        g.strokeRect(sx(p) - 4, sy(p) - 4, 8, 8);
        if (tool === 'border' || on) {
          g.font = 'bold 10px system-ui, sans-serif';
          g.fillStyle = FRAME_COLOR;
          g.textBaseline = 'alphabetic';
          g.fillText(['BL', 'BR', 'TR', 'TL'][k], sx(p) + 7, sy(p) - 6);
        }
      });
    }
    // the boundaries, all alike (the colours are the regions'), on a white halo; the active one thicker, its points
    // filled
    ld.splines.forEach((s, i) => {
      const on = i === act;
      const corner = cornersOf(s);
      if (s.points.length >= 2) {
        path(pathOf(s));
        g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        g.lineWidth = on ? 5 : 4;
        g.lineJoin = 'round';
        g.stroke();
        g.strokeStyle = LINE_COLOR;
        g.lineWidth = on ? 2.6 : 1.6;
        g.stroke();
      }
      s.points.forEach((p, k) => {
        const picked = sel?.kind === 'spline' && sel.s === i && sel.k === k;
        // a corner: a square
        if (on && corner[k]) {
          const r = picked ? 5 : 4;
          g.fillStyle = LINE_COLOR;
          g.fillRect(sx(p) - r, sy(p) - r, 2 * r, 2 * r);
          g.strokeStyle = '#ffffff';
          g.lineWidth = picked ? 2.5 : 1.5;
          g.strokeRect(sx(p) - r, sy(p) - r, 2 * r, 2 * r);
        } else if (on) dot(p, picked ? 5.5 : 4, LINE_COLOR, '#ffffff', picked ? 2.5 : 1.5);
        else dot(p, 2.6, '#ffffff', LINE_COLOR, 1.2);
      });
    });
    // the boundary drawn: dashed from its last point to the mouse (its first point ringed: a double-click there closes it)
    const drawn = props.drawing !== null ? ld.splines[props.drawing] : undefined;
    if (adding && mouse && drawn?.points.length) {
      const p = hoverSnap?.pt ?? toImg(mouse.x, mouse.y);
      g.setLineDash([4, 4]);
      g.strokeStyle = LINE_COLOR;
      g.lineWidth = 1.4;
      path([drawn.points[drawn.points.length - 1], p]);
      g.stroke();
      g.setLineDash([]);
      if (drawn.points.length >= 3) {
        g.strokeStyle = '#1971c2';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(sx(drawn.points[0]), sy(drawn.points[0]), NEAR, 0, 2 * Math.PI);
        g.stroke();
      }
    }
    if (hoverSnap) {
      g.strokeStyle = '#f59f00';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sx(hoverSnap.pt), sy(hoverSnap.pt), 7, 0, 2 * Math.PI);
      g.stroke();
    }
    // the regions' names
    if (ld.showRegions !== false)
      ld.regions.forEach((r, k) => {
        if (!r.name.trim()) return;
        const on = sel?.kind === 'label' && sel.k === k;
        richText(g, r.name, sx(r.labelPt), sy(r.labelPt), r.textStyle, '#111111', on ? 'rgba(255, 244, 200, 0.95)' : 'rgba(255, 255, 255, 0.82)', on ? '#f08c00' : undefined);
      });
    // the notes
    (ld.notes ?? []).forEach((n) => {
      const col = n.color || (n.kind === 'text' ? '#222222' : '#1971c2');
      if (n.kind === 'text') {
        richText(g, n.text || 'Text', sx(n.p1), sy(n.p1), { bold: false, ...n.textStyle }, col, 'rgba(255, 255, 255, 0.85)');
        return;
      }
      if (!n.p2) return;
      const [x1, y1, x2, y2] = [sx(n.p1), sy(n.p1), sx(n.p2), sy(n.p2)];
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 1.6;
      if (n.kind === 'rect') g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      else {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
        if (n.kind === 'arrow') {
          const a = Math.atan2(y2 - y1, x2 - x1);
          g.beginPath();
          g.moveTo(x2, y2);
          g.lineTo(x2 - 9 * Math.cos(a - 0.45), y2 - 9 * Math.sin(a - 0.45));
          g.lineTo(x2 - 9 * Math.cos(a + 0.45), y2 - 9 * Math.sin(a + 0.45));
          g.closePath();
          g.fill();
        }
      }
    });
    if (hold?.kind === 'draw') {
      const [x1, y1, x2, y2] = [sx(hold.a), sy(hold.a), sx(hold.b), sy(hold.b)];
      g.setLineDash([4, 3]);
      g.strokeStyle = '#1971c2';
      g.lineWidth = 1.4;
      if (hold.note === 'rect') g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      else {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.setLineDash([]);
    }
    // the calibration: a + on a white halo, its name
    const cross = (p: Px, label: string, big: boolean, color = CAL_COLOR) => {
      const [x, y] = [sx(p), sy(p)];
      g.beginPath();
      g.moveTo(x - 9, y);
      g.lineTo(x + 9, y);
      g.moveTo(x, y - 9);
      g.lineTo(x, y + 9);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = big ? 2 : 1.2;
      g.stroke();
      g.font = 'bold 11px system-ui, sans-serif';
      g.textBaseline = 'alphabetic';
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.strokeText(label, x + 6, y - 6);
      g.fillStyle = color;
      g.fillText(label, x + 6, y - 6);
    };
    const calMode = ld.cal ?? 'axes';
    if (calMode === 'axes') ld.axes.forEach((p, k) => p && Number.isFinite(p.u) && cross(p, AXES[k], sel?.kind === 'axes' && sel.k === k));
    else if (calMode === 'corners') (ld.corners ?? NULL4).forEach((p, k) => p && cross(p, ['BL', 'BR', 'TR', 'TL'][k], sel?.kind === 'corners' && sel.k === k));
    else (ld.grid ?? []).forEach((p, k) => cross(p, String(k + 1), sel?.kind === 'grid' && sel.k === k));
    // the points, over everything. The lever rule: the drops to the bottom of the frame, the arms a and b in their
    // colours, the point, its amounts; a point read: its region; a path: the arrow, the boundaries crossed (in their
    // colours, their values), the phases on the way and the microconstituents
    const tags: { x: number; y: number; text: string; color: string }[] = [];
    const yu = d.yUnit ? ` ${d.yUnit}` : '';
    // the texts kept apart: a box put at the free place nearest the one asked (first the side dir: up −1, down +1),
    // covering no other text and no point, inside the canvas; drawn after every line (over them)
    const taken = evals.map((e) => ({ x0: sx(e.pt) - 8, y0: sy(e.pt) - 8, x1: sx(e.pt) + 8, y1: sy(e.pt) + 8 }));
    // (the names of the regions too)
    if (ld.showRegions !== false)
      for (const r of ld.regions) {
        if (!r.name.trim()) continue;
        const t = richText(g, r.name, NaN, NaN, r.textStyle, '#111111');
        const [x, y] = [sx(r.labelPt), sy(r.labelPt)];
        taken.push({ x0: x - t.w / 2 - 5, y0: y - t.h / 2 - 3, x1: x + t.w / 2 + 5, y1: y + t.h / 2 + 3 });
      }
    const texts: (() => void)[] = [];
    const room = (cx: number, cy: number, w: number, h: number, dir: number) => {
      const inside = (x: number, y: number) => x - w / 2 >= 2 && x + w / 2 <= W - 2 && y - h / 2 >= 2 && y + h / 2 <= H - 2;
      const fits = (x: number, y: number) => inside(x, y) && !taken.some((b) => b.x0 < x + w / 2 && b.x1 > x - w / 2 && b.y0 < y + h / 2 && b.y1 > y - h / 2);
      const x0 = Math.min(W - w / 2 - 2, Math.max(w / 2 + 2, cx));
      const y0 = Math.min(H - h / 2 - 2, Math.max(h / 2 + 2, cy));
      const cands: [number, number][] = [];
      for (let j = -12; j <= 12; j++) for (let i = -10; i <= 10; i++) cands.push([x0 + i * 8, y0 + j * (h / 2 + 2)]);
      // the nearest first, the side asked a little nearer
      const cost = ([x, y]: [number, number]) => Math.hypot(x - x0, (y - y0) * ((y - y0) * dir < 0 ? 1.6 : 1));
      cands.sort((p, q) => cost(p) - cost(q));
      const [x, y] = cands.find(([px, py]) => fits(px, py)) ?? [x0, y0];
      taken.push({ x0: x - w / 2 - 2, y0: y - h / 2 - 1, x1: x + w / 2 + 2, y1: y + h / 2 + 1 });
      return { x, y };
    };
    const boxed = (text: string, cx: number, cy: number, st: TextStyle, color: string, edge: string, dir: number) => {
      const t = richText(g, text, NaN, NaN, st, color);
      const at = room(cx, cy, t.w + 8, t.h + 4, dir);
      texts.push(() => richText(g, text, at.x, at.y, st, color, 'rgba(255, 255, 255, 0.92)', edge));
    };
    evals.forEach((e, k) => {
      const on = sel?.kind === 'lever' && sel.k === k;
      const halo = (pts: Px[], col: string, w: number) => {
        path(pts);
        g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        g.lineWidth = w + 2.5;
        g.stroke();
        g.strokeStyle = col;
        g.lineWidth = w;
        g.stroke();
      };
      let label: string;
      if (e.kind === 'path' && e.path) {
        const p = e.path;
        halo([e.pt, p.end], e.color, 1.8);
        // the head of the arrow
        const [ex, ey, a] = [sx(p.end), sy(p.end), Math.atan2(sy(p.end) - sy(e.pt), sx(p.end) - sx(e.pt))];
        g.beginPath();
        g.moveTo(ex, ey);
        g.lineTo(ex - 10 * Math.cos(a - 0.4), ey - 10 * Math.sin(a - 0.4));
        g.lineTo(ex - 10 * Math.cos(a + 0.4), ey - 10 * Math.sin(a + 0.4));
        g.closePath();
        g.fillStyle = e.color;
        g.fill();
        for (const q of p.cross) {
          dot(q.px, 4, e.color, '#ffffff', 1.8);
          const t = `${fmtNum(q.y, 4)}${yu}`;
          const st: TextStyle = { size: 9.5, bold: true };
          boxed(t, sx(q.px) + 9 + richText(g, t, NaN, NaN, st, e.color).w / 2, sy(q.px), st, e.color, e.color, 1);
        }
        const micro = p.micro.map((mc) => (mc.before ? mc.before.map((q) => `${q.phase} ${q.frac.toFixed(1)} %`).join(' · ') : '')).filter(Boolean);
        label = [`\\bold{${e.name}}  ${pathText(p, (v) => fmtNum(v, 4))}`, ...micro].join('\n');
      } else if (e.kind === 'read') {
        label = `\\bold{${e.name}}  ${e.region || '—'}`;
      } else {
        const drops: [Px, Px, string][] = [[e.pt, e.axis0, e.color], ...(e.ends ? ([[e.ends[0].px, e.ends[0].axis, e.armA], [e.ends[1].px, e.ends[1].axis, e.armB]] as [Px, Px, string][]) : [])];
        g.setLineDash([5, 4]);
        for (const [a, b, col] of drops) halo([a, b], col, 1.2);
        g.setLineDash([]);
        for (const [, b, col] of drops) dot(b, 3, col);
        tags.push({ x: sx(e.axis0), y: sy(e.axis0), text: fmtNum(e.x0, 3), color: e.color }, ...(e.ends ?? []).map((q, j) => ({ x: sx(q.axis), y: sy(q.axis), text: fmtNum(q.x, 3), color: j ? e.armB : e.armA })));
        if (e.ends) {
          const [p1, p2] = e.ends;
          halo([p1.px, e.pt], e.armA, 2.4);
          halo([e.pt, p2.px], e.armB, 2.4);
          dot(p1.px, 4.5, e.armA, '#ffffff', 2);
          dot(p2.px, 4.5, e.armB, '#ffffff', 2);
          // the arms named over their middles
          const ar = armsOf(e)!;
          const st: TextStyle = { size: 9.5, bold: true };
          const mid = (q: Px) => ({ x: (sx(q) + sx(e.pt)) / 2, y: (sy(q) + sy(e.pt)) / 2 - 11 });
          const [m1, m2] = [mid(p1.px), mid(p2.px)];
          boxed(`a = ${fmtNum(ar.a, 3)}`, m1.x, m1.y, st, e.armA, e.armA, -1);
          boxed(`b = ${fmtNum(ar.b, 3)}`, m2.x, m2.y, st, e.armB, e.armB, -1);
        }
        label = `\\bold{${e.name}}  ${e.ends ? e.ends.map((q) => `${q.phase} ${q.frac.toFixed(1)} %`).join('  ·  ') : `${e.region || 'one phase'} 100 %`}`;
      }
      // the point: a diamond
      const [x, y] = [sx(e.pt), sy(e.pt)];
      const r = on ? 7.5 : 6;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r, y);
      g.closePath();
      g.fillStyle = e.color;
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = on ? 2.5 : 1.8;
      g.stroke();
      // its text above it (below it: a lever, its arms named above; a path going up), kept in the canvas
      const st: TextStyle = { size: 10.5, bold: false };
      const tw = richText(g, label, NaN, NaN, st, '#111111');
      const below = (e.kind === 'path' && e.path && e.path.end.v < e.pt.v) || !!e.ends;
      boxed(label, x, below ? y + 12 + tw.h / 2 : y - 12 - tw.h / 2, st, '#111111', e.color, below ? 1 : -1);
    });
    // the compositions under the tie lines, just above the bottom of the frame (kept apart from the other texts)
    g.font = 'bold 9.5px system-ui, sans-serif';
    for (const t of tags.sort((a, b) => a.x - b.x)) {
      const at = room(t.x, t.y - 11, g.measureText(t.text).width + 6, 13, -1);
      texts.push(() => {
        g.font = 'bold 9.5px system-ui, sans-serif';
        const w = g.measureText(t.text).width + 6;
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillStyle = 'rgba(255, 255, 255, 0.92)';
        g.fillRect(at.x - w / 2, at.y - 6.5, w, 13);
        g.strokeStyle = t.color;
        g.lineWidth = 0.8;
        g.strokeRect(at.x - w / 2, at.y - 6.5, w, 13);
        g.fillStyle = t.color;
        g.fillText(t.text, at.x - w / 2 + 3, at.y + 0.5);
      });
    }
    for (const draw of texts) draw();
    if (hold?.kind === 'zoom') {
      g.strokeStyle = '#1f6fd6';
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(sx(hold.a), sx(hold.b)), Math.min(sy(hold.a), sy(hold.b)), Math.abs(sx(hold.b) - sx(hold.a)), Math.abs(sy(hold.b) - sy(hold.a)));
      g.setLineDash([]);
    }
    // the calibration not done yet: what is missing, on the board (the points wait for it)
    if (typeof m === 'string') {
      const words = m.split(' ');
      const rows: string[] = [''];
      for (const w of words) {
        if ((rows[rows.length - 1] + ' ' + w).length > Math.max(30, W / 7)) rows.push('');
        rows[rows.length - 1] = `${rows[rows.length - 1]} ${w}`.trim();
      }
      const t = rows.join('\n').replace(/[\\{}^_$]/g, (c) => `\\${c}`);
      const sz = richText(g, t, NaN, NaN, { size: 11, bold: false }, '#7a4b00');
      richText(g, t, W / 2, 8 + sz.h / 2, { size: 11, bold: false }, '#7a4b00', 'rgba(255, 244, 214, 0.96)', '#e67e00');
    }
    // the magnifier beside the cursor (up and to the right; to the other side near an edge), and the values under it
    if (mouse) {
      const p = toImg(mouse.x, mouse.y);
      const z = Math.max(4, v.s * 4);
      const R = 50;
      const off = 26 + R;
      const cx = mouse.x + off + R <= W ? mouse.x + off : mouse.x - off;
      const cy = mouse.y - off - R >= 0 ? mouse.y - off : mouse.y + off;
      if (ld.loupe !== false) {
        g.save();
        g.beginPath();
        g.arc(cx, cy, R, 0, 2 * Math.PI);
        g.fillStyle = '#ffffff';
        g.fill();
        g.clip();
        g.imageSmoothingEnabled = false;
        g.drawImage(img, p.u - R / z, p.v - R / z, (2 * R) / z, (2 * R) / z, cx - R, cy - R, 2 * R, 2 * R);
        // the lines and the points placed, magnified with the image
        const lx = (q: Px) => cx + (q.u - p.u) * z;
        const ly = (q: Px) => cy + (q.v - p.v) * z;
        ld.splines.forEach((s) => {
          if (s.points.length >= 2) {
            g.beginPath();
            pathOf(s).forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](lx(q), ly(q)));
            g.strokeStyle = 'rgba(34, 34, 34, 0.6)';
            g.lineWidth = 1.5;
            g.stroke();
          }
          s.points.forEach((q) => {
            g.beginPath();
            g.arc(lx(q), ly(q), 3, 0, 2 * Math.PI);
            g.strokeStyle = LINE_COLOR;
            g.stroke();
          });
        });
        if (hoverSnap) {
          g.beginPath();
          g.arc(lx(hoverSnap.pt), ly(hoverSnap.pt), 6, 0, 2 * Math.PI);
          g.strokeStyle = '#f59f00';
          g.lineWidth = 2;
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
      const q = typeof m === 'string' ? null : m.toData(hoverSnap?.pt ?? p);
      const xa = xAxisOf(d);
      const txt = q ? `${xa.name} = ${fmtNum(q.x, 4)}${xa.unit ? ` ${xa.unit}` : ''}   ${d.yName || 'T'} = ${fmtNum(q.y, 5)}${d.yUnit ? ` ${d.yUnit}` : ''}` : `pixel ${p.u.toFixed(1)}, ${p.v.toFixed(1)}`;
      g.font = '11px system-ui, sans-serif';
      g.textBaseline = 'alphabetic';
      const tw = g.measureText(txt).width;
      g.fillStyle = 'rgba(255, 255, 255, 0.9)';
      g.fillRect(4, H - 20, tw + 10, 16);
      g.fillStyle = '#222222';
      g.fillText(txt, 9, H - 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, ld, v.ox, v.oy, v.s, W, H, hold, mouse, sel, frame, fills, evals, hoverSnap, adding, tool, act]);

  // the mouse: in the canvas's own pixels (the canvas may be drawn smaller or larger: the zoom of the graph)
  const at = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const near = (p: Px | null | undefined, x: number, y: number, r = NEAR) => !!p && Number.isFinite(p.u) && Math.hypot(sx(p) - x, sy(p) - y) <= r;
  const boundaryHit = (x: number, y: number): Item | null => {
    for (const i of [act, ...splines.map((_, i) => i).filter((i) => i !== act)]) {
      const k = splines[i]?.points.findIndex((p) => near(p, x, y)) ?? -1;
      if (k >= 0) return { kind: 'spline', s: i, k };
    }
    return null;
  };
  // what is under the mouse (the topmost) — each tool picks only its own things: Axes the calibration, Frame the
  // corners of the frame, Draw boundary the points of the boundaries (none while one is drawn), Add point the points,
  // Select the points, the notes, the names of the regions and the points of the boundaries
  const hit = (x: number, y: number): Item | null => {
    if (tool === 'axes') {
      const cal = d.cal ?? 'axes';
      const list = cal === 'axes' ? d.axes : cal === 'corners' ? (d.corners ?? NULL4) : (d.grid ?? []);
      const k = list.findIndex((p) => near(p, x, y));
      return k >= 0 ? { kind: cal, k } : null;
    }
    if (tool === 'border') {
      const k = frame ? frame.findIndex((p) => near(p, x, y, NEAR + 2)) : -1;
      return k >= 0 ? { kind: 'border', k } : null;
    }
    if (tool === 'spline') return props.drawing === null ? boundaryHit(x, y) : null;
    for (let k = d.leverPoints.length - 1; k >= 0; k--) if (near(d.leverPoints[k].pt, x, y, NEAR + 2)) return { kind: 'lever', k };
    if (tool === 'point') return null;
    const notes = d.notes ?? [];
    for (let k = notes.length - 1; k >= 0; k--) {
      if (near(notes[k].p2, x, y)) return { kind: 'note', k, end: 'p2' };
      if (near(notes[k].p1, x, y, notes[k].kind === 'text' ? 14 : NEAR)) return { kind: 'note', k, end: 'p1' };
    }
    if (tool !== 'none') return null;
    if (d.showRegions !== false) for (let k = d.regions.length - 1; k >= 0; k--) if (d.regions[k].name.trim() && near(d.regions[k].labelPt, x, y, 14)) return { kind: 'label', k };
    return boundaryHit(x, y);
  };
  // the line under the mouse (to make it the active one)
  const lineHit = (x: number, y: number) => splines.findIndex((s) => s.points.length >= 2 && (closestOnLine(toImg(x, y), pathOf(s))?.dist ?? Infinity) * v.s <= NEAR);

  const placeCal = (p: Px) => {
    if (!placing) return;
    if (placing.kind === 'grid') {
      // a new grid point: its values those of the last one (the next tick usually shares one of them)
      const grid = d.grid ?? [];
      const last = grid[grid.length - 1];
      set({ grid: [...grid, { ...p, x: last?.x ?? NaN, y: last?.y ?? NaN }] });
      setSel({ kind: 'grid', k: grid.length });
      return;
    }
    const k = placing.k;
    if (placing.kind === 'axes') {
      const axes = d.axes.map((q, j) => (j === k ? { ...p, val: q?.val ?? NaN } : q));
      set({ axes });
      setSel({ kind: 'axes', k });
      const next = axes.findIndex((q, j) => j > k && (!q || !Number.isFinite(q.u)));
      props.setPlacing(next >= 0 ? { kind: 'axes', k: next } : null);
    } else if (placing.kind === 'corners') {
      const corners = (d.corners ?? NULL4).map((q, j) => (j === k ? p : q));
      set({ corners });
      setSel({ kind: 'corners', k });
      const next = corners.findIndex((q, j) => j > k && !q);
      props.setPlacing(next >= 0 ? { kind: 'corners', k: next } : null);
    } else {
      // the frame: the four corners in turn (the others where they were until clicked; the ends of the boundaries on
      // it follow), then its corners dragged
      set(moved(d, { kind: 'border', k, at: p }, frame));
      setSel({ kind: 'border', k });
      props.setPlacing(k < 3 ? { kind: 'border', k: k + 1 } : null);
    }
  };
  // a boundary drawn: a click adds a point at its end (caught on what is near; the first click starts a new one)
  const drawAt = (p0: Px, alt: boolean) => {
    const p = snapAt(p0, alt)?.pt ?? p0;
    // (an empty boundary chosen, as an older node's first one: drawn into)
    const i = props.drawing ?? (splines[act] && !splines[act].points.length ? act : null);
    if (i !== null && props.drawing === null) props.setDrawing(i);
    if (i === null || !splines[i]) {
      const n = splines.length;
      const used = new Set(splines.map((s) => s.name));
      let k = n + 1;
      while (used.has(`Boundary ${k}`)) k++;
      set({ splines: [...splines, { id: `s${Date.now().toString(36)}`, name: `Boundary ${k}`, color: LINE_COLOR, points: [p], smooth: false }], activeSpline: n });
      props.setDrawing(n);
      setSel({ kind: 'spline', s: n, k: 0 });
      return;
    }
    const s = splines[i];
    set({ splines: splines.map((q, j) => (j === i ? { ...q, points: [...q.points, p] } : q)) });
    setSel({ kind: 'spline', s: i, k: s.points.length });
  };
  // the boundary drawn finished (a double-click: its second click's point dropped; on its first point: closed)
  const finish = (dblClick: boolean) => {
    const i = props.drawing;
    props.setDrawing(null);
    if (i === null || !splines[i]) return;
    let pts = splines[i].points.slice();
    if (dblClick && pts.length >= 2 && Math.hypot(sx(pts[pts.length - 1]) - sx(pts[pts.length - 2]), sy(pts[pts.length - 1]) - sy(pts[pts.length - 2])) <= 4) pts = pts.slice(0, -1);
    let closed = false;
    if (pts.length >= 4 && near(pts[0], sx(pts[pts.length - 1]), sy(pts[pts.length - 1]))) {
      pts = pts.slice(0, -1);
      closed = true;
    }
    // (a single point is no boundary)
    if (pts.length < 2) {
      set({ splines: splines.filter((_, j) => j !== i), activeSpline: Math.max(0, Math.min(act, splines.length - 2)) });
      setSel(null);
      return;
    }
    set({ splines: splines.map((q, j) => (j === i ? { ...q, points: pts, ...(closed ? { closed: true } : {}) } : q)) });
    setSel(null);
  };
  // a point of a boundary made a corner, or smooth again (a right click)
  const toggleCorner = (h: Item) => {
    const s = splines[h.s ?? -1];
    if (!s) return;
    const corner = cornersOf(s)[h.k];
    const without = (l: number[] | undefined) => (l ?? []).filter((q) => q !== h.k);
    set({ splines: splines.map((q, j) => (j === h.s ? { ...q, corners: corner ? without(q.corners) : [...without(q.corners), h.k], rounds: corner ? [...without(q.rounds), h.k] : without(q.rounds) } : q)) });
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    cv.current?.focus();
    const { x, y } = at(e);
    const p = toImg(x, y);
    // the drags keep the mouse (a capture refused by the browser is not needed for a click)
    try {
      cv.current!.setPointerCapture(e.pointerId);
    } catch {
      /* a click still works */
    }
    if (e.button === 1 || props.zoom === 'pan') return setHold({ kind: 'pan', sx: x, sy: y, ox: v.ox, oy: v.oy });
    if (e.button === 2) {
      const h = tool === 'spline' || tool === 'none' ? boundaryHit(x, y) : null;
      if (h) toggleCorner(h);
      return;
    }
    if (e.button !== 0) return;
    if (props.zoom === 'zoom') return setHold({ kind: 'zoom', a: p, b: p });
    if (placing) return placeCal(p);
    const h = hit(x, y);
    if (h) {
      setSel(h);
      if (h.kind === 'spline' && h.s !== act) set({ activeSpline: h.s });
      const where = placeOf(d, h, frame);
      if (where) setHold({ ...h, at: where });
      return;
    }
    if (tool === 'spline') return drawAt(p, e.altKey);
    // no frame yet: its corners placed in turn
    if (tool === 'border' && !frame) {
      props.setPlacing({ kind: 'border', k: 0 });
      set(moved(d, { kind: 'border', k: 0, at: p }, null));
      props.setPlacing({ kind: 'border', k: 1 });
      return;
    }
    if (tool === 'point') {
      const k = d.leverPoints.length;
      const used = new Set(d.leverPoints.map((q) => q.name));
      let n = k + 1;
      while (used.has(`P${n}`)) n++;
      const nk = props.newPoint;
      set({ leverPoints: [...d.leverPoints, { id: `lp${Date.now().toString(36)}`, name: `P${n}`, pt: p, ...(nk === 'lever' ? {} : nk === 'read' ? { kind: 'read' as const } : { kind: 'path' as const, dir: nk === 'up' ? ('up' as const) : ('down' as const) }) }] });
      setSel({ kind: 'lever', k });
      return;
    }
    if (tool === 'noteText') {
      const note: PhaseCanvasNote = { id: `note${Date.now().toString(36)}`, kind: 'text', p1: p, text: 'Text', color: '#222222' };
      set({ notes: [...(d.notes ?? []), note] });
      setSel({ kind: 'note', k: (d.notes ?? []).length, end: 'p1' });
      props.setTool('none');
      return;
    }
    if (tool === 'noteArrow' || tool === 'noteLine' || tool === 'noteRect') return setHold({ kind: 'draw', note: tool === 'noteArrow' ? 'arrow' : tool === 'noteLine' ? 'line' : 'rect', a: p, b: p });
    if (tool === 'none') {
      const i = lineHit(x, y);
      if (i >= 0) {
        set({ activeSpline: i });
        setSel(null);
        return;
      }
    }
    setSel(null);
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = at(e);
    setMouse({ x, y, alt: e.altKey });
    if (!hold) return;
    const p = toImg(x, y);
    if (hold.kind === 'pan') props.setView({ s: v.s, ox: hold.ox - (x - hold.sx) / v.s, oy: hold.oy - (y - hold.sy) / v.s });
    else if (hold.kind === 'zoom') setHold({ ...hold, b: p });
    else if (hold.kind === 'draw') setHold({ ...hold, b: p });
    // a point of a line: caught on what is near (Alt: not)
    else if (hold.kind === 'spline') setHold({ ...hold, at: (e.altKey ? null : snapPoint(p, props.frame, d.splines, hold.s ?? act, snapTol))?.pt ?? p });
    else setHold({ ...hold, at: p });
  };
  const up = () => {
    const h = hold;
    setHold(null);
    if (!h) return;
    if (h.kind === 'zoom') {
      const [w, hh] = [Math.abs(h.b.u - h.a.u), Math.abs(h.b.v - h.a.v)];
      if (w * v.s > 4 && hh * v.s > 4) {
        const s = Math.min(W / w, H / hh);
        props.setView({ s, ox: (h.a.u + h.b.u) / 2 - W / s / 2, oy: (h.a.v + h.b.v) / 2 - H / s / 2 });
      }
    } else if (h.kind === 'draw') {
      if (Math.hypot(h.b.u - h.a.u, h.b.v - h.a.v) * v.s > 4) {
        set({ notes: [...(d.notes ?? []), { id: `note${Date.now().toString(36)}`, kind: h.note, p1: h.a, p2: h.b, color: '#1971c2' }] });
        setSel({ kind: 'note', k: (d.notes ?? []).length, end: 'p2' });
      }
      props.setTool('none');
    } else if (h.kind !== 'pan') {
      const p = placeOf(d, h, props.frame);
      if (p && (p.u !== h.at.u || p.v !== h.at.v)) set(moved(d, h, props.frame));
    }
  };
  const dbl = (e: RMouseEvent<HTMLCanvasElement>) => {
    // a boundary drawn: finished (closed on its first point)
    if (tool === 'spline' && props.drawing !== null) return finish(true);
    const { x, y } = at(e);
    const h = hit(x, y);
    // Select: a point of a boundary removed, a point put where the line is clicked
    if (!h && tool === 'none') {
      const i = lineHit(x, y);
      const k = i >= 0 ? insertOn(splines[i], toImg(x, y), NEAR / v.s) : null;
      if (i >= 0 && k !== null) {
        const p = closestOnLine(toImg(x, y), pathOf(splines[i]))!.pt;
        set({ splines: splines.map((q, j) => (j === i ? withPoint(q, k, p) : q)), activeSpline: i });
        setSel({ kind: 'spline', s: i, k });
      }
      return;
    }
    if (!h || h.kind === 'label' || h.kind === 'border') return;
    const r = removed(d, h);
    if (r) {
      set(r);
      setSel(null);
    }
  };
  const wheel = (e: RWheelEvent<HTMLCanvasElement>) => {
    if (!img) return;
    const { x, y } = at(e);
    const p = toImg(x, y);
    const s = Math.min(64, Math.max(fit.s / 4, v.s * (e.deltaY > 0 ? 1 / 1.2 : 1.2)));
    props.setView({ s, ox: p.u - x / s, oy: p.v - y / s });
  };
  // the keys: Enter (or Escape) finishes the boundary drawn, Backspace takes back its last point; the arrows move the
  // item chosen (1 px; Shift: 0.1 px), Delete removes it, Escape ends the tool
  const key = (e: RKeyboardEvent) => {
    if (props.drawing !== null && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Backspace')) {
      e.preventDefault();
      e.stopPropagation();
      const i = props.drawing;
      if (e.key === 'Backspace') {
        const s = splines[i];
        if (s) set({ splines: splines.map((q, j) => (j === i ? { ...q, points: q.points.slice(0, -1) } : q)) });
        return;
      }
      return finish(false);
    }
    if (e.key === 'Escape') {
      props.setTool('none');
      props.setPlacing(null);
      setSel(null);
      e.stopPropagation();
      return;
    }
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const r = removed(d, sel);
      if (r) {
        set(r);
        setSel(null);
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const p = placeOf(d, sel, frame);
    if (!dir || !p) return;
    e.preventDefault();
    e.stopPropagation();
    const f = e.shiftKey ? 0.1 : 1;
    set(moved(d, { ...sel, at: { u: p.u + dir[0] * f, v: p.v + dir[1] * f } }, frame));
  };
  const cursor = props.zoom === 'pan' || hold?.kind === 'pan' ? 'grab' : hold && 'at' in hold ? 'grabbing' : placing || props.zoom === 'zoom' || tool !== 'none' ? 'crosshair' : 'default';
  return (
    <canvas
      ref={cv}
      className="nodrag nowheel nokey digitizer-board"
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

export function PhaseDigitizerNode({ id, data }: NodeProps<PhaseDigitizerNodeType>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const d: PhaseDigitizerData = useMemo(() => repairPhaseData({ ...PHASE_DIGITIZER_DEFAULTS, ...data }), [data]);
  const set = (p: Partial<PhaseDigitizerData>) => updateNodeData(id, p);
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const img = loaded && loaded.url === d.image ? loaded.img : null;
  const [tool, setTool] = useState<Tool>('none');
  const [newPoint, setNewPoint] = useState<NewPoint>('lever');
  const [drawing, setDrawing] = useState<number | null>(null);
  const [placing, setPlacing] = useState<Placing>(null);
  const [sel, setSel] = useState<Item | null>(null);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [big, setBig] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    if (d.image) loadImg(d.image).then((i) => live && setLoaded({ url: d.image, img: i }), () => live && setErr('The image could not be read.'));
    return () => {
      live = false;
    };
  }, [d.image]);
  const open = async (f: Blob | null | undefined, name: string) => {
    if (!f) return;
    try {
      const { url, w, h } = await readImage(f);
      setErr('');
      setView(null);
      // a new image: a new diagram (its calibration placed again, its lines clicked again: they were in the old one's pixels)
      set({ image: url, fileName: name, w, h, axes: [null, null, null, null], corners: [null, null, null, null], border: [null, null, null, null], grid: [], splines: [], activeSpline: 0, regions: [], leverPoints: [], notes: [] });
      setTool('none');
      setPlacing((d.cal ?? 'axes') === 'grid' ? { kind: 'grid' } : { kind: (d.cal ?? 'axes') === 'corners' ? 'corners' : 'axes', k: 0 });
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

  const calMode: CalMode = d.cal ?? 'axes';
  const grid = d.grid ?? [];
  const corners = d.corners ?? NULL4;
  const splines = d.splines;
  const act = Math.max(0, Math.min(d.activeSpline || 0, splines.length - 1));
  const dd = useMemo(() => ({ ...d, splines }), [d, splines]);
  const mapper = useMemo(() => createCalMapper(dd), [dd]);
  const frame = useMemo(() => frameOf(dd, mapper), [dd, mapper]);
  const faces = useMemo(() => (frame ? phaseFaces(frame, dd.splines) : []), [frame, dd.splines]);
  const evals = useMemo(() => (typeof mapper === 'string' ? [] : evalPoints(dd, mapper, frame, faces)), [mapper, dd, frame, faces]);

  // the boundary drawn left (one of a single point: removed)
  const endDrawing = () => {
    if (drawing === null) return;
    setDrawing(null);
    if ((splines[drawing]?.points.length ?? 0) < 2) set({ splines: splines.filter((_, j) => j !== drawing), activeSpline: 0 });
  };
  const pick = (t: Tool) => {
    endDrawing();
    const next = tool === t && t !== 'none' ? 'none' : t;
    setTool(next);
    // the frame: its corners placed in turn only when there is none yet (else dragged)
    setPlacing(next === 'border' && !frame ? { kind: 'border', k: 0 } : null);
    setZoom('none');
  };
  const place = (p: Placing) => {
    endDrawing();
    setPlacing(placing && p && JSON.stringify(placing) === JSON.stringify(p) ? null : p);
    setTool(p?.kind === 'border' ? 'border' : 'axes');
    setZoom('none');
  };
  const findRegions = () => {
    if (!frame) return setErr('Calibrate the axes (or place the corners of the frame) first.');
    setErr('');
    set({ regions: detectRegions(faces, d.regions), showRegions: true });
  };
  const setLine = (i: number, p: Partial<PhaseSpline>) => set({ splines: splines.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setRegion = (i: number, p: Partial<PhaseRegion>) => set({ regions: d.regions.map((q, j) => (j === i ? { ...q, ...p } : q)) });
  const setNote = (i: number, p: Partial<PhaseCanvasNote>) => set({ notes: (d.notes ?? []).map((q, j) => (j === i ? { ...q, ...p } : q)) });
  const setAxisVal = (k: number, val: number) => set({ axes: d.axes.map((q, j) => (j === k ? { u: q?.u ?? NaN, v: q?.v ?? NaN, val } : q)) });

  const btn = (on: boolean) => `nodrag${on ? ' on' : ''}`;
  const board = (w: number, h: number) => (
    <Board
      d={dd}
      set={set}
      img={img}
      width={w}
      height={h}
      tool={tool}
      setTool={setTool}
      placing={placing}
      setPlacing={setPlacing}
      sel={sel}
      setSel={setSel}
      zoom={zoom}
      view={view}
      setView={setView}
      mapper={mapper}
      frame={frame}
      faces={faces}
      newPoint={newPoint}
      drawing={drawing}
      setDrawing={setDrawing}
    />
  );
  const hint = placing
    ? placing.kind === 'grid'
      ? 'Click on a tick or a crossing of the grid: a reference point (then write its X and Y); again for the next one.'
      : placing.kind === 'axes'
        ? `Click on the image: ${AXES[placing.k]}, a point of the ${placing.k < 2 ? 'X' : 'Y'} axis whose value you know (a tick).`
        : `Click on the image: the ${CORNERS[placing.k]} corner of the ${placing.kind === 'border' ? 'frame of the diagram' : 'graph'}.`
    : zoom !== 'none'
      ? 'Zoom: drag a rectangle · Pan: drag the image (also the middle button, at any time).'
      : HINT[tool];
  const tools = (
    <>
      <div className="row wrap">
        <button className={btn(tool === 'none')} title={HINT.none} onClick={() => pick('none')}>
          Select
        </button>
        <button className={btn(tool === 'axes')} title={HINT.axes} onClick={() => pick('axes')}>
          Axes
        </button>
        <button className={btn(tool === 'border')} title={HINT.border} onClick={() => pick('border')}>
          Frame
        </button>
        <button className={btn(tool === 'spline')} title={HINT.spline} onClick={() => pick('spline')}>
          Draw boundary
        </button>
        <button className="nodrag" title="A region (a name, a colour) in every face the lines close with the border that has none yet; the regions follow the lines" onClick={findRegions}>
          Draw regions
        </button>
        <button className={btn(tool === 'point')} title={HINT.point} onClick={() => pick('point')}>
          Add point
        </button>
        <button className={btn(tool.startsWith('note'))} title="A text, an arrow, a line or a box on the diagram" onClick={() => pick(tool.startsWith('note') ? tool : 'noteText')}>
          Annotate
        </button>
        <button className={btn(d.loupe !== false)} title="A magnifier beside the cursor: the pixels under it, enlarged" onClick={() => set({ loupe: d.loupe === false })}>
          Magnifier
        </button>
      </div>
      {tool === 'point' && (
        <div className="row wrap">
          {NEW_POINTS.map(([k, label, title]) => (
            <button key={k} className={btn(newPoint === k)} title={title} onClick={() => setNewPoint(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tool.startsWith('note') && (
        <div className="row wrap">
          {(
            [
              ['noteText', 'Text'],
              ['noteArrow', 'Arrow'],
              ['noteLine', 'Line'],
              ['noteRect', 'Box'],
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={btn(tool === t)} title={HINT[t]} onClick={() => setTool(t)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="row wrap">
        <ZoomTools mode={zoom} setMode={(z) => (setZoom(z), setPlacing(null))} onRescale={() => setView(null)} onZoomOut={() => setView(null)} zoomed={!!view} />
        <span className="grow" />
        {drawing !== null && splines[drawing] ? (
          <span className="muted ellipsis" title="Double-click (or Enter) to end it; on its first point it closes">
            drawing {splines[drawing].name} · {splines[drawing].points.length} pt
          </span>
        ) : (
          splines[act] && <span className="muted ellipsis">{splines[act].name} · {splines[act].points.length} pt</span>
        )}
        <button className="nodrag" title="The image large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
      <div className="hint digi-hint">{hint}</div>
    </>
  );
  const out = r?.outputs.dataset;
  const xa = xAxisOf(d);
  return (
    <div
      className="node node-phasedigitizer"
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
          e.stopPropagation();
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
          <span className="muted ellipsis grow">{d.fileName || 'no image'}</span>
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
              value={calMode}
              options={[
                ['axes', '2 points on each axis (straight or tilted)'],
                ['corners', 'the 4 corners of the frame (perspective)'],
                ['grid', 'many points (curved page, lens)'],
              ]}
              onChange={(cal) => (set({ cal }), setPlacing(null))}
            />
          </div>
          {calMode === 'axes' && (
            <div className="digi-cal">
              {AXES.map((lab, k) => (
                <span key={k} className="row">
                  <button className={btn(placing?.kind === 'axes' && placing.k === k)} title={`Then click on the image: ${lab}, a point of the ${k < 2 ? 'X' : 'Y'} axis whose value you know (a tick)`} onClick={() => place({ kind: 'axes', k })}>
                    {d.axes[k] && Number.isFinite(d.axes[k]!.u) ? `✓ ${lab}` : lab}
                  </button>
                  <NumInput className="short" value={d.axes[k]?.val ?? NaN} placeholder={k < 2 ? 'X value' : 'Y value'} onChange={(val) => setAxisVal(k, val)} />
                </span>
              ))}
            </div>
          )}
          {calMode === 'corners' && (
            <>
              <div className="digi-cal">
                {CORNERS.map((lab, k) => (
                  <button key={k} className={btn(placing?.kind === 'corners' && placing.k === k)} title={`Then click on the image: the ${lab} corner of the graph`} onClick={() => place({ kind: 'corners', k })}>
                    {corners[k] ? `✓ ${lab}` : lab}
                  </button>
                ))}
              </div>
              <div className="digi-cal">
                {CORNER_VALUES.map((lab, k) => (
                  <Field key={k} label={lab}>
                    <NumInput className="short" value={d.axes[k]?.val ?? NaN} onChange={(val) => setAxisVal(k, val)} />
                  </Field>
                ))}
              </div>
            </>
          )}
          {calMode === 'grid' && (
            <>
              <div className="row wrap">
                <button className={btn(placing?.kind === 'grid')} title="Then click on the image, point after point: ticks on the axes, crossings of the grid, the corners; spread over the graph" onClick={() => place({ kind: 'grid' })}>
                  + Reference points
                </button>
                <Field label="Map">
                  <Select<GridFit>
                    value={d.gridFit ?? 'tps'}
                    options={[
                      ['tps', 'thin-plate spline (through every point)'],
                      ['poly2', 'polynomial, degree 2'],
                      ['poly3', 'polynomial, degree 3'],
                    ]}
                    onChange={(gridFit) => set({ gridFit })}
                  />
                </Field>
              </div>
              {grid.length > 0 && (
                <div className="digi-grid">
                  <span className="muted">#</span>
                  <span className="muted">X</span>
                  <span className="muted">Y</span>
                  <span className="muted" title="The error of the point, in % of the range (spline: the map made without it)">
                    error %
                  </span>
                  <span />
                  {grid.map((p, k) => {
                    const e = typeof mapper === 'object' && mapper.resid?.[k];
                    const worst = e ? Math.max(Math.abs(e.dx), Math.abs(e.dy)) : NaN;
                    return (
                      <span key={k} className="digi-grid-row">
                        <b>{k + 1}</b>
                        <NumInput value={p.x} onChange={(x) => set({ grid: grid.map((q, j) => (j === k ? { ...q, x } : q)) })} />
                        <NumInput value={p.y} onChange={(y) => set({ grid: grid.map((q, j) => (j === k ? { ...q, y } : q)) })} />
                        <span className={`mono${worst > 1 ? ' bad' : ''}`}>{Number.isFinite(worst) ? worst.toFixed(2) : '—'}</span>
                        <button className="nodrag ts-btn" title="Remove this point" onClick={() => set({ grid: grid.filter((_, j) => j !== k) })}>
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
            <Check label="Log X" value={d.xLog} onChange={(xLog) => set({ xLog })} />
            <Check label="Log Y" value={d.yLog} onChange={(yLog) => set({ yLog })} />
          </div>
          <div className="row wrap">
            <Field label="X name" title="What the X axis is: a component (its amount, e.g. Ni), or any quantity">
              <TextInput className="short" value={d.compB} placeholder="X" onChange={(compB) => set({ compB })} />
            </Field>
            <Field label="Unit" title="Any unit (wt%, at%, mol%, a mole fraction, K …), or none">
              <TextInput className="short" value={d.xUnit ?? ''} placeholder="none" onChange={(xUnit) => set({ xUnit })} />
            </Field>
          </div>
          <div className="row wrap">
            <Field label="Other component" title="A binary diagram: the other component, its amount the rest to the total (Total − X) in the tables; empty: none">
              <TextInput className="short" value={d.compA} placeholder="none" onChange={(compA) => set({ compA })} />
            </Field>
            {xa.other && !xa.totalAuto && (
              <Field label="Total" title="X and the other component together (the unit does not tell: 100 for %, 1 for fractions)">
                <NumInput className="short" value={d.total ?? 100} onChange={(total) => set({ total: Number.isFinite(total) ? total : undefined })} />
              </Field>
            )}
          </div>
          {xa.other && /^(wt|mass|at|mol)\s*%$/i.test(xa.unit) && (
            <div className="row wrap">
              <Field label="Molar masses" title="g/mol: the compositions also in at% (from wt%) or in wt% (from at%) in the tables; empty: not converted">
                <span className="muted">{xa.other}</span>
                <NumInput className="short" value={d.massA ?? NaN} placeholder="g/mol" onChange={(massA) => set({ massA: Number.isFinite(massA) ? massA : undefined })} />
                <span className="muted">{xa.name}</span>
                <NumInput className="short" value={d.massB ?? NaN} placeholder="g/mol" onChange={(massB) => set({ massB: Number.isFinite(massB) ? massB : undefined })} />
              </Field>
            </div>
          )}
          <div className="row wrap">
            <Field label="Y name">
              <TextInput className="short" value={d.yName} placeholder="T" onChange={(yName) => set({ yName })} />
            </Field>
            <Field label="Unit">
              <TextInput className="short" value={d.yUnit} placeholder="°C" onChange={(yUnit) => set({ yUnit })} />
            </Field>
          </div>
          {d.image && <div className={typeof mapper === 'string' ? 'hint' : 'hint ok'}>{typeof mapper === 'string' ? mapper : mapper.note}</div>}
        </details>
        <details open>
          <summary>Frame & boundaries</summary>
          <div className="row wrap">
            <span className="muted">Frame</span>
            <button className={btn(tool === 'border' && !placing)} title={HINT.border} onClick={() => pick('border')}>
              Edit
            </button>
            <button className={btn(placing?.kind === 'border')} title="Click the 4 corners of the frame anew: bottom left, bottom right, top right, top left" onClick={() => place({ kind: 'border', k: 0 })}>
              Place again
            </button>
            <button className="nodrag" title="The frame of the diagram: the box of the calibration (its corners, or the values of the axes)" disabled={!d.border?.some(Boolean)} onClick={() => set({ border: [null, null, null, null] })}>
              From the calibration
            </button>
            <Check label="Show" value={d.showBorder !== false} onChange={(showBorder) => set({ showBorder })} />
          </div>
          <div className="digi-sets">
            {splines.map((s, i) => (
              <div key={s.id} className={`digi-set${i === act ? ' on' : ''}`} onClick={() => i !== act && set({ activeSpline: i })}>
                <span className="row">
                <input className="nodrag" type="radio" checked={i === act} onChange={() => set({ activeSpline: i })} title="The boundary chosen (its points shown)" />
                <TextInput value={s.name} onChange={(name) => setLine(i, { name })} />
                <span className="muted">{s.points.length} pt</span>
                <Check label="Smooth" title="A smooth curve through the points (it never swings out; a corner where it turns sharply, or marked with a right click), else straight pieces" value={s.smooth !== false} onChange={(smooth) => setLine(i, { smooth })} />
                <button className="nodrag ts-btn" title="Remove this boundary" onClick={() => (setDrawing(null), set({ splines: splines.filter((_, j) => j !== i), activeSpline: Math.max(0, act >= i ? act - 1 : act) }))}>
                  <X {...IC} />
                </button>
                </span>
                <span className="row">
                  <Check label="Closed" title="Back to its first point (an island, a dome)" value={!!s.closed} onChange={(closed) => setLine(i, { closed: closed || undefined })} />
                  <Check label="Invariant" title="An invariant line (eutectic, eutectoid, peritectic …): a path crossing it gives the microconstituents; the primary phase and the constituent formed on the line" value={!!s.invariant} onChange={(invariant) => setLine(i, { invariant: invariant || undefined })} />
                  {s.invariant && (
                    <Field label="Constituent" title="The name of what forms on the line (eutectic, pearlite, ledeburite …; empty: the name of the boundary)">
                      <TextInput className="short" value={s.micro ?? ''} placeholder={s.name || 'eutectic'} onChange={(micro) => setLine(i, { micro })} />
                    </Field>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="row wrap">
            <button className={btn(tool === 'spline')} title={HINT.spline} onClick={() => pick('spline')}>
              Draw boundary
            </button>
            <Field label="Catch within" title="A point clicked this near a corner, a point or a line goes onto it (Alt held: not)">
              <NumInput className="tiny" min={0} max={40} step={1} value={d.snapTol ?? 10} onChange={(snapTol) => set({ snapTol: Math.min(40, Math.max(0, snapTol || 0)) })} />
              <span className="muted">px</span>
            </Field>
          </div>
        </details>
        <details open>
          <summary>Regions ({d.regions.length})</summary>
          <div className="row wrap">
            <button className="nodrag" title="A region in every face the lines close with the border that has none yet" onClick={findRegions}>
              Draw regions
            </button>
            <Check label="Show" value={d.showRegions !== false} onChange={(showRegions) => set({ showRegions })} />
            {d.regions.length > 0 && (
              <button className="nodrag" onClick={() => set({ regions: [] })}>
                Clear
              </button>
            )}
          </div>
          {d.regions.length === 0 ? (
            <div className="hint">Draw the boundaries (their ends on the border or on other lines), then Draw regions: each closed face gets a name and a colour. A region is the face its label is in: drag the label to move it.</div>
          ) : (
            <div className="digi-sets">
              {d.regions.map((q, i) => (
                <div key={q.id} className={`digi-set${sel?.kind === 'label' && sel.k === i ? ' on' : ''}`} onClick={() => setSel({ kind: 'label', k: i })}>
                  <span className="row">
                    <input className="nodrag digi-color" type="color" title="The colour of the region" value={q.color} onChange={(e) => setRegion(i, { color: e.target.value })} />
                    <RichInput value={q.name} placeholder="α + L" onChange={(name) => setRegion(i, { name })} />
                    <Select<string>
                      value={q.phases ? String(q.phases) : ''}
                      title="One phase (no tie line: 100 %), or two (the lever rule between the frontiers of the region); auto: from the name (“α + L”: two, another name: one, none: two)"
                      options={[
                        ['', `auto: ${regionPhases(q) === 2 ? '2 phases' : '1 phase'}`],
                        ['1', '1 phase'],
                        ['2', '2 phases'],
                      ]}
                      onChange={(v) => setRegion(i, { phases: v === '1' ? 1 : v === '2' ? 2 : undefined })}
                    />
                    <Field label="Opacity %">
                      <NumInput className="tiny" min={0} max={100} step={5} value={Math.round(q.opacity * 100)} onChange={(o) => setRegion(i, { opacity: Math.min(1, Math.max(0, (Number.isFinite(o) ? o : 25) / 100)) })} />
                    </Field>
                    <button className="nodrag ts-btn" title="Remove this region" onClick={(e) => (e.stopPropagation(), set({ regions: d.regions.filter((_, j) => j !== i) }))}>
                      <X {...IC} />
                    </button>
                  </span>
                  {sel?.kind === 'label' && sel.k === i && <TextStyleControls label="Label" value={q.textStyle} onChange={(textStyle) => setRegion(i, { textStyle })} />}
                </div>
              ))}
            </div>
          )}
        </details>
        <details open>
          <summary>Points ({d.leverPoints.length})</summary>
          <div className="row wrap">
            <button className={btn(tool === 'point')} title={HINT.point} onClick={() => pick('point')}>
              + Points on the diagram
            </button>
            <Select<NewPoint> value={newPoint} title="The kind of the points clicked" options={NEW_POINTS.map(([k, label]): [NewPoint, string] => [k, label])} onChange={setNewPoint} />
            {d.leverPoints.length > 0 && (
              <button className="nodrag" onClick={() => set({ leverPoints: [] })}>
                Clear all
              </button>
            )}
          </div>
          {evals.length > 0 && (
            <div className="digi-sets">
              {evals.map((e, k) => {
                const lp = d.leverPoints[k];
                const setPt = (p: Partial<PhaseLeverPoint>) => set({ leverPoints: d.leverPoints.map((q, j) => (j === k ? { ...q, ...p } : q)) });
                const kind: NewPoint = e.kind === 'path' ? (lp.dir === 'up' ? 'up' : 'down') : e.kind;
                const arms = armsOf(e);
                const xs = (x: number) => `${fmtNum(x, 4)}${xa.unit ? ` ${xa.unit}` : ''}`;
                const ys = (y: number) => `${fmtNum(y, 4)}${d.yUnit ? ` ${d.yUnit}` : ''}`;
                return (
                  <div key={e.id} className={`digi-set${sel?.kind === 'lever' && sel.k === k ? ' on' : ''}`} onClick={() => setSel({ kind: 'lever', k })}>
                    <span className="row">
                      <input className="nodrag digi-color" type="color" title="The colour of the point" value={e.color} onChange={(ev) => setPt({ color: ev.target.value })} />
                      <TextInput className="tiny" value={e.name} onChange={(name) => setPt({ name })} />
                      <Select<NewPoint> value={kind} options={NEW_POINTS.map(([q, label]): [NewPoint, string] => [q, label])} onChange={(q) => setPt(q === 'lever' ? { kind: undefined, dir: undefined } : q === 'read' ? { kind: 'read', dir: undefined } : { kind: 'path', dir: q })} />
                      {e.kind === 'lever' && (
                        <>
                          <span className="muted" title="The left arm of the lever (the point to the left end): its colour">
                            a
                          </span>
                          <input className="nodrag digi-color" type="color" value={e.armA} onChange={(ev) => setPt({ colorA: ev.target.value })} />
                          <span className="muted" title="The right arm of the lever (the point to the right end): its colour">
                            b
                          </span>
                          <input className="nodrag digi-color" type="color" value={e.armB} onChange={(ev) => setPt({ colorB: ev.target.value })} />
                        </>
                      )}
                      <span className="grow" />
                      <button className="nodrag ts-btn" title="Remove this point" onClick={(ev) => (ev.stopPropagation(), set({ leverPoints: d.leverPoints.filter((_, j) => j !== k) }))}>
                        <X {...IC} />
                      </button>
                    </span>
                    <div className="muted digi-point">
                      {xa.name} {xs(e.x0)}, {d.yName || 'Y'} {ys(e.y0)}
                      {e.kind === 'path' && e.path ? (
                        <>
                          <div>{pathText(e.path, (v) => fmtNum(v, 4))}</div>
                          {e.path.micro.map((mc, j) => (
                            <div key={j}>
                              {mc.line} ({ys(mc.y)}): {mc.before ? mc.before.map((q) => `${plainText(q.phase)} ${q.frac.toFixed(2)} %`).join(', ') : '—'}
                              {mc.after ? `; after: ${mc.after.map((q) => `${plainText(q.phase)} ${q.frac.toFixed(2)} %`).join(', ')}` : ''}
                            </div>
                          ))}
                        </>
                      ) : e.ends ? (
                        <>
                          <div>
                            {e.ends.map((q) => `${plainText(q.phase)} at ${xs(q.x)}: ${q.frac.toFixed(2)} %`).join(' · ')}
                          </div>
                          {arms && (
                            <div>
                              a = {fmtNum(arms.a, 4)}, b = {fmtNum(arms.b, 4)}: {plainText(e.ends[0].phase)} = b / (a + b), {plainText(e.ends[1].phase)} = a / (a + b)
                            </div>
                          )}
                        </>
                      ) : (
                        <div>{plainText(e.region) || 'no region here'}{e.kind === 'lever' && e.region ? ': one phase, 100 %' : ''}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </details>
        <details open={(d.notes ?? []).length > 0}>
          <summary>Notes</summary>
          <div className="row wrap">
            {(
              [
                ['noteText', '+ Text'],
                ['noteArrow', '+ Arrow'],
                ['noteLine', '+ Line'],
                ['noteRect', '+ Box'],
              ] as const
            ).map(([t, label]) => (
              <button key={t} className={btn(tool === t)} title={HINT[t]} onClick={() => (setTool(t), setPlacing(null))}>
                {label}
              </button>
            ))}
          </div>
          {(d.notes ?? []).length > 0 && (
            <div className="digi-sets">
              {(d.notes ?? []).map((n, i) => (
                <div key={n.id} className={`digi-set${sel?.kind === 'note' && sel.k === i ? ' on' : ''}`} onClick={() => setSel({ kind: 'note', k: i, end: 'p1' })}>
                  <span className="row">
                    <input className="nodrag digi-color" type="color" value={n.color || (n.kind === 'text' ? '#222222' : '#1971c2')} onChange={(e) => setNote(i, { color: e.target.value })} />
                    {n.kind === 'text' ? <RichInput value={n.text ?? ''} onChange={(text) => setNote(i, { text })} /> : <span className="muted grow">{n.kind}</span>}
                    <button className="nodrag ts-btn" title="Remove this note" onClick={(e) => (e.stopPropagation(), set({ notes: (d.notes ?? []).filter((_, j) => j !== i) }))}>
                      <X {...IC} />
                    </button>
                  </span>
                  {n.kind === 'text' && sel?.kind === 'note' && sel.k === i && <TextStyleControls value={n.textStyle} onChange={(textStyle) => setNote(i, { textStyle })} />}
                </div>
              ))}
            </div>
          )}
        </details>
        <details>
          <summary>Figure annotations</summary>
          <AnnotationsEditor items={d.annotations} onChange={(annotations) => set({ annotations })} where="frame" node={id} />
        </details>
        {out?.t === 'dataset' && out.v.columns[0]?.values.length > 0 && <DataPreview columns={out.v.columns} rows={4} />}
      </NodeOptions>
      {tools}
      {board(480, 350)}
      <ResultSummary result={r} />
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {board(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1500)), Math.max(360, Math.min((window.innerHeight || 800) * 0.74, 900)))}
            </div>
          </div>,
          document.body,
        )}
      <Messages result={r} />
      <OutPort id="dataset" label="dataset" port="dataset" title="The lever rule at every point: the composition, the phases at the ends of the tie line, their compositions and amounts" />
      <OutPort id="workbook" label="workbook" port="workbook" title="The lever rule and every boundary line read along it (a sheet each)" />
      <OutPort id="figure" label="figure" port="figure" title="The diagram drawn again in its data: the regions, the boundaries, the tie lines and their amounts" />
    </div>
  );
}
