// Fields made from points and vectors, for Contour / heatmap: the points counted in square bins (a 2D histogram), their
// density (a Gaussian kernel, Scott's width on each axis), the vectors (U, V) on a grid read anywhere (bilinear), drawn as
// arrows on every N-th point or as streamlines (traced both ways from seeds spread over the field, a new one not entering
// a place another already went through). Pure.
import type { Grid } from './contour.ts';
import { maxOf, minOf } from './minmax.ts';

const sd = (v: number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
};

// The points counted in n × n square bins over their range (the cells at the bins' middles).
export function countGrid(px: number[], py: number[], n: number): Grid {
  const k = Math.max(2, Math.min(500, Math.floor(n) || 30));
  const [x0, x1, y0, y1] = [minOf(px), maxOf(px), minOf(py), maxOf(py)];
  const [wx, wy] = [(x1 - x0 || 1) / k, (y1 - y0 || 1) / k];
  const z = new Float64Array(k * k);
  for (let p = 0; p < px.length; p++) {
    const i = Math.min(k - 1, Math.floor((px[p] - x0) / wx));
    const j = Math.min(k - 1, Math.floor((py[p] - y0) / wy));
    if (i >= 0 && j >= 0) z[j * k + i]++;
  }
  return { xs: Array.from({ length: k }, (_, i) => x0 + (i + 0.5) * wx), ys: Array.from({ length: k }, (_, j) => y0 + (j + 0.5) * wy), z };
}

// The density of the points on an n × n grid (their range and 2 widths more on each side): a Gaussian kernel of Scott's
// width on each axis (or `scale` × it); many points first gathered in fine bins (their counts as weights).
export function densityGrid(px: number[], py: number[], n: number, scale = 1): Grid {
  const k = Math.max(10, Math.min(300, Math.floor(n) || 100));
  const N = px.length;
  const f = N ** (-1 / 6) * (scale > 0 ? scale : 1);
  const hx = (sd(px) || 1) * f;
  const hy = (sd(py) || 1) * f;
  const [x0, x1, y0, y1] = [minOf(px) - 2 * hx, maxOf(px) + 2 * hx, minOf(py) - 2 * hy, maxOf(py) + 2 * hy];
  // the points, or their fine bins with their counts
  let qx = px;
  let qy = py;
  let qw: number[] = px.map(() => 1);
  if (N > 3000) {
    const b = countGrid(px, py, 2 * k);
    qx = [];
    qy = [];
    qw = [];
    b.z.forEach((c, at) => {
      if (!c) return;
      qx.push(b.xs[at % b.xs.length]);
      qy.push(b.ys[Math.floor(at / b.xs.length)]);
      qw.push(c);
    });
  }
  const xs = Array.from({ length: k }, (_, i) => x0 + ((x1 - x0) * i) / (k - 1));
  const ys = Array.from({ length: k }, (_, j) => y0 + ((y1 - y0) * j) / (k - 1));
  const z = new Float64Array(k * k);
  const norm = 1 / (2 * Math.PI * hx * hy * N);
  // each point adds to the cells within 4 widths of it
  for (let p = 0; p < qx.length; p++) {
    const i0 = Math.max(0, Math.floor(((qx[p] - 4 * hx - x0) / (x1 - x0)) * (k - 1)));
    const i1 = Math.min(k - 1, Math.ceil(((qx[p] + 4 * hx - x0) / (x1 - x0)) * (k - 1)));
    const j0 = Math.max(0, Math.floor(((qy[p] - 4 * hy - y0) / (y1 - y0)) * (k - 1)));
    const j1 = Math.min(k - 1, Math.ceil(((qy[p] + 4 * hy - y0) / (y1 - y0)) * (k - 1)));
    for (let j = j0; j <= j1; j++) {
      const ey = ((ys[j] - qy[p]) / hy) ** 2;
      for (let i = i0; i <= i1; i++) z[j * k + i] += qw[p] * Math.exp(-0.5 * (((xs[i] - qx[p]) / hx) ** 2 + ey));
    }
  }
  for (let t = 0; t < z.length; t++) z[t] *= norm;
  return { xs, ys, z };
}

// ---- vectors ----
// a grid's value at fractional indices (bilinear)
function at(g: Grid, fi: number, fj: number): number {
  const nx = g.xs.length;
  const i = Math.min(nx - 2, Math.floor(fi));
  const j = Math.min(g.ys.length - 2, Math.floor(fj));
  const [u, v] = [fi - i, fj - j];
  const z = (a: number, b: number) => g.z[b * nx + a];
  return (1 - u) * (1 - v) * z(i, j) + u * (1 - v) * z(i + 1, j) + (1 - u) * v * z(i, j + 1) + u * v * z(i + 1, j + 1);
}

export type Segment = { x: number[]; y: number[] };

