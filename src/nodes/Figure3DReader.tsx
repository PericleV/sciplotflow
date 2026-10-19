// The data reader of a 3D plot. Snap: the data point nearest the mouse — a node of a surface, the top of a bar, a point
// of a line, a symbol, a cell of a layer —, marked, with lines to the back walls and the floor (where it is in the box)
// and its X, Y, Z; on the surface: Z read under the mouse itself (between the nodes of the cell in front). A click keeps
// the reading; then the arrows move it (a surface: ← → along X, ↑ ↓ along Y; a line or symbols: ← → along it, ↑ ↓ to the
// next); Esc lets go.
import { useMemo, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { P3 } from '../figure/spec.ts';
import { toPt, type Figure } from '../figure/spec.ts';
import { fmtNum } from '../engine/table.ts';
import type { ReaderMode } from './FigureReader.tsx';
import { candidates3d as candidates, nearest3d, onSurface3d, threeAt, type Cand, type ThreeHit } from './figure3d.ts';

type Reading = { p: P3; c?: Cand; label: string };

export function Figure3DReaderLayer({ fig, width, height, mode, onRead }: { fig: Figure; width: number; height: number; mode: ReaderMode; onRead: (text: string) => void }) {
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width; // pt per px
  const [hit, setHit] = useState<ThreeHit | null>(null);
  const [cur, setCur] = useState<Reading | null>(null);
  const [kept, setKept] = useState(false);
  const cands = useMemo(() => (hit ? candidates(hit) : []), [hit]);
  const txt = (p: P3, value?: number, name?: string) => `${name ? `${name}: ` : ''}X = ${fmtNum(p[0], 6)}, Y = ${fmtNum(p[1], 6)}, Z = ${fmtNum(p[2], 6)}${value !== undefined ? `, value = ${fmtNum(value, 6)}` : ''}`;
  const show = (r: Reading | null) => {
    setCur(r);
    if (r) onRead(r.label);
  };
  const pt = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const snapAt = (h: ThreeHit, cs: Cand[], x: number, y: number): Reading | null => {
    const best = nearest3d(h, cs, x, y);
    return best ? { p: best.p, c: best, label: txt(best.p, best.value, best.name) } : null;
  };
  const surfaceAt = (h: ThreeHit, x: number, y: number): Reading | null => {
    const p = onSurface3d(h, x, y);
    return p ? { p, label: txt(p, undefined, 'on the surface') } : null;
  };
  const read = (e: { currentTarget: EventTarget; clientX: number; clientY: number }) => {
    const [x, y] = pt(e);
    const h = threeAt(fig, W, H, x, y);
    if (!h) return show(null);
    if (h !== hit && (!hit || hit.node !== h.node)) setHit(h);
    const cs = hit && hit.node === h.node ? cands : candidates(h);
    show(mode === 'free' ? surfaceAt(h, x, y) : snapAt(h, cs, x, y));
  };
  const key = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') return setKept(false);
    const c = cur?.c;
    if (!c || !hit) return;
    let next: Cand | undefined;
    const same = cands.filter((q) => q.set === c.set);
    if (c.j !== undefined && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const [di, dj] = e.key === 'ArrowRight' ? [1, 0] : e.key === 'ArrowLeft' ? [-1, 0] : e.key === 'ArrowUp' ? [0, 1] : [0, -1];
      next = same.find((q) => q.i === c.i + di && q.j === c.j! + dj);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') next = same.find((q) => q.i === c.i + (e.key === 'ArrowRight' ? 1 : -1));
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const sets = [...new Set(cands.map((q) => q.set))];
      const ns = sets[(sets.indexOf(c.set) + (e.key === 'ArrowUp' ? 1 : sets.length - 1)) % sets.length];
      next = cands.filter((q) => q.set === ns).reduce<Cand | undefined>((b, q) => (!b || Math.abs(q.p[0] - c.p[0]) < Math.abs(b.p[0] - c.p[0]) ? q : b), undefined);
    } else return;
    if (next) show({ p: next.p, c: next, label: txt(next.p, next.value, next.name) });
    e.preventDefault();
    e.stopPropagation();
  };
  // the mark: the point, lines to the back walls and the floor (parallel to the axes), its values beside it
  let mark = null;
  if (cur && hit) {
    const { cam } = hit;
    const u = cam.toBox(cur.p);
    const back = [0, 1, 2].map((a) => (cam.e3[a] > 0 ? -1 : 1));
    const q = cam.B(u);
    const ends = [0, 1, 2].map((a) => {
      const w: [number, number, number] = [u[0], u[1], u[2]];
      w[a] = back[a];
      return cam.B(w);
    });
    const right = q[0] / k > width * 0.6;
    mark = (
      <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        {ends.map((e2, a) => (
          <line key={a} x1={q[0] / k} y1={q[1] / k} x2={e2[0] / k} y2={e2[1] / k} stroke="#1f6fd6" strokeDasharray="4 3" strokeWidth={1} />
        ))}
        {ends.map((e2, a) => (
          <circle key={`e${a}`} cx={e2[0] / k} cy={e2[1] / k} r={2} fill="#1f6fd6" />
        ))}
        <circle cx={q[0] / k} cy={q[1] / k} r={6} fill="none" stroke="#1f6fd6" strokeWidth={1.5} />
        <circle cx={q[0] / k} cy={q[1] / k} r={2.2} fill="#d62728" />
        <text x={right ? q[0] / k - 9 : q[0] / k + 9} y={Math.max(12, q[1] / k - 10)} textAnchor={right ? 'end' : 'start'} fontSize={11} fontFamily="system-ui, sans-serif" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" fill="#111111">
          {`X ${fmtNum(cur.p[0], 4)}  Y ${fmtNum(cur.p[1], 4)}  Z ${fmtNum(cur.p[2], 4)}`}
        </text>
      </svg>
    );
  }
  return (
    <div
      className="figure-zoom nodrag nowheel"
      tabIndex={0}
      style={{ cursor: 'crosshair' }}
      onPointerMove={(e: RPointerEvent) => !kept && read(e)}
      onPointerDown={(e: RPointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        (e.currentTarget as HTMLElement).focus();
        read(e);
        setKept(true);
      }}
      onKeyDown={key}
    >
      {mark}
    </div>
  );
}
