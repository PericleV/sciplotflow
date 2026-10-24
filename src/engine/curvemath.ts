// Curve math (two curves) and Translate (curves moved horizontally / vertically).
// Curve math: two curves A and B, each with its own X — arithmetic on a common X (the other one interpolated), the
// difference of X at given Y values (a shift, the width of a loop) or of Y at given X values, or where they intersect.
// Translate: the curves of a dataset (and columns given their designations here) moved on X and / or Y — by values, so
// that a chosen point lands at a place, or in steps (curve k by k·Δ: a waterfall).
import { interp } from './calculus.ts';
import { pickPoints, pickValues } from './pick.ts';
import { column, curvesByRole, findColumn, fmtNum, type Column, type ColumnRole, type Dataset } from './table.ts';
import { maxOf, minOf } from './minmax.ts';
import { compile } from './expr.ts';
import { area, centroid, countIn, extremum, meanY, peakWidth, xAtLevel, yAtX } from './measure.ts';

// step: the response to a step (or a pulse) of A and of B when there is one — rise, fall, overshoot, settling …
export type CurveMathOp = 'sub' | 'add' | 'mul' | 'div' | 'mean' | 'dxAtY' | 'dyAtX' | 'cross' | 'formula' | 'step';
export type CurveMathData = {
  ya: string; // the Y of curve A (its X: the designated one on its left; '' = the first Y)
  yb: string; // the Y of curve B ('' = the first Y of B, or the second of A when B is not connected)
  op: CurveMathOp;
  values: string; // ΔX at Y / ΔY at X: “0.5”, “0.2, 0.5”, “0.2:0.05:0.8”
  crossing: 'first' | 'last' | 'all'; // ΔX at Y: which crossing of each curve; intersections: which ones (along A)
  abs: boolean;
  grid: 'a' | 'b' | 'uniform'; // arithmetic: on the X of A, of B, or a uniform grid
  from: number; // the uniform grid; intersections: only in this range of X (NaN: no limit)
  to: number;
  points: number;
  touch?: boolean; // intersections: the touches too (false: only the crossings)
  // formula: lines “name = expression” of the curves A and B and the results above them; each: for every Y of A
  formula?: string;
  each?: boolean;
  // step: the levels of the rise (%, absent: 10 and 90), the band of settling (%, absent: 2), the X of the step (absent: the
  // first X)
  stepLo?: number;
  stepHi?: number;
  settle?: number;
  stepAt?: number;
  // the X of curve A and of B ('' or absent: the designated one on the left of its Y); the sheet of a workbook on A and
  // on B (absent: the first)
  xa?: string;
  xb?: string;
  sheetA?: string;
  sheetB?: string;
  // the operations, each with its own output (out, out-1 …); absent: the one operation above (an older node)
  ops?: CurveOpData[];
  // on the node's graph, the curves computed: automatic (absent; at the right when of another size), with A and B, or at the right
  resultAxis?: 'same' | 'own';
};
// one operation and its settings
export type CurveOpData = Pick<CurveMathData, 'op' | 'values' | 'crossing' | 'abs' | 'grid' | 'from' | 'to' | 'points' | 'touch' | 'formula' | 'each' | 'stepLo' | 'stepHi' | 'settle' | 'stepAt'>;
export const curveOps = (d: CurveMathData): CurveOpData[] =>
  d.ops?.length ? d.ops : [{ op: d.op, values: d.values, crossing: d.crossing, abs: d.abs, grid: d.grid, from: d.from, to: d.to, points: d.points, touch: d.touch, formula: d.formula, each: d.each, stepLo: d.stepLo, stepHi: d.stepHi, settle: d.settle, stepAt: d.stepAt }];
// the output of operation k
export const curveOpPort = (k: number) => (k ? `out-${k}` : 'out');
export const CURVE_OP_LABELS: Record<CurveMathOp, string> = {
  dxAtY: 'ΔX at Y (B − A)',
  dyAtX: 'ΔY at X (B − A)',
  cross: 'intersections of A and B',
  sub: 'A − B',
  add: 'A + B',
  mul: 'A × B',
  div: 'A / B',
  mean: 'mean of A and B',
  formula: 'a formula of A and B (xmin, fwhm …)',
  step: 'step response (rise, overshoot, settling …)',
};
// what the node draws: the curves (thinned), and for every operation what it computes — the levels with the X of A and B
// there, the X with the Y of A and B there, the intersections, the curve computed, the levels of a step
export type CurvePlotLine = { name: string; xName: string; x: number[]; y: number[] };
export type CurveOpView = { label: string; error?: string; overlay: { dx?: { y: number; xa: number; xb: number }[]; dy?: { x: number; ya: number; yb: number }[]; pts?: { x: number; y: number }[]; curve?: CurvePlotLine; levels?: number[] } };

// The functions of the curves in a formula (the curve first, then a range of X where it applies: from, to)
export const CURVE_FUNCS: [string, string][] = [
  ['xmin(A)', 'the X of the minimum (refined by a parabola)'],
  ['ymin(A)', 'the minimum'],
  ['xmax(A)', 'the X of the maximum'],
  ['ymax(A)', 'the maximum'],
  ['xat(A, y)', 'the X where it first crosses y'],
  ['yat(A, x)', 'its Y at x'],
  ['fwhm(A)', 'the width of the peak at half its height (over the line between the ends)'],
  ['fwhmdip(A)', 'the same for a dip'],
  ['height(A)', 'the peak’s height over that line (a dip: depth(A))'],
  ['area(A)', 'the area under it'],
  ['centroid(A)', 'its centre of gravity in X'],
  ['mean(A)', 'the mean of its Y'],
  ['count(A)', 'its number of points'],
];

