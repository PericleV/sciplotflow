// The Wavelet node: every Y with its X (evenly spaced), in the first range drawn on the graph (none: all of it), by one
// of five modes — the continuous transform (its power at every time and period with the cone of influence and the
// significance, the global spectrum, the power over a band of periods, the ridge), the coherence of two columns, the
// multiresolution analysis (the details and the smooth, a curve rebuilt from the levels chosen, the energy of every
// level), denoising, the peaks of a Ricker transform. Its tables, and its graphs: the data with what is drawn over it
// and the result below on the same X; the spectra on their own axis. Pure.
import { column, fmtNum, type Column, type Dataset } from './table.ts';
import { regionRuns, runPoints, type RegionSpec, type RegionView, type Run } from './regionruns.ts';
import { coherence, cwt, cwtSignificance, denoise, lag1, mother, mra, peaksCwt, scaleAverage, type MotherKind, type Threshold } from './wavelet2.ts';
import { WAVELET_FILTERS } from './waveletFilters.ts';
import type { SignalPlot } from './signalnodes.ts';

// mode; the transform: the mother wavelet (its ω0 or order: NaN, its usual one), the voices per octave, the periods
// from … to (NaN: from two steps of X to the record), the significance level against red or white noise, the band of
// the scale average (NaN: all); coherence: the second column; MRA and denoising: the wavelet, the levels, the parts
// rebuilt (“D1-D3, S”: empty all of them), the threshold, soft or hard, σ of every level; peaks: the widths (X units,
// NaN: automatic), the signal to noise, the noise percentile
export type WaveletData = RegionSpec & {
  mode: 'cwt' | 'coherence' | 'mra' | 'denoise' | 'peaks';
  mother: MotherKind;
  param: number;
  voices: number;
  pMin: number;
  pMax: number;
  level: number;
  noise: 'red' | 'white';
  band1: number;
  band2: number;
  y2: string;
  wavelet: string;
  levels: number;
  keep: string;
  rule: Threshold;
  thr: 'soft' | 'hard';
  perLevel: boolean;
  wMin: number;
  wMax: number;
  minSnr: number;
  noisePerc: number;
};
type Out = { tables: Record<string, Dataset>; view: RegionView; plots: SignalPlot[]; labels: string[]; warnings: string[]; report: string[] } | { error: string } | { waiting: string };
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? fmtNum(v, d) : 'n/a');
// the parts of the MRA to rebuild: “D1-D3, S” (empty: all)
function partsOf(text: string, J: number): { D: Set<number>; S: boolean } {
  if (!text.trim()) return { D: new Set(Array.from({ length: J }, (_, j) => j + 1)), S: true };
  const D = new Set<number>();
  let S = false;
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^d?(\d+)(?:\s*[-–]\s*d?(\d+))?$/i.exec(tok);
    if (/^(s|a|smooth)\d*$/i.test(tok)) S = true;
    else if (m) for (let k = Number(m[1]); k <= Number(m[2] ?? m[1]); k++) if (k >= 1 && k <= J) D.add(k);
  }
  return { D, S };
}

