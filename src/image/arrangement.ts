// Arrangement (Image analysis): how the particles found lie — every particle's nearest neighbour (centre to centre and
// edge to edge), the mean of its k nearest, its Delaunay neighbours (the particles it truly faces: its coordination), its
// Voronoi cell (the area that is nearer to it than to any other: the local density), its hexatic order ψ₆, the cluster
// it is in (particles closer than a gap, edge to edge, joined); and of all of them: their density, Clark–Evans' R with its
// z and p (Donnelly's edge correction), the pair correlation g(r) and Ripley's L(r) − r (translation edge correction)
// with the band of points at random (complete spatial randomness), the nearest-neighbour distances against those of
// points at random. Pure: the evaluator and the checks run it.
import { normSf } from '../engine/dist.ts';
import { clarkEvans, outlineDistance } from './particles.ts';
import type { Pt } from './roi.ts';

// on: worked out; group: of the particles of this group ('' all); k: the nearest averaged; gap: particles this near
// (px, edge to edge) are one cluster; rmax: the largest r of g(r) and L(r) (px; 0: a quarter of the shorter side); bins:
// of g(r) and of the distances; sims: the patterns at random of the band; show: drawn over the image
export type ArrangeSpec = {
  on?: boolean;
  group?: string;
  k?: number;
  gap?: number;
  rmax?: number;
  bins?: number;
  sims?: number;
  show?: 'off' | 'nearest' | 'delaunay' | 'voronoi';
  labels?: boolean;
};
export type ArrangeSettings = Required<Omit<ArrangeSpec, 'on' | 'group'>>;
export const ARRANGE_DEFAULTS: ArrangeSettings = { k: 3, gap: 1, rmax: 0, bins: 40, sims: 99, show: 'nearest', labels: false };

export type ArrangeParticle = { name: string; group?: string; c: Pt; poly: Pt[] };
export type ArrangeRow = {
  nearest: number; // its index
  nnd: number;
  edge: number;
  knn: number;
  coord: number; // Delaunay neighbours
  cell: number; // Voronoi cell area (NaN: cut by the image's edge)
  psi6: number;
  cluster: number;
  clusterSize: number;
  onEdge: boolean; // its cell cut by the image's edge
};
export type ArrangeResult = {
  pts: Pt[]; // the particles' centres (px of the part analysed)
  rows: ArrangeRow[];
  links: [number, number][]; // the Delaunay edges
  cells: (Pt[] | null)[]; // the Voronoi cells (clipped to the image)
  summary: { n: number; area: number; density: number; nnd: number; nndSd: number; edge: number; R: number; z: number; p: number; coord: number; cellCv: number; psi6: number; clusters: number; isolated: number; meanCluster: number; largest: number; peak: number };
  g: { r: number[]; g: number[] };
  L: { r: number[]; L: number[]; lo: number[]; hi: number[] };
  nndHist: { r: number[]; count: number[]; csr: number[] };
};

