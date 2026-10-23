// Kramers–Kronig: the real and imaginary parts of a causal response are tied together. Three uses:
// - impedance (EIS): the Lin-KK test (Schönleber et al. 2014; as impedance.py's linKK) — the spectrum fitted by a
//   resistance, M RC elements of time constants spread evenly (in log) over the frequencies measured, an inductance
//   (and a capacitance if asked), linear in their values; of M = 1 … 50 elements, the best fit among those not over-fitted
//   (μ = 1 − Σ|R<0| / Σ|R≥0| at least 0.85: μ falls as the elements start to fit the noise — Schönleber's criterion; it
//   is not steady on clean data, so the best of the M it allows rather than the first it forbids); the residuals (data − fit, relative to |Z|) say whether the data obey KK (a few 0.1 %: yes; trends of % : drift,
//   non-linearity, a system that changed);
// - optical: the phase of the reflection from the reflectance R alone, then n, k, ε₁, ε₂ (normal incidence), R carried
//   past the data on either side (the tails: what is assumed, drawn dashed);
// - general: Re from Im, or Im from Re, of any causal response (ε₁ from ε₂ with ε∞, χ′ from χ″ …), its tails as asked.
// The integrals: principal values on the points (and the tails), the singularity taken out and integrated exactly.
// The X: the column's values as they are — any unit proportional to the frequency (Hz, eV, cm⁻¹ …) gives the same
// result; a wavelength (its unit nm, µm, Å, m in the column's name) is turned into 1/λ first. Pure.
import { leastSquares } from './trend.ts';
import { column, findColumn, roleOf, unitOf, type Column, type Dataset } from './table.ts';
import { guessColumns } from './eis.ts';
import type { SignalPlot } from './signalnodes.ts';

// a: the column of Z′ (eis), R (optical), the part transformed (general); b: Z″ (eis); imNeg: the Z″ column is −Z″;
// cap, ind: a capacitance, an inductance in the Lin-KK model; mu: its μ limit; maxM: the most RC elements; limit: the
// band of residuals drawn (%); xKind: X proportional to the frequency, or a wavelength (auto: by its unit); low, high:
// the tails below and above the data; power: the exponent of a power-law tail; direction: Im → Re or Re → Im; offset:
// Re at infinite frequency (ε∞)
export type KKData = {
  mode: 'eis' | 'optical' | 'general';
  x: string;
  a: string;
  b: string;
  imNeg: 'auto' | 'yes' | 'no';
  cap: boolean;
  ind: boolean;
  mu: number;
  maxM: number;
  limit: number;
  xKind: 'auto' | 'frequency' | 'wavelength';
  low: 'constant' | 'hagen' | 'zero' | 'linear';
  high: 'power' | 'constant' | 'zero';
  power: number;
  direction: 'im2re' | 're2im';
  offset: number;
};

// ---- the principal value ----

// P∫ g(x) / (x² − t²) dx over the grid x (increasing, from x[0] ≥ 0): ∫ (g(x) − g(t)) / (x² − t²) dx (trapezoids; at x = t
// its limit g′(t) / 2t) + g(t) · P∫ dx / (x² − t²), the last exactly
export function principalValue(x: ArrayLike<number>, g: ArrayLike<number>, t: number, gt: number, slope: number): number {
  const n = x.length;
  const f = (i: number) => {
    const d = x[i] * x[i] - t * t;
    return Math.abs(x[i] - t) <= 1e-12 * Math.max(1, t) ? slope / (2 * t) : (g[i] - gt) / d;
  };
  let s = 0;
  let prev = f(0);
  for (let i = 1; i < n; i++) {
    const cur = f(i);
    s += 0.5 * (prev + cur) * (x[i] - x[i - 1]);
    prev = cur;
  }
  const [a, b] = [x[0], x[n - 1]];
  const lnAbs = (v: number) => Math.log(Math.abs(v));
  const exact = (lnAbs(b - t) - lnAbs(b + t) - (a > 0 ? lnAbs(a - t) - lnAbs(a + t) : 0)) / (2 * t);
  return s + gt * exact;
}

// a grid of n points from a to b, even in log (a > 0) or linear
const logGrid = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => a * (b / a) ** (k / (n - 1)));
const linGrid = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1));