export function waveletNode(ds: Dataset, d: WaveletData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: [], lower: [], lowerTitle: '', marks: [], notes: [] };
  const plots: SignalPlot[] = [];
  const tables: Record<string, Dataset> = {};
  // (the points of the first range, X even)
  const segOf = (run: Run) => {
    const part = run.parts[0];
    const rows = part?.rows ?? run.idx;
    const x = rows.map((i) => run.X.values[i]);
    const y = rows.map((i) => run.Y.values[i]);
    const dx = x.slice(1).map((v, i) => v - x[i]);
    const s = [...dx].sort((a, b) => a - b);
    const dt = s[s.length >> 1] || 1;
    if (dx.some((v) => Math.abs(v - dt) > 0.01 * Math.abs(dt))) warnings.push(`${run.label}: X is not evenly spaced (taken as every ${fmt(dt)}).`);
    if (run.parts.length > 1) warnings.push(`${run.label}: the first range only (${run.parts.length} drawn).`);
    return { rows, x, y, dt };
  };
  const many = runs.length > 1;
  const sfx = (r: Run) => (many ? ` (${r.label})` : '');
  const outCols: Column[] = [];
  const xCol = (r: Run, rows: number[]): Column => ({ ...column(r.X.name + sfx(r), Float64Array.from(rows, (i) => r.X.values[i])), role: 'x' });

  if (d.mode === 'cwt' || d.mode === 'coherence') {
    const mo = mother(d.mode === 'coherence' ? 'morlet' : d.mother, Number.isFinite(d.param) ? d.param : undefined);
    const dj = 1 / Math.max(1, Math.round(d.voices));
    const yc = d.mode === 'coherence' ? ds.columns.find((c) => c.name === d.y2) : undefined;
    if (d.mode === 'coherence' && !yc) return { waiting: d.y2 ? `No column “${d.y2}”.` : 'Choose the second column (the coherence of every Y with it).' };
    let mapCols: Column[] | null = null;
    const glob: Column[] = [];
    runs.forEach((run, k) => {
      const { rows, x, y, dt } = segOf(run);
      if (y.length < 16) {
        warnings.push(`${run.label}: too few points (${y.length}).`);
        view.base.push(null);
        view.lower.push(null);
        return;
      }
      const s0 = Number.isFinite(d.pMin) && d.pMin > 0 ? d.pMin / mo.flambda : NaN;
      const S0 = Number.isFinite(s0) ? s0 : (2 * dt) / mo.flambda;
      const J = Number.isFinite(d.pMax) && d.pMax > 0 ? Math.max(1, Math.round(Math.log2(d.pMax / mo.flambda / S0) / dj)) : NaN;
      const m = y.reduce((a, b) => a + b, 0) / y.length;
      const z = y.map((v) => v - m);
      const variance = z.reduce((a, v) => a + v * v, 0) / z.length;
      let power: number[][];
      let periods: number[];
      let coi: number[];
      let phase: number[][] | null = null;
      if (d.mode === 'coherence') {
        const y2 = rows.map((i) => yc!.values[i]);
        if (y2.some((v) => !Number.isFinite(v))) {
          warnings.push(`${run.label}: ${yc!.name} has missing values in the range.`);
          view.base.push(null);
          view.lower.push(null);
          return;
        }
        const r = coherence(y, y2, dt, dj, s0, J);
        power = r.wct;
        phase = r.phase;
        periods = r.c.periods;
        coi = r.c.coi;
      } else {
        const c = cwt(z, dt, dj, s0, J, mo);
        power = c.re.map((re, j) => Array.from(re, (v, t) => v * v + c.im[j][t] ** 2));
        periods = c.periods;
        coi = c.coi;
        // (the significance of the power, of the global spectrum; the ridge; the power over the band)
        const alpha = d.noise === 'red' ? lag1(z) : 0;
        const sig0 = cwtSignificance(variance, dt, c.scales, 0, alpha, d.level, mo, z.length);
        const sig1 = cwtSignificance(
          variance,
          dt,
          c.scales,
          1,
          alpha,
          d.level,
          mo,
          z.length,
        );
        const gl = power.map((row) => row.reduce((a, v) => a + v, 0) / row.length);
        const p1 = Number.isFinite(d.band1) ? d.band1 : periods[0];
        const p2 = Number.isFinite(d.band2) ? d.band2 : periods[periods.length - 1];
        const avg = Number.isFinite(mo.cdelta) ? scaleAverage(c, dj, dt, mo, Math.min(p1, p2), Math.max(p1, p2)) : null;
        if (!avg) warnings.push('The power over a band needs the reconstruction factor Cδ, known for Morlet (ω0 6), Paul (4) and DOG (2, 6).');
        const ridge = x.map((_, t) => {
          let best = -1;
          for (let j = 0; j < periods.length; j++) if (periods[j] <= coi[t] && (best < 0 || power[j][t] > power[best][t])) best = j;
          return best >= 0 ? periods[best] : NaN;
        });
        const top = gl.indexOf(Math.max(...gl.filter((v, j) => v > sig1[j]), -Infinity));
        plots.push({ result: { x: periods.map(Math.log10), y: gl }, xName: `log10 period (${run.X.name})`, yName: `global power (${run.label})`, series: [{ name: `${Math.round(100 * d.level)} % significance`, x: periods.map(Math.log10), y: sig1, color: '#d62728', dash: true }] });
        glob.push({ ...column(`Period${sfx(run)}`, Float64Array.from(periods)), role: 'x' }, { ...column(`Global power${sfx(run)}`, Float64Array.from(gl)), role: 'y' }, { ...column(`Significance ${Math.round(100 * d.level)} %${sfx(run)}`, Float64Array.from(sig1)), role: 'y' });
        outCols.push(xCol(run, rows), ...(avg ? [{ ...column(`Power ${fmt(Math.min(p1, p2), 3)}–${fmt(Math.max(p1, p2), 3)}${sfx(run)}`, Float64Array.from(avg)), role: 'y' as const }] : []), { ...column(`Ridge period${sfx(run)}`, Float64Array.from(ridge)), role: 'none' }, { ...column(`Cone (period)${sfx(run)}`, Float64Array.from(coi)), role: 'none' });
        view.lower.push(avg ? { x, y: avg } : { x, y: ridge });
        view.lowerTitle = avg ? 'Power over the band' : 'Ridge period';
        report.push(`${run.label}: ${periods.length} scales, periods ${fmt(periods[0])} to ${fmt(periods[periods.length - 1])}; ${top >= 0 ? `the strongest significant period ${fmt(periods[top])}` : `no period significant at ${Math.round(100 * d.level)} %`} (${d.noise} noise${d.noise === 'red' ? `, lag-1 ${fmt(alpha, 3)}` : ''}).`);
        // (the map's significance: the power over its 95 % level)
        if (k === 0) mapCols = mapOf(x, periods, power, coi, sig0.map((s) => s), null, 'Wavelet power');
      }
      if (phase) {
        const gl = power.map((row, j) => {
          const keep = row.filter((_, t) => periods[j] <= coi[t]);
          return keep.length ? keep.reduce((a, v) => a + v, 0) / keep.length : NaN;
        });
        plots.push({ result: { x: periods.map(Math.log10), y: gl }, xName: `log10 period (${run.X.name})`, yName: `mean coherence in the cone (${run.label})` });
        glob.push({ ...column(`Period${sfx(run)}`, Float64Array.from(periods)), role: 'x' }, { ...column(`Mean coherence${sfx(run)}`, Float64Array.from(gl)), role: 'y' });
        const p1 = Number.isFinite(d.band1) ? d.band1 : periods[0];
        const p2 = Number.isFinite(d.band2) ? d.band2 : periods[periods.length - 1];
        const inBand = periods.map((p) => p >= Math.min(p1, p2) && p <= Math.max(p1, p2));
        const over = x.map((_, t) => {
          const v = power.filter((_, j) => inBand[j]).map((row) => row[t]);
          return v.length ? v.reduce((a, q) => a + q, 0) / v.length : NaN;
        });
        view.lower.push({ x, y: over });
        view.lowerTitle = 'Coherence over the band';
        outCols.push(xCol(run, rows), { ...column(`Coherence ${fmt(Math.min(p1, p2), 3)}–${fmt(Math.max(p1, p2), 3)}${sfx(run)}`, Float64Array.from(over)), role: 'y' });
        const best = gl.indexOf(Math.max(...gl.filter(Number.isFinite)));
        report.push(`${run.label} with ${d.y2}: the highest mean coherence ${fmt(gl[best], 3)} at the period ${fmt(periods[best])}; the phase there ${fmt((180 / Math.PI) * meanAngle(phase[best]), 3)}° (positive: ${run.label} ahead).`);
        if (k === 0) mapCols = mapOf(x, periods, power, coi, null, phase, 'Coherence');
      }
      view.base.push(null);
    });
    if (runs.length > 1) warnings.push('The map: of the first Y only.');
    if (mapCols) tables.map = { name: d.mode === 'cwt' ? 'wavelet power' : 'wavelet coherence', columns: mapCols };
    tables.global = { name: d.mode === 'cwt' ? 'global spectrum' : 'mean coherence', columns: glob };
    tables.out = { name: d.mode === 'cwt' ? 'over time' : 'coherence over time', columns: outCols };
  } else if (d.mode === 'mra' || d.mode === 'denoise') {
    if (!WAVELET_FILTERS[d.wavelet]) return { error: `No wavelet “${d.wavelet}”.` };
    const energy: Column[] = [];
    runs.forEach((run) => {
      const { rows, x, y } = segOf(run);
      if (y.length < 8) {
        warnings.push(`${run.label}: too few points.`);
        view.base.push(null);
        view.lower.push(null);
        return;
      }
      if (d.mode === 'denoise') {
        const r = denoise(y, d.wavelet, d.levels, d.rule, d.thr, d.perLevel);
        const noise = y.map((v, i) => v - r.y[i]);
        view.base.push({ x, y: r.y });
        view.lower.push({ x, y: noise });
        view.lowerTitle = 'Removed (data − denoised)';
        outCols.push(xCol(run, rows), { ...column(`${run.label} (denoised)`, Float64Array.from(r.y)), role: 'y' }, { ...column(`${run.label} (removed)`, Float64Array.from(noise)), role: 'none' });
        energy.push({ ...column(`Level${sfx(run)}`, Float64Array.from(r.thresholds, (_, j) => r.thresholds.length - j)), role: 'x' }, { ...column(`Threshold${sfx(run)}`, Float64Array.from(r.thresholds)), role: 'y' }, { ...column(`σ${sfx(run)}`, Float64Array.from(r.sigma)), role: 'none' });
        const rms = Math.sqrt(noise.reduce((a, v) => a + v * v, 0) / noise.length);
        report.push(`${run.label}: ${WAVELET_FILTERS[d.wavelet].label}, ${r.thresholds.length} levels, ${d.rule === 'universal' ? 'universal' : d.rule === 'sure' ? 'SURE' : 'Bayes'} thresholds (${d.thr}); the noise taken off has an RMS of ${fmt(rms)}.`);
        return;
      }
      // (the MRA on a length the levels allow: the signal extended symmetrically to a multiple of 2^J, cut back)
      const J = Math.max(1, Math.min(Math.round(d.levels), Math.floor(Math.log2(y.length)) - 1));
      const block = 2 ** J;
      const len = Math.ceil(y.length / block) * block;
      const ext = y.slice();
      for (let i = 0; ext.length < len; i++) ext.push(y[y.length - 1 - (i % y.length)]);
      const r = mra(ext, d.wavelet, J);
      const D = r.D.map((c) => c.slice(0, y.length));
      const S = r.S.slice(0, y.length);
      const p = partsOf(d.keep, J);
      const rebuilt = y.map((_, i) => (p.S ? S[i] : 0) + [...p.D].reduce((a, j) => a + D[j - 1][i], 0));
      view.base.push({ x, y: rebuilt });
      view.lower.push(null);
      view.lowerMore = view.lowerMore ?? [];
      const tot = [...D, S].reduce((a, c) => a + c.reduce((q, v) => q + v * v, 0), 0);
      const en = [...D.map((c) => c.reduce((q, v) => q + v * v, 0)), S.reduce((q, v) => q + v * v, 0)].map((v) => (100 * v) / tot);
      outCols.push(xCol(run, rows), ...D.map((c, j): Column => ({ ...column(`D${j + 1}${sfx(run)}`, Float64Array.from(c)), role: 'y' })), { ...column(`S${J}${sfx(run)}`, Float64Array.from(S)), role: 'y' }, { ...column(`Rebuilt${sfx(run)}`, Float64Array.from(rebuilt)), role: 'y' });
      const names = [...D.map((_, j) => `D${j + 1}`), `S${J}`];
      energy.push({ ...column(`Part${sfx(run)}`, Float64Array.from(names, (_, j) => j + 1), names), role: 'x' }, { ...column(`Energy (%)${sfx(run)}`, Float64Array.from(en)), role: 'y' }, { ...column(`Scale (×${run.X.name} step)${sfx(run)}`, Float64Array.from(names, (_, j) => (j < J ? 2 ** j : 2 ** J))), role: 'none' });
      plots.push({ result: { x: names.map((_, j) => j + 1), y: en }, xName: `part (1 = D1 … ${J + 1} = S${J})`, yName: `energy % (${run.label})` });
      report.push(`${run.label}: ${WAVELET_FILTERS[d.wavelet].label}, ${J} levels (MODWT): ${names.map((nm, j) => `${nm} ${fmt(en[j], 3)} %`).join(', ')}; rebuilt from ${d.keep.trim() || 'all the parts'}.`);
    });
    tables.out = { name: d.mode === 'mra' ? 'multiresolution' : 'denoised', columns: outCols };
    tables[d.mode === 'mra' ? 'energy' : 'thresholds'] = { name: d.mode === 'mra' ? 'energy' : 'thresholds', columns: energy };
    view.lowerTitle ||= '';
    view.baseName = d.mode === 'mra' ? 'rebuilt' : 'denoised';
    view.baseColor = '#d62728';
  } else {
    // ---- peaks ----
    const rowsOut: { run: string; x: number; y: number }[] = [];
    runs.forEach((run) => {
      const { x, y, dt } = segOf(run);
      const w1 = Number.isFinite(d.wMin) && d.wMin > 0 ? d.wMin / dt : 1;
      const w2 = Number.isFinite(d.wMax) && d.wMax > 0 ? d.wMax / dt : Math.max(2, Math.min(64, y.length / 10));
      const nw = Math.max(2, Math.min(64, Math.round(w2 - w1) + 1));
      const widths = Array.from({ length: nw }, (_, k) => w1 + ((w2 - w1) * k) / (nw - 1));
      const r = peaksCwt(y, widths, { minSnr: d.minSnr, noisePerc: d.noisePerc });
      view.marks!.push(r.peaks.map((i) => ({ x: x[i], y: y[i], color: '#d62728', down: false })));
      view.base.push(null);
      view.lower.push(null);
      r.peaks.forEach((i) => rowsOut.push({ run: run.label, x: x[i], y: y[i] }));
      report.push(`${run.label}: ${r.peaks.length} peak${r.peaks.length === 1 ? '' : 's'} (widths ${fmt(w1 * dt, 3)} to ${fmt(w2 * dt, 3)} in X, signal to noise at least ${d.minSnr}).`);
    });
    tables.out = {
      name: 'peaks',
      columns: [
        ...(many ? [{ ...column('Run', new Float64Array(rowsOut.length).fill(NaN), rowsOut.map((q) => q.run)), role: 'label' as const }] : []),
        { ...column(runs[0].X.name, Float64Array.from(rowsOut, (q) => q.x)), role: 'x' },
        { ...column('Height', Float64Array.from(rowsOut, (q) => q.y)), role: 'y' },
      ],
    };
  }
  return { tables, view, plots, labels: plots.length === runs.length ? runs.map((r) => r.label) : plots.map((_, k) => runs[k]?.label ?? `${k + 1}`), warnings: [...new Set(warnings)], report };
}

