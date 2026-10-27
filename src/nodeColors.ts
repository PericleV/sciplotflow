// Colour code and titles of the node types: one colour per section of the Nodes panel (title bar, minimap).
import type { AppNode, NodeType } from './types.ts';

export const GROUP_COLORS = {
  Data: '#2f6fd6',
  Statistics: '#d6568f',
  Graph: '#e07b39',
  Annotate: '#7a8a2e',
  Analysis: '#8e5bd0',
  Signal: '#1f9a9a',
  Groups: '#4f8f9b',
  Notes: '#8a93a6',
} as const;
export type Section = keyof typeof GROUP_COLORS;

// The palette offered for group frames (neutral first).
export const FRAME_COLORS = ['#8a93a6', GROUP_COLORS.Data, GROUP_COLORS.Statistics, GROUP_COLORS.Graph, GROUP_COLORS.Annotate, '#2e9e6a', '#9b6bd6', '#d9a13b'];

export const NODE_SECTION: Record<NodeType, Section> = {
  import: 'Data',
  book: 'Data',
  extract: 'Data',
  autoextract: 'Data',
  tosheets: 'Data',
  datamanip: 'Data',
  unstack: 'Data',
  convert: 'Data',
  transpose: 'Data',
  stack: 'Data',
  combine: 'Data',
  fit: 'Analysis',
  calculus: 'Analysis',
  pick: 'Analysis',
  curvemath: 'Analysis',
  siggen: 'Signal',
  smooth: 'Signal',
  baseline: 'Signal',
  waveform: 'Signal',
  steps: 'Signal',
  events: 'Signal',
  wavelet: 'Signal',
  fraccalc: 'Signal',
  frft: 'Signal',
  interp: 'Signal',
  normalize: 'Signal',
  fft: 'Signal',
  convolve: 'Signal',
  translate: 'Data',
  filterrows: 'Data',
  clean: 'Data',
  digitizer: 'Data',
  phasedigitizer: 'Data',
  eis: 'Analysis',
  image: 'Data',
  phasediagram: 'Analysis',
  average: 'Signal',
  peaks: 'Analysis',
  peakwidth: 'Analysis',
  mathcol: 'Data',
  python: 'Analysis',
  gencol: 'Data',
  columns: 'Data',
  stats: 'Statistics',
  normality: 'Statistics',
  ttest: 'Statistics',
  anova: 'Statistics',
  nonparam: 'Statistics',
  correl: 'Statistics',
  padjust: 'Statistics',
  contingency: 'Statistics',
  roc: 'Statistics',
  survival: 'Statistics',
  regress: 'Statistics',
  power: 'Statistics',
  resample: 'Statistics',
  distfit: 'Statistics',
  agree: 'Statistics',
  methcomp: 'Statistics',
  logistic: 'Statistics',
  plot1d: 'Graph',
  histogram: 'Graph',
  barchart: 'Graph',
  boxviolin: 'Graph',
  probplot: 'Graph',
  blandaltman: 'Graph',
  pie: 'Graph',
  contour: 'Graph',
  polar: 'Graph',
  smith: 'Graph',
  scattermatrix: 'Graph',
  ternary: 'Graph',
  waterfall: 'Graph',
  plot3d: 'Graph',
  matrix: 'Data',
  matcomp: 'Analysis',
  kk: 'Analysis',
  canvas: 'Graph',
  drawing: 'Graph',
  note: 'Notes',
  frame: 'Notes',
  reroute: 'Notes',
  subgraph: 'Groups',
  groupin: 'Groups',
  groupout: 'Groups',
};

export const NODE_COLORS = Object.fromEntries(Object.entries(NODE_SECTION).map(([t, s]) => [t, GROUP_COLORS[s]])) as Record<NodeType, string>;

export const nodeColor = (n: AppNode): string => (n.type === 'frame' ? n.data.color || GROUP_COLORS.Notes : NODE_COLORS[n.type]);

