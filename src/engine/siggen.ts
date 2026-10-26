// Signal generator: signals made, with what is known about them (to teach, and to test the other nodes on data whose
// answer is known). Components: a sum of waveforms (sine, square, triangle, sawtooth, pulses, a step, an impulse, a
// damped oscillation, a Gaussian pulse, an exponential), chirps (linear, quadratic, logarithmic, hyperbolic: as
// scipy.signal.chirp), peaks (Gaussian, Lorentzian, Voigt, Fano), two coupled oscillators and a polynomial baseline.
// C–V: the capacitance of a structure against its voltage (cv.ts: a MOS capacitor, a p–n junction, a Schottky diode, a
// varactor, a MIM or a ferroelectric capacitor, a semiconductor electrode, an electrical double layer). Impedance: a
// circuit's impedance against the frequency (the circuits of Equivalent circuit). Then, on any of them: noise (white, pink, brown; by its SD or a signal-to-noise ratio), a drift, spikes, missing values, uneven
// sampling. Pure.
import { column, type Column, type Dataset } from './table.ts';
import { voigtProfile } from './faddeeva.ts';
import { fft } from './signal.ts';
import { parseCircuit, simulate, startParams, type EisParam } from './eis.ts';
import type { SignalPlot } from './signalnodes.ts';
import { CV_MORE, cvMake, measured, type CvSpec } from './cv.ts';
export { mosCurve, type CvSpec } from './cv.ts';

export type CompKind = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse' | 'step' | 'impulse' | 'damped' | 'gausspulse' | 'exp' | 'chirp' | 'gauss' | 'lorentz' | 'voigt' | 'fano' | 'coupled' | 'poly';
// a component: its kind, its numbers (p), its choices (opts), the coefficients of a polynomial, switched off, given a
// column of its own
export type GenComponent = { id: string; kind: CompKind; p: Record<string, number>; opts?: Record<string, string>; coefs?: string; off?: boolean; own?: boolean };
// a circuit (Boukamp's code, as Equivalent circuit), its values, the frequencies (Hz, so many a decade)
export type EisGenSpec = { circuit: string; params: EisParam[]; fMin: number; fMax: number; per: number };
// noise: none, white, pink (1/f), brown (1/f²); normal or uniform; by its SD or a signal-to-noise ratio (dB); for an
// impedance, a part of |Z| (%)
export type NoiseSpec = { kind: 'none' | 'white' | 'pink' | 'brown'; dist: 'normal' | 'uniform'; by: 'snr' | 'sigma'; snr: number; sigma: number };
export type SigGenSpec = {
  kind: 'components' | 'cv' | 'eis';
  xFrom: number;
  xTo: number;
  points: number;
  xName: string;
  yName: string;
  components: GenComponent[];
  cv: CvSpec;
  eis: EisGenSpec;
  noise: NoiseSpec;
  drift?: number; // per unit of x
  spikes?: number; // how many
  spikeSize?: number; // a part of the signal's span
  missing?: number; // % of the points empty
  jitter?: number; // uneven sampling: every x moved by up to this part of the step
  clean?: boolean; // the signal without the noise, a column too
  seed: number;
};

