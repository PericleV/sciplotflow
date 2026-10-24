// Fit models: a library, a formula of one's own, or several peaks over a baseline. Every model gives its
// parameters (with a kind, for limits and units), y(x) and starting values guessed from the data. The coupled
// oscillators and their two-branch dispersion (anticrossing) are those of strong coupling.
import { compile, compileComplex } from './expr.ts';
import { voigtProfile, voigtSG } from './faddeeva.ts';
import { erfc } from './dist.ts';
import { odeModel } from './ode.ts';
import { maxOf, minOf } from './minmax.ts';

export const HC_EV_NM = 1239.84193;
// fraction: between 0 and 1 (the Lorentzian part μ of a pseudo-Voigt)
export type ParamKind = 'x' | 'width' | 'amp' | 'positive' | 'offset' | 'slope' | 'q' | 'ratio' | 'fraction' | 'index' | 'free';
// energy: x (or the branches) in nm, the coupled-oscillator physics done in energy; xref: the middle of the x range;
// run: the number of the run / Y column (1, 2 …) — the formula's k
export type ModelCtx = { energy: boolean; xref: number; run: number };
export type Run = { xs: number[]; ys: number[] };
export type Model = {
  params: { name: string; kind: ParamKind }[];
  f: (x: number, p: number[], c: ModelCtx) => number;
  // limits: of every parameter (NaN: none) — a peak is looked for between the limits of its position
  guess: (runs: Run[], c: ModelCtx, limits?: [number, number][]) => number[];
  note: string;
  joint?: boolean; // one fit of all the runs with every parameter shared (the two branches of an anticrossing)
  // renumbers the peaks from left to right (values and errors in place); gives where each value came from
  sortPeaks?: (p: number[], err: number[]) => number[] | null;
};

// voigtx: the Voigt profile itself (a Gaussian of FWHM w convolved with a Lorentzian of FWHM wL); ds: Doniach–Šunjić
export type PeakShape = 'gauss' | 'lorentz' | 'voigt' | 'fano' | 'voigtx' | 'ds';
export type Baseline = 'none' | 'constant' | 'linear' | 'quadratic';

// ---- shapes ----
const G = (x: number, x0: number, w: number) => Math.exp((-4 * Math.LN2 * (x - x0) ** 2) / (w * w));
const L = (x: number, x0: number, w: number) => 1 / (1 + ((2 * (x - x0)) / w) ** 2);
// the heights × FWHM of a Lorentzian and a Gaussian of area 1 (2/π, √(4 ln2/π))
const CL = 2 / Math.PI;
const CG = Math.sqrt((4 * Math.LN2) / Math.PI);
// a pseudo-Voigt: μ·L + (1 − μ)·G with L, G of the same area and FWHM (μ the Lorentzian part of the area;
// % Gaussian = 100·(1 − μ)), here of height 1 at x0
const PV = (x: number, x0: number, w: number, mu: number) => {
  const [l, g] = [mu * CL, (1 - mu) * CG];
  const eta = l + g > 0 ? l / (l + g) : 0;
  return eta * L(x, x0, w) + (1 - eta) * G(x, x0, w);
};
// the area of a pseudo-Voigt of height A, FWHM w and Lorentzian part μ
export const pvArea = (A: number, w: number, mu: number) => (A * w) / (mu * CL + (1 - mu) * CG);
// a pseudo-Voigt's former η (the Lorentzian part of the height, older projects) as μ
export const etaToMu = (eta: number) => (Number.isFinite(eta) ? (eta * CG) / (eta * CG + (1 - eta) * CL || 1) : eta);
// the Voigt profile of height 1 at x0 (Gaussian FWHM wG, Lorentzian FWHM wL)
const VX = (x: number, x0: number, wG: number, wL: number) => {
  const [s, g] = voigtSG(wG, wL);
  return voigtProfile(x - x0, s, g) / voigtProfile(0, s, g);
};
// Doniach–Šunjić (a photoelectron line of a metal): cos(πα/2 + (1 − α)·atan(t)) / (1 + t²)^((1 − α)/2), t = (x0 − x)/γ,
// γ = w/2 (w: the FWHM of its Lorentzian, α = 0), its tail toward higher X (binding energy); 1 at x0
const DS = (x: number, x0: number, w: number, a: number) => {
  const t = (2 * (x0 - x)) / (Math.abs(w) || 1e-300);
  const c = Math.cos((Math.PI * a) / 2);
  return Math.cos((Math.PI * a) / 2 + (1 - a) * Math.atan(t)) / (1 + t * t) ** ((1 - a) / 2) / (c || 1e-300);
};
const fano = (x: number, A: number, x0: number, w: number, q: number) => {
  const e = (2 * (x - x0)) / w;
  return (A * ((q + e) ** 2 / (1 + e * e) - 1)) / (1 + q * q);
};
const toE = (x: number, c: ModelCtx) => (c.energy ? HC_EV_NM / x : x);
// the energy width whose width on the λ axis at `at` is w
const widthE = (w: number, at: number, c: ModelCtx) => {
  if (!c.energy || w === 0) return w;
  const E = HC_EV_NM / at;
  return (2 * (Math.sqrt(HC_EV_NM ** 2 + w * w * E * E) - HC_EV_NM)) / w;
};
// y = A·(γ₁/2)·Im[G₁₁ + r·G₂₂ + 2√r·G₁₂], G = (H − E)⁻¹, H = [[E₁ − iγ₁/2, g], [g, E₂ − iγ₂/2]], Ω = 2g
function coupled(x: number, A: number, x1: number, w1: number, x2: number, w2: number, W: number, rr: number, c: ModelCtx) {
  const E = toE(x, c);
  const [E1, E2] = [toE(x1, c), toE(x2, c)];
  const [g1, g2] = [widthE(w1, x1, c), widthE(w2, x2, c)];
  const g = widthE(W, (x1 + x2) / 2, c) / 2;
  const [ar, ai, br, bi] = [E1 - E, -g1 / 2, E2 - E, -g2 / 2];
  const dr = ar * br - ai * bi - g * g;
  const di = ar * bi + ai * br;
  const r = Math.max(0, rr);
  const nr = br + r * ar + 2 * Math.sqrt(r) * g;
  const ni = bi + r * ai;
  return A * (g1 / 2) * ((ni * dr - nr * di) / (dr * dr + di * di));
}
// the two polariton branches at x (ascending): mode 1 fixed, mode 2 = a + b(x − xref)
function branches(x: number, x1: number, a: number, b: number, W: number, c: ModelCtx, angle: boolean): [number, number] {
  let m2: number;
  if (angle) {
    const s = Math.sin((x * Math.PI) / 180) / b;
    const f = 1 - s * s;
    m2 = f > 0 ? (c.energy ? a * Math.sqrt(f) : a / Math.sqrt(f)) : NaN;
  } else m2 = a + b * (x - c.xref);
  const E1 = toE(x1, c);
  const Ec = toE(m2, c);
  const g = widthE(W, x1, c) / 2;
  const s = Math.sqrt(g * g + ((E1 - Ec) / 2) ** 2);
  const [hi, lo] = [(E1 + Ec) / 2 + s, (E1 + Ec) / 2 - s];
  return c.energy ? [HC_EV_NM / hi, HC_EV_NM / lo] : [lo, hi];
}

