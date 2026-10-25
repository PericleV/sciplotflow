// Typed ports: a connection is valid only when the target accepts the type of the source's port. A Reroute (a point
// on a connection) passes on whatever reaches it: its type is the type of what is connected to it.
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types.ts';
import { STATS } from './stats.ts';
import { partHandle, stepParts } from './matrix.ts';

export type PortType = 'workbook' | 'dataset' | 'column' | 'scalar' | 'matrix' | 'figure' | 'any';

// (a workbook — several sheets — violet with a ring, apart from a dataset — one table —, blue)
export const PORT_COLORS: Record<PortType, string> = {
  workbook: '#7b3fb5',
  dataset: '#2f6fd6',
  column: '#2e9e6a',
  scalar: '#d64545',
  matrix: '#c0398b',
  figure: '#e07b39',
  any: '#8a93a6',
};
export const PORT_LABELS: Record<PortType, string> = {
  workbook: 'workbook (several sheets, each a table: Extract column, Sheets to columns or a Workbook take one)',
  dataset: 'dataset (one table: several columns)',
  column: 'column',
  scalar: 'single value',
  matrix: 'matrix (m × n numbers: Matrix, Matrix computation; drawn by Contour / heatmap)',
  figure: 'figure (a Plot: page, axes, curves, legend, annotations)',
  any: 'anything (nothing connected yet)',
};
const ALL: PortType[] = ['workbook', 'dataset', 'column', 'scalar', 'matrix', 'figure'];

const STAT_KEYS = new Set<string>(STATS.map((s) => s.key));
// The ports of the curve rows of a Plot: row 0 'x', 'y' …, row k 'x-k', 'y-k' …
export const ROW_PORTS = ['x', 'y', 'yerr', 'ylo', 'xerr', 'color', 'size', 'label', 'series'] as const;
export type RowPort = (typeof ROW_PORTS)[number];
export const rowHandle = (port: RowPort | 'series', k: number) => (k === 0 ? port : `${port}-${k}`);
export function parseRowHandle(h: string): { port: RowPort; row: number } | null {
  const m = /^(x|y|yerr|ylo|xerr|color|size|label|series)(?:-(\d+))?$/.exec(h);
  return m ? { port: m[1] as RowPort, row: m[2] ? Number(m[2]) : 0 } : null;
}

// The graph, for the type of a Reroute (what is connected to it).
// groupInputs: inside a group, its input ports (the types of what reaches them)
export type PortContext = { node: (id: string) => AppNode | undefined; edges: Edge[]; groupInputs?: { id: string; type?: string }[] };

