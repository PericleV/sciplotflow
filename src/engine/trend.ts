// A trend line on a curve of a Plot (as a spreadsheet's trendline, a regression plot's line): least squares — a line
// (or through the origin), a polynomial of degree 2 … 6, an exponential y = A·e^{Bx} and a power y = A·x^B (fitted to
// ln y, as spreadsheets do: R² of that fit), a logarithm y = a + b·ln x —, or a moving average; its equation and R²;
// the confidence band of the line (the mean of y at x: t·s·√(x₀ᵀ(XᵀX)⁻¹x₀), back on the data's scale). Least squares
// by Householder QR (stable for polynomials). Pure.
import { tInv } from './dist.ts';

export type TrendKind = 'linear' | 'poly' | 'exp' | 'power' | 'log' | 'movavg';
export type TrendSpec = { kind: TrendKind; degree?: number; window?: number; origin?: boolean; band?: boolean; level?: number; equation?: boolean };
// se: the standard errors of coef (exponential, power: A from that of ln A); dof: n − the coefficients
export type TrendResult = { xs: number[]; ys: number[]; lo?: number[]; hi?: number[]; coef: number[]; se: number[]; r2: number; n: number; dof: number; equation: string };

// least squares of y on the columns of X (n × p): the coefficients, the residual sum of squares, (XᵀX)⁻¹
export function leastSquares(X: number[][], y: number[]): { beta: number[]; sse: number; inv: number[][] } | null {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (n < p || p === 0) return null;
  const A = X.map((r) => [...r]);
  const b = [...y];
  const R: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let k = 0; k < p; k++) {
    // the Householder reflection that zeros column k below the diagonal
    let norm = 0;
    for (let i = k; i < n; i++) norm += A[i][k] * A[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) return null;
    const alpha = A[k][k] > 0 ? -norm : norm;
    const v = Array.from({ length: n - k }, (_, i) => A[k + i][k]);
    v[0] -= alpha;
    const vv = v.reduce((s, q) => s + q * q, 0);
    if (vv > 0) {
      for (let j = k; j < p; j++) {
        let s = 0;
        for (let i = 0; i < v.length; i++) s += v[i] * A[k + i][j];
        const f = (2 * s) / vv;
        for (let i = 0; i < v.length; i++) A[k + i][j] -= f * v[i];
      }
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i] * b[k + i];
      const f = (2 * s) / vv;
      for (let i = 0; i < v.length; i++) b[k + i] -= f * v[i];
    }
    for (let j = k; j < p; j++) R[k][j] = A[k][j];
  }
  if (R.some((r, k) => Math.abs(r[k]) < 1e-12 * Math.abs(R[0][0]))) return null;
  // R β = (Qᵀy)[0..p)
  const beta = new Array<number>(p).fill(0);
  for (let k = p - 1; k >= 0; k--) {
    let s = b[k];
    for (let j = k + 1; j < p; j++) s -= R[k][j] * beta[j];
    beta[k] = s / R[k][k];
  }
  let sse = 0;
  for (let i = p; i < n; i++) sse += b[i] * b[i];
  // (XᵀX)⁻¹ = R⁻¹ R⁻ᵀ
  const Ri = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let j = 0; j < p; j++) {
    Ri[j][j] = 1 / R[j][j];
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += R[i][k] * Ri[k][j];
      Ri[i][j] = -s / R[i][i];
    }
  }
  const inv = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => Ri[i].reduce((s, v, k) => s + v * Ri[j][k], 0)));
  return { beta, sse, inv };
}

// 4 significant digits; very small or large ones as a power of 10 (−8.535·10^{−5})
const sig = (v: number) => {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) {
    const e = Math.floor(Math.log10(a));
    return `${String(+(v / 10 ** e).toPrecision(4)).replace('-', '−')}·10^{${String(e).replace('-', '−')}}`;
  }
  return String(+v.toPrecision(4)).replace('-', '−');
};
// a term of an equation with its sign (“ + 2.5x”, “ − 0.3x²”)
const term = (c: number, pow: string, first: boolean) => {
  const s = sig(Math.abs(c));
  return `${first ? (c < 0 ? '−' : '') : c < 0 ? ' − ' : ' + '}${s}${pow}`;
};

