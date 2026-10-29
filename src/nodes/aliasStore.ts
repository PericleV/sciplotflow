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

// A list of columns as written (2, B-D, names, !name, name-name), the names in it renamed since shown by their names now
// (what is typed over it is kept as typed).
export function shownList(text: string, a: Aliases): string {
  const now = (t: string) => a.cols?.[t.trim()];
  if (!a.cols || !text.trim()) return text;
  const whole = now(text);
  if (whole !== undefined) return whole;
  return text
    .split(',')
    .map((raw) => {
      const m = /^(\s*!?\s*)(.*?)(\s*)$/.exec(raw)!;
      const one = now(m[2]);
      if (one !== undefined) return m[1] + one + m[3];
      const r = /^(.+?)(\s*-\s*)(.+)$/.exec(m[2]);
      if (r && (now(r[1]) !== undefined || now(r[3]) !== undefined)) return m[1] + (now(r[1]) ?? r[1]) + r[2] + (now(r[3]) ?? r[3]) + m[3];
      return raw;
    })
    .join(',');
}
export const useShownList = (text: string) => shownList(text, useContext(NameAliases));
