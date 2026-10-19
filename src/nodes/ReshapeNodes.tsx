// Split into columns (a long table cut into blocks side by side) and Combine columns (columns / datasets one under
// the other).
import { xAutoLabel } from './xAuto.ts';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import type { BlockMode } from '../engine/reshape.ts';
import { fmtNum, titleOf, type Column } from '../engine/table.ts';
import type { AppNode, CombineData, CombineNode, UnstackData, UnstackNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Field, InPort, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { maxOf } from '../engine/minmax.ts';

// A column of the input chosen by its name (auto: the designated one).
function ColumnSelect({ value, onChange, avail, auto }: { value: string; onChange: (v: string) => void; avail: { name: string }[]; auto: string }) {
  return (
    <select className="nodrag" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{auto}</option>
      {value && !avail.some((c) => c.name === value) && <option value={value}>{value} (missing)</option>}
      {avail.map((c, k) => (
        <option key={k} value={c.name}>
          {columnLetter(k)} · {titleOf(c)}
        </option>
      ))}
    </select>
  );
}

const BLOCK_MODES: [BlockMode, string][] = [
  ['auto', 'auto'],
  ['text', 'at text / empty lines'],
  ['restart', 'where X starts again'],
  ['column', 'by a column'],
  ['repeat', 'X values repeated'],
  ['every', 'every N rows'],
  ['cycles', 'cycles (X returns to its start)'],
  ['direction', 'where X changes direction'],
];
const SHOWN_BLOCKS = 6;

export function UnstackNodeView({ id, data }: NodeProps<UnstackNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<UnstackData>) => updateNodeData(id, patch);
  const r = useNodeResult(id);
  const avail = r?.view.available ?? [];
  const blocks = r?.view.blocks;
  const out = r?.outputs.out?.t === 'dataset' ? r.outputs.out.v : undefined;
  return (
    <div className="node node-unstack">
      <InPort label="dataset" port="dataset" id="in" title="One long table: the blocks one under the other (wl, n, then wl, k written again under it; a sweep)" />
      <NodeOptions>
      <div className="grid2">
        <Field label="X" title="The X column: the blocks are found from it (where it is not a number, where it starts again …)">
          <ColumnSelect value={data.x} onChange={(x) => set({ x })} avail={avail} auto={xAutoLabel(r?.view.available)} />
        </Field>
        <Field label="Columns" title="The columns cut into blocks: 2, B-D (letters), names, A* (a pattern), !C (not); empty: all the others (but a group column)">
          <ColumnsPicker value={data.ys} names={(r?.view.available ?? []).map((c) => c.name)} auto="auto: all the others" onChange={(ys) => set({ ys })} />
        </Field>
        <Field label="Blocks" title="Where a block ends: auto — at lines where X is not a number (a header written again, an empty line), else where X starts again; or by the equal values of a column, X values met again, every N rows">
          <Select value={data.by} options={BLOCK_MODES} onChange={(by) => set({ by })} />
        </Field>
        {data.by === 'column' && (
          <Field label="Column" title="Its equal values make one block (e.g. the cavity thickness of a sweep)">
            <ColumnSelect value={data.column ?? ''} onChange={(column) => set({ column })} avail={avail} auto="choose" />
          </Field>
        )}
        {data.by === 'every' && (
          <Field label="Rows" title="Rows in every block">
            <NumInput value={data.every ?? NaN} min={1} step={1} placeholder="N" onChange={(every) => set({ every })} />
          </Field>
        )}
        <Field label="X out" title="Only the X of the first block (the others must have the same values: a warning otherwise), or the X of every block before its columns">
          <Select
            value={data.xs}
            options={[
              ['first', 'one X for all blocks'],
              ['each', 'an X before every block'],
            ]}
            onChange={(xs) => set({ xs })}
          />
        </Field>
        <Field label="Names" title="The names of the new columns, in order, separated by commas (empty or a missing one: automatic — the header written over the block, the value of the block, or name_2 …)">
          <TextInput value={data.names} placeholder="auto · e.g. n, k" onChange={(names) => set({ names })} />
        </Field>
      </div>
      {blocks && (
        <div className="block-list">
          <div className="hint ellipsis" title={blocks.how}>
            {blocks.list.length} blocks — {blocks.how}
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>name</th>
                <th>rows</th>
                <th>X from – to</th>
              </tr>
            </thead>
            <tbody>
              {blocks.list.slice(0, SHOWN_BLOCKS).map((b, k) => (
                <tr key={k}>
                  <td>{k + 1}</td>
                  <td className="ellipsis" title={b.name}>
                    {b.name}
                  </td>
                  <td title={`rows ${b.first}–${b.last} of the input`}>{b.rows}</td>
                  <td>
                    {fmtNum(b.x0, 4)} – {fmtNum(b.x1, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {blocks.list.length > SHOWN_BLOCKS && <div className="hint">… {blocks.list.length - SHOWN_BLOCKS} more</div>}
        </div>
      )}
      {out && <DataPreview columns={out.columns.slice(0, 8)} rows={3} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" title="The blocks side by side, designated (X, then the Y columns)" />
    </div>
  );
}

const COMBINE_HOW: [CombineData['how'], string][] = [
  ['side', 'side by side (columns next to each other)'],
  ['after', 'after (A, then B, C …)'],
  ['before', 'before (… C, B, then A)'],
  ['insert', 'inserted into A after row'],
  ['interleave', 'interleaved (A₁ B₁ A₂ B₂ …)'],
  ['sortx', 'sorted by X'],
];

export function CombineNodeView({ id, data }: NodeProps<CombineNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<CombineData>) => updateNodeData(id, patch);
  const r = useNodeResult(id);
  const conns = useNodeConnections({ handleType: 'target' });
  // one free port after the last one used
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(2, Math.max(-1, maxOf(used)) + 2);
  const ins = r?.view.combine ?? [];
  const byLetter = new Map(ins.map((i) => [i.letter, i]));
  const side = data.how === 'side';
  const anyDataset = ins.some((i) => i.kind === 'dataset');
  const o = r?.outputs.out;
  const outCols: Column[] = o?.t === 'dataset' ? o.v.columns : o?.t === 'column' ? [o.v] : [];
  return (
    <div className="node node-combine">
      {Array.from({ length: count }, (_, k) => {
        const inp = byLetter.get(columnLetter(k));
        return (
          <InPort key={k} label={columnLetter(k)} port="column" id={`in-${k}`} title="A column or a dataset (side by side: a dataset out; else all columns: a column out, a dataset among them: a dataset out)">
            <span className="muted ellipsis">{inp ? `${inp.name} · ${inp.kind === 'dataset' ? `${inp.cols} columns, ` : ''}${inp.rows} rows` : 'connect a column or a dataset'}</span>
          </InPort>
        );
      })}
      <NodeOptions>
      <div className="grid2">
        <Field label="How" title="Side by side: the columns of B, C … next to those of A. Else one under the other — the rows of B, C … after A, before it, inside it after a row, one row of each in turn, or all sorted by X">
          <Select value={data.how} options={COMBINE_HOW} onChange={(how) => set({ how })} />
        </Field>
        {side && (
          <Field label="Where" title="Where the columns of B, C … go among those of A">
            <Select
              value={data.where ?? 'ports'}
              options={[
                ['ports', 'after A (in the order of the ports)'],
                ['start', 'before A'],
                ['after', 'after a column of A'],
                ['replace', 'in place of a column of A'],
              ]}
              onChange={(where) => set({ where })}
            />
          </Field>
        )}
        {side && (data.where === 'after' || data.where === 'replace') && (
          <Field label="Column" title="The column of A">
            <ColumnSelect value={data.ref ?? ''} onChange={(ref) => set({ ref })} avail={r?.view.available ?? []} auto="choose" />
          </Field>
        )}
        {side && (
          <Field label="Names" title="New names of the columns of B, C …, in order, separated by commas (empty or a missing one: its own name; a name met twice becomes “name (2)”)">
            <TextInput value={data.names ?? ''} placeholder="their own · e.g. Fit, Error" onChange={(names) => set({ names })} />
          </Field>
        )}
        {data.how === 'insert' && (
          <Field label="After row" title="B, C … go after this row of A (0: before its first row)">
            <NumInput value={data.at} min={0} step={1} onChange={(at) => set({ at })} />
          </Field>
        )}
        {data.how === 'sortx' && anyDataset && !side && (
          <Field label="X" title="The column the rows are sorted by">
            <ColumnSelect value={data.x} onChange={(x) => set({ x })} avail={r?.view.available ?? []} auto={xAutoLabel(r?.view.available)} />
          </Field>
        )}
        {data.how === 'sortx' && (
          <Field label="Same X" title="Rows with the same X value: all kept, one row with the mean of every column, or the first one">
            <Select
              value={data.dup}
              options={[
                ['all', 'keep all'],
                ['mean', 'mean'],
                ['first', 'the first'],
              ]}
              onChange={(dup) => set({ dup })}
            />
          </Field>
        )}
        {anyDataset && !side && (
          <Field label="Match" title="The columns of the datasets matched by their name (a missing one: empty cells) or by their place">
            <Select
              value={data.match}
              options={[
                ['name', 'by name'],
                ['position', 'by position'],
              ]}
              onChange={(match) => set({ match })}
            />
          </Field>
        )}
        {!anyDataset && !side && (
          <Field label="Name" title="The name of the result (empty: the name of A)">
            <TextInput value={data.name} placeholder={ins[0]?.name ?? 'of A'} onChange={(name) => set({ name })} />
          </Field>
        )}
      </div>
      {outCols.length > 0 && <DataPreview columns={outCols.slice(0, 8)} rows={4} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label={o?.t === 'dataset' ? 'dataset' : 'column'} port={o?.t === 'dataset' ? 'dataset' : 'column'} />
      {!side && <OutPort label="source" port="column" id="source" title="Which input every row comes from (1 = A, 2 = B …): designate it Group, or give it to Split into columns ▸ by a column, to undo the combination" />}
    </div>
  );
}
