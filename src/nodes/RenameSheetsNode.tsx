// Sheets (once Rename sheets): the sheets of a workbook as a list, as Columns lists columns (engine/sheetNames.ts) — a
// row each: ⠿ dragged to move it, kept or not, its new name; sheets added (a copy of one, an empty one) and the tables
// on the ports A, B …; every name at once: a find and its replacement, a pattern read from the names and a template,
// the order. On the node: how many and the first names.
import { useState } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { guessPattern } from '../engine/batch.ts';
import { columnLetter } from '../engine/csv.ts';
import { maxOf } from '../engine/minmax.ts';
import type { AppNode, RenameSheetsData, RenameSheetsNode, SheetAdded } from '../types.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

export function RenameSheetsNodeView({ id, data }: NodeProps<RenameSheetsNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<RenameSheetsData>) => updateNodeData(id, p);
  const rows = r?.view.renamed ?? [];
  const kept = rows.filter((x) => !x.dropped);
  const changed = rows.filter((x) => x.to !== x.from).length;
  const added = data.added ?? [];
  const setName = (key: string, to: string) => {
    const names = { ...data.names };
    if (to.trim()) names[key] = to;
    else delete names[key];
    set({ names: Object.keys(names).length ? names : undefined });
  };
  const setKept = (key: string, on: boolean) => {
    const drop = (data.drop ?? []).filter((x) => x !== key);
    if (!on) drop.push(key);
    set({ drop: drop.length ? drop : undefined });
  };
  // a row dragged onto another: every sheet's place kept as moved (the order then as moved)
  const [moving, setMoving] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const move = (a: number, b: number) => {
    if (a === b) return;
    const keys = rows.map((x) => x.key);
    const [k] = keys.splice(a, 1);
    keys.splice(b, 0, k);
    set({ moved: keys, order: undefined });
  };
  // the sheets added here: a copy of a sheet, or an empty one with its columns named
  const setAdded = (aid: string, p: Partial<SheetAdded>) => set({ added: added.map((a) => (a.id === aid ? { ...a, ...p } : a)) });
  const addSheet = (kind: SheetAdded['kind']) => {
    const n = 1 + Math.max(0, ...added.map((a) => Number(/^s(\d+)$/.exec(a.id)?.[1] ?? 0)));
    const src = rows.find((x) => !x.added);
    const a: SheetAdded = kind === 'copy' ? { id: `s${n}`, name: src ? `${src.to} (copy)` : 'Copy', kind, ...(src ? { copy: src.key } : {}) } : { id: `s${n}`, name: `Sheet ${n}`, kind, cols: 'X, Y', rows: 10 };
    set({ added: [...added, a] });
  };
  const removeAdded = (aid: string) => {
    const key = `=${aid}`;
    const names = { ...data.names };
    delete names[key];
    set({ added: added.filter((a) => a.id !== aid), names: Object.keys(names).length ? names : undefined, drop: data.drop?.filter((q) => q !== key), moved: data.moved?.filter((q) => q !== key) });
  };
  // the ports A, B …: one free after the last one used
  const conns = useNodeConnections({ handleType: 'target' });
  const usedPorts = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const portCount = Math.max(1, Math.max(-1, maxOf(usedPorts)) + 2);
  const ins = new Map((r?.view.sheetIns ?? []).map((i) => [i.letter, i]));
  const copyOptions = rows.filter((x) => !x.added).map((x): [string, string] => [x.key, x.port ? `${x.port}: ${x.from}` : x.from]);
  return (
    <div className="node node-renamesheets">
      <InPort label="workbook" port="workbook" id="in" title="A workbook: an Import of several files or sheets, Columns to sheets, a Batch's sheets (a table: one sheet)" />
      {Array.from({ length: portCount }, (_, k) => {
        const inp = ins.get(columnLetter(k));
        return (
          <InPort key={k} label={columnLetter(k)} port="dataset" id={`in-${k}`} title="Optional: a table from elsewhere, a sheet of its own (a workbook: all its sheets), after the others unless moved">
            <span className="muted ellipsis">{inp ? `${inp.name}${inp.sheets > 1 ? ` · ${inp.sheets} sheets` : ''}` : 'a table (optional)'}</span>
          </InPort>
        );
      })}
      {rows.length > 0 && (
        <div className="hint">
          {`${kept.length} sheet${kept.length === 1 ? '' : 's'}${changed ? `, ${changed} renamed` : ''}: ${kept
            .slice(0, 4)
            .map((x) => x.to)
            .join(', ')}${kept.length > 4 ? ' …' : ''}`}
        </div>
      )}
      <NodeOptions>
        {rows.length > 0 && (
          <div className="rename-sheets">
            <div className="rename-sheet head">
              <span />
              <span title="Kept (unticked: left out)">✓</span>
              <span>Sheet</span>
              <span title="Typed: this name; empty: as the rules below make it">New name</span>
              <span />
            </div>
            {rows.map((x, k) => {
              const a = x.added ? added.find((q) => `=${q.id}` === x.key) : undefined;
              return (
                <div
                  key={x.key}
                  className={`rename-sheet${x.dropped ? ' off' : ''}${dropAt === k && moving !== null && moving !== k ? (moving < k ? ' drop-after' : ' drop-before') : ''}`}
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
                  <span
                    className="grip nodrag"
                    draggable
                    title="Drag to move the sheet"
                    onDragStart={(ev) => {
                      ev.dataTransfer.effectAllowed = 'move';
                      ev.dataTransfer.setData('text/plain', x.key);
                      setMoving(k);
                    }}
                    onDragEnd={() => {
                      setMoving(null);
                      setDropAt(null);
                    }}
                  >
                    {x.added ? '+' : (x.port ?? '⠿')}
                  </span>
                  <input className="nodrag" type="checkbox" checked={!x.dropped} title="Kept (unticked: left out; a copy can still take it)" onChange={(e) => setKept(x.key, e.target.checked)} />
                  <span className="ellipsis muted" title={x.added ? (x.added === 'copy' ? 'A copy made here (its sheet below)' : 'An empty sheet made here (its columns below)') : x.read ? `${x.from} (${x.read})` : x.from}>
                    {x.added ? (x.added === 'copy' ? 'copy' : 'empty') : x.from}
                  </span>
                  {a ? <TextInput value={a.name} placeholder={x.to} title="The name of the sheet added" onChange={(name) => setAdded(a.id, { name })} /> : <TextInput value={data.names?.[x.key] ?? ''} placeholder={x.to} onChange={(to) => setName(x.key, to)} />}
                  {a ? (
                    <button className="nodrag ts-btn" title="Remove this sheet" onClick={() => removeAdded(a.id)}>
                      <X {...IC} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="row">
          <Select<string>
            value=""
            title="A sheet made here: a copy of a sheet (of the workbook or a port, kept or not), or an empty one with its columns named"
            options={[
              ['', '+ Sheet…'],
              ['copy', 'a copy of a sheet'],
              ['empty', 'an empty sheet'],
            ]}
            onChange={(v) => (v === 'copy' || v === 'empty') && addSheet(v)}
          />
        </div>
        {added.map((a) => (
          <div key={a.id} className="row wrap">
            <span className="muted">{a.name || a.id}:</span>
            {a.kind === 'copy' ? (
              <Field label="Copy of" title="The sheet it copies (as it comes, before its new name)">
                <Select<string> value={a.copy ?? ''} options={[['', '–'], ...copyOptions]} onChange={(copy) => setAdded(a.id, { copy: copy || undefined })} />
              </Field>
            ) : (
              <>
                <Field label="Columns" title="The names of its columns, separated by commas (e.g. Time (s), Signal)">
                  <TextInput value={a.cols ?? ''} placeholder="X, Y" onChange={(cols) => setAdded(a.id, { cols })} />
                </Field>
                <Field label="Rows" title="Its rows, empty (for the nodes after it to fill)">
                  <NumInput className="tiny" min={0} step={1} value={a.rows ?? 10} onChange={(rows) => setAdded(a.id, { rows })} />
                </Field>
              </>
            )}
          </div>
        ))}
        <div className="hint">Every name at once (a name typed in the list wins):</div>
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
                  const g = guessPattern(rows.filter((x) => !x.added).map((x) => x.from));
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
          <Field label="Order" title="The sheets as they come (or as moved in the list), by their new name (numbers in their order: 2 before 10), or by the first value the pattern read">
            <Select<NonNullable<RenameSheetsData['order']>>
              value={data.order ?? 'given'}
              options={[
                ['given', data.moved?.length ? 'as moved' : 'as they come'],
                ['name', 'by name'],
                ['value', 'by the value read'],
              ]}
              onChange={(order) => set({ order: order === 'given' ? undefined : order })}
            />
          </Field>
        </div>
      </NodeOptions>
      <Messages result={r} />
      <OutPort label={`workbook${kept.length ? ` (${kept.length} sheet${kept.length === 1 ? '' : 's'})` : ''}`} port="workbook" id="out" title="The sheets with their new names, in their order: Sheets to columns, Extract column, a Plot of a workbook, a Batch" />
    </div>
  );
}
