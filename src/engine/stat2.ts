// The methods of the second statistics package: the p-values of many tests adjusted (Bonferroni, Holm, Hochberg,
// Hommel, Benjamini–Hochberg, Benjamini–Yekutieli: as R's p.adjust), contingency tables (Pearson's χ² with Yates's
// correction, the G-test, Fisher's exact test — 2 × 2 and r × c, by enumeration or by Monte Carlo —, McNemar, a goodness
// of fit; Cramér's V, the odds ratio, the relative risk), ROC curves (the AUC with DeLong's variance, DeLong's test of
// two paired curves, the thresholds), survival (Kaplan–Meier with Greenwood's variance, the log-rank test and its
// weighted forms, the median survival with its interval, the Mantel–Haenszel hazard ratio) and the linear model (least
// squares by Householder QR: coefficients, Type II ANOVA, the diagnostics). Pure. Checked against statsmodels, SciPy,
// lifelines and scikit-learn (scripts/fixtures/tests2-ref.py).
import { chi2Sf, lgamma, normCdf, normInv, normSf, tInv, tP2, fSf, binomTest2 } from './dist.ts';

// ---- p-values adjusted ----
export type PAdjust = 'bonferroni' | 'holm' | 'hochberg' | 'hommel' | 'bh' | 'by';
// as R's p.adjust: the p-values that are not numbers kept as they are and not counted
export function padjust(p: number[], how: PAdjust): number[] {
  const idx = p.map((_, i) => i).filter((i) => Number.isFinite(p[i]));
  const n = idx.length;
  const out = p.map(() => NaN);
  if (!n) return out;
  const q = idx.map((i) => p[i]);
  const asc = q.map((_, i) => i).sort((a, b) => q[a] - q[b]);
  const res = new Array<number>(n);
  if (how === 'bonferroni') for (let i = 0; i < n; i++) res[i] = Math.min(1, n * q[i]);
  else if (how === 'holm') {
    let run = 0;
    asc.forEach((k, i) => {
      run = Math.max(run, (n - i) * q[k]);
      res[k] = Math.min(1, run);
    });
  } else if (how === 'hochberg' || how === 'bh' || how === 'by') {
    const c = how === 'by' ? Array.from({ length: n }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0) : 1;
    let run = Infinity;
    for (let j = n - 1; j >= 0; j--) {
      const k = asc[j];
      const v = how === 'hochberg' ? (n - j) * q[k] : ((c * n) / (j + 1)) * q[k];
      run = Math.min(run, v);
      res[k] = Math.min(1, run);
    }
  } else {
    // Hommel (as R)
    const s = asc.map((k) => q[k]);
    let qq = new Array<number>(n).fill(Math.min(...s.map((v, i) => (n * v) / (i + 1))));
    let pa = [...qq];
    for (let m = n - 1; m >= 2; m--) {
      const n1 = n - m + 1;
      let q1 = Infinity;
      for (let k = 2; k <= m; k++) q1 = Math.min(q1, (m * s[n - m + k - 1]) / k);
      const nq = [...qq];
      for (let i = 0; i < n1; i++) nq[i] = Math.min(m * s[i], q1);
      for (let i = n1; i < n; i++) nq[i] = nq[n1 - 1];
      qq = nq;
      pa = pa.map((v, i) => Math.max(v, qq[i]));
    }
    asc.forEach((k, j) => (res[k] = Math.min(1, Math.max(pa[j], s[j]))));
  }
  idx.forEach((i, j) => (out[i] = res[j]));
  return out;
}

