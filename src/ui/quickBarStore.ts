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

// In the Figure Drawing editor: by the objects selected (null), or where it was dragged (px from the top-left corner of
// the room of the page; kept in this browser)
const AT = 'graph-flow:quick-bar-at';
let placed: { x: number; y: number } | null = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(AT) ?? 'null') as { x: number; y: number } | null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
})();
export function setQuickBarAt(v: { x: number; y: number } | null) {
  placed = v;
  try {
    if (v) localStorage.setItem(AT, JSON.stringify(v));
    else localStorage.removeItem(AT);
  } catch {
    // storage unavailable: for this visit
  }
  listeners.forEach((f) => f());
}
export const useQuickBarAt = () => useSyncExternalStore(subscribe, () => placed, () => placed);
