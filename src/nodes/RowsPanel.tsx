// The rows a node works on, in the controls of the options panels: all, ranges, a list, or where — conditions chosen
// (a column, a comparison, a value; all of them true or any one), the formula optional (the conditions written as one
// when it is turned on).
import { ActionIcon, Button, TextInput, Tooltip } from '@mantine/core';
import { Plus, X } from 'lucide-react';
import type { NodeResult } from '../engine/evaluate.ts';
import { condReady, condsFormula, ROW_OPS, usesFormula, type RowCond, type RowRange, type RowSelect } from '../engine/rowsel.ts';
import { roleOf, type Column } from '../engine/table.ts';
import { Choice, ListField, NumField, Row, Toggle } from '../ui/props.tsx';

const NO_RANGE: RowRange = { from: NaN, to: NaN };
const FORMULA_HINT = (hasX: boolean) => `A condition, true on the rows used: ${hasX ? 'x (the X column), ' : ''}the columns A, B, C … (their letters), i (the row, 1 … n), n; < > <= >= == !=, and, or, not, mod, isnan …`;

// Where: the conditions, or the formula
export function WhereConds({ value, onChange, names, hasX }: { value: RowSelect; onChange: (v: RowSelect) => void; names: string[]; hasX: boolean }) {
  const conds = value.conds ?? [];
  const formula = usesFormula(value);
  const first: RowCond = { col: hasX ? '' : (names[0] ?? ''), op: '>', v: NaN };
  const setCond = (k: number, p: Partial<RowCond>) => onChange({ ...value, conds: conds.map((c, j) => (j === k ? { ...c, ...p } : c)) });
  const cols: [string, string][] = [...(hasX ? [['', 'x (the X column)'] as [string, string]] : []), ...names.map((n): [string, string] => [n, n])];
  // the columns as the formula names them (their letters; x: the X column)
  const asColumns = names.map((name) => ({ name, values: new Float64Array(0) }) as Column);
  const toFormula = () => condsFormula(conds, value.join ?? 'all', hasX ? asColumns.find((_, j) => roleOf(asColumns, j) === 'x') : undefined, asColumns);
  return (
    <div className="where">
      {formula ? (
        <Tooltip label={FORMULA_HINT(hasX)} multiline w={280}>
          <TextInput value={value.rule ?? ''} placeholder={hasX ? 'x >= 500 and x <= 600' : 'mod(i, 2) == 0'} onChange={(e) => onChange({ ...value, rule: e.currentTarget.value })} aria-label="Formula" />
        </Tooltip>
      ) : (
        <>
          {conds.length > 1 && (
            <Row label="Keep if" hint="The rows kept: those where all the conditions are true, or where any one of them is">
              <Choice<'all' | 'any'>
                value={value.join ?? 'all'}
                onChange={(join) => onChange({ ...value, join: join === 'all' ? undefined : join })}
                options={[
                  ['all', 'All are true'],
                  ['any', 'Any is true'],
                ]}
              />
            </Row>
          )}
          {conds.map((c, k) => (
            <div key={k} className="where-cond">
              <div className="where-line">
                <span className="where-word">{k ? ((value.join ?? 'all') === 'any' ? 'or' : 'and') : 'where'}</span>
                <ListField value={c.col} options={cols} onChange={(col) => setCond(k, { col })} label="Column" />
                <Tooltip label="Remove this condition">
                  <ActionIcon variant="subtle" size="sm" onClick={() => onChange({ ...value, conds: conds.filter((_, j) => j !== k) })} aria-label="Remove this condition">
                    <X size={14} />
                  </ActionIcon>
                </Tooltip>
              </div>
              <div className="where-line">
                <span className="where-op">
                  <ListField value={c.op} options={ROW_OPS} onChange={(op) => setCond(k, { op })} label="Comparison" />
                </span>
                {c.op !== 'empty' && c.op !== 'filled' && <NumField value={c.v ?? NaN} placeholder="value" onChange={(v) => setCond(k, { v })} />}
                {c.op === 'between' && (
                  <>
                    <span className="where-word">and</span>
                    <NumField value={c.v2 ?? NaN} placeholder="value" onChange={(v2) => setCond(k, { v2 })} />
                  </>
                )}
              </div>
            </div>
          ))}
          <Button variant="default" size="xs" leftSection={<Plus size={13} />} onClick={() => onChange({ ...value, conds: [...conds, conds.length ? { ...conds[conds.length - 1], v: NaN, v2: undefined } : first] })}>
            Add condition
          </Button>
        </>
      )}
      <Toggle
        value={formula}
        label="Write it as a formula"
        onChange={(on) => {
          if (!on) return onChange({ ...value, formula: false, conds: conds.length ? conds : [first] });
          // the conditions written as a formula (shown, to learn it), unless one is written already
          const f = conds.some(condReady) ? toFormula() : null;
          onChange({ ...value, formula: true, ...(f ? { rule: f } : {}) });
        }}
      />
    </div>
  );
}

