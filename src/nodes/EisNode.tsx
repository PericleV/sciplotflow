// Equivalent circuit (EIS): the columns by their role (each shown with its first values; a column taken by its place
// only flagged to check), the circuit (a list, Boukamp's code, or built on its drawing: elements added in series or in
// parallel, replaced, deleted), the parameters (starts, fixed, the fitted values ± errors, χ², R²), the weighting; the
// graph — Nyquist, |Z|, the phase or both (Bode) — with the zoom tools and the data reader of the other graphs, the
// frequencies beside the points (dragged where they read best: kept, and so in the figures), the points left out of the
// fit with a click or a rectangle; the circuit's own figure (white or transparent, the values under the elements).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { ArrowUpLeft, Maximize2, MoveHorizontal, Play, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import { DRAWING_DEFAULTS } from '../defaults.ts';
import { useNodeResult } from '../engine/engine.ts';
import { drawCircuit, dropInto, editCircuit, EIS_CIRCUITS, elemPath, elemsOf, fmtFreq, labelledPoints, fitSettingsOf, inRanges, parseCircuit, rangeOf, rangeText, SLOT_ID, withBranch, writeCircuit, type EisRangeSpec, type CircuitDrawing, type EisData, type EisEdit, type EisElemKind, type EisLabelView, type EisParam, type EisPath, type EisSide, type EisTree } from '../engine/eis.ts';
import type { EisView } from '../engine/evaluate.ts';
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import type { AnnotationItem, AppNode, EisNode } from '../types.ts';
import { columnLetter } from '../engine/csv.ts';
import { DataPreview } from './DataNodes.tsx';
import { FigureView } from './FigureView.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
import { IC } from './iconProps.ts';

const M = { l: 58, r: 52, t: 14, b: 32 };
const DATA = '#1f77b4';
const FIT = '#d62728';
const PHASE = '#ff7f0e';
const OUT = '#9e9e9e';
const PICK = '#e8590c';
// the fits per range (as in the figures)
const RANGE_COLORS = ['#2f9e44', '#9c36b5', '#e8590c', '#1098ad', '#5c940d'];
// the fit ranges, as in Fit
const RANGE_BAND = 'rgba(230, 159, 0, 0.13)';
const RANGE_EDGE = '#e69f00';
type Kind = EisData['view'];
type Rect = { x: number; y: number; w: number; h: number };
// the labels of the Bode graph (both) are those of |Z|
const labelView = (k: Kind): EisLabelView => (k === 'nyquist' ? 'nyquist' : k === 'phase' ? 'phase' : 'mod');