// the mean of angles (radians)
function meanAngle(a: number[]): number {
  const s = a.reduce((q, v) => q + Math.sin(v), 0);
  const c = a.reduce((q, v) => q + Math.cos(v), 0);
  return Math.atan2(s, c);
}
// the long table of a map (time, period, value; significance or phase; in the cone), at most 400 times
function mapOf(x: number[], periods: number[], v: number[][], coi: number[], sig: number[] | null, phase: number[][] | null, name: string): Column[] {
  const step = Math.max(1, Math.ceil(x.length / 400));
  const ts = Array.from({ length: Math.ceil(x.length / step) }, (_, i) => i * step);
  const m = ts.length * periods.length;
  const T = new Float64Array(m);
  const P = new Float64Array(m);
  const V = new Float64Array(m);
  const E = new Float64Array(m);
  const C = new Float64Array(m);
  let q = 0;
  for (const t of ts)
    periods.forEach((p, j) => {
      [T[q], P[q], V[q], E[q], C[q]] = [x[t], p, v[j][t], sig ? v[j][t] / sig[j] : phase ? (180 / Math.PI) * phase[j][t] : NaN, p <= coi[t] ? 1 : 0];
      q++;
    });
  return [{ ...column('Time', T), role: 'x' }, { ...column('Period', P), role: 'none' }, { ...column(name, V), role: 'y' }, { ...column(sig ? 'Power / significance' : 'Phase (°)', E), role: 'none' }, { ...column('In the cone', C), role: 'none' }];
}
