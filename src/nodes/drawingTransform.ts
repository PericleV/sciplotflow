// The objects of a Figure Drawing transformed (mm): flipped across or down, scaled, skewed, turned, about a point (the
// middle of the selection). Lines, arrows, polygons and paths change their points; a rectangle, an ellipse, a star or a
// regular polygon stays one when it can (flipped: turned the other way, it is symmetric; scaled: its box); a picture is
// mirrored; what cannot stay itself is made a path first. A text moves and scales its size, it is never mirrored.
import { shapeSpec } from '../engine/evaluate.ts';
import { TEXT_SPEC_DEFAULTS } from '../figure/spec.ts';
import type { Pt } from '../figure/shapes.ts';
import { mapItem } from '../engine/drawingItems.ts';
import { toPathItem } from './drawingOps.ts';
import type { AnnotationItem } from '../types.ts';

// x' = a x + c y + e, y' = b x + d y + f
export type Affine = [number, number, number, number, number, number];
export const applyAffine = (m: Affine, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
// the 2 × 2 part [a, b, c, d] about the point o
export const about = (o: Pt, [a, b, c, d]: [number, number, number, number]): Affine => [a, b, c, d, o[0] - a * o[0] - c * o[1], o[1] - b * o[0] - d * o[1]];
export const flipAcross = (o: Pt) => about(o, [-1, 0, 0, 1]);
export const flipDown = (o: Pt) => about(o, [1, 0, 0, -1]);
export const scaleAbout = (o: Pt, sx: number, sy: number) => about(o, [sx, 0, 0, sy]);
// skewed: x by kx degrees (the verticals lean), y by ky degrees
export const skewAbout = (o: Pt, kx: number, ky: number) => about(o, [1, Math.tan((ky * Math.PI) / 180), Math.tan((kx * Math.PI) / 180), 1]);
export const turnAbout = (o: Pt, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return about(o, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r)]);
};

const rr = (v: number) => +v.toFixed(3);
const wrap = (v: number) => {
  let r = ((v % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return rr(r);
};
const half = (v: number) => {
  const r = wrap(v);
  return r > 90 ? rr(r - 180) : r <= -90 ? rr(r + 180) : r;
};
// the 2 × 2 part as a turn (and a mirror), its scale: [scale, the turn of the x axis (deg), mirrored]; null when it
// stretches one way more than the other or skews
function similarity(m: Affine): { s: number; deg: number; mirror: boolean } | null {
  const [a, b, c, d] = m;
  const s = Math.hypot(a, b);
  if (!(s > 1e-12) || Math.abs(Math.hypot(c, d) - s) > 1e-9 * s || Math.abs(a * c + b * d) > 1e-9 * s * s) return null;
  return { s, deg: (Math.atan2(b, a) * 180) / Math.PI, mirror: a * d - b * c < 0 };
}

const POINTED = new Set(['line', 'arrow', 'polygon', 'path', 'dimension', 'callout']);
const SYMMETRIC = new Set(['rect', 'ellipse']);
// one object transformed; null: it cannot be (a component, a band of the data)
export function transformItem(it: AnnotationItem, m: Affine): AnnotationItem | null {
  const f = (p: Pt) => applyAffine(m, p);
  const sim = similarity(m);
  if (it.type === 'text') {
    const s = { ...TEXT_SPEC_DEFAULTS, ...it.spec };
    const moved = mapItem(it, f);
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    if (moved.type !== 'text' || Math.abs(k - 1) < 1e-9) return moved;
    const size = s.style?.size;
    return size ? { ...moved, spec: { ...moved.spec, style: { ...s.style, size: rr(size * k) } } } : moved;
  }
  if (it.type !== 'shape') return null;
  const s = shapeSpec(it.spec);
  // on an isometric face: its outline mapped (the face's points through the page's transform; it stays on the face)
  if (it.iso && s.kind !== 'component' && s.kind !== 'image') {
    const p = toPathItem(it);
    return p ? mapItem(p, f) : null;
  }
  if (s.kind === 'component' || ['vline', 'hline', 'xband', 'yband', 'scalebar'].includes(s.kind)) return null;
  if (POINTED.has(s.kind) && !(s.kind === 'path' && !s.d)) {
    const out = mapItem(it, f);
    // (a bent line mirrored: bent the other way)
    if (out.type === 'shape' && sim?.mirror && s.curve) return { ...out, spec: { ...out.spec, curve: -s.curve } };
    return out;
  }
  const boxed = ['rect', 'ellipse', 'star', 'regular', 'image'].includes(s.kind);
  if (boxed) {
    const c: Pt = [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
    const [hw, hh] = [Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2];
    const nc = f(c);
    const r = s.rotation || 0;
    const put = (w: number, h: number, extra: object) => ({ ...it, spec: { ...it.spec, x1: rr(nc[0] - w), y1: rr(nc[1] - h), x2: rr(nc[0] + w), y2: rr(nc[1] + h), ...extra } }) as AnnotationItem;
    if (sim) {
      // a turn (and a mirror) of the whole: across the line at φ, a shape turned by r is turned by 2φ − r, mirrored
      // across its x axis (Rot(2φ − r) R₀); a rectangle or an ellipse is that, a star or polygon (pointing up) is it
      // turned by 180°, a picture is it mirrored across and turned by 180°
      if (!sim.mirror) return put(hw * sim.s, hh * sim.s, { rotation: wrap(r + sim.deg) });
      const phi = sim.deg / 2;
      // (a rectangle or an ellipse turned by 180° is itself: its turn kept within ±90°)
      if (SYMMETRIC.has(s.kind)) return put(hw * sim.s, hh * sim.s, { rotation: half(2 * phi - r) });
      if (s.kind === 'image') return put(hw * sim.s, hh * sim.s, { rotation: wrap(2 * phi - r + 180), mirror: s.mirror ? undefined : true });
      return put(hw * sim.s, hh * sim.s, { rotation: wrap(2 * phi - r + 180) });
    }
    // stretched along its own sides (not turned, the transform not skewing): its box scaled
    if (!r && Math.abs(m[1]) < 1e-12 && Math.abs(m[2]) < 1e-12) {
      const flip = { ...(m[0] < 0 && s.kind === 'image' ? { mirror: s.mirror ? undefined : true } : {}) };
      // (flipped down, a star or polygon points the other way)
      const down = m[3] < 0 && (s.kind === 'star' || s.kind === 'regular') ? { rotation: wrap(r + 180) } : {};
      if (m[3] < 0 && s.kind === 'image') return null;
      return put(hw * Math.abs(m[0]), hh * Math.abs(m[3]), { ...flip, ...down });
    }
    if (s.kind === 'image') return null;
  }
  const p = toPathItem(it);
  return p ? mapItem(p, f) : null;
}
// the objects given transformed (those that cannot be: as they were)
export const transformAll = (items: AnnotationItem[], ids: string[], m: Affine) => items.map((it) => (ids.includes(it.id) && !it.locked ? (transformItem(it, m) ?? it) : it));
