// The nodes Fractional calculus and Fractional FFT. Fractional calculus: every Y, in every range drawn on the graph,
// differentiated or integrated to one order or several (frac.ts); in the order of X (X is the time) or of the rows (a
// voltammogram: X the potential, the time from the scan rate) — the semi-integral of a voltammogram (convolution
// voltammetry, Oldham 1972): its plateau m_L = n F A c √D gives D. Fractional FFT: the transform of an order, the scan
// of the orders (the one that gathers the signal most: a chirp's rate), a filter in the fractional domain (a chirp
// taken out). Pure.
import { column, fmtNum, unitOf, type Column, type Dataset } from './table.ts';
import { regionRuns, runPoints, type RegionSpec, type RegionView } from './regionruns.ts';
import { concentration, fracDerivative, fracFast, frft as frftDiscrete, type FracMethod } from './frac.ts';
import type { SignalPlot } from './signalnodes.ts';

type Out = { tables: Record<string, Dataset>; view: RegionView; plots: SignalPlot[]; labels: string[]; warnings: string[]; report: string[] } | { error: string } | { waiting: string };
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? fmtNum(v, d) : 'n/a');
const COLORS = ['#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b'];

// orders: one or several (“-0.5, 0.5”); along: X is the time (the points in its order), or the rows are (a
// voltammogram: X the potential, the time |ΔE| / rate); semi: the electrochemical constants for D from the plateau of
// the semi-integral (n electrons, the area in cm², the concentration in mM, the current's unit)
export type FracData = RegionSpec & { orders: string; method: FracMethod; along: 'x' | 'rows'; rate: number; semi: boolean; electrons: number; area: number; conc: number; unit: 'A' | 'mA' | 'µA' | 'nA' };
const UNIT: Record<FracData['unit'], number> = { A: 1, mA: 1e-3, µA: 1e-6, nA: 1e-9 };
const FARADAY = 96485.33212;
export function fracNode(ds: Dataset, d: FracData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const orders = d.orders
    .split(/[\s,;]+/)
    .map((q) => Number(q.replace('−', '-')))
    .filter((v) => Number.isFinite(v) && Math.abs(v) <= 4);
  if (!orders.length) return { waiting: 'Write the order(s): e.g. −0.5 (the semi-integral), 0.5 (the semi-derivative), or a list.' };
  if (d.along === 'rows' && !(d.rate > 0)) return { waiting: 'Give the scan rate (V/s): the time from the potential.' };
  const name = (a: number) => (a === -0.5 ? 'semi-integral' : a === 0.5 ? 'semi-derivative' : a < 0 ? `integral of order ${fmtNum(-a, 4)}` : `derivative of order ${fmtNum(a, 4)}`);
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: runs.map(() => null), lower: [], lowerMore: [], lowerTitle: orders.length > 1 ? `Orders ${orders.join(', ')}` : name(orders[0]).replace(/^./, (c) => c.toUpperCase()), notes: [] };
  const cols: Column[] = [];
  runs.forEach((run, k) => {
    const res = orders.map(() => new Float64Array(n).fill(NaN));
    const tcol = new Float64Array(n).fill(NaN);
    const lowers: { x: number[]; y: number[] }[] = orders.map(() => ({ x: [], y: [] }));
    const notes: string[] = [];
    for (const part of run.parts) {
      // (the rows in the order of X, or as measured)
      const rows = d.along === 'rows' ? [...part.rows].sort((a, b) => a - b) : part.rows;
      if (rows.length < 3) continue;
      const xs = rows.map((i) => run.X.values[i]);
      const ys = rows.map((i) => run.Y.values[i]);
      let t: number[];
      if (d.along === 'rows') {
        t = [0];
        for (let i = 1; i < xs.length; i++) t.push(t[i - 1] + Math.abs(xs[i] - xs[i - 1]) / d.rate);
        // (the same potential twice in a row: the time pushed on a little, as the derivative needs a step)
        for (let i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) t[i] = t[i - 1] + 1e-12;
      } else t = xs;
      if (d.method === 'gl' || d.method === 'fourier') {
        const dt = t.slice(1).map((v, i) => v - t[i]);
        const m = dt.reduce((a, b) => a + b, 0) / dt.length;
        if (dt.some((v) => Math.abs(v - m) > 0.01 * Math.abs(m))) warnings.push(`${run.label}: ${d.method === 'gl' ? 'Grünwald–Letnikov' : 'Fourier'} needs an even step; it is not (take Riemann–Liouville).`);
      }
      orders.forEach((a, q) => {
        const r = fracDerivative(t, ys, a, d.method);
        rows.forEach((i, j) => (res[q][i] = r[j]));
        lowers[q].x.push(...xs, NaN);
        lowers[q].y.push(...r, NaN);
      });
      rows.forEach((i, j) => (tcol[i] = t[j]));
      // (convolution voltammetry: the plateau of the semi-integral, and D from it)
      if (d.semi) {
        const q = orders.indexOf(-0.5);
        if (q < 0) warnings.push('D from the plateau needs the order −0.5 (the semi-integral).');
        else {
          const m = rows.map((i) => res[q][i]).filter(Number.isFinite);
          const mL = Math.max(...m.map(Math.abs)) * UNIT[d.unit];
          const c = d.conc * 1e-6;
          const D = (mL / (d.electrons * FARADAY * d.area * c)) ** 2;
          notes.push(`plateau m_L ${fmt(mL)} C s^−½, D ${fmt(D)} cm²/s`);
          report.push(`${run.label}: the plateau of the semi-integral m_L = ${fmt(mL)} C·s^−½ → D = (m_L / nFAc)² = ${fmt(D)} cm²/s (n = ${d.electrons}, A = ${d.area} cm², c = ${d.conc} mM).`);
        }
      }
    }
    view.lower.push(lowers[0]);
    view.lowerMore!.push(lowers.slice(1).map((l, q) => ({ ...l, color: COLORS[(q + 1) % COLORS.length] })));
    view.notes!.push(notes);
    if (k === 0 || run.X !== runs[k - 1].X) cols.push({ ...run.X, role: 'x' });
    if (d.along === 'rows') cols.push({ ...column(`Time (s)${runs.length > 1 ? ` (${run.label})` : ''}`, tcol), role: 'none' });
    cols.push({ ...run.Y, role: 'y' });
    orders.forEach((a, q) => cols.push({ ...column(`D^${fmtNum(a, 4)} ${run.Y.name}`, res[q]), role: 'y' }));
  });
  report.unshift(`${orders.map(name).join(', ')} (${d.method === 'rl' ? 'Riemann–Liouville' : d.method === 'caputo' ? 'Caputo' : d.method === 'gl' ? 'Grünwald–Letnikov' : 'Weyl, by the Fourier transform'}), from the start of every range${d.along === 'rows' ? `, the time from the potential at ${d.rate} V/s` : ''}.`);
  return { tables: { out: { name: `${ds.name} fractional`, columns: cols } }, view, plots: [], labels: [], warnings: [...new Set(warnings)], report };
}

