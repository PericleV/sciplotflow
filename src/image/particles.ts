// Particles (Image analysis): the objects of a mask found as selections (as ImageJ's Analyze Particles — joined by their
// sides or corners; touching ones cut apart by a watershed first; kept by their size and circularity, those on the
// image's edge left out if asked); the shape of each told by its corners and roundness (circle, ellipse, triangle,
// square, rectangle, polygon, irregular), or like the examples given (the nearest in shape); the distances between
// them (nearest neighbour, centre to centre and edge to edge; Clark–Evans). Pure.
import { label, separate } from './morph.ts';
import { convexHull, pathLength, polygonArea, traceOutline, type Pt, type Roi } from './roi.ts';

// separate: touching objects cut apart (tolerance: how deep a narrowing must be, px; neck: how narrow, at most, against
// the thinner part — a long or flat particle is not cut along itself); the size (px², of the outline: holes inside
// counted; a largest of 0: none) and circularity kept; edges: those touching the image's edge left out
// method: the particles of the mask (absent), or seeds and rays (rays.ts: size, the particles' diameter, px — absent or 0:
// from the mask; light: brighter than the ground)
export type ParticleOpts = { separate: boolean; tolerance: number; neck: number; minSize: number; maxSize: number; minCirc: number; maxCirc: number; excludeEdges: boolean; method?: 'mask' | 'rays'; size?: number; light?: boolean };
export const PARTICLE_DEFAULTS: ParticleOpts = { separate: false, tolerance: 0.5, neck: 0.75, minSize: 10, maxSize: 0, minCirc: 0, maxCirc: 1, excludeEdges: false };
export const MAX_PARTICLES = 5000;

// ImageJ's perimeter of a traced outline: the run of its sides, a corner cut at every step of a staircase
export function tracedPerimeter(p: Pt[]): number {
  const n = p.length;
  if (n < 3) return 0;
  let sumdx = 0;
  let sumdy = 0;
  let corners = 0;
  let dx1 = p[0][0] - p[n - 1][0];
  let dy1 = p[0][1] - p[n - 1][1];
  let side1 = Math.abs(dx1) + Math.abs(dy1);
  let corner = false;
  for (let i = 0; i < n; i++) {
    const nx = (i + 1) % n;
    const dx2 = p[nx][0] - p[i][0];
    const dy2 = p[nx][1] - p[i][1];
    sumdx += Math.abs(dx1);
    sumdy += Math.abs(dy1);
    const side2 = Math.abs(dx2) + Math.abs(dy2);
    if (side1 > 1 || !corner) {
      corner = true;
      corners++;
    } else corner = false;
    [dx1, dy1, side1] = [dx2, dy2, side2];
  }
  return sumdx + sumdy - corners * (2 - Math.SQRT2);
}

// The particles of a mask (1: object) of w × h: their outlines on the pixels' corners, in the order they are met (row
// after row); more than MAX_PARTICLES: the first ones, and how many there were
export function findParticles(m: Float32Array, w: number, h: number, o: ParticleOpts): { outlines: Pt[][]; found: number } {
  const mm = o.separate ? separate(m, w, h, o.tolerance, o.neck) : m;
  const { labels, count } = label(mm, w, h, true);
  // (every particle's first pixel — its top row, the leftmost of it —, its pixels, whether it touches the edge)
  const first = new Int32Array(count + 1).fill(-1);
  const edge = new Uint8Array(count + 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (!l) continue;
      if (first[l] < 0) first[l] = y * w + x;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge[l] = 1;
    }
  const outlines: Pt[][] = [];
  let found = 0;
  for (let l = 1; l <= count; l++) {
    if (first[l] < 0 || (o.excludeEdges && edge[l])) continue;
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === l;
    const pts = traceOutline(at, first[l] % w, Math.floor(first[l] / w), true);
    const area = polygonArea(pts);
    if (area < o.minSize || (o.maxSize > 0 && area > o.maxSize)) continue;
    const per = tracedPerimeter(pts);
    const circ = per > 0 ? Math.min(1, (4 * Math.PI * area) / (per * per)) : 0;
    if (circ < o.minCirc || circ > o.maxCirc) continue;
    found++;
    if (outlines.length < MAX_PARTICLES) outlines.push(pts);
  }
  return { outlines, found };
}