// ---- guesses ----
const all = (runs: Run[]) => ({ xs: runs.flatMap((r) => r.xs), ys: runs.flatMap((r) => r.ys) });
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
function lineFit(xs: number[], ys: number[]): [number, number] {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxx ? sxy / sxx : 0;
  return [my - b * mx, b];
}
// a baseline from the edges, then the strongest deviations: position, height (negative for a dip), FWHM
// windows[k]: where peak k is looked for, sign[k]: −1 a dip, 1 a peak, 0 either
export function findPeaks(xs: number[], ys: number[], count: number, windows: [number, number][] = [], sign: number[] = []): { base: number; peaks: { x0: number; A: number; w: number }[] } {
  const n = xs.length;
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const X = order.map((i) => xs[i]);
  const Y = order.map((i) => ys[i]);
  const edge = Math.max(1, Math.floor(n / 20));
  let base = 0;
  for (let i = 0; i < edge; i++) base += Y[i] + Y[n - 1 - i];
  base /= 2 * edge;
  const dev = Y.map((y) => y - base);
  const used: [number, number][] = [];
  const peaks: { x0: number; A: number; w: number }[] = [];
  for (let p = 0; p < count; p++) {
    let k = -1;
    const [wa, wb] = windows[p] ?? [NaN, NaN];
    const sg = sign[p] ?? 0;
    for (let i = 0; i < n; i++) {
      if (used.some(([a, b]) => X[i] >= a && X[i] <= b)) continue;
      if ((Number.isFinite(wa) && X[i] < wa) || (Number.isFinite(wb) && X[i] > wb)) continue;
      const v = sg ? sg * dev[i] : Math.abs(dev[i]);
      if (k < 0 || v > (sg ? sg * dev[k] : Math.abs(dev[k]))) k = i;
    }
    if (k < 0) {
      peaks.push({ x0: (X[0] + X[n - 1]) / 2, A: 0, w: (X[n - 1] - X[0]) / 10 });
      continue;
    }
    const half = Math.abs(dev[k]) / 2;
    let a = k;
    let b = k;
    while (a > 0 && Math.abs(dev[a]) > half && Math.sign(dev[a]) === Math.sign(dev[k])) a--;
    while (b < n - 1 && Math.abs(dev[b]) > half && Math.sign(dev[b]) === Math.sign(dev[k])) b++;
    const w = Math.max(X[b] - X[a], Math.abs(X[Math.min(n - 1, 1)] - X[0]) * 2);
    used.push([X[k] - w, X[k] + w]);
    peaks.push({ x0: X[k], A: dev[k], w });
  }
  return { base, peaks };
}
function peakGuess(runs: Run[]) {
  const { xs, ys } = all(runs);
  const f = findPeaks(xs, ys, 1);
  return { y0: f.base, ...f.peaks[0] };
}

