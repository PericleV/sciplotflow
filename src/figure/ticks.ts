// Axis ranges, tick positions and tick labels: linear (a 1-2-5 step, a chosen step or a number of ticks), logarithmic
// (decades — or powers of 2 or of e —, minor ticks at 2 … 9), symmetric log (0 and ±10^k), logit (0.01, 0.1, 0.5 …),
// reciprocal, categories (1, 2, 3 … named), dates and times (calendar steps), ticks at chosen values; labels in several
// formats (as rich text: ×10^{n} is drawn as a superscript).
import { normCdf, normInv } from '../engine/dist.ts';
import type { AxisSpec, ProbAxis, SideStyle } from './spec.ts';
import { timeBounds, timeTicks } from './timeaxis.ts';
import { maxOf, minOf } from '../engine/minmax.ts';

export type Ticks = { major: number[]; minor: number[]; labels?: string[] }; // labels: of custom ticks

// The breaks of an axis, "20-80; 120-150" → [[20, 80], [120, 150]] (sorted, valid ones only).
const breakCache = new Map<string, [number, number][]>();
export function parseBreaks(s: string | undefined): [number, number][] {
  if (!s?.trim()) return [];
  const hit = breakCache.get(s);
  if (hit) return hit;
  const out = s
    .split(/[;\n]/)
    .map((p) => /^\s*([-+]?[\d.eE+-]+?)\s*(?:-|–|to|\.\.)\s*([-+]?[\d.eE+-]+)\s*$/.exec(p))
    .flatMap((m) => (m ? [[Number(m[1]), Number(m[2])] as [number, number]] : []))
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a !== b)
    .map(([a, b]): [number, number] => [Math.min(a, b), Math.max(a, b)])
    .sort((p, q) => p[0] - q[0]);
  breakCache.set(s, out);
  return out;
}
export const inBreak = (spec: AxisSpec, v: number) => parseBreaks(spec.breaks).some(([a, b]) => v > a && v < b);

// ---- probability axes ----
// value (%) → the quantile it is placed at, and back
export function probT(kind: ProbAxis | undefined, v: number): number {
  const p = v / 100;
  if (!(p > 0 && p < 1)) return NaN;
  switch (kind) {
    case 'logistic':
      return Math.log(p / (1 - p));
    case 'sev':
      return Math.log(-Math.log1p(-p));
    case 'lev':
      return -Math.log(-Math.log(p));
    case 'exp':
      return -Math.log1p(-p);
    default:
      return normInv(p);
  }
}
export function probTi(kind: ProbAxis | undefined, u: number): number {
  switch (kind) {
    case 'logistic':
      return 100 / (1 + Math.exp(-u));
    case 'sev':
      return -100 * Math.expm1(-Math.exp(u));
    case 'lev':
      return 100 * Math.exp(-Math.exp(-u));
    case 'exp':
      return -100 * Math.expm1(-u);
    default:
      return 100 * normCdf(u);
  }
}
// the ticks of a probability axis, from the densest set to the sparsest
const PROB_SETS = [
  [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 99.5, 99.9, 99.95, 99.99],
  [0.01, 0.1, 1, 5, 10, 20, 30, 50, 70, 80, 90, 95, 99, 99.9, 99.99],
  [0.01, 0.1, 1, 10, 50, 90, 99, 99.9, 99.99],
  [0.1, 10, 50, 90, 99.9],
];
const probLabel = (v: number) => String(+v.toPrecision(6));
function probTicks(spec: AxisSpec, lo: number, hi: number, count: number): Ticks {
  const inside = (v: number) => v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9);
  // the densest set that is not much more than wanted (fewer when the numbers touch: the count is lowered then, see
  // roomyTicks) — a probability paper reads best with many percents (1, 2, 5, 10, 20 …)
  let major = PROB_SETS[PROB_SETS.length - 1];
  for (const set of PROB_SETS)
    if (set.filter(inside).length <= Math.max(3, count * 4)) {
      major = set;
      break;
    }
  // a narrow range (inside 10 – 90 %, say): the linear ticks of the percents
  if (major.filter(inside).length < 2) return linear({ ...spec, scale: 'linear' }, lo, hi, count);
  const minor = spec.minor > 0 ? PROB_SETS[0].filter((v) => !major.includes(v)) : [];
  return { major, minor, labels: major.map(probLabel) };
}
// the automatic limits of a probability axis: the data's, out to the next tick of the sparser set (1 – 99, 0.1 – 99.9 …),
// ± 5 % of the axis, or exactly
function probRange(spec: AxisSpec, lo: number, hi: number): [number, number] {
  if (!(lo > 0 && hi < 100 && hi >= lo)) [lo, hi] = [1, 99];
  if (spec.range === 'tight') return hi > lo ? [lo, hi] : [lo / 2, (hi + 100) / 2];
  if (spec.range === 'padded') {
    const [a, b] = [probT(spec.prob, lo), probT(spec.prob, hi)];
    const pad = Math.max(0.05 * (b - a), 0.05);
    return [probTi(spec.prob, a - pad), probTi(spec.prob, b + pad)];
  }
  const ticks = PROB_SETS[1];
  return [[...ticks].reverse().find((t) => t <= lo * (1 + 1e-9)) ?? lo / 2, ticks.find((t) => t >= hi * (1 - 1e-9)) ?? (hi + 100) / 2];
}
export const probValid = (v: number) => Number.isFinite(v) && v > 0 && v < 100;

