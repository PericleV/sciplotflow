// The baselines of Peak analyzer, Integrate and Peak width — one list, the same everywhere: computed on the points of a
// range (X ascending). Simple ones: y = 0, a value, the straight line between the ends (each end the mean of a few
// points), the lowest point, the rubber band (the lower hull), points placed by hand, another curve. Found from the data
// (the peaks left above, or the dips below with `under: 'dips'`): an iterative polynomial (the points above the
// polynomial brought down to it, again and again), asymmetric least squares (a smooth curve, the points above it weighed
// p, those below 1 − p), airPLS (the weights of the points above set to 0, those below growing at every pass), SNIP (each
// point lowered to the mean of its neighbours at 1, 2 … w points, on the log-log-square-root scale or not). For
// photoelectron spectra: Shirley (the background at every X proportional to the area of the peak on one side of it, found
// again until it stays) and Tougaard (the electrons that lost energy: the spectrum convolved with the universal
// cross-section B·T / (C + T²)², B set so that it meets the data at the far end). Pure.

export type BaseMethod = 'zero' | 'value' | 'line' | 'lowest' | 'rubber' | 'points' | 'curve' | 'poly' | 'asls' | 'airpls' | 'snip' | 'shirley' | 'tougaard';
export type BaseOptions = {
  ends?: number; // line, Shirley, Tougaard: the points averaged at each end (absent or 0: by the number of points)
  under?: 'peaks' | 'dips'; // lowest, rubber, polynomial, ALS, airPLS, SNIP: the baseline under the peaks or over the dips
  order?: number; // polynomial: its degree
  lambda?: number; // ALS, airPLS: the smoothness, log10 λ
  p?: number; // ALS: the weight of the points above
  width?: number; // SNIP: the widest window, in points each side (absent: the points / 20)
  lls?: boolean; // SNIP: on the log-log-square-root scale (absent: yes)
  c?: number; // Tougaard: C of the cross-section (eV², with X in eV)
  losses?: 'up' | 'down'; // Tougaard: the energy losses toward a higher X (binding energy) or a lower X (kinetic energy)
};
export const BASE_OPTION_DEFAULTS = { order: 3, lambda: 5, p: 0.01, c: 1643 };
// the methods with their options found from the data (no value, points or curve given)
export const FOUND_METHODS: BaseMethod[] = ['poly', 'asls', 'airpls', 'snip', 'shirley', 'tougaard'];
// the methods that may go under the peaks or over the dips
export const SIDED_METHODS: BaseMethod[] = ['lowest', 'rubber', 'poly', 'asls', 'airpls', 'snip'];

// The baseline at every point (X ascending). value: of 'value'; curve: of 'points' and 'curve' (flat beyond its ends).
export function baselineOf(method: BaseMethod, X: ArrayLike<number>, Y: ArrayLike<number>, o: BaseOptions = {}, at: { value?: number; curve?: ((x: number) => number) | null } = {}): number[] {
  const n = Math.min(X.length, Y.length);
  const x = Array.from({ length: n }, (_, i) => X[i]);
  if (!n) return [];
  if (method === 'zero') return x.map(() => 0);
  if (method === 'value') return x.map(() => at.value ?? 0);
  if (method === 'points' || method === 'curve') return at.curve ? x.map(at.curve) : x.map(() => 0);
  const y = Array.from({ length: n }, (_, i) => Y[i]);
  if (method === 'line') return endsLine(x, y, o.ends);
  if (method === 'shirley') return shirley(x, y, o.ends);
  if (method === 'tougaard') return tougaard(x, y, o);
  // the one-sided methods: the dips turned into peaks, and back
  const flip = o.under === 'dips' && SIDED_METHODS.includes(method);
  const v = flip ? y.map((q) => -q) : y;
  let b: number[];
  if (method === 'lowest') {
    let m = Infinity;
    for (const q of v) if (q < m) m = q;
    b = v.map(() => m);
  } else if (method === 'rubber') b = rubberBand(x, v);
  else if (method === 'poly') b = iterPoly(x, v, o.order ?? BASE_OPTION_DEFAULTS.order);
  else if (method === 'asls') b = asls(v, 10 ** (o.lambda ?? BASE_OPTION_DEFAULTS.lambda), o.p ?? BASE_OPTION_DEFAULTS.p);
  else if (method === 'airpls') b = airpls(v, 10 ** (o.lambda ?? BASE_OPTION_DEFAULTS.lambda));
  else if (method === 'snip') b = snip(v, o.width ?? Math.max(2, Math.round(n / 20)), o.lls !== false);
  else b = v.map(() => 0);
  return flip ? b.map((q) => -q) : b;
}

