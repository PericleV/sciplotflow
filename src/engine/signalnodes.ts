// The Signal nodes: Smooth, Interpolate / Extrapolate, Normalize, FFT
// (spectrum, filters), Convolution / Deconvolution and Average curves. Each takes the Y columns of a dataset (each with its X: the
// designated one on its left, or the X chosen) and gives a dataset ready for a Plot, and what its graph shows.
import * as Sp from './spectral.ts';
import { waveletDenoise } from './wavelet.ts';
import { pick } from './extract.ts';
import { column, curvesByRole, findColumn, fmtNum, roleOf, type Column, type Dataset } from './table.ts';
import * as S from './signal.ts';
import { maxOf, minOf } from './minmax.ts';
import { hampel, harmonics, lombScargle, lsFap, lsFrequencies, lsLevel } from './signal2.ts';
import type { Region } from './calculus.ts';

// regions: the ranges of X drawn on the graph (none: all X), the same for every Y or of each Y (runRegions, by its name);
// outside (Smooth, Convolution, the FFT filter): what is left outside them, the data or nothing
export type SignalIn = { x: string; ys: string; regions?: Region[]; regionsBy?: 'all' | 'run'; runRegions?: Record<string, Region[]>; outside?: 'keep' | 'empty' };
// wavelet: denoised by the discrete wavelet transform (src/engine/wavelet.ts) — its wavelet, levels, threshold
// hampel: a point further than nsigma (3) robust SDs (1.4826 · MAD) from the median of its window replaced by it
export type SmoothData = SignalIn & { method: 'average' | 'savgol' | 'median' | 'gauss' | 'lowess' | 'fft' | 'wavelet' | 'hampel'; points: number; order: number; sigma: number; frac: number; iter: number; cutoff: number; edge: S.Edge | 'interp'; withData: boolean; withResid: boolean; wavelet?: string; wlevel?: number; wmode?: 'soft' | 'hard'; wscale?: number; nsigma?: number };
export type InterpData = SignalIn & { method: S.InterpMethod; extrap: S.Extrap; grid: 'points' | 'step' | 'at'; from: number; to: number; points: number; step: number };
export type NormalizeData = SignalIn & { method: 'max' | 'maxabs' | 'minmax' | 'area' | 'atx' | 'zscore' | 'first' | 'value' | 'column'; at: number; value: number; from: number; to: number };
// modes of src/engine/spectral.ts: psd (Welch: seg points, overlap, scaling, in dB), spectrogram, coherence (the first two
// Y), hilbert (envelope, phase, frequency), allan (deviation against τ), cwt (Morlet: scales, w0); the filter: by the FFT
// (absent design) or an IIR one — Butterworth, Chebyshev I (ripple dB) —, zero phase (forward and backward) or causal;
// lombscargle: X uneven (from … to, points per peak, the false-alarm level in %); harmonics: their number with the
// fundamental, the fundamental given (else the strongest)
export type FFTData = SignalIn & {
  mode: 'spectrum' | 'filter' | 'psd' | 'spectrogram' | 'coherence' | 'hilbert' | 'allan' | 'cwt' | 'lombscargle' | 'harmonics';
  output: 'amp' | 'power' | 'db' | 'phase' | 'reim';
  window: S.Window;
  detrend: 'none' | 'mean' | 'linear';
  pad: boolean;
  // notch: at f1 and its harmonics (notchN with it), the quality notchQ (f1 / the width at −3 dB)
  filter: S.FilterKind | 'notch';
  f1: number;
  f2: number;
  order: number;
  mirror: boolean;
  seg?: number;
  overlap?: number;
  scaling?: 'density' | 'spectrum';
  psdDb?: boolean;
  design?: 'fft' | 'butter' | 'cheby1' | 'bessel';
  notchQ?: number;
  notchN?: number;
  ripple?: number;
  causal?: boolean;
  allanSpacing?: 'octave' | 'decade' | 'all';
  scales?: number;
  w0?: number;
  lsMin?: number;
  lsMax?: number;
  lsOver?: number;
  lsFap?: number;
  nHarm?: number;
  f0?: number;
};
// corr: the correlation of every Y with the curve on the “kernel” port (or with itself), normalized as asked
export type ConvData = SignalIn & { op: 'conv' | 'wiener' | 'rl' | 'corr'; shape: S.KernelShape | 'port'; fwhm: number; lambda: number; iterations: number; edge: 'zero' | 'reflect' | 'nearest'; corrNorm?: 'coeff' | 'biased' | 'unbiased' | 'none' };

// what the node's graph shows for every Y: the data (dots) and the result (a line), each with its X
// ownAxis: the result on an axis of its own (the right one): another scale than the data (Normalize)
// others: more curves (thin, grey: the curves averaged), band: a shaded range (± SD)
// series: more curves of their own colour and name (dots, a line, dashed: assumed, as the tails of an extrapolation);
// marks: vertical dashed lines (where the data end); logX: X on a logarithmic scale; bandColor: the band's colour;
// zero: a line at y = 0; legend: the names of the data and of the result; ranges: its X is the data's, the ranges are
// drawn on it (of the Y named run, when they are per Y)
export type SignalSeries = { name: string; x: number[]; y: number[]; color: string; dots?: boolean; line?: boolean; dash?: boolean };
export type SignalPlot = {
  data?: { x: number[]; y: number[] };
  result: { x: number[]; y: number[] };
  xName: string;
  yName: string;
  ownAxis?: boolean;
  others?: { x: number[]; y: number[] }[];
  band?: { x: number[]; lo: number[]; hi: number[] };
  series?: SignalSeries[];
  marks?: number[];
  logX?: boolean;
  bandColor?: string;
  zero?: boolean;
  legend?: string[];
  ranges?: boolean;
  run?: string;
};
export type SignalOut = { dataset: Dataset; extra?: Record<string, Dataset>; plots: SignalPlot[]; labels: string[]; warnings: string[]; report?: string[] } | string;

type Curve = { X: Column | undefined; Y: Column; x: number[]; y: number[] };
// the Y columns (a list, else the designated ones) with their X; the points with both numbers, in the order of X
export function signalCurves(ds: Dataset, d: SignalIn): Curve[] | string {
  const cols = ds.columns;
  let Ys: Column[];
  if (d.ys.trim()) {
    const p = pick(d.ys, cols.map((c) => c.name), true);
    if (p.missing.length) return `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`;
    Ys = p.found.map((j) => cols[j]);
  } else Ys = cols.filter((_, j) => roleOf(cols, j) === 'y');
  if (d.x && d.x !== '-' && !findColumn(cols, d.x)) return `No column “${d.x}”.`;
  const roles = curvesByRole(cols).curves;
  const xOf = (y: Column) => (d.x === '-' ? undefined : findColumn(cols, d.x || (roles.find((c) => findColumn(cols, c.y) === y)?.x ?? roles[0]?.x ?? '')));
  Ys = Ys.filter((y) => xOf(y) !== y);
  if (!Ys.length) return 'Choose the Y columns (or designate them Y in the worksheet).';
  return Ys.map((Y) => {
    const X = xOf(Y);
    const idx: number[] = [];
    for (let i = 0; i < Y.values.length; i++) if (Number.isFinite(Y.values[i]) && (!X || Number.isFinite(X.values[i]))) idx.push(i);
    if (X) idx.sort((a, b) => X.values[a] - X.values[b]);
    return { X, Y, x: idx.map((i) => (X ? X.values[i] : i + 1)), y: idx.map((i) => Y.values[i]) };
  });
}
// ---- the ranges ----
// the ranges of a Y (its own, when they are per Y and it has some), none: all X
export function rangesOf(d: SignalIn, name: string): Region[] {
  const own = d.regionsBy === 'run' ? d.runRegions?.[name] : undefined;
  return own?.length ? own : (d.regions ?? []);
}
const bounds = (r: Region): [number, number] => {
  const [a, b] = [Number.isFinite(r.lo) ? r.lo : -Infinity, Number.isFinite(r.hi) ? r.hi : Infinity];
  return [Math.min(a, b), Math.max(a, b)];
};
const within = (v: number, rs: Region[]) =>
  rs.some((r) => {
    const [a, b] = bounds(r);
    return v >= a && v <= b;
  });
