// Figure nodes: 1D plot — a whole figure: its curves (data and style), axes, legend, annotations and page — and
// Merge, several Plots on one page.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useNodeConnections, useNodesData, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { plotRows } from '../engine/evaluate.ts';
import { rowHandle } from '../engine/ports.ts';
import { curvesByRole, titleOf } from '../engine/table.ts';
import type { ColInfo } from '../engine/evaluate.ts';
import { CMAP_OPTIONS, PALETTES } from '../figure/colors.ts';
import type { ColorMapName } from '../figure/spec.ts';
import { curveStyle, type Curve, type CurveStyle, type PanelScheme } from '../figure/spec.ts';
import { CANVAS_LAYOUT_DEFAULTS, PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, CanvasData, CanvasItem, CanvasLayout, CanvasNode, CurveCols, CurveRow, PageData, Plot1DData, Plot1DNode, PlotPage } from '../types.ts';
import { nodeDisplayName } from '../nodeColors.ts';
import { copyCurveStyle, curveClip, useClipboard } from './clipboard.ts';
import { OptColor, RichInput, Tabs, TextStyleControls } from './fields.tsx';
import { CurveStyleEditor } from './CurveStyleEditor.tsx';
import { QuickFitControls } from './QuickFitControls.tsx';
import { flashLater, useFigureFocus } from './figureFocus.ts';
import { QuickFitResults } from './QuickFitResults.tsx';
import { quickFitsOf, type QuickFitSpec } from '../engine/quickfit.ts';
import { AggregateControls } from './AggregateControls.tsx';
import { AnnotationsEditor } from './AnnotationsEditor.tsx';
import { FigureView, PageControls } from './FigureView.tsx';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { parsePoints, pointsText } from './points.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { maxOf } from '../engine/minmax.ts';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ClipboardPaste, Copy, CopyPlus, X } from 'lucide-react';
import { IC } from './iconProps.ts';

// ---- 1D plot ----

// the width of the figure drawn in a Plot node (the node is 640 px wide)
const PLOT_W = 600;