// ---- the components: their numbers and choices (label, default), as the node lists them ----
type Param = [key: string, label: string, def: number];
export const COMPONENTS: Record<CompKind, { label: string; group: 'Waveforms' | 'Chirp' | 'Peaks' | 'Baseline'; params: Param[]; opts?: Record<string, [string, string][]> }> = {
  sine: { label: 'Sine', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['f', 'Frequency', 1], ['phase', 'Phase °', 0], ['offset', 'Offset', 0]] },
  square: { label: 'Square', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['f', 'Frequency', 1], ['duty', 'Duty', 0.5], ['phase', 'Phase °', 0]] },
  triangle: { label: 'Triangle', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['f', 'Frequency', 1], ['phase', 'Phase °', 0]] },
  sawtooth: { label: 'Sawtooth', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['f', 'Frequency', 1], ['phase', 'Phase °', 0]] },
  pulse: { label: 'Pulse train', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['f', 'Rate', 1], ['width', 'Width', 0.2], ['rise', 'Rise', 0.02], ['fall', 'Fall', 0.02], ['x0', 'Start', 0]] },
  step: { label: 'Step', group: 'Waveforms', params: [['A', 'Height', 1], ['x0', 'At', 5]] },
  impulse: { label: 'Impulse', group: 'Waveforms', params: [['A', 'Height', 1], ['x0', 'At', 5]] },
  damped: { label: 'Damped oscillation', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['f', 'Frequency', 2], ['tau', 'Decay τ', 2], ['x0', 'Start', 0], ['phase', 'Phase °', 90]] },
  gausspulse: { label: 'Gaussian pulse', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['x0', 'Centre', 5], ['fwhm', 'FWHM', 1], ['f', 'Carrier', 0]] },
  exp: { label: 'Exponential', group: 'Waveforms', params: [['A', 'Amplitude', 1], ['tau', 'τ', 2], ['x0', 'Start', 0]], opts: { where: [['from', 'from the start on'], ['all', 'everywhere']] } },
  chirp: {
    label: 'Chirp',
    group: 'Chirp',
    params: [['A', 'Amplitude', 1], ['f0', 'f₀', 1], ['f1', 'f₁', 10], ['x0', 'Start', 0], ['T', 'Duration', 10], ['phase', 'Phase °', 0]],
    opts: {
      method: [['linear', 'linear'], ['quadratic', 'quadratic'], ['logarithmic', 'logarithmic'], ['hyperbolic', 'hyperbolic']],
      env: [['none', 'no envelope'], ['gauss', 'Gaussian envelope'], ['tukey', 'Tukey window']],
    },
  },
  gauss: { label: 'Gaussian', group: 'Peaks', params: [['A', 'Height', 1], ['c', 'Centre', 5], ['fwhm', 'FWHM', 1]] },
  lorentz: { label: 'Lorentzian', group: 'Peaks', params: [['A', 'Height', 1], ['c', 'Centre', 5], ['fwhm', 'FWHM', 1]] },
  voigt: { label: 'Voigt', group: 'Peaks', params: [['A', 'Height', 1], ['c', 'Centre', 5], ['gw', 'Gauss FWHM', 1], ['lw', 'Lorentz FWHM', 0.5]] },
  fano: { label: 'Fano', group: 'Peaks', params: [['A', 'Scale', 1], ['c', 'Resonance', 5], ['w', 'Width Γ', 1], ['q', 'q', 2]] },
  coupled: {
    label: 'Coupled oscillators',
    group: 'Peaks',
    params: [['A', 'Height', 1], ['e1', 'ω₁', 5], ['e2', 'ω₂', 5], ['g1', 'γ₁', 0.2], ['g2', 'γ₂', 0.2], ['g', 'Coupling g', 0.5]],
    opts: { out: [['power', 'absorbed power'], ['amp1', 'amplitude of 1'], ['amp2', 'amplitude of 2']] },
  },
  poly: { label: 'Polynomial', group: 'Baseline', params: [] },
};
export const newComponent = (kind: CompKind, id: string): GenComponent => ({
  id,
  kind,
  p: Object.fromEntries(COMPONENTS[kind].params.map(([k, , v]) => [k, v])),
  ...(COMPONENTS[kind].opts ? { opts: Object.fromEntries(Object.entries(COMPONENTS[kind].opts!).map(([k, o]) => [k, o[0][0]])) } : {}),
  ...(kind === 'poly' ? { coefs: '0, 0.1' } : {}),
});

const D2R = Math.PI / 180;
const frac = (v: number) => v - Math.floor(v);
// a waveform of period 1 at the fraction u: scipy's sawtooth (width w: up over w, down over 1 − w), square (duty)
const saw = (u: number, w: number) => (u < w ? -1 + (2 * u) / w : 1 - (2 * (u - w)) / (1 - w));

