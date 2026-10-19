// Derivatives and integrals of sampled data, on unevenly spaced X too.
// Derivative: the mean of the slopes to the two neighbours (one slope at the ends), or Savitzky–Golay
// (a polynomial fitted by least squares over a window of points around each one — smooths as it differentiates).
// Integral: the trapezoid rule, cumulative, from the first point of every region (separate) or on across the regions
// (combined); signed or absolute area, over y = 0, a line between the ends of the region, a constant, or a curve through
// points placed by hand (straight segments or a natural cubic spline; flat beyond the first and the last point).
import { baselineOf, type BaseMethod, type BaseOptions } from './baselines.ts';

export type DiffMethod = 'central' | 'sg';
// the baselines of src/engine/baselines.ts; curve: another curve (the other branch of a scan, another column, a curve
// connected); lowest: the lowest point of the region (the curve lifted above 0)
export type Baseline = BaseMethod;
export type Region = { lo: number; hi: number };
export type Pt = { x: number; y: number };

// The baseline through points: straight segments, or a natural cubic spline (3 points or more); flat outside them.
export function pointsCurve(points: Pt[], interp: 'linear' | 'spline'): ((x: number) => number) | null {
  const p = points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)).sort((a, b) => a.x - b.x);
  if (!p.length) return null;
  if (p.length === 1) return () => p[0].y;
  const n = p.length;
  // the second derivatives of the natural spline (tridiagonal system)
  const m = new Float64Array(n);
  if (interp === 'spline' && n > 2) {
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    const c = new Float64Array(n);
    const r = new Float64Array(n);
    b[0] = b[n - 1] = 1;
    for (let i = 1; i < n - 1; i++) {
      const h0 = p[i].x - p[i - 1].x;
      const h1 = p[i + 1].x - p[i].x;
      a[i] = h0;
      b[i] = 2 * (h0 + h1);
      c[i] = h1;
      r[i] = 6 * ((p[i + 1].y - p[i].y) / h1 - (p[i].y - p[i - 1].y) / h0);
    }
    for (let i = 1; i < n; i++) {
      const w = a[i] / b[i - 1];
      b[i] -= w * c[i - 1];
      r[i] -= w * r[i - 1];
    }
    m[n - 1] = r[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) m[i] = (r[i] - c[i] * m[i + 1]) / b[i];
  }
  return (x: number) => {
    if (x <= p[0].x) return p[0].y;
    if (x >= p[n - 1].x) return p[n - 1].y;
    let k = 0;
    while (k < n - 2 && x > p[k + 1].x) k++;
    const h = p[k + 1].x - p[k].x;
    if (!(h > 0)) return p[k].y;
    const t = (x - p[k].x) / h;
    const lin = p[k].y + (p[k + 1].y - p[k].y) * t;
    if (interp !== 'spline' || n < 3) return lin;
    const A = 1 - t;
    return lin + ((A * A * A - A) * m[k] + (t * t * t - t) * m[k + 1]) * (h * h) / 6;
  };
}

// The derivative of order 1 or 2 at every point of `idx` (rows in X order), from those points only.
export function derivative(x: ArrayLike<number>, y: ArrayLike<number>, idx: number[], order: 1 | 2, method: DiffMethod, window = 5, poly = 2): Map<number, number> {
  const out = new Map<number, number>();
  const n = idx.length;
  if (n < 2) return out;
  if (method === 'sg') {
    const half = Math.max(1, Math.floor(window / 2));
    const p = Math.max(order, Math.min(poly, 2 * half));
    for (let k = 0; k < n; k++) {
      // the window: half points each side, moved inward at the ends
      const a = Math.max(0, Math.min(k - half, n - 1 - 2 * half));
      const b = Math.min(n - 1, a + 2 * half);
      const c = polyAt(x, y, idx.slice(a, b + 1), x[idx[k]], p);
      out.set(idx[k], c ? (order === 1 ? c[1] : 2 * (c[2] ?? 0)) : NaN);
    }
    return out;
  }
  const first = (vals: ArrayLike<number> | Map<number, number>): Map<number, number> => {
    const v = (i: number) => (vals instanceof Map ? (vals.get(i) ?? NaN) : vals[i]);
    const d = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      const s = (j0: number, j1: number) => (v(j1) - v(j0)) / (x[j1] - x[j0]);
      const left = k > 0 ? s(idx[k - 1], i) : NaN;
      const right = k < n - 1 ? s(i, idx[k + 1]) : NaN;
      d.set(i, k === 0 ? right : k === n - 1 ? left : (left + right) / 2);
    }
    return d;
  };
  const d1 = first(y);
  return order === 1 ? d1 : first(d1);
}

// The coefficients of a polynomial of degree p fitted to the points (x − x0, y): c0 + c1·t + c2·t² …
function polyAt(x: ArrayLike<number>, y: ArrayLike<number>, rows: number[], x0: number, p: number): number[] | null {
  const m = p + 1;
  const A = Array.from({ length: m }, () => new Float64Array(m));
  const B = new Float64Array(m);
  for (const i of rows) {
    const t = x[i] - x0;
    const pw = new Float64Array(2 * m);
    pw[0] = 1;
    for (let j = 1; j < 2 * m; j++) pw[j] = pw[j - 1] * t;
    for (let r = 0; r < m; r++) {
      B[r] += pw[r] * y[i];
      for (let c = 0; c < m; c++) A[r][c] += pw[r + c];
    }
  }
  // Gauss elimination with partial pivoting
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (!(Math.abs(A[piv][col]) > 1e-300)) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [B[col], B[piv]] = [B[piv], B[col]];
    for (let r = col + 1; r < m; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < m; c++) A[r][c] -= f * A[col][c];
      B[r] -= f * B[col];
    }
  }
  const c = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = B[r];
    for (let k = r + 1; k < m; k++) s -= A[r][k] * c[k];
    c[r] = s / A[r][r];
  }
  return c;
}

