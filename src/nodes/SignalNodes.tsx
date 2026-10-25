// The Signal nodes: Smooth, Interpolate / Extrapolate, Normalize, FFT, Convolution, Average curves — the data (X, Y columns), the
// method and its options, a graph of the data (dots) and the result (a line) of the Y chosen, with the ranges of X the
// node works in (Add a range: dragged on the graph), the outputs. Kramers–Kronig
// (in Analysis) is drawn the same way: its graphs with the tails assumed dashed, past dashed lines where the data end.
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { columnLetter } from '../engine/csv.ts';
import { useNodeResult } from '../engine/engine.ts';
import type { NodeResult } from '../engine/evaluate.ts';
import type { SignalIn, SignalPlot } from '../engine/signalnodes.ts';
import type { Region } from '../engine/calculus.ts';
import { regionColor } from './regionColors.ts';
import { RunRangesTable } from './FitNode.tsx';
import { fmtNum, type ColumnRole } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import type { AppNode, AverageData, AverageNode, ConvData, ConvNode, FFTData, FFTNode, InterpData, InterpNode, KKData, KKNode, NormalizeData, NormalizeNode, SmoothData, SmoothNode } from '../types.ts';
import { KK_DEFAULTS } from '../engine/kk.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { maxOf } from '../engine/minmax.ts';
import { WAVELETS } from '../engine/wavelet.ts';
import { createPortal } from 'react-dom';
import { Maximize2, MoveHorizontal, X as XIcon } from 'lucide-react';
import { IC } from './iconProps.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve, type ReaderProp } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

// a plot with a logarithmic X: its X values (all of them) as their log10, the points at X ≤ 0 left out
function logPlot(p: SignalPlot): SignalPlot {
  const lg = (c: { x: number[]; y: number[] }) => {
    const keep = c.x.map((v) => v > 0);
    return { x: c.x.filter((_, i) => keep[i]).map(Math.log10), y: c.y.filter((_, i) => keep[i]) };
  };
  return {
    ...p,
    ...(p.data ? { data: lg(p.data) } : {}),
    result: lg(p.result),
    ...(p.others ? { others: p.others.map(lg) } : {}),
    ...(p.series ? { series: p.series.map((sr) => ({ ...sr, ...lg(sr) })) } : {}),
    ...(p.band ? { band: { x: p.band.x.map((v) => Math.log10(Math.max(v, 1e-300))), lo: p.band.lo, hi: p.band.hi } } : {}),
    ...(p.marks ? { marks: p.marks.filter((v) => v > 0).map(Math.log10) } : {}),
  };
}

const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const W0 = 520;
const H0 = 230;
const M = { l: 52, r: 10, t: 8, b: 30 };

// the limits of curves (with a margin above and below)
function rangeOf(sets: { x: number[]; y: number[] }[]): [number, number, number, number] {
  let [a, b, c, d] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const st of sets)
    st.x.forEach((v, i) => {
      if (!Number.isFinite(v) || !Number.isFinite(st.y[i])) return;
      [a, b, c, d] = [Math.min(a, v), Math.max(b, v), Math.min(c, st.y[i]), Math.max(d, st.y[i])];
    });
  if (c === d) [c, d] = [c - 1, d + 1];
  const p = (d - c) * 0.06;
  return [a, b, c - p, d + p];
}

