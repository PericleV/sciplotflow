// Quick fit: fits on a curve of a Plot, drawn with it — a line (or through the origin), a polynomial, an exponential, a
// power (fitted to ln y, as spreadsheets do), a logarithm, a moving average (trend.ts); peaks — Gaussians, Lorentzians,
// pseudo-Voigts, Voigts — over a baseline, or a formula of one's own, by the Fit node's least squares (fit.ts, the same
// models and results). On all the points or on ranges of x (each one fitted on its own, or all of them together); the
// curve over the ranges or over all the data; its 95 % band; each peak and the baseline; the parameters ± errors, the
// peaks' areas, R². Pure.
import { runFits, type FitParamSpec } from './fit.ts';
import { baseParams, buildModel, findPeaks, peakAt, peaksModel, percentResults, pvArea, shapeSize, shapeStarts, SHAPE_NAMES, type Baseline, type Model, type PeakShape } from './fitModels.ts';
import { voigtProfile, voigtSG } from './faddeeva.ts';
import { trendFit, type TrendKind, type TrendSpec } from './trend.ts';
import { curveStyle, type CurveStyle, type Dash, type Hatch, type HatchLook } from '../figure/spec.ts';

export type QuickFitKind = TrendKind | 'peaks' | 'formula';
export type QuickPeakShape = 'gauss' | 'lorentz' | 'voigt' | 'voigtx';
export type XRange = { lo: number; hi: number };
// the look of the ranges drawn on the figure (a band of x): shown or not, its fill, edges and hatching
export type RegionLook = { show?: boolean; fill?: string; opacity?: number; edge?: string; edgeWidth?: number; edgeDash?: Dash; hatch?: Hatch; hatchColor?: string; hatchLook?: HatchLook };
export type QuickFitSpec = {
  kind: QuickFitKind;
  show?: boolean; // false: not fitted, not drawn
  label?: string; // its name (legend, results); '' = the model's
  // a line, a polynomial, a moving average
  degree?: number;
  window?: number;
  origin?: boolean;
  // peaks: their shape, how many (or as many as placed), the baseline, the starts placed on the figure, each drawn
  shape?: QuickPeakShape;
  count?: number;
  baseline?: Baseline;
  place?: boolean;
  points?: { x: number; y: number }[];
  parts?: boolean;
  // a formula of x (every other name a parameter)
  formula?: string;
  // the parameters' starts (NaN: guessed), fixed, limits — peaks and formula
  params?: FitParamSpec[];
  // the ranges of x fitted (none: all), each one on its own or all together; the curve over all the data
  ranges?: XRange[];
  perRange?: boolean;
  drawAll?: boolean;
  region?: RegionLook;
  // the curve's look (absent: its curve's colour, a dashed line for a trend, solid for a fit): all of a curve's style
  // (line, scatter, line + symbols, steps; symbols, fill, colour map, labels …) — older projects: colour, width, line,
  // opacity alone (read into it, fitLook)
  style?: Partial<CurveStyle>;
  color?: string;
  width?: number;
  dash?: Dash;
  opacity?: number;
  band?: boolean; // the 95 % confidence band of the curve
  bandOpacity?: number;
  // the legend entry: the equation (with R²), the name, the parameters, or none; the results in a box in a corner
  legend?: 'equation' | 'name' | 'params' | 'none';
  box?: 'none' | 'tl' | 'tr' | 'bl' | 'br';
};
export type QFParam = { name: string; value: number; error: number; fixed?: boolean };
// one fit: on a range (its text) or all; the model; its parameters and derived values (areas, % Gaussian); statistics;
// the curve (NaN between ranges fitted together) with its band; each peak (on the baseline) and the baseline
export type QuickFitResult = {
  range: string;
  model: string;
  equation: string;
  params: QFParam[];
  derived: QFParam[];
  n: number;
  dof: number;
  r2: number;
  redChi2: number;
  curve: { x: number[]; y: number[]; lo?: number[]; hi?: number[] };
  parts?: { name: string; x: number[]; y: number[] }[];
  base?: { x: number[]; y: number[] };
};

export const QUICK_FIT_NAMES: Record<QuickFitKind, string> = { linear: 'linear', poly: 'polynomial', exp: 'exponential', power: 'power', log: 'logarithmic', movavg: 'moving average', peaks: 'peaks', formula: 'formula' };
export const isTrend = (k: QuickFitKind) => k !== 'peaks' && k !== 'formula';
const inRanges = (rs: XRange[], x: number) => !rs.length || rs.some((r) => x >= Math.min(r.lo, r.hi) && x <= Math.max(r.lo, r.hi));
const fmtR = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(5)) : '…');
export const rangeText = (r: XRange) => `${fmtR(r.lo)} – ${fmtR(r.hi)}`;
// the ranges as written (an open end: none on that side)
export const usedRanges = (q: QuickFitSpec): XRange[] => (q.ranges ?? []).filter((r) => Number.isFinite(r.lo) || Number.isFinite(r.hi)).map((r) => ({ lo: Number.isFinite(r.lo) ? r.lo : -Infinity, hi: Number.isFinite(r.hi) ? r.hi : Infinity }));