// the curve with only its points inside the ranges (Interpolate, Average curves)
function restricted(c: Curve, rs: Region[]): Curve {
  if (!rs.length) return c;
  const keep = c.x.map((v) => within(v, rs));
  return { ...c, x: c.x.filter((_, i) => keep[i]), y: c.y.filter((_, i) => keep[i]) };
}
// the curve cut into its ranges, each a curve of its own (the analyses of FFT), in the order of X; named after its range
// when there are several
function pieces(c: Curve, rs: Region[]): Curve[] {
  if (!rs.length) return [c];
  return rs
    .map((r, k) => ({ r: bounds(r), k }))
    .sort((p, q) => p.r[0] - q.r[0])
    .map(({ r: [a, b], k }) => {
      const keep = c.x.map((v) => v >= a && v <= b);
      return { ...c, Y: rs.length > 1 ? { ...c.Y, name: `${c.Y.name} (range ${k + 1})` } : c.Y, x: c.x.filter((_, i) => keep[i]), y: c.y.filter((_, i) => keep[i]) };
    })
    .filter((p) => p.x.length > 0);
}
// The curve processed in every range on its own (the window, the kernel, the filter see only the points inside), put
// back in its place (Smooth, Convolution, the FFT filter); outside the ranges the data, or nothing. f: of a part of the
// curve, its result on its X (k: the part's number)
function byRanges(c: Curve, rs: Region[], outside: SignalIn['outside'], warnings: string[], f: (part: Curve, k: number) => number[]): number[] {
  if (!rs.length) return f(c, 0);
  const out = outside === 'empty' ? c.y.map(() => NaN) : c.y.slice();
  rs.forEach((r, k) => {
    const [a, b] = bounds(r);
    const rows = c.x.map((v, i) => (v >= a && v <= b ? i : -1)).filter((i) => i >= 0);
    if (rows.length < 3) return void warnings.push(`${c.Y.name}: range ${k + 1} has fewer than 3 points; left as it is.`);
    const v = f({ ...c, x: rows.map((i) => c.x[i]), y: rows.map((i) => c.y[i]) }, k);
    rows.forEach((i, j) => (out[i] = v[j]));
  });
  return out;
}

// the step of X, and whether it is even (within 0.1 %)
function stepOf(x: number[]): { dx: number; even: boolean } {
  if (x.length < 2) return { dx: 1, even: true };
  const d = x.slice(1).map((v, i) => v - x[i]);
  const dx = (x[x.length - 1] - x[0]) / (x.length - 1);
  return { dx, even: d.every((v) => Math.abs(v - dx) <= 1e-3 * Math.abs(dx)) };
}
// the curve on an even grid of as many points (linear), when its X is not evenly spaced
function evenly(c: Curve): { x: number[]; y: number[]; dx: number; resampled: boolean } {
  const { dx, even } = stepOf(c.x);
  if (even) return { x: c.x, y: c.y, dx, resampled: false };
  const f = S.interpolator(c.x, c.y, 'linear', 'constant');
  const x = c.x.map((_, i) => c.x[0] + i * dx);
  return { x, y: x.map(f), dx, resampled: true };
}
// the output: one X when every result is on the same X, else an X before each
function layout(items: { xName: string; x: number[]; cols: Column[] }[]): Column[] {
  const same = items.every((it) => it.x.length === items[0].x.length && it.x.every((v, i) => v === items[0].x[i]));
  if (same) return [{ ...column(items[0].xName, Float64Array.from(items[0].x)), role: 'x' }, ...items.flatMap((it) => it.cols)];
  return items.flatMap((it) => [{ ...column(`${it.xName} (${it.cols[0]?.name ?? ''})`, Float64Array.from(it.x)), role: 'x' as const }, ...it.cols]);
}
const yCol = (name: string, v: number[], role: Column['role'] = 'y'): Column => ({ ...column(name, Float64Array.from(v)), role });

