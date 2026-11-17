// The audit of 2026-11-17, section Graph: the fixes of the Stat group checked (Bar chart, Box & violin, Pie, Histogram,
// Probability plot), against scipy where there is a reference (truncnorm / Cauchy cut to the bins, weibull_min with γ)
import { barChart, rawTable, wideTable } from '../src/engine/barchart.ts';
import { boxGroups, boxViolin } from '../src/engine/boxviolin.ts';
import { pieChart } from '../src/engine/piechart.ts';
import { histogram } from '../src/engine/histogram.ts';
import { probPlot } from '../src/engine/probplot.ts';
import { column, type Column } from '../src/engine/table.ts';
import { BARCHART_DEFAULTS, BOXVIOLIN_DEFAULTS, HISTOGRAM_DEFAULTS, PIE_DEFAULTS, PROBPLOT_DEFAULTS } from '../src/defaults.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditGraphStat(ok: Ok) {
  const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const masked = (name: string, v: number[], m: number[]): Column => ({ ...column(name, Float64Array.from(v)), mask: Uint8Array.from(m) });
  const text = (name: string, t: string[]): Column => column(name, Float64Array.from(t, () => NaN), t);

  // V8: the masked values left out of the Bar chart (raw and table), Box & violin (table and raw) and Pie, and said
  {
    const v = masked('v (mV)', [1, 2, 3, 100], [0, 0, 0, 1]);
    const g = text('g', ['a', 'a', 'a', 'a']);
    const t = rawTable(v, g, undefined, 'mean', 'sd', v.name);
    const b = barChart(t, { ...BARCHART_DEFAULTS, mode: 'raw', stat: 'mean', err: 'sd' });
    const w = wideTable(undefined, [v], [undefined]);
    const bt = boxGroups({ ...BOXVIOLIN_DEFAULTS, mode: 'table' }, [v]);
    const rt = boxViolin(bt.cats, bt.series, bt.groups, { ...BOXVIOLIN_DEFAULTS, mode: 'table' });
    const br = boxGroups({ ...BOXVIOLIN_DEFAULTS, mode: 'raw' }, [], v, g);
    const rr = boxViolin(br.cats, br.series, br.groups, { ...BOXVIOLIN_DEFAULTS, mode: 'raw' });
    const N = (r: typeof rt) => (typeof r === 'string' ? NaN : r.table.columns.find((c) => c.name === 'N')!.values[0]);
    const outl = (r: typeof rt) => (typeof r === 'string' ? NaN : r.table.columns.find((c) => c.name === 'outliers')!.values[0]);
    const pie = pieChart(wideTable(text('c', ['p', 'q', 'r', 's']), [v], [undefined]), PIE_DEFAULTS);
    const pct = (r: typeof pie) => (typeof r === 'string' ? [] : Array.from(r.table.columns.find((c) => c.name === 'percent')!.values));
    const said = (r: { warnings: string[] } | string) => typeof r !== 'string' && r.warnings.includes('1 masked value left out.');
    // Pie of raw rows counted (no value column): a row whose group is masked not counted
    const pieRawCol = rawTable(column('count', Float64Array.from([1, 1, 1, 1])), { ...text('g', ['x', 'x', 'y', 'y']), mask: Uint8Array.from([0, 0, 1, 0]) }, undefined, 'count', 'none', 'count');
    const pieRaw = pieChart(pieRawCol, PIE_DEFAULTS);
    ok(
      near(t.series[0].values[0], 2) && near(t.series[0].plus[0], 1) && said(b) && Number.isNaN(w.series[0].values[3]) && w.masked === 1 && N(rt) === 3 && outl(rt) === 0 && said(rt) && N(rr) === 3 && said(rr) && pct(pie).length === 3 && near(pct(pie)[2], 50) && said(pie) && pieRawCol.series[0].values.join() === '2,1' && near(pct(pieRaw)[1], 100 / 3) && said(pieRaw),
      `V8: masked 100 among 1, 2, 3 left out and said: bar ${t.series[0].values[0]} ± ${t.series[0].plus[0]}, box N ${N(rt)} / ${N(rr)} with ${outl(rt)} outliers, pie ${pct(pie).map((p) => p.toFixed(1)).join(' / ')} %`,
    );
  }

  // V9: a count has no error bar; a sum the error of a total (SD·√n, its 95 % CI n times the mean's), not min – max
  {
    const v = column('v (mV)', Float64Array.from([10, 20, 50]));
    const g = text('g', ['a', 'a', 'a']);
    const run = (stat: 'count' | 'sum', err: 'sd' | 'ci95' | 'minmax') => {
      const t = rawTable(v, g, undefined, stat, err, 'v');
      const b = barChart(t, { ...BARCHART_DEFAULTS, mode: 'raw', stat, err });
      return { e: t.series[0].plus[0], drawn: typeof b !== 'string' && !!b.curves[0].bars?.err, warned: typeof b !== 'string' && b.warnings.length > 0 };
    };
    const c = run('count', 'sd');
    const s = run('sum', 'sd');
    const s95 = run('sum', 'ci95');
    const smm = run('sum', 'minmax');
    // scipy: np.std([10, 20, 50], ddof=1)·√3 = 36.0555127546, t.ppf(0.975, 2)·that = 155.134350374
    ok(Number.isNaN(c.e) && !c.drawn && c.warned && near(s.e, 36.0555127546, 1e-10) && s.drawn && !s.warned && near(s95.e, 155.134350374, 1e-8) && Number.isNaN(smm.e) && !smm.drawn && smm.warned, `V9: count without an error bar (was ± SD of the values), sum ± ${s.e.toFixed(4)} (SD·√n), 95 % CI ± ${s95.e.toFixed(3)}; min – max on a sum: none, said`);
  }

  // V10: the fits from the data take the values inside the bins only (Normal, Cauchy cut to the bins)
  {
    const h = histogram([{ name: 'A', values: [1, 2, 3, 4, 5, 50] }], { ...HISTOGRAM_DEFAULTS, bins: { ...HISTOGRAM_DEFAULTS.bins, mode: 'width', width: 1, start: 0, from: 0, to: 6 }, fits: [{ kind: 'normal', method: 'data' }, { kind: 'lorentz', method: 'data' }] }, 'x');
    const P = (i: number, k: number) => (typeof h === 'string' ? NaN : h.fits[i].params[k].value);
    // scipy: truncnorm on [0, 6] → μ 3, σ 1.74181665; Cauchy cut to [0, 6] → x0 3, γ 2.28070938
    ok(typeof h !== 'string' && near(P(0, 0), 3, 1e-5) && near(P(0, 1), 1.74181665, 1e-5) && near(P(1, 0), 3, 1e-5) && near(P(1, 1), 2.28070938, 1e-5) && h.warnings.some((w) => w.includes('1 value outside left out')), `V10: Normal on the bins 0–6 μ ${P(0, 0).toFixed(4)}, σ ${P(0, 1).toFixed(4)} (was 7.7, 14.9), Cauchy γ ${P(1, 1).toFixed(4)}, as scipy cut to the bins`);
  }

  // V13: with a threshold γ, the P-P at F(x − γ) and the Q-Q in the data's units at γ + the quantiles
  {
    const wb = [62, 75, 88, 97, 110, 128, 145, 162, 190, 210, 238, 270];
    const pp = probPlot([{ name: 'w', values: wb }], { ...PROBPLOT_DEFAULTS, kind: 'pp', dist: 'weibull', threshold: true }, 'v');
    const qq = probPlot([{ name: 'w', values: wb }], { ...PROBPLOT_DEFAULTS, kind: 'qq', dist: 'weibull', threshold: true, qqAxis: 'data', line: 'dist' }, 'v');
    const px = typeof pp === 'string' ? [] : Array.from(pp.curves[0].series.x.values);
    const qx = typeof qq === 'string' ? [] : Array.from(qq.curves[0].series.x.values);
    // scipy weibull_min.cdf(x − γ, β, scale=η) with the fitted γ 60.3413: 0.0089041 at 62, 0.928274 at 270;
    // γ + ppf of the Blom positions: 67.8071 … 292.858
    ok(near(px[0], 0.0089041015, 1e-5) && near(px[11], 0.9282742020, 1e-6) && near(qx[0], 67.80711866, 1e-6) && near(qx[11], 292.8579493, 1e-6), `V13: Weibull with γ: P-P ${px[0]?.toFixed(4)} … ${px[11]?.toFixed(4)} (was 0.18 … 0.985), Q-Q ${qx[0]?.toFixed(2)} … ${qx[11]?.toFixed(2)} against the data 62 … 270`);
  }

  // V16: Uniform with a status column: the suspended values really left out, the positions of the failures alone
  {
    const u = probPlot([{ name: 'u', values: [1, 2, 3, 4, 5, 6, 7, 8], susp: [false, false, true, false, false, true, false, false] }], { ...PROBPLOT_DEFAULTS, kind: 'prob', dist: 'uniform' }, 'v');
    const y = typeof u === 'string' ? [] : Array.from(u.curves[0].series.y.values);
    // 6 failures, Blom: (6 − 0.375) / 6.25 = 0.9
    ok(typeof u !== 'string' && y.length === 6 && near(y[5], 90, 1e-12) && near(y[0], 10, 1e-12) && u.rows[0].n === 6 && u.warnings.some((w) => w.includes('2 suspended values left out')), `V16: Uniform, 8 values with 2 suspended: 6 points, the last at ${y[5]?.toFixed(1)} % (was 68 %)`);
  }
}
