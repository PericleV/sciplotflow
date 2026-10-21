// A colour bar's values and ticks (auto, every so much, the levels of the map, its ends, a list, none; minor ticks
// between them) and the room it takes around the bar (its ticks, numbers and title on the side chosen) — the same for
// drawing it and for the margins of its figure.
import { richMetrics } from './draw.ts';
import { resolveText, SIDE_DEFAULTS, type ColorbarSpec, type Curve, type TextDefaults } from './spec.ts';
import { formatLabels, niceStep } from './ticks.ts';

export type BarTicks = { major: number[]; minor: number[]; labels: string[]; common?: string; log: boolean };
const MAX = 200;

// the values of a list ("0, 0.5, 1"; spaces or semicolons too)
const listOf = (t: string | undefined) =>
  (t ?? '')
    .split(/[,;\s]+/)
    .map((w) => Number(w.trim()))
    .filter((v, k, a) => Number.isFinite(v) && a.indexOf(v) === k);

export function barTicks(b: ColorbarSpec, curve: Curve, lo: number, hi: number): BarTicks {
  const log = !!curve.style.cmapLog && lo > 0;
  const [a, z] = [Math.min(lo, hi), Math.max(lo, hi)];
  const inside = (v: number) => v >= a - (z - a) * 1e-9 && v <= z + (z - a) * 1e-9;
  const zero = (v: number, step: number) => (Math.abs(v) < step * 1e-9 ? 0 : v);
  // about `ticks` of them: decades (log), else a nice step
  const auto = (): number[] => {
    if (log) {
      const out: number[] = [];
      for (let d = Math.ceil(Math.log10(a) - 1e-9); d <= Math.floor(Math.log10(z) + 1e-9) && out.length < MAX; d++) out.push(10 ** d);
      return out;
    }
    const step = niceStep(z - a, Math.max(2, b.ticks));
    const out: number[] = [];
    for (let k = Math.ceil(a / step - 1e-9); k * step <= z + step * 1e-9 && out.length < MAX; k++) out.push(zero(k * step, step));
    return out;
  };
  const mode = b.labels ?? 'auto';
  let major: number[];
  if (mode === 'every' && b.every! > 0) {
    if (log) {
      // every n decades
      const n = Math.max(1, Math.round(b.every!));
      const d0 = Number.isFinite(b.everyFrom) && b.everyFrom! > 0 ? Math.round(Math.log10(b.everyFrom!)) : 0;
      major = [];
      for (let d = d0 + n * Math.ceil((Math.log10(a) - 1e-9 - d0) / n); d <= Math.log10(z) + 1e-9 && major.length < MAX; d += n) major.push(10 ** d);
    } else {
      const step = b.every!;
      const from = Number.isFinite(b.everyFrom) ? b.everyFrom! : 0;
      major = [];
      for (let k = Math.ceil((a - from) / step - 1e-9); from + k * step <= z + step * 1e-9 && major.length < MAX; k++) major.push(zero(+(from + k * step).toPrecision(12), step));
    }
    if (!major.length) major = auto();
  } else if (mode === 'levels') {
    const lv = (curve.grid?.levels ?? []).filter(inside);
    major = lv.length ? lv.slice(0, MAX) : auto();
  } else if (mode === 'minmax') major = [a, z];
  else if (mode === 'custom') major = listOf(b.custom).filter(inside).slice(0, MAX);
  else major = auto();
  major = [...major].sort((u, v) => u - v);
  // minor ticks: a log map, 2 … 9 of every decade; else so many between two values (beyond the first and the last one
  // too, at the same step, when the values are evenly spaced)
  const minor: number[] = [];
  const n = Math.max(0, Math.min(20, Math.floor(b.minor ?? 0)));
  if (n > 0 && log) {
    for (let d = Math.floor(Math.log10(a)); d <= Math.ceil(Math.log10(z)) && minor.length < MAX * 10; d++) for (let m = 2; m <= 9; m++) if (inside(m * 10 ** d)) minor.push(m * 10 ** d);
  } else if (n > 0 && major.length > 1) {
    const gaps = major.slice(1).map((v, k) => v - major[k]);
    const even = gaps.every((g) => Math.abs(g - gaps[0]) < Math.abs(gaps[0]) * 1e-6);
    const at = (u: number, step: number) => {
      for (let j = 1; j <= n; j++) {
        const v = u + (step * j) / (n + 1);
        if (inside(v)) minor.push(v);
      }
    };
    major.slice(0, -1).forEach((u, k) => at(u, gaps[k]));
    if (even) {
      for (let u = major[0] - gaps[0]; u + gaps[0] > a && minor.length < MAX * 10; u -= gaps[0]) at(u, gaps[0]);
      for (let u = major[major.length - 1]; u < z && minor.length < MAX * 10; u += gaps[0]) at(u, gaps[0]);
    }
  }
  if (mode === 'none') return { major, minor, labels: major.map(() => ''), log };
  const fmt = formatLabels(major, log, { ...SIDE_DEFAULTS, format: b.format ?? 'auto', decimals: b.decimals ?? NaN });
  return { major, minor, labels: fmt.labels, common: fmt.common, log };
}

