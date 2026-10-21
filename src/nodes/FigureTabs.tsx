// The figure tabs of a Plot (and of the nodes that make a whole figure the same way: Histogram): its insets port, Axes,
// Legend, Annotate, Page (the frame placed automatically or by hand), Insets — the same editors for all of them.
import { useMemo, useState } from 'react';
import { useNodesData, useReactFlow } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { Choice, ColorField, OpacityField, PictureGrid, Row, Section, Sections, SliderField, Toggle, WidthField } from '../ui/props.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';
import { drawnLimits } from '../figure/drawnLimits.ts';
import { INSET_DEFAULTS, type Curve, type InsetItem, type Placement } from '../figure/spec.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, Plot1DData, PlotPage } from '../types.ts';
import { Tabs } from './fields.tsx';
import { AxesEditor } from './AxesEditor.tsx';
import { LegendEditor } from './LegendEditor.tsx';
import { AnnotationsEditor } from './AnnotationsEditor.tsx';
import { PageControls } from './FigureView.tsx';
import { InPort } from './ui.tsx';
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
  // the axes as drawn: their limits and steps, shown where they are left automatic
  const fig = useNodeResult(id)?.outputs.figure;
  const limits = useMemo(() => (tab === 'axes' && fig?.t === 'figure' ? drawnLimits(fig.v, id) : undefined), [tab, fig, id]);
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
      {tab === 'axes' && <AxesEditor value={data.axes} dataKinds={dataKinds} limits={limits} show={shown?.axis ? { axis: shown.axis, seq: shown.seq } : undefined} onChange={(axes) => updateNodeData(id, { axes })} />}
      {tab === 'insets' && <InsetsEditor keys={insetKeys} items={data.insets ?? []} onChange={(insets) => updateNodeData(id, { insets })} />}
      {tab === 'legend' && <LegendEditor value={data.legend} curves={legendCurves} onChange={(p) => updateNodeData(id, { legend: { show: false, ...data.legend, ...p } })} />}
      {tab === 'annotate' && <AnnotationsEditor items={data.annotations} where="frame" node={id} page={page} show={shown?.item ? { item: shown.item, seq: shown.seq } : undefined} onChange={(annotations) => updateNodeData(id, { annotations })} />}
      {tab === 'page' && (
        <div className="page-tab">
          <PageControls page={page} set={setPage} />
          <div className="props-panel props-embed nodrag">
            <Row label="Frame" hint="Placed automatically: the margins just large enough for the numbers, titles and extra axes (the frame as large as it can be); or by hand (the sliders, or Edit layout on the figure)">
              <Choice<PlotPage['frame']>
                value={page.frame}
                onChange={(frame) => {
                  if (frame === 'manual' && pos) updateNodeData(id, { axes: { ...data.axes, pos: { x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), w: +pos.w.toFixed(1), h: +pos.h.toFixed(1) } }, page: { ...page, frame } });
                  else setPage({ frame });
                }}
                options={[
                  ['auto', 'Automatic', 'Automatic margins'],
                  ['manual', 'By hand', 'Placed by hand'],
                ]}
              />
            </Row>
            {page.frame === 'auto' && (
              <Row label="Space around" hint="Around the frame and its numbers and titles">
                <SliderField value={page.pad ?? 3} onChange={(v) => setPage({ pad: Math.max(0, Number.isFinite(v) ? v : 3) })} min={0} max={20} step={0.5} unit="pt" />
              </Row>
            )}
            {page.frame === 'manual' && pos && (
              <>
                <Row label="Left">
                  <SliderField value={+pos.x.toFixed(1)} min={0} max={100} step={0.5} unit="%" onChange={(x) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, x } } })} />
                </Row>
                <Row label="Top">
                  <SliderField value={+pos.y.toFixed(1)} min={0} max={100} step={0.5} unit="%" onChange={(y) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, y } } })} />
                </Row>
                <Row label="Width">
                  <SliderField value={+pos.w.toFixed(1)} min={1} max={100} step={0.5} unit="%" onChange={(w) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, w } } })} />
                </Row>
                <Row label="Height">
                  <SliderField value={+pos.h.toFixed(1)} min={1} max={100} step={0.5} unit="%" onChange={(h) => updateNodeData(id, { axes: { ...data.axes, pos: { ...pos, h } } })} />
                </Row>
              </>
            )}
          </div>
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
    <div className="insets-tab props-panel props-embed nodrag">
      <div className="prop-note">Drag an inset (Edit layout on the figure) or set its place, in % of this frame.</div>
      <Sections panel="insets" open={keys}>
        {keys.map((key) => {
          const it = item(key);
          const name = nodes.find((n) => n.id === key)?.data;
          const label = (name && 'label' in name && typeof name.label === 'string' && name.label) || key;
          const pct = (k: 'x' | 'y' | 'w' | 'h', lo: number) => <SliderField value={it[k]} min={lo} max={100} step={1} unit="%" onChange={(v) => set(key, { [k]: Math.min(100, Math.max(lo, Number.isFinite(v) ? v : it[k])) })} />;
          const bg = !it.background || it.background === '#ffffff' ? 'page' : it.background === 'none' ? 'none' : 'colour';
          return (
            <Section key={key} value={key} title={label}>
              <Row label="Left">{pct('x', 0)}</Row>
              <Row label="Top">{pct('y', 0)}</Row>
              <Row label="Width">{pct('w', 5)}</Row>
              <Row label="Height">{pct('h', 5)}</Row>
              <Row label="Background" hint="Under the inset: as its Plot's page (Page ▸ Background: white, or nothing when transparent), none, or a colour">
                <Choice<'page' | 'none' | 'colour'>
                  value={bg}
                  onChange={(v) => set(key, { background: v === 'page' ? '' : v === 'none' ? 'none' : 'white' })}
                  options={[
                    ['page', 'As its page'],
                    ['none', 'None', 'Transparent'],
                    ['colour', 'Colour'],
                  ]}
                />
                {bg === 'colour' && <ColorField value={it.background === 'white' ? '#ffffff' : it.background} onChange={(c) => set(key, { background: !c || c.toLowerCase() === '#ffffff' ? 'white' : c })} />}
              </Row>
              <Row label="Zoom" hint="The part it shows marked on this Plot, joined to it by two lines">
                <Toggle value={it.zoom} onChange={(zoom) => set(key, { zoom })} label="mark the part it shows" />
              </Row>
              {it.zoom && (
                <div className="prop-sub">
                  <Row label="Line colour">
                    <ColorField value={it.line.color} onChange={(color) => set(key, { line: { ...it.line, color: color || '#555555' } })} />
                  </Row>
                  <Row label="Width">
                    <WidthField value={it.line.width} onChange={(width) => set(key, { line: { ...it.line, width: Math.max(0, Number.isFinite(width) ? width : 0) } })} max={3} />
                  </Row>
                  <Row label="Style">
                    <PictureGrid value={it.line.dash} onChange={(dash) => set(key, { line: { ...it.line, dash } })} options={DASH_PICS} cols={4} />
                  </Row>
                  <Row label="Opacity">
                    <OpacityField value={it.line.opacity} onChange={(opacity) => set(key, { line: { ...it.line, opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 0)) } })} />
                  </Row>
                </div>
              )}
            </Section>
          );
        })}
      </Sections>
    </div>
  );
}
