// Descriptive statistics of a column (the missing values — NaN, text — left out).
import { tInv } from './dist.ts';
export type StatKey = 'n' | 'missing' | 'mean' | 'sd' | 'se' | 'min' | 'q1' | 'median' | 'q3' | 'max' | 'range' | 'sum' | 'cv';
export const STATS: { key: StatKey; label: string; help: string; unitless?: boolean }[] = [
  { key: 'n', label: 'N', help: 'number of values (missing ones left out)', unitless: true },
  { key: 'missing', label: 'Missing', help: 'number of missing values (empty, text, NaN)', unitless: true },
  { key: 'mean', label: 'Mean', help: 'arithmetic mean' },
  { key: 'sd', label: 'SD', help: 'standard deviation of the sample (divided by N − 1)' },
  { key: 'se', label: 'SE of mean', help: 'standard error of the mean, SD / √N' },
  { key: 'min', label: 'Min', help: 'smallest value' },
  { key: 'q1', label: 'Q1', help: 'first quartile (25th percentile, linear interpolation between the order statistics)' },
  { key: 'median', label: 'Median', help: 'median (50th percentile)' },
  { key: 'q3', label: 'Q3', help: 'third quartile (75th percentile)' },
  { key: 'max', label: 'Max', help: 'largest value' },
  { key: 'range', label: 'Range', help: 'max − min' },
  { key: 'sum', label: 'Sum', help: 'sum of the values' },
  { key: 'cv', label: 'CV', help: 'coefficient of variation, SD / mean', unitless: true },
];

// The statistics asked besides the usual ones: percentiles (pcts: “10, 50, 90”: P10, P50, P90, as D10, D50, D90 of a
// size distribution) and the confidence interval of the mean (ci: its level in %, absent: none), from t with N − 1
// degrees of freedom
export type ExtraStat = { key: string; label: string; help: string };
export function extraStats(pcts: string | undefined, ci: number | undefined): ExtraStat[] {
  const ps = [...new Set((pcts ?? '').split(/[\s,;]+/).map(Number).filter((p) => p > 0 && p < 100))];
  const out: ExtraStat[] = ps.map((p) => ({ key: `p${String(p).replace('.', '_')}`, label: `P${p}`, help: `the ${p}th percentile (${p} % of the values below it)` }));
  if (ci && ci > 0 && ci < 100)
    out.push({ key: 'cilo', label: `CI${ci} low`, help: `the low end of the ${ci} % confidence interval of the mean (t, N − 1)` }, { key: 'cihi', label: `CI${ci} high`, help: `the high end of the ${ci} % confidence interval of the mean` });
  return out;
}
// every statistic of the values (the usual ones and those asked)
export function describeAll(values: ArrayLike<number>, extra: ExtraStat[], ci?: number): Record<string, number> {
  const d: Record<string, number> = describe(values);
  if (!extra.length) return d;
  const v: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) v.push(values[i]);
  const sorted = Float64Array.from(v).sort();
  for (const e of extra) {
    if (e.key === 'cilo' || e.key === 'cihi') {
      const t = d.n > 1 && ci ? tInv(1 - (1 - ci / 100) / 2, d.n - 1) : NaN;
      d[e.key] = d.mean + (e.key === 'cilo' ? -1 : 1) * t * d.se;
    } else d[e.key] = percentile(sorted, Number(e.key.slice(1).replace('_', '.')) / 100);
  }
  return d;
}

// Percentile p (0 … 1) of sorted values: linear between the order statistics (the usual definition).
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function describe(values: ArrayLike<number>): Record<StatKey, number> {
  const v: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) v.push(values[i]);
  const n = v.length;
  const sorted = Float64Array.from(v).sort();
  // mean by compensated (Kahan) summation, variance by the two-pass formula (no cancellation)
  let sum = 0;
  let c = 0;
  for (const x of v) {
    const y = x - c;
    const t = sum + y;
    c = t - sum - y;
    sum = t;
  }
  const mean = n ? sum / n : NaN;
  let ss = 0;
  let comp = 0;
  for (const x of v) {
    ss += (x - mean) ** 2;
    comp += x - mean;
  }
  const variance = n > 1 ? (ss - (comp * comp) / n) / (n - 1) : NaN;
  const sd = Math.sqrt(variance);
  const min = n ? sorted[0] : NaN;
  const max = n ? sorted[n - 1] : NaN;
  return {
    n,
    missing: values.length - n,
    mean,
    sd,
    se: sd / Math.sqrt(n),
    min,
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    max,
    range: max - min,
    sum: n ? sum : 0,
    cv: sd / mean,
  };
}
