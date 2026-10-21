// Filter & sort rows, Clean data: the settings, the report, the rows that come out.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { useState } from 'react';
import { ActionIcon, Button, TextInput, Tooltip } from '@mantine/core';
import { Plus, X } from 'lucide-react';
import type { AppNode, CleanData, CleanNode, FilterData, FilterNode } from '../types.ts';
import { sortRulesOf, type SortKey, type SortRule } from '../engine/cleaning.ts';
import { DataPreview } from './DataNodes.tsx';
import { Y_AUTO } from './xAuto.ts';
import { RowsControls } from './RowsPanel.tsx';
import { Choice, ListField, NumField, Row, Section, Sections } from '../ui/props.tsx';
import { Field, InPort, Messages, NumInput, OutPort, Select, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';

function useNode<T>(id: string) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  return { r, names: (r?.view.available ?? []).map((c) => c.name), set: (p: Partial<T>) => updateNodeData(id, p as Record<string, unknown>) };
}

// keys pressed in the panel are its own
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};
const LIST = '\u0000list';
// columns: automatic (empty), one from the list, or several (a list written: 2, B-D, names, A*)
function ColumnsField({ value, names, onChange, auto, hint }: { value: string; names: string[]; onChange: (v: string) => void; auto: string; hint: string }) {
  const [list, setList] = useState(false);
  const v = value.trim();
  const mode = list || (v && !names.includes(v)) ? LIST : v;
  return (
    <>
      <ListField
        value={mode}
        label={hint}
        options={[['', auto], ...names.map((n): [string, string] => [n, n]), [LIST, 'several (a list)']]}
        onChange={(m) => {
          setList(m === LIST);
          if (m !== LIST) onChange(m);
        }}
      />
      {mode === LIST && <TextInput value={value} placeholder="2, B-D, names, A*" onChange={(e) => onChange(e.currentTarget.value)} aria-label={hint} />}
    </>
  );
}