// the graph of one Y: the data as dots, the result as a line (on its own axis at the right when asked); zoomed and
// panned with the tools above it (the result's axis follows), read with the data reader; the ranges shaded (each its
// colour), one added by dragging while “Add a range” is on, their edges dragged
type RangeDrag = { kind: 'new' | 'lo' | 'hi'; k: number; a: number; b: number } | null;
function SignalGraph({ plot: given, W, H, zoom, view, onView, zoomOut, reader, regions, onRegions, adding, onAdded }: { plot: SignalPlot; W: number; H: number; zoom: ZoomMode; view: View | null; onView: (v: View | null) => void; zoomOut: number; reader?: Omit<ReaderProp, 'curves'>; regions?: Region[]; onRegions?: (r: Region[]) => void; adding?: boolean; onAdded?: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [drag, setDragState] = useState<RangeDrag>(null);
  const dragRef = useRef<RangeDrag>(null);
  const setDrag = (d: RangeDrag) => {
    dragRef.current = d;
    setDragState(d);
  };
  const rgs = regions ?? [];
  // (the ranges as they are while dragged)
  const shownRegions = drag ? (drag.kind === 'new' ? [...rgs, { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) }] : rgs.map((r, k) => (k === drag.k ? (drag.kind === 'lo' ? { ...r, lo: drag.b } : { ...r, hi: drag.b }) : r))) : rgs;
  // (a logarithmic X: everything drawn on log10 of it, the ticks labelled with the values)
  const plot = useMemo(() => (given.logX ? logPlot(given) : given), [given]);
  const [cursor, setCursor] = useState('default');
  // the limits: of everything, or (the result on its own axis, at the right) of the data and of the result apart
  const own = !!plot.ownAxis && !!plot.data;
  const all = [plot.result, ...(plot.data ? [plot.data] : []), ...(plot.others ?? []), ...(plot.series ?? []), ...(plot.band ? [{ x: plot.band.x, y: plot.band.lo }, { x: plot.band.x, y: plot.band.hi }] : [])];
  let [x0, x1, y0, y1] = rangeOf(own ? [plot.data!] : all);
  const [rx0, rx1, r0, r1] = own ? rangeOf([plot.result]) : [x0, x1, y0, y1];
  [x0, x1] = [Math.min(x0, rx0), Math.max(x1, rx1)];
  if (x1 === x0) [x0, x1] = [x0 - 1, x1 + 1];
  const okBox = [x0, x1, y0, y1].every(Number.isFinite);
  const auto = okBox ? { x0, x1, y0, y1 } : { x0: 0, x1: 1, y0: 0, y1: 1 };
  const box = viewBox(view, auto);
  const pw = W - M.l - (own ? M.l : M.r);
  const ph = H - M.t - M.b;
  const z = usePlotZoom(zoom, { l: M.l, t: M.t, w: pw, h: ph }, box, onView);
  useEffect(() => {
    if (zoomOut) onView(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOut]);
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  const ix = (p: number) => box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
  const iy = (p: number) => box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
  // the result's own axis: the same part of its range as the left axis shows of its own (it follows the zoom)
  const toLeft = (u: number) => auto.y0 + ((u - r0) / (r1 - r0)) * (auto.y1 - auto.y0);
  const [q0, q1] = [r0 + ((box.y0 - auto.y0) / (auto.y1 - auto.y0)) * (r1 - r0), r0 + ((box.y1 - auto.y0) / (auto.y1 - auto.y0)) * (r1 - r0)];
  const fr = (u: number) => fy(toLeft(u));
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
    if (!okBox) return;
    g.save();
    g.beginPath();
    g.rect(M.l, M.t, pw, ph);
    g.clip();
    // the ranges: shaded, their edges in their colour
    shownRegions.forEach((rg, k) => {
      const [a, b] = [Number.isFinite(rg.lo) ? fx(rg.lo) : M.l, Number.isFinite(rg.hi) ? fx(rg.hi) : M.l + pw];
      g.fillStyle = alpha(regionColor(k), 0.12);
      g.fillRect(Math.min(a, b), M.t, Math.abs(b - a), ph);
      g.fillStyle = regionColor(k);
      for (const e of [a, b]) g.fillRect(e - 0.75, M.t, 1.5, ph);
    });
    if (plot.band) {
      // the range (± SD), shaded
      const { x, lo, hi } = plot.band;
      g.fillStyle = plot.bandColor ?? 'rgba(214, 39, 40, 0.15)';
      g.beginPath();
      x.forEach((v, i) => g[i ? 'lineTo' : 'moveTo'](fx(v), fy(hi[i])));
      for (let i = x.length - 1; i >= 0; i--) g.lineTo(fx(x[i]), fy(lo[i]));
      g.closePath();
      g.fill();
    }
    if (plot.zero && box.y0 < 0 && box.y1 > 0) {
      g.strokeStyle = '#9aa3ad';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(M.l, fy(0));
      g.lineTo(M.l + pw, fy(0));
      g.stroke();
    }
    // where the data end: dashed lines across
    for (const m of plot.marks ?? []) {
      g.strokeStyle = '#7a7a7a';
      g.lineWidth = 1;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(fx(m), M.t);
      g.lineTo(fx(m), M.t + ph);
      g.stroke();
      g.setLineDash([]);
    }
    for (const sr of plot.series ?? []) {
      g.strokeStyle = sr.color;
      g.fillStyle = sr.color;
      g.lineWidth = sr.dash ? 1.4 : 1.2;
      if (sr.line || !sr.dots) {
        g.setLineDash(sr.dash ? [6, 4] : []);
        g.beginPath();
        let on = false;
        sr.x.forEach((v, i) => {
          const u = sr.y[i];
          if (!Number.isFinite(u) || !Number.isFinite(v)) return void (on = false);
          g[on ? 'lineTo' : 'moveTo'](fx(v), fy(u));
          on = true;
        });
        g.stroke();
        g.setLineDash([]);
      }
      if (sr.dots)
        sr.x.forEach((v, i) => {
          if (!Number.isFinite(sr.y[i])) return;
          g.beginPath();
          g.arc(fx(v), fy(sr.y[i]), 1.8, 0, 2 * Math.PI);
          g.fill();
        });
    }
    for (const o of plot.others ?? []) {
      g.strokeStyle = '#9aa3ad';
      g.lineWidth = 1;
      g.beginPath();
      o.x.forEach((v, i) => g[i ? 'lineTo' : 'moveTo'](fx(v), fy(o.y[i])));
      g.stroke();
    }
    if (plot.data) {
      g.fillStyle = '#1f6fd6';
      const r = plot.data.x.length > 2000 ? 1 : 1.8;
      plot.data.x.forEach((v, i) => {
        if (!Number.isFinite(plot.data!.y[i])) return;
        g.beginPath();
        g.arc(fx(v), fy(plot.data!.y[i]), r, 0, 2 * Math.PI);
        g.fill();
      });
    }
    g.strokeStyle = '#d62728';
    g.lineWidth = 1.5;
    g.beginPath();
    let on = false;
    plot.result.x.forEach((v, i) => {
      const u = plot.result.y[i];
      if (!Number.isFinite(u) || !Number.isFinite(v)) return void (on = false);
      g[on ? 'lineTo' : 'moveTo'](fx(v), own ? fr(u) : fy(u));
      on = true;
    });
    g.stroke();
    g.restore();
    g.strokeStyle = '#333333';
    g.lineWidth = 1;
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = '#333333';
    g.font = '10px system-ui, sans-serif';
    const sx = plot.logX ? Math.max(1, Math.round(niceStep(box.x1 - box.x0, Math.max(3, Math.round(pw / 80))))) : niceStep(box.x1 - box.x0, Math.max(3, Math.round(pw / 80)));
    for (let v = Math.ceil(box.x0 / sx) * sx; v <= box.x1 + sx * 1e-9; v += sx) {
      g.textAlign = 'center';
      g.fillText(plot.logX ? fmtNum(10 ** Math.round(v), 3) : fmtNum(Math.abs(v) < sx * 1e-9 ? 0 : v, 4), fx(v), H - M.b + 12);
    }
    const sy = niceStep(box.y1 - box.y0, Math.max(3, Math.round(ph / 40)));
    for (let v = Math.ceil(box.y0 / sy) * sy; v <= box.y1 + sy * 1e-9; v += sy) {
      g.textAlign = 'right';
      g.fillText(fmtNum(Math.abs(v) < sy * 1e-9 ? 0 : v, 4), M.l - 4, fy(v) + 3);
    }
    if (own) {
      // the axis of the result, at the right, in its colour
      g.fillStyle = '#d62728';
      const sr = niceStep(q1 - q0, Math.max(3, Math.round(ph / 40)));
      for (let v = Math.ceil(q0 / sr) * sr; v <= q1 + sr * 1e-9; v += sr) {
        g.textAlign = 'left';
        g.fillText(fmtNum(Math.abs(v) < sr * 1e-9 ? 0 : v, 4), M.l + pw + 4, fr(v) + 3);
      }
      g.fillStyle = '#1f6fd6';
      g.textAlign = 'left';
      g.fillText('data', M.l + 4, M.t + 11);
      g.fillStyle = '#d62728';
      g.textAlign = 'right';
      g.fillText('result (right axis)', M.l + pw - 4, M.t + 11);
      g.fillStyle = '#333333';
    }
    // (the names of the curves, in their colours, at the top left)
    const names: [string, string][] = [...(plot.legend?.[0] && plot.data ? [[plot.legend[0], '#1f6fd6'] as [string, string]] : []), ...(plot.legend?.[plot.data ? 1 : 0] && plot.result.x.length ? [[plot.legend[plot.data ? 1 : 0], '#d62728'] as [string, string]] : []), ...(plot.series ?? []).map((sr): [string, string] => [sr.name, sr.color])];
    if (!own && names.length) {
      g.textAlign = 'left';
      let tx = M.l + 6;
      for (const [nm, col] of names) {
        g.fillStyle = col;
        g.fillText(nm, tx, M.t + 11);
        tx += g.measureText(nm).width + 12;
      }
      g.fillStyle = '#333333';
    }
    g.textAlign = 'center';
    g.fillText(plot.xName, M.l + pw / 2, H - 3);
    if (z.rect) {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      g.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot, W, H, box.x0, box.x1, box.y0, box.y1, z.rect, shownRegions]);
  const at = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const nearEdge = (px: number): { kind: 'lo' | 'hi'; k: number; a: number } | null => {
    if (!onRegions) return null;
    for (let k = 0; k < rgs.length; k++) {
      const [a, b] = [rgs[k].lo, rgs[k].hi];
      if (Number.isFinite(a) && Math.abs(fx(a) - px) < 5) return { kind: 'lo', k, a };
      if (Number.isFinite(b) && Math.abs(fx(b) - px) < 5) return { kind: 'hi', k, a: b };
    }
    return null;
  };
  const r6 = (v: number) => +v.toPrecision(6);
  const curves: ReadCurve[] = [...(plot.data ? [{ name: 'data', color: '#1f6fd6', x: plot.data.x, y: plot.data.y }] : []), { name: own ? 'result (right axis)' : 'result', color: '#d62728', x: plot.result.x, y: plot.result.y, ...(own ? { onAxis: toLeft } : {}) }, ...(plot.others ?? []).map((o, j) => ({ name: `curve ${j + 1}`, color: '#9aa3ad', x: o.x, y: o.y })), ...(plot.series ?? []).map((sr) => ({ name: sr.name, color: sr.color, x: sr.x, y: sr.y }))];
  return (
    <div className="reader-host nodrag nowheel">
      <canvas
        ref={cv}
        className="signal-graph"
        tabIndex={0}
        style={{ width: W, height: H, cursor }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            // a pointer the browser does not track
          }
          const [px, py] = at(e);
          if (z.down(px, py, e)) return;
          const ed = nearEdge(px);
          if (ed) return setDrag({ kind: ed.kind, k: ed.k, a: ed.a, b: ed.a });
          if (adding && onRegions) setDrag({ kind: 'new', k: -1, a: ix(px), b: ix(px) });
        }}
        onPointerMove={(e) => {
          const [px, py] = at(e);
          if (z.move(px, py)) return setCursor(zoom === 'pan' ? 'grab' : 'crosshair');
          const d = dragRef.current;
          if (d) return setDrag({ ...d, b: ix(px) });
          setCursor(zoom !== 'none' ? 'crosshair' : nearEdge(px) ? 'ew-resize' : adding ? 'col-resize' : 'default');
        }}
        onPointerUp={(e) => {
          const [px, py] = at(e);
          if (z.up(px, py)) return;
          const d = dragRef.current;
          setDrag(null);
          if (!d || !onRegions) return;
          if (d.kind === 'new') {
            if (Math.abs(fx(d.b) - fx(d.a)) > 3) {
              onRegions([...rgs, { lo: r6(Math.min(d.a, d.b)), hi: r6(Math.max(d.a, d.b)) }]);
              onAdded?.();
            }
          } else onRegions(rgs.map((r, k) => (k === d.k ? (d.kind === 'lo' ? { ...r, lo: r6(d.b) } : { ...r, hi: r6(d.b) }) : r)));
        }}
        onWheel={(e) => z.wheel(...at(e), e.deltaY, e)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            e.stopPropagation();
            onView(null);
          }
        }}
      />
      {reader && <ReaderLayer reader={{ ...reader, curves }} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />}
    </div>
  );
}

