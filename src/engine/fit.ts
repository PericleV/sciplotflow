// Running a fit: one curve, every run of a sweep on its own, or all runs at once with some parameters shared (global
// fit). Points masked or outside the fit ranges are left out; weights 1/σ² from the ±Y column (instrumental), from √|y|
// (statistical) or none. Results: parameters ± standard errors (covariance scaled by the reduced χ²), χ², R²,
// the model on a fine grid with its 95 % confidence or prediction band, and the residuals.
import { levenbergMarquardt, tQuantile } from './lm.ts';
import { etaToMu, keep, type Model, type ModelCtx, type ParamKind, type Run } from './fitModels.ts';
import { maxOf, minOf } from './minmax.ts';
import { compile } from './expr.ts';

// value NaN: guessed; link: a formula of the other parameters that gives this one (w2 = w1, xc2 = xc1 + 1.15, A2 = 0.5*A1)
export type FitParamSpec = { name: string; value: number; fixed: boolean; min: number; max: number; shared: boolean; link?: string };
export type FitWeight = 'auto' | 'none' | 'instrumental' | 'statistical';
export type FitBand = 'none' | 'confidence' | 'prediction';
export type FitRunData = { label: string; value: number; xs: number[]; ys: number[]; sig: number[]; sx?: number[] }; // sig: 1 without weights; sx: σ of X (York)
export type FitStats = { n: number; dof: number; chi2: number; redChi2: number; r2: number; adjR2: number; rmse: number; iterations: number };
export type ParamResult = { name: string; value: number; error: number; fixed: boolean; shared: boolean; linked?: boolean };
// of: the data run (Y column) it was fitted on, range: the number of its range (a fit per range)
// cov: the covariance of all the parameters (fixed: 0; linked: from the free ones), for the values derived from them
export type RunResult = { of?: string; range?: number; label: string; value: number; params: ParamResult[]; stats: FitStats; curve: { x: Float64Array; y: Float64Array; band: Float64Array | null }; resid: { x: number[]; r: number[] }; cov?: number[][] };

// The settings of a parameter by its name; a pseudo-Voigt's μ (mu, mu1 …) not set: its former η (eta, eta1 …, the
// Lorentzian part of the height), as μ
export function findSpec(specs: FitParamSpec[], name: string, kind?: ParamKind): FitParamSpec {
  const s = specs.find((q) => q.name === name);
  if (s) return s;
  const old = kind === 'fraction' && name.startsWith('mu') ? specs.find((q) => q.name === `eta${name.slice(2)}`) : undefined;
  if (old) return { ...old, name, value: etaToMu(old.value), min: etaToMu(old.min), max: etaToMu(old.max) };
  return { name, value: NaN, fixed: false, min: NaN, max: NaN, shared: false };
}

