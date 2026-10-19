// The Signal nodes: Smooth, Interpolate / Extrapolate, Normalize, FFT, Convolution, Average curves — the data (X, Y columns), the
// method and its options, a graph of the data (dots) and the result (a line) of the Y chosen, the outputs.
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { columnLetter } from '../engine/csv.ts';
import { useNodeResult } from '../engine/engine.ts';
import type { NodeResult } from '../engine/evaluate.ts';
import type { SignalPlot } from '../engine/signalnodes.ts';
import { fmtNum, type ColumnRole } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import type { AppNode, AverageData, AverageNode, ConvData, ConvNode, FFTData, FFTNode, InterpData, InterpNode, NormalizeData, NormalizeNode, SmoothData, SmoothNode } from '../types.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { maxOf } from '../engine/minmax.ts';
import { WAVELETS } from '../engine/wavelet.ts';
import { createPortal } from 'react-dom';
import { Maximize2, X as XIcon } from 'lucide-react';
import { IC } from './iconProps.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve, type ReaderProp } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

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
// panned with the tools above it (the result's axis follows), read with the data reader
function SignalGraph({ plot, W, H, zoom, view, onView, zoomOut, reader }: { plot: SignalPlot; W: number; H: number; zoom: ZoomMode; view: View | null; onView: (v: View | null) => void; zoomOut: number; reader?: Omit<ReaderProp, 'curves'> }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState('default');
  // the limits: of everything, or (the result on its own axis, at the right) of the data and of the result apart
  const own = !!plot.ownAxis && !!plot.data;
  const all = [plot.result, ...(plot.data ? [plot.data] : []), ...(plot.others ?? []), ...(plot.band ? [{ x: plot.band.x, y: plot.band.lo }, { x: plot.band.x, y: plot.band.hi }] : [])];
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
    if (plot.band) {
      // the range (± SD), shaded
      const { x, lo, hi } = plot.band;
      g.fillStyle = 'rgba(214, 39, 40, 0.15)';
      g.beginPath();
      x.forEach((v, i) => g[i ? 'lineTo' : 'moveTo'](fx(v), fy(hi[i])));
      for (let i = x.length - 1; i >= 0; i--) g.lineTo(fx(x[i]), fy(lo[i]));
      g.closePath();
      g.fill();
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
    g.textAlign = 'center';
    g.fillText(plot.xName, M.l + pw / 2, H - 3);
    if (z.rect) {
      g.strokeStyle = '#1f6fd6';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      g.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot, W, H, box.x0, box.x1, box.y0, box.y1, z.rect]);
  const at = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const curves: ReadCurve[] = [...(plot.data ? [{ name: 'data', color: '#1f6fd6', x: plot.data.x, y: plot.data.y }] : []), { name: own ? 'result (right axis)' : 'result', color: '#d62728', x: plot.result.x, y: plot.result.y, ...(own ? { onAxis: toLeft } : {}) }, ...(plot.others ?? []).map((o, j) => ({ name: `curve ${j + 1}`, color: '#9aa3ad', x: o.x, y: o.y }))];
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
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          z.down(...at(e), e);
        }}
        onPointerMove={(e) => {
          if (z.move(...at(e))) setCursor(zoom === 'pan' ? 'grab' : 'crosshair');
          else setCursor(zoom === 'none' ? 'default' : 'crosshair');
        }}
        onPointerUp={(e) => z.up(...at(e))}
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
// the data: X and the Y columns
function DataRows<T extends { x: string; ys: string }>({ data, set, names, avail }: { data: T; set: (p: Partial<T>) => void; names: string[]; avail?: { name: string; role?: ColumnRole }[] }) {
  return (
    <>
      <span>X</span>
      <Select value={data.x} options={[['', xAutoLabel(avail)], ['-', 'row number'], ...names.map((n): [string, string] => [n, n])]} onChange={(x) => set({ x } as Partial<T>)} />
      <span>Y</span>
      <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} title="The Y columns: one, or several (a list: 2, B-D, names, A*); auto: the designated ones — each processed on its own" onChange={(ys) => set({ ys } as Partial<T>)} />
    </>
  );
}
// the graph of the Y chosen, the messages
// (with its tools — zoom, pan, out, rescale, the data reader, the graph large — as the other graphs of the nodes)
function Result({ r, children }: { r?: NodeResult; children?: ReactNode }) {
  const [k, setK] = useState(0);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const s = r?.view.signal;
  const j = Math.min(k, Math.max(0, (s?.plots.length ?? 1) - 1));
  const plot = s?.plots[j];
  const names = plot ? [...(plot.data ? ['data'] : []), plot.ownAxis && plot.data ? 'result (right axis)' : 'result', ...(plot.others ?? []).map((_, q) => `curve ${q + 1}`)] : [];
  const graph = (w: number, h: number) => plot && <SignalGraph plot={plot} W={w} H={h} zoom={zoom} view={view} onView={setView} zoomOut={out} reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }} />;
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
        <ReaderButton r={rd} set={setRd} onOn={() => setZoom('none')} />
        <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
      <ReaderOptions r={rd} set={setRd} names={names} />
    </>
  );
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
          ]}
          onChange={(method) => set({ method })}
        />
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
              <Select<'soft' | 'hard'>
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
        {m !== 'lowess' && m !== 'fft' && m !== 'wavelet' && (
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
      <Result r={r} />
      <OutPort label="dataset" port="dataset" id="out" title="X, the data (optional), the smoothed curves, the residuals (optional)" />
    </div>
  );
}

