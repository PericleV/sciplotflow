// The geometry of an Axes: its scales, the ticks and numbers of every side, how far the numbers and titles reach out of
// the frame, and the frame placed automatically inside its area (margins made just large enough). Pure: the drawing
// and the evaluation (also in the scripts) use the same measures.
import { compile } from '../engine/expr.ts';
import { bareName, titleOf, unitOf } from '../engine/table.ts';
import { richMetrics } from './draw.ts';
import { axisRange, formatLabels, inBreak, logitT, logitTi, parseBreaks, probT, probTi, probValid, symT, symTi, ticks, ticksMode } from './ticks.ts';
import { legendLayout } from './legendLayout.ts';
import { barReach, barTitle } from './colorbar.ts';
import { axisKind, resolveText, type Anchor, type LegendSpec, type AxesFig, type AxisSpec, type Curve, type Placement, type Side, type SideStyle, type TextDefaults } from './spec.ts';
import { maxOf } from '../engine/minmax.ts';

export type Box = { x: number; y: number; w: number; h: number };

// ---- scales ----
// f: value → position (pt); seg: which visible piece of a broken axis a value is on; gaps: the breaks, as position
// intervals along the axis.
export type Scale = { f: (v: number) => number; inv: (p: number) => number; lo: number; hi: number; spec: AxisSpec; seg: (v: number) => number; gaps: [number, number][] };
export function makeScale(spec: AxisSpec, lo: number, hi: number, p0: number, p1: number): Scale {
  const t = (v: number) => (spec.scale === 'log' ? Math.log10(v) : spec.scale === 'reciprocal' ? 1 / v : spec.scale === 'probability' ? probT(spec.prob, v) : spec.scale === 'symlog' ? symT(spec, v) : spec.scale === 'logit' ? logitT(v) : v);
  const ti = (u: number) => (spec.scale === 'log' ? 10 ** u : spec.scale === 'reciprocal' ? 1 / u : spec.scale === 'probability' ? probTi(spec.prob, u) : spec.scale === 'symlog' ? symTi(spec, u) : spec.scale === 'logit' ? logitTi(u) : u);
  const [a, b] = [t(lo), t(hi)];
  const [s0, s1] = spec.reverse ? [p1, p0] : [p0, p1];
  const brk = spec.scale === 'reciprocal' || spec.scale === 'probability' || spec.scale === 'logit' ? [] : parseBreaks(spec.breaks).filter(([u, w]) => u > Math.min(lo, hi) && w < Math.max(lo, hi));
  if (!brk.length) return { lo, hi, spec, f: (v) => s0 + ((t(v) - a) / (b - a || 1)) * (s1 - s0), inv: (p) => ti(a + ((p - s0) / (s1 - s0 || 1)) * (b - a)), seg: () => 0, gaps: [] };
  // the visible pieces, each as long as its share of the range; a gap between two pieces
  const edges = [lo, ...brk.flat(), hi].map(t);
  const pieces: [number, number][] = [];
  for (let k = 0; k < edges.length; k += 2) pieces.push([edges[k], edges[k + 1]]);
  const total = pieces.reduce((s, [u, w]) => s + (w - u), 0) || 1;
  const len = s1 - s0;
  const gap = (Math.max(0.5, spec.breakGap ?? 3) / 100) * len;
  const avail = len - gap * brk.length;
  const starts: number[] = [];
  let acc = s0;
  for (const [u, w] of pieces) {
    starts.push(acc);
    acc += ((w - u) / total) * avail + gap;
  }
  const seg = (v: number) => {
    const tv = t(v);
    for (let k = 0; k < pieces.length; k++) if (tv >= pieces[k][0] - 1e-12 * Math.abs(total) && tv <= pieces[k][1] + 1e-12 * Math.abs(total)) return k;
    return -1;
  };
  const f = (v: number) => {
    const k = seg(v);
    if (k < 0) return NaN;
    return starts[k] + ((t(v) - pieces[k][0]) / total) * avail;
  };
  const gaps = pieces.slice(0, -1).map((p, k): [number, number] => {
    const end = starts[k] + ((p[1] - p[0]) / total) * avail;
    return [Math.min(end, end + gap), Math.max(end, end + gap)];
  });
  // position → value: on the piece the position falls on (or the nearest one)
  const inv = (p: number) => {
    let best = 0;
    let dist = Infinity;
    pieces.forEach((pc, k) => {
      const e = starts[k] + ((pc[1] - pc[0]) / total) * avail;
      const d = Math.max(0, Math.min(starts[k], e) - p, p - Math.max(starts[k], e));
      if (d < dist) [best, dist] = [k, d];
    });
    return ti(pieces[best][0] + ((p - starts[best]) / avail) * total);
  };
  return { lo, hi, spec, f, inv, seg, gaps };
}
export const validFor = (spec: AxisSpec, v: number) => Number.isFinite(v) && (spec.scale !== 'log' || v > 0) && (spec.scale !== 'reciprocal' || v !== 0) && (spec.scale !== 'probability' || probValid(v)) && (spec.scale !== 'logit' || (v > 0 && v < 1)) && !inBreak(spec, v);