// The room a colour bar takes beyond its own box (pt): before / after it across (left / right of a vertical bar, above /
// under a horizontal one: its ticks, numbers, a horizontal one's title), past its start or end along it (a vertical bar's
// title and common factor above it; a horizontal one's common factor past its right end); gap: from the edge to the numbers
export function barReach(b: ColorbarSpec, curve: Curve, lo: number, hi: number, defaults: TextDefaults, title: boolean): { before: number; after: number; atStart: number; atEnd: number; t: ReturnType<typeof resolveText>; ticks: BarTicks; gap: number; len: number } {
  const t = resolveText(b.text, defaults);
  const ticks = barTicks(b, curve, lo, hi);
  const dir = b.tickDir ?? 'out';
  const len = Math.max(0, b.tickLen ?? 2);
  // from the bar's edge to its numbers
  const out = dir === 'out' || dir === 'both' ? len : 0;
  const gap = out + (b.orientation === 'vertical' ? 1.5 : 1);
  const vert = b.orientation === 'vertical';
  const widest = Math.max(0, ...ticks.labels.filter(Boolean).map((l) => richMetrics(l, t).width));
  const numbers = ticks.labels.some(Boolean) ? (vert ? widest : t.size * 1.2) : 0;
  // vertical: the title above the bar (the common factor above it too); horizontal: the title past the numbers
  const side = gap + numbers + (vert ? 0 : title ? t.size * 1.4 : 0);
  return {
    before: b.side === 'start' ? side : 0,
    after: b.side === 'start' ? 0 : side,
    // a vertical bar: above it (its top); a horizontal one: past its right end
    atStart: vert ? (title ? t.size * 1.4 : 0) + (ticks.common ? t.size * 1.3 : 0) : 0,
    atEnd: !vert && ticks.common ? 3 + richMetrics(ticks.common, t).width : 0,
    t,
    ticks,
    gap,
    len,
  };
}

// Its title: its own, or the name of the split column of the curves it explains
export const barTitle = (b: ColorbarSpec, curve: Curve) => b.title || (curve.group?.color === 'map' && curve.group.name ? curve.group.name : '');
// Where the bar itself is drawn from its place (x, y: the top-left corner of all of it): moved right (vertical) or down
// (horizontal) past its values and title when they are on its left / top side
export function barOffset(b: ColorbarSpec, curve: Curve, lo: number, hi: number, defaults: TextDefaults): [number, number] {
  if (b.side !== 'start') return [0, 0];
  const r = barReach(b, curve, lo, hi, defaults, !!barTitle(b, curve));
  return b.orientation === 'vertical' ? [r.before, 0] : [0, r.before];
}
