// Selections on an image (Image analysis): their shapes, the pixels inside them, their outlines, the ring of background
// around a spot, the wand. The places are in pixels of the original image as it came (x to the right, y down; pixel i
// covers [i, i + 1)): a change of the crop does not move them. A pixel is inside a shape when its centre is (as ImageJ).
// Pure: the editor's worker, the evaluator and the checks use it.

// rect, ellipse: box (centre x, centre y, width, height) turned by angle (degrees, clockwise as seen); polygon, freehand:
// pts (closed); traced: the outline of pixels the wand found (pts on the pixels' corners); line, polyline: pts (open;
// width: the band averaged across for a profile, px); points: pts; angle: 3 pts, the vertex in the middle
export type RoiKind = 'rect' | 'ellipse' | 'polygon' | 'freehand' | 'traced' | 'line' | 'polyline' | 'points' | 'angle';
// a spot's background: none; a ring around it (gap and width, px; the pixels of the other spots left out); a region
// drawn (another selection); the global one (of the measurements: a selection or a value)
export type RoiBgMode = 'none' | 'ring' | 'region' | 'global';
export type RoiBg = { mode: RoiBgMode; gap?: number; width?: number; region?: string };
export type Roi = {
  id: string;
  name: string;
  kind: RoiKind;
  box?: [number, number, number, number];
  angle?: number;
  pts?: [number, number][];
  width?: number;
  group?: string;
  color?: string;
  hidden?: boolean;
  role?: 'background'; // a region of background (for spots): measured, left out of the spots and the summary
  train?: string; // an example of a class for the trainable classifier (its name): not measured
  auto?: boolean; // found as a particle (found again: replaced)
  bg?: RoiBg;
};
export type Pt = [number, number];

export const ROI_KINDS: Record<RoiKind, string> = { rect: 'rectangle', ellipse: 'ellipse', polygon: 'polygon', freehand: 'freehand', traced: 'wand', line: 'line', polyline: 'segmented line', points: 'points', angle: 'angle' };
export const ROI_COLOR = '#ffd60a';
// the editor's selection tools, and how each draws
export type RoiTool = 'rect' | 'ellipse' | 'polygon' | 'freehand' | 'line' | 'polyline' | 'points' | 'angle' | 'wand' | 'stamp';
export const TOOL_HINTS: Record<RoiTool, string> = {
  rect: 'Rectangle: drag (Shift: a square).',
  ellipse: 'Ellipse: drag (Shift: a circle).',
  polygon: 'Polygon: click every corner; double-click, Enter or a click on the first corner closes it.',
  freehand: 'Freehand: drag along the outline.',
  line: 'Line: drag (Shift: at 0°, 45°, 90°…).',
  polyline: 'Segmented line: click every point; double-click or Enter ends it.',
  points: 'Points: every click adds a point (to the points picked, else a new set).',
  angle: 'Angle: click one arm’s end, the vertex, the other arm’s end.',
  wand: 'Wand: click an object. On a mask: the object; on an image: the pixels joined to the one clicked within the tolerance.',
  stamp: 'Stamp: every click puts a copy of the selection picked there (its size, background, group).',
};

export const RING_DEFAULTS = { gap: 2, width: 4 };
export const isArea = (r: Roi) => r.kind === 'rect' || r.kind === 'ellipse' || r.kind === 'polygon' || r.kind === 'freehand' || r.kind === 'traced';
export const isLine = (r: Roi) => r.kind === 'line' || r.kind === 'polyline';

// a point of the shape's own frame (u, v from its centre) on the image
const turn = (cx: number, cy: number, a: number, u: number, v: number): Pt => {
  const [c, s] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
  return [cx + u * c - v * s, cy + u * s + v * c];
};

