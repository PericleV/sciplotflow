// The parameters of a step of the Image analysis editor: a number on a slider (and written; a parameter that may be
// automatic: empty, the slider marked “auto” until moved), a choice, a tick; and the Threshold step on the histogram of
// what comes into it — the threshold a method found (a line), or the range set by hand (a band whose edges are dragged).
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Param } from '../image/steps.ts';
import { GLOBAL_METHODS } from '../image/threshold.ts';
import type { StepHist } from '../image/imageWorker.ts';
import { Check, NumInput, Select } from './ui.tsx';

const fmt = (v: number) => (Number.isFinite(v) ? +v.toPrecision(5) : NaN);
// the slider's span: the parameter's own, else from its unit — the image's values (those that come into the step), px,
// %, degrees — or about its default
function span(q: Extract<Param, { type: 'num' }>, hist?: StepHist): [number, number, number] {
  const [lo, hi] = [hist?.lo ?? 0, hist?.hi ?? 255];
  let a = q.min ?? 0;
  let b = q.max ?? NaN;
  if (q.unit === 'value') {
    const signed = q.key === 'offset';
    [a, b] = signed ? [-(hi - lo) / 2, (hi - lo) / 2] : [lo, hi];
  } else if (!Number.isFinite(b)) b = q.unit === '%' ? 100 : q.unit === '°' ? 180 : q.unit === 'px' ? Math.max(50, (Number.isFinite(q.def) ? q.def : 1) * 4) : Math.max(1, (Number.isFinite(q.def) ? Math.abs(q.def) : 1) * 4);
  const step = q.unit === 'value' ? (b - a) / 255 : (q.step ?? (b - a) / 200);
  return [a, b, step];
}

export function ParamField({ q, value, set, hist }: { q: Param; value: unknown; set: (v: unknown) => void; hist?: StepHist }) {
  const label = (
    <span className="ie-label" title={q.title}>
      {q.label}
    </span>
  );
  if (q.type === 'num') {
    const v = typeof value === 'number' ? value : q.def;
    const auto = !Number.isFinite(v);
    const [a, b, step] = span(q, hist);
    return (
      <>
        {label}
        <span className="ie-slider-row">
          <input
            className={`nodrag ie-slider${auto ? ' auto' : ''}`}
            type="range"
            min={a}
            max={b}
            step={step}
            value={auto ? (a + b) / 2 : Math.min(b, Math.max(a, v))}
            title={auto ? `${q.title ?? q.label}. Automatic (${q.auto ?? 'auto'}): move it to set a value` : q.title}
            onChange={(e) => set(Number(e.target.value))}
          />
          <NumInput className="tiny" value={v} min={q.min} max={q.max} step={q.step} placeholder={q.auto ? 'auto' : ''} title={q.auto ? `${q.title ?? ''} (empty: ${q.auto})` : q.title} onChange={(x) => set(x)} />
          {q.unit && q.unit !== 'value' && <span className="muted">{q.unit}</span>}
          {q.auto && !auto && (
            <button className="nodrag ts-btn" title={`Automatic again (${q.auto})`} onClick={() => set(NaN)}>
              A
            </button>
          )}
        </span>
      </>
    );
  }
  if (q.type === 'choice')
    return (
      <>
        {label}
        <Select<string> value={String(value ?? q.def)} options={q.options} title={q.title} onChange={(x) => set(x)} />
      </>
    );
  if (q.type === 'spots') {
    const n = Array.isArray(value) ? value.length : 0;
    return (
      <>
        {label}
        <span className="row">
          <span className="muted">{n ? `${n} spot${n === 1 ? '' : 's'} (and their mirrors)` : 'none yet: pick them in the Lattice tab'}</span>
          {n > 0 && (
            <button className="nodrag" title="The spots forgotten" onClick={() => set([])}>
              Clear
            </button>
          )}
        </span>
      </>
    );
  }
  if (q.type === 'bool')
    return (
      <>
        <span />
        <Check label={q.label} title={q.title} value={!!(value ?? q.def)} onChange={(x) => set(x)} />
      </>
    );
  return null;
}

