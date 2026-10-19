// Statistics of designs with a control group and with repeated measures, as biologists use them (the tests of GraphPad
// Prism's one- and two-way ANOVA): Dunnett's comparisons with a control; two-way ANOVA with repeated measures — one
// factor between the subjects and one within them (a mixed design, split plot), or both within — with Mauchly's test and
// the Greenhouse–Geisser and Huynh–Feldt corrections; a linear mixed model (REML, a random intercept per subject) for
// repeated measures with missing values, its fixed effects tested by Type III F tests with Satterthwaite's degrees of
// freedom. Written from the published methods (cited at each), checked against SciPy, statsmodels and pingouin
// (scripts/fixtures/biostat-ref.py). Pure.
import { chi2Sf, fSf, lgamma, normCdf } from './dist.ts';
import type { AnovaRow, Pair } from './hypo.ts';
import type { TestResult } from './hypo.ts';

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => sum(a) / a.length;

// ---- Dunnett: every group against a control ----
// 16-point Gauss–Legendre on [−1, 1]
const GLX = [-0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003, -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.0950125098376374, 0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438, 0.755404408355003, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499];
const GLW = [0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339, 0.1495959888165767, 0.1691565193950025, 0.1826034150449236, 0.1894506104550685, 0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767, 0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541];
function integrate(f: (x: number) => number, a: number, b: number, panels: number): number {
  const h = (b - a) / panels;
  let s = 0;
  for (let p = 0; p < panels; p++) {
    const c = a + (p + 0.5) * h;
    for (let i = 0; i < 16; i++) s += GLW[i] * f(c + (GLX[i] * h) / 2);
  }
  return (s * h) / 2;
}
const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

// P(|T_i| < c for every i): T_i = (Z_i)/S, the Z_i normal with correlations λ_i λ_j (Dunnett's structure), S² ~ χ²_ν / ν —
// the multivariate t as one integral over the common part and one over S (Dunnett 1955; Hochberg & Tamhane 1987, §3.2)
export function dunnettProb(c: number, lam: number[], nu: number): number {
  const sq = lam.map((l) => Math.sqrt(1 - l * l));
  const inner = (s: number) =>
    integrate(
      (z) => {
        let p = phi(z);
        for (let i = 0; i < lam.length; i++) p *= normCdf((lam[i] * z + c * s) / sq[i]) - normCdf((lam[i] * z - c * s) / sq[i]);
        return p;
      },
      -8.5,
      8.5,
      12,
    );
  if (!Number.isFinite(nu) || nu > 1e6) return inner(1);
  // the density of S = √(χ²_ν/ν)
  const k = Math.log(2) + (nu / 2) * Math.log(nu / 2) - lgamma(nu / 2);
  const g = (s: number) => (s <= 0 ? 0 : Math.exp(k + (nu - 1) * Math.log(s) - (nu * s * s) / 2));
  const lo = Math.max(0, 1 - 10 / Math.sqrt(nu));
  const hi = 1 + 12 / Math.sqrt(nu);
  return Math.min(1, integrate((s) => g(s) * inner(s), lo, hi, 24));
}

// every group (but the control) against the control: the difference, its SE (the pooled error mse, dfE), t, the p
// adjusted for all of them together (two-sided) and the simultaneous intervals at `level`
export function dunnett(groups: number[][], control: number, mse: number, dfE: number, level = 0.95): Pair[] {
  const ns = groups.map((g) => g.length);
  const ms = groups.map(mean);
  const others = groups.map((_, i) => i).filter((i) => i !== control);
  const lam = others.map((i) => Math.sqrt(ns[i] / (ns[i] + ns[control])));
  // the critical value of the simultaneous intervals
  let [lo, hi] = [0, 20];
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (dunnettProb(mid, lam, dfE) < level) lo = mid;
    else hi = mid;
  }
  const crit = (lo + hi) / 2;
  return others.map((i) => {
    const diff = ms[i] - ms[control];
    const se = Math.sqrt(mse * (1 / ns[i] + 1 / ns[control]));
    const t = diff / se;
    return { a: i, b: control, diff, se, stat: t, p: Math.max(0, 1 - dunnettProb(Math.abs(t), lam, dfE)), lo: diff - crit * se, hi: diff + crit * se };
  });
}

// ---- small linear algebra ----
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      if (f) for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function inverse(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const x = solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)));
    if (!x) return null;
    cols.push(x);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}
