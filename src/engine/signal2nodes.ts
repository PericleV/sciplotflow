// The nodes Waveform measurements, Step detection and Event averaging: every Y with its X, in every range drawn on the
// graph (none: all X), measured by signal2.ts; their tables, their graph (the data with the edges, the steps or the
// triggers marked; the average on its own axis). Pure.
import { bareName, column, fmtNum, unitOf, withUnit, type Column, type Dataset } from './table.ts';
import { averageAround, binseg, crossingsOf, noiseEstimate, pelt, stateLevels, waveform, type CostKind, type Edge } from './signal2.ts';
import { regionRuns, runPoints, type RegionSpec, type RegionView, type Run } from './regionruns.ts';
import { regionName } from './calculus.ts';
import type { SignalPlot } from './signalnodes.ts';

type Row = Record<string, number | string>;
// a table from rows (text keys: a text column)
function table(name: string, rows: Row[], roles: Record<string, Column['role']> = {}): Dataset {
  const keys: string[] = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => !keys.includes(k) && keys.push(k)));
  return {
    name,
    columns: keys.map((k): Column => {
      const text = rows.some((r) => typeof r[k] === 'string');
      const c = text ? column(k, new Float64Array(rows.length).fill(NaN), rows.map((r) => String(r[k] ?? ''))) : column(k, Float64Array.from(rows, (r) => (typeof r[k] === 'number' ? (r[k] as number) : NaN)));
      return { ...c, role: roles[k] ?? (text ? 'label' : 'none') };
    }),
  };
}
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? fmtNum(v, d) : 'n/a');
const ptsOf = (run: Run, rows: number[]) => ({ x: rows.map((i) => run.X.values[i]), y: rows.map((i) => run.Y.values[i]) });
type Out = { tables: Record<string, Dataset>; view: RegionView; plots?: SignalPlot[]; labels?: string[]; warnings: string[]; report: string[] } | { error: string } | { waiting: string };
// the units of the outputs: of the columns of all runs, their common one (else none: one table holds them all); a
// frequency's from that of X (Hz from s, kHz from ms …; else 1/unit)
const unitOfAll = (names: string[]) => {
  const u = names.map(unitOf);
  return u.every((v) => v === u[0]) ? u[0] : '';
};
const PER: Record<string, string> = { s: 'Hz', ms: 'kHz', µs: 'MHz', us: 'MHz', ns: 'GHz', ps: 'THz' };
const perUnit = (u: string) => (u ? (PER[u] ?? `1/${u}`) : '');