// ---- symmetric log, logit, other log bases ----
const linOf = (spec: AxisSpec) => (Number.isFinite(spec.linthresh) && spec.linthresh! > 0 ? spec.linthresh! : 1);
// symlog: sign(v)·log10(1 + |v| / C), and back
export const symT = (spec: AxisSpec, v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v) / linOf(spec));
export const symTi = (spec: AxisSpec, u: number) => Math.sign(u) * linOf(spec) * (10 ** Math.abs(u) - 1);
export const logitT = (v: number) => (v > 0 && v < 1 ? Math.log(v / (1 - v)) : NaN);
export const logitTi = (u: number) => 1 / (1 + Math.exp(-u));
const baseOf = (spec: AxisSpec) => (spec.base === 2 ? 2 : spec.base === 'e' ? Math.E : 10);
// 0 and ±10^k from the linear part out: the ticks of a symlog axis over [lo, hi]
function symlogTicks(spec: AxisSpec, lo: number, hi: number): Ticks {
  const big = Math.max(Math.abs(lo), Math.abs(hi), linOf(spec));
  const k0 = Math.floor(Math.log10(linOf(spec)) + 1e-9);
  const k1 = Math.ceil(Math.log10(big) - 1e-9);
  const every = Math.max(1, Math.ceil((k1 - k0 + 1) / 5));
  const pos: number[] = [];
  for (let k = k0; k <= k1; k++) if ((k - k0) % every === 0) pos.push(10 ** k);
  const major = [...pos.map((v) => -v).reverse(), 0, ...pos].filter((v) => v >= lo - 1e-12 * big && v <= hi + 1e-12 * big);
  // one way for the whole axis: plain numbers when every decade is between 0.01 and 1000, else powers of 10
  const plain = major.every((v) => v === 0 || Math.abs(Math.log10(Math.abs(v))) <= 3);
  const label = (v: number) => (v === 0 ? '0' : plain ? minus(String(+v.toPrecision(6))) : `${v < 0 ? '−' : ''}10^{${minus(String(Math.round(Math.log10(Math.abs(v)))))}}`);
  return { major, minor: [], labels: major.map(label) };
}
const LOGIT_SETS = PROB_SETS.map((s) => s.map((v) => +(v / 100).toPrecision(10)));
function logitTicks(lo: number, hi: number, count: number): Ticks {
  const inside = (v: number) => v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9);
  let major = LOGIT_SETS[LOGIT_SETS.length - 1];
  for (const set of LOGIT_SETS)
    if (set.filter(inside).length <= Math.max(3, count * 2.5)) {
      major = set;
      break;
    }
  return { major, minor: [], labels: major.map((v) => String(+v.toPrecision(6))) };
}
// powers of 2 or of e: 2^k written as a number from 1/8 to 1024, else as 2^{k}; e^{k}
function baseTicks(spec: AxisSpec, lo: number, hi: number): Ticks {
  const B = baseOf(spec);
  const k0 = Math.floor(Math.log(lo) / Math.log(B) - 1e-9);
  const k1 = Math.ceil(Math.log(hi) / Math.log(B) + 1e-9);
  const every = Math.max(1, Math.ceil((k1 - k0) / 8));
  const ks: number[] = [];
  for (let k = k0; k <= k1; k++) if ((k - k0) % every === 0) ks.push(k);
  const label = (k: number) => (B === 2 ? (k >= -3 && k <= 10 ? String(2 ** k) : `2^{${minus(String(k))}}`) : k === 0 ? '1' : k === 1 ? 'e' : `e^{${minus(String(k))}}`);
  return { major: ks.map((k) => B ** k), minor: [], labels: ks.map(label) };
}