// The results of the formula's lines, for the curves given (A = 0, B = 1 …): every line “name = expression” (or an
// expression alone: named by its place), earlier names usable in later lines.
export function curveFormulas(curves: Curve2[], text: string): { names: string[]; values: number[] } | string {
  const cv = (c: number) => curves[Math.round(c)];
  const on = <T>(c: number, f: (q: Curve2) => T, empty: T) => (Number.isInteger(c) && cv(c) ? f(cv(c)) : empty);
  const funcs: Record<string, (...a: number[]) => number> = {
    xmin: (c, a = NaN, b = NaN) => on(c, (q) => extremum(q, 'min', a, b).x, NaN),
    ymin: (c, a = NaN, b = NaN) => on(c, (q) => extremum(q, 'min', a, b).y, NaN),
    xmax: (c, a = NaN, b = NaN) => on(c, (q) => extremum(q, 'max', a, b).x, NaN),
    ymax: (c, a = NaN, b = NaN) => on(c, (q) => extremum(q, 'max', a, b).y, NaN),
    xat: (c, y, a = NaN, b = NaN) => on(c, (q) => xAtLevel(q, y, a, b), NaN),
    yat: (c, x) => on(c, (q) => yAtX(q, x), NaN),
    fwhm: (c, a = NaN, b = NaN) => on(c, (q) => peakWidth(q, 'peak', { kind: 'line' }, a, b).fwhm, NaN),
    fwhmdip: (c, a = NaN, b = NaN) => on(c, (q) => peakWidth(q, 'dip', { kind: 'line' }, a, b).fwhm, NaN),
    height: (c, a = NaN, b = NaN) => on(c, (q) => peakWidth(q, 'peak', { kind: 'line' }, a, b).height, NaN),
    depth: (c, a = NaN, b = NaN) => on(c, (q) => -peakWidth(q, 'dip', { kind: 'line' }, a, b).height, NaN),
    area: (c, a = NaN, b = NaN) => on(c, (q) => area(q, a, b), NaN),
    centroid: (c, a = NaN, b = NaN) => on(c, (q) => centroid(q, a, b), NaN),
    mean: (c, a = NaN, b = NaN) => on(c, (q) => meanY(q, a, b), NaN),
    count: (c, a = NaN, b = NaN) => on(c, (q) => countIn(q, a, b), NaN),
  };
  const vars: Record<string, number> = Object.fromEntries(curves.map((_, k) => [String.fromCharCode(65 + k), k]));
  const names: string[] = [];
  const values: number[] = [];
  const lines = text.split(/[\n;]+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 'Write a formula, e.g. S = (xmin(B) − xmin(A)) / (1.345 − 1.333)';
  for (const [k, line] of lines.entries()) {
    const m = /^([A-Za-z_][\w]*)\s*=(?!=)\s*(.+)$/.exec(line);
    const name = m ? m[1] : `result ${k + 1}`;
    if (m && name in vars && name.length === 1 && name.charCodeAt(0) - 65 < curves.length) return `Line ${k + 1}: “${name}” is a curve; give the result another name.`;
    const f = compile(m ? m[2] : line, funcs);
    if (typeof f === 'string') return `Line ${k + 1}: ${f}`;
    const v = f.fn(vars);
    names.push(name);
    values.push(v);
    vars[name] = v;
  }
  return { names, values };
}
export type Curve2 = { name: string; xName: string; x: number[]; y: number[]; rows?: number[] }; // rows: of the dataset (from 0)

// a curve of a dataset: the Y named (else the k-th Y) with its X, the points with both numbers, in the order measured
// xName: the X chosen (else the designated one on the left of the Y)
export function curveOf(ds: Dataset, yName: string, k = 0, xName?: string): Curve2 | string {
  const roles = curvesByRole(ds.columns).curves;
  const rc = yName ? roles.find((c) => findColumn(ds.columns, c.y) === findColumn(ds.columns, yName)) : roles[k];
  const y = findColumn(ds.columns, yName || rc?.y || '');
  if (!y) return yName ? `No column “${yName}”.` : 'No Y column (designate one Y in the worksheet, or choose it).';
  if (xName && xName !== '-' && !findColumn(ds.columns, xName)) return `No column “${xName}”.`;
  const x = xName === '-' ? undefined : xName ? findColumn(ds.columns, xName) : rc ? findColumn(ds.columns, rc.x) : undefined;
  const xs: number[] = [];
  const ys: number[] = [];
  const rows: number[] = [];
  for (let i = 0; i < y.values.length; i++) {
    const xv = x ? x.values[i] : i + 1;
    if (Number.isFinite(xv) && Number.isFinite(y.values[i])) {
      xs.push(xv);
      ys.push(y.values[i]);
      rows.push(i);
    }
  }
  return { name: y.name, xName: x?.name ?? 'row', x: xs, y: ys, rows };
}
// Y at x by straight lines between the points (in the order of X); NaN outside the curve
function yAt(c: Curve2): (x: number) => number {
  const o = c.x.map((_, i) => i).sort((p, q) => c.x[p] - c.x[q]);
  const X = o.map((i) => c.x[i]);
  const Y = o.map((i) => c.y[i]);
  return (x) => interp(X, Y, x);
}
// the X where the curve crosses y (in the order measured)
function xAt(c: Curve2, y: number): number[] {
  const rows = c.x.map((_, i) => i);
  return pickPoints(c.x, c.y, rows, [{ kind: 'y', value: String(y) }], { interp: 'linear', outside: 'empty' }).points.map((p) => p.x);
}

// The response of a curve to a step: its start and end levels (the means of the first and last 5 % of the points), the
// times of the rise (lo → hi % of the step), of the delay (50 %), of the peak, the overshoot and undershoot (% of the step),
// the settling time (the last time it is out of the band ± settle % of the step) — the times from the X of the step. A
// pulse (it comes back to its start): its top, the rise of the leading edge, the fall of the trailing one, its width at
// half height.
export type StepInfo = { kind: 'step' | 'pulse'; initial: number; final: number; rise: number; fall: number; delay: number; peak: number; peakTime: number; overshoot: number; undershoot: number; settling: number; width: number };
export function stepInfo(c: Curve2, o: { lo?: number; hi?: number; settle?: number; at?: number } = {}): StepInfo | string {
  const idx = c.x.map((_, i) => i).filter((i) => Number.isFinite(c.x[i]) && Number.isFinite(c.y[i]));
  idx.sort((a, b) => c.x[a] - c.x[b]);
  const x = idx.map((i) => c.x[i]);
  const y = idx.map((i) => c.y[i]);
  const n = x.length;
  if (n < 5) return 'A step: five points at least.';
  const m = Math.max(1, Math.min(20, Math.round(n * 0.05)));
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const t0 = Number.isFinite(o.at) ? o.at! : x[0];
  // the start: the mean of the points before the step (when its X is given), else the first point; the end: the mean of
  // the last 5 %
  const before = y.filter((_, i) => x[i] < t0);
  const y0 = before.length ? mean(before) : y[0];
  const y1 = mean(y.slice(n - m));
  const [lo, hi] = [(o.lo ?? 10) / 100, (o.hi ?? 90) / 100];
  // where the normalized curve u first reaches level L going up (from index a on), interpolated; NaN when never
  const firstUp = (u: number[], L: number, a = 0) => {
    for (let i = Math.max(1, a); i < n; i++) if (u[i - 1] < L && u[i] >= L) return x[i - 1] + ((x[i] - x[i - 1]) * (L - u[i - 1])) / (u[i] - u[i - 1] || 1);
    return u[a] >= L ? x[a] : NaN;
  };
  const firstDown = (u: number[], L: number, a = 0) => {
    for (let i = Math.max(1, a); i < n; i++) if (u[i - 1] > L && u[i] <= L) return x[i - 1] + ((x[i] - x[i - 1]) * (u[i - 1] - L)) / (u[i - 1] - u[i] || 1);
    return NaN;
  };
  let kMax = 0;
  let kMin = 0;
  for (let i = 1; i < n; i++) {
    if (y[i] > y[kMax]) kMax = i;
    if (y[i] < y[kMin]) kMin = i;
  }
  const range = y[kMax] - y[kMin] || 1;
  const none: StepInfo = { kind: 'step', initial: y0, final: y1, rise: NaN, fall: NaN, delay: NaN, peak: NaN, peakTime: NaN, overshoot: NaN, undershoot: NaN, settling: NaN, width: NaN };
  if (Math.abs(y1 - y0) < 0.1 * range) {
    // a pulse: up (or down) and back
    const up = Math.abs(y[kMax] - y0) >= Math.abs(y[kMin] - y0);
    const kTop = up ? kMax : kMin;
    const base = (y0 + y1) / 2;
    const top = y[kTop];
    const u = y.map((v) => (v - base) / (top - base));
    const a1 = firstUp(u, lo);
    const a2 = firstUp(u, hi);
    // the trailing edge: from the top on, going down
    const b1 = firstDown(u, hi, kTop);
    const b2 = firstDown(u, lo, kTop);
    const h1 = firstUp(u, 0.5);
    const h2 = firstDown(u, 0.5, kTop);
    return { ...none, kind: 'pulse', initial: base, final: top, rise: a2 - a1, fall: b2 - b1, delay: h1 - t0, peak: top, peakTime: x[kTop] - t0, width: h2 - h1 };
  }
  const S = y1 - y0;
  const u = y.map((v) => (v - y0) / S);
  const r1 = firstUp(u, lo);
  const r2 = firstUp(u, hi);
  let kp = 0;
  for (let i = 1; i < n; i++) if (u[i] > u[kp]) kp = i;
  let kq = 0;
  for (let i = 1; i < n; i++) if (u[i] < u[kq]) kq = i;
  const tol = (o.settle ?? 2) / 100;
  let last = -1;
  for (let i = 0; i < n; i++) if (Math.abs(u[i] - 1) > tol) last = i;
  const settling = last < 0 ? 0 : last >= n - 1 ? NaN : x[last + 1] - t0;
  const rise = r2 - r1;
  return { ...none, kind: 'step', rise: S > 0 ? rise : NaN, fall: S < 0 ? rise : NaN, delay: firstUp(u, 0.5) - t0, peak: y[kp], peakTime: x[kp] - t0, overshoot: Math.max(0, (u[kp] - 1) * 100), undershoot: Math.max(0, -u[kq] * 100), settling };
}

export function curveMath(A: Curve2, B: Curve2, d: CurveMathData): { dataset: Dataset; report: string[]; warnings: string[] } | string {
  const warnings: string[] = [];
  const report: string[] = [];
  const f = (v: number) => (d.abs ? Math.abs(v) : v);
  if (d.op === 'cross') return crossings(A, B, d);
  if (d.op === 'dxAtY' || d.op === 'dyAtX') {
    const vals = pickValues(d.values);
    if (typeof vals === 'string') return vals;
    if (!vals.length) return d.op === 'dxAtY' ? 'Write the Y values (0.5, or a list, or start:step:end).' : 'Write the X values (0.5, or a list, or start:step:end).';
    if (d.op === 'dyAtX') {
      const [fa, fb] = [yAt(A), yAt(B)];
      const ya = vals.map(fa);
      const yb = vals.map(fb);
      const dy = vals.map((_, i) => f(yb[i] - ya[i]));
      const out = vals.filter((_, i) => !Number.isFinite(dy[i]));
      if (out.length) warnings.push(`${out.length} X value${out.length > 1 ? 's' : ''} outside one of the curves: left empty.`);
      if (vals.length === 1) report.push(`At X = ${vals[0]}: Y of A = ${ya[0]}, Y of B = ${yb[0]}, ${d.abs ? '|ΔY|' : 'ΔY = B − A'} = ${dy[0]}`);
      return {
        dataset: { name: 'ΔY', columns: [{ ...column(A.xName, Float64Array.from(vals)), role: 'x' }, { ...column(`${A.name} (A)`, Float64Array.from(ya)), role: 'none' }, { ...column(`${B.name} (B)`, Float64Array.from(yb)), role: 'none' }, { ...column(d.abs ? '|ΔY|' : 'ΔY (B − A)', Float64Array.from(dy)), role: 'y' }] },
        report,
        warnings,
      };
    }
    // ΔX at Y: the crossings of each curve, the first, the last or every one (paired in their order)
    const Y: number[] = [];
    const XA: number[] = [];
    const XB: number[] = [];
    let uneven = 0;
    let missing = 0;
    for (const v of vals) {
      const [ca, cb] = [xAt(A, v), xAt(B, v)];
      if (!ca.length || !cb.length) {
        missing++;
        Y.push(v);
        XA.push(ca[0] ?? NaN);
        XB.push(cb[0] ?? NaN);
        continue;
      }
      if (d.crossing === 'all') {
        if (ca.length !== cb.length) uneven++;
        for (let k = 0; k < Math.min(ca.length, cb.length); k++) {
          Y.push(v);
          XA.push(ca[k]);
          XB.push(cb[k]);
        }
      } else {
        const pick = (c: number[]) => (d.crossing === 'first' ? c[0] : c[c.length - 1]);
        Y.push(v);
        XA.push(pick(ca));
        XB.push(pick(cb));
      }
    }
    if (missing) warnings.push(`${missing} Y value${missing > 1 ? 's' : ''} not crossed by one of the curves: ΔX left empty.`);
    if (uneven) warnings.push(`${uneven} Y value${uneven > 1 ? 's are' : ' is'} crossed a different number of times by A and B: paired in order, the extra crossings left out.`);
    const dx = Y.map((_, i) => f(XB[i] - XA[i]));
    if (Y.length === 1) report.push(`At Y = ${Y[0]}: X of A = ${XA[0]}, X of B = ${XB[0]}, ${d.abs ? '|ΔX|' : 'ΔX = B − A'} = ${dx[0]}`);
    return {
      dataset: {
        name: 'ΔX',
        columns: [{ ...column(A.name, Float64Array.from(Y)), role: 'x' }, { ...column(`${A.xName} (A)`, Float64Array.from(XA)), role: 'none' }, { ...column(`${B.xName} (B)`, Float64Array.from(XB)), role: 'none' }, { ...column(d.abs ? '|ΔX|' : 'ΔX (B − A)', Float64Array.from(dx)), role: 'y' }],
      },
      report,
      warnings,
    };
  }
  // arithmetic on a common X
  let X: number[];
  if (d.grid === 'uniform') {
    const n = Math.max(2, Math.floor(d.points) || 200);
    const lo = Number.isFinite(d.from) ? d.from : Math.max(minOf(A.x), minOf(B.x));
    const hi = Number.isFinite(d.to) ? d.to : Math.min(maxOf(A.x), maxOf(B.x));
    X = Array.from({ length: n }, (_, k) => lo + ((hi - lo) * k) / (n - 1));
  } else X = (d.grid === 'b' ? B : A).x.slice();
  const [fa, fb] = [yAt(A), yAt(B)];
  const ya = X.map(fa);
  const yb = X.map(fb);
  const op = (a: number, b: number) => (d.op === 'sub' ? a - b : d.op === 'add' ? a + b : d.op === 'mul' ? a * b : d.op === 'div' ? a / b : (a + b) / 2);
  const r = X.map((_, i) => f(op(ya[i], yb[i])));
  const out = r.filter((v) => !Number.isFinite(v)).length;
  if (out) warnings.push(`${out} point${out > 1 ? 's' : ''} outside one of the curves (or a division by 0): left empty.`);
  const label = d.op === 'sub' ? 'A − B' : d.op === 'add' ? 'A + B' : d.op === 'mul' ? 'A × B' : d.op === 'div' ? 'A / B' : 'mean of A and B';
  return { dataset: { name: label, columns: [{ ...column((d.grid === 'b' ? B : A).xName, Float64Array.from(X)), role: 'x' }, { ...column(d.abs ? `|${label}|` : label, Float64Array.from(r)), role: 'y' }] }, report, warnings };
}

// ---- Intersections ----
// Every point where the polylines A and B meet, segment by segment in the order measured (loops, curves going back on
// X, different X): a crossing (B passes to the other side of A), a touch (B meets A and stays on its side) or at the end
// of one of them. Collinear stretches (A and B on top of each other) are only warned of.
type Poly = { x: number[]; y: number[]; rows: number[] };
type Hit = { x: number; y: number; ia: number; ta: number; ib: number; tb: number; kind: 'cross' | 'touch' | 'endA' | 'endB'; dir: number };
const EPS = 1e-9;
// the points scaled (to a span of about 1 on both axes, for the tolerances), repeated points left out
function polyOf(c: Curve2, x0: number, sx: number, y0: number, sy: number): Poly {
  const p: Poly = { x: [], y: [], rows: [] };
  c.x.forEach((x, i) => {
    const [u, v] = [(x - x0) / sx, (c.y[i] - y0) / sy];
    const k = p.x.length - 1;
    if (k >= 0 && Math.abs(u - p.x[k]) < 1e-14 && Math.abs(v - p.y[k]) < 1e-14) return;
    p.x.push(u);
    p.y.push(v);
    p.rows.push(c.rows?.[i] ?? i);
  });
  return p;
}
// the directions of a polyline at a point of segment k (t from 0 to 1): back (in) and forward (out); null at an end
function dirs(p: Poly, k: number, t: number): [number, number][] | null {
  const n = p.x.length;
  if (t > 0 && t < 1) return [
    [p.x[k] - p.x[k + 1], p.y[k] - p.y[k + 1]],
    [p.x[k + 1] - p.x[k], p.y[k + 1] - p.y[k]],
  ];
  const v = t === 0 ? k : k + 1;
  if (v === 0 || v === n - 1) return null;
  return [
    [p.x[v - 1] - p.x[v], p.y[v - 1] - p.y[v]],
    [p.x[v + 1] - p.x[v], p.y[v + 1] - p.y[v]],
  ];
}
// 1: the direction w lies on the left of A (the sector turning counter-clockwise from A's forward to A's back
// direction), −1: on its right, 0: along A
function side(aIn: [number, number], aOut: [number, number], w: [number, number]): number {
  const T = 2 * Math.PI;
  const ang = (v: [number, number]) => Math.atan2(v[1], v[0]);
  const m = (a: number) => ((a % T) + T) % T;
  const dw = m(ang(w) - ang(aOut));
  const da = m(ang(aIn) - ang(aOut));
  if (dw < 1e-10 || dw > T - 1e-10 || Math.abs(dw - da) < 1e-10) return 0;
  return dw < da ? 1 : -1;
}

function crossings(A: Curve2, B: Curve2, d: CurveMathData): { dataset: Dataset; report: string[]; warnings: string[] } | string {
  const warnings: string[] = [];
  const report: string[] = [];
  const allX = [...A.x, ...B.x];
  const allY = [...A.y, ...B.y];
  const [x0, x1, y0, y1] = [minOf(allX), maxOf(allX), minOf(allY), maxOf(allY)];
  const [sx, sy] = [x1 - x0 || 1, y1 - y0 || 1];
  const a = polyOf(A, x0, sx, y0, sy);
  const b = polyOf(B, x0, sx, y0, sy);
  if (a.x.length < 2 || b.x.length < 2) return 'Each curve needs two points at least.';
  // the segments of B in bins of X: only those near a segment of A are tried
  const K = Math.max(1, Math.min(1024, b.x.length));
  const bin = (x: number) => Math.min(K - 1, Math.max(0, Math.floor(x * K)));
  const bins: number[][] = Array.from({ length: K }, () => []);
  for (let j = 0; j + 1 < b.x.length; j++) for (let q = bin(Math.min(b.x[j], b.x[j + 1])); q <= bin(Math.max(b.x[j], b.x[j + 1])); q++) bins[q].push(j);
  const seen = new Int32Array(b.x.length).fill(-1);
  const hits: Hit[] = [];
  const keys = new Set<string>();
  const overlaps: [number, number][] = [];
  const nA = a.x.length;
  const nB = b.x.length;
  for (let i = 0; i + 1 < nA; i++) {
    const [px, py, rx, ry] = [a.x[i], a.y[i], a.x[i + 1] - a.x[i], a.y[i + 1] - a.y[i]];
    const rr = Math.hypot(rx, ry);
    for (let q = bin(Math.min(px, px + rx) - EPS); q <= bin(Math.max(px, px + rx) + EPS); q++)
      for (const j of bins[q]) {
        if (seen[j] === i) continue;
        seen[j] = i;
        const [qx, qy, vx, vy] = [b.x[j], b.y[j], b.x[j + 1] - b.x[j], b.y[j + 1] - b.y[j]];
        const ss = Math.hypot(vx, vy);
        const [wx, wy] = [qx - px, qy - py];
        const den = rx * vy - ry * vx;
        if (Math.abs(den) <= EPS * rr * ss) {
          // parallel: on the same line, and overlapping?
          if (Math.abs(wx * ry - wy * rx) <= EPS * rr * Math.max(rr, Math.hypot(wx, wy))) {
            const t0 = (wx * rx + wy * ry) / (rr * rr);
            const t1 = t0 + (vx * rx + vy * ry) / (rr * rr);
            const [lo, hi] = [Math.max(0, Math.min(t0, t1)), Math.min(1, Math.max(t0, t1))];
            if (hi - lo > EPS) overlaps.push([x0 + (px + lo * rx) * sx, x0 + (px + hi * rx) * sx]);
          }
          continue;
        }
        let t = (wx * vy - wy * vx) / den;
        let u = (wx * ry - wy * rx) / den;
        const snap = (s: number) => (Math.abs(s) < EPS ? 0 : Math.abs(s - 1) < EPS ? 1 : s);
        [t, u] = [snap(t), snap(u)];
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        // a point shared by two segments is counted once (as the start of the next one)
        let [ia, ib] = [i, j];
        if (t === 1 && i + 2 < nA) [ia, t] = [i + 1, 0];
        if (u === 1 && j + 2 < nB) [ib, u] = [j + 1, 0];
        const key = `${ia}:${t}:${ib}:${u}`;
        if (keys.has(key)) continue;
        keys.add(key);
        const da = dirs(a, ia, t);
        const db = dirs(b, ib, u);
        let kind: Hit['kind'] = 'touch';
        let dir = 0;
        if (!da) kind = 'endA';
        else if (!db) kind = 'endB';
        else {
          const [s1, s2] = [side(da[0], da[1], db[0]), side(da[0], da[1], db[1])];
          if (s1 && s2 && s1 !== s2) {
            kind = 'cross';
            // above / below: the left of A when A runs to larger X
            dir = s2 * (da[1][0] >= 0 ? 1 : -1);
          }
        }
        // at a point measured: its values exactly
        const [hx, hy] = t === 0 || t === 1 ? [a.x[ia + t], a.y[ia + t]] : u === 0 || u === 1 ? [b.x[ib + u], b.y[ib + u]] : [px + t * rx, py + t * ry];
        hits.push({ x: x0 + hx * sx, y: y0 + hy * sy, ia, ta: t, ib, tb: u, kind, dir });
      }
  }
  hits.sort((p, q) => p.ia + p.ta - (q.ia + q.ta));
  const found = hits.length;
  let [lo, hi] = [Number.isFinite(d.from) ? d.from : -Infinity, Number.isFinite(d.to) ? d.to : Infinity];
  if (lo > hi) [lo, hi] = [hi, lo];
  let use = hits.filter((h) => h.x >= lo && h.x <= hi);
  if (d.touch === false) use = use.filter((h) => h.kind === 'cross');
  const kept = use.length;
  if (d.crossing === 'first') use = use.slice(0, 1);
  else if (d.crossing === 'last') use = use.slice(-1);
  const pos = (p: Poly, k: number, t: number) => p.rows[k] + 1 + t * (p.rows[k + 1] - p.rows[k]);
  const KIND = { cross: '', touch: 'touch', endA: 'end of A', endB: 'end of B' };
  const label = (h: Hit) => (h.kind === 'cross' ? (h.dir > 0 ? 'B crosses above A' : 'B crosses below A') : KIND[h.kind]);
  const count = (k: Hit['kind']) => hits.filter((h) => h.kind === k).length;
  const [nc, nt, ne] = [count('cross'), count('touch'), count('endA') + count('endB')];
  report.push(
    found
      ? `${found} intersection${found > 1 ? 's' : ''}: ${nc} crossing${nc === 1 ? '' : 's'}${nt ? `, ${nt} touch${nt > 1 ? 'es' : ''}` : ''}${ne ? `, ${ne} at the end of a curve` : ''}${kept < found ? `: ${kept} ${d.touch === false ? 'crossing' : 'intersection'}${kept === 1 ? '' : 's'}${lo > -Infinity || hi < Infinity ? ` in X from ${fmtNum(lo)} to ${fmtNum(hi)}` : ''}` : ''}${use.length < kept ? `; given: the ${d.crossing} along A` : ''}.`
      : 'A and B do not meet.',
  );
  use.slice(0, 6).forEach((h, k) => report.push(`${k + 1}. X = ${fmtNum(h.x)}, Y = ${fmtNum(h.y)}: ${label(h)}`));
  if (use.length > 6) report.push(`… ${use.length - 6} more in the table.`);
  if (overlaps.length) {
    const [o0, o1] = [minOf(overlaps.map((o) => minOf(o))), maxOf(overlaps.map((o) => maxOf(o)))];
    warnings.push(`A and B lie on top of each other along ${overlaps.length} segment${overlaps.length > 1 ? 's' : ''} (X from ${fmtNum(o0)} to ${fmtNum(o1)}): not intersections, only where they part is counted.`);
  }
  const cols = (f: (h: Hit, k: number) => number) => Float64Array.from(use, f);
  return {
    dataset: {
      name: 'intersections',
      columns: [
        { ...column('#', cols((_, k) => k + 1)), role: 'none' },
        { ...column(A.xName, cols((h) => h.x)), role: 'x' },
        { ...column(A.name, cols((h) => h.y)), role: 'y' },
        { ...column('row of A', cols((h) => pos(a, h.ia, h.ta))), role: 'none' },
        { ...column('row of B', cols((h) => pos(b, h.ib, h.tb))), role: 'none' },
        { ...column('direction', cols((h) => h.dir)), role: 'none' },
        { ...column('kind', cols(() => NaN), use.map(label)), role: 'label' },
      ],
    },
    report,
    warnings,
  };
}

// ---- Translate & resize ----
// A resize of the X or the Y of the curves (before they are moved): none; by a factor about a point that stays (0, the
// first point, the middle of the data, the peak, or a value); a range brought to another (empty ends: the data's); two
// values brought to two others (a calibration: 532 → 532.0, 633 → 632.8)
export type AxisScale = {
  mode: 'none' | 'factor' | 'range' | 'points';
  k?: number;
  anchor?: 'zero' | 'first' | 'center' | 'peak' | 'value';
  at?: number;
  from?: [number, number];
  to?: [number, number];
  pts?: [number, number, number, number];
};
export type TranslateData = {
  roles: Record<string, ColumnRole>; // designations given here (by column name) over the dataset's own
  mode: 'value' | 'point' | 'stagger';
  dx: number;
  dy: number;
  own: Record<string, { dx: number; dy: number }>; // by value: a curve (its Y) with its own shift
  point: 'max' | 'min' | 'first' | 'last' | 'atx'; // by a point: which one
  atx: number;
  moveX: boolean;
  moveY: boolean;
  x0: number;
  y0: number;
  // the resize of X and of Y, done before the move; the graph in the node: the curves as they were shown (a thin grey
  // line; false: not), its limits (NaN: the data's)
  sx?: AxisScale;
  sy?: AxisScale;
  ghost?: boolean;
  plotView?: { x0: number; x1: number; y0: number; y1: number };
};
// a curve before and after, for the graph in the node
export type TranslateCurve = { name: string; ox: number[]; oy: number[]; x: number[]; y: number[] };

// the factor and offset of a resize (value' = a·value + b) of the values of one curve on that axis; peak: the value of
// that axis at the curve's maximum
function scaleOf(s: AxisScale | undefined, vals: number[], peak: number, what: string, warnings: string[]): [number, number] {
  if (!s || s.mode === 'none') return [1, 0];
  const lo = minOf(vals);
  const hi = maxOf(vals);
  if (s.mode === 'factor') {
    const k = Number.isFinite(s.k) && s.k !== 0 ? s.k! : 1;
    const a = s.anchor ?? 'center';
    const c = a === 'zero' ? 0 : a === 'first' ? (vals[0] ?? 0) : a === 'peak' ? peak : a === 'value' ? (Number.isFinite(s.at) ? s.at! : 0) : (lo + hi) / 2;
    return Number.isFinite(c) ? [k, c * (1 - k)] : [k, 0];
  }
  if (s.mode === 'range') {
    const f0 = Number.isFinite(s.from?.[0]) ? s.from![0] : lo;
    const f1 = Number.isFinite(s.from?.[1]) ? s.from![1] : hi;
    const t0 = Number.isFinite(s.to?.[0]) ? s.to![0] : f0;
    const t1 = Number.isFinite(s.to?.[1]) ? s.to![1] : f1;
    if (!(f1 !== f0) || !Number.isFinite(f0) || !Number.isFinite(f1)) {
      warnings.push(`${what}: the range to resize from has no length; not resized.`);
      return [1, 0];
    }
    const a = (t1 - t0) / (f1 - f0);
    return [a, t0 - a * f0];
  }
  const [p1, p2, q1, q2] = s.pts ?? [NaN, NaN, NaN, NaN];
  if (![p1, p2, q1, q2].every(Number.isFinite) || p1 === p2) {
    warnings.push(`${what}: give two different values and where each goes; not resized.`);
    return [1, 0];
  }
  const a = (q2 - q1) / (p2 - p1);
  return [a, q1 - a * p1];
}

// the curves of the columns (with the designations), each resized then moved; the X shared by curves changed the same
// keeps its place; the errors are resized with their values (a move leaves them as they are)
export function translate(cols: Column[], d: TranslateData): { dataset: Dataset; shifts: Dataset; warnings: string[]; curves: TranslateCurve[] } | string {
  const withRoles = cols.map((c) => (d.roles[c.name] ? { ...c, role: d.roles[c.name] } : c));
  const curves = curvesByRole(withRoles).curves;
  if (!curves.length) return 'No Y column: designate one Y (and its X on its left).';
  const by = (n?: string) => (n ? withRoles.find((c) => c.name === n) : undefined);
  const warnings: string[] = [];
  // every curve: its points, its resize on X and Y, then its move
  const fits = curves.map((rc, k) => {
    const x = by(rc.x);
    const y = by(rc.y)!;
    const xv = (i: number) => (x ? x.values[i] : i + 1);
    const idx = Array.from(y.values.keys()).filter((i) => Number.isFinite(y.values[i]) && Number.isFinite(xv(i)));
    const xs = idx.map(xv);
    const ys = idx.map((i) => y.values[i]);
    const top = ys.length ? ys.indexOf(maxOf(ys)) : -1;
    const [ax, bx] = scaleOf(d.sx, xs, top >= 0 ? xs[top] : NaN, `${y.name}, X`, warnings);
    const [ay, by2] = scaleOf(d.sy, ys, top >= 0 ? ys[top] : NaN, `${y.name}, Y`, warnings);
    // the move, on the resized curve
    let dx = 0;
    let dy = 0;
    if (d.mode === 'value') {
      const o = d.own[rc.y];
      [dx, dy] = o ? [o.dx, o.dy] : [d.dx, d.dy];
    } else if (d.mode === 'stagger') [dx, dy] = [k * d.dx, k * d.dy];
    else if (idx.length) {
      // the point chosen (on the resized curve), moved to (x0, y0)
      const sx = xs.map((v) => ax * v + bx);
      const sy = ys.map((v) => ay * v + by2);
      let px: number;
      let py: number;
      if (d.point === 'atx') {
        const o = sx.map((_, j) => j).sort((p, q) => sx[p] - sx[q]);
        px = d.atx;
        py = interp(o.map((j) => sx[j]), o.map((j) => sy[j]), d.atx);
        if (!Number.isFinite(py)) warnings.push(`${y.name}: X = ${d.atx} is outside the curve.`);
      } else {
        let j = 0;
        if (d.point === 'last') j = sx.length - 1;
        else if (d.point === 'max') j = sy.reduce((b, v, q) => (v > sy[b] ? q : b), 0);
        else if (d.point === 'min') j = sy.reduce((b, v, q) => (v < sy[b] ? q : b), 0);
        [px, py] = [sx[j], sy[j]];
      }
      dx = d.moveX && Number.isFinite(px) ? d.x0 - px : 0;
      dy = d.moveY && Number.isFinite(py) ? d.y0 - py : 0;
    }
    return { rc, x, y, ax, bx, ay, by: by2, dx, dy };
  });
  // a column of values made a·v + b
  const lin = (c: Column, a: number, b: number, name = c.name): Column => ({ ...c, name, values: Float64Array.from(c.values, (w) => a * w + b) });
  const errOf = (name: string) => {
    const f = fits.find((q) => q.rc.yerr === name);
    if (f) return Math.abs(f.ay);
    const g = fits.find((q) => q.rc.xerr === name);
    return g ? Math.abs(g.ax) : 1;
  };
  const sameX = fits.every((f) => f.ax === fits[0].ax && f.bx + f.dx === fits[0].bx + fits[0].dx);
  const columns: Column[] = [];
  if (sameX) {
    // the columns in their order: X changed as the first curve's, every Y as its own, the errors resized
    const f0 = fits[0];
    withRoles.forEach((c) => {
      const f = fits.find((q) => q.rc.y === c.name);
      if (f) columns.push(lin(c, f.ay, f.by + f.dy));
      else if (curves.some((rc) => rc.x === c.name)) columns.push(lin(c, f0.ax, f0.bx + f0.dx));
      else if (c.role === 'yerr' || c.role === 'xerr') columns.push(lin(c, errOf(c.name), 0));
      else columns.push(c);
    });
  } else
    fits.forEach((f) => {
      columns.push(f.x ? { ...lin(f.x, f.ax, f.bx + f.dx, `${f.x.name} (${f.y.name})`), role: 'x' } : { ...column(`row (${f.y.name})`, Float64Array.from(f.y.values, (_, i) => f.ax * (i + 1) + f.bx + f.dx)), role: 'x' });
      columns.push(lin(f.y, f.ay, f.by + f.dy));
      if (f.rc.yerr && by(f.rc.yerr)) columns.push(lin(by(f.rc.yerr)!, Math.abs(f.ay), 0));
      if (f.rc.xerr && by(f.rc.xerr)) columns.push(lin(by(f.rc.xerr)!, Math.abs(f.ax), 0));
    });
  const shiftTable: Dataset = {
    name: 'shifts',
    columns: [
      { ...column('curve', Float64Array.from(curves, (_, k) => k + 1), curves.map((c) => c.y)), role: 'x' },
      { ...column('ΔX', Float64Array.from(fits, (s) => s.dx)), role: 'y' },
      { ...column('ΔY', Float64Array.from(fits, (s) => s.dy)), role: 'y' },
      { ...column('X factor', Float64Array.from(fits, (s) => s.ax)), role: 'y' },
      { ...column('X offset', Float64Array.from(fits, (s) => s.bx + s.dx)), role: 'y' },
      { ...column('Y factor', Float64Array.from(fits, (s) => s.ay)), role: 'y' },
      { ...column('Y offset', Float64Array.from(fits, (s) => s.by + s.dy)), role: 'y' },
    ],
  };
  // the curves before and after (the points of both), for the graph in the node
  const shown: TranslateCurve[] = fits.map((f) => {
    const n = f.y.values.length;
    const ox: number[] = [];
    const oy: number[] = [];
    for (let i = 0; i < n; i++) {
      ox.push(f.x ? f.x.values[i] : i + 1);
      oy.push(f.y.values[i]);
    }
    return { name: f.y.name, ox, oy, x: ox.map((v) => f.ax * v + f.bx + f.dx), y: oy.map((v) => f.ay * v + f.by + f.dy) };
  });
  return { dataset: { name: 'translated', columns }, shifts: shiftTable, warnings, curves: shown };
}
