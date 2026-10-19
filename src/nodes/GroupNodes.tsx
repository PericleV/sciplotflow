// Group nodes: the group (its ports, its name, Open), and inside it the Group input and Group output nodes.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { sourcePort, targetAccepts, type PortType } from '../engine/ports.ts';
import type { AppNode, GroupNode } from '../types.ts';
import { useGroupNav } from './groupNav.ts';
import { InPort, Messages, OutPort, TextInput } from './ui.tsx';
import { ChevronRight } from 'lucide-react';
import { IC } from './iconProps.ts';

const known = (t: string | undefined | null): PortType => (t && t !== 'any' ? (t as PortType) : 'any');

export function GroupNodeView({ id, data }: NodeProps<GroupNode>) {
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

// Inside a group: what reaches its input ports, given on to the nodes inside.
export function GroupInNodeView() {
  const { current } = useGroupNav();
  return (
    <div className="node node-groupio">
      {(current?.inputs ?? []).map((p) => (
        <OutPort key={p.id} label={p.label} port={known(p.type)} id={p.id} />
      ))}
      {!current?.inputs.length && <div className="hint">The group has no inputs.</div>}
    </div>
  );
}

// Inside a group: what leaves by its output ports.
export function GroupOutNodeView() {
  const { current } = useGroupNav();
  return (
    <div className="node node-groupio">
      {(current?.outputs ?? []).map((p) => (
        <InPort key={p.id} label={p.label} port={known(p.type)} id={p.id} />
      ))}
      {!current?.outputs.length && <div className="hint">The group has no outputs.</div>}
    </div>
  );
}