// ---- the library ----
type Def = Omit<Model, 'params'> & { label: string; params: [string, ParamKind][]; group: string };
export const LIBRARY: Record<string, Def> = {
  linear: { group: 'Basic', label: 'Linear', note: 'y = a + b·x', params: [['a', 'offset'], ['b', 'slope']], f: (x, p) => p[0] + p[1] * x, guess: (r) => lineFit(all(r).xs, all(r).ys) },
  york: { group: 'Basic', label: 'Linear, errors on X and Y (York)', note: 'y = a + b·x with the errors of X (±X) and of Y (±Y): York 2004 (Deming regression when they are constant); errors scaled by √(reduced χ²)', params: [['a', 'offset'], ['b', 'slope']], f: (x, p) => p[0] + p[1] * x, guess: (r) => lineFit(all(r).xs, all(r).ys) },
  expdec1: {
    group: 'Exponential',
    label: 'Exponential decay',
    note: 'y = y0 + A·exp(−x/t)',
    params: [['y0', 'offset'], ['A', 'amp'], ['t', 'width']],
    f: (x, p) => p[0] + p[1] * Math.exp(-x / p[2]),
    guess: (r) => {
      const { xs, ys } = all(r);
      const i0 = xs.indexOf(minOf(xs));
      const i1 = xs.indexOf(maxOf(xs));
      return [ys[i1], ys[i0] - ys[i1], (xs[i1] - xs[i0]) / 3 || 1];
    },
  },
  expdec2: {
    group: 'Exponential',
    label: 'Exponential decay, two',
    note: 'y = y0 + A1·exp(−x/t1) + A2·exp(−x/t2)',
    params: [['y0', 'offset'], ['A1', 'amp'], ['t1', 'width'], ['A2', 'amp'], ['t2', 'width']],
    f: (x, p) => p[0] + p[1] * Math.exp(-x / p[2]) + p[3] * Math.exp(-x / p[4]),
    guess: (r) => {
      const [y0, A, t] = LIBRARY.expdec1.guess(r, { energy: false, xref: 0, run: 1 });
      return [y0, A / 2, t / 3, A / 2, t * 2];
    },
  },
  expgro: {
    group: 'Exponential',
    label: 'Exponential growth',
    note: 'y = y0 + A·exp(x/t)',
    params: [['y0', 'offset'], ['A', 'amp'], ['t', 'width']],
    f: (x, p) => p[0] + p[1] * Math.exp(x / p[2]),
    guess: (r) => {
      const { xs, ys } = all(r);
      return [minOf(ys), (maxOf(ys) - minOf(ys)) / 10 || 1, (maxOf(xs) - minOf(xs)) / 3 || 1];
    },
  },
  power: {
    group: 'Basic',
    label: 'Power',
    note: 'y = A·x^b',
    params: [['A', 'amp'], ['b', 'free']],
    f: (x, p) => p[0] * Math.pow(x, p[1]),
    guess: (r) => {
      const { xs, ys } = all(r);
      const ok = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x > 0 && y > 0);
      if (ok.length < 2) return [1, 1];
      const [a, b] = lineFit(ok.map(([x]) => Math.log(x)), ok.map(([, y]) => Math.log(y)));
      return [Math.exp(a), b];
    },
  },
  log: {
    group: 'Basic',
    label: 'Logarithm',
    note: 'y = a + b·ln(x)',
    params: [['a', 'offset'], ['b', 'slope']],
    f: (x, p) => p[0] + p[1] * Math.log(x),
    guess: (r) => {
      const { xs, ys } = all(r);
      const ok = xs.map((x, i) => [x, ys[i]]).filter(([x]) => x > 0);
      return lineFit(ok.map(([x]) => Math.log(x)), ok.map(([, y]) => y));
    },
  },
  gauss: {
    group: 'Peaks',
    label: 'Gaussian',
    note: 'y = y0 + A·exp(−4 ln2 (x − xc)²/w²), w = FWHM',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width']],
    f: (x, p) => p[0] + p[1] * G(x, p[2], p[3]),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, g.A, g.x0, g.w];
    },
  },
  lorentz: {
    group: 'Peaks',
    label: 'Lorentzian',
    note: 'y = y0 + A/(1 + (2(x − xc)/w)²), w = FWHM',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width']],
    f: (x, p) => p[0] + p[1] * L(x, p[2], p[3]),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, g.A, g.x0, g.w];
    },
  },
  voigt: {
    group: 'Peaks',
    label: 'Pseudo-Voigt (A = height)',
    note: 'y = y0 + A·[μ·L + (1 − μ)·G]/[μ·L + (1 − μ)·G](xc): L, G of the same area and FWHM w, μ the Lorentzian part of the area (% Gaussian = 100(1 − μ)), A the height',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width'], ['mu', 'fraction']],
    f: (x, p) => p[0] + p[1] * PV(x, p[2], p[3], p[4]),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, g.A, g.x0, g.w, 0.5];
    },
  },
  psdvoigt1: {
    group: 'Peaks',
    label: 'PsdVoigt1 (A = area)',
    note: 'y = y0 + A·[μ·(2/π)·w/(4(x − xc)² + w²) + (1 − μ)·(√(4 ln2)/(√π·w))·exp(−4 ln2·(x − xc)²/w²)], A the area, w the FWHM, μ the Lorentzian part (% Gaussian = 100(1 − μ))',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width'], ['mu', 'fraction']],
    f: (x, p) => {
      const [d, w, mu] = [x - p[2], p[3], p[4]];
      return p[0] + p[1] * (mu * (2 / Math.PI) * (w / (4 * d * d + w * w)) + (1 - mu) * (CG / w) * Math.exp((-4 * Math.LN2 * d * d) / (w * w)));
    },
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, pvArea(g.A, g.w, 0.5), g.x0, g.w, 0.5];
    },
  },
  psdvoigt2: {
    group: 'Peaks',
    label: 'PsdVoigt2 (A = area, wG, wL)',
    note: 'y = y0 + A·[μ·(2/π)·wL/(4(x − xc)² + wL²) + (1 − μ)·(√(4 ln2)/(√π·wG))·exp(−4 ln2·(x − xc)²/wG²)], A the area, wG, wL the FWHM of the Gaussian and Lorentzian, μ the Lorentzian part (% Gaussian = 100(1 − μ))',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['wG', 'width'], ['wL', 'width'], ['mu', 'fraction']],
    f: (x, p) => {
      const [d, wG, wL, mu] = [x - p[2], p[3], p[4], p[5]];
      return p[0] + p[1] * (mu * (2 / Math.PI) * (wL / (4 * d * d + wL * wL)) + (1 - mu) * (CG / wG) * Math.exp((-4 * Math.LN2 * d * d) / (wG * wG)));
    },
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, pvArea(g.A, g.w, 0.5), g.x0, g.w, g.w, 0.5];
    },
  },
  voigtexact: {
    group: 'Peaks',
    label: 'Voigt (A = area, wG, wL)',
    note: 'y = y0 + A·V(x − xc), V the Voigt profile of area 1 (a Gaussian of FWHM wG convolved with a Lorentzian of FWHM wL) from the Faddeeva function: V = Re w(z)/(σ√(2π)), z = (x − xc + i·wL/2)/(σ√2), σ = wG/(2√(2 ln2))',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['wG', 'width'], ['wL', 'width']],
    f: (x, p) => {
      const [s, g] = voigtSG(p[3], p[4]);
      return p[0] + p[1] * voigtProfile(x - p[2], s, g);
    },
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, pvArea(g.A, g.w, 0.5), g.x0, g.w * 0.6, g.w * 0.6];
    },
  },
  doniach: {
    group: 'Peaks',
    label: 'Doniach–Šunjić (XPS)',
    note: 'y = y0 + A·cos(πα/2 + (1 − α)·atan(t))/[(1 + t²)^((1 − α)/2)·cos(πα/2)], t = 2(xc − x)/w: a photoelectron line of a metal, its tail toward higher X (binding energy); w the FWHM of its Lorentzian (α = 0), α the asymmetry (0 ≤ α < 1), A the value at xc',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width'], ['alpha', 'fraction']],
    f: (x, p) => p[0] + p[1] * DS(x, p[2], p[3], p[4]),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, g.A, g.x0, g.w, 0.1];
    },
  },
  fano: {
    group: 'Peaks',
    label: 'Fano',
    note: 'y = y0 + A·[(q + ε)²/(1 + ε²) − 1]/(1 + q²), ε = 2(x − xc)/w, A ≥ 0 (q = 0: a dip, large q: a peak)',
    params: [['y0', 'offset'], ['A', 'positive'], ['xc', 'x'], ['w', 'width'], ['q', 'q']],
    f: (x, p) => p[0] + fano(x, p[1], p[2], p[3], p[4]),
    guess: (r) => {
      const g = peakGuess(r);
      return g.A < 0 ? [g.y0, -g.A, g.x0, g.w, 0] : [g.y0, g.A, g.x0, g.w, 5];
    },
  },
  coupled: {
    group: 'Resonances',
    label: 'Coupled oscillators (spectrum)',
    note: 'y = y0 + A·(γ₁/2)·Im[G₁₁ + r·G₂₂ + 2√r·G₁₂], G = (H − E)⁻¹, H = [[E₁ − iγ₁/2, g], [g, E₂ − iγ₂/2]], Ω = 2g; on a λ axis (nm) done in energy, parameters in nm',
    params: [['y0', 'offset'], ['A', 'amp'], ['x1', 'x'], ['w1', 'width'], ['x2', 'x'], ['w2', 'width'], ['W', 'width'], ['r', 'ratio']],
    f: (x, p, c) => p[0] + coupled(x, p[1], p[2], p[3], p[4], p[5], p[6], p[7], c),
    guess: (r) => {
      const { xs, ys } = all(r);
      const f = findPeaks(xs, ys, 2);
      const [m1, m2] = [...f.peaks].sort((a, b) => a.x0 - b.x0);
      const mid = (m1.x0 + m2.x0) / 2;
      const w = Math.min(m1.w, m2.w);
      return [f.base, m1.A * 1.5, mid, w, mid, w, Math.abs(m2.x0 - m1.x0) * 0.8, 0];
    },
  },
  anticross: {
    joint: true,
    group: 'Resonances',
    label: 'Anticrossing: two branches vs a tuning (linear)',
    note: 'branches of two coupled modes: mode 1 fixed, mode 2 = a + b·(x − x_mid), Ω the splitting at zero detuning; Y 1 = lower branch, Y 2 = upper (two Y columns, or two runs)',
    params: [['x1', 'x'], ['a', 'x'], ['b', 'slope'], ['W', 'width']],
    f: (x, p, c) => branches(x, p[0], p[1], p[2], p[3], c, false)[c.run > 1 ? 1 : 0],
    guess: (runs, c) => {
      const [lo, hi] = [runs[0], runs[1] ?? runs[0]];
      let k = 0;
      for (let i = 1; i < lo.xs.length; i++) if (hi.ys[i] - lo.ys[i] < hi.ys[k] - lo.ys[k]) k = i;
      const x1 = (lo.ys[k] + hi.ys[k]) / 2;
      const s = lo.xs.map((_, i) => lo.ys[i] + hi.ys[i] - x1);
      const [a0, b] = lineFit(lo.xs, s);
      return [x1, a0 + b * c.xref, b, Math.abs(hi.ys[k] - lo.ys[k])];
    },
  },
  anticrossAngle: {
    joint: true,
    group: 'Resonances',
    label: 'Anticrossing: two branches vs angle (cavity)',
    note: 'mode 2 = a/√(1 − sin²θ/n²) in energy (a·√(1 − sin²θ/n²) on a λ axis), θ in degrees; Y 1 = lower branch, Y 2 = upper',
    params: [['x1', 'x'], ['a', 'x'], ['n', 'index'], ['W', 'width']],
    f: (x, p, c) => branches(x, p[0], p[1], p[2], p[3], c, true)[c.run > 1 ? 1 : 0],
    guess: (runs) => {
      const [lo, hi] = [runs[0], runs[1] ?? runs[0]];
      let k = 0;
      for (let i = 1; i < lo.xs.length; i++) if (hi.ys[i] - lo.ys[i] < hi.ys[k] - lo.ys[k]) k = i;
      const x1 = (lo.ys[k] + hi.ys[k]) / 2;
      return [x1, lo.ys[0] + hi.ys[0] - x1, 1.6, Math.abs(hi.ys[k] - lo.ys[k])];
    },
  },
  boltzmann: {
    group: 'Growth / sigmoid',
    label: 'Boltzmann (sigmoid)',
    note: 'y = A2 + (A1 − A2)/(1 + exp((x − x0)/dx))',
    params: [['A1', 'offset'], ['A2', 'offset'], ['x0', 'x'], ['dx', 'free']],
    f: (x, p) => p[1] + (p[0] - p[1]) / (1 + Math.exp((x - p[2]) / p[3])),
    guess: (r) => {
      const { xs, ys } = all(r);
      const o = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
      const [y1, y2] = [ys[o[0]], ys[o[o.length - 1]]];
      const half = (y1 + y2) / 2;
      let k = o[0];
      for (const i of o) if (Math.abs(ys[i] - half) < Math.abs(ys[k] - half)) k = i;
      return [y1, y2, xs[k], (xs[o[o.length - 1]] - xs[o[0]]) / 10 || 1];
    },
  },
  hill: {
    group: 'Growth / sigmoid',
    label: 'Hill',
    note: 'y = start + (end − start)·xⁿ/(kⁿ + xⁿ)',
    params: [['start', 'offset'], ['end', 'offset'], ['k', 'positive'], ['n', 'free']],
    f: (x, p) => p[0] + ((p[1] - p[0]) * Math.pow(x, p[3])) / (Math.pow(p[2], p[3]) + Math.pow(x, p[3])),
    guess: (r) => {
      const [A1, A2, x0] = LIBRARY.boltzmann.guess(r, { energy: false, xref: 0, run: 1 });
      return [A1, A2, Math.abs(x0) || 1, 1];
    },
  },
  logistic: {
    group: 'Growth / sigmoid',
    label: 'Logistic (dose–response)',
    note: 'y = A2 + (A1 − A2)/(1 + (x/x0)^p)',
    params: [['A1', 'offset'], ['A2', 'offset'], ['x0', 'positive'], ['p', 'free']],
    f: (x, p) => p[1] + (p[0] - p[1]) / (1 + Math.pow(x / p[2], p[3])),
    guess: (r) => {
      const [A1, A2, x0] = LIBRARY.boltzmann.guess(r, { energy: false, xref: 0, run: 1 });
      return [A1, A2, Math.abs(x0) || 1, 1];
    },
  },
  sinedamp: {
    group: 'Periodic',
    label: 'Damped sine',
    note: 'y = y0 + A·exp(−x/t)·sin(2π(x − xc)/T)',
    params: [['y0', 'offset'], ['A', 'amp'], ['t', 'width'], ['xc', 'x'], ['T', 'width']],
    f: (x, p) => p[0] + p[1] * Math.exp(-x / p[2]) * Math.sin((2 * Math.PI * (x - p[3])) / p[4]),
    guess: (r) => {
      const { xs, ys } = all(r);
      const y0 = mean(ys);
      // the period from the crossings of the mean
      const o = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
      const cross: number[] = [];
      for (let k = 1; k < o.length; k++) if ((ys[o[k - 1]] - y0) * (ys[o[k]] - y0) < 0) cross.push(xs[o[k]]);
      const span = xs[o[o.length - 1]] - xs[o[0]] || 1;
      const T = cross.length > 1 ? (2 * (cross[cross.length - 1] - cross[0])) / (cross.length - 1) : span / 2;
      return [y0, (maxOf(ys) - minOf(ys)) / 2, span, cross[0] ?? xs[o[0]], T];
    },
  },
};