// The tails of y(x) past the data (x increasing, > 0): below from near 0 to x[0], above from x[n−1] far out (10⁴ times);
// the whole grid and its values, and the parts to draw (shown: a stretch of each tail as wide as half the data)
export type Tails = { x: number[]; y: number[]; low: { x: number[]; y: number[] }; high: { x: number[]; y: number[] } };
export function withTails(x: number[], y: number[], low: KKData['low'], high: KKData['high'], power: number): Tails {
  const n = x.length;
  const [x0, x1] = [x[0], x[n - 1]];
  const [y0, y1] = [y[0], y[n - 1]];
  // below: constant, Hagen–Rubens (a metal: 1 − R ∝ √x), zero, or straight down to 0 at x = 0
  const lowAt = (v: number) => (low === 'constant' ? y0 : low === 'hagen' ? 1 - (1 - y0) * Math.sqrt(v / x0) : low === 'zero' ? 0 : (y0 * v) / x0);
  const highAt = (v: number) => (high === 'constant' ? y1 : high === 'zero' ? 0 : y1 * (v / x1) ** -power);
  const lx = [...linGrid(0, x0, 160).slice(1, -1)];
  if (lx.length) lx[0] = Math.max(lx[0], x0 * 1e-6);
  const hx = logGrid(x1, x1 * 1e4, 400).slice(1);
  const gx = [...lx, ...x, ...hx];
  const gy = [...lx.map(lowAt), ...y, ...hx.map(highAt)];
  const span = 0.5 * (x1 - x0);
  const sl = linGrid(Math.max(0, x0 - span), x0, 40);
  const sh = linGrid(x1, x1 + span, 40);
  return { x: gx, y: gy, low: { x: sl, y: sl.map((v) => (v === x0 ? y0 : lowAt(v))) }, high: { x: sh, y: sh.map((v) => (v === x1 ? y1 : highAt(v))) } };
}
// the slope of y at its point i (between its neighbours)
const slopeAt = (x: ArrayLike<number>, y: ArrayLike<number>, i: number) => {
  const a = Math.max(0, i - 1);
  const b = Math.min(x.length - 1, i + 1);
  return (y[b] - y[a]) / (x[b] - x[a] || 1);
};

// ---- optical ----

// The phase of the reflection at every point from R (x ∝ the frequency, increasing; R a fraction), then n, k, ε₁, ε₂
// (r = √R e^{iθ} = (N − 1) / (N + 1), N = n + ik, k ≥ 0)
export function opticalKK(x: number[], R: number[], o: Pick<KKData, 'low' | 'high' | 'power'>): { theta: number[]; n: number[]; k: number[]; e1: number[]; e2: number[]; tails: Tails } {
  const tails = withTails(x, R, o.low, o.high, o.power);
  const g = tails.y.map((v) => Math.log(Math.max(v, 1e-12)));
  const lnR = R.map((v) => Math.log(Math.max(v, 1e-12)));
  const theta = x.map((t, i) => (-t / Math.PI) * principalValue(tails.x, g, t, lnR[i], slopeAt(x, lnR, i)));
  const n: number[] = [];
  const k: number[] = [];
  x.forEach((_, i) => {
    const s = Math.sqrt(R[i]);
    const [rr, ri] = [s * Math.cos(theta[i]), s * Math.sin(theta[i])];
    // N = (1 + r) / (1 − r)
    const [ar, ai] = [1 + rr, ri];
    const [br, bi] = [1 - rr, -ri];
    const d = br * br + bi * bi;
    n.push((ar * br + ai * bi) / d);
    k.push((ai * br - ar * bi) / d);
  });
  return { theta, n, k, e1: n.map((v, i) => v * v - k[i] * k[i]), e2: n.map((v, i) => 2 * v * k[i]), tails };
}

// ---- general ----