// ---- Waveform measurements ----
// levels: the base and the top from the histogram (IEEE 181), the minimum and maximum, or given; lo, hi: the reference
// levels (% of the amplitude); hyst: the hysteresis of the mid crossings (%); tol: the band of the settling (%)
export type WaveformData = RegionSpec & { levels: 'histogram' | 'minmax' | 'given'; base: number; top: number; lo: number; hi: number; hyst: number; tol: number };
export function waveformNode(ds: Dataset, d: WaveformData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: runs.map(() => null), lower: runs.map(() => null), lowerTitle: '', marks: [], segments: [], notes: [] };
  const summary: Row[] = [];
  const edgeRows: Row[] = [];
  const C = { rise: '#2ca02c', fall: '#d62728', level: '#8c564b' };
  const ux = unitOfAll(runs.map((r) => r.X.name));
  const uy = unitOfAll(runs.map((r) => r.Y.name));
  const [T, V] = [(nm: string) => withUnit(nm, ux), (nm: string) => withUnit(nm, uy)];
  runs.forEach((run) => {
    const marks: NonNullable<RegionView['marks']>[number] = [];
    const segs: NonNullable<RegionView['segments']>[number] = [];
    const notes: string[] = [];
    for (const part of run.parts) {
      const { x, y } = ptsOf(run, part.rows);
      if (x.length < 4) continue;
      const lv = d.levels === 'given' ? { base: d.base, top: d.top } : stateLevels(y, d.levels);
      if (!(lv.top !== lv.base)) {
        warnings.push(`${run.label}: the two levels are the same (a flat signal).`);
        continue;
      }
      const w = waveform(x, y, lv, d.lo / 100, d.hi / 100, d.hyst / 100, d.tol / 100);
      const rises = w.edges.filter((e) => e.kind === 'rise');
      const falls = w.edges.filter((e) => e.kind === 'fall');
      const avg = (es: Edge[], f: (e: Edge) => number) => {
        const v = es.map(f).filter(Number.isFinite);
        return v.length ? v.reduce((s, q) => s + q, 0) / v.length : NaN;
      };
      const where = part.index < 0 ? 'all X' : regionName(part.index);
      if (w.gaps) warnings.push(`${run.label}${part.index < 0 ? '' : ` (${where})`}: ${w.gaps} gap${w.gaps === 1 ? '' : 's'} in the data: the intervals across ${w.gaps === 1 ? 'it' : 'them'} left out (of the period, the widths, the mean and the RMS).`);
      summary.push({
        Run: run.label,
        Range: where,
        [V('Base')]: w.base,
        [V('Top')]: w.top,
        [V('Amplitude')]: w.amp,
        [V('Mean')]: w.mean,
        [V('RMS')]: w.rms,
        [V('AC RMS')]: w.acRms,
        [V('Peak to peak')]: w.pp,
        'Crest factor': w.crest,
        [T('Period')]: w.period,
        [withUnit('Frequency', perUnit(ux))]: 1 / w.period,
        [T('+ width')]: w.posWidth,
        [T('− width')]: w.negWidth,
        'Duty cycle (%)': w.duty,
        [T('Rise time')]: avg(rises, (e) => e.dur),
        [T('Fall time')]: avg(falls, (e) => e.dur),
        'Overshoot (%)': avg(rises, (e) => e.overshoot),
        'Undershoot (%)': avg(falls, (e) => e.overshoot),
        [T('Settling time')]: avg(w.edges, (e) => e.settle),
        Rises: rises.length,
        Falls: falls.length,
        'Mean crossings': w.crossings,
      });
      w.edges.forEach((e, j) => {
        edgeRows.push({ Run: run.label, Range: where, Edge: j + 1, Kind: e.kind === 'rise' ? 'rising' : 'falling', [T('Time')]: e.t, [T(`${d.lo}–${d.hi} % time`)]: e.dur, [e.kind === 'rise' ? 'Overshoot (%)' : 'Undershoot (%)']: e.overshoot, [T('Settling time')]: e.settle, [T('To the next edge')]: j + 1 < w.edges.length ? w.edges[j + 1].t - e.t : NaN });
        marks.push({ x: e.t, y: (w.base + w.top) / 2, color: e.kind === 'rise' ? C.rise : C.fall, down: e.kind === 'rise' });
        const [l1, l2] = e.kind === 'rise' ? [d.lo, d.hi] : [d.hi, d.lo];
        segs.push({ x0: e.tLo, y0: w.base + (l1 / 100) * w.amp, x1: e.tHi, y1: w.base + (l2 / 100) * w.amp, color: e.kind === 'rise' ? C.rise : C.fall });
      });
      segs.push({ x0: x[0], y0: w.base, x1: x[x.length - 1], y1: w.base, color: C.level }, { x0: x[0], y0: w.top, x1: x[x.length - 1], y1: w.top, color: C.level });
      notes.push(`${part.index < 0 ? '' : `${where}: `}period ${fmt(w.period)}, f ${fmt(1 / w.period)}, duty ${fmt(w.duty, 3)} %, rise ${fmt(avg(rises, (e) => e.dur))}, fall ${fmt(avg(falls, (e) => e.dur))}, overshoot ${fmt(avg(rises, (e) => e.overshoot), 3)} %`);
      report.push(`${run.label}${part.index < 0 ? '' : ` (${where})`}: base ${fmt(w.base)}, top ${fmt(w.top)}; ${rises.length} rising and ${falls.length} falling edges; period ${fmt(w.period)} (f = ${fmt(1 / w.period)}), duty cycle ${fmt(w.duty, 3)} %; rise time ${fmt(avg(rises, (e) => e.dur))}, fall time ${fmt(avg(falls, (e) => e.dur))}; RMS ${fmt(w.rms)}.`);
    }
    view.marks!.push(marks);
    view.segments!.push(segs);
    view.notes!.push(notes);
  });
  if (!summary.length) return { error: 'No part of the data could be measured (too few points, or a flat signal).' };
  return { tables: { out: table('waveform', summary), edges: table('edges', edgeRows, { [T('Time')]: 'x' }) }, view, warnings, report };
}

