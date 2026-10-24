// The nodes Waveform measurements, Step detection and Event averaging: every Y with its X, in every range drawn on the
// graph (none: all X), measured by signal2.ts; their tables, their graph (the data with the edges, the steps or the
// triggers marked; the average on its own axis). Pure.
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import { averageAround, binseg, crossingsOf, noiseSigma, pelt, stateLevels, waveform, type CostKind, type Edge } from './signal2.ts';
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
      summary.push({
        Run: run.label,
        Range: where,
        Base: w.base,
        Top: w.top,
        Amplitude: w.amp,
        Mean: w.mean,
        RMS: w.rms,
        'AC RMS': w.acRms,
        'Peak to peak': w.pp,
        'Crest factor': w.crest,
        Period: w.period,
        Frequency: 1 / w.period,
        '+ width': w.posWidth,
        '− width': w.negWidth,
        'Duty cycle (%)': w.duty,
        'Rise time': avg(rises, (e) => e.dur),
        'Fall time': avg(falls, (e) => e.dur),
        'Overshoot (%)': avg(rises, (e) => e.overshoot),
        'Undershoot (%)': avg(falls, (e) => e.overshoot),
        'Settling time': avg(w.edges, (e) => e.settle),
        Rises: rises.length,
        Falls: falls.length,
        'Mean crossings': w.crossings,
      });
      w.edges.forEach((e, j) => {
        edgeRows.push({ Run: run.label, Range: where, Edge: j + 1, Kind: e.kind === 'rise' ? 'rising' : 'falling', Time: e.t, [`${d.lo}–${d.hi} % time`]: e.dur, [e.kind === 'rise' ? 'Overshoot (%)' : 'Undershoot (%)']: e.overshoot, 'Settling time': e.settle, 'To the next edge': j + 1 < w.edges.length ? w.edges[j + 1].t - e.t : NaN });
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
  return { tables: { out: table('waveform', summary), edges: table('edges', edgeRows, { Time: 'x' }) }, view, warnings, report };
}

// ---- Step detection ----
// cost: a change of the mean, or of the mean and the variance; penalty: BIC, AIC, or a factor × σ² ln n (mean) or
// × ln n (mean and variance); count (binary segmentation): so many changes (0: by the penalty)
export type StepsData = RegionSpec & { cost: CostKind; method: 'pelt' | 'binseg'; penalty: 'bic' | 'aic' | 'manual'; factor: number; minSize: number; count: number };
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
  runs.forEach((run, k) => {
    const marks: NonNullable<RegionView['marks']>[number] = [];
    const notes: string[] = [];
    const fx: number[] = [];
    const fy: number[] = [];
    for (const part of run.parts) {
      const { x, y } = ptsOf(run, part.rows);
      const N = y.length;
      if (N < 2 * Math.max(1, d.minSize)) continue;
      const s2 = noiseSigma(y) ** 2;
      const pen = d.cost === 'mean' ? (d.penalty === 'bic' ? 2 * s2 * Math.log(N) : d.penalty === 'aic' ? 4 * s2 : d.factor * s2 * Math.log(N)) : d.penalty === 'bic' ? 3 * Math.log(N) : d.penalty === 'aic' ? 6 : d.factor * Math.log(N);
      const cps = d.method === 'binseg' ? binseg(y, d.cost, pen, Math.max(1, d.minSize), d.count > 0 ? d.count : Infinity) : pelt(y, d.cost, pen, Math.max(1, d.minSize));
      const bounds = [0, ...cps, N];
      const where = part.index < 0 ? 'all X' : regionName(part.index);
      let prevMean = NaN;
      for (let s = 0; s + 1 < bounds.length; s++) {
        const [a, b] = [bounds[s], bounds[s + 1]];
        const seg = y.slice(a, b);
        const m = seg.reduce((q, v) => q + v, 0) / seg.length;
        const sd = Math.sqrt(seg.reduce((q, v) => q + (v - m) ** 2, 0) / Math.max(1, seg.length - 1));
        // (a segment from its first X to the X where the next begins)
        const x0 = x[a];
        const x1 = b < N ? x[b] : x[N - 1];
        segRows.push({ Run: run.label, Range: where, Segment: s + 1, Start: x0, End: x1, Duration: x1 - x0, Mean: m, SD: sd, Points: seg.length });
        for (let i = a; i < b; i++) fits[k][part.rows[i]] = m;
        fx.push(x0, x1, NaN);
        fy.push(m, m, NaN);
        if (s > 0) {
          stepRows.push({ Run: run.label, Range: where, Step: s, At: x0, 'Step size': m - prevMean, 'Dwell before': segRows[segRows.length - 2].Duration as number });
          marks.push({ x: x0, y: m, color: m > prevMean ? '#2ca02c' : '#d62728', down: m > prevMean });
        }
        prevMean = m;
      }
      notes.push(`${part.index < 0 ? '' : `${where}: `}${cps.length} change${cps.length === 1 ? '' : 's'}, ${cps.length + 1} levels; noise σ ${fmt(Math.sqrt(s2))}`);
      report.push(`${run.label}${part.index < 0 ? '' : ` (${where})`}: ${cps.length} change${cps.length === 1 ? '' : 's'} (${d.method === 'pelt' ? 'PELT' : 'binary segmentation'}, ${d.penalty === 'manual' ? `penalty × ${d.factor}` : d.penalty.toUpperCase()}); the noise σ ${fmt(Math.sqrt(s2))}.`);
    }
    view.base.push({ x: fx, y: fy });
    view.marks!.push(marks);
    view.notes!.push(notes);
  });
  if (!segRows.length) return { error: 'Too few points for the minimum segment.' };
  const cols: Column[] = [];
  runs.forEach((run, k) => {
    if (k === 0 || run.X !== runs[k - 1].X) cols.push({ ...run.X, role: 'x' });
    cols.push({ ...run.Y, role: 'y' }, { ...column(`steps (${run.Y.name})`, fits[k]), role: 'y' });
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
    let trig: number[];
    if (d.trigger === 'rising' || d.trigger === 'falling') trig = crossingsOf(x, y, level, d.trigger, d.gap > 0 ? d.gap : 0).filter(inRange);
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
    if (!N) {
      warnings.push(`${run.label}: no event with its whole window inside the data (${trig.length} trigger${trig.length === 1 ? '' : 's'} found).`);
      plots.push({ result: { x: [], y: [] }, xName: 'Lag', yName: run.label });
      view.marks!.push([]);
      view.notes!.push([]);
      return;
    }
    const spread = d.spread === 'se' ? av.se : av.sd;
    plots.push({
      result: { x: av.lag, y: av.mean },
      others: av.segs.slice(0, 60).map((s) => ({ x: av.lag, y: s })),
      band: { x: av.lag, lo: av.mean.map((m, j) => m - spread[j]), hi: av.mean.map((m, j) => m + spread[j]) },
      xName: `Lag (${run.X.name})`,
      yName: `${run.label} (mean of ${N})`,
      zero: true,
    });
    view.marks!.push(trig.map((t) => ({ x: t, y: level, color: av.used.includes(t) ? '#2ca02c' : '#b4b4b4', down: true })));
    view.segments!.push([{ x0: x[0], y0: level, x1: x[x.length - 1], y1: level, color: '#8c564b' }]);
    view.notes!.push([`${N} of ${trig.length} events averaged, window −${fmt(before)} … ${fmt(after)}`]);
    const many = runs.length > 1;
    const sfx = many ? ` (${run.label})` : '';
    outCols.push({ ...column(`Lag${sfx}`, Float64Array.from(av.lag)), role: 'x' }, { ...column(`Mean${sfx}`, Float64Array.from(av.mean)), role: 'y' }, { ...column(`${d.spread === 'se' ? 'SE' : 'SD'}${sfx}`, Float64Array.from(spread)), role: 'yerr' }, { ...column(`N${sfx}`, Float64Array.from(av.n)), role: 'none' });
    segCols.push({ ...column(`Lag${sfx}`, Float64Array.from(av.lag)), role: 'x' }, ...av.segs.map((s, j): Column => ({ ...column(`Event ${j + 1}${sfx}`, Float64Array.from(s)), role: 'y' })));
    trig.forEach((t, j) => trigRows.push({ Run: run.label, Event: j + 1, Time: t, Averaged: av.used.includes(t) ? 'yes' : 'no (window outside the data)' }));
    report.push(`${run.label}: ${N} events averaged (of ${trig.length} found${d.trigger === 'rising' || d.trigger === 'falling' ? ` at ${fmt(level)}, ${d.trigger}` : ''}); window −${fmt(before)} to +${fmt(after)}${d.baseline ? ', the baseline before 0 taken off' : ''}.`);
  });
  if (!outCols.length) return { error: 'No event could be averaged: check the trigger and the window.' };
  return { tables: { out: { name: 'average', columns: outCols }, segments: { name: 'segments', columns: segCols }, triggers: table('triggers', trigRows) }, view, plots, labels: runs.map((r) => r.label), warnings, report };
}
