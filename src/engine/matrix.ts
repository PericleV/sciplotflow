// Matrices: a value of
// its own on the matrix ports — m × n numbers, row by row, and optionally the X of every column and the Y of every row
// (a map) and their names. The Matrix node makes one (typed, generated, from a dataset); Matrix computation applies
// operations to them, one or several in a chain; Contour / heatmap draws one. The linear algebra: LU with partial pivoting
// (A = P·L·U), Householder QR (the diagonal of R made of the reflections' signs), Cholesky, the eigenvalues of a symmetric matrix by
// Jacobi rotations (ascending, as eigh) and of any other by Householder reduction to Hessenberg form and the shifted
// double-step QR algorithm (EISPACK's orthes and hqr2, after the public-domain JAMA; the vectors of the real ones by
// inverse iteration), the SVD by one-sided Jacobi rotations. Pure.
import { compile } from './expr.ts';
import { pick } from './extract.ts';
import { parseRows } from './rows.ts';
import { selectRows, type RowSelect } from './rowsel.ts';
import { column, fmtNum, roleOf, type Column, type Dataset } from './table.ts';

export type Matrix = {
  name: string;
  rows: number;
  cols: number;
  v: Float64Array; // v[i·cols + j]: row i, column j
  xs?: number[]; // the X of every column (a map)
  ys?: number[]; // the Y of every row
  colNames?: string[];
  rowNames?: string[];
  xName?: string; // what X and Y are (“Wavelength (nm)”)
  yName?: string;
};

const EPS = 2.220446049250313e-16;
export const MAX_CELLS = 4_000_000;
export const dims = (A: Matrix) => `${A.rows} × ${A.cols}`;
export const newMatrix = (rows: number, cols: number, name = 'M', v?: Float64Array): Matrix => ({ name, rows, cols, v: v ?? new Float64Array(rows * cols) });
const get = (A: Matrix, i: number, j: number) => A.v[i * A.cols + j];
export const isVector = (A: Matrix) => A.rows === 1 || A.cols === 1;
const square = (A: Matrix, what: string) => (A.rows === A.cols ? null : `${what} needs a square matrix (this one is ${dims(A)}).`);
export function identity(n: number, name = 'I'): Matrix {
  const M = newMatrix(n, n, name);
  for (let i = 0; i < n; i++) M.v[i * n + i] = 1;
  return M;
}
export const fromNumber = (x: number, name = String(x)): Matrix => newMatrix(1, 1, name, Float64Array.of(x));
export function fromColumn(c: Column): Matrix {
  return { name: c.name, rows: c.values.length, cols: 1, v: Float64Array.from(c.values), colNames: [c.name] };
}
// the names and coordinates of A kept on a result of the same size
function keep(A: Matrix, R: Matrix): Matrix {
  if (A.rows !== R.rows || A.cols !== R.cols) return R;
  return { ...R, ...(A.xs ? { xs: A.xs } : {}), ...(A.ys ? { ys: A.ys } : {}), ...(A.colNames ? { colNames: A.colNames } : {}), ...(A.rowNames ? { rowNames: A.rowNames } : {}), ...(A.xName ? { xName: A.xName } : {}), ...(A.yName ? { yName: A.yName } : {}) };
}

// ---- element by element ----
// broadcasting: the same size, or one of them a single row, a single column or a single value
export function elementwise(A: Matrix, B: Matrix, f: (a: number, b: number) => number, sym: string): Matrix | string {
  const r = A.rows === B.rows ? A.rows : A.rows === 1 ? B.rows : B.rows === 1 ? A.rows : -1;
  const c = A.cols === B.cols ? A.cols : A.cols === 1 ? B.cols : B.cols === 1 ? A.cols : -1;
  if (r < 0 || c < 0) return `${sym}: A is ${dims(A)}, B is ${dims(B)}: element by element they need the same size (or one of them a single row, a single column or a single value).`;
  const out = newMatrix(r, c, '');
  for (let i = 0; i < r; i++) {
    const ia = (A.rows === 1 ? 0 : i) * A.cols;
    const ib = (B.rows === 1 ? 0 : i) * B.cols;
    for (let j = 0; j < c; j++) out.v[i * c + j] = f(A.v[ia + (A.cols === 1 ? 0 : j)], B.v[ib + (B.cols === 1 ? 0 : j)]);
  }
  return keep(A.rows === r && A.cols === c ? A : B, out);
}
export function mapValues(A: Matrix, f: (a: number) => number): Matrix {
  return keep(A, newMatrix(A.rows, A.cols, '', Float64Array.from(A.v, f)));
}

export function transpose(A: Matrix): Matrix {
  const T = newMatrix(A.cols, A.rows, A.name);
  for (let i = 0; i < A.rows; i++) for (let j = 0; j < A.cols; j++) T.v[j * A.rows + i] = A.v[i * A.cols + j];
  return { ...T, ...(A.ys ? { xs: A.ys } : {}), ...(A.xs ? { ys: A.xs } : {}), ...(A.rowNames ? { colNames: A.rowNames } : {}), ...(A.colNames ? { rowNames: A.colNames } : {}), ...(A.yName ? { xName: A.yName } : {}), ...(A.xName ? { yName: A.xName } : {}) };
}

export function matmul(A: Matrix, B: Matrix): Matrix | string {
  if (A.cols !== B.rows) return `A × B: A is ${dims(A)}, B is ${dims(B)}: B needs as many rows as A has columns (${A.cols}).`;
  const [m, k, n] = [A.rows, A.cols, B.cols];
  const C = newMatrix(m, n, '');
  for (let i = 0; i < m; i++)
    for (let p = 0; p < k; p++) {
      const a = A.v[i * k + p];
      if (a === 0) continue;
      for (let j = 0; j < n; j++) C.v[i * n + j] += a * B.v[p * n + j];
    }
  return { ...C, ...(A.ys ? { ys: A.ys } : {}), ...(A.rowNames ? { rowNames: A.rowNames } : {}), ...(B.xs ? { xs: B.xs } : {}), ...(B.colNames ? { colNames: B.colNames } : {}) };
}

export function kron(A: Matrix, B: Matrix): Matrix | string {
  const [m, n] = [A.rows * B.rows, A.cols * B.cols];
  if (m * n > MAX_CELLS) return `A ⊗ B: ${m} × ${n} is too large.`;
  const K = newMatrix(m, n, '');
  for (let i = 0; i < A.rows; i++)
    for (let j = 0; j < A.cols; j++) {
      const a = A.v[i * A.cols + j];
      for (let k = 0; k < B.rows; k++) for (let l = 0; l < B.cols; l++) K.v[(i * B.rows + k) * n + j * B.cols + l] = a * B.v[k * B.cols + l];
    }
  return K;
}

