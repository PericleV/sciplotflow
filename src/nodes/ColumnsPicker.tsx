// The columns a node works on, chosen from the dataset: automatic (empty), one column from the list, or several — a
// list written (2, B-D, names, A*), shown when “several” is chosen or when the text is not one column's name.
import { useState } from 'react';
import { Select, TextInput } from './ui.tsx';

const LIST = '\u0000list';

export function ColumnsPicker({ value, names, onChange, auto, title }: { value: string; names: string[]; onChange: (v: string) => void; auto: string; title?: string }) {
  const [list, setList] = useState(false);
  const v = value.trim();
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
      {mode === LIST && <TextInput value={value} placeholder="2, B-D, names, A*" title={title ?? 'A list: 2, B-D, names, A*'} onChange={onChange} />}
    </span>
  );
}
