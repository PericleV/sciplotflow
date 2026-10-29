// The columns a node works on, chosen from the dataset: automatic (empty), one column from the list, or several — a
// list written (2, B-D, names, A*), shown when “several” is chosen or when the text is not one column's name.
import { useState } from 'react';
import { Select, TextInput } from './ui.tsx';
import { useShownList } from './aliasStore.ts';

const LIST = '\u0000list';

export function ColumnsPicker({ value, names, onChange, auto, title }: { value: string; names: string[]; onChange: (v: string) => void; auto: string; title?: string }) {
  const [list, setList] = useState(false);
  // (a column renamed since it was written: shown by its name now)
  const shown = useShownList(value);
  const v = shown.trim();
  const mode = list || (v && !names.includes(v)) ? LIST : v;
  return (
    <span className="row wrap">
      <Select
        value={mode}
        title={title}
        options={[['', auto], ...names.map((n): [string, string] => [n, n]), [LIST, 'several (a list)']]}
        onChange={(m) => {
          setList(m === LIST);
          if (m !== LIST) onChange(m);
        }}
      />
      {mode === LIST && <TextInput value={shown} placeholder="2, B-D, names, A*" title={title ?? 'A list: 2, B-D, names, A*'} onChange={onChange} />}
    </span>
  );
}

// A list of columns typed (2, B-D, names, A*): a name in it renamed since shown by its name now.
export function NamesInput({ value, onChange, placeholder, title }: { value: string; onChange: (v: string) => void; placeholder?: string; title?: string }) {
  return <TextInput value={useShownList(value)} placeholder={placeholder} title={title} onChange={onChange} />;
}