// ---- Smooth ----
export function smoothNode(ds: Dataset, d: SmoothData): SignalOut {
  const cs = signalCurves(ds, d);
  if (typeof cs === 'string') return cs;
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const items = cs.map((c0) => {
    const replaced: number[] = [];
    const s = byRanges(c0, rangesOf(d, c0.Y.name), d.outside, warnings, (c) => {
      const n = c.y.length;
      const edge = d.edge === 'interp' && d.method !== 'savgol' ? 'reflect' : d.edge;
      let s: number[];
      if (d.method === 'hampel') {
        if (!stepOf(c.x).even) warnings.push(`${c.Y.name}: X not evenly spaced; the window counts points, not X.`);
        const r = hampel(c.y, Math.max(1, Math.floor(Math.max(3, Math.floor(d.points)) / 2)), Math.max(0, d.nsigma ?? 3));
        s = r.y;
        // (the points replaced, by their place in the whole curve)
        for (const i of r.out) replaced.push(c0.x.indexOf(c.x[i]));
      } else if (d.method === 'lowess') s = S.lowess(c.x, c.y, Math.min(1, Math.max(0.01, d.frac)), Math.max(0, Math.floor(d.iter)));
      else if (d.method === 'wavelet') {
        if (!stepOf(c.x).even) warnings.push(`${c.Y.name}: X not evenly spaced; the wavelets count points, not X.`);
        const r = waveletDenoise(c.y, d.wavelet ?? 'db4', d.wlevel ?? 4, d.wmode ?? 'soft', d.wscale ?? 1);
        if (r.level < (d.wlevel ?? 4)) warnings.push(`${c.Y.name}: ${r.level} levels at most for ${n} points.`);
        s = r.y;
      } else if (d.method === 'fft') {
        const e = evenly(c);
        if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid for the FFT.`);
        const fs = S.fftFilter(e.y, e.dx, 'low', (Math.min(1, Math.max(0.001, d.cutoff)) * 0.5) / e.dx, 0, 0, true);
        s = e.resampled ? c.x.map(S.interpolator(e.x, fs, 'linear', 'constant')) : fs;
      } else {
        if (d.method !== 'gauss' && !stepOf(c.x).even) warnings.push(`${c.Y.name}: X not evenly spaced; the window counts points, not X.`);
        const pts = Math.max(1, Math.min(Math.floor(d.points), n));
        s =
          d.method === 'average'
            ? S.movingAverage(c.y, pts, edge as S.Edge)
            : d.method === 'median'
              ? S.medianFilter(c.y, pts, edge as S.Edge)
              : d.method === 'gauss'
                ? S.gaussianSmooth(c.y, Math.max(0.1, d.sigma), edge as S.Edge)
                : S.savgol(c.y, pts, Math.max(0, Math.floor(d.order)), d.edge === 'shrink' ? 'nearest' : d.edge);
      }
      return s;
    });
    const c = c0;
    plots.push({ data: { x: c.x, y: c.y }, result: { x: c.x, y: s }, xName: c.X?.name ?? 'row', yName: c.Y.name, ranges: true, run: c.Y.name, ...(d.method === 'hampel' ? { series: [{ name: `replaced (${replaced.length})`, x: replaced.map((i) => c.x[i]), y: replaced.map((i) => c.y[i]), color: '#d62728', dots: true }] } : {}) });
    const cols: Column[] = [];
    if (d.withData) cols.push(yCol(c.Y.name, c.y, 'none'));
    cols.push({ ...yCol(`${c.Y.name} (smoothed)`, s), ...(c.Y.key ? { key: c.Y.key } : {}) });
    if (d.withResid) cols.push(yCol(`${c.Y.name} − smoothed`, c.y.map((v, i) => v - s[i]), 'none'));
    return { xName: c.X?.name ?? 'row', x: c.x, cols };
  });
  return { dataset: { name: `${ds.name} smoothed`, columns: layout(items) }, plots, labels: cs.map((c) => c.Y.name), warnings: [...new Set(warnings)] };
}

// ---- Interpolate / Extrapolate ----
export function interpNode(ds: Dataset, d: InterpData, at: number[] | undefined): SignalOut {
  const all = signalCurves(ds, d);
  if (typeof all === 'string') return all;
  // (only the points inside the ranges; the new X from the first of them to the last)
  const cs = all.map((c) => restricted(c, rangesOf(d, c.Y.name))).filter((c) => c.x.length > 0);
  if (!cs.length) return 'No points inside the ranges.';
  const warnings: string[] = [];
  const lo = minOf(cs.map((c) => c.x[0]));
  const hi = maxOf(cs.map((c) => c.x[c.x.length - 1]));
  const a = Number.isFinite(d.from) ? d.from : lo;
  const b = Number.isFinite(d.to) ? d.to : hi;
  let X: number[];
  if (d.grid === 'at') {
    if (!at?.length) return 'Connect the new X to the “at” port (a column, or a dataset: its X).';
    X = at.filter(Number.isFinite);
  } else if (d.grid === 'step') {
    const st = Math.abs(d.step);
    if (!(st > 0)) return 'Write the step of the new X.';
    const m = Math.floor((b - a) / st + 1e-9);
    if (m > 1e6) return 'Too many points (more than a million).';
    X = Array.from({ length: m + 1 }, (_, k) => a + k * st);
  } else {
    const m = Math.max(2, Math.min(1e6, Math.floor(d.points) || 100));
    X = Array.from({ length: m }, (_, k) => a + ((b - a) * k) / (m - 1));
  }
  const plots: SignalPlot[] = [];
  const items = cs.map((c) => {
    if (c.x.length < (d.method === 'spline' || d.method === 'akima' || d.method === 'pchip' ? 3 : 2)) warnings.push(`${c.Y.name}: too few points for this method.`);
    const f = S.interpolator(c.x, c.y, d.method, d.extrap);
    const v = X.map(f);
    const c0 = all.find((q) => q.Y === c.Y) ?? c;
    plots.push({ data: { x: c0.x, y: c0.y }, result: { x: X, y: v }, xName: c.X?.name ?? 'row', yName: c.Y.name, ranges: true, run: c.Y.name });
    return { xName: c.X?.name ?? 'X', x: X, cols: [{ ...yCol(c.Y.name, v), ...(c.Y.key ? { key: c.Y.key } : {}) }] };
  });
  if (d.extrap === 'none' && (a < lo || b > hi)) warnings.push('Part of the new X is outside the data: left empty (Extrapolate to fill it).');
  return { dataset: { name: `${ds.name} interpolated`, columns: layout(items) }, plots, labels: cs.map((c) => c.Y.name), warnings };
}

// ---- Normalize ----
export function normalizeNode(ds: Dataset, d: NormalizeData, by: number[] | undefined): SignalOut {
  const cs = signalCurves(ds, d);
  if (typeof cs === 'string') return cs;
  if (d.method === 'column' && !by) return 'Connect the column to divide by to the “by” port.';
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const factors: { name: string; offset: number; scale: number }[] = [];
  const items = cs.map((c) => {
    // the points the factor is taken from: between From and To (empty: all)
    const inR = c.x.map((v) => (!Number.isFinite(d.from) || v >= d.from) && (!Number.isFinite(d.to) || v <= d.to));
    const ys = c.y.filter((_, i) => inR[i]);
    const xs = c.x.filter((_, i) => inR[i]);
    let [offset, scale] = [0, 1];
    if (!ys.length) warnings.push(`${c.Y.name}: no point between From and To.`);
    else if (d.method === 'max') scale = maxOf(ys);
    else if (d.method === 'maxabs') scale = maxOf(ys.map(Math.abs));
    else if (d.method === 'minmax') [offset, scale] = [minOf(ys), maxOf(ys) - minOf(ys)];
    else if (d.method === 'first') scale = ys[0];
    else if (d.method === 'value') scale = d.value;
    else if (d.method === 'atx') scale = S.interpolator(c.x, c.y, 'linear', 'none')(d.at);
    else if (d.method === 'area') {
      let s = 0;
      for (let i = 0; i < xs.length - 1; i++) s += ((ys[i] + ys[i + 1]) / 2) * (xs[i + 1] - xs[i]);
      scale = s;
    } else if (d.method === 'zscore') {
      const m = ys.reduce((p, q) => p + q, 0) / ys.length;
      [offset, scale] = [m, Math.sqrt(ys.reduce((p, q) => p + (q - m) ** 2, 0) / (ys.length - 1))];
    }
    let v: number[];
    if (d.method === 'column') {
      // divided point by point (the column on the rows of the data, in their order)
      const rows = c.Y.values.length;
      const byRow = Array.from({ length: rows }, (_, i) => by![i]);
      const order = Array.from({ length: rows }, (_, i) => i).filter((i) => Number.isFinite(c.Y.values[i]) && (!c.X || Number.isFinite(c.X.values[i])));
      if (c.X) order.sort((p, q) => c.X!.values[p] - c.X!.values[q]);
      v = c.y.map((u, k) => u / byRow[order[k]]);
    } else v = c.y.map((u) => (u - offset) / scale);
    if (!Number.isFinite(scale) || scale === 0) warnings.push(`${c.Y.name}: the factor is ${scale}; the result is not defined.`);
    factors.push({ name: c.Y.name, offset, scale });
    plots.push({ data: { x: c.x, y: c.y }, result: { x: c.x, y: v }, xName: c.X?.name ?? 'row', yName: c.Y.name, ownAxis: true, ranges: true, run: c.Y.name });
    return { xName: c.X?.name ?? 'row', x: c.x, cols: [{ ...yCol(`${c.Y.name} (normalized)`, v), ...(c.Y.key ? { key: c.Y.key } : {}) }] };
  });
  const table: Dataset = { name: 'factors', columns: [{ ...column('Y column', Float64Array.from(factors, (_, i) => i + 1), factors.map((f) => f.name)), role: 'x' }, yCol('subtracted', factors.map((f) => f.offset), 'none'), yCol('divided by', factors.map((f) => f.scale))] };
  return { dataset: { name: `${ds.name} normalized`, columns: layout(items) }, extra: { factors: table }, plots, labels: cs.map((c) => c.Y.name), warnings: [...new Set(warnings)] };
}

// ---- FFT ----
// The FFT node: the filter in every range (outside: the data, or nothing); the analyses of the part of every range (a
// curve each, named after its range when there are several; the coherence: of the first range), with the graphs of the
// data after them, where the ranges are drawn
export function fftNode(ds: Dataset, d: FFTData, xUnit: (name: string) => string): SignalOut {
  const all = signalCurves(ds, d);
  if (typeof all === 'string') return all;
  if (d.mode === 'filter') return fftModes(ds, d, all, xUnit);
  const cs = all.flatMap((c) => {
    const p = pieces(c, rangesOf(d, c.Y.name));
    return d.mode === 'coherence' ? p.slice(0, 1) : p;
  });
  if (!cs.length) return 'No points inside the ranges.';
  const r = fftModes(ds, d, cs, xUnit);
  if (typeof r === 'string') return r;
  for (const c of all) {
    r.plots.push({ data: { x: c.x, y: c.y }, result: { x: [], y: [] }, xName: c.X?.name ?? 'row', yName: c.Y.name, ranges: true, run: c.Y.name });
    r.labels.push(`the data: ${c.Y.name} (its ranges)`);
  }
  return r;
}
function fftModes(ds: Dataset, d: FFTData, cs: Curve[], xUnit: (name: string) => string): SignalOut {
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  if (d.mode === 'filter') {
    let resp: { f: number[]; db: number[]; ph: number[] } | null = null;
    const u = xUnit(cs[0]?.X?.name ?? '');
    const fName = u ? `Frequency (1/${u})` : 'Frequency';
    const items = cs.map((c, ci) => {
      const out = byRanges(c, rangesOf(d, c.Y.name), d.outside, warnings, (p, part) => {
        const e = evenly(p);
        if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid.`);
        const nyq = 0.5 / e.dx;
        // (the response: of the first Y's step; both ways, the gain squared and no phase)
        const wr = Array.from({ length: 512 }, (_, k) => (0.5 * k) / 511);
        const fromSos = (sos: number[][], twice: boolean) => {
          const H = Sp.sosResponse(sos, wr);
          const g = H.map(([a, b]) => 10 * Math.log10(a * a + b * b));
          return { f: wr.map((w) => w / e.dx), db: twice ? g.map((v) => 2 * v) : g, ph: twice ? wr.map(() => 0) : H.map(([a, b]) => (180 / Math.PI) * Math.atan2(b, a)) };
        };
        let f: number[];
        if (d.filter === 'notch') {
          const sos = Sp.notchSos(d.f1, Math.max(0.1, d.notchQ ?? 30), 1 / e.dx, Math.max(1, Math.round(d.notchN ?? 1)));
          if (!sos.length || !(d.f1 > 0)) {
            if (d.f1 > 0) warnings.push(`The notch must be below the Nyquist frequency (${fmtNum(nyq, 5)}).`);
            f = e.y.slice();
          } else {
            f = d.causal ? Sp.sosfilt(sos, e.y).y : Sp.sosfiltfilt(sos, e.y);
            if (ci === 0 && part === 0) resp = fromSos(sos, !d.causal);
          }
        } else if (d.design && d.design !== 'fft') {
          const [w1, w2] = [d.f1 / nyq, d.f2 / nyq];
          const bad = !(w1 > 0 && w1 < 1) || ((d.filter === 'band' || d.filter === 'stop') && !(w2 > 0 && w2 < 1 && w2 !== w1));
          if (bad) {
            warnings.push(`The cut-off must be between 0 and the Nyquist frequency (${fmtNum(nyq, 5)}).`);
            f = e.y.map(() => NaN);
          } else {
            const sos = Sp.designSos(d.design, Math.max(1, Math.min(12, Math.round(d.order) || 4)), d.filter, w1, w2, d.ripple ?? 1);
            f = d.causal ? Sp.sosfilt(sos, e.y).y : Sp.sosfiltfilt(sos, e.y);
            if (ci === 0 && part === 0) resp = fromSos(sos, !d.causal);
          }
        } else {
          f = S.fftFilter(e.y, e.dx, d.filter, d.f1, d.f2, Math.max(0, Math.floor(d.order)), d.mirror);
          const g = S.fftGain(d.filter, d.f1, d.f2, Math.max(0, Math.floor(d.order)));
          if (ci === 0 && part === 0) resp = { f: wr.map((w) => w / e.dx), db: wr.map((w) => 20 * Math.log10(g(w / e.dx))), ph: wr.map(() => 0) };
        }
        return e.resampled ? p.x.map(S.interpolator(e.x, f, 'linear', 'constant')) : f;
      });
      plots.push({ data: { x: c.x, y: c.y }, result: { x: c.x, y: out }, xName: c.X?.name ?? 'row', yName: c.Y.name, ranges: true, run: c.Y.name });
      return { xName: c.X?.name ?? 'row', x: c.x, cols: [{ ...yCol(`${c.Y.name} (filtered)`, out), ...(c.Y.key ? { key: c.Y.key } : {}) }] };
    });
    if (!(d.f1 > 0)) return d.filter === 'notch' ? 'Write the frequency of the notch (50 or 60 Hz: the mains; in 1 / the unit of X).' : 'Write the cut-off frequency (in 1 / the unit of X).';
    const r = resp as { f: number[]; db: number[]; ph: number[] } | null;
    if (r) plots.push({ result: { x: r.f, y: r.db.map((v) => Math.max(v, -200)) }, xName: fName, yName: 'gain (dB)' });
    const extra = r ? { response: { name: `${ds.name} filter response`, columns: [{ ...column(fName, Float64Array.from(r.f)), role: 'x' as const }, yCol('Gain (dB)', r.db), yCol('Phase (°)', r.ph, 'none')] } } : undefined;
    return { dataset: { name: `${ds.name} filtered`, columns: layout(items) }, ...(extra ? { extra } : {}), plots, labels: [...cs.map((c) => c.Y.name), ...(r ? ['the filter’s response'] : [])], warnings: [...new Set(warnings)] };
  }
  if (d.mode === 'lombscargle') return lombNode(ds, d, cs, xUnit);
  if (d.mode === 'harmonics') return harmonicsNode(ds, d, cs, xUnit);
  if (d.mode !== 'spectrum') return spectralModes(ds, d, cs, xUnit);
  const items = cs.map((c) => {
    const e = evenly(c);
    if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid for the FFT.`);
    const sp = S.spectrum(e.y, e.dx, d.window, d.detrend, d.pad);
    const name = c.Y.name;
    const cols: Column[] =
      d.output === 'amp'
        ? [yCol(`${name} amplitude`, sp.amp)]
        : d.output === 'power'
          ? [yCol(`${name} power`, sp.amp.map((a) => a * a))]
          : d.output === 'db'
            ? [yCol(`${name} (dB)`, sp.amp.map((a) => 20 * Math.log10(a)))]
            : d.output === 'phase'
              ? [yCol(`${name} phase (°)`, sp.phase)]
              : [yCol(`${name} real`, sp.re), yCol(`${name} imaginary`, sp.im)];
    plots.push({ result: { x: sp.f, y: Array.from(cols[0].values) }, xName: 'frequency', yName: cols[0].name });
    const u = xUnit(c.X?.name ?? '');
    return { xName: u ? `Frequency (1/${u})` : 'Frequency', x: sp.f, cols };
  });
  return { dataset: { name: `${ds.name} spectrum`, columns: layout(items) }, plots, labels: cs.map((c) => c.Y.name), warnings: [...new Set(warnings)] };
}

// The Lomb–Scargle periodogram of every Y (X as it is, uneven too): the power (0 … 1), the amplitude of the sine, the
// false-alarm probability of every frequency; the graph with the level of the false-alarm probability asked
function lombNode(ds: Dataset, d: FFTData, cs: Curve[], xUnit: (name: string) => string): SignalOut {
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const report: string[] = [];
  const u = xUnit(cs[0]?.X?.name ?? '');
  const fName = u ? `Frequency (1/${u})` : 'Frequency';
  const p = Math.min(50, Math.max(1e-6, d.lsFap ?? 1));
  const ok = cs.filter((c) => {
    if (c.x.length >= 8) return true;
    warnings.push(`${c.Y.name}: fewer than 8 points.`);
    return false;
  });
  if (!ok.length) return 'Lomb–Scargle: at least 8 points.';
  const items = ok.map((c) => {
    const freqs = lsFrequencies(c.x, Math.max(1, d.lsOver ?? 5), d.lsMin ?? NaN, d.lsMax ?? NaN);
    if (freqs.length >= 100000) warnings.push(`${c.Y.name}: 100000 frequencies at most (a narrower range, or fewer points per peak).`);
    const r = lombScargle(c.x, c.y, freqs);
    const fmax = freqs[freqs.length - 1];
    let best = 0;
    for (let k = 1; k < freqs.length; k++) if (r.power[k] > r.power[best] || !Number.isFinite(r.power[best])) best = k;
    const fap = r.power.map((z) => lsFap(z, c.x, fmax));
    const level = lsLevel(p / 100, c.x, fmax);
    plots.push({ result: { x: freqs, y: r.power }, xName: fName, yName: `${c.Y.name} power`, series: [{ name: `false alarm ${fmtNum(p, 3)} %`, x: [freqs[0], fmax], y: [level, level], color: '#d62728', line: true, dash: true }], marks: [freqs[best]] });
    report.push(`${c.Y.name}: the highest peak at ${fmtNum(freqs[best], 6)} (a period of ${fmtNum(1 / freqs[best], 6)}${u ? ` ${u}` : ''}), power ${fmtNum(r.power[best], 4)}, amplitude ${fmtNum(r.amp[best], 4)}; its false-alarm probability ${fmtNum(fap[best], 3)} (Baluev; ${p} % at the power ${fmtNum(level, 3)}); ${freqs.length} frequencies up to ${fmtNum(fmax, 4)}, ${c.x.length} points.`);
    return { xName: fName, x: freqs, cols: [yCol(`${c.Y.name} power`, r.power), yCol(`${c.Y.name} amplitude`, r.amp, 'none'), yCol(`${c.Y.name} false-alarm probability`, fap, 'none')] };
  });
  return { dataset: { name: `${ds.name} Lomb–Scargle`, columns: layout(items) }, plots, labels: ok.map((c) => c.Y.name), warnings: [...new Set(warnings)], report };
}

// The harmonics of every Y (X even, else read on an even grid): the table of the fundamental and its harmonics, the
// measures (THD, SNR, SINAD, ENOB, SFDR) and the spectrum in dB with the harmonics marked
function harmonicsNode(ds: Dataset, d: FFTData, cs: Curve[], xUnit: (name: string) => string): SignalOut {
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const report: string[] = [];
  const u = xUnit(cs[0]?.X?.name ?? '');
  const fName = u ? `Frequency (1/${u})` : 'Frequency';
  const nh = Math.max(2, Math.min(50, Math.round(d.nHarm ?? 6)));
  const done = cs.flatMap((c) => {
    const e = evenly(c);
    if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid.`);
    const r = harmonics(e.y, e.dx, nh, d.f0 ?? NaN);
    if (typeof r === 'string') {
      warnings.push(`${c.Y.name}: ${r}`);
      return [];
    }
    const hs = r.harmonics;
    const over = hs.filter((h) => h.overlap).map((h) => h.k);
    if (over.length) warnings.push(`${c.Y.name}: the harmonics ${over.join(', ')} too close to another for the window (a main lobe of ±13 bins), left out: a longer record (the fundamental at least 27 bins from 0, ${fmtNum(27 / (e.y.length * e.dx), 3)}).`);
    const al = hs.filter((h) => h.aliased && !h.overlap).map((h) => h.k);
    if (al.length) warnings.push(`${c.Y.name}: the harmonics ${al.join(', ')} above the Nyquist frequency, folded back.`);
    const ok = hs.filter((h) => !h.overlap);
    plots.push({ result: { x: r.f, y: r.db }, xName: fName, yName: `${c.Y.name} (dB)`, series: [{ name: 'harmonics', x: ok.map((h) => h.f), y: ok.map((h) => 10 * Math.log10((h.amp * h.amp) / 2)), color: '#d62728', dots: true }] });
    const f = (v: number) => fmtNum(v, 4);
    report.push(`${c.Y.name}: the fundamental at ${fmtNum(r.f0, 6)}${u ? ` (1/${u})` : ''}, amplitude ${fmtNum(hs[0].amp, 4)}; THD ${f(r.thd)} dB (${fmtNum(r.thdPct, 3)} %), SNR ${f(r.snr)} dB, SINAD ${f(r.sinad)} dB, ENOB ${fmtNum(r.enob, 3)} bits, SFDR ${f(r.sfdr)} dBc (${nh} harmonics with the fundamental; a Kaiser window, β 38).`);
    return [{ c, r }];
  });
  if (!done.length) return warnings[0] ?? 'Harmonics: no curve.';
  const ks = Array.from({ length: nh }, (_, k) => k + 1);
  const table = layout(done.map(({ c, r }) => ({ xName: 'Harmonic', x: ks, cols: [yCol(`${c.Y.name} frequency`, r.harmonics.map((h) => h.f), 'none'), yCol(`${c.Y.name} amplitude`, r.harmonics.map((h) => h.amp)), yCol(`${c.Y.name} level (dBc)`, r.harmonics.map((h) => h.dbc), 'none')] })));
  const names = ['THD (dB)', 'THD (%)', 'SNR (dB)', 'SINAD (dB)', 'ENOB (bits)', 'SFDR (dBc)', 'Fundamental', 'Noise (RMS)'];
  const measures: Column[] = [{ ...column('Measure', new Float64Array(names.length).fill(NaN), names), role: 'label' }, ...done.map(({ c, r }) => yCol(c.Y.name, [r.thd, r.thdPct, r.snr, r.sinad, r.enob, r.sfdr, r.f0, r.noise]))];
  const spectrum = layout(done.map(({ c, r }) => ({ xName: fName, x: r.f, cols: [yCol(`${c.Y.name} (dB)`, r.db)] })));
  return { dataset: { name: `${ds.name} harmonics`, columns: table }, extra: { measures: { name: `${ds.name} THD, SNR, SINAD`, columns: measures }, spectrum: { name: `${ds.name} spectrum (dB)`, columns: spectrum } }, plots, labels: done.map(({ c }) => c.Y.name), warnings: [...new Set(warnings)], report };
}

