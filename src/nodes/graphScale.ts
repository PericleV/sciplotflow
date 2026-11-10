// The scale of an axis of a node's working graph (Fit, Smooth, Data manipulation, Differentiate …): linear, log (the
// values ≤ 0 not drawn) or log of the absolute value (a negative current over the positive one; 0 not drawn). Only how
// the graph is drawn: the node's data and outputs as they come. Kept with the node (graphScale, NodeMeta: useGraphScale.ts); a graph
// works in the axis's own units (u = log10 v on a log axis): its view box, zoom and pan; values in and out as the data's.
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';

export type AxisScale = 'lin' | 'log' | 'abslog';
export type GraphScale = { x?: AxisScale; y?: AxisScale };

export const AXIS_SCALES: [AxisScale, string][] = [
  ['lin', 'linear'],
  ['log', 'log'],
  ['abslog', 'log |v|'],
];

export const isLog = (s: AxisScale | undefined) => s === 'log' || s === 'abslog';
// a value on the axis (NaN: not drawn there), and back (a log axis: the value's size, positive)
export const toAxis = (s: AxisScale | undefined, v: number) => (s === 'log' ? (v > 0 ? Math.log10(v) : NaN) : s === 'abslog' ? (v !== 0 ? Math.log10(Math.abs(v)) : NaN) : v);
export const fromAxis = (s: AxisScale | undefined, u: number) => (isLog(s) ? 10 ** u : u);
// the title of an axis: |I (A)| for the absolute value
export const axisTitle = (s: AxisScale | undefined, title: string) => (s === 'abslog' && title ? `|${title}|` : title);

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (k: number) => `10${[...String(k)].map((c) => (c === '-' ? '⁻' : SUP[+c])).join('')}`;
// a decade as written: 0.001 … 10000 plainly, else 10⁻⁶, 10⁹
const decade = (k: number) => (k >= -3 && k <= 4 ? fmtNum(10 ** k, 4) : pow10(k));

export type AxisTick = { u: number; text: string; minor?: boolean };
// The ticks of an axis between u0 and u1 (its own units), about n of them: linear, the 1-2-5 steps; log, the decades
// (every few when there are many; 2 … 9 between them, unlabelled, when few), or within one decade the 1-2-5 steps of the
// values
export function axisTicks(s: AxisScale | undefined, u0: number, u1: number, n: number): AxisTick[] {
  const [a, b] = [Math.min(u0, u1), Math.max(u0, u1)];
  const out: AxisTick[] = [];
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return out;
  if (!isLog(s)) {
    const st = niceStep(b - a, n);
    for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push({ u: v, text: fmtNum(Math.abs(v) < st * 1e-9 ? 0 : v, 4) });
    return out;
  }
  const [k0, k1] = [Math.ceil(a - 1e-9), Math.floor(b + 1e-9)];
  // (one or two decades: 1, 2, 5 of each labelled, the rest of 2 … 9 between them)
  if (k1 - k0 >= 1 && k1 - k0 < 3 && n > 3) {
    for (let k = k0 - 1; k <= k1; k++)
      for (let m = 1; m <= 9; m++) {
        const u = k + Math.log10(m);
        if (u >= a - 1e-9 && u <= b + 1e-9) out.push(m === 1 || m === 2 || m === 5 ? { u, text: m === 1 ? decade(k) : fmtNum(m * 10 ** k, 4) } : { u, text: '', minor: true });
      }
    return out;
  }
  if (k1 - k0 >= 1) {
    const st = Math.max(1, Math.ceil((k1 - k0 + 1) / Math.max(2, n)));
    for (let k = k0; k <= k1; k += st) out.push({ u: k, text: decade(k) });
    if (st === 1 && k1 - k0 <= 6)
      for (let k = k0 - 1; k <= k1; k++)
        for (let m = 2; m <= 9; m++) {
          const u = k + Math.log10(m);
          if (u >= a && u <= b) out.push({ u, text: '', minor: true });
        }
    return out;
  }
  // (less than a decade or two: the values' own steps)
  const [v0, v1] = [10 ** a, 10 ** b];
  const st = niceStep(v1 - v0, n);
  for (let v = Math.ceil(v0 / st) * st; v <= v1 + st * 1e-9; v += st) if (v > 0) out.push({ u: Math.log10(v), text: fmtNum(v, 4) });
  return out;
}

// how many points have both values but cannot be drawn on these axes, said under the graph
export function notDrawn(sc: GraphScale, xs: ArrayLike<number>, ys: ArrayLike<number>): string {
  if (!isLog(sc.x) && !isLog(sc.y)) return '';
  let k = 0;
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) continue;
    if (Number.isNaN(toAxis(sc.x, xs[i])) || Number.isNaN(toAxis(sc.y, ys[i]))) k++;
  }
  if (!k) return '';
  const why = [sc.x, sc.y].some((s) => s === 'log') ? '≤ 0' : 'at 0';
  return `${k} point${k === 1 ? '' : 's'} ${why} not drawn on the log ${[isLog(sc.x) ? 'X' : '', isLog(sc.y) ? 'Y' : ''].filter(Boolean).join(' / ')} axis`;
}