// ---- Threshold: on the histogram of what comes in ----
const S = 256;
export function ThresholdEditor({ p, set, hist, note }: { p: Record<string, unknown>; set: (patch: Record<string, unknown>) => void; hist?: StepHist; note?: string }) {
  const method = String(p.method ?? 'otsu');
  const manual = method === 'manual';
  const light = !!p.light;
  const lo = hist?.lo ?? 0;
  const hi = hist?.hi ?? 255;
  // the threshold the method found (its note: “Otsu: 118”)
  const found = Number(/: (-?[\d.e+-]+)$/.exec(note ?? '')?.[1] ?? NaN);
  const low = Number.isFinite(p.low as number) ? (p.low as number) : lo;
  const high = Number.isFinite(p.high as number) ? (p.high as number) : hi;
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * S;
  const vAt = (px: number) => lo + Math.min(1, Math.max(0, px / S)) * (hi - lo);
  const histPath = useMemo(() => {
    const h = hist?.h[0];
    if (!h) return '';
    const top = Math.sqrt(Math.max(1, ...h));
    return `M0,100${Array.from(h, (v, k) => `L${k},${(100 - (Math.sqrt(v) / top) * 92).toFixed(1)}L${k + 1},${(100 - (Math.sqrt(v) / top) * 92).toFixed(1)}`).join('')}L${S},100Z`;
  }, [hist]);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<'low' | 'high' | null>(null);
  const at = (e: { clientX: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * S;
  };
  // by hand: from the method's threshold (the objects on its side)
  const toManual = () => {
    const t = Number.isFinite(found) ? found : (lo + hi) / 2;
    set({ method: 'manual', low: fmt(light ? lo : t), high: fmt(light ? t : hi) });
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    if (!manual || e.button !== 0) return;
    svg.current!.setPointerCapture?.(e.pointerId);
    const px = at(e);
    // the nearer edge moves (to where the mouse is)
    const which = Math.abs(px - x(low)) <= Math.abs(px - x(high)) ? 'low' : 'high';
    setDrag(which);
    const v = fmt(vAt(px));
    set(which === 'low' ? { low: Math.min(v, high) } : { high: Math.max(v, low) });
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const v = fmt(vAt(at(e)));
    set(drag === 'low' ? { low: Math.min(v, high) } : { high: Math.max(v, low) });
  };
  const [a, b] = manual ? [x(low), x(high)] : light ? [0, x(found)] : [x(found), S];
  return (
    <div className="ie-threshold">
      <div className="ie-params">
        <span className="ie-label">Method</span>
        <Select<string>
          value={method}
          options={[['manual', 'by hand'], ...GLOBAL_METHODS]}
          title="By hand: the range of the objects dragged on the histogram; else found by a method (ImageJ's)"
          onChange={(m) => (m === 'manual' ? toManual() : set({ method: m }))}
        />
      </div>
      <svg ref={svg} className={`nodrag ie-thr-graph${manual ? ' manual' : ''}`} viewBox={`0 0 ${S} 100`} preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        <rect width={S} height={100} className="curves-bg" />
        {Number.isFinite(a) && Number.isFinite(b) && <rect x={Math.min(a, b)} y={0} width={Math.abs(b - a)} height={100} className="ie-thr-band" />}
        {histPath && <path d={histPath} className="curves-hist" />}
        {manual ? (
          <>
            <line x1={x(low)} y1={0} x2={x(low)} y2={100} className="ie-thr-edge" />
            <line x1={x(high)} y1={0} x2={x(high)} y2={100} className="ie-thr-edge" />
          </>
        ) : (
          Number.isFinite(found) && <line x1={x(found)} y1={0} x2={x(found)} y2={100} className="ie-thr-edge" />
        )}
      </svg>
      <div className="ie-params">
        {manual ? (
          <>
            <ParamField q={{ key: 'low', label: 'Low', type: 'num', def: NaN, unit: 'value' }} value={low} hist={hist} set={(v) => set({ low: Math.min(v as number, high) })} />
            <ParamField q={{ key: 'high', label: 'High', type: 'num', def: NaN, unit: 'value' }} value={high} hist={hist} set={(v) => set({ high: Math.max(v as number, low) })} />
          </>
        ) : (
          <>
            <span className="ie-label">Found</span>
            <span className="row">
              <b>{Number.isFinite(found) ? fmt(found) : 'none'}</b>
              <button className="nodrag" title="Set the range by hand from this threshold" onClick={toManual}>
                By hand from it
              </button>
            </span>
            <span />
            <Check label="Light background" title="The objects darker than the background" value={light} onChange={(v) => set({ light: v })} />
          </>
        )}
      </div>
      <div className="hint">{manual ? 'The objects: the values in the band. Drag its edges on the histogram, or the sliders.' : 'The objects: the values on the shaded side of the threshold found.'}</div>
    </div>
  );
}
