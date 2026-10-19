// Measures of a curve on its data (no fit), within a range of X: the minimum and maximum (their place refined by a
// parabola through the point and its two neighbours), the X where it crosses a level and its Y at an X, the area, the
// centroid, the mean; and a peak's or a dip's width at half its height over a baseline (FWHM: the two crossings of the
// half height interpolated linearly). Used by Curve math's formulas and by Peak width. Pure.

import { baselineOf, curveThrough, type BaseMethod, type BaseOptions } from './baselines.ts';

export type Pts = { x: ArrayLike<number>; y: ArrayLike<number> };

// the points with both numbers within [from, to] (NaN: no limit), sorted by X
export function inRange(c: Pts, from = NaN, to = NaN): { x: number[]; y: number[] } {
  const [lo, hi] = [Number.isFinite(from) ? Math.min(from, Number.isFinite(to) ? to : Infinity) : -Infinity, Number.isFinite(to) ? Math.max(to, Number.isFinite(from) ? from : -Infinity) : Infinity];
  const idx: number[] = [];
  const n = Math.min(c.x.length, c.y.length);
  for (let i = 0; i < n; i++) if (Number.isFinite(c.x[i]) && Number.isFinite(c.y[i]) && c.x[i] >= lo && c.x[i] <= hi) idx.push(i);
  idx.sort((a, b) => c.x[a] - c.x[b]);
  return { x: idx.map((i) => c.x[i]), y: idx.map((i) => c.y[i]) };
}

// the vertex of the parabola through three points (x of the middle one when it is not a turning point)
function vertex(x: number[], y: number[], i: number): { x: number; y: number } {
  if (i <= 0 || i >= x.length - 1) return { x: x[i], y: y[i] };
  const [x0, x1, x2] = [x[i - 1], x[i], x[i + 1]];
  const [y0, y1, y2] = [y[i - 1], y[i], y[i + 1]];
  const d = (x0 - x1) * (x0 - x2) * (x1 - x2);
  if (!d) return { x: x1, y: y1 };
  const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / d;
  const b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / d;
  const c = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / d;
  if (!a) return { x: x1, y: y1 };
  const xv = -b / (2 * a);
  // the vertex stays between the neighbours (else the point itself)
  if (!(xv >= Math.min(x0, x2) && xv <= Math.max(x0, x2))) return { x: x1, y: y1 };
  return { x: xv, y: a * xv * xv + b * xv + c };
}

// the minimum or maximum: its place (refined) and value; NaN when there are no points
export function extremum(c: Pts, kind: 'min' | 'max', from = NaN, to = NaN): { x: number; y: number } {
  const p = inRange(c, from, to);
  if (!p.x.length) return { x: NaN, y: NaN };
  let k = 0;
  for (let i = 1; i < p.y.length; i++) if (kind === 'min' ? p.y[i] < p.y[k] : p.y[i] > p.y[k]) k = i;
  return vertex(p.x, p.y, k);
}

// the X where the curve first crosses y (along X), linear between the points; NaN when it does not
export function xAtLevel(c: Pts, level: number, from = NaN, to = NaN): number {
  const p = inRange(c, from, to);
  for (let i = 0; i < p.x.length - 1; i++) {
    const [a, b] = [p.y[i] - level, p.y[i + 1] - level];
    if (a === 0) return p.x[i];
    if (a * b < 0 || b === 0) return p.x[i] + ((p.x[i + 1] - p.x[i]) * a) / (a - b);
  }
  return NaN;
}

// Y at x, linear between the points (sorted by X); NaN outside
export function yAtX(c: Pts, x: number): number {
  const p = inRange(c);
  if (!p.x.length || x < p.x[0] || x > p.x[p.x.length - 1]) return NaN;
  for (let i = 0; i < p.x.length - 1; i++) if (x >= p.x[i] && x <= p.x[i + 1]) return p.x[i + 1] === p.x[i] ? p.y[i] : p.y[i] + ((p.y[i + 1] - p.y[i]) * (x - p.x[i])) / (p.x[i + 1] - p.x[i]);
  return p.y[p.y.length - 1];
}

