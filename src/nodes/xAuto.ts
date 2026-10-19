// The automatic choice of X, said the same way in every node: the X designated in the worksheet (each Y with the X on
// its left) — its name when there is one, “the X left of each Y” when there are several, else the row number.
import { roleOf, type ColumnRole } from '../engine/table.ts';

export function xAutoLabel(cols: { name: string; role?: ColumnRole }[] | undefined): string {
  // (a column without a designation of its own: X when it is the first, as the worksheet shows it)
  const xs = (cols ?? []).filter((_, j) => roleOf(cols!, j) === 'x');
  if (xs.length === 1) return `auto: ${xs[0].name}`;
  if (xs.length > 1) return 'auto: the X left of each Y';
  return 'auto: the row number';
}
// the Y columns when none is written: the designated ones
export const Y_AUTO = 'auto: the Y columns (designated)';