// Re from Im: Re(t) = offset + (2/π) P∫₀^∞ x Im(x) / (x² − t²) dx; Im from Re: Im(t) = −(2t/π) P∫₀^∞ (Re(x) − offset) / (x² − t²) dx
export function generalKK(x: number[], y: number[], o: Pick<KKData, 'low' | 'high' | 'power' | 'direction' | 'offset'>): { out: number[]; tails: Tails } {
  const im2re = o.direction === 'im2re';
  const base = im2re ? y : y.map((v) => v - o.offset);
  const tails = withTails(x, base, o.low, o.high, o.power);
  const g = im2re ? tails.y.map((v, i) => tails.x[i] * v) : tails.y;
  const gd = im2re ? x.map((v, i) => v * y[i]) : base;
  const out = x.map((t, i) => {
    const pv = principalValue(tails.x, g, t, gd[i], slopeAt(x, gd, i));
    return im2re ? o.offset + (2 / Math.PI) * pv : (-2 * t * pv) / Math.PI;
  });
  // (the tails drawn as the part given: Re − offset back to Re)
  if (!im2re) for (const p of [tails.low, tails.high]) p.y = p.y.map((v) => v + o.offset);
  return { out, tails };
}

// ---- impedance: Lin-KK ----

export type LinKK = { M: number; mu: number; re: number[]; im: number[]; resRe: number[]; resIm: number[]; R: number[]; tau: number[] };
// f the frequencies, re and im of Z (im: Z″ itself, negative for a capacitive system)
export function linKK(f: number[], re: number[], im: number[], o: { cap: boolean; ind: boolean; mu: number; maxM: number }): LinKK | null {
  const n = f.length;
  const w = f.map((v) => 2 * Math.PI * v);
  const mod = re.map((v, i) => Math.hypot(v, im[i]) || 1);
  const [fmin, fmax] = [Math.min(...f), Math.max(...f)];
  const [tmin, tmax] = [1 / (2 * Math.PI * fmax), 1 / (2 * Math.PI * fmin)];
  let best: LinKK | null = null;
  let bestErr = Infinity;
  // (none allowed by μ: the one with the largest μ)
  let fallback: LinKK | null = null;
  for (let M = 1; M <= Math.max(1, o.maxM); M++) {
    const tau = M === 1 ? [tmin] : Array.from({ length: M }, (_, k) => tmin * (tmax / tmin) ** (k / (M - 1)));
    // the columns: R0, R1 … RM, (L), (1/C); real rows then imaginary rows, each divided by |Z|
    const p = 1 + M + (o.ind ? 1 : 0) + (o.cap ? 1 : 0);
    if (2 * n < p) break;
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
      const row = [1, ...tau.map((t) => 1 / (1 + (w[i] * t) ** 2)), ...(o.ind ? [0] : []), ...(o.cap ? [0] : [])];
      X.push(row.map((v) => v / mod[i]));
      y.push(re[i] / mod[i]);
    }
    for (let i = 0; i < n; i++) {
      const row = [0, ...tau.map((t) => (-w[i] * t) / (1 + (w[i] * t) ** 2)), ...(o.ind ? [w[i]] : []), ...(o.cap ? [-1 / w[i]] : [])];
      X.push(row.map((v) => v / mod[i]));
      y.push(im[i] / mod[i]);
    }
    const ls = leastSquares(X, y);
    if (!ls) break;
    const R = ls.beta.slice(1, 1 + M);
    const pos = R.filter((v) => v >= 0).reduce((s, v) => s + v, 0);
    const neg = R.filter((v) => v < 0).reduce((s, v) => s - v, 0);
    const mu = pos > 0 ? 1 - neg / pos : 1;
    const fitRe = f.map((_, i) => X[i].reduce((s, v, j) => s + v * ls.beta[j], 0) * mod[i]);
    const fitIm = f.map((_, i) => X[n + i].reduce((s, v, j) => s + v * ls.beta[j], 0) * mod[i]);
    const cur: LinKK = { M, mu, re: fitRe, im: fitIm, resRe: re.map((v, i) => (100 * (v - fitRe[i])) / mod[i]), resIm: im.map((v, i) => (100 * (v - fitIm[i])) / mod[i]), R: ls.beta.slice(0, 1 + M), tau };
    const err = cur.resRe.reduce((s, v) => s + v * v, 0) + cur.resIm.reduce((s, v) => s + v * v, 0);
    if (mu >= o.mu && err < bestErr) [best, bestErr] = [cur, err];
    if (!fallback || mu > fallback.mu) fallback = cur;
  }
  return best ?? fallback;
}