export function sourcePort(node: AppNode, handle?: string | null, ctx?: PortContext, depth = 0): PortType | null {
  switch (node.type) {
    case 'import':
    case 'book':
    case 'pick':
      return handle === 'book' ? 'workbook' : 'dataset';
    case 'autoextract':
    case 'datamanip':
      return 'dataset';
    case 'columns':
      // every sheet of a workbook: a workbook
      return handle === 'names' ? 'column' : node.data.sheet === '*' ? 'workbook' : 'dataset';
    case 'peakwidth':
    case 'baseline':
    case 'waveform':
    case 'steps':
    case 'events':
    case 'wavelet':
    case 'fraccalc':
    case 'frft':
      return 'dataset';
    case 'fit':
      return 'dataset';
    case 'calculus':
      return handle === 'area' ? 'scalar' : 'dataset';
    case 'peaks':
    case 'normality':
    case 'ttest':
    case 'anova':
    case 'nonparam':
    case 'correl':
    case 'padjust':
    case 'contingency':
    case 'roc':
    case 'survival':
    case 'regress':
    case 'power':
    case 'resample':
    case 'distfit':
    case 'agree':
    case 'methcomp':
    case 'logistic':
    case 'curvemath':
    case 'translate':
    case 'clean':
    case 'smooth':
    case 'interp':
    case 'normalize':
    case 'fft':
    case 'convolve':
    case 'average':
    case 'digitizer':
    case 'kk':
      return 'dataset';
    case 'unstack':
      return 'dataset';
    case 'convert':
    case 'transpose':
    case 'stack':
      return handle === 'book' ? 'workbook' : 'dataset';
    case 'tosheets':
      return 'workbook';
    case 'filterrows':
      // every sheet of a workbook: a workbook; the parts: a dataset each, all of them as sheets
      return handle === 'parts' || node.data.sheet === '*' ? 'workbook' : 'dataset';
    case 'combine': {
      if (handle === 'source') return 'column';
      // what it gives: one column, a dataset, a workbook (in sheets; into a sheet of a workbook)
      const res = node.data.result;
      if (res === 'column') return 'column';
      if (res === 'side' || res === 'tables') return 'dataset';
      if (res === 'sheets') return 'workbook';
      if (res === 'into') {
        const e = ctx?.edges.find((x) => x.target === node.id && x.targetHandle === `in-${node.data.into ?? 0}`);
        const src = e && ctx?.node(e.source);
        return src && depth < 50 && sourcePort(src, e.sourceHandle, ctx, depth + 1) === 'workbook' ? 'workbook' : 'dataset';
      }
      // older nodes — side by side: a dataset; else columns in → a column out, a dataset among the inputs → a dataset
      if (node.data.how === 'side') return 'dataset';
      const ins = ctx?.edges.filter((x) => x.target === node.id && /^in-\d+$/.test(x.targetHandle ?? '')) ?? [];
      return depth < 50 && ins.some((e) => {
        const src = ctx?.node(e.source);
        return src && sourcePort(src, e.sourceHandle, ctx, depth + 1) === 'dataset';
      })
        ? 'dataset'
        : 'column';
    }
    case 'extract':
      return node.data.value ? 'scalar' : 'column';
    case 'mathcol':
      return node.data.output === 'value' ? 'scalar' : 'column';
    case 'python': {
      // its outputs as last run: py-<name>, by their kind
      const o = node.data.outs?.find((q) => `py-${q.name}` === handle);
      return o ? o.kind : null;
    }
    case 'gencol':
      return 'column';
    case 'stats': {
      // on rows: every statistic a column, X, and the dataset
      if (node.data.on === 'rows') return handle === 'out' ? 'dataset' : handle === 'x' || STAT_KEYS.has(handle ?? '') ? 'column' : null;
      if (handle === 'table' || handle === 'control') return 'dataset';
      if (!handle || !STAT_KEYS.has(handle)) return null;
      // of a dataset (several columns): every statistic a column
      const e = ctx?.edges.find((x) => x.target === node.id && x.targetHandle === 'in');
      const src = e && ctx?.node(e.source);
      return src && depth < 50 && sourcePort(src, e.sourceHandle, ctx, depth + 1) === 'dataset' ? 'column' : 'scalar';
    }
    case 'plot1d':
      return (handle && handle.startsWith('series')) || handle === 'fits' ? 'dataset' : handle === 'figure' ? 'figure' : null;
    case 'histogram':
      return handle === 'figure' ? 'figure' : handle === 'bins' || handle === 'fits' || handle === 'curves' ? 'dataset' : null;
    case 'barchart':
      return handle === 'figure' ? 'figure' : handle === 'values' || handle === 'significance' ? 'dataset' : null;
    case 'boxviolin':
      return handle === 'figure' ? 'figure' : handle === 'stats' || handle === 'significance' ? 'dataset' : null;
    case 'probplot':
    case 'blandaltman':
      return handle === 'figure' ? 'figure' : handle === 'stats' || handle === 'points' ? 'dataset' : null;
    case 'pie':
      return handle === 'figure' ? 'figure' : handle === 'slices' ? 'dataset' : null;
    case 'contour':
      return handle === 'figure' ? 'figure' : handle === 'grid' || handle === 'row' || handle === 'column' ? 'dataset' : null;
    case 'polar':
    case 'ternary':
      return handle === 'figure' ? 'figure' : null;
    case 'waterfall':
      return handle === 'figure' ? 'figure' : handle === 'data' ? 'dataset' : null;
    case 'plot3d':
      return handle === 'figure' ? 'figure' : null;
    case 'matrix':
      return handle === 'dataset' ? 'dataset' : 'matrix';
    case 'matcomp': {
      // every step's results: a matrix or a single value, by its operation
      for (const s of node.data.steps) for (const p of stepParts(s)) if (partHandle(s.id, p.key) === handle) return p.kind;
      return null;
    }
    case 'scattermatrix':
      return handle === 'figure' ? 'figure' : handle === 'corr' ? 'dataset' : null;
    case 'reroute': {
      if (!ctx || depth > 50) return 'any';
      const e = ctx.edges.find((x) => x.target === node.id);
      const src = e && ctx.node(e.source);
      return (src && sourcePort(src, e.sourceHandle, ctx, depth + 1)) || 'any';
    }
    case 'subgraph': {
      // a Batch: a row per file, a sheet per file, every file's rows
      // (and every result kept on its own port, k-…: a table)
      if (node.data.batch) return handle === 'sheets' ? 'workbook' : handle === 'table' || handle === 'stacked' || handle?.startsWith('k-') ? 'dataset' : null;
      // what the inside source of this output gives
      const e = node.data.edges.find((x) => x.target === 'group-out' && x.targetHandle === handle);
      const src = e && node.data.nodes.find((x) => x.id === e.source);
      const inner: PortContext = { node: (id) => node.data.nodes.find((x) => x.id === id), edges: node.data.edges };
      return (src && depth < 20 && sourcePort(src, e.sourceHandle, inner, depth + 1)) || 'any';
    }
    case 'groupin': {
      // the type the group's input had when it was made (in the group's data, above this level)
      const t = ctx?.groupInputs?.find((p) => p.id === handle)?.type;
      return t && t !== 'any' ? (t as PortType) : 'any';
    }
    case 'drawing':
      return handle === 'figure' ? 'figure' : null;
    case 'image':
      return handle === 'figure' ? 'figure' : handle === 'matrix' ? 'matrix' : handle === 'workbook' ? 'workbook' : null;
    case 'phasedigitizer':
      return handle === 'workbook' ? 'workbook' : handle === 'figure' ? 'figure' : 'dataset';
    case 'eis':
      return handle === 'circuit' ? 'figure' : handle === 'parameters' || handle === 'fitted' || handle === 'ranges' || handle === 'curve' ? 'dataset' : null;
    case 'phasediagram':
      return handle === 'figure' || handle === 'cooling' ? 'figure' : handle === 'points' || handle === 'fractions' || handle === 'boundaries' ? 'dataset' : null;
    case 'canvas':
    case 'note':
    case 'frame':
    case 'groupout':
      return null;
  }
}

