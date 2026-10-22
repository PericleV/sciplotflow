// The Curves step of the Image analysis editor: the curve from the input to the output value drawn exactly as the step
// applies it (the same monotone cubic), over the histogram of what comes into the step; RGB: the curve of all the
// channels, then one for each (R, G, B). A click on the graph adds a point on the curve and drags it; a point dragged
// (its neighbours keep it in order; the ends move too, as the black and white points), taken off with a double-click
// or dragged out of the graph; the point chosen written in the image's own values; a few curves ready.
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { monotoneCurve } from '../image/tone.ts';
import type { StepHist } from '../image/imageWorker.ts';
import { NumInput, Select } from './ui.tsx';

type Pts = [number, number][];
type Chan = 'points' | 'r' | 'g' | 'b';
const S = 256; // the graph's own units (drawn to the panel's width)
const IDENTITY: Pts = [
  [0, 0],
  [1, 1],
];
const PRESETS: [string, string, Pts][] = [
  ['linear', 'linear', IDENTITY],
  [
    'contrast',
    'more contrast (S)',
    [
      [0, 0],
      [0.25, 0.18],
      [0.75, 0.82],
      [1, 1],
    ],
  ],
  [
    'soft',
    'less contrast',
    [
      [0, 0],
      [0.25, 0.32],
      [0.75, 0.68],
      [1, 1],
    ],
  ],
  [
    'lighten',
    'lighter middle',
    [
      [0, 0],
      [0.5, 0.62],
      [1, 1],
    ],
  ],
  [
    'darken',
    'darker middle',
    [
      [0, 0],
      [0.5, 0.38],
      [1, 1],
    ],
  ],
  [
    'invert',
    'inverted',
    [
      [0, 1],
      [1, 0],
    ],
  ],
];
const CHAN_COLOR: Record<Chan, string> = {
  points: 'var(--text)',
  r: '#e03131',
  g: '#2f9e44',
  b: '#1971c2',
};
const sorted = (p: Pts) => [...p].filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])).sort((a, b) => a[0] - b[0]);
const fmt = (v: number) => (Number.isFinite(v) ? +v.toPrecision(5) : NaN);

