// A part of a figure asked for by a double-click on it (as in Origin): an axis (axis:bottom, axis:Y3 …), the frame, the
// legend, a curve (curve:<its key>), an annotation (ann:<its id>) or the page — of a node. The node's panel opens it: its
// tab, its side, its item, scrolled into view and flashed.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

export type Focus = { node: string; part: string; seq: number; at: number };
let current: Focus | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function focusPart(node: string, part: string) {
  current = { node, part, seq: ++seq, at: Date.now() };
  listeners.forEach((l) => l());
}

// the part asked for of this node, once (a panel opened later — the node clicked again — does not open it again)
export function useFigureFocus(node: string | null, onFocus: (part: string, seq: number) => void) {
  const f = useSyncExternalStore(subscribe, () => current);
  const done = useRef(0);
  const cb = useRef(onFocus);
  useLayoutEffect(() => {
    cb.current = onFocus;
  });
  useEffect(() => {
    if (!f || !node || f.node !== node || f.seq === done.current || Date.now() - f.at > 2000) return;
    done.current = f.seq;
    cb.current(f.part, f.seq);
  }, [f, node]);
}

// the element marked data-flash = seq: scrolled into view and flashed (once it is drawn)
export function flashLater(n: number) {
  let tries = 0;
  const go = () => {
    const el = document.querySelector(`[data-flash="${n}"]`);
    if (!el) {
      if (++tries < 20) setTimeout(go, 50);
      return;
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.remove('focus-flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('focus-flash');
    setTimeout(() => el.classList.remove('focus-flash'), 1400);
  };
  setTimeout(go, 30);
}