// ---- Convolution / deconvolution ----
export function convNode(ds: Dataset, d: ConvData, kernelValues: number[] | undefined): SignalOut {
  const cs = signalCurves(ds, d);
  if (typeof cs === 'string') return cs;
  if (d.shape === 'port' && d.op !== 'corr' && !kernelValues?.length) return 'Connect the response (a column, or a dataset: its first Y) to the “kernel” port, on the same step of X as the data.';
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  if (d.op === 'corr') return corrNode(ds, d, cs, kernelValues);
  const items = cs.map((c) => {
    const out = byRanges(c, rangesOf(d, c.Y.name), d.outside, warnings, (p) => {
      const e = evenly(p);
      if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid.`);
      const k = d.shape === 'port' ? S.kernelFrom(kernelValues!) : S.kernelOf(d.shape, d.fwhm, e.dx, e.y.length);
      if (k.length < 2) warnings.push(`${c.Y.name}: the kernel is narrower than one step of X; nothing changes.`);
      let r: number[];
      if (d.op === 'conv') r = S.convolve(e.y, k, d.edge);
      else if (d.op === 'wiener') r = S.wiener(e.y, k, Math.max(1e-12, d.lambda));
      else {
        if (e.y.some((v) => v < 0)) warnings.push(`${c.Y.name}: Richardson–Lucy takes values ≥ 0; the negative ones are set to 0.`);
        r = S.richardsonLucy(e.y, k, Math.max(1, Math.min(10000, Math.floor(d.iterations))), d.edge);
      }
      return e.resampled ? p.x.map(S.interpolator(e.x, r, 'linear', 'constant')) : r;
    });
    plots.push({ data: { x: c.x, y: c.y }, result: { x: c.x, y: out }, xName: c.X?.name ?? 'row', yName: c.Y.name, ranges: true, run: c.Y.name });
    const tag = d.op === 'conv' ? 'convolved' : 'deconvolved';
    return { xName: c.X?.name ?? 'row', x: c.x, cols: [{ ...yCol(`${c.Y.name} (${tag})`, out), ...(c.Y.key ? { key: c.Y.key } : {}) }] };
  });
  return { dataset: { name: `${ds.name} ${d.op === 'conv' ? 'convolved' : 'deconvolved'}`, columns: layout(items) }, plots, labels: cs.map((c) => c.Y.name), warnings: [...new Set(warnings)] };
}

// The spectral modes of the FFT node: Welch's PSD, the spectrogram, the coherence, the analytic signal, the Allan
// deviation, the wavelet scalogram (src/engine/spectral.ts)
function spectralModes(ds: Dataset, d: FFTData, cs: Curve[], xUnit: (name: string) => string): SignalOut {
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const u = xUnit(cs[0]?.X?.name ?? '');
  const fName = u ? `Frequency (1/${u})` : 'Frequency';
  const tName = cs[0]?.X?.name ?? 'X';
  const det = d.detrend === 'mean' ? 'constant' : d.detrend;
  const win: Sp.Win = d.window;
  const opts = (n: number): Sp.WelchOptions => {
    const seg = Math.max(8, Math.min(n, Math.round(d.seg ?? Math.min(256, Math.max(16, 2 ** Math.floor(Math.log2(n / 4)))))));
    return { nperseg: seg, overlap: Math.min(0.95, Math.max(0, d.overlap ?? 0.5)), window: win, detrend: det, scaling: d.scaling ?? 'density' };
  };
  const ev = cs.map((c) => {
    const e = evenly(c);
    if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid.`);
    return e;
  });
  const labels = cs.map((c) => c.Y.name);
  if (d.mode === 'psd') {
    const items = cs.map((c, k) => {
      const e = ev[k];
      const o = opts(e.y.length);
      const r = Sp.welch(e.y, 1 / e.dx, o);
      if (r.segments < 2) warnings.push(`${c.Y.name}: one segment of ${o.nperseg} points; fewer points per segment average more.`);
      const v = d.psdDb ? r.p.map((q) => 10 * Math.log10(q)) : r.p;
      const nm = `${c.Y.name} ${o.scaling === 'density' ? 'PSD' : 'power'}${d.psdDb ? ' (dB)' : ''}`;
      plots.push({ result: { x: r.f, y: v }, xName: fName, yName: nm });
      return { xName: fName, x: r.f, cols: [yCol(nm, v)] };
    });
    return { dataset: { name: `${ds.name} PSD`, columns: layout(items) }, plots, labels, warnings: [...new Set(warnings)] };
  }
  if (d.mode === 'coherence') {
    if (cs.length < 2) return 'Coherence: two Y columns (the first two chosen, or designated).';
    const [a, b] = [ev[0], ev[1]];
    const n = Math.min(a.y.length, b.y.length);
    if (Math.abs(a.dx - b.dx) > 1e-9 * Math.abs(a.dx)) warnings.push('Coherence: the two curves have different steps of X; taken point by point.');
    const r = Sp.coherence(a.y.slice(0, n), b.y.slice(0, n), 1 / a.dx, opts(n));
    plots.push({ result: { x: r.f, y: r.c }, xName: fName, yName: 'coherence' });
    const name = `${cs[0].Y.name} & ${cs[1].Y.name}`;
    if (cs.length > 2) warnings.push('Coherence: the first two Y columns only.');
    return { dataset: { name: `coherence ${name}`, columns: [{ ...column(fName, Float64Array.from(r.f)), role: 'x' }, yCol(`coherence (${name})`, r.c), yCol(`phase (°) (${name})`, r.phase, 'none')] }, plots, labels: [name], warnings: [...new Set(warnings)] };
  }
  if (d.mode === 'hilbert') {
    const items = cs.map((c, k) => {
      const e = ev[k];
      const z = Sp.analytic(e.y, 1 / e.dx);
      const back = (v: number[]) => (e.resampled ? c.x.map(S.interpolator(e.x, v, 'linear', 'constant')) : v);
      const env = back(z.envelope);
      plots.push({ data: { x: c.x, y: c.y }, result: { x: c.x, y: env }, xName: c.X?.name ?? 'row', yName: c.Y.name });
      return { xName: c.X?.name ?? 'row', x: c.x, cols: [yCol(`${c.Y.name} envelope`, env), yCol(`${c.Y.name} phase (rad)`, back(z.phase), 'none'), yCol(`${c.Y.name} frequency${u ? ` (1/${u})` : ''}`, back(z.freq), 'none')] };
    });
    warnings.push('Hilbert: the ends ring a little (the signal taken as periodic).');
    return { dataset: { name: `${ds.name} analytic`, columns: layout(items) }, plots, labels, warnings: [...new Set(warnings)] };
  }
  if (d.mode === 'allan') {
    const items = cs.map((c, k) => {
      const e = ev[k];
      const r = Sp.allanDeviation(e.y, e.dx, d.allanSpacing ?? 'octave');
      plots.push({ result: { x: r.tau.map(Math.log10), y: r.adev.map(Math.log10) }, xName: `log10 τ${u ? ` (${u})` : ''}`, yName: `log10 σ (${c.Y.name})` });
      return { xName: `τ${u ? ` (${u})` : ''}`, x: r.tau, cols: [yCol(`Allan deviation (${c.Y.name})`, r.adev), yCol(`terms (${c.Y.name})`, r.terms, 'none')] };
    });
    return { dataset: { name: `${ds.name} Allan deviation`, columns: layout(items) }, plots, labels, warnings: [...new Set(warnings)] };
  }
  // the spectrogram and the scalogram: of the first Y — a long table (time, frequency, power), for Contour
  const c = cs[0];
  const e = ev[0];
  if (cs.length > 1) warnings.push(`${d.mode === 'cwt' ? 'Scalogram' : 'Spectrogram'}: the first Y column only (${c.Y.name}).`);
  let T: number[];
  let Fq: number[];
  let Pw: number[][];
  if (d.mode === 'spectrogram') {
    const o = opts(e.y.length);
    const r = Sp.spectrogram(e.y, 1 / e.dx, o);
    if (r.t.length < 2) return `Spectrogram: ${o.nperseg} points per segment leave ${r.t.length} segment; fewer points per segment.`;
    [T, Fq, Pw] = [r.t.map((t) => e.x[0] + t), r.f, r.p];
  } else {
    const n = e.y.length;
    const ns = Math.max(4, Math.min(256, Math.round(d.scales ?? 64)));
    const w0 = d.w0 ?? 6;
    // the scales: from two steps of X to a third of the record, evenly on a log scale
    const [s0, s1] = [(2 * e.dx * (w0 + Math.sqrt(2 + w0 * w0))) / (4 * Math.PI) / 0.5, (n * e.dx) / 3];
    const scales = Array.from({ length: ns }, (_, k) => s0 * (s1 / s0) ** (k / (ns - 1)));
    const r = Sp.cwtMorlet(e.y, e.dx, scales, w0);
    // every point (time) of the record, the frequencies from high to low as the scales grow
    const step = Math.max(1, Math.ceil(n / 400));
    const keep = Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step);
    T = keep.map((i) => e.x[i]);
    Fq = r.freq;
    Pw = keep.map((i) => r.power.map((row) => row[i]));
    if (step > 1) warnings.push(`Scalogram: 1 point of time in ${step} kept (${keep.length}).`);
  }
  const rows = T.length * Fq.length;
  const tc = new Float64Array(rows);
  const fc = new Float64Array(rows);
  const pc = new Float64Array(rows);
  let q = 0;
  T.forEach((t, i) =>
    Fq.forEach((f, j) => {
      [tc[q], fc[q], pc[q]] = [t, f, d.psdDb ? 10 * Math.log10(Pw[i][j]) : Pw[i][j]];
      q++;
    }),
  );
  // the graph: the power averaged over time against the frequency
  const mean = Fq.map((_, j) => Pw.reduce((s, row) => s + row[j], 0) / (Pw.length || 1));
  plots.push({ result: { x: Fq, y: d.psdDb ? mean.map((v) => 10 * Math.log10(v)) : mean }, xName: fName, yName: `mean power (${c.Y.name})` });
  const pn = `${d.mode === 'cwt' ? 'wavelet power' : 'PSD'}${d.psdDb ? ' (dB)' : ''}`;
  return {
    dataset: { name: `${ds.name} ${d.mode === 'cwt' ? 'scalogram' : 'spectrogram'}`, columns: [{ ...column(tName, tc), role: 'x' }, { ...column(fName, fc), role: 'none' }, { ...column(pn, pc), role: 'y' }] },
    plots,
    labels: [c.Y.name],
    warnings: [...new Set([...warnings, `${T.length} × ${Fq.length}: X, frequency and ${pn} as columns; a map with Contour (X, Y = frequency, Z = ${pn}).`])],
  };
}