function logDet(A: number[][]): number {
  const n = A.length;
  const M = A.map((r) => r.slice());
  let s = 0;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-300) return -Infinity;
    [M[i], M[p]] = [M[p], M[i]];
    s += Math.log(Math.abs(M[i][i]));
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c < n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return s;
}
// the residual sum of squares of y on the columns X (least squares; columns that add nothing are left out)
function rss(X: number[][], y: number[]): { ss: number; rank: number } {
  const p = X[0]?.length ?? 0;
  if (!p) return { ss: sum(y.map((v) => v * v)), rank: 0 };
  // Householder QR with column pivoting by size
  const A = X.map((r) => r.slice());
  const b = y.slice();
  const n = A.length;
  let rank = 0;
  for (let j = 0; j < p && rank < n; j++) {
    let norm = 0;
    for (let i = rank; i < n; i++) norm += A[i][j] * A[i][j];
    norm = Math.sqrt(norm);
    let colNorm = 0;
    for (let i = 0; i < n; i++) colNorm += A[i][j] * A[i][j];
    if (norm <= 1e-9 * Math.max(1, Math.sqrt(colNorm))) continue;
    const s = A[rank][j] > 0 ? -norm : norm;
    const v = A.map((r, i) => (i < rank ? 0 : r[j]));
    v[rank] -= s;
    const vv = sum(v.map((x) => x * x));
    if (vv < 1e-300) continue;
    for (let c = j; c < p; c++) {
      let d = 0;
      for (let i = rank; i < n; i++) d += v[i] * A[i][c];
      const f = (2 * d) / vv;
      for (let i = rank; i < n; i++) A[i][c] -= f * v[i];
    }
    let d = 0;
    for (let i = rank; i < n; i++) d += v[i] * b[i];
    const f = (2 * d) / vv;
    for (let i = rank; i < n; i++) b[i] -= f * v[i];
    rank++;
  }
  let ss = 0;
  for (let i = rank; i < n; i++) ss += b[i] * b[i];
  return { ss, rank };
}
// sum-to-zero codes of a level among n (n − 1 columns)
const codes = (l: number, n: number) => Array.from({ length: n - 1 }, (_, j) => (l === j ? 1 : l === n - 1 ? -1 : 0));
const outer = (a: number[], b: number[]) => a.flatMap((u) => b.map((v) => u * v));
// orthonormal contrasts among k levels (Helmert)
function helmert(k: number): number[][] {
  return Array.from({ length: k - 1 }, (_, j) => {
    const v = Array.from({ length: k }, (_, i) => (i <= j ? 1 : i === j + 1 ? -(j + 1) : 0));
    const nrm = Math.sqrt(sum(v.map((x) => x * x)));
    return v.map((x) => x / nrm);
  });
}
const kron = (A: number[][], B: number[][]) => A.flatMap((ra) => B.map((rb) => outer(ra, rb)));
// the sphericity of the transformed data Y (a row per subject; df: the degrees of freedom of their covariance, already
// centred): Mauchly's W and its test, Greenhouse–Geisser's ε (Box 1954; Greenhouse & Geisser 1959), Huynh–Feldt's
// (Huynh & Feldt 1976), N subjects in g groups
function sphericity(S: number[][], df: number, N: number, g: number): { mauchly: TestResult; gg: number; hf: number } {
  const p = S.length;
  const tr = sum(S.map((r, i) => r[i]));
  const tr2 = sum(S.map((r, a) => sum(r.map((v, b) => v * S[b][a]))));
  const gg = p > 0 ? Math.min(1, (tr * tr) / (p * tr2)) : 1;
  const hf = Math.min(1, (N * p * gg - 2) / (p * (N - g - p * gg)));
  if (p < 2) return { mauchly: { test: 'Mauchly (sphericity)', statName: 'W', stat: 1, p: NaN, note: 'two levels: always spherical' }, gg: 1, hf: 1 };
  const W = Math.exp(logDet(S)) / (tr / p) ** p;
  const f = 1 - (2 * p * p + p + 2) / (6 * p * df);
  const chi = -df * f * Math.log(W);
  const dfM = (p * (p + 1)) / 2 - 1;
  return { mauchly: { test: 'Mauchly (sphericity)', statName: 'W', stat: W, df: dfM, p: chi2Sf(chi, dfM) }, gg, hf: Math.max(gg, hf) };
}
const covOf = (Y: number[][], centre: number[][]): { S: number[][]; df: number } => {
  const p = Y[0]?.length ?? 0;
  const S = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  Y.forEach((r, i) => {
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) S[a][b] += (r[a] - centre[i][a]) * (r[b] - centre[i][b]);
  });
  return { S, df: 0 };
};

