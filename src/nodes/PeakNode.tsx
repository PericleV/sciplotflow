// Peak analyzer: the settings (data, range, baseline, the peaks found or listed, fit), the graph of the run shown — the
// data, the baseline, every peak in its colour on the baseline with its number, the envelope, the residuals below —,
// and the table of the peaks in the same colours.
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { PeakRunView, PeakView } from '../engine/evaluate.ts';
import type { Pt } from '../engine/calculus.ts';
import { SHAPE_NAMES, type PeakShape } from '../engine/fitModels.ts';
import { baseKindOf, baseMethodOf, FITTED_BASES, isFitted, peakRunKey, type BaseKind, type FindOptions, type PeakItem } from '../engine/peaks.ts';
import type { BaseMethod } from '../engine/baselines.ts';
import { BaselineFields } from './BaselineFields.tsx';
import { fmtNum } from '../engine/table.ts';
import { fmtPm } from '../engine/report.ts';
import { axisTicks, axisTitle, fromAxis, notDrawn, toAxis } from './graphScale.ts';
import { useGraphScale } from './useGraphScale.ts';
import type { AppNode, PeakData, PeakNode } from '../types.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { REGION_COLORS } from './regionColors.ts';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { drawResiduals, RESID_TITLE } from './residPanel.ts';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve, type ReaderProp } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

// the colour of peak k (1 …)
const peakColor = (k: number) => REGION_COLORS[(k - 1) % REGION_COLORS.length];
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const SHAPES: [PeakShape, string][] = (Object.keys(SHAPE_NAMES) as PeakShape[]).map((k) => [k, SHAPE_NAMES[k]]);
const FITTED: [string, string][] = [
  ['constant', 'constant (fitted)'],
  ['linear', 'linear (fitted)'],
  ['quadratic', 'quadratic (fitted)'],
];
// the top margin: the numbers of the peaks over the frame
const M = { l: 56, r: 10, t: 18, b: 30 };
const RES_H = 70;
type Box = View;
// a region of a peak (manual peaks): its edges, its colour
export type PeakRegion = { k: number; from: number; to: number; color: string };
type Drag = { kind: 'pt'; k: number; x: number; y: number; fresh?: boolean } | { kind: 'reg'; x0: number; x1: number } | { kind: 'edge'; k: number; side: 'from' | 'to'; x: number } | { kind: 'shift'; k: number; at: number; x: number } | null;

