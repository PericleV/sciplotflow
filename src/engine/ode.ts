// A fit model given by differential equations: lines “dA/dx = …” (or d…/dt: the variable after the d), the starting
// values “A(0) = …” (all at the same X), and what is measured “y = …” (absent with one equation: that one). Every other
// name is a parameter, in the order written. Solved by the Dormand–Prince 5(4) pair with an adaptive step, from the
// starting X forward and backward as far as asked; between the steps a cubic of the values and the slopes. The last
// solutions are kept (the fit asks for many X with the same parameters). Pure.
import { compile, type Compiled } from './expr.ts';
import type { Model, ParamKind } from './fitModels.ts';

type Parsed = { states: string[]; indep: string; rhs: Compiled[]; ics: Compiled[]; x0: number; out: Compiled; params: string[] };

export function parseOde(text: string): Parsed | string {
  const lines = text
    .split(/[;\n]/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return 'Write the equations: dA/dx = -k*A, A(0) = A0 (and y = … when there are several).';
  const states: string[] = [];
  const rhsSrc: string[] = [];
  const icSrc: Record<string, string> = {};
  let x0: number | null = null;
  let indep = '';
  let outSrc = '';
  for (const l of lines) {
    let m = /^d\s*([A-Za-z_]\w*)\s*\/\s*d\s*([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(l);
    if (m) {
      if (indep && m[2] !== indep) return `“${l}”: one variable for all the equations (d…/d${indep}).`;
      indep = m[2];
      if (states.includes(m[1])) return `${m[1]}: two equations.`;
      states.push(m[1]);
      rhsSrc.push(m[3]);
      continue;
    }
    m = /^([A-Za-z_]\w*)\s*\(\s*([-+0-9.eE]+)\s*\)\s*=\s*(.+)$/.exec(l);
    if (m) {
      const at = Number(m[2]);
      if (!Number.isFinite(at)) return `“${l}”: the starting X must be a number.`;
      if (x0 !== null && at !== x0) return 'All the starting values at the same X.';
      x0 = at;
      icSrc[m[1]] = m[3];
      continue;
    }
    m = /^y\s*=\s*(.+)$/.exec(l);
    if (m) {
      outSrc = m[1];
      continue;
    }
    return `“${l}”: write dA/dx = …, A(0) = …, or y = ….`;
  }
  if (!states.length) return 'No equation dA/dx = ….';
  const missing = states.filter((s) => !(s in icSrc));
  if (missing.length) return `The starting value of ${missing.join(', ')}: ${missing[0]}(0) = ….`;
  const extra = Object.keys(icSrc).filter((s) => !states.includes(s));
  if (extra.length) return `${extra.join(', ')}(…) = …: no equation for ${extra.length > 1 ? 'them' : 'it'}.`;
  if (!outSrc) {
    if (states.length > 1) return 'Several equations: say what is measured, y = … (e.g. y = B).';
    outSrc = states[0];
  }
  const rhs: Compiled[] = [];
  for (const s of rhsSrc) {
    const c = compile(s);
    if (typeof c === 'string') return c;
    rhs.push(c);
  }
  const ics: Compiled[] = [];
  for (const s of states) {
    const c = compile(icSrc[s]);
    if (typeof c === 'string') return c;
    if (c.names.some((v) => states.includes(v) || v === indep)) return `${s}(…) = ${icSrc[s]}: a starting value of the parameters only.`;
    ics.push(c);
  }
  const out = compile(outSrc);
  if (typeof out === 'string') return out;
  // the parameters: every other name, in the order met
  const params: string[] = [];
  for (const c of [...rhs, ...ics, out]) for (const v of c.names) if (!states.includes(v) && v !== indep && v !== 'k' && !params.includes(v)) params.push(v);
  return { states, indep: indep || 'x', rhs, ics, x0: x0 ?? 0, out, params };
}

// Dormand–Prince 5(4)
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const Cn = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

type Branch = { t: number[]; y: number[][]; d: number[][]; h: number; dead: boolean };
type Solution = { key: string; fwd: Branch; bwd: Branch };

// the solver of one model: f(x, p) the measured value at x
export function odeModel(text: string): Model | string {
  const ps = parseOde(text);
  if (typeof ps === 'string') return ps;
  const { states, indep, rhs, ics, x0, out, params } = ps;
  const N = states.length;
  const vars: Record<string, number> = {};
  const setP = (p: number[]) => params.forEach((nm, j) => (vars[nm] = p[j]));
  const deriv = (t: number, y: number[]) => {
    vars[indep] = t;
    states.forEach((s, i) => (vars[s] = y[i]));
    return rhs.map((c) => c.fn(vars));
  };
  // one step of size h from (t, y) with slope k1: the new y, its error, its slope
  const step = (t: number, y: number[], k1: number[], h: number) => {
    const k: number[][] = [k1];
    for (let s = 1; s < 7; s++) {
      const ys = y.map((v, i) => v + h * A[s].reduce((a, c, j) => a + c * k[j][i], 0));
      k.push(deriv(t + Cn[s] * h, ys));
    }
    const y5 = y.map((v, i) => v + h * B5.reduce((a, c, j) => a + c * k[j][i], 0));
    const err = y.map((_, i) => h * B5.reduce((a, c, j) => a + (c - B4[j]) * k[j][i], 0));
    return { y5, err, k7: k[6] };
  };
  // carries a branch on until it passes `to` (forward: dir 1)
  const extend = (b: Branch, to: number, dir: 1 | -1, span: number) => {
    let steps = 0;
    while (!b.dead && dir * (to - b.t[b.t.length - 1]) > 0) {
      const t = b.t[b.t.length - 1];
      const y = b.y[b.y.length - 1];
      const k1 = b.d[b.d.length - 1];
      let h = Math.min(b.h, Math.max(Math.abs(to - t), span * 1e-9)) * dir;
      for (let tries = 0; ; tries++) {
        const r = step(t, y, k1, h);
        let e = 0;
        for (let i = 0; i < N; i++) e = Math.max(e, Math.abs(r.err[i]) / (1e-10 + 1e-8 * Math.max(Math.abs(y[i]), Math.abs(r.y5[i]))));
        if (Number.isFinite(e) && e <= 1) {
          b.t.push(t + h);
          b.y.push(r.y5);
          b.d.push(r.k7);
          b.h = Math.abs(h) * Math.min(5, 0.9 * Math.pow(Math.max(e, 1e-10), -0.2));
          break;
        }
        h *= Number.isFinite(e) ? Math.max(0.1, 0.9 * Math.pow(e, -0.25)) : 0.1;
        if (tries > 60 || Math.abs(h) < span * 1e-14) {
          b.dead = true;
          break;
        }
      }
      if (++steps > 200000) b.dead = true;
    }
  };
  const cache: Solution[] = [];
  const solution = (p: number[], run: number) => {
    const key = `${run}|${p.join(',')}`;
    let s = cache.find((q) => q.key === key);
    if (s) return s;
    setP(p);
    vars.k = run;
    const y0 = ics.map((c) => c.fn(vars));
    const d0 = deriv(x0, y0);
    const h0 = 1e-3;
    s = { key, fwd: { t: [x0], y: [y0], d: [d0], h: h0, dead: !y0.every(Number.isFinite) }, bwd: { t: [x0], y: [y0], d: [d0], h: h0, dead: !y0.every(Number.isFinite) } };
    cache.unshift(s);
    if (cache.length > 6) cache.pop();
    return s;
  };
  // the states at x: the cubic between the two steps around it
  const at = (b: Branch, x: number): number[] | null => {
    const t = b.t;
    const n = t.length;
    const asc = t[n - 1] >= t[0];
    let [lo, hi] = [0, n - 1];
    if (!(asc ? x <= t[hi] : x >= t[hi])) return null;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (asc ? t[m] <= x : t[m] >= x) lo = m;
      else hi = m;
    }
    if (hi === lo) return b.y[lo];
    const h = t[hi] - t[lo];
    const u = (x - t[lo]) / h;
    const [h00, h10, h01, h11] = [2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2];
    return b.y[lo].map((v, i) => h00 * v + h10 * h * b.d[lo][i] + h01 * b.y[hi][i] + h11 * h * b.d[hi][i]);
  };
  const kinds: ParamKind[] = params.map(() => 'free');
  return {
    params: params.map((name, j) => ({ name, kind: kinds[j] })),
    note: `${text
      .split(/[;\n]/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join('; ')} — solved from ${indep} = ${x0}`,
    f: (x, p, c) => {
      const s = solution(p, c.run);
      setP(p);
      vars.k = c.run;
      const span = Math.max(1e-12, Math.abs(x - x0));
      const b = x >= x0 ? s.fwd : s.bwd;
      if (x >= x0) extend(b, x, 1, span);
      else extend(b, x, -1, span);
      const y = at(b, x);
      if (!y) return NaN;
      setP(p);
      vars[indep] = x;
      vars.k = c.run;
      states.forEach((st, i) => (vars[st] = y[i]));
      return out.fn(vars);
    },
    guess: (runs) => {
      // a starting value that is a parameter, of the state measured: the data nearest the start
      const g = params.map(() => 1);
      const xs = runs.flatMap((r) => r.xs);
      const ys = runs.flatMap((r) => r.ys);
      if (xs.length) {
        let k = 0;
        for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x0) < Math.abs(xs[k] - x0)) k = i;
        states.forEach((st, i) => {
          if (out.names.length === 1 && out.names[0] === st && ics[i].names.length === 1) {
            const j = params.indexOf(ics[i].names[0]);
            if (j >= 0) g[j] = ys[k] || 1;
          }
        });
      }
      return g;
    },
  };
}
