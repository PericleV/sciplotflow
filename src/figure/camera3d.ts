// The camera of a 3D scene: the data box seen from an azimuth and an elevation (orthographic, or with perspective), fitted
// in its frame, then zoomed and moved by the scene's camera; the same for the drawing, the zoom and the reader.
import type { Box } from './axes.ts';
import { resolveText, type Curve, type P3, type TextDefaults, type ThreeCam, type ThreeScene } from './spec.ts';

export type V = [number, number, number];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function threeCamera(S: ThreeScene, frame: Box, pad: { x: number; y: number }) {
  const az = (S.azim * Math.PI) / 180;
  const el = (S.elev * Math.PI) / 180;
  const e1: V = [-Math.sin(az), Math.cos(az), 0];
  const e2: V = [-Math.cos(az) * Math.sin(el), -Math.sin(az) * Math.sin(el), Math.cos(el)];
  const e3: V = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
  const am = Math.max(...S.aspect.map((v) => (v > 0 ? v : 1)));
  const A: V = [S.aspect[0] / am || 1, S.aspect[1] / am || 1, S.aspect[2] / am || 1];
  const { x, y, z } = S.range;
  const span = (r: [number, number]) => r[1] - r[0] || 1;
  // the box's own coordinates of a data point
  const toBox = (p: P3): V => [((p[0] - x[0]) / span(x)) * 2 - 1, ((p[1] - y[0]) / span(y)) * 2 - 1, ((p[2] - z[0]) / span(z)) * 2 - 1];
  const raw = (u: V): V => {
    const q: V = [u[0] * A[0], u[1] * A[1], u[2] * A[2]];
    const d = dot(q, e3);
    const f = S.persp > 0 ? S.persp / Math.max(0.2, S.persp - d) : 1;
    return [dot(q, e1) * f, dot(q, e2) * f, d];
  };
  // the box's corners fitted in the frame (room around for the values and the titles)
  const corners: V[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) corners.push(raw([a, b, c]));
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  const [y0, y1] = [Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[1]))];
  // zoomed and moved by the camera
  const cam = S.cam && S.cam.k > 0 ? S.cam : { k: 1, dx: 0, dy: 0 };
  const s = Math.max(1e-6, Math.min((frame.w - 2 * pad.x) / (x1 - x0 || 1), (frame.h - 2 * pad.y) / (y1 - y0 || 1))) * cam.k;
  const cx = frame.x + frame.w / 2 + (cam.dx || 0) * frame.w;
  const cy = frame.y + frame.h / 2 + (cam.dy || 0) * frame.h;
  const B = (u: V): V => {
    const r = raw(u);
    return [cx + (r[0] - (x0 + x1) / 2) * s, cy - (r[1] - (y0 + y1) / 2) * s, r[2]];
  };
  return { B, P: (p: P3) => B(toBox(p)), toBox, e1, e2, e3, A, s, cx, cy };
}
// the scene as drawn (turned or zoomed with the mouse: its new view until the node has it) and its camera
export function sceneCamera(c: Curve, frame: Box, defaults: TextDefaults, turn: { node: string; azim: number; elev: number; cam?: ThreeCam } | null) {
  const S = turn && turn.node === c.three!.node ? { ...c.three!, azim: turn.azim, elev: turn.elev, ...(turn.cam ? { cam: turn.cam } : {}) } : c.three!;
  const t = resolveText(undefined, { ...defaults, size: defaults.size * 0.85 });
  return { S, t, cam: threeCamera(S, frame, { x: t.size * 4.5, y: t.size * 3.2 }) };
}