function useSignal<T>(id: string) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  return { r, avail: r?.view.available, names: (r?.view.available ?? []).map((c) => c.name), set: (p: Partial<T>) => updateNodeData(id, p as Record<string, unknown>) };
}
// outside the ranges (Smooth, Convolution, the FFT filter): the data kept, or nothing; shown when there are ranges
function OutsideRow<T extends SignalIn>({ data, set }: { data: T; set: (p: Partial<T>) => void }) {
  if (!data.regions?.length && !Object.keys(data.runRegions ?? {}).length) return null;
  return (
    <>
      <span>Outside</span>
      <Select<'keep' | 'empty'>
        value={data.outside ?? 'keep'}
        title="Outside the ranges: the data as they are, or nothing (empty cells)"
        options={[
          ['keep', 'the data, as they are'],
          ['empty', 'nothing (empty)'],
        ]}
        onChange={(outside) => set({ outside: outside === 'keep' ? undefined : outside } as Partial<T>)}
      />
    </>
  );
}
// the data: X and the Y columns
function DataRows<T extends { x: string; ys: string }>({ data, set, names, avail }: { data: T; set: (p: Partial<T>) => void; names: string[]; avail?: { name: string; role?: ColumnRole }[] }) {
  return (
    <>
      <span>X</span>
      <Select value={data.x} options={[['', xAutoLabel(avail)], ['-', 'row number'], ...names.map((n): [string, string] => [n, n])]} onChange={(x) => set({ x } as Partial<T>)} />
      <span>Y</span>
      <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} title="The Y columns: one, or several (a list: 2, B-D, names, A*); auto: the designated ones; each processed on its own" onChange={(ys) => set({ ys } as Partial<T>)} />
    </>
  );
}
// the ranges of a node, as Result edits them: the same for every Y, or of each Y (by its name); one: a single range
// (Normalize: its From – to)
export type ResultRanges = { data: Pick<SignalIn, 'regions' | 'regionsBy' | 'runRegions'>; set: (p: Pick<SignalIn, 'regions' | 'regionsBy' | 'runRegions'>) => void; one?: boolean; hint?: string };
// the graph of the Y chosen, the messages
// (with its tools — zoom, pan, out, rescale, the data reader, the graph large — as the other graphs of the nodes; Add a
// range, the ranges as chips and, per Y, their table, when the node works in ranges)
export function Result({ r, children, ranges }: { r?: NodeResult; children?: ReactNode; ranges?: ResultRanges }) {
  const [k, setK] = useState(0);
  const [adding, setAdding] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const s = r?.view.signal;
  const j = Math.min(k, Math.max(0, (s?.plots.length ?? 1) - 1));
  const plot = s?.plots[j];
  const names = plot ? [...(plot.data ? ['data'] : []), plot.ownAxis && plot.data ? 'result (right axis)' : 'result', ...(plot.others ?? []).map((_, q) => `curve ${q + 1}`)] : [];
  // the ranges: on the graphs whose X is the data's; of the Y shown when they are per Y
  const rg = ranges && plot?.ranges ? ranges : undefined;
  const runs = [...new Set((s?.plots ?? []).flatMap((q) => (q.ranges && q.run ? [q.run] : [])))];
  const perRun = !!ranges && !ranges.one && runs.length > 1 && ranges.data.regionsBy === 'run';
  const run = plot?.run ?? '';
  const own = perRun && run ? ranges!.data.runRegions?.[run] : undefined;
  const regions = own?.length ? own : (ranges?.data.regions ?? []);
  const setRunRegions = (lab: string, rgs: Region[] | undefined) => {
    const next = { ...ranges!.data.runRegions };
    if (rgs?.length) next[lab] = rgs;
    else delete next[lab];
    ranges!.set({ runRegions: next });
  };
  const setRegions = (rgs: Region[]) => (ranges!.one ? ranges!.set({ regions: rgs.slice(-1) }) : perRun && run ? setRunRegions(run, rgs) : ranges!.set({ regions: rgs }));
  const graph = (w: number, h: number) => plot && <SignalGraph plot={plot} W={w} H={h} zoom={zoom} view={view} onView={setView} zoomOut={out} reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }} regions={rg ? regions : undefined} onRegions={rg ? setRegions : undefined} adding={adding} onAdded={() => setAdding(false)} />;
  const tools = (
    <>
      <div className="row wrap">
        {rg && (
          <button
            className={`nodrag${adding ? ' on' : ''}`}
            title={rg.hint ?? (rg.one ? 'Then drag on the graph: the range the factor is taken from (its edges can be dragged at any time)' : 'Then drag on the graph: one range (the node works only in the ranges); the button turns off after it. The edges of a range can be dragged at any time')}
            onClick={() => {
              setAdding((v) => !v);
              setZoom('none');
              setRd((q) => ({ ...q, on: false }));
            }}
          >
            <MoveHorizontal {...IC} /> {rg.one && regions.length ? 'Draw it again' : 'Add a range'}
          </button>
        )}
        {rg && (perRun ? !!own?.length : regions.length > 0) && (
          <button className="nodrag" title={perRun ? 'This Y takes the common ranges again' : 'No ranges: all X'} onClick={() => (perRun ? setRunRegions(run, undefined) : ranges!.set({ regions: [] }))}>
            {perRun ? 'Common ranges' : 'All X'}
          </button>
        )}
        {rg && !rg.one && runs.length > 1 && (
          <Select
            value={ranges!.data.regionsBy ?? 'all'}
            title="The same ranges for every Y, or ranges of its own for each Y (dragged on its graph, or typed in the table below; a Y without its own takes the common ones)"
            options={[
              ['all', 'same ranges, all Y'],
              ['run', 'ranges per Y'],
            ]}
            onChange={(regionsBy) => ranges!.set({ regionsBy })}
          />
        )}
        <span className="grow" />
        <ZoomTools
          mode={zoom}
          setMode={(m) => {
            setZoom(m);
            if (m !== 'none') {
              setAdding(false);
              setRd((q) => ({ ...q, on: false }));
            }
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
            setAdding(false);
          }}
        />
        <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
      <ReaderOptions r={rd} set={setRd} names={names} />
    </>
  );
  // (the ranges as chips, removed one by one; per Y, their table)
  const chips = ranges && (ranges.data.regions?.length || (perRun && Object.keys(ranges.data.runRegions ?? {}).length)) ? (
    <NodeOptions>
      {regions.length > 0 && (
        <div className="row wrap fit-ranges">
          <span className="muted">{ranges.one ? 'From – to:' : perRun ? (own?.length ? `Ranges of “${run}”:` : 'Common ranges:') : 'Ranges:'}</span>
          {regions.map((q, i) => (
            <span key={i} className="chip region-chip" style={{ borderColor: regionColor(i) }}>
              {!ranges.one && <b style={{ color: regionColor(i) }}>{i + 1})</b>} {Number.isFinite(q.lo) ? fmtNum(q.lo, 5) : '…'} – {Number.isFinite(q.hi) ? fmtNum(q.hi, 5) : '…'}
              <button className="nodrag ts-btn" onClick={() => (perRun && !own?.length ? ranges.set({ regions: (ranges.data.regions ?? []).filter((_, h) => h !== i) }) : setRegions(regions.filter((_, h) => h !== i)))}>
                <XIcon {...IC} />
              </button>
            </span>
          ))}
          {!rg && <span className="muted">(drawn on the graph of the data: Graph of)</span>}
        </div>
      )}
      {perRun && <RunRangesTable labels={runs} common={ranges.data.regions ?? []} own={ranges.data.runRegions ?? {}} onChange={setRunRegions} onShow={(q) => setK(Math.max(0, (s?.plots ?? []).findIndex((p) => p.ranges && p.run === runs[q])))} shown={Math.max(0, runs.indexOf(run))} />}
    </NodeOptions>
  ) : null;
  return (
    <>
      {s && s.plots.length > 1 && (
        <div className="row">
          <Field label="Graph of">
            <Select value={j} options={s.labels.map((l, i): [number, string] => [i, l])} onChange={setK} />
          </Field>
        </div>
      )}
      {plot && tools}
      {graph(W0, H0)}
      {chips}
      {big &&
        plot &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <XIcon {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {graph(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(320, Math.min((window.innerHeight || 800) * 0.7, 760)))}
            </div>
          </div>,
          document.body,
        )}
      {children}
      <Messages result={r} />
    </>
  );
}
const EDGES: [string, string][] = [
  ['reflect', 'reflected (d c b a | a b c d)'],
  ['mirror', 'mirrored (d c b | a b c d)'],
  ['nearest', 'the end value repeated'],
  ['shrink', 'the window shrunk'],
];

