// Data reader on a figure: the values under the mouse. Snap: a crosshair on the data point nearest the
// mouse — on every curve, or on the curve chosen — its curve, X, Y and row; the other curves fade. Free: the coordinates
// of the place itself, in the units of the axes of the frame under it (every axis of the frame). A click keeps the
// reading; then the arrows move it (snap: ← → along the curve, ↑ ↓ to another curve; free: by a pixel, Shift ten);
// Esc lets go.
import { useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { fmtNum } from '../engine/table.ts';
import { toPt, type Curve, type Figure } from '../figure/spec.ts';
import type { Scale } from '../figure/axes.ts';
import { hitAt, readKey } from './figureRanges.ts';

export type ReaderMode = 'snap' | 'free';
type Track = { curve: Curve; sx: Scale; sy: Scale; frame: { x: number; y: number; w: number; h: number }; id: string };
type Reading = { t: number; i: number };

export function FigureReaderLayer({ fig, width, height, mode, curve, onRead, onFocus }: { fig: Figure; width: number; height: number; mode: ReaderMode; curve: string; onRead?: (text: string) => void; onFocus?: (key: string | null) => void }) {
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width; // pt per px
  const [cur, setCur] = useState<Reading | null>(null);
  const [free, setFree] = useState<[number, number] | null>(null);
  const [kept, setKept] = useState(false);
  // every curve shown, with the scales of its frame and axes
  const tracks: Track[] = fig.axes.flatMap((ax, a) => {
    const pos = ax.style.pos;
    const hit = hitAt(fig, W, H, ((pos.x + pos.w / 2) / 100) * W, ((pos.y + pos.h / 2) / 100) * H);
    if (!hit || hit.ax !== ax) return [];
    return ax.curves
      .filter((c) => c.style.show !== false)
      .map((c) => ({ curve: c, sx: hit.scales.get(hit.xKeys.includes(c.style.axisX) ? c.style.axisX : hit.xKeys[0])!, sy: hit.scales.get(hit.yKeys.includes(c.style.axisY) ? c.style.axisY : hit.yKeys[0])!, frame: hit.frame, id: readKey(a, c.key) }));
  });
  const chosen = curve ? tracks.findIndex((t) => t.id === curve) : -1;
  const xy = (r: Reading) => {
    const { curve: c, sx, sy } = tracks[r.t];
    return [sx.f(c.series.x.values[r.i]), sy.f(c.series.y.values[r.i])];
  };
  const ok = (t: Track, i: number) => Number.isFinite(t.curve.series.x.values[i]) && Number.isFinite(t.curve.series.y.values[i]);
  // the data point nearest (px, py) in pt, on every curve or on the one chosen
  const nearest = (px: number, py: number): Reading | null => {
    let best: Reading | null = null;
    let bd = Infinity;
    tracks.forEach((t, ti) => {
      if (chosen >= 0 && ti !== chosen) return;
      const n = Math.min(t.curve.series.x.values.length, t.curve.series.y.values.length);
      for (let i = 0; i < n; i++) {
        if (!ok(t, i)) continue;
        const d = (t.sx.f(t.curve.series.x.values[i]) - px) ** 2 + (t.sy.f(t.curve.series.y.values[i]) - py) ** 2;
        if (d < bd) [bd, best] = [d, { t: ti, i }];
      }
    });
    return best;
  };
  const snapText = (r: Reading) => {
    const c = tracks[r.t].curve;
    return `${c.label || c.series.y.name}: X = ${fmtNum(c.series.x.values[r.i], 6)}, Y = ${fmtNum(c.series.y.values[r.i], 6)} (row ${r.i + 1})`;
  };
  // free: every axis of the frame under the place
  const freeRead = (p: [number, number]) => {
    const hit = hitAt(fig, W, H, p[0], p[1]);
    if (!hit) return null;
    const vals = [...hit.xKeys.map((key, j) => `${j ? key : 'X'} = ${fmtNum(hit.scales.get(key)!.inv(p[0]), 6)}`), ...hit.yKeys.map((key, j) => `${j ? key : 'Y'} = ${fmtNum(hit.scales.get(key)!.inv(p[1]), 6)}`)];
    return { hit, text: vals.join(', ') };
  };
  const showSnap = (r: Reading | null) => {
    setCur(r);
    onFocus?.(r ? tracks[r.t].curve.key : null);
    if (r) onRead?.(snapText(r));
  };
  const showFree = (p: [number, number] | null) => {
    setFree(p);
    const f = p && freeRead(p);
    if (f) onRead?.(f.text);
  };
  const pt = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * width * k) / b.width, ((e.clientY - b.top) * height * k) / b.height];
  };
  const move = (e: RPointerEvent) => {
    if (kept) return;
    const p = pt(e);
    if (mode === 'free') showFree(p);
    else showSnap(nearest(...p));
  };
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    const p = pt(e);
    if (mode === 'free') showFree(p);
    else showSnap(nearest(...p));
    setKept(true);
  };
  const key = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') {
      setKept(false);
      return;
    }
    if (mode === 'free') {
      if (!free) return;
      const d = (e.shiftKey ? 10 : 1) * k;
      const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (!m[e.key]) return;
      showFree([free[0] + m[e.key][0], free[1] + m[e.key][1]]);
    } else {
      if (!cur) return;
      const t = tracks[cur.t];
      const n = Math.min(t.curve.series.x.values.length, t.curve.series.y.values.length);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const d = e.key === 'ArrowRight' ? 1 : -1;
        let i = cur.i + d;
        while (i >= 0 && i < n && !ok(t, i)) i += d;
        if (i >= 0 && i < n) showSnap({ t: cur.t, i });
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && tracks.length > 1 && chosen < 0) {
        const nt = (cur.t + (e.key === 'ArrowUp' ? 1 : tracks.length - 1)) % tracks.length;
        const [px] = xy(cur);
        const tt = tracks[nt];
        let bi = -1;
        const m = Math.min(tt.curve.series.x.values.length, tt.curve.series.y.values.length);
        for (let i = 0; i < m; i++) if (ok(tt, i) && (bi < 0 || Math.abs(tt.sx.f(tt.curve.series.x.values[i]) - px) < Math.abs(tt.sx.f(tt.curve.series.x.values[bi]) - px))) bi = i;
        if (bi >= 0) showSnap({ t: nt, i: bi });
      } else return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  // the crosshair, the mark, the reading
  let overlay = null;
  const draw = (px: number, py: number, f: { x: number; y: number; w: number; h: number }, label: string, color?: string) => {
    const right = px > width * 0.6;
    return (
      <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        <line x1={f.x / k} x2={(f.x + f.w) / k} y1={py} y2={py} stroke="#1f6fd6" strokeDasharray="4 3" strokeWidth={1} />
        <line x1={px} x2={px} y1={f.y / k} y2={(f.y + f.h) / k} stroke="#1f6fd6" strokeDasharray="4 3" strokeWidth={1} />
        <circle cx={px} cy={py} r={6} fill="none" stroke="#1f6fd6" strokeWidth={1.5} />
        {color && <circle cx={px} cy={py} r={2.5} fill={color} />}
        <g transform={`translate(${right ? px - 8 : px + 8}, ${Math.max(14, py - 10)})`}>
          <text textAnchor={right ? 'end' : 'start'} fontSize={11} fontFamily="system-ui, sans-serif" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" fill="#111111">
            {label}
          </text>
        </g>
      </svg>
    );
  };
  if (mode === 'snap' && cur && tracks[cur.t]) {
    const [px, py] = xy(cur).map((v) => v / k);
    overlay = draw(px, py, tracks[cur.t].frame, snapText(cur), tracks[cur.t].curve.style.color);
  } else if (mode === 'free' && free) {
    const f = freeRead(free);
    if (f) overlay = draw(free[0] / k, free[1] / k, f.hit.frame, f.text);
  }
  return (
    <div
      className="figure-zoom nodrag nowheel"
      tabIndex={0}
      style={{ cursor: 'crosshair' }}
      onPointerMove={move}
      onPointerDown={down}
      onPointerLeave={() => {
        if (kept) return;
        setCur(null);
        setFree(null);
        onFocus?.(null);
      }}
      onKeyDown={key}
      title={mode === 'snap' ? 'Data reader (snap): the data point nearest the mouse; click to keep it, then ← → along the curve, ↑ ↓ to another curve, Esc to let go' : 'Data reader (free): the coordinates of the place; click to keep it, the arrows move it (Shift: 10 px), Esc to let go'}
    >
      {overlay}
    </div>
  );
}