// Arrows on every N-th point of the grid: each component scaled by its own cell size (the longest arrow `length` cells
// long — times N), from the point.
export function vectorArrows(U: Grid, V: Grid, every: number, length: number): Segment[] {
  const nx = U.xs.length;
  const ny = U.ys.length;
  const e = Math.max(1, Math.floor(every) || 1);
  const dx = (U.xs[nx - 1] - U.xs[0]) / Math.max(1, nx - 1);
  const dy = (U.ys[ny - 1] - U.ys[0]) / Math.max(1, ny - 1);
  let big = 0;
  for (let t = 0; t < U.z.length; t++) {
    const s = Math.hypot(U.z[t] / (dx || 1), V.z[t] / (dy || 1));
    if (Number.isFinite(s) && s > big) big = s;
  }
  if (!(big > 0)) return [];
  const k = ((length > 0 ? length : 0.9) * e) / big;
  const out: Segment[] = [];
  for (let j = 0; j < ny; j += e)
    for (let i = 0; i < nx; i += e) {
      const [u, v] = [U.z[j * nx + i], V.z[j * nx + i]];
      if (!Number.isFinite(u) || !Number.isFinite(v) || (u === 0 && v === 0)) continue;
      const [x, y] = [U.xs[i], U.ys[j]];
      out.push({ x: [x, x + (u / (dx || 1)) * k * dx], y: [y, y + (v / (dy || 1)) * k * dy] });
    }
  return out;
}

// Streamlines of the field: traced in the grid's cells (each direction by its own cell size), both ways from seeds
// spread over a mask of about 30 × density places a side; a line stops at the edge, where the field vanishes, after many
// steps, or entering a place of the mask another line went through.
export function streamlines(U: Grid, V: Grid, density = 1): Segment[] {
  const nx = U.xs.length;
  const ny = U.ys.length;
  if (nx < 2 || ny < 2) return [];
  const M = Math.max(5, Math.min(120, Math.round(30 * (density > 0 ? density : 1))));
  const taken = new Int32Array(M * M).fill(-1);
  const cell = (fi: number, fj: number) => Math.min(M - 1, Math.floor((fi / (nx - 1)) * M)) + M * Math.min(M - 1, Math.floor((fj / (ny - 1)) * M));
  // the direction at fractional indices (in cells), its length 1; null where the field is 0 or missing
  const dir = (fi: number, fj: number): [number, number] | null => {
    if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return null;
    const u = at(U, fi, fj);
    const v = at(V, fi, fj);
    const dxi = (U.xs[Math.min(nx - 1, Math.floor(fi) + 1)] - U.xs[Math.max(0, Math.floor(fi))]) || 1;
    const dyj = (U.ys[Math.min(ny - 1, Math.floor(fj) + 1)] - U.ys[Math.max(0, Math.floor(fj))]) || 1;
    const [a, b] = [u / dxi, v / dyj];
    const s = Math.hypot(a, b);
    return Number.isFinite(s) && s > 1e-12 ? [a / s, b / s] : null;
  };
  const step = 0.3 * Math.max(1, (nx - 1) / M);
  const trace = (fi: number, fj: number, sign: number, id: number): [number, number][] => {
    const pts: [number, number][] = [];
    let c = cell(fi, fj);
    for (let k = 0; k < 4000; k++) {
      const d1 = dir(fi, fj);
      if (!d1) break;
      const mid = dir(fi + (sign * step * d1[0]) / 2, fj + (sign * step * d1[1]) / 2);
      if (!mid) break;
      const [ni, nj] = [fi + sign * step * mid[0], fj + sign * step * mid[1]];
      if (ni < 0 || nj < 0 || ni > nx - 1 || nj > ny - 1) break;
      const nc = cell(ni, nj);
      if (nc !== c) {
        if (taken[nc] !== -1 && taken[nc] !== id) break;
        taken[nc] = id;
        c = nc;
      }
      [fi, fj] = [ni, nj];
      pts.push([fi, fj]);
    }
    return pts;
  };
  const toXY = (fi: number, fj: number): [number, number] => {
    const i = Math.min(nx - 2, Math.floor(fi));
    const j = Math.min(ny - 2, Math.floor(fj));
    return [U.xs[i] + (fi - i) * (U.xs[i + 1] - U.xs[i]), U.ys[j] + (fj - j) * (U.ys[j + 1] - U.ys[j])];
  };
  const out: Segment[] = [];
  let id = 0;
  for (let q = 0; q < M * M; q++) {
    if (taken[q] !== -1) continue;
    const [fi, fj] = [(((q % M) + 0.5) / M) * (nx - 1), ((Math.floor(q / M) + 0.5) / M) * (ny - 1)];
    if (!dir(fi, fj)) continue;
    taken[q] = id;
    const back = trace(fi, fj, -1, id).reverse();
    const fwd = trace(fi, fj, 1, id);
    const pts = [...back, [fi, fj] as [number, number], ...fwd];
    if (pts.length >= 4) {
      const xy = pts.map(([a, b]) => toXY(a, b));
      out.push({ x: xy.map((p) => p[0]), y: xy.map((p) => p[1]) });
    }
    id++;
  }
  return out;
}