export function CurvesEditor({ p, set, rgb, hist }: { p: Record<string, unknown>; set: (key: Chan, v: Pts) => void; rgb: boolean; hist?: StepHist }) {
  const [chan, setChan] = useState<Chan>('points');
  const pts = useMemo(() => sorted((p[chan] as Pts | undefined) ?? IDENTITY), [p, chan]);
  const f = useMemo(() => monotoneCurve(pts), [pts]);
  const [sel, setSel] = useState<number | null>(null);
  // a point being dragged; out: dragged out of the graph (taken off when let go)
  const [drag, setDrag] = useState<{ k: number; out: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
  };
  const lo = hist?.lo ?? 0;
  const hi = hist?.hi ?? 1;
  const toValue = (t: number) => lo + t * (hi - lo);
  const fromValue = (v: number) => (v - lo) / (hi - lo || 1);
  // the curve drawn as the step computes it, every 1/256
  const path = useMemo(() => Array.from({ length: S + 1 }, (_, k) => `${k ? 'L' : 'M'}${k},${((1 - Math.min(1, Math.max(0, f(k / S)))) * S).toFixed(2)}`).join(''), [f]);
  // the histogram of what comes in (the channel's; all: the luminance), on a square-root scale
  const histPath = useMemo(() => {
    const h = hist?.h[chan === 'points' ? 0 : chan === 'r' ? 1 : chan === 'g' ? 2 : 3] ?? hist?.h[0];
    if (!h) return '';
    const top = Math.sqrt(Math.max(1, ...h));
    return `M0,${S}${Array.from(h, (v, k) => `L${k},${(S - (Math.sqrt(v) / top) * S * 0.9).toFixed(1)}L${k + 1},${(S - (Math.sqrt(v) / top) * S * 0.9).toFixed(1)}`).join('')}L${S},${S}Z`;
  }, [hist, chan]);
  const write = (next: Pts) =>
    set(
      chan,
      next.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as [number, number]),
    );
  // a point moved: kept between its neighbours (the ends may move inwards), the output in 0 … 1
  const moved = (k: number, x: number, y: number): [number, number] => {
    const gap = 0.005;
    const a = k > 0 ? pts[k - 1][0] + gap : 0;
    const b = k < pts.length - 1 ? pts[k + 1][0] - gap : 1;
    return [Math.min(b, Math.max(a, x)), Math.min(1, Math.max(0, y))];
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    svg.current!.setPointerCapture?.(e.pointerId);
    const [x, y] = at(e);
    const r = svg.current!.getBoundingClientRect();
    const near = pts.findIndex((q) => Math.hypot((q[0] - x) * r.width, (q[1] - y) * r.height) < 9);
    if (near >= 0) {
      setSel(near);
      setDrag({ k: near, out: false });
      return;
    }
    // a new point on the curve where it was clicked
    const nx = Math.min(1, Math.max(0, x));
    const k = pts.findIndex((q) => q[0] > nx);
    const at2 = k < 0 ? pts.length : k;
    const next: Pts = [...pts.slice(0, at2), [nx, Math.min(1, Math.max(0, f(nx)))], ...pts.slice(at2)];
    write(next);
    setSel(at2);
    setDrag({ k: at2, out: false });
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const [x, y] = at(e);
    // (a middle point well out of the graph: taken off when let go)
    const out = pts.length > 2 && drag.k > 0 && drag.k < pts.length - 1 && (x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08);
    if (out !== drag.out) setDrag({ ...drag, out });
    write(pts.map((q, j) => (j === drag.k ? moved(j, x, y) : q)));
  };
  const up = () => {
    if (drag?.out) {
      write(pts.filter((_, j) => j !== drag.k));
      setSel(null);
    }
    setDrag(null);
  };
  const remove = (k: number) => {
    if (pts.length <= 2 || k === 0 || k === pts.length - 1) return;
    write(pts.filter((_, j) => j !== k));
    setSel(null);
  };
  const cur = sel !== null && sel < pts.length ? pts[sel] : null;
  const changed = (c: Chan) => JSON.stringify(sorted((p[c] as Pts | undefined) ?? IDENTITY)) !== JSON.stringify(IDENTITY);
  return (
    <div className="ie-curves">
      <div className="row wrap">
        {rgb &&
          (['points', 'r', 'g', 'b'] as Chan[]).map((c) => (
            <button
              key={c}
              className={`nodrag curves-chan${chan === c ? ' on' : ''}`}
              style={{ color: chan === c ? undefined : CHAN_COLOR[c] }}
              title={c === 'points' ? 'The curve of all the channels together' : `The curve of ${c.toUpperCase()} alone (after that of all)`}
              onClick={() => (setChan(c), setSel(null))}
            >
              {c === 'points' ? 'RGB' : c.toUpperCase()}
              {changed(c) ? ' •' : ''}
            </button>
          ))}
        <span className="grow" />
        <Select<string>
          value=""
          title="A curve ready (this channel)"
          options={[['', 'preset…'], ...PRESETS.map(([k, label]): [string, string] => [k, label])]}
          onChange={(k) => {
            const pr = PRESETS.find((q) => q[0] === k);
            if (!pr) return;
            write(pr[2]);
            setSel(null);
          }}
        />
      </div>
      <div className="curves-box">
        <svg ref={svg} className={`nodrag curves-graph${drag?.out ? ' dropping' : ''}`} viewBox={`0 0 ${S} ${S}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <rect width={S} height={S} className="curves-bg" />
          {histPath && <path d={histPath} className="curves-hist" style={chan !== 'points' ? { fill: CHAN_COLOR[chan], opacity: 0.22 } : undefined} />}
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t} className="curves-grid">
              <line x1={t * S} y1={0} x2={t * S} y2={S} />
              <line x1={0} y1={t * S} x2={S} y2={t * S} />
            </g>
          ))}
          <line x1={0} y1={S} x2={S} y2={0} className="curves-diag" />
          <path d={path} className="curves-line" style={{ stroke: CHAN_COLOR[chan] }} />
          {pts.map((q, k) => (
            <rect
              key={k}
              x={q[0] * S - 4.5}
              y={(1 - q[1]) * S - 4.5}
              width={9}
              height={9}
              className={`curves-pt${k === sel ? ' sel' : ''}${drag?.k === k && drag.out ? ' gone' : ''}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                remove(k);
              }}
            />
          ))}
        </svg>
      </div>
      <div className="row wrap curves-io">
        {cur ? (
          <>
            <span className="muted">In</span>
            <NumInput
              className="tiny"
              value={fmt(toValue(cur[0]))}
              title="The input value of the point chosen (the image's values)"
              onChange={(v) => Number.isFinite(v) && write(pts.map((q, j) => (j === sel ? moved(j, fromValue(v), q[1]) : q)))}
            />
            <span className="muted">Out</span>
            <NumInput
              className="tiny"
              value={fmt(toValue(cur[1]))}
              title="Its output value"
              onChange={(v) => Number.isFinite(v) && write(pts.map((q, j) => (j === sel ? moved(j, q[0], fromValue(v)) : q)))}
            />
            {sel !== null && sel > 0 && sel < pts.length - 1 && (
              <button className="nodrag" title="Take this point off" onClick={() => remove(sel)}>
                Delete
              </button>
            )}
          </>
        ) : (
          <span className="hint">Click the curve to add a point; drag it; double-click it (or drag it out) to take it off.</span>
        )}
        {changed(chan) && (
          <button className="nodrag" title="This channel's curve back to a straight line" onClick={() => (write(IDENTITY), setSel(null))}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