export function SmoothNodeView({ id, data }: NodeProps<SmoothNode>) {
  const { r, avail, names, set } = useSignal<SmoothData>(id);
  const m = data.method;
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X and the Y columns (designated, or chosen)" />
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        <OutsideRow data={data} set={set} />
        <span>Method</span>
        <Select<SmoothData['method']>
          value={m}
          options={[
            ['savgol', 'Savitzky–Golay'],
            ['average', 'adjacent averaging'],
            ['median', 'median (spikes)'],
            ['gauss', 'Gaussian'],
            ['lowess', 'LOWESS'],
            ['fft', 'FFT low pass'],
            ['wavelet', 'wavelet denoising'],
            ['hampel', 'Hampel (outliers replaced)'],
          ]}
          onChange={(method) => set({ method })}
        />
        {m === 'hampel' && (
          <>
            <span>Window</span>
            <span className="row">
              <NumInput className="tiny" min={3} step={2} value={data.points} title="Points in the window (odd): the median and the MAD of every point’s neighbours" onChange={(points) => set({ points: Math.max(3, Math.floor(points) || 3) })} />
              <span className="muted">points, beyond</span>
              <NumInput className="tiny" min={0} step={0.5} value={data.nsigma ?? 3} title="A point further from the median of its window than this many robust SDs (1.4826 · MAD) is replaced by the median (0: a median filter)" onChange={(nsigma) => set({ nsigma: Number.isFinite(nsigma) && nsigma >= 0 ? nsigma : 3 })} />
              <span className="muted">σ</span>
            </span>
          </>
        )}
        {m === 'wavelet' && (
          <>
            <span>Wavelet</span>
            <span className="row">
              <Select
                value={data.wavelet ?? 'db4'}
                title="The wavelet of the discrete transform: Haar (steps), Daubechies 2 or 4, Symlet 4 (smooth curves)"
                options={Object.entries(WAVELETS).map(([k, w]): [string, string] => [k, w.label])}
                onChange={(wavelet) => set({ wavelet })}
              />
              <span>Levels</span>
              <NumInput className="tiny" min={1} max={12} step={1} value={data.wlevel ?? 4} title="The levels of the transform (more: the slower changes are treated too)" onChange={(wlevel) => set({ wlevel: Math.max(1, Math.min(12, Math.round(wlevel) || 4)) })} />
            </span>
            <span>Threshold</span>
            <span className="row">
              <Select<'soft' | 'hard'> seg
                value={data.wmode ?? 'soft'}
                title="Soft: the details shrunk toward 0 by the threshold; hard: those under it set to 0, the others kept"
                options={[
                  ['soft', 'soft'],
                  ['hard', 'hard'],
                ]}
                onChange={(wmode) => set({ wmode })}
              />
              <span className="muted">×</span>
              <NumInput className="tiny" min={0} step={0.1} value={data.wscale ?? 1} title="A factor on the universal threshold σ·√(2 ln n) (σ from the finest details): larger, smoother" onChange={(wscale) => set({ wscale: Number.isFinite(wscale) && wscale >= 0 ? wscale : 1 })} />
            </span>
          </>
        )}
        {(m === 'savgol' || m === 'average' || m === 'median') && (
          <>
            <span>Window</span>
            <span className="row">
              <NumInput className="tiny" min={1} step={2} value={data.points} title="Points in the window (odd)" onChange={(points) => set({ points: Math.max(1, Math.floor(points) || 1) })} />
              <span className="muted">points</span>
              {m === 'savgol' && (
                <>
                  <span>Degree</span>
                  <NumInput className="tiny" min={0} max={10} step={1} value={data.order} onChange={(order) => set({ order: Math.max(0, Math.min(10, Math.floor(order) || 0)) })} />
                </>
              )}
            </span>
          </>
        )}
        {m === 'gauss' && (
          <>
            <span>σ</span>
            <span className="row">
              <NumInput className="short" min={0.1} step={0.5} value={data.sigma} onChange={(sigma) => set({ sigma: Math.max(0.1, sigma || 1) })} />
              <span className="muted">points</span>
            </span>
          </>
        )}
        {m === 'lowess' && (
          <>
            <span>Fraction</span>
            <span className="row">
              <NumInput className="short" min={0.01} max={1} step={0.05} value={data.frac} title="The fraction of the points in every local fit" onChange={(frac) => set({ frac: Math.min(1, Math.max(0.01, frac || 0.2)) })} />
              <span>Robust passes</span>
              <NumInput className="tiny" min={0} max={10} step={1} value={data.iter} onChange={(iter) => set({ iter: Math.max(0, Math.min(10, Math.floor(iter) || 0)) })} />
            </span>
          </>
        )}
        {m === 'fft' && (
          <>
            <span>Cut-off</span>
            <span className="row">
              <NumInput className="short" min={0.001} max={1} step={0.01} value={data.cutoff} onChange={(cutoff) => set({ cutoff: Math.min(1, Math.max(0.001, cutoff || 0.1)) })} />
              <span className="muted">× the Nyquist frequency</span>
            </span>
          </>
        )}
        {m !== 'lowess' && m !== 'fft' && m !== 'wavelet' && m !== 'hampel' && (
          <>
            <span>Ends</span>
            <Select value={data.edge} options={m === 'savgol' ? [['interp', 'the polynomial of the end window'], ...EDGES.filter(([k]) => k !== 'shrink')] : EDGES} onChange={(edge) => set({ edge: edge as SmoothData['edge'] })} />
          </>
        )}
      </div>
      <div className="row wrap">
        <Check label="With the data" value={data.withData} onChange={(withData) => set({ withData })} />
        <Check label="With the residual" value={data.withResid} onChange={(withResid) => set({ withResid })} />
      </div>
      </NodeOptions>
      <Result r={r} ranges={{ data, set }} />
      <OutPort label="dataset" port="dataset" id="out" title="X, the data (optional), the smoothed curves, the residuals (optional)" />
    </div>
  );
}

