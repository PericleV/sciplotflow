// The app's messages (in the bottom right corner, gone by themselves) and its questions (a window over the page, Enter:
// OK, Escape: cancel). Their store: dialogStore.ts.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, CloseButton, TextInput } from '@mantine/core';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { answer, dismiss, useQuestion, useToasts, type Question } from './dialogStore.ts';

function QuestionBox() {
  const q = useQuestion();
  return q ? <QuestionWindow key={q.id} q={q} /> : null;
}

function QuestionWindow({ q }: { q: Question }) {
  const [text, setText] = useState(q.input ?? '');
  const box = useRef<HTMLDivElement>(null);
  // the OK button (or the text, all of it selected) ready for the keyboard
  useEffect(() => {
    requestAnimationFrame(() => {
      const input = box.current?.querySelector('input');
      if (input) {
        input.focus();
        input.select();
      } else box.current?.querySelector<HTMLButtonElement>('.dlg-ok')?.focus();
    });
  }, []);
  const ok = () => answer(q.input !== undefined ? text : true);
  const cancel = () => answer(q.input !== undefined ? null : false);
  return (
    <div
      className="dlg-shade"
      onPointerDown={(e) => e.target === e.currentTarget && cancel()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') cancel();
        else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          ok();
        }
      }}
    >
      <div className="dlg" role="dialog" aria-modal="true" ref={box}>
        <div className="dlg-text">{q.text}</div>
        {q.input !== undefined && <TextInput value={text} onChange={(e) => setText(e.currentTarget.value)} size="sm" />}
        <div className="dlg-buttons">
          <Button variant="default" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button className="dlg-ok" size="sm" color={q.danger ? 'red' : undefined} onClick={ok}>
            {q.ok}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const toasts = useToasts();
  return createPortal(
    <>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'error' ? <CircleAlert size={16} /> : t.kind === 'ok' ? <CircleCheck size={16} /> : <Info size={16} />}
            <span className="toast-text">{t.text}</span>
            <CloseButton size="sm" onClick={() => dismiss(t.id)} aria-label="Close" />
          </div>
        ))}
      </div>
      <QuestionBox />
    </>,
    document.body,
  );
}
