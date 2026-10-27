// What the Figure Drawing makes of objects (mm): a blend (the shapes between two, their outlines and looks in steps), a
// bend (objects bent along a path, as if drawn on it), the isometric faces (a flat drawing put on the top, left or
// right face of an isometric box) and isometric boxes and stacks of layers (a device's films).
import { shapeSpec } from '../engine/evaluate.ts';
import { isClosed, parsePath, pathPolylines, pathText, simplifyPath, type Seg } from '../figure/paths.ts';
import { lineLength, pointAlong, type Pt } from '../figure/shapes.ts';
import { TEXT_SPEC_DEFAULTS } from '../figure/spec.ts';
import { newAnnotation } from '../defaults.ts';
import { pathOf, toPathItem, type Rect } from './drawingOps.ts';
import type { AnnotationItem } from '../types.ts';

const rr = (v: number) => +v.toFixed(3);
// the subpaths of a path: their points (curves sampled), closed or not
export function subpaths(d: string, n = 12): { pts: Pt[]; closed: boolean }[] {
  const subs: Seg[][] = [];
  for (const s of parsePath(d)) {
    if (s.c === 'M' || !subs.length) subs.push([]);
    subs[subs.length - 1].push(s);
  }
  return subs.flatMap((sub) => {
    const closed = isClosed(sub);
    let pts = pathPolylines(sub, n)[0] ?? [];
    if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts = pts.slice(0, -1);
    return pts.length >= 2 ? [{ pts, closed }] : [];
  });
}
// n points evenly along a line (round a closed one)
export function resample(pts: Pt[], n: number, closed: boolean): Pt[] {
  const line = closed ? [...pts, pts[0]] : pts;
  return Array.from({ length: n }, (_, k) => pointAlong(line, closed ? k / n : n === 1 ? 0 : k / (n - 1)).p);
}
const area = (pts: Pt[]) => pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;

// ---- colours mixed ----
const rgb = (c: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export function mix(a: string, b: string, t: number): string {
  const [p, q] = [rgb(a), rgb(b)];
  if (!p || !q) return t < 0.5 ? a : b;
  return hex(p.map((v, k) => v + (q[k] - v) * t));
}
// a colour lighter (f > 0, towards white) or darker (f < 0, towards black)
export const shade = (c: string, f: number) => mix(c, f > 0 ? '#ffffff' : '#000000', Math.abs(f));

// ---- blend: `steps` shapes between a and b (their outlines, 64 points each, in step; their line and fill mixed) ----
export function blendItems(a: AnnotationItem, b: AnnotationItem, steps: number): AnnotationItem[] {
  const [da, db] = [pathOf(a), pathOf(b)];
  if (!da || !db || a.type !== 'shape' || b.type !== 'shape') return [];
  const [sa, sb] = [subpaths(da)[0], subpaths(db)[0]];
  if (!sa || !sb) return [];
  const closed = sa.closed && sb.closed;
  const N = 96;
  const pa = resample(sa.pts, N, closed);
  let pb = resample(sb.pts, N, closed);
  if (closed) {
    // (the same way round; started where they are nearest)
    if (Math.sign(area(pa)) !== Math.sign(area(pb))) pb = [...pb].reverse();
    let [best, at] = [Infinity, 0];
    for (let s = 0; s < N; s++) {
      let e = 0;
      for (let k = 0; k < N; k++) e += (pa[k][0] - pb[(k + s) % N][0]) ** 2 + (pa[k][1] - pb[(k + s) % N][1]) ** 2;
      if (e < best) [best, at] = [e, s];
    }
    pb = pb.map((_, k) => pb[(k + at) % N]);
  } else if (Math.hypot(pa[0][0] - pb[N - 1][0], pa[0][1] - pb[N - 1][1]) < Math.hypot(pa[0][0] - pb[0][0], pa[0][1] - pb[0][1])) pb = [...pb].reverse();
  const [s1, s2] = [shapeSpec(a.spec), shapeSpec(b.spec)];
  const group = `g${newAnnotation('shape').id}`;
  return Array.from({ length: steps }, (_, j) => {
    const t = (j + 1) / (steps + 1);
    const points = pa.map((p, k) => `${rr(p[0] + (pb[k][0] - p[0]) * t)} ${rr(p[1] + (pb[k][1] - p[1]) * t)}`).join('; ');
    const lerp = (x: number, y: number) => x + (y - x) * t;
    return newAnnotation('shape', {
      coords: 'data',
      kind: 'polygon',
      points,
      closed,
      color: mix(s1.color, s2.color, t),
      width: rr(lerp(s1.width, s2.width)),
      fill: s1.fill || s2.fill ? mix(s1.fill || s2.fill, s2.fill || s1.fill, t) : '',
      fillOpacity: rr(lerp(s1.fill ? s1.fillOpacity : 0, s2.fill ? s2.fillOpacity : 0) || Math.max(s1.fill ? s1.fillOpacity : 0, s2.fill ? s2.fillOpacity : 0)),
      opacity: rr(lerp(s1.opacity, s2.opacity)),
      dash: s1.dash,
      head1: 'none',
      head2: 'none',
    }) as AnnotationItem;
  }).map((it) => ({ ...it, group }));
}

// ---- bend: the objects drawn on the line `guide` (its longest part): across their box → along it (stretched to its
// length, or as long as they are), down → aside of it ----
export function bendItems(list: AnnotationItem[], guide: string, box: Rect, stretch: boolean): AnnotationItem[] {
  const lines = subpaths(guide, 24).map((s) => (s.closed ? [...s.pts, s.pts[0]] : s.pts));
  if (!lines.length || !(box.w > 0)) return list;
  const line = lines.reduce((a, b) => (lineLength(b) > lineLength(a) ? b : a));
  const L = lineLength(line);
  const k = stretch ? L / box.w : 1;
  const mid = box.y + box.h / 2;
  const at = ([x, y]: Pt): Pt => {
    const s = (x - box.x) * k;
    const { p, u } = pointAlong(line, Math.max(0, Math.min(1, s / L)));
    // (past its ends: on along its last direction)
    const over = s < 0 ? s : s > L ? s - L : 0;
    const v = y - mid;
    return [p[0] + u[0] * over - u[1] * v, p[1] + u[1] * over + u[0] * v];
  };
  // (straight pieces cut into bits of 0.4 mm, so they bend)
  const dense = (pts: Pt[], closed: boolean): Pt[] => {
    const out: Pt[] = [];
    const all = closed ? [...pts, pts[0]] : pts;
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1], all[i]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
      for (let j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
    }
    if (!closed) out.push(all[all.length - 1]);
    return out;
  };
  return list.map((it) => {
    if (it.type === 'text') {
      const s = { ...TEXT_SPEC_DEFAULTS, ...it.spec };
      const q = at([s.x, s.y]);
      const { u } = pointAlong(line, Math.max(0, Math.min(1, ((s.x - box.x) * k) / L)));
      return { ...it, spec: { ...it.spec, x: rr(q[0]), y: rr(q[1]), rotation: rr((Math.atan2(u[1], u[0]) * 180) / Math.PI) } } as AnnotationItem;
    }
    const p = toPathItem(it);
    if (!p || p.type !== 'shape' || !p.spec.d) return it;
    const segs: Seg[] = [];
    for (const sub of subpaths(p.spec.d)) {
      const pts = dense(sub.pts, sub.closed).map(at);
      pts.forEach((q, j) => segs.push({ c: j ? 'L' : 'M', p: [q[0], q[1]] }));
      if (sub.closed) segs.push({ c: 'Z', p: [] });
    }
    // (kept as fine straight pieces: a smoothed curve would round its corners)
    return { ...p, spec: { ...p.spec, d: simplifyPath(pathText(segs), 0.02, false) } } as AnnotationItem;
  });
}