// the phase of a chirp at t (from its start), its frequency going from f0 to f1 in T (scipy.signal.chirp, vertex_zero)
export function chirpPhase(t: number, f0: number, f1: number, T: number, method: string): number {
  if (method === 'quadratic') return 2 * Math.PI * (f0 * t + ((f1 - f0) / (3 * T * T)) * t ** 3);
  if (method === 'logarithmic') {
    if (f0 * f1 <= 0) return NaN;
    if (f0 === f1) return 2 * Math.PI * f0 * t;
    const beta = T / Math.log(f1 / f0);
    return 2 * Math.PI * beta * f0 * ((f1 / f0) ** (t / T) - 1);
  }
  if (method === 'hyperbolic') {
    if (f0 === 0 || f1 === 0) return NaN;
    if (f0 === f1) return 2 * Math.PI * f0 * t;
    const sing = (-f1 * T) / (f0 - f1);
    return 2 * Math.PI * (-sing * f0) * Math.log(Math.abs(1 - t / sing));
  }
  return 2 * Math.PI * (f0 * t + 0.5 * ((f1 - f0) / T) * t * t);
}

// two coupled oscillators driven through the first (Joe, Satanin & Kim 2006, Phys. Scr. 74, 259): their amplitudes at
// ω, and the power they absorb (½ Σ γᵢ ω² |xᵢ|²); g: half the splitting of the normal modes at resonance
export function coupledAt(w: number, e1: number, e2: number, g1: number, g2: number, g: number): { x1: number; x2: number; power: number } {
  const k = 2 * g * Math.sqrt(Math.abs(e1 * e2));
  const [a1, b1] = [e1 * e1 - w * w, g1 * w];
  const [a2, b2] = [e2 * e2 - w * w, g2 * w];
  // x1 = D2 / (D1·D2 − κ²), x2 = κ·x1 / D2
  const [dr, di] = [a1 * a2 - b1 * b2 - k * k, a1 * b2 + b1 * a2];
  const q = dr * dr + di * di;
  const [x1r, x1i] = [(a2 * dr + b2 * di) / q, (b2 * dr - a2 * di) / q];
  const m1 = Math.hypot(x1r, x1i);
  const m2 = (k * m1) / Math.hypot(a2, b2);
  return { x1: m1, x2: m2, power: 0.5 * w * w * (g1 * m1 * m1 + g2 * m2 * m2) };
}

