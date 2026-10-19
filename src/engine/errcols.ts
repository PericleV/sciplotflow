// Columns of errors told by their names (SD, SE, SEM, err, error, σ, ±, std, stdev, uncertainty — before or after the
// rest of the name), and the Y each is the error of. Used by “Plot these columns”. Pure.
import { bareName } from './table.ts';

const ERR = /(^|[\s_.(-])(sd|s\.d\.|se|sem|s\.e\.m?\.?|err|error|errors|std|stdev|stddev|uncertainty|σ)([\s_.)-]|$)|^±|^δ/i;
export const isErrorName = (name: string) => ERR.test(bareName(name)) || /^±/.test(name.trim());
// what every error column is the error of: the Y whose name is in its own (“SD Control” → “Control”), else the nearest
// Y on its left (each Y one error)
export function errorTargets(names: string[], ys: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const strip = (n: string) => bareName(n).replace(ERR, ' ').replace(/[±δ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  names.forEach((n, j) => {
    if (!isErrorName(n)) return;
    const key = strip(n);
    const byName = key ? ys.find((y) => !out.has(y) && bareName(y).toLowerCase() === key) : undefined;
    const left = [...names.slice(0, j)].reverse().find((m) => ys.includes(m) && !isErrorName(m) && !out.has(m));
    const y = byName ?? left;
    if (y) out.set(y, n);
  });
  return out;
}
