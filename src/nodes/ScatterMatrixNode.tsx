// Scatter matrix: the columns and the groups, what the diagonal, the lower and the upper panels show, the points and the
// fitted lines, the gap between the panels; every group its colour and its own symbols (⚙); the figure (the Axes tab
// styles every panel, the Page tab sizes the whole matrix).
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { MatrixSpec } from '../engine/scattermatrix.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, PlotPage, ScatterMatrixData, ScatterMatrixNode } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { Y_AUTO } from './xAuto.ts';

const PANEL: [MatrixSpec['lower'], string][] = [
  ['scatter', 'the points'],
  ['corr', 'the correlation'],
  ['none', 'nothing'],
];

export function ScatterMatrixNodeView({ id, data: d }: NodeProps<ScatterMatrixNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<ScatterMatrixData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const swatches = r?.view.legendCurves ?? [];
  return (
    <div className="node node-plot1d node-scattermatrix">
      <InPort label="dataset" port="dataset" id="dataset" title="The columns to compare, and optionally a column of groups for the colours" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>Columns</span>
          <ColumnsPicker value={d.cols} names={names} auto={Y_AUTO} title="Every pair of them (2 to 10; a list: 2, B-D, names, A*)" onChange={(c) => set({ cols: c })} />
          <span>Groups</span>
          <Select value={d.group} title="A column whose values colour the points" options={[['', 'none'], ...cols]} onChange={(group) => set({ group })} />
        </div>
      </details>
      <details open>
        <summary>Scatter matrix</summary>
        <div className="col-form">
          <span>Diagonal</span>
          <Select<MatrixSpec['diag']>
            value={d.diag}
            options={[
              ['hist', 'a histogram'],
              ['kde', 'a kernel density'],
              ['name', 'the name'],
              ['none', 'nothing'],
            ]}
            onChange={(diag) => set({ diag })}
          />
          <span>Below</span>
          <Select<MatrixSpec['lower']> value={d.lower} options={PANEL} onChange={(lower) => set({ lower })} />
          <span>Above</span>
          <Select<MatrixSpec['upper']> value={d.upper} options={PANEL} onChange={(upper) => set({ upper })} />
          <span>Correlation</span>
          <span className="row wrap">
            <Select<MatrixSpec['method']> seg
              value={d.method}
              title="Written in the correlation panels (with stars when p < 0.05) and in the corr output"
              options={[
                ['pearson', 'Pearson r'],
                ['spearman', 'Spearman ρ'],
              ]}
              onChange={(method) => set({ method })}
            />
            <Check label="Least-squares lines" value={d.fit} onChange={(fit) => set({ fit })} />
          </span>
          <span title="For every group (⚙ beside a colour: that group's own)">Points</span>
          <span className="row wrap">
            <Select value={d.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
            <Field label="Size">
              <NumInput className="tiny" min={0.5} step={0.5} value={d.symbolSize} onChange={(symbolSize) => set({ symbolSize: Math.max(0.5, symbolSize || 3) })} />
            </Field>
            <Field label="Opacity">
              <NumInput className="tiny" min={0.05} max={1} step={0.05} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0.05, opacity || 0.7)) })} />
            </Field>
            <Field label="Gap" title="Between the panels, in the page's unit">
              <NumInput className="tiny" min={0} step={0.5} value={d.gap} onChange={(gap) => set({ gap: Math.max(0, Number.isFinite(gap) ? gap : 2) })} />
            </Field>
          </span>
          {swatches.length > 0 && (
            <>
              <span>Colours</span>
              <span className="row wrap">
                <ColorSwatches swatches={swatches} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
              </span>
              <LookPanel swatches={swatches} looks={d.looks} fields={['points', 'opacity']} open={lookOf} onChange={(looks) => set({ looks })} />
            </>
          )}
        </div>
      </details>
      </NodeOptions>
      {fig && <FigureView fig={fig} width={600} page={page} setPage={(p) => set({ page: { ...page, ...p } })} layoutTitle="The panels are placed on a grid: the gap and the page size set them" />}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={swatches} pos={fig?.axes[0]?.style.pos} port={false} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole matrix: to a Merge, or as an inset of a Plot" />
      <OutPort label="corr" port="dataset" id="corr" title="Every pair: the two variables, r (or ρ), p, N" />
    </div>
  );
}