// The range of the data of the curves on an axis (with their errors). Kept per curve: the automatic margins and the
// drawing ask for it several times (the curve objects change when their data or style do).
const extents = new WeakMap<Curve, Map<string, [number, number]>>();
export function extent(curves: Curve[], axis: 'x' | 'y', spec: AxisSpec): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  const key = `${axis}|${spec.scale}|${spec.breaks ?? ''}`;
  for (const c of curves) {
    let m = extents.get(c);
    if (!m) extents.set(c, (m = new Map()));
    let r = m.get(key);
    if (!r) m.set(key, (r = curveExtent(c, axis, spec)));
    lo = Math.min(lo, r[0]);
    hi = Math.max(hi, r[1]);
  }
  return [lo, hi];
}
function curveExtent(c: Curve, axis: 'x' | 'y', spec: AxisSpec): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  if (c.boxes) {
    const hor = !!c.boxes.horizontal;
    for (const it of c.boxes.items)
      for (const w of (axis === 'x') !== hor ? [it.pos - it.half, it.pos + it.half, ...(it.box ? [it.box.at - it.box.half, it.box.at + it.box.half] : [])] : [it.vlo, it.vhi])
        if (Number.isFinite(w) && validFor(spec, w)) [lo, hi] = [Math.min(lo, w), Math.max(hi, w)];
    return [lo, hi];
  }
  if (c.bars) {
    const b = c.bars;
    const y = c.series.y.values;
    for (let i = 0; i < y.length; i++)
      for (const w of (axis === 'x') !== !!b.horizontal ? [b.lo[i], b.hi[i]] : [b.base[i], b.horizontal ? c.series.x.values[i] : y[i]])
        if (Number.isFinite(w) && validFor(spec, w)) [lo, hi] = [Math.min(lo, w), Math.max(hi, w)];
    // the error bars reach further
    if (b.err)
      for (let i = 0; i < y.length; i++) {
        if ((axis === 'y') !== !b.horizontal) continue;
        const v = b.horizontal ? c.series.x.values[i] : y[i];
        for (const w of [v + (b.err.plus[i] || 0), v - (b.err.minus[i] || 0)]) if (Number.isFinite(w) && validFor(spec, w)) [lo, hi] = [Math.min(lo, w), Math.max(hi, w)];
      }
    return [lo, hi];
  }
  {
    const s = c.series;
    const v = axis === 'x' ? s.x.values : s.y.values;
    const e = axis === 'y' ? s.yErr?.values : s.xErr?.values;
    const eLo = axis === 'y' ? (s.yErrLo ?? s.yErr)?.values : s.xErr?.values;
    const dir = axis === 'x' && !c.style.errX.same ? c.style.errX.dir : c.style.errDir;
    // a linear axis without breaks: any finite value (no call per point — a million points measured fast)
    const plainAxis = spec.scale === 'linear' && !parseBreaks(spec.breaks).length;
    const [xs, ys] = [s.x.values, s.y.values];
    const take = (w: number) => {
      if (plainAxis ? !Number.isFinite(w) : !validFor(spec, w)) return;
      if (w < lo) lo = w;
      if (w > hi) hi = w;
    };
    for (let i = 0; i < v.length; i++) {
      if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) continue;
      if (!e && !eLo) {
        take(v[i]);
        continue;
      }
      const err = e && Number.isFinite(e[i]) ? Math.abs(e[i]) : 0;
      const errLo = eLo && Number.isFinite(eLo[i]) ? Math.abs(eLo[i]) : 0;
      take(v[i] - (dir === 'plus' ? 0 : errLo));
      take(v[i] + (dir === 'minus' ? 0 : err));
    }
  }
  return [lo, hi];
}

// ---- ticks of a side ----
export type SideTicks = { major: number[]; labels: string[]; minor: number[]; common?: string; gaps?: [number, number][] };

// Ticks of an axis that is a function of the opposite one (e.g. eV over nm): nice values of f placed where f(x) = value.
function functionTicks(fn: string, base: Scale, spec: AxisSpec, side: SideStyle, count: number): SideTicks | null {
  const c = compile(fn);
  if (typeof c === 'string' || c.names.some((v) => v !== 'x')) return null;
  const f = (x: number) => c.fn({ x });
  const [fa, fb] = [f(base.lo), f(base.hi)];
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa === fb) return null;
  const [a, b] = [Math.min(fa, fb), Math.max(fa, fb)];
  const tk = ticks({ ...spec, scale: 'linear' }, a, b, count);
  const inv = (v: number) => {
    // bisection: f is monotonic over the range of the axis
    let [p, q] = [base.lo, base.hi];
    const up = fb > fa;
    for (let k = 0; k < 60; k++) {
      const m = (p + q) / 2;
      if (f(m) < v === up) p = m;
      else q = m;
    }
    return (p + q) / 2;
  };
  const inside = (v: number) => v >= a - 1e-9 * (b - a) && v <= b + 1e-9 * (b - a);
  const keep = tk.major.map((v, k) => ({ v, k })).filter((o) => inside(o.v));
  const fmt = formatLabels(keep.map((o) => o.v), false, side);
  return { major: keep.map((o) => inv(o.v)), labels: keep.map((o, j) => tk.labels?.[o.k] || fmt.labels[j]), minor: tk.minor.filter(inside).map(inv), common: fmt.common };
}

// a label on every N-th major tick only (the ticks stay)
export const thin = (labels: string[], every: number | undefined) => (every && every > 1 ? labels.map((l, k) => (k % Math.floor(every) === 0 ? l : '')) : labels);

// A label broken into lines of about n characters at its spaces (\\ a new line); a text with markup left as it is.
export function wrapLabel(s: string, n: number | undefined): string {
  if (!n || n < 1 || s.length <= n || /[\\{}]/.test(s)) return s;
  const lines: string[] = [];
  let cur = '';
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (cur && cur.length + 1 + w.length > n) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\\\\');
}

// The extent of a text turned by deg degrees: across a horizontal axis (its height) or a vertical one (its width).
export const turnedExtent = (w: number, h: number, deg: number, horiz: boolean) => {
  const r = (deg * Math.PI) / 180;
  return horiz ? Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r)) : Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
};