// The sort rules, applied in turn: each moves whole rows or only some columns; by columns (the first, then the next for
// rows equal in it), every column by its own values, or reversed. Older projects: their keys shown as one rule.
const ORDER: [string, string][] = [
  ['up', 'Smallest first'],
  ['down', 'Largest first'],
];
function SortRules({ data, names, set }: { data: FilterData; names: string[]; set: (p: Partial<FilterData>) => void }) {
  const rules = sortRulesOf(data);
  const put = (sortRules: SortRule[]) => set({ sortRules, sorts: undefined, sortBy: '', desc: false });
  const setRule = (i: number, p: Partial<SortRule>) => put(rules.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const cols: [string, string][] = names.map((n) => [n, n]);
  const first = names[0] ?? '';
  return (
    <>
      {rules.length === 0 && <div className="hint">Not sorted.</div>}
      {rules.map((r, i) => {
        const keys = r.keys ?? [];
        const setKeys = (k: SortKey[]) => setRule(i, { keys: k });
        return (
          <div key={i} className="sort-card">
            <div className="sort-card-head">
              <b>Rule {i + 1}</b>
              <Tooltip label="Remove this rule">
                <ActionIcon variant="subtle" size="sm" onClick={() => put(rules.filter((_, j) => j !== i))} aria-label="Remove this rule">
                  <X size={14} />
                </ActionIcon>
              </Tooltip>
            </div>
            <Row label="Move" hint="What moves: whole rows (every column with them), or only some columns (the others stay as they are)">
              <ColumnsField value={r.cols ?? ''} names={names} auto="whole rows" hint="Whole rows, or only these columns: one, or several (a list: 2, B-D, names)" onChange={(c) => setRule(i, { cols: c || undefined })} />
            </Row>
            <Row label="How">
              <Choice<SortRule['how']>
                value={r.how}
                onChange={(how) => setRule(i, { how, ...(how === 'by' && !keys.length ? { keys: [{ col: first, desc: false }] } : {}) })}
                options={[
                  ['by', 'Sort by', 'Sorted by the values of columns'],
                  ['own', 'Each own', 'Every column moved sorted by its own values'],
                  ['reverse', 'Reverse', 'The last row with data first (empty rows at the end stay there)'],
                ]}
              />
            </Row>
            {r.how === 'own' && (
              <Row label="Order">
                <Choice value={r.desc ? 'down' : 'up'} options={ORDER} onChange={(o) => setRule(i, { desc: o === 'down' || undefined })} />
              </Row>
            )}
            {r.how === 'by' &&
              keys.map((k, q) => (
                <Row key={q} label={q ? 'then by' : 'By'} hint={q ? 'Rows equal in the columns above are sorted by this one' : 'The column the rows are sorted by'}>
                  <div className="where-line">
                    <ListField value={k.col} options={cols} onChange={(col) => setKeys(keys.map((x, j) => (j === q ? { ...x, col } : x)))} label="Column" />
                    {keys.length > 1 && (
                      <Tooltip label="Not sorted by this column">
                        <ActionIcon variant="subtle" size="sm" onClick={() => setKeys(keys.filter((_, j) => j !== q))} aria-label="Remove">
                          <X size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </div>
                  <Choice value={k.desc ? 'down' : 'up'} options={ORDER} onChange={(o) => setKeys(keys.map((x, j) => (j === q ? { ...x, desc: o === 'down' } : x)))} />
                </Row>
              ))}
            {r.how === 'by' && (
              <Row label="">
                <Tooltip label="Rows equal in the columns above are sorted by one more column">
                  <Button variant="default" size="xs" leftSection={<Plus size={13} />} onClick={() => setKeys([...keys, { col: names.find((c) => !keys.some((x) => x.col === c)) ?? first, desc: false }])}>
                    Then by
                  </Button>
                </Tooltip>
              </Row>
            )}
          </div>
        );
      })}
      <Tooltip label="One more sort, after the ones above (e.g. columns A and B by T, then C on its own)">
        <Button variant="default" size="xs" leftSection={<Plus size={13} />} onClick={() => put([...rules, { how: 'by', keys: [{ col: first, desc: false }] }])}>
          Sort rule
        </Button>
      </Tooltip>
    </>
  );
}

export function FilterNodeView({ id, data }: NodeProps<FilterNode>) {
  const { r, names, set } = useNode<FilterData>(id);
  const out = r?.outputs.out;
  const rules = sortRulesOf(data);
  const sr = r?.view.statRows;
  return (
    <div className="node node-clean">
      <InPort label="dataset" port="dataset" id="in" title="The rows of this dataset (every column with them); a workbook: the sheet chosen, or every sheet" />
      {(r?.view.report ?? []).map((l, i) => (
        <div key={i} className="hint">
          {l}
        </div>
      ))}
      <NodeOptions>
        <div className="props-panel props-embed nodrag" onKeyDown={ownKeys}>
          <Sections panel="filterrows" open={['rows', 'sort']}>
            <Section value="rows" title="Rows" aside={sr ? `${sr.used} of ${sr.of}` : undefined}>
              <RowsControls value={data.rows} onChange={(rows) => set({ rows })} hasX result={r} names={names} />
              <Row label="Empty rows" hint="Rows empty in every column (as the end of a sheet longer than its data): kept, or removed. A 0 is a value, never empty">
                <Choice<'keep' | 'remove'>
                  value={data.empty ?? 'keep'}
                  onChange={(e) => set({ empty: e === 'keep' ? undefined : e })}
                  options={[
                    ['keep', 'Kept'],
                    ['remove', 'Removed'],
                  ]}
                />
              </Row>
            </Section>
            <Section value="dup" title="Repeated values" aside={data.dup === 'keep' ? 'kept' : data.dup === 'first' ? 'the first' : 'averaged'}>
              <Row label="Repeated" hint="Rows with the same value: all kept, only the first, or merged into one (the numbers averaged)">
                <Choice<FilterData['dup']>
                  value={data.dup}
                  onChange={(dup) => set({ dup })}
                  options={[
                    ['keep', 'Kept'],
                    ['first', 'First', 'Only the first of them'],
                    ['mean', 'Merged', 'Merged into one row, the numbers averaged'],
                  ]}
                />
              </Row>
              {data.dup !== 'keep' && (
                <Row label="Values of" hint="The column whose repeated values count; several (a list): rows repeated in all of them together, as the same sample on the same day">
                  <ColumnsField value={data.dupCol} names={names} auto="the X" hint="The column whose repeated values count" onChange={(dupCol) => set({ dupCol })} />
                </Row>
              )}
            </Section>
            <Section value="sort" title="Sort" aside={rules.length ? `${rules.length} rule${rules.length > 1 ? 's' : ''}` : 'not sorted'}>
              <SortRules data={data} names={names} set={set} />
            </Section>
            <Section value="keep" title="Keep" aside={data.top ? `${data.topFrom === 'end' ? 'last' : 'first'} ${data.top}` : data.every > 1 ? `1 in ${data.every}` : 'all'}>
              <Row label="Only the" hint="After sorting: only this many rows, from the top or from the bottom (sorted largest first, the first 5 are the 5 largest values). Empty: all">
                <Choice<'start' | 'end'>
                  value={data.topFrom ?? 'start'}
                  onChange={(topFrom) => set({ topFrom: topFrom === 'start' ? undefined : topFrom })}
                  options={[
                    ['start', 'First'],
                    ['end', 'Last'],
                  ]}
                />
                <NumField value={data.top || NaN} min={0} step={1} placeholder="all" unit="rows" onChange={(top) => set({ top: Math.max(0, Math.floor(top) || 0) || undefined })} />
              </Row>
              <Row label="One in every" hint="One row in every N (1: all)">
                <NumField value={data.every} min={1} step={1} unit="rows" onChange={(every) => set({ every: Math.max(1, Math.floor(every) || 1) })} />
              </Row>
            </Section>
          </Sections>
        </div>
        {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={5} />}
        {out?.t === 'workbook' && out.v.sheets[0] && <DataPreview columns={out.v.sheets[0].columns} rows={5} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label={out?.t === 'workbook' ? 'workbook' : 'dataset'} port={out?.t === 'workbook' ? 'workbook' : 'dataset'} id="out" title="The rows kept, merged, sorted, thinned (every column); every sheet: a workbook" />
    </div>
  );
}

export function CleanNodeView({ id, data }: NodeProps<CleanNode>) {
  const { r, names, set } = useNode<CleanData>(id);
  const out = r?.outputs.out;
  const o = data.outliers;
  return (
    <div className="node node-clean">
      <InPort label="dataset" port="dataset" id="in" title="X and the columns to clean" />
      <NodeOptions>
      <div className="col-form">
        <span>Columns</span>
        <ColumnsPicker value={data.cols} names={names} auto={Y_AUTO} title="The columns cleaned: one, or several (a list: 2, B-D, names, A*); auto: the designated Y" onChange={(cols) => set({ cols })} />
        <span>Missing</span>
        <span className="row">
          <Select<CleanData['missing']>
            value={data.missing}
            options={[
              ['keep', 'kept as they are'],
              ['remove', 'their rows removed'],
              ['linear', 'filled: straight lines'],
              ['spline', 'filled: spline'],
              ['previous', 'filled: the previous value'],
              ['next', 'filled: the next value'],
              ['constant', 'filled: a constant'],
              ['movmean', 'filled: the mean around'],
            ]}
            onChange={(missing) => set({ missing })}
          />
          {data.missing === 'constant' && <NumInput className="short" value={data.value} onChange={(value) => set({ value })} />}
        </span>
        <span>Outliers</span>
        <span className="row">
          <Select<CleanData['outliers']>
            value={o}
            options={[
              ['none', 'not looked for'],
              ['median', 'k scaled MAD from the median'],
              ['quartiles', 'k IQR beyond the quartiles'],
              ['movmedian', 'k MAD from the moving median'],
              ['grubbs', 'Grubbs (repeated)'],
              ['gesd', 'GESD (Rosner)'],
            ]}
            onChange={(outliers) => set({ outliers, k: outliers === 'quartiles' ? 1.5 : outliers === 'median' || outliers === 'movmedian' ? 3 : data.k })}
          />
          {(o === 'median' || o === 'quartiles' || o === 'movmedian') && (
            <Field label="k">
              <NumInput className="tiny" step={0.5} value={data.k} onChange={(k) => set({ k: Math.max(0.1, k || 3) })} />
            </Field>
          )}
          {(o === 'grubbs' || o === 'gesd') && (
            <Field label="α">
              <NumInput className="tiny" step={0.01} value={data.alpha} onChange={(alpha) => set({ alpha: Math.min(0.5, Math.max(0.0001, alpha || 0.05)) })} />
            </Field>
          )}
        </span>
        {(o === 'movmedian' || data.missing === 'movmean' || data.action === 'median') && (
          <>
            <span>Window</span>
            <span className="row">
              <NumInput className="tiny" min={3} step={2} value={data.window} onChange={(window) => set({ window: Math.max(3, Math.floor(window) || 5) })} />
              <span className="muted">points</span>
            </span>
          </>
        )}
        {o !== 'none' && (
          <>
            <span>Then</span>
            <Select<CleanData['action']>
              value={data.action}
              options={[
                ['mask', 'masked (kept, left out of analyses)'],
                ['remove', 'their rows removed'],
                ['linear', 'replaced: straight lines from the neighbours'],
                ['median', 'replaced: the median around'],
                ['clip', 'clipped to the bounds'],
              ]}
              onChange={(action) => set({ action })}
            />
          </>
        )}
      </div>
      {(r?.view.report ?? []).length > 0 && (
        <div className="stat-report">
          {r!.view.report!.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={4} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" id="out" title="The data cleaned" />
      <OutPort label="changes" port="dataset" id="changes" title="Every value changed: row, column, old, new, why" />
    </div>
  );
}
