// Math column ▸ rules for chosen rows: after the formula, in order, rows chosen (a list of rows, ranges, every n-th, a
// condition, or all) given a formula of the inputs and v, the value so far.
import type { RowRule } from '../types.ts';
import { AutoText, Select, TextInput } from './ui.tsx';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

export function RowRules({ rules, onChange }: { rules: RowRule[]; onChange: (rules: RowRule[]) => void }) {
  const setRule = (k: number, p: Partial<RowRule>) => onChange(rules.map((x, j) => (j === k ? { ...x, ...p } : x)));
  return (
    <>
      {rules.length > 0 && <div className="section">Rules for chosen rows, applied in order</div>}
      {rules.map((rule, k) => (
        <div key={k} className="rule">
          <div className="row">
            <b>{k + 1}</b>
            <Select seg
              value={rule.mode}
              options={[
                ['rows', 'rows'],
                ['condition', 'where'],
                ['all', 'all rows'],
              ]}
              onChange={(mode) => setRule(k, { mode })}
            />
            {rule.mode !== 'all' && (
              <TextInput
                className="grow-text"
                value={rule.rows}
                placeholder={rule.mode === 'rows' ? '3, 7, 10-20, 1:2:100, 50-end' : 'A > 5 and B < 2'}
                title={rule.mode === 'rows' ? 'Rows (counted from 1): 3, 7, 12 · 10-20 · 1:2:100 (from 1 to 100 every 2) · 50-end' : 'A condition of the inputs: < > <= >= == !=, and, or, not; v = the value so far'}
                onChange={(rows) => setRule(k, { rows })}
              />
            )}
            <button className="nodrag ts-btn" title="Remove this rule" onClick={() => onChange(rules.filter((_, j) => j !== k))}>
              <X {...IC} />
            </button>
          </div>
          <div className="formula-row">
            <span className="muted">=</span>
            <AutoText className="mono" value={rule.formula} placeholder="e.g. A + 100, v*2, NaN → 0: if(isnan(v), 0, v)" onChange={(formula) => setRule(k, { formula })} />
          </div>
        </div>
      ))}
      <button className="nodrag" title="Give chosen rows (a list, a condition) a formula of their own, applied after the one above; v is the value so far" onClick={() => onChange([...rules, { mode: 'rows', rows: '', formula: '' }])}>
        + Rule for chosen rows
      </button>
    </>
  );
}
