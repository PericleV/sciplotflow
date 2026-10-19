// The 3D scene of a figure under the mouse (pt): its node, its curve, its frame, its text defaults and its camera as
// drawn — for the zoom, the reader and the drawing of marks on a 3D plot.
import { sceneCamera } from '../figure/camera3d.ts';
import type { Box } from '../figure/axes.ts';
import type { Curve, Figure, P3, ThreeScene } from '../figure/spec.ts';

export type ThreeHit = { node: string; curve: Curve; frame: Box; S: ThreeScene; cam: ReturnType<typeof sceneCamera>['cam'] };

export function threeAt(fig: Figure, W: number, H: number, x: number, y: number): ThreeHit | null {
  for (let a = fig.axes.length - 1; a >= 0; a--) {
    const ax = fig.axes[a];
    const curve = ax.curves.find((c) => c.three?.node);
    if (!curve) continue;
    const p = ax.style.pos;
    const frame = { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H };
    if (x < frame.x || x > frame.x + frame.w || y < frame.y || y > frame.y + frame.h) continue;
    const { S, cam } = sceneCamera(curve, frame, ax.text ?? fig.text, null);
    return { node: curve.three!.node!, curve, frame, S, cam };
  }
  return null;
}

// a point that can be read: where it is, the set it is of (a surface, a line …), its place in it, its value (a layer)
export type Cand = { p: P3; set: number; i: number; j?: number; value?: number; name: string };

export function candidates3d(h: ThreeHit): Cand[] {
  const S = h.S;
  const out: Cand[] = [];
  let set = 0;
  S.surfaces.forEach((sf) => {
    const nx = sf.xs.length;
    for (let j = 0; j < sf.ys.length; j++) for (let i = 0; i < nx; i++) if (Number.isFinite(sf.z[j * nx + i])) out.push({ p: [sf.xs[i], sf.ys[j], sf.z[j * nx + i]], set, i, j, name: 'surface' });
    set++;
  });
  S.bars.items.forEach((b, k) => out.push({ p: [b.x, b.y, b.z1], set, i: k, name: 'bar' }));
  if (S.bars.items.length) set++;
  S.lines.forEach((l) => {
    l.pts.forEach((p, k) => p.every(Number.isFinite) && out.push({ p, set, i: k, name: 'line' }));
    set++;
  });
  S.points.forEach((pt) => {
    pt.pts.forEach((p, k) => p.every(Number.isFinite) && out.push({ p, set, i: k, name: 'point' }));
    set++;
  });
  (S.planes ?? []).forEach((pl) => {
    const nx = pl.xe.length - 1;
    pl.v.forEach((v, q) => {
      if (!Number.isFinite(v)) return;
      const [i, j] = [q % nx, Math.floor(q / nx)];
      out.push({ p: [(pl.xe[i] + pl.xe[i + 1]) / 2, (pl.ye[j] + pl.ye[j + 1]) / 2, pl.z], set, i, j, value: v, name: pl.name || 'layer' });
    });
    set++;
  });
  return out;
}


// the candidate nearest a place (pt) on the screen; within so many pt (Infinity: any)
export function nearest3d(h: ThreeHit, cs: Cand[], x: number, y: number, within = Infinity): Cand | null {
  let best: Cand | null = null;
  let bd = within * within;
  for (const c of cs) {
    const q = h.cam.P(c.p);
    const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2;
    if (dd < bd) [bd, best] = [dd, c];
  }
  return best;
}

// on a surface: the point under the place, in the cell in front (between its corners, by the triangle it is in)
export function onSurface3d(h: ThreeHit, x: number, y: number): P3 | null {
  let best: { p: P3; d: number } | null = null;
  for (const sf of h.S.surfaces) {
    const nx = sf.xs.length;
    for (let j = 0; j < sf.ys.length - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const ps: P3[] = [[sf.xs[i], sf.ys[j], sf.z[j * nx + i]], [sf.xs[i + 1], sf.ys[j], sf.z[j * nx + i + 1]], [sf.xs[i + 1], sf.ys[j + 1], sf.z[(j + 1) * nx + i + 1]], [sf.xs[i], sf.ys[j + 1], sf.z[(j + 1) * nx + i]]];
        if (!ps.every((p) => Number.isFinite(p[2]))) continue;
        const q = ps.map(h.cam.P);
        for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
          const den = (q[b][1] - q[c][1]) * (q[a][0] - q[c][0]) + (q[c][0] - q[b][0]) * (q[a][1] - q[c][1]);
          if (Math.abs(den) < 1e-12) continue;
          const l1 = ((q[b][1] - q[c][1]) * (x - q[c][0]) + (q[c][0] - q[b][0]) * (y - q[c][1])) / den;
          const l2 = ((q[c][1] - q[a][1]) * (x - q[c][0]) + (q[a][0] - q[c][0]) * (y - q[c][1])) / den;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
          const d = l1 * q[a][2] + l2 * q[b][2] + l3 * q[c][2];
          if (best && d <= best.d) continue;
          best = { d, p: [0, 1, 2].map((t) => l1 * ps[a][t] + l2 * ps[b][t] + l3 * ps[c][t]) as P3 };
        }
      }
  }
  return best?.p ?? null;
}

