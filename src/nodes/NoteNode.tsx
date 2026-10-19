// A free note: plain text on the canvas (what was measured, how, why), kept in the project. The grip at its bottom-right
// corner changes its width and height (kept in the project).
import { NodeResizeControl, useReactFlow, useStore, type NodeProps } from '@xyflow/react';
import type { AppNode, NoteNode } from '../types.ts';

export function NoteNodeView({ id, data }: NodeProps<NoteNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  // sized: a width and height of its own (kept in the project) — not the measured size the props give, which every
  // note has once drawn (the text then shrank to nothing)
  const sized = useStore((s) => {
    const n = s.nodeLookup.get(id);
    return n?.width !== undefined && n?.height !== undefined;
  });
  return (
    <div className={`node node-note${sized ? ' sized' : ''}`}>
      <textarea className="nodrag nowheel note-text" value={data.text} placeholder="Notes: sample, instrument, settings" spellCheck={false} onChange={(e) => updateNodeData(id, { text: e.target.value })} />
      {!data.collapsed && (
        <NodeResizeControl position="bottom-right" minWidth={200} minHeight={90} className="note-grip" style={{ background: 'transparent', border: 'none' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M11 3 3 11M11 7 7 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </NodeResizeControl>
      )}
    </div>
  );
}
