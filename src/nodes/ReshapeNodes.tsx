// Split into columns (a long table cut into blocks side by side) and Combine columns (columns / datasets one under
// the other).
import { xAutoLabel } from './xAuto.ts';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import type { BlockMode, ThenMode } from '../engine/reshape.ts';
import { rowsText } from '../engine/split.ts';
import { SplitGraphView, type SplitEdits } from './SplitGraph.tsx';
import { RotateCcw, X as XIcon } from 'lucide-react';
import { IC } from './iconProps.ts';
import { fmtNum, titleOf, type Column } from '../engine/table.ts';
import type { AppNode, CombineData, CombineNode, UnstackData, UnstackNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
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
  ['restart', 'where it starts again'],
  ['column', 'by a column'],
  ['repeat', 'values repeated'],
  ['every', 'every N rows'],
  ['cycles', 'cycles (it returns to its start)'],
  ['direction', 'where it changes direction'],
  ['jump', 'where it jumps'],
];
const THEN_MODES: [ThenMode, string][] = [
  ['none', 'nothing more'],
  ['cycles', 'the cycles in each block'],
  ['direction', 'where it changes direction'],
  ['jump', 'where it jumps'],
  ['restart', 'where it starts again'],
  ['every', 'every N rows'],
];
const SHOWN_BLOCKS = 6;

// The blocks kept written short: "" (all), "!2, !5" (all but these), or the list kept ("1-3, 7").
function keepText(kept: boolean[]): string {
  const yes = kept.flatMap((k, i) => (k ? [i + 1] : []));
  const no = kept.flatMap((k, i) => (k ? [] : [i + 1]));
  if (!no.length) return '';
  return no.length <= yes.length
    ? rowsText(no)
        .split(', ')
        .map((t) => `!${t}`)
        .join(', ')
    : rowsText(yes);
}

