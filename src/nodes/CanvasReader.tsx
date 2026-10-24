// The data reader of the graphs drawn in the nodes (Fit, Peak analyzer, Integrate, Peak width, Data manipulation, Curve
// math, the Signal nodes) — as the figures' one (FigureReader.tsx): snap — a crosshair on the data point nearest the
// mouse, on every curve or the one chosen, its curve, X, Y and row; free — the coordinates of the place. A click keeps
// the reading; then the arrows move it (snap: ← → along the curve, ↑ ↓ to another curve; free: a pixel, Shift ten); Esc
// lets go. A layer over the graph's canvas: the graph gives its curves and how its axes map values to pixels.
import { useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Crosshair } from 'lucide-react';
import { fmtNum } from '../engine/table.ts';
import type { ReaderMode } from './FigureReader.tsx';
import { IC } from './iconProps.ts';
import { Select } from './ui.tsx';

// onAxis: a curve drawn on another Y axis (at the right) — its value as a value of the left axis, where it is drawn
export type ReadCurve = { name: string; color?: string; x: ArrayLike<number>; y: ArrayLike<number>; onAxis?: (v: number) => number };
// how the graph draws: value → pixel and back (in the canvas' own pixels, W × H), and its frame
export type ReadMap = { fx: (v: number) => number; fy: (v: number) => number; ix: (p: number) => number; iy: (p: number) => number; frame: { l: number; t: number; w: number; h: number } };
import type { ReaderState } from './readerState.ts';
export type { ReaderState };

// the toolbar's button (others: off while it is on — the caller turns its own tools off)
export function ReaderButton({ r, set, onOn }: { r: ReaderState; set: (r: ReaderState) => void; onOn?: () => void }) {
  return (
    <button
      className={`nodrag${r.on ? ' on' : ''}`}
      title="Data reader: a crosshair on the data point nearest the mouse; its curve, X, Y, row (or free: the coordinates of any place); click to keep it, then ← → along the curve, ↑ ↓ to another curve; Esc lets go"
      onClick={() => {
        set({ ...r, on: !r.on, reading: '' });
        if (!r.on) onOn?.();
      }}
    >
      <Crosshair {...IC} /> Reader
    </button>
  );
}
// its options and the last reading, under the toolbar
export function ReaderOptions({ r, set, names }: { r: ReaderState; set: (r: ReaderState) => void; names: string[] }) {
  if (!r.on) return null;
  return (
    <>
      <div className="row">
        <Select<ReaderMode>
          value={r.mode}
          title="Snap: on the data points of a curve; free: the coordinates of any place in the frame"
          options={[
            ['snap', 'snap to data'],
            ['free', 'free (any place)'],
          ]}
          onChange={(mode) => set({ ...r, mode, reading: '' })}
        />
        {r.mode === 'snap' && names.length > 1 && <Select<string> value={r.curve} title="The curve read: the nearest one, or this one" options={[['', 'nearest curve'], ...names.map((n, k): [string, string] => [String(k), n])]} onChange={(curve) => set({ ...r, curve })} />}
      </div>
      <div className="reader-line mono" title="The last reading (select it to copy)">
        {r.reading || 'move the mouse over a curve'}
      </div>
    </>
  );
}

type Reading = { c: number; i: number };

