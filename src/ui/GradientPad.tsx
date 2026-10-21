// A gradient placed by hand, as Affinity's gradient tool: the shape's box with the gradient in it, its handles dragged —
// a linear one from its start to its end, a radial one by its centre and its radii across and down (Shift: a circle).
// Places in % of the box (0: its left or top, 100: its right or bottom); radii in % of its half width and half height.
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type Linear = { kind: 'linear'; x1: number; y1: number; x2: number; y2: number };
type Radial = { kind: 'radial'; cx: number; cy: number; rx: number; ry: number };
export type GradPlace = Linear | Radial;

// the box (0 … 100) in a larger square, so the handles can go out of it
const PAD = 25;
const VB = `${-PAD} ${-PAD} ${100 + 2 * PAD} ${100 + 2 * PAD}`;
const r1 = (v: number) => Math.round(v * 10) / 10;

export function GradientPad({ place, onChange, from, to, toOpacity, spread }: { place: GradPlace; onChange: (p: GradPlace) => void; from: string; to: string; toOpacity: number; spread: 'pad' | 'reflect' | 'repeat' }) {
  const svg = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, '');
  const [drag, setDrag] = useState<string | null>(null);
  // the pointer in the box's units
  const at = (e: ReactPointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const size = 100 + 2 * PAD;
    return [((e.clientX - r.left) / r.width) * size - PAD, ((e.clientY - r.top) / r.height) * size - PAD] as const;
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const [x, y] = at(e);
    const cx = Math.max(-PAD, Math.min(100 + PAD, x));
    const cy = Math.max(-PAD, Math.min(100 + PAD, y));
    if (place.kind === 'linear') {
      if (drag === 'start') onChange({ ...place, x1: r1(cx), y1: r1(cy) });
      else if (drag === 'end') onChange({ ...place, x2: r1(cx), y2: r1(cy) });
      return;
    }
    if (drag === 'centre') return onChange({ ...place, cx: r1(cx), cy: r1(cy) });
    // a radius: the handle's distance from the centre, in % of the half box (100: reaches the side)
    const rx = Math.max(0.5, r1((Math.abs(x - place.cx) / 50) * 100));
    const ry = Math.max(0.5, r1((Math.abs(y - place.cy) / 50) * 100));
    if (drag === 'rx') onChange({ ...place, rx, ry: e.shiftKey ? rx : place.ry });
    else if (drag === 'ry') onChange({ ...place, ry, rx: e.shiftKey ? ry : place.rx });
  };
  const handle = (which: string, x: number, y: number, title: string, main = false) => (
    <circle
      key={which}
      cx={x}
      cy={y}
      r={main ? 5 : 4}
      className={`grad-handle${main ? ' main' : ''}${drag === which ? ' on' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDrag(which);
      }}
    >
      <title>{title}</title>
    </circle>
  );
  const stops = (
    <>
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} stopOpacity={toOpacity} />
    </>
  );
  let def;
  let handles;
  if (place.kind === 'linear') {
    def = (
      <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={place.x1} y1={place.y1} x2={place.x2} y2={place.y2} spreadMethod={spread}>
        {stops}
      </linearGradient>
    );
    handles = (
      <>
        <line x1={place.x1} y1={place.y1} x2={place.x2} y2={place.y2} className="grad-line" />
        {handle('start', place.x1, place.y1, 'Its start (the first colour)', true)}
        {handle('end', place.x2, place.y2, 'Its end (the second colour)')}
      </>
    );
  } else {
    const [hx, hy] = [(place.rx / 100) * 50, (place.ry / 100) * 50];
    def = (
      <radialGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={1} gradientTransform={`translate(${place.cx} ${place.cy}) scale(${hx || 0.01} ${hy || 0.01})`} spreadMethod={spread}>
        {stops}
      </radialGradient>
    );
    handles = (
      <>
        <ellipse cx={place.cx} cy={place.cy} rx={hx} ry={hy} className="grad-line" />
        <line x1={place.cx} y1={place.cy} x2={place.cx + hx} y2={place.cy} className="grad-line" />
        <line x1={place.cx} y1={place.cy} x2={place.cx} y2={place.cy + hy} className="grad-line" />
        {handle('centre', place.cx, place.cy, 'Its centre (the first colour)', true)}
        {handle('rx', place.cx + hx, place.cy, 'Its radius across (Shift: a circle)')}
        {handle('ry', place.cx, place.cy + hy, 'Its radius down (Shift: a circle)')}
      </>
    );
  }
  return (
    <svg ref={svg} className="grad-pad nodrag" viewBox={VB} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} role="group" aria-label="Where the gradient is: drag its handles">
      <defs>
        {def}
        <pattern id={`${id}-c`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#ffffff" />
          <rect width="4" height="4" fill="#d9dce3" />
          <rect x="4" y="4" width="4" height="4" fill="#d9dce3" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={100} height={100} fill={`url(#${id}-c)`} />
      <rect x={0} y={0} width={100} height={100} fill={`url(#${id}-g)`} className="grad-box" />
      {handles}
    </svg>
  );
}