// ---- isometric: the faces of a box (the 2 × 2 part of the projection, y down): top, left (its edges down to the
// right), right (up to the right) ----
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
export { ISO_FACES } from '../engine/isoPlane.ts';
export type { IsoFace } from '../types.ts';
// an isometric box: w along its left face, d along its right face, h up (mm); its front-top corner at o; its faces in
// the colour given, the top lighter, the right darker (one group)
export function isoBox(o: Pt, w: number, d: number, h: number, fill: string, line = '#333333', group = `g${newAnnotation('shape').id}`): AnnotationItem[] {
  const ux: Pt = [C30 * w, S30 * w];
  const uy: Pt = [C30 * d, -S30 * d];
  const left0: Pt = [o[0] - ux[0], o[1] - ux[1]];
  const right1: Pt = [o[0] + uy[0], o[1] + uy[1]];
  const back: Pt = [left0[0] + uy[0], left0[1] + uy[1]];
  const down = (p: Pt): Pt => [p[0], p[1] + h];
  const face = (pts: Pt[], c: string, name: string) =>
    ({ ...newAnnotation('shape', { coords: 'data', kind: 'polygon', closed: true, points: pts.map((p) => `${rr(p[0])} ${rr(p[1])}`).join('; '), fill: c, fillOpacity: 1, color: line, width: 0.5, join: 'round', head1: 'none', head2: 'none' }), name, group }) as AnnotationItem;
  return [face([left0, o, down(o), down(left0)], fill, 'left face'), face([o, right1, down(right1), down(o)], shade(fill, -0.22), 'right face'), face([back, right1, o, left0], shade(fill, 0.3), 'top face')];
}
// a stack of layers (thicknesses in mm, the bottom one first), each its colour, their top faces seen; its bottom
// layer's front-top corner placed so the stack's front bottom corner is at `base`
export function isoStack(base: Pt, w: number, d: number, layers: number[], colors: string[]): AnnotationItem[] {
  const group = `g${newAnnotation('shape').id}`;
  const out: AnnotationItem[] = [];
  let y = base[1];
  layers.forEach((t, k) => {
    y -= t;
    out.push(...isoBox([base[0], y], w, d, t, colors[k % colors.length], '#333333', group).map((it) => ({ ...it, name: `layer ${k + 1} ${it.name}` })));
  });
  return out;
}