// a component at every x (a Kronecker impulse at the x nearest its place)
export function componentAt(c: GenComponent, x: number[]): number[] | string {
  const P = (k: string) => c.p[k] ?? COMPONENTS[c.kind].params.find((q) => q[0] === k)?.[2] ?? 0;
  const A = P('A');
  const n = x.length;
  switch (c.kind) {
    case 'sine':
      return x.map((v) => A * Math.sin(2 * Math.PI * P('f') * v + P('phase') * D2R) + P('offset'));
    case 'square': {
      const duty = Math.min(1, Math.max(0, P('duty')));
      return x.map((v) => (frac(P('f') * v + P('phase') / 360) < duty ? A : -A));
    }
    case 'triangle':
      return x.map((v) => A * saw(frac(P('f') * v + P('phase') / 360), 0.5));
    case 'sawtooth':
      return x.map((v) => A * saw(frac(P('f') * v + P('phase') / 360), 1));
    case 'pulse': {
      const per = 1 / (P('f') || 1);
      const [w, r, fl] = [Math.max(0, P('width')), Math.max(0, P('rise')), Math.max(0, P('fall'))];
      return x.map((v) => {
        const t = ((((v - P('x0')) % per) + per) % per);
        if (t < r) return (A * t) / r;
        if (t < r + w) return A;
        if (t < r + w + fl) return A * (1 - (t - r - w) / fl);
        return 0;
      });
    }
    case 'step':
      return x.map((v) => (v >= P('x0') ? A : 0));
    case 'impulse': {
      let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(x[i] - P('x0')) < Math.abs(x[best] - P('x0'))) best = i;
      return x.map((_, i) => (i === best ? A : 0));
    }
    case 'damped':
      return x.map((v) => (v < P('x0') ? 0 : A * Math.exp(-(v - P('x0')) / (P('tau') || 1)) * Math.sin(2 * Math.PI * P('f') * (v - P('x0')) + P('phase') * D2R)));
    case 'gausspulse': {
      const s = P('fwhm') / (2 * Math.sqrt(2 * Math.LN2));
      return x.map((v) => A * Math.exp(-((v - P('x0')) ** 2) / (2 * s * s)) * Math.cos(2 * Math.PI * P('f') * (v - P('x0'))));
    }
    case 'exp':
      return x.map((v) => (c.opts?.where !== 'all' && v < P('x0') ? 0 : A * Math.exp(-(v - P('x0')) / (P('tau') || 1))));
    case 'chirp': {
      const [x0, T] = [P('x0'), P('T')];
      if (!(T > 0)) return 'Chirp: its duration must be above 0.';
      const method = c.opts?.method ?? 'linear';
      if (method === 'logarithmic' && P('f0') * P('f1') <= 0) return 'Chirp: a logarithmic one needs f₀ and f₁ of one sign, not 0.';
      if (method === 'hyperbolic' && (P('f0') === 0 || P('f1') === 0)) return 'Chirp: a hyperbolic one needs f₀ and f₁ not 0.';
      const env = c.opts?.env ?? 'none';
      return x.map((v) => {
        const t = v - x0;
        if (t < 0 || t > T) return 0;
        let e = 1;
        if (env === 'gauss') e = Math.exp(-((t - T / 2) ** 2) / (2 * (T / 6) ** 2));
        else if (env === 'tukey') {
          // a Tukey window of α = 0.5: cosine tapers over a quarter of the duration at each end
          const a = 0.5;
          const u = t / T;
          e = u < a / 2 ? 0.5 * (1 + Math.cos(Math.PI * ((2 * u) / a - 1))) : u > 1 - a / 2 ? 0.5 * (1 + Math.cos(Math.PI * ((2 * u) / a - 2 / a + 1))) : 1;
        }
        return A * e * Math.cos(chirpPhase(t, P('f0'), P('f1'), T, method) + P('phase') * D2R);
      });
    }
    case 'gauss':
      return x.map((v) => A * Math.exp((-4 * Math.LN2 * (v - P('c')) ** 2) / (P('fwhm') || 1) ** 2));
    case 'lorentz': {
      const h = (P('fwhm') || 1) / 2;
      return x.map((v) => (A * h * h) / ((v - P('c')) ** 2 + h * h));
    }
    case 'voigt': {
      const s = Math.max(1e-12, P('gw')) / (2 * Math.sqrt(2 * Math.LN2));
      const g = Math.max(0, P('lw')) / 2;
      const top = voigtProfile(0, s, g);
      return x.map((v) => (A * voigtProfile(v - P('c'), s, g)) / top);
    }
    case 'fano': {
      const [q, w] = [P('q'), P('w') || 1];
      return x.map((v) => {
        const e = (2 * (v - P('c'))) / w;
        return (A * (q + e) ** 2) / (1 + e * e);
      });
    }
    case 'coupled': {
      const out = c.opts?.out ?? 'power';
      const raw = x.map((v) => {
        const r = coupledAt(v, P('e1'), P('e2'), P('g1'), P('g2'), P('g'));
        return out === 'amp1' ? r.x1 : out === 'amp2' ? r.x2 : r.power;
      });
      const top = Math.max(...raw.filter(Number.isFinite));
      return raw.map((v) => (top > 0 ? (A * v) / top : 0));
    }
    case 'poly': {
      const k = (c.coefs ?? '').split(/[,;\s]+/).filter(Boolean).map(Number);
      if (k.some((v) => !Number.isFinite(v))) return 'Polynomial: its coefficients are numbers, c₀, c₁, c₂ …';
      return x.map((v) => k.reduce((s, a, j) => s + a * v ** j, 0));
    }
  }
}

// ---- random numbers: a seeded generator (mulberry32), normal ones by Box–Muller ----
export function rng(seed: number) {
  let s = Math.floor(seed) >>> 0;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const a = 1 - u();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
  };
  return { u, normal };
}
const sdOf = (v: number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length || 1)) || 1;
};