// The constraints written as lines “name = formula of the other parameters” (; or new lines between them): the links,
// and what is wrong with a line (not a parameter, a formula that does not read, a name that is not a parameter)
export function parseLinks(text: string | undefined, names: string[]): { links: Record<string, string>; errors: string[] } {
  const links: Record<string, string> = {};
  const errors: string[] = [];
  for (const raw of (text ?? '').split(/[;\n]/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([A-Za-z_][\w]*)\s*=\s*(.+)$/.exec(line);
    if (!m) {
      errors.push(`Constraint “${line}”: write it as name = formula.`);
      continue;
    }
    const [, name, f] = m;
    if (!names.includes(name)) {
      errors.push(`Constraint “${line}”: no parameter “${name}”.`);
      continue;
    }
    const c = compile(f);
    if (typeof c === 'string') {
      errors.push(`Constraint “${line}”: ${c}`);
      continue;
    }
    const bad = c.names.filter((v) => !names.includes(v));
    if (bad.length) {
      errors.push(`Constraint “${line}”: no parameter ${bad.map((b) => `“${b}”`).join(', ')}.`);
      continue;
    }
    links[name] = f;
  }
  return { links, errors };
}

// The linked parameters in the order they can be computed (each from free ones or ones computed before it); those in a
// circle are left out (said)
function linkPlan(sp: FitParamSpec[], warnings: string[]): { j: number; fn: (p: number[]) => number }[] {
  const names = sp.map((s) => s.name);
  const raw = sp
    .map((s, j) => {
      if (!s.link?.trim()) return null;
      const c = compile(s.link);
      if (typeof c === 'string' || c.names.some((v) => !names.includes(v))) {
        warnings.push(`${s.name} = ${s.link}: ${typeof c === 'string' ? c : 'not a formula of the parameters'}: left free.`);
        return null;
      }
      const vars: Record<string, number> = {};
      const idx = c.names.map((v) => names.indexOf(v));
      return {
        j,
        deps: idx,
        fn: (p: number[]) => {
          idx.forEach((i, k) => (vars[c.names[k]] = p[i]));
          return c.fn(vars);
        },
      };
    })
    .filter((q): q is NonNullable<typeof q> => !!q);
  const linked = new Set(raw.map((q) => q.j));
  const done = new Set<number>();
  const plan: { j: number; fn: (p: number[]) => number }[] = [];
  let left = raw;
  while (left.length) {
    const ready = left.filter((q) => q.deps.every((i) => !linked.has(i) || done.has(i)));
    if (!ready.length) {
      warnings.push(`Constraints in a circle (${left.map((q) => names[q.j]).join(', ')}): left free.`);
      for (const q of left) sp[q.j].link = undefined;
      break;
    }
    for (const q of ready) {
      plan.push({ j: q.j, fn: q.fn });
      done.add(q.j);
    }
    left = left.filter((q) => !done.has(q.j));
  }
  return plan;
}

// the covariance of all the parameters p = pOf(q): J·C·Jᵀ, J = ∂p/∂q (a free parameter: its own column)
function fullCov(P: number, pOf: (q: number[]) => number[], q: number[], cov: number[][] | null): number[][] | undefined {
  if (!cov) return undefined;
  const p0 = pOf(q);
  const J = q.map((v, i) => {
    const h = 1e-7 * Math.max(Math.abs(v), 1e-3);
    const qq = q.slice();
    qq[i] += h;
    const p1 = pOf(qq);
    return p0.map((x, j) => (p1[j] - x) / h);
  });
  const out = Array.from({ length: P }, () => new Array<number>(P).fill(0));
  for (let a = 0; a < P; a++)
    for (let b = a; b < P; b++) {
      let s = 0;
      for (let i = 0; i < q.length; i++) {
        if (!J[i][a]) continue;
        for (let k = 0; k < q.length; k++) s += J[i][a] * cov[i][k] * J[k][b];
      }
      out[a][b] = out[b][a] = s;
    }
  return out;
}

// the errors of the linked parameters: σ² = gᵀ·C·g, g their derivatives by the free values q (p = pOf(q))
function linkedErrors(plan: { j: number }[], pOf: (q: number[]) => number[], q: number[], cov: number[][] | null, err: number[]) {
  if (!plan.length || !cov) return;
  const p0 = pOf(q);
  const g = q.map((v, i) => {
    const h = 1e-7 * Math.max(Math.abs(v), 1e-3);
    const qq = q.slice();
    qq[i] += h;
    const p1 = pOf(qq);
    return plan.map(({ j }) => (p1[j] - p0[j]) / h);
  });
  plan.forEach(({ j }, k) => {
    let s = 0;
    for (let a = 0; a < q.length; a++) for (let b = 0; b < q.length; b++) s += g[a][k] * cov[a][b] * g[b][k];
    err[j] = Math.sqrt(Math.max(0, s));
  });
}

function stats(model: Model, p: number[], run: FitRunData, c: ModelCtx, nFree: number, iterations: number): FitStats {
  let chi2 = 0;
  let ssr = 0;
  let my = 0;
  for (const y of run.ys) my += y;
  my /= run.ys.length || 1;
  let sst = 0;
  run.xs.forEach((x, i) => {
    const d = model.f(x, p, c) - run.ys[i];
    ssr += d * d;
    chi2 += (d / run.sig[i]) ** 2;
    sst += (run.ys[i] - my) ** 2;
  });
  const n = run.xs.length;
  const dof = Math.max(0, n - nFree);
  const r2 = sst > 0 ? 1 - ssr / sst : NaN;
  return { n, dof, chi2, redChi2: dof ? chi2 / dof : NaN, r2, adjR2: dof && n > 1 ? 1 - ((1 - r2) * (n - 1)) / dof : NaN, rmse: Math.sqrt(ssr / (n || 1)), iterations };
}

// The model on a grid over the run's x range, with its band: t·√(gᵀ C g) (+ the scatter σ² for a prediction band).
function curveOf(model: Model, p: number[], free: number[], cov: number[][] | null, run: FitRunData, c: ModelCtx, points: number, band: 'none' | 'confidence' | 'prediction', redChi2: number, dof: number, relink: (p: number[]) => number[] = (q) => q, span?: [number, number]) {
  const [lo, hi] = span && span[1] > span[0] ? span : [minOf(run.xs), maxOf(run.xs)];
  const m = Math.max(2, Math.min(20000, Math.floor(points) || 400));
  const x = Float64Array.from({ length: m }, (_, k) => lo + ((hi - lo) * k) / (m - 1));
  const y = Float64Array.from(x, (v) => model.f(v, p, c));
  let b: Float64Array | null = null;
  if (band !== 'none' && cov && dof > 0) {
    const t = tQuantile(0.975, dof);
    b = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const g = free.map((j) => {
        const h = 1e-7 * Math.max(Math.abs(p[j]), 1e-3);
        const q = p.slice();
        q[j] += h;
        return (model.f(x[k], relink(q), c) - y[k]) / h;
      });
      let v = 0;
      for (let a = 0; a < g.length; a++) for (let bb = 0; bb < g.length; bb++) v += g[a] * cov[a][bb] * g[bb];
      if (band === 'prediction') v += Number.isFinite(redChi2) ? redChi2 : 0;
      b[k] = t * Math.sqrt(Math.max(0, v));
    }
  }
  return { x, y, band: b };
}