// the graph: Nyquist (−Z″ against Z′, equal scales), |Z| or −phase against the frequency (logarithmic), or both (Bode)
function EisGraph({
  v,
  d,
  kind,
  W,
  H,
  zoom,
  box: zbox,
  onView,
  zoomOut,
  reader,
  picked,
  onPick,
  addRange,
  onRanges,
  onAdded,
  onLabel,
}: {
  v: EisView;
  d: EisData;
  kind: Kind;
  W: number;
  H: number;
  zoom: ZoomMode;
  box: View | null;
  onView: (b: View | null) => void;
  zoomOut: number;
  reader: { r: ReaderState; onRead: (t: string) => void };
  picked: Set<number>; // the points selected (their rows): left out or taken back by the buttons
  onPick: (rows: number[], how: 'toggle' | 'add' | 'remove') => void;
  onLabel: (view: EisLabelView, row: number, at: [number, number]) => void;
  // the frequency ranges, as in Fit: Add a range draws one (shown as it is dragged; then off: onAdded); the edges of a
  // range dragged at any time; on Nyquist, a rectangle round the points gives their frequencies
  addRange: boolean;
  onRanges: (r: EisRangeSpec[]) => void;
  onAdded: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number }; shift: boolean } | null>(null);
  // a label dragged: its point, where the mouse took it (from the label's bottom-left corner), where it is now
  const [moving, setMoving] = useState<{ row: number; dx: number; dy: number; x: number; y: number; x0: number; y0: number } | null>(null);
  const [cursor, setCursor] = useState('crosshair');
  const [rdrag, setRdrag] = useState<{ kind: 'new' | 'lo' | 'hi'; k: number; a: number; b: number } | null>(null);
  const boxes = useRef<{ row: number; r: Rect }[]>([]);
  const out = useMemo(() => new Set(d.excluded), [d.excluded]);
  const { pts, curve } = v;
  const [pw, ph] = [W - M.l - M.r, H - M.t - M.b];
  const lv = labelView(kind);
  const logX = kind !== 'nyquist';
  const logY = kind === 'mod' || kind === 'bode';
  const tx = (q: number) => (logX ? Math.log10(q) : q);
  const ty = (q: number) => (logY ? Math.log10(q) : q);
  // the values drawn: X, Y (left) and, in Bode, the phase (right)
  const g = useMemo(() => {
    const mod = (re: number[], im: number[]) => re.map((q, i) => Math.hypot(q, im[i]));
    const phase = (re: number[], im: number[]) => re.map((q, i) => (-Math.atan2(im[i], q) * 180) / Math.PI);
    const [pm, pp, cm, cp] = [mod(pts.re, pts.im), phase(pts.re, pts.im), mod(curve.re, curve.im), phase(curve.re, curve.im)];
    const nyq = kind === 'nyquist';
    return {
      x: nyq ? pts.re : pts.f,
      y: nyq ? pts.im.map((q) => -q) : kind === 'phase' ? pp : pm,
      cx: nyq ? curve.re : curve.f,
      cy: nyq ? curve.im.map((q) => -q) : kind === 'phase' ? cp : cm,
      p2: kind === 'bode' ? pp : null,
      c2: kind === 'bode' ? cp : null,
    };
  }, [kind, pts, curve]);
  // all the data: padded; Nyquist with equal scales (an ohm as long on both axes) and the origin
  const auto = useMemo((): View => {
    const xs = [...g.x, ...g.cx].map(tx).filter(Number.isFinite);
    const ys = [...g.y, ...g.cy].map(ty).filter(Number.isFinite);
    if (kind === 'nyquist') {
      const b = { x0: Math.min(0, ...xs), x1: Math.max(...xs), y0: Math.min(0, ...ys), y1: Math.max(...ys) };
      const s = Math.min(pw / (b.x1 - b.x0 || 1), ph / (b.y1 - b.y0 || 1)) * 0.94;
      const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
      return { x0: cx - pw / s / 2, x1: cx + pw / s / 2, y0: cy - ph / s / 2, y1: cy + ph / s / 2 };
    }
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const [dx, dy] = [x1 - x0 || 1, y1 - y0 || 1];
    return { x0: x0 - 0.03 * dx, x1: x1 + 0.03 * dx, y0: y0 - 0.08 * dy, y1: y1 + 0.08 * dy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, kind, pw, ph]);
  const box = viewBox(zbox, auto);
  // the right axis (Bode): the phase, all of it
  const q = useMemo(() => {
    if (!g.p2 || !g.c2) return [0, 1] as [number, number];
    const p0 = Math.min(0, ...g.p2, ...g.c2);
    const p1 = Math.max(10, ...g.p2, ...g.c2);
    return [p0 - 0.05 * (p1 - p0), p1 + 0.05 * (p1 - p0)] as [number, number];
  }, [g]);
  const z = usePlotZoom(zoom, { l: M.l, t: M.t, w: pw, h: ph }, box, onView);
  useEffect(() => {
    if (zoomOut) onView(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOut]);
  // value ↔ pixel (the values as they are: the logarithms taken here)
  const fx = (val: number) => M.l + ((tx(val) - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (val: number) => M.t + (1 - (ty(val) - box.y0) / (box.y1 - box.y0)) * ph;
  const ix = (p: number) => {
    const t = box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
    return logX ? 10 ** t : t;
  };
  const iy = (p: number) => {
    const t = box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
    return logY ? 10 ** t : t;
  };
  const sp = (val: number) => M.t + (1 - (val - q[0]) / (q[1] - q[0])) * ph;
  // the ranges as they are being dragged (a new one, or an edge moved)
  const ranges = d.ranges ?? [];
  const shownRanges = rdrag ? (rdrag.kind === 'new' ? [...ranges, { lo: Math.min(rdrag.a, rdrag.b), hi: Math.max(rdrag.a, rdrag.b) }] : ranges.map((r, k) => (k === rdrag.k ? (rdrag.kind === 'lo' ? { ...r, lo: rdrag.b } : { ...r, hi: rdrag.b }) : r))) : ranges;
  // Nyquist (no axis of the frequency): a range along the spectrum — its points, its ends the first and last of them
  const ends = (rg: EisRangeSpec) => {
    let [lo, hi] = [-1, -1];
    pts.f.forEach((f, i) => {
      if (!inRanges(f, [rg])) return;
      if (lo < 0 || f < pts.f[lo]) lo = i;
      if (hi < 0 || f > pts.f[hi]) hi = i;
    });
    return { lo, hi };
  };
  // the frequency under the mouse: against the frequency, the X axis; on Nyquist, of the point nearest it
  const freqAt = (p: { x: number; y: number }) => {
    if (kind !== 'nyquist') return ix(Math.min(M.l + pw, Math.max(M.l, p.x)));
    // (the band's edge follows the mouse across: the point nearest in Z′, the height breaking a tie)
    const score = (i: number) => Math.abs(fx(g.x[i]) - p.x) + 0.2 * Math.abs(fy(g.y[i]) - p.y);
    let best = 0;
    g.x.forEach((_, i) => {
      if (score(i) < score(best)) best = i;
    });
    return pts.f[best];
  };
  // a range's band on the screen: its edges (px) — against the frequency at its ends, on Nyquist at the Z′ of its
  // first (lowest frequency) and last points
  const bandOf = (rg: EisRangeSpec): [number, number] => {
    if (kind !== 'nyquist') return [fx(Math.min(rg.lo, rg.hi)), fx(Math.max(rg.lo, rg.hi))];
    const e = ends(rg);
    return e.lo < 0 ? [NaN, NaN] : [fx(g.x[e.lo]), fx(g.x[e.hi])];
  };
  // an edge of a range near the mouse: lo the edge of its lowest frequency, hi of its highest
  const edgeAt = (p: { x: number; y: number }) => {
    for (let k = 0; k < ranges.length; k++) {
      const [lo, hi] = [Math.min(ranges[k].lo, ranges[k].hi), Math.max(ranges[k].lo, ranges[k].hi)];
      const [a, b] = bandOf(ranges[k]);
      if (Math.abs(a - p.x) < 5) return { kind: 'lo' as const, k, a: lo, b: lo };
      if (Math.abs(b - p.x) < 5) return { kind: 'hi' as const, k, a: hi, b: hi };
    }
    return null;
  };
  const lab = useMemo(() => labelledPoints(pts.f, d.labels), [pts.f, d.labels]);
  const at = d.labelAt?.[lv];
  const nearest = (x: number, y: number) => {
    let best = -1;
    let bd = 9;
    g.x.forEach((xv, i) => {
      const dd = Math.min(Math.hypot(fx(xv) - x, fy(g.y[i]) - y), g.p2 ? Math.hypot(fx(xv) - x, sp(g.p2[i]) - y) : Infinity);
      if (dd < bd) [bd, best] = [dd, i];
    });
    return best;
  };
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    // the ticks: whole decades on a logarithmic axis (when it shows more than one), else even steps
    const ticks = (a: number, b: number, n: number, log: boolean) => {
      const out: number[] = [];
      if (log && Math.floor(b) - Math.ceil(a) >= 1) {
        const st = Math.max(1, Math.ceil((Math.floor(b) - Math.ceil(a) + 1) / Math.max(2, n)));
        for (let k = Math.ceil(a); k <= Math.floor(b); k += st) out.push(k);
        return out;
      }
      const st = niceStep(b - a, n);
      for (let t = Math.ceil(a / st) * st; t <= b + st * 1e-9; t += st) out.push(Math.abs(t) < st * 1e-9 ? 0 : t);
      return out;
    };
    const label = (t: number, log: boolean, freq: boolean) => (log ? (freq ? fmtFreq(10 ** t) : fmtNum(10 ** t, 3)) : fmtNum(t, 4));
    ctx.strokeStyle = '#e6e6e6';
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of ticks(box.x0, box.x1, Math.max(3, Math.round(pw / 70)), logX)) {
      const x = M.l + ((t - box.x0) / (box.x1 - box.x0)) * pw;
      if (x < M.l - 0.5 || x > M.l + pw + 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(x, M.t);
      ctx.lineTo(x, M.t + ph);
      ctx.stroke();
      ctx.fillText(label(t, logX, true), x, M.t + ph + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of ticks(box.y0, box.y1, Math.max(3, Math.round(ph / 45)), logY)) {
      const y = M.t + (1 - (t - box.y0) / (box.y1 - box.y0)) * ph;
      if (y < M.t - 0.5 || y > M.t + ph + 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(M.l, y);
      ctx.lineTo(M.l + pw, y);
      ctx.stroke();
      ctx.fillText(label(t, logY, false), M.l - 4, y);
    }
    if (g.p2) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PHASE;
      for (const t of ticks(q[0], q[1], 5, false)) if (sp(t) >= M.t - 0.5 && sp(t) <= M.t + ph + 0.5) ctx.fillText(fmtNum(t, 3), M.l + pw + 4, sp(t));
    }
    ctx.strokeStyle = '#555555';
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(kind === 'nyquist' ? "Z' (Ω)" : 'Frequency (Hz)', M.l + pw / 2, H - 1);
    const vertical = (t: string, x: number, turn: number, color: string) => {
      ctx.save();
      ctx.translate(x, M.t + ph / 2);
      ctx.rotate(turn);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(t, 0, 0);
      ctx.restore();
    };
    vertical(kind === 'nyquist' ? "−Z'' (Ω)" : kind === 'phase' ? '−phase (°)' : '|Z| (Ω)', 11, -Math.PI / 2, '#333333');
    if (g.p2) vertical('−phase (°)', W - 8, Math.PI / 2, PHASE);
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, pw, ph);
    ctx.clip();
    // the frequency ranges fitted, as in Fit: a band and its edges — against the frequency, at its ends; on Nyquist, at
    // the Z′ of its first and last points
    for (const rg of shownRanges) {
      const [a, b] = bandOf(rg);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      ctx.fillStyle = RANGE_BAND;
      ctx.fillRect(Math.min(a, b), M.t, Math.abs(b - a), ph);
      ctx.fillStyle = RANGE_EDGE;
      for (const e of [a, b]) if (e >= M.l && e <= M.l + pw) ctx.fillRect(e - 1, M.t, 2, ph);
    }
    // the fits per range: dashed, over their ranges
    v.rangeFits.forEach((rf, k) => {
      if (!rf.curve) return;
      const c = rf.curve;
      const ys = kind === 'nyquist' ? c.im.map((q) => -q) : kind === 'phase' ? c.re.map((q, i) => (-Math.atan2(c.im[i], q) * 180) / Math.PI) : c.re.map((q, i) => Math.hypot(q, c.im[i]));
      const xs = kind === 'nyquist' ? c.re : c.f;
      ctx.beginPath();
      xs.forEach((xv, i) => ctx[i ? 'lineTo' : 'moveTo'](fx(xv), fy(ys[i])));
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = RANGE_COLORS[k % RANGE_COLORS.length];
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // the fit
    const line = (ys: number[], map: (q: number) => number, color: string, dash: number[]) => {
      ctx.beginPath();
      g.cx.forEach((xv, i) => ctx[i ? 'lineTo' : 'moveTo'](fx(xv), map(ys[i])));
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(g.cy, fy, g.p2 ? DATA : FIT, []);
    if (g.c2) line(g.c2, sp, PHASE, [5, 3]);
    // the points: used (open circles), left out (grey crosses)
    const mark = (x: number, y: number, color: string, gone: boolean, square: boolean) => {
      ctx.strokeStyle = gone ? OUT : color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (gone) {
        ctx.moveTo(x - 3.5, y - 3.5);
        ctx.lineTo(x + 3.5, y + 3.5);
        ctx.moveTo(x - 3.5, y + 3.5);
        ctx.lineTo(x + 3.5, y - 3.5);
      } else if (square) ctx.rect(x - 3, y - 3, 6, 6);
      else ctx.arc(x, y, 3.2, 0, 2 * Math.PI);
      ctx.stroke();
    };
    g.x.forEach((xv, i) => {
      const gone = out.has(pts.rows[i]);
      // (outside the ranges: pale)
      const pale = !gone && v.inRange[i] === false;
      mark(fx(xv), fy(g.y[i]), pale ? '#c7c7c7' : DATA, gone, false);
      if (g.p2) mark(fx(xv), sp(g.p2[i]), pale ? '#c7c7c7' : PHASE, gone, true);
      // selected: a ring round it
      if (picked.has(pts.rows[i])) {
        ctx.strokeStyle = PICK;
        ctx.lineWidth = 2;
        for (const yv of g.p2 ? [fy(g.y[i]), sp(g.p2[i])] : [fy(g.y[i])]) {
          ctx.beginPath();
          ctx.arc(fx(xv), yv, 6.5, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    });
    // the frequencies beside the points (and their values): where they were moved, else on a free side of the point;
    // far from it, a thin line back to it
    ctx.font = '9.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const taken: Rect[] = [];
    const hit: { row: number; r: Rect }[] = [];
    const meet = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (const i of lab) {
      const [px, py] = [fx(g.x[i]), fy(g.y[i])];
      if (px < M.l || px > M.l + pw || py < M.t || py > M.t + ph) continue;
      const row = pts.rows[i];
      const t = fmtFreq(pts.f[i]);
      const val = d.values ? (kind === 'nyquist' ? `${fmtNum(pts.re[i], 4)}, ${fmtNum(-pts.im[i], 4)}` : kind === 'phase' ? `${fmtNum(g.y[i], 3)}°` : `${fmtNum(g.y[i], 4)} Ω`) : '';
      const lines = val ? [t, val] : [t];
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 4;
      const h = 11 * lines.length + 1;
      const stored = at?.[String(row)];
      let r: Rect | undefined;
      if (moving?.row === row) r = { x: moving.x, y: moving.y - h, w, h };
      else if (stored) r = { x: fx(stored[0]), y: fy(stored[1]) - h, w, h };
      else {
        const spots = [
          [px + 5, py - 4 - h],
          [px - 5 - w, py - 4 - h],
          [px + 5, py + 4],
          [px - 5 - w, py + 4],
        ].map(([x, y]) => ({ x: Math.min(M.l + pw - w - 1, Math.max(M.l + 1, x)), y: Math.min(M.t + ph - h - 1, Math.max(M.t + 1, y)), w, h }));
        r = spots.find((s) => !taken.some((o) => meet(o, s)));
      }
      if (!r) continue;
      taken.push({ x: r.x - 2, y: r.y - 1, w: r.w + 4, h: r.h + 2 });
      hit.push({ row, r });
      // (the line: from the point to the nearest place of the label, when that is far)
      const [nx, ny] = [Math.min(r.x + r.w, Math.max(r.x, px)), Math.min(r.y + r.h, Math.max(r.y, py))];
      if (Math.hypot(nx - px, ny - py) > 14) {
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
      ctx.fillStyle = moving?.row === row ? 'rgba(232, 240, 254, 0.95)' : 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = out.has(row) ? OUT : '#333333';
      lines.forEach((s, k) => ctx.fillText(s, r.x + 2, r.y + 11 * (k + 1)));
    }
    boxes.current = hit;
    ctx.restore();
    // the rectangle dragged (leave out; Shift: take back) or the zoom's
    const rect = (x0: number, y0: number, x1: number, y1: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.setLineDash([]);
    };
    if (drag) rect(drag.a.x, drag.a.y, drag.b.x, drag.b.y, drag.shift ? '#868e96' : PICK);
    if (z.rect) rect(z.rect.x0, z.rect.y0, z.rect.x1, z.rect.y1, '#1971c2');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, box, g, q, out, picked, lab, at, d.values, shownRanges, v.rangeFits, v.inRange, drag, moving, z.rect, kind, addRange]);
  const pos = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H };
  };
  const labelAt = (x: number, y: number) => boxes.current.find((b) => x >= b.r.x && x <= b.r.x + b.r.w && y >= b.r.y && y <= b.r.y + b.r.h);
  const curves: ReadCurve[] = [
    { name: kind === 'phase' ? '−phase' : kind === 'nyquist' ? 'data' : '|Z|', color: DATA, x: g.x, y: g.y },
    { name: 'fit', color: FIT, x: g.cx, y: g.cy },
    ...(g.p2 && g.c2
      ? [
          { name: '−phase', color: PHASE, x: g.x, y: g.p2, onAxis: (val: number) => iy(sp(val)) },
          { name: '−phase fit', color: PHASE, x: g.cx, y: g.c2, onAxis: (val: number) => iy(sp(val)) },
        ]
      : []),
  ];
  return (
    <div className="reader-host nodrag nowheel" style={{ position: 'relative' }}>
      <canvas
        ref={cv}
        className="eis-graph"
        tabIndex={0}
        style={{ width: W, height: H, cursor }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          const p = pos(e);
          if (z.down(p.x, p.y, e)) return;
          // an edge of a range: moved; Add a range: a new one drawn (against the frequency)
          const edge = edgeAt(p);
          if (edge) return setRdrag(edge);
          if (addRange) return setRdrag({ kind: 'new', k: -1, a: freqAt(p), b: freqAt(p) });
          const l = labelAt(p.x, p.y);
          if (l) return setMoving({ row: l.row, dx: p.x - l.r.x, dy: p.y - (l.r.y + l.r.h), x: l.r.x, y: l.r.y + l.r.h, x0: l.r.x, y0: l.r.y + l.r.h });
          setDrag({ a: p, b: p, shift: e.shiftKey });
        }}
        onPointerMove={(e) => {
          const p = pos(e);
          if (z.move(p.x, p.y)) return setCursor(zoom === 'pan' ? 'grab' : 'crosshair');
          if (rdrag) return setRdrag({ ...rdrag, b: freqAt(p) });
          if (moving) return setMoving({ ...moving, x: p.x - moving.dx, y: p.y - moving.dy });
          if (drag) return setDrag({ ...drag, b: p });
          setCursor(edgeAt(p) || addRange ? 'col-resize' : labelAt(p.x, p.y) ? 'move' : 'crosshair');
        }}
        onPointerUp={(e) => {
          const p = pos(e);
          if (z.up(p.x, p.y)) return;
          if (rdrag) {
            const r = rdrag;
            setRdrag(null);
            const r4 = (q: number) => +q.toPrecision(4);
            if (r.kind === 'new') {
              if (kind === 'nyquist' ? r.a !== r.b : Math.abs(fx(r.b) - fx(r.a)) > 3) {
                onRanges([...ranges, { lo: r4(Math.min(r.a, r.b)), hi: r4(Math.max(r.a, r.b)) }]);
                onAdded();
              }
            } else if (r.b !== r.a) onRanges(ranges.map((q, k) => (k === r.k ? (r.kind === 'lo' ? { ...q, lo: r4(r.b) } : { ...q, hi: r4(r.b) }) : q)));
            // (an end not moved, on Nyquist: a click on its point — selected)
            else if (kind === 'nyquist') {
              const i = nearest(p.x, p.y);
              if (i >= 0) onPick([pts.rows[i]], 'toggle');
            }
            return;
          }
          if (moving) {
            const m = moving;
            setMoving(null);
            // (only a real move: a click on a label leaves it)
            if (Math.hypot(m.x - m.x0, m.y - m.y0) > 1) onLabel(lv, m.row, [ix(m.x), iy(m.y)]);
            return;
          }
          const dr = drag;
          setDrag(null);
          if (!dr) return;
          // a click: the point under it selected, or no more
          if (Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y) < 4) {
            const i = nearest(dr.a.x, dr.a.y);
            if (i >= 0) onPick([pts.rows[i]], 'toggle');
            return;
          }
          // a rectangle: the points in it selected too (Shift: no more)
          const [x0, x1, y0, y1] = [Math.min(dr.a.x, dr.b.x), Math.max(dr.a.x, dr.b.x), Math.min(dr.a.y, dr.b.y), Math.max(dr.a.y, dr.b.y)];
          const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
          const rows = g.x.flatMap((xv, i) => (inside(fx(xv), fy(g.y[i])) || (g.p2 && inside(fx(xv), sp(g.p2[i]))) ? [pts.rows[i]] : []));
          if (rows.length) onPick(rows, dr.shift ? 'remove' : 'add');
        }}
        onWheel={(e) => z.wheel(pos(e).x, pos(e).y, e.deltaY, e)}
      />
      {reader.r.on && <ReaderLayer reader={{ ...reader, curves }} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />}
    </div>
  );
}

// ---- the circuit's drawing, to edit it: an element of the palette dragged onto it — on a side of an element in series
// (left, right) or in parallel (above, below) with it, on its middle in its place; an element dragged elsewhere (moved,
// its name kept; on another one's middle the two change places) or out of the drawing (deleted). Or an element clicked
// is chosen (its group: ↑) and the buttons add, replace, delete. In the options and large. ----
const PX = 4.2; // px a mm
const KINDS: [EisElemKind, string][] = [
  ['R', 'R: a resistor'],
  ['C', 'C: a capacitor'],
  ['L', 'L: an inductor'],
  ['Q', 'Q: a constant-phase element (CPE: Y0, n)'],
  ['W', 'W: semi-infinite Warburg (Y0)'],
  ['Wo', 'Wo: finite Warburg, open (R, T): a porous electrode'],
  ['Ws', 'Ws: finite Warburg, short (R, T)'],
];
const same = (a: EisPath | null, b: EisPath) => !!a && a.length === b.length && a.every((v, k) => v === b[k]);
type MmBox = { x0: number; y0: number; x1: number; y1: number };
type Drop = { path: EisPath; side: EisSide; box: MmBox } | { del: true } | null;
type Marker = 'split' | 'join';
type Drag = { what: EisElemKind | { id: string; path: EisPath } | { marker: Marker }; sx: number; sy: number; x: number; y: number; moved: boolean };
// the place under the mouse (mm on the drawing): the element there (the side or the middle), else the smallest group
// around it, else the whole circuit (a side)
function dropAt(dr: CircuitDrawing, x: number, y: number): Drop {
  const inside = (b: MmBox) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  const side = (b: MmBox, middle: boolean): EisSide => {
    const dx = (x - (b.x0 + b.x1) / 2) / ((b.x1 - b.x0) / 2 || 1);
    const dy = (y - (b.y0 + b.y1) / 2) / ((b.y1 - b.y0) / 2 || 1);
    if (middle && Math.abs(dx) < 0.4 && Math.abs(dy) < 0.45) return 'center';
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
  };
  const el = dr.elems.find(inside);
  if (el) return { path: el.path, side: side(el, true), box: el };
  const area = (b: MmBox) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const g = dr.groups.filter(inside).sort((a, b) => area(a) - area(b))[0];
  if (g) return { path: g.path, side: side(g, false), box: g };
  const all = { x0: 1, y0: 1, x1: dr.w - 1, y1: dr.h - 1 };
  return { path: [], side: side(all, false), box: all };
}
export function CircuitEditor({ code, onCode }: { code: string; onCode: (c: string) => void }) {
  const parsed = useMemo(() => parseCircuit(code), [code]);
  const tree = typeof parsed === 'object' ? parsed.tree : null;
  const [sel, setSel] = useState<EisPath | null>(null);
  const [kind, setKind] = useState<EisElemKind>('R');
  const [undo, setUndo] = useState<string[]>([]);
  const [big, setBig] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // a parallel split and join put on elements (their ids); both on one line: the new branch waits for its element
  const [marks, setMarks] = useState<Partial<Record<Marker, string>>>({});
  const [markWarn, setMarkWarn] = useState('');
  const range = tree && marks.split && marks.join ? rangeOf(tree, marks.split, marks.join) : null;
  const pending = range && typeof range === 'object' ? range : null;
  const shownTree = useMemo(() => (tree && pending ? withBranch(tree, pending, { t: 'elem', e: { kind: 'R', id: SLOT_ID, params: [] } }) : tree), [tree, pending]);
  const dr = useMemo(() => (shownTree ? drawCircuit(shownTree, undefined, SLOT_ID) : null), [shownTree]);
  const marking = !!(marks.split || marks.join);
  useEffect(() => {
    if (!marking) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMarks({});
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [marking]);
  // the code written back: with only the kinds when they number the same (R(RQ)), else with the numbers (R1(R3Q1))
  const write = (t: EisTree | null) => {
    if (!t) return '';
    const plain = writeCircuit(t, false);
    const again = parseCircuit(plain);
    return typeof again === 'object' && elemsOf(again.tree).every((e, k) => e.id === elemsOf(t)[k]?.id) ? plain : writeCircuit(t, true);
  };
  // a new circuit: kept for Undo, the element added or moved chosen
  const commit = (next: EisTree | null, chosen?: string) => {
    setMarks({});
    setMarkWarn('');
    setUndo((u) => [...u.slice(-29), code]);
    onCode(write(next));
    const id = chosen ?? (next ? elemsOf(next).find((e) => !(tree ? elemsOf(tree) : []).some((o) => o.id === e.id))?.id : undefined);
    setSel(next && id ? elemPath(next, id) : null);
  };
  const apply = (op: EisEdit) => commit(editCircuit(tree, sel ?? [], op, kind), op === 'delete' ? '' : undefined);
  // the drop under the mouse: on a drawing (the panel's or the large one: the one on top there), else out of them
  const dropOf = (d: Drag): Drop => {
    const svg = (document.elementFromPoint(d.x, d.y) as Element | null)?.closest('svg.eis-schematic');
    if (!svg) return typeof d.what === 'string' || 'marker' in d.what ? null : { del: true };
    if (!dr) return { path: [], side: 'center', box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
    const r = svg.getBoundingClientRect();
    return dropAt(dr, ((d.x - r.left) / r.width) * dr.w, ((d.y - r.top) / r.height) * dr.h);
  };
  const drop = drag?.moved ? dropOf(drag) : null;
  // the drag followed on the whole window from the press (from the palette to the drawing; the listeners there at once,
  // before a quick move); a click without a move: chosen
  const start = (what: Drag['what'], e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let cur: Drag = { what, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    setDrag(cur);
    const at = (ev: PointerEvent): Drag => ({ ...cur, x: ev.clientX, y: ev.clientY, moved: cur.moved || Math.hypot(ev.clientX - cur.sx, ev.clientY - cur.sy) > 4 });
    const move = (ev: PointerEvent) => {
      cur = at(ev);
      setDrag(cur);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const d = at(ev);
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      if (typeof d.what === 'object' && 'marker' in d.what) {
        // a split or join put on an element (both on one line: the branch made; else said why)
        const p = d.moved ? dropOf(d) : null;
        const on = p && !('del' in p) ? dr?.elems.find((q) => same(p.path, q.path) && q.id !== SLOT_ID)?.id : undefined;
        if (!on || !tree) return;
        const next = { ...marks, [d.what.marker]: on };
        const rg = next.split && next.join ? rangeOf(tree, next.split, next.join) : null;
        if (typeof rg === 'string') {
          setMarkWarn(rg);
          return setMarks({ [d.what.marker]: on });
        }
        setMarkWarn('');
        return setMarks(next);
      }
      if (!d.moved) return typeof d.what === 'string' ? setKind(d.what) : setSel(d.what.path);
      const p = dropOf(d);
      if (!p) return;
      // the new branch waiting: an element dropped on it (only there)
      if (pending && tree) {
        if ('del' in p || dr?.elems.find((q) => same(p.path, q.path))?.id !== SLOT_ID) return;
        if (typeof d.what === 'string') setKind(d.what);
        return commit(withBranch(tree, pending, typeof d.what === 'string' ? d.what : { id: d.what.id }), typeof d.what === 'string' ? undefined : d.what.id);
      }
      if ('del' in p) return typeof d.what === 'string' ? undefined : commit(editCircuit(tree, d.what.path, 'delete', 'R'), '');
      if (typeof d.what === 'string') {
        setKind(d.what);
        return commit(dropInto(tree, p.path, p.side, d.what));
      }
      commit(dropInto(tree, p.path, p.side, { id: d.what.id }), d.what.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const chosen = tree ? sel : null;
  const what = !tree ? 'the circuit is empty: drag an element onto the drawing' : !chosen ? 'nothing (the buttons: the whole circuit)' : chosen.length === 0 ? 'the whole circuit' : (dr?.elems.find((q) => same(chosen, q.path))?.id ?? 'a group');
  const moving = drag && typeof drag.what !== 'string' && 'id' in drag.what ? drag.what.id : '';
  const markBox = (id: string | undefined) => (id ? dr?.elems.find((q) => q.id === id) : undefined);
  // the place shown under the mouse: a split on the left of the element, a join on its right; the new branch waiting:
  // only it
  const dragMarker = drag && typeof drag.what === 'object' && 'marker' in drag.what ? drag.what.marker : null;
  const onElem = drop && !('del' in drop) ? dr?.elems.find((q) => same(drop.path, q.path)) : undefined;
  const shownDrop: { box: MmBox; side: EisSide } | null = !drop || 'del' in drop ? null : dragMarker ? (onElem && onElem.id !== SLOT_ID ? { box: onElem, side: dragMarker === 'split' ? 'left' : 'right' } : null) : pending ? (onElem?.id === SLOT_ID ? { box: onElem, side: 'center' } : null) : drop;
  const bar = (b: MmBox, s: EisSide) => {
    const [x1, y1, x2, y2] = s === 'left' ? [b.x0, b.y0, b.x0, b.y1] : s === 'right' ? [b.x1, b.y0, b.x1, b.y1] : s === 'top' ? [b.x0, b.y0, b.x1, b.y0] : [b.x0, b.y1, b.x1, b.y1];
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1971c2" strokeWidth={0.7} strokeLinecap="round" />;
  };
  const board = (scale: number) => (
    <svg
      className={`eis-schematic nodrag${drag?.moved ? ' dropping' : ''}`}
      width="100%"
      style={{ maxWidth: (dr?.w ?? 60) * scale }}
      viewBox={dr ? `0 0 ${dr.w} ${dr.h}` : '0 0 60 14'}
      onClick={(e) => e.target === e.currentTarget && setSel(null)}
      onDragStart={(e) => e.preventDefault()}
    >
      {!dr && (
        <text x={30} y={8} fontSize={2.6} textAnchor="middle" fill="#888888" fontFamily="system-ui, sans-serif">
          drag an element here
        </text>
      )}
      {dr && (
        <>
          {dr.groups.map((q) => same(chosen, q.path) && <rect key={q.path.join('.')} x={q.x0} y={q.y0} width={q.x1 - q.x0} height={q.y1 - q.y0} rx={0.8} fill="rgba(25, 113, 194, 0.08)" stroke="#1971c2" strokeWidth={0.25} strokeDasharray="1 0.6" />)}
          {dr.elems.map((q) => (
            <rect
              key={q.id}
              x={q.x0}
              y={q.y0}
              width={q.x1 - q.x0}
              height={q.y1 - q.y0}
              rx={0.6}
              fill={moving === q.id ? 'rgba(0, 0, 0, 0.06)' : same(chosen, q.path) ? 'rgba(25, 113, 194, 0.16)' : 'transparent'}
              stroke={same(chosen, q.path) ? '#1971c2' : 'none'}
              strokeWidth={0.25}
              style={{ cursor: q.id === SLOT_ID ? 'copy' : 'grab' }}
              onPointerDown={(e) => q.id !== SLOT_ID && start({ id: q.id, path: q.path }, e)}
            >
              <title>{q.id === SLOT_ID ? 'The new branch: drop an element here' : `${q.id}: drag it to move it (out of the drawing: deleted), click to choose it`}</title>
            </rect>
          ))}
          <g pointerEvents="none" fill="none" stroke="#222222" strokeWidth={0.3} strokeLinejoin="round" strokeLinecap="round" opacity={moving ? 0.85 : 1}>
            {dr.pieces.map((q, k) => (
              <path key={k} d={q.d} strokeDasharray={q.dash ? '0.8 0.5' : undefined} stroke={q.dash ? '#1971c2' : undefined} />
            ))}
          </g>
          <g pointerEvents="none" fill="#222222" fontFamily="system-ui, sans-serif">
            {dr.texts.map((t, k) => (
              <text key={k} x={t.x} y={t.y} fontSize={t.size * 0.3528} textAnchor="middle" dominantBaseline={t.anchor === 'bc' ? 'text-after-edge' : t.anchor === 'tc' ? 'text-before-edge' : 'central'}>
                {t.text}
              </text>
            ))}
          </g>
          {(['split', 'join'] as const).map((m) => {
            const b = !pending && markBox(marks[m]);
            return b && <g key={m} pointerEvents="none">{bar(b, m === 'split' ? 'left' : 'right')}<text x={m === 'split' ? b.x0 : b.x1} y={b.y0 + 0.4} fontSize={2.4} textAnchor="middle" dominantBaseline="text-after-edge" fill="#1971c2">{m === 'split' ? '⑂' : '⑃'}</text></g>;
          })}
          {shownDrop && (
            <g pointerEvents="none">
              <rect x={shownDrop.box.x0} y={shownDrop.box.y0} width={shownDrop.box.x1 - shownDrop.box.x0} height={shownDrop.box.y1 - shownDrop.box.y0} rx={0.6} fill={shownDrop.side === 'center' ? 'rgba(25, 113, 194, 0.18)' : 'none'} stroke="#1971c2" strokeWidth={0.2} strokeDasharray="0.8 0.5" />
              {shownDrop.side !== 'center' && bar(shownDrop.box, shownDrop.side)}
            </g>
          )}
        </>
      )}
    </svg>
  );
  const tools = (scale: number) => (
    <>
      <div className="row wrap">
        {KINDS.map(([k, t]) => (
          <button key={k} className={`nodrag mono eis-chip${kind === k ? ' on' : ''}`} title={`${t}: drag it onto the drawing (or click: the element of the buttons)`} onPointerDown={(e) => start(k, e)}>
            {k}
          </button>
        ))}
        <button className={`nodrag eis-chip${marks.split ? ' on' : ''}`} title="Parallel split: drag it onto the first element of the new parallel branch (it goes on its left); then the join onto the last one" onPointerDown={(e) => start({ marker: 'split' }, e)}>
          ⑂ split
        </button>
        <button className={`nodrag eis-chip${marks.join ? ' on' : ''}`} title="Parallel join: drag it onto the last element of the new parallel branch (it goes on its right), on the same line as the split" onPointerDown={(e) => start({ marker: 'join' }, e)}>
          ⑃ join
        </button>
        <span className="grow" />
        {scale === PX && (
          <button className="nodrag" title="The circuit's drawing large, to build it" onClick={() => setBig(true)}>
            <Maximize2 {...IC} /> Large
          </button>
        )}
      </div>
      <div className="row wrap">
        <button className="nodrag" title={`${kind} in series with the part chosen (none: with the whole circuit)`} onClick={() => apply('series')}>
          + series
        </button>
        <button className="nodrag" disabled={!tree} title={`${kind} in parallel with the part chosen (none: with the whole circuit)`} onClick={() => apply('parallel')}>
          + parallel
        </button>
        <button className="nodrag" disabled={!tree || !sel} title={`The part chosen replaced by ${kind}`} onClick={() => apply('replace')}>
          Replace
        </button>
        <button className="nodrag" disabled={!tree || !sel} title="The part chosen deleted" onClick={() => apply('delete')}>
          <Trash2 {...IC} /> Delete
        </button>
        <button className="nodrag" disabled={!sel?.length} title="Choose the group the part is in" onClick={() => setSel(sel ? sel.slice(0, -1) : null)}>
          <ArrowUpLeft {...IC} /> Group
        </button>
        <button
          className="nodrag"
          disabled={!undo.length}
          title="Undo the last change of the circuit"
          onClick={() => {
            setMarks({});
            onCode(undo[undo.length - 1]);
            setUndo(undo.slice(0, -1));
            setSel(null);
          }}
        >
          <Undo2 {...IC} /> Undo
        </button>
      </div>
      {marking ? (
        <div className="hint ok">
          {pending ? 'The new parallel branch: drop an element on “drop here” (then more on its sides).' : marks.split ? `Split on the left of ${marks.split}: now drag the join onto the last element of the branch (the same line).` : `Join on the right of ${marks.join}: now drag the split onto the first element of the branch (the same line).`}{' '}
          <button className="nodrag" title="The split and join taken off (Esc)" onClick={() => setMarks({})}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="hint">Drag an element onto the drawing: on a side of an element; in series (left, right) or in parallel (above, below) with it; on its middle: in its place. Drag one already there to move it, out of the drawing to delete it. ⑂ split and ⑃ join around elements of a line: a parallel branch for them. Chosen: {what}.</div>
      )}
      {markWarn && <div className="msg warn">{markWarn}</div>}
      {board(scale)}
    </>
  );
  // what is dragged, by the mouse (and where it goes: deleted)
  const ghost =
    drag?.moved &&
    createPortal(
      <div className={`eis-ghost mono${drop && 'del' in drop ? ' del' : ''}`} style={{ left: drag.x + 12, top: drag.y + 10 }}>
        {typeof drag.what === 'string' ? drag.what : 'id' in drag.what ? drag.what.id : drag.what.marker === 'split' ? '⑂ split' : '⑃ join'}
        {drop && 'del' in drop ? ': delete' : !shownDrop ? ': not here' : ''}
      </div>,
      document.body,
    );
  return (
    <div className="eis-editor">
      {tools(PX)}
      {ghost}
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big node-eis eis-editor eis-editor-big">
              <div className="row">
                <TextInput className="mono" value={code} placeholder="R(RQ)" onChange={onCode} />
              </div>
              {tools(Math.min(16, ((window.innerWidth || 1200) * 0.8) / (dr?.w ?? 60)))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const roleNote = (by: 'name' | 'place' | 'chosen' | undefined) => (by === 'place' ? <span className="warn-text"> chosen by its place: check</span> : by === 'name' ? <span className="muted"> (from its name)</span> : null);
const firstValues = (vals: number[] | undefined) => (vals?.length ? `${vals.map((q) => fmtNum(q, 4)).join(', ')} …` : '');

export function EisNodeView({ id, data }: NodeProps<EisNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const d = data;
  const set = (p: Partial<EisData>) => updateNodeData(id, p);
  const [big, setBig] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [box, setBox] = useState<View | null>(null);
  const [outN, setOutN] = useState(0);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const v = r?.view.eis;
  const kind: Kind = d.view ?? 'nyquist';
  // the columns as they are shown (a column without a name: its letter) and chosen (by name, or #k by its place)
  const colList: [string, string][] = v?.colNames ?? (r?.view.available ?? []).map((c, k): [string, string] => [c.name.trim() ? c.name : `#${k}`, c.name.trim() && c.name.trim() !== columnLetter(k) ? `${columnLetter(k)} · ${c.name}` : columnLetter(k)]);
  const labelOf = (key: string | undefined) => colList.find(([k]) => k === key)?.[1] ?? key;
  // the points selected on the graph (rows), then left out of the fit or taken back with the buttons
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const pick = (rows: number[], how: 'toggle' | 'add' | 'remove') =>
    setPicked((p) => {
      const n = new Set(p);
      for (const k of rows) {
        if (how === 'remove' || (how === 'toggle' && n.has(k))) n.delete(k);
        else n.add(k);
      }
      return n;
    });
  const leaveOut = (out: boolean) => {
    const ex = new Set(d.excluded);
    for (const k of picked) {
      if (out) ex.add(k);
      else ex.delete(k);
    }
    set({ excluded: [...ex].sort((a, b) => a - b) });
    setPicked(new Set());
  };
  const pickedOut = [...picked].filter((k) => d.excluded.includes(k)).length;
  // the frequency ranges fitted: + Range drags one on the graph (or typed in the options); each fitted on its own too
  const [addRange, setAddRange] = useState(false);
  const ranges = d.ranges ?? [];
  const setRanges = (rs: EisRangeSpec[]) => set({ ranges: rs.length ? rs : undefined });

  // the fit at every change, or on Start fit (the settings kept then)
  const auto = d.autoFit !== false;
  const startFit = () => set({ fitWith: fitSettingsOf(d) });
  // a range's values as the starts of the whole circuit (its parameters of the same names)
  const takeStarts = (k: number) => {
    const rf = v?.rangeFits[k];
    if (!rf?.params) return;
    const names = new Set((v?.params ?? []).map((q) => q.name));
    const got = rf.params.filter((q) => names.has(q.name));
    set({ params: [...d.params.filter((q) => !got.some((g) => g.name === q.name)), ...got.map((q) => ({ name: q.name, value: q.value, ...(d.params.find((x) => x.name === q.name)?.fixed ? { fixed: true } : {}) }))] });
  };
  const fitRow = (
    <div className="row wrap">
      <button
        className={`nodrag${addRange ? ' on' : ''}`}
        title="Then drag on the graph: one fit range (only the points inside the ranges are fitted; on Nyquist: from a point along the spectrum to another); the button turns off after it. The edges of a range can be dragged at any time (on Nyquist: the squares at its ends)"
        onClick={() => {
          setAddRange(!addRange);
          setZoom('none');
          setRd((q) => ({ ...q, on: false }));
        }}
      >
        <MoveHorizontal {...IC} /> Add a range
      </button>
      {ranges.length > 0 && (
        <button className="nodrag" title="No ranges: every point fitted" onClick={() => setRanges([])}>
          All frequencies
        </button>
      )}
      {ranges.map((rg, k) => (
        <span key={k} className="chip" title={rg.circuit ? `fitted on its own with ${rg.circuit}` : undefined}>
          {rangeText(rg)}
          <button className="nodrag ts-btn" title="This range taken off" onClick={() => setRanges(ranges.filter((_, j) => j !== k))}>
            <X {...IC} />
          </button>
        </span>
      ))}
      <span className="grow" />
      <Check label="Auto fit" title="The fit at every change; off: only on Start fit (the result stays until then)" value={auto} onChange={(on) => set(on ? { autoFit: undefined, fitWith: undefined } : { autoFit: false, fitWith: fitSettingsOf(d) })} />
      {!auto && (
        <button className={`nodrag btn-run${v?.outdated || v?.fittedYet === false ? ' on' : ''}`} title="Fit the circuit now, with the settings as they are" onClick={startFit}>
          <Play {...IC} /> Start fit
        </button>
      )}
    </div>
  );
  useEffect(() => {
    if (!addRange) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setAddRange(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [addRange]);
  // the fitted values on the circuit's figure: each a text of the node's own (so it can be dragged there)
  const missingValues = d.circuitValues ? (v?.valueTexts ?? []).filter((t) => !d.annotations?.some((a) => a.id === t.id)) : [];
  useEffect(() => {
    if (missingValues.length) updateNodeData(id, { annotations: [...(d.annotations ?? []), ...missingValues.map((t): AnnotationItem => ({ id: t.id, type: 'text', spec: { x: t.x, y: t.y } }))] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingValues.map((t) => t.id).join()]);
  const moveLabel = (view: EisLabelView, row: number, at: [number, number]) => set({ labelAt: { ...d.labelAt, [view]: { ...d.labelAt?.[view], [String(row)]: at } } });
  const lv = labelView(kind);
  const moved = Object.keys(d.labelAt?.[lv] ?? {}).length;
  // a start changed: written for that parameter (the others keep theirs, guessed or written)
  const setStart = (name: string, p: Partial<EisParam>) => {
    const list = v?.starts ?? d.params;
    const cur = list.find((q) => q.name === name) ?? { name, value: NaN };
    set({ params: [...d.params.filter((q) => q.name !== name), { ...cur, ...p }] });
  };
  const colOpts = (gKey?: string): [string, string][] => [['', `auto${gKey ? `: ${labelOf(gKey)}` : ''}`], ...colList];
  const viewBtn = (k: Kind, label: string, title: string) => (
    <button className={`nodrag${kind === k ? ' on' : ''}`} title={title} onClick={() => {
        set({ view: k });
        // (another graph: all of its data)
        setBox(null);
      }}>
      {label}
    </button>
  );
  const tools = (
    <>
      <div className="row wrap">
        {viewBtn('nyquist', 'Nyquist', 'Nyquist: −Z″ against Z′ (equal scales)')}
        {viewBtn('mod', '|Z|', 'Bode, the modulus: |Z| against the frequency')}
        {viewBtn('phase', 'Phase', 'Bode, the phase: −phase against the frequency')}
        {viewBtn('bode', 'Bode', 'Bode: |Z| (left) and −phase (right) against the frequency')}
        <Select<EisData['labels']>
          value={d.labels}
          title="The frequencies written beside the points"
          options={[
            ['decades', 'f: a decade'],
            ['all', 'f: every point'],
            ['none', 'f: none'],
          ]}
          onChange={(labels) => set({ labels })}
        />
        <Check label="Values" title="The values (Z′, −Z″; |Z|; the phase) under the frequencies" value={!!d.values} onChange={(values) => set({ values })} />
        <button className="nodrag" disabled={!moved} title="The frequencies of this graph back beside their points" onClick={() => set({ labelAt: { ...d.labelAt, [lv]: undefined } })}>
          <RefreshCw {...IC} /> Labels
        </button>
        <button className="nodrag" disabled={!d.excluded.length} title="Every point back in the fit" onClick={() => set({ excluded: [] })}>
          Restore all{d.excluded.length ? ` (${d.excluded.length})` : ''}
        </button>
      </div>
      <div className="row wrap">
        <span className="muted">Selected: {picked.size}</span>
        <button className="nodrag" disabled={picked.size === pickedOut} title="The points selected on the graph left out of the fit (grey ×)" onClick={() => leaveOut(true)}>
          <Trash2 {...IC} /> Leave out selected
        </button>
        <button className="nodrag" disabled={!pickedOut} title="The points selected taken back into the fit" onClick={() => leaveOut(false)}>
          Take back selected
        </button>
        <button className="nodrag" disabled={!picked.size} title="No point selected" onClick={() => setPicked(new Set())}>
          Clear selection
        </button>
      </div>
      {fitRow}
      <div className="row wrap">
        <ZoomTools
          mode={zoom}
          setMode={(m) => {
            setZoom(m);
            if (m !== 'none') {
              setRd((q) => ({ ...q, on: false }));
              setAddRange(false);
            }
          }}
          onRescale={() => setBox(null)}
          onRescaleAxis={(w) => setBox((b) => rescaleAxis(b, w))}
          onZoomOut={() => setOutN((n) => n + 1)}
          zoomed={!!box}
        />
        <ReaderButton
          r={rd}
          set={setRd}
          onOn={() => {
            setZoom('none');
            setAddRange(false);
          }}
        />
        <span className="grow" />
        <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
    </>
  );
  const readerRow = <ReaderOptions r={rd} set={setRd} names={kind === 'bode' ? ['|Z|', 'fit', '−phase', '−phase fit'] : ['data', 'fit']} />;
  const graph = (W: number, H: number) => (v ? <EisGraph v={v} d={d} kind={kind} W={W} H={H} zoom={zoom} box={box} onView={setBox} zoomOut={outN} reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }} picked={picked} onPick={pick} onLabel={moveLabel} addRange={addRange && zoom === 'none'} onRanges={setRanges} onAdded={() => setAddRange(false)} /> : null);
  const polar = d.form === 'polar';
  const stats = v && (
    <>
      {v.n} points fitted{d.excluded.length ? `, ${d.excluded.length} left out` : ''}; χ² = {fmtNum(v.chi2, 4)}, reduced χ² = {fmtNum(v.redChi2, 4)}; R² = {fmtNum(v.r2.all, 6)} (Z′ {fmtNum(v.r2.re, 5)}, Z″ {fmtNum(v.r2.im, 5)})
    </>
  );
  const circuitPage = { ...DRAWING_DEFAULTS, name: 'circuit', ...d.circuitPage, width: 1, height: 1, background: d.circuitBg ?? 'white' };
  return (
    <div className="node node-eis">
      <InPort label="spectrum" port="dataset" id="in" title="The impedance spectrum: a dataset (or a sheet of a workbook): the frequency, Z′ and Z″ (or −Z″), or |Z| and the phase; the columns chosen in the options by their role" />
      <NodeOptions>
        <details open>
          <summary>Columns</summary>
          <div className="hint">What each column holds: guessed from the names; choose another when they say otherwise (or say nothing: A, B, C).</div>
          <Field label="Data">
            <Select<EisData['form']>
              value={d.form}
              options={[
                ['reim', 'Z′ and Z″'],
                ['polar', '|Z| and the phase'],
              ]}
              onChange={(form) => set({ form, re: '', im: '' })}
            />
          </Field>
          <div className="eis-role">
            <div className="row wrap">
              <span>Frequency column</span>
              <Select<string> value={d.freq} options={colOpts(v?.cols.freq)} onChange={(freq) => set({ freq })} />
              <span>in</span>
              <Select<EisData['freqUnit']> seg
                value={d.freqUnit}
                title="The column holds f (Hz) or the angular frequency ω = 2πf (rad/s)"
                options={[
                  ['Hz', 'Hz (f)'],
                  ['rad/s', 'rad/s (ω)'],
                ]}
                onChange={(freqUnit) => set({ freqUnit })}
              />
            </div>
            {v && (
              <div className="hint mono">
                {firstValues(v.preview.freq)}
                {roleNote(v.by.freq)}
              </div>
            )}
            {v?.angular && (
              <div className="msg warn">
                These look like ω = 2πf ({fmtNum(v.preview.freq[0], 6)} = 2π · {fmtNum(v.preview.freq[0] / (2 * Math.PI), 4)}).{' '}
                <button className="nodrag" onClick={() => set({ freqUnit: 'rad/s' })}>
                  Read as rad/s
                </button>
              </div>
            )}
          </div>
          <div className="eis-role">
            <div className="row wrap">
              <span>{polar ? '|Z| (modulus) column' : 'Z′ (real part) column'}</span>
              <Select<string> value={d.re} options={colOpts(v?.cols.a)} onChange={(re) => set({ re })} />
            </div>
            {v && (
              <div className="hint mono">
                {firstValues(v.preview.a)}
                {roleNote(v.by.a)}
              </div>
            )}
          </div>
          <div className="eis-role">
            <div className="row wrap">
              <span>{polar ? 'Phase (°) column' : 'Imaginary column'}</span>
              <Select<string> value={d.im} options={colOpts(v?.cols.b)} onChange={(im) => set({ im })} />
              <span>{polar ? 'of' : 'contains'}</span>
              <Select<EisData['imSign']>
                value={d.imSign}
                title="The column holds Z″ (negative for a capacitive arc) or −Z″ (positive); auto: from its values"
                options={[
                  ['auto', 'auto (from the values)'],
                  ['neg', polar ? '−Z' : '−Z″'],
                  ['pos', polar ? 'Z' : 'Z″'],
                ]}
                onChange={(imSign) => set({ imSign })}
              />
            </div>
            {v && (
              <div className="hint mono">
                {firstValues(v.preview.b)}
                {roleNote(v.by.b)}
              </div>
            )}
          </div>
          {v?.signNote && <div className="hint ok">{v.signNote}</div>}
        </details>
        <details open>
          <summary>Circuit</summary>
          <div className="row wrap">
            <Select<string> value={EIS_CIRCUITS.some(([c]) => c === d.circuit.replace(/\s+/g, '')) ? d.circuit.replace(/\s+/g, '') : ''} options={[['', 'custom (the code / the drawing)'], ...EIS_CIRCUITS]} onChange={(circuit) => circuit && set({ circuit })} />
            <Field label="Code" title="Boukamp’s code: elements in series one after another, ( ) a parallel group, [ ] a series group inside it: R(RQ), R(Q[RW]), R(RQ)(RQ); R, C, L, Q (CPE), W, Wo, Ws; numbers keep a name (R1(R3Q1))">
              <TextInput className="mono" value={d.circuit} placeholder="R(RQ)" onChange={(circuit) => set({ circuit })} />
            </Field>
          </div>
          {(() => {
            const p = parseCircuit(d.circuit);
            return typeof p === 'string' && d.circuit.trim() ? <div className="msg warn">{p}</div> : null;
          })()}
          <CircuitEditor code={d.circuit} onCode={(circuit) => set({ circuit })} />
          {v?.circuit && (
            <>
              <div className="row wrap">
                <Field label="Figure" title="The circuit's figure (the “circuit” output: to a Figure Drawing, an inset or a Merge): its page white or transparent">
                  <Select<'white' | 'none'> seg
                    value={d.circuitBg ?? 'white'}
                    options={[
                      ['white', 'white page'],
                      ['none', 'transparent'],
                    ]}
                    onChange={(circuitBg) => set({ circuitBg })}
                  />
                </Field>
                <Check label="Fitted values" title="The fitted values written under the elements: drag them on the figure to move them" value={!!d.circuitValues} onChange={(circuitValues) => set({ circuitValues })} />
                {d.circuitValues && (
                  <button className="nodrag" disabled={!d.annotations?.length} title="The fitted values back under their elements (as they were first drawn)" onClick={() => set({ annotations: undefined })}>
                    <RefreshCw {...IC} /> Values
                  </button>
                )}
              </div>
              <FigureView fig={v.circuit} width={300} maxHeight={220} page={circuitPage} setPage={(p) => set({ circuitPage: { ...d.circuitPage, ...(p.name !== undefined ? { name: p.name } : {}), ...(p.dpi !== undefined ? { dpi: p.dpi } : {}) } })} layoutTitle="" noAxes />
            </>
          )}
        </details>
        <details open>
          <summary>Fit ranges</summary>
          <div className="hint">The frequencies fitted: none, every point; or ranges (+ Range on the graph, or typed here). A fit per range: each range fitted on its own, with a circuit of its own (empty: the node’s), to find starts for the whole circuit.</div>
          {ranges.length > 0 && (
            <table className="preview-table eis-params">
              <thead>
                <tr>
                  <th>From (Hz)</th>
                  <th>To (Hz)</th>
                  {d.rangeFits && <th>Circuit</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {ranges.map((rg, k) => (
                  <tr key={k}>
                    <td>
                      <NumInput className="short" value={rg.lo} onChange={(lo) => Number.isFinite(lo) && lo > 0 && setRanges(ranges.map((q, j) => (j === k ? { ...q, lo } : q)))} />
                    </td>
                    <td>
                      <NumInput className="short" value={rg.hi} onChange={(hi) => Number.isFinite(hi) && hi > 0 && setRanges(ranges.map((q, j) => (j === k ? { ...q, hi } : q)))} />
                    </td>
                    {d.rangeFits && (
                      <td>
                        <TextInput className="mono" value={rg.circuit ?? ''} placeholder={d.circuit.replace(/\s+/g, '')} onChange={(circuit) => setRanges(ranges.map((q, j) => (j === k ? { ...q, circuit: circuit || undefined } : q)))} />
                      </td>
                    )}
                    <td>
                      <button className="nodrag ts-btn" title="This range taken off" onClick={() => setRanges(ranges.filter((_, j) => j !== k))}>
                        <X {...IC} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row wrap">
            <button className={`nodrag${addRange ? ' on' : ''}`} title="Then drag on the graph: one fit range; the button turns off after it" onClick={() => setAddRange(!addRange)}>
              <MoveHorizontal {...IC} /> Add a range
            </button>
            <button className="nodrag" title="A range typed: the whole spectrum, to change" onClick={() => v && setRanges([...ranges, { lo: +Math.min(...v.pts.f).toPrecision(4), hi: +Math.max(...v.pts.f).toPrecision(4) }])}>
              + Typed
            </button>
            <button className="nodrag" disabled={!ranges.length} title="No ranges: every point fitted" onClick={() => setRanges([])}>
              All frequencies
            </button>
            <Check label="A fit per range" title="Each range fitted on its own too (its own circuit), drawn dashed over it; its values can become the starts of the whole circuit" value={!!d.rangeFits} onChange={(rangeFits) => set({ rangeFits: rangeFits || undefined })} />
          </div>
          {v?.rangeFits.map((rf, k) => (
            <div key={k} className="eis-rangefit">
              <div className="row wrap">
                <span className="chip" style={{ borderColor: RANGE_COLORS[k % RANGE_COLORS.length] }}>
                  {rangeText(rf.range)} · {rf.circuit}
                </span>
                {rf.params ? (
                  <>
                    <span className="muted">
                      {rf.n} points, R² {fmtNum(rf.r2 ?? NaN, 5)}
                    </span>
                    <button className="nodrag" title="These values as the starts of the whole circuit (its parameters of the same names)" onClick={() => takeStarts(k)}>
                      Use as starts
                    </button>
                  </>
                ) : (
                  <span className="warn-text">{rf.error}</span>
                )}
              </div>
              {rf.params && <div className="hint mono">{rf.params.map((q) => `${q.name} = ${fmtNum(q.value, 4)}${q.unit ? ` ${q.unit}` : ''}`).join(' · ')}</div>}
            </div>
          ))}
        </details>
        <details open>
          <summary>Parameters</summary>
          <div className="row wrap">
            <button className="nodrag" title="Every start guessed from the data again (the intercepts, the apex of the arc)" onClick={() => set({ params: d.params.filter((q) => q.fixed).map((q) => ({ ...q })) })}>
              Guess from data
            </button>
            <button className="nodrag" disabled={!v} title="The fitted values as the starts (a next fit starts from them)" onClick={() => v && set({ params: v.params.map((q) => ({ name: q.name, value: q.value, ...(q.fixed ? { fixed: true } : {}) })) })}>
              Use the fit as start
            </button>
            <Field label="Weights" title="Each residual divided by |Z| (modulus), by its own part (proportional), or not at all (unit)">
              <Select<EisData['weight']>
                value={d.weight}
                options={[
                  ['modulus', 'modulus |Z|'],
                  ['proportional', 'proportional'],
                  ['unit', 'unit'],
                ]}
                onChange={(weight) => set({ weight })}
              />
            </Field>
          </div>
          {v && (
            <div className="nowheel" style={{ overflowX: 'auto' }}>
              <table className="preview-table eis-params">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Start</th>
                    <th>Fixed</th>
                    <th>Fitted</th>
                    <th>± (SE)</th>
                    <th>%</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {v.params.map((q, k) => {
                    const st = v.starts[k];
                    const stored = d.params.find((s) => s.name === q.name);
                    return (
                      <tr key={q.name}>
                        <td className="mono">{q.name}</td>
                        <td>
                          <NumInput className="short" value={stored?.value ?? NaN} placeholder={Number.isFinite(st?.value) ? fmtNum(st.value, 4) : 'guess'} onChange={(value) => setStart(q.name, { value })} />
                        </td>
                        <td>
                          <input className="nodrag" type="checkbox" checked={!!q.fixed} onChange={(e) => setStart(q.name, { fixed: e.target.checked || undefined, value: stored?.value ?? q.value })} />
                        </td>
                        <td className="mono">{fmtNum(q.value, 5)}</td>
                        <td className="mono">{Number.isFinite(q.se) ? fmtNum(q.se, 3) : '—'}</td>
                        <td className="mono">{Number.isFinite(q.se) ? fmtNum((100 * q.se) / Math.abs(q.value), 3) : ''}</td>
                        <td>{q.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {v && <div className="hint">{stats}</div>}
        </details>
        {r?.outputs.parameters?.t === 'dataset' && <DataPreview columns={r.outputs.parameters.v.columns} rows={8} />}
      </NodeOptions>
      {v && tools}
      {v && readerRow}
      {v && <div className="hint">Click a point to select it (again: no more) · drag a rectangle: the points in it selected (Shift: no more) · then Leave out selected or Take back selected · drag a frequency to move it.</div>}
      {graph(500, 330)}
      {v && (
        <div className="hint ellipsis" title={v.params.map((q) => `${q.name} = ${fmtNum(q.value, 5)} ${q.unit}`).join(', ')}>
          {d.circuit.replace(/\s+/g, '')}: {v.params.map((q) => `${q.name} = ${fmtNum(q.value, 4)}${q.unit ? ` ${q.unit}` : ''}`).join(' · ')} · R² {fmtNum(v.r2.all, 5)}
        </div>
      )}
      <ResultSummary result={r} port="parameters" />
      <Messages result={r} />
      {big &&
        v &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {readerRow}
              {graph(Math.max(520, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(360, Math.min((window.innerHeight || 800) * 0.72, 860)))}
            </div>
          </div>,
          document.body,
        )}
      <OutPort id="parameters" label="parameters" port="dataset" title="A row per parameter: its value, ± its standard error, the error in %, its unit, fixed; then χ², reduced χ², R² (Z′ and Z″ together, each alone), the points" />
      <OutPort id="fitted" label="fitted" port="dataset" title="A row per point: the frequency, the data and the fit (Z′, −Z″, |Z|, phase), the residuals, used or left out" />
      <OutPort id="curve" label="fit curve" port="dataset" title="The fit drawn smooth: 25 frequencies a decade over the range, with Z′, −Z″, |Z| and the phase of the fit (to a Plot: the line of the fit through the data, Nyquist or Bode)" />
      <OutPort id="circuit" label="circuit" port="figure" title="The equivalent circuit drawn (its symbols; the fitted values optional), on a white or transparent page: to a Figure Drawing, an inset or a Merge" />
      <OutPort id="ranges" label="fits per range" port="dataset" title="A fit per range: a row per parameter of each range's fit: the range, its circuit, the value ± its error, its unit, R² of that fit" />
    </div>
  );
}