export type IntegralOptions = { area: 'signed' | 'abs'; baseline: Baseline; base: number; curve?: ((x: number) => number) | null; opts?: BaseOptions };
// The cumulative integral over the rows of one region (in X order) starting from `start`, and the area of the region.
// baseAt: the baseline under a row of the region.
export function integrate(x: ArrayLike<number>, y: ArrayLike<number>, rows: number[], o: IntegralOptions, start = 0): { cum: Map<number, number>; area: number; baseAt: (i: number) => number } {
  const cum = new Map<number, number>();
  if (!rows.length) return { cum, area: 0, baseAt: () => NaN };
  // the baseline under every point of the region (the line: between its first and last points, unless more are averaged)
  const arr = baselineOf(o.baseline, rows.map((i) => x[i]), rows.map((i) => y[i]), { ...o.opts, ends: o.opts?.ends ?? (o.baseline === 'line' ? 1 : undefined) }, { value: o.base, curve: o.curve });
  const at = new Map(rows.map((i, k) => [i, arr[k]]));
  const base = (i: number) => at.get(i) ?? NaN;
  const h = (i: number) => {
    const v = y[i] - base(i);
    return o.area === 'abs' ? Math.abs(v) : v;
  };
  let s = start;
  cum.set(rows[0], s);
  for (let k = 1; k < rows.length; k++) {
    const [a, b] = [rows[k - 1], rows[k]];
    const ha = h(a);
    const hb = h(b);
    const dx = x[b] - x[a];
    // absolute area across a zero: the two triangles, not their difference
    if (o.area === 'abs' && y[a] - base(a) !== 0 && Math.sign(y[a] - base(a)) !== Math.sign(y[b] - base(b))) {
      const fa = Math.abs(y[a] - base(a));
      const fb = Math.abs(y[b] - base(b));
      s += (dx * (fa * fa + fb * fb)) / (2 * (fa + fb));
    } else s += (dx * (ha + hb)) / 2;
    cum.set(b, s);
  }
  return { cum, area: s - start, baseAt: base };
}

// The rows (of `idx`, in X order) inside each region, in the order of X; `index`: its place in the list (reg1 = 0 …, its
// name and colour whatever its place on X); no regions: all of them as one (index −1).
export function regionRows(x: ArrayLike<number>, idx: number[], regions: Region[]): { region: Region; rows: number[]; index: number }[] {
  if (!regions.length) return [{ region: { lo: idx.length ? x[idx[0]] : NaN, hi: idx.length ? x[idx[idx.length - 1]] : NaN }, rows: idx, index: -1 }];
  return regions
    .map((r, index) => {
      const [a, b] = [Number.isFinite(r.lo) ? r.lo : -Infinity, Number.isFinite(r.hi) ? r.hi : Infinity];
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      return { region: { lo, hi }, rows: idx.filter((i) => x[i] >= lo && x[i] <= hi), index };
    })
    .sort((p, q) => p.region.lo - q.region.lo);
}
export const regionName = (index: number) => (index < 0 ? 'all X' : `range ${index + 1}`);

// Linear interpolation of (xs, ys), xs ascending, at v; NaN outside [xs[0], xs[last]].
export function interp(xs: ArrayLike<number>, ys: ArrayLike<number>, v: number): number {
  const n = xs.length;
  if (!n || !(v >= xs[0] && v <= xs[n - 1])) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= v) lo = m;
    else hi = m;
  }
  const dx = xs[hi] - xs[lo];
  return dx > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (v - xs[lo])) / dx : ys[lo];
}

// The area between two curves (f and its baseline g) over [lo, hi]: both sampled on the union of their X (each by
// linear interpolation, only where both exist), the trapezoid rule on f − g, cumulative; abs: every part positive (the
// two triangles at a crossing).
export function areaBetween(f: { x: number[]; y: number[] }, g: { x: number[]; y: number[] }, lo: number, hi: number, abs: boolean, start = 0): { x: number[]; y: number[]; b: number[]; cum: number[]; area: number } {
  const a = Math.max(lo, f.x[0], g.x[0]);
  const z = Math.min(hi, f.x[f.x.length - 1], g.x[g.x.length - 1]);
  const xs = [...new Set([a, z, ...f.x.filter((v) => v > a && v < z), ...g.x.filter((v) => v > a && v < z)])].filter(Number.isFinite).sort((p, q) => p - q);
  const out = { x: [] as number[], y: [] as number[], b: [] as number[], cum: [] as number[], area: 0 };
  if (!(z > a) || xs.length < 2) return out;
  let s = start;
  for (let k = 0; k < xs.length; k++) {
    const fy = interp(f.x, f.y, xs[k]);
    const gy = interp(g.x, g.y, xs[k]);
    if (k > 0) {
      const dx = xs[k] - xs[k - 1];
      const [ha, hb] = [out.y[k - 1] - out.b[k - 1], fy - gy];
      if (abs && ha !== 0 && Math.sign(ha) !== Math.sign(hb)) s += (dx * (ha * ha + hb * hb)) / (2 * (Math.abs(ha) + Math.abs(hb)));
      else s += (dx * (abs ? Math.abs(ha) + Math.abs(hb) : ha + hb)) / 2;
    }
    out.x.push(xs[k]);
    out.y.push(fy);
    out.b.push(gy);
    out.cum.push(s);
  }
  out.area = s - start;
  return out;
}