// more of the library: peaks of a given area and other shapes, relaxations, growth, chemistry and physics
const R_GAS = 8.314462618;
const C2_NM_K = 1.438776877e7; // h·c/k in nm·K
const erf = (z: number) => 1 - erfc(z);
// the place where y first passes half-way between its ends (sorted by x), and the ends
function midGuess(r: Run[]) {
  const { xs, ys } = all(r);
  const o = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const [y1, y2] = [ys[o[0]], ys[o[o.length - 1]]];
  const half = (y1 + y2) / 2;
  let k = o[0];
  for (const i of o) if (Math.abs(ys[i] - half) < Math.abs(ys[k] - half)) k = i;
  return { y1, y2, x0: xs[k], span: xs[o[o.length - 1]] - xs[o[0]] || 1, xmax: xs[o[o.length - 1]], ymax: maxOf(ys), ymin: minOf(ys) };
}
const MORE: Record<string, Def> = {
  gaussArea: {
    group: 'Peaks',
    label: 'Gaussian (A = area)',
    note: 'y = y0 + A·√(4 ln2/π)/w·exp(−4 ln2 (x − xc)²/w²), A the area, w the FWHM',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width']],
    f: (x, p) => p[0] + ((p[1] * CG) / p[3]) * G(x, p[2], p[3]),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, pvArea(g.A, g.w, 0), g.x0, g.w];
    },
  },
  lorentzArea: {
    group: 'Peaks',
    label: 'Lorentzian (A = area)',
    note: 'y = y0 + (2A/π)·w/(4(x − xc)² + w²), A the area, w the FWHM',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width']],
    f: (x, p) => p[0] + ((2 * p[1]) / Math.PI) * (p[3] / (4 * (x - p[2]) ** 2 + p[3] * p[3])),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, pvArea(g.A, g.w, 1), g.x0, g.w];
    },
  },
  pearson7: {
    group: 'Peaks',
    label: 'Pearson VII',
    note: 'y = y0 + A/[1 + (2(x − xc)/w)²·(2^(1/m) − 1)]^m, w the FWHM; m = 1 a Lorentzian, m → ∞ a Gaussian',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width'], ['m', 'positive']],
    f: (x, p) => p[0] + p[1] / (1 + ((2 * (x - p[2])) / p[3]) ** 2 * (2 ** (1 / p[4]) - 1)) ** p[4],
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, g.A, g.x0, g.w, 2];
    },
  },
  lognormal: {
    group: 'Peaks',
    label: 'Log-normal peak',
    note: 'y = y0 + A·exp(−ln²(x/xc)/(2w²)) for x > 0: a peak skewed to the right (particle sizes, retention), w its width on ln x',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'positive'], ['w', 'width']],
    f: (x, p) => (x > 0 ? p[0] + p[1] * Math.exp(-(Math.log(x / p[2]) ** 2) / (2 * p[3] * p[3])) : p[0]),
    guess: (r) => {
      const g = peakGuess(r);
      return [g.y0, g.A, Math.abs(g.x0) || 1, Math.min(1, g.w / (2.355 * (Math.abs(g.x0) || 1))) || 0.3];
    },
  },
  erfStep: {
    group: 'Basic',
    label: 'Step, broadened (error function)',
    note: 'y = y0 + A·[1 + erf((x − xc)/(w√2))]/2: a step of height A at xc, smoothed by a Gaussian of standard deviation w (an edge, a knife-edge scan)',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['w', 'width']],
    f: (x, p) => p[0] + (p[1] * (1 + erf((x - p[2]) / (p[3] * Math.SQRT2)))) / 2,
    guess: (r) => {
      const m = midGuess(r);
      return [m.y1, m.y2 - m.y1, m.x0, m.span / 20];
    },
  },
  hyperbola: {
    group: 'Basic',
    label: 'Hyperbola',
    note: 'y = a + b/x',
    params: [['a', 'offset'], ['b', 'free']],
    f: (x, p) => p[0] + p[1] / x,
    guess: (r) => {
      const { xs, ys } = all(r);
      const ok = xs.map((x, i) => [x, ys[i]]).filter(([x]) => x !== 0);
      return ok.length > 1 ? lineFit(ok.map(([x]) => 1 / x), ok.map(([, y]) => y)) : [0, 1];
    },
  },
  expdec3: {
    group: 'Exponential',
    label: 'Exponential decay, three',
    note: 'y = y0 + A1·exp(−x/t1) + A2·exp(−x/t2) + A3·exp(−x/t3)',
    params: [['y0', 'offset'], ['A1', 'amp'], ['t1', 'width'], ['A2', 'amp'], ['t2', 'width'], ['A3', 'amp'], ['t3', 'width']],
    f: (x, p) => p[0] + p[1] * Math.exp(-x / p[2]) + p[3] * Math.exp(-x / p[4]) + p[5] * Math.exp(-x / p[6]),
    guess: (r) => {
      // the three times spread evenly on a log scale, from a few steps of X to half the range
      const [y0, A] = LIBRARY.expdec1.guess(r, { energy: false, xref: 0, run: 1 });
      const xs = [...new Set(all(r).xs)].sort((a, b) => a - b);
      const span = xs[xs.length - 1] - xs[0] || 1;
      const step = span / Math.max(1, xs.length - 1);
      const [lo, hi] = [Math.min(3 * step, span / 20), span / 2];
      const mid = Math.sqrt(lo * hi);
      return [y0, A / 3, lo, A / 3, mid, A / 3, hi];
    },
  },
  expassoc: {
    group: 'Exponential',
    label: 'Exponential rise to a limit',
    note: 'y = y0 + A·(1 − exp(−x/t)): from y0 toward y0 + A (charging, uptake, first-order growth)',
    params: [['y0', 'offset'], ['A', 'amp'], ['t', 'width']],
    f: (x, p) => p[0] + p[1] * (1 - Math.exp(-x / p[2])),
    guess: (r) => {
      const m = midGuess(r);
      return [m.y1, m.y2 - m.y1, m.span / 3];
    },
  },
  kww: {
    group: 'Exponential',
    label: 'Stretched exponential (KWW)',
    note: 'y = y0 + A·exp(−(x/t)^β), 0 < β ≤ 1 (a spread of relaxation times; β = 1 a single exponential)',
    params: [['y0', 'offset'], ['A', 'amp'], ['t', 'width'], ['beta', 'positive']],
    f: (x, p) => p[0] + p[1] * Math.exp(-Math.pow(Math.max(0, x) / p[2], p[3])),
    guess: (r) => {
      const [y0, A, t] = LIBRARY.expdec1.guess(r, { energy: false, xref: 0, run: 1 });
      return [y0, A, t, 0.7];
    },
  },
  avrami: {
    group: 'Growth / sigmoid',
    label: 'Avrami (JMAK)',
    note: 'y = A·(1 − exp(−k·xⁿ)): the fraction transformed (crystallization), n the Avrami exponent',
    params: [['A', 'amp'], ['k', 'positive'], ['n', 'positive']],
    f: (x, p) => p[0] * (1 - Math.exp(-p[1] * Math.pow(Math.max(0, x), p[2]))),
    guess: (r) => {
      const m = midGuess(r);
      return [m.ymax || 1, Math.LN2 / Math.pow(Math.abs(m.x0) || 1, 2), 2];
    },
  },
  gompertz: {
    group: 'Growth / sigmoid',
    label: 'Gompertz',
    note: 'y = y0 + A·exp(−exp(−k·(x − xc))): an asymmetric sigmoid (growth of populations, tumours)',
    params: [['y0', 'offset'], ['A', 'amp'], ['k', 'positive'], ['xc', 'x']],
    f: (x, p) => p[0] + p[1] * Math.exp(-Math.exp(-p[2] * (x - p[3]))),
    guess: (r) => {
      const m = midGuess(r);
      return [m.y1, m.y2 - m.y1, 4 / m.span, m.x0];
    },
  },
  logistic5: {
    group: 'Growth / sigmoid',
    label: 'Logistic, 5 parameters (asymmetric)',
    note: 'y = A2 + (A1 − A2)/(1 + (x/x0)^p)^s: the dose–response curve with an asymmetry s (s = 1: the 4-parameter one)',
    params: [['A1', 'offset'], ['A2', 'offset'], ['x0', 'positive'], ['p', 'free'], ['s', 'positive']],
    f: (x, p) => p[1] + (p[0] - p[1]) / Math.pow(1 + Math.pow(x / p[2], p[3]), p[4]),
    guess: (r) => {
      const [A1, A2, x0] = LIBRARY.boltzmann.guess(r, { energy: false, xref: 0, run: 1 });
      return [A1, A2, Math.abs(x0) || 1, 1, 1];
    },
  },
  michaelis: {
    group: 'Chemistry, physics',
    label: 'Michaelis–Menten',
    note: 'y = Vmax·x/(Km + x): the rate of an enzyme reaction against the concentration of its substrate',
    params: [['Vmax', 'amp'], ['Km', 'positive']],
    f: (x, p) => (p[0] * x) / (p[1] + x),
    guess: (r) => {
      const m = midGuess(r);
      return [m.ymax * 1.2 || 1, Math.abs(m.x0) || 1];
    },
  },
  langmuir: {
    group: 'Chemistry, physics',
    label: 'Langmuir isotherm',
    note: 'y = qm·K·x/(1 + K·x): the amount adsorbed against the pressure or concentration, qm the monolayer',
    params: [['qm', 'amp'], ['K', 'positive']],
    f: (x, p) => (p[0] * p[1] * x) / (1 + p[1] * x),
    guess: (r) => {
      const m = midGuess(r);
      return [m.ymax * 1.2 || 1, 1 / (Math.abs(m.x0) || 1)];
    },
  },
  freundlich: {
    group: 'Chemistry, physics',
    label: 'Freundlich isotherm',
    note: 'y = K·x^(1/n)',
    params: [['K', 'amp'], ['n', 'positive']],
    f: (x, p) => p[0] * Math.pow(x, 1 / p[1]),
    guess: (r) => {
      const [A, b] = LIBRARY.power.guess(r, { energy: false, xref: 0, run: 1 });
      return [A, b ? 1 / b : 2];
    },
  },
  arrhenius: {
    group: 'Chemistry, physics',
    label: 'Arrhenius (x = T in K)',
    note: 'y = A·exp(−Ea/(R·T)), Ea in J/mol, R = 8.314 J/(mol·K): a rate against the temperature',
    params: [['A', 'amp'], ['Ea', 'positive']],
    f: (x, p) => p[0] * Math.exp(-p[1] / (R_GAS * x)),
    guess: (r) => {
      const { xs, ys } = all(r);
      const ok = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x > 0 && y > 0);
      if (ok.length < 2) return [1, 5e4];
      const [a, b] = lineFit(ok.map(([x]) => 1 / x), ok.map(([, y]) => Math.log(y)));
      return [Math.exp(a), Math.abs(b * R_GAS) || 5e4];
    },
  },
  vft: {
    group: 'Chemistry, physics',
    label: 'Vogel–Fulcher–Tammann',
    note: 'y = A·exp(B/(x − T0)): the viscosity or relaxation time of a glass former against the temperature',
    params: [['A', 'amp'], ['B', 'positive'], ['T0', 'free']],
    f: (x, p) => p[0] * Math.exp(p[1] / (x - p[2])),
    guess: (r) => {
      const m = midGuess(r);
      const xmin = minOf(all(r).xs);
      return [Math.max(m.ymin, 1e-12), (m.span || 1) * 5, xmin - (m.span || 1) / 2];
    },
  },
  curieWeiss: {
    group: 'Chemistry, physics',
    label: 'Curie–Weiss',
    note: 'y = C/(x − θ) + χ0: the magnetic susceptibility above the ordering temperature',
    params: [['C', 'amp'], ['theta', 'free'], ['chi0', 'offset']],
    f: (x, p) => p[0] / (x - p[1]) + p[2],
    guess: (r) => {
      const { xs, ys } = all(r);
      const ok = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => y !== 0);
      // 1/χ against T: a line — slope 1/C, crossing θ
      const [a, b] = ok.length > 1 ? lineFit(ok.map(([x]) => x), ok.map(([, y]) => 1 / y)) : [0, 1];
      return [b ? 1 / b : 1, b ? -a / b : 0, 0];
    },
  },
  planck: {
    group: 'Chemistry, physics',
    label: 'Planck, black body (x = λ in nm)',
    note: 'y = A·(1000/λ)⁵/(exp(hc/(λ·k·T)) − 1): the spectral radiance of a black body at T (K), up to the scale A',
    params: [['A', 'amp'], ['T', 'positive']],
    f: (x, p) => (p[0] * Math.pow(1000 / x, 5)) / Math.expm1(C2_NM_K / (x * p[1])),
    guess: (r) => {
      const { xs, ys } = all(r);
      const k = ys.indexOf(maxOf(ys));
      // Wien: λmax·T = 2.898e6 nm·K
      const T = 2.898e6 / (xs[k] || 1000);
      const unit = Math.pow(1000 / (xs[k] || 1000), 5) / Math.expm1(C2_NM_K / ((xs[k] || 1000) * T));
      return [ys[k] / (unit || 1), T];
    },
  },
  sine: {
    group: 'Periodic',
    label: 'Sine',
    note: 'y = y0 + A·sin(2π(x − xc)/T)',
    params: [['y0', 'offset'], ['A', 'amp'], ['xc', 'x'], ['T', 'width']],
    f: (x, p) => p[0] + p[1] * Math.sin((2 * Math.PI * (x - p[2])) / p[3]),
    guess: (r) => {
      const [y0, A, , xc, T] = LIBRARY.sinedamp.guess(r, { energy: false, xref: 0, run: 1 });
      return [y0, A, xc, T];
    },
  },
};
Object.assign(LIBRARY, MORE);