// ---- Step detection ----
// cost: a change of the mean, or of the mean and the variance; penalty: BIC, AIC, or a factor × σ² ln n (mean) or
// × ln n (mean and variance); count (binary segmentation): so many changes (0: by the penalty)
// withData: the input curves on the “fit” output too, each before its steps (absent: as older nodes, with them)
export type StepsData = RegionSpec & { withData?: boolean; cost: CostKind; method: 'pelt' | 'binseg'; penalty: 'bic' | 'aic' | 'manual'; factor: number; minSize: number; count: number };
export function stepsNode(ds: Dataset, d: StepsData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: [], baseName: 'steps', baseColor: '#d62728', lower: runs.map(() => null), lowerTitle: '', marks: [], notes: [] };
  const segRows: Row[] = [];
  const stepRows: Row[] = [];
  const fits = runs.map(() => new Float64Array(n).fill(NaN));
  const ux = unitOfAll(runs.map((r) => r.X.name));
  const uy = unitOfAll(runs.map((r) => r.Y.name));
  const [T, V] = [(nm: string) => withUnit(nm, ux), (nm: string) => withUnit(nm, uy)];
  const DUR = T('Duration');
  runs.forEach((run, k) => {
    const marks: NonNullable<RegionView['marks']>[number] = [];
    const notes: string[] = [];
    const fx: number[] = [];
    const fy: number[] = [];
    for (const part of run.parts) {
      const { x, y } = ptsOf(run, part.rows);
      const N = y.length;
      if (N < 2 * Math.max(1, d.minSize)) continue;
      // (the noise σ: from the MAD of the differences; on quantised data, where that is 0, from their SD)
      const noise = noiseEstimate(y);
      const s2 = Number.isFinite(noise.sigma) ? noise.sigma ** 2 : 0;
      const pen = d.cost === 'mean' ? (d.penalty === 'bic' ? 2 * s2 * Math.log(N) : d.penalty === 'aic' ? 4 * s2 : d.factor * s2 * Math.log(N)) : d.penalty === 'bic' ? 3 * Math.log(N) : d.penalty === 'aic' ? 6 : d.factor * Math.log(N);
      const cps = d.method === 'binseg' ? binseg(y, d.cost, pen, Math.max(1, d.minSize), d.count > 0 ? d.count : Infinity) : pelt(y, d.cost, pen, Math.max(1, d.minSize));
      const bounds = [0, ...cps, N];
      const where = part.index < 0 ? 'all X' : regionName(part.index);
      const who = `${run.label}${part.index < 0 ? '' : ` (${where})`}`;
      if (!(s2 > 0)) warnings.push(`${who}: the noise σ is 0 (the signal does not change from point to point): no penalty can be set from it.`);
      else if (noise.quantised) warnings.push(`${who}: quantised data (most neighbours equal): the noise σ estimated from the SD of the differences, not from their MAD (0).`);
      const sigmaText = s2 > 0 ? `${fmt(Math.sqrt(s2))}${noise.quantised ? ' (quantised data: from the SD of the differences)' : ''}` : '0 (a constant signal)';
      let prevMean = NaN;
      for (let s = 0; s + 1 < bounds.length; s++) {
        const [a, b] = [bounds[s], bounds[s + 1]];
        const seg = y.slice(a, b);
        const m = seg.reduce((q, v) => q + v, 0) / seg.length;
        const sd = Math.sqrt(seg.reduce((q, v) => q + (v - m) ** 2, 0) / Math.max(1, seg.length - 1));
        // (a segment from its first X to the X where the next begins)
        const x0 = x[a];
        const x1 = b < N ? x[b] : x[N - 1];
        segRows.push({ Run: run.label, Range: where, Segment: s + 1, [T('Start')]: x0, [T('End')]: x1, [DUR]: x1 - x0, [V('Mean')]: m, [V('SD')]: sd, Points: seg.length });
        for (let i = a; i < b; i++) fits[k][part.rows[i]] = m;
        fx.push(x0, x1, NaN);
        fy.push(m, m, NaN);
        if (s > 0) {
          stepRows.push({ Run: run.label, Range: where, Step: s, [T('At')]: x0, [V('Step size')]: m - prevMean, [T('Dwell before')]: segRows[segRows.length - 2][DUR] as number });
          marks.push({ x: x0, y: m, color: m > prevMean ? '#2ca02c' : '#d62728', down: m > prevMean });
        }
        prevMean = m;
      }
      notes.push(`${part.index < 0 ? '' : `${where}: `}${cps.length} change${cps.length === 1 ? '' : 's'}, ${cps.length + 1} levels; noise σ ${sigmaText}`);
      report.push(`${who}: ${cps.length} change${cps.length === 1 ? '' : 's'} (${d.method === 'pelt' ? 'PELT' : 'binary segmentation'}, ${d.penalty === 'manual' ? `penalty × ${d.factor}` : d.penalty.toUpperCase()}); the noise σ ${sigmaText}.`);
    }
    view.base.push({ x: fx, y: fy });
    view.marks!.push(marks);
    view.notes!.push(notes);
  });
  if (!segRows.length) return { error: 'Too few points for the minimum segment.' };
  const cols: Column[] = [];
  runs.forEach((run, k) => {
    if (k === 0 || run.X !== runs[k - 1].X) cols.push({ ...run.X, role: 'x' });
    if (d.withData !== false) cols.push({ ...run.Y, role: 'y' });
    cols.push({ ...column(withUnit(`${bareName(run.Y.name) || run.Y.name} steps`, unitOf(run.Y.name)), fits[k]), role: 'y' });
  });
  return { tables: { out: table('segments', segRows), steps: table('steps', stepRows), fit: { name: 'step fit', columns: cols } }, view, warnings, report };
}

