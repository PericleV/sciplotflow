// The settings of a new node of each type.
import { CSV_DEFAULTS } from './engine/csv.ts';
import { AXES_STYLE_DEFAULTS, AXIS_DEFAULTS, COLORBAR_DEFAULTS, CURVE_STYLE_DEFAULTS, FONTS, SHAPE_DEFAULTS, TEXT_SPEC_DEFAULTS } from './figure/spec.ts';
import type { MatCompData, MatrixData, PickData, CalculusData, BookSheet, WorkbookData, ColumnsData, PeakWidthData, CombineData, UnstackData, ConvertData, TransposeData, StackData, ToSheetsData, AnnotationItem, AutoExtractData, CanvasData, DrawingData, DrawingGrid, CanvasLayout, DataManipData, ExtractData, FitNodeData, GenColData, SigGenData, ImportData, MathColData, PythonData, NoteData, Plot1DData, PlotPage, StatsData, PeakData, AnovaData, CorrData, NonparData, NormData, TTestData, CurveMathData, TranslateData, ConvData, FFTData, InterpData, NormalizeData, SmoothData, AverageData, CleanData, DigitizerData, FilterData, HistogramData, BarChartData, BoxViolinData, ProbPlotData, BlandAltmanData, PieData, ContourData, PolarData, SmithData, ScatterMatrixData, TernaryData, WaterfallData, Plot3DData } from './types.ts';
import { SET_COLORS } from './engine/digitize.ts';
import type { PhaseDigitizerData } from './engine/phasedigitize.ts';
import type { EisData } from './engine/eis.ts';
import type { ContingencyData, PAdjustData, RegressData, RocData, SurvivalData } from './engine/statnodes2.ts';
import type { AgreeData, DistFitData, LogisticData, MethCompData, PowerData, ResampleData } from './engine/statnodes3.ts';
import type { BaselineData } from './engine/baselinenode.ts';
import type { FracData, FrftData } from './engine/fracnodes.ts';
import type { WaveletData } from './engine/waveletnode.ts';
import type { WaveformData, StepsData, EventsData } from './engine/signal2nodes.ts';
import type { ImageAnalysisData } from './image/node.ts';
import type { MatrixPlotSpec } from './engine/matrixplot.ts';

