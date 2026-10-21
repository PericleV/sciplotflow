// A figure of matplotlib (read by a Python script) made into Plots: every axes a 1D plot — its curves (lines, symbols,
// steps, error bars, fill_between) with their look, its titles, limits, scales, grid, a twin's curves on the right axis,
// lines across (axhline / axvline), texts, the legend —, the figure's size and text size; several axes (subplots): their
// Plots in a Merge, in their grid. The Plots take their data from the script's outputs (fig1, fig1_2 …): running the code
// again changes the data, the look stays as set in the Plots. Pure.
import type { Edge } from '@xyflow/react';
import { CANVAS_DEFAULTS, PLOT1D_DEFAULTS, PLOT_PAGE_DEFAULTS } from './defaults.ts';
import { AXES_STYLE_DEFAULTS, AXIS_DEFAULTS, curveStyle, type Anchor, type AxisSpec, type CurveStyle, type Dash, type ScaleType, type SymbolShape } from './figure/spec.ts';
import { curveColumns, figPort, type MplAxes, type MplFigure } from './engine/python.ts';
import type { AnnotationItem, AppNode, CurveRow, Plot1DData } from './types.ts';

const SCALE: Record<string, ScaleType> = { linear: 'linear', log: 'log', symlog: 'symlog', logit: 'logit' };
const DASHES = new Set(['solid', 'dash', 'dot', 'dashdot']);
const LEGEND_AT: Record<string, { x: number; y: number }> = { tr: { x: 98, y: 2 }, tl: { x: 2, y: 2 }, bl: { x: 2, y: 98 }, br: { x: 98, y: 98 }, cr: { x: 98, y: 50 }, cl: { x: 2, y: 50 }, bc: { x: 50, y: 98 }, tc: { x: 50, y: 2 }, c: { x: 50, y: 50 } };
const ANCHOR: Record<string, string> = { left: 'l', center: 'c', right: 'r', top: 't', bottom: 'b', baseline: 'b', center_baseline: 'c' };

const scaleOf = (s: string | undefined, lim: [number, number] | null | undefined): AxisSpec => ({ ...AXIS_DEFAULTS, scale: SCALE[s ?? 'linear'] ?? 'linear', ...(lim ? { min: Math.min(...lim), max: Math.max(...lim), reverse: lim[0] > lim[1] } : {}) });