// the names of a trend's coefficients (in the order trendFit gives them)
function trendNames(q: QuickFitSpec): string[] {
  if (q.kind === 'linear') return q.origin ? ['b'] : ['a', 'b'];
  if (q.kind === 'poly') return Array.from({ length: Math.min(6, Math.max(2, Math.floor(q.degree ?? 2))) + 1 }, (_, k) => `a${k}`);
  if (q.kind === 'exp' || q.kind === 'power') return ['A', 'B'];
  if (q.kind === 'log') return ['a', 'b'];
  return [];
}
export const trendNote = (q: QuickFitSpec) => ({ linear: q.origin ? 'y = b·x' : 'y = a + b·x', poly: 'y = a0 + a1·x + a2·x² …', exp: 'y = A·e^{B·x} (fitted to ln y)', power: 'y = A·x^{B} (fitted to ln y)', log: 'y = a + b·ln x', movavg: 'the mean of every N points', peaks: '', formula: '' })[q.kind];

// The model of a peaks or formula fit, its peaks' shapes and the first parameter of each (after the baseline)
export function quickModel(q: QuickFitSpec): { model: Model; shapes: PeakShape[]; offs: number[]; nb: number } | string {
  if (q.kind === 'formula') {
    const m = buildModel({ kind: 'formula', model: '', degree: 1, formula: q.formula ?? '', shape: 'gauss', count: 1, baseline: 'none' });
    return typeof m === 'string' ? m : { model: m, shapes: [], offs: [], nb: 0 };
  }
  const n = q.place && q.points?.length ? q.points.length : Math.max(1, Math.min(20, Math.floor(q.count ?? 1) || 1));
  const shapes = Array.from({ length: n }, () => (q.shape ?? 'gauss') as PeakShape);
  const baseline = q.baseline ?? 'constant';
  const nb = baseParams(baseline);
  const offs: number[] = [];
  let o = nb;
  for (const s of shapes) {
    offs.push(o);
    o += shapeSize(s);
  }
  return { model: peaksModel(shapes, baseline), shapes, offs, nb };
}

// the area of one peak of height A (its parameters from p[o])
function peakArea(shape: PeakShape, p: ArrayLike<number>, o: number): number {
  const [A, w] = [p[o], Math.abs(p[o + 2])];
  if (shape === 'gauss') return A * w * Math.sqrt(Math.PI / (4 * Math.LN2));
  if (shape === 'lorentz') return (A * w * Math.PI) / 2;
  if (shape === 'voigt') return pvArea(A, w, p[o + 3]);
  if (shape === 'voigtx') {
    const [s, g] = voigtSG(w, Math.abs(p[o + 3]));
    return A / voigtProfile(0, s, g);
  }
  return NaN;
}
// a value of the parameters and its error from their covariance (numerical gradient)
function withError(f: (p: number[]) => number, p: number[], cov: number[][] | undefined): QFParam & { name: '' } {
  const v = f(p);
  if (!cov) return { name: '', value: v, error: NaN };
  const g = p.map((x, i) => {
    const h = 1e-7 * Math.max(Math.abs(x), 1e-6);
    const q = p.slice();
    q[i] += h;
    return (f(q) - v) / h;
  });
  let s = 0;
  for (let a = 0; a < p.length; a++) for (let b = 0; b < p.length; b++) if (g[a] && g[b]) s += g[a] * cov[a][b] * g[b];
  return { name: '', value: v, error: Math.sqrt(Math.max(0, s)) };
}

// The starts of peaks placed on the figure: each at its x, its height over the baseline there, a width from the data
// around it (between the places of its neighbours)
function placedStarts(xs: number[], ys: number[], pts: { x: number; y: number }[], shape: PeakShape, nb: number): number[] {
  const base = findPeaks(xs, ys, 0).base;
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const span = Math.max(...xs) - Math.min(...xs) || 1;
  const out: number[] = [];
  if (nb > 0) out.push(base);
  if (nb > 1) out.push(0);
  if (nb > 2) out.push(0);
  sorted.forEach((pt, k) => {
    const lo = k > 0 ? (sorted[k - 1].x + pt.x) / 2 : -Infinity;
    const hi = k < sorted.length - 1 ? (pt.x + sorted[k + 1].x) / 2 : Infinity;
    const idx = xs.map((_, i) => i).filter((i) => xs[i] >= lo && xs[i] <= hi);
    const f = idx.length > 2 ? findPeaks(idx.map((i) => xs[i]), idx.map((i) => ys[i] - base), 1).peaks[0] : null;
    const w = f && f.w > 0 ? Math.min(f.w, span / 2) : span / (10 * sorted.length);
    out.push(...shapeStarts(shape, pt.y - base, pt.x, w));
  });
  return out;
}