// the number of points averaged at each end: given, or by the number of points (1 to 5)
const endCount = (n: number, ends?: number) => Math.max(1, Math.min(Math.floor(n / 2) || 1, ends && ends > 0 ? Math.round(ends) : Math.min(5, Math.floor(n / 50))));
function endLevels(x: number[], y: number[], ends?: number) {
  const n = x.length;
  const m = endCount(n, ends);
  const avg = (from: number, to: number) => {
    let [sx, sy] = [0, 0];
    for (let i = from; i < to; i++) [sx, sy] = [sx + x[i], sy + y[i]];
    return [sx / (to - from), sy / (to - from)];
  };
  const [x0, y0] = avg(0, m);
  const [x1, y1] = avg(n - m, n);
  return { x0, y0, x1, y1, m };
}

// the straight line through the means of the ends
function endsLine(x: number[], y: number[], ends?: number): number[] {
  const { x0, y0, x1, y1 } = endLevels(x, y, ends);
  return x.map((v) => (x1 === x0 ? y0 : y0 + ((y1 - y0) * (v - x0)) / (x1 - x0)));
}

// the lower convex hull, through which the data hang
export function rubberBand(x: number[], y: number[]): number[] {
  const hull: number[] = [];
  for (let i = 0; i < x.length; i++) {
    while (hull.length >= 2) {
      const [a, b] = [hull[hull.length - 2], hull[hull.length - 1]];
      if ((x[b] - x[a]) * (y[i] - y[a]) - (y[b] - y[a]) * (x[i] - x[a]) <= 0) hull.pop();
      else break;
    }
    hull.push(i);
  }
  const f = curveThrough(hull.map((i) => x[i]), hull.map((i) => y[i]));
  return x.map(f);
}

// the straight lines through (px, py) — ascending px —, flat beyond the ends
export function curveThrough(px: ArrayLike<number>, py: ArrayLike<number>): (x: number) => number {
  const n = px.length;
  if (!n) return () => 0;
  return (x: number) => {
    if (!(x > px[0])) return py[0];
    if (x >= px[n - 1]) return py[n - 1];
    let [lo, hi] = [0, n - 1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (px[m] <= x) lo = m;
      else hi = m;
    }
    const d = px[hi] - px[lo];
    return d > 0 ? py[lo] + ((py[hi] - py[lo]) * (x - px[lo])) / d : py[lo];
  };
}

// the polynomial of degree k fitted by least squares (X scaled to −1 … 1), at every point; null when singular
function polyFit(t: number[], y: number[], k: number): number[] | null {
  const m = k + 1;
  const A = Array.from({ length: m }, () => new Float64Array(m));
  const B = new Float64Array(m);
  const pw = new Float64Array(2 * m);
  for (let i = 0; i < t.length; i++) {
    pw[0] = 1;
    for (let j = 1; j < 2 * m; j++) pw[j] = pw[j - 1] * t[i];
    for (let r = 0; r < m; r++) {
      B[r] += pw[r] * y[i];
      for (let c = 0; c < m; c++) A[r][c] += pw[r + c];
    }
  }
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
    for (let j = r + 1; j < m; j++) s -= A[r][j] * c[j];
    c[r] = s / A[r][r];
  }
  return t.map((v) => {
    let s = 0;
    for (let j = m - 1; j >= 0; j--) s = s * v + c[j];
    return s;
  });
}

