// Life data (reliability, survival): values that failed and values still running when the test stopped (right
// censored, “suspended”). Johnson's adjusted ranks for the plotting positions of the failures; the parameters of a
// distribution by maximum likelihood with the suspensions (closed forms for Weibull and Exponential, Nelder–Mead for
// the others) or by rank regression (RRX: X on Y, RRY: Y on X, on the probability scale); a threshold γ (3-parameter:
// the values less γ) by the profile likelihood or the straightest plot; Fisher-matrix confidence intervals of the
// parameters and of the B lives (the time by which p % failed); Kaplan–Meier's survival with Greenwood's intervals
// (log–log). Pure.
import { makeDist, fitDist, plotPositions, type Dist, type PlotPositions, type ProbDist } from './probplot.ts';
import { normInv } from './dist.ts';
import { probT } from '../figure/ticks.ts';
import type { ProbAxis } from '../figure/spec.ts';

// a status: failed (1, F, failed, failure, event, true, yes) or suspended (0, S, suspended, censored, C, R, false, no)
export function suspendedOf(text: string | undefined, value: number): boolean | null {
  const t = (text ?? '').trim().toLowerCase();
  if (t) {
    if (/^(0|s|susp|suspended|suspension|c|cens|censored|r|right|runout|run-out|false|no|n|alive|survived)$/.test(t)) return true;
    if (/^(1|f|fail|failed|failure|e|event|true|yes|y|dead|died)$/.test(t)) return false;
    return null;
  }
  if (value === 0) return true;
  if (value === 1) return false;
  return null;
}

// ---- plotting positions with suspensions: Johnson's adjusted ranks ----
// sorted values and their status; the positions of the failures, in their order, by the chosen formula on the adjusted
// ranks (no suspension: the ranks 1 … n, the positions as without censoring)
export function adjustedPositions(x: number[], susp: boolean[], how: PlotPositions): number[] {
  const n = x.length;
  if (!susp.some(Boolean)) return plotPositions(n, how);
  const ranks: number[] = [];
  let prev = 0;
  x.forEach((_, i) => {
    if (susp[i]) return;
    const reverse = n - i; // items at or after this one
    prev += (n + 1 - prev) / (1 + reverse);
    ranks.push(prev);
  });
  if (how === 'filliben') return ranks.map((j) => (j - 0.3175) / (n + 0.365));
  const a = how === 'blom' ? 0.375 : how === 'benard' ? 0.3 : how === 'hazen' ? 0.5 : 0;
  return ranks.map((j) => (j - a) / (n + 1 - 2 * a));
}

// ---- the parameters on an unbounded scale (log of the positive ones), for the optimizer and the Fisher matrix ----
const POS_PARAMS: Record<ProbDist, boolean[]> = {
  normal: [false, true],
  lognormal: [false, true],
  exponential: [true],
  weibull: [true, true],
  gamma: [true, true],
  logistic: [false, true],
  gumbel: [false, true],
  uniform: [false, false],
};
export const toTheta = (kind: ProbDist, p: number[]) => p.map((v, k) => (POS_PARAMS[kind][k] ? Math.log(v) : v));
export const fromTheta = (kind: ProbDist, t: number[]) => t.map((v, k) => (POS_PARAMS[kind][k] ? Math.exp(v) : v));

// the log-likelihood of failures and suspensions (the values already less the threshold)
export function logLik(kind: ProbDist, p: number[], fail: number[], susp: number[]): number {
  const D = makeDist(kind, p);
  let s = 0;
  for (const x of fail) s += Math.log(Math.max(1e-300, D.pdf(x)));
  for (const x of susp) s += Math.log(Math.max(1e-300, 1 - D.cdf(x)));
  return Number.isFinite(s) ? s : -Infinity;
}

