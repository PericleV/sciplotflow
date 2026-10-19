// Descriptive statistics of a column (the missing values — NaN, text — left out).
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