// Readable text on a coloured bar: dark on light colours, white otherwise.
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const v = parseInt(m[1], 16);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  return L > 0.36 ? '#1d1d1f' : '#ffffff';
}

export const NODE_TITLES: Record<NodeType, string> = {
  import: 'Import',
  book: 'Workbook',
  extract: 'Extract column',
  autoextract: 'Sheets to columns',
  tosheets: 'Columns to sheets',
  datamanip: 'Data manipulation',
  unstack: 'Split into columns',
  convert: 'Convert columns',
  transpose: 'Transpose',
  stack: 'Stack columns',
  combine: 'Combine columns',
  fit: 'Fit',
  calculus: 'Differentiate / Integrate',
  pick: 'Pick points',
  curvemath: 'Curve math',
  smooth: 'Smooth',
  baseline: 'Baseline correction',
  waveform: 'Waveform measurements',
  steps: 'Step detection',
  events: 'Event averaging',
  wavelet: 'Wavelet',
  fraccalc: 'Fractional calculus',
  frft: 'Fractional FFT',
  interp: 'Interpolate / Extrapolate',
  normalize: 'Normalize',
  fft: 'FFT',
  convolve: 'Convolution',
  translate: 'Translate & resize',
  filterrows: 'Filter & sort rows',
  clean: 'Clean data',
  digitizer: 'Digitizer',
  phasedigitizer: 'Phase digitizer',
  eis: 'Equivalent circuit',
  image: 'Image analysis',
  phasediagram: 'Phase diagram',
  average: 'Average curves',
  peaks: 'Peak analyzer',
  peakwidth: 'Peak width',
  mathcol: 'Math column',
  python: 'Python script',
  gencol: 'Generate column',
  siggen: 'Signal generator',
  columns: 'Columns',
  stats: 'Descriptive statistics',
  normality: 'Normality & outliers',
  ttest: 't-tests & variances',
  anova: 'ANOVA',
  nonparam: 'Nonparametric tests',
  correl: 'Correlation',
  padjust: 'Adjust p-values',
  contingency: 'Contingency tables',
  roc: 'ROC curve',
  survival: 'Survival (Kaplan–Meier)',
  regress: 'Linear regression',
  power: 'Power & sample size',
  resample: 'Bootstrap & permutation',
  distfit: 'Distribution fit',
  agree: 'Agreement & reliability',
  methcomp: 'Method comparison',
  logistic: 'Logistic regression',
  plot1d: '1D plot',
  histogram: 'Histogram',
  barchart: 'Bar chart',
  boxviolin: 'Box & violin',
  probplot: 'Probability plot',
  blandaltman: 'Bland–Altman',
  pie: 'Pie chart',
  contour: 'Contour / heatmap',
  polar: 'Polar / radar',
  smith: 'Smith chart',
  scattermatrix: 'Scatter matrix',
  ternary: 'Ternary',
  waterfall: 'Waterfall',
  plot3d: '3D plot',
  matrix: 'Matrix',
  matcomp: 'Matrix computation',
  kk: 'Kramers–Kronig',
  canvas: 'Merge',
  drawing: 'Figure Drawing',
  note: 'Note',
  frame: 'Frame',
  reroute: 'Reroute',
  subgraph: 'Group',
  groupin: 'Group input',
  groupout: 'Group output',
};

export const nodeTitle = (n: AppNode): string => (n.type === 'subgraph' && n.data.batch ? 'Batch' : NODE_TITLES[n.type]);

// A short name of a node for tooltips: its type and its own name / label / caption when it has one.
export function nodeDisplayName(n: AppNode): string {
  const d = n.data as { name?: unknown; label?: unknown; caption?: unknown; column?: unknown };
  const own = [d.caption, d.name, d.label, d.column].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return own ? `${nodeTitle(n)} “${own}”` : nodeTitle(n);
}

// Nodes not offered for new graphs (they still open in saved projects).
export const HIDDEN_NODES = new Set<string>([]);