// ---- LU (A = P·L·U; the pivot the first largest in its column) ----
type LU = { m: number; n: number; a: Float64Array; perm: number[]; sign: number };
function luOf(A: Matrix): LU {
  const [m, n] = [A.rows, A.cols];
  const a = Float64Array.from(A.v);
  const perm = Array.from({ length: m }, (_, i) => i);
  let sign = 1;
  for (let k = 0; k < Math.min(m, n); k++) {
    let p = k;
    let best = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < m; i++) {
      const v = Math.abs(a[i * n + k]);
      if (v > best) [best, p] = [v, i];
    }
    if (p !== k) {
      for (let j = 0; j < n; j++) [a[k * n + j], a[p * n + j]] = [a[p * n + j], a[k * n + j]];
      [perm[k], perm[p]] = [perm[p], perm[k]];
      sign = -sign;
    }
    const piv = a[k * n + k];
    if (piv === 0) continue;
    for (let i = k + 1; i < m; i++) {
      const f = (a[i * n + k] /= piv);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
    }
  }
  return { m, n, a, perm, sign };
}
export function lu(A: Matrix): { L: Matrix; U: Matrix; P: Matrix } {
  const { m, n, a, perm } = luOf(A);
  const k = Math.min(m, n);
  const L = newMatrix(m, k, 'L');
  const U = newMatrix(k, n, 'U');
  for (let i = 0; i < m; i++)
    for (let j = 0; j < k; j++) {
      if (i === j) L.v[i * k + j] = 1;
      else if (i > j) L.v[i * k + j] = a[i * n + j];
    }
  for (let i = 0; i < k; i++) for (let j = i; j < n; j++) U.v[i * n + j] = a[i * n + j];
  // (P·A rows = A's rows perm[0], perm[1] …): A = Pᵀ·L·U — the P given is that Pᵀ
  const P = newMatrix(m, m, 'P');
  perm.forEach((r, i) => (P.v[r * m + i] = 1));
  return { L, U, P };
}
export function det(A: Matrix): number | string {
  const e = square(A, 'The determinant');
  if (e) return e;
  const { n, a, sign } = luOf(A);
  let d = sign;
  for (let i = 0; i < n; i++) d *= a[i * n + i];
  return d;
}
// the 1-norm (the largest column sum), the ∞-norm (the largest row sum)
function norm1(A: Matrix) {
  let best = 0;
  for (let j = 0; j < A.cols; j++) {
    let s = 0;
    for (let i = 0; i < A.rows; i++) s += Math.abs(A.v[i * A.cols + j]);
    best = Math.max(best, s);
  }
  return best;
}
function normInf(A: Matrix) {
  let best = 0;
  for (let i = 0; i < A.rows; i++) {
    let s = 0;
    for (let j = 0; j < A.cols; j++) s += Math.abs(A.v[i * A.cols + j]);
    best = Math.max(best, s);
  }
  return best;
}
// solves the LU of a square A for the columns of B; null when a pivot is 0 (singular)
function luSolve(F: LU, B: Matrix): Matrix | null {
  const { n, a, perm } = F;
  const c = B.cols;
  for (let i = 0; i < n; i++) if (a[i * n + i] === 0) return null;
  const X = newMatrix(n, c, '');
  for (let j = 0; j < c; j++) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = B.v[perm[i] * c + j];
      for (let p = 0; p < i; p++) s -= a[i * n + p] * y[p];
      y[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let p = i + 1; p < n; p++) s -= a[i * n + p] * X.v[p * c + j];
      X.v[i * c + j] = s / a[i * n + i];
    }
  }
  return X;
}
// the reciprocal condition number (1-norm) of A from its inverse, and a warning when it is tiny
const condWarning = (A: Matrix, inv: Matrix, what: string) => {
  const c = norm1(A) * norm1(inv);
  return c > 1e12 || !Number.isFinite(c) ? `${what}: the matrix is nearly singular (condition number ≈ ${c.toExponential(1)}): the result is not reliable.` : '';
};
export function inverse(A: Matrix): { M: Matrix; warning: string } | string {
  const e = square(A, 'The inverse');
  if (e) return e;
  const X = luSolve(luOf(A), identity(A.rows));
  if (!X) return 'The inverse: the matrix is singular (its determinant is 0): try the pseudo-inverse A⁺.';
  const M = { ...X, name: '', ...(A.xs ? { ys: A.xs } : {}), ...(A.ys ? { xs: A.ys } : {}) };
  return { M, warning: condWarning(A, X, 'The inverse') };
}
export function matPower(A: Matrix, k: number): { M: Matrix; warning: string } | string {
  const e = square(A, 'Aⁿ');
  if (e) return e;
  if (!Number.isInteger(k)) return 'Aⁿ: n must be a whole number (element by element: A ^ x).';
  let base = A;
  let warning = '';
  if (k < 0) {
    const inv = inverse(A);
    if (typeof inv === 'string') return inv.replace('The inverse', `A^${k}`);
    [base, warning] = [inv.M, inv.warning];
  }
  let n = Math.abs(k);
  let R = identity(A.rows);
  while (n > 0) {
    if (n & 1) R = matmul(R, base) as Matrix;
    base = matmul(base, base) as Matrix;
    n = Math.floor(n / 2);
  }
  return { M: keep(A, R), warning };
}

// ---- QR (Householder, reduced: Q m × k, R k × n, k = min(m, n); a column already zero below its diagonal is left as
// it is) ----
export function qr(A: Matrix): { Q: Matrix; R: Matrix } {
  const [m, n] = [A.rows, A.cols];
  const k = Math.min(m, n);
  const r = Float64Array.from(A.v);
  const vs: (Float64Array | null)[] = [];
  for (let j = 0; j < k; j++) {
    let below = 0;
    for (let i = j + 1; i < m; i++) below += r[i * n + j] ** 2;
    if (below === 0) {
      vs.push(null);
      continue;
    }
    const x0 = r[j * n + j];
    const norm = Math.sqrt(x0 * x0 + below);
    const alpha = x0 >= 0 ? -norm : norm;
    const v = new Float64Array(m - j);
    v[0] = x0 - alpha;
    for (let i = j + 1; i < m; i++) v[i - j] = r[i * n + j];
    const vv = v.reduce((s, q) => s + q * q, 0);
    for (let c = j; c < n; c++) {
      let s = 0;
      for (let i = j; i < m; i++) s += v[i - j] * r[i * n + c];
      const f = (2 * s) / vv;
      for (let i = j; i < m; i++) r[i * n + c] -= f * v[i - j];
    }
    vs.push(v);
  }
  // Q = H₁ H₂ … H_k applied to the first k columns of I
  const Q = newMatrix(m, k, 'Q');
  for (let i = 0; i < k; i++) Q.v[i * k + i] = 1;
  for (let j = k - 1; j >= 0; j--) {
    const v = vs[j];
    if (!v) continue;
    const vv = v.reduce((s, q) => s + q * q, 0);
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (let i = j; i < m; i++) s += v[i - j] * Q.v[i * k + c];
      const f = (2 * s) / vv;
      for (let i = j; i < m; i++) Q.v[i * k + c] -= f * v[i - j];
    }
  }
  const R = newMatrix(k, n, 'R');
  for (let i = 0; i < k; i++) for (let j = i; j < n; j++) R.v[i * n + j] = r[i * n + j];
  return { Q, R };
}

const symmetric = (A: Matrix) => {
  if (A.rows !== A.cols) return false;
  const n = A.rows;
  let scale = 1e-300;
  for (const q of A.v) if (Math.abs(q) > scale) scale = Math.abs(q);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!(Math.abs(A.v[i * n + j] - A.v[j * n + i]) <= 1e-10 * scale)) return false;
  return true;
};

export function cholesky(A: Matrix): Matrix | string {
  const e = square(A, 'Cholesky');
  if (e) return e;
  if (!symmetric(A)) return 'Cholesky needs a symmetric matrix (A = Aᵀ).';
  const n = A.rows;
  const L = newMatrix(n, n, 'L');
  for (let j = 0; j < n; j++) {
    let s = A.v[j * n + j];
    for (let p = 0; p < j; p++) s -= L.v[j * n + p] ** 2;
    if (!(s > 0)) return 'Cholesky: the matrix is not positive definite (a pivot ≤ 0).';
    const d = Math.sqrt(s);
    L.v[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = A.v[i * n + j];
      for (let p = 0; p < j; p++) t -= L.v[i * n + p] * L.v[j * n + p];
      L.v[i * n + j] = t / d;
    }
  }
  return L;
}

// a vector's sign made definite: its largest component positive
function signFix(V: Matrix) {
  const [n, k] = [V.rows, V.cols];
  for (let j = 0; j < k; j++) {
    let big = 0;
    for (let i = 0; i < n; i++) if (Math.abs(V.v[i * k + j]) > Math.abs(big) + 1e-12) big = V.v[i * k + j];
    if (big < 0) for (let i = 0; i < n; i++) V.v[i * k + j] = -V.v[i * k + j];
  }
}

// ---- the eigenvalues ----
// symmetric: cyclic Jacobi rotations; the values ascending, the vectors in the columns
function jacobiEigen(A: Matrix): { w: number[]; V: Matrix } {
  const n = A.rows;
  const a = Float64Array.from(A.v);
  const V = identity(n, 'vectors');
  const total = a.reduce((s, q) => s + q * q, 0);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off <= EPS * EPS * total * 1e-2 || off === 0) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (apq === 0) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const [akp, akq] = [a[k * n + p], a[k * n + q]];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const [apk, aqk] = [a[p * n + k], a[q * n + k]];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const [vkp, vkq] = [V.v[k * n + p], V.v[k * n + q]];
          V.v[k * n + p] = c * vkp - s * vkq;
          V.v[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i * n + i] - a[j * n + j]);
  const S = newMatrix(n, n, 'vectors');
  order.forEach((o, j) => {
    for (let i = 0; i < n; i++) S.v[i * n + j] = V.v[i * n + o];
  });
  signFix(S);
  return { w: order.map((o) => a[o * n + o]), V: S };
}