// The correlation of every Y with the curve on the port (else with itself): c(lag) = Σ y(n + lag)·k(n), the means
// removed for “coeff” (then divided by √(Σy²·Σk²): −1 … 1); biased: / N, unbiased: / (N − |lag|); the lag in X
function corrNode(ds: Dataset, d: ConvData, cs: Curve[], kernelValues: number[] | undefined): SignalOut {
  const warnings: string[] = [];
  const plots: SignalPlot[] = [];
  const peaks: { name: string; lag: number; value: number }[] = [];
  const norm = d.corrNorm ?? 'coeff';
  const items = cs.map((c) => {
    const e = evenly(c);
    if (e.resampled) warnings.push(`${c.Y.name}: X not evenly spaced; read on an even grid.`);
    const other = kernelValues?.filter(Number.isFinite) ?? e.y;
    const center = (v: number[]) => {
      if (norm !== 'coeff') return v;
      const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
      return v.map((u) => u - m);
    };
    const [a, b] = [center(e.y), center(other)];
    const [na, nb] = [a.length, b.length];
    // full correlation by FFTs: lags −(nb − 1) … na − 1
    let n = 1;
    while (n < na + nb) n <<= 1;
    const [Ar, Ai] = S.fft([...a, ...new Array<number>(n - na).fill(0)], new Array<number>(n).fill(0));
    const [Br, Bi] = S.fft([...b, ...new Array<number>(n - nb).fill(0)], new Array<number>(n).fill(0));
    // A·conj(B)
    const [Cr] = S.fft(
      Ar.map((v, k) => v * Br[k] + Ai[k] * Bi[k]),
      Ar.map((v, k) => Ai[k] * Br[k] - v * Bi[k]),
      true,
    );
    const lags: number[] = [];
    const vals: number[] = [];
    const ea = Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0)) || 1;
    for (let L = -(nb - 1); L <= na - 1; L++) {
      let v = Cr[(L + n) % n];
      if (norm === 'coeff') v /= ea;
      else if (norm === 'biased') v /= Math.max(na, nb);
      else if (norm === 'unbiased') v /= Math.max(1, Math.max(na, nb) - Math.abs(L));
      lags.push(L * e.dx);
      vals.push(v);
    }
    let k = 0;
    for (let i = 1; i < vals.length; i++) if (vals[i] > vals[k]) k = i;
    peaks.push({ name: c.Y.name, lag: lags[k], value: vals[k] });
    plots.push({ result: { x: lags, y: vals }, xName: `lag${c.X ? ` (${c.X.name})` : ''}`, yName: c.Y.name });
    return { xName: `lag${c.X ? ` (${c.X.name})` : ''}`, x: lags, cols: [yCol(`${kernelValues ? 'cross' : 'auto'}correlation (${c.Y.name})`, vals)] };
  });
  if (kernelValues && cs.some((c) => Math.abs(c.y.length - kernelValues.length) > 0)) warnings.push('Correlation: the curves have different lengths; both on the step of the data.');
  const table: Dataset = { name: 'lags', columns: [{ ...column('Y column', Float64Array.from(peaks, (_, i) => i + 1), peaks.map((p) => p.name)), role: 'x' }, yCol('lag of the maximum', peaks.map((p) => p.lag)), yCol('maximum', peaks.map((p) => p.value), 'none')] };
  return { dataset: { name: `${ds.name} correlation`, columns: layout(items) }, extra: { lags: table }, plots, labels: cs.map((c) => c.Y.name), warnings: [...new Set(warnings)] };
}