// ---- shape ----

// the corners of a closed outline: simplified (Douglas–Peucker, to a few % of its size), then the vertices where it
// turns by more than 35°
export function cornersOf(poly: Pt[]): Pt[] {
  if (poly.length < 3) return poly;
  // (split at the two points farthest apart, each half simplified)
  let [ia, ib, best] = [0, 0, -1];
  const h = convexHull(poly);
  for (let i = 0; i < h.length; i++)
    for (let j = i + 1; j < h.length; j++) {
      const d = (h[i][0] - h[j][0]) ** 2 + (h[i][1] - h[j][1]) ** 2;
      if (d > best) [best, ia, ib] = [d, poly.indexOf(h[i]), poly.indexOf(h[j])];
    }
  if (ia < 0 || ib < 0 || ia === ib) return poly;
  const eps = Math.max(1, 0.06 * Math.sqrt(best));
  const ring = (a: number, b: number) => {
    const out: Pt[] = [];
    for (let i = a; ; i = (i + 1) % poly.length) {
      out.push(poly[i]);
      if (i === b) break;
    }
    return out;
  };
  const dp = (p: Pt[]): Pt[] => {
    if (p.length < 3) return p;
    const [a, b] = [p[0], p[p.length - 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let [far, at] = [-1, 0];
    for (let i = 1; i < p.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L;
      if (d > far) [far, at] = [d, i];
    }
    return far > eps ? [...dp(p.slice(0, at + 1)).slice(0, -1), ...dp(p.slice(at))] : [a, b];
  };
  const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
  let s = [...dp(ring(lo, hi)).slice(0, -1), ...dp(ring(hi, lo)).slice(0, -1)];
  // (the vertices where it hardly turns dropped, again until none)
  for (let changed = true; changed && s.length > 3; ) {
    changed = false;
    for (let i = 0; i < s.length && s.length > 3; i++) {
      const p0 = s[(i + s.length - 1) % s.length];
      const p1 = s[i];
      const p2 = s[(i + 1) % s.length];
      const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      let t = Math.abs(a2 - a1);
      if (t > Math.PI) t = 2 * Math.PI - t;
      if (t < (35 * Math.PI) / 180) {
        s = s.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return s;
}

// what tells a shape: its circularity (4π·area / perimeter², the perimeter of a traced outline as ImageJ), aspect
// ratio and roundness (of the fitted ellipse), solidity, how far its outline is from its centre (the spread, relative),
// its corners
export type ShapeFeatures = { area: number; circ: number; ar: number; round: number; solidity: number; radial: number; corners: number; ellipseFit: number };
export function shapeFeatures(r: Roi, poly: Pt[], perimeter: number): ShapeFeatures {
  const area = polygonArea(poly);
  // (the second moments of the outline's area: the fitted ellipse)
  let [a, cx, cy] = [0, 0, 0];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += c;
    cx += (poly[j][0] + poly[i][0]) * c;
    cy += (poly[j][1] + poly[i][1]) * c;
  }
  a /= 2;
  [cx, cy] = a ? [cx / (6 * a), cy / (6 * a)] : [poly[0]?.[0] ?? 0, poly[0]?.[1] ?? 0];
  let [m20, m02, m11] = [0, 0, 0];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, y0] = [poly[j][0] - cx, poly[j][1] - cy];
    const [x1, y1] = [poly[i][0] - cx, poly[i][1] - cy];
    const c = x0 * y1 - x1 * y0;
    m20 += c * (x0 * x0 + x0 * x1 + x1 * x1);
    m02 += c * (y0 * y0 + y0 * y1 + y1 * y1);
    m11 += c * (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0);
  }
  [m20, m02, m11] = [m20 / 12 / a, m02 / 12 / a, m11 / 24 / a];
  const tr = (m20 + m02) / 2;
  const det = Math.sqrt(((m20 - m02) / 2) ** 2 + m11 * m11);
  const major = 4 * Math.sqrt(Math.max(0, tr + det));
  const minor = 4 * Math.sqrt(Math.max(0, tr - det));
  // (the spread of the outline's distance to the centre, along the outline: a point every pixel or less of it)
  const L = pathLength(poly, true) || 1;
  let [sd, sd2] = [0, 0];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.max(1, Math.ceil(len));
    for (let t = 0; t < n; t++) {
      const f = (t + 0.5) / n;
      const d = Math.hypot(p[0] + (q[0] - p[0]) * f - cx, p[1] + (q[1] - p[1]) * f - cy);
      sd += (d * len) / n;
      sd2 += (d * d * len) / n;
    }
  }
  const mean = sd / L;
  const radial = mean > 0 ? Math.sqrt(Math.max(0, sd2 / L - mean * mean)) / mean : 0;
  const hull = polygonArea(convexHull(poly));
  const ellipse = (Math.PI / 4) * major * minor;
  return {
    area,
    circ: perimeter > 0 ? Math.min(1, (4 * Math.PI * area) / (perimeter * perimeter)) : 0,
    ar: minor > 0 ? major / minor : 1,
    round: major > 0 ? (4 * area) / (Math.PI * major * major) : 0,
    solidity: hull > 0 ? Math.min(1, area / hull) : 0,
    radial,
    corners: r.kind === 'ellipse' ? 0 : cornersOf(poly).length,
    ellipseFit: ellipse > 0 ? Math.abs(area - ellipse) / area : 1,
  };
}
// The kind of a shape from its features
// (round: its outline about as far from its centre all round; then the area of the ellipse of its moments over its own —
// the same for every ellipse (0), every parallelogram (0.047), every triangle (0.209), whatever its proportions — with
// its corners, if hardly hollow: the solidity of a traced outline, a staircase, is a little below 1)
export function shapeName(f: ShapeFeatures): string {
  if (f.radial < 0.035 && f.ar < 1.15) return 'circle';
  if (f.ellipseFit < 0.025 && f.solidity > 0.93) return f.ar >= 1.15 ? 'ellipse' : f.corners >= 5 && f.corners <= 8 ? 'polygon' : 'circle';
  if (f.solidity >= 0.86) {
    if (f.corners <= 5 && f.ellipseFit > 0.15 && f.ellipseFit < 0.27) return 'triangle';
    if ((f.corners === 4 || f.corners === 5) && f.ellipseFit >= 0.025 && f.ellipseFit < 0.1) return f.ar < 1.2 ? 'square' : 'rectangle';
    if (f.corners === 3) return 'triangle';
    if (f.corners >= 5 && f.corners <= 8) return 'polygon';
  }
  return 'irregular';
}

// the colour of every shape's group (Group by shape)
export const SHAPE_COLORS: Record<string, string> = { circle: '#0a84ff', ellipse: '#64d2ff', triangle: '#30d158', square: '#ffd60a', rectangle: '#ff9f0a', polygon: '#bf5af2', irregular: '#ff453a' };

// The particles of `group` grouped like the examples (those of other groups among `from`): each takes the group of
// most of its 3 nearest examples in shape (the features scaled by their spread among the examples)
export function groupLikeExamples(items: { id: string; group: string; f: ShapeFeatures }[], group: string): Map<string, string> {
  const vec = (f: ShapeFeatures) => [f.circ, f.ar, f.round, f.solidity, f.radial, Math.min(f.corners, 10) / 10];
  const ex = items.filter((x) => x.group !== group);
  const out = new Map<string, string>();
  if (!ex.length) return out;
  const ev = ex.map((x) => vec(x.f));
  const sd = ev[0].map((_, j) => {
    const m = ev.reduce((a, v) => a + v[j], 0) / ev.length;
    return Math.sqrt(ev.reduce((a, v) => a + (v[j] - m) ** 2, 0) / ev.length) || 1;
  });
  for (const it of items) {
    if (it.group !== group) continue;
    const v = vec(it.f);
    const near = ex.map((e, k) => ({ g: e.group, d: ev[k].reduce((a, x, j) => a + ((x - v[j]) / sd[j]) ** 2, 0) })).sort((a, b) => a.d - b.d).slice(0, 3);
    const votes = new Map<string, number>();
    for (const n of near) votes.set(n.g, (votes.get(n.g) ?? 0) + 1);
    // (a tie: the nearest one's)
    const top = [...votes].sort((a, b) => b[1] - a[1]);
    out.set(it.id, top.length > 1 && top[0][1] === top[1][1] ? near[0].g : top[0][0]);
  }
  return out;
}

// The smallest rectangle around a closed outline (its convex hull's edges each tried as a side): its length and width,
// and the turn of its length (counterclockwise as seen, y up: 0 … 180°)
export function minAreaRect(poly: Pt[]): { length: number; width: number; angle: number } {
  const h = convexHull(poly);
  if (h.length < 3) return { length: 0, width: 0, angle: 0 };
  let best = { area: Infinity, a: 0, b: 0, ux: 1, uy: 0 };
  for (let i = 0; i < h.length; i++) {
    const p = h[i];
    const q = h[(i + 1) % h.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!L) continue;
    const [ux, uy] = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of h) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) best = { area, a: u1 - u0, b: v1 - v0, ux, uy };
  }
  // (the length along u or across it)
  const [lx, ly] = best.a >= best.b ? [best.ux, best.uy] : [-best.uy, best.ux];
  const angle = ((((Math.atan2(-ly, lx) * 180) / Math.PI) % 180) + 180) % 180;
  return { length: Math.max(best.a, best.b), width: Math.min(best.a, best.b), angle };
}
// How alike turns are (n: their symmetry — 4 for squares, turns in 0 … 90°; 2 otherwise): their mean turn and the
// alignment, 1 when all alike, about 0 when every way
export function alignment(turns: number[], n: number): { mean: number; order: number } {
  if (!turns.length) return { mean: NaN, order: NaN };
  let [c, s] = [0, 0];
  for (const t of turns) {
    c += Math.cos((n * t * Math.PI) / 180);
    s += Math.sin((n * t * Math.PI) / 180);
  }
  [c, s] = [c / turns.length, s / turns.length];
  const period = 360 / n;
  return { mean: ((((Math.atan2(s, c) * 180) / Math.PI / n) % period) + period) % period, order: Math.hypot(c, s) };
}

