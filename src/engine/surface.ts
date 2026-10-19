// Surfaces z = f(x, y) for the Fit: a plane, a quadratic surface, a 2-D Gaussian (rotated or not), or a formula of x
// and y (every other name a parameter). The fit itself is the usual one, on the points numbered 0 … n − 1. Pure.
import { compile } from './expr.ts';
import type { ParamKind } from './fitModels.ts';

export type Surface = { params: { name: string; kind: ParamKind }[]; f: (x: number, y: number, p: number[]) => number; guess: (x: number[], y: number[], z: number[]) => number[]; note: string };

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
// z = a + b·x + c·y by least squares
function planeFit(x: number[], y: number[], z: number[]): [number, number, number] {
  const [mx, my, mz] = [mean(x), mean(y), mean(z)];
  let [sxx, syy, sxy, sxz, syz] = [0, 0, 0, 0, 0];
  x.forEach((v, i) => {
    const [dx, dy, dz] = [v - mx, y[i] - my, z[i] - mz];
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
    sxz += dx * dz;
    syz += dy * dz;
  });
  const det = sxx * syy - sxy * sxy;
  const b = det ? (sxz * syy - syz * sxy) / det : 0;
  const c = det ? (syz * sxx - sxz * sxy) / det : 0;
  return [mz - b * mx - c * my, b, c];
}

export const SURFACES: Record<string, { label: string } & Surface> = {
  plane: {
    label: 'Plane',
    note: 'z = a + b·x + c·y',
    params: [
      { name: 'a', kind: 'offset' },
      { name: 'b', kind: 'slope' },
      { name: 'c', kind: 'slope' },
    ],
    f: (x, y, p) => p[0] + p[1] * x + p[2] * y,
    guess: planeFit,
  },
  quad: {
    label: 'Quadratic surface',
    note: 'z = a + b·x + c·y + d·x² + e·y² + f·x·y',
    params: ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({ name, kind: 'free' as ParamKind })),
    f: (x, y, p) => p[0] + p[1] * x + p[2] * y + p[3] * x * x + p[4] * y * y + p[5] * x * y,
    guess: (x, y, z) => [...planeFit(x, y, z), 0, 0, 0],
  },
  gauss2d: {
    label: 'Gaussian 2-D (rotated)',
    note: 'z = z0 + A·exp(−4 ln2·(u²/wx² + v²/wy²)), u, v: x − xc, y − yc turned by θ (degrees); wx, wy the FWHM',
    params: [
      { name: 'z0', kind: 'offset' },
      { name: 'A', kind: 'amp' },
      { name: 'xc', kind: 'free' },
      { name: 'yc', kind: 'free' },
      { name: 'wx', kind: 'width' },
      { name: 'wy', kind: 'width' },
      { name: 'theta', kind: 'free' },
    ],
    f: (x, y, p) => {
      const t = (p[6] * Math.PI) / 180;
      const [dx, dy] = [x - p[2], y - p[3]];
      const u = dx * Math.cos(t) + dy * Math.sin(t);
      const v = -dx * Math.sin(t) + dy * Math.cos(t);
      return p[0] + p[1] * Math.exp(-4 * Math.LN2 * ((u * u) / (p[4] * p[4]) + (v * v) / (p[5] * p[5])));
    },
    guess: (x, y, z) => {
      const sorted = [...z].sort((a, b) => a - b);
      const z0 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
      let k = 0;
      for (let i = 1; i < z.length; i++) if (Math.abs(z[i] - z0) > Math.abs(z[k] - z0)) k = i;
      const A = z[k] - z0;
      // the widths from the spread of the points above half the height
      const hi = z.map((_, i) => i).filter((i) => (z[i] - z0) / (A || 1) > 0.5);
      const sx = Math.sqrt(mean(hi.map((i) => (x[i] - x[k]) ** 2))) * 2.5 || (Math.max(...x) - Math.min(...x)) / 5 || 1;
      const sy = Math.sqrt(mean(hi.map((i) => (y[i] - y[k]) ** 2))) * 2.5 || (Math.max(...y) - Math.min(...y)) / 5 || 1;
      return [z0, A, x[k], y[k], sx, sy, 0];
    },
  },
};

export function surfaceModel(kind: string, formula: string): Surface | string {
  if (kind !== 'formula') return SURFACES[kind] ?? `No surface “${kind}”.`;
  const text = formula.replace(/(^|[;\n])\s*z\s*=(?!=)/g, '$1');
  if (!text.trim()) return 'Write the surface, e.g. a + b*x + c*y.';
  const c = compile(text);
  if (typeof c === 'string') return c;
  const names = c.names.filter((v) => v !== 'x' && v !== 'y');
  const vars: Record<string, number> = {};
  return {
    params: names.map((name) => ({ name, kind: 'free' as ParamKind })),
    note: `z = ${text.trim()}`,
    f: (x, y, p) => {
      vars.x = x;
      vars.y = y;
      for (let i = 0; i < names.length; i++) vars[names[i]] = p[i];
      return c.fn(vars);
    },
    guess: () => names.map(() => 1),
  };
}