function sideTicks(scale: Scale, side: SideStyle, count: number): SideTicks {
  const [a, b] = [Math.min(scale.lo, scale.hi), Math.max(scale.lo, scale.hi)];
  const tk = ticks(scale.spec, a, b, count);
  const inside = (v: number) => v >= a - 1e-9 * (b - a) && v <= b + 1e-9 * (b - a) && !inBreak(scale.spec, v);
  const keep = tk.major.map((v, k) => ({ v, k })).filter((o) => inside(o.v));
  const major = keep.map((o) => o.v);
  const fmt = formatLabels(major, scale.spec.scale === 'log', side);
  return { major, labels: thin(keep.map((o, j) => wrapLabel(tk.labels?.[o.k] || fmt.labels[j], side.wrap)), scale.spec.labelEvery), minor: tk.minor.filter(inside), common: fmt.common, gaps: scale.gaps };
}

// Automatic ticks made fewer while their numbers would touch (a small frame, an inset), then their numbers on every
// second tick: only when the ticks are automatic, the numbers shown and not turned; otherwise as asked.
function roomyTicks(scale: Scale, side: SideStyle, count: number, horiz: boolean, defaults: TextDefaults): SideTicks {
  let t = sideTicks(scale, side, count);
  if (ticksMode(scale.spec) !== 'auto' || !side.labels || side.rotation % 360 !== 0) return t;
  const lt = resolveText(side.labelText, defaults);
  // a probability axis: every tick and grid line of the dense set kept, its numbers by importance (50, 10, 90, 1, 99,
  // 5 …), each where it does not touch one kept before — a probability paper
  if (scale.spec.scale === 'probability') {
    const dense = sideTicks(scale, side, 12);
    const PRI = [50, 10, 90, 1, 99, 5, 95, 20, 80, 30, 70, 2, 98, 40, 60, 0.1, 99.9, 0.5, 99.5, 0.01, 99.99, 0.05, 99.95];
    const rank = (v: number) => {
      const k = PRI.findIndex((p) => Math.abs(p - v) < 1e-9);
      return k < 0 ? PRI.length : k;
    };
    const order = dense.major.map((_, k) => k).filter((k) => dense.labels[k] && Number.isFinite(scale.f(dense.major[k]))).sort((a, b) => rank(dense.major[a]) - rank(dense.major[b]));
    const half = (k: number) => (horiz ? richMetrics(dense.labels[k], lt).width / 2 + 0.2 * lt.size : 0.55 * lt.size);
    const kept: number[] = [];
    for (const k of order) if (kept.every((j) => Math.abs(scale.f(dense.major[j]) - scale.f(dense.major[k])) >= half(j) + half(k))) kept.push(k);
    return { ...dense, labels: dense.labels.map((l, k) => (kept.includes(k) ? l : '')) };
  }
  const crowded = (q: SideTicks) => {
    const shown = q.major.map((v, k) => ({ p: scale.f(v), label: q.labels[k] ?? '' })).filter((o) => o.label && Number.isFinite(o.p));
    for (let k = 1; k < shown.length; k++) {
      const [a, b] = [shown[k - 1], shown[k]];
      const need = horiz ? (richMetrics(a.label, lt).width + richMetrics(b.label, lt).width) / 2 + 0.4 * lt.size : 1.1 * lt.size;
      if (Math.abs(b.p - a.p) < need) return true;
    }
    return false;
  };
  // fewer ticks while three numbers at least remain, then a number on every second (third …) tick
  const numbers = (q: SideTicks) => q.labels.filter(Boolean).length;
  for (let n = count - 1; n >= 1 && crowded(t); n--) {
    const next = sideTicks(scale, side, n);
    if (numbers(next) < 3) break;
    t = next;
  }
  const all = t.labels;
  for (let k = 2; k <= 6 && crowded(t); k++) t = { ...t, labels: all.map((l, j) => (j % k === 0 ? l : '')) };
  return t;
}

// The title of an axis from its curves' columns: one name when they share it (“Time (s)” and its copy “Time (s) (2)”, or
// “B (mM)” and “fit of B (mM)”: the first); else, of up to 3 quantities, their names — with the unit once when they
// share it (“Control, Treated (mg/L)”); of more, “Value (unit)” when they share one, else the first name.
export function autoTitle(curves: Curve[], axis: 'x' | 'y'): string {
  const all = curves.filter((c) => !c.noLegend && !c.keyEntry).map((c) => titleOf(axis === 'x' ? c.series.x : c.series.y));
  if (!all.length) return curves[0] ? titleOf(axis === 'x' ? curves[0].series.x : curves[0].series.y) : '';
  // a copy's “ (2)” left out
  const strip = (n: string) => {
    const m = /^(.*\S)\s\(\d+\)$/.exec(n);
    return m && (/[)\]]$/.test(m[1]) || all.includes(m[1])) ? m[1] : n;
  };
  const names = [...new Set(all.map(strip))];
  if (names.length === 1) return names[0];
  const base = bareName(names[0]).toLowerCase();
  if (base && names.every((n) => bareName(n).toLowerCase().includes(base))) return names[0];
  const units = [...new Set(names.map(unitOf))];
  const unit = units.length === 1 ? units[0] : '';
  if (names.length <= 3) return unit ? `${names.map(bareName).join(', ')} (${unit})` : names.join(', ');
  return unit ? `Value (${unit})` : names[0];
}

// One axis as drawn: where, its look, its ticks, its position function and its title.
// cross: where its line is (pt) when it crosses the frame at a value of the other axis
export type DrawnAxis = { key: string; side: Side; s: SideStyle; pos: SideTicks; f: (v: number) => number; title: string; cross?: number };