// noise of SD 1: white (normal or uniform), pink (white shaped by 1/√f in its spectrum: its power ∝ 1/f), brown (white
// summed: ∝ 1/f²)
export function noiseOf(kind: NoiseSpec['kind'], dist: NoiseSpec['dist'], n: number, r: ReturnType<typeof rng>): number[] {
  const white = () => Array.from({ length: n }, () => (dist === 'uniform' ? Math.sqrt(3) * (2 * r.u() - 1) : r.normal()));
  if (kind === 'none' || n === 0) return new Array(n).fill(0);
  let v = white();
  if (kind === 'pink') {
    const [re, im] = fft(v, new Array(n).fill(0));
    for (let k = 0; k < n; k++) {
      const f = Math.min(k, n - k);
      const g = f === 0 ? 0 : 1 / Math.sqrt(f);
      re[k] *= g;
      im[k] *= g;
    }
    v = fft(re, im, true)[0];
  } else if (kind === 'brown') {
    let s = 0;
    v = v.map((x) => (s += x));
  }
  const m = v.reduce((a, b) => a + b, 0) / n;
  const sd = sdOf(v);
  return v.map((x) => (x - m) / sd);
}

const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => (n === 1 ? a : a + ((b - a) * k) / (n - 1)));
const CV_UNITS: Record<Exclude<CvSpec['unit'], 'norm'>, [number, string, string]> = { pF: [1e12, 'pF', 'pF⁻²'], nF: [1e9, 'nF', 'nF⁻²'], F: [1, 'F', 'F⁻²'], 'nF/cm2': [1e9, 'nF/cm²', 'cm⁴/nF²'], 'uF/cm2': [1e6, 'µF/cm²', 'cm⁴/µF²'] };
// the colours of the more curves on the node's graph (the components, the other temperatures)
const SERIES = ['#2ca02c', '#9467bd', '#ff7f0e', '#1f6fd6', '#8c564b', '#17becf', '#e377c2'];