// The outline: the corners of a rectangle, an ellipse as a polygon (a vertex every pixel or so of its edge), the points
// of the others (a line: open)
export function roiOutline(r: Roi): Pt[] {
  if (r.kind === 'rect' || r.kind === 'ellipse') {
    const [cx, cy, w, h] = r.box ?? [0, 0, 0, 0];
    const a = r.angle ?? 0;
    if (r.kind === 'rect') return [turn(cx, cy, a, -w / 2, -h / 2), turn(cx, cy, a, w / 2, -h / 2), turn(cx, cy, a, w / 2, h / 2), turn(cx, cy, a, -w / 2, h / 2)];
    const n = Math.min(2000, Math.max(48, Math.ceil((Math.PI * (Math.abs(w) + Math.abs(h))) / 2)));
    return Array.from({ length: n }, (_, k) => turn(cx, cy, a, (w / 2) * Math.cos((2 * Math.PI * k) / n), (h / 2) * Math.sin((2 * Math.PI * k) / n)));
  }
  return r.pts ?? [];
}

// the box around points
export function bounds(p: Pt[]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of p) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// The pixels inside a closed outline, on an image of w × h whose origin is (ox, oy) of the original: a window (its
// place and size) and 1 for every pixel of it inside. The rows filled between the crossings of the edges (even-odd)
export type Window = { x0: number; y0: number; w: number; h: number; m: Uint8Array };
export function fillPolygon(poly: Pt[], w: number, h: number, ox = 0, oy = 0): Window {
  const p = poly.map(([x, y]): Pt => [x - ox, y - oy]);
  const [bx0, by0, bx1, by1] = bounds(p);
  const x0 = Math.max(0, Math.floor(bx0));
  const y0 = Math.max(0, Math.floor(by0));
  const x1 = Math.min(w, Math.ceil(bx1));
  const y1 = Math.min(h, Math.ceil(by1));
  const ww = Math.max(0, x1 - x0);
  const wh = Math.max(0, y1 - y0);
  const m = new Uint8Array(ww * wh);
  if (p.length < 3) return { x0, y0, w: ww, h: wh, m };
  const xs: number[] = [];
  for (let y = y0; y < y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xa, ya] = p[j];
      const [xb, yb] = p[i];
      if (ya <= cy !== yb <= cy) xs.push(xa + ((cy - ya) * (xb - xa)) / (yb - ya));
    }
    xs.sort((a, b) => a - b);
    const ro = (y - y0) * ww;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // (the pixels whose centre x + 0.5 is in [xa, xb))
      const a = Math.max(x0, Math.ceil(xs[k] - 0.5));
      const b = Math.min(x1, Math.ceil(xs[k + 1] - 0.5));
      for (let x = a; x < b; x++) m[ro + x - x0] = 1;
    }
  }
  return { x0, y0, w: ww, h: wh, m };
}
export const roiMask = (r: Roi, w: number, h: number, ox = 0, oy = 0): Window => fillPolygon(roiOutline(r), w, h, ox, oy);

// the distance from a point to a closed outline's edges
function edgeDistance(p: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j];
    const [bx, by] = p[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    const d = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// The ring of background around a shape: the pixels outside it whose centre is farther than `gap` from its edge and
// no farther than gap + width; those `taken` (other selections) left out
export function ringMask(r: Roi, w: number, h: number, ox: number, oy: number, gap: number, width: number, taken?: Uint8Array): Window {
  const poly = roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy]);
  const inside = fillPolygon(poly, w, h);
  const [bx0, by0, bx1, by1] = bounds(poly);
  const R = gap + width;
  const x0 = Math.max(0, Math.floor(bx0 - R));
  const y0 = Math.max(0, Math.floor(by0 - R));
  const x1 = Math.min(w, Math.ceil(bx1 + R));
  const y1 = Math.min(h, Math.ceil(by1 + R));
  const ww = Math.max(0, x1 - x0);
  const wh = Math.max(0, y1 - y0);
  const m = new Uint8Array(ww * wh);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const ix = x - inside.x0;
      const iy = y - inside.y0;
      if (ix >= 0 && iy >= 0 && ix < inside.w && iy < inside.h && inside.m[iy * inside.w + ix]) continue;
      if (taken?.[y * w + x]) continue;
      const d = edgeDistance(poly, x + 0.5, y + 0.5);
      if (d > gap && d <= R) m[(y - y0) * ww + x - x0] = 1;
    }
  return { x0, y0, w: ww, h: wh, m };
}

