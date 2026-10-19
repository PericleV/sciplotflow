// A value with its error for the results of a fit: “660.24 ± 0.28”.
import { fmtNum } from './table.ts';

// A value with its error: as many decimals as the error's first two significant digits ask.
export function fmtPm(v: number, e: number): string {
  if (!Number.isFinite(v)) return '—';
  if (!(e > 0) || !Number.isFinite(e)) return fmtNum(v, 6);
  const d = Math.max(0, 1 - Math.floor(Math.log10(e)));
  return Math.abs(v) < 1e5 && Math.abs(v) >= 1e-3 && d < 12 ? `${v.toFixed(d)} ± ${e.toFixed(d)}` : `${fmtNum(v, 5)} ± ${fmtNum(e, 2)}`;
}