export function UnstackNodeView({ id, data }: NodeProps<UnstackNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<UnstackData>) => updateNodeData(id, patch);
  const r = useNodeResult(id);
  const avail = r?.view.available ?? [];
  const blocks = r?.view.blocks;
  const g = r?.view.split;
  const out = r?.outputs.out?.t === 'dataset' ? r.outputs.out.v : undefined;
  const then = data.then ?? 'none';
  const has = (m: BlockMode | ThenMode) => data.by === m || then === m;
  // the column the rules look at: not for the header lines, every N rows, or a column's equal values alone
  const fromShown = (data.by !== 'text' && data.by !== 'every' && data.by !== 'column') || (then !== 'none' && then !== 'every');
  const sweep = has('cycles') || has('direction');
  // the edits made on the graph (the cuts by hand keep the table's row count, to warn when it changes)
  const n = g?.n ?? 0;
  const cuts = data.cuts ?? [];
  const uncut = data.uncut ?? [];
  const kept = (blocks?.list ?? []).map((b) => b.kept !== false);
  const edits: SplitEdits = {
    addCut: (row) => (uncut.includes(row) ? set({ uncut: uncut.filter((u) => u !== row), cutRows: n }) : set({ cuts: [...new Set([...cuts, row])].sort((a, b) => a - b), cutRows: n })),
    removeCut: (c) => (c.hand ? set({ cuts: cuts.filter((u) => u !== c.row), cutRows: n }) : set({ uncut: [...new Set([...uncut, c.row])], cutRows: n })),
    moveCut: (c, row) =>
      c.hand
        ? set({ cuts: [...new Set([...cuts.filter((u) => u !== c.row), row])].sort((a, b) => a - b), cutRows: n })
        : set({ uncut: [...new Set([...uncut, c.row])], cuts: [...new Set([...cuts, row])].sort((a, b) => a - b), cutRows: n }),
    toggleBlock: (k) => set({ keep: keepText(kept.map((v, i) => (i === k ? !v : v))) }),
    setRange: (a, b) => set({ rows: `${a}-${b}` }),
  };
  return (
    <div className="node node-unstack">
      <InPort label="dataset" port="dataset" id="in" title="One long table: the blocks one under the other (wl, n, then wl, k written again under it; a sweep)" />
      <NodeOptions>
      <div className="grid2">
        <Field label="X" title="The X column of the curves (and, unless From says another, the column the blocks are found from)">
          <ColumnSelect value={data.x} onChange={(x) => set({ x })} avail={avail} auto={xAutoLabel(r?.view.available)} />
        </Field>
        <Field label="Columns" title="The columns cut into blocks: 2, B-D (letters), names, A* (a pattern), !C (not); empty: all the others (but a group column)">
          <ColumnsPicker value={data.ys} names={(r?.view.available ?? []).map((c) => c.name)} auto="auto: all the others" onChange={(ys) => set({ ys })} />
        </Field>
        <Field label="Blocks" title="Where a block ends: auto — at lines where X is not a number (a header written again, an empty line), else where it starts again; or by the equal values of a column, values met again, every N rows, the cycles of a scan, where it changes direction, where it jumps — “it”: the column of From (X unless chosen)">
          <Select value={data.by} options={BLOCK_MODES} onChange={(by) => set({ by })} />
        </Field>
        {data.by === 'column' && (
          <Field label="Column" title="Its equal values make one block (e.g. the cavity thickness of a sweep)">
            <ColumnSelect value={data.column ?? ''} onChange={(column) => set({ column })} avail={avail} auto={data.from ? `as From: ${data.from}` : 'choose'} />
          </Field>
        )}
        {fromShown && (
          <Field label="From" title="The column the blocks are found from — where it starts again, jumps, turns, repeats (a scan: the potential, while X may be another column)">
            <ColumnSelect value={data.from ?? ''} onChange={(from) => set({ from: from || undefined })} avail={avail} auto="X" />
          </Field>
        )}
        {has('every') && (
          <Field label="Rows" title="Rows in every block">
            <NumInput value={data.every ?? NaN} min={1} step={1} placeholder="N" onChange={(every) => set({ every })} />
          </Field>
        )}
        {has('jump') && (
          <Field label="Jump >" title="A new block where the column changes by more than this from one row to the next; empty: 5 × its usual change (any change when most rows repeat the value before)">
            <NumInput value={data.jump ?? NaN} min={0} placeholder="auto" onChange={(jump) => set({ jump: Number.isFinite(jump) && jump > 0 ? jump : undefined })} />
          </Field>
        )}
        {has('cycles') && (
          <Field label="Starts at" title="Where a cycle starts: where the scan started (it ends where the scan, after turning twice, comes back there going the first way), at every upper or lower turn, or where the column crosses a value going up or down">
            <span className="row">
              <Select<NonNullable<UnstackData['cycleStart']>>
                value={data.cycleStart ?? 'start'}
                options={[
                  ['start', 'where the scan started'],
                  ['top', 'every upper turn'],
                  ['bottom', 'every lower turn'],
                  ['value', 'a value'],
                ]}
                onChange={(cycleStart) => set({ cycleStart: cycleStart === 'start' ? undefined : cycleStart })}
              />
              {data.cycleStart === 'value' && (
                <>
                  <NumInput className="short" value={data.cycleAt ?? NaN} placeholder="value" onChange={(cycleAt) => set({ cycleAt: Number.isFinite(cycleAt) ? cycleAt : undefined })} />
                  <Select<'up' | 'down'>
                    value={data.cycleDir ?? 'up'}
                    options={[
                      ['up', 'going up'],
                      ['down', 'going down'],
                    ]}
                    onChange={(cycleDir) => set({ cycleDir: cycleDir === 'up' ? undefined : cycleDir })}
                  />
                </>
              )}
            </span>
          </Field>
        )}
        {sweep && (
          <Field label="Incomplete" title="The pieces that are not a whole cycle (segment): the scan started or stopped on the way — kept (marked * in the list and dashed on the graph), left out, or joined to the block next to them">
            <Select<NonNullable<UnstackData['partial']>>
              value={data.partial ?? 'keep'}
              options={[
                ['keep', 'kept (marked *)'],
                ['drop', 'left out'],
                ['join', 'joined to the next block'],
              ]}
              onChange={(partial) => set({ partial: partial === 'keep' ? undefined : partial })}
            />
          </Field>
        )}
        {sweep && (
          <Field label="Turns" title="A turn counts when the column goes back by more than this, % of its range (a measured potential with noise: larger)">
            <span className="row">
              <NumInput className="short" value={data.tol ?? NaN} min={0} step={0.1} placeholder="0.5" onChange={(tol) => set({ tol: Number.isFinite(tol) && tol >= 0 ? tol : undefined })} />
              <span className="muted">% of the range</span>
            </span>
          </Field>
        )}
        {has('cycles') && <Check label="Halves: each cycle cut into its way up and its way down" value={!!data.halves} onChange={(halves) => set({ halves: halves || undefined })} />}
        {data.by !== 'cycles' && data.by !== 'direction' && (
          <Field label="Then" title="The rule again inside every block: by a column (a run), then the cycles of each run …">
            <Select<ThenMode> value={then} options={THEN_MODES} onChange={(t) => set({ then: t === 'none' ? undefined : t })} />
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
        <Field label="Rows used" title="Only these rows are cut into blocks: 100-2900, 1:2:end … (rows count from 1); empty: all. Also dragged on the graph (Rows)">
          <TextInput value={data.rows ?? ''} placeholder="all · e.g. 100-2900" onChange={(rows) => set({ rows: rows || undefined })} />
        </Field>
        <Field label="Keep" title="The blocks kept: 2:end, 1-3, 5, first, last, !1 (all but block 1); empty: all. Also clicked on the graph (Blocks) or ticked in the list">
          <TextInput value={data.keep ?? ''} placeholder="all · e.g. 2:end, !1" onChange={(keep) => set({ keep: keep || undefined })} />
        </Field>
      </div>
      {(cuts.length > 0 || uncut.length > 0) && (
        <div className="row wrap">
          <span className="hint">Cuts by hand (row):</span>
          {cuts.map((row) => (
            <button key={`c${row}`} className="nodrag" title={`Remove the cut added at row ${row}`} onClick={() => set({ cuts: cuts.filter((u) => u !== row), cutRows: n || data.cutRows })}>
              {row} <XIcon {...IC} />
            </button>
          ))}
          {uncut.map((row) => (
            <button key={`u${row}`} className="nodrag" title={`Put back the cut of the rule at row ${row} (taken away)`} onClick={() => set({ uncut: uncut.filter((u) => u !== row), cutRows: n || data.cutRows })}>
              <s>{row}</s> <RotateCcw {...IC} />
            </button>
          ))}
          <span className="grow" />
          <button className="nodrag" title="The blocks as the rule finds them again (every cut by hand gone)" onClick={() => set({ cuts: undefined, uncut: undefined, cutRows: undefined })}>
            Clear
          </button>
        </div>
      )}
      {g && <SplitGraphView g={g} view={data.graph ?? 'rows'} setView={(graph) => set({ graph: graph === 'rows' ? undefined : graph })} edits={edits} tol={data.tol ?? 0.5} />}
      {blocks && (
        <div className="block-list">
          <div className="hint ellipsis" title={blocks.how}>
            {blocks.list.length} blocks{kept.some((k) => !k) ? ` (${kept.filter(Boolean).length} kept)` : ''} — {blocks.how}
          </div>
          <table>
            <thead>
              <tr>
                <th title="Kept (a tick: in the output)" />
                <th>#</th>
                <th>name</th>
                <th>rows</th>
                <th>X from – to</th>
              </tr>
            </thead>
            <tbody>
              {blocks.list.slice(0, SHOWN_BLOCKS).map((b, k) => (
                <tr key={k} className={b.kept === false ? 'muted' : undefined}>
                  <td>
                    <input type="checkbox" className="nodrag" checked={b.kept !== false} title="Kept (in the output)" onChange={() => edits.toggleBlock(k)} />
                  </td>
                  <td title={b.part ? 'not a whole cycle (the scan started or stopped on the way)' : undefined}>
                    {k + 1}
                    {b.part ? '*' : ''}
                  </td>
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
      <OutPort label="long" port="dataset" id="long" title="The long table: every row of the blocks kept, once, with its block (and its cycle or segment, and the way the column goes there: up / down) — to colour or filter by block" />
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
