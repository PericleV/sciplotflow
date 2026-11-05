// A text field of the node data: its text as typed (typed.tsx)
import { useState } from 'react';

// the text as typed, at once; the node's text taken when it changes otherwise (Undo, a name put in)
export function useTyped(value: string): [string, (v: string) => void] {
  const [typed, setTyped] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setTyped(value);
  }
  return [typed, setTyped];
}