export function niceStep(span: number, count = 5): number {
  if (!(span > 0)) return 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
}

// How the ticks are placed (older projects: from which of step / count / custom is set).
export const ticksMode = (spec: AxisSpec) => spec.ticksBy ?? (spec.custom?.trim() ? 'values' : Number.isFinite(spec.step) && spec.step > 0 ? 'increment' : Number.isFinite(spec.count) && spec.count >= 2 ? 'count' : 'auto');
const wantCount = (spec: AxisSpec, fallback: number) => (ticksMode(spec) === 'count' && Number.isFinite(spec.count) && spec.count >= 2 ? spec.count - 1 : fallback);
const stepOf = (spec: AxisSpec, span: number, count: number) => (ticksMode(spec) === 'increment' && Number.isFinite(spec.step) && spec.step > 0 && span / spec.step <= 500 ? spec.step : niceStep(span, wantCount(spec, count)));

// Data extent → axis limits. Manual limits win; NaN ones are automatic.
export function axisRange(spec: AxisSpec, lo: number, hi: number): [number, number] {
  const auto = ((): [number, number] | null => {
    // categories: half a place beyond the first and the last
    if (spec.cats?.length) return [0.5, spec.cats.length + 0.5];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    if (spec.time) {
      if (spec.range === 'tight') return hi > lo ? [lo, hi] : [lo - 3600, hi + 3600];
      if (spec.range === 'padded') return [lo - 0.05 * (hi - lo || 7200), hi + 0.05 * (hi - lo || 7200)];
      return timeBounds(lo, hi, 5, spec.time);
    }
    if (spec.scale === 'logit') {
      if (!(lo > 0 && hi < 1 && hi >= lo)) [lo, hi] = [0.01, 0.99];
      if (spec.range === 'tight') return hi > lo ? [lo, hi] : [lo / 2, (hi + 1) / 2];
      const [a, b] = [logitT(lo), logitT(hi)];
      const pad = Math.max(0.05 * (b - a), 0.05);
      if (spec.range === 'padded') return [logitTi(a - pad), logitTi(b + pad)];
      const set = LOGIT_SETS[1];
      return [[...set].reverse().find((t) => t <= lo * (1 + 1e-9)) ?? lo / 2, set.find((t) => t >= hi * (1 - 1e-9)) ?? (hi + 1) / 2];
    }
    if (spec.scale === 'symlog') {
      const [a, b] = [symT(spec, lo), symT(spec, hi)];
      if (spec.range === 'tight' && b > a) return [lo, hi];
      const pad = 0.05 * (b - a || 1);
      if (spec.range === 'padded' || !(b > a)) return [symTi(spec, a - pad), symTi(spec, b + pad)];
      // out to the next 0 or ±10^k (every decade from the linear part to the data's largest value)
      const C = linOf(spec);
      const top = Math.ceil(Math.log10(Math.max(Math.abs(lo), Math.abs(hi), C)) - 1e-9);
      const pos: number[] = [];
      for (let k = Math.floor(Math.log10(C) + 1e-9); k <= top; k++) pos.push(10 ** k);
      const t = [...pos.map((v) => -v).reverse(), 0, ...pos];
      return [[...t].reverse().find((v) => v <= lo) ?? lo, t.find((v) => v >= hi) ?? hi];
    }
    if (spec.scale === 'log' && spec.base && spec.base !== 10 && lo > 0 && hi > 0 && spec.range !== 'tight' && spec.range !== 'padded') {
      const B = baseOf(spec);
      const [k0, k1] = [Math.floor(Math.log(lo) / Math.log(B) + 1e-9), Math.ceil(Math.log(hi) / Math.log(B) - 1e-9)];
      return k1 > k0 ? [B ** k0, B ** k1] : [B ** k0, B ** (k0 + 1)];
    }
    return null;
  })();
  if (auto) {
    const ok = (v: number) => Number.isFinite(v) && (spec.scale !== 'logit' || (v > 0 && v < 1)) && (spec.scale !== 'log' || v > 0);
    const min = ok(spec.min) ? spec.min : auto[0];
    const max = ok(spec.max) ? spec.max : auto[1];
    return max > min ? [min, max] : auto;
  }
  if (spec.scale === 'probability') {
    const [a, b] = probRange(spec, lo, hi);
    const min = probValid(spec.min) ? spec.min : a;
    const max = probValid(spec.max) ? spec.max : b;
    return max > min ? [min, max] : [a, b];
  }
  const log = spec.scale === 'log';
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = log ? [1, 10] : [0, 1];
  let a: number;
  let b: number;
  if (log) {
    const [l0, l1] = [Math.log10(lo), Math.log10(hi)];
    if (spec.range === 'tight') [a, b] = [lo, hi];
    else if (spec.range === 'padded') {
      const pad = Math.max(0.05 * (l1 - l0), 0.02);
      [a, b] = [10 ** (l0 - pad), 10 ** (l1 + pad)];
    } else [a, b] = [10 ** Math.floor(l0 + 1e-9), 10 ** Math.ceil(l1 - 1e-9)];
    if (!(b > a)) [a, b] = [a / 10, a * 10];
  } else {
    if (!(hi > lo)) {
      const d = lo === 0 ? 1 : Math.abs(lo) * 0.1;
      [lo, hi] = [lo - d, hi + d];
    }
    if (spec.range === 'tight') [a, b] = [lo, hi];
    else if (spec.range === 'padded') [a, b] = [lo - 0.05 * (hi - lo), hi + 0.05 * (hi - lo)];
    else {
      // out to the major ticks; data that cross 0 by a little only (error bars below 0) out to the nearest minor tick
      // past 0, not a whole step (from −0.3 with a step of 2: −1, not −2)
      const step = stepOf(spec, hi - lo, 5);
      const minorStep = step / (Math.max(0, Math.floor(spec.minor ?? 1)) + 1);
      [a, b] = [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
      const small = 0.1 * (hi - lo);
      if (lo < 0 && hi > 0 && -lo < small && lo - a > step / 2) a = Math.floor(lo / minorStep + 1e-9) * minorStep;
      if (hi > 0 && lo < 0 && hi < small && b - hi > step / 2) b = Math.ceil(hi / minorStep - 1e-9) * minorStep;
    }
    // a reciprocal axis cannot cross 0
    if (spec.scale === 'reciprocal' && a <= 0 && lo > 0) a = lo;
  }
  const ok = (v: number) => Number.isFinite(v) && (!log || v > 0) && (spec.scale !== 'reciprocal' || v !== 0);
  const min = ok(spec.min) ? spec.min : a;
  const max = ok(spec.max) ? spec.max : b;
  return max > min ? [min, max] : [a, b];
}

// "400, 532 = green, 633" → positions and labels (empty label = the number).
export function parseCustomTicks(s: string): { v: number; label: string }[] {
  return s
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [a, ...rest] = p.split('=');
      return { v: Number(a.trim().replace(',', '.')), label: rest.join('=').trim() };
    })
    .filter((t) => Number.isFinite(t.v));
}

