// Refine (Image analysis): every particle found made the regular shape most like it, among the shapes chosen — a
// circle, an ellipse, a square, a rectangle, a triangle, a hexagon — fitted to its outline (its place, size and turn:
// the one that overlaps it most), then, if asked, snapped to the edges under it on the image (a square or a rectangle:
// its sides moved to where the image crosses half-way from inside to outside; the others: scaled to the strongest
// edge). Pure.
import { convexHull, fillPolygon, polygonArea, type Pt } from './roi.ts';
import { fitBox } from './match.ts';

export type RegularShape = 'circle' | 'ellipse' | 'square' | 'rectangle' | 'triangle' | 'hexagon';
export const REGULAR_SHAPES: RegularShape[] = ['circle', 'ellipse', 'square', 'rectangle', 'triangle', 'hexagon'];
// a shape fitted: its kind, its centre, its sides (or axes, across: w along its turn), its turn (degrees, as the
// selections turn: clockwise as seen), its outline, and how much it overlaps the particle (intersection over union)
export type Fitted = { shape: RegularShape; cx: number; cy: number; w: number; h: number; angle: number; pts: Pt[]; iou: number };

const rad = (a: number) => (a * Math.PI) / 180;
const turned = (cx: number, cy: number, a: number, u: number, v: number): Pt => [cx + u * Math.cos(rad(a)) - v * Math.sin(rad(a)), cy + u * Math.sin(rad(a)) + v * Math.cos(rad(a))];
// the outline of a shape of that kind, centre, sides and turn
export function shapeOutline(shape: RegularShape, cx: number, cy: number, w: number, h: number, angle: number, tri?: Pt[]): Pt[] {
  if (shape === 'square' || shape === 'rectangle')
    return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([u, v]) => turned(cx, cy, angle, u, v));
  if (shape === 'circle' || shape === 'ellipse') return Array.from({ length: 64 }, (_, k) => turned(cx, cy, angle, (w / 2) * Math.cos((2 * Math.PI * k) / 64), (h / 2) * Math.sin((2 * Math.PI * k) / 64)));
  if (shape === 'hexagon') return Array.from({ length: 6 }, (_, k) => turned(cx, cy, angle, (w / 2) * Math.cos((Math.PI * k) / 3), (w / 2) * Math.sin((Math.PI * k) / 3)));
  return tri ?? [];
}

// how much two outlines overlap: the pixels (a half-pixel grid) inside both over those inside either
export function overlap(a: Pt[], b: Pt[]): number {
  const all = [...a, ...b];
  const x0 = Math.floor(Math.min(...all.map((p) => p[0]))) - 1;
  const y0 = Math.floor(Math.min(...all.map((p) => p[1]))) - 1;
  const x1 = Math.ceil(Math.max(...all.map((p) => p[0]))) + 1;
  const y1 = Math.ceil(Math.max(...all.map((p) => p[1]))) + 1;
  const f = 2;
  const [W, H] = [(x1 - x0) * f, (y1 - y0) * f];
  const sc = (p: Pt[]) => p.map(([x, y]): Pt => [(x - x0) * f, (y - y0) * f]);
  const ma = fillPolygon(sc(a), W, H);
  const mb = fillPolygon(sc(b), W, H);
  const A = new Uint8Array(W * H);
  for (let y = 0; y < ma.h; y++) for (let x = 0; x < ma.w; x++) if (ma.m[y * ma.w + x]) A[(ma.y0 + y) * W + ma.x0 + x] = 1;
  let [both, either] = [0, 0];
  for (let y = 0; y < mb.h; y++)
    for (let x = 0; x < mb.w; x++) {
      if (!mb.m[y * mb.w + x]) continue;
      const i = (mb.y0 + y) * W + mb.x0 + x;
      if (A[i]) both++;
      A[i] = A[i] ? 2 : 3;
    }
  for (const v of A) if (v) either++;
  return either ? both / either : 0;
}