// on a plane of the box (axis 0, 1, 2 at a value): the point under the place (pt) — found by Newton's steps on the
// two other coordinates (the camera may have perspective); null outside the box
export function onPlane3d(h: ThreeHit, x: number, y: number, axis: 0 | 1 | 2, value: number): P3 | null {
  const R = [h.S.range.x, h.S.range.y, h.S.range.z];
  const [a, b] = [0, 1, 2].filter((k) => k !== axis);
  const toData = (u: number[]): P3 => {
    const p: number[] = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = R[k][0] + ((u[k] + 1) / 2) * (R[k][1] - R[k][0]);
    return p as P3;
  };
  const w = [0, 0, 0];
  w[axis] = ((value - R[axis][0]) / (R[axis][1] - R[axis][0] || 1)) * 2 - 1;
  const at = (s: number, t: number) => {
    const u = [...w];
    u[a] = s;
    u[b] = t;
    return h.cam.B(u as [number, number, number]);
  };
  let [s, t] = [0, 0];
  for (let it = 0; it < 30; it++) {
    const q = at(s, t);
    const [ex, ey] = [x - q[0], y - q[1]];
    if (ex * ex + ey * ey < 1e-6) break;
    const e = 1e-4;
    const qs = at(s + e, t);
    const qt = at(s, t + e);
    const [j11, j21, j12, j22] = [(qs[0] - q[0]) / e, (qs[1] - q[1]) / e, (qt[0] - q[0]) / e, (qt[1] - q[1]) / e];
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-12) return null;
    s += (ex * j22 - ey * j12) / det;
    t += (ey * j11 - ex * j21) / det;
  }
  if (Math.abs(s) > 1 + 1e-6 || Math.abs(t) > 1 + 1e-6) return null;
  const u = [...w];
  u[a] = s;
  u[b] = t;
  return toData(u);
}

// the point under a place (pt) of the scene
export function pointAt3d(h: ThreeHit, x: number, y: number, plane?: { axis: 0 | 1 | 2; value: number }): P3 | null {
  if (plane) return onPlane3d(h, x, y, plane.axis, plane.value);
  const near = nearest3d(h, candidates3d(h), x, y, 8);
  if (near) return near.p;
  return onSurface3d(h, x, y) ?? onPlane3d(h, x, y, 2, h.S.range.z[0]);
}


// the plane drawn on: axis 0, 1, 2 at a value, at the back of the box (a back wall, as drawn) or at its bottom (the floor)
export type PickPlane = { axis: 0 | 1 | 2; value: number | 'back' | 'low' };

export const rangesOf = (h: ThreeHit) => [h.S.range.x, h.S.range.y, h.S.range.z];

export function planeValue(h: ThreeHit, pl: PickPlane): number {
  const r = rangesOf(h)[pl.axis];
  if (pl.value === 'low') return r[0];
  if (pl.value === 'back') return h.cam.e3[pl.axis] > 0 ? r[0] : r[1];
  return pl.value;
}

// the corners of a rectangle from two of its corners, in its plane (the first corner's height, Y or X)
export function rectCorners(a: P3, b: P3, plane: 'xy' | 'xz' | 'yz'): P3[] {
  const f = plane === 'xy' ? 2 : plane === 'xz' ? 1 : 0;
  const [i, j] = [0, 1, 2].filter((k) => k !== f);
  const at = (u: number, v: number): P3 => {
    const p: P3 = [0, 0, 0];
    p[f] = a[f];
    p[i] = u;
    p[j] = v;
    return p;
  };
  return [at(a[i], a[j]), at(b[i], a[j]), at(b[i], b[j]), at(a[i], b[j])];
}