// The scales of an Axes in a frame (pt), the axis each curve is on, and every axis as drawn.
export function axesGeometry(ax: AxesFig, frame: Box, defaults: TextDefaults) {
  const st = ax.style;
  const topOwn = st.top.mode === 'own';
  const rightOwn = st.right.mode === 'own';
  const extraX = st.extra.filter((e) => axisKind(e.side) === 'x');
  const extraY = st.extra.filter((e) => axisKind(e.side) === 'y');
  // the axis each curve is on (an axis that does not exist: the bottom / left one)
  const xOf = (c: Curve) => (c.style.axisX === 'top' && topOwn ? 'top' : extraX.some((e) => e.id === c.style.axisX) ? c.style.axisX : 'bottom');
  const yOf = (c: Curve) => (c.style.axisY === 'right' && rightOwn ? 'right' : extraY.some((e) => e.id === c.style.axisY) ? c.style.axisY : 'left');
  const on = (id: string, axis: 'x' | 'y') => ax.curves.filter((c) => c.style.show !== false && (axis === 'x' ? xOf(c) : yOf(c)) === id);
  const range = (spec: AxisSpec, cs: Curve[], axis: 'x' | 'y') => axisRange(spec, ...extent(cs, axis, spec));
  const horiz = (spec: AxisSpec, cs: Curve[]) => makeScale(spec, ...range(spec, cs, 'x'), frame.x, frame.x + frame.w);
  const vert = (spec: AxisSpec, cs: Curve[]) => makeScale(spec, ...range(spec, cs, 'y'), frame.y + frame.h, frame.y);
  const scales = new Map<string, Scale>();
  scales.set('bottom', horiz(st.x, on('bottom', 'x')));
  scales.set('left', vert(st.y, on('left', 'y')));
  scales.set('top', topOwn ? horiz(st.top.scale, on('top', 'x')) : scales.get('bottom')!);
  scales.set('right', rightOwn ? vert(st.right.scale, on('right', 'y')) : scales.get('left')!);
  for (const e of extraX) scales.set(e.id, horiz(e.scale, on(e.id, 'x')));
  for (const e of extraY) scales.set(e.id, vert(e.scale, on(e.id, 'y')));
  const sBottom = scales.get('bottom')!;
  const sLeft = scales.get('left')!;
  const nx = Math.max(3, Math.round(frame.w / (resolveText(st.sides.bottom.labelText, defaults).size * 6)));
  const ny = Math.max(3, Math.round(frame.h / (resolveText(st.sides.left.labelText, defaults).size * 3.5)));
  const tb = roomyTicks(sBottom, st.sides.bottom, nx, true, defaults);
  const tl = roomyTicks(sLeft, st.sides.left, ny, false, defaults);
  const second = (k: 'top' | 'right'): SideTicks => {
    const sec = st[k];
    const base = k === 'top' ? sBottom : sLeft;
    const n = k === 'top' ? nx : ny;
    if (sec.mode === 'function') return functionTicks(sec.fn, base, sec.scale, st.sides[k], n) ?? { major: [], labels: [], minor: [] };
    if (sec.mode === 'own') return roomyTicks(scales.get(k)!, st.sides[k], n, k === 'top', defaults);
    const own = k === 'top' ? tb : tl;
    // names, times and the labels of the special scales: as on the opposite side
    const named = base.spec.cats?.length || base.spec.time || base.spec.scale === 'symlog' || base.spec.scale === 'logit' || (base.spec.scale === 'log' && base.spec.base && base.spec.base !== 10);
    if (named) return { ...own, gaps: base.gaps };
    const fmt = formatLabels(own.major, base.spec.scale === 'log', st.sides[k]);
    return { ...own, labels: thin(fmt.labels, base.spec.labelEvery), common: fmt.common, gaps: base.gaps };
  };
  // an axis crossing the frame at a value of the other one: its line there (inside the frame)
  const crossOf = (side: Side): { cross?: number } => {
    const v = st.sides[side].cross;
    if (v === undefined || !Number.isFinite(v)) return {};
    const p = side === 'bottom' || side === 'top' ? sLeft.f(v) : sBottom.f(v);
    if (!Number.isFinite(p)) return {};
    return { cross: side === 'bottom' || side === 'top' ? Math.min(frame.y + frame.h, Math.max(frame.y, p)) : Math.min(frame.x + frame.w, Math.max(frame.x, p)) };
  };
  // an axis in the colour of its first curve (its line, ticks, numbers, title)
  const tint = (s: SideStyle, id: string, axis: 'x' | 'y'): SideStyle => {
    const c = s.curveColor ? on(id, axis)[0]?.style.color : undefined;
    return c ? { ...s, color: c, labelText: { ...s.labelText, color: c }, titleText: { ...s.titleText, color: c } } : s;
  };
  const drawn: DrawnAxis[] = [
    { key: 'bottom', side: 'bottom', s: tint(st.sides.bottom, 'bottom', 'x'), pos: tb, f: sBottom.f, title: st.sides.bottom.title || autoTitle(on('bottom', 'x'), 'x'), ...crossOf('bottom') },
    { key: 'left', side: 'left', s: tint(st.sides.left, 'left', 'y'), pos: tl, f: sLeft.f, title: st.sides.left.title || autoTitle(on('left', 'y'), 'y'), ...crossOf('left') },
    { key: 'top', side: 'top', s: topOwn ? tint(st.sides.top, 'top', 'x') : st.sides.top, pos: second('top'), f: scales.get('top')!.f, title: st.sides.top.title || (topOwn ? autoTitle(on('top', 'x'), 'x') : ''), ...crossOf('top') },
    { key: 'right', side: 'right', s: rightOwn ? tint(st.sides.right, 'right', 'y') : st.sides.right, pos: second('right'), f: scales.get('right')!.f, title: st.sides.right.title || (rightOwn ? autoTitle(on('right', 'y'), 'y') : ''), ...crossOf('right') },
    ...st.extra.map((e): DrawnAxis => {
      const sc = scales.get(e.id)!;
      const kind = axisKind(e.side);
      return { key: e.id, side: e.side, s: tint(e.style, e.id, kind), pos: roomyTicks(sc, e.style, kind === 'x' ? nx : ny, kind === 'x', defaults), f: sc.f, title: e.style.title || autoTitle(on(e.id, kind), kind) };
    }),
  ];
  return { scales, sBottom, sLeft, tb, tl, xOf, yOf, drawn };
}

