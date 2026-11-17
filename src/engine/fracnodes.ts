// The nodes Fractional calculus and Fractional FFT. Fractional calculus: every Y, in every range drawn on the graph,
// differentiated or integrated to one order or several (frac.ts); in the order of X (X is the time) or of the rows (a
// voltammogram: X the potential, the time from the scan rate) — the semi-integral of a voltammogram (convolution
// voltammetry, Oldham 1972): its plateau m_L = n F A c √D gives D. Fractional FFT: the transform of an order, the scan
// of the orders (the one that gathers the signal most: a chirp's rate), a filter in the fractional domain (a chirp
// taken out). Pure.
import { bareName, column, fmtNum, unitOf, withUnit, type Column, type Dataset } from './table.ts';
import { regionRuns, runPoints, type RegionSpec, type RegionView } from './regionruns.ts';
import { concentration, fracDerivative, fracFastC, frft as frftDiscrete, type FracMethod } from './frac.ts';
import type { SignalPlot } from './signalnodes.ts';
import { maxOf, pushAll } from './minmax.ts';

type Out = { tables: Record<string, Dataset>; view: RegionView; plots: SignalPlot[]; labels: string[]; warnings: string[]; report: string[] } | { error: string } | { waiting: string };
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? fmtNum(v, d) : 'n/a');
const COLORS = ['#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b'];