// the iterative polynomial: fitted, the points above it brought down to it, fitted again — until it stays
function iterPoly(x: number[], y: number[], order: number): number[] {
  const n = x.length;
  const k = Math.max(0, Math.min(Math.round(order), n - 1, 12));
  const [a, b] = [x[0], x[n - 1]];
  const t = x.map((v) => (b > a ? (2 * (v - a)) / (b - a) - 1 : 0));
  let z = y.slice();
  let fit = polyFit(t, z, k);
  if (!fit) return y.map(() => 0);
  for (let it = 0; it < 200; it++) {
    const next = z.map((v, i) => Math.min(v, fit![i]));
    const f2 = polyFit(t, next, k);
    if (!f2) break;
    let [num, den] = [0, 0];
    for (let i = 0; i < n; i++) [num, den] = [num + (f2[i] - fit[i]) ** 2, den + fit[i] ** 2];
    z = next;
    fit = f2;
    if (num <= 1e-12 * (den || 1)) break;
  }
  return fit;
}

// (W + λ·DᵀD) z = W y, D the second differences: a symmetric band of width 2 solved as L·D·Lᵀ
function whittaker(y: number[], w: ArrayLike<number>, lambda: number): number[] {
  const n = y.length;
  if (n < 3) return y.slice();
  const a0 = new Float64Array(n);
  const a1 = new Float64Array(n);
  const a2 = new Float64Array(n);
  // DᵀD: the diagonal 1 5 6 … 6 5 1, beside it −2 −4 … −4 −2, then 1
  for (let i = 0; i < n - 2; i++) {
    const c = [1, -2, 1];
    for (let r = 0; r < 3; r++) {
      a0[i + r] += lambda * c[r] * c[r];
      if (r < 2) a1[i + r] += lambda * c[r] * c[r + 1];
      if (r < 1) a2[i + r] += lambda * c[r] * c[r + 2];
    }
  }
  for (let i = 0; i < n; i++) a0[i] += w[i];
  const d = new Float64Array(n);
  const l1 = new Float64Array(n);
  const l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    l2[i] = i >= 2 ? a2[i - 2] / d[i - 2] : 0;
    l1[i] = i >= 1 ? (a1[i - 1] - (i >= 2 ? l2[i] * d[i - 2] * l1[i - 1] : 0)) / d[i - 1] : 0;
    d[i] = a0[i] - (i >= 1 ? l1[i] * l1[i] * d[i - 1] : 0) - (i >= 2 ? l2[i] * l2[i] * d[i - 2] : 0);
    if (!(Math.abs(d[i]) > 0)) d[i] = 1e-300;
  }
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = w[i] * y[i] - (i >= 1 ? l1[i] * z[i - 1] : 0) - (i >= 2 ? l2[i] * z[i - 2] : 0);
  for (let i = 0; i < n; i++) z[i] /= d[i];
  for (let i = n - 1; i >= 0; i--) z[i] -= (i + 1 < n ? l1[i + 1] * z[i + 1] : 0) + (i + 2 < n ? l2[i + 2] * z[i + 2] : 0);
  return Array.from(z);
}

// asymmetric least squares: the points above the curve weighed p, those below 1 − p, until the weights stay
function asls(y: number[], lambda: number, p: number): number[] {
  const n = y.length;
  const pp = Math.min(0.5, Math.max(1e-6, p));
  let w = new Float64Array(n).fill(1);
  let z = y.slice();
  for (let it = 0; it < 50; it++) {
    z = whittaker(y, w, lambda);
    const next = Float64Array.from(y, (v, i) => (v > z[i] ? pp : 1 - pp));
    let same = true;
    for (let i = 0; i < n && same; i++) if (next[i] !== w[i]) same = false;
    w = next;
    if (same) break;
  }
  return z;
}

// airPLS: the points above weigh 0, those below exp(t·|d| / Σ|d below|) at pass t, until the part below is small
function airpls(y: number[], lambda: number): number[] {
  const n = y.length;
  const w = new Float64Array(n).fill(1);
  let total = 0;
  for (const v of y) total += Math.abs(v);
  let z = y.slice();
  for (let t = 1; t <= 15; t++) {
    z = whittaker(y, w, lambda);
    let dssn = 0;
    let top = -Infinity;
    for (let i = 0; i < n; i++) {
      const d = y[i] - z[i];
      if (d < 0) {
        dssn -= d;
        if (d > top) top = d;
      }
    }
    if (dssn < 0.001 * total || t === 15) break;
    for (let i = 0; i < n; i++) {
      const d = y[i] - z[i];
      w[i] = d >= 0 ? 0 : Math.exp((t * -d) / dssn);
    }
    w[0] = w[n - 1] = Math.exp((t * top) / dssn);
  }
  return z;
}

