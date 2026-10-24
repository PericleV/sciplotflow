import type { RichDoc } from './nodes/richDoc.ts';
import type { TrendSpec } from './engine/trend.ts';
import type { AggSpec } from './engine/aggregate.ts';
import type { QuickFitSpec } from './engine/quickfit.ts';
import type { Edge, Node as FlowNode } from '@xyflow/react';
import type { CsvOptions } from './engine/csv.ts';
import type { TableExport } from './engine/exportTable.ts';
import type { SheetEdits, SheetLook } from './engine/sheet.ts';
import type { ExtractNames, ExtractRule } from './engine/extract.ts';
import type { ManipOp } from './engine/manip.ts';
import type { CombineMode, CombinePort, CombineSpec, UnstackSpec } from './engine/reshape.ts';
import type { ConvertData, StackData, TransposeData } from './engine/tableShape.ts';
import type { Baseline, DiffMethod, Pt, Region } from './engine/calculus.ts';
import type { PickOptions, PickRule } from './engine/pick.ts';
import type { BaseKind, FindOptions, PeakItem } from './engine/peaks.ts';
import type { BaseOptions } from './engine/baselines.ts';
import type { AnovaData, CorrData, NonparData, NormData, TTestData } from './engine/statnodes.ts';
import type { CurveMathData, TranslateData } from './engine/curvemath.ts';
import type { CleanData, FilterData } from './engine/cleaning.ts';
import type { BatchSpec } from './engine/batch.ts';
import type { DigitizerData } from './engine/digitize.ts';
import type { HistSpec } from './engine/histogram.ts';
import type { BarSpec } from './engine/barchart.ts';
import type { BoxSpec } from './engine/boxviolin.ts';
import type { ProbSpec } from './engine/probplot.ts';
import type { BASpec } from './engine/blandaltman.ts';
import type { PieSpec } from './engine/piechart.ts';
import type { ContourSpec } from './engine/contour.ts';
import type { PolarSpec } from './engine/polar.ts';
import type { MatrixSpec } from './engine/scattermatrix.ts';
import type { TernarySpec } from './engine/ternary.ts';
import type { WaterfallSpec } from './engine/waterfall.ts';
import type { Plot3DSpec } from './engine/plot3d.ts';
import type { MatCompData, MatSource } from './engine/matrix.ts';
import type { MatrixPlotSpec } from './engine/matrixplot.ts';
export type { MatCompData };
export type { DigitizerData };
export type { CleanData, FilterData };
import type { AverageData, ConvData, FFTData, InterpData, NormalizeData, SmoothData } from './engine/signalnodes.ts';
import type { KKData } from './engine/kk.ts';
export type { KKData };
export type { AverageData, ConvData, FFTData, InterpData, NormalizeData, SmoothData };
export type { CurveMathData, TranslateData };
export type { AnovaData, CorrData, NonparData, NormData, TTestData };
import type { PeakShape } from './engine/fitModels.ts';
import type { RowSelect } from './engine/rowsel.ts';
import type { ColumnRole } from './engine/table.ts';
import type { ColumnsSpec } from './engine/columns.ts';
import type { ImageAnalysisData } from './image/node.ts';
import type { PhaseDiagramData } from './engine/phasenode.ts';
import type { PhaseDigitizerData } from './engine/phasedigitize.ts';
export type { PhaseDigitizerData };
import type { EisData } from './engine/eis.ts';
export type { EisData };
import type { Baseline as WidthBaseline, WidthKind } from './engine/measure.ts';
import type { ModelSpec } from './engine/fitModels.ts';
import type { FitBand, FitParamSpec, FitWeight } from './engine/fit.ts';
import type { AxesStyle, ColorbarSpec, ColorMapName, CurveStyle, Dash, GradFill, InsetItem, LegendSpec, LengthUnit, PanelScheme, Placement, ShapeSpec, TextSpec, TextStyle } from './figure/spec.ts';

// Common to every node: a free label shown above it and the collapsed state (only the title bar shown).
export type NodeMeta = { caption?: string; collapsed?: boolean };
type Node<D extends Record<string, unknown>, T extends string> = FlowNode<D & NodeMeta, T>;