export const LIBRARY_OPTIONS = Object.entries(LIBRARY).map(([k, d]) => ({ id: k, label: d.label, group: d.group }));

// A polynomial of degree n: y = a0 + a1·x + … (a linear fit, done by the same least squares)
function polynomial(deg: number): Model {
  const n = Math.max(1, Math.min(9, Math.floor(deg) || 1));
  return {
    params: Array.from({ length: n + 1 }, (_, k) => ({ name: `a${k}`, kind: 'free' as ParamKind })),
    note: `y = ${Array.from({ length: n + 1 }, (_, k) => (k === 0 ? 'a0' : k === 1 ? 'a1·x' : `a${k}·x^${k}`)).join(' + ')}`,
    f: (x, p) => {
      let y = 0;
      for (let k = p.length - 1; k >= 0; k--) y = y * x + p[k];
      return y;
    },
    guess: (r) => {
      const [a, b] = lineFit(all(r).xs, all(r).ys);
      return Array.from({ length: n + 1 }, (_, k) => (k === 0 ? a : k === 1 ? b : 0));
    },
  };
}

// The value of one peak at x: its parameters from p[o] (A, xc, w, and μ for a pseudo-Voigt, q for a Fano).
export function peakAt(shape: PeakShape, x: number, p: ArrayLike<number>, o: number): number {
  if (shape === 'gauss') return p[o] * G(x, p[o + 1], p[o + 2]);
  if (shape === 'lorentz') return p[o] * L(x, p[o + 1], p[o + 2]);
  if (shape === 'voigt') return p[o] * PV(x, p[o + 1], p[o + 2], p[o + 3]);
  if (shape === 'voigtx') return p[o] * VX(x, p[o + 1], p[o + 2], p[o + 3]);
  if (shape === 'ds') return p[o] * DS(x, p[o + 1], p[o + 2], p[o + 3]);
  return fano(x, p[o], p[o + 1], p[o + 2], p[o + 3]);
}
export const SHAPE_NAMES: Record<PeakShape, string> = { gauss: 'Gaussian', lorentz: 'Lorentzian', voigt: 'pseudo-Voigt', voigtx: 'Voigt', fano: 'Fano', ds: 'Doniach–Šunjić' };
// the parameter of a peak after A, xc, w (its name before the number of the peak, its kind)
const EXTRA: Partial<Record<PeakShape, [string, ParamKind]>> = { voigt: ['mu', 'fraction'], fano: ['q', 'q'], voigtx: ['wL', 'width'], ds: ['alpha', 'fraction'] };
const extraOf = (shape: PeakShape) => EXTRA[shape]?.[0] ?? null;
// the parameters of a peak of this shape, and their starts from a height (a depth: negative), a place, a FWHM
export const shapeSize = (shape: PeakShape) => 3 + (EXTRA[shape] ? 1 : 0);
export function shapeStarts(shape: PeakShape, A: number, x: number, w: number): number[] {
  if (shape === 'fano') return [Math.abs(A), x, w, A < 0 ? 0 : 5];
  if (shape === 'voigt') return [A, x, w, 0.5];
  if (shape === 'voigtx') return [A, x, w * 0.6, w * 0.6];
  if (shape === 'ds') return [A, x, w, 0.1];
  return [A, x, w];
}
// Derived results: for every Lorentzian part μ of a pseudo-Voigt (mu, mu1 …), its % Gaussian = 100(1 − μ) and
// % Lorentzian = 100μ, both ± 100·σ(μ)
export function percentResults(params: { name: string; kind: ParamKind }[], values: number[], errors: number[]): { name: string; value: number; error: number }[] {
  return params.flatMap((q, j) => {
    if (q.kind !== 'fraction' || !q.name.startsWith('mu')) return [];
    const tag = q.name.slice(2) ? ` ${q.name.slice(2)}` : '';
    const e = 100 * errors[j];
    return [
      { name: `% Gaussian${tag}`, value: 100 * (1 - values[j]), error: e },
      { name: `% Lorentzian${tag}`, value: 100 * values[j], error: e },
    ];
  });
}
// the number of parameters of the baseline (c, s, s2)
export const baseParams = (b: Baseline) => (b === 'constant' ? 1 : b === 'linear' ? 2 : b === 'quadratic' ? 3 : 0);