// Nelder–Mead: the minimum of f from x0 (steps: the first simplex)
export function nelderMead(f: (x: number[]) => number, x0: number[], steps: number[], iters = 4000, tol = 1e-13): number[] {
  const n = x0.length;
  let pts = [x0, ...steps.map((s, k) => x0.map((v, j) => (j === k ? v + s : v)))];
  let vals = pts.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((_, k) => k).sort((a, b) => vals[a] - vals[b]);
    pts = order.map((k) => pts[k]);
    vals = order.map((k) => vals[k]);
    if (Math.abs(vals[n] - vals[0]) <= tol * (Math.abs(vals[0]) + 1e-30) && it > 20) break;
    const c = Array.from({ length: n }, (_, j) => pts.slice(0, n).reduce((s, q) => s + q[j], 0) / n);
    const along = (t: number) => c.map((v, j) => v + t * (pts[n][j] - v));
    const r = along(-1);
    const fr = f(r);
    if (fr < vals[0]) {
      const e = along(-2);
      const fe = f(e);
      [pts[n], vals[n]] = fe < fr ? [e, fe] : [r, fr];
    } else if (fr < vals[n - 1]) [pts[n], vals[n]] = [r, fr];
    else {
      const k = fr < vals[n] ? along(-0.5) : along(0.5);
      const fk = f(k);
      if (fk < Math.min(fr, vals[n])) [pts[n], vals[n]] = [k, fk];
      else {
        for (let i = 1; i <= n; i++) {
          pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j]));
          vals[i] = f(pts[i]);
        }
      }
    }
  }
  return pts[vals.indexOf(Math.min(...vals))];
}

// the maximum likelihood with suspensions (none: as without censoring)
export function fitMLE(kind: ProbDist, fail: number[], susp: number[]): number[] {
  if (!susp.length) return fitDist(kind, fail);
  const all = [...fail, ...susp];
  const r = fail.length;
  if (kind === 'exponential') return [all.reduce((s, v) => s + v, 0) / r];
  if (kind === 'weibull') {
    // 1/k + Σ_f ln t / r = Σ t^k ln t / Σ t^k; λ = (Σ t^k / r)^(1/k)   (t = x / max, so the powers stay finite)
    const c = Math.max(...all);
    const la = all.map((v) => Math.log(v / c));
    const lf = fail.map((v) => Math.log(v / c));
    const mf = lf.reduce((s, v) => s + v, 0) / r;
    const g = (lk: number) => {
      const k = Math.exp(lk);
      let [s0, s1] = [0, 0];
      for (const l of la) {
        const w = Math.exp(k * l);
        s0 += w;
        s1 += w * l;
      }
      return s1 / s0 - 1 / k - mf;
    };
    let [a, b] = [Math.log(1e-4), Math.log(1e4)];
    // bisection (the function increases with k)
    for (let it = 0; it < 200; it++) {
      const m = (a + b) / 2;
      if (g(m) > 0) b = m;
      else a = m;
    }
    const k = Math.exp((a + b) / 2);
    return [k, c * (la.reduce((s, l) => s + Math.exp(k * l), 0) / r) ** (1 / k)];
  }
  // the others: Nelder–Mead on the parameters' unbounded scale, from the fit of the failures alone
  const start = toTheta(kind, fitDist(kind, fail.length >= 2 ? fail : all));
  const best = nelderMead((t) => -logLik(kind, fromTheta(kind, t), fail, susp), start, start.map((v) => 0.1 * Math.max(1, Math.abs(v))));
  return fromTheta(kind, nelderMead((t) => -logLik(kind, fromTheta(kind, t), fail, susp), best, best.map((v) => 0.02 * Math.max(1, Math.abs(v)))));
}

// ---- rank regression on the probability scale: u = A + B·v (u = x or ln x, v = the axis' transform of p) ----
const AXIS_OF: Partial<Record<ProbDist, ProbAxis>> = { normal: 'normal', lognormal: 'normal', exponential: 'exp', weibull: 'sev', logistic: 'logistic', gumbel: 'lev' };
export const canRegress = (kind: ProbDist) => !!AXIS_OF[kind];
export function fitRR(kind: ProbDist, x: number[], pos: number[], how: 'rrx' | 'rry'): number[] | null {
  const ax = AXIS_OF[kind];
  if (!ax) return null;
  const v = pos.map((p) => probT(ax, 100 * p));
  const u = x.map((t) => (kind === 'lognormal' || kind === 'weibull' ? Math.log(t) : t));
  const n = v.length;
  if (kind === 'exponential') {
    // through the origin: x = β·v (RRX) or v = x / β (RRY)
    const svu = v.reduce((s, q, i) => s + q * u[i], 0);
    return how === 'rrx' ? [svu / v.reduce((s, q) => s + q * q, 0)] : [u.reduce((s, q) => s + q * q, 0) / svu];
  }
  const [mv, mu] = [v.reduce((s, q) => s + q, 0) / n, u.reduce((s, q) => s + q, 0) / n];
  let [svv, suu, svu] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    svv += (v[i] - mv) ** 2;
    suu += (u[i] - mu) ** 2;
    svu += (v[i] - mv) * (u[i] - mu);
  }
  // u = A + B v
  const B = how === 'rrx' ? svu / svv : suu / svu;
  const A = mu - B * mv;
  return kind === 'weibull' ? [1 / B, Math.exp(A)] : [A, B];
}

