// The view of a live figure or a picture in a Note's editor: the figure drawn from its node now (or the picture), its
// width, alignment (when selected) and numbered caption.
import { useId, useRef, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, useEditorState, type ReactNodeViewProps } from '@tiptap/react';
import { useStore } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { FigureSvg } from '../figure/render.tsx';
import { toPt } from '../figure/spec.ts';
import { nodeDisplayName } from '../nodeColors.ts';
import type { AppNode } from '../types.ts';
import { figureOfResult, pictureNumber } from './richFigures.ts';
import { boxCss, placeCss, placeOf } from './richDoc.ts';
import { Grip, PlaceTools, Resizer } from './RichPlace.tsx';

export function PictureView({ node, updateAttributes, selected, editor, getPos }: ReactNodeViewProps) {
  const isFig = node.type.name === 'figureRef';
  const nodeId = isFig ? String(node.attrs.node ?? '') : '';
  const fig = figureOfResult(useNodeResult(nodeId));
  const source = useStore((s) => (nodeId ? (s.nodeLookup.get(nodeId)?.internals.userNode as AppNode | undefined) : undefined));
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  // its number: the pictures before it, in the order of the note
  const k = useEditorState({ editor: editor as Editor, selector: ({ editor: ed }) => (ed ? pictureNumber(ed.state.doc, typeof getPos === 'function' ? (getPos() ?? 0) : 0) : 1) });
  const place = placeOf(node.attrs, 100, 'center');
  const caption = String(node.attrs.caption ?? '');
  const W = fig ? toPt(fig.width, fig.unit) : 1;
  const H = fig ? toPt(fig.height, fig.unit) : 1;
  const box = useRef<HTMLDivElement>(null);
  return (
    <NodeViewWrapper ref={box} className={`rich-pic rich-placed${selected ? ' selected' : ''}`} style={placeCss(place) as CSSProperties}>
      {editor.isEditable && <Grip />}
      {selected && editor.isEditable && (
        <div className="rich-pic-tools" contentEditable={false}>
          <PlaceTools place={place} onPlace={(p) => updateAttributes(p)} />
          {isFig && <span className="muted rich-pic-src">live: {source ? nodeDisplayName(source) : 'node removed'}</span>}
        </div>
      )}
      {isFig ? (
        fig ? (
          <FigureSvg fig={fig} display={{ width: 600, height: (600 * H) / W }} idPrefix={`nf${prefix}`} />
        ) : (
          <div className="rich-pic-missing">{source ? 'The figure of this node is not ready (or it has none).' : 'The node of this figure was removed.'}</div>
        )
      ) : (
        <img src={String(node.attrs.src ?? '')} alt={String(node.attrs.alt ?? caption)} draggable={false} />
      )}
      <div className="rich-caption" contentEditable={false}>
        <b>Figure {k}.</b>{' '}
        <input className="nodrag" value={caption} placeholder="Caption" readOnly={!editor.isEditable} onChange={(e) => updateAttributes({ caption: e.target.value })} />
      </div>
      {editor.isEditable && <Resizer target={box} onWidth={(width) => updateAttributes({ width })} />}
    </NodeViewWrapper>
  );
}


// a text box: its paragraphs in its frame, a grip to move it, a corner to drag its width
export function BoxView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <NodeViewWrapper ref={box} className={`rich-box rich-placed${selected ? ' selected' : ''}`} style={boxCss(node.attrs) as CSSProperties} data-text-box="">
      {editor.isEditable && <Grip />}
      <NodeViewContent className="rich-box-content" />
      {editor.isEditable && <Resizer target={box} onWidth={(width) => updateAttributes({ width })} />}
    </NodeViewWrapper>
  );
}