// ---- how far an axis reaches out of the frame ----
const tickOut = (s: SideStyle, len: number) => (s.ticks === 'out' || s.ticks === 'both' ? len : 0);

// The numbers of a side as drawn (the first / last hidden when asked), their place along the axis and their size.
function shownLabels(a: DrawnAxis, defaults: TextDefaults) {
  const lt = resolveText(a.s.labelText, defaults);
  let shown = a.pos.major.map((v, k) => ({ v, label: a.pos.labels[k] ?? '' }));
  if (a.s.hideFirst) shown = shown.slice(1);
  if (a.s.hideLast) shown = shown.slice(0, -1);
  shown = shown.filter((l) => l.label);
  return { lt, shown, metrics: shown.map((l) => richMetrics(l.label, lt)) };
}

// How far the numbers reach away from the axis line (the drawing puts the title just beyond).
export function labelReach(a: DrawnAxis, defaults: TextDefaults): number {
  const s = a.s;
  const { lt, shown, metrics } = shownLabels(a, defaults);
  if (!s.labels || !shown.length) return 0;
  const horiz = a.side === 'bottom' || a.side === 'top';
  const rad = ((s.rotation % 360) * Math.PI) / 180;
  // turned: the length of the label across the axis and, of a label of several lines, their height
  if (horiz) return s.rotation % 360 ? maxOf(metrics.map((mt) => Math.abs(mt.width * Math.sin(rad)) + Math.max(lt.size * 0.8, mt.lines * mt.lineHeight * Math.abs(Math.cos(rad))))) : maxOf(metrics.map((mt) => mt.lines * mt.lineHeight - 0.2 * lt.size));
  return maxOf(metrics.map((mt) => (s.rotation % 360 ? Math.abs(mt.width * Math.cos(rad)) + Math.max(lt.size * 0.5, mt.lines * mt.lineHeight * Math.abs(Math.sin(rad))) : mt.width)));
}

// The room an axis needs outside the frame: away from its side (offset, ticks, numbers, title) and along it (the end
// numbers sticking out past the corners, the ×10ⁿ of the numbers).
function axisRoom(a: DrawnAxis, frame: Box, defaults: TextDefaults): Record<Side, number> {
  const s = a.s;
  const room: Record<Side, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  const horiz = a.side === 'bottom' || a.side === 'top';
  const { lt, shown, metrics } = shownLabels(a, defaults);
  const labels = s.labels && shown.length > 0;
  const tt = resolveText(s.titleText, defaults);
  const title = s.showTitle && a.title ? richMetrics(a.title, tt) : null;
  // crossing the frame: its numbers past the frame's edge only when it crosses near it, then the title
  if (a.cross !== undefined) {
    const edge = a.side === 'bottom' ? frame.y + frame.h : a.side === 'top' ? frame.y : a.side === 'left' ? frame.x : frame.x + frame.w;
    const reach = labels ? (s.ticks === 'none' ? 0 : tickOut(s, s.tickLen)) + s.labelGap + labelReach(a, defaults) : 0;
    room[a.side] = Math.max(0, reach - Math.abs(a.cross - edge)) + (title ? s.titleGap + title.lines * title.lineHeight : 0);
  } else {
    let out = Math.max(0, s.offset) + (s.ticks === 'none' ? 0 : tickOut(s, s.tickLen)) + (s.line ? s.lineWidth / 2 : 0);
    if (labels) out += s.labelGap + labelReach(a, defaults);
    if (title) out += s.titleGap + (Number.isFinite(s.titleRotation) ? turnedExtent(title.width, title.lines * title.lineHeight, s.titleRotation!, horiz) : title.lines * title.lineHeight);
    room[a.side] = out;
  }
  if (labels) {
    const rot = s.rotation % 360;
    // numbers beyond the ends of the axis
    shown.forEach((l, k) => {
      const p = a.f(l.v);
      if (!Number.isFinite(p)) return;
      if (horiz) {
        // turned: the label runs from its tick to one side (positive: to the right, negative: to the left)
        if (rot) {
          const along = Math.abs(metrics[k].width * Math.cos((rot * Math.PI) / 180));
          const toRight = (rot > 0) === (a.side === 'bottom');
          if (toRight) room.right = Math.max(room.right, p + along - (frame.x + frame.w));
          else room.left = Math.max(room.left, frame.x - (p - along));
          return;
        }
        const half = metrics[k].width / 2;
        room.left = Math.max(room.left, frame.x - (p - half));
        room.right = Math.max(room.right, p + half - (frame.x + frame.w));
      } else {
        const half = (metrics[k].lines * metrics[k].lineHeight) / 2;
        room.top = Math.max(room.top, frame.y - (p - half));
        room.bottom = Math.max(room.bottom, p + half - (frame.y + frame.h));
      }
    });
    if (a.pos.common) {
      const w = richMetrics(a.pos.common, lt).width;
      if (horiz) room.right = Math.max(room.right, 3 + w);
      else room.top = Math.max(room.top, 3 + lt.size * 1.1);
    }
  }
  return room;
}

