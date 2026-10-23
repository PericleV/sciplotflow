// Evaluation of the graph: every node in the order of its connections, from the values on its input ports to the
// values on its output ports. Pure (no React): also runs in the scripts. A node whose settings and inputs did not
// change keeps its previous result (the cache), so a change recomputes only what follows from it.
import { fitLook, isTrend, paramText, QUICK_FIT_NAMES, quickFit, quickFitsOf, type QuickFitResult, type QuickFitSpec } from './quickfit.ts';
import { aggregateByX } from './aggregate.ts';
import { richMetrics } from '../figure/draw.ts';
import { markMathAsked, mathSizesVersion, resetMathAsked } from '../math/sizes.ts';
import { bendPoints, outlinePoint, type Outline, type Pt, type StickSide } from '../figure/shapes.ts';
import { parsePath, pathBox, pathText, reversePath, shapeToPath } from '../figure/paths.ts';
import { placeComponent } from './drawingItems.ts';
import { suspendedOf } from './reliability.ts';
import { generatedValues } from './gencol.ts';
import { withColumnFunctions } from './colfns.ts';
export { withColumnFunctions };
import type { Edge } from '@xyflow/react';
import type { AnnotationItem, AppNode, CalculusData, ColumnsData, PeakData, PeakWidthData, PickData, CanvasData, DrawingData, DrawingComponent, CanvasItem, CanvasLayout, CurveRow, MathColData, PythonData, RowRule, FitNodeData, GenColData, PageData, Plot1DData, StatsData, HistogramData, BarChartData, BoxViolinData, ProbPlotData, BlandAltmanData, PieData, ContourData, PolarData, ScatterMatrixData, TernaryData, WaterfallData, Plot3DData } from '../types.ts';
import { axisRange } from '../figure/ticks.ts';
import { autoFrame, axesGeometry, placeAuto, placeInsets, placeLegends } from '../figure/axes.ts';
import { legendLayout } from '../figure/legendLayout.ts';
import { columnLetter, readTable, type CsvResult } from './csv.ts';
import { curveColumns, digest, figPort, outValue, toPy, type PyJob, type PyResult, type PyValue } from './python.ts';
import { applySheet, hasEdits, readSheet, type SheetMap } from './sheet.ts';
import { flattenGroups, GROUP_IN, GROUP_OUT } from './subgraph.ts';
import { columnRuns, gather, orderFiles, readText, resultOf, withOwn, type FileRun } from './batch.ts';
import { takeRows } from './split.ts';
import { parseRows } from './rows.ts';
export { parseRows };
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { compile, compileComplex } from './expr.ts';
import { errorAt, parseErrors } from './errprop.ts';
import { applyFit, type UseRow } from './fituse.ts';
import { reconvolved } from './reconv.ts';
import { kkNode, KK_DEFAULTS } from './kk.ts';
import { controlChart } from './multivar.ts';
import { linearRegression, logisticRegression, type Coef } from './regression.ts';
import { surfaceModel } from './surface.ts';
import { describe, STATS, type StatKey } from './stats.ts';
import { combineNode, combineSettings, labelRuns, sideBySide, unstack, type BlockInfo, type CombineInput, type CombineSettings, type SplitGraph } from './reshape.ts';
import { pickPoints, type PickGraph, type PickKind, type Picked } from './pick.ts';
import { CURVE_OP_LABELS, curveFormulas, curveMath, curveOf, curveOpPort, curveOps, translate, type Curve2, type TranslateCurve, type CurveMathData, type CurveOpView, type CurvePlotLine, stepInfo, type StepInfo } from './curvemath.ts';
import { changesTable, cleanData, filterRows } from './cleaning.ts';
import { digitized } from './digitize.ts';
import { runPhaseDigitizer } from './phasedigitize.ts';
import { colKey, colLabel, drawCircuit, type EisRangeSpec, fitCurve, guessColumns, looksAngular, runEis, type EisData, type EisPoints } from './eis.ts';
import { histogram, type FitResult } from './histogram.ts';
import { axisValues, placeColumn, type AxisValues } from './axiskinds.ts';
import { countGrid, densityGrid, streamlines, vectorArrows } from './fields2d.ts';
import { barChart, rawTable, sortTable, wideTable } from './barchart.ts';
import { boxGroups, boxViolin, keyOf } from './boxviolin.ts';
import { probPlot, type ProbGroup, type ProbRow } from './probplot.ts';
import { blandAltman, type BAGroup, type BAStats } from './blandaltman.ts';
import { pieChart } from './piechart.ts';
import { polarChart, radarSeries, toDegrees } from './polar.ts';
import { scatterMatrix } from './scattermatrix.ts';
import { ternaryChart } from './ternary.ts';
import { waterfallChart, waterfallZ } from './waterfall.ts';
import { plot3d, type LayerInput, type LayerSpec, type Plot3DInput } from './plot3d.ts';
import { asGrid, contourPlot, gridFromMatrix, gridFromScatter, matrixNames, type Grid } from './contour.ts';
import { fromColumn, makeMatrix, matrixDataset, partHandle, runSteps, type MatCompData, type Matrix } from './matrix.ts';
import { cellCurves, matrixAxes, matrixGrid, type MatrixPlotSpec } from './matrixplot.ts';
import { bracketCurves, bracketTable, SIG_DEFAULTS, significance, type SigElement, type SigSpec } from './signif.ts';
import { averageNode, convNode, fftNode, interpNode, normalizeNode, smoothNode, valuesOf, type SignalOut, type SignalPlot } from './signalnodes.ts';
import { anovaNode, corrNode, nonparNode, normalityNode, tTestNode, type StatOut } from './statnodes.ts';
import { findPeaksIn, fittedPeak, fixedBaseline, fwhmAt, isFitted, measurePeaks, peakRunKey, regionPeak, type Found, type PeakItem } from './peaks.ts';
import { curveThrough } from './baselines.ts';
import { areaBetween, derivative, integrate, interp, pointsCurve, regionName, regionRows, type IntegralOptions } from './calculus.ts';
import { bareName, column, curvesByRole, findColumn, fmtNum, roleOf, rowIndex, titleOf, unitOf, type Column, type ColumnRole, type Dataset, type Scalar, type Series, type Workbook } from './table.ts';
import { autoExtract, pick, simpleRules } from './extract.ts';
import { columnsOf, type ColumnLine, type ColumnsSpec } from './columns.ts';
import { baseUnder, extremum, inRange, peakWidth, type Baseline as MBaseline, type Width } from './measure.ts';
import { selectRows } from './rowsel.ts';
import { applyManip, maskOf } from './manip.ts';
import { baseParams, buildModel, peakAt, peaksModel, percentResults, shapeSize, shapeStarts, SHAPE_NAMES, type Model, type ModelCtx, type PeakShape } from './fitModels.ts';
import { findSpec, runFits, totalStats, type FitParamSpec, type FitRunData, type RunResult, parseLinks } from './fit.ts';
import { compare, compareTable, modelName, yorkRuns, type Scored } from './fitcompare.ts';
import { parseRowHandle, rowHandle } from './ports.ts';
import { hasGrad, type GradFill, AXIS_DEFAULTS, COLORBAR_DEFAULTS, SIDE_DEFAULTS, curveStyle, axesStyle, LEGEND_STYLE_DEFAULTS, PALETTE, SHAPE_DEFAULTS, TEXT_DEFAULTS, TEXT_SPEC_DEFAULTS, toPt, type Annotation, type AxesFig, type AxesStyle, type AxisSpec, type Curve, type CurveStyle, type Figure, type FigureBox, type LegendEntry, type LegendSpec, type LengthUnit, type Placement, type ShapeSpec, type TextDefaults, resolveText, type Side, INSET_DEFAULTS, insetBackground, scaledSize } from '../figure/spec.ts';
import { CANVAS_DEFAULTS, CANVAS_LAYOUT_DEFAULTS, DRAWING_DEFAULTS, MATRIX_PLOT_DEFAULTS, PLOT_PAGE_DEFAULTS, REPORT_DEFAULTS } from '../defaults.ts';
import { figurePng, imageFigure, imageMatrix, imageMeasurements, processImage, scaleBarPlace, type ImageAnalysisData } from '../image/node.ts';
import { isArea, roiCentre, roiOutline, ROI_COLOR } from '../image/roi.ts';
import { cropBox } from '../image/raster.ts';
import { STEP_DEFS } from '../image/steps.ts';
import { phaseFigures, type PhaseDiagramData } from './phasenode.ts';
import { maxOf, minOf } from './minmax.ts';
import { reportBlock, type ReportBlock, type ReportData } from './reportDoc.ts';
import { nodeDisplayName } from '../nodeColors.ts';

export type Value =
  | { t: 'workbook'; v: Workbook }
  | { t: 'dataset'; v: Dataset }
  | { t: 'column'; v: Column }
  | { t: 'scalar'; v: Scalar }
  | { t: 'matrix'; v: Matrix }
  | { t: 'figure'; v: Figure };

// A matrix as the node views show it: its size, names, and the cells of its top-left corner (at most max × max).
export type MatrixInfo = { name: string; rows: number; cols: number; shownRows: number; shownCols: number; cells: number[]; xs?: number[]; ys?: number[]; colNames?: string[]; rowNames?: string[] };
export function matInfo(M: Matrix, max = 8): MatrixInfo {
  const [r, c] = [Math.min(M.rows, max), Math.min(M.cols, max)];
  return {
    name: M.name,
    rows: M.rows,
    cols: M.cols,
    shownRows: r,
    shownCols: c,
    cells: Array.from({ length: r * c }, (_, k) => M.v[Math.floor(k / c) * M.cols + (k % c)]),
    ...(M.xs ? { xs: M.xs.slice(0, c) } : {}),
    ...(M.ys ? { ys: M.ys.slice(0, r) } : {}),
    ...(M.colNames ? { colNames: M.colNames.slice(0, c) } : {}),
    ...(M.rowNames ? { rowNames: M.rowNames.slice(0, r) } : {}),
  };
}

export type MathInput = { letter: string; port: number; kind: 'column' | 'scalar'; name: string; rows: number };
// A column of an input, as the node views list it.
export type ColInfo = { name: string; rows: number; role?: ColumnRole };
const colInfo = (c: Column): ColInfo => ({ name: c.name, rows: c.values.length, ...(c.role ? { role: c.role } : {}) });
// Python script: its inputs as variables (letter, name, kind, size), the run asked for (job: the main thread runs it), its
// last result (shown while a new one runs: running), the outputs given and the result's inputs no longer the current ones
export type PyView = { vars: { letter: string; name: string; kind: PyValue['kind']; size: string }[]; job?: PyJob; result?: PyResult; running: boolean; stale: boolean };
// What the node views show besides the outputs.
export type NodeView = {
  sheetsA?: string[]; // Curve math: the sheets of the workbooks on A and B
  sheetsB?: string[];
  cmath?: { a: CurvePlotLine; b?: CurvePlotLine; ops: CurveOpView[] }; // Curve math: the curves and what every operation computes
  doc?: { blocks: ReportBlock[]; inputs: { port: number; letter: string; title: string; kind: string }[] }; // Report: its blocks, its inputs
  py?: PyView;
  csv?: CsvResult;
  sheet?: SheetMap; // Import: which row / column of the table as read each row / column shown is
  sheets?: string[]; // Import, Extract column, Workbook: the names of the sheets of the workbook
  // Workbook: its own sheets (the first `own`; the others: from the inputs, read-only) and its inputs; kinds: every sheet
  // its own table, an input's (read-only), or its own table with inputs (mixed); keys: the columns of the sheet shown, when
  // it has inputs — o<n>: of its own table (n: its place as read), i:<name>: an input's
  // hiddenSheets: the inputs' sheets taken out of the workbook (by their names)
  book?: { own: number; ins: { letter: string; kind: 'column' | 'dataset' | 'workbook'; name: string; sheet: string }[]; kinds?: ('own' | 'input' | 'mixed')[]; keys?: string[]; hiddenSheets?: string[] };
  // Data manipulation: the points of its graph (moved), the state of every input row (ROW_MASKED …), the columns shown
  manip?: { x: Float64Array; y: Float64Array; state: Uint8Array; nIn: number; xName: string; yName: string };
  // Fit: the data (every point, which run it is in, whether it was fitted), the results of every run, the model
  peaks?: PeakView;
  report?: string[]; // the statistics nodes: the results in words
  signal?: { labels: string[]; plots: SignalPlot[] }; // the Signal nodes: the data and the result of every Y
  availB?: { name: string; role?: ColumnRole }[]; // Curve math: the columns of B
  // Translate & resize: the columns and their designations, the curves; every curve before and after (the graph in the
  // node), the name of X
  translate?: { cols: { name: string; role: ColumnRole; from: 'dataset' | 'port' }[]; curves: string[]; plots?: TranslateCurve[]; xName?: string };
  fit?: { x: Float64Array; y: Float64Array; run: Int32Array; used: Uint8Array; runs: RunResult[]; use?: UseRow[][]; labels: string[]; params: { name: string; kind: string }[]; note: string; xName: string; yNames: string[]; group: string; surface?: boolean; regression?: { kind: 'linear' | 'logistic'; coefs: Coef[]; stats: Record<string, number> }; compare?: string[]; runs2?: RunResult[] };
  available?: ColInfo[];
  // Differentiate / Integrate: the data (every point, its run, whether it is in a region), the result of every run in the
  // order of X, the area of every region
  calc?: { x: Float64Array; y: Float64Array; run: Int32Array; used: Uint8Array; labels: string[]; lower: { x: number[]; y: number[] }[]; bases: { x: number[]; y: number[] }[]; fills: { index: number; x: number[]; y: number[]; b: number[] }[][]; areas: { run: string; region: string; index: number; lo: number; hi: number; area: number }[]; xName: string; yNames: string[]; resName: string }; // Extract / Combine columns / Plot: the columns of the input dataset
  inputs?: MathInput[]; // Math column
  blocks?: { list: BlockInfo[]; how: string }; // Split into columns: the blocks found
  split?: SplitGraph; // Split into columns: its graph (the column the blocks are found from, the curves, the cuts)
  pick?: PickGraph; // Pick points: its graph (the curves, the points picked)
  eis?: EisView; // Equivalent circuit: the data, the fit, the parameters, the columns used
  combine?: { port: number; letter: string; kind: 'column' | 'dataset' | 'workbook'; name: string; rows: number; cols: number; columns: string[]; sheets?: string[] }[]; // Combine columns: its inputs
  combineSettings?: CombineSettings; // Combine columns: its settings as it works with them (an older node's translated)
  changed?: number; // Math column: how many rows the rules changed
  stats?: Record<StatKey, number>;
  statsOf?: Column;
  // Statistics on columns / rows: the columns used, their statistics (on columns), the rows chosen of how many
  statCols?: { name: string; stats?: Record<StatKey, number> }[];
  statRows?: { used: number; of: number; text: string };
  statOut?: Record<StatKey, Float64Array>; // Statistics on rows: every statistic, a value per row chosen
  curves?: Curve[]; // Plot: its curves
  rowAvail?: Record<number, ColInfo[]>; // Plot: the columns of a curve's own dataset (its data port)
  sheetCols?: Record<string, ColInfo[]>; // Plot: a workbook on its dataset port — the columns of every sheet
  legendCurves?: Curve[]; // Plot: the curves its legend can list (split curves shown as one when asked)
  pieKind?: 'pie' | 'doughnut' | 'rings'; // Pie chart: the kind drawn (chosen, or as an older project drew it)
  hist?: { fits: Omit<FitResult, 'curve' | 'parts'>[]; bins: number; from: number; to: number };
  quickFits?: QuickFitView[]; // Plot: the results of its curves' quick fits
  prob?: ProbRow[]; // Probability plot: every group's parameters and statistics
  ba?: BAStats[]; // Bland–Altman: the bias and limits of all the pairs (and of every group)
  groupNames?: string[]; // Bar chart, Box & violin: the groups the significance brackets can compare
  contour?: { nx: number; ny: number; levels: number[]; range: [number, number]; x: [number, number]; y: [number, number] }; // Contour / heatmap: its grid
  // 3D stacked maps: every layer read (its input, and the column and value that chose its rows); every input's columns
  // and the values of those with few
  layers?: { name: string; at: number; points: number; shown: boolean; from: number; where?: string; is?: string }[];
  columnLines?: ColumnLine[]; // Columns: every column in, as it comes out
  columnsHead?: { names: string[]; rows: string[][] }; // Columns: the first rows of the data as they come in (for the names from a row)
  // Peak width: the points (their run, in a region or not), the baseline of every run, every result
  widths?: { x: Float64Array; y: Float64Array; run: Int32Array; used: Uint8Array; labels: string[]; xName: string; bases: { x: number[]; y: number[] }[]; results: { run: number; region: number; kind: 'peak' | 'dip'; x: number; y: number; fwhm: number; left: number; right: number; leftY: number; rightY: number; height: number; min: number; xMin: number; max: number; xMax: number; count: number; of: number }[] };
  extractCols?: { sheet: string; columns: { name: string; role: ColumnRole }[] }; // Auto-extract (simple): the first sheet's columns
  layerInputs?: { port: number; letter: string; name: string; columns: string[]; labels: Record<string, string[]> }[];
  figure?: Figure;
  cooling?: Figure; // Phase diagram: the amounts of the phases of the alloy cooled
  image?: { w: number; h: number; ch: number; kind: string; notes: Record<string, string>; errors: Record<string, string>; summary?: string }; // Image analysis: the result's size, every step's note and error, what the measurements found
  under?: Figure; // Figure Drawing: the figure connected under it
  pinShift?: Record<string, [number, number]>; // … and how far its objects pinned to that figure's data are moved (mm)
  // Matrix, Contour: the matrix made / drawn; Matrix computation: its inputs and every step's results
  matrix?: MatrixInfo;
  matInputs?: { port: number; letter: string; kind: 'matrix' | 'column' | 'scalar'; name: string; rows: number; cols: number }[];
  matSteps?: { id: string; name: string; error?: string; warnings: string[]; parts: { key: string; label: string; info?: MatrixInfo; value?: number }[] }[];
  waiting?: string; // what is missing before the node can give a result
  // Batch: the files it ran on, those that failed and why
  // a Batch: its files (in their order: what their names say, their errors), the one shown inside
  // over 'columns': the runs are the columns of one table (sheets: of the workbook connected; cols: the table's columns)
  batch?: { files: number; failed: { name: string; errors: string[] }[]; list?: { name: string; read: string; errors: string[]; own?: string[] }[]; shown?: number; over?: 'columns'; sheets?: string[]; cols?: string[] };
};
// inner: a Batch's steps as they ran on its first file (shown when the batch is opened), by their ids inside it
export type NodeResult = { rev: number; outputs: Record<string, Value>; errors: string[]; warnings: string[]; view: NodeView; inner?: Map<string, NodeResult> };

// name: of the node it comes from (as the nodes show it), for the titles of a Report
type Inputs = Map<string, { from: string; handle: string; value: Value | undefined; name?: string }[]>;
// py: the results of the Python scripts (run on the main thread's side, given here by node id; seq: they changed)
// sub: the caches of the runs of a Batch (by the batch's id and the file), kept between evaluations
// math: the sizes of the formulas (math/sizes.ts) the result was measured with (absent: it measured none)
export type EvalCache = { entries: Map<string, { key: string; result: NodeResult; math?: number }>; rev: number; py: Map<string, { seq: number; result: PyResult }>; sub?: Map<string, EvalCache> };
export const newCache = (): EvalCache => ({ entries: new Map(), rev: 0, py: new Map() });
// the Python results of the evaluation under way (pythonNode reads them by the node's id)
let pyNow: EvalCache['py'] = new Map();

const MAX_ROWS = 10_000_000;


// The node's settings that change its result (not its label, collapsed state, or the text of an imported file — its id).
export function logicalData(n: AppNode): unknown {
  if (n.type === 'note' || n.type === 'frame') return null;
  // a group: what is inside, not where the nodes inside are drawn
  if (n.type === 'subgraph') return [n.data.inputs, n.data.outputs, n.data.nodes.map((x) => [x.id, x.type, logicalData(x)]), n.data.edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]), n.data.batch ?? null];
  const { caption: _c, collapsed: _k, ...rest } = n.data as Record<string, unknown>;
  if (n.type === 'import') {
    delete rest.text;
    delete rest.sheets;
  }
  // an image: by its id (its pixels are megabytes) — and whether they are there yet (a project opened: they come back
  // from the browser's storage after it)
  if (n.type === 'image') {
    delete rest.pixels;
    rest.hasPixels = !!n.data.pixels?.data;
  }
  return rest;
}

// The curve rows of a Plot: row 0 is (label, style), then `rows`. A row never edited takes the next palette colour.
export function plotRows(d: Plot1DData, count: number): CurveRow[] {
  const first: CurveRow = { label: d.label, style: d.style, ...(d.cols ? { cols: d.cols } : {}), ...(d.sheet ? { sheet: d.sheet } : {}), ...(d.rowSel ? { rowSel: d.rowSel } : {}), ...(d.trend ? { trend: d.trend } : {}), ...(d.aggregate ? { aggregate: d.aggregate } : {}), ...(d.quickFits ? { quickFits: d.quickFits } : {}) };
  const base = Math.max(0, PALETTE.findIndex((c) => c.toLowerCase() === String(d.style.color ?? '').toLowerCase()));
  return Array.from({ length: count }, (_, k) => (k === 0 ? first : (d.rows?.[k - 1] ?? { label: '', style: { ...d.style, color: PALETTE[(base + k) % PALETTE.length] } })));
}

type Out = { outputs?: Record<string, Value>; errors?: string[]; warnings?: string[]; view?: NodeView; inner?: Map<string, NodeResult> };

function generate(d: GenColData, like: Column | undefined): Out {
  const n = like ? like.values.length : Math.floor(d.count);
  if (!(n >= 1)) return { errors: ['The number of rows must be at least 1.'] };
  if (n > MAX_ROWS) return { errors: [`At most ${MAX_ROWS.toLocaleString('en')} rows.`] };
  const v = generatedValues(d, n);
  if (typeof v === 'string') return { errors: [v] };
  return { outputs: { out: { t: 'column', v: column(d.name || 'Generated', v) } } };
}

// The lettered inputs A, B, C … of Math column.
// Python script: the inputs as variables, a run asked for when the code or the data changed (or Run pressed), the outputs
// of the last run (kept while a new one runs, so the graph after it does not go empty)
function pythonNode(n: { id: string; data: PythonData }, inputs: Inputs): Out {
  const d = n.data;
  const vars: PyJob['vars'] = [];
  const shown: PyView['vars'] = [];
  for (const [h, list] of inputs) {
    const m = /^in-(\d+)$/.exec(h);
    const v = list[0]?.value;
    if (!m || !v || v.t === 'figure') continue;
    const letter = columnLetter(Number(m[1]));
    const name = d.vars?.[letter]?.trim() || letter;
    const value = toPy(v);
    vars.push({ name, value });
    const size = value.kind === 'column' ? `${value.col.values.length}` : value.kind === 'dataset' ? `${value.columns[0]?.values.length ?? 0} × ${value.columns.length}` : value.kind === 'matrix' ? `${value.rows} × ${value.cols}` : value.kind === 'workbook' ? `${value.sheets.length} sheets` : '1';
    shown.push({ letter, name, kind: value.kind, size });
  }
  shown.sort((a, b) => a.letter.length - b.letter.length || a.letter.localeCompare(b.letter));
  const names = new Map<string, number>();
  for (const v of vars) names.set(v.name, (names.get(v.name) ?? 0) + 1);
  const twice = [...names].filter(([, k]) => k > 1).map(([nm]) => nm);
  if (twice.length) return { errors: [`Two inputs are called ${twice.join(', ')}: give them different names.`], view: { py: { vars: shown, running: false, stale: false } } };
  const code = d.code ?? '';
  const run = d.run ?? 0;
  if (!code.trim()) return { view: { waiting: 'Write the code (the inputs are variables here: A, B …).', py: { vars: shown, running: false, stale: false } } };
  const key = digest(code, vars, run);
  const last = pyNow.get(n.id)?.result;
  // a new run only when Run was pressed (a project opened again: its last run done once more, for its outputs); by itself
  // when the code or the data change only if asked (auto)
  const auto = d.auto === true;
  const current = !!last && last.key === key;
  const wanted = auto ? !current : run > 0 && (!last || last.run !== run);
  const job: PyJob | undefined = wanted ? { key, run, code, vars } : undefined;
  const outputs: Record<string, Value> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  if (last) {
    const hide = new Set(d.hide ?? []);
    for (const o of last.outputs) if (!hide.has(o.name)) outputs[`py-${o.name}`] = outValue(o);
    // the figures made into Plots: the data of each of their axes
    for (const f of last.figures)
      if (f.desc && d.figs?.includes(f.num))
        f.desc.axes.forEach((ax, k) => {
          const name = figPort(f.num, k, f.desc!.axes.length);
          outputs[`py-${name}`] = { t: 'dataset', v: { name, columns: curveColumns(ax).cols.map((c) => column(c.name, c.values)) } };
        });
    if (last.error) errors.push(`${last.error.line ? `Line ${last.error.line}: ` : ''}${last.error.message}`);
    if (last.skipped.length) warnings.push(`Not given out (not a number, a column, a table or a matrix): ${last.skipped.map((s) => `${s.name} (${s.type})`).join(', ')}.`);
    if (!auto && !current) warnings.push('The code or the data changed since the last run: press Run.');
  }
  return { outputs, errors, warnings, view: { ...(last ? {} : { waiting: job ? 'Running the code…' : 'Press Run to run the code.' }), py: { vars: shown, ...(job ? { job } : {}), ...(last ? { result: last } : {}), running: !!job, stale: !current } } };
}

function lettered(inputs: Inputs) {
  const ins: MathInput[] = [];
  const vals: Record<string, Column | Scalar> = {};
  for (const [h, list] of inputs) {
    const m = /^in-(\d+)$/.exec(h);
    const v = list[0]?.value;
    if (!m || !v || (v.t !== 'column' && v.t !== 'scalar')) continue;
    const letter = columnLetter(Number(m[1]));
    vals[letter] = v.v;
    ins.push({ letter, port: Number(m[1]), kind: v.t, name: v.v.name, rows: v.t === 'column' ? v.v.values.length : 1 });
  }
  ins.sort((a, b) => a.port - b.port);
  return { ins, vals };
}
const isCol = (v: Column | Scalar): v is Column => 'values' in v;

// Row-by-row evaluation of a formula over lettered inputs (missing rows of shorter columns are NaN).
function rowEvaluator(src: string, vals: Record<string, Column | Scalar>, extra: string[] = []) {
  const f = compile(src);
  if (typeof f === 'string') return f;
  const unknown = f.names.filter((x) => !(x in vals) && x !== 'i' && x !== 'n' && !extra.includes(x));
  if (unknown.length) return `Unknown name${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} in “${src}”: connect ${unknown.length > 1 ? 'columns' : 'a column'} to the port${unknown.length > 1 ? 's' : ''} of that letter (inputs are A, B, C …; i is the row, n the number of rows).`;
  const used = f.names.filter((x) => x in vals);
  const cols = used.filter((x) => isCol(vals[x])).map((x) => [x, (vals[x] as Column).values] as const);
  const scal = used.filter((x) => !isCol(vals[x])).map((x) => [x, (vals[x] as Scalar).value] as const);
  const v: Record<string, number> = { i: 0, n: 0 };
  for (const [x, s] of scal) v[x] = s;
  return (i: number, n: number, more?: Record<string, number>) => {
    v.i = i + 1;
    v.n = n;
    if (more) for (const k in more) v[k] = more[k];
    for (const [x, a] of cols) v[x] = i < a.length ? a[i] : NaN;
    return f.fn(v);
  };
}

// A Math column in complex numbers: the formula of the inputs (real) and j, row by row; the part asked
function complexColumn(d: MathColData, formula: string, vals: Record<string, Column | Scalar>, view: NodeView): Out {
  const c = compileComplex(formula);
  if (typeof c === 'string') return { errors: [c], view };
  const unknown = c.names.filter((x) => !(x in vals) && x !== 'i' && x !== 'n');
  if (unknown.length) return { errors: [`Unknown name${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}: connect ${unknown.length > 1 ? 'columns' : 'a column'} to the port${unknown.length > 1 ? 's' : ''} of that letter (j is the imaginary unit, i the row).`], view };
  const used = c.names.filter((x) => x in vals);
  const cols = used.filter((x) => isCol(vals[x])).map((x) => vals[x] as Column);
  const rows = d.output === 'value' ? 1 : cols.length ? maxOf(cols.map((q) => q.values.length)) : 1;
  if (d.output === 'value' && cols.length) return { errors: [`One value: ${used.filter((x) => isCol(vals[x])).join(', ')} — use a function of the whole column (mean(A) …).`], view };
  const part = d.part ?? 're';
  const pick = (z: [number, number]) => (part === 're' ? z[0] : part === 'im' ? z[1] : part === 'abs' ? Math.hypot(z[0], z[1]) : part === 'arg' ? Math.atan2(z[1], z[0]) : part === 'deg' ? (Math.atan2(z[1], z[0]) * 180) / Math.PI : 20 * Math.log10(Math.hypot(z[0], z[1])));
  const v: Record<string, number> = { n: rows };
  const out = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    v.i = r + 1;
    for (const x of used) {
      const q = vals[x];
      v[x] = isCol(q) ? (r < q.values.length ? q.values[r] : NaN) : q.value;
    }
    out[r] = pick(c.fn(v));
  }
  const tag = { re: 'real part', im: 'imaginary part', abs: 'magnitude', arg: 'phase (rad)', deg: 'phase (°)', db: 'magnitude (dB)' }[part];
  const name = d.name || `${d.formula.trim()} — ${tag}`;
  const warnings = [...(d.errors?.trim() ? ['Errors: not carried in complex numbers.'] : []), ...(d.rules?.length ? ['Rules: not used in complex numbers.'] : [])];
  if (d.output === 'value') return { outputs: { out: { t: 'scalar', v: { name, value: out[0] } } }, warnings, view };
  const mask = maskOf(cols, rows);
  return { outputs: { out: { t: 'column', v: { ...column(name, out), ...(mask ? { mask } : {}) } } }, warnings, view };
}

// The error of a Math column's result at every row from the errors of its inputs (errprop.ts); null without errors
function mathErrors(text: string | undefined, f: { fn: (v: Record<string, number>) => number; names: string[] }, vals: Record<string, Column | Scalar>, rows: number): { err: Float64Array; warnings: string[] } | null {
  const pe = parseErrors(text);
  if (!pe.lines.length && !pe.errors.length) return null;
  const warnings = [...pe.errors];
  const used = f.names.filter((x) => x in vals);
  const sigs: { letter: string; at: (i: number, n: number) => number }[] = [];
  for (const l of pe.lines) {
    if (!(l.letter in vals)) {
      warnings.push(`Error of ${l.letter}: no input ${l.letter}.`);
      continue;
    }
    if (!used.includes(l.letter)) {
      warnings.push(`Error of ${l.letter}: ${l.letter} is not in the formula.`);
      continue;
    }
    const ev = rowEvaluator(withColumnFunctions(l.formula, vals), vals);
    if (typeof ev === 'string') warnings.push(`Error of ${l.letter}: ${ev}`);
    else sigs.push({ letter: l.letter, at: ev });
  }
  const err = new Float64Array(rows);
  const vars: Record<string, number> = { i: 0, n: rows };
  const sig: Record<string, number> = {};
  for (let i = 0; i < rows; i++) {
    vars.i = i + 1;
    for (const x of used) {
      const v = vals[x];
      vars[x] = isCol(v) ? (i < v.values.length ? v.values[i] : NaN) : v.value;
    }
    for (const s of sigs) sig[s.letter] = s.at(i, rows);
    err[i] = errorAt(f.fn, vars, sig);
  }
  return { err, warnings };
}

// Math column ▸ rules for chosen rows: in order, the rows chosen (a list, a condition, all) given a formula of the inputs
// and v (the value the formula and the rules above gave); the rows no rule chose kept, emptied or set to a value. out is
// changed in place.
function applyRowRules(rules: RowRule[], out: Float64Array, vals: Record<string, Column | Scalar>, others?: MathColData['others'], otherValue = 0): { changed: number; warnings: string[] } | string {
  const n = out.length;
  const touched = new Uint8Array(n);
  const warnings: string[] = [];
  for (const [k, r] of rules.entries()) {
    if (!r.formula.trim()) continue;
    let rows: number[];
    if (r.mode === 'all') rows = Array.from({ length: n }, (_, i) => i);
    else if (r.mode === 'rows') {
      const p = parseRows(r.rows, n);
      if (typeof p === 'string') return `Rule ${k + 1}: ${p}`;
      rows = p;
    } else {
      const c = rowEvaluator(r.rows, vals, ['v']);
      if (typeof c === 'string') return `Rule ${k + 1}, condition: ${c}`;
      rows = [];
      for (let i = 0; i < n; i++) if (c(i, n, { v: out[i] }) > 0) rows.push(i);
    }
    const f = rowEvaluator(r.formula, vals, ['v']);
    if (typeof f === 'string') return `Rule ${k + 1}: ${f}`;
    for (const i of rows) {
      out[i] = f(i, n, { v: out[i] });
      touched[i] = 1;
    }
    if (!rows.length) warnings.push(`Rule ${k + 1} selects no row.`);
  }
  let changed = 0;
  for (let i = 0; i < n; i++) {
    if (touched[i]) changed++;
    else if (others === 'nan') out[i] = NaN;
    else if (others === 'value') out[i] = otherValue;
  }
  return { changed, warnings };
}

const finiteRange = (v: ArrayLike<number>, positive = false): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!Number.isFinite(x) || (positive && x <= 0)) continue;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return Number.isFinite(lo) ? [lo, hi > lo ? hi : lo + 1] : [0, 1];
};

// The datasets on a Plot's dataset port as one (columns of the same name: “name (2)” …).
function mergeSets(sets: Dataset[]): Dataset | undefined {
  if (sets.length < 2) return sets[0];
  const seen = new Set<string>();
  const columns = sets.flatMap((d) =>
    d.columns.map((c) => {
      let nm = c.name;
      for (let k = 2; seen.has(nm); k++) nm = `${c.name} (${k})`;
      seen.add(nm);
      return nm === c.name ? c : { ...c, name: nm };
    }),
  );
  return { name: sets.map((d) => d.name).join(' + '), columns };
}

// The data of a curve as a dataset (X, Y, ±Y, ±X designated), and back: the first curve of a dataset by its designations.
function seriesSet(s: Series): Dataset {
  const columns: Column[] = [{ ...s.x, role: 'x' }, { ...s.y, role: 'y' }];
  if (s.yErr) columns.push({ ...s.yErr, role: 'yerr' });
  if (s.xErr) columns.push({ ...s.xErr, role: 'xerr' });
  return { name: s.name, columns };
}
function setSeries(ds: Dataset): Series | undefined {
  const rc = curvesByRole(ds.columns).curves[0];
  const by = (nm?: string) => (nm ? findColumn(ds.columns, nm) : undefined);
  const [x, y] = [by(rc?.x), by(rc?.y)];
  if (!y) return undefined;
  const [yErr, xErr] = [by(rc.yerr), by(rc.xerr)];
  return { name: y.name, x: x ?? rowIndex(y.values.length), y, ...(yErr ? { yErr } : {}), ...(xErr ? { xErr } : {}) };
}

// The runs of several Y columns: named by their column; their value — the block each came from (Split into columns:
// “cavity d (nm)” = 150), the same name for all — else their number.
export function runsKey(Ys: Column[]): { name: string; value: (y: Column, k: number) => number } {
  const names = new Set(Ys.map((y) => y.key?.name ?? ''));
  const name = names.size === 1 ? [...names][0] : '';
  return { name, value: (y, k) => (name && y.key ? y.key.value : k + 1) };
}

function plot(n: { id: string; data: Plot1DData }, inputs: Inputs): Out {
  const col = (h: string) => {
    const v = inputs.get(h)?.[0]?.value;
    return v?.t === 'column' ? v.v : undefined;
  };
  // the Plot's datasets (several may be connected): curves take their columns from them by name; a workbook: each curve
  // from the sheet it names (absent: the datasets, else its first sheet)
  const sets = (inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : []));
  const sheets = (inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'workbook' ? i.value.v.sheets : []));
  const ds = mergeSets(sets.length ? sets : sheets.slice(0, 1));
  const byName = (name: string | undefined) => (ds && name ? findColumn(ds.columns, name) : undefined);
  // rows with something connected, or a Y column chosen from the dataset
  let count = 1;
  for (const h of inputs.keys()) {
    const r = parseRowHandle(h);
    if (r) count = Math.max(count, r.row + 1);
  }
  const stored = plotRows(n.data, 1 + (n.data.rows?.length ?? 0));
  stored.forEach((r, k) => r.cols?.y && (count = Math.max(count, k + 1)));
  const rows = plotRows(n.data, count);
  const available = ds?.columns.map(colInfo);
  // a workbook: its sheets and their columns (to choose a curve's sheet, to add curves from any of them)
  const sheetView = sheets.length ? { sheets: sheets.map((q) => q.name), sheetCols: Object.fromEntries(sheets.map((q) => [q.name, q.columns.map(colInfo)])) } : {};
  // curves from several sheets: each named with its sheet (unless it has a name)
  const manySheets = new Set(rows.flatMap((r) => (r.sheet ? [r.sheet] : []))).size > 1;
  // the columns of the curves that have their own dataset (on their data port), to choose from
  const rowAvail: Record<number, ColInfo[]> = {};
  const curves: Curve[] = [];
  const keys: (Column['key'] | undefined)[] = [];
  const outputs: Record<string, Value> = {};
  const warnings: string[] = [];
  const errors: string[] = [];
  let firstX: Column | undefined;
  // the curves found, made once their axes know what their values are (categories, times: over all the curves)
  const found: { k: number; s: Series; style: CurveStyle; colorCol?: Column; sizeCol?: Column; labelCol?: Column; name: string; label: string }[] = [];
  for (let k = 0; k < count; k++) {
    const sv = inputs.get(rowHandle('series', k))?.[0]?.value;
    const own = sv?.t === 'dataset' ? sv.v : undefined;
    const series = own ? setSeries(own) : undefined;
    // the columns chosen: from the curve's own dataset (its data port) when it has one, else from its sheet, else from the
    // Plot's
    const name = `curve ${k + 1}`;
    const sheetName = rows[k].sheet;
    const sheet = sheetName && sheets.length ? sheets.find((q) => q.name === sheetName) : undefined;
    if (sheetName && sheets.length && !sheet) {
      warnings.push(`${name}: no sheet “${sheetName}” in the workbook.`);
      continue;
    }
    const inSheet = (nm: string | undefined) => (sheet && nm ? findColumn(sheet.columns, nm) : undefined);
    const base = (nm: string | undefined) => (sheet ? inSheet(nm) : byName(nm));
    const pickCol = (nm: string | undefined) => (own && nm ? (findColumn(own.columns, nm) ?? base(nm)) : base(nm));
    if (own) rowAvail[k] = own.columns.map(colInfo);
    else if (sheet) rowAvail[k] = sheet.columns.map(colInfo);
    const cols = rows[k].cols ?? {};
    for (const [part, nm] of Object.entries(cols)) if (nm && (own || sheet || ds) && !pickCol(nm)) warnings.push(`${name}: no column “${nm}” (${part}) in ${own ? 'its data' : sheet ? `the sheet “${sheet.name}”` : 'the dataset'}.`);
    const y = col(rowHandle('y', k)) ?? pickCol(cols.y) ?? series?.y;
    if (!y) {
      if (k === 0 && !series) return { view: { available, ...sheetView, waiting: ds ? 'Choose the Y column of curve 1 (or + Curves from the columns).' : 'Connect a Y column (X is optional: the row number when absent), a dataset to the data port of the curve, or a dataset above.' } };
      continue;
    }
    let x = col(rowHandle('x', k)) ?? pickCol(cols.x) ?? series?.x;
    if (!x) {
      // a curve without its own X takes the X of the first curve when it has as many rows
      if (k > 0 && firstX && firstX.values.length === y.values.length) x = firstX;
      else if (k > 0 && firstX) {
        errors.push(`${name}: Y has ${y.values.length} rows, the X of curve 1 has ${firstX.values.length} — connect its own X.`);
        continue;
      } else x = rowIndex(y.values.length);
    }
    if (k === 0) firstX = x;
    let yErr = col(rowHandle('yerr', k)) ?? pickCol(cols.yerr) ?? series?.yErr;
    let xErr = col(rowHandle('xerr', k)) ?? pickCol(cols.xerr) ?? series?.xErr;
    // a fit's confidence band: shaded unless the curve asks for bars
    const style = curveStyle(yErr?.band && !rows[k].style.errStyle ? { ...rows[k].style, errStyle: 'band' } : rows[k].style);
    // ±Y without a column: one value for every point, or a % of |y|
    if (style.errFrom !== 'column' && Number.isFinite(style.errValue)) {
      const v = Math.abs(style.errValue);
      yErr = column(style.errFrom === 'value' ? `± ${v}` : `± ${v} %`, style.errFrom === 'value' ? new Float64Array(y.values.length).fill(v) : Float64Array.from(y.values, (w) => (Math.abs(w) * v) / 100));
    }
    let yErrLo = style.errAsym ? (col(rowHandle('ylo', k)) ?? pickCol(cols.ylo) ?? series?.yErrLo) : undefined;
    if (x.values.length !== y.values.length) warnings.push(`${name}: X has ${x.values.length} rows, Y ${y.values.length}: the extra rows are left out.`);
    if (yErr && yErr.values.length !== y.values.length) warnings.push(`${name}: the Y error has ${yErr.values.length} rows, Y ${y.values.length}.`);
    let colorCol = style.colorBy === 'column' ? col(rowHandle('color', k)) : undefined;
    let sizeCol = style.sizeBy === 'column' || style.widthBy === 'column' ? col(rowHandle('size', k)) : undefined;
    let labelCol = style.labels === 'column' ? col(rowHandle('label', k)) : undefined;
    // the rows drawn
    const nRows = Math.min(x.values.length, y.values.length);
    const sel = rows[k].rowSel?.trim();
    let yUse = y;
    if (sel) {
      const p = parseRows(sel, nRows);
      if (typeof p === 'string') errors.push(`${name}, rows: ${p}`);
      else {
        const t = (c: Column | undefined) => c && takeRows(c, p);
        [x, yErr, xErr, yErrLo, colorCol, sizeCol, labelCol] = [takeRows(x, p), t(yErr), t(xErr), t(yErrLo), t(colorCol), t(sizeCol), t(labelCol)];
        yUse = takeRows(y, p);
      }
    }
    // the repeated X brought to one point each: the mean / median, its spread as ±Y (shaded unless bars are asked for)
    const agg = rows[k].aggregate;
    if (agg?.stat) {
      if (yErr || xErr || colorCol || sizeCol || labelCol) warnings.push(`${name}: one point at every X — its ±X, ±Y, colour, size and label columns are not used (the spread is its ±Y).`);
      const a = aggregateByX(x, yUse, agg);
      [x, yUse, yErr, yErrLo, xErr, colorCol, sizeCol, labelCol] = [a.x, a.y, a.plus, a.minus, undefined, undefined, undefined, undefined];
      if (a.plus) {
        style.errAsym = true;
        style.errFrom = 'column';
        if (!rows[k].style.errStyle) style.errStyle = 'band';
      }
    }
    const s: Series = { name: yUse.name, x, y: yUse, ...(yErr ? { yErr } : {}), ...(xErr ? { xErr } : {}), ...(yErrLo ? { yErrLo } : {}) };
    found.push({ k, s, style, colorCol, sizeCol, labelCol, name, label: rows[k].label || (manySheets && sheet ? `${sheet.name}: ${y.name}` : y.name) || name });
    keys.push(y.key);
    outputs[rowHandle('series', k)] = { t: 'dataset', v: seriesSet(s) };
  }
  // the bottom and left axes: numbers, categories or times, over the curves on them
  const ax = axesStyle(n.data.axes);
  const extraIds = new Set(ax.extra.map((e) => e.id));
  const onBottom = (st: CurveStyle) => !extraIds.has(st.axisX) && !(st.axisX === 'top' && ax.top.mode === 'own');
  const onLeft = (st: CurveStyle) => !extraIds.has(st.axisY) && !(st.axisY === 'right' && ax.right.mode === 'own');
  const xv = axisValues(found.filter((f) => onBottom(f.style)).map((f) => f.s.x), ax.x);
  const yv = axisValues(found.filter((f) => onLeft(f.style)).map((f) => f.s.y), ax.y);
  for (const f of found) {
    const spread = f.style.mode === 'scatter';
    if (onBottom(f.style) && xv.kind !== 'number') f.s = { ...f.s, x: placeColumn(f.s.x, xv, ax.x, spread) };
    if (onLeft(f.style) && yv.kind !== 'number') f.s = { ...f.s, y: placeColumn(f.s.y, yv, ax.y, spread) };
  }
  if (n.data.stack && n.data.stack !== 'none' && found.length > 1) stackCurves(found, n.data.stack);
  for (const f of found) curves.push(makeCurve(`${n.id}:${f.k}`, f.label, f.s, f.style, f.colorCol, f.sizeCol, f.labelCol, f.name, warnings));
  // a dumbbell: at every X, a line from the lowest curve to the highest, under them
  if (n.data.join?.show && curves.length > 1) curves.unshift(joinCurve(n.id, curves, n.data.join));
  const kindOf = (a: AxisSpec, v: AxisValues): AxisSpec => (v.kind === 'category' ? { ...a, cats: v.cats } : v.kind === 'time' ? { ...a, time: v.time } : a);
  const axesFor = xv.kind === 'number' && yv.kind === 'number' ? n.data.axes : { ...n.data.axes, x: kindOf(ax.x, xv), y: kindOf(ax.y, yv) };
  // the curves coloured by a colour map (instead of each its own colour): by the value of the block each came from
  // (Split into columns: “cavity d (nm)” = 150) when they all have one, else by their order; the legend can show them as
  // one entry with the colour scale, a colour bar their range
  const cc = n.data.curveColors;
  if (cc && curves.length) {
    const kname = new Set(keys.map((k) => k?.name ?? ''));
    const byKey = kname.size === 1 && !kname.has('');
    const vals = curves.map((_, j) => (byKey ? keys[j]!.value : j + 1));
    const fin = vals.filter(Number.isFinite);
    let range: [number, number] = [minOf(fin), maxOf(fin)];
    if (!(range[1] > range[0])) range = [range[0] - 0.5, range[0] + 0.5];
    const stops = stopsOf(cc.map, cc.colors ?? []);
    curves.forEach((c, j) => {
      c.style = { ...c.style, color: mapColor(stops, mapT(vals[j], range[0], range[1], false, !!cc.reverse)) };
      c.group = { base: `${n.id}:all`, index: j, count: curves.length, value: vals[j], name: byKey ? [...kname][0] : '', range, color: 'map' };
      if (c.style.colorBy === 'none') c.colorRange = range;
    });
  }
  // the quick fits of every curve (in its colour unless set; a trend dashed), each peak and the baseline, their bands;
  // the ranges drawn as bands (dragged on the figure); the results in a box, in the panel and on the “fits” port
  const qf = quickFitCurves(n.id, found.map((f) => ({ k: f.k, name: f.name, label: f.label, s: f.s, style: f.style, fits: quickFitsOf(rows[f.k]), color: curves.find((c) => c.key === `${n.id}:${f.k}`)?.style.color })), warnings);
  curves.push(...qf.curves);
  if (qf.table) outputs.fits = { t: 'dataset', v: qf.table };
  // the figure: the page, the frame with these curves, the legend and the annotations
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const nFig = axesFor === n.data.axes && !qf.boxes.length ? n : { ...n, data: { ...n.data, axes: axesFor, annotations: [...(n.data.annotations ?? []), ...qf.boxes] } };
  const { figure, legendCurves } = plotFigure(nFig, curves, warnings, insetFigs);
  const ax0 = figure.axes.find((q) => !q.inset) ?? figure.axes[0];
  if (ax0) ax0.annotations.push(...qf.regions);
  outputs.figure = { t: 'figure', v: figure };
  return { outputs, warnings: [...new Set(warnings)], errors, view: { curves, legendCurves, available, rowAvail, figure, ...(qf.view.length ? { quickFits: qf.view } : {}), ...sheetView } };
}

// The quick fits of a Plot's curves: the fitted curves (a trend dashed, a fit solid; in the curve's colour unless set),
// each peak on the baseline (dashed) and the baseline (dotted), the 95 % bands; every range a band of x (owner: dragged on
// the figure, its ends changed); the results — the boxes in the corners, the rows of the “fits” table, the panel's view.
type QFIn = { k: number; name: string; label: string; s: Series; style: CurveStyle; fits: QuickFitSpec[]; color?: string };
export type QuickFitView = { curve: number; fit: number; curveLabel: string; name: string; results: Omit<QuickFitResult, 'curve' | 'parts' | 'base'>[] };
function quickFitCurves(id: string, ins: QFIn[], warnings: string[]): { curves: Curve[]; regions: Annotation[]; boxes: AnnotationItem[]; table: Dataset | null; view: QuickFitView[] } {
  const curves: Curve[] = [];
  const regions: Annotation[] = [];
  const view: QuickFitView[] = [];
  const corners: Record<string, string[]> = {};
  const rows: { curve: string; fit: string; range: string; name: string; value: number; error: number }[] = [];
  const col = (nm: string, v: number[]) => ({ ...column(nm, Float64Array.from(v)), role: 'none' as const });
  for (const f of ins) {
    if (!f.fits.length) continue;
    const xv = f.s.x.values;
    const yv = f.s.y.values;
    const mk = f.s.x.mask ?? f.s.y.mask;
    const xs = Array.from(xv, (x, i) => (mk?.[i] || f.s.y.mask?.[i] ? NaN : x));
    const fin = xs.filter(Number.isFinite);
    if (!fin.length) continue;
    const span: [number, number] = [minOf(fin), maxOf(fin)];
    f.fits.forEach((q, j) => {
      // the ranges drawn (also of a fit turned off: they can still be moved)
      const look = q.region ?? {};
      if (look.show !== false)
        (q.ranges ?? []).forEach((r, i) => {
          const [lo, hi] = [Number.isFinite(r.lo) ? r.lo : span[0], Number.isFinite(r.hi) ? r.hi : span[1]];
          regions.push({ key: `${id}/qf-${f.k}-${j}-${i}`, owner: { node: id, field: 'qfit', curve: f.k, fit: j, item: i }, kind: 'shape', shape: shapeSpec({ kind: 'xband', coords: 'data', x1: Math.min(lo, hi), x2: Math.max(lo, hi), color: look.edge || RANGE_COLOR, width: look.edgeWidth ?? 0, dash: look.edgeDash ?? 'solid', fill: look.fill || RANGE_COLOR, fillOpacity: look.opacity ?? 0.13, ...(look.hatch && look.hatch !== 'none' ? { hatch: look.hatch, hatchColor: look.hatchColor || look.fill || RANGE_COLOR, ...(look.hatchLook ? { hatchLook: look.hatchLook } : {}) } : {}), z: -1 }) });
        });
      if (q.show === false) return;
      const r = quickFit(xs, yv, q, span);
      const tag = `${f.name}, quick fit${f.fits.length > 1 ? ` ${j + 1}` : ''}`;
      if (typeof r === 'string') {
        warnings.push(`${tag}: ${r}`);
        return;
      }
      warnings.push(...r.warnings.map((w) => `${tag}: ${w}`));
      const trend = isTrend(q.kind);
      const fl = fitLook(q, { color: f.color || f.style.color, lineWidth: f.style.lineWidth, axisX: f.style.axisX, axisY: f.style.axisY });
      const color = fl.color;
      const model = r.results[0]?.model ?? QUICK_FIT_NAMES[q.kind];
      const name = q.label?.trim() || (trend ? `${f.label}: ${QUICK_FIT_NAMES[q.kind]} fit` : `${f.label}: ${model}`);
      const mode = q.legend ?? (trend ? 'equation' : 'name');
      const many = r.results.length > 1;
      r.results.forEach((res, i) => {
        const r2 = Number.isFinite(res.r2) ? `, R² = ${res.r2.toFixed(4)}` : '';
        const where = many ? ` (${res.range})` : '';
        const label = mode === 'equation' ? (trend && q.kind !== 'movavg' ? `${res.equation}${r2}` : `${name}${r2}`) + where : mode === 'params' ? [`${name}${where}`, ...res.params.map(paramText).flatMap((_, k, a) => (k % 2 ? [] : [a.slice(k, k + 2).join(', ')]))].join('\\\\') : `${name}${where}`;
        const lo = res.curve.lo;
        const hi = res.curve.hi;
        const band = lo && hi ? { yErr: column('band +', Float64Array.from(hi, (h, k) => h - res.curve.y[k])), yErrLo: column('band −', Float64Array.from(lo, (l, k) => res.curve.y[k] - l)) } : {};
        // its columns named as its curve's (the axis title stays that of the data)
        const ser = (x: number[], y: number[]): Series => ({ name: f.s.y.name, x: column(f.s.x.name, Float64Array.from(x)), y: column(f.s.y.name, Float64Array.from(y)) });
        const axes = { axisX: fl.axisX, axisY: fl.axisY };
        const width = fl.lineWidth;
        // (an older project's trend line kept its key: its legend entry stays as set)
        const key = j === 0 && i === 0 ? `${id}:${f.k}:trend` : `${id}:${f.k}:qf${j}:${i}`;
        // its look as a curve's (line, symbols, steps, fill, colour from x / y …); the band from its own options
        const fc = makeCurve(key, label, { ...ser(res.curve.x, res.curve.y), ...band }, { ...fl, ...(lo ? { errStyle: 'band' as const, errFrom: 'column' as const, errAsym: true, errOpacity: q.bandOpacity ?? 0.2 } : {}) }, undefined, undefined, undefined, tag, warnings);
        curves.push(mode === 'none' ? { ...fc, noLegend: true } : fc);
        res.parts?.forEach((p, t) => curves.push({ key: `${key}:p${t}`, label: `${name}${where} · ${p.name}`, noLegend: true, series: ser(p.x, p.y), style: curveStyle({ mode: 'line', color, lineWidth: Math.max(0.5, width * 0.6), dash: 'dash', ...axes }) }));
        if (res.base) curves.push({ key: `${key}:base`, label: `${name}${where} · baseline`, noLegend: true, series: ser(res.base.x, res.base.y), style: curveStyle({ mode: 'line', color, lineWidth: Math.max(0.5, width * 0.6), dash: 'dot', ...axes }) });
        const all = [...res.params, ...res.derived];
        for (const p of all) rows.push({ curve: f.label, fit: name, range: res.range, name: p.name, value: p.value, error: p.error });
        rows.push({ curve: f.label, fit: name, range: res.range, name: 'R²', value: res.r2, error: NaN }, { curve: f.label, fit: name, range: res.range, name: 'n', value: res.n, error: NaN });
        if (q.box && q.box !== 'none') (corners[q.box] ??= []).push(`\\bold{${name}${where}}`, ...all.map(paramText), ...(Number.isFinite(res.r2) ? [`R² = ${res.r2.toFixed(4)}`] : []));
      });
      view.push({ curve: f.k, fit: j, curveLabel: f.label, name, results: r.results.map(({ curve: _c, parts: _p, base: _b, ...rest }) => rest) });
    });
  }
  const boxes: AnnotationItem[] = Object.entries(corners).map(([c, lines]) => ({ id: `qf-box-${c}`, type: 'text' as const, spec: { text: lines.join('\\\\'), coords: 'percent' as const, x: c[1] === 'l' ? 3 : 97, y: c[0] === 't' ? 3 : 97, anchor: c as 'tl', box: 'both' as const, boxColor: '#ffffff', borderColor: '#999999', borderWidth: 0.5, padding: 2.5, style: { size: 7 }, numbers: true } }));
  const txt = (nm: string, v: string[]) => ({ ...column(nm, Float64Array.from(v, () => NaN), v), role: 'none' as const });
  const table: Dataset | null = rows.length ? { name: 'quick fits', columns: [txt('curve', rows.map((r) => r.curve)), txt('fit', rows.map((r) => r.fit)), txt('range', rows.map((r) => r.range || 'all')), txt('parameter', rows.map((r) => r.name)), col('value', rows.map((r) => r.value)), col('error', rows.map((r) => r.error))] } : null;
  return { curves, regions, boxes, table, view };
}

// Curves stacked: each on the sum of the ones before it, on the X of the first (the others' Y read there, linearly
// between their points), or as % of the sum of all at every X; each filled down to the one under it unless it has a fill
// of its own (the first down to y = 0).
function stackCurves(found: { s: Series; style: CurveStyle }[], how: 'stack' | 'percent') {
  const X = found[0].s.x.values;
  const at = (s: Series) => {
    const xs = Array.from(s.x.values);
    const ys = Array.from(s.y.values);
    const idx = xs.map((_, i) => i).filter((i) => Number.isFinite(xs[i]) && Number.isFinite(ys[i])).sort((a, b) => xs[a] - xs[b]);
    const same = s.x.values === X || (s.x.values.length === X.length && xs.every((v, i) => v === X[i] || (Number.isNaN(v) && Number.isNaN(X[i]))));
    return Float64Array.from(X, (x, i) => {
      if (same) return Number.isFinite(ys[i]) ? ys[i] : 0;
      if (!idx.length || !Number.isFinite(x) || x < xs[idx[0]] || x > xs[idx[idx.length - 1]]) return 0;
      let lo = 0;
      let hi = idx.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (xs[idx[m]] <= x) lo = m;
        else hi = m;
      }
      const [a, b] = [idx[lo], idx[hi]];
      return xs[b] === xs[a] ? ys[a] : ys[a] + ((ys[b] - ys[a]) * (x - xs[a])) / (xs[b] - xs[a]);
    });
  };
  const parts = found.map((f) => at(f.s));
  const total = Float64Array.from(X, (_, i) => parts.reduce((t, p) => t + p[i], 0));
  const acc = new Float64Array(X.length);
  found.forEach((f, k) => {
    for (let i = 0; i < X.length; i++) acc[i] += parts[k][i];
    const y = Float64Array.from(acc, (v, i) => (how === 'percent' ? (total[i] ? (100 * v) / total[i] : NaN) : v));
    f.s = { name: f.s.name, x: found[0].s.x, y: { ...f.s.y, values: y, text: undefined } };
    if (f.style.fill === 'none') f.style = { ...f.style, fill: k === 0 ? 'zero' : 'curve', fillCurve: k, fillOpacity: f.style.fillOpacity > 0 ? f.style.fillOpacity : 0.4 };
  });
}

// The lines of a dumbbell chart: at every X shared by the curves, from the lowest Y to the highest.
function joinCurve(id: string, curves: Curve[], join: NonNullable<Plot1DData['join']>): Curve {
  const at = new Map<number, [number, number]>();
  for (const c of curves) {
    const { x, y } = c.series;
    for (let i = 0; i < Math.min(x.values.length, y.values.length); i++) {
      const [u, v] = [x.values[i], y.values[i]];
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
      const q = Math.round(u * 1e9) / 1e9;
      const r = at.get(q);
      at.set(q, r ? [Math.min(r[0], v), Math.max(r[1], v)] : [v, v]);
    }
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [u, [lo, hi]] of at)
    if (hi > lo) {
      xs.push(u, u, NaN);
      ys.push(lo, hi, NaN);
    }
  return { key: `${id}:join`, label: 'joined', noLegend: true, series: { name: 'joined', x: column('x', Float64Array.from(xs)), y: column('y', Float64Array.from(ys)) }, style: curveStyle({ mode: 'line', color: join.color || '#9a9a9a', lineWidth: join.width && join.width > 0 ? join.width : 1.5, lineCap: 'round' }) };
}

// Histogram: the columns of its datasets (chosen, else the designated Y; masked values left out) counted in bins, its
// fits; a whole figure as a Plot's (the same axes, legend, annotations, page and insets).
// the colour of the ranges chosen on a graph (Fit, Histogram …)
const RANGE_COLOR = '#e69f00';
function histogramNode(n: { id: string; data: HistogramData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: the columns of values to count.' } };
  const available = ds.columns.map(colInfo);
  let cols: Column[];
  if (d.ys.trim()) {
    const p = pick(d.ys, ds.columns.map((c) => c.name), true);
    if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    cols = p.found.map((j) => ds.columns[j]);
  } else {
    cols = ds.columns.filter((_, j) => roleOf(ds.columns, j) === 'y');
    // nothing designated Y: the first column of numbers
    if (!cols.length) cols = ds.columns.filter((c) => c.values.some(Number.isFinite)).slice(0, 1);
  }
  if (!cols.length) return { view: { available, waiting: 'Choose the columns to count.' } };
  // a column of weights: every value counted that many times (row by row)
  const wc = d.weights ? findColumn(ds.columns, d.weights) : undefined;
  if (d.weights && !wc) return { errors: [`No column “${d.weights}” (the weights).`], view: { available } };
  const series = cols.filter((c) => c !== wc).map((c) => {
    const mask = maskOf([c], c.values.length);
    const rows = Array.from(c.values, (_, i) => i).filter((i) => Number.isFinite(c.values[i]) && !mask?.[i]);
    return { name: c.name, values: rows.map((i) => c.values[i]), ...(wc ? { weights: rows.map((i) => wc.values[i]) } : {}) };
  });
  const xName = series.length === 1 ? series[0].name : 'Value';
  const r = histogram(series, d, xName);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  // the Y title from the heights (the Y name of the bars and of all drawn with them: fits, marks)
  const yName = d.cumulative ? (d.norm === 'count' ? 'Cumulative count' : d.norm === 'percent' ? 'Cumulative percent (%)' : 'Cumulative probability') : d.norm === 'count' ? 'Count' : d.norm === 'percent' ? 'Percent (%)' : d.norm === 'probability' ? 'Probability' : 'Probability density';
  for (const c of r.curves) c.series = { ...c.series, y: { ...c.series.y, name: yName } };
  const warnings = [...r.warnings];
  if (wc && d.fits.some((f) => f.method === 'data' || f.kind === 'kernel')) warnings.push('The fits from the data take every value once (not its weight); the fits to the bars take the weighted heights.');
  // bins on a log scale: the X axis logarithmic too (unless its scale was chosen)
  const axes = d.bins.log && !d.axes?.x?.scale ? { ...d.axes, x: { ...AXIS_DEFAULTS, ...d.axes?.x, scale: 'log' as const } } : d.axes;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes, legend: d.legend, annotations: d.annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  // the fit ranges: bands under the bars (as in Fit), their edges dragged on the figure
  const ax = figure.axes[0];
  if (ax && !d.cumulative)
    (d.ranges ?? []).forEach((q, k) => {
      const [lo, hi] = [r.edges[0], r.edges[r.edges.length - 1]];
      const [a, b] = [Number.isFinite(q.lo) ? q.lo : lo, Number.isFinite(q.hi) ? q.hi : hi];
      ax.annotations.push({ key: `${n.id}/fit-range-${k}`, owner: { node: n.id, field: 'ranges', item: k }, kind: 'shape', shape: shapeSpec({ kind: 'xband', coords: 'data', x1: Math.max(Math.min(a, b), lo), x2: Math.min(Math.max(a, b), hi), color: RANGE_COLOR, fill: RANGE_COLOR, fillOpacity: 0.13, z: -1 }) });
    });
  return {
    outputs: { figure: { t: 'figure', v: figure }, bins: { t: 'dataset', v: r.bins }, fits: { t: 'dataset', v: r.table }, curves: { t: 'dataset', v: r.fitCurves } },
    warnings: [...new Set(warnings)],
    view: { available, figure, legendCurves, hist: { fits: r.fits.map(({ curve: _c, parts: _p, ...f }) => f), bins: r.edges.length - 1, from: r.edges[0], to: r.edges[r.edges.length - 1] } },
  };
}

// Bar chart: a table (categories and value columns with their errors) or raw values by group, its bars; a whole figure
// as a Plot's. The categories written on their axis (unless its ticks were set), the axis titles from the columns.
function barChartNode(n: { id: string; data: BarChartData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: categories and values (a table), or values with their groups.' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  const list = (spec: string) => {
    const p = pick(spec, all.map((c) => c.name), true);
    return p.missing.length ? `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.` : p.found.map((j) => all[j]);
  };
  const roles = curvesByRole(all).curves;
  let t: ReturnType<typeof wideTable>;
  let catTitle: string;
  let valTitle: string;
  if (d.mode === 'raw') {
    const value = d.value ? by(d.value) : (findColumn(all, roles[0]?.y ?? '') ?? all.find((c) => c.values.some(Number.isFinite)));
    const group = d.group ? by(d.group) : (all.find((c) => c.text?.some((x) => x?.trim())) ?? findColumn(all, roles[0]?.x ?? ''));
    const sub = d.sub ? by(d.sub) : undefined;
    if (!value || !group) return { view: { available, waiting: 'Choose the values and the column of their groups.' } };
    if (d.sub && !sub) return { errors: [`No column “${d.sub}”.`], view: { available } };
    t = rawTable(value, group, sub, d.stat, d.err, value.name);
    catTitle = group.name;
    valTitle = d.stat === 'count' ? 'Count' : value.name;
  } else {
    const ys = d.ys.trim() ? list(d.ys) : all.filter((_, j) => roleOf(all, j) === 'y');
    if (typeof ys === 'string') return { errors: [ys], view: { available } };
    if (!ys.length) return { view: { available, waiting: 'Choose the value columns (or designate them Y).' } };
    const errs = d.errs.trim() ? list(d.errs) : ys.map((y) => by(roles.find((r) => findColumn(all, r.y) === y)?.yerr ?? ''));
    if (typeof errs === 'string') return { errors: [errs], view: { available } };
    const cat = d.cat === '-' ? undefined : d.cat ? by(d.cat) : findColumn(all, roles.find((r) => findColumn(all, r.y) === ys[0])?.x ?? roles[0]?.x ?? '');
    t = wideTable(cat, ys, errs);
    catTitle = cat?.name ?? 'Row';
    valTitle = ys.length === 1 ? ys[0].name : '';
  }
  if (d.sort && d.sort !== 'none') t = sortTable(t, d.sort, d.arrange === 'stacked' || d.arrange === 'percent' || d.arrange === 'waterfall');
  const r = barChart(t, d);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  // the axis titles: the categories' and the values' columns
  for (const c of r.curves) {
    if (!c.bars || c.key.startsWith('cat:')) continue;
    const cc = { ...column(catTitle, Float64Array.from(d.horizontal ? c.series.y.values : c.series.x.values)) };
    const vc = { ...column(valTitle || c.series.name, Float64Array.from(d.horizontal ? c.series.x.values : c.series.y.values)) };
    c.series = d.horizontal ? { ...c.series, x: vc, y: cc } : { ...c.series, x: cc, y: vc };
  }
  // the categories on their axis: their names at their places, the axis from half a step before the first to half after
  const catAxis = d.horizontal ? 'y' : 'x';
  const own = d.axes?.[catAxis];
  const pad = (r.catHi - r.catLo) / Math.max(1, t.categories.length) / 2 || 0.5;
  const axes = {
    ...d.axes,
    [catAxis]: {
      ...AXIS_DEFAULTS,
      ...own,
      ...(r.categoryTicks && (own?.ticksBy ?? 'auto') === 'auto' ? { ticksBy: 'values' as const, custom: r.categoryTicks, minor: 0 } : {}),
      ...(!Number.isFinite(own?.min ?? NaN) && !Number.isFinite(own?.max ?? NaN) ? { min: r.catLo - pad * 0.25, max: r.catHi + pad * 0.25 } : {}),
    },
  };
  const warnings = [...r.warnings];
  const sig = withBrackets(r, d.sig, d.horizontal, inputs, warnings);
  // curves over the bars (the overlay port): at the categories' places, on a second axis if asked
  const over = overlayCurves(inputs, t.series.length, { cats: t.categories, right: !!d.overlayRight, turned: d.horizontal }, warnings);
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: withOverlayAxis(axes, over, d.horizontal), legend: d.legend, annotations: d.annotations, page: d.page, insets: d.insets } }, [...r.curves, ...over], warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure }, values: { t: 'dataset', v: r.values }, ...(sig ? { significance: { t: 'dataset' as const, v: sig } } : {}) }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves, groupNames: r.elements.map((e) => e.name) } };
}

const SIDES_OF = (a: Parameters<typeof axesStyle>[0]) => axesStyle(a).sides;

// Curves drawn over a chart (its “overlay” port): every Y of the datasets connected, with its X (text: at the place of
// the category of that name; none: the row) and its ±Y, as lines and symbols in the next colours; on the right axis when
// asked; turned with horizontal bars (the values along X).
function overlayCurves(inputs: Inputs, from: number, o: { cats?: { pos: number; label: string }[]; right?: boolean; turned?: boolean }, warnings: string[]): Curve[] {
  const sets = (inputs.get('overlay') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : []));
  const out: Curve[] = [];
  for (const ds of sets) {
    for (const c of curvesByRole(ds.columns).curves) {
      const y = findColumn(ds.columns, c.y);
      if (!y) continue;
      const xc = c.x ? findColumn(ds.columns, c.x) : undefined;
      const err = c.yerr ? findColumn(ds.columns, c.yerr) : undefined;
      // X: numbers as they are; names at their categories' places (left out when not one of them)
      const pos = Array.from(y.values, (_, i) => {
        const t = xc?.text?.[i]?.trim();
        if (t) {
          const k = o.cats?.find((q) => q.label === t);
          return k ? k.pos : NaN;
        }
        return xc ? xc.values[i] : i + 1;
      });
      const missing = pos.filter((p, i) => !Number.isFinite(p) && xc?.text?.[i]?.trim()).length;
      if (missing) warnings.push(`Overlay “${y.name}”: ${missing} name(s) of X not among the categories, left out.`);
      const pc = column(xc?.name ?? 'Row', Float64Array.from(pos));
      const yc = column(y.name, Float64Array.from(y.values));
      const series = o.turned ? { name: y.name, x: yc, y: pc, ...(err ? { xErr: err } : {}) } : { name: y.name, x: pc, y: yc, ...(err ? { yErr: err } : {}) };
      const color = PALETTE[(from + out.length + 1) % PALETTE.length];
      out.push({ key: `overlay:${out.length}`, label: y.name, series, style: curveStyle({ mode: 'linesymbol', color, lineWidth: 1, symbol: 'circle', symbolSize: 3.5, ...(o.right && !o.turned ? { axisY: 'right' } : {}), ...(o.right && o.turned ? { axisX: 'top' } : {}) }) });
    }
  }
  return out;
}
// the axes with a second scale for the overlay (right, or top for horizontal bars), its numbers and title shown — unless
// that axis was set by hand
function withOverlayAxis(axes: Partial<AxesStyle> | undefined, overlay: Curve[], turned: boolean): Partial<AxesStyle> | undefined {
  if (!overlay.some((c) => c.style.axisY === 'right' || c.style.axisX === 'top')) return axes;
  const st = axesStyle(axes);
  const k = turned ? 'top' : 'right';
  if (axes?.[k]?.mode && axes[k]!.mode !== 'mirror') return axes;
  return { ...axes, [k]: { ...st[k], mode: 'own' }, sides: { ...st.sides, [k]: { ...st.sides[k], labels: true, showTitle: true, line: true } } };
}

// The significance brackets of a Bar chart / Box & violin: tested from its groups, or from a table on its p values port,
// or written; drawn as curves (the axis makes room for them); the comparisons as a table.
function withBrackets(r: { curves: Curve[]; elements: SigElement[]; span: [number, number] }, sig: Partial<SigSpec> | undefined, horizontal: boolean, inputs: Inputs, warnings: string[]): Dataset | undefined {
  if (!sig?.on) return undefined;
  const s = { ...SIG_DEFAULTS, ...sig };
  const tbl = (inputs.get('pvalues') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : []))[0];
  const g = significance(r.elements, s, tbl);
  warnings.push(...g.warnings);
  r.curves.push(...bracketCurves(g.brackets, r.elements, s, horizontal, 0.06 * (r.span[1] - r.span[0] || 1)));
  return bracketTable(g.brackets, r.elements);
}

// Box & violin: the groups (the columns of a table, or raw values by group and subgroup), their boxes and violins; a whole
// figure as a Plot's, the groups written on their axis.
function boxViolinNode(n: { id: string; data: BoxViolinData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: a column per group, or values with their groups.' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  const roles = curvesByRole(all).curves;
  let g: ReturnType<typeof boxGroups>;
  let catTitle = '';
  let valTitle = '';
  if (d.mode === 'raw') {
    const value = d.value ? by(d.value) : (findColumn(all, roles[0]?.y ?? '') ?? all.find((c) => c.values.some(Number.isFinite)));
    const group = d.group ? by(d.group) : (all.find((c) => c.text?.some((x) => x?.trim())) ?? findColumn(all, roles[0]?.x ?? ''));
    const sub = d.sub ? by(d.sub) : undefined;
    if (!value || !group) return { view: { available, waiting: 'Choose the values and the column of their groups.' } };
    if (d.sub && !sub) return { errors: [`No column “${d.sub}”.`], view: { available } };
    g = boxGroups(d, [], value, group, sub);
    [catTitle, valTitle] = [group.name, value.name];
  } else {
    let cols: Column[];
    if (d.ys.trim()) {
      const p = pick(d.ys, all.map((c) => c.name), true);
      if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
      cols = p.found.map((j) => all[j]);
    } else {
      cols = all.filter((_, j) => roleOf(all, j) === 'y');
      if (!cols.length) cols = all.filter((c) => c.values.some(Number.isFinite));
    }
    if (!cols.length) return { view: { available, waiting: 'Choose the columns: one per group.' } };
    g = boxGroups(d, cols);
    valTitle = cols.length === 1 ? cols[0].name : '';
  }
  const r = boxViolin(g.cats, g.series, g.groups, d);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  // the axis titles
  for (const c of r.curves) {
    if (!c.boxes) continue;
    const cc = column(catTitle, c.series.x.values as Float64Array);
    const vc = column(valTitle || 'Value', c.series.y.values as Float64Array);
    c.series = d.horizontal ? { ...c.series, x: vc, y: cc } : { ...c.series, x: cc, y: vc };
  }
  const catAxis = d.horizontal ? 'y' : 'x';
  const own = d.axes?.[catAxis];
  // the categories' side: no title when there is none to write (a column per group), unless one is set
  const catSide = d.horizontal ? 'left' : 'bottom';
  const sides = !catTitle && !d.axes?.sides?.[catSide]?.title ? { ...SIDES_OF(d.axes), [catSide]: { ...SIDES_OF(d.axes)[catSide], showTitle: false } } : d.axes?.sides;
  const axes = {
    ...d.axes,
    ...(sides ? { sides } : {}),
    [catAxis]: {
      ...AXIS_DEFAULTS,
      ...own,
      ...((own?.ticksBy ?? 'auto') === 'auto' ? { ticksBy: 'values' as const, custom: r.categoryTicks, minor: 0 } : {}),
      ...(!Number.isFinite(own?.min ?? NaN) && !Number.isFinite(own?.max ?? NaN) ? { min: Math.min(0.5, r.catLo - 0.05), max: Math.max(g.cats.length + 0.5, r.catHi + 0.05) } : {}),
    },
  };
  const warnings = [...r.warnings];
  const sig = withBrackets(r, d.sig, d.horizontal, inputs, warnings);
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes, legend: d.legend, annotations: d.annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure }, stats: { t: 'dataset', v: r.table }, ...(sig ? { significance: { t: 'dataset' as const, v: sig } } : {}) }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves, groupNames: r.elements.map((e) => e.name) } };
}

// Probability plot: the groups (the columns of a table, or raw values by group; masked values left out) against a
// distribution; a whole figure as a Plot's. The probability axis set by the node (a probability scale, or Gamma's
// quantiles with the percents written at them), the data on a log axis for Lognormal and Weibull.
function probPlotNode(n: { id: string; data: ProbPlotData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: a column per group, or values with the column of their groups.' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const roles = curvesByRole(all).curves;
  const kept = (c: Column) => {
    const mask = maskOf([c], c.values.length);
    return (i: number) => Number.isFinite(c.values[i]) && !mask?.[i];
  };
  let groups: ProbGroup[];
  let valueName: string;
  // life data: the status of every row (failed or suspended); a row whose status is not read is taken as failed
  const status = d.censor ? findColumn(all, d.censor) : undefined;
  if (d.censor && !status) return { errors: [`No column “${d.censor}” (the status: 1 / F failed, 0 / S suspended).`], view: { available } };
  let unread = 0;
  const suspAt = (i: number) => {
    if (!status) return false;
    const s = suspendedOf(status.text?.[i], status.values[i]);
    if (s === null) unread++;
    return !!s;
  };
  if (d.mode === 'raw') {
    const numeric = (c: Column | undefined) => (c?.values.some(Number.isFinite) ? c : undefined);
    const value = d.value ? findColumn(all, d.value) : (numeric(findColumn(all, roles[0]?.y ?? '')) ?? all.find((c) => numeric(c)));
    const group = d.group === '-' ? undefined : d.group ? findColumn(all, d.group) : all.find((c) => c !== value && c.text?.some((x) => x?.trim()));
    if (!value) return { view: { available, waiting: 'Choose the values (and the column of their groups).' } };
    if (d.group && d.group !== '-' && !group) return { errors: [`No column “${d.group}”.`], view: { available } };
    const ok = kept(value);
    const by = new Map<string, { values: number[]; susp: boolean[] }>();
    for (let i = 0; i < value.values.length; i++) {
      const g = group ? keyOf(group, i) : value.name;
      if (!g || !ok(i)) continue;
      const e = by.get(g) ?? { values: [], susp: [] };
      e.values.push(value.values[i]);
      e.susp.push(suspAt(i));
      by.set(g, e);
    }
    groups = [...by].map(([name, e]) => ({ name, ...e }));
    valueName = value.name;
  } else {
    let cols: Column[];
    if (d.ys.trim()) {
      const p = pick(d.ys, all.map((c) => c.name), true);
      if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
      cols = p.found.map((j) => all[j]);
    } else {
      // the designated Y of numbers (not the status); none: the first column of numbers
      const numeric = (c: Column) => c !== status && c.values.some(Number.isFinite) && !c.text?.some((t) => t?.trim() && !Number.isFinite(Number(t)));
      cols = all.filter((c, j) => roleOf(all, j) === 'y' && numeric(c));
      if (!cols.length) cols = all.filter(numeric).slice(0, 1);
    }
    if (!cols.length) return { view: { available, waiting: 'Choose the columns: one per group.' } };
    groups = cols.map((c) => {
      const ok = kept(c);
      const rows = Array.from(c.values, (_, i) => i).filter(ok);
      return { name: c.name, values: rows.map((i) => c.values[i]), susp: rows.map(suspAt) };
    });
    valueName = cols.length === 1 ? cols[0].name : 'Value';
  }
  const r = probPlot(groups, d, valueName);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  // Probability: the probability axis and (Lognormal, Weibull) the data's log axis
  let axes = d.axes;
  if (d.kind === 'prob') {
    const [pk, dk] = d.swap ? (['x', 'y'] as const) : (['y', 'x'] as const);
    const own = d.axes?.[pk];
    const probSpec = r.axis.prob ? { scale: 'probability' as const, prob: r.axis.prob } : r.axis.ticks && (own?.ticksBy ?? 'auto') === 'auto' ? { scale: 'linear' as const, ticksBy: 'values' as const, custom: r.axis.ticks, minor: 0 } : { scale: 'linear' as const };
    axes = { ...d.axes, [pk]: { ...AXIS_DEFAULTS, ...own, ...probSpec }, ...(r.axis.logData ? { [dk]: { ...AXIS_DEFAULTS, ...d.axes?.[dk], scale: 'log' as const } } : {}) };
  }
  const warnings = [...r.warnings];
  if (unread) warnings.push(`Status: ${unread} value(s) not read as failed (1, F) or suspended (0, S) — taken as failed.`);
  // the parameters written in a corner of the frame
  const corner = d.paramBox && d.paramBox !== 'none' ? d.paramBox : null;
  const box = corner && r.text.length ? [{ id: 'pp-params', type: 'text' as const, spec: { text: r.text.join('\\\\'), coords: 'percent' as const, x: corner[1] === 'l' ? 3 : 97, y: corner[0] === 't' ? 3 : 97, anchor: corner, box: 'both' as const, boxColor: '#ffffff', borderColor: '#999999', borderWidth: 0.5, padding: 2.5, style: { size: 7 }, numbers: true } }] : [];
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes, legend: d.legend, annotations: [...(d.annotations ?? []), ...box], page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure }, stats: { t: 'dataset', v: r.stats }, points: { t: 'dataset', v: r.points } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves, prob: r.rows } };
}

// Bland–Altman: two columns (the methods, A and B; masked rows left out), optionally a column of groups for the colours;
// a whole figure as a Plot's (the ratio on a log axis).
function blandAltmanNode(n: { id: string; data: BlandAltmanData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: two columns measured by two methods (A and B).' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const numeric = all.filter((c) => c.values.some(Number.isFinite));
  const ys = all.filter((c, j) => roleOf(all, j) === 'y' && c.values.some(Number.isFinite));
  const pool = ys.length >= 2 ? ys : numeric;
  const A = d.a ? findColumn(all, d.a) : pool[0];
  const B = d.b ? findColumn(all, d.b) : pool.find((c) => c !== A);
  if (d.a && !A) return { errors: [`No column “${d.a}”.`], view: { available } };
  if (d.b && !B) return { errors: [`No column “${d.b}”.`], view: { available } };
  if (!A || !B) return { view: { available, waiting: 'Choose the two methods: columns A and B.' } };
  const G = d.group ? findColumn(all, d.group) : undefined;
  if (d.group && !G) return { errors: [`No column “${d.group}”.`], view: { available } };
  const nRows = Math.min(A.values.length, B.values.length);
  const mask = maskOf([A, B], nRows);
  const by = new Map<string, BAGroup>();
  for (let i = 0; i < nRows; i++) {
    if (mask?.[i]) continue;
    const g = G ? keyOf(G, i) : `${A.name} vs ${B.name}`;
    if (!g) continue;
    if (!by.has(g)) by.set(g, { name: g, a: [], b: [] });
    by.get(g)!.a.push(A.values[i]);
    by.get(g)!.b.push(B.values[i]);
  }
  const r = blandAltman([...by.values()], d, A.name, B.name);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  const axes = r.logY ? { ...d.axes, y: { ...AXIS_DEFAULTS, ...d.axes?.y, scale: 'log' as const } } : d.axes;
  const warnings = [...r.warnings];
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes, legend: d.legend, annotations: d.annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure }, stats: { t: 'dataset', v: r.stats }, points: { t: 'dataset', v: r.points } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves, ba: r.rows } };
}

// Pie chart: categories and their values (a table: a value column per ring), or raw values counted / summed / averaged
// by group; a whole figure as a Plot's with no axes drawn (the pie fills the frame).
function pieNode(n: { id: string; data: PieData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: categories and their values, or values with their groups.' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  const textCol = all.find((c) => c.text?.some((x) => x?.trim()));
  const roles = curvesByRole(all).curves;
  let t: ReturnType<typeof wideTable>;
  if (d.mode === 'raw') {
    const group = d.group ? by(d.group) : textCol;
    const value = d.value ? by(d.value) : undefined;
    if (d.group && !group) return { errors: [`No column “${d.group}”.`], view: { available } };
    if (d.value && !value) return { errors: [`No column “${d.value}”.`], view: { available } };
    if (!group) return { view: { available, waiting: 'Choose the column of the categories.' } };
    // no value column: the rows of every category counted
    const v = value ?? column('count', Float64Array.from(group.values, () => 1));
    t = rawTable(v, group, undefined, value ? (d.stat === 'mean' ? 'mean' : d.stat === 'count' ? 'count' : 'sum') : 'count', 'none', v.name);
  } else {
    let ys: Column[];
    if (d.ys.trim()) {
      const p = pick(d.ys, all.map((c) => c.name), true);
      if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
      ys = p.found.map((j) => all[j]);
    } else {
      ys = all.filter((c, j) => roleOf(all, j) === 'y' && c.values.some(Number.isFinite));
      if (!ys.length) ys = all.filter((c) => c.values.some(Number.isFinite) && c !== textCol).slice(0, 1);
    }
    if (!ys.length) return { view: { available, waiting: 'Choose the value columns (a ring each).' } };
    const cat = d.cat === '-' ? undefined : d.cat ? by(d.cat) : (textCol ?? findColumn(all, roles[0]?.x ?? ''));
    t = wideTable(cat, ys, ys.map(() => undefined));
  }
  const r = pieChart(t, d);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  // no axes: every side hidden, no grid
  const axes = noAxes(d.axes);
  const warnings = [...r.warnings];
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes, legend: d.legend, annotations: d.annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure }, slices: { t: 'dataset', v: r.table } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves, pieKind: r.kind } };
}

// the grids made from X, Y, Z columns, kept by the Z values (and what else made them)
const gridMemo = new WeakMap<object, { key: unknown[]; made: { g: Grid; note?: string } | string }>();

// Contour / heatmap: X, Y, Z columns (a grid, or scattered points interpolated to one) or a matrix (a Y column and Z
// columns named by their X); masked rows left out; a whole figure as a Plot's, with a colour bar of its own.
// The grid of a node that reads one (Contour, 3D plot): X, Y, Z columns — on a grid in any row order, or scattered
// (interpolated on their triangles, made once while the columns do not change) — or a matrix (a Y column and Z
// columns named by their X).
type GridInput = Pick<ContourData, 'layout' | 'x' | 'y' | 'z' | 'yCol' | 'zs' | 'xTitle' | 'grid'>;
function readGrid(d: GridInput, all: Column[]): { g: Grid; names: { x: string; y: string; z: string }; note?: string } | { error: string } | { waiting: string } {
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  const numeric = all.filter((c) => c.values.some(Number.isFinite));
  const desX = all.find((_, j) => roleOf(all, j) === 'x');
  if (d.layout === 'matrix') {
    const yc = by(d.yCol) ?? desX ?? numeric[0];
    if (d.yCol && !by(d.yCol)) return { error: `No column “${d.yCol}”.` };
    let zs: Column[];
    if (d.zs.trim()) {
      const p = pick(d.zs, all.map((c) => c.name), true);
      if (p.missing.length) return { error: `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.` };
      zs = p.found.map((j) => all[j]);
    } else zs = numeric.filter((c) => c !== yc);
    if (!yc || zs.length < 2) return { waiting: 'Matrix: a Y column and 2 Z columns or more (named by their X).' };
    const m = gridFromMatrix(yc, zs);
    if (typeof m === 'string') return { error: m };
    const mn = matrixNames(zs);
    return { g: m, names: { x: d.xTitle?.trim() || mn.x, y: yc.name, z: mn.z } };
  }
  // X, Y, Z columns
  {
    const X = by(d.x) ?? desX ?? numeric[0];
    const Y = by(d.y) ?? numeric.find((c) => c !== X);
    const Z = by(d.z) ?? numeric.find((c) => c !== X && c !== Y);
    for (const [s, c] of [[d.x, X], [d.y, Y], [d.z, Z]] as const) if (s && !c) return { error: `No column “${s}”.` };
    if (!X || !Y || !Z) return { waiting: 'Choose the X, Y and Z columns.' };
    // the grid of the same columns is made once (a change of colours or levels does not make it again)
    const memoKey = [X.values, Y.values, X.mask, Y.mask, Z.mask, Math.min(400, Math.max(10, d.grid || 100))];
    const hit = gridMemo.get(Z.values);
    let made: { g: Grid; note?: string } | string;
    if (hit && hit.key.length === memoKey.length && hit.key.every((v, k) => v === memoKey[k])) made = hit.made;
    else {
      const nr = Math.min(X.values.length, Y.values.length, Z.values.length);
      const mask = maskOf([X, Y, Z], nr);
      const keep = Array.from({ length: nr }, (_, i) => i).filter((i) => !mask?.[i] && Number.isFinite(X.values[i]) && Number.isFinite(Y.values[i]) && Number.isFinite(Z.values[i]));
      const [px, py, pz] = [keep.map((i) => X.values[i]), keep.map((i) => Y.values[i]), keep.map((i) => Z.values[i])];
      const onGrid = px.length < 3 ? null : asGrid(px, py, pz);
      made =
        px.length < 3
          ? 'Fewer than 3 points with X, Y and Z.'
          : onGrid
            ? { g: onGrid }
            : px.length > 20000
              ? `${px.length} scattered points: too many to triangulate here (20 000 at most); put them on a grid first.`
              : (() => {
                  const sg = gridFromScatter(px, py, pz, memoKey[5] as number);
                  return { g: sg, note: `Scattered points: Z interpolated linearly on their triangles to a ${sg.xs.length} × ${sg.ys.length} grid.` };
                })();
      gridMemo.set(Z.values, { key: memoKey, made });
    }
    if (typeof made === 'string') return { error: made };
    return { g: made.g, names: { x: X.name, y: Y.name, z: Z.name }, ...(made.note ? { note: made.note } : {}) };
  }
}

function contourNode(n: { id: string; data: ContourData }, inputs: Inputs): Out {
  const d = n.data;
  const sets = (inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : []));
  const mv = inputs.get('matrix')?.[0]?.value;
  if (mv?.t === 'matrix') return sets.length ? { errors: ['Connect one: a dataset or a matrix.'], view: { matrix: matInfo(mv.v) } } : contourMatrix(n.id, { ...MATRIX_PLOT_DEFAULTS, ...d }, mv.v, inputs);
  const ds = mergeSets(sets);
  if (!ds) return { view: { waiting: 'Connect a dataset (X, Y, Z columns, or a Y column and Z columns named by their X) or a matrix.' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const warnings: string[] = [];
  // the points counted or their density, the vectors: made here from the X, Y (U, V) columns
  if (d.layout === 'xyz' && ((d.zFrom && d.zFrom !== 'column') || (d.vectors && d.vectors !== 'none'))) return contourFields(n, all, available, inputs);
  const read = readGrid(d, all);
  if ('error' in read) return { errors: [read.error], view: { available } };
  if ('waiting' in read) return { view: { available, waiting: read.waiting } };
  const { g, names } = read;
  if (read.note) warnings.push(read.note);
  const r = contourPlot(g, d, names);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  warnings.push(...r.warnings);
  // the colour bar (unless the lines alone, coloured by the map, say it)
  const annotations = d.colorbar && d.draw !== 'lines' ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, title: d.zTitle || names.z } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: d.axes, legend: d.legend, annotations, page: d.page, insets: d.insets } }, [...r.curves, ...overlayCurves(inputs, 0, {}, warnings)], warnings, insetFigs);
  return {
    outputs: { figure: { t: 'figure', v: figure }, grid: { t: 'dataset', v: r.gridSet }, ...(r.rowProfile ? { row: { t: 'dataset' as const, v: r.rowProfile } } : {}), ...(r.colProfile ? { column: { t: 'dataset' as const, v: r.colProfile } } : {}) },
    warnings: [...new Set(warnings)],
    view: { available, figure, legendCurves, contour: { nx: g.xs.length, ny: g.ys.length, levels: r.levels, range: r.range, x: [g.xs[0], g.xs[g.xs.length - 1]], y: [g.ys[0], g.ys[g.ys.length - 1]] } },
  };
}

// Contour / heatmap of points and vectors: the map from the points counted (a 2D histogram), their density, the speed of
// the vectors (or none); over it the vectors as arrows or streamlines, and the points.
function contourFields(n: { id: string; data: ContourData }, all: Column[], available: ColInfo[], inputs: Inputs): Out {
  const d = n.data;
  const warnings: string[] = [];
  const by = (nm: string | undefined) => (nm ? findColumn(all, nm) : undefined);
  const numeric = all.filter((c) => c.values.some(Number.isFinite));
  const X = by(d.x) ?? all.find((_, j) => roleOf(all, j) === 'x') ?? numeric[0];
  const Y = by(d.y) ?? numeric.find((c) => c !== X);
  for (const [s, c] of [[d.x, X], [d.y, Y]] as const) if (s && !c) return { errors: [`No column “${s}”.`], view: { available } };
  if (!X || !Y) return { view: { available, waiting: 'Choose the X and Y columns.' } };
  const vec = d.vectors && d.vectors !== 'none';
  const U = vec ? by(d.u) : undefined;
  const V = vec ? by(d.v) : undefined;
  if (vec && (!U || !V)) return { view: { available, waiting: 'Choose the U and V columns: the vector at every X, Y.' } };
  const cols = [X, Y, ...(U && V ? [U, V] : [])];
  const nr = Math.min(...cols.map((c) => c.values.length));
  const mask = maskOf(cols, nr);
  const keep = Array.from({ length: nr }, (_, i) => i).filter((i) => !mask?.[i] && cols.every((c) => Number.isFinite(c.values[i])));
  if (keep.length < 3) return { errors: ['Fewer than 3 points with X and Y.'], view: { available } };
  const [px, py] = [keep.map((i) => X.values[i]), keep.map((i) => Y.values[i])];
  // the vectors on a grid: as they are, or interpolated from scattered points
  const gridOf = (c: Column): Grid | string => {
    const pz = keep.map((i) => c.values[i]);
    const g = asGrid(px, py, pz);
    if (g) return g;
    if (px.length > 20000) return `${px.length} scattered points: too many to triangulate here (20 000 at most); put them on a grid first.`;
    return gridFromScatter(px, py, pz, Math.min(400, Math.max(10, d.grid || 100)));
  };
  let Ug: Grid | undefined;
  let Vg: Grid | undefined;
  if (U && V) {
    const [a, b] = [gridOf(U), gridOf(V)];
    if (typeof a === 'string') return { errors: [a], view: { available } };
    if (typeof b === 'string') return { errors: [b], view: { available } };
    [Ug, Vg] = [a, b];
  }
  const zFrom = d.zFrom ?? 'column';
  let g: Grid | undefined;
  let zName = '';
  if (zFrom === 'count') [g, zName] = [countGrid(px, py, d.bins ?? 30), 'count'];
  else if (zFrom === 'density') [g, zName] = [densityGrid(px, py, d.grid || 100, d.bandScale ?? 1), 'density'];
  else if (zFrom === 'speed') {
    if (!Ug || !Vg) return { view: { available, waiting: 'The speed needs the vectors: choose them (U, V) under Vectors.' } };
    [g, zName] = [{ xs: Ug.xs, ys: Ug.ys, z: Float64Array.from(Ug.z, (u, t) => Math.hypot(u, Vg!.z[t])) }, 'speed'];
  } else if (zFrom === 'column') {
    const read = readGrid(d, all);
    if ('error' in read) return { errors: [read.error], view: { available } };
    if ('waiting' in read) return { view: { available, waiting: read.waiting } };
    [g, zName] = [read.g, read.names.z];
    if (read.note) warnings.push(read.note);
  }
  const names = { x: X.name, y: Y.name, z: zName };
  const r = g ? contourPlot(g, d, names) : null;
  if (typeof r === 'string') return { errors: [r], view: { available } };
  if (r) warnings.push(...r.warnings);
  const curves: Curve[] = r ? [...r.curves] : [];
  // the points, small dots over the map
  if (d.showPoints || !r) curves.push({ key: 'points', label: 'points', noLegend: true, series: { name: 'points', x: column(X.name, Float64Array.from(px)), y: column(Y.name, Float64Array.from(py)) }, style: curveStyle({ mode: 'scatter', symbol: 'circle', symbolSize: 1.6, color: '#333333', symbolOpacity: 0.6, show: d.showPoints || !vec }) });
  // the vectors: arrows or streamlines, a curve each with its head
  if (Ug && Vg) {
    const segs = d.vectors === 'stream' ? streamlines(Ug, Vg, d.vecDensity ?? 1) : vectorArrows(Ug, Vg, d.vecEvery ?? Math.max(1, Math.round(Ug.xs.length / 20)), d.vecLength ?? 0.9);
    if (segs.length > 4000) warnings.push(`${segs.length} vectors: only the first 4000 drawn (draw every N-th point).`);
    const color = d.vecColor || (r && d.draw !== 'lines' ? '#ffffff' : '#000000');
    segs.slice(0, 4000).forEach((s, k) =>
      curves.push({ key: `vec:${k}`, label: 'vector', noLegend: true, series: { name: 'vector', x: column(X.name, Float64Array.from(s.x)), y: column(Y.name, Float64Array.from(s.y)) }, style: curveStyle({ mode: 'line', color, lineWidth: d.vecWidth ?? 0.75, arrowEnd: 'triangle', arrowSize: Math.max(2, 2 + 2 * (d.vecWidth ?? 0.75)) }) }),
    );
  }
  const annotations = r && d.colorbar && d.draw !== 'lines' ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, title: d.zTitle || zName } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: d.axes, legend: d.legend, annotations, page: d.page, insets: d.insets } }, [...curves, ...overlayCurves(inputs, 0, {}, warnings)], warnings, insetFigs);
  return {
    outputs: { figure: { t: 'figure', v: figure }, ...(r ? { grid: { t: 'dataset' as const, v: r.gridSet } } : {}) },
    warnings: [...new Set(warnings)],
    view: { available, figure, legendCurves, ...(g && r ? { contour: { nx: g.xs.length, ny: g.ys.length, levels: r.levels, range: r.range, x: [g.xs[0], g.xs[g.xs.length - 1]] as [number, number], y: [g.ys[0], g.ys[g.ys.length - 1]] as [number, number] } } : {}) },
  };
}

// Matrix computation: the inputs A, B, C … (a matrix; a column: a vector n × 1; a value), the steps in order, every
// result on its own port (a matrix, or a value).
function matCompNode(d: MatCompData, inputs: Inputs): Out {
  const ins: NonNullable<NodeView['matInputs']> = [];
  const vals = new Map<string, Matrix | number>();
  for (const [h, list] of inputs) {
    const m = /^in-(\d+)$/.exec(h);
    const v = list[0]?.value;
    if (!m || !v) continue;
    const port = Number(m[1]);
    const letter = columnLetter(port);
    if (v.t === 'matrix') {
      vals.set(letter, v.v);
      ins.push({ port, letter, kind: 'matrix', name: v.v.name, rows: v.v.rows, cols: v.v.cols });
    } else if (v.t === 'column') {
      vals.set(letter, fromColumn(v.v));
      ins.push({ port, letter, kind: 'column', name: titleOf(v.v), rows: v.v.values.length, cols: 1 });
    } else if (v.t === 'scalar') {
      vals.set(letter, v.v.value);
      ins.push({ port, letter, kind: 'scalar', name: v.v.name, rows: 1, cols: 1 });
    }
  }
  ins.sort((a, b) => a.port - b.port);
  if (!ins.length) return { view: { matInputs: ins, waiting: 'Connect matrices (Matrix), columns (vectors) or values to A, B, C …' } };
  if (!d.steps.length) return { view: { matInputs: ins, waiting: 'Add a step (+ Step).' } };
  const results = runSteps(d.steps, vals);
  const outputs: Record<string, Value> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const matSteps: NonNullable<NodeView['matSteps']> = results.map((r) => {
    if (r.error) errors.push(`${r.name}: ${r.error}`);
    warnings.push(...r.warnings.map((w) => `${r.name}: ${w}`));
    return {
      id: r.id,
      name: r.name,
      ...(r.error ? { error: r.error } : {}),
      warnings: r.warnings,
      parts: r.parts.map((p) => {
        const h = partHandle(r.id, p.key);
        if (typeof p.value === 'number') {
          outputs[h] = { t: 'scalar', v: { name: p.label ? `${r.name}.${p.label}` : r.name, value: p.value } };
          return { key: p.key, label: p.label, value: p.value };
        }
        outputs[h] = { t: 'matrix', v: p.value };
        return { key: p.key, label: p.label, info: matInfo(p.value) };
      }),
    };
  });
  return { outputs, errors, warnings, view: { matInputs: ins, matSteps } };
}

// Contour / heatmap of a matrix: its cells at the column and row numbers (or its X, Y), the values written in them,
// the axes as a matrix is read (row 1 at the top), a whole figure as a Plot's.
function contourMatrix(id: string, d: ContourData & MatrixPlotSpec, M: Matrix, inputs: Inputs): Out {
  const read = matrixGrid(M, d);
  if (typeof read === 'string') return { errors: [read], view: { matrix: matInfo(M) } };
  const { g, names } = read;
  const warnings: string[] = [];
  if (d.axesFrom === 'coords' && !M.xs && !M.ys) warnings.push('The matrix has no X and Y of its own: drawn at the column and row numbers.');
  const r = contourPlot(g, d, names, { edges: true });
  if (typeof r === 'string') return { errors: [r], view: { matrix: matInfo(M) } };
  warnings.push(...r.warnings);
  const curves = [...r.curves, ...cellCurves(g, r, d, names, warnings)];
  const annotations = d.colorbar && d.draw !== 'lines' ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, title: d.zTitle || names.z } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const axes = matrixAxes(d.axes, d, M, read.order);
  const { figure, legendCurves } = plotFigure({ id, data: { label: '', style: {}, axes, legend: d.legend, annotations, page: d.page, insets: d.insets } }, curves, warnings, insetFigs);
  return {
    outputs: { figure: { t: 'figure', v: figure }, grid: { t: 'dataset', v: r.gridSet }, ...(r.rowProfile ? { row: { t: 'dataset' as const, v: r.rowProfile } } : {}), ...(r.colProfile ? { column: { t: 'dataset' as const, v: r.colProfile } } : {}) },
    warnings: [...new Set(warnings)],
    view: { figure, legendCurves, matrix: matInfo(M), contour: { nx: g.xs.length, ny: g.ys.length, levels: r.levels, range: r.range, x: [g.xs[0], g.xs[g.xs.length - 1]], y: [g.ys[0], g.ys[g.ys.length - 1]] } },
  };
}

// The axes of a figure that draws in its frame itself (pie, polar): every side hidden, no grid, nothing clipped.
function noAxes(a: Plot1DData['axes']): Plot1DData['axes'] {
  const base = axesStyle(a);
  const hidden = Object.fromEntries((['bottom', 'left', 'top', 'right'] as const).map((s) => [s, { ...base.sides[s], line: false, ticks: 'none' as const, labels: false, showTitle: false }]));
  return { ...a, clip: false, sides: hidden as typeof base.sides, grid: { x: { ...base.grid.x, major: false, minor: false }, y: { ...base.grid.y, major: false, minor: false } } };
}

// Polar / radar: θ and r columns (a curve each r), or categories (spokes) and their value columns (a polygon each);
// masked rows left out; a whole figure as a Plot's with no axes drawn.
function polarNode(n: { id: string; data: PolarData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: d.kind === 'radar' ? 'Connect a dataset: categories (the spokes) and a value column per series.' : 'Connect a dataset: an angle column and r columns.' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  const list = (spec: string, fallback: Column[]): Column[] | string => {
    if (!spec.trim()) return fallback;
    const p = pick(spec, all.map((c) => c.name), true);
    return p.missing.length ? `Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.` : p.found.map((j) => all[j]);
  };
  const numeric = all.filter((c) => c.values.some(Number.isFinite));
  const ys = all.filter((c, j) => roleOf(all, j) === 'y' && c.values.some(Number.isFinite));
  let r: ReturnType<typeof polarChart>;
  if (d.kind === 'radar') {
    const textCol = all.find((c) => c.text?.some((x) => x?.trim()));
    const cat = d.cat === '-' ? undefined : d.cat ? by(d.cat) : textCol;
    const vals = list(d.ys, ys.length ? ys : numeric.filter((c) => c !== cat));
    if (typeof vals === 'string') return { errors: [vals], view: { available } };
    if (!vals.length) return { view: { available, waiting: 'Choose the value columns (a polygon each).' } };
    const { spokes, series } = radarSeries(wideTable(cat, vals, vals.map(() => undefined)));
    if (spokes.length < 3) return { errors: ['A radar needs 3 categories (spokes) or more.'], view: { available } };
    r = polarChart(series, d, spokes);
  } else {
    const th = by(d.theta) ?? all.find((_, j) => roleOf(all, j) === 'x') ?? numeric[0];
    if (d.theta && !by(d.theta)) return { errors: [`No column “${d.theta}”.`], view: { available } };
    const rs = list(d.rs, ys.filter((c) => c !== th).length ? ys.filter((c) => c !== th) : numeric.filter((c) => c !== th).slice(0, 1));
    if (typeof rs === 'string') return { errors: [rs], view: { available } };
    if (!th || !rs.length) return { view: { available, waiting: 'Choose the angle and the r columns.' } };
    const theta = toDegrees(th.values, d.unit);
    r = polarChart(
      rs.map((c) => {
        const mask = maskOf([th, c], c.values.length);
        return { name: c.name, theta: theta.map((v, i) => (mask?.[i] ? NaN : v)), r: Array.from(c.values) };
      }),
      d,
    );
  }
  if (typeof r === 'string') return { errors: [r], view: { available } };
  const warnings = [...r.warnings];
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: noAxes(d.axes), legend: d.legend, annotations: d.annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves } };
}

// Scatter matrix: k columns (masked rows left out) and a column of groups; every panel a Plot's figure (the node's axes
// style, its text in the middle), put on a k × k grid as a Merge does (X shared by column, Y by row, numbers and titles
// on the outer panels, one legend of the groups at the right), the page the node's.
function scatterMatrixNode(n: { id: string; data: ScatterMatrixData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: the columns to compare (and a column of groups).' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const G = d.group ? findColumn(all, d.group) : undefined;
  if (d.group && !G) return { errors: [`No column “${d.group}”.`], view: { available } };
  let cols: Column[];
  if (d.cols.trim()) {
    const p = pick(d.cols, all.map((c) => c.name), true);
    if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    cols = p.found.map((j) => all[j]);
  } else {
    const ys = all.filter((c, j) => roleOf(all, j) === 'y' && c.values.some(Number.isFinite));
    cols = ys.length >= 2 ? ys : all.filter((c) => c !== G && c.values.some(Number.isFinite) && !c.text?.some((t) => t?.trim()));
  }
  if (cols.length < 2) return { view: { available, waiting: 'Choose 2 columns or more.' } };
  // masked rows: out of every column
  const nr = minOf(cols.map((c) => c.values.length));
  const mask = maskOf(cols, nr);
  const kept = mask ? cols.map((c) => ({ ...c, values: Float64Array.from(c.values, (v, i) => (mask[i] ? NaN : v)) })) : cols;
  const groupOf = G ? Array.from({ length: nr }, (_, i) => keyOf(G, i)) : null;
  const r = scatterMatrix(kept, groupOf, d);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  const warnings = [...r.warnings];
  const page = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const size = page.size && page.size > 0 ? page.size : TEXT_DEFAULTS.size;
  const figs = r.cells.map((cell) => {
    const annotations: AnnotationItem[] = cell.text ? [{ id: 'text', type: 'text', spec: { ...TEXT_SPEC_DEFAULTS, text: cell.text, coords: 'percent', x: 50, y: 50, anchor: 'c', style: { size: size * (cell.textSize ?? 1) } } }] : [];
    const key = `${n.id}:${cell.i}:${cell.j}`;
    return { ...plotFigure({ id: key, data: { label: '', style: {}, axes: d.axes, legend: { show: false }, annotations, page } }, cell.curves, warnings).figure, key };
  });
  const canvas: CanvasData = {
    ...CANVAS_DEFAULTS,
    width: page.width,
    height: page.height,
    unit: page.unit,
    font: page.font,
    size,
    bold: !!page.bold,
    italic: !!page.italic,
    textColor: page.textColor || '#000000',
    mathFont: page.mathFont,
    background: page.background || 'white',
    ...pageGrad(page),
    panels: 'none',
    name: page.name || 'scatter_matrix',
    layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: r.k, cols: r.k, sizing: 'fit', hgap: Math.max(0, d.gap ?? 2), vgap: Math.max(0, d.gap ?? 2), shareX: 'column', shareY: 'row', inner: false, legend: r.groups.length > 1 && d.legend?.show !== false ? 'right' : 'none' },
  };
  const figure = canvasFigure(n.id, canvas, figs, warnings);
  // the groups' colours: the points of the first scatter panel, or a histogram's bars
  const legendCurves = r.groups.map((g, gi) => r.cells.flatMap((c) => c.curves).find((c) => c.label === g && (c.key.startsWith('pts:') || c.key.startsWith('hist:') || c.key.startsWith('kde:')) && c.key.endsWith(`:${gi}`))).filter((c): c is Curve => !!c);
  return { outputs: { figure: { t: 'figure', v: figure }, corr: { t: 'dataset', v: r.corr } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves } };
}

// Ternary: three columns of parts (masked rows left out), optionally a column of groups; a whole figure as a Plot's with
// no axes drawn, the corners named after the columns.
function ternaryNode(n: { id: string; data: TernaryData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: three columns, the parts A, B and C (and a column of groups).' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  for (const s of [d.a, d.b, d.c, d.group, d.colorBy]) if (s && !by(s)) return { errors: [`No column “${s}”.`], view: { available } };
  const V = by(d.colorBy ?? '');
  const numeric = all.filter((c) => c.values.some(Number.isFinite) && !c.text?.some((t) => t?.trim()));
  const A = by(d.a) ?? numeric[0];
  const B = by(d.b) ?? numeric.find((c) => c !== A);
  const C = by(d.c) ?? numeric.find((c) => c !== A && c !== B);
  if (!A || !B || !C) return { view: { available, waiting: 'Choose the three parts: A, B and C.' } };
  const G = by(d.group);
  const nr = Math.min(A.values.length, B.values.length, C.values.length);
  const mask = maskOf([A, B, C], nr);
  const rows = Array.from({ length: nr }, (_, i) => i)
    .filter((i) => !mask?.[i])
    .map((i) => ({ group: G ? keyOf(G, i) || '—' : `${A.name}, ${B.name}, ${C.name}`, a: A.values[i], b: B.values[i], c: C.values[i], ...(V ? { v: V.values[i] } : {}) }));
  const r = ternaryChart(rows, d, [A.name, B.name, C.name]);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  const warnings = [...r.warnings];
  // coloured by a column: its colour bar at the right
  const annotations = V ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, title: V.name } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: noAxes(d.axes), legend: d.legend, annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves } };
}

// Waterfall: every Y column (with its own X, or the X chosen) a curve, shifted one behind the other.
function waterfallNode(n: { id: string; data: WaterfallData }, inputs: Inputs): Out {
  const d = n.data;
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (!ds) return { view: { waiting: 'Connect a dataset: X and the Y columns of a sweep (a curve each; Split into columns cuts a sweep saved in one table).' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  if (d.x && !by(d.x)) return { errors: [`No column “${d.x}”.`], view: { available } };
  const numeric = all.filter((c) => c.values.some(Number.isFinite) && !c.text?.some((t) => t?.trim()));
  const roles = curvesByRole(all).curves;
  let Ys: Column[];
  if (d.ys.trim()) {
    const p = pick(d.ys, all.map((c) => c.name), true);
    if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    Ys = p.found.map((j) => all[j]);
  } else Ys = all.filter((c, j) => roleOf(all, j) === 'y' && c.values.some(Number.isFinite));
  const xOf = (y: Column) => by(d.x) ?? findColumn(all, roles.find((r) => findColumn(all, r.y) === y)?.x ?? '') ?? numeric.find((c) => !Ys.includes(c));
  if (!Ys.length) Ys = numeric.filter((c) => c !== numeric[0]);
  Ys = Ys.filter((y) => xOf(y) !== y);
  if (!Ys.length) return { view: { available, waiting: 'Choose the Y columns (a curve each) and their X.' } };
  const runsIn = Ys.flatMap((y) => {
    const X = xOf(y);
    if (!X) return [];
    const m = Math.min(X.values.length, y.values.length);
    const mask = maskOf([X, y], m);
    return [{ y, X, x: Array.from(X.values.subarray(0, m), (v, i) => (mask?.[i] ? NaN : v)), v: Array.from(y.values.subarray(0, m)) }];
  });
  if (!runsIn.length) return { view: { available, waiting: 'Choose the X of the curves.' } };
  const zz = waterfallZ(runsIn.map((q) => q.y), d.z);
  const runs = runsIn.map((q, j) => ({ name: q.y.name, z: zz.z[j], x: q.x, y: q.v }));
  const r = waterfallChart(runs, d, { x: runsIn[0].X.name, z: zz.title }, pageBackground(d.page?.background));
  if (typeof r === 'string') return { errors: [r], view: { available } };
  const warnings = [...r.warnings];
  // the colour bar of the swept value (curves coloured by the map)
  const annotations = d.colorbar && r.colorRange ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, title: d.zTitle || zz.title || 'Z' } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: d.axes, legend: d.legend, annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure }, data: { t: 'dataset', v: r.data } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves } };
}

// What the names of several columns begin with (“R · d = 150”, “R · d = 200” → “R”), else “Y”
function commonName(names: string[]): string {
  if (names.length === 1) return names[0];
  let p = names[0];
  for (const s of names) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p.replace(/[\s·=:,;([\d.+-]+$/, '').trim() || 'Y';
}

// 3D plot: Z on a grid (surface, wireframe, bars: as the Contour reads it), X, Y, Z points (scatter, lines: a curve per
// group), or a waterfall's Y columns at the depth of their swept value.
function plot3dNode(n: { id: string; data: Plot3DData }, inputs: Inputs): Out {
  const d = n.data;
  if (d.kind === 'layers') return layers3dNode(n, inputs);
  const ds = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  const gridKind = d.kind === 'surface' || d.kind === 'wireframe' || d.kind === 'bars';
  if (!ds) return { view: { waiting: gridKind ? 'Connect a dataset: X, Y, Z columns, or a matrix (a Y column and Z columns named by their X).' : d.kind === 'waterfall' ? 'Connect a dataset: X and the Y columns of a sweep.' : 'Connect a dataset: X, Y and Z columns (and a column of groups).' } };
  const all = ds.columns;
  const available = all.map(colInfo);
  const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
  const numeric = all.filter((c) => c.values.some(Number.isFinite) && !c.text?.some((t) => t?.trim()));
  const warnings: string[] = [];
  let input: Plot3DInput;
  if (gridKind) {
    const read = readGrid(d, all);
    if ('error' in read) return { errors: [read.error], view: { available } };
    if ('waiting' in read) return { view: { available, waiting: read.waiting } };
    if (read.note) warnings.push(read.note);
    input = { kind: 'grid', g: read.g, names: read.names };
  } else if (d.kind === 'waterfall') {
    if (d.x && !by(d.x)) return { errors: [`No column “${d.x}”.`], view: { available } };
    const roles = curvesByRole(all).curves;
    let Ys: Column[];
    if (d.ys.trim()) {
      const p = pick(d.ys, all.map((c) => c.name), true);
      if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
      Ys = p.found.map((j) => all[j]);
    } else Ys = all.filter((c, j) => roleOf(all, j) === 'y' && c.values.some(Number.isFinite));
    if (!Ys.length) Ys = numeric.slice(1);
    const xOf = (y: Column) => by(d.x) ?? findColumn(all, roles.find((r) => findColumn(all, r.y) === y)?.x ?? '') ?? numeric.find((c) => !Ys.includes(c));
    Ys = Ys.filter((y) => xOf(y) && xOf(y) !== y);
    if (!Ys.length) return { view: { available, waiting: 'Choose the Y columns (a curve each) and their X.' } };
    const zz = waterfallZ(Ys, d.zFrom);
    const X0 = xOf(Ys[0])!;
    input = {
      kind: 'curves',
      names: { x: X0.name, y: zz.title || 'Z', z: commonName(Ys.map((y) => y.name)) },
      curves: Ys.map((y, j) => {
        const X = xOf(y)!;
        const m = Math.min(X.values.length, y.values.length);
        const mask = maskOf([X, y], m);
        return { name: y.name, depth: zz.z[j], x: Array.from(X.values.subarray(0, m), (v, i) => (mask?.[i] ? NaN : v)), y: Array.from(y.values.subarray(0, m)) };
      }),
    };
  } else {
    const desX = all.find((_, j) => roleOf(all, j) === 'x');
    const X = by(d.x) ?? desX ?? numeric[0];
    const Y = by(d.y) ?? numeric.find((c) => c !== X);
    const Z = by(d.z) ?? numeric.find((c) => c !== X && c !== Y);
    const Cc = d.colorBy === 'column' ? by(d.colorCol ?? '') : undefined;
    for (const [s, c] of [[d.x, X], [d.y, Y], [d.z, Z], [d.group, by(d.group)], [d.colorBy === 'column' ? d.colorCol : '', Cc]] as const) if (s && !c) return { errors: [`No column “${s}”.`], view: { available } };
    if (!X || !Y || !Z) return { view: { available, waiting: 'Choose the X, Y and Z columns.' } };
    if (d.colorBy === 'column' && !Cc) warnings.push('Colour ▸ by a column: choose the column (until then, by Z).');
    const G = by(d.group);
    const nr = Math.min(X.values.length, Y.values.length, Z.values.length);
    const mask = maskOf([X, Y, Z], nr);
    const groups = new Map<string, { name: string; x: number[]; y: number[]; z: number[] }>();
    for (let i = 0; i < nr; i++) {
      if (mask?.[i]) continue;
      const k = G ? keyOf(G, i) || '—' : Z.name;
      const q: { name: string; x: number[]; y: number[]; z: number[]; c?: number[] } = groups.get(k) ?? { name: k, x: [], y: [], z: [], ...(Cc ? { c: [] } : {}) };
      q.x.push(X.values[i]);
      q.y.push(Y.values[i]);
      q.z.push(Z.values[i]);
      q.c?.push(Cc!.values[i] ?? NaN);
      groups.set(k, q);
    }
    input = { kind: 'points', groups: [...groups.values()], names: { x: X.name, y: Y.name, z: Z.name, ...(Cc ? { c: Cc.name } : {}) } };
  }
  const r = plot3d(input, d);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  warnings.push(...r.warnings);
  r.curves[0].three!.node = n.id;
  const zName = input.kind === 'curves' ? input.names.y : input.kind === 'points' && input.names.c ? input.names.c : input.names.z;
  const annotations = d.colorbar && r.colorRange ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 94, y: 18, length: 64, title: (input.kind === 'curves' ? d.titleY : input.kind === 'points' && input.names.c ? '' : d.titleZ) || zName } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: noAxes(d.axes), legend: d.legend, annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves } };
}

// Peak width: every Y (with its X; masked points left out), in every region (common, or of its run; none: all X) — the
// peak or dip measured on the data over its baseline (place, value, height, FWHM and its two ends, Q = X / FWHM) and the
// minimum and maximum; a table, a row per run and region.
function peakWidthNode(d: PeakWidthData, v: Value | undefined): Out {
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (X and Y from the designations, or chosen).' } };
  const cols = v.v.columns;
  const available = cols.map(colInfo);
  let Ys: Column[];
  if (d.ys.trim()) {
    const p = pick(d.ys, cols.map((c) => c.name), true);
    if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    Ys = p.found.map((j) => cols[j]);
  } else Ys = cols.filter((c, j) => roleOf(cols, j) === 'y' && c.values.some(Number.isFinite));
  const roles = curvesByRole(cols).curves;
  if (d.x && d.x !== '-' && !findColumn(cols, d.x)) return { errors: [`No column “${d.x}” in the dataset.`], view: { available } };
  const xOf = (y: Column) => (d.x === '-' ? undefined : findColumn(cols, d.x || (roles.find((c) => findColumn(cols, c.y) === y)?.x ?? roles[0]?.x ?? '')));
  Ys = Ys.filter((y) => xOf(y) !== y);
  if (!Ys.length) return { view: { available, waiting: 'Choose the Y columns (or designate them Y in the worksheet).' } };
  // the baseline: another column (with its own X when it has one), points placed (common or of the run); a dip measured:
  // the baselines found from the data go over it
  let colCurve: ((x: number) => number) | null = null;
  if (d.base === 'curve') {
    const bc = findColumn(cols, d.baseColumn ?? '');
    if (!bc) return { errors: [d.baseColumn ? `Baseline: no column “${d.baseColumn}”.` : 'Baseline: choose its column.'], view: { available } };
    const bx = xOf(bc);
    const c = inRange({ x: bx && bx !== bc ? bx.values : rowIndex(bc.values.length).values, y: bc.values });
    colCurve = curveThrough(c.x, c.y);
  }
  const basePts = (label: string) => (d.regionsBy === 'run' && d.runBasePoints?.[label]?.length ? d.runBasePoints[label] : (d.basePoints ?? []));
  const baseOf = (label: string): MBaseline => ({
    kind: d.base,
    value: d.baseValue,
    opts: { ...d.baseOpt, under: d.baseOpt?.under ?? (d.kind === 'dip' ? 'dips' : 'peaks') },
    curve: d.base === 'points' ? pointsCurve(basePts(label), d.baseInterp ?? 'linear') : colCurve,
  });
  // the points of every run (for the node's graph) and its results
  const all = { x: [] as number[], y: [] as number[], run: [] as number[], used: [] as number[] };
  // count: the points in the region; of: all the points of the run (masked ones left out of both)
  type Row = { run: number; region: number; lo: number; hi: number; w: Width; mn: { x: number; y: number }; mx: { x: number; y: number }; count: number; of: number };
  const rows: Row[] = [];
  const bases: { x: number[]; y: number[] }[] = [];
  const warnings: string[] = [];
  if (d.base === 'points' && !(d.basePoints?.length || Object.keys(d.runBasePoints ?? {}).length)) warnings.push('Baseline: place its points on the graph (Baseline points).');
  Ys.forEach((Y, k) => {
    const X = xOf(Y) ?? rowIndex(Y.values.length);
    const base = baseOf(Y.name);
    const n = Math.min(X.values.length, Y.values.length);
    const mask = maskOf([X, Y], n);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++)
      if (!mask?.[i] && Number.isFinite(X.values[i]) && Number.isFinite(Y.values[i])) {
        xs.push(X.values[i]);
        ys.push(Y.values[i]);
      }
    const own = d.regionsBy === 'run' ? d.runRegions?.[Y.name] : undefined;
    const regions = own?.length ? own : d.regions;
    const list = regions.length ? regions.map((r, j) => ({ lo: Math.min(r.lo, r.hi), hi: Math.max(r.lo, r.hi), j })) : [{ lo: NaN, hi: NaN, j: -1 }];
    const inside = (x: number) => !regions.length || list.some((r) => x >= r.lo && x <= r.hi);
    xs.forEach((x, i) => {
      all.x.push(x);
      all.y.push(ys[i]);
      all.run.push(k);
      all.used.push(inside(x) ? 1 : 0);
    });
    const bl: { x: number[]; y: number[] } = { x: [], y: [] };
    for (const r of list) {
      const c = { x: xs, y: ys };
      const w = peakWidth(c, d.kind, base, r.lo, r.hi);
      if (w.why) warnings.push(`${Y.name}${r.j >= 0 ? `, reg${r.j + 1}` : ''}: ${w.why}.`);
      const p = inRange(c, r.lo, r.hi);
      rows.push({ run: k, region: r.j, lo: r.lo, hi: r.hi, w, mn: extremum(c, 'min', r.lo, r.hi), mx: extremum(c, 'max', r.lo, r.hi), count: p.x.length, of: xs.length });
      // the baseline drawn over the region
      if (p.x.length > 1) {
        bl.x.push(...p.x, NaN);
        bl.y.push(...baseUnder(p, base), NaN);
      }
    }
    bases.push(bl);
  });
  const key0 = Ys.every((y) => y.key) ? Ys[0].key!.name : '';
  const num = (name: string, f: (r: Row) => number, role: ColumnRole = 'none'): Column => ({ ...column(name, Float64Array.from(rows, f)), role });
  const txt = (name: string, f: (r: Row) => string): Column => ({ ...column(name, new Float64Array(rows.length).fill(NaN), rows.map(f)), role: 'label' });
  const xName = (xOf(Ys[0]) ?? { name: 'row' }).name;
  const yName = Ys.length === 1 ? Ys[0].name : 'Y';
  const table: Column[] = [
    key0 ? num(key0, (r) => Ys[r.run].key!.value, 'x') : num('run', (r) => r.run + 1, 'x'),
    txt('curve', (r) => Ys[r.run].name),
    num('region', (r) => r.region + 1),
    num('from', (r) => r.lo),
    num('to', (r) => r.hi),
    txt('kind', (r) => r.w.kind),
    num(`X (${xName})`, (r) => r.w.x),
    num(yName, (r) => r.w.y),
    num(d.kind === 'dip' ? 'depth' : 'height', (r) => (r.w.kind === 'dip' ? -r.w.height : r.w.height)),
    num('FWHM', (r) => r.w.fwhm, 'y'),
    num('left', (r) => r.w.left),
    num('right', (r) => r.w.right),
    num('Q (X / FWHM)', (r) => r.w.x / r.w.fwhm),
    num('X at min', (r) => r.mn.x),
    num('min', (r) => r.mn.y),
    num('X at max', (r) => r.mx.x),
    num('max', (r) => r.mx.y),
    num('points', (r) => r.count),
    num('% of points', (r) => (r.of ? (100 * r.count) / r.of : NaN)),
  ];
  return {
    outputs: { out: { t: 'dataset', v: { name: 'peak widths', columns: table } } },
    warnings,
    view: {
      available,
      widths: {
        x: Float64Array.from(all.x),
        y: Float64Array.from(all.y),
        run: Int32Array.from(all.run),
        used: Uint8Array.from(all.used),
        labels: Ys.map((y) => y.name),
        xName,
        bases,
        results: rows.map((r) => ({ run: r.run, region: r.region, kind: r.w.kind, x: r.w.x, y: r.w.y, fwhm: r.w.fwhm, left: r.w.left, right: r.w.right, leftY: r.w.leftY, rightY: r.w.rightY, height: r.w.height, min: r.mn.y, xMin: r.mn.x, max: r.mx.y, xMax: r.mx.x, count: r.count, of: r.of })),
      },
    },
  };
}

// Curve math ▸ formula: the results of its lines for A (and B) — or for every Y of A (a row each, with its block's
// value) —, a table.
function curveFormulaNode(d: CurveMathData, dsA: Dataset, ca: Curve2, cb: Curve2 | null, available: ColInfo[], availB: ColInfo[] | undefined): Out {
  const view = { available, ...(availB ? { availB } : {}) };
  const B = cb ?? { name: 'B', xName: '', x: [], y: [] };
  const runs = d.each
    ? curvesByRole(dsA.columns).curves.flatMap((rc) => {
        const c = curveOf(dsA, rc.y);
        return typeof c === 'string' ? [] : [{ c, key: findColumn(dsA.columns, rc.y)?.key }];
      })
    : [{ c: ca, key: undefined }];
  if (!runs.length) return { view: { ...view, waiting: 'A has no Y columns (designate them).' } };
  const rows = runs.map((r) => curveFormulas([r.c, B], d.formula ?? ''));
  const bad = rows.find((r) => typeof r === 'string');
  if (bad) return { errors: [bad as string], view };
  const res = rows as { names: string[]; values: number[] }[];
  const names = res[0].names;
  const warnings = !cb && /\bB\b/.test(d.formula ?? '') ? ['B: connect curve B, or designate a second Y in A (its results are empty).'] : [];
  const keyed = d.each && runs.every((r) => r.key) ? runs[0].key!.name : '';
  const cols: Column[] = [
    ...(d.each ? [{ ...column(keyed || 'run', Float64Array.from(runs, (r, k) => (keyed ? r.key!.value : k + 1))), role: 'x' as const }, { ...column('curve', new Float64Array(runs.length).fill(NaN), runs.map((r) => r.c.name)), role: 'label' as const }] : []),
    ...names.map((nm, j) => ({ ...column(nm, Float64Array.from(res, (r) => r.values[j])), role: 'y' as const })),
  ];
  const report = d.each ? [`${runs.length} curves of A${keyed ? ` (by ${keyed})` : ''}: ${names.join(', ')}`] : names.map((nm, j) => `${nm} = ${fmtNum(res[0].values[j], 6)}`);
  return { outputs: { out: { t: 'dataset', v: { name: 'results', columns: cols } } }, warnings, view: { ...view, report: [`A: ${ca.name}${cb ? ` · B: ${cb.name}` : ''}`, ...report] } };
}

// Curve math: curves A and B — each from a dataset or a sheet of a workbook (its X and Y chosen), or from columns (one X,
// a Y for each) —, and one operation or several, each with its own output (out, out-1 …) and what it computes drawn over
// the curves in the node (the levels and the ΔX between the crossings, the X and the ΔY, the intersections, the curve
// computed, the levels of a step).
function stepResult(d: CurveMathData, ca: Curve2, cb: Curve2 | null): { dataset?: Dataset; report: string[]; warnings: string[]; error?: string; levels?: number[] } {
  const curves = [ca, ...(cb ? [cb] : [])];
  const infos = curves.map((c) => stepInfo(c, { lo: d.stepLo, hi: d.stepHi, settle: d.settle, at: d.stepAt }));
  const bad = infos.find((q): q is string => typeof q === 'string');
  if (bad) return { report: [], warnings: [], error: bad };
  const rows = infos as StepInfo[];
  const F = (f: (q: StepInfo) => number) => Float64Array.from(rows, f);
  const anyPulse = rows.some((q) => q.kind === 'pulse');
  const columns: Column[] = [
    { ...column('curve', Float64Array.from(rows, (_, i) => i + 1), curves.map((c) => c.name)), role: 'x' },
    { ...column('kind', Float64Array.from(rows, () => NaN), rows.map((q) => q.kind)), role: 'label' },
    column(anyPulse ? 'base' : 'initial', F((q) => q.initial)),
    column(anyPulse ? 'final / top' : 'final', F((q) => q.final)),
    { ...column('rise time', F((q) => q.rise)), role: 'y' },
    column('fall time', F((q) => q.fall)),
    column('delay (50 %)', F((q) => q.delay)),
    column('peak', F((q) => q.peak)),
    column('peak time', F((q) => q.peakTime)),
    column('overshoot %', F((q) => q.overshoot)),
    column('undershoot %', F((q) => q.undershoot)),
    column('settling time', F((q) => q.settling)),
    ...(anyPulse ? [column('width (50 %)', F((q) => q.width))] : []),
  ];
  const f = (v: number) => (Number.isFinite(v) ? fmtNum(v, 5) : '—');
  const report = rows.map((q, i) =>
    q.kind === 'pulse'
      ? `${curves[i].name}: a pulse from ${f(q.initial)} to ${f(q.final)} — rise ${f(q.rise)}, fall ${f(q.fall)}, width ${f(q.width)}`
      : `${curves[i].name}: a step ${f(q.initial)} → ${f(q.final)} — ${Number.isFinite(q.rise) ? `rise ${f(q.rise)}` : `fall ${f(q.fall)}`}, overshoot ${f(q.overshoot)} %, settling ${f(q.settling)}`,
  );
  const warnings = rows.some((q) => q.kind === 'step' && !Number.isFinite(q.settling)) ? ['Settling: the curve is still out of the band at its end.'] : [];
  return { dataset: { name: 'step response', columns }, report, warnings, levels: rows.flatMap((q) => [q.initial, q.final]) };
}

// a curve drawn in the node: at most about 2500 of its points
const thinCurve = (c: Curve2): CurvePlotLine => {
  const step = Math.max(1, Math.ceil(c.x.length / 2500));
  return { name: c.name, xName: c.xName, x: c.x.filter((_, i) => i % step === 0), y: c.y.filter((_, i) => i % step === 0) };
};

function curveMathNode(d: CurveMathData, inputs: Inputs): Out {
  const one = (h: string) => inputs.get(h)?.[0]?.value;
  // a dataset, or the sheet chosen of a workbook
  const dsOf = (v: Value | undefined, sheet: string | undefined): { ds?: Dataset; sheets?: string[]; error?: string } => {
    if (v?.t === 'dataset') return { ds: v.v };
    if (v?.t !== 'workbook') return {};
    const sheets = v.v.sheets.map((s) => s.name);
    const s = sheet ? v.v.sheets.find((q) => q.name === sheet) : v.v.sheets[0];
    return s ? { ds: s, sheets } : { sheets, error: `No sheet “${sheet}” in the workbook.` };
  };
  const A = dsOf(one('a'), d.sheetA);
  const B = dsOf(one('b'), d.sheetB);
  const col = (h: string) => {
    const v = one(h);
    return v?.t === 'column' ? v.v : undefined;
  };
  const [cx, cya, cyb] = [col('x'), col('ya'), col('yb')];
  // a curve of columns: the X column (else the row number) and a Y
  const fromCols = (y: Column): Curve2 => {
    const xs: number[] = [];
    const ys: number[] = [];
    const rows: number[] = [];
    for (let i = 0; i < y.values.length; i++) {
      const xv = cx ? cx.values[i] : i + 1;
      if (!Number.isFinite(xv) || !Number.isFinite(y.values[i])) continue;
      xs.push(xv);
      ys.push(y.values[i]);
      rows.push(i);
    }
    return { name: y.name, xName: cx?.name ?? 'row', x: xs, y: ys, rows };
  };
  const available = A.ds?.columns.map(colInfo);
  const availB = B.ds?.columns.map(colInfo);
  const base: NodeView = { ...(available ? { available } : {}), ...(availB ? { availB } : {}), ...(A.sheets ? { sheetsA: A.sheets } : {}), ...(B.sheets ? { sheetsB: B.sheets } : {}) };
  const sheetErr = [A.error, B.error].filter((e): e is string => !!e);
  if (sheetErr.length) return { errors: sheetErr, view: base };
  const ca = A.ds ? curveOf(A.ds, d.ya, 0, d.xa) : cya ? fromCols(cya) : null;
  if (!ca) return { view: { ...base, waiting: 'Connect curve A: a dataset or a workbook on A (its X and Y chosen), or columns on X and Y A.' } };
  if (typeof ca === 'string') return { errors: [`A: ${ca}`], view: base };
  const cb0 = B.ds ? curveOf(B.ds, d.yb, 0, d.xb) : cyb ? fromCols(cyb) : A.ds ? curveOf(A.ds, d.yb, 1, d.xb) : 'connect curve B (a dataset, a workbook or a column on Y B), or designate a second Y in A.';
  const cb = typeof cb0 === 'string' ? null : cb0;
  const dsA: Dataset = A.ds ?? { name: 'A', columns: [...(cx ? [{ ...cx, role: 'x' as const }] : []), { ...cya!, role: 'y' as const }] };
  const outputs: Record<string, Value> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const report: string[] = [`A: ${ca.name} (X: ${ca.xName})${cb ? ` · B: ${cb.name} (X: ${cb.xName})` : ''}`];
  const ops = curveOps(d);
  const views: CurveOpView[] = ops.map((op, k) => {
    const od: CurveMathData = { ...d, ...op };
    const tag = ops.length > 1 ? `${k + 1}. ` : '';
    const label = CURVE_OP_LABELS[od.op];
    let ds: Dataset | undefined;
    let err: string | undefined;
    const overlay: CurveOpView['overlay'] = {};
    if (od.op === 'formula') {
      const r = curveFormulaNode(od, dsA, ca, cb, available ?? [], availB);
      err = r.errors?.[0];
      warnings.push(...(r.warnings ?? []).map((w) => tag + w));
      report.push(...(r.view?.report ?? []).slice(1).map((l) => tag + l));
      ds = r.outputs?.out?.t === 'dataset' ? r.outputs.out.v : undefined;
    } else if (od.op === 'step') {
      const r = stepResult(od, ca, cb);
      [ds, err] = [r.dataset, r.error];
      warnings.push(...r.warnings.map((w) => tag + w));
      report.push(...r.report.map((l) => tag + l));
      if (r.levels) overlay.levels = r.levels;
    } else if (!cb) err = `B: ${cb0}`;
    else {
      const r = curveMath(ca, cb, od);
      if (typeof r === 'string') err = r;
      else {
        ds = r.dataset;
        warnings.push(...r.warnings.map((w) => tag + w));
        report.push(...r.report.map((l) => tag + l));
      }
    }
    if (err) errors.push(`${tag || ''}${label}: ${err}`);
    if (ds) {
      outputs[curveOpPort(k)] = { t: 'dataset', v: ds };
      const c = ds.columns;
      const arr = (j: number) => Array.from(c[j]?.values ?? []);
      if (od.op === 'dxAtY') overlay.dx = arr(0).map((y, i) => ({ y, xa: c[1].values[i], xb: c[2].values[i] }));
      else if (od.op === 'dyAtX') overlay.dy = arr(0).map((x, i) => ({ x, ya: c[1].values[i], yb: c[2].values[i] }));
      else if (od.op === 'cross') overlay.pts = arr(1).map((x, i) => ({ x, y: c[2].values[i] }));
      else if (od.op !== 'formula' && od.op !== 'step') overlay.curve = { name: c[1]?.name ?? label, xName: c[0]?.name ?? '', x: arr(0), y: arr(1) };
    }
    return { label, overlay, ...(err ? { error: err } : {}) };
  });
  return {
    outputs,
    errors,
    warnings: [...new Set(warnings)],
    view: { ...base, report, cmath: { a: thinCurve(ca), ...(cb ? { b: thinCurve(cb) } : {}), ops: views } },
  };
}

// 3D stacked maps: the layers — automatic (a layer for the dataset on every port A, B, C …, or one for every label of a
// column of labels in it) or the node's own list (each layer its input, the rows where a column has a value, its
// columns) —, each a flat map of X, Y and a value at its height (masked rows left out); the colours on one scale with a
// colour bar.
function layers3dNode(n: { id: string; data: Plot3DData }, inputs: Inputs): Out {
  const d = n.data;
  // the inputs by their port (A = 0, B = 1 …)
  const sets = new Map<number, Dataset>();
  const a = mergeSets((inputs.get('dataset') ?? []).flatMap((i) => (i.value?.t === 'dataset' ? [i.value.v] : [])));
  if (a) sets.set(0, a);
  for (const h of inputs.keys()) {
    const v = /^layer-\d+$/.test(h) ? inputs.get(h)?.[0]?.value : undefined;
    if (v?.t === 'dataset') sets.set(Number(h.slice(6)), v.v);
  }
  const ports = [...sets.keys()].sort((p, q) => p - q);
  if (!ports.length) return { view: { waiting: 'Connect a dataset to A: X, Y and a value (Qx, Qz, intensity …); B, C … for more.' } };
  const available = sets.get(ports[0])!.columns.map(colInfo);
  // every input's columns and the values of those with few (to choose a layer's rows)
  const layerInputs = ports.map((p) => {
    const ds = sets.get(p)!;
    const labels: Record<string, string[]> = {};
    for (const c of ds.columns) {
      const seen = new Set<string>();
      for (let i = 0; i < c.values.length && seen.size <= 500; i++) {
        const k = keyOf(c, i);
        if (k) seen.add(k);
      }
      if (seen.size >= 1 && seen.size <= 500) labels[c.name] = [...seen];
    }
    return { port: p, letter: columnLetter(p), name: ds.name, columns: ds.columns.map((c) => c.name), labels };
  });
  // the columns of a layer: its own, else the node's, else the designations (X, then Y, then the next one as the value)
  const colsOf = (letter: string, all: Column[], skip: Column | undefined, own?: LayerSpec): { X: Column; Y: Column; V: Column } | string => {
    const by = (nm: string) => (nm ? findColumn(all, nm) : undefined);
    const [xn, yn, vn] = [own?.x || d.x, own?.y || d.y, own?.v || d.z];
    for (const s of [xn, yn, vn]) if (s && !by(s)) return `${letter}: no column “${s}”.`;
    const numeric = all.filter((c) => c !== skip && c.values.some(Number.isFinite) && !c.text?.some((t) => t?.trim()));
    const X = by(xn) ?? all.find((c, j) => c !== skip && roleOf(all, j) === 'x' && c.values.some(Number.isFinite)) ?? numeric[0];
    const Y = by(yn) ?? numeric.find((c) => c !== X);
    const V = by(vn) ?? numeric.find((c) => c !== X && c !== Y);
    return X && Y && V ? { X, Y, V } : `${letter}: choose the X, Y and value columns.`;
  };
  const kept = (c: { X: Column; Y: Column; V: Column }) => {
    const nr = Math.min(c.X.values.length, c.Y.values.length, c.V.values.length);
    const mask = maskOf([c.X, c.Y, c.V], nr);
    return Array.from({ length: nr }, (_, i) => i).filter((i) => !mask?.[i]);
  };
  // a layer as found: where it comes from (to make the own list from the automatic one)
  type Raw = { name: string; at: number; X: Column; Y: Column; V: Column; rows: number[]; spec?: LayerSpec; from: number; where?: string; is?: string };
  // (my list: a layer whose input is not connected stays in its place, empty)
  const raw: (Raw | { name: string; from: number; missing: true })[] = [];
  const list: NonNullable<NodeView['layers']> = [];
  const warnings: string[] = [];
  let depth = '';
  if (d.layerList === 'own') {
    for (const spec of d.layerOwn ?? []) {
      const from = spec.from ?? 0;
      const letter = columnLetter(from);
      const ds = sets.get(from);
      const label = spec.name?.trim() || spec.is || ds?.name || letter;
      if (!ds) {
        raw.push({ name: label, from, missing: true });
        warnings.push(`${label}: nothing connected to ${letter}.`);
        continue;
      }
      const all = ds.columns;
      const G = spec.where ? findColumn(all, spec.where) : undefined;
      if (spec.where && !G) return { errors: [`${label}: no column “${spec.where}” in ${letter}.`], view: { available, layers: list, layerInputs } };
      const c = colsOf(`${label} (${letter})`, all, G, spec);
      if (typeof c === 'string') return { view: { available, waiting: c, layers: list, layerInputs } };
      let rows = kept(c);
      if (G) rows = rows.filter((i) => keyOf(G, i) === (spec.is ?? ''));
      if (spec.rows?.trim()) {
        const chosen = parseRows(spec.rows, Math.max(c.X.values.length, c.V.values.length));
        if (typeof chosen === 'string') return { errors: [`${label}: rows ${chosen}`], view: { available, layers: list, layerInputs } };
        const set = new Set(chosen);
        rows = rows.filter((i) => set.has(i));
      }
      raw.push({ name: spec.is || ds.name || letter, at: Number(spec.is), ...c, rows, spec, from, ...(spec.where ? { where: spec.where, is: spec.is } : {}) });
      depth ||= spec.where ?? '';
    }
    if (!raw.length) return { view: { available, waiting: 'Add a layer (+ Layer), or turn Layers back to “found by the node”.', layers: list, layerInputs } };
  } else
    for (const p of ports) {
      const ds = sets.get(p)!;
      const letter = columnLetter(p);
      const all = ds.columns;
      // the column of the layers: chosen (if this input has it), none ('-'), or a column of labels in runs (S1 … S2 …)
      const G = d.layerBy === '-' ? undefined : d.layerBy ? findColumn(all, d.layerBy) : all.find((c) => labelRuns(c));
      if (p === ports[0] && d.layerBy && d.layerBy !== '-' && !G) return { errors: [`No column “${d.layerBy}” in ${letter} (the layers).`], view: { available, layerInputs } };
      const c = colsOf(letter, all, G);
      if (typeof c === 'string') return { view: { available, waiting: c, layerInputs } };
      const rows = kept(c);
      if (!G) {
        raw.push({ name: ds.name || letter, at: NaN, ...c, rows, from: p });
        continue;
      }
      depth ||= G.name;
      // the groups of the column, by their value when all are numbers, else in the order met
      const by = new Map<string, number[]>();
      for (const i of rows) {
        const key = keyOf(G, i);
        if (key) by.set(key, [...(by.get(key) ?? []), i]);
      }
      const groups = [...by].map(([name, rs]) => ({ name, at: Number(name), rs }));
      if (groups.every((g) => Number.isFinite(g.at))) groups.sort((q1, q2) => q1.at - q2.at);
      for (const g of groups) raw.push({ name: g.name, at: g.at, ...c, rows: g.rs, from: p, where: G.name, is: g.name });
    }
  const layers: LayerInput[] = [];
  for (const [k, L] of raw.entries()) {
    if ('missing' in L) {
      list.push({ name: L.name, at: k + 1, points: 0, shown: false, from: L.from });
      continue;
    }
    // the automatic layers: the settings of the list by their place
    const spec = d.layerList === 'own' ? L.spec : d.layers?.[k];
    const at = spec?.at !== undefined && Number.isFinite(spec.at) ? spec.at : Number.isFinite(L.at) ? L.at : list.length + 1;
    const name = spec?.name?.trim() || L.name;
    const shown = spec?.show !== false;
    list.push({ name, at, points: L.rows.length, shown, from: L.from, ...(L.where ? { where: L.where, is: L.is } : {}) });
    if (!shown) continue;
    const take = (c: Column) => Float64Array.from(L.rows, (i) => c.values[i]);
    const [x, y, v] = [take(L.X), take(L.Y), take(L.V)];
    let grid: Grid | undefined;
    if (d.layerDraw === 'grid') {
      const read = readGrid({ layout: 'xyz', x: 'x', y: 'y', z: 'v', yCol: '', zs: '', grid: d.grid }, [column('x', x), column('y', y), column('v', v)]);
      if ('error' in read) return { errors: [`${name}: ${read.error}`], view: { available, layers: list, layerInputs } };
      if ('waiting' in read) return { view: { available, waiting: read.waiting, layers: list, layerInputs } };
      if (read.note) warnings.push(`${name}: ${read.note}`);
      grid = read.g;
    }
    layers.push({ name, at, x, y, v, ...(grid ? { grid } : {}), ...(spec?.opacity !== undefined ? { opacity: spec.opacity } : {}) });
  }
  if (!layers.length) return { warnings, view: { available, waiting: 'Every layer is hidden: tick “show” for one.', layers: list, layerInputs } };
  const first = raw.find((L): L is Raw => !('missing' in L))!;
  const input: Plot3DInput = { kind: 'layers', layers, names: { x: first.X.name, y: first.Y.name, z: first.V.name, depth } };
  const r = plot3d(input, d);
  if (typeof r === 'string') return { errors: [r], view: { available, layers: list, layerInputs } };
  warnings.push(...r.warnings);
  r.curves[0].three!.node = n.id;
  const annotations = d.colorbar && r.colorRange ? [...(d.annotations ?? []), { id: 'auto-colorbar', type: 'colorbar' as const, spec: { ...COLORBAR_DEFAULTS, x: 94, y: 18, length: 64, title: d.barTitle || first.V.name } }] : d.annotations;
  const insetFigs = (inputs.get('insets') ?? []).flatMap((i) => (i.value?.t === 'figure' ? [i.value.v] : []));
  const { figure, legendCurves } = plotFigure({ id: n.id, data: { label: '', style: {}, axes: noAxes(d.axes), legend: d.legend, annotations, page: d.page, insets: d.insets } }, r.curves, warnings, insetFigs);
  return { outputs: { figure: { t: 'figure', v: figure } }, warnings: [...new Set(warnings)], view: { available, figure, legendCurves, layers: list, layerInputs } };
}

// The default text of a page (every text on “auto”).
export const pageText =(p: Partial<PageData> | undefined): TextDefaults =>
  p ? { font: p.font || TEXT_DEFAULTS.font, size: p.size && p.size > 0 ? p.size : TEXT_DEFAULTS.size, bold: !!p.bold, italic: !!p.italic, color: p.textColor || '#000000', ...(p.mathFont && { mathFont: p.mathFont }) } : TEXT_DEFAULTS;
const pageBackground = (b: string | undefined) => (b === 'none' ? 'none' : !b || b === 'white' ? '#ffffff' : b);
// its gradient, when it has one (a transparent page has none)
const pageGrad = (p: { background?: string; backgroundGrad?: GradFill }): { backgroundGrad?: GradFill } => (p.background !== 'none' && hasGrad(p.backgroundGrad) ? { backgroundGrad: p.backgroundGrad } : {});

// The annotations kept in a Plot or a Merge, as drawn; a colour bar explains the first curve coloured by a map.
export function annotationsOf(items: AnnotationItem[] | undefined, node: string, curves: Curve[], warnings: string[]): Annotation[] {
  return (items ?? []).map((it): Annotation => {
    const base = { key: `${node}/${it.id}`, owner: { node, field: 'annotations' as const, item: it.id } };
    if (it.type === 'shape') return { ...base, kind: 'shape', shape: shapeSpec(it.spec) };
    if (it.type === 'text') return { ...base, kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, ...it.spec } };
    const curve = curves.find((c) => ((c.style.colorBy !== 'none' && !c.style.categorical) || c.group?.color === 'map') && c.colorRange) ?? null;
    if (!curve) warnings.push('Colour bar: no curve of the Plot is coloured by a colour map (style ▸ Colour map, or a split curve coloured by the map).');
    return { ...base, kind: 'colorbar', bar: { ...COLORBAR_DEFAULTS, ...it.spec }, curve };
  });
}

// A Plot's figure: its page, one frame (placed by its margins or by hand) with the curves, its legend, its annotations.
function plotFigure(n: { id: string; data: Plot1DData }, curves: Curve[], warnings: string[], insetFigs: Figure[] = []): { figure: Figure; legendCurves: Curve[] } {
  const d = n.data;
  const page = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const text = pageText(page);
  const { show, ...lgData } = d.legend ?? { show: false };
  const base = { ...LEGEND_STYLE_DEFAULTS, ...lgData, attach: '' };
  const listed = collapseGroups(curves.filter((c) => c.style.show !== false && !c.noLegend), base.groups);
  const legends: LegendSpec[] = show ? [{ ...base, key: `${n.id}:legend`, owner: { node: n.id, field: 'legend' }, curves: withSizeKeys(legendCurves(listed, base.entries)) }] : [];
  let ax: AxesFig = { key: n.id, node: n.id, style: axesStyle(d.axes), curves, legends, annotations: annotationsOf(d.annotations, n.id, curves, warnings), text, auto: page.frame !== 'manual', pad: page.pad };
  const W = toPt(page.width, page.unit);
  const H = toPt(page.height, page.unit);
  // a title over the figure: the frame placed under it
  const titled = pageTitle(page, text, W, H);
  if (!(W > 0) || !(H > 0)) warnings.push('Page: the width and the height must be positive.');
  else if (ax.auto) ax = placeAuto(ax, titled ? { x: 0, y: titled.top, w: 100, h: 100 - titled.top } : FULL, W, H, text, page.pad);
  // a legend placed by itself: where it covers the least of the data, in the frame found
  if (W > 0 && H > 0 && ax.legends.some((lg) => lg.auto)) {
    const p = ax.style.pos;
    ax = { ...ax, legends: placeLegends(ax, { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H }, text) };
    // put outside (too large for the frame): the frame placed again with room for it
    if (ax.auto && ax.legends.some((lg) => lg.auto && lg.y > 100)) ax = placeAuto(ax, titled ? { x: 0, y: titled.top, w: 100, h: 100 - titled.top } : FULL, W, H, text, page.pad);
  }
  // the Plots on the insets port, inside this frame (an inset of theirs keeps its own host)
  const insets = insetFigs.flatMap((f) =>
    f.axes.map((a, i): AxesFig => {
      const it = { ...INSET_DEFAULTS, ...n.data.insets?.find((q) => q.key === f.key) };
      // a Plot with a drawing over it: one picture — its box as wide / high as its page, its frame where it was on it
      const pictured = f.axes.some((q) => q.overlay) ? { aspect: toPt(f.width, f.unit) / toPt(f.height, f.unit), ...(a.overlay ? {} : { fixed: a.style.pos }) } : {};
      // a drawing over that Plot: in the same box, on no ground of its own
      if (a.overlay && !a.inset) return { ...a, auto: false, inset: { x: it.x, y: it.y, w: it.w, h: it.h, zoom: false, line: { ...INSET_DEFAULTS.line, ...it.line }, background: 'none', host: ax.key, owner: n.id, ...pictured } };
      if (i > 0 || a.inset) return a;
      return { ...a, auto: false, text: a.text ?? f.text, inset: { ...pictured, x: it.x, y: it.y, w: it.w, h: it.h, zoom: it.zoom && !a.drawing, line: { ...INSET_DEFAULTS.line, ...it.line }, background: insetBackground(it.background, f.background), host: ax.key, owner: n.id } };
    }),
  );
  const allAxes = insets.length && W > 0 && H > 0 ? placeInsets([ax, ...insets], W, H, text) : [ax];
  const figure: Figure = {
    width: page.width,
    height: page.height,
    unit: page.unit,
    text,
    background: pageBackground(page.background),
    ...pageGrad(page),
    border: page.border ?? 0,
    borderColor: page.borderColor ?? '#000000',
    borderDash: page.borderDash,
    borderRadius: page.borderRadius,
    borderOpacity: page.borderOpacity,
    borderInset: page.borderInset,
    panels: 'none',
    panelText: {},
    panelX: 0,
    panelY: 0,
    axes: allAxes,
    legends: [],
    annotations: titled ? [titled.annotation] : [],
    key: n.id,
    ...(page.comma ? { comma: true } : {}),
  };
  return { figure, legendCurves: listed };
}
const FULL: Placement = { x: 0, y: 0, w: 100, h: 100 };
// a box (% of a page W × H) made as wide / high as `aspect` (width / height) inside it, centred
function keepAspect(b: Placement, W: number, H: number, aspect: number): Placement {
  if (!(aspect > 0)) return b;
  const [bw, bh] = [(b.w / 100) * W, (b.h / 100) * H];
  if (!(bw > 0) || !(bh > 0)) return b;
  if (bw / bh > aspect) {
    const w = bh * aspect;
    return { ...b, x: b.x + ((bw - w) / 2 / W) * 100, w: (w / W) * 100 };
  }
  const h = bw / aspect;
  return { ...b, y: b.y + ((bh - h) / 2 / H) * 100, h: (h / H) * 100 };
}

// A Figure Drawing's figure: its page, and one panel without axes — the drawing (its objects in mm from the top-left
// corner, the first one at the back; the hidden ones left out). In a Merge or an inset it is scaled as a whole.
// The Phase diagram node: the diagram of its model with the lever rule at its points and an alloy cooled (a second
// figure: the amounts of its phases against the temperature); the shapes and texts it draws are locked (no handles, not
// moved by hand)
function phaseNodeOut(id: string, d: PhaseDiagramData): Out {
  const r = phaseFigures(d);
  if (typeof r === 'string') return { errors: [r] };
  const warnings: string[] = [];
  const T0 = r.tUnit === '°C' ? 273.15 : 0;
  const side = (title: string) => ({ ...SIDE_DEFAULTS, title });
  const fixed = (f: Figure): Figure => ({ ...f, axes: f.axes.map((a) => ({ ...a, annotations: a.annotations.map((x) => (/^(ph|cool)-/.test(x.key.split('/')[1] ?? '') ? { ...x, owner: undefined, locked: true } : x)) })) });
  const st = axesStyle(d.axes);
  const axes: Partial<AxesStyle> = {
    ...st,
    x: { ...st.x, min: Number.isFinite(st.x.min) ? st.x.min : 0, max: Number.isFinite(st.x.max) ? st.x.max : 100 },
    y: { ...st.y, min: Number.isFinite(st.y.min) ? st.y.min : r.diagram.tMin - T0, max: Number.isFinite(st.y.max) ? st.y.max : r.diagram.tMax - T0, range: 'tight' },
    sides: { ...st.sides, bottom: { ...st.sides.bottom, title: st.sides.bottom.title || `Composition (at% ${d.b})` }, left: { ...st.sides.left, title: st.sides.left.title || `Temperature (${r.tUnit})` } },
  };
  const { figure } = plotFigure({ id, data: { label: '', style: {}, axes, legend: d.legend ?? { show: true, x: 98, y: 2, anchor: 'tr' }, annotations: [...r.annotations, ...(d.annotations ?? [])], page: { name: 'phase_diagram', ...d.page } } }, r.curves, warnings);
  const outputs: Record<string, Value> = { figure: { t: 'figure', v: fixed(figure) }, points: { t: 'dataset', v: r.points }, boundaries: { t: 'dataset', v: r.boundaries } };
  let coolFig: Figure | undefined;
  if (r.cooling && r.fractions) {
    const cAxes: Partial<AxesStyle> = { ...axesStyle(undefined), x: { ...AXIS_DEFAULTS, reverse: true }, y: { ...AXIS_DEFAULTS, min: 0, max: 100, range: 'tight' }, sides: { ...axesStyle(undefined).sides, bottom: side(`Temperature (${r.tUnit}), cooling →`), left: side('Amount of the phase (%)') } };
    coolFig = fixed(plotFigure({ id: `${id}:cooling`, data: { label: '', style: {}, axes: cAxes, legend: { show: true, x: 2, y: 50, anchor: 'cl' }, annotations: r.cooling.annotations, page: { name: 'phase_amounts', ...d.coolingPage } } }, r.cooling.curves, warnings).figure);
    outputs.cooling = { t: 'figure', v: coolFig };
    outputs.fractions = { t: 'dataset', v: r.fractions };
  }
  return { outputs, warnings, view: { figure: fixed(figure), ...(coolFig ? { cooling: coolFig } : {}), report: r.summary } };
}

// The Image analysis node: the image through its steps; the matrix of the result, a figure — the image on a page of
// its proportions, its selections, a scale bar when calibrated —, the measurements of the selections as a workbook
function imageNodeOut(id: string, d: ImageAnalysisData): Out {
  const p = processImage(d);
  if (!p) return { view: { waiting: 'Open an image (PNG, JPEG, TIFF): Open image, paste one or drop it on the node.' } };
  const f = imageFigure(d.figure);
  const W = f.width > 0 ? f.width : 80;
  const H = +((W * p.out.h) / p.out.w).toFixed(3);
  const href = figurePng(p, f);
  const ann: AnnotationItem[] = [{ id: 'img', type: 'shape', spec: { ...SHAPE_DEFAULTS, kind: 'image', coords: 'data', href, x1: 0, y1: 0, x2: W, y2: H, width: 0, stretch: true } }];
  // the selections shown: their outlines (lines, the points as dots), their names (mm on the page from the pixels of
  // the original: the crop's corner taken off), drawn as they are (locked: no handles)
  if (f.rois !== 'none' && d.rois?.length && d.pixels) {
    const c = cropBox(d.crop, d.pixels.w, d.pixels.h);
    const [ox, oy] = [c?.[0] ?? 0, c?.[1] ?? 0];
    const mm = W / p.out.w;
    const at = (x: number, y: number) => [+((x - ox) * mm).toFixed(4), +((y - oy) * mm).toFixed(4)] as const;
    for (const r of d.rois) {
      if (r.hidden || r.train) continue;
      const color = r.color ?? ROI_COLOR;
      const line = { ...SHAPE_DEFAULTS, kind: 'line' as const, coords: 'data' as const, color, width: 0.75, head1: 'none' as const, head2: 'none' as const };
      const pts = roiOutline(r);
      if (isArea(r)) ann.push({ id: `roi-${r.id}`, locked: true, type: 'shape', spec: { ...SHAPE_DEFAULTS, kind: 'polygon', coords: 'data', points: pts.map(([x, y]) => at(x, y).join(' ')).join('; '), color, width: 0.75, fill: '' } });
      else if (r.kind === 'points')
        pts.forEach(([x, y], k) => {
          const [px, py] = at(x, y);
          ann.push({ id: `roi-${r.id}-${k}`, locked: true, type: 'shape', spec: { ...SHAPE_DEFAULTS, kind: 'ellipse', coords: 'data', x1: px - 0.6, y1: py - 0.6, x2: px + 0.6, y2: py + 0.6, color, width: 0.5, fill: color } });
        });
      else
        pts.slice(1).forEach(([x, y], k) => {
          const [x1, y1] = at(pts[k][0], pts[k][1]);
          const [x2, y2] = at(x, y);
          ann.push({ id: `roi-${r.id}-${k}`, locked: true, type: 'shape', spec: { ...line, x1, y1, x2, y2 } });
        });
      if (f.rois === 'labels') {
        const [cx, cy] = roiCentre(r);
        const [tx, ty] = at(cx, cy);
        ann.push({ id: `roi-${r.id}-name`, locked: true, type: 'text', spec: { ...TEXT_SPEC_DEFAULTS, text: r.name, coords: 'data', x: tx, y: ty, anchor: 'c', style: { color, size: 6 } } });
      }
    }
  }
  const bar = scaleBarPlace(p.out.w, p.out.h, W, d.cal, f.bar);
  if (bar) {
    ann.push({ id: 'bar', type: 'shape', spec: { ...SHAPE_DEFAULTS, kind: 'line', coords: 'data', x1: bar.x1, y1: bar.y, x2: bar.x2, y2: bar.y, color: f.bar.color, width: f.bar.thickness, head1: 'none', head2: 'none', cap: 'butt' } });
    if (f.bar.label) ann.push({ id: 'barText', type: 'text', spec: { ...TEXT_SPEC_DEFAULTS, text: bar.text, coords: 'data', x: bar.tx, y: bar.ty, anchor: 'bc', style: { color: f.bar.color, size: f.bar.size } } });
  }
  const page: DrawingData = { ...DRAWING_DEFAULTS, name: d.name.replace(/\.[a-z0-9]+$/i, '') || 'image', ...d.page, width: W, height: H, unit: 'mm', annotations: ann };
  const figure = drawingFigure(id, page);
  const warnings = (d.steps ?? []).flatMap((s, k) => (p.errors[s.id] ? [`Step ${k + 1} (${STEP_DEFS[s.kind]?.label ?? s.kind}): ${p.errors[s.id]}.`] : []));
  const m = imageMeasurements(d, p);
  return {
    outputs: { matrix: { t: 'matrix', v: imageMatrix(p.out, d.name || 'image', d.cal) }, figure: { t: 'figure', v: figure }, ...(m ? { workbook: { t: 'workbook' as const, v: m.book } } : {}) },
    warnings,
    view: { figure, image: { w: p.out.w, h: p.out.h, ch: p.base.ch.length, kind: p.out.kind, notes: p.notes, errors: p.errors, ...(m?.summary ? { summary: m.summary } : {}) } },
  };
}

export function drawingFigure(id: string, d: DrawingData, shiftOf?: (it: AnnotationItem) => [number, number] | null): Figure {
  const text = pageText(d);
  const W = toPt(d.width, d.unit);
  const H = toPt(d.height, d.unit);
  const items = stuckLines(d.annotations ?? [], text);
  const annotations = drawingAnnotations(id, items, d.components ?? [], text, 0, undefined, shiftOf);
  const ax: AxesFig = { key: id, node: id, style: { ...axesStyle(undefined), pos: { ...FULL } }, curves: [], legends: [], annotations, text, auto: false, drawing: { w: W, h: H } };
  return {
    width: d.width,
    height: d.height,
    unit: d.unit,
    text,
    background: pageBackground(d.background),
    ...pageGrad(d),
    border: d.border ?? 0,
    borderColor: d.borderColor ?? '#000000',
    borderDash: d.borderDash,
    borderRadius: d.borderRadius,
    borderOpacity: d.borderOpacity,
    borderInset: d.borderInset,
    panels: 'none',
    panelText: {},
    panelX: 0,
    panelY: 0,
    axes: [ax],
    legends: [],
    annotations: [],
    key: id,
    ...(d.comma ? { comma: true } : {}),
  };
}
// The data of a figure's main frame (its first Axes, not an inset) and the place of its points on the page, in mm from the
// top-left corner — for the objects of a drawing pinned to them; null when the figure has no frame of data.
export function plotMapping(fig: Figure): { toData: (p: Pt) => Pt; fromData: (p: Pt) => Pt } | null {
  const ax = fig.axes.find((a) => !a.inset && !a.drawing);
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  if (!ax || !(W > 0) || !(H > 0)) return null;
  const p = ax.style.pos;
  const g = axesGeometry(ax, { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H }, ax.text ?? fig.text);
  const MMPT = toPt(1, 'mm');
  return {
    toData: ([x, y]) => [g.sBottom.inv(x * MMPT), g.sLeft.inv(y * MMPT)],
    fromData: ([x, y]) => [g.sBottom.f(x) / MMPT, g.sLeft.f(y) / MMPT],
  };
}

// A drawing's objects as annotations: their order their layer (z kept above the panel's ground), the hidden ones left
// out; a text along another object's outline, an object cut to one or masked by a shape; a component's instance as the
// component's objects in its box (moved with the instance, not by themselves).
function drawingAnnotations(id: string, items: AnnotationItem[], components: DrawingComponent[], text: TextDefaults, depth: number, inst?: { item: string; z: number; key: string }, shiftOf?: (it: AnnotationItem) => [number, number] | null): Annotation[] {
  const MMPT = toPt(1, 'mm');
  const byId = (k: string | undefined) => (k ? items.find((x) => x.id === k) : undefined);
  const outline = (k: string | undefined) => {
    const t = byId(k);
    return t?.type === 'shape' ? shapeToPath({ ...shapeSpec(t.spec), coords: 'data' }, MMPT) : null;
  };
  return items.flatMap((it, k): Annotation[] => {
    if (it.hidden || it.type === 'colorbar') return [];
    const z = inst ? inst.z + (k + 1) * 1e-4 : 1 + k;
    const key = inst ? `${inst.key}/${it.id}` : `${id}/${it.id}`;
    const clip = it.clipBy ? outline(it.clipBy) : null;
    const maskItem = byId(it.maskBy);
    const shift = shiftOf?.(it) ?? null;
    const base = { key, owner: { node: id, field: 'annotations' as const, item: inst?.item ?? it.id }, ...(it.locked || inst ? { locked: true } : {}), ...(clip ? { clip } : {}), ...(maskItem?.type === 'shape' ? { mask: { ...shapeSpec(maskItem.spec), coords: 'data' as const } } : {}), ...(shift ? { shift } : {}) };
    if (it.type === 'text') {
      const along = it.spec.onPath ? outline(it.spec.onPath) : null;
      const pathD = along && it.spec.pathFlip ? pathText(reversePath(parsePath(along))) : along;
      return [{ ...base, kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, ...it.spec, coords: 'data', z, ...(pathD ? { pathD } : {}) } }];
    }
    const s = shapeSpec(it.spec);
    if (s.kind === 'component') {
      const comp = components.find((c) => c.id === s.ref);
      if (!comp || depth > 4) return [];
      const placed = stuckLines(placeComponent(s, comp, `${it.id}:`), text);
      // an instance pinned: its objects moved with it
      return drawingAnnotations(id, placed, components, text, depth + 1, { item: inst?.item ?? it.id, z, key }, shift ? () => shift : undefined);
    }
    return [{ ...base, kind: 'shape', shape: { ...s, coords: 'data', z } }];
  });
}

// The outline of a drawing's object (mm), for the lines stuck to it: its box (turned as it is), an ellipse or a rectangle
// — a text's box from its size, a polygon's or a line's from its points.
function outlineOf(it: AnnotationItem, text: TextDefaults): Outline | null {
  const MMPT = toPt(1, 'mm');
  if (it.type === 'text') {
    const s = { ...TEXT_SPEC_DEFAULTS, ...it.spec };
    const m = richMetrics(s.text, resolveText(s.style, text));
    const [w, h] = [(m.width + 2 * s.padding) / MMPT, (m.lines * m.lineHeight + 2 * s.padding) / MMPT];
    const fx = s.anchor.endsWith('l') ? 0.5 : s.anchor.endsWith('r') ? -0.5 : 0;
    const fy = s.anchor.startsWith('t') ? 0.5 : s.anchor.startsWith('b') ? -0.5 : 0;
    // the middle of the box, turned with the text about its anchor
    const a = ((s.rotation || 0) * Math.PI) / 180;
    const [ox, oy] = [fx * w, fy * h];
    return { cx: s.x + ox * Math.cos(a) - oy * Math.sin(a), cy: s.y + ox * Math.sin(a) + oy * Math.cos(a), w, h, rot: s.rotation || 0, ellipse: false };
  }
  if (it.type !== 'shape') return null;
  const s = shapeSpec(it.spec);
  const box = (pts: Pt[], rot: number, ellipse: boolean): Outline | null => {
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, rot, ellipse };
  };
  switch (s.kind) {
    case 'rect':
    case 'star':
    case 'regular':
    case 'arc':
      return box([[s.x1, s.y1], [s.x2, s.y2]], s.rotation || 0, false);
    case 'ellipse':
      return box([[s.x1, s.y1], [s.x2, s.y2]], s.rotation || 0, true);
    case 'polygon':
      return box(s.points.split(';').map((q) => q.trim().split(/[\s,]+/).map(Number)).filter((q) => q.length >= 2 && q.every(Number.isFinite)).map((q): Pt => [q[0], q[1]]), 0, false);
    case 'path': {
      const b = pathBox(parsePath(s.d));
      return b ? { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: s.rotation || 0, ellipse: false } : null;
    }
    case 'callout': {
      const m = richMetrics(s.text || ' ', resolveText(s.textStyle, text));
      const pad = s.pad ?? 2;
      return { cx: s.x1, cy: s.y1, w: (m.width + 2 * pad) / MMPT, h: (m.lines * m.lineHeight + 2 * pad) / MMPT, rot: 0, ellipse: false };
    }
    default:
      return box([[s.x1, s.y1], [s.x2, s.y2]], 0, false);
  }
}
// A drawing's lines stuck to shapes (from, to): their ends on those shapes' outlines — facing the other end (a bend
// nearer), or the middle of the side asked; an elbow leaves and meets them by the sides its route goes along.
export function stuckLines(items: AnnotationItem[], text: TextDefaults): AnnotationItem[] {
  const outlines = new Map<string, Outline | null>();
  const of = (k: string | undefined) => {
    if (!k) return null;
    if (!outlines.has(k)) {
      const it = items.find((x) => x.id === k);
      outlines.set(k, it ? outlineOf(it, text) : null);
    }
    return outlines.get(k) ?? null;
  };
  return items.map((it) => {
    if (it.type !== 'shape' || !(it.spec.from || it.spec.to)) return it;
    const s = shapeSpec(it.spec);
    if (s.kind !== 'line' && s.kind !== 'arrow') return it;
    const [oa, ob] = [of(s.from !== it.id ? s.from : undefined), of(s.to !== it.id ? s.to : undefined)];
    if (!oa && !ob) return it;
    const away = (s.away ?? 0) / toPt(1, 'mm');
    const bends = s.route && s.route !== 'line' ? [] : bendPoints(s.bends);
    const A0: Pt = oa ? [oa.cx, oa.cy] : [s.x1, s.y1];
    const B0: Pt = ob ? [ob.cx, ob.cy] : [s.x2, s.y2];
    // an elbow: the sides it leaves and meets by (across: left / right, upright: top / bottom)
    const r = s.route && s.route !== 'line' ? s.route : null;
    const across = (o: Outline, to: Pt): StickSide => (to[0] >= o.cx ? 'r' : 'l');
    const upright = (o: Outline, to: Pt): StickSide => (to[1] >= o.cy ? 'b' : 't');
    const sideA = (o: Outline): StickSide => (s.fromAt && s.fromAt !== 'auto' ? s.fromAt : !r ? 'auto' : r === 'hv' || r === 'hvh' ? across(o, B0) : upright(o, B0));
    const sideB = (o: Outline): StickSide => (s.toAt && s.toAt !== 'auto' ? s.toAt : !r ? 'auto' : r === 'vh' || r === 'hvh' ? across(o, A0) : upright(o, A0));
    const A = oa ? outlinePoint(oa, sideA(oa), bends[0] ?? B0, away) : A0;
    const B = ob ? outlinePoint(ob, sideB(ob), bends[bends.length - 1] ?? A, away) : B0;
    const r4 = (v: number) => +v.toFixed(4);
    return { ...it, spec: { ...it.spec, x1: r4(A[0]), y1: r4(A[1]), x2: r4(B[0]), y2: r4(B[1]) } };
  });
}

// the title of a page: centred at its top (3 pt down), bold and 2 pt larger than the page's text unless set; the part
// of the page it takes (% from the top)
function pageTitle(page: Partial<PageData>, text: TextDefaults, W: number, H: number): { top: number; annotation: Annotation } | null {
  if (!page.title?.trim() || !(W > 0) || !(H > 0)) return null;
  const st = resolveText({ bold: true, size: text.size + 2, ...page.titleText }, text);
  const m = richMetrics(page.title, st);
  const h = m.lines * m.lineHeight + 3 + 2;
  return { top: Math.min(40, (h / H) * 100), annotation: { key: 'page-title', kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, text: page.title, coords: 'percent', x: 50, y: (3 / H) * 100, anchor: 'tc', style: { bold: true, size: text.size + 2, ...page.titleText }, z: 3 } } };
}

// A curve with the per-point values that colour, size and label it.
function makeCurve(key: string, label: string, s: Series, style: CurveStyle, colorCol: Column | undefined, sizeCol: Column | undefined, labelCol: Column | undefined, name: string, warnings: string[]): Curve {
  const curve: Curve = { key, label, series: s, style };
  const { x, y } = s;
  const mask = maskOf([x, y], Math.min(x.values.length, y.values.length));
  if (mask) curve.mask = mask;
  // colour from the data
  if (style.colorBy !== 'none') {
    const vals = style.colorBy === 'index' ? Float64Array.from({ length: y.values.length }, (_, i) => i + 1) : style.colorBy === 'x' ? x.values : style.colorBy === 'y' ? y.values : colorCol?.values;
    if (!vals) warnings.push(`${name}: connect the column that colours the points (port “colour”).`);
    else {
      curve.colorValues = vals;
      if (colorCol?.text) curve.colorText = colorCol.text;
      const [lo, hi] = finiteRange(vals, style.cmapLog);
      curve.colorRange = [Number.isFinite(style.cmapMin) ? style.cmapMin : lo, Number.isFinite(style.cmapMax) ? style.cmapMax : hi];
    }
  }
  // the symbols' size and the line's width from the data
  const valuesBy = (by: CurveStyle['sizeBy']) => (by === 'index' ? Float64Array.from({ length: y.values.length }, (_, i) => i + 1) : by === 'x' ? x.values : by === 'y' ? y.values : sizeCol?.values);
  if (style.sizeBy !== 'none') {
    const vals = valuesBy(style.sizeBy);
    if (!vals) warnings.push(`${name}: connect the column that sizes the symbols (port “size”).`);
    else {
      curve.sizeValues = vals;
      const [lo, hi] = finiteRange(vals, style.sizeLog);
      curve.sizeRange = [Number.isFinite(style.sizeFrom) ? style.sizeFrom! : lo, Number.isFinite(style.sizeTo) ? style.sizeTo! : hi];
    }
  }
  if (style.widthBy && style.widthBy !== 'none') {
    const vals = valuesBy(style.widthBy);
    if (!vals) warnings.push(`${name}: connect the column that sets the line's width (port “size”).`);
    else {
      curve.widthValues = vals;
      curve.widthRange = finiteRange(vals);
    }
  }
  if (style.labels === 'column') {
    if (!labelCol) warnings.push(`${name}: connect the column with the point labels (port “labels”).`);
    else curve.labelValues = labelCol;
  }
  return curve;
}

// The data range of the curves on an axis (x or y), for axes shared between panels.
function dataRange(curves: Curve[], axis: 'x' | 'y', log: boolean): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of curves) {
    if (c.boxes) {
      const hor = !!c.boxes.horizontal;
      for (const it of c.boxes.items) for (const w of (axis === 'x') !== hor ? [it.pos - it.half, it.pos + it.half] : [it.vlo, it.vhi]) if (Number.isFinite(w) && !(log && w <= 0)) [lo, hi] = [Math.min(lo, w), Math.max(hi, w)];
      continue;
    }
    if (c.bars) {
      const b = c.bars;
      const y = c.series.y.values;
      for (let i = 0; i < y.length; i++)
        for (const w of (axis === 'x') !== !!b.horizontal ? [b.lo[i], b.hi[i]] : [b.base[i], b.horizontal ? c.series.x.values[i] : y[i]]) if (Number.isFinite(w) && !(log && w <= 0)) [lo, hi] = [Math.min(lo, w), Math.max(hi, w)];
      continue;
    }
    const v = axis === 'x' ? c.series.x.values : c.series.y.values;
    const e = axis === 'x' ? c.series.xErr?.values : c.series.yErr?.values;
    const eLo = axis === 'x' ? e : (c.series.yErrLo ?? c.series.yErr)?.values;
    for (let i = 0; i < v.length; i++) {
      const err = e && Number.isFinite(e[i]) ? Math.abs(e[i]) : 0;
      const errLo = eLo && Number.isFinite(eLo[i]) ? Math.abs(eLo[i]) : 0;
      for (const w of [v[i] - errLo, v[i] + err]) {
        if (!Number.isFinite(w) || (log && w <= 0)) continue;
        if (w < lo) lo = w;
        if (w > hi) hi = w;
      }
    }
  }
  return [lo, hi];
}

// ---- Merge: several Plots on one page ----
// The cells of the Plots in a grid (reading order; a Plot spanning colSpan × rowSpan cells takes the first place it
// fits, rows are added when the grid is full); free Plots are left out (null).
export function packCells(items: CanvasItem[], cols: number, rows: number): ({ r: number; c: number; rs: number; cs: number } | null)[] {
  const used: boolean[][] = [];
  const free = (r: number, c: number, rs: number, cs: number) => {
    if (c + cs > cols) return false;
    for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (used[i]?.[j]) return false;
    return true;
  };
  return items.map((it) => {
    if (it.free) return null;
    const cs = Math.max(1, Math.min(cols, Math.floor(it.colSpan ?? 1) || 1));
    const rs = Math.max(1, Math.floor(it.rowSpan ?? 1) || 1);
    for (let r = 0; r < rows + 100; r++)
      for (let c = 0; c < cols; c++)
        if (free(r, c, rs, cs)) {
          for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) (used[i] ??= [])[j] = true;
          return { r, c, rs, cs };
        }
    return null;
  });
}

const convert = (v: number, from: LengthUnit, to: LengthUnit) => (toPt(v, from) / toPt(1, to));

// The Merge's page: every Plot in its box (a cell of the grid, or its own box), its frame placed again there (by its
// margins, or as on its own page); shared axes get one range and, unless `inner`, numbers and titles on the outer
// panels only; its own annotations on the page.
export function canvasFigure(id: string, d: CanvasData, figsIn: Figure[], warnings: string[]): Figure {
  const L0: CanvasLayout = { ...CANVAS_LAYOUT_DEFAULTS, ...d.layout };
  // a Plot split into facets: a panel for every curve it shows (its axes, legend and styles), in its place
  const figs = figsIn.flatMap((f): Figure[] => {
    const ax0 = f.axes[0];
    if (!d.items?.find((it) => it.key === f.key)?.facet || !ax0 || ax0.drawing) return [f];
    const shown = ax0.curves.filter((c) => c.style.show !== false);
    if (shown.length < 2) return [f];
    return shown.map((c, j) => ({ ...f, key: `${f.key}#${j + 1}`, axes: [{ ...ax0, key: `${ax0.key}#${j + 1}`, node: `${f.key}#${j + 1}`, curves: [c], legends: ax0.legends.map((lg) => ({ ...lg, curves: lg.curves.filter((q) => q.key === c.key) })) }] }));
  });
  // stacked: one column (X shared) or one row (Y shared) of the Plots in the grid (insets stay where they are)
  const arrange = L0.arrange ?? 'grid';
  const own = figs.map((f) => d.items?.find((it) => it.key === f.key) ?? { key: f.key ?? '' });
  const inGrid = own.filter((it) => !it.free).length;
  const L: CanvasLayout =
    arrange === 'stackV'
      ? { ...L0, rows: Math.max(1, inGrid), cols: 1, sizing: 'fit', vgap: 0, shareX: 'all' }
      : arrange === 'stackH'
        ? { ...L0, rows: 1, cols: Math.max(1, inGrid), sizing: 'fit', hgap: 0, shareY: 'all' }
        : L0;
  const cols = Math.max(1, Math.floor(L.cols) || 1);
  const items = arrange === 'grid' ? own : own.map((it) => (it.free ? it : { key: it.key }));
  const cells = packCells(items, cols, Math.max(1, Math.floor(L.rows) || 1));
  const rows = Math.max(Math.floor(L.rows) || 1, maxOf(cells.map((c) => (c ? c.r + c.rs : 0))));
  const [m, hg, vg] = [Math.max(0, L.margin || 0), Math.max(0, L.hgap || 0), Math.max(0, L.vgap || 0)];
  // room kept around the panels (pt): the common titles of X and Y, the common legend
  const text = pageText(d);
  const first = figs.find((f, k) => cells[k] && !f.axes[0]?.drawing)?.axes[0];
  const sideText = (side: Side) => resolveText(first?.style.sides[side].titleText, first?.text ?? text);
  const extra = { l: 0, r: 0, t: 0, b: 0 };
  if (L.commonX && first) extra.b += sideText('bottom').size * 1.3 + 3;
  if (L.commonY && first) extra.l += sideText('left').size * 1.3 + 3;
  // a title over the page: room at its top
  const titleSt = resolveText({ bold: true, size: text.size + 2, ...d.titleText }, text);
  const titleH = d.title?.trim() ? (() => {
    const m = richMetrics(d.title!, titleSt);
    return m.lines * m.lineHeight + 4;
  })() : 0;
  extra.t += titleH;
  let common: LegendSpec | null = null;
  if (L.legend && L.legend !== 'none') {
    // every curve of the panels once (by its legend text), in the look of the first panel's legend
    const seen = new Set<string>();
    const curves = figs.flatMap((f) => f.axes.flatMap((a) => (a.legends.length ? a.legends.flatMap((lg) => lg.curves) : a.curves.filter((c) => c.style.show !== false && !c.noLegend)))).filter((c) => !seen.has(c.label) && !!seen.add(c.label));
    const look = first?.legends[0];
    const base = { ...LEGEND_STYLE_DEFAULTS, ...(look ? { text: look.text, frame: look.frame, frameColor: look.frameColor, frameWidth: look.frameWidth, frameDash: look.frameDash, radius: look.radius, frameOpacity: look.frameOpacity, background: look.background, bgOpacity: look.bgOpacity, backgroundGrad: look.backgroundGrad, shadow: look.shadow, shadowX: look.shadowX, shadowY: look.shadowY, shadowBlur: look.shadowBlur, shadowColor: look.shadowColor, shadowOpacity: look.shadowOpacity, padding: look.padding, spacing: look.spacing, lineLen: look.lineLen } : {}) };
    common = { ...base, key: `${id}:legend`, curves, attach: '', z: 3, arrange: L.legend === 'right' ? 'column' : 'row', entries: [] };
    const size = legendLayout(common, text);
    if (L.legend === 'right') extra.r += size.w + 4;
    else extra[L.legend === 'top' ? 't' : 'b'] += size.h + 4;
  }
  const perUnit = toPt(1, d.unit);
  const [mL, mR, mT, mB] = [m + extra.l / perUnit, m + extra.r / perUnit, m + extra.t / perUnit, m + extra.b / perUnit];
  const shares = (s: string | undefined, n: number) => {
    const r = (s ?? '').split(/[:,;\s]+/).filter(Boolean).map(Number);
    const q = Array.from({ length: n }, (_, i) => (Number.isFinite(r[i]) && r[i] > 0 ? r[i] : 1));
    const sum = q.reduce((a, b) => a + b, 0);
    return q.map((v) => v / sum);
  };
  let W = d.width;
  let H = d.height;
  let colW: number[];
  let rowH: number[];
  if (L.sizing === 'keep') {
    // every Plot at its own size: a column as wide as its widest Plot, a row as tall as its tallest
    colW = Array(cols).fill(0);
    rowH = Array(rows).fill(0);
    const size = (f: Figure) => [convert(f.width, f.unit, d.unit), convert(f.height, f.unit, d.unit)];
    cells.forEach((c, k) => {
      if (!c) return;
      const [w, h] = size(figs[k]);
      if (c.cs === 1) colW[c.c] = Math.max(colW[c.c], w);
      if (c.rs === 1) rowH[c.r] = Math.max(rowH[c.r], h);
    });
    // a Plot over several cells: the last of them made larger when it does not fit
    cells.forEach((c, k) => {
      if (!c) return;
      const [w, h] = size(figs[k]);
      const sw = colW.slice(c.c, c.c + c.cs).reduce((a, b) => a + b, 0) + (c.cs - 1) * hg;
      const sh = rowH.slice(c.r, c.r + c.rs).reduce((a, b) => a + b, 0) + (c.rs - 1) * vg;
      if (sw < w) colW[c.c + c.cs - 1] += w - sw;
      if (sh < h) rowH[c.r + c.rs - 1] += h - sh;
    });
    W = mL + mR + colW.reduce((a, b) => a + b, 0) + (cols - 1) * hg;
    H = mT + mB + rowH.reduce((a, b) => a + b, 0) + (rows - 1) * vg;
  } else {
    // the columns and rows in proportion (equal unless given)
    const cw = W - mL - mR - (cols - 1) * hg;
    const rh = H - mT - mB - (rows - 1) * vg;
    if (!(cw > 0) || !(rh > 0)) warnings.push('The margin and the gaps leave no room for the cells.');
    colW = shares(arrange === 'grid' ? L.colRatios : '', cols).map((f) => Math.max(cw * f, 1e-3));
    rowH = shares(arrange === 'grid' ? L.rowRatios : '', rows).map((f) => Math.max(rh * f, 1e-3));
  }
  const Wpt = toPt(W, d.unit);
  const Hpt = toPt(H, d.unit);
  const at = (sizes: number[], k: number, gap: number, start: number) => start + sizes.slice(0, k).reduce((a, b) => a + b, 0) + k * gap;
  const boxes: FigureBox[] = [];
  let axes: AxesFig[] = [];
  figs.forEach((f, k) => {
    const c = cells[k];
    let box: Placement;
    if (!c) box = items[k].free ?? FULL;
    else {
      const x = at(colW, c.c, hg, mL);
      const y = at(rowH, c.r, vg, mT);
      const w = colW.slice(c.c, c.c + c.cs).reduce((a, b) => a + b, 0) + (c.cs - 1) * hg;
      const h = rowH.slice(c.r, c.r + c.rs).reduce((a, b) => a + b, 0) + (c.rs - 1) * vg;
      box = { x: (x / W) * 100, y: (y / H) * 100, w: (w / W) * 100, h: (h / H) * 100 };
    }
    // a Plot with a drawing over it: one picture — its proportions kept in its cell (centred), its frame where it was on
    // its page, so the drawing stays on its data
    const pictured = f.axes.some((a) => a.overlay);
    if (pictured) box = keepAspect(box, W, H, toPt(f.width, f.unit) / toPt(f.height, f.unit));
    boxes.push({ key: f.key ?? String(k), box, free: !c, ...(!c && f.background && f.background !== 'none' ? { background: f.background, ...(f.backgroundGrad ? { backgroundGrad: f.backgroundGrad } : {}) } : {}), ...(f.border > 0 ? { border: { width: f.border, color: f.borderColor, dash: f.borderDash ?? 'solid', radius: f.borderRadius ?? 0, opacity: f.borderOpacity ?? 1, inset: f.borderInset ?? 0 } } : {}) });
    for (const ax of f.axes) {
      // a frame placed by hand keeps its place in its page, now the box
      const p = ax.style.pos;
      const pos = { x: box.x + (p.x / 100) * box.w, y: box.y + (p.y / 100) * box.h, w: (p.w / 100) * box.w, h: (p.h / 100) * box.h };
      // the common titles replace the panels' own; the common legend their legends
      const sides = c && !ax.inset && !ax.drawing && (L.commonX || L.commonY) ? { ...ax.style.sides, ...(L.commonX ? { bottom: { ...ax.style.sides.bottom, showTitle: false } } : {}), ...(L.commonY ? { left: { ...ax.style.sides.left, showTitle: false } } : {}) } : ax.style.sides;
      axes.push({ ...ax, ...(pictured ? { auto: false } : {}), text: ax.text ?? f.text, legends: common && !L.panelLegends && !ax.inset ? [] : ax.legends, style: { ...ax.style, sides, pos } });
    }
  });
  // which axes share a range: all, or those of a column / row of the grid (a Plot by the cell it starts in)
  const cellOf = (k: number) => (axes[k].inset ? null : (cells[figs.findIndex((f) => f.key === axes[k].node)] ?? cells[k] ?? null));
  const share = (axis: 'x' | 'y', mode: 'none' | 'all' | 'column' | 'row') => {
    if (mode === 'none') return;
    const groups = new Map<number, number[]>();
    axes.forEach((_, k) => {
      const c = cellOf(k);
      if (axes[k].inset || axes[k].drawing || (mode !== 'all' && !c)) return;
      const g = mode === 'all' ? 0 : mode === 'column' ? c!.c : c!.r;
      groups.set(g, [...(groups.get(g) ?? []), k]);
    });
    for (const ks of groups.values()) {
      if (ks.length < 2) continue;
      const spec = axis === 'x' ? axes[ks[0]].style.x : axes[ks[0]].style.y;
      let lo = Infinity;
      let hi = -Infinity;
      for (const k of ks) {
        const [a, b] = dataRange(axes[k].curves, axis, spec.scale === 'log');
        lo = Math.min(lo, a);
        hi = Math.max(hi, b);
      }
      const [a, b] = axisRange(spec, lo, hi);
      for (const k of ks) {
        const st = axes[k].style;
        axes[k] = { ...axes[k], style: { ...st, [axis]: { ...(axis === 'x' ? st.x : st.y), min: a, max: b } } };
      }
    }
  };
  share('x', L.shareX);
  share('y', L.shareY);
  // one colour scale: the curves coloured by a map (not by categories) given the range of them all
  if (L.oneColorScale) {
    // (3D stacked maps: their layers coloured when drawn, by this range)
    const mapped = (c: Curve) => ((c.style.colorBy !== 'none' && !c.style.categorical) || !!c.three?.planes) && !!c.colorRange;
    const all = axes.flatMap((a) => a.curves.filter(mapped));
    if (all.length > 1) {
      const range: [number, number] = [minOf(all.map((c) => c.colorRange![0])), maxOf(all.map((c) => c.colorRange![1]))];
      axes = axes.map((a) => ({ ...a, curves: a.curves.map((c) => (mapped(c) ? { ...c, colorRange: range } : c)) }));
    }
  }
  // inner panels without numbers and titles on the shared axes
  if (!L.inner)
    axes = axes.map((ax, k) => {
      const c = cellOf(k);
      if (!c) return ax;
      const sides = { ...ax.style.sides };
      const below = cells.some((o) => o && o.r >= c.r + c.rs && o.c < c.c + c.cs && o.c + o.cs > c.c);
      if (L.shareX !== 'none' && below) sides.bottom = { ...sides.bottom, labels: false, showTitle: false };
      if (L.shareY !== 'none' && c.c > 0) sides.left = { ...sides.left, labels: false, showTitle: false };
      return { ...ax, style: { ...ax.style, sides } };
    });
  // stacked: the frames touching, placed together; the others by their margins, in their box
  const area = { x: mL * perUnit, y: mT * perUnit, w: Wpt - (mL + mR) * perUnit, h: Hpt - (mT + mB) * perUnit };
  const placed = arrange === 'grid' ? new Set<number>() : stackFrames(axes, figs, cells, arrange, L, d, area, Wpt, Hpt, warnings);
  axes = axes.map((ax, k) => {
    if (placed.has(k)) return ax;
    const b = boxes.find((x) => x.key === ax.node)?.box ?? FULL;
    return ax.auto ? placeAuto(ax, b, Wpt, Hpt, ax.text ?? pageText(d), ax.pad) : ax;
  });
  // the frames of a row of the grid share their top and bottom, those of a column their left and right side (the
  // largest margins win), as in a journal figure; a Plot over several cells is left as it is that way
  const align = (pick: (c: NonNullable<(typeof cells)[number]>) => number | null, lo: 'x' | 'y', len: 'w' | 'h') => {
    const groups = new Map<number, number[]>();
    axes.forEach((ax, k) => {
      const c = ax.auto ? cellOf(k) : null;
      const g = c ? pick(c) : null;
      if (g !== null) groups.set(g, [...(groups.get(g) ?? []), k]);
    });
    for (const ks of groups.values()) {
      if (ks.length < 2) continue;
      const a = maxOf(ks.map((k) => axes[k].style.pos[lo]));
      const b = minOf(ks.map((k) => axes[k].style.pos[lo] + axes[k].style.pos[len]));
      if (b - a <= 0) continue;
      for (const k of ks) axes[k] = { ...axes[k], style: { ...axes[k].style, pos: { ...axes[k].style.pos, [lo]: a, [len]: b - a } } };
    }
  };
  if (L.sizing === 'fit' && arrange === 'grid') {
    align((c) => (c.rs === 1 ? c.r : null), 'y', 'h');
    align((c) => (c.cs === 1 ? c.c : null), 'x', 'w');
  }
  axes = placeInsets(axes, Wpt, Hpt, pageText(d));
  // the common titles and legend: by the frames of the panels, in the room kept for them
  const annotations = annotationsOf(d.annotations, id, axes.flatMap((a) => a.curves), warnings);
  const legends: LegendSpec[] = [];
  const frames = axes.filter((a, k) => !a.inset && !a.drawing && cellOf(k)).map((a) => a.style.pos);
  if (frames.length) {
    const [x0, x1] = [minOf(frames.map((p) => p.x)), maxOf(frames.map((p) => p.x + p.w))];
    const [y0, y1] = [minOf(frames.map((p) => p.y)), maxOf(frames.map((p) => p.y + p.h))];
    const mPt = m * perUnit;
    const legH = common ? legendLayout(common, text).h + 4 : 0;
    const title = (side: 'bottom' | 'left') => {
      const own = side === 'bottom' ? L.commonXTitle : L.commonYTitle;
      if (own?.trim()) return own;
      const k = axes.findIndex((a, j) => !a.inset && !a.drawing && cellOf(j));
      if (k < 0) return '';
      const p = axes[k].style.pos;
      return axesGeometry(axes[k], { x: (p.x / 100) * Wpt, y: (p.y / 100) * Hpt, w: (p.w / 100) * Wpt, h: (p.h / 100) * Hpt }, axes[k].text ?? text).drawn.find((a) => a.key === side)?.title ?? '';
    };
    if (L.commonX && first) {
      const yb = Hpt - mPt - (L.legend === 'bottom' ? legH : 0);
      annotations.push({ key: `${id}:xtitle`, kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, text: title('bottom'), coords: 'percent', x: (x0 + x1) / 2, y: (yb / Hpt) * 100, anchor: 'bc', style: first.style.sides.bottom.titleText, z: 3 } });
    }
    if (L.commonY && first) annotations.push({ key: `${id}:ytitle`, kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, text: title('left'), coords: 'percent', x: (mPt / Wpt) * 100, y: (y0 + y1) / 2, anchor: 'tc', rotation: -90, style: first.style.sides.left.titleText, z: 3 } });
    if (common) {
      if (L.legend === 'right') legends.push({ ...common, x: ((Wpt - mPt) / Wpt) * 100, y: (y0 + y1) / 2, anchor: 'cr' });
      else if (L.legend === 'top') legends.push({ ...common, x: (x0 + x1) / 2, y: ((mPt + titleH) / Hpt) * 100, anchor: 'tc' });
      else legends.push({ ...common, x: (x0 + x1) / 2, y: ((Hpt - mPt) / Hpt) * 100, anchor: 'bc' });
    }
  }
  return {
    width: +W.toFixed(3),
    height: +H.toFixed(3),
    unit: d.unit,
    text: pageText(d),
    background: pageBackground(d.background),
    ...pageGrad(d),
    border: d.border ?? 0,
    borderColor: d.borderColor ?? '#000000',
    borderDash: d.borderDash,
    borderRadius: d.borderRadius,
    borderOpacity: d.borderOpacity,
    borderInset: d.borderInset,
    panels: d.panels ?? 'none',
    panelText: d.panelText ?? {},
    panelX: d.panelX ?? -30,
    panelY: d.panelY ?? -2,
    panelBox: d.panelBox || undefined,
    axes,
    legends,
    annotations: titleH ? [...annotations, { key: 'page-title', kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, text: d.title!, coords: 'percent', x: 50, y: ((m * perUnit) / Hpt) * 100, anchor: 'tc', style: { bold: true, size: text.size + 2, ...d.titleText }, z: 3 } }] : annotations,
    key: id,
    boxes,
    ...(d.comma ? { comma: true } : {}),
  };
}

// A stack (panels sharing an axis, no space between them): the frames of the Plots in the grid one under another
// (stackV) or side by side (stackH), touching or `stackGap` apart, in the proportions of `ratios`; the margins outside
// the stack those the Plots need (the largest), none between them. At the joints the ticks turn inward and a number at
// the very edge of a frame, that would run into the next one, is left out. The axes placed: their indices.
function stackFrames(axes: AxesFig[], figs: Figure[], cells: ReturnType<typeof packCells>, arrange: 'stackV' | 'stackH', L: CanvasLayout, d: CanvasData, area: { x: number; y: number; w: number; h: number }, Wpt: number, Hpt: number, warnings: string[]): Set<number> {
  const vert = arrange === 'stackV';
  // the first Axes of every Plot in the grid, in the order of the stack (top to bottom, left to right)
  const order = figs
    .map((f, k) => ({ c: cells[k], k: axes.findIndex((ax) => ax.node === f.key && ax.auto) }))
    .filter((o): o is { c: NonNullable<typeof o.c>; k: number } => !!o.c && o.k >= 0)
    .sort((a, b) => (vert ? a.c.r - b.c.r : a.c.c - b.c.c))
    .map((o) => o.k);
  const placed = new Set<number>();
  const n = order.length;
  if (!n) return placed;
  const gap = toPt(Math.max(0, L.stackGap ?? 0), d.unit);
  // at the joints: no numbers nor titles on the inner sides, the ticks inward (when the frames touch)
  const joint = (k: number, side: Side) => {
    const s = axes[k].style.sides[side];
    const ticks = gap === 0 && (s.ticks === 'out' || s.ticks === 'both') ? 'in' : s.ticks;
    axes[k] = { ...axes[k], style: { ...axes[k].style, sides: { ...axes[k].style.sides, [side]: { ...s, ticks, labels: side === (vert ? 'top' : 'right') ? false : s.labels } } } };
  };
  order.forEach((k, i) => {
    if (i > 0) joint(k, vert ? 'top' : 'left');
    if (i < n - 1) joint(k, vert ? 'bottom' : 'right');
  });
  // the room every Plot needs around its frame (in the whole area)
  const needs = order.map((k) => {
    const ax = axes[k];
    const f = autoFrame(ax, area, ax.text ?? pageText(d), ax.pad);
    return { left: f.x - area.x, top: f.y - area.y, right: area.x + area.w - f.x - f.w, bottom: area.y + area.h - f.y - f.h };
  });
  const r = (L.ratios ?? '').split(/[:,;\s]+/).filter(Boolean).map(Number);
  const ratio = order.map((_, i) => (Number.isFinite(r[i]) && r[i] > 0 ? r[i] : 1));
  const sum = ratio.reduce((a, b) => a + b, 0);
  const lead = vert ? maxOf(needs.map((q) => q.left)) : maxOf(needs.map((q) => q.top));
  const trail = vert ? maxOf(needs.map((q) => q.right)) : maxOf(needs.map((q) => q.bottom));
  const start = vert ? needs[0].top : needs[0].left;
  const end = vert ? needs[n - 1].bottom : needs[n - 1].right;
  const along = (vert ? area.h : area.w) - start - end - gap * (n - 1);
  const across = (vert ? area.w : area.h) - lead - trail;
  if (along <= 0 || across <= 0) {
    warnings.push('The stack does not fit on the page: make the page larger or the gaps smaller.');
    return placed;
  }
  let at = (vert ? area.y : area.x) + start;
  order.forEach((k, i) => {
    const len = (along * ratio[i]) / sum;
    const f = vert ? { x: area.x + lead, y: at, w: across, h: len } : { x: at, y: area.y + lead, w: len, h: across };
    at += len + gap;
    let ax: AxesFig = { ...axes[k], style: { ...axes[k].style, pos: { x: (f.x / Wpt) * 100, y: (f.y / Hpt) * 100, w: (f.w / Wpt) * 100, h: (f.h / Hpt) * 100 } } };
    // a number at the very start of the axis along the stack (bottom of a lower panel's Y, left of a later panel's X)
    // left out when it would run into the neighbour's last one
    if (i > 0) {
      const side: Side = vert ? 'left' : 'bottom';
      const g = axesGeometry(ax, f, ax.text ?? pageText(d));
      const t = g.drawn.find((a) => a.key === side);
      const size = resolveText(ax.style.sides[side].labelText, ax.text ?? pageText(d)).size;
      if (t && t.s.labels && t.pos.major.length) {
        const edge = vert ? f.y : f.x;
        const near = t.pos.major.map((v) => Math.abs(t.f(v) - edge) < (vert ? 0.6 : 1.2) * size);
        const s = ax.style.sides[side];
        // the far end of a lower panel is its top: the last value (first if the axis runs backwards)
        const lastNear = near[near.length - 1];
        const firstNear = near[0];
        if (vert ? lastNear || firstNear : firstNear || lastNear) ax = { ...ax, style: { ...ax.style, sides: { ...ax.style.sides, [side]: { ...s, ...(vert ? (lastNear ? { hideLast: true } : { hideFirst: true }) : firstNear ? { hideFirst: true } : { hideLast: true }) } } } };
      }
    }
    axes[k] = ax;
    placed.add(k);
  });
  return placed;
}

// A shape's full settings; older projects: “under the curves” is a layer below the data, and bands lie under it.
export function shapeSpec(d: Partial<ShapeSpec>): ShapeSpec {
  const s = { ...SHAPE_DEFAULTS, ...d };
  if (d.z === undefined) s.z = d.below || s.kind === 'xband' || s.kind === 'yband' ? -1 : SHAPE_DEFAULTS.z;
  return s;
}

// The curves of a split Plot curve as one legend entry ('auto': when there are more than 8): its key is the Plot curve's.
export function collapseGroups(curves: Curve[], mode: LegendSpec['groups'] = 'auto'): Curve[] {
  if (mode === 'each') return curves;
  const out: Curve[] = [];
  const done = new Set<string>();
  for (const c of curves) {
    const g = c.group;
    if (!g || (mode === 'auto' && g.count <= 8)) {
      out.push(c);
      continue;
    }
    if (done.has(g.base)) continue;
    done.add(g.base);
    const all = curves.filter((x) => x.group?.base === g.base);
    const vals = all.map((x) => x.group!.value).filter(Number.isFinite);
    const [lo, hi] = [minOf(vals), maxOf(vals)];
    const range = g.name ? `${fmtNum(lo, 4)} … ${fmtNum(hi, 4)}` : `${all.length} curves`;
    const own = c.label.includes(': ') ? c.label.slice(0, c.label.lastIndexOf(': ')) : '';
    out.push({ ...c, key: g.base, label: `${own ? `${own}, ` : ''}${g.name ? `${g.name} ${range}` : range}`, groupSpan: { lo, hi, count: all.length } });
  }
  return out;
}

// After every curve with a size key: three sizes (the ends of the range and its middle) with their values.
function withSizeKeys(curves: Curve[]): Curve[] {
  return curves.flatMap((c) => {
    const st = c.style;
    const range = c.sizeRange;
    if (!st.sizeKey || !c.sizeValues || !range || !range.every(Number.isFinite)) return [c];
    const [lo, hi] = range;
    const vals = lo === hi ? [lo] : st.sizeLog && lo > 0 && hi > 0 ? [lo, Math.sqrt(lo * hi), hi] : [lo, (lo + hi) / 2, hi];
    const color = st.colorBy === 'none' ? st.color : '#555555';
    return [
      c,
      ...vals.flatMap((v, j): Curve[] => {
        const size = scaledSize(v, range, st.sizeMin, st.sizeMax, { log: st.sizeLog, reverse: st.sizeReverse, area: st.sizeArea });
        return size > 0 ? [{ key: `${c.key}:size${j}`, label: fmtNum(v, 3), keyEntry: true, series: { name: c.series.name, x: c.series.x, y: c.series.y }, style: { ...st, mode: 'scatter', color, symbolSize: size, sizeBy: 'none', sizeKey: false, colorBy: 'none', fill: 'none' } }] : [];
      }),
    ];
  });
}

// The curves of a legend in the order chosen, without the hidden ones, with their own texts.
export function legendCurves(curves: Curve[], entries: LegendEntry[]): Curve[] {
  const byKey = new Map(curves.map((c) => [c.key, c]));
  const listed = entries.filter((e) => byKey.has(e.key));
  const rest = curves.filter((c) => !entries.some((e) => e.key === c.key));
  return [...listed.filter((e) => e.show).map((e) => ({ ...byKey.get(e.key)!, label: e.label || byKey.get(e.key)!.label })), ...rest];
}


// ---- Statistics ----
// The columns of a dataset a statistics node works on and its X (ranges by X, x in the rule).
function statColumns(ds: Dataset, spec: string | undefined, xName: string | undefined): { X?: Column; cols: Column[]; warnings: string[] } {
  const all = ds.columns;
  const X = xName === '-' ? undefined : xName ? findColumn(all, xName) : all.find((_, j) => roleOf(all, j) === 'x');
  const warnings: string[] = [];
  if (xName && xName !== '-' && !X) warnings.push(`No column “${xName}” (X) in the dataset.`);
  let cols: Column[];
  if (spec?.trim()) {
    const p = pick(spec, all.map((c) => c.name), true);
    if (p.missing.length) warnings.push(`Columns not found: ${p.missing.join(', ')}.`);
    cols = p.found.map((k) => all[k]);
  } else {
    // the Y columns (their designation), else every column but X
    cols = all.filter((c, j) => c !== X && roleOf(all, j) === 'y');
    if (!cols.length) cols = all.filter((c) => c !== X);
  }
  return { X, cols, warnings };
}

// Statistics on columns: of one column (every statistic a value), or of the columns chosen in a dataset (every
// statistic a column: a value per column, and the table of all), on the rows chosen; masked rows left out.
function statsColumns(d: StatsData, v: Value | undefined): Out {
  if (v?.t !== 'column' && v?.t !== 'dataset') return { view: { waiting: 'Connect a column, or a dataset (then choose its columns).' } };
  const warnings: string[] = [];
  let cols: Column[];
  let X: Column | undefined;
  let letters: Column[];
  let available: NodeView['available'];
  if (v.t === 'column') [cols, letters] = [[v.v], [v.v]];
  else {
    available = v.v.columns.map(colInfo);
    const r = statColumns(v.v, d.cols, d.x);
    [cols, X, letters] = [r.cols, r.X, v.v.columns];
    warnings.push(...r.warnings);
    if (!cols.length) return { warnings, view: { available, waiting: 'No column chosen.' } };
  }
  const n = maxOf(cols.map((c) => c.values.length));
  const sel = selectRows(d.rows, n, X, letters);
  if (typeof sel === 'string') return { errors: [`Rows: ${sel}`], view: { available } };
  let masked = 0;
  const per = cols.map((c) => {
    const vals: number[] = [];
    for (const i of sel.rows) {
      if (i >= c.values.length) continue;
      if (c.mask?.[i]) masked++;
      else vals.push(c.values[i]);
    }
    return describe(vals);
  });
  if (masked) warnings.push(`${masked} masked value${masked > 1 ? 's' : ''} left out.`);
  if (!sel.rows.length) warnings.push('No row chosen.');
  const outputs: Record<string, Value> = {};
  for (const st of STATS) {
    outputs[st.key] =
      v.t === 'column'
        ? { t: 'scalar', v: { name: `${st.label} of ${cols[0].name}${sel.text ? ` (${sel.text})` : ''}`, value: per[0][st.key] } }
        : { t: 'column', v: column(st.label, Float64Array.from(per, (s) => s[st.key])) };
  }
  // the table: a row per column (named by it), every statistic a column; mean ± SD designated for a quick plot
  const table: Column[] = [{ ...column('Column', Float64Array.from(cols, (_, k) => k + 1), cols.map((c) => c.name)), role: 'x' }];
  for (const st of STATS) table.push({ ...column(st.label, Float64Array.from(per, (s) => s[st.key])), role: st.key === 'mean' ? 'y' : st.key === 'sd' ? 'yerr' : 'none' });
  outputs.table = { t: 'dataset', v: { name: 'statistics', columns: table } };
  // a control chart of the first column, on the rows chosen in their order
  let control: string[] | undefined;
  if (d.control) {
    const c0 = cols[0];
    const vals = sel.rows.filter((i) => i < c0.values.length && !c0.mask?.[i]).map((i) => c0.values[i]);
    const cc = controlChart(vals, d.control === 'xbar' ? Math.max(2, Math.round(d.subgroup ?? 5)) : 1);
    if (typeof cc === 'string') warnings.push(`Control chart: ${cc}`);
    else {
      const m = cc.v.length;
      const F = (f: (k: number) => number) => Float64Array.from({ length: m }, (_, k) => f(k));
      const sub = cc.kind === 'xbar';
      outputs.control = {
        t: 'dataset',
        v: {
          name: `control chart of ${c0.name}`,
          columns: [
            { ...column(sub ? 'subgroup' : 'point', F((k) => cc.x[k])), role: 'x' },
            { ...column(sub ? `mean of ${c0.name}` : c0.name, F((k) => cc.v[k])), role: 'y' },
            { ...column('CL', F(() => cc.cl)), role: 'y' },
            { ...column('UCL', F(() => cc.ucl)), role: 'y' },
            { ...column('LCL', F(() => cc.lcl)), role: 'y' },
            { ...column(sub ? 'range' : 'moving range', F((k) => cc.r[k])), role: 'none' },
            { ...column('R CL', F(() => cc.rcl)), role: 'none' },
            { ...column('R UCL', F(() => cc.rucl)), role: 'none' },
            { ...column('R LCL', F(() => cc.rlcl)), role: 'none' },
            { ...column('out of control', F((k) => (cc.rules[k].length ? 1 : 0))), role: 'none' },
            { ...column('rules', F(() => NaN), cc.rules.map((q) => q.join(', '))), role: 'label' },
          ],
        },
      };
      const out = cc.rules.map((q, k) => (q.length ? `${sub ? 'subgroup' : 'point'} ${k + 1} (rule ${q.join(', ')})` : '')).filter(Boolean);
      control = [
        `${sub ? `X̄–R chart, subgroups of ${Math.round(d.subgroup ?? 5)}` : 'Individuals–moving range chart'} of ${c0.name}: CL ${fmtNum(cc.cl, 5)}, UCL ${fmtNum(cc.ucl, 5)}, LCL ${fmtNum(cc.lcl, 5)} (σ ${fmtNum(cc.sigma, 4)}).`,
        out.length ? `Out of control: ${out.slice(0, 6).join('; ')}${out.length > 6 ? ` … (${out.length})` : ''}.` : 'In control: no rule broken.',
      ];
    }
  }
  return {
    outputs,
    warnings,
    view: { stats: per[0], statsOf: cols[0], available, statCols: cols.map((c, k) => ({ name: c.name, stats: per[k] })), statRows: { used: sel.rows.length, of: n, text: sel.text }, ...(control ? { report: control } : {}) },
  };
}

// Statistics on rows: for every row chosen, the statistics of the values of the columns chosen (replicates → mean ± SD);
// each statistic a column, and a dataset with X, the mean (Y) and its error (±Y) ready for a plot.
function statsRows(d: { cols: string; x: string; rows?: StatsData['rows']; err: 'sd' | 'se' }, v: Value | undefined): Out {
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (Import, Auto-extract …), then choose its columns.' } };
  const available = v.v.columns.map(colInfo);
  const { X, cols, warnings } = statColumns(v.v, d.cols, d.x);
  if (!cols.length) return { warnings, view: { available, waiting: 'No column chosen.' } };
  const n = maxOf(cols.map((c) => c.values.length));
  if (new Set(cols.map((c) => c.values.length)).size > 1) warnings.push('The columns have different lengths: the missing values of the shorter ones are left out.');
  const sel = selectRows(d.rows, n, X, v.v.columns);
  if (typeof sel === 'string') return { errors: [`Rows: ${sel}`], view: { available } };
  const m = sel.rows.length;
  const out = Object.fromEntries(STATS.map((s) => [s.key, new Float64Array(m)])) as Record<StatKey, Float64Array>;
  const vals: number[] = [];
  let masked = 0;
  sel.rows.forEach((i, r) => {
    vals.length = 0;
    for (const c of cols) {
      if (i >= c.values.length) continue;
      if (c.mask?.[i]) masked++;
      else vals.push(c.values[i]);
    }
    const s = describe(vals);
    for (const st of STATS) out[st.key][r] = s[st.key];
  });
  if (masked) warnings.push(`${masked} masked value${masked > 1 ? 's' : ''} left out.`);
  if (!m) warnings.push('No row chosen.');
  const statCol = (key: StatKey) => {
    const st = STATS.find((s) => s.key === key)!;
    return column(st.label, out[key]);
  };
  const outputs: Record<string, Value> = {};
  for (const st of STATS) outputs[st.key] = { t: 'column', v: statCol(st.key) };
  const xOut: Column = X ? { ...takeRows(X, sel.rows), role: 'x' } : { ...column('Row', Float64Array.from(sel.rows, (i) => i + 1)), role: 'x' };
  outputs.x = { t: 'column', v: xOut };
  const err = d.err === 'se' ? 'se' : 'sd';
  const rest: Column[] = STATS.filter((s) => s.key !== 'mean' && s.key !== err).map((s) => ({ ...statCol(s.key), role: 'none' }));
  outputs.out = { t: 'dataset', v: { name: v.v.name, columns: [xOut, { ...statCol('mean'), role: 'y' }, { ...statCol(err), role: 'yerr' }, ...rest] } };
  return { outputs, warnings, view: { available, statCols: cols.map((c) => ({ name: c.name })), statRows: { used: m, of: n, text: sel.text }, statOut: out } };
}

// ---- Fit ----
// The comparisons of a Fit: a second model on the same runs, and (several runs) the same parameters for all against a
// fit each. The separate fits of the model: the results when the fit was not global, else fitted again.
function compareFits(d: FitNodeData, model: Model, specs0: FitParamSpec[], runs: FitRunData[], res: RunResult[], ctx: Omit<ModelCtx, 'run'>, warnings: string[]) {
  if (!d.compare2 && !d.sameTest) return null;
  const opts = { global: false, band: 'none' as const, points: 2, ctx, xerr: !!d.xerrFit };
  const isGlobal = res.some((r) => r.params.some((p) => p.shared));
  const sep = isGlobal ? runFits(model, specs0, runs, opts).runs : res;
  const score = (r: RunResult, fit: string): Scored => ({ group: r.label, fit, k: r.stats.n - r.stats.dof, n: r.stats.n, chi2: r.stats.chi2, r2: r.stats.r2 });
  const rows: ReturnType<typeof compare>['rows'] = [];
  const report: string[] = [];
  let runs2: RunResult[] | undefined;
  if (d.compare2 && d.model2) {
    const m2 = buildModel(d.model2);
    if (typeof m2 === 'string') warnings.push(`Second model: ${m2}`);
    else {
      const r2 = runFits(m2, [], runs, { ...opts, points: d.points });
      warnings.push(...r2.warnings.map((w) => `Second model: ${w}`));
      runs2 = r2.runs;
      const [n1, n2] = [modelName(d.model), modelName(d.model2)];
      const [a1, a2] = n1 === n2 ? [`${n1} (1)`, `${n2} (2)`] : [n1, n2];
      for (const a of sep) {
        const b = r2.runs.find((q) => q.label === a.label);
        if (!b) continue;
        const c = compare([score(a, a1), score(b, a2)], true);
        rows.push(...c.rows);
        report.push(...c.report);
      }
    }
  }
  if (d.sameTest && runs.filter((r) => r.xs.length).length > 1) {
    // every parameter shared (the fixed ones stay fixed): one set of parameters for all the runs
    const specs: FitParamSpec[] = model.params.map((q) => ({ ...findSpec(specs0, q.name, q.kind), shared: true }));
    const g = runFits(model, specs, runs, { ...opts, global: true }).runs;
    if (g.length !== sep.length || !g.length) warnings.push('Same parameters for all runs: some runs could not be fitted on their own — no test.');
    else {
      const ts = totalStats(sep);
      const tg = totalStats(g);
      const one: Scored = { group: 'all runs', fit: 'the same parameters (one fit)', k: specs.filter((s) => !s.fixed && !s.link).length, n: tg.n, chi2: tg.chi2, r2: tg.r2 };
      const each: Scored = { group: 'all runs', fit: `a fit each (${sep.length})`, k: sep.reduce((s, r) => s + r.stats.n - r.stats.dof, 0), n: ts.n, chi2: ts.chi2, r2: ts.r2 };
      const c = compare([one, each], true);
      rows.push(...c.rows);
      const f = c.rows[1];
      const num = (v: number) => (v < 1e-4 ? v.toExponential(1) : String(Number(v.toPrecision(3))));
      report.push(
        Number.isFinite(f.p)
          ? f.p < 0.05
            ? `Same parameters for all ${sep.length} runs? No — they differ (F = ${num(f.F)}, p = ${num(f.p)}).`
            : `Same parameters for all ${sep.length} runs? No evidence that they differ (F = ${num(f.F)}, p = ${num(f.p)}): one set fits them all.`
          : 'Same parameters for all runs: no F-test (no degrees of freedom left).',
        c.report[0],
      );
    }
  }
  return { rows, report, runs2 };
}

// A surface z = f(x, y): the points numbered, the usual fit on them; the graph of the node: the fitted Z against the
// measured one (the line y = x), the residuals under it
function surfaceFitNode(d: FitNodeData, v: Extract<Value, { t: 'dataset' }>, id: string): Out {
  const cols = v.v.columns;
  const available = cols.map(colInfo);
  const by = (nm: string | undefined) => (nm ? findColumn(cols, nm) : undefined);
  const roles = curvesByRole(cols).curves;
  const X = by(d.x && d.x !== '-' ? d.x : roles[0]?.x) ?? cols[0];
  const Y = by(d.ys[0]) ?? cols.find((c) => c !== X);
  const Z = by(d.zcol) ?? cols.find((c) => c !== X && c !== Y);
  if (!X || !Y || !Z) return { view: { available, waiting: 'A surface: choose X, Y and Z.' } };
  if (X === Y || X === Z || Y === Z) return { errors: ['A surface: X, Y and Z must be three different columns.'], view: { available } };
  const sm = surfaceModel(d.surfaceModel ?? 'plane', d.surfaceFormula ?? '');
  if (typeof sm === 'string') return { errors: [sm], view: { available } };
  const E = d.yerr ? by(d.yerr) : undefined;
  const weight = d.weight === 'auto' ? (E ? 'instrumental' : 'none') : d.weight;
  const n = Math.min(X.values.length, Y.values.length, Z.values.length);
  const mask = maskOf([X, Y, Z], n);
  const [px, py, pz, sig] = [[], [], [], []] as number[][];
  for (let i = 0; i < n; i++) {
    const [a, b, z] = [X.values[i], Y.values[i], Z.values[i]];
    const s = weight === 'instrumental' && E ? Math.abs(E.values[i]) : weight === 'statistical' ? Math.sqrt(Math.abs(z)) : 1;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(z) || mask?.[i] || !(s > 0) || !Number.isFinite(s)) continue;
    px.push(a);
    py.push(b);
    pz.push(z);
    sig.push(s);
  }
  if (pz.length < sm.params.length + 1) return { errors: [`A surface: ${pz.length} points for ${sm.params.length} parameters.`], view: { available } };
  const model: Model = { params: sm.params, note: sm.note, f: (t, p) => sm.f(px[Math.round(t)], py[Math.round(t)], p), guess: () => sm.guess(px, py, pz) };
  const warnings: string[] = [];
  const pl = parseLinks(d.links, model.params.map((q) => q.name));
  warnings.push(...pl.errors);
  const specs: FitParamSpec[] = model.params.map((q) => ({ ...findSpec(d.params, q.name, q.kind), ...(pl.links[q.name] ? { link: pl.links[q.name] } : {}) }));
  const ctx = { energy: false, xref: 0 };
  const res = runFits(model, specs, [{ label: Z.name, value: 1, xs: pz.map((_, k) => k), ys: pz, sig }], { global: false, band: 'none', points: 2, ctx });
  warnings.push(...res.warnings);
  const r0 = res.runs[0];
  if (!r0) return { errors: ['Nothing was fitted.', ...warnings], view: { available } };
  const p = r0.params.map((q) => q.value);
  const zf = pz.map((_, k) => model.f(k, p, { ...ctx, run: 1 }));
  const resid = pz.map((z, k) => z - zf[k]);
  const [zlo, zhi] = [minOf(pz), maxOf(pz)];
  const run: RunResult = { ...r0, curve: { x: Float64Array.from([zlo, zhi]), y: Float64Array.from([zlo, zhi]), band: null }, resid: { x: pz, r: resid } };
  const F = (a: number[]) => Float64Array.from(a);
  const pcols: Column[] = [{ ...column('fit', F([1])), role: 'x' }];
  model.params.forEach((q, j) => pcols.push({ ...column(q.name, F([p[j]])), role: 'y' }, { ...column(`${q.name} error`, F([r0.params[j].error])), role: 'yerr' }));
  pcols.push(column('N', F([r0.stats.n])), column('R²', F([r0.stats.r2])), column('adj. R²', F([r0.stats.adjR2])), column('χ²', F([r0.stats.chi2])), column('reduced χ²', F([r0.stats.redChi2])), column('RMSE', F([r0.stats.rmse])));
  const outputs: Record<string, Value> = {
    fit: { t: 'dataset', v: { name: `fit ${id}`, columns: [{ ...column(X.name, F(px)), role: 'x' }, { ...column(Y.name, F(py)), role: 'none' }, { ...column(Z.name, F(pz)), role: 'y' }, { ...column(`fit of ${Z.name}`, F(zf)), role: 'y' }] } },
    resid: { t: 'dataset', v: { name: `residuals ${id}`, columns: [{ ...column(X.name, F(px)), role: 'x' }, { ...column(Y.name, F(py)), role: 'none' }, { ...column(`residuals of ${Z.name}`, F(resid)), role: 'y' }] } },
    params: { t: 'dataset', v: { name: `fit ${id}`, columns: pcols } },
  };
  // values derived from the parameters
  let use: UseRow[][] | undefined;
  if (d.derived?.trim()) {
    const u = applyFit(model, r0, { ...ctx, run: 1 }, { derived: d.derived });
    warnings.push(...u.warnings);
    use = [u.rows];
  }
  const N = pz.length;
  return {
    outputs,
    warnings: [...new Set(warnings)],
    view: {
      available,
      fit: { x: F(pz), y: F(zf), run: new Int32Array(N), used: new Uint8Array(N).fill(1), runs: [{ ...run, cov: undefined }], ...(use ? { use } : {}), labels: [Z.name], params: model.params, note: model.note, xName: `${Z.name} (measured)`, yNames: [`${Z.name} (fitted)`], group: '', surface: true },
    },
  };
}

// A regression on several predictors: the coefficients and their statistics; the graph of the node: the observed
// response against the fitted one (logistic: the 0 / 1 against the probability)
function regressionFitNode(d: FitNodeData, v: Extract<Value, { t: 'dataset' }>, id: string): Out {
  const cols = v.v.columns;
  const available = cols.map(colInfo);
  const roles = curvesByRole(cols).curves;
  const Y = findColumn(cols, d.ys[0] || roles[0]?.y || '');
  if (!Y) return { view: { available, waiting: 'Choose the response Y.' } };
  let P: Column[];
  if (d.predictors?.trim()) {
    const p = pick(d.predictors, cols.map((c) => c.name), true);
    if (p.missing.length) return { errors: [`Predictors: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    P = p.found.map((j) => cols[j]).filter((c) => c !== Y);
  } else P = cols.filter((c, j) => c !== Y && roleOf(cols, j) !== 'none' && Array.from(c.values).some(Number.isFinite));
  if (!P.length) return { view: { available, waiting: 'Choose the predictors (the columns that explain Y).' } };
  const logistic = d.regression === 'logistic';
  const warnings: string[] = [];
  const report: string[] = [];
  // the response of a logistic regression: two levels — 0 / 1, or any two values or texts (the second one = 1)
  let yv: number[] = Array.from(Y.values);
  if (logistic) {
    const lv = (i: number) => (Y.text?.[i]?.trim() ? Y.text[i].trim() : Number.isFinite(Y.values[i]) ? String(Y.values[i]) : '');
    const levels = [...new Set(Array.from({ length: Y.values.length }, (_, i) => lv(i)).filter(Boolean))];
    if (levels.length !== 2) return { errors: [`Logistic regression: the response must have two levels (${levels.length} found in “${Y.name}”).`], view: { available } };
    const sorted = levels.every((q) => Number.isFinite(Number(q))) ? [...levels].sort((a, b) => Number(a) - Number(b)) : [...levels].sort();
    yv = Array.from({ length: Y.values.length }, (_, i) => (lv(i) === sorted[1] ? 1 : lv(i) === sorted[0] ? 0 : NaN));
    report.push(`The response: “${sorted[1]}” = 1, “${sorted[0]}” = 0.`);
  }
  const n0 = Math.min(Y.values.length, ...P.map((c) => c.values.length));
  const mask = maskOf([Y, ...P], n0);
  const rows = Array.from({ length: n0 }, (_, i) => i).filter((i) => !mask?.[i] && Number.isFinite(yv[i]) && P.every((c) => Number.isFinite(c.values[i])));
  if (rows.length < n0) warnings.push(`${n0 - rows.length} row${n0 - rows.length > 1 ? 's' : ''} with a missing value left out.`);
  const X = rows.map((i) => P.map((c) => c.values[i]));
  const y = rows.map((i) => yv[i]);
  const names = P.map((c) => c.name);
  const r = logistic ? logisticRegression(X, y, names) : linearRegression(X, y, names);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  warnings.push(...r.warnings);
  const F = (a: ArrayLike<number>) => Float64Array.from(a);
  const cs = r.coefs;
  const ccols: Column[] = [
    { ...column('term', F(cs.map((_, k) => k + 1)), cs.map((c) => c.name)), role: 'x' },
    { ...column('coefficient', F(cs.map((c) => c.value))), role: 'y' },
    { ...column('SE', F(cs.map((c) => c.se))), role: 'yerr' },
    column(logistic ? 'z' : 't', F(cs.map((c) => c.stat))),
    column('p', F(cs.map((c) => c.p))),
    column('CI 95 % low', F(cs.map((c) => c.lo))),
    column('CI 95 % high', F(cs.map((c) => c.hi))),
    ...(logistic ? [column('odds ratio', F(cs.map((c) => c.odds ?? NaN))), column('OR low', F(cs.map((c) => c.oddsLo ?? NaN))), column('OR high', F(cs.map((c) => c.oddsHi ?? NaN)))] : [column('VIF', F(cs.map((c) => c.vif ?? NaN)))]),
  ];
  const st = r.stats;
  const fmt = (q: number) => fmtNum(q, 4);
  const fpv = (p: number) => (p < 1e-4 ? 'p < 0.0001' : `p = ${fmtNum(p, 3)}`);
  if (logistic) report.push(`Logistic regression on ${names.join(', ')} (N = ${r.n}): LR χ²(${cs.length - 1}) = ${fmt(st['LR χ²'])}, ${fpv(st['p (LR)'])}, McFadden's R² = ${fmt(st["McFadden's R²"])}, ${fmtNum(st['correctly classified %'], 3)} % classified right.`);
  else report.push(`Linear regression on ${names.join(', ')} (N = ${r.n}): R² = ${fmt(st['R²'])}, adjusted ${fmt(st['adj. R²'])}, F(${st['df model']}, ${st['df residual']}) = ${fmt(st.F)}, ${fpv(st['p (F)'])}.`);
  for (const c of cs.slice(1)) report.push(`${c.name}: ${fmt(c.value)} ± ${fmt(c.se)}, ${fpv(c.p)}${logistic ? `, odds ratio ${fmt(c.odds ?? NaN)}` : ''}`);
  const statsTable: Dataset = { name: 'statistics', columns: [{ ...column('statistic', F(Object.keys(st).map((_, k) => k + 1)), Object.keys(st)), role: 'label' }, { ...column('value', F(Object.values(st))), role: 'none' }] };
  const outputs: Record<string, Value> = {
    params: { t: 'dataset', v: { name: `regression ${id}`, columns: ccols } },
    fit: { t: 'dataset', v: { name: `fit ${id}`, columns: [{ ...column(logistic ? `probability of ${Y.name}` : `fitted ${Y.name}`, F(r.fitted)), role: 'x' }, { ...column(Y.name, F(y)), role: 'y' }, ...P.map((c) => ({ ...column(c.name, F(rows.map((i) => c.values[i]))), role: 'none' as const }))] } },
    resid: { t: 'dataset', v: { name: `residuals ${id}`, columns: [{ ...column(`fitted ${Y.name}`, F(r.fitted)), role: 'x' }, { ...column(logistic ? 'response residual' : `residuals of ${Y.name}`, F(r.resid)), role: 'y' }] } },
    stats: { t: 'dataset', v: statsTable },
  };
  // for the node's graph and its statistics line: one run
  const N = y.length;
  const dof = N - cs.length;
  const sse = r.resid.reduce((s2, q) => s2 + q * q, 0);
  const [lo, hi] = [Math.min(...r.fitted, ...y), Math.max(...r.fitted, ...y)];
  const run: RunResult = {
    label: Y.name,
    value: 1,
    params: cs.map((c) => ({ name: c.name, value: c.value, error: c.se, fixed: false, shared: false })),
    stats: { n: N, dof, chi2: sse, redChi2: dof > 0 ? sse / dof : NaN, r2: logistic ? st["McFadden's R²"] : st['R²'], adjR2: logistic ? NaN : st['adj. R²'], rmse: Math.sqrt(sse / N), iterations: logistic ? st.iterations : 1 },
    curve: { x: F([lo, hi]), y: F([lo, hi]), band: null },
    resid: { x: r.fitted, r: r.resid },
  };
  return {
    outputs,
    warnings: [...new Set(warnings)],
    view: {
      available,
      report,
      fit: { x: F(r.fitted), y: F(y), run: new Int32Array(N), used: new Uint8Array(N).fill(1), runs: [run], labels: [Y.name], params: cs.map((c) => ({ name: c.name, kind: 'free' })), note: logistic ? `P(${Y.name} = 1) = 1 / (1 + exp(−(b0 + ${names.map((nm, k) => `b${k + 1}·${nm}`).join(' + ')})))` : `${Y.name} = b0 + ${names.map((nm, k) => `b${k + 1}·${nm}`).join(' + ')}`, xName: logistic ? 'probability (fitted)' : `${Y.name} (fitted)`, yNames: [`${Y.name} (observed)`], group: '', surface: true, regression: { kind: r.kind, coefs: cs, stats: st } },
    },
  };
}

function fitNode(d: FitNodeData, v: Value | undefined, id: string, irfIn?: Value): Out {
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (Import, Data manipulation …) or the data of a Plot curve.' } };
  if (d.regression) return regressionFitNode(d, v, id);
  if (d.surface) return surfaceFitNode(d, v, id);
  // the columns: chosen in the dataset (else its designations: every Y with its X and ±Y, as Plot
  // draws them — the sheets of a workbook in one dataset are runs); several Y: each with its own X unless X is chosen
  let Xs: (Column | undefined)[] = [];
  let Ys: Column[] = [];
  let Es: (Column | undefined)[] = [];
  let Exs: (Column | undefined)[] = [];
  let available: NodeView['available'];
  {
    const cols = v.v.columns;
    available = cols.map(colInfo);
    const by = (nm: string) => findColumn(cols, nm);
    const roles = curvesByRole(cols).curves;
    const chosen = d.ys.filter(Boolean);
    const yNames = chosen.length ? chosen : roles.map((c) => c.y);
    Ys = yNames.map(by).filter((c): c is Column => !!c);
    const missing = yNames.filter((nm) => !by(nm));
    if (missing.length) return { errors: [`No column ${missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    const curveOf = (y: Column) => roles.find((c) => findColumn(cols, c.y) === y);
    Xs = Ys.map((y) => (d.x === '-' ? undefined : by(d.x || (curveOf(y)?.x ?? roles[0]?.x ?? ''))));
    // ±Y: chosen for all, else (no Y chosen) the one designated with each Y
    Es = Ys.map((y) => (d.yerr ? by(d.yerr) : chosen.length ? undefined : curveOf(y)?.yerr ? by(curveOf(y)!.yerr!) : undefined));
    // ±X (York): chosen, else the one designated with each Y
    Exs = Ys.map((y) => (d.xerr ? by(d.xerr) : curveOf(y)?.xerr ? by(curveOf(y)!.xerr!) : undefined));
  }
  if (!Ys.length) return { view: { available, waiting: 'Choose the Y column to fit.' } };
  const n = maxOf(Ys.map((c) => c.values.length));
  const XsOk = Ys.map((y, k) => Xs[k] ?? rowIndex(y.values.length));
  const X = XsOk[0];
  let model = buildModel(d.model);
  if (typeof model === 'string') return { errors: [model], view: { available } };
  // the weights
  const weight = d.weight === 'auto' ? (Es.some(Boolean) ? 'instrumental' : 'none') : d.weight;
  const warnings: string[] = [];
  if (weight === 'instrumental' && !Es.some(Boolean)) warnings.push('Instrumental weights need a ±Y column: no weights used.');
  // York: a straight line with the errors of X and of Y (both needed)
  const york = d.model.kind === 'library' && d.model.model === 'york';
  if (york && (weight !== 'instrumental' || !Es.some(Boolean))) return { errors: ['York: the errors of Y are needed — a ±Y column (designated, or chosen), weights 1/σ².'], view: { available } };
  if (york && !Exs.some(Boolean)) return { errors: ['York: the errors of X are needed — a ±X column (designated after the Y, or chosen).'], view: { available } };
  // the errors of X with any model (effective variance)
  const withX = york || (!!d.xerrFit && Exs.some(Boolean));
  if (d.xerrFit && !york && !Exs.some(Boolean)) warnings.push('Errors of X: no ±X column (designated after the Y, or chosen) — not counted.');
  const sigma = (y: Column, e: Column | undefined, i: number) => (weight === 'instrumental' && e ? Math.abs(e.values[i]) : weight === 'statistical' ? Math.sqrt(Math.abs(y.values[i])) : 1);
  // the ranges of a run: its own (ranges per run), else the common ones; an empty end: no limit on that side
  const rangesOf = (label: string) => (d.rangesBy === 'run' && d.runRanges?.[label]?.length ? d.runRanges[label] : d.ranges);
  const inRanges = (ranges: { lo: number; hi: number }[], x: number) =>
    !ranges.length ||
    ranges.some((r) => {
      const [a, b] = [Number.isFinite(r.lo) ? r.lo : -Infinity, Number.isFinite(r.hi) ? r.hi : Infinity];
      return x >= Math.min(a, b) && x <= Math.max(a, b);
    });
  // the runs: every Y column (its value: the block it came from, else its number)
  const allX = new Float64Array(Ys.length * n);
  const allY = new Float64Array(Ys.length * n);
  const runOf = new Int32Array(Ys.length * n).fill(-1);
  const used = new Uint8Array(Ys.length * n);
  const runs: FitRunData[] = [];
  let groupName = '';
  const rk = runsKey(Ys);
  // the data run of every fitted run (its Y column and the value of its block), and its range (a fit per range)
  const parts: { of: string; ofValue: number; range?: number }[] = [];
  const addRun = (label: string, value: number, y: Column, rows: number[], slot: number, ranges: { lo: number; hi: number }[], range?: number) => {
    const r: FitRunData = { label, value, xs: [], ys: [], sig: [], ...(withX ? { sx: [] } : {}) };
    const xc = XsOk[slot];
    const e = Es[slot];
    const ex = Exs[slot];
    const xv = xc.values;
    const mask = maskOf([xc, y], n);
    for (const i of rows) {
      const o = slot * n + i;
      allX[o] = xv[i];
      allY[o] = y.values[i];
      runOf[o] = slot;
      const s = sigma(y, e, i);
      const sx = withX ? (ex ? Math.abs(ex.values[i]) : york ? NaN : 0) : 0;
      if (!Number.isFinite(xv[i]) || !Number.isFinite(y.values[i]) || mask?.[i] || !inRanges(ranges, xv[i]) || !(s > 0) || !Number.isFinite(s) || !Number.isFinite(sx)) continue;
      used[o] = 1;
      r.xs.push(xv[i]);
      r.ys.push(y.values[i]);
      r.sig.push(s);
      r.sx?.push(sx);
    }
    runs.push(r);
    parts.push({ of: y.name, ofValue: rk.value(y, slot), ...(range ? { range } : {}) });
  };
  const every = Array.from({ length: n }, (_, i) => i);
  if (Ys.length > 1) groupName = rk.name || 'Y';
  // a fit per range: every range of every Y column a run of its own (“R · range 2”; one Y: its value the range number)
  const perRange = !!d.rangeFits && !model.joint && Ys.some((y) => rangesOf(y.name).length > 1);
  if (perRange) {
    let m = 0;
    Ys.forEach((y, k) =>
      rangesOf(y.name).forEach((rg, j) => {
        m++;
        addRun(`${y.name} · range ${j + 1}`, Ys.length > 1 ? m : j + 1, y, every, k, [rg], j + 1);
      }),
    );
  } else Ys.forEach((y, k) => addRun(y.name, rk.value(y, k), y, every, k, rangesOf(y.name)));
  if (model.joint && runs.length !== 2) return { errors: [d.model.kind === 'complex' ? 'A complex model: choose two Y columns — the real part, then the imaginary part.' : 'This model fits two branches together: choose two Y columns (the lower branch, then the upper one).'], view: { available } };
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of runs) for (const x of r.xs) [lo, hi] = [Math.min(lo, x), Math.max(hi, x)];
  if (!Number.isFinite(lo)) return { errors: ['No point to fit (all masked, missing, or outside the fit ranges).'], view: { available } };
  // on a wavelength axis (nm) the coupled-oscillator models work in energy
  // reconvolution: the model convolved with the IRF (a column of the data on its X, or the curve on the port)
  if (d.reconv) {
    let irf: { x: ArrayLike<number>; y: ArrayLike<number> } | undefined;
    if (d.irfFrom === 'port') {
      if (irfIn?.t === 'dataset') {
        const rc = curvesByRole(irfIn.v.columns).curves[0];
        const bx = rc && findColumn(irfIn.v.columns, rc.x);
        const by = rc && findColumn(irfIn.v.columns, rc.y);
        if (bx && by) irf = { x: bx.values, y: by.values };
      } else if (irfIn?.t === 'column') irf = { x: X.values, y: irfIn.v.values };
      if (!irf) return { errors: ['Reconvolution: connect the IRF to the “irf” port (a dataset with X and Y, or a column on the X of the data).'], view: { available } };
    } else {
      const ic = v.v.columns.find((c) => c.name === d.irfColumn);
      if (!ic) return { errors: [d.irfColumn ? `Reconvolution: no column “${d.irfColumn}”.` : 'Reconvolution: choose the column of the IRF.'], view: { available } };
      const role = curvesByRole(v.v.columns).curves.find((c) => findColumn(v.v.columns, c.y) === ic);
      const ix = role?.x ? findColumn(v.v.columns, role.x) : undefined;
      irf = { x: (ix ?? X).values, y: ic.values };
    }
    if (model.joint) return { errors: ['Reconvolution: not with a two-branch model.'], view: { available } };
    const rm = reconvolved(model, irf, [lo, hi], d.irfShift !== false);
    if (typeof rm === 'string') return { errors: [rm], view: { available } };
    model = rm;
  }
  const unit = unitOf(model.joint ? Ys[0].name : X.name);
  const ctx = { energy: unit === 'nm', xref: (lo + hi) / 2 };
  if (york && d.global && runs.length > 1) warnings.push('York: every run fitted on its own (no global fit).');
  // the constraints: the linked parameters given by the others
  const pl = parseLinks(d.links, model.params.map((q) => q.name));
  warnings.push(...pl.errors);
  if (york && Object.keys(pl.links).length) warnings.push('York: no constraints (a straight line).');
  const specs: FitParamSpec[] = model.params.map((q) => ({ ...findSpec(d.params, q.name, q.kind), ...(pl.links[q.name] ? { link: pl.links[q.name] } : {}) }));
  const res = york ? yorkRuns(runs.map((q) => ({ ...q, sx: q.sx ?? [] })), d.band, d.points) : runFits(model, specs, runs, { global: d.global, band: d.band, points: d.points, ctx, xerr: withX && !york });
  warnings.push(...res.warnings);
  const cmp = york || model.joint ? null : compareFits(d, model, specs, runs, res.runs, ctx, warnings);
  const rr = res.runs.map((r) => ({ ...r, ...parts[runs.findIndex((q) => q.label === r.label)] }));
  if (!rr.length) return { errors: ['Nothing was fitted.', ...res.warnings], view: { available } };
  // outputs: the fit curves — a dataset, an X and a fit column (and its band, ±Y) for every run —, the residuals, the
  // parameters (a row per run)
  const band = d.band !== 'none' && rr.every((r) => r.curve.band);
  const fitCols: Column[] = rr.flatMap((r) => {
    const y = Ys.find((c) => c.name === r.of) ?? Ys[0];
    const tag = rr.length > 1 ? ` (${r.label})` : '';
    return [
      { ...column(`${X.name}${tag}`, r.curve.x), role: 'x' as const },
      { ...column(rr.length > 1 ? `fit${tag}` : `fit of ${Ys[0].name}`, r.curve.y), role: 'y' as const, ...(y.key ? { key: y.key } : {}) },
      ...(band ? [{ ...column(`${d.band} band${tag}`, r.curve.band!), role: 'yerr' as const, band: true }] : []),
    ];
  });
  // the residuals: an X and a residual column for every run (the points fitted)
  const residCols: Column[] = rr.flatMap((r) => {
    const y = Ys.find((c) => c.name === r.of) ?? Ys[0];
    const tag = rr.length > 1 ? ` (${r.label})` : '';
    return [
      { ...column(`${X.name}${tag}`, Float64Array.from(r.resid.x)), role: 'x' as const },
      { ...column(rr.length > 1 ? `residuals${tag}` : `residuals of ${Ys[0].name}`, Float64Array.from(r.resid.r)), role: 'y' as const, ...(y.key ? { key: y.key } : {}) },
    ];
  });
  // the parameters: a row per fit — its number, the data it was fitted on (the value of its block, named as the blocks
  // are: cavity d (nm), cycle …; else the Y column), its range and the X fitted from / to, every parameter (Y) with its
  // error (±Y), the statistics
  const num = (name: string, f: (r: (typeof rr)[number], k: number) => number, role: Column['role'] = 'none'): Column => ({ ...column(name, Float64Array.from(rr, f)), role });
  const xEnd = (r: (typeof rr)[number], hi: boolean) => (r.resid.x.length ? (hi ? maxOf(r.resid.x) : minOf(r.resid.x)) : NaN);
  const pcols: Column[] = [
    num('fit', (_, k) => k + 1),
    { ...column(rk.name || 'Y column', Float64Array.from(rr, (r) => r.ofValue ?? r.value), rk.name ? undefined : rr.map((r) => r.of ?? r.label)), role: 'x' },
    num('range', (r) => r.range ?? 1),
    num('X from', (r) => xEnd(r, false)),
    num('X to', (r) => xEnd(r, true)),
  ];
  model.params.forEach((q, j) => {
    pcols.push(num(q.name, (r) => r.params[j].value, 'y'));
    pcols.push(num(`${q.name} error`, (r) => r.params[j].error, 'yerr'));
  });
  // a pseudo-Voigt's % Gaussian and % Lorentzian (from μ)
  const pct = (r: (typeof rr)[number]) => percentResults(model.params, r.params.map((q) => q.value), r.params.map((q) => q.error));
  percentResults(model.params, model.params.map(() => NaN), model.params.map(() => NaN)).forEach((q, j) => pcols.push(num(q.name, (r) => pct(r)[j]?.value ?? NaN), num(`${q.name} error`, (r) => pct(r)[j]?.error ?? NaN)));
  pcols.push(num('N', (r) => r.stats.n), num('R²', (r) => r.stats.r2), num('adj. R²', (r) => r.stats.adjR2), num('χ²', (r) => r.stats.chi2), num('reduced χ²', (r) => r.stats.redChi2), num('RMSE', (r) => r.stats.rmse));
  const outputs: Record<string, Value> = { fit: { t: 'dataset', v: { name: `fit ${id}`, columns: fitCols } }, resid: { t: 'dataset', v: { name: `residuals ${id}`, columns: residCols } }, params: { t: 'dataset', v: { name: `fit ${id}`, columns: pcols } } };
  if (cmp?.rows.length) outputs.compare = { t: 'dataset', v: compareTable(cmp.rows) };
  // using the fit (every fit): Y at X, X from Y, LOD / LOQ, values derived from the parameters
  const useOn = !!(d.at?.trim() || d.inverse?.trim() || d.derived?.trim() || d.lod);
  const use = useOn
    ? rr.map((r) => {
        const u = applyFit(model, r, { ...ctx, run: runs.findIndex((q) => q.label === r.label) + 1 }, { at: d.at, inverse: d.inverse, replicates: d.replicates, lod: d.lod, derived: d.derived });
        warnings.push(...u.warnings.map((w) => (rr.length > 1 ? `${r.label}: ${w}` : w)));
        return u.rows;
      })
    : undefined;
  if (use) {
    const all = use.flatMap((rows, k) => rows.map((q) => ({ ...q, k })));
    const un = (name: string, f: (q: (typeof all)[number]) => number, role: Column['role'] = 'none'): Column => ({ ...column(name, Float64Array.from(all, f)), role });
    const ut = (name: string, f: (q: (typeof all)[number]) => string): Column => ({ ...column(name, new Float64Array(all.length).fill(NaN), all.map(f)), role: 'label' });
    outputs.use = {
      t: 'dataset',
      v: {
        name: `use of fit ${id}`,
        columns: [
          ...(rr.length > 1 ? [un('fit', (q) => q.k + 1), ut('data', (q) => rr[q.k].label)] : []),
          ut('what', (q) => q.what),
          ut('name', (q) => q.name),
          un('given', (q) => q.input, 'x'),
          un('value', (q) => q.value, 'y'),
          un('error', (q) => q.error, 'yerr'),
          un('lower 95%', (q) => q.lo),
          un('upper 95%', (q) => q.hi),
          ...(all.some((q) => q.plo !== undefined) ? [un('prediction lower 95%', (q) => q.plo ?? NaN), un('prediction upper 95%', (q) => q.phi ?? NaN)] : []),
        ],
      },
    };
  }
  if ((d.compare2 || d.sameTest) && (york || model.joint)) warnings.push(`Comparisons: not with ${york ? 'York' : 'a two-branch model'}.`);
  return {
    outputs,
    warnings: [...new Set(warnings)],
    view: {
      available,
      fit: { x: allX, y: allY, run: runOf, used, runs: rr.map(({ cov: _c, ...q }) => q), ...(use ? { use } : {}), labels: Ys.map((y) => y.name), params: model.params, note: model.note, xName: X.name, yNames: Ys.map((c) => c.name), group: groupName, ...(cmp ? { compare: cmp.report, runs2: cmp.runs2 } : {}) },
    },
  };
}

// Differentiate / Integrate: every Y column on its own (with its X), in the order of X, inside its regions.
// Output: X, the Y columns each followed by its result (empty outside the regions), and for an integral the area of
// every region (a table, and the total of the first run as one value).
function calculusNode(d: CalculusData, v: Value | undefined, baseIn: Value | undefined): Out {
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (X and Y from the designations, or chosen) or the data of a Plot curve.' } };
  // every Y with its own X (the designated one on its left, as Plot draws it) unless X is chosen
  let Xs: (Column | undefined)[] = [];
  let Ys: Column[] = [];
  let others: Column[] = [];
  let available: NodeView['available'];
  {
    const cols = v.v.columns;
    available = cols.map(colInfo);
    const names = cols.map((c) => c.name);
    if (d.ys.trim()) {
      const p = pick(d.ys, names, true);
      if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
      Ys = p.found.map((j) => cols[j]);
    } else Ys = cols.filter((_, j) => roleOf(cols, j) === 'y');
    const roles = curvesByRole(cols).curves;
    if (d.x && d.x !== '-' && !findColumn(cols, d.x)) return { errors: [`No column “${d.x}” in the dataset.`], view: { available } };
    const xOf = (y: Column) => (d.x === '-' ? undefined : findColumn(cols, d.x || (roles.find((c) => findColumn(cols, c.y) === y)?.x ?? roles[0]?.x ?? '')));
    Ys = Ys.filter((y) => xOf(y) !== y);
    Xs = Ys.map(xOf);
    others = cols;
  }
  if (!Ys.length) return { view: { available, waiting: 'Choose the Y columns (or designate them Y in the worksheet).' } };
  const n = maxOf(Ys.map((c) => c.values.length));
  const XsOk = Ys.map((y, k) => Xs[k] ?? rowIndex(y.values.length));
  const X = XsOk[0];
  const warnings: string[] = [];
  // the runs: every Y column
  type Run = { label: string; y: Column; slot: number; rows: number[] };
  const every = Array.from({ length: n }, (_, i) => i);
  const runs: Run[] = Ys.map((y, k) => ({ label: y.name, y, slot: k, rows: every }));

  // a baseline that is another curve: a column of the data (with its own X), or the curve on the port (a column on the
  // X of each run, or a dataset's first curve)
  const curveBase = d.op === 'int' && d.baseline === 'curve';
  const from = d.baseFrom === 'port' ? 'port' : 'column';
  let portBase: { x: Float64Array; y: Float64Array } | undefined;
  if (curveBase && from === 'port') {
    if (baseIn?.t === 'dataset') {
      const rc = curvesByRole(baseIn.v.columns).curves[0];
      const bx = rc && findColumn(baseIn.v.columns, rc.x);
      const byc = rc && findColumn(baseIn.v.columns, rc.y);
      if (bx && byc) portBase = { x: bx.values, y: byc.values };
    } else if (baseIn?.t === 'column') portBase = { x: XsOk[0].values, y: baseIn.v.values };
    if (!portBase) return { errors: ['Baseline: connect a curve to the “baseline” port (a column, or a dataset with X and Y).'], view: { available } };
  }
  const baseCol = curveBase && from === 'column' ? findColumn(others, d.baseColumn ?? '') : undefined;
  if (curveBase && from === 'column' && !baseCol) return { errors: [d.baseColumn ? `Baseline: no column “${d.baseColumn}”.` : 'Baseline: choose its column.'], view: { available } };
  // the baseline column's X: the one designated for it (its own, as a branch cut by Split into columns has)
  const baseRole = baseCol && v.t === 'dataset' ? curvesByRole(v.v.columns).curves.find((c) => findColumn(v.v.columns, c.y) === baseCol) : undefined;
  const baseX = baseRole?.x && v.t === 'dataset' ? findColumn(v.v.columns, baseRole.x) : undefined;
  const sorted = (xs: ArrayLike<number>, ys: ArrayLike<number>, rows: Iterable<number>) => {
    const r = [...rows].filter((i) => Number.isFinite(xs[i]) && Number.isFinite(ys[i])).sort((a, b) => xs[a] - xs[b]);
    return { x: r.map((i) => xs[i]), y: r.map((i) => ys[i]) };
  };

  const regionsOf = (label: string) => (d.regionsBy === 'run' && d.runRegions?.[label]?.length ? d.runRegions[label] : d.regions);
  const result = Ys.map(() => new Float64Array(n).fill(NaN));
  const allX = new Float64Array(Ys.length * n);
  const allY = new Float64Array(Ys.length * n);
  const runOf = new Int32Array(Ys.length * n).fill(-1);
  const used = new Uint8Array(Ys.length * n);
  const lower: { x: number[]; y: number[] }[] = [];
  const areaRows: { run: string; value: number; region: string; index: number; lo: number; hi: number; area: number }[] = [];
  const pointsOf = (label: string) => (d.regionsBy === 'run' && d.runBasePoints?.[label]?.length ? d.runBasePoints[label] : (d.basePoints ?? []));
  const bases: { x: number[]; y: number[] }[] = [];
  // the area of every region, hatched on the graph: the curve and its baseline on the same X
  const fills: { index: number; x: number[]; y: number[]; b: number[] }[][] = [];
  if (d.op === 'int' && d.baseline === 'points' && !(d.basePoints?.length || Object.keys(d.runBasePoints ?? {}).length)) warnings.push('Baseline: place its points on the graph (Baseline points).');
  runs.forEach((run, k) => {
    const xc = XsOk[run.slot];
    const xv = xc.values;
    const mask = maskOf([xc, run.y], n);
    const yv = run.y.values;
    for (const i of run.rows) {
      allX[run.slot * n + i] = xv[i];
      allY[run.slot * n + i] = yv[i];
      runOf[run.slot * n + i] = k;
    }
    // the points used, in the order measured and in the order of X
    const valid = run.rows.filter((i) => Number.isFinite(xv[i]) && Number.isFinite(yv[i]) && !mask?.[i]);
    const idx = [...valid].sort((a, b) => xv[a] - xv[b]);
    // a baseline that is another curve: the curve integrated and its baseline, each in the order of X
    let fCurve: { x: number[]; y: number[] } | undefined;
    let gCurve: { x: number[]; y: number[] } | undefined;
    if (curveBase) {
      fCurve = sorted(xv, yv, valid);
      gCurve = from === 'column' ? (baseX ? sorted(baseX.values, baseCol!.values, baseCol!.values.keys()) : sorted(xv, baseCol!.values, valid)) : sorted(portBase!.x, portBase!.y, portBase!.x.keys());
    }
    const runFills: { index: number; x: number[]; y: number[]; b: number[] }[] = [];
    const parts = regionRows(xv, idx, regionsOf(run.label));
    const out = result[Ys.indexOf(run.y)];
    const opt: IntegralOptions = { area: d.area, baseline: d.baseline, base: d.base, curve: d.baseline === 'points' ? pointsCurve(pointsOf(run.label), d.baseInterp ?? 'linear') : null, opts: d.baseOpt };
    // the baseline under the points of every region (drawn on the graph), a gap between the regions
    const bx: number[] = [];
    const by: number[] = [];
    let carried = 0;
    for (const part of parts) {
      for (const i of part.rows) used[run.slot * n + i] = 1;
      if (d.op === 'diff') {
        if (part.rows.length < 2) continue;
        const dv = derivative(xv, yv, part.rows, d.order, d.method, Math.max(3, Math.floor(d.window) | 1), Math.max(1, Math.floor(d.poly)));
        for (const [i, val] of dv) out[i] = val;
      } else if (fCurve && gCurve) {
        // between two curves, on the union of their X inside the region
        const r = areaBetween(fCurve, gCurve, part.region.lo, part.region.hi, d.area === 'abs', d.join === 'combined' ? carried : 0);
        for (const i of part.rows) out[i] = interp(r.x, r.cum, xv[i]);
        carried += r.area;
        areaRows.push({ run: run.label, value: k + 1, region: regionName(part.index), index: part.index, lo: part.region.lo, hi: part.region.hi, area: r.area });
        bx.push(...r.x, NaN);
        by.push(...r.b, NaN);
        runFills.push({ index: part.index, x: r.x, y: r.y, b: r.b });
      } else {
        const r = integrate(xv, yv, part.rows, opt, d.join === 'combined' ? carried : 0);
        for (const [i, val] of r.cum) out[i] = val;
        carried += r.area;
        areaRows.push({ run: run.label, value: k + 1, region: regionName(part.index), index: part.index, lo: part.region.lo, hi: part.region.hi, area: r.area });
        for (const i of part.rows) {
          bx.push(xv[i]);
          by.push(r.baseAt(i));
        }
        bx.push(NaN);
        by.push(NaN);
        runFills.push({ index: part.index, x: part.rows.map((i) => xv[i]), y: part.rows.map((i) => yv[i]), b: part.rows.map((i) => r.baseAt(i)) });
      }
    }
    // the result in the order of X, a gap (NaN) between the regions
    lower.push({ x: idx.map((i) => xv[i]), y: idx.map((i) => out[i]) });
    bases.push({ x: bx, y: by });
    fills.push(runFills);
    if (!idx.length) warnings.push(`${run.label}: no point (all masked or missing).`);
  });
  if (d.op === 'diff' && d.method === 'sg' && d.window < 2 * d.order + 1) warnings.push(`Savitzky–Golay: a window of ${d.window} points is small for a derivative of order ${d.order}.`);

  // the dataset: X, (the group column of a sweep), every Y followed by its result
  const bare = (c: Column) => {
    const b = bareName(c.name) || c.name;
    return /\s/.test(b) ? `(${b})` : b;
  };
  const resName = (y: Column, x: Column = X) => (d.op === 'diff' ? (d.order === 1 ? `d${bare(y)}/d${bare(x)}` : `d²${bare(y)}/d${bare(x)}²`) : `∫${bare(y)} d${bare(x)}`);
  const columns: Column[] = [{ ...X, role: 'x' }];
  Ys.forEach((y, k) => {
    // a Y with another X than the one before it: its X first
    if (k > 0 && XsOk[k] !== XsOk[k - 1]) columns.push({ ...XsOk[k], role: 'x' });
    columns.push({ ...y, role: 'y' });
    columns.push({ ...column(resName(y, XsOk[k]), result[k]), role: 'y' });
  });
  const outputs: Record<string, Value> = { out: { t: 'dataset', v: { name: v.v.name, columns } } };
  if (d.op === 'int') {
    const table: Column[] = [
      ...(runs.length > 1 ? [{ ...column('run', Float64Array.from(areaRows, (r) => r.value), areaRows.map((r) => r.run)), role: 'x' as const }] : []),
      { ...column('region', Float64Array.from(areaRows, (r) => r.index + 1), areaRows.map((r) => r.region)), role: runs.length > 1 ? ('label' as const) : ('x' as const) },
      column('from', Float64Array.from(areaRows, (r) => r.lo)),
      column('to', Float64Array.from(areaRows, (r) => r.hi)),
      { ...column('area', Float64Array.from(areaRows, (r) => r.area)), role: 'y' },
    ];
    outputs.areas = { t: 'dataset', v: { name: 'areas', columns: table } };
    // the baseline of every run (drawn, placed, a line …): its X and its values
    const many = bases.length > 1;
    outputs.base = {
      t: 'dataset',
      v: { name: 'baseline', columns: bases.flatMap((bs, k) => [{ ...column(`${X.name}${many ? ` (${runs[k]?.label})` : ''}`, Float64Array.from(bs.x)), role: 'x' as const }, { ...column(`baseline${many ? ` (${runs[k]?.label})` : ''}`, Float64Array.from(bs.y)), role: 'y' as const }]) },
    };
    const firstRun = runs[0]?.label;
    outputs.area = { t: 'scalar', v: { name: `area of ${firstRun ?? 'Y'}`, value: areaRows.filter((r) => r.run === firstRun).reduce((a, r) => a + r.area, 0) } };
  }
  return {
    outputs,
    warnings,
    view: {
      available,
      calc: { x: allX, y: allY, run: runOf, used, labels: runs.map((r) => r.label), lower, bases, fills, areas: areaRows, xName: X.name, yNames: Ys.map((c) => c.name), resName: Ys.length ? resName(Ys[0]) : '' },
    },
  };
}

// ---- Peak analyzer ----
// The graph of a run: its points (X ascending, inside from … to), the baseline, every peak on the baseline, their sum
// (the envelope), the residuals, the peaks marked; the peaks found automatically (to keep as the list).
export type PeakRunView = { x: number[]; y: number[]; base: number[]; comps: number[][]; env: number[] | null; resid: number[] | null; marks: { x: number; y: number }[]; found: Found[]; r2: number };
// run: the state of the fit — fitted, not run yet, or run with other settings (to be run again); none: no fit asked
export type PeakView = { run?: 'fitted' | 'never' | 'changed'; labels: string[]; runs: PeakRunView[]; xName: string; yNames: string[]; table: { center: number; height: number; fwhm: number; area: number; pct: number; gauss?: number; gaussErr?: number; of?: number }[][] };

function peakNode(d0: PeakData, v: Value | undefined): Out {
  let d = d0;
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (X and the Y columns from the designations, or chosen).' } };
  const cols = v.v.columns;
  const available = cols.map(colInfo);
  let Ys: Column[];
  if (d.ys.trim()) {
    const p = pick(d.ys, cols.map((c) => c.name), true);
    if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
    Ys = p.found.map((j) => cols[j]);
  } else Ys = cols.filter((_, j) => roleOf(cols, j) === 'y');
  const roles = curvesByRole(cols).curves;
  if (d.x && d.x !== '-' && !findColumn(cols, d.x)) return { errors: [`No column “${d.x}” in the dataset.`], view: { available } };
  const xOf = (y: Column) => (d.x === '-' ? undefined : findColumn(cols, d.x || (roles.find((c) => findColumn(cols, c.y) === y)?.x ?? roles[0]?.x ?? '')));
  Ys = Ys.filter((y) => xOf(y) !== y);
  if (!Ys.length) return { view: { available, waiting: 'Choose the Y columns (or designate them Y in the worksheet).' } };
  const warnings: string[] = [];
  // the baseline column (with its own X when it has one)
  let curve: { x: ArrayLike<number>; y: ArrayLike<number> } | undefined;
  if (d.baseline === 'column') {
    const bc = findColumn(cols, d.baseColumn ?? '');
    if (!bc) return { errors: [d.baseColumn ? `Baseline: no column “${d.baseColumn}”.` : 'Baseline: choose its column.'], view: { available } };
    const bx = xOf(bc);
    curve = { x: bx && bx !== bc ? bx.values : rowIndex(bc.values.length).values, y: bc.values };
  }
  // the fit: asked, and (a node that needs Run analysis) run with these settings
  const runState: PeakView['run'] = !d.fit ? undefined : !d.needRun ? 'fitted' : !d.ran ? 'never' : d.ran === peakRunKey(d) ? 'fitted' : 'changed';
  d = { ...d, fit: runState === 'fitted' };
  const manual = (d.mode ?? (d.peaks.length ? 'manual' : 'auto')) === 'manual';
  const fitted = isFitted(d.baseline);
  if (fitted && !d.fit && !runState) warnings.push('A fitted baseline needs “Fit the peaks”: the rubber band is used.');
  const rk = runsKey(Ys);
  const many = Ys.length > 1;
  const lo = Number.isFinite(d.from) ? d.from! : -Infinity;
  const hi = Number.isFinite(d.to) ? d.to! : Infinity;
  const dataCols: Column[] = [];
  const baseCols: Column[] = [];
  const residCols: Column[] = [];
  const runs: PeakRunView[] = [];
  const table: PeakView['table'] = [];
  // the rows of the table of peaks
  // of: the peak whose doublet partner this one is (its number), else NaN
  const rows: { run: number; label: string; k: number; of: number; shape: PeakShape | ''; center: number; centerErr: number; height: number; fwhm: number; fwhmErr: number; area: number; pct: number; gauss: number; gaussErr: number; centroid: number; from: number; to: number; r2: number }[] = [];
  Ys.forEach((y, k) => {
    const xc = xOf(y) ?? rowIndex(y.values.length);
    const tag = many ? ` (${y.name})` : '';
    const mask = maskOf([xc, y], y.values.length);
    const idx: number[] = [];
    for (let i = 0; i < y.values.length; i++) if (Number.isFinite(xc.values[i]) && Number.isFinite(y.values[i]) && !mask?.[i] && xc.values[i] >= Math.min(lo, hi) && xc.values[i] <= Math.max(lo, hi)) idx.push(i);
    idx.sort((a, b) => xc.values[a] - xc.values[b]);
    const X = idx.map((i) => xc.values[i]);
    const Y = idx.map((i) => y.values[i]);
    if (X.length < 3) {
      warnings.push(`${y.name}: fewer than 3 points.`);
      return;
    }
    const xref = (X[0] + X[X.length - 1]) / 2;
    // the fixed part of the baseline; a fitted one starts from the line between the ends (the rubber band without a fit)
    const fixedKind = fitted ? (d.fit ? 'none' : 'rubber') : d.baseline;
    const fixed = fixedBaseline(fixedKind, X, Y, { points: d.basePoints, interp: d.baseInterp, curve, value: d.baseValue, opts: { ...d.baseOpt, under: d.baseOpt?.under ?? (d.find.sign === 'dips' ? 'dips' : 'peaks') } });
    const start = fitted && d.fit ? fixedBaseline('ends', X, Y, {}) : fixed;
    const z0 = Y.map((v, i) => v - start[i]);
    const found = findPeaksIn(X, z0, d.find);
    // manual: the list — a peak with a region at the maximum (minimum) of the data there; auto: the peaks found
    const placed = d.peaks.map((q): PeakItem => {
      if (!Number.isFinite(q.from) || !Number.isFinite(q.to)) return q;
      const x = regionPeak(X, z0, q.from!, q.to!, q.at ?? (d.find.sign === 'dips' ? 'min' : 'max'));
      if (!Number.isFinite(x)) warnings.push(`${y.name}: no point in the region ${fmtNum(q.from!, 4)} – ${fmtNum(q.to!, 4)}.`);
      return { ...q, x };
    });
    const list: PeakItem[] = manual ? placed.filter((q) => Number.isFinite(q.x)).sort((a, b) => a.x - b.x) : found.map((f) => ({ shape: d.shape, x: f.x }));
    // the components: every peak of the list and, right after a doublet's, its partner (at a fixed distance, its area a
    // fixed part, the same shape and width — linked to it in the fit)
    const parts: { shape: PeakShape; x: number; of?: number; dx?: number; ratio?: number; lo?: number; hi?: number }[] = [];
    for (const q of list) {
      parts.push({ shape: q.shape, x: q.x, ...(Number.isFinite(q.from) && Number.isFinite(q.to) ? { lo: Math.min(q.from!, q.to!), hi: Math.max(q.from!, q.to!) } : {}) });
      const db = q.doublet;
      if (db && Number.isFinite(db.dx) && db.dx !== 0) parts.push({ shape: q.shape, x: q.x + db.dx, of: parts.length - 1, dx: db.dx, ratio: Number.isFinite(db.ratio) && db.ratio > 0 ? db.ratio : 0.5 });
    }
    let base = fixed;
    let comps: number[][] = [];
    let env: number[] | null = null;
    let resid: number[] | null = null;
    let r2 = NaN;
    const runRows: typeof rows = [];
    if (d.fit && parts.length) {
      const shapes = parts.map((q) => q.shape);
      const model = peaksModel(shapes, fitted ? (d.baseline as 'constant' | 'linear' | 'quadratic') : 'none');
      const nb = baseParams(fitted ? (d.baseline as 'constant' | 'linear' | 'quadratic') : 'none');
      // the starts: the baseline from the ends, every peak where it is on the list, its height and width there
      const span = X[X.length - 1] - X[0] || 1;
      const sl = (start[start.length - 1] - start[0]) / span;
      const starts: number[] = [start[0] + sl * (xref - X[0]), sl, 0].slice(0, nb);
      // the width every peak starts from: its centre is kept within 3 of them of its place, its width under 10 of them (and half the range)
      const startW: number[] = [];
      parts.forEach((q) => {
        const i = X.reduce((b, v, j) => (Math.abs(v - q.x) < Math.abs(X[b] - q.x) ? j : b), 0);
        let w = fwhmAt(X, z0, i);
        if (!(w > 0) || w > span / 2) w = span / 20;
        startW.push(w);
        const A = z0[i] || (maxOf(z0) - minOf(z0)) / 10 || 1;
        starts.push(...shapeStarts(q.shape, A, q.x, w));
      });
      const specs: FitParamSpec[] = model.params.map((q, j) => ({ name: q.name, value: starts[j], fixed: false, min: q.kind === 'x' ? X[0] : q.kind === 'ratio' || q.kind === 'fraction' ? 0 : NaN, max: q.kind === 'x' ? X[X.length - 1] : q.kind === 'ratio' || q.kind === 'fraction' ? 1 : NaN, shared: false }));
      // a doublet's partner: A = ratio·A, xc = xc + dx, the width (and the shape's other parameter) the same
      const offs0: number[] = [];
      shapes.reduce((o, sh) => (offs0.push(o), o + shapeSize(sh)), nb);
      // a peak stays near its place and does not grow into the background
      parts.forEach((c, j) => {
        const o = offs0[j];
        // in its region when it has one
        specs[o + 1].min = c.lo !== undefined ? c.lo : Math.max(X[0], c.x - 3 * startW[j]);
        specs[o + 1].max = c.hi !== undefined ? c.hi : Math.min(X[X.length - 1], c.x + 3 * startW[j]);
        specs[o + 2].max = Math.min(span / 2, 10 * startW[j]);
        if (c.shape === 'voigtx') specs[o + 3].max = Math.min(span / 2, 10 * startW[j]);
      });
      parts.forEach((c, j) => {
        if (c.of === undefined) return;
        const [a, b] = [offs0[c.of], offs0[j]];
        const nm = (i: number) => model.params[i].name;
        specs[b].link = `${c.ratio} * ${nm(a)}`;
        specs[b + 1].link = `${nm(a + 1)} ${c.dx! < 0 ? '-' : '+'} ${Math.abs(c.dx!)}`;
        for (let i = 2; i < shapeSize(c.shape); i++) specs[b + i].link = nm(a + i);
      });
      const fy = Y.map((v, i) => v - fixed[i]);
      const res = runFits(model, specs, [{ label: y.name, value: k + 1, xs: X, ys: fy, sig: X.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref } });
      warnings.push(...res.warnings);
      const rr = res.runs[0];
      if (rr) {
        const p = rr.params.map((q) => q.value);
        const err = rr.params.map((q) => q.error);
        const offs: number[] = [];
        let o = nb;
        shapes.forEach((sh) => {
          offs.push(o);
          o += shapeSize(sh);
        });
        const fb = X.map((x) => {
          const dd = x - xref;
          return (nb > 0 ? p[0] : 0) + (nb > 1 ? p[1] * dd : 0) + (nb > 2 ? p[2] * dd * dd : 0);
        });
        base = X.map((_, i) => fixed[i] + fb[i]);
        comps = shapes.map((sh, j) => X.map((x) => peakAt(sh, x, p, offs[j])));
        env = X.map((_, i) => base[i] + comps.reduce((a, q) => a + q[i], 0));
        resid = Y.map((v, i) => v - env![i]);
        r2 = rr.stats.r2;
        const ms = shapes.map((sh, j) => fittedPeak(sh, p, offs[j], X));
        const total = ms.reduce((a, q) => a + Math.abs(q.area), 0) || 1;
        ms.forEach((q, j) => runRows.push({ run: k, label: y.name, k: j + 1, of: parts[j].of !== undefined ? parts[j].of! + 1 : NaN, shape: shapes[j], center: q.x, centerErr: err[offs[j] + 1], height: q.height, fwhm: q.fwhm, fwhmErr: shapes[j] === 'fano' || shapes[j] === 'ds' || shapes[j] === 'voigtx' ? NaN : err[offs[j] + 2], area: q.area, pct: (100 * Math.abs(q.area)) / total, gauss: shapes[j] === 'voigt' ? 100 * (1 - p[offs[j] + 3]) : NaN, gaussErr: shapes[j] === 'voigt' ? 100 * err[offs[j] + 3] : NaN, centroid: NaN, from: NaN, to: NaN, r2 }));
      }
    } else if (parts.length) {
      // measured on the data over its baseline
      const z = Y.map((v, i) => v - base[i]);
      const ms = measurePeaks(X, z, parts.map((q) => q.x));
      const total = ms.reduce((a, q) => a + Math.abs(q.area), 0) || 1;
      ms.forEach((q, j) => runRows.push({ run: k, label: y.name, k: j + 1, of: parts[j].of !== undefined ? parts[j].of! + 1 : NaN, shape: '', center: q.x, centerErr: NaN, height: q.height, fwhm: q.fwhm, fwhmErr: NaN, area: q.area, pct: (100 * Math.abs(q.area)) / total, gauss: NaN, gaussErr: NaN, centroid: q.centroid, from: q.from, to: q.to, r2: NaN }));
    }
    rows.push(...runRows);
    table.push(runRows.map((q) => ({ center: q.center, height: q.height, fwhm: q.fwhm, area: q.area, pct: q.pct, ...(Number.isFinite(q.gauss) ? { gauss: q.gauss, gaussErr: q.gaussErr } : {}), ...(Number.isFinite(q.of) ? { of: q.of } : {}) })));
    const marks = runRows.map((q) => {
      const i = X.reduce((b, v, j) => (Math.abs(v - q.center) < Math.abs(X[b] - q.center) ? j : b), 0);
      return { x: q.center, y: base[i] + (comps.length ? comps[q.k - 1][i] : Y[i] - base[i]) };
    });
    runs.push({ x: X, y: Y, base, comps: comps.map((q) => q.map((v, i) => v + base[i])), env, resid, marks, found, r2 });
    // the outputs: on the points of the run
    const F = (a: number[]) => Float64Array.from(a);
    const sub = d.subtract;
    dataCols.push({ ...column(`${xc.name}${tag}`, F(X)), role: 'x' });
    dataCols.push({ ...column(sub ? `${y.name} − baseline` : y.name, F(Y.map((v, i) => (sub ? v - base[i] : v)))), role: 'y', ...(y.key ? { key: y.key } : {}) });
    if (!sub) dataCols.push({ ...column(`baseline${tag}`, F(base)), role: 'y' });
    comps.forEach((q, j) => dataCols.push({ ...column(`peak ${j + 1}${tag}`, F(q.map((v, i) => (sub ? v : v + base[i])))), role: 'y' }));
    if (env) dataCols.push({ ...column(`envelope${tag}`, F(env.map((v, i) => (sub ? v - base[i] : v)))), role: 'y' });
    baseCols.push({ ...column(`${xc.name}${tag}`, F(X)), role: 'x' }, { ...column(`baseline${tag}`, F(base)), role: 'y' });
    if (resid) residCols.push({ ...column(`${xc.name}${tag}`, F(X)), role: 'x' }, { ...column(`residuals${tag}`, F(resid)), role: 'y' });
  });
  if (!runs.length) return { errors: ['No run with enough points.', ...warnings], view: { available } };
  const num = (name: string, f: (r: (typeof rows)[number]) => number, role: Column['role'] = 'none'): Column => ({ ...column(name, Float64Array.from(rows, f)), role });
  const fitOn = d.fit && rows.some((r) => r.shape);
  const tcols: Column[] = [
    ...(many ? [{ ...column(rk.name || 'Y column', Float64Array.from(rows, (r) => rk.value(Ys[r.run], r.run)), rk.name ? undefined : rows.map((r) => r.label)), role: 'x' as const }] : []),
    num('peak', (r) => r.k, many ? 'none' : 'x'),
    ...(rows.some((r) => Number.isFinite(r.of)) ? [num('doublet of', (r) => r.of)] : []),
    ...(fitOn ? [{ ...column('shape', Float64Array.from(rows, () => NaN), rows.map((r) => (r.shape ? SHAPE_NAMES[r.shape] : ''))), role: 'label' as const }] : []),
    num('center', (r) => r.center, 'y'),
    ...(fitOn ? [num('center error', (r) => r.centerErr, 'yerr')] : []),
    num('height', (r) => r.height),
    num('FWHM', (r) => r.fwhm),
    ...(fitOn ? [num('FWHM error', (r) => r.fwhmErr)] : []),
    num('area', (r) => r.area),
    num('area %', (r) => r.pct),
    ...(rows.some((r) => r.shape === 'voigt') ? [num('% Gaussian', (r) => r.gauss), num('% Gaussian error', (r) => r.gaussErr), num('% Lorentzian', (r) => 100 - r.gauss)] : []),
    ...(fitOn ? [num('R²', (r) => r.r2)] : [num('centroid', (r) => r.centroid), num('from', (r) => r.from), num('to', (r) => r.to)]),
  ];
  const outputs: Record<string, Value> = {
    out: { t: 'dataset', v: { name: `${v.v.name} peaks`, columns: dataCols } },
    table: { t: 'dataset', v: { name: 'peaks', columns: tcols } },
    base: { t: 'dataset', v: { name: 'baseline', columns: baseCols } },
    resid: { t: 'dataset', v: { name: 'residuals', columns: residCols } },
  };
  if (runState === 'never') warnings.push('Not fitted yet: press Run analysis (until then the peaks are measured on the data).');
  if (runState === 'changed') warnings.push('The settings changed since the last Run: press Run analysis again (until then the peaks are measured on the data).');
  return { outputs, warnings: [...new Set(warnings)], view: { available, peaks: { ...(runState ? { run: runState } : {}), labels: Ys.map((y) => y.name), runs, xName: (xOf(Ys[0]) ?? rowIndex(0)).name, yNames: Ys.map((y) => y.name), table } } };
}

// Pick points: every Y column (with its X) read by the rules; a row per point (long) or per Y (wide). The place found
// is a fractional row: the other columns of the table are read there too (one Y).
function pickNode(d: PickData, v: Value | undefined): Out {
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (X and Y from the designations, or chosen) or the data of a Plot curve.' } };
  let Xs: (Column | undefined)[] = [];
  let Ys: Column[] = [];
  let others: Column[] = [];
  let available: NodeView['available'];
  {
    const cols = v.v.columns;
    available = cols.map(colInfo);
    if (d.ys.trim()) {
      const p = pick(d.ys, cols.map((c) => c.name), true);
      if (p.missing.length) return { errors: [`Columns: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`], view: { available } };
      Ys = p.found.map((j) => cols[j]);
    } else Ys = cols.filter((_, j) => roleOf(cols, j) === 'y');
    const roles = curvesByRole(cols).curves;
    if (d.x && d.x !== '-' && !findColumn(cols, d.x)) return { errors: [`No column “${d.x}” in the dataset.`], view: { available } };
    const xOf = (y: Column) => (d.x === '-' ? undefined : findColumn(cols, d.x || (roles.find((c) => findColumn(cols, c.y) === y)?.x ?? roles[0]?.x ?? '')));
    Ys = Ys.filter((y) => xOf(y) !== y);
    Xs = Ys.map(xOf);
    others = cols;
  }
  if (!Ys.length) return { view: { available, waiting: 'Choose the Y columns (or designate them Y in the worksheet).' } };
  if (!d.rules.length) return { view: { available, waiting: 'Add a rule (at X = …, at Y = …, maximum, minimum, rows where …).' } };
  const n = maxOf(Ys.map((c) => c.values.length));
  const XsOk = Ys.map((y, k) => Xs[k] ?? rowIndex(y.values.length));
  const warnings: string[] = [];
  type Run = { label: string; value: number; y: Column; slot: number; rows: number[] };
  const every = Array.from({ length: n }, (_, i) => i);
  const rk = runsKey(Ys);
  const runs: Run[] = Ys.map((y, k) => ({ label: y.name, value: rk.value(y, k), y, slot: k, rows: every }));
  const runName = rk.name || (Ys.length > 1 ? 'Y' : 'run');
  // one table: its other columns read at every point (with several Y columns their rows are not the same thing)
  // (only the ones asked: none, all, or a list)
  const one = Ys.length === 1 && v.t === 'dataset';
  const also = (d.others ?? 'all').trim() || 'none';
  let asked = others;
  if (also === 'none') asked = [];
  else if (also !== 'all') {
    const p = pick(also, others.map((c) => c.name), true);
    if (p.missing.length) warnings.push(`Also read: no ${p.missing.map((m) => `“${m}”`).join(', ')} in the dataset.`);
    asked = p.found.map((j) => others[j]);
  }
  const extra = one ? asked.filter((c) => c !== Ys[0] && c !== XsOk[0] && !c.text) : [];
  if (!one && also !== 'none' && d.others) warnings.push('Also read: only with one Y column (with several, the rows of the other columns are not those of each curve).');
  const letters: Record<string, ArrayLike<number>> = {};
  if (v.t === 'dataset') v.v.columns.forEach((c, j) => (letters[columnLetter(j)] = c.values));
  type Row = { run: Run; p: Picked; kind: PickKind };
  const got: Row[] = [];
  const errors: string[] = [];
  for (const run of runs) {
    const xv = XsOk[run.slot].values;
    const yv = run.y.values;
    const mask = maskOf([XsOk[run.slot], run.y], n);
    const rows = run.rows.filter((i) => Number.isFinite(xv[i]) && Number.isFinite(yv[i]) && !mask?.[i]);
    const r = pickPoints(xv, yv, rows, d.rules, d, letters);
    errors.push(...r.errors);
    for (const p of r.points) {
      const k: PickKind = p.kind ?? (p.rule.startsWith('x =') ? 'x' : p.rule.startsWith('y =') ? 'y' : p.rule.startsWith('max') ? 'max' : p.rule.startsWith('min') ? 'min' : 'where');
      got.push({ run, p, kind: k });
    }
  }
  const xName = new Set(XsOk.map((c) => c.name)).size === 1 ? XsOk[0].name : 'X';
  const yName = Ys.length === 1 ? Ys[0].name : 'Y';
  const pickGraph: PickGraph = {
    xName,
    yName,
    curves: runs.map((run) => ({ name: run.label, x: XsOk[run.slot].values, y: run.y.values })),
    points: got.map((g) => ({
      x: g.p.x,
      y: g.p.y,
      at: g.p.at,
      rule: g.p.rule,
      kind: g.kind,
    })),
  };
  if (errors.length) return { errors: [...new Set(errors)], view: { available, pick: pickGraph } };
  if (!got.length) warnings.push('No point found by the rules.');
  const read = (c: Column, p: Picked) => (p.a < c.values.length && p.b < c.values.length ? c.values[p.a] + (c.values[p.b] - c.values[p.a]) * p.t : NaN);
  const key = (p: Picked) => p.rule;

  function buildDataset(name: string, pts: Row[], catKind?: string): Dataset {
    let columns: Column[];
    if (d.layout === 'wide') {
      // a row per run; a column per point (its occurrence on the run: #2 …) — Y, and X when the rule finds X
      const keys: string[] = [];
      const per = runs.map((run) => {
        const m = new Map<string, Picked>();
        const count = new Map<string, number>();
        for (const g of pts.filter((q) => q.run === run)) {
          const kk = key(g.p);
          const c = (count.get(kk) ?? 0) + 1;
          count.set(kk, c);
          const full = c > 1 ? `${kk} #${c}` : kk;
          m.set(full, g.p);
          if (!keys.includes(full)) keys.push(full);
        }
        return m;
      });
      columns = [{ ...column(runName, Float64Array.from(runs, (r) => r.value), rk.name ? undefined : runs.map((r) => r.label)), role: 'x' }];
      for (const kk of keys) {
        const sample = per.find((m) => m.has(kk))!.get(kk)!;
        if (!sample.rule.startsWith('x =')) columns.push({ ...column(`${xName} @ ${kk}`, Float64Array.from(per, (m) => m.get(kk)?.x ?? NaN)), role: 'y' });
        columns.push({ ...column(`${yName} @ ${kk}`, Float64Array.from(per, (m) => m.get(kk)?.y ?? NaN)), role: 'y' });
      }
    } else {
      columns = [
        { ...column(runName, Float64Array.from(pts, (g) => g.run.value), rk.name ? undefined : pts.map((g) => g.run.label)), role: 'x' },
        { ...column('pick', Float64Array.from(pts, () => NaN), pts.map((g) => key(g.p))), role: 'label' },
        // the value the rule asked for (at X = 0.5: 0.5)
        { ...column('at', Float64Array.from(pts, (g) => g.p.at)), role: 'none' },
        { ...column('row', Float64Array.from(pts, (g) => +(g.p.a + 1 + (g.p.b - g.p.a) * g.p.t).toFixed(4))), role: 'none' },
        { ...column(xName, Float64Array.from(pts, (g) => g.p.x)), role: catKind === 'y' ? 'y' : 'none' },
        { ...column(yName, Float64Array.from(pts, (g) => g.p.y)), role: catKind === 'y' ? 'none' : 'y' },
        ...extra.map((c) => ({ ...column(c.name, Float64Array.from(pts, (g) => read(c, g.p))), role: 'none' as const })),
      ];
    }
    return { name, columns };
  }

  let sheets: Dataset[];
  if (d.sheetsMode === 'one') {
    sheets = [buildDataset(`picked from ${v.v.name}`, got)];
  } else if (d.sheetsMode === 'all') {
    const categories: { kind: string; name: string }[] = [];
    for (const r of d.rules) {
      const cat = r.kind === 'x' ? 'at X' : r.kind === 'y' ? 'at Y' : r.kind === 'max' || r.kind === 'min' ? 'extrema' : 'where';
      if (!categories.some((c) => c.name === cat)) categories.push({ kind: r.kind, name: cat });
    }
    if (!categories.length) categories.push({ kind: 'x', name: 'picked' });
    sheets = categories.map((cat) => {
      const match = got.filter((g) => (cat.name === 'at X' ? g.kind === 'x' : cat.name === 'at Y' ? g.kind === 'y' : cat.name === 'extrema' ? g.kind === 'max' || g.kind === 'min' : g.kind === 'where'));
      return buildDataset(cat.name, match, cat.kind);
    });
  } else {
    // 'auto': separate sheets for X readings and Y readings
    const hasX = d.rules.some((r) => r.kind === 'x');
    const hasExtrema = d.rules.some((r) => r.kind === 'max' || r.kind === 'min');
    const order: ('x' | 'y')[] = [];
    for (const r of d.rules) {
      const side = r.kind === 'y' ? 'y' : 'x';
      if (!order.includes(side)) order.push(side);
    }
    if (!order.length) order.push('x');
    sheets = order.map((side) => {
      const isY = side === 'y';
      const name = isY ? 'at Y' : hasX ? 'at X' : hasExtrema ? 'extrema' : 'where';
      const match = got.filter((g) => (isY ? g.kind === 'y' : g.kind !== 'y'));
      return buildDataset(name, match, isY ? 'y' : 'x');
    });
  }
  // one sheet: named as before (the points picked from the data)
  if (sheets.length === 1) sheets[0] = { ...sheets[0], name: `picked from ${v.v.name}` };
  const activeIndex = Math.min(Math.max(0, d.sheetOut ?? 0), Math.max(0, sheets.length - 1));
  const activeSheet = sheets[activeIndex] ?? sheets[0];
  return {
    outputs: {
      out: { t: 'dataset', v: activeSheet },
      book: { t: 'workbook', v: { name: `picked from ${v.v.name}`, sheets } },
    },
    warnings,
    view: { available, pick: pickGraph },
  };
}

// ---- Equivalent circuit (EIS): the fit, the Nyquist, |Z|, phase and Bode figures, the circuit's figure, the tables ----
export type EisView = {
  pts: EisPoints;
  curve: { f: number[]; re: number[]; im: number[] };
  params: { name: string; value: number; se: number; unit: string; fixed: boolean }[];
  starts: { name: string; value: number; fixed?: boolean }[]; // the starts used (stored or guessed)
  cols: { freq: string; a: string; b: string }; // the columns used (chosen or guessed): their keys (a name, or #k)
  colNames: [string, string][]; // every column: its key and how it is shown (its letter and name)
  valueTexts: { id: string; x: number; y: number }[]; // the fitted values on the circuit's figure, where they are drawn
  by: { freq: 'name' | 'place' | 'chosen'; a: 'name' | 'place' | 'chosen'; b: 'name' | 'place' | 'chosen' }; // how
  angular: boolean; // the frequencies look like ω (2πf) while read as Hz
  preview: { freq: number[]; a: number[]; b: number[] }; // the first values of each column used
  signNote: string;
  chi2: number;
  redChi2: number;
  r2: { all: number; re: number; im: number };
  n: number;
  circuit?: Figure; // the circuit drawn (its figure)
  use: boolean[]; // the points fitted (in a range, not left out); in a range
  inRange: boolean[];
  // the fits per range (with their curves), the fit on demand: not done yet, or done with other settings
  rangeFits: { range: EisRangeSpec; circuit: string; params?: { name: string; value: number; se: number; unit: string }[]; r2?: number; n?: number; error?: string; curve?: { f: number[]; re: number[]; im: number[] } }[];
  fittedYet: boolean;
  outdated: boolean;
};
function eisNode(id: string, d: EisData, v: Value | undefined): Out {
  if (v?.t !== 'dataset') return { view: { waiting: 'Connect the impedance spectrum: a dataset (or a sheet of a workbook) with the frequency, Z′ and Z″ (or |Z| and the phase).' } };
  const available = v.v.columns.map(colInfo);
  const r = runEis(v.v, d);
  if (typeof r === 'string') return { errors: [r], view: { available } };
  const { pts, curve } = r;
  const warnings: string[] = [...r.warnings];
  // the circuit drawn, on a white or transparent page of its own size
  const values = Object.fromEntries(r.result.params.map((q) => [q.name, q.value]));
  const dr = drawCircuit(r.result.tree, d.circuitValues ? values : undefined);
  const ink = '#000000';
  const items: AnnotationItem[] = [
    ...dr.pieces.map((q, k): AnnotationItem => ({ id: `eis-c${k}`, locked: true, type: 'shape', spec: { ...SHAPE_DEFAULTS, kind: 'path', coords: 'data', d: q.d, color: ink, width: 0.75, fill: '', join: 'round', cap: 'round', head1: 'none', head2: 'none' } })),
    ...dr.texts.map((q, k): AnnotationItem => {
      const spec = { ...TEXT_SPEC_DEFAULTS, coords: 'data' as const, text: q.text, x: q.x, y: q.y, anchor: q.anchor, style: { size: q.size, color: ink } };
      if (!q.value) return { id: `eis-t${k}`, locked: true, type: 'text', spec };
      // the fitted values: where they were moved (and their look changed) on the figure — not locked
      const own = d.annotations?.find((it) => it.id === `eis-v-${q.value}`);
      return { id: `eis-v-${q.value}`, type: 'text', spec: { ...spec, ...(own?.type === 'text' ? own.spec : {}), text: q.text } };
    }),
  ];
  // (its node the EIS node: a value dragged on the figure is kept there)
  const circuit = drawingFigure(id, { ...DRAWING_DEFAULTS, name: 'circuit', ...d.circuitPage, width: dr.w, height: dr.h, unit: 'mm', background: d.circuitBg ?? 'white', annotations: items });
  const g = guessColumns(v.v.columns, d.form);
  const view: EisView = {
    pts,
    curve,
    params: r.result.params,
    starts: r.result.params.map((q) => d.params.find((s) => s.name === q.name) ?? { name: q.name, value: NaN }),
    cols: { freq: colKey(v.v.columns, r.cols.freq), a: colKey(v.v.columns, r.cols.a), b: colKey(v.v.columns, r.cols.b) },
    colNames: v.v.columns.map((c) => [colKey(v.v.columns, c), colLabel(v.v.columns, c)] as [string, string]),
    valueTexts: dr.texts.flatMap((q) => (q.value ? [{ id: `eis-v-${q.value}`, x: q.x, y: q.y }] : [])),
    by: { freq: d.freq ? 'chosen' : g.by.freq, a: d.re ? 'chosen' : g.by.a, b: d.im ? 'chosen' : g.by.b },
    angular: d.freqUnit !== 'rad/s' && looksAngular(r.cols.freq.values),
    preview: { freq: Array.from(r.cols.freq.values.slice(0, 4)), a: Array.from(r.cols.a.values.slice(0, 4)), b: Array.from(r.cols.b.values.slice(0, 4)) },
    signNote: r.signNote,
    chi2: r.result.chi2,
    redChi2: r.result.redChi2,
    r2: r.result.r2,
    n: r.result.n,
    circuit,
    use: r.use,
    inRange: r.inRange,
    rangeFits: r.rangeFits.map((rf) => ({ range: rf.range, circuit: rf.circuit, ...(rf.result ? { params: rf.result.params, r2: rf.result.r2.all, n: rf.result.n } : {}), ...(rf.error ? { error: rf.error } : {}), ...(rf.curve ? { curve: rf.curve } : {}) })),
    fittedYet: r.fittedYet,
    outdated: r.outdated,
  };
  return {
    outputs: {
      parameters: { t: 'dataset', v: r.parameters },
      fitted: { t: 'dataset', v: r.fitted },
      curve: { t: 'dataset', v: fitCurve(curve) },
      circuit: { t: 'figure', v: circuit },
      ranges: { t: 'dataset', v: r.ranges },
    },
    warnings,
    view: { available, eis: view, report: r.summary },
  };
}

// Columns on every sheet of a workbook: the same settings for all, or each sheet its own (else the common ones); a
// workbook out, the names of the first sheet; the list shown: of the sheet being edited
const columnsHeadOf = (ds: Dataset) => {
  const cell = (c: Column, i: number) => c.text?.[i]?.trim() || (Number.isFinite(c.values[i]) ? fmtNum(c.values[i], 6) : '');
  const nHead = Math.min(8, Math.max(0, maxOf(ds.columns.map((c) => c.values.length))));
  return { names: ds.columns.map((c) => c.name), rows: Array.from({ length: nHead }, (_, i) => ds.columns.map((c) => cell(c, i))) };
};
function columnsEverySheet(book: Workbook, d: ColumnsData, vals: Record<string, Column | Scalar>, ins: MathInput[]): Out {
  const { sheet: _s, perSheet, sheets: own, editSheet, ...common } = d;
  const specOf = (name: string): ColumnsSpec => (perSheet === 'own' ? (own?.[name] ?? common) : common);
  const edited = book.sheets.find((q) => q.name === editSheet) ?? book.sheets[0];
  if (!edited) return { errors: ['The workbook has no sheets.'], view: { inputs: ins } };
  const warnings: string[] = [];
  const out: Dataset[] = [];
  let shown: ReturnType<typeof columnsOf> | null = null;
  let names: Column | undefined;
  for (const q of book.sheets) {
    const r = columnsOf(q, specOf(q.name), vals);
    if (q === edited) shown = r;
    if (typeof r === 'string') {
      warnings.push(`Sheet “${q.name}”: ${r}`);
      out.push(q);
      continue;
    }
    names ??= r.names;
    warnings.push(...r.warnings.map((w) => `Sheet “${q.name}”: ${w}`));
    out.push({ ...r.dataset, name: q.name });
  }
  const columnsHead = columnsHeadOf(edited);
  const view = { inputs: ins, columnsHead, ...(shown && typeof shown !== 'string' ? { available: shown.dataset.columns.map(colInfo), columnLines: shown.lines } : { available: edited.columns.map(colInfo) }) };
  return { outputs: { out: { t: 'workbook', v: { ...book, sheets: out } }, ...(names ? { names: { t: 'column', v: names } } : {}) }, warnings, view };
}

function evalNode(n: AppNode, inputs: Inputs): Out {
  const one = (h: string) => inputs.get(h)?.[0]?.value;
  const all = (h: string) => (inputs.get(h) ?? []).map((i) => i.value).filter((v): v is Value => !!v);
  const col = (h: string) => {
    const v = one(h);
    return v?.t === 'column' ? v.v : undefined;
  };
  switch (n.type) {
    case 'import': {
      const d = n.data;
      if (d.sheets?.length) {
        // a workbook: every sheet read with the same header settings (spreadsheet sheets: tab-separated, decimal point)
        const name = d.name || d.fileName.replace(/\.[^.]+$/, '') || 'workbook';
        const warnings: string[] = [];
        let shown: { csv: CsvResult; map: SheetMap } | null = null;
        const k = Math.min(d.sheets.length - 1, Math.max(0, Math.floor(d.sheet ?? 0)));
        const sheets = d.sheets.map((s, j) => {
          const r = readTable(s.text, s.excel ? { ...d.csv, delimiter: '\t', decimal: '.' } : d.csv, s.name, s.name);
          const { dataset, map } = applySheet(r.dataset, d.sheetEdits?.[s.name], r.decimal);
          if (j === k) shown = { csv: r, map };
          warnings.push(...r.warnings.map((w) => `${s.name}: ${w}`));
          return { ...dataset, name: s.name };
        });
        const sh = shown as { csv: CsvResult; map: SheetMap } | null;
        return {
          outputs: { out: { t: 'dataset', v: sheets[k] }, book: { t: 'workbook', v: { name, sheets } } },
          warnings,
          view: { ...(sh ? { csv: sh.csv, sheet: sh.map } : {}), sheets: d.sheets.map((s) => s.name) },
        };
      }
      if (!d.text && !hasEdits(d.edits)) return { view: { waiting: 'Open a file (CSV, text, .xlsx, .xls, .ods — several at once make a workbook), drop it on the node, paste a table, or start an empty table.' } };
      const name = d.name || d.fileName.replace(/\.[^.]+$/, '') || 'data';
      const r = d.text ? readTable(d.text, d.csv, name, d.fileName) : null;
      // the worksheet: the changes made by hand, over the table as read
      const { dataset, map } = applySheet(r?.dataset ?? { name, columns: [] }, d.edits, r?.decimal ?? (d.csv.decimal === ',' ? ',' : '.'));
      return { outputs: { out: { t: 'dataset', v: dataset } }, warnings: r?.warnings ?? [], view: { ...(r ? { csv: r } : {}), sheet: map } };
    }
    case 'book': {
      // its own sheets (typed or pasted), then the sheets of its inputs A, B, C …: columns and datasets on the sheet
      // chosen for each (side by side), the sheets of a workbook as they are
      const own = n.data.sheets ?? [];
      const ins: NonNullable<NodeView['book']>['ins'] = [];
      const fromIns: Dataset[] = [];
      const onSheet = new Map<string, Column[]>();
      const ports = [...inputs.keys()].flatMap((h) => {
        const m = /^in-(\d+)$/.exec(h);
        return m ? [Number(m[1])] : [];
      });
      // an input with no sheet named goes to the first sheet (Sheet1)
      const firstSheet = own[0]?.name || 'inputs';
      for (const p of ports.sort((a, b) => a - b)) {
        const v = one(`in-${p}`);
        const letter = columnLetter(p);
        const sheet = n.data.into?.[p]?.trim() || firstSheet;
        if (v?.t === 'workbook') {
          fromIns.push(...v.v.sheets);
          ins.push({ letter, kind: 'workbook', name: v.v.name, sheet: '' });
        } else if (v?.t === 'dataset' || v?.t === 'column') {
          if (!onSheet.has(sheet)) onSheet.set(sheet, []);
          onSheet.get(sheet)!.push(...(v.t === 'dataset' ? v.v.columns : [v.v]));
          ins.push({ letter, kind: v.t, name: v.v.name, sheet });
        }
      }
      // the inputs given a sheet of its own go on it; the others make sheets after them
      const ownNames = new Set(own.map((s) => s.name));
      for (const [name, cols] of onSheet) if (!ownNames.has(name)) fromIns.push({ name, columns: sideBySide(cols) });
      // the inputs' sheets named (a name used twice: “name (2)”), those taken out of the workbook left out
      const used = new Set(own.map((s) => s.name));
      const gone = new Set(n.data.hideSheets ?? []);
      const named = fromIns.map((s) => {
        let nm = s.name || 'inputs';
        for (let c = 2; used.has(nm); c++) nm = `${s.name || 'inputs'} (${c})`;
        used.add(nm);
        return { ...s, name: nm };
      });
      const hiddenSheets = named.filter((s) => gone.has(s.name)).map((s) => s.name);
      const inSheets = named.filter((s) => !gone.has(s.name));
      if (!own.length && !inSheets.length) return { view: { waiting: hiddenSheets.length ? 'Every sheet of the inputs is taken out: show them again (Show hidden sheets)' : 'Add a sheet (+), or connect columns / datasets to A, B …', book: { own: 0, ins, ...(hiddenSheets.length ? { hiddenSheets } : {}) } } };
      const total = own.length + inSheets.length;
      const k = Math.min(total - 1, Math.max(0, Math.floor(n.data.sheet ?? 0)));
      // the designations given in the node to the columns of the inputs, by the sheet's and the column's names
      const withRoles = (sheet: string, cols: Column[]) => {
        const roles = n.data.roles?.[sheet];
        return roles ? cols.map((c) => (roles[c.name] && roles[c.name] !== c.role ? { ...c, role: roles[c.name] } : c)) : cols;
      };
      // the columns of a sheet with inputs, each with its key (o3: the column of its own table read 4th; i:name: an
      // input's), arranged as set in the node: the inputs' left out, the order moved by hand (the others after, as they come)
      type Keyed = { key: string; col: Column };
      const arrange = (sheet: string, list: Keyed[]) => {
        const l = n.data.layout?.[sheet];
        const hide = new Set(l?.hide ?? []);
        const pos = new Map((l?.order ?? []).map((q, i) => [q, i]));
        const shown = list.map((e, i) => ({ e, at: pos.get(e.key) ?? 1e9 + i })).filter(({ e }) => !hide.has(e.key));
        shown.sort((p, q) => p.at - q.at);
        const columns = sideBySide(shown.map(({ e }) => e.col));
        return { columns, keys: shown.map(({ e }) => e.key) };
      };
      const inputKeyed = (sheet: string, cols: Column[]): Keyed[] => withRoles(sheet, sideBySide(cols)).map((col) => ({ key: `i:${col.name}`, col }));
      let map: SheetMap | undefined;
      let keys: string[] | undefined;
      const kinds: ('own' | 'input' | 'mixed')[] = [];
      const sheets = own.map((s, j) => {
        const r = applySheet(readSheet(s.text, s.name), s.edits, '.');
        const got = onSheet.get(s.name);
        if (!got) {
          kinds.push('own');
          if (j === k) map = r.map;
          return { ...r.dataset, name: s.name };
        }
        const inCols = inputKeyed(s.name, got);
        // an empty sheet (nothing typed, pasted or added among the inputs) shows the inputs; a table of its own gets them
        // at its right (or where they were moved)
        const ownUsed = !!s.text || Object.keys(s.edits?.cells ?? {}).length > 0 || (n.data.layout?.[s.name]?.order ?? []).some((q) => /^o\d+$/.test(q));
        const ownCols: Keyed[] = ownUsed ? r.dataset.columns.map((col, i) => ({ key: `o${r.map.cols[i]}`, col })) : [];
        kinds.push(ownUsed ? 'mixed' : 'input');
        const out = arrange(s.name, [...ownCols, ...inCols]);
        if (j === k) {
          keys = out.keys;
          if (ownUsed) map = r.map;
        }
        return { name: s.name, columns: out.columns };
      });
      for (const s of inSheets) {
        const nm = s.name;
        const out = arrange(nm, inputKeyed(nm, s.columns));
        if (sheets.length === k) keys = out.keys;
        kinds.push('input');
        sheets.push({ ...s, name: nm, columns: out.columns });
      }
      return { outputs: { out: { t: 'dataset', v: sheets[k] }, book: { t: 'workbook', v: { name: n.data.name || 'Book', sheets } } }, view: { sheets: sheets.map((s) => s.name), book: { own: own.length, ins, kinds, ...(keys ? { keys } : {}), ...(hiddenSheets.length ? { hiddenSheets } : {}) }, ...(map ? { sheet: map } : {}) } };
    }
    case 'extract': {
      const v = one('in');
      if (v?.t !== 'dataset' && v?.t !== 'workbook') return { view: { waiting: 'Connect a dataset (Import, Combine columns …) or a workbook.' } };
      // from a workbook: the sheet chosen by its name (the first when none is)
      let ds: Dataset;
      let sheets: string[] | undefined;
      if (v.t === 'workbook') {
        sheets = v.v.sheets.map((s) => s.name);
        const s = n.data.sheet ? v.v.sheets.find((x) => x.name === n.data.sheet) : v.v.sheets[0];
        if (!s) return { errors: [`No sheet “${n.data.sheet}” in the workbook.`], view: { sheets } };
        ds = s;
      } else ds = v.v;
      const cols = ds.columns;
      const available = cols.map(colInfo);
      if (!cols.length) return { errors: ['The dataset has no columns.'], view: { available, sheets } };
      const { column: name, index } = n.data;
      const c = !name ? cols[0] : cols[index]?.name === name ? cols[index] : findColumn(cols, name);
      if (!c) return { errors: [`No column “${name}” in the ${sheets ? 'sheet' : 'dataset'}.`], view: { available, sheets } };
      if (n.data.value) {
        // one value: the row chosen (1 … n)
        const k = Math.floor(n.data.row ?? 1);
        if (!(k >= 1 && k <= c.values.length)) return { errors: [`Row ${k}: the column has ${c.values.length} row${c.values.length === 1 ? '' : 's'}.`], view: { available, sheets } };
        const warnings = c.mask?.[k - 1] ? [`Row ${k} is masked.`] : [];
        return { outputs: { out: { t: 'scalar', v: { name: c.name, value: c.values[k - 1] } } }, warnings, view: { available, sheets } };
      }
      return { outputs: { out: { t: 'column', v: c } }, view: { available, sheets } };
    }
    case 'fit':
      return fitNode(n.data, one('in'), n.id, one('irf'));
    case 'calculus':
      return calculusNode(n.data, one('in'), one('base'));
    case 'peaks':
      return peakNode(n.data, one('in'));
    case 'smooth':
    case 'interp':
    case 'normalize':
    case 'fft':
    case 'convolve': {
      const v = one('in');
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset: X and the Y columns (designated, or chosen).' } };
      const available = v.v.columns.map(colInfo);
      const r: SignalOut =
        n.type === 'smooth'
          ? smoothNode(v.v, n.data)
          : n.type === 'interp'
            ? interpNode(v.v, n.data, valuesOf(one('at'), 'x'))
            : n.type === 'normalize'
              ? normalizeNode(v.v, n.data, valuesOf(one('by'), 'y'))
              : n.type === 'fft'
                ? fftNode(v.v, n.data, unitOf)
                : convNode(v.v, n.data, valuesOf(one('kernel'), 'y'));
      if (typeof r === 'string') return { errors: [r], view: { available } };
      const outputs: Record<string, Value> = { out: { t: 'dataset', v: r.dataset } };
      for (const [k, t] of Object.entries(r.extra ?? {})) outputs[k] = { t: 'dataset', v: t };
      return { outputs, warnings: r.warnings, view: { available, signal: { labels: r.labels, plots: r.plots } } };
    }
    case 'kk': {
      const v = one('in');
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset: the frequency, Z′ and Z″ (impedance); X and R (optical); X and the part to transform (general).' } };
      const available = v.v.columns.map(colInfo);
      const r = kkNode(v.v, { ...KK_DEFAULTS, ...n.data });
      if (typeof r === 'string') return { errors: [r], view: { available } };
      return { outputs: { out: { t: 'dataset', v: r.dataset } }, warnings: r.warnings, view: { available, signal: { labels: r.labels, plots: r.plots }, report: r.report } };
    }
    case 'report': {
      const d: ReportData = { ...REPORT_DEFAULTS, ...n.data };
      const ports = [...inputs.keys()].flatMap((h) => {
        const m = /^in-(\d+)$/.exec(h);
        return m ? [Number(m[1])] : [];
      });
      const blocks: ReportBlock[] = [];
      const ins: { port: number; letter: string; title: string; kind: string }[] = [];
      for (const p of ports.sort((a, b) => a - b)) {
        const e = inputs.get(`in-${p}`)?.[0];
        const v = e?.value;
        if (!e || !v || v.t === 'figure') continue;
        const title = `${e.name ?? e.from}${e.handle !== 'out' ? ` · ${e.handle}` : ''}`;
        ins.push({ port: p, letter: columnLetter(p), title, kind: v.t });
        const item = d.items?.[p] ?? {};
        if (!item.hidden) blocks.push(reportBlock(p, title, v, item, d));
      }
      const view: NodeView = { doc: { blocks, inputs: ins } };
      if (!ins.length && !d.intro.trim() && !d.outro.trim()) return { view: { ...view, waiting: 'Connect results to A, B, C … (the parameters of a Fit, a test, statistics, values, columns): each a block of the report.' } };
      return { warnings: blocks.flatMap((b) => b.warnings), view };
    }
    case 'average': {
      const sets: { port: number; v: Dataset }[] = [];
      for (const [h, list] of inputs) {
        const m = /^in-(\d+)$/.exec(h);
        const v = list[0]?.value;
        if (m && v?.t === 'dataset') sets.push({ port: Number(m[1]), v: v.v });
      }
      sets.sort((a, b) => a.port - b.port);
      if (!sets.length) return { view: { waiting: 'Connect the datasets of the curves to A, B, C … (or one dataset with several Y).' } };
      const available = sets.flatMap((s) => s.v.columns).filter((c, j, a) => a.findIndex((o) => o.name === c.name) === j).map(colInfo);
      const r = averageNode(sets.map((s) => s.v), n.data);
      if (typeof r === 'string') return { errors: [r], view: { available } };
      return { outputs: { out: { t: 'dataset', v: r.dataset } }, warnings: r.warnings, view: { available, signal: { labels: r.labels, plots: r.plots } } };
    }
    case 'digitizer': {
      const r = digitized(n.data);
      if (typeof r === 'string') return { view: { waiting: r } };
      return { outputs: { out: { t: 'dataset', v: r.dataset } }, warnings: r.warnings };
    }
    case 'filterrows': {
      const v = one('in');
      // every sheet of a workbook: the same rules on each, a workbook out
      if (v?.t === 'workbook') {
        const sheets: Dataset[] = [];
        const report: string[] = [];
        for (const q of v.v.sheets) {
          const r = filterRows(q, n.data);
          if (typeof r === 'string') return { errors: [`${q.name}: ${r}`], view: { available: (v.v.sheets[0]?.columns ?? []).map(colInfo) } };
          sheets.push({ ...r.dataset, name: q.name });
          report.push(`${q.name}: ${r.report}`);
        }
        return { outputs: { out: { t: 'workbook', v: { name: v.v.name, sheets } } }, view: { available: (v.v.sheets[0]?.columns ?? []).map(colInfo), report } };
      }
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset or a workbook.' } };
      const available = v.v.columns.map(colInfo);
      const r = filterRows(v.v, n.data);
      if (typeof r === 'string') return { errors: [r], view: { available } };
      const of = Math.max(0, maxOf(v.v.columns.map((c) => c.values.length)));
      const used = Math.max(0, maxOf(r.dataset.columns.map((c) => c.values.length)));
      return { outputs: { out: { t: 'dataset', v: r.dataset } }, view: { available, report: [r.report], statRows: { used, of, text: r.text } } };
    }
    case 'clean': {
      const v = one('in');
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset.' } };
      const available = v.v.columns.map(colInfo);
      const r = cleanData(v.v, n.data);
      if (typeof r === 'string') return { errors: [r], view: { available } };
      return { outputs: { out: { t: 'dataset', v: r.dataset }, changes: { t: 'dataset', v: changesTable(r.changes) } }, view: { available, report: r.report } };
    }
    case 'curvemath':
      return curveMathNode(n.data, inputs);
    case 'translate': {
      // the columns of the dataset, then the columns on A, B, C … (names used twice made distinct)
      const ds = one('data');
      const ports = [...inputs.keys()].flatMap((h) => (/^in-(\d+)$/.test(h) ? [Number(h.slice(3))] : [])).sort((a, b) => a - b);
      const seen = new Set<string>();
      const named = (c: Column) => {
        let nm = c.name || 'column';
        for (let k = 2; seen.has(nm); k++) nm = `${c.name} (${k})`;
        seen.add(nm);
        return nm === c.name ? c : { ...c, name: nm };
      };
      const fromDs = ds?.t === 'dataset' ? ds.v.columns.map(named) : [];
      const fromPorts = ports.flatMap((p) => {
        const v = one(`in-${p}`);
        return v?.t === 'column' ? [named(v.v)] : [];
      });
      if (!fromDs.length && !fromPorts.length) return { view: { waiting: 'Connect a dataset, or columns to A, B, C … (designate them X / Y here).' } };
      // the columns from the ports: their own designation, else Y — the first one X when there is no X at all
      const portRole = (c: Column, k: number): ColumnRole => n.data.roles[c.name] ?? c.role ?? (k === 0 && !fromDs.some((_, j) => roleOf(fromDs, j) === 'x') ? 'x' : 'y');
      const cols = [...fromDs.map((c, j) => ({ ...c, role: n.data.roles[c.name] ?? roleOf(fromDs, j) })), ...fromPorts.map((c, k) => ({ ...c, role: portRole(c, k) }))];
      const r = translate(cols, { ...n.data, roles: {} });
      const tv = { cols: cols.map((c, j) => ({ name: c.name, role: c.role as ColumnRole, from: (j < fromDs.length ? 'dataset' : 'port') as 'dataset' | 'port' })), curves: curvesByRole(cols).curves.map((c) => c.y) };
      if (typeof r === 'string') return { errors: [r], view: { translate: tv } };
      const xName = curvesByRole(cols).curves[0]?.x ?? 'row';
      return { outputs: { out: { t: 'dataset', v: r.dataset }, shifts: { t: 'dataset', v: r.shifts } }, warnings: r.warnings, view: { translate: { ...tv, plots: r.curves, xName }, available: cols.map(colInfo) } };
    }
    case 'normality':
    case 'ttest':
    case 'anova':
    case 'nonparam':
    case 'correl': {
      const v = one('in');
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset: the groups as columns, or a value column with factor columns (indexed), or a row per subject.' } };
      const available = v.v.columns.map(colInfo);
      const r: StatOut =
        n.type === 'normality' ? normalityNode(v.v, n.data) : n.type === 'ttest' ? tTestNode(v.v, n.data) : n.type === 'anova' ? anovaNode(v.v, n.data) : n.type === 'nonparam' ? nonparNode(v.v, n.data) : corrNode(v.v, n.data);
      if (r.errors.length) return { errors: r.errors, view: { available } };
      const outputs: Record<string, Value> = Object.fromEntries(Object.entries(r.tables).map(([k, t]) => [k, { t: 'dataset', v: t } as Value]));
      return { outputs, warnings: r.warnings, view: { available, report: r.report } };
    }
    case 'pick':
      return pickNode(n.data, one('in'));
    case 'datamanip': {
      const v = one('in');
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (Import, Auto-extract …).' } };
      const available = v.v.columns.map(colInfo);
      // the columns of the graph: chosen, else from the designations (the first Y and its X)
      const byRole = curvesByRole(v.v.columns).curves[0];
      const yName = n.data.y || byRole?.y || v.v.columns[1]?.name || v.v.columns[0]?.name || '';
      // '-': the row number
      const xName = n.data.x === '-' ? '' : n.data.x || byRole?.x || (yName === v.v.columns[0]?.name ? '' : (v.v.columns[0]?.name ?? ''));
      const r = applyManip(v.v, xName, yName, n.data.ops, n.data.added ?? [], n.data.addAt ?? 'sorted');
      if (typeof r === 'string') return { errors: [r], view: { available } };
      return { outputs: { out: { t: 'dataset', v: r.dataset } }, warnings: r.warnings, view: { available, manip: { x: r.x, y: r.y, state: r.state, nIn: r.nIn, xName, yName } } };
    }
    case 'unstack': {
      const v = one('in');
      if (v?.t !== 'dataset') return { view: { waiting: 'Connect a dataset (Import …): one long table, the blocks one under the other.' } };
      const available = v.v.columns.map(colInfo);
      const r = unstack(v.v, n.data);
      if (typeof r === 'string') return { errors: [r], view: { available } };
      return { outputs: { out: { t: 'dataset', v: r.dataset }, long: { t: 'dataset', v: r.long } }, warnings: r.warnings, view: { available, blocks: { list: r.blocks, how: r.how }, ...(r.graph ? { split: r.graph } : {}) } };
    }
    case 'combine': {
      const ins: CombineInput[] = [];
      for (const [h, list] of inputs) {
        const m = /^in-(\d+)$/.exec(h);
        const v = list[0]?.value;
        if (m && v && (v.t === 'column' || v.t === 'dataset' || v.t === 'workbook')) ins.push({ port: Number(m[1]), v } as CombineInput);
      }
      ins.sort((a, b) => a.port - b.port);
      const settings = combineSettings(n.data, ins.map((x) => ({ port: x.port, kind: x.v.t, cols: x.v.t === 'column' ? 1 : x.v.t === 'dataset' ? x.v.v.columns.length : 1 })));
      // every input: its kind, size, columns (a workbook: of the sheet chosen) and sheets
      const allCols: Column[] = [];
      const combineInputs = ins.map((x) => {
        const sheets = x.v.t === 'workbook' ? x.v.v.sheets : undefined;
        const want = settings.ports[x.port]?.sheet;
        const t = x.v.t === 'column' ? { name: x.v.v.name, columns: [x.v.v] } : x.v.t === 'dataset' ? x.v.v : ((want && sheets?.find((q) => q.name === want)) || sheets?.[0] || { name: '', columns: [] });
        allCols.push(...t.columns);
        return { port: x.port, letter: columnLetter(x.port), kind: x.v.t, name: x.v.t === 'column' ? titleOf(x.v.v) : x.v.v.name, rows: Math.max(0, maxOf(t.columns.map((c) => c.values.length))), cols: t.columns.length, columns: t.columns.map((c) => c.name), ...(sheets ? { sheets: sheets.map((q) => q.name) } : {}) };
      });
      const view: NodeView = { combine: combineInputs, combineSettings: settings, available: allCols.filter((c, j, a) => a.findIndex((o) => o.name === c.name) === j).map(colInfo) };
      if (!ins.length) return { view: { ...view, waiting: 'Connect columns, datasets or workbooks to A, B, C … (a new port appears when the last one is used).' } };
      const r = combineNode(ins, settings);
      if (typeof r === 'string') return { errors: [r], view };
      return { outputs: { out: r.out, ...(r.source ? { source: { t: 'column', v: r.source } } : {}) }, warnings: r.warnings, view };
    }
    case 'autoextract': {
      const v = one('in');
      if (v?.t !== 'dataset' && v?.t !== 'workbook') return { view: { waiting: 'Connect a workbook (Import with several sheets or files) or a dataset.' } };
      const sheets = v.t === 'workbook' ? v.v.sheets : [v.v];
      // simple: the sheets ticked and the columns of the first, made into rules
      const simple = n.data.mode === 'simple' ? simpleRules(sheets, n.data.pick, n.data.roles) : null;
      const view = { sheets: sheets.map((s) => s.name), ...(simple ? { extractCols: { sheet: simple.first?.name ?? '', columns: simple.columns } } : {}) };
      if (simple && !simple.first) return { view: { ...view, waiting: 'Tick a sheet.' } };
      const r = autoExtract(sheets, simple ? simple.rules : n.data.rules, n.data.names);
      const ds = v.t === 'workbook' ? { ...r.dataset, name: v.v.name } : r.dataset;
      if (!r.picked) return { warnings: r.warnings, view: { ...view, waiting: simple ? 'Choose what the columns are (none taken).' : 'The rules take no column yet.' } };
      return { outputs: { out: { t: 'dataset', v: ds } }, warnings: r.warnings, view: { ...view, available: ds.columns.map(colInfo) } };
    }
    case 'python':
      return pythonNode(n, inputs);
    case 'mathcol': {
      const d = n.data;
      const { ins, vals } = lettered(inputs);
      const view = { inputs: ins };
      if (!d.formula.trim()) return { view: { ...view, waiting: 'Write a formula of the inputs, e.g. A*100 or (A − B)/C.' } };
      // mean(A), max(A) … of a whole column: values of their own
      const formula = withColumnFunctions(d.formula, vals);
      if (d.complex) return complexColumn(d, formula, vals, view);
      if (d.output === 'value') {
        // one value: the formula of single values and functions of whole columns, computed once
        const g = compile(formula);
        if (typeof g === 'string') return { errors: [g], view };
        const rowWise = g.names.filter((x) => x in vals && isCol(vals[x]));
        if (rowWise.length) return { errors: [`One value: ${rowWise.join(', ')} ${rowWise.length > 1 ? 'are columns' : 'is a column'} — use a function of the whole column (mean(${rowWise[0]}), max(${rowWise[0]}) …), or give a column out.`], view };
        const ev1 = rowEvaluator(formula, vals);
        if (typeof ev1 === 'string') return { errors: [ev1], view };
        const value = ev1(0, 1);
        const name1 = d.name || d.formula.trim();
        const outputs1: Record<string, Value> = { out: { t: 'scalar', v: { name: name1, value } } };
        const pe1 = mathErrors(d.errors, g, vals, 1);
        if (pe1) outputs1.err = { t: 'scalar', v: { name: `${name1} error`, value: pe1.err[0] } };
        return { outputs: outputs1, warnings: pe1?.warnings ?? [], view };
      }
      const ev = rowEvaluator(formula, vals);
      if (typeof ev === 'string') return { errors: [ev], view };
      const f = compile(formula) as Exclude<ReturnType<typeof compile>, string>;
      const cols = f.names.filter((x) => x in vals && isCol(vals[x])).map((x) => vals[x] as Column);
      const lengths = [...new Set(cols.map((c) => c.values.length))];
      const rows = cols.length ? maxOf(lengths) : 1;
      const warnings = lengths.length > 1 ? [`The columns have different lengths (${lengths.join(', ')} rows): the missing values of the shorter ones are empty (NaN).`] : [];
      const out = new Float64Array(rows);
      for (let i = 0; i < rows; i++) out[i] = ev(i, rows);
      const rules = (d.rules ?? []).map((r) => ({ ...r, formula: withColumnFunctions(r.formula, vals), rows: r.mode === 'condition' ? withColumnFunctions(r.rows, vals) : r.rows }));
      const ruled = applyRowRules(rules, out, vals, rules.length ? d.others : undefined, d.otherValue ?? 0);
      if (typeof ruled === 'string') return { errors: [ruled], view };
      warnings.push(...ruled.warnings);
      // a row masked in one of its columns is masked in the result
      const mask = maskOf(cols, rows);
      // a formula that is one input: the result keeps its name
      const own = /^[A-Z]{1,2}$/.test(d.formula.trim()) && isCol(vals[d.formula.trim()]) ? (vals[d.formula.trim()] as Column).name : '';
      const resName = d.name || own || d.formula.trim();
      const outputs: Record<string, Value> = { out: { t: 'column', v: { ...column(resName, out), ...(mask ? { mask } : {}) } } };
      // the errors of the inputs carried to the result
      const pe = mathErrors(d.errors, f, vals, rows);
      if (pe) {
        warnings.push(...pe.warnings);
        if (d.rules?.length) warnings.push('Errors: carried through the formula — the rows the rules changed keep the formula’s error.');
        outputs.err = { t: 'column', v: { ...column(`${resName} error`, pe.err), ...(mask ? { mask } : {}) } };
      }
      return { outputs, warnings, view: { ...view, ...(d.rules?.length ? { changed: ruled.changed } : {}) } };
    }
    case 'gencol':
      return generate(n.data, col('like'));
    case 'peakwidth':
      return peakWidthNode(n.data, one('in'));
    case 'columns': {
      // the columns (or single values) on the ports A, B, C …: for the formulas, a copy, the names
      const { ins, vals } = lettered(inputs);
      const ds = one('in');
      if (ds?.t === 'workbook') return columnsEverySheet(ds.v, n.data, vals, ins);
      if (ds?.t !== 'dataset') return { view: { waiting: 'Connect a dataset.', inputs: ins } };
      const r = columnsOf(ds.v, n.data, vals);
      // the first rows as they come in: a row of them can give the names
      const cell = (c: Column, i: number) => c.text?.[i]?.trim() || (Number.isFinite(c.values[i]) ? fmtNum(c.values[i], 6) : '');
      const nHead = Math.min(8, Math.max(0, maxOf(ds.v.columns.map((c) => c.values.length))));
      const columnsHead = { names: ds.v.columns.map((c) => c.name), rows: Array.from({ length: nHead }, (_, i) => ds.v.columns.map((c) => cell(c, i))) };
      if (typeof r === 'string') return { errors: [r], view: { available: ds.v.columns.map(colInfo), inputs: ins, columnsHead } };
      return { outputs: { out: { t: 'dataset', v: r.dataset }, names: { t: 'column', v: r.names } }, warnings: r.warnings, view: { available: r.dataset.columns.map(colInfo), columnLines: r.lines, inputs: ins, columnsHead } };
    }
    case 'stats':
      return n.data.on === 'rows' ? statsRows({ cols: n.data.cols ?? '', x: n.data.x ?? '', rows: n.data.rows, err: n.data.err ?? 'sd' }, one('in')) : statsColumns(n.data, one('in'));
    case 'plot1d':
      return plot(n, inputs);
    case 'histogram':
      return histogramNode(n, inputs);
    case 'barchart':
      return barChartNode(n, inputs);
    case 'boxviolin':
      return boxViolinNode(n, inputs);
    case 'probplot':
      return probPlotNode(n, inputs);
    case 'blandaltman':
      return blandAltmanNode(n, inputs);
    case 'pie':
      return pieNode(n, inputs);
    case 'contour':
      return contourNode(n, inputs);
    case 'polar':
      return polarNode(n, inputs);
    case 'scattermatrix':
      return scatterMatrixNode(n, inputs);
    case 'ternary':
      return ternaryNode(n, inputs);
    case 'waterfall':
      return waterfallNode(n, inputs);
    case 'plot3d':
      return plot3dNode(n, inputs);
    case 'matrix': {
      const d = n.data;
      const v = one('in');
      const ds = v?.t === 'dataset' ? v.v : undefined;
      const view: NodeView = ds ? { available: ds.columns.map(colInfo) } : {};
      if (d.source === 'dataset' && !ds) return { view: { waiting: 'Connect a dataset: its columns become the matrix.' } };
      const r = makeMatrix(d, ds);
      if (typeof r === 'string') return d.source === 'typed' && !d.text.trim() ? { view: { ...view, waiting: r } } : { errors: [r], view };
      return { outputs: { out: { t: 'matrix', v: r.M }, dataset: { t: 'dataset', v: matrixDataset(r.M) } }, warnings: r.warnings, view: { ...view, matrix: matInfo(r.M) } };
    }
    case 'matcomp':
      return matCompNode(n.data, inputs);
    case 'canvas': {
      const d = n.data;
      const figs = all('figures').flatMap((v) => (v.t === 'figure' ? [v.v] : []));
      if (!(d.width > 0) || !(d.height > 0)) return { errors: ['The width and the height must be positive.'] };
      const warnings: string[] = [];
      const figure = canvasFigure(n.id, d, figs, warnings);
      if (toPt(figure.width, figure.unit) > 72 * 60 || toPt(figure.height, figure.unit) > 72 * 60) return { errors: ['At most 60 inches (1.5 m) on a side.'] };
      return { view: { figure, ...(figs.length ? {} : { waiting: 'Connect Plots (their “figure” output).' }) }, warnings: [...new Set(warnings)] };
    }
    case 'image':
      return imageNodeOut(n.id, n.data);
    case 'phasedigitizer': {
      const r = runPhaseDigitizer(n.data);
      if (typeof r === 'string') return { view: { waiting: r } };
      const warnings: string[] = [];
      const st = axesStyle(undefined);
      const axes: Partial<AxesStyle> = {
        ...st,
        x: { ...st.x, min: r.xRange[0], max: r.xRange[1], range: 'tight' },
        y: { ...st.y, min: r.yRange[0], max: r.yRange[1], range: 'tight' },
        sides: {
          ...st.sides,
          bottom: { ...st.sides.bottom, title: r.xLabel },
          left: { ...st.sides.left, title: r.yLabel },
        },
      };
      const { figure } = plotFigure(
        {
          id: n.id,
          data: {
            label: '',
            style: {},
            axes,
            legend: { show: false, x: 98, y: 2, anchor: 'tr' },
            annotations: r.annotations,
            page: { name: 'phase_digitizer' },
          },
        },
        r.curves,
        warnings,
      );
      // the shapes and texts it draws locked (no handles: they follow the diagram); the figure annotations added kept
      const locked: Figure = { ...figure, axes: figure.axes.map((ax) => ({ ...ax, annotations: ax.annotations.map((x) => (/^pd-/.test(x.key.split('/')[1] ?? '') ? { ...x, owner: undefined, locked: true } : x)) })) };
      return {
        outputs: {
          dataset: { t: 'dataset', v: r.dataset },
          workbook: { t: 'workbook', v: r.workbook },
          figure: { t: 'figure', v: locked },
        },
        warnings,
        view: { figure: locked, available: r.dataset.columns.map(colInfo) },
      };
    }
    case 'eis':
      return eisNode(n.id, n.data, one('in'));
    case 'phasediagram':
      return phaseNodeOut(n.id, n.data);
    case 'drawing': {
      // a figure under it: its page the drawing's, the drawing over it (or the figure only a guide)
      const below = one('under');
      const under = below?.t === 'figure' ? below.v : null;
      const d = under ? { ...n.data, width: under.width, height: under.height, unit: under.unit } : n.data;
      if (!(d.width > 0) || !(d.height > 0)) return { errors: ['The width and the height must be positive.'] };
      if (toPt(d.width, d.unit) > 72 * 60 || toPt(d.height, d.unit) > 72 * 60) return { errors: ['At most 60 inches (1.5 m) on a side.'] };
      // its objects pinned to the data of the figure under it: moved to where their data point is now
      const map = under ? plotMapping(under) : null;
      const pinShift: Record<string, [number, number]> = {};
      const shiftOf = (it: AnnotationItem): [number, number] | null => {
        if (!map || !it.pin) return null;
        const now = map.fromData(it.pin.at);
        if (!now.every(Number.isFinite)) return null;
        const sh: [number, number] = [+(now[0] - it.pin.ref[0]).toFixed(4), +(now[1] - it.pin.ref[1]).toFixed(4)];
        pinShift[it.id] = sh;
        return sh[0] || sh[1] ? sh : null;
      };
      const own = drawingFigure(n.id, d, shiftOf);
      if (!under) return { outputs: { figure: { t: 'figure', v: own } }, view: { figure: own } };
      // the objects behind the data: a second overlay, drawn inside the Plot's frame under its curves
      const behind = new Set((n.data.annotations ?? []).filter((it) => it.behind).map((it) => it.id));
      const host = under.axes.find((a) => !a.inset && !a.drawing)?.key;
      const isBehind = (a: Annotation) => a.owner?.field === 'annotations' && behind.has(a.owner.item);
      const drawn = own.axes[0];
      const overlays: AxesFig[] =
        behind.size && host
          ? [
              { ...drawn, key: `${drawn.key}:behind`, annotations: drawn.annotations.filter(isBehind), overlay: true, beneath: host },
              { ...drawn, annotations: drawn.annotations.filter((a) => !isBehind(a)), overlay: true },
            ]
          : [{ ...drawn, overlay: true }];
      const figure: Figure = n.data.under === 'guide' ? own : { ...under, key: n.id, axes: [...under.axes, ...overlays] };
      return { outputs: { figure: { t: 'figure', v: figure } }, view: { figure, under, pinShift } };
    }
    case 'reroute': {
      const v = one('in');
      return v ? { outputs: { out: v } } : {};
    }
    case 'note':
    case 'frame':
    case 'subgraph':
    case 'groupin':
    case 'groupout':
      // a group is evaluated opened in place (evaluateGraph); its own result is made from its inside nodes'
      return {};
  }
}

// Evaluates the whole graph — groups opened in place — and gives every group node the results of its inside: its
// outputs from the nodes feeding its Group output, its errors when nodes inside have errors. The nodes inside a group
// have results under `group/inner` ids.
// The nodes that take one sheet of a workbook on a port (its name: the node's `sheet`): the graphs on their dataset
// port, Columns, Extract column, Pick points, Filter & sort rows, Split into columns on their input
const SHEET_PORTS: Record<string, string> = { columns: 'in', extract: 'in', pick: 'in', eis: 'in', filterrows: 'in', unstack: 'in', ...Object.fromEntries(['histogram', 'barchart', 'boxviolin', 'probplot', 'blandaltman', 'pie', 'polar', 'waterfall', 'contour', 'ternary', 'plot3d'].map((t) => [t, 'dataset'])) };
export const sheetPort = (type: string | undefined): string | undefined => (type ? SHEET_PORTS[type] : undefined);
// the nodes that can also take every sheet (`sheet` '*': the workbook itself, a workbook out)
export const everySheet = (type: string | undefined) => type === 'filterrows' || type === 'columns';

export function evaluateGraph(nodes: AppNode[], edges: Edge[], cache: EvalCache = newCache()): Map<string, NodeResult> {
  if (!nodes.some((n) => n.type === 'subgraph')) return evaluateFlat(nodes, edges, cache);
  const flat = flattenGroups(nodes, edges);
  const results = evaluateFlat(flat.nodes, flat.edges, cache);
  // (a Batch is not opened in place: it has its own result, evaluateFlat gave it)
  const groupResult = (g: Extract<AppNode, { type: 'subgraph' }>, path: string): NodeResult => {
    for (const n of g.data.nodes) if (n.type === 'subgraph' && !n.data.batch) results.set(`${path}/${n.id}`, groupResult(n, `${path}/${n.id}`));
    const outputs: Record<string, Value> = {};
    for (const p of g.data.outputs) {
      const e = g.data.edges.find((x) => x.target === GROUP_OUT && x.targetHandle === p.id);
      const v = e && results.get(`${path}/${e.source}`)?.outputs[e.sourceHandle ?? 'out'];
      if (v) outputs[p.id] = v;
    }
    const bad = g.data.nodes.filter((n) => results.get(`${path}/${n.id}`)?.errors.length).length;
    const r: NodeResult = { rev: ++cache.rev, outputs, errors: bad ? [`${bad} node${bad > 1 ? 's' : ''} inside ${bad > 1 ? 'have' : 'has'} errors: open the group to see.`] : [], warnings: [], view: {} };
    return r;
  };
  for (const n of nodes) if (n.type === 'subgraph' && !n.data.batch) results.set(n.id, groupResult(n, n.id));
  return results;
}

// ---- Batch: the group's steps run on every file ----
// a file's table (an input's value): the same object, the same number, one count for all (the steps after it are not
// computed again while it stays the same)
const fileRevs = new WeakMap<object, number>();
let fileSeq = 0;
const revOf = (o: object) => {
  if (!fileRevs.has(o)) fileRevs.set(o, ++fileSeq);
  return fileRevs.get(o)!;
};
// the runs over the columns of a table, made once for the same table and settings (so their steps are not computed again)
const columnRunsMemo = new WeakMap<Dataset, { key: string; runs: Dataset[] | string }>();
function runBatch(n: Extract<AppNode, { type: 'subgraph' }>, inputs: Inputs, cache: EvalCache): Out {
  const g = n.data;
  const first = g.inputs[0]?.id;
  const v = first ? inputs.get(first)?.[0]?.value : undefined;
  const spec = g.batch ?? {};
  const overCols = spec.over === 'columns';
  if (!v) return { view: { waiting: overCols ? 'Connect the table whose columns the steps run on (a dataset, or a workbook: its sheet chosen).' : 'Connect the files: an Import with several files opened together, or a workbook (a sheet per file).' } };
  let files: Dataset[];
  // over columns: the table (a workbook: the sheet chosen), every column chosen a run with its X
  let colView: { sheets?: string[]; cols: string[] } | undefined;
  if (overCols) {
    const src = v.t === 'workbook' ? (v.v.sheets.find((q) => q.name === spec.sheet) ?? v.v.sheets[0]) : v.t === 'dataset' ? v.v : undefined;
    if (!src) return { errors: ['Over columns: connect a table (a dataset, or a workbook: its sheet chosen).'] };
    colView = { ...(v.t === 'workbook' ? { sheets: v.v.sheets.map((q) => q.name) } : {}), cols: src.columns.map((c) => c.name) };
    const key = JSON.stringify([spec.cols ?? '', spec.xFrom ?? '', spec.x ?? '']);
    let m = columnRunsMemo.get(src);
    if (!m || m.key !== key) {
      m = { key, runs: columnRuns(src, spec) };
      columnRunsMemo.set(src, m);
    }
    if (typeof m.runs === 'string') return { errors: [m.runs], view: { batch: { files: 0, failed: [], over: 'columns', ...colView } } };
    files = m.runs;
  } else files = v.t === 'workbook' ? v.v.sheets : v.t === 'dataset' ? [v.v] : [];
  if (!files.length) return { errors: ['The files must be a workbook (a sheet per file) or a dataset.'] };
  const ordered = orderFiles(files, spec);
  const inner = flattenGroups(g.nodes, g.edges);
  const warnings = [...ordered.warnings];
  if (inner.nodes.some((q) => q.type === 'python')) warnings.push('Python steps do not run inside a batch.');
  // the other inputs: the same for every file
  const others: Record<string, Value> = {};
  for (const p of g.inputs.slice(1)) {
    const o = inputs.get(p.id)?.[0]?.value;
    if (o) others[p.id] = o;
  }
  cache.sub ??= new Map();
  const outerPy = pyNow;
  const runs: FileRun[] = [];
  let preview: Map<string, NodeResult> | undefined;
  // the file the steps are shown on inside (chosen; else the first)
  const shown = Math.min(Math.max(0, Math.floor(spec.show ?? 0)), ordered.files.length - 1);
  ordered.files.forEach((f, k) => {
    const key = `${n.id}#${k}`;
    const sub = cache.sub!.get(key) ?? newCache();
    cache.sub!.set(key, sub);
    const rev = Object.values(others).reduce((a, o) => a * 7919 + revOf(o.v as object), revOf(f));
    const seed = new Map<string, NodeResult>([[GROUP_IN, { rev, outputs: { [first!]: { t: 'dataset', v: f }, ...others }, errors: [], warnings: [], view: {} }]]);
    // (a file with its own settings of some steps: its steps with them)
    const own = spec.own?.[f.name];
    const steps = own ? flattenGroups(withOwn(g.nodes, own), g.edges) : inner;
    const res = evaluateFlat(steps.nodes, steps.edges, sub, seed);
    const run: FileRun = { name: f.name, values: [], tables: [], errors: [] };
    for (const p of g.outputs) {
      const e = inner.edges.find((x) => x.target === GROUP_OUT && x.targetHandle === p.id);
      resultOf(p.label, e ? res.get(e.source)?.outputs[e.sourceHandle ?? 'out'] : undefined, run);
    }
    for (const q of inner.nodes) for (const err of res.get(q.id)?.errors ?? []) run.errors.push(`${q.type}: ${err}`);
    runs.push(run);
    if (k === shown) preview = res;
  });
  pyNow = outerPy;
  // the caches of files no longer there: forgotten
  for (const key of [...cache.sub.keys()]) if (key.startsWith(`${n.id}#`) && Number(key.slice(n.id.length + 1)) >= ordered.files.length) cache.sub.delete(key);
  if (!g.outputs.length) warnings.push('Nothing leaves the steps: connect what to keep (a value, a table) to the Group output inside the batch.');
  const failed = runs.filter((r) => r.errors.length).map((r) => ({ name: r.name, errors: r.errors }));
  if (failed.length) warnings.push(`${failed.length} of ${runs.length} file${runs.length > 1 ? 's' : ''} had errors (see the options).`);
  const out = gather(runs, ordered.read, ordered.parts, overCols ? 'Column' : 'File');
  // the files with their own settings: which steps (a column of the table, when any file has them)
  const ownOf = (name: string) => Object.keys(spec.own?.[name] ?? {}).flatMap((sid) => {
    const q = g.nodes.find((x) => x.id === sid);
    return q ? [nodeDisplayName(q)] : [];
  });
  if (runs.some((r) => ownOf(r.name).length)) out.table.columns.push(column('Own settings', new Float64Array(runs.length).fill(NaN), runs.map((r) => ownOf(r.name).join(', '))));
  return {
    outputs: { table: { t: 'dataset', v: out.table }, sheets: { t: 'workbook', v: out.sheets }, ...(out.stacked ? { stacked: { t: 'dataset', v: out.stacked } } : {}) },
    warnings,
    view: { batch: { files: runs.length, failed, list: runs.map((r, k) => ({ name: r.name, read: readText(ordered.read[k], ordered.parts), errors: r.errors, own: ownOf(r.name) })), shown, ...(colView ? { over: 'columns' as const, ...colView } : {}) } },
    inner: preview,
  };
}

// Evaluates a graph without groups (a Batch is one node here); `cache` keeps the results between calls; `seed`: results
// given beforehand (the input of a Batch's steps: the file).
function evaluateFlat(nodes: AppNode[], edges: Edge[], cache: EvalCache = newCache(), seed?: Map<string, NodeResult>): Map<string, NodeResult> {
  pyNow = cache.py ?? new Map();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const l = incoming.get(e.target) ?? [];
    l.push(e);
    incoming.set(e.target, l);
  }
  const results = new Map<string, NodeResult>(seed ?? []);
  const state = new Map<string, 'busy' | 'done'>();
  const visit = (id: string): NodeResult => {
    const done = results.get(id);
    if (done) return done;
    const n = byId.get(id)!;
    if (state.get(id) === 'busy') {
      const r: NodeResult = { rev: ++cache.rev, outputs: {}, errors: ['The connections form a loop through this node.'], warnings: [], view: {} };
      results.set(id, r);
      return r;
    }
    state.set(id, 'busy');
    const inputs: Inputs = new Map();
    const tokens: string[] = [];
    let bookSheets: string[] | undefined;
    for (const e of incoming.get(id) ?? []) {
      const src = visit(e.source);
      const handle = e.sourceHandle ?? 'out';
      let value: Value | undefined = src.outputs[handle];
      const th = e.targetHandle ?? '';
      // a workbook on the dataset port of a graph: the sheet the node names (absent: the first)
      if (value?.t === 'workbook' && th === sheetPort(n.type)) {
        const book = value.v;
        bookSheets = book.sheets.map((q) => q.name);
        const want = (n.data as { sheet?: string }).sheet;
        const sheet = want ? book.sheets.find((q) => q.name === want) : book.sheets[0];
        if (!(want === '*' && everySheet(n.type))) value = sheet ? { t: 'dataset', v: sheet } : undefined;
      }
      const l = inputs.get(th) ?? [];
      const srcNode = n.type === 'report' ? byId.get(e.source) : undefined;
      const name = srcNode ? nodeDisplayName(srcNode) : undefined;
      l.push({ from: e.source, handle, value, ...(name ? { name } : {}) });
      inputs.set(th, l);
      tokens.push(`${th}<${e.source}:${handle}:${src.rev}${name ? `:${name}` : ''}`);
    }
    if (results.has(id)) return results.get(id)!; // a loop resolved while visiting the inputs
    const key = JSON.stringify([n.type, logicalData(n), tokens, n.type === 'python' ? (cache.py.get(id)?.seq ?? 0) : 0]);
    const cached = cache.entries.get(id);
    let r: NodeResult;
    if (cached && cached.key === key && (cached.math === undefined || cached.math === mathSizesVersion())) r = cached.result;
    else {
      let out: Out;
      const asked = resetMathAsked();
      try {
        // a node of a type this version does not know gives nothing
        out = n.type === 'subgraph' && n.data.batch ? runBatch(n, inputs, cache) : (evalNode(n, inputs) ?? { warnings: [`Unknown node type “${n.type}”.`] });
      } catch (err) {
        out = { errors: [`Internal error: ${(err as Error).message}`] };
      }
      const want = (n.data as { sheet?: string }).sheet;
      if (bookSheets && want && want !== '*' && !bookSheets.includes(want)) out = { ...out, errors: [...(out.errors ?? []), `No sheet “${want}” in the workbook.`] };
      r = { rev: ++cache.rev, outputs: out.outputs ?? {}, errors: out.errors ?? [], warnings: out.warnings ?? [], view: { ...out.view, ...(bookSheets ? { sheets: bookSheets } : {}) }, ...(out.inner ? { inner: out.inner } : {}) };
      // (a node inside measured formulas: the one around it too; what was asked before this node kept for its caller)
      const measured = resetMathAsked();
      cache.entries.set(id, { key, result: r, ...(measured ? { math: mathSizesVersion() } : {}) });
      if (asked || measured) markMathAsked();
    }
    state.set(id, 'done');
    results.set(id, r);
    // a Batch: its steps as they ran on the first file, under its id (seen when it is opened)
    if (r.inner) for (const [k, q] of r.inner) if (k !== GROUP_IN) results.set(`${id}/${k}`, q);
    return r;
  };
  for (const n of nodes) visit(n.id);
  for (const id of [...cache.entries.keys()]) if (!byId.has(id)) cache.entries.delete(id);
  return results;
}