// All the choices of the rows (the panel of Filter & sort rows); names: the columns of the data
export function RowsControls({ value, onChange, hasX, result, names }: { value: RowSelect | undefined; onChange: (v: RowSelect) => void; hasX: boolean; result?: NodeResult; names: string[] }) {
  const v = value ?? { mode: 'all' };
  const ranges = v.ranges?.length ? v.ranges : [NO_RANGE];
  const byX = v.by === 'x' && hasX;
  const setRange = (k: number, p: Partial<RowRange>) => onChange({ ...v, ranges: ranges.map((r, j) => (j === k ? { ...r, ...p } : r)) });
  const sr = result?.view.statRows;
  return (
    <>
      <Row label="Rows" hint="The rows used: all, ranges, a list of row numbers, or where conditions are true">
        <Choice<RowSelect['mode']>
          value={v.mode}
          onChange={(mode) => onChange({ ...v, mode, ...(mode === 'rule' && !v.conds?.length && !v.rule?.trim() ? { conds: [{ col: hasX ? '' : (names[0] ?? ''), op: '>', v: NaN }] } : {}) })}
          options={[
            ['all', 'All'],
            ['range', 'Ranges'],
            ['list', 'List', 'Row numbers: 3, 7-12, 50-end'],
            ['rule', 'Where', 'Where conditions are true'],
          ]}
        />
      </Row>
      {v.mode === 'range' && (
        <>
          {hasX && (
            <Row label="By" hint="Ranges of row numbers (1 … n), or of the values of the X column">
              <Choice<'row' | 'x'>
                value={byX ? 'x' : 'row'}
                onChange={(by) => onChange({ ...v, by })}
                options={[
                  ['row', 'Row number'],
                  ['x', 'X value'],
                ]}
              />
            </Row>
          )}
          {ranges.map((r, k) => (
            <Row key={k} label={k ? 'and' : 'From – to'} hint={byX ? 'X values (empty: the smallest / the largest)' : 'Row numbers (empty: the first / the last)'}>
              <div className="range-line">
                <NumField value={r.from} placeholder="all" onChange={(from) => setRange(k, { from })} />
                <span>–</span>
                <NumField value={r.to} placeholder="all" onChange={(to) => setRange(k, { to })} />
                {ranges.length > 1 && (
                  <ActionIcon variant="subtle" size="sm" onClick={() => onChange({ ...v, ranges: ranges.filter((_, j) => j !== k) })} aria-label="Remove this range">
                    <X size={14} />
                  </ActionIcon>
                )}
              </div>
            </Row>
          ))}
          <Row label="">
            <Button variant="default" size="xs" leftSection={<Plus size={13} />} onClick={() => onChange({ ...v, ranges: [...ranges, NO_RANGE] })}>
              Add a range
            </Button>
          </Row>
        </>
      )}
      {v.mode === 'list' && (
        <Row label="Row numbers" hint="3, 7-12, 1:2:100 (every 2nd), 50-end: rows count from 1">
          <TextInput value={v.list ?? ''} placeholder="3, 7-12, 50-end" onChange={(e) => onChange({ ...v, list: e.currentTarget.value })} />
        </Row>
      )}
      {v.mode === 'rule' && <WhereConds value={v} onChange={onChange} names={names} hasX={hasX} />}
      {sr && v.mode !== 'all' && (
        <div className="hint rows-count">
          {sr.used} of {sr.of} rows{sr.text ? `: ${sr.text}` : ''}
        </div>
      )}
    </>
  );
}