export function ticks(spec: AxisSpec, lo: number, hi: number, count = 5): Ticks {
  const mode = ticksMode(spec);
  const custom = mode === 'values' ? parseCustomTicks(spec.custom ?? '') : [];
  if (custom.length) return { major: custom.map((t) => t.v), minor: [], labels: custom.map((t) => t.label) };
  // categories: their places, named (as many as there are: “Label every” thins the names)
  if (spec.cats?.length) {
    const major = spec.cats.map((_, k) => k + 1).filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
    return { major, minor: [], labels: major.map((v) => spec.cats![v - 1]) };
  }
  if (spec.time) return { ...timeTicks(lo, hi, count, spec.time, spec.timeFormat), minor: [] };
  if (spec.scale === 'probability') return probTicks(spec, lo, hi, count);
  if (spec.scale === 'symlog') return symlogTicks(spec, lo, hi);
  if (spec.scale === 'logit') return logitTicks(lo, hi, count);
  if (spec.scale === 'log' && spec.base && spec.base !== 10) return baseTicks(spec, lo, hi);
  if (spec.scale === 'log') {
    const major: number[] = [];
    const minor: number[] = [];
    const d0 = Math.floor(Math.log10(lo) - 1e-9);
    const d1 = Math.ceil(Math.log10(hi) + 1e-9);
    const every = Math.max(1, Math.ceil((d1 - d0) / 8));
    for (let d = d0; d <= d1; d++) {
      const v = 10 ** d;
      if ((d - d0) % every === 0) major.push(v);
      if (every === 1 && spec.minor > 0) for (let k = 2; k <= 9; k++) minor.push(v * k);
    }
    // less than a decade: linear ticks inside it
    if (major.filter((v) => v >= lo && v <= hi).length < 2) return linear(spec, lo, hi, count);
    return { major, minor };
  }
  return linear(spec, lo, hi, count);
}