// Any square matrix: its eigenvalues (re, im). Reduced to upper Hessenberg form by Householder reflections, then the
// Francis double-step QR algorithm with Wilkinson's exceptional shifts deflates one value or a pair at a time — EISPACK's
// orthes and hqr2 (B. T. Smith et al., Matrix Eigensystem Routines, 1976) as written in JAMA (J. Hicklin, C. Moler,
// P. Webb et al., NIST / MathWorks, public domain), only the values.
function hqrEigen(A: Matrix): { wr: number[]; wi: number[] } | string {
  const n = A.rows;
  const H: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A.v[i * n + j]));
  // ---- to Hessenberg form ----
  const ort = new Array<number>(n).fill(0);
  for (let m = 1; m <= n - 2; m++) {
    let scale = 0;
    for (let i = m; i < n; i++) scale += Math.abs(H[i][m - 1]);
    if (scale === 0) continue;
    // the reflection that zeroes column m − 1 below row m
    let h = 0;
    for (let i = n - 1; i >= m; i--) {
      ort[i] = H[i][m - 1] / scale;
      h += ort[i] * ort[i];
    }
    let g = Math.sqrt(h);
    if (ort[m] > 0) g = -g;
    h -= ort[m] * g;
    ort[m] -= g;
    // H = (I − u uᵀ / h) H (I − u uᵀ / h)
    for (let j = m; j < n; j++) {
      let f = 0;
      for (let i = n - 1; i >= m; i--) f += ort[i] * H[i][j];
      f /= h;
      for (let i = m; i < n; i++) H[i][j] -= f * ort[i];
    }
    for (let i = 0; i < n; i++) {
      let f = 0;
      for (let j = n - 1; j >= m; j--) f += ort[j] * H[i][j];
      f /= h;
      for (let j = m; j < n; j++) H[i][j] -= f * ort[j];
    }
    ort[m] *= scale;
    H[m][m - 1] = scale * g;
  }
  // ---- the QR iterations ----
  const wr = new Array<number>(n).fill(0);
  const wi = new Array<number>(n).fill(0);
  const eps = 2 ** -52;
  let norm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) norm += Math.abs(H[i][j]);
  let hi = n - 1;
  let exshift = 0;
  let iter = 0;
  let total = 0;
  let [p, q, r, s, z] = [0, 0, 0, 0, 0];
  let [x, y, w] = [0, 0, 0];
  while (hi >= 0) {
    // a small subdiagonal element: the block below it split off
    let l = hi;
    while (l > 0) {
      s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
      if (s === 0) s = norm;
      if (Math.abs(H[l][l - 1]) < eps * s) break;
      l--;
    }
    if (l === hi) {
      // one value
      H[hi][hi] += exshift;
      wr[hi] = H[hi][hi];
      wi[hi] = 0;
      hi--;
      iter = 0;
    } else if (l === hi - 1) {
      // two: a real pair or a complex one
      w = H[hi][hi - 1] * H[hi - 1][hi];
      p = (H[hi - 1][hi - 1] - H[hi][hi]) / 2;
      q = p * p + w;
      z = Math.sqrt(Math.abs(q));
      H[hi][hi] += exshift;
      H[hi - 1][hi - 1] += exshift;
      x = H[hi][hi];
      if (q >= 0) {
        z = p >= 0 ? p + z : p - z;
        wr[hi - 1] = x + z;
        wr[hi] = z !== 0 ? x - w / z : x + z;
        wi[hi - 1] = wi[hi] = 0;
      } else {
        wr[hi - 1] = wr[hi] = x + p;
        wi[hi - 1] = z;
        wi[hi] = -z;
      }
      hi -= 2;
      iter = 0;
    } else {
      // the shift: the trailing 2 × 2 block, exceptional ones when it stalls
      x = H[hi][hi];
      y = H[hi - 1][hi - 1];
      w = H[hi][hi - 1] * H[hi - 1][hi];
      if (iter === 10) {
        exshift += x;
        for (let i = 0; i <= hi; i++) H[i][i] -= x;
        s = Math.abs(H[hi][hi - 1]) + Math.abs(H[hi - 1][hi - 2]);
        x = y = 0.75 * s;
        w = -0.4375 * s * s;
      }
      if (iter === 30) {
        s = (y - x) / 2;
        s = s * s + w;
        if (s > 0) {
          s = Math.sqrt(s);
          if (y < x) s = -s;
          s = x - w / ((y - x) / 2 + s);
          for (let i = 0; i <= hi; i++) H[i][i] -= s;
          exshift += s;
          x = y = w = 0.964;
        }
      }
      iter++;
      if (++total > 100 * n + 100) return 'The eigenvalues: the QR algorithm did not converge.';
      // where the double step starts: two consecutive small subdiagonal elements
      let m = hi - 2;
      while (m >= l) {
        z = H[m][m];
        r = x - z;
        s = y - z;
        p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
        q = H[m + 1][m + 1] - z - r - s;
        r = H[m + 2][m + 1];
        s = Math.abs(p) + Math.abs(q) + Math.abs(r);
        p /= s;
        q /= s;
        r /= s;
        if (m === l) break;
        if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) < eps * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) break;
        m--;
      }
      for (let i = m + 2; i <= hi; i++) {
        H[i][i - 2] = 0;
        if (i > m + 2) H[i][i - 3] = 0;
      }
      // the double QR step on rows l … hi, columns m … hi
      for (let k = m; k <= hi - 1; k++) {
        const notLast = k !== hi - 1;
        if (k !== m) {
          p = H[k][k - 1];
          q = H[k + 1][k - 1];
          r = notLast ? H[k + 2][k - 1] : 0;
          x = Math.abs(p) + Math.abs(q) + Math.abs(r);
          if (x === 0) continue;
          p /= x;
          q /= x;
          r /= x;
        }
        s = Math.sqrt(p * p + q * q + r * r);
        if (p < 0) s = -s;
        if (s === 0) continue;
        if (k !== m) H[k][k - 1] = -s * x;
        else if (l !== m) H[k][k - 1] = -H[k][k - 1];
        p += s;
        x = p / s;
        y = q / s;
        z = r / s;
        q /= p;
        r /= p;
        for (let j = k; j < n; j++) {
          p = H[k][j] + q * H[k + 1][j];
          if (notLast) {
            p += r * H[k + 2][j];
            H[k + 2][j] -= p * z;
          }
          H[k][j] -= p * x;
          H[k + 1][j] -= p * y;
        }
        for (let i = 0; i <= Math.min(hi, k + 3); i++) {
          p = x * H[i][k] + y * H[i][k + 1];
          if (notLast) {
            p += z * H[i][k + 2];
            H[i][k + 2] -= p * r;
          }
          H[i][k] -= p;
          H[i][k + 1] -= p * q;
        }
      }
    }
  }
  return { wr, wi };
}

// the vector of a real eigenvalue λ by inverse iteration ((A − λI) x = b, a few times), orthogonal to the vectors
// already found for the same value
function inverseIteration(A: Matrix, lambda: number, others: Float64Array[]): Float64Array {
  const n = A.rows;
  const scale = Math.max(1, norm1(A));
  const M = Float64Array.from(A.v);
  for (let i = 0; i < n; i++) M[i * n + i] -= lambda + scale * 1e-10;
  const F = luOf(newMatrix(n, n, '', M));
  for (let i = 0; i < n; i++) if (F.a[i * n + i] === 0) F.a[i * n + i] = scale * EPS;
  let x = Float64Array.from({ length: n }, (_, i) => 1 + i / (n + 1));
  for (let it = 0; it < 4; it++) {
    for (const o of others) {
      const d = x.reduce((s, q, i) => s + q * o[i], 0);
      x = x.map((q, i) => q - d * o[i]);
    }
    const y = luSolve(F, newMatrix(n, 1, '', x))!.v;
    const nrm = Math.sqrt(y.reduce((s, q) => s + q * q, 0)) || 1;
    x = y.map((q) => q / nrm);
  }
  return x;
}