// ---- Delaunay (Bowyer–Watson) ----
function delaunay(p: Pt[]): [number, number, number][] {
  const n = p.length;
  if (n < 3) return [];
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const d = Math.max(x1 - x0, y1 - y0) || 1;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  // (a triangle around them all: its corners n, n + 1, n + 2)
  const pts: Pt[] = [...p, [mx - 20 * d, my - d], [mx, my + 20 * d], [mx + 20 * d, my - d]];
  type T = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const circ = (a: number, b: number, c: number): T => {
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const [cx, cy] = pts[c];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
    return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris: T[] = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const bad = tris.filter((t) => (x - t.x) ** 2 + (y - t.y) ** 2 < t.r2 * (1 + 1e-12));
    // (the hole's border: the edges of the bad triangles not shared by two of them)
    const count = new Map<string, [number, number]>();
    const seen = new Map<string, number>();
    for (const t of bad)
      for (const [u, v] of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        count.set(key, [u, v]);
      }
    const badSet = new Set(bad);
    tris = tris.filter((t) => !badSet.has(t));
    for (const [key, [u, v]] of count) if (seen.get(key) === 1) tris.push(circ(u, v, i));
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

// a convex polygon clipped by the half-plane nearer to p than to q
function clipHalf(poly: Pt[], p: Pt, q: Pt): Pt[] {
  const [mx, my] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const [nx, ny] = [q[0] - p[0], q[1] - p[1]];
  const side = (a: Pt) => (a[0] - mx) * nx + (a[1] - my) * ny; // ≤ 0: on p's side
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [sa, sb] = [side(a), side(b)];
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
const polyArea = (p: Pt[]) => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;

// a pseudo-random generator (the band at random the same every time)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ripley's K at the radii dr, 2 dr … bins · dr of points in a W × H rectangle (the translation correction: each pair
// weighed by the area over the part of the rectangle where the pair fits)
function ripleyK(p: Pt[], W: number, H: number, dr: number, bins: number): number[] {
  const n = p.length;
  const A = W * H;
  const ring = new Float64Array(bins);
  const rm = dr * bins;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const [dx, dy] = [Math.abs(p[i][0] - p[j][0]), Math.abs(p[i][1] - p[j][1])];
      if (dx > rm || dy > rm) continue;
      const d = Math.hypot(dx, dy);
      if (d > rm || dx >= W || dy >= H) continue;
      ring[Math.min(bins - 1, Math.max(0, Math.ceil(d / dr) - 1))] += (2 * A) / ((W - dx) * (H - dy));
    }
  const K: number[] = [];
  let sum = 0;
  for (let b = 0; b < bins; b++) K.push(n > 1 ? (A * (sum += ring[b])) / (n * (n - 1)) : NaN);
  return K;
}

export function arrange(parts: ArrangeParticle[], W: number, H: number, spec: ArrangeSpec): ArrangeResult {
  const s = { ...ARRANGE_DEFAULTS, ...spec };
  const n = parts.length;
  const P = parts.map((q) => q.c);
  const A = W * H;
  // ---- the nearest, the k nearest (by the centres), edge to edge among the 5 nearest ----
  const near = P.map((p, i) => P.map((q, j) => ({ j, d: Math.hypot(q[0] - p[0], q[1] - p[1]) })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d));
  const k = Math.max(1, Math.round(s.k));
  // ---- Delaunay: the neighbours; Voronoi: every cell the image clipped by the bisectors with its neighbours ----
  const tris = delaunay(P);
  const nb = P.map(() => new Set<number>());
  for (const [a, b, c] of tris) {
    nb[a].add(b).add(c);
    nb[b].add(a).add(c);
    nb[c].add(a).add(b);
  }
  const links: [number, number][] = [];
  nb.forEach((set, i) => set.forEach((j) => i < j && links.push([i, j])));
  const box: Pt[] = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  const cells = P.map((p, i) => {
    let cell = box;
    // (its Delaunay neighbours; few points: every other)
    for (const j of n < 4 ? P.map((_, q) => q).filter((q) => q !== i) : [...nb[i]]) {
      cell = clipHalf(cell, p, P[j]);
      if (cell.length < 3) return null;
    }
    return cell;
  });
  const cut = cells.map((c) => !c || c.some(([x, y]) => x <= 1e-6 || y <= 1e-6 || x >= W - 1e-6 || y >= H - 1e-6));
  // ---- ψ₆ of every particle away from the edge (its Delaunay neighbours' directions) ----
  const psi = P.map((p, i) => {
    const js = [...nb[i]];
    if (!js.length) return NaN;
    let [re, im] = [0, 0];
    for (const j of js) {
      const t = Math.atan2(P[j][1] - p[1], P[j][0] - p[0]);
      re += Math.cos(6 * t);
      im += Math.sin(6 * t);
    }
    return Math.hypot(re, im) / js.length;
  });
  // ---- clusters: particles nearer than the gap, edge to edge (among the Delaunay neighbours and the nearest) ----
  const parent = P.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const pairs = new Set(links.map(([a, b]) => `${a},${b}`));
  near.forEach((l, i) => l.slice(0, 3).forEach(({ j }) => pairs.add(i < j ? `${i},${j}` : `${j},${i}`)));
  const edgeD = new Map<string, number>();
  for (const key of pairs) {
    const [a, b] = key.split(',').map(Number);
    const d = outlineDistance(parts[a].poly, parts[b].poly);
    edgeD.set(key, d);
    if (d <= s.gap) parent[root(a)] = root(b);
  }
  const size = new Map<number, number>();
  P.forEach((_, i) => size.set(root(i), (size.get(root(i)) ?? 0) + 1));
  const ids = new Map([...size.keys()].map((r, i) => [r, i + 1]));
  // ---- every particle ----
  const rows: ArrangeRow[] = P.map((_, i) => {
    const l = near[i];
    const edges = l.slice(0, 5).map(({ j }) => edgeD.get(i < j ? `${i},${j}` : `${j},${i}`) ?? outlineDistance(parts[i].poly, parts[j].poly));
    return {
      nearest: l[0]?.j ?? -1,
      nnd: l[0]?.d ?? NaN,
      edge: edges.length ? Math.min(...edges) : NaN,
      knn: l.length >= k ? l.slice(0, k).reduce((a, x) => a + x.d, 0) / k : NaN,
      coord: nb[i].size,
      cell: cells[i] && !cut[i] ? polyArea(cells[i]!) : NaN,
      psi6: psi[i],
      cluster: ids.get(root(i))!,
      clusterSize: size.get(root(i))!,
      onEdge: cut[i],
    };
  });
  // ---- all of them ----
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  const sd = (v: number[]) => {
    const m = mean(v);
    return v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : NaN;
  };
  const nnds = rows.map((r) => r.nnd).filter(Number.isFinite);
  const inner = rows.filter((r) => !r.onEdge);
  const cellAreas = inner.map((r) => r.cell).filter(Number.isFinite);
  const R = clarkEvans(mean(nnds), n, A, 2 * (W + H));
  // (Donnelly: the expected mean and its standard error; z, two-sided p)
  const expected = 0.5 * Math.sqrt(A / n) + (0.0514 + 0.041 / Math.sqrt(n)) * ((2 * (W + H)) / n);
  const se = Math.sqrt((0.0703 * A) / (n * n) + 0.037 * 2 * (W + H) * Math.sqrt(A / n ** 5));
  const z = (mean(nnds) - expected) / se;
  // ---- g(r) and L(r): up to rmax, in bins ----
  const rmax = s.rmax > 0 ? s.rmax : Math.min(W, H) / 4;
  const bins = Math.max(5, Math.round(s.bins));
  const dr = rmax / bins;
  const rs = Array.from({ length: bins }, (_, b) => (b + 1) * dr);
  const K = ripleyK(P, W, H, dr, bins);
  // (g from the growth of K: the pairs in every ring over those at random)
  const gr = rs.map((r, b) => {
    const k0 = b ? K[b - 1] : 0;
    return (K[b] - k0) / (Math.PI * (r * r - (r - dr) ** 2));
  });
  const L = K.map((kk, b) => Math.sqrt(kk / Math.PI) - rs[b]);
  const rand = rng(97);
  const lo = new Array<number>(bins).fill(Infinity);
  const hi = new Array<number>(bins).fill(-Infinity);
  // (as many patterns as asked, fewer for many particles: about 3·10⁷ pairs in all, 19 at least)
  const sims = Math.min(Math.round(s.sims), Math.max(19, Math.floor(6e7 / Math.max(1, n * n))));
  if (n > 1)
    for (let t = 0; t < sims; t++) {
      const q: Pt[] = Array.from({ length: n }, () => [rand() * W, rand() * H]);
      ripleyK(q, W, H, dr, bins).forEach((kk, b) => {
        const v = Math.sqrt(kk / Math.PI) - rs[b];
        lo[b] = Math.min(lo[b], v);
        hi[b] = Math.max(hi[b], v);
      });
    }
  // (the first peak of g, clearly above 1: the distance the particles keep most; none for points at random)
  let peak = NaN;
  for (let b = 1; b < bins - 1; b++)
    if (gr[b] > 1.25 && gr[b] >= gr[b - 1] && gr[b] >= gr[b + 1]) {
      peak = rs[b] - dr / 2;
      break;
    }
  // ---- the nearest-neighbour distances, against those of points at random (Poisson: 1 − exp(−λπr²)) ----
  const top = nnds.length ? Math.max(...nnds) * 1.05 : 1;
  const hb = Math.max(5, Math.round(Math.min(bins, Math.sqrt(n) * 2)));
  const hw = top / hb;
  const count = new Array<number>(hb).fill(0);
  for (const d of nnds) count[Math.min(hb - 1, Math.floor(d / hw))]++;
  const lam = n / A;
  const F = (r: number) => 1 - Math.exp(-lam * Math.PI * r * r);
  const sizes = [...size.values()];
  return {
    pts: P,
    rows,
    links,
    cells,
    summary: {
      n,
      area: A,
      density: lam,
      nnd: mean(nnds),
      nndSd: sd(nnds),
      edge: mean(rows.map((r) => r.edge).filter(Number.isFinite)),
      R,
      z,
      p: Number.isFinite(z) ? 2 * normSf(Math.abs(z)) : NaN,
      coord: mean(inner.map((r) => r.coord)),
      cellCv: cellAreas.length > 1 ? sd(cellAreas) / mean(cellAreas) : NaN,
      psi6: mean(inner.map((r) => r.psi6).filter(Number.isFinite)),
      clusters: size.size,
      isolated: n ? sizes.filter((v) => v === 1).length / n : NaN,
      meanCluster: mean(sizes),
      largest: sizes.length ? Math.max(...sizes) : 0,
      peak,
    },
    g: { r: rs.map((r) => r - dr / 2), g: gr },
    L: { r: rs, L, lo: lo.map((v) => (Number.isFinite(v) ? v : NaN)), hi: hi.map((v) => (Number.isFinite(v) ? v : NaN)) },
    nndHist: { r: count.map((_, b) => (b + 0.5) * hw), count, csr: count.map((_, b) => n * (F((b + 1) * hw) - F(b * hw))) },
  };
}
