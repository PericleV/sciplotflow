// Drawing marks on a 3D plot with the mouse: the point under it — on the plane asked (the floor, a back wall, X, Y or
// Z at a value: exactly under the mouse), or free: a data point near the mouse (a node of a surface, a symbol …), else
// the place on the surface, else on the floor — shown with its X, Y, Z, rounded to the grid when asked; the mark being
// drawn follows the mouse from its first point, the plane drawn on outlined. A click gives the point to the node (the
// next point of the mark). Esc stops.
import { useEffect, useState, type PointerEvent as RPointerEvent } from 'react';
import { fmtNum } from '../engine/table.ts';
import { toPt, type Figure, type P3 } from '../figure/spec.ts';
import { niceStep } from '../figure/ticks.ts';
import { planeValue, pointAt3d, rangesOf, rectCorners, threeAt, type PickPlane, type ThreeHit } from './figure3d.ts';

export type Pick3D = {
  title: string;
  onPick: (p: P3) => void;
  onStop: () => void;
  plane?: PickPlane;
  // rounded to the grid: this part of the axes' step (0: not)
  snap?: number;
  // the mark drawn: its kind, its first point (when given), a rectangle's plane
  shape?: 'line' | 'rect' | 'vline' | 'point';
  from?: P3;
  rectPlane?: 'xy' | 'xz' | 'yz';
};

export function Figure3DPickLayer({ fig, width, height, pick }: { fig: Figure; width: number; height: number; pick: Pick3D }) {
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const k = W / width;
  const [at, setAt] = useState<{ p: P3; h: ThreeHit } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && pick.onStop();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pick]);
  const find = (e: { currentTarget: EventTarget; clientX: number; clientY: number }) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const [x, y] = [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
    const h = threeAt(fig, W, H, x, y);
    if (!h) return null;
    const plane = pick.plane ? { axis: pick.plane.axis, value: planeValue(h, pick.plane) } : undefined;
    const p = pointAt3d(h, x, y, plane);
    if (!p) return null;
    // rounded to the grid: the two axes of the plane (free: X and Y, the height as found)
    if (pick.snap && pick.snap > 0) {
      const R = rangesOf(h);
      for (let a = 0; a < 3; a++) {
        if (plane ? a === plane.axis : a === 2) continue;
        const st = niceStep(R[a][1] - R[a][0], Math.max(2, h.S.ticks)) * pick.snap;
        if (st > 0) p[a] = Math.min(R[a][1], Math.max(R[a][0], Math.round(p[a] / st) * st));
      }
    }
    return { p: p.map((v) => +v.toPrecision(5)) as P3, h };
  };
  // what is drawn: the plane (dashed), the mark from its first point to the mouse, the point and its values
  const svg = (() => {
    if (!at) return null;
    const { p, h } = at;
    const P = (q: P3) => {
      const s = h.cam.P(q);
      return `${(s[0] / k).toFixed(1)},${(s[1] / k).toFixed(1)}`;
    };
    const path = (qs: P3[], close = false) => `M${qs.map(P).join('L')}${close ? 'Z' : ''}`;
    const R = rangesOf(h);
    let outline: string | null = null;
    if (pick.plane) {
      const f = pick.plane.axis;
      const v = planeValue(h, pick.plane);
      const [i, j] = [0, 1, 2].filter((q) => q !== f);
      const c = (u: number, w: number): P3 => {
        const q: P3 = [0, 0, 0];
        q[f] = v;
        q[i] = u;
        q[j] = w;
        return q;
      };
      outline = path([c(R[i][0], R[j][0]), c(R[i][1], R[j][0]), c(R[i][1], R[j][1]), c(R[i][0], R[j][1])], true);
    }
    const from = pick.from && pick.from.every(Number.isFinite) ? pick.from : null;
    const shape =
      pick.shape === 'vline'
        ? path([[p[0], p[1], R[2][0]], [p[0], p[1], R[2][1]]])
        : from && pick.shape === 'rect'
          ? path(rectCorners(from, p, pick.rectPlane ?? 'xy'), true)
          : from && pick.shape === 'line'
            ? path([from, p])
            : null;
    const s = h.cam.P(p);
    const [sx, sy] = [s[0] / k, s[1] / k];
    return (
      <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        {outline && <path d={outline} fill="#d6568f" fillOpacity={0.06} stroke="#d6568f" strokeWidth={1} strokeDasharray="4 3" />}
        {shape && <path d={shape} fill={pick.shape === 'rect' ? '#d6568f' : 'none'} fillOpacity={0.12} stroke="#d6568f" strokeWidth={1.5} />}
        {from && <circle cx={h.cam.P(from)[0] / k} cy={h.cam.P(from)[1] / k} r={2.5} fill="#d6568f" />}
        <circle cx={sx} cy={sy} r={5} fill="none" stroke="#d6568f" strokeWidth={1.5} />
        <circle cx={sx} cy={sy} r={1.8} fill="#d6568f" />
        <text x={sx + 8} y={sy - 8} fontSize={11} fontFamily="system-ui, sans-serif" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" fill="#111111">
          {`X ${fmtNum(p[0], 4)}  Y ${fmtNum(p[1], 4)}  Z ${fmtNum(p[2], 4)}`}
        </text>
      </svg>
    );
  })();
  return (
    <div
      className="figure-zoom nodrag nowheel"
      style={{ cursor: 'crosshair' }}
      title={pick.title}
      onPointerMove={(e: RPointerEvent) => setAt(find(e))}
      onPointerLeave={() => setAt(null)}
      onPointerDown={(e: RPointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const f = find(e);
        if (f) pick.onPick(f.p);
      }}
    >
      {svg}
    </div>
  );
}