// the layer over the canvas (W × H pixels of the graph, shown at that size)
export function CanvasReaderLayer({ W, H, map, curves, r, onRead }: { W: number; H: number; map: ReadMap; curves: ReadCurve[]; r: ReaderState; onRead: (text: string) => void }) {
  const [cur, setCur] = useState<Reading | null>(null);
  const [free, setFree] = useState<[number, number] | null>(null);
  const [kept, setKept] = useState(false);
  const { fx, fy, ix, iy, frame: f } = map;
  const chosen = r.curve === '' ? -1 : Number(r.curve);
  const ok = (c: ReadCurve, i: number) => Number.isFinite(c.x[i]) && Number.isFinite(c.y[i]);
  // where a point is drawn (a curve on the right axis: there)
  const pyOf = (c: ReadCurve, i: number) => fy(c.onAxis ? c.onAxis(c.y[i]) : c.y[i]);
  const len = (c: ReadCurve) => Math.min(c.x.length, c.y.length);
  const nearest = (px: number, py: number): Reading | null => {
    let best: Reading | null = null;
    let bd = Infinity;
    curves.forEach((c, ci) => {
      if (chosen >= 0 && ci !== chosen) return;
      for (let i = 0; i < len(c); i++) {
        if (!ok(c, i)) continue;
        const d = (fx(c.x[i]) - px) ** 2 + (pyOf(c, i) - py) ** 2;
        if (d < bd) [bd, best] = [d, { c: ci, i }];
      }
    });
    return best;
  };
  const snapText = (q: Reading) => `${curves[q.c].name}: X = ${fmtNum(curves[q.c].x[q.i], 6)}, Y = ${fmtNum(curves[q.c].y[q.i], 6)} (row ${q.i + 1})`;
  const freeText = (p: [number, number]) => `X = ${fmtNum(ix(p[0]), 6)}, Y = ${fmtNum(iy(p[1]), 6)}`;
  const showSnap = (q: Reading | null) => {
    setCur(q);
    if (q) onRead(snapText(q));
  };
  const showFree = (p: [number, number] | null) => {
    setFree(p);
    if (p) onRead(freeText(p));
  };
  const at = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const read = (p: [number, number]) => (r.mode === 'free' ? showFree(p) : showSnap(nearest(...p)));
  const key = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') return setKept(false);
    if (r.mode === 'free') {
      if (!free) return;
      const d = e.shiftKey ? 10 : 1;
      const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (!m[e.key]) return;
      showFree([free[0] + m[e.key][0], free[1] + m[e.key][1]]);
    } else {
      if (!cur) return;
      const c = curves[cur.c];
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const d = e.key === 'ArrowRight' ? 1 : -1;
        let i = cur.i + d;
        while (i >= 0 && i < len(c) && !ok(c, i)) i += d;
        if (i >= 0 && i < len(c)) showSnap({ c: cur.c, i });
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && curves.length > 1 && chosen < 0) {
        // the next curve, at the point nearest the same X
        const nc = (cur.c + (e.key === 'ArrowUp' ? 1 : curves.length - 1)) % curves.length;
        const px = fx(c.x[cur.i]);
        const t = curves[nc];
        let bi = -1;
        for (let i = 0; i < len(t); i++) if (ok(t, i) && (bi < 0 || Math.abs(fx(t.x[i]) - px) < Math.abs(fx(t.x[bi]) - px))) bi = i;
        if (bi >= 0) showSnap({ c: nc, i: bi });
      } else return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  // the crosshair, the mark and the reading beside it
  let mark: { px: number; py: number; label: string; color?: string } | null = null;
  if (r.mode === 'free' && free) mark = { px: free[0], py: free[1], label: freeText(free) };
  if (r.mode === 'snap' && cur && curves[cur.c] && ok(curves[cur.c], cur.i)) {
    const c = curves[cur.c];
    mark = { px: fx(c.x[cur.i]), py: pyOf(c, cur.i), label: `X ${fmtNum(c.x[cur.i], 5)}  Y ${fmtNum(c.y[cur.i], 5)}`, color: c.color };
  }
  return (
    <div
      className="canvas-reader nodrag nowheel"
      tabIndex={0}
      style={{ width: W, height: H, cursor: 'crosshair' }}
      onPointerMove={(e: RPointerEvent) => !kept && read(at(e))}
      onPointerLeave={() => !kept && (setCur(null), setFree(null))}
      onPointerDown={(e: RPointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        (e.currentTarget as HTMLElement).focus();
        read(at(e));
        setKept(true);
      }}
      onKeyDown={key}
    >
      {mark && Number.isFinite(mark.px) && Number.isFinite(mark.py) && (
        <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
          <line x1={f.l} x2={f.l + f.w} y1={mark.py} y2={mark.py} stroke="#1f6fd6" strokeDasharray="4 3" strokeWidth={1} />
          <line x1={mark.px} x2={mark.px} y1={f.t} y2={f.t + f.h} stroke="#1f6fd6" strokeDasharray="4 3" strokeWidth={1} />
          <circle cx={mark.px} cy={mark.py} r={6} fill="none" stroke="#1f6fd6" strokeWidth={1.5} />
          {mark.color && <circle cx={mark.px} cy={mark.py} r={2.5} fill={mark.color} />}
          <text x={mark.px > f.l + f.w * 0.6 ? mark.px - 8 : mark.px + 8} y={Math.max(f.t + 12, mark.py - 10)} textAnchor={mark.px > f.l + f.w * 0.6 ? 'end' : 'start'} fontSize={11} fontFamily="system-ui, sans-serif" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" fill="#111111">
            {mark.label}
          </text>
        </svg>
      )}
    </div>
  );
}

// what a graph is given to read: the state, its curves, where the reading goes
export type ReaderProp = { r: ReaderState; curves: ReadCurve[]; onRead: (text: string) => void };
// the layer when the reader is on (a graph's helper)
export function ReaderLayer({ reader, W, H, map }: { reader?: ReaderProp; W: number; H: number; map: ReadMap }) {
  if (!reader?.r.on) return null;
  return <CanvasReaderLayer W={W} H={H} map={map} curves={reader.curves} r={reader.r} onRead={reader.onRead} />;
}