// ---- the node ----

export const KK_DEFAULTS: KKData = { mode: 'eis', x: '', a: '', b: '', imNeg: 'auto', cap: false, ind: true, mu: 0.85, maxM: 50, limit: 1, xKind: 'auto', low: 'constant', high: 'power', power: 4, direction: 'im2re', offset: 0 };
const WAVE_UNITS = /^(nm|µm|um|micron|microns|Å|A|angstrom|m|mm|pm)$/i;
const num = (name: string, v: number[], role?: Column['role']): Column => ({ ...column(name, Float64Array.from(v)), ...(role ? { role } : {}) });

export type KKOut = { dataset: Dataset; plots: SignalPlot[]; labels: string[]; warnings: string[]; report: string[] } | string;
export function kkNode(ds: Dataset, d: KKData): KKOut {
  const cols = ds.columns;
  const numeric = cols.filter((c) => !c.text);
  const pickCol = (name: string, fallback: Column | undefined) => (name ? findColumn(cols, name) : fallback);
  const warnings: string[] = [];
  if (d.mode === 'eis') {
    const g = guessColumns(cols, 'reim');
    const fc = pickCol(d.x, g.freq);
    const ac = pickCol(d.a, g.a);
    const bc = pickCol(d.b, g.b);
    if (!fc || !ac || !bc) return 'Columns: the frequency, Z′ and Z″ are needed.';
    // (Z″ given as −Z″: by its name, or by its sign — a capacitive spectrum has Z″ < 0)
    const named = /^\s*[-−]/.test(bc.name);
    const pts = Array.from(fc.values, (v, i) => ({ f: v, a: ac.values[i], b: bc.values[i] })).filter((p) => Number.isFinite(p.f) && p.f > 0 && Number.isFinite(p.a) && Number.isFinite(p.b));
    if (pts.length < 4) return 'Too few points (frequency > 0, Z′ and Z″ numbers).';
    const pos = pts.filter((p) => p.b > 0).length > pts.length / 2;
    const neg = d.imNeg === 'yes' || (d.imNeg === 'auto' && (named || pos));
    if (d.imNeg === 'auto' && neg && !named) warnings.push('Z″ read as −Z″ (mostly positive: a capacitive spectrum has Z″ < 0); say otherwise in the options.');
    pts.sort((p, q) => p.f - q.f);
    const f = pts.map((p) => p.f);
    const re = pts.map((p) => p.a);
    const im = pts.map((p) => (neg ? -p.b : p.b));
    const r = linKK(f, re, im, d);
    if (!r) return 'The Lin-KK fit could not be made (too few points for the elements).';
    const maxRe = Math.max(...r.resRe.map(Math.abs));
    const maxIm = Math.max(...r.resIm.map(Math.abs));
    const ok = Math.max(maxRe, maxIm) <= d.limit;
    const report = [
      `Lin-KK: ${r.M} RC element${r.M === 1 ? '' : 's'}, μ = ${r.mu.toFixed(3)}${r.mu >= d.mu ? ` (at least ${d.mu}: not over-fitted)` : ` (below ${d.mu}: none of 1 to ${d.maxM} elements kept μ up; the one with the largest μ)`}.`,
      `Residuals: Z′ within ±${maxRe.toFixed(2)} %, Z″ within ±${maxIm.toFixed(2)} % of |Z|: ${ok ? `within ±${d.limit} %, the data obey Kramers–Kronig` : `beyond ±${d.limit} %: look for drift, non-linearity or noise where they are large`}.`,
    ];
    if (r.mu < d.mu) warnings.push(`μ fell below ${d.mu} with every number of elements: the fit may follow the noise; more points, or a lower μ limit.`);
    const unit = unitOf(fc.name) || 'Hz';
    const zu = unitOf(ac.name) || 'Ω';
    const dataset: Dataset = {
      name: `${ds.name} Lin-KK`,
      columns: [
        num(`Frequency (${unit})`, f, 'x'),
        num(`Z′ (${zu})`, re),
        num(`−Z″ (${zu})`, im.map((v) => -v)),
        num(`Z′ KK (${zu})`, r.re),
        num(`−Z″ KK (${zu})`, r.im.map((v) => -v)),
        num('Residual Z′ (%)', r.resRe, 'y'),
        num('Residual Z″ (%)', r.resIm, 'y'),
      ],
    };
    const band = { x: [f[0], f[f.length - 1]], lo: [-d.limit, -d.limit], hi: [d.limit, d.limit] };
    const plots: SignalPlot[] = [
      { result: { x: [], y: [] }, xName: `Frequency (${unit})`, yName: 'Residual (%)', logX: true, band, bandColor: 'rgba(48, 160, 80, 0.14)', series: [{ name: 'Z′', x: f, y: r.resRe, color: '#1f6fd6', dots: true, line: true }, { name: 'Z″', x: f, y: r.resIm, color: '#d62728', dots: true, line: true }], zero: true },
      { data: { x: re, y: im.map((v) => -v) }, result: { x: r.re, y: r.im.map((v) => -v) }, xName: `Z′ (${zu})`, yName: `−Z″ (${zu})`, series: [], legend: ['data', 'Lin-KK fit'] },
      { data: { x: f, y: re }, result: { x: f, y: r.re }, xName: `Frequency (${unit})`, yName: `Z′ (${zu})`, logX: true, legend: ['data', 'Lin-KK fit'] },
      { data: { x: f, y: im.map((v) => -v) }, result: { x: f, y: r.im.map((v) => -v) }, xName: `Frequency (${unit})`, yName: `−Z″ (${zu})`, logX: true, legend: ['data', 'Lin-KK fit'] },
    ];
    return { dataset, plots, labels: ['residuals', 'Nyquist', 'Z′', '−Z″'], warnings, report };
  }
  // optical, general: X and the column
  const firstY = numeric.find((c) => roleOf(cols, cols.indexOf(c)) === 'y' && c !== numeric[0]);
  const xc = pickCol(d.x, numeric.find((c) => roleOf(cols, cols.indexOf(c)) === 'x') ?? numeric[0]);
  const yc = pickCol(d.a, firstY ?? numeric.find((c) => c !== xc));
  if (!xc || !yc) return 'Columns: X and the column to transform are needed.';
  const unit = unitOf(xc.name);
  const wave = d.xKind === 'wavelength' || (d.xKind === 'auto' && WAVE_UNITS.test(unit));
  const pts = Array.from(xc.values, (v, i) => ({ x: v, y: yc.values[i] })).filter((p) => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y));
  if (pts.length < 4) return 'Too few points (X > 0 and a number).';
  // (on 1/λ for a wavelength: ∝ the frequency; the results back on the X given, in its order)
  const u = pts.map((p) => (wave ? 1 / p.x : p.x));
  const order = u.map((_, i) => i).sort((i, j) => u[i] - u[j]);
  const xs = order.map((i) => u[i]);
  const ys = order.map((i) => pts[i].y);
  const back = (v: number[]) => {
    const out = new Array<number>(v.length);
    order.forEach((i, k) => (out[i] = v[k]));
    return out;
  };
  const X0 = pts.map((p) => p.x);
  const xName = xc.name;
  const toX = (v: number) => (wave ? 1 / v : v);
  // (the tails drawn on the X given: a wavelength's tail below is the long wavelengths)
  const tailCurves = (t: Tails, scale = 1) => [t.low, t.high].map((p) => ({ x: p.x.filter((v) => v > 0).map(toX), y: p.x.map((v, i) => [v, p.y[i] * scale] as const).filter(([v]) => v > 0).map(([, y]) => y) }));
  const marks = [toX(xs[0]), toX(xs[xs.length - 1])];
  if (wave) warnings.push(`X read as a wavelength (${unit} in its name): the integrals on 1/λ.`);
  else if (!unit) warnings.push('X has no unit in its name: read as proportional to the frequency (an energy, a wavenumber); a wavelength: say it in the options.');
  if (d.mode === 'optical') {
    const pct = Math.max(...ys) > 1.5;
    const R = ys.map((v) => (pct ? v / 100 : v));
    if (R.some((v) => v <= 0 || v >= 1)) warnings.push('R must be between 0 and 1 (or 0 and 100 %): the points outside are clipped.');
    const Rc = R.map((v) => Math.min(0.9999, Math.max(1e-6, v)));
    const o = opticalKK(xs, Rc, d);
    const [th, n, k, e1, e2] = [o.theta, o.n, o.k, o.e1, o.e2].map(back);
    const Rb = back(Rc);
    // α = 4πk/λ, in cm⁻¹, when X's unit says what λ is
    const lambdaCm = (v: number): number => (/^nm$/i.test(unit) ? v * 1e-7 : /^(µm|um|micron)$/i.test(unit) ? v * 1e-4 : /^eV$/i.test(unit) ? 1.239842e-4 / v : /^cm(-1|⁻¹)$/i.test(unit) ? 1 / v : NaN);
    const alpha = X0.map((v, i) => (4 * Math.PI * k[i]) / lambdaCm(v));
    const dataset: Dataset = {
      name: `${ds.name} KK`,
      columns: [num(xName, X0, 'x'), num('R', Rb), num('Phase (rad)', th), num('n', n, 'y'), num('k', k, 'y'), num('ε₁', e1), num('ε₂', e2), ...(alpha.every(Number.isFinite) ? [num('α (cm⁻¹)', alpha)] : [])],
    };
    const t = tailCurves(o.tails, pct ? 100 : 1);
    const dash = (c: { x: number[]; y: number[] }, name: string) => ({ ...c, name, color: '#7a7a7a', dash: true, line: true });
    const plots: SignalPlot[] = [
      { data: { x: X0, y: Rb.map((v) => (pct ? v * 100 : v)) }, result: { x: [], y: [] }, xName, yName: pct ? 'R (%)' : 'R', series: [dash(t[0], 'below the data (assumed)'), dash(t[1], 'above the data (assumed)')], marks, legend: ['R measured'] },
      { result: { x: X0, y: n }, xName, yName: 'n, k', series: [{ name: 'k', x: X0, y: k, color: '#1f6fd6', line: true }], marks, legend: ['n'] },
      { result: { x: X0, y: e1 }, xName, yName: 'ε₁, ε₂', series: [{ name: 'ε₂', x: X0, y: e2, color: '#1f6fd6', line: true }], marks, legend: ['ε₁'] },
      { result: { x: X0, y: th }, xName, yName: 'Phase (rad)', marks, legend: ['phase'] },
    ];
    return { dataset, plots, labels: ['R and its tails', 'n and k', 'ε₁ and ε₂', 'phase'], warnings, report: [`From R (${pts.length} points${pct ? ', in %' : ''}): below the data ${d.low === 'hagen' ? 'Hagen–Rubens' : 'R constant'}, above ${d.high === 'power' ? `R ∝ ω^−${d.power}` : 'R constant'}; n, k, ε₁, ε₂${alpha.every(Number.isFinite) ? ', α' : ''}.`] };
  }
  const o = generalKK(xs, ys, d);
  const out = back(o.out);
  const im2re = d.direction === 'im2re';
  const outName = `${im2re ? 'Re' : 'Im'} by KK (from ${yc.name})`;
  const dataset: Dataset = { name: `${ds.name} KK`, columns: [num(xName, X0, 'x'), num(yc.name, back(ys), 'y'), num(outName, out, 'y')] };
  const t = tailCurves(o.tails);
  const plots: SignalPlot[] = [
    {
      data: { x: X0, y: back(ys) },
      result: { x: X0, y: out },
      xName,
      yName: `${yc.name}, ${im2re ? 'Re' : 'Im'}`,
      series: t.map((c, j) => ({ ...c, name: j ? 'above the data (assumed)' : 'below the data (assumed)', color: '#7a7a7a', dash: true, line: true })),
      marks,
      legend: [`${yc.name} (${im2re ? 'Im' : 'Re'})`, `${im2re ? 'Re' : 'Im'} from KK`],
    },
  ];
  return { dataset, plots, labels: [im2re ? 'Re from Im' : 'Im from Re'], warnings, report: [`${im2re ? 'Re from Im' : 'Im from Re'}${d.offset ? ` (Re at infinity ${d.offset})` : ''}: below the data ${d.low}, above ${d.high === 'power' ? `∝ x^−${d.power}` : d.high}.`] };
}
