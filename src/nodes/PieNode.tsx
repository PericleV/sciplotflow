// Pie chart: the categories and their values (a table; or raw values by group); what is drawn — a pie, a doughnut or
// nested rings (a ring per value column), chosen at the top, with only the settings of that kind —, the order and the
// merged small slices, the labels, the centre, the look; every category its colour and its own look (⚙: opacity, edge,
// hatching, moved out); the figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { pieKind, type PieKind, type PieSpec } from '../engine/piechart.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, PieData, PieNode, PlotPage } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { Y_AUTO } from './xAuto.ts';

export function PieNodeView({ id, data: d }: NodeProps<PieNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<PieData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const raw = d.mode === 'raw';
  // the categories (in the legend's order: their colours are by category)
  const swatches = (r?.view.figure?.axes[0]?.curves ?? []).filter((c) => c.key.startsWith('cat:')).sort((a, b) => Number(a.key.slice(4)) - Number(b.key.slice(4)));
  const ids = swatches.map((c) => Number(c.key.slice(4)));
  const pct = (v: number) => Math.round((v || 0) * 100);
  // the kind drawn (chosen, or as an older project drew it); a new one: a hole when it needs one
  const kind: PieKind = d.kind ?? r?.view.pieKind ?? pieKind(d, 1);
  const setKind = (k: PieKind) => set({ kind: k, ...(k !== 'pie' && !(d.hole > 0) ? { hole: k === 'doughnut' ? 0.5 : 0.3 } : {}) });
  const KINDS: [PieKind, string, string][] = [
    ['pie', '● Pie', 'Slices of a disc: one value column'],
    ['doughnut', '◎ Doughnut', 'A pie with a hole (its size: Hole %); a total or a text can go in the middle'],
    ['rings', '⊚ Nested rings', raw ? 'A ring for every value column — with “categories and their values” (Data, above)' : 'A ring for every value column (Values, above; the first outside)'],
  ];
  return (
    <div className="node node-plot1d node-pie">
      <InPort label="dataset" port="dataset" id="dataset" title="Categories and their values (a value column per ring), or values with their groups" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>The data</span>
          <Select<PieSpec['mode']>
            value={d.mode}
            options={[
              ['table', 'categories and their values'],
              ['raw', 'values with their groups'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          {!raw ? (
            <>
              <span>Categories</span>
              <Select
                value={d.cat}
                options={[
                  ['', 'auto: the first column of text'],
                  ['-', 'the row number'],
                  ...cols,
                ]}
                onChange={(cat) => set({ cat })}
              />
              <span>Values</span>
              <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="A ring for every column (the first outside): a list 2, B-D, names, A*" onChange={(ys) => set({ ys })} />
            </>
          ) : (
            <>
              <span>Groups</span>
              <Select value={d.group} options={[['', 'auto: the first column of text'], ...cols]} onChange={(group) => set({ group })} />
              <span>Values</span>
              <span className="row wrap">
                <Select value={d.value} options={[['', 'none: count the rows'], ...cols]} onChange={(value) => set({ value })} />
                {d.value && (
                  <Select<PieSpec['stat']>
                    value={d.stat}
                    options={[
                      ['sum', 'sum'],
                      ['mean', 'mean'],
                      ['count', 'count'],
                    ]}
                    onChange={(stat) => set({ stat })}
                  />
                )}
              </span>
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>Pie</summary>
        <div className="col-form">
          <span>Kind</span>
          <span className="row wrap">
            {KINDS.map(([k, label, title]) => (
              <button key={k} className={`nodrag${kind === k ? ' on' : ''}`} title={title} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </span>
          {kind === 'rings' && (
            <>
              <span />
              <span className="hint">{raw ? 'Nested rings need a value column for each ring: Data ▸ categories and their values.' : 'A ring for every value column chosen in Values (the first outside).'}</span>
            </>
          )}
          <span>Shape</span>
          <span className="row wrap">
            {kind !== 'pie' && (
              <Field label="Hole %" title="The hole in the middle, % of the radius">
                <NumInput className="tiny" min={5} max={90} step={5} value={pct(d.hole)} onChange={(h) => set({ hole: Math.min(0.9, Math.max(0.05, (h || 0) / 100)) })} />
              </Field>
            )}
            <Field label="Size %" title="The radius, % of half the frame's smaller side (smaller leaves room for labels outside)">
              <NumInput className="tiny" min={10} max={100} step={5} value={d.size} onChange={(size) => set({ size: Math.min(100, Math.max(10, size || 80)) })} />
            </Field>
            <Field label="At %" title="The centre across the frame, % of its width (50: the middle; less leaves room for a legend at the right)">
              <NumInput className="tiny" min={0} max={100} step={5} value={d.at ?? 50} onChange={(at) => set({ at: Math.min(100, Math.max(0, Number.isFinite(at) ? at : 50)) })} />
            </Field>
            {kind === 'rings' && (
              <Field label="Rings apart %" title="The gap between the rings, % of the radius">
                <NumInput className="tiny" min={0} max={20} step={1} value={d.ringGap} onChange={(ringGap) => set({ ringGap: Math.min(20, Math.max(0, ringGap || 0)) })} />
              </Field>
            )}
          </span>
          <span>Order</span>
          <span className="row wrap">
            <Field label="Start °" title="Where the first slice starts: 90 = 12 o'clock, 0 = 3 o'clock">
              <NumInput className="tiny" step={15} value={d.start} onChange={(start) => set({ start: Number.isFinite(start) ? start : 90 })} />
            </Field>
            <Check label="Clockwise" value={d.clockwise} onChange={(clockwise) => set({ clockwise })} />
            <Select<PieSpec['sort']>
              value={d.sort}
              options={[
                ['none', 'as in the data'],
                ['desc', 'largest first'],
                ['asc', 'smallest first'],
              ]}
              onChange={(sort) => set({ sort })}
            />
            <Field label="Other below %" title="Slices smaller than this merged into one, “Other” (0: none)">
              <NumInput className="tiny" min={0} max={50} step={1} value={d.other} onChange={(other) => set({ other: Math.min(50, Math.max(0, other || 0)) })} />
            </Field>
          </span>
          <span>Labels</span>
          <span className="row wrap">
            <Select<PieSpec['labels']>
              value={d.labels}
              options={[
                ['none', 'none'],
                ['percent', 'percent'],
                ['value', 'value'],
                ['name', 'name'],
                ['namePercent', 'name and percent'],
                ['nameValue', 'name and value'],
                ['nameOutPercentIn', 'name outside, percent inside'],
              ]}
              onChange={(labels) => set({ labels })}
            />
            {d.labels !== 'none' && (
              <>
                <Select<PieSpec['labelPos']>
                  value={d.labelPos}
                  title="Automatic: outside, on a leader line, when the slice is small or the label long"
                  options={[
                    ['auto', 'automatic'],
                    ['inside', 'inside'],
                    ['outside', 'outside'],
                  ]}
                  onChange={(labelPos) => set({ labelPos })}
                />
                <Field label="Decimals">
                  <NumInput className="tiny" min={0} max={6} step={1} value={d.decimals} placeholder="auto" onChange={(decimals) => set({ decimals: Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : NaN })} />
                </Field>
                <Field label="Hide below %">
                  <NumInput className="tiny" min={0} max={50} step={1} value={d.hideBelow} onChange={(hideBelow) => set({ hideBelow: Math.max(0, hideBelow || 0) })} />
                </Field>
              </>
            )}
          </span>
          {kind !== 'pie' && (
            <>
              <span>Centre</span>
              <span className="row wrap">
                <Select<PieSpec['center']>
                  value={d.center}
                  title="In the hole"
                  options={[
                    ['none', 'nothing'],
                    ['total', 'the total'],
                    ['text', 'a text'],
                  ]}
                  onChange={(center) => set({ center })}
                />
                {d.center === 'text' && <TextInput value={d.centerText} placeholder="e.g. 2024" onChange={(centerText) => set({ centerText })} />}
              </span>
            </>
          )}
          <span>Look</span>
          <span className="row wrap">
            <Field label="Opacity">
              <NumInput className="tiny" min={0} max={1} step={0.1} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1)) })} />
            </Field>
            <Field label="Edge" title="Colour, width (pt; 0 = none)">
              <input className="nodrag color" type="color" value={d.edgeColor || '#ffffff'} onChange={(e) => set({ edgeColor: e.target.value })} />
              <NumInput className="tiny" min={0} step={0.25} value={d.edgeWidth} onChange={(edgeWidth) => set({ edgeWidth: Math.max(0, edgeWidth || 0) })} />
            </Field>
          </span>
          <span>Colours</span>
          <span className="row wrap">
            <ColorSwatches swatches={swatches} ids={ids} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
          </span>
          <LookPanel swatches={swatches} ids={ids} looks={d.looks} fields={['explode', 'opacity', 'edge', 'hatch']} open={lookOf} onChange={(looks) => set({ looks })} />
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
      <OutPort label="slices" port="dataset" id="slices" title="Every slice: (its ring,) its category, value, percent, from and to (degrees)" />
    </div>
  );
}
