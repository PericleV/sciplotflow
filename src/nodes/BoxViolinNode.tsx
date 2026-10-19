// Box & violin: the groups (a column each, or raw values by group), what is drawn (boxes, violins, both, half violins,
// raincloud), the whiskers, notch, mean, outliers, the violin's density and width, the values over them, the look; the
// figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { BoxSpec, Whisker } from '../engine/boxviolin.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, BoxViolinData, BoxViolinNode, PlotPage } from '../types.ts';
import { BarLookControls } from './BarLookControls.tsx';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { SignificanceControls } from './SignificanceControls.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { Y_AUTO } from './xAuto.ts';

export function BoxViolinNodeView({ id, data: d }: NodeProps<BoxViolinNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<BoxViolinData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const raw = d.mode === 'raw';
  const violin = d.kind !== 'box';
  const hasBox = d.kind !== 'violin' || d.inner === 'box';
  // the coloured things: the subgroups (or the categories)
  // every coloured thing, in the legend or not (from the figure's curves): the subgroups, or the groups
  const drawn = r?.view.figure?.axes[0]?.curves ?? [];
  const swatches = drawn.filter((c) => c.key.startsWith(d.colorBy === 'category' ? 'cat:' : 'box:'));
  return (
    <div className="node node-plot1d node-boxviolin">
      <InPort label="dataset" port="dataset" id="dataset" title="A column per group, or raw values with the column of their groups (and subgroups)" />
      <InPort label="p values" port="dataset" id="pvalues" title="Significance ▸ from the p values port: a post hoc table (an ANOVA / Nonparametric node's: pair, p (adjusted)), or two columns of group names and a p" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>The data</span>
          <Select<BoxSpec['mode']>
            value={d.mode}
            options={[
              ['table', 'a column per group'],
              ['raw', 'values with their groups'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          {!raw ? (
            <>
              <span>Groups</span>
              <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="The columns, each a group (a list: 2, B-D, names, A*)" onChange={(ys) => set({ ys })} />
            </>
          ) : (
            <>
              <span>Values</span>
              <Select value={d.value} options={[['', 'auto: the first Y'], ...cols]} onChange={(value) => set({ value })} />
              <span>Groups</span>
              <Select value={d.group} options={[['', 'auto: the first column of text'], ...cols]} onChange={(group) => set({ group })} />
              <span>Subgroups</span>
              <Select value={d.sub} options={[['', 'none'], ...cols]} onChange={(sub) => set({ sub })} />
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>Boxes and violins</summary>
        <div className="col-form">
          <span>Draw</span>
          <span className="row wrap">
            <Select<BoxSpec['kind']>
              value={d.kind}
              options={[
                ['box', 'boxes'],
                ['violin', 'violins'],
                ['both', 'violins with a box inside'],
                ['half', 'half violins and boxes'],
                ['raincloud', 'raincloud (half violin, box, points)'],
              ]}
              onChange={(kind) => set({ kind, ...(kind === 'raincloud' && d.points === 'none' ? { points: 'jitter' as const } : {}) })}
            />
            <Check label="Horizontal" value={d.horizontal} onChange={(horizontal) => set({ horizontal })} />
            <Check label="n under each" title="“n = …” written under every box: its number of values" value={!!d.showN} onChange={(showN) => set({ showN: showN || undefined })} />
          </span>
          {hasBox && (
            <>
              <span>Whiskers</span>
              <span className="row wrap">
                <Select<Whisker>
                  value={d.whisker}
                  options={[
                    ['iqr', 'within k·IQR (Tukey)'],
                    ['p5', 'percentiles 5 – 95'],
                    ['p10', 'percentiles 10 – 90'],
                    ['minmax', 'min – max'],
                    ['sd', 'mean ± SD'],
                  ]}
                  onChange={(whisker) => set({ whisker })}
                />
                {d.whisker === 'iqr' && (
                  <Field label="k">
                    <NumInput className="tiny" min={0} step={0.5} value={d.k} onChange={(k) => set({ k: Math.max(0, Number.isFinite(k) ? k : 1.5) })} />
                  </Field>
                )}
                <Check label="Notch" title="The 95 % interval of the median: median ± 1.57·IQR/√n" value={d.notch} onChange={(notch) => set({ notch })} />
                <Check label="Mean" value={d.mean} onChange={(mean) => set({ mean })} />
                <Check label="Outliers" title="The values beyond the whiskers" value={d.outliers} onChange={(outliers) => set({ outliers })} />
              </span>
            </>
          )}
          {violin && (
            <>
              <span>Violin</span>
              <span className="row wrap">
                <Select<BoxSpec['bandwidth']>
                  value={d.bandwidth}
                  title="The width of the Gaussian kernel"
                  options={[
                    ['scott', 'Scott'],
                    ['silverman', 'Silverman'],
                    ['value', 'a width'],
                  ]}
                  onChange={(bandwidth) => set({ bandwidth })}
                />
                {d.bandwidth === 'value' && <NumInput className="tiny" min={0} value={d.bw} onChange={(bw) => set({ bw })} />}
                <Select<BoxSpec['cut']>
                  value={d.cut}
                  options={[
                    ['data', 'from min to max'],
                    ['extend', 'past them (2 widths)'],
                  ]}
                  onChange={(cut) => set({ cut })}
                />
                <Select<BoxSpec['scale']>
                  value={d.scale}
                  title="Width: every violin as wide; area: one scale for all; count: by the number of values"
                  options={[
                    ['width', 'same width'],
                    ['area', 'same scale (area)'],
                    ['count', 'by the count'],
                  ]}
                  onChange={(scale) => set({ scale })}
                />
                {d.kind === 'violin' && (
                  <Select<BoxSpec['inner']>
                    value={d.inner}
                    options={[
                      ['box', 'a box inside'],
                      ['quartiles', 'quartile lines'],
                      ['none', 'nothing inside'],
                    ]}
                    onChange={(inner) => set({ inner })}
                  />
                )}
                {raw && d.sub && <Check label="Split (2 subgroups)" title="Two subgroups: a half violin each, side by side" value={d.split} onChange={(split) => set({ split })} />}
              </span>
            </>
          )}
          <span>Points</span>
          <Select<BoxSpec['points']>
            value={d.points}
            options={[
              ['none', 'none'],
              ['jitter', 'every value, spread (jitter)'],
              ['swarm', 'every value, side by side (swarm)'],
            ]}
            onChange={(points) => set({ points })}
          />
          <span>Width</span>
          <span className="row wrap">
            <Field label="Boxes" title="The part of a group its boxes take (0.1 – 1)">
              <NumInput className="tiny" min={0.1} max={1} step={0.05} value={d.width} onChange={(width) => set({ width: Math.min(1, Math.max(0.1, width || 0.6)) })} />
            </Field>
            <Field label="Gap %" title="Between subgroups: the part of each place left empty">
              <NumInput className="tiny" min={0} max={90} step={5} value={Math.round((d.gap || 0) * 100)} onChange={(g) => set({ gap: Math.min(0.9, Math.max(0, (g || 0) / 100)) })} />
            </Field>
          </span>
          <span>Colours</span>
          <span className="row wrap">
            <Select<BoxSpec['colorBy']>
              value={d.colorBy}
              options={[
                ['series', 'by subgroup'],
                ['category', 'by group'],
              ]}
              onChange={(colorBy) => set({ colorBy })}
            />
            <ColorSwatches swatches={swatches} colors={d.colors} colors2={d.colors2} onChange={set} looks={d.looks} open={lookOf} onOpen={setLookOf} />
          </span>
          <LookPanel swatches={swatches} looks={d.looks} fields={['opacity', 'edge', 'hatch', 'median']} open={lookOf} onChange={(looks) => set({ looks })} />
          <span>Look</span>
          <span className="row wrap">
            <Field label="Opacity">
              <NumInput className="tiny" min={0} max={1} step={0.1} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 0.8)) })} />
            </Field>
            <Field label="Edge" title="Colour, width (pt)">
              <input className="nodrag color" type="color" value={d.edgeColor || '#000000'} onChange={(e) => set({ edgeColor: e.target.value })} />
              <NumInput className="tiny" min={0} step={0.25} value={d.edgeWidth} onChange={(edgeWidth) => set({ edgeWidth: Math.max(0, edgeWidth || 0) })} />
            </Field>
            <Field label="Median" title="Colour, width (pt)">
              <input className="nodrag color" type="color" value={d.medianColor || '#000000'} onChange={(e) => set({ medianColor: e.target.value })} />
              <NumInput className="tiny" min={0.25} step={0.25} value={d.medianWidth} onChange={(medianWidth) => set({ medianWidth: Math.max(0.25, medianWidth || 1.2) })} />
            </Field>
          </span>
          <BarLookControls value={d.barLook} onChange={(barLook) => set({ barLook })} />
        </div>
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
      <OutPort label="stats" port="dataset" id="stats" title="Every group: N, mean, SD, min, Q1, median, Q3, max, the whiskers' ends, the notch, the outliers" />
      {d.sig?.on && <OutPort label="significance" port="dataset" id="significance" title="Every bracket: the pair, its p, what is written" />}
    </div>
  );
}
