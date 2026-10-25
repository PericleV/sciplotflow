// Fit: the data and the model, the parameters (start, fixed, limits, shared) with their results, the fit ranges dragged
// on the node's graph (data, fit, band, residuals below), every run of a sweep one by one.
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { buildModel, LIBRARY_OPTIONS, percentResults, type Baseline, type ModelSpec, type ParamKind, type PeakShape } from '../engine/fitModels.ts';
import { SURFACES } from '../engine/surface.ts';
import { criteria } from '../engine/fitcompare.ts';
import { findSpec, type FitBand, type FitParamSpec, type FitWeight, type RunResult } from '../engine/fit.ts';
import { fmtNum } from '../engine/table.ts';
import { fmtPm } from '../engine/report.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { niceStep } from '../figure/ticks.ts';
import type { AppNode, FitNode, FitNodeData } from '../types.ts';
import { AutoText, Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { Tabs } from './fields.tsx';
import { drawResiduals, RESID_TITLE } from './residPanel.ts';
import { ChevronLeft, ChevronRight, Maximize2, MoveHorizontal, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve, type ReaderProp } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

const M = { l: 50, r: 10, t: 8, b: 26 };
const RES_H = 64;
const C = { data: '#1f6fd6', unused: '#b4b4b4', fit: '#d62728', fit2: '#2ca02c', band: 'rgba(214, 39, 40, 0.15)', range: 'rgba(230, 159, 0, 0.13)', rangeEdge: '#e69f00' };
type Range = { lo: number; hi: number };

// The data of one run with its ranges (dragged; “Add a range” draws one, then turns off: onAdded), the fit and its
// band, the residuals below.
function FitPlot(props: { x: Float64Array; y: Float64Array; run: Int32Array; used: Uint8Array; shown: number; results: RunResult[]; ranges: Range[]; width: number; height: number; addRange: boolean; onRanges: (r: Range[]) => void; onAdded: () => void; xTitle: string; yTitle: string; zoom?: ZoomMode; view?: View | null; onView?: (v: View | null) => void; zoomOut?: number; results2?: RunResult[]; resid?: boolean; reader?: ReaderProp }) {
  const { x, y, run, used, shown, results, ranges, width: W, height: H } = props;
  const results2 = props.results2 ?? [];
  const cv = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{ kind: 'new' | 'lo' | 'hi'; k: number; a: number; b: number } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const setD = (d: typeof drag) => {
    dragRef.current = d;
    setDrag(d);
  };
  const RH = props.resid === false ? 0 : RES_H;
  const ph = H - M.t - M.b - RH;
  const pw = W - M.l - M.r;
  // the points of the run shown
  const idx = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < x.length; i++) if (run[i] === shown && Number.isFinite(x[i]) && Number.isFinite(y[i])) out.push(i);
    return out;
  }, [x, y, run, shown]);
  const auto = useMemo(() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const i of idx) [x0, x1, y0, y1] = [Math.min(x0, x[i]), Math.max(x1, x[i]), Math.min(y0, y[i]), Math.max(y1, y[i])];
    for (const result of results) for (let k = 0; k < result.curve.y.length; k++) if (Number.isFinite(result.curve.y[k])) [y0, y1] = [Math.min(y0, result.curve.y[k]), Math.max(y1, result.curve.y[k])];
    if (!Number.isFinite(x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    const px = (x1 - x0 || 1) * 0.03;
    const py = (y1 - y0 || 1) * 0.06;
    return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
  }, [idx, x, y, results]);
  const box = viewBox(props.view, auto);
  const z = usePlotZoom(props.zoom ?? 'none', { l: M.l, t: M.t, w: pw, h: ph }, box, (v) => props.onView?.(v));
  // Zoom out (the button): the view widened around its middle
  useEffect(() => {
    if (props.zoomOut) props.onView?.(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.zoomOut]);
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  const ix = (p: number) => box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
  const iy = (p: number) => box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
  const shownRanges = drag ? (drag.kind === 'new' ? [...ranges, { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) }] : ranges.map((r, k) => (k === drag.k ? (drag.kind === 'lo' ? { ...r, lo: drag.b } : { ...r, hi: drag.b }) : r))) : ranges;

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
    // the fit ranges
    for (const r of shownRanges) {
      // an empty end (a range typed per run): to the edge of the graph
      const [l, h] = [Number.isFinite(r.lo) ? r.lo : box.x0, Number.isFinite(r.hi) ? r.hi : box.x1];
      const [a, b] = [fx(Math.min(l, h)), fx(Math.max(l, h))];
      g.fillStyle = C.range;
      g.fillRect(Math.max(M.l, a), M.t, Math.min(M.l + pw, b) - Math.max(M.l, a), ph);
      g.fillStyle = C.rangeEdge;
      for (const e of [a, b]) if (e >= M.l && e <= M.l + pw) g.fillRect(e - 1, M.t, 2, ph);
    }
    g.save();
    g.beginPath();
    g.rect(M.l, M.t, pw, ph);
    g.clip();
    // the band, the data, the fit
    for (const result of results) {
      if (!result.curve.band) continue;
      const { x: cx, y: cy, band } = result.curve;
      g.fillStyle = C.band;
      g.beginPath();
      for (let k = 0; k < cx.length; k++) g[k ? 'lineTo' : 'moveTo'](fx(cx[k]), fy(cy[k] + band[k]));
      for (let k = cx.length - 1; k >= 0; k--) g.lineTo(fx(cx[k]), fy(cy[k] - band[k]));
      g.fill();
    }
    const r = idx.length > 3000 ? 1.2 : 2.2;
    for (const i of idx) {
      g.fillStyle = used[i] ? C.data : C.unused;
      g.beginPath();
      g.arc(fx(x[i]), fy(y[i]), r, 0, 2 * Math.PI);
      g.fill();
    }
    for (const result of results) {
      g.strokeStyle = C.fit;
      g.lineWidth = 1.6;
      g.beginPath();
      const { x: cx, y: cy } = result.curve;
      let on = false;
      for (let k = 0; k < cx.length; k++) {
        if (!Number.isFinite(cy[k])) {
          on = false;
          continue;
        }
        g[on ? 'lineTo' : 'moveTo'](fx(cx[k]), fy(cy[k]));
        on = true;
      }
      g.stroke();
    }
    // the second model (compared): dashed, over the fit
    for (const result of results2) {
      g.strokeStyle = C.fit2;
      g.lineWidth = 1.4;
      g.setLineDash([5, 3]);
      g.beginPath();
      const { x: cx, y: cy } = result.curve;
      cx.forEach((v, k) => Number.isFinite(cy[k]) && g[k ? 'lineTo' : 'moveTo'](fx(v), fy(cy[k])));
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    // the residuals below (when shown)
    if (RH) drawResiduals(g, { l: M.l, t: M.t + ph + 6, w: pw, h: RH - 10 }, results.flatMap((q) => q.resid.x.map(fx)), results.flatMap((q) => q.resid.r), C.data);
    // the frame and the numbers
    g.strokeStyle = '#333333';
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = '#333333';
    g.font = '10px system-ui, sans-serif';
    const tick = (lo: number, hi: number, f: (v: number) => number, horiz: boolean) => {
      const st = niceStep(hi - lo, horiz ? Math.max(3, Math.round(pw / 80)) : Math.max(3, Math.round(ph / 45)));
      for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) {
        const p = f(v);
        const t = fmtNum(Math.abs(v) < st * 1e-9 ? 0 : v, 4);
        if (horiz) {
          g.textAlign = 'center';
          g.fillText(t, p, H - M.b + 12);
          g.fillRect(p, M.t + ph - 4, 1, 4);
        } else {
          g.textAlign = 'right';
          g.fillText(t, M.l - 4, p + 3);
          g.fillRect(M.l, p, 4, 1);
        }
      }
    };
    tick(box.x0, box.x1, fx, true);
    tick(box.y0, box.y1, fy, false);
    g.textAlign = 'center';
    g.fillText(props.xTitle, M.l + pw / 2, H - 2);
    if (z.rect) {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      g.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, used, results, results2, shownRanges, W, H, box, props.xTitle, z.rect, RH]);

  const at = (e: { currentTarget: EventTarget; clientX: number }) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return ((e.clientX - b.left) * W) / b.width;
  };
  const atY = (e: { currentTarget: EventTarget; clientY: number }) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return ((e.clientY - b.top) * H) / b.height;
  };
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track
    }
    const px = at(e);
    if (z.down(px, atY(e), e)) return;
    // an edge of a range: moved
    for (let k = 0; k < ranges.length; k++) {
      const [a, b] = [ranges[k].lo, ranges[k].hi];
      if (Math.abs(fx(a) - px) < 5) return setD({ kind: 'lo', k, a, b: a });
      if (Math.abs(fx(b) - px) < 5) return setD({ kind: 'hi', k, a: b, b });
    }
    if (props.addRange) setD({ kind: 'new', k: -1, a: ix(px), b: ix(px) });
  };
  const move = (e: RPointerEvent) => {
    if (z.move(at(e), atY(e))) return;
    const d = dragRef.current;
    if (d) setD({ ...d, b: ix(at(e)) });
  };
  const up = (e: RPointerEvent) => {
    if (z.up(at(e), atY(e))) return;
    const d = dragRef.current;
    setD(null);
    if (!d) return;
    const r3 = (v: number) => +v.toPrecision(6);
    if (d.kind === 'new') {
      if (Math.abs(fx(d.b) - fx(d.a)) > 3) {
        props.onRanges([...ranges, { lo: r3(Math.min(d.a, d.b)), hi: r3(Math.max(d.a, d.b)) }]);
        props.onAdded();
      }
    } else props.onRanges(ranges.map((r, k) => (k === d.k ? (d.kind === 'lo' ? { ...r, lo: r3(d.b) } : { ...r, hi: r3(d.b) }) : r)));
  };
  return (
    <div
      className="manip-plot nodrag nowheel"
      tabIndex={0}
      style={{ width: W, height: H, cursor: props.zoom === 'pan' ? 'grab' : props.zoom === 'zoom' ? 'crosshair' : props.addRange ? 'col-resize' : 'default' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onWheel={(e) => z.wheel(at(e), atY(e), e.deltaY, e)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          e.stopPropagation();
          props.onView?.(null);
        }
      }}
    >
      <canvas ref={cv} style={{ width: W, height: H }} />
      <ReaderLayer reader={props.reader} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />
    </div>
  );
}