function linear(spec: AxisSpec, lo: number, hi: number, count: number): Ticks {
  const mode = ticksMode(spec);
  // “by count”: exactly N ticks from one end of the axis to the other
  const exact = mode === 'count' && Number.isFinite(spec.count) && spec.count >= 2;
  const step = exact ? (hi - lo) / (Math.floor(spec.count) - 1) : stepOf(spec, hi - lo, count);
  // the ticks are first + k·step (by default the multiples of the step)
  const origin = exact ? lo : mode === 'increment' && Number.isFinite(spec.first ?? NaN) ? spec.first! : 0;
  const major: number[] = [];
  for (let k = Math.ceil((lo - origin) / step - 1e-9); origin + k * step <= hi + step * 1e-9; k++) {
    const v = origin + k * step;
    major.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  const minor: number[] = [];
  const m = Math.max(0, Math.floor(spec.minor));
  if (m > 0) {
    const ms = step / (m + 1);
    for (let k = Math.ceil((lo - origin) / ms - 1e-9); origin + k * ms <= hi + ms * 1e-9; k++) if (Math.abs(k % (m + 1)) > 1e-9) minor.push(origin + k * ms);
  }
  return { major, minor };
}

// ---- labels ----
const minus = (s: string) => (s === '-0' || /^-0\.?0*$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
// the decimals a step needs: those of its first digit, more when it has them (0.25: 2, 2.5: 1)
const decimalsFor = (step: number) => {
  let d = Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
  while (d < 10 && Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) > 1e-6 * Math.max(1, step * 10 ** d)) d++;
  return d;
};
const trimZeros = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);

function mantExp(v: number, e: number, dec: number): string {
  return v === 0 ? '0' : `${minus((v / 10 ** e).toFixed(dec))}×10^{${minus(String(e))}}`;
}

