// The editor of an Image analysis node, over the whole window: the steps on the left (added by group, switched on and
// off, moved, each with all its parameters; a click on one shows the image up to it), the image in the middle (zoom,
// pan, the original at a key, the values under the mouse), the histogram, the view and the calibration on the right
// (a line drawn on the scale bar). The image is computed at full size in a worker of its own.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import type { AppNode, ImageAnalysisData } from '../types.ts';
import { STEP_DEFS, STEP_GROUPS, newStep, type ImgStep, type Param, type StepDef, type StepKind } from '../image/steps.ts';
import { unpackPixels } from '../image/raster.ts';
import { unitText } from '../image/node.ts';
import type { ImgReply, ImgRequest } from '../image/imageWorker.ts';
import type { Lut } from '../image/render.ts';
import { COLOR_MAPS } from '../figure/colors.ts';
import { Check, NumInput, Select } from './ui.tsx';
import { ArrowDown, ArrowUp, Maximize, Minus, Plus, Ruler, Hand, X } from 'lucide-react';
import { IC } from './iconProps.ts';

const LUTS = Object.entries(COLOR_MAPS).map(([k, v]): [Lut, string] => [k as Lut, v.label]);
const fmt = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : +v.toPrecision(5)) : '—');

// ---- a step's parameters ----

// a curve of points (input, output in 0 … 1) on a small graph: drag a point, double-click to add one or take it away
function CurveEditor({ value, onChange }: { value: [number, number][]; onChange: (v: [number, number][]) => void }) {
  const S = 150;
  const pts = [...value].sort((a, b) => a[0] - b[0]);
  const [drag, setDrag] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  const path = useMemo(() => {
    // the monotone curve drawn through the points (as the step computes it)
    const n = 64;
    const f = (t: number) => {
      if (t <= pts[0][0]) return pts[0][1];
      if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
      let i = 0;
      while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
      const u = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (u * u * (3 - 2 * u));
    };
    return Array.from({ length: n + 1 }, (_, k) => `${k ? 'L' : 'M'}${((k / n) * S).toFixed(1)},${((1 - f(k / n)) * S).toFixed(1)}`).join('');
  }, [pts]);
  return (
    <svg
      ref={svg}
      className="nodrag curve-editor"
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      onPointerMove={(e) => {
        if (drag === null) return;
        const p = at(e);
        onChange(pts.map((q, k) => (k === drag ? p : q)));
      }}
      onPointerUp={() => setDrag(null)}
      onDoubleClick={(e) => {
        const p = at(e);
        const near = pts.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05);
        if (near >= 0 && pts.length > 2) onChange(pts.filter((_, k) => k !== near));
        else onChange([...pts, p]);
      }}
    >
      <rect width={S} height={S} className="curve-bg" />
      <path d={`M0,${S}L${S},0`} className="curve-diag" />
      <path d={path} className="curve-line" />
      {pts.map((q, k) => (
        <circle
          key={k}
          cx={q[0] * S}
          cy={(1 - q[1]) * S}
          r={4}
          className="curve-pt"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrag(k);
          }}
        />
      ))}
    </svg>
  );
}

function ParamField({ q, value, set }: { q: Param; value: unknown; set: (v: unknown) => void }) {
  const label = (
    <span className="ie-label" title={q.title}>
      {q.label}
    </span>
  );
  if (q.type === 'num')
    return (
      <>
        {label}
        <span className="row">
          <NumInput className="short" value={typeof value === 'number' ? value : q.def} min={q.min} max={q.max} step={q.step} placeholder={q.auto ?? ''} title={q.title} onChange={(v) => set(v)} />
          {q.unit && q.unit !== 'value' && <span className="muted">{q.unit}</span>}
        </span>
      </>
    );
  if (q.type === 'choice')
    return (
      <>
        {label}
        <Select<string> value={String(value ?? q.def)} options={q.options} title={q.title} onChange={(v) => set(v)} />
      </>
    );
  if (q.type === 'bool')
    return (
      <>
        <span />
        <Check label={q.label} title={q.title} value={!!(value ?? q.def)} onChange={(v) => set(v)} />
      </>
    );
  return (
    <>
      {label}
      <CurveEditor value={(value as [number, number][]) ?? q.def} onChange={(v) => set(v)} />
    </>
  );
}