// ---- contingency tables ----
export type Chi = { stat: number; df: number; p: number };
// the expected counts under independence
export function expected(t: number[][]): number[][] {
  const n = t.flat().reduce((a, b) => a + b, 0);
  const rs = t.map((r) => r.reduce((a, b) => a + b, 0));
  const cs = t[0].map((_, j) => t.reduce((a, r) => a + r[j], 0));
  return t.map((r, i) => r.map((_, j) => (rs[i] * cs[j]) / n));
}
// Pearson's χ² (yates: Yates's correction, only for a 2 × 2 table, as SciPy)
export function chiSquare(t: number[][], yates = false): Chi {
  const e = expected(t);
  const df = (t.length - 1) * (t[0].length - 1);
  const corr = yates && df === 1;
  let s = 0;
  t.forEach((r, i) =>
    r.forEach((o, j) => {
      let d = Math.abs(o - e[i][j]);
      if (corr) d = Math.max(0, d - 0.5);
      s += (d * d) / e[i][j];
    }),
  );
  return { stat: s, df, p: chi2Sf(s, df) };
}
// the G-test (the likelihood ratio)
export function gTest(t: number[][]): Chi {
  const e = expected(t);
  let s = 0;
  t.forEach((r, i) => r.forEach((o, j) => o > 0 && (s += 2 * o * Math.log(o / e[i][j]))));
  const df = (t.length - 1) * (t[0].length - 1);
  return { stat: s, df, p: chi2Sf(s, df) };
}
// the log of the probability of a table given its margins (hypergeometric)
const lfact = (k: number) => lgamma(k + 1);
function tableLogP(t: number[][], rs: number[], cs: number[], n: number): number {
  let s = rs.reduce((a, r) => a + lfact(r), 0) + cs.reduce((a, c) => a + lfact(c), 0) - lfact(n);
  for (const r of t) for (const v of r) s -= lfact(v);
  return s;
}
// Fisher's exact test, two-sided (the tables no likelier than the one seen): every table with the same margins
// enumerated when they are not too many, else 100 000 drawn at random (Patefield's algorithm, a fixed seed)
export function fisherExact(t: number[][]): { p: number; how: 'exact' | 'monte-carlo'; sims?: number } {
  const R = t.length;
  const C = t[0].length;
  const rs = t.map((r) => r.reduce((a, b) => a + b, 0));
  const cs = t[0].map((_, j) => t.reduce((a, r) => a + r[j], 0));
  const n = rs.reduce((a, b) => a + b, 0);
  const lp0 = tableLogP(t, rs, cs, n);
  const tol = 1e-7;
  // (enumerated: the cells filled column by column, the last row and the last column from the margins)
  let p = 0;
  let count = 0;
  const LIMIT = 2e6;
  const cell = t.map((r) => r.map(() => 0));
  const rowLeft = [...rs];
  let aborted = false;
  const rec = (j: number) => {
    if (aborted) return;
    if (j === C - 1) {
      for (let i = 0; i < R; i++) cell[i][j] = rowLeft[i];
      if (++count > LIMIT) {
        aborted = true;
        return;
      }
      const lp = tableLogP(cell, rs, cs, n);
      if (lp <= lp0 + tol * Math.abs(lp0) + 1e-12) p += Math.exp(lp);
      return;
    }
    // (column j: its R cells adding up to cs[j], each at most what its row has left)
    const fill = (i: number, left: number) => {
      if (aborted) return;
      if (i === R - 1) {
        if (left > rowLeft[i]) return;
        cell[i][j] = left;
        rowLeft[i] -= left;
        rec(j + 1);
        rowLeft[i] += left;
        return;
      }
      const restCap = rowLeft.slice(i + 1).reduce((a, b) => a + b, 0);
      for (let v = Math.max(0, left - restCap); v <= Math.min(left, rowLeft[i]); v++) {
        cell[i][j] = v;
        rowLeft[i] -= v;
        fill(i + 1, left - v);
        rowLeft[i] += v;
      }
    };
    fill(0, cs[j]);
  };
  rec(0);
  if (!aborted) return { p: Math.min(1, p), how: 'exact' };
  // (Monte Carlo: tables with the same margins at random, as R's simulate.p.value)
  let seed = 12345;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const B = 100000;
  let hit = 0;
  const pool: number[] = [];
  cs.forEach((c, j) => {
    for (let k = 0; k < c; k++) pool.push(j);
  });
  for (let b = 0; b < B; b++) {
    // (the columns of the n items shuffled, dealt into the rows in their sizes)
    for (let i = pool.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [pool[i], pool[k]] = [pool[k], pool[i]];
    }
    const sim = t.map((r) => r.map(() => 0));
    let at = 0;
    for (let i = 0; i < R; i++) for (let k = 0; k < rs[i]; k++) sim[i][pool[at++]]++;
    if (tableLogP(sim, rs, cs, n) <= lp0 + tol * Math.abs(lp0) + 1e-12) hit++;
  }
  return { p: (hit + 1) / (B + 1), how: 'monte-carlo', sims: B };
}
// McNemar's test of a paired 2 × 2 table (b, c: the discordant pairs): χ² (with the continuity correction or not) and
// the exact binomial p
export function mcnemar(t: number[][], correct = true): { stat: number; p: number; exactP: number } {
  const [b, c] = [t[0][1], t[1][0]];
  const s = b + c > 0 ? (Math.max(0, Math.abs(b - c) - (correct ? 1 : 0)) ** 2) / (b + c) : 0;
  return { stat: s, p: b + c > 0 ? chi2Sf(s, 1) : 1, exactP: b + c > 0 ? binomTest2(Math.min(b, c), b + c, 0.5) : 1 };
}
// the strength of the association: Cramér's V, φ (2 × 2, with its sign), the contingency coefficient
export function association(t: number[][]): { V: number; phi: number; C: number } {
  const n = t.flat().reduce((a, b) => a + b, 0);
  const x2 = chiSquare(t).stat;
  const k = Math.min(t.length, t[0].length) - 1;
  const two = t.length === 2 && t[0].length === 2;
  const phi = two ? (t[0][0] * t[1][1] - t[0][1] * t[1][0]) / Math.sqrt(t[0].reduce((a, b) => a + b, 0) * t[1].reduce((a, b) => a + b, 0) * (t[0][0] + t[1][0]) * (t[0][1] + t[1][1])) : NaN;
  return { V: k > 0 ? Math.sqrt(x2 / (n * k)) : NaN, phi, C: Math.sqrt(x2 / (x2 + n)) };
}
// a 2 × 2 table (rows: exposed, not; columns: event, none): the odds ratio (Woolf's interval of its log), the
// relative risk (Katz's), the risk difference (Wald's); a zero cell: 0.5 added to every cell for the odds ratio
export type TwoByTwo = { or: number; orLo: number; orHi: number; rr: number; rrLo: number; rrHi: number; rd: number; rdLo: number; rdHi: number; haldane: boolean };
export function twoByTwo(t: number[][], level = 0.95): TwoByTwo {
  const z = normInv(1 - (1 - level) / 2);
  const [a0, b0, c0, d0] = [t[0][0], t[0][1], t[1][0], t[1][1]];
  const haldane = a0 === 0 || b0 === 0 || c0 === 0 || d0 === 0;
  const [a, b, c, d] = haldane ? [a0 + 0.5, b0 + 0.5, c0 + 0.5, d0 + 0.5] : [a0, b0, c0, d0];
  const lor = Math.log((a * d) / (b * c));
  const sor = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const [p1, p2] = [a0 / (a0 + b0), c0 / (c0 + d0)];
  const lrr = Math.log(p1 / p2);
  const srr = Math.sqrt(1 / a0 - 1 / (a0 + b0) + 1 / c0 - 1 / (c0 + d0));
  const srd = Math.sqrt((p1 * (1 - p1)) / (a0 + b0) + (p2 * (1 - p2)) / (c0 + d0));
  return {
    or: Math.exp(lor),
    orLo: Math.exp(lor - z * sor),
    orHi: Math.exp(lor + z * sor),
    rr: p1 / p2,
    rrLo: Math.exp(lrr - z * srr),
    rrHi: Math.exp(lrr + z * srr),
    rd: p1 - p2,
    rdLo: p1 - p2 - z * srd,
    rdHi: p1 - p2 + z * srd,
    haldane,
  };
}