// ---- the whole: the columns made, and what was said ----
// the node's graph: the signal made (with its noise, as dots) and the clean one (a line); the C–V curves, one a
// temperature; for an impedance, its Nyquist plot and its Bode plots
export function generate(d: SigGenSpec): { dataset: Dataset; warnings: string[]; plots: SignalPlot[]; labels: string[] } | string {
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const labels: string[] = [];
  const r = rng(d.seed);
  const cols: Column[] = [];
  // the noise and the rest on a column of values (its clean copy kept for the “without noise” column)
  const spoil = (y: number[], x: number[], rel?: number[]): number[] => {
    const out = y.slice();
    const fin = y.filter(Number.isFinite);
    if (d.noise.kind !== 'none') {
      const nz = noiseOf(d.noise.kind, d.noise.dist, y.length, r);
      let s = 0;
      if (rel) s = Math.max(0, d.noise.sigma) / 100;
      else if (d.noise.by === 'sigma') s = Math.max(0, d.noise.sigma);
      else {
        const p = fin.reduce((a, b) => a + b * b, 0) / (fin.length || 1);
        s = Math.sqrt(p) / 10 ** (d.noise.snr / 20);
        if (!(p > 0)) warnings.push('Noise by a signal-to-noise ratio: the signal is 0 (no noise added; give its SD instead).');
      }
      for (let i = 0; i < out.length; i++) out[i] += nz[i] * s * (rel ? rel[i] : 1);
    }
    if (d.drift) for (let i = 0; i < out.length; i++) out[i] += d.drift * (x[i] - x[0]);
    if (d.spikes && d.spikes > 0 && fin.length) {
      const span = Math.max(...fin) - Math.min(...fin) || 1;
      for (let k = 0; k < Math.min(out.length, Math.floor(d.spikes)); k++) out[Math.floor(r.u() * out.length)] += (r.u() < 0.5 ? -1 : 1) * (d.spikeSize ?? 0.5) * span;
    }
    return out;
  };
  const hole = (n: number) => {
    const empty = new Set<number>();
    const want = Math.round((Math.min(90, Math.max(0, d.missing ?? 0)) / 100) * n);
    while (empty.size < want) empty.add(Math.floor(r.u() * n));
    return empty;
  };
  if (d.kind === 'components') {
    const n = Math.max(2, Math.min(1_000_000, Math.round(d.points) || 1000));
    let x = linspace(d.xFrom, d.xTo, n);
    if (d.jitter && d.jitter > 0) {
      const step = (d.xTo - d.xFrom) / (n - 1);
      x = x.map((v, i) => (i === 0 || i === n - 1 ? v : v + (r.u() - 0.5) * Math.min(1, d.jitter!) * step));
    }
    const on = d.components.filter((c) => !c.off);
    if (!on.length) return 'Add a component (+ Add component).';
    const sum = new Array(n).fill(0);
    const own: Column[] = [];
    for (const c of on) {
      const v = componentAt(c, x);
      if (typeof v === 'string') return v;
      for (let i = 0; i < n; i++) sum[i] += v[i];
      if (c.own) own.push(column(`${COMPONENTS[c.kind].label} ${d.components.indexOf(c) + 1}`, Float64Array.from(v)));
    }
    const y = spoil(sum, x);
    const empty = hole(n);
    cols.push({ ...column(d.xName || 'x', Float64Array.from(x)), role: 'x' });
    cols.push({ ...column(d.yName || 'Signal', Float64Array.from(y, (v, i) => (empty.has(i) ? NaN : v))), role: 'y' });
    if (d.clean && (d.noise.kind !== 'none' || d.drift || d.spikes)) cols.push({ ...column(`${d.yName || 'Signal'} (clean)`, Float64Array.from(sum)), role: 'y' });
    for (const c of own) cols.push({ ...c, role: 'y' });
    const yn = d.yName || 'Signal';
    const spoilt = d.noise.kind !== 'none' || !!d.drift || !!d.spikes;
    const shown = Array.from(cols[1].values);
    const series = own.map((c, q) => ({ name: c.name, x, y: Array.from(c.values), color: SERIES[q % SERIES.length], line: true, dash: true }));
    plots.push({ ...(spoilt ? { data: { x, y: shown } } : {}), result: { x, y: spoilt ? sum : shown }, xName: d.xName || 'x', yName: yn, legend: spoilt ? [yn, 'clean'] : series.length ? [yn] : undefined, series });
    labels.push(yn);
  } else if (d.kind === 'cv') {
    const c = d.cv;
    const made = cvMake(c);
    if (typeof made === 'string') return made;
    warnings.push(...made.warnings);
    const sweep = made.v;
    const n = sweep.length;
    cols.push({ ...column(made.xName, Float64Array.from(sweep)), role: 'x' });
    let unit = c.unit;
    if (unit === 'norm' && !made.cox) {
      warnings.push('C/C_ox: this structure has no oxide (written in pF).');
      unit = 'pF';
    }
    const [scale, uName, invName] = unit === 'norm' ? [1 / made.cox!, '', ''] : CV_UNITS[unit];
    const k = unit === 'nF/cm2' || unit === 'uF/cm2' ? scale / (c.area * 1e-2) : scale;
    const cName = unit === 'norm' ? 'C/C_ox' : `C (${uName})`;
    const iName = unit === 'norm' ? '1/(C/C_ox)²' : `1/C² (${invName})`;
    // (measured at f in parallel mode, through a series resistance and with a leak across)
    const [rs, gl, f] = [c.rs ?? 0, c.gl ?? 0, c.freq ?? CV_MORE.freq];
    const meas = rs > 0 || gl > 0;
    if (meas && !(f > 0)) return 'C–V: the frequency it is measured at must be above 0.';
    // (the curves of the graphs: C, and 1/C², W and the more columns when written)
    const more = new Map<string, { name: string; y: number[] }[]>();
    const keep = (title: string, name: string, y: number[]) => more.set(title, [...(more.get(title) ?? []), { name, y }]);
    for (const s of made.sets) {
      const t = s.label ? `, ${s.label}` : '';
      const m = meas ? s.c.map((q) => measured(q, rs, gl, f)) : null;
      const clean = (m ? m.map((q) => q.c) : s.c).map((q) => q * k);
      const y = spoil(clean, sweep);
      const empty = hole(n);
      const shown = y.map((q, i) => (empty.has(i) ? NaN : q));
      cols.push({ ...column(`${cName}${t}`, Float64Array.from(shown)), role: 'y' });
      if (d.clean && d.noise.kind !== 'none') cols.push({ ...column(`${cName} (clean)${t}`, Float64Array.from(clean)), role: 'y' });
      keep(cName, s.label || cName, shown);
      if (m) {
        cols.push({ ...column(`G_m (S)${t}`, Float64Array.from(m, (q) => q.g)), role: 'none' });
        keep('G_m (S)', s.label || 'G_m', m.map((q) => q.g));
      }
      if (c.inv2) {
        const inv = shown.map((q) => 1 / (q * q));
        cols.push({ ...column(`${iName}${t}`, Float64Array.from(inv)), role: 'none' });
        keep(iName, s.label || iName, inv);
      }
      if (c.width && s.w) {
        const w = s.w.map((q) => q * 1e9);
        cols.push({ ...column(`W (nm)${t}`, Float64Array.from(w)), role: 'none' });
        keep('W (nm)', s.label || 'W', w);
      }
      for (const e of s.extra ?? []) {
        cols.push({ ...column(`${e.name}${t}`, Float64Array.from(e.v)), role: 'none' });
        keep(e.name, s.label || e.name, e.v);
      }
    }
    for (const [title, cs] of more) {
      const [first, ...rest] = cs;
      plots.push({ result: { x: sweep, y: first.y }, xName: made.xName, yName: title, legend: cs.length > 1 ? [first.name] : undefined, series: rest.map((q, j) => ({ name: q.name, x: sweep, y: q.y, color: SERIES[j % SERIES.length], line: true })) });
      labels.push(title === cName ? 'C–V' : title);
    }
  } else {
    const e = d.eis;
    const parsed = parseCircuit(e.circuit);
    if (typeof parsed === 'string') return `Circuit: ${parsed}`;
    if (!(e.fMin > 0) || !(e.fMax > e.fMin)) return 'Impedance: the frequencies from a lowest to a highest, above 0.';
    const ps = startParams(parsed.elems, parsed.tree, e.params, null);
    const z = simulate(parsed.tree, Object.fromEntries(ps.map((q) => [q.name, q.value])), e.fMin, e.fMax, Math.max(1, Math.min(200, e.per || 10)));
    const mod = z.re.map((a, i) => Math.hypot(a, z.im[i]));
    // (noise as a part of |Z| on both parts)
    const re = spoil(z.re, z.f, mod);
    const im = spoil(z.im, z.f, mod);
    const empty = hole(z.f.length);
    const em = (v: number[]) => Float64Array.from(v, (q, i) => (empty.has(i) ? NaN : q));
    cols.push({ ...column('f (Hz)', Float64Array.from(z.f)), role: 'x' });
    cols.push({ ...column("Z' (Ω)", em(re)), role: 'y' });
    cols.push({ ...column("-Z'' (Ω)", em(im.map((v) => -v))), role: 'y' });
    cols.push({ ...column('|Z| (Ω)', em(re.map((a, i) => Math.hypot(a, im[i])))), role: 'y' });
    cols.push({ ...column('Phase (°)', em(re.map((a, i) => (Math.atan2(im[i], a) * 180) / Math.PI))), role: 'y' });
    // (with noise: the points made as dots, the clean curve as a line)
    const noisy = d.noise.kind !== 'none';
    const col = (j: number) => Array.from(cols[j].values);
    const both = (x: number[], y: number[], clean: { x: number[]; y: number[] }) => (noisy ? { data: { x, y }, result: clean, legend: ['made', 'clean'] } : { result: { x, y } });
    plots.push({ ...both(col(1), col(2), { x: z.re, y: z.im.map((v) => -v) }), xName: "Z' (Ω)", yName: "-Z'' (Ω)" });
    plots.push({ ...both(z.f, col(3), { x: z.f, y: mod }), xName: 'f (Hz)', yName: '|Z| (Ω)', logX: true });
    plots.push({ ...both(z.f, col(4), { x: z.f, y: z.re.map((a, i) => (Math.atan2(z.im[i], a) * 180) / Math.PI) }), xName: 'f (Hz)', yName: 'Phase (°)', logX: true });
    labels.push('Nyquist', 'Bode |Z|', 'Bode phase');
  }
  return { dataset: { name: d.kind === 'cv' ? 'C-V' : d.kind === 'eis' ? 'impedance' : 'signal', columns: cols }, warnings, plots, labels };
}
