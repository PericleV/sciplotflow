// A free note (what was measured, how, why), kept in the project. A plain note is typed in the node; a formatted one too
// — its text typed in the node, its figures and pictures there as a line, its tables small — while the toolbar, the
// blocks and the export are in the options panel (a small word processor), or on a page of its own. The grip at its
// bottom-right corner changes its width and height (kept in the project).
import { lazy, Suspense, useState } from 'react';
import { NodeResizeControl, useReactFlow, useStore, type NodeProps } from '@xyflow/react';
import type { AppNode, NoteData, NoteNode } from '../types.ts';
import { NodeOptions } from './NodeOptions.tsx';
import { RichView } from './RichView.tsx';
import type { RichDoc } from './richDoc.ts';

const RichEditor = lazy(() => import('./RichEditor.tsx').then((m) => ({ default: m.RichEditor })));
const RichPage = lazy(() => import('./RichEditor.tsx').then((m) => ({ default: m.RichPage })));

export function NoteNodeView({ id, data }: NodeProps<NoteNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const [page, setPage] = useState(false);
  // sized: a width and height of its own (kept in the project) — not the measured size the props give, which every
  // note has once drawn (the text then shrank to nothing)
  const sized = useStore((s) => {
    const n = s.nodeLookup.get(id);
    return n?.width !== undefined && n?.height !== undefined;
  });
  // the document and its plain text kept together (a plain document: the text alone)
  const change = (doc: RichDoc | undefined, text: string) => updateNodeData(id, { doc, text });
  // the font of its formulas (absent: automatic)
  const font = { mathFont: data.mathFont, onMathFont: (mathFont: NoteData['mathFont'] | 'auto') => updateNodeData(id, { mathFont: mathFont === 'auto' ? undefined : mathFont }) };
  return (
    <div className={`node node-note${sized ? ' sized' : ''}`}>
      {data.doc ? (
        <div className="note-rich nodrag nowheel" title="Type here; the toolbar, figures, pictures, tables and the export: in the options panel">
          <Suspense fallback={<RichView doc={data.doc} limit={12} />}>
            <RichEditor doc={data.doc} text={data.text} onChange={change} compact {...font} />
          </Suspense>
        </div>
      ) : (
        <textarea className="nodrag nowheel note-text" value={data.text} placeholder="Notes: sample, instrument, settings (formatting, the whole note: in the options panel)" spellCheck={false} onChange={(e) => updateNodeData(id, { text: e.target.value })} />
      )}
      {!data.collapsed && (
        <NodeResizeControl position="bottom-right" minWidth={200} minHeight={90} className="note-grip" style={{ background: 'transparent', border: 'none' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M11 3 3 11M11 7 7 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </NodeResizeControl>
      )}
      <NodeOptions>
        <Suspense fallback={<div className="muted">Loading the editor…</div>}>
          <RichEditor doc={data.doc} text={data.text} onChange={change} onLarge={() => setPage(true)} {...font} />
        </Suspense>
      </NodeOptions>
      {page && (
        <Suspense fallback={null}>
          <RichPage doc={data.doc} text={data.text} onChange={change} onClose={() => setPage(false)} {...font} />
        </Suspense>
      )}
    </div>
  );
}