// ---- distances ----

// the least distance between two outlines (every vertex of one to the edges of the other; at most 64 of each)
function outlineDistance(a: Pt[], b: Pt[]): number {
  const thin = (p: Pt[]) => (p.length > 64 ? p.filter((_, i) => i % Math.ceil(p.length / 64) === 0) : p);
  const [A, B] = [thin(a), thin(b)];
  const toEdges = (P: Pt[], Q: Pt[]) => {
    let best = Infinity;
    for (const [x, y] of P)
      for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
        const [ax, ay] = Q[j];
        const dx = Q[i][0] - ax;
        const dy = Q[i][1] - ay;
        const L = dx * dx + dy * dy;
        const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
        const d = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
        if (d < best) best = d;
      }
    return best;
  };
  return Math.sqrt(Math.min(toEdges(A, B), toEdges(B, A)));
}
// The nearest neighbour of every particle: its index, the distance between their centres and between their outlines
// (among its 5 nearest by the centres; 0 when they touch or overlap)
export function nearestNeighbours(c: Pt[], outlines: Pt[][]): { j: number; centre: number; edge: number }[] {
  return c.map((p, i) => {
    const byCentre = c.map((q, j) => ({ j, d: Math.hypot(q[0] - p[0], q[1] - p[1]) })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d);
    if (!byCentre.length) return { j: -1, centre: NaN, edge: NaN };
    const edge = Math.min(...byCentre.slice(0, 5).map((x) => outlineDistance(outlines[i], outlines[x.j])));
    return { j: byCentre[0].j, centre: byCentre[0].d, edge };
  });
}
// Clark–Evans' R: the mean nearest-neighbour distance over that of points at random in the same area (Donnelly's
// correction for the edge of the area: perimeter P); 1: random, < 1: clustered, > 1: regular (2.15: hexagonal)
export function clarkEvans(meanNnd: number, n: number, area: number, perimeter: number): number {
  if (n < 2 || !(area > 0)) return NaN;
  const expected = 0.5 * Math.sqrt(area / n) + (0.0514 + 0.041 / Math.sqrt(n)) * (perimeter / n);
  return meanNnd / expected;
}