// ---- Data ----
// The file's text is kept in the project (it is the data); textId changes when another file is loaded, so the graph
// is re-read only then (not compared character by character at every change).
// edits: the worksheet — changes made by hand to the table read (or an empty table typed in), kept apart from the file.
// sheets: a spreadsheet workbook or several files (each a sheet; excel: cells written tab-separated with a decimal
// point) — `text` is then unused; sheet: the one shown in the worksheet and given on the dataset output; sheetEdits:
// the worksheet changes of each sheet, by its name.
// textRef: in a project kept in the browser, a big text is in IndexedDB (src/textStore.ts) under this key
export type ImportSheet = { name: string; text: string; excel?: boolean; textRef?: string };
// export: the settings of its Export (src/engine/exportTable.ts)
// look: how its worksheet is drawn (the node's size, the rows' height, the columns' widths)
export type ImportData = { name: string; fileName: string; text: string; textId: string; csv: CsvOptions; edits?: SheetEdits; sheets?: ImportSheet[]; sheet?: number; sheetEdits?: Record<string, SheetEdits>; textRef?: string; export?: Partial<TableExport>; look?: SheetLook };
// Workbook: tables typed or pasted in, on several sheets — or, with something connected, a view of
// that dataset / workbook. A sheet: its table as tab-separated text (a line of names, then the rows; '' = none yet) and
// the worksheet changes over it; sheet: the one shown and given on the dataset output.
export type BookSheet = { name: string; text: string; edits?: SheetEdits; textRef?: string };
// into: for every input A, B, C … the sheet it goes to ('' = the first sheet): inputs on the same sheet side by side (at the right of its own table), read-only
// but for their designations — roles: sheet name → column name → the designation given here. layout: sheet name → its
// columns as arranged when it has inputs (keys: o<n> a column of its own table, n its place as read; i:<name> an
// input's): the order moved by hand, the inputs' columns left out
// rowHide, rowOrder: a sheet of the inputs' rows left out and moved (by their place in it, from 0; the others after)
export type BookLayout = { order?: string[]; hide?: string[]; rowHide?: number[]; rowOrder?: number[] };
// hideSheets: sheets of the inputs taken out of the workbook (by their names; shown again from the node)
// matrix: a matrix on an input (by its port): its rows' names (or Y) as the first column, its columns' names (or X) as the
// names (absent: not asked yet — both, and the node asks)
export type WorkbookData = { name: string; sheets: BookSheet[]; sheet: number; into?: string[]; matrix?: Record<string, { rows: boolean; cols: boolean }>; roles?: Record<string, Record<string, ColumnRole>>; layout?: Record<string, BookLayout>; hideSheets?: string[]; export?: Partial<TableExport>; look?: SheetLook };
// The column is chosen by its name (a file with the columns in another order still works), the index when names repeat.
// sheet: from a workbook, by name; value: one value (the row `row`, 1 … n) instead of the column
export type ExtractData = { column: string; index: number; sheet?: string; value?: boolean; row?: number };
// Auto-extract: columns of the sheets of a workbook taken by rules, into one dataset with their designations.
// mode 'simple' (absent in older projects: the rules): the sheets ticked (by name; absent: all) and every column of the
// first of them with its designation (by its place; 'none': not taken; absent: the sheet's own), the same in every sheet.
export type AutoExtractData = { rules: ExtractRule[]; names: ExtractNames; mode?: 'simple' | 'rules'; pick?: string[]; roles?: (ColumnRole | null)[] };
// Data manipulation: points chosen on the graph of two columns (x, y) masked, deleted or moved — a list of operations.
// added: points drawn by hand, placed at the end, at the start, or in the order of X (the other columns interpolated)
export type DataManipData = { x: string; y: string; ops: ManipOp[]; added?: { x: number; y: number }[]; addAt?: 'end' | 'start' | 'sorted' };
// Fit: X, one or more Y — each a run (the columns of a sweep cut by Split into columns), fitted one by one or together
// (global, the parameters marked shared common to all) —, ±Y for the weights; the model; the parameters (start — NaN:
// guessed —, fixed, limits, shared); fit ranges on X; the curve's points and band.
export type FitNodeData = {
  x: string;
  ys: string[];
  yerr: string;
  global: boolean;
  model: ModelSpec;
  params: FitParamSpec[];
  ranges: { lo: number; hi: number }[];
  // 'run': every run may have its own ranges (runRanges, by the run's name: run1, d = 150 nm …); a run without any
  // takes `ranges`, the common ones
  rangesBy?: 'all' | 'run';
  runRanges?: Record<string, { lo: number; hi: number }[]>;
  // a fit of its own for every range (true), else one fit of the points of all the ranges together
  rangeFits?: boolean;
  weight: FitWeight;
  band: FitBand;
  points: number;
  // York, or any model with xerrFit: the ±X column ('' = the one designated with each Y)
  xerr?: string;
  // the errors of X counted for any model (effective variance: σ² = σy² + (f′(x)·σx)²)
  xerrFit?: boolean;
  // reconvolution: the model convolved with the instrument's response (IRF) — a column of the data (its X the designated
  // one) or the curve on the “irf” port; its shift fitted (absent: yes)
  reconv?: boolean;
  irfFrom?: 'column' | 'port';
  irfColumn?: string;
  irfShift?: boolean;
  // a surface z = f(x, y): X, Y (ys[0]) and Z (zcol) of the data; the model a plane, a quadratic, a 2-D Gaussian, or a
  // formula of x and y (src/engine/surface.ts)
  surface?: boolean;
  zcol?: string;
  // a regression on several predictors (columns, a list; empty: every other numeric column): linear least squares or
  // logistic (a yes / no response) — src/engine/regression.ts; the response Y: ys[0]
  regression?: 'linear' | 'logistic';
  predictors?: string;
  surfaceModel?: string;
  surfaceFormula?: string;
  showResid?: boolean; // the residuals panel under the graph (default shown)
  // a second model fitted on the same runs and compared (AIC, BIC, F-test); its parameters guessed
  compare2?: boolean;
  model2?: ModelSpec;
  // several runs: the same parameters for all (one fit, every parameter shared) against a fit each — an F-test
  sameTest?: boolean;
  // constraints: lines “name = formula of the other parameters” (w2 = w1, xc2 = xc1 + 1.15, A2 = 0.5*A1)
  links?: string;
  // using the fit: Y at these X; X from these Y (the mean of `replicates` measurements each); the limits of detection and
  // quantification; values derived from the parameters (lines “name = formula”) — with their errors
  at?: string;
  inverse?: string;
  replicates?: number;
  lod?: boolean;
  derived?: string;
};
// Split into columns: a long table cut into blocks laid side by side (wl, n then wl, k
// under it → wl, n, k); the blocks found at text / empty lines, where X starts again, by a column, every N rows.
export type UnstackData = UnstackSpec;
// Combine columns: the columns or datasets on A, B, C … put one under the other — after, before,
// inserted at a row, interleaved, sorted by X; name: of the result when the inputs are columns. Or side by side (how
// 'side'): the columns of A, B, C … next to each other — where: in the order of the ports (absent), B, C … at the start,
// after the column `ref` of A or in place of it; names: the new names of the columns added (B, C …), comma-separated.
// result (absent in older nodes: from `how` and the inputs, combineSettings): what comes out — one column, side by side,
// in sheets (a workbook), into a table (the port `into`), tables one under the other; order: the ports in the order
// wanted; ports: the settings of every input (by its port number); desc: sorted, the largest first.
export type CombineData = Omit<CombineSpec, 'how'> & {
  how: CombineSpec['how'] | 'side';
  name: string;
  where?: 'ports' | 'start' | 'after' | 'replace';
  ref?: string;
  names?: string;
  result?: CombineMode;
  order?: number[];
  ports?: Record<string, CombinePort>;
  into?: number;
};
// Differentiate / Integrate: of X and one or more Y (a dataset: from the designations
// or chosen; or a series), every Y on its own (with its X). Derivative: order 1 or 2, the mean of
// the slopes to the neighbours or Savitzky–Golay (window points, polynomial degree). Integral: signed or absolute area
// over a baseline, cumulative, regions separate (from 0 in each) or combined (on across the gaps). Regions on X drawn on
// the node's graph (none: all X), common or of every run (by its name).
export type CalculusData = {
  op: 'diff' | 'int';
  x: string;
  ys: string;
  order: 1 | 2;
  method: DiffMethod;
  window: number;
  poly: number;
  area: 'signed' | 'abs';
  baseline: Baseline;
  base: number;
  // baseline 'points': placed on the graph (common, or of every run as the regions), joined straight or by a spline
  basePoints?: Pt[];
  runBasePoints?: Record<string, Pt[]>;
  baseInterp?: 'linear' | 'spline';
  // baseline 'curve': another column (baseColumn, with its own X when it has one), or the curve on the “baseline” port
  baseFrom?: 'column' | 'port';
  baseColumn?: string;
  // the options of the baseline (its end points, side, degree, smoothness …)
  baseOpt?: BaseOptions;
  join: 'separate' | 'combined';
  regions: Region[];
  regionsBy?: 'all' | 'run';
  runRegions?: Record<string, Region[]>;
};
// Pick points: values read off every curve (run, cycle, Y column) by rules — at X = …, at Y = …, maximum, minimum, rows
// where a condition holds — on each branch of a scan that comes back; every column read at the place found. Output:
// long (a row per point picked) or wide (a row per run).
// others: the other columns read at every point (one Y): 'none', 'all' (absent: all, as older projects had it), or a
// list (2, B-D, names, A*)
// sheet: of a workbook on the input (absent: the first)
// sheetOut: which sheet of the output workbook is active (dataset output and preview, 0-based)
// sheetsMode: 'auto' (separate sheets for X and Y) | 'all' (separate sheet per rule type) | 'one' (all in a single table)
export type PickData = PickOptions & { x: string; ys: string; rules: PickRule[]; layout: 'long' | 'wide'; others?: string; sheet?: string; sheetOut?: number; sheetsMode?: 'auto' | 'all' | 'one' };
// Peak analyzer: every Y column (with its X) between from and to; a baseline (fitted with the
// peaks, or fixed: the ends, the rubber band, points placed on the graph, a column), subtracted or not; the peaks of the
// list (none: found in every run, of `shape`); measured on the data, or fitted together (every peak its shape).
export type PeakData = {
  showResid?: boolean; // the residuals panel under the graph (default shown)
  x: string;
  ys: string;
  from?: number;
  to?: number;
  baseline: BaseKind;
  basePoints?: Pt[];
  baseInterp?: 'linear' | 'spline';
  baseColumn?: string;
  baseValue?: number;
  baseOpt?: BaseOptions;
  subtract: boolean;
  find: FindOptions;
  shape: PeakShape;
  peaks: PeakItem[];
  fit: boolean;
  // auto: the peaks found in every run, of `shape`; manual: the list (absent: manual when there is a list, as before)
  mode?: 'auto' | 'manual';
  // needRun: the fit made only on Run analysis — with the settings of that Run (ran: their key, peakRunKey); absent (an
  // older node): fitted at every change, as before
  needRun?: boolean;
  ran?: string;
};
// A column computed by a formula of the inputs A, B, C … (columns or single values), row by row.
// rules: then, in order, chosen rows (a list, a condition, all) given a formula of the inputs and v (the value so far);
// others: the rows no rule chose — as the formula gave them (absent), empty, or otherValue.
// output 'value': one value (the formula of single values and functions of whole columns: mean(A), max(A) …).
// errors: the errors of the inputs (“A ± 0.02”, “B ± 2%”, “A ± C”), carried to the result (its error on the “error” port)
// complex: the formula in complex numbers (j the imaginary unit), the part given (absent: the real part)
// Python script: its code; the names of its input variables (by port letter: A → 'wl'; absent: the letter); its outputs
// as last run (their names and kinds: its ports), those hidden; run again by itself when the inputs or the code change
// (auto: only if asked) — else only on Run (run: how many times it was pressed)
// figs: the matplotlib figures made into Plots (Make Plot): the data of their axes given out (fig1, fig1_2 …)
export type PythonData = { code: string; vars?: Record<string, string>; outs?: { name: string; kind: 'column' | 'scalar' | 'dataset' | 'matrix' }[]; hide?: string[]; auto?: boolean; run?: number; figs?: number[] };
export type MathColData = { name: string; formula: string; rules?: RowRule[]; others?: 'formula' | 'nan' | 'value'; otherValue?: number; output?: 'column' | 'value'; errors?: string; complex?: boolean; part?: 're' | 'im' | 'abs' | 'arg' | 'deg' | 'db' };
export type GenMode = 'linspace' | 'step' | 'formula' | 'random';
export type GenColData = {
  name: string;
  mode: GenMode;
  count: number; // rows (the length of a column on the “like” port when connected)
  start: number;
  stop: number; // linspace: last value (included)
  step: number; // step: increment
  formula: string; // formula: of i (1 … n) and n
  dist: 'uniform' | 'normal';
  a: number; // uniform: low / normal: mean
  b: number; // uniform: high / normal: standard deviation
  seed: number;
};
// Peak width: every Y (with its X), in every region (none: all X) — a peak's or a dip's place, height over a baseline and
// width at half height measured on the data (no fit), and the minimum and maximum; regions common or of every run.
export type PeakWidthData = {
  x: string;
  ys: string;
  kind: WidthKind;
  base: WidthBaseline['kind'];
  baseValue: number;
  baseOpt?: BaseOptions;
  // base 'points': placed on the graph (common, or of every run as the regions); 'curve': another column
  basePoints?: Pt[];
  runBasePoints?: Record<string, Pt[]>;
  baseInterp?: 'linear' | 'spline';
  baseColumn?: string;
  regions: Region[];
  regionsBy?: 'all' | 'run';
  runRegions?: Record<string, Region[]>;
};
// Columns: the columns of a dataset renamed, designated, left out, moved; every name changed at once; names from a row.
// A workbook in: one sheet (`sheet`), or every sheet (`sheet` '*': a workbook out) — with the same settings for all
// (perSheet 'same', absent) or each sheet its own (perSheet 'own': `sheets` by name; a sheet without its own takes the
// common ones, those of the node); editSheet: the sheet whose settings are shown and changed.
export type ColumnsData = ColumnsSpec & { sheet?: string; perSheet?: 'same' | 'own'; sheets?: Record<string, ColumnsSpec>; editSheet?: string };
// A rule of Math column: chosen rows (a list, a condition, all) given a formula.
export type RowRule = { mode: 'rows' | 'condition' | 'all'; rows: string; formula: string };
// Statistics: on columns (absent `on`) — of a column, or of the columns of a dataset chosen by a list (1, 3-5, B-D, A*;
// empty: the Y columns) — or on rows — every row over the columns chosen (err: the error designated ±Y in its dataset).
// x: the X column for ranges by X and the rule (empty: the designated one, '-': none); rows: the rows used.
// control: a control chart of the (first) column — individuals and moving ranges, or the means and ranges of subgroups
// of `subgroup` values
export type StatsData = { on?: 'columns' | 'rows'; cols?: string; x?: string; rows?: RowSelect; err?: 'sd' | 'se'; control?: 'imr' | 'xbar'; subgroup?: number };