export function InterpNodeView({ id, data }: NodeProps<InterpNode>) {
  const { r, avail, names, set } = useSignal<InterpData>(id);
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X and the Y columns (designated, or chosen)" />
      <InPort label="at" port="column" id="at" title="Optional: the new X (a column, or a dataset: its X) — New X ▸ from the “at” port" />
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
      <Result r={r} />
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
      <Result r={r} />
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
            ['filter', 'filter (low / high / band)'],
          ]}
          onChange={(mode) => set({ mode })}
        />
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
                    title="Density: power per unit of frequency (V²/Hz) — for noise; spectrum: power (V²) — for the height of a sine"
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
              ]}
              onChange={(filter) => set({ filter })}
            />
            <span>Cut-off</span>
            <span className="row">
              <NumInput className="short" value={data.f1} title="In 1 / the unit of X (the frequencies of the spectrum)" onChange={(f1) => set({ f1 })} />
              {(data.filter === 'band' || data.filter === 'stop') && (
                <>
                  <span>–</span>
                  <NumInput className="short" value={data.f2} onChange={(f2) => set({ f2 })} />
                </>
              )}
            </span>
            <span>Design</span>
            <span className="row">
              <Select<'fft' | 'butter' | 'cheby1'>
                value={data.design ?? 'fft'}
                title="By the FFT (the frequencies cut in the spectrum), or a recursive (IIR) filter as electronics make them: Butterworth (flat in the band), Chebyshev I (steeper, a ripple in the band)"
                options={[
                  ['fft', 'FFT'],
                  ['butter', 'Butterworth (IIR)'],
                  ['cheby1', 'Chebyshev I (IIR)'],
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
            <span>Edge</span>
            <span className="row">
              {iir ? (
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
        {mode === 'filter' && !iir && <Check label="Mirror the ends first" value={data.mirror} onChange={(mirror) => set({ mirror })} />}
      </div>
      </NodeOptions>
      <Result r={r} />
      <OutPort label="dataset" port="dataset" id="out" title="The spectrum, the PSD, the spectrogram or scalogram (time, frequency, power: for Contour), the coherence, the envelope and phase, the Allan deviation, or the filtered curves" />
    </div>
  );
}

export function ConvNodeView({ id, data }: NodeProps<ConvNode>) {
  const { r, avail, names, set } = useSignal<ConvData>(id);
  return (
    <div className="node node-signal">
      <InPort label="dataset" port="dataset" id="in" title="X (evenly spaced) and the Y columns" />
      <InPort label="kernel" port="column" id="kernel" title="Optional: the response (a column, or a dataset: its first Y) on the same step of X — Response ▸ from the “kernel” port; for a correlation: the other signal (none: each Y with itself)" />
      <NodeOptions>
      <div className="col-form">
        <DataRows data={data} set={set} names={names} avail={avail} />
        <span>Operation</span>
        <Select<ConvData['op']>
          value={data.op}
          options={[
            ['conv', 'convolve (broaden)'],
            ['wiener', 'deconvolve — Wiener'],
            ['rl', 'deconvolve — Richardson–Lucy'],
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
      <Result r={r} />
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
        <InPort key={k} label={columnLetter(k)} port="dataset" id={`in-${k}`} title="A dataset: its Y columns (designated, or chosen), each with its X — a new port appears when the last one is used" />
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
      <Result r={r} />
      <OutPort label="dataset" port="dataset" id="out" title="X, the mean, SD (designated ±Y), SE, N (and min, max, median)" />
    </div>
  );
}
