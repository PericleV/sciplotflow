// Select figures: of the figures that come in (a Batch's “figures”, or Plots connected), all, one, or some (ticked, or
// by a list: names, numbers 2-5, R*). One gives a figure (to annotate, an inset, its own export); several, the figures
// together (a Merge lays them out, a panel each).
import { useNodesData, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { AppNode, SelectFigData, SelectFigNode } from '../types.ts';
import { nodeDisplayName } from '../nodeColors.ts';
import { Field, InPort, Messages, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';

export function SelectFiguresNodeView({ id, data }: NodeProps<SelectFigNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<SelectFigData>) => updateNodeData(id, p);
  const list = r?.view.figList ?? [];
  // (a Plot connected: named as its node; a Batch's: as its file or column)
  const nodes = useNodesData<AppNode>(list.filter((f) => !f.name).map((f) => f.key));
  const nameOf = (f: { key: string; name?: string }) => {
    const n = nodes.find((x) => x.id === f.key);
    return f.name ?? (n ? nodeDisplayName(n as AppNode) : f.key);
  };
  const take = data.take ?? 'all';
  const on = list.filter((f) => f.on);
  const tick = (key: string, yes: boolean) => {
    const was = data.ticked ?? list.filter((f) => f.on).map((f) => f.key);
    const next = yes ? [...new Set([...was, key])] : was.filter((k) => k !== key);
    set({ ticked: next, some: undefined });
  };
  return (
    <div className="node node-selectfig">
      <InPort label="figures" port="figure" id="figures" title="Figures: a Batch's “figures” (one from every file or column), or Plots (their “figure” outputs), one or several" />
      {list.length > 0 && <div className="hint">{`${on.length} of ${list.length}: ${on.slice(0, 3).map(nameOf).join(', ')}${on.length > 3 ? ' …' : ''}`}</div>}
      <NodeOptions>
        <div className="grid2">
          <Field label="Take" title="All of them, one, or some: one gives a figure (to annotate, an inset, an export of its own); several, the figures together (a Merge: a panel each)">
            <Select<NonNullable<SelectFigData['take']>>
              seg
              value={take}
              options={[
                ['all', 'all'],
                ['one', 'one'],
                ['some', 'some'],
              ]}
              onChange={(t) => set({ take: t === 'all' ? undefined : t })}
            />
          </Field>
          {take === 'one' && (
            <Field label="Figure" title="The figure taken">
              <Select<string> value={data.one ?? list[0]?.key ?? ''} options={list.map((f, k): [string, string] => [f.key, `${k + 1} · ${nameOf(f)}`])} onChange={(one) => set({ one })} />
            </Field>
          )}
          {take === 'some' && (
            <Field label="List" title="The figures by their names or numbers: 2-5, 8, R*, !3 (empty: those ticked below)">
              <TextInput value={data.some ?? ''} placeholder="the ones ticked" onChange={(some) => set({ some: some || undefined })} />
            </Field>
          )}
        </div>
        {take === 'some' && list.length > 0 && (
          <div className="rename-sheets">
            {list.map((f, k) => (
              <label key={f.key} className="row" title={f.key}>
                <input className="nodrag" type="checkbox" checked={f.on} disabled={!!data.some} onChange={(e) => tick(f.key, e.target.checked)} />
                <span className="muted">{k + 1}</span>
                <span className="ellipsis">{nameOf(f)}</span>
              </label>
            ))}
          </div>
        )}
      </NodeOptions>
      <Messages result={r} />
      <OutPort label={take === 'one' ? 'figure' : `figures${on.length ? ` (${on.length})` : ''}`} port="figure" id="figure" title={take === 'one' ? 'The figure taken' : 'The figures taken, together: connect them to a Merge (a panel each)'} />
    </div>
  );
}