// a column or the first curve of a dataset as plain values (the port of Interpolate, Normalize, Convolution)
export function valuesOf(v: { t: string; v: unknown } | undefined, want: 'x' | 'y'): number[] | undefined {
  if (!v) return undefined;
  if (v.t === 'column') return Array.from((v.v as Column).values);
  if (v.t === 'dataset') {
    const ds = v.v as Dataset;
    const rc = curvesByRole(ds.columns).curves[0];
    const c = findColumn(ds.columns, want === 'x' ? (rc?.x ?? '') : (rc?.y ?? '')) ?? (want === 'x' ? ds.columns[0] : ds.columns[1] ?? ds.columns[0]);
    return c ? Array.from(c.values) : undefined;
  }
  return undefined;
}

// ---- Average curves ----
// Several curves, each with its own X (from one dataset or several): read on a common X (every X of them, the X of the
// first, or a uniform grid) and averaged where all of them (or at least k) have a value.
export type AverageData = SignalIn & { grid: 'union' | 'first' | 'uniform'; points: number; from: number; to: number; need: 'all' | 'k'; k: number; method: S.InterpMethod; extra: boolean };
export function averageNode(sets: Dataset[], d: AverageData): SignalOut {
  const warnings: string[] = [];
  const cs: (Curve & { label: string })[] = [];
  for (const ds of sets) {
    const r = signalCurves(ds, d);
    if (typeof r === 'string') return sets.length > 1 ? `${ds.name}: ${r}` : r;
    for (const c of r) {
      // the X in the order measured: going back (a loop, a scan up and down) is mixed when sorted
      if (c.X) {
        const xs = Array.from(c.X.values).filter((v, i) => Number.isFinite(v) && Number.isFinite(c.Y.values[i]));
        const up = xs.slice(1).some((v, i) => v > xs[i]);
        const down = xs.slice(1).some((v, i) => v < xs[i]);
        if (up && down) warnings.push(`${c.Y.name}: its X goes back (a loop, a scan up and down?): taken in the order of X, the branches mixed.`);
      }
      cs.push({ ...c, label: sets.length > 1 ? `${c.Y.name} (${ds.name})` : c.Y.name });
    }
  }
  const usable = cs.filter((c) => c.x.length >= 2);
  if (usable.length < cs.length) warnings.push(`${cs.length - usable.length} curve${cs.length - usable.length > 1 ? 's' : ''} with fewer than 2 points left out.`);
  if (usable.length < 2) return 'Two curves at least: connect datasets (or designate several Y columns).';
  const m = usable.length;
  const need = d.need === 'all' ? m : Math.max(1, Math.min(m, Math.floor(d.k) || 1));
  // the common X
  const lows = usable.map((c) => c.x[0]);
  const highs = usable.map((c) => c.x[c.x.length - 1]);
  let X: number[];
  if (d.grid === 'first') X = [...new Set(usable[0].x)];
  else if (d.grid === 'union') {
    const all = usable.flatMap((c) => c.x).sort((a, b) => a - b);
    const tol = 1e-12 * Math.max(1, Math.abs(all[0]), Math.abs(all[all.length - 1]));
    X = all.filter((v, i) => i === 0 || v - all[i - 1] > tol);
  } else {
    const a = Number.isFinite(d.from) ? d.from : need === m ? maxOf(lows) : minOf(lows);
    const b = Number.isFinite(d.to) ? d.to : need === m ? minOf(highs) : maxOf(highs);
    if (!(b > a)) return need === m ? 'The curves have no range of X in common.' : 'Write From < To.';
    const p = Math.max(2, Math.min(1e6, Math.floor(d.points) || 200));
    X = Array.from({ length: p }, (_, k) => a + ((b - a) * k) / (p - 1));
  }
  const fs = usable.map((c) => S.interpolator(c.x, c.y, d.method, 'none'));
  const rs = d.regions ?? [];
  if (rs.length) X = X.filter((v) => within(v, rs));
  const rows: { x: number; v: number[] }[] = [];
  for (const x of X) {
    const v = fs.map((f) => f(x)).filter(Number.isFinite);
    if (v.length >= need) rows.push({ x, v });
  }
  if (!rows.length) return need === m ? 'The curves have no range of X in common.' : `No X where ${need} curves have a value.`;
  const x = rows.map((r) => r.x);
  const N = rows.map((r) => r.v.length);
  const mean = rows.map((r) => r.v.reduce((s, w) => s + w, 0) / r.v.length);
  const sd = rows.map((r, i) => (r.v.length > 1 ? Math.sqrt(r.v.reduce((s, w) => s + (w - mean[i]) ** 2, 0) / (r.v.length - 1)) : NaN));
  const se = sd.map((s, i) => s / Math.sqrt(N[i]));
  const columns: Column[] = [{ ...column(usable[0].X?.name ?? 'X', Float64Array.from(x)), role: 'x' }, yCol('mean', mean), yCol('SD', sd, 'yerr'), yCol('SE', se, 'none'), yCol('N', N, 'none')];
  if (d.extra) {
    const med = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    columns.push(yCol('min', rows.map((r) => minOf(r.v)), 'none'), yCol('max', rows.map((r) => maxOf(r.v)), 'none'), yCol('median', rows.map((r) => med(r.v)), 'none'));
  }
  if (d.grid !== 'uniform' && need === m) {
    const out = X.length - rows.length;
    if (out) warnings.push(`${out} X value${out > 1 ? 's' : ''} outside some of the curves: left out (only where all ${m} curves have a value).`);
  }
  const plot: SignalPlot = {
    result: { x, y: mean },
    others: usable.map((c) => ({ x: c.x, y: c.y })),
    band: { x, lo: mean.map((v, i) => v - (sd[i] || 0)), hi: mean.map((v, i) => v + (sd[i] || 0)) },
    xName: usable[0].X?.name ?? 'row',
    yName: 'mean',
    ranges: true,
  };
  return { dataset: { name: `mean of ${m} curves`, columns }, plots: [plot], labels: [`mean of ${m}: ${usable.map((c) => c.label).join(', ')}`], warnings };
}