// the correlation of the probability plot (straightness) of values against positions
function ppcc(kind: ProbDist, x: number[], pos: number[]): number {
  const ax = AXIS_OF[kind];
  const D = ax ? null : makeDist(kind, fitDist(kind, x));
  const v = pos.map((p) => (ax ? probT(ax, 100 * p) : D!.std.ppf(p)));
  const u = x.map((t) => (kind === 'lognormal' || kind === 'weibull' ? Math.log(t) : t));
  const n = v.length;
  const [mv, mu] = [v.reduce((s, q) => s + q, 0) / n, u.reduce((s, q) => s + q, 0) / n];
  let [svv, suu, svu] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    svv += (v[i] - mv) ** 2;
    suu += (u[i] - mu) ** 2;
    svu += (v[i] - mv) * (u[i] - mu);
  }
  return svu / Math.sqrt(svv * suu);
}

// the threshold γ (below the smallest value): the largest profile likelihood (MLE) or the straightest plot (rank
// regression, and MLE when its likelihood grows without end at the smallest value); a coarse search then golden sections
export function fitThreshold(kind: ProbDist, x: number[], susp: boolean[], pos: number[], method: 'mle' | 'rrx' | 'rry'): number {
  const lo0 = Math.min(...x);
  const span = Math.max(...x) - lo0 || Math.abs(lo0) || 1;
  const hiG = lo0 - 1e-6 * span;
  const loG = lo0 - 3 * span;
  const fail = (g: number) => x.filter((_, i) => !susp[i]).map((v) => v - g);
  const sus = (g: number) => x.filter((_, i) => susp[i]).map((v) => v - g);
  const byPpcc = (g: number) => -ppcc(kind, fail(g), pos);
  const byLik = (g: number) => -logLik(kind, fitMLE(kind, fail(g), sus(g)), fail(g), sus(g));
  const search = (f: (g: number) => number) => {
    const m = 60;
    let best = 0;
    let bv = Infinity;
    const gs = Array.from({ length: m + 1 }, (_, k) => loG + ((hiG - loG) * k) / m);
    gs.forEach((g, k) => {
      const v = f(g);
      if (v < bv) [bv, best] = [v, k];
    });
    let a = gs[Math.max(0, best - 1)];
    let b = gs[Math.min(m, best + 1)];
    const r = (Math.sqrt(5) - 1) / 2;
    let c = b - r * (b - a);
    let d = a + r * (b - a);
    let fc = f(c);
    let fd = f(d);
    for (let it = 0; it < 80; it++) {
      if (fc < fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - r * (b - a);
        fc = f(c);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + r * (b - a);
        fd = f(d);
      }
    }
    return (a + b) / 2;
  };
  if (method === 'mle') {
    const g = search(byLik);
    // the likelihood unbounded at the smallest value (shape below 1): the straightest plot instead
    if (g < hiG - 1e-3 * span) return g;
  }
  return search(byPpcc);
}

// ---- Fisher-matrix intervals: the observed information on the unbounded scale (numerical second derivatives) ----
export function fisherCov(kind: ProbDist, p: number[], fail: number[], susp: number[]): number[][] | null {
  const t0 = toTheta(kind, p);
  const k = t0.length;
  const f = (t: number[]) => logLik(kind, fromTheta(kind, t), fail, susp);
  const h = t0.map((v) => 1e-4 * Math.max(1, Math.abs(v)));
  const H: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const at = (di: number, dj: number, i: number, j: number) => f(t0.map((v, q) => v + (q === i ? di : 0) + (q === j ? dj : 0)));
  for (let i = 0; i < k; i++)
    for (let j = i; j < k; j++) {
      const d2 = i === j ? (at(h[i], 0, i, i) - 2 * f(t0) + at(-h[i], 0, i, i)) / (h[i] * h[i]) : (at(h[i], h[j], i, j) - at(h[i], -h[j], i, j) - at(-h[i], h[j], i, j) + at(-h[i], -h[j], i, j)) / (4 * h[i] * h[j]);
      H[i][j] = H[j][i] = -d2;
    }
  if (k === 1) return H[0][0] > 0 ? [[1 / H[0][0]]] : null;
  const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
  if (!(det > 0) || !(H[0][0] > 0)) return null;
  return [
    [H[1][1] / det, -H[0][1] / det],
    [-H[1][0] / det, H[0][0] / det],
  ];
}

