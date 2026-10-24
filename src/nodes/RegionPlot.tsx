// The graph of Differentiate / Integrate: two panels on the same X. Top, the data of the run shown with its regions
// (each its colour and number, 1, 2 …; “Add a range” draws one, then stops; the edges of a region are dragged) and
// the baseline (its points placed, moved and removed with the mouse when “Baseline points” is on). Below, apart, the
// derivative or the integral with its own axis.
import { ReaderLayer, type ReaderProp } from './CanvasReader.tsx';
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import type { Pt, Region } from '../engine/calculus.ts';
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import { regionColor } from './regionColors.ts';
import { usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';

const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const M = { l: 56, r: 10, t: 8 };
const C = { data: '#1f6fd6', unused: '#b4b4b4', result: '#d62728', base: '#555555' };

type Box = { x0: number; x1: number; y0: number; y1: number };
type Drag = { kind: 'new' | 'lo' | 'hi'; k: number; a: number; b: number } | { kind: 'pt'; k: number; x: number; y: number; fresh?: boolean } | null;

// the extent of finite values, with a margin
function extent(xs: ArrayLike<number>[], ys: ArrayLike<number>[]): Box {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const a of xs) for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) [x0, x1] = [Math.min(x0, a[i]), Math.max(x1, a[i])];
  for (const a of ys) for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) [y0, y1] = [Math.min(y0, a[i]), Math.max(y1, a[i])];
  if (!Number.isFinite(x0)) [x0, x1] = [0, 1];
  if (!Number.isFinite(y0)) [y0, y1] = [0, 1];
  const px = (x1 - x0 || 1) * 0.03;
  const py = (y1 - y0 || Math.abs(y0) || 1) * 0.07;
  return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
}

// the frame, the numbers on both axes and the titles of one panel
function axes(g: CanvasRenderingContext2D, box: Box, W: number, top: number, ph: number, fx: (v: number) => number, fy: (v: number) => number, yTitle: string, xTitle: string) {
  const pw = W - M.l - M.r;
  g.strokeStyle = '#333333';
  g.lineWidth = 1;
  g.strokeRect(M.l + 0.5, top + 0.5, pw, ph);
  g.fillStyle = '#333333';
  g.font = '10px system-ui, sans-serif';
  const tick = (lo: number, hi: number, horiz: boolean) => {
    const st = niceStep(hi - lo, horiz ? Math.max(3, Math.round(pw / 80)) : Math.max(2, Math.round(ph / 40)));
    for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) {
      const t = fmtNum(Math.abs(v) < st * 1e-9 ? 0 : v, 4);
      if (horiz) {
        const p = fx(v);
        g.textAlign = 'center';
        g.fillText(t, p, top + ph + 12);
        g.fillRect(p, top + ph - 4, 1, 4);
      } else {
        const p = fy(v);
        g.textAlign = 'right';
        g.fillText(t, M.l - 4, p + 3);
        g.fillRect(M.l, p, 4, 1);
      }
    }
  };
  tick(box.x0, box.x1, true);
  tick(box.y0, box.y1, false);
  if (xTitle) {
    g.textAlign = 'center';
    g.fillText(xTitle, M.l + pw / 2, top + ph + 25);
  }
  g.save();
  g.translate(11, top + ph / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'center';
  g.fillText(yTitle.length > 28 ? `${yTitle.slice(0, 27)}…` : yTitle, 0, 0);
  g.restore();
}