export function InterpNodeView({ id, data }: NodeProps<InterpNode>) {
  const { r, avail, names, set } = useSignal<InterpData>(id);
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X and the Y columns (designated, or chosen)" />
      <InPort label="at" port="column" id="at" title="Optional: the new X (a column, or a dataset: its X), New X ▸ from the “at” port" />
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        <span>Method</span>
        <Select<InterpData['method']>
          value={data.method}
          options={[
            ['linear', 'linear'],
            ['spline', 'cubic spline (natural)'],
            ['akima', 'Akima'],
            ['pchip', 'PCHIP (monotone)'],
            ['nearest', 'nearest point'],
          ]}
          onChange={(method) => set({ method })}
        />
        <span>New X</span>
        <span className="row">
          <Select<InterpData['grid']>
            value={data.grid}
            options={[
              ['points', 'a number of points'],
              ['step', 'a step'],
              ['at', 'from the “at” port'],
            ]}
            onChange={(grid) => set({ grid })}
          />
          {data.grid === 'points' && <NumInput className="tiny" min={2} step={50} value={data.points} onChange={(points) => set({ points: Math.max(2, Math.floor(points) || 100) })} />}
          {data.grid === 'step' && <NumInput className="short" value={data.step} onChange={(step) => set({ step })} />}
        </span>
        {data.grid !== 'at' && (
          <>
            <span>From – to</span>
            <span className="row">
              <NumInput className="short" value={data.from} placeholder="all" title="From this X (empty: the first X of the data)" onChange={(from) => set({ from })} />
              <span>–</span>
              <NumInput className="short" value={data.to} placeholder="all" title="Up to this X (empty: the last X of the data)" onChange={(to) => set({ to })} />
            </span>
          </>
        )}
        <span>Outside</span>
        <Select<InterpData['extrap']>
          value={data.extrap}
          options={[
            ['none', 'empty (no extrapolation)'],
            ['constant', 'the end value'],
            ['linear', 'a straight line from the end'],
            ['method', 'extrapolated by the method'],
          ]}
          onChange={(extrap) => set({ extrap })}
        />
      </div>
      </NodeOptions>
      <Result r={r} ranges={{ data, set, hint: 'Then drag on the graph: one range (only the points inside the ranges are used)' }} />
      <OutPort label="dataset" port="dataset" id="out" title="The new X and every curve read on it" />
    </div>
  );
}

export function NormalizeNodeView({ id, data }: NodeProps<NormalizeNode>) {
  const { r, avail, names, set } = useSignal<NormalizeData>(id);
  const m = data.method;
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X and the Y columns (designated, or chosen)" />
      <InPort label="by" port="column" id="by" title="Optional: a column to divide by, point by point (Divide ▸ by a column)" />
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        <span>Normalize</span>
        <Select<NormalizeData['method']>
          value={m}
          options={[
            ['max', 'maximum = 1'],
            ['maxabs', 'largest |value| = 1'],
            ['minmax', 'range 0 … 1'],
            ['area', 'area = 1'],
            ['atx', 'value at X = 1'],
            ['first', 'first point = 1'],
            ['zscore', 'z-score (mean 0, SD 1)'],
            ['value', 'divided by a value'],
            ['column', 'divided by a column (“by”)'],
          ]}
          onChange={(method) => set({ method })}
        />
        {m === 'atx' && (
          <>
            <span>At X =</span>
            <NumInput className="short" value={data.at} onChange={(at) => set({ at })} />
          </>
        )}
        {m === 'value' && (
          <>
            <span>Value</span>
            <NumInput className="short" value={data.value} onChange={(value) => set({ value })} />
          </>
        )}
        {m !== 'column' && m !== 'value' && m !== 'atx' && (
          <>
            <span>From – to</span>
            <span className="row">
              <NumInput className="short" value={data.from} placeholder="all" title="The factor taken from the points between From and To" onChange={(from) => set({ from })} />
              <span>–</span>
              <NumInput className="short" value={data.to} placeholder="all" onChange={(to) => set({ to })} />
            </span>
          </>
        )}
      </div>
      </NodeOptions>
      <Result r={r} ranges={m !== 'column' && m !== 'value' && m !== 'atx' ? { data: { regions: Number.isFinite(data.from) || Number.isFinite(data.to) ? [{ lo: data.from, hi: data.to }] : [] }, set: (q) => q.regions && set({ from: q.regions[0]?.lo ?? NaN, to: q.regions[0]?.hi ?? NaN }), one: true } : undefined} />
      <OutPort label="dataset" port="dataset" id="out" title="The normalized curves" />
      <OutPort label="factors" port="dataset" id="factors" title="Every Y column: what was subtracted and what it was divided by" />
    </div>
  );
}