export const IMPORT_DEFAULTS: ImportData = { name: '', fileName: '', text: '', textId: '', csv: CSV_DEFAULTS };
// a new sheet: an empty table of 2 columns × 10 rows to type in
export const newSheet = (name: string): BookSheet => ({ name, text: '', edits: { addRows: 10, addCols: 2 } });
export const WORKBOOK_DEFAULTS: WorkbookData = { name: '', sheets: [newSheet('Sheet1')], sheet: 0 };
export const EXTRACT_DEFAULTS: ExtractData = { column: '', index: 0 };
export const FIT_DEFAULTS: FitNodeData = {
  x: '',
  ys: [],
  yerr: '',
  global: false,
  model: { kind: 'library', model: 'gauss', degree: 2, formula: 'A*exp(-x/t) + y0', shape: 'lorentz', count: 2, baseline: 'constant' },
  params: [],
  ranges: [],
  weight: 'auto',
  band: 'confidence',
  points: 400,
};
export const CALCULUS_DEFAULTS: CalculusData = { op: 'diff', x: '', ys: '', order: 1, method: 'central', window: 7, poly: 2, area: 'signed', baseline: 'zero', base: 0, join: 'separate', regions: [] };
const STAT_IN = { layout: 'columns' as const, cols: '', value: '', factor: '', factor2: '', alpha: 0.05 };
export const NORM_DEFAULTS: NormData = { ...STAT_IN, outliers: 'grubbs' };
export const TTEST_DEFAULTS: TTestData = { ...STAT_IN, test: 'two', mu: 0, equalVar: false, alt: 'two-sided' };
export const ANOVA_DEFAULTS: AnovaData = { ...STAT_IN, design: 'one', welch: false, post: 'tukey' };
export const NONPAR_DEFAULTS: NonparData = { ...STAT_IN, test: 'kruskal', mu: 0, alt: 'two-sided', post: 'holm' };
export const CORR_DEFAULTS: CorrData = { cols: '', method: 'pearson', alpha: 0.05 };
export const PADJUST_DEFAULTS: PAdjustData = { col: '', method: 'holm', alpha: 0.05 };
export const CONTINGENCY_DEFAULTS: ContingencyData = { layout: 'raw', rowCol: '', colCol: '', count: '', cols: '', test: 'independence', yates: false, expected: '', alpha: 0.05 };
export const ROC_DEFAULTS: RocData = { truth: '', positive: '', scores: '', dir: 'auto', cutoff: 'youden', target: 0.9, alpha: 0.05 };
export const SURVIVAL_DEFAULTS: SurvivalData = { time: '', event: '', eventIs: '', group: '', test: 'logrank', pairs: true, ci: 'loglog', at: '', alpha: 0.05 };
export const POWER_DEFAULTS: PowerData = { test: 't2', solve: 'n', effect: 0.5, n: 20, power: 0.8, alpha: 0.05, alt: 'two-sided', ratio: 1, k: 3, p1: 0.3, events: 0.6 };
export const RESAMPLE_DEFAULTS: ResampleData = { mode: 'bootstrap', layout: 'columns', cols: '', value: '', factor: '', stat: 'median', q: 0.9, B: 9999, ci: 'bca', level: 0.95, alt: 'two-sided', seed: 1 };
export const DISTFIT_DEFAULTS: DistFitData = { col: '', censor: '', dists: [], level: 0.95 };
export const AGREE_DEFAULTS: AgreeData = { mode: 'icc', cols: '', weights: 'none', level: 0.95, alpha: 0.05 };
export const METHCOMP_DEFAULTS: MethCompData = { x: '', y: '', method: 'both', lambda: 1, level: 0.95 };
export const LOGISTIC_DEFAULTS: LogisticData = { y: '', positive: '', xs: '', factors: '', interact: false, intercept: true, threshold: 0.5, alpha: 0.05 };
export const BASELINE_DEFAULTS: BaselineData = { x: '', ys: '', regions: [], method: 'arpls', base: 0, baseOpt: { lambda: 6 }, bgOrder: 2, mode: 'subtract', outside: 'empty', original: false };
export const WAVEFORM_DEFAULTS: WaveformData = { x: '', ys: '', regions: [], levels: 'histogram', base: 0, top: 1, lo: 10, hi: 90, hyst: 5, tol: 2 };
export const STEPS_DEFAULTS: StepsData = { x: '', ys: '', regions: [], cost: 'mean', method: 'pelt', penalty: 'bic', factor: 3, minSize: 5, count: 0 };
export const EVENTS_DEFAULTS: EventsData = { x: '', ys: '', regions: [], trigger: 'rising', level: NaN, markCol: '', times: '', before: NaN, after: NaN, gap: NaN, baseline: true, spread: 'sd' };
export const WAVELET_DEFAULTS: WaveletData = { x: '', ys: '', regions: [], mode: 'cwt', mother: 'morlet', param: NaN, voices: 12, pMin: NaN, pMax: NaN, level: 0.95, noise: 'red', band1: NaN, band2: NaN, y2: '', wavelet: 'sym8', levels: 5, keep: '', rule: 'bayes', thr: 'soft', perLevel: false, wMin: NaN, wMax: NaN, minSnr: 1, noisePerc: 10 };
export const FRAC_DEFAULTS: FracData = { x: '', ys: '', regions: [], orders: '-0.5', method: 'rl', along: 'x', rate: 0.1, semi: false, electrons: 1, area: 0.0707, conc: 1, unit: 'A' };
export const FRFT_DEFAULTS: FrftData = { x: '', ys: '', regions: [], mode: 'scan', order: 0.5, auto: true, u1: NaN, u2: NaN, width: 3, keep: 'remove' };
export const REGRESS_DEFAULTS: RegressData = { y: '', xs: '', factors: '', interact: false, intercept: true, weights: '', alpha: 0.05 };
export const CURVEMATH_DEFAULTS: CurveMathData = { ya: '', yb: '', op: 'dxAtY', values: '', crossing: 'first', abs: false, grid: 'a', from: NaN, to: NaN, points: 200 };
export const TRANSLATE_DEFAULTS: TranslateData = { roles: {}, mode: 'value', dx: 0, dy: 0, own: {}, point: 'max', atx: 0, moveX: false, moveY: true, x0: 0, y0: 0 };
export const IMAGE_DEFAULTS: ImageAnalysisData = { name: '', steps: [] };
export { PHASE_DEFAULTS } from './engine/phasenode.ts';
export const DIGITIZER_DEFAULTS: DigitizerData = {
  image: '',
  imageName: '',
  w: 0,
  h: 0,
  cal: 'axes',
  axes: [null, null, null, null],
  corners: [null, null, null, null],
  xRange: [NaN, NaN],
  yRange: [NaN, NaN],
  grid: [],
  gridFit: 'tps',
  logX: false,
  logY: false,
  xName: '',
  yName: '',
  sets: [{ name: 'Set 1', color: SET_COLORS[0], points: [] }],
  active: 0,
  order: 'x',
  auto: { mode: 'line', color: null, tol: 20, step: 3, minSize: 4, maxSize: 400, area: [], exclude: [] },
};
export const PHASE_DIGITIZER_DEFAULTS: PhaseDigitizerData = {
  image: '',
  fileName: '',
  w: 0,
  h: 0,
  cal: 'axes',
  axes: [null, null, null, null],
  corners: [null, null, null, null],
  grid: [],
  gridFit: 'tps',
  xLog: false,
  yLog: false,
  compA: '',
  compB: '',
  yName: 'T',
  yUnit: '°C',
  border: [null, null, null, null],
  showBorder: true,
  splines: [],
  activeSpline: 0,
  snapTol: 10,
  regions: [],
  showRegions: true,
  leverPoints: [],
  notes: [],
  annotations: [],
};
export const EIS_DEFAULTS: EisData = { form: 'reim', freq: '', re: '', im: '', imSign: 'auto', freqUnit: 'Hz', circuit: 'R(RQ)', params: [], weight: 'modulus', excluded: [], labels: 'decades', values: false, view: 'nyquist' };
export const AVERAGE_DEFAULTS: AverageData = { x: '', ys: '', grid: 'union', points: 200, from: NaN, to: NaN, need: 'all', k: 2, method: 'linear', extra: false };
export const SMOOTH_DEFAULTS: SmoothData = { x: '', ys: '', method: 'savgol', points: 11, order: 3, sigma: 2, frac: 0.2, iter: 3, cutoff: 0.1, edge: 'interp', withData: true, withResid: false };
export const INTERP_DEFAULTS: InterpData = { x: '', ys: '', method: 'spline', extrap: 'none', grid: 'points', from: NaN, to: NaN, points: 500, step: 1 };
export const NORMALIZE_DEFAULTS: NormalizeData = { x: '', ys: '', method: 'max', at: 0, value: 1, from: NaN, to: NaN };
export const FFT_DEFAULTS: FFTData = { x: '', ys: '', mode: 'spectrum', output: 'amp', window: 'hann', detrend: 'mean', pad: false, filter: 'low', f1: 0, f2: 0, order: 0, mirror: true };
export { KK_DEFAULTS } from './engine/kk.ts';
export const CONV_DEFAULTS: ConvData = { x: '', ys: '', op: 'conv', shape: 'gauss', fwhm: 1, lambda: 0.01, iterations: 30, edge: 'reflect' };
export const FILTER_DEFAULTS: FilterData = { rows: { mode: 'all' }, dup: 'keep', dupCol: '', sortBy: '', desc: false, every: 1 };
export const CLEAN_DEFAULTS: CleanData = { cols: '', missing: 'keep', value: 0, window: 5, outliers: 'median', k: 3, alpha: 0.05, action: 'mask' };
export const PEAK_DEFAULTS: PeakData = { x: '', ys: '', baseline: 'linear', subtract: false, find: { sign: 'peaks', count: 6, minHeight: 5, shoulders: false }, shape: 'gauss', peaks: [], fit: true, needRun: true };
export const PICK_DEFAULTS: PickData = { x: '', ys: '', rules: [{ kind: 'x', value: '' }], interp: 'linear', outside: 'empty', layout: 'long', others: 'none' };
export const DATAMANIP_DEFAULTS: DataManipData = { x: '', y: '', ops: [] };
export const AUTOEXTRACT_DEFAULTS: AutoExtractData = {
  rules: [
    { sheets: '*', columns: '1', role: 'x' },
    { sheets: '*', columns: '2', role: 'y' },
  ],
  names: 'sheet',
  mode: 'simple',
};
export const CONVERT_DEFAULTS: ConvertData = { to: 'numbers', cols: '' };
export const TRANSPOSE_DEFAULTS: TransposeData = { names: '', head: 'text' };
export const STACK_DEFAULTS: StackData = { cols: '', key: 'text' };
export const TOSHEETS_DEFAULTS: ToSheetsData = { mode: 'columns', cols: '' };
export const UNSTACK_DEFAULTS: UnstackData = { x: '', ys: '', by: 'auto', names: '', xs: 'first', naming: 'block' };
export const COMBINE_DEFAULTS: CombineData = { how: 'after', at: 0, match: 'name', x: '', dup: 'all', name: '' };
export const MATHCOL_DEFAULTS: MathColData = { name: '', formula: '' };
export const PYTHON_DEFAULTS: PythonData = { code: '# The inputs A, B … are variables here; the variables you make are the outputs.\nimport numpy as np\n\n' };
export const GENCOL_DEFAULTS: GenColData = { name: 'x', mode: 'linspace', count: 101, start: 0, stop: 10, step: 0.1, formula: 'i^2', dist: 'normal', a: 0, b: 1, seed: 1 };
export const SIGGEN_DEFAULTS: SigGenData = {
  kind: 'components',
  xFrom: 0,
  xTo: 10,
  points: 1000,
  xName: 't (s)',
  yName: 'Signal',
  components: [{ id: 'c1', kind: 'sine', p: { A: 1, f: 1, phase: 0, offset: 0 } }],
  cv: { type: 'n', mode: 'deep', temps: '14, 300', dop: 1e16, tox: 14, epsOx: 3.9, epsS: 9.66, eg: 3.3, mc: 0.45, mv: 0.66, area: 1, vfbFrom: 'typed', vfb: 1, phiM: 4.6, chi: 3.6, nox: 0, vFrom: -10, vTo: 10, points: 500, unit: 'pF' },
  eis: { circuit: 'R(RC)', params: [{ name: 'R1', value: 10 }, { name: 'R2', value: 100 }, { name: 'C1', value: 1e-6 }], fMin: 0.1, fMax: 1e5, per: 10 },
  noise: { kind: 'none', dist: 'normal', by: 'snr', snr: 20, sigma: 0.1 },
  seed: 1,
};
export const STATS_DEFAULTS: StatsData = { on: 'columns' };
export const PEAKWIDTH_DEFAULTS: PeakWidthData = { x: '', ys: '', kind: 'auto', base: 'line', baseValue: 0, regions: [] };
export const COLUMNS_DEFAULTS: ColumnsData ={ items: [], find: '', replace: '', prefix: '', suffix: '', namesRow: 0 };
// a Plot's page: one journal column, the frame placed by the margins its axes need
export const PLOT_PAGE_DEFAULTS: PlotPage = { width: 85, height: 65, unit: 'mm', font: FONTS[0][0], size: 8, bold: false, italic: false, textColor: '#000000', background: 'white', border: 0, borderColor: '#000000', dpi: 600, name: 'figure', frame: 'auto', pad: 3 };
export const PLOT1D_DEFAULTS: Plot1DData = { label: '', style: CURVE_STYLE_DEFAULTS, legend: { show: true, x: 96, y: 4, anchor: 'tr', auto: true }, page: { ...PLOT_PAGE_DEFAULTS } };
export const HISTOGRAM_DEFAULTS: HistogramData = {
  ys: '',
  bins: { mode: 'auto', count: 10, width: NaN, start: NaN, edges: '', from: NaN, to: NaN },
  norm: 'count',
  cumulative: false,
  multi: 'overlap',
  look: 'bars',
  gap: 0,
  opacity: 0.6,
  edgeWidth: 0.5,
  edgeColor: '#000000',
  fits: [],
  legend: { show: true, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const BARCHART_DEFAULTS: BarChartData = {
  mode: 'table',
  cat: '',
  ys: '',
  errs: '',
  value: '',
  group: '',
  sub: '',
  stat: 'mean',
  err: 'sd',
  points: false,
  arrange: 'grouped',
  horizontal: false,
  width: 0.8,
  gap: 0,
  base: 0,
  colorBy: 'series',
  opacity: 1,
  edgeColor: '#000000',
  edgeWidth: 0.5,
  errCap: 4,
  errWidth: 0.75,
  errDir: 'both',
  labels: 'none',
  decimals: NaN,
  hideBelow: 0,
  legend: { show: true, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const BOXVIOLIN_DEFAULTS: BoxViolinData = {
  mode: 'table',
  ys: '',
  value: '',
  group: '',
  sub: '',
  kind: 'box',
  whisker: 'iqr',
  k: 1.5,
  notch: false,
  mean: false,
  outliers: true,
  inner: 'box',
  bandwidth: 'scott',
  bw: NaN,
  cut: 'data',
  scale: 'width',
  split: false,
  points: 'none',
  horizontal: false,
  width: 0.6,
  gap: 0.1,
  colorBy: 'series',
  opacity: 0.8,
  edgeColor: '#000000',
  edgeWidth: 0.75,
  medianColor: '#000000',
  medianWidth: 1.2,
  legend: { show: true, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const PROBPLOT_DEFAULTS: ProbPlotData = {
  kind: 'qq',
  mode: 'table',
  ys: '',
  value: '',
  group: '',
  dist: 'normal',
  params: 'fit',
  p1: NaN,
  p2: NaN,
  positions: 'blom',
  qqAxis: 'standard',
  line: 'quartiles',
  band: 'none',
  level: 95,
  ecdfY: 'probability',
  complementary: false,
  ecdfLook: 'steps',
  swap: false,
  symbol: 'circle',
  symbolSize: 5,
  symbolFill: 'open',
  lineColor: '',
  lineWidth: 1,
  lineDash: 'solid',
  bandDash: 'dash',
  legend: { show: true, x: 4, y: 4, anchor: 'tl', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const BLANDALTMAN_DEFAULTS: BlandAltmanData = {
  a: '',
  b: '',
  group: '',
  x: 'mean',
  y: 'diff',
  loa: 'parametric',
  level: 95,
  ci: 'approx',
  ciLevel: 95,
  regLine: false,
  zeroLine: true,
  labels: true,
  symbol: 'circle',
  symbolSize: 5,
  symbolFill: 'open',
  lineWidth: 1,
  ciOpacity: 0.15,
  legend: { show: true, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const PIE_DEFAULTS: PieData = {
  mode: 'table',
  cat: '',
  ys: '',
  value: '',
  group: '',
  stat: 'sum',
  hole: 0,
  size: 80,
  start: 90,
  clockwise: true,
  sort: 'none',
  other: 0,
  ringGap: 2,
  labels: 'namePercent',
  labelPos: 'auto',
  decimals: NaN,
  hideBelow: 0,
  center: 'none',
  centerText: '',
  opacity: 1,
  edgeColor: '#ffffff',
  edgeWidth: 1,
  legend: { show: false, x: 98, y: 50, anchor: 'cr' },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const CONTOUR_DEFAULTS: ContourData = {
  layout: 'xyz',
  x: '',
  y: '',
  z: '',
  yCol: '',
  zs: '',
  grid: 100,
  draw: 'heat',
  smooth: false,
  levels: 'auto',
  nLevels: 8,
  step: NaN,
  list: '',
  zMin: NaN,
  zMax: NaN,
  log: false,
  cmap: 'viridis',
  cmapColors: ['#2166ac', '#f7f7f7', '#b2182b'],
  reverse: false,
  lineColor: '',
  lineWidth: 0.6,
  lineLabels: false,
  labelDecimals: NaN,
  nanColor: '',
  colorbar: true,
  zTitle: '',
  profileX: NaN,
  profileY: NaN,
  legend: { show: false, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
// Matrix: a 3 × 3 typed in to start from; Matrix computation: one step, the inverse of A; a Contour drawing a matrix:
// row 1 at the top, square cells, the axes up to the cells' edges — MATRIX_CONTOUR_DEFAULTS also its ticks outwards
// (inside they would read as minus signs by the values in the cells)
const outTicks = { ...AXES_STYLE_DEFAULTS.sides, bottom: { ...AXES_STYLE_DEFAULTS.sides.bottom, ticks: 'out' as const }, left: { ...AXES_STYLE_DEFAULTS.sides.left, ticks: 'out' as const }, top: { ...AXES_STYLE_DEFAULTS.sides.top, ticks: 'none' as const }, right: { ...AXES_STYLE_DEFAULTS.sides.right, ticks: 'none' as const } };
export const MATRIX_DEFAULTS: MatrixData = { name: '', source: 'typed', text: '1\t2\t3\n4\t5\t6\n7\t8\t10', gen: 'identity', rows: 3, cols: 3, value: 0, list: '1, 2, 3', formula: 'i + j', dist: 'normal', a: 0, b: 1, seed: 1, angle: 30, zs: '', rowAt: '', colAt: 'auto' };
export const MATCOMP_DEFAULTS: MatCompData = { steps: [{ id: 's1', op: 'inverse', a: 'A' }] };
export const MATRIX_PLOT_DEFAULTS: MatrixPlotSpec = {
  axesFrom: 'index',
  rowOne: 'top',
  square: true,
  cellValues: false,
  cellDecimals: NaN,
  cellSize: NaN,
  cellColor: '',
  names: true,
};
export const MATRIX_CONTOUR_DEFAULTS: ContourData = {
  ...CONTOUR_DEFAULTS,
  ...MATRIX_PLOT_DEFAULTS,
  axes: { x: { ...AXIS_DEFAULTS, range: 'tight' }, y: { ...AXIS_DEFAULTS, range: 'tight' }, sides: outTicks },
};
export const POLAR_DEFAULTS: PolarData = {
  kind: 'polar',
  theta: '',
  rs: '',
  unit: 'deg',
  cat: '',
  ys: '',
  mode: 'line',
  fill: false,
  close: false,
  barWidth: NaN,
  zero: 'E',
  clockwise: false,
  from: 0,
  to: 360,
  rMin: NaN,
  rMax: NaN,
  rTicks: 5,
  thetaStep: 30,
  thetaLabels: 'deg',
  rLabelAngle: 22.5,
  gridShape: 'polygon',
  lineWidth: 1.2,
  symbol: 'circle',
  symbolSize: 4,
  symbolFill: 'filled',
  opacity: 0.25,
  gridColor: '#b0b0b0',
  legend: { show: true, x: 100, y: 0, anchor: 'tr' },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const SMITH_DEFAULTS: SmithData = {
  input: 'z',
  a: '',
  b: '',
  freq: '',
  z0: 50,
  mode: 'line',
  color: '#0072B2',
  lineWidth: 1.2,
  symbol: 'circle',
  symbolSize: 3,
  colorBy: 'one',
  cmap: 'viridis',
  markerInfo: ['f', 'z'],
  grid: 'z',
  density: 'medium',
  gridColor: '#9aa3b2',
  yColor: '#d08770',
  gridLabels: true,
  scale: 'none',
  legend: { show: true, x: 100, y: 0, anchor: 'tr' },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const SCATTERMATRIX_DEFAULTS: ScatterMatrixData = {
  cols: '',
  group: '',
  diag: 'hist',
  lower: 'scatter',
  upper: 'corr',
  method: 'pearson',
  fit: false,
  symbol: 'circle',
  symbolSize: 3,
  opacity: 0.7,
  gap: 2,
  legend: { show: true, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS, width: 150, height: 150 },
};
export const TERNARY_DEFAULTS: TernaryData = {
  a: '',
  b: '',
  c: '',
  group: '',
  scale: 'fraction',
  mode: 'scatter',
  step: 0.1,
  gridColor: '#c8c8c8',
  symbol: 'circle',
  symbolSize: 4,
  symbolFill: 'filled',
  lineWidth: 1.2,
  legend: { show: true, x: 100, y: 0, anchor: 'tr' },
  page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 75 },
};
export const WATERFALL_DEFAULTS: WaterfallData = {
  x: '',
  ys: '',
  z: 'auto',
  zTitle: '',
  units: 'percent',
  dx: 3,
  dy: 12,
  normalize: 'none',
  front: 'first',
  fill: 'hide',
  fillColor: '',
  fillOpacity: 0.35,
  colorMap: 'viridis',
  reverse: false,
  colorbar: true,
  mode: 'line',
  lineWidth: 1,
  dash: 'solid',
  symbol: 'circle',
  symbolSize: 3,
  symbolFill: 'filled',
  baselines: false,
  baselineColor: '',
  labels: 'none',
  labelText: '',
  labelDecimals: NaN,
  labelSize: NaN,
  labelColor: '',
  legend: { show: false, x: 96, y: 4, anchor: 'tr', auto: true },
  page: { ...PLOT_PAGE_DEFAULTS },
};
export const PLOT3D_DEFAULTS: Plot3DData = {
  kind: 'surface',
  layout: 'xyz',
  x: '',
  y: '',
  z: '',
  yCol: '',
  zs: '',
  grid: 60,
  group: '',
  ys: '',
  zFrom: 'auto',
  azim: -60,
  elev: 30,
  persp: 0,
  aspectX: 1,
  aspectY: 1,
  aspectZ: 0.75,
  colorBy: 'z',
  cmap: 'viridis',
  cmapColors: ['#2166ac', '#f7f7f7', '#b2182b'],
  reverse: false,
  color: '#4878d0',
  colorbar: true,
  zMin: NaN,
  zMax: NaN,
  resolution: 50,
  opacity: 1,
  shade: 0.35,
  mesh: 0,
  meshColor: '',
  meshWidth: 0.3,
  floor: 'none',
  floorLevels: 8,
  barWidth: 0.8,
  barEdge: '',
  symbol: 'circle',
  symbolSize: 4,
  symbolFill: 'filled',
  drop: false,
  depthShade: true,
  lineWidth: 1.2,
  dash: 'solid',
  walls: true,
  wallOpacity: 0.3,
  panes: '#f0f0f0',
  gridColor: '#d0d0d0',
  edges: 'back',
  titleX: '',
  titleY: '',
  titleZ: '',
  ticks: 5,
  legend: { show: true, x: 100, y: 0, anchor: 'tr' },
  page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 75 },
};
export const CANVAS_LAYOUT_DEFAULTS: CanvasLayout = { rows: 1, cols: 2, sizing: 'fit', hgap: 0, vgap: 0, margin: 0, shareX: 'none', shareY: 'none', inner: false, arrange: 'grid', stackGap: 0, ratios: '' };
export const CANVAS_DEFAULTS: CanvasData = { width: 180, height: 70, unit: 'mm', font: FONTS[0][0], size: 8, bold: false, italic: false, textColor: '#000000', background: 'white', border: 0, borderColor: '#000000', panels: '(a)', panelText: {}, panelX: 2, panelY: 2, dpi: 600, name: 'figure', layout: { ...CANVAS_LAYOUT_DEFAULTS } };
// a new annotation of each kind (on a Plot: % of the frame)
let next = 0;
export const newAnnotation = (type: AnnotationItem['type'], spec: object = {}): AnnotationItem => {
  const id = `${Date.now().toString(36)}${(next++).toString(36)}`;
  if (type === 'shape') return { id, type, spec: { ...SHAPE_DEFAULTS, ...spec } };
  if (type === 'text') return { id, type, spec: { ...TEXT_SPEC_DEFAULTS, ...spec } };
  return { id, type, spec: { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, ...spec } };
};
export const DRAWING_GRID_DEFAULTS: DrawingGrid = { step: 1, unit: 'mm', show: true, snap: true };
export const DRAWING_DEFAULTS: DrawingData = { width: 85, height: 60, unit: 'mm', font: FONTS[0][0], size: 8, bold: false, italic: false, textColor: '#000000', background: 'white', border: 0, borderColor: '#000000', dpi: 600, name: 'drawing', annotations: [], grid: { ...DRAWING_GRID_DEFAULTS }, snapObjects: true };
export const NOTE_DEFAULTS: NoteData = { text: '' };
// The size a new note starts with (px), so its text has room before any resizing.
export const NOTE_SIZE = { width: 400, height: 220 };
