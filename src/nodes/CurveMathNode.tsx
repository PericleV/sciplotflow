// Curve math: curves A and B — each from a dataset or a sheet of a workbook (its X and Y chosen), or from columns (one
// X, a Y for each) —, a list of operations (each its own output), and a plot of the curves with what every operation
// computes over them: the levels and the ΔX between the crossings, the X and the ΔY, the intersections, the curve
// computed, the levels of a step. The values of ΔX at Y / ΔY at X placed with the mouse too (+ Y, + X: a click; a line
// dragged moves; a double-click removes it).
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { Crosshair, Maximize2, Plus, X as XIcon } from 'lucide-react';
import { useNodeResult } from '../engine/engine.ts';
import { CURVE_FUNCS, CURVE_OP_LABELS, curveOpPort, curveOps, type CurveMathData, type CurveMathOp, type CurveOpData, type CurveOpView, type CurvePlotLine } from '../engine/curvemath.ts';
import { CURVEMATH_DEFAULTS } from '../defaults.ts';
import { fmtNum, type ColumnRole } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import type { AppNode, CurveMathNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { IC } from './iconProps.ts';
import { NodeOptions } from './NodeOptions.tsx';
import { REGION_COLORS } from './regionColors.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve, type ReaderProp } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, ResultSummary, Select, TextInput } from './ui.tsx';
import { sheetOptions } from './sheetOptions.ts';

const OPS = (Object.keys(CURVE_OP_LABELS) as CurveMathOp[]).map((k): [CurveMathOp, string] => [k, CURVE_OP_LABELS[k]]);
const opColor = (k: number) => REGION_COLORS[k % REGION_COLORS.length];
const [CA, CB] = ['#1f6fd6', '#e8710a'];
const M = { l: 56, r: 10, t: 20, b: 30 };

// the values of an operation as written: the plain numbers (they can be dragged), the rest kept as written (a range)
const tokensOf = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
const numOf = (t: string) => (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : null);

type Lines = { k: number; axis: 'x' | 'y'; values: (number | null)[] };
// a range of operation k: one of its values written start:step:end (i its place), or (i −1) its own interval of X (the
// intersections, a uniform grid); drawn as a band
export type Band = { k: number; i: number; axis: 'x' | 'y'; from: number; to: number; step?: number };
export type Adding = { k: number; axis: 'x' | 'y'; range?: boolean } | null;
type Drag = { kind: 'line'; k: number; i: number; v: number } | { kind: 'edge'; b: number; side: 'from' | 'to'; v: number } | { kind: 'new'; k: number; axis: 'x' | 'y'; a: number; b: number } | null;

// the limits of curves
function spanOf(cs: { x: number[]; y: number[] }[]) {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of cs)
    c.x.forEach((x, i) => {
      if (!Number.isFinite(x) || !Number.isFinite(c.y[i])) return;
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, c.y[i]), Math.max(y1, c.y[i])];
    });
  return { x0, x1, y0, y1 };
}