// The outline (on the pixels' corners) of a set of pixels joined by their sides (eight: or their corners, as ImageJ's
// particles), from its first pixel (the top row, the leftmost of it — its top edge is on the outer outline): followed
// with the set on the right; the outer outline only (holes inside are part of it, as ImageJ's wand)
export function traceOutline(inSet: (x: number, y: number) => boolean, x: number, y: number, eight = false): Pt[] {
  const out: Pt[] = [];
  const start: Pt = [x, y];
  let [vx, vy] = start;
  let [dx, dy] = [1, 0];
  const pix = (ox: number, oy: number) => inSet(Math.min(vx, vx + dx + ox), Math.min(vy, vy + dy + oy));
  for (let guard = 0; guard < 4e7; guard++) {
    // the pixels ahead on the right and on the left of the edge followed
    const [rx, ry] = [-dy, dx];
    const right = pix(rx, ry);
    const left = pix(dy, -dx);
    let [nx, ny] = [dx, dy];
    // (joined by a corner: the pixel ahead on the left first)
    if (eight) {
      if (left) [nx, ny] = [dy, -dx];
      else if (!right) [nx, ny] = [rx, ry];
    } else if (!right) [nx, ny] = [rx, ry];
    else if (left) [nx, ny] = [dy, -dx];
    if (nx !== dx || ny !== dy || !out.length) out.push([vx, vy]);
    [dx, dy] = [nx, ny];
    vx += dx;
    vy += dy;
    if (vx === start[0] && vy === start[1]) break;
  }
  return out;
}

// The wand: the pixels joined by their sides to (x, y) whose values are within tol of its value (a mask: the object
// clicked, or the background); their outer outline, or null outside the image
export function wand(c: Float32Array, w: number, h: number, x: number, y: number, tol: number): Pt[] | null {
  const [sx, sy] = [Math.floor(x), Math.floor(y)];
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const v0 = c[sy * w + sx];
  const seen = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  seen[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const px = i % w;
    const py = (i - px) / w;
    const tryAt = (j: number) => {
      if (!seen[j] && Math.abs(c[j] - v0) <= tol) {
        seen[j] = 1;
        stack.push(j);
      }
    };
    if (px > 0) tryAt(i - 1);
    if (px < w - 1) tryAt(i + 1);
    if (py > 0) tryAt(i - w);
    if (py < h - 1) tryAt(i + w);
  }
  const first = seen.indexOf(1);
  return traceOutline((qx, qy) => qx >= 0 && qy >= 0 && qx < w && qy < h && seen[qy * w + qx] === 1, first % w, Math.floor(first / w));
}

// A shape moved by (dx, dy)
export function moveRoi(r: Roi, dx: number, dy: number): Roi {
  return { ...r, ...(r.box ? { box: [r.box[0] + dx, r.box[1] + dy, r.box[2], r.box[3]] as Roi['box'] } : {}), ...(r.pts ? { pts: r.pts.map(([x, y]): Pt => [x + dx, y + dy]) } : {}) };
}
// its centre (of its box; of its points' box)
export function roiCentre(r: Roi): Pt {
  if (r.box) return [r.box[0], r.box[1]];
  const [x0, y0, x1, y1] = bounds(r.pts ?? [[0, 0]]);
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

// the area of a closed polygon (shoelace), its length (closed or open)
export function polygonArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(a) / 2;
}
export function pathLength(p: Pt[], closed: boolean): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (closed && p.length > 2) L += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return L;
}
// the convex hull (counterclockwise as numbers go; monotone chain)
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