export type EigResult = { values: Matrix; vectors: Matrix; complex: boolean; symmetric: boolean };
export function eig(A: Matrix): EigResult | string {
  const e = square(A, 'The eigenvalues');
  if (e) return e;
  if (A.v.some((q) => !Number.isFinite(q))) return 'The eigenvalues: the matrix has empty (or infinite) cells.';
  const n = A.rows;
  if (symmetric(A)) {
    const { w, V } = jacobiEigen(A);
    return { values: { ...newMatrix(n, 1, 'eigenvalues', Float64Array.from(w)), colNames: ['λ'] }, vectors: V, complex: false, symmetric: true };
  }
  const h = hqrEigen(A);
  if (typeof h === 'string') return h;
  // ascending by the real part, a pair with its + imaginary part first
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => h.wr[i] - h.wr[j] || h.wi[j] - h.wi[i]);
  const wr = order.map((i) => h.wr[i]);
  const wi = order.map((i) => h.wi[i]);
  const complex = wi.some((q) => q !== 0);
  const values = complex ? { ...newMatrix(n, 2, 'eigenvalues', Float64Array.from(wr.flatMap((r, i) => [r, wi[i]]))), colNames: ['Re λ', 'Im λ'] } : { ...newMatrix(n, 1, 'eigenvalues', Float64Array.from(wr)), colNames: ['λ'] };
  const vectors = newMatrix(n, n, 'vectors');
  vectors.v.fill(NaN);
  const found: { lambda: number; x: Float64Array }[] = [];
  const tol = 1e-8 * Math.max(1, norm1(A));
  wr.forEach((lambda, j) => {
    if (wi[j] !== 0) return;
    const same = found.filter((f) => Math.abs(f.lambda - lambda) <= tol).map((f) => f.x);
    const x = inverseIteration(A, lambda, same);
    found.push({ lambda, x });
    for (let i = 0; i < n; i++) vectors.v[i * n + j] = x[i];
  });
  signFix(vectors);
  return { values, vectors, complex, symmetric: false };
}

// ---- SVD (one-sided Jacobi: A = U·Σ·Vᵀ, U m × k, Σ k × k, V n × k, k = min(m, n); σ descending) ----
export function svd(A: Matrix): { U: Matrix; S: Matrix; V: Matrix; s: number[] } | string {
  if (A.v.some((q) => !Number.isFinite(q))) return 'The SVD: the matrix has empty (or infinite) cells.';
  if (A.rows < A.cols) {
    const r = svd(transpose(A));
    return typeof r === 'string' ? r : { U: { ...r.V, name: 'U' }, S: r.S, V: { ...r.U, name: 'V' }, s: r.s };
  }
  const [m, n] = [A.rows, A.cols];
  const u = Float64Array.from(A.v);
  const v = identity(n).v;
  for (let sweep = 0; sweep < 80; sweep++) {
    let rotated = false;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        let al = 0;
        let be = 0;
        let ga = 0;
        for (let i = 0; i < m; i++) {
          const [x, y] = [u[i * n + p], u[i * n + q]];
          al += x * x;
          be += y * y;
          ga += x * y;
        }
        if (ga === 0 || Math.abs(ga) <= EPS * Math.sqrt(al * be)) continue;
        rotated = true;
        const zeta = (be - al) / (2 * ga);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const [x, y] = [u[i * n + p], u[i * n + q]];
          u[i * n + p] = c * x - s * y;
          u[i * n + q] = s * x + c * y;
        }
        for (let i = 0; i < n; i++) {
          const [x, y] = [v[i * n + p], v[i * n + q]];
          v[i * n + p] = c * x - s * y;
          v[i * n + q] = s * x + c * y;
        }
      }
    if (!rotated) break;
  }
  const sig = Array.from({ length: n }, (_, j) => {
    let s = 0;
    for (let i = 0; i < m; i++) s += u[i * n + j] ** 2;
    return Math.sqrt(s);
  });
  const order = Array.from({ length: n }, (_, j) => j).sort((i, j) => sig[j] - sig[i]);
  const U = newMatrix(m, n, 'U');
  const V = newMatrix(n, n, 'V');
  const S = newMatrix(n, n, 'Σ');
  const tiny = (sig[order[0]] || 0) * Math.max(m, n) * EPS;
  const cols: Float64Array[] = [];
  order.forEach((o, j) => {
    S.v[j * n + j] = sig[o];
    for (let i = 0; i < n; i++) V.v[i * n + j] = v[i * n + o];
    let col: Float64Array;
    if (sig[o] > tiny && sig[o] > 0) col = Float64Array.from({ length: m }, (_, i) => u[i * n + o] / sig[o]);
    else {
      // a zero σ: any unit vector orthogonal to the others (Gram–Schmidt on the unit vectors)
      col = new Float64Array(m);
      for (let e = 0; e < m; e++) {
        const c = new Float64Array(m);
        c[e] = 1;
        for (const q of cols) {
          const d = c.reduce((s, x, i) => s + x * q[i], 0);
          for (let i = 0; i < m; i++) c[i] -= d * q[i];
        }
        const nr = Math.sqrt(c.reduce((s, x) => s + x * x, 0));
        if (nr > 1e-8) {
          col = c.map((x) => x / nr);
          break;
        }
      }
    }
    cols.push(col);
    for (let i = 0; i < m; i++) U.v[i * n + j] = col[i];
  });
  // the signs: every column of V with its largest component positive (U follows)
  for (let j = 0; j < n; j++) {
    let big = 0;
    for (let i = 0; i < n; i++) if (Math.abs(V.v[i * n + j]) > Math.abs(big) + 1e-12) big = V.v[i * n + j];
    if (big < 0) {
      for (let i = 0; i < n; i++) V.v[i * n + j] = -V.v[i * n + j];
      for (let i = 0; i < m; i++) U.v[i * n + j] = -U.v[i * n + j];
    }
  }
  return { U, S, V, s: order.map((o) => sig[o]) };
}
export function pinv(A: Matrix): Matrix | string {
  const r = svd(A);
  if (typeof r === 'string') return r.replace('The SVD', 'The pseudo-inverse');
  const { U, V, s } = r;
  const k = s.length;
  const cut = 1e-15 * (s[0] ?? 0); // the relative cut of the singular values
  const P = newMatrix(A.cols, A.rows, '');
  for (let i = 0; i < A.cols; i++)
    for (let j = 0; j < A.rows; j++) {
      let t = 0;
      for (let p = 0; p < k; p++) if (s[p] > cut) t += (V.v[i * k + p] * U.v[j * k + p]) / s[p];
      P.v[i * A.rows + j] = t;
    }
  return P;
}
export function rank(A: Matrix): number | string {
  const r = svd(A);
  if (typeof r === 'string') return r.replace('The SVD', 'The rank');
  const tol = (r.s[0] ?? 0) * Math.max(A.rows, A.cols) * EPS; // the usual tolerance of the rank
  return r.s.filter((x) => x > tol).length;
}
export type NormKind = 'fro' | '1' | 'inf' | '2' | 'max';
export function norm(A: Matrix, kind: NormKind): number | string {
  switch (kind) {
    case 'fro':
      return Math.sqrt(A.v.reduce((s, q) => s + q * q, 0));
    case '1':
      return norm1(A);
    case 'inf':
      return normInf(A);
    case 'max':
      return A.v.reduce((s, q) => Math.max(s, Math.abs(q)), 0);
    case '2': {
      const r = svd(A);
      return typeof r === 'string' ? r : (r.s[0] ?? 0);
    }
  }
}
export function cond(A: Matrix): number | string {
  const r = svd(A);
  if (typeof r === 'string') return r.replace('The SVD', 'The condition number');
  const lo = r.s[r.s.length - 1];
  return lo > 0 ? r.s[0] / lo : Infinity;
}
export function trace(A: Matrix): number | string {
  const e = square(A, 'The trace');
  if (e) return e;
  let s = 0;
  for (let i = 0; i < A.rows; i++) s += A.v[i * A.cols + i];
  return s;
}
// A·X = B: square A by LU, else the least-squares (minimum norm) solution by the pseudo-inverse
export function solve(A: Matrix, B: Matrix): { M: Matrix; warning: string } | string {
  if (B.rows !== A.rows) return `Solve A·x = B: B needs as many rows as A (${A.rows}; it has ${B.rows}).`;
  if (A.rows === A.cols) {
    const X = luSolve(luOf(A), B);
    if (!X) return 'Solve A·x = B: A is singular (its determinant is 0): no single solution.';
    const inv = luSolve(luOf(A), identity(A.rows))!;
    return { M: { ...X, name: '', ...(B.colNames ? { colNames: B.colNames } : {}) }, warning: condWarning(A, inv, 'Solve A·x = B') };
  }
  const P = pinv(A);
  if (typeof P === 'string') return P;
  return { M: matmul(P, B) as Matrix, warning: `A is ${dims(A)}: the least-squares solution (the smallest x minimizing |A·x − B|).` };
}