// ---- Figure ----
// One curve of a Plot: its legend text and its style (partial in older projects: merged with the defaults).
// cols: the columns of the curve taken by name from the Plot's dataset (a connected port wins over them)
export type CurveCols = { x?: string; y?: string; yerr?: string; ylo?: string; xerr?: string };
// rowSel: the rows drawn ("1-1001, 5000-end", '' = all)
// trend: a trend line of the curve (least squares, a moving average), its equation in the legend, its band
// aggregate: the repeated X of the curve brought to one point each (the mean or median, its spread as ±Y)
// quickFits: fits drawn with the curve (lines, peaks, a formula; on ranges) — trend: an older project's one trend line
// sheet: a workbook on the Plot's dataset port — the sheet its columns come from (absent: the Plot's dataset, else the
// first sheet)
export type CurveRow = { label: string; style: Partial<CurveStyle>; cols?: CurveCols; sheet?: string; rowSel?: string; trend?: TrendSpec; aggregate?: AggSpec; quickFits?: QuickFitSpec[] };
// A page: its size, its default text (every text on “auto”), background, border; the file name and dpi of its exports.
export type PageData = {
  width: number;
  height: number;
  unit: LengthUnit;
  font: string;
  size?: number; // pt, the default text size
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  background: string; // 'white' | 'none' (transparent) | a colour
  backgroundGrad?: GradFill; // a colour going to another (its gradient)
  border?: number;
  borderColor?: string;
  borderDash?: Dash;
  borderRadius?: number; // pt
  borderOpacity?: number;
  borderInset?: number; // pt in from the edge of the page
  dpi: number;
  name: string;
  // the project in the SVG and PNG files (an editable figure): all of it (absent), without the imported data, or none
  embed?: 'full' | 'nodata' | 'none';
  // a title over the figure (centred at the top; the frame placed under it) and its text
  title?: string;
  titleText?: TextStyle;
  // the numbers the figure writes (axes, values, labels) with a decimal comma: 2,5
  comma?: boolean;
  // the font of the formulas ($…$ in the texts): absent, the one that looks like the text's font
  mathFont?: 'sans' | 'serif' | 'latex';
};
// An annotation kept in a Plot (on its frame: data units or % of the frame) or a Merge (% of the page), or an object of a
// Figure Drawing (in mm): its name in the layers, hidden (not drawn nor exported), locked (not moved with the mouse).
// group: the group it is in (selected together); clipBy / maskBy: the object (its id) it is cut to / masked by.
// pin: an object of a drawing over a Plot that moves with the Plot's data — at: the data point (x, y of the Plot's axes) its
// anchor was on when pinned, ref: where its anchor then was (mm): it is drawn moved by where `at` is now minus `ref`.
// behind: (a drawing over a Plot) drawn behind the Plot's data — under its curves, over its frame's ground and grid
export type AnnotationItem = { id: string; name?: string; hidden?: boolean; locked?: boolean; group?: string; clipBy?: string; maskBy?: string; behind?: boolean; pin?: { at: [number, number]; ref: [number, number] } } & ({ type: 'shape'; spec: Partial<ShapeSpec> } | { type: 'text'; spec: Partial<TextSpec> } | { type: 'colorbar'; spec: Partial<ColorbarSpec> });
// The legend of a Plot: shown or not, and its settings.
export type PlotLegend = Partial<Omit<LegendSpec, 'key' | 'curves' | 'owner'>> & { show: boolean };
// The page of a Plot: frame 'auto' — placed by the margins its axes need (pad pt more around) —, or 'manual' (the
// place in axes.pos, % of the page).
export type PlotPage = PageData & { frame: 'auto' | 'manual'; pad?: number };
// 1D plot: a whole figure. Row 0 of the curves is (label, style) — the single curve of v0.1 —, rows 1, 2 … are in
// `rows` (rows[k − 1]); axes: the frame and its sides (the Axes node of older projects); legend, annotations, page.
// curveColors: the curves coloured by a colour map (by the value of the block each came from, else their order) instead
// of each its own colour.
export type Plot1DData = {
  label: string;
  style: Partial<CurveStyle>;
  cols?: CurveCols;
  sheet?: string;
  rowSel?: string;
  trend?: TrendSpec;
  aggregate?: AggSpec;
  quickFits?: QuickFitSpec[];
  curveColors?: { map: ColorMapName; colors?: string[]; reverse?: boolean };
  rows?: CurveRow[];
  axes?: Partial<AxesStyle>;
  legend?: PlotLegend;
  annotations?: AnnotationItem[];
  page?: Partial<PlotPage>;
  // the Plots connected to the insets port, drawn inside this one's frame (by their node id)
  insets?: InsetItem[];
  // the curves stacked, each on the ones before it (on the X of the first: stacked areas, each filled down to the one
  // under it unless it has a fill of its own), or as % of their sum; join: at every X a line from the lowest curve to
  // the highest (a dumbbell chart), its colour and width
  stack?: 'none' | 'stack' | 'percent';
  join?: { show: boolean; color?: string; width?: number };
};
// Merge: several Plots on one page. Its grid: rows × columns (the Plots in the order of connection, each over
// colSpan × rowSpan cells), gaps and margin in the page's unit; sizing 'fit': the cells share the page, every Plot
// drawn at the size of its cell; 'keep': every Plot at its own size, the page as large as the grid. Axes shared by all
// panels, by column (X) or by row (Y); the numbers and titles of shared axes only on the outer panels unless `inner`.
export type CanvasLayout = {
  rows: number;
  cols: number;
  sizing: 'fit' | 'keep';
  hgap: number;
  vgap: number;
  margin: number;
  shareX: 'none' | 'all' | 'column';
  shareY: 'none' | 'all' | 'row';
  inner: boolean;
  // stacked: the Plots one under another (one X) or side by side (one Y), their frames touching (or stackGap apart,
  // in the page's unit), their heights / widths in the proportions of `ratios` ("2:1:1"; empty: equal)
  arrange?: 'grid' | 'stackV' | 'stackH';
  stackGap?: number;
  ratios?: string;
  // the grid: the widths of its columns and the heights of its rows in proportion ("2:1"; empty: equal)
  colRatios?: string;
  rowRatios?: string;
  // one title of X under all the panels, one of Y at their left (the text: its own, else the first panel's)
  commonX?: boolean;
  commonY?: boolean;
  commonXTitle?: string;
  commonYTitle?: string;
  // one legend for all the panels, outside them (the panels' own legends then hidden unless panelLegends)
  legend?: 'none' | 'right' | 'bottom' | 'top';
  panelLegends?: boolean;
  // the curves coloured by a colour map: one scale for all the panels
  oneColorScale?: boolean;
};
// A Plot in the Merge (by its node id): the cells it spans, or a box of its own (% of the page: an inset).
// facet: the Plot split into panels, one per curve (same axes, styles), filling the grid in its place.
export type CanvasItem = { key: string; colSpan?: number; rowSpan?: number; free?: Placement; facet?: boolean };
export type CanvasData = PageData & {
  layout?: Partial<CanvasLayout>;
  items?: CanvasItem[];
  annotations?: AnnotationItem[];
  panels?: PanelScheme;
  panelText?: TextStyle;
  panelX?: number;
  panelY?: number;
  panelBox?: string; // a ground behind the panel labels ('' = none)
};