// the standard error of every parameter from the Fisher matrix (on the log scale for the positive ones: p·se(ln p))
export const paramSE = (kind: ProbDist, p: number[], cov: number[][] | null) => p.map((v, k) => (!cov ? NaN : POS_PARAMS[kind][k] ? Math.abs(v) * Math.sqrt(cov[k][k]) : Math.sqrt(cov[k][k])));

// a parameter's interval (level %): on the log scale for the positive ones
export function paramCI(kind: ProbDist, p: number[], cov: number[][] | null, level: number): [number, number][] {
  const z = normInv(1 - (1 - level / 100) / 2);
  const t = toTheta(kind, p);
  return t.map((v, k) => {
    const se = cov ? Math.sqrt(cov[k][k]) : NaN;
    const [a, b] = [v - z * se, v + z * se];
    return POS_PARAMS[kind][k] ? [Math.exp(a), Math.exp(b)] : [a, b];
  });
}

// the B life: the value by which q (0 … 1) of the units failed (γ added), its interval by the delta method (on the log
// scale for the positive distributions)
export function bLife(kind: ProbDist, p: number[], gamma: number, q: number, cov: number[][] | null, level: number): { value: number; lo: number; hi: number } {
  const D: Dist = makeDist(kind, p);
  const value = gamma + D.ppf(q);
  const positive = POS_PARAMS[kind].some(Boolean) && kind !== 'normal' && kind !== 'logistic' && kind !== 'gumbel';
  if (!cov) return { value, lo: NaN, hi: NaN };
  const t0 = toTheta(kind, p);
  const g = (t: number[]) => {
    const v = makeDist(kind, fromTheta(kind, t)).ppf(q);
    return positive ? Math.log(v) : v;
  };
  const grad = t0.map((v, k) => {
    const h = 1e-6 * Math.max(1, Math.abs(v));
    return (g(t0.map((w, j) => (j === k ? w + h : w))) - g(t0.map((w, j) => (j === k ? w - h : w)))) / (2 * h);
  });
  let s2 = 0;
  for (let i = 0; i < grad.length; i++) for (let j = 0; j < grad.length; j++) s2 += grad[i] * cov[i][j] * grad[j];
  const z = normInv(1 - (1 - level / 100) / 2);
  const c = g(t0);
  const [a, b] = [c - z * Math.sqrt(s2), c + z * Math.sqrt(s2)];
  return positive ? { value, lo: gamma + Math.exp(a), hi: gamma + Math.exp(b) } : { value, lo: gamma + a, hi: gamma + b };
}

// ---- Kaplan–Meier: the survival at every distinct failure, Greenwood's interval on the log(−log) scale ----
export type KM = { t: number[]; S: number[]; lo: number[]; hi: number[]; atRisk: number[]; censored: { t: number; S: number }[] };
export function kaplanMeier(x: number[], susp: boolean[], level: number): KM {
  const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b] || Number(susp[a]) - Number(susp[b]));
  const z = normInv(1 - (1 - level / 100) / 2);
  const out: KM = { t: [], S: [], lo: [], hi: [], atRisk: [], censored: [] };
  let S = 1;
  let gw = 0;
  let atRisk = x.length;
  let i = 0;
  while (i < order.length) {
    const t = x[order[i]];
    let d = 0;
    let c = 0;
    while (i < order.length && x[order[i]] === t) {
      if (susp[order[i]]) c++;
      else d++;
      i++;
    }
    if (d > 0) {
      S *= 1 - d / atRisk;
      if (atRisk > d) gw += d / (atRisk * (atRisk - d));
      out.t.push(t);
      out.S.push(S);
      out.atRisk.push(atRisk);
      if (S > 0 && S < 1) {
        const se = Math.sqrt(gw) / Math.abs(Math.log(S));
        const lls = Math.log(-Math.log(S));
        out.lo.push(Math.exp(-Math.exp(lls + z * se)));
        out.hi.push(Math.exp(-Math.exp(lls - z * se)));
      } else {
        out.lo.push(S);
        out.hi.push(S);
      }
    }
    for (let k = 0; k < c; k++) out.censored.push({ t, S });
    atRisk -= d + c;
  }
  return out;
}