// A coupled-oscillator spectrum has many local minima (the splitting and the width of a dark mode can be anything):
// several starts are tried and the best fit kept.
function starts(model: Model, p0: number[], fixed: boolean[]): number[][] {
  const names = model.params.map((q) => q.name);
  const iW = names.indexOf('W');
  const iw2 = names.indexOf('w2');
  if (iW < 0 || iw2 < 0 || names.indexOf('r') < 0) return [p0];
  const W0 = Math.abs(p0[iW]) || 1;
  const w20 = Math.abs(p0[iw2]) || 0.1;
  const Ws = fixed[iW] ? [W0] : [W0, W0 / 4, W0 * 2.5, W0 * 6, W0 / 12];
  const w2s = fixed[iw2] ? [w20] : [w20, w20 * 10];
  return Ws.flatMap((W) => w2s.map((w2) => p0.map((v, i) => (i === iW ? W : i === iw2 ? w2 : v))));
}

// The σ of every point with the error of X too (effective variance): √(σy² + (f′(x)·σx)²) — for a straight line the
// objective of York's fit; else the σ of Y
function effSig(model: Model, run: FitRunData, p: number[], c: ModelCtx, on: boolean): number[] {
  if (!on || !run.sx) return run.sig;
  return run.xs.map((x, i) => {
    const sx = run.sx![i];
    if (!(sx > 0)) return run.sig[i];
    const h = 1e-5 * Math.max(Math.abs(x), sx, 1e-12);
    const d = (model.f(x + h, p, c) - model.f(x - h, p, c)) / (2 * h);
    return Math.sqrt(run.sig[i] ** 2 + (d * sx) ** 2);
  });
}

