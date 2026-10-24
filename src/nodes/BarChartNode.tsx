// Bar chart: the data (a table, or raw values by group), the arrangement, the look of the bars, their errors and values
// written; the figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { WATERFALL_COLORS, type BarErr, type BarSpec, type BarStat } from '../engine/barchart.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, BarChartData, BarChartNode, PlotPage } from '../types.ts';
import { BarLookControls } from './BarLookControls.tsx';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { SignificanceControls } from './SignificanceControls.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { TextStyleControls } from './fields.tsx';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { xAutoLabel, Y_AUTO } from './xAuto.ts';

export function BarChartNodeView({ id, data: d }: NodeProps<BarChartNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<BarChartData>) => updateNodeData(id, p);
  const avail = r?.view.available;
  const names = (avail ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  // the coloured things: the series (or segments), or the categories
  // every coloured thing, in the legend or not (from the figure's curves): the series, or the categories
  const drawn = r?.view.figure?.axes[0]?.curves ?? [];
  const swatches = drawn.filter((c) => (d.arrange === 'waterfall' ? /^wf:\d$/.test(c.key) : c.key.startsWith(d.colorBy === 'category' ? 'cat:' : 'bar:')));
  const raw = d.mode === 'raw';
  return (
    <div className="node node-plot1d node-barchart">
      <InPort label="dataset" port="dataset" id="dataset" title="A table (categories and value columns), or raw values with the column of their groups" />
      <InPort label="overlay" port="dataset" id="overlay" title="Optional: curves drawn over the bars; every Y of a dataset with its X (names: at the bars of those categories) as lines and symbols; on a second axis if asked (Options ▸ Overlay)" />
      <InPort label="p values" port="dataset" id="pvalues" title="Significance ▸ from the p values port: a post hoc table (an ANOVA / Nonparametric node's: pair, p (adjusted)), or two columns of group names and a p" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>The data</span>
          <Select<BarSpec['mode']>
            value={d.mode}
            options={[
              ['table', 'a table: categories and values'],
              ['raw', 'raw values by group (a statistic each)'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          {!raw ? (
            <>
              <span>Categories</span>
              <Select value={d.cat} options={[['', xAutoLabel(avail)], ['-', 'row number'], ...cols]} onChange={(cat) => set({ cat })} />
              <span>Values</span>
              <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="The value columns, each a series of bars (a list: 2, B-D, names, A*)" onChange={(ys) => set({ ys })} />
              <span>± errors</span>
              <ColumnsPicker value={d.errs} names={names} auto="auto: the designated ±Y" title="Their errors, in the same order (a list)" onChange={(errs) => set({ errs })} />
            </>
          ) : (
            <>
              <span>Values</span>
              <Select value={d.value} options={[['', 'auto: the first Y'], ...cols]} onChange={(value) => set({ value })} />
              <span>Groups</span>
              <Select value={d.group} options={[['', 'auto: the first column of text'], ...cols]} onChange={(group) => set({ group })} />
              <span>Subgroups</span>
              <Select value={d.sub} options={[['', 'none'], ...cols]} onChange={(sub) => set({ sub })} />
              <span>Bar, error</span>
              <span className="row wrap">
                <Select<BarStat>
                  value={d.stat}
                  options={[
                    ['mean', 'mean'],
                    ['median', 'median'],
                    ['sum', 'sum'],
                    ['count', 'count'],
                  ]}
                  onChange={(stat) => set({ stat })}
                />
                <Select<BarErr>
                  value={d.err}
                  options={[
                    ['none', 'no error'],
                    ['sd', '± SD'],
                    ['se', '± SE of the mean'],
                    ['ci95', '± 95 % CI of the mean'],
                    ['minmax', 'min – max'],
                    ['q1q3', 'Q1 – Q3'],
                  ]}
                  onChange={(err) => set({ err })}
                />
                <Check label="The values over the bars" value={d.points} onChange={(points) => set({ points })} />
              </span>
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>Bars</summary>
        <div className="col-form">
          <span>Arrangement</span>
          <span className="row wrap">
            <Select<BarSpec['arrange']>
              value={d.arrange}
              options={[
                ['grouped', 'grouped (side by side)'],
                ['stacked', 'stacked'],
                ['percent', '100 % stacked'],
                ['overlap', 'overlapped'],
                ['floating', 'floating (from the first column to the next)'],
                ['waterfall', 'waterfall (bridge)'],
              ]}
              onChange={(arrange) => set({ arrange })}
            />
            <Check label="Horizontal" value={d.horizontal} onChange={(horizontal) => set({ horizontal })} />
            <Check label="Overlay on a second axis" value={!!d.overlayRight} onChange={(overlayRight) => set({ overlayRight: overlayRight || undefined })} />
            <Select<NonNullable<BarSpec['sort']>>
              value={d.sort ?? 'none'}
              title="The categories in the order of their value (stacked: their total), names only; numbers keep their places"
              options={[
                ['none', 'as in the data'],
                ['desc', 'sorted: largest first'],
                ['asc', 'sorted: smallest first'],
              ]}
              onChange={(sort) => set({ sort: sort === 'none' ? undefined : sort })}
            />
            {d.arrange === 'waterfall' && (
              <>
                <Check label="Total" title="A last bar with the total" value={d.wfTotal !== false} onChange={(wfTotal) => set({ wfTotal })} />
                <Check label="Connectors" title="Lines joining the steps" value={d.wfConnect !== false} onChange={(wfConnect) => set({ wfConnect })} />
              </>
            )}
          </span>
          <span>Width</span>
          <span className="row wrap">
            <Field label="Bars" title="The part of a category its bars take (0.1 – 1)">
              <NumInput className="tiny" min={0.1} max={1} step={0.05} value={d.width} onChange={(width) => set({ width: Math.min(1, Math.max(0.05, width || 0.8)) })} />
            </Field>
            {d.arrange === 'grouped' && (
              <Field label="Gap %" title="Between the bars of a group: the part of every bar's place left empty">
                <NumInput className="tiny" min={0} max={90} step={5} value={Math.round((d.gap || 0) * 100)} onChange={(g) => set({ gap: Math.min(0.9, Math.max(0, (g || 0) / 100)) })} />
              </Field>
            )}
            {(d.arrange === 'grouped' || d.arrange === 'overlap') && (
              <Field label="Base" title="The bars go from this value to theirs">
                <NumInput className="tiny" value={d.base} onChange={(base) => set({ base: Number.isFinite(base) ? base : 0 })} />
              </Field>
            )}
          </span>
          <span>Colours</span>
          <span className="row wrap">
            <Select<BarSpec['colorBy']>
              value={d.colorBy}
              options={[
                ['series', 'by series'],
                ['category', 'by category'],
              ]}
              onChange={(colorBy) => set({ colorBy })}
            />
            <ColorSwatches swatches={swatches} defaults={d.arrange === 'waterfall' ? WATERFALL_COLORS : undefined} colors={d.colors} colors2={d.colors2} onChange={set} looks={d.looks} open={lookOf} onOpen={setLookOf} />
          </span>
          <LookPanel swatches={swatches} looks={d.looks} fields={['opacity', 'edge', 'hatch', 'err']} open={lookOf} onChange={(looks) => set({ looks })} />
          <span>Look</span>
          <span className="row wrap">
            <Field label="Opacity">
              <NumInput className="tiny" min={0} max={1} step={0.1} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1)) })} />
            </Field>
            <Field label="Edge" title="The line around the bars: colour, width (pt; 0 = none)">
              <input className="nodrag color" type="color" value={d.edgeColor || '#000000'} onChange={(e) => set({ edgeColor: e.target.value })} />
              <NumInput className="tiny" min={0} step={0.25} value={d.edgeWidth} onChange={(edgeWidth) => set({ edgeWidth: Math.max(0, edgeWidth || 0) })} />
            </Field>
          </span>
          <BarLookControls value={d.barLook} onChange={(barLook) => set({ barLook })} />
          <span>Error bars</span>
          <span className="row wrap">
            <Select<BarSpec['errDir']>
              value={d.errDir}
              options={[
                ['both', '±'],
                ['plus', '+ only'],
              ]}
              onChange={(errDir) => set({ errDir })}
            />
            <Field label="Cap" title="The width of the caps, pt (0: none)">
              <NumInput className="tiny" min={0} step={1} value={d.errCap} onChange={(errCap) => set({ errCap: Math.max(0, errCap || 0) })} />
            </Field>
            <Field label="Line" title="pt">
              <NumInput className="tiny" min={0.1} step={0.25} value={d.errWidth} onChange={(errWidth) => set({ errWidth: Math.max(0.1, errWidth || 0.75) })} />
            </Field>
          </span>
          <span>Values written</span>
          <span className="row wrap">
            <Select<BarSpec['labels']>
              value={d.labels}
              options={[
                ['none', 'none'],
                ['top', 'beyond the end'],
                ['inside', 'inside the end'],
                ['center', 'in the middle'],
              ]}
              onChange={(labels) => set({ labels })}
            />
            {d.labels !== 'none' && (
              <>
                <Field label="Decimals" title="Empty: automatic">
                  <NumInput className="tiny" min={0} max={10} step={1} value={d.decimals} placeholder="auto" onChange={(decimals) => set({ decimals })} />
                </Field>
                <Field label="Hide below %" title="Values smaller than this % (of the category's total when stacked, else of the largest) are not written">
                  <NumInput className="tiny" min={0} max={100} step={1} value={d.hideBelow} onChange={(hideBelow) => set({ hideBelow: Math.max(0, hideBelow || 0) })} />
                </Field>
              </>
            )}
          </span>
        </div>
        {d.labels !== 'none' && <TextStyleControls label="Text of the values" value={d.labelStyle} onChange={(labelStyle) => set({ labelStyle })} />}
      </details>
      <details open={!!d.sig?.on}>
        <summary>Significance</summary>
        <SignificanceControls value={d.sig} groups={r?.view.groupNames ?? []} subgroups={(r?.view.groupNames ?? []).some((g) => g.includes(' / '))} onChange={(sig) => set({ sig })} />
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
      <OutPort label="values" port="dataset" id="values" title="What the bars show: category, series, value, its errors (and N for raw values)" />
      {d.sig?.on && <OutPort label="significance" port="dataset" id="significance" title="Every bracket: the pair, its p, what is written" />}
    </div>
  );
}