// The label texts of tick values on one side (rich text) and, for the “common factor” format, the factor shown at the
// end of the axis.
export function formatLabels(values: number[], log: boolean, side: SideStyle): { labels: string[]; common?: string } {
  const fac = Number.isFinite(side.factor) && side.factor !== 0 ? side.factor : 1;
  const vals = values.map((v) => v / fac);
  const sorted = [...new Set(vals)].sort((a, b) => a - b);
  const step = sorted.length > 1 ? minOf(sorted.slice(1).map((v, k) => v - sorted[k]).filter((d) => d > 0)) : Math.abs(sorted[0] || 1);
  const big = Math.max(0, maxOf(vals.map(Math.abs)));
  const fixedDec = Number.isFinite(side.decimals) && side.decimals >= 0 ? Math.min(12, Math.floor(side.decimals)) : null;
  let common: string | undefined;
  let body: string[];
  switch (side.format) {
    case 'decimal':
      body = vals.map((v) => minus(v.toFixed(fixedDec ?? decimalsFor(step))));
      break;
    case 'percent':
      body = vals.map((v) => `${minus((v * 100).toFixed(fixedDec ?? decimalsFor(step * 100)))}%`);
      break;
    case 'sci':
    case 'eng':
      body = vals.map((v) => {
        if (v === 0) return '0';
        let e = Math.floor(Math.log10(Math.abs(v)) + 1e-12);
        if (side.format === 'eng') e = 3 * Math.floor(e / 3);
        const dec = fixedDec ?? Math.max(0, Math.min(6, decimalsFor(step / 10 ** e)));
        return mantExp(v, e, dec);
      });
      break;
    case 'si': {
      // SI prefixes: 1.5k, 20M, 300µ, 4n (powers of 1000)
      const PRE: Record<number, string> = { [-24]: 'y', [-21]: 'z', [-18]: 'a', [-15]: 'f', [-12]: 'p', [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T', 15: 'P', 18: 'E' };
      body = vals.map((v) => {
        if (v === 0) return '0';
        const e = Math.max(-24, Math.min(18, 3 * Math.floor(Math.log10(Math.abs(v)) / 3 + 1e-12)));
        // the decimals chosen, else up to 4 significant digits (values of very different sizes keep theirs)
        const m = v / 10 ** e;
        return `${fixedDec !== null ? minus(m.toFixed(fixedDec)) : minus(String(+m.toPrecision(4)))}${PRE[e]}`;
      });
      break;
    }
    case 'common': {
      const e = big > 0 ? Math.floor(Math.log10(big) + 1e-12) : 0;
      body = vals.map((v) => minus((v / 10 ** e).toFixed(fixedDec ?? decimalsFor(step / 10 ** e))));
      if (e !== 0) common = `×10^{${minus(String(e))}}`;
      break;
    }
    default:
      if (log) {
        // the decades one way for the whole axis (not 10, 100, 10³): plain numbers when all are between 0.01 and 1000,
        // else powers of 10
        const decade = (v: number) => v > 0 && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9;
        const plain = vals.filter(decade).every((v) => Math.log10(v) >= -2 - 1e-9 && Math.log10(v) <= 3 + 1e-9);
        body = vals.map((v) => (decade(v) ? (plain ? trimZeros(minus(String(+v.toPrecision(6)))) : `10^{${minus(String(Math.round(Math.log10(v))))}}`) : minus(String(+v.toPrecision(4)))));
      }
      else if (big >= 1e5 || (big > 0 && big < 1e-3)) {
        const e = Math.floor(Math.log10(big) + 1e-12);
        const dec = Math.max(0, Math.min(8, decimalsFor(step / 10 ** e)));
        body = vals.map((v) => mantExp(v, e, dec));
      } else body = vals.map((v) => minus(v.toFixed(fixedDec ?? decimalsFor(step))));
  }
  const labels = body.map((b, k) => `${side.plus && vals[k] > 0 ? '+' : ''}${side.prefix}${b}${side.suffix}`);
  return { labels, common };
}