// Ranges per run: the first range of every run typed in (more are added on the graph); an empty end: no limit on that
// side; a run with nothing typed takes the common ranges.
export function RunRangesTable({ labels, common, own, onChange, onShow, shown }: { labels: string[]; common: Range[]; own: Record<string, Range[]>; onChange: (label: string, r: Range[] | undefined) => void; onShow: (k: number) => void; shown: number }) {
  const commonText = common.length ? common.map((r) => `${fmtNum(r.lo, 4)}–${fmtNum(r.hi, 4)}`).join(', ') : 'all X';
  return (
    <details className="run-ranges" open>
      <summary>Ranges of every run</summary>
      <table>
        <thead>
          <tr>
            <th>run</th>
            <th>from</th>
            <th>to</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {labels.map((lab, j) => {
            const rg = own[lab] ?? [];
            const first = rg[0];
            const setFirst = (p: Partial<Range>) => {
              const r0 = { lo: first?.lo ?? NaN, hi: first?.hi ?? NaN, ...p };
              onChange(lab, Number.isNaN(r0.lo) && Number.isNaN(r0.hi) ? rg.slice(1) : [r0, ...rg.slice(1)]);
            };
            return (
              <tr key={j} className={j === shown ? 'on' : ''}>
                <td className="ellipsis" title={`${lab}: click to show it on the graph`} onClick={() => onShow(j)}>
                  {lab}
                </td>
                <td>
                  <NumInput value={first?.lo ?? NaN} placeholder={first ? '…' : commonText} onChange={(lo) => setFirst({ lo })} />
                </td>
                <td>
                  <NumInput value={first?.hi ?? NaN} placeholder={first ? '…' : ''} onChange={(hi) => setFirst({ hi })} />
                </td>
                <td className="muted">{rg.length > 1 ? `+${rg.length - 1}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}


export function FitNodeView({ id, data }: NodeProps<FitNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const fitOut = r?.outputs.fit;
  const nFits = fitOut?.t === 'dataset' ? fitOut.v.columns.filter((c) => c.role === 'y').length : 0;
  const set = (patch: Partial<FitNodeData>) => updateNodeData(id, patch);
  const info = r?.view.fit;
  const names = (r?.view.available ?? []).map((c) => c.name);
  const [shown, setShown] = useState(0);
  const [addRange, setAddRange] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const model = useMemo(() => buildModel(data.model), [data.model]);
  const regKind = data.regression;
  // a surface or a regression: no curve of X (no ranges, a graph of the fitted against the measured)
  const surf = !!data.surface || !!regKind;
  const mode = regKind ?? (data.surface ? 'surface' : 'curve');
  const setMode = (m: string) => set({ surface: m === 'surface' || undefined, regression: m === 'linear' || m === 'logistic' ? m : undefined });
  const [tab, setTab] = useState<'model' | 'params' | 'use' | 'compare'>('model');
  // the parameters of the model fitted (with reconvolution: shift and bg too; a surface: its own), else of the model chosen
  const params = (info?.params?.length && (surf || data.reconv) ? info.params : regKind ? [] : typeof model === 'string' ? [] : model.params) as { name: string; kind: ParamKind }[];
  const york = data.model.kind === 'library' && data.model.model === 'york';
  const model2 = data.model2 ?? { ...data.model, kind: 'library' as const, model: 'linear' };
  const setModel2 = (p: Partial<ModelSpec>) => set({ model2: { ...model2, ...p } });
  const runs = info?.runs ?? [];
  // every run of the data (a run without points to fit has no result, but keeps its place and its ranges)
  const labels = info?.labels ?? [];
  const k = Math.min(Math.max(0, shown), Math.max(0, labels.length - 1));
  const label = labels[k] ?? '';
  // the results of the run shown: one, or one per range (a fit per range: the range chosen shows its parameters)
  const results = runs.filter((x) => (x.of ?? x.label) === label);
  const [reg, setReg] = useState(0);
  const ri = Math.min(reg, Math.max(0, results.length - 1));
  const res = results[ri];
  // the uses of the fit shown (Y at X, X from Y, LOD / LOQ, derived values)
  const useRows = res ? (info?.use?.[runs.indexOf(res)] ?? []) : [];
  const useOn = !!(data.at?.trim() || data.inverse?.trim() || data.derived?.trim() || data.lod);
  const spec = (name: string): FitParamSpec => findSpec(data.params, name, params.find((q) => q.name === name)?.kind);
  const setSpec = (name: string, p: Partial<FitParamSpec>) => set({ params: [...data.params.filter((q) => q.name !== name), { ...spec(name), ...p }] });
  const setModel = (p: Partial<ModelSpec>) => set({ model: { ...data.model, ...p } });
  const several = labels.length > 1;
  // the fit ranges: common, or of the run shown (ranges per run; a run without its own takes the common ones)
  const perRun = several && data.rangesBy === 'run';
  const ownRanges = perRun ? data.runRanges?.[label] : undefined;
  const shownRanges = ownRanges?.length ? ownRanges : data.ranges;
  const setRunRanges = (lab: string, rg: Range[] | undefined) => {
    const next = { ...data.runRanges };
    if (rg?.length) next[lab] = rg;
    else delete next[lab];
    set({ runRanges: next });
  };
  const setShownRanges = (rg: Range[]) => (perRun ? setRunRanges(label, rg) : set({ ranges: rg }));
  const globalOn = (info?.yNames.length ?? data.ys.length) > 1 && !(typeof model !== 'string' && model.joint);
  const ys = data.ys.length ? data.ys : [''];
  // the run shown in the graph: its index among the runs of the data
  const shownData = k;
  // the data reader: the points of the run shown and its fit curves
  const readCurves: ReadCurve[] = info
    ? [
        (() => {
          const ii: number[] = [];
          for (let i = 0; i < info.x.length; i++) if (info.run[i] === shownData) ii.push(i);
          return { name: label || 'data', color: '#1f6fd6', x: ii.map((i) => info.x[i]), y: ii.map((i) => info.y[i]) };
        })(),
        ...results.map((q, j) => ({ name: results.length > 1 ? `fit ${j + 1}` : 'fit', color: '#d62728', x: q.curve.x, y: q.curve.y })),
      ]
    : [];
  const reader: ReaderProp = { r: rd, curves: readCurves, onRead: (reading) => setRd((q) => ({ ...q, reading })) };
  const plot = (w: number, h: number) =>
    info && (
      <FitPlot reader={reader} x={info.x} y={info.y} run={info.run} used={info.used} shown={shownData} results={results} ranges={surf ? [] : shownRanges} width={w} height={h} addRange={addRange && zoom === 'none' && !surf} onRanges={setShownRanges} onAdded={() => setAddRange(false)} zoom={zoom} view={view} onView={setView} zoomOut={out} xTitle={info.xName || 'row'} yTitle={info.yNames.join(', ')} results2={data.compare2 ? info.runs2?.filter((x) => x.label === label) : undefined} resid={data.showResid !== false} />
    );
  const runBar = several && (
    <div className="row fit-runs">
      <button className="nodrag ts-btn" disabled={k === 0} onClick={() => setShown(k - 1)}>
        <ChevronLeft {...IC} />
      </button>
      <select className="nodrag grow" value={k} onChange={(e) => setShown(Number(e.target.value))}>
        {labels.map((lab, j) => {
          const xs = runs.filter((q) => (q.of ?? q.label) === lab);
          return (
            <option key={j} value={j}>
              {j + 1}. {lab} · {xs.length ? `R² ${xs.map((q) => fmtNum(q.stats.r2, 4)).join(', ')}` : 'no point to fit'}
            </option>
          );
        })}
      </select>
      <button className="nodrag ts-btn" disabled={k >= labels.length - 1} onClick={() => setShown(k + 1)}>
        <ChevronRight {...IC} />
      </button>
    </div>
  );
  const tools = (
    <div className="row wrap">
      {!surf && (
      <button className={`nodrag${addRange ? ' on' : ''}`} title="Then drag on the graph: one fit range (only the points inside the ranges are fitted); the button turns off after it. The edges of a range can be dragged at any time" onClick={() => {
          setAddRange((v) => !v);
          setZoom('none');
        }}
      >
        <MoveHorizontal {...IC} /> Add a range
      </button>
      )}
      {!surf && (perRun ? !!ownRanges?.length : data.ranges.length > 0) && (
        <button className="nodrag" title={perRun ? 'This run takes the common ranges again' : 'No ranges: every point fitted'} onClick={() => (perRun ? setRunRanges(label, undefined) : set({ ranges: [] }))}>
          {perRun ? 'Common ranges' : 'All X'}
        </button>
      )}
      {!surf && shownRanges.length > 1 && !(typeof model !== 'string' && model.joint) && (
        <Check label="A fit per range" title="Every range fitted on its own (its own parameters, curve and band; a row per range in the parameters), else one fit of the points of all the ranges together" value={!!data.rangeFits} onChange={(rangeFits) => set({ rangeFits })} />
      )}
      {several && !surf && (
        <Select
          value={data.rangesBy ?? 'all'}
          title="The same fit ranges for every run, or ranges of its own for each run (dragged on the graph of the run shown, or typed in the table below; a run without its own takes the common ones)"
          options={[
            ['all', 'same ranges, all runs'],
            ['run', 'ranges per run'],
          ]}
          onChange={(rangesBy) => set({ rangesBy })}
        />
      )}
      <button className={`nodrag${data.showResid !== false ? ' on' : ''}`} title={`${RESID_TITLE} in a panel under the graph: shown or hidden`} onClick={() => set({ showResid: data.showResid === false })}>
        Residuals
      </button>
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
          setAddRange(false);
        }}
      />
      <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
        <Maximize2 {...IC} /> Large
      </button>
    </div>
  );
  const readerRow = <ReaderOptions r={rd} set={setRd} names={readCurves.map((c) => c.name)} />;
  // the options in four tabs: the data and the model, the parameters, the uses of the fit, the comparisons
  const dataBlock = names.length > 0 && (
    <details open>
      <summary>Data</summary>
      <Field label="Fit" title="A curve: Y as a function of X (the models, formulas, equations …); a surface: Z as a function of X and Y; a regression: Y on several predictors; linear least squares, or logistic for a yes / no response">
        <Select
          value={mode}
          options={[
            ['curve', 'a curve: Y of X'],
            ['surface', 'a surface: Z of X and Y'],
            ['linear', 'linear regression (several predictors)'],
            ['logistic', 'logistic regression (yes / no)'],
          ]}
          onChange={setMode}
        />
      </Field>
      {regKind ? (
        <div className="col-form three">
          <span title={regKind === 'logistic' ? 'Two levels: 0 / 1, or any two values or texts (the second one counts as 1)' : 'What is explained'}>Y</span>
          <Select value={data.ys[0] ?? ''} options={[['', 'designated'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(v) => set({ ys: [v] })} />
          <span />
          <span title="The columns that explain Y">Predictors</span>
          <ColumnsPicker value={data.predictors ?? ''} names={names} auto="auto: every other numeric column" title="The predictors: a list (2, B-D, names, A*); auto: every numeric column but Y (and those designated –)" onChange={(predictors) => set({ predictors: predictors || undefined })} />
          <span />
        </div>
      ) : surf ? (
        <div className="col-form three">
          <span>X</span>
          <Select value={data.x && data.x !== '-' ? data.x : ''} options={[['', 'designated'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x })} />
          <span />
          <span>Y</span>
          <Select value={data.ys[0] ?? ''} options={[['', 'the next column'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(v) => set({ ys: [v] })} />
          <span />
          <span title="What is measured at every (x, y)">Z</span>
          <Select value={data.zcol ?? ''} options={[['', 'the next column'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(zcol) => set({ zcol: zcol || undefined })} />
          <span />
          <span title="Its error: the weights 1/σ² (instrumental)">±Z</span>
          <Select value={data.yerr} options={[['', 'none'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(yerr) => set({ yerr })} />
          <span />
        </div>
      ) : (
        <>
          <div className="col-form three">
            <span>X</span>
            <Select value={data.x || info?.xName || '-'} options={[['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x })} />
            <span />
            {ys.map((yv, j) => (
              <Fragment key={j}>
                <span title="Several Y: fitted together, one run each (e.g. the two branches of an anticrossing)">{ys.length > 1 ? `Y ${j + 1}` : 'Y'}</span>
                <Select value={yv || info?.yNames[j] || ''} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(v) => set({ ys: ys.map((q, i) => (i === j ? v : q || info?.yNames[i] || '')).filter((q, i) => q || i === 0) })} />
                {ys.length > 1 ? (
                  <button className="nodrag ts-btn" title="Take this Y out" onClick={() => set({ ys: ys.filter((_, i) => i !== j) })}>
                    <X {...IC} />
                  </button>
                ) : (
                  <span />
                )}
              </Fragment>
            ))}
            <span title="Its error: the weights 1/σ² (instrumental)">±Y</span>
            <Select value={data.yerr} options={[['', 'none'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(yerr) => set({ yerr })} />
            <span />
            {(york || data.xerrFit) && (
              <>
                <span title="The error of X (York, or counted for any model)">±X</span>
                <Select value={data.xerr ?? ''} options={[['', 'designated'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(xerr) => set({ xerr })} />
                <span />
              </>
            )}
          </div>
          <div className="row wrap">
            <button className="nodrag" title="Another Y column, fitted with the others (a run each)" onClick={() => set({ ys: [...(data.ys.some(Boolean) ? ys.map((q, i) => q || info?.yNames[i] || '') : (info?.yNames ?? [''])), ''] })}>
              + Y
            </button>
            <Field label="Weights">
              <Select<FitWeight>
                value={data.weight}
                options={[
                  ['auto', 'auto (1/σ² with ±Y)'],
                  ['none', 'none'],
                  ['instrumental', '1/σ² (±Y)'],
                  ['statistical', '1/|y| (statistical)'],
                ]}
                onChange={(weight) => set({ weight })}
              />
            </Field>
          </div>
          {!york && (
            <Check
              label="Errors of X too (effective variance)"
              title="The ±X column counted for any model: every point weighted by 1/(σy² + (f′(x)·σx)²), the slope of the model at its X: for a straight line the same as York's fit; σy from the weights (none: 1)"
              value={!!data.xerrFit}
              onChange={(xerrFit) => set({ xerrFit: xerrFit || undefined })}
            />
          )}
          <Check
            label="Reconvolution with the instrument's response (IRF)"
            title="The model: of the time after an instant (a decay: fix its offset at 0); convolved with the IRF, as measured (fluorescence lifetimes, pump–probe): bg + IRF ⊗ model, the IRF of area 1; its shift fitted or not"
            value={!!data.reconv}
            onChange={(reconv) => set({ reconv: reconv || undefined })}
          />
          {data.reconv && (
            <div className="row wrap">
              <Field label="IRF" title="A column of the data (on its designated X), or the curve connected to the “irf” port">
                <span className="row">
                  <Select seg
                    value={data.irfFrom ?? 'column'}
                    options={[
                      ['column', 'a column'],
                      ['port', 'the irf input'],
                    ]}
                    onChange={(irfFrom) => set({ irfFrom })}
                  />
                  {data.irfFrom !== 'port' && <Select value={data.irfColumn ?? ''} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(irfColumn) => set({ irfColumn: irfColumn || undefined })} />}
                </span>
              </Field>
              <Check label="its shift fitted" title="The IRF moved along X by the parameter “shift” (else as measured)" value={data.irfShift !== false} onChange={(v) => set({ irfShift: v ? undefined : false })} />
            </div>
          )}
          {!data.ys.some(Boolean) && (info?.yNames.length ?? 0) > 1 && <div className="hint">From the designations: {info!.yNames.length} Y columns, each with its own X; a run each.</div>}
          {globalOn && <Check label="Global fit: the parameters marked “shared” are common to all runs" value={data.global} onChange={(global) => set({ global })} />}
        </>
      )}
    </details>
  );
  const modelBlock = regKind ? (
    <details open>
      <summary>Model</summary>
      <div className="hint">{info?.note ?? (regKind === 'logistic' ? 'P(Y = 1) = 1 / (1 + exp(−(b0 + b1·x1 + …)))' : 'Y = b0 + b1·x1 + b2·x2 + …')}</div>
    </details>
  ) : surf ? (
    <details open>
      <summary>Surface</summary>
      <div className="row wrap">
        <Select
          value={data.surfaceModel ?? 'plane'}
          options={[...Object.entries(SURFACES).map(([k, s]): [string, string] => [k, s.label]), ['formula', 'formula of x and y']]}
          onChange={(surfaceModel) => set({ surfaceModel })}
        />
      </div>
      {data.surfaceModel === 'formula' && <TextInput className="mono" value={data.surfaceFormula ?? ''} placeholder="z = a + b*x + c*y + d*x*y" title="Every name but x and y is a parameter" onChange={(surfaceFormula) => set({ surfaceFormula })} />}
      <div className="hint">{info?.note ?? ''}</div>
    </details>
  ) : (
    <details open>
      <summary>Model</summary>
      <Tabs
        tabs={
          // peaks are fitted in the Peak analyzer; a Fit of peaks saved before keeps its tab
          [['library', 'Library'], ['formula', 'Formula'], ['ode', 'Equations'], ['complex', 'Complex'], ...(data.model.kind === 'peaks' ? [['peaks', 'Peaks']] : [])] as [ModelSpec['kind'], string][]
        }
        value={data.model.kind}
        onChange={(kind) => setModel({ kind })}
      />
      {data.model.kind === 'library' && (
        <div className="row">
          <select className="nodrag grow" value={data.model.model} onChange={(e) => setModel({ model: e.target.value })}>
            {[...new Set(LIBRARY_OPTIONS.map((o) => o.group))].map((g) => (
              <optgroup key={g} label={g}>
                {g === 'Basic' && <option value="poly">Polynomial</option>}
                {LIBRARY_OPTIONS.filter((o) => o.group === g).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {data.model.model === 'poly' && (
            <Field label="Degree">
              <NumInput className="tiny" min={1} max={9} step={1} value={data.model.degree} onChange={(degree) => setModel({ degree: Math.max(1, Math.min(9, Math.floor(degree) || 1)) })} />
            </Field>
          )}
        </div>
      )}
      {data.model.kind === 'formula' && <TextInput className="mono" value={data.model.formula} placeholder="y = A*exp(-x/t) + y0" title="Every name but x is a parameter; k is the number of the run (1, 2 …)" onChange={(formula) => setModel({ formula })} />}
      {data.model.kind === 'complex' && (
        <TextInput
          className="mono"
          value={data.model.cformula ?? ''}
          placeholder="R0 + R1/(1 + j*x*R1*C1)"
          title="A formula in complex numbers of x (j the imaginary unit; functions of your own before it: par(a, b) = a*b/(a + b); R0 + par(R1, 1/(j*x*C1))): fitted at once to two Y columns: its real part (Y 1) and its imaginary part (Y 2), every parameter shared"
          onChange={(cformula) => setModel({ cformula })}
        />
      )}
      {data.model.kind === 'ode' && (
        <AutoText
          className="mono"
          value={data.model.ode ?? ''}
          placeholder="dA/dt = -k1*A; dB/dt = k1*A - k2*B; A(0) = A0; B(0) = 0; y = B"
          title="Differential equations, separated by ; dA/dx = … (or d…/dt: the variable after the d), the starting values A(0) = … (all at the same X), and what is measured, y = … (with one equation: that one). Every other name is a parameter; solved numerically (Dormand–Prince, an adaptive step) forward and backward from the start"
          onChange={(ode) => setModel({ ode })}
        />
      )}
      {data.model.kind === 'peaks' && (
        <div className="row wrap">
          <Select<PeakShape>
            value={data.model.shape}
            options={[
              ['gauss', 'Gaussian'],
              ['lorentz', 'Lorentzian'],
              ['voigt', 'pseudo-Voigt'],
              ['voigtx', 'Voigt'],
              ['fano', 'Fano'],
              ['ds', 'Doniach–Šunjić'],
            ]}
            onChange={(shape) => setModel({ shape })}
          />
          <span>×</span>
          <NumInput className="tiny" min={1} max={20} step={1} value={data.model.count} onChange={(count) => setModel({ count: Math.max(1, Math.min(20, Math.floor(count) || 1)) })} />
          <Field label="Baseline">
            <Select<Baseline>
              value={data.model.baseline}
              options={[
                ['none', 'none'],
                ['constant', 'constant'],
                ['linear', 'linear'],
                ['quadratic', 'quadratic'],
              ]}
              onChange={(baseline) => setModel({ baseline })}
            />
          </Field>
        </div>
      )}
      <div className="hint">{data.reconv && info?.note ? info.note : typeof model === 'string' ? model : model.note}</div>
    </details>
  );
  const curveRow = !surf && (
    <div className="row wrap">
      <Field label="Fit curve" title="Points of the fit curve, and its 95 % band (given as ±Y: a Plot draws it shaded)">
        <span className="row">
          <NumInput className="tiny" min={2} step={50} value={data.points} onChange={(points) => set({ points: Math.max(2, Math.floor(points) || 400) })} />
          <Select<FitBand>
            value={data.band}
            options={[
              ['none', 'no band'],
              ['confidence', 'confidence band'],
              ['prediction', 'prediction band'],
            ]}
            onChange={(band) => set({ band })}
          />
        </span>
      </Field>
    </div>
  );
  // the information criteria of the fit shown (K: the free parameters + 1)
  const crit = res ? criteria({ group: '', fit: '', k: res.stats.n - res.stats.dof, n: res.stats.n, chi2: res.stats.chi2, r2: res.stats.r2 }) : null;
  // a regression: the table of its coefficients
  const rg = info?.regression;
  const regBlock = regKind && rg && (
    <details open>
      <summary>Coefficients</summary>
      <table className="width-table">
        <thead>
          <tr>
            <th />
            <th>coefficient ± SE</th>
            <th>{rg.kind === 'logistic' ? 'z' : 't'}</th>
            <th>p</th>
            <th>CI 95 %</th>
            <th title={rg.kind === 'logistic' ? 'exp(coefficient): how the odds change for one unit more' : 'The variance inflation: how much the predictor is explained by the others (above 10: strongly related)'}>{rg.kind === 'logistic' ? 'odds ratio' : 'VIF'}</th>
          </tr>
        </thead>
        <tbody>
          {rg.coefs.map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td className="mono">{fmtPm(c.value, c.se)}</td>
              <td>{fmtNum(c.stat, 4)}</td>
              <td>{c.p < 1e-4 ? '< 0.0001' : fmtNum(c.p, 3)}</td>
              <td>
                {fmtNum(c.lo, 4)} – {fmtNum(c.hi, 4)}
              </td>
              <td>{rg.kind === 'logistic' ? fmtNum(c.odds ?? NaN, 4) : c.vif !== undefined ? fmtNum(c.vif, 3) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">
        {Object.entries(rg.stats)
          .map(([k, v]) => `${k} ${fmtNum(v, 5)}`)
          .join(' · ')}
      </div>
    </details>
  );
  const paramsBlock = params.length > 0 && (
    <details open>
      <summary>Parameters{several || results.length > 1 ? `: ${res?.label ?? label}` : ''}</summary>
      {results.length > 1 && (
        <div className="row wrap">
          <span className="muted">Results of</span>
          {results.map((q, j) => (
            <button key={j} className={`nodrag${j === ri ? ' on' : ''}`} title={q.label} onClick={() => setReg(j)}>
              range {q.range ?? j + 1}
            </button>
          ))}
        </div>
      )}
      <div className={`fit-params${data.global && globalOn ? ' with-shared' : ''}`}>
        <span className="muted">name</span>
        <span className="muted" title="Empty: guessed from the data (of every run)">start</span>
        <span className="muted" title="Fixed at its start value">fix</span>
        <span className="muted">min</span>
        <span className="muted">max</span>
        {data.global && globalOn && <span className="muted">shared</span>}
        <span className="muted">result ± error</span>
        {params.map((q) => {
          const s = spec(q.name);
          const pr = res?.params.find((x) => x.name === q.name);
          return (
            <div key={q.name} className="fit-param">
              <b>{q.name}</b>
              <NumInput value={s.value} placeholder="auto" onChange={(value) => setSpec(q.name, { value })} />
              <input className="nodrag" type="checkbox" checked={s.fixed} onChange={(e) => setSpec(q.name, { fixed: e.target.checked })} />
              <NumInput value={s.min} placeholder="—" onChange={(min) => setSpec(q.name, { min })} />
              <NumInput value={s.max} placeholder="—" onChange={(max) => setSpec(q.name, { max })} />
              {data.global && globalOn && <input className="nodrag" type="checkbox" checked={s.shared} onChange={(e) => setSpec(q.name, { shared: e.target.checked })} />}
              <span className="mono ellipsis" title={pr ? fmtPm(pr.value, pr.error) : ''}>
                {pr ? (pr.fixed ? `${fmtNum(pr.value, 6)} (fixed)` : pr.linked ? `${fmtPm(pr.value, pr.error)} (linked)` : fmtPm(pr.value, pr.error)) : ''}
              </span>
            </div>
          );
        })}
        {res &&
          percentResults(params, res.params.map((q) => q.value), res.params.map((q) => q.error)).map((q) => (
            <span key={q.name} className="fit-derived mono" title="From μ, the Lorentzian part of the pseudo-Voigt's area">
              <b>{q.name}</b> {fmtPm(q.value, q.error)}
            </span>
          ))}
      </div>
      <Field label="Constraints" title="Parameters given by the others, not fitted: lines (or ; between them) “name = formula of the other parameters”: w2 = w1 (the same width), xc2 = xc1 + 1.15 (a fixed distance: a spin–orbit doublet), A2 = 0.5*A1 (a ratio). Their errors follow from those of the others">
        <TextInput className="mono" value={data.links ?? ''} placeholder="w2 = w1; xc2 = xc1 + 1.15" onChange={(links) => set({ links: links || undefined })} />
      </Field>
      <div className="row wrap">
        <button className="nodrag" disabled={!res} title="The results (of the run shown) as the start values" onClick={() => res && set({ params: params.map((q) => ({ ...spec(q.name), value: res.params.find((x) => x.name === q.name)?.value ?? NaN })) })}>
          Results → start
        </button>
        <button className="nodrag" title="Start values guessed from the data again (limits and fixed kept)" onClick={() => set({ params: data.params.map((p) => (p.fixed ? p : { ...p, value: NaN })) })}>
          Guess again
        </button>
      </div>
      {res && crit && (
        <div className="hint" title="χ²: the weighted sum of squared residuals; AIC = N·ln(χ²/N) + 2K, AICc corrected for few points, BIC = N·ln(χ²/N) + K·ln N, K = the free parameters + 1: lower is better, between fits of the same data">
          χ² {fmtNum(res.stats.chi2, 5)} · AIC {fmtNum(crit.aic, 5)}
          {Number.isFinite(crit.aicc) ? ` · AICc ${fmtNum(crit.aicc, 5)}` : ''} · BIC {fmtNum(crit.bic, 5)}
        </div>
      )}
    </details>
  );
  const useBlock = regKind ? (
    <div className="hint">A regression: its coefficients, their tests and the statistics of the model in Parameters; the observed and fitted values on the “fit curves” output.</div>
  ) : (
    <details open>
      <summary>Use the fit</summary>
      {!surf && (
        <>
          <div className="grid2">
            <Field label="Y at X" title="The model at these X (a list: 2.5, 10 …), with its 95 % confidence interval (where the curve is) and prediction interval (where a new measurement falls)">
              <TextInput className="mono" value={data.at ?? ''} placeholder="e.g. 2.5, 10" onChange={(at) => set({ at: at || undefined })} />
            </Field>
            <Field label="X from Y" title="A calibration read backwards: the X where the model reaches each Y (a list), with its 95 % interval: from the scatter of a new measurement (the mean of “×” replicates) and the uncertainty of the curve">
              <span className="row">
                <TextInput className="mono" value={data.inverse ?? ''} placeholder="e.g. 0.42" onChange={(inverse) => set({ inverse: inverse || undefined })} />
                <span className="muted" title="Replicates: each Y the mean of this many measurements">×</span>
                <NumInput className="tiny" min={1} step={1} value={data.replicates ?? 1} title="Replicates: each Y the mean of this many measurements" onChange={(replicates) => set({ replicates: Number.isFinite(replicates) && replicates > 1 ? Math.round(replicates) : undefined })} />
              </span>
            </Field>
          </div>
          <Check label="Limits of detection and quantification (LOD = 3.3·s / slope, LOQ = 10·s / slope)" title="s: the residual standard deviation; the slope of the model at X = 0 (or where the data start); in units of X" value={!!data.lod} onChange={(lod) => set({ lod: lod || undefined })} />
        </>
      )}
      <Field label="Derived" title="Values computed from the parameters, with their errors from the covariance of the fit: lines (or ; between them) “name = formula of the parameters”: area = A*w*1.0645, Ea = -b*8.314e-3, ratio = A2/A1">
        <TextInput className="mono" value={data.derived ?? ''} placeholder="e.g. area = A*w*1.0645" onChange={(derived) => set({ derived: derived || undefined })} />
      </Field>
      {useRows.length > 0 && (
        <table className="width-table">
          <thead>
            <tr>
              <th />
              <th>given</th>
              <th>value ± error</th>
              <th title="The 95 % interval (confidence; for Y at X the curve's)">95 %</th>
              {useRows.some((q) => q.plo !== undefined) && <th title="Where a new measurement falls (95 %)">prediction</th>}
            </tr>
          </thead>
          <tbody>
            {useRows.map((q, j) => (
              <tr key={j}>
                <td>{q.what === 'derived' ? q.name : q.what === 'y at x' ? 'Y at X' : q.what === 'x from y' ? 'X from Y' : q.what}</td>
                <td>{Number.isFinite(q.input) && q.what !== 'LOD' && q.what !== 'LOQ' ? fmtNum(q.input, 5) : ''}</td>
                <td className="mono">{Number.isFinite(q.error) ? fmtPm(q.value, q.error) : fmtNum(q.value, 6)}</td>
                <td>{Number.isFinite(q.lo) ? `${fmtNum(q.lo, 5)} – ${fmtNum(q.hi, 5)}` : ''}</td>
                {useRows.some((t) => t.plo !== undefined) && <td>{q.plo !== undefined ? `${fmtNum(q.plo, 5)} – ${fmtNum(q.phi ?? NaN, 5)}` : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
  const compareBlock = surf ? (
    <div className="hint">Comparisons: not for a surface or a regression (fit another one and compare the AIC on the Parameters tab).</div>
  ) : (
    <details open>
      <summary>Compare</summary>
      <div className="row wrap">
        <Check label="A second model" title="Fitted on the same runs (its parameters guessed), drawn dashed; compared by χ², R², AIC, AICc, BIC, the Akaike weights and (nested models) the F-test" value={!!data.compare2} onChange={(compare2) => set({ compare2, ...(compare2 && !data.model2 ? { model2 } : {}) })} />
        {data.compare2 && (
          <>
            <select className="nodrag grow" value={model2.kind === 'formula' ? '=' : model2.model} onChange={(e) => setModel2(e.target.value === '=' ? { kind: 'formula' } : { kind: 'library', model: e.target.value })}>
              {[...new Set(LIBRARY_OPTIONS.map((o) => o.group))].map((g) => (
                <optgroup key={g} label={g}>
                  {g === 'Basic' && <option value="poly">Polynomial</option>}
                  {LIBRARY_OPTIONS.filter((o) => o.group === g && o.id !== 'york').map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="=">Formula</option>
            </select>
            {model2.kind === 'library' && model2.model === 'poly' && (
              <Field label="Degree">
                <NumInput className="tiny" min={1} max={9} step={1} value={model2.degree} onChange={(degree) => setModel2({ degree: Math.max(1, Math.min(9, Math.floor(degree) || 1)) })} />
              </Field>
            )}
          </>
        )}
      </div>
      {data.compare2 && model2.kind === 'formula' && <TextInput className="mono" value={model2.formula} placeholder="y = A*exp(-x/t) + y0" title="Every name but x is a parameter" onChange={(formula) => setModel2({ formula })} />}
      {several && <Check label="The same parameters for every run? (F-test)" title="One fit of all the runs with every parameter shared, against a fit of each run: the F-test of the extra sum of squares, and AIC" value={!!data.sameTest} onChange={(sameTest) => set({ sameTest })} />}
      {(info?.compare ?? []).length > 0 && (
        <div className="stat-report">
          {info!.compare!.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </details>
  );
  return (
    <div className="node node-fit">
      <InPort label="dataset" port="dataset" id="in" title="A dataset (columns chosen below, else its designations), e.g. the data of a Plot curve" />
      {data.reconv && data.irfFrom === 'port' && !surf && (
        <InPort label="irf" port="dataset" id="irf" title="The instrument's response for the reconvolution: a dataset (its first X, Y) or a column (on the X of the data)">
          <span className="muted ellipsis">the IRF</span>
        </InPort>
      )}
      <NodeOptions>
        <Tabs
          tabs={[
            ['model', 'Model'],
            ['params', 'Parameters'],
            ['use', 'Use the fit'],
            ['compare', 'Compare'],
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'model' && (
          <>
            {dataBlock}
            {modelBlock}
            {curveRow}
          </>
        )}
        {tab === 'params' && (regKind ? regBlock || <div className="hint">The coefficients appear with the fit.</div> : paramsBlock || <div className="hint">The parameters appear with a model.</div>)}
        {tab === 'use' && useBlock}
        {tab === 'compare' && compareBlock}
      </NodeOptions>
      {info && (
        <>
          {runBar}
          {tools}
          {readerRow}
          {plot(520, 300)}
          <NodeOptions>
          {!surf && shownRanges.length > 0 && (
            <div className="row wrap fit-ranges">
              <span className="muted">{perRun ? (ownRanges?.length ? `Ranges of “${label}”:` : 'Common ranges:') : 'Ranges:'}</span>
              {shownRanges.map((rg, j) => (
                <span key={j} className="chip">
                  {Number.isFinite(rg.lo) ? fmtNum(rg.lo, 5) : '…'} – {Number.isFinite(rg.hi) ? fmtNum(rg.hi, 5) : '…'}
                  <button className="nodrag ts-btn" onClick={() => (perRun && !ownRanges?.length ? set({ ranges: data.ranges.filter((_, i) => i !== j) }) : setShownRanges(shownRanges.filter((_, i) => i !== j)))}>
                    <X {...IC} />
                  </button>
                </span>
              ))}
              {perRun && !!ownRanges?.length && (
                <button className="nodrag" title="These ranges for every run" onClick={() => set({ runRanges: Object.fromEntries(labels.map((lab) => [lab, ownRanges.map((q) => ({ ...q }))])) })}>
                  Copy to all runs
                </button>
              )}
            </div>
          )}
          {!surf && perRun && <RunRangesTable labels={labels} common={data.ranges} own={data.runRanges ?? {}} onChange={setRunRanges} onShow={setShown} shown={k} />}
          </NodeOptions>
          {res && (
            <div className="fit-stats">
              <span>N {res.stats.n}</span>
              <span>dof {res.stats.dof}</span>
              <span>R² {fmtNum(res.stats.r2, 6)}</span>
              <span>adj. R² {fmtNum(res.stats.adjR2, 6)}</span>
              <span>χ²ᵣ {fmtNum(res.stats.redChi2, 4)}</span>
              <span>RMSE {fmtNum(res.stats.rmse, 4)}</span>
              <span>{res.stats.iterations} it.</span>
            </div>
          )}
        </>
      )}
      {big &&
        info &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {runBar}
              {tools}
              {readerRow}
              {plot(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(360, Math.min((window.innerHeight || 800) * 0.74, 820)))}
            </div>
          </div>,
          document.body,
        )}
      <Messages result={r} />
      <OutPort label={`fit curves${nFits > 1 ? ` (${nFits})` : ''}`} port="dataset" id="fit" title={surf ? 'X, Y, Z and the fitted Z at every point' : "All the fit curves in one dataset: for every run (Y column) an X and its fit on a fine grid over the points fitted (and its band as ±Y, drawn shaded): to a Plot's dataset port, together with the data"} />
      {useOn && <OutPort label="use of the fit" port="dataset" id="use" title="A row per value asked: what (Y at X, X from Y, LOD, LOQ, a derived value), its name, the value given, the result, its error (±Y), its 95 % interval (and the prediction interval of Y at X)" />}
      <OutPort label="residuals" port="dataset" id="resid" title="Data − model at the points fitted: an X and a residual column for every run" />
      {(data.compare2 || data.sameTest) && !surf && <OutPort label="comparison" port="dataset" id="compare" title="A row per fit compared: the data, the fit, its parameters, N, χ², reduced χ², R², AIC, AICc, BIC, the Akaike weight, F and p (on the row of the fuller fit)" />}
      {regKind && <OutPort label="statistics" port="dataset" id="stats" title="The statistics of the regression: N, R² (McFadden's for a logistic one), F or the likelihood-ratio χ² and their p, AIC, BIC …" />}
      <OutPort label="parameters" port="dataset" id="params" title="A row per fit: its number, the data it was fitted on (the value of its block, else the Y column: X), its range and the X fitted from / to, every parameter (Y) with its error (±Y), N, R², adjusted R², χ², reduced χ², RMSE: right-click ▸ Plot these columns; one parameter: Extract column (one value when there is one fit)" />
    </div>
  );
}