// orders: one or several (“-0.5, 0.5”); along: X is the time (the points in its order), or the rows are (a
// voltammogram: X the potential, the time |ΔE| / rate); semi: the electrochemical constants for D from the plateau of
// the semi-integral (n electrons, the area in cm², the concentration in mM, the current's unit)
// withData: the input curves too, each before its results (absent: as older nodes, with them; new nodes: without)
export type FracData = RegionSpec & { withData?: boolean; orders: string; method: FracMethod; along: 'x' | 'rows'; rate: number; semi: boolean; electrons: number; area: number; conc: number; unit: 'A' | 'mA' | 'µA' | 'nA' };
const UNIT: Record<FracData['unit'], number> = { A: 1, mA: 1e-3, µA: 1e-6, nA: 1e-9 };
const FARADAY = 96485.33212;
// the units read from a column's name (“Current (µA)”, “Time (ms)”), in amperes, seconds, volts (undefined: not one)
const scaleOf = (table: Record<string, number>, u: string): number | undefined => table[u.replace(/[μu](?=[A-Za-z])/, 'µ')];
const AMPERE: Record<string, number> = { A: 1, mA: 1e-3, µA: 1e-6, nA: 1e-9, pA: 1e-12 };
const SECOND: Record<string, number> = { s: 1, sec: 1, ms: 1e-3, µs: 1e-6, ns: 1e-9, min: 60, h: 3600, hr: 3600 };
const VOLT: Record<string, number> = { V: 1, mV: 1e-3, µV: 1e-6 };
// the unit of D^α of a quantity in y per a time in t: y · t^(−α) (“µA”, “s”, −0.5 → “µA·s^½”)
const powText = (e: number) => (e === 1 ? '' : e === 0.5 ? '^½' : e === 1.5 ? '^1.5' : `^${fmtNum(e, 4)}`);
const fracUnit = (y: string, t: string, a: number) => {
  const e = -a;
  if (e === 0) return y;
  if (e > 0) return y ? `${y}·${t}${powText(e)}` : `${t}${powText(e)}`;
  return `${y || '1'}/${t}${powText(-e)}`;
};
// Whether the data are one period of a periodic signal, as Weyl's derivative takes them: the line of the first points
// and that of the last ones (a parabola through each end's few points, least squares) carried half a step out meet in
// value and in slope. The mismatch: of the value, as a fraction of the range; of the slope, as a fraction of the
// steepest slope inside (a noise allowance from the scatter of the second differences)
export function periodicMismatch(t: number[], f: number[]): { gap: number; slope: number } {
  const n = t.length;
  const k = Math.max(3, Math.min(8, Math.floor(n / 4)));
  const h = (t[n - 1] - t[0]) / (n - 1);
  const fin = f.filter(Number.isFinite);
  const R = Math.max(...fin) - Math.min(...fin);
  if (!(R > 0) || n < 6) return { gap: 0, slope: 0 };
  // (a parabola by least squares on the points at, as offsets from x0; its value and slope at x0)
  const end = (idx: number[], x0: number) => {
    const S = [0, 0, 0, 0, 0];
    const B = [0, 0, 0];
    for (const i of idx) {
      const u = (t[i] - x0) / h;
      for (let p = 0; p < 5; p++) S[p] += u ** p;
      for (let p = 0; p < 3; p++) B[p] += f[i] * u ** p;
    }
    // (the 3 × 3 normal equations by Cramer's rule)
    const M = [
      [S[0], S[1], S[2]],
      [S[1], S[2], S[3]],
      [S[2], S[3], S[4]],
    ];
    const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(M);
    const col = (c: number) => det(M.map((row, r) => row.map((v, j) => (j === c ? B[r] : v))));
    return { v: col(0) / D, s: col(1) / D / h };
  };
  const first = Array.from({ length: k }, (_, i) => i);
  const last = Array.from({ length: k }, (_, i) => n - k + i);
  const a = end(first, t[0] - h / 2);
  const b = end(last, t[n - 1] + h / 2);
  // (the noise: the second differences' median scatter, as a value; the steepest slope inside, from the first differences)
  const d2 = f.slice(2).map((v, i) => Math.abs(v - 2 * f[i + 1] + f[i])).filter(Number.isFinite).sort((p, q) => p - q);
  const sigma = (d2[Math.floor(d2.length / 2)] ?? 0) / (0.6745 * Math.sqrt(6));
  let steep = 0;
  for (let i = 1; i < n; i++) if (Number.isFinite(f[i] - f[i - 1])) steep = Math.max(steep, Math.abs(f[i] - f[i - 1]) / (t[i] - t[i - 1]));
  const gap = Math.max(0, Math.abs(a.v - b.v) - 4 * sigma) / R;
  const slope = Math.max(0, Math.abs(a.s - b.s) - (4 * sigma) / h) / (steep || 1);
  return { gap, slope };
}
export function fracNode(ds: Dataset, d: FracData): Out {
  const rr = regionRuns(ds, d);
  if ('error' in rr || 'waiting' in rr) return rr;
  const { runs, n } = rr;
  const warnings: string[] = [];
  const report: string[] = [];
  const asked = d.orders
    .split(/[\s,;]+/)
    .filter((q) => q.trim())
    .map((q) => Number(q.replace(/−/g, '-')))
    .filter(Number.isFinite);
  const orders = asked.filter((v) => Math.abs(v) <= 4);
  const dropped = asked.filter((v) => Math.abs(v) > 4);
  if (dropped.length) warnings.push(`The order${dropped.length > 1 ? 's' : ''} ${dropped.join(', ')} left out: at most 4 either way.`);
  if (!orders.length) return { waiting: dropped.length ? `The orders go from −4 to 4 (${dropped.join(', ')} is beyond).` : 'Write the order(s): e.g. −0.5 (the semi-integral), 0.5 (the semi-derivative), or a list.' };
  if (d.along === 'rows' && !(d.rate > 0)) return { waiting: 'Give the scan rate (V/s): the time from the potential.' };
  const name = (a: number) => (a === -0.5 ? 'semi-integral' : a === 0.5 ? 'semi-derivative' : a < 0 ? `integral of order ${fmtNum(-a, 4)}` : `derivative of order ${fmtNum(a, 4)}`);
  const view: RegionView = { ...runPoints(runs, n), xName: runs[0].X.name, yNames: runs.map((r) => r.label), base: runs.map(() => null), lower: [], lowerMore: [], lowerTitle: orders.length > 1 ? `Orders ${orders.join(', ')}` : name(orders[0]).replace(/^./, (c) => c.toUpperCase()), notes: [] };
  const cols: Column[] = [];
  runs.forEach((run, k) => {
    const res = orders.map(() => new Float64Array(n).fill(NaN));
    const tcol = new Float64Array(n).fill(NaN);
    const lowers: { x: number[]; y: number[] }[] = orders.map(() => ({ x: [], y: [] }));
    const notes: string[] = [];
    // (the units, from the names: X a potential (along the rows: the time from it, in s) or a time; Y a current for D)
    const xU = unitOf(run.X.name);
    const yU = unitOf(run.Y.name);
    const vScale = d.along === 'rows' ? scaleOf(VOLT, xU) : undefined;
    if (d.along === 'rows' && vScale === undefined) (xU ? warnings : report).push(`${run.label}: X taken in V${xU ? ` (its unit “${xU}” is not a potential)` : ' (its name has no unit)'}, the time from it at ${d.rate} V/s.`);
    const tU = d.along === 'rows' ? 's' : xU;
    const tScale = d.along === 'rows' ? 1 : scaleOf(SECOND, xU);
    for (const part of run.parts) {
      // (the rows in the order of X, or as measured)
      const rows = d.along === 'rows' ? [...part.rows].sort((a, b) => a - b) : part.rows;
      if (rows.length < 3) continue;
      const xs = rows.map((i) => run.X.values[i]);
      const ys = rows.map((i) => run.Y.values[i]);
      let t: number[];
      if (d.along === 'rows') {
        t = [0];
        for (let i = 1; i < xs.length; i++) t.push(t[i - 1] + (Math.abs(xs[i] - xs[i - 1]) * (vScale ?? 1)) / d.rate);
        // (the same potential twice in a row: the time pushed on a little, as the derivative needs a step)
        for (let i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) t[i] = t[i - 1] + 1e-12;
      } else t = xs;
      if (d.method === 'gl' || d.method === 'fourier') {
        const dt = t.slice(1).map((v, i) => v - t[i]);
        const m = dt.reduce((a, b) => a + b, 0) / dt.length;
        if (dt.some((v) => Math.abs(v - m) > 0.01 * Math.abs(m))) warnings.push(`${run.label}: ${d.method === 'gl' ? 'Grünwald–Letnikov' : 'Fourier'} needs an even step; it is not (take Riemann–Liouville).`);
      }
      // (Weyl's derivative takes the data as one period of a periodic signal: when the ends do not join, said)
      if (d.method === 'fourier') {
        const pm = periodicMismatch(t, ys);
        const why = [pm.gap > 0.02 ? `the ends ${fmt(100 * pm.gap, 2)} % of the range apart` : '', pm.slope > 0.1 ? 'the slopes at the ends differ' : ''].filter(Boolean);
        if (why.length) warnings.push(`${run.label}: Weyl's derivative (Fourier) takes the data as one period of a periodic signal, and they are not (${why.join('; ')}): the result is wrong, most near the ends, and is not the derivative from the start — take Riemann–Liouville or Grünwald–Letnikov.`);
      }
      orders.forEach((a, q) => {
        const r = fracDerivative(t, ys, a, d.method);
        rows.forEach((i, j) => (res[q][i] = r[j]));
        pushAll(lowers[q].x, xs).push(NaN);
        pushAll(lowers[q].y, r).push(NaN);
      });
      rows.forEach((i, j) => (tcol[i] = t[j]));
      // (convolution voltammetry: the plateau of the semi-integral, and D from it)
      if (d.semi) {
        const q = orders.indexOf(-0.5);
        if (q < 0) warnings.push('D from the plateau needs the order −0.5 (the semi-integral).');
        else {
          // (the semi-integral is in the data's units, Y · T^½: in A·s^½ by the current's unit (the name's when it has
          // one, else the one chosen) and the time's (the name's; none: seconds))
          const yNamed = scaleOf(AMPERE, yU);
          const yScale = yNamed ?? UNIT[d.unit];
          const yText = yNamed !== undefined ? yU : d.unit;
          const m = rows.map((i) => res[q][i]).filter(Number.isFinite);
          const mData = maxOf(m.map(Math.abs));
          const mL = mData * yScale * Math.sqrt(tScale ?? 1);
          const c = d.conc * 1e-6;
          const D = (mL / (d.electrons * FARADAY * d.area * c)) ** 2;
          notes.push(`plateau m_L ${fmt(mL)} A·s^½, D ${fmt(D)} cm²/s`);
          const said: string[] = [];
          if (yNamed !== undefined && yNamed !== UNIT[d.unit]) said.push(`the current in ${yU}, from the column's name (the unit chosen, ${d.unit}, not used)`);
          if (yNamed === undefined) said.push(`the current taken in ${d.unit}, the unit chosen (${yU ? `the name's “${yU}” is not a current` : 'the name has no unit'})`);
          if (tScale === undefined) said.push(`X taken in seconds (${xU ? `its unit “${xU}” is not a time` : 'its name has no unit'})`);
          if (tScale === undefined && xU) warnings.push(`${run.label}: D from the plateau needs X in time units (s, ms, µs, min, h); “${xU}” is not one, so seconds were assumed — or take “the rows”, the time from the potential and the scan rate.`);
          report.push(`${run.label}: the plateau of the semi-integral m_L = ${fmt(mData)} ${fracUnit(yText, tU || 's', -0.5)} = ${fmt(mL)} A·s^½ → D = (m_L / nFAc)² = ${fmt(D)} cm²/s (n = ${d.electrons}, A = ${d.area} cm², c = ${d.conc} mM)${said.length ? `; ${said.join('; ')}` : ''}.`);
        }
      }
    }
    view.lower.push(lowers[0]);
    view.lowerMore!.push(lowers.slice(1).map((l, q) => ({ ...l, color: COLORS[(q + 1) % COLORS.length] })));
    view.notes!.push(notes);
    if (k === 0 || run.X !== runs[k - 1].X) cols.push({ ...run.X, role: 'x' });
    if (d.along === 'rows') cols.push({ ...column(`Time (s)${runs.length > 1 ? ` (${run.label})` : ''}`, tcol), role: 'none' });
    if (d.withData !== false) cols.push({ ...run.Y, role: 'y' });
    // (the name with its unit, Y's times the time's to the −α: “D^-0.5 Current (µA·s^½)”; without the time's unit, Y's
    // name as it is)
    const outName = (a: number) => (tU ? withUnit(`D^${fmtNum(a, 4)} ${bareName(run.Y.name)}`, fracUnit(yU, tU, a)) : `D^${fmtNum(a, 4)} ${run.Y.name}`);
    orders.forEach((a, q) => cols.push({ ...column(outName(a), res[q]), role: 'y' }));
  });
  report.unshift(`${orders.map(name).join(', ')} (${d.method === 'rl' ? 'Riemann–Liouville' : d.method === 'caputo' ? 'Caputo' : d.method === 'gl' ? 'Grünwald–Letnikov' : 'Weyl, by the Fourier transform'}), from the start of every range${d.along === 'rows' ? `, the time from the potential at ${d.rate} V/s` : ''}.`);
  return { tables: { out: { name: `${ds.name} fractional`, columns: cols } }, view, plots: [], labels: [], warnings: [...new Set(warnings)], report };
}

// ---- Fractional FFT ----
// mode: the transform of an order, the scan of the orders 0 … 2, or a filter at an order (the optimal one if asked):
// the band of u around the strongest peak (± width samples) or given, taken out or kept
// both: a real signal's chirp taken out at the order 2 − a too (its mirror); method: the fast transform (Ozaktas et al.:
// close to the continuous one, chirps gather; the default; its DFT steps centred as its core, fracFastC, so every order
// goes back; exact only on signals that fit it, so checked on the data, below) or the discrete one (Candan et al.:
// unitary, exact)
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
  // (the X written last, shared by the next run when it is the same)
  let lastX: { name: string; x: number[] } | null = null;
  runs.forEach((run) => {
    // (the fast transform: exact only when the signal fits it — falls to 0 at the ends and stays clear of the Nyquist
    // frequency; elsewhere checked, and the discrete one taken for a filter (below))
    let frft = discrete ? frftDiscrete : fracFastC;
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
    // (forward by b and back by −b with the fast transform: how far from v it comes back, as a part of the data's norm)
    const ry = Math.sqrt(y.reduce((s, v) => s + v * v, 0)) || 1;
    const off = (vr: number[], vi: number[], b: number) => {
      const [r1, i1] = fracFastC(vr, vi, b);
      const [r2, i2] = fracFastC(r1, i1, -b);
      return Math.sqrt(r2.reduce((s, v, j) => s + (v - vr[j]) ** 2 + (i2[j] - vi[j]) ** 2, 0)) / ry;
    };
    const why = 'they do not fall to 0 at the ends, or reach the Nyquist frequency';
    if (d.mode === 'transform') {
      const err = discrete ? 0 : off(y, zero, a);
      if (err > 1e-2) warnings.push(`${run.label}: the fast transform is approximate on these data (forward and back off by ${fmt(100 * err, 2)} % of their RMS: ${why}); the discrete method is exact.`);
      const [Fr, Fi] = frft(y, zero, a);
      const mag = Fr.map((v, j) => Math.hypot(v, Fi[j]));
      plots.push({ result: { x: u, y: mag }, xName: 'u (samples from the middle)', yName: `|F^${fmt(a, 3)}| (${run.label})` });
      const sfx = runs.length > 1 ? ` (${run.label})` : '';
      outCols.push({ ...column(`u${sfx}`, Float64Array.from(u)), role: 'x' }, { ...column(`|F^a|${sfx}`, Float64Array.from(mag)), role: 'y' }, { ...column(`Re${sfx}`, Float64Array.from(Fr)), role: 'none' }, { ...column(`Im${sfx}`, Float64Array.from(Fi)), role: 'none' });
      const top = mag.indexOf(maxOf(mag));
      report.push(`${run.label}: the transform of order ${fmt(a, 4)}, its strongest point at u = ${u[top]} (of ${N} samples).`);
      view.base.push(null);
      view.lower.push(null);
      return;
    }
    // (the filter: the band of the transform back by the order −a — kept, that is the result; taken out, it is taken
    // from the data, so what is outside the band is left exactly as it was, whatever the transform; the real part)
    const twice = d.keep === 'remove' && d.both !== false && !(Number.isFinite(d.u1) && Number.isFinite(d.u2));
    const filter = () => {
      const [Fr, Fi] = frft(y, zero, a);
      const mag = Fr.map((v, j) => Math.hypot(v, Fi[j]));
      const top = mag.indexOf(maxOf(mag));
      const [b1, b2] = Number.isFinite(d.u1) && Number.isFinite(d.u2) ? [Math.min(d.u1, d.u2), Math.max(d.u1, d.u2)] : [u[top] - d.width, u[top] + d.width];
      const inBand = u.map((v) => v >= b1 && v <= b2);
      // (the parts that went through the transforms, each with its order: their accuracy is the result's)
      const parts: [number[], number[], number][] = [];
      const [Pr, Pi] = frft(
        Fr.map((v, j) => (inBand[j] ? v : 0)),
        Fi.map((v, j) => (inBand[j] ? v : 0)),
        -a,
      );
      parts.push([Pr, Pi, a]);
      let [Br, Bi] = d.keep === 'keep' ? [Pr, Pi] : [y.map((v, j) => v - Pr[j]), Pi.map((v) => -v)];
      // (a real chirp is two, e^(±iπγt²): the second gathers at the order 2 − a — taken out there too, around its spike)
      if (twice) {
        const a2 = 2 - a;
        const [Gr, Gi] = frft(Br, Bi, a2);
        const m2 = Gr.map((v, j) => Math.hypot(v, Gi[j]));
        const t2 = m2.indexOf(maxOf(m2));
        const band2 = (j: number) => Math.abs(u[j] - u[t2]) <= d.width;
        const [Qr, Qi] = frft(
          Gr.map((v, j) => (band2(j) ? v : 0)),
          Gi.map((v, j) => (band2(j) ? v : 0)),
          -a2,
        );
        parts.push([Qr, Qi, a2]);
        [Br, Bi] = [Br.map((v, j) => v - Qr[j]), Bi.map((v, j) => v - Qi[j])];
      }
      return { Br, Bi, mag, b1, b2, parts };
    };
    let f = filter();
    // (the fast transform checked on what went through it: forward and back it should come again. A chirp that fits
    // comes back within ~0.1 % of the data's RMS (and only that part is touched); a pulse that does not fall to 0, a
    // step, a ramp, noise taken out at their peak are off by 2–4 %. Off by more than 1 %, the discrete transform
    // (exact, unitary; it gathers a chirp less sharply, so not taken by default) up to 1024 points, at the same order;
    // else it is said)
    if (!discrete) {
      const err = f.parts.reduce((s, [pr, pi, b]) => s + off(pr, pi, b), 0);
      if (err > 1e-2) {
        const pct = `${fmt(100 * err, 2)} % of the data's RMS`;
        if (N <= 1024) {
          frft = frftDiscrete;
          f = filter();
          report.push(`${run.label}: the fast transform is not exact on these data (what went through it comes back off by ${pct}: ${why}), so the discrete one was taken.`);
        } else warnings.push(`${run.label}: the fast transform is off by ${pct} on these data (forward and back, on the part filtered: ${why}), and ${N} points are too many to take the discrete one instead (at most 1024): the filtered curve is distorted by about as much. Draw a shorter range, or choose the discrete method.`);
      }
    }
    const { Br, Bi, mag, b1, b2 } = f;
    const imRms = Math.sqrt(Bi.reduce((s, v) => s + v * v, 0) / N);
    const out = Br;
    const removed = y.map((v, j) => v - out[j]);
    view.base.push({ x, y: out });
    view.lower.push({ x, y: removed });
    plots.push({ result: { x: u, y: mag }, xName: 'u (samples from the middle)', yName: `|F^${fmt(a, 3)}| (${run.label})`, series: [{ name: 'band', x: [b1, b1, NaN, b2, b2], y: [0, Math.max(...mag), NaN, 0, Math.max(...mag)], color: '#d62728', dash: true }] });
    const sfx = runs.length > 1 ? ` (${run.label})` : '';
    // (every run its own X when it differs from the one written last — in name, length or values — as Wavelet does: a
    // second Y with its own X, or another range, is not put under the first one's)
    if (!lastX || lastX.name !== run.X.name || lastX.x.length !== N || lastX.x.some((v, j) => !Object.is(v, x[j]))) {
      outCols.push({ ...column(run.X.name + sfx, Float64Array.from(x)), role: 'x' });
      lastX = { name: run.X.name, x };
    }
    outCols.push({ ...column(`${run.label} (filtered)`, Float64Array.from(out)), role: 'y' }, { ...column(`${run.label} (taken out)`, Float64Array.from(removed)), role: 'none' });
    report.push(`${run.label}: at the order ${fmt(a, 4)}${d.mode === 'filter' && d.auto ? ' (the one that gathers it most)' : ''}, the band u ${b1} … ${b2} ${d.keep === 'keep' ? 'kept' : 'taken out'}; back by the order ${fmt(-a, 4)}${imRms > 1e-6 * Math.max(...y.map(Math.abs)) ? ` (the imaginary part left, RMS ${fmt(imRms)}, dropped)` : ''}.`);
  });
  tables.out = d.mode === 'scan' ? { name: 'order scan', columns: scanCols } : { name: d.mode === 'filter' ? 'filtered' : 'fractional transform', columns: outCols };
  return { tables, view, plots, labels: runs.map((r) => r.label).slice(0, plots.length), warnings: [...new Set(warnings)], report };
}
