// Group nodes: the group (its ports, its name, Open), a Batch (a group run on every file), and inside them the Group
// input and Group output nodes.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { sourcePort, targetAccepts, type PortType } from '../engine/ports.ts';
import { NEW_OUT } from '../engine/subgraph.ts';
import type { BatchSpec } from '../engine/batch.ts';
import type { AppNode, GroupNode } from '../types.ts';
import { useGroupNav } from './groupNav.ts';
import { Field, InPort, Messages, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { DataPreview } from './DataNodes.tsx';
import { ChevronRight } from 'lucide-react';
import { IC } from './iconProps.ts';

const known = (t: string | undefined | null): PortType => (t && t !== 'any' ? (t as PortType) : 'any');

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
      {data.outputs.map((p) => (
        <OutPort key={p.id} label={p.label} port={known(sourcePort(self, p.id) ?? p.type)} id={p.id} />
      ))}
      <Messages result={r} />
    </div>
  );
}

// A Batch: its steps (opened like a group) run on every file of its first input; what they give gathered in a table
// (a row per file), a workbook (a sheet per file) and all the rows one under the other.
function BatchView({ id, data }: NodeProps<GroupNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const nav = useGroupNav();
  const spec = data.batch ?? {};
  const set = (p: Partial<BatchSpec>) => updateNodeData(id, { batch: { ...spec, ...p } });
  const self = { id, type: 'subgraph', data } as AppNode;
  const steps = data.nodes.filter((n) => n.type !== 'groupin' && n.type !== 'groupout').length;
  const b = r?.view.batch;
  const table = r?.outputs.table?.t === 'dataset' ? r.outputs.table.v : undefined;
  return (
    <div className="node node-group">
      <div className="row">
        <TextInput value={data.name} placeholder="Batch" onChange={(name) => updateNodeData(id, { name })} />
        <button className="nodrag btn-run" title="See and change the steps run on every file (shown on the first file)" onClick={() => nav.open(id)}>
          Open <ChevronRight {...IC} />
        </button>
      </div>
      <div className="hint">
        {steps} step{steps === 1 ? '' : 's'}
        {b ? ` · ${b.files} file${b.files === 1 ? '' : 's'}` : ''}
        {b?.failed.length ? ` · ${b.failed.length} with errors` : ''}
      </div>
      {data.inputs.map((p, k) => (
        <InPort key={p.id} label={k === 0 ? 'files' : p.label} port={k === 0 ? 'workbook' : known(targetAccepts(self, p.id)[0] ?? p.type)} id={p.id} title={k === 0 ? 'The files: an Import with several files opened together (or a folder), a sheet each' : 'The same for every file'} />
      ))}
      <NodeOptions>
        <Field label="Names" title="What the file names say, as columns of the table: {Name} takes a number, {Name:text} a word, the rest is written as in the names. Example: sample_{T}C_{t}h reads T = 25 and t = 2 from sample_25C_2h">
          <TextInput value={spec.pattern ?? ''} placeholder="e.g. sample_{T}C_{t}h" onChange={(pattern) => set({ pattern: pattern || undefined })} />
        </Field>
        <Field label="Order" title="The order of the files in the table and the workbook">
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
        <div className="hint">
          {data.outputs.length ? `Kept from every file: ${data.outputs.map((p) => p.label).join(', ')}.` : 'Nothing is kept yet.'} To keep more, open the batch and connect a value or a table to “+ keep” on its Group output.
        </div>
        {(b?.failed ?? []).map((f) => (
          <div key={f.name} className="msg warn">
            <b>{f.name}</b>: {f.errors.slice(0, 2).join('; ')}
            {f.errors.length > 2 ? ' …' : ''}
          </div>
        ))}
        {table && <DataPreview columns={table.columns} rows={6} />}
      </NodeOptions>
      <Messages result={r} />
      <OutPort label="table" port="dataset" id="table" title="A row per file: its name, what the name says, the values kept (and the one row of a table kept)" />
      <OutPort label="sheets" port="workbook" id="sheets" title="A sheet per file: the tables kept (Auto-extract or a Plot of a workbook draws them all)" />
      <OutPort label="all rows" port="dataset" id="stacked" title="The rows of every file one under the other, the file and what its name says before them" />
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
      {(current?.outputs ?? []).map((p) => (
        <InPort key={p.id} label={p.label} port={known(p.type)} id={p.id} />
      ))}
      <InPort label={current?.batch ? '+ keep' : '+ output'} port="any" id={NEW_OUT} title={current?.batch ? 'Connect a value or a table: it is kept for every file' : 'Connect anything: it becomes a new output of the group'} />
    </div>
  );
}
