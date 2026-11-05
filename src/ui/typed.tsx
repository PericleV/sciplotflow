// Text fields of the node data that keep the text as typed: the node's data reach a field a render later, and React would
// put the old text back, then the new one, the cursor sent to the end (a letter typed in the middle of a formula)
import { forwardRef, type ChangeEvent, type TextareaHTMLAttributes } from 'react';
import { useTyped } from './useTyped.ts';
import { Textarea, TextInput, type TextareaProps, type TextInputProps } from '@mantine/core';

type Typed<E> = { value: string; onChange: (e: ChangeEvent<E>) => void };

export const TypedTextInput = forwardRef<HTMLInputElement, Omit<TextInputProps, 'value' | 'onChange'> & Typed<HTMLInputElement>>(function TypedTextInput({ value, onChange, ...rest }, ref) {
  const [typed, setTyped] = useTyped(value);
  return (
    <TextInput
      ref={ref}
      {...rest}
      value={typed}
      onChange={(e) => {
        setTyped(e.currentTarget.value);
        onChange(e);
      }}
    />
  );
});

// (a plain text area)
export function TypedArea({ value, onChange, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & Typed<HTMLTextAreaElement>) {
  const [typed, setTyped] = useTyped(value);
  return (
    <textarea
      {...rest}
      value={typed}
      onChange={(e) => {
        setTyped(e.currentTarget.value);
        onChange(e);
      }}
    />
  );
}

export const TypedTextarea =forwardRef<HTMLTextAreaElement, Omit<TextareaProps, 'value' | 'onChange'> & Typed<HTMLTextAreaElement>>(function TypedTextarea({ value, onChange, ...rest }, ref) {
  const [typed, setTyped] = useTyped(value);
  return (
    <Textarea
      ref={ref}
      {...rest}
      value={typed}
      onChange={(e) => {
        setTyped(e.currentTarget.value);
        onChange(e);
      }}
    />
  );
});
