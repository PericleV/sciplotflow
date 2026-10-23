// Split into columns (a long table cut into blocks side by side) and Combine columns (columns, datasets, workbooks:
// one column, side by side, in sheets, into a table, tables one under the other).
import { useState } from 'react';
import { xAutoLabel } from './xAuto.ts';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import { combineSettings, type BlockMode, type CombineMode, type CombinePort, type CombineSettings, type IntoAction, type ThenMode } from '../engine/reshape.ts';
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
import { sheetOptions } from './sheetOptions.ts';

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
  ['cycles', 'the cycles in each block'],
  ['direction', 'where it changes direction'],
  ['jump', 'where it jumps'],
  ['restart', 'where it starts again'],
  ['every', 'every N rows'],
];
// the rules that look at a column (where it starts again, repeats, turns, jumps; its equal values)
const NEEDS_COLUMN = new Set<BlockMode | ThenMode>(['restart', 'column', 'repeat', 'cycles', 'direction', 'jump']);

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
  // the column the rule looks at, beside it: by a column, the column of the equal values; the others, From (X if none)
  const byColumn = data.by === 'column';
  const ruleCol = byColumn ? (data.column ?? '') : (data.from ?? '');
  const setRuleCol = (v: string) => set(byColumn ? { column: v || undefined } : { from: v || undefined });
  // (the second rule looks at From: shown on its own when the first does not)
  const fromAlone = !NEEDS_COLUMN.has(data.by) && then !== 'none' && NEEDS_COLUMN.has(then);
  const sweep = has('cycles') || has('direction');
  // the edits made on the graph (the cuts by hand keep the table's row count, to warn when it changes)
  const n = g?.n ?? 0;
  const cuts = data.cuts ?? [];
  const uncut = data.uncut ?? [];
  const kept = (blocks?.list ?? []).map((b) => b.kept !== false);
  const levels = data.levels ?? [];
  // a block named in the list (by its place; '' : automatic)
  const nameBlock = (k: number, name: string) => {
    const list = Array.from({ length: Math.max(k + 1, data.blockNames?.length ?? 0) }, (_, i) => (i === k ? name.trim() : (data.blockNames?.[i] ?? '')));
    set({ blockNames: list.some(Boolean) ? list : undefined });
  };
  const edits: SplitEdits = {
    addCut: (row) => (uncut.includes(row) ? set({ uncut: uncut.filter((u) => u !== row), cutRows: n }) : set({ cuts: [...new Set([...cuts, row])].sort((a, b) => a - b), cutRows: n })),
    removeCut: (c) => c.level ? undefined : (c.hand ? set({ cuts: cuts.filter((u) => u !== c.row), cutRows: n }) : set({ uncut: [...new Set([...uncut, c.row])], cutRows: n })),
    moveCut: (c, row) =>
      c.hand
        ? set({ cuts: [...new Set([...cuts.filter((u) => u !== c.row), row])].sort((a, b) => a - b), cutRows: n })
        : set({ uncut: [...new Set([...uncut, c.row])], cuts: [...new Set([...cuts, row])].sort((a, b) => a - b), cutRows: n }),
    toggleBlock: (k) => set({ keep: keepText(kept.map((v, i) => (i === k ? !v : v))) }),
    setRange: (a, b) => set({ rows: `${a}-${b}` }),
    addLevel: (value, on) => set({ levels: [...levels, { value, ...(on === 'y' ? { on: 'y' as const } : {}) }] }),
    moveLevel: (k, value) => set({ levels: levels.map((L, i) => (i === k ? { ...L, value } : L)) }),
    removeLevel: (k) => set({ levels: levels.filter((_, i) => i !== k).length ? levels.filter((_, i) => i !== k) : undefined }),
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
        <Field label="Split" title="Where a block ends: auto (at lines where X is not a number: a header written again, an empty line; else where X starts again); at text or empty lines; where a column starts again; by the equal values of a column (each value a block); values met again; every N rows; the cycles of a scan; where it changes direction; where it jumps. The column it looks at is chosen beside it (X unless chosen; a scan: the potential, while X may be another column)">
          <span className="row">
            <Select value={data.by} options={BLOCK_MODES} onChange={(by) => set({ by })} />
            {NEEDS_COLUMN.has(data.by) && (
              <>
                <span className="muted">in</span>
                <ColumnSelect value={ruleCol} onChange={setRuleCol} avail={avail} auto={byColumn ? (data.from ? data.from : 'choose') : 'X'} />
              </>
            )}
          </span>
        </Field>
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
          <Field label="Again" title="Split each block again, by a second rule: e.g. a file of several samples, each with three cycles of a scan: split by the sample's column, then the cycles in each block">
            <span className="row">
              <Check label="split each block again" value={then !== 'none'} onChange={(on) => set({ then: on ? 'cycles' : undefined })} />
              {then !== 'none' && <Select<ThenMode> value={then} options={THEN_MODES} onChange={(t) => set({ then: t })} />}
            </span>
          </Field>
        )}
        {fromAlone && (
          <Field label="In" title="The column the second rule looks at (X unless chosen)">
            <ColumnSelect value={data.from ?? ''} onChange={(from) => set({ from: from || undefined })} avail={avail} auto="X" />
          </Field>
        )}
        <Field label="X columns" title="One X shared by all the blocks (they must have the same X: a warning otherwise), or an X before every block's columns">
          <Select
            value={data.xs}
            options={[
              ['first', 'one shared X'],
              ['each', 'an X for each block'],
            ]}
            onChange={(xs) => set({ xs })}
          />
        </Field>
      </div>
      {(data.rows || data.names.trim()) && (
        <div className="row wrap">
          {data.rows && (
            <button className="nodrag" title="Only these rows are cut into blocks (dragged on the graph, Rows): click to use all the rows" onClick={() => set({ rows: undefined })}>
              Rows {data.rows} <XIcon {...IC} />
            </button>
          )}
          {data.names.trim() && (
            <button className="nodrag" title={`The names written in an older version, in order, for the new columns: ${data.names}. Click to name the blocks in the list instead`} onClick={() => set({ names: '' })}>
              Names {data.names} <XIcon {...IC} />
            </button>
          )}
        </div>
      )}
      {levels.length > 0 && (
        <div className="row wrap">
          <span className="hint" title="The lines across the graph (Cut on Y): the data cut wherever they cross the value">Cuts on Y:</span>
          {levels.map((L, k) => (
            <span key={k} className="level-chip">
              {L.on === 'y' ? (g?.ys[0]?.name ?? 'Y') : (g?.f.name ?? 'X')} = {fmtNum(L.value, 4)}
              <Select<'both' | 'up' | 'down'>
                value={L.dir ?? 'both'}
                title="Where it cuts: where the data cross the value going up, going down, or either way"
                options={[
                  ['both', 'either way'],
                  ['up', 'going up'],
                  ['down', 'going down'],
                ]}
                onChange={(dir) => set({ levels: levels.map((q, i) => (i === k ? { value: q.value, ...(q.on ? { on: q.on } : {}), ...(dir !== 'both' ? { dir } : {}) } : q)) })}
              />
              <button className="nodrag ts-btn" title="Remove this line" onClick={() => edits.removeLevel(k)}>
                <XIcon {...IC} />
              </button>
            </span>
          ))}
        </div>
      )}
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
          <div className="row">
            <span className="hint ellipsis grow" title={blocks.how}>
              {blocks.list.length} blocks{kept.some((k) => !k) ? ` · ${kept.filter(Boolean).length} kept` : ''} · {blocks.how}
            </span>
            {kept.some((k) => !k) && (
              <button className="nodrag" title="Keep every block" onClick={() => set({ keep: undefined })}>
                Keep all
              </button>
            )}
          </div>
          <div className="block-scroll nowheel">
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
              {blocks.list.map((b, k) => (
                <tr key={k} className={b.kept === false ? 'muted' : undefined}>
                  <td>
                    <input type="checkbox" className="nodrag" checked={b.kept !== false} title="Kept (in the output)" onChange={() => edits.toggleBlock(k)} />
                  </td>
                  <td title={b.part ? 'not a whole cycle (the scan started or stopped on the way)' : undefined}>
                    {k + 1}
                    {b.part ? '*' : ''}
                  </td>
                  <td>
                    <input
                      key={`${k}:${data.blockNames?.[k] ?? ''}`}
                      className="nodrag block-name"
                      defaultValue={data.blockNames?.[k] ?? ''}
                      placeholder={b.name}
                      spellCheck={false}
                      title={`The name of this block's column (empty: ${b.name}); with several Y columns, “Y · name”`}
                      onBlur={(e) => e.target.value.trim() !== (data.blockNames?.[k] ?? '') && nameBlock(k, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </td>
                  <td title={`rows ${b.first}–${b.last} of the input`}>{b.rows}</td>
                  <td>
                    {fmtNum(b.x0, 4)} – {fmtNum(b.x1, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

const RESULTS: [CombineMode, string][] = [
  ['column', 'one column (one under the other)'],
  ['side', 'side by side (a dataset)'],
  ['sheets', 'side by side, in sheets (a workbook)'],
  ['into', 'into a table (a dataset or a sheet)'],
  ['tables', 'tables one under the other (a dataset)'],
];
const INTO_ACTIONS: [IntoAction, string][] = [
  ['end', 'new columns at the end'],
  ['start', 'new columns at the start'],
  ['after', 'new columns after'],
  ['before', 'new columns before'],
  ['replace', 'new columns instead of'],
  ['under', 'under the column (continues it)'],
  ['above', 'above the column'],
  ['insert', 'into the column after row'],
  ['interleave', 'interleaved with the column'],
];
// the actions that put one column into a column of the table (the others add columns)
const INTO_ONE = new Set<IntoAction>(['under', 'above', 'insert', 'interleave']);

// The settings written as node data (an older node takes the new form at its first change)
const combineData = (s: CombineSettings): Partial<CombineData> => ({ result: s.result, order: s.order, ports: s.ports, into: s.into, how: s.how, at: s.at, match: s.match, x: s.x, dup: s.dup, desc: s.desc || undefined, name: s.name });

export function CombineNodeView({ id, data }: NodeProps<CombineNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const conns = useNodeConnections({ handleType: 'target' });
  // one free port after the last one used
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(2, Math.max(-1, maxOf(used)) + 2);
  const ins = r?.view.combine ?? [];
  const byPort = new Map(ins.map((i) => [i.port, i]));
  const s = r?.view.combineSettings ?? combineSettings(data, []);
  const write = (p: Partial<CombineSettings>) => updateNodeData(id, combineData({ ...s, ...p }));
  const setPort = (port: number, p: Partial<CombinePort>) => write({ ports: { ...s.ports, [port]: { ...s.ports[port], ...p } } });
  const [moving, setMoving] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const move = (a: number, b: number) => {
    if (a === b) return;
    const order = [...s.order];
    const [x] = order.splice(a, 1);
    order.splice(b, 0, x);
    write({ order });
  };
  const stack = s.result === 'column' || s.result === 'tables';
  const target = byPort.get(s.into);
  const o = r?.outputs.out;
  // a workbook out: the sheet the others went into, else the first
  const shownSheet = o?.t === 'workbook' ? ((s.result === 'into' && o.v.sheets.find((q) => q.name === (s.ports[s.into]?.sheet || target?.sheets?.[0]))) || o.v.sheets[0]) : undefined;
  const preview: Column[] = o?.t === 'dataset' ? o.v.columns : o?.t === 'column' ? [o.v] : (shownSheet?.columns ?? []);
  const outKind = o?.t === 'workbook' ? 'workbook' : o?.t === 'column' ? 'column' : o ? 'dataset' : s.result === 'column' ? 'column' : s.result === 'sheets' ? 'workbook' : 'dataset';
  const colOpts = (names: string[]): [string, string][] => names.map((n, k) => [n, `${columnLetter(k)} · ${n}`]);
  return (
    <div className="node node-combine">
      {Array.from({ length: count }, (_, k) => {
        const inp = byPort.get(k);
        return (
          <InPort key={k} label={columnLetter(k)} port="column" id={`in-${k}`} title="A column, a dataset or a workbook (its sheet chosen in the list of inputs)">
            <span className="muted ellipsis">{inp ? `${inp.name} · ${inp.kind === 'column' ? '' : `${inp.cols} columns, `}${inp.rows} rows` : 'connect a column, dataset or workbook'}</span>
          </InPort>
        );
      })}
      <NodeOptions>
        <div className="grid2">
          <Field label="Result" title="What comes out: one column (the inputs one under the other), a dataset (side by side), a workbook (side by side, in sheets), a table with the other inputs put into it, or tables one under the other">
            <Select<CombineMode> value={s.result} options={RESULTS} onChange={(result) => write({ result, ...(result === 'into' && !byPort.has(s.into) ? { into: s.order[0] ?? 0 } : {}) })} />
          </Field>
          {stack && (
            <Field label="How" title="One after another (in the order of the list), one row of each in turn, inserted into the first after a row, or all sorted">
              <Select<CombineSettings['how']>
                value={s.how}
                options={[
                  ['after', 'one after another'],
                  ['interleave', 'interleaved (A₁ B₁ A₂ B₂ …)'],
                  ['insert', 'into the first after row'],
                  ['sortx', s.result === 'column' ? 'sorted by value' : 'sorted by a column'],
                ]}
                onChange={(how) => write({ how })}
              />
            </Field>
          )}
          {stack && s.how === 'insert' && (
            <Field label="After row" title="The others go after this row of the first in the list (0: before its first row)">
              <NumInput value={s.at} min={0} step={1} onChange={(at) => write({ at })} />
            </Field>
          )}
          {s.result === 'tables' && s.how === 'sortx' && (
            <Field label="By" title="The column the rows are sorted by">
              <ColumnSelect value={s.x} onChange={(x) => write({ x })} avail={r?.view.available ?? []} auto={xAutoLabel(r?.view.available)} />
            </Field>
          )}
          {stack && s.how === 'sortx' && (
            <>
              <Field label="Order">
                <Select<'up' | 'down'>
                  value={s.desc ? 'down' : 'up'}
                  options={[
                    ['up', 'smallest first'],
                    ['down', 'largest first'],
                  ]}
                  onChange={(v) => write({ desc: v === 'down' })}
                />
              </Field>
              <Field label="Same value" title="Rows with the same value: all kept, one row with the mean, or the first one">
                <Select<CombineSettings['dup']>
                  value={s.dup}
                  options={[
                    ['all', 'keep all'],
                    ['mean', 'mean'],
                    ['first', 'the first'],
                  ]}
                  onChange={(dup) => write({ dup })}
                />
              </Field>
            </>
          )}
          {s.result === 'tables' && (
            <Field label="Match" title="The columns of the tables matched by their name (a missing one: empty cells) or by their place">
              <Select<CombineSettings['match']>
                value={s.match}
                options={[
                  ['name', 'by name'],
                  ['position', 'by position'],
                ]}
                onChange={(match) => write({ match })}
              />
            </Field>
          )}
          {s.result === 'column' && (
            <Field label="Name" title="The name of the column out (empty: that of the first)">
              <TextInput value={s.name} placeholder={byPort.get(s.order[0])?.name ?? 'of the first'} onChange={(name) => write({ name })} />
            </Field>
          )}
          {s.result === 'into' && (
            <Field label="Into" title="The table the other inputs go into (a dataset, a column, or a sheet of a workbook: the other sheets kept)">
              <Select<string> value={String(s.into)} options={(ins.length ? ins : [{ port: s.into, letter: columnLetter(s.into), name: '' }]).map((i): [string, string] => [String(i.port), `${i.letter}${i.name ? ` · ${i.name}` : ''}`])} onChange={(v) => write({ into: Number(v) })} />
            </Field>
          )}
        </div>
        {ins.length > 0 && <div className="hint">{s.result === 'into' ? 'Drag ⠿ to change the order the inputs go in.' : 'In this order (drag ⠿ to change it):'}</div>}
        <div className="combine-list">
          {s.order.map((port, k) => {
            const inp = byPort.get(port);
            if (!inp) return null;
            const ps = s.ports[port] ?? {};
            const isTarget = s.result === 'into' && port === s.into;
            const action = ps.action ?? 'end';
            const oneCol = (s.result === 'column' || (s.result === 'into' && INTO_ONE.has(action))) && inp.kind !== 'column';
            return (
              <div
                key={port}
                className={`col-added combine-in${dropAt === k && moving !== null && moving !== k ? (moving < k ? ' drop-after' : ' drop-before') : ''}`}
                onDragOver={(ev) => {
                  if (moving === null) return;
                  ev.preventDefault();
                  setDropAt(k);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (moving !== null) move(moving, k);
                  setMoving(null);
                  setDropAt(null);
                }}
              >
                <div className="row">
                  <span
                    className="grip nodrag"
                    draggable
                    title="Drag to change the order"
                    onDragStart={(ev) => {
                      ev.dataTransfer.effectAllowed = 'move';
                      ev.dataTransfer.setData('text/plain', String(port));
                      setMoving(k);
                    }}
                    onDragEnd={() => {
                      setMoving(null);
                      setDropAt(null);
                    }}
                  >
                    ⠿
                  </span>
                  <b>{inp.letter}</b>
                  <span className="ellipsis grow">{inp.name}</span>
                  <span className="muted">{`${inp.kind === 'column' ? '' : `${inp.kind} · ${inp.cols} col${inp.cols === 1 ? '' : 's'}, `}${inp.rows} row${inp.rows === 1 ? '' : 's'}`}</span>
                </div>
                <div className="row wrap">
                  {inp.sheets && (
                    <Field label="Sheet">
                      <Select<string> {...sheetOptions(inp.sheets, ps.sheet ?? '')} onChange={(sheet) => setPort(port, { sheet: sheet || undefined })} />
                    </Field>
                  )}
                  {isTarget && <span className="muted">the table</span>}
                  {s.result === 'into' && !isTarget && (
                    <>
                      <Select<IntoAction> value={action} options={INTO_ACTIONS} onChange={(a) => setPort(port, { action: a })} />
                      {action !== 'end' && action !== 'start' && <Select<string> value={ps.ref ?? ''} options={[['', `column of ${target?.letter ?? 'the table'}…`], ...colOpts(target?.columns ?? [])]} onChange={(ref) => setPort(port, { ref })} />}
                      {action === 'insert' && <NumInput className="tiny" min={0} step={1} value={ps.at ?? 0} onChange={(at) => setPort(port, { at })} />}
                    </>
                  )}
                  {oneCol && (
                    <Field label="Column" title="The column of this input taken (auto: its Y)">
                      <Select<string> value={ps.col ?? ''} options={[['', 'its Y'], ...colOpts(inp.columns)]} onChange={(col) => setPort(port, { col: col || undefined })} />
                    </Field>
                  )}
                  {s.result === 'sheets' && (
                    <Field label="To sheet" title="The sheet it goes to (inputs with the same sheet side by side)">
                      <TextInput className="short-text" value={ps.sheetOut ?? ''} placeholder="Sheet 1" onChange={(sheetOut) => setPort(port, { sheetOut: sheetOut || undefined })} />
                    </Field>
                  )}
                  {(s.result === 'side' || s.result === 'sheets' || (s.result === 'into' && !isTarget && !INTO_ONE.has(action))) && (
                    <Field label="Names" title="New names of its columns, in order, separated by commas (empty or a missing one: its own name)">
                      <TextInput className="short-text" value={ps.names ?? ''} placeholder={inp.columns.slice(0, 2).join(', ') + (inp.columns.length > 2 ? ' …' : '')} onChange={(names) => setPort(port, { names: names || undefined })} />
                    </Field>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {preview.length > 0 && <DataPreview columns={preview.slice(0, 8)} rows={4} />}
        {o?.t === 'workbook' && o.v.sheets.length > 1 && (
          <div className="hint">
            {o.v.sheets.length} sheets: {o.v.sheets.map((q) => q.name).join(', ')} ({shownSheet?.name} shown)
          </div>
        )}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label={outKind} port={outKind} />
      {stack && <OutPort label="source" port="column" id="source" title="Which input every row comes from (1 = A, 2 = B …): designate it Group, or give it to Split into columns ▸ by a column, to undo the combination" />}
    </div>
  );
}