function PeakPlot(props: { run: PeakRunView; width: number; height: number; points: Pt[]; placing: boolean; onPoints: (p: Pt[]) => void; adding: boolean; onAdd: (x: number) => void; regions: PeakRegion[]; drawing: boolean; onRegion: (from: number, to: number) => void; onEdge: (k: number, side: 'from' | 'to', x: number) => void; selected: number | null; onSelect: (k: number | null) => void; onShift: (k: number, from: number, to: number) => void; onRemove: (k: number) => void; ghost?: PeakRunView; reader?: ReaderProp; xTitle: string; yTitle: string; zoom: ZoomMode; view: View | null; onView: (v: View | null) => void; zoomOut: number; resid: boolean }) {
  const { run, width: W, height: H } = props;
  const cv = useRef<HTMLCanvasElement>(null);
  // X and Y linear, log or log |v| (graphScale.ts): the box in the axes' own units
  const [sc] = useGraphScale();
  const tx = (v: number) => toAxis(sc.x, v);
  const ty = (v: number) => toAxis(sc.y, v);
  const [drag, setDragState] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  const [cursor, setCursor] = useState('default');
  const setDrag = (d: Drag) => {
    dragRef.current = d;
    setDragState(d);
  };
  const pw = W - M.l - M.r;
  const RH = props.resid ? RES_H : 0;
  const ph = H - M.t - M.b - RH;
  const pts = props.points;
  const auto = (() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    run.x.forEach((xv) => {
      const v = tx(xv);
      if (Number.isFinite(v)) [x0, x1] = [Math.min(x0, v), Math.max(x1, v)];
    });
    // the range of the data only: the baseline and the peaks follow the points placed — with them in the range, the
    // graph rescaled at every point and the points jumped away from where they were clicked
    for (const yv of run.y) {
      const v = ty(yv);
      if (Number.isFinite(v)) [y0, y1] = [Math.min(y0, v), Math.max(y1, v)];
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    const px = (x1 - x0 || 1) * 0.03;
    const py = (y1 - y0 || 1) * 0.1;
    return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
  })();
  const box: Box = viewBox(props.view, auto);
  const z = usePlotZoom(props.zoom, { l: M.l, t: M.t, w: pw, h: ph }, box, props.onView);
  useEffect(() => {
    if (props.zoomOut) props.onView(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.zoomOut]);
  // (on the axes' own units, and the data's values through their scales)
  const ux = (u: number) => M.l + ((u - box.x0) / (box.x1 - box.x0)) * pw;
  const uy = (u: number) => M.t + (1 - (u - box.y0) / (box.y1 - box.y0)) * ph;
  const fx = (v: number) => ux(tx(v));
  const fy = (v: number) => uy(ty(v));
  const ix = (p: number) => fromAxis(sc.x, box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0));
  const iy = (p: number) => fromAxis(sc.y, box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0));
  const hidden = notDrawn(sc, run.x, run.y);
  const shownPts = drag?.kind === 'pt' ? (drag.fresh ? [...pts, { x: drag.x, y: drag.y }] : pts.map((p, k) => (k === drag.k ? { x: drag.x, y: drag.y } : p))) : pts;
  // (a region moved whole: by the distance dragged)
  const shifted = (g: PeakRegion) => (drag?.kind === 'shift' && drag.k === g.k ? { ...g, from: g.from + drag.x - drag.at, to: g.to + drag.x - drag.at } : g);
  // the regions as they are while one is drawn, moved or an edge dragged
  const regions = [
    ...props.regions.map((g) => shifted(drag?.kind === 'edge' && drag.k === g.k ? { ...g, [drag.side]: drag.x } : g)),
    ...(drag?.kind === 'reg' ? [{ k: -1, from: drag.x0, to: drag.x1, color: '#888888' }] : []),
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
    const line = (xs: number[], ys: number[]) => {
      g.beginPath();
      let on = false;
      xs.forEach((x, i) => {
        if (!Number.isFinite(fx(x)) || !Number.isFinite(fy(ys[i]))) return void (on = false);
        g[on ? 'lineTo' : 'moveTo'](fx(x), fy(ys[i]));
        on = true;
      });
      g.stroke();
    };
    g.save();
    g.beginPath();
    g.rect(M.l, M.t, pw, ph);
    g.clip();
    // the regions of the peaks: a band each, its edges dashed
    for (const rg of regions) {
      // (an end not on a log axis: the edge)
      const edge = (v: number, e: number) => (Number.isFinite(fx(v)) ? fx(v) : e);
      const [p, q] = [edge(rg.from, M.l), edge(rg.to, M.l + pw)];
      const [a, b] = [Math.min(p, q), Math.max(p, q)];
      // (the one selected: stronger, its edges solid)
      const on = rg.k >= 0 && rg.k === props.selected;
      g.fillStyle = alpha(rg.color, on ? 0.22 : 0.1);
      g.fillRect(a, M.t, b - a, ph);
      g.strokeStyle = rg.color;
      g.lineWidth = on ? 2 : 1;
      g.setLineDash(on ? [] : [4, 3]);
      for (const e of [a, b]) {
        g.beginPath();
        g.moveTo(e + 0.5, M.t);
        g.lineTo(e + 0.5, M.t + ph);
        g.stroke();
      }
      g.setLineDash([]);
    }
    // the last fit, faded, while the settings changed since it (until Run analysis)
    const gh = props.ghost;
    if (gh && !run.comps.length) {
      g.globalAlpha = 0.45;
      g.lineWidth = 1;
      gh.comps.forEach((cp, j) => {
        g.strokeStyle = peakColor(j + 1);
        g.setLineDash([3, 3]);
        line(gh.x, cp);
      });
      if (gh.env) {
        g.strokeStyle = '#111111';
        g.setLineDash([6, 3]);
        line(gh.x, gh.env);
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    // every peak, filled from the baseline, in its colour
    run.comps.forEach((cp, j) => {
      const col = peakColor(j + 1);
      g.fillStyle = alpha(col, 0.22);
      g.beginPath();
      run.x.forEach((x, i) => g[i ? 'lineTo' : 'moveTo'](fx(x), fy(cp[i])));
      for (let i = run.x.length - 1; i >= 0; i--) g.lineTo(fx(run.x[i]), fy(run.base[i]));
      g.closePath();
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = 1.4;
      line(run.x, cp);
    });
    // the data
    const r = run.x.length > 3000 ? 1.2 : 2;
    g.fillStyle = '#1f6fd6';
    run.x.forEach((x, i) => {
      g.beginPath();
      g.arc(fx(x), fy(run.y[i]), r, 0, 2 * Math.PI);
      g.fill();
    });
    // the baseline, the envelope
    g.strokeStyle = '#555555';
    g.lineWidth = 1.2;
    g.setLineDash([5, 3]);
    line(run.x, run.base);
    g.setLineDash([]);
    if (run.env) {
      g.strokeStyle = '#111111';
      g.lineWidth = 1.6;
      line(run.x, run.env);
    }
    // the peaks marked: a line from the baseline, a diamond on the peak (its number is over the frame)
    run.marks.forEach((m, j) => {
      const col = peakColor(j + 1);
      const i = run.x.reduce((b, v, q) => (Math.abs(v - m.x) < Math.abs(run.x[b] - m.x) ? q : b), 0);
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(fx(m.x), fy(run.base[i]));
      g.lineTo(fx(m.x), fy(m.y));
      g.stroke();
      const [cx, cy] = [fx(m.x), fy(m.y)];
      g.fillStyle = col;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx, cy - 5);
      g.lineTo(cx + 4, cy);
      g.lineTo(cx, cy + 5);
      g.lineTo(cx - 4, cy);
      g.closePath();
      g.fill();
      g.stroke();
    });
    // the peaks found automatically, not kept yet: small triangles
    if (!run.marks.length)
      run.found.forEach((f) => {
        g.fillStyle = '#888888';
        g.beginPath();
        g.moveTo(fx(f.x), M.t + 2);
        g.lineTo(fx(f.x) - 4, M.t + 9);
        g.lineTo(fx(f.x) + 4, M.t + 9);
        g.fill();
      });
    // the baseline points
    for (const p of shownPts) {
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#222222';
      g.lineWidth = 1.4;
      g.fillRect(fx(p.x) - 3.5, fy(p.y) - 3.5, 7, 7);
      g.strokeRect(fx(p.x) - 3.5, fy(p.y) - 3.5, 7, 7);
    }
    g.restore();
    // the numbers of the peaks, over the frame
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    // (two numbers too close: the second one inside the frame, under the first)
    let last = -Infinity;
    let low = false;
    run.marks.forEach((m, j) => {
      const x = fx(m.x);
      if (x < M.l - 2 || x > M.l + pw + 2) return;
      low = x - last < 14 && !low;
      last = x;
      g.fillStyle = peakColor(j + 1);
      g.fillText(String(j + 1), x, low ? M.t + 12 : M.t - 5);
    });
    // the frame and the numbers
    g.strokeStyle = '#333333';
    g.lineWidth = 1;
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = '#333333';
    g.font = '10px system-ui, sans-serif';
    for (const t of axisTicks(sc.x, box.x0, box.x1, Math.max(3, Math.round(pw / 80)))) {
      g.textAlign = 'center';
      if (t.text) g.fillText(t.text, ux(t.u), M.t + ph + RH + 12);
      g.fillRect(ux(t.u), M.t + ph - (t.minor ? 2 : 4), 1, t.minor ? 2 : 4);
    }
    for (const t of axisTicks(sc.y, box.y0, box.y1, Math.max(3, Math.round(ph / 45)))) {
      g.textAlign = 'right';
      if (t.text) g.fillText(t.text, M.l - 4, uy(t.u) + 3);
      g.fillRect(M.l, uy(t.u), t.minor ? 2 : 4, 1);
    }
    g.textAlign = 'center';
    g.fillText(axisTitle(sc.x, props.xTitle), M.l + pw / 2, H - 4);
    if (hidden) {
      g.fillStyle = '#888888';
      g.textAlign = 'left';
      g.fillText(hidden, M.l + 4, M.t + ph - 5);
    }
    // the residuals below (when shown)
    if (RH) drawResiduals(g, { l: M.l, t: M.t + ph + 6, w: pw, h: RH - 10 }, run.resid ? run.x.map(fx) : [], run.resid ?? [], '#1f6fd6');
    if (z.rect) {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      g.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, shownPts, regions, box.x0, box.x1, box.y0, box.y1, z.rect, W, H, props.xTitle, RH, sc.x, sc.y, props.selected, props.ghost]);

  const at = (e: RPointerEvent | RMouseEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { px: ((e.clientX - b.left) * W) / b.width, py: ((e.clientY - b.top) * H) / b.height };
  };
  const nearPoint = (px: number, py: number) => pts.findIndex((p) => Math.abs(fx(p.x) - px) < 7 && Math.abs(fy(p.y) - py) < 7);
  // the edge of a region under the mouse (a few px)
  const nearEdge = (px: number): { k: number; side: 'from' | 'to' } | null => {
    for (const g of props.regions)
      for (const side of ['from', 'to'] as const) if (Math.abs(fx(g[side]) - px) < 5) return { k: g.k, side };
    return null;
  };
  // the region under the mouse (inside it; the narrowest when they overlap)
  const regionAt = (px: number): number | null => {
    const x = ix(px);
    const inside = props.regions.filter((g) => x >= Math.min(g.from, g.to) && x <= Math.max(g.from, g.to));
    if (!inside.length) return null;
    return inside.reduce((a, b) => (Math.abs(b.to - b.from) < Math.abs(a.to - a.from) ? b : a)).k;
  };
  // right-click on a region: its menu (Remove)
  const [menu, setMenu] = useState<{ x: number; y: number; k: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track
    }
    const { px, py } = at(e);
    if (z.down(px, py, e)) return;
    if (py > M.t + ph) return;
    if (props.placing) {
      const k = nearPoint(px, py);
      if (k >= 0) return setDrag({ kind: 'pt', k, x: pts[k].x, y: pts[k].y });
      return setDrag({ kind: 'pt', k: pts.length, x: ix(px), y: iy(py), fresh: true });
    }
    // an edge: dragged; inside a region: selected, and dragged whole (also while + Region is on: a new region is drawn
    // outside the others); else a new region, a peak, or nothing selected
    const edge = nearEdge(px);
    if (edge) {
      props.onSelect(edge.k);
      return setDrag({ kind: 'edge', ...edge, x: ix(px) });
    }
    const inside = regionAt(px);
    if (inside !== null) {
      props.onSelect(inside);
      return setDrag({ kind: 'shift', k: inside, at: ix(px), x: ix(px) });
    }
    props.onSelect(null);
    if (props.drawing) return setDrag({ kind: 'reg', x0: ix(px), x1: ix(px) });
    if (props.adding) props.onAdd(+ix(px).toPrecision(6));
  };
  const move = (e: RPointerEvent) => {
    const { px, py } = at(e);
    if (z.move(px, py)) return setCursor(props.zoom === 'pan' ? 'grab' : 'crosshair');
    const d = dragRef.current;
    if (!d) return setCursor(props.placing ? (nearPoint(px, py) >= 0 ? 'move' : 'crosshair') : nearEdge(px) ? 'ew-resize' : regionAt(px) !== null ? 'grab' : props.drawing ? 'col-resize' : props.adding ? 'copy' : 'default');
    if (d.kind === 'reg') return setDrag({ ...d, x1: ix(px) });
    if (d.kind === 'shift') return setDrag({ ...d, x: ix(px) });
    if (d.kind === 'edge') return setDrag({ ...d, x: ix(px) });
    setDrag({ ...d, x: ix(px), y: iy(py) });
  };
  const up = (e: RPointerEvent) => {
    const { px, py } = at(e);
    if (z.up(px, py)) return;
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const r6 = (v: number) => +v.toPrecision(6);
    if (d.kind === 'reg') {
      // a region wide enough (a click alone: none)
      if (Math.abs(fx(d.x1) - fx(d.x0)) >= 4) props.onRegion(r6(Math.min(d.x0, d.x1)), r6(Math.max(d.x0, d.x1)));
      return;
    }
    if (d.kind === 'edge') return props.onEdge(d.k, d.side, r6(d.x));
    if (d.kind === 'shift') {
      // (moved by a few px at least: else only selected)
      const g = props.regions.find((q) => q.k === d.k);
      if (g && Math.abs(fx(d.x) - fx(d.at)) >= 3) props.onShift(d.k, r6(g.from + d.x - d.at), r6(g.to + d.x - d.at));
      return;
    }
    const p = { x: +d.x.toPrecision(6), y: +d.y.toPrecision(6) };
    props.onPoints(d.fresh ? [...pts, p] : pts.map((q, k) => (k === d.k ? p : q)));
  };
  const dbl = (e: RMouseEvent) => {
    if (!props.placing) return;
    const { px, py } = at(e);
    const k = nearPoint(px, py);
    if (k >= 0) props.onPoints(pts.filter((_, j) => j !== k));
  };
  return (
    <div className="region-plot nodrag nowheel">
      <div className="reader-host">
      <canvas
        ref={cv}
        tabIndex={0}
        style={{ width: W, height: H, cursor }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onDoubleClick={dbl}
        onContextMenu={(e) => {
          const { px } = at(e);
          const k = regionAt(px);
          if (k === null) return;
          e.preventDefault();
          e.stopPropagation();
          props.onSelect(k);
          setMenu({ x: e.clientX, y: e.clientY, k });
        }}
        onWheel={(e) => {
          const { px, py } = at(e);
          z.wheel(px, py, e.deltaY, e);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            e.stopPropagation();
            props.onView(null);
          }
          // the region selected: removed (its peak too)
          if ((e.key === 'Delete' || e.key === 'Backspace') && props.selected !== null) {
            e.preventDefault();
            e.stopPropagation();
            props.onRemove(props.selected);
          }
        }}
      />
      {menu &&
        createPortal(
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            <button
              className="danger"
              onClick={() => {
                props.onRemove(menu.k);
                setMenu(null);
              }}
            >
              Remove peak {menu.k + 1} and its region <span className="kbd">Delete</span>
            </button>
          </div>,
          document.body,
        )}
      <ReaderLayer reader={props.reader} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />
      </div>
    </div>
  );
}

