// A panel that comes and goes with an animation: when asked for, shown at once and marked opening for `ms`; when asked to
// go, kept on screen `ms` more (marked closing), then gone. With “reduce motion” in the system: at once.
import { useEffect, useState } from 'react';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useLeaving<T>(value: T, ms = 180): { shown: T; closing: boolean; opening: boolean } {
  const [last, setLast] = useState(value);
  // when it came (its opening animation runs for ms)
  const [came, setCame] = useState(0);
  // the last value worth showing (a panel switched for another: the new one at once)
  if (value && value !== last) {
    setLast(value);
    if (!last && !reduced()) setCame((c) => c + 1);
  }
  const closing = !value && !!last && !reduced();
  const opening = !!value && came > 0;
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setLast(value), ms);
    return () => clearTimeout(t);
  }, [closing, value, ms]);
  useEffect(() => {
    if (!came) return;
    const t = setTimeout(() => setCame(0), ms);
    return () => clearTimeout(t);
  }, [came, ms]);
  return { shown: value || closing ? value || last : value, closing, opening };
}