// Peaks over a baseline, each of its own shape; peak k: A_k, xc_k, w_k (and q_k for Fano, mu_k for Voigt). The
// baseline: c + s·(x − x_mid) + s2·(x − x_mid)² as far as asked. Peaks of one shape are numbered from left to right;
// of several shapes they keep their order.
export function peaksModel(shapesIn: PeakShape[], baseline: Baseline): Model {
  const shapes = shapesIn.length ? shapesIn.slice(0, 40) : (['gauss'] as PeakShape[]);
  const N = shapes.length;
  const base: [string, ParamKind][] = (
    [
      ['c', 'offset'],
      ['s', 'slope'],
      ['s2', 'free'],
    ] as [string, ParamKind][]
  ).slice(0, baseParams(baseline));
  const params: { name: string; kind: ParamKind }[] = [...base.map(([name, kind]) => ({ name, kind }))];
  const offs: number[] = [];
  shapes.forEach((shape, k) => {
    offs.push(params.length);
    params.push({ name: `A${k + 1}`, kind: shape === 'fano' ? 'positive' : 'amp' }, { name: `xc${k + 1}`, kind: 'x' }, { name: `w${k + 1}`, kind: 'width' });
    const ex = EXTRA[shape];
    if (ex) params.push({ name: `${ex[0]}${k + 1}`, kind: ex[1] });
  });
  const nb = base.length;
  const one = shapes.every((q) => q === shapes[0]);
  const per = 3 + (extraOf(shapes[0]) ? 1 : 0);
  const counts = Object.entries(shapes.reduce<Record<string, number>>((a, q) => ({ ...a, [q]: (a[q] ?? 0) + 1 }), {}));
  const what = counts.map(([q, n]) => `${n} ${SHAPE_NAMES[q as PeakShape]}${n > 1 ? 's' : ''}`).join(' + ');
  return {
    params,
    note: `${what}${baseline === 'none' ? '' : ` + a ${baseline} baseline c${baseline !== 'constant' ? ' + s·(x − x_mid)' : ''}${baseline === 'quadratic' ? ' + s2·(x − x_mid)²' : ''}`}`,
    f: (x, p, c) => {
      const d = x - c.xref;
      let y = nb > 0 ? p[0] : 0;
      if (nb > 1) y += p[1] * d;
      if (nb > 2) y += p[2] * d * d;
      for (let k = 0; k < N; k++) y += peakAt(shapes[k], x, p, offs[k]);
      return y;
    },
    sortPeaks: one
      ? (p, err) => {
          const blocks = offs;
          const sorted = [...blocks].sort((a, b) => p[a + 1] - p[b + 1]);
          if (sorted.every((b, k) => b === blocks[k])) return null;
          const order = p.map((_, j) => j);
          const [pv, ev] = [p.slice(), err.slice()];
          sorted.forEach((from, k) => {
            for (let i = 0; i < per; i++) {
              p[blocks[k] + i] = pv[from + i];
              err[blocks[k] + i] = ev[from + i];
              order[blocks[k] + i] = from + i;
            }
          });
          return order;
        }
      : undefined,
    guess: (r, _c, limits) => {
      const { xs, ys } = all(r);
      // each peak between the limits of its position, a dip when its amplitude may not be positive
      const win = offs.map((o): [number, number] => limits?.[o + 1] ?? [NaN, NaN]);
      const sign = offs.map((o) => {
        const [lo, hi] = limits?.[o] ?? [NaN, NaN];
        return hi <= 0 ? -1 : lo >= 0 ? 1 : 0;
      });
      const f = findPeaks(xs, ys, N, win, sign);
      const pk = !one || win.some(([a, b]) => Number.isFinite(a) || Number.isFinite(b)) ? f.peaks : [...f.peaks].sort((a, b) => a.x0 - b.x0);
      const out: number[] = [];
      if (nb > 0) out.push(f.base);
      if (nb > 1) out.push(0);
      if (nb > 2) out.push(0);
      pk.forEach((q, k) => {
        out.push(...shapeStarts(shapes[k], q.A, q.x0, q.w));
      });
      return out;
    },
  };
}

