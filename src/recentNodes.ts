// The nodes added last (their keys in the lists, the newest first), kept in this browser: the Recent group of the
// nodes panel and of the canvas menu.
const KEY = 'graph-flow:recent-nodes';
export const RECENT_MOST = 6;

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MOST) : [];
  } catch {
    return [];
  }
}
// a node added: first in the list (once)
export function pushRecent(key: string): string[] {
  const next = [key, ...loadRecent().filter((k) => k !== key)].slice(0, RECENT_MOST);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: not remembered */
  }
  return next;
}
