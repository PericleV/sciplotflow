// A worksheet's columns whose text looks like numbers (300 K, 1,5, 1.2 ± 0.1): proposed under the table, and read as
// numbers only when asked — the rules chosen, every column shown before and after.
import { useState } from 'react';
import { columnLetter } from '../engine/csv.ts';
import { TO_NUMBER_DEFAULTS, toNumbers, type ToNumberRules } from '../engine/convert.ts';
import type { Dataset } from '../engine/table.ts';
import { Check, Select } from './ui.tsx';

// the proposal: the columns (their places in the table shown) and a few of their cells
export function ConvertProposal({ ds, cols, onOpen, onLater }: { ds: Dataset; cols: { c: number; examples: string[] }[]; onOpen: () => void; onLater: () => void }) {
  return (
    <div className="sheet-convert row wrap">
      <span className="hint">
        Text that looks like numbers in {cols.map((q) => `${columnLetter(q.c)} (${q.examples.join(', ')} …)`).join(', ')}
        {cols.length === 1 && ds.columns[cols[0].c] ? ` · ${ds.columns[cols[0].c].name}` : ''}.
      </span>
      <button className="nodrag" title="Choose how the cells are read, see them before and after, then convert" onClick={onOpen}>
        Convert…
      </button>
      <button className="nodrag" title="Leave them as text (asked again when the table is opened again)" onClick={onLater}>
        Not now
      </button>
    </div>
  );
}

// the rules and, for every column, its name and first cells before and after; Convert writes them into the table
export function ConvertPanel({ ds, cols, onConvert, onCancel }: { ds: Dataset; cols: number[]; onConvert: (r: ToNumberRules) => void; onCancel: () => void }) {
  const [r, setR] = useState<ToNumberRules>(TO_NUMBER_DEFAULTS);
  const set = (p: Partial<ToNumberRules>) => setR({ ...r, ...p });
  return (
    <div className="sheet-convert">
      <div className="row wrap">
        <Select<ToNumberRules['decimal']>
          value={r.decimal}
          title="The decimal separator: found by itself in every column, or a point, or a comma"
          options={[
            ['auto', 'decimal: found by itself'],
            ['.', 'decimal point (1.5)'],
            [',', 'decimal comma (1,5)'],
          ]}
          onChange={(decimal) => set({ decimal })}
        />
        <Select<ToNumberRules['percent']>
          value={r.percent}
          title="“25 %”: 25 (the column named in %) or 0.25"
          options={[
            ['number', '25 % gives 25'],
            ['fraction', '25 % gives 0.25'],
          ]}
          onChange={(percent) => set({ percent })}
        />
        <Select<ToNumberRules['below']>
          value={r.below}
          title="“<0.01”: empty, the limit, or half of it"
          options={[
            ['empty', '<0.01: empty'],
            ['limit', '<0.01: 0.01'],
            ['half', '<0.01: 0.005'],
          ]}
          onChange={(below) => set({ below })}
        />
      </div>
      <div className="row wrap">
        <Check label="units" title="“300 K”: 300, and “(K)” into the column’s name" value={r.units} onChange={(units) => set({ units })} />
        <Check label="± error" title="“1.23 ± 0.05”, “1.23(5)”: the error in a column of its own after it (±Y)" value={r.pm} onChange={(pm) => set({ pm })} />
        <Check label="thousands" title="1 200,5 · 1,200.5: the separators of thousands left out" value={r.thousands} onChange={(thousands) => set({ thousands })} />
        <Check label="×10^n" title="“3×10^-4”, “3·10⁻⁴”: 3e-4" value={r.times10} onChange={(times10) => set({ times10 })} />
        <Check label="first number of any text" title="“Sample_300K”: 300" value={r.first} onChange={(first) => set({ first })} />
      </div>
      {cols.map((c) => {
        const col = ds.columns[c];
        if (!col) return null;
        const res = toNumbers(col, r);
        const main = res.columns[0];
        const shown = Array.from({ length: col.values.length }, (_, i) => i)
          .filter((i) => col.text?.[i]?.trim())
          .slice(0, 3);
        return (
          <div key={c} className="hint">
            <b>
              {columnLetter(c)} · {col.name}
              {main.name !== col.name ? ` → ${main.name}` : ''}
            </b>
            {res.columns[1] ? ` (+ ${res.columns[1].name})` : ''}: {shown.map((i) => `${col.text![i]} → ${Number.isFinite(main.values[i]) ? main.values[i] : 'empty'}`).join(', ')}
            {res.failed.length > 0 && ` · ${res.failed.length} not read (left as text): ${res.failed.slice(0, 3).map((f) => `“${f.text}”`).join(', ')}`}
            {res.units.length > 0 && ` · different units (${res.units.join(', ')}): left out`}
          </div>
        );
      })}
      <div className="row">
        <button className="nodrag" onClick={() => onConvert(r)}>
          Convert
        </button>
        <button className="nodrag" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