// A formula of one's own: every name but x (and k, the run) is a parameter, in the order written.
function formulaModel(src: string): Model | string {
  // “y =” before the formula (after the functions defined too)
  const text = src.replace(/(^|[;\n])\s*y\s*=(?!=)/g, '$1');
  if (!text.trim()) return 'Write the formula, e.g. A*exp(-x/t) + y0.';
  const f = compile(text);
  if (typeof f === 'string') return f;
  const names = f.names.filter((v) => v !== 'x' && v !== 'k');
  if (!f.names.includes('x')) return 'The formula does not use x.';
  const vars: Record<string, number> = {};
  return {
    params: names.map((name) => ({ name, kind: 'free' as ParamKind })),
    note: `y = ${text.trim()}`,
    f: (x, p, c) => {
      vars.x = x;
      vars.k = c.run;
      for (let i = 0; i < names.length; i++) vars[names[i]] = p[i];
      return f.fn(vars);
    },
    guess: () => names.map(() => 1),
  };
}

// ode: differential equations (dA/dx = …; A(0) = …; y = …), src/engine/ode.ts
// complex: a formula in complex numbers (j the imaginary unit), fitted to two Y — its real part, then its imaginary part
// A formula in complex numbers of x (and k, the run): both parts fitted at once — run 1 the real part, run 2 the
// imaginary part (an impedance against ω, a complex permittivity, a transfer function)
function complexModel(src: string): Model | string {
  const text = src.replace(/(^|[;\n])\s*[yZz]\s*=(?!=)/g, '$1');
  if (!text.trim()) return 'Write the complex formula, e.g. R0 + R1/(1 + j*x*R1*C1) (j the imaginary unit).';
  const c = compileComplex(text);
  if (typeof c === 'string') return c;
  if (!c.names.includes('x')) return 'The formula does not use x.';
  const names = c.names.filter((v) => v !== 'x' && v !== 'k');
  const vars: Record<string, number> = {};
  return {
    joint: true,
    params: names.map((name) => ({ name, kind: 'free' as ParamKind })),
    note: `Y = ${text.trim()}: Y 1 its real part, Y 2 its imaginary part`,
    f: (x, p, ctx) => {
      vars.x = x;
      vars.k = ctx.run;
      for (let i = 0; i < names.length; i++) vars[names[i]] = p[i];
      const z = c.fn(vars);
      return ctx.run > 1 ? z[1] : z[0];
    },
    guess: () => names.map(() => 1),
  };
}