// span: the x the line is drawn over (absent: the data's)
export function trendFit(xIn: ArrayLike<number>, yIn: ArrayLike<number>, t: TrendSpec, span?: [number, number]): TrendResult | string {
  const pts: [number, number][] = [];
  for (let i = 0; i < Math.min(xIn.length, yIn.length); i++) if (Number.isFinite(xIn[i]) && Number.isFinite(yIn[i])) pts.push([xIn[i], yIn[i]]);
  pts.sort((a, b) => a[0] - b[0]);
  const level = Math.min(99.9, Math.max(50, t.level ?? 95));
  if (t.kind === 'movavg') {
    const w = Math.max(2, Math.floor(t.window ?? 5));
    if (pts.length < w) return `a moving average of ${w} needs ${w} points at least`;
    const xs: number[] = [];
    const ys: number[] = [];
    // centred: the mean of w points around each (the ends where a whole window fits)
    const h = Math.floor((w - 1) / 2);
    for (let i = h; i + (w - 1 - h) < pts.length; i++) {
      const win = pts.slice(i - h, i - h + w);
      xs.push(win.reduce((s, p) => s + p[0], 0) / w);
      ys.push(win.reduce((s, p) => s + p[1], 0) / w);
    }
    return { xs, ys, coef: [], se: [], r2: NaN, n: pts.length, dof: 0, equation: `moving average (${w})` };
  }
  // the data on the scales of the fit: ln y (exponential, power), ln x (power, logarithm)
  const logX = t.kind === 'power' || t.kind === 'log';
  const logY = t.kind === 'exp' || t.kind === 'power';
  const used = pts.filter(([x, y]) => (!logX || x > 0) && (!logY || y > 0));
  if (used.length < pts.length && !used.length) return `${t.kind === 'log' ? 'a logarithm needs x > 0' : t.kind === 'exp' ? 'an exponential needs y > 0' : 'a power needs x > 0 and y > 0'}`;
  const u = used.map(([x]) => (logX ? Math.log(x) : x));
  const v = used.map(([, y]) => (logY ? Math.log(y) : y));
  const deg = t.kind === 'poly' ? Math.min(6, Math.max(2, Math.floor(t.degree ?? 2))) : 1;
  const origin = t.kind === 'linear' && !!t.origin;
  const row = (q: number) => (origin ? [q] : Array.from({ length: deg + 1 }, (_, k) => q ** k));
  const X = u.map(row);
  const p = X[0].length;
  if (used.length < p) return `${p} points at least are needed`;
  const ls = leastSquares(X, v);
  if (!ls) return 'the points do not fix the line (all at one x?)';
  const { beta, sse, inv } = ls;
  const n = used.length;
  const mv = v.reduce((s, q) => s + q, 0) / n;
  const sst = origin ? v.reduce((s, q) => s + q * q, 0) : v.reduce((s, q) => s + (q - mv) ** 2, 0);
  const r2 = 1 - sse / sst;
  // the line drawn across the data's x (evenly; a log x evenly on its log)
  const [d0, d1] = [used[0][0], used[used.length - 1][0]];
  const [x0, x1] = span && span[1] > span[0] ? [logX && !(span[0] > 0) ? d0 : span[0], span[1]] : [d0, d1];
  const m = 200;
  const xs = Array.from({ length: m + 1 }, (_, k) => (logX ? Math.exp(Math.log(x0) + ((Math.log(x1) - Math.log(x0)) * k) / m) : x0 + ((x1 - x0) * k) / m));
  const fit = (x: number) => row(logX ? Math.log(x) : x).reduce((s, q, k) => s + q * beta[k], 0);
  const back = (w: number) => (logY ? Math.exp(w) : w);
  const ys = xs.map((x) => back(fit(x)));
  // the band of the mean at every x
  let lo: number[] | undefined;
  let hi: number[] | undefined;
  if (t.band && n > p) {
    const s2 = sse / (n - p);
    const tq = tInv(1 - (1 - level / 100) / 2, n - p);
    lo = [];
    hi = [];
    for (const x of xs) {
      const r = row(logX ? Math.log(x) : x);
      let q = 0;
      for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) q += r[i] * inv[i][j] * r[j];
      const half = tq * Math.sqrt(Math.max(0, s2 * q));
      const c = fit(x);
      lo.push(back(c - half));
      hi.push(back(c + half));
    }
  }
  let equation: string;
  if (t.kind === 'exp') equation = `y = ${sig(Math.exp(beta[0]))}·e^{${sig(beta[1])}x}`;
  else if (t.kind === 'power') equation = `y = ${sig(Math.exp(beta[0]))}·x^{${sig(beta[1])}}`;
  else if (t.kind === 'log') equation = `y = ${term(beta[1], ' ln x', true)}${term(beta[0], '', false)}`;
  else if (origin) equation = `y = ${term(beta[0], 'x', true)}`;
  else {
    const parts = beta.map((c, k) => ({ c, pow: k === 0 ? '' : k === 1 ? 'x' : `x^{${k}}` })).reverse();
    equation = `y = ${parts.map((q, i) => term(q.c, q.pow, i === 0)).join('')}`;
  }
  const coef = t.kind === 'exp' || t.kind === 'power' ? [Math.exp(beta[0]), beta[1]] : beta;
  const s2e = n > p ? sse / (n - p) : NaN;
  const seB = beta.map((_, k) => Math.sqrt(Math.max(0, s2e * inv[k][k])));
  const se = t.kind === 'exp' || t.kind === 'power' ? [coef[0] * seB[0], seB[1]] : seB;
  return { xs, ys, ...(lo ? { lo, hi } : {}), coef, se, r2, n, dof: n - p, equation };
}