// A column of a dataset chosen for a curve: the list built when the picker is opened (a Plot of many curves, beside a
// dataset of many columns, has thousands of them), only the column chosen before that.
function ColPick({ value, list, first, title, onChange }: { value: string; list: string[]; first: string; title: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const shown = open ? list : value && list.includes(value) ? [value] : [];
  return (
    <select className="nodrag col-pick" value={value} title={title} onPointerDown={() => setOpen(true)} onFocus={() => setOpen(true)} onChange={(e) => onChange(e.target.value)}>
      <option value="">{first}</option>
      {value && !list.includes(value) && <option value={value}>{value} (missing)</option>}
      {shown.map((nm) => (
        <option key={nm} value={nm}>
          {nm}
        </option>
      ))}
    </select>
  );
}

export function Plot1DNodeView({ id, data }: NodeProps<Plot1DNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const conns = useNodeConnections({ handleType: 'target' });
  const clip = curveClip(useClipboard());
  const [open, setOpen] = useState<number | null>(null);
  // the curve whose fill points are being placed on the figure
  const [placing, setPlacing] = useState<number | null>(null);
  // the quick fit whose ranges the figure's ↔ Add a range adds to, and the one whose peaks are placed on the figure
  const [qfDraw, setQfDraw] = useState<{ k: number; j: number } | null>(null);
  const [qfPlace, setQfPlace] = useState<{ k: number; j: number } | null>(null);
  const [adding, setAdding] = useState(false);
  // the curves folded to their head (their ports hidden, still connected): each as chosen, else all above 6 curves
  const [fold, setFold] = useState<Record<number, boolean>>({});
  // the same in the options panel: a curve folded to its head (its columns, fits and style hidden)
  const [pfold, setPfold] = useState<Record<number, boolean>>({});
  // a curve double-clicked on the figure (or its quick fit's range): its style opened, its row flashed
  const [flash, setFlash] = useState<{ k: number; seq: number } | null>(null);
  useFigureFocus(id, (part, seq) => {
    const m = /^curve:[^:]+:(\d+)/.exec(part);
    if (!m) return;
    const k = Number(m[1]);
    setOpen(k);
    setFold((f) => ({ ...f, [k]: false }));
    setFlash({ k, seq });
    flashLater(seq);
  });
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...data.page };
  const setPage = (p: Partial<PlotPage>) => updateNodeData(id, { page: { ...page, ...p } });
  const hasData = conns.some((c) => c.targetHandle === 'dataset');
  const names = (r?.view.available ?? []).map((c) => c.name);
  // a workbook on the dataset port: its sheets (each curve takes its columns from one)
  const sheets = r?.view.sheets ?? [];
  // rows in use (a connection, or a Y chosen from the dataset), and one free row for a new curve
  const stored = plotRows(data, 1 + (data.rows?.length ?? 0));
  const used = [
    ...conns.filter((c) => c.targetHandle !== 'dataset').map((c) => {
      const m = /-(\d+)$/.exec(c.targetHandle ?? '');
      return m ? Number(m[1]) : 0;
    }),
    ...stored.flatMap((row, k) => (row.cols?.y ? [k] : [])),
  ];
  // the curves: those used (connected, or a Y chosen) and those added with + Add curve (kept in the data)
  const count = Math.max(1, maxOf(used.map((u) => u + 1)), stored.length);
  const rows = plotRows(data, count);
  const curves = useMemo(() => r?.view.curves ?? [], [r]);
  // the first curve of each row (a split row gives several: keys `plot:row#group`)
  const byRow = new Map<number, Curve>();
  for (const c of curves) {
    const m = /:(\d+)(?:#\d+)?$/.exec(c.key);
    if (m && !byRow.has(Number(m[1]))) byRow.set(Number(m[1]), c);
  }
  const connected = (h: string) => conns.some((c) => c.targetHandle === h);
  const setRow = (k: number, patch: Partial<CurveRow>) => {
    if (k === 0) {
      updateNodeData(id, patch as Partial<Plot1DData>);
      return;
    }
    const all = plotRows(data, Math.max(count, k + 1)).slice(1);
    all[k - 1] = { ...all[k - 1], ...patch };
    updateNodeData(id, { rows: all } as Partial<Plot1DData>);
  };
  const setCol = (k: number, part: keyof CurveCols, name: string) => setRow(k, { cols: { ...rows[k].cols, [part]: name || undefined } });
  // a curve taken out: its connections go, the curves after it move up one row (their ports renamed)
  const removeRow = (k: number) => {
    const all = plotRows(data, count).filter((_, j) => j !== k);
    const [head, ...rest] = all.length ? all : [{ label: '', style: data.style }];
    updateNodeData(id, { label: head.label, style: head.style, cols: head.cols, sheet: head.sheet, rowSel: head.rowSel, trend: head.trend, aggregate: head.aggregate, quickFits: head.quickFits, rows: rest } as Partial<Plot1DData>);
    setEdges((es) =>
      es.flatMap((e) => {
        if (e.target !== id || !e.targetHandle || e.targetHandle === 'dataset') return [e];
        const m = /^([a-z]+?)(?:-(\d+))?$/.exec(e.targetHandle);
        if (!m) return [e];
        const j = m[2] ? Number(m[2]) : 0;
        if (j === k) return [];
        if (j < k) return [e];
        const h = rowHandle(m[1] as Parameters<typeof rowHandle>[0], j - 1);
        return [{ ...e, id: `${e.id}~${h}`, targetHandle: h }];
      }),
    );
    setOpen(null);
  };
  // the curves rearranged: order[j] = the curve (its place before) now at j — a place twice: a copy, below the first.
  // With them go their connections (a copy gets the same), the legend entries kept by their number, and the fills to
  // another curve (by its number).
  const rearrange = (order: number[]) => {
    const all = plotRows(data, count);
    const to = new Map<number, number>();
    order.forEach((old, j) => !to.has(old) && to.set(old, j));
    const renum = (n: number) => (to.has(n - 1) ? to.get(n - 1)! + 1 : n);
    const next = order.map((old) => {
      const row = all[old];
      const st = row.style;
      return st.fill === 'curve' && st.fillCurve ? { ...row, style: { ...st, fillCurve: renum(st.fillCurve) } } : row;
    });
    const [head, ...rest] = next;
    const key = (k: string) => {
      const m = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)(#.*)?$`).exec(k);
      return m && to.has(Number(m[1])) ? `${id}:${to.get(Number(m[1]))}${m[2] ?? ''}` : k;
    };
    const legend = data.legend?.entries ? { ...data.legend, entries: data.legend.entries.map((e) => ({ ...e, key: key(e.key) })) } : data.legend;
    updateNodeData(id, { label: head.label, style: head.style, cols: head.cols, sheet: head.sheet, rowSel: head.rowSel, trend: head.trend, aggregate: head.aggregate, quickFits: head.quickFits, rows: rest, ...(legend ? { legend } : {}) } as Partial<Plot1DData>);
    setEdges((es) =>
      es.flatMap((e) => {
        if (e.target !== id || !e.targetHandle || e.targetHandle === 'dataset' || e.targetHandle === 'insets') return [e];
        const m = /^([a-z]+?)(?:-(\d+))?$/.exec(e.targetHandle);
        if (!m) return [e];
        const old = m[2] ? Number(m[2]) : 0;
        const places = order.flatMap((o, j) => (o === old ? [j] : []));
        return places.map((j) => {
          const h = rowHandle(m[1] as Parameters<typeof rowHandle>[0], j);
          return h === e.targetHandle ? e : { ...e, id: `${e.id}~${h}`, targetHandle: h };
        });
      }),
    );
    setOpen(null);
  };
  const moveRow = (k: number, by: -1 | 1) => {
    const order = rows.map((_, j) => j);
    [order[k], order[k + by]] = [order[k + by], order[k]];
    rearrange(order);
  };
  const duplicateRow = (k: number) => rearrange([...rows.map((_, j) => j).slice(0, k + 1), k, ...rows.map((_, j) => j).slice(k + 1)]);
  // add curves from the dataset: each chosen column a Y (or the curves of the designations), in the free rows
  // curves added: their columns (and the sheet they come from, of a workbook)
  const addCurves = (ys: (string | CurveCols)[], sheet?: string) => {
    const all = plotRows(data, count + ys.length);
    let k = all.findIndex((row, j) => !row.cols?.y && !conns.some((c) => c.targetHandle !== 'dataset' && (c.targetHandle ?? '').replace(/^[a-z]+/, '') === (j ? `-${j}` : '')));
    if (k < 0) k = count;
    for (const y of ys) {
      while (all[k]?.cols?.y) k++;
      all[k] = { ...all[k], cols: { ...all[k].cols, ...(typeof y === 'string' ? { y } : y) }, ...(sheet ? { sheet } : {}) };
      k++;
    }
    // no empty curve left after the ones added
    const [head, ...rest] = all.slice(0, Math.max(k, count));
    updateNodeData(id, { cols: head.cols, ...(head.sheet ? { sheet: head.sheet } : {}), rows: rest } as Partial<Plot1DData>);
    setAdding(false);
  };
  // a column picker of the dataset, beside a port that is not connected
  // a column picker beside a port that is not connected: the columns of the curve's own dataset (its data port), else
  // those of the Plot's dataset
  const pick = (k: number, part: keyof CurveCols, handle: string, fallback: ReactNode) => {
    // its own dataset on its data port (a sheet's columns: chosen as the Plot's)
    const own = r?.view.rowAvail?.[k] && connected(rowHandle('series', k)) ? r.view.rowAvail[k] : undefined;
    const avail = r?.view.rowAvail?.[k];
    const list = avail ? avail.map((c) => c.name) : names;
    if (!(own || hasData) || connected(handle)) return fallback;
    return (
      <ColPick
        value={rows[k].cols?.[part] ?? ''}
        list={list}
        first={own ? (part === 'y' || part === 'x' ? 'from the data (designated)' : 'from the data, else none') : part === 'y' ? 'choose' : part === 'x' && k > 0 ? 'as curve 1' : part === 'x' ? 'row number' : 'none'}
        title={own ? 'A column of the dataset on the data port of this curve (or connect a column to the port)' : 'A column of the dataset (or connect a column to the port)'}
        onChange={(v) => setCol(k, part, v)}
      />
    );
  };
  // in the node, beside a port that is not connected: the column chosen for it in the panel (or what it takes by itself)
  const chosen = (k: number, part: keyof CurveCols, handle: string, fallback: ReactNode) => {
    const own = r?.view.rowAvail?.[k] && connected(rowHandle('series', k)) ? r.view.rowAvail[k] : undefined;
    if (!(own || hasData) || connected(handle)) return fallback;
    const col = rows[k].cols?.[part];
    const auto = own ? (part === 'y' || part === 'x' ? 'from its data' : 'from its data, else none') : part === 'y' ? 'choose it in the panel' : part === 'x' && k > 0 ? 'as curve 1' : part === 'x' ? 'row number' : 'none';
    return <span className={`ellipsis${col ? '' : ' muted'}`}>{col ?? auto}</span>;
  };
  const fig = r?.view.figure;
  const pos = fig?.axes[0]?.style.pos;
  const setFits = (k: number, quickFits: QuickFitSpec[]) => setRow(k, { quickFits, trend: undefined });
  const fitOf = (s: { k: number; j: number } | null) => (s && rows[s.k] ? quickFitsOf(rows[s.k])[s.j] : undefined);
  const setFit = (s: { k: number; j: number }, p: Partial<QuickFitSpec>) => setFits(s.k, quickFitsOf(rows[s.k]).map((q, j) => (j === s.j ? { ...q, ...p } : q)));
  const drawFit = fitOf(qfDraw);
  const placeFit = fitOf(qfPlace);
  return (
    <div className="node node-plot1d">
      {fig && (
        <FigureView
          fig={fig}
          width={PLOT_W}
          page={page}
          setPage={setPage}
          place={
            placing !== null && rows[placing]
              ? { curve: `${id}:${placing}`, points: parsePoints(curveStyle(rows[placing].style).fillPoints), onPoints: (p) => setRow(placing, { style: { ...rows[placing].style, fill: 'points', fillPoints: pointsText(p) } }) }
              : qfPlace && placeFit
                ? { curve: `${id}:${qfPlace.k}`, sorted: true, points: (placeFit.points ?? []).map((p): [number, number] => [p.x, p.y]), onPoints: (p) => setFit(qfPlace, { points: p.map(([x, y]) => ({ x, y })) }) }
                : undefined
          }
          ranges={
            qfDraw && drawFit
              ? {
                  list: drawFit.ranges ?? [],
                  onChange: (ranges) => setFit(qfDraw, { ranges }),
                  title: `Then drag on the figure: a range of quick fit ${qfDraw.j + 1} of curve ${qfDraw.k + 1} (only its points inside the ranges are fitted); the button turns off after it. The edges of a range can be dragged at any time`,
                  extra: <span className="hint">curve {qfDraw.k + 1}, quick fit {qfDraw.j + 1}</span>,
                }
              : undefined
          }
          layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move."
        />
      )}
      <InPort label="dataset" port="dataset" id="dataset" title="Optional: datasets (one or several: e.g. the data and the fit curves) whose columns the curves take by name (chosen in the panel)">
        <span className="muted">{hasData ? `${names.length} columns` : 'optional'}</span>
      </InPort>
      {rows.length > 1 && (
        <div className="row">
          <span className="muted">{rows.length} curves</span>
          <button className="nodrag ts-btn" title="Every curve on one line (its ports hidden, its connections kept)" onClick={() => setFold(Object.fromEntries(rows.map((_, k) => [k, true])))}>
            <ChevronsDownUp {...IC} /> Collapse all
          </button>
          <button className="nodrag ts-btn" title="Every curve with its ports" onClick={() => setFold(Object.fromEntries(rows.map((_, k) => [k, false])))}>
            <ChevronsUpDown {...IC} /> Expand all
          </button>
        </div>
      )}
      {rows.map((row, k) => {
        const c = byRow.get(k);
        const st = curveStyle(row.style);
        const folded = fold[k] ?? rows.length > 6;
        return (
          <div key={k} className={`curve-row${folded ? ' folded' : ''}`}>
            <div className="curve-head">
              <button className="nodrag ts-btn" title={folded ? 'Show its ports' : 'Hide its ports (the curve on one line, its connections kept)'} onClick={() => setFold({ ...fold, [k]: !folded })}>
                {folded ? '⊞' : '⊟'}
              </button>
              <span className="swatch" style={{ background: st.color, opacity: st.show ? 1 : 0.3 }} />
              <b>{k + 1}</b>
              <span className={`grow ellipsis${st.show ? '' : ' muted'}`} title="The curve's legend text (changed in the panel)">
                {row.label || c?.series.y.name || 'curve'}
              </span>
            </div>
            <div className={`curve-ports${folded ? ' collapsed' : ''}`}>
              <InPort label="Y" port="column" id={rowHandle('y', k)}>
                {chosen(k, 'y', rowHandle('y', k), <span className="muted ellipsis">{c ? titleOf(c.series.y) : 'connect a column, or a dataset to “data”'}</span>)}
              </InPort>
              <InPort label="X" port="column" id={rowHandle('x', k)} title="X column (absent: the X of curve 1 when it has as many rows, else the row number)">
                {chosen(k, 'x', rowHandle('x', k), <span className="muted ellipsis">{c ? (connected(rowHandle('x', k)) ? titleOf(c.series.x) : k > 0 ? 'as curve 1' : titleOf(c.series.x)) : 'optional'}</span>)}
              </InPort>
              <InPort label="±Y" port="column" id={rowHandle('yerr', k)} title="Error of Y (± this value): error bars or a band, only when given">
                {chosen(k, 'yerr', rowHandle('yerr', k), <span className="muted ellipsis">{c?.series.yErr ? titleOf(c.series.yErr) : 'optional'}</span>)}
              </InPort>
              {(st.errAsym || connected(rowHandle('ylo', k))) && (
                <InPort label="−Y" port="column" id={rowHandle('ylo', k)} title="The − error of Y (±Y is then the + error)">
                  {chosen(k, 'ylo', rowHandle('ylo', k), <span className="muted ellipsis">{c?.series.yErrLo ? titleOf(c.series.yErrLo) : 'optional'}</span>)}
                </InPort>
              )}
              <InPort label="±X" port="column" id={rowHandle('xerr', k)} title="Error of X: horizontal error bars">
                {chosen(k, 'xerr', rowHandle('xerr', k), <span className="muted ellipsis">{c?.series.xErr ? titleOf(c.series.xErr) : 'optional'}</span>)}
              </InPort>
              {(st.colorBy === 'column' || connected(rowHandle('color', k))) && <InPort label="colour" port="column" id={rowHandle('color', k)} title="The column that colours the points" />}
              {(st.sizeBy === 'column' || st.widthBy === 'column' || connected(rowHandle('size', k))) && <InPort label="size" port="column" id={rowHandle('size', k)} title="The column that sizes the symbols (or sets the line's width)" />}
              {(st.labels === 'column' || connected(rowHandle('label', k))) && <InPort label="labels" port="column" id={rowHandle('label', k)} title="The column with the labels of the points" />}
              <InPort label="data" port="dataset" id={rowHandle('series', k)} title="Optional: a dataset for this curve — its X, Y, ±Y, ±X chosen in the panel (else its first designated curve); a column connected to a port replaces that part" />
              <OutPort label={`data ${k + 1}`} port="dataset" id={rowHandle('series', k)} title="The data of this curve as a dataset (X, Y, ±Y, ±X designated), for analysis nodes" />
            </div>
          </div>
        );
      })}
      <NodeOptions>
        <div className="row">
          <Field label="Colours" title="Each curve its own colour (its style), or all the curves coloured by a colour map — by the value of the block each came from (Split into columns: the cavity thickness, the cycle …), else by their order; the legend can then show them as one entry with the colour scale">
            <Select<'own' | ColorMapName>
              value={data.curveColors?.map ?? 'own'}
              options={[['own', 'each curve its own'], ...CMAP_OPTIONS.filter(([k]) => k !== 'custom').map(([k, l]): ['own' | ColorMapName, string] => [k, `colour map: ${l}`])]}
              onChange={(m) => updateNodeData(id, { curveColors: m === 'own' ? undefined : { ...data.curveColors, map: m } } as Partial<Plot1DData>)}
            />
          </Field>
          {data.curveColors && <Check label="Reversed" value={!!data.curveColors.reverse} onChange={(reverse) => updateNodeData(id, { curveColors: { ...data.curveColors!, reverse } } as Partial<Plot1DData>)} />}
          {!data.curveColors && (
            <Select<string>
              value=""
              title="Every curve recoloured from a palette, in order (each can be changed afterwards)"
              options={[['', 'recolour from a palette'], ...PALETTES.map(([k, l]): [string, string] => [k, l])]}
              onChange={(k) => {
                const pal = PALETTES.find((p) => p[0] === k)?.[2];
                if (!pal) return;
                const all = plotRows(data, count);
                updateNodeData(id, { style: { ...data.style, color: pal[0] }, rows: all.slice(1).map((r, j) => ({ ...r, style: { ...r.style, color: pal[(j + 1) % pal.length] } })) } as Partial<Plot1DData>);
              }}
            />
          )}
        </div>
        {count > 1 && (
          <div className="row wrap">
            <Field label="Curves" title="Each as it is; stacked — each on the ones before it, on the X of the first (stacked areas: each filled down to the one under it unless it has a fill of its own); or as % of their sum at every X">
              <Select<NonNullable<Plot1DData['stack']>>
                value={data.stack ?? 'none'}
                options={[
                  ['none', 'each as it is'],
                  ['stack', 'stacked'],
                  ['percent', 'stacked, % of the sum'],
                ]}
                onChange={(stack) => updateNodeData(id, { stack: stack === 'none' ? undefined : stack } as Partial<Plot1DData>)}
              />
            </Field>
            <Check label="Joined at every X" title="A line from the lowest curve to the highest at every X they share (a dumbbell chart: two values per category)" value={!!data.join?.show} onChange={(show) => updateNodeData(id, { join: { ...data.join, show } } as Partial<Plot1DData>)} />
            {data.join?.show && (
              <>
                <input className="nodrag color" type="color" value={data.join.color || '#9a9a9a'} title="Its colour" onChange={(e) => updateNodeData(id, { join: { ...data.join!, color: e.target.value } } as Partial<Plot1DData>)} />
                <NumInput className="tiny" min={0} step={0.25} value={data.join.width ?? 1.5} title="Its width, pt" onChange={(v) => updateNodeData(id, { join: { ...data.join!, width: v > 0 ? v : undefined } } as Partial<Plot1DData>)} />
              </>
            )}
          </div>
        )}
        {hasData && (
          <div className="row">
            <button className="nodrag" title="Several curves at once: columns of the dataset chosen as Y, or the curves of its designations" onClick={() => setAdding((a) => !a)}>
              + Curves from the columns
            </button>
          </div>
        )}
        {adding && <AddCurves sheets={sheets} colsOf={(s) => (sheets.length ? (r?.view.sheetCols?.[s || sheets[0]] ?? []) : (r?.view.available ?? []))} onAdd={addCurves} onClose={() => setAdding(false)} />}
        {rows.length > 1 && (
          <div className="row">
            <span className="muted">{rows.length} curves</span>
            <button className="nodrag ts-btn" title="Every curve on one line here (its columns, fits and style hidden)" onClick={() => setPfold(Object.fromEntries(rows.map((_, k) => [k, true])))}>
              <ChevronsDownUp {...IC} /> Collapse all
            </button>
            <button className="nodrag ts-btn" title="Every curve with its columns" onClick={() => setPfold(Object.fromEntries(rows.map((_, k) => [k, false])))}>
              <ChevronsUpDown {...IC} /> Expand all
            </button>
          </div>
        )}
        {rows.map((row, k) => {
          const c = byRow.get(k);
          const st = curveStyle(row.style);
          const pfolded = (pfold[k] ?? rows.length > 6) && open !== k;
          const setStyle = (p: Partial<CurveStyle>) => setRow(k, { style: { ...row.style, ...p } });
          const own = r?.view.rowAvail?.[k];
          const parts: [keyof CurveCols, string, boolean][] = [
            ['y', 'Y', true],
            ['x', 'X', true],
            ['yerr', '±Y', true],
            ['ylo', '−Y', st.errAsym || connected(rowHandle('ylo', k))],
            ['xerr', '±X', true],
          ];
          return (
            <div key={k} className={`curve-row${pfolded ? ' folded' : ''}`} data-flash={flash?.k === k ? flash.seq : undefined}>
              <div className="curve-head">
                <button className="nodrag ts-btn" title={pfolded ? 'Show its columns (and its style when opened)' : 'Fold it to this line (its columns, fits and style hidden)'} onClick={() => setPfold({ ...pfold, [k]: !pfolded })}>
                  {pfolded ? '⊞' : '⊟'}
                </button>
                <input className="nodrag" type="checkbox" checked={st.show} title="Show this curve (hidden: not drawn, not in the legend nor the limits of the axes — still a line another curve can be filled to)" onChange={(e) => setStyle({ show: e.target.checked })} />
                <span className="swatch" style={{ background: st.color, opacity: st.show ? 1 : 0.3 }} />
                <b>{k + 1}</b>
                <span className="grow">
                  <RichInput value={row.label} placeholder={c?.series.y.name || 'legend text'} onChange={(label) => setRow(k, { label })} />
                </span>
                <button className="nodrag ts-btn" title="Copy this curve's style" onClick={() => copyCurveStyle(row.style)}>
                  <Copy {...IC} />
                </button>
                <button className="nodrag ts-btn" disabled={!clip} title="Paste the copied style on this curve" onClick={() => clip && setRow(k, { style: structuredClone(clip) })}>
                  <ClipboardPaste {...IC} />
                </button>
                <button
                  className={`nodrag ts-btn${open === k ? ' on' : ''}`}
                  title="Style of this curve"
                  onClick={() => {
                    setOpen(open === k ? null : k);
                    if (open !== k) setPfold({ ...pfold, [k]: false });
                  }}
                >
                  {open === k ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />} style
                </button>
                <button className="nodrag ts-btn" disabled={k === 0} title="Move this curve up (drawn under the ones after it; its connections go with it)" onClick={() => moveRow(k, -1)}>
                  <ArrowUp {...IC} />
                </button>
                <button className="nodrag ts-btn" disabled={k === rows.length - 1} title="Move this curve down (drawn over the ones before it; its connections go with it)" onClick={() => moveRow(k, 1)}>
                  <ArrowDown {...IC} />
                </button>
                <button className="nodrag ts-btn" title="Duplicate this curve: the same columns, connections and style, below it" onClick={() => duplicateRow(k)}>
                  <CopyPlus {...IC} />
                </button>
                <button className="nodrag ts-btn" title="Remove this curve (its connections too)" onClick={() => removeRow(k)}>
                  <X {...IC} />
                </button>
              </div>
              {!pfolded && (own || hasData) && (
                <div className="col-form">
                  {sheets.length > 0 && !connected(rowHandle('series', k)) && (
                    <>
                      <span title="A workbook on the dataset port: the sheet this curve's columns come from">Sheet</span>
                      <Select<string> value={row.sheet ?? ''} options={[['', `first (${sheets[0]})`], ...sheets.map((nm): [string, string] => [nm, nm]), ...(row.sheet && !sheets.includes(row.sheet) ? [[row.sheet, `${row.sheet} (missing)`] as [string, string]] : [])]} onChange={(sheet) => setRow(k, { sheet: sheet || undefined })} />
                    </>
                  )}
                  {parts
                    .filter(([, , shown]) => shown)
                    .map(([part, label]) => (
                      <Fragment key={part}>
                        <span>{label}</span>
                        {pick(k, part, rowHandle(part === 'ylo' ? 'ylo' : part, k), <span className="muted ellipsis">connected</span>)}
                      </Fragment>
                    ))}
                </div>
              )}
              {open === k && <AggregateControls value={row.aggregate} onChange={(aggregate) => setRow(k, { aggregate })} />}
              {open === k && (
                <QuickFitControls
                  value={quickFitsOf(row)}
                  onChange={(v) => setFits(k, v)}
                  results={(r?.view.quickFits ?? []).filter((v) => v.curve === k)}
                  curve={{ color: c?.style.color ?? st.color, lineWidth: st.lineWidth, axisX: st.axisX, axisY: st.axisY }}
                  curves={rows.flatMap((q, j): [number, string][] => (q.cols?.y || byRow.get(j) ? [[j + 1, `${j + 1}. ${q.label || q.cols?.y || byRow.get(j)?.series.y.name || ''}`]] : []))}
                  drawing={qfDraw?.k === k ? qfDraw.j : null}
                  onDraw={(j) => setQfDraw(j === null ? null : { k, j })}
                  placing={qfPlace?.k === k ? qfPlace.j : null}
                  onPlace={(j) => {
                    setQfPlace(j === null ? null : { k, j });
                    setPlacing(null);
                  }}
                />
              )}
              {open === k && <CurveStyleEditor st={st} set={setStyle} hasYErr={!!c?.series.yErr} hasXErr={!!c?.series.xErr} curves={rows.flatMap((q, j): [number, string][] => (j !== k && (q.cols?.y || byRow.get(j)) ? [[j + 1, `${j + 1}. ${q.label || q.cols?.y || byRow.get(j)?.series.y.name || ''}`]] : []))} placing={placing === k} onPlace={() => {
                    setPlacing(placing === k ? null : k);
                    setQfPlace(null);
                  }} />}
            </div>
          );
        })}
        <div className="row">
          <button
            className="nodrag"
            title="A new curve with its ports: connect a column to Y (and X …), a dataset to its “data” port, or choose its columns from the Plot's dataset"
            onClick={() => {
              const all = plotRows(data, count + 1);
              updateNodeData(id, { rows: all.slice(1) } as Partial<Plot1DData>);
            }}
          >
            + Add curve
          </button>
        </div>
        {!!r?.view.quickFits?.length && <QuickFitResults fits={r.view.quickFits} />}
        <FigureTabs id={id} data={data} legendCurves={r?.view.legendCurves ?? []} pos={pos} port={false} dataKinds />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, to put several on one page" />
      {!!r?.view.quickFits?.length && <OutPort label="fits" port="dataset" id="fits" title="The quick fits' results: a row per parameter (curve, fit, range, parameter, value, error; R², n)" />}
    </div>
  );
}

// The columns to add as curves: the sheet they come from (a workbook), their X — of curve 1, the one designated on the
// left of each Y, or a column chosen —, the Y columns ticked (a curve each); or the curves of the sheet's designations.
const X_CURVE1 = '';
const X_DESIGNATED = '~designated~';
function AddCurves({ sheets, colsOf, onAdd, onClose }: { sheets: string[]; colsOf: (sheet: string) => ColInfo[]; onAdd: (ys: (string | CurveCols)[], sheet?: string) => void; onClose: () => void }) {
  const [sheet, setSheet] = useState('');
  const [x, setX] = useState(X_CURVE1);
  const [chosen, setChosen] = useState<string[]>([]);
  const cols = colsOf(sheet);
  const names = cols.map((c) => c.name);
  const byRole = curvesByRole(cols).curves;
  const xOf = (y: string) => (x === X_DESIGNATED ? byRole.find((c) => c.y === y)?.x || curvesByRole(cols).curves[0]?.x : x === X_CURVE1 ? undefined : x);
  // any column can be a Y (whatever its designation), but the one chosen as X
  const isX = (nm: string) => nm === x;
  const ys = chosen.filter((nm) => names.includes(nm) && !isX(nm));
  const pickedSheet = sheets.length ? sheet || sheets[0] : undefined;
  return (
    <div className="add-curves">
      <div className="col-form">
        {sheets.length > 0 && (
          <>
            <span title="The sheet of the workbook the columns come from">Sheet</span>
            <Select<string>
              value={sheet || sheets[0]}
              options={sheets.map((nm): [string, string] => [nm, nm])}
              onChange={(v) => {
                setSheet(v);
                setChosen([]);
              }}
            />
          </>
        )}
        <span title="The X of the curves added">X</span>
        <Select<string>
          value={x}
          options={[
            [X_CURVE1, 'the X of curve 1'],
            ...names.map((nm): [string, string] => [nm, nm]),
            [X_DESIGNATED, 'the one designated on the left of each Y'],
          ]}
          onChange={setX}
        />
      </div>
      <div className="hint">Y: the columns to draw, a curve each{x !== X_CURVE1 && x !== X_DESIGNATED ? ` (against “${x}”)` : ''}.</div>
      <div className="add-curves-list nowheel">
        {names
          .filter((nm) => !isX(nm))
          .map((nm) => (
            <Check key={nm} label={nm} value={chosen.includes(nm)} onChange={(on) => setChosen((c) => (on ? [...c, nm] : c.filter((q) => q !== nm)))} />
          ))}
      </div>
      <div className="row wrap">
        <button className="nodrag btn-run" disabled={!ys.length} onClick={() => onAdd(ys.map((y) => ({ y, ...(xOf(y) ? { x: xOf(y) } : {}) })), pickedSheet)}>
          Add {ys.length || ''} curve{ys.length === 1 ? '' : 's'}
        </button>
        <button className="nodrag" disabled={!byRole.length} title="Every Y of the sheet's designations with its X and its ±Y, ±X" onClick={() => onAdd(byRole, pickedSheet)}>
          From the designations ({byRole.length})
        </button>
        <button className="nodrag" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Merge ----

function LayoutControls({ L, set }: { L: CanvasLayout; set: (p: Partial<CanvasLayout>) => void }) {
  const len = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0);
  const arrange = L.arrange ?? 'grid';
  const arrangeField = (
    <Field label="Arrangement" title="A grid of cells, or a stack: the Plots one under another with one X axis, or side by side with one Y axis, their frames touching">
      <Select<NonNullable<CanvasLayout['arrange']>>
        value={arrange}
        options={[
          ['grid', 'grid'],
          ['stackV', 'stacked, one under another (X shared)'],
          ['stackH', 'stacked, side by side (Y shared)'],
        ]}
        onChange={(v) => set({ arrange: v })}
      />
    </Field>
  );
  if (arrange !== 'grid')
    return (
      <>
        <div className="grid2">
          {arrangeField}
          <Field label={arrange === 'stackV' ? 'Heights' : 'Widths'} title={`The ${arrange === 'stackV' ? 'heights of the frames, top to bottom' : 'widths of the frames, left to right'}, in proportion: 2:1:1 (empty: equal)`}>
            <TextInput className="short-text mono" value={L.ratios ?? ''} placeholder="1:1:1" onChange={(ratios) => set({ ratios })} />
          </Field>
          <Field label="Gap between frames" title="In the page's unit; 0: the frames touch (their ticks at the joints turn inward)">
            <NumInput className="tiny" min={0} step={0.5} value={L.stackGap ?? 0} onChange={(v) => set({ stackGap: len(v) })} />
          </Field>
          <Field label="Margin" title="Around the stack, in the page's unit">
            <NumInput className="tiny" min={0} step={1} value={L.margin} onChange={(v) => set({ margin: len(v) })} />
          </Field>
        </div>
        <Check label={`Numbers and title of the shared ${arrange === 'stackV' ? 'X' : 'Y'} axis on every panel`} value={L.inner} onChange={(inner) => set({ inner })} />
        <CommonControls L={L} set={set} />
      </>
    );
  return (
    <>
      <div className="grid2">
        {arrangeField}
        <Field label="Rows × columns" title="The grid; the Plots fill it in the order of connection (rows are added when it is full)">
          <span className="row">
            <NumInput className="tiny" min={1} step={1} value={L.rows} onChange={(v) => set({ rows: Math.max(1, Math.floor(v) || 1) })} />×
            <NumInput className="tiny" min={1} step={1} value={L.cols} onChange={(v) => set({ cols: Math.max(1, Math.floor(v) || 1) })} />
          </span>
        </Field>
        <Field label="Size of the Plots" title="Fit: the cells share the page (its size below), every Plot redrawn at the size of its cell (fonts and lines keep their pt). Keep: every Plot at its own page size, the Merge as large as the grid.">
          <Select<CanvasLayout['sizing']>
            value={L.sizing}
            options={[
              ['fit', 'fit to the cells'],
              ['keep', 'keep their sizes'],
            ]}
            onChange={(sizing) => set({ sizing })}
          />
        </Field>
        {L.sizing === 'fit' && (
          <Field label="Column widths, row heights" title="In proportion: 2:1 (empty: equal)">
            <span className="row">
              <TextInput className="short-text mono" value={L.colRatios ?? ''} placeholder="1:1" onChange={(colRatios) => set({ colRatios })} />
              <TextInput className="short-text mono" value={L.rowRatios ?? ''} placeholder="1:1" onChange={(rowRatios) => set({ rowRatios })} />
            </span>
          </Field>
        )}
        <Field label="Gaps across, down" title="Between the cells, in the page's unit (the Plots keep their own margins inside their cell)">
          <span className="row">
            <NumInput className="tiny" min={0} step={1} value={L.hgap} onChange={(v) => set({ hgap: len(v) })} />
            <NumInput className="tiny" min={0} step={1} value={L.vgap} onChange={(v) => set({ vgap: len(v) })} />
          </span>
        </Field>
        <Field label="Margin" title="Around the grid, in the page's unit">
          <NumInput className="tiny" min={0} step={1} value={L.margin} onChange={(v) => set({ margin: len(v) })} />
        </Field>
        <Field label="Share X" title="One range of the bottom axes: for all the Plots, or for each column of the grid">
          <Select
            value={L.shareX}
            options={[
              ['none', 'no'],
              ['all', 'all panels'],
              ['column', 'by column'],
            ]}
            onChange={(shareX) => set({ shareX })}
          />
        </Field>
        <Field label="Share Y" title="One range of the left axes: for all the Plots, or for each row of the grid">
          <Select
            value={L.shareY}
            options={[
              ['none', 'no'],
              ['all', 'all panels'],
              ['row', 'by row'],
            ]}
            onChange={(shareY) => set({ shareY })}
          />
        </Field>
      </div>
      {(L.shareX !== 'none' || L.shareY !== 'none') && <Check label="Numbers and titles of the shared axes on the inner panels too" value={L.inner} onChange={(inner) => set({ inner })} />}
      <CommonControls L={L} set={set} />
    </>
  );
}

// For all the panels at once: one title of X under them and one of Y at their left, one legend outside them, one
// colour scale.
function CommonControls({ L, set }: { L: CanvasLayout; set: (p: Partial<CanvasLayout>) => void }) {
  return (
    <div className="grid2">
      <Field label="One X title" title="Under all the panels, centred (the panels' own X titles hidden); empty: the first panel's">
        <input className="nodrag" type="checkbox" checked={!!L.commonX} onChange={(e) => set({ commonX: e.target.checked })} />
        {L.commonX && <TextInput value={L.commonXTitle ?? ''} placeholder="the first panel's" onChange={(commonXTitle) => set({ commonXTitle })} />}
      </Field>
      <Field label="One Y title" title="At the left of all the panels, centred (the panels' own Y titles hidden); empty: the first panel's">
        <input className="nodrag" type="checkbox" checked={!!L.commonY} onChange={(e) => set({ commonY: e.target.checked })} />
        {L.commonY && <TextInput value={L.commonYTitle ?? ''} placeholder="the first panel's" onChange={(commonYTitle) => set({ commonYTitle })} />}
      </Field>
      <Field label="One legend" title="For all the panels (every curve once, by its legend text), outside them; in the look of the first panel's legend">
        <Select<NonNullable<CanvasLayout['legend']>>
          value={L.legend ?? 'none'}
          options={[
            ['none', 'no'],
            ['right', 'at the right'],
            ['bottom', 'below'],
            ['top', 'above'],
          ]}
          onChange={(legend) => set({ legend })}
        />
        {(L.legend ?? 'none') !== 'none' && <Check label="The panels' too" value={!!L.panelLegends} onChange={(panelLegends) => set({ panelLegends })} />}
      </Field>
      <Check label="One colour scale for all the panels" title="The curves coloured by a colour map share one range (a colour bar in the Merge then fits them all)" value={!!L.oneColorScale} onChange={(oneColorScale) => set({ oneColorScale })} />
    </div>
  );
}

// The Plots in the Merge, in the order of connection: the cells each spans, or its own box (an inset).
function ItemsControls({ keys, items, set }: { keys: string[]; items: CanvasItem[]; set: (items: CanvasItem[]) => void }) {
  const nodes = useNodesData<AppNode>(keys);
  const item = (key: string) => items.find((it) => it.key === key) ?? { key };
  const setItem = (key: string, p: Partial<CanvasItem>) => {
    const next = { ...item(key), ...p };
    set(items.some((it) => it.key === key) ? items.map((it) => (it.key === key ? next : it)) : [...items, next]);
  };
  if (!keys.length) return null;
  return (
    <div className="canvas-items">
      <div className="canvas-item head">
        <span>Plot</span>
        <span title="Columns of the grid it spans">Cols</span>
        <span title="Rows of the grid it spans">Rows</span>
        <span title="Split into panels: one for every curve of the Plot (its axes and styles), in its place in the grid">Facets</span>
      </div>
      {keys.map((key, k) => {
        const it = item(key);
        const n = nodes.find((x) => x.id === key);
        return (
          <div key={key} className="canvas-item">
            <span className="ellipsis" title={key}>
              {k + 1}. {n ? nodeDisplayName(n as AppNode) : key}
            </span>
            {it.free ? (
              <>
                <span className="muted">own box</span>
                <span />
                <button className="nodrag" title="Put it back in the grid (it was moved by hand)" onClick={() => setItem(key, { free: undefined })}>
                  Back to the grid
                </button>
              </>
            ) : (
              <>
                <NumInput className="tiny" min={1} step={1} value={it.colSpan ?? 1} onChange={(v) => setItem(key, { colSpan: Math.max(1, Math.floor(v) || 1) })} />
                <NumInput className="tiny" min={1} step={1} value={it.rowSpan ?? 1} onChange={(v) => setItem(key, { rowSpan: Math.max(1, Math.floor(v) || 1) })} />
                <input className="nodrag" type="checkbox" title="A panel for every curve of this Plot" checked={!!it.facet} onChange={(e) => setItem(key, { facet: e.target.checked })} />
              </>
            )}
          </div>
        );
      })}
      {items.filter((it) => it.free).length > 1 && (
        <button className="nodrag" title="Every Plot moved by hand put back in the grid" onClick={() => set(items.map((it) => ({ ...it, free: undefined })))}>
          All back to the grid
        </button>
      )}
    </div>
  );
}

export function CanvasNodeView({ id, data }: NodeProps<CanvasNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (patch: Partial<CanvasData>) => updateNodeData(id, patch);
  const fig = r?.view.figure;
  const L: CanvasLayout = { ...CANVAS_LAYOUT_DEFAULTS, ...data.layout };
  const conns = useNodeConnections({ handleType: 'target', handleId: 'figures' });
  const keys = conns.map((c) => c.source);
  const [tab, setTab] = useState<'layout' | 'page' | 'annotate' | null>('layout');
  // a part of the page double-clicked: its tab opened
  useFigureFocus(id, (part, seq) => {
    if (part.startsWith('ann:')) setTab('annotate');
    else if (part === 'page' || part === 'legend') setTab('page');
    else return;
    flashLater(seq);
  });
  const page: PageData = data;
  const keep = L.sizing === 'keep';
  return (
    <div className="node node-canvas">
      <InPort label="figures" port="figure" id="figures" title="Plots (their “figure” output), in the order they fill the grid">
        <span className="muted">{keys.length ? `${keys.length} Plot${keys.length > 1 ? 's' : ''}` : ''}</span>
      </InPort>
      {fig && (
        <FigureView
          fig={fig}
          width={600}
          page={page}
          setPage={(p) => set(p)}
          layoutTitle="Move and resize the Plots with the mouse (a Plot moved leaves the grid: an inset; Shift keeps the shape). Off: the annotations of the page and of the Plots move."
        />
      )}
      <NodeOptions>
      <Tabs
        tabs={[
          ['layout', 'Grid'],
          ['page', 'Page'],
          ['annotate', `Annotate${data.annotations?.length ? ` (${data.annotations.length})` : ''}`],
        ]}
        value={tab ?? ('' as 'layout')}
        onChange={(t) => setTab(tab === t ? null : t)}
      />
      {tab === 'layout' && (
        <>
          <LayoutControls L={L} set={(p) => set({ layout: { ...L, ...p } })} />
          <ItemsControls keys={keys} items={data.items ?? []} set={(items) => set({ items })} />
        </>
      )}
      {tab === 'page' && (
        <>
          <PageControls page={page} set={(p) => set(p)} fixed={keep && fig ? `Size: ${fig.width} × ${fig.height} ${fig.unit} — from the Plots (Grid ▸ Size of the Plots: keep their sizes).` : undefined} />
          {keep && (
            <Field label="Unit" title="Of the gaps, the margin and the size shown">
              <Select
                value={data.unit}
                options={[
                  ['mm', 'mm'],
                  ['cm', 'cm'],
                  ['in', 'in'],
                ]}
                onChange={(unit) => set({ unit })}
              />
            </Field>
          )}
          <div className="grid2">
            <Field label="Panel labels" title="A letter at the top-left corner of every Plot, in the order of connection (a Plot's own: Axes ▸ Grid, frame ▸ Panel label)">
              <Select<PanelScheme>
                value={data.panels ?? 'none'}
                options={[
                  ['none', 'none'],
                  ['a', 'a, b, c'],
                  ['(a)', '(a), (b)'],
                  ['a)', 'a), b)'],
                  ['A', 'A, B, C'],
                  ['(A)', '(A), (B)'],
                  ['A)', 'A), B)'],
                ]}
                onChange={(panels) => set({ panels })}
              />
            </Field>
            {(data.panels ?? 'none') !== 'none' && (
              <Field label="Place" title="From the top-left corner of each Plot's box, pt">
                <span className="row">
                  <NumInput className="tiny" step={1} value={data.panelX ?? 2} onChange={(panelX) => set({ panelX: Number.isFinite(panelX) ? panelX : 0 })} />
                  <NumInput className="tiny" step={1} value={data.panelY ?? 2} onChange={(panelY) => set({ panelY: Number.isFinite(panelY) ? panelY : 0 })} />
                </span>
              </Field>
            )}
          </div>
          {(data.panels ?? 'none') !== 'none' && (
            <>
              <TextStyleControls label="Label text (auto: bold, +2 pt)" value={data.panelText} onChange={(panelText) => set({ panelText })} />
              <Field label="Label ground" title="A colour behind every panel label (none: transparent)">
                <OptColor value={data.panelBox ?? ''} onChange={(panelBox) => set({ panelBox })} />
              </Field>
            </>
          )}
        </>
      )}
      {tab === 'annotate' && <AnnotationsEditor items={data.annotations} where="page" node={id} onChange={(annotations) => set({ annotations })} />}
      <Messages result={r} />
      </NodeOptions>
      <Messages result={r} />
    </div>
  );
}
