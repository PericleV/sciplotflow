// The columns and sheets a node names that are now called otherwise (renamed since they were chosen, or found at their
// place in another source: src/engine/refs.ts), from its result: its choices show them by their names now.
import { createContext, useContext } from 'react';
import type { Aliases } from '../engine/refs.ts';

export const NameAliases = createContext<Aliases>({});

// The value as shown among the options: itself, else its name now (when that is one of them).
export function useShownName<T>(value: T, has: (v: string) => boolean): T | string {
  const a = useContext(NameAliases);
  if (typeof value !== 'string' || !value || has(value)) return value;
  const now = a.cols?.[value] ?? a.sheets?.[value];
  return now !== undefined && has(now) ? now : value;
}
