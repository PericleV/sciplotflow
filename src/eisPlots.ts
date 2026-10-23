// The graphs of an EIS node drawn by Plots from its data: Nyquist, |Z|, phase, Bode. The node gives the data (“fitted”:
// every point and the fit there) and the fit drawn smooth (“curve”); a Plot draws them. Used by the examples and by the
// conversion of older projects (12 → 13), whose figure outputs of the EIS node became such Plots.
import type { Edge } from '@xyflow/react';
import type { CurveRow, Plot1DData } from './types.ts';
import { PLOT1D_DEFAULTS, PLOT_PAGE_DEFAULTS } from './defaults.ts';
import { AXES_STYLE_DEFAULTS, AXIS_DEFAULTS, CURVE_STYLE_DEFAULTS, SIDE_DEFAULTS, type AxesStyle, type CurveStyle } from './figure/spec.ts';

export type EisGraph = 'figure' | 'mod' | 'phase' | 'bode';
const F = 'Frequency (Hz)';
const dots = (color: string, right = false): Partial<CurveStyle> => ({ ...CURVE_STYLE_DEFAULTS, mode: 'scatter', color, symbol: 'circle', symbolSize: 4, symbolFill: 'open', ...(right ? { axisY: 'right' as const } : {}) });
const line = (color: string, right = false): Partial<CurveStyle> => ({ ...CURVE_STYLE_DEFAULTS, mode: 'line', color, lineWidth: 1.2, ...(right ? { axisY: 'right' as const, dash: 'dash' as const } : {}) });
const side = (title: string) => ({ ...SIDE_DEFAULTS, title });

// The Plot of one graph: its first curve the data (the dataset port: “fitted”), the fit from the “curve” output on the
// series ports of its rows (the port of row k: series-k)
export function eisPlotData(g: EisGraph): { data: Plot1DData; series: number[] } {
  const logX = { ...AXES_STYLE_DEFAULTS.x, scale: 'log' as const };
  const axes = (p: Partial<AxesStyle>): Partial<AxesStyle> => ({ ...AXES_STYLE_DEFAULTS, ...p });
  const base = { ...PLOT1D_DEFAULTS, legend: { show: true, x: 96, y: 4, anchor: 'tr' as const } };
  if (g === 'figure')
    return {
      data: { ...base, label: 'data', style: dots('#1f77b4'), cols: { x: "Z' (Ω)", y: "-Z'' (Ω)" }, rows: [{ label: 'fit', style: line('#d62728'), cols: { x: "Z' fit (Ω)", y: "-Z'' fit (Ω)" } }], axes: axes({ aspect: 1, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side("Z' (Ω)"), left: side("-Z'' (Ω)") } }), page: { ...PLOT_PAGE_DEFAULTS, name: 'nyquist' } },
      series: [1],
    };
  if (g === 'mod')
    return {
      data: { ...base, label: '|Z|', style: dots('#1f77b4'), cols: { x: F, y: '|Z| (Ω)' }, rows: [{ label: 'fit', style: line('#d62728'), cols: { x: F, y: '|Z| fit (Ω)' } }], axes: axes({ x: logX, y: { ...AXES_STYLE_DEFAULTS.y, scale: 'log' }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side(F), left: side('|Z| (Ω)') } }), page: { ...PLOT_PAGE_DEFAULTS, name: 'bode_modulus' } },
      series: [1],
    };
  if (g === 'phase')
    return {
      data: { ...base, label: 'phase', style: dots('#1f77b4'), cols: { x: F, y: 'Phase (°)' }, rows: [{ label: 'fit', style: line('#d62728'), cols: { x: F, y: 'Phase fit (°)' } }], axes: axes({ x: logX, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side(F), left: side('Phase (°)') } }), page: { ...PLOT_PAGE_DEFAULTS, name: 'bode_phase' } },
      series: [1],
    };
  // Bode: |Z| on the left (log), the phase on the right
  const rows: CurveRow[] = [
    { label: '|Z| fit', style: line('#1f77b4'), cols: { x: F, y: '|Z| fit (Ω)' } },
    { label: 'phase', style: dots('#ff7f0e', true), cols: { x: F, y: 'Phase (°)' } },
    { label: 'phase fit', style: line('#ff7f0e', true), cols: { x: F, y: 'Phase fit (°)' } },
  ];
  return {
    data: {
      ...base,
      label: '|Z|',
      style: dots('#1f77b4'),
      cols: { x: F, y: '|Z| (Ω)' },
      rows,
      axes: axes({ x: logX, y: { ...AXES_STYLE_DEFAULTS.y, scale: 'log' }, right: { ...AXES_STYLE_DEFAULTS.right, mode: 'own', scale: { ...AXIS_DEFAULTS } }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side(F), left: side('|Z| (Ω)'), right: side('Phase (°)') } }),
      page: { ...PLOT_PAGE_DEFAULTS, name: 'bode' },
    },
    // (row 2 is the phase measured: from “fitted”, as the first curve)
    series: [1, 3],
  };
}
// the connections of such a Plot: “fitted” to its dataset port, “curve” to the series ports of the fit's rows; the rows
// of data on a series port take “fitted” too
export function eisPlotEdges(eis: string, plot: string, g: EisGraph): Edge[] {
  const { series } = eisPlotData(g);
  const dataRows = g === 'bode' ? [2] : [];
  return [
    { id: `e-${eis}-fitted-${plot}`, source: eis, sourceHandle: 'fitted', target: plot, targetHandle: 'dataset' },
    ...series.map((k) => ({ id: `e-${eis}-curve-${plot}-${k}`, source: eis, sourceHandle: 'curve', target: plot, targetHandle: `series-${k}` })),
    ...dataRows.map((k) => ({ id: `e-${eis}-fitted-${plot}-${k}`, source: eis, sourceHandle: 'fitted', target: plot, targetHandle: `series-${k}` })),
  ];
}

type RawNode = { id: string; type: string; position?: { x: number; y: number }; data: Record<string, unknown> };
// (12 → 13) the figure outputs of an EIS node gone: every graph connected becomes a Plot of its data, connected where
// the figure was (in a graph and in the groups inside it)
export function eisFiguresAsPlots(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const nodes = ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n) => (n && n.type === 'subgraph' && n.data && typeof n.data === 'object' ? { ...n, data: { ...n.data, ...eisFiguresAsPlots(n.data.nodes, n.data.edges) } } : n));
  const edges = (Array.isArray(rawEdges) ? rawEdges : []) as Edge[];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const added: RawNode[] = [];
  const out: Edge[] = [];
  const made = new Map<string, string>();
  for (const e of edges) {
    const src = byId.get(e.source);
    const g = e.sourceHandle as EisGraph;
    if (src?.type !== 'eis' || !['figure', 'mod', 'phase', 'bode'].includes(g)) {
      out.push(e);
      continue;
    }
    const key = `${src.id}:${g}`;
    let plot = made.get(key);
    if (!plot) {
      plot = `${src.id}-${g === 'figure' ? 'nyquist' : g}`;
      made.set(key, plot);
      const k = made.size - 1;
      const at = src.position ?? { x: 0, y: 0 };
      added.push({ id: plot, type: 'plot1d', position: { x: at.x + 720, y: at.y + 480 * k }, data: eisPlotData(g).data as unknown as Record<string, unknown> });
      out.push(...eisPlotEdges(src.id, plot, g));
    }
    out.push({ ...e, id: `${e.id}-plot`, source: plot, sourceHandle: 'figure' });
  }
  return { nodes: [...nodes, ...added], edges: out };
}
