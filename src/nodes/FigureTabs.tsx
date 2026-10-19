// The figure tabs of a Plot (and of the nodes that make a whole figure the same way: Histogram): its insets port, Axes,
// Legend, Annotate, Page (the frame placed automatically or by hand), Insets — the same editors for all of them.
import { useState } from 'react';
import { useNodesData, useReactFlow } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { INSET_DEFAULTS, type Curve, type InsetItem, type Placement } from '../figure/spec.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, Plot1DData, PlotPage } from '../types.ts';
import { Tabs } from './fields.tsx';
import { BorderControls } from './BorderControls.tsx';
import { AxesEditor } from './AxesEditor.tsx';
import { LegendEditor } from './LegendEditor.tsx';
import { AnnotationsEditor } from './AnnotationsEditor.tsx';
import { PageControls } from './FigureView.tsx';
import { Check, Field, InPort, NumInput, Select, Slider } from './ui.tsx';
import { flashLater, useFigureFocus } from './figureFocus.ts';

type PlotTab = 'axes' | 'legend' | 'annotate' | 'page' | 'insets';
export type FigureParts = Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;

// The insets port of a figure node (in the node itself: a port cannot be in the options panel).
export const InsetsPort = () => <InPort label="insets" port="figure" id="insets" title="Other Plots (their “figure” output), drawn inside this one's frame: insets — placed in Insets, or dragged with Edit layout; with zoom, the part they show marked here" />;

// port: the insets port drawn here, above the tabs (false: the node draws it — its tabs are in the options panel)
// dataKinds: its axes can hold categories or times (a 1D plot)
export function FigureTabs({ id, data, legendCurves, pos, port = true, dataKinds = false }: { id: string; data: FigureParts; legendCurves: Curve[]; pos: Placement | undefined; port?: boolean; dataKinds?: boolean }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const insetKeys = useInsetKeys(id);
  const [tab, setTab] = useState<PlotTab | null>(null);
  // a part of the figure double-clicked: its tab opened (an axis on its side, an annotation open), flashed
  const [shown, setShown] = useState<{ axis?: string; item?: string; seq: number } | null>(null);
  useFigureFocus(id, (part, seq) => {
    const [kind, rest] = [part.split(':')[0], part.slice(part.indexOf(':') + 1)];
    if (kind === 'axis' || kind === 'frame') {
      setTab('axes');
      setShown({ ...(kind === 'axis' ? { axis: rest } : {}), seq });
    } else if (kind === 'legend') {
      setTab('legend');
      setShown({ seq });
    } else if (kind === 'ann') {
      setTab('annotate');
      setShown({ item: rest, seq });
    } else if (kind === 'page') {
      setTab('page');
      setShown({ seq });
    } else return;
    flashLater(seq);
  });
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...data.page };
  const setPage = (p: Partial<PlotPage>) => updateNodeData(id, { page: { ...page, ...p } });
  return (
    <>
      {port && <InsetsPort />}
      <Tabs
        tabs={[
          ['axes', 'Axes'],
          ['legend', 'Legend'],
          ['annotate', `Annotate${data.annotations?.length ? ` (${data.annotations.length})` : ''}`],
          ['page', 'Page'],
          ...(insetKeys.length ? [['insets', `Insets (${insetKeys.length})`] as [PlotTab, string]] : []),
        ]}
        value={tab ?? ('' as PlotTab)}
        onChange={(t) => setTab(tab === t ? null : t)}
      />
      <div data-flash={shown?.seq}>
      {tab === 'axes' && <AxesEditor value={data.axes} dataKinds={dataKinds} show={shown?.axis ? { axis: shown.axis, seq: shown.seq } : undefined} onChange={(axes) => updateNodeData(id, { axes })} />}
      {tab === 'insets' && <InsetsEditor keys={insetKeys} items={data.insets ?? []} onChange={(insets) => updateNodeData(id, { insets })} />}
      {tab === 'legend' && <LegendEditor value={data.legend} curves={legendCurves} onChange={(p) => updateNodeData(id, { legend: { show: false, ...data.legend, ...p } })} />}
      {tab === 'annotate' && <AnnotationsEditor items={data.annotations} where="frame" node={id} show={shown?.item ? { item: shown.item, seq: shown.seq } : undefined} onChange={(annotations) => updateNodeData(id, { annotations })} />}
      {tab === 'page' && (
        <div className="page-tab">
          <PageControls page={page} set={setPage} />
          <Field label="Frame" title="Placed automatically: the margins just large enough for the numbers, titles and extra axes (the frame as large as it can be); or by hand (the sliders, or Edit layout on the figure)">
            <span className="row">
              <Select<PlotPage['frame']>
                value={page.frame}
                options={[
                  ['auto', 'automatic margins'],
                  ['manual', 'placed by hand'],
                ]}
                onChange={(frame) => {
                  if (frame === 'manual' && pos) updateNodeData(id, { axes: { ...data.axes, pos: { x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), w: +pos.w.toFixed(1), h: +pos.h.toFixed(1) } }, page: { ...page, frame } });
                  else setPage({ frame });
                }}
              />
              {page.frame === 'auto' && (
                <>
                  <NumInput className="tiny" min={0} step={1} value={page.pad ?? 3} title="Space around, pt" onChange={(v) => setPage({ pad: Math.max(0, Number.isFinite(v) ? v : 3) })} />
                  <span className="muted">pt around</span>
                </>
              )}
            </span>
          </Field>
          {page.frame === 'manual' && pos && (
            <>
              <Slider label="Left" value={+pos.x.toFixed(1)} min={0} max={100} step={0.5} unit="%" onChange={(x) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, x } } })} />
              <Slider label="Top" value={+pos.y.toFixed(1)} min={0} max={100} step={0.5} unit="%" onChange={(y) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, y } } })} />
              <Slider label="Width" value={+pos.w.toFixed(1)} min={1} max={100} step={0.5} unit="%" onChange={(w) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, w } } })} />
              <Slider label="Height" value={+pos.h.toFixed(1)} min={1} max={100} step={0.5} unit="%" onChange={(h) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, h } } })} />
            </>
          )}
        </div>
      )}
      </div>
    </>
  );
}