// ---- two-way ANOVA with repeated measures ----
// a row of the table with its corrections (ε: the sphericity of its error)
export type RMRow = AnovaRow & { dfE: number; pGG?: number; pHF?: number; gg?: number; hf?: number; mauchly?: TestResult };
export type TwoRM = { rows: RMRow[]; errors: { source: string; ss: number; df: number }[] };
// m[s][j]: subject s at the level j of the factor within (complete); group[s]: its level of the factor between (p levels)
export function mixedDesign(m: number[][], group: number[], p: number): TwoRM | string {
  const S = m.length;
  const q = m[0].length;
  const ns = Array.from({ length: p }, (_, a) => group.filter((g) => g === a).length);
  if (ns.some((n) => n < 1)) return 'every group needs a subject';
  if (S - p < 1) return 'more subjects than groups are needed';
  const subj = m.map(mean);
  const gm = mean(subj);
  const ga = ns.map((_, a) => mean(subj.filter((_, s) => group[s] === a)));
  // between the subjects: the groups against the subjects within them
  const ssA = q * sum(ns.map((n, a) => n * (ga[a] - gm) ** 2));
  const ssSA = q * sum(subj.map((v, s) => (v - ga[group[s]]) ** 2));
  const dfA = p - 1;
  const dfSA = S - p;
  // within: Type III by least squares on the deviations from each subject's mean, the codes centred within subjects
  const y: number[] = [];
  const XB: number[][] = [];
  const XAB: number[][] = [];
  m.forEach((row, s) => {
    const cb = row.map((_, j) => codes(j, q));
    const cab = cb.map((c) => outer(codes(group[s], p), c));
    const mb = cb[0].map((_, k) => mean(cb.map((c) => c[k])));
    const mab = cab[0].map((_, k) => mean(cab.map((c) => c[k])));
    row.forEach((v, j) => {
      y.push(v - subj[s]);
      XB.push(cb[j].map((x, k) => x - mb[k]));
      XAB.push(cab[j].map((x, k) => x - mab[k]));
    });
  });
  const full = rss(y.map((_, i) => [...XB[i], ...XAB[i]]), y).ss;
  const ssB = rss(XAB, y).ss - full;
  const ssAB = rss(XB, y).ss - full;
  const dfB = q - 1;
  const dfAB = (p - 1) * (q - 1);
  const dfE = dfSA * (q - 1);
  const mseW = full / dfE;
  // sphericity: the covariance of the contrasts pooled within the groups
  const C = helmert(q);
  const Y = m.map((row) => C.map((c) => sum(c.map((x, j) => x * row[j]))));
  const gmY = ns.map((_, a) => (C.length ? C.map((_, k) => mean(Y.filter((_, s) => group[s] === a).map((r) => r[k]))) : []));
  const { S: Sp } = covOf(Y, Y.map((_, s) => gmY[group[s]]));
  const Spool = Sp.map((r) => r.map((v) => v / dfSA));
  const sp = sphericity(Spool, dfSA, S, p);
  const mseA = ssSA / dfSA;
  const row = (source: string, ss: number, df: number, mse: number, dfe: number, err: number, corr: boolean): RMRow => {
    const F = ss / df / mse;
    const r: RMRow = { source, ss, df, ms: ss / df, F, p: fSf(F, df, dfe), eta2p: ss / (ss + err), dfE: dfe };
    if (corr) Object.assign(r, { gg: sp.gg, hf: sp.hf, pGG: fSf(F, df * sp.gg, dfe * sp.gg), pHF: fSf(F, df * sp.hf, dfe * sp.hf), mauchly: sp.mauchly });
    return r;
  };
  return {
    rows: [row('A', ssA, dfA, mseA, dfSA, ssSA, false), row('B', ssB, dfB, mseW, dfE, full, true), row('A × B', ssAB, dfAB, mseW, dfE, full, true)],
    errors: [
      { source: 'Subjects (within A)', ss: ssSA, df: dfSA },
      { source: 'B × Subjects (within A)', ss: full, df: dfE },
    ],
  };
}