// xerr: the errors of X (run.sx) counted — effective variance
// span: the x the curves are drawn over (absent: every run's own)
export function runFits(model: Model, specs: FitParamSpec[], runs: FitRunData[], opts: { global: boolean; band: FitBand; points: number; ctx: Omit<ModelCtx, 'run'>; xerr?: boolean; span?: [number, number] }): { runs: RunResult[]; warnings: string[] } {
  const warnings: string[] = [];
  const xe = !!opts.xerr;
  const P = model.params.length;
  const sp = model.params.map((q) => ({ ...findSpec(specs, q.name, q.kind) }));
  const clamp = (j: number, v: number) => {
    let w = keep(model.params[j].kind, v);
    if (Number.isFinite(sp[j].min)) w = Math.max(sp[j].min, w);
    if (Number.isFinite(sp[j].max)) w = Math.min(sp[j].max, w);
    return w;
  };
  const ctxOf = (k: number): ModelCtx => ({ ...opts.ctx, run: k + 1 });
  // starting values: the ones given, else guessed from the data (of that run, or of all runs)
  const limits = sp.map((s): [number, number] => [s.min, s.max]);
  const guessFor = (rs: Run[], k: number) => {
    const g = sp.some((s) => !Number.isFinite(s.value)) ? model.guess(rs, ctxOf(k), limits) : [];
    return sp.map((s, j) => {
      if (Number.isFinite(s.value)) return clamp(j, s.value);
      let v = g[j] ?? 1;
      // a guess outside the limits: inside them (the middle, or a little in from the one limit)
      const [lo, hi] = [s.min, s.max];
      if ((Number.isFinite(lo) && v < lo) || (Number.isFinite(hi) && v > hi)) {
        if (Number.isFinite(lo) && Number.isFinite(hi)) v = (lo + hi) / 2;
        else if (Number.isFinite(hi)) v = hi - (Math.abs(v - hi) || Math.abs(hi) * 0.1 || 0.1);
        else v = lo + (Math.abs(v - lo) || Math.abs(lo) * 0.1 || 0.1);
      }
      return clamp(j, v);
    });
  };
  const usable = runs.filter((r) => r.xs.length > 0);
  if (usable.length < runs.length) warnings.push(`${runs.length - usable.length} run${runs.length - usable.length > 1 ? 's have' : ' has'} no point to fit.`);
  const out: RunResult[] = [];
  // a two-branch model (anticrossing) is one fit of both branches: all its parameters shared
  if (model.joint) sp.forEach((s) => (s.shared = true));
  // the linked parameters: computed from the others, not fitted
  const plan = linkPlan(sp, warnings);
  const isLinked = sp.map((_, j) => plan.some((q) => q.j === j));
  const relink = (p: number[]) => {
    for (const q of plan) p[q.j] = q.fn(p);
    return p;
  };
  const off = (j: number) => sp[j].fixed || isLinked[j];
  const global = (opts.global || !!model.joint) && usable.length > 1 && sp.some((s, j) => s.shared && !off(j));
  if (!global) {
    usable.forEach((run) => {
      const k = runs.indexOf(run);
      const c = ctxOf(k);
      const pStart = guessFor([run], k);
      const free = sp.map((_, j) => (off(j) ? -1 : j)).filter((j) => j >= 0);
      if (run.xs.length < free.length) {
        warnings.push(`${run.label}: ${run.xs.length} points for ${free.length} free parameters.`);
        return;
      }
      let best: { p: number[]; ssr: number; cov: number[][] | null; sigma: number[]; iterations: number } | null = null;
      for (const s0 of starts(model, pStart, sp.map((s) => s.fixed))) {
        const full = (q: number[]) => {
          const p = s0.slice();
          free.forEach((j, i) => (p[j] = q[i]));
          return relink(p);
        };
        const residual = (q: number[]) => {
          const p = full(q);
          const r = new Float64Array(run.xs.length);
          const sg = effSig(model, run, p, c, xe);
          for (let i = 0; i < r.length; i++) r[i] = (model.f(run.xs[i], p, c) - run.ys[i]) / sg[i];
          return r;
        };
        const res = levenbergMarquardt(residual, free.map((j) => s0[j]), (q) => q.map((v, i) => clamp(free[i], v)));
        if (!best || res.ssr < best.ssr) best = { ...res, p: full(res.p) };
      }
      const b = best!;
      const err = new Array<number>(P).fill(0);
      free.forEach((j, i) => (err[j] = b.sigma[i]));
      const pOfQ = (q: number[]) => {
        const p = b.p.slice();
        free.forEach((j, i) => (p[j] = q[i]));
        return relink(p);
      };
      linkedErrors(plan, pOfQ, free.map((j) => b.p[j]), b.cov, err);
      // peaks numbered from left to right in every run (peak 1 always the one at the smaller x); not when linked (the
      // constraints name them)
      const order = plan.length ? null : model.sortPeaks?.(b.p, err);
      const cov = order ? null : b.cov;
      const st = stats(model, b.p, { ...run, sig: effSig(model, run, b.p, c, xe) }, c, free.length, b.iterations);
      out.push({
        label: run.label,
        value: run.value,
        params: sp.map((s, j) => ({ name: s.name, value: b.p[j], error: s.fixed && !isLinked[j] ? NaN : err[j], fixed: s.fixed && !isLinked[j], shared: false, ...(isLinked[j] ? { linked: true } : {}) })),
        stats: st,
        curve: curveOf(model, b.p, free, cov ?? (order ? reorderCov(b.cov, free, order) : null), run, c, opts.points, opts.band, st.redChi2, st.dof, relink, opts.span),
        resid: { x: run.xs, r: run.xs.map((x, i) => run.ys[i] - model.f(x, b.p, c)) },
        // (the peaks renumbered: the covariance in their new order)
        cov: fullCov(P, pOfQ, free.map((j) => b.p[j]), order ? reorderCov(b.cov, free, order) : b.cov),
      });
    });
    return { runs: out, warnings };
  }
  // global: [shared free …, then for every run its own free …]
  const shared = sp.map((s, j) => (s.shared && !off(j) ? j : -1)).filter((j) => j >= 0);
  const own = sp.map((s, j) => (!s.shared && !off(j) ? j : -1)).filter((j) => j >= 0);
  const R = usable.length;
  const perRun = usable.map((run) => guessFor([run], runs.indexOf(run)));
  const allGuess = guessFor(usable, 0);
  const q0 = [...shared.map((j) => (Number.isFinite(sp[j].value) ? sp[j].value : allGuess[j])), ...perRun.flatMap((p) => own.map((j) => p[j]))];
  const pOf = (q: number[], r: number) => {
    const p = perRun[r].slice();
    shared.forEach((j, i) => (p[j] = q[i]));
    own.forEach((j, i) => (p[j] = q[shared.length + r * own.length + i]));
    return relink(p);
  };
  const m = usable.reduce((a, r) => a + r.xs.length, 0);
  const residual = (q: number[]) => {
    const out = new Float64Array(m);
    let o = 0;
    usable.forEach((run, r) => {
      const p = pOf(q, r);
      const c = ctxOf(runs.indexOf(run));
      const sg = effSig(model, run, p, c, xe);
      for (let i = 0; i < run.xs.length; i++) out[o++] = (model.f(run.xs[i], p, c) - run.ys[i]) / sg[i];
    });
    return out;
  };
  const idx = (r: number) => [...shared, ...own.map((j) => j)].map((j, i) => [j, i < shared.length ? i : shared.length + r * own.length + (i - shared.length)] as const);
  const res = levenbergMarquardt(residual, q0, (q) => q.map((v, i) => clamp(i < shared.length ? shared[i] : own[(i - shared.length) % Math.max(1, own.length)], v)));
  const nFree = q0.length;
  usable.forEach((run, r) => {
    const p = pOf(res.p, r);
    const c = ctxOf(runs.indexOf(run));
    const err = new Array<number>(P).fill(NaN);
    for (const [j, i] of idx(r)) err[j] = res.sigma[i];
    linkedErrors(plan, (q) => pOf(q, r), res.p, res.cov, err);
    // this run's part of the covariance, for its band
    const map = idx(r);
    const cov = res.cov ? map.map(([, a]) => map.map(([, b]) => res.cov![a][b])) : null;
    const st = stats(model, p, { ...run, sig: effSig(model, run, p, c, xe) }, c, nFree / R, res.iterations);
    out.push({
      label: run.label,
      value: run.value,
      params: sp.map((s, j) => ({ name: s.name, value: p[j], error: s.fixed && !isLinked[j] ? NaN : err[j], fixed: s.fixed && !isLinked[j], shared: s.shared && !off(j), ...(isLinked[j] ? { linked: true } : {}) })),
      stats: st,
      curve: curveOf(model, p, map.map(([j]) => j), cov, run, c, opts.points, opts.band, st.redChi2, st.dof, relink, opts.span),
      resid: { x: run.xs, r: run.xs.map((x, i) => run.ys[i] - model.f(x, p, c)) },
      cov: fullCov(P, (q) => pOf(q, r), res.p, res.cov),
    });
  });
  return { runs: out, warnings };
}

// The statistics of all the runs together (a global fit: one χ²).
export function totalStats(rs: RunResult[]): { n: number; chi2: number; r2: number } {
  const n = rs.reduce((a, r) => a + r.stats.n, 0);
  return { n, chi2: rs.reduce((a, r) => a + r.stats.chi2, 0), r2: rs.reduce((a, r) => a + (Number.isFinite(r.stats.r2) ? r.stats.r2 * r.stats.n : 0), 0) / (n || 1) };
}

// The covariance of the free parameters after the peaks were renumbered (order[j]: where parameter j's value came from).
function reorderCov(cov: number[][] | null, free: number[], order: number[]): number[][] | null {
  if (!cov) return null;
  const at = (j: number) => free.indexOf(order[j]);
  return free.map((a) => free.map((b) => {
    const [i, k] = [at(a), at(b)];
    return i >= 0 && k >= 0 ? cov[i][k] : 0;
  }));
}