// The colour bars of an Axes set outside its frame (in % of the frame): the room they take on that side.
function barRoom(ax: AxesFig, frame: Box, defaults: TextDefaults): Record<Side, number> {
  const room: Record<Side, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const a of ax.annotations) {
    if (a.kind !== 'colorbar' || !a.curve?.colorRange) continue;
    const b = a.bar;
    const [lo, hi] = a.curve.colorRange;
    const r = barReach(b, a.curve, lo, hi, defaults, !!barTitle(b, a.curve));
    const x = frame.x + (b.x / 100) * frame.w;
    const y = frame.y + (b.y / 100) * frame.h;
    const vert = b.orientation === 'vertical';
    const len = (b.length / 100) * (vert ? frame.h : frame.w);
    // the box of the bar with all it draws around it (x, y: its top-left corner, the values on the left / top included)
    const [x0, x1] = vert ? [x, x + r.before + b.thickness + r.after] : [x, x + len + r.atEnd];
    const [y0, y1] = vert ? [y - r.atStart, y + len] : [y, y + r.before + b.thickness + r.after];
    room.left = Math.max(room.left, frame.x - x0);
    room.right = Math.max(room.right, x1 - (frame.x + frame.w));
    room.top = Math.max(room.top, frame.y - y0);
    room.bottom = Math.max(room.bottom, y1 - (frame.y + frame.h));
  }
  return room;
}

// The room the axes of an Axes need outside its frame (numbers, titles, extra axes) and its colour bars set outside it.
export function axisNeeds(ax: AxesFig, frame: Box, defaults: TextDefaults): Record<Side, number> {
  const g = axesGeometry(ax, frame, defaults);
  const need: Record<Side, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const r of [...g.drawn.map((a) => axisRoom(a, frame, defaults)), barRoom(ax, frame, defaults)]) for (const k of Object.keys(need) as Side[]) need[k] = Math.max(need[k], r[k]);
  return need;
}

// ---- labels at the right end of curves (outside the frame) ----
// every end label: its text, colour, wanted y (pt) and height; placed past the right axis, moved apart so they do not
// overlap (kept inside the frame's height when they can be)
export function endLabels(ax: AxesFig, frame: Box, defaults: TextDefaults, need?: Record<Side, number>): { text: string; color: string; x: number; y: number; w: number; st: ReturnType<typeof resolveText> }[] {
  const cs = ax.curves.filter((c) => c.style.endLabel && c.style.show !== false && c.label);
  if (!cs.length) return [];
  const g = axesGeometry(ax, frame, defaults);
  const out = cs.flatMap((c) => {
    const sy = g.scales.get(g.yOf(c)) ?? g.sLeft;
    const ys = c.series.y.values;
    let k = ys.length - 1;
    while (k >= 0 && !Number.isFinite(ys[k])) k--;
    if (k < 0) return [];
    const st = resolveText({ ...c.style.labelText, color: c.style.labelText?.color || c.style.color }, defaults);
    const m = richMetrics(c.label, st);
    return [{ text: c.label, color: st.color, y: sy.f(ys[k]), h: m.lines * m.lineHeight, w: m.width, st }];
  });
  out.sort((a, b) => a.y - b.y);
  // apart: each at least its half height plus the next's from the one before; then all moved up if past the bottom
  for (let i = 1; i < out.length; i++) out[i].y = Math.max(out[i].y, out[i - 1].y + (out[i - 1].h + out[i].h) / 2);
  const over = out.length ? out[out.length - 1].y + out[out.length - 1].h / 2 - (frame.y + frame.h) : 0;
  if (over > 0) for (const o of out) o.y -= over;
  for (let i = out.length - 2; i >= 0; i--) out[i].y = Math.min(out[i].y, out[i + 1].y - (out[i].h + out[i + 1].h) / 2);
  const x = frame.x + frame.w + (need ? need.right : 0) + 3;
  return out.map((o) => ({ text: o.text, color: o.color, x, y: o.y, w: o.w, st: o.st }));
}