// the formula of a peak of every shape (A its height, xc its centre, w its FWHM)
const SHAPE_FORMULAS: Record<PeakShape, string> = {
  gauss: 'A·exp(−4 ln2 (x − xc)²/w²)',
  lorentz: 'A/(1 + 4(x − xc)²/w²)',
  voigt: 'A·[η·L + (1 − η)·G], L, G of FWHM w; μ the Lorentzian part of the area',
  voigtx: 'A·V(x − xc)/V(0), V the Voigt profile: Gaussian FWHM w, Lorentzian FWHM wL',
  fano: 'A·[(q + ε)²/(1 + ε²) − 1]/(1 + q²), ε = 2(x − xc)/w',
  ds: 'A·cos(πα/2 + (1 − α)·atan t)/[(1 + t²)^((1 − α)/2)·cos(πα/2)], t = 2(xc − x)/w',
};
const SHOWN_PEAKS = 8;
const pm = (v: number, e: number | undefined) => (e !== undefined && Number.isFinite(e) ? fmtPm(v, e) : fmtNum(v, 5));
// Under the graph: the shapes' formulas over the baseline, then every peak — its region (or place), centre, height,
// FWHM, area, area % (a fit: ± the errors of the centre and FWHM; % Gauss of a pseudo-Voigt); R²
function PeakResults({ table, baseline, r2, fitted, selected, onSelect }: { table: PeakView['table'][number]; baseline: string; r2: number; fitted: boolean; selected: number | null; onSelect: (k: number | null) => void }) {
  if (!table.length) return null;
  const shapes = [...new Set(table.flatMap((q) => (q.shape ? [q.shape] : [])))];
  return (
    <div className="peak-results">
      <div className="ellipsis" title={shapes.map((sh) => `${SHAPE_NAMES[sh]}: ${SHAPE_FORMULAS[sh]}`).join('\n')}>
        {fitted && shapes.length ? (
          <>
            y = baseline ({baseline}) + Σ peaks · {shapes.map((sh) => `${SHAPE_NAMES[sh]}: ${SHAPE_FORMULAS[sh]}`).join(' · ')}
          </>
        ) : (
          <span className="muted">measured on the data over the baseline ({baseline}){fitted ? '' : ': Run analysis for the fit'}</span>
        )}
        {Number.isFinite(r2) && <span className="muted"> · R² {fmtNum(r2, 6)}</span>}
      </div>
      {table.slice(0, SHOWN_PEAKS).map((q, j) => (
        <div key={j} className={`peak-result${selected === j ? ' on' : ''}`} onClick={() => q.region && onSelect(j)}>
          <span className="peak-swatch" style={{ background: peakColor(j + 1) }} />
          <b>{j + 1}</b>
          {q.of !== undefined && <span className="muted">2× of {q.of}</span>}
          {q.shape && <span className="muted">{SHAPE_NAMES[q.shape]}</span>}
          {q.region && <span className="muted">{fmtNum(q.region[0], 5)} – {fmtNum(q.region[1], 5)}</span>}
          <span>xc = {pm(q.center, q.centerErr)}</span>
          <span>height = {fmtNum(q.height, 4)}</span>
          <span>FWHM = {pm(q.fwhm, q.fwhmErr)}</span>
          <span>area = {fmtNum(q.area, 4)} ({fmtNum(q.pct, 3)} %)</span>
          {q.gauss !== undefined && <span>Gauss {pm(q.gauss, q.gaussErr)} %</span>}
        </div>
      ))}
      {table.length > SHOWN_PEAKS && <div className="muted">… {table.length - SHOWN_PEAKS} more in the table (in the options)</div>}
    </div>
  );
}