// m[s][i][j]: subject s at the level i of A and j of B (complete): each effect against its own error (effect × subjects)
export function bothWithin(m: number[][][]): TwoRM {
  const n = m.length;
  const p = m[0].length;
  const q = m[0][0].length;
  const all = m.flat(2);
  const gm = mean(all);
  const mS = m.map((s) => mean(s.flat()));
  const mA = Array.from({ length: p }, (_, i) => mean(m.map((s) => mean(s[i]))));
  const mB = Array.from({ length: q }, (_, j) => mean(m.flatMap((s) => s.map((r) => r[j]))));
  const mSA = m.map((s) => s.map(mean));
  const mSB = m.map((s) => Array.from({ length: q }, (_, j) => mean(s.map((r) => r[j]))));
  const mAB = Array.from({ length: p }, (_, i) => Array.from({ length: q }, (_, j) => mean(m.map((s) => s[i][j]))));
  const ssA = n * q * sum(mA.map((v) => (v - gm) ** 2));
  const ssB = n * p * sum(mB.map((v) => (v - gm) ** 2));
  const ssAB = n * sum(mAB.flatMap((r, i) => r.map((v, j) => (v - mA[i] - mB[j] + gm) ** 2)));
  const ssAS = q * sum(mSA.flatMap((r, s) => r.map((v, i) => (v - mS[s] - mA[i] + gm) ** 2)));
  const ssBS = p * sum(mSB.flatMap((r, s) => r.map((v, j) => (v - mS[s] - mB[j] + gm) ** 2)));
  const ssABS = sum(m.flatMap((sub, s) => sub.flatMap((r, i) => r.map((v, j) => (v - mSA[s][i] - mSB[s][j] - mAB[i][j] + mS[s] + mA[i] + mB[j] - gm) ** 2))));
  // the contrasts of each effect, per subject: their covariance (sphericity)
  const CA = helmert(p);
  const CB = helmert(q);
  const meanJ = (k: number) => Array.from({ length: k }, () => 1 / Math.sqrt(k));
  const eff = (C: number[][]) => {
    const Y = m.map((s) => C.map((c) => sum(c.map((x, idx) => x * s[Math.floor(idx / q)][idx % q]))));
    const mu = C.map((_, k) => mean(Y.map((r) => r[k])));
    const { S } = covOf(Y, Y.map(() => mu));
    return sphericity(S.map((r) => r.map((v) => v / (n - 1))), n - 1, n, 1);
  };
  const spA = eff(kron(CA, [meanJ(q)]));
  const spB = eff(kron([meanJ(p)], CB));
  const spAB = eff(kron(CA, CB));
  const row = (source: string, ss: number, df: number, err: number, dfe: number, sp: ReturnType<typeof sphericity>): RMRow => {
    const F = ss / df / (err / dfe);
    return { source, ss, df, ms: ss / df, F, p: fSf(F, df, dfe), eta2p: ss / (ss + err), dfE: dfe, gg: sp.gg, hf: sp.hf, pGG: fSf(F, df * sp.gg, dfe * sp.gg), pHF: fSf(F, df * sp.hf, dfe * sp.hf), mauchly: sp.mauchly };
  };
  return {
    rows: [row('A', ssA, p - 1, ssAS, (p - 1) * (n - 1), spA), row('B', ssB, q - 1, ssBS, (q - 1) * (n - 1), spB), row('A × B', ssAB, (p - 1) * (q - 1), ssABS, (p - 1) * (q - 1) * (n - 1), spAB)],
    errors: [
      { source: 'A × Subjects', ss: ssAS, df: (p - 1) * (n - 1) },
      { source: 'B × Subjects', ss: ssBS, df: (q - 1) * (n - 1) },
      { source: 'A × B × Subjects', ss: ssABS, df: (p - 1) * (q - 1) * (n - 1) },
    ],
  };
}