// ---- Event averaging ----
// trigger: the crossings of a level (rising, falling; NaN: the middle of the range), the first row of every mark in a
// column of marks (a number other than 0, or a text), times given; before, after: the window (NaN: from the spacing of the triggers); gap:
// the least time between two triggers; baseline: the mean before 0 taken off every segment
export type EventsData = RegionSpec & { trigger: 'rising' | 'falling' | 'column' | 'times'; level: number; markCol: string; times: string; before: number; after: number; gap: number; baseline: boolean; spread: 'sd' | 'se' };
export function eventsNode(ds: Dataset, d: EventsData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: runs.map(() => null), lower: runs.map(() => null), lowerTitle: '', marks: [], segments: [], notes: [] };
  const mc = d.trigger === 'column' ? ds.columns.find((c) => c.name === d.markCol) : undefined;
  if (d.trigger === 'column' && !mc) return { error: d.markCol ? `No column “${d.markCol}”.` : 'Choose the column of the marks (a number other than 0, or a text, where an event starts).' };
  const given = d.times
    .split(/[\s,;]+/)
    .map(Number)
    .filter(Number.isFinite);
  if (d.trigger === 'times' && !given.length) return { waiting: 'Write the times of the events (e.g. 1.2, 3.4, 5.6).' };
  const plots: SignalPlot[] = [];
  const outCols: Column[] = [];
  const segCols: Column[] = [];
  const trigRows: Row[] = [];
  runs.forEach((run) => {
    const { x, y } = ptsOf(run, run.idx);
    const inRange = (t: number) => run.parts.some((p) => p.index < 0 || (t >= p.region.lo && t <= p.region.hi));
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of run.parts) for (const i of p.rows) [lo, hi] = [Math.min(lo, run.Y.values[i]), Math.max(hi, run.Y.values[i])];
    const level = Number.isFinite(d.level) ? d.level : (lo + hi) / 2;
    // (the hysteresis of a level trigger, as Waveform's: 5 % of the range, or 3 noise σ if more; within the range on
    // both sides of the level)
    const sigma = noiseEstimate(y).sigma;
    const hyst = Math.max(0, Math.min(Math.max(0.05 * (hi - lo), Number.isFinite(sigma) ? 3 * sigma : 0), 0.45 * Math.min(level - lo, hi - level)));
    const byLevel = d.trigger === 'rising' || d.trigger === 'falling';
    let trig: number[];
    if (d.trigger === 'rising' || d.trigger === 'falling') trig = crossingsOf(x, y, level, d.trigger, d.gap > 0 ? d.gap : 0, hyst).filter(inRange);
    else if (d.trigger === 'column') {
      // (a mark: the first of every run of marked rows, in the order of X)
      const on = (i: number) => (mc!.text?.[i]?.trim() ? true : Number.isFinite(mc!.values[i]) && mc!.values[i] !== 0);
      trig = run.idx.filter((i, j) => on(i) && (j === 0 || !on(run.idx[j - 1]))).map((i) => run.X.values[i]).filter(inRange);
    }
    else trig = given.filter(inRange);
    // (the window: given, else from the spacing of the triggers)
    const gaps = trig.slice(1).map((t, j) => t - trig[j]).sort((a, b) => a - b);
    const med = gaps.length ? gaps[gaps.length >> 1] : (x[x.length - 1] - x[0]) / 4;
    const before = Number.isFinite(d.before) && d.before >= 0 ? d.before : 0.2 * med;
    const after = Number.isFinite(d.after) && d.after > 0 ? d.after : 0.6 * med;
    const dx = x.slice(1).map((v, j) => v - x[j]).sort((a, b) => a - b)[(x.length - 1) >> 1] || 1;
    const av = averageAround(x, y, trig, before, after, dx, d.baseline);
    const N = av.segs.length;
    const [ux, uy] = [unitOf(run.X.name), unitOf(run.Y.name)];
    const nG = av.gapped.length;
    if (nG) warnings.push(`${run.label}: ${nG} event${nG === 1 ? '' : 's'} not averaged: a gap in the data inside ${nG === 1 ? 'its' : 'their'} window.`);
    if (!N) {
      warnings.push(`${run.label}: no event with its whole window inside the data${nG ? ' and no gap in it' : ''} (${trig.length} trigger${trig.length === 1 ? '' : 's'} found).`);
      plots.push({ result: { x: [], y: [] }, xName: withUnit('Lag', ux), yName: run.label });
      view.marks!.push([]);
      view.notes!.push([]);
      return;
    }
    const spread = d.spread === 'se' ? av.se : av.sd;
    plots.push({
      result: { x: av.lag, y: av.mean },
      others: av.segs.slice(0, 60).map((s) => ({ x: av.lag, y: s })),
      band: { x: av.lag, lo: av.mean.map((m, j) => m - spread[j]), hi: av.mean.map((m, j) => m + spread[j]) },
      xName: withUnit('Lag', ux),
      yName: withUnit(`${bareName(run.label) || run.label}, mean of ${N}`, uy),
      zero: true,
    });
    view.marks!.push(trig.map((t) => ({ x: t, y: level, color: av.used.includes(t) ? '#2ca02c' : '#b4b4b4', down: true })));
    view.segments!.push([{ x0: x[0], y0: level, x1: x[x.length - 1], y1: level, color: '#8c564b' }]);
    view.notes!.push([`${N} of ${trig.length} events averaged, window −${fmt(before)} … ${fmt(after)}`]);
    // (the names: the unit at the end, “Mean (µV)”; of several runs, “Mean, Response (µV)”)
    const many = runs.length > 1;
    const nm = (q: string, u: string) => withUnit(many ? `${q}, ${bareName(run.label) || run.label}` : q, u);
    outCols.push({ ...column(nm('Lag', ux), Float64Array.from(av.lag)), role: 'x' }, { ...column(nm('Mean', uy), Float64Array.from(av.mean)), role: 'y' }, { ...column(nm(d.spread === 'se' ? 'SE' : 'SD', uy), Float64Array.from(spread)), role: 'yerr' }, { ...column(nm('N', ''), Float64Array.from(av.n)), role: 'none' });
    segCols.push({ ...column(nm('Lag', ux), Float64Array.from(av.lag)), role: 'x' }, ...av.segs.map((s, j): Column => ({ ...column(nm(`Event ${j + 1}`, uy), Float64Array.from(s)), role: 'y' })));
    trig.forEach((t, j) => trigRows.push({ Run: run.label, Event: j + 1, [withUnit('Time', ux)]: t, Averaged: av.used.includes(t) ? 'yes' : av.gapped.includes(t) ? 'no (a gap in its window)' : 'no (window outside the data)' }));
    report.push(`${run.label}: ${N} events averaged (of ${trig.length} found${byLevel ? ` at ${fmt(level)}, ${d.trigger}, hysteresis ±${fmt(hyst)}` : ''}${nG ? `; ${nG} with a gap in the window left out` : ''}); window −${fmt(before)} to +${fmt(after)}${d.baseline ? ', the baseline before 0 taken off' : ''}.`);
  });
  if (!outCols.length) return { error: 'No event could be averaged: check the trigger and the window.' };
  return { tables: { out: { name: 'average', columns: outCols }, segments: { name: 'segments', columns: segCols }, triggers: table('triggers', trigRows) }, view, plots, labels: runs.map((r) => r.label), warnings, report };
}
