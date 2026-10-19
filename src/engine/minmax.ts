// The smallest / largest of many values without spreading them into arguments (Math.min(...a) overflows the call stack
// past about 10⁵ values). The same results as Math.min / Math.max: NaN if any value is NaN, ±Infinity when empty.
export function minOf(values: Iterable<number>): number {
  let m = Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) return NaN;
    if (v < m) m = v;
  }
  return m;
}
export function maxOf(values: Iterable<number>): number {
  let m = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) return NaN;
    if (v > m) m = v;
  }
  return m;
}
