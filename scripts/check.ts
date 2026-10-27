// Checks of the computations (npm run check): CSV reading, formulas, statistics (against values computed with
// numpy / by hand), axis ticks, and every example graph evaluated without errors.
import { noteMarkdown } from '../src/nodes/noteMd.ts';
import { noteDocx } from '../src/nodes/noteDocx.ts';
import { latexToMathml, latexToOmml } from '../src/nodes/noteMath.ts';
import { copiedFigure, figureCopied } from '../src/nodes/figureClip.ts';
import { docFromText, isPlain, plainOf } from '../src/nodes/richDoc.ts';
import { NODE_HELP, NODE_SHORT } from '../src/help.ts';
import * as Sg from '../src/engine/signal.ts';
import { componentAt, generate, mosCurve, newComponent, noiseOf, rng } from '../src/engine/siggen.ts';
import { cvMake, gradedVbi, hfExactTable, measured, trapsOf, type CvSpec } from '../src/engine/cv.ts';
import { legendLayout } from '../src/figure/legendLayout.ts';
import { fitLook, quickFit, quickFitsOf } from '../src/engine/quickfit.ts';
import { aggregateByX } from '../src/engine/aggregate.ts';
import { mapColor, stopsOf } from '../src/figure/colors.ts';
import { trendFit, type TrendSpec } from '../src/engine/trend.ts';
import { commaNumbers } from '../src/figure/comma.ts';
import { adjustedPositions, bLife, fisherCov, fitMLE, fitRR, fitThreshold, kaplanMeier, logLik, paramCI, suspendedOf } from '../src/engine/reliability.ts';
import { isErrorName, errorTargets } from '../src/engine/errcols.ts';
import { CONV_DEFAULTS, FFT_DEFAULTS, INTERP_DEFAULTS, NORMALIZE_DEFAULTS, SMOOTH_DEFAULTS } from '../src/defaults.ts';
import { CURVEMATH_DEFAULTS, PEAKWIDTH_DEFAULTS, TRANSLATE_DEFAULTS } from '../src/defaults.ts';
import type { CurveMathData, ExtractData, TranslateData } from '../src/types.ts';
import { anovaNode } from '../src/engine/statnodes.ts';
import { ANOVA_DEFAULTS } from '../src/defaults.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { helpDocs, helpParts } from '../src/search/helpDocs.ts';
import { highlight, makeIndex, snippet, stem } from '../src/search/textSearch.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { nodesCatalog, privateHits, writeApi, type ApiPort } from './api.ts';
import { checkProject } from './api-check.ts';
import { NODE_TITLES } from '../src/nodeColors.ts';
import * as Hy from '../src/engine/hypo.ts';
import * as Di from '../src/engine/dist.ts';
import { parseCsv, CSV_DEFAULTS, plainNumber } from '../src/engine/csv.ts';
import { compile, FUNCTION_NAMES } from '../src/engine/expr.ts';
import { describedNames, FORMULA_GROUPS } from '../src/engine/formulaHelp.ts';
import { COLUMN_FUNCTION_NAMES, withColumnFunctions } from '../src/engine/colfns.ts';
import { describe, describeAll, extraStats } from '../src/engine/stats.ts';
import { axisRange, formatLabels, inBreak, parseBreaks, ticks } from '../src/figure/ticks.ts';
import { AXES_STYLE_DEFAULTS, AXIS_DEFAULTS, axesStyle, CURVE_STYLE_DEFAULTS, SIDE_DEFAULTS, curveStyle, toPt, type AxesStyle, type Curve, type Figure, LEGEND_STYLE_DEFAULTS, TEXT_DEFAULTS, TEXT_SPEC_DEFAULTS, FONTS, type Annotation, COLORBAR_DEFAULTS, type ColorbarSpec, legendBox, legendBoxPatch, symbolLook, type LegendSpec } from '../src/figure/spec.ts';
import { BUILTIN_STYLES, styledData } from '../src/nodes/styles.ts';
import { fontRatio, innerPath, parseRich, plainText, richMetrics } from '../src/figure/draw.ts';
import { mathFace, mathKey, setMathSizes } from '../src/math/sizes.ts';
import { plotMapping, stuckLines } from '../src/engine/evaluate.ts';
import { canvasFigure, collapseGroups, evaluateGraph, legendCurves, newCache, packCells, parseRows, plotRows, shapeSpec } from '../src/engine/evaluate.ts';
import { autoFrame, axesGeometry, turnedExtent, wrapLabel, autoTitle, axisNeeds, legendPlace, endLabels, placeLegends } from '../src/figure/axes.ts';
import { column, curvesByRole, findColumn, fmtNum, parseSci, sciPretty, sciText, unitOf } from '../src/engine/table.ts';
import { autoExtract, pick } from '../src/engine/extract.ts';
import { applyManip, renumber, ROW_CHANGED, ROW_DELETED, ROW_MASKED } from '../src/engine/manip.ts';
import { tQuantile } from '../src/engine/lm.ts';
import { DRAWING_DEFAULTS } from '../src/defaults.ts';
import { bakeIso, onFace, pathArray } from '../src/nodes/drawingOps.ts';
import { isoEdges, isoToFace, isoToPage } from '../src/engine/isoPlane.ts';
import { flipAcross, flipDown, scaleAbout, skewAbout, transformItem } from '../src/nodes/drawingTransform.ts';
import { bendItems, blendItems, isoBox, isoStack } from '../src/nodes/drawingMake.ts';
import { panelOrder } from '../src/engine/evaluate.ts';
import type { AnnotationItem } from '../src/types.ts';
import { breakAt, cornersOf, cornersText, joinPaths, longestSegment, nodeCount, roundedRectD, simplifyPath, splitSegment } from '../src/figure/paths.ts';
import { gradAttrs, linearEnds } from '../src/figure/gradient.ts';
import { exportOptions, extensionOf, TABLE_EXPORT_DEFAULTS, tableCells, tableText } from '../src/engine/exportTable.ts';
import { deleteNode, insertNode, parsePath, pathBox, pathText, reversePath, roundCorners, setClosed, shapeToPath, toggleNode, turnedPath } from '../src/figure/paths.ts';
import { placeComponent, rotateItem } from '../src/engine/drawingItems.ts';
import { barReach, barTicks } from '../src/figure/colorbar.ts';
import { aboveOf, boxHandleAt, elbowCorners, lineLength, offsetLine, outlinePoint, resizeBox, taperOutline, trimLine, waveLine, type Box4 } from '../src/figure/shapes.ts';
import { alignMoves, distributeMoves, geomBox, moveItem, snapAxis } from '../src/nodes/drawingOps.ts';
import { CANVAS_DEFAULTS, CANVAS_LAYOUT_DEFAULTS, COMBINE_DEFAULTS, FIT_DEFAULTS, GENCOL_DEFAULTS, IMPORT_DEFAULTS, PLOT1D_DEFAULTS } from '../src/defaults.ts';
import type { AppNode, CalculusData, CombineData, FitNodeData, PeakData, PickData, Plot1DData, WorkbookData } from '../src/types.ts';
import { applySheet, convertInSheet, hasEdits, readSheet, sheetText, type SheetEdits } from '../src/engine/sheet.ts';
import { formulaKept, formulaOfKept } from '../src/engine/sheetFormula.ts';
import { scaledSize, SHAPE_DEFAULTS } from '../src/figure/spec.ts';
import { formatTime, parseTime, timeTicks } from '../src/figure/timeaxis.ts';
import { readTable } from '../src/engine/csv.ts';
import { parseTouchstone } from '../src/engine/touchstone.ts';
import { symT, symTi, ticks as axisTicks } from '../src/figure/ticks.ts';
import { baselineOf } from '../src/engine/baselines.ts';
import { faddeeva, voigtFwhm, voigtProfile } from '../src/engine/faddeeva.ts';
import { buildModel, LIBRARY as FIT_LIBRARY } from '../src/engine/fitModels.ts';
import { parseLinks, runFits as runFitsT } from '../src/engine/fit.ts';
import { fittedPeak } from '../src/engine/peaks.ts';
import { MATH_PRESETS } from '../src/engine/mathPresets.ts';
import { EXTRACT_DEFAULTS, MATHCOL_DEFAULTS } from '../src/defaults.ts';
import { applyFit } from '../src/engine/fituse.ts';
import { odeModel } from '../src/engine/ode.ts';
import * as Spc from '../src/engine/spectral.ts';
import { dwt, highPass, idwt, WAVELETS, waveletDenoise } from '../src/engine/wavelet.ts';
import { stepInfo } from '../src/engine/curvemath.ts';
import { linearRegression, logisticRegression } from '../src/engine/regression.ts';
import { powerAnova, powerT, sampleSizeAnova, sampleSizeT } from '../src/engine/power.ts';
import { clusterOrder, controlChart, pca } from '../src/engine/multivar.ts';
import { ANOVA_DEFAULTS as ANOVA_D, CORR_DEFAULTS, STATS_DEFAULTS, TTEST_DEFAULTS } from '../src/defaults.ts';
import { reconvolved } from '../src/engine/reconv.ts';
import { erfc as erfcT } from '../src/engine/dist.ts';
import { yorkLine } from '../src/engine/fitcompare.ts';
import { compile as compileExpr, compileComplex } from '../src/engine/expr.ts';
import { axisValues, placeColumn } from '../src/engine/axiskinds.ts';
import { countGrid, densityGrid, streamlines, vectorArrows } from '../src/engine/fields2d.ts';
import { arcPath, bendPoints, bendText, bentLine, bracketBase, bracketPath, bracketTextPlace, niceLength, piePath, starPoints, throughLine } from '../src/figure/shapes.ts';
import { columnsOf, formulaShown, formulaStored, type ColumnsSpec } from '../src/engine/columns.ts';
import { area, centroid, extremum, peakWidth, xAtLevel, yAtX } from '../src/engine/measure.ts';
import { curveFormulas } from '../src/engine/curvemath.ts';
import { condsFormula, selectRows, type RowOp } from '../src/engine/rowsel.ts';
import { rowHandle, sourcePort, targetAccepts } from '../src/engine/ports.ts';
import { checkImage } from './check-image.ts';
import { renameSheets } from '../src/engine/sheetNames.ts';
import { fillNames } from '../src/engine/batch.ts';
import { APP_VERSION, CITE_APA, CITE_BIBTEX, DOI } from '../src/version.ts';
import { callSite, writeValidation, type CheckRecord } from './validation.ts';
import { checkStat2 } from './check-stat2.ts';
import { checkStat3 } from './check-stat3.ts';
import { checkSigpack } from './check-sigpack.ts';
import { checkPhase } from './check-phase.ts';
import { armsOf, closestOnSeg, cornersOf as boundaryCorners, createCalMapper, detectRegions, followFrame, evalLeverPoint, frameOf, phaseFaces, regionFills, regionPhases, runPhaseDigitizer, sampleSpline, snapPoint, totalOfUnit, type PhaseDigitizerData } from '../src/engine/phasedigitize.ts';
import { PHASE_DIGITIZER_DEFAULTS } from '../src/defaults.ts';
import { buildFigure } from '../src/plotBuild.ts';
import { addAxis, removeAxis, layoutAxes, type XLayout, type YLayout } from '../src/figure/multiAxes.ts';
import { drawnLimits } from '../src/figure/drawnLimits.ts';
import { backupText, readBackup } from '../src/library.ts';
import { curveColumns, digest, figPort, outValue, toPy, validName, type MplFigure } from '../src/engine/python.ts';
import { figureNodes } from '../src/mplPlot.ts';
import { bothWithin, dunnett, dunnettProb, factorCols, interCols, mixedDesign, mixedModel } from '../src/engine/rmstats.ts';
import { makeGroup, ungroupNode } from '../src/engine/subgraph.ts';
import { CO2, EIS_TRUTH, EXAMPLES, FEC, PBSN, oscillatorEps, oscillatorNK } from '../src/examples.ts';
import { generalKK, kkNode, KK_DEFAULTS, linKK, opticalKK, type LinKK } from '../src/engine/kk.ts';
import { EIS_CIRCUITS, circuitZ, colKey, colLabel, fitSettingsOf, drawCircuit, dropInto, editCircuit, elemsOf, rangeOf, withBranch, fitWarnings, guessColumns, looksAngular, parseCircuit, runEis, simulate, writeCircuit, type EisData } from '../src/engine/eis.ts';
import * as Y from 'yjs';
import { mergeEdges, mergeNodes, ProjectBinding, readProject, writeProject, yProject } from '../src/collab/yproject.ts';
import { chunked, Joiner, SyncHub, ZIP_MIN, type Link } from '../src/collab/sync.ts';
import { Presence, SEND_MS, STALE_MS } from '../src/collab/presence.ts';
import { candidatesIn, decodeSignal, encodeSignal, isAddress, splitCandidates, withAddress } from '../src/collab/links.ts';
import { darkShade, loadColors, SWATCHES } from '../src/theme.ts';
import { doStep, figureSaved, importWithData, plotOfImport, stepsOf, TOURS, uvVisText, type TourState } from '../src/tour/tours.ts';
import { groupNodes } from '../src/groups.ts';
import { asBatch, emptyBatch, GROUP_IN, GROUP_OUT } from '../src/engine/subgraph.ts';
import { columnRuns, guessPattern, patternOf, portNames, readName, sideBySide, skipSteps, eachSteps, tidyOwn, withOwn } from '../src/engine/batch.ts';
import type { GroupData } from '../src/types.ts';
import { fileProject, isPng, makeEmbedded, openEmbedded, pngProject, pngWithProject, projectRevision, svgProject, svgWithProject, withoutImported } from '../src/figure/embed.ts';
import { EMU_PER_PT, readOffice, writeOffice } from '../src/figure/office.ts';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { mergedNodes, parseProject, PROJECT_VERSION, stringifyProject, toProject, type Project } from '../src/project.ts';
import { combine, keptBlocks, labelRuns, unstack } from '../src/engine/reshape.ts';
import { JOHNSON_AU } from '../src/data/johnsonGold.ts';
import { CALCULUS_DEFAULTS, newSheet, PEAK_DEFAULTS as PEAK_NEW, PICK_DEFAULTS, UNSTACK_DEFAULTS, WORKBOOK_DEFAULTS } from '../src/defaults.ts';
// the Peak analyzer as before Run analysis: fitted at every change (the tests of the fit)
const PEAK_DEFAULTS = { ...PEAK_NEW, needRun: undefined };
import { fmtPm } from '../src/engine/report.ts';
import { looksNumeric, readCell, TO_NUMBER_DEFAULTS } from '../src/engine/convert.ts';
import { columnsToSheets, convertTable, stackColumns, transposeTable } from '../src/engine/tableShape.ts';
import { areaBetween, derivative, integrate, pointsCurve, regionRows } from '../src/engine/calculus.ts';
import { groupText, splitRows } from '../src/engine/split.ts';
import { autoRanges, hitAt, withRanges, zoomOutRanges } from '../src/nodes/figureRanges.ts';
import { zoomAt } from '../src/nodes/plotZoom.ts';
import { pickPoints, pickValues, type PickRule } from '../src/engine/pick.ts';
import { findPeaksIn, peakRunKey, regionPeak } from '../src/engine/peaks.ts';
import { findSpec } from '../src/engine/fit.ts';
import { cleanData, filterRows, findOutliers, sortKeysOf, splitParts } from '../src/engine/cleaning.ts';
import { curveMath } from '../src/engine/curvemath.ts';
import { averageNode } from '../src/engine/signalnodes.ts';
import { AVERAGE_DEFAULTS, BARCHART_DEFAULTS, DIGITIZER_DEFAULTS, HISTOGRAM_DEFAULTS } from '../src/defaults.ts';
import { barChart, rawTable, wideTable, sortTable, type BarTable } from '../src/engine/barchart.ts';
import { boxGroups, boxStats, boxViolin, violinStats } from '../src/engine/boxviolin.ts';
import { BLANDALTMAN_DEFAULTS, BOXVIOLIN_DEFAULTS, CONTOUR_DEFAULTS, PIE_DEFAULTS, POLAR_DEFAULTS, SMITH_DEFAULTS, SIGGEN_DEFAULTS, PROBPLOT_DEFAULTS, SCATTERMATRIX_DEFAULTS, TERNARY_DEFAULTS } from '../src/defaults.ts';
import { blandAltman } from '../src/engine/blandaltman.ts';
import { pieAngles, pieChart } from '../src/engine/piechart.ts';
import { bracketCurves, SIG_DEFAULTS, significance, type SigElement, type SigSpec } from '../src/engine/signif.ts';
import type { Dataset } from '../src/engine/table.ts';
import { polarChart, radarSeries } from '../src/engine/polar.ts';
import { gammaOfZ, markerText, smithChart, toGamma, zOfGamma } from '../src/engine/smith.ts';
import { scatterMatrix } from '../src/engine/scattermatrix.ts';
import { normalize, ternaryChart, ternaryXY } from '../src/engine/ternary.ts';
import { asGrid, coarsen, contourLevels, contourLines, contourPlot, gridFromMatrix, gridFromScatter, profileList, profiles, type Grid } from '../src/engine/contour.ts';
import { hasRefs, withRefs } from '../src/textStore.ts';
import { waterfallChart, waterfallShifts, waterfallZ } from '../src/engine/waterfall.ts';
import { plot3d } from '../src/engine/plot3d.ts';
import { sceneCamera } from '../src/figure/camera3d.ts';
import { onPlane3d, planeValue, rectCorners } from '../src/nodes/figure3d.ts';
import { hiddenBy } from '../src/engine/hide.ts';
import { PLOT3D_DEFAULTS } from '../src/defaults.ts';
import { WATERFALL_DEFAULTS } from '../src/defaults.ts';
import type { AxesFig as AxesFigT } from '../src/figure/spec.ts';
const TEXT_DEFAULTS_FOR_CHECK = { font: 'Arial', size: 8, bold: false, italic: false, color: '#000000' };
type AxesFig = AxesFigT;
import { fitDist, makeDist, plotPositions, probPlot, type ProbDist } from '../src/engine/probplot.ts';
import { makeScale } from '../src/figure/axes.ts';
import { binEdges, cauchyFit, histCounts, histogram, kde, kdeWidth, mixtureFit, normalFit, peakStarts, truncatedFit, type HistSpec, type HistFitKind } from '../src/engine/histogram.ts';
import { normInv } from '../src/engine/dist.ts';
import { autoPoints, calibrate, digitized, type DigitizerData, type Px } from '../src/engine/digitize.ts';
import { CLEAN_DEFAULTS, FILTER_DEFAULTS } from '../src/defaults.ts';
import * as Mx from '../src/engine/matrix.ts';
import { MATRIX_CONTOUR_DEFAULTS, MATRIX_DEFAULTS } from '../src/defaults.ts';

let failed = 0;
const canConnectBook = (t: 'column' | 'workbook') => targetAccepts({ id: 'w', type: 'book', position: { x: 0, y: 0 }, data: WORKBOOK_DEFAULTS } as AppNode, 'in-2').includes(t);
let passed = 0;
// (npm run validation: every check kept for VALIDATION.md)
const report = process.argv.includes('--validation');
const records: CheckRecord[] = [];
function ok(cond: boolean, what: string) {
  if (report) records.push({ pass: cond, what, ...callSite(new Error().stack ?? '') });
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
}
const near = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---- the handles of a box: its corners and sides, turned with it ----
{
  const near = (p: number[], q: number[]) => p.every((v, i) => Math.abs(v - q[i]) < 1e-9);
  const b: Box4 = [10, 20, 50, 40];
  ok(near(resizeBox(b, 0, 1, 0, 5, 7, false, false), [10, 20, 55, 40]) && near(resizeBox(b, 0, 0, -1, 3, -4, false, false), [10, 16, 50, 40]), 'box handles: a side moves alone (across, or up), the other ways ignored');
  ok(near(resizeBox(b, 0, 1, 1, 4, 6, false, false), [10, 20, 54, 46]) && near(resizeBox(b, 0, -1, 0, 5, 0, false, true), [15, 20, 45, 40]), 'box handles: a corner moves two sides; Ctrl: about the centre');
  ok(near(resizeBox(b, 0, 1, 1, 40, 0, true, false), [10, 20, 90, 60]) && near(resizeBox([50, 40, 10, 20], 0, -1, -1, -4, 0, false, false), [50, 40, 6, 20]), 'box handles: Shift keeps its proportions; x1 on the right: the left side is x2');
  // turned 30°: the corner opposite the one dragged stays where it is drawn, the box keeps its turn
  for (const [ix, iy] of [[1, 1], [-1, 1], [1, 0], [0, -1]] as const) {
    const fixed = boxHandleAt(b, 30, -ix || 1, -iy || 1);
    const fixed2 = boxHandleAt(b, 30, -ix || -1, -iy || -1);
    const nb = resizeBox(b, 30, ix, iy, 6, -9, false, false);
    const keep = boxHandleAt(nb, 30, -ix || 1, -iy || 1);
    const keep2 = boxHandleAt(nb, 30, -ix || -1, -iy || -1);
    ok(near(keep, fixed) && near(keep2, fixed2), `box handles: turned 30°, the handle (${ix}, ${iy}) dragged, the other side stays in place`);
  }
  // turned 90°: a drag down on its right side (now at the bottom) widens it
  const turned = resizeBox(b, 90, 1, 0, 0, 10, false, false);
  ok(Math.abs(turned[2] - turned[0] - 50) < 1e-9 && Math.abs(turned[3] - turned[1] - 20) < 1e-9, `box handles: turned 90°, its side dragged along its own direction (${turned.map((v) => v.toFixed(2)).join(', ')})`);
}

// ---- a colour bar: its values (auto, every, levels, min and max, a list, none), minor ticks, its side ----
{
  const cv = (log = false, levels?: number[]) => ({ style: { ...CURVE_STYLE_DEFAULTS, colorBy: 'y', cmapLog: log }, colorRange: [0, 10], ...(levels ? { grid: { xs: [], ys: [], z: new Float64Array(0), mode: 'filled', smooth: false, levels, range: [0, 10], nan: '' } } : {}) }) as unknown as Curve;
  const bt = (p: Partial<ColorbarSpec>, c = cv(), lo = 0, hi = 10) => barTicks({ ...COLORBAR_DEFAULTS, ...p }, c, lo, hi);
  const j = (v: number[]) => v.map((x) => +x.toPrecision(6)).join(' ');
  ok(j(bt({}).major) === '0 2 4 6 8 10' && bt({}).labels.join(' ') === '0 2 4 6 8 10', `colour bar: auto values (${j(bt({}).major)})`);
  ok(j(bt({ labels: 'every', every: 3 }).major) === '0 3 6 9' && j(bt({ labels: 'every', every: 3, everyFrom: 1 }).major) === '1 4 7 10', 'colour bar: every 3, from a multiple or from 1');
  ok(j(bt({ labels: 'levels' }, cv(false, [1, 2.5, 7, 12])).major) === '1 2.5 7' && j(bt({ labels: 'levels' }).major) === '0 2 4 6 8 10', 'colour bar: the levels of the map (inside it); none: as auto');
  ok(j(bt({ labels: 'minmax' }).major) === '0 10' && j(bt({ labels: 'custom', custom: '0.5, 3;12  7 x 3' }).major) === '0.5 3 7', 'colour bar: min and max; a list (outside the map and repeated left out)');
  const none = bt({ labels: 'none' });
  ok(j(none.major) === '0 2 4 6 8 10' && none.labels.every((l) => l === ''), 'colour bar: no values, the ticks where auto puts them');
  ok(j(bt({ minor: 1 }).minor) === '1 3 5 7 9' && j(bt({ labels: 'every', every: 4, everyFrom: 1, minor: 1 }).minor) === '3 7', `colour bar: minor ticks between the values, and past them at the same step (${j(bt({ labels: 'every', every: 4, everyFrom: 1, minor: 1 }).minor)})`);
  const lg = bt({ minor: 1 }, cv(true), 1, 100);
  ok(j(lg.major) === '1 10 100' && lg.minor.length === 16 && lg.minor[0] === 2 && lg.minor[15] === 90, 'colour bar: a log map, its decades and the 2 … 9 of each');
  ok(bt({ format: 'decimal', decimals: 2 }).labels[1] === '2.00', 'colour bar: its numbers as on an axis (2 decimals)');
  ok(bt({ labels: 'every', every: 0.25 }, cv(), 0, 1).labels.join(' ') === '0.00 0.25 0.50 0.75 1.00' && bt({ labels: 'every', every: 2.5 }).labels.join(' ') === '0.0 2.5 5.0 7.5 10.0', `colour bar: a step of 0.25 or 2.5 written with the decimals it needs (${bt({ labels: 'every', every: 0.25 }, cv(), 0, 1).labels.join(' ')})`);
  // its side: the numbers on the right (room after it) or the left (before it); a horizontal bar's title under / over
  const r1 = barReach({ ...COLORBAR_DEFAULTS }, cv(), 0, 10, TEXT_DEFAULTS, true);
  const r2 = barReach({ ...COLORBAR_DEFAULTS, side: 'start', tickDir: 'in' }, cv(), 0, 10, TEXT_DEFAULTS, true);
  const r3 = barReach({ ...COLORBAR_DEFAULTS, orientation: 'horizontal', labels: 'none' }, cv(), 0, 10, TEXT_DEFAULTS, true);
  ok(r1.after > 3.5 && r1.before === 0 && r2.before > 0 && r2.after === 0 && r2.gap === 1.5 && r1.gap === 3.5 && r1.atStart > 0, 'colour bar: the room on its side (right, or left with the ticks inside)');
  ok(r3.after > 0 && r3.after < TEXT_DEFAULTS.size * 2 && r3.before === 0, 'colour bar: horizontal, no numbers: only its ticks and title under it');
}

// ---- CSV ----
{
  const r = parseCsv('x,y\n1,2.5\n2,3.5\n', CSV_DEFAULTS);
  ok(r.delimiter === ',' && r.decimal === '.', 'comma CSV: delimiter and decimal');
  ok(r.dataset.columns.length === 2 && r.dataset.columns[0].name === 'x' && r.dataset.columns[1].values[1] === 3.5, 'comma CSV: names and values');
}
{
  const r = parseCsv('Header line\nWavelength;R\nnm;%\n400;1,5\n410;-2,25e-1\n', { ...CSV_DEFAULTS, skip: 1, nameLine: 1, unitLine: 2 });
  ok(r.delimiter === ';' && r.decimal === ',', 'semicolon + decimal comma detected');
  ok(r.dataset.columns[0].name === 'Wavelength (nm)' && r.dataset.columns[1].name === 'R (%)', 'units line written into the names');
  ok(r.dataset.columns[1].values[0] === 1.5 && r.dataset.columns[1].values[1] === -0.225, 'decimal comma values');
}
{
  const r = parseCsv('t (s)\tV [mV]\n0\t1\n1\t2\n', CSV_DEFAULTS);
  ok(r.delimiter === '\t', 'tab detected');
  const one = parseCsv('Size (nm)\n' + Array.from({ length: 30 }, (_, i) => String(1 + i / 10)).join('\n'), CSV_DEFAULTS);
  ok(one.dataset.columns.length === 1 && one.dataset.columns[0].name === 'Size (nm)' && one.dataset.columns[0].values[29] === 3.9, `one column whose name has a space: not split (${one.dataset.columns.map((c) => c.name)})`);
  ok(r.dataset.columns[0].name === 't (s)' && unitOf(r.dataset.columns[0].name) === 's' && unitOf(r.dataset.columns[1].name) === 'mV', 'a unit in the name stays in it (and is read from it)');
  ok(findColumn(r.dataset.columns, 't')?.name === 't (s)' && findColumn(r.dataset.columns, 'x') === undefined, 'a column found by its name without the unit (older projects)');
}
{
  const r = parseCsv('1,2\n3,4\n', CSV_DEFAULTS);
  ok(r.delimiter === ',' && r.dataset.columns.length === 2 && r.dataset.columns[1].values[1] === 4, 'integer CSV without header: two columns, not decimal commas');
  ok(r.dataset.columns[0].name === 'A' && r.dataset.columns[1].name === 'B', 'columns without names: A, B');
}
{
  const r = parseCsv('  1.0   2.0\n  3.0   4.0\n', { ...CSV_DEFAULTS, delimiter: ' ' });
  ok(r.dataset.columns.length === 2 && r.dataset.columns[1].values[0] === 2, 'whitespace-separated');
}
{
  const r = parseCsv('name,value\n"a, b",1\nc,NaN\nd,\n', CSV_DEFAULTS);
  ok(r.dataset.columns[0].text?.[0] === 'a, b', 'quoted field with a comma');
  ok(Number.isNaN(r.dataset.columns[1].values[1]) && Number.isNaN(r.dataset.columns[1].values[2]) && !r.dataset.columns[1].text, 'NaN and empty cells are missing values, not text');
}

// ---- formulas ----
{
  const f = compile('(A - B)/C + sqrt(4)*pi');
  ok(typeof f !== 'string' && near(f.fn({ A: 5, B: 1, C: 2 }), 2 + 2 * Math.PI), 'formula');
  ok(typeof compile('A +') === 'string', 'formula error reported');
}

// ---- statistics (reference: numpy, ddof = 1; quartiles numpy.percentile linear) ----
{
  const s = describe([2, 4, 4, 4, 5, 5, 7, 9, NaN]);
  ok(s.n === 8 && s.missing === 1, 'stats: N, missing');
  ok(near(s.mean, 5) && near(s.sum, 40), 'stats: mean, sum');
  ok(near(s.sd, Math.sqrt(32 / 7)), 'stats: SD (N − 1)');
  ok(near(s.se, Math.sqrt(32 / 7) / Math.sqrt(8)), 'stats: SE');
  ok(near(s.median, 4.5) && near(s.q1, 4) && near(s.q3, 5.5), 'stats: median and quartiles (numpy linear)');
  // large offset: the two-pass variance keeps its digits
  const big = describe([1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16]);
  ok(near(big.sd, Math.sqrt(30), 1e-9), 'stats: SD with a large offset');
}

// ---- ticks and tick labels ----
{
  const [a, b] = axisRange(AXIS_DEFAULTS, 401.3, 799.2);
  ok(a === 400 && b === 800, 'nice range 400–800');
  const t = ticks(AXIS_DEFAULTS, 400, 800);
  ok(t.major.join(' ') === '400 500 600 700 800', 'linear ticks');
  ok(formatLabels(t.major, false, SIDE_DEFAULTS).labels.join(' ') === '400 500 600 700 800', 'linear labels');
  const lg = ticks({ ...AXIS_DEFAULTS, scale: 'log' }, 1e-3, 10);
  const lgl = formatLabels(lg.major.filter((v) => v >= 1e-3 && v <= 10), true, SIDE_DEFAULTS).labels;
  ok(lgl.join(' ') === '10^{−3} 10^{−2} 10^{−1} 10^{0} 10^{1}', `log labels: one way for the whole axis — powers when a decade is past 0.01 … 1000 (${lgl.join(' ')})`);
  const lgp = formatLabels([0.1, 1, 10, 100, 1000], true, SIDE_DEFAULTS).labels.join(' ');
  const lgq = formatLabels([10, 100, 1000, 10000], true, SIDE_DEFAULTS).labels.join(' ');
  ok(lgp === '0.1 1 10 100 1000' && lgq === '10^{1} 10^{2} 10^{3} 10^{4}', `log labels: plain numbers from 0.01 to 1000, else all powers (not 10, 100, 10³) — ${lgp} | ${lgq}`);
  const tiny = formatLabels([0, 1e-6, 2e-6], false, SIDE_DEFAULTS).labels;
  ok(tiny[1] === '1×10^{−6}' && tiny[0] === '0', `small numbers as ×10ⁿ (${tiny.join(' ')})`);
  const common = formatLabels([0, 2000, 4000], false, { ...SIDE_DEFAULTS, format: 'common' });
  ok(common.labels.join(' ') === '0 2 4' && common.common === '×10^{3}', 'common factor ×10³');
  ok(formatLabels([0.25, 0.5], false, { ...SIDE_DEFAULTS, format: 'percent' }).labels.join(' ') === '25% 50%', 'percent labels');
  ok(formatLabels([1500], false, { ...SIDE_DEFAULTS, format: 'decimal', decimals: 1, factor: 1000, suffix: ' k' }).labels[0] === '1.5 k', 'decimals, factor, suffix');
  ok(formatLabels([-2], false, SIDE_DEFAULTS).labels[0] === '−2', 'minus sign');
  const cu = ticks({ ...AXIS_DEFAULTS, ticksBy: 'values', custom: '400, 532 = green, 633' }, 400, 700);
  ok(cu.major.join(' ') === '400 532 633' && cu.labels?.[1] === 'green', 'ticks at chosen values');
  ok(ticks({ ...AXIS_DEFAULTS, ticksBy: 'count', count: 3 }, 0, 10).major.join(' ') === '0 5 10', 'exactly N ticks');
  ok(ticks({ ...AXIS_DEFAULTS, ticksBy: 'increment', step: 5 }, 10, 20).major.join(' ') === '10 15 20', 'ticks every 5');
  ok(ticks({ ...AXIS_DEFAULTS, ticksBy: 'increment', step: 2, first: 11 }, 10, 20).major.join(' ') === '11 13 15 17 19', 'ticks every 2 from 11');
  const legacy = { ...AXIS_DEFAULTS, ticksBy: undefined, step: 0.5 };
  ok(ticks(legacy, 0, 2).major.length === 5, 'older projects: a step alone still places the ticks');
}

// ---- breaks, Plot figures, the Canvas grid, shared axes, styles ----
{
  ok(JSON.stringify(parseBreaks('20-80; 120 - 150')) === JSON.stringify([[20, 80], [120, 150]]), 'axis breaks read');
  ok(inBreak({ ...AXIS_DEFAULTS, breaks: '20-80' }, 50) && !inBreak({ ...AXIS_DEFAULTS, breaks: '20-80' }, 90), 'a value inside a break');
  // a Plot is a whole figure: its page, one frame placed by the margins its axes need
  const xy = (id: string, x: number[], y: number[], extra: object = {}) => {
    const t = `x;y\n${x.map((v, k) => `${v};${y[k]}`).join('\n')}\n`;
    const res = evaluateGraph(
      [
        { id: `${id}-i`, type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: t, textId: id } } as AppNode,
        { id, type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, ...extra } } as AppNode,
      ],
      [{ id: '1', source: `${id}-i`, sourceHandle: 'out', target: id, targetHandle: 'dataset' }],
    ).get(id)!;
    return res.outputs.figure?.t === 'figure' ? res.outputs.figure.v : (null as unknown as Figure);
  };
  const fa = xy('a', [0, 4], [0, 1]);
  // the limits as drawn (what auto is in the Axes settings): rounded out to the ticks, a limit typed kept, its step
  {
    const L = drawnLimits(fa, 'a');
    const fm = xy('am', [0, 4], [0, 1], { axes: { x: { ...AXIS_DEFAULTS, min: 0.5, max: NaN } } });
    const M = drawnLimits(fm, 'am');
    const fl = xy('al', [1, 1000], [1, 2], { axes: { x: { ...AXIS_DEFAULTS, scale: 'log' } } });
    const G = drawnLimits(fl, 'al');
    ok(L.bottom?.lo === 0 && L.bottom.hi === 4 && L.bottom.step > 0 && L.left?.lo === 0 && L.left.hi === 1 && M.bottom?.lo === 0.5 && M.bottom.hi === 4 && L.top?.hi === 4 && G.bottom?.lo === 1 && G.bottom.hi === 1000 && Number.isNaN(G.bottom.step), `the axes' limits as drawn: X ${L.bottom?.lo} – ${L.bottom?.hi} every ${L.bottom?.step}, Y ${L.left?.lo} – ${L.left?.hi}; a start typed kept (${M.bottom?.lo}); a log axis without a step`);
  }
  const p = fa.axes[0].style.pos;
  ok(fa.width === 85 && fa.unit === 'mm' && fa.axes.length === 1 && fa.axes[0].legends.length === 1, 'Plot: a page of 85 mm with its frame and legend');
  ok(p.x > 5 && p.x < 25 && p.y < 6 && p.x + p.w > 95 && p.y + p.h > 75 && p.y + p.h < 95, `Plot: automatic margins (${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.w.toFixed(1)} ${p.h.toFixed(1)})`);
  const noTitles = xy('n', [0, 4], [0, 1], { axes: { ...AXES_STYLE_DEFAULTS, sides: { ...AXES_STYLE_DEFAULTS.sides, left: { ...SIDE_DEFAULTS, labels: false, showTitle: false } } } });
  ok(noTitles.axes[0].style.pos.x < p.x - 4, 'Plot: a side without numbers and title takes less room');
  const manual = xy('m', [0, 4], [0, 1], { axes: { ...AXES_STYLE_DEFAULTS, pos: { x: 20, y: 10, w: 60, h: 60 } }, page: { ...PLOT1D_DEFAULTS.page, frame: 'manual' } });
  ok(manual.axes[0].style.pos.x === 20 && manual.axes[0].style.pos.w === 60, 'Plot: a frame placed by hand stays');
  const b = xy('b', [2, 9], [0, 5]);
  // the Canvas: a grid of the Plots, shared axes, inner numbers left out
  const L = { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2 };
  const cv = (layout: object, items: object[] = [], figs: Figure[] = [fa, b]) => canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 70, layout: { ...L, ...layout }, items: items as never }, figs, []);
  const two = cv({ shareX: 'all' });
  ok(two.boxes!.length === 2 && two.boxes![0].box.x === 0 && two.boxes![1].box.x === 50 && two.boxes![0].box.w === 50, 'Canvas: two cells side by side');
  ok(two.axes[1].style.pos.x > 50 && two.axes[1].style.pos.x + two.axes[1].style.pos.w < 100 && two.axes[0].style.pos.x + two.axes[0].style.pos.w < 50, 'Canvas: every frame placed again in its cell');
  ok(two.axes[0].style.x.min === 0 && two.axes[0].style.x.max === 10 && two.axes[1].style.x.min === 0 && two.axes[1].style.x.max === 10, 'Canvas: shared X, one range');
  const sy = cv({ shareY: 'row' });
  ok(!sy.axes[1].style.sides.left.labels && sy.axes[0].style.sides.left.labels && sy.axes[1].style.pos.x < two.axes[1].style.pos.x, 'Canvas: shared Y, numbers on the outer panel only (the inner frame wider)');
  const tall = xy('t', [0, 4], [0, 1], { axes: { ...AXES_STYLE_DEFAULTS, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: { ...SIDE_DEFAULTS, title: 'big', titleText: { size: 20 } } } } });
  const row = cv({}, [], [fa, tall]);
  ok(row.axes[0].style.pos.y === row.axes[1].style.pos.y && row.axes[0].style.pos.h === row.axes[1].style.pos.h, 'Canvas: the frames of a row share their top and bottom');
  const keep = cv({ sizing: 'keep', hgap: 5 });
  ok(keep.width === 85 + 5 + 85 && keep.height === 65, `Canvas: the Plots keep their sizes (${keep.width} × ${keep.height})`);
  ok(JSON.stringify(packCells([{ key: 'a', colSpan: 2 }, { key: 'b' }, { key: 'c' }, { key: 'd', free: { x: 1, y: 1, w: 9, h: 9 } }], 2, 1)) === JSON.stringify([{ r: 0, c: 0, rs: 1, cs: 2 }, { r: 1, c: 0, rs: 1, cs: 1 }, { r: 1, c: 1, rs: 1, cs: 1 }, null]), 'Canvas: a Plot over two cells, rows added, a free Plot out of the grid');
  const inset = cv({}, [{ key: 'b', free: { x: 60, y: 10, w: 30, h: 40 } }]);
  ok(inset.boxes![1].free && inset.boxes![1].box.x === 60 && inset.axes[1].style.pos.x > 60 && inset.boxes![0].box.w === 50, 'Canvas: a Plot moved by hand (an inset) keeps its box');
  // stacked: one under another (X shared) — the frames touching, in proportion 2:1:1, aligned; numbers of X at the
  // bottom only; ticks inward at the joints; a gap when asked; side by side: Y shared
  const c3 = xy('c', [1, 6], [0, 100]);
  const st3 = (layout: object) => canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 90, height: 120, layout: { ...L, arrange: 'stackV', ...layout } }, [fa, b, c3], []);
  const sv = st3({ ratios: '2:1:1' });
  const P = sv.axes.map((a) => a.style.pos);
  const tol = 1e-9;
  ok(Math.abs(P[0].y + P[0].h - P[1].y) < tol && Math.abs(P[1].y + P[1].h - P[2].y) < tol && Math.abs(P[0].h - 2 * P[1].h) < 1e-6 && Math.abs(P[1].h - P[2].h) < 1e-6, `Canvas stacked: the frames touch, heights 2:1:1 (${P.map((q) => q.h.toFixed(2)).join(', ')})`);
  ok(P.every((q) => Math.abs(q.x - P[0].x) < tol && Math.abs(q.w - P[0].w) < tol) && P[0].y > 0 && P[2].y + P[2].h < 100, 'Canvas stacked: left and right sides aligned, room above and below the stack');
  ok(!sv.axes[0].style.sides.bottom.labels && !sv.axes[1].style.sides.bottom.labels && sv.axes[2].style.sides.bottom.labels && sv.axes.every((a) => a.style.x.min === 0 && a.style.x.max === 10), 'Canvas stacked: one X range, its numbers on the bottom panel only');
  ok(sv.axes[0].style.sides.bottom.ticks === 'in' && sv.axes[1].style.sides.top.ticks !== 'out' && sv.axes[2].style.sides.bottom.ticks === SIDE_DEFAULTS.ticks, 'Canvas stacked: ticks inward at the joints, the outer sides as they were');
  const gapped = st3({ stackGap: 3 }).axes.map((a) => a.style.pos);
  ok(Math.abs(gapped[1].y - (gapped[0].y + gapped[0].h) - (3 / 120) * 100) < 1e-6, 'Canvas stacked: a gap between the frames (3 mm)');
  const sh = canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 60, layout: { ...L, arrange: 'stackH' } }, [fa, b, c3], []);
  const Q = sh.axes.map((a) => a.style.pos);
  ok(Math.abs(Q[0].x + Q[0].w - Q[1].x) < tol && Math.abs(Q[1].x + Q[1].w - Q[2].x) < tol && Q.every((q) => Math.abs(q.y - Q[0].y) < tol) && !sh.axes[1].style.sides.left.labels && sh.axes[0].style.sides.left.labels && sh.axes.every((x) => x.style.y.max === sh.axes[0].style.y.max), 'Canvas stacked side by side: frames touching, one Y, its numbers on the first panel');
  // a Plot's border goes with it onto the Canvas (around its place)
  const bordered = xy('bd', [0, 4], [0, 1], { page: { ...PLOT1D_DEFAULTS.page, border: 1.5, borderColor: '#ff0000', borderDash: 'dash', borderRadius: 3 } });
  const withBorder = cv({}, [], [bordered, b]);
  ok(withBorder.boxes![0].border?.width === 1.5 && withBorder.boxes![0].border?.dash === 'dash' && withBorder.boxes![0].border?.radius === 3 && !withBorder.boxes![1].border, 'Canvas: a Plot keeps its own border (width, line, corners) around its place');
  // an inset: another Plot inside the frame (its box at 54 %, 5 % of the frame, 42 % × 45 %), zoomed
  const hostRes = (insets: object[], insPage: object = {}) => {
    const t1 = `x;y\n${[0, 1, 2, 3, 4].map((v) => `${v};${v * v}`).join('\n')}\n`;
    const g = evaluateGraph(
      [
        { id: 'hi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: t1, textId: 'hi' } } as AppNode,
        { id: 'ins', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, page: { ...PLOT1D_DEFAULTS.page, ...insPage } } } as AppNode,
        { id: 'host', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, insets } } as AppNode,
      ],
      [
        { id: '1', source: 'hi', sourceHandle: 'out', target: 'ins', targetHandle: 'dataset' },
        { id: '2', source: 'hi', sourceHandle: 'out', target: 'host', targetHandle: 'dataset' },
        { id: '3', source: 'ins', sourceHandle: 'figure', target: 'host', targetHandle: 'insets' },
      ],
    );
    const f = g.get('host')!.outputs.figure;
    return f?.t === 'figure' ? f.v : (null as unknown as Figure);
  };
  const hf = hostRes([{ key: 'ins', x: 50, y: 10, w: 40, h: 40, zoom: true }]);
  const [H0, I0] = hf.axes.map((q) => q.style.pos);
  const ib = hf.axes[1].inset?.box;
  ok(hf.axes.length === 2 && !!ib && Math.abs(ib.x - (H0.x + 0.5 * H0.w)) < 1e-9 && Math.abs(ib.w - 0.4 * H0.w) < 1e-9 && I0.x >= ib.x && I0.x + I0.w <= ib.x + ib.w + 1e-9 && I0.y + I0.h <= ib.y + ib.h + 1e-9 && hf.axes[1].inset?.zoom === true, 'Plot: an inset inside the frame, its frame within its box');
  const onCanvas = canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 70, layout: { ...L, shareX: 'all', shareY: 'all' } }, [hf, b], []);
  const host2 = onCanvas.axes.find((q) => q.key === 'host')!;
  const ins2 = onCanvas.axes.find((q) => q.inset)!;
  ok(onCanvas.axes.length === 3 && Math.abs(ins2.inset!.box!.x - (host2.style.pos.x + 0.5 * host2.style.pos.w)) < 1e-9 && Number.isNaN(ins2.style.x.min) && host2.style.x.min === 0, 'Canvas: the inset moves with its Plot, its axes not shared with the panels');
  // a Plot placed by hand over another on the Canvas (an inset there): its page's ground under it, none when transparent
  const freeOn = (bg: string) => cv({}, [{ key: b.key, free: { x: 50, y: 5, w: 40, h: 40 } }], [fa, { ...b, background: bg }]).boxes!.find((q) => q.key === b.key);
  ok(freeOn('#ffffff')?.background === '#ffffff' && freeOn('none')?.background === undefined && cv({}, [], [fa, { ...b, background: '#ffffff' }]).boxes!.every((q) => !q.background), 'Canvas: a Plot placed by hand keeps its page background (white, or none when transparent); the grid cells none');
  // an inset's background: as its Plot's page (also the former default white), or chosen
  const bgOf = (background: string | undefined, page: string) => hostRes([{ key: 'ins', x: 50, y: 10, w: 40, h: 40, zoom: false, ...(background !== undefined ? { background } : {}) }], { background: page }).axes[1].inset?.background;
  ok(bgOf(undefined, 'none') === 'none' && bgOf('#ffffff', 'none') === 'none' && bgOf('', 'white') === '#ffffff' && bgOf('white', 'none') === '#ffffff' && bgOf('none', 'white') === 'none' && bgOf('#ffeedd', 'none') === '#ffeedd', 'Plot: an inset on its Plot’s page background (transparent: none) unless one is chosen in Insets');
  // the grid in proportion: the first column twice as wide
  const ratio = cv({ colRatios: '2:1' });
  ok(Math.abs(ratio.boxes![0].box.w - 2 * ratio.boxes![1].box.w) < 1e-9, 'Canvas: column widths in proportion 2:1');
  // one X title and one Y title for all the panels: the panels' own hidden, the texts on the page, room kept
  const ct = cv({ commonX: true, commonY: true, commonYTitle: 'Signal' });
  const tx = ct.annotations.filter((q) => q.kind === 'text').map((q) => (q.kind === 'text' ? q.text.text : ''));
  ok(ct.axes.every((q) => !q.style.sides.bottom.showTitle && !q.style.sides.left.showTitle) && tx.includes('Signal') && tx.includes('x') && ct.axes[0].style.pos.x > two.axes[0].style.pos.x - 1e-9, `Canvas: one X and one Y title for all the panels (${tx.join(', ')})`);
  // one legend for all the panels: their own hidden, every curve once, room kept at the right
  const la = xy('la', [0, 4], [0, 1], { legend: { show: true } });
  const lb = xy('lb', [2, 9], [0, 5], { legend: { show: true } });
  const cl = cv({ legend: 'right' }, [], [la, lb]);
  const plain = cv({}, [], [la, lb]);
  ok(cl.legends.length === 1 && cl.legends[0].curves.length === 1 && cl.axes.every((q) => !q.legends.length) && cl.axes[1].style.pos.x + cl.axes[1].style.pos.w < plain.axes[1].style.pos.x + plain.axes[1].style.pos.w - 1, 'Canvas: one legend for all the panels (every curve once), at the right, the panels narrower');
  // facets: a Plot of two curves split into two panels
  const twoCurves = (() => {
    const t2 = `x;y;z\n${[0, 1, 2, 3].map((v) => `${v};${v};${2 * v}`).join('\n')}\n`;
    const g = evaluateGraph(
      [
        { id: 'fi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: t2, textId: 'fi' } } as AppNode,
        { id: 'fp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, rows: [{ label: '', style: {}, cols: { x: 'x', y: 'z' } }] } } as AppNode,
      ],
      [{ id: '1', source: 'fi', sourceHandle: 'out', target: 'fp', targetHandle: 'dataset' }],
    );
    const f = g.get('fp')!.outputs.figure;
    return f?.t === 'figure' ? f.v : (null as unknown as Figure);
  })();
  const fc = canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 70, layout: { ...L, cols: 2 }, items: [{ key: 'fp', facet: true }] }, [twoCurves], []);
  ok(twoCurves.axes[0].curves.length === 2 && fc.axes.length === 2 && fc.axes.every((q) => q.curves.length === 1) && fc.boxes!.length === 2 && fc.boxes![1].box.x === 50, 'Canvas: a Plot of two curves split into two panels (facets)');
  // numbers that would touch on a narrow frame: fewer automatic ticks; a usual frame as before; a step asked kept
  const wide = xy('w1', [520, 570], [0, 1]);
  const labelsOf = (ax: typeof wide.axes[0], w: number) => axesGeometry(ax, { x: 0, y: 0, w, h: 100 }, wide.text).tb.labels.filter(Boolean);
  const narrow = labelsOf(wide.axes[0], 45);
  const usual = labelsOf(wide.axes[0], 200);
  const stepped = labelsOf({ ...wide.axes[0], style: { ...wide.axes[0].style, x: { ...wide.axes[0].style.x, ticksBy: 'increment', step: 10 } } }, 45);
  ok(narrow.length < usual.length && narrow.length >= 2 && usual.join() === "520,530,540,550,560,570" && stepped.length === 6, `Ticks: fewer numbers on a narrow frame (${narrow.join(" ")}; usual ${usual.join(" ")}; step ${stepped.length}), as before on a usual one, a step asked kept`);
  const frame = autoFrame(fa.axes[0], { x: 0, y: 0, w: 200, h: 150 }, fa.text);
  ok(frame.x > 10 && frame.y + frame.h < 150 && frame.x + frame.w < 200, 'automatic margins inside an area');
  // named styles of a Plot: curves (colours kept), axes (titles kept)
  const plot = { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: 'a', style: { color: '#ff0000' }, rows: [{ label: 'b', style: { color: '#00ff00' } }], axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: { ...SIDE_DEFAULTS, title: 'My title' } } } } } as AppNode;
  const st = BUILTIN_STYLES.find((s) => s.type === 'plot1d' && s.name.startsWith('Curves: open circles'))!;
  const d = styledData(plot, st) as { style: { mode: string; color: string }; rows: { style: { mode: string; color: string } }[] };
  ok(d.style.mode === 'scatter' && d.style.color === '#ff0000' && d.rows[0].style.color === '#00ff00' && d.rows[0].style.mode === 'scatter', 'a curve style on every curve, colours kept');
  const ad = styledData(plot, BUILTIN_STYLES.find((s) => s.type === 'plot1d' && s.name.startsWith('Axes: open'))!) as { axes: AxesStyle; label: string };
  ok(ad.axes.sides.bottom.title === 'My title' && ad.axes.sides.top.line === false && ad.label === 'a', 'an axes style keeps the axis titles');
}

// ---- legends, layers, older projects ----
{
  const c = (key: string) => ({ key, label: key, style: curveStyle({}), series: { name: key, x: { name: 'x', values: new Float64Array(1) }, y: { name: 'y', values: new Float64Array(1) } } });
  const cs = legendCurves([c('a'), c('b'), c('c')], [{ key: 'c', show: true, label: 'third' }, { key: 'a', show: false, label: '' }]);
  ok(cs.map((x) => x.label).join(' ') === 'third b', 'legend entries: chosen order, hidden, own text, new ones after');
  ok(shapeSpec({ kind: 'xband' }).z < 0 && shapeSpec({ kind: 'arrow' }).z > 0 && shapeSpec({ kind: 'rect', below: true }).z < 0, 'shape layers: bands and “under the curves” below the data');
  // a project of format 1: a legend and an arrow connected to the Axes
  const v1 = JSON.stringify({
    app: 'graph-flow',
    version: 1,
    nodes: [
      { id: 'ax', type: 'axes', position: { x: 0, y: 0 }, data: { style: {} } },
      { id: 'cv', type: 'canvas', position: { x: 0, y: 0 }, data: { width: 85, height: 65, unit: 'mm', font: 'Arial', background: 'white', dpi: 300, name: 'f' } },
      { id: 'lg', type: 'legend', position: { x: 0, y: 0 }, data: { x: 4, y: 4 } },
      { id: 'sh', type: 'shape', position: { x: 0, y: 0 }, data: { kind: 'arrow' } },
    ],
    edges: [
      { id: 'e1', source: 'ax', sourceHandle: 'out', target: 'cv', targetHandle: 'axes' },
      { id: 'e2', source: 'lg', sourceHandle: 'out', target: 'ax', targetHandle: 'legend' },
      { id: 'e3', source: 'sh', sourceHandle: 'out', target: 'ax', targetHandle: 'annotation' },
    ],
  });
  const v2 = parseProject(v1);
  ok(typeof v2 !== 'string' && v2.version === PROJECT_VERSION && !v2.nodes.some((n) => (n.type as string) === 'axes'), 'a format-1 project opens (its empty Axes gone)');
  // format 3: Plot → Axes (a legend and an arrow on it) → Canvas becomes one Plot with its page; two Axes on a Canvas grid stay a Canvas
  const imp3 = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y;z\n1;2;3\n2;4;1\n', textId: 'f3' } };
  const v3 = (canvas: object, axes: string[], plots: string[]) =>
    parseProject(
      JSON.stringify({
        app: 'graph-flow',
        version: 3,
        nodes: [
          imp3,
          ...plots.map((p, k) => ({ id: p, type: 'plot1d', position: { x: 0, y: 0 }, data: { label: p, style: {}, cols: { x: 'x', y: k ? 'z' : 'y' } } })),
          ...axes.map((a) => ({ id: a, type: 'axes', position: { x: 0, y: 0 }, data: { style: { pos: { x: 20, y: 10, w: 70, h: 70 } } } })),
          { id: 'lg', type: 'legend', position: { x: 0, y: 0 }, data: { x: 4, y: 4, attach: axes[0], entries: [{ key: `${plots[plots.length - 1]}:0`, show: false, label: '' }] } },
          { id: 'sh', type: 'shape', position: { x: 0, y: 0 }, data: { kind: 'arrow', coords: 'data', attach: axes[0] } },
          { id: 'cv', type: 'canvas', position: { x: 0, y: 0 }, data: { width: 120, height: 80, unit: 'mm', font: 'Arial', background: 'white', dpi: 300, name: 'f', ...canvas } },
        ],
        edges: [
          ...plots.map((p) => ({ id: `d${p}`, source: 'i', sourceHandle: 'out', target: p, targetHandle: 'dataset' })),
          ...plots.map((p, k) => ({ id: `c${p}`, source: p, sourceHandle: 'curve', target: axes[Math.min(k, axes.length - 1)], targetHandle: 'curves' })),
          ...axes.map((a) => ({ id: `a${a}`, source: a, sourceHandle: 'out', target: 'cv', targetHandle: 'axes' })),
          { id: 'l', source: 'lg', sourceHandle: 'out', target: 'cv', targetHandle: 'legend' },
          { id: 's', source: 'sh', sourceHandle: 'out', target: 'cv', targetHandle: 'annotation' },
        ],
      }),
    );
  const one = v3({}, ['ax'], ['p']);
  if (typeof one !== 'string') {
    const pd = one.nodes.find((n) => n.id === 'p')!.data as import('../src/types.ts').Plot1DData;
    ok(one.nodes.length === 2 && pd.page?.width === 120 && pd.page.frame === 'manual' && pd.axes?.pos?.x === 20 && pd.legend?.show === true && pd.annotations?.length === 1, 'format 3 → 4: Axes, legend, arrow and page in the Plot; the Canvas gone');
    const f = evaluateGraph(one.nodes, one.edges).get('p')!.view.figure!;
    ok(f.axes[0].annotations.length === 1 && f.axes[0].legends.length === 1 && f.width === 120, 'format 3 → 4: the Plot draws them');
  } else ok(false, `format 3 → 4 (${one})`);
  const merged = v3({}, ['ax'], ['p', 'q']);
  if (typeof merged !== 'string') {
    const pd = merged.nodes.find((n) => n.id === 'p')!.data as import('../src/types.ts').Plot1DData;
    ok(!merged.nodes.some((n) => n.id === 'q') && pd.rows?.length === 1 && pd.legend?.entries?.[0].key === 'p:1', 'format 3 → 4: two Plots of one Axes become one (curves appended, legend keys renamed)');
  } else ok(false, 'format 3 → 4: two Plots of one Axes');
  const grid = v3({ layout: { grid: true, rows: 1, cols: 2, left: 8, right: 3, top: 7, bottom: 18, hgap: 17, vgap: 10, shareX: 'none', shareY: 'row', inner: false } }, ['ax', 'ay'], ['p', 'q']);
  if (typeof grid !== 'string') {
    const f = evaluateGraph(grid.nodes, grid.edges).get('cv')!.view.figure!;
    ok(grid.edges.filter((e) => e.target === 'cv' && e.targetHandle === 'figures').length === 2 && f.boxes?.length === 2 && !f.axes[1].style.sides.left.labels, 'format 3 → 4: a Canvas grid of two Axes takes the two Plots (shared Y kept)');
  } else ok(false, 'format 3 → 4: a Canvas grid');
}

// ---- worksheet, Plot from a dataset, group nodes ----
{
  const base = parseCsv('x;y\n1;2\n2;4\n3;6\n', CSV_DEFAULTS).dataset;
  const { dataset: ed, map } = applySheet(base, { cells: { '1:1': '40', '3:0': '4', '3:1': '8' }, addRows: 1, delRows: [0], cols: { 1: { name: 'Y', unit: 'mV' } } }, '.'); // a unit of an older project goes into the name
  ok(JSON.stringify(Array.from(ed.columns[1].values)) === JSON.stringify([40, 6, 8]) && ed.columns[1].name === 'Y (mV)', 'worksheet: cells, a row left out, a row added, a header');
  ok(map.rows.join(',') === '1,2,3' && ed.columns[0].values[2] === 4, 'worksheet: the rows shown and their place in the file');
  ok(applySheet(base, { cells: { '0:1': '2,5' } }, '.').dataset.columns[1].values[0] === 2.5, 'worksheet: a cell typed with a decimal comma');
  // a Plot taking its columns from a dataset by name
  const nodes = [
    { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;a;b\n1;2;3\n2;4;5\n', textId: 't' } },
    { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {}, cols: { x: 'x', y: 'a' }, rows: [{ label: '', style: {}, cols: { y: 'b' } }] } },
  ] as AppNode[];
  const pr = evaluateGraph(nodes, [{ id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  const cs = pr.view.curves ?? [];
  ok(cs.length === 2 && cs[1].series.y.values[1] === 5 && cs[1].series.x.values[1] === 2, 'Plot: curves from the columns of a dataset');
  // Kramers–Kronig. Lin-KK as numpy computes it (scripts/fixtures/kk-ref.py): the same number of elements, the same
  // residuals; a spectrum that changed during the sweep fails the test, noise alone does not
  {
    const K = JSON.parse(readFileSync(new URL('./fixtures/kk-ref.json', import.meta.url), 'utf8'));
    const r = linKK(K.f, K.re, K.im, { cap: false, ind: true, mu: 0.85, maxM: 50 })!;
    const dRe = Math.max(...r.resRe.map((v, i) => Math.abs(v - K.resRe[i])));
    const dIm = Math.max(...r.resIm.map((v, i) => Math.abs(v - K.resIm[i])));
    const f = Array.from({ length: 61 }, (_, i) => 0.1 * 10 ** (i / 10));
    const randles = (fr: number, Rct: number) => {
      const w = 2 * Math.PI * fr;
      const d = 1 + (w * Rct * 1e-5) ** 2;
      return [10 + Rct / d, (-w * Rct * Rct * 1e-5) / d];
    };
    const drift = f.map((x, i) => randles(x, 100 * (1 + (0.3 * (60 - i)) / 60)));
    const rd = linKK(
      f,
      drift.map((q) => q[0]),
      drift.map((q) => q[1]),
      { cap: false, ind: true, mu: 0.85, maxM: 50 },
    )!;
    const worst = (x: LinKK) => Math.max(...x.resRe.map(Math.abs), ...x.resIm.map(Math.abs));
    ok(r.M === K.M && Math.abs(r.mu - K.mu) < 1e-9 && dRe < 1e-6 && dIm < 1e-6 && worst(r) < 1.5 && worst(rd) > 3, `Lin-KK: ${r.M} elements, \u03bc ${r.mu.toFixed(3)}, residuals as numpy (within ${Math.max(dRe, dIm).toExponential(1)} %); noise 0.3 %: within ${worst(r).toFixed(2)} %; R_ct growing 30 % during the sweep: ${worst(rd).toFixed(1)} %`);
  }
  // optical: n and k of a Lorentz oscillator back from its reflectance alone (E in eV, or the same as wavelengths in nm);
  // general: \u03b5\u2081 from \u03b5\u2082 and \u03b5\u2082 from \u03b5\u2081
  {
    const E = Array.from({ length: 600 }, (_, i) => 0.05 + (29.95 * i) / 599);
    const nk = E.map(oscillatorNK);
    const R = nk.map(([n, k]) => ((n - 1) ** 2 + k * k) / ((n + 1) ** 2 + k * k));
    const o = opticalKK(E, R, { low: 'constant', high: 'power', power: 4 });
    let err = 0;
    E.forEach((e, i) => {
      if (e > 1 && e < 8) err = Math.max(err, Math.abs(o.n[i] - nk[i][0]), Math.abs(o.k[i] - nk[i][1]));
    });
    const ds = (xName: string, xs: number[]) => ({ name: 'R', columns: [column(xName, Float64Array.from(xs)), column('R', Float64Array.from(R))] });
    const byE = kkNode(ds('Energy (eV)', E), { ...KK_DEFAULTS, mode: 'optical' });
    const byL = kkNode(
      ds(
        'Wavelength (nm)',
        E.map((e) => 1239.84 / e),
      ),
      { ...KK_DEFAULTS, mode: 'optical' },
    );
    const col = (r: typeof byE, n: string) => (typeof r === 'string' ? new Float64Array() : (r.dataset.columns.find((c) => c.name === n)?.values ?? new Float64Array()));
    const same = Math.max(...Array.from(col(byE, 'k')).map((v, i) => (E[i] > 1 && E[i] < 8 ? Math.abs(v - col(byL, 'k')[i]) : 0)));
    const eps = E.map((e) => {
      const [n, k] = oscillatorNK(e);
      return [n * n - k * k, 2 * n * k];
    });
    const g1 = generalKK(
      E,
      eps.map((q) => q[1]),
      { low: 'zero', high: 'power', power: 3, direction: 'im2re', offset: 1 },
    );
    const g2 = generalKK(
      E,
      eps.map((q) => q[0]),
      { low: 'constant', high: 'power', power: 2, direction: 're2im', offset: 1 },
    );
    let e1 = 0;
    let e2 = 0;
    E.forEach((e, i) => {
      if (e > 0.5 && e < 15) {
        e1 = Math.max(e1, Math.abs(g1.out[i] - eps[i][0]));
        e2 = Math.max(e2, Math.abs(g2.out[i] - eps[i][1]));
      }
    });
    const tails = typeof byE === 'string' ? 0 : byE.plots[0].series?.filter((x) => x.dash).length;
    const marks = typeof byE === 'string' ? 0 : byE.plots[0].marks?.length;
    const wave = typeof byL === 'string' ? '' : byL.warnings.join(' ');
    ok(err < 0.05 && same < 1e-6 && e1 < 0.25 && e2 < 0.3 && tails === 2 && marks === 2 && /wavelength/.test(wave), `Kramers\u2013Kronig, optical: n and k of an oscillator from R within ${err.toFixed(3)} (1 to 8 eV), the same from wavelengths in nm (${same.toExponential(1)}); its tails drawn dashed, the data's ends marked; general: \u03b5\u2081 from \u03b5\u2082 within ${e1.toFixed(2)}, \u03b5\u2082 from \u03b5\u2081 within ${e2.toFixed(2)} (peak 20)`);
  }
  // the three examples: the stable cell within the band, the drifting one out of it; n and k as drawn; \u03b5\u2081 as drawn
  {
    const run = (start: string) => {
      const kx = EXAMPLES.find((e) => e.name.startsWith(start))!.make();
      return evaluateGraph(kx.nodes, kx.edges);
    };
    const imp = run('Kramers\u2013Kronig (impedance)');
    const worst = (id: string) => {
      const o = imp.get(id)?.outputs.out;
      return o?.t === 'dataset' ? Math.max(...o.v.columns.filter((c) => /^Residual/.test(c.name)).flatMap((c) => Array.from(c.values).map(Math.abs))) : NaN;
    };
    const [good, bad] = [worst('kk-good'), worst('kk-bad')];
    const opt = run('Kramers\u2013Kronig (optical)').get('kk-optical')?.outputs.out;
    const col = (o: typeof opt, n: string) => (o?.t === 'dataset' ? (o.v.columns.find((c) => c.name === n)?.values ?? new Float64Array()) : new Float64Array());
    const E = col(opt, 'Energy (eV)');
    let nkErr = 0;
    E.forEach((e, i) => {
      const [n, k] = oscillatorNK(e);
      if (e > 1 && e < 8) nkErr = Math.max(nkErr, Math.abs(col(opt, 'n')[i] - n), Math.abs(col(opt, 'k')[i] - k));
    });
    const gen = run('Kramers\u2013Kronig (general)').get('kk-general')?.outputs.out;
    const Eg = col(gen, 'Energy (eV)');
    let e1Err = 0;
    Eg.forEach((e, i) => {
      if (e > 1 && e < 8) e1Err = Math.max(e1Err, Math.abs(col(gen, 'Re by KK (from \u03b5\u2082)')[i] - oscillatorEps(e)[0]));
    });
    ok(good < 1 && bad > 1.5 && nkErr < 0.06 && e1Err < 0.4, `Kramers\u2013Kronig examples: the stable cell within \u00b1${good.toFixed(2)} %, the drifting one out to \u00b1${bad.toFixed(2)} %; n, k from R within ${nkErr.toFixed(3)} of the true ones; \u03b5\u2081 from \u03b5\u2082 within ${e1Err.toFixed(2)}`);
  }
  // the microarray example: the log2 red / green ratio of every spot as drawn (gene k: k − 2.5), the same in the three
  // replicates; nothing saturated
  {
    const ma = EXAMPLES.find((e) => e.name.startsWith('Microarray'))!.make();
    const wb = evaluateGraph(ma.nodes, ma.edges).get('ma-image')!.outputs.workbook;
    const sp = wb?.t === 'workbook' ? wb.v.sheets.find((x) => x.name === 'Spots') : undefined;
    const lr = sp?.columns.find((c) => c.name === 'log2 ratio R/G')?.values ?? new Float64Array();
    const off = Array.from(lr).map((v, i) => Math.abs(v - ((i % 6) - 2.5)));
    // (against the global background too: the ring follows the background, brighter to the right; the global one not)
    const net = sp?.columns.find((c) => c.name === 'Net R')?.values ?? new Float64Array();
    const netG = sp?.columns.find((c) => c.name === 'Net global R')?.values ?? new Float64Array();
    const drift = (v: ArrayLike<number>) => v[5] - v[0] - (net[5] - net[0]);
    ok(lr.length === 18 && Math.max(...off) < 0.1 && wb?.t === 'workbook' && wb.v.sheets.map((x) => x.name).join() === 'Selections,Spots,Profiles,Summary' && netG.length === 18 && Math.abs(drift(netG)) > 3, `microarray example: log2 R/G of the 18 spots over their rings within ${Math.max(...off).toFixed(3)} of the ratios drawn; against the global background too (its net drifts by ${drift(netG).toFixed(1)} along a row)`);
  }
  // a group of the generated example's nodes gives the same figure, and ungrouping gives the graph back
  const ex = EXAMPLES.find((e) => e.name.startsWith('Generated'))!.make();
  const fig0 = evaluateGraph(ex.nodes, ex.edges).get('plot-osc')!.view.figure!;
  const g = makeGroup(ex.nodes, ex.edges, ['model', 'envelope', 'measured', 'gen-noise'], (n, h) => h ?? n.type, () => 'column')!;
  const gNode = g.nodes.find((n) => n.id === g.groupId)! as Extract<AppNode, { type: 'subgraph' }>;
  ok(gNode.data.inputs.length === 2 && gNode.data.outputs.length === 3, `group: ports from the crossing connections (${gNode.data.inputs.length} in, ${gNode.data.outputs.length} out)`);
  const res = evaluateGraph(g.nodes, g.edges);
  const fig1 = res.get('plot-osc')!.view.figure!;
  const same = (a: typeof fig0, b: typeof fig0) => JSON.stringify(a.axes[0].curves.map((c) => Array.from(c.series.y.values))) === JSON.stringify(b.axes[0].curves.map((c) => Array.from(c.series.y.values)));
  ok(!!fig1 && same(fig0, fig1), 'group: the same figure');
  ok(res.has(`${g.groupId}/model`) && res.get(g.groupId)!.errors.length === 0, 'group: results of the nodes inside, under group/… ids');
  const back = ungroupNode(g.nodes, g.edges, g.groupId)!;
  ok(back.nodes.length === ex.nodes.length && back.edges.length === ex.edges.length && same(fig0, evaluateGraph(back.nodes, back.edges).get('plot-osc')!.view.figure!), 'ungroup: the graph and the figure back');
  // a group inside a group
  const g2 = makeGroup(g.nodes, g.edges, [g.groupId, 'gen-t'], (n, h) => h ?? n.type, () => 'column')!;
  ok(same(fig0, evaluateGraph(g2.nodes, g2.edges).get('plot-osc')!.view.figure!), 'a group in a group: the same figure');
}

// ---- a sweep in one table cut into columns and plotted, rows drawn, designations, panels moved by hand, errors ----
{
  // θ from 40 to 90 again and again, once for every pore fraction (as a sweep saved in one file)
  let text = 'θ (°);pore fraction;R\n';
  for (let f = 0; f < 5; f++) for (let t = 0; t <= 20; t++) text += `${40 + 2.5 * t};${f / 10};${f + t / 100}\n`;
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 's' } } as AppNode;
  const run = (data: object, cut: object | null = null) => {
    const sp = { id: 's', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, x: 'θ (°)', ys: 'R', ...cut } } as AppNode;
    const r = evaluateGraph([imp, ...(cut ? [sp] : []), { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {}, cols: { x: 'θ', y: 'R' }, ...data } } as AppNode], [
      { id: '1', source: 'i', sourceHandle: 'out', target: cut ? 's' : 'p', targetHandle: cut ? 'in' : 'dataset' },
      ...(cut ? [{ id: '2', source: 's', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }] : []),
    ]).get('p')!;
    return { r, cs: r.view.curves ?? ([] as Curve[]) };
  };
  // the sweep cut by Split into columns (auto: where θ starts again), a curve per column, coloured by its block value
  const rowsOf = (n: number) => ({ cols: { x: 'θ (°)', y: 'R · pore fraction = 0' }, rows: Array.from({ length: n - 1 }, (_, k) => ({ label: '', style: {}, cols: { x: 'θ (°)', y: `R · pore fraction = ${(k + 1) / 10}` } })) });
  const a = run({ ...rowsOf(5), curveColors: { map: 'viridis' } }, {});
  ok(a.cs.length === 5 && a.cs.every((c) => c.series.x.values.length === 21) && a.cs[2].series.y.values[0] === 2, `Split into columns ▸ auto, then Plot: 5 curves of 21 points (${a.cs.length}: ${a.r.errors.join('; ')})`);
  ok(a.cs[0].style.color !== a.cs[4].style.color && a.cs[0].group?.range[1] === 0.4, 'Plot ▸ Colours: a colour map over the block values');
  const rs = run({ rowSel: '22-42' });
  ok(rs.cs.length === 1 && rs.cs[0].series.y.values.length === 21 && rs.cs[0].series.y.values[0] === 1, 'rows drawn: 22-42');
  // the legend: one entry for many coloured curves (auto above 8), one each when asked
  const many = run({ cols: { x: 'θ (°)', y: 'R · 1' }, rows: Array.from({ length: 10 }, (_, k) => ({ label: '', style: {}, cols: { x: 'θ (°)', y: `R · ${k + 2}` } })), curveColors: { map: 'viridis' } }, { by: 'every', every: 10 }).cs;
  ok(many.length === 11 && collapseGroups(many).length === 1 && collapseGroups(many)[0].groupSpan?.count === 11 && collapseGroups(many, 'each').length === 11 && collapseGroups(a.cs).length === 5, `legend: coloured curves as one entry above 8 (${many.length})`);
  // several datasets on the port: equal names made distinct
  const two = evaluateGraph([imp, { ...imp, id: 'j' }, { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {}, cols: { x: 'θ (°)', y: 'R' }, rows: [{ label: '', style: {}, cols: { x: 'θ (°) (2)', y: 'R (2)' } }] } } as AppNode], [
    { id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' },
    { id: '2', source: 'j', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' },
  ]).get('p')!;
  ok(two.view.curves?.length === 2 && two.errors.length === 0, `Plot: two datasets on one port, the second's names made distinct (${two.errors.join('; ')})`);
  // designations: each Y with the X on its left, ±Y with the Y on its left, a column left out (–)
  const roles = curvesByRole([
    { name: 't', role: 'x' },
    { name: 'a' },
    { name: 'ea', role: 'yerr' },
    { name: 'f', role: 'none' },
    { name: 'w', role: 'x' },
    { name: 'b', role: 'y' },
  ]);
  ok(JSON.stringify(roles) === JSON.stringify({ curves: [{ x: 't', y: 'a', yerr: 'ea' }, { x: 'w', y: 'b' }] }), 'designations: the curves of a quick plot');
  ok(applySheet(parseCsv('x;y\n1;2\n', CSV_DEFAULTS).dataset, { cols: { 1: { role: 'yerr' } } }, '.').dataset.columns[1].role === 'yerr', 'worksheet: a designation kept on the column');
  // Columns: by name — moved, renamed, designated, left out; find / replace and a prefix on the others; the names from a
  // row (the row out, a text column numbers again); names kept different; the names as a column
  {
    const ds = parseCsv('Sample;R · a;R · b;n\nid;1;2;3\nx;4;5;6\n', CSV_DEFAULTS).dataset;
    const c1 = columnsOf(ds, { items: [{ from: 'n', name: 'N', role: 'x' }, { from: 'Sample', keep: false }], find: 'R · ', replace: '', prefix: 'S ' });
    ok(typeof c1 !== 'string' && c1.dataset.columns.map((c) => `${c.name}/${c.role}`).join() === 'N/x,S a/y,S b/y' && c1.lines.map((L) => `${L.from}:${L.keep}`).join() === 'n:true,Sample:false,R · a:true,R · b:true' && c1.names.text?.join() === 'N,S a,S b', 'Columns: moved, renamed, designated, left out; find / replace and a prefix on the others; the names as a column');
    const c2 = columnsOf(ds, { namesRow: 1 });
    ok(typeof c2 !== 'string' && c2.dataset.columns.map((c) => c.name).join() === 'id,1,2,3' && c2.dataset.columns[1].values.length === 1 && c2.dataset.columns[1].values[0] === 4 && !c2.dataset.columns[1].text, 'Columns: the names from a row (taken out of the data)');
    const c3 = columnsOf(ds, { items: [{ from: 'n', name: 'X' }, { from: 'R · a', name: 'X' }, { from: 'gone', name: 'Z' }] });
    ok(typeof c3 !== 'string' && c3.dataset.columns.slice(0, 2).map((c) => c.name).join() === 'X,X (2)' && c3.warnings.some((w) => w.includes('gone')) && columnsOf(ds, { namesRow: 9 }) === 'Names from row 9: the data have 2 rows.', 'Columns: names kept different, a column not in the data said, a names row past the data');
    // several names at once on the columns chosen only: listed (B-C), ticked, the Y ones; a list of names in the order
    // shown (one per line, ; or ,), then a suffix; a name by hand wins; too few names said
    const nm = (r: ReturnType<typeof columnsOf>) => (typeof r === 'string' ? r : r.dataset.columns.map((c) => c.name).join());
    const l1 = columnsOf(ds, { renameOn: 'list', renameList: 'B-C', names: 'A1; A2', suffix: ' (a.u.)' });
    const l2 = columnsOf(ds, { renameOn: 'ticked', renamePick: ['n', 'R · a'], names: 'first\nsecond', items: [{ from: 'n' }, { from: 'R · a', name: 'mine' }] });
    const l3 = columnsOf(ds, { renameOn: 'y', names: 'only one', prefix: '> ' });
    ok(nm(l1) === 'Sample,A1 (a.u.),A2 (a.u.),n' && nm(l2) === 'first,mine,Sample,R · b' && nm(l3) === 'Sample,> only one,> R · b,> n' && typeof l3 !== 'string' && l3.warnings.some((w) => w.includes('1 name for 3 columns')), 'Columns: several names at once on the columns listed / ticked / Y — a list of names in order, a suffix, a name by hand first');
    // a column on a port: a column of its own at the end (its name, Y), placed elsewhere by the order, renamed, left
    // out; not twice when a column added copies it
    const inA = { A: { name: 'extra', values: Float64Array.from([7, 8]) } };
    const i1 = columnsOf(ds, {}, inA);
    const i2 = columnsOf(ds, { items: [{ from: 'Sample' }, { from: '{A}', name: 'E' }] }, inA);
    const i3 = columnsOf(ds, { computed: [{ id: 'c1', name: '', kind: 'copy', copy: '{A}' }] }, inA);
    const i4 = columnsOf(ds, { items: [{ from: '{A}', keep: false }] }, inA);
    ok(nm(i1) === 'Sample,R · a,R · b,n,extra' && typeof i1 !== 'string' && i1.lines[4].input === true && i1.dataset.columns[4].role === 'y' && nm(i2) === 'Sample,E,R · a,R · b,n' && nm(i3) === 'Sample,R · a,R · b,n,extra' && nm(i4) === 'Sample,R · a,R · b,n' && typeof i4 !== 'string' && !i4.warnings.length, 'Columns: a column on a port A — a column of its own at the end, placed, renamed, left out; not twice when copied');
    // Columns on a workbook: the sheet it names
    const cw = evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'A\tB\n1\t2\n' }, { name: 'S2', text: 'D\tE\tF\n1\t2\t3\n' }] } } as AppNode,
        { id: 'c', type: 'columns', position: { x: 0, y: 0 }, data: { sheet: 'S2' } } as AppNode,
      ],
      [{ id: 'e', source: 'w', sourceHandle: 'book', target: 'c', targetHandle: 'in' }],
    ).get('c')!;
    ok(cw.outputs.out?.t === 'dataset' && cw.outputs.out.v.columns.map((c) => c.name).join() === 'D,E,F' && cw.view.sheets?.join() === 'S1,S2', 'Columns: a workbook on its input — the sheet it names');
    // every sheet: the same settings for all (a workbook out, columns matched by name), or each sheet its own (a sheet
    // without its own: the common ones); the list shown: of the sheet edited
    const every = (data: object) =>
      evaluateGraph(
        [
          { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'A\tB\n1\t2\n' }, { name: 'S2', text: 'A\tB\tF\n1\t2\t3\n' }, { name: 'S3', text: 'A\tB\n5\t6\n' }] } } as AppNode,
          { id: 'c', type: 'columns', position: { x: 0, y: 0 }, data: { sheet: '*', ...data } } as AppNode,
        ],
        [{ id: 'e', source: 'w', sourceHandle: 'book', target: 'c', targetHandle: 'in' }],
      ).get('c')!;
    const heads = (r: ReturnType<typeof every>) => (r.outputs.out?.t === 'workbook' ? r.outputs.out.v.sheets.map((q) => `${q.name}:${q.columns.map((c) => c.name).join()}`).join(' | ') : '');
    const sameAll = every({ items: [{ from: 'B', name: 'Signal' }, { from: 'A', keep: false }] });
    const ownEach = every({ perSheet: 'own', items: [{ from: 'B', name: 'Signal' }], sheets: { S2: { items: [{ from: 'F', name: 'Third' }, { from: 'A', keep: false }] } }, editSheet: 'S2' });
    ok(
      heads(sameAll) === 'S1:Signal | S2:Signal,F | S3:Signal' && heads(ownEach) === 'S1:Signal,A | S2:Third,B | S3:Signal,A' && ownEach.view.columnLines?.[0]?.name === 'Third' && sameAll.outputs.names?.t === 'column',
      `Columns: every sheet of a workbook — the same settings for all, or each its own (${heads(sameAll)}; ${heads(ownEach)})`,
    );
  }
  // Columns: the names from a column (all the others, the Y ones, a list; the column left out), columns added (a formula
  // of the columns, of an input {A}, of a column added above, with whole-column functions; a value; a copy), the formula
  // kept right when a column is renamed (stored by the names in, shown by the names out)
  {
    const ds = parseCsv('Sample;a;b;c\nS1;1;2;3\nS2;4;5;6\nS3;7;8;9\n', CSV_DEFAULTS).dataset;
    const nm = (r: ReturnType<typeof columnsOf>) => (typeof r === 'string' ? r : r.dataset.columns.map((c) => c.name).join());
    const vs = (r: ReturnType<typeof columnsOf>, name: string) => (typeof r === 'string' ? '' : Array.from(r.dataset.columns.find((c) => c.name === name)?.values ?? []).join());
    ok(nm(columnsOf(ds, { namesFrom: { col: '[Sample]' } })) === 'Sample,S1,S2,S3' && nm(columnsOf(ds, { namesFrom: { col: '[Sample]', drop: true } })) === 'S1,S2,S3', 'Columns: the names from a column (all the others; the column itself left out)');
    const few = columnsOf(ds, { namesFrom: { col: '[Sample]', to: 'list', list: '3-4' } });
    ok(nm(few) === 'Sample,a,S1,S2' && typeof few !== 'string' && few.warnings.some((w) => w.includes('3 names for 2 columns')) && nm(columnsOf(ds, { namesFrom: { col: '[Sample]', to: 'y' } })) === 'Sample,S1,S2,S3', 'Columns: the names from a column for a list of columns (more names than columns said), for the Y columns');
    const comp = (computed: ColumnsSpec['computed'], extra: Partial<ColumnsSpec> = {}, inputs = {}) => columnsOf(ds, { computed, ...extra }, inputs);
    const r1 = comp([{ id: 'c1', name: 'ratio', formula: '[a] / [b] * 100' }, { id: 'c2', name: 'twice', formula: '2 * [=c1] + i' }]);
    ok(vs(r1, 'ratio') === [50, 80, 87.5].join() && vs(r1, 'twice') === [101, 162, 178].join() && nm(r1) === 'Sample,a,b,c,ratio,twice', 'Columns: columns added — a formula of the columns, one of a column added above (and i), at the end');
    const ren = comp([{ id: 'c1', name: 'ratio', formula: '[a] / [b] * 100' }], { items: [{ from: 'a', name: 'alpha' }, { from: '=c1' }], namesFrom: undefined, prefix: 'R ' });
    const lines = typeof ren === 'string' ? [] : ren.lines;
    ok(vs(ren, 'ratio') === [50, 80, 87.5].join() && formulaShown('[a] / [b] * 100', lines) === '[alpha] / [R b] * 100' && formulaStored('[alpha] + [R c] * 10 + [b]', lines) === '[a] + [c] * 10 + [b]' && formulaStored('[gone] * 2', lines) === '[gone] * 2', 'Columns: a column renamed by hand or with a prefix — the formula still right, shown with the new names; typed with them, stored by the names in');
    // by the letters of the list: kept by the column (moved: its new letter shown, the same values), mean(B) of a whole
    // column, a letter past the list left as it is, a [ being typed not touched
    const lt = comp([]);
    const ltLines = typeof lt === 'string' ? [] : lt.lines;
    const byLetter = formulaStored('B / C * 100 + mean(B) - Z', ltLines);
    const moved = comp([{ id: 'c1', name: 'r', formula: byLetter.replace(' - Z', '') }], { items: [{ from: 'b' }, { from: 'Sample' }] });
    const movedLines = typeof moved === 'string' ? [] : moved.lines;
    ok(byLetter === '[@a] / [@b] * 100 + mean([@a]) - Z' && formulaShown(byLetter, ltLines) === 'B / C * 100 + mean(B) - Z' && formulaShown('[@a] / [@b]', movedLines) === 'C / A' && vs(moved, 'r') === [54, 84, 91.5].join() && formulaStored('[R 4', ltLines) === '[R 4', 'Columns: a formula by the letters of the list — kept by the column when it moves, mean(B) of a whole column, a [ being typed left alone');
    const unknownLetter = comp([{ id: 'c1', name: 'u', formula: '[@a] + Z' }]);
    ok(typeof unknownLetter !== 'string' && unknownLetter.warnings.some((w) => w.includes('“u”: unknown name Z')), 'Columns: a letter not in the list said, the letters of the columns still right');
    const named = comp([{ id: 'c1', name: 'sum', formula: '[a] + [b]' }], { namesFrom: { col: '[Sample]', drop: true } });
    ok(vs(named, 'sum') === [3, 9, 15].join() && typeof named !== 'string' && formulaShown('[a] + [b]', named.lines) === '[S1] + [S2]', 'Columns: the names from a column — a formula of the columns renamed still right');
    const port = comp([{ id: 'c1', name: 'scaled', formula: '[c] * {A} - mean([c])' }, { id: 'c2', name: 'k', kind: 'value', value: 7 }, { id: 'c3', name: 'copy', kind: 'copy', copy: '{B}' }], {}, { A: { name: 'f', value: 10 }, B: column('ext', Float64Array.of(9, 8, 7)) });
    ok(vs(port, 'scaled') === [24, 54, 84].join() && vs(port, 'k') === '7,7,7' && vs(port, 'copy') === '9,8,7', 'Columns: an input {A} (one value) in a formula, mean([c]) of a whole column; one value in every row; a copy of an input column {B}');
    const hidden = comp([{ id: 'c1', name: 'd', formula: '[b] - [a]' }], { items: [{ from: 'a', keep: false }, { from: 'b', keep: false }] });
    ok(nm(hidden) === 'Sample,c,d' && vs(hidden, 'd') === '1,1,1', 'Columns: a formula of columns left out of the data');
    const bad = comp([{ id: 'c1', name: 'x', formula: '[nope] * 2' }, { id: 'c2', name: 'y', formula: 'A * 2' }, { id: 'c3', name: 'z', formula: '[a] *' }]);
    ok(typeof bad !== 'string' && vs(bad, 'x') === 'NaN,NaN,NaN' && bad.warnings.some((w) => w.includes('“x”: no column [nope]')) && bad.warnings.some((w) => w.includes('“y”: unknown name A')) && bad.warnings.some((w) => w.startsWith('“z”')) && bad.dataset.columns.length === 7, 'Columns: a formula of a missing column, of a bare name, unfinished — said, the column empty, the others go on');
    const placed = comp([{ id: 'c1', name: 'r', formula: '[a] * 2' }], { items: [{ from: 'Sample' }, { from: '=c1' }, { from: 'a', keep: false }] });
    ok(nm(placed) === 'Sample,r,b,c' && typeof placed !== 'string' && placed.lines[1].computed === true && placed.lines[1].role === 'y', 'Columns: a column added in place of another (that one left out), marked as added');
    // generated as Generate column (as many rows as the data); a column of an input, its name its own until one is written
    const gen = comp([{ id: 'g1', name: 't', kind: 'generate', gen: { mode: 'linspace', start: 0, stop: 1 } }, { id: 'g2', name: 'noise', kind: 'generate', gen: { mode: 'random', dist: 'normal', a: 5, b: 2, seed: 7 } }, { id: 'g3', name: 'k', kind: 'generate', gen: { mode: 'formula', formula: '10*i' } }]);
    const gnode = evaluateGraph([{ id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, mode: 'random', dist: 'normal', a: 5, b: 2, seed: 7, count: 3 } } as AppNode], []).get('g')!.outputs.out;
    ok(vs(gen, 't') === '0,0.5,1' && vs(gen, 'k') === '10,20,30' && gnode?.t === 'column' && vs(gen, 'noise') === Array.from(gnode.v.values).join(), 'Columns: generated columns (evenly spaced, of i, random) — as many rows as the data, the same numbers as Generate column with the same seed');
    const fromIn = comp([{ id: 'p1', name: '', kind: 'copy', copy: '{A}' }, { id: 'p2', name: 'mine', kind: 'copy', copy: '[a]' }], {}, { A: column('Temperature (K)', Float64Array.of(300, 310, 320)) });
    ok(nm(fromIn) === 'Sample,a,b,c,Temperature (K),mine' && vs(fromIn, 'Temperature (K)') === '300,310,320' && vs(fromIn, 'mine') === '1,4,7', 'Columns: a column of an input (its own name), a copy of a column renamed');
  }
  // tick labels wrapped at their spaces (markup left alone); a turned text's extent
  ok(wrapLabel('Titanium dioxide nanoparticles', 12) === 'Titanium\\\\dioxide\\\\nanoparticles' && wrapLabel('Short', 12) === 'Short' && wrapLabel('x^{2} and a long tail', 5) === 'x^{2} and a long tail' && wrapLabel('Verylongword short', 4) === 'Verylongword\\\\short', 'tick labels: wrapped after N characters at the spaces (one long word kept; markup left alone)');
  ok(near(turnedExtent(10, 2, 0, true), 2) && near(turnedExtent(10, 2, 90, true), 10) && near(turnedExtent(10, 2, -90, false), 2) && near(turnedExtent(10, 2, 30, true), 10 * 0.5 + 2 * Math.cos(Math.PI / 6)), 'a turned text: its extent across a horizontal and a vertical axis');
  // columns moved with the mouse: the order by their places as read (the others after), with a column left out
  const abc = parseCsv('a;b;c\n1;2;3\n', CSV_DEFAULTS).dataset;
  const mv = applySheet(abc, { order: [2, 0] }, '.');
  const mv2 = applySheet(abc, { order: [2, 1], delCols: [0], cols: { 2: { name: 'C' } } }, '.');
  ok(mv.dataset.columns.map((c) => c.name).join() === 'c,a,b' && mv.map.cols.join() === '2,0,1' && mv2.dataset.columns.map((c) => c.name).join() === 'C,b' && mv2.dataset.columns[0].values[0] === 3 && hasEdits({ order: [1, 0] }), 'worksheet: columns moved (the edits follow them)');
  // ±Y as a value or a % of y; a − error of its own
  const e1 = run({ style: { errFrom: 'percent', errValue: 10 } }).cs[0];
  ok(near(e1.series.yErr!.values[21], 0.1), '±Y as 10 % of y');
  const e2 = run({ style: { errAsym: true }, cols: { x: 'θ', y: 'R', yerr: 'pore fraction', ylo: 'θ' } }).cs[0];
  ok(e2.series.yErrLo?.values[0] === 40 && e2.series.yErr?.values[25] === 0.1, 'a − error of its own');
}

// ---- workbooks: several sheets in one Import, Extract column from a sheet, Sheets to columns rules ----
{
  const names = ['Time', 'Signal', 'Temp', 'σ', 'Notes'];
  const f = (spec: string, letters = true) => pick(spec, names, letters).found.join(',');
  ok(f('1, 3-4') === '0,2,3' && f('B, D-E') === '1,3,4' && f('signal') === '1' && f('2-end') === '1,2,3,4', 'rules: numbers, ranges, letters, names');
  ok(f('*, !Notes, !1') === '1,2,3' && f('T*') === '0,2' && f('!5') === '0,1,2,3', 'rules: all, left out, patterns');
  ok(pick('9, Volts', names, true).missing.join('|') === '9|Volts', 'rules: what is not there is reported');
  ok(pick('Run*', ['Run 1', 'Notes', 'run 2'], false).found.join(',') === '0,2', 'rules: sheets by a pattern');
  // an Import of three sheets (text and Excel-like); Extract column from the second; Sheets to columns over all
  const sheet = (k: number) => ({ name: `Run ${k}`, text: `Time\tSignal\tσ\n0\t${k}\t0.1\n1\t${2 * k}\t0.2\n`, excel: true });
  const imp = { id: 'w', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, textId: 'w', sheets: [sheet(1), sheet(2), { name: 'Notes', text: 'a;b\n1,5;2\n' }], sheet: 1 } } as AppNode;
  const ex = { id: 'x', type: 'extract', position: { x: 0, y: 0 }, data: { column: 'Signal', index: 1, sheet: 'Run 2' } } as AppNode;
  const au = { id: 'a', type: 'autoextract', position: { x: 0, y: 0 }, data: { rules: [{ sheets: 'Run*', columns: '1', role: 'x' }, { sheets: 'Run*', columns: 'B', role: 'y' }, { sheets: 'Run*', columns: 'σ', role: 'yerr' }], names: 'sheet' } } as AppNode;
  const res = evaluateGraph([imp, ex, au], [
    { id: '1', source: 'w', sourceHandle: 'book', target: 'x', targetHandle: 'in' },
    { id: '2', source: 'w', sourceHandle: 'book', target: 'a', targetHandle: 'in' },
  ]);
  const wo = res.get('w')!.outputs;
  ok(wo.book?.t === 'workbook' && wo.book.v.sheets.length === 3 && wo.out?.t === 'dataset' && wo.out.v.name === 'Run 2', 'import: a workbook, the sheet shown on “dataset”');
  ok(wo.book?.t === 'workbook' && wo.book.v.sheets[2].columns[0].values[0] === 1.5, 'import: a text sheet keeps the text settings (decimal comma)');
  const xo = res.get('x')!.outputs.out;
  ok(xo?.t === 'column' && xo.v.values[1] === 4, 'Extract column: a column of the sheet chosen');
  const ao = res.get('a')!.outputs.out;
  ok(ao?.t === 'dataset' && ao.v.columns.map((c) => `${c.name}/${c.role}`).join(',') === 'Run 1: Time/x,Run 1/y,Run 1: σ/yerr,Run 2: Time/x,Run 2/y,Run 2: σ/yerr', 'Sheets to columns: the columns, in sheet order, named and designated');
  ok(ao?.t === 'dataset' && JSON.stringify(curvesByRole(ao.v.columns).curves[1]) === JSON.stringify({ x: 'Run 2: Time', y: 'Run 2', yerr: 'Run 2: σ' }), 'Sheets to columns: a quick plot from its designations');
  const names2 = autoExtract([{ name: 'A', columns: [column('t', new Float64Array(1))] }, { name: 'B', columns: [column('t', new Float64Array(1))] }], [{ sheets: '*', columns: '1', role: 'x' }], 'column').dataset.columns.map((c) => c.name);
  ok(names2.join('|') === 't|t (2)', 'Sheets to columns: names kept different');
  // simple: the sheets ticked, the columns of the first by their place (the sheet's own designations unless chosen)
  const simpleNode = { ...au, id: 's', data: { rules: [], names: 'sheet', mode: 'simple', pick: ['Run 2', 'Run 1'], roles: [null, null, 'none'] } } as AppNode;
  const sr = evaluateGraph([imp, simpleNode], [{ id: '3', source: 'w', sourceHandle: 'book', target: 's', targetHandle: 'in' }]).get('s')!;
  const so = sr.outputs.out;
  ok(so?.t === 'dataset' && so.v.columns.map((c) => `${c.name}/${c.role}`).join(',') === 'Run 1: Time/x,Run 1/y,Run 2: Time/x,Run 2/y' && sr.view.extractCols?.sheet === 'Run 1' && sr.view.extractCols.columns.map((c) => c.role).join() === 'x,y,none', 'Sheets to columns simple: the sheets ticked, every column with its designation (one not taken)');
  const none = evaluateGraph([imp, { ...simpleNode, data: { ...simpleNode.data, pick: [] } } as AppNode], [{ id: '3', source: 'w', sourceHandle: 'book', target: 's', targetHandle: 'in' }]).get('s')!;
  ok(!none.outputs.out && none.view.waiting === 'Tick a sheet.', 'Sheets to columns simple: no sheet ticked — said');
}

// ---- Data manipulation: masks, deletions, moves; masks through Math column, Statistics, Plot ----
{
  const ds = parseCsv('t;y\n1;10\n2;20\n3;30\n4;40\n5;50\n', CSV_DEFAULTS).dataset;
  const r = applyManip(ds, 't', 'y', [
    { kind: 'mask', rows: '2, 4', n: 5 },
    { kind: 'unmask', rows: '4', n: 5 },
    { kind: 'move', rows: '3', n: 5, dy: 5 },
    { kind: 'scale', rows: '5', n: 5, axis: 'y', factor: 2 },
    { kind: 'delete', rows: '1', n: 5 },
  ]);
  ok(typeof r !== 'string' && Array.from(r.dataset.columns[1].values).join(',') === '20,35,40,100' && Array.from(r.dataset.columns[1].mask ?? []).join(',') === '1,0,0,0', 'manip: masked, unmasked, moved, scaled, deleted');
  ok(typeof r !== 'string' && r.state[0] === ROW_DELETED && r.state[1] === ROW_MASKED && r.state[2] === ROW_CHANGED, 'manip: the state of every input row');
  const rr = applyManip(ds, 't', 'y', [
    { kind: 'delete', rows: '1, 2', n: 5 },
    { kind: 'mask', rows: '3', n: 5 },
    { kind: 'restore', rows: '1, 3', n: 5 },
  ]);
  ok(typeof rr !== 'string' && !(rr.state[0] & ROW_DELETED) && (rr.state[1] & ROW_DELETED) && !(rr.state[2] & ROW_MASKED) && rr.dataset.columns[0].values.length === 4, 'manip: restore makes deleted or masked points normal again');
  ok(typeof r !== 'string' && r.warnings.length === 0 && typeof applyManip(ds, 't', 'y', [{ kind: 'mask', rows: '1', n: 9 }]) !== 'string' && (applyManip(ds, 't', 'y', [{ kind: 'mask', rows: '1', n: 9 }]) as { warnings: string[] }).warnings.length === 1, 'manip: a warning when the data have another number of rows');
  ok(JSON.stringify(renumber([{ kind: 'mask', rows: '2, 4-5', n: 5 }], new Set([0, 2]), 5)) === JSON.stringify([{ kind: 'mask', rows: '1-3', n: 3 }]), 'manip: rows counted again after deletions');
  // the mask goes on: Math column, Statistics (left out), Plot (the masked points of the curve)
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 't;y\n1;10\n2;20\n3;1000\n', textId: 'm' } } as AppNode;
  const dm = { id: 'd', type: 'datamanip', position: { x: 0, y: 0 }, data: { x: 't', y: 'y', ops: [{ kind: 'mask', rows: '3', n: 3 }] } } as AppNode;
  const ex = { id: 'e', type: 'extract', position: { x: 0, y: 0 }, data: { column: 'y', index: 1 } } as AppNode;
  const mc = { id: 'm', type: 'mathcol', position: { x: 0, y: 0 }, data: { name: '', formula: 'A*2' } } as AppNode;
  const st = { id: 's', type: 'stats', position: { x: 0, y: 0 }, data: {} } as AppNode;
  const pl = { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {}, cols: { x: 't', y: 'y' } } } as AppNode;
  const res = evaluateGraph([imp, dm, ex, mc, st, pl], [
    { id: '1', source: 'i', sourceHandle: 'out', target: 'd', targetHandle: 'in' },
    { id: '2', source: 'd', sourceHandle: 'out', target: 'e', targetHandle: 'in' },
    { id: '3', source: 'e', sourceHandle: 'out', target: 'm', targetHandle: 'in-0' },
    { id: '4', source: 'm', sourceHandle: 'out', target: 's', targetHandle: 'in' },
    { id: '5', source: 'd', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' },
  ]);
  const mo = res.get('m')!.outputs.out;
  ok(mo?.t === 'column' && Array.from(mo.v.mask ?? []).join(',') === '0,0,1', 'mask: through Extract column and Math column');
  ok(res.get('s')!.view.stats?.mean === 30 && res.get('s')!.warnings.length === 1, 'mask: Statistics leaves the masked rows out');
  const pc = res.get('p')!.view.curves;
  ok(!!pc && Array.from(pc[0].mask ?? []).join(',') === '0,0,1', 'mask: the masked points of a Plot curve');
}

// ---- Extract column: the rows taken (all, ranges, a list, where), one value of them; an older one value kept ----
{
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'E;I\n' + Array.from({ length: 10 }, (_, k) => `${(k * 0.1).toFixed(1)};${k * k}`).join('\n'), textId: 'ex-rows' } } as AppNode;
  const run = (d: Partial<ExtractData>) => {
    const r = evaluateGraph([imp, { id: 'e', type: 'extract', position: { x: 0, y: 0 }, data: { column: 'I', index: 1, ...d } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'e', targetHandle: 'in' }]).get('e')!;
    const o = r.outputs.out;
    return o?.t === 'column' ? Array.from(o.v.values).join(',') : o?.t === 'scalar' ? String(+o.v.value.toPrecision(10)) : `error: ${r.errors.join(' ')}`;
  };
  const where = { mode: 'rule' as const, rule: 'x > 0.55' };
  const ok1 = run({}) === '0,1,4,9,16,25,36,49,64,81' && run({ rows: where }) === '36,49,64,81' && run({ rows: { mode: 'list', list: '2, 4-5' } }) === '1,9,16' && run({ rows: { mode: 'range', by: 'x', ranges: [{ from: 0.2, to: 0.4 }] } }) === '4,9,16';
  const ok2 = run({ value: true, rows: where }) === '36' && run({ value: true, rows: where, pick: 'last' }) === '81' && run({ value: true, rows: where, pick: 'mean' }) === '57.5' && run({ value: true, rows: where, pick: 'count' }) === '4' && run({ value: true, rows: { mode: 'rule', rule: 'x == 0.3' } }) === '9';
  const ok3 = run({ value: true, row: 4 }) === '9' && run({ rows: { mode: 'rule', rule: 'x > 5' } }).startsWith('error: No row chosen');
  ok(ok1 && ok2 && ok3, `Extract column: rows where x > 0.55 (${run({ rows: where })}), a list, a range of X; one value (first, last, mean ${run({ value: true, rows: where, pick: 'mean' })}, count; I where E = 0.3: ${run({ value: true, rows: { mode: 'rule', rule: 'x == 0.3' } })}); an older one value kept; none chosen said`);
}

// ---- Statistics on columns / rows, the rows chosen ----
{
  const x = column('x', Float64Array.from([400, 450, 500, 550, 600, 650]));
  const a = column('a', Float64Array.from([1, 2, 3, 4, 5, 6]));
  const sr = (sel: Parameters<typeof selectRows>[0]) => {
    const r = selectRows(sel, 6, x, [x, a]);
    return typeof r === 'string' ? r : r.rows.join(',');
  };
  ok(pick('A1-A3', ['λ', 'A1', 'A2', 'A3', 'note'], true).found.join(',') === '1,2,3', 'columns: a range of names (A1-A3)');
  ok(sr({ mode: 'all' }) === '0,1,2,3,4,5' && sr({ mode: 'range', ranges: [{ from: 2, to: 3 }, { from: 6, to: NaN }] }) === '1,2,5', 'rows: ranges of row numbers with a break');
  ok(sr({ mode: 'range', by: 'x', ranges: [{ from: 600, to: 450 }] }) === '1,2,3,4' && sr({ mode: 'list', list: '1, 4-end' }) === '0,3,4,5', 'rows: a range of X values, a list');
  ok(sr({ mode: 'rule', rule: 'x > 450 and B < 6' }) === '2,3,4' && typeof selectRows({ mode: 'rule', rule: 'q > 1' }, 6, x, [x, a]) === 'string', 'rows: a rule of x and the columns; an unknown name reported');
  // where: conditions chosen (no formula), all of them or any; the formula they make keeps the same rows
  const cx = (op: RowOp, v?: number, v2?: number, col = '') => ({ col, op, v, v2 });
  ok(sr({ mode: 'rule', conds: [cx('>', 450), cx('<', 6, undefined, 'a')] }) === '2,3,4', 'rows: where conditions, all of them (x > 450, a < 6)');
  ok(sr({ mode: 'rule', join: 'any', conds: [cx('<', 450), cx('>', 600)] }) === '0,5' && sr({ mode: 'rule', conds: [cx('between', 600, 450)] }) === '1,2,3,4', 'rows: where any condition (x < 450 or x > 600); between (both ends, either order)');
  ok(sr({ mode: 'rule', conds: [cx('=', 500), cx('<', NaN)] }) === '2' && sr({ mode: 'rule', conds: [cx('!=', 3, undefined, 'a')] }) === '0,1,3,4,5', 'rows: = and ≠; a condition without its value left aside');
  ok(sr({ mode: 'rule', rule: 'x > 600', conds: [cx('<', 450)] }) === '0' && sr({ mode: 'rule', rule: 'x > 600', conds: [cx('<', 450)], formula: true }) === '5' && sr({ mode: 'rule', rule: 'x > 600' }) === '5', 'rows: the conditions, or the formula when chosen (an older project: its formula)');
  const fz = condsFormula([cx('>', 450), cx('between', 2, 5, 'a'), cx('filled', undefined, undefined, 'a')], 'any', x, [x, a]);
  ok(fz === 'x > 450 or (B >= 2 and B <= 5) or (not isnan(B))' && sr({ mode: 'rule', rule: fz!, formula: true }) === sr({ mode: 'rule', join: 'any', conds: [cx('>', 450), cx('between', 2, 5, 'a'), cx('filled', undefined, undefined, 'a')] }), `rows: the conditions written as a formula, the same rows (${fz})`);
  // is one of: the values given (a value not a number left aside), the same rows as its formula (isin)
  const isIn = { col: 'a', op: 'in' as RowOp, vs: [2, 5, NaN, 9] };
  const inText = selectRows({ mode: 'rule', conds: [isIn] }, 6, x, [x, a]);
  const fin = condsFormula([isIn, cx('>', 600)], 'any', x, [x, a]);
  ok(sr({ mode: 'rule', conds: [isIn] }) === '1,4' && typeof inText !== 'string' && inText.text === 'where a is one of 2, 5, 9' && fin === 'isin(B, 2, 5, 9) or x > 600' && sr({ mode: 'rule', rule: fin!, formula: true }) === '1,4,5', `rows: is one of (a in 2, 5, 9), said, as a formula (${fin})`);
  ok(sr({ mode: 'rule', conds: [{ col: 'a', op: 'in', vs: [] }] }) === '0,1,2,3,4,5', 'rows: is one of with no values yet left aside');
  const gap = column('g', Float64Array.from([0, NaN, 2, 0, NaN, 5]));
  const sg = (op: RowOp) => {
    const r = selectRows({ mode: 'rule', conds: [cx(op, undefined, undefined, 'g')] }, 6, x, [x, gap]);
    return typeof r === 'string' ? r : r.rows.join(',');
  };
  ok(sg('empty') === '1,4' && sg('filled') === '0,2,3,5', 'rows: is empty / is not empty (a 0 is a value)');
  // more statistics asked: percentiles (D10, D90 of a distribution) and the 95 % confidence interval of the mean
  const ex = extraStats('10, 90', 95);
  const dd = describeAll(Array.from({ length: 10 }, (_, i) => i + 1), ex, 95);
  ok(ex.map((e) => e.key).join() === 'p10,p90,cilo,cihi' && near(dd.p10, 1.9, 1e-12) && near(dd.p90, 9.1, 1e-12) && near(dd.cilo, 3.3341, 1e-3) && near(dd.cihi, 7.6659, 1e-3), `statistics: percentiles and the confidence interval of the mean (${dd.p10}, ${dd.p90}, ${dd.cilo.toFixed(4)} … ${dd.cihi.toFixed(4)})`);
  // the odd or even rows of those chosen; a formula on top of any choice; the row number in a condition; % in formulas
  const m = compile('(-1) % 2 + 7 % 3');
  ok(
    sr({ mode: 'all', pick: 'odd' }) === '0,2,4' &&
      sr({ mode: 'list', list: '1, 2, 4-6', pick: 'even' }) === '1,3,5' &&
      sr({ mode: 'all', also: 'row % 2 == 0 and x > 450', alsoOn: true }) === '3,5' &&
      sr({ mode: 'all', also: 'row % 2 == 0', alsoOn: false }) === '0,1,2,3,4,5' &&
      sr({ mode: 'rule', conds: [cx('>', 3, undefined, '#')] }) === '3,4,5' &&
      sr({ mode: 'rule', rule: 'row % 3 == 0', formula: true }) === '2,5' &&
      typeof m !== 'string' &&
      m.fn({}) === 2,
    'rows: odd and even rows, a formula on top, the row number in a condition, row and % in formulas',
  );
  // Filter & sort rows ▸ split: x < 500 and x ≥ 500 parts, the rest (none), and a part by row number
  const xa = { name: 'd', columns: [{ ...x, role: 'x' as const }, a] };
  const sp = splitParts(xa, [{ name: 'low', sel: { mode: 'rule', conds: [cx('<', 500)] } }, { name: 'high', sel: { mode: 'rule', conds: [cx('>=', 500)] } }, { name: 'odd', sel: { mode: 'all', pick: 'odd' } }], true);
  ok(typeof sp !== 'string' && sp.map((p) => `${p.name}:${Array.from(p.columns[1].values).join('/')}`).join(' ') === 'low:1/2 high:3/4/5/6 odd:1/3/5 the rest:', `filter: split into parts (${typeof sp === 'string' ? sp : sp.map((p) => p.name).join(', ')})`);
  const text = 'λ;r1;r2;r3;note\n400;1;2;3;5\n410;2;4;6;5\n420;3;3;3;5\n';
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'st' } } as AppNode;
  const rows = { id: 'r', type: 'stats', position: { x: 0, y: 0 }, data: { on: 'rows', cols: '2-4', x: '', err: 'sd', rows: { mode: 'range', ranges: [{ from: 1, to: 2 }] } } } as AppNode;
  const cols = { id: 'c', type: 'stats', position: { x: 0, y: 0 }, data: { cols: 'r1, r3', rows: { mode: 'rule', rule: 'x >= 410' } } } as AppNode;
  const edges = [
    { id: '1', source: 'i', sourceHandle: 'out', target: 'r', targetHandle: 'in' },
    { id: '2', source: 'i', sourceHandle: 'out', target: 'c', targetHandle: 'in' },
  ];
  const res = evaluateGraph([imp, rows, cols], edges);
  const R = res.get('r')!;
  const mean = R.outputs.mean;
  const sd = R.outputs.sd;
  ok(mean?.t === 'column' && Array.from(mean.v.values).join(',') === '2,4' && sd?.t === 'column' && near(sd.v.values[1], 2), 'Statistics on rows: mean and SD of every row chosen');
  const ds = R.outputs.out;
  ok(ds?.t === 'dataset' && ds.v.columns.map((c) => `${c.name}:${c.role}`).slice(0, 3).join(' ') === 'λ:x Mean:y SD:yerr' && ds.v.columns[0].values.length === 2, 'Statistics on rows: the dataset X, Mean (Y), SD (±Y) on the rows chosen');
  const C = res.get('c')!;
  const cm = C.outputs.mean;
  const tb = C.outputs.table;
  ok(cm?.t === 'column' && Array.from(cm.v.values).join(',') === '2.5,4.5' && tb?.t === 'dataset' && tb.v.columns[0].text?.join(',') === 'r1,r3', 'Statistics on columns: of the columns chosen, on the rows of a rule; the table');
  const ctx = { node: (id: string) => [imp, rows, cols].find((n) => n.id === id), edges };
  ok(sourcePort(cols, 'mean', ctx) === 'column' && sourcePort({ ...cols, id: 'z' } as AppNode, 'mean', ctx) === 'scalar' && sourcePort(rows, 'mean', ctx) === 'column', 'Statistics: a value of a column, a column of a dataset (port types)');
}

// ---- Fit: models, errors, weights, ranges, masks, runs, global fit, the strong-coupling example ----
{
  ok(near(tQuantile(0.975, 10), 2.228139, 1e-5) && near(tQuantile(0.975, 1), 12.7062, 1e-4), 'fit: Student t quantiles');
  const mk = (xs: number[], ys: number[], extra = '') => ({ id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: `x;y${extra ? ';e' : ''}\n` + xs.map((x, i) => `${x};${ys[i]}${extra ? ';0.1' : ''}`).join('\n'), textId: String(xs.length) + extra } }) as AppNode;
  const run = (imp: AppNode, data: Partial<FitNodeData>) => {
    const res = evaluateGraph([imp, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ys: ['y'], ...data } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]);
    return res.get('f')!;
  };
  const val = (r: ReturnType<typeof run>, name: string, k = 0) => r.view.fit!.runs[k].params.find((p) => p.name === name)!;
  // a straight line: exact values; the standard errors as numpy.polyfit(cov=True) gives them
  const xs = [0, 1, 2, 3, 4, 5, 6, 7];
  const ys = [1.1, 2.9, 5.2, 7.1, 8.8, 11.2, 13.1, 14.8];
  const lin = run(mk(xs, ys), { model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'linear' } });
  ok(near(val(lin, 'b').value, 1.9833333333, 1e-8) && near(val(lin, 'a').value, 1.0833333333, 1e-8), `fit: a line (${val(lin, 'a').value}, ${val(lin, 'b').value})`);
  ok(near(val(lin, 'b').error, 0.02697245, 1e-6) && near(val(lin, 'a').error, 0.11283387, 1e-6), `fit: standard errors as numpy (${val(lin, 'a').error}, ${val(lin, 'b').error})`);
  ok(near(lin.view.fit!.runs[0].stats.r2, 0.9988915424690388, 1e-9), 'fit: R²');
  // a Gaussian recovered from its own values, from guessed start values; a formula
  const gx = Array.from({ length: 81 }, (_, i) => i * 0.25);
  const gy = gx.map((x) => 0.3 + 2 * Math.exp((-4 * Math.LN2 * (x - 9.3) ** 2) / 2.2 ** 2));
  const ga = run(mk(gx, gy), { model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' } });
  ok(near(val(ga, 'xc').value, 9.3, 1e-6) && near(val(ga, 'w').value, 2.2, 1e-6) && near(val(ga, 'A').value, 2, 1e-6), 'fit: a Gaussian from guessed starts');
  const fo = run(mk(gx, gy), { model: { ...FIT_DEFAULTS.model, kind: 'formula', formula: 'y = c + A*exp(-4*ln(2)*(x - m)^2/w^2)' }, params: [{ name: 'm', value: 9, fixed: false, min: NaN, max: NaN, shared: false }, { name: 'w', value: 2, fixed: false, min: NaN, max: NaN, shared: false }] });
  ok(near(val(fo, 'm').value, 9.3, 1e-6) && near(val(fo, 'c').value, 0.3, 1e-6), 'fit: a formula of one’s own');
  // a fixed parameter, a fit range, a band
  const fx = run(mk(gx, gy), { model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' }, params: [{ name: 'y0', value: 0.3, fixed: true, min: NaN, max: NaN, shared: false }], ranges: [{ lo: 5, hi: 14 }] });
  ok(val(fx, 'y0').value === 0.3 && fx.view.fit!.runs[0].stats.n === 37 && fx.outputs.fit?.t === 'dataset' && fx.outputs.fit.v.columns.length === 3 && fx.outputs.fit.v.columns[2].role === 'yerr' && fx.outputs.fit.v.columns[2].band === true, 'fit: fixed, a range of X, the band as ±Y');
  // two peaks numbered from left to right
  const py = gx.map((x) => 1 - 0.5 / (1 + ((2 * (x - 14)) / 1.5) ** 2) - 0.8 / (1 + ((2 * (x - 6)) / 2) ** 2));
  const pk = run(mk(gx, py), { model: { ...FIT_DEFAULTS.model, kind: 'peaks', shape: 'lorentz', count: 2, baseline: 'constant' } });
  ok(near(val(pk, 'xc1').value, 6, 1e-6) && near(val(pk, 'xc2').value, 14, 1e-6) && near(val(pk, 'A2').value, -0.5, 1e-6), 'fit: two peaks, numbered from the left');
  // every run, and a global fit with a shared parameter
  let text = 'run;x;y\n';
  for (const k of [1, 2, 3]) for (const x of gx) text += `${k};${x};${0.3 + k * Math.exp((-4 * Math.LN2 * (x - 9.3) ** 2) / 2.2 ** 2)}\n`;
  // the sweep cut by Split into columns (a y column per run, each keeping its run), then fitted: every Y column a run
  const sweepImp = { id: 'si', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'sw' } } as AppNode;
  const sweepCut = { id: 'i', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, x: 'x', ys: 'y', by: 'column', column: 'run' } } as AppNode;
  const swEdge = { id: 'sw', source: 'si', sourceHandle: 'out', target: 'i', targetHandle: 'in' };
  const runSw = (data: Partial<FitNodeData>) =>
    evaluateGraph([sweepImp, sweepCut, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: '', ys: [], ...data } } as AppNode], [swEdge, { id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]).get('f')!;
  const each = runSw({ model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' } });
  const pt = each.outputs.params;
  ok(each.view.fit!.runs.length === 3 && pt?.t === 'dataset' && JSON.stringify(Array.from(pt.v.columns.find((c) => c.name === 'A')!.values).map((v) => +v.toFixed(6))) === '[1,2,3]' && pt.v.columns.slice(0, 5).map((c) => c.name).join() === 'fit,run,range,X from,X to' && pt.v.columns[1].role === 'x' && Array.from(pt.v.columns[1].values).join() === '1,2,3' && pt.v.columns.some((c) => c.name === 'adj. R²'), 'fit: every run; a row per fit — its number, its block value (named as the blocks), range, X from / to, the parameters, the statistics');
  const fc = each.outputs.fit?.t === 'dataset' ? each.outputs.fit.v.columns : [];
  ok(fc.length === 9 && fc[1].role === 'y' && fc[1].key?.value === 1 && fc[7].key?.value === 3 && fc[2].band === true && JSON.stringify(Array.from(pt!.t === 'dataset' ? pt!.v.columns[0].values : [])) === '[1,2,3]' && !Object.keys(each.outputs).some((k) => k.startsWith('p:')), `fit: the curves of all runs as a dataset (an X, a fit and a band column each, with its run), no port per parameter (${fc.map((c) => c.name).join(', ')})`);
  const glob = runSw({ global: true, model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' }, params: [{ name: 'xc', value: NaN, fixed: false, min: NaN, max: NaN, shared: true }, { name: 'w', value: NaN, fixed: false, min: NaN, max: NaN, shared: true }] });
  ok(near(val(glob, 'xc', 0).value, 9.3, 1e-6) && val(glob, 'xc', 2).value === val(glob, 'xc', 0).value && near(val(glob, 'A', 2).value, 3, 1e-6) && val(glob, 'xc', 1).shared, 'fit: global, shared parameters common to the runs');
  // a parameter taken from the table: Extract column, a column (every run) or one value
  const exP = (data: object) =>
    evaluateGraph([sweepImp, sweepCut, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: '', ys: [], model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' } } } as AppNode, { id: 'e', type: 'extract', position: { x: 0, y: 0 }, data: { column: 'A', index: 0, ...data } } as AppNode], [
      swEdge,
      { id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' },
      { id: '2', source: 'f', sourceHandle: 'params', target: 'e', targetHandle: 'in' },
    ]).get('e')!;
  const pc = exP({}).outputs.out;
  const pv = exP({ value: true, row: 2 }).outputs.out;
  ok(pc?.t === 'column' && pc.v.values.length === 3 && pv?.t === 'scalar' && near(pv.v.value, 2, 1e-6) && exP({ value: true, row: 4 }).errors.length === 1, 'Extract column: a parameter as a column or one value (a row)');
  // masked points left out, instrumental weights
  const dmImp = mk(gx, gy.map((y, i) => (i === 40 ? y + 5 : y)), 'e');
  const dm = { id: 'd', type: 'datamanip', position: { x: 0, y: 0 }, data: { x: 'x', y: 'y', ops: [{ kind: 'mask', rows: '41', n: 81 }] } } as AppNode;
  const fm = evaluateGraph([dmImp, dm, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ys: ['y'], yerr: 'e', model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' } } } as AppNode], [
    { id: '1', source: 'i', sourceHandle: 'out', target: 'd', targetHandle: 'in' },
    { id: '2', source: 'd', sourceHandle: 'out', target: 'f', targetHandle: 'in' },
  ]).get('f')!;
  ok(fm.view.fit!.runs[0].stats.n === 80 && near(fm.view.fit!.runs[0].params[1].value, 2, 1e-6), 'fit: a masked point left out');
  // the strong-coupling example: every run fitted, then Ω of the anticrossing
  const sc = EXAMPLES.find((e) => e.name.startsWith('Strong coupling'))!.make();
  const scr = evaluateGraph(sc.nodes, sc.edges);
  const runs = scr.get('sc-fit')!.view.fit!.runs;
  const W = scr.get('sc-disp')!.view.fit!.runs[0].params.find((p) => p.name === 'W')!;
  ok(runs.length === 23 && runs.every((r) => r.stats.r2 > 0.98), `strong coupling: 23 runs fitted (worst R² ${Math.min(...runs.map((r) => r.stats.r2)).toFixed(4)})`);
  ok(near(W.value, 44.8, 0.01) && W.error < 1, `strong coupling: Ω = ${W.value.toFixed(2)} ± ${W.error.toFixed(2)} nm`);
}

// ---- rich text ----
{
  const l = parseRich('\\alpha^{2} x_{i}\\\\\\bold{B} \\size{12}{big}');
  ok(l.length === 2, 'rich text: two lines');
  ok(l[0][0].t === 'α' && l[0][1].t === '2' && l[0][1].shift < 0 && l[0][1].scale < 1, 'rich text: symbol and superscript');
  ok(l[0].some((r) => r.t === 'i' && r.shift > 0), 'rich text: subscript');
  ok(l[1][0].bold && l[1][0].t === 'B' && l[1].some((r) => r.size === 12 && r.t === 'big'), 'rich text: bold, size');
  ok(plainText('\\Delta n') === 'Δn', 'rich text: plain (the space after a command ends it)');
  ok(parseRich('line one\nline two').length === 2, 'rich text: a real new line');
  // formulas between $ signs; a $ that opens nothing stays a $
  const f = parseRich('Energy $\\Delta E^{2}$ (eV) and $$\\frac{a}{b}$$')[0];
  ok(f[0].t === 'Energy ' && f[1].math?.display === false && f[1].t === '\\Delta E^{2}' && f[2].t === ' (eV) and ' && f[3].math?.display === true && f[3].t === '\\frac{a}{b}', 'rich text: $…$ a formula, $$…$$ one drawn larger');
  const lit = (s: string) => parseRich(s)[0].every((r) => !r.math) && plainText(s).includes('$');
  ok(lit('Cost ($)') && lit('from $5 to $10') && lit('\\$x$') && lit('a $ b $ c'), 'rich text: a $ with no formula (a price, an escaped \\$, spaces inside) stays as it is');
  const st = { font: TEXT_DEFAULTS.font, size: 10, bold: false, italic: false, color: '#000000' };
  const k = mathKey('x_{test}', false, 'sans');
  const w0 = richMetrics('a $x_{test}$', st).width;
  setMathSizes([[k, { w: 3, h: 0.7, d: 0.2 }]]);
  ok(richMetrics('a $x_{test}$', st).width > w0 && Math.abs(richMetrics('$x_{test}$', st).width - 30) < 1e-9, 'rich text: a formula measured by its size once drawn (a guess before)');
  ok(richMetrics('$$\\sum_{k=1}^{n} k$$', st).lineHeight > st.size * 1.2, 'rich text: a tall formula makes its line taller');
  // the math font chosen from the text's
  const faces = FONTS.map(([f]) => mathFace(f, undefined)).join(',');
  ok(faces === 'sans,sans,serif,sans,serif,sans,serif,sans' && mathFace('CMU Serif', undefined) === 'latex' && mathFace("'Times New Roman', serif", 'latex') === 'latex', `rich text: the math font follows the text's (sans, serif, LaTeX) or the choice (${faces})`);
  // a Plot whose title has a formula: laid out again when the formula's size is known (the rest kept as computed)
  const cache = newCache();
  const graph = (): [AppNode[], Parameters<typeof evaluateGraph>[1]] => [
    [
      { id: 'mi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;0\n1;1\n', textId: 'mi' } } as AppNode,
      { id: 'mp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, axes: { ...AXES_STYLE_DEFAULTS, sides: { ...AXES_STYLE_DEFAULTS.sides, left: { ...SIDE_DEFAULTS, title: '$$\\sum_{k=1}^{n} y_k$$' } } } } } as AppNode,
    ],
    [{ id: 'e', source: 'mi', sourceHandle: 'out', target: 'mp', targetHandle: 'dataset' }],
  ];
  const left = (r: ReturnType<typeof evaluateGraph>) => (r.get('mp')!.outputs.figure as { v: Figure }).v.axes[0].style.pos.x;
  const r1 = evaluateGraph(...graph(), cache);
  setMathSizes([[mathKey('\\sum_{k=1}^{n} y_k', true, 'sans'), { w: 3, h: 4, d: 3 }]]);
  const r2 = evaluateGraph(...graph(), cache);
  const r3 = evaluateGraph(...graph(), cache);
  ok(left(r2) > left(r1) + 5 && r2.get('mi')!.rev === r1.get('mi')!.rev && r3.get('mp')!.rev === r2.get('mp')!.rev, `rich text: a figure laid out again with a formula's size once known, nothing else computed again (${left(r1).toFixed(1)} → ${left(r2).toFixed(1)})`);
}

// ---- formulas with conditions ----
{
  const v = (src: string, vars: Record<string, number> = {}) => {
    const f = compile(src);
    return typeof f === 'string' ? NaN : f.fn(vars);
  };
  ok(v('A > 5 and B < 2', { A: 6, B: 1 }) === 1 && v('A > 5 and B < 2', { A: 6, B: 3 }) === 0, 'and, comparisons');
  ok(v('A == 1 or not (B >= 2)', { A: 0, B: 1 }) === 1, 'or, not');
  ok(v('if(A < 0, -A, A)', { A: -3 }) === 3, 'if');
  ok(Number.isNaN(v('NaN')) && v('isnan(NaN)') === 1, 'NaN constant, isnan');
  ok(v('round(2.345, 2)') === 2.35 && v('mod(-1, 3)') === 2, 'round, mod');
  ok(Number.isNaN(v('A > 1', { A: NaN })), 'a comparison with a missing value is missing');
}

// ---- Math column ▸ rules for chosen rows, row lists (rule 2 sees the values rule 1 left: v) ----
{
  ok(JSON.stringify(parseRows('3, 7, 10-12, 1:4:9, 19-end', 20)) === JSON.stringify([0, 2, 4, 6, 8, 9, 10, 11, 18, 19]), 'row lists');
  ok(typeof parseRows('3, x', 10) === 'string', 'bad row list reported');
  const nodes = [
    { id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, name: 'g', mode: 'formula', formula: 'i', count: 10 } },
    { id: 'e', type: 'mathcol', position: { x: 0, y: 0 }, data: { name: '', formula: 'A', rules: [{ mode: 'rows', rows: '2, 4-5', formula: 'A + 100' }, { mode: 'condition', rows: 'v > 8', formula: 'v * 2' }] } },
  ] as AppNode[];
  const res = evaluateGraph(nodes, [{ id: 'x', source: 'g', sourceHandle: 'out', target: 'e', targetHandle: 'in-0' }]);
  const out = res.get('e')?.outputs.out;
  const vals = out?.t === 'column' ? Array.from(out.v.values) : [];
  ok(JSON.stringify(vals) === JSON.stringify([1, 204, 3, 208, 210, 6, 7, 8, 18, 20]) && out?.t === 'column' && out.v.name === 'g' && res.get('e')?.view.changed === 5, `Math column: rules in order, the input's name kept (${vals.join(', ')})`);
}

// ---- Math column: functions of a whole column, one value out ----
{
  const at = { x: 0, y: 0 };
  const g = { id: 'g', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'g', mode: 'formula', formula: 'i', count: 5 } } as AppNode;
  const run = (data: Record<string, unknown>) => evaluateGraph([g, { id: 'm', type: 'mathcol', position: at, data: { name: '', formula: '', ...data } } as AppNode], [{ id: 'x', source: 'g', sourceHandle: 'out', target: 'm', targetHandle: 'in-0' }]).get('m')!;
  const col = run({ formula: 'A / max(A) + 0 * max(A, 2)' }).outputs.out;
  ok(col?.t === 'column' && col.v.values.join() === '0.2,0.4,0.6,0.8,1', 'Math column: max(A) of the whole column, max(A, 2) still row by row');
  const one = run({ formula: 'max(A) - min(A) + mean(A) + sd(A)^2 + median(A) + count(A) + sum(A)', output: 'value' }).outputs.out;
  ok(one?.t === 'scalar' && near(one.v.value, 4 + 3 + 2.5 + 3 + 5 + 15), `Math column: one value of whole columns (${one?.t === 'scalar' ? one.v.value : '—'})`);
  ok(run({ formula: 'A * 2', output: 'value' }).errors.some((e) => e.includes('is a column')), 'Math column: one value from a column row by row — said');
  ok(sourcePort({ id: 'm', type: 'mathcol', position: at, data: { name: '', formula: 'mean(A)', output: 'value' } } as AppNode, 'out') === 'scalar', 'Math column: one value — a value port');
}

// ---- formulas: a value from another row (at, first, last), statistics of the rows where a condition is true, isin,
// between ----
{
  const at = { x: 0, y: 0 };
  // A = 1 … 10, B = 1 2 3 0 1 2 3 0 1 2
  const nodes = [
    { id: 'a', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'a', mode: 'formula', formula: 'i', count: 10 } },
    { id: 'b', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'b', mode: 'formula', formula: 'mod(i, 4)', count: 10 } },
  ] as AppNode[];
  const run = (data: Record<string, unknown>) =>
    evaluateGraph([...nodes, { id: 'm', type: 'mathcol', position: at, data: { name: '', formula: '', ...data } } as AppNode], [
      { id: 'x', source: 'a', sourceHandle: 'out', target: 'm', targetHandle: 'in-0' },
      { id: 'y', source: 'b', sourceHandle: 'out', target: 'm', targetHandle: 'in-1' },
    ]).get('m')!;
  const one = (formula: string) => {
    const r = run({ formula, output: 'value' });
    const o = r.outputs.out;
    return { v: o?.t === 'scalar' ? o.v.value : NaN, w: r.warnings.join(' | '), e: r.errors.join(' | ') };
  };
  const colOf = (formula: string) => {
    const o = run({ formula }).outputs.out;
    return o?.t === 'column' ? Array.from(o.v.values) : [];
  };
  ok(colOf('A * at(A, 3)').join() === '3,6,9,12,15,18,21,24,27,30', 'formulas: at(A, 3), the value of row 3 in every row');
  ok(one('at(A, n - 1)').v === 9, 'formulas: at(A, n - 1), the row a formula of n');
  const f1 = one('first(A, between(B, 2, 3))');
  ok(f1.v === 2 && /5 rows match, the first used \(row 2\)/.test(f1.w), `formulas: first(A, between(B, 2, 3)), several rows said (${f1.v}; ${f1.w})`);
  ok(one('first(A, between(B, 3, 3) or B == 0)').v === 3 && one('first(A, between(B, 3, 2))').v === 2, 'formulas: first with a condition of or; between either way round');
  const l1 = one('last(A, isin(B, 0))');
  ok(l1.v === 8 && /2 rows match, the last used \(row 8\)/.test(l1.w), `formulas: last(A, isin(B, 0)) (${l1.v})`);
  ok(one('first(A, A == 7)').v === 7 && one('first(A, A == 7)').w === '', 'formulas: one row matching, nothing said');
  const s = (f: string) => one(f).v;
  ok(s('mean(A, B == 1)') === 5 && s('sum(A, B > 2)') === 10 && s('count(A, B == 1)') === 3 && s('median(A, B == 1)') === 5 && near(s('sd(A, B == 1)'), 4), 'formulas: mean, sum, count, median, sd of the rows where a condition is true');
  ok(s('minif(A, B == 2)') === 2 && s('maxif(A, B == 2)') === 10 && colOf('max(A, B)')[3] === 4, 'formulas: minif, maxif; max(A, B) still row by row');
  ok(s('mean(A, A > mean(A))') === 8, 'formulas: a condition with a function of the whole column in it');
  const none = one('first(A, B > 10)');
  ok(Number.isNaN(none.v) && /no row where B > 10/.test(none.w) && one('count(A, B > 10)').v === 0 && one('count(A, B > 10)').w === '', `formulas: no row matching, empty and said (count: 0, nothing said) (${none.w})`);
  const far = one('at(A, 99)');
  ok(Number.isNaN(far.v) && /no row 99 \(the column has 10 rows\)/.test(far.w), 'formulas: at a row that is not there, empty and said');
  ok(/unknown name Q/.test(one('first(A, Q > 1)').w), 'formulas: a condition with an unknown name, said');
  ok(colOf('isin(B, 0, 3)').join() === '0,0,1,1,0,0,1,1,0,0' && colOf('between(A, 8, 3)').join() === '0,0,1,1,1,1,1,1,0,0', 'formulas: isin, between (either way round), row by row');
  ok(colOf('B * if(isin(B, 2, 3), 10, 1)').join() === '1,20,30,0,1,20,30,0,1,20', 'formulas: if with isin');
  ok(typeof compile('between(A, 1)') === 'string' && typeof compile('isin(A)') === 'string' && typeof compile('randint(1)') === 'string' && typeof compile('rand(1)') === 'string', 'formulas: the wrong number of parts said (between, isin, randint, rand)');
}

// ---- formulas: random values, the same every time computed, others with another seed ----
{
  const many = (src: string, n: number, seed?: number) => {
    const f = compile(src, undefined, { seed });
    if (typeof f === 'string') return [];
    const v: Record<string, number> = { n };
    return Array.from({ length: n }, (_, i) => ((v.i = i + 1), f.fn(v)));
  };
  const a = many('rand()', 2000, 7);
  ok(a.join() === many('rand()', 2000, 7).join() && a.join() !== many('rand()', 2000, 8).join(), 'rand: the same values computed again, others with another seed');
  ok(a.every((x) => x > 0 && x < 1) && Math.abs(a.reduce((p, q) => p + q, 0) / a.length - 0.5) < 0.03, 'rand: between 0 and 1, mean 0.5');
  const b = many('rand(5, 10)', 2000, 3);
  ok(b.every((x) => x >= 5 && x < 10) && Math.abs(b.reduce((p, q) => p + q, 0) / b.length - 7.5) < 0.15, 'rand(5, 10): between 5 and 10');
  const d = many('randint(1, 6)', 6000, 3);
  const counts = [1, 2, 3, 4, 5, 6].map((k) => d.filter((x) => x === k).length);
  ok(d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6) && counts.every((c) => c > 850 && c < 1150), `randint(1, 6): whole numbers 1 … 6, each about as often (${counts.join(' ')})`);
  const z = many('randn(10, 2)', 20000, 5);
  const m = z.reduce((p, q) => p + q, 0) / z.length;
  const sd = Math.sqrt(z.reduce((p, q) => p + (q - m) ** 2, 0) / (z.length - 1));
  ok(Math.abs(m - 10) < 0.05 && Math.abs(sd - 2) < 0.05, `randn(10, 2): mean 10, SD 2 (${m.toFixed(3)}, ${sd.toFixed(3)})`);
  ok(many('rand() - rand()', 50, 1).every((x) => x !== 0), 'rand: two calls in a formula, two values');
  // (a row computed alone gives the value it has among all the rows)
  const f = compile('rand()', undefined, { seed: 7 });
  ok(typeof f !== 'string' && f.fn({ i: 1234, n: 2000 }) === a[1233], 'rand: a row’s value does not depend on the rows computed before it');
  const at = { x: 0, y: 0 };
  const g = { id: 'g', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'g', mode: 'formula', formula: 'i', count: 5 } } as AppNode;
  const mc = (id: string, seed?: number) => {
    const o = evaluateGraph([g, { id, type: 'mathcol', position: at, data: { name: '', formula: 'A + rand()', seed } } as AppNode], [{ id: 'x', source: 'g', sourceHandle: 'out', target: id, targetHandle: 'in-0' }]).get(id)!.outputs.out;
    return o?.t === 'column' ? Array.from(o.v.values).join() : '';
  };
  ok(mc('m') === mc('m') && mc('m') !== mc('m', 1) && mc('m') !== mc('m2'), 'Math column: rand() the same computed again; a new seed or another node, other values');
  // Columns: a value from another row, what is said about it; rand() of two columns added, not the same
  const ds = { name: 'd', columns: [{ name: 'x', values: Float64Array.from([1, 2, 3, 4]) }, { name: 'k', values: Float64Array.from([0, 5, 5, 9]) }] };
  const cr = columnsOf(ds, { computed: [{ id: 'c1', name: 'y', formula: '[x] * first([x], [k] == 5)' }, { id: 'c2', name: 'r1', formula: 'rand()' }, { id: 'c3', name: 'r2', formula: 'rand()' }] });
  const cy = typeof cr === 'string' ? null : cr.dataset.columns;
  ok(!!cy && cy[2].values.join() === '2,4,6,8' && typeof cr !== 'string' && cr.warnings.some((w) => /“y”: first\(\[x\], \[k\] == 5\): 2 rows match/.test(w)) && cy[3].values.join() !== cy[4].values.join(), `Columns: first([x], [k] == 5), said; two rand() columns differ (${typeof cr === 'string' ? cr : cr.warnings.join(' | ')})`);
}

// ---- the menu ƒ Functions: every function of the formulas described, every example computes ----
{
  const described = describedNames();
  const missing = [...FUNCTION_NAMES, ...COLUMN_FUNCTION_NAMES].filter((f) => !described.has(f));
  ok(!missing.length, `ƒ Functions: every function described (missing: ${missing.join(', ') || 'none'})`);
  const col = (vs: number[]) => ({ name: 'c', values: Float64Array.from(vs) });
  const bad: string[] = [];
  for (const g of FORMULA_GROUPS)
    for (const f of g.items) {
      const vals: Record<string, Column | { name: string; value: number }> = { A: col([1, 15, 3, 18]), B: col([2, 7, 1, 12]), C: col([0, 2, 5, 7]) };
      const c = compile(withColumnFunctions(f.example, vals));
      if (typeof c === 'string') bad.push(`${f.name}: ${c}`);
      else if (c.names.some((x) => !(x in vals) && x !== 'i' && x !== 'n')) bad.push(`${f.name}: ${c.names.join(', ')}`);
    }
  ok(!bad.length, `ƒ Functions: every example computes (${bad.join(' | ') || 'all'})`);
}

// ---- Workbook ▸ Set column values: a column given by a formula of the sheet, computed again when its columns change ----
{
  const at = { x: 0, y: 0 };
  const TEXT = 'x\ty\tz\n1\t10\t0\n2\t20\t5\n3\t30\t5\n4\t40\t9\n';
  const book = (edits: SheetEdits, more: AppNode[] = [], edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[] = []) => {
    const r = evaluateGraph([{ id: 'w', type: 'book', position: at, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: TEXT, edits }] } } as AppNode, ...more], edges).get('w')!;
    const o = r.outputs.out;
    return { cols: o?.t === 'dataset' ? o.v.columns : [], w: r.warnings.join(' | '), r };
  };
  const vals = (c: Column | undefined) => (c ? Array.from(c.values).join() : '');
  // the formula written with the letters shown, kept by the columns' keys
  const keys = ['o0', 'o1', 'o2', 'o3', 'o4'];
  const named = ['x', 'y', 'z', 'D', 'E'].map((name) => ({ name, values: new Float64Array(0) }) as Column);
  const kept = formulaKept('A * B * first(A, C == 5)', named, keys);
  ok(kept === '[@o0] * [@o1] * first([@o0], [@o2] == 5)' && formulaOfKept(kept, named, keys) === 'A * B * first(A, C == 5)', `Set column values: the formula kept by the columns' keys, shown with their letters (${kept})`);
  const a = book({ addCols: 1, formulas: { 3: { formula: kept } } });
  ok(vals(a.cols[3]) === '20,80,180,320' && /2 rows match, the first used \(row 2\)/.test(a.w), `Set column values: D = A * B * first(A, C == 5) (${vals(a.cols[3])}; ${a.w})`);
  const b = book({ addCols: 1, cells: { '0:1': '100' }, formulas: { 3: { formula: kept } } });
  ok(vals(b.cols[3]) === '200,80,180,320', 'Set column values: a cell of B changed, the column computed again');
  const where = { mode: 'rule' as const, conds: [{ col: 'z', op: '>' as const, v: 4 }] };
  ok(vals(book({ formulas: { 2: { formula: '[@o1] / 10', rows: where } } }).cols[2]) === '0,2,3,4' && vals(book({ formulas: { 2: { formula: '[@o1] / 10', rows: where, others: 'empty' } } }).cols[2]) === 'NaN,2,3,4', 'Set column values: on the rows where z > 4, the others kept or emptied');
  ok(vals(book({ formulas: { 2: { formula: '[@o1] * 0', rows: { mode: 'rule', conds: [{ col: 'z', op: 'in', vs: [0, 9] }] } } } }).cols[2]) === '0,5,5,0', 'Set column values: on the rows where z is one of 0, 9');
  const dep = book({ addCols: 2, formulas: { 3: { formula: '[@o4] + 1' }, 4: { formula: '[@o0] * 10' } } });
  ok(vals(dep.cols[3]) === '11,21,31,41' && vals(dep.cols[4]) === '10,20,30,40', 'Set column values: a formula of another formula column, computed after it');
  const loop = book({ addCols: 2, formulas: { 3: { formula: '[@o4]' }, 4: { formula: '[@o3] * 2' } } });
  ok(vals(loop.cols[3]) === 'NaN,NaN,NaN,NaN' && /in a loop/.test(loop.w), `Set column values: two formulas needing one another, said (${loop.w})`);
  ok(/uses its own column/.test(book({ addCols: 1, formulas: { 3: { formula: '[@o3] + 1' } } }).w), 'Set column values: a formula of its own column, said');
  ok(/unknown name Q/.test(book({ addCols: 1, formulas: { 3: { formula: 'Q * 2' } } }).w), 'Set column values: an unknown name, said');
  // moved: the same columns computed, the formula shown with their letters now
  const moved = book({ addCols: 1, order: [3, 0, 1, 2], formulas: { 3: { formula: '[@o0] * 2' } } });
  ok(vals(moved.cols[0]) === '2,4,6,8' && formulaOfKept('[@o0] * 2', moved.cols, ['o3', 'o0', 'o1', 'o2']) === 'B * 2', 'Set column values: a column moved, the formula follows it');
  // an input's column on the sheet
  const g = { id: 'g', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'g', mode: 'formula', formula: 'i * 100', count: 4 } } as AppNode;
  const withIn = book({ addCols: 1, formulas: { 3: { formula: '[@o0] + [@i:g]' } } }, [g], [{ id: 'e', source: 'g', sourceHandle: 'out', target: 'w', targetHandle: 'in-0' }]);
  ok(vals(withIn.cols.find((c) => c.name !== 'g' && c.name !== 'x' && c.name !== 'y' && c.name !== 'z')) === '101,202,303,404', `Set column values: a formula of an input's column (${withIn.cols.map((c) => c.name).join(', ')})`);
  // rand(): the same computed again, other values on another sheet column or with a new seed
  const r1 = book({ addCols: 2, formulas: { 3: { formula: 'rand()' }, 4: { formula: 'rand()' } } });
  ok(vals(r1.cols[3]) === vals(book({ addCols: 2, formulas: { 3: { formula: 'rand()' }, 4: { formula: 'rand()' } } }).cols[3]) && vals(r1.cols[3]) !== vals(r1.cols[4]) && vals(r1.cols[3]) !== vals(book({ addCols: 2, formulas: { 3: { formula: 'rand()', seed: 1 } } }).cols[3]), 'Set column values: rand() the same computed again; another column or a new seed, other values');
}

// ---- Import: missing values, thousands separator, a footer ----
{
  const p = (text: string, o: Partial<typeof CSV_DEFAULTS>) => parseCsv(text, { ...CSV_DEFAULTS, ...o }).dataset.columns;
  const a = p('x;y\n1;N/A\n2;-999\n3;1.234,5\n4;7\nTotal;19\nend\n', { delimiter: ';', decimal: ',', thousands: '.', missing: 'N/A, -999', skipEnd: 2 });
  ok(a.length === 2 && a[0].values.length === 4 && Number.isNaN(a[1].values[0]) && Number.isNaN(a[1].values[1]) && a[1].values[2] === 1234.5 && !a[1].text, 'Import: missing values empty (N/A, -999), 1.234,5 with a thousands point, a footer of 2 lines left out');
  const b = p('x,y\n1,"1,234.5"\n', { thousands: ',' });
  ok(b[1].values[0] === 1234.5, 'Import: a quoted 1,234.5 with a thousands comma');
}

// ---- project format 10 → 11: Add column, Edit rows, Plot matrix merged into Combine columns, Math column, Contour ----
{
  const at = { x: 0, y: 0 };
  const old = {
    app: 'graph-flow',
    version: 10,
    nodes: [
      { id: 'i', type: 'import', position: at, data: { ...IMPORT_DEFAULTS, text: 'p,q\n1,2\n3,4\n', textId: 't10' } },
      { id: 'g', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'g', mode: 'formula', formula: 'i', count: 10 } },
      { id: 'h', type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, name: 'h', mode: 'formula', formula: 'i * 10', count: 2 } },
      { id: 'add', type: 'addcol', position: at, data: { position: 'after', ref: 'p', name: 'new' } },
      { id: 'ed', type: 'editrows', position: at, data: { name: '', target: 0, rules: [{ mode: 'rows', rows: '2, 4-5', formula: 'A + 100' }, { mode: 'condition', rows: 'v > 8', formula: 'v * 2' }], others: 'nan', otherValue: 0 } },
      { id: 'm', type: 'matrix', position: at, data: MATRIX_DEFAULTS },
      { id: 'pm', type: 'plotmatrix', position: at, data: { ...MATRIX_CONTOUR_DEFAULTS, cellValues: true } },
    ],
    edges: [
      { id: 'e1', source: 'i', sourceHandle: 'out', target: 'add', targetHandle: 'data' },
      { id: 'e2', source: 'h', sourceHandle: 'out', target: 'add', targetHandle: 'col' },
      { id: 'e3', source: 'g', sourceHandle: 'out', target: 'ed', targetHandle: 'in-0' },
      { id: 'e4', source: 'm', sourceHandle: 'out', target: 'pm', targetHandle: 'matrix' },
    ],
  };
  const p = parseProject(JSON.stringify(old));
  if (typeof p !== 'string') {
    const types = Object.fromEntries(p.nodes.map((n) => [n.id, n.type]));
    ok(p.version === PROJECT_VERSION && types.add === 'combine' && types.ed === 'mathcol' && types.pm === 'contour' && p.edges.some((e) => e.target === 'add' && e.targetHandle === 'in-0') && p.edges.some((e) => e.target === 'add' && e.targetHandle === 'in-1'), 'format 10 → 11: the three nodes converted, the ports of Add column moved to A, B');
    const r = evaluateGraph(p.nodes, p.edges);
    const add = r.get('add')?.outputs.out;
    ok(add?.t === 'dataset' && add.v.columns.map((c) => c.name).join() === 'p,new,q' && add.v.columns[1].values[1] === 20, 'format 10 → 11: Add column → Combine side by side (after p, renamed)');
    const ed = r.get('ed')?.outputs.out;
    const ev = ed?.t === 'column' ? Array.from(ed.v.values).map((v) => (Number.isNaN(v) ? 'NaN' : v)).join() : '';
    ok(ev === 'NaN,204,NaN,208,210,NaN,NaN,NaN,18,20' && ed?.t === 'column' && ed.v.name === 'g', `format 10 → 11: Edit rows → Math column, the other rows emptied, v as before (${ev})`);
    const fig = r.get('pm')?.view.figure;
    const cells = fig?.axes[0]?.curves.filter((c) => c.key.startsWith('cells:')) ?? [];
    ok(!r.get('pm')?.errors.length && cells.reduce((s, c) => s + (c.labelValues?.text?.length ?? 0), 0) === 9 && !!fig?.axes[0].style.y.reverse, 'format 10 → 11: Plot matrix → Contour with a matrix, drawn the same');
  } else ok(false, `format 10 → 11 (${p})`);
  const same = mergedNodes(old.nodes, old.edges);
  ok(JSON.stringify(mergedNodes(same.nodes, same.edges)) === JSON.stringify(same), 'format 10 → 11: converting twice changes nothing more (templates)');
}

// ---- a Plot with several curves ----
{
  const nodes = [
    { id: 'x', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: 5 } },
    { id: 'x2', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: 7 } },
    { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {} } },
  ] as AppNode[];
  const edges = [
    { id: '1', source: 'x', sourceHandle: 'out', target: 'p', targetHandle: 'x' },
    { id: '2', source: 'x', sourceHandle: 'out', target: 'p', targetHandle: 'y' },
    { id: '3', source: 'x', sourceHandle: 'out', target: 'p', targetHandle: 'y-1' },
    { id: '4', source: 'x2', sourceHandle: 'out', target: 'p', targetHandle: 'y-2' },
  ];
  const r = evaluateGraph(nodes, edges).get('p')!;
  const cs = r.view.curves ?? [];
  ok(cs.length === 2 && cs[1].series.x === cs[0].series.x, 'Plot: curve 2 takes the X of curve 1 (same rows)');
  ok(r.errors.some((e) => e.includes('curve 3')), 'Plot: curve 3 (other rows, no X) reported');
  ok(cs[1].style.color !== cs[0].style.color, 'Plot: the next curve takes the next colour');
}

// ---- project format: a file of format 2 (a Fit with a port per parameter) opens (now as format 4) ----
{
  const old = {
    app: 'graph-flow',
    version: 2,
    nodes: [
      { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS } },
      { id: 'm', type: 'mathcol', position: { x: 900, y: 0 }, data: { name: '', formula: 'A + B' } },
    ],
    edges: [
      { id: '1', source: 'f', sourceHandle: 'p:A', target: 'm', targetHandle: 'in-0' },
      { id: '2', source: 'f', sourceHandle: 'p:A', target: 'm', targetHandle: 'in-1' },
    ],
  };
  const p = parseProject(JSON.stringify(old));
  const ex = typeof p === 'string' ? undefined : p.nodes.find((n) => n.type === 'extract');
  ok(typeof p !== 'string' && p.version === PROJECT_VERSION && p.nodes.length === 3 && ex?.type === 'extract' && ex.data.column === 'A' && ex.data.value === true && p.edges.filter((e) => e.source === ex.id).length === 2 && p.edges.some((e) => e.source === 'f' && e.sourceHandle === 'params' && e.target === ex.id), 'format 2 → 3: a parameter port becomes an Extract column (one value) of the parameters table');
}

// ---- examples: evaluated without errors, saved and read back ----
for (const ex of EXAMPLES) {
  const p = ex.make();
  const res = evaluateGraph(p.nodes, p.edges);
  const errs = [...res.entries()].flatMap(([id, r]) => r.errors.map((e) => `${id}: ${e}`));
  ok(!errs.length, `example “${ex.name}” has no errors${errs.length ? ` (${errs.join('; ')})` : ''}`);
  // (a figure with curves: an image's figure, first, has none)
  const canvas = [...res.values()].find((r) => r.view.figure && r.view.figure.axes[0]?.curves.length);
  ok(!!canvas && canvas.view.figure!.axes.length > 0 && canvas.view.figure!.axes[0].curves.length > 0, `example “${ex.name}” draws curves`);
  const back = parseProject(stringifyProject(p));
  ok(typeof back !== 'string' && back.nodes.length === p.nodes.length && back.edges.length === p.edges.length, `example “${ex.name}” saves and opens`);
}
{
  // the UV-Vis example: mean and SD of the three replicates at 400 nm, from the file's values
  const p = EXAMPLES[0].make();
  const res = evaluateGraph(p.nodes, p.edges);
  const ds = res.get('import-uv')?.outputs.out;
  const by = (n: string) => (ds?.t === 'dataset' ? findColumn(ds.v.columns, n)!.values : new Float64Array());
  const [a, b, c] = [by('A1'), by('A2'), by('A3')];
  const m = (a[0] + b[0] + c[0]) / 3;
  const stat = (k: string) => {
    const v = res.get('replicates')?.outputs[k];
    return v?.t === 'column' ? v.v.values : new Float64Array();
  };
  ok(near(stat('mean')[0], m), 'example: mean of the replicates');
  ok(near(stat('sd')[0], Math.sqrt(((a[0] - m) ** 2 + (b[0] - m) ** 2 + (c[0] - m) ** 2) / 2)), 'example: SD of the replicates');
  ok(stat('x').length === 61 && stat('x')[60] === 700, 'example: 61 wavelengths, 400–700 nm');
}
{
  // a legend's box: older looks read as boxes (a line; a white box with a sharp shadow; corners of 4 pt; a fill without a
  // line), the new one with its gradient and a soft shadow (a gradient without a fill: none)
  const L: LegendSpec = { ...LEGEND_STYLE_DEFAULTS, key: 'l', curves: [] };
  const line = legendBox({ ...L, frame: 'line' });
  const sh = legendBox({ ...L, frame: 'shadow' });
  const rnd = legendBox({ ...L, frame: 'round' });
  const fillOnly = legendBox({ ...L, frame: 'none', background: '#eeeeee', bgOpacity: 0.5 });
  const box = legendBox({ ...L, frame: 'box', background: '#ffffff', backgroundGrad: { grad: 'radial' }, shadow: true, shadowBlur: 2 });
  ok(
    line.line && !line.fill && !line.shadow && line.radius === 0 && sh.line && sh.fill === '#ffffff' && sh.shadow?.blur === 0 && sh.shadow.opacity === 0.35 && sh.shadow.dx === 1.5 && rnd.radius === 4 && rnd.line &&
      !fillOnly.line && fillOnly.fill === '#eeeeee' && fillOnly.fillOpacity === 0.5 && !fillOnly.shadow && box.grad?.grad === 'radial' && box.shadow?.blur === 2 && box.shadow.opacity === 0.3 &&
      legendBox({ ...L, frame: 'box', backgroundGrad: { grad: 'linear' } }).grad === undefined && JSON.stringify(legendBoxPatch({ ...L, frame: 'round', radius: 2 })) === '{"frame":"box","radius":2}' && JSON.stringify(legendBoxPatch({ ...L, frame: 'box' })) === '{}',
    `legend box: older looks as boxes, a gradient fill, a soft shadow (${JSON.stringify([sh, box])})`,
  );
  // the page's gradient reaches the figure; a transparent page, or one without a gradient, has none
  const p = EXAMPLES[0].make();
  const withPage = (page: object) => p.nodes.map((n) => (n.id === 'plot-mean' ? ({ ...n, data: { ...n.data, page: { ...(n.data as { page: object }).page, ...page } } } as typeof n) : n));
  const figOf = (page: object) => {
    const f = evaluateGraph(withPage(page), p.edges).get('plot-mean')?.outputs.figure;
    return f?.t === 'figure' ? f.v : null;
  };
  const g = figOf({ background: '#eeeeee', backgroundGrad: { grad: 'linear', fill2: '#3366cc' } });
  ok(g?.background === '#eeeeee' && g.backgroundGrad?.fill2 === '#3366cc' && !figOf({ background: 'none', backgroundGrad: { grad: 'linear' } })?.backgroundGrad && !figOf({ background: '#eeeeee', backgroundGrad: { grad: undefined } })?.backgroundGrad, 'page: its gradient in the figure (none on a transparent page)');
}

// ---- Split into columns / Combine columns ----
{
  const ds = parseCsv(JOHNSON_AU, CSV_DEFAULTS).dataset;
  const r = unstack(ds, UNSTACK_DEFAULTS);
  ok(typeof r !== 'string' && r.dataset.columns.map((c) => c.name).join(',') === 'wl,n,k', 'split: wl, n / wl, k → wl, n, k (the second block named by its header)');
  ok(typeof r !== 'string' && r.dataset.columns.every((c) => c.values.length === 49) && r.dataset.columns[2].values[48] === 13.78 && !r.warnings.length, 'split: 49 rows each, k last = 13.78, the same wl');
  ok(typeof r !== 'string' && r.dataset.columns.map((c) => c.role).join(',') === 'x,y,y', 'split: designations X, Y, Y');
  const e = unstack(ds, { ...UNSTACK_DEFAULTS, xs: 'each', names: 'n, k' });
  ok(typeof e !== 'string' && e.dataset.columns.map((c) => `${c.name}:${c.role}`).join(',') === 'wl:x,n:y,wl_2:x,k:y', 'split: X of every block (wl, n, wl_2, k), own names');
  const rs = unstack(ds, { ...UNSTACK_DEFAULTS, by: 'restart' });
  ok(typeof rs !== 'string' && rs.blocks.length === 2 && rs.blocks[1].first === 51, 'split: where X starts again (the text line left out)');
  // a sweep: θ 1..4 for three values of d; the blocks named by d, the block values = d
  const t = column('t', Float64Array.from({ length: 12 }, (_, i) => (i % 4) + 1));
  const d = column('d (nm)', Float64Array.from({ length: 12 }, (_, i) => 100 + 10 * Math.floor(i / 4)));
  const y = column('R', Float64Array.from({ length: 12 }, (_, i) => i));
  const sw = unstack({ name: 's', columns: [d, t, y] }, { ...UNSTACK_DEFAULTS, x: 't' });
  ok(typeof sw !== 'string' && sw.dataset.columns.length === 4 && sw.dataset.columns[3].name === 'R · d = 120 nm' && sw.dataset.columns[3].values[0] === 8, 'split: a sweep (auto: X starts again), named by the constant column');
  ok(typeof sw !== 'string' && Array.from(sw.values.values).join(',') === '100,110,120' && sw.values.name === 'd (nm)', 'split: block values = the swept parameter');
  const bc = unstack({ name: 's', columns: [d, t, y] }, { ...UNSTACK_DEFAULTS, x: 't', by: 'column', column: 'd (nm)' });
  ok(typeof bc !== 'string' && bc.dataset.columns.length === 4, 'split: by a column');
  // a column of labels (S1, S1, S1, S2 …): auto makes the blocks by them — also when the labels are designated X (the
  // curves' X then the first column with numbers)
  const lab = { ...column('Sample', new Float64Array(6).fill(NaN), ['S1', 'S1', 'S1', 'S2', 'S2', 'S2']), role: 'x' as const };
  const qx = { ...column('Qx', Float64Array.from([1, 2, 3, 1, 2, 3])), role: 'y' as const };
  const iv = { ...column('I', Float64Array.from([10, 20, 30, 40, 50, 60])), role: 'y' as const };
  const lb = unstack({ name: 's', columns: [lab, qx, iv] }, UNSTACK_DEFAULTS);
  ok(typeof lb !== 'string' && lb.blocks.length === 2 && lb.dataset.columns.map((c) => c.name).join() === 'Qx,I · Sample = S1,I · Sample = S2' && lb.dataset.columns[2].values[2] === 60 && lb.how.includes('Sample') && lb.how.includes('X: Qx'), 'split: auto by a column of labels designated X (X: the first column with numbers)');
  const lb2 = unstack({ name: 's', columns: [{ ...qx, role: 'x' as const }, { ...lab, role: 'label' as const }, iv] }, UNSTACK_DEFAULTS);
  ok(typeof lb2 !== 'string' && lb2.blocks.length === 2 && lb2.dataset.columns.map((c) => c.name).join() === 'Qx,I · Sample = S1,I · Sample = S2', 'split: auto by a column of labels beside X');
  ok(labelRuns(lab) && !labelRuns({ ...lab, text: ['S1', 'S2', 'S1', 'S2', 'S1', 'S2'] }) && !labelRuns({ ...lab, text: ['a', 'a', 'a', 'a', 'a', 'a'] }) && !labelRuns(qx), 'labels in runs: each label in one run, two labels or more, no numbers');
  ok(typeof unstack({ name: 's', columns: [t] }, UNSTACK_DEFAULTS) === 'string', 'split: only X → a message');
  {
    const wb = {
      id: 'w',
      type: 'book',
      position: { x: 0, y: 0 },
      data: {
        ...WORKBOOK_DEFAULTS,
        sheets: [
          { name: 'Sheet1', text: 'x\ty\n1\t1\n2\t2\n' },
          { name: 'Sheet2', text: 'a\tb\n1\t10\n2\t20\n3\t30\n4\t40\n1\t50\n2\t60\n3\t70\n4\t80\n' },
        ],
      },
    } as AppNode;
    const un = {
      id: 'u',
      type: 'unstack',
      position: { x: 0, y: 0 },
      data: { ...UNSTACK_DEFAULTS, sheet: 'Sheet2' },
    } as AppNode;
    const res = evaluateGraph([wb, un], [{ id: 'e', source: 'w', sourceHandle: 'book', target: 'u', targetHandle: 'in' }]);
    const uOut = res.get('u')?.outputs.out;
    const out = uOut && uOut.t === 'dataset' ? (uOut as { v: Dataset }).v : null;
    ok(!!out && out.columns.map((c) => c.name).join(',') === 'a,b · 1,b · 2' && res.get('u')?.view.sheets?.join(',') === 'Sheet1,Sheet2', 'split: workbook input — reads from chosen sheet');
    // a Workbook fed by this one: a sheet of the input taken out (and listed, to show it again)
    const wb2 = { id: 'w2', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [], hideSheets: ['Sheet1'] } } as AppNode;
    const r2 = evaluateGraph([wb, wb2], [{ id: 'e2', source: 'w', sourceHandle: 'book', target: 'w2', targetHandle: 'in-0' }]).get('w2');
    const b2 = r2?.outputs.book;
    ok(b2?.t === 'workbook' && b2.v.sheets.map((q) => q.name).join(',') === 'Sheet2' && r2?.view.book?.hiddenSheets?.join(',') === 'Sheet1', `workbook: a sheet of the input taken out, listed to show it again (${b2?.t === 'workbook' ? b2.v.sheets.map((q) => q.name).join(',') : '?'})`);
    // the names: an older node's (b, b_2); blocks named in the node (one Y: the name; several: “Y · name”)
    const named = (d: object) => {
      const o = evaluateGraph([wb, { ...un, data: { ...un.data, ...d } } as AppNode], [{ id: 'e', source: 'w', sourceHandle: 'book', target: 'u', targetHandle: 'in' }]).get('u')?.outputs.out;
      return o?.t === 'dataset' ? o.v.columns.map((c) => c.name).join(',') : '';
    };
    ok(named({ naming: undefined }) === 'a,b,b_2' && named({ blockNames: ['first run', ''] }) === 'a,first run,b · 2', `split: an older node's names kept (${named({ naming: undefined })}); a block named in the node (${named({ blockNames: ['first run', ''] })})`);
  }

  // a scan as a cyclic voltammogram is saved: from 0 up to 1, down to −1, up to 1, down to −1, up to 0 (step 0.1) —
  // turns at rows 11 (top), 31 (bottom), 51 (top), 71 (bottom); 81 rows; Y = the row index, the time t = 2 × row
  const cvE = [...Array.from({ length: 11 }, (_, i) => i / 10), ...Array.from({ length: 20 }, (_, i) => 0.9 - i / 10), ...Array.from({ length: 20 }, (_, i) => -0.9 + i / 10), ...Array.from({ length: 20 }, (_, i) => 0.9 - i / 10), ...Array.from({ length: 10 }, (_, i) => -0.9 + i / 10)].map((v) => Math.round(v * 10) / 10);
  const cv = { name: 'cv', columns: [{ ...column('E (V)', Float64Array.from(cvE)), role: 'x' as const }, { ...column('I (A)', Float64Array.from(cvE, (_, i) => i)), role: 'y' as const }, { ...column('t (s)', Float64Array.from(cvE, (_, i) => 2 * i)), role: 'none' as const }] };
  const cvs = (p: Partial<typeof UNSTACK_DEFAULTS>) => unstack(cv, { ...UNSTACK_DEFAULTS, by: 'cycles', xs: 'each', ...p });
  // the blocks as "first-last" rows (from 1), * when not whole, ! when left out
  const spans = (r: ReturnType<typeof unstack>) => (typeof r === 'string' ? r : r.blocks.map((b) => `${b.first}-${b.last}${b.part ? '*' : ''}${b.kept === false ? '!' : ''}`).join(' '));
  ok(cvE.length === 81 && spans(cvs({})) === '1-41 41-81', `split ▸ cycles from where the scan started: 0 → 1 → −1 → 0, twice, both whole (${spans(cvs({}))})`);
  ok(spans(cvs({ cycleStart: 'top' })) === '1-11* 11-51 51-81*', `split ▸ cycles from every upper turn: the start and the end not whole (${spans(cvs({ cycleStart: 'top' }))})`);
  ok(spans(cvs({ cycleStart: 'bottom' })) === '1-31* 31-71 71-81*', `split ▸ cycles from every lower turn (${spans(cvs({ cycleStart: 'bottom' }))})`);
  ok(spans(cvs({ cycleStart: 'value', cycleAt: 0.5, cycleDir: 'down' })) === '1-16* 16-56 56-81*', `split ▸ cycles from where E crosses 0.5 going down (${spans(cvs({ cycleStart: 'value', cycleAt: 0.5, cycleDir: 'down' }))})`);
  ok(typeof cvs({ cycleStart: 'value' }) === 'string', 'split ▸ cycles from a value: no value → a message');
  ok(spans(cvs({ cycleStart: 'top', partial: 'drop' })) === '11-51' && spans(cvs({ cycleStart: 'top', partial: 'join' })) === '1-81', 'split ▸ cycles: the pieces not whole left out, or joined to the cycle next to them');
  const hv = cvs({ halves: true });
  ok(spans(hv) === '1-11 11-31 31-41 41-51 51-71 71-81' && typeof hv !== 'string' && hv.dataset.columns.filter((c) => c.role === 'y').map((c) => c.name).join() === 'I (A) · cycle 1 · up 1,I (A) · cycle 1 · down,I (A) · cycle 1 · up 2,I (A) · cycle 2 · up 1,I (A) · cycle 2 · down,I (A) · cycle 2 · up 2', `split ▸ cycles cut into their ways up and down (${spans(hv)})`);
  ok(spans(cvs({ by: 'direction' })) === '1-11* 11-31 31-51 51-71 71-81*' && spans(cvs({ by: 'direction', partial: 'drop' })) === '11-31 31-51 51-71', 'split ▸ where X changes direction: the first and last segments not whole, left out');
  // from another column: X is the time, the cycles found on the potential
  const fr = cvs({ x: 't (s)', from: 'E (V)', ys: 'I (A)' });
  ok(spans(fr) === '1-41 41-81' && typeof fr !== 'string' && fr.dataset.columns[0].name === 't (s)' && fr.dataset.columns[2].values[0] === 80, `split ▸ From: the cycles of E while X is the time (${spans(fr)})`);
  // where a column jumps: by more than 5 × its usual change (0 here: any change), or by more than a value written
  const stp = { name: 'st', columns: [column('x', Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8])), column('run', Float64Array.from([0, 0, 0, 5, 5, 5, 9, 9])), column('y', Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8]))] };
  const jp = (p: Partial<typeof UNSTACK_DEFAULTS>) => spans(unstack(stp, { ...UNSTACK_DEFAULTS, by: 'jump', from: 'run', ys: 'y', ...p }));
  ok(jp({}) === '1-3 4-6 7-8' && jp({ jump: 4.5 }) === '1-3 4-8', `split ▸ where a column jumps: automatic, or by more than 4.5 (${jp({})}; ${jp({ jump: 4.5 })})`);
  const js = splitRows({ mode: 'jump' }, column('x', Float64Array.from([0, 1, 2, 3, 20, 21, 22])), [0, 1, 2, 3, 4, 5, 6], undefined, []);
  ok(!!js && typeof js !== 'string' && js.rows.map((r) => r.length).join() === '4,3' && js.how.includes('5'), 'split ▸ jump in a sweep: more than 5 × the usual step (1 → 5)');
  // the blocks kept, the rows used
  const kb = (t: string, n: number) => {
    const k = keptBlocks(t, n);
    return typeof k === 'string' ? 'error' : [...k].join();
  };
  ok(kb('2:end', 5) === '1,2,3,4' && kb('!1, !last', 5) === '1,2,3' && kb('first, 3', 5) === '0,2' && kb('', 3) === '0,1,2' && kb('x', 3) === 'error', 'split ▸ Keep: 2:end, !1, !last, first, a list');
  const kp = cvs({ by: 'direction', keep: '2:4' });
  ok(spans(kp) === '1-11*! 11-31 31-51 51-71 71-81*!' && typeof kp !== 'string' && kp.dataset.columns.filter((c) => c.role === 'y').map((c) => c.name).join() === 'I (A) · segment 2,I (A) · segment 3,I (A) · segment 4', 'split ▸ Keep: the blocks left out keep their numbers');
  ok(spans(cvs({ by: 'direction', rows: '1-41' })) === '1-11* 11-31 31-41*', 'split ▸ Rows: only the rows used are cut');
  // cuts by hand: a cut at row 21 (the point in both blocks of a scan), a cut of the rule taken away, the rows changed
  ok(spans(cvs({ cuts: [21], cutRows: 81 })) === '1-21 21-41 41-81' && spans(cvs({ uncut: [41] })) === '1-81', 'split ▸ cuts by hand: added (shared point), taken away');
  const cw = cvs({ cuts: [21], cutRows: 60 });
  ok(typeof cw !== 'string' && cw.warnings.some((w) => w.includes('60')) && cw.graph?.cuts.map((c) => `${c.row}${c.hand ? 'h' : ''}`).join() === '21h,41', 'split ▸ cuts by hand: a warning when the table changed; the graph tells them from the rule’s');
  // then: by a column, then the cycles inside each block
  const two = { name: 'two', columns: [...cv.columns.slice(0, 2).map((c) => ({ ...c, values: Float64Array.from([...c.values, ...c.values]) })), column('run', Float64Array.from({ length: 162 }, (_, i) => (i < 81 ? 1 : 2)))] };
  const th = unstack(two, { ...UNSTACK_DEFAULTS, by: 'column', column: 'run', then: 'cycles', xs: 'each' });
  ok(typeof th !== 'string' && th.blocks.length === 4 && th.blocks.map((b) => b.name).join() === 'I (A) · run = 1 · cycle 1,I (A) · run = 1 · cycle 2,I (A) · run = 2 · cycle 1,I (A) · run = 2 · cycle 2', `split ▸ Then: by run, then the cycles in each (${typeof th === 'string' ? th : th.blocks.map((b) => b.name).join()})`);
  // the long table: every row once, with its block, its cycle and the way the potential goes there
  const lg = cvs({});
  const lc = (nm: string) => (typeof lg === 'string' ? undefined : lg.long.columns.find((c) => c.name === nm));
  ok(typeof lg !== 'string' && lg.long.columns.length === 6 && lc('block')?.values.length === 81 && lc('block')?.values[40] === 2 && lc('cycle')?.values[80] === 2 && lc('direction')?.text?.[5] === 'up' && lc('direction')?.text?.[20] === 'down', 'split ▸ the long table: block, cycle, direction (the shared point in the later block)');
  // combine
  const A = { name: 'a', columns: [column('x', Float64Array.from([1, 3])), column('y', Float64Array.from([10, 30]))] };
  const B = { name: 'b', columns: [column('x', Float64Array.from([2, 3])), column('y', Float64Array.from([20, 40]))] };
  const vals = (r: ReturnType<typeof combine>, j: number) => (typeof r === 'string' ? r : Array.from(r.dataset.columns[j].values).join(','));
  const spec = { how: 'after' as const, at: 0, match: 'name' as const, x: '', dup: 'all' as const };
  ok(vals(combine([A, B], spec), 1) === '10,30,20,40', 'combine: after');
  ok(vals(combine([A, B], { ...spec, how: 'before' }), 1) === '20,40,10,30', 'combine: before');
  ok(vals(combine([A, B], { ...spec, how: 'insert', at: 1 }), 1) === '10,20,40,30', 'combine: inserted after row 1');
  ok(vals(combine([A, B], { ...spec, how: 'interleave' }), 1) === '10,20,30,40', 'combine: interleaved');
  ok(vals(combine([A, B], { ...spec, how: 'sortx' }), 1) === '10,20,30,40', 'combine: sorted by X (stable)');
  ok(vals(combine([A, B], { ...spec, how: 'sortx', dup: 'mean' }), 1) === '10,20,35', 'combine: sorted by X, same X → mean');
  const C = { name: 'c', columns: [column('x', Float64Array.from([5])), column('z', Float64Array.from([7]))] };
  const m = combine([A, C], spec);
  ok(typeof m !== 'string' && m.dataset.columns.map((c) => c.name).join(',') === 'x,y,z' && Number.isNaN(m.dataset.columns[1].values[2]) && m.warnings.length === 1, 'combine: columns by name, missing → empty');
  ok(typeof m !== 'string' && Array.from(m.source.values).join(',') === '1,1,2', 'combine: source of every row');
  // the nodes: two columns → a column, a dataset among them → a dataset
  const res = evaluateGraph(
    [
      { id: 'a', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: 3 } },
      { id: 'b', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: 2 } },
      { id: 'c', type: 'combine', position: { x: 0, y: 0 }, data: { ...spec, name: 'all' } },
    ] as AppNode[],
    [
      { id: '1', source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in-0' },
      { id: '2', source: 'b', sourceHandle: 'out', target: 'c', targetHandle: 'in-1' },
    ],
  );
  const out = res.get('c')?.outputs.out;
  ok(out?.t === 'column' && out.v.values.length === 5 && out.v.name === 'all', 'Combine columns node: two columns → one column of 5 rows');
  // a resized note keeps its size in the project
  const pj = toProject([{ id: 'n', type: 'note', position: { x: 0, y: 0 }, data: { text: '' }, width: 320, height: 150 } as AppNode, { id: 'm', type: 'note', position: { x: 0, y: 0 }, data: { text: '' } } as AppNode], []);
  ok(pj.nodes[0].width === 320 && pj.nodes[0].height === 150 && pj.nodes[1].width === undefined, 'note: its size saved when resized');
}

{
  // format 4 → 5: the unit of a Math column goes into its name; Import no longer splits names
  const old = JSON.stringify({ app: 'graph-flow', version: 4, nodes: [{ id: 'm', type: 'mathcol', position: { x: 0, y: 0 }, data: { name: 'Signal', unit: 'mV', formula: 'A' } }, { id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, name: '', unit: 's' } }, { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, csv: { ...CSV_DEFAULTS, unitsInName: true } } }], edges: [] });
  const p = parseProject(old);
  const d = (id: string) => (typeof p === 'string' ? {} : (p.nodes.find((n) => n.id === id)?.data as Record<string, unknown>));
  ok(typeof p !== 'string' && p.version === PROJECT_VERSION && d('m').name === 'Signal (mV)' && !('unit' in d('m')) && d('g').name === 'Generated (s)' && !('unitsInName' in (d('i').csv as object)), 'format 4 → 5: units written into the names');
}
{
  // Workbook: own sheets (typed cells over an empty table), a table kept as text and read back, a view of a dataset
  const ds = { name: 'd', columns: [{ ...column('x (s)', Float64Array.from([1, 2.5])), role: 'x' as const }, column('label', Float64Array.from([NaN, 3]), ['a', '3'])] };
  const back = readSheet(sheetText(ds), 'S');
  ok(back.columns.map((c) => c.name).join('|') === 'x (s)|label' && back.columns[0].values[1] === 2.5 && back.columns[1].text?.[0] === 'a', 'workbook: a sheet kept as text and read back');
  const book = { id: 'b', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ ...newSheet('Sheet1'), edits: { addRows: 3, addCols: 2, cells: { '0:0': '1', '1:0': '2', '0:1': '5,5' } } }, { name: 'S2', text: sheetText(ds) }], sheet: 1 } } as AppNode;
  let res = evaluateGraph([book], []);
  const out = res.get('b')?.outputs;
  ok(out?.out?.t === 'dataset' && out.out.v.name === 'S2' && out.book?.t === 'workbook' && out.book.v.sheets.length === 2 && out.book.v.sheets[0].columns[1].values[0] === 5.5, 'workbook: two sheets, typed cells, the sheet shown on “dataset”');
  res = evaluateGraph([{ ...book, data: { ...WORKBOOK_DEFAULTS, sheets: [], sheet: 0 } } as AppNode, { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'p,q\n1,2\n', textId: 't' } } as AppNode], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'b', targetHandle: 'in-0' }]);
  const v = res.get('b');
  ok(v?.view.book?.own === 0 && v.outputs.out?.t === 'dataset' && v.outputs.out.v.columns[1].name === 'q', 'workbook: a dataset on input A, a read-only sheet passed on');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'p,q,r\n1,2,0.1\n', textId: 't' } } as AppNode;
  res = evaluateGraph([{ ...book, data: { ...WORKBOOK_DEFAULTS, sheets: [], sheet: 0, roles: { inputs: { r: 'yerr' } } } } as AppNode, imp], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'b', targetHandle: 'in-0' }]);
  const roles = res.get('b')?.outputs.out;
  ok(roles?.t === 'dataset' && roles.v.columns[2]?.role === 'yerr' && roles.v.columns[1].role !== 'yerr', 'workbook: a designation given on a sheet of the inputs');
}
{
  // Fit, ranges per run: run1 linear on 0–1, run2 on 1–2, run3 on 2–3 (each curve far from a line outside its range)
  const xs = Float64Array.from({ length: 31 }, (_, i) => i / 10);
  const y = (k: number) => column(`run${k}`, Float64Array.from(xs, (x) => (x >= k - 1 && x <= k ? k * 10 * x + k : 100 * Math.sin(5 * x))));
  const ds = { name: 'runs', columns: [{ ...column('x', xs), role: 'x' as const }, y(1), y(2), y(3)] };
  const fit = (extra: Partial<FitNodeData>) =>
    evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S', text: sheetText(ds) }] } } as AppNode,
        { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ys: ['run1', 'run2', 'run3'], model: { ...FIT_DEFAULTS.model, model: 'linear' }, ...extra } } as AppNode,
      ],
      [{ id: 'e', source: 'w', sourceHandle: 'out', target: 'f', targetHandle: 'in' }],
    ).get('f');
  const slopes = (r: ReturnType<typeof fit>) => (r?.view.fit?.runs ?? []).map((q) => q.params.find((p) => p.name === 'b' || p.name === 'slope' || p.name === 'a1')?.value ?? NaN);
  const per = fit({ rangesBy: 'run', runRanges: { run1: [{ lo: 0, hi: 1 }], run2: [{ lo: 1, hi: 2 }], run3: [{ lo: 2, hi: 3 }] } });
  const sl = slopes(per);
  ok(sl.length === 3 && near(sl[0], 10, 1e-6) && near(sl[1], 20, 1e-6) && near(sl[2], 30, 1e-6), `fit: ranges per run (slopes ${sl.map((v) => fmtNum(v, 4)).join(', ')})`);
  const common = fit({ rangesBy: 'run', ranges: [{ lo: 0, hi: 1 }], runRanges: { run3: [{ lo: 2, hi: NaN }] } });
  const sc = slopes(common);
  ok(near(sc[0], 10, 1e-6) && near(sc[2], 30, 1e-6), 'fit: a run without its own ranges takes the common ones; an empty end is open');
}

{
  // Differentiate / Integrate
  const xs = Float64Array.from({ length: 201 }, (_, i) => i / 20); // 0 … 10
  const idx = Array.from(xs, (_, i) => i);
  const sq = Float64Array.from(xs, (x) => x * x);
  const d1 = derivative(xs, sq, idx, 1, 'central');
  ok(near(d1.get(100)!, 10, 1e-9) && near(d1.get(37)!, 2 * xs[37], 1e-9), 'derivative of x²: 2x (central)');
  const d2 = derivative(xs, sq, idx, 2, 'central');
  ok(near(d2.get(100)!, 2, 1e-6), 'second derivative of x²: 2');
  const cub = Float64Array.from(xs, (x) => x ** 3 - 2 * x);
  const sg = derivative(xs, cub, idx, 1, 'sg', 7, 3);
  ok(near(sg.get(0)!, -2, 1e-6) && near(sg.get(120)!, 3 * 36 - 2, 1e-6), 'Savitzky–Golay derivative of a cubic (degree 3): exact, ends included');
  const tx = Float64Array.from({ length: 2001 }, (_, i) => (i / 2000) * 2 * Math.PI);
  const sn = Float64Array.from(tx, Math.sin);
  const half = regionRows(tx, Array.from(tx, (_, i) => i), [{ lo: 0, hi: Math.PI }])[0].rows;
  ok(near(integrate(tx, sn, half, { area: 'signed', baseline: 'zero', base: 0 }).area, 2, 1e-5), 'integral of sin over [0, π] = 2');
  const all = Array.from(tx, (_, i) => i);
  ok(Math.abs(integrate(tx, sn, all, { area: 'signed', baseline: 'zero', base: 0 }).area) < 1e-9 && near(integrate(tx, sn, all, { area: 'abs', baseline: 'zero', base: 0 }).area, 4, 1e-5), 'integral of sin over [0, 2π]: 0 signed, 4 absolute');
  const lin = Float64Array.from(tx, (x) => 1 + x);
  ok(Math.abs(integrate(tx, lin, all, { area: 'signed', baseline: 'line', base: 0 }).area) < 1e-9, 'integral over a line between the ends: a straight line gives 0');
  // the node: regions separate / combined, the areas, the dataset with X, Y and the result
  const ds = { name: 'd', columns: [{ ...column('t (s)', xs), role: 'x' as const }, { ...column('v', Float64Array.from(xs, () => 2)), role: 'y' as const }] };
  const node = (extra: Partial<CalculusData>) =>
    evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S', text: sheetText(ds) }] } } as AppNode,
        { id: 'c', type: 'calculus', position: { x: 0, y: 0 }, data: { ...CALCULUS_DEFAULTS, ...extra } } as AppNode,
      ],
      [{ id: 'e', source: 'w', sourceHandle: 'out', target: 'c', targetHandle: 'in' }],
    ).get('c');
  const regs = [
    { lo: 1, hi: 2 },
    { lo: 5, hi: 8 },
  ];
  const sep = node({ op: 'int', regions: regs });
  const col = (r: ReturnType<typeof node>, j: number) => (r?.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns[j] : undefined);
  const area = sep?.outputs.area?.t === 'scalar' ? sep.outputs.area.v.value : NaN;
  ok(col(sep, 2)?.name === '∫v dt' && near(col(sep, 2)!.values[160], 6, 1e-9) && Number.isNaN(col(sep, 2)!.values[60]) && near(area, 8, 1e-9), 'Integrate node: regions separate (from 0 in each), empty outside, total area');
  const comb = node({ op: 'int', regions: regs, join: 'combined' });
  const low = sep?.view.calc?.lower[0];
  ok(!!low && Number.isNaN(low.y[60]) && Number.isFinite(low.y[30]) && Number.isFinite(low.y[120]), 'Integrate node: the curve under the graph breaks between the regions');
  ok(near(col(comb, 2)!.values[160], 8, 1e-9) && sep?.outputs.areas?.t === 'dataset' && sep.outputs.areas.v.columns[3].values.length === 2, 'Integrate node: regions combined; the table of areas');
  ok(sep?.outputs.areas?.t === 'dataset' && sep.outputs.areas.v.columns[0].text?.join(',') === 'range 1,range 2', 'Integrate node: the ranges named range 1, range 2 in the table of areas');
  // a baseline through points: straight segments, a spline, flat outside; an integral over it
  const lc = pointsCurve([{ x: 0, y: 1 }, { x: 10, y: 3 }], 'linear')!;
  ok(near(lc(5), 2) && lc(-4) === 1 && lc(20) === 3, 'baseline points: straight, flat outside');
  const sc = pointsCurve([0, 1, 2, 3, 4].map((v) => ({ x: v, y: v * v })), 'spline')!;
  ok(near(sc(2), 4) && Math.abs(sc(2.5) - 6.25) < 0.05, 'baseline points: a natural spline through the points');
  const over = node({ op: 'int', baseline: 'points', basePoints: [{ x: 0, y: 1 }, { x: 10, y: 1 }] });
  const ov = over?.outputs.area?.t === 'scalar' ? over.outputs.area.v.value : NaN;
  ok(near(ov, 10, 1e-9) && (over?.view.calc?.bases[0].y ?? []).filter(Number.isFinite).every((v) => v === 1), 'Integrate node: over a baseline of points (2 − 1 over 0 … 10 = 10)');
  const dif = node({ op: 'diff' });
  ok(col(dif, 2)?.name === 'dv/dt' && Math.abs(col(dif, 2)!.values[50]) < 1e-12 && col(dif, 0)?.role === 'x', 'Differentiate node: X, Y, dY/dX');
}

{
  // the workbook example: a Fit with no Y chosen fits every designated curve (a run per sheet, each with its X), and the
  // ranges of each run apply
  const p = EXAMPLES.find((e) => e.name.startsWith('Four runs'))!.make();
  const fitNode = { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, model: { ...FIT_DEFAULTS.model, model: 'linear' }, rangesBy: 'run', runRanges: { 'Run 2': [{ lo: 0, hi: 10 }] } } } as AppNode;
  const res = evaluateGraph([...p.nodes, fitNode], [...p.edges, { id: 'x', source: 'auto', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]).get('f');
  const runs = res?.view.fit?.runs ?? [];
  ok(runs.length === 4 && runs[1].label === 'Run 2' && runs[1].stats.n < runs[0].stats.n, `fit: every designated curve a run (${runs.length}), the ranges of Run 2 (${runs[1]?.stats.n} of ${runs[0]?.stats.n} points)`);
}

{
  // a value with its error, as the Fit shows its parameters
  ok(fmtPm(660.2404, 0.2812) === '660.24 ± 0.28' && fmtPm(1.5, NaN) === '1.5', 'value ± error with the digits of the error');
}

{
  // a cyclic voltammogram in one table: E 0 → 1 → −1 → 0, three times; I = +1 going up, −1 coming down (a rectangle)
  const E: number[] = [];
  const I: number[] = [];
  const seg = (a: number, b: number) => {
    for (let k = 0; k < 100; k++) {
      E.push(a + ((b - a) * k) / 100);
      I.push(b > a ? 1 : -1);
    }
  };
  for (let c = 0; c < 3; c++) {
    seg(0, 1);
    seg(1, -1);
    seg(-1, 0);
  }
  E.push(0);
  I.push(1);
  const ds = { name: 'cv', columns: [{ ...column('E (V)', Float64Array.from(E)), role: 'x' as const }, { ...column('I (mA)', Float64Array.from(I)), role: 'y' as const }] };
  const g = splitRows({ mode: 'cycles' }, ds.columns[0], E.map((_, i) => i), undefined, []);
  ok(typeof g === 'object' && !!g && g.rows.length === 3 && groupText(g, 1) === 'cycle 2', 'split: the cycles of a scan that goes and comes back');
  const run = (extra: Partial<CalculusData>) =>
    evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S', text: sheetText(ds) }] } } as AppNode,
        { id: 's', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, by: 'direction', xs: 'each' } } as AppNode,
        { id: 'c', type: 'calculus', position: { x: 0, y: 0 }, data: { ...CALCULUS_DEFAULTS, op: 'int', ys: 'I (mA) · segment 1', baseline: 'curve', baseFrom: 'column', baseColumn: 'I (mA) · segment 2', area: 'abs', regions: [{ lo: 0, hi: 0.5 }], ...extra } } as AppNode,
      ],
      [
        { id: 'e', source: 'w', sourceHandle: 'out', target: 's', targetHandle: 'in' },
        { id: 'f', source: 's', sourceHandle: 'out', target: 'c', targetHandle: 'in' },
      ],
    ).get('c');
  // Split into columns ▸ where X changes direction: going up (segment 1) and coming back (segment 2), each with its X
  const r = run({});
  const areas = r?.view.calc?.areas.map((a) => a.area) ?? [];
  ok(areas.length === 1 && near(areas[0], 1, 1e-9) && (r?.view.calc?.fills[0][0]?.x.length ?? 0) > 2 && r?.errors.length === 0, `CV: the area between going up and coming back, the second piece as the baseline (${areas.map((a) => fmtNum(a, 4)).join(', ')}; ${r?.errors.join('; ')}), hatched`);
  // the area between curves: absolute counts both sides of a crossing, signed subtracts
  const f = { x: [0, 1, 2], y: [1, -1, 1] };
  const z = { x: [0, 2], y: [0, 0] };
  ok(near(areaBetween(f, z, 0, 2, true).area, 1) && near(areaBetween(f, z, 0, 2, false).area, 0), 'area between curves: absolute vs signed across a crossing');
  // lowest point: the curve lifted above 0
  const lp = integrate([0, 1, 2], [-1, 0, -1], [0, 1, 2], { area: 'signed', baseline: 'lowest', base: 0 });
  ok(near(lp.area, 1), 'baseline at the lowest point: nothing subtracted below 0');
}

{
  // zoom: the frame under the mouse and its scales, the limits written into the Plot's axes, Rescale; the view of a
  // working graph scaled around a point
  const p = EXAMPLES.find((e) => e.name.startsWith('Three Y'))!.make();
  const res = evaluateGraph(p.nodes, p.edges);
  const fig = res.get('plot-3')?.view.figure;
  const W = fig ? toPt(fig.width, fig.unit) : 0;
  const H = fig ? toPt(fig.height, fig.unit) : 0;
  const pos = fig?.axes[0].style.pos;
  const hit = fig && pos ? hitAt(fig, W, H, ((pos.x + pos.w / 2) / 100) * W, ((pos.y + pos.h / 2) / 100) * H) : null;
  ok(!!hit && hit.xKeys.join() === 'bottom' && hit.yKeys.join() === 'left,right,y3', 'zoom: the frame under the mouse, every Y axis of it (left, right, Y3)');
  const plotData = p.nodes.find((n) => n.id === 'plot-3')!.data as Plot1DData;
  const ax = withRanges(plotData.axes, { bottom: [2, 8], right: [20, 30] });
  ok(ax.x?.min === 2 && ax.x.max === 8 && ax.right?.scale.min === 20 && Number.isNaN(ax.y?.min ?? 0) && ax.x.breaks === plotData.axes?.x?.breaks, 'zoom: new limits on the bottom and the right axis, the others and the breaks kept');
  const back = autoRanges(ax);
  ok(Number.isNaN(back.x!.min) && Number.isNaN(back.right!.scale.max), 'zoom: Rescale = automatic limits again');
  const v = zoomAt({ x0: 0, x1: 10, y0: 0, y1: 4 }, 5, 2, 0.5, 'x');
  ok(v.x0 === 2.5 && v.x1 === 7.5 && v.y0 === 0 && v.y1 === 4, 'zoom: a view halved around a point, only X (Shift)');
  // Zoom out: every axis of the Plot widened 1.6 times around its middle
  const out = fig ? zoomOutRanges(fig, W, H, 1.6) : [];
  const sb = hit?.scales.get('bottom');
  const ob = out[0]?.ranges.bottom;
  ok(out.length === 1 && out[0].node === 'plot-3' && Object.keys(out[0].ranges).sort().join() === 'bottom,left,right,y3' && !!sb && !!ob && !!hit && near(ob[0], sb.inv(hit.frame.x - 0.3 * hit.frame.w), 1e-9) && near(ob[1], sb.inv(hit.frame.x + 1.3 * hit.frame.w), 1e-9) && ob[0] < sb.lo && ob[1] > sb.hi, 'zoom out: every axis widened 1.6 times on the page around its middle (an axis with a break too)');
}

{
  // Split into columns ▸ cycles: the cyclic voltammogram example as one X and a current column per cycle
  const p = EXAMPLES.find((e) => e.name.startsWith('Cyclic'))!.make();
  const u = { id: 'u', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, by: 'cycles' } } as AppNode;
  const r = evaluateGraph([...p.nodes, u], [...p.edges, { id: 'x', source: 'cv-file', sourceHandle: 'out', target: 'u', targetHandle: 'in' }]).get('u');
  const cols = r?.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns : [];
  ok(cols.map((c) => c.name).join('|') === 'Potential (V)|Current (mA) · cycle 1|Current (mA) · cycle 2|Current (mA) · cycle 3' && cols.every((c) => c.values.length === 401) && !r?.warnings.length, 'split into columns: the cycles of a scan, aligned on one X (the closing point in both cycles)');
}

{
  // Pick points
  ok(JSON.stringify(pickValues('0.2, 0.5')) === '[0.2,0.5]' && JSON.stringify(pickValues('0:0.25:1')) === '[0,0.25,0.5,0.75,1]' && typeof pickValues('a') === 'string', 'pick: the values, a list or start:step:end');
  const o = { interp: 'linear' as const, outside: 'empty' as const };
  // a line y = 2x on 0 … 1: at x = 0.3; beyond: nothing, extrapolated, the end
  const lx = Array.from({ length: 11 }, (_, i) => i / 10);
  const ly = lx.map((v) => 2 * v);
  const rows = lx.map((_, i) => i);
  const at = (rule: PickRule, oo = o) => pickPoints(lx, ly, rows, [rule], oo).points;
  ok(near(at({ kind: 'x', value: '0.33' })[0].y, 0.66) && at({ kind: 'x', value: '1.5' }).length === 0 && near(at({ kind: 'x', value: '1.5' }, { ...o, outside: 'extrapolate' })[0].y, 3) && at({ kind: 'x', value: '1.5' }, { ...o, outside: 'end' })[0].y === 2, 'pick: at X (linear), beyond: nothing / extrapolated / the end');
  ok(near(at({ kind: 'y', value: '1' })[0].x, 0.5), 'pick: at Y = 1 → x = 0.5');
  {
    // A cyclic curve: 0 -> 1 -> 0 -> -1 -> 0
    const cx = [0, 1, 2, 3, 4];
    const cy = [0, 1, 0, -1, 0];
    const crows = [0, 1, 2, 3, 4];
    const allC = pickPoints(cx, cy, crows, [{ kind: 'y', value: '0.5', which: 'all' }], o).points;
    const firstC = pickPoints(cx, cy, crows, [{ kind: 'y', value: '0.5', which: 'first' }], o).points;
    const lastC = pickPoints(cx, cy, crows, [{ kind: 'y', value: '0.5', which: 'last' }], o).points;
    ok(allC.length === 2 && firstC.length === 1 && near(firstC[0].x, 0.5) && lastC.length === 1 && near(lastC[0].x, 1.5), 'pick: which crossing — all (2), first (0.5), last (1.5)');
  }
  const sx = Array.from({ length: 41 }, (_, i) => (i / 40) * Math.PI);
  const sy = sx.map(Math.sin);
  const sp = pickPoints(sx, sy, sx.map((_, i) => i), [{ kind: 'x', value: '1' }, { kind: 'max', value: '' }], { ...o, interp: 'spline' }).points;
  ok(Math.abs(sp[0].y - Math.sin(1)) < 1e-5 && Math.abs(sp[1].x - Math.PI / 2) < 1e-6 && Math.abs(sp[1].y - 1) < 1e-4, 'pick: spline at X, the maximum refined by a parabola');
  ok(at({ kind: 'where', value: 'x >= 0.8' }).length === 3 && at({ kind: 'max', value: '', from: 0, to: 0.5 })[0].x === 0.5, 'pick: rows where a condition holds; the maximum between limits');
  // the rectangle voltammogram of the Integrate check cut where E changes direction: at E = 0.5, +1 going up and −1 coming down
  const E: number[] = [];
  const I: number[] = [];
  for (let c = 0; c < 3; c++)
    for (const [a, b] of [
      [0, 1],
      [1, -1],
      [-1, 0],
    ])
      for (let k = 0; k < 100; k++) {
        E.push(a + ((b - a) * k) / 100);
        I.push(b > a ? 1 : -1);
      }
  const ds = { name: 'cv', columns: [{ ...column('E (V)', Float64Array.from(E)), role: 'x' as const }, { ...column('I (mA)', Float64Array.from(I)), role: 'y' as const }] };
  const node = (extra: Partial<PickData>) =>
    evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S', text: sheetText(ds) }] } } as AppNode,
        { id: 's', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, by: 'direction', xs: 'each' } } as AppNode,
        { id: 'p', type: 'pick', position: { x: 0, y: 0 }, data: { ...PICK_DEFAULTS, rules: [{ kind: 'x', value: '0.5' }], ...extra } } as AppNode,
      ],
      [
        { id: 'e', source: 'w', sourceHandle: 'out', target: 's', targetHandle: 'in' },
        { id: 'f', source: 's', sourceHandle: 'out', target: 'p', targetHandle: 'in' },
      ],
    ).get('p');
  const long = node({});
  const lc = long?.outputs.out?.t === 'dataset' ? long.outputs.out.v.columns : [];
  ok(lc.map((c) => c.name).join() === 'segment,pick,at,row,X,Y' && Array.from(lc[0].values).join() === '1,2,3,4,5,6' && Array.from(lc[5].values).join() === '1,-1,1,-1,1,-1' && lc[1].role === 'label' && Array.from(lc[2].values).every((v) => v === 0.5), `pick: at E = 0.5 on every segment, a row per point against the segment (${lc.map((c) => c.name).join()}; ${long?.errors.join('; ')})`);
  const wide = node({ layout: 'wide' });
  const wc = wide?.outputs.out?.t === 'dataset' ? wide.outputs.out.v.columns : [];
  ok(wc.length === 2 && wc[0].name === 'segment' && wc[1].values.length === 7 && wc[1].values[1] === -1 && Number.isNaN(wc[1].values[6]), `pick: a row per Y column, a column per point (${wc.map((c) => c.name).join()})`);
  // the other columns read at the points: none (a new node), all (an older one), a list
  const four = (extra: Partial<PickData>) => {
    const r = evaluateGraph(
      [
        { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y;z;w\n0;0;10;100\n1;2;20;200\n', textId: 't' } } as AppNode,
        { id: 'p', type: 'pick', position: { x: 0, y: 0 }, data: { ...PICK_DEFAULTS, ys: 'y', rules: [{ kind: 'x', value: '0.5' }], ...extra } } as AppNode,
      ],
      [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'in' }],
    ).get('p');
    return r?.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns.map((c) => c.name).join() : `${r?.errors.join('; ')}`;
  };
  const [none, all, listed] = [four({}), four({ others: undefined }), four({ others: 'w' })];
  ok(none === 'run,pick,at,row,x,y' && all === 'run,pick,at,row,x,y,z,w' && listed === 'run,pick,at,row,x,y,w', `pick: the other columns — none, all, a list (${none} | ${all} | ${listed})`);
  // a workbook on Pick points and Extract column: the sheet chosen (absent: the first)
  const twoSheets = (pick: Partial<PickData>, ex: { sheet?: string }) =>
    evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'x\ty\n0\t0\n1\t1' }, { name: 'S2', text: 'x\ty\n0\t0\n1\t10' }] } } as AppNode,
        { id: 'p', type: 'pick', position: { x: 0, y: 0 }, data: { ...PICK_DEFAULTS, rules: [{ kind: 'x', value: '0.5' }], ...pick } } as AppNode,
        { id: 'x', type: 'extract', position: { x: 0, y: 0 }, data: { ...EXTRACT_DEFAULTS, column: 'y', index: 1, ...ex } } as AppNode,
      ],
      [
        { id: 'e', source: 'w', sourceHandle: 'book', target: 'p', targetHandle: 'in' },
        { id: 'f', source: 'w', sourceHandle: 'book', target: 'x', targetHandle: 'in' },
      ],
    );
  const yOf = (r: ReturnType<typeof twoSheets>) => {
    const o = r.get('p')?.outputs.out;
    const c = r.get('x')?.outputs.out;
    return `${o?.t === 'dataset' ? o.v.columns.find((q) => q.name === 'y')?.values[0] : '-'}/${c?.t === 'column' ? c.v.values[1] : '-'}`;
  };
  const [first, second] = [twoSheets({}, {}), twoSheets({ sheet: 'S2' }, { sheet: 'S2' })];
  ok(yOf(first) === '0.5/1' && yOf(second) === '5/10' && JSON.stringify(second.get('p')?.view.sheets) === '["S1","S2"]', `pick, extract: a workbook, the sheet chosen (${yOf(first)} | ${yOf(second)})`);
}

{
  // Pick points: separate sheets for X readings and Y readings (workbook output)
  const g = evaluateGraph(
    [
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'Data', text: 'x\ty\n0\t0\n1\t1' }] } } as AppNode,
      {
        id: 'p',
        type: 'pick',
        position: { x: 0, y: 0 },
        data: {
          ...PICK_DEFAULTS,
          rules: [
            { kind: 'x', value: '0.4' },
            { kind: 'y', value: '0.7' },
          ],
        },
      } as AppNode,
      { id: 'ex', type: 'extract', position: { x: 0, y: 0 }, data: { ...EXTRACT_DEFAULTS, sheet: 'at Y', column: 'x', index: 4 } } as AppNode,
    ],
    [
      { id: 'e1', source: 'w', sourceHandle: 'out', target: 'p', targetHandle: 'in' },
      { id: 'e2', source: 'p', sourceHandle: 'book', target: 'ex', targetHandle: 'in' },
    ],
  );
  const pOut = g.get('p')?.outputs.out;
  const pBook = g.get('p')?.outputs.book;
  const exOut = g.get('ex')?.outputs.out;
  ok(pBook?.t === 'workbook' && pBook.v.sheets.length === 2 && pBook.v.sheets[0].name === 'at X' && pBook.v.sheets[1].name === 'at Y', 'pick: rules at X and at Y produce separate sheets in workbook');
  ok(pOut?.t === 'dataset' && pOut.v.name === 'at X' && near(pOut.v.columns.find((c) => c.name === 'y')?.values[0] ?? 0, 0.4), 'pick: default out emits active sheet (at X)');
  ok(near(pBook?.v.sheets[1].columns.find((c) => c.name === 'x')?.values[0] ?? 0, 0.7), 'pick: at Y sheet contains crossing X value');
  ok(exOut?.t === 'column' && near(exOut.v.values[0], 0.7), 'pick: extract connected to book port can read from at Y sheet');

  // Split into columns from a workbook: the sheet chosen (absent: the first)
  {
    const book = { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'One', text: 'x\ty\trun\n0\t1\t1\n1\t2\t1' }, { name: 'Two', text: 'x\ty\trun\n0\t5\t1\n1\t6\t1\n0\t7\t2\n1\t8\t2' }] } } as AppNode;
    const split = (extra: object) => evaluateGraph([book, { id: 's', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, x: 'x', ys: 'y', by: 'column', column: 'run', ...extra } } as AppNode], [{ id: 'e', source: 'w', sourceHandle: 'book', target: 's', targetHandle: 'in' }]).get('s')?.outputs.out;
    const [first, two] = [split({}), split({ sheet: 'Two' })];
    ok(first?.t === 'dataset' && first.v.columns.length === 2 && two?.t === 'dataset' && two.v.columns.length === 3 && Array.from(two.v.columns[2].values).join() === '7,8', 'Split into columns: the sheet of a workbook chosen (else the first)');
  }

  // switching active output sheet
  const g2 = evaluateGraph(
    [
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'Data', text: 'x\ty\n0\t0\n1\t1' }] } } as AppNode,
      {
        id: 'p',
        type: 'pick',
        position: { x: 0, y: 0 },
        data: {
          ...PICK_DEFAULTS,
          sheetOut: 1,
          rules: [
            { kind: 'x', value: '0.4' },
            { kind: 'y', value: '0.7' },
          ],
        },
      } as AppNode,
    ],
    [{ id: 'e1', source: 'w', sourceHandle: 'out', target: 'p', targetHandle: 'in' }],
  );
  const pOut2 = g2.get('p')?.outputs.out;
  ok(pOut2?.t === 'dataset' && pOut2.v.name === 'at Y', 'pick: sheetOut: 1 switches active dataset output to at Y');

  // sheetsMode: 'one' combines into single table
  const g3 = evaluateGraph(
    [
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'Data', text: 'x\ty\n0\t0\n1\t1' }] } } as AppNode,
      {
        id: 'p',
        type: 'pick',
        position: { x: 0, y: 0 },
        data: {
          ...PICK_DEFAULTS,
          sheetsMode: 'one',
          rules: [
            { kind: 'x', value: '0.4' },
            { kind: 'y', value: '0.7' },
          ],
        },
      } as AppNode,
    ],
    [{ id: 'e1', source: 'w', sourceHandle: 'out', target: 'p', targetHandle: 'in' }],
  );
  const pBook3 = g3.get('p')?.outputs.book;
  ok(pBook3?.t === 'workbook' && pBook3.v.sheets.length === 1 && pBook3.v.sheets[0].columns.find((c) => c.name === 'pick')?.values.length === 2, 'pick: sheetsMode one keeps all points in single table');
}


{
  // the example: the cycles plotted coloured by the cycle; the area between going up and coming back in cycle 1
  const p = EXAMPLES.find((e) => e.name.startsWith('Cyclic'))!.make();
  const r = evaluateGraph(p.nodes, p.edges);
  const cv = r.get('cv-plot')?.view.curves ?? [];
  const pk = r.get('cv-pick')?.outputs.out;
  const cb = r.get('cv-area')?.outputs.base;
  ok(cb?.t === 'dataset' && cb.v.columns.map((c) => c.name).join() === 'Potential (V),baseline' && cb.v.columns[1].values.length > 10, 'Integrate: the baseline out (X and its values)');
  ok(cv.length === 3 && cv[0].style.color !== cv[2].style.color && near(r.get('cv-area')?.view.calc?.areas[0]?.area ?? 0, 0.331, 2e-3) && pk?.t === 'dataset' && pk.v.columns[0].values.length === 18, 'example: the cycles coloured by the cycle, the area between the branches, the picked points');
}

{
  // format 5 → 6: Statistics on rows becomes Statistics ▸ On rows (the same ports and results)
  const old = JSON.stringify({
    app: 'graph-flow',
    version: 5,
    nodes: [
      { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;a;b\n1;1;3\n2;2;6\n', textId: 't' } },
      { id: 'r', type: 'statsrows', position: { x: 0, y: 0 }, data: { cols: '2-3', x: '', err: 'sd' } },
    ],
    edges: [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'r', targetHandle: 'in' }],
  });
  const p = parseProject(old);
  const n = typeof p === 'string' ? undefined : p.nodes.find((x) => x.id === 'r');
  const res = typeof p === 'string' ? undefined : evaluateGraph(p.nodes, p.edges).get('r');
  ok(n?.type === 'stats' && (n.data as { on?: string }).on === 'rows' && res?.outputs.mean?.t === 'column' && Array.from(res.outputs.mean.v.values).join() === '2,4' && res.outputs.out?.t === 'dataset', 'format 5 → 6: Statistics on rows → Statistics ▸ On rows');
  ok(!!n && sourcePort(n, 'out') === 'dataset' && sourcePort(n, 'mean') === 'column' && sourcePort(n, 'table') === null, 'Statistics ▸ On rows: its ports');
}

{
  // format 6 → 7: no Split outside Split into columns — a Plot loses its split and its group port, a Fit its split,
  // and the fit curves (now a dataset) go to the Plot's dataset port
  const old = JSON.stringify({
    app: 'graph-flow',
    version: 6,
    nodes: [
      { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;1\n1;3\n2;5\n3;7\n', textId: 't' } },
      { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ys: ['y'], split: { mode: 'auto' }, model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'linear' } } },
      { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...PLOT1D_DEFAULTS, label: '', style: {}, cols: { x: 'x', y: 'y', group: 'x' }, split: { mode: 'auto' }, rows: [{ label: '', style: {}, cols: {} }] } },
    ],
    edges: [
      { id: 'e1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' },
      { id: 'e2', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' },
      { id: 'e3', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'group' },
      { id: 'e4', source: 'f', sourceHandle: 'fit', target: 'p', targetHandle: 'series-1' },
    ],
  });
  const p = parseProject(old);
  const nodes = typeof p === 'string' ? [] : p.nodes;
  const edges = typeof p === 'string' ? [] : p.edges;
  const pd = nodes.find((n) => n.id === 'p')?.data as Record<string, unknown> | undefined;
  const fd = nodes.find((n) => n.id === 'f')?.data as Record<string, unknown> | undefined;
  ok(!!pd && !('split' in pd) && !('group' in (pd.cols as object)) && !!fd && !('split' in fd), `format 6 → 7: the splits removed (${typeof p === 'string' ? p : ''})`);
  ok(edges.length === 3 && !edges.some((e) => e.targetHandle === 'group') && edges.some((e) => e.source === 'f' && e.target === 'p' && e.targetHandle === 'dataset') && evaluateGraph(nodes, edges).get('p')?.errors.length === 0, 'format 6 → 7: no group port; the fit curves on the dataset port');
}

{
  // no series type: a Plot curve's data and a Fit's residuals are datasets; a Fit of a Plot curve's data
  const xs = [0, 1, 2, 3, 4, 5];
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n' + xs.map((x) => `${x};${2 * x + 1 + (x % 2 ? 0.1 : -0.1)}`).join('\n'), textId: 's8' } } as AppNode;
  const r = evaluateGraph(
    [
      imp,
      { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {}, cols: { x: 'x', y: 'y' } } } as AppNode,
      { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: '', ys: [], model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'linear' } } } as AppNode,
      { id: 'q', type: 'plot1d', position: { x: 0, y: 0 }, data: { label: '', style: {}, cols: {} } } as AppNode,
    ],
    [
      { id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' },
      { id: '2', source: 'p', sourceHandle: 'series', target: 'f', targetHandle: 'in' },
      { id: '3', source: 'f', sourceHandle: 'resid', target: 'q', targetHandle: 'series' },
    ],
  );
  const data = r.get('p')?.outputs.series;
  const res = r.get('f')?.outputs.resid;
  ok(data?.t === 'dataset' && data.v.columns.map((c) => c.role).join() === 'x,y' && near(r.get('f')?.view.fit?.runs[0].params.find((q) => q.name === 'b')?.value ?? 0, 2, 0.05), 'a Plot curve’s data: a dataset (X, Y designated), fitted');
  ok(res?.t === 'dataset' && res.v.columns.length === 2 && res.v.columns[1].values.length === 6 && r.get('q')?.view.curves?.[0]?.series.y.values.length === 6, 'the residuals: a dataset, drawn from a Plot curve’s data port');
  ok(sourcePort({ id: 'u', type: 'unstack', position: { x: 0, y: 0 }, data: UNSTACK_DEFAULTS } as AppNode, 'values') === 'dataset' && Object.keys(evaluateGraph([imp, { id: 'u', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, by: 'every', every: 3 } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'u', targetHandle: 'in' }]).get('u')?.outputs ?? {}).join() === 'out,long', 'Split into columns: the dataset out and the long table');
  // format 7 → 8: the “block values” connection goes, a group's series port becomes a dataset port
  const old = JSON.stringify({
    app: 'graph-flow',
    version: 7,
    nodes: [
      { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;1\n1;3\n0;2\n1;4\n', textId: 't' } },
      { id: 'u', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS } },
      { id: 's', type: 'stats', position: { x: 0, y: 0 }, data: { on: 'columns' } },
      { id: 'g', type: 'subgraph', position: { x: 0, y: 0 }, data: { name: 'g', nodes: [], edges: [], inputs: [{ id: 'a', label: 'a', type: 'series' }], outputs: [] } },
    ],
    edges: [
      { id: 'e1', source: 'i', sourceHandle: 'out', target: 'u', targetHandle: 'in' },
      { id: 'e2', source: 'u', sourceHandle: 'values', target: 's', targetHandle: 'in' },
    ],
  });
  const pp = parseProject(old);
  const g = typeof pp === 'string' ? undefined : pp.nodes.find((n) => n.id === 'g');
  ok(typeof pp !== 'string' && pp.edges.length === 1 && pp.edges[0].id === 'e1' && (g?.data as { inputs?: { type?: string }[] } | undefined)?.inputs?.[0]?.type === 'dataset', `format 7 → 8: no block values, no series (${typeof pp === 'string' ? pp : ''})`);
}

{
  // a fit per range: two peaks on one curve, a range around each — two fits, each with its parameters, curve and band
  const xs = Array.from({ length: 161 }, (_, i) => i / 8);
  const ys = xs.map((x) => 0.2 + 1 * Math.exp((-4 * Math.LN2 * (x - 5) ** 2) / 1.5 ** 2) + 2 * Math.exp((-4 * Math.LN2 * (x - 15) ** 2) / 2 ** 2));
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n' + xs.map((x, i) => `${x};${ys[i]}`).join('\n'), textId: 'pr' } } as AppNode;
  const run = (rangeFits: boolean) =>
    evaluateGraph([imp, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ys: ['y'], rangeFits, ranges: [{ lo: 0, hi: 10 }, { lo: 10, hi: 20 }], model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'gauss' } } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]).get('f')!;
  const each = run(true);
  const fr = each.view.fit?.runs ?? [];
  const pt = each.outputs.params;
  const fc = each.outputs.fit?.t === 'dataset' ? each.outputs.fit.v.columns : [];
  ok(fr.length === 2 && near(fr[0].params.find((q) => q.name === 'xc')!.value, 5, 1e-3) && near(fr[1].params.find((q) => q.name === 'xc')!.value, 15, 1e-3) && fr[1].range === 2 && fr[1].of === 'y' && each.view.fit?.labels.join() === 'y', `fit per range: a fit of each range (${fr.map((r) => r.label).join(', ')})`);
  ok(pt?.t === 'dataset' && pt.v.columns[1].name === 'Y column' && pt.v.columns[1].text?.join() === 'y,y' && Array.from(pt.v.columns[2].values).join() === '1,2' && Array.from(pt.v.columns[3].values).join() === '0,10' && Array.from(pt.v.columns[4].values).join() === '10,20' && fc.length === 6 && Math.max(...fc[0].values) <= 10 && Math.min(...fc[3].values) >= 10, 'fit per range: a row per range in the parameters; each curve over its range only');
  ok((run(false).view.fit?.runs.length ?? 0) === 1, 'fit per range off: one fit of the points of both ranges');
}

{
  // Workbook inputs: columns side by side on the first sheet (the shorter ones padded; the sheet empty, it shows them), a
  // dataset on a sheet of its own named on its input, after the book's own sheets
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n1;2\n2;4\n3;6\n', textId: 'bk' } } as AppNode;
  const ex = (id: string, column: string) => ({ id, type: 'extract', position: { x: 0, y: 0 }, data: { column, index: 0 } }) as AppNode;
  const short = { id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, name: 'z', mode: 'linspace', start: 1, stop: 2, count: 2 } } as AppNode;
  const r = evaluateGraph(
    [imp, ex('a', 'x'), ex('b', 'y'), short, { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, into: ['', '', '', 'all'], sheet: 0 } } as AppNode],
    [
      { id: '1', source: 'i', sourceHandle: 'out', target: 'a', targetHandle: 'in' },
      { id: '2', source: 'i', sourceHandle: 'out', target: 'b', targetHandle: 'in' },
      { id: '3', source: 'a', sourceHandle: 'out', target: 'w', targetHandle: 'in-0' },
      { id: '4', source: 'b', sourceHandle: 'out', target: 'w', targetHandle: 'in-1' },
      { id: '5', source: 'g', sourceHandle: 'out', target: 'w', targetHandle: 'in-2' },
      { id: '6', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in-3' },
    ],
  ).get('w');
  const book = r?.outputs.book?.t === 'workbook' ? r.outputs.book.v : undefined;
  const inSheet = book?.sheets[0];
  ok(book?.sheets.map((q) => q.name).join() === 'Sheet1,all' && r?.view.book?.own === 1 && r.view.book.kinds?.join() === 'input,input' && inSheet?.columns.map((c) => c.name).join() === 'x,y,z' && inSheet.columns[2].values.length === 3 && Number.isNaN(inSheet.columns[2].values[2]) && r?.outputs.out?.t === 'dataset' && r.outputs.out.v.name === 'Sheet1', `Workbook: inputs side by side on the first sheet, another on a sheet of its own (${book?.sheets.map((q) => q.name).join()}; ${r?.errors.join('; ')})`);
  // a first sheet with a table of its own: the inputs at its right, read-only from there
  const typed = { ...newSheet('Sheet1'), edits: { addRows: 2, addCols: 1, cells: { '0:0': '7', '1:0': '8' } } };
  const mixed = evaluateGraph(
    [imp, ex('a', 'x'), { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [typed], roles: { Sheet1: { x: 'y' } } } } as AppNode],
    [
      { id: '1', source: 'i', sourceHandle: 'out', target: 'a', targetHandle: 'in' },
      { id: '3', source: 'a', sourceHandle: 'out', target: 'w', targetHandle: 'in-0' },
    ],
  ).get('w');
  const ms = mixed?.outputs.out?.t === 'dataset' ? mixed.outputs.out.v : undefined;
  ok(mixed?.view.sheets?.join() === 'Sheet1' && mixed.view.book?.kinds?.join() === 'mixed' && mixed.view.book.keys?.join() === 'o0,i:x' && ms?.columns.length === 2 && Array.from(ms.columns[0].values).slice(0, 2).join() === '7,8' && Array.from(ms.columns[1].values).join() === '1,2,3' && ms.columns[1].role === 'y' && mixed.view.sheet?.cols.length === 1, `Workbook: the inputs at the right of the first sheet's own table (${ms?.columns.map((c) => c.name).join()}; ${mixed?.view.book?.kinds?.join()})`);
  ok(sourcePort({ id: 'w', type: 'book', position: { x: 0, y: 0 }, data: WORKBOOK_DEFAULTS } as AppNode, 'book') === 'workbook' && canConnectBook('column') && canConnectBook('workbook'), 'Workbook: its inputs take columns, datasets, workbooks');
  // format 8 → 9: the view input becomes A, the empty sheet it hid goes
  const old = JSON.stringify({
    app: 'graph-flow',
    version: 8,
    nodes: [
      { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n1;2\n', textId: 't' } },
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS } },
    ],
    edges: [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in' }],
  });
  const pp = parseProject(old);
  const res = typeof pp === 'string' ? undefined : evaluateGraph(pp.nodes, pp.edges).get('w');
  ok(typeof pp !== 'string' && pp.edges[0].targetHandle === 'in-0' && res?.view.sheets?.join() === 'inputs' && res.outputs.out?.t === 'dataset' && res.outputs.out.v.columns.length === 2, `format 8 → 9: the Workbook's view input becomes A (${typeof pp === 'string' ? pp : res?.view.sheets?.join()})`);
  // the inputs' columns hidden and moved, a column of its own among them (kept by keys); an empty sheet with a column of
  // its own in the order is a table of its own
  const arranged = evaluateGraph(
    [imp, { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'Sheet1', text: '', edits: { addRows: 3, addCols: 1, cells: {} } }], layout: { Sheet1: { order: ['i:y', 'o0'], hide: ['i:x'] } } } } as AppNode],
    [{ id: '1', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in-0' }],
  ).get('w');
  const ad = arranged?.outputs.out?.t === 'dataset' ? arranged.outputs.out.v : undefined;
  ok(arranged?.view.book?.kinds?.join() === 'mixed' && arranged.view.book.keys?.join() === 'i:y,o0' && ad?.columns.map((c) => c.name).join() === 'y,A' && Array.from(ad.columns[0].values).join() === '2,4,6', `Workbook: the inputs' columns hidden and moved, one of its own after them (${ad?.columns.map((c) => c.name).join()}; ${arranged?.view.book?.keys?.join()})`);
  // a worksheet: a row inserted between (rowOrder), a column inserted before the first (order)
  const ins = applySheet({ name: 't', columns: [column('a', Float64Array.from([1, 2])), column('b', Float64Array.from([3, 4]))] }, { addRows: 1, rowOrder: [0, 2, 1], addCols: 1, order: [2, 0, 1], cells: { '2:0': '9' } }, '.').dataset;
  ok(ins.columns.map((c) => c.name).join() === 'C,a,b' && Array.from(ins.columns[1].values).join() === '1,9,2' && Number.isNaN(ins.columns[0].values[0]) && Array.from(ins.columns[2].values).join() === '3,NaN,4', `worksheet: a row and a column inserted between (${ins.columns.map((c) => `${c.name}=${Array.from(c.values).join(' ')}`).join('; ')})`);
  // format 11 → 12: the inputs of an older Workbook keep their sheet “inputs” (after its own Sheet1)
  const v11 = JSON.stringify({
    app: 'graph-flow',
    version: 11,
    nodes: [
      { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n1;2\n', textId: 't' } },
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, into: ['', 'more'] } },
    ],
    edges: [
      { id: 'e', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in-0' },
      { id: 'f', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in-1' },
    ],
  });
  const p11 = parseProject(v11);
  const r11 = typeof p11 === 'string' ? undefined : evaluateGraph(p11.nodes, p11.edges).get('w');
  ok(typeof p11 !== 'string' && (p11.nodes[1].data as WorkbookData).into?.join() === 'inputs,more' && r11?.view.sheets?.join() === 'Sheet1,inputs,more', `format 11 → 12: a Workbook's inputs keep their sheet “inputs” (${typeof p11 === 'string' ? p11 : r11?.view.sheets?.join()})`);
}

{
  // Peak analyzer: three peaks, two of them overlapping (a shoulder), over a sloping baseline
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const L = (x: number, c: number, w: number) => 1 / (1 + ((2 * (x - c)) / w) ** 2);
  const xs = Array.from({ length: 401 }, (_, i) => i / 4);
  const ys = xs.map((x) => 0.1 + 0.002 * x + G(x, 30, 8) + 0.8 * L(x, 55, 6) + 0.4 * G(x, 61, 6));
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n' + xs.map((x, i) => `${x};${ys[i]}`).join('\n'), textId: 'pk' } } as AppNode;
  const run = (d: Partial<PeakData>) => evaluateGraph([imp, { id: 'p', type: 'peaks', position: { x: 0, y: 0 }, data: { ...PEAK_DEFAULTS, ...d } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'in' }]).get('p')!;
  const col = (r: ReturnType<typeof run>, port: string, name: string) => {
    const o = r.outputs[port];
    return o?.t === 'dataset' ? o.v.columns.find((c) => c.name === name) : undefined;
  };
  // Run analysis: not fitted until run; fitted with the settings of the Run; run again when they change
  {
    const fresh = { ...PEAK_NEW, baseline: 'constant' as const, peaks: [{ shape: 'gauss' as const, x: 30 }] };
    const never = run(fresh);
    const ran = run({ ...fresh, ran: peakRunKey(fresh) });
    const changed = run({ ...fresh, peaks: [{ shape: 'lorentz', x: 30 }], ran: peakRunKey(fresh) });
    ok(never.view.peaks?.run === 'never' && !col(never, 'out', 'envelope') && ran.view.peaks?.run === 'fitted' && !!col(ran, 'out', 'envelope') && changed.view.peaks?.run === 'changed', `peaks: fitted only after Run analysis, again after a change (${never.view.peaks?.run}, ${ran.view.peaks?.run}, ${changed.view.peaks?.run})`);
    // a region: the peak at the maximum in it (the shoulder region finds 55, not 61), its centre kept in it
    const reg = run({ peaks: [{ shape: 'gauss', x: NaN, from: 20, to: 40 }, { shape: 'lorentz', x: NaN, from: 50, to: 58 }], baseline: 'constant' });
    const c = col(reg, 'table', 'center')?.values ?? [];
    ok(c.length === 2 && near(c[0], 30, 0.05) && c[1] >= 50 && c[1] <= 58, `peaks: placed by regions — at their maxima, kept in them (${Array.from(c).join(', ')})`);
    ok(near(regionPeak([0, 1, 2, 3, 4], [0, 2, 3, 2, 0], 0, 4, 'max'), 2, 1e-9) && near(regionPeak([0, 1, 2], [3, 1, 2], 0, 2, 'min'), 7 / 6, 1e-9) && Number.isNaN(regionPeak([0, 1], [1, 1], 5, 6, 'max')), 'regionPeak: the extremum, refined; none outside');
  }
  const auto = run({});
  ok(auto.view.peaks?.runs[0].found.map((f) => Math.round(f.x)).join() === '30,55', `peaks: the maxima found (a bump that hardly stands out left to “shoulders”) (${auto.view.peaks?.runs[0].found.map((f) => f.x).join()})`);
  // a peak with no maximum of its own (in the side of a stronger one): found only as a shoulder
  const zs = xs.map((x) => G(x, 30, 8) + 0.8 * G(x, 55, 6) + 0.4 * G(x, 61, 6));
  const fo = { sign: 'peaks' as const, count: 6, minHeight: 5, shoulders: false };
  const sh = findPeaksIn(xs, zs, { ...fo, shoulders: true });
  ok(findPeaksIn(xs, zs, fo).length === 2 && sh.length === 3 && Math.abs(sh[2].x - 61) < 1.5, `peaks: the shoulder found from the second derivative (${sh.map((f) => f.x).join()})`);
  const fit = run({ peaks: [{ shape: 'gauss', x: 30 }, { shape: 'lorentz', x: 55 }, { shape: 'gauss', x: 62 }] });
  const cen = col(fit, 'table', 'center');
  const fw = col(fit, 'table', 'FWHM');
  ok(!!cen && near(cen.values[0], 30, 1e-4) && near(cen.values[1], 55, 1e-4) && near(cen.values[2], 61, 1e-4) && !!fw && near(fw.values[1], 6, 1e-4) && near(fw.values[2], 6, 1e-4), `peaks: fitted together — the overlapping ones separated (${cen && Array.from(cen.values).join()})`);
  const pct = col(fit, 'table', 'area %');
  const area = col(fit, 'table', 'area');
  ok(!!pct && near(pct.values[0] + pct.values[1] + pct.values[2], 100, 1e-9) && !!area && near(area.values[1], 0.8 * Math.PI * 3, 1e-3), 'peaks: the areas (a Lorentzian: A·π·w/2) and their %');
  const names = fit.outputs.out?.t === 'dataset' ? fit.outputs.out.v.columns.map((c) => c.name).join() : '';
  const env = col(fit, 'out', 'envelope');
  ok(names === 'x,y,baseline,peak 1,peak 2,peak 3,envelope' && !!env && near(env.values[200], ys[200], 1e-4), `peaks: out — the data, the baseline, every peak, the envelope (${names})`);
  const sub = run({ subtract: true, peaks: [{ shape: 'gauss', x: 30 }, { shape: 'lorentz', x: 55 }, { shape: 'gauss', x: 62 }] });
  const p2 = col(sub, 'out', 'peak 2');
  ok(!!p2 && near(p2.values[220], 0.8, 1e-3) && !!col(sub, 'out', 'y − baseline') && !col(sub, 'out', 'baseline'), 'peaks: subtracted — every peak from 0');
  const meas = run({ fit: false, baseline: 'ends', peaks: [{ shape: 'gauss', x: 30 }] });
  const ma = col(meas, 'table', 'area');
  ok(!!ma && Math.abs(ma.values[0] - 8 * Math.sqrt(Math.PI / (4 * Math.LN2))) < 0.4 && !!col(meas, 'table', 'centroid'), `peaks: measured on the data (no fit), over a fixed baseline (${ma?.values[0]})`);
  // the example
  const ex = EXAMPLES.find((e) => e.name.startsWith('Overlapping'))!.make();
  const er = evaluateGraph(ex.nodes, ex.edges);
  const t = er.get('ov-peaks')?.outputs.table;
  const c = t?.t === 'dataset' ? t.v.columns.find((q) => q.name === 'center') : undefined;
  ok(!!c && Math.abs(c.values[0] - 1350) < 2 && Math.abs(c.values[1] - 1580) < 2 && Math.abs(c.values[2] - 1625) < 4 && er.get('ov-plot')?.view.curves?.length === 5, `example: overlapping peaks separated (${c && Array.from(c.values).map((v) => v.toFixed(1)).join()})`);
}

{
  // format 9 → 10: the Group designation is “–”
  const old = JSON.stringify({
    app: 'graph-flow',
    version: 9,
    nodes: [{ id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'g;x;y\n1;1;2\n', textId: 't', edits: { cols: { 0: { role: 'group' }, 1: { role: 'x' } } } } }],
    edges: [],
  });
  const pp = parseProject(old);
  const ed = typeof pp === 'string' ? undefined : (pp.nodes[0].data as { edits?: { cols?: Record<string, { role?: string }> } }).edits;
  ok(ed?.cols?.['0']?.role === 'none' && ed.cols['1']?.role === 'x', `format 9 → 10: Group → – (${typeof pp === 'string' ? pp : ''})`);
  // the Peak fit style: the curves of a Peak analyzer by their names
  const pf = BUILTIN_STYLES.find((q) => q.name.startsWith('Curves: peak fit'))!;
  const pd = { ...PLOT1D_DEFAULTS, cols: { x: 'x', y: 'y' }, rows: ['baseline', 'peak 1', 'peak 2', 'envelope'].map((y) => ({ label: '', style: CURVE_STYLE_DEFAULTS, cols: { x: 'x', y } })) } as Plot1DData;
  const st = styledData({ id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: pd } as AppNode, pf) as Plot1DData;
  const rs = st.rows!.map((r) => r.style);
  ok(st.style.mode === 'scatter' && rs[0].dash === 'dash' && rs[1].fill === 'curve' && rs[1].fillCurve === 2 && rs[1].color !== rs[2].color && rs[3].color === '#111111', 'Peak fit style: data dots, baseline dashed, peaks filled down to the baseline, the envelope black');
}

{
  // a hidden curve: not in the legend nor the limits of the axes, still a curve another one fills to
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y;b\n0;1;100\n1;3;100\n2;2;100\n', textId: 'hid' } } as AppNode;
  const rows = [{ label: 'base', style: { ...CURVE_STYLE_DEFAULTS, show: false }, cols: { x: 'x', y: 'b' } }];
  const r = evaluateGraph([imp, { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...PLOT1D_DEFAULTS, label: 'y', style: { ...CURVE_STYLE_DEFAULTS, fill: 'curve', fillCurve: 2 }, cols: { x: 'x', y: 'y' }, rows } as Plot1DData } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  const fig = r.view.figure!;
  const lg = fig.axes[0].legends[0];
  const yMax = axesStyle(fig.axes[0].style).y.max;
  ok(r.view.curves?.length === 2 && lg.curves.length === 1 && lg.curves[0].label === 'y' && !Number.isFinite(yMax), 'Plot: a hidden curve — out of the legend, still there to fill to');
}

{
  // comment lines: found by themselves (! # % //), chosen marks, after the data too; the names from the last comment
  const names = (t: string, o: Partial<typeof CSV_DEFAULTS> = {}) => readTable(t, { ...CSV_DEFAULTS, ...o }).dataset.columns.map((c) => c.name).join('|');
  const vals = (t: string, o: Partial<typeof CSV_DEFAULTS> = {}) => readTable(t, { ...CSV_DEFAULTS, ...o }).dataset.columns.map((c) => Array.from(c.values).join(',')).join('|');
  const bang = '! an instrument\n! Freq, GHz   Re (S11)   Im (S11)\n1 2 3\n! a note between\n4 5 6\n';
  const hash = '# made by a script\n# x\ty\n1\t2\n3\t4\n';
  const rem = 'REM header\nREM a  b\n1 2\n';
  ok(names(bang) === 'Freq, GHz|Re (S11)|Im (S11)' && vals(bang) === '1,4|2,5|3,6' && names(hash) === 'x|y' && vals(hash) === '1,3|2,4' && names(rem, { comment: 'REM' }) === 'a|b' && names(bang, { namesFromComment: false }) === 'A|B|C', `import: comment lines left out wherever they are, the names from the last one (${names(bang)} · ${names(hash)})`);
  const inline = 'x y\n1 2 # first\n3 4 # second\n';
  const old = readTable(bang, { delimiter: 'auto', decimal: 'auto', skip: 2, nameLine: -1, unitLine: 0, commentLine: 0 });
  ok(vals(inline, { commentEnd: true }) === '1,3|2,4' && old.dataset.columns.length === 4 && old.dataset.columns[0].text?.[1] === '!' && Number.isNaN(old.dataset.columns[0].values[1]), 'import: comments after the data; an older project (no comment options) read as before');
  // a line of names cut at spaces inside the names: cut again at two spaces
  const spaced = 'Time (s)  Signal (mV)\n0 1\n1 2\n';
  ok(names(spaced, { delimiter: ' ' }) === 'Time (s)|Signal (mV)', `import: names with spaces kept whole (${names(spaced, { delimiter: ' ' })})`);
  // Touchstone: 2 ports RI (version 1: S11 S21 S12 S22), dB and phase added; 1 port MA; 2 ports DB version 2 (12_21);
  // 4 ports over several lines; the noise parameters left out
  const s2 = '! a VNA\n# GHz S RI R 50\n! Freq Re(S11) Im(S11) …\n1 0.6 0.8 0.1 0 0 0.1 0.5 0\n2 0 1 0.2 0 0 0.2 0.5 0.5\n';
  const t2 = parseTouchstone(s2, 'dev.s2p', 'dev', true);
  const c2 = Object.fromEntries(t2.dataset.columns.map((c) => [c.name, Array.from(c.values)]));
  ok(t2.info.ports === 2 && t2.info.format === 'RI' && t2.info.z0 === 50 && c2['Frequency (GHz)'].join() === '1,2' && c2['Re S21'].join() === '0.1,0.2' && c2['Re S12'].join() === '0,0' && near(c2['S11 (dB)'][0], 0, 1e-12) && near(c2['∠S11 (°)'][1], 90, 1e-12) && t2.header.length === 3, `Touchstone: 2 ports, real / imaginary, the order S11 S21 S12 S22, dB and phase (${t2.dataset.columns.map((c) => c.name).join(' | ')})`);
  const t1 = parseTouchstone('# MHz S MA R 75\n100 0.5 45\n200 0.25 -90\n', 'x.s1p', 'x', true);
  const c1 = Object.fromEntries(t1.dataset.columns.map((c) => [c.name, Array.from(c.values)]));
  ok(t1.info.ports === 1 && t1.info.z0 === 75 && t1.dataset.columns[0].name === 'Frequency (MHz)' && near(c1['S11 (dB)'][0], 20 * Math.log10(0.5), 1e-12) && near(c1['Re S11'][1], 0, 1e-12) && near(c1['Im S11'][1], -0.25, 1e-12), 'Touchstone: 1 port, magnitude / angle, its dB and parts');
  const v2 = parseTouchstone('[Version] 2.0\n# Hz S DB R 50\n[Number of Ports] 2\n[Two-Port Data Order] 12_21\n[Network Data]\n1e9 -1 10 -20 20 -30 30 -2 40\n[End]\n', 'f.txt', 'f', false);
  ok(v2.info.version === 2 && v2.dataset.columns.map((c) => c.name).slice(1, 5).join() === 'S11 (dB),∠S11 (°),S12 (dB),∠S12 (°)' && v2.dataset.columns[3].values[0] === -20, 'Touchstone version 2: its keywords, the order 12_21');
  const four = '# GHz S RI R 50\n1 ' + Array.from({ length: 32 }, (_, k) => k + 1).map((v, k) => (k % 8 === 7 ? `${v}\n` : `${v} `)).join('') + '2 ' + Array.from({ length: 32 }, () => 0).join(' ') + '\n';
  const t4 = parseTouchstone(four, 'n.s4p', 'n', false);
  ok(t4.info.ports === 4 && t4.dataset.columns.length === 33 && t4.dataset.columns[3].name === 'Re S12' && t4.dataset.columns[3].values[0] === 3 && t4.dataset.columns[0].values.length === 2, 'Touchstone: 4 ports, a frequency over several lines, row by row');
  const noise = parseTouchstone('# GHz S RI R 50\n1 0 0 0 0 0 0 0 0\n2 0 0 0 0 0 0 0 0\n1 0.5 0.3 10 0.2\n2 0.6 0.4 20 0.3\n', 'a.s2p', 'a', false);
  ok(noise.info.noise === 2 && noise.dataset.columns[0].values.length === 2 && noise.warnings.some((w) => w.includes('noise')), 'Touchstone: the noise parameters after the data left out, said');
  ok(readTable(s2, CSV_DEFAULTS, 'x', 'x.s2p').touchstone?.ports === 2 && !readTable(s2, { ...CSV_DEFAULTS, format: 'table' }, 'x', 'x.s2p').touchstone && !readTable(s2, { delimiter: 'auto', decimal: 'auto', skip: 0, nameLine: -1, unitLine: 0, commentLine: 0 }, 'x', 'x.s2p').touchstone, 'import: Touchstone found by itself, a table when asked, a table for older projects');
}

{
  // dates and times read from text, their ticks and labels
  const d1 = parseTime('2024-01-05');
  const d2 = parseTime('05.01.2024 13:20');
  const d3 = parseTime('5/1/2024');
  const d4 = parseTime('5/1/2024', 'mdy');
  const d5 = parseTime('13/1/2024', 'mdy');
  const t1 = parseTime('1:02:03');
  ok(d1?.kind === 'date' && d1.v === Date.UTC(2024, 0, 5) / 1000 && d2?.v === d1.v + 13 * 3600 + 20 * 60 && d3?.v === d1.v && d4?.v === Date.UTC(2024, 4, 1) / 1000 && d5?.v === Date.UTC(2024, 0, 13) / 1000 && t1?.kind === 'duration' && t1.v === 3723 && parseTime('hello') === null, 'time: dates (ISO, dotted, slashes either way), durations read from text');
  const tm = timeTicks(Date.UTC(2024, 0, 10) / 1000, Date.UTC(2024, 11, 20) / 1000, 5, 'date');
  ok(tm.labels.join() === 'Apr 2024,Jul 2024,Oct 2024' && formatTime(d2!.v, 'dd.MM.yyyy HH:mm', 'date') === '05.01.2024 13:20' && formatTime(3723, 'H:mm:ss', 'duration') === '1:02:03', `time: calendar ticks every two months, labels written as asked (${tm.labels.join(' | ')})`);
  // symmetric log, logit, log base 2
  const sp = { ...AXIS_DEFAULTS, scale: 'symlog' as const, linthresh: 1 };
  const sk = axisTicks(sp, -1000, 1000, 5).major;
  ok(near(symTi(sp, symT(sp, -37)), -37, 1e-9) && symT(sp, 0) === 0 && sk.includes(0) && sk.includes(-1000) && sk.includes(1000) && axisTicks({ ...AXIS_DEFAULTS, scale: 'logit' }, 0.01, 0.99, 5).major.includes(0.5) && (() => { const b2 = axisTicks({ ...AXIS_DEFAULTS, scale: 'log', base: 2 }, 1, 64, 5); return b2.major.flatMap((v, k) => (v >= 1 && v <= 64 ? [b2.labels![k]] : [])).join() === '1,2,4,8,16,32,64'; })() && axisRange({ ...AXIS_DEFAULTS, cats: ['a', 'b', 'c'] }, 1, 3).join() === '0.5,3.5', `scales: symlog through 0 (${sk.join(' ')}), logit, log base 2, a category axis' ends`);
  // categories over several columns: in the order of the data, sorted, as listed; spread points; times
  const ca = { ...column('a', Float64Array.from([NaN, NaN, NaN]), ['B', 'A', 'B']) };
  const cb = { ...column('b', Float64Array.from([NaN, NaN]), ['C', 'A']) };
  const v1 = axisValues([ca, cb], { kind: 'auto' });
  const v2 = axisValues([ca, cb], { kind: 'auto', catOrder: 'sorted' });
  const v3 = axisValues([ca, cb], { kind: 'auto', catOrder: 'custom', catList: 'C, B' });
  const pj = placeColumn(ca, v1, { jitter: 0.3 }, true);
  const tv = axisValues([{ ...column('d', Float64Array.from([NaN, NaN]), ['2024-01-05', '2024-02-01']) }], { kind: 'auto' });
  ok(v1.kind === 'category' && v1.cats.join() === 'B,A,C' && v2.kind === 'category' && v2.cats.join() === 'A,B,C' && v3.kind === 'category' && v3.cats.join() === 'C,B,A' && Array.from(placeColumn(ca, v1, {}, false).values).join() === '1,2,1' && Math.abs(pj.values[2] - 1) <= 0.3 && pj.values[2] !== 1 && tv.kind === 'time' && axisValues([column('n', Float64Array.from([1, 2]))], { kind: 'auto' }).kind === 'number', 'axis values: categories in order, sorted, listed; points spread around their place; dates; numbers');
  // a 1D plot of names and values, stacked areas, a dumbbell
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'g;a;b\nx;1;3\ny;2;5\nz;4;4.5\n', textId: 'cat' } } as AppNode;
  const pl = (data: Partial<Plot1DData>) => evaluateGraph([imp, { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...PLOT1D_DEFAULTS, label: '', cols: { x: 'g', y: 'a' }, rows: [{ label: '', style: CURVE_STYLE_DEFAULTS, cols: { x: 'g', y: 'b' } }], ...data } as Plot1DData } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  const p0 = pl({});
  const a0 = p0.view.figure!.axes[0];
  const ps = pl({ stack: 'stack', join: { show: true } }).view.figure!.axes[0];
  const pp = pl({ stack: 'percent' }).view.figure!.axes[0];
  ok(a0.style.x.cats?.join() === 'x,y,z' && Array.from(a0.curves[0].series.x.values).join() === '1,2,3' && Array.from(ps.curves[2].series.y.values).join() === '4,7,8.5' && ps.curves[0].key.endsWith(':join') && ps.curves[2].style.fill === 'curve' && near(pp.curves[1].series.y.values[0], 100, 1e-9), `1D plot: names on X, curves stacked (as % too), joined at every X (${a0.style.x.cats?.join()})`);
  // points counted, their density, vectors as arrows and streamlines
  const q = Array.from({ length: 400 }, (_, i) => [Math.cos(i) * (i % 7), Math.sin(i * 1.3) * (i % 5)]);
  const cg = countGrid(q.map((p) => p[0]), q.map((p) => p[1]), 10);
  const dg = densityGrid(q.map((p) => p[0]), q.map((p) => p[1]), 80);
  const cell = (dg.xs[1] - dg.xs[0]) * (dg.ys[1] - dg.ys[0]);
  const mass = dg.z.reduce((a, b) => a + b, 0) * cell;
  const xs = Array.from({ length: 21 }, (_, i) => -1 + i / 10);
  const U = { xs, ys: xs, z: Float64Array.from({ length: 441 }, (_, t) => -xs[Math.floor(t / 21)]) };
  const V = { xs, ys: xs, z: Float64Array.from({ length: 441 }, (_, t) => xs[t % 21]) };
  const ar = vectorArrows(U, V, 2, 0.9);
  const sl = streamlines(U, V, 1);
  ok(cg.z.reduce((a, b) => a + b, 0) === 400 && near(mass, 1, 0.03) && ar.length > 50 && sl.length > 5 && sl.every((l) => l.x.length >= 4), `fields: points counted (all of them), their density (integral ${mass.toFixed(3)}), arrows (${ar.length}) and streamlines (${sl.length}) of a rotation`);
}

{
  // histogram fits over a range: two peaks, each fitted on its own (from the data — the values cut to the range, their
  // tails outside accounted for — and fitted to the bars), and both together (several Gaussians)
  const q = (m: number, sd: number, n: number) => Array.from({ length: n }, (_, i) => m + sd * normInv((i + 0.5) / n));
  const cut = q(5, 1, 4000).filter((x) => x >= 4 && x <= 7);
  const tf = truncatedFit(cut, [[4, 7]], 'normal');
  ok(near(tf.loc, 5, 0.02) && near(tf.scale, 1, 0.03) && sdOfCut(cut) < 0.8 && near(tf.mass, normalCdfOf(7, 5, 1) - normalCdfOf(4, 5, 1), 0.01), `truncated normal: μ and σ from the values cut to a range (${tf.loc}, ${tf.scale})`);
  const vals = [...q(0, 1, 3000), ...q(8, 1.5, 2000)];
  const H = histogram([{ name: 'A', values: vals }], { ...HISTOGRAM_DEFAULTS, bins: { ...HISTOGRAM_DEFAULTS.bins, mode: 'width', width: 0.25, start: NaN }, ranges: [{ lo: -3.5, hi: 3.5 }, { lo: 4, hi: 14 }], fits: [{ kind: 'normal', method: 'data', on: 0 }, { kind: 'normal', method: 'bars', on: 1 }, { kind: 'gaussN', method: 'bars', peaks: 2, parts: true }] }, 'x');
  const P = (k: number, nm: string) => (typeof H === 'string' ? NaN : H.fits[k]?.params.find((p) => p.name === nm)?.value ?? NaN);
  ok(typeof H !== 'string' && H.fits.length === 3 && near(P(0, 'μ (mean)'), 0, 0.02) && near(P(0, 'σ (SD)'), 1, 0.03) && near(P(1, 'xc'), 8, 0.1) && near(P(1, 'σ'), 1.5, 0.1) && near(P(2, 'xc1'), 0, 0.05) && near(P(2, 'xc2'), 8, 0.1) && near(P(2, 'σ2'), 1.5, 0.1) && H.fits[0].range === '-3.5 – 3.5' && H.fits[0].span?.join() === '-3.5,3.5' && H.fits[2].parts?.length === 2 && H.fits[2].range === '-3.5 – 3.5, 4 – 14', `histogram: each peak fitted in its range, both together (${typeof H === 'string' ? H : H.fits.map((f) => f.params.slice(0, 2).map((p) => p.value.toFixed(3)).join(' ')).join(' | ')})`);
  // A fit per range: one Normal, a result in every range
  const H2 = histogram([{ name: 'A', values: vals }], { ...HISTOGRAM_DEFAULTS, bins: { ...HISTOGRAM_DEFAULTS.bins, mode: 'width', width: 0.25, start: NaN }, ranges: [{ lo: -3.5, hi: 3.5 }, { lo: 4, hi: 14 }], rangeFits: true, fits: [{ kind: 'normal', method: 'data' }] }, 'x');
  const mus = typeof H2 === 'string' ? [] : H2.fits.map((q) => q.params[0].value);
  ok(mus.length === 2 && near(mus[0], 0, 0.02) && near(mus[1], 8, 0.05), `histogram: a fit per range (${mus.map((m) => m.toFixed(3)).join(', ')})`);
  const legend = typeof H === 'string' ? [] : H.curves.filter((c) => c.key.startsWith('fit:') && !c.noLegend).map((c) => c.label);
  ok(legend[0] === 'Normal (-3.5 – 3.5)' && legend.length === 3 && peakStarts([0, 1, 2, 3, 4, 5, 6], [1, 5, 2, 1, 2, 7, 3], 2, '').join() === '1,5' && peakStarts([0, 1, 2], [1, 2, 1], 2, '0.5, 1.5').join() === '0.5,1.5', `histogram: a fit's range in its legend entry; where several peaks start (${legend.join(' / ')})`);
}

{
  // annotation shapes: brackets in every direction (their legs, their text beyond them and readable), stars, arcs, bends
  const id = (v: number) => v;
  const sp = { ...SHAPE_DEFAULTS, kind: 'bracket' as const, x1: 10, x2: 50, y1: 20, y2: 80 };
  const down = bracketBase(sp, id, id);
  const left = bracketBase({ ...sp, orient: 'left' }, id, id);
  const free = bracketBase({ ...sp, orient: 'free', x2: 50, y2: 20 }, id, id);
  const flip = bracketBase({ ...sp, orient: 'free', x2: 50, y2: 20, flip: true }, id, id);
  ok(down.n.join() === '0,1' && down.p2.join() === '50,20' && left.p2.join() === '10,80' && left.n.join() === '-1,0' && free.n.join() === '0,1' && flip.n.join() === '0,-1', 'bracket: its base and the side of its legs (over x, beside y, free, flipped)');
  ok(bracketPath(down.p1, down.p2, down.n, 4, 6).d === 'M10,24L10,20L50,20L50,26' && bracketPath(down.p1, down.p2, down.n, 6, 6, 'curly').depth === 3 && bracketPath(down.p1, down.p2, down.n, 6, 6, 'curly').d.split('Q').length === 5, 'bracket: square legs of their own lengths; a curly brace');
  const tDown = bracketTextPlace(down.p1, down.p2, down.n, 0, 2);
  const tLeft = bracketTextPlace(left.p1, left.p2, left.n, 0, 2);
  const tLevel = bracketTextPlace(left.p1, left.p2, left.n, 0, 2, 'level');
  const tBack = bracketTextPlace([50, 20], [10, 20], [0, 1], 0, 2);
  ok(tDown.y === 18 && tDown.rotate === 0 && tDown.valign === 'bottom' && tDown.anchor === 'middle' && tLeft.x === 12 && Math.abs(tLeft.rotate) === 90 && tLeft.valign === (tLeft.rotate === 90 ? 'bottom' : 'top') && tLevel.rotate === 0 && tLevel.anchor === 'start' && tBack.rotate === 0, `bracket: the text beyond it, along it and readable, or level (${JSON.stringify([tDown, tLeft, tLevel, tBack])})`);
  const star = starPoints(0, 0, 10, 10, 5, 0.4);
  ok(star.length === 10 && near(star[0][1], -10, 1e-12) && near(Math.hypot(...star[1]), 4, 1e-12) && starPoints(0, 0, 1, 1, 6, null).length === 6, 'star: 5 points and 5 inner corners, a point at the top; a regular hexagon');
  ok(arcPath(0, 0, 10, 10, 0, 90, true).startsWith('M0,0L10,0A10 10 0 0 0 0,-10') && arcPath(0, 0, 10, 10, 0, 270, false).includes(' 0 1 0 ') && bentLine([0, 0], [10, 0], 0, 0, 0).d === 'M0,0L10,0' && bentLine([0, 0], [10, 0], 0.5, 0, 0).mid.join() === '5,2.5' && niceLength(37) === 20 && niceLength(0.07) === 0.05, 'arc and sector, a bent line (its middle), a round scale length');
  {
    // pie and donut slices: an old sector as it was; the hole (the inner arc back the other way); a whole ring; rounded
    // corners (two on the outline, the point of a pie, two on the hole), as much as there is room for; an ellipse
    const count = (d: string, s: string) => d.split(s).length - 1;
    const donut = piePath(0, 0, 10, 10, 0, 90, 0.5, 0);
    const ring = piePath(0, 0, 10, 10, 30, 30 + 360, 0.5, 0);
    const pieR = piePath(0, 0, 10, 10, 0, 90, 0, 2);
    const donutR = piePath(0, 0, 10, 10, 0, 90, 0.5, 1);
    const huge = piePath(0, 0, 10, 10, 0, 90, 0, 100);
    const radii = [...huge.matchAll(/A([\d.]+) /g)].map((m) => Number(m[1]));
    // a rounded pie's points: none beyond the outline, the first and last arcs tangent where the rounds meet the outline
    const pts = parsePath(pieR).flatMap((g) => (g.p.length ? [[g.p[g.p.length - 2], g.p[g.p.length - 1]]] : []));
    ok(
      piePath(0, 0, 10, 10, 0, 90, 0, 0) === arcPath(0, 0, 10, 10, 0, 90, true) &&
        donut === 'M5,0L10,0A10 10 0 0 0 0,-10L0,-5A5 5 0 0 1 5,0Z' &&
        count(ring, 'M') === 2 && count(ring, ' 1 0 ') === 2 && count(ring, ' 1 1 ') === 2 &&
        count(pieR, 'A2 2 0 0 0') === 3 && count(donutR, 'A1 1 0 0 0') === 4 &&
        pts.every(([x, y]) => Math.hypot(x, y) <= 10 + 1e-9) &&
        radii.length === 4 && radii.every(Number.isFinite) && radii[0] > 3 && radii[0] < 5 &&
        piePath(0, 0, 10, 5, 0, 120, 0.5, 0).includes('A10 5 ') && piePath(0, 0, 10, 5, 0, 120, 0.5, 0).includes('A5 2.5 '),
      `pie and donut: an old sector unchanged, the hole, a ring, rounded corners within the slice, an ellipse (${donut} · ${radii.join(', ')})`,
    );
    const asPath = shapeToPath({ ...SHAPE_DEFAULTS, kind: 'arc', x1: 0, y1: 0, x2: 20, y2: 20, a1: 0, a2: 90, sector: true, hole: 50, radius: 1 });
    ok(!!asPath && asPath.startsWith('M') && asPath.includes('C') && asPath.endsWith('Z') && !asPath.includes('NaN') && !asPath.includes('A'), `a donut's slice as a path: curves only (${asPath?.slice(0, 60)}…)`);
    // a bracket turned about the middle of its base: its ends and the side of its legs; turned with others (Figure Drawing)
    const t = bracketBase({ ...sp, rotation: 90 }, id, id);
    const r = rotateItem({ id: 'k', type: 'shape', spec: { kind: 'bracket', orient: 'down', x1: 10, x2: 50, y1: 20 } }, [0, 0], 90);
    const rs = r.type === 'shape' ? r.spec : {};
    ok(near(t.p1[0], 30) && near(t.p1[1], 0) && near(t.p2[0], 30) && near(t.p2[1], 40) && near(t.n[0], -1) && near(t.n[1], 0, 1e-9) && rs.x1 === -40 && rs.x2 === 0 && rs.y1 === 30 && rs.rotation === 90, `bracket: turned about the middle of its base; turned with other objects (${JSON.stringify(t)} ${JSON.stringify(rs)})`);
  }
  {
    // a line through bends: its pieces end on every bend (a smooth curve through them), its ends moved in for the heads
    // along the tangents; the bends written and read back
    const tl = throughLine([[0, 0], [10, 5], [20, 0]], 0, 0);
    const ends = [...tl.d.matchAll(/C[^C]* ([\d.-]+),([\d.-]+)/g)].map((m) => `${m[1]},${m[2]}`);
    const inset = throughLine([[0, 0], [10, 0], [20, 0]], 2, 3);
    ok(tl.d.startsWith('M0,0C') && ends.join(' ') === '10,5 20,0' && tl.mids.length === 2 && Math.abs(inset.ang2) < 1e-9 && Math.abs(Math.abs(inset.ang1) - Math.PI) < 1e-9 && inset.d.startsWith('M2,0') && inset.d.endsWith(' 17,0') && bendText(bendPoints('1 2; 3,4;x')) === '1 2; 3 4', 'a line through bends: through every one, its ends moved in along its tangents; the bends as text');
  }
}

{
  // sizes from the data: linear, by area, log, reversed, past the range the nearest end
  ok(scaledSize(5, [0, 10], 2, 8) === 5 && near(scaledSize(5, [0, 10], 2, 8, { area: true }), Math.sqrt(34), 1e-12) && near(scaledSize(10, [1, 100], 0, 10, { log: true }), 5, 1e-12) && scaledSize(0, [0, 10], 2, 8, { reverse: true }) === 8 && scaledSize(20, [0, 10], 2, 8) === 8 && Number.isNaN(scaledSize(NaN, [0, 1], 1, 2)), 'scaledSize: linear, area, log, reversed, clipped');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n1;10\n2;20\n3;40\n', textId: 'sz' } } as AppNode;
  const style = { ...CURVE_STYLE_DEFAULTS, mode: 'linesymbol' as const, sizeBy: 'y' as const, sizeFrom: 0, sizeKey: true, widthBy: 'x' as const, lineOver: true, symbolGap: 1 };
  const r = evaluateGraph([imp, { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...PLOT1D_DEFAULTS, label: 'y', style, cols: { x: 'x', y: 'y' } } as Plot1DData } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  const c = r.view.figure!.axes[0].curves[0];
  const lg = r.view.figure!.axes[0].legends[0].curves;
  ok(c.sizeRange?.join() === '0,40' && Array.from(c.widthValues ?? []).join() === '1,2,3' && c.widthRange?.join() === '1,3' && lg.length === 4 && lg.slice(1).every((q) => q.keyEntry) && lg.map((q) => q.label).slice(1).join() === '0,20,40' && lg[3].style.symbolSize === style.sizeMax, `Plot: size from y over a range set (a key of three sizes in the legend), width from x (${lg.map((q) => `${q.label}:${q.style.symbolSize}`).join(' ')})`);
}

{
  // the statistical tests and distributions against scipy (scripts/fixtures/stats-ref.py → stats-ref.json)
  const ref = JSON.parse(readFileSync(new URL('./fixtures/stats-ref.json', import.meta.url), 'utf8'));
  const R = ref.hypo;
  const rows: [string, number, number][] = [];
  const cmp = (what: string, mine: number, want: number) => rows.push([what, mine, want]);
  const H = Hy;
  const d = R.data;
  for (const k of ['A', 'B', 'D', 'small1']) {
    const x = d[k];
    const sw = H.shapiroWilk(x);
    cmp(`SW W ${k}`, sw.stat, R.norm[k].sw[0]);
    cmp(`SW p ${k}`, sw.p, R.norm[k].sw[1]);
    if (x.length >= 8) {
      cmp(`AD A2 ${k}`, H.andersonDarling(x).stat, R.norm[k].ad);
      cmp(`K2 ${k}`, H.dagostino(x).stat, R.norm[k].nt[0]);
      cmp(`K2 p ${k}`, H.dagostino(x).p, R.norm[k].nt[1]);
    }
    cmp(`KS D ${k}`, H.lilliefors(x).stat, R.norm[k].ks);
  }
  const t1 = H.tOne(d.A, 9.5);
  cmp('t1 t', t1.stat, R.t1[0]);
  cmp('t1 p', t1.p, R.t1[1]);
  cmp('t1 lo', t1.lo + 9.5, R.t1[3]);
  cmp('t1 greater', H.tOne(d.A, 9.5, 'greater').p, R.t1[5]);
  for (const eq of [true, false]) {
    const r = H.tTwo(d.A, d.B, eq);
    const ref = R[`t2_${eq ? 'True' : 'False'}`];
    cmp(`t2 ${eq} t`, r.stat, ref[0]);
    cmp(`t2 ${eq} p`, r.p, ref[1]);
    cmp(`t2 ${eq} df`, r.df!, ref[2]);
    cmp(`t2 ${eq} lo`, r.lo, ref[3]);
  }
  const tp = H.tPaired(d.A.slice(0, 12), d.B);
  cmp('tp t', tp.stat, R.tp[0]);
  cmp('tp p', tp.p, R.tp[1]);
  cmp('tp hi', tp.hi, R.tp[4]);
  const g3 = [d.A, d.B, d.C];
  cmp('levene mean F', H.levene(g3, 'mean').stat, R.levene_mean[0]);
  cmp('levene median p', H.levene(g3, 'median').p, R.levene_median[1]);
  cmp('bartlett', H.bartlett(g3).stat, R.bartlett[0]);
  cmp('bartlett p', H.bartlett(g3).p, R.bartlett[1]);
  const ow = H.oneWay(g3);
  cmp('anova F', ow.F, R.anova[0]);
  cmp('anova p', ow.p, R.anova[1]);
  const w = H.welchAnova(g3);
  cmp('welch F', w.F, R.welch[0]);
  cmp('welch p', w.p, R.welch[1]);
  const tk = H.postHoc(g3, 'tukey', ow.mse, ow.df2);
  const ij = [[0, 1], [0, 2], [1, 2]];
  tk.forEach((q, n) => {
    const [i, j] = ij[n];
    cmp(`tukey p ${i}${j}`, q.p, R.tukey.p[i][j]);
    cmp(`tukey lo ${i}${j}`, q.lo, R.tukey.lo[i][j]);
  });
  cmp('mwu small U', H.mannWhitney(d.small1, d.small2).stat, R.mwu_small[0]);
  cmp('mwu small p', H.mannWhitney(d.small1, d.small2).p, R.mwu_small[1]);
  cmp('mwu tied p', H.mannWhitney(d.tied1, d.tied2).p, R.mwu_tied[1]);
  cmp('mwu big p', H.mannWhitney(d.A, d.B).p, R.mwu_big[1]);
  cmp('wil small W', H.wilcoxon(R.d_small).stat, R.wil_small[0]);
  cmp('wil small p', H.wilcoxon(R.d_small).p, R.wil_small[1]);
  cmp('wil tied p', H.wilcoxon(R.d_tied).p, R.wil_tied[1]);
  cmp('sign p', H.signTest(R.d_tied).p, R.sign);
  cmp('kruskal H', H.kruskal(g3).stat, R.kruskal[0]);
  cmp('kruskal tied p', H.kruskal([d.tied1, d.tied2, d.small2]).p, R.kruskal_tied[1]);
  cmp('friedman', H.friedman(R.M).stat, R.friedman[0]);
  cmp('friedman p', H.friedman(R.M).p, R.friedman[1]);
  const [x, y] = R.xy;
  const pe = H.pearson(x, y);
  cmp('pearson r', pe.r, R.pearson[0]);
  cmp('pearson p', pe.p, R.pearson[1]);
  cmp('pearson lo', pe.lo, R.pearson[2]);
  cmp('spearman p', H.spearman(x, y).p, R.spearman[1]);
  cmp('kendall tau', H.kendall(x, y).r, R.kendall[0]);
  cmp('kendall p', H.kendall(x, y).p, R.kendall[1]);
  cmp('kendall tied p', H.kendall(d.tied1.slice(0, 12), d.tied2.slice(0, 12)).p, R.kendall_tied[1]);
  const two = H.twoWay(R.two.y, R.two.fa, R.two.fb, 3, 2);
  cmp('two ssA', two.rows[0].ss, R.two.ssA);
  cmp('two ssB', two.rows[1].ss, R.two.ssB);
  cmp('two ssAB', two.rows[2].ss, R.two.ssAB);
  cmp('two sse', two.rows[3].ss, R.two.sse);
  const rm = H.repeated(R.M);
  cmp('rm F', rm.rows[0].F, R.rm.F);
  cmp('rm p', rm.rows[0].p, R.rm.p);
  cmp('rm W', rm.mauchly.stat, R.rm.W);
  cmp('rm gg', rm.gg, R.rm.gg);
  cmp('rm pgg', rm.pGG, R.rm.pgg);
  const D = ref.dist;
  for (const [z, c, s] of D.norm) {
    cmp(`normCdf ${z}`, Di.normCdf(z), c);
    cmp(`normSf ${z}`, Di.normSf(z), s);
  }
  for (const [t, nu, c] of D.t) cmp(`tCdf ${t} ${nu}`, Di.tCdf(t, nu), c);
  for (const [f, a, b, s] of D.f) cmp(`fSf ${f} ${a} ${b}`, Di.fSf(f, a, b), s);
  for (const [x, k, s] of D.chi2) cmp(`chi2Sf ${x} ${k}`, Di.chi2Sf(x, k), s);
  for (const [k, n, pv] of D.binom) cmp(`binom ${k} ${n}`, Di.binomTest2(k, n), pv);
  const bad = rows.filter(([, a, b]) => !(Math.abs(a - b) / Math.max(1e-12, Math.abs(b)) < 1e-6));
  const tuk = D.tukey.filter(([q, k, df, c]: number[]) => !(Math.abs(Di.ptukey(q, k, df) - c) < 1e-6));
  ok(bad.length === 0 && tuk.length === 0, `statistics: ${rows.length + D.tukey.length} values as scipy (${bad.map((b) => b[0]).join(', ')}${tuk.length ? ` studentized range ${tuk.length}` : ''})`);
}

{
  // the statistics nodes: the same groups as columns and indexed give the same ANOVA; the example
  const cols = { name: 'c', columns: [column('A', Float64Array.from([5.1, 4.8, 5.3, 5.0])), column('B', Float64Array.from([6.0, 6.3, 5.7, NaN])), column('C', Float64Array.from([7.2, 6.9, 7.5, 7.1]))] };
  const val: number[] = [];
  const grp: string[] = [];
  cols.columns.forEach((c) => c.values.forEach((v) => Number.isFinite(v) && (val.push(v), grp.push(c.name))));
  const idx = { name: 'i', columns: [column('Value', Float64Array.from(val)), column('Group', Float64Array.from(grp, () => NaN), grp)] };
  const a1 = anovaNode(cols, { ...ANOVA_DEFAULTS });
  const a2 = anovaNode(idx, { ...ANOVA_DEFAULTS, layout: 'indexed', value: 'Value', factor: 'Group' });
  const F = (r: typeof a1) => r.tables.out?.columns.find((c) => c.name === 'F')?.values[0];
  ok(!!F(a1) && near(F(a1)!, F(a2)!, 1e-12) && near(F(a1)!, Hy.oneWay([[5.1, 4.8, 5.3, 5.0], [6.0, 6.3, 5.7], [7.2, 6.9, 7.5, 7.1]]).F, 1e-12) && a1.tables.posthoc?.columns[0].text?.length === 3, 'ANOVA: the groups as columns or indexed — the same F; the post-hoc pairs');
  const ex = EXAMPLES.find((e) => e.name.startsWith('Drug'))!.make();
  const r = evaluateGraph(ex.nodes, ex.edges);
  const bad = ex.nodes.filter((n) => (r.get(n.id)?.errors.length ?? 0) > 0).map((n) => n.id);
  const g = r.get('dr-anova1')?.outputs.groups;
  const two = r.get('dr-anova2')?.outputs.out;
  ok(!bad.length && g?.t === 'dataset' && g.v.columns[0].text?.join() === 'Control,10 mg,20 mg,40 mg' && two?.t === 'dataset' && two.v.columns[0].text?.slice(0, 3).join() === 'Dose,Sex,Dose × Sex' && (r.get('dr-plot')?.view.curves?.[0]?.series.yErr?.values.length ?? 0) === 4, `example: the drug study — every layout read, every test run (${bad.join(', ')})`);
}

{
  // Curve math: two Gaussians 3 apart — ΔX at Y = 0.5 is 3 at both crossings; ΔY at X; A − B on the X of A
  const G = (x: number, c: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / 16);
  const xs = Array.from({ length: 401 }, (_, i) => i / 20);
  const text = 'x;a;xb;b\n' + xs.map((x) => `${x};${G(x, 10)};${x + 0.025};${G(x + 0.025, 13)}`).join('\n');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'cm', edits: { cols: { 0: { role: 'x' }, 1: { role: 'y' }, 2: { role: 'x' }, 3: { role: 'y' } } } } } as AppNode;
  const run = (d: Partial<CurveMathData>) => evaluateGraph([imp, { id: 'c', type: 'curvemath', position: { x: 0, y: 0 }, data: { ...CURVEMATH_DEFAULTS, ...d } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'c', targetHandle: 'a' }]).get('c')!;
  const col = (r: ReturnType<typeof run>, k: number) => (r.outputs.out?.t === 'dataset' ? Array.from(r.outputs.out.v.columns[k].values) : []);
  const all = run({ op: 'dxAtY', values: '0.5', crossing: 'all' });
  ok(col(all, 3).length === 2 && col(all, 3).every((v) => near(v, 3, 1e-3)) && near(col(all, 1)[0], 8, 1e-3) && near(col(all, 2)[1], 15, 1e-3), `Curve math: ΔX at Y = 0.5, every crossing (${col(all, 3)})`);
  const many = run({ op: 'dxAtY', values: '0.2:0.2:0.8', crossing: 'last', abs: true });
  ok(col(many, 0).length === 4 && col(many, 3).every((v) => near(v, 3, 2e-3)), 'Curve math: ΔX at a range of Y (the last crossing, absolute)');
  const dy = run({ op: 'dyAtX', values: '10' });
  ok(near(col(dy, 3)[0], G(10, 13) - 1, 1e-4), 'Curve math: ΔY at X');
  const sub = run({ op: 'sub' });
  ok(col(sub, 1).length === 401 && Number.isNaN(col(sub, 1)[0]) && near(col(sub, 1)[200], 1 - G(10, 13), 1e-4) && sub.warnings.length === 1, 'Curve math: A − B on the X of A (B read by straight lines, empty outside it)');
  // Translate: by values (each its own), in steps, a point to a place; columns from ports designated here
  const tImp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;a;b\n0;1;5\n1;3;6\n2;2;4\n', textId: 'tr' } } as AppNode;
  const tr = (d: Partial<TranslateData>, extra: AppNode[] = [], edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[] = [{ id: '1', source: 'i', sourceHandle: 'out', target: 't', targetHandle: 'data' }]) =>
    evaluateGraph([tImp, ...extra, { id: 't', type: 'translate', position: { x: 0, y: 0 }, data: { ...TRANSLATE_DEFAULTS, ...d } } as AppNode], edges).get('t')!;
  const cols = (r: ReturnType<typeof tr>) => (r.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns.map((c) => `${c.name}:${Array.from(c.values).join('/')}`).join(' ') : r.errors.join());
  ok(cols(tr({ dx: 10, dy: 1 })) === 'x:10/11/12 a:2/4/3 b:6/7/5', `Translate: ΔX, ΔY for all (${cols(tr({ dx: 10, dy: 1 }))})`);
  ok(cols(tr({ dx: 0, dy: 0, own: { b: { dx: 1, dy: -4 } } })) === 'x (a):0/1/2 a:1/3/2 x (b):1/2/3 b:1/2/0', 'Translate: a curve with its own ΔX gets its own X');
  ok(cols(tr({ mode: 'stagger', dx: 0, dy: 10 })) === 'x:0/1/2 a:1/3/2 b:15/16/14', 'Translate: in steps (a waterfall)');
  ok(cols(tr({ mode: 'point', point: 'max', moveX: true, x0: 0, moveY: true, y0: 1 })) === 'x:-1/0/1 a:-1/1/0 b:0/1/-1', `Translate: the maximum of every curve moved to (0, 1) (${cols(tr({ mode: 'point', point: 'max', moveX: true, x0: 0, moveY: true, y0: 1 }))})`);
  const ex = (id: string, c: string) => ({ id, type: 'extract', position: { x: 0, y: 0 }, data: { column: c, index: 0 } }) as AppNode;
  const viaPorts = tr({ dy: 100, roles: { b: 'none' } }, [ex('e1', 'x'), ex('e2', 'a'), ex('e3', 'b')], [
    { id: '1', source: 'i', sourceHandle: 'out', target: 'e1', targetHandle: 'in' },
    { id: '2', source: 'i', sourceHandle: 'out', target: 'e2', targetHandle: 'in' },
    { id: '3', source: 'i', sourceHandle: 'out', target: 'e3', targetHandle: 'in' },
    { id: '4', source: 'e1', sourceHandle: 'out', target: 't', targetHandle: 'in-0' },
    { id: '5', source: 'e2', sourceHandle: 'out', target: 't', targetHandle: 'in-1' },
    { id: '6', source: 'e3', sourceHandle: 'out', target: 't', targetHandle: 'in-2' },
  ]);
  ok(cols(viaPorts) === 'x:0/1/2 a:101/103/102 b:5/6/4', `Translate: columns on the ports, designated here (b: –, not moved) (${cols(viaPorts)})`);
  // Resize (before the move): by a factor about a point, a range to another (each curve its own), two values to two
  // others (a calibration); the move then on the resized curves; the errors resized with their values
  const rz = (d: Partial<TranslateData>) => cols(tr(d));
  ok(rz({ sx: { mode: 'factor', k: 2, anchor: 'zero' } }) === 'x:0/2/4 a:1/3/2 b:5/6/4', `Resize: X × 2 about 0 (${rz({ sx: { mode: 'factor', k: 2, anchor: 'zero' } })})`);
  ok(rz({ sx: { mode: 'factor', k: 2, anchor: 'center' } }) === 'x:-1/1/3 a:1/3/2 b:5/6/4', 'Resize: X × 2 about the middle of the data');
  ok(rz({ sy: { mode: 'factor', k: 2, anchor: 'zero' } }) === 'x:0/1/2 a:2/6/4 b:10/12/8', 'Resize: Y × 2 about 0, every curve');
  ok(rz({ sy: { mode: 'range', from: [NaN, NaN], to: [0, 1] } }) === 'x:0/1/2 a:0/1/0.5 b:0.5/1/0', `Resize: every curve's Y range brought to 0 – 1 (${rz({ sy: { mode: 'range', from: [NaN, NaN], to: [0, 1] } })})`);
  ok(rz({ sx: { mode: 'points', pts: [0, 2, 10, 20] } }) === 'x:10/15/20 a:1/3/2 b:5/6/4', 'Resize: two values of X brought to two others (0 → 10, 2 → 20)');
  ok(rz({ sy: { mode: 'factor', k: 2, anchor: 'zero' }, mode: 'point', point: 'max', moveX: false, moveY: true, y0: 0 }) === 'x:0/1/2 a:-4/0/-2 b:-2/0/-4', 'Resize then move: the maximum of the resized curve brought to y = 0');
  ok(rz({ sx: { mode: 'points', pts: [0, 0, 1, 2] } }) === 'x:0/1/2 a:1/3/2 b:5/6/4' && tr({ sx: { mode: 'points', pts: [0, 0, 1, 2] } }).warnings.length === 2, 'Resize: two equal values: not resized, said');
  {
    const eImp = { ...tImp, data: { ...IMPORT_DEFAULTS, text: 'x;a;sa\n0;1;0.1\n1;3;0.2\n', textId: 'tr-err' } } as AppNode;
    const r = evaluateGraph([eImp, { id: 't', type: 'translate', position: { x: 0, y: 0 }, data: { ...TRANSLATE_DEFAULTS, roles: { sa: 'yerr' }, sy: { mode: 'factor', k: -2, anchor: 'zero' }, dy: 1 } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 't', targetHandle: 'data' }]).get('t')!;
    const sh = r.outputs.shifts?.t === 'dataset' ? r.outputs.shifts.v.columns.find((c) => c.name === 'Y factor')?.values[0] : NaN;
    ok(cols(r) === 'x:0/1 a:-1/-5 sa:0.2/0.4' && sh === -2 && (r.view.translate?.plots?.[0].y.join() ?? '') === '-1,-5', `Resize: the ±Y resized as its Y (× |−2|), a move leaving it; the factors in the shifts; the curve before and after for the graph (${cols(r)})`);
  }
}

{
  // the signal processing against scipy / numpy (scripts/fixtures/signal-ref.py → signal-ref.json)
  const R = JSON.parse(readFileSync(new URL('./fixtures/signal-ref.json', import.meta.url), 'utf8'));
  const S = Sg;
  const y: number[] = R.y;
  const worst: Record<string, number> = {};
  const cmp = (name: string, a: number[], b: number[]) => {
    let e = 0;
    a.forEach((v, i) => (e = Math.max(e, Math.abs(v - b[i]) / Math.max(1, Math.abs(b[i])))));
    if (a.length !== b.length) e = Infinity;
    worst[name] = e;
  };
  for (const m of ['reflect', 'nearest', 'mirror'] as const) {
    cmp(`avg ${m}`, S.movingAverage(y, 7, m), R.avg[m]);
    cmp(`gauss ${m}`, S.gaussianSmooth(y, 2.5, m), R.gauss[m]);
    cmp(`median ${m}`, S.medianFilter(y, 5, m), R.median[m]);
  }
  cmp('avg6', S.movingAverage(y, 6, 'reflect'), R.avg6);
  cmp('savgol interp', S.savgol(y, 11, 3, 'interp'), R.savgol.interp);
  cmp('savgol mirror', S.savgol(y, 11, 3, 'mirror'), R.savgol.mirror);
  cmp('savgol nearest', S.savgol(y, 11, 3, 'nearest'), R.savgol.nearest);
  cmp('lowess', S.lowess(R.lowess.x, R.lowess.y, 0.3, 3), R.lowess.fit);
  for (const m of [100, 97, 64]) {
    const [re, im] = S.fft(y.slice(0, m), new Array(m).fill(0));
    cmp(`fft${m} re`, re, R[`fft${m}`].re);
    cmp(`fft${m} im`, im, R[`fft${m}`].im);
  }
  const dx = R.x[1] - R.x[0];
  const sp = S.spectrum(y.slice(0, 100), dx, 'hann', 'mean', false);
  cmp('spec f', sp.f, R.spec.f);
  cmp('spec amp', sp.amp, R.spec.amp);
  cmp('lowpass', S.fftFilter(y, dx, 'low', 1.0, 0, 0, false), R.lowpass);
  cmp('bandstop', S.fftFilter(y, dx, 'stop', 0.6, 1.2, 3, false), R.bandstop);
  const I = R.interp;
  for (const m of ['spline', 'akima', 'pchip', 'linear'] as const) {
    const f = S.interpolator(I.x, I.y, m, m === 'linear' ? 'constant' : 'method');
    cmp(`interp ${m}`, I.q.map(f), I[m]);
  }
  cmp('conv', S.convolve(y, R.kernel, 'zero'), R.conv);
  cmp('wiener', S.wiener(S.convolve(R.pos, R.kernel, 'zero'), R.kernel, 1e-3), R.wiener);
  cmp('rl', S.richardsonLucy(R.blurred, R.kernel, 15), R.rl);
  const bad = Object.entries(worst).filter(([, e]) => !(e < 1e-8)).map(([k]) => k);
  ok(bad.length === 0, `signal: ${Object.keys(worst).length} results as scipy / numpy (${bad.join(', ')})`);
}

{
  // the Signal nodes on a dataset: Smooth, Interpolate (on the X of another curve), Normalize, FFT, Convolution
  const xs = Array.from({ length: 200 }, (_, i) => i * 0.05);
  const text = 'x;y\n' + xs.map((x) => `${x};${Math.sin(2 * Math.PI * 1.5 * x) + 0.5}`).join('\n');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'sg' } } as AppNode;
  const node = (type: string, data: object, extra: AppNode[] = [], edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[] = []) =>
    evaluateGraph([imp, ...extra, { id: 'n', type, position: { x: 0, y: 0 }, data } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'n', targetHandle: 'in' }, ...edges]).get('n')!;
  const cols = (r: ReturnType<typeof node>) => (r.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns : []);
  const sm = node('smooth', { ...SMOOTH_DEFAULTS, withResid: true });
  ok(cols(sm).map((c) => c.name).join() === 'x,y,y (smoothed),y − smoothed' && (sm.view.signal?.plots.length ?? 0) === 1, `Smooth: the data, the smoothed curve, the residual (${cols(sm).map((c) => c.name)})`);
  const it = node('interp', { ...INTERP_DEFAULTS, method: 'spline', grid: 'points', points: 11, from: 0, to: 1 });
  ok(cols(it)[0].values.length === 11 && near(cols(it)[1].values[2], Math.sin(2 * Math.PI * 1.5 * 0.2) + 0.5, 1e-3), 'Interpolate: 11 points between 0 and 1 (cubic spline)');
  const nm = node('normalize', { ...NORMALIZE_DEFAULTS, method: 'minmax' });
  const nv = Array.from(cols(nm)[1].values);
  ok(near(Math.min(...nv), 0, 1e-12) && near(Math.max(...nv), 1, 1e-12) && nm.outputs.factors?.t === 'dataset', 'Normalize: range 0 … 1, the factors out');
  const ff = node('fft', { ...FFT_DEFAULTS, window: 'none' });
  const fc = cols(ff);
  const peak = Array.from(fc[1].values).reduce((b, v, i, a) => (v > a[b] ? i : b), 1);
  ok(fc[0].name === 'Frequency' && near(fc[0].values[peak], 1.5, 1e-9) && near(fc[1].values[peak], 1, 1e-6), `FFT: the peak at 1.5 with an amplitude 1 (${fc[0].values[peak]}, ${fc[1].values[peak]})`);
  const lp = node('fft', { ...FFT_DEFAULTS, mode: 'filter', filter: 'high', f1: 0.5 });
  ok(Math.abs(Array.from(cols(lp)[1].values).reduce((a, b) => a + b, 0) / 200) < 0.02, 'FFT filter: a high pass removes the offset');
  const cv = node('convolve', { ...CONV_DEFAULTS, op: 'conv', shape: 'box', fwhm: 0.05 * 3 });
  ok(near(cols(cv)[1].values[100], (Math.sin(2 * Math.PI * 1.5 * 4.95) + Math.sin(2 * Math.PI * 1.5 * 5) + Math.sin(2 * Math.PI * 1.5 * 5.05)) / 3 + 0.5, 1e-9), 'Convolution: a box of three points averages');
}

{
  // Data manipulation: points added by hand — in the order of X (the other columns interpolated), at the end, at the start
  const ds = { name: 'd', columns: [{ ...column('x', Float64Array.from([1, 2, 3, 4])), role: 'x' as const }, { ...column('y', Float64Array.from([10, 20, 30, 40])), role: 'y' as const }, column('z', Float64Array.from([100, 200, 300, 400]))] };
  const vals = (r: ReturnType<typeof applyManip>) => (typeof r === 'string' ? r : r.dataset.columns.map((c) => Array.from(c.values).map((v) => (Number.isNaN(v) ? '·' : v)).join('/')).join(' '));
  const sorted = applyManip(ds, 'x', 'y', [], [{ x: 2.5, y: 99 }, { x: 0, y: 5 }], 'sorted');
  ok(vals(sorted) === '0/1/2/2.5/3/4 5/10/20/99/30/40 ·/100/200/250/300/400', `Data manipulation: added in the order of X, the other column interpolated (${vals(sorted)})`);
  ok(vals(applyManip(ds, 'x', 'y', [], [{ x: 9, y: 1 }], 'end')) === '1/2/3/4/9 10/20/30/40/1 100/200/300/400/·' && vals(applyManip(ds, 'x', 'y', [], [{ x: 9, y: 1 }], 'start')) === '9/1/2/3/4 1/10/20/30/40 ·/100/200/300/400', 'Data manipulation: added at the end, at the start');
  const r = applyManip(ds, 'x', 'y', [{ kind: 'delete', rows: '2', n: 4 }], [{ x: 2.2, y: 7 }], 'sorted');
  ok(typeof r !== 'string' && r.nIn === 4 && r.state[4] === 8 && vals(r) === '1/2.2/3/4 10/7/30/40 100/220/300/400', `Data manipulation: a row deleted, a point added there (Z read between its neighbours) (${vals(r)})`);
}

{
  // Filter & sort rows: repeated X merged (averaged), sorted, one in every 2; a list of rows; text sorted naturally
  const ds = { name: 'd', columns: [{ ...column('x', Float64Array.from([3, 1, 2, 2, 5])), role: 'x' as const }, { ...column('y', Float64Array.from([30, 10, 20, 22, 50])), role: 'y' as const }, column('t', Float64Array.from([NaN, NaN, NaN, NaN, NaN]), ['a10', 'a2', 'a1', 'b', 'a3'])] };
  const vals = (r: ReturnType<typeof filterRows>) => (typeof r === 'string' ? r : r.dataset.columns.slice(0, 2).map((c) => Array.from(c.values).join('/')).join(' '));
  const m = filterRows(ds, { ...FILTER_DEFAULTS, dup: 'mean', sortBy: 'x' });
  ok(vals(m) === '1/2/3/5 10/21/30/50' && typeof m !== 'string' && m.report.startsWith('5 → 4 rows'), `Filter rows: repeated X averaged, sorted (${vals(m)})`);
  ok(vals(filterRows(ds, { ...FILTER_DEFAULTS, dup: 'first', sortBy: 'x', desc: true, every: 2 })) === '5/2 50/20', 'Filter rows: the first of the repeated, descending, one in every 2');
  ok(vals(filterRows(ds, { ...FILTER_DEFAULTS, rows: { mode: 'list', list: '2-4' } })) === '1/2/2 10/20/22', 'Filter rows: a list of rows');
  const t = filterRows(ds, { ...FILTER_DEFAULTS, sortBy: 't' });
  ok(typeof t !== 'string' && t.dataset.columns[2].text!.join(' ') === 'a1 a2 a3 a10 b', 'Filter rows: text sorted in its natural order');
  // sorted by several columns: X from the smallest, rows of the same X by Y from the largest; the first N kept
  ok(vals(filterRows(ds, { ...FILTER_DEFAULTS, sorts: [{ col: 'x', desc: false }, { col: 'y', desc: true }] })) === '1/2/2/3/5 10/22/20/30/50', 'Filter rows: sorted by X, then by Y (largest first)');
  const top = filterRows(ds, { ...FILTER_DEFAULTS, sortBy: 't', sorts: [{ col: 'x', desc: true }, { col: 'y', desc: true }], top: 3 });
  ok(vals(top) === '5/3/2 50/30/22' && typeof top !== 'string' && top.report === '5 → 3 rows: sorted by x (largest first), then y (largest first); the first 3 rows kept.', `Filter rows: the 3 largest by X then Y (the old one-column sort left aside) (${typeof top === 'string' ? top : top.report})`);
  ok(vals(filterRows(ds, { ...FILTER_DEFAULTS, sorts: [{ col: 'y', desc: false }], top: 2, topFrom: 'end' })) === '3/5 30/50', 'Filter rows: the last 2 rows kept (the 2 largest Y)');
  // repeated in two columns together: (x, g) equal → one row; x alone repeated but g different → both kept
  const two = { name: 'r', columns: [{ ...column('x', Float64Array.from([1, 1, 1, 2])), role: 'x' as const }, column('g', Float64Array.from([7, 7, 8, 7])), column('y', Float64Array.from([10, 20, 30, 40]))] };
  const rep = filterRows(two, { ...FILTER_DEFAULTS, dup: 'mean', dupCol: 'x, g' });
  ok(typeof rep !== 'string' && Array.from(rep.dataset.columns[2].values).join('/') === '15/30/40' && rep.report.includes('of x + g averaged'), `Filter rows: repeated in two columns together, averaged (${typeof rep === 'string' ? rep : rep.report})`);
  ok(sortKeysOf({ sortBy: 'x', desc: true }).length === 1 && sortKeysOf({ sortBy: 'x', desc: true, sorts: [] }).length === 0 && filterRows(ds, { ...FILTER_DEFAULTS, sorts: [{ col: 'nope', desc: false }] }) === 'No column “nope” to sort by.', 'Filter rows: an older project keeps its one sort column; an unknown column is said');
  // sort rules in turn: only some columns moved (by another column, each by its own values, reversed), the others in
  // place; whole rows reversed; the rules win over the older keys
  const col = (r: ReturnType<typeof filterRows>, j: number) => (typeof r === 'string' ? r : Array.from(r.dataset.columns[j].values).join('/'));
  const onlyY = filterRows(ds, { ...FILTER_DEFAULTS, sorts: [{ col: 'x', desc: false }], sortRules: [{ cols: 'y', how: 'by', keys: [{ col: 'x', desc: true }] }] });
  ok(col(onlyY, 0) === '3/1/2/2/5' && col(onlyY, 1) === '50/30/20/22/10' && typeof onlyY !== 'string' && onlyY.report.includes('y sorted by x (largest first)'), `Filter rows: only Y moved, by X (largest first); X in place; the rules win over the older keys (${col(onlyY, 1)})`);
  const own = filterRows(ds, { ...FILTER_DEFAULTS, sortRules: [{ cols: 'x', how: 'own', desc: true }, { cols: 'y', how: 'reverse' }] });
  ok(col(own, 0) === '5/3/2/2/1' && col(own, 1) === '50/22/20/10/30', `Filter rows: X sorted on its own (largest first), then Y alone reversed (${col(own, 0)} ${col(own, 1)})`);
  // reversed: the rows with data (an empty row at the end of a sheet stays at the end); the empty rows removed
  const tail = { name: 'w', columns: [{ ...column('x', Float64Array.from([0, 1, 2, 3, NaN])), role: 'x' as const }, column('y', Float64Array.from([5, 6, 7, NaN, NaN]))] };
  const revT = filterRows(tail, { ...FILTER_DEFAULTS, sortRules: [{ how: 'reverse' }] });
  ok(col(revT, 0) === '3/2/1/0/NaN' && col(revT, 1) === 'NaN/7/6/5/NaN', `Filter rows: whole rows reversed, the empty last row left last, a 0 kept (${col(revT, 0)})`);
  const revY = filterRows(tail, { ...FILTER_DEFAULTS, sortRules: [{ cols: 'y', how: 'reverse' }] });
  ok(col(revY, 0) === '0/1/2/3/NaN' && col(revY, 1) === '7/6/5/NaN/NaN', `Filter rows: one column reversed over its own values (${col(revY, 1)})`);
  const noEmpty = filterRows({ name: 'w', columns: [tail.columns[0], column('y', Float64Array.from([5, NaN, 7, NaN, NaN]))] }, { ...FILTER_DEFAULTS, empty: 'remove' });
  ok(col(noEmpty, 0) === '0/1/2/3' && typeof noEmpty !== 'string' && noEmpty.report.includes('1 empty row removed'), `Filter rows: the rows empty in every column removed, a row with one value kept (${col(noEmpty, 0)})`);
  const rev = filterRows(ds, { ...FILTER_DEFAULTS, sortRules: [{ how: 'reverse' }] });
  ok(col(rev, 0) === '5/2/2/1/3' && col(rev, 1) === '50/22/20/10/30' && typeof rev !== 'string' && rev.dataset.columns[2].text!.join(' ') === 'a3 b a1 a2 a10', 'Filter rows: whole rows reversed (the text with them)');
  ok(filterRows(ds, { ...FILTER_DEFAULTS, sortRules: [{ cols: 'nope', how: 'own' }] }) === 'Sort: no column “nope”.', 'Filter rows: a sort rule on a missing column said');
  // a workbook in: the sheet chosen (a dataset out), or every sheet (the same rules on each, a workbook out)
  const fw = (sheet?: string) =>
    evaluateGraph(
      [
        { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'a\n3\n1\n2\n' }, { name: 'S2', text: 'a\n9\n7\n8\n' }] } } as AppNode,
        { id: 'f', type: 'filterrows', position: { x: 0, y: 0 }, data: { ...FILTER_DEFAULTS, sortRules: [{ how: 'by', keys: [{ col: 'a', desc: false }] }], ...(sheet ? { sheet } : {}) } } as AppNode,
      ],
      [{ id: 'e', source: 'w', sourceHandle: 'book', target: 'f', targetHandle: 'in' }],
    ).get('f')!.outputs.out;
  const one = fw('S2');
  const every = fw('*');
  ok(one?.t === 'dataset' && Array.from(one.v.columns[0].values).join() === '7,8,9' && every?.t === 'workbook' && every.v.sheets.map((q) => `${q.name}:${Array.from(q.columns[0].values).join()}`).join(' ') === 'S1:1,2,3 S2:7,8,9', 'Filter rows: a workbook in — one sheet (a dataset), or every sheet sorted (a workbook)');
}

{
  // Clean data: missing values filled (lines, previous, next) or their rows removed; outliers by the median / quartiles
  const ds = (y: number[]) => ({ name: 'd', columns: [{ ...column('x', Float64Array.from(y, (_, i) => i + 1)), role: 'x' as const }, { ...column('y', Float64Array.from(y)), role: 'y' as const }] });
  const y = (r: ReturnType<typeof cleanData>) => (typeof r === 'string' ? r : Array.from(r.dataset.columns[1].values).map((v) => +v.toFixed(4)).join('/'));
  const holes = ds([1, NaN, 3, NaN, 5, 6]);
  const none = { ...CLEAN_DEFAULTS, outliers: 'none' as const };
  ok(y(cleanData(holes, { ...none, missing: 'linear' })) === '1/2/3/4/5/6' && y(cleanData(holes, { ...none, missing: 'previous' })) === '1/1/3/3/5/6' && y(cleanData(holes, { ...none, missing: 'next' })) === '1/3/3/5/5/6', 'Clean data: missing values filled (lines, previous, next)');
  const rm = cleanData(holes, { ...none, missing: 'remove' });
  ok(y(rm) === '1/3/5/6' && typeof rm !== 'string' && rm.dataset.columns[0].values.join() === '1,3,5,6', 'Clean data: the rows of missing values removed (every column)');
  const big = ds([1, 2, 3, 4, 100]);
  const mk = cleanData(big, { ...CLEAN_DEFAULTS });
  ok(typeof mk !== 'string' && mk.dataset.columns[1].mask?.join() === '0,0,0,0,1' && mk.changes.length === 1 && mk.changes[0].row === 5, 'Clean data: an outlier (3 scaled MAD) masked, one change');
  ok(y(cleanData(big, { ...CLEAN_DEFAULTS, action: 'clip' })) === `1/2/3/4/${+(3 + 3 * 1.4826).toFixed(4)}`, 'Clean data: an outlier clipped to median + 3·1.4826·MAD');
  ok(y(cleanData(big, { ...CLEAN_DEFAULTS, outliers: 'quartiles', k: 1.5, action: 'linear' })) === '1/2/3/4/4' && y(cleanData(big, { ...CLEAN_DEFAULTS, action: 'remove' })) === '1/2/3/4', 'Clean data: by the quartiles, replaced (straight lines); removed');
  // GESD on the NIST example (Rosner 1983, 54 values): 3 outliers, although R1 < λ1
  const nist = [-0.25, 0.68, 0.94, 1.15, 1.2, 1.26, 1.26, 1.34, 1.38, 1.43, 1.49, 1.49, 1.55, 1.56, 1.58, 1.65, 1.69, 1.7, 1.76, 1.77, 1.81, 1.91, 1.94, 1.96, 1.99, 2.06, 2.09, 2.1, 2.14, 2.15, 2.23, 2.24, 2.26, 2.35, 2.37, 2.4, 2.47, 2.54, 2.62, 2.64, 2.9, 2.92, 2.92, 2.93, 3.21, 3.26, 3.3, 3.59, 3.68, 4.3, 4.64, 5.34, 5.42, 6.01];
  const g = [...findOutliers(nist, 'gesd', 3, 0.05, 5).out].sort((a, b) => a - b);
  ok(g.join() === '51,52,53', `Clean data: GESD finds 3 outliers in the NIST example (${g})`);
  ok(findOutliers(nist, 'grubbs', 3, 0.05, 5).out.size === 0, 'Clean data: Grubbs repeated stops at the first test (R1 = 3.118 < 3.158)');
  // a moving median: a spike on a slope
  const slope = Array.from({ length: 30 }, (_, i) => i + (i === 15 ? 20 : 0) + 0.1 * Math.sin(i));
  ok([...findOutliers(slope, 'movmedian', 3, 0.05, 7).out].join() === '15', 'Clean data: a spike on a slope found by the moving median');
}

{
  // Curve math: intersections — sin and a line (3 crossings, alternating), a circle and a line (a loop), a touch, an overlap
  const C = (x: number[], y: number[], name = 'y') => ({ name, xName: 'x', x, y });
  const D = { ...CURVEMATH_DEFAULTS, op: 'cross' as const, crossing: 'all' as const };
  const xs = Array.from({ length: 401 }, (_, i) => 0.5 + (12 * i) / 400);
  const sin = C(xs, xs.map(Math.sin));
  const line = C([0, 13], [0, 0], 'zero');
  const cx = (r: ReturnType<typeof curveMath>, k: number) => (typeof r === 'string' ? [] : Array.from(r.dataset.columns[k].values));
  const all = curveMath(sin, line, D);
  ok(cx(all, 1).length === 3 && cx(all, 1).every((v, k) => near(v, (k + 1) * Math.PI, 1e-4)) && cx(all, 5).join() === '1,-1,1', `Intersections: sin and 0 — 3 crossings at π, 2π, 3π, B above, below, above (${cx(all, 1)})`);
  ok(near(cx(curveMath(sin, line, { ...D, crossing: 'first' }), 1)[0], Math.PI, 1e-4) && near(cx(curveMath(sin, line, { ...D, crossing: 'last' }), 1)[0], 3 * Math.PI, 1e-4) && cx(curveMath(sin, line, { ...D, from: 8, to: 5 }), 1).length === 1 && near(cx(curveMath(sin, line, { ...D, from: 8, to: 5 }), 1)[0], 2 * Math.PI, 1e-4), `Intersections: the first, the last, in a range of X (${cx(curveMath(sin, line, { ...D, crossing: 'first' }), 1)} ${cx(curveMath(sin, line, { ...D, crossing: 'last' }), 1)} ${cx(curveMath(sin, line, { ...D, from: 8, to: 5 }), 1)})`);
  const th = Array.from({ length: 361 }, (_, i) => (i * Math.PI) / 180);
  const loop = curveMath(C(th.map(Math.cos), th.map(Math.sin)), C([-2, 2], [0.5, 0.5]), D);
  ok(cx(loop, 1).length === 2 && near(cx(loop, 1)[0], Math.sqrt(0.75), 1e-4) && near(cx(loop, 1)[1], -Math.sqrt(0.75), 1e-4) && cx(loop, 5).every((v) => v !== 0), `Intersections: a circle and a line (a loop, X going back) — 2 crossings (${cx(loop, 1)})`);
  const par = C([-1, -0.5, 0, 0.5, 1], [1, 0.25, 0, 0.25, 1]);
  const t = curveMath(par, C([-1, 1], [0, 0]), D);
  ok(typeof t !== 'string' && cx(t, 1).join() === '0' && cx(t, 3).join() === '3' && cx(t, 4).join() === '1.5' && t.dataset.columns[6].text!.join() === 'touch' && cx(curveMath(par, C([-1, 1], [0, 0]), { ...D, touch: false }), 1).length === 0, 'Intersections: a touch (row 3 of A, 1.5 of B), left out when only crossings');
  const ov = curveMath(C([0, 1, 2, 3], [0, 1, 1, 0]), C([0, 1, 2, 3], [1, 1, 1, 2]), D);
  ok(typeof ov !== 'string' && ov.warnings.length === 1 && cx(ov, 1).join() === '1,2', `Intersections: an overlap warned, where the curves meet and part counted (${typeof ov === 'string' ? ov : cx(ov, 1)})`);
}

{
  // Average curves: three lines on different X (y = x, x + 1, x + 2) — mean x + 1, SD 1, SE 1/√3 where all three exist
  const ds = (name: string, x: number[], f: (x: number) => number) => ({ name, columns: [{ ...column('x', Float64Array.from(x)), role: 'x' as const }, { ...column('y', Float64Array.from(x, f)), role: 'y' as const }] });
  const r = (a: number, b: number, st: number) => Array.from({ length: Math.round((b - a) / st) + 1 }, (_, k) => a + k * st);
  const sets = [ds('A', r(0, 10, 1), (x) => x), ds('B', r(0.5, 10.5, 1), (x) => x + 1), ds('C', r(0, 9, 0.5), (x) => x + 2)];
  const out = averageNode(sets, AVERAGE_DEFAULTS);
  const col = (o: typeof out, name: string) => (typeof o === 'string' ? [] : Array.from(o.dataset.columns.find((c) => c.name === name)!.values));
  const X = col(out, 'x');
  ok(X[0] === 0.5 && X[X.length - 1] === 9 && X.length === 18 && col(out, 'mean').every((v, i) => near(v, X[i] + 1, 1e-12)) && col(out, 'SD').every((v) => near(v, 1, 1e-12)) && col(out, 'SE').every((v) => near(v, 1 / Math.sqrt(3), 1e-12)) && col(out, 'N').every((v) => v === 3), `Average curves: every X where all three exist, mean, SD, SE, N (${X.length} rows, ${X[0]}–${X[X.length - 1]})`);
  const k2 = averageNode(sets, { ...AVERAGE_DEFAULTS, need: 'k', k: 2, extra: true });
  const X2 = col(k2, 'x');
  ok(X2[0] === 0 && X2[X2.length - 1] === 10 && near(col(k2, 'mean')[X2.length - 1], 10.5, 1e-12) && col(k2, 'N')[X2.length - 1] === 2 && col(k2, 'median')[0] === 1 && col(k2, 'max')[X2.length - 1] === 11, 'Average curves: where at least 2 have a value (the ends with 2), min / max / median');
  const u = averageNode(sets, { ...AVERAGE_DEFAULTS, grid: 'uniform', points: 5 });
  ok(col(u, 'x').join() === '0.5,2.625,4.75,6.875,9' && typeof u !== 'string' && u.dataset.columns[2].role === 'yerr', 'Average curves: a uniform grid over the common range; SD designated ±Y');
  const loop = averageNode([ds('A', [0, 1, 2, 1, 0], (x) => x), sets[1]], AVERAGE_DEFAULTS);
  ok(typeof loop !== 'string' && loop.warnings.some((w) => w.includes('goes back')), 'Average curves: a curve whose X goes back is warned of');
}

{
  // Fit: York (errors on X and Y) on the Pearson–York data — a, b of York's iteration (Python), the errors as scipy ODR sd_beta (scaled by √(reduced χ²)), χ² = S
  const X = [0, 0.9, 1.8, 2.6, 3.3, 4.4, 5.2, 6.1, 6.5, 7.4];
  const Y = [5.9, 5.4, 4.4, 4.6, 3.5, 3.7, 2.8, 2.8, 2.4, 1.5];
  const wX = [1000, 1000, 500, 800, 200, 80, 60, 20, 1.8, 1];
  const wY = [1, 1.8, 4, 8, 20, 20, 70, 70, 100, 500];
  const text = 'x;y;ey;ex\n' + X.map((x, i) => `${x};${Y[i]};${1 / Math.sqrt(wY[i])};${1 / Math.sqrt(wX[i])}`).join('\n');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'york', edits: { cols: { 0: { role: 'x' }, 1: { role: 'y' }, 2: { role: 'yerr' }, 3: { role: 'xerr' } } } } } as AppNode;
  const fit = (data: Partial<FitNodeData>) => evaluateGraph([imp, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, ...data } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]).get('f')!;
  const r = fit({ model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'york' } });
  const p = r.view.fit?.runs[0];
  ok(!!p && near(p.params[0].value, 5.479910224032864, 1e-12) && near(p.params[1].value, -0.4805334074462021, 1e-12) && near(p.params[0].error, 0.35924658, 1e-6) && near(p.params[1].error, 0.07062028, 1e-6) && near(p.stats.chi2, 11.86635319, 1e-7), `Fit York: Pearson–York data: a, b as York 2004 (closed form), errors as scipy ODR (${p?.params.map((q) => `${q.value} ± ${q.error}`)}, χ² ${p?.stats.chi2})`);
  ok(!!fit({ model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'york' }, xerr: 'ey', yerr: 'ex' }).view.fit && (fit({ model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'york' }, weight: 'none' }).errors ?? []).length === 1, 'Fit York: ±X chosen; without weights an error');
}

{
  // Fit: compare models (a line, a parabola: nested) and the same parameters for two runs — scipy / numpy polyfit
  const xs = Array.from({ length: 12 }, (_, i) => i * 0.5);
  const e = xs.map((_, i) => 0.3 * Math.sin(7.3 * i));
  const y = xs.map((x, i) => 2 + 3 * x + 0.5 * x * x + e[i]);
  const y1 = xs.map((x, i) => 1 + 2 * x + e[i]);
  const y2 = xs.map((x, i) => 1.5 + 2 * x + 0.3 * Math.cos(5.1 * i));
  const text = 'x;y;y1;y2\n' + xs.map((x, i) => `${x};${y[i]};${y1[i]};${y2[i]}`).join('\n');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'cmp', edits: { cols: { 0: { role: 'x' } } } } } as AppNode;
  const fit = (data: Partial<FitNodeData>) => evaluateGraph([imp, { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ...data } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]).get('f')!;
  const lin = { ...FIT_DEFAULTS.model, kind: 'library' as const, model: 'linear' };
  const r = fit({ ys: ['y'], model: lin, compare2: true, model2: { ...lin, model: 'poly', degree: 2 } });
  const t = r.outputs.compare;
  const c = (name: string) => (t?.t === 'dataset' ? Array.from(t.v.columns.find((q) => q.name === name)!.values) : []);
  ok(near(c('χ²')[0], 20.695426707155974, 1e-8) && near(c('χ²')[1], 0.48014797060555575, 1e-8) && near(c('F')[1], 378.9196659510958, 1e-7) && near(c('p')[1], 1.1526472458347724e-8, 1e-6), `Fit compare models: χ², F, p as scipy (${c('F')[1]}, ${c('p')[1]})`);
  ok(near(c('AIC')[0], 12.54007312863358, 1e-8) && near(c('AICc')[1], -24.908525489066754, 1e-8) && near(c('BIC')[1], -28.68318460420047, 1e-8) && c('Akaike weight')[1] > 0.999 && (r.view.fit?.runs2?.length ?? 0) === 1, 'Fit compare models: AIC, AICc, BIC (K = parameters + 1), the weights, the second curve');
  const s = fit({ ys: ['y1', 'y2'], model: lin, sameTest: true });
  const ts = s.outputs.compare;
  const cs = (name: string) => (ts?.t === 'dataset' ? Array.from(ts.v.columns.find((q) => q.name === name)!.values) : []);
  ok(near(cs('χ²')[0], 2.7530760118572606, 1e-8) && near(cs('χ²')[1], 1.0553953709631458, 1e-8) && near(cs('F')[1], 16.08573135340573, 1e-7) && near(cs('p')[1], 6.854406025701696e-5, 1e-6) && !!s.view.fit?.compare?.[0].includes('they differ'), `Fit same parameters for two runs: one fit vs a fit each, F-test as scipy (${cs('F')[1]}, ${cs('p')[1]})`);
}

{
  // Import: a delimiter of one's own (several characters; \t a tab); a column name with a comma chosen whole
  const r = parseCsv('a::b\n1,5::2\n3::4', { ...CSV_DEFAULTS, delimiter: 'custom', custom: '::', decimal: ',' });
  ok(r.delimiter === '::' && r.dataset.columns.length === 2 && r.dataset.columns[0].values[0] === 1.5 && r.dataset.columns[1].values[1] === 4, 'Import: a custom delimiter (::)');
  const t = parseCsv('a#b\n1#2', { ...CSV_DEFAULTS, delimiter: 'custom', custom: '#' });
  ok(t.dataset.columns.length === 2 && t.dataset.columns[1].values[0] === 2 && parseCsv('a\tb\n1\t2', { ...CSV_DEFAULTS, delimiter: 'custom', custom: '\t' }).dataset.columns.length === 2, 'Import: a custom delimiter (#, \t written)');
  ok(pick('Reflectance, s (a.u.)', ['x', 'Reflectance, s (a.u.)', 'y'], true).found.join() === '1' && pick('x, y', ['x', 'Reflectance, s (a.u.)', 'y'], true).found.join() === '0,2', 'Columns: a name with a comma chosen whole; a list still a list');
}

{
  // Digitizer: the three calibrations recover a known map from the pixels to the data
  const D = (p: Partial<DigitizerData>): DigitizerData => ({ ...DIGITIZER_DEFAULTS, image: 'x', imageName: 'fig.png', w: 800, h: 600, ...p });
  // a turned (5°), sheared (axes 87° apart), scaled image: data → pixel
  const th = (5 * Math.PI) / 180;
  const sh = (3 * Math.PI) / 180;
  const T = (x: number, y: number): Px => ({ u: 100 + 60 * x * Math.cos(th) - 40 * y * Math.sin(th + sh), v: 500 - 60 * x * Math.sin(th) - 40 * y * Math.cos(th + sh) });
  const axes = [{ ...T(1, 0), val: 1 }, { ...T(9, 0), val: 9 }, { ...T(0, 2), val: 2 }, { ...T(0, 7), val: 7 }];
  const c1 = calibrate(D({ axes }));
  const test = [[3.3, 4.1], [7.7, 0.5], [0.2, 9.9]];
  ok(typeof c1 !== 'string' && test.every(([x, y]) => near(c1.toData(T(x, y)).x, x, 1e-9) && near(c1.toData(T(x, y)).y, y, 1e-9)), 'Digitizer: 2 points on each axis — a turned, sheared image read back exactly');
  // logarithmic X: the pixels follow log10 x
  const L = (x: number, y: number) => T(Math.log10(x), y);
  const c2 = calibrate(D({ axes: [{ ...L(1, 0), val: 1 }, { ...L(1000, 0), val: 1000 }, { ...L(1, 2), val: 2 }, { ...L(1, 7), val: 7 }], logX: true }));
  ok(typeof c2 !== 'string' && near(c2.toData(L(37, 3)).x, 37, 1e-9) && near(c2.toData(L(37, 3)).y, 3, 1e-9), 'Digitizer: a logarithmic X axis');
  ok(typeof calibrate(D({ axes: [axes[0], axes[1], { ...T(4, 0), val: 2 }, { ...T(6, 0), val: 7 }] })) === 'string', 'Digitizer: parallel axes refused');
  const noVal = calibrate(D({ axes: [axes[0], { ...axes[1], val: NaN }, axes[2], { ...axes[3], val: NaN }] }));
  ok(typeof noVal === 'string' && noVal.includes('X₂, Y₂'), `Digitizer: points placed without their values — said, not read as empty points (${noVal})`);
  // a page photographed at an angle: a projective map
  const P = (x: number, y: number): Px => {
    const w = 1 + 0.0004 * x * 60 - 0.0003 * y * 50;
    return { u: (120 + 60 * x + 8 * y) / w, v: (520 - 5 * x - 50 * y) / w };
  };
  const c3 = calibrate(D({ cal: 'corners', corners: [P(0, 0), P(10, 0), P(10, 8), P(0, 8)], xRange: [0, 10], yRange: [0, 8] }));
  ok(typeof c3 !== 'string' && test.every(([x, y]) => near(c3.toData(P(x, y * 0.8)).x, x, 1e-8) && near(c3.toData(P(x, y * 0.8)).y, y * 0.8, 1e-8)), 'Digitizer: the 4 corners — the perspective of a photographed page corrected');
  // a curved page / a lens: the pixels bent (barrel), reference points on a 6 × 5 grid
  const B = (x: number, y: number): Px => {
    const [a, b] = [(x - 5) / 5, (y - 4) / 4];
    const k = 1 + 0.1 * (a * a + b * b);
    return { u: 400 + 300 * a * k, v: 300 - 220 * b * k };
  };
  const grid = [];
  for (let x = 0; x <= 10; x += 2) for (let y = 0; y <= 8; y += 2) grid.push({ ...B(x, y), x, y });
  const inside = [[3, 3], [7, 5], [5, 4], [1, 7], [9, 1]];
  const err = (c: ReturnType<typeof calibrate>) => (typeof c === 'string' ? Infinity : Math.max(...inside.map(([x, y]) => Math.max(Math.abs(c.toData(B(x, y)).x - x) / 10, Math.abs(c.toData(B(x, y)).y - y) / 8))));
  const straight = calibrate(D({ axes: [{ ...B(0, 4), val: 0 }, { ...B(10, 4), val: 10 }, { ...B(5, 0), val: 0 }, { ...B(5, 8), val: 8 }] }));
  const tps = calibrate(D({ cal: 'grid', grid, gridFit: 'tps' }));
  const p3 = calibrate(D({ cal: 'grid', grid, gridFit: 'poly3' }));
  ok(err(tps) < err(straight) / 3 && err(p3) < err(straight) / 3 && err(tps) < 0.003, `Digitizer: a curved page — spline ${(100 * err(tps)).toFixed(3)} %, polynomial ${(100 * err(p3)).toFixed(3)} % of the range, straight axes ${(100 * err(straight)).toFixed(2)} %`);
  // a wrong value typed on one reference point: its error the largest
  const bad = calibrate(D({ cal: 'grid', grid: grid.map((g, k) => (k === 13 ? { ...g, x: g.x + 1 } : g)), gridFit: 'tps' }));
  const worst = typeof bad === 'string' ? -1 : bad.resid!.reduce((b, r, k, a) => (Math.abs(r.dx) > Math.abs(a[b].dx) ? k : b), 0);
  ok(worst === 13, 'Digitizer: a reference point typed wrong shows the largest error');
  ok(typeof calibrate(D({ cal: 'grid', grid: grid.slice(0, 5) })) === 'string', 'Digitizer: a curved page needs six points at least');
  // the dataset: two sets, error bars, in the order of X
  const ds = digitized(
    D({
      axes,
      xName: 'Wavelength (nm)',
      yName: 'Abs (a.u.)',
      sets: [
        { name: 'A', color: '#f00', points: [{ ...T(5, 3), hi: T(5.1, 4), lo: T(4.9, 2) }, T(2, 1)] },
        { name: 'B', color: '#00f', points: [T(4, 6)] },
      ],
    }),
  );
  const cols = typeof ds === 'string' ? [] : ds.dataset.columns;
  ok(cols.map((c) => `${c.name}:${c.role}`).join(' | ') === 'Wavelength (nm) (A):x | A (a.u.):y | ±A:yerr | Wavelength (nm) (B):x | B (a.u.):y' && near(cols[0].values[0], 2, 1e-9) && near(cols[1].values[1], 3, 1e-9) && Number.isNaN(cols[2].values[0]) && near(cols[2].values[1], 1, 1e-9), 'Digitizer: the dataset — a set each (X, Y, ±Y from the bar), in the order of X');
}

{
  // Digitizer: points found by their colour on a drawn image — a red curve 3 px thick, blue square markers
  const [w, h] = [300, 120];
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const paint = (u: number, v: number, c: number[]) => {
    if (u < 0 || v < 0 || u >= w || v >= h) return;
    data.set([...c, 255], 4 * (v * w + u));
  };
  const curve = (u: number) => 60 + 30 * Math.sin(u / 25);
  for (let u = 0; u < w; u++) for (let dv = -1; dv <= 1; dv++) paint(u, Math.round(curve(u)) + dv, [220, 30, 30]);
  const marks = [[40, 20], [120, 100], [210, 15], [280, 90]];
  for (const [u, v] of marks) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) paint(u + a, v + b, [30, 30, 220]);
  const img = { data, w, h };
  const A = { ...DIGITIZER_DEFAULTS.auto, color: [220, 30, 30] as [number, number, number], step: 10 };
  const line = autoPoints(img, A);
  ok(line.length === 30 && line.every((p) => Math.abs(p.v - 0.5 - Math.round(curve(Math.floor(p.u - 0.5)))) < 1.5), `Digitizer: a curve found by its colour, a point every 10 px (${line.length} points)`);
  const mk = autoPoints(img, { ...A, mode: 'markers', color: [30, 30, 220] });
  ok(mk.length === 4 && mk.every((p, k) => p.u - 0.5 === marks[k][0] && p.v - 0.5 === marks[k][1]), 'Digitizer: markers found, their centres exact');
  const area = autoPoints(img, { ...A, area: [{ u: 0, v: 0 }, { u: 150, v: 0 }, { u: 150, v: h }, { u: 0, v: h }], exclude: [[{ u: 0, v: 0 }, { u: 50, v: 0 }, { u: 50, v: h }, { u: 0, v: h }]] });
  ok(area.length > 0 && area.every((p) => p.u > 50 && p.u < 151), 'Digitizer: only in the area, not in the part left out');
}

{
  // Histogram against numpy / scipy / sklearn (scripts/fixtures/hist-ref.py → hist-ref.json)
  const R = JSON.parse(readFileSync(new URL('./fixtures/hist-ref.json', import.meta.url), 'utf8'));
  const A: number[] = R.A;
  const B: number[] = R.B;
  const C: number[] = R.C;
  const bins = HISTOGRAM_DEFAULTS.bins;
  const same = (a: number[] | string, b: number[], tol: number) => typeof a !== 'string' && a.length === b.length && a.every((v, i) => near(v, b[i], tol));
  for (const m of ['auto', 'sturges', 'scott', 'fd', 'sqrt', 'rice'] as const) ok(same(binEdges(A, { ...bins, mode: m }), R.edges[m], 1e-12), `Histogram bins: ${m} as numpy (${R.edges[m].length - 1} bins)`);
  const e10 = binEdges(A, { ...bins, mode: 'count', count: 10 }) as number[];
  ok(same(e10, R.edges10, 1e-12) && same(histCounts(A, e10), R.counts10, 0), 'Histogram: 10 bins, their counts as numpy (the last bin closed)');
  const h = (spec: object, v: number[] = A) => histogram([{ name: 'A', values: v }], { ...HISTOGRAM_DEFAULTS, ...spec }, 'x');
  const dens = h({ bins: { ...bins, mode: 'count', count: 10 }, norm: 'density' });
  ok(typeof dens !== 'string' && same(Array.from(dens.curves[0].series.y.values), R.density10, 1e-12), 'Histogram: density as numpy (density=True)');
  ok(same(histCounts(A, binEdges(A, { ...bins, mode: 'count', count: 8, from: 3, to: 7 }) as number[]), R.countsRange, 0) && same(histCounts(A, binEdges(A, { ...bins, mode: 'edges', edges: '0, 3, 4, 4.5, 5, 6, 10' }) as number[]), R.countsEdges, 0), 'Histogram: a range, edges written (counts as numpy)');
  const cum = h({ bins: { ...bins, mode: 'count', count: 10 }, norm: 'probability', cumulative: true });
  ok(typeof cum !== 'string' && near(cum.curves[0].series.y.values[9], 1, 1e-12) && near(cum.curves[0].series.y.values[0], R.counts10[0] / 300, 1e-12), 'Histogram: cumulative probability ends at 1');
  // Normal from the data: mean, SD (n − 1), their errors, χ² over the 10 bins, dof, p
  const nf = normalFit(A);
  const nh = h({ bins: { ...bins, mode: 'count', count: 10 }, fits: [{ kind: 'normal', method: 'data' }] });
  const f0 = typeof nh === 'string' ? null : nh.fits[0];
  ok(near(nf.mu, R.normal.mu, 1e-12) && near(nf.sd, R.normal.sd, 1e-12) && near(nf.seMu, R.normal.seMu, 1e-12) && near(nf.seSd, R.normal.seSd, 1e-12) && !!f0 && near(f0.chi2, R.normal.chi2, 1e-9) && f0.dof === R.normal.dof && near(f0.p, R.normal.p, 1e-7), `Histogram fit Normal from the data: μ, σ, errors, χ² ${f0?.chi2.toFixed(4)}, p ${f0?.p.toFixed(4)} as scipy`);
  // a Gaussian fitted to the bars (20 bins, counts): as curve_fit
  const gh = h({ bins: { ...bins, mode: 'count', count: 20 }, fits: [{ kind: 'normal', method: 'bars' }] });
  const gp = typeof gh === 'string' ? [] : gh.fits[0].params;
  const par = (ps: typeof gp, nm: string) => ps.find((q) => q.name === nm)!;
  ok(gp.length > 0 && near(par(gp, 'xc').value, R.gaussBars.xc, 1e-6) && near(par(gp, 'σ').value, R.gaussBars.s, 1e-6) && near(par(gp, 'height').value, R.gaussBars.A, 1e-6) && near(par(gp, 'xc').error, R.gaussBars.exc, 1e-4) && near(par(gp, 'σ').error, R.gaussBars.es, 1e-4) && near(par(gp, 'height').error, R.gaussBars.eA, 1e-4), `Histogram fit Gaussian to the bars: xc, σ, height and errors as curve_fit (${par(gp, 'xc')?.value})`);
  // two normals from the data (maximum likelihood): as sklearn's GaussianMixture
  const mx = mixtureFit(B);
  ok(near(mx.w1, R.binormal.w[0], 1e-5) && near(mx.m1, R.binormal.mu[0], 1e-5) && near(mx.m2, R.binormal.mu[1], 1e-5) && near(mx.s1, R.binormal.sd[0], 1e-5) && near(mx.s2, R.binormal.sd[1], 1e-5) && near(mx.loglik, R.binormal.loglik, 1e-8), `Histogram fit two normals from the data: w, μ, σ, log L as sklearn (${mx.m1.toFixed(5)}, ${mx.m2.toFixed(5)})`);
  // two Gaussians fitted to the bars (30 bins): as curve_fit
  const bh = h({ bins: { ...bins, mode: 'count', count: 30 }, fits: [{ kind: 'binormal', method: 'bars' }] }, B);
  const bp = typeof bh === 'string' ? [] : bh.fits[0].params;
  const want = R.binormalBars.p;
  ok(bp.length > 0 && near(par(bp, 'height1').value, want[0], 1e-5) && near(par(bp, 'xc1').value, want[1], 1e-5) && near(par(bp, 'σ1').value, Math.abs(want[2]), 1e-5) && near(par(bp, 'height2').value, want[3], 1e-5) && near(par(bp, 'xc2').value, want[4], 1e-5) && near(par(bp, 'σ2').value, Math.abs(want[5]), 1e-5) && near(par(bp, 'xc2').error, R.binormalBars.e[4], 1e-3), 'Histogram fit two Gaussians to the bars: as curve_fit');
  // Lorentz: Cauchy by maximum likelihood (scipy cauchy.fit), and a Lorentzian fitted to the bars (curve_fit)
  const cf = cauchyFit(C);
  ok(near(cf.x0, R.cauchy.x0, 1e-4) && near(cf.g, R.cauchy.g, 1e-4), `Histogram fit Cauchy from the data: x0 ${cf.x0.toFixed(5)}, γ ${cf.g.toFixed(5)} as scipy`);
  const lh = h({ bins: { ...bins, mode: 'count', count: 40, from: 5, to: 15 }, fits: [{ kind: 'lorentz', method: 'bars' }] }, C);
  const lp = typeof lh === 'string' ? [] : lh.fits[0].params;
  ok(lp.length > 0 && near(par(lp, 'height').value, R.lorentzBars.p[0], 1e-5) && near(par(lp, 'xc').value, R.lorentzBars.p[1], 1e-5) && near(par(lp, 'γ (HWHM)').value, R.lorentzBars.p[2], 1e-5) && near(par(lp, 'xc').error, R.lorentzBars.e[1], 1e-3), 'Histogram fit Lorentzian to the bars: as curve_fit');
  // a Gaussian kernel density: Scott, Silverman (scipy gaussian_kde)
  const ks = kde(A, kdeWidth(A, 'scott'));
  const kv = kde(A, kdeWidth(A, 'silverman'));
  ok(R.kde.x.every((x: number, i: number) => near(ks(x), R.kde.scott[i], 1e-12) && near(kv(x), R.kde.silverman[i], 1e-12)), 'Histogram kernel density: Scott and Silverman as scipy');
  // the bars: stacked on each other, side by side in the bin
  const two = histogram([{ name: 'A', values: A }, { name: 'B', values: B }], { ...HISTOGRAM_DEFAULTS, multi: 'stack', bins: { ...bins, mode: 'count', count: 10 } }, 'x');
  ok(typeof two !== 'string' && two.curves[1].bars!.base[3] === two.curves[0].series.y.values[3] && near(two.curves[1].series.y.values[3] - two.curves[1].bars!.base[3], histCounts(B, two.edges)[3], 0), 'Histogram: two columns stacked, one set of bins');
}

{
  // Plot: a curve's own dataset (its data port) — its X and Y chosen from that dataset's columns, else its designations
  const text = 'a;b;c\n1;10;100\n2;20;200\n3;30;300\n';
  const imp = { id: 'oi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'oi', edits: { cols: { 0: { role: 'x' }, 1: { role: 'y' } } } } } as AppNode;
  const run = (cols?: object) => {
    const g = evaluateGraph([imp, { id: 'op', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), ...(cols ? { cols } : {}) } } as AppNode], [{ id: '1', source: 'oi', sourceHandle: 'out', target: 'op', targetHandle: rowHandle('series', 0) }]).get('op')!;
    return g.view.curves?.[0];
  };
  const des = run();
  const chosen = run({ x: 'b', y: 'c' });
  ok(des?.series.y.name === 'b' && des?.series.x.name === 'a' && chosen?.series.y.name === 'c' && chosen?.series.x.name === 'b' && chosen.series.y.values[2] === 300, 'Plot: on a curve’s data port, X and Y chosen from its dataset (else its designations)');
}

{
  // Bar chart against numpy / scipy / matplotlib (scripts/fixtures/bar-ref.py → bar-ref.json)
  const R = JSON.parse(readFileSync(new URL('./fixtures/bar-ref.json', import.meta.url), 'utf8'));
  const txt = (name: string, v: string[]) => column(name, Float64Array.from(v, () => NaN), v);
  const values = column('value', Float64Array.from(R.value as number[]));
  const groups = txt('group', R.group);
  const subs = txt('sub', R.sub);
  // every statistic and its error, per group and subgroup
  const errsOk = (['sd', 'se', 'ci95', 'minmax', 'q1q3'] as const).every((err) =>
    (['mean', 'median', 'sum', 'count'] as const).every((stat) => {
      const tb = rawTable(values, groups, subs, stat, err, 'value');
      return tb.categories.every((c, i) =>
        tb.series.every((s) => {
          const ref = R.stats[`${c.label}|${s.name}`];
          const v = stat === 'count' ? ref.n : ref[stat];
          const [lo, hi] = err === 'minmax' ? [ref.min, ref.max] : err === 'q1q3' ? [ref.q1, ref.q3] : [v - ref[err], v + ref[err]];
          return near(s.values[i], v, 1e-12) && near(s.values[i] - s.minus[i], lo, 1e-10) && near(s.values[i] + s.plus[i], hi, 1e-10) && s.n![i] === ref.n;
        }),
      );
    }),
  );
  const tb = rawTable(values, groups, subs, 'mean', 'ci95', 'value');
  ok(errsOk && tb.categories.map((c) => c.label).join() === 'control,drug A,drug B' && tb.series.map((s) => s.name).join() === 'day 1,day 7', 'Bar chart, raw values: mean / median / sum / count with SD, SE, 95 % CI (t), min – max, Q1 – Q3 as numpy / scipy');
  // the rectangles as matplotlib bar / barh: grouped (centred), stacked (negatives down), 100 %, horizontal
  const B = R.bars;
  const cat = column('x', Float64Array.from([1, 2, 3, 4]));
  const wide = wideTable(cat, [column('A', Float64Array.from(B.A)), column('B', Float64Array.from(B.B)), column('C', Float64Array.from(B.C))], [undefined, undefined, undefined]);
  const rectsOf = (arrange: string, horizontal = false) => {
    const r = barChart(wide, { ...BARCHART_DEFAULTS, arrange: arrange as never, horizontal });
    if (typeof r === 'string') return [];
    return r.curves.filter((c) => c.bars && c.key.startsWith('bar:')).map((c) => {
      const b = c.bars!;
      const v = horizontal ? c.series.x.values : c.series.y.values;
      // as matplotlib: [x, y, width, height] — vertical: across x, from the base; horizontal: from the base along x
      return Array.from(v, (top, i) => (horizontal ? [b.base[i], b.lo[i], top - b.base[i], b.hi[i] - b.lo[i]] : [b.lo[i], b.base[i], b.hi[i] - b.lo[i], top - b.base[i]]));
    });
  };
  const sameRects = (a: number[][][], b: number[][][]) => a.length === b.length && a.every((s, j) => s.every((r, i) => r.every((v, q) => near(v, b[j][i][q], 1e-12))));
  ok(sameRects(rectsOf('grouped'), B.grouped), 'Bar chart: grouped bars as matplotlib bar (centred offsets, width 0.8 / 3)');
  ok(sameRects(rectsOf('stacked'), B.stacked), 'Bar chart: stacked — the positive values up, the negative ones down');
  ok(sameRects(rectsOf('percent'), B.percent), 'Bar chart: 100 % stacked of the absolute totals');
  ok(sameRects(rectsOf('grouped', true), B.barh), 'Bar chart: horizontal bars as matplotlib barh');
  // the values written: decimals, hidden below a %; a floating bar from one column to the next
  const lab = barChart(wide, { ...BARCHART_DEFAULTS, arrange: 'stacked', labels: 'center', decimals: 1, hideBelow: 20 });
  const txts = typeof lab === 'string' ? [] : lab.curves[2].bars!.labels!.text;
  ok(txts.join('|') === '||25.0|-33.3'.replace('25.0', '2.0').replace('-33.3', '-2.0'), `Bar chart: values written with 1 decimal, those under 20 % of the total hidden (${txts.join('|')})`);
  const fl = barChart(wideTable(cat, [column('min', Float64Array.from([1, 2, 3, 4])), column('max', Float64Array.from([5, 4, 9, 6]))], [undefined, undefined]), { ...BARCHART_DEFAULTS, arrange: 'floating' });
  ok(typeof fl !== 'string' && fl.curves[0].bars!.base[2] === 3 && fl.curves[0].series.y.values[2] === 9, 'Bar chart: a floating bar from the first column to the next');
}

{
  // Box & violin against matplotlib (scripts/fixtures/box-ref.py → box-ref.json): boxplot_stats, violin_stats + gaussian_kde
  const R = JSON.parse(readFileSync(new URL('./fixtures/box-ref.json', import.meta.url), 'utf8'));
  for (const name of Object.keys(R.data)) {
    const x: number[] = R.data[name];
    const okBox = (['iqr', 'p5', 'p10', 'minmax'] as const).every((w) => {
      const s = boxStats(x, w);
      const m = R.box[name][w];
      return near(s.q1, m.q1, 1e-12) && near(s.med, m.med, 1e-12) && near(s.q3, m.q3, 1e-12) && near(s.wlo, m.whislo, 1e-12) && near(s.whi, m.whishi, 1e-12) && near(s.mean, m.mean, 1e-12) && near(s.cilo, m.cilo, 1e-12) && near(s.cihi, m.cihi, 1e-12) && s.outliers.length === m.fliers.length && s.outliers.every((v, i) => near(v, m.fliers[i], 1e-12));
    });
    ok(okBox, `Box (${name}): quartiles, whiskers (1.5·IQR, 5–95, 10–90, min–max), notch, mean, outliers as matplotlib`);
    const okViolin = (['scott', 'silverman'] as const).every((bw) => {
      const v = violinStats(x, bw, NaN, 'data');
      const m = R.violin[name][bw];
      return v.coords.every((c, i) => near(c, m.coords[i], 1e-12)) && v.vals.every((c, i) => near(c, m.vals[i], 1e-10));
    });
    ok(okViolin, `Violin (${name}): 100 points from min to max, the density as gaussian_kde (Scott, Silverman)`);
  }
  // the groups of raw values, the violins scaled alike (width) or by one scale (area); split halves
  const vals = column('v', Float64Array.from([1, 2, 3, 4, 5, 2, 3, 4, 9, 10, 11, 12, 13, 10, 11]));
  const grp = column('g', Float64Array.from(vals.values, () => NaN), ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'b', 'b']);
  const sub = column('s', Float64Array.from(vals.values, () => NaN), ['p', 'q', 'p', 'q', 'p', 'q', 'p', 'q', 'p', 'q', 'p', 'q', 'p', 'q', 'p']);
  const d = { ...BOXVIOLIN_DEFAULTS, mode: 'raw' as const, kind: 'violin' as const };
  const g = boxGroups(d, [], vals, grp, sub);
  const wide = boxViolin(g.cats, g.series, g.groups, d);
  const items = typeof wide === 'string' ? [] : wide.curves.flatMap((c) => c.boxes?.items ?? []);
  ok(g.cats.join() === 'a,b' && g.series.join() === 'p,q' && items.length === 4 && items.every((it) => near(Math.max(...it.violin!.w), it.half, 1e-12)), 'Violins: groups and subgroups of raw values, every violin as wide');
  const area = boxViolin(g.cats, g.series, g.groups, { ...d, scale: 'area' });
  const ai = typeof area === 'string' ? [] : area.curves.flatMap((c) => c.boxes?.items ?? []);
  ok(near(Math.max(...ai.map((it) => Math.max(...it.violin!.w))), ai[0].half, 1e-12) && ai.some((it) => Math.max(...it.violin!.w) < it.half - 1e-9), 'Violins: one scale for all (the widest at full width)');
  const sp = boxViolin(g.cats, g.series, g.groups, { ...d, split: true });
  const si = typeof sp === 'string' ? [] : sp.curves.flatMap((c) => c.boxes?.items ?? []);
  ok(si.length === 4 && si[0].pos === si[2].pos && si[0].side === 'low' && si[2].side === 'high', 'Violins: split — two subgroups, a half each at the same place');
  // a gradient on one group only: its second colour, the others plain (and in the legend)
  const three = boxViolin(['a', 'b', 'c'], ['v'], ['a', 'b', 'c'].map((c, i) => ({ cat: c, series: 'v', values: [1, 2, 3, 4].map((x) => x + i) })), { ...BOXVIOLIN_DEFAULTS, colorBy: 'category', colors: ['#000000', '#111111', '#222222'], colors2: ['', '#ffffff', ''] });
  const its = typeof three === 'string' ? [] : three.curves[0].boxes!.items;
  const leg = typeof three === 'string' ? [] : three.curves.filter((c) => c.key.startsWith('cat:')).map((c) => c.bars?.colors2?.[0] ?? '?');
  ok(its.length === 3 && its[1].fill === '#111111' && its[1].fill2 === '#ffffff' && !its[0].fill2 && !its[2].fill2 && leg.join() === ',#ffffff,', 'Box: a gradient on one group, the others plain');
}

{
  // Probability plot against scipy (scripts/fixtures/prob-ref.py → prob-ref.json): maximum-likelihood fits, probplot
  // (Filliben positions: quantiles, least squares, r), anderson, ecdf with its band, the Q-Q band of car::qqPlot
  const R = JSON.parse(readFileSync(new URL('./fixtures/prob-ref.json', import.meta.url), 'utf8'));
  const dists = Object.keys(R.fits) as ProbDist[];
  for (const k of dists) {
    const p = fitDist(k, R.data[k]);
    ok(p.length === R.fits[k].length && p.every((v, i) => near(v, R.fits[k][i], 2e-6)), `Probability plot: ${k} fitted by maximum likelihood as scipy (${p.map((v) => v.toPrecision(7)).join(', ')})`);
  }
  for (const k of dists) {
    const r = probPlot([{ name: k, values: R.data[k] }], { ...PROBPLOT_DEFAULTS, dist: k, positions: 'filliben', line: 'lsq' }, 'v');
    const ref = R.probplot[k];
    const pts = typeof r === 'string' ? null : r.curves[0].series;
    const row = typeof r === 'string' ? null : r.rows[0];
    ok(!!pts && !!row && Array.from(pts.x.values).every((v, i) => near(v, ref.osm[i], 1e-6)) && Array.from(pts.y.values).every((v, i) => near(v, ref.osr[i], 1e-12)) && near(row.slope, ref.slope, 1e-5) && near(row.intercept, ref.intercept, 1e-5) && near(row.r, ref.r, 1e-7), `Q-Q (${k}): the quantiles, slope, intercept and r of scipy probplot`);
  }
  for (const k of Object.keys(R.anderson) as ProbDist[]) {
    const r = probPlot([{ name: k, values: R.data[k] }], { ...PROBPLOT_DEFAULTS, dist: k }, 'v');
    const row = typeof r === 'string' ? null : r.rows[0];
    ok(!!row && near(row.a2, R.anderson[k].A2, 1e-5) && (k === 'normal' ? row.p > 0 && row.p < 1 : Math.abs(row.crit5 - R.anderson[k].crit5) < 6e-4), `Anderson–Darling (${k}): A² ${row?.a2.toFixed(5)} as scipy anderson${k === 'normal' ? '' : ', the 5 % critical value'}`);
  }
  ok(R.gammaPpf.every(([a, p, q]: number[]) => near(makeDist('gamma', [a, 1]).std.ppf(p), q, 1e-9)), 'Gamma quantiles as scipy gamma.ppf (shape 0.3 – 40, p 1e-4 – 0.9999)');
  // ECDF with ties, its pointwise 95 % band (scipy ecdf); DKW
  const e = probPlot([{ name: 't', values: R.ties }], { ...PROBPLOT_DEFAULTS, kind: 'ecdf', line: 'none', band: 'pointwise' }, 'v');
  const ec = typeof e === 'string' ? [] : e.curves;
  const inner = (c: Curve) => Array.from(c.series.y.values).slice(1, -1);
  ok(ec.length === 3 && Array.from(ec[0].series.x.values).slice(1, -1).every((v, i) => v === R.ecdf.x[i]) && inner(ec[0]).every((v, i) => near(v, R.ecdf.F[i], 1e-12)) && inner(ec[1]).every((v, i) => near(v, R.ecdf.hi[i], 1e-9)) && inner(ec[2]).every((v, i) => near(v, R.ecdf.lo[i], 1e-9)), 'ECDF with ties and its pointwise band as scipy ecdf');
  const dkw = probPlot([{ name: 't', values: R.ties }], { ...PROBPLOT_DEFAULTS, kind: 'ecdf', line: 'none', band: 'dkw', complementary: true, ecdfY: 'count' }, 'v');
  const dc = typeof dkw === 'string' ? [] : dkw.curves;
  const eps = Math.sqrt(Math.log(2 / 0.05) / (2 * 18));
  ok(dc.length === 3 && dc[0].series.y.values[0] === 18 && dc[0].series.y.values[dc[0].series.y.values.length - 1] === 0 && near(dc[1].series.y.values[0], 18 * (1 - eps), 1e-12) && dc[2].series.y.values[0] === 18, 'ECDF: 1 − F as a count, the DKW band');
  // the Q-Q band of car::qqPlot (Blom, least squares), on the same grid
  const b = probPlot([{ name: 'n', values: R.data.normal }], { ...PROBPLOT_DEFAULTS, positions: 'blom', line: 'lsq', band: 'pointwise' }, 'v');
  const bc = typeof b === 'string' ? [] : b.curves;
  const same = (c: Curve | undefined, ys: number[]) => !!c && Array.from(c.series.x.values).every((v, i) => near(v, R.band.z[i], 1e-8)) && Array.from(c.series.y.values).every((v, i) => near(v, ys[i], 1e-7));
  ok(bc.length === 4 && same(bc[1], R.band.line) && same(bc[2], R.band.hi) && same(bc[3], R.band.lo), 'Q-Q: the line and the pointwise 95 % band of car::qqPlot');
  // positions
  const bl = plotPositions(4, 'blom');
  ok(near(bl[0], 0.625 / 4.25) && near(plotPositions(4, 'hazen')[3], 0.875) && near(plotPositions(4, 'vdw')[1], 0.4) && near(plotPositions(4, 'benard')[0], 0.7 / 4.4), 'Plotting positions: Blom, Hazen, Van der Waerden, Benard');
  // a probability axis: a normal CDF is straight; ticks in %
  const sp = { ...AXIS_DEFAULTS, scale: 'probability' as const };
  const sc = makeScale(sp, 1, 99, 0, 100);
  const xs = [10, 50, 90].map(sc.f);
  ok(near(xs[1], 50, 1e-9) && near(xs[0] + xs[2], 100, 1e-9) && near(sc.inv(sc.f(2.5)), 2.5, 1e-9) && axisRange(sp, 0.7, 99.6).join() === '0.1,99.9' && axisRange(sp, 2, 98).join() === '1,99' && ticks(sp, 0.5, 99.9, 6).labels!.includes('50'), 'Probability axis: placed by Φ⁻¹, symmetric, out to the next tick, ticks in %');
  const lin = probPlot([{ name: 'w', values: R.data.weibull }], { ...PROBPLOT_DEFAULTS, kind: 'prob', dist: 'weibull', line: 'dist' }, 'v');
  ok(typeof lin !== 'string' && lin.axis.prob === 'sev' && lin.axis.logData && near(lin.curves[1].series.y.values[0], 100 * makeDist('weibull', R.fits.weibull).cdf(lin.curves[1].series.x.values[0]), 1e-9), 'Probability (Weibull): the probability axis ln(−ln(1 − p)), the data on a log axis, the fitted CDF');
  // the node in a graph: raw values by group, Probability (Lognormal): a probability axis, the data on a log axis
  const text = 'v;g\n' + [1.2, 2.5, 3.1, 4.8, 2.2, 6.0, 2.4, 5.1, 6.6, 9.8, 4.3, 12.5].map((v, i) => `${v};${i < 6 ? 'a' : 'b'}`).join('\n');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'pp' } } as AppNode;
  const pn = { id: 'n', type: 'probplot', position: { x: 0, y: 0 }, data: { ...PROBPLOT_DEFAULTS, mode: 'raw', kind: 'prob', dist: 'lognormal', line: 'dist', band: 'pointwise' } } as AppNode;
  const res = evaluateGraph([imp, pn], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'n', targetHandle: 'dataset' }]).get('n')!;
  const ax = res.view.figure?.axes[0]?.style;
  const st = res.outputs.stats?.t === 'dataset' ? res.outputs.stats.v : null;
  ok(ax?.y.scale === 'probability' && ax.y.prob === 'normal' && ax.x.scale === 'log' && st?.columns[0].text?.join() === 'a,b' && (res.view.legendCurves ?? []).length === 2 && !res.errors?.length, 'Probability plot node: raw values by group, a normal probability axis, the data on a log axis, a row per group');
  const given = probPlot([{ name: 'a', values: [1, 2, 3] }], { ...PROBPLOT_DEFAULTS, params: 'given', p1: 0, p2: -1 }, 'v');
  ok(typeof given === 'string', 'Probability plot: given parameters that cannot be (σ ≤ 0) are refused');
}

{
  // every element of a chart with a look of its own (⚙ beside its colour); the rest as the node's
  const two = [{ name: 'A', values: [1.1, 2.3, 2.9, 4.2, 5.0, 6.1, 7.4] }, { name: 'B', values: [2, 3.5, 4.1, 5.2, 6.8, 7.7, 9.9] }];
  const pr = probPlot(two, { ...PROBPLOT_DEFAULTS, band: 'pointwise', looks: [{ symbol: 'square', line: { color: '#ff0000', dash: 'dash' } }, { line: { width: 3 }, band: { show: false } }] }, 'v');
  const pc = typeof pr === 'string' ? [] : pr.curves;
  const by = (k: string) => pc.find((c) => c.key === k);
  ok(by('pp:0')?.style.symbol === 'square' && by('pp:0:line')?.style.color === '#ff0000' && by('pp:0:line')?.style.dash === 'dash' && by('pp:0:bandhi')?.style.color === '#ff0000' && by('pp:1')?.style.symbol === 'circle' && by('pp:1:line')?.style.lineWidth === 3 && !by('pp:1:bandhi'), 'Probability plot: every group its own symbols, line and band');
  const hs = histogram([{ name: 'A', values: [1, 2, 2, 3, 3, 3, 4, 4, 5] }, { name: 'B', values: [2, 3, 3, 4, 4, 4, 5, 5, 6] }], { ...HISTOGRAM_DEFAULTS, fits: [{ kind: 'normal', method: 'data', color: '#000000' }], looks: [null, { opacity: 0.2, hatch: 'x', fits: [{ color: '#00ff00', dash: 'dot' }] }] }, 'x');
  const hc = typeof hs === 'string' ? [] : hs.curves;
  const fit = (s: string) => hc.find((c) => c.key.startsWith('fit:') && c.label.includes(`(${s})`));
  ok(fit('A')?.style.color === '#000000' && fit('B')?.style.color === '#00ff00' && fit('B')?.style.dash === 'dot' && hc[1].style.fillOpacity === 0.2 && hc[1].bars?.style?.hatch === 'x' && hc[0].bars?.style?.hatch !== 'x', 'Histogram: a column its own opacity, hatching and fit line');
  const bc = barChart(wideTable(undefined, [column('v', Float64Array.from([1, 2, 3]))], [undefined]), { ...BARCHART_DEFAULTS, colorBy: 'category', looks: [null, { edgeColor: '#123456', hatch: '/', err: '#ff0000' }] });
  const bcs = typeof bc === 'string' ? [] : bc.curves;
  ok(bcs[0].bars?.looks?.[1]?.edgeColor === '#123456' && !bcs[0].bars?.looks?.[0] && bcs.find((c) => c.key === 'cat:1')?.style.edgeColor === '#123456' && bcs.find((c) => c.key === 'cat:1')?.bars?.style?.hatch === '/', 'Bar chart: a category its own edge and hatching, also in the legend');
  const bx = boxViolin(['a', 'b'], ['v'], ['a', 'b'].map((c, i) => ({ cat: c, series: 'v', values: [1, 2, 3, 4, 5].map((x) => x + i) })), { ...BOXVIOLIN_DEFAULTS, colorBy: 'category', looks: [{ median: '#ff0000' }, null] });
  const bi = typeof bx === 'string' ? [] : bx.curves[0].boxes!.items;
  ok(bi[0].look?.median === '#ff0000' && !bi[1].look, 'Box & violin: a group its own median colour');
}

{
  // Bland–Altman against numpy / scipy (scripts/fixtures/ba-ref.py → ba-ref.json): bias, SD, limits, their intervals
  // (approximate, exact Carkeet with scipy nct), the regression on X, the regression-based and nonparametric limits
  const R = JSON.parse(readFileSync(new URL('./fixtures/ba-ref.json', import.meta.url), 'utf8'));
  const g = [{ name: 'p', a: R.a as number[], b: R.b as number[] }];
  const run = (spec: object) => blandAltman(g, { ...BLANDALTMAN_DEFAULTS, ...spec }, 'A', 'B');
  const close = (a: number, b: number, tol = 1e-9) => near(a, b, tol);
  const pair = (p: [number, number], q: number[], tol = 1e-9) => close(p[0], q[0], tol) && close(p[1], q[1], tol);
  for (const y of ['diff', 'pct', 'ratio'] as const) {
    const ref = R[y];
    const back = (v: number) => (y === 'ratio' ? Math.exp(v) : v);
    const ap = run({ y, x: y === 'ratio' ? 'gmean' : 'mean', ci: 'approx' });
    const ex = run({ y, x: y === 'ratio' ? 'gmean' : 'mean', ci: 'exact' });
    const s = typeof ap === 'string' ? null : ap.rows[0];
    const e = typeof ex === 'string' ? null : ex.rows[0];
    ok(!!s && !!e && close(s.bias, back(ref.bias)) && close(s.sd, ref.sd) && close(s.lower, back(ref.lower)) && close(s.upper, back(ref.upper)) && pair(s.biasCI, ref.biasCI.map(back)) && pair(s.lowerCI, ref.lowerCIapprox.map(back)) && pair(s.upperCI, ref.upperCIapprox.map(back)) && pair(e.upperCI, ref.upperCIexact.map(back), 1e-8) && pair(e.lowerCI, ref.lowerCIexact.map(back), 1e-8) && close(s.slope, ref.slope) && close(s.intercept, ref.intercept) && close(s.r, ref.r) && close(s.pSlope, ref.p, 1e-7), `Bland–Altman (${y}): bias, SD, limits, their approximate and exact intervals, the regression on X`);
  }
  const rg = run({ loa: 'regression' });
  const np = run({ loa: 'nonparametric' });
  ok(typeof rg !== 'string' && rg.rows[0].reg!.b0 !== undefined && [rg.rows[0].reg!.b0, rg.rows[0].reg!.b1, rg.rows[0].reg!.c0, rg.rows[0].reg!.c1].every((v, i) => close(v, R.diff.reg[i])), 'Bland–Altman: the regression-based limits (Bland & Altman 1999)');
  ok(typeof np !== 'string' && close(np.rows[0].bias, R.diff.median) && close(np.rows[0].lower, R.diff.p025) && close(np.rows[0].upper, R.diff.p975), 'Bland–Altman: nonparametric limits (median, 2.5th and 97.5th percentiles)');
  // the drawing: points, the lines with their values at the right end, the bands; a line of its own look
  const dr = run({ lineColors: ['#111111'], lineLooks: [null, { line: { dash: 'dot', width: 2 } }, { line: { show: false } }] });
  const dc = typeof dr === 'string' ? [] : dr.curves;
  const L = (k: number) => dc.find((c) => c.key === `ba:line:${k}`);
  ok(dc.some((c) => c.key === 'ba:0') && L(0)?.style.color === '#111111' && L(1)?.style.dash === 'dot' && L(1)?.style.lineWidth === 2 && !L(2) && !!L(4) && !!L(0)?.style.endLabel && (L(0)?.label ?? '').startsWith('Mean') && dc.some((c) => c.key === 'ba:ci:0' && c.style.fill === 'points'), 'Bland–Altman: points, lines with their values, bands, every line its own look');
}

{
  // Pie chart against matplotlib's pie (scripts/fixtures/pie-ref.py → pie-ref.json): the wedges' angles both ways, the
  // nested rings' radii; Other, labels inside / outside, the centre, a slice moved out
  const R = JSON.parse(readFileSync(new URL('./fixtures/pie-ref.json', import.meta.url), 'utf8'));
  const same = (a: [number, number][], b: number[][]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-4 && Math.abs(p[1] - b[i][1]) < 1e-4);
  ok(same(pieAngles(R.x, 0, false), R.ccw0) && same(pieAngles(R.x, 90, true), R.cw90) && same(pieAngles(R.x, 140, false), R.ccw140), 'Pie: the slices\' angles as matplotlib (start, both directions)');
  const tbl = (vals: number[][], names = ['a', 'b', 'c', 'd', 'e', 'f']) => wideTable(column('cat', Float64Array.from(vals[0], () => NaN), names.slice(0, vals[0].length)), vals.map((v, k) => column(`v${k}`, Float64Array.from(v))), vals.map(() => undefined));
  const nested = pieChart(tbl([[60, 32, 92.3], [37, 23, 1.2]]), { ...PIE_DEFAULTS, hole: 0.4, ringGap: 0 });
  const its = typeof nested === 'string' ? [] : nested.curves[0].wedges!.items;
  ok(Math.abs(its[0].r0 - R.nested.outer[0][0]) < 1e-6 && Math.abs(its[0].r1 - R.nested.outer[0][1]) < 1e-6 && Math.abs(its[3].r0 - R.nested.inner[0][0]) < 1e-6 && Math.abs(its[3].r1 - R.nested.inner[0][1]) < 1e-6, 'Pie: nested rings as matplotlib\'s donut example (width 0.3 each)');
  const p = pieChart(tbl([[50, 30, 12, 4, 3, 1]]), { ...PIE_DEFAULTS, other: 5, labels: 'namePercent', hole: 0.5, center: 'total', looks: [{ explode: 10 }] });
  const pi = typeof p === 'string' ? [] : p.curves[0].wedges!.items;
  const table = typeof p === 'string' ? null : p.table;
  ok(typeof p !== 'string' && pi.length === 4 && p.categories.at(-1) === 'Other' && table!.columns[1].values[3] === 8 && pi[0].explode === 0.1 && pi[0].label === 'a 50.0 %' && p.curves[0].wedges!.center?.join(' ') === 'Total 100' && p.curves.filter((c) => c.key.startsWith('cat:')).length === 4, 'Pie: small slices merged into Other, labels, the total in the hole, a slice moved out');
}

{
  // significance brackets against scipy (scripts/fixtures/sig-ref.py → sig-ref.json): Welch t + Holm, Mann–Whitney,
  // Tukey HSD; from a post hoc table, written; stacked so they do not cross
  const R = JSON.parse(readFileSync(new URL('./fixtures/sig-ref.json', import.meta.url), 'utf8'));
  const els: SigElement[] = (R.groups as number[][]).map((v, i) => ({ name: 'ABC'[i], cat: 'ABC'[i], series: 's', pos: i + 1, top: Math.max(...v), values: v }));
  const ps = (spec: Partial<SigSpec>, tbl?: Dataset) => significance(els, { ...SIG_DEFAULTS, on: true, ns: true, ...spec }, tbl).brackets.map((b) => b.p);
  const close = (a: number[], b: number[], tol: number) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol * Math.max(1e-12, Math.abs(b[i])));
  ok(close(ps({ test: 'welch', adjust: 'holm' }), R.welchHolm, 1e-6), `Significance: Welch t + Holm as scipy (${ps({ test: 'welch', adjust: 'holm' }).map((p) => p.toPrecision(4))})`);
  ok(close(ps({ test: 'mw', adjust: 'none' }), R.mwNone, 1e-6), 'Significance: Mann–Whitney as scipy');
  ok(close(ps({ test: 'tukey' }), R.tukey, 1e-4), `Significance: Tukey HSD as scipy tukey_hsd (${ps({ test: 'tukey' }).map((p) => p.toPrecision(4))})`);
  const tbl: Dataset = { name: 'post hoc', columns: [{ ...column('pair', new Float64Array([NaN, NaN]), ['A − B', 'B − C']), role: 'label' }, column('p (adjusted)', new Float64Array([0.004, 0.2]))] };
  const fromTable = significance(els, { ...SIG_DEFAULTS, on: true, source: 'table' }, tbl).brackets;
  const typed = significance(els, { ...SIG_DEFAULTS, on: true, source: 'typed', show: 'both', list: 'A vs C = 0.0004; 1 vs 2 = 0.03' }).brackets;
  ok(fromTable.length === 1 && fromTable[0].text === '**' && typed.length === 2 && typed[0].text === '*** (p < 0.001)' && typed[1].text === '* (p = 0.03)', 'Significance: from a post hoc table (ns left out), written with stars and p');
  const all = significance(els, { ...SIG_DEFAULTS, on: true, source: 'typed', list: 'A vs B = 0.01; B vs C = 0.01; A vs C = 0.01' }).brackets;
  const cs = bracketCurves(all, els, SIG_DEFAULTS, false, 1).filter((c) => !c.key.endsWith(':text'));
  const ys = cs.map((c) => c.series.y.values[1]);
  const wide = cs[2].series.x.values;
  ok(cs.length === 3 && Math.abs(ys[2] - Math.max(ys[0], ys[1])) >= 1.3 && wide[0] === 1 && wide[3] === 3, 'Significance: the wide bracket placed above the two narrow ones');
}

{
  // Contour / heatmap against contourpy (matplotlib's contours) and scipy griddata (scripts/fixtures/contour-ref.py →
  // contour-ref.json): the lines of every level (their vertices, how many), scattered points to a grid; a grid found in
  // shuffled X, Y, Z rows; a matrix; profiles; levels
  const R = JSON.parse(readFileSync(new URL('./fixtures/contour-ref.json', import.meta.url), 'utf8'));
  const g: Grid = { xs: R.xs, ys: R.ys, z: Float64Array.from(R.z) };
  for (const [lv, ref] of Object.entries(R.levels) as [string, { count: number; points: number[][] }][]) {
    const lines = contourLines(g, Number(lv));
    const pts = new Set(lines.flatMap((l) => l.x.map((x, i) => `${x.toFixed(6)},${l.y[i].toFixed(6)}`)));
    const want = new Set(ref.points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`));
    ok(lines.length === ref.count && pts.size === want.size && [...want].every((p) => pts.has(p)), `Contour lines (Z = ${lv}): ${lines.length} lines, the vertices of contourpy (${pts.size} / ${want.size})`);
  }
  const S = R.scatter;
  const sg = gridFromScatter(S.x, S.y, S.z, S.n);
  const diffs = (S.grid as (number | null)[]).map((v, k) => (v === null ? (Number.isNaN(sg.z[k]) ? 0 : Infinity) : Math.abs(sg.z[k] - v)));
  ok(Math.max(...diffs) < 1e-9, `Scattered points to a grid: linear on the Delaunay triangles as scipy griddata (worst ${Math.max(...diffs).toExponential(1)})`);
  // a grid found in rows of X, Y, Z in any order
  const order = Array.from({ length: g.xs.length * g.ys.length }, (_, k) => k).reverse();
  const found = asGrid(order.map((k) => g.xs[k % g.xs.length]), order.map((k) => g.ys[Math.floor(k / g.xs.length)]), order.map((k) => g.z[k]));
  ok(!!found && found.xs.length === 31 && found.ys.length === 26 && found.z.every((v, k) => v === g.z[k]), 'A grid found in X, Y, Z rows in any order');
  const m = gridFromMatrix(column('Angle', Float64Array.from([10, 0, 20])), [column('R 410 nm', Float64Array.from([2, 1, 3])), column('R 400 nm', Float64Array.from([5, 4, 6]))]);
  ok(typeof m !== 'string' && m.xs.join() === '400,410' && m.ys.join() === '0,10,20' && Array.from(m.z).join() === '4,1,5,2,6,3', 'A matrix: X from the Z columns\' names, rows and columns sorted');
  const pr = profiles(g, 3.05, 0.5);
  ok(Math.abs(pr.row!.y - 0.4) < 1e-12 && pr.col!.x === 3 && pr.row!.z.length === 31 && pr.col!.z.length === 26, 'Profiles: the nearest row and column');
  ok(contourLevels(0.03, 0.97, { levels: 'auto', nLevels: 8, step: NaN, list: '', log: false }).join() === '0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9' && contourLevels(1, 1000, { levels: 'auto', nLevels: 8, step: NaN, list: '', log: true }).join() === '1,2,5,10,20,50,100,200,500,1000', 'Levels: nice values, decades on a log Z');
  const cp = contourPlot(g, { ...CONTOUR_DEFAULTS, draw: 'filledLines', lineLabels: true }, { x: 'x', y: 'y', z: 'z' });
  ok(typeof cp !== 'string' && cp.curves[0].grid?.mode === 'filled' && cp.curves.filter((c) => c.key.startsWith('level:')).every((c) => c.style.color === '#000000' && (c.labelValues?.text?.filter(Boolean).length ?? 0) === 1), 'Contour: filled levels with black lines, a value on each');
  // values hidden: below a threshold and equal to a value written left out of the map and its range (drawn as missing),
  // the outputs keep them; outside a range chosen: hidden, else in the end colours
  const h = { xs: [0, 1, 2], ys: [0, 1], z: Float64Array.from([-999, 1, 2, 3, 4, 50]) };
  const ch = contourPlot(h, { ...CONTOUR_DEFAULTS, hide: { below: 1.5, values: '-999' } }, { x: 'x', y: 'y', z: 'z' });
  const hz = typeof ch === 'string' ? null : ch.curves[0].grid!;
  ok(!!hz && Number.isNaN(hz.z[0]) && hz.z[1] === 1 && hz.cut?.join() === `1.5,${Infinity}` && hz.range.join() === '2,50' && typeof ch !== 'string' && ch.gridSet.columns[2].values[0] === -999, 'Contour: the values written left out of the map, a threshold a cut when drawn, both out of the range; the outputs keep them');
  const co = contourPlot(h, { ...CONTOUR_DEFAULTS, zMin: 1, zMax: 10, hide: { outside: 'hide' } }, { x: 'x', y: 'y', z: 'z' });
  const cc = contourPlot(h, { ...CONTOUR_DEFAULTS, zMin: 1, zMax: 10 }, { x: 'x', y: 'y', z: 'z' });
  ok(typeof co !== 'string' && co.curves[0].grid!.cut?.join() === '1,10' && typeof cc !== 'string' && !cc.curves[0].grid!.cut, 'Contour: outside the colour range hidden — a cut at its ends (else none: the end colours)');
  const cl = contourPlot(h, { ...CONTOUR_DEFAULTS, draw: 'lines', levels: 'list', list: '3.5', hide: { below: 3.2 } }, { x: 'x', y: 'y', z: 'z' });
  ok(typeof cl !== 'string' && cl.curves.filter((c) => c.key.startsWith('level:')).every((c) => Array.from(c.series.x.values).every((x) => !Number.isFinite(x) || x >= 0)), 'Contour: the lines drawn on the values not hidden');
  ok(contourPlot(h, { ...CONTOUR_DEFAULTS, hide: { above: -1e9 } }, { x: 'x', y: 'y', z: 'z' }) === 'Every value is hidden (Hide values).', 'Contour: every value hidden — said');
}

{
  // Polar / radar: the range of r (dB below 0, up to a nice value), the circles, the sector, radar spokes, a series'
  // own look
  const db = polarChart([{ name: 'gain', theta: [0, 45, 90, 135, 180], r: [-30, -6, 0, -6, -30] }], { ...POLAR_DEFAULTS, from: 0, to: 180 });
  const P = typeof db === 'string' ? null : db.curves[0].polar!;
  ok(!!P && P.lo === -30 && P.hi === 0 && P.rTicks.join() === '-25,-20,-15,-10,-5,0' && P.sector.join() === '0,180', `Polar: r from −30 dB to 0, circles every 5, a half circle (${P?.rTicks})`);
  const auto = polarChart([{ name: 'r', theta: [0, 90, 180], r: [1.2, 3.7, 2] }], POLAR_DEFAULTS);
  const A = typeof auto === 'string' ? null : auto.curves[0].polar!;
  ok(!!A && A.lo === 0 && A.hi === 4 && A.rTicks.join() === '1,2,3,4', 'Polar: r from 0 to a nice value');
  const t = wideTable(column('cat', new Float64Array(5).fill(NaN), ['a', 'b', 'c', 'd', 'e']), [column('s1', Float64Array.from([1, 2, 3, 4, 5])), column('s2', Float64Array.from([5, 4, 3, 2, 1]))], [undefined, undefined]);
  const rs = radarSeries(t);
  const rad = polarChart(rs.series, { ...POLAR_DEFAULTS, kind: 'radar', fill: true, looks: [null, { line: { dash: 'dash', width: 2 }, opacity: 0.6 }] }, rs.spokes);
  const R = typeof rad === 'string' ? null : rad.curves[0].polar!;
  ok(rs.spokes.length === 5 && rs.series[0].theta.join() === '0,72,144,216,288' && !!R && R.thetaStep === 72 && R.series[1].dash === 'dash' && R.series[1].lineWidth === 2 && R.series[1].opacity === 0.6 && R.series[0].opacity === 0.25 && R.series.every((s) => s.close), 'Radar: 5 spokes evenly, closed polygons, a series with its own line and fill');
  // the Axes tab: 0° where asked (E, N, W, S, any angle; a radar at the top), the circles every step, the axes' look
  // carried to the drawing
  const zeroOf = (p: Partial<typeof POLAR_DEFAULTS>) => {
    const r = polarChart([{ name: 'r', theta: [0, 90], r: [1, 2] }], { ...POLAR_DEFAULTS, ...p });
    return typeof r === 'string' ? NaN : (r.curves[0].polar!.zeroDeg ?? NaN);
  };
  const stepped = polarChart([{ name: 'r', theta: [0, 90, 180], r: [1.2, 3.7, 2] }], { ...POLAR_DEFAULTS, paxes: { rStep: 0.5, hole: 0.2, rReverse: true, minor: 1 } });
  const S = typeof stepped === 'string' ? null : stepped.curves[0].polar!;
  // Smith chart: Γ of Z, Y, Γ, |Γ|∠, S11 (dB, phase); z of Γ; what a marker says; a point outside the circle at the rim
  const g1 = (inp: Parameters<typeof toGamma>[0], a: number, b: number, z0 = 50, norm = false) => toGamma(inp, [a], [b], z0, norm)[0].map((v) => +v.toFixed(6)).join();
  const zb = zOfGamma(gammaOfZ([0.5, -1.2]));
  const mt = markerText([1 / 3, 0], 2.45, ['f', 'z', 'vswr', 'rl'], 50, false, 'Frequency (GHz)');
  const sc = smithChart([{ name: 'a', g: [[0, 0], [2, 0]], f: [1, 2] }], { ...SMITH_DEFAULTS, markers: '1.9' }, 'f (GHz)');
  const sf = typeof sc === 'string' ? null : sc.curves[0].smith!;
  ok(g1('z', 50, 0) === '0,0' && g1('z', 0, 0) === '-1,0' && g1('z', 1, 1, 50, true) === '0.2,0.4' && g1('y', 0.02, 0) === '0,0' && g1('gamma', 0.3, -0.4) === '0.3,-0.4' && g1('gammaPolar', 0.5, 90) === '0,0.5' && g1('s11', -20, 180) === '-0.1,0' && Math.abs(zb[0] - 0.5) < 1e-12 && Math.abs(zb[1] + 1.2) < 1e-12 && mt.join(' | ') === 'f = 2.45 GHz | Z = 100 + j0 Ω | VSWR = 2 | RL = 9.54 dB' && !!sf && sf.series[0].u[1] === 1 && sf.series[0].markers[0].lines[0].startsWith('f = 2') && typeof sc !== 'string' && sc.warnings.some((w) => w.includes('outside')), `Smith chart: Γ of Z, Y, Γ, S11; back to z; a marker (${mt.join(', ')}); a point outside at the rim`);
  ok([zeroOf({ zero: 'E' }), zeroOf({ zero: 'N' }), zeroOf({ zero: 'W' }), zeroOf({ zero: 'S' }), zeroOf({ paxes: { zeroAngle: 45 } }), zeroOf({ kind: 'radar', zero: 'S' })].join() === '0,90,180,270,45,90' && S?.rTicks.join() === '0.5,1,1.5,2,2.5,3,3.5,4' && S.ax?.hole === 0.2 && S.ax.rReverse === true && S.ax.minor === 1, `Polar axes: 0° where asked, the circles every step (${S?.rTicks.join(', ')}), the axes' look to the drawing`);
}

{
  // Scatter matrix: k × k panels, the correlations of every pair as scipy (Pearson), the diagonal scaled into its row,
  // one legend entry per group; the node: a figure of k² frames sharing X by column
  const a = [1, 2, 3, 4, 5, 6, 7, 8];
  const cols = [column('a', Float64Array.from(a)), column('b', Float64Array.from(a.map((v) => 2 * v + (v % 3)))), column('c', Float64Array.from(a.map((v) => 10 - v + (v % 2))))];
  const sm = scatterMatrix(cols, ['p', 'q', 'p', 'q', 'p', 'q', 'p', 'q'], { ...SCATTERMATRIX_DEFAULTS, lower: 'scatter', upper: 'corr' });
  const ok1 = typeof sm !== 'string' && sm.cells.length === 9 && sm.corr.columns[2].values.length === 3;
  const r_ab = typeof sm === 'string' ? NaN : sm.corr.columns[2].values[0];
  const hist = typeof sm === 'string' ? [] : sm.cells[0].curves.filter((c) => c.bars);
  const listedPts = typeof sm === 'string' ? [] : sm.cells.flatMap((c) => c.curves).filter((c) => c.key.startsWith('pts:') && !c.noLegend);
  ok(ok1 && near(r_ab, Hy.pearson(a, a.map((v) => 2 * v + (v % 3))).r, 1e-12) && hist.length === 2 && hist.every((h) => Math.max(...Array.from(h.series.y.values)) <= 8 + 1e-9 && h.bars!.base[0] === 1) && listedPts.map((c) => c.label).join() === 'p,q', 'Scatter matrix: 9 panels, Pearson r, the diagonal in its row\'s range, one legend entry a group');
  const text = 'x;y;z\n' + a.map((v) => `${v};${v * v};${10 - v}`).join('\n');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'sm' } } as AppNode;
  const node = { id: 'n', type: 'scattermatrix', position: { x: 0, y: 0 }, data: { ...SCATTERMATRIX_DEFAULTS } } as AppNode;
  const res = evaluateGraph([imp, node], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'n', targetHandle: 'dataset' }]).get('n')!;
  const fig = res.view.figure;
  ok(!!fig && fig.axes.length === 4 && !res.errors?.length && near(fig.axes[0].style.x.min, fig.axes[2].style.x.min, 1e-12) && near(fig.axes[1].style.x.max, fig.axes[3].style.x.max, 1e-12) && near(fig.axes[0].style.y.max, fig.axes[1].style.y.max, 1e-12), `Scatter matrix node: the designated Y columns (2 × 2 frames), X shared down a column, Y along a row (${fig?.axes.length})`);
}

{
  // Waterfall: the running total, increases / decreases / total apart, the connectors at the running total
  const t = wideTable(column('item', new Float64Array(4).fill(NaN), ['a', 'b', 'c', 'd']), [column('v', Float64Array.from([10, -3, 5, -4]))], [undefined]);
  const wf = barChart(t, { ...BARCHART_DEFAULTS, arrange: 'waterfall' });
  const cs = typeof wf === 'string' ? [] : wf.curves;
  const up = cs.find((c) => c.key === 'wf:0')!.bars!;
  const down = cs.find((c) => c.key === 'wf:1')!.bars!;
  const tot = cs.find((c) => c.key === 'wf:2');
  const lines = cs.find((c) => c.key === 'wf:lines');
  ok(Array.from(up.base).join() === '0,7' && Array.from(cs[0].series.y.values).join() === '10,12' && Array.from(down.base).join() === '10,12' && Array.from(cs[1].series.y.values).join() === '7,8' && tot?.series.y.values[0] === 8 && tot.bars!.base[0] === 0 && Array.from(lines!.series.y.values).filter(Number.isFinite).join() === '10,10,7,7,12,12,8,8', 'Waterfall: steps from the running total, increases and decreases apart, the total, the connectors');
}

{
  // Ternary: rows divided by their sum, the triangle's coordinates, bad rows left out, a curve per group
  const [a, b, c] = normalize(2, 1, 1);
  const xy = ternaryXY(1, 0, 0);
  const tc = ternaryChart([{ group: 'p', a: 20, b: 30, c: 50 }, { group: 'q', a: 1, b: -1, c: 3 }, { group: 'q', a: 0, b: 0, c: 1 }], TERNARY_DEFAULTS, ['A', 'B', 'C']);
  const T = typeof tc === 'string' ? null : tc.curves[0].ternary!;
  ok(a === 0.5 && b === 0.25 && c === 0.25 && near(xy[0], 0.5) && near(xy[1], Math.sqrt(3) / 2) && !!T && T.series.length === 2 && T.series[0].a[0] === 0.2 && Number.isNaN(T.series[1].a[0]) && T.series[1].c[1] === 1 && typeof tc !== 'string' && tc.warnings.length === 1, 'Ternary: rows as fractions of their sum, A at the top, a bad row left out, a curve per group');
}

{
  // large data: a map of 451 401 points in long form (X, a swept Y, Z) — the grid (no spread of 10⁵ values into
  // Math.min), split by the swept value into 501 columns; the fast drawing, contour options, SI labels, a fixed aspect,
  // the autosave's references for big texts
  const nx = 901;
  const ny = 501;
  const X = new Float64Array(nx * ny);
  const Y = new Float64Array(nx * ny);
  const Z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      [X[k], Y[k], Z[k]] = [40 + 0.05 * i, 500 + j, Math.sin(i / 50) * Math.cos(j / 40)];
    }
  const big = asGrid(X, Y, Z);
  const cp = big ? contourPlot(big, { ...CONTOUR_DEFAULTS, draw: 'heatLines', render: 'fast', fastCells: 300, negDash: true, lineLabels: true, labelEvery: 2, profileY: 700 }, { x: 'θ', y: 'λ', z: 'R' }) : 'no grid';
  const lv = typeof cp === 'string' ? [] : cp.curves.filter((c) => c.key.startsWith('level:'));
  const map = typeof cp === 'string' ? null : cp.curves[0].grid!;
  const even = map ? map.xs.every((v, k) => k === 0 || Math.abs(v - map.xs[k - 1] - (map.xs[1] - map.xs[0])) < 1e-9) : false;
  ok(!!big && big.xs.length === nx && typeof cp !== 'string' && map!.xs.length === 300 && even && !!cp.rowProfile && !cp.curves.some((c) => c.key.startsWith('profile')) && lv.some((c) => c.style.dash === 'dash') && lv.filter((c) => c.labelValues).length === Math.ceil(lv.length / 2), `A map of ${nx * ny} points: its grid, drawn fast on 300 even cells, levels below 0 dashed, a value on every second level, the profile kept off the map`);
  const sp = coarsen(big!, 1000);
  ok(sp === big, 'Fast drawing: a grid already small enough is drawn as it is');
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;key;z\n' + Array.from({ length: 501 * 3 }, (_, k) => `${k % 3};${Math.floor(k / 3)};${k}`).join('\n'), textId: 'many' } } as AppNode;
  const un = { id: 'u', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, x: 'x', ys: 'z', by: 'column', column: 'key' } } as AppNode;
  const ru = evaluateGraph([imp, un], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'u', targetHandle: 'in' }]).get('u')!;
  ok(!ru.errors.length && ru.outputs.out?.t === 'dataset' && ru.outputs.out.v.columns.length === 502, `Split into columns: 501 blocks (a map in long form) give 502 columns (${ru.errors[0] ?? ''})`);
  // SI prefixes
  const si = formatLabels([0, 1500, 2e6, 3e-4, 4.7e-9], false, { ...SIDE_DEFAULTS, format: 'si' }).labels;
  ok(si.join() === '0,1.5k,2M,300µ,4.7n', `SI prefixes in the numbers (${si})`);
  // a fixed aspect: 1 unit of Y as long as 1 of X
  const curve = { key: 'k', label: '', series: { name: 'y', x: column('x', Float64Array.from([0, 10])), y: column('y', Float64Array.from([0, 5])) }, style: curveStyle({}) } as Curve;
  const axf = { key: 'a', style: axesStyle({ aspect: 1, x: { ...AXIS_DEFAULTS, range: 'tight' }, y: { ...AXIS_DEFAULTS, range: 'tight' } }), curves: [curve], legends: [], annotations: [] } as AxesFig;
  const fr = autoFrame(axf, { x: 0, y: 0, w: 400, h: 400 }, TEXT_DEFAULTS_FOR_CHECK);
  ok(Math.abs(fr.h / fr.w - 0.5) < 1e-9, `A fixed aspect: the frame twice as wide as high for X 0 – 10, Y 0 – 5 (${(fr.h / fr.w).toFixed(4)})`);
  // the autosave: a big text as a reference (the text itself kept apart), small ones as they are
  const p = withRefs({ app: 'graph-flow', version: PROJECT_VERSION, nodes: [{ id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x\n'.repeat(60000), textId: 't' } } as AppNode, { id: 'j', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'small', textId: 's' } } as AppNode], edges: [] });
  const [a, b] = p.nodes as Extract<AppNode, { type: 'import' }>[];
  ok(a.data.text === '' && !!a.data.textRef && b.data.text === 'small' && !b.data.textRef && hasRefs(p), 'Autosave: a big imported text kept apart (a reference in the project), a small one in it');
}

{
  // pseudo-Voigt as Origin: PsdVoigt1 (A = area, one FWHM, μ), PsdVoigt2 (wG, wL) against scipy curve_fit on the same
  // data (values and standard errors); the pseudo-Voigt of height A gives the same μ; % Gaussian = 100(1 − μ) ± 100σ(μ);
  // a project's former η read as μ; the Peak analyzer's % Gaussian and area
  const R = JSON.parse(readFileSync(new URL('./fixtures/voigt-ref.json', import.meta.url), 'utf8'));
  const imp = (ys: number[], tag: string) => ({ id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n' + R.x.map((x: number, i: number) => `${x};${ys[i]}`).join('\n'), textId: tag } }) as AppNode;
  const fit = (ys: number[], tag: string, data: Partial<FitNodeData>) => evaluateGraph([imp(ys, tag), { id: 'f', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'x', ys: ['y'], ...data } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'f', targetHandle: 'in' }]).get('f')!;
  const rel = (a: number, b: number, t: number) => Math.abs(a - b) <= t * Math.max(Math.abs(b), 1e-12);
  const same = (r: ReturnType<typeof fit>, p: number[], e: number[]) => {
    const q = r.view.fit?.runs[0].params ?? [];
    return q.length === p.length && q.every((x, j) => rel(x.value, p[j], 1e-5) && rel(x.error, e[j], 2e-3));
  };
  const lib = (model: string) => ({ model: { ...FIT_DEFAULTS.model, kind: 'library' as const, model } });
  const f1 = fit(R.y1, 'v1', lib('psdvoigt1'));
  ok(same(f1, R.p1, R.e1), `pseudo-Voigt: PsdVoigt1 (A = area) as scipy, values and errors (${f1.errors.join() || f1.view.fit?.runs[0].params.map((q) => fmtPm(q.value, q.error)).join(', ')})`);
  const f2 = fit(R.y2, 'v2', lib('psdvoigt2'));
  ok(same(f2, R.p2, R.e2), `pseudo-Voigt: PsdVoigt2 (wG, wL) as scipy (${f2.errors.join() || f2.view.fit?.runs[0].params.map((q) => fmtPm(q.value, q.error)).join(', ')})`);
  const pc = f1.outputs.params?.t === 'dataset' ? f1.outputs.params.v.columns : [];
  const cv = (n: string) => pc.find((c) => c.name === n)?.values[0] ?? NaN;
  ok(rel(cv('% Gaussian'), 100 * (1 - R.p1[4]), 1e-5) && rel(cv('% Gaussian error'), 100 * R.e1[4], 2e-3) && rel(cv('% Lorentzian'), 100 * R.p1[4], 1e-5), `pseudo-Voigt: % Gaussian = 100(1 − μ) ± 100σ(μ) in the parameters (${cv('% Gaussian')} ± ${cv('% Gaussian error')})`);
  // the same curve as a pseudo-Voigt of height A: the same μ, A = area × (μ·2/π + (1 − μ)·√(4 ln2/π)) / w
  const fh = fit(R.y1, 'v1', lib('voigt'));
  const ph = fh.view.fit?.runs[0].params ?? [];
  const [mu, w] = [R.p1[4], R.p1[3]];
  const H = (R.p1[1] * (mu * (2 / Math.PI) + (1 - mu) * Math.sqrt((4 * Math.LN2) / Math.PI))) / w;
  ok(ph.length === 5 && rel(ph[4].value, mu, 1e-5) && rel(ph[1].value, H, 1e-5) && rel(ph[4].error, R.e1[4], 2e-3), `pseudo-Voigt (A = height): Origin’s μ and its error, the height (${ph.map((q) => q.value).join()})`);
  // a former η (Lorentzian part of the height) read as μ: the same shape
  const eta = (mu * 2) / Math.PI / (mu * (2 / Math.PI) + (1 - mu) * Math.sqrt((4 * Math.LN2) / Math.PI));
  const s = findSpec([{ name: 'eta1', value: eta, fixed: true, min: 0, max: 1, shared: false }], 'mu1', 'fraction');
  ok(s.name === 'mu1' && rel(s.value, mu, 1e-12) && s.fixed && s.min === 0 && rel(s.max, 1, 1e-12) && findSpec([{ name: 'eta', value: 0.5, fixed: false, min: NaN, max: NaN, shared: false }], 'mu', 'free').value !== s.value, 'pseudo-Voigt: a saved η (projects before μ) read as μ, only for μ');
  // the Peak analyzer: one pseudo-Voigt over a constant baseline
  const pk = evaluateGraph([imp(R.y1, 'v1'), { id: 'p', type: 'peaks', position: { x: 0, y: 0 }, data: { ...PEAK_DEFAULTS, baseline: 'constant', peaks: [{ shape: 'voigt', x: 10 }] } } as AppNode], [{ id: '1', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'in' }]).get('p')!;
  const tc = pk.outputs.table?.t === 'dataset' ? pk.outputs.table.v.columns : [];
  const tv = (n: string) => tc.find((c) => c.name === n)?.values[0] ?? NaN;
  ok(rel(tv('% Gaussian'), 100 * (1 - mu), 1e-4) && rel(tv('area'), R.p1[1], 1e-4) && rel(tv('% Gaussian error'), 100 * R.e1[4], 2e-3) && pk.view.peaks?.table[0][0].gauss !== undefined, `Peak analyzer: a pseudo-Voigt’s % Gaussian ± error and its area as Origin (${tv('% Gaussian')} ± ${tv('% Gaussian error')}, area ${tv('area')}; ${pk.errors.join()})`);
}

{
  // Contour: several profiles, each a row or a column with its own line; a project's two former profiles read as two
  const xs = [0, 1, 2, 3, 4];
  const ys = [10, 20, 30];
  const g: Grid = { xs, ys, z: Float64Array.from({ length: 15 }, (_, k) => (k % 5) + 10 * Math.floor(k / 5)) };
  const legacy = profileList({ ...CONTOUR_DEFAULTS, profileY: 20, profileX: 3, profileShow: true, profileColor: '#ff0000', profileColor2: '#0000ff', profileDash: 'dot', profileWidth: 2 });
  ok(legacy.length === 2 && legacy[0].along === 'row' && legacy[0].at === 20 && legacy[0].color === '#ff0000' && legacy[1].along === 'column' && legacy[1].color === '#0000ff' && legacy.every((p) => p.show && p.dash === 'dot' && p.width === 2) && profileList({ ...CONTOUR_DEFAULTS, profileList: [] }).length === 0, 'Contour: the two profiles of a former project read as a list of two (their colours, line, width)');
  const P = (id: string, along: 'row' | 'column', at: number, show: boolean, color = '#000000') => ({ id, along, at, show, color, dash: 'dash' as const, width: 1.5 });
  const cp = contourPlot(g, { ...CONTOUR_DEFAULTS, profileList: [P('a', 'row', 11, true, '#ff0000'), P('b', 'row', 29, false), P('c', 'column', 1.2, true, '#00ff00'), P('d', 'row', NaN, true)] }, { x: 'θ', y: 'λ', z: 'R' });
  const rows = typeof cp === 'string' ? [] : (cp.rowProfile?.columns ?? []);
  const cols = typeof cp === 'string' ? [] : (cp.colProfile?.columns ?? []);
  const marks = typeof cp === 'string' ? [] : cp.curves.filter((c) => c.key.startsWith('profile '));
  ok(rows.map((c) => c.name).join() === 'θ,R at λ = 10,R at λ = 30' && Array.from(rows[2].values).join() === '20,21,22,23,24' && cols.map((c) => c.name).join() === 'λ,R' && Array.from(cols[1].values).join() === '1,11,21', `Contour: two row profiles (a Z column each, at the nearest rows) and one column profile (its Z named as before) (${rows.map((c) => c.name).join()} | ${cols.map((c) => c.name).join()})`);
  ok(marks.length === 2 && marks[0].style.color === '#ff0000' && marks[1].style.color === '#00ff00' && marks.every((c) => c.style.dash === 'dash' && c.style.lineWidth === 1.5) && Array.from(marks[1].series.x.values).join() === '1,1', 'Contour: only the profiles asked drawn on the map, each with its colour, line, width');
}

{
  // fast reading: a plain number read without Number() on a copy of the cell gives the same double (random numbers of up
  // to 18 digits, with exponents); cells read from the text by position as before (quotes, \r, spaces, ragged rows)
  let seed = 7;
  const rnd = (k: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % k;
  };
  let same = 0;
  const N = 20000;
  for (let t = 0; t < N; t++) {
    const digs = Array.from({ length: 1 + rnd(18) }, () => rnd(10)).join('');
    const cut = rnd(digs.length + 1);
    let s = (rnd(3) === 0 ? '-' : '') + digs.slice(0, cut) + (rnd(2) ? '.' : '') + digs.slice(cut);
    if (rnd(3) === 0) s += `e${rnd(2) ? '-' : ''}${rnd(330)}`;
    const want = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : undefined;
    if (Object.is(plainNumber(s, 0, s.length, 46), want)) same++;
  }
  ok(same === N && Object.is(plainNumber(' 1,25 ', 0, 6, 44), 1.25) && plainNumber('1.2.3', 0, 5, 46) === undefined && Number.isNaN(plainNumber('  ', 0, 2, 46)), `CSV: plain numbers read exactly as Number() (${same} of ${N})`);
  const r1 = parseCsv('name,v\r\n"Smith, J",3\r\n\r\nplain, 5 \r\n', CSV_DEFAULTS).dataset.columns;
  const r2 = parseCsv('a b  c\n1 2 3\n  4   5 6  \n', CSV_DEFAULTS).dataset.columns;
  const r3 = parseCsv('x;y\r1,5;2\r3;4,25\r', CSV_DEFAULTS).dataset.columns;
  const r4 = parseCsv('1,2,3\n4,5\n6,7,8,9\n', CSV_DEFAULTS).dataset.columns;
  ok(r1[0].text?.join('|') === 'Smith, J|plain' && Array.from(r1[1].values).join() === '3,5' && Array.from(r2[2].values).join() === '3,6' && Array.from(r3[1].values).join() === '2,4.25' && r3[0].values[0] === 1.5 && r4.length === 4 && Number.isNaN(r4[2].values[1]) && r4[3].values[2] === 9, 'CSV: quoted cells, blank lines, spaces, old Mac line ends, ragged rows');
  // the formula: one, two, three arguments and a missing name
  const f = compile('if(A > 1, hypot(A, B), atan2(B, A)) + max(A, B, 3) + mod(7, 4) + isnan(Z)');
  ok(typeof f !== 'string' && f.fn({ A: 2, B: 0 }) === 2 + 3 + 3 + 1 && near(f.fn({ A: 1, B: 1 }), Math.PI / 4 + 3 + 3 + 1, 1e-15), 'Formulas: functions of one, two, three arguments; a name not given is missing (NaN)');
}

{
  // Waterfall: three curves (Y = 0 … 1) shifted by 10 % of X's range and 50 % of Y's per curve; the first in front
  // (lowest, drawn last, its fill hiding the curves behind in the page's colour); Z from the names; labels; a map
  const x = [0, 5, 10];
  const runs = [0, 1, 2].map((k) => ({ name: `R ${400 + 50 * k} nm`, z: NaN, x, y: [0, 1, 0] }));
  const zz = waterfallZ(runs.map((q) => ({ name: q.name })), 'auto');
  const keyed = waterfallZ([{ name: 'a', key: { name: 'd (nm)', value: 150 } }, { name: 'b', key: { name: 'd (nm)', value: 200 } }], 'auto');
  ok(zz.z.join() === '400,450,500' && keyed.z.join() === '150,200' && keyed.title === 'd (nm)' && waterfallZ([{ name: 'a' }, { name: 'b' }], 'auto').z.join() === '1,2', 'Waterfall: Z from the blocks, the numbers in the names, or the order');
  const w = waterfallChart(runs.map((q, j) => ({ ...q, z: zz.z[j] })), { ...WATERFALL_DEFAULTS, dx: 10, dy: 50, labels: 'right', labelText: '{z} nm', colorMap: 'viridis' }, { x: 'λ', z: '' }, '#fafafa');
  const cs = typeof w === 'string' ? [] : w.curves.filter((c) => /^wf:\d$/.test(c.key));
  const at = (k: string) => cs.find((c) => c.key === k)!;
  const lab = typeof w === 'string' ? [] : w.curves.filter((c) => c.key.startsWith('wf-label'));
  ok(
    cs.map((c) => c.key).join() === 'wf:2,wf:1,wf:0' && Array.from(at('wf:2').series.x.values).join() === '2,7,12' && Array.from(at('wf:2').series.y.values).join() === '1,2,1' && at('wf:0').series.y.values[1] === 1 && at('wf:1').style.fillFormula === '0.5' && at('wf:1').style.fillColor === '#fafafa' && at('wf:1').style.fillOver === true && at('wf:1').style.fillOpacity === 1,
    'Waterfall: every curve shifted by its step, drawn from the back, its fill down to its baseline in the page colour (hidden lines)',
  );
  ok(lab.map((c) => c.labelValues?.text?.[0]).join() === '500 nm,450 nm,400 nm' && lab[0].series.y.values[0] === 1 && lab[0].series.x.values[0] === 12 && typeof w !== 'string' && w.colorRange?.join() === '400,500' && at('wf:0').group?.color === 'map' && at('wf:0').style.color !== at('wf:2').style.color, 'Waterfall: Z written beside the last point of every curve, the curves coloured by Z on the map (its range for the colour bar)');
  const last = waterfallChart(runs.map((q, j) => ({ ...q, z: zz.z[j] })), { ...WATERFALL_DEFAULTS, units: 'data', dx: 0, dy: 2, front: 'last', fill: 'color', fillOpacity: 0.4, colorMap: 'own', colors: ['#ff0000'] }, { x: 'λ', z: '' }, 'none');
  const lc = typeof last === 'string' ? [] : last.curves;
  ok(lc.map((c) => c.key).join() === 'wf:0,wf:1,wf:2' && lc[0].series.y.values[1] === 5 && lc[2].series.y.values[1] === 1 && lc[0].style.color === '#ff0000' && lc[1].style.fillOpacity === 0.4 && lc[1].style.fillColor === '' && !lc[0].group, 'Waterfall: the last in front, steps in data units, a ridgeline fill in each curve’s colour, a colour chosen');
  // the spacing: even, by Z (the same spread), a list (the last step going on), automatic (each above all those in
  // front, plus the gap), by the height of the curve in front
  {
    const R = [{ name: 'A', z: 10, x: [0, 1, 2], y: [0, 1, 0] }, { name: 'B', z: 20, x: [0, 1, 2], y: [0, 2, 0] }, { name: 'C', z: 40, x: [0, 1, 2], y: [0, 0.5, 0] }];
    const Y = R.map((r) => Float64Array.from(r.y));
    const sh = (p: Partial<typeof WATERFALL_DEFAULTS>, sx = 0, sy = 1) => waterfallShifts(R, Y, [10, 20, 40], [0, 1, 2], { ...WATERFALL_DEFAULTS, units: 'data', ...p }, sx, sy, 2, 2, []).offY.map((v) => +v.toFixed(4)).join();
    ok(sh({}) === '0,1,2' && sh({ spacing: 'z' }) === '0,0.6667,2' && sh({ spacing: 'list', offsetsY: '0, 5' }) === '0,5,10' && sh({ spacing: 'auto' }, 0, 0.1) === '0,0.1,1.7' && sh({ spacing: 'height', dy: 50 }) === '0,0.5,1.5', `Waterfall spacing: even, by Z, a list, automatic with a gap, by height (${sh({ spacing: 'auto' }, 0, 0.1)})`);
    const w0: string[] = [];
    waterfallShifts(R, Y, [NaN, NaN, NaN], [0, 1, 2], { ...WATERFALL_DEFAULTS, spacing: 'z' }, 0, 1, 2, 2, w0);
    ok(w0.some((m) => m.includes('no Z')), 'Waterfall spacing by Z without Z: even steps, said');
  }
  // the node: the Y columns of a split sweep with their swept value
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;key;y\n' + [1, 2, 3].flatMap((k) => [0, 1, 2, 3].map((i) => `${i};${k * 10};${Math.sin(i + k)}`)).join('\n'), textId: 'wf' } } as AppNode;
  const un = { id: 'u', type: 'unstack', position: { x: 0, y: 0 }, data: { ...UNSTACK_DEFAULTS, x: 'x', ys: 'y', by: 'column', column: 'key' } } as AppNode;
  const wn = { id: 'w', type: 'waterfall', position: { x: 0, y: 0 }, data: { ...WATERFALL_DEFAULTS } } as AppNode;
  const res = evaluateGraph([imp, un, wn], [{ id: 'e1', source: 'i', sourceHandle: 'out', target: 'u', targetHandle: 'in' }, { id: 'e2', source: 'u', sourceHandle: 'out', target: 'w', targetHandle: 'dataset' }]).get('w')!;
  const fc = res.view.figure?.axes[0].curves.filter((c) => /^wf:\d$/.test(c.key)) ?? [];
  const bar = res.view.figure?.axes[0].annotations.find((a) => a.kind === 'colorbar');
  ok(!res.errors.length && fc.length === 3 && fc.map((c) => c.group?.value).join() === '30,20,10' && bar?.kind === 'colorbar' && bar.bar.title === 'key' && res.outputs.data?.t === 'dataset' && res.outputs.data.v.columns.length === 6, `Waterfall node: a split sweep, Z the blocks’ value, a colour bar titled by it, the shifted curves out (${res.errors.join()})`);
}

{
  // 3D plot: a surface on a 6 × 4 grid (a colour a cell, the data's range), coarsened to 3 cells a side; bars from 0; X,
  // Y, Z points in groups (a legend each, colours by Z per point); a waterfall's curves at their depths, with walls;
  // contour lines on the floor
  const xs = [0, 1, 2, 3, 4, 5];
  const ys = [0, 1, 2, 3];
  const g: Grid = { xs, ys, z: Float64Array.from({ length: 24 }, (_, k) => (k % 6) + (k >= 12 ? 2 : 0)) };
  const names = { x: 'x', y: 'y', z: 'z' };
  const s = plot3d({ kind: 'grid', g, names }, { ...PLOT3D_DEFAULTS, kind: 'surface', floor: 'contour', floorLevels: 3 });
  const sc = typeof s === 'string' ? null : s.curves[0].three!;
  ok(!!sc && sc.surfaces[0].fill.length === 15 && sc.surfaces[0].fill.every((f) => /^#[0-9a-f]{6}$/i.test(f)) && sc.range.z.join() === '0,7' && typeof s !== 'string' && s.colorRange?.join() === '0,7' && (sc.floor?.lines?.length ?? 0) > 0 && sc.titles.join() === 'x,y,z', '3D: a surface — a colour a cell by Z, the box the data’s range, contour lines on the floor, the titles');
  const c3 = plot3d({ kind: 'grid', g, names }, { ...PLOT3D_DEFAULTS, kind: 'wireframe', resolution: 4 });
  ok(typeof c3 !== 'string' && c3.curves[0].three!.surfaces[0].xs.length === 4 && c3.curves[0].three!.surfaces[0].fill.every((f) => f === '') && c3.curves[0].three!.surfaces[0].mesh.every === 1 && c3.warnings.some((w) => w.includes('4 × 4')), '3D: a wireframe (no fill, every line), drawn on at most N cells a side');
  const b = plot3d({ kind: 'grid', g, names }, { ...PLOT3D_DEFAULTS, kind: 'bars', barWidth: 0.5 });
  const bi = typeof b === 'string' ? [] : b.curves[0].three!.bars.items;
  ok(bi.length === 24 && bi.every((q) => q.z0 === 0 && q.dx === 0.5 && q.dy === 0.5) && bi[23].z1 === 7 && typeof b !== 'string' && b.curves[0].three!.range.x.join() === '-0.5,5.5', '3D: bars from 0, their width a fraction of the step, the box around them');
  const p = plot3d({ kind: 'points', names, groups: [{ name: 'A', x: [0, 1], y: [0, 1], z: [0, 1] }, { name: 'B', x: [2], y: [2], z: [5] }] }, { ...PLOT3D_DEFAULTS, kind: 'scatter', drop: true });
  const pt = typeof p === 'string' ? null : p.curves[0].three!;
  ok(!!pt && pt.points.length === 2 && pt.points[0].colors.length === 2 && pt.points[0].colors[0] !== pt.points[0].colors[1] && pt.points[0].drop && typeof p !== 'string' && p.curves.filter((c) => c.key.startsWith('3d:')).map((c) => c.label).join() === 'A,B' && pt.range.z.join() === '0,5', '3D: symbols of two groups (a legend each), coloured by Z point by point, lines to the floor');
  const w = plot3d({ kind: 'curves', names: { x: 'λ', y: 'd', z: 'R' }, curves: [{ name: 'a', depth: 150, x: [1, 2, 3], y: [0.5, 0.2, 0.6] }, { name: 'b', depth: 200, x: [1, 2, 3], y: [0.4, 0.1, 0.7] }] }, { ...PLOT3D_DEFAULTS, kind: 'waterfall', walls: true, wallOpacity: 0.2 });
  const wl = typeof w === 'string' ? [] : w.curves[0].three!.lines;
  ok(wl.length === 2 && wl.every((l) => l.planar && l.fill?.opacity === 0.2) && wl[1].pts[0][1] === 200 && wl[1].pts[2][2] === 0.7 && typeof w !== 'string' && w.colorRange?.join() === '150,200' && w.curves[0].three!.titles.join() === 'λ,d,R', '3D: a waterfall — every curve at its depth, in its plane, with its wall; coloured by the depth');
  // a waterfall: the walls of the chosen curves only, in their own colour or one for all; the depth's labels typed
  const wcs = { kind: 'curves' as const, names: { x: 'λ', y: 'd', z: 'R' }, curves: [150, 200, 250].map((depth, j) => ({ name: `c${j}`, depth, x: [1, 2, 3], y: [0.5, 0.2 + j / 10, 0.6] })) };
  const wc = plot3d(wcs, { ...PLOT3D_DEFAULTS, kind: 'waterfall', walls: true, wallsOf: 'chosen', wallPick: [true, false, true], wallColor: '#00ff00', wallColors: ['', '', '#0000ff'], depthLabels: 'custom', depthText: 'thin, ' });
  const wcl = typeof wc === 'string' ? [] : wc.curves[0].three!.lines;
  const wcy = typeof wc === 'string' ? undefined : wc.curves[0].three!.yLabels;
  ok(wcl.map((l) => l.fill?.color ?? '-').join() === '#00ff00,-,#0000ff' && wcy?.at.join() === '150,250' && wcy.text.join() === 'thin,250', `3D waterfall: walls on the chosen curves, their colours; the depth labels typed (${wcl.map((l) => l.fill?.color ?? '-')}; ${wcy?.text})`);
  const wn = plot3d(wcs, { ...PLOT3D_DEFAULTS, kind: 'waterfall', walls: true, depthLabels: 'names' });
  ok(typeof wn !== 'string' && wn.curves[0].three!.lines.every((l) => !!l.fill) && wn.curves[0].three!.yLabels?.text.join() === 'c0,c1,c2', '3D waterfall: every wall (all), the depth labelled with the curves’ names');
  // drawing on a plane: a rectangle from two corners in its plane
  ok(rectCorners([0, 1, 2], [3, 9, 5], 'xz').map((p) => p.join(' ')).join(';') === '0 1 2;3 1 2;3 1 5;0 1 5' && rectCorners([0, 1, 2], [3, 4, 9], 'xy')[2].join() === '3,4,2', '3D marks: a rectangle’s corners in its plane');
  // the limits of the axes: the box from them, the surface cut (columns outside left out, a Z outside empty); the camera
  const lim = plot3d({ kind: 'grid', g, names }, { ...PLOT3D_DEFAULTS, kind: 'surface', resolution: 50, xLim: [1, 4], zLim: [null, 5], cam: { k: 2, dx: 0.1, dy: 0 } });
  const ls = typeof lim === 'string' ? null : lim.curves[0].three!;
  ok(!!ls && ls.range.x.join() === '1,4' && ls.range.z.join() === '0,5' && ls.surfaces[0].xs.join() === '1,2,3,4' && Array.from(ls.surfaces[0].z).filter((v) => !Number.isFinite(v)).length > 0 && ls.cam?.k === 2, `3D: the limits of the axes cut the surface; the camera kept (${ls?.range.x}; ${ls?.surfaces[0].xs})`);
  // the look: hidden fill, bands, mesh by Z along X, contours on it, the ceiling, the walls, the curtain
  const look = plot3d({ kind: 'grid', g, names }, { ...PLOT3D_DEFAULTS, kind: 'surface', resolution: 50, surfaceFill: 'none', meshBy: 'z', meshDir: 'x', mesh: 1, contours: 3, ceiling: 'map', wallProj: 'lines', curtain: true, backColor: '#ff0000', shine: 0.5 });
  const lk = typeof look === 'string' ? null : look.curves[0].three!;
  ok(!!lk && lk.surfaces[0].fill.every((f) => f === '') && lk.surfaces[0].mesh.colors?.length === 24 && lk.surfaces[0].mesh.dir === 'x' && lk.lines.filter((l) => l.bias).length > 0 && (lk.ceiling?.cells?.length ?? 0) === 24 && lk.walls?.mode === 'lines' && lk.lines.filter((l) => l.planar && l.fill).length === 4 && lk.surfaces[0].back === '#ff0000' && lk.surfaces[0].shine === 0.5, '3D: the surface hidden, the mesh by Z along X, contours on it, the ceiling, the walls, the curtain, the underside, the shine');
  // the curtain like the surface (a piece of the edge each, in the colour of its top), the axes' own look (Z reversed:
  // its range from the highest), a mark in front of the data
  const cur = plot3d({ kind: 'grid', g, names }, { ...PLOT3D_DEFAULTS, kind: 'surface', resolution: 50, curtain: true, curtainBy: 'surface', axis3: { z: { reverse: true, step: 2 } }, marks: [{ id: 'm', type: 'point', x1: 1, y1: 1, z1: 3, x2: NaN, y2: NaN, z2: NaN, color: '#000000', width: 1, dash: 'solid', place: 'front', label: 'P' }] });
  const cu3 = typeof cur === 'string' ? null : cur.curves[0].three!;
  const walls3 = cu3?.lines.filter((l) => l.planar && l.fill) ?? [];
  ok(!!cu3 && walls3.length === 2 * (5 + 3) && new Set(walls3.map((l) => l.color)).size > 2 && cu3.range.z.join() === '7,0' && cu3.axes?.[2]?.step === 2 && cu3.points.at(-1)?.place === 'front' && cu3.labels?.[0]?.place === 'front', '3D: the curtain coloured like the surface, a reversed Z axis, its own step, a mark in front of the data');
  // marks: an arrow (its head, its projections, its label), an upright rectangle with a fill, a point
  const mk = plot3d({ kind: 'grid', g, names }, {
    ...PLOT3D_DEFAULTS,
    kind: 'surface',
    marks: [
      { id: 'a', type: 'arrow', x1: 0, y1: 0, z1: 0, x2: 5, y2: 3, z2: 7, color: '#000000', width: 1, dash: 'solid', label: 'up', proj: { floor: true, x: true } },
      { id: 'r', type: 'rect', plane: 'xz', x1: 1, y1: 2, z1: 0, x2: 3, y2: NaN, z2: 4, color: '#e41a1c', width: 1, dash: 'dash', fill: '#e41a1c', fillOpacity: 0.2 },
      { id: 'p', type: 'point', x1: 2, y1: 1, z1: 3, x2: NaN, y2: NaN, z2: NaN, color: '#0000ff', width: 1, dash: 'solid', size: 5 },
    ],
  });
  const ms = typeof mk === 'string' ? null : mk.curves[0].three!;
  const arrow = ms?.lines.find((l) => l.heads);
  const rect = ms?.lines.find((l) => l.area);
  ok(!!arrow && arrow.heads!.join() === 'none,arrow' && !!arrow.proj?.floor && !!rect && rect.pts.length === 5 && rect.pts.every((p) => p[1] === 2) && rect.pts[2][2] === 4 && ms!.labels?.[0].text === 'up' && ms!.points.some((p) => p.pts[0].join() === '2,1,3' && p.size === 5), '3D marks: an arrow (its head, projections, label), an upright rectangle filled, a point');
  // a place on the floor found back from the screen (the camera inverted), and the point under the mouse
  if (ls) {
    const curve = (lim as Exclude<typeof lim, string>).curves[0];
    const frame = { x: 0, y: 0, w: 300, h: 200 };
    const { S, cam } = sceneCamera(curve, frame, TEXT_DEFAULTS, null);
    const hit = { node: 'n', curve, frame, S, cam };
    const q = cam.P([2.5, 1.5, 0]);
    const back = onPlane3d(hit, q[0], q[1], 2, 0);
    ok(!!back && near(back[0], 2.5, 1e-6) && near(back[1], 1.5, 1e-6) && near(back[2], 0, 1e-9), `3D: a place on the floor found from the screen (${back?.join()})`);
    // the back walls as drawn: on the side away from the eye
    ok(planeValue(hit, { axis: 2, value: 'low' }) === S.range.z[0] && planeValue(hit, { axis: 0, value: 'back' }) === (cam.e3[0] > 0 ? S.range.x[0] : S.range.x[1]) && planeValue(hit, { axis: 1, value: 7 }) === 7, '3D: the plane drawn on — the floor, a back wall, a value');
  }
}

{
  // 3D stacked maps: the points of every layer averaged in bins over the X, Y range of all (an empty bin NaN), the values
  // below a threshold or equal to one written left out (also of the range), the colour range of what is drawn, half a
  // step of room below and above the layers, their names on Z; a vertical line cut at the layers' heights, a rectangle
  // on the floor
  const h = hiddenBy({ below: 5, values: '-999, 0' })!;
  ok(h(4) && h(-999) && h(0) && h(NaN) && !h(5) && !h(7) && hiddenBy({}) === null && hiddenBy({ below: NaN }) === null, 'Hide values: below a threshold, equal to the values written, NaN; nothing set: no test');
  const names = { x: 'Qx', y: 'Qz', z: 'I', depth: 'Sample' };
  const A = { name: 'S1', at: 1, x: [0, 1, 0.9, 0.5, 0.2], y: [0, 1, 0.95, 0.5, 0.1], v: [10, 20, 30, 1, -999] };
  const B = { name: 'S2', at: 3, x: [0], y: [1], v: [100], opacity: 0.5 };
  const marks = [
    { id: 'v', type: 'vline' as const, x1: 0.5, y1: 0.5, z1: NaN, z2: NaN, x2: NaN, y2: NaN, color: '', width: 0, dash: 'dash' as const },
    { id: 'r', type: 'rect' as const, x1: 0, x2: 1, y1: 0, y2: 0.5, z1: NaN, z2: NaN, color: '#ff0000', width: 1, dash: 'solid' as const },
  ];
  const L = plot3d({ kind: 'layers', layers: [A, B], names }, { ...PLOT3D_DEFAULTS, kind: 'layers', bins: 4, hide: { below: 5, values: '-999' }, layerAxis: 'names', marks });
  const S = typeof L === 'string' ? null : L.curves[0].three!;
  const pa = S?.planes?.[0];
  const filled = (v: Float64Array) => [...v.keys()].filter((q) => Number.isFinite(v[q])).join();
  ok(!!pa && pa.xe.join() === '0,0.25,0.5,0.75,1' && pa.ye.join() === '0,0.25,0.5,0.75,1' && filled(pa.v) === '0,15' && pa.v[0] === 10 && pa.v[15] === 25 && filled(S!.planes![1].v) === '12' && S!.planes![1].v[12] === 100 && S!.planes![1].opacity === 0.5 && pa.opacity === 1, '3D stacked maps: the points in bins over the range of all layers (a mean each, empty: NaN), hidden values left out, a layer’s opacity');
  ok(typeof L !== 'string' && L.colorRange?.join() === '10,100' && S!.range.z.join() === '0,4' && S!.zLabels?.at.join() === '1,3' && S!.zLabels?.text.join() === 'S1,S2' && S!.titles[2] === '', '3D stacked maps: the colour range of the values drawn, half a step of room below and above, the names on Z (no Z title)');
  const vl = S?.lines.find((l) => !l.planar);
  const rl = S?.lines.find((l) => l.planar);
  ok(!!vl && vl.pts.map((p) => p[2]).join() === '0,1,3,4' && vl.pts.every((p) => p[0] === 0.5 && p[1] === 0.5) && vl.color === '#000000' && vl.width === 0.8 && !!rl && rl.pts.length === 5 && rl.pts.every((p) => p[2] === 0) && rl.color === '#ff0000', '3D marks: a vertical line from the bottom to the top cut at the layers’ heights; a rectangle on the floor');
  const lg = plot3d({ kind: 'layers', layers: [{ ...A, v: [10, 1000, 100, 0.5, 0] }], names }, { ...PLOT3D_DEFAULTS, kind: 'layers', bins: 4, logColor: true, layerAxis: 'none', zMin: -1 });
  ok(typeof lg !== 'string' && lg.colorRange?.join() === '0.5,550' && lg.curves[0].style.cmapLog && lg.curves[0].three!.zLabels?.at.length === 0, '3D stacked maps: a log colour scale (the positive values; a range end ≤ 0 ignored), no numbers on Z');
  const none = plot3d({ kind: 'layers', layers: [A], names }, { ...PLOT3D_DEFAULTS, kind: 'layers', hide: { below: 1e9 } });
  ok(typeof none === 'string' && none.includes('hidden'), '3D stacked maps: every value hidden — said');
  // the node: the layers found by the column of labels (S1 … S5, the columns by their designations); my list — a layer
  // by a label, one by rows, one from an input not connected (kept in its place, empty)
  const ex = EXAMPLES.find((e) => e.name.startsWith('3D stacked'))!.make();
  const auto = evaluateGraph(ex.nodes, ex.edges).get('rsm-p1')!;
  ok(!auto.errors.length && auto.view.layers?.map((L) => `${L.name}:${L.at}:${L.points}:${L.is}`).join() === 'S1:1:2500:S1,S2:2:2500:S2,S3:3:2500:S3,S4:4:2500:S4,S5:5:2500:S5' && auto.view.layerInputs?.[0].labels.Sample?.length === 5, '3D stacked maps: the layers found by a column of labels');
  const p1 = ex.nodes.find((q) => q.id === 'rsm-p1')!;
  const mine = ex.nodes.map((q) => (q === p1 ? ({ ...q, data: { ...q.data, layerList: 'own', layerOwn: [{ from: 0, where: 'Sample', is: 'S4', at: 10 }, { from: 0, rows: '1-100', name: 'first' }, { from: 1 }] } } as typeof q) : q));
  const own = evaluateGraph(mine, ex.edges).get('rsm-p1')!;
  ok(!own.errors.length && own.view.layers?.map((L) => `${L.name}:${L.at}:${L.points}:${L.shown}`).join() === 'S4:10:2500:true,first:2:100:true,B:3:0:false' && own.warnings.some((w) => w.includes('nothing connected to B')), '3D stacked maps: my list — a layer by a label, one by rows, an input not connected kept empty');
  const pl = own.view.figure!.axes[0].curves[0].three!.planes!;
  ok(pl.length === 2 && pl[0].z === 10 && pl[1].z === 2, '3D stacked maps: my list drawn at its heights');
}

{
  // Measures on the data: a Gaussian's width at half height (2√(2 ln 2)·σ), a dip's depth over the line between the ends,
  // the extremum between two points (a parabola), crossings, Y at X, area, centroid; the formulas of Curve math (a
  // plasmon dip's shift over Δn) and Peak width (a row per run and region, the minimum and maximum)
  const g = (c: number, s: number, a: number, base: number, step: number, x0 = 0, x1 = 10) => {
    const x: number[] = [];
    for (let v = x0; v <= x1 + 1e-9; v += step) x.push(+v.toFixed(6));
    return { x, y: x.map((v) => base + a * Math.exp(-((v - c) ** 2) / (2 * s * s))) };
  };
  const pk = peakWidth(g(5, 1, 1, 0, 0.01), 'auto', { kind: 'line' });
  const dp = peakWidth(g(5, 1, -0.8, 1, 0.01), 'auto', { kind: 'line' });
  ok(pk.kind === 'peak' && Math.abs(pk.fwhm - 2.35482) < 2e-3 && Math.abs(pk.x - 5) < 1e-6 && dp.kind === 'dip' && Math.abs(dp.fwhm - 2.35482) < 2e-3 && Math.abs(dp.height + 0.8) < 1e-3 && Math.abs(dp.y - 0.2) < 1e-3, `Peak width: a Gaussian peak and dip, FWHM = 2.3548σ (${pk.fwhm.toFixed(5)}, ${dp.fwhm.toFixed(5)})`);
  const coarse = g(5.07, 1, -1, 1, 0.3);
  const ex = extremum(coarse, 'min');
  ok(Math.abs(ex.x - 5.07) < 0.01 && Math.abs(ex.y) < 0.01, `the minimum between the points, refined by a parabola (${ex.x.toFixed(4)})`);
  const half = peakWidth(g(9.5, 1, 1, 0, 0.05), 'peak', { kind: 'zero' }, 6, 10);
  ok(!Number.isNaN(half.left) && Number.isNaN(half.right) && half.why === 'half height not reached on the right', 'Peak width: a side that does not reach half the height — empty, said');
  const lin = { x: [0, 1, 2], y: [0, 1, 2] };
  ok(xAtLevel(lin, 1.5) === 1.5 && yAtX(lin, 0.25) === 0.25 && area(lin) === 2 && Math.abs(centroid({ x: [0, 1, 2], y: [1, 1, 1] }) - 1) < 1e-12 && Number.isNaN(xAtLevel(lin, 5)), 'measures: X at a level, Y at X, the area, the centroid');
  const A = { name: 'n = 1.333', xName: 'λ (nm)', ...g(600, 8, -0.7, 1, 0.5, 500, 700) };
  const B = { name: 'n = 1.345', xName: 'λ (nm)', ...g(612, 8, -0.7, 1, 0.5, 500, 700) };
  const fr = curveFormulas([A, B], 'dA = xmin(A)\ndB = xmin(B)\nS = (dB − dA) / (1.345 − 1.333)\nw = fwhmdip(A, 560, 640)');
  ok(typeof fr !== 'string' && fr.names.join() === 'dA,dB,S,w' && Math.abs(fr.values[2] - 1000) < 1e-6 && Math.abs(fr.values[3] - 2.35482 * 8) < 0.02, `Curve math formula: the sensitivity of a dip, its width (${typeof fr === 'string' ? fr : fr.values.map((v) => v.toFixed(3))})`);
  ok(curveFormulas([A, B], 'A = 1') === 'Line 1: “A” is a curve; give the result another name.' && typeof curveFormulas([A, B], 'x = foo(A)') === 'string', 'Curve math formula: a result named as a curve, an unknown function — said');
  // the node: two dips in one table, one region round each; min and max of every region
  const lines = ['λ (nm);R1;R2'];
  for (let v = 500; v <= 700; v += 1) lines.push(`${v};${(1 - 0.6 * Math.exp(-((v - 560) ** 2) / 50) - 0.4 * Math.exp(-((v - 650) ** 2) / 72)).toFixed(6)};${(1 - 0.5 * Math.exp(-((v - 570) ** 2) / 50)).toFixed(6)}`);
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: lines.join('\n'), textId: 'pw' } } as AppNode;
  const pw = { id: 'w', type: 'peakwidth', position: { x: 0, y: 0 }, data: { ...PEAKWIDTH_DEFAULTS, regions: [{ lo: 520, hi: 610 }, { lo: 615, hi: 690 }] } } as AppNode;
  const res = evaluateGraph([imp, pw], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in' }]).get('w')!;
  const t = res.outputs.out?.t === 'dataset' ? res.outputs.out.v.columns : [];
  const col = (nm: string) => t.find((c) => c.name === nm)!;
  ok(t.length > 0 && col('FWHM').values.length === 4 && Math.abs(col('FWHM').values[0] - 2.35482 * 5) < 0.05 && Math.abs(col('FWHM').values[1] - 2.35482 * 6) < 0.1 && Math.abs(col('X at min').values[0] - 560) < 0.05 && col('min').values[2] < 0.51 && col('max').values[0] > 0.99 && col('curve').text!.join() === 'R1,R1,R2,R2', `Peak width: a row per run and region — FWHM, min and max (${t.length ? Array.from(col('FWHM').values, (v) => v.toFixed(2)) : 'none'})`);
  ok(t.length > 0 && Array.from(col('points').values).join() === '91,76,91,76' && Math.abs(col('% of points').values[0] - (100 * 91) / 201) < 1e-9, 'Peak width: the points in every region and their % of the curve');
}

// ---- Baselines against numpy / scipy (scripts/fixtures/baseline-ref.py → baseline-ref.json) ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/baseline-ref.json', import.meta.url), 'utf8'));
  const dev = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const refs: [string, number[]][] = [
    ['poly3', baselineOf('poly', R.x, R.y, { order: 3 })],
    ['asls', baselineOf('asls', R.x, R.y, { lambda: 5, p: 0.01 })],
    ['airpls', baselineOf('airpls', R.x, R.y, { lambda: 5 })],
    ['snip', baselineOf('snip', R.x, R.y, { width: 12 })],
    ['shirley', baselineOf('shirley', R.x, R.y, { ends: 4 })],
    ['tougaard', baselineOf('tougaard', R.x, R.y, { ends: 4 })],
  ];
  for (const [name, b] of refs) ok(dev(b, R[name]) < 1e-7, `baseline ${name}: as NumPy / SciPy (${dev(b, R[name]).toExponential(1)})`);
  // the true background found under the peaks (within the noise and the tails); the dips: the same, mirrored
  ok(dev(refs[1][1], R.bg) < 2 && dev(refs[2][1], R.bg) < 1 && dev(refs[0][1], R.bg) < 1.5, 'baselines: asymmetric least squares, airPLS, the polynomial find the background under the peaks');
  const neg = R.y.map((v: number) => -v);
  ok(dev(baselineOf('asls', R.x, neg, { under: 'dips' }).map((v) => -v), refs[1][1]) < 1e-9 && dev(baselineOf('rubber', R.x, neg, { under: 'dips' }).map((v) => -v), baselineOf('rubber', R.x, R.y)) < 1e-12, 'baselines: over the dips — the same as under the peaks, mirrored');
  // Shirley on a photoelectron peak with a step: it meets the two levels, rises through the peak only, stays under the data
  const xs = Array.from({ length: 201 }, (_, i) => 280 + i * 0.05);
  const pk = xs.map((x) => 100 * Math.exp(-(((x - 285) / 0.6) ** 2)));
  const cum = pk.map((_, i) => pk.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const ys = xs.map((_, i) => 10 + (20 * cum[i]) / cum[cum.length - 1] + pk[i]);
  const sh = baselineOf('shirley', xs, ys, { ends: 3 });
  const rising = sh.every((v, i) => i === 0 || v >= sh[i - 1] - 1e-9);
  ok(Math.abs(sh[0] - ys.slice(0, 3).reduce((a, b) => a + b) / 3) < 1e-9 && Math.abs(sh[200] - ys.slice(-3).reduce((a, b) => a + b) / 3) < 1e-9 && rising && sh.every((v, i) => v <= ys[i] + 1e-9) && Math.abs(sh[100] - 20) < 1.5, `baseline Shirley: from one level to the other through the peak (${sh[100].toFixed(2)} at the centre)`);
  const tg = baselineOf('tougaard', xs, ys, { ends: 3, c: 1643 });
  const tgDown = baselineOf('tougaard', xs.map((v) => -v).reverse(), ys.slice().reverse(), { ends: 3, losses: 'down' }).reverse();
  ok(Math.abs(tg[200] - sh[200]) < 1e-9 && Math.abs(tg[0] - sh[0]) < 1e-9 && dev(tg, tgDown) < 1e-9, 'baseline Tougaard: from the start level to the far end; the losses toward a lower X: the same, mirrored');
  // the simple ones as before: the line between the first and last points of the range (Integrate, Peak width), the
  // means of a few end points when asked
  const rows = Array.from({ length: 21 }, (_, i) => i);
  const xq = rows.map((i) => i / 2);
  const yq = xq.map((x) => 1 + 0.5 * x + Math.exp(-((x - 5) ** 2)));
  const plain = integrate(xq, yq, rows, { area: 'signed', baseline: 'line', base: 0 });
  const line = (x: number) => yq[0] + ((yq[20] - yq[0]) * x) / 10;
  ok(rows.every((i) => Math.abs(plain.baseAt(i) - line(xq[i])) < 1e-12) && integrate(xq, yq, rows, { area: 'signed', baseline: 'line', base: 0, opts: { ends: 3 } }).baseAt(0) !== plain.baseAt(0), 'Integrate: the line between the ends as before; the ends averaged when asked');
  const pa = integrate(xq, yq, rows, { area: 'signed', baseline: 'asls', base: 0, opts: { lambda: 3 } });
  ok(Math.abs(pa.area - Math.sqrt(Math.PI)) < 0.15, `Integrate: the area over an asymmetric-least-squares baseline (${pa.area.toFixed(4)}, √π = 1.7725)`);
  // Peak width over a found baseline and over points placed by hand
  const wl = peakWidth({ x: R.x, y: R.y }, 'peak', { kind: 'asls', opts: { lambda: 5 } }, 12, 38);
  ok(Math.abs(wl.x - 25) < 0.2 && Math.abs(wl.height - 30) < 1 && Math.abs(wl.fwhm - 2.35482 * 2.5) < 0.2, `Peak width: a Gaussian over an ALS baseline (height ${wl.height.toFixed(2)}, FWHM ${wl.fwhm.toFixed(3)})`);
  const wp = peakWidth({ x: xq, y: yq }, 'peak', { kind: 'points', curve: (x) => 1 + 0.5 * x });
  ok(Math.abs(wp.height - 1) < 0.02 && Math.abs(wp.fwhm - 2 * Math.sqrt(Math.LN2)) < 0.06, `Peak width: over a baseline of points (${wp.fwhm.toFixed(4)})`);
  // the nodes: Peak analyzer under ALS (the found peaks measured over it); Peak width over another column
  const lines = ['x;y;b'];
  R.x.forEach((x: number, i: number) => lines.push(`${x};${R.y[i]};${R.bg[i]}`));
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: lines.join('\n'), textId: 'bl' } } as AppNode;
  const pkN = { id: 'p', type: 'peaks', position: { x: 0, y: 0 }, data: { ...PEAK_DEFAULTS, ys: 'y', baseline: 'asls', baseOpt: { lambda: 5 }, find: { ...PEAK_DEFAULTS.find, count: 3 } } } as AppNode;
  const pwN = { id: 'w', type: 'peakwidth', position: { x: 0, y: 0 }, data: { ...PEAKWIDTH_DEFAULTS, ys: 'y', base: 'curve', baseColumn: 'b', regions: [{ lo: 15, hi: 35 }] } } as AppNode;
  const e = (t: string) => ({ id: `e${t}`, source: 'i', sourceHandle: 'out', target: t, targetHandle: 'in' });
  const out = evaluateGraph([imp, pkN, pwN], [e('p'), e('w')]);
  const pr = out.get('p')!;
  const base = pr.outputs.base?.t === 'dataset' ? pr.outputs.base.v.columns[1].values : new Float64Array();
  const tab = pr.outputs.table?.t === 'dataset' ? pr.outputs.table.v.columns : [];
  const hts = Array.from(tab.find((c) => c.name === 'height')?.values ?? []);
  // (the Lorentzian's long tails lift the baseline under it a little)
  const hs = [...hts].sort((a, b) => a - b);
  ok(base.length === 240 && dev(Array.from(base), R.bg) < 2 && hs.length === 3 && Math.abs(hs[0] - 18) < 1 && Math.abs(hs[1] - 30) < 1 && Math.abs(hs[2] - 40) < 6, `Peak analyzer: the peaks measured over an ALS baseline (heights ${hts.map((v) => v.toFixed(1))})`);
  const wr = out.get('w')!;
  const wt = wr.outputs.out?.t === 'dataset' ? wr.outputs.out.v.columns : [];
  const hh = wt.find((c) => c.name === 'height')?.values[0] ?? NaN;
  ok(Math.abs(hh - 30) < 0.6 && !wr.errors?.length, `Peak width: the height over another column (${hh.toFixed(3)})`);
}

// ---- Peak shapes against scipy (scripts/fixtures/peakshape-ref.py → peakshape-ref.json); constraints; doublets ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/peakshape-ref.json', import.meta.url), 'utf8'));
  let worst = 0;
  for (const [x, y, re, im] of R.w) {
    const [a, b] = faddeeva(x, y);
    worst = Math.max(worst, Math.hypot(a - re, b - im) / Math.hypot(re, im));
  }
  ok(worst < 1e-11, `Faddeeva w(z) over the upper half plane as SciPy (relative ${worst.toExponential(1)})`);
  const pw = Object.entries(R.prof as Record<string, number[]>).map(([k, v]) => {
    const [s, g] = k.split('_').map(Number);
    return Math.max(...R.grid.map((x: number, i: number) => Math.abs(voigtProfile(x, s, g) - v[i]) / Math.max(v[i], 1e-300)));
  });
  ok(Math.max(...pw) < 1e-8, `the Voigt profile as SciPy's voigt_profile (${Math.max(...pw).toExponential(1)})`);
  ok(near(voigtFwhm(2, 0), 2, 1e-12) && near(voigtFwhm(0, 2), 2, 1e-12) && Math.abs(voigtFwhm(1, 1) - (0.5346 + Math.sqrt(0.2166 + 1))) < 2e-3, 'the FWHM of a Voigt: Gaussian, Lorentzian, both (Olivero)');
  const dsF = FIT_LIBRARY.doniach.f;
  const ctx0 = { energy: false, xref: 0, run: 1 };
  const dsDev = Math.max(...R.grid.map((x: number, i: number) => Math.abs(dsF(x, [0, 1, 0.5, 2.4, 0.2], ctx0) - R.ds[i])));
  ok(dsDev < 1e-12, `Doniach–Šunjić as its formula (${dsDev.toExponential(1)})`);
  // a Voigt fitted: its two widths found again; its area A / V(0) as the integral of the peak
  const xs = Array.from({ length: 301 }, (_, i) => -15 + i * 0.1);
  const truth = [0.2, 50, 0.3, 1.6, 0.9];
  const vf = FIT_LIBRARY.voigtexact.f;
  const ys = xs.map((x, i) => vf(x, truth, ctx0) + 0.01 * Math.sin(i * 1.7));
  const vm = buildModel({ kind: 'library', model: 'voigtexact', degree: 1, formula: '', shape: 'gauss', count: 1, baseline: 'none' });
  const vr = typeof vm === 'string' ? null : runFitsT(vm, [], [{ label: 'v', value: 1, xs, ys, sig: xs.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: 0 } }).runs[0];
  const vp = vr?.params.map((q) => q.value) ?? [];
  ok(!!vr && truth.every((t, j) => Math.abs(vp[j] - t) < 0.02 * Math.max(1, Math.abs(t))), `Voigt fitted: y0, A, xc, wG, wL found again (${vp.map((v) => v.toFixed(3))})`);
  const pk = fittedPeak('voigtx', [2, 1, 1.2, 0.7], 0, xs);
  let num = 0;
  for (let i = 0; i < 20000; i++) {
    const x = -400 + i * 0.04;
    num += 0.04 * 2 * voigtProfile(x - 1, 1.2 / (2 * Math.sqrt(2 * Math.LN2)), 0.35) / voigtProfile(0, 1.2 / (2 * Math.sqrt(2 * Math.LN2)), 0.35);
  }
  ok(Math.abs(pk.area - num) < 2e-3 * num && near(pk.fwhm, voigtFwhm(1.2, 0.7), 1e-12), `Voigt peak: its area and FWHM (${pk.area.toFixed(5)} vs ${num.toFixed(5)})`);
  // constraints: two Gaussians, the second at xc1 + 3, its width the same, its height half — fitted with 4 free
  // parameters; the errors of the linked ones from the others (xc2 as xc1, A2 half of A1's)
  const gm = buildModel({ kind: 'peaks', model: '', degree: 1, formula: '', shape: 'gauss', count: 2, baseline: 'none' });
  const gx = Array.from({ length: 201 }, (_, i) => i * 0.1);
  const gy = gx.map((x, i) => 4 * Math.exp((-4 * Math.LN2 * (x - 8) ** 2) / 4) + 2 * Math.exp((-4 * Math.LN2 * (x - 11) ** 2) / 4) + 0.02 * Math.cos(i * 2.3));
  const pl = parseLinks('xc2 = xc1 + 3; w2 = w1\nA2 = 0.5*A1', ['A1', 'xc1', 'w1', 'A2', 'xc2', 'w2']);
  const specs = ['A1', 'xc1', 'w1', 'A2', 'xc2', 'w2'].map((name) => ({ name, value: NaN, fixed: false, min: NaN, max: NaN, shared: false, ...(pl.links[name] ? { link: pl.links[name] } : {}) }));
  const lr = typeof gm === 'string' ? null : runFitsT(gm, specs, [{ label: 'g', value: 1, xs: gx, ys: gy, sig: gx.map(() => 1) }], { global: false, band: 'confidence', points: 50, ctx: { energy: false, xref: 10 } }).runs[0];
  const P = Object.fromEntries((lr?.params ?? []).map((q) => [q.name, q]));
  ok(!!lr && Math.abs(P.xc1.value - 8) < 0.01 && Math.abs(P.xc2.value - 11) < 1e-12 + 0.01 && near(P.xc2.value - P.xc1.value, 3, 1e-12) && near(P.w2.value, P.w1.value, 1e-15) && near(P.A2.value, 0.5 * P.A1.value, 1e-12) && !!P.A2.linked && lr.stats.dof === 201 - 3, `constraints: xc2 = xc1 + 3, w2 = w1, A2 = 0.5·A1 kept, 3 free parameters (${lr ? [P.A1.value, P.xc1.value, P.w1.value].map((v) => v.toFixed(4)) : ''})`);
  ok(!!lr && near(P.xc2.error, P.xc1.error, 1e-5) && near(P.A2.error, 0.5 * P.A1.error, 1e-5) && P.A1.error > 0 && !!lr.curve.band, 'constraints: the errors of the linked parameters propagated, the band drawn');
  const bad = parseLinks('q = 1; A2 = foo*2; = 3; A1 = A2 +', ['A1', 'A2']);
  ok(bad.errors.length === 4 && !Object.keys(bad.links).length, `constraints: lines that do not read — said (${bad.errors.length})`);
  const circ = runFitsT(gm as Exclude<typeof gm, string>, [{ name: 'w1', value: NaN, fixed: false, min: NaN, max: NaN, shared: false, link: 'w2' }, { name: 'w2', value: NaN, fixed: false, min: NaN, max: NaN, shared: false, link: 'w1' }], [{ label: 'g', value: 1, xs: gx, ys: gy, sig: gx.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: 10 } });
  ok(circ.warnings.some((w) => w.includes('circle')) && circ.runs.length === 1, 'constraints in a circle: left free, said');
  // Peak analyzer: a spin–orbit doublet (2p: 1.5 apart, half the area) over a constant, fitted as one peak with its partner
  const lines = ['BE (eV);I'];
  for (let i = 0; i <= 300; i++) {
    const x = 280 + i * 0.03;
    lines.push(`${x.toFixed(3)};${(10 + 100 * Math.exp((-4 * Math.LN2 * (x - 284) ** 2) / 0.81) + 50 * Math.exp((-4 * Math.LN2 * (x - 285.5) ** 2) / 0.81) + 0.3 * Math.sin(i)).toFixed(4)}`);
  }
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: lines.join('\n'), textId: 'db' } } as AppNode;
  const pkN = { id: 'p', type: 'peaks', position: { x: 0, y: 0 }, data: { ...PEAK_DEFAULTS, baseline: 'constant', fit: true, peaks: [{ shape: 'gauss', x: 283.8, doublet: { dx: 1.5, ratio: 0.5 } }] } } as AppNode;
  const pr = evaluateGraph([imp, pkN], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'in' }]).get('p')!;
  const tc = pr.outputs.table?.t === 'dataset' ? pr.outputs.table.v.columns : [];
  const col = (nm: string) => Array.from(tc.find((c) => c.name === nm)?.values ?? []);
  ok(col('center').length === 2 && Math.abs(col('center')[0] - 284) < 0.01 && near(col('center')[1] - col('center')[0], 1.5, 1e-9) && near(col('area')[1], 0.5 * col('area')[0], 1e-9) && near(col('FWHM')[1], col('FWHM')[0], 1e-12) && Math.abs(col('FWHM')[0] - 0.9) < 0.01 && Number.isNaN(col('doublet of')[0]) && col('doublet of')[1] === 1, `Peak analyzer: a doublet fitted — its partner at ΔX, half the area, the same width (${col('center').map((v) => v.toFixed(3))})`);
}

// ---- Math column: presets, errors carried; using a fit: Y at X, X from Y, LOD / LOQ, derived values ----
{
  // every preset reads, and uses only inputs and the functions of whole columns
  const badP = MATH_PRESETS.filter((p) => {
    const c = compileExpr(p.formula.replace(/\b(mean|median|sd|sum|min|max|count|first|last)\(\s*([A-Z])\s*\)/g, '__$1_$2'));
    return typeof c === 'string' || c.names.some((v) => !/^[A-Z]$/.test(v) && !v.startsWith('__'));
  });
  ok(MATH_PRESETS.length >= 25 && !badP.length, `Math column presets: all read (${badP.map((p) => p.label).join('; ')})`);
  // A·B with A ± 0.1 and B ± 2 %: σ² = (B·0.1)² + (A·0.02·B)²
  const gA = { id: 'a', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, name: 'A', mode: 'formula', formula: 'i', count: 3 } } as AppNode;
  const gB = { id: 'b', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, name: 'B', mode: 'formula', formula: '10*i', count: 3 } } as AppNode;
  const mc = { id: 'm', type: 'mathcol', position: { x: 0, y: 0 }, data: { ...MATHCOL_DEFAULTS, formula: 'A*B', name: 'P', errors: 'A ± 0.1; B ± 2%' } } as AppNode;
  const mv = { id: 'v', type: 'mathcol', position: { x: 0, y: 0 }, data: { ...MATHCOL_DEFAULTS, formula: 'mean(A)/2', output: 'value', errors: 'A ± 0.3' } } as AppNode;
  const ed = (s: string, h: string, t: string) => ({ id: `${s}${t}${h}`, source: s, sourceHandle: 'out', target: t, targetHandle: h });
  const ge = evaluateGraph([gA, gB, mc, mv], [ed('a', 'in-0', 'm'), ed('b', 'in-1', 'm'), ed('a', 'in-0', 'v')]);
  const mr = ge.get('m')!;
  const er = mr.outputs.err?.t === 'column' ? Array.from(mr.outputs.err.v.values) : [];
  const want = [1, 2, 3].map((a) => Math.hypot(10 * a * 0.1, a * 0.02 * 10 * a));
  ok(er.length === 3 && er.every((v, i) => Math.abs(v - want[i]) < 1e-7 * want[i]) && mr.outputs.err?.t === 'column' && mr.outputs.err.v.name === 'P error', `Math column: the errors of A and B carried to A·B (${er.map((v) => v.toFixed(4))})`);
  ok(ge.get('v')!.outputs.err?.t === 'scalar' && ge.get('v')!.warnings?.some((w) => w.includes('not in the formula')) === true, 'Math column: an error of an input the formula does not use (only its mean) — said');
  // a straight-line calibration: the textbook formulas — Y at X: t·s·√(1/n + (x − x̄)²/Sxx) (+1 for a prediction);
  // X from Y: (s/b)·√(1/m + 1/n + (y0 − ȳ)²/(b²·Sxx)); LOD = 3.3·s/b
  const xs = [0, 1, 2, 4, 6, 8, 10];
  const ys = xs.map((x, i) => 0.05 + 0.31 * x + [0.01, -0.02, 0.015, -0.005, 0.02, -0.012, 0.004][i]);
  const lm = buildModel({ kind: 'library', model: 'linear', degree: 1, formula: '', shape: 'gauss', count: 1, baseline: 'none' }) as Exclude<ReturnType<typeof buildModel>, string>;
  const fr = runFitsT(lm, [], [{ label: 'cal', value: 1, xs, ys, sig: xs.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: 5 } }).runs[0];
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const Sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / Sxx;
  const a0 = my - b * mx;
  const s = Math.sqrt(ys.reduce((acc, y, i) => acc + (y - a0 - b * xs[i]) ** 2, 0) / (n - 2));
  const t = tQuantile(0.975, n - 2);
  const u = applyFit(lm, fr, { energy: false, xref: 5, run: 1 }, { at: '5', inverse: '1.5', replicates: 3, lod: true, derived: 'x0 = -a/b' });
  const row = (w: string) => u.rows.find((q) => q.what === w)!;
  const ya = row('y at x');
  const ci = t * s * Math.sqrt(1 / n + (5 - mx) ** 2 / Sxx);
  const pi = t * s * Math.sqrt(1 + 1 / n + (5 - mx) ** 2 / Sxx);
  ok(near(ya.value, a0 + 5 * b, 1e-9) && near(ya.hi - ya.value, ci, 1e-5) && near(ya.phi! - ya.value, pi, 1e-5), `use the fit: Y at X with its confidence and prediction intervals (± ${(ya.hi - ya.value).toFixed(5)} / ${ci.toFixed(5)})`);
  const xi = row('x from y');
  const sx0 = (s / b) * Math.sqrt(1 / 3 + 1 / n + (1.5 - my) ** 2 / (b * b * Sxx));
  ok(near(xi.value, (1.5 - a0) / b, 1e-9) && near(xi.error, sx0, 1e-5) && near(xi.hi - xi.value, t * sx0, 1e-5), `use the fit: X from Y (3 replicates) as the calibration formula (${xi.value.toFixed(5)} ± ${xi.error.toFixed(5)} / ${sx0.toFixed(5)})`);
  ok(near(row('LOD').value, (3.3 * s) / b, 1e-6) && near(row('LOQ').value, (10 * s) / b, 1e-6), 'use the fit: LOD = 3.3·s/b, LOQ = 10·s/b');
  // x0 = −a/b: its error from the covariance (var a, var b, cov ab)
  const va = s * s * (1 / n + (mx * mx) / Sxx);
  const vb = (s * s) / Sxx;
  const cab = (-mx * s * s) / Sxx;
  const sd0 = Math.sqrt(va / b ** 2 + (a0 * a0 * vb) / b ** 4 - (2 * a0 * cab) / b ** 3);
  const dv = row('derived');
  ok(dv.name === 'x0' && near(dv.value, -a0 / b, 1e-9) && near(dv.error, sd0, 1e-5), `use the fit: a derived value and its error from the covariance (${dv.error.toExponential(4)} / ${sd0.toExponential(4)})`);
  const far = applyFit(lm, fr, { energy: false, xref: 5, run: 1 }, { inverse: '99' });
  ok(Number.isNaN(far.rows[0].value) && far.warnings.some((w) => w.includes('does not reach')), 'use the fit: a Y the model does not reach — said');
}

// ---- The advanced fit: the new models found again from their own data, errors of X, equations, reconvolution,
// surfaces ----
{
  const c1 = { energy: false, xref: 0, run: 1 };
  const spec0 = (name: string, value = NaN, fixed = false) => ({ name, value, fixed, min: NaN, max: NaN, shared: false });
  // every new library model: data made by it (a little noise), fitted from its own guess — the parameters found again
  const cases: [string, number[], [number, number]][] = [
    ['gaussArea', [1, 20, 5, 2], [0, 10]],
    ['lorentzArea', [0.5, 30, 4, 1.5], [0, 10]],
    ['pearson7', [0.2, 10, 5, 1.5, 2.5], [0, 10]],
    ['lognormal', [0.1, 5, 3, 0.4], [0.5, 12]],
    ['erfStep', [1, 4, 5, 0.6], [0, 10]],
    ['hyperbola', [2, 5], [0.5, 10]],
    ['expdec3', [0.5, 6, 0.3, 4, 2, 2, 12], [0, 40]],
    ['expassoc', [1, 5, 2], [0, 15]],
    ['kww', [0.2, 5, 3, 0.6], [0, 20]],
    ['avrami', [1, 0.02, 2.5], [0, 10]],
    ['gompertz', [0.5, 8, 0.9, 4], [0, 10]],
    ['logistic5', [10, 1, 3, 2, 0.7], [0.1, 20]],
    ['michaelis', [12, 3], [0, 30]],
    ['langmuir', [5, 0.4], [0, 25]],
    ['freundlich', [2, 2.5], [0.1, 20]],
    ['arrhenius', [1e8, 5e4], [280, 400]],
    ['vft', [0.01, 800, 150], [250, 400]],
    ['curieWeiss', [3, 10, 0.001], [30, 300]],
    ['planck', [2, 3000], [300, 3000]],
    ['sine', [1, 2, 0.5, 3], [0, 10]],
  ];
  const off: string[] = [];
  for (const [id, truth, [a, b]] of cases) {
    const def = FIT_LIBRARY[id];
    if (!def) {
      off.push(`${id}: missing`);
      continue;
    }
    const xs = Array.from({ length: 120 }, (_, i) => a + ((b - a) * i) / 119);
    const y0 = xs.map((x) => def.f(x, truth, c1));
    const amp = Math.max(...y0.map(Math.abs)) || 1;
    const ys = y0.map((v, i) => v + 1e-4 * amp * Math.sin(i * 1.7));
    const m = buildModel({ kind: 'library', model: id, degree: 1, formula: '', shape: 'gauss', count: 1, baseline: 'none' }) as Exclude<ReturnType<typeof buildModel>, string>;
    const r = runFitsT(m, [], [{ label: id, value: 1, xs, ys, sig: xs.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: (a + b) / 2 } }).runs[0];
    const fitted = r ? xs.map((x) => def.f(x, r.params.map((q) => q.value), c1)) : [];
    const dev = r ? Math.max(...fitted.map((v, i) => Math.abs(v - y0[i]))) / amp : Infinity;
    if (!(dev < 2e-3)) off.push(`${id} (${dev.toExponential(1)})`);
  }
  ok(!off.length, `the new library models fitted to their own data from their own guess (${cases.length}): ${off.join(', ') || 'all found'}`);
  // errors of X: a straight line by effective variance = York
  const lx = [0.0, 0.9, 1.8, 2.6, 3.3, 4.4, 5.2, 6.1, 6.5, 7.4];
  const ly = [5.9, 5.4, 4.4, 4.6, 3.5, 3.7, 2.8, 2.8, 2.4, 1.5];
  const wx = [1000, 1000, 500, 800, 200, 80, 60, 20, 1.8, 1];
  const wy = [1, 1.8, 4, 8, 20, 20, 70, 70, 100, 500];
  const sxs = wx.map((w) => 1 / Math.sqrt(w));
  const sys = wy.map((w) => 1 / Math.sqrt(w));
  const yl = yorkLine(lx, ly, sxs, sys);
  const lin = buildModel({ kind: 'library', model: 'linear', degree: 1, formula: '', shape: 'gauss', count: 1, baseline: 'none' }) as Exclude<ReturnType<typeof buildModel>, string>;
  const ev = runFitsT(lin, [], [{ label: 'york', value: 1, xs: lx, ys: ly, sig: sys, sx: sxs }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: 0 }, xerr: true }).runs[0];
  ok(typeof yl !== 'string' && !!ev && Math.abs(ev.params[0].value - yl.a) < 1e-5 && Math.abs(ev.params[1].value - yl.b) < 1e-6 && Math.abs(ev.params[1].value - -0.4805) < 2e-3, `errors of X: a straight line by effective variance as York's (Pearson's data: b = ${ev?.params[1].value.toFixed(5)}, York ${typeof yl === 'string' ? yl : yl.b.toFixed(5)})`);
  // equations: A → B → C, B measured — its analytic solution
  const om = odeModel('dA/dt = -k1*A; dB/dt = k1*A - k2*B; A(0) = A0; B(0) = 0; y = B') as Exclude<ReturnType<typeof odeModel>, string>;
  const exactB = (t: number) => ((2 * 0.7) / (0.2 - 0.7)) * (Math.exp(-0.7 * t) - Math.exp(-0.2 * t));
  const tx = Array.from({ length: 60 }, (_, i) => i * 0.4);
  const odeDev = Math.max(...tx.map((t) => Math.abs(om.f(t, [0.7, 0.2, 2], c1) - exactB(t))));
  const of = runFitsT(om, [spec0('k1', 1), spec0('k2', 0.1), spec0('A0')], [{ label: 'ode', value: 1, xs: tx, ys: tx.map((t, i) => exactB(t) + 0.002 * Math.sin(i * 1.3)), sig: tx.map(() => 1) }], { global: false, band: 'confidence', points: 100, ctx: { energy: false, xref: 0 } }).runs[0];
  const op = of?.params.map((q) => q.value) ?? [];
  ok(odeDev < 1e-6 && Math.abs(op[0] - 0.7) < 0.01 && Math.abs(op[1] - 0.2) < 0.005 && Math.abs(op[2] - 2) < 0.01 && !!of?.curve.band, `equations: A → B → C solved (${odeDev.toExponential(1)}) and fitted (k1 ${op[0]?.toFixed(4)}, k2 ${op[1]?.toFixed(4)}, A0 ${op[2]?.toFixed(4)})`);
  ok(typeof odeModel('dA/dx = -k*A') === 'string' && typeof odeModel('dA/dx = -k*A; dB/dx = A; A(0) = 1; B(0) = 0') === 'string' && typeof odeModel('dy/dx = -2*x*y; y(1) = c') !== 'string', 'equations: a missing start, what is measured with two — said; a start elsewhere than 0');
  // reconvolution: a Gaussian IRF and an exponential decay — the analytic convolution; τ, the shift and the background found
  const [s, mu, tau, A] = [0.1, 1, 0.8, 1000];
  const ix = Array.from({ length: 500 }, (_, i) => i * 0.02);
  const iy = ix.map((t) => Math.exp(-((t - mu) ** 2) / (2 * s * s)));
  const conv = (t: number) => (A / 2) * Math.exp((s * s) / (2 * tau * tau) - (t - mu) / tau) * erfcT(((s * s) / tau - (t - mu)) / (s * Math.SQRT2));
  const e1 = buildModel({ kind: 'library', model: 'expdec1', degree: 1, formula: '', shape: 'gauss', count: 1, baseline: 'none' }) as Exclude<ReturnType<typeof buildModel>, string>;
  const rm = reconvolved(e1, { x: ix, y: iy }, [0, 9.98], true) as Exclude<ReturnType<typeof reconvolved>, string>;
  const rcDev = Math.max(...[0.5, 0.9, 1, 1.2, 2, 4, 7].map((t) => Math.abs(rm.f(t, [0, A, tau, 0, 0], c1) - conv(t)) / A));
  const rf = runFitsT(rm, [spec0('y0', 0, true), spec0('A', 500), spec0('t', 0.5), spec0('shift', 0), spec0('bg', 0)], [{ label: 'tcspc', value: 1, xs: ix, ys: ix.map((t, i) => conv(t - 0.05) + 5 + 3 * Math.sin(i * 2.1)), sig: ix.map(() => 1) }], { global: false, band: 'none', points: 2, ctx: { energy: false, xref: 0 } }).runs[0];
  const rp = rf?.params.map((q) => q.value) ?? [];
  ok(rcDev < 2e-3 && Math.abs(rp[2] - 0.8) < 0.005 && Math.abs(rp[3] - 0.05) < 0.002 && Math.abs(rp[4] - 5) < 0.5 && Math.abs(rp[1] - 1000) < 10, `reconvolution: Gaussian IRF ⊗ exponential as the analytic one (${rcDev.toExponential(1)}); τ ${rp[2]?.toFixed(4)}, shift ${rp[3]?.toFixed(4)}, bg ${rp[4]?.toFixed(2)}`);
  // the Fit node: equations, reconvolution with the IRF of a column, a surface (a rotated 2-D Gaussian)
  const kin = ['t (s);B;IRF'];
  tx.forEach((t, i) => kin.push(`${t};${(exactB(t) + 0.002 * Math.sin(i * 1.3)).toFixed(6)};${Math.exp(-((t - 1) ** 2) / 0.02).toFixed(6)}`));
  const surfL = ['x;y;z'];
  for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) {
    const [x, y] = [i * 0.5, j * 0.5];
    const t = (30 * Math.PI) / 180;
    const [dx, dy] = [x - 3.4, y - 3.1];
    const u = dx * Math.cos(t) + dy * Math.sin(t);
    const v = -dx * Math.sin(t) + dy * Math.cos(t);
    surfL.push(`${x};${y};${(1 + 9 * Math.exp(-4 * Math.LN2 * ((u * u) / 4 + (v * v) / 1.44)) + 0.01 * Math.sin(i * 7 + j)).toFixed(6)}`);
  }
  const iK = { id: 'k', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: kin.join('\n'), textId: 'kin' } } as AppNode;
  const iS = { id: 's', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: surfL.join('\n'), textId: 'surf' } } as AppNode;
  const fO = { id: 'fo', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, ys: ['B'], model: { ...FIT_DEFAULTS.model, kind: 'ode', ode: 'dA/dt = -k1*A; dB/dt = k1*A - k2*B; A(0) = A0; B(0) = 0; y = B' }, params: [spec0('k1', 1), spec0('k2', 0.1)] } } as AppNode;
  const fS = { id: 'fs', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, surface: true, x: 'x', ys: ['y'], zcol: 'z', surfaceModel: 'gauss2d', derived: 'ratio = wx/wy' } } as AppNode;
  const eg = (s2: string, t: string) => ({ id: `e${t}`, source: s2, sourceHandle: 'out', target: t, targetHandle: 'in' });
  const go = evaluateGraph([iK, iS, fO, fS], [eg('k', 'fo'), eg('s', 'fs')]);
  const pv = (id: string, nm: string) => {
    const ds = go.get(id)!.outputs.params;
    return ds?.t === 'dataset' ? (ds.v.columns.find((c) => c.name === nm)?.values[0] ?? NaN) : NaN;
  };
  ok(Math.abs(pv('fo', 'k1') - 0.7) < 0.01 && Math.abs(pv('fo', 'A0') - 2) < 0.01, `the Fit node with equations (k1 ${pv('fo', 'k1').toFixed(4)})`);
  const sv = go.get('fs')!;
  const su = sv.view.fit?.use?.[0]?.[0];
  ok(Math.abs(pv('fs', 'xc') - 3.4) < 0.01 && Math.abs(pv('fs', 'yc') - 3.1) < 0.01 && Math.abs(Math.abs(pv('fs', 'wx')) - 2) < 0.02 && Math.abs(Math.abs(pv('fs', 'wy')) - 1.2) < 0.02 && Math.abs(((pv('fs', 'theta') % 180) + 180) % 180 - 30) < 0.5 && !!sv.view.fit?.surface && !!su && Math.abs(su.value - 2 / 1.2) < 0.02, `the Fit node: a surface — a rotated 2-D Gaussian found (xc ${pv('fs', 'xc').toFixed(3)}, θ ${pv('fs', 'theta').toFixed(2)}°, wx/wy ${su?.value.toFixed(3)})`);
}

// ---- Signals against scipy (scripts/fixtures/spectral-ref.py → spectral-ref.json): PSD, coherence, spectrogram,
// Hilbert, IIR filters, Allan deviation; wavelets by their properties; correlation; the response to a step ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/spectral-ref.json', import.meta.url), 'utf8'));
  const rel = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]) / Math.max(1e-12, Math.abs(b[i]))));
  const ab = (a: number[], b: number[]) => (a.length === b.length ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : Infinity);
  const w1 = Spc.welch(R.x, R.fs, { nperseg: 128, overlap: 0.5, window: 'hann', detrend: 'constant', scaling: 'density' });
  const w2 = Spc.welch(R.x, R.fs, { nperseg: 100, overlap: 0.25, window: 'hamming', detrend: 'linear', scaling: 'spectrum' });
  ok(w1.f.length === R.welch.f.length && rel(w1.p, R.welch.p) < 1e-10 && rel(w2.p, R.welch2.p) < 1e-10 && ab(w1.f, R.welch.f) < 1e-12, `Welch PSD as SciPy (density, Hann; spectrum, Hamming, linear detrend: ${rel(w2.p, R.welch2.p).toExponential(1)})`);
  const co = Spc.coherence(R.x, R.y, R.fs, { nperseg: 128, overlap: 0.5, window: 'hann', detrend: 'constant', scaling: 'density' });
  const sg = Spc.spectrogram(R.x, R.fs, { nperseg: 64, overlap: 0.5, window: 'hann', detrend: 'constant', scaling: 'density' });
  ok(ab(co.c, R.coh.c) < 1e-10 && ab(sg.t, R.spec.t) < 1e-12 && Math.max(...sg.p.map((row, i) => rel(row, R.spec.S[i]))) < 1e-10, 'coherence and spectrogram as SciPy');
  const hz = Spc.hilbert(R.x.slice(0, 257));
  ok(ab(hz.re, R.hilbert.re) < 1e-10 && ab(hz.im, R.hilbert.im) < 1e-10, 'the analytic signal (Hilbert, odd length) as SciPy');
  const sos = [Spc.designSos('butter', 4, 'low', 0.2, 0), Spc.designSos('cheby1', 3, 'band', 0.1, 0.3, 1), Spc.designSos('butter', 5, 'high', 0.15, 0), Spc.designSos('cheby1', 4, 'stop', 0.2, 0.4, 0.5)];
  const resp = (s: number[][], w: number) => {
    let [mr, mi] = [1, 0];
    for (const [b0, b1, b2, a0, a1, a2] of s) {
      const nr = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w);
      const ni = -b1 * Math.sin(w) - b2 * Math.sin(2 * w);
      const dr = a0 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
      const di = -a1 * Math.sin(w) - a2 * Math.sin(2 * w);
      const dd = dr * dr + di * di;
      const [qr, qi] = [(nr * dr + ni * di) / dd, (ni * dr - nr * di) / dd];
      [mr, mi] = [mr * qr - mi * qi, mr * qi + mi * qr];
    }
    return Math.hypot(mr, mi);
  };
  const ws = [0.05, 0.1, 0.2, 0.3, 0.5, 0.8].map((v) => v * Math.PI);
  const rdev = Math.max(...(['b1', 'c2', 'b3', 'c4'] as const).map((k, j) => ab(ws.map((w) => resp(sos[j], w)), R.resp[k])));
  ok(rdev < 1e-10, `IIR design: Butterworth low / high pass, Chebyshev I band pass / stop — their responses as SciPy's (${rdev.toExponential(1)})`);
  const fdev = Math.max(ab(Spc.sosfiltfilt(sos[0], R.x), R.filt.butter_low_ff), ab(Spc.sosfilt(sos[1], R.x).y, R.filt.cheby_band_f), ab(Spc.sosfiltfilt(sos[2], R.x), R.filt.butter_high_ff), ab(Spc.sosfiltfilt(sos[3], R.x), R.filt.cheby_stop_ff));
  ok(fdev < 1e-10, `IIR filtering: causal and forward–backward (SciPy's padding) as sosfilt / sosfiltfilt (${fdev.toExponential(1)})`);
  const al = Spc.allanDeviation(R.allan.rate, R.allan.tau0, 'octave');
  ok(al.tau.length >= R.allan.ad.length && rel(al.adev.slice(0, R.allan.ad.length), R.allan.ad.map((q: number[]) => q[1])) < 1e-10, 'the overlapping Allan deviation of a rate as its formula (NumPy)');
  // white noise: the Allan deviation falls as τ^(−1/2)
  let sd = 7;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const white = Array.from({ length: 20000 }, () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));
  const aw = Spc.allanDeviation(white, 1, 'octave');
  const slope = (Math.log(aw.adev[6]) - Math.log(aw.adev[1])) / (Math.log(aw.tau[6]) - Math.log(aw.tau[1]));
  ok(Math.abs(slope + 0.5) < 0.06 && Math.abs(aw.adev[0] - 1) < 0.03, `Allan deviation of white noise: σ(τ0) = σ, slope −½ (${slope.toFixed(3)})`);
  // wavelets: orthonormal filters, their vanishing moments, the transform undone, the energy kept; denoising helps
  const props = Object.entries(WAVELETS).map(([k, w]) => {
    const h = w.h;
    const g = highPass(h);
    let e = Math.abs(h.reduce((a, b) => a + b, 0) - Math.SQRT2) + Math.abs(h.reduce((a, b) => a + b * b, 0) - 1);
    for (let m = 1; 2 * m < h.length; m++) e += Math.abs(h.reduce((a, v, i) => a + (i + 2 * m < h.length ? v * h[i + 2 * m] : 0), 0));
    for (let p = 0; p < h.length / 2; p++) e += Math.abs(g.reduce((a, v, i) => a + v * i ** p, 0)) / 100 ** p;
    const x = Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.3) + 0.1 * (i % 7));
    const c = dwt(x, k, 4);
    e += ab(idwt(c, k), x) + Math.abs(x.reduce((a, b) => a + b * b, 0) - c.flat().reduce((a, b) => a + b * b, 0)) / 100;
    return [k, e] as const;
  });
  ok(props.every(([, e]) => e < 1e-9), `wavelets (Haar, Daubechies 2, 4, Symlet 4): orthonormal, vanishing moments, undone exactly, energy kept (${props.map(([k, e]) => `${k} ${e.toExponential(0)}`).join(', ')})`);
  const clean = Array.from({ length: 512 }, (_, i) => Math.sin((2 * Math.PI * i) / 128) + (i > 300 ? 1 : 0));
  const noisy = clean.map((v) => v + 0.2 * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));
  const dn = waveletDenoise(noisy, 'db4', 5, 'soft');
  const rms = (a: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - clean[i]) ** 2, 0) / a.length);
  ok(rms(dn.y) < 0.6 * rms(noisy) && Math.abs(dn.threshold / (0.2 * Math.sqrt(2 * Math.log(512))) - 1) < 0.15, `wavelet denoising: the error halved, the threshold from the noise (${rms(noisy).toFixed(3)} → ${rms(dn.y).toFixed(3)})`);
  // the scalogram of a sine: the most power at its frequency
  const sine = Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 12 * i * 0.01));
  const cw = Spc.cwtMorlet(sine, 0.01, Array.from({ length: 60 }, (_, k) => 0.01 * 2 ** (k / 8)));
  const mp = cw.power.map((row) => row.slice(200, 800).reduce((s, v) => s + v, 0) / 600);
  const fpk = cw.freq[mp.indexOf(Math.max(...mp))];
  ok(Math.abs(fpk - 12) < 0.6, `Morlet scalogram: a 12 Hz sine at ${fpk.toFixed(2)} Hz`);
  // the nodes: a PSD (its peaks at 7 and 23), a Butterworth filter, wavelet smoothing, a cross-correlation (a delay of 0.25)
  const lines = ['t (s);x;y'];
  R.x.forEach((v: number, i: number) => lines.push(`${i / R.fs};${v};${i >= 25 ? R.x[i - 25] : 0}`));
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: lines.join('\n'), textId: 'sig' } } as AppNode;
  const ps = { id: 'ps', type: 'fft', position: { x: 0, y: 0 }, data: { ...FFT_DEFAULTS, ys: 'x', mode: 'psd', seg: 128 } } as AppNode;
  const bw = { id: 'bw', type: 'fft', position: { x: 0, y: 0 }, data: { ...FFT_DEFAULTS, ys: 'x', mode: 'filter', design: 'butter', order: 4, f1: 10 } } as AppNode;
  const sm = { id: 'sm', type: 'smooth', position: { x: 0, y: 0 }, data: { ...SMOOTH_DEFAULTS, ys: 'x', method: 'wavelet' } } as AppNode;
  const cr = { id: 'cr', type: 'convolve', position: { x: 0, y: 0 }, data: { ...CONV_DEFAULTS, ys: 'y', op: 'corr' } } as AppNode;
  const xcol = { id: 'xc', type: 'extract', position: { x: 0, y: 0 }, data: { ...EXTRACT_DEFAULTS, column: 'x' } } as AppNode;
  const sp = { id: 'sp', type: 'fft', position: { x: 0, y: 0 }, data: { ...FFT_DEFAULTS, ys: 'x', mode: 'spectrogram', seg: 64 } } as AppNode;
  const ed = (t: string, h = 'in', s = 'i') => ({ id: `e${t}${h}`, source: s, sourceHandle: 'out', target: t, targetHandle: h });
  const go = evaluateGraph([imp, ps, bw, sm, cr, xcol, sp], [ed('ps'), ed('bw'), ed('sm'), ed('cr'), ed('xc'), ed('cr', 'kernel', 'xc'), ed('sp')]);
  const cols = (id: string, port = 'out') => {
    const o = go.get(id)!.outputs[port];
    return o?.t === 'dataset' ? o.v.columns : [];
  };
  const pc = cols('ps');
  const pf = Array.from(pc[0]?.values ?? []);
  const pp = Array.from(pc[1]?.values ?? []);
  const top2 = pp.map((v, i) => [v, pf[i]] as const).sort((a, b) => b[0] - a[0]);
  ok(pf.length === 65 && Math.abs(top2[0][1] - 7) < 1 && rel(pp, R.welch.p) < 1e-10, `FFT node, PSD: as Welch, the strongest line at 7 (${top2[0][1].toFixed(2)})`);
  const bf = Array.from(cols('bw')[1]?.values ?? []);
  ok(ab(bf, Spc.sosfiltfilt(Spc.designSos('butter', 4, 'low', 10 / 50, 0), R.x)) < 1e-12, 'FFT node, filter: a Butterworth low pass at 10 (zero phase)');
  const sw = cols('sm').find((c) => c.name.includes('smoothed'));
  ok(!!sw && sw.values.length === R.x.length && go.get('sm')!.errors.length === 0, 'Smooth: wavelet denoising');
  const lg = cols('cr', 'lags');
  ok(Math.abs((lg[1]?.values[0] ?? NaN) - 0.25) < 1e-9 && (lg[2]?.values[0] ?? 0) > 0.95, `Convolution: the cross-correlation finds the delay of 0.25 (${lg[1]?.values[0]})`);
  const spc = cols('sp');
  ok(spc.length === 3 && spc[0].values.length === 30 * 33, `FFT node: the spectrogram as a long table (${spc[0]?.values.length} rows)`);
  // the step response of a second-order system: overshoot e^(−πζ/√(1−ζ²)), the peak at π/(ωn√(1−ζ²))
  const [zeta, wn] = [0.3, 2];
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  const tx = Array.from({ length: 4001 }, (_, i) => i * 0.005);
  const ty = tx.map((t) => 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + ((zeta * wn) / wd) * Math.sin(wd * t)));
  const si = stepInfo({ name: 'y', xName: 't', x: tx, y: ty });
  const os = 100 * Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
  ok(typeof si !== 'string' && si.kind === 'step' && Math.abs(si.overshoot - os) < 0.05 && Math.abs(si.peakTime - Math.PI / wd) < 0.01 && si.rise > 0.5 && si.rise < 0.8 && si.settling > 5 && si.settling < 7.5, `step response: overshoot ${typeof si === 'string' ? si : si.overshoot.toFixed(2)} % (${os.toFixed(2)}), peak at ${typeof si === 'string' ? '' : si.peakTime.toFixed(3)} (${(Math.PI / wd).toFixed(3)})`);
  const px = Array.from({ length: 1001 }, (_, i) => i * 0.01);
  const pulse = stepInfo({ name: 'p', xName: 't', x: px, y: px.map((t) => Math.exp(-((t - 5) ** 2) / 2)) });
  ok(typeof pulse !== 'string' && pulse.kind === 'pulse' && Math.abs(pulse.width - 2 * Math.sqrt(2 * Math.LN2)) < 0.01 && Math.abs(pulse.rise - pulse.fall) < 0.01, `a pulse: its width at half height (${typeof pulse === 'string' ? pulse : pulse.width.toFixed(4)}), rise = fall`);
}

// ---- Functions of one's own in formulas; complex numbers: the Math column, a complex fit ----
{
  const a = compileExpr('f(t) = exp(-t/3); A*f(B)');
  const b = compileExpr('g(u) = u^2; h(a, b) = g(a) + b; h(A, 1)');
  const c = compileExpr('L(t) = 1/(1+(2*t/w)^2); A*L(x - xc) + y0');
  ok(typeof a !== 'string' && near(a.fn({ A: 2, B: 3 }), 2 * Math.exp(-1), 1e-15) && a.names.join() === 'A,B' && typeof b !== 'string' && b.fn({ A: 3 }) === 10 && typeof c !== 'string' && c.names.join() === 'A,x,xc,w,y0', 'formulas: functions of one\'s own before the formula — called, nested, using the formula\'s parameters');
  ok(compileExpr('f(t) = t; f(1, 2)') === 'f takes 1 argument (t).' && typeof compileExpr('f(t)=t; A; B') === 'string' && typeof compileExpr('f(A) == 1') === 'string' && typeof compileExpr('max(A) = 1') !== 'string', 'formulas: a call with the wrong arguments, two formulas — said; a comparison stays a comparison');
  const cz = (s: string, v: Record<string, number> = {}) => {
    const q = compileComplex(s);
    return typeof q === 'string' ? [NaN, NaN] : q.fn(v);
  };
  const z1 = cz('(1+2*j)*(3-j)');
  const z2 = cz('exp(j*pi)');
  const z3 = cz('sqrt(-4)');
  const z4 = cz('par(a, b) = a*b/(a + b); par(R, 1/(j*w*C))', { R: 100, w: 1000, C: 1e-5 });
  const z5 = cz('polar(2, pi/2) + conj(1 + j) + abs(3 + 4*j)');
  ok(z1[0] === 5 && z1[1] === 5 && near(z2[0], -1, 1e-15) && Math.abs(z2[1]) < 1e-15 && z3[0] === 0 && z3[1] === 2 && near(z4[0], 50, 1e-12) && near(z4[1], -50, 1e-12) && near(z5[0], 6, 1e-12) && near(z5[1], 1, 1e-12), `complex numbers: arithmetic, exp, sqrt, functions of one's own, polar, conj, abs (${z4})`);
  // the Math column: |Z| and its phase of R + 1/(jωC); the Fit: a Randles circuit fitted to Re Z and Im Z at once
  const w = Array.from({ length: 40 }, (_, i) => 10 ** (1 + (5 * i) / 39));
  const Z = (x: number) => {
    const d = 1 + (x * 100 * 2e-6) ** 2;
    return [10 + 100 / d, (-100 * x * 100 * 2e-6) / d];
  };
  const lines = ['ω (rad/s);Re Z (Ω);Im Z (Ω)'];
  w.forEach((x) => lines.push(`${x};${Z(x)[0]};${Z(x)[1]}`));
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: lines.join('\n'), textId: 'eis' } } as AppNode;
  const g = { id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, name: 'ω', mode: 'formula', formula: '10^i', count: 4 } } as AppNode;
  const mz = { id: 'mz', type: 'mathcol', position: { x: 0, y: 0 }, data: { ...MATHCOL_DEFAULTS, formula: '50 + 1/(j*A*1e-4)', complex: true, part: 'abs' } } as AppNode;
  const mp = { id: 'mp', type: 'mathcol', position: { x: 0, y: 0 }, data: { ...MATHCOL_DEFAULTS, formula: '50 + 1/(j*A*1e-4)', complex: true, part: 'deg' } } as AppNode;
  const spec = (name: string, value: number) => ({ name, value, fixed: false, min: NaN, max: NaN, shared: false });
  const fz = { id: 'fz', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, x: 'ω (rad/s)', ys: ['Re Z (Ω)', 'Im Z (Ω)'], model: { ...FIT_DEFAULTS.model, kind: 'complex', cformula: 'par(a, b) = a*b/(a + b); R0 + par(R1, 1/(j*x*C1))' }, params: [spec('R0', 5), spec('R1', 50), spec('C1', 1e-6)] } } as AppNode;
  const ge = evaluateGraph([imp, g, mz, mp, fz], [
    { id: 'e1', source: 'g', sourceHandle: 'out', target: 'mz', targetHandle: 'in-0' },
    { id: 'e2', source: 'g', sourceHandle: 'out', target: 'mp', targetHandle: 'in-0' },
    { id: 'e3', source: 'i', sourceHandle: 'out', target: 'fz', targetHandle: 'in' },
  ]);
  const col = (id: string) => {
    const o = ge.get(id)!.outputs.out;
    return o?.t === 'column' ? Array.from(o.v.values) : [];
  };
  const mag = col('mz');
  const ph = col('mp');
  const want = [10, 100, 1000, 10000].map((x) => Math.hypot(50, 1 / (x * 1e-4)));
  ok(mag.length === 4 && mag.every((v, i) => near(v, want[i], 1e-12)) && near(ph[0], (Math.atan2(-1000, 50) * 180) / Math.PI, 1e-12), `Math column in complex numbers: |Z| and its phase of R + 1/(jωC) (${mag.map((v) => v.toFixed(2))})`);
  const pr = ge.get('fz')!.outputs.params;
  const pv = (nm: string) => (pr?.t === 'dataset' ? (pr.v.columns.find((q) => q.name === nm)?.values[0] ?? NaN) : NaN);
  ok(near(pv('R0'), 10, 1e-5) && near(pv('R1'), 100, 1e-5) && near(pv('C1'), 2e-6, 1e-5) && !ge.get('fz')!.errors.length, `Fit, complex: a Randles circuit fitted to Re Z and Im Z at once (R0 ${pv('R0').toFixed(4)}, R1 ${pv('R1').toFixed(4)}, C1 ${pv('C1').toExponential(4)})`);
}

// ---- Statistics against scipy / numpy / scikit-learn (scripts/fixtures/stat2-ref.py → stat2-ref.json): regressions,
// power and sample sizes, principal components; the clustered order; control charts ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/stat2-ref.json', import.meta.url), 'utf8'));
  const rel = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]) / Math.max(1e-12, Math.abs(b[i]))));
  const X3 = R.x1.map((_: number, i: number) => [R.x1[i], R.x2[i], R.x3[i]]);
  const o = linearRegression(X3, R.y, ['x1', 'x2', 'x3']);
  ok(typeof o !== 'string' && rel(o.coefs.map((c) => c.value), R.ols.b) < 1e-10 && rel(o.coefs.map((c) => c.se), R.ols.se) < 1e-10 && rel(o.coefs.map((c) => c.p), R.ols.p) < 1e-8 && rel(o.coefs.map((c) => c.hi), R.ols.ci.map((q: number[]) => q[1])) < 1e-10, 'linear regression on three predictors: coefficients, SE, p, CI as least squares (NumPy, SciPy)');
  ok(typeof o !== 'string' && near(o.stats['R²'], R.ols.r2, 1e-12) && near(o.stats['adj. R²'], R.ols.r2a, 1e-12) && near(o.stats.F, R.ols.F, 1e-10) && near(o.stats.AIC, R.ols.aic, 1e-10) && near(o.stats.BIC, R.ols.bic, 1e-10) && rel(o.coefs.slice(1).map((c) => c.vif!), R.ols.vif) < 1e-10, 'linear regression: R², adjusted R², F, AIC, BIC and the variance inflation of every predictor');
  const lg = logisticRegression(R.x1.map((_: number, i: number) => [R.x1[i], R.x3[i]]), R.logit.y, ['x1', 'x3']);
  ok(typeof lg !== 'string' && rel(lg.coefs.map((c) => c.value), R.logit.b) < 1e-5 && rel(lg.coefs.map((c) => c.se), R.logit.se) < 1e-5 && near(lg.stats['log-likelihood'], R.logit.ll, 1e-9) && near(lg.stats["McFadden's R²"], R.logit.r2, 1e-9) && near(lg.stats['p (LR)'], R.logit.plr, 1e-8), `logistic regression: coefficients, SE, the likelihood, McFadden's R², the LR test (${typeof lg === 'string' ? lg : rel(lg.coefs.map((c) => c.value), R.logit.b).toExponential(1)})`);
  const P = R.power;
  const one = (['two-sided', 'greater', 'less'] as const).map((a) => powerT(0.5, 20, null, 0.05, a));
  ok(rel(one, P.one) < 1e-7 && near(powerT(-0.5, 20, null, 0.05, 'less'), P.one_neg, 1e-7) && near(powerT(0.6, 25, 25, 0.05, 'two-sided'), P.two[0], 1e-9) && near(powerT(0.6, 25, 40, 0.01, 'greater'), P.two[1], 1e-9), 'power of the t-tests (one sample, two samples, one- and two-sided) as the noncentral t (SciPy)');
  ok(sampleSizeT(0.5, 0.8, 0.05, 'two-sided', false) === P.n_one && sampleSizeT(0.6, 0.9, 0.05, 'two-sided', true) === P.n_two && near(powerAnova(0.25, 4, 80, 0.05), P.anova[0], 1e-9) && near(powerAnova(0.4, 3, 45, 0.01), P.anova[1], 1e-9) && sampleSizeAnova(0.25, 4, 0.8, 0.05) === P.n_anova, `the sample sizes for a power (t: ${P.n_one}, ${P.n_two} per group; ANOVA: ${P.n_anova}) and the power of the ANOVA (noncentral F)`);
  const pc = pca([R.x1, R.x2, R.x3, R.y], 'corr');
  const pcv = pca([R.x1, R.x2, R.x3, R.y], 'cov');
  ok(typeof pc !== 'string' && typeof pcv !== 'string' && rel(pc.explained.map((v) => v / 100), R.pca.ratio) < 1e-10 && rel(pc.values, R.pca.var) < 1e-10 && Math.max(...pc.loadings.flatMap((l, k) => l.map((v, i) => Math.abs(Math.abs(v) - R.pca.comp[k][i])))) < 1e-10 && rel(pcv.explained.map((v) => v / 100), R.pca.ratio_cov) < 1e-10, 'principal components: of the correlations and of the covariances, their loadings (scikit-learn)');
  const ord = clusterOrder([[0, 0.1, 0.9, 0.8], [0.1, 0, 0.85, 0.9], [0.9, 0.85, 0, 0.2], [0.8, 0.9, 0.2, 0]]);
  const pos = (k: number) => ord.indexOf(k);
  ok(ord.length === 4 && Math.abs(pos(0) - pos(1)) === 1 && Math.abs(pos(2) - pos(3)) === 1, `the clustered order: the related ones together (${ord})`);
  // control charts: I–MR (σ = MR̄/1.128), X̄–R (A2, D3, D4), the rules
  const v = [10, 11, 9, 10, 12, 10, 9, 11, 10, 18, 10, 11];
  const cc = controlChart(v, 1);
  const mr = v.slice(1).map((q, i) => Math.abs(q - v[i]));
  const mrb = mr.reduce((a, b) => a + b) / mr.length;
  const mean = v.reduce((a, b) => a + b) / v.length;
  ok(typeof cc !== 'string' && near(cc.cl, mean, 1e-12) && near(cc.ucl, mean + (3 * mrb) / 1.128, 1e-12) && near(cc.rucl, 3.267 * mrb, 1e-12) && cc.rules[9].includes(1) && cc.rules.filter((q) => q.length).length === 1, 'control chart (individuals): the limits from the moving range, the point beyond 3σ found');
  const sv = Array.from({ length: 40 }, (_, i) => 50 + Math.sin(i * 1.3) * 2 + (i >= 30 ? 3 : 0));
  const xb = controlChart(sv, 4);
  ok(typeof xb !== 'string' && xb.v.length === 10 && near(xb.ucl - xb.cl, 0.729 * xb.rcl, 1e-12) && xb.rules.some((q) => q.length), `control chart (subgroups of 4): the limits from the mean range, a shift found (${typeof xb === 'string' ? xb : xb.rules.map((q, i) => (q.length ? i + 1 : '')).filter(Boolean)})`);
  // the nodes: a t-test with its power, an ANOVA with its power, the correlation with PCA and the clustered matrix,
  // the control chart of the statistics, the Fit as a linear and a logistic regression
  const lines = ['x1;x2;x3;y;yes'];
  R.x1.forEach((_: number, i: number) => lines.push(`${R.x1[i]};${R.x2[i]};${R.x3[i]};${R.y[i]};${R.logit.y[i] ? 'yes' : 'no'}`));
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: lines.join('\n'), textId: 'st2' } } as AppNode;
  const tt = { id: 'tt', type: 'ttest', position: { x: 0, y: 0 }, data: { ...TTEST_DEFAULTS, test: 'two', cols: 'x1, x2', power: true } } as AppNode;
  const an = { id: 'an', type: 'anova', position: { x: 0, y: 0 }, data: { ...ANOVA_D, cols: 'x1, x2, x3', power: true } } as AppNode;
  const co = { id: 'co', type: 'correl', position: { x: 0, y: 0 }, data: { ...CORR_DEFAULTS, cols: 'x1, x2, x3, y', pca: true, order: 'cluster' } } as AppNode;
  const sc = { id: 'sc', type: 'stats', position: { x: 0, y: 0 }, data: { ...STATS_DEFAULTS, cols: 'y', control: 'imr' } } as AppNode;
  const rl = { id: 'rl', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, regression: 'linear', ys: ['y'], predictors: 'x1, x2, x3' } } as AppNode;
  const rg = { id: 'rg', type: 'fit', position: { x: 0, y: 0 }, data: { ...FIT_DEFAULTS, regression: 'logistic', ys: ['yes'], predictors: 'x1, x3' } } as AppNode;
  const ed = (t: string) => ({ id: `e${t}`, source: 'i', sourceHandle: 'out', target: t, targetHandle: 'in' });
  const go = evaluateGraph([imp, tt, an, co, sc, rl, rg], ['tt', 'an', 'co', 'sc', 'rl', 'rg'].map(ed));
  const tab = (id: string, port: string) => {
    const q = go.get(id)!.outputs[port];
    return q?.t === 'dataset' ? q.v.columns : [];
  };
  const val = (id: string, port: string, nm: string, k = 0) => tab(id, port).find((c) => c.name.startsWith(nm))?.values[k] ?? NaN;
  ok(val('tt', 'power', 'power') > 0 && val('tt', 'power', 'power') <= 1 && Number.isFinite(val('tt', 'power', 'N needed')) && go.get('tt')!.view.report?.some((l) => l.startsWith('Power:')) === true, `t-test: its power and the size needed (${val('tt', 'power', 'power').toFixed(3)}, ${val('tt', 'power', 'N needed')} per group)`);
  ok(val('an', 'power', 'power') > 0.99 && Number.isFinite(val('an', 'power', 'N needed (per group)')), `ANOVA: its power (${val('an', 'power', 'power').toFixed(4)})`);
  const mt = tab('co', 'matrix');
  ok(tab('co', 'pca').length === 4 && tab('co', 'loadings').length === 5 && tab('co', 'scores')[1]?.values.length === 60 && mt[0]?.text?.length === 4 && near(val('co', 'pca', '% of variance'), 100 * R.pca.ratio[0], 1e-9), `Correlation: PCA (components, loadings, scores) and the matrix in clustered order (${mt[0]?.text?.join(', ')})`);
  ok(tab('sc', 'control').length === 11 && tab('sc', 'control')[0].values.length === 60, 'Statistics: the control chart of a column');
  const coef = (id: string, k: number) => tab(id, 'params').find((c) => c.name === 'coefficient')?.values[k] ?? NaN;
  ok(near(coef('rl', 1), R.ols.b[1], 1e-10) && near(val('rl', 'stats', 'value', 1), R.ols.r2, 1e-10) && !!go.get('rl')!.view.fit?.regression, `Fit, linear regression: as least squares (b1 ${coef('rl', 1).toFixed(5)})`);
  ok(near(coef('rg', 1), R.logit.b[1], 1e-5) && go.get('rg')!.view.report?.some((l) => l.includes('“yes” = 1')) === true, `Fit, logistic regression on a yes / no column (b1 ${coef('rg', 1).toFixed(5)})`);
}

// ---- Wavelets against PyWavelets (scripts/fixtures/wavelet-ref.py, cwt-ref.py): the filters, the transform
// (periodization) and its inverse, the denoising; the Morlet scalogram against its definition and PyWavelets ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/wavelet-ref.json', import.meta.url), 'utf8'));
  const ab = (a: number[], b: number[]) => (a.length === b.length ? Math.max(0, ...a.map((v, i) => Math.abs(v - b[i]))) : Infinity);
  const ws = ['haar', 'db2', 'db4', 'sym4'];
  const fdev = Math.max(...ws.map((w) => Math.max(ab(WAVELETS[w].h, R.filters[w].dec_lo), ab(highPass(WAVELETS[w].h), R.filters[w].dec_hi))));
  ok(fdev < 1e-15, `wavelets: the decomposition filters as PyWavelets ${R.pywt} (${fdev.toExponential(1)})`);
  const ddev = Math.max(...ws.map((w) => Math.max(...dwt(R.x64, w, 4).map((q, k) => ab(q, R.dwt[w].coeffs[k])), ab(idwt(R.dwt[w].coeffs, w), R.dwt[w].back))));
  ok(ddev < 1e-12, `wavelets: wavedec and waverec (periodization, 4 levels) as PyWavelets (${ddev.toExponential(1)})`);
  const den = Object.entries(R.denoise as Record<string, { y: number[]; thr: number; level: number }>).map(([k, v]) => {
    const [w, mode, name] = k.split('_');
    const r = waveletDenoise(R[name], w, v.level, mode as 'soft' | 'hard');
    return Math.max(ab(r.y, v.y), Math.abs(r.threshold - v.thr));
  });
  ok(den.length === 16 && Math.max(...den) < 1e-12, `wavelet denoising (4 wavelets, soft and hard, a length 2^k and an odd one) as PyWavelets (${Math.max(...den).toExponential(1)})`);
  const C = JSON.parse(readFileSync(new URL('./fixtures/cwt-ref.json', import.meta.url), 'utf8'));
  const cw = Spc.cwtMorlet(C.x, C.dt, C.scales, C.w0);
  // the scales below half the Nyquist frequency (the smaller ones are not resolved by the sampling)
  const valid = cw.freq.map((f, k) => (f <= 0.25 / C.dt ? k : -1)).filter((k) => k >= 0);
  const defDev = Math.max(...valid.map((k) => {
    const ref = C.direct[k] as number[];
    const top = Math.max(...ref);
    return Math.max(...cw.power[k].map((v, i) => Math.abs(v - ref[i]) / top));
  }));
  ok(valid.length > 20 && defDev < 1e-8, `Morlet scalogram as its definition (a direct sum, Torrence & Compo), ${valid.length} scales (${defDev.toExponential(1)})`);
  // PyWavelets' complex Morlet of the same shape (cmor2.0): it resamples its integrated wavelet at whole steps, exact
  // at the scales that are powers of 2 in samples — there, on a signal with a tone at each, the same map, the powers in the ratio of the normalizations
  // (π^(−1/4))² / (2π)^(−1) = 2√π; the difference over the time inside, relative to the mean power of the scale
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const k2 = 2 * Math.sqrt(Math.PI);
  const cw2 = Spc.cwtMorlet(C.x2, C.dt, C.p2, C.w0);
  const cmp = cw2.power.map((row, k) => {
    const [o, p] = [row.slice(400, 1648), (C.pywt2[k] as number[]).slice(400, 1648)];
    return Math.sqrt(mean(o.map((v, i) => (v - k2 * p[i]) ** 2))) / mean(o);
  });
  ok(cmp.length === 4 && Math.max(...cmp) < 0.03, `Morlet scalogram against PyWavelets (cmor2.0, scales of 16 to 128 samples, a tone at each): the powers × 2√π apart by ${cmp.map((q) => (100 * q).toFixed(2)).join(', ')} %`);
}

// ---- Matrices against numpy / scipy (scripts/fixtures/matrix-ref.py → matrix-ref.json) ----
{
  const X = JSON.parse(readFileSync(new URL('./fixtures/matrix-ref.json', import.meta.url), 'utf8'));
  type J = { rows: number; cols: number; v: number[] };
  const M = (o: J, name = 'M') => Mx.newMatrix(o.rows, o.cols, name, Float64Array.from(o.v));
  const close = (a: ArrayLike<number> | undefined, b: number[], tol = 1e-9) => !!a && a.length === b.length && b.every((v, i) => Math.abs(a[i] - v) <= tol * Math.max(1, Math.abs(v)));
  // up to the sign of every column (vectors of a decomposition)
  const colsClose = (A: Mx.Matrix, b: number[], tol = 1e-8) => {
    if (A.v.length !== b.length) return false;
    for (let j = 0; j < A.cols; j++) {
      let s = 0;
      for (let i = 0; i < A.rows; i++) s += A.v[i * A.cols + j] * b[i * A.cols + j];
      const sg = s < 0 ? -1 : 1;
      for (let i = 0; i < A.rows; i++) if (Math.abs(sg * A.v[i * A.cols + j] - b[i * A.cols + j]) > tol) return false;
    }
    return true;
  };
  const R = X.ref;
  const G = M(X.G);
  const num = (v: number | string) => (typeof v === 'number' ? v : NaN);
  const mat = <T,>(v: T | string) => (typeof v === 'string' ? undefined : v);
  ok(near(num(Mx.det(G)), R.G.det, 1e-10) && near(num(Mx.trace(G)), R.G.trace, 1e-12), `Matrix: det, trace as numpy (${num(Mx.det(G))})`);
  const inv = Mx.inverse(G);
  ok(typeof inv !== 'string' && close(inv.M.v, R.G.inv) && !inv.warning, 'Matrix: the inverse as numpy inv');
  const sol = Mx.solve(G, M(X.b));
  ok(typeof sol !== 'string' && close(sol.M.v, R.G.solve), 'Matrix: solve A·x = B as numpy solve');
  const f = Mx.lu(G);
  ok(close(f.P.v, R.G.P, 0) && close(f.L.v, R.G.L, 1e-12) && close(f.U.v, R.G.U, 1e-12), 'Matrix: LU (P, L, U) as scipy.linalg.lu — the same pivots');
  const q = Mx.qr(G);
  ok(close(q.Q.v, R.G.Q, 1e-12) && close(q.R.v, R.G.R, 1e-12), 'Matrix: QR as numpy qr (the same signs)');
  const q2 = Mx.qr(M(X.R));
  ok(close(q2.Q.v, R.R.Q, 1e-12) && close(q2.R.v, R.R.R, 1e-12) && q2.Q.rows === 5 && q2.Q.cols === 3, 'Matrix: QR of a 5 × 3 (reduced) as numpy qr');
  const e = Mx.eig(G);
  ok(typeof e !== 'string' && e.complex && close(Array.from({ length: 4 }, (_, i) => e.values.v[i * 2]), R.G.eig_re, 1e-9) && close(Array.from({ length: 4 }, (_, i) => e.values.v[i * 2 + 1]), R.G.eig_im, 1e-9), `Matrix: the complex eigenvalues of a general matrix as numpy eigvals (${typeof e === 'string' ? e : Array.from(e.values.v, (v) => v.toFixed(4))})`);
  const sv = Mx.svd(G);
  ok(typeof sv !== 'string' && close(sv.s, R.G.s, 1e-12), 'Matrix: the singular values as numpy svd');
  if (typeof sv !== 'string') {
    // U·Σ·Vᵀ = A, U and V orthonormal
    const back = Mx.matmul(Mx.matmul(sv.U, sv.S) as Mx.Matrix, Mx.transpose(sv.V)) as Mx.Matrix;
    const utu = Mx.matmul(Mx.transpose(sv.U), sv.U) as Mx.Matrix;
    ok(close(back.v, X.G.v, 1e-12) && close(utu.v, Array.from(Mx.identity(4).v), 1e-12), 'Matrix: SVD — U·Σ·Vᵀ = A, UᵀU = I');
  }
  ok(close(mat(Mx.pinv(G))?.v, R.G.pinv, 1e-10) && Mx.rank(G) === R.G.rank, 'Matrix: the pseudo-inverse and the rank as numpy');
  ok(near(num(Mx.norm(G, 'fro')), R.G.fro) && near(num(Mx.norm(G, '1')), R.G.n1) && near(num(Mx.norm(G, 'inf')), R.G.ninf) && near(num(Mx.norm(G, '2')), R.G.n2, 1e-12) && near(num(Mx.cond(G)), R.G.cond, 1e-10), 'Matrix: the norms (Frobenius, 1, ∞, 2) and the condition number as numpy');
  const p3 = Mx.matPower(G, 3);
  const pm2 = Mx.matPower(G, -2);
  ok(typeof p3 !== 'string' && close(p3.M.v, R.G.pow3, 1e-12) && typeof pm2 !== 'string' && close(pm2.M.v, R.G.powm2, 1e-10) && typeof Mx.matPower(G, 0.5) === 'string', 'Matrix: Aⁿ (3, −2) as numpy matrix_power; a fraction refused');
  const k2 = Mx.kron(Mx.part(G, '1-2', '1-2') as Mx.Matrix, Mx.newMatrix(2, 2, '', Float64Array.of(1, 2, 3, 4)));
  ok(close(mat(k2)?.v, R.G.kron, 1e-14), 'Matrix: the Kronecker product as numpy kron');
  const S = M(X.S);
  const es = Mx.eig(S);
  ok(typeof es !== 'string' && es.symmetric && close(es.values.v, R.S.eigh_w, 1e-12) && colsClose(es.vectors, R.S.eigh_V, 1e-10), 'Matrix: a symmetric matrix — eigenvalues ascending and vectors as numpy eigh');
  ok(close(mat(Mx.cholesky(S))?.v, R.S.chol, 1e-12) && near(num(Mx.det(S)), R.S.det, 1e-10) && typeof Mx.cholesky(G) === 'string', 'Matrix: Cholesky as numpy cholesky; a non-symmetric matrix refused');
  const Rm = M(X.R);
  const ls = Mx.solve(Rm, M(X.bR));
  ok(typeof ls !== 'string' && close(ls.M.v, R.R.lstsq, 1e-10) && close(mat(Mx.pinv(Rm))?.v, R.R.pinv, 1e-10) && Mx.rank(Rm) === R.R.rank && close(mat(Mx.svd(Rm))?.s, R.R.s, 1e-12), 'Matrix: a 5 × 3 — least squares as numpy lstsq, pinv, rank, σ');
  const Wm = M(X.W);
  ok(close(mat(Mx.svd(Wm))?.s, R.W.s, 1e-12) && close(mat(Mx.pinv(Wm))?.v, R.W.pinv, 1e-10), 'Matrix: a 3 × 5 — σ and pinv as numpy');
  const Dm = M(X.D);
  ok(Mx.rank(Dm) === R.D.rank && close(mat(Mx.pinv(Dm))?.v, R.D.pinv, 1e-9) && close(mat(Mx.svd(Dm))?.s.slice(0, 2), R.D.s.slice(0, 2), 1e-12), `Matrix: a rank-deficient matrix — rank ${Mx.rank(Dm)}, pinv as numpy`);
  const inv0 = Mx.inverse(Mx.newMatrix(2, 2, '', Float64Array.of(1, 2, 2, 4)));
  ok(typeof inv0 === 'string' && inv0.includes('singular'), 'Matrix: a singular matrix — no inverse, said');
  const et = Mx.eig(M(X.T));
  ok(typeof et !== 'string' && !et.complex && !et.symmetric && close(et.values.v, R.T.w, 1e-10) && colsClose(et.vectors, R.T.V, 1e-8), 'Matrix: a general matrix with real eigenvalues — values and vectors as numpy eig');
  const H = M(X.H);
  const hinv = Mx.inverse(H);
  ok(near(num(Mx.cond(H)), R.H.cond, 1e-8) && typeof hinv !== 'string' && close(hinv.M.v, R.H.inv, 1e-7), 'Matrix: Hilbert 5 — cond and inverse as numpy');
  // the Matrix node's sources
  const base = MATRIX_DEFAULTS;
  const gen = (p: Partial<typeof base>) => {
    const r = Mx.makeMatrix({ ...base, source: 'generated', ...p }, undefined);
    return typeof r === 'string' ? undefined : r.M;
  };
  ok(close(gen({ gen: 'vandermonde', list: '1, 2, 3, 4', cols: NaN })?.v, R.vander, 0) && close(gen({ gen: 'hilbert', rows: 5 })?.v, X.H.v, 1e-15), 'Matrix: Vandermonde and Hilbert as numpy vander / scipy hilbert');
  const fm = gen({ gen: 'formula', rows: 2, cols: 3, formula: '10*i + j' });
  ok(fm?.rows === 2 && fm.cols === 3 && Array.from(fm.v).join() === '11,12,13,21,22,23' && Array.from(gen({ gen: 'identity', rows: 3 })!.v).join() === '1,0,0,0,1,0,0,0,1' && gen({ gen: 'rotation', angle: 90 })!.v[1] === -1, 'Matrix: a formula of i, j; identity; rotation');
  const ty = Mx.makeMatrix({ ...base, text: '1\t2\n3\t4,5\n\t6' }, undefined);
  ok(typeof ty !== 'string' && ty.M.rows === 3 && ty.M.cols === 2 && ty.M.v[3] === 4.5 && Number.isNaN(ty.M.v[4]) && ty.warnings.length === 1, 'Matrix: typed cells (a decimal comma, an empty cell)');
  const added = Mx.readTyped('1\t2\n3\t4\n\t');
  const added1 = Mx.readTyped('1\n2\n');
  ok(added.rows === 3 && added.cols === 2 && Number.isNaN(added.v[5]) && added1.rows === 3 && Mx.readTyped('\t\n\t').rows === 0, 'Matrix: a row just added (empty) is kept — of 2 columns and of 1; no value at all: no matrix');
  const map: Dataset = { name: 'map', columns: [column('θ (deg)', Float64Array.of(30, 40, 50)), column('R 400 nm', Float64Array.of(1, 2, 3)), column('R 410 nm', Float64Array.of(4, 5, 6))] };
  const fd = Mx.makeMatrix({ ...base, source: 'dataset' }, map);
  ok(typeof fd !== 'string' && fd.M.rows === 3 && fd.M.cols === 2 && fd.M.xs?.join() === '400,410' && fd.M.ys?.join() === '30,40,50' && fd.M.xName === 'X (nm)' && fd.M.yName === 'θ (deg)' && Array.from(fd.M.v).join() === '1,4,2,5,3,6', 'Matrix from a dataset: the rows’ Y from X, the columns’ X from their names');
  const back = Mx.matrixDataset(typeof fd === 'string' ? Mx.identity(1) : fd.M);
  const g2 = gridFromMatrix(back.columns[0], back.columns.slice(1));
  ok(typeof g2 !== 'string' && g2.xs.join() === '400,410' && g2.ys.join() === '30,40,50', 'Matrix ▸ dataset: read back as a matrix by the Contour');
  // the rows' Y and the columns' X given by hand, for any source: a range (to the last, or by a step), a list of numbers
  // (fewer than the rows: the rest empty), names
  const cu = (p: Partial<typeof base>, ds?: Dataset) => {
    const r = Mx.makeMatrix({ ...base, ...p }, ds);
    return typeof r === 'string' ? r : r;
  };
  const c1 = cu({ rowAt: '#custom', rowCustom: { mode: 'range', from: 0, to: 10, name: 'Time (s)' }, colAt: 'custom', colCustom: { mode: 'range', from: 400, step: 5 } });
  const c2 = cu({ rowAt: '#custom', rowCustom: { list: '1; 2' }, colAt: 'custom', colCustom: { list: 'A, B, C', name: 'Sample' } });
  const c3 = cu({ source: 'dataset', rowAt: '#custom', rowCustom: { list: '5, 6, 7' }, colAt: 'custom', colCustom: { mode: 'range', from: 1, to: 2 } }, map);
  const c4 = cu({ rowAt: '#custom', rowCustom: { mode: 'range' } });
  ok(
    typeof c1 !== 'string' && c1.M.ys?.join() === '0,5,10' && c1.M.yName === 'Time (s)' && c1.M.xs?.join() === '400,405,410' && c1.M.xName === 'X' &&
      typeof c2 !== 'string' && c2.M.ys?.length === 3 && Number.isNaN(c2.M.ys[2]) && c2.warnings.some((w) => w.includes('2 values for 3')) && c2.M.colNames?.join() === 'A,B,C' && !c2.M.xs && c2.M.xName === 'Sample' &&
      typeof c3 !== 'string' && c3.M.ys?.join() === '5,6,7' && c3.M.xs?.join() === '1,1.5,2' && c3.M.cols === 3 &&
      typeof c4 === 'string',
    'Matrix: the rows’ Y and the columns’ X by hand (a range, a step, a list, names; typed and from a dataset)',
  );
  // rearranging, element by element (broadcasting), reductions
  const A = Mx.newMatrix(2, 3, 'A', Float64Array.of(1, 2, 3, 4, 5, 6));
  ok(Array.from(Mx.rot90(A, 1).v).join() === '3,6,2,5,1,4' && Mx.rot90(A, 1).rows === 3 && Array.from(Mx.flip(A, 'lr').v).join() === '3,2,1,6,5,4' && Array.from(Mx.flip(A, 'ud').v).join() === '4,5,6,1,2,3', 'Matrix: rot90 and flips as numpy');
  ok(Array.from((Mx.reshape(A, 3, 2) as Mx.Matrix).v).join() === '1,2,3,4,5,6' && typeof Mx.reshape(A, 4, 2) === 'string' && Array.from((Mx.part(A, '2', '1, 3') as Mx.Matrix).v).join() === '4,6', 'Matrix: reshape (row by row), part');
  const row = Mx.newMatrix(1, 3, 'r', Float64Array.of(10, 20, 30));
  ok(Array.from((Mx.elementwise(A, row, (a, b) => a + b, '+') as Mx.Matrix).v).join() === '11,22,33,14,25,36' && typeof Mx.elementwise(A, Mx.newMatrix(2, 2, ''), (a, b) => a + b, '+') === 'string', 'Matrix: broadcasting a row over A (numpy); sizes that do not fit said');
  const sums = Mx.reduce(A, 'sum', 'columns') as Mx.Matrix;
  ok(Array.from(sums.v).join() === '5,7,9' && Array.from((Mx.reduce(A, 'mean', 'rows') as Mx.Matrix).v).join() === '2,5' && Mx.reduce(A, 'max', 'all') === 6 && Array.from(Mx.diagonal(A).v).join() === '1,5' && Mx.diagonal(row).rows === 3, 'Matrix: sums, means, max; the diagonal both ways');
  ok(Array.from((Mx.concat(A, A, 'v') as Mx.Matrix).v).length === 12 && typeof Mx.concat(A, row, 'h') === 'string' && Mx.dot(row, row) === 1400 && Array.from((Mx.cross(Mx.newMatrix(3, 1, '', Float64Array.of(1, 0, 0)), Mx.newMatrix(3, 1, '', Float64Array.of(0, 1, 0))) as Mx.Matrix).v).join() === '0,0,1', 'Matrix: [A; B], dot and cross products');
  // the steps of Matrix computation: one after another, a piece of a decomposition, a value, a formula, errors said
  const steps: Mx.MatStep[] = [
    { id: 'a', op: 'inverse', a: 'A' },
    { id: 'b', op: 'matmul', a: '@a', b: 'A' },
    { id: 'c', op: 'lu', a: 'A' },
    { id: 'd', op: 'matmul', a: '@c.P', b: '@c.L' },
    { id: 'e', op: 'det', a: 'A' },
    { id: 'f', op: 'formula', a: 'A', b: '#', num: 2, formula: 'a*b + (i == j)' },
    { id: 'g', op: 'matmul', a: 'A', b: 'B' },
  ];
  const run = Mx.runSteps(steps, new Map<string, Mx.Matrix | number>([['A', G], ['B', A]]));
  const vOf = (k: number, j = 0) => run[k].parts[j]?.value;
  const I4 = vOf(1) as Mx.Matrix;
  ok(run.length === 7 && I4 && close(I4.v, Array.from(Mx.identity(4).v), 1e-12) && run[1].name === 'R2', 'Matrix computation: A⁻¹ then R1 × A = I');
  ok(run[2].parts.map((p) => p.label).join() === 'L,U,P' && close((vOf(3) as Mx.Matrix).v, Array.from((Mx.matmul(f.P, f.L) as Mx.Matrix).v), 1e-14) && near(vOf(4) as number, R.G.det, 1e-10), 'Matrix computation: the pieces of LU used by a step below; det a value');
  ok((vOf(5) as Mx.Matrix).v[0] === 2 * G.v[0] + 1 && (vOf(5) as Mx.Matrix).v[1] === 2 * G.v[1] && !!run[6].error?.includes('B needs as many rows'), 'Matrix computation: a formula of a, b, i, j; a product of sizes that do not fit — said');
  const holes = Mx.runSteps([{ id: 'a', op: 'inverse', a: 'A' }, { id: 'b', op: 'add', a: 'A', b: '#', num: 1 }, { id: 'c', op: 'transpose', a: '@a' }], new Map([['A', Mx.newMatrix(2, 2, '', Float64Array.of(1, NaN, 3, 4))]]));
  ok(!!holes[0].error?.includes('empty') && !holes[1].error && Number.isNaN((holes[1].parts[0].value as Mx.Matrix).v[1]) && !!holes[2].error?.includes('R1 has no result'), 'Matrix computation: an empty cell — no inverse (said), element by element it stays empty; a step on a failed one said');
  // the nodes in a graph: Matrix → Matrix computation (ports) → Contour with a matrix (the values in the cells)
  const mn = { id: 'm', type: 'matrix', position: { x: 0, y: 0 }, data: MATRIX_DEFAULTS } as AppNode;
  const mc = { id: 'c', type: 'matcomp', position: { x: 0, y: 0 }, data: { steps: [{ id: 's1', op: 'inverse', a: 'A' }, { id: 's2', op: 'det', a: 'A' }, { id: 's3', op: 'svd', a: 'A' }] } } as AppNode;
  const pm = { id: 'p', type: 'contour', position: { x: 0, y: 0 }, data: { ...CONTOUR_DEFAULTS, cellValues: true } } as AppNode;
  const edges = [
    { id: 'e1', source: 'm', sourceHandle: 'out', target: 'c', targetHandle: 'in-0' },
    { id: 'e2', source: 'c', sourceHandle: 's-s1', target: 'p', targetHandle: 'matrix' },
  ];
  // a Workbook sheet of the inputs: rows left out and moved (by their places), the others after them
  {
    const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x\ty\n1\t10\n2\t20\n3\t30\n4\t40\n', textId: 'rows' } } as AppNode;
    const wb = { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, layout: { Sheet1: { rowHide: [1], rowOrder: [3, 0] } } } } as AppNode;
    const rw = evaluateGraph([imp, wb], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'w', targetHandle: 'in-0' }]).get('w')!;
    const o = rw.outputs.out?.t === 'dataset' ? rw.outputs.out.v : undefined;
    ok(Array.from(o?.columns[0].values ?? []).join() === '4,1,3' && rw.view.book?.rowsOf?.join() === '3,0,2', `Workbook: rows of an input sheet left out and moved (${Array.from(o?.columns[0].values ?? []).join()}; ${rw.view.book?.kinds?.join()})`);
  }
  // a matrix on a Workbook's input: a table, its rows' and columns' names as asked (not asked yet: both, and asked)
  {
    const named = { ...Mx.newMatrix(2, 2, 'T', Float64Array.of(1, 2, 3, 4)), rowNames: ['400 nm', '410 nm'], colNames: ['-0.5', '0'] };
    const both = Mx.matrixSheet(named, true, true).columns;
    const bare = Mx.matrixSheet(named, false, false).columns;
    const wb = { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS } } as AppNode;
    const tr = { id: 'c', type: 'matcomp', position: { x: 0, y: 0 }, data: { steps: [{ id: 's1', op: 'transpose', a: 'A' }] } } as AppNode;
    const e2 = [
      { id: 'e1', source: 'm', sourceHandle: 'out', target: 'c', targetHandle: 'in-0' },
      { id: 'e2', source: 'c', sourceHandle: 's-s1', target: 'w', targetHandle: 'in-0' },
    ];
    const asked = evaluateGraph([mn, tr, wb], e2).get('w')!;
    const told = evaluateGraph([mn, tr, { ...wb, data: { ...WORKBOOK_DEFAULTS, matrix: { 0: { rows: false, cols: true } } } } as AppNode], e2).get('w')!;
    const cs = (r: typeof asked) => (r.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns : []);
    ok(both.map((c) => c.name).join() === 'Name,-0.5,0' && both[0].text?.join() === '400 nm,410 nm' && bare.map((c) => c.name).join() === 'C1,C2' && bare[1].values[1] === 4 && targetAccepts(wb, 'in-0').includes('matrix') && asked.view.book?.ins[0]?.ask === true && cs(asked).length === 4 && Array.from(cs(asked)[1].values).join() === '1,2,3' && told.view.book?.ins[0]?.ask === false && cs(told).length === 3, `Workbook: a matrix on an input, its names as asked (${cs(asked).map((c) => c.name).join(', ')} · ${cs(told).map((c) => c.name).join(', ')})`);
  }
  const res = evaluateGraph([mn, mc, pm], edges);
  const rc = res.get('c')!;
  const rp = res.get('p')!;
  ok(rc.errors.length === 0 && rc.outputs['s-s1']?.t === 'matrix' && rc.outputs['s-s2']?.t === 'scalar' && near(rc.outputs['s-s2'].v.value, -3, 1e-12) && rc.outputs['s-s3-S']?.t === 'matrix', `Matrix computation in a graph: a port a result (${rc.errors.join('; ')})`);
  ok(sourcePort(mc, 's-s2') === 'scalar' && sourcePort(mc, 's-s3-V') === 'matrix' && sourcePort(mn, 'out') === 'matrix' && targetAccepts(mc, 'in-3').includes('column') && targetAccepts(pm, 'matrix').join() === 'matrix', 'Matrix ports: the types of the results, what the inputs take');
  const cells = rp.view.figure?.axes[0]?.curves.filter((c) => c.key.startsWith('cells:')) ?? [];
  ok(rp.errors.length === 0 && rp.outputs.figure?.t === 'figure' && cells.reduce((s, c) => s + (c.labelValues?.text?.length ?? 0), 0) === 9 && rp.view.figure!.axes[0].style.y.reverse && rp.view.figure!.axes[0].style.aspect === 1, `Contour of a matrix: the figure, a value in every cell, row 1 at the top, square cells — a new Contour's defaults (${rp.errors.join('; ')})`);
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x,y,z\n1,1,1\n2,1,2\n1,2,3\n2,2,4\n', textId: 'tc' } } as AppNode;
  const both = evaluateGraph([mn, imp, pm], [{ id: 'a', source: 'm', sourceHandle: 'out', target: 'p', targetHandle: 'matrix' }, { id: 'b', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  ok(both.errors.some((e) => e.includes('one')), 'Contour: a dataset and a matrix at once — said');
}

// ---- Combine columns ▸ side by side ----
{
  const at = { x: 0, y: 0 };
  const imp = (id: string, text: string) => ({ id, type: 'import', position: at, data: { ...IMPORT_DEFAULTS, text, textId: id } }) as AppNode;
  const run = (extra: Record<string, unknown>) =>
    evaluateGraph([imp('a', 'x,y\n1,2\n3,4\n'), imp('b', 'y,z\n5,6\n7,8\n9,10\n'), { id: 'c', type: 'combine', position: at, data: { ...COMBINE_DEFAULTS, how: 'side', ...extra } } as AppNode], [
      { id: '1', source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in-0' },
      { id: '2', source: 'b', sourceHandle: 'out', target: 'c', targetHandle: 'in-1' },
    ]).get('c')!;
  const names = (r: ReturnType<typeof run>) => (r.outputs.out?.t === 'dataset' ? r.outputs.out.v.columns.map((c) => c.name).join() : '');
  const r1 = run({});
  ok(names(r1) === 'x,y,y (2),z' && r1.outputs.out?.t === 'dataset' && Number.isNaN(r1.outputs.out.v.columns[0].values[2]) && r1.warnings.some((w) => w.includes('empty cells')), 'Combine side by side: A then B, a name met twice, the shorter ones end in empty cells');
  ok(names(run({ where: 'start', names: 'Y2' })) === 'Y2,z,x,y' && names(run({ where: 'replace', ref: 'y' })) === 'x,y,z' && run({ where: 'after', ref: 'w' }).errors.length === 1, 'Combine side by side: before A, renamed; in place of a column; a missing column said');
  const cn = { id: 'c', type: 'combine', position: at, data: { ...COMBINE_DEFAULTS, how: 'side' } } as AppNode;
  ok(sourcePort(cn, 'out') === 'dataset', 'Combine side by side: a dataset out, even of columns');
  // the Result chosen: columns A, B, C one under the other in the order A C B, interleaved, sorted by value (largest
  // first); a column put between two columns of a sheet of a workbook, another continuing a column; in sheets
  const col = (id: string, v: number[]) => ({ id, type: 'gencol', position: at, data: { ...GENCOL_DEFAULTS, mode: 'formula', formula: `${v.map((x, k) => `(i==${k + 1})*${x}`).join('+')}`, count: v.length, name: id } }) as AppNode;
  const book = { id: 'w', type: 'book', position: at, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'p\tq\n1\t2\n' }, { name: 'N', text: 'B\tC\tD\n1\t2\t3\n4\t5\t6\n' }] } } as AppNode;
  const wire = (pairs: [string, string, number][]) => pairs.map(([src, h, p], k) => ({ id: `w${k}`, source: src, sourceHandle: h, target: 'c', targetHandle: `in-${p}` }));
  const comb = (data: Partial<CombineData>, nodes: AppNode[], pairs: [string, string, number][]) => evaluateGraph([...nodes, { id: 'c', type: 'combine', position: at, data: { ...COMBINE_DEFAULTS, ...data } } as AppNode], wire(pairs)).get('c')!;
  const three = [col('a', [1, 2]), col('b', [10, 20]), col('cc', [100, 200])];
  const abc: [string, string, number][] = [['a', 'out', 0], ['b', 'out', 1], ['cc', 'out', 2]];
  const colVals = (r: ReturnType<typeof comb>) => (r.outputs.out?.t === 'column' ? Array.from(r.outputs.out.v.values).join() : `${r.outputs.out?.t} ${r.errors.join()}`);
  ok(colVals(comb({ result: 'column', order: [0, 2, 1] }, three, abc)) === '1,2,100,200,10,20' && colVals(comb({ result: 'column', how: 'interleave', order: [0, 2, 1] }, three, abc)) === '1,100,10,2,200,20' && colVals(comb({ result: 'column', how: 'sortx', desc: true }, three, abc)) === '200,100,20,10,2,1', 'Combine ▸ one column: in the order A C B, interleaved A₁C₁B₁ …, sorted by value (largest first)');
  const side = comb({ result: 'side', order: [1, 0], ports: { 1: { names: 'Bee' } } }, three.slice(0, 2), abc.slice(0, 2));
  ok(side.outputs.out?.t === 'dataset' && side.outputs.out.v.columns.map((c) => c.name).join() === 'Bee,a', 'Combine ▸ side by side: in the order of the list, renamed → a dataset');
  const sh = comb({ result: 'sheets', ports: { 1: { sheetOut: 'Two' }, 2: { sheetOut: 'Two' } } }, three, abc);
  ok(sh.outputs.out?.t === 'workbook' && sh.outputs.out.v.sheets.map((q) => `${q.name}:${q.columns.map((c) => c.name).join('+')}`).join(' ') === 'Sheet 1:a Two:b+cc', 'Combine ▸ in sheets: the inputs with the same sheet side by side → a workbook');
  const into = comb({ result: 'into', into: 0, ports: { 0: { sheet: 'N' }, 1: { action: 'after', ref: 'B', names: 'A' }, 2: { action: 'under', ref: 'D' } } }, [book, col('a', [7, 8]), col('cc', [9])], [['w', 'book', 0], ['a', 'out', 1], ['cc', 'out', 2]]);
  const o = into.outputs.out;
  const nSheet = o?.t === 'workbook' ? o.v.sheets.find((q) => q.name === 'N') : undefined;
  ok(o?.t === 'workbook' && o.v.sheets.length === 2 && o.v.sheets[0].columns[0].name === 'p' && nSheet?.columns.map((c) => c.name).join() === 'B,A,C,D' && Array.from(nSheet.columns[1].values).join() === '7,8,NaN' && Array.from(nSheet.columns[3].values).join() === '3,6,9', `Combine ▸ into a table: A put between B and C of sheet N, another continuing D; the other sheet kept (${nSheet?.columns.map((c) => c.name).join()})`);
  const cnInto = { id: 'c', type: 'combine', position: at, data: { ...COMBINE_DEFAULTS, result: 'into', into: 0 } } as AppNode;
  const ctx = { node: (nid: string) => (nid === 'w' ? book : nid === 'c' ? cnInto : undefined), edges: wire([['w', 'book', 0]]) };
  ok(sourcePort(cnInto, 'out', ctx) === 'workbook' && sourcePort({ ...cnInto, data: { ...cnInto.data, result: 'column' } } as AppNode, 'out') === 'column' && comb({ result: 'into', into: 0, ports: { 1: { action: 'after', ref: 'zz' } } }, three.slice(0, 2), abc.slice(0, 2)).errors[0] === 'B: no column “zz” in A.', 'Combine ▸ the output port: into a sheet of a workbook → a workbook, one column → a column; a missing column said');
}

// ---- Editable figures: the project inside an SVG / PNG (embed.ts), the figures of a Word / PowerPoint document
// replaced (office.ts) ----
{
  const ex = EXAMPLES[0].make();
  const p = toProject(ex.nodes, ex.edges, 'Spectra', 'pid1');
  const fig = { node: 'n1', path: ['g1'], name: 'Figure 1' };
  const e = await makeEmbedded(p, 'pid1', fig, 'full');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10pt" height="5pt"><rect width="10" height="5"/></svg>';
  const s1 = svgWithProject(svg, e);
  const s2 = svgWithProject(s1, e);
  const back = svgProject(s2);
  const opened = back ? await openEmbedded(back) : 'none';
  ok(!!back && s2.split('graph-flow-h-').length === 2 && !s2.includes('<metadata') && s2.endsWith('<rect width="10" height="5"/></svg>') && back.projectId === 'pid1' && back.figure.path.join() === 'g1' && back.projectName === 'Spectra', 'editable figure: the project in an SVG (once, when written again), read back');
  ok(typeof opened !== 'string' && JSON.stringify(opened.nodes) === JSON.stringify(p.nodes) && JSON.stringify(opened.edges) === JSON.stringify(p.edges) && opened.id === 'pid1', 'editable figure: the project opened from an SVG is the one exported (nodes, connections, id)');
  ok(fileProject(new TextEncoder().encode(s2))?.revision === e.revision && fileProject(new TextEncoder().encode(svg)) === null && svgProject(s2.replace('graph-flow-p000-', 'graph-flow-p001-')) === null, 'editable figure: a file read as SVG; a plain SVG has no project');
  // the first exports: the JSON in <metadata> — still read; written again, in groups
  const old = `<svg xmlns="http://www.w3.org/2000/svg"><metadata><graph-flow xmlns="https://graph-flow.app/figure">${JSON.stringify(e).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</graph-flow></metadata><rect/></svg>`;
  const again = svgWithProject(old, e);
  ok(svgProject(old)?.project === e.project && !again.includes('<metadata') && svgProject(again)?.project === e.project, 'editable figure: an SVG of the first exports (<metadata>) still read; written again in groups');
  // a project of many pieces (imported data)
  const bigData = Array.from({ length: 4000 }, (_, i) => `${i},${Math.sin(i * 1.7).toFixed(6)}`).join('\n');
  const big = { ...p, nodes: [...p.nodes, { id: 'imp-big', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: bigData, textId: 'imp-big' } } as AppNode] };
  const eb = await makeEmbedded(big, 'pid1', fig, 'full');
  const sb = svgWithProject(svg, eb);
  const bo = svgProject(sb);
  const bp = bo ? await openEmbedded(bo) : 'none';
  ok(sb.split('graph-flow-p').length - 1 === Math.ceil(eb.project.length / 8000) && sb.split('graph-flow-p').length > 3 && typeof bp !== 'string' && (bp.nodes.at(-1)?.data as { text?: string } | undefined)?.text === bigData, `editable figure: a project of ${(eb.project.length / 1024).toFixed(0)} kB in ${sb.split('graph-flow-p').length - 1} groups of 8000 characters, read back whole`);
  // an SVG as Word keeps it once inserted (Word 16: drawn again — no <metadata>, the paths rewritten; the ids of groups kept)
  const word = readFileSync(new URL('./fixtures/word-inserted.svg', import.meta.url), 'utf8');
  const we = svgProject(word);
  // the fixture was saved before the examples had their note: compared without it
  const wx0 = EXAMPLES[0].make();
  const wx = { ...wx0, nodes: wx0.nodes.filter((q) => q.id !== 'about') };
  const wp = we ? await openEmbedded(we) : 'none';
  ok(!word.includes('<metadata') && we?.projectId === 'pidW' && typeof wp !== 'string' && wp.nodes.map((q) => `${q.id}:${q.type}`).join() === toProject(wx.nodes, wx.edges).nodes.map((q) => `${q.id}:${q.type}`).join(), 'editable figure: the project read from an SVG inserted in Word (the file Word keeps, scripts/fixtures/word-inserted.svg)');
  const r1 = await projectRevision(p);
  const renamed = await projectRevision({ ...p, name: 'Other', id: 'x' });
  const changed = await projectRevision({ ...p, nodes: p.nodes.map((n, i) => (i === 0 ? { ...n, data: { ...n.data, label: 'changed' } } : n)) as typeof p.nodes });
  ok(r1 === e.revision && /^[0-9a-f]{16}$/.test(r1) && renamed === r1 && changed !== r1, 'editable figure: the revision — the same project the same; its name or id do not change it; a node changed does');
  const nd = await makeEmbedded(p, 'pid1', fig, 'nodata');
  const ndp = await openEmbedded(nd);
  const imports = (q: typeof p) => q.nodes.filter((n) => n.type === 'import').map((n) => (n.data as { text: string }).text);
  ok(nd.data === 'nodata' && nd.revision === r1 && typeof ndp !== 'string' && imports(ndp).every((t) => t === '') && imports(withoutImported(p)).length === imports(p).length && nd.project.length <= e.project.length, `editable figure: without the imported data — the Import nodes kept, their text empty (${(e.project.length / 1024).toFixed(1)} kB → ${(nd.project.length / 1024).toFixed(1)} kB)`);
  // a PNG: the signature, IHDR, IDAT, IEND (the CRCs checked)
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const v of b) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: number[]) => {
    const b = new Uint8Array(12 + data.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, data.length);
    b.set(new TextEncoder().encode(type), 4);
    b.set(data, 8);
    dv.setUint32(8 + data.length, crc(b.subarray(4, 8 + data.length)));
    return Array.from(b);
  };
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...chunk('IDAT', [120, 156, 99, 248, 15, 0, 1, 1, 1, 0]), ...chunk('IEND', [])]);
  const p1 = pngWithProject(png, e);
  const p2 = pngWithProject(p1, nd);
  const walk = (b: Uint8Array) => {
    const out: string[] = [];
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let at = 8; at + 12 <= b.length; ) {
      const len = dv.getUint32(at);
      const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
      out.push(crc(b.subarray(at + 4, at + 8 + len)) === dv.getUint32(at + 8 + len) ? type : `${type}!`);
      at += 12 + len;
    }
    return out.join();
  };
  ok(walk(p1) === 'IHDR,IDAT,iTXt,IEND' && walk(p2) === 'IHDR,IDAT,iTXt,IEND' && pngProject(p2)?.data === 'nodata' && fileProject(p1)?.data === 'full' && pngProject(png) === null && isPng(p1), `editable figure: the project in a PNG (an iTXt chunk before IEND, its CRC right; once, when written again): ${walk(p2)}`);
  // a Word document: a figure in SVG (with its PNG), one in PNG only, a picture of another program
  const u8 = (s: string) => strToU8(s);
  const svgFile = u8(s1);
  const pngFile = p1;
  const other = png;
  const drawing = (blip: string, cx: number, cy: number) =>
    `<w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill>${blip}</pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  const docXml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r>${drawing('<a:blip r:embed="rId1"><a:extLst><a:ext uri="{96DAC541}"><asvg:svgBlip r:embed="rId2"/></a:ext></a:extLst></a:blip>', 1000000, 500000)}</w:r></w:p><w:p><w:r>${drawing('<a:blip r:embed="rId3"/>', 2000000, 1000000)}</w:r></w:p><w:p><w:r>${drawing('<a:blip r:embed="rId4"/>', 300000, 300000)}</w:r></w:p></w:body></w:document>`;
  const rels = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/><Relationship Id="rId2" Type="image" Target="media/image2.svg"/><Relationship Id="rId3" Type="image" Target="media/image3.png"/><Relationship Id="rId4" Type="image" Target="media/image4.png"/><Relationship Id="rId9" Type="hyperlink" Target="https://x.org" TargetMode="External"/></Relationships>`;
  const docx = zipSync({ '[Content_Types].xml': u8('<Types/>'), 'word/document.xml': u8(docXml), 'word/_rels/document.xml.rels': u8(rels), 'word/media/image1.png': pngFile, 'word/media/image2.svg': svgFile, 'word/media/image3.png': pngFile, 'word/media/image4.png': other, 'docProps/core.xml': u8('<core/>') });
  const d = readOffice(docx, 'paper.docx');
  ok(typeof d !== 'string' && d.kind === 'docx' && d.pictures === 3 && d.figures.length === 2 && d.figures[0].source === 'word/media/image2.svg' && d.figures[0].png === 'word/media/image1.png' && d.figures[0].cx === 1000000 && d.figures[1].source === 'word/media/image3.png' && d.figures[1].index === 1 && d.figures[1].cy === 1000000, `Word document: 3 pictures, the 2 figures with a project found (SVG with its PNG; PNG), their size (${typeof d === 'string' ? d : d.figures.map((f) => f.source).join(', ')})`);
  ok(typeof readOffice(u8('not a zip'), 'a.docx') === 'string' && typeof readOffice(zipSync({ 'a.txt': u8('x') }), 'a.docx') === 'string', 'Word document: a file that is not one — said');
  if (typeof d !== 'string') {
    const newSvg = u8('<svg>new</svg>');
    const newPng = Uint8Array.of(1, 2, 3);
    const out = unzipSync(writeOffice(d, [{ part: 'word/document.xml', index: 0, svg: newSvg, png: newPng, widthPt: 200, heightPt: 100 }, { part: 'word/document.xml', index: 1, png: Uint8Array.of(9) }]));
    const xml = strFromU8(out['word/document.xml']);
    const same = (k: string) => strFromU8(out[k]) === strFromU8(unzipSync(docx)[k]);
    ok(strFromU8(out['word/media/image2.svg']) === '<svg>new</svg>' && out['word/media/image1.png'].join() === '1,2,3' && out['word/media/image3.png'].join() === '9' && out['word/media/image4.png'].join() === other.join(), 'Word document updated: the SVG and PNG of the first figure, the PNG of the second replaced; the other picture left alone');
    ok(xml.includes(`<wp:extent cx="${200 * EMU_PER_PT}" cy="${100 * EMU_PER_PT}"/>`) && xml.includes(`<a:ext cx="${200 * EMU_PER_PT}" cy="${100 * EMU_PER_PT}"/>`) && xml.includes('<wp:extent cx="2000000" cy="1000000"/>') && xml.includes('<wp:extent cx="300000" cy="300000"/>') && xml.includes('<a:ext uri="{96DAC541}">'), 'Word document updated: the first figure at its physical size (wp:extent and a:ext, EMU); the others as they were');
    ok(Object.keys(out).join() === Object.keys(unzipSync(docx)).join() && same('[Content_Types].xml') && same('word/_rels/document.xml.rels') && same('docProps/core.xml'), 'Word document updated: the same parts in the same order, the others unchanged');
  }
  // a PowerPoint presentation: a picture on a slide, its media one folder up
  const slide = `<p:sld><p:cSld><p:spTree><p:pic><p:nvPicPr/><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="10" y="20"/><a:ext cx="4000000" cy="3000000"/></a:xfrm></p:spPr></p:pic></p:spTree></p:cSld></p:sld>`;
  const pptx = zipSync({ '[Content_Types].xml': u8('<Types/>'), 'ppt/presentation.xml': u8('<p:presentation/>'), 'ppt/slides/slide1.xml': u8(slide), 'ppt/slides/_rels/slide1.xml.rels': u8('<Relationships><Relationship Id="rId2" Target="../media/image7.png"/></Relationships>'), 'ppt/media/image7.png': pngFile });
  const pd = readOffice(pptx, 'talk.pptx');
  ok(typeof pd !== 'string' && pd.kind === 'pptx' && pd.figures.length === 1 && pd.figures[0].source === 'ppt/media/image7.png' && pd.figures[0].cx === 4000000, 'PowerPoint: the figure on a slide found (its media in ../media), its size');
  if (typeof pd !== 'string') {
    const out = unzipSync(writeOffice(pd, [{ part: 'ppt/slides/slide1.xml', index: 0, png: Uint8Array.of(7), widthPt: 72, heightPt: 36 }]));
    ok(out['ppt/media/image7.png'].join() === '7' && strFromU8(out['ppt/slides/slide1.xml']).includes(`<a:off x="10" y="20"/><a:ext cx="${72 * EMU_PER_PT}" cy="${36 * EMU_PER_PT}"/>`), 'PowerPoint updated: the PNG replaced, the picture at its size, in the same place');
  }
}

// ---- Plots, stage 1: the axis title from several curves, the range out to a minor tick, a legend outside the frame ----
{
  const cv = (x: string, y: string, extra: Partial<Curve> = {}): Curve => ({ key: y, label: y, series: { x: column(x, Float64Array.of(1, 2)), y: column(y, Float64Array.of(1, 2)) }, style: curveStyle({}), ...extra }) as Curve;
  ok(autoTitle([cv('t', 'Control (mg/L)'), cv('t', 'Treated (mg/L)')], 'y') === 'Control, Treated (mg/L)' && autoTitle([cv('t', 'B (mM)'), cv('t (2)', 'fit of B (mM)')], 'y') === 'B (mM)', 'axis title: two quantities of one unit named both, the unit once; data and its fit: the data’s name');
  ok(autoTitle([cv('Time (s)', 'a'), cv('Time (s) (2)', 'b')], 'x') === 'Time (s)' && autoTitle(['a', 'b', 'c', 'd'].map((n) => cv('t', `${n} (mg/L)`)), 'y') === 'Value (mg/L)' && autoTitle([cv('t', 'U (V)'), cv('t', 'I (A)')], 'y') === 'U (V), I (A)' && autoTitle([cv('t', 'Signal (mV)')], 'y') === 'Signal (mV)', 'axis title: a copy’s “ (2)” left out; more than 3 of one unit: “Value (unit)”; different units listed; one curve: its name');
  const r1 = axisRange({ ...AXIS_DEFAULTS, minor: 1 }, -0.3, 10.5);
  const r2 = axisRange({ ...AXIS_DEFAULTS, minor: 1 }, 0.1, 9.3);
  const r3 = axisRange({ ...AXIS_DEFAULTS, minor: 4 }, -0.3, 10.5);
  const r4 = axisRange({ ...AXIS_DEFAULTS, minor: 1 }, 95, 189);
  ok(r1.join() === '-1,12' && r2.join() === '0,10' && near(r3[0], -0.4, 1e-12) && r3[1] === 12 && r4.join() === '80,200', `axis range: out to the major ticks; data crossing 0 by a little only, out to the nearest minor tick past 0 (${r1} · ${r2} · ${r3} · ${r4})`);
  // a legend outside the frame, at the right and below: room kept for it past the axis, inside the page
  const ex = EXAMPLES[1].make();
  const pl = ex.nodes.find((n) => n.type === 'plot1d')!;
  const figWith = (legend: Record<string, unknown>) => evaluateGraph(ex.nodes.map((n) => (n.id === pl.id ? ({ ...n, data: { ...n.data, legend: { ...((n.data as Plot1DData).legend ?? { show: true }), show: true, auto: false, ...legend } } } as AppNode) : n)), ex.edges).get(pl.id)!.view.figure!;
  for (const [what, legend, side] of [['right', { x: 103, y: 0, anchor: 'tl' }, 'right'], ['below', { x: 50, y: 103, anchor: 'tc', arrange: 'row' }, 'bottom']] as const) {
    const f = figWith(legend);
    const [W, H] = [toPt(f.width, f.unit), toPt(f.height, f.unit)];
    const ax = f.axes[0];
    const fr = { x: (ax.style.pos.x / 100) * W, y: (ax.style.pos.y / 100) * H, w: (ax.style.pos.w / 100) * W, h: (ax.style.pos.h / 100) * H };
    const need = axisNeeds(ax, fr, f.text);
    const b = legendPlace(ax.legends[0], fr, f.text, need);
    const inPage = b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5;
    const pastAxis = side === 'right' ? b.x >= fr.x + fr.w + need.right - 0.5 : b.y >= fr.y + fr.h + need.bottom - 0.5;
    ok(b.side === side && inPage && pastAxis, `a legend outside the frame (${what}): past the numbers and title of that side, inside the page (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.w.toFixed(1)} × ${b.h.toFixed(1)} in ${W.toFixed(0)} × ${H.toFixed(0)} pt)`);
  }
}

// ---- Plots, stage 2: the columns of errors told by their names (Plot these columns) ----
{
  const names = ['Time (min)', 'Control (mg/L)', 'SD Control', 'Treated (mg/L)', 'Treated SE', 'Base (a.u.)', 'Response', 'σ', 'Phase (deg)', '±Dose'];
  ok(names.map((n) => (isErrorName(n) ? 'E' : '-')).join('') === '--E-E--E-E', `error columns by their names: SD, SE, σ, ± — not Base, Response, Phase (${names.map((n) => (isErrorName(n) ? 'E' : '-')).join('')})`);
  const t1 = errorTargets(['x', 'Control (mg/L)', 'Treated (mg/L)', 'SD Treated', 'SD Control'], ['Control (mg/L)', 'Treated (mg/L)']);
  const t2 = errorTargets(['x', 'A', 'err', 'B', 'err (2)'], ['A', 'B']);
  ok(t1.get('Control (mg/L)') === 'SD Control' && t1.get('Treated (mg/L)') === 'SD Treated' && t2.get('A') === 'err' && t2.get('B') === 'err (2)', 'error columns: the Y named in them (in any order), else the Y on their left');
}

// ---- Life data against reliability 0.9 and lifelines 0.30 (scripts/fixtures/reliability-ref.py): suspensions, rank
// regression, the 3-parameter Weibull, Fisher bounds, B lives, Kaplan–Meier ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/reliability-ref.json', import.meta.url), 'utf8'));
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
  const fail: number[] = R.fail;
  const sus: number[] = R.susp;
  const items = [...fail.map((v) => ({ v, s: false })), ...sus.map((v) => ({ v, s: true }))].sort((a, b) => a.v - b.v || Number(a.s) - Number(b.s));
  const xs = items.map((q) => q.v);
  const ss = items.map((q) => q.s);
  const pos = adjustedPositions(xs, ss, 'benard');
  ok(pos.length === R.positions.y.length && Math.max(...pos.map((p, i) => rel(p, R.positions.y[i]))) < 1e-12, 'life data: Johnson’s adjusted ranks (Benard) as reliability’s plotting positions');
  const w = fitMLE('weibull', fail, sus);
  const cov = fisherCov('weibull', w, fail, sus);
  const ci = paramCI('weibull', w, cov, 95);
  const W = R.weibull_mle;
  ok(rel(w[0], W.beta) < 1e-8 && rel(w[1], W.eta) < 1e-8 && Math.abs(logLik('weibull', w, fail, sus) - W.loglik) < 1e-6, `Weibull with suspensions, maximum likelihood: β, η and the log-likelihood as reliability (β ${w[0].toFixed(6)}, η ${w[1].toFixed(3)})`);
  ok(Math.max(rel(ci[0][0], W.beta_ci[0]), rel(ci[0][1], W.beta_ci[1]), rel(ci[1][0], W.eta_ci[0]), rel(ci[1][1], W.eta_ci[1])) < 1e-5, 'Weibull: the 95 % Fisher-matrix intervals of β and η as reliability');
  const b10 = bLife('weibull', w, 0, 0.1, cov, 95);
  const b1 = bLife('weibull', w, 0, 0.01, cov, 95);
  ok(Math.max(rel(b10.value, W.b10[0]), rel(b10.lo, W.b10[1]), rel(b10.hi, W.b10[2]), rel(b1.value, W.b1[0]), rel(b1.lo, W.b1[1]), rel(b1.hi, W.b1[2])) < 1e-5, `Weibull: B10 and B1 with their intervals as reliability (B10 ${b10.value.toFixed(2)} [${b10.lo.toFixed(2)}, ${b10.hi.toFixed(2)}])`);
  const failSorted = xs.filter((_, i) => !ss[i]);
  const rrx = fitRR('weibull', failSorted, pos, 'rrx')!;
  const rry = fitRR('weibull', failSorted, pos, 'rry')!;
  ok(rel(rrx[0], R.weibull_rrx.beta) < 1e-10 && rel(rrx[1], R.weibull_rrx.eta) < 1e-10 && rel(rry[0], R.weibull_rry.beta) < 1e-10 && rel(rry[1], R.weibull_rry.eta) < 1e-10, 'Weibull: rank regression X on Y and Y on X (with suspensions) as reliability');
  const others: [ProbDist, number[]][] = [['lognormal', [R.lognormal.mu, R.lognormal.sigma]], ['normal', [R.normal.mu, R.normal.sigma]], ['exponential', [R.exponential.mean]], ['gamma', [R.gamma.shape, R.gamma.scale]], ['logistic', R.logistic], ['gumbel', R.gumbel]];
  const dev = others.map(([k, ref]) => Math.max(...fitMLE(k, fail, sus).map((v, i) => rel(v, ref[i]))));
  ok(Math.max(...dev) < 2e-5, `maximum likelihood with suspensions — Lognormal, Normal, Exponential, Gamma (reliability), Logistic, Gumbel (scipy): ${dev.map((v) => v.toExponential(0)).join(', ')}`);
  const x3: number[] = R.weibull3.x;
  const g3 = fitThreshold('weibull', x3, x3.map(() => false), adjustedPositions(x3, x3.map(() => false), 'benard'), 'mle');
  const p3 = fitMLE('weibull', x3.map((v) => v - g3), []);
  ok(rel(g3, R.weibull3.gamma) < 1e-6 && rel(p3[0], R.weibull3.beta) < 1e-6 && rel(p3[1], R.weibull3.eta) < 1e-6, `3-parameter Weibull, maximum likelihood: γ, β, η as reliability (γ ${g3.toFixed(3)})`);
  const km = kaplanMeier(R.km.t, R.km.e.map((e: number) => e === 0), 95);
  const at = (t: number) => R.km.times.indexOf(t);
  const kmDev = Math.max(...km.t.map((t, i) => Math.max(Math.abs(km.S[i] - R.km.S[at(t)]), Math.abs(km.lo[i] - R.km.lo[at(t)]), Math.abs(km.hi[i] - R.km.hi[at(t)]))));
  ok(km.t.length === 7 && kmDev < 1e-12 && km.censored.length === 4, `Kaplan–Meier with ties and suspensions, Greenwood’s interval (log–log) as lifelines (${kmDev.toExponential(1)})`);
  ok(suspendedOf('S', NaN) === true && suspendedOf('failed', NaN) === false && suspendedOf(undefined, 0) === true && suspendedOf(undefined, 1) === false && suspendedOf('maybe', NaN) === null, 'life data: the status read — S / 0 suspended, F / 1 failed, anything else not read');
  // the node: a status column, the B life and the intervals in its statistics, the box on the figure
  const text = `Cycles,Status\n${fail.map((v) => `${v},F`).join('\n')}\n${sus.map((v) => `${v},S`).join('\n')}\n`;
  const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: 'rel' } } as AppNode;
  const node = (extra: Record<string, unknown>) => evaluateGraph([imp, { id: 'p', type: 'probplot', position: { x: 0, y: 0 }, data: { ...PROBPLOT_DEFAULTS, dist: 'weibull', censor: 'Status', ...extra } } as AppNode], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  const r = node({ kind: 'prob', line: 'dist', bLives: '10', paramBox: 'br', refLine: true, band: 'pointwise' });
  const col = (name: string) => (r.outputs.stats?.t === 'dataset' ? r.outputs.stats.v.columns.find((c) => c.name === name)?.values[0] ?? NaN : NaN);
  const fig = r.view.figure!;
  ok(r.errors.length === 0 && col('failures') === 26 && col('suspended') === 6 && rel(col('k (shape)'), W.beta) < 1e-8 && rel(col('B10'), W.b10[0]) < 1e-7 && rel(col('B10 95 % upper'), W.b10[2]) < 1e-5, 'Probability plot with a status column: failures and suspensions, the fit, B10 and its interval in the statistics');
  ok(fig.axes[0].annotations.some((a) => a.kind === 'text' && a.text.text.includes('β = 1.916')) && fig.axes[0].curves.some((c) => c.key.endsWith(':ref')) && fig.axes[0].curves.some((c) => c.label === '95 % confidence bounds'), 'Probability plot: the parameters written in a corner, the 63.2 % line, the Fisher bounds of the fit');
  const km2 = node({ kind: 'ecdf', complementary: true });
  ok(km2.errors.length === 0 && km2.view.figure!.axes[0].curves.some((c) => c.key.endsWith(':susp')), 'ECDF with suspensions: Kaplan–Meier, the suspensions marked');
  // a probability axis: every tick of the dense set, the numbers by importance where they do not touch
  const dr = fig.axes[0];
  const W2 = toPt(fig.width, fig.unit);
  const H2 = toPt(fig.height, fig.unit);
  const fr = { x: (dr.style.pos.x / 100) * W2, y: (dr.style.pos.y / 100) * H2, w: (dr.style.pos.w / 100) * W2, h: (dr.style.pos.h / 100) * H2 };
  const left = axesGeometry(dr, fr, fig.text).drawn.find((a) => a.key === 'left')!;
  const shown = left.pos.labels.filter(Boolean);
  ok(shown.includes('50') && shown.includes('10') && shown.includes('1') && shown.length >= 6 && left.pos.major.length > shown.length, `a probability axis: the dense ticks kept, the numbers by importance (${shown.join(' ')})`);
}

// ---- Bland–Altman: the values outside the frame with one number of decimals, the share within the limits; labels at
// the curves' ends ----
{
  const ex = EXAMPLES.find((e) => e.name.startsWith('Bland–Altman'))!.make();
  const res = evaluateGraph(ex.nodes, ex.edges);
  const ba = ex.nodes.find((n) => n.type === 'blandaltman')!;
  const r = res.get(ba.id)!;
  const fig = r.view.figure!;
  const ax = fig.axes[0];
  const texts = ax.curves.filter((c) => c.style.endLabel).map((c) => c.label);
  const decs = texts.map((t) => (/[−-]?\d+\.?(\d*)$/.exec(t)?.[1] ?? '').length);
  ok(texts.length === 3 && new Set(decs).size === 1 && texts.every((t) => t.includes('\\\\')), `Bland–Altman: the values on the lines with one number of decimals, the name over the value (${texts.map((t) => t.replace('\\\\', ' ')).join(' | ')})`);
  const [W, H] = [toPt(fig.width, fig.unit), toPt(fig.height, fig.unit)];
  const fr = { x: (ax.style.pos.x / 100) * W, y: (ax.style.pos.y / 100) * H, w: (ax.style.pos.w / 100) * W, h: (ax.style.pos.h / 100) * H };
  const ends = endLabels(ax, fr, fig.text, axisNeeds(ax, fr, fig.text));
  const apart = ends.every((e, i) => i === 0 || e.y - ends[i - 1].y >= 1.9 * e.st.size);
  ok(ends.length === 3 && ends.every((e) => e.x > fr.x + fr.w && e.x + e.w <= W + 0.5) && apart, 'end labels: outside the frame at the right, inside the page, apart from each other');
  const st = r.outputs.stats?.t === 'dataset' ? r.outputs.stats.v : null;
  const pts = r.outputs.points?.t === 'dataset' ? r.outputs.points.v : null;
  const col = (ds: Dataset | null, name: string) => ds?.columns.find((c) => c.name === name)?.values ?? new Float64Array();
  const ys = col(pts, pts?.columns.find((c) => c.role === 'y')?.name ?? '');
  const [lo, hi] = [col(st, 'lower limit')[0], col(st, 'upper limit')[0]];
  const manual = (100 * Array.from(ys).filter((v) => v >= lo && v <= hi).length) / ys.length;
  ok(near(col(st, 'within limits (%)')[0], manual, 1e-12) && manual > 80, `Bland–Altman: the share of the pairs within the limits (${manual.toFixed(1)} %)`);
}

// ---- Plots, stage 5: the decimal comma, a title over the figure, axes crossing the frame at a value ----
{
  ok(commaNumbers('2.5') === '2,5' && commaNumbers('−0.25') === '−0,25' && commaNumbers('1.5×10^{3}') === '1,5×10^{3}' && commaNumbers('v.2 and 10') === 'v.2 and 10' && commaNumbers('B10 = 279.8 [179.1, 436.9]') === 'B10 = 279,8 [179,1, 436,9]', 'decimal comma: the point between two digits only');
  const ex = EXAMPLES[1].make();
  const pl = ex.nodes.find((n) => n.type === 'plot1d')!;
  const figOf = (patch: (d: Plot1DData) => Partial<Plot1DData>) => evaluateGraph(ex.nodes.map((n) => (n.id === pl.id ? ({ ...n, data: { ...n.data, ...patch(n.data as Plot1DData) } } as AppNode) : n)), ex.edges).get(pl.id)!.view.figure!;
  const plain = figOf(() => ({}));
  const titled = figOf((d) => ({ page: { ...d.page!, title: 'Damped oscillation', comma: true } }));
  ok(titled.comma === true && !plain.comma && titled.annotations.some((a) => a.kind === 'text' && a.key === 'page-title' && a.text.text === 'Damped oscillation') && titled.axes[0].style.pos.y > plain.axes[0].style.pos.y + 2, `a title over the figure (the frame lowered: ${plain.axes[0].style.pos.y.toFixed(1)} → ${titled.axes[0].style.pos.y.toFixed(1)} %), the decimal comma kept by the figure`);
  const st = axesStyle((pl.data as Plot1DData).axes);
  const crossed = figOf(() => ({ axes: { ...st, sides: { ...st.sides, bottom: { ...st.sides.bottom, cross: 0 }, left: { ...st.sides.left, cross: 5 } } } }));
  const ax = crossed.axes[0];
  const [W, H] = [toPt(crossed.width, crossed.unit), toPt(crossed.height, crossed.unit)];
  const fr = { x: (ax.style.pos.x / 100) * W, y: (ax.style.pos.y / 100) * H, w: (ax.style.pos.w / 100) * W, h: (ax.style.pos.h / 100) * H };
  const g = axesGeometry(ax, fr, crossed.text);
  const b = g.drawn.find((a) => a.key === 'bottom')!;
  const l = g.drawn.find((a) => a.key === 'left')!;
  ok(near(b.cross!, g.sLeft.f(0), 1e-9) && near(l.cross!, g.sBottom.f(5), 1e-9) && b.cross! > fr.y && b.cross! < fr.y + fr.h && g.drawn.find((a) => a.key === 'top')!.cross === undefined, 'axes crossing the frame: the bottom axis at y = 0, the left one at x = 5 (inside the frame); the others at its edges');
  // crossing inside the frame: the margins only for the titles (and numbers at the axis' ends)
  ok(ax.style.pos.x < plain.axes[0].style.pos.x, `axes crossing the frame: no room kept for their numbers outside it (left margin ${plain.axes[0].style.pos.x.toFixed(1)} → ${ax.style.pos.x.toFixed(1)} %)`);
}

// ---- Plots, stage 6: a legend placed by itself where it covers the least of the data ----
{
  const at = { x: 0, y: 0 };
  // the data in the upper right: the legend goes upper left (the next in matplotlib's order); in the upper left: upper right
  const fig = (rows: string) => {
    const imp = { id: 'i', type: 'import', position: at, data: { ...IMPORT_DEFAULTS, text: `x,a,b\n${rows}`, textId: 'lg' } } as AppNode;
    const pl = { id: 'p', type: 'plot1d', position: at, data: { ...PLOT1D_DEFAULTS, style: { ...PLOT1D_DEFAULTS.style, mode: 'scatter' }, cols: { x: 'x', y: 'a' }, rows: [{ label: '', style: { ...PLOT1D_DEFAULTS.style, mode: 'scatter', color: '#D55E00' }, cols: { x: 'x', y: 'b' } }] } } as AppNode;
    return evaluateGraph([imp, pl], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!.view.figure!;
  };
  const upRight = Array.from({ length: 30 }, (_, i) => `${7 + (i % 6) * 0.5},${8 + (i % 5) * 0.4},${7.5 + (i % 4) * 0.5}`).join('\n') + '\n0,0,0\n';
  const upLeft = Array.from({ length: 30 }, (_, i) => `${(i % 6) * 0.5},${8 + (i % 5) * 0.4},${7.5 + (i % 4) * 0.5}`).join('\n') + '\n10,0,0\n';
  const a = fig(upRight).axes[0].legends[0];
  const b = fig(upLeft).axes[0].legends[0];
  ok(PLOT1D_DEFAULTS.legend?.auto === true && a.auto === true && a.anchor !== 'tr' && b.anchor === 'tr', `a legend placed by itself: away from the data (data upper right → ${a.anchor}; upper left → ${b.anchor}); a new Plot's legend automatic`);
}

// ---- Trend lines against numpy / scipy (scripts/fixtures/trend-ref.py): least squares, the band of the mean, R² ----
{
  const T = JSON.parse(readFileSync(new URL('./fixtures/trend-ref.json', import.meta.url), 'utf8'));
  const dev = (a: number[] | undefined, b: number[]) => (a && a.length === b.length ? Math.max(...a.map((v, i) => Math.abs(v - b[i]) / Math.max(1, Math.abs(b[i])))) : Infinity);
  const fitOf = (y: number[], spec: TrendSpec) => {
    const r = trendFit(T.x, y, spec);
    if (typeof r === 'string') throw new Error(r);
    return r;
  };
  const lin = fitOf(T.linear.y, { kind: 'linear', band: true });
  ok(dev(lin.coef, T.linear.coef) < 1e-12 && dev([lin.coef[1], lin.coef[0]], T.linear.polyfit) < 1e-12 && near(lin.r2, T.linear.r2, 1e-12) && dev(lin.xs, T.xs) < 1e-12 && dev(lin.lo, T.linear.lo) < 1e-10 && dev(lin.hi, T.linear.hi) < 1e-10, `trend line: linear least squares, R² and the 95 % band of the line as numpy (${lin.equation})`);
  const org = fitOf(T.linear.y, { kind: 'linear', origin: true });
  ok(dev(org.coef, T.origin.coef) < 1e-12 && near(org.r2, T.origin.r2, 1e-12), 'trend line: through the origin (R² uncentred, as spreadsheets)');
  const p3 = fitOf(T.poly3.y, { kind: 'poly', degree: 3, band: true });
  ok(dev(p3.coef, T.poly3.coef) < 1e-9 && near(p3.r2, T.poly3.r2, 1e-12) && dev(p3.lo, T.poly3.lo) < 1e-9 && dev(p3.hi, T.poly3.hi) < 1e-9, `trend line: a cubic (QR) and its band as numpy (${p3.equation})`);
  const ex = fitOf(T.exp.y, { kind: 'exp', band: true });
  ok(near(ex.coef[0], T.exp.A, 1e-10) && near(ex.coef[1], T.exp.B, 1e-12) && near(ex.r2, T.exp.r2, 1e-12) && dev(ex.lo, T.exp.lo) < 1e-9 && dev(ex.hi, T.exp.hi) < 1e-9, `trend line: exponential on ln y, its band back from the logs (${ex.equation})`);
  const pw = fitOf(T.power.y, { kind: 'power' });
  const lg = fitOf(T.log.y, { kind: 'log' });
  ok(near(pw.coef[0], T.power.A, 1e-10) && near(pw.coef[1], T.power.B, 1e-12) && near(pw.r2, T.power.r2, 1e-12) && dev(lg.coef, T.log.coef) < 1e-12 && near(lg.r2, T.log.r2, 1e-12), `trend line: power on ln x, ln y; logarithm (${pw.equation} · ${lg.equation})`);
  const ma = fitOf(T.linear.y, { kind: 'movavg', window: T.movavg.w });
  ok(dev(ma.xs, T.movavg.x) < 1e-12 && dev(ma.ys, T.movavg.y) < 1e-12, 'trend line: a centred moving average of 5 as numpy convolve');
  ok(typeof trendFit([1, 2, 3], [1, -1, 2], { kind: 'exp' }) !== 'string' && typeof trendFit([-1, -2], [1, 2], { kind: 'log' }) === 'string' && typeof trendFit([1, 1, 1], [1, 2, 3], { kind: 'linear' }) === 'string', 'trend line: the points that cannot be fitted left out, or said');
  // a Plot's curve with its trend line: the equation and R² in the legend, the band drawn
  const at = { x: 0, y: 0 };
  const rows = T.x.map((v: number, i: number) => `${v},${T.linear.y[i]}`).join('\n');
  const imp = { id: 'i', type: 'import', position: at, data: { ...IMPORT_DEFAULTS, text: `x,y\n${rows}\n`, textId: 'tr' } } as AppNode;
  const pl = { id: 'p', type: 'plot1d', position: at, data: { ...PLOT1D_DEFAULTS, style: { ...PLOT1D_DEFAULTS.style, mode: 'scatter' }, cols: { x: 'x', y: 'y' }, trend: { kind: 'linear', band: true, equation: true } } } as AppNode;
  const rp = evaluateGraph([imp, pl], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!;
  const tc = rp.view.figure?.axes[0].curves.find((c) => c.key.endsWith(':trend'));
  ok(rp.errors.length === 0 && !!tc && tc.label.includes('R² = ') && tc.label.includes(lin.equation) && tc.style.errStyle === 'band' && !!tc.series.yErr && tc.style.color === PLOT1D_DEFAULTS.style.color, `a Plot curve with its trend line: the equation and R² in the legend, the band (${tc?.label})`);
}

// a trend line leaves the axis title as the data's; a legend too large for the frame goes under it
{
  const at = { x: 0, y: 0 };
  const rows = Array.from({ length: 12 }, (_, i) => `${i},${(2 * i + 1).toFixed(2)},${(10 - i).toFixed(2)}`).join('\n');
  const imp = { id: 'i', type: 'import', position: at, data: { ...IMPORT_DEFAULTS, text: `Time (s),Signal (mV),Other (mV)\n${rows}\n`, textId: 'tt' } } as AppNode;
  const pl = { id: 'p', type: 'plot1d', position: at, data: { ...PLOT1D_DEFAULTS, cols: { x: 'Time (s)', y: 'Signal (mV)' }, trend: { kind: 'poly', degree: 3, band: true }, rows: [{ label: '', style: PLOT1D_DEFAULTS.style, cols: { x: 'Time (s)', y: 'Other (mV)' }, trend: { kind: 'exp' } }] } } as AppNode;
  const f = evaluateGraph([imp, pl], [{ id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' }]).get('p')!.view.figure!;
  const ax = f.axes[0];
  const [W, H] = [toPt(f.width, f.unit), toPt(f.height, f.unit)];
  const fr = { x: (ax.style.pos.x / 100) * W, y: (ax.style.pos.y / 100) * H, w: (ax.style.pos.w / 100) * W, h: (ax.style.pos.h / 100) * H };
  const left = axesGeometry(ax, fr, f.text).drawn.find((a) => a.key === 'left')!;
  ok(left.title === 'Signal, Other (mV)' && ax.legends[0].y > 100 && ax.style.pos.w > 60, `trend lines: the axis title stays the data's (${left.title}); a legend too large for the frame placed under it, the frame keeping its width (${ax.style.pos.w.toFixed(0)} %)`);
}

// ---- Plots, stage 8: curves over a bar chart (a second axis) and over a map ----
{
  const at = { x: 0, y: 0 };
  const imp = (id: string, text: string) => ({ id, type: 'import', position: at, data: { ...IMPORT_DEFAULTS, text, textId: id } }) as AppNode;
  const M = ['Jan', 'Feb', 'Mar', 'Apr'];
  const a = imp('a', `Month,Rain (mm)\n${M.map((m, i) => `${m},${40 + 10 * i}`).join('\n')}\n`);
  const b = imp('b', `Month,Temperature (°C)\nMar,5\nJan,-2\nFeb,0\nMay,16\n`);
  const bar = { id: 'c', type: 'barchart', position: at, data: { ...BARCHART_DEFAULTS, overlayRight: true } } as AppNode;
  const r = evaluateGraph([a, b, bar], [{ id: 'e1', source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'dataset' }, { id: 'e2', source: 'b', sourceHandle: 'out', target: 'c', targetHandle: 'overlay' }]).get('c')!;
  const fig = r.view.figure!;
  const ov = fig.axes[0].curves.find((c) => c.key === 'overlay:0')!;
  const bars = fig.axes[0].curves.find((c) => c.bars)!;
  const posOf = (m: string) => Array.from(bars.series.x.values)[M.indexOf(m)];
  ok(!!ov && ov.style.axisY === 'right' && ov.series.x.values[0] === posOf('Mar') && ov.series.x.values[1] === posOf('Jan') && Number.isNaN(ov.series.x.values[3]) && r.warnings.some((w) => w.includes('not among the categories')) && fig.axes[0].style.right.mode === 'own', 'Bar chart: a curve over the bars at the categories of the same name (one not among them said), on a second axis at the right');
  ok(sourcePort(bar, 'figure') === 'figure' && targetAccepts(bar, 'overlay').join() === 'dataset' && targetAccepts({ id: 'm', type: 'contour', position: at, data: CONTOUR_DEFAULTS } as AppNode, 'overlay').join() === 'dataset', 'the overlay port of Bar chart and Contour takes a dataset');
}

// ---- Histogram: distributions of positive values over the bars, log bins, weights, the mean and the median ----
{
  const R = JSON.parse(readFileSync(new URL('./fixtures/reliability-ref.json', import.meta.url), 'utf8'));
  const vals: number[] = R.fail;
  const base: HistSpec = { ...HISTOGRAM_DEFAULTS, bins: { ...HISTOGRAM_DEFAULTS.bins, mode: 'count', count: 8 }, fits: [] };
  const fitsOf = (kind: HistFitKind) => {
    const r = histogram([{ name: 'life', values: vals }], { ...base, fits: [{ kind, method: 'data' }] }, 'life');
    if (typeof r === 'string') throw new Error(r);
    return r;
  };
  const dev: number[] = [];
  for (const kind of ['lognormal', 'weibull', 'exponential', 'gamma'] as const) {
    const r = fitsOf(kind);
    const f = r.fits[0];
    const ref = fitDist(kind, vals);
    dev.push(Math.max(...ref.map((v, k) => Math.abs(f.params[k].value - v) / Math.abs(v))));
    // the curve: the count expected per bin width (n · width · pdf)
    const D = makeDist(kind, ref);
    const w = r.edges[1] - r.edges[0];
    dev.push(Math.abs(f.curve(500) - vals.length * w * D.pdf(500)) / (vals.length * w * D.pdf(500)));
    if (!(f.params[0].error > 0)) dev.push(Infinity);
  }
  ok(Math.max(...dev) < 1e-12, `Histogram: lognormal, Weibull, exponential, gamma by maximum likelihood (as the Probability plot), their errors, their curves as counts per bin (${Math.max(...dev).toExponential(1)})`);
  const lb = binEdges([1, 3, 10, 30, 100, 300, 1000], { ...base.bins, mode: 'count', count: 3, log: true });
  ok(Array.isArray(lb) && lb.length === 4 && lb.every((e, k) => near(e, 10 ** k, 1e-12)), `Histogram: bins equal on a log scale (${Array.isArray(lb) ? lb.join(', ') : lb})`);
  ok(histCounts([1, 2, 2, 3], [0, 1.5, 3], [2, 1, 1, 0.5]).join() === '2,2.5', 'Histogram: every value counted with its weight');
  const mk = histogram([{ name: 'v', values: [1, 2, 3, 10] }], { ...base, marks: { mean: true, median: true } }, 'v');
  const lines = typeof mk === 'string' ? [] : mk.curves.filter((c) => c.key.endsWith(':mean') || c.key.endsWith(':median')).map((c) => c.series.x.values[0]);
  ok(lines.join() === '4,2.5', `Histogram: the mean and the median of a column as vertical lines (${lines.join(', ')})`);
}

{
  // Bar chart sorted: the categories of text by the first series' value (or the stacked total), largest or smallest first
  const t: BarTable = { name: 'v', textCats: true, categories: ['a', 'b', 'c'].map((label, i) => ({ pos: i + 1, label })), series: [{ name: 'p', values: [2, 5, NaN], plus: [0.1, 0.2, 0.3], minus: [0.1, 0.2, 0.3] }, { name: 'q', values: [9, 1, 3], plus: [0, 0, 0], minus: [0, 0, 0] }] };
  const desc = sortTable(t, 'desc', false);
  const tot = sortTable(t, 'asc', true);
  ok(desc.categories.map((c) => c.label).join() === 'b,a,c' && desc.categories.map((c) => c.pos).join() === '1,2,3' && desc.series[0].plus.join() === '0.2,0.1,0.3' && desc.series[1].values.join() === '1,9,3' && tot.categories.map((c) => c.label).join() === 'c,b,a', 'Bar chart: sorted by the first series (missing last) or by the stacked total, the errors following');
  const num = { ...t, textCats: false };
  ok(sortTable(num, 'desc', false) === num, 'Bar chart: numeric categories keep their places when sorted');
}

{
  // Box: “n = …” under every box, below its lowest point
  const bx = boxViolin(['a', 'b'], ['v'], ['a', 'b'].map((c, i) => ({ cat: c, series: 'v', values: [1, 2, 3, 4, 5, 6].slice(0, 5 + i).map((x) => x + 10 * i) })), { ...BOXVIOLIN_DEFAULTS, showN: true });
  const nc = typeof bx === 'string' ? undefined : bx.curves.find((c) => c.key === 'box:n');
  const its = typeof bx === 'string' ? [] : bx.curves.flatMap((c) => c.boxes?.items ?? []);
  ok(!!nc && nc.labelValues!.text!.join('|') === 'n = 5|n = 6' && nc.series.y.values[0] < its[0].vlo && nc.series.y.values[1] < its[1].vlo && nc.series.x.values[1] === its[1].pos && !!nc.noLegend, 'Box: n written under every box, below its whisker, out of the legend');
}

{
  // Ternary coloured by a column: a colour each point on the map over the values' range, the colour bar's range
  const tc = ternaryChart([{ group: 'g', a: 1, b: 1, c: 1, v: 10 }, { group: 'g', a: 2, b: 1, c: 1, v: 20 }, { group: 'g', a: 1, b: 2, c: 1, v: NaN }], { ...TERNARY_DEFAULTS, cmap: 'viridis' }, ['A', 'B', 'C']);
  const T = typeof tc === 'string' ? null : tc.curves[0];
  const cs = T?.ternary?.series[0].colors ?? [];
  const st = stopsOf('viridis', []);
  ok(!!T && T.colorRange?.join() === '10,20' && T.style.colorBy === 'column' && cs[0] === mapColor(st, 0) && cs[1] === mapColor(st, 1) && cs[2] === '#bbbbbb', 'Ternary: coloured by a column — the map over its range, a missing value grey');
  const plain = ternaryChart([{ group: 'g', a: 1, b: 1, c: 1 }], TERNARY_DEFAULTS, ['A', 'B', 'C']);
  ok(typeof plain !== 'string' && !plain.curves[0].ternary!.series[0].colors && !plain.curves[0].colorRange, 'Ternary: without a colour column, the groups’ colours');
}

{
  // 3D symbols coloured by a 4th column: its range on the map (not Z), the colour bar named after it
  const names = { x: 'x', y: 'y', z: 'z', c: 'T (K)' };
  const p = plot3d({ kind: 'points', names, groups: [{ name: 'A', x: [0, 1, 2], y: [0, 1, 2], z: [5, 6, 7], c: [100, 300, 200] }] }, { ...PLOT3D_DEFAULTS, kind: 'scatter', colorBy: 'column', cmap: 'viridis' });
  const st = stopsOf('viridis', []);
  const pc = typeof p === 'string' ? [] : p.curves[0].three!.points[0].colors;
  ok(typeof p !== 'string' && p.colorRange?.join() === '100,300' && pc[0] === mapColor(st, 0) && pc[1] === mapColor(st, 1) && pc[2] === mapColor(st, 0.5) && p.curves[0].group?.name === 'T (K)', '3D: symbols coloured by a 4th column, its range and name on the colour bar');
  const byz = plot3d({ kind: 'points', names, groups: [{ name: 'A', x: [0, 1], y: [0, 1], z: [5, 7] }] }, { ...PLOT3D_DEFAULTS, kind: 'scatter', colorBy: 'z' });
  ok(typeof byz !== 'string' && byz.colorRange?.join() === '5,7' && byz.curves[0].group?.name === 'z', '3D: coloured by Z as before');
}

{
  // One point per X: the mean ± SD / SE / 95 % CI (t: scipy.stats.t.ppf(0.975, 2) = 4.302652729749464, (0.975, 1) =
  // 12.706204736174698), the median with Q1 – Q3 as numpy.percentile; X of numbers sorted, masked rows left out
  const X = column('t', Float64Array.from([2, 1, 1, 2, 1, 3]));
  const Y = { ...column('v', Float64Array.from([4, 1, 2, 8, 6, 100])), mask: Uint8Array.from([0, 0, 0, 0, 0, 1]) };
  const sd1 = Math.sqrt(7);
  const sd2 = Math.sqrt(8);
  const m = aggregateByX(X, Y, { stat: 'mean', err: 'ci95' });
  const se = aggregateByX(X, Y, { stat: 'mean', err: 'se' });
  const sd = aggregateByX(X, Y, { stat: 'mean', err: 'sd' });
  ok(Array.from(m.x.values).join() === '1,2' && Array.from(m.y.values).join() === '3,6' && m.n.join() === '3,2' && near(m.plus!.values[0], (4.302652729749464 * sd1) / Math.sqrt(3), 1e-9) && near(m.minus!.values[1], (12.706204736174698 * sd2) / Math.sqrt(2), 1e-9) && near(se.plus!.values[0], sd1 / Math.sqrt(3), 1e-12) && near(sd.minus!.values[1], sd2, 1e-12), 'One point per X: mean ± SD, SE, 95 % CI (t) as scipy; X sorted, a masked row left out');
  const md = aggregateByX(X, Y, { stat: 'median', err: 'iqr' });
  const mm = aggregateByX(X, Y, { stat: 'median', err: 'minmax' });
  ok(Array.from(md.y.values).join() === '2,6' && md.plus!.values[0] === 2 && md.minus!.values[0] === 0.5 && mm.plus!.values[0] === 4 && mm.minus!.values[0] === 1, 'One point per X: the median with Q1 – Q3 (numpy percentiles) and min – max, unequal + and −');
  const T = column('g', Float64Array.from([NaN, NaN, NaN]), ['b', 'a', 'b']);
  const tx = aggregateByX(T, column('v', Float64Array.from([1, 5, 3])), { stat: 'mean' });
  ok(tx.x.text!.join() === 'b,a' && Array.from(tx.y.values).join() === '2,5' && !tx.plus, 'One point per X: X of texts in the order met, no spread asked → no ±Y');
}

{
  // Histogram rug: every value a tick along the bottom, no part in the y range, out of the legend
  const hr = histogram([{ name: 'A', values: [1, 2, 2.5, NaN, 4] }], { ...HISTOGRAM_DEFAULTS, rug: true }, 'x');
  const rc = typeof hr === 'string' ? undefined : hr.curves.find((c) => c.key === 'hist:0:rug');
  ok(!!rc && rc.style.rug === 'x' && Array.from(rc.series.x.values).join() === '1,2,2.5,4' && Array.from(rc.series.y.values).every(Number.isNaN) && !!rc.noLegend, 'Histogram: a rug of the values at the bottom');
}
{
  // Quick fit against scipy (scripts/fixtures/quickfit-ref.py → quickfit-ref.json): two Gaussians on a constant —
  // curve_fit, the errors from the covariance scaled by the residual variance — and their areas; a line on a range
  // (linregress: slope, intercept and their standard errors)
  const R = JSON.parse(readFileSync(new URL('./fixtures/quickfit-ref.json', import.meta.url), 'utf8'));
  const pk = quickFit(R.x, R.y, { kind: 'peaks', shape: 'gauss', count: 2, baseline: 'constant', parts: true }, [0, 10]);
  const res = typeof pk === 'string' ? null : pk.results[0];
  const at = (nm: string) => res?.params.find((p) => p.name === nm) ?? { value: NaN, error: NaN };
  const da = (nm: string) => res?.derived.find((p) => p.name === nm) ?? { value: NaN, error: NaN };
  const names: string[] = R.peaks.names;
  ok(!!res && names.every((nm, i) => near(at(nm).value, R.peaks.p[i], 1e-6) && near(at(nm).error, R.peaks.err[i], 1e-3)), `Quick fit: two Gaussians on a constant as scipy curve_fit (values ~1e-6, errors ~1e-3: ${names.map((nm, i) => `${nm} ${(at(nm).value - R.peaks.p[i]).toExponential(1)}`).join(', ')})`);
  ok(near(da('area1').value, R.peaks.area1[0], 1e-6) && near(da('area1').error, R.peaks.area1[1], 1e-3) && near(da('area2').value, R.peaks.area2[0], 1e-6) && near(da('area2').error, R.peaks.area2[1], 1e-3), 'Quick fit: the peaks’ areas A·w·√(π/4 ln 2) ± from the covariance');
  ok(!!res && res.parts?.length === 2 && !!res.base && res.parts[0].y.every((v, i) => near(v, at('c').value + at('A1').value * Math.exp((-4 * Math.LN2 * (res.parts![0].x[i] - at('xc1').value) ** 2) / at('w1').value ** 2), 1e-9)), 'Quick fit: each peak drawn on the baseline');
  const ln = quickFit(R.x, R.y, { kind: 'linear', ranges: [{ lo: 0, hi: 1.5 }] }, [0, 10]);
  const lr = typeof ln === 'string' ? null : ln.results[0];
  const pa = lr?.params ?? [];
  ok(!!lr && near(pa[0].value, R.line.a, 1e-10) && near(pa[1].value, R.line.b, 1e-9) && near(pa[0].error, R.line.sa, 1e-9) && near(pa[1].error, R.line.sb, 1e-9) && near(lr.r2, R.line.r2, 1e-9) && lr.n === R.line.n && lr.curve.x[0] === 0 && lr.curve.x[lr.curve.x.length - 1] === 1.5, 'Quick fit: a line on a range as scipy linregress (± errors, R²), drawn over its range');
  // ranges: each on its own or together (the curve only inside them), or the curve over all the data
  const two = [{ lo: 0, hi: 1.5 }, { lo: 8.5, hi: 10 }];
  const per = quickFit(R.x, R.y, { kind: 'linear', ranges: two, perRange: true }, [0, 10]);
  const tog = quickFit(R.x, R.y, { kind: 'linear', ranges: two }, [0, 10]);
  const all = quickFit(R.x, R.y, { kind: 'linear', ranges: two, drawAll: true }, [0, 10]);
  const tc = typeof tog === 'string' ? null : tog.results[0].curve;
  const mid = tc ? tc.y[tc.x.findIndex((x) => x > 5)] : 0;
  ok(typeof per !== 'string' && per.results.length === 2 && per.results[1].range === '8.5 – 10' && !!tc && Number.isNaN(mid) && Number.isFinite(tc.y[0]) && typeof all !== 'string' && all.results[0].curve.y.every(Number.isFinite) && all.results[0].curve.x[0] === 0 && all.results[0].curve.x[all.results[0].curve.x.length - 1] === 10, 'Quick fit: a fit per range, or one of all the ranges (its curve only inside them), or the curve over all X');
  // a formula, a parameter fixed; peaks placed by hand (their number and starts); the old trend line read as a quick fit
  const xs = Array.from({ length: 50 }, (_, i) => i * 0.2);
  const fo = quickFit(xs, xs.map((x) => 2 * Math.exp(-x / 3) + 0.1), { kind: 'formula', formula: 'A*exp(-x/t) + y0', params: [{ name: 'y0', value: 0.1, fixed: true, min: NaN, max: NaN, shared: false }] }, [0, 10]);
  const fp = typeof fo === 'string' ? [] : fo.results[0].params;
  ok(fp.length === 3 && near(fp[0].value, 2, 1e-8) && near(fp[1].value, 3, 1e-8) && fp[2].value === 0.1 && !!fp[2].fixed, 'Quick fit: a formula of one’s own, a parameter fixed');
  const pl = quickFit(R.x, R.y, { kind: 'peaks', shape: 'lorentz', place: true, points: [{ x: 3.1, y: 3.4 }, { x: 6.4, y: 2.4 }], baseline: 'none' }, [0, 10]);
  const pp = typeof pl === 'string' ? [] : pl.results[0].params;
  ok(pp.length === 6 && near(pp[1].value, 3, 0.02) && near(pp[4].value, 6.5, 0.05), 'Quick fit: two Lorentzians started at the peaks placed by hand');
  const old = quickFitsOf({ trend: { kind: 'poly', degree: 3, band: true, equation: false } });
  ok(old.length === 1 && old[0].kind === 'poly' && old[0].degree === 3 && !!old[0].band && old[0].legend === 'name' && quickFitsOf({ trend: { kind: 'linear' }, quickFits: [] }).length === 0, 'Quick fit: an older project’s trend line read as its first quick fit');
}

{
  // A Plot's quick fits: the fit drawn, the range a band (moved on the figure), the results box, the “fits” table
  const t = `x;y\n${Array.from({ length: 21 }, (_, i) => `${i};${(2 + 0.5 * i + (i % 3) * 0.1).toFixed(3)}`).join('\n')}\n`;
  const g = evaluateGraph(
    [
      { id: 'qi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: t, textId: 'qi' } } as AppNode,
      { id: 'qp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, quickFits: [{ kind: 'linear', ranges: [{ lo: 5, hi: 15 }], box: 'tl', region: { fill: '#00ff00', hatch: '/' } }] } } as AppNode,
    ],
    [{ id: 'q1', source: 'qi', sourceHandle: 'out', target: 'qp', targetHandle: 'dataset' }],
  );
  const r = g.get('qp')!;
  const fig = r.outputs.figure?.t === 'figure' ? r.outputs.figure.v : null;
  const ax = fig?.axes[0];
  const band = ax?.annotations.find((a) => a.key.includes('/qf-0-0-0'));
  const box = ax?.annotations.find((a) => a.kind === 'text' && a.text.text.includes('\\bold'));
  const tab = r.outputs.fits?.t === 'dataset' ? r.outputs.fits.v : null;
  const fitCurve = ax?.curves.find((c) => c.key === 'qp:0:trend');
  ok(!!band && band.kind === 'shape' && band.shape.x1 === 5 && band.shape.x2 === 15 && band.shape.fill === '#00ff00' && band.shape.hatch === '/' && band.owner?.field === 'qfit' && !!box && !!fitCurve && fitCurve.series.x.values[0] === 5 && !!tab && tab.columns.map((c) => c.name).join() === 'curve,fit,range,parameter,value,error' && tab.columns[3].text!.join() === 'a,b,R²,n' && r.view.quickFits?.[0].results[0].n === 11, 'Plot: a quick fit on a range — its curve, the range a band of its look (dragged), the results box, the “fits” table');
  // a workbook on the Plot: each curve from its sheet (its own X and Y), named with it when there are several; a curve
  // without a sheet: the first; a sheet not there said
  const wb = evaluateGraph(
    [
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'A\tB\tC\n1\t2\t3\n2\t4\t6\n' }, { name: 'S2', text: 'D\tE\tF\n10\t1\t5\n20\t2\t7\n30\t3\t9\n' }] } } as AppNode,
      { id: 'wp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'A', y: 'B' }, sheet: 'S1', rows: [{ label: '', style: {}, sheet: 'S2', cols: { x: 'D', y: 'F' } }, { label: '', style: {}, cols: { x: 'A', y: 'C' } }, { label: '', style: {}, sheet: 'S9', cols: { y: 'A' } }] } } as AppNode,
    ],
    [{ id: 'we', source: 'w', sourceHandle: 'book', target: 'wp', targetHandle: 'dataset' }],
  ).get('wp')!;
  const wc = wb.view.curves ?? [];
  ok(targetAccepts({ id: 'wp', type: 'plot1d', position: { x: 0, y: 0 }, data: PLOT1D_DEFAULTS } as AppNode, 'dataset').includes('workbook') && wc.length === 3 && wc[0].label === 'S1: B' && wc[1].label === 'S2: F' && Array.from(wc[1].series.x.values).join() === '10,20,30' && Array.from(wc[1].series.y.values).join() === '5,7,9' && Array.from(wc[2].series.y.values).join() === '3,6' && wb.view.sheets?.join() === 'S1,S2' && wb.view.rowAvail?.[1]?.map((c) => c.name).join() === 'D,E,F' && wb.warnings?.some((w) => w.includes('no sheet “S9”')) === true, 'Plot: a workbook on its dataset port — every curve from its sheet (its X and Y), named with it; none: the first sheet; a sheet missing said');
  // “Plot these columns” built: pairs from two sheets in one Plot (the book connected, each curve its sheet); a Plot per
  // sheet in a Merge; curves added to a Plot already there (after its curves, the edge not doubled); a bar chart of one
  // sheet (the graph reads that sheet of the workbook)
  {
    let n = 0;
    const uid = (t: string) => `${t}-${++n}`;
    const src = { id: 'w', x: 0, y: 0, w: 100, book: true };
    const cols = (sh: string | undefined) => (sh === 'S2' ? ['D', 'E', 'F'] : ['A', 'B', 'C']);
    const pairs = [{ sheet: 'S1', x: 'A', y: 'B', yerr: '', xerr: '' }, { sheet: 'S2', x: 'D', y: 'F', yerr: '', xerr: '' }, { sheet: 'S1', x: 'A', y: 'C', yerr: 'B', xerr: '' }];
    const one = buildFigure(src, { graph: 'line', curves: pairs, into: '', split: 'one', merge: false }, cols, uid);
    const pd = one.nodes[0].data as Plot1DData;
    const per = buildFigure(src, { graph: 'scatter', curves: pairs, into: '', split: 'sheet', merge: true }, cols, uid);
    const had = { id: 'old', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'A', y: 'B' }, sheet: 'S1' } } as AppNode;
    const add = buildFigure(src, { graph: 'line', curves: pairs.slice(1, 2), into: 'old', split: 'one', merge: false }, cols, uid, { node: had, rowEdges: new Set(), hasEdge: true });
    const bar = buildFigure(src, { graph: 'barchart', curves: [{ x: 'D', y: 'E', yerr: '', xerr: '' }, { x: 'D', y: 'F', yerr: '', xerr: '' }], sheet: 'S2', into: '', split: 'one', merge: false }, cols, uid);
    const bd = bar.nodes[0].data as { cat: string; ys: string; sheet?: string };
    const g = evaluateGraph(
      [{ id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'A\tB\tC\n1\t2\t3\n' }, { name: 'S2', text: 'D\tE\tF\na\t1\t5\nb\t2\t7\n' }] } } as AppNode, ...bar.nodes],
      bar.edges,
    ).get(bar.nodes[0].id)!;
    ok(one.nodes.length === 1 && one.edges[0].sourceHandle === 'book' && pd.sheet === 'S1' && pd.rows?.map((r) => `${r.sheet}:${r.cols?.x}-${r.cols?.y}:${r.cols?.yerr ?? ''}`).join() === 'S2:D-F:,S1:A-C:B' && pd.legend?.show === true && per.nodes.map((q) => q.type).join() === 'plot1d,plot1d,canvas' && per.edges.filter((e) => e.targetHandle === 'figures').length === 2 && (per.nodes[1].data as Plot1DData).sheet === 'S2' && !add.edges.length && add.update?.data.rows?.[0]?.sheet === 'S2' && add.update.data.cols?.y === 'B' && bd.cat === 'D' && bd.ys === 'E, F' && bd.sheet === 'S2' && !g.errors.length && g.view.sheets?.join() === 'S1,S2' && targetAccepts(bar.nodes[0], 'dataset').includes('workbook'), 'Plot these columns: pairs from two sheets in one Plot; a Plot per sheet in a Merge; curves added to a Plot; a bar chart of one sheet of the workbook');
    // several Y axes (as Origin's multi-Y): one left, the others right — the right axis its own, a third moved out; every
    // axis coloured as its curve; double Y (the others together on the right); all on the left; X at the bottom and top
    const tri = [{ sheet: 'S1', x: 'A', y: 'B', yerr: '', xerr: '' }, { sheet: 'S1', x: 'A', y: 'C', yerr: '', xerr: '' }, { sheet: 'S1', x: 'C', y: 'A', yerr: '', xerr: '' }];
    const my = buildFigure(src, { graph: 'line', curves: tri, into: '', split: 'one', merge: false, yAxes: 'leftRight' }, cols, uid);
    const md = my.nodes[0].data as Plot1DData;
    const onY = [md.style, ...(md.rows ?? []).map((q) => q.style)].map((q) => q?.axisY).join();
    const mf = evaluateGraph([{ id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'A\tB\tC\n1\t2\t3\n2\t5\t1\n' }] } } as AppNode, ...my.nodes], my.edges).get(my.nodes[0].id)!.view.figure!;
    const ma = mf.axes[0];
    const mfr = { x: (ma.style.pos.x / 100) * toPt(mf.width, mf.unit), y: (ma.style.pos.y / 100) * toPt(mf.height, mf.unit), w: (ma.style.pos.w / 100) * toPt(mf.width, mf.unit), h: (ma.style.pos.h / 100) * toPt(mf.height, mf.unit) };
    const md2 = axesGeometry(ma, mfr, mf.text).drawn;
    const axisOf = (key: string) => md2.find((a) => a.key === key)!;
    ok(onY === 'left,right,y3' && md.axes?.right?.mode === 'own' && md.axes.extra?.[0]?.side === 'right' && md.axes.extra[0].style.offset === 40 && axisOf('left').s.color === ma.curves[0].style.color && axisOf('right').s.titleText.color === ma.curves[1].style.color && axisOf('y3').s.color === ma.curves[2].style.color && axisOf('y3').title === 'A', `Plot these columns ▸ Y axes: one left, the others right — each its own axis, coloured and titled as its curve (${onY})`);
    const lay = (n: number, y: YLayout, x: XLayout = 'one') => layoutAxes(n, y, x);
    const dbl = lay(3, 'double');
    const all = lay(3, 'allLeft');
    const alt = lay(4, 'alternate');
    const bt = lay(3, 'one', 'bottomTop');
    ok(dbl.on.map((q) => q.axisY).join() === 'left,right,right' && !dbl.axes.extra.length && all.on.map((q) => q.axisY).join() === 'left,y3,y4' && all.axes.extra.map((e) => `${e.side}:${e.style.offset}`).join() === 'left:40,left:80' && alt.on.map((q) => q.axisY).join() === 'left,right,y3,y4' && alt.axes.extra.map((e) => `${e.side}:${e.style.offset}`).join() === 'left:40,right:40' && bt.on.map((q) => q.axisX).join() === 'bottom,top,x3' && bt.axes.top.mode === 'own' && bt.axes.extra[0].side === 'bottom', 'multi-axes layouts: double Y, all on the left (moved out in turn), left and right in turn, X at the bottom and top');
    const fnRight = addAxis({ ...axesStyle(undefined), right: { ...axesStyle(undefined).right, mode: 'function', fn: '2*x' } }, 'right');
    ok(fnRight.id === 'y3' && fnRight.st.right.mode === 'function' && addAxis(axesStyle(undefined), 'right').id === 'right', 'a new Y on the right: the right axis itself when it only mirrors; past a converting right axis, a third Y');
    // three Y on the right, the middle one taken away (its curve moved): a new one goes in its place, not over the last
    {
      let st = axesStyle(undefined);
      const ids: string[] = [];
      for (let k = 0; k < 3; k++) {
        const r = addAxis(st, 'right');
        st = r.st;
        ids.push(r.id);
      }
      const offs = () => st.extra.filter((e) => e.side === 'right').map((e) => e.style.offset).sort((a, b) => a - b);
      const before = offs().join();
      st = removeAxis(st, 'y3');
      const r = addAxis(st, 'right');
      st = r.st;
      const after = offs();
      ok(ids.join() === 'right,y3,y4' && before === '40,80' && r.id === 'y3' && after.join() === '40,80' && new Set(after).size === after.length, `axes added, one taken away, one added: in the free place (offsets ${before} → ${after.join()}), none over another`);
    }
    const three = lay(3, 'leftRight');
    ok(!removeAxis(three.axes, 'y3').extra.length && removeAxis(three.axes, 'y9') === three.axes, 'an added axis removed (Axes ▸ Remove this axis); an axis that is not there: nothing changed');
    // a 3D plot: X, Y, Z of the first curve (a scatter), or X and the Y columns (a waterfall), of one sheet
    const s3 = buildFigure(src, { graph: 'scatter3d', curves: [{ x: 'D', y: 'E', z: 'F', yerr: '', xerr: '' }], sheet: 'S2', into: '', split: 'one', merge: false }, cols, uid);
    const w3 = buildFigure(src, { graph: 'waterfall3d', curves: [{ x: 'D', y: 'E', yerr: '', xerr: '' }, { x: 'D', y: 'F', yerr: '', xerr: '' }], sheet: 'S2', into: '', split: 'one', merge: false }, cols, uid);
    const d3 = s3.nodes[0].data as { kind: string; x: string; y: string; z: string; sheet?: string };
    const dw = w3.nodes[0].data as { kind: string; x: string; ys: string };
    ok(s3.nodes[0].type === 'plot3d' && d3.kind === 'scatter' && `${d3.x},${d3.y},${d3.z}` === 'D,E,F' && d3.sheet === 'S2' && dw.kind === 'waterfall' && dw.x === 'D' && dw.ys === 'E, F', 'Plot these columns: a 3D scatter of X, Y, Z; a 3D waterfall of X and the Y columns');
  }
  {
    // Projects ▸ Back up all: the projects (with their names, dates, ids) in one file, read back; another file refused
    const p1 = { app: 'graph-flow' as const, version: PROJECT_VERSION, id: 'p1', name: 'A', nodes: [{ id: 'n', type: 'plot1d', position: { x: 0, y: 0 }, data: structuredClone(PLOT1D_DEFAULTS) } as AppNode], edges: [] };
    const back = readBackup(backupText([{ name: 'A', saved: 5, project: p1 }, { name: 'B', saved: 7, project: { ...p1, id: 'p2', nodes: [] } }]));
    ok(typeof back !== 'string' && back.length === 2 && back[0].name === 'A' && back[0].saved === 5 && back[0].project.id === 'p1' && back[0].project.nodes[0].type === 'plot1d' && back[1].project.id === 'p2' && typeof readBackup('{"app":"graph-flow","nodes":[]}') === 'string' && typeof readBackup('not json') === 'string', 'Projects: a backup of all the projects, read back; another file refused');
  }
  {
    // Python script: a run asked for when the code or the data change (the digest), not otherwise; its outputs back as
    // values; on the main thread's side the result given to the evaluation (its outputs, an error with its line)
    const col = (vals: number[]) => ({ t: 'column' as const, v: column('x', Float64Array.from(vals)) });
    const v1 = [{ name: 'A', value: toPy(col([1, 2, 3])) }];
    const v2 = [{ name: 'A', value: toPy(col([1, 2, 4])) }];
    const k1 = digest('y = A * 2', v1, 0);
    const same = digest('y = A * 2', [{ name: 'A', value: toPy(col([1, 2, 3])) }], 0);
    const outs = [outValue({ name: 'm', kind: 'value', value: 2.5 }), outValue({ name: 'y', kind: 'column', col: { name: '', values: Float64Array.of(2, 4) } }), outValue({ name: 'df', kind: 'dataset', columns: [{ name: 'x', values: Float64Array.of(1), role: 'x' }] }), outValue({ name: 'M', kind: 'matrix', rows: 1, cols: 2, v: Float64Array.of(1, 2) })];
    // nothing runs until Run is pressed (run 1); a change of the code does not run it either
    const idle = evaluateGraph([{ id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: 3, start: 1, stop: 3 } } as AppNode, { id: 'py', type: 'python', position: { x: 0, y: 0 }, data: { code: 'y = A * 2' } } as AppNode], [{ id: 'e', source: 'g', sourceHandle: 'out', target: 'py', targetHandle: 'in-0' }]).get('py')!;
    ok(!idle.view.py?.job && idle.view.waiting === 'Press Run to run the code.', 'Python script: nothing runs until Run is pressed');
    const pyNode = { id: 'py', type: 'python', position: { x: 0, y: 0 }, data: { code: 'y = A * 2', run: 1 } } as AppNode;
    const gen = { id: 'g', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: 3, start: 1, stop: 3 } } as AppNode;
    const cache = newCache();
    const first = evaluateGraph([gen, pyNode], [{ id: 'e', source: 'g', sourceHandle: 'out', target: 'py', targetHandle: 'in-0' }], cache).get('py')!;
    const job = first.view.py?.job;
    cache.py.set('py', { seq: 1, result: { key: job?.key ?? '', run: 1, outputs: [{ name: 'y', kind: 'column', col: { name: 'y', values: Float64Array.of(2, 4, 6) } }], skipped: [], console: '', figures: [], files: [], ms: 1 } });
    const second = evaluateGraph([gen, pyNode], [{ id: 'e', source: 'g', sourceHandle: 'out', target: 'py', targetHandle: 'in-0' }], cache).get('py')!;
    cache.py.set('py', { seq: 2, result: { key: job?.key ?? '', run: 1, outputs: [], skipped: [], console: '', error: { message: 'NameError: B', line: 3 }, figures: [], files: [], ms: 1 } });
    const third = evaluateGraph([gen, pyNode], [{ id: 'e', source: 'g', sourceHandle: 'out', target: 'py', targetHandle: 'in-0' }], cache).get('py')!;
    ok(k1 === same && k1 !== digest('y = A * 3', v1, 0) && k1 !== digest('y = A * 2', v2, 0) && k1 !== digest('y = A * 2', v1, 1) && outs[0].t === 'scalar' && outs[0].v.value === 2.5 && outs[1].t === 'column' && outs[1].v.name === 'y' && outs[2].t === 'dataset' && outs[2].v.columns[0].role === 'x' && outs[3].t === 'matrix' && outs[3].v.cols === 2 && validName('wl') && !validName('2a') && !validName('lambda') && !!job && job.vars[0].name === 'A' && !second.view.py?.job && second.outputs['py-y']?.t === 'column' && third.errors[0] === 'Line 3: NameError: B' && targetAccepts(pyNode, 'in-0').includes('workbook'), 'Python script: a run asked for when the code or the data change; its outputs as values, an error with its line');
    // a figure of matplotlib made into Plots: the curves' columns from its data port, their look, the fill to its lower
    // edge, the twin on the right axis, the legend without the curves matplotlib does not list; subplots in a Merge
    const F = (vals: number[]) => Float64Array.from(vals);
    const fig: MplFigure = {
      w: 6, h: 2.5, size: 10, rows: 1, cols: 2, skipped: [],
      axes: [
        { title: 'Left', xlabel: 'Time (s)', ylabel: 'V', xlim: null, ylim: [-1, 1], xscale: 'linear', yscale: 'linear', grid: true, row: 0, col: 0, curves: [
          { label: 'sin', x: F([0, 1]), y: F([0, 1]), mode: 'linesymbol', axis: 'y', color: '#ff7f0e', lw: 1.5, dash: 'solid', marker: 'circle', ms: 4 },
          { label: 'cos', x: F([0, 1]), y: F([1, 0]), yerr: F([0.1, 0.1]), mode: 'scatter', axis: 'y', color: '#1f77b4', marker: 'square', ms: 6, errCap: 2 },
          { label: '', x: F([0, 1]), y: F([-0.2, 0.8]), mode: 'line', axis: 'y', color: '#1f77b4', lw: 0, hidden: true },
          { label: '', x: F([0, 1]), y: F([0.2, 1.2]), mode: 'line', axis: 'y', color: '#1f77b4', lw: 0, fillTo: 2, fillAlpha: 0.3 },
        ], lines: [{ kind: 'hline', v: 0, color: '#000000', width: 0.8, dash: 'dash' }], texts: [{ text: 'peak', x: 1, y: 0.8, coords: 'data', size: 7, color: '#000000', ha: 'left', va: 'baseline' }], legend: { show: true, loc: 'tr', frame: true } },
        { title: '', xlabel: '', ylabel: '', y2label: 'x² (a.u.)', xlim: [0, 10], ylim: null, y2lim: null, xscale: 'linear', yscale: 'log', y2scale: 'linear', grid: false, row: 0, col: 1, curves: [
          { label: 'exp', x: F([0, 10]), y: F([1, 7]), mode: 'line', axis: 'y', color: '#1f77b4', lw: 1.5 },
          { label: 'x²', x: F([0, 10]), y: F([0, 100]), mode: 'line', axis: 'y2', color: '#ff0000', lw: 1.5, dash: 'dash' },
        ], lines: [], texts: [], legend: null },
      ],
    };
    let m = 0;
    const made = figureNodes(fig, 1, { id: 'py', x: 0, y: 0, w: 500 }, (tp) => `${tp}-${++m}`);
    const p1 = made.nodes[0].data as Plot1DData;
    const p2 = made.nodes[1].data as Plot1DData;
    const r1 = plotRows(p1, 4);
    const cc = curveColumns(fig.axes[0]);
    ok(made.nodes.map((n) => n.type).join() === 'plot1d,plot1d,canvas' && made.edges.filter((e) => e.source === 'py').map((e) => e.sourceHandle).join() === 'py-fig1_1,py-fig1_2' && figPort(1, 0, 1) === 'fig1' && cc.cols.map((c) => c.name).join() === 'sin x,sin y,cos x,cos y,cos ±y,fill 3 under x,fill 3 under y,curve 4 x,curve 4 y' && r1[1].cols?.yerr === 'cos ±y' && r1[0].style.mode === 'linesymbol' && r1[0].style.color === '#ff7f0e' && r1[1].style.symbol === 'square' && r1[2].style.show === false && r1[3].style.fill === 'curve' && r1[3].style.fillCurve === 3 && p1.axes?.sides?.bottom.title === 'Time (s)' && p1.axes?.y?.min === -1 && p1.axes?.panelLabel === 'Left' && p1.legend?.anchor === 'tr' && p1.legend?.entries?.map((e) => e.key).join() === 'plot1d-1:2,plot1d-1:3' && p1.annotations?.length === 2 && p1.page?.unit === 'in' && p2.axes?.y?.scale === 'log' && p2.axes?.right?.mode === 'own' && plotRows(p2, 2)[1].style.axisY === 'right' && p2.axes?.panelLabel === '-' && p2.axes?.sides?.bottom.showTitle === false, 'Python script: a matplotlib figure made into Plots — columns, look, fill_between, twin axis, legend, subplots in a Merge');
  }
  {
    // Statistics for biologists against SciPy, pingouin and statsmodels (scripts/fixtures/biostat-ref.py → biostat-ref.json)
    const B = JSON.parse(readFileSync(new URL('./fixtures/biostat-ref.json', import.meta.url), 'utf8'));
    const near2 = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    // Dunnett: t exact; p and the simultaneous intervals as scipy (its multivariate t by quasi-Monte Carlo: ~1e-4)
    const groups: number[][] = [B.dunnett.control, ...B.dunnett.treat];
    const dfE = groups.reduce((s, g) => s + g.length, 0) - groups.length;
    const mse = groups.reduce((s, g) => s + Hy.variance(g) * (g.length - 1), 0) / dfE;
    const dn = dunnett(groups, 0, mse, dfE, 0.95);
    const cdfOk = (B.dunnett.cdf as [number, number][]).every(([c, pr]) => Math.abs(dunnettProb(c, B.dunnett.lam, B.dunnett.df) - pr) < 1e-7);
    ok(cdfOk && dn.every((q, i) => near2(q.stat, B.dunnett.t[i], 1e-9) && Math.abs(q.p - B.dunnett.p[i]) < 2e-4 && near2(q.lo, B.dunnett.lo[i], 3e-3) && near2(q.hi, B.dunnett.hi[i], 3e-3)), `Dunnett: the multivariate t probability as scipy at 4 million points (~1e-8); t exact, p and the simultaneous intervals as scipy.stats.dunnett (its quasi-Monte Carlo: p ${dn.map((q, i) => (q.p - B.dunnett.p[i]).toExponential(1)).join(', ')})`);
    // a mixed design (2 groups between, 4 times within, unequal groups) as pingouin.mixed_anova
    const subjOf = (rows: { subject: string }[]) => [...new Set(rows.map((r) => r.subject))];
    const md = B.mixedDesign.data as { subject: string; group: string; time: string; y: number }[];
    const ms = subjOf(md);
    const times = [...new Set(md.map((r) => r.time))].sort();
    const gnames = [...new Set(md.map((r) => r.group))];
    const m = ms.map((s) => times.map((t) => md.find((r) => r.subject === s && r.time === t)!.y));
    const grp = ms.map((s) => gnames.indexOf(md.find((r) => r.subject === s)!.group));
    const mdR = mixedDesign(m, grp, 2);
    const T = B.mixedDesign.table as { SS: number; F: number; DF2: number; p_unc: number; p_GG_corr: number | null; eps: number | null }[];
    const t3 = B.mixedDesign.type3;
    ok(typeof mdR !== 'string' && near2(mdR.rows[0].ss, T[0].SS, 1e-9) && near2(mdR.rows[0].F, T[0].F, 1e-9) && near2(mdR.rows[0].p, T[0].p_unc, 1e-7) && near2(mdR.rows[1].ss, t3.B, 1e-9) && near2(mdR.rows[2].ss, t3.AB, 1e-9) && near2(mdR.errors[1].ss, t3.error, 1e-9) && near2(mdR.rows[2].F, T[2].F, 1e-9) && near2(mdR.rows[1].gg!, B.mixedDesign.ggPooled, 1e-9), 'Two-way ANOVA, a factor between and one within, unequal groups: the factor between as pingouin.mixed_anova; the factor within and the interaction by Type III sums (numpy least squares, as SPSS / Prism); ε pooled within the groups');
    const bal = md.filter((r) => r.subject !== 's14' && r.subject !== 's15');
    const bs2 = subjOf(bal);
    const mb = mixedDesign(bs2.map((s2) => times.map((t) => bal.find((r) => r.subject === s2 && r.time === t)!.y)), bs2.map((s2) => gnames.indexOf(bal.find((r) => r.subject === s2)!.group)), 2);
    const TB = B.mixedDesign.balanced as typeof T;
    ok(typeof mb !== 'string' && mb.rows.every((r, i) => near2(r.ss, TB[i].SS, 1e-9) && near2(r.F, TB[i].F, 1e-9) && r.dfE === TB[i].DF2 && near2(r.p, TB[i].p_unc, 1e-7) && (i === 0 || (near2(r.gg!, TB[i].eps!, 1e-9) && near2(r.pGG!, TB[i].p_GG_corr!, 1e-7)))), 'Two-way ANOVA, a factor between and one within, equal groups: SS, F, df, p, ε and the Greenhouse–Geisser p as pingouin.mixed_anova');
    // both factors within as statsmodels AnovaRM; ε of each effect (pingouin for A and B, numpy for A × B)
    const bw = B.bothWithin.data as { subject: string; A: string; B: string; y: number }[];
    const bs = subjOf(bw);
    const cube = bs.map((s) => ['a0', 'a1', 'a2'].map((a) => ['b0', 'b1', 'b2'].map((b) => bw.find((r) => r.subject === s && r.A === a && r.B === b)!.y)));
    const bwR = bothWithin(cube);
    ok(bwR.rows.every((r, i) => near2(r.F, B.bothWithin.F[i], 1e-9) && r.dfE === B.bothWithin.df2[i] && near2(r.p, B.bothWithin.p[i], 1e-7) && near2(r.gg!, B.bothWithin.gg[i], 1e-9)), 'Two-way ANOVA, both factors within: F, df, p as statsmodels AnovaRM; Greenhouse–Geisser ε of every effect');
    // the mixed model (REML, random intercept) with values missing, as statsmodels MixedLM; on complete data its F and
    // df are those of the ANOVA with repeated measures
    const mmRows = B.mixedModel.data as typeof md;
    const fit = (rows: typeof md) => {
      const subs = subjOf(rows);
      const gA = factorCols(rows.map((r) => gnames.indexOf(r.group)), 2);
      const gB = factorCols(rows.map((r) => times.indexOf(r.time)), 4);
      return mixedModel(rows.map((r) => r.y), rows.map((r) => subs.indexOf(r.subject)), [{ name: 'group', cols: gA }, { name: 'time', cols: gB }, { name: 'group × time', cols: interCols(gA, gB) }]);
    };
    const mm = fit(mmRows);
    const full = fit(md);
    ok(typeof mm !== 'string' && mm.beta.every((b, i) => near2(b, B.mixedModel.beta[i], 2e-4)) && near2(mm.sigmaU2, B.mixedModel.sigmaU2, 2e-4) && near2(mm.sigmaE2, B.mixedModel.sigmaE2, 2e-4) && near2(mm.logLik, B.mixedModel.llf, 1e-5), `Mixed model (REML, a random intercept): fixed effects, variances and the REML log-likelihood as statsmodels MixedLM (σ²_u ${typeof mm !== 'string' ? (mm.sigmaU2 - B.mixedModel.sigmaU2).toExponential(1) : mm})`);
    // the ANOVA node on indexed data (value, group, time, subject): the same numbers; Dunnett against a control chosen by name
    const txt = (nm: string, v: string[]) => ({ ...column(nm, Float64Array.from(v, () => NaN), v) });
    const dsMD: Dataset = { name: 'md', columns: [column('y', Float64Array.from(md.map((r) => r.y))), txt('group', md.map((r) => r.group)), txt('time', md.map((r) => r.time)), txt('subject', md.map((r) => r.subject))] };
    const base = { layout: 'indexed' as const, cols: '', value: 'y', factor: 'group', factor2: 'time', subject: 'subject', alpha: 0.05, welch: false, post: 'none' as const };
    const nRM = anovaNode(dsMD, { ...base, design: 'two-rm', within: 'b' });
    const nMM = anovaNode({ ...dsMD, columns: dsMD.columns.map((c) => ({ ...c, values: c.values.slice(), ...(c.text ? { text: c.text.slice() } : {}) })) }, { ...base, design: 'mixed' });
    const Fcol = (o: typeof nRM) => Array.from(o.tables.out?.columns.find((c) => c.name === 'F')?.values ?? []);
    const dsD: Dataset = { name: 'd', columns: [column('ctrl', Float64Array.from(B.dunnett.control)), ...B.dunnett.treat.map((t: number[], i: number) => column(`T${i + 1}`, Float64Array.from(t)))] };
    const nD = anovaNode(dsD, { layout: 'columns', cols: '', value: '', factor: '', alpha: 0.05, design: 'one', welch: false, post: 'dunnett', control: 'ctrl' });
    const dT = Array.from(nD.tables.posthoc?.columns.find((c) => c.name === 't')?.values ?? []);
    ok(!nRM.errors.length && typeof mdR !== 'string' && Fcol(nRM).slice(0, 3).every((F, i) => near2(F, mdR.rows[i].F, 1e-12)) && !nMM.errors.length && typeof full !== 'string' && Fcol(nMM).every((F, i) => near2(F, full.tests[i].F, 1e-12)) && dT.every((t, i) => near2(t, B.dunnett.t[i], 1e-9)) && nD.report.some((l) => l.startsWith('Dunnett against ctrl')), 'ANOVA node: two-way with repeated measures and the mixed model on indexed data (value, factors, subject); Dunnett against the control named');
    ok(typeof full !== 'string' && typeof mdR !== 'string' && full.tests.every((t, i) => near2(t.F, mdR.rows[i].F, 1e-5) && Math.abs(t.df2 - mdR.rows[i].dfE) < 1e-3), `Mixed model on complete data: the F tests and Satterthwaite's df of the ANOVA with repeated measures (${typeof full !== 'string' ? full.tests.map((t) => `${t.F.toFixed(4)} (${t.df2.toFixed(3)})`).join(', ') : full})`);
  }
  // its curve styled as any curve: line + symbols (on about 20 of its points), its own colour, a fill down to the data
  // curve (curve 1 of the Plot, kept in its style); an older fit's colour / width / line / opacity read into its style; the defaults
  const styled = evaluateGraph(
    [
      { id: 'qi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: t, textId: 'qi' } } as AppNode,
      { id: 'qp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, quickFits: [{ kind: 'linear', style: { mode: 'linesymbol', color: '#ff0000', symbol: 'diamond', fill: 'curve', fillCurve: 1 } }] } } as AppNode,
    ],
    [{ id: 'q1', source: 'qi', sourceHandle: 'out', target: 'qp', targetHandle: 'dataset' }],
  );
  const sc = styled.get('qp')!.view.figure?.axes[0].curves.find((c) => c.key === 'qp:0:trend');
  const look = fitLook({ kind: 'poly', color: '#123456', width: 2, dash: 'dot', opacity: 0.5 }, { color: '#000000', lineWidth: 0.5, axisX: 'X1', axisY: 'Y2' });
  const auto = fitLook({ kind: 'peaks' }, { color: '#0000ff', lineWidth: 0.5, axisX: 'X1', axisY: 'Y1' });
  ok(!!sc && sc.style.mode === 'linesymbol' && sc.style.color === '#ff0000' && sc.style.symbol === 'diamond' && sc.style.fill === 'curve' && sc.style.every === 10 && sc.style.dash === 'dash' && look.color === '#123456' && look.lineWidth === 2 && look.dash === 'dot' && look.lineOpacity === 0.5 && look.axisY === 'Y2' && auto.color === '#0000ff' && auto.lineWidth === 0.75 && auto.dash === 'solid' && auto.mode === 'line' && auto.every === 30, 'Plot: a quick fit’s curve styled as a curve (line + symbols, colour, fill); older fits’ look read in; its defaults');
}

{
  // A legend placed by itself keeps off the text boxes in the frame; an entry on several lines makes its row taller
  const cs: Curve[] = [{ key: 'a', label: 'a', series: { name: 'a', x: column('x', Float64Array.from([0, 1, 2, 3])), y: column('y', Float64Array.from([0, 0.1, 0.2, 0.3])) }, style: curveStyle({ mode: 'line' }) }];
  const lg = { ...LEGEND_STYLE_DEFAULTS, key: 'L', auto: true, curves: cs, x: 98, y: 2, anchor: 'tr' as const };
  const frame = { x: 0, y: 0, w: 200, h: 150 };
  const base = { key: 'ax', style: axesStyle({ x: { ...AXIS_DEFAULTS, min: 0, max: 10 }, y: { ...AXIS_DEFAULTS, min: 0, max: 10 } }), curves: cs, legends: [lg], annotations: [] as Annotation[] };
  const free = placeLegends(base, frame, TEXT_DEFAULTS)[0];
  const boxed = placeLegends({ ...base, annotations: [{ key: 't', kind: 'text', text: { ...TEXT_SPEC_DEFAULTS, text: 'A = 1\\\\B = 2\\\\C = 3', x: 97, y: 3, anchor: 'tr', box: 'both' } }] }, frame, TEXT_DEFAULTS)[0];
  const one = legendLayout({ ...lg, curves: [{ ...cs[0], label: 'fit' }] }, TEXT_DEFAULTS);
  const three = legendLayout({ ...lg, curves: [{ ...cs[0], label: 'fit\\\\a = 1\\\\b = 2' }] }, TEXT_DEFAULTS);
  ok(free.anchor === 'tr' && boxed.anchor !== 'tr' && three.h > one.h + 1.5 * TEXT_DEFAULTS.size && three.extra[0] > 0, `Legend: placed off a results box (${boxed.anchor}); an entry on three lines three lines high`);
  // its text measured in its font (Courier wider, Times narrower, Arial as before); the sample's height and gap
  const kg = { ...lg, curves: [{ ...cs[0], label: 'Below 3.5 kg' }] };
  const wOf = (font: string) => legendLayout({ ...kg, text: { font } }, TEXT_DEFAULTS).w;
  const [arial, courier, times] = [wOf(FONTS[0][0]), wOf("'Courier New', monospace"), wOf("'Times New Roman', Times, serif")];
  const sized = legendLayout({ ...kg, sampleH: 20, sampleGap: 10 }, TEXT_DEFAULTS);
  const plain = legendLayout(kg, TEXT_DEFAULTS);
  ok(near(arial, plain.w) && courier > arial + 10 && times < arial && near(sized.w - plain.w, 10 - 0.5 * TEXT_DEFAULTS.size) && sized.rowH >= 21 && near(fontRatio('abc', 'Courier New'), 1800 / 1612), `Legend: text width by its font (Arial ${arial.toFixed(1)}, Courier ${courier.toFixed(1)}, Times ${times.toFixed(1)} pt); sample height and gap`);
}

{
  // Figure Drawing: a page with its objects (mm), the hidden ones left out, their order their layer; in a Merge a panel
  // of its own (no axes shared nor titled), in a Plot an inset (no zoom marks); objects moved, aligned, spread, snapped
  const drawingGraph = (more: AppNode[] = [], edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[] = []) =>
    evaluateGraph(
      [
        {
          id: 'dr',
          type: 'drawing',
          position: { x: 0, y: 0 },
          data: {
            ...DRAWING_DEFAULTS,
            width: 40,
            height: 20,
            annotations: [
              { id: 'r', type: 'shape', spec: { ...SHAPE_DEFAULTS, kind: 'rect', coords: 'data', x1: 2, y1: 2, x2: 12, y2: 8 } },
              { id: 'h', type: 'text', hidden: true, spec: { ...TEXT_SPEC_DEFAULTS, coords: 'data', x: 5, y: 5 } },
              { id: 'a', type: 'shape', locked: true, spec: { ...SHAPE_DEFAULTS, kind: 'arrow', coords: 'data', x1: 12, y1: 5, x2: 30, y2: 5 } },
            ],
          },
        } as AppNode,
        ...more,
      ],
      edges,
    );
  const dg = drawingGraph().get('dr')!;
  const df = dg.outputs.figure?.t === 'figure' ? dg.outputs.figure.v : (null as unknown as Figure);
  const dax = df.axes[0];
  ok(df.width === 40 && dax.drawing?.w === toPt(40, 'mm') && dax.annotations.length === 2 && dax.annotations[1].locked === true && (dax.annotations[0].kind === 'shape' && dax.annotations[1].kind === 'shape' ? dax.annotations[0].shape.z < dax.annotations[1].shape.z : false), 'Drawing: its page, the hidden object left out, the order its layer, a locked one marked');
  const pg = evaluateGraph(
    [
      { id: 'pd-i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;0\n4;1\n', textId: 'pd' } } as AppNode,
      { id: 'pd', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' } } } as AppNode,
    ],
    [{ id: '1', source: 'pd-i', sourceHandle: 'out', target: 'pd', targetHandle: 'dataset' }],
  ).get('pd')!;
  const fa = pg.outputs.figure?.t === 'figure' ? pg.outputs.figure.v : (null as unknown as Figure);
  const mixed = canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 70, layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, shareX: 'all', shareY: 'all', commonX: true, commonY: true } }, [fa, df], []);
  const dPanel = mixed.axes.find((x) => x.drawing)!;
  ok(JSON.stringify(dPanel.style.pos) === JSON.stringify(mixed.boxes![1].box) && mixed.axes[0].style.sides.bottom.showTitle === false && mixed.annotations.some((x) => x.key === 'cv:xtitle'), 'Drawing in a Merge: its whole cell; the Plot beside it alone gives the common titles');
  const withInset = drawingGraph([{ id: 'pi-i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;0\n4;1\n', textId: 'pi' } } as AppNode, { id: 'pi', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, insets: [{ key: 'dr', x: 50, y: 5, w: 40, h: 40, zoom: true, line: { color: '#555555', width: 0.75, dash: 'dash', opacity: 1 }, background: '' }] } } as AppNode], [{ id: 'e', source: 'dr', sourceHandle: 'figure', target: 'pi', targetHandle: 'insets' }, { id: 'e2', source: 'pi-i', sourceHandle: 'out', target: 'pi', targetHandle: 'dataset' }]).get('pi')!;
  const pinset = withInset.view.figure?.axes.find((x) => x.drawing);
  ok(!!pinset && pinset.inset?.zoom === false && pinset.style.pos.w > 0, 'Drawing as an inset of a Plot: placed in its box, no zoom marks');
  const moved = moveItem({ id: 'p', type: 'shape', spec: { kind: 'polygon', points: '0 0; 4 0; 2 3', bends: undefined } }, 1, 2);
  ok(moved.type === 'shape' && moved.spec.points === '1 2; 5 2; 3 5', 'Drawing: a polygon moved, every point');
  const lineMoved = moveItem({ id: 'l', type: 'shape', spec: { kind: 'arrow', x1: 0, y1: 0, x2: 10, y2: 0, bends: '5 3' } }, 1, 1);
  ok(lineMoved.type === 'shape' && lineMoved.spec.x2 === 11 && lineMoved.spec.bends === '6 4', 'Drawing: an arrow moved with its bends');
  const boxes = [{ x: 0, y: 0, w: 4, h: 2 }, { x: 10, y: 5, w: 2, h: 2 }, { x: 4, y: 1, w: 2, h: 6 }];
  ok(JSON.stringify(alignMoves(boxes, 'left')) === JSON.stringify([[0, 0], [-10, 0], [-4, 0]]) && JSON.stringify(alignMoves(boxes, 'bottom')) === JSON.stringify([[0, 5], [0, 0], [0, 0]]), 'Drawing: aligned left, bottom');
  const spread = distributeMoves(boxes, 'h');
  // 12 wide, 8 of boxes: gaps of 2 → the middle one from 4 to 6
  ok(JSON.stringify(spread) === JSON.stringify([[0, 0], [0, 0], [2, 0]]), `Drawing: spread across, equal gaps (${JSON.stringify(spread)})`);
  const s1 = snapAxis([10.4, 12.4], [12.5], 1, 1);
  const s2 = snapAxis([10.4], [30], 1, 1);
  ok(Math.abs(s1.d - 0.1) < 1e-9 && s1.guide === 12.5 && Math.abs(s2.d + 0.4) < 1e-9 && s2.guide === null, 'Drawing: snapped to an edge near it, else to the grid');
  ok(JSON.stringify(geomBox({ id: 'g', type: 'shape', spec: { kind: 'rect', x1: 5, y1: 8, x2: 1, y2: 2 } })) === JSON.stringify({ x: 1, y: 2, w: 4, h: 6 }), 'Drawing: the box of a rectangle from its corners');
}

{
  // Arrows: elbow routes, cut ends, lines moved aside, waves, tapered outlines; connectors stuck to shapes
  const el = elbowCorners([0, 0], [10, 6], 'hvh', 0.3);
  ok(JSON.stringify(el) === JSON.stringify([[0, 0], [3, 0], [3, 6], [10, 6]]), 'Elbow: across, down, across (the upright piece at 0.3)');
  const cut = trimLine([[0, 0], [10, 0], [10, 10]], 2, 3);
  ok(JSON.stringify(cut) === JSON.stringify([[2, 0], [10, 0], [10, 7]]) && Math.abs(lineLength(cut) - 15) < 1e-9, 'Line cut at both ends, along its corner');
  const off = offsetLine([[0, 0], [10, 0], [10, 10]], 1);
  ok(Math.abs(off[0][1] + 1) < 1e-9 && Math.abs(off[1][0] - 11) < 1e-9 && Math.abs(off[1][1] + 1) < 1e-9 && Math.abs(off[2][0] - 11) < 1e-9, `Line moved to its left, the corner kept sharp (${JSON.stringify(off)})`);
  const wv = waveLine([[0, 0], [60, 0]], 2, 6, false);
  ok(Math.abs(wv[0][1]) < 1e-9 && Math.abs(wv[wv.length - 1][1]) < 1e-9 && Math.max(...wv.map((p) => Math.abs(p[1]))) > 1.9 && Math.max(...wv.map((p) => Math.abs(p[1]))) <= 2 + 1e-9, 'A wave 2 either side, from nothing to nothing at its ends');
  const tp = taperOutline([[0, 0], [10, 0]], 0, 4);
  ok(JSON.stringify(tp.map((p) => p.map((v) => +v.toFixed(6)))) === JSON.stringify([[0, 0], [10, -2], [10, 2], [0, 0]]), 'Tapered line: from nothing to 4 wide');
  ok(JSON.stringify(aboveOf([1, 0])) === JSON.stringify([0, -1]) && JSON.stringify(aboveOf([-1, 0])) === JSON.stringify([-0, 1].map((v, i) => (i ? -1 : 0))) && aboveOf([0, 1])[0] === 1, 'Above a line: up the page (an upright one: its right)');
  const box = { cx: 10, cy: 10, w: 8, h: 4, rot: 0, ellipse: false };
  ok(JSON.stringify(outlinePoint(box, 'auto', [30, 10])) === JSON.stringify([14, 10]) && JSON.stringify(outlinePoint(box, 't', [0, 0])) === JSON.stringify([10, 8]), 'Connector: on a rectangle facing the other end, or the middle of a side');
  const elp = outlinePoint({ ...box, ellipse: true, w: 4 }, 'auto', [10 + 3, 10 + 3]);
  ok(Math.abs(((elp[0] - 10) / 2) ** 2 + ((elp[1] - 10) / 2) ** 2 - 1) < 1e-9, 'Connector: on an ellipse');
  const turned = outlinePoint({ ...box, rot: 90 }, 'auto', [10, 40]);
  ok(Math.abs(turned[0] - 10) < 1e-9 && Math.abs(turned[1] - 14) < 1e-9, 'Connector: on a turned rectangle');
  const stuck = stuckLines(
    [
      { id: 'A', type: 'shape', spec: { kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 } },
      { id: 'B', type: 'shape', spec: { kind: 'ellipse', x1: 30, y1: 0, x2: 40, y2: 10 } },
      { id: 'L', type: 'shape', spec: { kind: 'arrow', x1: 5, y1: 5, x2: 35, y2: 5, from: 'A', to: 'B' } },
      { id: 'C', type: 'shape', spec: { kind: 'rect', x1: 30, y1: 20, x2: 40, y2: 30 } },
      { id: 'E', type: 'shape', spec: { kind: 'arrow', route: 'hv', x1: 0, y1: 0, x2: 0, y2: 0, from: 'A', to: 'C', away: toPt(1, 'mm') } },
    ],
    TEXT_DEFAULTS,
  );
  const sl = stuck[2].spec as { x1: number; y1: number; x2: number; y2: number };
  const se = stuck[4].spec as { x1: number; y1: number; x2: number; y2: number };
  ok(sl.x1 === 10 && sl.y1 === 5 && sl.x2 === 30 && sl.y2 === 5, `Connector: from the rectangle's edge to the ellipse's (${JSON.stringify(sl)})`);
  ok(se.x1 === 11 && se.y1 === 5 && se.x2 === 35 && se.y2 === 19, `Elbow connector: leaves by the right side, meets the top, 1 mm away (${JSON.stringify(se)})`);
}

{
  // Paths: SVG path text read (relative, H/V, S, Q, arcs) into M, L, C, Z; shapes as paths; corners rounded and cut;
  // nodes removed, added, made smooth; drawn the other way; components placed; objects turned
  const rel = parsePath('m10 10 h5 v5 l-5 0 z');
  ok(pathText(rel) === 'M10 10 L15 10 L15 15 L10 15 Z', `Path: relative moves and lines (${pathText(rel)})`);
  const q = parsePath('M0 0 Q 3 3 6 0 T 12 0');
  ok(q.length === 3 && q[1].c === 'C' && Math.abs(q[1].p[0] - 2) < 1e-9 && Math.abs(q[2].p[0] - 8) < 1e-9 && Math.abs(q[2].p[1] + 2) < 1e-9, 'Path: quadratic curves (and their mirror, T) as cubic ones');
  const arc = parsePath('M0 0 A 5 5 0 0 1 10 0');
  const box = pathBox(arc)!;
  ok(arc.length === 3 && Math.abs(box.w - 10) < 1e-6 && Math.abs(box.h - 5) < 0.01 && Math.abs(box.y + 5) < 0.01, `Path: a half circle as two cubic pieces, up the page (${JSON.stringify(box)})`);
  const ell = shapeToPath({ ...SHAPE_DEFAULTS, kind: 'ellipse', x1: 0, y1: 0, x2: 20, y2: 10 })!;
  const eb = pathBox(parsePath(ell))!;
  ok(Math.abs(eb.w - 20) < 0.01 && Math.abs(eb.h - 10) < 0.01, 'Path: an ellipse as four cubic pieces');
  const rr = shapeToPath({ ...SHAPE_DEFAULTS, kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, radius: 2 }, 1)!;
  ok(parsePath(rr).filter((x) => x.c === 'C').length === 4, 'Path: a rounded rectangle, its four round corners');
  const turned = pathBox(parsePath(shapeToPath({ ...SHAPE_DEFAULTS, kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 2, rotation: 90 })!))!;
  ok(Math.abs(turned.w - 2) < 1e-6 && Math.abs(turned.h - 10) < 1e-6, 'Path: a turned rectangle, the turn in its points');
  {
    // a path turned with its handle: the turn in its points, about the middle of its box where it is drawn (here the page
    // is twice its units: the same turn); its curves' controls turned with them
    const bar = parsePath('M0 0 L10 0 L10 4 C10 6 0 6 0 4 Z');
    const t1 = turnedPath(bar, 90);
    const t2 = turnedPath(bar, 90, ([x, y]) => [2 * x, 2 * y], ([x, y]) => [x / 2, y / 2]);
    const b1 = pathBox(t1)!;
    const c = t1.find((q) => q.c === 'C')!.p;
    // (its box 10 × 5.5 — the curve reaches y = 5.5 —, its middle (5, 2.75); (0, 0) → (7.75, −2.25), (10, 0) → (7.75, 7.75))
    ok(turnedPath(bar, 0) === bar && near(b1.x + b1.w / 2, 5, 1e-9) && near(b1.y + b1.h / 2, 2.75, 1e-9) && near(b1.w, 5.5, 0.01) && near(b1.h, 10, 1e-9) && near(t1[0].p[0], 7.75, 1e-9) && near(t1[0].p[1], -2.25, 1e-9) && near(t1[1].p[0], 7.75, 1e-9) && near(t1[1].p[1], 7.75, 1e-9) && near(c[0], 1.75, 1e-9) && near(c[1], 7.75, 1e-9) && t2.every((q, k) => q.p.every((v, j) => near(v, t1[k].p[j], 1e-9))),
      `Path: turned about the middle of its box, its controls with it, the same through the page's scale (${pathText(t1)})`);
  }
  const sq = parsePath('M0 0 L10 0 L10 10 L0 10 Z');
  const filleted = roundCorners(sq, 2, false);
  const chamfered = roundCorners(sq, 2, true);
  ok(filleted.filter((x) => x.c === 'C').length === 4 && JSON.stringify(filleted[0].p) === JSON.stringify([2, 0]), `Fillet: four round corners (${pathText(filleted)})`);
  ok(chamfered.filter((x) => x.c === 'L').length === 8 && Math.abs(pathBox(chamfered)!.w - 10) < 1e-9, 'Chamfer: four corners cut');
  ok(pathText(deleteNode(sq, 2)) === 'M0 0 L10 0 L0 10 Z', 'Node removed');
  const ins = insertNode(parsePath('M0 0 L10 0'), [5, 1]);
  ok(pathText(ins) === 'M0 0 L5 0 L10 0', `Node added where the path passes nearest (${pathText(ins)})`);
  const sm = toggleNode(parsePath('M0 0 L5 5 L10 0'), 1);
  ok(sm[1].c === 'C' && sm[2].c === 'C' && Math.abs(sm[1].p[3] - 5) < 1e-9 && Math.abs(sm[2].p[1] - 5) < 1e-9, 'Node made smooth: its controls level (in line with its neighbours)');
  ok(pathText(toggleNode(sm, 1)) === 'M0 0 C0 0 5 5 5 5 C5 5 10 0 10 0', 'Node made a corner again');
  ok(pathText(reversePath(parsePath('M0 0 L1 0 C2 0 3 1 3 2'))) === 'M3 2 C3 1 2 0 1 0 L0 0', 'Path drawn the other way');
  ok(pathText(setClosed(parsePath('M0 0 L1 0 L1 1'), true)) === 'M0 0 L1 0 L1 1 Z', 'Path closed');
  const comp = { id: 'c', name: 'C', w: 10, h: 5, items: [{ id: 'r', type: 'shape' as const, spec: { kind: 'rect' as const, x1: 0, y1: 0, x2: 10, y2: 5 } }] };
  const placed = placeComponent({ ...SHAPE_DEFAULTS, kind: 'component', x1: 20, y1: 10, x2: 40, y2: 15 }, comp, 'i:');
  ok(placed[0].id === 'i:r' && placed[0].type === 'shape' && placed[0].spec.x1 === 20 && placed[0].spec.x2 === 40 && placed[0].spec.y2 === 15, 'Component: its objects in the instance\'s box, stretched');
  const rot = rotateItem({ id: 'a', type: 'shape', spec: { kind: 'line', x1: 10, y1: 0, x2: 20, y2: 0 } }, [0, 0], 90);
  ok(rot.type === 'shape' && Math.abs(rot.spec.x1!) < 1e-9 && Math.abs(rot.spec.y1! - 10) < 1e-9 && Math.abs(rot.spec.y2! - 20) < 1e-9, 'A line turned about a point');
  const rect = rotateItem({ id: 'b', type: 'shape', spec: { kind: 'rect', x1: 10, y1: -1, x2: 12, y2: 1 } }, [0, 0], 90);
  ok(rect.type === 'shape' && Math.abs(rect.spec.x1! + 1) < 1e-9 && Math.abs(rect.spec.y1! - 10) < 1e-9 && rect.spec.rotation === 90, 'A rectangle turned: moved, its own turn added');
  // a drawing with a component, a clip, a text along a path
  const dg2 = evaluateGraph([
    {
      id: 'dd',
      type: 'drawing',
      position: { x: 0, y: 0 },
      data: {
        ...DRAWING_DEFAULTS,
        components: [comp],
        annotations: [
          { id: 'i', type: 'shape', spec: { kind: 'component', ref: 'c', x1: 0, y1: 0, x2: 10, y2: 5 } },
          { id: 'cut', type: 'shape', hidden: true, spec: { kind: 'ellipse', x1: 0, y1: 0, x2: 8, y2: 8 } },
          { id: 'img', type: 'shape', clipBy: 'cut', spec: { kind: 'rect', x1: 0, y1: 0, x2: 20, y2: 20 } },
          { id: 't', type: 'text', spec: { text: 'along', onPath: 'cut' } },
        ],
      },
    } as AppNode,
  ], []).get('dd')!;
  const da = dg2.view.figure!.axes[0].annotations;
  ok(da.length === 3 && da[0].locked === true && da[0].owner?.field === 'annotations' && da[0].owner.item === 'i' && !!da[1].clip && da[2].kind === 'text' && !!da[2].text.pathD, 'Drawing: a component\'s objects moved with their instance, an object cut to a hidden shape, a text along its outline');
}

{
  // A radius for each corner of a rectangle; only the nodes picked rounded; a text on the other side of a path
  const rr4 = parsePath(roundedRectD(0, 0, 10, 6, [2, 0, 3, 0]));
  ok(rr4.filter((x) => x.c === 'C').length === 2 && JSON.stringify(rr4[0].p) === JSON.stringify([2, 0]) && Math.abs(pathBox(rr4)!.h - 6) < 1e-9, 'Rectangle: its own radius for each corner (two round ones)');
  const sq2 = parsePath('M0 0 L10 0 L10 10 L0 10 Z');
  const one = roundCorners(sq2, 2, false, new Set([2]));
  ok(one.filter((x) => x.c === 'C').length === 1, `Fillet: only the node picked (${pathText(one)})`);
  const flipped = evaluateGraph([
    { id: 'df', type: 'drawing', position: { x: 0, y: 0 }, data: { ...DRAWING_DEFAULTS, annotations: [{ id: 'l', type: 'shape', spec: { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 } }, { id: 't', type: 'text', spec: { text: 'x', onPath: 'l', pathFlip: true } }] } } as AppNode,
  ], []).get('df')!.view.figure!.axes[0].annotations[1];
  ok(flipped.kind === 'text' && flipped.text.pathD === 'M10 0 L0 0', `Text on the other side of a line: the line taken the other way (${flipped.kind === 'text' ? flipped.text.pathD : ''})`);
}

{
  // A Plot annotated by a Figure Drawing: the drawing over it on its page (one panel in a Merge, in the same box as an
  // inset), or the Plot only a guide (the drawing alone, at the Plot's size)
  const graph = (mode?: 'guide', more: AppNode[] = [], edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[] = []) =>
    evaluateGraph(
      [
        { id: 'ai', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;0\n4;1\n', textId: 'ai' } } as AppNode,
        { id: 'ap', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' } } } as AppNode,
        { id: 'ad', type: 'drawing', position: { x: 0, y: 0 }, data: { ...DRAWING_DEFAULTS, width: 20, height: 20, ...(mode ? { under: mode } : {}), annotations: [{ id: 'a', type: 'shape', spec: { kind: 'arrow', x1: 10, y1: 10, x2: 30, y2: 20 } }] } } as AppNode,
        ...more,
      ],
      [
        { id: '1', source: 'ai', sourceHandle: 'out', target: 'ap', targetHandle: 'dataset' },
        { id: '2', source: 'ap', sourceHandle: 'figure', target: 'ad', targetHandle: 'under' },
        ...edges,
      ],
    );
  const drawn = graph().get('ad')!;
  const f = drawn.view.figure!;
  ok(f.key === 'ad' && f.width === 85 && f.axes.length === 2 && f.axes[0].node === 'ap' && !!f.axes[1].drawing && f.axes[1].overlay === true && f.axes[1].drawing!.w === toPt(85, 'mm') && !!drawn.view.under, 'Annotated Plot: the drawing over it, on its page (85 mm, not its own 20)');
  const g = graph('guide').get('ad')!.view.figure!;
  ok(g.axes.length === 1 && !!g.axes[0].drawing && g.width === 85, 'Annotated Plot as a guide: the drawing alone, at the size of the Plot');
  const cv = canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 70, panels: 'a', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2 } }, [f, f], []);
  ok(cv.axes.length === 4 && cv.axes.filter((a) => a.overlay).length === 2 && cv.axes[1].style.pos.x === cv.boxes![0].box.x && cv.axes[1].style.pos.w === cv.boxes![0].box.w, 'Annotated Plot in a Merge: the drawing over its Plot, in its cell');
  const host = graph(undefined, [{ id: 'hp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' } } } as AppNode], [
    { id: '3', source: 'ai', sourceHandle: 'out', target: 'hp', targetHandle: 'dataset' },
    { id: '4', source: 'ad', sourceHandle: 'figure', target: 'hp', targetHandle: 'insets' },
  ]).get('hp')!.view.figure!;
  const ov = host.axes.find((a) => a.overlay);
  ok(!!ov && ov.inset?.host === host.axes[0].key && ov.inset.background === 'none' && JSON.stringify(ov.inset.box) === JSON.stringify(host.axes[1].inset?.box), 'Annotated Plot as an inset: the drawing in the same box as its Plot');
}

{
  // Objects pinned to the data of the Plot under a drawing: moved with them when the Plot's limits change
  const run = (xmax: number, pin?: { at: [number, number]; ref: [number, number] }) =>
    evaluateGraph(
      [
        { id: 'pi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;0\n4;1\n', textId: 'pi' } } as AppNode,
        { id: 'pp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, axes: { ...AXES_STYLE_DEFAULTS, x: { ...AXIS_DEFAULTS, min: 0, max: xmax } } } } as AppNode,
        { id: 'pd', type: 'drawing', position: { x: 0, y: 0 }, data: { ...DRAWING_DEFAULTS, annotations: [{ id: 'a', type: 'shape', ...(pin ? { pin } : {}), spec: { kind: 'arrow', x1: 10, y1: 10, x2: 30, y2: 20 } }] } } as AppNode,
      ],
      [
        { id: '1', source: 'pi', sourceHandle: 'out', target: 'pp', targetHandle: 'dataset' },
        { id: '2', source: 'pp', sourceHandle: 'figure', target: 'pd', targetHandle: 'under' },
      ],
    ).get('pd')!;
  const first = run(4);
  const map4 = plotMapping(first.view.under!)!;
  const at = map4.toData([30, 20]);
  const same = run(4, { at, ref: [30, 20] });
  ok(Math.abs(same.view.pinShift!.a[0]) < 1e-3 && Math.abs(same.view.pinShift!.a[1]) < 1e-3, 'Pinned arrow: where it was drawn while the limits stay');
  const wider = run(8, { at, ref: [30, 20] });
  const map8 = plotMapping(wider.view.under!)!;
  const now = map8.fromData(at);
  const sh = wider.view.pinShift!.a;
  const drawnAnn = wider.view.figure!.axes.find((x) => x.overlay)!.annotations[0];
  ok(sh[0] < -5 && Math.abs(30 + sh[0] - now[0]) < 1e-3 && Math.abs(20 + sh[1] - now[1]) < 1e-3 && JSON.stringify(drawnAnn.shift) === JSON.stringify(sh), `Pinned arrow: its head follows its data point when X goes to 8 (${sh.map((v) => v.toFixed(2)).join(', ')} mm)`);
}

{
  // Corners rounded and kept apart from the points: every one, or some of their own; changed again at will
  const c = cornersOf('* 2; 3 5; 1 0');
  ok(c.all === 2 && c.each.get(3) === 5 && c.each.get(1) === 0 && cornersText(c.all, c.each) === '* 2; 1 0; 3 5', 'Corners: read and written back');
  const sq = { ...SHAPE_DEFAULTS, kind: 'polygon' as const, points: '0 0; 10 0; 10 10; 0 10', closed: true };
  const one = parsePath(shapeToPath({ ...sq, corners: '2 3' }, 1)!);
  const all = parsePath(shapeToPath({ ...sq, corners: '* 1' }, 1)!);
  ok(one.filter((q) => q.c === 'C').length === 1 && all.filter((q) => q.c === 'C').length === 4, 'Corners: one of its own, or all of them');
  const mm = parsePath(shapeToPath({ ...sq, corners: '* 2.834645669' }, toPt(1, 'mm'))!);
  ok(JSON.stringify(mm[0].p) === JSON.stringify([1, 0]), 'Corners: their radius in pt, the points in mm');
}

{
  // The incomplete beta and gamma (DLMF continued fractions, modified Lentz) and the eigenvalues of non-symmetric matrices
  // (Householder + double-shift QR) against scipy / numpy (scripts/fixtures/nr-ref.json, made by nr-ref.py)
  const ref = JSON.parse(readFileSync('scripts/fixtures/nr-ref.json', 'utf8')) as { ibeta: number[][]; igamma: number[][]; A: number[][]; eigA: number[][]; B: number[][]; eigB: number[][] };
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  const worstB = Math.max(...ref.ibeta.map(([a, b, x, p, q]) => Math.max(rel(Di.ibeta(a, b, x), p), rel(Di.ibeta(a, b, x, true), q))));
  const worstG = Math.max(...ref.igamma.map(([a, x, p, q]) => Math.max(rel(Di.igamma(a, x), p), rel(Di.igamma(a, x, true), q))));
  ok(worstB < 1e-11, `Incomplete beta and its complement vs scipy (worst relative ${worstB.toExponential(1)})`);
  ok(worstG < 1e-11, `Incomplete gamma P and Q vs scipy (worst relative ${worstG.toExponential(1)})`);
  for (const [name, M, want] of [['A', ref.A, ref.eigA], ['badly scaled B', ref.B, ref.eigB]] as const) {
    const n = M.length;
    const e = Mx.eig(Mx.newMatrix(n, n, 'M', Float64Array.from(M.flat())));
    const got = typeof e === 'string' ? [] : Array.from({ length: n }, (_, i) => (e.values.cols === 2 ? [e.values.v[2 * i], e.values.v[2 * i + 1]] : [e.values.v[i], 0]));
    const scale = Math.max(...want.map(([re, im]) => Math.hypot(re, im)));
    const worst = got.length ? Math.max(...want.map(([re, im], i) => Math.hypot(got[i][0] - re, got[i][1] - im) / scale)) : Infinity;
    ok(worst < 1e-12, `Eigenvalues of the non-symmetric ${name} vs numpy (worst ${worst.toExponential(1)} of the largest)`);
  }
}

{
  // The studentized range and the noncentral t from their definitions (an integral over the scale) against scipy
  // (scripts/fixtures/rdist-ref.json, made by rdist-ref.py)
  const ref = JSON.parse(readFileSync('scripts/fixtures/rdist-ref.json', 'utf8')) as { tukey: number[][]; nct: number[][] };
  const worstQ = Math.max(...ref.tukey.map(([q, k, df, c]) => Math.abs(Di.ptukey(q, k, df) - c)));
  const worstT = Math.max(...ref.nct.map(([t, df, d, c]) => Math.abs(Di.nctCdf(t, df, d) - c) / Math.max(c, 1e-300)));
  ok(worstQ < 1e-9, `Studentized range vs scipy (worst ${worstQ.toExponential(1)})`);
  ok(worstT < 1e-8, `Noncentral t vs scipy (worst relative ${worstT.toExponential(1)})`);
  const sw = (ref as unknown as { sw: [number[], number, number][] }).sw;
  const badSw = sw.filter(([x, W, p]) => {
    const r = Hy.shapiroWilk(x);
    return !(Math.abs(r.stat - W) < 1e-7 && Math.abs(r.p - p) < 1e-6 * Math.max(1, p * 10));
  });
  ok(badSw.length === 0, `Shapiro–Wilk (Royston's formulas) vs scipy for n = 3 … 1000 (${badSw.map(([x]) => x.length).join(', ')})`);
  const q95 = Hy.qtukey(0.95, 3, 10);
  ok(Math.abs(Di.ptukey(q95, 3, 10) - 0.95) < 1e-10 && Math.abs(q95 - 3.877) < 1e-3, `Studentized range quantile: q(0.95; 3, 10) = ${q95.toFixed(4)}`);
}

{
  // Paths joined, broken, nodes added; copies along a path; objects behind the data; an annotated Plot in a Merge kept in
  // its proportions
  const j = pathText(joinPaths(parsePath('M0 0 L10 0'), parsePath('M20 5 L10 0'), 0.05));
  ok(j === 'M0 0 L10 0 L20 5', `Join: the nearest ends one node (${j})`);
  const j2 = pathText(joinPaths(parsePath('M0 0 L10 0'), parsePath('M12 0 L20 0'), 0.05));
  ok(j2 === 'M0 0 L10 0 L12 0 L20 0', `Join: a piece between ends apart (${j2})`);
  const br = breakAt(parsePath('M0 0 L10 0 L10 10 L0 10 Z'), 2).map(pathText);
  ok(br.length === 1 && br[0] === 'M10 10 L0 10 L0 0 L10 0 L10 10', `Break: a closed path opened at a node (${br[0]})`);
  const br2 = breakAt(parsePath('M0 0 L10 0 L20 0 L30 0'), 2).map(pathText);
  ok(br2.length === 2 && br2[0] === 'M0 0 L10 0 L20 0' && br2[1] === 'M20 0 L30 0', 'Break: an open path cut in two');
  const sp = parsePath('M0 0 L2 0 L10 0');
  ok(longestSegment(sp) === 2 && pathText(splitSegment(sp, 2)) === 'M0 0 L2 0 L6 0 L10 0', 'A node in the middle of the longest piece');
  const dot: AnnotationItem = { id: 'd', type: 'shape', spec: { kind: 'ellipse', x1: -1, y1: -1, x2: 1, y2: 1 } };
  const along = pathArray([dot], 'M0 0 L30 0', 4, [0, 0], false);
  ok(along.length === 4 && along.map((it) => (it.spec as { x1: number }).x1 + 1).join(',') === '0,10,20,30', 'Array along an open path: from end to end');
  const ring = pathArray([dot], shapeToPath({ ...SHAPE_DEFAULTS, kind: 'ellipse', x1: -10, y1: -10, x2: 10, y2: 10 }, 1)!, 4, [0, 0], true);
  const c0 = ring.map((it) => [((it.spec as { x1: number; x2: number }).x1 + (it.spec as { x2: number }).x2) / 2, ((it.spec as { y1: number; y2: number }).y1 + (it.spec as { y2: number }).y2) / 2]);
  ok(ring.length === 4 && c0.every(([x, y]) => Math.abs(Math.hypot(x, y) - 10) < 0.05), 'Array along a closed path: evenly round it');
  // ---- transformed: flipped, scaled, skewed; blended, bent; isometric boxes; simplified; heads along a line ----
  {
    const spec = (it: AnnotationItem | null) => (it?.type === 'shape' ? (it.spec as Record<string, number | string | boolean | undefined>) : {});
    const rect: AnnotationItem = { id: 'r', type: 'shape', spec: { kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 4, rotation: 20 } };
    const fr = spec(transformItem(rect, flipAcross([20, 0])));
    ok(fr.kind === 'rect' && fr.x1 === 30 && fr.x2 === 40 && Math.abs((((Number(fr.rotation) + 20) % 180) + 180) % 180) < 1e-9, `Flip across: a rectangle stays one, mirrored about x = 20 and turned the other way (${fr.x1} … ${fr.x2}, ${fr.rotation}°)`);
    const star: AnnotationItem = { id: 's', type: 'shape', spec: { kind: 'star', x1: 0, y1: 0, x2: 10, y2: 10, n: 5 } };
    ok(spec(transformItem(star, flipDown([5, 5]))).rotation === 180 && !spec(transformItem(star, flipAcross([5, 5]))).rotation, 'Flip: a star pointing up flipped down points down; flipped across, it is the same');
    const img: AnnotationItem = { id: 'i', type: 'shape', spec: { kind: 'image', x1: 0, y1: 0, x2: 8, y2: 6, href: 'x' } };
    const fi = spec(transformItem(img, flipAcross([4, 3])));
    ok(fi.mirror === true && fi.x1 === 0 && fi.x2 === 8 && !spec(transformItem({ ...img, spec: { ...img.spec, mirror: true } } as AnnotationItem, flipAcross([4, 3]))).mirror, 'Flip across: a picture mirrored (twice: as it was)');
    const ln: AnnotationItem = { id: 'l', type: 'shape', spec: { kind: 'arrow', x1: 0, y1: 0, x2: 10, y2: 0, curve: 0.3 } };
    const fl = spec(transformItem(ln, flipDown([0, 5])));
    ok(fl.y1 === 10 && fl.y2 === 10 && fl.curve === -0.3, 'Flip down: an arrow\'s points mirrored, its bend the other way');
    const sc = spec(transformItem({ id: 'e', type: 'shape', spec: { kind: 'ellipse', x1: 0, y1: 0, x2: 10, y2: 10 } }, scaleAbout([0, 0], 2, 0.5)));
    ok(sc.kind === 'ellipse' && sc.x2 === 20 && sc.y2 === 5, 'Scale across × 2, down × 0.5: an ellipse not turned stays one, its box scaled');
    const sk = spec(transformItem(rect, skewAbout([0, 0], 30, 0)));
    ok(sk.kind === 'path' && typeof sk.d === 'string', 'Skew: a turned rectangle becomes a path');
    const tx = transformItem({ id: 't', type: 'text', spec: { x: 2, y: 0, text: 'a', style: { size: 8 } } } as AnnotationItem, scaleAbout([0, 0], 1.5, 1.5));
    ok(tx?.type === 'text' && (tx.spec as { x: number }).x === 3 && (tx.spec as { style: { size: number } }).style.size === 12, 'Scale 150 %: a text moved and its letters 1.5 × larger');
    const a: AnnotationItem = { id: 'a', type: 'shape', spec: { kind: 'ellipse', x1: -2, y1: -2, x2: 2, y2: 2, fill: '#000000', fillOpacity: 1, color: '#000000', width: 1 } };
    const b: AnnotationItem = { id: 'b', type: 'shape', spec: { kind: 'rect', x1: -10, y1: -10, x2: 10, y2: 10, fill: '#ffffff', fillOpacity: 1, color: '#ff0000', width: 3 } };
    const bl = blendItems(a, b, 3);
    const mid = bl[1]?.type === 'shape' ? (bl[1].spec as { points: string; fill: string; width: number }) : null;
    const pts = mid ? mid.points.split(';').map((q) => q.trim().split(/\s+/).map(Number)) : [];
    const rad = pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)));
    ok(bl.length === 3 && !!mid && mid.fill === '#808080' && mid.width === 2 && Math.min(...rad) > 2 && Math.max(...rad) < 10 && new Set(bl.map((it) => it.group)).size === 1, `Blend: 3 shapes between a circle and a square, the middle one between them, its fill and width halfway (${mid?.fill}, ${mid?.width} pt)`);
    const bar: AnnotationItem = { id: 'bar', type: 'shape', spec: { kind: 'rect', x1: 0, y1: -1, x2: 10, y2: 1 } };
    const bent = bendItems([bar], 'M0 0 L0 20', { x: 0, y: -1, w: 10, h: 2 }, true)[0];
    const bd = bent.type === 'shape' ? String(bent.spec.d) : '';
    const nums = bd.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = nums.filter((_, k) => k % 2 === 0);
    const ys = nums.filter((_, k) => k % 2 === 1);
    ok(bent.type === 'shape' && bent.spec.kind === 'path' && Math.max(...ys) > 19.9 && Math.min(...ys) > -0.1 && Math.max(...xs.map(Math.abs)) < 1.1, 'Bend: a bar 10 × 2 bent along a line down 20 mm, stretched to its length (along it, 2 wide across)');
    const box = isoBox([0, 0], 10, 10, 5, '#808080');
    const faces = box.map((it) => (it.spec as { points: string }).points.split(';').map((q) => q.trim().split(/\s+/).map(Number)));
    const top = faces[2];
    ok(box.length === 3 && new Set(box.map((it) => it.group)).size === 1 && Math.abs(Math.hypot(top[1][0] - top[2][0], top[1][1] - top[2][1]) - 10) < 2e-3 && Math.abs(top[0][0] - top[2][0]) < 2e-3 && Math.abs(faces[0][2][1] - faces[0][1][1] - 5) < 1e-9, 'Isometric box: three faces in one group, its edges 10 mm long at 30°, 5 mm high');
    ok(isoStack([0, 0], 10, 10, [1, 2], ['#000000', '#ffffff']).length === 6, 'Isometric stack: a box for every layer');
    const simp = simplifyPath(`M0 0${Array.from({ length: 50 }, (_, k) => ` L${k + 1} ${Math.sin(k) * 0.01}`).join('')}`, 0.1, false);
    ok(simp === 'M0 0 L50 -0.0095', `Simplify: a line of 51 points almost straight, its two ends (${simp})`);
    const sq = simplifyPath('M0 0 L5 0 L10 0 L10 5 L10 10 L5 10 L0 10 L0 5 Z', 0.01, false);
    ok(nodeCount(sq) === 5 && sq.endsWith('Z'), `Simplify: a square with a node in the middle of each side, its four corners, closed (${sq})`);
    ok(panelOrder(['a', 'b', 'c'], ['c', 'a']).join() === 'c,a,b' && panelOrder(['a', 'b'], undefined).join() === 'a,b', 'Merge: the panels in the order chosen, the others after them in the order connected');
    // the faces of an isometric box: an object on one keeps its own shape, drawn through the face's projection
    const near2 = (p: number[], q: number[], e = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < e;
    const place = { face: 'top' as const, at: [3, 4] as [number, number] };
    ok(near2(isoToFace(place, isoToPage(place, [7, -2])), [7, -2]) && near2(isoToPage({ face: 'left', at: [0, 0] }, [1, 0]), [Math.cos(Math.PI / 6), 0.5]), 'Isometric face: a point to the page and back; the left face, its first edge down to the right at 30°');
    ok(isoEdges('top').join() === '30,150' && isoEdges('right').join() === '150,90', `Isometric face: the directions of its edges (${isoEdges('top')}, ${isoEdges('right')})`);
    const flatR: AnnotationItem = { id: 'fr', type: 'shape', spec: { kind: 'rect', x1: 10, y1: 10, x2: 30, y2: 20 } };
    const onTop = onFace(flatR, 'top');
    const topBox = geomBox(onTop)!;
    ok(onTop.iso?.face === 'top' && onTop.type === 'shape' && onTop.spec.kind === 'rect' && near2([topBox.x + topBox.w / 2, topBox.y + topBox.h / 2], [20, 15], 1e-3), `Isometric face: a rectangle put on the top face stays one, its middle where it was (${JSON.stringify(topBox)})`);
    const back = onFace(onTop, null);
    ok(!back.iso && back.type === 'shape' && back.spec.x1 === 10 && back.spec.y2 === 20, 'Isometric face: taken off it (Flat), the rectangle back as it was');
    const movedTop = moveItem(onTop, 5, -1);
    ok(movedTop.iso && near2(movedTop.iso.at, [onTop.iso!.at[0] + 5, onTop.iso!.at[1] - 1], 1e-3) && movedTop.type === 'shape' && movedTop.spec.x1 === 10, 'Isometric face: moved on the page, its place moved, its own points kept');
    const baked = bakeIso(onTop);
    const bb = baked.type === 'shape' ? pathBox(parsePath(String(baked.spec.d))) : null;
    ok(!baked.iso && baked.type === 'shape' && baked.spec.kind === 'path' && !!bb && Math.abs(bb.w - topBox.w) < 1e-2 && Math.abs(bb.h - topBox.h) < 1e-2, 'Isometric face: drawn as it is (for Path and Make), a path on the page in the same place');
    const flippedTop = transformItem(onTop, flipAcross([20, 15]));
    const fb2 = flippedTop ? geomBox(flippedTop) : null;
    ok(!!flippedTop?.iso && !!fb2 && Math.abs(fb2.w - topBox.w) < 1e-2 && Math.abs(fb2.x + fb2.w / 2 - 20) < 1e-2, 'Isometric face: flipped on the page, it stays on its face, mirrored about its middle');
    const isoFig = evaluateGraph([
      { id: 'di', type: 'drawing', position: { x: 0, y: 0 }, data: { ...DRAWING_DEFAULTS, annotations: [onTop, { id: 'tx', type: 'text', iso: { face: 'right', at: [1, 2], upright: true }, spec: { text: 'A', x: 4, y: 0 } }] } } as AppNode,
    ], []).get('di')!.view.figure!.axes[0].annotations;
    const upr = isoFig[1];
    ok(isoFig[0].iso?.length === 6 && near2(isoFig[0].iso.slice(4), onTop.iso!.at) && !upr.iso && upr.kind === 'text' && near2([upr.text.x, upr.text.y], [1 + 4 * Math.cos(Math.PI / 6), 2 - 2]), 'Isometric face: drawn through its projection; an upright text only placed on its face');
  }
  const g = evaluateGraph(
    [
      { id: 'bi', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: 'x;y\n0;0\n4;1\n', textId: 'bi' } } as AppNode,
      { id: 'bp', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' } } } as AppNode,
      { id: 'bd', type: 'drawing', position: { x: 0, y: 0 }, data: { ...DRAWING_DEFAULTS, annotations: [{ id: 'f', type: 'shape', spec: { kind: 'rect', x1: 1, y1: 1, x2: 5, y2: 5 } }, { id: 'b', type: 'shape', behind: true, spec: { kind: 'rect', x1: 10, y1: 10, x2: 20, y2: 20 } }] } } as AppNode,
    ],
    [
      { id: '1', source: 'bi', sourceHandle: 'out', target: 'bp', targetHandle: 'dataset' },
      { id: '2', source: 'bp', sourceHandle: 'figure', target: 'bd', targetHandle: 'under' },
    ],
  ).get('bd')!.view.figure!;
  const below = g.axes.find((a) => a.beneath);
  const front = g.axes.find((a) => a.overlay && !a.beneath);
  ok(!!below && below.beneath === g.axes[0].key && below.annotations.length === 1 && front?.annotations.length === 1, 'Behind the data: its own overlay, drawn inside the Plot\'s frame');
  const mg = canvasFigure('cv', { ...CANVAS_DEFAULTS, width: 180, height: 40, layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2 } }, [g, g], []);
  const b0 = mg.boxes![0].box;
  const aspect = ((b0.w / 100) * 180) / ((b0.h / 100) * 40);
  ok(Math.abs(aspect - 85 / 65) < 1e-6 && mg.axes[0].auto === false, `Annotated Plot in a Merge: its proportions kept (${aspect.toFixed(4)})`);
}

// ---- gradients placed in a shape's box ----
{
  const sh = { ...SHAPE_DEFAULTS, kind: 'rect' as const, grad: 'linear' as const };
  ok(JSON.stringify(linearEnds(sh)) === '[[50,0],[50,100]]' && JSON.stringify(linearEnds({ ...sh, gradAngle: 0 })) === '[[0,50],[100,50]]', 'Gradient: by default across the whole box at its angle');
  const box = { x: 10, y: 20, w: 40, h: 20 };
  const lin = gradAttrs({ ...sh, gradX1: 25, gradY1: 50, gradX2: 75, gradY2: 50, gradSpread: 'reflect' }, box);
  ok(lin.x1 === 20 && lin.x2 === 40 && lin.y1 === 30 && lin.gradientUnits === 'userSpaceOnUse' && lin.spreadMethod === 'reflect', 'Gradient: start and end in % of the box, reflected beyond them');
  const rad = gradAttrs({ ...sh, grad: 'radial', gradCx: 50, gradCy: 50, gradR: 50, gradR2: 50 }, box);
  ok(rad.cx === 30 && rad.cy === 30 && rad.r === 10 && String(rad.gradientTransform).includes('scale(1 0.50000)'), `Gradient: radial, its radii across and down (${JSON.stringify(rad)})`);
}

// ---- Curve math: several operations; curves from columns, from a sheet of a workbook ----
{
  // A: y = x, B: y = x + 1 (on the same X); ΔX at Y = 5 is −1, ΔY at X = 2 is +1
  const text = 'x\ta\tb\n0\t0\t1\n10\t10\t11';
  const book = { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 'x\ty\n0\t0\n1\t1' }, { name: 'S2', text }] } } as AppNode;
  const node = (d: Partial<CurveMathData>, edges: { source: string; sourceHandle: string; targetHandle: string }[], extra: AppNode[] = []) =>
    evaluateGraph(
      [book, ...extra, { id: 'c', type: 'curvemath', position: { x: 0, y: 0 }, data: { ...CURVEMATH_DEFAULTS, ...d } } as AppNode],
      [...edges.map((e, k) => ({ id: `e${k}`, target: 'c', ...e })), ...extra.map((x) => ({ id: `w-${x.id}`, source: 'w', sourceHandle: 'book', target: x.id, targetHandle: 'in' }))],
    ).get('c')!;
  const ops = [
    { ...CURVEMATH_DEFAULTS, op: 'dxAtY' as const, values: '5' },
    { ...CURVEMATH_DEFAULTS, op: 'dyAtX' as const, values: '2' },
  ];
  const r = node({ sheetA: 'S2', ya: 'a', yb: 'b', ops }, [{ source: 'w', sourceHandle: 'book', targetHandle: 'a' }]);
  const last = (port: string) => {
    const o = r.outputs[port];
    return o?.t === 'dataset' ? o.v.columns[o.v.columns.length - 1].values[0] : NaN;
  };
  ok(near(last('out'), -1, 1e-12) && near(last('out-1'), 1, 1e-12) && JSON.stringify(r.view.sheetsA) === '["S1","S2"]' && r.view.cmath?.ops.length === 2 && near(r.view.cmath.ops[0].overlay.dx?.[0].xb ?? NaN, 4, 1e-12) && near(r.view.cmath.ops[1].overlay.dy?.[0].yb ?? NaN, 3, 1e-12), `curvemath: a sheet of a workbook, two operations — each its output and what it computes (${last('out')}, ${last('out-1')}; ${r.errors.join('; ')})`);
  // from columns: one X, a Y for each curve
  const ex = (id: string, column: string) => ({ id, type: 'extract', position: { x: 0, y: 0 }, data: { ...EXTRACT_DEFAULTS, column, index: 0, sheet: 'S2' } }) as AppNode;
  const rc = node({ op: 'sub' }, [{ source: 'ex', sourceHandle: 'out', targetHandle: 'x' }, { source: 'ea', sourceHandle: 'out', targetHandle: 'ya' }, { source: 'eb', sourceHandle: 'out', targetHandle: 'yb' }], [ex('ex', 'x'), ex('ea', 'a'), ex('eb', 'b')]);
  const sub = rc.outputs.out;
  ok(sub?.t === 'dataset' && Array.from(sub.v.columns[1].values).join() === '-1,-1' && rc.view.cmath?.ops[0].overlay.curve?.y.length === 2, `curvemath: curves from columns, A − B (${sub?.t === 'dataset' ? Array.from(sub.v.columns[1].values).join() : rc.errors.join('; ')})`);
}

// ---- a Plot with a workbook: its sheets and their columns (to add curves from any sheet) ----
{
  const r = evaluateGraph(
    [
      { id: 'w', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS, sheets: [{ name: 'S1', text: 't\ta\n0\t1\n1\t2' }, { name: 'S2', text: 'E\tc\td\n1\t2\t3\n2\t3\t4' }] } } as AppNode,
      { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), sheet: 'S2', cols: { x: 'E', y: 'd' } } } as AppNode,
    ],
    [{ id: 'e', source: 'w', sourceHandle: 'book', target: 'p', targetHandle: 'dataset' }],
  ).get('p')!;
  const cols = r.view.sheetCols?.S2?.map((c) => c.name).join();
  ok(JSON.stringify(r.view.sheets) === '["S1","S2"]' && cols === 'E,c,d' && r.view.curves?.some((c) => c.series.y.name.startsWith('d')), `plot: a workbook — its sheets, their columns, a curve from the second sheet (${JSON.stringify(r.view.sheets)}; ${cols}; ${r.errors.join('; ')})`);
}

// ---- Convert columns, Transpose, Stack columns ----
{
  const R = TO_NUMBER_DEFAULTS;
  const read = (s: string, dec: '.' | ',' = '.', r = R) => {
    const c = readCell(s, r, dec);
    return c === 'empty' ? 'empty' : c ? `${c.v}${c.err !== undefined ? `±${c.err}` : ''}${c.unit ? ` ${c.unit}` : ''}` : 'null';
  };
  const got = [read('300 K'), read('1,5', ','), read('1 200,5', ','), read('1,200.5'), read('1.200,5', ','), read('25 %'), read('1.23 ± 0.05'), read('(1.23 ± 0.05) eV'), read('1.234(12)'), read('<0.01'), read('<0.01', '.', { ...R, below: 'half' }), read('3×10^-4'), read('3·10⁻⁴'), read('n.d.'), read('Sample_300K_2h'), read('Sample_300K_2h', '.', { ...R, first: true }), read('10 20'), read('−2.5e3'), read('25 %', '.', { ...R, percent: 'fraction' })];
  const want = ['300 K', '1.5', '1200.5', '1200.5', '1200.5', '25 %', '1.23±0.05', '1.23±0.05 eV', '1.234±0.012', 'empty', '0.005', '0.0003', '0.0003', 'empty', 'null', '300', 'null', '-2500', '0.25'];
  ok(got.join('|') === want.join('|'), `convert: cells read as numbers (${got.join(' | ')})`);
  const txt = (xs: string[]) => column('', new Float64Array(xs.length).fill(NaN), xs);
  const ds: Dataset = { name: 'd', columns: [{ ...txt(['300 K', '310 K', 'n.d.', 'x']), name: 'T' }, { ...txt(['1.2 ± 0.1 eV', '1.5 ± 0.2 eV', '', '1.7 ± 0.1 eV']), name: 'E' }, column('n', Float64Array.from([1, 2, 3, 4]))] };
  const none = convertTable(ds, { to: 'numbers', cols: '' });
  const c = convertTable(ds, { to: 'numbers', cols: 'A-B' });
  const cols = typeof c === 'string' ? [] : c.dataset.columns;
  ok(typeof none !== 'string' && none.dataset === ds && typeof c !== 'string' && cols.map((q) => `${q.name}:${q.role ?? ''}`).join(', ') === 'T (K):, E (eV):, E error (eV):yerr, n:' && Array.from(cols[0].values).join() === '300,310,NaN,NaN' && Array.from(cols[2].values).join() === '0.1,0.2,NaN,0.1' && !cols[0].text && c.warnings.length === 1 && c.warnings[0].includes('row 4 “x”'), `convert: nothing until columns are chosen; then units into the names, ± as an error column, a cell not read listed (${typeof c === 'string' ? c : c.warnings.join(' ')})`);
  const t = convertTable({ name: 'd', columns: [column('V', Float64Array.from([-0.5, 0.25, 1]))] }, { to: 'text', cols: 'A', txt: { template: '{v} V', format: 'fixed', digits: 2, comma: true } });
  ok(typeof t !== 'string' && t.dataset.columns[0].text?.join('|') === '-0,50 V|0,25 V|1,00 V' && t.dataset.columns[0].values.every((v) => Number.isNaN(v)), `convert: numbers written as text (${typeof t === 'string' ? t : t.dataset.columns[0].text?.join('|')})`);
  const lk = looksNumeric(ds.columns[0]);
  ok(lk.text === 4 && lk.numeric === 2 && lk.examples.join() === '300 K,310 K', 'convert: the text cells that look like numbers counted for the proposal');
  // in a worksheet: the cells typed as numbers in the changes, the unit into the name, the errors in a column after it
  const base: Dataset = { name: 'b', columns: [column('x', Float64Array.from([1, 2, 3])), { ...txt(['1.2 ± 0.1 eV', 'n.d.', 'abc']), name: 'E' }, column('z', Float64Array.from([7, 8, 9]))] };
  const sh = applySheet(base, undefined, '.');
  const ed = convertInSheet({}, sh.map, sh.dataset, [{ shown: 1, read: 1 }], TO_NUMBER_DEFAULTS);
  const after = applySheet(base, ed, '.').dataset.columns;
  ok(after.map((q) => `${q.name}:${q.role ?? ''}`).join() === 'x:,E (eV):,E error (eV):yerr,z:' && after[1].values[0] === 1.2 && Number.isNaN(after[1].values[1]) && after[1].text?.[2] === 'abc' && after[2].values[0] === 0.1, `convert in a worksheet: typed as changes, the error column after it (${after.map((q) => q.name).join(', ')})`);
  // the table of the user's example: 7 voltages (rows) × 14 wavelengths (columns); turned, then turned back
  const V = [-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const wl = Array.from({ length: 14 }, (_, k) => 400 + 10 * k);
  const cell = (i: number, k: number) => Math.sin(i + 0.3 * k) * 1e-4;
  const sweep: Dataset = { name: 's', columns: [column('Voltage (V)', Float64Array.from(V)), ...wl.map((w, k) => column(`${w} nm`, Float64Array.from(V, (_, i) => cell(i, k))))] };
  const tr = transposeTable(sweep, { names: '', head: 'number' });
  const tc = typeof tr === 'string' ? [] : tr.dataset.columns;
  ok(tc.length === 8 && tc[0].name === 'Value (nm)' && tc[0].role === 'x' && Array.from(tc[0].values).join() === wl.join() && tc.slice(1).map((q) => q.name).join() === '-0.5,-0.25,0,0.25,0.5,0.75,1' && tc[3].key?.name === 'Voltage (V)' && tc[3].key.value === 0 && tc[3].values[5] === cell(2, 5), `transpose: 7 × 15 becomes 14 × 8, the wavelengths read from the names, every column its voltage (${tc.map((q) => q.name).join(', ')})`);
  const back = typeof tr === 'string' ? tr : transposeTable(tr.dataset, { names: '', head: 'number', headName: 'Voltage (V)', fmt: { template: '{v} nm' } });
  const bc = typeof back === 'string' ? [] : back.dataset.columns;
  ok(bc.length === 15 && bc[0].name === 'Voltage (V)' && Array.from(bc[0].values).join() === V.join() && bc.slice(1).every((q, k) => q.name === `${wl[k]} nm` && Array.from(q.values).every((v, i) => v === cell(i, k))), `transpose twice: the table back (${bc.slice(0, 3).map((q) => q.name).join(', ')} …)`);
  const tt = transposeTable(sweep, { names: '#', head: 'text', fmt: { template: 'Row {v}' } });
  ok(typeof tt !== 'string' && tt.dataset.columns.length === 8 && tt.dataset.columns[0].text?.[0] === 'Voltage (V)' && tt.dataset.columns[1].name === 'Row 1' && tt.dataset.columns[1].values[0] === -0.5, 'transpose: names from the row numbers, the old names as text');
  const st = stackColumns({ name: 'k', columns: [{ ...column('t (s)', Float64Array.from([0, 1, 2])), role: 'x' }, column('300 K', Float64Array.from([1, 2, 3])), column('310 K', Float64Array.from([4, 5, 6]))] }, { cols: '', key: 'number' });
  const sc = typeof st === 'string' ? [] : st.dataset.columns;
  ok(sc.map((q) => q.name).join() === 'Name (K),t (s),Value' && Array.from(sc[0].values).join() === '300,300,300,310,310,310' && Array.from(sc[1].values).join() === '0,1,2,0,1,2' && Array.from(sc[2].values).join() === '1,2,3,4,5,6', `stack columns: two columns one under the other, their names as numbers (${sc.map((q) => q.name).join(', ')})`);
  const s2 = stackColumns({ name: 'k', columns: [column('x', Float64Array.from([0, 1])), column('A', Float64Array.from([1, 2])), { ...column('A err', Float64Array.from([0.1, 0.2])), role: 'yerr' }, column('B', Float64Array.from([3, 4])), { ...column('B err', Float64Array.from([0.3, 0.4])), role: 'yerr' }] }, { cols: 'A, B', key: 'text', valueName: 'Signal (mV)' });
  const s2c = typeof s2 === 'string' ? [] : s2.dataset.columns;
  ok(s2c.map((q) => `${q.name}:${q.role}`).join() === 'Name:label,x:x,Signal (mV):y,Signal error (mV):yerr' && s2c[0].text?.join() === 'A,A,B,B' && Array.from(s2c[3].values).join() === '0.1,0.2,0.3,0.4', 'stack columns: the names as text, the errors stacked with the values');
  // Columns to sheets: a sheet per column (its X, its ±Y), and back by Sheets to columns the same columns; a sheet per
  // value of a column (text and numbers, in the order first met; a name met twice numbered); errors said
  const tbl: Dataset = { name: 't', columns: [{ ...column('x', Float64Array.from([0, 1, 2])), role: 'x' }, { ...column('A', Float64Array.from([1, 2, 3])), role: 'y' }, { ...column('A err', Float64Array.from([0.1, 0.2, 0.3])), role: 'yerr' }, { ...column('B', Float64Array.from([4, 5, 6])), role: 'y' }] };
  const bk = columnsToSheets(tbl, { mode: 'columns', cols: '' });
  const roundTrip = typeof bk === 'string' ? null : autoExtract(bk.book.sheets, [{ sheets: '*', columns: '1', role: 'x' }, { sheets: '*', columns: '2', role: 'y' }, { sheets: '*', columns: '3', role: 'yerr' }], 'column').dataset;
  const bys = roundTrip?.columns.filter((c) => c.role === 'y').map((c) => Array.from(c.values).join(' ')).join(' | ');
  const long: Dataset = { name: 'l', columns: [{ ...column('Sample', new Float64Array(5).fill(NaN), ['S1', 'S2', 'S1', 'S3', 'S2']), role: 'label' }, { ...column('t', Float64Array.from([1, 2, 3, 4, 5])), role: 'x' }, { ...column('v', Float64Array.from([10, 20, 30, 40, 50])), role: 'y' }] };
  const bv = columnsToSheets(long, { mode: 'values', cols: '', by: 'Sample' });
  const bn = columnsToSheets({ name: 'n', columns: [column('T', Float64Array.from([300, 310, 300])), column('v', Float64Array.from([1, 2, 3]))] }, { mode: 'values', cols: '', by: 'T' });
  const sheetsOf = (r: typeof bv) => (typeof r === 'string' ? r : r.book.sheets.map((s) => `${s.name}:${Array.from(s.columns[s.columns.length - 1].values).join(',')}`).join(' '));
  ok(typeof bk !== 'string' && bk.book.sheets.map((s) => `${s.name}=${s.columns.map((c) => `${c.name}/${c.role}`).join('+')}`).join(' ') === 'A=x/x+A/y+A err/yerr B=x/x+B/y' && bys === '1 2 3 | 4 5 6' && sheetsOf(bv) === 'S1:10,30 S2:20,50 S3:40' && sheetsOf(bn) === '300:1,3 310:2' && columnsToSheets(long, { mode: 'values', cols: '' }) === 'Choose the column whose values make the sheets.' && columnsToSheets(long, { mode: 'values', cols: '', by: 'Q' }) === 'By: no column “Q”.', `Columns to sheets: a sheet per column (and back: ${bys}), per value of a column (${sheetsOf(bv)}; ${sheetsOf(bn)}), errors said`);
}

// ---- a table written out ----
{
  const ds = {
    name: 't',
    columns: [
      { name: 'Wavelength (nm)', values: new Float64Array([400, 405.5, 410]) },
      { name: 'R, a "label"', values: new Float64Array([0.25, NaN, 1 / 3]), mask: new Uint8Array([0, 0, 1]) },
      { name: 'Sample', values: new Float64Array([NaN, NaN, NaN]), text: ['a', 'b;c', ''], role: 'label' as const },
    ],
  };
  const o = { ...TABLE_EXPORT_DEFAULTS, lineEnd: 'lf' as const };
  const csvOut = tableText(ds, o);
  ok(csvOut === 'Wavelength (nm),"R, a ""label""",Sample\n400,0.25,a\n405.5,,b;c\n410,0.3333333333333333,\n', `Export: CSV, quoted where needed (${JSON.stringify(csvOut)})`);
  const eu = tableText(ds, { ...o, delimiter: ';', decimal: ',', digits: 3, missing: 'NaN', masked: 'drop', header: 'none' });
  ok(eu === '400;0,25;a\n406;NaN;"b;c"\n', `Export: decimal comma (semicolons), 3 digits, NaN, masked rows left out (${JSON.stringify(eu)})`);
  const tabbed = tableText(ds, { ...o, delimiter: 'custom', custom: '\\t', roles: true, masked: 'empty' });
  ok(exportOptions({ format: 'csv', decimal: ',' } as never).delimiter === ';' && extensionOf(exportOptions({ delimiter: '\t' })) === 'tsv' && extensionOf(o) === 'csv', 'Export: the first form of the settings read; the extension from the delimiter');
  ok(tabbed.split('\n')[1] === 'X\tY\tLabel' && tableCells(ds, { ...o, masked: 'empty' })[3][1] === null, `Export: text with a tab, the designations line, a masked value left empty (${JSON.stringify(tabbed)})`);
}

{
  // the examples of the data preparation, statistics and figures: what each one is meant to show
  const ex = (start: string) => {
    const p = EXAMPLES.find((e) => e.name.startsWith(start))!.make();
    return { p, r: evaluateGraph(p.nodes, p.edges) };
  };
  const view = (r: Map<string, { view: unknown }>, id: string) => r.get(id)?.view as Record<string, unknown> | undefined;
  const out = (r: Map<string, { outputs: Record<string, { t: string; v: unknown }> }>, id: string, port = 'out') => {
    const v = r.get(id)?.outputs[port];
    return v?.t === 'dataset' ? (v.v as { columns: { name: string; values: Float64Array; mask?: Uint8Array }[] }) : undefined;
  };
  const lg = ex('Cleaning');
  const lgRep = ((view(lg.r, 'lg-clean')?.report as string[] | undefined) ?? []).join(' ');
  const hum = out(lg.r, 'lg-manip')?.columns.find((c) => c.name === 'Humidity (%)');
  ok(/3 missing values filled/.test(lgRep) && /3 outliers .*rows 35, 80, 103/.test(lgRep) && out(lg.r, 'lg-filter')?.columns[0].values.length === 121 && hum?.mask?.[45] === 1 && hum.mask[46] === 1 && hum.mask.reduce((a, b) => a + b, 0) === 2, `example “Cleaning a sensor log”: the rows merged and sorted, 3 gaps filled, exactly the 3 spikes found, 2 points masked (${lgRep})`);
  const sc = ex('Replicate');
  const avg = out(sc.r, 'sc-avg');
  ok(avg?.columns.map((c) => c.name).join() === 'Wavelength (nm),mean,SD,SE,N' && avg.columns[0].values.length === 146 && avg.columns[4].values.every((v) => v === 3) && out(sc.r, 'sc-all')?.columns[0].values.length === 372, 'example “Replicate scans”: the mean of the 3 scans on 146 points, all 372 points pooled');
  const df = ex('Difference');
  const dd = out(df.r, 'df-math');
  const peakAt = dd ? dd.columns[0].values[dd.columns[1].values.indexOf(Math.max(...dd.columns[1].values))] : NaN;
  ok(!!dd && near(peakAt, 655, 3) && !!out(df.r, 'df-math', 'out-1'), `example “Difference spectrum”: sample − reference peaks at the band only the sample has (${peakAt} nm)`);
  const dg = ex('Digitizer');
  const dp = out(dg.r, 'dg-image');
  const curveAt = (t: number) => 0.2 + 1.5 * Math.exp(-((t - 3) ** 2) / 2) + 0.4 * Math.exp(-((t - 7) ** 2) / 0.8);
  const dErr = dp ? Math.max(...Array.from(dp.columns[0].values, (x, i) => Math.abs(dp.columns[1].values[i] - curveAt(x)))) : NaN;
  ok(dp?.columns[0].values.length === 21 && dErr < 0.01, `example “Digitizer”: the 21 points read lie on the curve drawn (largest gap ${dErr.toFixed(4)} mV)`);
  const py = ex('Python script');
  const pyNode = py.p.nodes.find((n) => n.id === 'py-script')!.data as { run?: number; outs?: { name: string }[] };
  ok(!pyNode.run && pyNode.outs?.map((o) => o.name).join() === 'peaks,fitted' && /Run/.test(String(view(py.r, 'py-script')?.waiting)) && !(py.r.get('py-plot')?.warnings ?? []).length, 'example “Python script”: not run before Run (no download), its outputs connected, no warning');
  const pub = ex('Publication');
  const pubFig = pub.r.get('pub-draw')?.outputs.figure?.v as { axes: { inset?: unknown; drawing?: unknown }[] } | undefined;
  ok(!!pubFig && pubFig.axes.some((a) => a.inset) && pubFig.axes.some((a) => a.drawing) && Object.keys((view(pub.r, 'pub-draw')?.pinShift as object) ?? {}).length === 4, 'example “Publication figure”: the inset, the drawing over the figure, its 4 pinned objects moved to their data');
  const org = ex('Organizing');
  const orgFig = org.r.get('org-plot')?.outputs.figure?.v as { axes: { curves: unknown[] }[] } | undefined;
  ok(org.p.nodes.filter((n) => n.type === 'frame').length === 3 && org.p.nodes.some((n) => n.type === 'subgraph') && org.p.nodes.some((n) => n.type === 'reroute') && (orgFig?.axes[0].curves.length ?? 0) > 0, 'example “Organizing”: 3 frames, a group, a reroute, the curve through them');
  // every node is shown by at least one example (the nodes inside groups counted)
  const seen = new Set<string>();
  const walk = (ns: AppNode[]) => ns.forEach((n) => (seen.add(n.type), Array.isArray((n.data as { nodes?: AppNode[] }).nodes) && walk((n.data as { nodes: AppNode[] }).nodes)));
  for (const e of EXAMPLES) walk(e.make().nodes);
  // the Image analysis and Phase diagram nodes are hidden (not offered) for now: no example of them
  const missing = (Object.keys(NODE_HELP) as string[]).filter((t) => !seen.has(t) && t !== 'image' && t !== 'phasediagram');
  ok(!missing.length, `examples: every node in at least one (${missing.join(', ')})`);
}
{
  // a Note's document: a plain text as paragraphs and back; plain paragraphs kept as the text alone, formatting not
  const d0 = docFromText('Sample A\n\nmeasured at 20 °C');
  ok(d0.content?.length === 3 && plainOf(d0) === 'Sample A\n\nmeasured at 20 °C' && isPlain(d0), 'Note: a plain text as paragraphs, and back');
  const rich = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Results' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] }] }, { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'c' }] }] };
  ok(plainOf(rich) === 'Results\n• a\n• b\nc' && !isPlain(rich) && !isPlain({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'x' }] }] }) && isPlain({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'left', indent: 0, lineHeight: null }, content: [{ type: 'text', text: 'x' }] }] }), 'Note: the plain text of a formatted document (headings, lists); formatting kept as a document');
}
{
  // a Note as a Word file: styles, runs, lists (their own numbering), tables (merged cells), a box, a figure with its
  // numbered caption, formulas as Word equations — every part well formed
  const t = (text: string, marks?: object[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
  const p = (content: object[], attrs?: object) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content });
  const nd = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [t('Results & <discussion>')] },
      p([t('Bold', [{ type: 'bold' }]), t(' red', [{ type: 'textStyle', attrs: { color: '#cc0000', fontSize: '14pt' } }]), t('2', [{ type: 'superscript' }]), { type: 'inlineMath', attrs: { latex: 'x^2' } }], { textAlign: 'justify', lineHeight: '1.5', spaceAfter: 12, indent: 1 }),
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p([t('third')])] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2 }, content: [p([t('H')])] }] }, { type: 'tableRow', content: [{ type: 'tableCell', attrs: { rowspan: 2 }, content: [p([t('tall')])] }, { type: 'tableCell', content: [p([t('b')])] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p([t('c')])] }] }] },
      { type: 'textBox', attrs: { width: 60, align: 'center', border: '#555555', borderWidth: 1, fill: '#fff3c4' }, content: [p([t('boxed')])] },
      { type: 'figureRef', attrs: { node: 'p1', width: 80, caption: 'The spectrum.' } },
      { type: 'blockMath', attrs: { latex: String.raw`\frac{\Delta R}{R} = \sum_{i=1}^{n} x_i^2` } },
    ],
  };
  const files = unzipSync(noteDocx(nd, (n) => (n.type === 'figureRef' ? { bytes: new Uint8Array([137, 80, 78, 71]), ext: 'png', w: 300, h: 200 } : null), latexToOmml, 'Test'));
  const dx = strFromU8(files['word/document.xml']);
  const balanced = (xml: string) => {
    const stack: string[] = [];
    for (const m of xml.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
      if (m[0].startsWith('<?')) continue;
      if (m[3]) continue;
      if (!m[1]) stack.push(m[2]);
      else if (stack.pop() !== m[2]) return false;
    }
    return stack.length === 0;
  };
  const parts = Object.keys(files).filter((n) => /\.(xml|rels)$/.test(n));
  ok(parts.every((n) => balanced(strFromU8(files[n]))) && !!files['word/media/image10.png'], `Note ▸ Word: every part well formed, the figure's picture inside (${parts.length} parts)`);
  ok(
    ['w:pStyle w:val="Heading1"', 'Results &amp; &lt;discussion&gt;', 'w:jc w:val="both"', 'w:line="360"', 'w:after="240"', 'w:ind w:left="360"', 'w:color w:val="CC0000"', 'w:sz w:val="28"', 'w:vertAlign w:val="superscript"', 'w:gridSpan w:val="2"', 'w:vMerge w:val="restart"', 'w:fill="FFF3C4"', 'SEQ Figure', 'The spectrum.', '<m:oMathPara>', '<m:nary>', '<m:f>'].every((k) => dx.includes(k)) && strFromU8(files['word/numbering.xml']).includes('w:startOverride w:val="3"'),
    'Note ▸ Word: headings, alignment, spacing, indent, colours, sizes, superscript, merged cells, a filled box, a numbered caption, equations, a list starting at 3',
  );
  // placed blocks in Word: a figure with the text beside it, a box, a table — floating (tblpPr) at their side and width
  const placed = unzipSync(
    noteDocx(
      {
        type: 'doc',
        content: [
          { type: 'figureRef', attrs: { node: 'p1', width: 40, align: 'right', wrap: true, caption: 'Beside the text.' } },
          p([t('text beside the figure')]),
          { type: 'textBox', attrs: { width: 30, align: 'left', wrap: true }, content: [p([t('box')])] },
          { type: 'table', attrs: { width: 50, align: 'center' }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p([t('a')])] }] }] },
        ],
      },
      () => ({ bytes: new Uint8Array([137, 80, 78, 71]), ext: 'png', w: 300, h: 200 }),
    ),
  );
  const px = strFromU8(placed['word/document.xml']);
  ok(px.includes('w:tblpXSpec="right"') && px.includes('w:tblpXSpec="left"') && px.includes('<w:tblW w:w="2000" w:type="pct"/>') && px.includes('<w:tblW w:w="1500" w:type="pct"/>') && px.includes('<w:tblW w:w="2500" w:type="pct"/><w:jc w:val="center"/>') && balanced(px), 'Note ▸ Word: a figure and a box with the text beside them float at their side; a table at its width, centred');
  // Markdown: marks, links, lists, a table, a box as a quote, a figure's file and caption, formulas
  const md = noteMarkdown(
    {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [t('Results')] },
        p([t('A '), t('bold', [{ type: 'bold' }]), t(' x'), t('2', [{ type: 'superscript' }]), t(' '), t('here', [{ type: 'link', attrs: { href: 'https://example.org' } }]), t(' 5*3 '), { type: 'inlineMath', attrs: { latex: String.raw`\alpha` } }]),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p([t('one')]), { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [p([t('nested')])] }] }] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p([t('λ')])] }, { type: 'tableHeader', content: [p([t('R')])] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p([t('520')])] }, { type: 'tableCell', content: [p([t('0.8|x')])] }] }] },
        { type: 'textBox', content: [p([t('boxed')])] },
        { type: 'figureRef', attrs: { node: 'p', caption: 'The spectrum.' } },
        { type: 'blockMath', attrs: { latex: 'E = mc^2' } },
      ],
    },
    (_n, k) => `figures/figure-${k}.png`,
  );
  ok(
    md.startsWith('## Results\n\nA **bold** x<sup>2</sup> [here](https://example.org) 5\\*3 $\\alpha$\n\n- one\n  1. nested\n\n| λ | R |\n| --- | --- |\n| 520 | 0.8\\|x |\n\n> boxed\n\n![The spectrum.](figures/figure-1.png)\n\n*Figure 1. The spectrum.*\n\n$$\nE = mc^2\n$$'),
    `Note ▸ Markdown: headings, marks, links, nested lists, a table, a box, a figure's file and caption, formulas (${JSON.stringify(md.slice(0, 120))})`,
  );
  // LaTeX as Word equations
  const om = (l: string) => latexToOmml(l, false);
  ok(om(String.raw`\frac{a}{b}`).includes('<m:f><m:num>') && om(String.raw`\sqrt[3]{x}`).includes('<m:deg>') && om(String.raw`\int_0^1 f`).includes('<m:chr m:val="∫"/>') && om(String.raw`\hat{x}`).includes('<m:acc>') && om(String.raw`\bar{y}`).includes('<m:bar>') && om(String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`).includes('<m:mr>') && om(String.raw`\binom{n}{k}`).includes('noBar') && om('x_i^2').includes('<m:sSubSup>'), 'Note ▸ formulas: fractions, roots, integrals, accents, bars, matrices, binomials, sub- and superscripts as Word equations');
  ok(plainOf({ type: 'doc', content: [p([t('a '), { type: 'inlineMath', attrs: { latex: 'x^2' } }]), { type: 'blockMath', attrs: { latex: 'E=mc^2' } }] }) === 'a $x^2$\n$$E=mc^2$$', 'Note: the plain text of formulas (their LaTeX)');
  // MathJax's MathML: chemistry without its hidden spacers, a wrong formula as its LaTeX in red
  ok(om(String.raw`\ce{H2O}`).includes('<m:sSub>') && !om(String.raw`\ce{H2O}`).includes('>A<') && latexToMathml(String.raw`\frac{a`, false).includes('mathcolor="#cc0000"') && !latexToMathml('x', false).includes('data-'), 'Note ▸ formulas: chemistry (mhchem) as Word equations, a wrong formula shown as its LaTeX, no MathJax markers left');
  // a figure copied under its node: pasted (an image of its size) into a note, the live figure
  figureCopied('plot-a', 1004, 768);
  ok(copiedFigure(1004, 768) === 'plot-a' && copiedFigure(1003, 768) === null, 'Note: a figure just copied is known by the size of its picture');
}
{
  // the help in a node: every node a short text (a sentence or two), the whole one in Help
  const types = Object.keys(NODE_HELP) as (keyof typeof NODE_HELP)[];
  const long = types.filter((t) => !NODE_SHORT[t] || NODE_SHORT[t].length > 260);
  ok(types.length === Object.keys(NODE_SHORT).length && long.length === 0, `Help: a short text for every node, none too long (${long.join(', ')})`);
}

// ---- Working together: the project as a shared document (Yjs) ----
{
  // a project as text with its keys sorted (the document keeps the fields of a node's data in its own order)
  const canon = (v: unknown): string =>
    JSON.stringify(v, (_, x) => (typeof x === 'number' && !Number.isFinite(x) ? `#${x}` : x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
  const projText = (p: Project) => canon({ nodes: p.nodes, edges: p.edges, name: p.name ?? '' });
  // every example: into a document and back, the very same project (its nodes in their order, data, connections)
  const lost = EXAMPLES.filter((ex) => {
    const m = ex.make();
    const p = toProject(m.nodes, m.edges, m.name);
    const y = yProject(new Y.Doc());
    writeProject(y, p);
    return projText(readProject(y)) !== projText(p);
  });
  ok(lost.length === 0, `collaboration: every example into a shared document and back, unchanged (${lost.map((e) => e.name).join('; ')})`);

  // two peers: what one sends the other gets (the transport: here, the updates handed over directly)
  const sync = (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const note = (id: string, data: Record<string, unknown>, x = 0): AppNode => ({ id, type: 'note', position: { x, y: 0 }, data }) as unknown as AppNode;
  const start: Project = { app: 'graph-flow', version: PROJECT_VERSION, nodes: [note('n1', { text: 'a', a: 1 }), note('n2', { text: 'b' }, 200)], edges: [] };
  const dA = new Y.Doc();
  const dB = new Y.Doc();
  const A = new ProjectBinding(dA, start);
  const B = new ProjectBinding(dB);
  sync(dA, dB);
  ok(projText(B.state) === projText(start), 'collaboration: a peer joining gets the project');
  const n2B = B.state.nodes.find((n) => n.id === 'n2');
  // at the same time: A changes a field of n1, B another field of n1 → both kept, everywhere; n2 the same object on B
  A.local({ ...A.state, nodes: A.state.nodes.map((n) => (n.id === 'n1' ? { ...n, data: { ...n.data, a: 2 } } : n)) });
  B.local({ ...B.state, nodes: B.state.nodes.map((n) => (n.id === 'n1' ? { ...n, data: { ...n.data, text: 'B wrote' } } : n)) });
  sync(dA, dB);
  const n1 = (p: Project) => p.nodes.find((n) => n.id === 'n1')?.data as Record<string, unknown> | undefined;
  ok(n1(A.state)?.a === 2 && n1(A.state)?.text === 'B wrote' && projText(A.state) === projText(B.state), 'collaboration: two fields of one node changed at the same time — both kept, on both peers');
  ok(B.state.nodes.find((n) => n.id === 'n2') === n2B, 'collaboration: a node nobody changed stays the same object (no recomputing, no redrawing)');
  // the same field at the same time: one value, the same on both
  A.local({ ...A.state, nodes: A.state.nodes.map((n) => (n.id === 'n1' ? { ...n, data: { ...n.data, a: 10 } } : n)) });
  B.local({ ...B.state, nodes: B.state.nodes.map((n) => (n.id === 'n1' ? { ...n, data: { ...n.data, a: 20 } } : n)) });
  sync(dA, dB);
  ok((n1(A.state)?.a === 10 || n1(A.state)?.a === 20) && projText(A.state) === projText(B.state), 'collaboration: one field changed by both at once — one value, the same everywhere');
  // A removes n2 while B connects n1 → n2: the connection does not survive, the project stays whole on both
  A.local({ ...A.state, nodes: A.state.nodes.filter((n) => n.id !== 'n2') });
  B.local({ ...B.state, edges: [...B.state.edges, { id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }] });
  sync(dA, dB);
  ok(A.state.edges.length === 0 && B.state.edges.length === 0 && A.state.nodes.length === 1 && projText(A.state) === projText(B.state), 'collaboration: a node removed while another peer connects to it — no broken connection');
  // writing the project as it is sends nothing (the first write after the removal takes the broken connection out of
  // the document too; the reading had only left it out)
  let updates = 0;
  A.local({ ...A.state });
  ok(A.y.edges.size === 0, 'collaboration: the broken connection taken out of the document at the next change');
  dA.on('update', () => updates++);
  A.local({ ...A.state });
  ok(updates === 0, 'collaboration: nothing changed, nothing sent');
  // NaN and ±Infinity kept (as in the project files)
  A.local({ ...A.state, nodes: A.state.nodes.map((n) => ({ ...n, data: { ...n.data, lim: [NaN, Infinity, -Infinity] } })) });
  sync(dA, dB);
  const lim = n1(B.state)?.lim as number[] | undefined;
  ok(!!lim && Number.isNaN(lim[0]) && lim[1] === Infinity && lim[2] === -Infinity, 'collaboration: NaN and ±Infinity kept');

  // fuzz: three peers, random changes (nodes added, removed, moved, framed, brought to the front; fields set and removed;
  // connections added and removed; the name), synchronised in random pairs; at the end every peer the same project,
  // and a whole one (no connection to a missing node, no missing frame, frames before their nodes, no id twice)
  let seed = 7;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: T[]): T | undefined => a[Math.floor(rnd() * a.length)];
  const values = [1, 2.5, -3, NaN, 'x', 'longer text', [1, 2, 3], { a: 1, b: [2] }, true, null];
  const whole = (p: Project) => {
    const ids = p.nodes.map((n) => n.id);
    const seen = new Set<string>();
    return (
      new Set(ids).size === ids.length &&
      p.edges.every((e) => ids.includes(e.source) && ids.includes(e.target)) &&
      p.nodes.every((n) => {
        seen.add(n.id);
        return !n.parentId || seen.has(n.parentId);
      })
    );
  };
  let bad = '';
  for (let run = 0; run < 12 && !bad; run++) {
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    const peers = docs.map((d, k) => new ProjectBinding(d, k === 0 ? start : undefined));
    docs.forEach((d) => sync(docs[0], d));
    let made = 0;
    for (let step = 0; step < 150; step++) {
      const k = Math.floor(rnd() * 3);
      const P = peers[k];
      const s = P.state;
      const r = rnd();
      let next: Project = s;
      if (r < 0.18) {
        const frame = rnd() < 0.3;
        const parent = pick(s.nodes.filter((n) => n.type === 'frame'));
        const id = `${frame ? 'f' : 'n'}${k}-${made++}`;
        const n = { id, type: frame ? 'frame' : 'note', position: { x: rnd() * 500, y: rnd() * 500 }, data: { text: id }, ...(parent && !frame && rnd() < 0.5 ? { parentId: parent.id } : {}), ...(frame ? { width: 300, height: 200 } : {}) } as unknown as AppNode;
        next = { ...s, nodes: frame ? [n, ...s.nodes] : [...s.nodes, n] };
      } else if (r < 0.3) {
        const gone = pick(s.nodes);
        if (gone) next = { ...s, nodes: s.nodes.filter((n) => n !== gone).map((n) => (n.parentId === gone.id ? (({ parentId: _p, ...rest }) => rest as AppNode)(n) : n)), edges: s.edges.filter((e) => e.source !== gone.id && e.target !== gone.id) };
      } else if (r < 0.45) {
        const m = pick(s.nodes);
        if (m) next = { ...s, nodes: s.nodes.map((n) => (n === m ? { ...n, position: { x: rnd() * 500, y: rnd() * 500 } } : n)) };
      } else if (r < 0.65) {
        const m = pick(s.nodes);
        const key = pick(['a', 'b', 'c', 'text'])!;
        if (m) next = { ...s, nodes: s.nodes.map((n) => (n === m ? { ...n, data: { ...n.data, [key]: rnd() < 0.15 ? undefined : pick(values) } } : n)) };
      } else if (r < 0.8) {
        const [a, b] = [pick(s.nodes), pick(s.nodes)];
        if (a && b && a !== b) next = { ...s, edges: [...s.edges, { id: `e${k}-${made++}`, source: a.id, sourceHandle: 'out', target: b.id, targetHandle: pick(['in', 'in-0', 'in-1']) ?? 'in' }] };
      } else if (r < 0.9) {
        const e = pick(s.edges);
        if (e) next = { ...s, edges: s.edges.filter((q) => q !== e) };
      } else if (r < 0.96) {
        // to the front: drawn last (a frame stays before its nodes)
        const m = pick(s.nodes.filter((n) => n.type !== 'frame' && !n.parentId));
        if (m) next = { ...s, nodes: [...s.nodes.filter((n) => n !== m), m] };
      } else next = { ...s, name: `name ${k}-${step}` };
      if (next !== s) P.local(next);
      if (rnd() < 0.3) {
        const [i, j] = [Math.floor(rnd() * 3), Math.floor(rnd() * 3)];
        if (i !== j) sync(docs[i], docs[j]);
      }
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) sync(docs[i], docs[j]);
    const texts = peers.map((p) => projText(p.state));
    const fresh = docs.map((d) => projText(readProject(yProject(d))));
    if (new Set([...texts, ...fresh]).size !== 1) bad = `run ${run}: the peers differ`;
    else if (!peers.every((p) => whole(p.state))) bad = `run ${run}: a project not whole`;
  }
  ok(!bad, `collaboration: three peers, 12 × 150 random changes synchronised in random pairs — the same whole project everywhere ${bad}`);

  // as in the page: each peer shows its own copy (the canvas) and puts the others' changes into it only now and then
  // (a render later); meanwhile it changes what it shows and writes it on the base it was made on — the others'
  // changes not yet shown are never written back over, a change made here and not yet sent is never lost
  let bad2 = '';
  for (let run = 0; run < 12 && !bad2; run++) {
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    const peers = docs.map((d, k) => new ProjectBinding(d, k === 0 ? start : undefined));
    docs.forEach((d) => sync(docs[0], d));
    peers.forEach((P) => P.takeChanged());
    const view = peers.map((P) => ({ canvas: P.state, base: P.state }));
    // a render: the document as it is now merged into what is shown, against the base (only the nodes the others changed)
    const render = (k: number) => {
      const v = view[k];
      const now = peers[k].state;
      v.canvas = { ...v.canvas, nodes: mergeNodes(v.canvas.nodes, now, v.base, peers[k].takeChanged()), edges: mergeEdges(v.canvas.edges, now, v.base), ...((now.name ?? '') !== (v.base.name ?? '') ? { name: now.name } : {}) };
      v.base = now;
    };
    let made = 0;
    for (let step = 0; step < 150; step++) {
      const k = Math.floor(rnd() * 3);
      const v = view[k];
      const s = v.canvas;
      const r = rnd();
      let next: Project = s;
      if (r < 0.2) {
        const id = `n${k}-${made++}`;
        next = { ...s, nodes: [...s.nodes, note(id, { text: id }, rnd() * 500)] };
      } else if (r < 0.32) {
        const gone = pick(s.nodes);
        if (gone) next = { ...s, nodes: s.nodes.filter((n) => n !== gone), edges: s.edges.filter((e) => e.source !== gone.id && e.target !== gone.id) };
      } else if (r < 0.45) {
        const m = pick(s.nodes);
        if (m) next = { ...s, nodes: s.nodes.map((n) => (n === m ? { ...n, position: { x: rnd() * 500, y: rnd() * 500 } } : n)) };
      } else if (r < 0.7) {
        const m = pick(s.nodes);
        const key = pick(['a', 'b', 'c', 'text'])!;
        if (m) next = { ...s, nodes: s.nodes.map((n) => (n === m ? { ...n, data: { ...n.data, [key]: rnd() < 0.15 ? undefined : pick(values) } } : n)) };
      } else if (r < 0.85) {
        const [a, b] = [pick(s.nodes), pick(s.nodes)];
        if (a && b && a !== b) next = { ...s, edges: [...s.edges, { id: `e${k}-${made++}`, source: a.id, sourceHandle: 'out', target: b.id, targetHandle: 'in' }] };
      } else {
        const e = pick(s.edges);
        if (e) next = { ...s, edges: s.edges.filter((q) => q !== e) };
      }
      if (next !== s) {
        // what this peer writes: its canvas, on the base it last showed (the others' changes it has not shown yet are
        // not in it); the canvas then is what it knows of the document
        peers[k].local(next, v.base);
        v.canvas = next;
        v.base = next;
      }
      if (rnd() < 0.3) render(Math.floor(rnd() * 3));
      if (rnd() < 0.3) {
        const [i, j] = [Math.floor(rnd() * 3), Math.floor(rnd() * 3)];
        if (i !== j) sync(docs[i], docs[j]);
      }
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) sync(docs[i], docs[j]);
    [0, 1, 2].forEach(render);
    const texts = new Set([...view.map((v) => projText({ ...v.canvas, edges: v.canvas.edges.filter((e) => v.canvas.nodes.some((n) => n.id === e.source) && v.canvas.nodes.some((n) => n.id === e.target)) })), ...docs.map((d) => projText(readProject(yProject(d))))]);
    if (texts.size !== 1) bad2 = `run ${run}: what the peers show differs from the document`;
  }
  ok(!bad2, `collaboration: peers that show the others' changes late and write on what they show — no change lost or written back over ${bad2}`);

  // the transport: a host and two guests joined only to it (so the host passes their changes on), links that deliver
  // later (a queue), a long message (an imported file) cut into chunks and put back together
  const queue: (() => void)[] = [];
  const pump = () => {
    for (let n = 0; n < 100000 && queue.length; n++) queue.shift()!();
  };
  const linkPair = (a: string, b: string): [Link, Link] => {
    const side = (id: string) => ({ id, bytes: [] as ((u: Uint8Array) => void)[], close: [] as (() => void)[], other: null as null | { bytes: ((u: Uint8Array) => void)[] } });
    const [x, y2] = [side(`${a}-${b}`), side(`${b}-${a}`)];
    const mk = (s: typeof x, o: typeof x): Link => ({ id: s.id, send: (u) => queue.push(() => o.bytes.forEach((f) => f(u))), onBytes: (f) => void s.bytes.push(f), onClose: (f) => void s.close.push(f), close: () => s.close.forEach((f) => f()) });
    return [mk(x, y2), mk(y2, x)];
  };
  const [hD, g1D, g2D] = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
  const H = new ProjectBinding(hD, start);
  const G1 = new ProjectBinding(g1D);
  const G2 = new ProjectBinding(g2D);
  const [hH, g1H, g2H] = [new SyncHub(hD, 'host'), new SyncHub(g1D, 'g1'), new SyncHub(g2D, 'g2')];
  let joined = 0;
  g1H.onSynced(() => joined++);
  const [h1, g1] = linkPair('h', 'g1');
  const [h2, g2] = linkPair('h', 'g2');
  hH.add(h1);
  g1H.add(g1);
  hH.add(h2);
  g2H.add(g2);
  pump();
  ok(joined === 1 && projText(G1.state) === projText(start) && projText(G2.state) === projText(start) && hH.peers.get(h1.id)?.name === 'g1', 'collaboration: guests joining a host get the project (and their names)');
  const big = 'x'.repeat(300 * 1024);
  G1.local({ ...G1.state, nodes: [...G1.state.nodes, note('imp', { text: big })] });
  pump();
  const imp = G2.state.nodes.find((n) => n.id === 'imp');
  ok((imp?.data as { text?: string } | undefined)?.text === big && chunked(new Uint8Array(big.length), 1).length > 1, 'collaboration: a 300 kB file from one guest reaches the other through the host, in chunks');
  G2.local({ ...G2.state, nodes: G2.state.nodes.filter((n) => n.id !== 'n1') });
  pump();
  ok(!G1.state.nodes.some((n) => n.id === 'n1') && !H.state.nodes.some((n) => n.id === 'n1'), 'collaboration: a node removed by a guest is gone everywhere');
  // a connection lost (a network that dropped): both go on working apart, then a new link (a new invitation, in the
  // same session) brings them in step — the work of both kept
  h1.close();
  g1.close();
  ok(!hH.peers.has(h1.id) && !g1H.peers.has(g1.id), 'collaboration: a lost link leaves the session on both sides');
  G1.local({ ...G1.state, nodes: [...G1.state.nodes, note('offline-g1', { text: 'made while cut off' })] });
  H.local({ ...H.state, nodes: H.state.nodes.map((n) => (n.id === 'n2' ? { ...n, data: { ...n.data, text: 'host meanwhile' } } : n)) });
  pump();
  ok(!H.state.nodes.some((n) => n.id === 'offline-g1'), 'collaboration: nothing passes while the link is lost');
  const [h1b, g1b] = linkPair('h', 'g1-again');
  hH.add(h1b);
  g1H.add(g1b);
  pump();
  const n2Text = (p: Project) => (p.nodes.find((n) => n.id === 'n2')?.data as { text?: string } | undefined)?.text;
  ok(H.state.nodes.some((n) => n.id === 'offline-g1') && G2.state.nodes.some((n) => n.id === 'offline-g1') && n2Text(G1.state) === 'host meanwhile' && projText(G1.state) === projText(H.state) && projText(G2.state) === projText(H.state), 'collaboration: joined again — what both did while cut off is merged, everywhere');
  // leaving on purpose: the others are told (its closing is not a lost connection)
  g2H.close(0);
  pump();
  ok(hH.left.has(h2.id), 'collaboration: a peer that leaves says so (not shown as a lost connection)');
  // presence: a host and two guests joined only to it; a guest's mouse reaches the other through the host; only those
  // at the level shown; someone who leaves goes at once, someone not heard for a while goes too, a link gone takes
  // with it whoever was heard through it (a clock of our own: no waiting)
  {
    let clock = 0;
    const tick = () => clock;
    const [ph, pa, pb] = [new SyncHub(new Y.Doc(), 'Host'), new SyncHub(new Y.Doc(), 'Ana'), new SyncHub(new Y.Doc(), 'Bob')];
    const PH = new Presence(ph, 'Host', '#111111', tick);
    const PA = new Presence(pa, 'Ana', '#E69F00', tick);
    const PB = new Presence(pb, 'Bob', '#0072B2', tick);
    const [ha, ah] = linkPair('ph', 'pa');
    const [hb, bh] = linkPair('ph', 'pb');
    ph.add(ha);
    pa.add(ah);
    ph.add(hb);
    pb.add(bh);
    pump();
    PA.set({ cursor: { x: 10, y: 20 }, selected: ['n7'] });
    await new Promise((r) => setTimeout(r, SEND_MS + 30));
    pump();
    const ana = PB.list('').find((o) => o.name === 'Ana');
    ok(!!ana && ana.cursor?.x === 10 && ana.selected[0] === 'n7' && ana.color === '#E69F00' && PB.list().some((o) => o.name === 'Host'), 'collaboration: presence — a guest’s mouse and selection reach the other guest through the host');
    PA.set({ level: 'group-1' });
    await new Promise((r) => setTimeout(r, SEND_MS + 30));
    pump();
    ok(!PB.list('').some((o) => o.name === 'Ana') && PB.list('group-1').some((o) => o.name === 'Ana'), 'collaboration: presence — only those at the level shown');
    PA.leave();
    pump();
    ok(!PB.list().some((o) => o.name === 'Ana') && !PH.list().some((o) => o.name === 'Ana'), 'collaboration: presence — someone who leaves goes at once');
    clock += STALE_MS + 1;
    PB.prune();
    ok(PB.list().length === 0, 'collaboration: presence — someone not heard for a while is no longer shown');
    clock = 0;
    PH.set({ cursor: { x: 1, y: 1 } });
    await new Promise((r) => setTimeout(r, SEND_MS + 30));
    pump();
    const heard = PB.list().length;
    bh.close();
    ok(heard === 1 && PB.list().length === 0, 'collaboration: presence — a link gone takes with it whoever was heard through it');
    PH.destroy();
    PB.destroy();
  }
  // between computers: a long message goes compressed (a file of numbers: a fraction of its size on the network)
  {
    const [zA, zB] = [new Y.Doc(), new Y.Doc()];
    const ZA = new ProjectBinding(zA, start);
    const ZB = new ProjectBinding(zB);
    const [hza, hzb] = [new SyncHub(zA, 'a'), new SyncHub(zB, 'b')];
    const [la, lb] = linkPair('za', 'zb');
    let wire = 0;
    const counted = (l: Link): Link => ({ ...l, compress: true, send: (u) => ((wire += u.length), l.send(u)) });
    hza.add(counted(la));
    hzb.add(counted(lb));
    pump();
    const rowsZ: string[] = [];
    for (let i = 0; i < 60000; i++) rowsZ.push(`${(i * 0.001).toFixed(3)},${Math.sin(i / 100).toFixed(6)}`);
    const csvZ = rowsZ.join('\n');
    wire = 0;
    ZA.local({ ...ZA.state, nodes: [...ZA.state.nodes, note('zip', { text: csvZ })] });
    for (let k = 0; k < 400 && !ZB.state.nodes.some((n) => n.id === 'zip'); k++) {
      pump();
      await new Promise((r) => setTimeout(r, 10));
    }
    const got = (ZB.state.nodes.find((n) => n.id === 'zip')?.data as { text?: string } | undefined)?.text;
    ok(got === csvZ && csvZ.length > ZIP_MIN && wire < csvZ.length / 2, `collaboration: a long message between computers goes compressed and arrives whole (${(csvZ.length / 1e6).toFixed(2)} MB → ${(wire / 1e6).toFixed(2)} MB on the wire)`);
  }
  // the chunks in any order
  const parts = chunked(Uint8Array.from({ length: 50000 }, (_, i) => i % 251), 9);
  const jn = new Joiner();
  const back = [...parts].reverse().map((c) => jn.add(c)).filter(Boolean)[0];
  ok(!!back && back.length === 50000 && back[49999] === 49999 % 251, 'collaboration: chunks put back together in any order');
  // the codes of WebRTC: compressed and read back
  const sig = { t: 'offer' as const, sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n'.repeat(20), room: 'abc', name: 'Ana' };
  const code = encodeSignal(sig);
  const read = decodeSignal(`https://x/#join=${code}`);
  // the ways to reach a side in its code, by kind (a hidden local name apart), with no address shown
  const sdpC = ['v=0', 'a=candidate:1 1 udp 2122260223 4f2a-9b.local 54321 typ host generation 0', 'a=candidate:2 1 tcp 1518280447 4f2a-9b.local 9 typ host tcptype active', 'a=candidate:3 1 udp 1686052607 86.120.1.2 54321 typ srflx raddr 0.0.0.0 rport 0', 'a=candidate:4 1 udp 2122260223 192.168.1.5 5000 typ host'].join('\r\n');
  const ci = candidatesIn(sdpC);
  ok(ci === 'host (hidden .local name)/udp×1, host (hidden .local name)/tcp×1, srflx/udp×1, host (address)/udp×1' && !ci.includes('86.120') && !ci.includes('192.168') && candidatesIn('v=0') === 'none', `collaboration: the kinds of addresses in a code, none shown (${ci})`);
  // the synchronized start: a description without its ways (kept apart, each with its section), the start in the answer
  const offerSdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=candidate:1 1 udp 2122260223 4f2a-9b.local 54321 typ host generation 0', 'a=candidate:3 1 udp 1686052607 86.120.1.2 54321 typ srflx raddr 0.0.0.0 rport 0', 'a=ice-ufrag:abcd', 'a=mid:0', 'a=end-of-candidates', ''].join('\r\n');
  const sc = splitCandidates(offerSdp);
  ok(sc.candidates.length === 2 && sc.candidates.every((c) => c.sdpMid === '0' && c.sdpMLineIndex === 0) && sc.candidates[1].candidate?.startsWith('candidate:3 ') && !sc.sdp.includes('a=candidate') && !sc.sdp.includes('end-of-candidates') && sc.sdp.includes('a=ice-ufrag:abcd') && sc.sdp.includes('a=mid:0'), 'collaboration: the ways to reach a side kept apart from its description (each with its section), for the synchronized start');
  // the same network: the other computer's local address typed — beside each made-up name, on the same port
  const wa = withAddress(sc.candidates, ' 192.168.1.140 ');
  ok(wa.length === 3 && wa[1].candidate === 'candidate:19 1 udp 2122260223 192.168.1.140 54321 typ host generation 0' && wa[1].sdpMid === '0' && withAddress(sc.candidates, 'nonsense').length === 2 && withAddress(sc.candidates, '').length === 2, 'collaboration: a local address typed is tried beside the made-up name, on the same port');
  {
    // the guided tours: every step with a title and text; the first tour's steps see the import, the plot, the changes
    const all = TOURS.flatMap(stepsOf);
    ok(TOURS.length >= 1 && new Set(TOURS.map((t) => t.id)).size === TOURS.length && all.every((s) => s.title && s.text && s.chapterNo >= 1), 'tours: distinct ids, every step titled and written');
    const csv = parseCsv(uvVisText(), CSV_DEFAULTS).dataset;
    ok(csv.columns.length === 3 && csv.columns[0].name === 'Wavelength (nm)' && csv.columns[0].values.length === 251 && csv.columns[1].values.every((v) => v > 0 && v < 1), 'tours: the example spectrum reads as 3 columns of 251 rows, absorbances in 0 … 1');
    const imp = { id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...structuredClone(IMPORT_DEFAULTS), text: uvVisText() } } as AppNode;
    const plotData = { ...structuredClone(PLOT1D_DEFAULTS), rows: [{ label: '', style: { color: '#000000' } }] } as Plot1DData;
    const plt = { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: plotData } as AppNode;
    const edge = { id: 'e', source: 'i', sourceHandle: 'out', target: 'p', targetHandle: 'dataset' };
    const st = (nodes: AppNode[], start = nodes, downloads: string[] = []): TourState => ({ nodes, edges: nodes.length > 1 ? [edge] : [], start, downloads });
    const steps = stepsOf(TOURS.find((t) => t.id === 'first-graph')!);
    const recolored = { ...plt, data: { ...plotData, style: { ...plotData.style, color: '#c0392b' } } } as AppNode;
    const titled = { ...plt, data: { ...plotData, axes: { sides: { left: { title: 'A' } } } } } as unknown as AppNode;
    ok(
      !importWithData(st([])) && !!importWithData(st([imp])) && steps[0].done!(st([imp])) && !steps[2].done!(st([imp])) && steps[2].done!(st([imp, plt])) && !!plotOfImport(st([imp, plt])),
      'tours: the first steps are done by an Import with data, then a Plot connected to it',
    );
    ok(!steps[3].done!(st([imp, plt])) && steps[3].done!(st([imp, { ...plt, selected: true } as AppNode])), 'tours: the plot clicked (selected) opens its options');
    ok(!steps[4].done!(st([imp, plt])) && steps[4].done!(st([imp, recolored], [imp, plt])) && !steps[5].done!(st([imp, recolored], [imp, plt])) && steps[5].done!(st([imp, titled], [imp, plt])), 'tours: a curve restyled, an axis titled, each against how its step found the Plot');
    ok(!figureSaved(st([imp, plt], undefined, ['data.csv'])) && figureSaved(st([imp, plt], undefined, ['figure.svg'])), 'tours: a figure saved (svg, png, pdf, tiff), not any file');
  }
  {
    // Batch: the steps (Pick points: the maximum) run on three files, their names read by a pattern, ordered by it
    const peakAt = (c: number) => ['x\ty', ...Array.from({ length: 101 }, (_, i) => `${i}\t${Math.exp(-(((i - c) / 8) ** 2)).toFixed(6)}`)].join('\n');
    const imp = { id: 'files', type: 'import', position: { x: 0, y: 0 }, data: { ...structuredClone(IMPORT_DEFAULTS), text: '', fileName: '3 files', sheets: [{ name: 'sample_40C', text: peakAt(70), excel: true }, { name: 'sample_20C', text: peakAt(30), excel: true }, { name: 'sample_30C', text: peakAt(50), excel: true }] } } as AppNode;
    const inner: AppNode[] = [
      { id: GROUP_IN, type: 'groupin', position: { x: 0, y: 0 }, data: {} },
      { id: 'pk', type: 'pick', position: { x: 0, y: 0 }, data: { ...structuredClone(PICK_DEFAULTS), rules: [{ kind: 'max', value: '' }] } },
      { id: GROUP_OUT, type: 'groupout', position: { x: 0, y: 0 }, data: {} },
    ] as AppNode[];
    const innerE = [
      { id: 'a', source: GROUP_IN, sourceHandle: 'in-0', target: 'pk', targetHandle: 'in' },
      { id: 'b', source: 'pk', sourceHandle: 'out', target: GROUP_OUT, targetHandle: 'out-0' },
    ];
    const batch = { id: 'b1', type: 'subgraph', position: { x: 0, y: 0 }, data: { name: 'Batch', nodes: inner, edges: innerE, inputs: [{ id: 'in-0', label: 'files', type: 'dataset' }], outputs: [{ id: 'out-0', label: 'peak', type: 'dataset' }], batch: { pattern: 'sample_{T}C', order: 'value' } } } as AppNode;
    const g = { nodes: [imp, batch], edges: [{ id: 'f', source: 'files', sourceHandle: 'book', target: 'b1', targetHandle: 'in-0' }] };
    const cache = newCache();
    const res = evaluateGraph(g.nodes, g.edges, cache);
    const r = res.get('b1')!;
    const t = r.outputs.table?.t === 'dataset' ? r.outputs.table.v : undefined;
    const col = (name: string) => t?.columns.find((c) => c.name === name);
    ok(!!t && col('File')?.text?.join(' ') === 'sample_20C sample_30C sample_40C' && Array.from(col('T')!.values).join(' ') === '20 30 40' && Array.from(col('x')?.values ?? []).join(' ') === '30 50 70', `Batch: a row per file, in the order of the value its name gives, the maximum of each (${t?.columns.map((c) => c.name).join(', ')}; ${r.errors.join(' ')} ${r.warnings.join(' ')})`);
    const sh = r.outputs.sheets?.t === 'workbook' ? r.outputs.sheets.v : undefined;
    const st = r.outputs.stacked?.t === 'dataset' ? r.outputs.stacked.v : undefined;
    ok(sh?.sheets.length === 3 && sh.sheets[0].name === 'sample_20C' && st?.columns[0].name === 'File' && st.columns[0].values.length === 3 && res.get('b1/pk')?.outputs.out?.t === 'dataset', 'Batch: a sheet per file, every row with its file, the steps shown on the first file');
    // every result kept on its own port: the peak (a row) a row per file; the smoothed curve (101 rows) every file's rows
    {
      const sm2 = { id: 'sm', type: 'smooth', position: { x: 0, y: 0 }, data: structuredClone(SMOOTH_DEFAULTS) } as AppNode;
      const two = { ...batch, data: { ...batch.data, nodes: [...inner, sm2], edges: [...innerE, { id: 'c', source: GROUP_IN, sourceHandle: 'in-0', target: 'sm', targetHandle: 'in' }, { id: 'd', source: 'sm', sourceHandle: 'out', target: GROUP_OUT, targetHandle: 'out-1' }], outputs: [...(batch.data as { outputs: object[] }).outputs, { id: 'out-1', label: 'smoothed', type: 'dataset' }] } } as AppNode;
      const r2 = evaluateGraph([imp, two], g.edges).get('b1')!;
      const k0 = r2.outputs['k-out-0']?.t === 'dataset' ? r2.outputs['k-out-0'].v : undefined;
      const k1 = r2.outputs['k-out-1']?.t === 'dataset' ? r2.outputs['k-out-1'].v : undefined;
      ok(k0?.name === 'peak' && k0.columns[0].values.length === 3 && Array.from(k0.columns.find((c) => c.name === 'x')?.values ?? []).join(' ') === '30 50 70' && !k0.columns.some((c) => c.name === 'y' && c.values.length > 3) && k1?.name === 'smoothed' && k1.columns[0].name === 'File' && k1.columns[0].values.length === 303 && sourcePort(two, 'k-out-1') === 'dataset', `Batch: each result kept on a port of its own (${k0?.columns.map((c) => c.name).join(', ')} · ${k1?.columns.length} columns, ${k1?.columns[0].values.length} rows)`);
      // side by side: one X (the same in every file), a Y per file named after it; the kept results named by hand (a
      // name met twice numbered), the auto names back when cleared
      const side = { ...two, data: { ...(two.data as GroupData), batch: { ...(two.data as GroupData).batch, long: 'side' as const }, outputs: (two.data as GroupData).outputs.map((p, k) => ({ ...p, name: k === 0 ? 'Maximum' : 'Curves' })) } } as AppNode;
      const r3 = evaluateGraph([imp, side], g.edges).get('b1')!;
      const s1 = r3.outputs['k-out-1']?.t === 'dataset' ? r3.outputs['k-out-1'].v : undefined;
      const s0 = r3.outputs['k-out-0']?.t === 'dataset' ? r3.outputs['k-out-0'].v : undefined;
      const all = r3.outputs.stacked?.t === 'dataset' ? r3.outputs.stacked.v : undefined;
      const sideOk = s1?.name === 'Curves' && s1.columns.filter((c) => c.role === 'x' || c.role === 'y').map((c) => `${c.name}:${c.role}`).join(',') === 'x:x,y (smoothed) (sample_20C):y,y (smoothed) (sample_30C):y,y (smoothed) (sample_40C):y' && s1.columns[0].values.length === 101 && s0?.name === 'Maximum' && s0.columns[0].values.length === 3 && all?.columns[0].name === 'File' && all.columns[0].values.length === 3;
      // (an X that differs: every file's X before its columns)
      const sb = sideBySide([{ name: 'a', ds: { name: 'a', columns: [{ ...column('t', Float64Array.from([0, 1])), role: 'x' }, { ...column('v', Float64Array.from([5, 6])), role: 'y' }] } }, { name: 'b', ds: { name: 'b', columns: [{ ...column('t', Float64Array.from([0, 2])), role: 'x' }, { ...column('v', Float64Array.from([7, 8])), role: 'y' }] } }]);
      const names = portNames([{ id: '1', label: 'Smooth' }, { id: '2', label: 'Smooth' }, { id: '3', label: 'Fit', name: 'Peaks' }, { id: '4', label: 'Fit', name: '  ' }]);
      // two results kept with the same name made (two Split into columns): each its own data (they were gathered by
      // name, so the second port gave the first one's)
      const mn = { id: 'mn', type: 'pick', position: { x: 0, y: 0 }, data: { ...structuredClone(PICK_DEFAULTS), rules: [{ kind: 'min', value: '' }] } } as AppNode;
      const twin = { ...batch, data: { ...(batch.data as GroupData), nodes: [...inner, mn], edges: [...innerE, { id: 'm1', source: GROUP_IN, sourceHandle: 'in-0', target: 'mn', targetHandle: 'in' }, { id: 'm2', source: 'mn', sourceHandle: 'out', target: GROUP_OUT, targetHandle: 'out-1' }], outputs: [{ id: 'out-0', label: 'Pick points', type: 'dataset' }, { id: 'out-1', label: 'Pick points', type: 'dataset' }] } } as AppNode;
      const rt = evaluateGraph([imp, twin], g.edges).get('b1')!;
      const xs = (h: string) => (rt.outputs[h]?.t === 'dataset' ? Array.from((rt.outputs[h].v as { columns: { name: string; values: Float64Array }[] }).columns.find((c) => c.name === 'x')?.values ?? []).join(' ') : '');
      ok(xs('k-out-0') === '30 50 70' && xs('k-out-1') !== xs('k-out-0') && xs('k-out-1') !== '', `Batch: two results kept with the same name, each its own data (max ${xs('k-out-0')}, min ${xs('k-out-1')})`);
      ok(sideOk && sb?.columns.map((c) => `${c.name}:${c.role}`).join(',') === 't (a):x,v (a):y,t (b):x,v (b):y' && names.join('|') === 'Smooth|Smooth (2)|Peaks|Fit', `Batch: long tables side by side (${s1?.columns.map((c) => c.name).join(', ')}; one-row tables still a row per file); an X that differs before each file; kept results named by hand (${names.join(', ')})`);
    }
    // the same files again: nothing computed again (the cache of every file kept)
    const again = evaluateGraph(g.nodes, g.edges, cache);
    ok(again.get('b1')!.rev === r.rev, 'Batch: the same files, the same result (not computed again)');
    ok(typeof patternOf('a{b') === 'string' && readName('run_7_x', patternOf('run_{n}_{k:text}') as Exclude<ReturnType<typeof patternOf>, string>)?.join('|') === '7|x', 'Batch: a pattern reads numbers and words, a wrong one is said');
    // a group made a batch: its first input the files, its last step kept when nothing left the group
    const sm = { id: 's', type: 'smooth', position: { x: 0, y: 0 }, data: structuredClone(SMOOTH_DEFAULTS) } as AppNode;
    const made = makeGroup([imp, sm], [{ id: 'e', source: 'files', sourceHandle: 'out', target: 's', targetHandle: 'in' }], ['s'], () => 'x', () => 'dataset')!;
    const asB = asBatch(made.nodes, made.edges, made.groupId, () => 'smoothed', (n, h) => sourcePort(n, h));
    const bd = asB.nodes.find((n) => n.id === made.groupId)!.data as GroupData;
    ok(!!bd.batch && bd.inputs[0].label === 'files' && bd.outputs.map((p) => p.label).join() === 'smoothed' && bd.edges.some((e) => e.target === GROUP_OUT && e.source === 's'), 'Batch: made from a group, it keeps what its last step gives');
    // the file the steps are shown on: chosen (the third in the order); every file listed with what its name says
    const shownThird = evaluateGraph([imp, { ...batch, data: { ...(batch.data as GroupData), batch: { pattern: 'sample_{T}C', order: 'value', show: 2 } } } as AppNode], g.edges);
    const pk3 = shownThird.get('b1/pk')?.outputs.out;
    const bl = shownThird.get('b1')!.view.batch;
    ok(pk3?.t === 'dataset' && pk3.v.columns.find((c) => c.name === 'x')?.values[0] === 70 && bl?.shown === 2 && bl.list?.map((f) => f.read).join('|') === 'T = 20|T = 30|T = 40', `Batch: the steps shown on the file chosen (the third: its peak at 70); the files with what their names say (${bl?.list?.map((f) => f.read).join(', ')})`);
    // a file with its own settings: Pick points takes the point at X = 40 only for sample_30C (the others: the maximum);
    // the table says which files have their own; tidied, no file nor step without any
    const ownSpec = { pattern: 'sample_{T}C', order: 'value' as const, own: { sample_30C: { pk: { rules: [{ kind: 'x', value: '40', which: 'all' }] } } } };
    const ownRes = evaluateGraph([imp, { ...batch, data: { ...(batch.data as GroupData), batch: ownSpec } } as AppNode], g.edges).get('b1')!;
    const ot = ownRes.outputs.table?.t === 'dataset' ? ownRes.outputs.table.v : undefined;
    const oc = (name: string) => ot?.columns.find((c) => c.name === name);
    ok(Array.from(oc('x')?.values ?? []).join(' ') === '30 40 70' && oc('Own settings')?.text?.join('|') === '|Pick points|' && ownRes.view.batch?.list?.[1].own?.join() === 'Pick points', `Batch: a file with its own settings of a step (sample_30C read at X = 40; the others their maximum: ${Array.from(oc('x')?.values ?? []).join(', ')})`);
    // a step skipped for one file: what reaches it goes on (a table to a table: here the curve itself, not its maximum),
    // the table says so; a step whose changes go to the file shown (chosen, or with own settings of some file)
    const skipRes = evaluateGraph([imp, { ...batch, data: { ...(batch.data as GroupData), batch: { pattern: 'sample_{T}C', order: 'value' as const, skip: { sample_30C: ['pk'] } } } } as AppNode], g.edges).get('b1')!;
    const sk = skipRes.outputs.table?.t === 'dataset' ? skipRes.outputs.table.v : undefined;
    const skc = (name: string) => sk?.columns.find((c) => c.name === name);
    const skSheets = skipRes.outputs.sheets?.t === 'workbook' ? skipRes.outputs.sheets.v.sheets : [];
    const flat = skipSteps(inner, innerE, ['pk']);
    ok(skc('Own settings')?.text?.join('|') === '|Pick points skipped|' && skSheets[1]?.columns[0].values.length === 101 && skSheets[0]?.columns[0].values.length === 1 && flat.nodes.find((q) => q.id === 'pk')?.type === 'reroute' && flat.edges.length === 2 && eachSteps({ each: ['a'], own: { f: { b: { k: 1 } } } }).size === 2, `Batch: a step skipped for one file (its data passed on: ${skSheets[1]?.columns[0].values.length} rows; the others their maximum), said in the table; the steps whose changes are for one file`);
    ok(tidyOwn({ a: { s: {} }, b: {} }) === undefined && JSON.stringify(tidyOwn({ a: { s: { k: 1 }, t: {} } })) === '{"a":{"s":{"k":1}}}' && (withOwn([{ id: 's', data: { k: 0, m: 2 } }], { s: { k: 1 } })[0].data as { k: number; m: number }).m === 2, 'Batch: own settings tidied (no empty step or file), laid over the common ones (the others kept)');
    // a pattern guessed from the names: the numbers that change become {V}, those that do not stay
    const gp1 = guessPattern(['PL_300K_run1', 'PL_310K_run1', 'PL_320K_run1']);
    const gp2 = guessPattern(['sample_25C_2h', 'sample_30C_4h']);
    ok(gp1 === 'PL_{V}K_run1' && gp2 === 'sample_{V1}C_{V2}h' && guessPattern(['a_1', 'b_x']) === null && guessPattern(['x1', 'x1']) === null, `Batch: a pattern guessed from the names (${gp1}; ${gp2})`);
    // a Batch from the Nodes panel: no steps, nothing kept — its files counted, nothing else said wrong
    const eb = { id: 'b2', type: 'subgraph', position: { x: 0, y: 0 }, data: emptyBatch() } as AppNode;
    const er = evaluateGraph([imp, eb], [{ id: 'f2', source: 'files', sourceHandle: 'book', target: 'b2', targetHandle: 'in-0' }]).get('b2')!;
    ok(er.view.batch?.files === 3 && !er.errors.length && (eb.data as GroupData).inputs[0].label === 'files' && (eb.data as GroupData).nodes.length === 2, 'Batch: an empty one from the Nodes panel — its files counted, no steps, nothing kept yet');
    // over columns: one table (x, then R at three thicknesses with the error of one), the same steps on every column
    // chosen, each with the X chosen; its names read by a pattern; X on the left of each (X, Y pairs); the row number
    const rows = Array.from({ length: 101 }, (_, i) => i);
    const g3 = (c: number) => rows.map((i) => Math.exp(-(((i - c) / 8) ** 2)).toFixed(6));
    const tsv = [['t', 'x', 'R · d = 150', 'dR', 'R · d = 200', 'R · d = 250'].join('\t'), ...rows.map((i) => [i * 2, i, g3(30)[i], '0.01', g3(50)[i], g3(70)[i]].join('\t'))].join('\n');
    const one = { id: 'tbl', type: 'book', position: { x: 0, y: 0 }, data: { ...structuredClone(WORKBOOK_DEFAULTS), sheets: [{ name: 'S', text: tsv, edits: { cols: { 0: { role: 'none' }, 1: { role: 'x' }, 3: { role: 'yerr' } } } }] } } as AppNode;
    const overCols = (b: object) => {
      const bb = { ...batch, data: { ...(batch.data as GroupData), batch: { over: 'columns', ...b } } } as AppNode;
      return evaluateGraph([one, bb], [{ id: 'c', source: 'tbl', sourceHandle: 'out', target: 'b1', targetHandle: 'in-0' }]);
    };
    const oc1 = overCols({ pattern: 'R · d = {d}' });
    const t1 = oc1.get('b1')!.outputs.table;
    const ct = (t: typeof t1, name: string) => (t?.t === 'dataset' ? t.v.columns.find((c) => c.name === name) : undefined);
    const inner1 = oc1.get('b1/pk')?.outputs.out;
    ok(Array.from(ct(t1, 'x')?.values ?? []).join(' ') === '30 50 70' && Array.from(ct(t1, 'd')?.values ?? []).join(' ') === '150 200 250' && oc1.get('b1')!.view.batch?.over === 'columns' && oc1.get('b1')!.view.batch?.cols?.length === 6, `Batch over columns: every Y column a run (its maximum at 30, 50, 70), the thickness read from the names (${Array.from(ct(t1, 'd')?.values ?? []).join(', ')}; ${oc1.get('b1')!.errors.join(' ')})`);
    const oc2 = overCols({ cols: 'C, E', x: 't' });
    const t2b = oc2.get('b1')!.outputs.table;
    ok(Array.from(ct(t2b, 't')?.values ?? []).join(' ') === '60 100' && inner1?.t === 'dataset', `Batch over columns: the columns listed (C, E), with another X (t = 2 x: maxima at 60, 100 — ${Array.from(ct(t2b, 't')?.values ?? []).join(', ')}; ${oc2.get('b1')!.errors.join(' ')})`);
    // Rename sheets: a find removed, a pattern read and a template written, typed names first, the order by value
    {
      const bk = { name: 'b', sheets: ['C-V 20-400K: Append10', 'C-V 20-400K: Append2', 'C-V 20-400K: Data', 'other'].map((name) => ({ name, columns: [column('x', [1])] })) };
      const r1 = renameSheets(bk, { find: 'C-V 20-400K: ' });
      const r2 = renameSheets(bk, { pattern: 'C-V 20-400K: Append{n}', template: '{n} K', order: 'value', names: { other: 'Ref' }, drop: ['C-V 20-400K: Data'] });
      const r3 = renameSheets({ name: 'b', sheets: [{ name: 'a1', columns: [] }, { name: 'a2', columns: [] }] }, { find: 'a(\\d)', replace: 'S', regex: true });
      ok(r1.book.sheets.map((q) => q.name).join('|') === 'Append10|Append2|Data|other' && r2.book.sheets.map((q) => q.name).join('|') === '2 K|10 K|Ref' && r2.warnings.length === 1 && r3.book.sheets.map((q) => q.name).join('|') === 'S|S (2)', `Rename sheets: found and replaced, read by a pattern and written, typed, by value, left out, names met twice numbered (${r2.book.sheets.map((q) => q.name).join(', ')}; ${r3.book.sheets.map((q) => q.name).join(', ')})`);
    }
    // a Plot kept from every column: the batch's figures, a panel each in a Merge (named after its column)
    {
      const plt = { id: 'pl', type: 'plot1d', position: { x: 0, y: 0 }, data: structuredClone(PLOT1D_DEFAULTS) } as AppNode;
      const fb = { ...batch, data: { ...(batch.data as GroupData), nodes: [...inner, plt], edges: [{ id: 'a', source: GROUP_IN, sourceHandle: 'in-0', target: 'pl', targetHandle: 'series' }, { id: 'b', source: 'pl', sourceHandle: 'figure', target: GROUP_OUT, targetHandle: 'out-0' }], outputs: [{ id: 'out-0', label: 'plot', type: 'figure' }], batch: { over: 'columns' } } } as AppNode;
      const mg = { id: 'mg', type: 'canvas', position: { x: 0, y: 0 }, data: structuredClone(CANVAS_DEFAULTS) } as AppNode;
      const fr = evaluateGraph([one, fb, mg], [{ id: 'c', source: 'tbl', sourceHandle: 'out', target: 'b1', targetHandle: 'in-0' }, { id: 'm', source: 'b1', sourceHandle: 'figures', target: 'mg', targetHandle: 'figures' }]);
      const figs = fr.get('b1')!.outputs.figures;
      const panels = fr.get('mg')!.view.panels ?? [];
      // the names in its texts filled for every column ({column}); an index left alone; Select figures: one, some, all
      const fb2 = { ...fb, data: { ...(fb.data as GroupData), nodes: (fb.data as GroupData).nodes.map((q) => (q.id === 'pl' ? ({ ...q, data: { ...(q.data as object), label: '{column} at C_{OX}' } } as AppNode) : q)) } } as AppNode;
      const sfOf = (d: object) => ({ id: 'sf', type: 'selectfig', position: { x: 0, y: 0 }, data: d }) as AppNode;
      const named = evaluateGraph([one, fb2, sfOf({ take: 'some', some: '1, 3' })], [{ id: 'c', source: 'tbl', sourceHandle: 'out', target: 'b1', targetHandle: 'in-0' }, { id: 's', source: 'b1', sourceHandle: 'figures', target: 'sf', targetHandle: 'figures' }]);
      const nf = named.get('b1')!.outputs.figures;
      const some = named.get('sf')!.outputs.figure;
      ok(nf?.t === 'figures' && JSON.stringify(nf.v[1].axes[0].curves.map((c) => c.label)).includes('R · d = 200 at C_{OX}') && some?.t === 'figures' && some.v.map((f) => f.panelName).join('|') === 'R · d = 150|R · d = 250' && fillNames({ a: 'x {T} {name} {U} y^{T}' }, { T: '300', name: 'S1' }).a === 'x 300 S1 {U} y^{T}', `Batch: {column} filled in every figure's texts (C_{OX} left alone); Select figures: some by number (${some?.t === 'figures' ? some.v.map((f) => f.panelName).join(', ') : some?.t})`);
      const onePick = evaluateGraph([one, fb, sfOf({ take: 'one', one: 'b1#R · d = 200' })], [{ id: 'c', source: 'tbl', sourceHandle: 'out', target: 'b1', targetHandle: 'in-0' }, { id: 's', source: 'b1', sourceHandle: 'figures', target: 'sf', targetHandle: 'figures' }]).get('sf')!;
      ok(onePick.outputs.figure?.t === 'figure' && onePick.outputs.figure.v.panelName === 'R · d = 200' && onePick.view.figList?.filter((q) => q.on).length === 1 && sourcePort(sfOf({}), 'figure') === 'figure', 'Select figures: one taken, a figure of its own');
      ok(figs?.t === 'figures' && figs.v.length === 3 && sourcePort(fb, 'figures') === 'figure' && panels.length === 3 && panels[0].name === 'R · d = 150' && new Set(panels.map((q) => q.key)).size === 3 && new Set((fr.get('mg')!.view.figure?.axes ?? []).map((q) => JSON.stringify(q.style.pos))).size === 3, `Batch: a Plot kept from every column, its figures a panel each in a Merge (${panels.map((q) => q.name).join(', ')}; ${fr.get('b1')!.errors.join(' ')} ${fr.get('mg')!.errors.join(' ')})`);
    }
    const runsOf = columnRuns({ name: 'p', columns: [{ ...column('x1', [1, 2]), role: 'x' }, { ...column('a', [5, 6]), role: 'y' }, { ...column('x2', [3, 4]), role: 'x' }, { ...column('b', [7, 8]), role: 'y' }, { ...column('db', [1, 1]), role: 'yerr' }] }, { xFrom: 'left' });
    const rowRuns = columnRuns({ name: 'p', columns: [{ ...column('a', [5, 6, 7]), role: 'y' }, { ...column('b', [1, 2, 3]), role: 'y' }] }, { xFrom: 'row', cols: 'a, b' });
    ok(typeof runsOf !== 'string' && runsOf.map((d) => d.columns.map((c) => c.name).join('+')).join(' | ') === 'x1+a | x2+b+db' && typeof rowRuns !== 'string' && rowRuns[1].columns[0].name === 'Row' && Array.from(rowRuns[1].columns[0].values).join() === '1,2,3' && columnRuns({ name: 'p', columns: [] }, { cols: 'Z' }) === 'Columns: not found: Z.', 'Batch over columns: the X on the left of each (pairs; the ±Y with its column), the row number, a column not found said');
  }
  {
    // the tutorial done by Show me alone (the example file by its button): every step done, no node in error
    const how = TOURS.find((t) => t.id === 'how-it-works')!;
    let g: { nodes: AppNode[]; edges: Edge[] } = { nodes: [], edges: [] };
    const stateOf = (gr: { nodes: AppNode[]; edges: Edge[] }, start = gr.nodes): TourState => ({ nodes: gr.nodes, edges: gr.edges, start, downloads: [] });
    const notDone: string[] = [];
    stepsOf(how).forEach((st, k) => {
      const before = stateOf(g);
      st.action?.run({ importText: (name: string, text: string) => (g = { ...g, nodes: [...g.nodes, { id: `how-imp`, type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, fileName: name, text, textId: 'how' } } as AppNode] }) } as never, before);
      g = doStep(st, g, before, (type) => `how-${k}-${type}`);
      if (st.done && !st.done(stateOf(g, before.nodes))) notDone.push(st.title);
    });
    const res = evaluateGraph(g.nodes, g.edges);
    const errs = g.nodes.flatMap((n) => (res.get(n.id)?.errors ?? []).map((e) => `${n.type}: ${e}`));
    const sm = g.nodes.find((n) => n.type === 'smooth');
    ok(TOURS[0].id === 'how-it-works' && notDone.length === 0 && errs.length === 0 && !!sm && (sm.data as { points: number }).points === 31 && res.get(sm.id)?.outputs.out?.t === 'dataset', `tours: the tutorial first, done step by step by Show me (a Smooth connected, its window 31)${notDone.length ? ` (not done: ${notDone.join(', ')})` : ''}${errs.length ? ` (${errs.join('; ')})` : ''}`);
  }
  {
    // tour 2 done by Show me alone: every step done, no node in error, the data as the steps say
    const t2 = TOURS.find((t) => t.id === 'prepare-data')!;
    let g = t2.project!();
    const stateOf = (gr: { nodes: AppNode[]; edges: Edge[] }, start = gr.nodes): TourState => {
      const res = evaluateGraph(gr.nodes, gr.edges);
      return { nodes: gr.nodes, edges: gr.edges, start, downloads: [], value: (id, h = 'out') => res.get(id)?.outputs[h] };
    };
    const notDone: string[] = [];
    stepsOf(t2).forEach((st, k) => {
      const before = stateOf(g);
      let framed: string[] = [];
      g = doStep(st, g, before, (type) => `t2-${k}-${type}`, { frame: (ids) => (framed = ids) });
      if (framed.length) g = { ...g, nodes: groupNodes(g.nodes, framed, 'Cleaning', '#8a93a6').nodes };
      if (st.done && !st.done(stateOf(g, before.nodes))) notDone.push(st.title);
    });
    ok(notDone.length === 0, `tours: tour 2 done step by step by Show me${notDone.length ? ` (not done: ${notDone.join(', ')})` : ''}`);
    const res = evaluateGraph(g.nodes, g.edges);
    const errs = g.nodes.flatMap((n) => (res.get(n.id)?.errors ?? []).map((e) => `${n.type}: ${e}`));
    ok(errs.length === 0, `tours: tour 2 leaves no node in error${errs.length ? ` (${errs.join('; ')})` : ''}`);
    const out = (type: string, h = 'out') => {
      const n = g.nodes.find((q) => q.type === type);
      const v = n && res.get(n.id)?.outputs[h];
      return v?.t === 'dataset' ? v.v : undefined;
    };
    const cleaned = out('clean');
    const sig = cleaned?.columns[1].values ?? new Float64Array();
    ok(!!cleaned && cleaned.columns[0].values.length === 123 && [...sig].every(Number.isFinite) && Math.max(...sig) < 70, 'tours: tour 2 — Clean data fills the gaps and replaces the spike, every row kept');
    const fil = out('filterrows');
    ok(fil?.columns[0].values.length === 114, 'tours: tour 2 — the first 3 s of every run left out (3 × 38 rows)');
    const cols = out('columns');
    ok(!!cols && cols.columns.map((c) => c.name).join('|') === 'Time (s)|Run 1|Run 2|Run 3' && cols.columns[1].values.length === 38, `tours: tour 2 — the runs side by side, named (${cols?.columns.map((c) => c.name).join(', ')})`);
    const tr = out('translate');
    const run1 = tr?.columns[1].values;
    ok(!!run1 && Math.abs(run1[0] - 50 * (1 - Math.exp(-3 / 8))) < 1 && Number.isNaN(run1[17]) === false, 'tours: tour 2 — the offset taken away (run 1 starts near the model)');
    const comb = out('combine');
    ok(!!comb && comb.columns.map((c) => c.name).join('|') === 'Time (s)|Run 2|Model (mV)' && comb.columns.every((c) => c.values.length === 38), `tours: tour 2 — Time, Run 2 and the model side by side (${comb?.columns.map((c) => `${c.name}:${c.values.length}`).join(', ')})`);
    const ax = out('autoextract');
    ok(!!ax && ax.columns.length === 4 && ax.columns[0].values.length === 6, `tours: tour 2 — both days of the calibration in one table (${ax?.columns.map((c) => c.name).join(', ')})`);
  }
  ok(darkShade('#14b8a6') === '#2dd4bf' && darkShade('#7B5BD6') === '#a590f3' && darkShade('#000000') === '#4d4d4d' && loadColors().accent === 'same' && SWATCHES.every((s) => /^#[0-9a-f]{6}$/.test(s.light) && /^#[0-9a-f]{6}$/.test(s.dark)), 'interface colours: the dark shade of a listed colour is its own, of another one lighter; the accent follows the selection');
  ok(isAddress('192.168.1.132') && isAddress('fe80::1') && !isAddress('192.168.1') && !isAddress('300.1.1.1') && !isAddress('abc'), 'collaboration: an address typed is IPv4 or IPv6');
  const ans = decodeSignal(encodeSignal({ t: 'answer', sdp: 'v=0', room: 'r', name: 'B', at: 1792000040000, clock: 1792000000000 }));
  ok(typeof ans !== 'string' && ans.at === 1792000040000 && ans.clock === 1792000000000, 'collaboration: the answer carries when both sides start');
  ok(typeof read !== 'string' && read.sdp === sig.sdp && read.name === 'Ana' && /^[A-Za-z0-9_-]+$/.test(code) && typeof decodeSignal('garbage') === 'string', 'collaboration: an invitation code (also inside a link) read back; anything else refused');
}

// ---- Image analysis: the algorithms against scikit-image / scipy ----
checkImage(ok);
checkStat2(ok);
checkStat3(ok);
checkSigpack(ok);

// ---- Phase diagram: against closed forms ----
checkPhase(ok);

// ---- Phase digitizer: the frame, the splines, the regions they close, the lever rule ----
{
  const frame = [
    { u: 100, v: 500 },
    { u: 500, v: 500 },
    { u: 500, v: 100 },
    { u: 100, v: 100 },
  ];
  const s2 = sampleSpline([{ u: 100, v: 300 }, { u: 500, v: 300 }]);
  const s3 = sampleSpline([{ u: 100, v: 200 }, { u: 300, v: 300 }, { u: 500, v: 200 }]);
  const through = [{ u: 100, v: 200 }, { u: 300, v: 300 }, { u: 500, v: 200 }].every((p) => s3.some((q) => near(q.u, p.u, 1e-9) && near(q.v, p.v, 1e-9)));
  ok(s2.length === 2 && s3.length > 40 && through && sampleSpline([{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 2, v: 0 }], false).length === 3, 'Phase digitizer: 2 points a straight line, more a curve through every point (or straight pieces)');
  // a sharp turn: a corner (the curve straight into it and out of it, never past it); a gentle one smooth; a corner
  // marked, or made smooth
  {
    const vee = [{ u: 0, v: 0 }, { u: 100, v: 10 }, { u: 0, v: 20 }];
    const cv = sampleSpline(vee, true, { corner: boundaryCorners({ points: vee }) });
    const arc = [{ u: 0, v: 0 }, { u: 50, v: 10 }, { u: 100, v: 0 }];
    const ca = sampleSpline(arc, true, { corner: boundaryCorners({ points: arc }) });
    const hump = Math.min(...ca.map((p) => p.v));
    ok(
      boundaryCorners({ points: vee }).join() === 'false,true,false' && Math.max(...cv.map((p) => p.u)) <= 100 + 1e-9 && boundaryCorners({ points: arc }).join() === 'false,false,false' && Math.max(...ca.map((p) => p.v)) <= 10 + 1e-9 && hump >= -1e-9 && boundaryCorners({ points: arc, corners: [1] })[1] && !boundaryCorners({ points: vee, rounds: [1] })[1],
      'Phase digitizer: a sharp turn a corner (no swing past it), a gentle one smooth (never out of its points), marked by hand',
    );
  }
  // a closed boundary inside a region: an island (one face more); the ends of the boundaries on the frame follow it
  {
    const box = [{ u: 100, v: 500 }, { u: 500, v: 500 }, { u: 500, v: 100 }, { u: 100, v: 100 }];
    const island = { id: 'i', name: 'island', color: '#000000', closed: true, points: [{ u: 200, v: 200 }, { u: 300, v: 200 }, { u: 300, v: 300 }, { u: 200, v: 300 }] };
    const fi = phaseFaces(box, [island]);
    const across = { id: 'a', name: 'across', color: '#000000', points: [{ u: 100, v: 300 }, { u: 500, v: 250 }] };
    const moved = [{ u: 120, v: 500 }, { u: 500, v: 520 }, { u: 500, v: 100 }, { u: 100, v: 100 }];
    const [f] = followFrame(box, moved, [across]);
    ok(
      fi.length === 2 && near(fi[1].area, 10000, 1e-6) && closestOnSeg(f.points[0], moved[3], moved[0]).dist < 1e-9 && Math.hypot(f.points[0].u - 110, f.points[0].v - 300) < 1 && near(f.points[1].u, 500, 1e-9) && near(f.points[1].v, 250, 1e-9),
      `Phase digitizer: a closed boundary an island (${fi.map((q) => q.area).join(', ')}); the ends on the frame follow its edges as they move`,
    );
  }
  const sn = snapPoint({ u: 104, v: 300 }, frame, [], -1, 10);
  const sc = snapPoint({ u: 106, v: 104 }, frame, [], -1, 10);
  ok(sn?.kind === 'border' && near(sn.pt.u, 100, 1e-9) && near(sn.pt.v, 300, 1e-9) && sc?.kind === 'corner' && sc.pt.u === 100 && sc.pt.v === 100 && snapPoint({ u: 130, v: 300 }, frame, [], -1, 10) === null, 'Phase digitizer: a point caught on the border, a corner first, nothing far away');

  // a lens: the liquidus and the solidus from corner to corner of their sides; the frame alone one face
  const liq = { id: 'l', name: 'Liquidus', color: '#d62728', points: [{ u: 100, v: 200 }, { u: 300, v: 240 }, { u: 500, v: 400 }] };
  const sol = { id: 's', name: 'Solidus', color: '#1f77b4', points: [{ u: 100, v: 200 }, { u: 300, v: 360 }, { u: 500, v: 400 }] };
  const one = phaseFaces(frame, []);
  const lens = phaseFaces(frame, [liq, sol]);
  const sum = (fs: { area: number }[]) => fs.reduce((t, f) => t + f.area, 0);
  ok(one.length === 1 && near(one[0].area, 160000, 1e-6) && lens.length === 3 && near(sum(lens), 160000, 1e-6), `Phase digitizer: the frame one region; a lens three, filling the frame (${lens.length})`);
  // the ends clicked short of the frame (4 px) or past it: closed onto it, the same three regions
  const short = phaseFaces(frame, [
    { ...liq, points: [{ u: 104, v: 200 }, liq.points[1], { u: 497, v: 400 }] },
    { ...sol, points: [{ u: 95, v: 201 }, sol.points[1], { u: 508, v: 402 }] },
  ]);
  ok(short.length === 3 && near(sum(short), 160000, 1e-6), `Phase digitizer: an end short of a line or past it is closed onto it (${short.length})`);
  // a eutectic: two liquidus lines meeting at E, the eutectic line, two solvus lines: six regions
  const E = { u: 300, v: 350 };
  const eut = [
    { id: 'a', name: 'liquidus A', color: '#d62728', points: [{ u: 100, v: 150 }, { u: 200, v: 260 }, E] },
    { id: 'b', name: 'liquidus B', color: '#d62728', points: [E, { u: 400, v: 230 }, { u: 500, v: 130 }] },
    { id: 'c', name: 'eutectic', color: '#000000', points: [{ u: 150, v: 350 }, { u: 450, v: 350 }] },
    { id: 'd', name: 'solvus A', color: '#1f77b4', points: [{ u: 100, v: 170 }, { u: 150, v: 350 }, { u: 120, v: 500 }] },
    { id: 'e', name: 'solvus B', color: '#1f77b4', points: [{ u: 500, v: 150 }, { u: 450, v: 350 }, { u: 480, v: 500 }] },
  ];
  const ef = phaseFaces(frame, eut);
  ok(ef.length === 6 && near(sum(ef), 160000, 1e-6), `Phase digitizer: a eutectic diagram, six regions (${ef.length})`);

  // the regions: a label in every face; kept (by their labels) when a line moves
  const regs = detectRegions(lens, []).map((r) => ({ ...r }));
  const byV = regs.slice().sort((p, q) => p.labelPt.v - q.labelPt.v);
  [byV[0].name, byV[1].name, byV[2].name] = ['L', 'α + L', 'α'];
  const moved = phaseFaces(frame, [liq, { ...sol, points: [sol.points[0], { u: 300, v: 330 }, sol.points[2]] }]);
  const fills = regionFills(moved, regs);
  ok(regs.length === 3 && detectRegions(lens, regs).length === 3 && fills.length === 3 && new Set(fills.map((f) => f.region)).size === 3, 'Phase digitizer: Draw regions labels every face once; the regions follow a line moved');

  const pd: PhaseDigitizerData = {
    ...PHASE_DIGITIZER_DEFAULTS,
    image: 'x',
    w: 600,
    h: 600,
    axes: [
      { u: 100, v: 500, val: 0 },
      { u: 500, v: 500, val: 100 },
      { u: 100, v: 500, val: 0 },
      { u: 100, v: 100, val: 1000 },
    ],
    compA: 'Cu',
    compB: 'Ni',
    xUnit: 'wt%',
    splines: [liq, sol],
    regions: regs,
    leverPoints: [
      { id: 'p1', name: 'P1', pt: { u: 300, v: 300 } },
      { id: 'p2', name: 'P2', pt: { u: 300, v: 150 } },
    ],
  };
  const m = createCalMapper(pd);
  if (typeof m === 'string') ok(false, `Phase digitizer: calibrated (${m})`);
  else {
    const fr = frameOf(pd, m)!;
    const inv = m.fromData(50, 500);
    ok(fr.every((p, k) => near(p.u, frame[k].u, 1e-6) && near(p.v, frame[k].v, 1e-6)) && near(inv.u, 300, 1e-6) && near(inv.v, 300, 1e-6), 'Phase digitizer: the border from the calibration, the pixel of a value (the inverse map)');
    // at y = 500 (v = 300) the solidus is at the left, the liquidus at the right: the lever rule against them
    const crossAt = (s: typeof liq) => {
      const c = sampleSpline(s.points);
      for (let i = 0; i < c.length - 1; i++) if ((c[i].v - 300) * (c[i + 1].v - 300) <= 0) return (c[i].u + ((300 - c[i].v) / (c[i + 1].v - c[i].v)) * (c[i + 1].u - c[i].u) - 100) / 4;
      return NaN;
    };
    const [x1, x2] = [crossAt(sol), crossAt(liq)];
    const ev = evalLeverPoint(pd.leverPoints[0], 0, pd, m, fr, lens);
    const [e1, e2] = ev.ends ?? [];
    ok(
      !!e1 && !!e2 && near(ev.x0, 50, 1e-9) && near(ev.y0, 500, 1e-9) && ev.region === 'α + L' && near(e1.x, x1, 1e-6) && near(e2.x, x2, 1e-6) && e1.phase === 'α' && e2.phase === 'L' && near(e1.frac, ((x2 - 50) / (x2 - x1)) * 100, 1e-9) && near(e1.frac + e2.frac, 100, 1e-9),
      `Phase digitizer: the lever rule — the tie line to the solidus and the liquidus, their phases, the amounts (${ev.ends?.map((q) => `${q.phase} ${q.x.toFixed(2)} ${q.frac.toFixed(2)} %`).join(', ')})`,
    );
    const ev2 = evalLeverPoint(pd.leverPoints[1], 1, pd, m, fr, lens);
    ok(ev2.region === 'L' && ev2.ends === null, 'Phase digitizer: a point in a region named without “+” is one phase');
    // the regions as Draw regions names them (R1, R2 …): two phases until named — the lever rule shown; one chosen
    const auto = { ...pd, regions: detectRegions(lens, []) };
    const evA = evalLeverPoint(pd.leverPoints[0], 0, auto, m, fr, lens);
    const one = { ...pd, regions: pd.regions.map((r) => (r.name === 'α + L' ? { ...r, phases: 1 as const } : r)) };
    ok(
      !!evA.ends && near(evA.ends[0].x, x1, 1e-6) && regionPhases({ ...regs[0], name: 'L' }) === 1 && regionPhases({ ...regs[0], name: 'α + L' }) === 2 && regionPhases({ ...regs[0], name: 'R3' }) === 2 && regionPhases(undefined) === 2 && evalLeverPoint(pd.leverPoints[0], 0, one, m, fr, lens).ends === null,
      'Phase digitizer: the phases of a region — from its name (automatic names: two), or chosen',
    );
    // the tie line runs to the frontier of its region: a loose line inside the region (closing nothing) does not stop it
    const loose = { id: 'x', name: 'loose', color: '#000000', points: [{ u: 250, v: 280 }, { u: 260, v: 320 }] };
    const looseFaces = phaseFaces(frame, [liq, sol, loose]);
    const evL = evalLeverPoint(pd.leverPoints[0], 0, { ...pd, splines: [liq, sol, loose] }, m, fr, looseFaces);
    ok(looseFaces.length === 3 && !!evL.ends && near(evL.ends[0].x, x1, 1e-6) && near(evL.ends[1].x, x2, 1e-6), 'Phase digitizer: the tie line to the frontier of its region (a loose line inside it ignored)');
  }
  const out = runPhaseDigitizer(pd);
  ok(
    typeof out === 'object' && out.dataset.columns.length === 15 && out.dataset.columns[14].name === 'Arm b (wt%)' && out.dataset.columns[0].text?.join() === 'P1,P2' && out.workbook.sheets.map((q) => q.name).join() === 'Lever rule,Liquidus,Solidus' && out.dataset.columns[2].name === 'Ni (wt%)' && near(out.dataset.columns[8].values[1], 100, 1e-9),
    'Phase digitizer: the lever rule table, a sheet per boundary',
  );
  // any X axis: no other component, no unit (a mole fraction, a temperature …): its name alone, no rest to a total
  const bare = runPhaseDigitizer({ ...pd, compA: '', compB: 'x', xUnit: '' });
  ok(typeof bare === 'object' && bare.dataset.columns.map((c) => c.name).join() === 'Point,Region,x,T (°C),Phase 1,Phase 1 x,Phase 1 amount (%),Phase 2,Phase 2 x,Phase 2 amount (%),Arm a,Arm b' && bare.xLabel === 'x', 'Phase digitizer: any X axis — no other component, no unit');
  const frac = runPhaseDigitizer({ ...pd, xUnit: 'mole fraction', total: 1 });
  ok(typeof frac === 'object' && frac.dataset.columns[3].name === 'Cu (mole fraction)' && near(frac.dataset.columns[3].values[0], 1 - 50, 1e-9), 'Phase digitizer: the other component, the rest to the total given');
  ok(runPhaseDigitizer({ ...PHASE_DIGITIZER_DEFAULTS }) === 'Open the image of a phase diagram (or paste one: Ctrl+V).', 'Phase digitizer: waits for an image');
  // the data of an older node: a point as u, v; a region's name as label, its label point as labelPos
  const older = { ...pd, leverPoints: [{ id: 'x', name: 'P1', u: 300, v: 300 }], regions: [{ id: 'r', label: 'α + L', color: '#009E73', opacity: 0.2, poly: [], labelPos: { u: 300, v: 300 } }] } as unknown as PhaseDigitizerData;
  const oo = runPhaseDigitizer(older);
  ok(typeof oo === 'object' && oo.evals.length === 1 && oo.evals[0].region === 'α + L' && !!oo.evals[0].ends, 'Phase digitizer: the data of an older node still open (a point as u, v; a region label, labelPos)');
  // the example: the image drawn from the curves; the lever rule at 45 wt% Ni, 1250 °C against the exact crossings
  const exNode = EXAMPLES.find((e) => e.name.startsWith('Cu-Ni phase diagram'))!.make().nodes.find((q) => q.type === 'phasedigitizer');
  const exOut = exNode && runPhaseDigitizer(exNode.data as PhaseDigitizerData);
  const xL = (5.25 - Math.sqrt(5.25 ** 2 - 4 * 0.0155 * 165)) / (2 * 0.0155);
  const xS = (-1.85 + Math.sqrt(1.85 ** 2 + 4 * 0.0185 * 165)) / (2 * 0.0185);
  const col = (n: string) => (typeof exOut === 'object' ? exOut.dataset.columns.find((c) => c.name === n) : undefined);
  ok(
    typeof exOut === 'object' && col('Phase 1')?.text?.[0] === 'L' && col('Phase 2')?.text?.[0] === 'α' && near(col('Phase 1 Ni (wt%)')!.values[0], xL, 0.05) && near(col('Phase 2 Ni (wt%)')!.values[0], xS, 0.05) && near(col('Phase 1 amount (%)')!.values[0], ((xS - 45) / (xS - xL)) * 100, 0.3),
    `Phase digitizer example: the lever rule at 45 wt% Ni, 1250 °C — L ${xL.toFixed(2)}, α ${xS.toFixed(2)} wt% Ni (read ${col('Phase 1 Ni (wt%)')?.values[0]}, ${col('Phase 2 Ni (wt%)')?.values[0]})`,
  );
  // the total from the unit; wt% → at% with the molar masses (Pb–Sn: 40 wt% Sn)
  const pbsnAt = (100 * (40 / 118.71)) / (40 / 118.71 + 60 / 207.2);
  ok(totalOfUnit('wt%') === 100 && totalOfUnit('mole fraction') === 1 && totalOfUnit('x') === 1 && totalOfUnit('K') === null, 'Phase digitizer: the total from the unit (100 for %, 1 for a fraction, else asked)');
  const exOf = (start: string) => {
    const nd = EXAMPLES.find((e) => e.name.startsWith(start))!.make().nodes.find((q) => q.type === 'phasedigitizer');
    const r = runPhaseDigitizer(nd!.data as PhaseDigitizerData);
    return typeof r === 'object' ? r : null;
  };
  // Pb–Sn, 40 wt% Sn: the lever rule at 150 °C against the solvus lines; cooled from 300 °C: the liquidus, the eutectic,
  // the primary α and the eutectic just above it, α and β just below it (the textbook's compositions at 183 °C)
  {
    const r = exOf('Pb-Sn eutectic');
    const [p1, p2] = r?.evals ?? [];
    const [xa, xb] = [PBSN.solvA(150), PBSN.solvB(150)];
    const ar = p1 && armsOf(p1);
    ok(!!p1?.ends && near(p1.ends[0].x, xa, 0.1) && near(p1.ends[1].x, xb, 0.1) && near(p1.ends[0].frac, ((xb - 40) / (xb - xa)) * 100, 0.2) && !!ar && near(ar.a + ar.b, p1.ends[1].x - p1.ends[0].x, 1e-9) && near(p1.ends[0].frac, (100 * ar.b) / (ar.a + ar.b), 1e-9) && p1.armA === '#1971c2' && p1.armB === '#e8590c', `Pb-Sn at 40 wt% Sn, 150 °C: α ${xa.toFixed(2)}, β ${xb.toFixed(2)} wt% Sn, the arms a and b in their colours (read ${p1?.ends?.map((q) => q.x.toFixed(2)).join(', ')})`);
    const mc = p2?.path?.micro[0];
    const tL = PBSN.liqA(40);
    ok(
      !!p2?.path && p2.path.cross.length === 2 && near(p2.path.cross[0].y, tL, 0.3) && near(p2.path.cross[1].y, 183, 0.01) && p2.path.steps.map((q) => q.region).join(' | ') === 'L | α + L | α + β' && !!mc?.before && mc.primary === 0 && mc.before[0].phase === 'α' && mc.before[1].phase === 'eutectic' && near(mc.before[0].frac, ((61.9 - 40) / (61.9 - 18.3)) * 100, 0.1) && !!mc.after && near(mc.after[0].frac, ((97.8 - 40) / (97.8 - 18.3)) * 100, 0.1),
      `Pb-Sn cooled at 40 wt% Sn: liquidus ${tL.toFixed(1)} °C, eutectic 183 °C; primary α ${(((61.9 - 40) / (61.9 - 18.3)) * 100).toFixed(2)} %, then α ${(((97.8 - 40) / (97.8 - 18.3)) * 100).toFixed(2)} % (read ${mc?.before?.map((q) => q.frac.toFixed(2)).join(', ')}; ${mc?.after?.map((q) => q.frac.toFixed(2)).join(', ')})`,
    );
    const atCol = r?.dataset.columns.find((c) => c.name === 'Sn (at%)');
    ok(!!atCol && near(atCol.values[0], pbsnAt, 1e-3) && r?.workbook.sheets.map((q) => q.name).slice(0, 3).join() === 'Lever rule,Paths,Microconstituents', `Pb-Sn: 40 wt% Sn = ${pbsnAt.toFixed(2)} at% Sn (molar masses); the sheets of the paths and the microconstituents`);
  }
  // the steels: 0.40 wt% C — A3, then 48.8 % proeutectoid ferrite and 51.2 % pearlite, 94.3 % ferrite in all; 1.20 wt% C —
  // Acm, 7.4 % proeutectoid cementite
  {
    const r = exOf('Fe-Fe3C');
    const [p1, p2] = r?.evals ?? [];
    const [m1, m2] = [p1?.path?.micro[0], p2?.path?.micro[0]];
    ok(
      !!m1?.before && !!m1.after && near(p1!.path!.cross[0].y, FEC.a3(0.4), 0.3) && m1.before[0].phase === 'α' && m1.before[1].phase === 'pearlite' && near(m1.before[0].frac, ((0.76 - 0.4) / (0.76 - 0.022)) * 100, 0.1) && near(m1.after[0].frac, ((6.7 - 0.4) / (6.7 - 0.022)) * 100, 0.05) && m1.after[1].phase === 'Fe₃C',
      `Steel 0.40 wt% C: proeutectoid ferrite ${(((0.76 - 0.4) / (0.76 - 0.022)) * 100).toFixed(2)} %, pearlite, then ferrite ${(((6.7 - 0.4) / (6.7 - 0.022)) * 100).toFixed(2)} % in all (read ${m1?.before?.map((q) => `${q.phase} ${q.frac.toFixed(2)}`).join(', ')}; ${m1?.after?.map((q) => `${q.phase} ${q.frac.toFixed(2)}`).join(', ')})`,
    );
    ok(!!m2?.before && near(p2!.path!.cross[0].y, FEC.acm(1.2), 0.3) && m2.primary === 1 && m2.before[1].phase === 'Fe₃C' && m2.before[0].phase === 'pearlite' && near(m2.before[1].frac, ((1.2 - 0.76) / (6.7 - 0.76)) * 100, 0.1), `Steel 1.20 wt% C: Acm, proeutectoid cementite ${(((1.2 - 0.76) / (6.7 - 0.76)) * 100).toFixed(2)} % (read ${m2?.before?.map((q) => `${q.phase} ${q.frac.toFixed(2)}`).join(', ')})`);
  }
  // CO₂: the phases read; compressed at −20 °C the gas condenses on the boiling line; at −78.5 °C the solid sublimes at 1 atm
  {
    const r = exOf('CO2 pressure');
    const [p1, p2, p3, p4] = r?.evals ?? [];
    ok(p1?.kind === 'read' && p1.region === 'Liquid' && p2?.region === 'Supercritical' && !p1.ends && !r?.dataset.columns.some((c) => c.name === 'Phase 2'), 'CO2: the phase read at a point (liquid; supercritical), no second phase');
    ok(!!p3?.path && p3.path.steps.map((q) => q.region).join() === 'Gas,Liquid' && near(p3.path.cross[0].y, CO2.vap(-20), 0.3) && !!p4?.path && p4.path.steps.map((q) => q.region).join() === 'Solid,Gas' && near(p4.path.cross[0].y, 1, 0.05), `CO2: compressed at −20 °C, the gas condenses at ${CO2.vap(-20).toFixed(2)} atm; at −78.5 °C the solid sublimes at 1 atm (read ${p3?.path?.cross[0]?.y.toFixed(2)}, ${p4?.path?.cross[0]?.y.toFixed(3)})`);
  }
}

// ---- Equivalent circuit (EIS): the code read, the impedance against closed forms, the fit, the columns by role ----
{
  const p1 = parseCircuit('R(Q[RW])');
  const bad = [parseCircuit('R(RQ'), parseCircuit('R(RX)'), parseCircuit('')];
  ok(typeof p1 === 'object' && p1.elems.map((e) => e.id).join() === 'R1,Q1,R2,W1' && p1.elems.flatMap((e) => e.params).join() === 'R1,Q1 Y0,Q1 n,R2,W1 Y0' && bad.every((q) => typeof q === 'string'), 'EIS: Boukamp’s code read (series, parallel, a series inside), errors named');
  // R0 + R ∥ C at ω: R0 + R / (1 + jωRC); a CPE with n = 1 is a capacitor; Ws at low frequency → R, Wo → 1/(jω T/R)
  const rc = parseCircuit('R(RC)');
  const rq = parseCircuit('R(RQ)');
  const w = 2 * Math.PI * 37;
  if (typeof rc === 'object' && typeof rq === 'object') {
    const z = circuitZ(rc.tree, { R1: 10, R2: 100, C1: 1e-5 }, w);
    const den = 1 + (w * 100 * 1e-5) ** 2;
    const zq = circuitZ(rq.tree, { R1: 10, R2: 100, 'Q1 Y0': 1e-5, 'Q1 n': 1 }, w);
    const ws = parseCircuit('Ws');
    const zs = typeof ws === 'object' ? circuitZ(ws.tree, { 'Ws1 R': 50, 'Ws1 T': 1 }, 1e-6) : [NaN, NaN];
    ok(near(z[0], 10 + 100 / den, 1e-9) && near(z[1], (-100 * w * 100 * 1e-5) / den, 1e-9) && near(zq[0], z[0], 1e-9) && near(zq[1], z[1], 1e-9) && near(zs[0], 50, 1e-3), 'EIS: the impedance of R + R ∥ C against its closed form; a CPE with n = 1 a capacitor; the short Warburg → R at low frequency');
  }
  // the example: the columns found by their names; the fit with the spoiled points left out finds the circuit simulated
  const ex = EXAMPLES.find((e) => e.name.startsWith('Equivalent circuit (EIS)'))!.make();
  const res = evaluateGraph(ex.nodes, ex.edges).get('eis-node');
  const pv = res?.view.eis;
  const val = (n: string) => pv?.params.find((q) => q.name === n)?.value ?? NaN;
  ok(
    !!pv && pv.cols.freq === 'Freq / Hz' && pv.cols.a === "Z' / ohm" && pv.cols.b === "-Z'' / ohm" && Object.entries(EIS_TRUTH).every(([k, t]) => near(val(k) / t, 1, 0.02)) && pv.n === 69,
    `EIS example: the columns by their names, R(RQ)W fitted with 2 points left out (${pv?.params.map((q) => `${q.name} ${fmtNum(q.value, 4)}`).join(', ')})`,
  );
  // all the points: the spoiled ones pull the fit away (a larger χ²); the same spectrum as |Z| and the phase, ω in rad/s
  const node = ex.nodes.find((n) => n.id === 'eis-node')!;
  const all = evaluateGraph(ex.nodes.map((n) => (n.id === 'eis-node' ? ({ ...n, data: { ...n.data, excluded: [] } } as AppNode) : n)), ex.edges).get('eis-node')?.view.eis;
  ok(!!all && !!pv && all.redChi2 > 20 * pv.redChi2, `EIS: the spoiled points in, the reduced χ² ${fmtNum(all?.redChi2 ?? NaN, 3)} against ${fmtNum(pv?.redChi2 ?? NaN, 3)}`);
  const fitted = res?.outputs.fitted;
  if (fitted?.t === 'dataset' && pv) {
    const c = (n: string) => fitted.v.columns.find((q) => q.name === n)!.values;
    const [f, re, mim] = [c('Frequency (Hz)'), c("Z' (Ω)"), c("-Z'' (Ω)")];
    const polar: Dataset = { name: 'polar', columns: [column('omega', Float64Array.from(f, (v) => 2 * Math.PI * v)), column('Zmod', Float64Array.from(re, (v, i) => Math.hypot(v, mim[i]))), column('Phase', Float64Array.from(re, (v, i) => (Math.atan2(-mim[i], v) * 180) / Math.PI))] };
    const r2 = runEis(polar, { ...(node.data as EisData), form: 'polar', freq: 'omega', re: 'Zmod', im: 'Phase', freqUnit: 'rad/s', params: [] });
    ok(typeof r2 === 'object' && r2.result.params.every((q) => near(q.value / val(q.name), 1, 1e-4)), 'EIS: the same spectrum as |Z| and the phase, the frequency as ω: the same fit');
  }
  const g = guessColumns([column('Time (s)', new Float64Array(1)), column('Frequency (Hz)', new Float64Array(1)), column('Zre (Ohm)', new Float64Array(1)), column('-Zim (Ohm)', new Float64Array(1))], 'reim');
  ok(g.freq?.name === 'Frequency (Hz)' && g.a?.name === 'Zre (Ohm)' && g.b?.name === '-Zim (Ohm)', `EIS: the columns guessed from other names (${g.freq?.name}, ${g.a?.name}, ${g.b?.name})`);
}

// ---- EIS: the circuit edited and written back, the elements a fit does not need, R², ω found, the figures ----
{
  const ids = (c: string) => {
    const q = parseCircuit(c);
    return typeof q === 'object' ? q.elems.map((e) => e.id).join() : q;
  };
  ok(ids('R1R') === 'R1,R2' && ids('RR1') === 'R2,R1' && ids('R(R3Q)') === 'R1,R3,Q1', `EIS: an element without a number takes the next one not written (${ids('R1R')}; ${ids('RR1')}; ${ids('R(R3Q)')})`);
  const trip = EIS_CIRCUITS.every(([c]) => {
    const q = parseCircuit(c);
    return typeof q === 'object' && writeCircuit(q.tree, false) === c && ids(writeCircuit(q.tree, true)) === q.elems.map((e) => e.id).join();
  });
  ok(trip && EIS_CIRCUITS.some(([c]) => c === 'RWo') && EIS_CIRCUITS.some(([c]) => c === 'R(RQ)WC'), 'EIS: every circuit of the list written back as it was read (with and without the numbers); the supercapacitor circuits in it');
  const rq = parseCircuit('R(RQ)');
  if (typeof rq === 'object') {
    const w = (t: ReturnType<typeof editCircuit>) => writeCircuit(t, false);
    const ser = w(editCircuit(rq.tree, [1, 0], 'series', 'W'));
    const par = w(editCircuit(rq.tree, [], 'parallel', 'C'));
    const del = w(editCircuit(rq.tree, [1], 'delete', 'R'));
    const rpl = w(editCircuit(rq.tree, [1, 1], 'replace', 'C'));
    const two = w(editCircuit(rq.tree, [1], 'series', 'Q'));
    ok(ser === 'R([RW]Q)' && par === '([R(RQ)]C)' && del === 'R' && rpl === 'R(RC)' && two === 'R(RQ)Q' && w(editCircuit(null, [], 'series', 'R')) === 'R', `EIS: the circuit edited on its drawing (${ser}, ${par}, ${del}, ${rpl}, ${two})`);
  }
  // a Warburg the spectrum has no use for: its Y0 run away (its impedance → 0), the circuit without it proposed
  const rqw = parseCircuit('R(RQ)W');
  if (typeof rqw === 'object') {
    const p = { R1: 10, R2: 100, 'Q1 Y0': 2e-5, 'Q1 n': 0.9, 'W1 Y0': 1e300 };
    const sim = simulate(rqw.tree, p, 0.1, 1e5, 8);
    const pts = { f: sim.f, w: sim.f.map((f) => 2 * Math.PI * f), re: sim.re, im: sim.im, rows: sim.f.map((_, i) => i) };
    const res = { elems: rqw.elems, tree: rqw.tree, params: Object.entries(p).map(([name, value]) => ({ name, value, se: NaN, unit: '', fixed: false })), chi2: 0, redChi2: 0, r2: { all: 1, re: 1, im: 1 }, n: pts.f.length, fitted: true };
    const wn = fitWarnings(res, pts, pts.f.map(() => true));
    const wq = fitWarnings({ ...res, params: res.params.map((q) => (q.name === 'Q1 n' ? { ...q, value: 1 } : q)) }, pts, pts.f.map(() => true));
    ok(wn.length === 1 && /^W1 is not needed: its impedance → 0/.test(wn[0]) && wn[0].endsWith('try R(RQ).') && wq.some((m) => m.startsWith('Q1 n → 1')), `EIS: an element not needed found, the circuit without it proposed (${wn.join(' | ')})`);
  }
  // the example: R² near 1 (the two parts and each), the parameters table ends with the statistics
  const ex = EXAMPLES.find((e) => e.name.startsWith('Equivalent circuit (EIS)'))!.make();
  const res = evaluateGraph(ex.nodes, ex.edges).get('eis-node');
  const pv = res?.view.eis;
  const par = res?.outputs.parameters;
  const lastRows = par?.t === 'dataset' ? par.v.columns[0].text?.slice(-6).join() : '';
  ok(!!pv && pv.r2.all > 0.999 && pv.r2.re > 0.99 && pv.r2.im > 0.99 && lastRows === "χ²,reduced χ²,R²,R² Z',R² Z'',points" && pv.by.freq === 'name' && !pv.angular && res?.warnings?.length === 0, `EIS: R² of the fit ${fmtNum(pv?.r2.all ?? NaN, 6)} (Z′ ${fmtNum(pv?.r2.re ?? NaN, 5)}, Z″ ${fmtNum(pv?.r2.im ?? NaN, 5)}); the statistics under the parameters`);
  // the outputs: the data and the fit drawn smooth (25 a decade) for Plots, the circuit (white or transparent; its four
  // elements drawn); no figures of the graphs (Plots draw them from the data: the example's Nyquist and Bode)
  const node = ex.nodes.find((n) => n.id === 'eis-node')!;
  const withData = (patch: Partial<EisData>) => evaluateGraph(ex.nodes.map((n) => (n.id === 'eis-node' ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n)), ex.edges).get('eis-node');
  const clear = withData({ circuitBg: 'none', circuitValues: true });
  const circ = clear?.outputs.circuit;
  const texts = circ?.t === 'figure' ? circ.v.axes[0].annotations.flatMap((a) => (a.kind === 'text' ? [a.text.text] : [])) : [];
  const cur = res?.outputs.curve;
  const all = evaluateGraph(ex.nodes, ex.edges);
  const nyq = all.get('eis-nyquist')?.view.figure;
  const bod = all.get('eis-bode')?.view.figure;
  ok(
    cur?.t === 'dataset' && cur.v.columns.length === 5 && cur.v.columns[0].values.length > 150 && ['figure', 'mod', 'phase', 'bode'].every((k) => !res?.outputs[k]) && circ?.t === 'figure' && circ.v.background === 'none' && ['R1', 'R2', 'Q1', 'W1'].every((t) => texts.includes(t)) && texts.some((t) => /\u03a9$/.test(t)) && nyq?.axes[0].curves.length === 2 && bod?.axes[0].curves.length === 4 && (node.data as EisData).labelAt === undefined,
    `EIS: out the data and the smooth fit (${cur?.t === 'dataset' ? cur.v.columns[0].values.length : 0} points), the circuit transparent with its elements and values (${texts.join(' ')}); Nyquist and Bode drawn by Plots from them`,
  );
  // format 12 → 13: the figure outputs of an older EIS node become Plots of its data, connected where the figures were
  const v12 = JSON.stringify({
    app: 'graph-flow',
    version: 12,
    nodes: [
      ...ex.nodes.filter((n) => n.id === 'eis-data' || n.id === 'eis-node'),
      { id: 'cv', type: 'canvas', position: { x: 0, y: 0 }, data: { ...(ex.nodes.find((n) => n.id === 'eis-canvas')!.data as object) } },
    ],
    edges: [
      ...ex.edges.filter((e) => e.target === 'eis-node'),
      { id: 'a', source: 'eis-node', sourceHandle: 'figure', target: 'cv', targetHandle: 'figures' },
      { id: 'b', source: 'eis-node', sourceHandle: 'bode', target: 'cv', targetHandle: 'figures' },
    ],
  });
  const p12 = parseProject(v12);
  const plots = typeof p12 === 'string' ? [] : p12.nodes.filter((n) => n.type === 'plot1d');
  const r12 = typeof p12 === 'string' ? null : evaluateGraph(p12.nodes, p12.edges);
  const toCanvas = typeof p12 === 'string' ? [] : p12.edges.filter((e) => e.target === 'cv');
  ok(typeof p12 !== 'string' && p12.version === PROJECT_VERSION && plots.length === 2 && toCanvas.length === 2 && toCanvas.every((e) => plots.some((q) => q.id === e.source) && e.sourceHandle === 'figure') && !p12.edges.some((e) => e.source === 'eis-node' && ['figure', 'bode'].includes(e.sourceHandle ?? '')) && plots.every((q) => (r12?.get(q.id)?.view.figure?.axes[0].curves.length ?? 0) >= 2), `format 12 \u2192 13: the Nyquist and Bode outputs of an EIS node become Plots of its data, connected to the Merge (${plots.map((q) => q.id).join(', ')})`);
  // format 13 → 14: a Report becomes a note with the texts written in it, its connections gone
  const v13 = JSON.stringify({
    app: 'graph-flow',
    version: 13,
    nodes: [
      { id: 'b', type: 'book', position: { x: 0, y: 0 }, data: { ...WORKBOOK_DEFAULTS } },
      { id: 'r', type: 'report', position: { x: 300, y: 0 }, data: { title: 'Run 1', intro: 'Before.', outro: '', date: true, digits: 4, pm: true, maxRows: 50, items: { 1: { title: 'Fit', text: 'The dip moved.' }, 0: { hidden: true } } } },
    ],
    edges: [{ id: 'e', source: 'b', sourceHandle: 'out', target: 'r', targetHandle: 'in-0' }],
  });
  const p13 = parseProject(v13);
  const rn = typeof p13 === 'string' ? undefined : p13.nodes.find((n) => n.id === 'r');
  ok(typeof p13 !== 'string' && p13.version === PROJECT_VERSION && rn?.type === 'note' && (rn.data as { text: string }).text === 'Run 1\n\nBefore.\n\nFit\nThe dip moved.' && !p13.edges.length, `format 13 → 14: a Report becomes a note with its texts (${JSON.stringify(rn?.data)})`);
  // ω found: the frequencies on an even logarithmic grid only once divided by 2π; columns named A, B, C: by their places
  const f = Array.from({ length: 31 }, (_, k) => 10 ** (5 - k / 5));
  const g = guessColumns([column('A', new Float64Array(1)), column('B', new Float64Array(1)), column('C', new Float64Array(1))], 'reim');
  ok(looksAngular(f.map((v) => 2 * Math.PI * v)) && !looksAngular(f) && !looksAngular([1, 2, 5, 10, 20, 50, 100]) && g.by.freq === 'place' && g.by.a === 'place' && g.by.b === 'place' && g.a?.name === 'B', 'EIS: ω (2πf) told from f by its values; columns without telling names taken by their places (and said so)');
  const dr = parseCircuit('R(Q[RW])');
  if (typeof dr === 'object') {
    const pic = drawCircuit(dr.tree, { R1: 15.2, 'Q1 Y0': 3e-5, 'Q1 n': 0.87, R2: 213, 'W1 Y0': 0.004 });
    const inside = pic.elems.every((e) => e.x0 >= 0 && e.y0 >= 0 && e.x1 <= pic.w && e.y1 <= pic.h);
    const apart = pic.elems.every((a, i) => pic.elems.every((b, j) => i === j || a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0));
    ok(pic.elems.length === 4 && pic.groups.length === 2 && inside && apart, `EIS: the circuit drawn — every element on the page, none over another (${pic.w} × ${pic.h} mm)`);
  }
}

// ---- EIS: elements dragged onto the circuit's drawing — new ones beside a part or in its place, moved, swapped ----
{
  const rq = parseCircuit('R(RQ)');
  if (typeof rq === 'object') {
    const w = (t: ReturnType<typeof dropInto>, ids = false) => writeCircuit(t, ids);
    const t = rq.tree;
    const out = [
      w(dropInto(t, [1, 0], 'right', 'W')), // after R2: R2 and W in series
      w(dropInto(t, [1, 0], 'left', 'W')), // before R2
      w(dropInto(t, [0], 'bottom', 'C')), // R1 ∥ C
      w(dropInto(t, [1], 'top', 'L')), // L over the group (one parallel group)
      w(dropInto(t, [], 'right', 'W')), // after the whole circuit
      w(dropInto(t, [1, 1], 'center', 'C')), // Q1 replaced
      w(dropInto(null, [], 'center', 'Q')), // an empty circuit
    ];
    const want = ['R([RW]Q)', 'R([WR]Q)', '(RC)(RQ)', 'R(LRQ)', 'R(RQ)W', 'R(RC)', 'Q'];
    // moved: R1 into the group beside R2 (its name kept), then R1 and Q1 changing places
    const mv = dropInto(t, [1, 0], 'right', { id: 'R1' });
    const sw = dropInto(t, [1, 1], 'center', { id: 'R1' });
    const kept = mv && elemsOf(mv).map((e) => e.id).join();
    ok(out.every((c, k) => c === want[k]) && w(mv, true) === '([R2R1]Q1)' && kept === 'R2,R1,Q1' && w(sw, true) === 'Q1(R2R1)' && dropInto(t, [0], 'left', { id: 'R1' }) === t, `EIS: elements dropped on the drawing (${out.join(', ')}; moved ${w(mv, true)}, swapped ${w(sw, true)})`);
  }
}

// ---- EIS: a parallel split and join on the drawing — the elements between them a branch, a new element the other ----
{
  const c = parseCircuit('RRQW');
  if (typeof c === 'object') {
    const t = c.tree;
    const rg = rangeOf(t, 'R2', 'Q1');
    const one = rangeOf(t, 'Q1', 'Q1');
    const back = rangeOf(t, 'Q1', 'R2'); // the join put first: the same branch
    const w = (x: ReturnType<typeof withBranch>, ids = false) => writeCircuit(x, ids);
    const two = typeof rg === 'object' ? w(withBranch(t, rg, 'C')) : rg;
    const alone = typeof one === 'object' ? w(withBranch(t, one, 'C')) : one;
    const same = typeof back === 'object' && typeof rg === 'object' && back.a === rg.a && back.b === rg.b;
    const moved = typeof rg === 'object' ? w(withBranch(t, rg, { id: 'W1' }), true) : '';
    const whole = rangeOf(t, 'R1', 'W1');
    const all = typeof whole === 'object' ? w(withBranch(t, whole, 'L')) : whole;
    const par = parseCircuit('R(RQ)');
    const cross = typeof par === 'object' ? rangeOf(par.tree, 'R2', 'Q1') : '';
    ok(two === 'R([RQ]C)W' && alone === 'RR(QC)W' && same && moved === 'R1([R2Q1]W1)' && all === '([RRQW]L)' && typeof cross === 'string', `EIS: split and join — the branch between them (${two}, ${alone}, moved ${moved}, ${all}); not across two branches`);
  }
}

// ---- EIS: columns without names (chosen by their places, shown by their letters) ----
{
  const f = Array.from({ length: 30 }, (_, k) => 10 ** (5 - k / 6));
  const z = f.map((v) => {
    const w = 2 * Math.PI * v;
    const den = 1 + (w * 200 * 2e-5) ** 2;
    return [15 + 200 / den, (w * 200 * 200 * 2e-5) / den];
  });
  const ds: Dataset = { name: 'no names', columns: [column('', Float64Array.from(f, (v) => 2 * Math.PI * v)), column('', Float64Array.from(z, (q) => q[0])), column('', Float64Array.from(z, (q) => q[1]))] };
  const base: EisData = { form: 'reim', freq: '#0', re: '#1', im: '#2', imSign: 'auto', freqUnit: 'rad/s', circuit: 'R(RC)', params: [], weight: 'modulus', excluded: [], labels: 'decades', view: 'nyquist' };
  const r = runEis(ds, base);
  const val = (n: string) => (typeof r === 'object' ? (r.result.params.find((q) => q.name === n)?.value ?? NaN) : NaN);
  ok(typeof r === 'object' && near(val('R1'), 15, 1e-3) && near(val('R2'), 200, 1e-3) && near(val('C1') / 2e-5, 1, 1e-3) && colLabel(ds.columns, ds.columns[2]) === 'C' && colKey(ds.columns, ds.columns[1]) === '#1' && r.signNote.startsWith('“C”'), `EIS: columns without names chosen by their places (#0, #1, #2), shown by their letters; ω read as rad/s (${typeof r === 'string' ? r : r.signNote})`);
}

// ---- EIS: frequency ranges, a fit per range (its own circuit), the fit on demand (Start fit) ----
{
  const ex = EXAMPLES.find((e) => e.name.startsWith('Equivalent circuit (EIS)'))!.make();
  const src = evaluateGraph(ex.nodes, ex.edges);
  const node = ex.nodes.find((n) => n.id === 'eis-node')!;
  const edge = ex.edges.find((e) => e.target === 'eis-node')!;
  const sv = src.get(edge.source)!.outputs[edge.sourceHandle ?? 'out'];
  const ds = sv?.t === 'workbook' ? sv.v.sheets[0] : sv?.t === 'dataset' ? sv.v : null;
  const base = node.data as EisData;
  if (ds) {
    const all = runEis(ds, base);
    const ranged = runEis(ds, { ...base, ranges: [{ lo: 1, hi: 1e5 }] });
    const used = (r: typeof all) => (typeof r === 'object' ? r.fitted.columns.find((c) => c.name === 'Used')!.text! : []);
    ok(typeof all === 'object' && typeof ranged === 'object' && ranged.result.n < all.result.n && used(ranged).includes('outside the ranges') && ranged.inRange.some((q) => !q), `EIS: a frequency range — the points outside it not fitted (${typeof ranged === 'object' ? ranged.result.n : '?'} of ${typeof all === 'object' ? all.result.n : '?'})`);
    // the high-frequency arc on its own with R(RQ): its values near those of the whole fit
    const per = runEis(ds, { ...base, ranges: [{ lo: 5, hi: 1e5, circuit: 'R(RQ)' }, { lo: 1e-2, hi: 0.5 }], rangeFits: true });
    const rf = typeof per === 'object' ? per.rangeFits : [];
    const arc = rf[0]?.result;
    const v = (n: string) => arc?.params.find((q) => q.name === n)?.value ?? NaN;
    ok(rf.length === 2 && !!arc && arc.r2.all > 0.99 && near(v('R1') / 15, 1, 0.1) && near(v('R2') / 220, 1, 0.25) && rf[1].circuit === 'R(RQ)W' && !!rf[1].result && typeof per === 'object' && per.ranges.columns[0].text!.length === arc.params.length + rf[1].result!.params.length, `EIS: a fit per range, the arc alone with R(RQ) (R1 ${fmtNum(v('R1'), 4)}, R2 ${fmtNum(v('R2'), 4)}, R² ${fmtNum(arc?.r2.all ?? NaN, 5)})`);
    // on demand: nothing fitted before Start fit; then the settings kept, a change only said (outdated)
    const before = runEis(ds, { ...base, autoFit: false });
    const kept = fitSettingsOf(base);
    const after = runEis(ds, { ...base, autoFit: false, fitWith: kept });
    const changed = runEis(ds, { ...base, circuit: 'R(RQ)', autoFit: false, fitWith: kept });
    ok(
      typeof before === 'object' && !before.fittedYet && !before.result.fitted && typeof after === 'object' && after.result.fitted && !after.outdated && typeof changed === 'object' && changed.outdated && changed.result.params.some((q) => q.name === 'W1 Y0') && near(changed.result.chi2, after.result.chi2, 1e-9),
      'EIS: the fit on demand — not fitted before Start fit; after it, a change of the circuit only marked outdated (the last fit kept)',
    );
  }
}

// ---- The catalog for language models (llms.txt, api/): every node with its ports; the checker on every example ----
{
  const cat = nodesCatalog();
  const types = new Set(cat.map((n) => n.type));
  ok(Object.keys(NODE_TITLES).every((t) => t === 'frame' || types.has(t)), 'catalog: every node type in nodes.json');
  const fit = cat.find((n) => n.type === 'fit')!;
  ok(fit.inputs.some((p) => p.id === 'in' && p.types.includes('dataset') && !!p.about) && fit.outputs.some((p) => p.id === 'params') && fit.options.reconv?.type === 'boolean' && !!fit.options.reconv.about && (fit.defaults as { points: number }).points === 400, 'catalog: a node’s ports (types, what they are), options (type, meaning) and defaults');
  const plot = cat.find((n) => n.type === 'plot1d')!;
  ok(['dataset', 'x', 'y', 'y-<k>', 'series-<k>', 'insets'].every((id) => plot.inputs.some((p) => p.id === id)) && plot.outputs.some((p) => p.id === 'figure' && p.types[0] === 'figure'), 'catalog: the numbered ports of a Plot’s curves (y, y-<k> …)');
  ok(cat.every((n) => [...n.inputs, ...n.outputs].every((p) => p.types.length > 0)), 'catalog: every port has its types');
  // every connection of every example names ports the catalog lists (numbered ones by their pattern)
  const has = (ports: ApiPort[], id: string) => ports.some((p) => (p.pattern ? new RegExp(`^${p.id.replace(/<\w+>/g, '[\\w.-]+')}$`).test(id) : p.id === id));
  const missing = new Set<string>();
  for (const ex of EXAMPLES) {
    const p = ex.make();
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    for (const e of p.edges) {
      const s = cat.find((n) => n.type === byId.get(e.source)?.type);
      const t = cat.find((n) => n.type === byId.get(e.target)?.type);
      if (s && s.type !== 'subgraph' && s.type !== 'groupin' && !has(s.outputs, e.sourceHandle ?? 'out')) missing.add(`${s.type}.${e.sourceHandle} (out)`);
      if (t && t.type !== 'subgraph' && t.type !== 'groupout' && !has(t.inputs, e.targetHandle ?? '')) missing.add(`${t.type}.${e.targetHandle} (in)`);
    }
  }
  ok(missing.size === 0, `catalog: every port the examples connect is listed${missing.size ? ` (missing: ${[...missing].join(', ')})` : ''}`);

  // the checker: every example passes; broken projects are told what is wrong
  const bad = EXAMPLES.map((ex) => [ex.name, checkProject(stringifyProject(ex.make()))] as const).filter(([, r]) => !r.ok);
  ok(bad.length === 0, `checker: every example passes${bad.length ? ` (${bad.map(([n, r]) => `${n}: ${r.errors[0]}`).join('; ')})` : ''}`);
  const ex0 = EXAMPLES.find((e) => e.name.startsWith('UV-Vis'))?.make() ?? EXAMPLES[0].make();
  const broken = (f: (p: Project) => void) => {
    const p = structuredClone(ex0);
    f(p);
    return checkProject(stringifyProject(p));
  };
  const imp = ex0.nodes.find((n) => n.type === 'import')!;
  const e0 = ex0.edges.find((e) => e.source === imp.id)!;
  const r1 = broken((p) => (p.edges.find((e) => e.id === e0.id)!.sourceHandle = 'nope'));
  const r2 = broken((p) => p.nodes.push({ ...structuredClone(imp), type: 'histogramm' } as unknown as AppNode));
  const r3 = broken((p) => (p.edges.find((e) => e.id === e0.id)!.target = 'missing-node'));
  const r4 = broken((p) => (p.nodes.find((n) => n.id === imp.id)!.data = { ...imp.data, text: 'a,b\n1,2' } as never));
  ok(!r1.ok && r1.errors.some((e) => e.includes('has no output “nope”')), 'checker: an output that does not exist');
  ok(!r2.ok && r2.errors.some((e) => e.includes('unknown type "histogramm"')) && r2.errors.some((e) => e.includes('used twice')), 'checker: an unknown type, an id used twice');
  ok(!r3.ok && r3.errors.some((e) => e.includes('is not the id of a node')), 'checker: a connection to a node that does not exist');
  ok(!r4.ok || r4.nodes.some((n) => n.warnings.length > 0), `checker: data without the columns the nodes name: told (${r4.errors[0] ?? r4.nodes.find((n) => n.warnings.length)?.warnings[0]})`);
  const good = checkProject(stringifyProject(ex0));
  ok(good.ok && good.nodes.some((n) => /dataset: \d+ rows; columns: /.test(Object.values(n.outputs).join(' '))), 'checker: what every output holds (rows, the columns’ names)');

  // the published files: written, the checker bundled and run as a model would, nothing private in them
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.tmp', 'api-check');
  const written = await writeApi(dir);
  ok(written.length === 5, 'catalog: llms.txt, nodes.json, project.schema.json, recipes.json, check.mjs written');
  const llms = readFileSync(join(dir, 'llms.txt'), 'utf8');
  ok(llms.includes(`"version": ${PROJECT_VERSION}`) && llms.includes('node check.mjs project.json') && llms.includes('- fit (Fit)') && !llms.includes('{{'), 'catalog: llms.txt with the rules, the format version and the nodes');
  const exFile = join(dir, 'example.json');
  writeFileSync(exFile, stringifyProject(ex0));
  const run = spawnSync(process.execPath, [join(dir, 'api', 'check.mjs'), exFile], { encoding: 'utf8' });
  const brokenFile = join(dir, 'broken.json');
  writeFileSync(brokenFile, stringifyProject({ ...ex0, edges: ex0.edges.map((e) => (e.id === e0.id ? { ...e, sourceHandle: 'nope' } : e)) }));
  const run2 = spawnSync(process.execPath, [join(dir, 'api', 'check.mjs'), brokenFile], { encoding: 'utf8' });
  ok(run.status === 0 && run.stdout.includes('OK: the project opens') && run2.status === 1 && run2.stdout.includes('has no output “nope”'), `catalog: check.mjs runs alone (${run.stderr.trim().split('\n')[0] || 'ok'})`);
  const leaks = ['llms.txt', 'api/nodes.json', 'api/project.schema.json', 'api/recipes.json', 'api/check.mjs'].filter((f) => privateHits(readFileSync(join(dir, f), 'utf8')).length);
  ok(leaks.length === 0 && privateHits('C:\\Users\\someone\\x').length > 0 && privateHits('mail me: someone@gmail.com').length > 0, `catalog: nothing private in the published files${leaks.length ? ` (${leaks.join(', ')})` : ''}`);
}

{
  // the search of Help (and later of the assistant): endings, synonyms, a word being typed, a typo; the help cut into
  // its subsections; the words found highlighted; on the assistant's questions, the right node near the top
  const docs = [
    { id: 'a', title: 'Smooth', text: 'Savitzky–Golay smoothing of a noisy curve' },
    { id: 'b', title: 'Baseline correction', text: 'the background under the peaks taken off' },
    { id: 'c', title: 'Histogram', text: 'the values counted in bins' },
  ];
  const ix = makeIndex(docs);
  const first = (q: string) => ix.search(q)[0]?.id;
  ok(stem('peaks') === 'peak' && stem('fitted') === 'fit' && stem('smoothing') === 'smooth' && stem('analysis') === 'analysis' && first('smoothed curves') === 'a' && first('remove the background') === 'b' && first('histo') === 'c' && first('smoth') === 'a' && first('histogramm') === 'c' && ix.search('zebra').length === 0, 'Help search: endings, synonyms, a word being typed, a typo, nothing found');
  const parts = helpParts(NODE_HELP.image);
  const marked = highlight('Find the peaks of a peak list', ['peak']);
  const sn = snippet(`${'x '.repeat(200)}the peak is here ${'y '.repeat(200)}`, ['peak']);
  ok(parts.length > 10 && parts.some((p) => p.heading === 'Find like this') && parts.map((p) => p.text).join(' ').length >= NODE_HELP.image.length - parts.length * 2 && marked.filter((p) => p.hit).length === 2 && sn[0].t === '… ' && sn.some((p) => p.hit && p.t === 'peak'), `Help: a long help cut into ${parts.length} subsections (nothing lost); the words found highlighted, the piece around them`);
  const qs = (JSON.parse(readFileSync(new URL('./fixtures/assistant-questions.json', import.meta.url), 'utf8')) as { questions: { q: string; expect: string[]; alt?: string[][] }[] }).questions.filter((x) => x.expect.length);
  const hx = makeIndex(helpDocs([]));
  const top3 = qs.filter((x) => {
    const want = [x.expect, ...(x.alt ?? [])].map((a) => a[0]);
    const nodes = [...new Set(hx.search(`${x.q} `, 60).filter((h) => h.id.startsWith('node:')).map((h) => h.id.split(':')[1]))];
    return nodes.slice(0, 3).some((t) => want.includes(t));
  }).length;
  ok(top3 / qs.length >= 0.75, `Help search on the assistant's ${qs.length} questions: the right node in the first three for ${Math.round((100 * top3) / qs.length)} % (no recipes yet)`);
}

{
  // a curve's symbols: filled in its colour, open, or a colour of their own with its opacity (an older white: white; an
  // older dot: open with a dot inside); the marks inside (a dot filled, the others lines)
  const base = { symbol: 'circle' as const };
  const filled = symbolLook({ ...base, symbolFill: 'filled' }, '#0072b2');
  const white = symbolLook({ ...base, symbolFill: 'white' }, '#0072b2');
  const dot = symbolLook({ ...base, symbolFill: 'dot' }, '#0072b2');
  const own = symbolLook({ ...base, symbolFill: 'color', symbolFillColor: '#ffcc00', symbolFillOpacity: 0.4, symbolInner: 'plus' }, '#0072b2');
  const plus = innerPath('plus', 10, 0, 0, 0.5);
  const dotIn = innerPath('dot', 10, 5, 5);
  ok(filled.fill === '#0072b2' && !filled.inner && white.fill === '#ffffff' && dot.fill === 'none' && dot.inner === 'dot' && own.fill === '#ffcc00' && own.fillOpacity === 0.4 && own.inner === 'plus' && plus.d === 'M-2.5,0L2.5,0M0,-2.5L0,2.5' && !plus.filled && dotIn.filled && innerPath('backslash', 10, 0, 0).d.startsWith('M-1.77,-1.77'), 'Symbols: filled, white and dot as before, a fill colour of their own with its opacity, the marks inside');
}

{
  // Signal generator: chirps, square, sawtooth and triangle as scipy; Voigt as scipy's voigt_profile; Fano's zero and
  // maximum; coupled oscillators split by 2g; noise spectra (white, pink 1/f, brown 1/f²); C–V of an ideal MOS
  // capacitor as razvan_CV_ideal_test.m (deep depletion), and its low and high frequency limits (Sze); a circuit's
  // impedance; the SNR, missing values and the seed
  const G = JSON.parse(readFileSync(new URL('./fixtures/siggen-ref.json', import.meta.url), 'utf8')) as { t: number[]; chirp: Record<string, number[]>; square: number[]; sawtooth: number[]; triangle: number[]; voigt: number[]; cv: { V: number[]; C: Record<string, number[]>; Cox: number } };
  const comp = (kind: Parameters<typeof newComponent>[0], p: Record<string, number>, opts?: Record<string, string>) => ({ ...newComponent(kind, 'c'), p: { ...newComponent(kind, 'c').p, ...p }, ...(opts ? { opts: { ...newComponent(kind, 'c').opts, ...opts } } : {}) });
  const maxDiff = (a: number[] | string, b: number[]) => (typeof a === 'string' ? Infinity : Math.max(...a.map((v, i) => Math.abs(v - b[i]))));
  const chirps = ['linear', 'quadratic', 'logarithmic', 'hyperbolic'].map((m) => maxDiff(componentAt(comp('chirp', { f0: 1, f1: 10, x0: 0, T: 10 }, { method: m, env: 'none' }), G.t), G.chirp[m]));
  const mism = (a: number[] | string, b: number[]) => (typeof a === 'string' ? 999 : a.filter((v, i) => Math.abs(v - b[i]) > 1e-9).length);
  const waves = [mism(componentAt(comp('square', { f: 0.7, duty: 0.3 }), G.t), G.square), maxDiff(componentAt(comp('sawtooth', { f: 0.7 }), G.t), G.sawtooth), maxDiff(componentAt(comp('triangle', { f: 0.7 }), G.t), G.triangle)];
  const xs = Array.from({ length: 101 }, (_, i) => i / 10);
  const vg = maxDiff(componentAt(comp('voigt', { c: 5, gw: 1, lw: 0.5 }), xs), G.voigt);
  const fano = componentAt(comp('fano', { c: 5, w: 1, q: 2 }), [5 - 1, 5 + 0.25]) as number[];
  const grid = Array.from({ length: 4001 }, (_, i) => 3 + i / 1000);
  const pw = componentAt(comp('coupled', { e1: 5, e2: 5, g1: 0.02, g2: 0.02, g: 0.5 }), grid) as number[];
  const peaks = grid.filter((_, i) => i > 0 && i < grid.length - 1 && pw[i] > pw[i - 1] && pw[i] >= pw[i + 1] && pw[i] > 0.3);
  ok(chirps.every((d) => d < 1e-9) && waves[0] <= 2 && waves[1] < 1e-9 && waves[2] < 1e-9 && vg < 1e-6 && Math.abs(fano[0]) < 1e-12 && Math.abs(fano[1] - 5) < 1e-12 && peaks.length === 2 && Math.abs(peaks[0] - 4.5) < 0.03 && Math.abs(peaks[1] - 5.5) < 0.03, `Signal generator: chirps (${chirps.map((d) => d.toExponential(0)).join(', ')}), square, sawtooth, triangle as scipy; Voigt; Fano's zero and maximum; coupled oscillators split by 2g (${peaks.map((p) => p.toFixed(3)).join(', ')})`);
  // the slope of the noise's spectrum (log power against log frequency, octave bands)
  const slope = (kind: 'white' | 'pink' | 'brown') => {
    const n = 8192;
    let px = 0;
    let py = 0;
    let pxx = 0;
    let pxy = 0;
    let m = 0;
    const P = new Array(n / 2).fill(0);
    for (let rep = 0; rep < 8; rep++) {
      const v = noiseOf(kind, 'normal', n, rng(11 + rep));
      const [re, im] = Sg.fft(v, new Array(n).fill(0));
      for (let k = 1; k < n / 2; k++) P[k] += re[k] ** 2 + im[k] ** 2;
    }
    for (let a = 4; a < n / 4; a *= 2) {
      let s = 0;
      for (let k = a; k < 2 * a; k++) s += P[k];
      const [lx, ly] = [Math.log10(a * 1.5), Math.log10(s / a)];
      px += lx;
      py += ly;
      pxx += lx * lx;
      pxy += lx * ly;
      m++;
    }
    return (m * pxy - px * py) / (m * pxx - px * px);
  };
  const sl = [slope('white'), slope('pink'), slope('brown')];
  ok(Math.abs(sl[0]) < 0.15 && Math.abs(sl[1] + 1) < 0.15 && Math.abs(sl[2] + 2) < 0.3, `Signal generator: noise spectra, white ${sl[0].toFixed(2)}, pink ${sl[1].toFixed(2)}, brown ${sl[2].toFixed(2)} (0, −1, −2)`);
  // C–V
  const cvBase = { ...SIGGEN_DEFAULTS.cv, type: 'n' as const, mode: 'deep' as const, dop: 1e16, tox: 14, epsOx: 3.9, epsS: 9.66, eg: 3.3, mc: 0.45, mv: 0.66, area: 1, vfbFrom: 'typed' as const, vfb: 1 };
  const rel = (T: number) => {
    const cur = mosCurve(cvBase, T, G.cv.V);
    if (typeof cur === 'string') return Infinity;
    const ref = G.cv.C[String(T)];
    // (the points both reach: at the ends of the range of ψ one grid may reach a voltage the other does not)
    const both = cur.c.flatMap((v, i) => (Number.isFinite(v) && Number.isFinite(ref[i]) ? [Math.abs(v - ref[i]) / ref[i]] : []));
    const fin = [cur.c, ref].map((a) => a.filter(Number.isFinite).length);
    return Math.abs(fin[0] - fin[1]) <= 2 && both.length > 100 ? Math.max(...both) : Infinity;
  };
  const si = { ...cvBase, eg: 1.12, mc: 1.08, mv: 0.81, epsS: 11.7, tox: 20 };
  const curve = (mode: 'deep' | 'lf' | 'hf') => mosCurve({ ...si, mode }, 300, [-10, 5]) as Exclude<ReturnType<typeof mosCurve>, string>;
  const [lf, hf, deep] = [curve('lf'), curve('hf'), curve('deep')];
  const phiT = (1.380649e-23 * 300) / 1.602176634e-19;
  const nc = 2 * ((2 * Math.PI * 1.08 * 9.1093837015e-31 * 1.380649e-23 * 300) / 6.62607015e-34 ** 2) ** 1.5;
  const nv = 2 * ((2 * Math.PI * 0.81 * 9.1093837015e-31 * 1.380649e-23 * 300) / 6.62607015e-34 ** 2) ** 1.5;
  const ni = Math.sqrt(nc * nv) * Math.exp((-1.602176634e-19 * 1.12) / (2 * 1.380649e-23 * 300));
  const es = 8.8541878128e-12 * 11.7;
  const wmax = Math.sqrt((4 * es * phiT * Math.log(1e22 / ni)) / (1.602176634e-19 * 1e22));
  const cmin = 1 / (1 / hf.cox + wmax / (es * 1e-6));
  ok(rel(300) < 2e-3 && rel(14) < 2e-3 && lf.c[0] > 0.95 * lf.cox && Math.abs(hf.c[0] / cmin - 1) < 0.02 && deep.c[0] < hf.c[0] && lf.c[1] > 0.9 * lf.cox, `C–V: as razvan_CV_ideal_test.m (deep depletion, 300 K and 14 K: ${rel(300).toExponential(1)}, ${rel(14).toExponential(1)}); low frequency back to C_ox, high frequency at C_min (${(hf.c[0] / cmin).toFixed(4)} of Sze's, which leaves out kT/q in W_max), deep depletion below`);
  // a circuit's impedance; the noise by a signal-to-noise ratio; missing values; the seed
  const ez = generate({ ...SIGGEN_DEFAULTS, kind: 'eis', eis: { circuit: 'R(RC)', params: [{ name: 'R1', value: 10 }, { name: 'R2', value: 100 }, { name: 'C1', value: 1e-6 }], fMin: 1, fMax: 1e5, per: 5 } });
  const zc = typeof ez === 'string' ? [] : ez.dataset.columns;
  const f0 = zc[0]?.values[10] ?? NaN;
  const w = 2 * Math.PI * f0;
  const zr = 10 + 100 / (1 + (w * 100e-6) ** 2);
  const zi = (-w * 100 * 100e-6) / (1 + (w * 100e-6) ** 2);
  const sine = { ...SIGGEN_DEFAULTS, components: [comp('sine', { A: 1, f: 3 })], points: 4000, noise: { kind: 'white' as const, dist: 'normal' as const, by: 'snr' as const, snr: 20, sigma: 0 }, clean: true, missing: 10 };
  const g1 = generate(sine);
  const g2 = generate(sine);
  const yv = typeof g1 === 'string' ? [] : Array.from(g1.dataset.columns[1].values);
  const cl = typeof g1 === 'string' ? [] : Array.from(g1.dataset.columns[2].values);
  const resid = yv.flatMap((v, i) => (Number.isFinite(v) ? [v - cl[i]] : []));
  const sd = Math.sqrt(resid.reduce((a, b) => a + b * b, 0) / resid.length);
  ok(zc.map((c) => c.name).join(' / ') === "f (Hz) / Z' (Ω) / -Z'' (Ω) / |Z| (Ω) / Phase (°)" && Math.abs(zc[1].values[10] - zr) < 1e-9 * zr && Math.abs(zc[2].values[10] + zi) < 1e-9 * Math.abs(zi) && Math.abs(sd / (Math.SQRT1_2 / 10) - 1) < 0.05 && yv.filter((v) => !Number.isFinite(v)).length === 400 && typeof g2 !== 'string' && g2.dataset.columns[1].values.every((v, i) => Object.is(v, yv[i]) || v === yv[i]), `Signal generator: an R(RC) circuit's impedance; noise at 20 dB SNR (SD ${sd.toFixed(4)}, expected ${(Math.SQRT1_2 / 10).toFixed(4)}); 10 % missing; the same seed, the same signal`);
  // the node's graph: the noisy signal as dots on the clean one; the C–V curves one a temperature; Nyquist and Bode
  const gcv = generate({ ...SIGGEN_DEFAULTS, kind: 'cv' });
  const pz = typeof ez === 'string' ? [] : ez.plots;
  const ps = typeof g1 === 'string' ? undefined : g1.plots[0];
  ok(!!ps?.data && ps.result.y[5] === cl[5] && typeof gcv !== 'string' && gcv.plots[0].series?.length === 1 && gcv.plots[0].legend?.[0] === 'T = 14 K' && gcv.plots[0].series[0].name === 'T = 300 K' && pz.length === 3 && pz[0].xName === "Z' (Ω)" && Math.abs(pz[0].result.y[10] + zi) < 1e-9 * Math.abs(zi) && !!pz[1].logX && (typeof ez === 'string' ? '' : ez.labels.join()) === 'Nyquist,Bode |Z|,Bode phase', 'Signal generator: its graph (the signal on the clean one; a C–V curve a temperature; Nyquist and Bode for an impedance)');
}

{
  // C–V structures of the Signal generator, against references computed apart (scripts/fixtures/cv-ref.py) and the
  // literature: CV_ideal.m, the exact high-frequency theory, interface traps (and the high–low and Terman methods that
  // measure them), the series resistance correction, p–n and Schottky junctions, the SPICE junction, the MIM and
  // ferroelectric capacitors, the Mott–Schottky electrode and the Gouy–Chapman–Stern double layer
  type Arr = (number | null)[];
  const R = JSON.parse(readFileSync(new URL('./fixtures/cv-ref.json', import.meta.url), 'utf8')) as {
    ideal: { V: number[]; lf: number[]; hf: number[]; Cox: number };
    hfx: { lnR: number; v: number[]; C: number[] };
    traps: { s: number[]; Q: Record<string, number[]>; C: Record<string, number[]> };
    trapcurve: { V: number[]; lf: number[]; hf: number[] };
    pn: { V: number[]; vbi: number; abrupt: Arr; vbiGraded: number; graded: Arr; vbiSchottky: number; schottky: Arr };
    spice: { V: number[]; C: number[] };
    ferro: { V: number[]; up: number[]; down: number[]; Pup: number[]; Pdown: number[] };
    ms: { E: number[]; C: number[] };
    gcs: { E: number[]; gc: number[]; gcs: number[]; phi: number[] };
  };
  const KB = 1.380649e-23;
  const QE = 1.602176634e-19;
  const EPS0 = 8.8541878128e-12;
  // the largest relative difference where both are numbers, and the same points empty in both
  const relDiff = (a: number[], b: Arr) => {
    if (a.length !== b.length || a.some((v, i) => Number.isFinite(v) !== (b[i] !== null && Number.isFinite(b[i])))) return Infinity;
    return Math.max(0, ...a.flatMap((v, i) => (Number.isFinite(v) ? [Math.abs(v - (b[i] as number)) / Math.abs(b[i] as number)] : [])));
  };
  const base: CvSpec = { ...SIGGEN_DEFAULTS.cv };
  const made = (c: Partial<CvSpec>) => {
    const m = cvMake({ ...base, ...c });
    if (typeof m === 'string') throw new Error(m);
    return m;
  };
  const curveOf = (c: CvSpec, T: number, V: number[], mode: 'deep' | 'lf' | 'hf') => {
    const m = mosCurve(c, T, V, mode);
    if (typeof m === 'string') throw new Error(m);
    return m;
  };
  // a straight line through (x, y): slope, intercept
  const line = (x: number[], y: number[]) => {
    const n = x.length;
    const [mx, my] = [x.reduce((a, b) => a + b, 0) / n, y.reduce((a, b) => a + b, 0) / n];
    const b = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / x.reduce((a, v) => a + (v - mx) ** 2, 0);
    return { b, a: my - b * mx };
  };

  // CV_ideal.m: n-type, nᵢ typed (5·10⁻³ m⁻³), V_FB = 0; low frequency, and high frequency held at 2.10|u_B| + 1.33
  const ideal: CvSpec = { ...base, type: 'n', dop: 1e16, epsS: 9.7, epsOx: 3.9, tox: 39.74, area: 1, vfbFrom: 'typed', vfb: 0, niFrom: 'typed', ni: 5e-9, hfMin: 'fit', ditShape: 'none' };
  const dIdeal = [relDiff(curveOf(ideal, 300, R.ideal.V, 'lf').c, R.ideal.lf), relDiff(curveOf(ideal, 300, R.ideal.V, 'hf').c, R.ideal.hf)];
  ok(dIdeal.every((d) => d < 1e-9), `C–V, MOS: as CV_ideal.m, its band bending solved at every one of 1001 gate voltages (scipy brentq): low frequency ${dIdeal[0].toExponential(1)}, high frequency (held below 2.10|u_B| + 1.33 kT/q) ${dIdeal[1].toExponential(1)}`);

  // the exact high-frequency theory (the majority carriers respond, the minority ones' charge does not): the Riccati
  // equation in v against the linearized Poisson equation integrated in x (scipy solve_ivp, DOP853)
  const Yx = hfExactTable(R.hfx.lnR, -70, 10);
  const dHf = Math.max(...R.hfx.v.map((v, i) => Math.abs(-Yx(v) - R.hfx.C[i]) / R.hfx.C[i]));
  // (no minority carriers: the deep depletion's capacitance, (1 − e^v)/√(2(e^v − v − 1)) exactly)
  const Y0 = hfExactTable(-1e4, -60, 10);
  const dd = (v: number) => Math.abs(Math.expm1(v)) / Math.sqrt(2 * (Math.expm1(v) - v));
  const dDeep = Math.max(...[-50, -20, -5, -1, -0.1, 0.1, 1, 5].map((v) => Math.abs(-Y0(v) - dd(v)) / dd(v)));
  ok(dHf < 1e-6 && dDeep < 1e-7, `C–V, MOS: the exact high-frequency capacitance (Lindner 1962; Brews 1974) as the linearized Poisson equation in x on the equilibrium profile (scipy solve_ivp) to ${dHf.toExponential(1)} from depletion to strong inversion and accumulation; with no minority carriers, the deep depletion's own (${dDeep.toExponential(1)})`);

  // its minimum against the two shortcuts: the depletion width at 2φ_B (Sze) and CV_ideal.m's 2.10|u_B| + 1.33
  const minOf = (c: CvSpec, h: 'sze' | 'fit' | 'exact') => curveOf({ ...c, hfMin: h }, 300, [c.type === 'n' ? -8 : 8], 'hf').c[0];
  const si: CvSpec = { ...base, type: 'p', dop: 1e16, epsS: 11.7, epsOx: 3.9, tox: 20, eg: 1.12, mc: 1.08, mv: 0.81, area: 1, vfbFrom: 'typed', vfb: 0, niFrom: 'typed', ni: 1e10, ditShape: 'none' };
  const sic: CvSpec = { ...base, type: 'n', dop: 1e16, tox: 14, area: 1, vfbFrom: 'typed', vfb: 1, niFrom: 'masses', ditShape: 'none' };
  const devs = [si, sic].map((c) => {
    const ex = minOf(c, 'exact');
    return [minOf(c, 'sze') / ex - 1, minOf(c, 'fit') / ex - 1];
  });
  const pc = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)} %`;
  ok(devs.every(([sz, ft]) => sz > 0 && Math.abs(ft) < sz), `C–V, MOS: the high-frequency minimum against the exact theory, Si (p, 10¹⁶ cm⁻³, 20 nm SiO₂): at 2φ_B (Sze) ${pc(devs[0][0])}, CV_ideal.m ${pc(devs[0][1])}; 4H-SiC (n, 10¹⁶, 14 nm): ${pc(devs[1][0])}, ${pc(devs[1][1])} (the depletion approximation at 2φ_B above it, CV_ideal.m's nearer)`);

  // interface traps: their charge and capacitance (Gauss–Legendre on the Fermi function's pieces) against scipy quad
  const tr = trapsOf({ ...base, eg: 1.12, ditShape: 'u', dit: 2e11, ditEdge: 1e13, ditW: 0.1 })!;
  const dTr = Math.max(
    ...[300, 77].flatMap((T) =>
      R.traps.s.flatMap((s, i) => {
        const ph = (KB * T) / QE;
        const [q, c] = [R.traps.Q[String(T)][i], R.traps.C[String(T)][i]];
        // (against the largest of each: the charge passes 0 at mid-gap, the capacitance far beyond the gap)
        const [qMax, cMax] = [Math.max(...R.traps.Q[String(T)].map(Math.abs)), Math.max(...R.traps.C[String(T)])];
        return [Math.abs(tr.charge(s, ph) - q) / qMax, Math.abs(tr.cap(s, ph) - c) / cMax];
      }),
    ),
  );
  // the curve they make (U-shaped D_it on Si): at the gate voltages of chosen band bendings
  const siT: CvSpec = { ...si, type: 'n', ditShape: 'u', dit: 2e11, ditEdge: 1e13, ditW: 0.1, hfMin: 'sze' };
  const dTc = [relDiff(curveOf(siT, 300, R.trapcurve.V, 'lf').c, R.trapcurve.lf), relDiff(curveOf(siT, 300, R.trapcurve.V, 'hf').c, R.trapcurve.hf)];
  ok(dTr < 1e-8 && dTc.every((d) => d < 1e-8), `C–V, MOS: interface traps (U-shaped, donors below mid-gap, acceptors above), their charge and capacitance at 300 K and 77 K as scipy quad over the Fermi function (${dTr.toExponential(1)}); the low- and high-frequency curves they stretch (${dTc.map((d) => d.toExponential(1)).join(', ')})`);

  // the two methods that measure them (Schroder, Semiconductor Material and Device Characterization, ch. 6): high–low
  // (Castagné & Vapaille 1971) and Terman (1962), on a constant D_it of 5·10¹¹ cm⁻² eV⁻¹, in depletion
  const siC: CvSpec = { ...siT, ditShape: 'const', dit: 5e11 };
  const Vd = Array.from({ length: 81 }, (_, i) => -0.6 + i * 0.02);
  const [cl, chf] = [curveOf(siC, 300, Vd, 'lf'), curveOf(siC, 300, Vd, 'hf')];
  const cox = cl.cox;
  const inDep = Vd.flatMap((_, i) => (cl.psi[i] < -0.15 && cl.psi[i] > -0.55 ? [i] : []));
  const hiLo = inDep.map((i) => (1 / (1 / cl.c[i] - 1 / cox) - 1 / (1 / chf.c[i] - 1 / cox)) / (QE * 1e-6) / 1e4);
  // Terman: the ideal high-frequency curve gives ψs of every C; ΔV(ψs) = V − V_ideal; D_it = (C_ox/qA)·dΔV/dψs
  const Vi = Array.from({ length: 8001 }, (_, i) => -2 + i * 0.0005);
  const ideal2 = curveOf({ ...siC, ditShape: 'none' }, 300, Vi, 'hf');
  const atC = (c: number) => {
    const k = Math.max(1, ideal2.c.findIndex((q, i) => i > 0 && ideal2.psi[i] < -0.05 && (q - c) * (ideal2.c[i - 1] - c) <= 0));
    const f = (c - ideal2.c[k - 1]) / (ideal2.c[k] - ideal2.c[k - 1]);
    return { v: Vi[k - 1] + f * (Vi[k] - Vi[k - 1]), psi: ideal2.psi[k - 1] + f * (ideal2.psi[k] - ideal2.psi[k - 1]) };
  };
  const tm = inDep.map((i) => ({ dv: Vd[i] - atC(chf.c[i]).v, psi: atC(chf.c[i]).psi }));
  const terman = tm.slice(1).map((p, j) => ((cox / (QE * 1e-6)) * ((p.dv - tm[j].dv) / (p.psi - tm[j].psi))) / 1e4);
  const errHL = Math.max(...hiLo.map((d) => Math.abs(d / 5e11 - 1)));
  const errT = Math.max(...terman.map((d) => Math.abs(d / 5e11 - 1)));
  ok(inDep.length > 10 && errHL < 0.01 && errT < 0.01, `C–V, MOS: the high–low method (Castagné & Vapaille 1971) gives back the D_it typed to ${(errHL * 100).toFixed(3)} %, Terman's (1962) to ${(errT * 100).toFixed(3)} %, over ${inDep.length} voltages in depletion`);

  // the series resistance and the leak: the correction of Nicollian & Brews (Schroder, ch. 6) gives back C and G
  const corr = [1e-12, 1e-10, 1e-9].flatMap((C) =>
    [
      [50, 0, 1e5],
      [500, 1e-6, 1e6],
      [10, 1e-4, 1e3],
    ].map(([rs, gl, f]) => {
      const m = measured(C, rs, gl, f);
      const w = 2 * Math.PI * f;
      const M = m.g * m.g + w * w * m.c * m.c;
      const a = m.g - M * rs;
      return Math.max(Math.abs((M * m.c) / (a * a + w * w * m.c * m.c) / C - 1), Math.abs((M * a) / (a * a + w * w * m.c * m.c) - gl) / Math.max(gl, 1e-12));
    }),
  );
  ok(Math.max(...corr) < 1e-7, `C–V: measured in parallel mode through R_s with a leak G, Nicollian and Brews's correction gives back C and G (${Math.max(...corr).toExponential(1)})`);

  // p–n junctions and the Schottky diode (Si, 300 K): as the reference, and their lines (Sze & Ng, ch. 2 and 3)
  const siJ: Partial<CvSpec> = { epsS: 11.7, eg: 1.12, mc: 1.08, mv: 0.81, niFrom: 'typed', ni: 1e10, temps: '300', area: 1, vFrom: -5, vTo: 0.5, points: 111, rs: 0, gl: 0 };
  const ab = made({ ...siJ, struct: 'pn', na: 1e18, nd: 1e16, profile: 'abrupt' }).sets[0].c;
  const gr = made({ ...siJ, struct: 'pn', profile: 'graded', grad: 1e20 }).sets[0].c;
  const sk = made({ ...siJ, struct: 'schottky', type: 'n', dop: 1e16, barrierFrom: 'typed', phiB: 0.8 }).sets[0].c;
  const dJ = [relDiff(ab, R.pn.abrupt), relDiff(gr, R.pn.graded), relDiff(sk, R.pn.schottky)];
  const vg = gradedVbi(1e28, EPS0 * 11.7, (KB * 300) / QE, Math.log(1e16));
  const phiT = (KB * 300) / QE;
  const es = EPS0 * 11.7;
  // 1/C² against V: its slope −2/(qεN·A²) and where it meets 0, V_bi − 2kT/q (abrupt) or V_bi − kT/q (Schottky);
  // 1/C³ of the graded one meets 0 at V_bi
  const rev = R.pn.V.flatMap((v, i) => (v < -0.5 ? [i] : []));
  const lnAb = line(rev.map((i) => R.pn.V[i]), rev.map((i) => 1 / ab[i] ** 2));
  const lnSk = line(rev.map((i) => R.pn.V[i]), rev.map((i) => 1 / sk[i] ** 2));
  const lnGr = line(rev.map((i) => R.pn.V[i]), rev.map((i) => 1 / gr[i] ** 3));
  const nEff = 2 / (QE * es * 1e-12 * -lnAb.b) / 1e6;
  const nSk = 2 / (QE * es * 1e-12 * -lnSk.b) / 1e6;
  const lines = [nEff / ((1e18 * 1e16) / (1e18 + 1e16)) - 1, -lnAb.a / lnAb.b - (R.pn.vbi - 2 * phiT), nSk / 1e16 - 1, -lnSk.a / lnSk.b - (R.pn.vbiSchottky - phiT), -lnGr.a / lnGr.b - R.pn.vbiGraded];
  ok(dJ.every((d) => d < 1e-12) && Math.abs(vg - R.pn.vbiGraded) < 1e-12 && lines.every((d) => Math.abs(d) < 1e-9), `C–V: p–n junctions (abrupt; linearly graded, V_bi ${R.pn.vbiGraded.toFixed(4)} V self-consistent as scipy brentq) and a Schottky diode as Sze and Ng (${dJ.map((d) => d.toExponential(1)).join(', ')}); their 1/C² lines give back N_eff and V_bi − 2kT/q, N_D and V_bi − kT/q, 1/C³ of the graded one V_bi`);

  // the SPICE junction capacitance; with M = ½ and V_J = V_bi − 2kT/q it is the abrupt junction; continuous at F_C·V_J
  const sp = made({ struct: 'varactor', cj0: 10, vj: 0.7, mj: 0.4, fc: 0.5, vFrom: -10, vTo: 1, points: 221, rs: 0, gl: 0 }).sets[0].c;
  const vjA = R.pn.vbi - 2 * phiT;
  const asAb = made({ struct: 'varactor', cj0: (R.pn.abrupt[R.pn.V.indexOf(0)] as number) * 1e12, vj: vjA, mj: 0.5, fc: 0.95, vFrom: -5, vTo: 0.5, points: 111, rs: 0, gl: 0 }).sets[0].c;
  const cont = made({ struct: 'varactor', cj0: 10, vj: 0.7, mj: 0.4, fc: 0.5, vFrom: 0.35 - 1e-9, vTo: 0.35 + 1e-9, points: 2, rs: 0, gl: 0 }).sets[0].c;
  ok(relDiff(sp, R.spice.C) < 1e-12 && relDiff(asAb, R.pn.abrupt) < 1e-12 && Math.abs(cont[1] / cont[0] - 1) < 1e-8, 'C–V: the SPICE junction capacitance C_J0(1 − V/V_J)^−M, linear beyond F_C·V_J (SPICE2, Nagel 1975) as the reference; with M = ½, V_J = V_bi − 2kT/q, the abrupt junction; continuous at F_C·V_J');

  // the MIM capacitor: C₀ = ε₀εA/d, its voltage coefficients given back by a quadratic
  const mim = made({ struct: 'mim', epsI: 7, tins: 50, area: 1, vcc1: 20, vcc2: 50, vFrom: -10, vTo: 10, points: 201, rs: 0, gl: 0 });
  const c0 = (EPS0 * 7 * 1e-6) / 50e-9;
  const mc = mim.sets[0].c;
  const qa = (mc[200] + mc[0] - 2 * mc[100]) / (2 * 100) / c0 / 1e-6;
  const qb = (mc[200] - mc[0]) / 20 / c0 / 1e-6;
  ok(Math.abs(mc[100] / c0 - 1) < 1e-14 && Math.abs(qa - 50) < 1e-6 && Math.abs(qb - 20) < 1e-6, `C–V: a MIM capacitor, C₀ = ε₀εA/d and its voltage coefficients given back (${qb.toFixed(4)} ppm/V, ${qa.toFixed(4)} ppm/V²)`);

  // the ferroelectric capacitor (Miller et al. 1990): as the reference; P = ∓P_r at 0 V, 0 at ±V_c, C largest there
  const fe = made({ struct: 'ferro', ps: 30, pr: 25, ec: 50, tf: 200, epsB: 100, area: 0.01, vFrom: -8, vTo: 8, points: 401, rs: 0, gl: 0 });
  const [up, dn] = fe.sets;
  const P = (s: typeof up) => s.extra![0].v;
  const iAt = (v: number) => R.ferro.V.findIndex((q) => Math.abs(q - v) < 1e-9);
  const iMax = (a: number[]) => a.indexOf(Math.max(...a));
  const dFe = Math.max(relDiff(up.c, R.ferro.up), relDiff(dn.c, R.ferro.down), ...[0, 100, 300, 400].map((i) => Math.abs(P(up)[i] - R.ferro.Pup[i]) / 30), ...[0, 100, 300, 400].map((i) => Math.abs(P(dn)[i] - R.ferro.Pdown[i]) / 30));
  ok(dFe < 1e-12 && Math.abs(P(up)[iAt(0)] + 25) < 1e-9 && Math.abs(P(dn)[iAt(0)] - 25) < 1e-9 && Math.abs(P(up)[iAt(1)]) < 1e-9 && Math.abs(P(dn)[iAt(-1)]) < 1e-9 && iMax(up.c) === iAt(1) && iMax(dn.c) === iAt(-1), 'C–V: a ferroelectric capacitor as Miller, Nasby, Schwank, Rodgers and Dressendorfer (1990): its butterfly up and down as the reference; P = ∓P_r at 0 V, 0 at the coercive voltage, where C is largest');

  // the semiconductor electrode: as Poisson's equation with the Helmholtz layer (the potential split by scipy
  // brentq); without it, the Mott–Schottky line gives back N_D and E_fb + kT/q (Gelderman, Lee and Donne 2007)
  const msSpec: Partial<CvSpec> = { struct: 'ms', type: 'n', dop: 1e18, epsS: 31, efb: -0.5, ch: 20, temps: '298.15', area: 100, vFrom: -0.8, vTo: 1.5, points: 93, rs: 0, gl: 0 };
  const dMs = relDiff(made(msSpec).sets[0].c, R.ms.C);
  const bare = made({ ...msSpec, ch: 0 });
  const dep = R.ms.E.flatMap((e, i) => (e > -0.2 && e < 1.5 ? [i] : []));
  const ms = line(dep.map((i) => R.ms.E[i]), dep.map((i) => 1 / bare.sets[0].c[i] ** 2));
  const nD = 2 / (QE * EPS0 * 31 * 1e-8 * ms.b) / 1e6;
  const e0 = -ms.a / ms.b - (-0.5 + (KB * 298.15) / QE);
  ok(dMs < 1e-9 && Math.abs(nD / 1e18 - 1) < 1e-3 && Math.abs(e0) < 1e-3, `C–V: a semiconductor electrode with its Helmholtz layer as the reference (${dMs.toExponential(1)}); without it, the Mott–Schottky line (Gelderman, Lee and Donne 2007) gives N_D ${(nD / 1e18).toFixed(5)}·10¹⁸ cm⁻³ (10¹⁸ typed) and E_fb + kT/q to ${Math.abs(e0 * 1000).toFixed(4)} mV`);

  // the double layer: as the reference (Gouy–Chapman, and with its Stern layer); Bard and Faulkner's numbers for water
  // at 25 °C: C_d = 228.5·z·√C*·cosh(19.5·z·φ₀) µF/cm², and the Debye length 3.04 nm (0.01 M), 0.962 nm (0.1 M)
  const gSpec: Partial<CvSpec> = { struct: 'gcs', conc: 0.01, z: 1, epsW: 78.49, epzc: 0, temps: '298.15', area: 100, vFrom: -0.4, vTo: 0.4, points: 81, rs: 0, gl: 0, psi: true };
  const gc = made({ ...gSpec, ch: 0 }).sets[0];
  const gs = made({ ...gSpec, ch: 20 }).sets[0];
  const dPhi = Math.max(...gs.extra![0].v.map((v, i) => Math.abs(v - R.gcs.phi[i])));
  const dG = [relDiff(gc.c, R.gcs.gc), relDiff(gs.c, R.gcs.gcs)];
  const bf = [0, 0.05, -0.05, 0.1].map((p) => {
    const i = R.gcs.E.findIndex((e) => Math.abs(e - p) < 1e-9);
    return gc.c[i] / 1e-6 / (228.5 * Math.sqrt(0.01) * Math.cosh(19.5 * p)) - 1;
  });
  const debye = (cM: number) => (EPS0 * 78.49 * 1e-4) / made({ ...gSpec, ch: 0, conc: cM, vFrom: 0, vTo: 0, points: 2 }).sets[0].c[0] / 1e-9;
  const [l1, l2] = [debye(0.01) / 3.04 - 1, debye(0.1) / 0.962 - 1];
  ok(dG.every((d) => d < 1e-9) && dPhi < 1e-12 && bf.every((d) => Math.abs(d) < 0.005) && Math.abs(l1) < 0.002 && Math.abs(l2) < 0.002, `C–V: the Gouy–Chapman and Gouy–Chapman–Stern double layers as the reference (${dG.map((d) => d.toExponential(1)).join(', ')}; the diffuse layer's potential to ${dPhi.toExponential(1)} V); Bard and Faulkner's 228.5·z·√C*·cosh(19.5·z·φ₀) µF/cm² to ${(Math.max(...bf.map(Math.abs)) * 100).toFixed(2)} % (its rounded constants), the Debye lengths 3.04 and 0.962 nm to ${(Math.max(Math.abs(l1), Math.abs(l2)) * 100).toFixed(2)} %`);

  // the table made: its columns, the units, the graphs (C, 1/C², W, G_m, the more columns)
  const g = generate({ ...SIGGEN_DEFAULTS, kind: 'cv', cv: { ...base, struct: 'pn', na: 1e18, nd: 1e16, temps: '300', vFrom: -5, vTo: 0, points: 51, inv2: true, width: true, rs: 10, gl: 0, freq: 1e5, unit: 'nF/cm2' } });
  const gf = generate({ ...SIGGEN_DEFAULTS, kind: 'cv', cv: { ...base, struct: 'ferro', vFrom: -8, vTo: 8, points: 81, unit: 'pF', area: 0.01 } });
  const gn = generate({ ...SIGGEN_DEFAULTS, kind: 'cv', cv: { ...base, mode: 'lfhf', temps: '300', unit: 'norm' } });
  const names = (r: typeof g) => (typeof r === 'string' ? r : r.dataset.columns.map((c) => c.name).join(' / '));
  ok(names(g) === 'V (V) / C (nF/cm²) / G_m (S) / 1/C² (cm⁴/nF²) / W (nm)' && names(gf) === 'V (V) / C (pF), up / P (µC/cm²), up / C (pF), down / P (µC/cm²), down' && names(gn) === 'V_G (V) / C/C_ox, LF / C/C_ox, HF' && typeof g !== 'string' && g.labels.join() === 'C–V,G_m (S),1/C² (cm⁴/nF²),W (nm)' && typeof gf !== 'string' && gf.labels.join() === 'C–V,P (µC/cm²)' && typeof gn !== 'string' && Math.abs(gn.dataset.columns[1].values[0] - 1) < 0.01, `C–V: the table made (${names(g)}; ${names(gf)}; ${names(gn)}) and its graphs`);
}

{
  // numbers in scientific notation (the generator's dopings, densities, frequencies): written short when very large
  // or very small, and read from the ways they are typed
  const forms = ['1e16', '1E16', '1x10^16', '1*10^16', '1×10^16', '1·10¹⁶', '10^16', '10¹⁶', ' 1 e16 ', '1.0e+16'];
  const small = ['5e-9', '5x10^-9', '5·10⁻⁹', '5,0e-9'];
  const bad = ['', 'abc', '1e', '1x10', '10^', '1e16x', '--1'];
  ok(forms.every((f) => parseSci(f) === 1e16) && small.every((f) => Math.abs(parseSci(f) / 5e-9 - 1) < 1e-15) && bad.every((f) => Number.isNaN(parseSci(f))) && parseSci('2.5e18') === 2.5e18 && parseSci('-3') === -3, 'Scientific numbers: 1e16, 1E16, 1x10^16, 1*10^16, 1·10¹⁶, 10^16 and a decimal comma read alike; what is none of them, not a number');
  ok(sciText(1e16) === '1e16' && sciText(2.5e18) === '2.5e18' && sciText(5e-9) === '5e-9' && sciText(1e-6) === '1e-6' && sciText(100) === '100' && sciText(0.01) === '0.01' && sciText(0) === '0' && sciText(1e5) === '1e5' && sciText(0.1 + 0.2) === '0.3' && sciPretty(1e16) === '1·10¹⁶' && sciPretty(-2.5e-9) === '-2.5·10⁻⁹' && sciPretty(42) === '42' && [1e16, 2.5e18, 5e-9, 123456.789, 3e-7].every((v) => parseSci(sciText(v)) === v), 'Scientific numbers: written short only when very large or very small (1e16, 5e-9; 100, 0.01 as they are), and read back the same');
}

// the version shown in the app is package.json's
ok(APP_VERSION === (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version, `the app's version (${APP_VERSION}) as package.json's`);
// the citation: the app's (Cite), CITATION.cff's and the README's one DOI and version
{
  const cff = readFileSync(new URL('../CITATION.cff', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  ok(cff.includes(`version: "${APP_VERSION}"`) && cff.includes(`doi: "${DOI}"`) && CITE_APA.includes(`https://doi.org/${DOI}`) && CITE_BIBTEX.includes(`version   = {${APP_VERSION}}`) && readme.includes(CITE_APA), `the citation: the app's, CITATION.cff's and the README's (DOI ${DOI}, version ${APP_VERSION})`);
}

console.log(`${passed} passed, ${failed} failed`);
if (report) {
  const v = writeValidation(records, (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version);
  console.log(`VALIDATION.md: ${v.fixtures} against reference values, ${v.named} against named conventions, ${v.other} exact${v.unread.length ? `; scripts no check reads: ${v.unread.join(', ')}` : ''}`);
}
if (failed) process.exit(1);
function sdOfCut(v: number[]) {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}
function normalCdfOf(x: number, m: number, sd: number) {
  return 0.5 * (1 + erfApprox((x - m) / (sd * Math.SQRT2)));
}
function erfApprox(x: number) {
  // Abramowitz and Stegun 7.1.26 (enough for a check to 1e-7)
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