// the smallest rectangle around the outline: its centre, length, width and the turn of its length (as the selections)
function minRect(poly: Pt[]): { cx: number; cy: number; w: number; h: number; angle: number } {
  const hull = convexHull(poly);
  let best = { area: Infinity, cx: 0, cy: 0, w: 0, h: 0, angle: 0 };
  for (let i = 0; i < hull.length; i++) {
    const [p, q] = [hull[i], hull[(i + 1) % hull.length]];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!L) continue;
    const [ux, uy] = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      [u0, u1, v0, v1] = [Math.min(u0, u), Math.max(u1, u), Math.min(v0, v), Math.max(v1, v)];
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) {
      const [um, vm] = [(u0 + u1) / 2, (v0 + v1) / 2];
      best = { area, cx: um * ux - vm * uy, cy: um * uy + vm * ux, w: u1 - u0, h: v1 - v0, angle: (Math.atan2(uy, ux) * 180) / Math.PI };
    }
  }
  return best;
}

// The regular shape most like the outline, among those allowed (null: none, or too small an outline)
export function fitRegular(poly: Pt[], allowed: RegularShape[]): Fitted | null {
  if (poly.length < 3 || !allowed.length) return null;
  const area = Math.abs(polygonArea(poly));
  if (!(area > 2)) return null;
  // the centroid and the second moments of the outline (as a filled polygon)
  let [cx, cy, a2] = [0, 0, 0];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a2 += c;
    cx += (poly[j][0] + poly[i][0]) * c;
    cy += (poly[j][1] + poly[i][1]) * c;
  }
  [cx, cy] = [cx / (3 * a2), cy / (3 * a2)];
  const out: Fitted[] = [];
  const add = (shape: RegularShape, x: number, y: number, w: number, h: number, angle: number, tri?: Pt[]) => {
    const pts = shapeOutline(shape, x, y, w, h, angle, tri);
    if (pts.length >= 3) out.push({ shape, cx: x, cy: y, w, h, angle, pts, iou: overlap(poly, pts) });
  };
  const mr = minRect(poly);
  if (allowed.includes('rectangle')) add('rectangle', mr.cx, mr.cy, mr.w, mr.h, mr.angle);
  if (allowed.includes('square')) {
    const s = Math.sqrt(area);
    add('square', mr.cx, mr.cy, s, s, mr.angle);
  }
  if (allowed.includes('circle')) {
    const d = 2 * Math.sqrt(area / Math.PI);
    add('circle', cx, cy, d, d, 0);
  }
  if (allowed.includes('ellipse')) {
    // (its axes from the outline's moments, of the same area)
    let [sxx, syy, sxy] = [0, 0, 0];
    const n = poly.length;
    for (const [x, y] of poly) [sxx, syy, sxy] = [sxx + (x - cx) ** 2 / n, syy + (y - cy) ** 2 / n, sxy + ((x - cx) * (y - cy)) / n];
    const t = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const l1 = (sxx + syy) / 2 + Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const l2 = (sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const r = Math.sqrt(Math.max(1e-9, l1) / Math.max(1e-9, l2));
    const b = Math.sqrt(area / (Math.PI * r));
    add('ellipse', cx, cy, 2 * b * r, 2 * b, (t * 180) / Math.PI);
  }
  if (allowed.includes('triangle')) {
    // (the largest triangle of the hull's corners, grown about its centre to the outline's area)
    let hull = convexHull(poly);
    if (hull.length > 60) hull = hull.filter((_, k) => k % Math.ceil(hull.length / 60) === 0);
    let best: Pt[] = [];
    let ba = 0;
    for (let i = 0; i < hull.length; i++)
      for (let j = i + 1; j < hull.length; j++)
        for (let k = j + 1; k < hull.length; k++) {
          const a3 = Math.abs(polygonArea([hull[i], hull[j], hull[k]]));
          if (a3 > ba) [ba, best] = [a3, [hull[i], hull[j], hull[k]]];
        }
    if (ba > 0) {
      const [tx, ty] = [(best[0][0] + best[1][0] + best[2][0]) / 3, (best[0][1] + best[1][1] + best[2][1]) / 3];
      const g = Math.sqrt(area / ba);
      const tri = best.map(([x, y]): Pt => [tx + (x - tx) * g, ty + (y - ty) * g]);
      add('triangle', tx, ty, 0, 0, 0, tri);
    }
  }
  if (allowed.includes('hexagon')) {
    const d = 2 * Math.sqrt(area / ((3 * Math.sqrt(3)) / 2));
    let bestA = 0;
    let bi = -1;
    for (let a = 0; a < 60; a += 3) {
      const v = overlap(poly, shapeOutline('hexagon', cx, cy, d, d, a));
      if (v > bi) [bi, bestA] = [v, a];
    }
    add('hexagon', cx, cy, d, d, bestA);
  }
  if (!out.length) return null;
  // (the one that overlaps most; a simpler one when about as good: a square before a rectangle, a circle before an ellipse)
  out.sort((p, q) => q.iou - p.iou);
  const top = out[0];
  const simpler = out.find((f) => ((f.shape === 'square' && top.shape === 'rectangle') || (f.shape === 'circle' && top.shape === 'ellipse')) && f.iou >= top.iou - 0.02);
  return simpler ?? top;
}

