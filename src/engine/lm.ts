// Levenberg–Marquardt least squares with a forward-difference Jacobian, and the covariance of the
// parameters at the solution: σ² (JᵀJ)⁻¹ with σ² = SSR / (m − n): the standard errors reported.
import { ibeta } from './dist.ts';

export type LmResult = {
  p: number[];
  ssr: number; // sum of squared (weighted) residuals
  cov: number[][] | null; // covariance of the parameters (scaled by the reduced χ²)
  sigma: number[]; // standard errors: √diag(cov)
  iterations: number;
};

// Solves A x = b by Gaussian elimination with partial pivoting (A is n×n).
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (!(Math.abs(M[piv][c]) > 1e-300)) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// The inverse of a symmetric positive matrix (null when singular).
export function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const c = solve(A, A.map((_, i) => (i === j ? 1 : 0)));
    if (!c) return null;
    cols.push(c);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}

const ssq = (r: Float64Array) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += r[i] * r[i];
  return s;
};

export function levenbergMarquardt(residual: (p: number[]) => Float64Array, p0: number[], constrain: (p: number[]) => number[] = (p) => p, maxIter = 300): LmResult {
  let p = constrain(p0.slice());
  let r = residual(p);
  let ssr = ssq(r);
  const n = p.length;
  const m = r.length;
  let lambda = 1e-3;
  let J: Float64Array[] = [];
  let iterations = 0;
  const jacobian = () => {
    J = p.map((pj, j) => {
      const h = 1e-7 * Math.max(Math.abs(pj), 1e-3);
      const q = p.slice();
      q[j] = pj + h;
      const rh = residual(q);
      const col = new Float64Array(m);
      for (let i = 0; i < m; i++) col[i] = (rh[i] - r[i]) / h;
      return col;
    });
  };
  const dot = (a: Float64Array, b: Float64Array) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  };
  const normal = () => {
    const JtJ = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let a = 0; a < n; a++) for (let b = a; b < n; b++) JtJ[a][b] = JtJ[b][a] = dot(J[a], J[b]);
    const Jtr = J.map((col) => dot(col, r));
    return { JtJ, Jtr };
  };
  if (n > 0 && m >= n && Number.isFinite(ssr)) {
    for (; iterations < maxIter; iterations++) {
      jacobian();
      const { JtJ, Jtr } = normal();
      let improved = false;
      while (lambda < 1e12) {
        const A = JtJ.map((row, i) => row.map((v, k) => (i === k ? v + lambda * (v || 1e-12) : v)));
        const step = solve(A, Jtr.map((v) => -v));
        if (step && step.every(Number.isFinite)) {
          const q = constrain(p.map((v, i) => v + step[i]));
          const rq = residual(q);
          const sq = ssq(rq);
          if (Number.isFinite(sq) && sq < ssr) {
            const gain = (ssr - sq) / Math.max(ssr, 1e-300);
            [p, r, ssr] = [q, rq, sq];
            lambda = Math.max(lambda / 3, 1e-12);
            improved = gain > 1e-12;
            break;
          }
        }
        lambda *= 4;
      }
      if (!improved) break;
    }
  }
  let cov: number[][] | null = null;
  let sigma = p.map(() => NaN);
  if (n > 0 && m > n) {
    jacobian();
    const inv = invert(normal().JtJ);
    if (inv) {
      const s2 = ssr / (m - n);
      cov = inv.map((row) => row.map((v) => v * s2));
      sigma = cov.map((row, j) => Math.sqrt(Math.abs(row[j])));
    }
  }
  return { p, ssr, cov, sigma, iterations };
}

// ---- Student's t: the quantile for confidence bands (the regularized incomplete beta of dist.ts) ----
// P(T ≤ t) with ν degrees of freedom
export function tCdf(t: number, nu: number): number {
  const p = 0.5 * ibeta(nu / 2, 0.5, nu / (nu + t * t));
  return t >= 0 ? 1 - p : p;
}
// the t with P(T ≤ t) = q
export function tQuantile(q: number, nu: number): number {
  if (!(nu > 0)) return NaN;
  let [lo, hi] = [-1e3, 1e3];
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, nu) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
