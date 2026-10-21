// “Plot these columns” made into nodes: a 1D plot (its curves each from a sheet, its X and Y), several (a Plot per sheet
// or per curve, put together in a Merge if asked), the curves added to a Plot already there, or another graph (bars, a
// histogram, boxes, a pie, polar, a waterfall, a 3D plot) of the columns of one sheet. Pure: the nodes and edges to add, the data
// of a Plot changed.
import type { Edge } from '@xyflow/react';
import { CANVAS_DEFAULTS, BARCHART_DEFAULTS, BOXVIOLIN_DEFAULTS, HISTOGRAM_DEFAULTS, PIE_DEFAULTS, PLOT1D_DEFAULTS, PLOT3D_DEFAULTS, POLAR_DEFAULTS, WATERFALL_DEFAULTS } from './defaults.ts';
import { plotRows } from './engine/evaluate.ts';
import { PALETTE, type CurveStyle } from './figure/spec.ts';
import { layoutAxes, type XLayout, type YLayout } from './figure/multiAxes.ts';
import type { AppNode, CurveRow, Plot1DData } from './types.ts';

// how the curves are drawn (1D plot) or the graph made of the columns
export type GraphKind = 'linesymbol' | 'line' | 'scatter' | 'step' | 'spline' | 'area' | 'stacked' | 'lollipop' | 'barchart' | 'histogram' | 'boxviolin' | 'pie' | 'polar' | 'waterfall' | 'scatter3d' | 'lines3d' | 'surface' | 'wireframe' | 'bars3d' | 'waterfall3d';
// a 3D plot of one X, Y, Z (the first curve's)
export const XYZ: GraphKind[] = ['scatter3d', 'lines3d', 'surface', 'wireframe', 'bars3d'];
export const ONE_D: GraphKind[] = ['linesymbol', 'line', 'scatter', 'step', 'spline', 'area', 'stacked', 'lollipop'];
export const is1D = (g: GraphKind) => ONE_D.includes(g);
// a curve: the sheet its columns come from (a workbook), its X, Y (Z: a 3D plot) and errors ('' = none)
export type PlotCurve = { sheet?: string; x: string; y: string; z?: string; yerr: string; xerr: string };
// split: one Plot, a Plot per sheet or per curve (merge: then together in a Merge); into: a Plot already there (its id)
// the curves go to ('' = a new one); sheet: the sheet of another graph; yAxes / xAxes: a new Plot's curves each on an
// axis of its own (absent: one Y, one X)
export type PlotChoice = { graph: GraphKind; curves: PlotCurve[]; sheet?: string; into: string; split: 'one' | 'sheet' | 'curve'; merge: boolean; yAxes?: YLayout; xAxes?: XLayout };

// the look of a curve drawn so
function look(g: GraphKind): Partial<CurveStyle> {
  if (g === 'spline') return { mode: 'line', connect: 'spline' };
  if (g === 'area') return { mode: 'line', fill: 'zero', fillOpacity: 0.3 };
  if (g === 'stacked') return { mode: 'line' };
  if (g === 'lollipop') return { mode: 'scatter', symbolFill: 'filled', drop: 'vertical' };
  return { mode: g as CurveStyle['mode'] };
}
// a list of columns as the graphs read it: by name (by number when a name holds a comma)
const listOf = (names: string[], all: string[]) => names.map((nm) => (nm.includes(',') ? String(all.indexOf(nm) + 1) : nm)).join(', ');

const rowOf = (c: PlotCurve, k: number, g: GraphKind, book: boolean): CurveRow => ({
  label: '',
  style: { ...PLOT1D_DEFAULTS.style, color: PALETTE[k % PALETTE.length], ...look(g) },
  cols: { x: c.x || undefined, y: c.y, ...(c.yerr ? { yerr: c.yerr } : {}), ...(c.xerr ? { xerr: c.xerr } : {}) },
  ...(book && c.sheet ? { sheet: c.sheet } : {}),
});

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): Edge => ({ id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle });

