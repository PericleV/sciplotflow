// Waterfall: the curves (X, the Y columns) and their swept value Z, the steps between them, which is in front, the
// fill that hides the curves behind (or colours them), the colours (each its own or a colour map with its bar), the
// lines and symbols, the baselines, Z written at every curve; every curve its own look (⚙); the figure with the same tabs
// as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { WaterfallSpec } from '../engine/waterfall.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import type { ColorMapName, Dash, SymbolFill } from '../figure/spec.ts';
import type { AppNode, PlotPage, WaterfallData, WaterfallNode } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { OptColor } from './fields.tsx';
import { DASHES, SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { xAutoLabel, Y_AUTO } from './xAuto.ts';

export function WaterfallNodeView({ id, data: d }: NodeProps<WaterfallNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<WaterfallData>) => updateNodeData(id, p);
  const spacing = d.spacing ?? 'even';
  const stepTitle =
    spacing === 'list'
      ? 'A shift for every curve, in its order (the units chosen)'
      : spacing === 'auto'
        ? 'Gap: the room left between a curve and the highest point of those in front of it (Y); X: every curve shifted by this step'
        : spacing === 'height'
          ? 'Y: every curve above the one in front of it by this % of that curve’s height; X: the step'
          : spacing === 'z'
            ? 'The step between curves on average: the whole spread as with even steps, each curve placed by its Z'
            : 'Each curve shifted from the one before it';
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  // the curves in the order of the data (drawn from the back): a colour and a look each
  const swatches = (fig?.axes[0]?.curves ?? []).filter((c) => /^wf:\d+$/.test(c.key)).sort((a, b) => Number(a.key.slice(3)) - Number(b.key.slice(3)));
  const ids = swatches.map((c) => Number(c.key.slice(3)));
  const shown: string[] = [];
  swatches.forEach((c, k) => (shown[ids[k]] = c.style.color));
  const mapped = d.colorMap !== 'own';
  return (
    <div className="node node-plot1d node-waterfall">
      <InPort label="dataset" port="dataset" id="dataset" title="X and the Y columns of a sweep, a curve each (Split into columns cuts a sweep saved in one table; each column then knows its swept value)" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>X</span>
          <Select value={d.x} options={[['', xAutoLabel(r?.view.available)], ...cols]} onChange={(x) => set({ x })} />
          <span>Y columns</span>
          <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="A curve for every column (a list: 2, B-D, names, A*)" onChange={(ys) => set({ ys })} />
          <span title="The value each curve was measured at: its colour on the map, its label">Z of each</span>
          <span className="row wrap">
            <Select<WaterfallSpec['z']>
              value={d.z}
              options={[
                ['auto', 'auto: blocks, names, order'],
                ['key', 'the blocks’ value (Split)'],
                ['name', 'the number in the names'],
                ['order', '1, 2, 3 …'],
              ]}
              onChange={(z) => set({ z })}
            />
            <TextInput value={d.zTitle} placeholder="its name: auto" title="The name of Z (the colour bar's title)" onChange={(zTitle) => set({ zTitle })} />
          </span>
        </div>
      </details>
      <details open>
        <summary>Waterfall</summary>
        <div className="col-form">
          <span title="How the curves are spaced: even steps; in proportion to their Z (real thicknesses, temperatures …); a shift written for every curve; automatic: each one just above all those in front of it, plus a gap; or a part of the height of the curve in front">Spacing</span>
          <Select<NonNullable<WaterfallSpec['spacing']>>
            value={spacing}
            options={[
              ['even', 'even steps'],
              ['z', 'in proportion to Z'],
              ['list', 'a shift for every curve'],
              ['auto', 'automatic: no touching, a gap'],
              ['height', '% of the height of the curve in front'],
            ]}
            onChange={(sp) => set({ spacing: sp })}
          />
          <span title={stepTitle}>{spacing === 'list' ? 'Shifts' : spacing === 'auto' ? 'Gap, X step' : spacing === 'height' ? 'Y %, X step' : 'Step'}</span>
          <span className="row wrap">
            {spacing === 'list' ? (
              <>
                <Field label="X" title="The X shift of every curve, in its order: 0, 2, 4 … (empty: the X step)">
                  <TextInput className="short-text" value={d.offsetsX ?? ''} placeholder="0, 2, 4 …" onChange={(offsetsX) => set({ offsetsX })} />
                </Field>
                <Field label="Y" title="The Y shift of every curve, in its order: 0, 0.1, 0.3 … (past the list the last step goes on)">
                  <TextInput className="short-text" value={d.offsetsY ?? ''} placeholder="0, 10, 25 …" onChange={(offsetsY) => set({ offsetsY })} />
                </Field>
              </>
            ) : (
              <>
                <Field label="X">
                  <NumInput className="tiny" step={1} value={d.dx} onChange={(dx) => set({ dx: Number.isFinite(dx) ? dx : 0 })} />
                </Field>
                <Field label={spacing === 'auto' ? 'gap' : spacing === 'height' ? 'Y %' : 'Y'}>
                  <NumInput className="tiny" step={1} value={d.dy} onChange={(dy) => set({ dy: Number.isFinite(dy) ? dy : 0 })} />
                </Field>
              </>
            )}
            <Select<WaterfallSpec['units']>
              value={d.units}
              options={[
                ['percent', '% of the data range'],
                ['data', 'in data units'],
              ]}
              onChange={(units) => set({ units })}
            />
          </span>
          <span>In front</span>
          <span className="row wrap">
            <Select<WaterfallSpec['front']>
              value={d.front}
              title="The curve in front is the lowest; the others go up and back"
              options={[
                ['first', 'the first curve'],
                ['last', 'the last curve'],
              ]}
              onChange={(front) => set({ front })}
            />
            <Select<WaterfallSpec['normalize']>
              value={d.normalize}
              title="Every curve divided by its largest value first (curves of very different heights)"
              options={[
                ['none', 'as measured'],
                ['max', 'each to its maximum (1)'],
              ]}
              onChange={(normalize) => set({ normalize })}
            />
          </span>
          <span title="Under every curve, down to its baseline">Fill</span>
          <span className="row wrap">
            <Select<WaterfallSpec['fill']>
              value={d.fill}
              options={[
                ['hide', 'hide the curves behind'],
                ['color', 'the curve’s colour'],
                ['none', 'none (see through)'],
              ]}
              onChange={(fill) => set({ fill })}
            />
            {d.fill !== 'none' && <OptColor value={d.fillColor} none={d.fill === 'hide' ? 'page' : 'curve'} title={d.fill === 'hide' ? 'The colour that hides the curves behind (none: the page’s background)' : 'The fill colour (none: each curve’s)'} onChange={(fillColor) => set({ fillColor })} />}
            {d.fill === 'color' && (
              <Field label="Opacity">
                <NumInput className="tiny" min={0} max={1} step={0.05} value={d.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.35)) })} />
              </Field>
            )}
          </span>
          <span>Baselines</span>
          <span className="row wrap">
            <Check label="Shown" title="Every curve's zero as a thin line" value={d.baselines} onChange={(baselines) => set({ baselines })} />
            {d.baselines && <OptColor value={d.baselineColor} none="grey" onChange={(baselineColor) => set({ baselineColor })} />}
          </span>
        </div>
      </details>
      <details open>
        <summary>Look</summary>
        <div className="col-form">
          <span>Colours</span>
          <span className="row wrap">
            <Select<'own' | ColorMapName> value={d.colorMap} options={[['own', 'each its own'], ...CMAP_OPTIONS.map(([k, l]): ['own' | ColorMapName, string] => [k, `by Z: ${l}`])]} onChange={(colorMap) => set({ colorMap })} />
            {d.colorMap === 'custom' &&
              [0, 1, 2].map((k) => <input key={k} className="nodrag color" type="color" value={d.cmapColors?.[k] || ['#2166ac', '#f7f7f7', '#b2182b'][k]} onChange={(e) => set({ cmapColors: Object.assign([...(d.cmapColors ?? ['#2166ac', '#f7f7f7', '#b2182b'])], { [k]: e.target.value }) })} />)}
            {mapped && <Check label="Reversed" value={d.reverse} onChange={(reverse) => set({ reverse })} />}
            {mapped && <Check label="Colour bar" value={d.colorbar} onChange={(colorbar) => set({ colorbar })} />}
          </span>
          <span title="Every curve (⚙ beside a colour: that curve's own look)">Curves</span>
          <span className="row wrap">
            <ColorSwatches swatches={swatches} ids={ids} defaults={shown} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
          </span>
          <LookPanel swatches={swatches} ids={ids} looks={d.looks} fields={['style', 'points', 'opacity']} open={lookOf} onChange={(looks) => set({ looks })} />
          <span>Lines</span>
          <span className="row wrap">
            <Select<WaterfallSpec['mode']>
              value={d.mode}
              options={[
                ['line', 'lines'],
                ['linesymbol', 'lines and symbols'],
              ]}
              onChange={(mode) => set({ mode })}
            />
            <Select<Dash> value={d.dash} options={DASHES} onChange={(dash) => set({ dash })} />
            <Field label="Width">
              <NumInput className="tiny" min={0.1} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.1, lineWidth || 1) })} />
            </Field>
          </span>
          {d.mode === 'linesymbol' && (
            <>
              <span>Symbols</span>
              <span className="row wrap">
                <Select value={d.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
                <Field label="Size">
                  <NumInput className="tiny" min={0.5} step={0.5} value={d.symbolSize} onChange={(symbolSize) => set({ symbolSize: Math.max(0.5, symbolSize || 3) })} />
                </Field>
                <Select<SymbolFill> seg
                  value={d.symbolFill}
                  options={[
                    ['filled', 'filled'],
                    ['open', 'open'],
                    ['white', 'white'],
                    ['dot', 'dot'],
                  ]}
                  onChange={(symbolFill) => set({ symbolFill })}
                />
              </span>
            </>
          )}
          <span title="Z written at every curve: beside it, out of the frame, or above its end, in the frame">Labels</span>
          <span className="row wrap">
            <Select<WaterfallSpec['labels']>
              value={d.labels}
              options={[
                ['none', 'none'],
                ['right', 'after the end'],
                ['left', 'before the start'],
                ['rightIn', 'above the end (in the frame)'],
                ['leftIn', 'above the start (in the frame)'],
              ]}
              onChange={(labels) => set({ labels })}
            />
            {d.labels !== 'none' && <TextInput value={d.labelText} placeholder="{z}" title="The text: {z} is the value, {name} the column's name (“{z} nm”, “d = {z}”)" onChange={(labelText) => set({ labelText })} />}
          </span>
          {d.labels !== 'none' && (
            <>
              <span />
              <span className="row wrap">
                <Field label="Decimals">
                  <NumInput className="tiny" min={0} max={8} step={1} value={d.labelDecimals} placeholder="auto" onChange={(labelDecimals) => set({ labelDecimals })} />
                </Field>
                <Field label="Size">
                  <NumInput className="tiny" min={2} step={0.5} value={d.labelSize} placeholder="auto" onChange={(labelSize) => set({ labelSize: labelSize > 0 ? labelSize : NaN })} />
                </Field>
                <OptColor value={d.labelColor} none="curve" title="Their colour (none: each curve's)" onChange={(labelColor) => set({ labelColor })} />
              </span>
            </>
          )}
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
      <OutPort label="data" port="dataset" id="data" title="The curves as drawn (shifted): an X and a Y column each" />
    </div>
  );
}