export function PeakNodeView({ id, data }: NodeProps<PeakNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<PeakData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const info = r?.view.peaks;
  const names = (r?.view.available ?? []).map((c) => c.name);
  const [shown, setShown] = useState(0);
  const [mode, setMode] = useState<'none' | 'peak' | 'base' | 'region'>('none');
  // the region selected on the graph (its peak in the list)
  const [selReg, setSelReg] = useState<number | null>(null);
  // Esc: + Region, + Point, Baseline points off
  useEffect(() => {
    if (mode === 'none') return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMode('none');
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mode]);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const labels = info?.labels ?? [];
  const k = Math.min(Math.max(0, shown), Math.max(0, labels.length - 1));
  const run = info?.runs[k];
  const table = info?.table[k] ?? [];
  const find = data.find;
  const setFind = (p: Partial<FindOptions>) => set({ find: { ...find, ...p } });
  const list = data.peaks;
  const setPeak = (j: number, p: Partial<PeakItem>) => set({ peaks: list.map((q, i) => (i === j ? { ...q, ...p } : q)) });
  // the peaks found in the run shown, kept as the list (then changed, added to)
  // found automatically, or chosen by hand (absent: by hand when there is a list, as older nodes)
  const manual = (data.mode ?? (list.length ? 'manual' : 'auto')) === 'manual';
  const placeOf = (q: PeakItem) => (Number.isFinite(q.from) && Number.isFinite(q.to) ? (q.from! + q.to!) / 2 : q.x);
  const sorted = (l: PeakItem[]) => [...l].sort((a, b) => placeOf(a) - placeOf(b));
  const keepFound = () => run && set({ mode: 'manual', peaks: run.found.map((f) => ({ shape: data.shape, x: +f.x.toPrecision(6) })) });
  const addPeak = (x: number) => {
    set({ mode: 'manual', peaks: sorted([...(manual ? list : (run?.found ?? []).map((f) => ({ shape: data.shape, x: +f.x.toPrecision(6) }))), { shape: data.shape, x }]) });
    setMode('none');
  };
  // a region drawn on the graph: a peak at its maximum (minimum) — the mode stays on for the next one; drawn while the
  // peaks are found automatically, those found stay (as points) and the list becomes yours
  const addRegion = (from: number, to: number) => {
    const before = manual ? list : (run?.found ?? []).map((f) => ({ shape: data.shape, x: +f.x.toPrecision(6) }));
    const peak = { shape: data.shape, x: (from + to) / 2, from, to };
    const next = sorted([...before, peak]);
    set({ mode: 'manual', peaks: next });
    setSelReg(next.indexOf(peak));
  };
  // a region moved whole; a peak removed with its region
  const shiftRegion = (j: number, from: number, to: number) => setPeak(j, { from, to, x: (from + to) / 2 });
  const removePeak = (j: number) => {
    set({ peaks: list.filter((_, i) => i !== j) });
    setSelReg(null);
  };
  const regions: PeakRegion[] = manual ? list.flatMap((q, j) => (Number.isFinite(q.from) && Number.isFinite(q.to) ? [{ k: j, from: q.from!, to: q.to!, color: peakColor(j + 1) }] : [])) : [];
  // Run analysis: the fit made with these settings (until they change)
  const runIt = () => set({ needRun: true, ran: peakRunKey({ ...data, needRun: true }) });
  const runState = info?.run;
  // the last fit of every run, shown faded while the settings changed since it (until Run analysis)
  const [lastFit, setLastFit] = useState<Record<string, PeakRunView>>({});
  const runLabel = labels[k] ?? '';
  // (kept as it comes: the state of this render follows the result)
  if (run && runState === 'fitted' && run.comps.length && lastFit[runLabel] !== run) setLastFit({ ...lastFit, [runLabel]: run });
  const ghost = runState === 'changed' ? lastFit[runLabel] : undefined;
  // the data reader: the data, the baseline, every peak, the envelope
  const readCurves: ReadCurve[] = run
    ? [
        { name: labels[k] || 'data', color: '#1f6fd6', x: run.x, y: run.y },
        { name: 'baseline', color: '#555555', x: run.x, y: run.base },
        ...run.comps.map((cp, j) => ({ name: `peak ${j + 1}`, color: peakColor(j + 1), x: run.x, y: cp })),
        ...(run.env ? [{ name: 'envelope', color: '#111111', x: run.x, y: run.env }] : []),
      ]
    : [];
  const reader: ReaderProp = { r: rd, curves: readCurves, onRead: (reading) => setRd((q) => ({ ...q, reading })) };
  const plot = (w: number, h: number) =>
    run && (
      <PeakPlot
        reader={reader}
        run={run}
        width={w}
        height={h}
        points={data.basePoints ?? []}
        placing={mode === 'base' && zoom === 'none'}
        onPoints={(basePoints) => set({ basePoints })}
        adding={mode === 'peak' && zoom === 'none'}
        onAdd={addPeak}
        regions={regions}
        drawing={mode === 'region' && zoom === 'none'}
        onRegion={addRegion}
        onEdge={(j, side, x) => setPeak(j, { [side]: x })}
        selected={selReg}
        onSelect={setSelReg}
        onShift={shiftRegion}
        onRemove={removePeak}
        ghost={ghost}
        xTitle={info?.xName ?? ''}
        yTitle={labels[k] ?? ''}
        zoom={zoom}
        view={view}
        onView={setView}
        zoomOut={out}
        resid={data.showResid !== false}
      />
    );
  const tools = (
    <>
    <div className="row wrap">
      <button
        className={`nodrag${mode === 'region' ? ' on' : ''}`}
        title={`Then drag across a peak on the graph: its region, the peak is taken at the maximum (or the minimum) of the data there, and stays in it in the fit${manual ? '' : ' (the peaks found stay, as a list of your own)'}. A region: click it to select it, drag it to move it, drag its edges, Delete or right-click to remove it. Esc: off`}
        onClick={() => setMode(mode === 'region' ? 'none' : 'region')}
      >
        + Region
      </button>
      <button className={`nodrag${mode === 'peak' ? ' on' : ''}`} title={manual ? 'Then click on the graph: a peak at that place (e.g. in a shoulder), added to the list' : 'Then click on the graph: a peak there; the peaks found become a list of your own, with this one'} onClick={() => setMode(mode === 'peak' ? 'none' : 'peak')}>
        + Point
      </button>
      {data.baseline === 'points' && (
        <button className={`nodrag${mode === 'base' ? ' on' : ''}`} title="Click on the graph: a point of the baseline; drag a point to move it, double-click to remove it" onClick={() => setMode(mode === 'base' ? 'none' : 'base')}>
          Baseline points
        </button>
      )}
      <button className={`nodrag${data.showResid !== false ? ' on' : ''}`} title={`${RESID_TITLE} in a panel under the graph: shown or hidden`} onClick={() => set({ showResid: data.showResid === false })}>
        Residuals
      </button>
      <span className="grow" />
      <ZoomTools
        scaled
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
          setMode('none');
        }}
      />
      <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
        <Maximize2 {...IC} /> Large
      </button>
    </div>
    <ReaderOptions r={rd} set={setRd} names={readCurves.map((c) => c.name)} />
    </>
  );
  return (
    <div className="node node-peaks">
      <InPort label="dataset" port="dataset" id="in" title="A dataset: X and the Y columns from the designations, or chosen below; every Y column analysed on its own" />
      <NodeOptions>
      {names.length > 0 && (
        <details open>
          <summary>1 · Data</summary>
          <div className="col-form">
            <span>X</span>
            <Select value={data.x || ''} options={[['', xAutoLabel(r?.view.available)], ['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x })} />
            <span>Y</span>
            <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} title="The Y columns: one, or several (a list: 2, B-D, names, A*); auto: the designated ones; each analysed on its own" onChange={(ys) => set({ ys })} />
            <span>Range</span>
            <span className="row">
              <NumInput className="short" value={data.from ?? NaN} placeholder="from" onChange={(from) => set({ from })} />
              <span>–</span>
              <NumInput className="short" value={data.to ?? NaN} placeholder="to" onChange={(to) => set({ to })} />
            </span>
          </div>
        </details>
      )}
      <details open>
        <summary>2 · Baseline</summary>
        <div className="col-form">
          <BaselineFields
            layout="form"
            title="Fitted together with the peaks, or fixed under them (not fitted): found on the points of the range"
            method={isFitted(data.baseline) ? data.baseline : baseMethodOf(data.baseline)}
            onMethod={(m) => set({ baseline: FITTED_BASES.includes(m as BaseKind) ? (m as BaseKind) : baseKindOf(m as BaseMethod) })}
            before={FITTED}
            opts={data.baseOpt}
            onOpts={(baseOpt) => set({ baseOpt })}
            value={data.baseValue ?? 0}
            onValue={(baseValue) => set({ baseValue })}
            interp={data.baseInterp}
            onInterp={(baseInterp) => set({ baseInterp })}
            ends="auto"
            autoUnder={find.sign === 'dips' ? 'dips' : 'peaks'}
            points={
              <>
                <span className="muted">{(data.basePoints ?? []).length} points</span>
                {(data.basePoints ?? []).length > 0 && (
                  <button className="nodrag" onClick={() => set({ basePoints: [] })}>
                    Clear
                  </button>
                )}
              </>
            }
            curve={<Select value={data.baseColumn ?? ''} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(baseColumn) => set({ baseColumn })} />}
          />
        </div>
        <Check label="Subtract it (the outputs over the baseline)" value={data.subtract} onChange={(subtract) => set({ subtract })} />
        {!data.subtract && <Check label="With the data" title="The data too on the main output, under the baseline and the peaks (to draw them all from this one dataset); else X, the baseline, the peaks and their sum only" value={data.withData !== false} onChange={(withData) => set({ withData })} />}
      </details>
      <details open>
        <summary>3 · Peaks</summary>
        <div className="row wrap">
          <Field label="The peaks" title="Found automatically in every run (all of one shape), or chosen by hand: a region dragged across each on the graph (+ Region), or a point (+ Point), each its own shape">
            <Select<'auto' | 'manual'>
              value={manual ? 'manual' : 'auto'}
              options={[
                ['auto', 'found automatically'],
                ['manual', 'chosen by hand'],
              ]}
              onChange={(m) => set({ mode: m })}
            />
          </Field>
        </div>
        <div className="row wrap">
          <Field label="Find" title="Maxima, minima (dips) or both: also what a region takes: its maximum for peaks, its minimum for dips">
            <Select seg
              value={find.sign}
              options={[
                ['peaks', 'peaks'],
                ['dips', 'dips'],
                ['both', 'both'],
              ]}
              onChange={(sign) => setFind({ sign })}
            />
          </Field>
          {!manual && (
            <>
          <Field label="At most" title="The most prominent ones">
            <NumInput className="tiny" min={1} max={40} step={1} value={find.count} onChange={(count) => setFind({ count: Math.max(1, Math.min(40, Math.floor(count) || 1)) })} />
          </Field>
          <Field label="Min. height %" title="Of the largest peak">
            <NumInput className="tiny" min={0} max={100} step={1} value={find.minHeight} onChange={(minHeight) => setFind({ minHeight: Math.max(0, Math.min(100, minHeight || 0)) })} />
          </Field>
            </>
          )}
          {!manual && <Check label="Shoulders" title="Also the peaks hidden in the side of another (from the second derivative)" value={find.shoulders} onChange={(shoulders) => setFind({ shoulders })} />}
        </div>
        {!manual ? (
          <div className="row wrap">
            <span className="hint">
              Found in every run{run ? `: ${run.found.length} here (${run.found.map((f) => fmtNum(f.x, 4)).join(', ')})` : ''}, as
            </span>
            <Select value={data.shape} options={SHAPES} onChange={(shape) => set({ shape })} />
            <button className="nodrag" disabled={!run?.found.length} title="The peaks found in the run shown as a list of your own (chosen by hand): change their shapes, add or remove some" onClick={keepFound}>
              Edit them by hand
            </button>
          </div>
        ) : (
          <>
            <div className="peak-list">
              {list.map((q, j) => (
                <div key={j} className={`row${selReg === j ? ' on' : ''}`} onClick={() => Number.isFinite(q.from) && setSelReg(j)}>
                  <span className="peak-swatch" style={{ background: peakColor(j + 1) }} />
                  <b>{j + 1}</b>
                  <Select value={q.shape} options={SHAPES} onChange={(shape) => setPeak(j, { shape })} />
                  {Number.isFinite(q.from) && Number.isFinite(q.to) ? (
                    <>
                      <Field label="Region" title="The peak is taken at the maximum (or the minimum) of the data over the baseline in it, and its centre stays in it in the fit (also: drag its edges on the graph)">
                        <span className="row">
                          <NumInput className="short" value={q.from!} onChange={(from) => Number.isFinite(from) && setPeak(j, { from })} />
                          <span>–</span>
                          <NumInput className="short" value={q.to!} onChange={(to) => Number.isFinite(to) && setPeak(j, { to })} />
                        </span>
                      </Field>
                      <Select<'max' | 'min'> seg
                        value={q.at ?? (find.sign === 'dips' ? 'min' : 'max')}
                        title="The peak at the maximum of the region, or at its minimum (a dip)"
                        options={[
                          ['max', 'at its max'],
                          ['min', 'at its min'],
                        ]}
                        onChange={(at) => setPeak(j, { at })}
                      />
                    </>
                  ) : (
                    <Field label="At" title="Where the peak is (its start in the fit)">
                      <NumInput className="short" value={q.x} onChange={(x) => setPeak(j, { x })} />
                    </Field>
                  )}
                  <button
                    className={`nodrag ts-btn${q.doublet ? ' on' : ''}`}
                    title="A doublet (spin–orbit): a second peak of the same shape and width at a fixed distance ΔX, its area a fixed part of this one's (2p: 0.5, 3d: 0.667, 4f: 0.75): linked to it in the fit"
                    onClick={() => setPeak(j, { doublet: q.doublet ? undefined : { dx: 1, ratio: 0.5 } })}
                  >
                    2×
                  </button>
                  {q.doublet && (
                    <>
                      <Field label="ΔX" title="The distance of the second peak (negative: on the left)">
                        <NumInput className="tiny" value={q.doublet.dx} onChange={(dx) => Number.isFinite(dx) && setPeak(j, { doublet: { ...q.doublet!, dx } })} />
                      </Field>
                      <Field label="ratio" title="The area of the second peak over this one's">
                        <NumInput className="tiny" step={0.05} min={0} value={q.doublet.ratio} onChange={(ratio) => Number.isFinite(ratio) && ratio > 0 && setPeak(j, { doublet: { ...q.doublet!, ratio } })} />
                      </Field>
                    </>
                  )}
                  <button className="nodrag ts-btn" title="Remove this peak" onClick={() => removePeak(j)}>
                    <X {...IC} />
                  </button>
                </div>
              ))}
            </div>
            {!list.length && <div className="hint">No peak yet: + Region, then drag across a peak on the graph (it is taken at its maximum, or minimum); + Point, then click where one is.</div>}
            <div className="row wrap">
              <button className={`nodrag${mode === 'region' ? ' on' : ''}`} title="Then drag across a peak on the graph: its region" onClick={() => setMode(mode === 'region' ? 'none' : 'region')}>
                + Region
              </button>
              <button className={`nodrag${mode === 'peak' ? ' on' : ''}`} title="Then click on the graph: a peak at that place" onClick={() => setMode(mode === 'peak' ? 'none' : 'peak')}>
                + Point
              </button>
              {list.length > 0 && (
                <button className="nodrag" title="Remove every peak of the list" onClick={() => set({ peaks: [] })}>
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </details>
      <details open>
        <summary>4 · Fit</summary>
        <Check label="Fit the peaks: all together, as a sum (peak deconvolution: overlapping peaks separated); else measured on the data" value={data.fit} onChange={(fit) => set({ fit })} />
        {data.fit && (
          <div className="row wrap">
            <button className="nodrag btn-run" title="Fit the peaks with these settings (the fit is made only here; a setting changed asks for a new Run)" onClick={runIt}>
              Run analysis
            </button>
            <span className={`muted${runState === 'changed' ? ' warn-text' : ''}`}>
              {!data.needRun ? 'fitted at every change (an older node): Run analysis fits only when pressed' : runState === 'fitted' ? `fitted${Number.isFinite(run?.r2) ? ` · R² ${fmtNum(run!.r2, 6)}` : ''}` : runState === 'changed' ? 'settings changed: Run again' : 'not run yet: the peaks are measured on the data'}
            </span>
          </div>
        )}
      </details>
      </NodeOptions>
      {labels.length > 1 && (
        <div className="row fit-runs">
          <button className="nodrag ts-btn" disabled={k === 0} onClick={() => setShown(k - 1)}>
            <ChevronLeft {...IC} />
          </button>
          <select className="nodrag grow" value={k} onChange={(e) => setShown(Number(e.target.value))}>
            {labels.map((lab, j) => (
              <option key={j} value={j}>
                {j + 1}. {lab}
              </option>
            ))}
          </select>
          <button className="nodrag ts-btn" disabled={k >= labels.length - 1} onClick={() => setShown(k + 1)}>
            <ChevronRight {...IC} />
          </button>
        </div>
      )}
      {run && (
        <>
          {tools}
          {plot(520, 330)}
          <NodeOptions>
          {table.length > 0 && (
            <table className="peak-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>center</th>
                  <th>height</th>
                  <th>FWHM</th>
                  <th>area</th>
                  <th>area %</th>
                  {table.some((q) => q.gauss !== undefined) && <th title="A pseudo-Voigt's Gaussian part of the area: 100(1 − μ) ± its error">% Gauss</th>}
                </tr>
              </thead>
              <tbody>
                {table.map((q, j) => (
                  <tr key={j}>
                    <td>
                      <span className="peak-swatch" style={{ background: peakColor(j + 1) }} />
                      {j + 1}
                      {q.of !== undefined && <span className="muted" title={`The doublet partner of peak ${q.of}`}> ({q.of})</span>}
                    </td>
                    <td>{fmtNum(q.center, 5)}</td>
                    <td>{fmtNum(q.height, 4)}</td>
                    <td>{fmtNum(q.fwhm, 4)}</td>
                    <td>{fmtNum(q.area, 4)}</td>
                    <td>{fmtNum(q.pct, 3)}</td>
                    {table.some((t) => t.gauss !== undefined) && <td title={q.gauss !== undefined ? fmtPm(q.gauss, q.gaussErr ?? NaN) : ''}>{q.gauss !== undefined ? fmtNum(q.gauss, 3) : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </NodeOptions>
          <PeakResults table={table} baseline={data.baseline} r2={run.r2} fitted={!!data.fit && runState !== 'changed' && runState !== 'never'} selected={selReg} onSelect={setSelReg} />
        </>
      )}
      <Messages result={r} />
      <OutPort label="data" port="dataset" id="out" title="X, Y (or Y − baseline), the baseline, every peak and the envelope (their sum): a run after another; Plot these columns draws the peaks separated" />
      <OutPort label="peaks" port="dataset" id="table" title="A row per peak: center, height, FWHM, area, area % (and the errors and R² of the fit, or the centroid and limits)" />
      <OutPort label="baseline" port="dataset" id="base" title="X and the baseline of every run" />
      <OutPort label="residuals" port="dataset" id="resid" title="X and data − (baseline + peaks) of every run (with a fit)" />
      {big &&
        run &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {plot(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(360, Math.min((window.innerHeight || 800) * 0.74, 820)))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
