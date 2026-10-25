// Ternary: the three parts and the groups, fractions or %, points / lines, the grid; every group its colour and own look
// (⚙); the figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { TernarySpec } from '../engine/ternary.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { SymbolFill } from '../figure/spec.ts';
import type { AppNode, PlotPage, TernaryData, TernaryNode } from '../types.ts';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';

export function TernaryNodeView({ id, data: d }: NodeProps<TernaryNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<TernaryData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const swatches = (fig?.axes[0]?.curves ?? []).filter((c) => c.key.startsWith('ter:'));
  return (
    <div className="node node-plot1d node-ternary">
      <InPort label="dataset" port="dataset" id="dataset" title="Three columns, the parts A, B and C of every row (and a column of groups)" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>A (top)</span>
          <Select value={d.a} options={[['', 'auto: the first column of numbers'], ...cols]} onChange={(a) => set({ a })} />
          <span>B (left)</span>
          <Select value={d.b} options={[['', 'auto: the next'], ...cols]} onChange={(b) => set({ b })} />
          <span>C (right)</span>
          <Select value={d.c} options={[['', 'auto: the next'], ...cols]} onChange={(c) => set({ c })} />
          <span>Groups</span>
          <Select value={d.group} options={[['', 'none'], ...cols]} onChange={(group) => set({ group })} />
          <span title="The points coloured by the values of a column (a colour map, its colour bar at the right), not by group">Colour by</span>
          <Select value={d.colorBy ?? ''} options={[['', 'the groups'], ...cols]} onChange={(colorBy) => set({ colorBy: colorBy || undefined })} />
        </div>
      </details>
      <details open>
        <summary>Ternary</summary>
        <div className="col-form">
          <span>Draw</span>
          <span className="row wrap">
            <Select<TernarySpec['mode']>
              value={d.mode}
              options={[
                ['scatter', 'symbols'],
                ['linesymbol', 'lines and symbols'],
                ['line', 'lines'],
              ]}
              onChange={(mode) => set({ mode })}
            />
            <Select<TernarySpec['scale']> seg
              value={d.scale}
              title="Every row divided by its sum: fractions (0 – 1) or percents"
              options={[
                ['fraction', 'fractions'],
                ['percent', 'percents'],
              ]}
              onChange={(scale) => set({ scale })}
            />
          </span>
          <span>Grid</span>
          <span className="row wrap">
            <Field label="Every" title="A fraction: 0.1, 0.2, 0.25 …">
              <NumInput className="tiny" min={0.01} max={0.5} step={0.05} value={d.step} onChange={(step) => set({ step: Math.min(0.5, Math.max(0.01, step || 0.1)) })} />
            </Field>
            <input className="nodrag color" type="color" value={d.gridColor || '#c8c8c8'} onChange={(e) => set({ gridColor: e.target.value })} />
          </span>
          <span title="For every group (⚙ beside a colour: that group's own)">Look</span>
          <span className="row wrap">
            <Select value={d.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
            <Field label="Size">
              <NumInput className="tiny" min={0.5} step={0.5} value={d.symbolSize} onChange={(symbolSize) => set({ symbolSize: Math.max(0.5, symbolSize || 4) })} />
            </Field>
            <Select<SymbolFill> seg
              value={d.symbolFill}
              options={[
                ['filled', 'filled'],
                ['open', 'open'],
                ['white', 'white'],
              ]}
              onChange={(symbolFill) => set({ symbolFill })}
            />
            <Field label="Line">
              <NumInput className="tiny" min={0.25} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.25, lineWidth || 1.2) })} />
            </Field>
          </span>
          <span>Colours</span>
          <span className="row wrap">
            {d.colorBy ? (
              <>
                <Select value={d.cmap ?? 'viridis'} options={CMAP_OPTIONS.filter(([k]) => k !== 'custom')} onChange={(cmap) => set({ cmap })} />
                <Check label="Reversed" value={!!d.cmapReverse} onChange={(cmapReverse) => set({ cmapReverse: cmapReverse || undefined })} />
              </>
            ) : (
              <ColorSwatches swatches={swatches} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
            )}
          </span>
          <LookPanel swatches={swatches} looks={d.looks} fields={['points', 'style']} open={lookOf} onChange={(looks) => set({ looks })} />
        </div>
      </details>
      </NodeOptions>
      {fig && <FigureView fig={fig} width={600} page={page} setPage={(p) => set({ page: { ...page, ...p } })} layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move." />}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={r?.view.legendCurves ?? []} pos={fig?.axes[0]?.style.pos} port={false} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, or as an inset of a Plot" />
    </div>
  );
}