// ---- the histogram ----

function Histogram({ hist, lo, hi, marks }: { hist: Float64Array | null; lo: number; hi: number; marks: number[] }) {
  const W = 256;
  const H = 90;
  if (!hist) return <div className="ie-hist" />;
  // the counts on a square-root scale (a tall peak does not hide the rest)
  const top = Math.sqrt(Math.max(1, ...hist));
  const d = Array.from(hist, (v, k) => `M${k + 0.5},${H}V${(H - (Math.sqrt(v) / top) * (H - 2)).toFixed(1)}`).join('');
  return (
    <svg className="ie-hist" width={W} height={H + 14} viewBox={`0 0 ${W} ${H + 14}`}>
      <path d={d} className="ie-hist-bars" />
      {marks.map((m, k) => {
        const x = ((m - lo) / (hi - lo || 1)) * W;
        return Number.isFinite(x) && x >= 0 && x <= W ? <path key={k} d={`M${x.toFixed(1)},0V${H}`} className="ie-hist-mark" /> : null;
      })}
      <text x={0} y={H + 12} className="ie-hist-label">
        {fmt(lo)}
      </text>
      <text x={W} y={H + 12} textAnchor="end" className="ie-hist-label">
        {fmt(hi)}
      </text>
    </svg>
  );
}

// ---- the editor ----