// ---- a legend placed by itself: where it covers the least of the data ----
// the places tried, in matplotlib's order for “best” (upper right first), 2 % in from the frame's edges
const BEST: [Anchor, number, number][] = [
  ['tr', 98, 2],
  ['tl', 2, 2],
  ['bl', 2, 98],
  ['br', 98, 98],
  ['cr', 98, 50],
  ['cl', 2, 50],
  ['bc', 50, 98],
  ['tc', 50, 2],
  ['c', 50, 50],
];
// the legends of an Axes with those marked auto put where the fewest points of its curves (their vertices and the
// middles of their segments, the areas of bars and boxes) fall inside them
export function placeLegends(ax: AxesFig, frame: Box, defaults: TextDefaults): LegendSpec[] {
  if (!ax.legends.some((lg) => lg.auto)) return ax.legends;
  const g = axesGeometry(ax, frame, defaults);
  const pts: [number, number][] = [];
  for (const c of ax.curves) {
    if (c.style.show === false) continue;
    const sx = g.scales.get(g.xOf(c)) ?? g.sBottom;
    const sy = g.scales.get(g.yOf(c)) ?? g.sLeft;
    const xs = c.series.x.values;
    const ys = c.series.y.values;
    const n = Math.min(xs.length, ys.length);
    const step = Math.max(1, Math.floor(n / 600));
    let prev: [number, number] | null = null;
    for (let i = 0; i < n; i += step) {
      const p: [number, number] = [sx.f(xs[i]), sy.f(ys[i])];
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        prev = null;
        continue;
      }
      pts.push(p);
      // a line: points along every segment, about one every 6 pt (a long straight line counts along all its length)
      if (prev && c.style.mode !== 'scatter') {
        const m = Math.min(40, Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 6));
        for (let k = 1; k < m; k++) pts.push([prev[0] + ((p[0] - prev[0]) * k) / m, prev[1] + ((p[1] - prev[1]) * k) / m]);
      }
      prev = p;
    }
    // bars, boxes and violins: their whole area (as a legend over a patch counts in matplotlib), points about 8 pt apart
    const area = (x0: number, x1: number, y0: number, y1: number) => {
      const clampX = (v: number) => (Number.isFinite(v) ? Math.min(frame.x + frame.w, Math.max(frame.x, v)) : frame.x + frame.w);
      const clampY = (v: number) => (Number.isFinite(v) ? Math.min(frame.y + frame.h, Math.max(frame.y, v)) : frame.y + frame.h);
      const [a, b] = [clampX(x0), clampX(x1)].sort((p, q) => p - q);
      const [u, w] = [clampY(y0), clampY(y1)].sort((p, q) => p - q);
      const nx = Math.min(16, Math.max(1, Math.round((b - a) / 8)));
      const ny = Math.min(16, Math.max(1, Math.round((w - u) / 8)));
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) pts.push([a + ((b - a) * i) / nx, u + ((w - u) * j) / ny]);
    };
    // error bars: points along them
    const along = (p: [number, number], q: [number, number]) => {
      if (![...p, ...q].every(Number.isFinite)) return;
      const m = Math.min(40, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 6));
      for (let k = 0; k <= m; k++) pts.push([p[0] + ((q[0] - p[0]) * k) / m, p[1] + ((q[1] - p[1]) * k) / m]);
    };
    if (c.bars) {
      const B = c.bars;
      for (let i = 0; i < B.lo.length; i++) {
        const v = B.horizontal ? xs[i] : ys[i];
        if (!Number.isFinite(v)) continue;
        if (B.horizontal) area(sx.f(B.base[i]), sx.f(v), sy.f(B.lo[i]), sy.f(B.hi[i]));
        else area(sx.f(B.lo[i]), sx.f(B.hi[i]), sy.f(B.base[i]), sy.f(v));
        const e = B.err;
        if (e) {
          const mid = (B.lo[i] + B.hi[i]) / 2;
          const [a, b] = [v - (e.minus[i] || 0), v + (e.plus[i] || 0)];
          if (B.horizontal) along([sx.f(a), sy.f(mid)], [sx.f(b), sy.f(mid)]);
          else along([sx.f(mid), sy.f(a)], [sx.f(mid), sy.f(b)]);
        }
      }
    } else if (c.series.yErr && !c.boxes) {
      const up = c.series.yErr.values;
      const lo = c.series.yErrLo?.values ?? up;
      for (let i = 0; i < n; i += step) if (Number.isFinite(up[i])) along([sx.f(xs[i]), sy.f(ys[i] - (lo[i] || 0))], [sx.f(xs[i]), sy.f(ys[i] + up[i])]);
    }
    if (c.boxes)
      for (const it of c.boxes.items) {
        if (!Number.isFinite(it.vlo) || !Number.isFinite(it.vhi)) continue;
        if (c.boxes.horizontal) area(sx.f(it.vlo), sx.f(it.vhi), sy.f(it.pos - it.half), sy.f(it.pos + it.half));
        else area(sx.f(it.pos - it.half), sx.f(it.pos + it.half), sy.f(it.vlo), sy.f(it.vhi));
      }
  }
  // the texts written in the frame (a fit's results, notes): their boxes, counted densely (a legend over them hides them)
  for (const an of ax.annotations) {
    if (an.kind !== 'text' || an.text.rotation) continue;
    const s = an.text;
    const t = resolveText(s.style, defaults);
    const m = richMetrics(s.text, t);
    const w = m.width + 2 * s.padding;
    const h = m.lines * m.lineHeight + 2 * s.padding;
    const x = s.coords === 'data' ? g.sBottom.f(s.x) : frame.x + (s.x / 100) * frame.w;
    const y = s.coords === 'data' ? g.sLeft.f(s.y) : frame.y + (s.y / 100) * frame.h;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const [x0, y0] = [x - FX[s.anchor] * w, y - FY[s.anchor] * h];
    for (let i = 0; i <= Math.ceil(w / 4); i++) for (let j = 0; j <= Math.ceil(h / 4); j++) pts.push([x0 + Math.min(w, i * 4), y0 + Math.min(h, j * 4)]);
  }
  return ax.legends.map((lg) => {
    if (!lg.auto) return lg;
    // too large for the frame (long texts: a trend line's equation): outside, under it
    const size = legendPlace(lg, frame, defaults);
    if (size.w > 0.55 * frame.w || size.h > 0.6 * frame.h) return { ...lg, anchor: 'tc', x: 50, y: 103 };
    let best = BEST[0];
    let least = Infinity;
    for (const cand of BEST) {
      const b = legendPlace({ ...lg, anchor: cand[0], x: cand[1], y: cand[2] }, frame, defaults);
      const inside = pts.filter(([x, y]) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2).length;
      if (inside < least) [least, best] = [inside, cand];
    }
    return { ...lg, anchor: best[0], x: best[1], y: best[2] };
  });
}

// ---- a legend outside the frame ----
const FX: Record<Anchor, number> = { tl: 0, cl: 0, bl: 0, tc: 0.5, c: 0.5, bc: 0.5, tr: 1, cr: 1, br: 1 };
const FY: Record<Anchor, number> = { tl: 0, tc: 0, tr: 0, cl: 0.5, c: 0.5, cr: 0.5, bl: 1, bc: 1, br: 1 };
// The box of a legend of an Axes (pt): at its place (% of the frame) and, when its centre is outside the frame, pushed
// out past the numbers and title of that side (need: the room of the axes) — a legend beside or under the plot.
export function legendPlace(lg: LegendSpec, frame: Box, defaults: TextDefaults, need?: Record<Side, number>): Box & { side: Side | null } {
  const L = legendLayout(lg, defaults);
  let x = frame.x + (lg.x / 100) * frame.w - FX[lg.anchor] * L.w;
  let y = frame.y + (lg.y / 100) * frame.h - FY[lg.anchor] * L.h;
  const [cx, cy] = [x + L.w / 2, y + L.h / 2];
  const over: Record<Side, number> = { left: frame.x - cx, right: cx - (frame.x + frame.w), top: frame.y - cy, bottom: cy - (frame.y + frame.h) };
  const side = (Object.keys(over) as Side[]).filter((k) => over[k] > 0).sort((a, b) => over[b] - over[a])[0] ?? null;
  if (side && need) {
    if (side === 'right') x += need.right;
    else if (side === 'left') x -= need.left;
    else if (side === 'bottom') y += need.bottom;
    else y -= need.top;
  }
  return { x, y, w: L.w, h: L.h, side };
}