export function RegionPlot(props: {
  x: Float64Array;
  y: Float64Array;
  run: Int32Array;
  used: Uint8Array;
  shown: number;
  regions: Region[];
  onRegions: (r: Region[]) => void;
  adding: boolean;
  onAdded: () => void;
  points?: Pt[];
  onPoints?: (p: Pt[]) => void;
  placing?: boolean;
  base?: { x: number[]; y: number[] };
  fills?: { index: number; x: number[]; y: number[]; b: number[] }[];
  lower?: { x: number[]; y: number[] };
  lowerTitle: string;
  width: number;
  topH: number;
  lowerH: number;
  xTitle: string;
  yTitle: string;
  // zoom / pan (the view of the top panel; the panel below follows on X)
  zoom?: ZoomMode;
  view?: View | null;
  onView?: (v: View | null) => void;
  zoomOut?: number;
  // Peak width: no panel below (lowerH 0: X titled on the top one); the extrema marked, the half heights as segments
  marks?: { x: number; y: number; color: string; down: boolean }[];
  segments?: { x0: number; y0: number; x1: number; y1: number; color: string }[];
  // the data reader on the top panel (its curves: the data of the run shown and the baseline)
  reader?: Omit<ReaderProp, 'curves'>;
  // the line over the data: its name (absent: baseline), drawn solid in a colour of its own (absent: grey, dashed)
  baseName?: string;
  baseColor?: string;
  // below: more lines (each its colour), a band (the mean ± SD of an average)
  lowerMore?: { x: number[]; y: number[]; color: string }[];
  lowerBand?: { x: number[]; lo: number[]; hi: number[] };
}) {
  const { x, y, run, used, shown, regions, width: W, topH, lowerH } = props;
  const one = lowerH <= 0;
  const top = useRef<HTMLCanvasElement>(null);
  const low = useRef<HTMLCanvasElement>(null);
  const [drag, setDragState] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  const [cursor, setCursor] = useState('default');
  const setDrag = (d: Drag) => {
    dragRef.current = d;
    setDragState(d);
  };
  const pw = W - M.l - M.r;
  const ph = topH - M.t - (one ? 32 : 20);
  const lh = lowerH - M.t - 32;
  // the points of the run shown
  const idx: number[] = [];
  for (let i = 0; i < x.length; i++) if (run[i] === shown && Number.isFinite(x[i]) && Number.isFinite(y[i])) idx.push(i);
  const pts = props.points ?? [];
  // the range of the data only: the baseline follows the points placed — with it (and them) in the range, the graph
  // rescaled at every point and the points jumped away from where they were clicked
  const box = viewBox(props.view, extent([idx.map((i) => x[i])], [idx.map((i) => y[i])]));
  const z = usePlotZoom(props.zoom ?? 'none', { l: M.l, t: M.t, w: pw, h: ph }, box, (v) => props.onView?.(v));
  // Zoom out (the button): the view widened around its middle
  useEffect(() => {
    if (props.zoomOut) props.onView?.(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.zoomOut]);
  const lbox = { ...extent([[box.x0, box.x1]], [props.lower?.y ?? [], ...(props.lowerMore ?? []).map((q) => q.y), props.lowerBand?.lo ?? [], props.lowerBand?.hi ?? []]), x0: box.x0, x1: box.x1 };
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  const ly = (v: number) => M.t + (1 - (v - lbox.y0) / (lbox.y1 - lbox.y0)) * lh;
  const ix = (p: number) => box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
  const iy = (p: number) => box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
  // the regions and the points as they are while dragged
  const shownRegions = drag && drag.kind !== 'pt' ? (drag.kind === 'new' ? [...regions, { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) }] : regions.map((r, k) => (k === drag.k ? (drag.kind === 'lo' ? { ...r, lo: drag.b } : { ...r, hi: drag.b }) : r))) : regions;
  const shownPts = drag?.kind === 'pt' ? (drag.fresh ? [...pts, { x: drag.x, y: drag.y }] : pts.map((p, k) => (k === drag.k ? { x: drag.x, y: drag.y } : p))) : pts;
  const span = (r: Region): [number, number] => {
    const [l, h] = [Number.isFinite(r.lo) ? r.lo : box.x0, Number.isFinite(r.hi) ? r.hi : box.x1];
    return [fx(Math.min(l, h)), fx(Math.max(l, h))];
  };

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const prep = (c: HTMLCanvasElement | null, h: number) => {
      if (!c) return null;
      c.width = W * dpr;
      c.height = h * dpr;
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, h);
      return g;
    };
    // ---- top: the data, the regions, the baseline ----
    const g = prep(top.current, topH);
    if (g) {
      shownRegions.forEach((r, k) => {
        const [a, b] = span(r);
        const col = regionColor(k);
        g.fillStyle = alpha(col, 0.16);
        g.fillRect(Math.max(M.l, a), M.t, Math.min(M.l + pw, b) - Math.max(M.l, a), ph);
        g.fillStyle = col;
        for (const e of [a, b]) if (e >= M.l && e <= M.l + pw) g.fillRect(e - 1, M.t, 2, ph);
        g.font = 'bold 10px system-ui, sans-serif';
        g.textAlign = 'center';
        const mid = (Math.max(M.l, a) + Math.min(M.l + pw, b)) / 2;
        g.fillText(`${k + 1}`, Math.min(Math.max(mid, M.l + 14), M.l + pw - 14), M.t + 11);
      });
      g.save();
      g.beginPath();
      g.rect(M.l, M.t, pw, ph);
      g.clip();
      // the area of every region, hatched in its colour: between the curve and its baseline
      for (const f of props.fills ?? []) {
        if (f.x.length < 2) continue;
        const col = f.index < 0 ? '#888888' : regionColor(f.index);
        const tile = document.createElement('canvas');
        tile.width = tile.height = 8;
        const t = tile.getContext('2d')!;
        t.strokeStyle = col;
        t.lineWidth = 1.2;
        t.beginPath();
        t.moveTo(0, 8);
        t.lineTo(8, 0);
        t.moveTo(-2, 2);
        t.lineTo(2, -2);
        t.moveTo(6, 10);
        t.lineTo(10, 6);
        t.stroke();
        g.fillStyle = g.createPattern(tile, 'repeat') ?? alpha(col, 0.3);
        g.beginPath();
        f.x.forEach((v, j) => g[j ? 'lineTo' : 'moveTo'](fx(v), fy(f.y[j])));
        for (let j = f.x.length - 1; j >= 0; j--) g.lineTo(fx(f.x[j]), fy(f.b[j]));
        g.closePath();
        g.globalAlpha = 0.75;
        g.fill();
        g.globalAlpha = 1;
      }
      const r = idx.length > 3000 ? 1.2 : 2.2;
      for (const i of idx) {
        g.fillStyle = used[i] ? C.data : C.unused;
        g.beginPath();
        g.arc(fx(x[i]), fy(y[i]), r, 0, 2 * Math.PI);
        g.fill();
      }
      // the baseline under the regions
      const bs = props.base;
      if (bs && bs.x.length) {
        g.strokeStyle = props.baseColor ?? C.base;
        g.lineWidth = props.baseColor ? 1.6 : 1.2;
        g.setLineDash(props.baseColor ? [] : [5, 3]);
        g.beginPath();
        let on = false;
        for (let k = 0; k < bs.x.length; k++) {
          if (!Number.isFinite(bs.y[k]) || !Number.isFinite(bs.x[k])) {
            on = false;
            continue;
          }
          g[on ? 'lineTo' : 'moveTo'](fx(bs.x[k]), fy(bs.y[k]));
          on = true;
        }
        g.stroke();
        g.setLineDash([]);
      }
      // the half heights (FWHM) and the extrema
      for (const s of props.segments ?? []) {
        if (![s.x0, s.y0, s.x1, s.y1].every(Number.isFinite)) continue;
        g.strokeStyle = s.color;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(fx(s.x0), fy(s.y0));
        g.lineTo(fx(s.x1), fy(s.y1));
        g.stroke();
        for (const [u, v] of [[s.x0, s.y0], [s.x1, s.y1]]) g.fillRect(fx(u) - 1, fy(v) - 4, 2, 8);
      }
      for (const m of props.marks ?? []) {
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
        const [px, py] = [fx(m.x), fy(m.y)];
        const s = m.down ? 1 : -1;
        g.fillStyle = m.color;
        g.beginPath();
        g.moveTo(px, py + s * 2);
        g.lineTo(px - 5, py + s * 10);
        g.lineTo(px + 5, py + s * 10);
        g.closePath();
        g.fill();
      }
      // the baseline points
      for (const p of shownPts) {
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#222222';
        g.lineWidth = 1.4;
        g.fillRect(fx(p.x) - 3.5, fy(p.y) - 3.5, 7, 7);
        g.strokeRect(fx(p.x) - 3.5, fy(p.y) - 3.5, 7, 7);
      }
      g.restore();
      axes(g, box, W, M.t, ph, fx, fy, props.yTitle, one ? props.xTitle : '');
      if (z.rect) {
        g.strokeStyle = '#1f6fd6';
        g.setLineDash([4, 3]);
        g.lineWidth = 1;
        g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
        g.setLineDash([]);
      }
    }
    // ---- below: the result ----
    const h = one ? null : prep(low.current, lowerH);
    if (h) {
      shownRegions.forEach((rg, k) => {
        const [a, b] = span(rg);
        h.fillStyle = alpha(regionColor(k), 0.08);
        h.fillRect(Math.max(M.l, a), M.t, Math.min(M.l + pw, b) - Math.max(M.l, a), lh);
      });
      const lw = props.lower;
      h.save();
      h.beginPath();
      h.rect(M.l, M.t, pw, lh);
      h.clip();
      if (lbox.y0 < 0 && lbox.y1 > 0) {
        h.fillStyle = '#cccccc';
        h.fillRect(M.l, ly(0), pw, 1);
      }
      // (a band: the area between its two edges, a gap where they are not numbers)
      const bd = props.lowerBand;
      if (bd) {
        h.fillStyle = alpha(C.result, 0.18);
        for (let k = 0; k + 1 < bd.x.length; k++) {
          if (![bd.lo[k], bd.hi[k], bd.lo[k + 1], bd.hi[k + 1]].every(Number.isFinite)) continue;
          h.beginPath();
          h.moveTo(fx(bd.x[k]), ly(bd.hi[k]));
          h.lineTo(fx(bd.x[k + 1]), ly(bd.hi[k + 1]));
          h.lineTo(fx(bd.x[k + 1]), ly(bd.lo[k + 1]));
          h.lineTo(fx(bd.x[k]), ly(bd.lo[k]));
          h.closePath();
          h.fill();
        }
      }
      for (const q of props.lowerMore ?? []) {
        h.strokeStyle = q.color;
        h.lineWidth = 1.2;
        h.beginPath();
        let on = false;
        for (let k = 0; k < q.x.length; k++) {
          if (!Number.isFinite(q.y[k])) {
            on = false;
            continue;
          }
          h[on ? 'lineTo' : 'moveTo'](fx(q.x[k]), ly(q.y[k]));
          on = true;
        }
        h.stroke();
      }
      if (lw && lw.x.length) {
        h.strokeStyle = C.result;
        h.lineWidth = 1.5;
        h.beginPath();
        let on = false;
        for (let k = 0; k < lw.x.length; k++) {
          if (!Number.isFinite(lw.y[k])) {
            on = false;
            continue;
          }
          h[on ? 'lineTo' : 'moveTo'](fx(lw.x[k]), ly(lw.y[k]));
          on = true;
        }
        h.stroke();
      }
      h.restore();
      axes(h, lbox, W, M.t, lh, fx, ly, props.lowerTitle, props.xTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, run, used, shown, shownRegions, shownPts, props.base, props.fills, props.lower, props.lowerMore, props.lowerBand, props.baseColor, props.view, props.marks, props.segments, z.rect, W, topH, lowerH, props.xTitle, props.yTitle, props.lowerTitle]);

  // ---- the mouse on the top panel ----
  const at = (e: RPointerEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { px: ((e.clientX - b.left) * W) / b.width, py: ((e.clientY - b.top) * topH) / b.height };
  };
  const nearPoint = (px: number, py: number) => pts.findIndex((p) => Math.abs(fx(p.x) - px) < 7 && Math.abs(fy(p.y) - py) < 7);
  const nearEdge = (px: number): { kind: 'lo' | 'hi'; k: number; a: number } | null => {
    for (let k = 0; k < regions.length; k++) {
      const [a, b] = [regions[k].lo, regions[k].hi];
      if (Number.isFinite(a) && Math.abs(fx(a) - px) < 5) return { kind: 'lo', k, a };
      if (Number.isFinite(b) && Math.abs(fx(b) - px) < 5) return { kind: 'hi', k, a: b };
    }
    return null;
  };
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
    if (props.placing && props.onPoints) {
      const k = nearPoint(px, py);
      if (k >= 0) return setDrag({ kind: 'pt', k, x: pts[k].x, y: pts[k].y });
      // a new point (added when the mouse is released, so it can be dragged at once)
      return setDrag({ kind: 'pt', k: pts.length, x: ix(px), y: iy(py), fresh: true });
    }
    const ed = nearEdge(px);
    if (ed) return setDrag({ kind: ed.kind, k: ed.k, a: ed.a, b: ed.a });
    if (props.adding) setDrag({ kind: 'new', k: -1, a: ix(px), b: ix(px) });
  };
  const move = (e: RPointerEvent) => {
    const { px, py } = at(e);
    if (z.move(px, py)) return setCursor(props.zoom === 'pan' ? 'grab' : 'crosshair');
    const d = dragRef.current;
    if (!d) {
      setCursor(props.placing ? (nearPoint(px, py) >= 0 ? 'move' : 'crosshair') : nearEdge(px) ? 'ew-resize' : props.adding ? 'col-resize' : 'default');
      return;
    }
    if (d.kind === 'pt') setDrag({ ...d, x: ix(px), y: iy(py) });
    else setDrag({ ...d, b: ix(px) });
  };
  const up = (e: RPointerEvent) => {
    const { px, py } = at(e);
    if (z.up(px, py)) return;
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const r6 = (v: number) => +v.toPrecision(6);
    if (d.kind === 'pt') {
      const p = { x: r6(d.x), y: r6(d.y) };
      props.onPoints?.(d.fresh ? [...pts, p] : pts.map((q, k) => (k === d.k ? p : q)));
    } else if (d.kind === 'new') {
      if (Math.abs(fx(d.b) - fx(d.a)) > 3) {
        props.onRegions([...regions, { lo: r6(Math.min(d.a, d.b)), hi: r6(Math.max(d.a, d.b)) }]);
        props.onAdded();
      }
    } else props.onRegions(regions.map((r, k) => (k === d.k ? (d.kind === 'lo' ? { ...r, lo: r6(d.b) } : { ...r, hi: r6(d.b) }) : r)));
  };
  // a double click on a point removes it
  const dbl = (e: RMouseEvent) => {
    if (!props.placing || !props.onPoints) return;
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = ((e.clientX - b.left) * W) / b.width;
    const py = ((e.clientY - b.top) * topH) / b.height;
    const k = nearPoint(px, py);
    if (k >= 0) props.onPoints(pts.filter((_, j) => j !== k));
  };
  return (
    <div className="region-plot nodrag nowheel">
      <div className="region-panel-title">Data</div>
      <div className="reader-host">
      <canvas
        ref={top}
        tabIndex={0}
        style={{ width: W, height: topH, cursor }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onDoubleClick={dbl}
        onWheel={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          z.wheel(((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * topH) / b.height, e.deltaY, e);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            e.stopPropagation();
            props.onView?.(null);
          }
        }}
      />
      {props.reader && (
        <ReaderLayer
          reader={{ ...props.reader, curves: [{ name: props.yTitle || 'data', color: '#1f6fd6', x: idx.map((i) => x[i]), y: idx.map((i) => y[i]) }, ...(props.base ? [{ name: props.baseName ?? 'baseline', color: props.baseColor ?? '#555555', x: props.base.x, y: props.base.y }] : [])] }}
          W={W}
          H={topH}
          map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }}
        />
      )}
      </div>
      {!one && (
        <>
          <div className="region-panel-title">{props.lowerTitle}</div>
          <canvas ref={low} style={{ width: W, height: lowerH }} />
        </>
      )}
    </div>
  );
}