let stepSeq = 0;
export function ImageEditor({ id, data, onClose }: { id: string; data: ImageAnalysisData; onClose: () => void }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<ImageAnalysisData>) => updateNodeData(id, p);
  const steps = useMemo(() => data.steps ?? [], [data.steps]);
  const setSteps = (s: ImgStep[]) => set({ steps: s });
  const setStep = (sid: string, p: Partial<ImgStep>) => setSteps(steps.map((s) => (s.id === sid ? { ...s, ...p } : s)));
  // the step the image is shown up to (absent: all), the original while held
  const [upTo, setUpTo] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [lut, setLut] = useState<Lut>(data.figure?.lut ?? 'gray');
  const [overlay, setOverlay] = useState(true);
  const [tool, setTool] = useState<'pan' | 'scale'>('pan');
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [reply, setReply] = useState<ImgReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [line, setLine] = useState<[number, number, number, number] | null>(data.cal?.line ?? null);
  const [known, setKnown] = useState<number>(data.cal?.length ?? NaN);
  const [unit, setUnit] = useState<string>(unitText(data.cal?.unit ?? 'µm'));
  const base = useMemo(() => (data.pixels ? unpackPixels(data.pixels, data.pixelsId) : null), [data.pixels, data.pixelsId]);
  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // the worker: the image sent once, the steps every time they change
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const sentId = useRef<string | null>(null);
  useEffect(() => {
    const w = new Worker(new URL('../image/imageWorker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<ImgReply>) => {
      if (e.data.seq !== seq.current) return;
      setReply(e.data);
      setBusy(false);
    };
    return () => w.terminate();
  }, []);
  const upToIndex = original ? 0 : upTo ? steps.findIndex((s) => s.id === upTo) + 1 : steps.length;
  useEffect(() => {
    const w = worker.current;
    if (!w || !data.pixels) return;
    const t = setTimeout(() => {
      const q: ImgRequest = { seq: ++seq.current, steps, upTo: upToIndex, lut, ...(overlay ? { overlay: { color: data.figure?.overlay ?? '#ff3b30', alpha: data.figure?.alpha ?? 0.45 } } : {}) };
      if (sentId.current !== data.pixelsId) {
        q.pixels = data.pixels;
        q.id = data.pixelsId ?? 'img';
        sentId.current = data.pixelsId ?? 'img';
      }
      setBusy(true);
      w.postMessage(q);
    }, 40);
    return () => clearTimeout(t);
  }, [steps, upToIndex, lut, overlay, data.pixels, data.pixelsId, data.figure?.overlay, data.figure?.alpha]);
  // the pixels drawn
  useEffect(() => {
    const c = canvas.current;
    if (!c || !reply) return;
    c.width = reply.w;
    c.height = reply.h;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(reply.rgba), reply.w, reply.h), 0, 0);
  }, [reply]);
  // the zoom that fits the view (zoom 0: fit), measured when the view or the image changes size
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const v = view.current;
    if (!v || !base) return;
    const measure = () => setFit(Math.min((v.clientWidth - 20) / base.w, (v.clientHeight - 20) / base.h));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    return () => ro.disconnect();
  }, [base]);
  const k = zoom || fit;
  const zoomAt = (f: number, cx?: number, cy?: number) => {
    const v = view.current;
    const nk = Math.min(64, Math.max(0.02, k * f));
    if (v && cx !== undefined && cy !== undefined) {
      const r = v.getBoundingClientRect();
      const mx = cx - r.left - r.width / 2 - pan[0];
      const my = cy - r.top - r.height / 2 - pan[1];
      setPan([pan[0] - mx * (nk / k - 1), pan[1] - my * (nk / k - 1)]);
    }
    setZoom(nk);
  };
  // a point of the image under the mouse (pixels, fractional)
  const imgAt = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvas.current!.getBoundingClientRect();
    return [((e.clientX - c.left) / c.width) * (base?.w ?? 1), ((e.clientY - c.top) / c.height) * (base?.h ?? 1)];
  };
  const drag = useRef<{ x: number; y: number; pan: [number, number]; line?: boolean } | null>(null);
  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'scale' && e.button === 0) {
      const p = imgAt(e);
      setLine([p[0], p[1], p[0], p[1]]);
      drag.current = { x: e.clientX, y: e.clientY, pan, line: true };
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, pan };
  };
  const onMove = (e: RPointerEvent) => {
    if (base) {
      const p = imgAt(e);
      setHover(p[0] >= 0 && p[1] >= 0 && p[0] < base.w && p[1] < base.h ? p : null);
    }
    const d = drag.current;
    if (!d) return;
    if (d.line) {
      const p = imgAt(e);
      // Shift: horizontal or vertical
      setLine((l) => (l ? (e.shiftKey ? (Math.abs(p[0] - l[0]) > Math.abs(p[1] - l[1]) ? [l[0], l[1], p[0], l[1]] : [l[0], l[1], l[0], p[1]]) : [l[0], l[1], p[0], p[1]]) : l));
      return;
    }
    setPan([d.pan[0] + e.clientX - d.x, d.pan[1] + e.clientY - d.y]);
  };
  const lineLen = line ? Math.hypot(line[2] - line[0], line[3] - line[1]) : 0;
  const applyScale = () => {
    if (!(lineLen > 0) || !(known > 0)) return;
    set({ cal: { size: known / lineLen, unit, line: line!, length: known } });
  };
  // the values under the mouse: the original's and the result's
  const readout = (() => {
    if (!hover || !base || !reply) return null;
    const x = Math.floor(hover[0]);
    const y = Math.floor(hover[1]);
    const i = y * base.w + x;
    const o = base.ch.map((c) => c[i]);
    const rv = reply.values.map((c) => c[i]);
    const cal = data.cal && data.cal.size > 0 ? ` = ${fmt(x * data.cal.size)}, ${fmt(y * data.cal.size)} ${unitText(data.cal.unit)}` : '';
    return `x ${x}, y ${y}${cal} · original ${o.map(fmt).join(' / ')} · result ${rv.map(fmt).join(' / ')}`;
  })();
  // the thresholds found (or set) to mark on the histogram
  const marks: number[] = [];
  for (const s of steps.slice(0, upToIndex)) {
    const note = reply?.notes[s.id];
    const m = note && /: (-?[\d.e+-]+)$/.exec(note);
    if (m) marks.push(Number(m[1]));
  }
  const add = (kind: StepKind) => {
    const s = newStep(kind, `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`);
    // added after the step shown (else at the end), and shown
    const at = upTo ? steps.findIndex((q) => q.id === upTo) + 1 : steps.length;
    setSteps([...steps.slice(0, at), s, ...steps.slice(at)]);
    setUpTo(null);
  };
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= steps.length) return;
    const s = [...steps];
    [s[k], s[j]] = [s[j], s[k]];
    setSteps(s);
  };
  const key = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    if (e.key === 'Escape') onClose();
    else if (e.key === 'b' || e.key === 'B') setOriginal(true);
    else if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-') zoomAt(0.8);
    else if (e.key === '0') {
      setZoom(0);
      setPan([0, 0]);
    }
    else return;
    e.preventDefault();
  };
  useEffect(() => root.current?.focus(), []);
  // the steps offered, by group
  const addOptions = STEP_GROUPS.map((g): [string, [StepKind, StepDef][]] => [g, (Object.entries(STEP_DEFS) as [StepKind, StepDef][]).filter(([, d]) => d.group === g)]);

  return createPortal(
    <div className="image-editor nowheel" ref={root} tabIndex={-1} onKeyDown={key} onKeyUp={(e) => (e.key === 'b' || e.key === 'B') && setOriginal(false)}>
      <div className="ie-toolbar">
        <b className="ellipsis">{data.name || 'image'}</b>
        <span className="muted">
          {base ? `${base.w} × ${base.h}` : ''}
          {busy ? ' · computing…' : ''}
        </span>
        <span className="grow" />
        <button className={`nodrag${tool === 'pan' ? ' on' : ''}`} title="Move the image (drag); the wheel zooms" onClick={() => setTool('pan')}>
          <Hand {...IC} />
        </button>
        <button className={`nodrag${tool === 'scale' ? ' on' : ''}`} title="Set the scale: draw a line along the scale bar (Shift: straight), then give its length" onClick={() => setTool('scale')}>
          <Ruler {...IC} /> Scale
        </button>
        <button className="nodrag" title="Zoom out (−)" onClick={() => zoomAt(0.8)}>
          <Minus {...IC} />
        </button>
        <span className="muted ie-zoom">{Math.round(k * 100)} %</span>
        <button className="nodrag" title="Zoom in (+)" onClick={() => zoomAt(1.25)}>
          <Plus {...IC} />
        </button>
        <button className="nodrag" title="Fit the window (0)" onClick={() => (setZoom(0), setPan([0, 0]))}>
          <Maximize {...IC} />
        </button>
        <button className="nodrag" title="1 image pixel = 1 screen pixel" onClick={() => setZoom(1)}>
          1:1
        </button>
        <button className={`nodrag${original ? ' on' : ''}`} title="The original image while pressed (or hold B)" onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)}>
          Original
        </button>
        <button className="nodrag ie-close" title="Close the editor (Esc); Ctrl+Z undoes" onClick={onClose}>
          <X {...IC} />
        </button>
      </div>
      <div className="ie-body">
        <div className="ie-steps">
          <div className="row">
            <select
              className="nodrag grow"
              value=""
              title="Add a step (after the one shown, else at the end)"
              onChange={(e) => {
                if (e.target.value) add(e.target.value as StepKind);
                e.target.value = '';
              }}
            >
              <option value="">+ Add a step…</option>
              {addOptions.map(([g, items]) => (
                <optgroup key={g} label={g}>
                  {items.map(([kind, d]) => (
                    <option key={kind} value={kind} title={d.title}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button className={`nodrag ie-step-head ie-original${upToIndex === 0 ? ' shown' : ''}`} title="Show the original image" onClick={() => setUpTo(steps[0]?.id ? '__none' : null)}>
            Original image
          </button>
          {steps.map((s, k) => {
            const d = STEP_DEFS[s.kind];
            const shown = upTo ? s.id === upTo : k === steps.length - 1;
            const err = reply?.errors[s.id];
            const note = reply?.notes[s.id];
            return (
              <div key={s.id} className={`ie-step${shown ? ' shown' : ''}${s.on ? '' : ' off'}${k >= upToIndex && upToIndex < steps.length ? ' after' : ''}`}>
                <div className="row ie-step-head">
                  <input className="nodrag" type="checkbox" checked={s.on} title="On (off: passed over)" onChange={(e) => setStep(s.id, { on: e.target.checked })} />
                  <button className="nodrag ie-step-name grow" title={`${d?.title ?? ''} — click: show the image up to this step`} onClick={() => setUpTo(upTo === s.id ? null : s.id)}>
                    {k + 1}. {d?.label ?? s.kind}
                  </button>
                  <button className="nodrag ts-btn" title="Up" disabled={k === 0} onClick={() => move(k, -1)}>
                    <ArrowUp {...IC} />
                  </button>
                  <button className="nodrag ts-btn" title="Down" disabled={k === steps.length - 1} onClick={() => move(k, 1)}>
                    <ArrowDown {...IC} />
                  </button>
                  <button className="nodrag ts-btn" title="Remove this step" onClick={() => (setSteps(steps.filter((q) => q.id !== s.id)), upTo === s.id && setUpTo(null))}>
                    <X {...IC} />
                  </button>
                </div>
                {d && d.params.length > 0 && (
                  <div className="ie-params">
                    {d.params.map((q) => (
                      <ParamField key={q.key} q={q} value={s.p[q.key]} set={(v) => setStep(s.id, { p: { ...s.p, [q.key]: v as never } })} />
                    ))}
                  </div>
                )}
                {note && <div className="hint">{note}</div>}
                {err && <div className="hint ie-err">{err}</div>}
              </div>
            );
          })}
          {!steps.length && <div className="hint">Add steps to prepare the image: tone and colour, noise, background, edges, texture, then a threshold (a mask) and its morphology. Each works on what the steps above give.</div>}
        </div>
        <div
          className={`ie-view${tool === 'scale' ? ' scale' : ''}`}
          ref={view}
          onWheel={(e) => zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="ie-stage" style={{ transform: `translate(${pan[0]}px, ${pan[1]}px)` }}>
            <canvas ref={canvas} style={{ width: (base?.w ?? 0) * k, height: (base?.h ?? 0) * k }} />
            {line && (
              <svg className="ie-overlay" width={(base?.w ?? 0) * k} height={(base?.h ?? 0) * k}>
                <line x1={line[0] * k} y1={line[1] * k} x2={line[2] * k} y2={line[3] * k} className="ie-scale-line" />
              </svg>
            )}
          </div>
          {readout && <div className="ie-readout">{readout}</div>}
        </div>
        <div className="ie-side">
          <div className="ie-section">Histogram{upToIndex < steps.length ? ` (up to step ${upToIndex})` : ''}</div>
          <Histogram hist={reply?.hist ?? null} lo={reply?.lo ?? 0} hi={reply?.hi ?? 1} marks={marks} />
          <div className="ie-section">View</div>
          <div className="row wrap">
            <Select<Lut> value={lut} options={LUTS} title="The colour table of a gray image (the view; the figure has its own in the options)" onChange={setLut} />
            {reply?.kind === 'mask' && <Check label="mask over the image" title="A mask shown in a colour over the original, else white on black" value={overlay} onChange={setOverlay} />}
          </div>
          <div className="ie-section">Calibration</div>
          <div className="hint">{data.cal && data.cal.size > 0 ? `1 px = ${fmt(data.cal.size)} ${unitText(data.cal.unit)} (${fmt(1 / data.cal.size)} px per ${unitText(data.cal.unit)})` : 'Not calibrated: the results in pixels.'}</div>
          <div className="hint">Scale: draw a line along the scale bar, give its length.</div>
          <div className="row wrap">
            <span className="muted">{lineLen > 0 ? `line ${fmt(lineLen)} px =` : 'no line yet'}</span>
            <NumInput className="short" min={0} value={known} placeholder="length" onChange={setKnown} />
            <Select<string> value={unit} options={['nm', 'µm', 'mm', 'cm', 'm', 'Å'].map((u): [string, string] => [u, u])} onChange={setUnit} />
            <button className="nodrag btn-run" disabled={!(lineLen > 0) || !(known > 0)} title="The size of a pixel from the line" onClick={applyScale}>
              Set
            </button>
            {data.cal && (
              <button className="nodrag" title="No calibration: the results in pixels" onClick={() => (set({ cal: undefined }), setLine(null))}>
                Remove
              </button>
            )}
          </div>
          <div className="ie-section">Keys</div>
          <div className="hint">Wheel: zoom · drag: move · B: the original while held · + − 0: zoom, fit · Esc: close</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