// Figure Drawing: a vector drawing on its own page (PageData: size, text, background, border, exports), its objects in
// `annotations` (shapes and texts in mm from the top-left corner of the page; the first one at the back). grid: the
// step (in mm or pt) of the editor's grid, shown or not, objects snapped to it; snapObjects: to the edges and middles of
// the other objects and of the page (guides shown while dragging). Its figure goes to a Merge or a Plot's insets.
export type DrawingGrid = { step: number; unit: 'mm' | 'pt'; show: boolean; snap: boolean };
// components: groups of objects kept once (their points from the top-left corner of their box, w × h mm), placed as
// instances (shapes of kind 'component') that all change with them.
export type DrawingComponent = { id: string; name: string; w: number; h: number; items: AnnotationItem[] };
// under: a figure connected to its port (a Plot, a Merge …) is drawn under the drawing — its page the drawing's — and
// goes out with it ('draw', the default), or is only a guide while drawing ('guide': the drawing goes out alone).
export type DrawingData = PageData & { annotations?: AnnotationItem[]; grid?: Partial<DrawingGrid>; snapObjects?: boolean; components?: DrawingComponent[]; under?: 'draw' | 'guide' };

// ---- Notes, layout ----
// doc: the formatted note (the editor's document; absent: a plain note, its text alone); text: its plain text, always
// mathFont: the font of its formulas (absent: the one that looks like its text)
export type NoteData = { text: string; doc?: RichDoc; mathFont?: 'sans' | 'serif' | 'latex' };
export type FrameData = { name: string; color: string };
export type RerouteData = Record<string, never>;
// A group node: a graph inside one node. Its ports: what enters by the Group input node inside, what leaves by the
// Group output node (key: the outside node and port it was made from; type: of the value, for the port colours).
export type GroupPort = { id: string; label: string; key?: string; type?: string };
// batch: a Batch (the steps run on every file of its first input, their results gathered; engine/batch.ts)
export type GroupData = { name: string; nodes: AppNode[]; edges: Edge[]; inputs: GroupPort[]; outputs: GroupPort[]; batch?: BatchSpec };
export type GroupIoData = Record<string, never>;

