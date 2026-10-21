// The app's own messages and questions instead of the browser's alert, confirm and prompt: a message that goes by
// itself (notify), a question answered yes / no (ask), a text asked for (askText). Shown by <Dialogs /> (Dialogs.tsx).
import { useSyncExternalStore } from 'react';

export type Toast = { id: number; text: string; kind: 'info' | 'error' | 'ok' };
export type Question = { id: number; text: string; ok: string; danger: boolean; input?: string; done: (v: boolean | string | null) => void };

let toasts: Toast[] = [];
let question: Question | null = null;
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

// a message in the corner, gone after a while (errors stay longer); the kind from its words when not given
export function notify(text: string, kind?: Toast['kind']) {
  const k: Toast['kind'] = kind ?? (/could not|cannot|failed|not allowed|blocked|full|no longer|error|too large|not on the level|has no|no data file|nothing to|already/i.test(text) ? 'error' : 'info');
  const t: Toast = { id: next++, text, kind: k };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => dismiss(t.id), k === 'error' ? 12000 : 5000);
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// a question: true for its OK button (danger: the button red — something is removed)
export function ask(text: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => open({ text, ok: opts.ok ?? 'OK', danger: !!opts.danger, done: (v) => resolve(v === true) }));
}
// a text asked for (null: cancelled)
export function askText(text: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => open({ text, ok: 'OK', danger: false, input: initial, done: (v) => resolve(typeof v === 'string' ? v : null) }));
}
function open(q: Omit<Question, 'id'>) {
  // a question still open: answered “cancel” first
  question?.done(null);
  question = { ...q, id: next++ };
  emit();
}
export function answer(v: boolean | string | null) {
  const q = question;
  question = null;
  emit();
  q?.done(v);
}

export const useToasts = () => useSyncExternalStore(subscribe, () => toasts, () => toasts);
export const useQuestion = () => useSyncExternalStore(subscribe, () => question, () => question);