function CurvePlot(props: {
  a: CurvePlotLine;
  b?: CurvePlotLine;
  ops: CurveOpView[];
  lines: Lines[];
  bands: Band[];
  adding: Adding;
  onAdd: (k: number, v: number) => void;
  onMove: (k: number, i: number, v: number) => void;
  onRemove: (k: number, i: number) => void;
  onBand: (band: Band, from: number, to: number) => void;
  onNewBand: (k: number, from: number, to: number) => void;
  resultAxis: 'auto' | 'same' | 'own';
  W: number;
  H: number;
  zoom: ZoomMode;
  view: View | null;
  onView: (v: View | null) => void;
  zoomOut: number;
  reader?: Omit<ReaderProp, 'curves'>;
}) {
  const { a, b, ops, lines, bands, adding, W, H, zoom, view, onView, zoomOut, reader } = props;
  const cv = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [cursor, setCursor] = useState('default');
  // the curves computed (A − B, A × B …): on the axis of A and B, or on their own at the right when their values are of
  // another size (else they leave the graph, or A and B flatten)
  const results = ops.flatMap((o, k) => (o.overlay.curve ? [{ k, c: o.overlay.curve }] : []));
  const ab = spanOf([a, ...(b ? [b] : [])]);
  const rs = spanOf(results.map((q) => q.c));
  const spanAB = ab.y1 - ab.y0 || Math.abs(ab.y1) || 1;
  const differs = Number.isFinite(rs.y0) && (rs.y0 < ab.y0 - 0.5 * spanAB || rs.y1 > ab.y1 + 0.5 * spanAB || rs.y1 - rs.y0 < 0.15 * spanAB);
  const own = results.length > 0 && Number.isFinite(rs.y0) && (props.resultAxis === 'own' || (props.resultAxis === 'auto' && differs));
  const pw = W - M.l - (own ? M.l : M.r);
  const ph = H - M.t - M.b;
  const auto = (() => {
    const s = own || !results.length ? ab : spanOf([a, ...(b ? [b] : []), ...results.map((q) => q.c)]);
    if (!Number.isFinite(s.x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    const [px, py] = [(s.x1 - s.x0 || 1) * 0.03, (s.y1 - s.y0 || 1) * 0.08];
    return { x0: Math.min(s.x0, Number.isFinite(rs.x0) ? rs.x0 : s.x0) - px, x1: Math.max(s.x1, Number.isFinite(rs.x1) ? rs.x1 : s.x1) + px, y0: s.y0 - py, y1: s.y1 + py };
  })();
  // the right axis: the results' range, following the zoom of the left one
  const [r0, r1] = (() => {
    const p = (rs.y1 - rs.y0 || Math.abs(rs.y1) || 1) * 0.08;
    return [rs.y0 - p, rs.y1 + p];
  })();
  const toLeft = (u: number) => auto.y0 + ((u - r0) / (r1 - r0)) * (auto.y1 - auto.y0);
  // zoomed or panned (the tools above the plot, the wheel), else the whole of the curves
  const box = viewBox(view, auto);
  const z = usePlotZoom(zoom, { l: M.l, t: M.t, w: pw, h: ph }, box, onView);
  useEffect(() => {
    if (zoomOut) onView(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOut]);
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  const ix = (p: number) => box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
  const iy = (p: number) => box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
  const [q0, q1] = [r0 + ((box.y0 - auto.y0) / (auto.y1 - auto.y0)) * (r1 - r0), r0 + ((box.y1 - auto.y0) / (auto.y1 - auto.y0)) * (r1 - r0)];
  // the lines and the bands as they are while one is dragged; a band being drawn
  const shownLines = lines.map((l) => (drag?.kind === 'line' && drag.k === l.k ? { ...l, values: l.values.map((v, i) => (i === drag.i ? drag.v : v)) } : l));
  const shownBands = [
    ...bands.map((bd, j) => (drag?.kind === 'edge' && drag.b === j ? { ...bd, [drag.side]: drag.v } : bd)),
    ...(drag?.kind === 'new' ? [{ k: drag.k, i: -2, axis: drag.axis, from: Math.min(drag.a, drag.b), to: Math.max(drag.a, drag.b) }] : []),
  ];

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
    const path = (xs: number[], ys: number[], right = false) => {
      g.beginPath();
      let on = false;
      xs.forEach((x, i) => {
        if (!Number.isFinite(x) || !Number.isFinite(ys[i])) return void (on = false);
        g[on ? 'lineTo' : 'moveTo'](fx(x), fy(right ? toLeft(ys[i]) : ys[i]));
        on = true;
      });
      g.stroke();
    };
    const dot = (x: number, y: number, col: string, r = 3.5) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      g.fillStyle = col;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(fx(x), fy(y), r, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
    };
    // an arrow between two points (pt), both ends headed, its label beside it
    const arrow = (p: [number, number], q: [number, number], col: string, label: string, above: boolean) => {
      const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
      const L = Math.hypot(dx, dy);
      if (!(L > 2)) return;
      const [ux, uy] = [dx / L, dy / L];
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(p[0], p[1]);
      g.lineTo(q[0], q[1]);
      g.stroke();
      for (const [e, s] of [[q, 1], [p, -1]] as const) {
        g.beginPath();
        g.moveTo(e[0], e[1]);
        g.lineTo(e[0] - s * (ux * 6 - uy * 3), e[1] - s * (uy * 6 + ux * 3));
        g.lineTo(e[0] - s * (ux * 6 + uy * 3), e[1] - s * (uy * 6 - ux * 3));
        g.fill();
      }
      g.font = '10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(label, (p[0] + q[0]) / 2 + (Math.abs(ux) < 0.5 ? 18 : 0), (p[1] + q[1]) / 2 + (Math.abs(ux) < 0.5 ? 3 : above ? -5 : 12));
    };
    const across = (axis: 'x' | 'y', v: number) => {
      g.beginPath();
      if (axis === 'y') {
        g.moveTo(M.l, fy(v));
        g.lineTo(M.l + pw, fy(v));
      } else {
        g.moveTo(fx(v), M.t);
        g.lineTo(fx(v), M.t + ph);
      }
      g.stroke();
    };
    g.save();
    g.beginPath();
    g.rect(M.l, M.t, pw, ph);
    g.clip();
    // the ranges: a band each in the colour of its operation, its edges dashed, its values faint lines
    for (const bd of shownBands) {
      const col = opColor(bd.k);
      g.fillStyle = `${col}18`;
      if (bd.axis === 'y') g.fillRect(M.l, fy(Math.max(bd.from, bd.to)), pw, Math.abs(fy(bd.from) - fy(bd.to)));
      else g.fillRect(fx(Math.min(bd.from, bd.to)), M.t, Math.abs(fx(bd.to) - fx(bd.from)), ph);
      g.strokeStyle = col;
      g.lineWidth = 1;
      if (bd.step && bd.step > 0 && (bd.to - bd.from) / bd.step < 400) {
        g.globalAlpha = 0.35;
        for (let v = bd.from; v <= bd.to + bd.step * 1e-6; v += bd.step) across(bd.axis, v);
        g.globalAlpha = 1;
      }
      g.setLineDash([5, 3]);
      g.lineWidth = 1.4;
      across(bd.axis, bd.from);
      across(bd.axis, bd.to);
      g.setLineDash([]);
    }
    // the lines placed (dashed, in the colour of their operation)
    g.setLineDash([5, 4]);
    for (const l of shownLines) {
      g.strokeStyle = opColor(l.k);
      g.lineWidth = 1;
      for (const v of l.values) if (v !== null && Number.isFinite(v)) across(l.axis, v);
    }
    g.setLineDash([]);
    // the curves
    g.lineWidth = 1.6;
    g.strokeStyle = CA;
    path(a.x, a.y);
    if (b) {
      g.strokeStyle = CB;
      path(b.x, b.y);
    }
    // what every operation computes
    ops.forEach((o, k) => {
      const col = opColor(k);
      const ov = o.overlay;
      if (ov.curve) {
        g.strokeStyle = col;
        g.lineWidth = 1.4;
        g.setLineDash([6, 3]);
        path(ov.curve.x, ov.curve.y, own);
        g.setLineDash([]);
      }
      for (const v of ov.levels ?? []) {
        if (!Number.isFinite(v)) continue;
        g.strokeStyle = col;
        g.lineWidth = 1;
        g.setLineDash([2, 3]);
        across('y', v);
        g.setLineDash([]);
      }
      for (const q of ov.dx ?? []) {
        dot(q.xa, q.y, CA);
        dot(q.xb, q.y, CB);
        if (Number.isFinite(q.xa) && Number.isFinite(q.xb)) arrow([fx(q.xa), fy(q.y) - 7], [fx(q.xb), fy(q.y) - 7], col, `ΔX ${fmtNum(q.xb - q.xa, 4)}`, true);
      }
      for (const q of ov.dy ?? []) {
        dot(q.x, q.ya, CA);
        dot(q.x, q.yb, CB);
        if (Number.isFinite(q.ya) && Number.isFinite(q.yb)) arrow([fx(q.x) + 7, fy(q.ya)], [fx(q.x) + 7, fy(q.yb)], col, `ΔY ${fmtNum(q.yb - q.ya, 4)}`, true);
      }
      for (const q of ov.pts ?? []) {
        if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
        g.strokeStyle = col;
        g.lineWidth = 1.8;
        g.beginPath();
        g.arc(fx(q.x), fy(q.y), 5, 0, 2 * Math.PI);
        g.stroke();
      }
    });
    g.restore();
    // the frame, the numbers (the results' axis at the right, in their colour), the names of the curves
    g.strokeStyle = '#333333';
    g.lineWidth = 1;
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = '#333333';
    g.font = '10px system-ui, sans-serif';
    const sx = niceStep(box.x1 - box.x0, Math.max(3, Math.round(pw / 80)));
    g.textAlign = 'center';
    for (let v = Math.ceil(box.x0 / sx) * sx; v <= box.x1 + sx * 1e-9; v += sx) {
      g.fillText(fmtNum(Math.abs(v) < sx * 1e-9 ? 0 : v, 4), fx(v), M.t + ph + 12);
      g.fillRect(fx(v), M.t + ph - 4, 1, 4);
    }
    const sy = niceStep(box.y1 - box.y0, Math.max(3, Math.round(ph / 45)));
    g.textAlign = 'right';
    for (let v = Math.ceil(box.y0 / sy) * sy; v <= box.y1 + sy * 1e-9; v += sy) {
      g.fillText(fmtNum(Math.abs(v) < sy * 1e-9 ? 0 : v, 4), M.l - 4, fy(v) + 3);
      g.fillRect(M.l, fy(v), 4, 1);
    }
    if (own) {
      g.fillStyle = opColor(results[0].k);
      g.textAlign = 'left';
      const sr = niceStep(q1 - q0, Math.max(3, Math.round(ph / 45)));
      for (let v = Math.ceil(q0 / sr) * sr; v <= q1 + sr * 1e-9; v += sr) {
        const y = fy(toLeft(v));
        g.fillText(fmtNum(Math.abs(v) < sr * 1e-9 ? 0 : v, 4), M.l + pw + 4, y + 3);
        g.fillRect(M.l + pw - 4, y, 4, 1);
      }
    }
    g.fillStyle = '#333333';
    g.textAlign = 'center';
    g.fillText(a.xName, M.l + pw / 2, H - 4);
    g.textAlign = 'left';
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillStyle = CA;
    g.fillText(`A: ${a.name}`, M.l, 12);
    let at = M.l + g.measureText(`A: ${a.name}`).width + 16;
    if (b) {
      g.fillStyle = CB;
      g.fillText(`B: ${b.name}`, at, 12);
      at += g.measureText(`B: ${b.name}`).width + 16;
    }
    if (own) {
      g.fillStyle = opColor(results[0].k);
      g.textAlign = 'right';
      g.fillText('results: right axis', M.l + pw, 12);
    }
    if (z.rect) {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      g.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, ops, shownLines, shownBands, own, W, H, box.x0, box.x1, box.y0, box.y1, z.rect]);

  const pos = (e: RPointerEvent | RMouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { px: ((e.clientX - r.left) * W) / r.width, py: ((e.clientY - r.top) * H) / r.height };
  };
  const value = (axis: 'x' | 'y', px: number, py: number) => +(axis === 'y' ? iy(py) : ix(px)).toPrecision(5);
  const pixel = (axis: 'x' | 'y', v: number) => (axis === 'y' ? fy(v) : fx(v));
  // what is under the mouse: an edge of a band, a line placed, the inside of a band
  const edgeAt = (px: number, py: number) => {
    for (let j = 0; j < bands.length; j++)
      for (const side of ['from', 'to'] as const) if (Math.abs(pixel(bands[j].axis, bands[j][side]) - (bands[j].axis === 'y' ? py : px)) < 5) return { b: j, side };
    return null;
  };
  const lineAt = (px: number, py: number) => {
    for (const l of lines)
      for (let i = 0; i < l.values.length; i++) {
        const v = l.values[i];
        if (v !== null && Math.abs(pixel(l.axis, v) - (l.axis === 'y' ? py : px)) < 5) return { k: l.k, i, axis: l.axis };
      }
    return null;
  };
  const bandAt = (px: number, py: number) =>
    bands.find((bd) => {
      const v = bd.axis === 'y' ? iy(py) : ix(px);
      return v >= Math.min(bd.from, bd.to) && v <= Math.max(bd.from, bd.to);
    });
  const inFrame = (px: number, py: number) => px >= M.l && px <= M.l + pw && py >= M.t && py <= M.t + ph;
  const curves: ReadCurve[] = [{ name: `A: ${a.name}`, color: CA, x: a.x, y: a.y }, ...(b ? [{ name: `B: ${b.name}`, color: CB, x: b.x, y: b.y }] : []), ...results.map((q) => ({ name: `${q.k + 1}. ${q.c.name}${own ? ' (right axis)' : ''}`, color: opColor(q.k), x: q.c.x, y: q.c.y, ...(own ? { onAxis: toLeft } : {}) }))];
  return (
    <div className="region-plot nodrag nowheel">
      <div className="reader-host">
        <canvas
          ref={cv}
          style={{ width: W, height: H, cursor }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const { px, py } = pos(e);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            if (z.down(px, py, e)) return;
            const ed = edgeAt(px, py);
            if (ed) return setDrag({ kind: 'edge', ...ed, v: value(bands[ed.b].axis, px, py) });
            const h = lineAt(px, py);
            if (h) return setDrag({ kind: 'line', k: h.k, i: h.i, v: value(h.axis, px, py) });
            if (!adding || !inFrame(px, py)) return;
            if (adding.range) return setDrag({ kind: 'new', k: adding.k, axis: adding.axis, a: value(adding.axis, px, py), b: value(adding.axis, px, py) });
            props.onAdd(adding.k, value(adding.axis, px, py));
          }}
          onPointerMove={(e) => {
            const { px, py } = pos(e);
            if (z.move(px, py)) return setCursor(zoom === 'pan' ? 'grab' : 'crosshair');
            if (drag?.kind === 'line') {
              const l = lines.find((q) => q.k === drag.k);
              return l && setDrag({ ...drag, v: value(l.axis, px, py) });
            }
            if (drag?.kind === 'edge') return setDrag({ ...drag, v: value(bands[drag.b].axis, px, py) });
            if (drag?.kind === 'new') return setDrag({ ...drag, b: value(drag.axis, px, py) });
            const ed = edgeAt(px, py);
            const h = ed ? bands[ed.b] : lineAt(px, py);
            setCursor(h ? (h.axis === 'y' ? 'ns-resize' : 'ew-resize') : adding ? (adding.range ? (adding.axis === 'y' ? 'row-resize' : 'col-resize') : 'crosshair') : 'default');
          }}
          onPointerUp={(e) => {
            const { px, py } = pos(e);
            if (z.up(px, py)) return;
            const d = drag;
            setDrag(null);
            if (d?.kind === 'line') props.onMove(d.k, d.i, d.v);
            if (d?.kind === 'edge') {
              const bd = bands[d.b];
              const [f, t] = d.side === 'from' ? [d.v, bd.to] : [bd.from, d.v];
              props.onBand(bd, Math.min(f, t), Math.max(f, t));
            }
            if (d?.kind === 'new' && Math.abs(pixel(d.axis, d.b) - pixel(d.axis, d.a)) >= 4) props.onNewBand(d.k, Math.min(d.a, d.b), Math.max(d.a, d.b));
          }}
          onWheel={(e) => {
            const { px, py } = pos(e);
            z.wheel(px, py, e.deltaY, e);
          }}
          onDoubleClick={(e) => {
            const { px, py } = pos(e);
            const h = lineAt(px, py);
            if (h) return props.onRemove(h.k, h.i);
            // a range written as start:step:end: removed
            const bd = bandAt(px, py);
            if (bd && bd.i >= 0) props.onRemove(bd.k, bd.i);
          }}
        />
        {reader && <ReaderLayer reader={{ ...reader, curves }} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />}
      </div>
    </div>
  );
}

// the sheet of a workbook on a port: of the workbook connected, or of the Import / Workbook whose sheet shown is
// connected (choosing one then connects its workbook output)
function useSheets(id: string, port: string, own: string[] | undefined) {
  const conn = useNodeConnections({ handleType: 'target', handleId: port })[0];
  const src = useNodeResult(conn?.source ?? '');
  const { setEdges } = useReactFlow<AppNode>();
  const book = src?.outputs.book;
  const viaShown = conn?.sourceHandle === 'out' && book?.t === 'workbook' && book.v.sheets.length > 1;
  const sheets = own ?? (viaShown && book?.t === 'workbook' ? book.v.sheets.map((s) => s.name) : undefined);
  const rewire = () => {
    if (viaShown && conn) setEdges((es) => es.map((e) => (e.source === conn.source && e.sourceHandle === 'out' && e.target === id && e.targetHandle === port ? { ...e, id: `e-${conn.source}-book-${id}-${port}`, sourceHandle: 'book' } : e)));
  };
  return { sheets, viaShown, rewire };
}

// a range written start:step:end: its ends and its step (NaN: not a range)
const rangeOf = (t: string) => {
  const m = /^\s*([^:]+):([^:]+):([^:]+)\s*$/.exec(t);
  const [a, s, b] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
  return Number.isFinite(a) && Number.isFinite(s) && Number.isFinite(b) && s > 0 ? { from: a, step: s, to: b } : null;
};
const r6 = (v: number) => +v.toPrecision(6);
// a range as written: from, its step (so many points between its ends), to
const rangeText = (from: number, to: number, points: number) => `${r6(from)}:${r6((to - from) / Math.max(1, points - 1)) || 1}:${r6(to)}`;
const pointsOf = (r: { from: number; step: number; to: number }) => Math.round((r.to - r.from) / r.step) + 1;

// the values of ΔX at Y / ΔY at X: each one typed (or removed), more added, picked on the graph; ranges — their ends, the
// points (or the step) between them — typed or drawn on the graph as bands
function ValueList({ o, k, set, adding, setAdding }: { o: CurveOpData; k: number; set: (p: Partial<CurveOpData>) => void; adding: Adding; setAdding: (a: Adding) => void }) {
  const axis = o.op === 'dxAtY' ? 'y' : 'x';
  const name = axis === 'y' ? 'Y' : 'X';
  const tokens = tokensOf(o.values);
  const put = (t: string[]) => set({ values: t.join(', ') });
  const putAt = (i: number, t: string) => put(tokens.map((x, j) => (j === i ? t : x)));
  const picking = adding?.k === k && !adding.range;
  const drawing = adding?.k === k && !!adding.range;
  return (
    <div className="cm-values">
      <span className="muted">{o.op === 'dxAtY' ? 'ΔX at these Y (a horizontal line each on the graph; a range: a band)' : 'ΔY at these X (a vertical line each on the graph; a range: a band)'}</span>
      {tokens.map((t, i) => {
        const rg = rangeOf(t);
        const n = rg ? pointsOf(rg) : 0;
        return (
          <span key={i} className="row wrap">
            {numOf(t) !== null ? (
              <>
                <span className="muted">{name} =</span>
                <NumInput className="short" value={numOf(t)!} onChange={(v) => Number.isFinite(v) && putAt(i, String(v))} />
              </>
            ) : rg ? (
              <>
                <span className="muted">{name} from</span>
                <NumInput className="short" value={rg.from} title="Its start" onChange={(v) => Number.isFinite(v) && putAt(i, rangeText(v, rg.to, n))} />
                <span className="muted">to</span>
                <NumInput className="short" value={rg.to} title="Its end" onChange={(v) => Number.isFinite(v) && putAt(i, rangeText(rg.from, v, n))} />
                <span className="muted">points</span>
                <NumInput className="tiny" min={2} step={1} value={n} title="How many values between its ends (them included): the calculation is made at each" onChange={(v) => Number.isFinite(v) && v >= 2 && putAt(i, rangeText(rg.from, rg.to, Math.round(v)))} />
                <span className="muted">step</span>
                <NumInput className="tiny" value={rg.step} title="The step between the values (instead of their number)" onChange={(v) => Number.isFinite(v) && v > 0 && putAt(i, `${r6(rg.from)}:${r6(v)}:${r6(rg.to)}`)} />
              </>
            ) : (
              <TextInput className="mono" value={t} title="A value, or a range: start:step:end" onChange={(v) => put(tokens.map((x, j) => (j === i ? v : x)).filter(Boolean))} />
            )}
            <button className="nodrag ts-btn" title="Remove it" onClick={() => put(tokens.filter((_, j) => j !== i))}>
              <XIcon {...IC} />
            </button>
          </span>
        );
      })}
      {!tokens.length && <span className="hint">No value yet: add one, pick it on the graph, or a range.</span>}
      <span className="row wrap">
        <button className="nodrag" title={`A ${name} value typed here (it starts as a copy of the last one)`} onClick={() => put([...tokens, tokens.length && numOf(tokens[tokens.length - 1]) !== null ? tokens[tokens.length - 1] : '0'])}>
          <Plus {...IC} /> Add a value
        </button>
        <button className={`nodrag${picking ? ' on' : ''}`} title={`Then click on the graph: a ${name} value there (as many as you click; a line dragged moves its value, a double-click removes it). Click here again to stop.`} onClick={() => setAdding(picking ? null : { k, axis })}>
          <Crosshair {...IC} /> {picking ? 'Picking on the graph…' : 'Pick on the graph'}
        </button>
        <button className="nodrag" title="A range typed here: its ends and the number of points (or the step) between them" onClick={() => put([...tokens, '0:1:10'])}>
          + Range
        </button>
        <button className={`nodrag${drawing ? ' on' : ''}`} title={`Then drag across the graph (${axis === 'y' ? 'up or down' : 'left or right'}): a range of ${name}, 11 points between its ends (changed here); its edges dragged later, a double-click inside removes it`} onClick={() => setAdding(drawing ? null : { k, axis, range: true })}>
          <Crosshair {...IC} /> {drawing ? 'Drawing a range…' : 'Draw a range'}
        </button>
      </span>
    </div>
  );
}

// the settings of one operation
function OpFields({ o, k, set, adding, setAdding }: { o: CurveOpData; k: number; set: (p: Partial<CurveOpData>) => void; adding: Adding; setAdding: (a: Adding) => void }) {
  // an interval of X drawn on the graph (the intersections; a uniform grid)
  const drawing = adding?.k === k && !!adding.range;
  const drawX = (
    <button className={`nodrag${drawing ? ' on' : ''}`} title="Then drag across the graph (left or right): the interval of X, drawn as a band (its edges dragged later)" onClick={() => setAdding(drawing ? null : { k, axis: 'x', range: true })}>
      <Crosshair {...IC} /> {drawing ? 'Drawing…' : 'Draw it'}
    </button>
  );
  if (o.op === 'formula')
    return (
      <>
        <textarea
          className="nodrag nowheel mono formula-lines"
          rows={Math.max(3, (o.formula ?? '').split('\n').length + 1)}
          value={o.formula ?? ''}
          spellCheck={false}
          title="A line each: name = expression of the curves A and B (and of the results above). The functions take the curve, then a range of X if wanted: xmin(A, 600, 700)"
          placeholder={'dip_A = xmin(A)\ndip_B = xmin(B)\nS = (dip_B − dip_A) / (1.345 − 1.333)'}
          onChange={(e) => set({ formula: e.target.value })}
        />
        <Check label="For every Y of A" title="The formula for every Y column of A (a sweep cut by Split into columns): a row each, with its block's value" value={!!o.each} onChange={(each) => set({ each })} />
        <div className="hint formula-help">
          {CURVE_FUNCS.map(([f, t]) => (
            <span key={f} title={t}>
              <code>{f}</code>{' '}
            </span>
          ))}
          — and a range: <code>xmin(A, 600, 700)</code>; + − × / ^, sqrt, log, abs …
        </div>
      </>
    );
  if (o.op === 'step')
    return (
      <div className="row wrap">
        <Field label="Rise from" title="The rise (or fall) time: between these two levels of the step (%)">
          <span className="row">
            <NumInput className="tiny" min={0} max={50} value={o.stepLo ?? 10} onChange={(stepLo) => set({ stepLo: Number.isFinite(stepLo) ? stepLo : undefined })} />
            <span>–</span>
            <NumInput className="tiny" min={50} max={100} value={o.stepHi ?? 90} onChange={(stepHi) => set({ stepHi: Number.isFinite(stepHi) ? stepHi : undefined })} />
            <span className="muted">%</span>
          </span>
        </Field>
        <Field label="Settling ±" title="Settled: within this band around the final level (% of the step)">
          <NumInput className="tiny" min={0.1} step={0.5} value={o.settle ?? 2} onChange={(settle) => set({ settle: settle > 0 ? settle : undefined })} />
        </Field>
        <Field label="Step at X" title="The times from here (empty: the first X of the curve)">
          <NumInput className="short" value={o.stepAt ?? NaN} placeholder="first X" onChange={(stepAt) => set({ stepAt: Number.isFinite(stepAt) ? stepAt : undefined })} />
        </Field>
      </div>
    );
  return (
    <div className="row wrap">
      {(o.op === 'dxAtY' || o.op === 'dyAtX') && <ValueList o={o} k={k} set={set} adding={adding} setAdding={setAdding} />}
      {o.op === 'dxAtY' && (
        <Field label="Crossing" title="A curve may cross a Y more than once (a loop, a peak): the first, the last, or every one (paired in order)">
          <Select
            value={o.crossing}
            options={[
              ['first', 'the first'],
              ['last', 'the last'],
              ['all', 'every one'],
            ]}
            onChange={(crossing) => set({ crossing })}
          />
        </Field>
      )}
      {o.op === 'cross' && (
        <>
          <Field label="In X" title="Only the intersections in this range of X (empty: all)">
            <span className="row">
              <NumInput className="short" value={o.from} placeholder="from" onChange={(from) => set({ from })} />
              <NumInput className="short" value={o.to} placeholder="to" onChange={(to) => set({ to })} />
              {drawX}
            </span>
          </Field>
          <Field label="Give" title="Along A, in the order measured">
            <Select
              value={o.crossing}
              options={[
                ['all', 'every one'],
                ['first', 'the first'],
                ['last', 'the last'],
              ]}
              onChange={(crossing) => set({ crossing })}
            />
          </Field>
          <Check label="Touches too" title="Where B meets A and stays on its side (and where a curve ends on the other)" value={o.touch !== false} onChange={(touch) => set({ touch })} />
        </>
      )}
      {['sub', 'add', 'mul', 'div', 'mean'].includes(o.op) && (
        <Field label="On X of" title="The X the result is computed on: of curve A, of B, or a uniform grid (the other curve read there by straight lines)">
          <span className="row">
            <Select
              value={o.grid}
              options={[
                ['a', 'curve A'],
                ['b', 'curve B'],
                ['uniform', 'a uniform grid'],
              ]}
              onChange={(grid) => set({ grid })}
            />
            {o.grid === 'uniform' && (
              <>
                <NumInput className="short" value={o.from} placeholder="from" onChange={(from) => set({ from })} />
                <NumInput className="short" value={o.to} placeholder="to" onChange={(to) => set({ to })} />
                <NumInput className="tiny" value={o.points} min={2} step={10} title="Points" onChange={(points) => set({ points: Math.max(2, Math.floor(points) || 200) })} />
                {drawX}
              </>
            )}
          </span>
        </Field>
      )}
      {o.op !== 'cross' && <Check label="Absolute value" value={o.abs} onChange={(abs) => set({ abs })} />}
    </div>
  );
}

export function CurveMathNodeView({ id, data }: NodeProps<CurveMathNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<CurveMathData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const ops = curveOps(data);
  const setOps = (l: CurveOpData[]) => set({ ops: l });
  const setOp = (k: number, p: Partial<CurveOpData>) => setOps(ops.map((o, j) => (j === k ? { ...o, ...p } : o)));
  const [adding, setAdding] = useState<Adding>(null);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const cm = r?.view.cmath;
  const colOptions = (cols?: { name: string; role?: ColumnRole }[], y = true) => (cols ?? []).filter((c) => (y ? c.role !== 'x' : true)).map((c): [string, string] => [c.name, c.name]);
  const sheetA = useSheets(id, 'a', r?.view.sheetsA);
  const sheetB = useSheets(id, 'b', r?.view.sheetsB);
  const conns = useNodeConnections({ handleType: 'target' });
  const has = (h: string) => conns.some((c) => c.targetHandle === h);
  const bOwn = has('b');
  // the curve settings: its sheet, its X, its Y
  const curve = (which: 'A' | 'B') => {
    const isA = which === 'A';
    const sh = isA ? sheetA : sheetB;
    const avail = isA || bOwn ? (isA ? r?.view.available : r?.view.availB) : r?.view.available;
    const sheet = isA ? data.sheetA : data.sheetB;
    const fromCols = isA ? !has('a') && has('ya') : !bOwn && has('yb');
    return (
      <div className="col-form">
        <span className="cm-curve" style={{ color: isA ? CA : CB }}>
          Curve {which}
        </span>
        <span className="muted">{fromCols ? `columns: X ${has('x') ? '(port X)' : '(the row number)'} and Y ${which} (port Y ${which})` : !isA && !bOwn ? 'from the dataset of A (or connect B)' : ''}</span>
        {sh.sheets && (
          <>
            <span>Sheet</span>
            <Select<string>
              {...sheetOptions(sh.sheets, sheet ?? '', { via: sh.viaShown })}
              onChange={(v) => {
                set(isA ? { sheetA: v || undefined } : { sheetB: v || undefined });
                sh.rewire();
              }}
            />
          </>
        )}
        {!fromCols && (
          <>
            <span>X</span>
            <Select<string> value={(isA ? data.xa : data.xb) ?? ''} options={[['', 'the designated one'], ['-', 'the row number'], ...colOptions(avail, false)]} onChange={(v) => set(isA ? { xa: v || undefined } : { xb: v || undefined })} />
            <span>Y</span>
            <Select<string> value={isA ? data.ya : data.yb} options={[['', isA || bOwn ? 'the first Y' : 'the second Y of A'], ...colOptions(avail)]} onChange={(v) => set(isA ? { ya: v } : { yb: v })} />
          </>
        )}
      </div>
    );
  };
  // the values placed by hand of ΔX at Y / ΔY at X
  const lines: Lines[] = ops.flatMap((o, k) => (o.op === 'dxAtY' || o.op === 'dyAtX' ? [{ k, axis: o.op === 'dxAtY' ? ('y' as const) : ('x' as const), values: tokensOf(o.values).map(numOf) }] : []));
  const editValues = (k: number, f: (t: string[]) => string[]) => setOp(k, { values: f(tokensOf(ops[k].values)).join(', ') });
  // the plot, in the node and in the large view; its zoom tools
  // the ranges as bands: the values written start:step:end; the intervals of X of the intersections and of a uniform grid
  const bands: Band[] = ops.flatMap((o, k): Band[] => {
    if (o.op === 'dxAtY' || o.op === 'dyAtX')
      return tokensOf(o.values).flatMap((t, i) => {
        const rg = rangeOf(t);
        return rg ? [{ k, i, axis: o.op === 'dxAtY' ? ('y' as const) : ('x' as const), from: rg.from, to: rg.to, step: rg.step }] : [];
      });
    const own = o.op === 'cross' || (['sub', 'add', 'mul', 'div', 'mean'].includes(o.op) && o.grid === 'uniform');
    return own && Number.isFinite(o.from) && Number.isFinite(o.to) ? [{ k, i: -1, axis: 'x', from: o.from, to: o.to }] : [];
  });
  const onBand = (bd: Band, from: number, to: number) => {
    if (bd.i < 0) return setOp(bd.k, { from: r6(from), to: r6(to) });
    const rg = rangeOf(tokensOf(ops[bd.k].values)[bd.i]);
    editValues(bd.k, (t) => t.map((x, j) => (j === bd.i ? rangeText(from, to, rg ? pointsOf(rg) : 11) : x)));
  };
  const onNewBand = (k: number, from: number, to: number) => {
    const o = ops[k];
    if (o.op === 'dxAtY' || o.op === 'dyAtX') return editValues(k, (t) => [...t, rangeText(from, to, 11)]);
    setOp(k, { from: r6(from), to: r6(to), ...(o.op === 'cross' ? {} : { grid: 'uniform' as const }) });
    setAdding(null);
  };
  // the data reader: A, B and the curves computed
  const readCurves: ReadCurve[] = cm ? [{ name: `A: ${cm.a.name}`, color: CA, x: cm.a.x, y: cm.a.y }, ...(cm.b ? [{ name: `B: ${cm.b.name}`, color: CB, x: cm.b.x, y: cm.b.y }] : []), ...cm.ops.flatMap((o, k) => (o.overlay.curve ? [{ name: `${k + 1}. ${o.overlay.curve.name}`, color: opColor(k), x: o.overlay.curve.x, y: o.overlay.curve.y }] : []))] : [];
  const plot = (w: number, h: number) =>
    cm && (
      <CurvePlot
        reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }}
        bands={bands}
        onBand={onBand}
        onNewBand={onNewBand}
        resultAxis={data.resultAxis ?? 'auto'}
        a={cm.a}
        b={cm.b}
        ops={cm.ops}
        lines={lines}
        adding={zoom === 'none' ? adding : null}
        onAdd={(k, v) => editValues(k, (t) => [...t, String(v)])}
        onMove={(k, i, v) => editValues(k, (t) => t.map((x, j) => (j === i ? String(v) : x)))}
        onRemove={(k, i) => editValues(k, (t) => t.filter((_, j) => j !== i))}
        W={w}
        H={h}
        zoom={zoom}
        view={view}
        onView={setView}
        zoomOut={out}
      />
    );
  const tools = (
    <>
    <div className="row wrap">
      <span className="grow" />
      <ZoomTools
        mode={zoom}
        setMode={(m) => {
          setZoom(m);
          if (m !== 'none') setRd((q) => ({ ...q, on: false }));
        }}
        onRescale={() => setView(null)}
        onRescaleAxis={(w) => setView((v) => rescaleAxis(v, w))}
        onZoomOut={() => setOut((n) => n + 1)}
        zoomed={!!view}
      />
      <ReaderButton
        r={rd}
        set={setRd}
        onOn={() => {
          setZoom('none');
          setAdding(null);
        }}
      />
      <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
        <Maximize2 {...IC} /> Large
      </button>
    </div>
    <ReaderOptions r={rd} set={setRd} names={readCurves.map((c) => c.name)} />
    </>
  );
  const addOp = () => setOps([...ops, { op: 'dyAtX', values: '', crossing: 'first', abs: false, grid: 'a', from: NaN, to: NaN, points: CURVEMATH_DEFAULTS.points }]);
  return (
    <div className="node node-curvemath">
      <InPort label="A" port="dataset" id="a" title="Curve A: a dataset or a workbook (its sheet, X and Y chosen in the options)" />
      <InPort label="B" port="dataset" id="b" title="Optional: curve B from a dataset or a workbook (else a second Y of A, or the column on Y B)" />
      <InPort label="X" port="column" id="x" title="Optional, instead of datasets: the X column the curves share (else the row number)" />
      <InPort label="Y A" port="column" id="ya" title="Optional, instead of a dataset on A: the Y column of curve A" />
      <InPort label="Y B" port="column" id="yb" title="Optional, instead of a dataset on B: the Y column of curve B" />
      {cm && (
        <>
          <div className="row wrap">
            {ops.map((o, k) =>
              o.op === 'dxAtY' || o.op === 'dyAtX' ? (
                <button
                  key={k}
                  className={`nodrag${adding?.k === k ? ' on' : ''}`}
                  style={{ borderColor: opColor(k) }}
                  title={`Then click on the graph: a ${o.op === 'dxAtY' ? 'Y' : 'X'} value of operation ${k + 1} there; drag a line to move it, double-click to remove it`}
                  onClick={() => setAdding(adding?.k === k ? null : { k, axis: o.op === 'dxAtY' ? 'y' : 'x' })}
                >
                  + {o.op === 'dxAtY' ? 'Y' : 'X'} {ops.length > 1 ? `(${k + 1})` : ''}
                </button>
              ) : null,
            )}
          </div>
          {tools}
          {plot(520, 300)}
          {big &&
            createPortal(
              <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
                <button className="big-close" onClick={() => setBig(false)}>
                  <XIcon {...IC} />
                </button>
                <div className="manip-big">
                  {tools}
                  {plot(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(360, Math.min((window.innerHeight || 800) * 0.74, 820)))}
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
      <NodeOptions>
        {curve('A')}
        {curve('B')}
        <div className="cm-ops">
          {ops.map((o, k) => (
            <div key={k} className="cm-op" style={{ borderLeftColor: opColor(k) }}>
              <div className="row">
                <b>{k + 1}</b>
                <Select<CurveMathOp> value={o.op} options={OPS} onChange={(op) => setOp(k, { op })} />
                <span className="grow" />
                {ops.length > 1 && (
                  <button className="nodrag ts-btn" title="Remove this operation (its output port goes)" onClick={() => setOps(ops.filter((_, j) => j !== k))}>
                    <XIcon {...IC} />
                  </button>
                )}
              </div>
              <OpFields o={o} k={k} set={(p) => setOp(k, p)} adding={adding} setAdding={setAdding} />
              {cm?.ops[k]?.error && <div className="msg error">{cm.ops[k].error}</div>}
              {(() => {
                const out = r?.outputs[curveOpPort(k)];
                return out?.t === 'dataset' ? <DataPreview columns={out.v.columns} rows={4} /> : null;
              })()}
            </div>
          ))}
          <button className="nodrag" title="Another operation on the same curves (ΔX and ΔY, the intersections …): its own output" onClick={addOp}>
            + Add operation
          </button>
          {cm?.ops.some((o) => o.overlay.curve) && (
            <Field label="Curves computed" title="On the graph: on the axis of A and B, on an axis of their own at the right, or automatically — at the right when their values are of another size (A × B, A / B …), so that every curve stays visible">
              <Select<'auto' | 'same' | 'own'>
                value={data.resultAxis ?? 'auto'}
                options={[
                  ['auto', 'automatic'],
                  ['same', 'on the axis of A and B'],
                  ['own', 'on their own axis (right)'],
                ]}
                onChange={(v) => set({ resultAxis: v === 'auto' ? undefined : v })}
              />
            </Field>
          )}
        </div>
        {(r?.view.report ?? []).length > 0 && (
          <div className="stat-report">
            {r!.view.report!.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      {ops.map((o, k) => (
        <OutPort key={k} label={`${ops.length > 1 ? `${k + 1}. ` : ''}${CURVE_OP_LABELS[o.op]}`} port="dataset" id={curveOpPort(k)} title="ΔX at Y: Y, X of A, X of B, ΔX · ΔY at X: X, Y of A, Y of B, ΔY · intersections: #, X, Y, rows of A and B, direction, kind · arithmetic: X and the result · a formula: its results · step: rise, overshoot, settling …" />
      ))}
    </div>
  );
}
