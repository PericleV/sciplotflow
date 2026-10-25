// Figure Drawing: a vector drawing on its own page (a scheme, a set-up, a mechanism), drawn in its editor (✎ Edit
// drawing, or a double-click on the figure) and exported as a Plot is; its figure goes to a Merge or to a Plot's
// insets, scaled there as a whole. A figure connected under it (a Plot, a Merge): annotated — the drawing over it, on
// its page — or only a guide to draw by.
import { useState } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { DRAWING_GRID_DEFAULTS } from '../defaults.ts';
import type { AppNode, DrawingData, DrawingNode } from '../types.ts';
import { useFigureFocus } from './figureFocus.ts';
import { FigureView, PageControls } from './FigureView.tsx';
import { DrawingEditor } from './DrawingEditor.tsx';
import { DrawingQuick } from './DrawingQuick.tsx';
import { pageText } from '../engine/evaluate.ts';
import { PageTextContext } from '../ui/pageText.ts';
import { NodeOptions } from './NodeOptions.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { Pencil } from 'lucide-react';
import { IC } from './iconProps.ts';

export function DrawingNodeView({ id, data }: NodeProps<DrawingNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<DrawingData>) => updateNodeData(id, p);
  const fig = r?.view.figure;
  // the editor: open, with an object selected (the one double-clicked on the figure)
  const [editing, setEditing] = useState<{ first?: string } | null>(null);
  // the object clicked on the figure: its settings at the top of the options panel (quick edits)
  const [quick, setQuick] = useState<string | null>(null);
  useFigureFocus(id, (part) => setEditing({ ...(part.startsWith('ann:') ? { first: part.slice(4) } : {}) }));
  const n = data.annotations?.length ?? 0;
  const grid = { ...DRAWING_GRID_DEFAULTS, ...data.grid };
  const under = useNodeConnections({ handleType: 'target', handleId: 'under' }).length > 0;
  const size = fig ?? data;
  return (
    <div className="node node-drawing">
      <InPort label="figure" port="figure" id="under" title="A figure to annotate (a Plot's or a Merge's “figure” output): drawn under the drawing, its page the drawing's: or only a guide to draw by">
        {under && (
          <Select<'draw' | 'guide'>
            value={data.under ?? 'draw'}
            title="The figure under the drawing: drawn with it (the drawing annotates it), or only a guide while drawing (the drawing goes out alone, at the figure's size)"
            options={[
              ['draw', 'under the drawing'],
              ['guide', 'only a guide'],
            ]}
            onChange={(v) => set({ under: v === 'draw' ? undefined : v })}
          />
        )}
      </InPort>
      <div className="row">
        <button className="nodrag btn-run" title="Open the drawing in its editor (or double-click the figure)" onClick={() => setEditing({})}>
          <Pencil {...IC} /> Edit drawing
        </button>
        <span className="muted">
          {n} object{n === 1 ? '' : 's'} · {+size.width.toFixed(2)} × {+size.height.toFixed(2)} {size.unit}
        </span>
      </div>
      {fig && <FigureView fig={fig} width={600} page={data} setPage={(p) => set(p)} layoutTitle="" noAxes onPick={(node, part) => node === id && setQuick(part.startsWith('ann:') ? part.slice(4) : null)} />}
      <OutPort label="figure" port="figure" id="figure" title="The drawing as a figure: to a Merge (a panel of its own) or to a Plot's insets: scaled there as a whole" />
      <NodeOptions>
        {quick && (
          <PageTextContext.Provider value={pageText(data)}>
            <DrawingQuick items={data.annotations ?? []} id={quick} setItems={(annotations) => set({ annotations })} onClose={() => setQuick(null)} onEdit={() => setEditing({ first: quick })} over={under && data.under !== 'guide'} />
          </PageTextContext.Provider>
        )}
        <div className="row">
          <button className="nodrag btn-run" title="Open the drawing in its editor" onClick={() => setEditing({})}>
            <Pencil {...IC} /> Edit drawing
          </button>
        </div>
        <PageControls page={data} set={(p) => set(p)} fixed={under && fig ? `Size: ${fig.width} × ${fig.height} ${fig.unit}; the figure under the drawing's.` : undefined} />
        <Field label="Grid" title="The editor's grid: its step, shown, objects snapped to it">
          <span className="row wrap">
            <NumInput className="tiny" min={0.01} step={0.5} value={grid.step} onChange={(v) => set({ grid: { ...grid, step: v > 0 ? v : 1 } })} />
            <Select<'mm' | 'pt'> seg
              value={grid.unit}
              options={[
                ['mm', 'mm'],
                ['pt', 'pt'],
              ]}
              onChange={(unit) => set({ grid: { ...grid, unit } })}
            />
            <Check label="shown" value={grid.show} onChange={(show) => set({ grid: { ...grid, show } })} />
            <Check label="snap" value={grid.snap} onChange={(snap) => set({ grid: { ...grid, snap } })} />
          </span>
        </Field>
        <Messages result={r} />
      </NodeOptions>
      <Messages result={r} />
      {editing && <DrawingEditor id={id} data={data} fig={fig} under={r?.view.under} pinShift={r?.view.pinShift} first={editing.first} onClose={() => setEditing(null)} />}
    </div>
  );
}
