// Polar / radar: the data (θ and r columns, or categories as spokes and value columns), how the series are drawn; every
// series its colour and own look (⚙); the figure with the same tabs as a Plot, its Axes tab its own (where 0° is, the
// direction, the sector, r, the grid and its labels: PolarAxesEditor).
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { PolarSpec } from '../engine/polar.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { SymbolFill } from '../figure/spec.ts';
import type { AppNode, PlotPage, PolarData, PolarNode } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { PolarAxesEditor } from './PolarAxesEditor.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { Y_AUTO } from './xAuto.ts';

export function PolarNodeView({ id, data: d }: NodeProps<PolarNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<PolarData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const radar = d.kind === 'radar';
  const swatches = (r?.view.figure?.axes[0]?.curves ?? []).filter((c) => c.key.startsWith('pol:'));
  const symbols = d.mode === 'scatter' || d.mode === 'linesymbol';
  return (
    <div className="node node-plot1d node-polar">
      <InPort label="dataset" port="dataset" id="dataset" title="Polar: an angle column and r columns. Radar: categories (the spokes) and a value column per series" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>Kind</span>
          <Select<PolarSpec['kind']>
            value={d.kind}
            options={[
              ['polar', 'polar: θ and r'],
              ['radar', 'radar (spider): categories'],
            ]}
            onChange={(kind) => set({ kind, ...(kind === 'radar' && !d.fill ? { fill: true, mode: 'linesymbol' as const } : {}) })}
          />
          {!radar ? (
            <>
              <span>θ</span>
              <span className="row wrap">
                <Select value={d.theta} options={[['', 'auto: the X designated'], ...cols]} onChange={(theta) => set({ theta })} />
                <Select<PolarSpec['unit']> seg
                  value={d.unit}
                  options={[
                    ['deg', 'degrees'],
                    ['rad', 'radians'],
                  ]}
                  onChange={(unit) => set({ unit })}
                />
              </span>
              <span>r</span>
              <ColumnsPicker value={d.rs} names={names} auto={Y_AUTO} title="A curve for every column (a list: 2, B-D, names, A*)" onChange={(rs) => set({ rs })} />
            </>
          ) : (
            <>
              <span>Spokes</span>
              <Select
                value={d.cat}
                options={[
                  ['', 'auto: the first column of text'],
                  ['-', 'the row number'],
                  ...cols,
                ]}
                onChange={(cat) => set({ cat })}
              />
              <span>Series</span>
              <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="A polygon for every column" onChange={(ys) => set({ ys })} />
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>{radar ? 'Radar' : 'Polar'}</summary>
        <div className="col-form">
          <span>Draw</span>
          <span className="row wrap">
            <Select<PolarSpec['mode']>
              value={d.mode}
              options={[
                ['line', 'lines'],
                ['linesymbol', 'lines and symbols'],
                ['scatter', 'symbols'],
                ...(radar ? [] : [['bars', 'bars (wind rose)'] as [PolarSpec['mode'], string]]),
              ]}
              onChange={(mode) => set({ mode })}
            />
            {d.mode !== 'bars' && <Check label="Filled" value={d.fill} onChange={(fill) => set({ fill })} />}
            {!radar && d.mode !== 'bars' && <Check label="Closed" title="The last point joined to the first" value={d.close} onChange={(close) => set({ close })} />}
            {d.mode === 'bars' && (
              <Field label="Width °" title="Every bar's width (empty: the step between the angles)">
                <NumInput className="tiny" min={0.1} step={1} value={d.barWidth} placeholder="auto" onChange={(barWidth) => set({ barWidth })} />
              </Field>
            )}
          </span>
          <span title="For every series (⚙ beside a colour: that series' own)">Look</span>
          <span className="row wrap">
            <Field label="Line">
              <NumInput className="tiny" min={0.25} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.25, lineWidth || 1.2) })} />
            </Field>
            {(d.fill || d.mode === 'bars') && (
              <Field label="Fill opacity">
                <NumInput className="tiny" min={0} max={1} step={0.05} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 0.25)) })} />
              </Field>
            )}
            {symbols && (
              <>
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
              </>
            )}
          </span>
          <span>Colours</span>
          <span className="row wrap">
            <ColorSwatches swatches={swatches} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
          </span>
          <LookPanel swatches={swatches} looks={d.looks} fields={['style', 'points', 'opacity']} open={lookOf} onChange={(looks) => set({ looks })} />
        </div>
      </details>
      </NodeOptions>
      {fig && <FigureView fig={fig} width={600} page={page} setPage={(p) => set({ page: { ...page, ...p } })} layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move." />}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={r?.view.legendCurves ?? []} pos={fig?.axes[0]?.style.pos} port={false} axesEditor={<PolarAxesEditor d={d} set={set} />} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, or as an inset of a Plot" />
    </div>
  );
}
