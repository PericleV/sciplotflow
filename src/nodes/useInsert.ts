// Text put into a formula's field where the cursor is (over the text selected), then a part of it selected, once the
// field shows the new text (ƒ Functions, Value from a row …, the columns' buttons).
import { useLayoutEffect, useRef, type RefObject } from 'react';

export type Insert = (text: string, from?: number, to?: number) => void;

export function useInsert(box: RefObject<HTMLTextAreaElement | HTMLInputElement | null>, value: string, onChange: (v: string) => void): Insert {
  const pending = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!pending.current || !el) return;
    el.focus();
    el.setSelectionRange(...pending.current);
    pending.current = null;
  }, [value, box]);
  return (text, from = text.length, to = from) => {
    const el = box.current;
    const a = el?.selectionStart ?? value.length;
    const b = el?.selectionEnd ?? a;
    pending.current = [a + from, a + to];
    onChange(value.slice(0, a) + text + value.slice(b));
  };
}
