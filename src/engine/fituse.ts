// Using a fit: Y at given X (with its 95 % confidence and prediction intervals), X from measured Y (the inverse
// prediction of a calibration: the X where the model reaches Y, its interval from the scatter of the new measurement —
// the mean of m replicates — and the uncertainty of the curve), the limits of detection and quantification
// (3.3·s / slope and 10·s / slope, s the residual standard deviation, the slope at X = 0 or at the start of the data),
// and values derived from the parameters (name = formula of the parameters) with their errors from the covariance.
// First order (the delta method), t of the fit's degrees of freedom. Pure.
import { compile } from './expr.ts';
import type { RunResult } from './fit.ts';
import type { Model, ModelCtx } from './fitModels.ts';
import { tQuantile } from './lm.ts';

export type UseRow = { what: 'y at x' | 'x from y' | 'derived' | 'LOD' | 'LOQ'; name: string; input: number; value: number; error: number; lo: number; hi: number; plo?: number; phi?: number };
export type UseOptions = { inverse?: string; replicates?: number; at?: string; derived?: string; lod?: boolean };

// numbers written in a list: “0.1, 0.25; 0.4 1e-3”
export const numberList = (s: string | undefined) =>
  (s ?? '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

export function applyFit(model: Model, r: RunResult, ctx: ModelCtx, o: UseOptions): { rows: UseRow[]; warnings: string[] } {
  const rows: UseRow[] = [];
  const warnings: string[] = [];
  const p = r.params.map((q) => q.value);
  const P = p.length;
  const C = r.cov;
  const { dof, n, rmse } = r.stats;
  const t = dof > 0 ? tQuantile(0.975, dof) : NaN;
  // the scatter of a new measurement: the residual variance
  const s2 = dof > 0 ? (rmse * rmse * n) / dof : NaN;
  const f = (x: number, q: number[] = p) => model.f(x, q, ctx);
  // gᵀ·C·g of a function of the parameters
  const varOf = (h: (q: number[]) => number) => {
    if (!C) return NaN;
    const v0 = h(p);
    const g = p.map((v, j) => {
      if (!(C[j][j] > 0)) return 0;
      const d = 1e-7 * Math.max(Math.abs(v), 1e-3);
      const q = p.slice();
      q[j] += d;
      return (h(q) - v0) / d;
    });
    let s = 0;
    for (let a = 0; a < P; a++) if (g[a]) for (let b = 0; b < P; b++) s += g[a] * C[a][b] * g[b];
    return Math.max(0, s);
  };
  const slopeAt = (x: number) => {
    const h = 1e-6 * Math.max(Math.abs(x), (xmax - xmin) || 1);
    return (f(x + h) - f(x - h)) / (2 * h);
  };
  let [xmin, xmax] = [Infinity, -Infinity];
  for (const x of r.resid.x) [xmin, xmax] = [Math.min(xmin, x), Math.max(xmax, x)];
  // Y at X
  for (const x of numberList(o.at)) {
    const y = f(x);
    const vc = varOf((q) => f(x, q));
    const ci = t * Math.sqrt(vc);
    const pi = t * Math.sqrt(vc + s2);
    rows.push({ what: 'y at x', name: 'Y', input: x, value: y, error: Math.sqrt(vc), lo: y - ci, hi: y + ci, plo: y - pi, phi: y + pi });
    if (x < xmin || x > xmax) warnings.push(`Y at X = ${x}: outside the data fitted (an extrapolation).`);
  }
  // X from Y: the place where the model reaches Y, within the data (sampled, then halved)
  const m = Math.max(1, Math.round(o.replicates ?? 1));
  for (const y of numberList(o.inverse)) {
    const roots: number[] = [];
    if (Number.isFinite(xmin) && xmax > xmin) {
      const K = 600;
      let [xa, fa] = [xmin, f(xmin) - y];
      for (let k = 1; k <= K; k++) {
        const xb = xmin + ((xmax - xmin) * k) / K;
        const fb = f(xb) - y;
        if (fa === 0) roots.push(xa);
        else if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb < 0) {
          let [a, b, ga] = [xa, xb, fa];
          for (let i = 0; i < 80; i++) {
            const c = (a + b) / 2;
            const gc = f(c) - y;
            if (ga * gc <= 0) b = c;
            else [a, ga] = [c, gc];
          }
          roots.push((a + b) / 2);
        }
        [xa, fa] = [xb, fb];
      }
      if (fa === 0) roots.push(xa);
    }
    if (!roots.length) {
      warnings.push(`X from Y = ${y}: the model does not reach it within the data fitted.`);
      rows.push({ what: 'x from y', name: 'X', input: y, value: NaN, error: NaN, lo: NaN, hi: NaN });
      continue;
    }
    if (roots.length > 1) warnings.push(`X from Y = ${y}: ${roots.length} places reach it; the first (${roots[0].toPrecision(6)}) given.`);
    const x0 = roots[0];
    const b = slopeAt(x0);
    // σx² = (s²/m + var f(x0)) / slope²
    const sx = Math.sqrt((s2 / m + varOf((q) => f(x0, q))) / (b * b));
    rows.push({ what: 'x from y', name: 'X', input: y, value: x0, error: sx, lo: x0 - t * sx, hi: x0 + t * sx });
  }
  // the limits of detection and quantification (in X)
  if (o.lod) {
    const xb = xmin <= 0 && xmax >= 0 ? 0 : xmin;
    const b = Math.abs(slopeAt(xb));
    const s = Math.sqrt(s2);
    for (const [what, k] of [
      ['LOD', 3.3],
      ['LOQ', 10],
    ] as const) {
      const v = b > 0 ? (k * s) / b : NaN;
      rows.push({ what, name: `${what} (X)`, input: xb, value: v, error: NaN, lo: NaN, hi: NaN });
    }
    if (!(b > 0)) warnings.push('LOD / LOQ: the curve is flat where X starts.');
  }
  // values derived from the parameters
  const names = r.params.map((q) => q.name);
  for (const raw of (o.derived ?? '').split(/[;\n]/)) {
    const line = raw.trim();
    if (!line) continue;
    const mm = /^([^=]+?)\s*=\s*(.+)$/.exec(line);
    const [nm, src] = mm ? [mm[1].trim(), mm[2]] : [line, line];
    const c = compile(src);
    if (typeof c === 'string') {
      warnings.push(`Derived “${line}”: ${c}`);
      continue;
    }
    const bad = c.names.filter((v) => !names.includes(v));
    if (bad.length) {
      warnings.push(`Derived “${line}”: no parameter ${bad.map((b) => `“${b}”`).join(', ')}.`);
      continue;
    }
    const vars: Record<string, number> = {};
    const h = (q: number[]) => {
      names.forEach((v, j) => (vars[v] = q[j]));
      return c.fn(vars);
    };
    const v = h(p);
    const e = Math.sqrt(varOf(h));
    rows.push({ what: 'derived', name: nm, input: NaN, value: v, error: e, lo: v - t * e, hi: v + t * e });
  }
  return { rows, warnings };
}