// the area (trapezoids), the centroid (∫x·y / ∫y), the mean of Y, the number of points
export function area(c: Pts, from = NaN, to = NaN): number {
  const p = inRange(c, from, to);
  let s = 0;
  for (let i = 0; i < p.x.length - 1; i++) s += ((p.y[i] + p.y[i + 1]) / 2) * (p.x[i + 1] - p.x[i]);
  return p.x.length > 1 ? s : NaN;
}
export function centroid(c: Pts, from = NaN, to = NaN): number {
  const p = inRange(c, from, to);
  let [s, m] = [0, 0];
  for (let i = 0; i < p.x.length - 1; i++) {
    const dx = p.x[i + 1] - p.x[i];
    s += ((p.y[i] + p.y[i + 1]) / 2) * dx;
    m += ((p.x[i] * p.y[i] + p.x[i + 1] * p.y[i + 1]) / 2) * dx;
  }
  return s ? m / s : NaN;
}
export function meanY(c: Pts, from = NaN, to = NaN): number {
  const p = inRange(c, from, to);
  return p.y.length ? p.y.reduce((a, b) => a + b, 0) / p.y.length : NaN;
}
export const countIn = (c: Pts, from = NaN, to = NaN) => inRange(c, from, to).x.length;

// a peak or a dip measured on the data over a baseline: 'line' — straight between the first and last points of the range
// —, 'zero', or a value. auto: the larger of the two deviations. why: the reason a width is missing.
export type WidthKind = 'peak' | 'dip' | 'auto';
// the baseline: one of src/engine/baselines.ts on the points of the range ('line': between its first and last points
// unless more are averaged), its value, its options, the curve of 'points' and 'curve'
export type Baseline = { kind: BaseMethod; value?: number; opts?: BaseOptions; curve?: ((x: number) => number) | null };
export const baseUnder = (p: { x: number[]; y: number[] }, base: Baseline): number[] => baselineOf(base.kind, p.x, p.y, { ...base.opts, ends: base.opts?.ends ?? (base.kind === 'line' ? 1 : undefined) }, { value: base.value, curve: base.curve });
// (leftY, rightY: the half height at the two crossings — on a sloped baseline they differ)
export type Width = { kind: 'peak' | 'dip'; x: number; y: number; base: number; height: number; fwhm: number; left: number; right: number; leftY: number; rightY: number; why?: string };
export function peakWidth(c: Pts, kind: WidthKind, base: Baseline, from = NaN, to = NaN): Width {
  const p = inRange(c, from, to);
  const none = (why: string, k: 'peak' | 'dip' = 'peak'): Width => ({ kind: k, x: NaN, y: NaN, base: NaN, height: NaN, fwhm: NaN, left: NaN, right: NaN, leftY: NaN, rightY: NaN, why });
  if (p.x.length < 3) return none('fewer than 3 points');
  const n = p.x.length;
  const under = baseUnder(p, base);
  const at = curveThrough(p.x, under);
  const b = (x: number) => (base.kind === 'zero' ? 0 : base.kind === 'value' ? (base.value ?? 0) : at(x));
  const d = p.y.map((v, i) => v - under[i]);
  let [kMax, kMin] = [0, 0];
  for (let i = 1; i < n; i++) {
    if (d[i] > d[kMax]) kMax = i;
    if (d[i] < d[kMin]) kMin = i;
  }
  const k2: 'peak' | 'dip' = kind === 'auto' ? (Math.abs(d[kMax]) >= Math.abs(d[kMin]) ? 'peak' : 'dip') : kind;
  const k = k2 === 'peak' ? kMax : kMin;
  const v = vertex(p.x, d, k);
  const height = v.y;
  if (!(k2 === 'peak' ? height > 0 : height < 0)) return none(k2 === 'peak' ? 'no peak above the baseline' : 'no dip below the baseline', k2);
  const half = height / 2;
  const beyond = (i: number) => (k2 === 'peak' ? d[i] <= half : d[i] >= half);
  // the crossings of the half height on both sides of the extremum
  let left = NaN;
  for (let i = k; i > 0; i--)
    if (beyond(i - 1)) {
      left = p.x[i - 1] + ((p.x[i] - p.x[i - 1]) * (half - d[i - 1])) / (d[i] - d[i - 1]);
      break;
    }
  let right = NaN;
  for (let i = k; i < n - 1; i++)
    if (beyond(i + 1)) {
      right = p.x[i] + ((p.x[i + 1] - p.x[i]) * (half - d[i])) / (d[i + 1] - d[i]);
      break;
    }
  const why = Number.isNaN(left) && Number.isNaN(right) ? 'half height not reached on either side' : Number.isNaN(left) ? 'half height not reached on the left' : Number.isNaN(right) ? 'half height not reached on the right' : undefined;
  const bx = b(v.x);
  return { kind: k2, x: v.x, y: v.y + bx, base: bx, height, fwhm: right - left, left, right, leftY: b(left) + half, rightY: b(right) + half, ...(why ? { why } : {}) };
}