export function FFTNodeView({ id, data }: NodeProps<FFTNode>) {
  const { r, avail, names, set } = useSignal<FFTData>(id);
  const mode = data.mode;
  const spec = mode === 'spectrum';
  const iir = mode === 'filter' && !!data.design && data.design !== 'fft';
  const welchy = mode === 'psd' || mode === 'spectrogram' || mode === 'coherence';
  const windowRow = (
    <>
      <span>Window</span>
      <span className="row">
        <Select<FFTData['window']>
          value={data.window}
          options={[
            ['none', 'none (rectangular)'],
            ['hann', 'Hann'],
            ['hamming', 'Hamming'],
            ['blackman', 'Blackman'],
          ]}
          onChange={(window) => set({ window })}
        />
        <Select<FFTData['detrend']>
          value={data.detrend}
          title={welchy ? 'Removed from every segment' : 'Removed before the FFT'}
          options={[
            ['none', 'as it is'],
            ['mean', 'mean removed'],
            ['linear', 'line removed'],
          ]}
          onChange={(detrend) => set({ detrend })}
        />
      </span>
    </>
  );
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X (evenly spaced) and the Y columns" />
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        {mode === 'filter' && <OutsideRow data={data} set={set} />}
        <span>Mode</span>
        <Select<FFTData['mode']>
          value={mode}
          title="Spectrum: the FFT of the whole record; PSD: the power spectral density averaged over segments (Welch); spectrogram: the PSD of every segment in time; coherence: how much two signals (the first two Y) go together at every frequency; Hilbert: the envelope, phase and frequency of a signal; Allan deviation: the stability against the averaging time (a rate measured every step); wavelet scalogram: the power at every time and frequency (Morlet)"
          options={[
            ['spectrum', 'spectrum'],
            ['psd', 'power spectral density (Welch)'],
            ['spectrogram', 'spectrogram (in time)'],
            ['coherence', 'coherence (two Y)'],
            ['hilbert', 'envelope and phase (Hilbert)'],
            ['allan', 'Allan deviation'],
            ['cwt', 'wavelet scalogram (Morlet)'],
            ['lombscargle', 'Lomb–Scargle (X uneven)'],
            ['harmonics', 'harmonics (THD, SNR, SINAD)'],
            ['filter', 'filter (low / high / band)'],
          ]}
          onChange={(mode) => set({ mode })}
        />
        {mode === 'lombscargle' && (
          <>
            <span>Frequencies</span>
            <span className="row">
              <NumInput className="short" min={0} value={data.lsMin ?? NaN} placeholder="auto" title="From (empty: half of the step of the frequencies)" onChange={(lsMin) => set({ lsMin: Number.isFinite(lsMin) && lsMin > 0 ? lsMin : undefined })} />
              <span>–</span>
              <NumInput className="short" min={0} value={data.lsMax ?? NaN} placeholder="auto" title="To (empty: the mean Nyquist frequency, points / 2 T; uneven sampling can show higher ones)" onChange={(lsMax) => set({ lsMax: Number.isFinite(lsMax) && lsMax > 0 ? lsMax : undefined })} />
            </span>
            <span>Per peak</span>
            <span className="row">
              <NumInput className="tiny" min={1} step={1} value={data.lsOver ?? 5} title="The frequencies in the width of a peak (1 / T): the step 1 / (this · T)" onChange={(lsOver) => set({ lsOver: Math.max(1, Math.round(lsOver) || 5) })} />
              <span className="muted">points, false alarm</span>
              <NumInput className="tiny" min={0.001} max={50} step={0.1} value={data.lsFap ?? 1} title="The line drawn at the power with this false-alarm probability, in % (Baluev 2008)" onChange={(lsFap) => set({ lsFap: lsFap > 0 ? Math.min(50, lsFap) : 1 })} />
              <span className="muted">%</span>
            </span>
          </>
        )}
        {mode === 'harmonics' && (
          <>
            <span>Harmonics</span>
            <span className="row">
              <NumInput className="tiny" min={2} max={50} step={1} value={data.nHarm ?? 6} title="With the fundamental (6: the fundamental and 5 harmonics, as MATLAB’s thd)" onChange={(nHarm) => set({ nHarm: Math.max(2, Math.min(50, Math.round(nHarm) || 6)) })} />
              <span className="muted">fundamental</span>
              <NumInput className="short" min={0} value={data.f0 ?? NaN} placeholder="strongest" title="The frequency of the fundamental (empty: the strongest peak)" onChange={(f0) => set({ f0: Number.isFinite(f0) && f0 > 0 ? f0 : undefined })} />
            </span>
          </>
        )}
        {spec && (
          <>
            <span>Output</span>
            <Select<FFTData['output']>
              value={data.output}
              options={[
                ['amp', 'amplitude'],
                ['power', 'power'],
                ['db', 'amplitude (dB)'],
                ['phase', 'phase (°)'],
                ['reim', 'real and imaginary'],
              ]}
              onChange={(output) => set({ output })}
            />
            {windowRow}
          </>
        )}
        {welchy && (
          <>
            <span>Segments</span>
            <span className="row">
              <NumInput className="tiny" min={8} step={64} value={data.seg ?? NaN} placeholder="auto" title="The points of every segment (empty: a power of 2 near a quarter of the record, at most 256): more, finer in frequency, fewer averaged" onChange={(seg) => set({ seg: Number.isFinite(seg) && seg >= 8 ? Math.round(seg) : undefined })} />
              <span className="muted">points, overlap</span>
              <NumInput className="tiny" min={0} max={95} step={5} value={Math.round((data.overlap ?? 0.5) * 100)} title="The overlap of the segments, in %" onChange={(o) => set({ overlap: Number.isFinite(o) ? Math.min(95, Math.max(0, o)) / 100 : 0.5 })} />
              <span className="muted">%</span>
            </span>
            {windowRow}
            {mode !== 'coherence' && (
              <>
                <span>Scaling</span>
                <span className="row">
                  <Select<'density' | 'spectrum'>
                    value={data.scaling ?? 'density'}
                    title="Density: power per unit of frequency (V²/Hz): for noise; spectrum: power (V²): for the height of a sine"
                    options={[
                      ['density', 'density (per unit of frequency)'],
                      ['spectrum', 'power spectrum'],
                    ]}
                    onChange={(scaling) => set({ scaling })}
                  />
                  <Check label="dB" title="10·log10 of the power" value={!!data.psdDb} onChange={(psdDb) => set({ psdDb: psdDb || undefined })} />
                </span>
              </>
            )}
          </>
        )}
        {mode === 'cwt' && (
          <>
            <span>Scales</span>
            <span className="row">
              <NumInput className="tiny" min={4} max={256} step={8} value={data.scales ?? 64} title="The number of scales, evenly on a log scale from two steps of X to a third of the record" onChange={(scales) => set({ scales: Math.max(4, Math.min(256, Math.round(scales) || 64)) })} />
              <span>ω0</span>
              <NumInput className="tiny" min={4} max={20} step={1} value={data.w0 ?? 6} title="The Morlet wavelet's frequency: larger, finer in frequency and coarser in time (6 is usual)" onChange={(w0) => set({ w0: Math.max(4, Math.min(20, w0 || 6)) })} />
              <Check label="dB" value={!!data.psdDb} onChange={(psdDb) => set({ psdDb: psdDb || undefined })} />
            </span>
          </>
        )}
        {mode === 'allan' && (
          <>
            <span>τ</span>
            <Select<'octave' | 'decade' | 'all'>
              value={data.allanSpacing ?? 'octave'}
              title="The averaging times: doubling (1, 2, 4 … steps), 1-2-…-9 per decade, or every multiple of the step"
              options={[
                ['octave', 'octaves (×2)'],
                ['decade', '1 … 9 per decade'],
                ['all', 'every step'],
              ]}
              onChange={(allanSpacing) => set({ allanSpacing })}
            />
          </>
        )}
        {mode === 'filter' && (
          <>
            <span>Filter</span>
            <Select<FFTData['filter']>
              value={data.filter}
              options={[
                ['low', 'low pass'],
                ['high', 'high pass'],
                ['band', 'band pass'],
                ['stop', 'band stop'],
                ['notch', 'notch (mains, its harmonics)'],
              ]}
              onChange={(filter) => set({ filter, ...(filter === 'notch' && !(data.f1 > 0) ? { f1: 50 } : {}) })}
            />
            <span>{data.filter === 'notch' ? 'At' : 'Cut-off'}</span>
            <span className="row">
              <NumInput className="short" value={data.f1} title={data.filter === 'notch' ? 'The frequency taken out (50 or 60 Hz: the mains), in 1 / the unit of X' : 'In 1 / the unit of X (the frequencies of the spectrum)'} onChange={(f1) => set({ f1 })} />
              {data.filter === 'notch' && (
                <>
                  <span className="muted">harmonics</span>
                  <NumInput className="tiny" min={1} max={50} step={1} value={data.notchN ?? 1} title="The notches with the first: 1 the frequency alone, 3 also its 2nd and 3rd harmonics (those below the Nyquist frequency)" onChange={(notchN) => set({ notchN: Math.max(1, Math.min(50, Math.round(notchN) || 1)) })} />
                  <span className="muted">Q</span>
                  <NumInput className="tiny" min={0.5} step={5} value={data.notchQ ?? 30} title="The quality: the frequency / the width at −3 dB (30 at 50 Hz: 1.7 Hz wide); larger, narrower" onChange={(notchQ) => set({ notchQ: notchQ > 0 ? notchQ : 30 })} />
                </>
              )}
              {(data.filter === 'band' || data.filter === 'stop') && (
                <>
                  <span>–</span>
                  <NumInput className="short" value={data.f2} onChange={(f2) => set({ f2 })} />
                </>
              )}
            </span>
            {data.filter !== 'notch' && <span>Design</span>}
            {data.filter !== 'notch' && (
            <span className="row">
              <Select<'fft' | 'butter' | 'cheby1' | 'bessel'>
                value={data.design ?? 'fft'}
                title="By the FFT (the frequencies cut in the spectrum), or a recursive (IIR) filter as electronics make them: Butterworth (flat in the band), Chebyshev I (steeper, a ripple in the band), Bessel (the delay nearly the same at every frequency: pulses keep their shape, no ringing)"
                options={[
                  ['fft', 'FFT'],
                  ['butter', 'Butterworth (IIR)'],
                  ['cheby1', 'Chebyshev I (IIR)'],
                  ['bessel', 'Bessel (IIR)'],
                ]}
                onChange={(design) => set({ design: design === 'fft' ? undefined : design, ...(design !== 'fft' && !(data.order > 0) ? { order: 4 } : {}) })}
              />
              {data.design === 'cheby1' && (
                <>
                  <span className="muted">ripple</span>
                  <NumInput className="tiny" min={0.01} step={0.1} value={data.ripple ?? 1} title="The ripple in the pass band, dB" onChange={(ripple) => set({ ripple: ripple > 0 ? ripple : 1 })} />
                </>
              )}
            </span>
            )}
            <span>{data.filter === 'notch' ? 'Way' : 'Edge'}</span>
            <span className="row">
              {data.filter === 'notch' ? (
                <Check label="causal (one way)" title="Filtered forward only, as in real time (the phase shifted near the notch); else forward and backward: no shift, the notch twice as deep" value={!!data.causal} onChange={(causal) => set({ causal: causal || undefined })} />
              ) : iir ? (
                <>
                  <span className="muted">order</span>
                  <NumInput className="tiny" min={1} max={12} step={1} value={data.order > 0 ? data.order : 4} onChange={(order) => set({ order: Math.max(1, Math.min(12, Math.floor(order) || 4)) })} />
                  <Check label="causal (one way)" title="Filtered forward only, as in real time (a delay, the phase shifted); else forward and backward: no shift, the order doubled" value={!!data.causal} onChange={(causal) => set({ causal: causal || undefined })} />
                </>
              ) : (
                <>
                  <Select value={data.order > 0 ? 'bw' : 'ideal'} options={[['ideal', 'ideal (sharp)'], ['bw', 'Butterworth-like, order']]} onChange={(v) => set({ order: v === 'ideal' ? 0 : Math.max(1, data.order || 4) })} />
                  {data.order > 0 && <NumInput className="tiny" min={1} max={20} step={1} value={data.order} onChange={(order) => set({ order: Math.max(1, Math.min(20, Math.floor(order) || 4)) })} />}
                </>
              )}
            </span>
          </>
        )}
      </div>
      <div className="row wrap">
        {spec && <Check label="Zeros up to a power of 2" value={data.pad} onChange={(pad) => set({ pad })} />}
        {mode === 'filter' && !iir && data.filter !== 'notch' && <Check label="Mirror the ends first" value={data.mirror} onChange={(mirror) => set({ mirror })} />}
      </div>
      </NodeOptions>
      {(r?.view.report ?? []).length > 0 && (
        <div className="stat-report">
          {r!.view.report!.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      <Result r={r} ranges={{ data, set, hint: mode === 'filter' ? undefined : 'Then drag on the graph of the data: one range (its part analysed on its own; several ranges, a curve each)' }} />
      <OutPort label="dataset" port="dataset" id="out" title="The spectrum, the PSD, the spectrogram or scalogram (time, frequency, power: for Contour), the coherence, the envelope and phase, the Allan deviation, the Lomb–Scargle periodogram (power, amplitude, false-alarm probability), the harmonics (frequency, amplitude, dBc) or the filtered curves" />
      {mode === 'harmonics' && <OutPort label="measures" port="dataset" id="measures" title="THD (dB and %), SNR, SINAD, ENOB, SFDR, the fundamental and the noise of every Y" />}
      {mode === 'filter' && <OutPort label="response" port="dataset" id="response" title="The filter’s response: the frequency, the gain (dB) and the phase (°); forward and backward: the gain twice, no phase" />}
      {mode === 'harmonics' && <OutPort label="spectrum" port="dataset" id="spectrum" title="The spectrum in dB (Kaiser window), for a Plot" />}
    </div>
  );
}

export function ConvNodeView({ id, data }: NodeProps<ConvNode>) {
  const { r, avail, names, set } = useSignal<ConvData>(id);
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X (evenly spaced) and the Y columns" />
      <InPort label="kernel" port="column" id="kernel" title="Optional: the response (a column, or a dataset: its first Y) on the same step of X; Response ▸ from the “kernel” port; for a correlation: the other signal (none: each Y with itself)" />
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        {data.op !== 'corr' && <OutsideRow data={data} set={set} />}
        <span>Operation</span>
        <Select<ConvData['op']>
          value={data.op}
          options={[
            ['conv', 'convolve (broaden)'],
            ['wiener', 'deconvolve: Wiener'],
            ['rl', 'deconvolve: Richardson–Lucy'],
            ['corr', 'correlation (cross / auto)'],
          ]}
          onChange={(op) => set({ op })}
        />
        {data.op === 'corr' && (
          <>
            <span>Normalized</span>
            <Select<NonNullable<ConvData['corrNorm']>>
              value={data.corrNorm ?? 'coeff'}
              title="Coefficient: the means removed, −1 … 1 (as a correlation coefficient); biased: / N; unbiased: / (N − |lag|); none: the sum of the products"
              options={[
                ['coeff', 'coefficient (−1 … 1)'],
                ['biased', 'biased (/ N)'],
                ['unbiased', 'unbiased (/ (N − |lag|))'],
                ['none', 'none (sum)'],
              ]}
              onChange={(corrNorm) => set({ corrNorm })}
            />
          </>
        )}
        {data.op !== 'corr' && <span>Response</span>}
        {data.op !== 'corr' && (
        <span className="row">
          <Select<ConvData['shape']>
            value={data.shape}
            options={[
              ['gauss', 'Gaussian'],
              ['lorentz', 'Lorentzian'],
              ['box', 'box'],
              ['port', 'from the “kernel” port'],
            ]}
            onChange={(shape) => set({ shape })}
          />
          {data.shape !== 'port' && (
            <>
              <span>FWHM</span>
              <NumInput className="short" value={data.fwhm} title="In the units of X" onChange={(fwhm) => set({ fwhm: Math.abs(fwhm) || 1 })} />
            </>
          )}
        </span>
        )}
        {data.op === 'wiener' && (
          <>
            <span>λ</span>
            <NumInput className="short" step={0.001} value={data.lambda} title="Regularization against the noise (a fraction of the largest |K|²): larger, smoother" onChange={(lambda) => set({ lambda: Math.max(1e-12, lambda || 0.01) })} />
          </>
        )}
        {data.op === 'rl' && (
          <>
            <span>Iterations</span>
            <NumInput className="tiny" min={1} step={5} value={data.iterations} onChange={(iterations) => set({ iterations: Math.max(1, Math.floor(iterations) || 30) })} />
          </>
        )}
        {data.op !== 'wiener' && data.op !== 'corr' && (
          <>
            <span>Ends</span>
            <Select<ConvData['edge']>
              value={data.edge}
              options={[
                ['reflect', 'reflected'],
                ['nearest', 'the end value repeated'],
                ['zero', 'zero'],
              ]}
              onChange={(edge) => set({ edge })}
            />
          </>
        )}
      </div>
      </NodeOptions>
      <Result r={r} ranges={{ data, set }} />
      <OutPort label="dataset" port="dataset" id="out" title="The curves convolved / deconvolved, or the correlation against the lag" />
      {data.op === 'corr' && <OutPort label="lags" port="dataset" id="lags" title="Every Y: the lag of the largest correlation (the delay between the two signals) and its value" />}
    </div>
  );
}

export function AverageNodeView({ id, data }: NodeProps<AverageNode>) {
  const { r, avail, names, set } = useSignal<AverageData>(id);
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  return (
    <div className="node node-signal">
      {Array.from({ length: count }, (_, k) => (
        <InPort key={k} label={columnLetter(k)} port="dataset" id={`in-${k}`} title="A dataset: its Y columns (designated, or chosen), each with its X: a new port appears when the last one is used" />
      ))}
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        <span>Common X</span>
        <span className="row">
          <Select<AverageData['grid']>
            value={data.grid}
            options={[
              ['union', 'every X of the curves'],
              ['first', 'the X of the first curve'],
              ['uniform', 'a uniform grid'],
            ]}
            onChange={(grid) => set({ grid })}
          />
          {data.grid === 'uniform' && <NumInput className="tiny" min={2} step={50} value={data.points} title="Points" onChange={(points) => set({ points: Math.max(2, Math.floor(points) || 200) })} />}
        </span>
        {data.grid === 'uniform' && (
          <>
            <span>From – to</span>
            <span className="row">
              <NumInput className="short" value={data.from} placeholder="all" title="From this X (empty: the first X of the data)" onChange={(from) => set({ from })} />
              <span>–</span>
              <NumInput className="short" value={data.to} placeholder="all" title="Up to this X (empty: the last X of the data)" onChange={(to) => set({ to })} />
            </span>
          </>
        )}
        <span>Where</span>
        <span className="row">
          <Select<AverageData['need']>
            value={data.need}
            options={[
              ['all', 'every curve has a value'],
              ['k', 'at least k curves have one'],
            ]}
            onChange={(need) => set({ need })}
          />
          {data.need === 'k' && <NumInput className="tiny" min={1} step={1} value={data.k} onChange={(k) => set({ k: Math.max(1, Math.floor(k) || 1) })} />}
        </span>
        <span>Read by</span>
        <Select<AverageData['method']>
          value={data.method}
          options={[
            ['linear', 'straight lines'],
            ['spline', 'cubic spline (natural)'],
            ['akima', 'Akima'],
            ['pchip', 'PCHIP (monotone)'],
            ['nearest', 'the nearest point'],
          ]}
          onChange={(method) => set({ method })}
        />
      </div>
      <div className="row wrap">
        <Check label="Min, max, median too" value={data.extra} onChange={(extra) => set({ extra })} />
      </div>
      </NodeOptions>
      <Result r={r} ranges={{ data, set, hint: 'Then drag on the graph: one range of X (the mean only there); the edges can be dragged at any time' }} />
      <OutPort label="dataset" port="dataset" id="out" title="X, the mean, SD (designated ±Y), SE, N (and min, max, median)" />
    </div>
  );
}

export function KramersKronigNodeView({ id, data: given }: NodeProps<KKNode>) {
  const { r, names, set } = useSignal<KKData>(id);
  const data = { ...KK_DEFAULTS, ...given };
  const cols = (auto: string): [string, string][] => [['', auto], ...names.map((n): [string, string] => [n, n])];
  const eis = data.mode === 'eis';
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="Impedance: the frequency, Z′ and Z″; optical: X and the reflectance R; general: X and the part to transform" />
      <NodeOptions>
        <div className="col-form">
          <span>Use</span>
          <Select<KKData['mode']>
            value={data.mode}
            title="Impedance: whether the spectrum obeys Kramers–Kronig (Lin-KK); optical: n and k from the reflectance; general: Re from Im (or Im from Re)"
            options={[
              ['eis', 'impedance: Lin-KK test'],
              ['optical', 'optical: n, k from R'],
              ['general', 'general: Re ↔ Im'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          <span>{eis ? 'Frequency' : 'X'}</span>
          <Select<string> value={data.x} options={cols(eis ? 'by its name' : 'the X designated')} onChange={(x) => set({ x })} />
          <span>{eis ? 'Z′' : data.mode === 'optical' ? 'R' : data.direction === 'im2re' ? 'Im part' : 'Re part'}</span>
          <Select<string> value={data.a} options={cols(eis ? 'by its name' : 'the first Y')} onChange={(a) => set({ a })} />
          {eis && (
            <>
              <span>Z″</span>
              <span className="row">
                <Select<string> value={data.b} options={cols('by its name')} onChange={(b) => set({ b })} />
                <Select<KKData['imNeg']>
                  value={data.imNeg}
                  title="Whether the column is Z″ itself or −Z″ (auto: by its name, or its sign: a capacitive spectrum has Z″ < 0)"
                  options={[
                    ['auto', 'sign: auto'],
                    ['no', 'is Z″'],
                    ['yes', 'is −Z″'],
                  ]}
                  onChange={(imNeg) => set({ imNeg })}
                />
              </span>
              <span>Model</span>
              <span className="row">
                <Check label="inductance" title="An inductance in series (cables, the high frequencies)" value={data.ind} onChange={(ind) => set({ ind })} />
                <Check label="capacitance" title="A capacitance in series (a blocking electrode: −Z″ growing at the low frequencies)" value={data.cap} onChange={(cap) => set({ cap })} />
              </span>
              <span>μ at least</span>
              <span className="row">
                <NumInput className="tiny" min={0} max={1} step={0.05} value={data.mu} title="The least μ = 1 − Σ|R < 0| / Σ|R ≥ 0| allowed (0.85: Schönleber): below it the elements fit the noise" onChange={(mu) => set({ mu: Math.min(1, Math.max(0, Number.isFinite(mu) ? mu : 0.85)) })} />
                <span>elements up to</span>
                <NumInput className="tiny" min={1} max={100} step={1} value={data.maxM} onChange={(maxM) => set({ maxM: Math.max(1, Math.min(100, Math.round(maxM) || 50)) })} />
              </span>
              <span>Band</span>
              <span className="row">
                <span className="muted">±</span>
                <NumInput className="tiny" min={0.01} step={0.1} value={data.limit} title="The residuals within this (% of |Z|): the data obey Kramers–Kronig" onChange={(limit) => set({ limit: limit > 0 ? limit : 1 })} />
                <span className="muted">%</span>
              </span>
            </>
          )}
          {!eis && (
            <>
              <span>X is</span>
              <Select<KKData['xKind']>
                value={data.xKind}
                title="Auto: a wavelength when its column’s unit is one (nm, µm, Å), else proportional to the frequency (eV, cm⁻¹, Hz …: any such unit gives the same result)"
                options={[
                  ['auto', 'auto (by its unit)'],
                  ['frequency', '∝ the frequency'],
                  ['wavelength', 'a wavelength'],
                ]}
                onChange={(xKind) => set({ xKind })}
              />
              {data.mode === 'general' && (
                <>
                  <span>Find</span>
                  <span className="row">
                    <Select<KKData['direction']> seg
                      value={data.direction}
                      options={[
                        ['im2re', 'Re from Im'],
                        ['re2im', 'Im from Re'],
                      ]}
                      onChange={(direction) => set({ direction })}
                    />
                    <span>Re at ∞</span>
                    <NumInput className="tiny" step={0.1} value={data.offset} title="The real part at infinite frequency (ε∞; 1 for ε of a vacuum)" onChange={(offset) => set({ offset: Number.isFinite(offset) ? offset : 0 })} />
                  </span>
                </>
              )}
              <span>Below the data</span>
              <Select<KKData['low']>
                value={data.low}
                title="How the curve goes on below the range measured (an assumption: drawn dashed)"
                options={
                  data.mode === 'optical'
                    ? [
                        ['constant', 'R constant'],
                        ['hagen', 'Hagen–Rubens (a metal)'],
                      ]
                    : [
                        ['zero', 'zero'],
                        ['constant', 'constant'],
                        ['linear', 'straight down to 0 at 0'],
                      ]
                }
                onChange={(low) => set({ low })}
              />
              <span>Above the data</span>
              <span className="row">
                <Select<KKData['high']>
                  value={data.high}
                  title="How the curve goes on above the range measured (an assumption: drawn dashed)"
                  options={[
                    ['power', 'a power law'],
                    ['constant', 'constant'],
                    ['zero', 'zero'],
                  ]}
                  onChange={(high) => set({ high })}
                />
                {data.high === 'power' && (
                  <>
                    <span className="muted">∝ x^−</span>
                    <NumInput className="tiny" min={0.5} step={0.5} value={data.power} title="The exponent: 4 for R of free electrons, 3 for ε₂ of an oscillator, 2 for ε₁ − ε∞" onChange={(power) => set({ power: power > 0 ? power : 4 })} />
                  </>
                )}
              </span>
            </>
          )}
        </div>
      </NodeOptions>
      <Result r={r}>
        {(r?.view.report ?? []).length > 0 && (
          <div className="stat-report">
            {r!.view.report!.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </Result>
      <OutPort label="dataset" port="dataset" id="out" title="Impedance: the frequency, Z′, −Z″, their Lin-KK fit, the residuals (%); optical: X, R, the phase, n, k, ε₁, ε₂ (α); general: X, the part given, the one found" />
    </div>
  );
}
