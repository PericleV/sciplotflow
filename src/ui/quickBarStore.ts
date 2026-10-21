// The floating quick bar over an object clicked on a figure: shown or not (kept in this browser; its × hides it, the
// “Quick bar” switch of the Annotate tab and of the Figure Drawing editor shows it again).
import { useSyncExternalStore } from 'react';

const KEY = 'graph-flow:quick-bar';
let on = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
const listeners = new Set<() => void>();

export function setQuickBar(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    // storage unavailable: for this visit
  }
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const useQuickBar = () => useSyncExternalStore(subscribe, () => on, () => on);
