// 3D plot: what is drawn (surface, wireframe, bars, symbols, lines, a waterfall) and its data, the view (azimuth,
// elevation, perspective, the box's proportions), the colours (by Z on a map with its bar, one colour, by group), the
// look of every kind (shading, mesh, the floor's map or contour lines; bars; symbols, drop lines; lines, walls), the box
// (walls, grid, edges, titles); every group / curve its own look (⚙); the figure with the same tabs as a Plot.
import { Fragment, useState } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import { maxOf } from '../engine/minmax.ts';
import type { LayerSpec, Mark3D, Plot3DSpec } from '../engine/plot3d.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import type { ColorMapName, Dash, Head3D, SymbolFill } from '../figure/spec.ts';
import type { AppNode, Plot3DData, Plot3DNode, PlotPage } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { OptColor } from './fields.tsx';
import type { Pick3D } from './Figure3DPick.tsx';
import type { PickPlane } from './figure3d.ts';
import { DASHES, SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { HideControls } from './HideControls.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { Pencil, X } from 'lucide-react';
import { IC } from './iconProps.ts';

// the marks: their kinds, and how many points each is drawn with
const MARK_KINDS: [Mark3D['type'], string, string][] = [
  ['line', 'Line', 'A line from one point to another'],
  ['arrow', 'Arrow', 'An arrow from one point to another'],
  ['vline', 'Vertical line', 'A vertical line at X, Y (through every layer)'],
  ['rect', 'Rectangle', 'A rectangle: level at a height, or upright (its plane in its row)'],
  ['point', 'Point', 'A point (a symbol, a label)'],
];
type DrawOn = 'free' | 'floor' | 'xwall' | 'ywall' | 'x' | 'y' | 'z';
const pointsOf = (m: Mark3D) => (m.type === 'vline' || m.type === 'point' ? 1 : 2);

const VIEWS: [string, number, number][] = [
  ['default', -60, 30],
  ['front', -90, 0],
  ['side', 0, 0],
  ['top', -90, 90],
  ['low', -45, 12],
];

export function Plot3DNodeView({ id, data: d }: NodeProps<Plot3DNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<Plot3DData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const grid = d.kind === 'surface' || d.kind === 'wireframe' || d.kind === 'bars';
  const layered = d.kind === 'layers';
  const byMap = layered || d.colorBy === 'z' || d.colorBy === 'column';
  const swatches = (fig?.axes[0]?.curves ?? []).filter((c) => /^3d:\d+$/.test(c.key));
  const num = (v: number, lo: number, hi: number, dflt: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
  // stacked maps: A (the dataset port), then B, C … — a new one when the last is used
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^layer-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? 0));
  const layerPorts = layered ? Math.max(1, maxOf([0, ...used]) + 1) : 0;
  const kind = (k: Plot3DSpec['kind']) => {
    // the ports B, C … go with the stacked maps: their connections too
    if (layered && k !== 'layers') setEdges((es) => es.filter((e) => !(e.target === id && /^layer-\d+$/.test(e.targetHandle ?? ''))));
    set({ kind: k });
  };
  const layerList = r?.view.layers ?? [];
  // my list: every layer its input, rows and columns
  const own = d.layerList === 'own';
  const ownList = d.layerOwn ?? [];
  const setOwn = (k: number, p: Partial<LayerSpec>) => set({ layerOwn: ownList.map((L, j) => (j === k ? { ...L, ...p } : L)) });
  const inputs = r?.view.layerInputs ?? [];
  const inputOf = (port: number) => inputs.find((q) => q.port === port);
  const inputOpts: [number, string][] = (inputs.length ? inputs : [{ port: 0, letter: 'A', name: '' }]).map((q) => [q.port, q.name ? `${q.letter} · ${q.name}` : q.letter]);
  const [fromCol, setFromCol] = useState<{ port: number; col: string }>({ port: 0, col: '' });
  // my list from the layers found (their settings kept), or the list kept from before
  const toOwn = () =>
    set({
      layerList: 'own',
      ...(ownList.length ? {} : { layerOwn: layerList.map((L, k): LayerSpec => ({ ...d.layers?.[k], from: L.from, ...(L.where ? { where: L.where, is: L.is } : {}) })) }),
    });
  const setLayer = (k: number, p: Partial<LayerSpec>) => {
    const ls = [...(d.layers ?? [])];
    while (ls.length <= k) ls.push({});
    ls[k] = { ...ls[k], ...p };
    set({ layers: ls });
  };
  const marks = d.marks ?? [];
  const setMark = (k: number, p: Partial<Mark3D>) => set({ marks: marks.map((m, j) => (j === k ? { ...m, ...p } : m)) });
  // a new mark: its projections as chosen for new ones; then drawn with the mouse on the figure
  const [newProj, setNewProj] = useState<NonNullable<Mark3D['proj']>>({});
  const [drawing, setDrawing] = useState<{ k: number; step: number } | null>(null);
  // where the marks are drawn: free (on the data, the surface, the floor) or on a plane — exactly under the mouse; the
  // points rounded to the grid (a part of the axes' step) or not
  const [drawOn, setDrawOn] = useState<DrawOn>('free');
  const [drawAt, setDrawAt] = useState(NaN);
  const [snap, setSnap] = useState(0);
  const onPlane: PickPlane | undefined = drawOn === 'free' ? undefined : drawOn === 'floor' ? { axis: 2, value: 'low' } : drawOn === 'xwall' ? { axis: 0, value: 'back' } : drawOn === 'ywall' ? { axis: 1, value: 'back' } : Number.isFinite(drawAt) ? { axis: drawOn === 'x' ? 0 : drawOn === 'y' ? 1 : 2, value: drawAt } : undefined;
  const addMark = (type: Mark3D['type']) => {
    const proj = newProj.floor || newProj.x || newProj.y ? { ...newProj } : undefined;
    set({ marks: [...marks, { id: crypto.randomUUID().slice(0, 8), type, x1: NaN, y1: NaN, z1: NaN, x2: NaN, y2: NaN, z2: NaN, color: type === 'rect' ? '#e41a1c' : '#000000', width: type === 'point' ? 0.8 : 1, dash: type === 'line' || type === 'arrow' || type === 'point' ? 'solid' : 'dash', ...(proj ? { proj } : {}) }] });
    setDrawing({ k: marks.length, step: 0 });
  };
  const removeMark = (k: number) => {
    set({ marks: marks.filter((_, j) => j !== k) });
    setDrawing(null);
  };
  // a point clicked on the figure: the next one of the mark drawn
  const r5 = (v: number) => +v.toPrecision(5);
  const onPick = (p: [number, number, number]) => {
    if (!drawing) return;
    const m = marks[drawing.k];
    if (!m) return setDrawing(null);
    const [x, y, z] = p.map(r5);
    const plane = m.plane ?? 'xy';
    const first = drawing.step === 0;
    const patch: Partial<Mark3D> =
      m.type === 'vline'
        ? { x1: x, y1: y }
        : m.type === 'point'
          ? { x1: x, y1: y, z1: z }
          : m.type === 'rect'
            ? first
              ? { x1: x, y1: y, z1: z, ...(onPlane ? { plane: (['yz', 'xz', 'xy'] as const)[onPlane.axis] } : {}) }
              : plane === 'xy'
                ? { x2: x, y2: y }
                : plane === 'xz'
                  ? { x2: x, z2: z }
                  : { y2: y, z2: z }
            : first
              ? { x1: x, y1: y, z1: z }
              : { x2: x, y2: y, z2: z };
    setMark(drawing.k, patch);
    setDrawing(drawing.step + 1 < pointsOf(m) ? { k: drawing.k, step: drawing.step + 1 } : null);
  };
  // the second corner of a rectangle: on its own plane
  const dm = drawing ? marks[drawing.k] : undefined;
  const pickPlane = dm?.type === 'rect' && drawing!.step === 1 ? ((dm.plane ?? 'xy') === 'xy' ? { axis: 2 as const, value: dm.z1 } : (dm.plane ?? 'xy') === 'xz' ? { axis: 1 as const, value: dm.y1 } : { axis: 0 as const, value: dm.x1 }) : undefined;
  const plane3d = pickPlane && Number.isFinite(pickPlane.value) ? pickPlane : onPlane;
  const pick3d: Pick3D | undefined = dm
    ? {
        title: `Click on the figure: ${MARK_KINDS.find(([t]) => t === dm.type)?.[1] ?? 'mark'} ${drawing!.k + 1}, point ${drawing!.step + 1} of ${pointsOf(dm)}`,
        onPick,
        onStop: () => setDrawing(null),
        ...(plane3d ? { plane: plane3d } : {}),
        snap,
        shape: dm.type === 'arrow' ? 'line' : dm.type,
        ...(drawing!.step === 1 ? { from: [dm.x1, dm.y1, dm.z1] as [number, number, number] } : {}),
        rectPlane: dm.plane ?? 'xy',
      }
    : undefined;
  return (
    <div className="node node-plot1d node-plot3d">
      <InPort label={layered ? 'A' : 'dataset'} port="dataset" id="dataset" title={layered ? 'A layer: X, Y and a value (Qx, Qz, intensity …): or the column below that names the layers' : 'Z on a grid (X, Y, Z columns or a matrix), X, Y, Z points (and groups), or X and the Y columns of a sweep'} />
      {Array.from({ length: Math.max(0, layerPorts) }, (_, j) => (
        <InPort key={j} label={columnLetter(j + 1)} port="dataset" id={`layer-${j + 1}`} title="Another layer: X, Y and a value; a new port appears when the last one is used" />
      ))}
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>Draw</span>
          <Select<Plot3DSpec['kind']>
            value={d.kind}
            options={[
              ['surface', 'a surface (Z on a grid)'],
              ['wireframe', 'a wireframe (Z on a grid)'],
              ['bars', '3D bars (Z on a grid)'],
              ['scatter', 'symbols (X, Y, Z points)'],
              ['lines', 'lines (X, Y, Z points)'],
              ['waterfall', 'a waterfall (curves in depth)'],
              ['layers', 'stacked maps (flat layers in Z)'],
            ]}
            onChange={kind}
          />
          {grid && (
            <>
              <span>The data</span>
              <Select<Plot3DSpec['layout']>
                value={d.layout}
                options={[
                  ['xyz', 'X, Y, Z columns'],
                  ['matrix', 'a matrix (Z columns named by X)'],
                ]}
                onChange={(layout) => set({ layout })}
              />
            </>
          )}
          {(!grid || d.layout === 'xyz') && d.kind !== 'waterfall' && (
            <>
              <span title={layered ? 'The same columns in every layer (by name; auto: X designated, the next column Y, the one after it the value)' : undefined}>{layered ? 'X, Y, value' : 'X, Y, Z'}</span>
              <span className="row wrap">
                <Select value={d.x} title="X" options={[['', 'auto X'], ...cols]} onChange={(x) => set({ x })} />
                <Select value={d.y} title="Y" options={[['', 'auto Y'], ...cols]} onChange={(y) => set({ y })} />
                <Select value={d.z} title={layered ? 'The value coloured (intensity …)' : 'Z'} options={[['', layered ? 'auto value' : 'auto Z'], ...cols]} onChange={(z) => set({ z })} />
              </span>
            </>
          )}
          {layered && (
            <>
              <span title="Found by the node: a layer for every dataset on A, B, C …, or for every label of a column (S1, S2 …). My list: every layer chosen; its input, its rows, its columns">Layers</span>
              <span className="row wrap">
                <Select<NonNullable<Plot3DSpec['layerList']>>
                  value={own ? 'own' : 'auto'}
                  options={[
                    ['auto', 'found by the node'],
                    ['own', 'my list'],
                  ]}
                  onChange={(m) => (m === 'own' ? toOwn() : set({ layerList: 'auto' }))}
                />
                {!own && (
                  <Select
                    value={d.layerBy ?? ''}
                    title="A layer for every value of this column (in every input that has it)"
                    options={[['', 'auto: by a column of labels, else per port'], ['-', 'one per port (A, B, C …)'], ...cols.map(([v, t]): [string, string] => [v, `by the values of ${t}`])]}
                    onChange={(layerBy) => set({ layerBy })}
                  />
                )}
              </span>
              <span title="Bins: the points of every layer averaged on a grid over X and Y (an empty bin is not drawn: the map of scattered points, an RSM). Grid: the data's own grid, or Z interpolated to one as the Contour does">Map</span>
              <span className="row wrap">
                <Select<NonNullable<Plot3DSpec['layerDraw']>>
                  value={d.layerDraw ?? 'bins'}
                  options={[
                    ['bins', 'points in bins'],
                    ['grid', 'the data’s grid'],
                  ]}
                  onChange={(layerDraw) => set({ layerDraw })}
                />
                {(d.layerDraw ?? 'bins') === 'bins' ? (
                  <Field label="Bins a side" title="More: finer, slower; fewer than the points' spacing: no holes">
                    <NumInput className="tiny" min={4} max={600} step={10} value={d.bins ?? 150} onChange={(bins) => set({ bins: Math.min(600, Math.max(4, Math.round(bins) || 150)) })} />
                  </Field>
                ) : (
                  <Field label="Cells a side" title="At most this many cells a side are drawn (scattered points: interpolated to a grid of this size)">
                    <NumInput className="tiny" min={4} max={600} step={10} value={d.bins ?? 150} onChange={(bins) => set({ bins: Math.min(600, Math.max(4, Math.round(bins) || 150)) })} />
                  </Field>
                )}
              </span>
              {own && (
                <div className="layer-list">
                  {ownList.map((L, k) => {
                    const inp = inputOf(L.from ?? 0);
                    const colOpts: [string, string][] = (inp?.columns ?? []).map((c) => [c, c]);
                    const seen = layerList[k] as (typeof layerList)[number] | undefined;
                    return (
                      <div key={k} className="mark-row">
                        <input className="nodrag" type="checkbox" checked={L.show !== false} title="Shown" onChange={(e) => setOwn(k, { show: e.target.checked ? undefined : false })} />
                        <TextInput className="short-text" value={L.name ?? ''} placeholder={L.is || inp?.name || columnLetter(L.from ?? 0)} title="Its name" onChange={(name) => setOwn(k, { name: name || undefined })} />
                        <Field label="From">
                          <Select value={L.from ?? 0} options={inputOpts} onChange={(from) => setOwn(k, { from, where: undefined, is: undefined })} />
                        </Field>
                        <Field label="Rows where" title="Only the rows where this column has this value (empty: all the rows)">
                          <Select value={L.where ?? ''} options={[['', 'all'], ...colOpts]} onChange={(where) => setOwn(k, { where: where || undefined, is: where ? (inp?.labels[where]?.[0] ?? '') : undefined })} />
                        </Field>
                        {L.where && (
                          <Field label="=">
                            {inp?.labels[L.where] ? <Select value={L.is ?? ''} options={inp.labels[L.where].map((v): [string, string] => [v, v])} onChange={(is) => setOwn(k, { is })} /> : <TextInput className="short-text" value={L.is ?? ''} onChange={(is) => setOwn(k, { is })} />}
                          </Field>
                        )}
                        <Field label="Rows" title="And / or rows by number: 1-2500, 5000-end (empty: all)">
                          <TextInput className="short-text" value={L.rows ?? ''} placeholder="all" onChange={(rows) => setOwn(k, { rows: rows || undefined })} />
                        </Field>
                        <Field label="X">
                          <Select value={L.x ?? ''} options={[['', 'as above'], ...colOpts]} onChange={(x) => setOwn(k, { x: x || undefined })} />
                        </Field>
                        <Field label="Y">
                          <Select value={L.y ?? ''} options={[['', 'as above'], ...colOpts]} onChange={(y) => setOwn(k, { y: y || undefined })} />
                        </Field>
                        <Field label="Value">
                          <Select value={L.v ?? ''} options={[['', 'as above'], ...colOpts]} onChange={(v) => setOwn(k, { v: v || undefined })} />
                        </Field>
                        <Field label="Z" title="Its height (empty: the value of the label when it is a number, else its place 1, 2, 3 …)">
                          <NumInput className="short" value={L.at ?? NaN} placeholder={seen ? String(seen.at) : 'auto'} onChange={(at) => setOwn(k, { at: Number.isFinite(at) ? at : undefined })} />
                        </Field>
                        <Field label="Opacity">
                          <NumInput className="tiny" min={0.05} max={1} step={0.05} value={L.opacity ?? NaN} placeholder="1" onChange={(opacity) => setOwn(k, { opacity: opacity > 0 && opacity < 1 ? opacity : undefined })} />
                        </Field>
                        <span className="muted" title="Points in the layer">{seen ? `${seen.points} points` : ''}</span>
                        <button className="nodrag" title="Remove the layer" onClick={() => set({ layerOwn: ownList.filter((_, j) => j !== k) })}>
                          <X {...IC} />
                        </button>
                      </div>
                    );
                  })}
                  <span className="row wrap">
                    <button className="nodrag" title="A layer: all the rows of A; choose its input, rows and columns" onClick={() => set({ layerOwn: [...ownList, { from: inputs[0]?.port ?? 0 }] })}>
                      + Layer
                    </button>
                    <span className="muted">or a layer for every value of</span>
                    <Select value={fromCol.port} options={inputOpts} title="The input" onChange={(port) => setFromCol({ port, col: '' })} />
                    <Select value={fromCol.col} options={[['', 'a column…'], ...Object.keys(inputOf(fromCol.port)?.labels ?? {}).map((c): [string, string] => [c, c])]} onChange={(col) => setFromCol({ ...fromCol, col })} />
                    <button
                      className="nodrag"
                      disabled={!fromCol.col}
                      title="Adds a layer for every value of the column (S1, S2 …)"
                      onClick={() => set({ layerOwn: [...ownList, ...(inputOf(fromCol.port)?.labels[fromCol.col] ?? []).map((is): LayerSpec => ({ from: fromCol.port, where: fromCol.col, is }))] })}
                    >
                      + Layers
                    </button>
                  </span>
                </div>
              )}
              {!own && layerList.length > 0 && (
                <div className="span2 layer-list">
                  <div className="layer-row muted">
                    <span />
                    <span>Name</span>
                    <span title="Its height (empty: the group's value, else 1, 2, 3 …)">Z</span>
                    <span>Opacity</span>
                    <span>Points</span>
                  </div>
                  {layerList.map((L, k) => (
                    <div key={k} className="layer-row">
                      <input className="nodrag" type="checkbox" checked={L.shown} title="Shown" onChange={(e) => setLayer(k, { show: e.target.checked ? undefined : false })} />
                      <TextInput value={d.layers?.[k]?.name ?? ''} placeholder={L.name} onChange={(name) => setLayer(k, { name: name || undefined })} />
                      <NumInput className="short" value={d.layers?.[k]?.at ?? NaN} placeholder={String(L.at)} onChange={(at) => setLayer(k, { at: Number.isFinite(at) ? at : undefined })} />
                      <NumInput className="tiny" min={0.05} max={1} step={0.05} value={d.layers?.[k]?.opacity ?? NaN} placeholder="1" onChange={(opacity) => setLayer(k, { opacity: opacity > 0 && opacity < 1 ? opacity : undefined })} />
                      <span className="muted">{L.points}</span>
                    </div>
                  ))}
                  <span className="row">
                    <button className="nodrag" title="My list from these layers: then every one can have its input, rows and columns, and layers can be added or removed" onClick={toOwn}>
                      <Pencil {...IC} /> Edit as my list
                    </button>
                  </span>
                </div>
              )}
            </>
          )}
          {grid && d.layout === 'xyz' && (
            <>
              <span>Scattered</span>
              <Field label="Grid of" title="Points not on a grid: Z interpolated linearly on their Delaunay triangles to a grid of this many points a side">
                <NumInput className="tiny" min={10} max={400} step={10} value={d.grid} onChange={(g) => set({ grid: Math.min(400, Math.max(10, Math.floor(g) || 60)) })} />
              </Field>
            </>
          )}
          {grid && d.layout === 'matrix' && (
            <>
              <span>Y</span>
              <Select value={d.yCol} options={[['', 'auto: the X designated, else the first'], ...cols]} onChange={(yCol) => set({ yCol })} />
              <span>Z columns</span>
              <ColumnsPicker value={d.zs} names={names} auto="auto: all the others" title="Every Z column's name holds its X (“400 nm”, “410” …)" onChange={(zs) => set({ zs })} />
              <span>X title</span>
              <TextInput value={d.xTitle ?? ''} placeholder="auto: from the names" onChange={(xTitle) => set({ xTitle })} />
            </>
          )}
          {(d.kind === 'scatter' || d.kind === 'lines') && (
            <>
              <span>Groups</span>
              <Select value={d.group} title="A curve (and a colour) for every group" options={[['', 'none'], ...cols]} onChange={(group) => set({ group })} />
            </>
          )}
          {d.kind === 'waterfall' && (
            <>
              <span>X</span>
              <Select value={d.x} options={[['', xAutoLabel(r?.view.available)], ...cols]} onChange={(x) => set({ x })} />
              <span>Y columns</span>
              <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="A curve for every column, placed in depth at its swept value" onChange={(ys) => set({ ys })} />
              <span>Depth</span>
              <Select<Plot3DSpec['zFrom']>
                value={d.zFrom}
                title="Where every curve stands in depth"
                options={[
                  ['auto', 'auto: blocks, names, order'],
                  ['key', 'the blocks’ value (Split)'],
                  ['name', 'the number in the names'],
                  ['order', '1, 2, 3 …'],
                ]}
                onChange={(zFrom) => set({ zFrom })}
              />
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>View</summary>
        <div className="col-form">
          <span title="Turned around Z (degrees, from +X towards +Y)">Azimuth</span>
          <span className="row">
            <input className="nodrag grow" type="range" min={-180} max={180} step={1} value={num(d.azim, -180, 180, -60)} onChange={(e) => set({ azim: Number(e.target.value) })} />
            <NumInput className="tiny" step={5} value={d.azim} onChange={(azim) => set({ azim: ((((num(azim, -1e6, 1e6, -60) + 180) % 360) + 360) % 360) - 180 })} />
          </span>
          <span title="Seen from above (degrees; 90: from the top, negative: from below)">Elevation</span>
          <span className="row">
            <input className="nodrag grow" type="range" min={-90} max={90} step={1} value={num(d.elev, -90, 90, 30)} onChange={(e) => set({ elev: Number(e.target.value) })} />
            <NumInput className="tiny" step={5} value={d.elev} onChange={(elev) => set({ elev: num(elev, -90, 90, 30) })} />
          </span>
          <span>Views</span>
          <span className="row wrap">
            {VIEWS.map(([label, azim, elev]) => (
              <button key={label} className="nodrag ts-btn" onClick={() => set({ azim, elev })}>
                {label}
              </button>
            ))}
          </span>
          <span title="Near things larger: the eye's distance (in half the box; 0 = none, orthographic)">Perspective</span>
          <span className="row wrap">
            <Check label="On" value={d.persp > 0} onChange={(on) => set({ persp: on ? 5 : 0 })} />
            {d.persp > 0 && (
              <Field label="Distance">
                <NumInput className="tiny" min={1.5} step={0.5} value={d.persp} onChange={(persp) => set({ persp: Math.max(1.5, persp || 5) })} />
              </Field>
            )}
          </span>
          <span title="The box's sides, in proportion">Box X : Y : Z</span>
          <span className="row wrap">
            <NumInput className="tiny" min={0.1} step={0.1} value={d.aspectX} onChange={(aspectX) => set({ aspectX: aspectX > 0 ? aspectX : 1 })} />
            <NumInput className="tiny" min={0.1} step={0.1} value={d.aspectY} onChange={(aspectY) => set({ aspectY: aspectY > 0 ? aspectY : 1 })} />
            <NumInput className="tiny" min={0.1} step={0.1} value={d.aspectZ} onChange={(aspectZ) => set({ aspectZ: aspectZ > 0 ? aspectZ : 0.75 })} />
          </span>
        </div>
      </details>
      <details open>
        <summary>Look</summary>
        <div className="col-form">
          <span title={layered ? 'The value of every cell on a colour map: one scale for all the layers (in a Merge: Layout ▸ one colour scale for all the panels)' : undefined}>Colours</span>
          <span className="row wrap">
            {!layered && (
              <Select<Plot3DSpec['colorBy']>
                value={d.colorBy}
                options={[['z', d.kind === 'waterfall' ? 'by depth (map)' : 'by Z (map)'], ['single', 'one colour'], ...(grid ? [] : ([['group', d.kind === 'waterfall' ? 'each curve its own' : 'by group']] as [Plot3DSpec['colorBy'], string][])), ...(d.kind === 'scatter' || d.kind === 'lines' ? ([['column', 'by a column (map)']] as [Plot3DSpec['colorBy'], string][]) : [])]}
                onChange={(colorBy) => set({ colorBy })}
              />
            )}
            {d.colorBy === 'column' && (d.kind === 'scatter' || d.kind === 'lines') && <Select value={d.colorCol ?? ''} title="The column whose values colour the points (a 4th dimension)" options={[['', 'choose the column'], ...cols]} onChange={(colorCol) => set({ colorCol })} />}
            {byMap && <Select<ColorMapName> value={d.cmap} options={CMAP_OPTIONS} onChange={(cmap) => set({ cmap })} />}
            {byMap && d.cmap === 'custom' && [0, 1, 2].map((k) => <input key={k} className="nodrag color" type="color" value={d.cmapColors[k] || '#ffffff'} onChange={(e) => set({ cmapColors: Object.assign([...d.cmapColors], { [k]: e.target.value }) })} />)}
            {byMap && <Check label="Reversed" value={d.reverse} onChange={(reverse) => set({ reverse })} />}
            {layered && <Check label="Log" title="The colours on a log scale of the value (the positive ones)" value={!!d.logColor} onChange={(logColor) => set({ logColor })} />}
            {byMap && <Check label="Colour bar" value={d.colorbar} onChange={(colorbar) => set({ colorbar })} />}
            {!layered && d.colorBy === 'single' && <input className="nodrag color" type="color" value={d.color || '#4878d0'} onChange={(e) => set({ color: e.target.value })} />}
          </span>
          {layered && d.colorbar && (
            <>
              <span>Bar title</span>
              <TextInput value={d.barTitle ?? ''} placeholder="the value's name" onChange={(barTitle) => set({ barTitle })} />
            </>
          )}
          {layered && <HideControls value={d.hide} onChange={(hide) => set({ hide })} />}
          {byMap && d.kind !== 'waterfall' && (
            <>
              <span title="The colours' range (empty: the data's)">{layered || d.colorBy === 'column' ? 'Colour range' : 'Z range'}</span>
              <span className="row wrap">
                <NumInput className="short" value={d.zMin} placeholder="auto" onChange={(zMin) => set({ zMin })} />
                <NumInput className="short" value={d.zMax} placeholder="auto" onChange={(zMax) => set({ zMax })} />
              </span>
            </>
          )}
          {!grid && !layered && d.colorBy === 'group' && (
            <>
              <span title="Every one (⚙ beside a colour: its own look)">{d.kind === 'waterfall' ? 'Curves' : 'Groups'}</span>
              <span className="row wrap">
                <ColorSwatches swatches={swatches} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
              </span>
              <LookPanel swatches={swatches} looks={d.looks} fields={d.kind === 'scatter' ? ['points'] : d.kind === 'lines' ? ['style', 'points'] : ['style', 'opacity']} open={lookOf} onChange={(looks) => set({ looks })} />
            </>
          )}
          {grid && (
            <>
              <span title="At most this many cells a side are drawn (the data averaged): finer is slower">Resolution</span>
              <span className="row wrap">
                <NumInput className="tiny" min={4} max={200} step={5} value={d.resolution} onChange={(resolution) => set({ resolution: Math.min(200, Math.max(4, Math.round(resolution) || 50)) })} />
                <Field label="Opacity">
                  <NumInput className="tiny" min={0.05} max={1} step={0.05} value={d.opacity} onChange={(opacity) => set({ opacity: num(opacity, 0.05, 1, 1) })} />
                </Field>
              </span>
            </>
          )}
          {(d.kind === 'surface' || d.kind === 'wireframe') && (
            <>
              <span title="Lines along the grid every N cells (a wireframe: its lines)">Mesh</span>
              <span className="row wrap">
                <Field label="Every">
                  <NumInput className="tiny" min={0} step={1} value={d.mesh} placeholder={d.kind === 'wireframe' ? '1' : 'none'} onChange={(mesh) => set({ mesh: Math.max(0, Math.round(mesh) || 0) })} />
                </Field>
                <Select<NonNullable<Plot3DSpec['meshDir']>>
                  value={d.meshDir ?? 'both'}
                  title="Its lines along X and Y, only along X, or only along Y"
                  options={[
                    ['both', 'X and Y'],
                    ['x', 'along X'],
                    ['y', 'along Y'],
                  ]}
                  onChange={(meshDir) => set({ meshDir: meshDir === 'both' ? undefined : meshDir })}
                />
                <Select<NonNullable<Plot3DSpec['meshBy']>>
                  value={d.meshBy ?? 'one'}
                  title="Its colour: one, by Z (the colour map, as matplotlib's wireframe), or a darker one of every cell's"
                  options={[
                    ['one', 'one colour'],
                    ['z', 'by Z (map)'],
                    ['darker', 'darker than the cells'],
                  ]}
                  onChange={(meshBy) => set({ meshBy: meshBy === 'one' ? undefined : meshBy })}
                />
                {(d.meshBy ?? 'one') === 'one' && <OptColor value={d.meshColor} none="auto" onChange={(meshColor) => set({ meshColor })} />}
                <Field label="Width">
                  <NumInput className="tiny" min={0.1} step={0.1} value={d.meshWidth} onChange={(meshWidth) => set({ meshWidth: Math.max(0.1, meshWidth || 0.3) })} />
                </Field>
                <Field label="Opacity">
                  <NumInput className="tiny" min={0} max={1} step={0.1} value={d.meshOpacity ?? 1} onChange={(v) => set({ meshOpacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />
                </Field>
                <Select<Dash> value={d.meshDash ?? 'solid'} options={DASHES} title="Its line" onChange={(meshDash) => set({ meshDash: meshDash === 'solid' ? undefined : meshDash })} />
              </span>
            </>
          )}
          {d.kind === 'surface' && (
            <>
              <span title="The surface's own fill: shown, or hidden; only its mesh and its projections (floor, ceiling, walls) remain">Surface</span>
              <span className="row wrap">
                <Select<'shown' | 'none'> value={d.surfaceFill ?? 'shown'} options={[['shown', 'filled'], ['none', 'hidden (mesh, projections)']]} onChange={(v) => set({ surfaceFill: v === 'shown' ? undefined : v })} />
                <Field label="Bands" title="The colours in so many bands (filled levels on the surface; 0: smooth)">
                  <NumInput className="tiny" min={0} max={40} step={1} value={d.bands ?? 0} onChange={(v) => set({ bands: v >= 2 ? Math.round(v) : undefined })} />
                </Field>
                <Field label="Underside" title="The colour of the surface seen from below (none: the same as above)">
                  <OptColor value={d.backColor ?? ''} none="the same" onChange={(backColor) => set({ backColor: backColor || undefined })} />
                </Field>
              </span>
              <span title="Where the light comes from (azimuth, elevation in degrees; empty: from the eye's side) and a highlight (shine)">Light</span>
              <span className="row wrap">
                <NumInput className="tiny" step={15} value={d.lightAz ?? NaN} placeholder="azim." title="Its azimuth (degrees)" onChange={(v) => set({ lightAz: Number.isFinite(v) ? v : undefined })} />
                <NumInput className="tiny" step={15} value={d.lightEl ?? NaN} placeholder="elev." title="Its elevation (degrees)" onChange={(v) => set({ lightEl: Number.isFinite(v) ? Math.max(-90, Math.min(90, v)) : undefined })} />
                <Field label="Shine">
                  <input className="nodrag" type="range" min={0} max={1} step={0.05} value={d.shine ?? 0} onChange={(e) => set({ shine: Number(e.target.value) || undefined })} />
                </Field>
              </span>
              <span title="Contour lines drawn on the surface itself, at their heights">Contours on it</span>
              <span className="row wrap">
                <Field label="Levels">
                  <NumInput className="tiny" min={0} max={40} step={1} value={d.contours ?? 0} onChange={(v) => set({ contours: v >= 1 ? Math.round(v) : undefined })} />
                </Field>
                {(d.contours ?? 0) > 0 && (
                  <>
                    <OptColor value={d.contourColor ?? ''} none="by the map" onChange={(contourColor) => set({ contourColor: contourColor || undefined })} />
                    <NumInput className="tiny" min={0.1} step={0.1} value={d.contourWidth ?? 0.6} title="Their width, pt" onChange={(v) => set({ contourWidth: v > 0 ? v : undefined })} />
                  </>
                )}
              </span>
            </>
          )}
          {d.kind === 'surface' && (
            <>
              <span title="How much the light darkens the cells turned away from it (0: flat colours)">Shading</span>
              <span className="row">
                <input className="nodrag grow" type="range" min={0} max={1} step={0.05} value={num(d.shade, 0, 1, 0.35)} onChange={(e) => set({ shade: Number(e.target.value) })} />
              </span>
              <span title="Under the surface, on the floor (the map or the contour lines of Z, projected)">Floor</span>
              <span className="row wrap">
                <Select<Plot3DSpec['floor']>
                  value={d.floor}
                  options={[
                    ['none', 'nothing'],
                    ['map', 'the map of Z'],
                    ['contour', 'contour lines'],
                  ]}
                  onChange={(floor) => set({ floor })}
                />
                {(d.floor === 'contour' || d.ceiling === 'contour') && (
                  <Field label="Levels">
                    <NumInput className="tiny" min={2} max={30} step={1} value={d.floorLevels} onChange={(floorLevels) => set({ floorLevels: Math.min(30, Math.max(2, Math.round(floorLevels) || 8)) })} />
                  </Field>
                )}
              </span>
              <span title="Over the surface, on the ceiling: the map or the contour lines of Z (as on the floor)">Ceiling</span>
              <Select<NonNullable<Plot3DSpec['ceiling']>>
                value={d.ceiling ?? 'none'}
                options={[
                  ['none', 'nothing'],
                  ['map', 'the map of Z'],
                  ['contour', 'contour lines'],
                ]}
                onChange={(ceiling) => set({ ceiling: ceiling === 'none' ? undefined : ceiling })}
              />
              <span title="The surface projected on the two back walls: its curves every so many rows (coloured by their height), or its highest outline filled">Back walls</span>
              <span className="row wrap">
                <Select<NonNullable<Plot3DSpec['wallProj']>>
                  value={d.wallProj ?? 'none'}
                  options={[
                    ['none', 'nothing'],
                    ['lines', 'its curves'],
                    ['max', 'its outline, filled'],
                  ]}
                  onChange={(wallProj) => set({ wallProj: wallProj === 'none' ? undefined : wallProj })}
                />
                {d.wallProj === 'lines' && (
                  <Field label="Every">
                    <NumInput className="tiny" min={1} step={1} value={d.wallEvery ?? 4} onChange={(v) => set({ wallEvery: Math.max(1, Math.round(v) || 4) })} />
                  </Field>
                )}
              </span>
              <span title="The opacity of the projections (floor, ceiling, walls)">Projections</span>
              <Field label="Opacity">
                <NumInput className="tiny" min={0.05} max={1} step={0.05} value={d.projOpacity ?? 1} onChange={(v) => set({ projOpacity: Number.isFinite(v) && v < 1 ? Math.max(0.05, v) : undefined })} />
              </Field>
              <span title="The surface's four edges filled down to the floor (a curtain)">Curtain</span>
              <span className="row wrap">
                <Check label="Shown" value={!!d.curtain} onChange={(curtain) => set({ curtain: curtain || undefined })} />
                {d.curtain && (
                  <>
                    <OptColor value={d.curtainColor ?? ''} none="auto" onChange={(curtainColor) => set({ curtainColor: curtainColor || undefined })} />
                    <NumInput className="tiny" min={0.05} max={1} step={0.05} value={d.curtainOpacity ?? 0.6} title="Its opacity" onChange={(v) => set({ curtainOpacity: Number.isFinite(v) ? v : undefined })} />
                  </>
                )}
              </span>
            </>
          )}
          {d.kind === 'bars' && (
            <>
              <span>Bars</span>
              <span className="row wrap">
                <Field label="Width" title="A fraction of the grid's step">
                  <NumInput className="tiny" min={0.05} max={1} step={0.05} value={d.barWidth} onChange={(barWidth) => set({ barWidth: num(barWidth, 0.05, 1, 0.8) })} />
                </Field>
                <OptColor value={d.barEdge} none="no edge" title="Their edges" onChange={(barEdge) => set({ barEdge })} />
              </span>
            </>
          )}
          {(d.kind === 'scatter' || d.kind === 'lines') && (
            <>
              <span>Symbols</span>
              <span className="row wrap">
                <Select value={d.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
                <Field label="Size">
                  <NumInput className="tiny" min={0.5} step={0.5} value={d.symbolSize} onChange={(symbolSize) => set({ symbolSize: Math.max(0.5, symbolSize || 4) })} />
                </Field>
                <Select<SymbolFill>
                  value={d.symbolFill}
                  options={[
                    ['filled', 'filled'],
                    ['open', 'open'],
                    ['white', 'white'],
                  ]}
                  onChange={(symbolFill) => set({ symbolFill })}
                />
              </span>
              <span />
              <span className="row wrap">
                <Check label="Lines to the floor" value={d.drop} onChange={(drop) => set({ drop })} />
                <Check label="Fainter when far" title="Depth shading: the far symbols paler" value={d.depthShade} onChange={(depthShade) => set({ depthShade })} />
              </span>
            </>
          )}
          {(d.kind === 'lines' || d.kind === 'waterfall') && (
            <>
              <span>Lines</span>
              <span className="row wrap">
                <Select<Dash> value={d.dash} options={DASHES} onChange={(dash) => set({ dash })} />
                <Field label="Width">
                  <NumInput className="tiny" min={0.1} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.1, lineWidth || 1.2) })} />
                </Field>
              </span>
            </>
          )}
          {d.kind === 'waterfall' && (
            <>
              <span title="The curves filled down to the floor: all of them, the chosen ones, or none">Walls</span>
              <span className="row wrap">
                <Select<'all' | 'chosen' | 'none'>
                  value={!d.walls ? 'none' : (d.wallsOf ?? 'all')}
                  options={[
                    ['all', 'every curve'],
                    ['chosen', 'the chosen curves'],
                    ['none', 'none'],
                  ]}
                  onChange={(v) => set(v === 'none' ? { walls: false } : { walls: true, wallsOf: v === 'chosen' ? 'chosen' : undefined })}
                />
                {d.walls && (
                  <>
                    <Field label="Opacity">
                      <NumInput className="tiny" min={0} max={1} step={0.05} value={d.wallOpacity} onChange={(wallOpacity) => set({ wallOpacity: num(wallOpacity, 0, 1, 0.3) })} />
                    </Field>
                    <Field label="Colour" title="One colour for every wall (none: each its line's, or its own below)">
                      <OptColor value={d.wallColor ?? ''} none="the line’s" onChange={(wallColor) => set({ wallColor: wallColor || undefined })} />
                    </Field>
                  </>
                )}
              </span>
              {d.walls && swatches.length > 0 && (
                <>
                  <span title="Every curve: its wall shown (the chosen curves) and its own colour (none: the one above, else its line's)">Per curve</span>
                  <div className="wall-list">
                    {swatches.map((c, j) => (
                      <span key={c.key} className="row">
                        {d.wallsOf === 'chosen' && <Check label="" value={!!d.wallPick?.[j]} title="Its wall shown" onChange={(on) => set({ wallPick: swatches.map((_, q) => (q === j ? on : !!d.wallPick?.[q])) })} />}
                        <span className="grow ellipsis" title={c.label}>{c.label}</span>
                        <OptColor value={d.wallColors?.[j] ?? ''} none="default" onChange={(col) => {
                          const wallColors = swatches.map((_, q) => (q === j ? col : (d.wallColors?.[q] ?? '')));
                          set({ wallColors: wallColors.some(Boolean) ? wallColors : undefined });
                        }} />
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </details>
      <details>
        <summary>Box and axes</summary>
        <div className="col-form">
          {(['x', 'y', 'z'] as const).map((ax) => {
            const key = `${ax}Lim` as const;
            const l = d[key];
            const end = (k: 0 | 1, v: number) => {
              const nl: [number | null, number | null] = [l?.[0] ?? null, l?.[1] ?? null];
              nl[k] = Number.isFinite(v) ? v : null;
              set({ [key]: nl[0] === null && nl[1] === null ? undefined : nl });
            };
            return (
              <Fragment key={ax}>
                <span title={`The ${ax.toUpperCase()} axis from – to (empty: the data's); what is outside the box is cut. Also: Zoom and Rescale ${ax === 'z' ? '' : ax.toUpperCase()} above the figure`}>{ax.toUpperCase()} limits</span>
                <span className="row">
                  <NumInput className="short" value={l?.[0] ?? NaN} placeholder="auto" onChange={(v) => end(0, v)} />
                  <span>–</span>
                  <NumInput className="short" value={l?.[1] ?? NaN} placeholder="auto" onChange={(v) => end(1, v)} />
                </span>
              </Fragment>
            );
          })}
          <span title="The three walls at the back, their grid">Walls</span>
          <span className="row wrap">
            <OptColor value={d.panes} none="none" title="Their colour" onChange={(panes) => set({ panes })} />
            <Field label="Grid">
              <OptColor value={d.gridColor} none="none" onChange={(gridColor) => set({ gridColor })} />
            </Field>
          </span>
          {d.gridColor && (
            <>
              <span title="The grid on the three walls or only on the floor; dashed lines halfway between its lines">Grid on</span>
              <span className="row wrap">
                <Select<NonNullable<Plot3DSpec['gridWalls']>>
                  value={d.gridWalls ?? 'all'}
                  options={[
                    ['all', 'every wall'],
                    ['floor', 'the floor only'],
                  ]}
                  onChange={(gridWalls) => set({ gridWalls })}
                />
                <Check label="Halfway lines" title="Dashed lines halfway between the grid's lines" value={!!d.gridMinor} onChange={(gridMinor) => set({ gridMinor })} />
              </span>
            </>
          )}
          {d.kind === 'waterfall' && (
            <>
              <span title="The labels of the depth axis: its values, the curves' names at their depths, or typed (comma-separated, in the curves' order; an empty one between commas: no label; the curves after the last typed: their values)">Depth labels</span>
              <span className="row">
                <Select<NonNullable<Plot3DSpec['depthLabels']>>
                  value={d.depthLabels ?? 'values'}
                  options={[
                    ['values', 'the values'],
                    ['names', 'the curves’ names'],
                    ['custom', 'typed'],
                  ]}
                  onChange={(depthLabels) => set({ depthLabels: depthLabels === 'values' ? undefined : depthLabels })}
                />
                {d.depthLabels === 'custom' && <TextInput className="grow" value={d.depthText ?? ''} placeholder="1 h, 2 h, 5 h …" title="Comma-separated, in the curves' order" onChange={(depthText) => set({ depthText: depthText || undefined })} />}
              </span>
            </>
          )}
          {layered && (
            <>
              <span title="The vertical axis: the layers' heights as numbers, their names at their heights, or nothing">Z axis</span>
              <Select<NonNullable<Plot3DSpec['layerAxis']>>
                value={d.layerAxis ?? 'values'}
                options={[
                  ['values', 'the heights'],
                  ['names', 'the layers’ names'],
                  ['none', 'nothing'],
                ]}
                onChange={(layerAxis) => set({ layerAxis })}
              />
            </>
          )}
          <span>Edges</span>
          <Select<Plot3DSpec['edges']>
            value={d.edges}
            options={[
              ['back', 'the walls’ edges'],
              ['all', 'the whole box'],
              ['none', 'none'],
            ]}
            onChange={(edges) => set({ edges })}
          />
          <span title="Empty: the data's names">Titles X, Y, Z</span>
          <span className="row wrap">
            <TextInput value={d.titleX} placeholder="X: auto" onChange={(titleX) => set({ titleX })} />
            <TextInput value={d.titleY} placeholder="Y: auto" onChange={(titleY) => set({ titleY })} />
            <TextInput value={d.titleZ} placeholder="Z: auto" onChange={(titleZ) => set({ titleZ })} />
          </span>
          <span>Values</span>
          <Field label="About" title="About this many values on every axis">
            <NumInput className="tiny" min={2} max={12} step={1} value={d.ticks} onChange={(ticks) => set({ ticks: Math.min(12, Math.max(2, Math.round(ticks) || 5)) })} />
          </Field>
        </div>
      </details>
      <details open={marks.length > 0 || drawing !== null}>
        <summary title="Lines, arrows, rectangles and points in the box, in the data's units (a missing height: the box's bottom or top), drawn with the mouse on the figure, or typed">Marks: lines, rectangles, points ({marks.length})</summary>
        <div className="mark-box">
          <span className="row wrap">
            <Field label="Draw on" title="Where the clicks fall: free (a data point near the mouse, else the surface, else the floor), or on a plane: exactly under the mouse (a rectangle lies in it). The X wall: the back wall across Y and Z; the Y wall: across X and Z">
              <Select<DrawOn>
                value={drawOn}
                options={[
                  ['free', 'free (data, surface)'],
                  ['floor', 'the floor'],
                  ['xwall', 'the X wall'],
                  ['ywall', 'the Y wall'],
                  ['x', 'X ='],
                  ['y', 'Y ='],
                  ['z', 'Z ='],
                ]}
                onChange={setDrawOn}
              />
            </Field>
            {(drawOn === 'x' || drawOn === 'y' || drawOn === 'z') && <NumInput className="short" value={drawAt} placeholder="value" title={`The plane ${drawOn.toUpperCase()} = this value (a waterfall's curve: its depth)`} onChange={setDrawAt} />}
            <Field label="Snap" title="The points rounded to the grid of the axes (the plane's two axes; free: X and Y)">
              <Select<string>
                value={String(snap)}
                options={[
                  ['0', 'off'],
                  ['1', 'to the grid'],
                  ['0.5', 'to halves'],
                  ['0.1', 'to tenths'],
                ]}
                onChange={(v) => setSnap(Number(v))}
              />
            </Field>
          </span>
          <span className="row wrap" title="The new marks projected on these faces of the box (each can be changed afterwards)">
            <span className="muted">New marks projected on:</span>
            <Check label="floor" value={!!newProj.floor} onChange={(floor) => setNewProj({ ...newProj, floor })} />
            <Check label="X wall" value={!!newProj.x} onChange={(x) => setNewProj({ ...newProj, x })} />
            <Check label="Y wall" value={!!newProj.y} onChange={(y) => setNewProj({ ...newProj, y })} />
          </span>
          <span className="row wrap">
            {MARK_KINDS.map(([type, label, title]) => (
              <button key={type} className="nodrag" title={`${title}: then click on the figure (on the plane chosen in Draw on)`} onClick={() => addMark(type)}>
                + {label}
              </button>
            ))}
          </span>
          {marks.length > 0 && (
            <div className="mark-list">
              {marks.map((m, k) => {
                const n = (key: 'x1' | 'y1' | 'z1' | 'x2' | 'y2' | 'z2', label: string, ph = '') => (
                  <Field label={label}>
                    <NumInput className="short" value={m[key]} placeholder={ph} onChange={(v) => setMark(k, { [key]: v })} />
                  </Field>
                );
                const plane = m.plane ?? 'xy';
                const isLine = m.type === 'line' || m.type === 'arrow';
                const heads: [Head3D, string][] = [
                  ['none', 'none'],
                  ['arrow', 'arrow'],
                  ['open', 'open'],
                  ['bar', 'bar'],
                ];
                return (
                  <div key={m.id} className="mark-row">
                    <span className="row wrap">
                      <strong>{k + 1}</strong>
                      <Select<Mark3D['type']> value={m.type} options={MARK_KINDS.map(([t, l]): [Mark3D['type'], string] => [t, l])} onChange={(type) => setMark(k, { type })} />
                      <button className={`nodrag${drawing?.k === k ? ' on' : ''}`} title="Draw it again with the mouse on the figure" onClick={() => setDrawing(drawing?.k === k ? null : { k, step: 0 })}>
                        <Pencil {...IC} /> {drawing?.k === k ? `point ${drawing.step + 1} of ${pointsOf(m)}…` : 'Draw'}
                      </button>
                      <span className="grow" />
                      <button className="nodrag ts-btn" title="Remove" onClick={() => removeMark(k)}>
                        <X {...IC} />
                      </button>
                    </span>
                    <span className="row wrap">
                      {m.type === 'vline' && (
                        <>
                          {n('x1', 'X')}
                          {n('y1', 'Y')}
                          {n('z1', 'Z from', 'bottom')}
                          {n('z2', 'to', 'top')}
                        </>
                      )}
                      {isLine && (
                        <>
                          {n('x1', 'X₁')}
                          {n('y1', 'Y₁')}
                          {n('z1', 'Z₁', 'bottom')}
                          {n('x2', 'X₂')}
                          {n('y2', 'Y₂')}
                          {n('z2', 'Z₂', 'top')}
                        </>
                      )}
                      {m.type === 'point' && (
                        <>
                          {n('x1', 'X')}
                          {n('y1', 'Y')}
                          {n('z1', 'Z', 'bottom')}
                        </>
                      )}
                      {m.type === 'rect' && (
                        <>
                          <Select<NonNullable<Mark3D['plane']>>
                            value={plane}
                            title="Its plane: across X and Y at a height, across X and Z at a Y, across Y and Z at an X"
                            options={[
                              ['xy', 'X × Y (level)'],
                              ['xz', 'X × Z (upright)'],
                              ['yz', 'Y × Z (upright)'],
                            ]}
                            onChange={(p) => setMark(k, { plane: p })}
                          />
                          {plane !== 'yz' && n('x1', 'X')}
                          {plane !== 'yz' && n('x2', '…')}
                          {plane === 'yz' && n('x1', 'at X')}
                          {plane !== 'xz' && n('y1', 'Y')}
                          {plane !== 'xz' && n('y2', '…')}
                          {plane === 'xz' && n('y1', 'at Y')}
                          {n('z1', plane === 'xy' ? 'at Z' : 'Z', 'floor')}
                          {plane !== 'xy' && n('z2', '…', 'top')}
                        </>
                      )}
                    </span>
                    <span className="row wrap">
                      <input className="nodrag color" type="color" value={m.color || '#000000'} title="Colour" onChange={(e) => setMark(k, { color: e.target.value })} />
                      <Select<Dash> value={m.dash} options={DASHES} onChange={(dash) => setMark(k, { dash })} />
                      <NumInput className="tiny" min={0.1} step={0.25} value={m.width} title="Width, pt" onChange={(width) => setMark(k, { width: Math.max(0.1, width || 0.8) })} />
                      <Field label="Opacity">
                        <NumInput className="tiny" min={0} max={1} step={0.1} value={m.opacity ?? 1} onChange={(v) => setMark(k, { opacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />
                      </Field>
                      {isLine && (
                        <Field label="Heads" title="At its start and at its end; their size (pt)">
                          <span className="row">
                            <Select<Head3D> value={m.head1 ?? 'none'} options={heads} onChange={(head1) => setMark(k, { head1 })} />
                            <Select<Head3D> value={m.head2 ?? (m.type === 'arrow' ? 'arrow' : 'none')} options={heads} onChange={(head2) => setMark(k, { head2 })} />
                            <NumInput className="tiny" min={1} step={0.5} value={m.headSize ?? 5} onChange={(v) => setMark(k, { headSize: v > 0 ? v : undefined })} />
                          </span>
                        </Field>
                      )}
                      {m.type === 'rect' && (
                        <Field label="Fill" title="Its fill colour and opacity">
                          <span className="row">
                            <OptColor value={m.fill ?? ''} none="none" onChange={(fill) => setMark(k, { fill: fill || undefined })} />
                            {m.fill && <NumInput className="tiny" min={0} max={1} step={0.05} value={m.fillOpacity ?? 0.3} onChange={(v) => setMark(k, { fillOpacity: Number.isFinite(v) ? v : undefined })} />}
                          </span>
                        </Field>
                      )}
                      {m.type === 'point' && (
                        <>
                          <Select value={m.symbol ?? 'circle'} options={SYMBOLS} onChange={(symbol) => setMark(k, { symbol })} />
                          <NumInput className="tiny" min={0.5} step={0.5} value={m.size ?? 4} title="Its size, pt" onChange={(v) => setMark(k, { size: v > 0 ? v : undefined })} />
                          <Check label="Line to the floor" value={!!m.drop} onChange={(drop) => setMark(k, { drop: drop || undefined })} />
                        </>
                      )}
                    </span>
                    <span className="row wrap">
                      <Field label="Label" title="A text beside it (at its end, its corner, the point)">
                        <TextInput value={m.label ?? ''} placeholder="none" onChange={(label) => setMark(k, { label: label || undefined })} />
                      </Field>
                      {m.label && <NumInput className="tiny" min={4} step={1} value={m.labelSize ?? NaN} placeholder="size" title="Its size, pt (empty: the figure's)" onChange={(v) => setMark(k, { labelSize: v > 0 ? v : undefined })} />}
                    </span>
                    <span className="row wrap" title="Its shadow on these faces of the box (dashed, fainter): the floor, the back wall across X, the back wall across Y">
                      <span className="muted">Projected on:</span>
                      <Check label="floor" value={!!m.proj?.floor} onChange={(floor) => setMark(k, { proj: { ...m.proj, floor: floor || undefined } })} />
                      <Check label="X wall" value={!!m.proj?.x} onChange={(x) => setMark(k, { proj: { ...m.proj, x: x || undefined } })} />
                      <Check label="Y wall" value={!!m.proj?.y} onChange={(y) => setMark(k, { proj: { ...m.proj, y: y || undefined } })} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>
      </NodeOptions>
      {fig && <FigureView pick3d={pick3d} fig={fig} width={600} page={page} setPage={(p) => set({ page: { ...page, ...p } })} layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move." />}
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