// ---- the linear mixed model: y = Xβ + u_subject + e, u ~ N(0, σ²_u), e ~ N(0, σ²_e), by REML ----
// terms: the fixed effects (their names and their code columns, sum-to-zero), every row's subject
export type MixedFit = {
  beta: number[];
  cov: number[][];
  sigmaE2: number;
  sigmaU2: number;
  icc: number;
  logLik: number; // REML
  tests: { source: string; F: number; df1: number; df2: number; p: number }[];
  N: number;
  subjects: number;
};
export function mixedModel(y: number[], subj: number[], terms: { name: string; cols: number[][] }[]): MixedFit | string {
  const N = y.length;
  const X = y.map((_, i) => [1, ...terms.flatMap((t) => t.cols[i])]);
  const p = X[0].length;
  const S = Math.max(...subj) + 1;
  const rows: number[][] = Array.from({ length: S }, () => []);
  subj.forEach((s, i) => rows[s].push(i));
  const groups = rows.filter((r) => r.length);
  if (N - p < 1) return 'not enough values for the model';
  // X'H⁻¹X, X'H⁻¹y, y'H⁻¹y for H = I + γ J within every subject (V = σ²_e H)
  const parts = (gamma: number) => {
    const XtX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const Xty = new Array<number>(p).fill(0);
    let yty = 0;
    let logH = 0;
    for (const g of groups) {
      const k = g.length;
      const w = gamma / (1 + k * gamma);
      const sx = new Array<number>(p).fill(0);
      let sy = 0;
      for (const i of g) {
        for (let a = 0; a < p; a++) {
          sx[a] += X[i][a];
          Xty[a] += X[i][a] * y[i];
          for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
        }
        sy += y[i];
        yty += y[i] * y[i];
      }
      for (let a = 0; a < p; a++) {
        Xty[a] -= w * sx[a] * sy;
        for (let b = 0; b < p; b++) XtX[a][b] -= w * sx[a] * sx[b];
      }
      yty -= w * sy * sy;
      logH += Math.log(1 + k * gamma);
    }
    return { XtX, Xty, yty, logH };
  };
  // the REML deviance profiled over σ²_e, as a function of γ = σ²_u / σ²_e
  const prof = (gamma: number) => {
    const { XtX, Xty, yty, logH } = parts(gamma);
    const beta = solve(XtX, Xty);
    if (!beta) return { dev: Infinity, beta: [], s2: NaN, XtX };
    const rr = yty - sum(beta.map((b, i) => b * Xty[i]));
    const s2 = rr / (N - p);
    return { dev: (N - p) * Math.log(s2) + logH + logDet(XtX), beta, s2, XtX };
  };
  // golden section on log γ (and γ = 0)
  let [a, b] = [-18, 12];
  const phiG = (Math.sqrt(5) - 1) / 2;
  let c = b - phiG * (b - a);
  let d = a + phiG * (b - a);
  let fc = prof(Math.exp(c)).dev;
  let fd = prof(Math.exp(d)).dev;
  for (let it = 0; it < 120; it++) {
    if (fc < fd) {
      [b, d, fd] = [d, c, fc];
      c = b - phiG * (b - a);
      fc = prof(Math.exp(c)).dev;
    } else {
      [a, c, fc] = [c, d, fd];
      d = a + phiG * (b - a);
      fd = prof(Math.exp(d)).dev;
    }
  }
  let gamma = Math.exp((a + b) / 2);
  if (prof(0).dev <= prof(gamma).dev) gamma = 0;
  const best = prof(gamma);
  if (!best.beta.length) return 'the fixed effects cannot all be estimated (a combination of levels without data?)';
  const sigmaE2 = best.s2;
  const sigmaU2 = gamma * sigmaE2;
  // the covariance of β, and the REML deviance at given variances (for Satterthwaite's degrees of freedom)
  const covAt = (se2: number, su2: number) => {
    const XtX = parts(su2 / se2).XtX;
    const inv = inverse(XtX);
    return inv ? inv.map((r) => r.map((v) => v * se2)) : null;
  };
  const devAt = (se2: number, su2: number) => {
    const { XtX, Xty, yty, logH } = parts(su2 / se2);
    const beta = solve(XtX, Xty);
    if (!beta) return Infinity;
    const rr = yty - sum(beta.map((bb, i) => bb * Xty[i]));
    return N * Math.log(se2) + logH + logDet(XtX) - p * Math.log(se2) + rr / se2;
  };
  const cov = covAt(sigmaE2, sigmaU2)!;
  const logLik = -0.5 * (devAt(sigmaE2, sigmaU2) + (N - p) * Math.log(2 * Math.PI));
  // the Hessian of the deviance in θ = (σ²_e, σ²_u), by central differences; A = 2 H⁻¹ (Satterthwaite 1946, as lmerTest)
  const th = [sigmaE2, sigmaU2];
  const hs = th.map((v) => Math.max(1e-6, Math.abs(v) * 1e-3));
  const dev = (t: number[]) => devAt(Math.max(1e-12, t[0]), Math.max(0, t[1]));
  const H = [0, 1].map((i) => [0, 1].map((j) => {
    const e = (k: number, s: number) => th.map((v, m) => v + (m === k ? s * hs[k] : 0));
    if (i === j) return (dev(e(i, 1)) - 2 * dev(th) + dev(e(i, -1))) / (hs[i] * hs[i]);
    const pp = th.map((v, m) => v + (m === i ? hs[i] : 0) + (m === j ? hs[j] : 0));
    const pm = th.map((v, m) => v + (m === i ? hs[i] : 0) - (m === j ? hs[j] : 0));
    const mp = th.map((v, m) => v - (m === i ? hs[i] : 0) + (m === j ? hs[j] : 0));
    const mm = th.map((v, m) => v - (m === i ? hs[i] : 0) - (m === j ? hs[j] : 0));
    return (dev(pp) - dev(pm) - dev(mp) + dev(mm)) / (4 * hs[i] * hs[j]);
  }));
  // on the boundary (σ²_u = 0) only σ²_e varies
  const onEdge = sigmaU2 < 1e-10 * sigmaE2;
  const Hinv = onEdge ? [[1 / H[0][0], 0], [0, 0]] : inverse(H);
  const A = Hinv ? Hinv.map((r) => r.map((v) => 2 * v)) : null;
  // a contrast's variance and its gradient in θ
  const varOf = (l: number[], se2: number, su2: number) => {
    const C = covAt(se2, su2);
    return C ? sum(l.map((x, i) => x * sum(C[i].map((v, j) => v * l[j])))) : NaN;
  };
  const tests: MixedFit['tests'] = [];
  let col = 1;
  for (const t of terms) {
    const k = t.cols[0]?.length ?? 0;
    const L = Array.from({ length: k }, (_, r) => Array.from({ length: p }, (_, j) => (j === col + r ? 1 : 0)));
    col += k;
    if (!k) continue;
    const Lb = L.map((r) => sum(r.map((x, j) => x * best.beta[j])));
    const M = L.map((r1) => L.map((r2) => sum(r1.map((x, i) => x * sum(cov[i].map((v, j) => v * r2[j]))))));
    const Minv = inverse(M);
    if (!Minv) continue;
    const F = sum(Lb.map((u, i) => u * sum(Minv[i].map((v, j) => v * Lb[j])))) / k;
    // Satterthwaite: the eigenvectors of L C L', a df for each, combined (Fai & Cornelius 1996)
    const { values, vectors } = symEig(M);
    let E = 0;
    let ok = !!A;
    values.forEach((lam, m) => {
      const l = L[0].map((_, j) => sum(vectors.map((v, r) => v[m] * L[r][j])));
      const g = [0, 1].map((i) => {
        const up = th.map((v, q2) => v + (q2 === i ? hs[i] : 0));
        const dn = th.map((v, q2) => v - (q2 === i ? hs[i] : 0));
        return (varOf(l, up[0], Math.max(0, up[1])) - varOf(l, Math.max(1e-12, dn[0]), Math.max(0, dn[1]))) / (2 * hs[i]);
      });
      const gAg = A ? sum(g.map((x, i) => x * sum(A[i].map((v, j) => v * g[j])))) : NaN;
      const nu = (2 * lam * lam) / gAg;
      if (!(nu > 2)) ok = false;
      else E += nu / (nu - 2);
    });
    const df2 = ok && E > k ? (2 * E) / (E - k) : N - p;
    tests.push({ source: t.name, F, df1: k, df2, p: fSf(F, k, df2) });
  }
  return { beta: best.beta, cov, sigmaE2, sigmaU2, icc: sigmaU2 / (sigmaU2 + sigmaE2), logLik, tests, N, subjects: groups.length };
}

// the eigenvalues and eigenvectors (as columns) of a small symmetric matrix (Jacobi rotations)
function symEig(A0: number[][]): { values: number[]; vectors: number[][] } {
  const n = A0.length;
  const A = A0.map((r) => r.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-30) break;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(A[i][j]) < 1e-300) continue;
        const th = (A[j][j] - A[i][i]) / (2 * A[i][j]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const [aik, ajk] = [A[i][k], A[j][k]];
          A[i][k] = c * aik - s * ajk;
          A[j][k] = s * aik + c * ajk;
        }
        for (let k = 0; k < n; k++) {
          const [aki, akj] = [A[k][i], A[k][j]];
          A[k][i] = c * aki - s * akj;
          A[k][j] = s * aki + c * akj;
        }
        for (let k = 0; k < n; k++) {
          const [vki, vkj] = [V[k][i], V[k][j]];
          V[k][i] = c * vki - s * vkj;
          V[k][j] = s * vki + c * vkj;
        }
      }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}

// the code columns of a factor's levels (sum-to-zero) and of the interaction of two
export const factorCols = (lv: number[], n: number) => lv.map((l) => codes(l, n));
export const interCols = (a: number[][], b: number[][]) => a.map((r, i) => outer(r, b[i]));