// src: the node of the data (its place and width; book: it gives a workbook on its “book” output); columnsOf: the names of
// the columns of a sheet ('' = the one shown); uid: a new node id of a type; into: the Plot the curves go to, its edges
export function buildFigure(
  src: { id: string; x: number; y: number; w: number; book: boolean },
  c: PlotChoice,
  columnsOf: (sheet: string | undefined) => string[],
  uid: (type: string) => string,
  into?: { node: AppNode; rowEdges: Set<number>; hasEdge: boolean },
): { nodes: AppNode[]; edges: Edge[]; update?: { id: string; data: Partial<Plot1DData> } } {
  const handle = src.book ? 'book' : 'out';
  const at = (dx: number, dy = 0) => ({ x: src.x + src.w + dx, y: src.y + dy });
  // another graph: the columns of one sheet
  if (!is1D(c.graph)) {
    const all = columnsOf(c.sheet);
    const ys = listOf(c.curves.map((q) => q.y), all);
    const x = c.curves[0]?.x ?? '';
    const sheet = src.book && c.sheet ? { sheet: c.sheet } : {};
    const t = c.graph;
    // a 3D plot: X, Y, Z of the first curve (scatter, lines, a surface …), or X and the Y columns (a waterfall)
    if (t === 'scatter3d' || t === 'lines3d' || t === 'surface' || t === 'wireframe' || t === 'bars3d' || t === 'waterfall3d') {
      const kind = t === 'scatter3d' ? 'scatter' : t === 'lines3d' ? 'lines' : t === 'bars3d' ? 'bars' : t === 'waterfall3d' ? 'waterfall' : t;
      const q = c.curves[0];
      const id = uid('plot3d');
      const d3 = { ...structuredClone(PLOT3D_DEFAULTS), kind, layout: 'xyz' as const, ...(kind === 'waterfall' ? { x, ys } : { x: q?.x ?? '', y: q?.y ?? '', z: q?.z ?? '' }), ...sheet };
      return { nodes: [{ id, type: 'plot3d', position: at(80), data: d3 } as AppNode], edges: [edge(src.id, handle, id, 'dataset')] };
    }
    const data =
      t === 'barchart'
        ? { ...structuredClone(BARCHART_DEFAULTS), mode: 'table' as const, cat: x, ys, errs: c.curves.some((q) => q.yerr) ? listOf(c.curves.map((q) => q.yerr), all) : '' }
        : t === 'histogram'
          ? { ...structuredClone(HISTOGRAM_DEFAULTS), ys }
          : t === 'boxviolin'
            ? { ...structuredClone(BOXVIOLIN_DEFAULTS), mode: 'table' as const, ys }
            : t === 'pie'
              ? { ...structuredClone(PIE_DEFAULTS), mode: 'table' as const, cat: x, ys }
              : t === 'polar'
                ? { ...structuredClone(POLAR_DEFAULTS), kind: 'polar' as const, theta: x, rs: ys }
                : { ...structuredClone(WATERFALL_DEFAULTS), x, ys };
    const id = uid(t);
    return { nodes: [{ id, type: t, position: at(80), data: { ...data, ...sheet } } as AppNode], edges: [edge(src.id, handle, id, 'dataset')] };
  }
  // curves added to a Plot already there: after its curves (its first, when it has none yet)
  if (into) {
    const d = into.node.data as Plot1DData;
    const stored = plotRows(d, 1 + (d.rows?.length ?? 0));
    const empty = !stored[0].cols?.y && !into.rowEdges.has(0) && stored.length === 1;
    const kept = empty ? [] : stored;
    const added = c.curves.map((q, j) => rowOf(q, kept.length + j, c.graph, src.book));
    const [head, ...rest] = [...kept, ...added];
    const data: Partial<Plot1DData> = { label: head.label, style: head.style, cols: head.cols, sheet: head.sheet, rowSel: head.rowSel, trend: head.trend, aggregate: head.aggregate, quickFits: head.quickFits, rows: rest, legend: { ...PLOT1D_DEFAULTS.legend!, ...d.legend, show: d.legend?.show || kept.length + added.length > 1 } };
    return { nodes: [], edges: into.hasEdge ? [] : [edge(src.id, handle, into.node.id, 'dataset')], update: { id: into.node.id, data } };
  }
  // new Plots: one, or one per sheet / per curve
  const groups: PlotCurve[][] = [];
  if (c.split === 'one') groups.push(c.curves);
  else if (c.split === 'curve') groups.push(...c.curves.map((q) => [q]));
  else {
    const by = new Map<string, PlotCurve[]>();
    for (const q of c.curves) by.set(q.sheet ?? '', [...(by.get(q.sheet ?? '') ?? []), q]);
    groups.push(...by.values());
  }
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];
  const plots: string[] = [];
  groups.forEach((g, i) => {
    let rows = g.map((q, k) => rowOf(q, k, c.graph, src.book));
    // several Y (X) axes: every curve on its own, the axes coloured as their curves
    const multi = g.length > 1 && ((c.yAxes ?? 'one') !== 'one' || (c.xAxes ?? 'one') !== 'one') ? layoutAxes(g.length, c.yAxes ?? 'one', c.xAxes ?? 'one') : null;
    if (multi) rows = rows.map((r, k) => ({ ...r, style: { ...r.style, ...multi.on[k] } }));
    const [head, ...rest] = rows;
    const id = uid('plot1d');
    plots.push(id);
    const many = g.length > 1;
    nodes.push({
      id,
      type: 'plot1d',
      position: at(80, i * 560),
      data: { ...structuredClone(PLOT1D_DEFAULTS), ...(multi ? { axes: multi.axes } : {}), label: '', style: head.style, cols: head.cols, ...(head.sheet ? { sheet: head.sheet } : {}), rows: rest, legend: { ...PLOT1D_DEFAULTS.legend!, show: many }, ...(g.length > 8 ? { curveColors: { map: 'viridis' as const } } : {}), ...(c.graph === 'stacked' && many ? { stack: 'stack' as const } : {}) },
    } as AppNode);
    edges.push(edge(src.id, handle, id, 'dataset'));
  });
  // several Plots on one page
  if (c.merge && plots.length > 1) {
    const id = uid('canvas');
    const cols = Math.min(plots.length, 2);
    nodes.push({ id, type: 'canvas', position: at(700), data: { ...structuredClone(CANVAS_DEFAULTS), height: 70 * Math.ceil(plots.length / cols), layout: { ...CANVAS_DEFAULTS.layout, rows: Math.ceil(plots.length / cols), cols } } } as AppNode);
    for (const p of plots) edges.push(edge(p, 'figure', id, 'figures'));
  }
  return { nodes, edges };
}