// The fits of one Quick fit on the points (x, y) of a curve; span: all its x (the curve over all of it).
export function quickFit(xIn: ArrayLike<number>, yIn: ArrayLike<number>, q: QuickFitSpec, span: [number, number]): { results: QuickFitResult[]; warnings: string[] } | string {
  const warnings: string[] = [];
  const xs0: number[] = [];
  const ys0: number[] = [];
  for (let i = 0; i < Math.min(xIn.length, yIn.length); i++) {
    if (!Number.isFinite(xIn[i]) || !Number.isFinite(yIn[i])) continue;
    xs0.push(xIn[i]);
    ys0.push(yIn[i]);
  }
  const rs = usedRanges(q);
  // the jobs: every range on its own, or all of them together (or all the points)
  const jobs = q.perRange && rs.length > 1 ? rs.map((r) => ({ rs: [r], text: rangeText(r) })) : [{ rs, text: rs.length ? rs.map(rangeText).join(', ') : '' }];
  const pick = (r: XRange[]) => {
    const idx = xs0.map((_, i) => i).filter((i) => inRanges(r, xs0[i]));
    return { xs: idx.map((i) => xs0[i]), ys: idx.map((i) => ys0[i]) };
  };
  // the curve where it is drawn: over all the data, its range, or (ranges together) only inside them
  const cut = (x: number[], y: number[], r: XRange[]) => (q.drawAll || r.length < 2 ? y : y.map((v, i) => (inRanges(r, x[i]) ? v : NaN)));
  const spanOf = (r: XRange[], xs: number[]): [number, number] => (q.drawAll ? span : r.length ? [Math.max(span[0], Math.min(...r.map((g) => Math.min(g.lo, g.hi)))), Math.min(span[1], Math.max(...r.map((g) => Math.max(g.lo, g.hi))))] : [Math.min(...xs), Math.max(...xs)]);
  const results: QuickFitResult[] = [];
  if (isTrend(q.kind)) {
    for (const job of jobs) {
      const { xs, ys } = pick(job.rs);
      if (!xs.length) {
        warnings.push(`${job.text ? `Range ${job.text}` : 'The curve'}: no point to fit.`);
        continue;
      }
      const t = trendFit(xs, ys, { kind: q.kind as TrendKind, degree: q.degree, window: q.window, origin: q.origin, band: !!q.band }, q.kind === 'movavg' ? undefined : spanOf(job.rs, xs));
      if (typeof t === 'string') {
        warnings.push(`${job.text ? `Range ${job.text}: ` : ''}${t}.`);
        continue;
      }
      const names = trendNames(q);
      results.push({
        range: job.text,
        model: QUICK_FIT_NAMES[q.kind],
        equation: t.equation,
        params: names.map((name, k) => ({ name, value: t.coef[k], error: t.se[k] })),
        derived: [],
        n: t.n,
        dof: t.dof,
        r2: t.r2,
        redChi2: NaN,
        curve: { x: t.xs, y: cut(t.xs, t.ys, job.rs), ...(t.lo && t.hi ? { lo: cut(t.xs, t.lo, job.rs), hi: cut(t.xs, t.hi, job.rs) } : {}) },
      });
    }
    return { results, warnings };
  }
  const qm = quickModel(q);
  if (typeof qm === 'string') return qm;
  const { model, shapes, offs, nb } = qm;
  if (q.kind === 'peaks' && q.place && !q.points?.length) warnings.push('Peaks: place them on the figure (Place the peaks), or untick it — until then found by themselves.');
  for (const job of jobs) {
    const { xs, ys } = pick(job.rs);
    if (!xs.length) {
      warnings.push(`${job.text ? `Range ${job.text}` : 'The curve'}: no point to fit.`);
      continue;
    }
    const xref = (Math.min(...xs) + Math.max(...xs)) / 2;
    // the starts: as set, else the peaks placed, else guessed (by the Fit node's rules)
    const placed = q.kind === 'peaks' && q.place && q.points?.length ? placedStarts(xs, ys, q.points, shapes[0], nb) : null;
    const specs: FitParamSpec[] = model.params.map((pm, j) => {
      const s = q.params?.find((v) => v.name === pm.name);
      const value = s && Number.isFinite(s.value) ? s.value : placed ? placed[j] : NaN;
      return { name: pm.name, value, fixed: !!s?.fixed && Number.isFinite(s.value), min: s?.min ?? NaN, max: s?.max ?? NaN, shared: false };
    });
    const sp = spanOf(job.rs, xs);
    const res = runFits(model, specs, [{ label: job.text || 'all', value: 1, xs, ys, sig: xs.map(() => 1) }], { global: false, band: q.band ? 'confidence' : 'none', points: 600, ctx: { energy: false, xref }, span: sp });
    warnings.push(...res.warnings);
    const r = res.runs[0];
    if (!r) continue;
    const p = r.params.map((v) => v.value);
    const cx = Array.from(r.curve.x);
    const cy = Array.from(r.curve.y);
    const band = r.curve.band ? Array.from(r.curve.band) : null;
    const baseAt = (x: number) => {
      const d = x - xref;
      return (nb > 0 ? p[0] : 0) + (nb > 1 ? p[1] * d : 0) + (nb > 2 ? p[2] * d * d : 0);
    };
    // derived: every peak's area (± from the covariance), a pseudo-Voigt's % Gaussian
    const derived: QFParam[] = [];
    shapes.forEach((sh, k) => {
      const a = withError((pp) => peakArea(sh, pp, offs[k]), p, r.cov);
      if (Number.isFinite(a.value)) derived.push({ name: `area${k + 1}`, value: a.value, error: a.error });
    });
    derived.push(...percentResults(model.params, p, r.params.map((v) => v.error)));
    const label = q.kind === 'peaks' ? `${shapes.length > 1 ? `${shapes.length} ` : ''}${SHAPE_NAMES[shapes[0]]}${shapes.length > 1 ? 's' : ''}` : 'formula';
    results.push({
      range: job.text,
      model: label,
      equation: q.kind === 'formula' ? model.note : `${label}${nb ? ` + ${q.baseline ?? 'constant'} baseline` : ''}`,
      params: r.params.map((v) => ({ name: v.name, value: v.value, error: v.error, ...(v.fixed ? { fixed: true } : {}) })),
      derived,
      n: r.stats.n,
      dof: r.stats.dof,
      r2: r.stats.r2,
      redChi2: r.stats.redChi2,
      curve: { x: cx, y: cut(cx, cy, job.rs), ...(band ? { lo: cut(cx, cy.map((v, i) => v - band[i]), job.rs), hi: cut(cx, cy.map((v, i) => v + band[i]), job.rs) } : {}) },
      ...(q.kind === 'peaks' && q.parts ? { parts: shapes.map((sh, k) => ({ name: `peak ${k + 1}`, x: cx, y: cut(cx, cx.map((x) => baseAt(x) + peakAt(sh, x, p, offs[k])), job.rs) })), ...(nb ? { base: { x: cx, y: cut(cx, cx.map(baseAt), job.rs) } } : {}) } : {}),
    });
  }
  return { results, warnings };
}