export type ModelSpec = { kind: 'library' | 'formula' | 'peaks' | 'ode' | 'complex'; model: string; degree: number; formula: string; shape: PeakShape; count: number; baseline: Baseline; ode?: string; cformula?: string };
export function buildModel(s: ModelSpec): Model | string {
  if (s.kind === 'formula') return formulaModel(s.formula);
  if (s.kind === 'complex') return complexModel(s.cformula ?? '');
  if (s.kind === 'ode') return odeModel(s.ode ?? '');
  if (s.kind === 'peaks') return peaksModel(Array.from({ length: Math.max(1, Math.min(20, Math.floor(s.count) || 1)) }, () => s.shape), s.baseline);
  if (s.model === 'poly') return polynomial(s.degree);
  const d = LIBRARY[s.model];
  if (!d) return `No model “${s.model}”.`;
  return { params: d.params.map(([name, kind]) => ({ name, kind })), f: d.f, guess: d.guess, note: d.note, ...(d.joint ? { joint: true } : {}) };
}

// Limits that keep a model sensible: widths and positive amplitudes > 0, ratios ≥ 0, an index > 1.
export function keep(kind: ParamKind, v: number): number {
  switch (kind) {
    case 'width':
      return Math.max(Math.abs(v), 1e-12);
    case 'positive':
      return Math.abs(v);
    case 'ratio':
      return Math.max(v, 0);
    case 'fraction':
      return Math.min(1, Math.max(v, 0));
    case 'index':
      return Math.max(Math.abs(v), 1.001);
    default:
      return v;
  }
}
