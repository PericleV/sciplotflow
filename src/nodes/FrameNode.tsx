// Group frame: a named, coloured box behind a group of nodes (its children, which move with it). Only its title bar
// takes the mouse (drag, select, double-click to rename); the inside lets clicks through to the nodes and connections.
// Clicked: its name, colour and removal in the options panel (as the right-click menu).
import { useState, type CSSProperties } from 'react';
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react';
import { FRAME_COLORS } from '../nodeColors.ts';
import { ungroup } from '../groups.ts';
import type { AppNode, FrameNode } from '../types.ts';
import { editCaption, useEditingCaption } from './captionStore.ts';
import { NodeOptions } from './NodeOptions.tsx';
import { Field, TextInput } from './ui.tsx';

// Mounted when the renaming starts (a double click, or right after “Frame…”).
function NameEditor({ id, name }: { id: string; name: string }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const [text, setText] = useState(name);
  const save = () => {
    updateNodeData(id, { name: text.trim() || 'Frame' });
    editCaption(null);
  };
  return (
    <input
      className="nodrag"
      autoFocus
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') editCaption(null);
        e.stopPropagation();
      }}
    />
  );
}

export function FrameNodeView({ id, data, selected }: NodeProps<FrameNode>) {
  const editing = useEditingCaption() === id;
  const color = data.color || FRAME_COLORS[0];
  const { updateNodeData, setNodes } = useReactFlow<AppNode>();
  return (
    <div className="group-frame" style={{ '--frame-color': color } as CSSProperties}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={80} color={color} />
      <div className="frame-header" onDoubleClick={() => editCaption(id)} title="Double-click to rename; its colour in the options panel (or right-click)">
        {editing ? <NameEditor id={id} name={data.name} /> : data.name || 'Frame'}
      </div>
      <NodeOptions>
        <Field label="Name">
          <TextInput value={data.name} placeholder="Frame" onChange={(name) => updateNodeData(id, { name })} />
        </Field>
        <Field label="Colour" title="The colour of the frame">
          <span className="color-pick">
            {FRAME_COLORS.map((c) => (
              <button key={c} className={`nodrag swatch-btn${c.toLowerCase() === color.toLowerCase() ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => updateNodeData(id, { color: c })} />
            ))}
            <input className="nodrag color" type="color" value={color} title="Any colour" onChange={(e) => updateNodeData(id, { color: e.target.value })} />
          </span>
        </Field>
        <div className="row">
          <button className="nodrag" title="The frame removed; its nodes stay where they are" onClick={() => setNodes((ns) => ungroup(ns, id))}>
            Remove the frame (keep the nodes)
          </button>
        </div>
      </NodeOptions>
    </div>
  );
}