// One line of results for a box or a legend: “xc1 = 5.012 ± 0.003” (4 significant digits of the error's size)
export function paramText(p: QFParam): string {
  if (!Number.isFinite(p.error) || p.error <= 0) return `${p.name} = ${fmtR(p.value)}${p.fixed ? ' (fixed)' : ''}`;
  const d = Math.max(0, Math.min(10, 1 - Math.floor(Math.log10(p.error))));
  return `${p.name} = ${p.value.toFixed(d)} ± ${p.error.toFixed(d)}`;
}

// The style a fit set itself (the older fields read in; nothing undefined, so the defaults show through).
export function fitOwnStyle(q: QuickFitSpec): Partial<CurveStyle> {
  const own: Partial<CurveStyle> = { color: q.color || undefined, lineWidth: q.width, dash: q.dash, lineOpacity: q.opacity, ...q.style };
  return Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)) as Partial<CurveStyle>;
}
// The look of a fit's curve: its own style over the defaults — its curve's colour and axes, a line as wide as the
// curve's (0.75 pt at least), dashed for a trend, solid for a fit; symbols (when chosen) on about 20 of its points.
export function fitLook(q: QuickFitSpec, curve: Pick<CurveStyle, 'color' | 'lineWidth' | 'axisX' | 'axisY'>): CurveStyle {
  const trend = isTrend(q.kind);
  const every = q.kind === 'movavg' ? 1 : trend ? 10 : 30;
  return curveStyle({ mode: 'line', color: curve.color, lineWidth: Math.max(0.75, curve.lineWidth), dash: trend ? 'dash' : 'solid', axisX: curve.axisX, axisY: curve.axisY, every, ...fitOwnStyle(q) });
}

// The quick fits of a curve: its own, else (older projects) its trend line as the first
export function quickFitsOf(row: { trend?: TrendSpec; quickFits?: QuickFitSpec[] }): QuickFitSpec[] {
  if (row.quickFits) return row.quickFits;
  const t = row.trend;
  if (!t?.kind) return [];
  return [{ kind: t.kind, degree: t.degree, window: t.window, origin: t.origin, band: t.band, legend: t.equation === false || t.kind === 'movavg' ? 'name' : 'equation' }];
}