// ---- Fractional FFT ----
// mode: the transform of an order, the scan of the orders 0 … 2, or a filter at an order (the optimal one if asked):
// the band of u around the strongest peak (± width samples) or given, taken out or kept
// both: a real signal's chirp taken out at the order 2 − a too (its mirror); method: the fast transform (Ozaktas et al.:
// close to the continuous one, chirps gather; the default) or the discrete one (Candan et al.: unitary, exact)
export type FrftData = RegionSpec & { mode: 'transform' | 'scan' | 'filter'; order: number; auto: boolean; u1: number; u2: number; width: number; keep: 'remove' | 'keep'; both?: boolean; method?: 'fast' | 'discrete' };
export function frftNode(ds: Dataset, d: FrftData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const plots: SignalPlot[] = [];
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: [], baseName: 'filtered', baseColor: '#d62728', lower: [], lowerTitle: d.mode === 'filter' ? 'Taken out' : '', notes: [] };
  const tables: Record<string, Dataset> = {};
  const outCols: Column[] = [];
  const scanCols: Column[] = [];
  const discrete = d.method === 'discrete';
  const frft = discrete ? frftDiscrete : fracFast;
  runs.forEach((run, k) => {
    let rows = run.parts[0]?.rows ?? run.idx;
    if (run.parts.length > 1) warnings.push(`${run.label}: the first range only.`);
    // (the fast transform: an even number of points)
    if (!discrete && rows.length % 2) rows = rows.slice(0, -1);
    const N = rows.length;
    if (N < 8) {
      view.base.push(null);
      view.lower.push(null);
      return;
    }
    if (N > (discrete ? 2048 : 16384)) {
      warnings.push(`${run.label}: ${N} points: at most ${discrete ? 2048 : 16384} (draw a range, or take fewer points).`);
      view.base.push(null);
      view.lower.push(null);
      return;
    }
    const x = rows.map((i) => run.X.values[i]);
    const y = rows.map((i) => run.Y.values[i]);
    const dx = (x[N - 1] - x[0]) / (N - 1);
    const zero = y.map(() => 0);
    const u = Array.from({ length: N }, (_, j) => j - Math.floor(N / 2));
    // (the scan: how gathered the transform is at every order; the best)
    const scan = () => {
      const as = Array.from({ length: 101 }, (_, j) => (2 * j) / 100);
      // (a real signal: the order 2 − a its mirror, as gathered)
      const conc = as.map((a, j) => (j > 50 ? NaN : concentration(...frft(y, zero, a))));
      for (let j = 51; j < as.length; j++) conc[j] = conc[as.length - 1 - j];
      let best = 0;
      for (let j = 1; j < as.length; j++) if (conc[j] > conc[best]) best = j;
      // (refined between the neighbours: a golden-section search)
      const g = (Math.sqrt(5) - 1) / 2;
      const at = (a: number) => concentration(...frft(y, zero, a));
      let [lo, hi] = [as[Math.max(0, best - 1)], as[Math.min(as.length - 1, best + 1)]];
      let [m1, m2] = [hi - g * (hi - lo), lo + g * (hi - lo)];
      let [c1, c2] = [at(m1), at(m2)];
      for (let it = 0; it < 24; it++)
        if (c1 < c2) {
          [lo, m1, c1] = [m1, m2, c2];
          m2 = lo + g * (hi - lo);
          c2 = at(m2);
        } else {
          [hi, m2, c2] = [m2, m1, c1];
          m1 = hi - g * (hi - lo);
          c1 = at(m1);
        }
      return { as, conc, best: (lo + hi) / 2 };
    };
    const rate = (a: number) => -1 / Math.tan((a * Math.PI) / 2) / (N * dx * dx);
    if (d.mode === 'scan') {
      const s = scan();
      plots.push({ result: { x: s.as, y: s.conc }, xName: 'order a', yName: `concentration (${run.label})`, marks: [s.best] });
      scanCols.push({ ...column(`Order${runs.length > 1 ? ` (${run.label})` : ''}`, Float64Array.from(s.as)), role: 'x' }, { ...column(`Concentration${runs.length > 1 ? ` (${run.label})` : ''}`, Float64Array.from(s.conc)), role: 'y' });
      const u = unitOf(run.X.name);
      report.push(`${run.label}: the transform gathers most at the order a = ${fmt(s.best)} (a chirp of rate ${fmt(Math.abs(rate(s.best)))} ${u ? `(1/${u}) per ${u}` : 'cycles per unit of X, squared'}, if it is one).`);
      view.base.push(null);
      view.lower.push(null);
      return;
    }
    const a = d.mode === 'filter' && d.auto ? scan().best : d.order;
    const [Fr, Fi] = frft(y, zero, a);
    const mag = Fr.map((v, j) => Math.hypot(v, Fi[j]));
    if (d.mode === 'transform') {
      plots.push({ result: { x: u, y: mag }, xName: 'u (samples from the middle)', yName: `|F^${fmt(a, 3)}| (${run.label})` });
      const sfx = runs.length > 1 ? ` (${run.label})` : '';
      outCols.push({ ...column(`u${sfx}`, Float64Array.from(u)), role: 'x' }, { ...column(`|F^a|${sfx}`, Float64Array.from(mag)), role: 'y' }, { ...column(`Re${sfx}`, Float64Array.from(Fr)), role: 'none' }, { ...column(`Im${sfx}`, Float64Array.from(Fi)), role: 'none' });
      const top = mag.indexOf(Math.max(...mag));
      report.push(`${run.label}: the transform of order ${fmt(a, 4)}, its strongest point at u = ${u[top]} (of ${N} samples).`);
      view.base.push(null);
      view.lower.push(null);
      return;
    }
    // (the filter: the band, the transform masked, back by the order −a; the real part)
    const top = mag.indexOf(Math.max(...mag));
    const [b1, b2] = Number.isFinite(d.u1) && Number.isFinite(d.u2) ? [Math.min(d.u1, d.u2), Math.max(d.u1, d.u2)] : [u[top] - d.width, u[top] + d.width];
    const inBand = u.map((v) => v >= b1 && v <= b2);
    const keep = (j: number) => (d.keep === 'keep' ? inBand[j] : !inBand[j]);
    let [Br, Bi] = frft(
      Fr.map((v, j) => (keep(j) ? v : 0)),
      Fi.map((v, j) => (keep(j) ? v : 0)),
      -a,
    );
    // (a real chirp is two, e^(±iπγt²): the second gathers at the order 2 − a — taken out there too, around its spike)
    if (d.keep === 'remove' && d.both !== false && !(Number.isFinite(d.u1) && Number.isFinite(d.u2))) {
      const a2 = 2 - a;
      const [Gr, Gi] = frft(Br, Bi, a2);
      const m2 = Gr.map((v, j) => Math.hypot(v, Gi[j]));
      const t2 = m2.indexOf(Math.max(...m2));
      const band2 = (j: number) => Math.abs(u[j] - u[t2]) <= d.width;
      [Br, Bi] = frft(
        Gr.map((v, j) => (band2(j) ? 0 : v)),
        Gi.map((v, j) => (band2(j) ? 0 : v)),
        -a2,
      );
    }
    const imRms = Math.sqrt(Bi.reduce((s, v) => s + v * v, 0) / N);
    const out = Br;
    const removed = y.map((v, j) => v - out[j]);
    view.base.push({ x, y: out });
    view.lower.push({ x, y: removed });
    plots.push({ result: { x: u, y: mag }, xName: 'u (samples from the middle)', yName: `|F^${fmt(a, 3)}| (${run.label})`, series: [{ name: 'band', x: [b1, b1, NaN, b2, b2], y: [0, Math.max(...mag), NaN, 0, Math.max(...mag)], color: '#d62728', dash: true }] });
    const sfx = runs.length > 1 ? ` (${run.label})` : '';
    if (k === 0 || outCols.length === 0) outCols.push({ ...column(run.X.name + sfx, Float64Array.from(x)), role: 'x' });
    outCols.push({ ...column(`${run.label} (filtered)`, Float64Array.from(out)), role: 'y' }, { ...column(`${run.label} (taken out)`, Float64Array.from(removed)), role: 'none' });
    report.push(`${run.label}: at the order ${fmt(a, 4)}${d.mode === 'filter' && d.auto ? ' (the one that gathers it most)' : ''}, the band u ${b1} … ${b2} ${d.keep === 'keep' ? 'kept' : 'taken out'}; back by the order ${fmt(-a, 4)}${imRms > 1e-6 * Math.max(...y.map(Math.abs)) ? ` (the imaginary part left, RMS ${fmt(imRms)}, dropped)` : ''}.`);
  });
  tables.out = d.mode === 'scan' ? { name: 'order scan', columns: scanCols } : { name: d.mode === 'filter' ? 'filtered' : 'fractional transform', columns: outCols };
  return { tables, view, plots, labels: runs.map((r) => r.label).slice(0, plots.length), warnings: [...new Set(warnings)], report };
}