export function dot(A: Matrix, B: Matrix): number | string {
  if (!isVector(A) || !isVector(B) || A.v.length !== B.v.length) return `A · B: two vectors of the same length (A is ${dims(A)}, B is ${dims(B)}).`;
  return A.v.reduce((s, q, i) => s + q * B.v[i], 0);
}
export function cross(A: Matrix, B: Matrix): Matrix | string {
  if (!isVector(A) || !isVector(B) || A.v.length !== 3 || B.v.length !== 3) return `A × B (cross): two vectors of 3 values (A is ${dims(A)}, B is ${dims(B)}).`;
  const [a, b] = [A.v, B.v];
  return newMatrix(A.rows, A.cols, '', Float64Array.of(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]));
}

// ---- rearranging ----
export function part(A: Matrix, rows: string, cols: string): Matrix | string {
  const r = rows.trim() ? parseRows(rows, A.rows) : Array.from({ length: A.rows }, (_, i) => i);
  if (typeof r === 'string') return `Rows: ${r}`;
  const c = cols.trim() ? parseRows(cols, A.cols) : Array.from({ length: A.cols }, (_, j) => j);
  if (typeof c === 'string') return `Columns: ${c.replace('write rows', 'write columns').replace('rows count', 'columns count')}`;
  if (!r.length || !c.length) return 'Part: no rows or no columns chosen.';
  const P = newMatrix(r.length, c.length, A.name);
  r.forEach((i, a) => c.forEach((j, b) => (P.v[a * c.length + b] = A.v[i * A.cols + j])));
  return {
    ...P,
    ...(A.xs ? { xs: c.map((j) => A.xs![j]) } : {}),
    ...(A.ys ? { ys: r.map((i) => A.ys![i]) } : {}),
    ...(A.colNames ? { colNames: c.map((j) => A.colNames![j]) } : {}),
    ...(A.rowNames ? { rowNames: r.map((i) => A.rowNames![i]) } : {}),
    ...(A.xName ? { xName: A.xName } : {}),
    ...(A.yName ? { yName: A.yName } : {}),
  };
}
export function flip(A: Matrix, how: 'lr' | 'ud'): Matrix {
  const F = newMatrix(A.rows, A.cols, A.name);
  for (let i = 0; i < A.rows; i++) for (let j = 0; j < A.cols; j++) F.v[i * A.cols + j] = how === 'lr' ? get(A, i, A.cols - 1 - j) : get(A, A.rows - 1 - i, j);
  const rev = <T,>(a?: T[]) => (a ? [...a].reverse() : undefined);
  return how === 'lr' ? { ...keep(A, F), ...(A.xs ? { xs: rev(A.xs) } : {}), ...(A.colNames ? { colNames: rev(A.colNames) } : {}) } : { ...keep(A, F), ...(A.ys ? { ys: rev(A.ys) } : {}), ...(A.rowNames ? { rowNames: rev(A.rowNames) } : {}) };
}
// turned by 90° counterclockwise k times
export function rot90(A: Matrix, k: number): Matrix {
  let M = A;
  const t = ((Math.round(k) % 4) + 4) % 4;
  for (let q = 0; q < t; q++) M = flip(transpose(M), 'ud');
  return M;
}
export function reshape(A: Matrix, r: number, c: number): Matrix | string {
  const [R, C] = [Math.floor(r), Math.floor(c)];
  if (!(R >= 1) || !(C >= 1) || R * C !== A.v.length) return `Reshape: ${R} × ${C} must hold the ${A.v.length} values of A (${dims(A)}).`;
  return newMatrix(R, C, A.name, Float64Array.from(A.v));
}
export function concat(A: Matrix, B: Matrix, how: 'h' | 'v'): Matrix | string {
  if (how === 'h') {
    if (A.rows !== B.rows) return `[A B]: side by side they need as many rows (A ${dims(A)}, B ${dims(B)}).`;
    const M = newMatrix(A.rows, A.cols + B.cols, '');
    for (let i = 0; i < A.rows; i++) {
      for (let j = 0; j < A.cols; j++) M.v[i * M.cols + j] = get(A, i, j);
      for (let j = 0; j < B.cols; j++) M.v[i * M.cols + A.cols + j] = get(B, i, j);
    }
    return { ...M, ...(A.ys ? { ys: A.ys } : {}), ...(A.rowNames ? { rowNames: A.rowNames } : {}), ...(A.xs && B.xs ? { xs: [...A.xs, ...B.xs] } : {}) };
  }
  if (A.cols !== B.cols) return `[A; B]: one under the other they need as many columns (A ${dims(A)}, B ${dims(B)}).`;
  const M = newMatrix(A.rows + B.rows, A.cols, '', Float64Array.from([...A.v, ...B.v]));
  return { ...M, ...(A.xs ? { xs: A.xs } : {}), ...(A.colNames ? { colNames: A.colNames } : {}), ...(A.ys && B.ys ? { ys: [...A.ys, ...B.ys] } : {}) };
}
// a matrix: its diagonal as a column; a vector: the diagonal matrix with it
export function diagonal(A: Matrix): Matrix {
  if (isVector(A) && A.v.length > 1) {
    const n = A.v.length;
    const D = newMatrix(n, n, '');
    for (let i = 0; i < n; i++) D.v[i * n + i] = A.v[i];
    return D;
  }
  const k = Math.min(A.rows, A.cols);
  return newMatrix(k, 1, '', Float64Array.from({ length: k }, (_, i) => get(A, i, i)));
}
export type ReduceFn = 'sum' | 'mean' | 'min' | 'max' | 'prod';
export type Along = 'columns' | 'rows' | 'all';
const reducer = (fn: ReduceFn, vals: number[]) => {
  const f = vals.filter(Number.isFinite);
  if (!f.length) return fn === 'sum' ? 0 : fn === 'prod' ? 1 : NaN;
  if (fn === 'sum') return f.reduce((s, q) => s + q, 0);
  if (fn === 'mean') return f.reduce((s, q) => s + q, 0) / f.length;
  if (fn === 'prod') return f.reduce((s, q) => s * q, 1);
  return f.reduce((s, q) => (fn === 'min' ? Math.min(s, q) : Math.max(s, q)));
};
export function reduce(A: Matrix, fn: ReduceFn, along: Along): Matrix | number {
  if (along === 'all') return reducer(fn, Array.from(A.v));
  if (along === 'columns') {
    const R = newMatrix(1, A.cols, '', Float64Array.from({ length: A.cols }, (_, j) => reducer(fn, Array.from({ length: A.rows }, (_, i) => get(A, i, j)))));
    return { ...R, ...(A.xs ? { xs: A.xs } : {}), ...(A.colNames ? { colNames: A.colNames } : {}) };
  }
  const R = newMatrix(A.rows, 1, '', Float64Array.from({ length: A.rows }, (_, i) => reducer(fn, Array.from({ length: A.cols }, (_, j) => get(A, i, j)))));
  return { ...R, ...(A.ys ? { ys: A.ys } : {}), ...(A.rowNames ? { rowNames: A.rowNames } : {}) };
}

// ---- the operations of Matrix computation ----
export type MatOp =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'pow'
  | 'func'
  | 'formula'
  | 'matmul'
  | 'matpow'
  | 'kron'
  | 'dot'
  | 'cross'
  | 'transpose'
  | 'inverse'
  | 'pinv'
  | 'det'
  | 'trace'
  | 'rank'
  | 'norm'
  | 'cond'
  | 'solve'
  | 'lu'
  | 'qr'
  | 'chol'
  | 'eig'
  | 'svd'
  | 'part'
  | 'flip'
  | 'rot90'
  | 'reshape'
  | 'hcat'
  | 'vcat'
  | 'diag'
  | 'reduce';
export type ElemFn = 'abs' | 'neg' | 'recip' | 'exp' | 'ln' | 'log10' | 'sqrt' | 'square' | 'round';
// one step: its operation, its operands — an input letter (A, B …), an earlier step (@id, or @id.part for a piece of a
// decomposition), or '#' for the number `num` — and the options of its operation
export type MatStep = {
  id: string;
  name?: string; // '' → R1, R2 … by its place
  op: MatOp;
  a: string;
  b?: string;
  num?: number;
  fn?: string; // func: ElemFn; reduce: ReduceFn; norm: NormKind
  along?: Along;
  rows?: string;
  cols?: string;
  r?: number;
  c?: number;
  k?: number; // matpow: n; rot90: times
  how?: 'lr' | 'ud';
  formula?: string;
};
export type MatCompData = { steps: MatStep[] };