export function targetAccepts(node: AppNode, handle: string | null | undefined): PortType[] {
  if (!handle) return [];
  switch (node.type) {
    case 'extract':
    case 'autoextract':
      return handle === 'in' ? ['dataset', 'workbook'] : [];
    case 'book':
      return /^in-\d+$/.test(handle) ? ['column', 'dataset', 'workbook', 'matrix'] : [];
    case 'convert':
    case 'transpose':
    case 'stack':
      return handle === 'in' ? ['dataset', 'workbook'] : [];
    case 'tosheets':
    case 'datamanip':
    case 'unstack':
    case 'columns':
      // a workbook: the sheet named in the node
      return handle === 'in' ? ['dataset', 'workbook'] : /^in-\d+$/.test(handle) ? ['column', 'scalar'] : [];
    case 'peakwidth':
      return handle === 'in' ? ['dataset'] : [];
    case 'combine':
      return /^in-\d+$/.test(handle) ? ['column', 'dataset', 'workbook'] : [];
    case 'average':
      return /^in-\d+$/.test(handle) ? ['dataset'] : [];
    case 'fit':
      return handle === 'in' ? ['dataset'] : handle === 'irf' ? ['dataset', 'column'] : [];
    case 'pick':
    case 'eis':
      // a workbook: the sheet chosen in the node
      return handle === 'in' ? ['dataset', 'workbook'] : [];
    case 'peaks':
    case 'normality':
    case 'ttest':
    case 'anova':
    case 'nonparam':
    case 'correl':
    case 'padjust':
    case 'contingency':
    case 'roc':
    case 'survival':
    case 'regress':
    case 'resample':
    case 'distfit':
    case 'agree':
    case 'methcomp':
    case 'logistic':
      return handle === 'in' ? ['dataset'] : [];
    case 'curvemath':
      // a curve from a dataset or a sheet of a workbook, or from columns (one X, a Y for each curve)
      return handle === 'a' || handle === 'b' ? ['dataset', 'workbook'] : handle === 'x' || handle === 'ya' || handle === 'yb' ? ['column'] : [];
    case 'smooth':
    case 'fft':
    case 'clean':
      return handle === 'in' ? ['dataset'] : [];
    case 'filterrows':
      // a workbook: the sheet chosen in the node, or every sheet
      return handle === 'in' ? ['dataset', 'workbook'] : [];
    case 'interp':
      return handle === 'in' ? ['dataset'] : handle === 'at' ? ['column', 'dataset'] : [];
    case 'normalize':
      return handle === 'in' ? ['dataset'] : handle === 'by' ? ['column', 'dataset'] : [];
    case 'convolve':
      return handle === 'in' ? ['dataset'] : handle === 'kernel' ? ['column', 'dataset'] : [];
    case 'kk':
      return handle === 'in' ? ['dataset'] : [];
    case 'translate':
      return handle === 'data' ? ['dataset'] : /^in-\d+$/.test(handle) ? ['column'] : [];
    case 'calculus':
    case 'baseline':
      return handle === 'in' ? ['dataset'] : handle === 'base' ? ['dataset', 'column'] : [];
    case 'waveform':
    case 'steps':
    case 'events':
    case 'wavelet':
    case 'fraccalc':
    case 'frft':
      return handle === 'in' ? ['dataset'] : [];
    case 'mathcol':
      return /^in-\d+$/.test(handle) ? ['column', 'scalar'] : [];
    case 'python':
      return /^in-\d+$/.test(handle) ? ['column', 'scalar', 'dataset', 'matrix', 'workbook'] : [];
    case 'gencol':
      return handle === 'like' ? ['column'] : [];
    case 'stats':
      return handle === 'in' ? ['column', 'dataset'] : [];
    case 'plot1d': {
      if (handle === 'dataset') return ['dataset', 'workbook'];
      if (handle === 'insets') return ['figure'];
      const r = parseRowHandle(handle);
      return !r ? [] : r.port === 'series' ? ['dataset'] : ['column'];
    }
    case 'histogram':
    case 'barchart':
    case 'boxviolin':
    case 'probplot':
    case 'blandaltman':
    case 'pie':
    case 'contour':
    case 'polar':
    case 'scattermatrix':
    case 'ternary':
    case 'waterfall':
    case 'plot3d':
      // 3D stacked maps: B, C … a layer each
      if (node.type === 'plot3d' && /^layer-\d+$/.test(handle)) return ['dataset'];
      if (node.type === 'contour' && handle === 'matrix') return ['matrix'];
      // a workbook: the sheet named in the node
      // (Plot 3D: a matrix too, read as one)
      if (handle === 'dataset') return node.type === 'scattermatrix' ? ['dataset'] : node.type === 'plot3d' ? ['dataset', 'workbook', 'matrix'] : ['dataset', 'workbook'];
      return (handle === 'pvalues' && (node.type === 'barchart' || node.type === 'boxviolin')) || (handle === 'overlay' && (node.type === 'barchart' || node.type === 'contour')) ? ['dataset'] : handle === 'insets' ? ['figure'] : [];
    case 'matrix':
      return handle === 'in' ? ['dataset'] : [];
    case 'matcomp':
      return /^in-\d+$/.test(handle) ? ['matrix', 'column', 'scalar'] : [];
    case 'canvas':
      return handle === 'figures' ? ['figure'] : [];
    case 'drawing':
      return handle === 'under' ? ['figure'] : [];
    case 'reroute':
    case 'groupout':
      return handle === 'in' || node.type === 'groupout' ? ALL : [];
    case 'subgraph': {
      // a Batch's first input: the files (a workbook, a sheet each; or one dataset)
      if (node.data.batch && handle === node.data.inputs[0]?.id) return ['workbook', 'dataset'];
      // what the inside node fed by this input accepts
      const e = node.data.edges.find((x) => x.source === 'group-in' && x.sourceHandle === handle);
      const t = e && node.data.nodes.find((x) => x.id === e.target);
      return t ? targetAccepts(t, e.targetHandle) : [];
    }
    default:
      return [];
  }
}

// Target handles that accept any number of incoming connections (drawn as squares).
// (3D stacked maps: A, B, C … one dataset each)
export const isMultiInput = (node: AppNode | undefined, handle: string | null | undefined) => !(node?.type === 'plot3d' && node.data.kind === 'layers' && handle === 'dataset') && ((node?.type === 'canvas' && handle === 'figures') || ((node?.type === 'plot1d' || node?.type === 'histogram' || node?.type === 'barchart' || node?.type === 'boxviolin' || node?.type === 'probplot' || node?.type === 'blandaltman' || node?.type === 'pie' || node?.type === 'contour' || node?.type === 'polar' || node?.type === 'scattermatrix' || node?.type === 'ternary' || node?.type === 'waterfall' || node?.type === 'plot3d') && (handle === 'dataset' || handle === 'insets')));

export function canConnect(source?: AppNode, target?: AppNode, targetHandle?: string | null, sourceHandle?: string | null, ctx?: PortContext) {
  if (!source || !target || source.id === target.id) return false;
  const p = sourcePort(source, sourceHandle, ctx);
  if (!p) return false;
  const acc = targetAccepts(target, targetHandle);
  return p === 'any' ? acc.length > 0 : acc.includes(p);
}