// a value between the pixels' centres (bilinear)
function at(c: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x - 0.5));
  const fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
  const [x1, y1] = [Math.min(w - 1, x0 + 1), Math.min(h - 1, y0 + 1)];
  const [tx, ty] = [fx - x0, fy - y0];
  return (c[y0 * w + x0] * (1 - tx) + c[y0 * w + x1] * tx) * (1 - ty) + (c[y1 * w + x0] * (1 - tx) + c[y1 * w + x1] * tx) * ty;
}
// A shape fitted moved onto the edges of the image c (w × h, the part analysed): a square or a rectangle by its sides
// (fitBox); the others scaled about their centre to where the image changes most along their outline
export function snapToEdges(f: Fitted, c: Float32Array, w: number, h: number): Fitted {
  if (f.shape === 'square' || f.shape === 'rectangle') {
    const b = fitBox(c, w, h, f.cx, f.cy, f.angle, f.w, f.h);
    if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0 || b.w > 2 * f.w || b.h > 2 * f.h) return f;
    const side = f.shape === 'square' ? (b.w + b.h) / 2 : 0;
    const [bw, bh] = side ? [side, side] : [b.w, b.h];
    return { ...f, cx: b.x, cy: b.y, w: bw, h: bh, pts: shapeOutline(f.shape, b.x, b.y, bw, bh, f.angle) };
  }
  // (the change of the image across the outline: the mean difference between just outside and just inside)
  const scaled = (s: number) => f.pts.map(([x, y]): Pt => [f.cx + (x - f.cx) * s, f.cy + (y - f.cy) * s]);
  const edge = (pts: Pt[]) => {
    let sum = 0;
    for (let k = 0; k < pts.length; k++) {
      const [x, y] = pts[k];
      const [dx, dy] = [x - f.cx, y - f.cy];
      const L = Math.hypot(dx, dy) || 1;
      sum += Math.abs(at(c, w, h, x + dx / L, y + dy / L) - at(c, w, h, x - dx / L, y - dy / L));
    }
    return sum / pts.length;
  };
  let [bs, be] = [1, edge(f.pts)];
  for (let s = 0.85; s <= 1.15 + 1e-9; s += 0.01) {
    const e = edge(scaled(s));
    if (e > be) [bs, be] = [s, e];
  }
  return bs === 1 ? f : { ...f, w: f.w * bs, h: f.h * bs, pts: scaled(bs) };
}