// the operations, in groups (the list of the node) — with their symbol and whether they take a second operand
export const OP_GROUPS: { group: string; ops: [MatOp, string][] }[] = [
  { group: 'element by element', ops: [['add', 'A + B'], ['sub', 'A − B'], ['mul', 'A ∘ B (element × element)'], ['div', 'A ⊘ B (element ÷ element)'], ['pow', 'A ^ B (element to a power)'], ['func', 'f(A): abs, exp, ln, √ …'], ['formula', 'formula f(a, b, i, j)']] },
  { group: 'products', ops: [['matmul', 'A × B (matrix product)'], ['matpow', 'Aⁿ (matrix power)'], ['kron', 'A ⊗ B (Kronecker)'], ['dot', 'A · B (dot product of vectors)'], ['cross', 'A × B (cross product, 3 values)']] },
  { group: 'structure', ops: [['transpose', 'Aᵀ (transpose)'], ['inverse', 'A⁻¹ (inverse)'], ['pinv', 'A⁺ (pseudo-inverse)']] },
  { group: 'numbers', ops: [['det', 'det A (determinant)'], ['trace', 'trace A'], ['rank', 'rank A'], ['norm', '‖A‖ (norm)'], ['cond', 'cond A (condition number)']] },
  { group: 'systems', ops: [['solve', 'solve A·x = B']] },
  { group: 'decompositions', ops: [['lu', 'LU: A = P·L·U'], ['qr', 'QR: A = Q·R'], ['chol', 'Cholesky: A = L·Lᵀ'], ['eig', 'eigenvalues and eigenvectors'], ['svd', 'SVD: A = U·Σ·Vᵀ']] },
  { group: 'rearranging', ops: [['part', 'part (rows, columns)'], ['flip', 'flip ↔ / ↕'], ['rot90', 'rotate 90°'], ['reshape', 'reshape r × c'], ['hcat', '[A B] (side by side)'], ['vcat', '[A; B] (one under the other)'], ['diag', 'diagonal ↔ vector']] },
  { group: 'rows / columns', ops: [['reduce', 'sum, mean, min, max, product']] },
];
export const OP_LABEL = Object.fromEntries(OP_GROUPS.flatMap((g) => g.ops)) as Record<MatOp, string>;
const BINARY = new Set<MatOp>(['add', 'sub', 'mul', 'div', 'pow', 'matmul', 'kron', 'dot', 'cross', 'solve', 'hcat', 'vcat']);
export const takesB = (op: MatOp) => BINARY.has(op) || op === 'formula';
// a number allowed as B (element by element)
export const numberB = (op: MatOp) => op === 'add' || op === 'sub' || op === 'mul' || op === 'div' || op === 'pow' || op === 'formula';

// the results of a step: the pieces of a decomposition, else one (key '')
export type PartInfo = { key: string; label: string; kind: 'matrix' | 'scalar' };
export function stepParts(s: MatStep): PartInfo[] {
  switch (s.op) {
    case 'det':
    case 'trace':
    case 'rank':
    case 'norm':
    case 'cond':
    case 'dot':
      return [{ key: '', label: '', kind: 'scalar' }];
    case 'reduce':
      return [{ key: '', label: '', kind: s.along === 'all' ? 'scalar' : 'matrix' }];
    case 'lu':
      return ['L', 'U', 'P'].map((key) => ({ key, label: key, kind: 'matrix' as const }));
    case 'qr':
      return ['Q', 'R'].map((key) => ({ key, label: key, kind: 'matrix' as const }));
    case 'chol':
      return [{ key: 'L', label: 'L', kind: 'matrix' }];
    case 'eig':
      return [
        { key: 'values', label: 'values', kind: 'matrix' },
        { key: 'vectors', label: 'vectors', kind: 'matrix' },
      ];
    case 'svd':
      return [
        { key: 'U', label: 'U', kind: 'matrix' },
        { key: 'S', label: 'Σ', kind: 'matrix' },
        { key: 'V', label: 'V', kind: 'matrix' },
      ];
    default:
      return [{ key: '', label: '', kind: 'matrix' }];
  }
}
// the port of a result, and the name of a step by its place
export const partHandle = (id: string, key: string) => (key ? `s-${id}-${key}` : `s-${id}`);
export const stepName = (s: MatStep, k: number) => s.name?.trim() || `R${k + 1}`;

export type StepResult = { id: string; name: string; parts: { key: string; label: string; value: Matrix | number }[]; error?: string; warnings: string[] };
type Operand = Matrix | number;
const asMatrix = (x: Operand): Matrix => (typeof x === 'number' ? fromNumber(x) : x);

function elemFn(fn: string): ((a: number) => number) | null {
  switch (fn as ElemFn) {
    case 'abs':
      return Math.abs;
    case 'neg':
      return (a) => -a;
    case 'recip':
      return (a) => 1 / a;
    case 'exp':
      return Math.exp;
    case 'ln':
      return Math.log;
    case 'log10':
      return Math.log10;
    case 'sqrt':
      return Math.sqrt;
    case 'square':
      return (a) => a * a;
    case 'round':
      return Math.round;
  }
  return null;
}

// the operations of linear algebra need every cell (element by element, an empty cell stays empty)
const WHOLE = new Set<MatOp>(['matpow', 'inverse', 'pinv', 'det', 'rank', 'cond', 'solve', 'lu', 'qr', 'chol', 'eig', 'svd']);
// one operation on its operands: its results in the order of stepParts, or an error
function apply(s: MatStep, A: Operand, B: Operand | undefined, warn: (w: string) => void): Operand[] | string {
  const a = asMatrix(A);
  if ((WHOLE.has(s.op) || (s.op === 'norm' && s.fn === '2')) && [a, ...(s.op === 'solve' && B !== undefined ? [asMatrix(B)] : [])].some((m) => m.v.some((q) => !Number.isFinite(q)))) return `${OP_LABEL[s.op]}: the matrix has empty (or infinite) cells: fill them first.`;
  const needB = () => (B === undefined ? `${OP_LABEL[s.op]}: choose B.` : null);
  const bin = (f: (x: number, y: number) => number, sym: string) => {
    const e = needB();
    if (e) return e;
    const r = elementwise(a, asMatrix(B!), f, sym);
    return typeof r === 'string' ? r : [r];
  };
  const one = <T,>(r: T | string): T[] | string => (typeof r === 'string' ? r : [r]);
  const withWarning = (r: { M: Matrix; warning: string } | string) => {
    if (typeof r === 'string') return r;
    if (r.warning) warn(r.warning);
    return [r.M];
  };
  switch (s.op) {
    case 'add':
      return bin((x, y) => x + y, 'A + B');
    case 'sub':
      return bin((x, y) => x - y, 'A − B');
    case 'mul':
      return bin((x, y) => x * y, 'A ∘ B');
    case 'div':
      return bin((x, y) => x / y, 'A ⊘ B');
    case 'pow':
      return bin((x, y) => x ** y, 'A ^ B');
    case 'func': {
      const f = elemFn(s.fn ?? 'abs');
      return f ? [mapValues(a, f)] : `Unknown function “${s.fn}”.`;
    }
    case 'formula': {
      const src = (s.formula ?? '').trim();
      if (!src) return 'Write a formula of a (the element of A), b (of B), i, j (its row and column, from 1), m, n (the rows and columns).';
      const f = compile(src);
      if (typeof f === 'string') return f;
      const bad = f.names.filter((x) => !['a', 'b', 'i', 'j', 'm', 'n'].includes(x));
      if (bad.length) return `Unknown name${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: the formula may use a, b, i, j, m, n.`;
      if (f.names.includes('b') && B === undefined) return 'The formula uses b: choose B.';
      const b = B === undefined ? fromNumber(NaN) : asMatrix(B);
      const vars = { a: 0, b: 0, i: 0, j: 0, m: 0, n: 0 };
      // over the broadcast size of A and B
      const shape = elementwise(a, b, () => 0, 'f(a, b)');
      if (typeof shape === 'string') return shape;
      vars.m = shape.rows;
      vars.n = shape.cols;
      const out = { ...shape, v: new Float64Array(shape.v.length) };
      for (let i = 0; i < shape.rows; i++)
        for (let j = 0; j < shape.cols; j++) {
          vars.i = i + 1;
          vars.j = j + 1;
          vars.a = a.v[(a.rows === 1 ? 0 : i) * a.cols + (a.cols === 1 ? 0 : j)];
          vars.b = b.v[(b.rows === 1 ? 0 : i) * b.cols + (b.cols === 1 ? 0 : j)];
          out.v[i * shape.cols + j] = f.fn(vars);
        }
      return [out];
    }
    case 'matmul': {
      const e = needB();
      if (e) return e;
      // a single value: as A ∘ B (matrix × number)
      if (typeof B === 'number' || typeof A === 'number') return bin((x, y) => x * y, 'A × B');
      return one(matmul(a, B as Matrix));
    }
    case 'matpow':
      return withWarning(matPower(a, s.k ?? 2));
    case 'kron':
      return needB() ?? one(kron(a, asMatrix(B!)));
    case 'dot':
      return needB() ?? one(dot(a, asMatrix(B!)));
    case 'cross':
      return needB() ?? one(cross(a, asMatrix(B!)));
    case 'transpose':
      return [transpose(a)];
    case 'inverse':
      return withWarning(inverse(a));
    case 'pinv':
      return one(pinv(a));
    case 'det':
      return one(det(a));
    case 'trace':
      return one(trace(a));
    case 'rank':
      return one(rank(a));
    case 'norm':
      return one(norm(a, (s.fn as NormKind) ?? 'fro'));
    case 'cond':
      return one(cond(a));
    case 'solve':
      return needB() ?? withWarning(solve(a, asMatrix(B!)));
    case 'lu': {
      const r = lu(a);
      return [r.L, r.U, r.P];
    }
    case 'qr': {
      const r = qr(a);
      return [r.Q, r.R];
    }
    case 'chol':
      return one(cholesky(a));
    case 'eig': {
      const r = eig(a);
      if (typeof r === 'string') return r;
      if (r.complex) warn('Complex eigenvalues: the values as Re λ, Im λ; the vectors only for the real ones (the others empty).');
      return [r.values, r.vectors];
    }
    case 'svd': {
      const r = svd(a);
      return typeof r === 'string' ? r : [r.U, r.S, r.V];
    }
    case 'part':
      return one(part(a, s.rows ?? '', s.cols ?? ''));
    case 'flip':
      return [flip(a, s.how ?? 'lr')];
    case 'rot90':
      return [rot90(a, s.k ?? 1)];
    case 'reshape':
      return one(reshape(a, s.r ?? a.rows, s.c ?? a.cols));
    case 'hcat':
      return needB() ?? one(concat(a, asMatrix(B!), 'h'));
    case 'vcat':
      return needB() ?? one(concat(a, asMatrix(B!), 'v'));
    case 'diag':
      return [diagonal(a)];
    case 'reduce':
      return [reduce(a, (s.fn as ReduceFn) ?? 'sum', s.along ?? 'columns')];
  }
}