// ---- ROC ----
// midranks (ties: their mean rank, from 1)
function midranks(x: number[]): number[] {
  const o = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  const r = new Array<number>(x.length);
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && x[o[j + 1]] === x[o[i]]) j++;
    for (let k = i; k <= j; k++) r[o[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
// DeLong's structural components of an AUC: of every positive (V10) and every negative (V01), from midranks
export function delongParts(pos: number[], neg: number[]): { auc: number; v10: number[]; v01: number[] } {
  const [m, n] = [pos.length, neg.length];
  const all = midranks([...pos, ...neg]);
  const rp = midranks(pos);
  const rn = midranks(neg);
  const v10 = pos.map((_, i) => (all[i] - rp[i]) / n);
  const v01 = neg.map((_, j) => 1 - (all[m + j] - rn[j]) / m);
  return { auc: v10.reduce((a, b) => a + b, 0) / m, v10, v01 };
}
const cov = (a: number[], b: number[]) => {
  const [ma, mb] = [a.reduce((s, v) => s + v, 0) / a.length, b.reduce((s, v) => s + v, 0) / b.length];
  return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (a.length - 1);
};
// an AUC with DeLong's standard error, its interval (clipped to 0 … 1) and the p of AUC = 0.5
export function aucDeLong(pos: number[], neg: number[], level = 0.95): { auc: number; se: number; lo: number; hi: number; p: number } {
  const d = delongParts(pos, neg);
  const se = Math.sqrt(cov(d.v10, d.v10) / pos.length + cov(d.v01, d.v01) / neg.length);
  const z = normInv(1 - (1 - level) / 2);
  return { auc: d.auc, se, lo: Math.max(0, d.auc - z * se), hi: Math.min(1, d.auc + z * se), p: se > 0 ? 2 * normSf(Math.abs(d.auc - 0.5) / se) : NaN };
}
// DeLong's test of two AUCs of the same cases (two scores of the same rows): the difference, its SE, z, p
export function delongTest(posA: number[], negA: number[], posB: number[], negB: number[]): { diff: number; se: number; z: number; p: number } {
  const A = delongParts(posA, negA);
  const B = delongParts(posB, negB);
  const [m, n] = [posA.length, negA.length];
  const v = (cov(A.v10, A.v10) + cov(B.v10, B.v10) - 2 * cov(A.v10, B.v10)) / m + (cov(A.v01, A.v01) + cov(B.v01, B.v01) - 2 * cov(A.v01, B.v01)) / n;
  const se = Math.sqrt(Math.max(0, v));
  const z = se > 0 ? (A.auc - B.auc) / se : NaN;
  return { diff: A.auc - B.auc, se, z, p: Number.isFinite(z) ? 2 * normSf(Math.abs(z)) : NaN };
}
// the curve: a point for every threshold (positive when the score ≥ it), from the highest, with (0, 0) first
export type RocPoint = { thr: number; tp: number; fp: number; fn: number; tn: number; sens: number; spec: number };
export function rocPoints(pos: number[], neg: number[]): RocPoint[] {
  const vals = [...new Set([...pos, ...neg])].sort((a, b) => b - a);
  const sp = [...pos].sort((a, b) => b - a);
  const sn = [...neg].sort((a, b) => b - a);
  const [m, n] = [pos.length, neg.length];
  const out: RocPoint[] = [{ thr: Infinity, tp: 0, fp: 0, fn: m, tn: n, sens: 0, spec: 1 }];
  let [i, j] = [0, 0];
  for (const t of vals) {
    while (i < m && sp[i] >= t) i++;
    while (j < n && sn[j] >= t) j++;
    out.push({ thr: t, tp: i, fp: j, fn: m - i, tn: n - j, sens: i / m, spec: 1 - j / n });
  }
  return out;
}

// ---- survival ----
export type KMStep = { t: number; atRisk: number; events: number; censored: number; s: number; lo: number; hi: number };
export type KM = { steps: KMStep[]; n: number; events: number; median: number; medLo: number; medHi: number };
// Kaplan–Meier: a step at every time with events or censoring, Greenwood's variance, the interval on the log–log scale
// (or plain, or log); the median survival with the interval of Brookmeyer and Crowley (where the band crosses 0.5)
export function kaplanMeier(time: number[], event: boolean[], level = 0.95, ci: 'loglog' | 'plain' | 'log' = 'loglog'): KM {
  const z = normInv(1 - (1 - level) / 2);
  const o = time.map((_, i) => i).sort((a, b) => time[a] - time[b]);
  let atRisk = time.length;
  let s = 1;
  let g = 0;
  const steps: KMStep[] = [];
  for (let k = 0; k < o.length; ) {
    const t = time[o[k]];
    let [d, c] = [0, 0];
    while (k < o.length && time[o[k]] === t) {
      if (event[o[k]]) d++;
      else c++;
      k++;
    }
    if (d > 0) {
      s *= 1 - d / atRisk;
      g += atRisk > d ? d / (atRisk * (atRisk - d)) : Infinity;
    }
    let lo = NaN;
    let hi = NaN;
    if (s > 0 && s < 1 && Number.isFinite(g)) {
      if (ci === 'plain') [lo, hi] = [Math.max(0, s - z * s * Math.sqrt(g)), Math.min(1, s + z * s * Math.sqrt(g))];
      else if (ci === 'log') [lo, hi] = [s * Math.exp(-z * Math.sqrt(g)), Math.min(1, s * Math.exp(z * Math.sqrt(g)))];
      else {
        const v = Math.sqrt(g) / Math.abs(Math.log(s));
        [lo, hi] = [s ** Math.exp(z * v), s ** Math.exp(-z * v)];
      }
    } else if (s === 1) [lo, hi] = [1, 1];
    else if (s === 0) [lo, hi] = [0, 0];
    steps.push({ t, atRisk, events: d, censored: c, s, lo, hi });
    atRisk -= d + c;
  }
  const first = (f: (q: KMStep) => number) => steps.find((q) => f(q) <= 0.5)?.t ?? NaN;
  return { steps, n: time.length, events: event.filter(Boolean).length, median: first((q) => q.s), medLo: first((q) => q.lo), medHi: first((q) => q.hi) };
}
// the survival at a time (the step at or before it)
export function survivalAt(km: KM, t: number): number {
  let s = 1;
  for (const q of km.steps) {
    if (q.t > t) break;
    s = q.s;
  }
  return s;
}
// The log-rank test of k groups and its weighted forms (Gehan–Breslow–Wilcoxon: weights the number at risk;
// Tarone–Ware: its root): χ² with k − 1 df; the observed and expected events of every group; two groups: the
// Mantel–Haenszel hazard ratio of the second to the first (exp((O − E) / V), its interval exp(± z / √V))
export function logRank(time: number[], event: boolean[], group: number[], k: number, weight: 'logrank' | 'gehan' | 'tarone' = 'logrank', level = 0.95): { chi2: number; df: number; p: number; O: number[]; E: number[]; hr?: number; hrLo?: number; hrHi?: number } {
  const ts = [...new Set(time.filter((_, i) => event[i]))].sort((a, b) => a - b);
  const O = new Array<number>(k).fill(0);
  const E = new Array<number>(k).fill(0);
  const U = new Array<number>(k).fill(0);
  const V = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  let V1 = 0;
  for (const t of ts) {
    const nG = new Array<number>(k).fill(0);
    const dG = new Array<number>(k).fill(0);
    for (let i = 0; i < time.length; i++) {
      if (time[i] >= t) nG[group[i]]++;
      if (time[i] === t && event[i]) dG[group[i]]++;
    }
    const n = nG.reduce((a, b) => a + b, 0);
    const d = dG.reduce((a, b) => a + b, 0);
    const w = weight === 'gehan' ? n : weight === 'tarone' ? Math.sqrt(n) : 1;
    const f = n > 1 ? (d * (n - d)) / (n - 1) : 0;
    for (let g = 0; g < k; g++) {
      const e = (nG[g] * d) / n;
      O[g] += dG[g];
      E[g] += e;
      U[g] += w * (dG[g] - e);
      for (let h = 0; h < k; h++) V[g][h] += w * w * f * (nG[g] / n) * ((g === h ? 1 : 0) - nG[h] / n);
    }
    V1 += f * (nG[1 % k] / n) * (1 - nG[1 % k] / n);
  }
  // (χ² = Uᵀ V⁻¹ U over the first k − 1 groups)
  const m = k - 1;
  const A = V.slice(0, m).map((r) => r.slice(0, m));
  const u = U.slice(0, m);
  const x = solveSym(A, u);
  const chi2 = u.reduce((s, v, i) => s + v * x[i], 0);
  const out = { chi2, df: m, p: chi2Sf(chi2, m), O, E };
  if (k !== 2) return out;
  const z = normInv(1 - (1 - level) / 2);
  const l = (O[1] - E[1]) / V1;
  return { ...out, hr: Math.exp(l), hrLo: Math.exp(l - z / Math.sqrt(V1)), hrHi: Math.exp(l + z / Math.sqrt(V1)) };
}
// A x = b (Gauss with pivoting)
function solveSym(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-300) continue;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-300 ? 0 : r[n] / r[i]));
}