// one axes: its Plot's data (the curves as rows taking the columns of its data port; the axes, legend, texts, page);
// pid: the Plot's id (the legend leaves out the curves matplotlib does not list: no label)
export function axesPlot(ax: MplAxes, fig: MplFigure, pid: string): Plot1DData {
  const { names } = curveColumns(ax);
  const rows: CurveRow[] = ax.curves.map((c, i) => {
    const st: Partial<CurveStyle> = {
      show: !c.hidden,
      mode: c.mode,
      color: c.color,
      lineWidth: c.lw ?? 1.5,
      dash: (DASHES.has(c.dash ?? '') ? c.dash : 'solid') as Dash,
      lineOpacity: c.hidden || (c.fillTo !== undefined && !(c.lw ?? 0)) ? 0 : (c.alpha ?? 1),
      symbol: (c.marker ?? 'circle') as SymbolShape,
      symbolSize: c.ms ?? 6,
      symbolFill: c.open ? 'open' : 'filled',
      symbolOpacity: c.alpha ?? 1,
      ...(c.mec && c.mec !== c.color ? { edgeColor: c.mec } : {}),
      ...(c.mew !== undefined ? { symbolEdge: c.mew } : {}),
      ...(c.step ? { stepKind: c.step } : {}),
      ...(c.axis === 'y2' ? { axisY: 'right' } : {}),
      ...(c.yerr || c.xerr ? { errWidth: c.errWidth ?? 0.8, errCap: c.errCap ?? 0, ...(c.errColor && c.errColor !== c.color ? { errColor: c.errColor } : {}) } : {}),
      ...(c.ylo ? { errAsym: true } : {}),
      // fill_between: down to its lower edge (a hidden curve, its row number)
      ...(c.fillTo !== undefined ? { fill: 'curve', fillCurve: c.fillTo + 1, fillOpacity: c.fillAlpha ?? 0.3 } : {}),
    };
    const n = names[i];
    return { label: c.label, style: st, cols: { x: n.x, y: n.y, ...(n.yerr ? { yerr: n.yerr } : {}), ...(n.ylo ? { ylo: n.ylo } : {}), ...(n.xerr ? { xerr: n.xerr } : {}) } };
  });
  const sides = AXES_STYLE_DEFAULTS.sides;
  const textSize = (size: number | undefined | null) => (size && Math.abs(size - fig.size) > 0.01 ? { size } : {});
  const axes = {
    ...AXES_STYLE_DEFAULTS,
    x: scaleOf(ax.xscale, ax.xlim),
    y: scaleOf(ax.yscale, ax.ylim),
    ...(ax.curves.some((c) => c.axis === 'y2') ? { right: { ...AXES_STYLE_DEFAULTS.right, mode: 'own' as const, scale: scaleOf(ax.y2scale, ax.y2lim) } } : {}),
    sides: {
      ...sides,
      bottom: { ...sides.bottom, title: ax.xlabel, showTitle: !!ax.xlabel, titleText: { ...sides.bottom.titleText, ...textSize(ax.labelSize) }, labelText: { ...sides.bottom.labelText, ...textSize(ax.tickSize) } },
      left: { ...sides.left, title: ax.ylabel, showTitle: !!ax.ylabel, titleText: { ...sides.left.titleText, ...textSize(ax.labelSize) }, labelText: { ...sides.left.labelText, ...textSize(ax.tickSize) } },
      ...(ax.y2label !== undefined ? { right: { ...sides.right, title: ax.y2label, showTitle: !!ax.y2label, labels: true } } : {}),
    },
    grid: ax.grid ? { x: { ...AXES_STYLE_DEFAULTS.grid.x, major: true }, y: { ...AXES_STYLE_DEFAULTS.grid.y, major: true } } : AXES_STYLE_DEFAULTS.grid,
    // in a Merge (subplots): the axes' title as its panel's label, none without one (matplotlib writes no (a), (b))
    ...(fig.axes.length > 1 ? { panelLabel: ax.title || '-' } : {}),
  };
  const notes: AnnotationItem[] = [
    ...ax.lines.map((l, k): AnnotationItem => ({ id: `mpl-l${k}`, type: 'shape', spec: { kind: l.kind, coords: 'data', ...(l.kind === 'hline' ? { y1: l.v, y2: l.v } : { x1: l.v, x2: l.v }), color: l.color, width: l.width, dash: (DASHES.has(l.dash) ? l.dash : 'solid') as Dash } })),
    ...ax.texts.map((t, k): AnnotationItem => {
      const anchor = `${ANCHOR[t.va] === 'c' ? 'c' : (ANCHOR[t.va] ?? 'b')}${ANCHOR[t.ha] ?? 'l'}`.replace(/^cc$/, 'c').replace(/^c([lr])$/, 'c$1') as Anchor;
      return { id: `mpl-t${k}`, type: 'text', spec: { text: t.text, coords: t.coords === 'data' ? 'data' : 'percent', x: t.coords === 'data' ? t.x : t.x * 100, y: t.coords === 'data' ? t.y : (1 - t.y) * 100, anchor, style: { color: t.color, ...textSize(t.size) } } };
    }),
  ];
  const lg = ax.legend;
  const entries = ax.curves.flatMap((c, i) => (c.label ? [] : [{ key: `${pid}:${i}`, show: false, label: '' }]));
  const legend = lg?.show ? { ...PLOT1D_DEFAULTS.legend!, show: true, ...(lg.loc === 'auto' ? { auto: true } : { auto: false, anchor: lg.loc as Anchor, ...LEGEND_AT[lg.loc] }), frame: lg.frame ? ('box' as const) : ('none' as const), entries } : { show: false, entries };
  const [head, ...rest] = rows.length ? rows : [{ label: '', style: {} }];
  return {
    ...structuredClone(PLOT1D_DEFAULTS),
    label: head.label,
    style: curveStyle(head.style),
    ...(head.cols ? { cols: head.cols } : {}),
    rows: rest.map((r) => ({ ...r, style: curveStyle(r.style) })),
    axes,
    legend,
    annotations: notes,
    page: { ...PLOT_PAGE_DEFAULTS, unit: 'in', width: +fig.w.toFixed(2), height: +fig.h.toFixed(2), size: fig.size, ...(ax.title && fig.axes.length === 1 ? { title: ax.title } : {}) },
  };
}

// the nodes made (Plots, a Merge for several axes) and their edges from the script's outputs
export function figureNodes(fig: MplFigure, num: number, py: { id: string; x: number; y: number; w: number }, uid: (t: string) => string): { nodes: AppNode[]; edges: Edge[] } {
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];
  const at = (dx: number, dy: number) => ({ x: py.x + py.w + dx, y: py.y + dy });
  // in the order of their grid (row by row)
  const order = fig.axes.map((a, k) => ({ a, k })).sort((p, q) => (p.a.row ?? 0) - (q.a.row ?? 0) || (p.a.col ?? 0) - (q.a.col ?? 0));
  const plots: string[] = [];
  order.forEach(({ a, k }, i) => {
    const id = uid('plot1d');
    plots.push(id);
    nodes.push({ id, type: 'plot1d', position: at(80 + (a.col ?? 0) * 620, (a.row ?? 0) * 560 + (fig.axes.length > 1 ? 0 : i * 560)), data: axesPlot(a, fig, id) } as AppNode);
    const port = `py-${figPort(num, k, fig.axes.length)}`;
    edges.push({ id: `e-${py.id}-${port}-${id}-dataset`, source: py.id, sourceHandle: port, target: id, targetHandle: 'dataset' });
  });
  if (plots.length > 1) {
    const id = uid('canvas');
    nodes.push({ id, type: 'canvas', position: at(80 + fig.cols * 620, 0), data: { ...structuredClone(CANVAS_DEFAULTS), unit: 'in', width: +fig.w.toFixed(2), height: +fig.h.toFixed(2), size: fig.size, layout: { ...CANVAS_DEFAULTS.layout, rows: fig.rows, cols: fig.cols } } } as AppNode);
    plots.forEach((p) => edges.push({ id: `e-${p}-figure-${id}-figures`, source: p, sourceHandle: 'figure', target: id, targetHandle: 'figures' }));
  }
  return { nodes, edges };
}