// The Plots drawn as insets of this one (their node ids, from its figure)
function useInsetKeys(id: string): string[] {
  const r = useNodeResult(id);
  const f = r?.outputs.figure;
  return f?.t === 'figure' ? f.v.axes.flatMap((a) => (a.inset?.owner === id && a.node ? [a.node] : [])) : [];
}

// Every inset: its place in the frame (% of the frame: left, top, width, height), its background, zoom (the part it
// shows marked on this Plot, joined to it by two lines) and the look of those lines.
function InsetsEditor({ keys, items, onChange }: { keys: string[]; items: InsetItem[]; onChange: (items: InsetItem[]) => void }) {
  const nodes = useNodesData<AppNode>(keys);
  const item = (key: string): InsetItem => ({ ...INSET_DEFAULTS, ...items.find((it) => it.key === key), key });
  const set = (key: string, p: Partial<InsetItem>) => onChange([...items.filter((it) => it.key !== key), { ...item(key), ...p }]);
  return (
    <div className="insets-tab">
      <div className="hint">Drag an inset (Edit layout on the figure) or type its place, in % of this frame.</div>
      {keys.map((key) => {
        const it = item(key);
        const name = nodes.find((n) => n.id === key)?.data;
        const label = (name && 'label' in name && typeof name.label === 'string' && name.label) || key;
        const pct = (k: 'x' | 'y' | 'w' | 'h', lo: number) => <NumInput className="tiny" min={lo} max={100} step={1} value={it[k]} onChange={(v) => set(key, { [k]: Math.min(100, Math.max(lo, Number.isFinite(v) ? v : it[k])) })} />;
        return (
          <details key={key} open>
            <summary>{label}</summary>
            <div className="grid2">
              <Field label="Left, top" title="% of the frame">
                {pct('x', 0)}
                {pct('y', 0)}
              </Field>
              <Field label="Width, height" title="% of the frame">
                {pct('w', 5)}
                {pct('h', 5)}
              </Field>
              <Field label="Background" title="Under the inset: as its Plot's page (Page ▸ Background: white, or nothing when transparent), none, or a colour">
                <span className="row">
                  <Select<'page' | 'none' | 'colour'>
                    value={!it.background || it.background === '#ffffff' ? 'page' : it.background === 'none' ? 'none' : 'colour'}
                    options={[
                      ['page', "as its Plot's page"],
                      ['none', 'none (transparent)'],
                      ['colour', 'a colour'],
                    ]}
                    onChange={(v) => set(key, { background: v === 'page' ? '' : v === 'none' ? 'none' : 'white' })}
                  />
                  {it.background && it.background !== '#ffffff' && it.background !== 'none' && <input className="nodrag color" type="color" value={it.background === 'white' ? '#ffffff' : it.background} onChange={(e) => set(key, { background: e.target.value === '#ffffff' ? 'white' : e.target.value })} />}
                </span>
              </Field>
              <Check label="Zoom: mark the part it shows" value={it.zoom} onChange={(zoom) => set(key, { zoom })} />
            </div>
            {it.zoom && (
              <Field label="Lines" title="The rectangle on this Plot and the lines to the inset: colour, width (pt), line, opacity">
                <BorderControls radius={false} value={{ ...it.line, radius: 0 }} onChange={(p) => set(key, { line: { ...it.line, ...(p.color !== undefined ? { color: p.color } : {}), ...(p.width !== undefined ? { width: p.width } : {}), ...(p.dash ? { dash: p.dash } : {}), ...(p.opacity !== undefined ? { opacity: p.opacity } : {}) } })} />
              </Field>
            )}
          </details>
        );
      })}
    </div>
  );
}
