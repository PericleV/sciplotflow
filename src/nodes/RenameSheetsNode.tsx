// Rename sheets: the sheets of a workbook given new names (engine/sheetNames.ts). On the node: how many and the first
// new names; in its options: a find and its replacement, a pattern read from the names and a template, the order, and
// the table of every sheet (kept or not, its new name typed or as the rules make it).
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { guessPattern } from '../engine/batch.ts';
import type { AppNode, RenameSheetsData, RenameSheetsNode } from '../types.ts';
import { Check, Field, InPort, Messages, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';

export function RenameSheetsNodeView({ id, data }: NodeProps<RenameSheetsNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<RenameSheetsData>) => updateNodeData(id, p);
  const rows = r?.view.renamed ?? [];
  const kept = rows.filter((x) => !x.dropped);
  const changed = rows.filter((x) => x.to !== x.from).length;
  const setName = (from: string, to: string) => {
    const names = { ...data.names };
    if (to.trim()) names[from] = to;
    else delete names[from];
    set({ names: Object.keys(names).length ? names : undefined });
  };
  const setKept = (from: string, on: boolean) => {
    const drop = (data.drop ?? []).filter((x) => x !== from);
    if (!on) drop.push(from);
    set({ drop: drop.length ? drop : undefined });
  };
  return (
    <div className="node node-renamesheets">
      <InPort label="workbook" port="workbook" id="in" title="A workbook: an Import of several files or sheets, Columns to sheets, a Batch's sheets (a table: one sheet)" />
      {rows.length > 0 && (
        <div className="hint">
          {`${kept.length} sheet${kept.length === 1 ? '' : 's'}${changed ? `, ${changed} renamed` : ''}: ${kept
            .slice(0, 4)
            .map((x) => x.to)
            .join(', ')}${kept.length > 4 ? ' …' : ''}`}
        </div>
      )}
      <NodeOptions>
        <div className="grid2">
          <Field label="Find" title="Text found in every name (a regular expression when ticked below), replaced by the next field">
            <TextInput value={data.find ?? ''} placeholder="e.g. C-V 20-400K: " onChange={(find) => set({ find: find || undefined })} />
          </Field>
          <Field label="Replace by" title="What it is replaced by (empty: removed); a regular expression's groups as $1, $2 …">
            <TextInput value={data.replace ?? ''} placeholder="nothing" onChange={(replace) => set({ replace: replace || undefined })} />
          </Field>
          <Check label="Regular expression" title="Find as a regular expression (Append(\d+): its number as $1)" value={!!data.regex} onChange={(regex) => set({ regex: regex || undefined })} />
          <Field label="Pattern" title="What the names say, as in a Batch: {Name} a number, {Name:text} a word, the rest as written (Run_{T}K_{t}h); Guess: from the names">
            <span className="row">
              <TextInput value={data.pattern ?? ''} placeholder="…Append{n}" onChange={(pattern) => set({ pattern: pattern || undefined })} />
              <button
                className="nodrag"
                disabled={rows.length < 2}
                title="The pattern guessed from the names: their numbers that change become {V1}, {V2} …"
                onClick={() => {
                  const g = guessPattern(rows.map((x) => x.from));
                  if (g) set({ pattern: g, ...(data.template ? {} : { template: g.match(/\{[^{}]+\}/g)?.join(' ') ?? '' }) });
                }}
              >
                Guess
              </button>
            </span>
          </Field>
          <Field label="New name" title="Written from what the pattern read: {Name} its value, {name} the old name, {n} its place (1, 2 …); empty: the pattern is not used">
            <TextInput value={data.template ?? ''} placeholder="{n} K" onChange={(template) => set({ template: template || undefined })} />
          </Field>
          <Field label="Order" title="The sheets as they come, by their new name (numbers in their order: 2 before 10), or by the first value the pattern read">
            <Select<NonNullable<RenameSheetsData['order']>>
              value={data.order ?? 'given'}
              options={[
                ['given', 'as they come'],
                ['name', 'by name'],
                ['value', 'by the value read'],
              ]}
              onChange={(order) => set({ order: order === 'given' ? undefined : order })}
            />
          </Field>
        </div>
        {rows.length > 0 && (
          <div className="rename-sheets">
            <div className="rename-sheet head">
              <span title="Kept (unticked: left out)">✓</span>
              <span>Sheet</span>
              <span title="Typed: this name; empty: as the rules above make it">New name</span>
            </div>
            {rows.map((x) => (
              <div key={x.from} className={`rename-sheet${x.dropped ? ' off' : ''}`}>
                <input className="nodrag" type="checkbox" checked={!x.dropped} title="Kept (unticked: left out)" onChange={(e) => setKept(x.from, e.target.checked)} />
                <span className="ellipsis muted" title={x.read ? `${x.from} (${x.read})` : x.from}>
                  {x.from}
                </span>
                <TextInput value={data.names?.[x.from] ?? ''} placeholder={x.to} onChange={(to) => setName(x.from, to)} />
              </div>
            ))}
          </div>
        )}
      </NodeOptions>
      <Messages result={r} />
      <OutPort label={`workbook${kept.length ? ` (${kept.length} sheet${kept.length === 1 ? '' : 's'})` : ''}`} port="workbook" id="out" title="The sheets with their new names, in their order: Sheets to columns, Extract column, a Plot of a workbook, a Batch" />
    </div>
  );
}