// SNIP: every point lowered to the mean of its neighbours p points away, p = 1 … w (the clipping window widened)
function snip(y: number[], width: number, lls: boolean): number[] {
  const n = y.length;
  const m = Math.max(1, Math.min(Math.round(width), Math.floor((n - 1) / 2)));
  // the log-log-square-root scale (the data lifted above 0 first)
  let low = 0;
  for (const v of y) if (v < low) low = v;
  const fwd = (v: number) => (lls ? Math.log(Math.log(Math.sqrt(v - low + 1) + 1) + 1) : v);
  const back = (v: number) => (lls ? (Math.exp(Math.exp(v) - 1) - 1) ** 2 - 1 + low : v);
  let v = y.map(fwd);
  for (let p = 1; p <= m; p++) {
    const next = v.slice();
    for (let i = p; i < n - p; i++) next[i] = Math.min(v[i], (v[i - p] + v[i + p]) / 2);
    v = next;
  }
  return v.map(back);
}

// the area of (y − b) from every point to the last (trapezoids)
function areaToEnd(x: number[], y: number[], b: number[]): Float64Array {
  const n = x.length;
  const q = new Float64Array(n);
  for (let i = n - 2; i >= 0; i--) q[i] = q[i + 1] + ((y[i] - b[i] + y[i + 1] - b[i + 1]) / 2) * (x[i + 1] - x[i]);
  return q;
}

// Shirley: B(x) = yR + (yL − yR)·Q(x) / Q(start), Q(x) the area of the data over B from x to the end — found again
// until it stays; the levels the means of the ends
function shirley(x: number[], y: number[], ends?: number): number[] {
  const n = x.length;
  const { y0: yL, y1: yR } = endLevels(x, y, ends);
  let b = y.map(() => Math.min(yL, yR));
  let span = 0;
  for (const v of y) span = Math.max(span, Math.abs(v - yR), Math.abs(v - yL));
  for (let it = 0; it < 100; it++) {
    const q = areaToEnd(x, y, b);
    if (!(Math.abs(q[0]) > 0)) return endsLine(x, y, ends);
    const next = Array.from(q, (v) => yR + ((yL - yR) * v) / q[0]);
    let change = 0;
    for (let i = 0; i < n; i++) change = Math.max(change, Math.abs(next[i] - b[i]));
    b = next;
    if (change <= 1e-9 * (span || 1)) break;
  }
  return b;
}

// Tougaard: B(x) = y_start + s·∫ K(x − x′)·(y(x′) − y_start) dx′ over the points before x (toward the losses),
// K(T) = T / (C + T²)², s such that B reaches the level of the far end
function tougaard(x0: number[], y0: number[], o: BaseOptions): number[] {
  const down = o.losses === 'down';
  // the losses toward a lower X: the same, mirrored
  const x = down ? x0.map((v) => -v).reverse() : x0;
  const y = down ? y0.slice().reverse() : y0;
  const n = x.length;
  const C = o.c && o.c > 0 ? o.c : BASE_OPTION_DEFAULTS.c;
  const { y0: yS, y1: yE } = endLevels(x, y, o.ends);
  // the trapezoid weight of every point
  const dx = x.map((_, k) => ((k + 1 < n ? x[k + 1] : x[k]) - (k > 0 ? x[k - 1] : x[k])) / 2);
  const j = y.map((v) => v - yS);
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < i; k++) {
      const T = x[i] - x[k];
      acc += (T / (C + T * T) ** 2) * j[k] * dx[k];
    }
    s[i] = acc;
  }
  const scale = Math.abs(s[n - 1]) > 0 ? (yE - yS) / s[n - 1] : 0;
  const b = Array.from(s, (v) => yS + scale * v);
  return down ? b.reverse() : b;
}
