// A curve's repeated X brought to one point each (Plot ▸ a curve ▸ style): the mean or the median, its spread as ±Y.
import type { AggErr, AggSpec, AggStat } from '../engine/aggregate.ts';
import { Field, Select } from './ui.tsx';

export function AggregateControls({ value, onChange }: { value: AggSpec | undefined; onChange: (a: AggSpec | undefined) => void }) {
  const a = value;
  return (
    <div className="trend-controls">
      <Field label="One point per X" title="Several Y at the same X (repeated measurements in long form): one point each; their mean or median, the spread as ±Y (shaded; Errors ▸ Y error as: bars)">
        <span className="row wrap">
          <Select<AggStat | ''>
            value={a?.stat ?? ''}
            options={[
              ['', 'no: every row'],
              ['mean', 'the mean'],
              ['median', 'the median'],
            ]}
            onChange={(stat) => onChange(stat ? { ...a, stat } : undefined)}
          />
          {a?.stat && (
            <Select<AggErr>
              value={a.err ?? 'none'}
              title="The ±Y of every point"
              options={[
                ['none', 'no spread'],
                ['sd', '± SD'],
                ['se', '± SE'],
                ['ci95', '95 % CI of the mean (t)'],
                ['minmax', 'min – max'],
                ['iqr', 'Q1 – Q3'],
              ]}
              onChange={(err) => onChange({ ...a, err })}
            />
          )}
        </span>
      </Field>
    </div>
  );
}
