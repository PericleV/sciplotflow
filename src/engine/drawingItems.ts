// The objects of a Figure Drawing as data (shapes and texts in mm): every point of one mapped (moved, stretched), one
// turned about a point, a component's objects placed in the box of an instance. Pure (the evaluator and the editor).
import { SHAPE_DEFAULTS, TEXT_SPEC_DEFAULTS, type ShapeSpec } from '../figure/spec.ts';
import { bendPoints, bendText, type Pt } from '../figure/shapes.ts';
import { mapPath } from '../figure/paths.ts';
import type { AnnotationItem, DrawingComponent } from '../types.ts';
import { isoToFace, isoToPage } from './isoPlane.ts';

const rr = (v: number) => +v.toFixed(4);
const full = (d: Partial<ShapeSpec>): ShapeSpec => ({ ...SHAPE_DEFAULTS, ...d });

// Every point of an object through f (mm → mm): its ends, corners, bends, points, outline or place; on an isometric
// face, f is on the page (its points in the face: to the page, through f, back)
export function mapItem(it: AnnotationItem, f: (p: Pt) => Pt): AnnotationItem {
  const iso = it.iso;
  return iso ? mapFlat(it, (p) => isoToFace(iso, f(isoToPage(iso, p)))) : mapFlat(it, f);
}
function mapFlat(it: AnnotationItem, f: (p: Pt) => Pt): AnnotationItem {
  if (it.type === 'text') {
    const s = { ...TEXT_SPEC_DEFAULTS, ...it.spec };
    const [x, y] = f([s.x, s.y]);
    return { ...it, spec: { ...it.spec, x: rr(x), y: rr(y) } };
  }
  if (it.type !== 'shape') return it;
  const s = full(it.spec);
  const p: Partial<ShapeSpec> = {};
  const [a, b] = [f([s.x1, s.y1]), f([s.x2, s.y2])];
  switch (s.kind) {
    case 'vline':
      p.x1 = rr(a[0]);
      break;
    case 'hline':
      p.y1 = rr(a[1]);
      break;
    case 'xband':
      [p.x1, p.x2] = [rr(a[0]), rr(b[0])];
      break;
    case 'yband':
      [p.y1, p.y2] = [rr(a[1]), rr(b[1])];
      break;
    case 'scalebar':
      [p.x1, p.y1] = [rr(a[0]), rr(a[1])];
      break;
    case 'polygon':
      p.points = s.points
        .split(';')
        .map((q) => q.trim().split(/[\s,]+/).map(Number))
        .filter((q) => q.length >= 2 && q.every(Number.isFinite))
        .map((q) => f([q[0], q[1]]).map(rr).join(' '))
        .join('; ');
      break;
    case 'path':
      if (s.d) p.d = mapPath(s.d, f);
      break;
    default:
      [p.x1, p.y1, p.x2, p.y2] = [rr(a[0]), rr(a[1]), rr(b[0]), rr(b[1])];
  }
  if (s.bends) p.bends = bendText(bendPoints(s.bends).map(f));
  return { ...it, spec: { ...it.spec, ...p } };
}
// (on an isometric face: its place moved, its points in the face kept)
export const moveItem = (it: AnnotationItem, dx: number, dy: number): AnnotationItem => (it.iso ? { ...it, iso: { ...it.iso, at: [rr(it.iso.at[0] + dx), rr(it.iso.at[1] + dy)] } } : mapItem(it, ([x, y]) => [x + dx, y + dy]));

// An object turned by deg (clockwise, y down) about c: a box shape or a text moved and its own turn added, the others'
// points turned.
export function rotateItem(it: AnnotationItem, c: Pt, deg: number): AnnotationItem {
  const a = (deg * Math.PI) / 180;
  const turn = ([x, y]: Pt): Pt => [c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a), c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)];
  const wrap = (v: number) => {
    let r = ((v % 360) + 360) % 360;
    if (r > 180) r -= 360;
    return rr(r);
  };
  if (it.type === 'text') {
    const s = { ...TEXT_SPEC_DEFAULTS, ...it.spec };
    const [x, y] = turn([s.x, s.y]);
    return { ...it, spec: { ...it.spec, x: rr(x), y: rr(y), rotation: wrap((s.rotation || 0) + deg) } };
  }
  if (it.type !== 'shape') return it;
  const s = full(it.spec);
  if (['rect', 'ellipse', 'star', 'regular', 'arc', 'image', 'component', 'bracket'].includes(s.kind)) {
    // (a bracket turns about the middle of its base)
    const o = s.orient ?? 'down';
    const m: Pt = s.kind !== 'bracket' || o === 'free' ? [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2] : o === 'down' || o === 'up' ? [(s.x1 + s.x2) / 2, s.y1] : [s.x1, (s.y1 + s.y2) / 2];
    const n = turn(m);
    const moved = mapItem(it, ([x, y]) => [x + n[0] - m[0], y + n[1] - m[1]]);
    return s.kind === 'component' || moved.type !== 'shape' ? moved : { ...moved, spec: { ...moved.spec, rotation: wrap((s.rotation || 0) + deg) } };
  }
  return mapItem(it, turn);
}

// The point of an object that a pin holds on the data: a line's or arrow's end (its head), a callout's point, a text's
// place, a dimension's start; else the middle of its points.
export function anchorOf(it: AnnotationItem): Pt {
  if (it.type === 'text') {
    const s = { ...TEXT_SPEC_DEFAULTS, ...it.spec };
    return [s.x, s.y];
  }
  const s = full(it.type === 'shape' ? it.spec : {});
  if (s.kind === 'line' || s.kind === 'arrow' || s.kind === 'callout') return [s.x2, s.y2];
  if (s.kind === 'dimension' || s.kind === 'scalebar') return [s.x1, s.y1];
  if (s.kind === 'polygon') {
    const pts = s.points
      .split(';')
      .map((q) => q.trim().split(/[\s,]+/).map(Number))
      .filter((q) => q.length >= 2 && q.every(Number.isFinite));
    if (pts.length) return [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
  }
  if (s.kind === 'path' && s.d) {
    const nums = s.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    if (xs.length) return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }
  return [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
}

// A component's objects placed in an instance's box (x1, y1)–(x2, y2): moved and stretched there (their ids prefixed by
// the instance's, so stuck lines and paths inside it still find one another).
export function placeComponent(inst: ShapeSpec, comp: DrawingComponent, prefix: string): AnnotationItem[] {
  const [x0, y0] = [Math.min(inst.x1, inst.x2), Math.min(inst.y1, inst.y2)];
  const sx = comp.w > 0 ? Math.abs(inst.x2 - inst.x1) / comp.w : 1;
  const sy = comp.h > 0 ? Math.abs(inst.y2 - inst.y1) / comp.h : 1;
  const id = (k: string | undefined) => (k ? `${prefix}${k}` : k);
  return comp.items.map((it) => {
    const placed = mapItem(it, ([x, y]) => [x0 + x * sx, y0 + y * sy]);
    if (placed.type === 'shape') return { ...placed, id: id(it.id)!, spec: { ...placed.spec, from: id(placed.spec.from), to: id(placed.spec.to) } };
    if (placed.type === 'text') return { ...placed, id: id(it.id)!, spec: { ...placed.spec, onPath: id(placed.spec.onPath) } };
    return { ...placed, id: id(it.id)! };
  });
}
