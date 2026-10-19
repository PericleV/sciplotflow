// Contour / heatmap: the data (X, Y, Z columns or a matrix; or X, Y points counted — a 2D histogram — or their density;
// U, V vectors as arrows or streamlines, their speed as the map), what is drawn (heatmap, filled levels, lines), the levels,
// the colour map and its range, the lines and their values, the colour bar, the profiles; the figure with the same tabs
// as a Plot. A matrix on the matrix port: drawn as its cells (the Matrix section instead of Data).
import { Fragment, useState, type ReactNode } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import type { MatrixPlotSpec } from '../engine/matrixplot.ts';
import { sizeText } from './matrixText.ts';
import { useNodeResult } from '../engine/engine.ts';
import type { NodeResult } from '../engine/evaluate.ts';
import { profileList, type ContourProfile, type ContourSpec } from '../engine/contour.ts';
import { fmtNum } from '../engine/table.ts';
import { MATRIX_PLOT_DEFAULTS, PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import type { ColorMapName, Dash } from '../figure/spec.ts';
import { DASHES } from './figureOptions.ts';
import type { AppNode, ContourData, ContourNode, PlotPage } from '../types.ts';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { OptColor } from './fields.tsx';
import { FigureTabs, InsetsPort, type FigureParts } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { HideControls } from './HideControls.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { Crosshair, X } from 'lucide-react';
import { IC } from './iconProps.ts';

export function ContourNodeView({ id, data: d }: NodeProps<ContourNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<ContourData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const info = r?.view.contour;
  // a matrix on its port: drawn as its cells, with the Matrix section instead of Data
  const onMatrix = useNodeConnections({ handleType: 'target', handleId: 'matrix' }).length > 0;
  const mat = r?.view.matrix;
  return (
    <ContourBody
      id={id}
      d={d}
      set={set}
      r={r}
      className="node node-plot1d node-contour"
      input={
        <>
          <InPort label="dataset" port="dataset" id="dataset" title="X, Y, Z columns (a grid or scattered points), or a Y column and Z columns named by their X" />
          <InPort label="matrix" port="matrix" id="matrix" title="Or a matrix (Matrix, or a result of Matrix computation): drawn as its cells">
            <span className="muted">{mat ? sizeText(mat) : 'or connect a matrix'}</span>
          </InPort>
          <InPort label="overlay" port="dataset" id="overlay" title="Optional: curves drawn over the map — every Y of a dataset with its X (a path, measured points …) as lines and symbols" />
        </>
      }
      data={
      onMatrix ? (
        <MatrixSection d={{ ...MATRIX_PLOT_DEFAULTS, ...d }} set={set} />
      ) : (
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>The data</span>
          <Select<ContourSpec['layout']>
            value={d.layout}
            options={[
              ['xyz', 'X, Y, Z columns'],
              ['matrix', 'a matrix (Z columns named by X)'],
            ]}
            onChange={(layout) => set({ layout })}
          />
          {d.layout === 'xyz' ? (
            <>
              <span>Map from</span>
              <Select<NonNullable<ContourSpec['zFrom']>>
                value={d.zFrom ?? 'column'}
                title="The values of the map: a Z column; the X, Y points counted in square bins (a 2D histogram); their density (smooth: a Gaussian kernel); the speed of the vectors (U, V below); or no map (the points or the vectors alone)"
                options={[
                  ['column', 'a Z column'],
                  ['count', 'the points counted (2D histogram)'],
                  ['density', 'the density of the points'],
                  ['speed', 'the speed of the vectors'],
                  ['none', 'no map'],
                ]}
                onChange={(zFrom) => set({ zFrom: zFrom === 'column' ? undefined : zFrom })}
              />
              <span>{(d.zFrom ?? 'column') === 'column' ? 'X, Y, Z' : 'X, Y'}</span>
              <span className="row wrap">
                <Select value={d.x} title="X" options={[['', 'auto X'], ...cols]} onChange={(x) => set({ x })} />
                <Select value={d.y} title="Y" options={[['', 'auto Y'], ...cols]} onChange={(y) => set({ y })} />
                {(d.zFrom ?? 'column') === 'column' && <Select value={d.z} title="Z" options={[['', 'auto Z'], ...cols]} onChange={(z) => set({ z })} />}
              </span>
              {d.zFrom === 'count' && (
                <>
                  <span>Bins</span>
                  <Field label="a side" title="The range of X and of Y cut into this many bins">
                    <NumInput className="tiny" min={2} max={500} step={5} value={d.bins ?? 30} onChange={(bins) => set({ bins: Math.min(500, Math.max(2, Math.floor(bins) || 30)) })} />
                  </Field>
                </>
              )}
              {d.zFrom === 'density' && (
                <>
                  <span>Width</span>
                  <Field label="× Scott" title="The width of the kernel on each axis, as a multiple of Scott's rule (smaller: more detail, more noise)">
                    <NumInput className="tiny" min={0.05} step={0.1} value={d.bandScale ?? 1} onChange={(v) => set({ bandScale: v > 0 ? v : undefined })} />
                  </Field>
                </>
              )}
              <span>Points</span>
              <Check label="Drawn over the map" value={!!d.showPoints} onChange={(showPoints) => set({ showPoints: showPoints || undefined })} />
              <span>Vectors</span>
              <span className="row wrap">
                <Select<NonNullable<ContourSpec['vectors']>>
                  value={d.vectors ?? 'none'}
                  title="A vector at every X, Y (U, V columns): drawn as arrows, or as streamlines following it"
                  options={[
                    ['none', 'none'],
                    ['arrows', 'arrows'],
                    ['stream', 'streamlines'],
                  ]}
                  onChange={(vectors) => set({ vectors: vectors === 'none' ? undefined : vectors })}
                />
                {d.vectors && d.vectors !== 'none' && (
                  <>
                    <Select value={d.u ?? ''} title="U: the vector along X" options={[['', 'U …'], ...cols]} onChange={(u) => set({ u })} />
                    <Select value={d.v ?? ''} title="V: the vector along Y" options={[['', 'V …'], ...cols]} onChange={(v) => set({ v })} />
                  </>
                )}
              </span>
              {d.vectors === 'arrows' && (
                <>
                  <span />
                  <span className="row wrap">
                    <Field label="Every" title="An arrow on every N-th point of the grid (empty: about 20 a side)">
                      <NumInput className="tiny" min={1} step={1} value={d.vecEvery ?? NaN} placeholder="auto" onChange={(v) => set({ vecEvery: v >= 1 ? Math.floor(v) : undefined })} />
                    </Field>
                    <Field label="Length" title="The longest arrow, in steps between two arrows">
                      <NumInput className="tiny" min={0.1} step={0.1} value={d.vecLength ?? 0.9} onChange={(v) => set({ vecLength: v > 0 ? v : undefined })} />
                    </Field>
                  </span>
                </>
              )}
              {d.vectors === 'stream' && (
                <>
                  <span />
                  <Field label="Density" title="How close the streamlines run (1: about 30 a side)">
                    <NumInput className="tiny" min={0.2} max={4} step={0.1} value={d.vecDensity ?? 1} onChange={(v) => set({ vecDensity: v > 0 ? Math.min(4, v) : undefined })} />
                  </Field>
                </>
              )}
              {d.vectors && d.vectors !== 'none' && (
                <>
                  <span />
                  <span className="row wrap">
                    <OptColor value={d.vecColor ?? ''} none="auto" title="Their colour (auto: white over a map, else black)" onChange={(vecColor) => set({ vecColor: vecColor || undefined })} />
                    <NumInput className="tiny" min={0.1} step={0.25} value={d.vecWidth ?? 0.75} title="Their width, pt" onChange={(v) => set({ vecWidth: v > 0 ? v : undefined })} />
                  </span>
                </>
              )}
              <span>Scattered</span>
              <Field label="Grid of" title="Points not on a grid: Z interpolated linearly on their Delaunay triangles to a grid of this many points a side">
                <NumInput className="tiny" min={10} max={400} step={10} value={d.grid} onChange={(grid) => set({ grid: Math.min(400, Math.max(10, Math.floor(grid) || 100)) })} />
              </Field>
            </>
          ) : (
            <>
              <span>Y</span>
              <Select value={d.yCol} options={[['', 'auto: the X designated, else the first'], ...cols]} onChange={(yCol) => set({ yCol })} />
              <span>Z columns</span>
              <ColumnsPicker value={d.zs} names={names} auto="auto: all the others" title="Every Z column's name holds its X (“400 nm”, “410” …)" onChange={(zs) => set({ zs })} />
              <span>X title</span>
              <TextInput value={d.xTitle ?? ''} placeholder="auto: from the names (e.g. X (nm))" onChange={(xTitle) => set({ xTitle })} />
            </>
          )}
          {info && (
            <>
              <span>Grid</span>
              <span className="muted">
                {info.nx} × {info.ny}; X {fmtNum(info.x[0], 4)} … {fmtNum(info.x[1], 4)}, Y {fmtNum(info.y[0], 4)} … {fmtNum(info.y[1], 4)}
              </span>
            </>
          )}
        </div>
      </details>
      )
      }
    />
  );
}

// A matrix drawn: its axes (the numbers or its X, Y), where row 1 goes, square cells, the values in the cells.
function MatrixSection({ d, set }: { d: MatrixPlotSpec; set: (p: Partial<MatrixPlotSpec>) => void }) {
  return (
    <details open>
      <summary>Matrix</summary>
      <div className="col-form">
        <span>Axes from</span>
        <Select<MatrixPlotSpec['axesFrom']>
          value={d.axesFrom}
          title="The cells at the column and row numbers, or at the X of the columns and the Y of the rows of the matrix (a matrix made from a map)"
          options={[
            ['index', 'the column and row numbers'],
            ['coords', 'the X and Y of the matrix'],
          ]}
          onChange={(axesFrom) => set({ axesFrom })}
        />
        <span>Row 1</span>
        <span className="row wrap">
          <Select<MatrixPlotSpec['rowOne']>
            value={d.rowOne}
            options={[
              ['top', 'at the top (as written)'],
              ['bottom', 'at the bottom (as a map)'],
            ]}
            onChange={(rowOne) => set({ rowOne })}
          />
          <Check label="Square cells" title="A cell as wide as it is high (1 unit of Y = 1 unit of X)" value={d.square} onChange={(square) => set({ square })} />
          {d.axesFrom === 'index' && <Check label="Names on the axes" title="The names of the rows and columns (a matrix from a dataset: its columns' names) at their numbers" value={d.names} onChange={(names) => set({ names })} />}
        </span>
        <span>Values in the cells</span>
        <span className="row wrap">
          <Check label="Shown" value={d.cellValues} onChange={(cellValues) => set({ cellValues })} />
          {d.cellValues && (
            <>
              <Field label="Decimals">
                <NumInput className="tiny" min={0} max={8} step={1} value={d.cellDecimals} placeholder="auto" onChange={(cellDecimals) => set({ cellDecimals: Number.isFinite(cellDecimals) ? Math.max(0, Math.floor(cellDecimals)) : NaN })} />
              </Field>
              <Field label="pt">
                <NumInput className="tiny" min={3} step={0.5} value={d.cellSize} placeholder="auto" onChange={(cellSize) => set({ cellSize: cellSize > 0 ? cellSize : NaN })} />
              </Field>
              <OptColor value={d.cellColor} none="auto (black / white)" title="Auto: black or white by the colour under the value" onChange={(cellColor) => set({ cellColor })} />
            </>
          )}
        </span>
      </div>
    </details>
  );
}

// The drawing (heatmap, levels, lines, colours, hidden values, colour bar, profiles), the figure and its tabs, the
// outputs — the same for a dataset and a matrix. input, data: the input ports and the Data or Matrix section.
type ContourLike = ContourSpec & FigureParts;
export function ContourBody({ id, d, set, r, className, input, data }: { id: string; d: ContourLike; set: (p: Partial<ContourLike>) => void; r: NodeResult | undefined; className: string; input: ReactNode; data: ReactNode }) {
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const info = r?.view.contour;
  const lines = d.draw === 'lines' || d.draw === 'heatLines' || d.draw === 'filledLines';
  const leveled = lines || d.draw === 'filled' || d.draw === 'filledLines';
  // the profiles (those of projects before the list read from their two fields); the one placed with the mouse
  const profs = profileList(d);
  const setProfs = (profileList: ContourProfile[]) => set({ profileList });
  const setProf = (pid: string, p: Partial<ContourProfile>) => setProfs(profs.map((q) => (q.id === pid ? { ...q, ...p } : q)));
  const [placing, setPlacing] = useState<string | null>(null);
  const placed = profs.find((p) => p.id === placing);
  const mid = (r?: [number, number]) => (r ? (r[0] + r[1]) / 2 : NaN);
  const addProf = () => {
    const along = profs.length % 2 ? 'column' : 'row';
    const colors = ['#ffffff', '#000000', '#E69F00', '#56B4E9', '#D55E00', '#009E73'];
    let n = profs.length + 1;
    while (profs.some((p) => p.id === `p${n}`)) n++;
    setProfs([...profs, { id: `p${n}`, along, at: mid(along === 'row' ? info?.y : info?.x), show: false, color: colors[profs.length % colors.length], dash: 'dash', width: 1 }]);
  };
  return (
    <div className={className}>
      {input}
      <NodeOptions>
      {data}
      <details open>
        <summary>Contour / heatmap</summary>
        <div className="col-form">
          <span>Draw</span>
          <span className="row wrap">
            <Select<ContourSpec['draw']>
              value={d.draw}
              options={[
                ['heat', 'heatmap'],
                ['filled', 'filled levels'],
                ['lines', 'contour lines'],
                ['heatLines', 'heatmap + lines'],
                ['filledLines', 'filled levels + lines'],
              ]}
              onChange={(draw) => set({ draw })}
            />
            {(d.draw === 'heat' || d.draw === 'heatLines') && <Check label="Smooth" title="Bilinear between the points, instead of sharp cells" value={d.smooth} onChange={(smooth) => set({ smooth })} />}
            <Select<NonNullable<ContourSpec['render']>>
              value={d.render ?? 'all'}
              title="All the cells, or fast: the grid averaged into fewer cells to draw (the outputs keep all the data)"
              options={[
                ['all', 'all the data'],
                ['fast', 'fast'],
              ]}
              onChange={(render) => set({ render })}
            />
            {d.render === 'fast' && (
              <Field label="Cells" title="At most this many cells a side are drawn">
                <NumInput className="tiny" min={20} max={2000} step={50} value={d.fastCells ?? 300} onChange={(fastCells) => set({ fastCells: Math.min(2000, Math.max(20, Math.floor(fastCells) || 300)) })} />
              </Field>
            )}
          </span>
          <span>Colours</span>
          <span className="row wrap">
            <Select<ColorMapName> value={d.cmap} options={CMAP_OPTIONS} onChange={(cmap) => set({ cmap })} />
            {d.cmap === 'custom' &&
              [0, 1, 2].map((k) => (
                <input key={k} className="nodrag color" type="color" value={d.cmapColors[k] || '#ffffff'} onChange={(e) => set({ cmapColors: Object.assign([...d.cmapColors], { [k]: e.target.value }) })} />
              ))}
            <Check label="Reversed" value={d.reverse} onChange={(reverse) => set({ reverse })} />
            <Check label="Log Z" value={d.log} onChange={(log) => set({ log })} />
          </span>
          <span>Z range</span>
          <span className="row wrap">
            <NumInput className="short" value={d.zMin} placeholder="auto" onChange={(zMin) => set({ zMin })} />–<NumInput className="short" value={d.zMax} placeholder="auto" onChange={(zMax) => set({ zMax })} />
            <Field label="Missing" title="The colour of the cells without a value (none: not drawn)">
              <OptColor value={d.nanColor} none="none" onChange={(nanColor) => set({ nanColor })} />
            </Field>
          </span>
          <HideControls value={d.hide} onChange={(hide) => set({ hide })} />
          {leveled && (
            <>
              <span>Levels</span>
              <span className="row wrap">
                <Select<ContourSpec['levels']>
                  value={d.levels}
                  options={[
                    ['auto', 'nice values, about'],
                    ['count', 'this many, even'],
                    ['step', 'every'],
                    ['list', 'at the values'],
                  ]}
                  onChange={(levels) => set({ levels })}
                />
                {(d.levels === 'auto' || d.levels === 'count') && <NumInput className="tiny" min={2} max={100} step={1} value={d.nLevels} onChange={(nLevels) => set({ nLevels: Math.min(100, Math.max(2, Math.floor(nLevels) || 8)) })} />}
                {d.levels === 'step' && <NumInput className="short" value={d.step} placeholder="e.g. 0.1" onChange={(step) => set({ step })} />}
                {d.levels === 'list' && <TextInput value={d.list} placeholder="0.2, 0.5, 0.9" onChange={(list) => set({ list })} />}
              </span>
            </>
          )}
          {lines && (
            <>
              <span>Lines</span>
              <span className="row wrap">
                <OptColor value={d.lineColor} none="auto" title="Auto: by the map (lines alone), black over a map" onChange={(lineColor) => set({ lineColor })} />
                <Field label="Width">
                  <NumInput className="tiny" min={0.1} step={0.1} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.1, lineWidth || 0.6) })} />
                </Field>
                <Select<Dash> value={d.lineDash ?? 'solid'} title="The line of every level" options={DASHES} onChange={(lineDash) => set({ lineDash })} />
                <Check label="Below 0 dashed" title="The levels below 0 dashed" value={!!d.negDash} onChange={(negDash) => set({ negDash })} />
              </span>
              <span>Line values</span>
              <span className="row wrap">
                <Check label="Shown" title="The level written on its line" value={d.lineLabels} onChange={(lineLabels) => set({ lineLabels })} />
                {d.lineLabels && (
                  <>
                    <Field label="Every" title="On every N-th level (1: all)">
                      <NumInput className="tiny" min={1} step={1} value={d.labelEvery ?? 1} onChange={(labelEvery) => set({ labelEvery: Math.max(1, Math.floor(labelEvery) || 1) })} />
                    </Field>
                    <Field label="Decimals">
                      <NumInput className="tiny" min={0} max={8} step={1} value={d.labelDecimals} placeholder="auto" onChange={(labelDecimals) => set({ labelDecimals: Number.isFinite(labelDecimals) ? Math.max(0, Math.floor(labelDecimals)) : NaN })} />
                    </Field>
                    <Field label="pt">
                      <NumInput className="tiny" min={3} step={0.5} value={d.labelSize ?? NaN} placeholder="auto" onChange={(labelSize) => set({ labelSize: labelSize > 0 ? labelSize : undefined })} />
                    </Field>
                    <OptColor value={d.labelColor ?? ''} none="as the line" onChange={(labelColor) => set({ labelColor })} />
                  </>
                )}
              </span>
            </>
          )}
          <span>Colour bar</span>
          <span className="row wrap">
            <Check label="Shown" value={d.colorbar} onChange={(colorbar) => set({ colorbar })} />
            {d.colorbar && <TextInput value={d.zTitle} placeholder="title: the Z column's name" onChange={(zTitle) => set({ zTitle })} />}
          </span>
          {profs.map((p, k) => (
            <Fragment key={p.id}>
              <span>Profile {k + 1}</span>
              <span className="row wrap">
                <Select<ContourProfile['along']>
                  value={p.along}
                  title="A row: Z along X at a Y (the row output); a column: Z along Y at an X (the column output)"
                  options={[
                    ['row', 'row at Y'],
                    ['column', 'column at X'],
                  ]}
                  onChange={(along) => setProf(p.id, { along })}
                />
                <NumInput className="short" value={p.at} placeholder="none" title="Where: the nearest row (Y) or column (X) of the grid" onChange={(at) => setProf(p.id, { at })} />
                <button className={`nodrag ts-btn${placing === p.id ? ' on' : ''}`} title="Place it with the mouse: click or drag on the map (again: stop)" onClick={() => setPlacing(placing === p.id ? null : p.id)}>
                  <Crosshair {...IC} />
                </button>
                <Check label="On the map" title="Its line drawn on the map (else only the output)" value={p.show} onChange={(show) => setProf(p.id, { show })} />
                {p.show && (
                  <>
                    <input className="nodrag color" type="color" title="The line's colour" value={p.color || '#ffffff'} onChange={(e) => setProf(p.id, { color: e.target.value })} />
                    <Select<Dash> value={p.dash} title="The line" options={DASHES} onChange={(dash) => setProf(p.id, { dash })} />
                    <NumInput className="tiny" min={0.25} step={0.25} title="The line's width (pt)" value={p.width} onChange={(width) => setProf(p.id, { width: Math.max(0.25, width || 1) })} />
                  </>
                )}
                <button className="nodrag ts-btn" title="Remove it" onClick={() => setProfs(profs.filter((q) => q.id !== p.id))}>
                  <X {...IC} />
                </button>
              </span>
            </Fragment>
          ))}
          <span>{profs.length ? '' : 'Profiles'}</span>
          <span className="row wrap">
            <button className="nodrag" title="Z along a row (or a column) of the map: a line on the map and the row (column) output" onClick={addProf}>
              + Profile
            </button>
          </span>
        </div>
      </details>
      </NodeOptions>
      {fig && (
        <FigureView
          fig={fig}
          width={600}
          page={page}
          setPage={(p) => set({ page: { ...page, ...p } })}
          layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move."
          place={
            placed
              ? {
                  curve: fig.axes[0]?.curves[0]?.key ?? '',
                  sorted: false,
                  points: Number.isFinite(placed.at) ? [placed.along === 'row' ? [mid(info?.x), placed.at] : [placed.at, mid(info?.y)]] : [],
                  onPoints: (pts) => {
                    const q = pts[pts.length - 1];
                    if (q) setProf(placed.id, { at: +(placed.along === 'row' ? q[1] : q[0]).toPrecision(6) });
                  },
                }
              : undefined
          }
        />
      )}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={r?.view.legendCurves ?? []} pos={fig?.axes[0]?.style.pos} port={false} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, or as an inset of a Plot" />
      <OutPort label="grid" port="dataset" id="grid" title="The grid drawn: X, Y, Z (a row a point)" />
      {profs.some((p) => p.along === 'row' && Number.isFinite(p.at)) && <OutPort label="row" port="dataset" id="row" title="The row profiles: X and Z along it at every Y chosen (a column each)" />}
      {profs.some((p) => p.along === 'column' && Number.isFinite(p.at)) && <OutPort label="column" port="dataset" id="column" title="The column profiles: Y and Z along it at every X chosen (a column each)" />}
    </div>
  );
}