// ---- the linear model ----
// Least squares by Householder QR: the coefficients, (XᵀX)⁻¹, the residual sum of squares; the columns that depend on
// the others (rank) given NaN
export type LS = { b: number[]; xtxInv: number[][]; sse: number; rank: number; h: number[]; aliased: boolean[] };
export function leastSquares(X: number[][], y: number[]): LS {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const A = X.map((r) => [...r]);
  const yy = [...y];
  const R = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const vs: number[][] = [];
  const aliased = new Array<boolean>(p).fill(false);
  const scale = Array.from({ length: p }, (_, j) => Math.sqrt(X.reduce((s, r) => s + r[j] * r[j], 0)) || 1);
  for (let j = 0; j < p; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i][j] * A[i][j];
    norm = Math.sqrt(norm);
    const v = new Array<number>(n).fill(0);
    if (norm < 1e-10 * scale[j]) {
      aliased[j] = true;
      vs.push(v);
      continue;
    }
    const alpha = A[j][j] > 0 ? -norm : norm;
    for (let i = j; i < n; i++) v[i] = A[i][j];
    v[j] -= alpha;
    const vn = v.reduce((s, x) => s + x * x, 0);
    vs.push(v);
    if (vn > 0) {
      for (let k = j; k < p; k++) {
        let s = 0;
        for (let i = j; i < n; i++) s += v[i] * A[i][k];
        const f = (2 * s) / vn;
        for (let i = j; i < n; i++) A[i][k] -= f * v[i];
      }
      let s = 0;
      for (let i = j; i < n; i++) s += v[i] * yy[i];
      const f = (2 * s) / vn;
      for (let i = j; i < n; i++) yy[i] -= f * v[i];
    }
    for (let k = j; k < p; k++) R[j][k] = A[j][k];
  }
  // (R b = Qᵀy over the columns kept)
  const keep = Array.from({ length: p }, (_, j) => j).filter((j) => !aliased[j]);
  const b = new Array<number>(p).fill(NaN);
  for (let a = keep.length - 1; a >= 0; a--) {
    const j = keep[a];
    let s = yy[j];
    for (let c = a + 1; c < keep.length; c++) s -= R[j][keep[c]] * b[keep[c]];
    b[j] = s / R[j][j];
  }
  // (R⁻¹ of the kept columns, then (XᵀX)⁻¹ = R⁻¹ R⁻ᵀ)
  const q = keep.length;
  const Ri = Array.from({ length: q }, () => new Array<number>(q).fill(0));
  for (let c = q - 1; c >= 0; c--) {
    Ri[c][c] = 1 / R[keep[c]][keep[c]];
    for (let r = c - 1; r >= 0; r--) {
      let s = 0;
      for (let k = r + 1; k <= c; k++) s += R[keep[r]][keep[k]] * Ri[k][c];
      Ri[r][c] = -s / R[keep[r]][keep[r]];
    }
  }
  const xtxInv = Array.from({ length: p }, () => new Array<number>(p).fill(NaN));
  for (let a = 0; a < q; a++)
    for (let c = 0; c < q; c++) {
      let s = 0;
      for (let k = Math.max(a, c); k < q; k++) s += Ri[a][k] * Ri[c][k];
      xtxInv[keep[a]][keep[c]] = s;
    }
  const fit = X.map((r) => keep.reduce((s, j) => s + r[j] * b[j], 0));
  const sse = y.reduce((s, v, i) => s + (v - fit[i]) ** 2, 0);
  // (the leverage: xᵢ (XᵀX)⁻¹ xᵢᵀ)
  const h = X.map((r) => {
    let s = 0;
    for (const a of keep) for (const c of keep) s += r[a] * xtxInv[a][c] * r[c];
    return s;
  });
  return { b, xtxInv, sse, rank: q, h, aliased };
}
export { tInv, tP2, fSf, normCdf };
