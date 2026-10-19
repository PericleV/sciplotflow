// Quick edits of a Figure Drawing: the object clicked on the node's figure (without opening the editor), its settings in
// the node's options panel — its look, its layer over the figure under the drawing, a copy, its removal.
import { Copy, Pencil, Trash, X } from 'lucide-react';
import { shapeSpec } from '../engine/evaluate.ts';
import { TEXT_SPEC_DEFAULTS } from '../figure/spec.ts';
import type { AnnotationItem } from '../types.ts';
import { describe } from './annotationNames.ts';
import { ShapeEditor, TextEditor } from './AnnotationsEditor.tsx';
import { moveItem, newId } from './drawingOps.ts';
import { IC } from './iconProps.ts';
import { Field, Select } from './ui.tsx';

export function DrawingQuick({ items, id, setItems, onClose, onEdit, over }: { items: AnnotationItem[]; id: string; setItems: (l: AnnotationItem[]) => void; onClose: () => void; onEdit: () => void; over: boolean }) {
  const it = items.find((x) => x.id === id);
  if (!it) return null;
  const setSpec = (p: object) => setItems(items.map((x) => (x.id === id ? ({ ...x, spec: { ...x.spec, ...p } } as AnnotationItem) : x)));
  const kind = it.type === 'shape' ? shapeSpec(it.spec).kind : it.type;
  return (
    <div className="drawing-quick">
      <div className="row">
        <b className="grow ellipsis" title="The object clicked on the figure">
          {it.name || describe(it)}
        </b>
        <button className="nodrag ts-btn de-ico" title="Open it in the editor" onClick={onEdit}>
          <Pencil {...IC} />
        </button>
        <button
          className="nodrag ts-btn de-ico"
          title="A copy of it, a little aside"
          onClick={() => {
            const copy = moveItem({ ...structuredClone(it), id: newId() }, 2, 2);
            setItems([...items, copy]);
          }}
        >
          <Copy {...IC} />
        </button>
        <button
          className="nodrag ts-btn de-ico"
          title="Remove it"
          onClick={() => {
            setItems(items.filter((x) => x.id !== id));
            onClose();
          }}
        >
          <Trash {...IC} />
        </button>
        <button className="nodrag ts-btn de-ico" title="Close (the page's settings)" onClick={onClose}>
          <X {...IC} />
        </button>
      </div>
      {over && (
        <Field label="Layer" title="Over the figure under the drawing: in front of everything, or behind its data (under its curves)">
          <Select<'front' | 'behind'>
            value={it.behind ? 'behind' : 'front'}
            options={[
              ['front', 'in front of the data'],
              ['behind', 'behind the data'],
            ]}
            onChange={(v) => setItems(items.map((x) => (x.id === id ? { ...x, behind: v === 'behind' || undefined } : x)))}
          />
        </Field>
      )}
      {it.type === 'shape' && kind !== 'component' && <ShapeEditor s={{ ...shapeSpec(it.spec), coords: 'data' }} where="drawing" set={setSpec} />}
      {it.type === 'text' && <TextEditor s={{ ...TEXT_SPEC_DEFAULTS, ...it.spec, coords: 'data' }} where="drawing" set={setSpec} />}
      {kind === 'component' && <div className="hint">An instance of a component: change it in the editor.</div>}
    </div>
  );
}