export type ImportNode = Node<ImportData, 'import'>;
export type WorkbookNode = Node<WorkbookData, 'book'>;
export type ExtractNode = Node<ExtractData, 'extract'>;
export type AutoExtractNode = Node<AutoExtractData, 'autoextract'>;
export type DataManipNode = Node<DataManipData, 'datamanip'>;
export type FitNode = Node<FitNodeData, 'fit'>;
export type CalculusNode = Node<CalculusData, 'calculus'>;
export type PickNode = Node<PickData, 'pick'>;
export type PeakNode = Node<PeakData, 'peaks'>;
export type NormNode = Node<NormData, 'normality'>;
export type TTestNode = Node<TTestData, 'ttest'>;
export type AnovaNode = Node<AnovaData, 'anova'>;
export type NonparNode = Node<NonparData, 'nonparam'>;
export type CorrNode = Node<CorrData, 'correl'>;
export type CurveMathNode = Node<CurveMathData, 'curvemath'>;
export type TranslateNode = Node<TranslateData, 'translate'>;
export type FilterNode = Node<FilterData, 'filterrows'>;
export type CleanNode = Node<CleanData, 'clean'>;
export type AverageNode = Node<AverageData, 'average'>;
export type DigitizerNode = Node<DigitizerData, 'digitizer'>;
// Image analysis: an image (8 / 16 bit, float; gray or RGB) edited by steps, calibrated; its matrix and figure
export type ImageNode = Node<ImageAnalysisData, 'image'>;
// Phase diagram: a binary diagram computed from a thermodynamic model, the lever rule at points, an alloy cooled
export type PhaseDiagramNode = Node<PhaseDiagramData, 'phasediagram'>;
export type { PhaseDiagramData };
export type { ImageAnalysisData };
// Histogram: its bins, bars and fits, and a whole figure as a Plot's (axes, legend, annotations, page, insets).
export type HistogramData = HistSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type HistogramNode = Node<HistogramData, 'histogram'>;
// Bar chart: its data (a table, or raw values by group), its bars, and a whole figure as a Plot's.
export type BarChartData = BarSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type BarChartNode = Node<BarChartData, 'barchart'>;
// Box & violin: its groups (columns, or raw values by group), boxes and violins, and a whole figure as a Plot's.
export type BoxViolinData = BoxSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type BoxViolinNode = Node<BoxViolinData, 'boxviolin'>;
// Probability plot: ECDF, Q-Q, P-P or probability plot of groups against a distribution, and a whole figure as a Plot's.
export type ProbPlotData = ProbSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type ProbPlotNode = Node<ProbPlotData, 'probplot'>;
// Bland–Altman: the agreement of two methods (differences against means, bias, limits), a whole figure as a Plot's.
export type BlandAltmanData = BASpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type BlandAltmanNode = Node<BlandAltmanData, 'blandaltman'>;
// Pie chart: pie / doughnut / nested rings of categories, a whole figure as a Plot's (no axes drawn).
export type PieData = PieSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type PieNode = Node<PieData, 'pie'>;
// Contour / heatmap: Z over X and Y (a grid, scattered points or a matrix), a whole figure as a Plot's. A matrix on its
// matrix port: drawn as its cells (the MatrixPlotSpec options; absent: MATRIX_PLOT_DEFAULTS).
export type ContourData = ContourSpec & Partial<MatrixPlotSpec> & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type ContourNode = Node<ContourData, 'contour'>;
// Polar / radar: series in θ and r, or categories as spokes, a whole figure as a Plot's (no axes drawn).
export type PolarData = PolarSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type PolarNode = Node<PolarData, 'polar'>;
// Scatter matrix: every pair of k columns, a whole figure of k × k panels (their axes styled alike, the page its size).
export type ScatterMatrixData = MatrixSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type ScatterMatrixNode = Node<ScatterMatrixData, 'scattermatrix'>;
// Ternary: three parts of a whole as points of a triangle, a whole figure as a Plot's (no axes drawn).
export type TernaryData = TernarySpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type TernaryNode = Node<TernaryData, 'ternary'>;
// Waterfall: the curves of a sweep one behind the other, shifted in X and Y, a whole figure as a Plot's.
export type WaterfallData = WaterfallSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type WaterfallNode = Node<WaterfallData, 'waterfall'>;
// 3D plot: surfaces, wireframes, bars, symbols, lines and waterfalls in a 3D box, a whole figure as a Plot's.
export type Plot3DData = Plot3DSpec & Pick<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page' | 'insets'>;
export type Plot3DNode = Node<Plot3DData, 'plot3d'>;
// Matrix: a matrix typed in, generated (identity, random, a formula of i, j …) or made of the columns of a dataset.
export type MatrixData = MatSource;
export type MatrixNode = Node<MatrixData, 'matrix'>;
// Matrix computation: operations on the matrices, columns and values of A, B, C …, one or several steps in a chain.
export type MatCompNode = Node<MatCompData, 'matcomp'>;
export type SmoothNode = Node<SmoothData, 'smooth'>;
export type InterpNode = Node<InterpData, 'interp'>;
export type NormalizeNode = Node<NormalizeData, 'normalize'>;
export type FFTNode = Node<FFTData, 'fft'>;
export type ConvNode = Node<ConvData, 'convolve'>;
export type KKNode = Node<KKData, 'kk'>;
export type UnstackNode = Node<UnstackData, 'unstack'>;
export type ConvertNode = Node<ConvertData, 'convert'>;
export type TransposeNode = Node<TransposeData, 'transpose'>;
export type StackNode = Node<StackData, 'stack'>;
export type { ConvertData, StackData, TransposeData };
export type CombineNode = Node<CombineData, 'combine'>;
export type MathColNode = Node<MathColData, 'mathcol'>;
export type PythonNode = Node<PythonData, 'python'>;
export type GenColNode = Node<GenColData, 'gencol'>;
export type ColumnsNode = Node<ColumnsData, 'columns'>;
export type PeakWidthNode = Node<PeakWidthData, 'peakwidth'>;
export type StatsNode = Node<StatsData, 'stats'>;
export type Plot1DNode = Node<Plot1DData, 'plot1d'>;
export type CanvasNode = Node<CanvasData, 'canvas'>;
export type DrawingNode = Node<DrawingData, 'drawing'>;
export type NoteNode = Node<NoteData, 'note'>;
export type FrameNode = Node<FrameData, 'frame'>;
export type RerouteNode = Node<RerouteData, 'reroute'>;
export type GroupNode = Node<GroupData, 'subgraph'>;
export type GroupInNode = Node<GroupIoData, 'groupin'>;
export type GroupOutNode = Node<GroupIoData, 'groupout'>;
export type PhaseDigitizerNode = Node<PhaseDigitizerData, 'phasedigitizer'>;
// Equivalent circuit (EIS): an impedance spectrum fitted with an equivalent circuit
export type EisNode = Node<EisData, 'eis'>;