// The frame placed inside `area` (pt) with margins just large enough for its axes (numbers, titles, extra axes),
// colour bars set outside the frame, legends outside it, and `pad` pt more all around. Two passes: the numbers depend
// on the frame size.
export function autoFrame(ax: AxesFig, area: Box, defaults: TextDefaults, pad = 3): Box {
  // a drawing: no axes, all of the area (it is fitted in it when drawn)
  if (ax.drawing) return { ...area };
  let frame: Box = { x: area.x + area.w * 0.15, y: area.y + area.h * 0.06, w: area.w * 0.8, h: area.h * 0.76 };
  for (let pass = 0; pass < 3; pass++) {
    const axisNeed = axisNeeds(ax, frame, defaults);
    const need = { ...axisNeed };
    // labels at the curves' right ends: past the right axis
    const ends = endLabels(ax, frame, defaults);
    if (ends.length) need.right = Math.max(need.right, axisNeed.right + 3 + Math.max(...ends.map((e) => e.w)) + 2);
    // a legend outside the frame: the room it reaches beyond it, on every side
    for (const lg of ax.legends) {
      if (!lg.curves.length && !lg.title) continue;
      const b = legendPlace(lg, frame, defaults, axisNeed);
      if (!b.side) continue;
      // the room on its side; along that side it may run past the frame, over the page's margins
      if (b.side === 'left') need.left = Math.max(need.left, frame.x - b.x + 2);
      if (b.side === 'right') need.right = Math.max(need.right, b.x + b.w - (frame.x + frame.w) + 2);
      if (b.side === 'top') need.top = Math.max(need.top, frame.y - b.y + 2);
      if (b.side === 'bottom') need.bottom = Math.max(need.bottom, b.y + b.h - (frame.y + frame.h) + 2);
    }
    const minW = area.w * 0.2;
    const minH = area.h * 0.2;
    const x = area.x + pad + need.left;
    const y = area.y + pad + need.top;
    frame = { x, y, w: Math.max(minW, area.w - 2 * pad - need.left - need.right), h: Math.max(minH, area.h - 2 * pad - need.top - need.bottom) };
  }
  // a fixed aspect (linear axes): the frame narrowed or lowered, centred where it was
  const a = ax.style.aspect;
  if (a && a > 0) {
    const g = axesGeometry(ax, frame, defaults);
    const ux = Math.abs(g.sBottom.hi - g.sBottom.lo);
    const uy = Math.abs(g.sLeft.hi - g.sLeft.lo);
    if (ux > 0 && uy > 0 && g.sBottom.spec.scale === 'linear' && g.sLeft.spec.scale === 'linear') {
      const h = (a * frame.w * uy) / ux;
      if (h <= frame.h) frame = { ...frame, y: frame.y + (frame.h - h) / 2, h };
      else {
        const w = (frame.h * ux) / (a * uy);
        frame = { ...frame, x: frame.x + (frame.w - w) / 2, w };
      }
    }
  }
  return frame;
}

// The insets placed in the frames of their hosts (in order: an inset of an inset after its host): the box from its
// place in the host's frame, the inset's frame inside it by the margins its axes need.
export function placeInsets(axes: AxesFig[], W: number, H: number, defaults: TextDefaults): AxesFig[] {
  const out = axes.slice();
  out.forEach((ax, k) => {
    const ins = ax.inset;
    const host = ins && out.find((a) => a.key === ins.host);
    if (!ins || !host) return;
    const hp = host.style.pos;
    let box = { x: hp.x + (ins.x / 100) * hp.w, y: hp.y + (ins.y / 100) * hp.h, w: (ins.w / 100) * hp.w, h: (ins.h / 100) * hp.h };
    // one picture (a Plot with a drawing over it): its proportions kept, centred in the box
    if (ins.aspect && ins.aspect > 0) {
      const [bw, bh] = [(box.w / 100) * W, (box.h / 100) * H];
      if (bw / bh > ins.aspect) box = { ...box, x: box.x + ((bw - bh * ins.aspect) / 2 / W) * 100, w: ((bh * ins.aspect) / W) * 100 };
      else box = { ...box, y: box.y + ((bh - bw / ins.aspect) / 2 / H) * 100, h: ((bw / ins.aspect) / H) * 100 };
    }
    const area = { x: (box.x / 100) * W, y: (box.y / 100) * H, w: (box.w / 100) * W, h: (box.h / 100) * H };
    const fx = ins.fixed;
    const f = fx ? { x: area.x + (fx.x / 100) * area.w, y: area.y + (fx.y / 100) * area.h, w: (fx.w / 100) * area.w, h: (fx.h / 100) * area.h } : autoFrame(ax, area, ax.text ?? defaults, 2);
    out[k] = { ...ax, inset: { ...ins, box }, style: { ...ax.style, pos: { x: (f.x / W) * 100, y: (f.y / H) * 100, w: (f.w / W) * 100, h: (f.h / H) * 100 } } };
  });
  return out;
}

// An Axes with its frame placed automatically inside `area` (% of a page W × H pt): its `pos` set.
export function placeAuto(ax: AxesFig, area: Placement, W: number, H: number, defaults: TextDefaults, pad?: number): AxesFig {
  const a: Box = { x: (area.x / 100) * W, y: (area.y / 100) * H, w: (area.w / 100) * W, h: (area.h / 100) * H };
  const f = autoFrame(ax, a, ax.text ?? defaults, pad);
  return { ...ax, style: { ...ax.style, pos: { x: (f.x / W) * 100, y: (f.y / H) * 100, w: (f.w / W) * 100, h: (f.h / H) * 100 } } };
}
