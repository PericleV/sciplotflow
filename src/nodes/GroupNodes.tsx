// Group nodes: the group (its ports, its name, Open), a Batch (a group run on every file), and inside them the Group
// input and Group output nodes.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { sourcePort, targetAccepts, type PortType } from '../engine/ports.ts';
import { NEW_OUT } from '../engine/subgraph.ts';
import { guessPattern, portNames, type BatchSpec } from '../engine/batch.ts';
import { nodeTitle } from '../nodeColors.ts';
import type { AppNode, GroupNode, GroupPort } from '../types.ts';
import { useGroupNav } from './groupNav.ts';
import { Check, Field, InPort, Messages, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { sheetOptions } from './sheetOptions.ts';
import { DataPreview } from './DataNodes.tsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IC } from './iconProps.ts';
import { notify } from '../ui/dialogStore.ts';

const known = (t: string | undefined | null): PortType => (t && t !== 'any' ? (t as PortType) : 'any');

// The outputs of a group (what a Batch keeps), each with a name of its own: typed here (empty: the name made from what
// it is connected to, shown greyed)
function OutputNames({ outputs, onChange, what }: { outputs: GroupPort[]; onChange: (outputs: GroupPort[]) => void; what: string }) {
  if (!outputs.length) return null;
  return (
    <div className="col-form">
      {outputs.map((p) => (
        <Field key={p.id} label={what} title={`Its name on the port and in the tables (empty: “${p.label}”, made from what it is connected to)`}>
          <TextInput value={p.name ?? ''} placeholder={p.label} onChange={(name) => onChange(outputs.map((q) => (q.id === p.id ? { ...q, name: name || undefined } : q)))} />
        </Field>
      ))}
    </div>
  );
}

export function GroupNodeView(props: NodeProps<GroupNode>) {
  if (props.data.batch) return <BatchView {...props} />;
  return <PlainGroup {...props} />;
}

function PlainGroup({ id, data }: NodeProps<GroupNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const nav = useGroupNav();
  const self = { id, type: 'subgraph', data } as AppNode;
  const inside = data.nodes.filter((n) => n.type !== 'groupin' && n.type !== 'groupout').length;
  const names = portNames(data.outputs);
  return (
    <div className="node node-group">
      <div className="row">
        <TextInput value={data.name} placeholder="Group" onChange={(name) => updateNodeData(id, { name })} />
        <button className="nodrag btn-run" title="See and change the nodes inside" onClick={() => nav.open(id)}>
          Open <ChevronRight {...IC} />
        </button>
      </div>
      <div className="hint">
        {inside} node{inside === 1 ? '' : 's'} inside
      </div>
      {data.inputs.map((p) => (
        <InPort key={p.id} label={p.label} port={known(targetAccepts(self, p.id)[0] ?? p.type)} id={p.id} />
      ))}
      <NodeOptions>
        <OutputNames outputs={data.outputs} what="Output" onChange={(outputs) => updateNodeData(id, { outputs })} />
      </NodeOptions>
      {data.outputs.map((p, k) => (
        <OutPort key={p.id} label={names[k]} port={known(sourcePort(self, p.id) ?? p.type)} id={p.id} />
      ))}
      <Messages result={r} />
    </div>
  );
}

// A Batch: its steps (opened like a group) run on every file of its first input; what they give gathered in a table
// (a row per file), a workbook (a sheet per file) and all the rows one under the other. While it is not ready, a guide
// of its three steps (the files, the steps, what is kept), each ticked when done; its files listed in the options (what
// their names say, their errors — one clicked: the file its steps are shown on inside).
function BatchView({ id, data }: NodeProps<GroupNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const nav = useGroupNav();
  const spec = data.batch ?? {};
  const set = (p: Partial<BatchSpec>) => updateNodeData(id, { batch: { ...spec, ...p } });
  const self = { id, type: 'subgraph', data } as AppNode;
  const steps = data.nodes.filter((n) => n.type !== 'groupin' && n.type !== 'groupout');
  const b = r?.view.batch;
  const list = b?.list ?? [];
  const table = r?.outputs.table?.t === 'dataset' ? r.outputs.table.v : undefined;
  const [guessNote, setGuessNote] = useState('');
  // over the columns of one table, not the files: the runs are its columns
  const cols = spec.over === 'columns';
  const unit = cols ? 'column' : 'file';
  // the three steps: the files connected, steps inside, something kept
  const kept = portNames(data.outputs);
  const done = [!!b, steps.length > 0, kept.length > 0];
  const stepNames = [...new Set(steps.map((n) => nodeTitle(n)))];
  const guide: [string, string][] = [
    cols
      ? ['Columns', done[0] ? `${b!.files} column${b!.files === 1 ? '' : 's'}` : 'Connect a table (an Import, a Workbook …) to “table”, then choose its columns and their X in the options.']
      : ['Files', done[0] ? `${b!.files} file${b!.files === 1 ? '' : 's'}` : 'Connect the workbook output of an Import (several files opened together, or Open a folder) to “files”.'],
    ['Steps', done[1] ? `${steps.length} step${steps.length === 1 ? '' : 's'}: ${stepNames.slice(0, 3).join(', ')}${stepNames.length > 3 ? ' …' : ''}` : `Open the batch and build the analysis on one ${unit} (it starts from it: X and the ${unit}${cols ? ' as Y' : ''}).`],
    ['Keep', done[2] ? `kept: ${kept.join(', ')}` : `Inside, connect what to keep from each ${unit} (a value, a table) to “+ keep”.`],
  ];
  const ready = done.every(Boolean);
  // what the pattern reads from the first file's name (or that it does not match)
  const first = list[0];
  const guess = () => {
    const p = guessPattern(list.map((f) => f.name));
    if (p) {
      set({ pattern: p });
      setGuessNote('');
    } else setGuessNote('No shape shared by the names (the same text between their numbers): write the pattern.');
  };
  return (
    <div className="node node-group">
      <div className="row">
        <TextInput value={data.name} placeholder="Batch" onChange={(name) => updateNodeData(id, { name })} />
        <button className="nodrag btn-run" title="See and change the steps run on every file (shown on one file: the first, or the one chosen)" onClick={() => nav.open(id)}>
          Open <ChevronRight {...IC} />
        </button>
      </div>
      {ready ? (
        <div className="hint">
          ✓ {b!.files} {unit}{b!.files === 1 ? '' : 's'} · {steps.length} step{steps.length === 1 ? '' : 's'} · kept: {kept.join(', ')}
          {b?.failed.length ? <span className="warn-text"> · {b.failed.length} with errors</span> : null}
        </div>
      ) : (
        <ol className="batch-guide">
          {guide.map(([name, text], k) => (
            <li key={name} className={done[k] ? 'done' : ''}>
              <span className="batch-step">{done[k] ? '✓' : k + 1}</span>
              <span>
                <b>{name}</b>: {text}
              </span>
            </li>
          ))}
        </ol>
      )}
      {data.inputs.map((p, k) => (
        <InPort key={p.id} label={k === 0 ? (cols ? 'table' : 'files') : p.label} port={k === 0 ? (cols ? 'dataset' : 'workbook') : known(targetAccepts(self, p.id)[0] ?? p.type)} id={p.id} title={k === 0 ? (cols ? 'The table whose columns the steps run on (a workbook: its sheet chosen in the options)' : 'The files: an Import with several files opened together (or a folder), a sheet each') : `The same for every ${unit}`} />
      ))}
      <NodeOptions>
        <Field label="Over" title="What the steps run on: every file (every sheet of a workbook), or every column of one table (each with its X)">
          <Select<'files' | 'columns'> value={cols ? 'columns' : 'files'} options={[['files', 'every file (sheet)'], ['columns', 'every column of a table']]} onChange={(o) => set({ over: o === 'columns' ? 'columns' : undefined, show: undefined })} />
        </Field>
        {cols && b?.sheets && (
          <Field label="Sheet" title="The sheet of the workbook whose columns are run on">
            <Select<string> {...sheetOptions(b.sheets, spec.sheet ?? '')} onChange={(sheet) => set({ sheet: sheet || undefined, show: undefined })} />
          </Field>
        )}
        {cols && (
          <Field label="Columns" title="The columns the steps run on, each in turn: 2-6, B-F (letters), names, R* (a pattern), !C (not); empty: every Y column. A ±Y designated right after a column goes with it">
            <ColumnsPicker value={spec.cols ?? ''} names={b?.cols ?? []} auto="auto: every Y column" onChange={(c) => set({ cols: c || undefined, show: undefined })} />
          </Field>
        )}
        {cols && (
          <Field label="X" title="The X of every column: one column for all (the designated X unless chosen), the X on the left of each column (a table of X, Y, X, Y … pairs, by their designations), or the row number">
            <span className="row">
              <Select<NonNullable<BatchSpec['xFrom']>>
                value={spec.xFrom ?? 'one'}
                options={[
                  ['one', 'one column for all'],
                  ['left', 'the X on the left of each'],
                  ['row', 'the row number'],
                ]}
                onChange={(xFrom) => set({ xFrom: xFrom === 'one' ? undefined : xFrom })}
              />
              {(spec.xFrom ?? 'one') === 'one' && (
                <Select<string> value={spec.x ?? ''} options={[['', 'the designated X'], ...(b?.cols ?? []).map((c): [string, string] => [c, c]), ...(spec.x && !(b?.cols ?? []).includes(spec.x) ? [[spec.x, `${spec.x} (missing)`] as [string, string]] : [])]} onChange={(x) => set({ x: x || undefined })} />
              )}
            </span>
          </Field>
        )}
        <Field label="Names" title="What the file names say, as columns of the table: {Name} takes a number, {Name:text} a word, the rest is written as in the names. Example: sample_{T}C_{t}h reads T = 25 and t = 2 from sample_25C_2h">
          <TextInput value={spec.pattern ?? ''} placeholder="e.g. sample_{T}C_{t}h" onChange={(pattern) => set({ pattern: pattern || undefined })} />
          <button className="nodrag" disabled={list.length < 2} title="A pattern guessed from the names: the numbers that change from file to file become {V1}, {V2} …; then name them" onClick={guess}>
            Guess
          </button>
        </Field>
        {first && (
          <div className="hint mono">
            {first.name} → {spec.pattern?.trim() ? first.read || 'does not match the pattern' : 'nothing read (no pattern)'}
          </div>
        )}
        {guessNote && <div className="msg warn">{guessNote}</div>}
        <Field label="Order" title={`The order of the ${unit}s in the table and the workbook`}>
          <Select<NonNullable<BatchSpec['order']>>
            value={spec.order ?? 'given'}
            options={[
              ['given', 'as they come'],
              ['name', 'by name (2 before 10)'],
              ['value', 'by the first value of the names'],
            ]}
            onChange={(order) => set({ order: order === 'given' ? undefined : order })}
          />
        </Field>
        <Field label="Long tables" title={`The tables of more than one row kept (a curve, a spectrum): every ${unit}'s rows one under the other, the ${unit} in a column before them; or its columns side by side, named after the ${unit} (one X for all when every ${unit} has the same X), ready for a Plot`}>
          <Select<'stack' | 'side'>
            value={spec.long ?? 'stack'}
            options={[
              ['stack', 'one under the other'],
              ['side', 'side by side'],
            ]}
            onChange={(long) => set({ long: long === 'side' ? 'side' : undefined })}
          />
        </Field>
        <OutputNames outputs={data.outputs} what="Kept" onChange={(outputs) => updateNodeData(id, { outputs })} />
        <div className="hint">
          {kept.length ? `Kept from every ${unit}: ${kept.join(', ')} (named above).` : 'Nothing is kept yet.'} To keep more, open the batch and connect a value, a table or a Plot’s figure to “+ keep” on its Group output (the Plots: “figures”, a panel each in a Merge).
        </div>
        {list.length > 0 && (
          <div className="batch-files nowheel">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{cols ? 'Column' : 'File'}</th>
                  <th>Its name says</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((f, k) => (
                  <tr key={`${k}-${f.name}`} className={`nodrag${k === (b?.shown ?? 0) ? ' shown' : ''}`} title={f.errors.length ? f.errors.join('\n') : `Click: the ${unit} the steps are shown on inside`} onClick={() => set({ show: k || undefined })}>
                    <td>{k + 1}</td>
                    <td className="mono">{f.name}</td>
                    <td className="mono">{f.read}</td>
                    <td>
                      {f.errors.length ? <span className="warn-text">⚠ {f.errors[0]}</span> : '✓'}
                      {f.own?.length ? <span className="muted" title={`Own settings: ${f.own.join(', ')}`}> ✎ {f.own.length} own</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {table && <DataPreview columns={table.columns} rows={6} />}
      </NodeOptions>
      <Messages result={r} />
      <OutPort label="table" port="dataset" id="table" title={`A row per ${unit}: its name, what the name says, the values kept (and the one row of a table kept)`} />
      <OutPort label="sheets" port="workbook" id="sheets" title={`A sheet per ${unit}: the tables kept (Sheets to columns or a Plot of a workbook draws them all)`} />
      <OutPort label="all rows" port="dataset" id="stacked" title={spec.long === 'side' ? `The first table kept, every ${unit}'s columns side by side (named after the ${unit})` : `The rows of every ${unit} one under the other, the ${unit} and what its name says before them`} />
      {data.outputs.map((p, k) =>
        p.type === 'figure' ? null : <OutPort key={p.id} label={kept[k]} port="dataset" id={`k-${p.id}`} title={`“${kept[k]}” alone: a value (or a table of one row) gives a row per ${unit}; a longer table, ${spec.long === 'side' ? `every ${unit}'s columns side by side` : `the rows of every ${unit} one under the other`}`} />,
      )}
      {(data.outputs.some((p) => p.type === 'figure') || r?.outputs.figures) && <OutPort label="figures" port="figure" id="figures" title={`The Plots kept, one from every ${unit} (named after it): connect them to a Merge, a panel each`} />}
    </div>
  );
}

// Inside a Batch, at the top: the file (or column) its steps are shown on (◀ ▶ or chosen; ✎ one with its own settings
// or steps skipped), what is kept from every one; the steps with that file's own settings (each back to the common
// ones, ↺, or made the common ones for every file, ⇪), the steps skipped for it (↺: run on it again). Whether a
// step's changes go to every file or to the one shown: in its options (BatchStepBar).
export function BatchFileBar({
  files,
  shown,
  unit,
  kept,
  onShow,
  ownSteps,
  skippedSteps,
  ownCount,
  onBack,
  onForAll,
  onUnskip,
}: {
  files: { name: string; errors: string[] }[];
  shown: number;
  unit: 'file' | 'column';
  kept: string[];
  onShow: (k: number) => void;
  ownSteps: { id: string; title: string }[];
  skippedSteps: { id: string; title: string }[];
  ownCount: (name: string) => number;
  onBack: (id: string) => void;
  onForAll: (id: string) => void;
  onUnskip: (id: string) => void;
}) {
  if (!files.length) return <span className="hint">These steps run on every {unit}: connect the {unit === 'file' ? 'files' : 'table'} to the batch (outside) to see them here, one at a time. Connect to “+ keep” what to keep from each {unit}.</span>;
  return (
    <span className="batch-bar">
      <span className="row">
        <span className="muted">{unit === 'file' ? 'File' : 'Column'} shown:</span>
        <button className="nodrag" disabled={shown <= 0} title="The file before" onClick={() => onShow(shown - 1)}>
          <ChevronLeft {...IC} />
        </button>
        <Select<string> value={String(shown)} title={`The ${unit} these steps are shown on (they run on every one); ✎ a ${unit} with its own settings or steps skipped, ⚠ one with errors`} options={files.map((f, k): [string, string] => [String(k), `${k + 1} / ${files.length}: ${f.name}${ownCount(f.name) ? ' ✎' : ''}${f.errors.length ? ' ⚠' : ''}`])} onChange={(v) => onShow(Number(v))} />
        <button className="nodrag" disabled={shown >= files.length - 1} title={`The ${unit} after`} onClick={() => onShow(shown + 1)}>
          <ChevronRight {...IC} />
        </button>
        <span className="muted">{kept.length ? `kept: ${kept.join(', ')}` : 'nothing kept yet: connect to “+ keep”'}</span>
      </span>
      {skippedSteps.length > 0 && (
        <span className="row">
          <span className="muted">Skipped for {files[shown]?.name}:</span>
          {skippedSteps.map((q) => (
            <span key={q.id} className="chip">
              ⊘ {q.title}
              <button className="nodrag ts-btn" title={`Run it on this ${unit} again`} onClick={() => onUnskip(q.id)}>
                ↺
              </button>
            </span>
          ))}
        </span>
      )}
      {ownSteps.length > 0 && (
        <span className="row">
          <span className="muted">Own settings of {files[shown]?.name}:</span>
          {ownSteps.map((q) => (
            <span key={q.id} className="chip">
              ✎ {q.title}
              <button className="nodrag ts-btn" title={`Back to the common settings (for this ${unit})`} onClick={() => onBack(q.id)}>
                ↺
              </button>
              <button className="nodrag ts-btn" title={`Use for all ${unit}s: these settings become the common ones`} onClick={() => onForAll(q.id)}>
                ⇪
              </button>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// A step of a Batch, above its options: its changes for every file (the common settings) or for the file shown only
// (each file its own; the others keep the common ones); skipped for the file shown (it passes its data on unchanged
// where it can, else gives nothing for that file)
// a name written where the cursor is (a text field of the step, still focused), else copied
function insertName(text: string) {
  const el = document.activeElement as HTMLElement | null;
  const editable = !!el && (el.isContentEditable || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text') || el.tagName === 'TEXTAREA');
  if (editable && document.execCommand('insertText', false, text)) return;
  void navigator.clipboard?.writeText(text).then(() => notify(`${text} copied: paste it into a text (a legend, an axis title …).`));
}
// names: the names a figure's texts can hold, filled for every file or column ({name}, what the pattern reads)
export function BatchStepBar({ unit, shown, each, skipped, ownCount, total, onEach, onSkip, names }: { unit: 'file' | 'column'; shown?: string; each: boolean; skipped: boolean; ownCount: number; total: number; onEach: (on: boolean) => void; onSkip: (on: boolean) => void; names?: string[] }) {
  return (
    <div className="batch-step-bar">
      <span className="row wrap">
        <span className="muted">In the batch:</span>
        <Select<'all' | 'each'>
          seg
          value={each ? 'each' : 'all'}
          title={`Its changes: the same for all ${unit}s (the common settings; back to it, the ${unit}s' own settings of this step are dropped), or each ${unit} its own (a change made while a ${unit} is shown is for that ${unit} only)`}
          options={[
            ['all', `Same for all ${unit}s`],
            ['each', `Each ${unit} its own`],
          ]}
          onChange={(v) => onEach(v === 'each')}
        />
        {each && <span className="muted">{ownCount ? `${ownCount} of ${total} with their own` : `none with their own yet`}</span>}
      </span>
      {shown && (
        <Check
          label={`Skip for this ${unit} (${shown})`}
          title={`The step does not run on this ${unit}: what reaches it goes on unchanged (a table to a table), else it gives nothing for this ${unit} (what is kept from it is empty there)`}
          value={skipped}
          onChange={onSkip}
        />
      )}
      {names && names.length > 0 && (
        <span className="row wrap" title={`Written in a text of the figure (its legend, an axis title, a text on it, the page's name), filled with every ${unit}'s own: click one with the cursor in the text (else it is copied)`}>
          <span className="muted">Names:</span>
          {names.map((n) => (
            <button key={n} className="nodrag ts-btn mono" onMouseDown={(e) => e.preventDefault()} onClick={() => insertName(`{${n}}`)}>
              {`{${n}}`}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

// Inside a group: what reaches its input ports, given on to the nodes inside (in a Batch, the first is one file).
export function GroupInNodeView() {
  const { current } = useGroupNav();
  return (
    <div className="node node-groupio">
      {(current?.inputs ?? []).map((p, k) => (
        <OutPort key={p.id} label={current?.batch && k === 0 ? 'one file' : p.label} port={current?.batch && k === 0 ? 'dataset' : known(p.type)} id={p.id} />
      ))}
      {!current?.inputs.length && <div className="hint">The group has no inputs.</div>}
    </div>
  );
}

// Inside a group: what leaves by its output ports; “+” makes a new one.
export function GroupOutNodeView() {
  const { current } = useGroupNav();
  return (
    <div className="node node-groupio">
      {(current?.outputs ?? []).map((p, k) => (
        <InPort key={p.id} label={portNames(current?.outputs ?? [])[k]} port={known(p.type)} id={p.id} />
      ))}
      <InPort label={current?.batch ? '+ keep' : '+ output'} port="any" id={NEW_OUT} title={current?.batch ? 'Connect a value, a table or a Plot’s figure: it is kept for every file (the figures together on the batch’s “figures”, for a Merge)' : 'Connect anything: it becomes a new output of the group'} />
    </div>
  );
}