// the steps in order, every one on the inputs (by their letter) and the results of the steps above
export function runSteps(steps: MatStep[], inputs: Map<string, Operand>): StepResult[] {
  const results: StepResult[] = [];
  const byId = new Map<string, StepResult>();
  const operand = (ref: string | undefined, num: number | undefined, what: string): Operand | undefined | string => {
    if (!ref) return undefined;
    if (ref === '#') return Number.isFinite(num) ? num! : `${what}: write the number.`;
    if (ref.startsWith('@')) {
      const [id, key = ''] = ref.slice(1).split('.');
      const r = byId.get(id);
      if (!r) return `${what}: that step is no longer above this one.`;
      if (r.error) return `${what}: ${r.name} has no result.`;
      const p = r.parts.find((q) => q.key === key) ?? r.parts[0];
      return p?.value;
    }
    const v = inputs.get(ref);
    return v === undefined ? `${what}: nothing is connected to ${ref}.` : v;
  };
  steps.forEach((s, k) => {
    const name = stepName(s, k);
    const res: StepResult = { id: s.id, name, parts: [], warnings: [] };
    const fail = (e: string) => {
      res.error = e;
      results.push(res);
      byId.set(s.id, res);
    };
    const A = operand(s.a, undefined, 'A');
    if (A === undefined) return fail('Choose A.');
    if (typeof A === 'string') return fail(A);
    const B = takesB(s.op) ? operand(s.b, s.num, 'B') : undefined;
    if (typeof B === 'string') return fail(B);
    let out: Operand[] | string;
    try {
      out = apply(s, A, B, (w) => res.warnings.push(w));
    } catch (err) {
      out = `Internal error: ${(err as Error).message}`;
    }
    if (typeof out === 'string') return fail(out);
    const info = stepParts(s);
    res.parts = info.map((p, j) => {
      const v = out[j];
      return { key: p.key, label: p.label, value: typeof v === 'number' ? v : { ...v, name: p.label ? `${name}.${p.label}` : name } };
    });
    results.push(res);
    byId.set(s.id, res);
  });
  return results;
}

// ---- the Matrix node: a matrix typed, generated, or from the columns of a dataset ----
export type MatGen = 'identity' | 'zeros' | 'ones' | 'constant' | 'diagonal' | 'random' | 'formula' | 'hilbert' | 'vandermonde' | 'rotation';
export type MatSource = {
  name: string;
  source: 'typed' | 'generated' | 'dataset';
  text: string; // typed: a line a row, the cells tab-separated (empty: no value)
  gen: MatGen;
  rows: number;
  cols: number;
  value: number; // constant
  list: string; // diagonal, Vandermonde: the values
  formula: string; // f(i, j)
  dist: 'uniform' | 'normal';
  a: number;
  b: number;
  seed: number;
  angle: number; // rotation, degrees
  // from a dataset: the columns ('' = every numeric one but the rows' coordinates), the rows chosen, the rows' Y (''
  // = the column designated X — the first, unless designated otherwise —, '-' = none: the row numbers, else a column),
  // the columns' X (from the numbers in their names, or none)
  zs: string;
  rowSel?: RowSelect;
  rowAt: string;
  colAt: 'auto' | 'names' | 'index';
};

// A small seeded generator (mulberry32, as Generate column's).
function rng(seed: number) {
  let s = Math.floor(seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const listValues = (s: string) => s.split(/[,;\s]+/).filter(Boolean).map(Number);

// the typed text: its rows and their cells (a decimal comma read too); an empty row is kept (its cells empty), only a
// text with no value at all is no matrix
export function readTyped(text: string): { rows: number; cols: number; v: Float64Array } {
  if (!text.trim()) return { rows: 0, cols: 0, v: new Float64Array(0) };
  const lines = text.replace(/\r/g, '').split('\n');
  const cells = lines.map((l) => l.split('\t'));
  const cols = cells.reduce((m, c) => Math.max(m, c.length), 0);
  const v = new Float64Array(lines.length * cols).fill(NaN);
  cells.forEach((row, i) =>
    row.forEach((c, j) => {
      const t = c.trim().replace(/^([-+]?\d+),(\d+)$/, '$1.$2').replace('−', '-');
      v[i * cols + j] = t === '' ? NaN : Number(t);
    }),
  );
  return { rows: lines.length, cols, v };
}
export function typedText(rows: number, cols: number, v: ArrayLike<number>): string {
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (Number.isFinite(v[i * cols + j]) ? String(v[i * cols + j]) : '')).join('\t')).join('\n');
}