export type AppNode =
  | ImportNode
  | WorkbookNode
  | ExtractNode
  | AutoExtractNode
  | DataManipNode
  | FitNode
  | CalculusNode
  | PickNode
  | PeakNode
  | NormNode
  | TTestNode
  | AnovaNode
  | NonparNode
  | CorrNode
  | CurveMathNode
  | TranslateNode
  | FilterNode
  | CleanNode
  | AverageNode
  | DigitizerNode
  | PhaseDigitizerNode
  | EisNode
  | ImageNode
  | PhaseDiagramNode
  | HistogramNode
  | BarChartNode
  | BoxViolinNode
  | ProbPlotNode
  | BlandAltmanNode
  | PieNode
  | ContourNode
  | PolarNode
  | ScatterMatrixNode
  | TernaryNode
  | WaterfallNode
  | Plot3DNode
  | MatrixNode
  | MatCompNode
  | SmoothNode
  | InterpNode
  | NormalizeNode
  | FFTNode
  | ConvNode
  | KKNode
  | UnstackNode
  | ConvertNode
  | TransposeNode
  | StackNode
  | CombineNode
  | MathColNode
  | PythonNode
  | GenColNode
  | ColumnsNode
  | PeakWidthNode
  | StatsNode
  | Plot1DNode
  | CanvasNode
  | DrawingNode
  | NoteNode
  | FrameNode
  | RerouteNode
  | GroupNode
  | GroupInNode
  | GroupOutNode;
export type NodeType = AppNode['type'];