const NUM_IN_NAME = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/;
export function makeMatrix(d: MatSource, ds: Dataset | undefined): { M: Matrix; warnings: string[] } | string {
  const name = d.name.trim();
  const warnings: string[] = [];
  if (d.source === 'typed') {
    const t = readTyped(d.text);
    if (!t.rows || !t.cols) return 'Type the matrix in the cells (or paste it: Ctrl+V).';
    if (t.v.some((q) => Number.isNaN(q))) warnings.push('Some cells are empty or not numbers: they are empty (NaN).');
    return { M: newMatrix(t.rows, t.cols, name || 'M', t.v), warnings };
  }
  if (d.source === 'dataset') {
    if (!ds) return 'Connect a dataset.';
    const all = ds.columns;
    const rowCol = d.rowAt === '-' ? undefined : d.rowAt ? all.find((c) => c.name === d.rowAt) : all.find((_, j) => roleOf(all, j) === 'x');
    if (d.rowAt && d.rowAt !== '-' && !rowCol) return `No column “${d.rowAt}” in the dataset.`;
    const numeric = (c: Column) => c.values.some(Number.isFinite);
    let cols: Column[];
    if (d.zs.trim()) {
      const p = pick(d.zs, all.map((c) => c.name), true);
      if (p.missing.length) return `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
      cols = p.found.map((j) => all[j]);
    } else cols = all.filter((c, j) => c !== rowCol && numeric(c) && roleOf(all, j) !== 'label' && roleOf(all, j) !== 'none');
    if (!cols.length) return 'No columns with numbers to make the matrix of.';
    const n = Math.max(...cols.map((c) => c.values.length), rowCol?.values.length ?? 0);
    const sel = selectRows(d.rowSel, n, rowCol, cols);
    if (typeof sel === 'string') return sel;
    const rows = sel.rows;
    if (!rows.length) return 'No rows chosen.';
    if (rows.length * cols.length > MAX_CELLS) return `At most ${MAX_CELLS.toLocaleString('en')} cells.`;
    const v = new Float64Array(rows.length * cols.length);
    rows.forEach((r, i) => cols.forEach((c, j) => (v[i * cols.length + j] = r < c.values.length ? c.values[r] : NaN)));
    const xsFromNames = cols.map((c) => Number(NUM_IN_NAME.exec(c.name)?.[0]));
    const named = xsFromNames.every(Number.isFinite) && new Set(xsFromNames).size === xsFromNames.length;
    if (d.colAt === 'names' && !named) return `The columns' X from their names: every name must hold a number, each a different one (${cols.filter((_, j) => !Number.isFinite(xsFromNames[j])).slice(0, 3).map((c) => `“${c.name}”`).join(', ') || 'two are equal'}).`;
    const useNames = d.colAt === 'names' || (d.colAt === 'auto' && named);
    const label = all.find((c) => c.role === 'label' && c.text);
    const M: Matrix = {
      name: name || ds.name || 'M',
      rows: rows.length,
      cols: cols.length,
      v,
      colNames: cols.map((c) => c.name),
      ...(useNames ? { xs: xsFromNames } : {}),
      ...(rowCol ? { ys: rows.map((r) => rowCol.values[r]), yName: rowCol.name } : {}),
      ...(label ? { rowNames: rows.map((r) => label.text?.[r] ?? '') } : {}),
    };
    if (useNames) {
      // “R 400 nm”, “R 410 nm” → X “X (nm)”
      const parts = cols.map((c) => /^(.*?)([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)(.*)$/.exec(c.name.trim()));
      const unit = parts.every((p) => p && p[3].trim() === parts[0]![3].trim()) ? parts[0]![3].trim().replace(/^[([]\s*|\s*[)\]]$/g, '') : '';
      M.xName = unit ? `X (${unit})` : 'X';
    }
    if (rowCol && rows.some((r) => !Number.isFinite(rowCol.values[r]))) warnings.push(`Some rows have no ${rowCol.name}: their Y is empty.`);
    return { M, warnings };
  }
  // generated
  const r = Math.floor(d.rows);
  const c = Math.floor(d.cols);
  const sq = d.gen === 'identity' || d.gen === 'hilbert' || d.gen === 'rotation';
  const list = listValues(d.list);
  if (d.gen === 'diagonal' || d.gen === 'vandermonde') {
    if (!list.length || list.some((q) => !Number.isFinite(q))) return `Write the values (${d.gen === 'diagonal' ? 'the diagonal' : 'x₁, x₂ …'}): 1, 2, 3.`;
  }
  const rows = d.gen === 'rotation' ? 2 : d.gen === 'diagonal' || d.gen === 'vandermonde' ? list.length : r;
  const cols = d.gen === 'rotation' ? 2 : d.gen === 'diagonal' ? list.length : d.gen === 'vandermonde' ? (c >= 1 ? c : list.length) : sq ? r : c;
  if (!(rows >= 1) || !(cols >= 1)) return 'The rows and columns must be at least 1.';
  if (rows * cols > MAX_CELLS) return `At most ${MAX_CELLS.toLocaleString('en')} cells.`;
  const M = newMatrix(rows, cols, name || 'M');
  const set = (f: (i: number, j: number) => number) => {
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) M.v[i * cols + j] = f(i, j);
  };
  switch (d.gen) {
    case 'identity':
      set((i, j) => (i === j ? 1 : 0));
      break;
    case 'zeros':
      break;
    case 'ones':
      M.v.fill(1);
      break;
    case 'constant':
      M.v.fill(d.value);
      break;
    case 'diagonal':
      set((i, j) => (i === j ? list[i] : 0));
      break;
    case 'hilbert':
      set((i, j) => 1 / (i + j + 1));
      break;
    case 'vandermonde':
      // Vandermonde: decreasing powers, the last column x⁰
      set((i, j) => list[i] ** (cols - 1 - j));
      break;
    case 'rotation': {
      const t = (d.angle * Math.PI) / 180;
      M.v.set([Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]);
      break;
    }
    case 'random': {
      const g = rng(d.seed);
      const n = M.v.length;
      if (d.dist === 'uniform') for (let k = 0; k < n; k++) M.v[k] = d.a + (d.b - d.a) * g();
      else
        for (let k = 0; k < n; k += 2) {
          const u1 = 1 - g();
          const u2 = g();
          const m = Math.sqrt(-2 * Math.log(u1));
          M.v[k] = d.a + d.b * m * Math.cos(2 * Math.PI * u2);
          if (k + 1 < n) M.v[k + 1] = d.a + d.b * m * Math.sin(2 * Math.PI * u2);
        }
      break;
    }
    case 'formula': {
      const f = compile(d.formula);
      if (typeof f === 'string') return f;
      const bad = f.names.filter((x) => !['i', 'j', 'm', 'n'].includes(x));
      if (bad.length) return `Unknown name${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: the formula may use i, j (the row and the column, from 1), m, n (the rows and columns).`;
      const vars = { i: 0, j: 0, m: rows, n: cols };
      set((i, j) => {
        vars.i = i + 1;
        vars.j = j + 1;
        return f.fn(vars);
      });
      break;
    }
  }
  return { M, warnings };
}

// the matrix as a table: the rows' Y (designated X), then a column a matrix column named by its X (the layout of the
// Contour's matrix: a Y column and Z columns named by their X) — and the rows' names, when it has them
export function matrixDataset(M: Matrix): Dataset {
  const rowCol: Column = { ...column(M.yName || 'Row', M.ys ? Float64Array.from(M.ys) : Float64Array.from({ length: M.rows }, (_, i) => i + 1)), role: 'x' };
  const used = new Map<string, number>();
  const cols = Array.from({ length: M.cols }, (_, j): Column => {
    let n = M.xs ? `${M.colNames?.[j] && NUM_IN_NAME.test(M.colNames[j]) ? M.colNames[j] : fmtNum(M.xs[j], 6)}` : (M.colNames?.[j] ?? `C${j + 1}`);
    const k = (used.get(n) ?? 0) + 1;
    used.set(n, k);
    if (k > 1) n = `${n} (${k})`;
    return { ...column(n, Float64Array.from({ length: M.rows }, (_, i) => M.v[i * M.cols + j])), role: 'y' };
  });
  const names: Column[] = M.rowNames ? [{ ...column('Row name', new Float64Array(M.rows).fill(NaN), M.rowNames), role: 'label' }] : [];
  return { name: M.name, columns: [rowCol, ...names, ...cols] };
}

// A matrix on a sheet of a Workbook: the rows' names (else their Y, else their numbers) as the first column when rows;
// its columns named by their names (else their X) when cols, else C1, C2 …
export function matrixSheet(M: Matrix, rows: boolean, cols: boolean): Dataset {
  const first: Column[] = !rows
    ? []
    : M.rowNames
      ? [{ ...column(M.yName || 'Name', new Float64Array(M.rows).fill(NaN), M.rowNames), role: 'label' }]
      : [{ ...column(M.yName || (M.ys ? 'Y' : 'Row'), M.ys ? Float64Array.from(M.ys) : Float64Array.from({ length: M.rows }, (_, i) => i + 1)), role: 'x' }];
  const used = new Map<string, number>();
  const data = Array.from({ length: M.cols }, (_, j): Column => {
    let n = cols ? (M.colNames?.[j] ?? (M.xs ? fmtNum(M.xs[j], 6) : `C${j + 1}`)) : `C${j + 1}`;
    const k = (used.get(n) ?? 0) + 1;
    used.set(n, k);
    if (k > 1) n = `${n} (${k})`;
    return { ...column(n, Float64Array.from({ length: M.rows }, (_, i) => M.v[i * M.cols + j])), role: 'y' };
  });
  return { name: M.name, columns: [...first, ...data] };
}

// a short text of a value (the previews of the nodes)
export const fmtCell = (v: number) => (Number.isFinite(v) ? fmtNum(v, 4) : v === Infinity ? '∞' : v === -Infinity ? '−∞' : '');
