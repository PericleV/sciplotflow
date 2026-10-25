import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLeaving } from './useLeaving.ts';
import {
  addEdge,
  Background,
  ConnectionLineType,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';
import { EngineContext, useEngine } from './engine/engine.ts';
import { canConnect, isMultiInput, PORT_COLORS, sourcePort, targetAccepts, type PortContext } from './engine/ports.ts';
import { KK_DEFAULTS, CONVERT_DEFAULTS, TRANSPOSE_DEFAULTS, STACK_DEFAULTS, TOSHEETS_DEFAULTS, MATCOMP_DEFAULTS, MATRIX_DEFAULTS, COLUMNS_DEFAULTS, PEAKWIDTH_DEFAULTS, AUTOEXTRACT_DEFAULTS, CANVAS_DEFAULTS, DRAWING_DEFAULTS, COMBINE_DEFAULTS, UNSTACK_DEFAULTS, WORKBOOK_DEFAULTS, CALCULUS_DEFAULTS, FILTER_DEFAULTS, CLEAN_DEFAULTS, SMOOTH_DEFAULTS, INTERP_DEFAULTS, NORMALIZE_DEFAULTS, FFT_DEFAULTS, CONV_DEFAULTS, AVERAGE_DEFAULTS, DIGITIZER_DEFAULTS, PHASE_DIGITIZER_DEFAULTS, EIS_DEFAULTS, IMAGE_DEFAULTS, PHASE_DEFAULTS, HISTOGRAM_DEFAULTS, BARCHART_DEFAULTS, BOXVIOLIN_DEFAULTS, PROBPLOT_DEFAULTS, BLANDALTMAN_DEFAULTS, PIE_DEFAULTS, CONTOUR_DEFAULTS, POLAR_DEFAULTS, SMITH_DEFAULTS, SCATTERMATRIX_DEFAULTS, TERNARY_DEFAULTS, WATERFALL_DEFAULTS, PLOT3D_DEFAULTS, CURVEMATH_DEFAULTS, TRANSLATE_DEFAULTS, PEAK_DEFAULTS, NORM_DEFAULTS, TTEST_DEFAULTS, ANOVA_DEFAULTS, NONPAR_DEFAULTS, CORR_DEFAULTS, PADJUST_DEFAULTS, CONTINGENCY_DEFAULTS, ROC_DEFAULTS, SURVIVAL_DEFAULTS, REGRESS_DEFAULTS, POWER_DEFAULTS, RESAMPLE_DEFAULTS, DISTFIT_DEFAULTS, AGREE_DEFAULTS, METHCOMP_DEFAULTS, LOGISTIC_DEFAULTS, BASELINE_DEFAULTS, FRAC_DEFAULTS, FRFT_DEFAULTS, WAVELET_DEFAULTS, WAVEFORM_DEFAULTS, STEPS_DEFAULTS, EVENTS_DEFAULTS, PICK_DEFAULTS, DATAMANIP_DEFAULTS, EXTRACT_DEFAULTS, FIT_DEFAULTS, GENCOL_DEFAULTS, IMPORT_DEFAULTS, MATHCOL_DEFAULTS, PYTHON_DEFAULTS, NOTE_DEFAULTS, NOTE_SIZE,PLOT1D_DEFAULTS, STATS_DEFAULTS } from './defaults.ts';
import { NODE_HELP, NODE_SHORT } from './help.ts';
import { DRAG_TYPE, NodePalette, type PaletteGroup } from './NodePalette.tsx';
// side panels: separate chunks, loaded when first opened
const ProjectsPanel = lazy(() => import('./ProjectsPanel.tsx').then((m) => ({ default: m.ProjectsPanel })));
const DocumentPanel = lazy(() => import('./DocumentPanel.tsx').then((m) => ({ default: m.DocumentPanel })));
const HelpWindow = lazy(() => import('./HelpWindow.tsx').then((m) => ({ default: m.HelpWindow })));
const CollabPanel = lazy(() => import('./CollabPanel.tsx').then((m) => ({ default: m.CollabPanel })));
import { download } from './figure/export.ts';
import { PALETTE } from './figure/spec.ts';
import { ContextMenu, type MenuAction, type MenuItem, type MenuState } from './ContextMenu.tsx';
import { groupNodes, releaseChildren, removeFromGroup, ungroup } from './groups.ts';
import { useHistory } from './history.ts';
import { Inspector } from './Inspector.tsx';
import type { DataTarget } from './DataInspect.tsx';
import { hasPanel } from './nodes/inspectorStore.ts';
import { editCaption } from './nodes/captionStore.ts';
import { FlowEdge } from './FlowEdge.tsx';
import { withShell } from './nodes/NodeShell.tsx';
import { FrameNodeView } from './nodes/FrameNode.tsx';
import { applyColors, applyNotePage, applyTheme, getNotePage, loadColors, loadPrefs, loadTheme, myColor, myName, savePrefs, STEPS, welcomeAtStart, type CanvasPrefs, type Theme, type UiColors } from './theme.ts';
import { ColorChoice } from './ColorChoice.tsx';
import { hasRefs, withTexts } from './textStore.ts';
import { libGet, libMigrate, libPut } from './library.ts';
import { TopCredit, Welcome } from './Welcome.tsx';
import { TourPanel } from './tour/TourPanel.tsx';
import { RecordLayer, type RecordExtra } from './tour/RecordLayer.tsx';
import { loadTourProgress, placeOf, saveTourProgress, TOURS, wireEdge, withAdded, type TourApi } from './tour/tours.ts';
import type { CollabSession } from './collab/session.ts';
import { PresenceLayer } from './collab/PresenceLayer.tsx';
import { colorOf } from './collab/presence.ts';
import { allowProject, distrustProject, openProject } from './python/runner.ts';
import { PythonNodeView } from './nodes/PythonNode.tsx';
import { autosave, decodeProject, encodeProject, keepLastSession, parseProject, PROJECT_VERSION, saveToBrowser, stringifyProject, toProject, type Project } from './project.ts';
import { EDITABLE_FIGURES, fileProject, newProjectId, openEmbedded, projectRevision, type FigureRef } from './figure/embed.ts';
import { ProjectInfoContext } from './projectInfo.ts';
import { DataManipNodeView } from './nodes/DataManipNode.tsx';
import { FitNodeView } from './nodes/FitNode.tsx';
import { ColumnsNodeView, AutoExtractNodeView, ExtractNodeView, GenColNodeView, ImportNodeView, MathColNodeView } from './nodes/DataNodes.tsx';
import { StatsNodeView } from './nodes/StatsNodes.tsx';
import { CanvasNodeView, Plot1DNodeView } from './nodes/FigureNodes.tsx';
import { DrawingNodeView } from './nodes/DrawingNode.tsx';
import { NoteNodeView } from './nodes/NoteNode.tsx';
import { PeakWidthNodeView } from './nodes/PeakWidthNode.tsx';
import { CombineNodeView, UnstackNodeView } from './nodes/ReshapeNodes.tsx';
import { ConvertNodeView, StackNodeView, ToSheetsNodeView, TransposeNodeView } from './nodes/TableShapeNodes.tsx';
import { WorkbookNodeView } from './nodes/WorkbookNode.tsx';
import { CalculusNodeView } from './nodes/CalculusNode.tsx';
import { PickNodeView } from './nodes/PickNode.tsx';
import { PeakNodeView } from './nodes/PeakNode.tsx';
import { TranslateNodeView } from './nodes/CurveNodes.tsx';
import { CurveMathNodeView } from './nodes/CurveMathNode.tsx';
import { CleanNodeView, FilterNodeView } from './nodes/CleanNodes.tsx';
import { DigitizerNodeView } from './nodes/DigitizerNode.tsx';
import { PhaseDigitizerNode as PhaseDigitizerNodeView } from './nodes/PhaseDigitizerNode.tsx';
import { EisNodeView } from './nodes/EisNode.tsx';
import { ImageNodeView } from './nodes/ImageNode.tsx';
import { PhaseNodeView } from './nodes/PhaseNode.tsx';
import { HistogramNodeView } from './nodes/HistogramNode.tsx';
import { BarChartNodeView } from './nodes/BarChartNode.tsx';
import { BoxViolinNodeView } from './nodes/BoxViolinNode.tsx';
import { ProbPlotNodeView } from './nodes/ProbPlotNode.tsx';
import { BlandAltmanNodeView } from './nodes/BlandAltmanNode.tsx';
import { PieNodeView } from './nodes/PieNode.tsx';
import { ContourNodeView } from './nodes/ContourNode.tsx';
import { PolarNodeView } from './nodes/PolarNode.tsx';
import { SmithNodeView } from './nodes/SmithNode.tsx';
import { ScatterMatrixNodeView } from './nodes/ScatterMatrixNode.tsx';
import { TernaryNodeView } from './nodes/TernaryNode.tsx';
import { WaterfallNodeView } from './nodes/WaterfallNode.tsx';
import { Plot3DNodeView } from './nodes/Plot3DNode.tsx';
import { MatCompNodeView, MatrixNodeView } from './nodes/MatrixNodes.tsx';
import { AverageNodeView, ConvNodeView, FFTNodeView, InterpNodeView, KramersKronigNodeView, NormalizeNodeView, SmoothNodeView } from './nodes/SignalNodes.tsx';
import { AnovaNodeView, CorrNodeView, NonparNodeView, NormNodeView, TTestNodeView } from './nodes/TestNodes.tsx';
import { ContingencyNodeView, PAdjustNodeView, RegressNodeView, RocNodeView, SurvivalNodeView } from './nodes/StatNodes2.tsx';
import { AgreeNodeView, DistFitNodeView, LogisticNodeView, MethCompNodeView, PowerNodeView, ResampleNodeView } from './nodes/StatNodes3.tsx';
import { BaselineNodeView } from './nodes/BaselineNode.tsx';
import { FracNodeView, FrftNodeView } from './nodes/FracNodes.tsx';
import { WaveletNodeView } from './nodes/WaveletNode.tsx';
import { WaveformNodeView, StepsNodeView, EventsNodeView } from './nodes/SignalNodes2.tsx';
import { RerouteNodeView } from './nodes/RerouteNode.tsx';
import { BatchFileBar, BatchStepBar, GroupInNodeView, GroupNodeView, GroupOutNodeView } from './nodes/GroupNodes.tsx';
import { GroupNavContext } from './nodes/groupNav.ts';
import { forgetTemplate, listTemplates, saveTemplate, templateById, useTemplates } from './nodes/templates.ts';
import { asBatch, composeRoot, emptyBatch, makeGroup, NEW_OUT, ungroupNode, type Level } from './engine/subgraph.ts';
import type { NodeResult } from './engine/evaluate.ts';
import { canPaste, copySettings, pastedData, useClipboard } from './nodes/clipboard.ts';
import { clearDefaultStyle, defaultStyleFor, forgetStyle, saveStyle, setDefaultStyle, styledData, stylesFor, userStylesFor, withDefaultStyle } from './nodes/styles.ts';
import { FRAME_COLORS, GROUP_COLORS, NODE_COLORS, nodeColor, nodeDisplayName, nodeTitle } from './nodeColors.ts';
import { eachSteps, portNames, tidyOwn, type BatchOwn, type BatchSpec } from './engine/batch.ts';
import { FindNode } from './FindNode.tsx';
import { PlotColumnsDialog, type PlotChoice } from './PlotColumnsDialog.tsx';
import { buildFigure } from './plotBuild.ts';
import { readFiles } from './readFiles.ts';
import type { AppNode, NodeType } from './types.ts';
import { ArrowLeft, ArrowRight, CircleHelp, CornerDownRight, FilePlus2, FolderOpen, Grid3x3, Library, Link2, Map as MapIcon, Maximize, Monitor, Moon, Redo2, Save, Search, Spline, Sun, TableProperties, TriangleAlert, Undo2, Users } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';
import { ask as askUser, askText, notify } from './ui/dialogStore.ts';

const baseNodeTypes = {
  import: ImportNodeView,
  book: WorkbookNodeView,
  extract: ExtractNodeView,
  autoextract: AutoExtractNodeView,
  datamanip: DataManipNodeView,
  fit: FitNodeView,
  calculus: CalculusNodeView,
  pick: PickNodeView,
  peaks: PeakNodeView,
  curvemath: CurveMathNodeView,
  filterrows: FilterNodeView,
  clean: CleanNodeView,
  digitizer: DigitizerNodeView,
  phasedigitizer: PhaseDigitizerNodeView,
  eis: EisNodeView,
  image: ImageNodeView,
  phasediagram: PhaseNodeView,
  smooth: SmoothNodeView,
  interp: InterpNodeView,
  normalize: NormalizeNodeView,
  fft: FFTNodeView,
  convolve: ConvNodeView,
  kk: KramersKronigNodeView,
  average: AverageNodeView,
  translate: TranslateNodeView,
  normality: NormNodeView,
  ttest: TTestNodeView,
  anova: AnovaNodeView,
  nonparam: NonparNodeView,
  padjust: PAdjustNodeView,
  contingency: ContingencyNodeView,
  roc: RocNodeView,
  survival: SurvivalNodeView,
  regress: RegressNodeView,
  power: PowerNodeView,
  resample: ResampleNodeView,
  distfit: DistFitNodeView,
  agree: AgreeNodeView,
  methcomp: MethCompNodeView,
  logistic: LogisticNodeView,
  baseline: BaselineNodeView,
  fraccalc: FracNodeView,
  frft: FrftNodeView,
  wavelet: WaveletNodeView,
  waveform: WaveformNodeView,
  steps: StepsNodeView,
  events: EventsNodeView,
  correl: CorrNodeView,
  unstack: UnstackNodeView,
  convert: ConvertNodeView,
  transpose: TransposeNodeView,
  stack: StackNodeView,
  tosheets: ToSheetsNodeView,
  combine: CombineNodeView,
  mathcol: MathColNodeView,
  python: PythonNodeView,
  gencol: GenColNodeView,
  columns: ColumnsNodeView,
  peakwidth: PeakWidthNodeView,
  stats: StatsNodeView,
  plot1d: Plot1DNodeView,
  histogram: HistogramNodeView,
  barchart: BarChartNodeView,
  boxviolin: BoxViolinNodeView,
  probplot: ProbPlotNodeView,
  blandaltman: BlandAltmanNodeView,
  pie: PieNodeView,
  contour: ContourNodeView,
  polar: PolarNodeView,
  smith: SmithNodeView,
  scattermatrix: ScatterMatrixNodeView,
  ternary: TernaryNodeView,
  waterfall: WaterfallNodeView,
  plot3d: Plot3DNodeView,
  matrix: MatrixNodeView,
  matcomp: MatCompNodeView,
  canvas: CanvasNodeView,
  drawing: DrawingNodeView,
  note: NoteNodeView,
  subgraph: GroupNodeView,
  groupin: GroupInNodeView,
  groupout: GroupOutNodeView,
};
// every node inside the common frame (title bar, label, collapse, error mark); group frames draw themselves
const nodeTypes: NodeTypes = {
  ...(Object.fromEntries(Object.entries(baseNodeTypes).map(([k, V]) => [k, withShell(V as never)])) as NodeTypes),
  frame: FrameNodeView,
  reroute: RerouteNodeView,
};

const edgeTypes = { flow: FlowEdge };
// the files of data an Import node reads (dropped on the canvas: an Import node is made with them)
const DATA_FILE = /\.(csv|txt|tsv|dat|asc|prn|s\dp|snp|xlsx|xlsm|xlsb|xls|ods|fods)$/i;
const ERROR_RED = '#e5484d';
// Shift, Ctrl or Cmd + click adds a node to the selection (Shift + drag on the canvas: box selection)
const MULTI_KEYS = ['Shift', 'Control', 'Meta'];
const DELETE_KEYS = ['Delete', 'Backspace'];

// hidden: not offered in the nodes panel nor the canvas menu (the node still opens in saved projects)
// key: its id in the menus when two share a type (Rows to columns and Columns to rows)
type Template = { type: AppNode['type']; label: string; data: AppNode['data']; hidden?: boolean; key?: string };
// the Nodes panel's Batch: a group of no steps yet that runs on every file
const BATCH_NEW = 'batch:new';

const GROUPS: { name: keyof typeof GROUP_COLORS; items: Template[] }[] = [
  {
    name: 'Data',
    items: [
      { type: 'import', label: 'Import', data: IMPORT_DEFAULTS },
      { type: 'digitizer', label: 'Digitizer', data: DIGITIZER_DEFAULTS },
      { type: 'phasedigitizer', label: 'Phase digitizer', data: PHASE_DIGITIZER_DEFAULTS },
      { type: 'image', label: 'Image analysis', data: IMAGE_DEFAULTS },
      { type: 'book', label: 'Workbook', data: WORKBOOK_DEFAULTS },
      { type: 'extract', label: 'Extract column', data: EXTRACT_DEFAULTS },
      { type: 'autoextract', label: 'Sheets to columns', data: AUTOEXTRACT_DEFAULTS },
      { type: 'tosheets', label: 'Columns to sheets', data: TOSHEETS_DEFAULTS },
      { type: 'datamanip', label: 'Data manipulation', data: DATAMANIP_DEFAULTS },
      { type: 'mathcol', label: 'Math column', data: MATHCOL_DEFAULTS },
      { type: 'gencol', label: 'Generate column', data: GENCOL_DEFAULTS },
      { type: 'matrix', label: 'Matrix', data: MATRIX_DEFAULTS },
      { type: 'columns', label: 'Columns', data: COLUMNS_DEFAULTS },
      { type: 'unstack', label: 'Split into columns', data: UNSTACK_DEFAULTS },
      { type: 'stack', label: 'Stack columns', data: STACK_DEFAULTS },
      { type: 'transpose', label: 'Rows to columns', data: TRANSPOSE_DEFAULTS },
      { type: 'transpose', key: 'transpose:cols', label: 'Columns to rows', data: { ...TRANSPOSE_DEFAULTS, as: 'cols' } },
      { type: 'convert', label: 'Convert columns', data: CONVERT_DEFAULTS },
      { type: 'combine', label: 'Combine columns', data: COMBINE_DEFAULTS },
      { type: 'translate', label: 'Translate & resize', data: TRANSLATE_DEFAULTS },
      { type: 'filterrows', label: 'Filter & sort rows', data: FILTER_DEFAULTS },
      { type: 'clean', label: 'Clean data', data: CLEAN_DEFAULTS },
    ],
  },
  {
    name: 'Statistics',
    items: [
      { type: 'stats', label: 'Descriptive statistics', data: STATS_DEFAULTS },
      { type: 'normality', label: 'Normality & outliers', data: NORM_DEFAULTS },
      { type: 'ttest', label: 't-tests & variances', data: TTEST_DEFAULTS },
      { type: 'anova', label: 'ANOVA', data: ANOVA_DEFAULTS },
      { type: 'nonparam', label: 'Nonparametric tests', data: NONPAR_DEFAULTS },
      { type: 'correl', label: 'Correlation', data: CORR_DEFAULTS },
      { type: 'regress', label: 'Linear regression', data: REGRESS_DEFAULTS },
      { type: 'logistic', label: 'Logistic regression', data: LOGISTIC_DEFAULTS },
      { type: 'contingency', label: 'Contingency tables', data: CONTINGENCY_DEFAULTS },
      { type: 'survival', label: 'Survival (Kaplan–Meier)', data: SURVIVAL_DEFAULTS },
      { type: 'roc', label: 'ROC curve', data: ROC_DEFAULTS },
      { type: 'padjust', label: 'Adjust p-values', data: PADJUST_DEFAULTS },
      { type: 'distfit', label: 'Distribution fit', data: DISTFIT_DEFAULTS },
      { type: 'agree', label: 'Agreement & reliability', data: AGREE_DEFAULTS },
      { type: 'methcomp', label: 'Method comparison', data: METHCOMP_DEFAULTS },
      { type: 'resample', label: 'Bootstrap & permutation', data: RESAMPLE_DEFAULTS },
      { type: 'power', label: 'Power & sample size', data: POWER_DEFAULTS },
    ],
  },
  {
    name: 'Analysis',
    items: [
      { type: 'fit', label: 'Fit', data: FIT_DEFAULTS },
      { type: 'eis', label: 'Equivalent circuit (EIS)', data: EIS_DEFAULTS },
      { type: 'python', label: 'Python script', data: PYTHON_DEFAULTS },
      { type: 'calculus', label: 'Differentiate / Integrate', data: CALCULUS_DEFAULTS },
      { type: 'peaks', label: 'Peak analyzer', data: PEAK_DEFAULTS },
      { type: 'peakwidth', label: 'Peak width', data: PEAKWIDTH_DEFAULTS },
      { type: 'pick', label: 'Pick points', data: PICK_DEFAULTS },
      { type: 'curvemath', label: 'Curve math', data: CURVEMATH_DEFAULTS },
      { type: 'matcomp', label: 'Matrix computation', data: MATCOMP_DEFAULTS },
      { type: 'kk', label: 'Kramers–Kronig', data: KK_DEFAULTS },
      // hidden (2026-10-20): not offered for now; saved projects with it still open
      { type: 'phasediagram', label: 'Phase diagram', data: PHASE_DEFAULTS, hidden: true },
    ],
  },
  {
    name: 'Signal',
    items: [
      { type: 'smooth', label: 'Smooth', data: SMOOTH_DEFAULTS },
      { type: 'baseline', label: 'Baseline correction', data: BASELINE_DEFAULTS },
      { type: 'waveform', label: 'Waveform measurements', data: WAVEFORM_DEFAULTS },
      { type: 'steps', label: 'Step detection', data: STEPS_DEFAULTS },
      { type: 'events', label: 'Event averaging', data: EVENTS_DEFAULTS },
      { type: 'wavelet', label: 'Wavelet', data: WAVELET_DEFAULTS },
      { type: 'fraccalc', label: 'Fractional calculus', data: FRAC_DEFAULTS },
      { type: 'frft', label: 'Fractional FFT', data: FRFT_DEFAULTS },
      { type: 'interp', label: 'Interpolate / Extrapolate', data: INTERP_DEFAULTS },
      { type: 'normalize', label: 'Normalize', data: NORMALIZE_DEFAULTS },
      { type: 'fft', label: 'FFT', data: FFT_DEFAULTS },
      { type: 'convolve', label: 'Convolution', data: CONV_DEFAULTS },
      { type: 'average', label: 'Average curves', data: AVERAGE_DEFAULTS },
    ],
  },
  {
    name: 'Graph',
    items: [
      { type: 'plot1d', label: '1D plot', data: PLOT1D_DEFAULTS },
      { type: 'histogram', label: 'Histogram', data: HISTOGRAM_DEFAULTS },
      { type: 'barchart', label: 'Bar chart', data: BARCHART_DEFAULTS },
      { type: 'boxviolin', label: 'Box & violin', data: BOXVIOLIN_DEFAULTS },
      { type: 'pie', label: 'Pie chart', data: PIE_DEFAULTS },
      { type: 'waterfall', label: 'Waterfall', data: WATERFALL_DEFAULTS },
      { type: 'plot3d', label: '3D plot', data: PLOT3D_DEFAULTS },
      { type: 'contour', label: 'Contour / heatmap', data: CONTOUR_DEFAULTS },
      { type: 'polar', label: 'Polar / radar', data: POLAR_DEFAULTS },
      { type: 'smith', label: 'Smith chart', data: SMITH_DEFAULTS },
      // hidden for now (2026-10-16): to be worked on before it is offered again
      { type: 'scattermatrix', label: 'Scatter matrix', data: SCATTERMATRIX_DEFAULTS, hidden: true },
      { type: 'ternary', label: 'Ternary', data: TERNARY_DEFAULTS },
      { type: 'probplot', label: 'Probability plot', data: PROBPLOT_DEFAULTS },
      { type: 'blandaltman', label: 'Bland–Altman', data: BLANDALTMAN_DEFAULTS },
      { type: 'canvas', label: 'Merge plots', data: CANVAS_DEFAULTS },
      { type: 'drawing', label: 'Figure Drawing', data: DRAWING_DEFAULTS },
    ],
  },
  {
    name: 'Notes',
    items: [
      { type: 'note', label: 'Note', data: NOTE_DEFAULTS },
      { type: 'reroute', label: 'Reroute', data: {} },
    ],
  },
];

// The example projects are a separate chunk, loaded after the first render.
type ExampleList = { group: string; name: string; desc: string; make: () => Project }[];
const SHOW_SHARE_LINK = false;
const loadExamples = () => import('./examples.ts').then((m) => m.EXAMPLES as ExampleList);
// The page opens on the project left at the last visit (kept automatically; Projects: “Last session”).
const lastSession = keepLastSession();
const EMPTY: Project = { app: 'graph-flow', version: PROJECT_VERSION, nodes: [], edges: [] };
// a group's port named after its node's own name (a column's name, a label…), else the port, else the node type
const portLabel = (nd: AppNode, h: string | null | undefined) => {
  const d = nd.data as { name?: unknown; label?: unknown; caption?: unknown; column?: unknown };
  const own = [d.caption, d.name, d.label, d.column].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return own ?? (h && h !== 'out' && h !== 'in' ? h : nodeTitle(nd));
};
// recording mode: the page filmed for the README (scripts/gifs/record.ts), opened with ?record
const RECORD = new URLSearchParams(location.search).has('record');
const initial: Project = lastSession?.project ?? EMPTY;

// a project with Python code (in groups too)
const hasPython = (nodes: AppNode[]): boolean => nodes.some((n) => n.type === 'python' || (n.type === 'subgraph' && hasPython(n.data.nodes)));

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  // while working together, undo and redo are the session's (only the changes made here)
  const undoExt = useRef<{ undo: () => void; redo: () => void } | null>(null);
  const history = useHistory(nodes, edges, setNodes, setEdges, undoExt);
  // the project's title: the example loaded, the file opened, or typed in the toolbar
  const [projectName, setProjectName] = useState(initial.name ?? '');
  // the project's identity: kept by its saves, carried by its figures (a document's figures are found by it)
  const [projectId, setProjectId] = useState(initial.id ?? newProjectId());
  // the Python code of the project open at start: runs if it was allowed (or it has none)
  useEffect(() => openProject(projectId, !hasPython(initial.nodes)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [examples, setExamples] = useState<ExampleList>([]);
  useEffect(() => {
    document.title = `${projectName || 'Untitled project'} · SciPlotFlow`;
  }, [projectName]);
  const [panel, setPanel] = useState<'projects' | 'docs' | 'help' | 'collab' | null>(() => (location.hash.startsWith('#join=') ? 'collab' : null));
  // the welcome window: at start (unless turned off; not over a project opened from a link — shared, a session, an
  // invitation), from Help
  const [welcome, setWelcome] = useState(() => welcomeAtStart() && !RECORD && !/^#(p|c|join)=/.test(location.hash));
  // the clicks on the empty canvas (each folds the options panel when nothing is pinned there)
  const [paneClicks, setPaneClicks] = useState(0);
  // the clicks on a node (each unfolds the options panel, even when it was folded by hand)
  const [nodeClicks, setNodeClicks] = useState(0);
  // Inspect: on, a click on a node or a connection shows its data in the options panel; the data shown (pinned ones kept
  // while others are chosen)
  const [inspecting, setInspecting] = useState(false);
  const [dataTargets, setDataTargets] = useState<DataTarget[]>([]);
  const inspectData = (t: { kind: 'node' | 'edge'; id: string }) => {
    setDataTargets((ts) => [...ts.filter((x) => x.pinned && !(x.kind === t.kind && x.id === t.id)), { ...t, pinned: ts.some((x) => x.kind === t.kind && x.id === t.id && x.pinned) || undefined }]);
    setNodeClicks((k) => k + 1);
  };
  const togglePanel = (p: 'projects' | 'docs' | 'help' | 'collab') => setPanel((cur) => (cur === p ? null : p));
  // the panel on the right closed with an animation
  const { shown: shownPanel, closing: panelClosing } = useLeaving(panel);
  const { screenToFlowPosition, flowToScreenPosition, setCenter, getZoom, getInternalNode, fitBounds, fitView, getNodesBounds, getNodes, getNode, getEdges, setViewport, deleteElements, updateNodeData } = useReactFlow<AppNode>();
  const clipboard = useClipboard();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Find a node (Ctrl+F or the ⌕ button of the canvas controls)
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [prefs, setPrefs] = useState<CanvasPrefs>(loadPrefs);
  const setPref = (patch: Partial<CanvasPrefs>) => setPrefs((p) => savePrefs({ ...p, ...patch }));
  useEffect(() => applyTheme(theme), [theme]);
  const [colors, setColors] = useState<UiColors>(loadColors);
  useEffect(() => applyColors(colors), [colors]);
  useEffect(() => applyNotePage(getNotePage()), []);
  const openFile = useRef<HTMLInputElement>(null);

  // inside group nodes: the levels above the one shown (outermost first); the whole graph is put back together for
  // the evaluation and for saving
  const [stack, setStack] = useState<Level[]>([]);
  const root = useMemo(() => (stack.length ? composeRoot(stack, nodes, edges) : { nodes, edges }), [stack, nodes, edges]);
  const rootEngine = useEngine(root.nodes, root.edges);
  // the results of the nodes shown: inside a group, theirs are under `group/…` ids
  const engine = useMemo(() => {
    if (!stack.length) return rootEngine;
    const prefix = `${stack.map((l) => l.groupId).join('/')}/`;
    const results = new Map<string, NodeResult>();
    for (const [k, v] of rootEngine.results) if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) results.set(k.slice(prefix.length), v);
    return { ...rootEngine, results };
  }, [rootEngine, stack]);
  // what a figure node puts in its exported files: the whole project now, its id, the groups of the level shown
  const projectInfo = useMemo(() => ({ current: () => toProject(root.nodes, root.edges, projectName, projectId), id: projectId, path: stack.map((l) => l.groupId) }), [root, projectName, projectId, stack]);
  // the options panel: the node clicked (one selected) and the nodes pinned, of the level shown
  const [pins, setPins] = useState<string[]>([]);
  const selectedOne = useMemo(() => {
    const sel = nodes.filter((n) => n.selected);
    // (a group has no options, a Batch has: the names, the order, what failed)
    return sel.length === 1 && (hasPanel(sel[0].type) || (sel[0].type === 'subgraph' && !!sel[0].data.batch)) ? sel[0] : null;
  }, [nodes]);
  const pinnedNodes = useMemo(() => pins.flatMap((pid) => nodes.filter((n) => n.id === pid)), [pins, nodes]);
  const pin = (pid: string, on: boolean) => setPins((ps) => (on ? [...ps.filter((x) => x !== pid), pid] : ps.filter((x) => x !== pid)));
  const currentGroup = stack.length ? (stack[stack.length - 1].nodes.find((n) => n.id === stack[stack.length - 1].groupId) as Extract<AppNode, { type: 'subgraph' }> | undefined)?.data ?? null : null;
  // inside a Batch: its files (its own result, a level up) and the one its steps are shown on; another one chosen
  const batchView = stack.length && currentGroup?.batch ? rootEngine.results.get(stack.map((l) => l.groupId).join('/'))?.view.batch : undefined;
  const batchFiles = batchView?.list ?? [];
  const batchShown = batchView?.shown ?? 0;
  // the Batch opened: its spec changed (in the level above, where the Batch node is)
  const setBatchSpec = (f: (b: BatchSpec) => BatchSpec) => setStack((st) => st.map((lv, j) => (j < st.length - 1 ? lv : { ...lv, nodes: lv.nodes.map((n) => (n.id === lv.groupId && n.type === 'subgraph' ? ({ ...n, data: { ...n.data, batch: f(n.data.batch ?? {}) } } as AppNode) : n)) })));
  const showBatchFile = (k: number) => setBatchSpec((b) => ({ ...b, show: k || undefined }));
  // a file's own settings: the steps shown with them (over the common ones), marked; a change of a step made for every
  // file (it then drops the file's own of what it changes) or, a step chosen so, only for the file shown (its own
  // settings); the steps skipped for the file shown, faint
  const shownName = currentGroup?.batch ? batchFiles[batchShown]?.name : undefined;
  const batchUnit = currentGroup?.batch?.over === 'columns' ? 'column' : 'file';
  const eachSet = useMemo(() => (currentGroup?.batch ? eachSteps(currentGroup.batch) : new Set<string>()), [currentGroup]);
  const ownShown = useMemo(() => (shownName ? (currentGroup?.batch?.own?.[shownName] ?? {}) : {}), [currentGroup, shownName]);
  const skipShown = useMemo(() => new Set(shownName ? (currentGroup?.batch?.skip?.[shownName] ?? []) : []), [currentGroup, shownName]);
  const shownNodes = useMemo(
    () =>
      Object.keys(ownShown).length || eachSet.size || skipShown.size
        ? nodes.map((n) => {
            const cls = [ownShown[n.id] && 'batch-own', eachSet.has(n.id) && 'batch-each', skipShown.has(n.id) && 'batch-skip'].filter(Boolean);
            if (cls.length && batchUnit === 'column') cls.push('batch-c');
            return cls.length ? ({ ...n, data: ownShown[n.id] ? { ...n.data, ...ownShown[n.id] } : n.data, className: [n.className, ...cls].filter(Boolean).join(' ') } as AppNode) : n;
          })
        : nodes,
    [nodes, ownShown, eachSet, skipShown, batchUnit],
  );
  const setOwn = (f: (own: BatchOwn) => BatchOwn) => setBatchSpec((b) => ({ ...b, own: tidyOwn(f(structuredClone(b.own ?? {}))) }));
  const onNodesRouted = (changes: NodeChange<AppNode>[]) => {
    if (!shownName) return onNodesChange(changes);
    const rest: NodeChange<AppNode>[] = [];
    const patch: Record<string, Record<string, unknown>> = {};
    const drop: Record<string, string[]> = {};
    for (const c of changes) {
      const shown = c.type === 'replace' ? shownNodes.find((n) => n.id === c.id) : undefined;
      const common = c.type === 'replace' ? nodes.find((n) => n.id === c.id) : undefined;
      if (c.type !== 'replace' || !shown || !common) {
        rest.push(c);
        continue;
      }
      const [a, b] = [shown.data as Record<string, unknown>, c.item.data as Record<string, unknown>];
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      const changed = Object.fromEntries(keys.map((k) => [k, b[k]]));
      const each = eachSet.has(c.id);
      if (each && keys.length) patch[c.id] = changed;
      else if (keys.length && ownShown[c.id]) drop[c.id] = keys;
      rest.push({ ...c, item: { ...c.item, className: common.className, data: (each ? common.data : { ...common.data, ...changed }) as AppNode['data'] } as AppNode });
    }
    onNodesChange(rest);
    if (Object.keys(patch).length || Object.keys(drop).length)
      setOwn((own) => {
        const mine = (own[shownName] ??= {});
        for (const [id, p] of Object.entries(patch)) mine[id] = { ...mine[id], ...p };
        for (const [id, ks] of Object.entries(drop)) if (mine[id]) for (const k of ks) delete mine[id][k];
        return own;
      });
  };
  // a step's own settings of the file shown: dropped (back to the common ones), or made the common ones (for every file)
  const ownBack = (id: string) => {
    if (!shownName) return;
    setOwn((own) => {
      if (own[shownName]) delete own[shownName][id];
      return own;
    });
  };
  const ownForAll = (id: string) => {
    const mine = shownName ? ownShown[id] : undefined;
    if (!mine) return;
    setNodes((ns) => ns.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...mine } } as AppNode) : n)));
    // (every file then takes them: the others' own of the same settings dropped too)
    setOwn((own) => {
      for (const f of Object.values(own)) if (f[id]) for (const k of Object.keys(mine)) delete f[id][k];
      return own;
    });
  };
  const ownSteps = Object.keys(ownShown).flatMap((id) => {
    const n = nodes.find((q) => q.id === id);
    return n ? [{ id, title: nodeDisplayName(n) }] : [];
  });
  const skippedSteps = [...skipShown].flatMap((id) => {
    const n = nodes.find((q) => q.id === id);
    return n ? [{ id, title: nodeDisplayName(n) }] : [];
  });
  // a step's changes: for every file, or for the file shown only (back to every file: the files' own settings of it
  // dropped, every file then has the common ones)
  const setStepEach = (id: string, each: boolean) =>
    setBatchSpec((b) => {
      const list = (b.each ?? []).filter((x) => x !== id);
      const own = structuredClone(b.own ?? {});
      if (!each) for (const f of Object.values(own)) delete f[id];
      return { ...b, each: each ? [...list, id] : list.length ? list : undefined, own: tidyOwn(own) };
    });
  // a step skipped for the file shown, or run on it again
  const setStepSkip = (id: string, skip: boolean) => {
    if (!shownName) return;
    setBatchSpec((b) => {
      const all = { ...b.skip };
      const mine = (all[shownName] ?? []).filter((x) => x !== id);
      if (skip) mine.push(id);
      if (mine.length) all[shownName] = mine;
      else delete all[shownName];
      return { ...b, skip: Object.keys(all).length ? all : undefined };
    });
  };
  // a step's place in the Batch, at the top of its options
  const batchStepTop = (n: AppNode) =>
    currentGroup?.batch && n.type !== 'groupin' && n.type !== 'groupout' && nodes.some((q) => q.id === n.id) ? (
      <BatchStepBar unit={batchUnit} shown={shownName} each={eachSet.has(n.id)} skipped={skipShown.has(n.id)} ownCount={Object.values(currentGroup.batch.own ?? {}).filter((o) => o[n.id]).length} total={batchFiles.length} onEach={(on) => setStepEach(n.id, on)} onSkip={(on) => setStepSkip(n.id, on)} />
    ) : null;
  const openGroup = (id: string) => {
    const g = getNode(id);
    if (!g || g.type !== 'subgraph') return;
    setStack((st) => [...st, { groupId: id, nodes: getNodes(), edges: getEdges() }]);
    history.reset();
    setNodes(g.data.nodes.map((n) => ({ ...n, selected: false })));
    setEdges(g.data.edges);
    setFitPending(true);
  };
  const closeGroup = () => {
    const top = stack[stack.length - 1];
    if (!top) return;
    const inside = { nodes: getNodes(), edges: getEdges() };
    setStack((st) => st.slice(0, -1));
    history.reset();
    setNodes(top.nodes.map((n) => (n.id === top.groupId && n.type === 'subgraph' ? ({ ...n, data: { ...n.data, nodes: inside.nodes, edges: inside.edges } } as AppNode) : n)));
    setEdges(top.edges);
    setFitPending(true);
  };

  // The project of the last visit: its big texts back from IndexedDB (they are kept apart from the autosave)
  useEffect(() => {
    if (!hasRefs(initial)) return;
    void withTexts(initial).then(({ project, lost }) => {
      const back = new Map(project.nodes.map((n) => [n.id, n]));
      setNodes((ns) => ns.map((n) => back.get(n.id) ?? n));
      if (lost) notify(`${lost} imported file(s) of the last session are no longer in the browser's storage: open them again in their Import nodes.`);
    });
  }, [setNodes]);

  // Autosave (debounced) to the browser; a failure (storage full) is shown in the toolbar until a save succeeds.
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAutosaveFailed(!autosave(toProject(root.nodes, root.edges, projectName, projectId))), 500);
    return () => clearTimeout(t);
  }, [root, projectName, projectId]);

  // Projects: the projects kept before come into the list once; the project worked on is kept there by itself once it
  // was changed (an example only opened is not), and at once before another project is opened
  useEffect(() => {
    void libMigrate(lastSession);
  }, []);
  const keepInLibrary = () => {
    if (!history.canUndo || !root.nodes.length) return;
    void libPut(toProject(root.nodes, root.edges, projectName, projectId), projectName.trim() || 'untitled');
  };
  useEffect(() => {
    const t = setTimeout(keepInLibrary, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, projectName, projectId, history.canUndo]);

  // A newly loaded project is shown at its natural size (zoom 1), its top-left corner in view — not fitted to the
  // window, which shrank the nodes' text. Fit view stays available as a button of the canvas controls.
  const [fitPending, setFitPending] = useState(true);
  const initialized = useNodesInitialized();
  // Fits directly to the node bounds (React Flow's queued fitView waits for the next node change).
  const fitAll = useCallback(() => {
    const ns = getNodes();
    if (ns.length) fitBounds(getNodesBounds(ns), { padding: 0.06 });
  }, [fitBounds, getNodesBounds, getNodes]);
  useEffect(() => {
    if (!initialized || !fitPending) return;
    const ns = getNodes();
    if (ns.length) {
      const b = getNodesBounds(ns);
      setViewport({ x: 40 - b.x, y: 40 - b.y, zoom: 1 });
    }
    setFitPending(false);
  }, [initialized, fitPending, getNodes, getNodesBounds, setViewport]);

  const load = (p: Project, name?: string) => {
    // another project while working together: out of the session first (else it would replace the shared one)
    if (collabRef.current && !fromSession.current) leaveSession();
    // the project open until now: kept in Projects first (its last change too)
    if (p.id !== projectId) keepInLibrary();
    // a project kept in the browser: its big texts come back from IndexedDB first
    if (hasRefs(p)) {
      void withTexts(p).then(({ project, lost }) => {
        if (lost) notify(`${lost} imported file(s) of this project are no longer in the browser's storage: open them again in their Import nodes.`);
        load(project, name);
      });
      return;
    }
    setProjectName(name ?? p.name ?? '');
    const pid = p.id ?? newProjectId();
    setProjectId(pid);
    // its Python code runs once allowed, unless it has none (or it was allowed before)
    openProject(pid, !hasPython(p.nodes));
    setStack([]);
    setPins([]);
    history.reset();
    setNodes(p.nodes);
    setEdges(p.edges);
    if (p.nodes.length) setFitPending(true);
    else setViewport({ x: 0, y: 0, zoom: 1 });
  };

  // The page and the app container never stay scrolled (the toolbar must stay in view): a scroll that the browser makes
  // by itself — bringing a focused element into view, keyboard scrolling — is undone.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    const back = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (app && (app.scrollTop || app.scrollLeft)) app.scrollTo(0, 0);
    };
    window.addEventListener('scroll', back, { passive: true });
    app?.addEventListener('scroll', back, { passive: true });
    return () => {
      window.removeEventListener('scroll', back);
      app?.removeEventListener('scroll', back);
    };
  }, []);

  // Start: the example list (a separate chunk); a shared link (#p=…) opens that project.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // (StrictMode runs effects twice in development)
    started.current = true;
    const shared = location.hash.startsWith('#p=') ? location.hash.slice(3) : '';
    if (shared) window.history.replaceState(null, '', location.pathname + location.search);
    loadExamples().then(setExamples);
    if (shared)
      decodeProject(shared).then((p) => {
        if (typeof p === 'string') notify(p);
        else {
          load(p, p.name ?? 'Shared project');
          if (p.repaired) notify(p.repaired);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // A figure exported with its project (an SVG or PNG, from a document): the project opened at that figure — the
  // project open already (the same id): the figure shown, or its other version opened (the current one kept first)
  const [focusFig, setFocusFig] = useState<FigureRef | null>(null);
  const openFigureFile = async (file: File) => {
    const e = fileProject(new Uint8Array(await file.arrayBuffer()));
    if (!e) return notify(`“${file.name}” has no SciPlotFlow project in it${EDITABLE_FIGURES ? ': export the figure with “project inside” (SVG or PNG)' : ''}.`);
    const p = await openEmbedded(e);
    if (typeof p === 'string') return notify(p);
    const when = new Date(e.exported).toLocaleString();
    const afterLoad = () => {
      setFocusFig(e.figure);
      if (e.data === 'nodata') notify('This figure was exported without its imported data: open the files again in the Import nodes.');
    };
    if (e.projectId === projectId) {
      const cur = toProject(root.nodes, root.edges, projectName, projectId);
      if ((await projectRevision(cur)) === e.revision) return setFocusFig(e.figure);
      const other = await askUser(`This figure comes from the open project, but from another version of it (exported ${when}).\n\nOpen its version: the current one is first kept in Projects as “${projectName || 'Untitled project'} (before)”.\nCancel: stay with the current version and show the figure in it.`, { ok: 'Open its version' });
      if (!other) return setFocusFig(e.figure);
      const kept = saveToBrowser(cur, `${projectName || 'Untitled project'} (before)`);
      if (typeof kept === 'string') return notify(`The current project could not be kept in the browser (${kept}): use Save first.`);
      load({ ...p, id: e.projectId }, p.name ?? e.projectName ?? projectName);
      return afterLoad();
    }
    if (!(await askUser(`Open the project of this figure (“${e.projectName || e.figure.name}”, exported ${when})?\n\nIt replaces the current project: use Save first to keep that one.`, { ok: 'Open' }))) return;
    load({ ...p, id: e.projectId }, p.name ?? e.projectName ?? file.name.replace(/\.(svg|png)$/i, ''));
    afterLoad();
  };
  // the figure's node selected and brought into view (at the top level: its group, when it is inside one)
  useEffect(() => {
    if (!focusFig || fitPending || !initialized) return;
    const target = stack.length ? focusFig.node : (focusFig.path[0] ?? focusFig.node);
    const n = getNode(target);
    setFocusFig(null);
    if (!n) return notify(`The figure “${focusFig.name}” is not on the level shown (its node may have been removed).`);
    setNodes((ns) => ns.map((q) => (q.selected === (q.id === target) ? q : { ...q, selected: q.id === target })));
    fitBounds(getNodesBounds([n]), { padding: 0.25, duration: 300 });
  }, [focusFig, fitPending, initialized, stack.length, getNode, setNodes, fitBounds, getNodesBounds]);
  // a project file (.json) opened, a figure with its project (.svg, .png)
  const openAnyFile = async (f: File, ask: boolean) => {
    if (/\.(svg|png)$/i.test(f.name) || f.type === 'image/png' || f.type === 'image/svg+xml') return openFigureFile(f);
    if (!/\.json$/i.test(f.name)) return notify(`“${f.name}”: drop a data file (CSV, text, Excel …: an Import node is made), a project file (.json) or a figure exported with its project (.svg, .png) here.`);
    const p = parseProject(await f.text());
    if (typeof p === 'string') return notify(p);
    if (ask && !(await askUser(`Open the project “${p.name ?? f.name}”? It replaces the current project: use Save first to keep that one.`, { ok: 'Open' }))) return;
    load(p, p.name ?? f.name.replace(/\.json$/i, ''));
    if (p.repaired) notify(p.repaired);
  };

  // ---- Working together (Collaborate): a session keeps this project in step with the others' ----
  const [collab, setCollab] = useState<CollabSession | null>(null);
  const collabRef = useRef<CollabSession | null>(null);
  collabRef.current = collab;
  // a guest's answer to send back (joined by an invitation), with the host's name and the connection
  const [answerInfo, setAnswerInfo] = useState<{ code: string; host: string; pc: RTCPeerConnection; at: number } | null>(null);
  const [joinCode] = useState(() => (location.hash.startsWith('#join=') ? location.hash.slice(6) : ''));
  const [peerCount, setPeerCount] = useState(0);
  // a merge of the others' changes given to the page (shown once it has rendered)
  const [mergeTick, setMergeTick] = useState(0);
  // the project the session gets on joining is loaded as a project (not a reason to leave)
  const fromSession = useRef(false);
  const live = useRef({ root, projectName, projectId, stack });
  live.current = { root, projectName, projectId, stack };
  useEffect(() => {
    if (!collab) return;
    // a change made here: the session reads the project shown when it writes it
    collab.setSource(() => toProject(live.current.root.nodes, live.current.root.edges, live.current.projectName, live.current.projectId));
    undoExt.current = { undo: () => collab.undoLocal(), redo: () => collab.redoLocal() };
    const offRemote = collab.onRemote(() => {
      const inc = collab.incoming();
      // a Python script changed by someone else (its code, or running by itself): held until allowed again
      const py = (p: Project, id: string) => p.nodes.find((n) => n.id === id && (n.type === 'python' || (n.type === 'subgraph' && hasPython([n]))));
      const touched = [...inc.changed].some((id) => {
        const [a, b] = [py(inc.now, id), py(inc.base, id)];
        if (!a) return false;
        if (!b || a.type === 'subgraph') return true;
        const [da, db] = [a.data as { code?: string; auto?: boolean }, b.data as { code?: string; auto?: boolean }];
        return da.code !== db.code || da.auto !== db.auto;
      });
      if (touched) distrustProject();
      // inside a group: back to the top level, where the others' changes are merged
      if (live.current.stack.length) {
        const r = live.current.root;
        setStack([]);
        setPins([]);
        setNodes(inc.nodes(r.nodes));
        setEdges(inc.edges(r.edges));
      } else {
        setNodes(inc.nodes);
        setEdges(inc.edges);
      }
      if (inc.name !== undefined) setProjectName(inc.name);
      setMergeTick((t) => t + 1);
    });
    const offPeers = collab.onPeers(() => setPeerCount(collab.peers().length));
    collab.onJoined((p) => {
      fromSession.current = true;
      load(p, p.name ?? 'Shared project');
      fromSession.current = false;
    });
    return () => {
      offRemote();
      offPeers();
      undoExt.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab]);
  // presence: the level shown (the groups opened) and the nodes selected here, for the others; this side's colour
  const level = stack.map((l) => l.groupId).join('/');
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id).join(',');
  useEffect(() => {
    collab?.presence.set({ level, selected: selectedIds ? selectedIds.split(',') : [] });
  }, [collab, level, selectedIds]);
  useEffect(() => {
    if (collab) collab.presence.set({ color: myColor() || colorOf(collab.name) });
  }, [collab]);
  // a change made here goes out (a moment later); a merge shown lets the changes made meanwhile go out
  useEffect(() => collab?.changed(), [collab, root, projectName]);
  useEffect(() => collab?.shown(), [collab, mergeTick]);
  const startSession = async (name: string) => {
    const { CollabSession } = await import('./collab/session.ts');
    setCollab(CollabSession.host(toProject(root.nodes, root.edges, projectName, projectId), name));
  };
  const joinSession = async (code: string, name: string, address?: string): Promise<string | null> => {
    const { CollabSession } = await import('./collab/session.ts');
    const r = await CollabSession.byCode(code, name, address);
    if (typeof r === 'string') return r;
    setAnswerInfo({ code: r.answer, host: r.host, pc: r.pc, at: r.at });
    setCollab(r.session);
    return null;
  };
  // a guest after a lost connection: a new invitation answered within the session (its work kept and merged)
  const rejoinSession = async (code: string, address?: string): Promise<string | null> => {
    const s = collabRef.current;
    if (!s) return 'Not in a session.';
    const r = await s.rejoin(code, address);
    if (typeof r === 'string') return r;
    setAnswerInfo({ code: r.answer, host: r.host, pc: r.pc, at: r.at });
    return null;
  };
  function leaveSession() {
    collabRef.current?.leave();
    collabRef.current = null;
    setCollab(null);
    setAnswerInfo(null);
    setPeerCount(0);
    history.reset();
  }
  // a link to a session in this browser (#c=…): joined through the tabs; an invitation (#join=…): the panel has it
  useEffect(() => {
    const room = location.hash.startsWith('#c=') ? location.hash.slice(3) : '';
    if (location.hash.startsWith('#c=') || location.hash.startsWith('#join=')) window.history.replaceState(null, '', location.pathname + location.search);
    if (room) void import('./collab/session.ts').then(({ CollabSession }) => setCollab(CollabSession.guest(room, myName() || 'Guest')));
  }, []);

  // Empty project: no nodes, no connections.
  const newProject = () => {
    const text = 'Start a new, empty project?\n\nThe current one stays in Projects (once it has been changed); Save also keeps it as a file.';
    void askUser(text, { ok: 'Start empty' }).then((yes) => yes && load(EMPTY));
  };

  const isValidConnection: IsValidConnection = useCallback(
    (c) => canConnect(getNode(c.source), getNode(c.target), c.targetHandle, c.sourceHandle, { node: getNode, edges: getEdges(), groupInputs: currentGroup?.inputs }),
    [getNode, getEdges, currentGroup],
  );

  // Single-input handles keep only the newest connection. A connection to “+” of a Group output: a new output of the
  // group open (in a Batch: one more thing kept for every file).
  const onConnect = useCallback(
    (c: Connection) => {
      const src = getNode(c.source);
      if (c.targetHandle === NEW_OUT && src) {
        const id = `out-${crypto.randomUUID().slice(0, 6)}`;
        const port = { id, label: portLabel(src, c.sourceHandle), type: sourcePort(src, c.sourceHandle) ?? 'any' };
        setStack((st) => st.map((lv, k) => (k < st.length - 1 ? lv : { ...lv, nodes: lv.nodes.map((n) => (n.id === lv.groupId && n.type === 'subgraph' ? ({ ...n, data: { ...n.data, outputs: [...n.data.outputs, port] } } as AppNode) : n)) })));
        setEdges((eds) => addEdge({ ...c, targetHandle: id }, eds));
        return;
      }
      setEdges((eds) => {
        const multi = isMultiInput(getNode(c.target), c.targetHandle);
        const kept = eds.filter(
          (e) =>
            !(e.target === c.target && e.targetHandle === c.targetHandle && (!multi || e.source === c.source)),
        );
        return addEdge(c, kept);
      });
    },
    [setEdges, getNode],
  );

  // A node dragged onto a connection goes into it (source → node → target): the connection under the mouse, when the
  // node is connected to nothing and has an input that takes what the connection carries and an output its target
  // takes (the first of each, as its handles are drawn); shown while dragging, made when the node is let go
  const [dropEdge, setDropEdge] = useState<{ edge: string; inH: string; outH: string } | null>(null);
  const spliceAt = (nodeId: string, x: number, y: number): { edge: string; inH: string; outH: string } | null => {
    const n = getNode(nodeId) as AppNode | undefined;
    const es = getEdges();
    if (!n || es.some((e) => e.source === nodeId || e.target === nodeId)) return null;
    const under = document
      .elementsFromPoint(x, y)
      .map((el) => el.closest('.react-flow__edge'))
      .find((el): el is Element => !!el);
    const id = under?.getAttribute('data-id') ?? under?.getAttribute('data-testid')?.replace(/^rf__edge-/, '');
    const e = es.find((q) => q.id === id);
    if (!e) return null;
    const ctx = { node: getNode as PortContext['node'], edges: es, groupInputs: currentGroup?.inputs };
    const [src, tgt] = [getNode(e.source) as AppNode | undefined, getNode(e.target) as AppNode | undefined];
    const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
    const handles = (kind: string) => [...(el?.querySelectorAll(`.react-flow__handle.${kind}`) ?? [])].map((h) => h.getAttribute('data-handleid') ?? '');
    const inH = handles('target').find((h) => canConnect(src, n, h, e.sourceHandle ?? null, ctx));
    const outH = handles('source').find((h) => canConnect(n, tgt, e.targetHandle ?? null, h, ctx));
    return inH !== undefined && outH !== undefined ? { edge: e.id, inH, outH } : null;
  };
  // (a node just added: what to do once it is in the flow and its ports are drawn, a frame or a few later)
  const whenDrawn = (id: string, fn: () => void, tries = 30) =>
    requestAnimationFrame(() => {
      const drawn = getNode(id) && document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .react-flow__handle`);
      if (drawn || tries <= 0) fn();
      else whenDrawn(id, fn, tries - 1);
    });
  const splice = (nodeId: string, d: { edge: string; inH: string; outH: string }) =>
    setEdges((es) => {
      const e = es.find((q) => q.id === d.edge);
      if (!e) return es;
      return [
        ...es.filter((q) => q.id !== d.edge),
        { id: `e-${e.source}-${e.sourceHandle ?? ''}-${nodeId}-${d.inH}`, source: e.source, sourceHandle: e.sourceHandle, target: nodeId, targetHandle: d.inH },
        { id: `e-${nodeId}-${d.outH}-${e.target}-${e.targetHandle ?? ''}`, source: nodeId, sourceHandle: d.outH, target: e.target, targetHandle: e.targetHandle },
      ];
    });

  // A connection let go on the empty canvas (not on a node, not near a port): the menu of the nodes that fit, there
  const onConnectEnd = (ev: MouseEvent | TouchEvent, st: FinalConnectionState) => {
    if (st.isValid || st.toNode || st.toHandle || !st.fromNode || !st.fromHandle) return;
    const target = ev.target as Element | null;
    if (!target?.closest('.react-flow__pane')) return;
    const pt = 'changedTouches' in ev ? ev.changedTouches[0] : ev;
    if (!pt) return;
    setMenu({ kind: 'connect', x: pt.clientX, y: pt.clientY, from: { node: st.fromNode.id, handle: st.fromHandle.id ?? null, type: st.fromHandle.type } });
  };
  // the node types a connection from (to) a port can go to (come from): a node of the kind as added, one of its usual
  // ports taking (giving) what the port gives (takes)
  const IN_PORTS = ['in', 'in-0', 'dataset', 'data', 'matrix', 'figures', 'insets', 'x', 'a', 'b', 'at', 'base', 'by', 'irf', 'kernel', 'like', 'overlay', 'pvalues', 'under', 'ya', 'yb'];
  const OUT_PORTS = ['out', 'dataset', 'book', 'workbook', 'figure', 'matrix', 'table', 'sheets', 'stacked', 'parameters'];
  const fitsConnect = (from: { node: string; handle: string | null; type: 'source' | 'target' }, t: Template): boolean => {
    const other = getNode(from.node) as AppNode | undefined;
    if (!other) return false;
    const tmp = { id: '__new', type: t.type, position: { x: 0, y: 0 }, data: t.data } as AppNode;
    const ctx = { node: getNode as PortContext['node'], edges: getEdges(), groupInputs: currentGroup?.inputs };
    if (from.type === 'source') return IN_PORTS.some((h) => canConnect(other, tmp, h, from.handle, ctx));
    const takes = targetAccepts(other, from.handle);
    return OUT_PORTS.some((h) => {
      const p = sourcePort(tmp, h, ctx);
      return !!p && (p === 'any' ? takes.length > 0 : takes.includes(p));
    });
  };
  // the node chosen: added where the connection was let go, then connected by its first port that fits (once drawn)
  const addConnected = (t: Template, m: Extract<MenuState, { kind: 'connect' }>) => {
    const id = addNode(t, { x: m.x, y: m.y });
    whenDrawn(id, () => {
      const n = getNode(id) as AppNode | undefined;
      const other = getNode(m.from.node) as AppNode | undefined;
      const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      if (!n || !other || !el) return;
      const ctx = { node: getNode as PortContext['node'], edges: getEdges(), groupInputs: currentGroup?.inputs };
      const handles = (kind: string) => [...el.querySelectorAll(`.react-flow__handle.${kind}`)].map((h) => h.getAttribute('data-handleid') ?? '');
      if (m.from.type === 'source') {
        const h = handles('target').find((q) => canConnect(other, n, q, m.from.handle, ctx));
        if (h !== undefined) onConnect({ source: m.from.node, sourceHandle: m.from.handle, target: id, targetHandle: h });
        else notify(`${t.label} has no input that takes this connection.`);
      } else {
        const h = handles('source').find((q) => canConnect(n, other, m.from.handle, q, ctx));
        if (h !== undefined) onConnect({ source: id, sourceHandle: h, target: m.from.node, targetHandle: m.from.handle });
        else notify(`${t.label} has no output this port takes.`);
      }
    });
  };

  // Colour each edge by the type of value it carries (a Reroute: the type of what reaches it).
  const colorKey = nodes.map((n) => `${n.id}:${n.type}`).join('|');
  // The nodes of this render (not getNode: right after loading a project the React Flow store does not hold the new
  // nodes yet, and the edges would stay unstyled until the next change). Rebuilt only when the nodes change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [colorKey]);
  const portCtx: PortContext = useMemo(() => ({ node: (id) => nodeById.get(id), edges, groupInputs: currentGroup?.inputs }), [nodeById, edges, currentGroup]);
  // the connections of the node under the mouse stand out (thicker)
  const [hovered, setHovered] = useState<string | null>(null);
  // the nodes selected: their connections show the data moving (the others stay still)
  const selectedSet = useMemo(() => new Set(nodes.filter((n) => n.selected).map((n) => n.id)), [nodes]);
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const s = nodeById.get(e.source);
        const p = s && sourcePort(s, e.sourceHandle, portCtx);
        const color = (p && PORT_COLORS[p]) || 'var(--muted)';
        // custom line: curved or orthogonal, arrow at the middle (direction of the data); a selected line is thicker
        // and drawn over a halo (FlowEdge)
        const lit = hovered !== null && (e.source === hovered || e.target === hovered);
        // (the connection a node dragged over it would go into)
        const into = dropEdge?.edge === e.id;
        // (still lines; moving only those of the node under the mouse or of the nodes selected, the line selected solid)
        const moving = !e.selected && (lit || selectedSet.has(e.source) || selectedSet.has(e.target));
        return { ...e, type: 'flow', animated: moving, className: into ? 'edge-drop' : lit ? 'edge-lit' : undefined, style: { stroke: color, strokeWidth: e.selected || lit || into ? 4.5 : 3 }, data: { arrow: prefs.arrows, shape: prefs.shape } };
      }),
    [edges, nodeById, portCtx, prefs.arrows, prefs.shape, hovered, dropEdge, selectedSet],
  );

  // Deleting a frame keeps its nodes (they leave the frame) unless “remove the group and its nodes” was chosen.
  const deleteChildren = useRef(false);
  const onBeforeDelete = useCallback(
    async ({ nodes: allDel, edges: delEdges }: { nodes: AppNode[]; edges: Edge[] }) => {
      const del = allDel.filter((n) => n.type !== 'groupin' && n.type !== 'groupout');
      const frames = new Set(del.filter((n) => n.type === 'frame').map((n) => n.id));
      const withChildren = deleteChildren.current;
      deleteChildren.current = false;
      if (!frames.size || withChildren) return { nodes: del, edges: delEdges };
      const kept = new Set(del.filter((n) => n.parentId && frames.has(n.parentId) && !n.selected).map((n) => n.id));
      if (!kept.size) return { nodes: del, edges: delEdges };
      setNodes((ns) => releaseChildren(ns, frames, (n) => kept.has(n.id)));
      const gone = new Set(del.filter((n) => !kept.has(n.id)).map((n) => n.id));
      return { nodes: del.filter((n) => gone.has(n.id)), edges: delEdges.filter((e) => e.selected || gone.has(e.source) || gone.has(e.target)) };
    },
    [setNodes],
  );

  const setCollapsed = (ids: string[], collapsed: boolean) =>
    setNodes((ns) => ns.map((n) => (ids.includes(n.id) && n.type !== 'frame' ? ({ ...n, data: { ...n.data, collapsed: collapsed || undefined } } as AppNode) : n)));
  const groupSelection = (ids: string[]) => {
    const r = groupNodes(getNodes(), ids, 'Frame', FRAME_COLORS[0]);
    if (!r.frameId) return;
    setNodes(r.nodes);
    editCaption(r.frameId); // name it right away
  };
  // named styles: apply one (on this node and the other selected nodes of its kind), save the node's, forget one
  const styleActions = (n: AppNode): MenuAction[] => {
    if (n.type === 'reroute' || n.type === 'note' || n.type === 'frame') return [];
    const all = stylesFor(n.type);
    const mine = userStylesFor(n.type);
    return [
      ...(all.length
        ? [
            {
              placeholder: 'Apply a style',
              choices: all.map((s) => ({ label: s.name, group: s.builtin ? 'Built in' : 'Mine' })),
              onChoose: (k: number) => {
                const st = all[k];
                for (const t of [n, ...getNodes().filter((x) => x.selected && x.id !== n.id && x.type === n.type)]) {
                  const d = styledData(t, st);
                  if (d) updateNodeData(t.id, d, { replace: true });
                }
              },
            },
          ]
        : []),
      {
        label: 'Save settings as a style',
        onClick: () =>
          void askText('Name of the style (kept in this browser, offered for every node of this kind):').then((v) => {
            const name = v?.trim();
            if (name && !saveStyle(n, name)) notify('The browser storage is full: the style was not saved.');
          }),
      },
      {
        label: 'Use these settings for new nodes of this kind',
        onClick: () => {
          if (!setDefaultStyle(n)) notify('The browser storage is full: the default was not kept.');
        },
      },
      ...(defaultStyleFor(n.type)
        ? [
            {
              label: 'New nodes of this kind: the built-in settings again',
              onClick: () => void clearDefaultStyle(n.type),
            },
          ]
        : []),
      ...(mine.length
        ? [
            {
              label: 'Forget a saved style',
              onClick: () =>
                void askText(`Forget which style?\n${mine.map((s) => s.name).join('\n')}`).then((v) => {
                  const name = v?.trim();
                  if (name) forgetStyle(n.type, name);
                }),
            },
          ]
        : []),
    ];
  };
  // “Plot these columns”: the curves of a dataset or of the sheets of a workbook (each its sheet, X and Y), drawn in a new
  // Plot (or several, or another graph) made and connected beside the node, or added to a Plot already there
  const [plotFrom, setPlotFrom] = useState<string | null>(null);
  const plotSource = (() => {
    const res = plotFrom ? engine.results.get(plotFrom) : undefined;
    const v = res?.outputs.out;
    if (v?.t !== 'dataset') return null;
    const b = res?.outputs.book;
    return { shown: v.v, book: b?.t === 'workbook' ? b.v : undefined };
  })();
  // a Plot told apart in a list: its name, then its curves
  const plotName = (n: AppNode) => {
    const names = [...new Set((engine.results.get(n.id)?.view.curves ?? []).map((q) => q.label))];
    const head = nodeTitle(n);
    return names.length ? `${head}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' …' : ''}` : `${head} (empty)`;
  };
  const makeFigure = (srcId: string, c: PlotChoice & { style: string }) => {
    const src = getNode(srcId);
    if (!src) return;
    const res = engine.results.get(srcId);
    const b = res?.outputs.book;
    const book = b?.t === 'workbook' ? b.v : undefined;
    const shown = res?.outputs.out?.t === 'dataset' ? res.outputs.out.v : undefined;
    const columnsOf = (sheet: string | undefined) => ((book && sheet ? book.sheets.find((q) => q.name === sheet) : shown)?.columns ?? []).map((col) => col.name);
    const uid = (t: string) => `${t}-${crypto.randomUUID().slice(0, 8)}`;
    const target = c.into ? getNode(c.into) : undefined;
    const into = target ? { node: target, rowEdges: new Set(getEdges().flatMap((e) => (e.target === target.id && e.targetHandle && /-0$|^[a-z]+$/.test(e.targetHandle) && e.targetHandle !== 'dataset' && e.targetHandle !== 'insets' ? [0] : []))), hasEdge: getEdges().some((e) => e.source === srcId && e.sourceHandle === (book ? 'book' : 'out') && e.target === target.id && e.targetHandle === 'dataset') } : undefined;
    const built = buildFigure({ id: srcId, x: src.position.x, y: src.position.y, w: src.measured?.width ?? 560, book: !!book }, c, columnsOf, uid, into);
    // the default settings of their kind, then the style chosen
    const named = c.style ? stylesFor((c.graph && built.nodes[0]?.type) || 'plot1d').find((q) => q.name === c.style) : undefined;
    const styled = (n: AppNode): AppNode => {
      const d = withDefaultStyle(n);
      const t = named && d.type !== 'canvas' ? styledData(d, named) : null;
      return t ? ({ ...d, data: t } as AppNode) : d;
    };
    const nodes = built.nodes.map(styled);
    setNodes((ns) => [
      ...ns.map((n) => {
        if (built.update && n.id === built.update.id) {
          const d = { ...n, data: { ...n.data, ...built.update.data } } as AppNode;
          const t = named ? styledData(d, named) : null;
          return { ...(t ? ({ ...d, data: t } as AppNode) : d), selected: true };
        }
        return { ...n, selected: false };
      }),
      ...nodes.map((n) => ({ ...n, selected: true })),
    ]);
    setEdges((es) => [...es, ...built.edges.filter((e) => !es.some((x) => x.id === e.id))]);
    // the data and the figures brought into view (once they are measured)
    setShowNodes([srcId, ...(built.update ? [built.update.id] : []), ...nodes.map((n) => n.id)]);
  };
  // nodes to bring into view as soon as all of them have their size
  const [showNodes, setShowNodes] = useState<string[] | null>(null);
  useEffect(() => {
    if (!showNodes) return;
    if (showNodes.some((id) => !getNode(id)?.measured?.width)) return;
    setShowNodes(null);
    void fitView({ nodes: showNodes.map((id) => ({ id })), padding: 0.12, duration: 300 });
  }, [showNodes, nodes, getNode, fitView]);
  const nodeMenu = (): { title: string; actions: MenuAction[] } | null => {
    if (!menu || menu.kind === 'pane' || menu.kind === 'connect') return null;
    const ids = menu.kind === 'node' ? [menu.nodeId] : menu.ids;
    const remove: MenuAction = { label: ids.length > 1 ? 'Remove selected nodes' : 'Remove node', danger: true, kbd: 'Del', onClick: () => deleteElements({ nodes: ids.map((id) => ({ id })) }) };
    const inGroup = ids.some((id) => getNode(id)?.parentId);
    const leave: MenuAction[] = inGroup ? [{ label: 'Remove from group', onClick: () => setNodes((ns) => removeFromGroup(ns, ids)) }] : [];
    if (menu.kind === 'selection')
      return {
        title: `${ids.length} nodes selected`,
        actions: [
          { label: 'Frame', onClick: () => groupSelection(ids) },
          {
            label: 'Make a group node',
            onClick: () => {
              const r = makeGroup(getNodes(), getEdges(), ids, portLabel, (nd, h) => sourcePort(nd, h, portCtx));
              if (!r) return;
              setNodes(r.nodes);
              setEdges(r.edges);
            },
          },
          {
            label: 'Make a batch (run on every file)',
            onClick: () => {
              const r = makeGroup(getNodes(), getEdges(), ids, portLabel, (nd, h) => sourcePort(nd, h, portCtx));
              if (!r) return;
              const b = asBatch(r.nodes, r.edges, r.groupId, portLabel, (nd, h) => sourcePort(nd, h));
              setNodes(b.nodes);
              setEdges(b.edges);
            },
          },
          ...(clipboard?.kind === 'node'
            ? [
                {
                  label: 'Paste settings (on the nodes of that kind)',
                  onClick: () => {
                    for (const id of ids) {
                      const t = getNode(id);
                      const d = t && pastedData(clipboard, t);
                      if (t && d) updateNodeData(t.id, d, { replace: true });
                    }
                  },
                },
              ]
            : []),
          { label: 'Collapse', onClick: () => setCollapsed(ids, true) },
          { label: 'Expand', onClick: () => setCollapsed(ids, false) },
          ...leave,
          remove,
        ],
      };
    const n = getNode(menu.nodeId);
    if (!n) return null;
    if (n.type === 'frame')
      return {
        title: `Frame “${n.data.name}”`,
        actions: [
          { label: 'Rename', onClick: () => editCaption(n.id) },
          { colors: FRAME_COLORS, current: n.data.color, onPick: (color) => updateNodeData(n.id, { color }) },
          { label: 'Remove the frame (keep the nodes)', onClick: () => setNodes((ns) => ungroup(ns, n.id)) },
          {
            label: 'Remove the frame and its nodes',
            danger: true,
            onClick: () => {
              deleteChildren.current = true;
              deleteElements({ nodes: [{ id: n.id }] });
            },
          },
        ],
      };
    return {
      title: nodeTitle(n),
      actions: [
        { label: n.data.caption ? 'Edit label' : 'Add label', onClick: () => editCaption(n.id) },
        { label: n.data.collapsed ? 'Expand' : 'Collapse', onClick: () => setCollapsed([n.id], !n.data.collapsed) },
        ...(n.type === 'note' || n.type === 'reroute' ? [] : [{ label: 'Inspect data', onClick: () => inspectData({ kind: 'node', id: n.id }) }]),
        {
          label: 'Duplicate',
          onClick: () => {
            const id = `${n.type}-${crypto.randomUUID().slice(0, 8)}`;
            setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...n, id, selected: true, position: { x: n.position.x + 40, y: n.position.y + 40 }, data: structuredClone(n.data) } as AppNode]);
          },
        },
        ...(n.type === 'reroute' || n.type === 'note'
          ? []
          : [
              { label: 'Copy settings', onClick: () => copySettings(n) },
              ...(canPaste(clipboard, n)
                ? [
                    {
                      label: 'Paste settings',
                      onClick: () => {
                        // on this node, and on every other selected node of the same kind
                        const targets = [n, ...getNodes().filter((x) => x.selected && x.id !== n.id && x.type === n.type)];
                        for (const t of targets) {
                          const d = pastedData(clipboard, t);
                          if (d) updateNodeData(t.id, d, { replace: true });
                        }
                      },
                    },
                  ]
                : []),
            ]),
        ...(sourcePort(n, 'out', portCtx) === 'dataset' && engine.results.get(n.id)?.outputs.out ? [{ label: 'Plot these columns', onClick: () => setPlotFrom(n.id) }] : []),
        // a figure annotated: a Figure Drawing beside it, the figure connected under the drawing
        ...(n.type !== 'drawing' && sourcePort(n, 'figure', portCtx) === 'figure'
          ? [
              {
                label: 'Annotate (Figure Drawing)',
                onClick: () => {
                  const id = `drawing-${crypto.randomUUID().slice(0, 8)}`;
                  const position = { x: n.position.x + (n.measured?.width ?? n.width ?? 640) + 80, y: n.position.y };
                  const made = { id, type: 'drawing', position, data: structuredClone(DRAWING_DEFAULTS), selected: true, ...(n.parentId ? { parentId: n.parentId } : {}) } as AppNode;
                  setNodes((ns) => [...ns.map((x) => (x.selected ? { ...x, selected: false } : x)), made]);
                  setEdges((es) => addEdge({ source: n.id, sourceHandle: 'figure', target: id, targetHandle: 'under' }, es));
                },
              },
            ]
          : []),
        ...(n.type === 'subgraph'
          ? [
              { label: 'Open the group', onClick: () => openGroup(n.id) },
              {
                label: 'Ungroup (the nodes back on the canvas)',
                onClick: () => {
                  const r = ungroupNode(getNodes(), getEdges(), n.id);
                  if (!r) return;
                  setNodes(r.nodes);
                  setEdges(r.edges);
                },
              },
              {
                label: 'Save as template',
                onClick: () =>
                  void askText('Name of the template (kept in this browser, in the Nodes panel under My templates):', n.data.name).then((v) => {
                    const name = v?.trim();
                    if (name && !saveTemplate(name, n.data)) notify('The browser storage is full: the template was not saved.');
                  }),
              },
              ...(listTemplates().length
                ? [
                    {
                      label: 'Forget a template',
                      onClick: () =>
                        void askText(`Forget which template?\n${listTemplates().map((t) => t.name).join('\n')}`).then((v) => {
                          const name = v?.trim();
                          const t = listTemplates().find((x) => x.name === name);
                          if (t) forgetTemplate(t.id);
                        }),
                    },
                  ]
                : []),
            ]
          : []),
        ...styleActions(n),
        { label: 'Disconnect all', onClick: () => setEdges((es) => es.filter((e) => e.source !== n.id && e.target !== n.id)) },
        ...leave,
        remove,
      ],
    };
  };
  const nm = nodeMenu();
  // minimap: section colours, nodes with errors in red, frames as light boxes
  const miniColor = (n: Node) => {
    const a = n as AppNode;
    if (a.type === 'frame') return `${nodeColor(a)}30`;
    return engine.results.get(a.id)?.errors.length ? ERROR_RED : nodeColor(a);
  };
  const miniStroke = (n: Node) => (engine.results.get(n.id)?.errors.length ? ERROR_RED : nodeColor(n as AppNode));

  const menuItems: MenuItem[] = useMemo(() => GROUPS.flatMap((g) => g.items.filter((i) => !i.hidden).map((i) => ({ type: (i.key ?? i.type) as AppNode['type'], label: i.label, group: g.name }))), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // the nodes panel (left): the sections of GROUPS with the colours of their nodes
  const templates = useTemplates();
  const paletteGroups: PaletteGroup[] = useMemo(
    () => [
      ...GROUPS.map((g) => ({
        name: g.name,
        color: GROUP_COLORS[g.name],
        items: [
          ...g.items.filter((t) => !t.hidden).map((t) => ({ type: (t.key ?? t.type) as AppNode['type'], label: t.label, help: NODE_SHORT[t.type] ?? NODE_HELP[t.type], color: NODE_COLORS[t.type] })),
          // a Batch with no steps yet: its steps built inside, on one file
          ...(g.name === 'Data' ? [{ type: BATCH_NEW as AppNode['type'], label: 'Batch', help: 'The same analysis on every file: connect an Import with several files (or a folder) to “files”, open it, build the steps on one file, connect to “+ keep” what to keep: a table with a row per file comes out.', color: GROUP_COLORS.Groups }] : []),
        ],
      })),
      ...(templates.length
        ? [
            {
              name: 'My templates',
              color: GROUP_COLORS.Groups,
              items: templates.map((t) => ({ type: `template:${t.id}` as AppNode['type'], label: t.name, help: `Template “${t.name}”: a group of ${t.data.nodes.length - 2} nodes. Right-click it on the canvas to open or ungroup it.`, color: GROUP_COLORS.Groups })),
            },
          ]
        : []),
    ],
    [templates],
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const template = (type: AppNode['type']): Template | undefined => {
    if ((type as string) === BATCH_NEW) return { type: 'subgraph', label: 'Batch', data: emptyBatch() };
    const m = /^template:(.+)$/.exec(type);
    if (!m) return GROUPS.flatMap((g) => g.items).find((i) => (i.key ?? i.type) === type);
    const t = templateById(m[1]);
    return t ? { type: 'subgraph', label: t.name, data: { ...structuredClone(t.data), name: t.name } } : undefined;
  };
  // a node dragged from the panel: dropped where the mouse is
  // (a file: a project, or a figure with its project in it)
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      return;
    }
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: DragEvent) => {
    const files = [...(e.dataTransfer.files ?? [])];
    if (files.length && !e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      // data files: an Import node with them where they are dropped; else a project or a figure with its project
      const data = files.filter((f) => DATA_FILE.test(f.name));
      if (data.length) void importFiles(data, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      else void openAnyFile(files[0], true);
      return;
    }
    const t = template(e.dataTransfer.getData(DRAG_TYPE) as AppNode['type']);
    if (!t) return;
    e.preventDefault();
    const at = { x: e.clientX, y: e.clientY };
    const id = addNode(t, at);
    // (dropped on a connection: put into it once its handles are drawn)
    whenDrawn(id, () => {
      const d = spliceAt(id, at.x, at.y);
      if (d) splice(id, d);
    });
  };

  // data files dropped on the canvas: an Import node holding them (a table, or a workbook's sheets)
  const importFiles = async (files: File[], position: { x: number; y: number }) => {
    try {
      const got = await readFiles(files);
      const id = `import-${crypto.randomUUID().slice(0, 8)}`;
      const fileName = files.length === 1 ? files[0].name : `${files.length} files`;
      const data = { ...structuredClone(IMPORT_DEFAULTS), textId: crypto.randomUUID().slice(0, 8), fileName, ...('text' in got ? { text: got.text } : { text: '', sheets: got.sheets }) };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: 'import', position, data, selected: true } as AppNode]);
    } catch (err) {
      notify(`The file could not be read: ${(err as Error).message}`);
    }
  };
  // a node asks for “Plot these columns” (the Plot… button of Import)
  useEffect(() => {
    const ask = (e: Event) => setPlotFrom((e as CustomEvent<string>).detail);
    window.addEventListener('graph-flow:plot', ask);
    return () => window.removeEventListener('graph-flow:plot', ask);
  }, []);
  // a node's “More in Help”: Help opened at its entry
  const [helpAt, setHelpAt] = useState<{ type: NodeType; n: number } | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      setHelpAt((h) => ({ type: (e as CustomEvent<NodeType>).detail, n: (h?.n ?? 0) + 1 }));
      setPanel('help');
    };
    window.addEventListener('graph-flow:help', open);
    return () => window.removeEventListener('graph-flow:help', open);
  }, []);

  const addNode = (t: Template, at?: { x: number; y: number }) => {
    const r = canvasRef.current?.getBoundingClientRect();
    let position = screenToFlowPosition(at ?? (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    // nodes added one after another by a click: shifted so they do not cover each other
    if (!at) {
      const taken = (q: { x: number; y: number }) => getNodes().some((n) => Math.abs(n.position.x - q.x) < 24 && Math.abs(n.position.y - q.y) < 24);
      for (let k = 0; k < 40 && taken(position); k++) position = { x: position.x + 36, y: position.y + 36 };
    }
    if (prefs.snap) position = { x: Math.round(position.x / prefs.step) * prefs.step, y: Math.round(position.y / prefs.step) * prefs.step };
    const id = `${t.type}-${crypto.randomUUID().slice(0, 8)}`;
    // a Python script added here: the project's code is the user's own
    if (t.type === 'python') allowProject();
    const data = structuredClone(t.data);
    // each new curve in the next colour of the palette
    if (t.type === 'plot1d') {
      const k = getNodes().filter((n) => n.type === 'plot1d').length;
      (data as typeof PLOT1D_DEFAULTS).style = { ...PLOT1D_DEFAULTS.style, color: PALETTE[k % PALETTE.length] };
    }
    // the new node on top (last and selected); the others deselected
    const size = t.type === 'note' ? NOTE_SIZE : {};
    // the settings chosen as the default of its kind (this browser)
    const made = withDefaultStyle({ id, type: t.type, position, data, ...size, selected: true } as AppNode);
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), made]);
    return id;
  };

  // a guided tour: its step, its window over the canvas; where it was left (step, project) kept in this browser
  const [tour, setTour] = useState<{ id: string; step: number } | null>(null);
  const tourDef = tour ? TOURS.find((t) => t.id === tour.id) : undefined;
  useEffect(() => {
    if (tour) saveTourProgress({ tour: tour.id, step: tour.step, project: projectId });
  }, [tour, projectId]);
  const tourStep = useCallback((k: number) => setTour((t) => t && { ...t, step: Math.max(0, k) }), []);
  // a tour starts in a project of its own; one left half-way goes on in its project (opened again when another is open)
  const startTour = (id: string) => {
    const t = TOURS.find((q) => q.id === id);
    if (!t) return;
    setWelcome(false);
    const left = loadTourProgress();
    const fresh = () => {
      load(t.project ? { ...EMPTY, ...t.project() } : EMPTY, `Tour: ${t.title}`);
      setTour({ id, step: 0 });
    };
    if (left?.tour !== id || left.step === 0) return fresh();
    if (left.project === projectId) return setTour({ id, step: left.step });
    void libGet(left.project).then((p) => {
      if (typeof p === 'string') return fresh();
      load(p);
      setTour({ id, step: left.step });
    });
  };
  const closeTour = (finished: boolean) => {
    setTour(null);
    if (finished) saveTourProgress(null);
  };
  // what Show me does
  const tourApi: TourApi = {
    importText: (name, text) => {
      const r = canvasRef.current?.getBoundingClientRect();
      void importFiles([new File([text], name, { type: 'text/csv' })], screenToFlowPosition(r ? { x: r.left + r.width / 5, y: r.top + r.height / 6 } : { x: 200, y: 150 }));
    },
    plot: (id) => {
      const out = engine.results.get(id)?.outputs.out;
      const cols = out?.t === 'dataset' ? out.v.columns.map((c) => c.name) : [];
      if (cols.length > 1) makeFigure(id, { graph: 'line', curves: cols.slice(1).map((y) => ({ x: cols[0], y, yerr: '', xerr: '' })), into: '', split: 'one', merge: false, style: '' });
    },
    place: (spec) => placeOf(getNodes(), spec),
    add: (spec, at) => {
      const id = `${spec.type}-${crypto.randomUUID().slice(0, 8)}`;
      const r = withAdded(getNodes(), getEdges(), spec, id, at);
      setNodes(r.nodes);
      setEdges(r.edges);
      return id;
    },
    connect: (from, to) => setEdges((es) => (es.some((e) => e.target === to && e.targetHandle === from.to && e.source === from.id) ? es : [...es, wireEdge(from, to)])),
    frame: (ids, name) => {
      const r = groupNodes(getNodes(), ids, name, FRAME_COLORS[0]);
      if (r.frameId) setNodes(r.nodes);
    },
    setData: (id, f) => setNodes((ns) => ns.map((n) => (n.id === id ? ({ ...n, data: f(n.data as Record<string, unknown>) } as AppNode) : n))),
    select: (id) => setNodes((ns) => ns.map((n) => (!!n.selected === (n.id === id) ? n : { ...n, selected: n.id === id }))),
    nodes: () => getNodes(),
    edges: () => getEdges(),
    toScreen: (p) => flowToScreenPosition(p),
    // the place of a new node (as large as a usual one) brought into view when it is not
    reveal: async (p) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return;
      // the open Nodes and Options panels cover the canvas at its sides
      const left = r.left + (document.querySelector('.palette.overlay:not(.inspector)')?.getBoundingClientRect().width ?? 0);
      const right = r.right - (document.querySelector('.inspector.overlay')?.getBoundingClientRect().width ?? 0);
      const a = flowToScreenPosition(p);
      const b = flowToScreenPosition({ x: p.x + 560, y: p.y + 360 });
      if (a.x >= left && a.y >= r.top && b.x <= right && b.y <= r.bottom) return;
      // (its animation stops while the page is hidden: never waited for longer than it lasts)
      // its middle brought to the middle of what the panels leave free
      const shift = screenToFlowPosition({ x: (left + right) / 2, y: 0 }).x - screenToFlowPosition({ x: r.left + r.width / 2, y: 0 }).x;
      await Promise.race([setCenter(p.x + 280 - shift, p.y + 180, { zoom: getZoom(), duration: 500 }), new Promise((done) => setTimeout(done, 700))]);
    },
  };

  // recording mode (?record): what the film script needs besides Show me
  const recordExtra: RecordExtra = {
    blank: () => load(EMPTY, 'Untitled project'),
    example: async (name) => {
      const list = examples.length ? examples : await loadExamples();
      const ex = list.find((e) => e.name.startsWith(name));
      if (ex) load(ex.make(), ex.name);
      return !!ex;
    },
    // the nodes as large as they fit (at most their own size), their right edge against the Options panel (room px
    // at the right), their top at the top: the film shows them and the panel side by side, little canvas between
    focus: async (ids, room = 0) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return;
      if (!room) {
        await fitView({ nodes: ids.map((id) => ({ id })), padding: 0.06, duration: 0, maxZoom: 1 });
        return;
      }
      const b = getNodesBounds(ids);
      const z = Math.min(1, (r.width - room - 60) / b.width, (r.height - 48) / b.height);
      await setViewport({ x: r.width - room - 24 - (b.x + b.width) * z, y: 24 - b.y * z, zoom: z });
    },
    // one node: as large as fits beside the panel (a tall one: its top part), against the panel
    focusTop: async (id, room = 0) => {
      const n = getInternalNode(id);
      const r = canvasRef.current?.getBoundingClientRect();
      if (!n || !r) return;
      const p = n.internals.positionAbsolute;
      const w = n.measured.width ?? 560;
      const z = Math.min(1, (r.width - room - 60) / w);
      await setViewport({ x: r.width - room - 24 - (p.x + w) * z, y: 24 - p.y * z, zoom: z });
    },
    setTheme,
    setColors,
  };

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand" title="SciPlotFlow: node-based data analysis and graphs">
          <img className="logo" src="./logo.svg" alt="" width={22} height={22} />
          <strong className="brand-text">SciPlotFlow</strong>
        </span>
        <input
          className="project-name"
          value={projectName}
          placeholder="Untitled project"
          title={`The current project (the example loaded, the file opened, or a name of your own)${history.canUndo ? ' · modified since it was loaded' : ''}`}
          onChange={(e) => setProjectName(e.target.value)}
        />
        {history.canUndo && <span className="muted" title="Modified since it was loaded">•</span>}
        {autosaveFailed && (
          <span className="save-warning" title="The browser storage is full: the changes are not kept for the next visit. Save the project to a file (Save), or delete projects kept in the browser (Projects).">
            <TriangleAlert {...IC} /> not autosaved: use Save
          </span>
        )}
        <span className="tb-group" role="group" aria-label="Project">
        <button onClick={newProject} title="Remove everything and start an empty project"><FilePlus2 {...IC} /> <span className="tb-label">New</span></button>
        <select
          className="examples-menu"
          value=""
          title="Open a complete example"
          onChange={(e) => {
            const ex = examples[Number(e.target.value)];
            if (ex) void askUser(`Replace the current project with the “${ex.name}” example?`, { ok: 'Open the example' }).then((yes) => yes && load(ex.make(), ex.name));
          }}
        >
          <option value="">Examples</option>
          {/* grouped by subject, each group titled */}
          {[...new Set(examples.map((ex) => ex.group))].map((g) => (
            <optgroup key={g} label={g}>
              {examples.map((ex, i) =>
                ex.group === g ? (
                  <option key={ex.name} value={i}>
                    {ex.name}
                  </option>
                ) : null,
              )}
            </optgroup>
          ))}
        </select>
        <button onClick={() => openFile.current?.click()} title="Open a project file (.json), or a figure exported with its project (.svg, .png: the project opens at that figure)">
          <FolderOpen {...IC} /> <span className="tb-label">Open</span>
        </button>
        <button
          onClick={() =>
            download(stringifyProject(toProject(root.nodes, root.edges, projectName, projectId), 1), `${(projectName || 'sciplotflow-project').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')}.json`, 'application/json')
          }
          title="Save the project to a file (.json)"
        >
          <Save {...IC} /> <span className="tb-label">Save</span>
        </button>
        <button className={panel === 'projects' ? 'active' : ''} onClick={() => togglePanel('projects')} title="Several projects kept in this browser">
          <Library {...IC} /> <span className="tb-label">Projects</span>
        </button>
        {EDITABLE_FIGURES && (
          <button className={panel === 'docs' ? 'active' : ''} onClick={() => togglePanel('docs')} title="Update the figures of this project in a Word or PowerPoint document (figures exported with “project inside”)">
            Update document…
          </button>
        )}
        </span>
        <span className="tb-group" role="group" aria-label="Share">
        {/* hidden (2026-10-23): the projects are too large for a link; Save makes the file to send */}
        {SHOW_SHARE_LINK && <button
          title="Copy a link that opens this project (the whole project is in the link: nothing is sent to a server)"
          onClick={async () => {
            const code = await encodeProject(toProject(root.nodes, root.edges, projectName, projectId));
            const url = `${location.origin}${location.pathname}#p=${code}`;
            if (url.length > 60000) notify('The project is too large for a link (imported data): use Save and send the file.');
            else {
              try {
                await navigator.clipboard.writeText(url);
                notify('A link to this project was copied to the clipboard.', 'ok');
              } catch {
                void askText('Copy this link (the browser did not let the app copy it):', url);
              }
            }
          }}
        >
          <Link2 {...IC} /> <span className="tb-label">Share link</span>
        </button>}
        <button className={panel === 'collab' ? 'active' : ''} onClick={() => togglePanel('collab')} title={collab ? `Working together: ${peerCount + 1} in the session` : 'Work on this project together, in real time, browser to browser'}>
          <Users {...IC} /> <span className="tb-label">{collab ? `Together · ${peerCount + 1}` : 'Collaborate'}</span>
        </button>
        </span>
        <span className="tb-group" role="group" aria-label="Edit">
        <button className={finding ? 'active' : ''} onClick={() => setFinding(true)} title="Find a node on the canvas by its name or type (Ctrl+F)">
          <Search {...IC} /> <span className="tb-label keep">Find node</span>
        </button>
        <button className={inspecting ? 'active' : ''} onClick={() => setInspecting((v) => !v)} title={inspecting ? 'Inspect: on, click a node or a connection to see its data in the options panel; click here to stop' : 'Inspect: see the data a node gives or a connection carries (a table, in the options panel), without making a workbook'}>
          <TableProperties {...IC} /> <span className="tb-label keep">Inspect</span>
        </button>
        <span className="undo-redo">
          <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 {...IC} /></button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo"><Redo2 {...IC} /></button>
        </span>
        </span>
        <span className="tb-spacer" />
        <TopCredit />
        <button className={panel === 'help' ? 'active' : ''} onClick={() => togglePanel('help')} title="Getting started, the nodes, shortcuts, validation">
          <CircleHelp {...IC} /> <span className="tb-label">Help</span>
        </button>
        <span className="tb-group tb-theme" role="radiogroup" aria-label="Colour theme">
          {(
            [
              ['system', Monitor, 'Theme: as the system'],
              ['light', Sun, 'Theme: light'],
              ['dark', Moon, 'Theme: dark'],
            ] as const
          ).map(([t, Icon, label]) => (
            <button key={t} className={theme === t ? 'active' : ''} role="radio" aria-checked={theme === t} aria-label={label} title={label} onClick={() => setTheme(t)}>
              <Icon {...IC} />
            </button>
          ))}
        </span>
        <ColorChoice value={colors.select} shown="var(--select)" label="Selection" title="Selection colour (around the selected nodes)" onChange={(c) => setColors((p) => ({ ...p, select: c }))} />
        <ColorChoice value={colors.accent} shown="var(--accent)" label="Accent" title="Accent colour (active buttons, tabs)" same onChange={(c) => setColors((p) => ({ ...p, accent: c }))} />
        <input
          ref={openFile}
          type="file"
          accept=".json,.svg,.png"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await openAnyFile(f, false);
          }}
        />
      </header>
      <div className="workspace">
      <NodePalette groups={paletteGroups} onAdd={(type) => { const t = template(type); if (t) addNode(t); }} />
        <ProjectInfoContext.Provider value={projectInfo}>
        <EngineContext.Provider value={engine}>
          <GroupNavContext.Provider value={{ open: openGroup, current: currentGroup }}>
          <div
            className={`canvas${inspecting ? ' inspecting' : ''}`}
            ref={canvasRef}
            onDragOver={onDragOver}
            onDrop={onDrop}
            // working together: the mouse on the canvas shown to the others (in the canvas' coordinates)
            onMouseMove={collab ? (e) => collab.presence.set({ cursor: screenToFlowPosition({ x: e.clientX, y: e.clientY }) }) : undefined}
            onMouseLeave={collab ? () => collab.presence.set({ cursor: null }) : undefined}
          >
            {stack.length > 0 && (
              <div className="group-bar">
                <button className="btn-run" onClick={closeGroup} title="Back to the level above">
                  <ArrowLeft {...IC} /> back
                </button>
                <span className="muted">Inside:</span>
                <b>
                  Project ›{' '}
                  {stack
                    .map((l) => (l.nodes.find((n) => n.id === l.groupId)?.data as { name?: string } | undefined)?.name || 'Group')
                    .join(' › ')}
                </b>
                {currentGroup?.batch ? <BatchFileBar files={batchFiles} shown={batchShown} unit={batchUnit} kept={portNames(currentGroup.outputs)} onShow={showBatchFile} ownSteps={ownSteps} skippedSteps={skippedSteps} ownCount={(name) => Object.keys(currentGroup.batch?.own?.[name] ?? {}).length + (currentGroup.batch?.skip?.[name]?.length ?? 0)} onBack={ownBack} onForAll={ownForAll} onUnskip={(id) => setStepSkip(id, false)} /> : <span className="hint">The Group input and Group output nodes are its ports.</span>}
              </div>
            )}
            <ReactFlow
              nodes={shownNodes}
              edges={styledEdges}
              onNodesChange={onNodesRouted}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              minZoom={0.1}
              zoomOnDoubleClick={false}
              multiSelectionKeyCode={MULTI_KEYS}
              deleteKeyCode={DELETE_KEYS}
              colorMode={theme}
              edgeTypes={edgeTypes}
              connectionLineType={prefs.shape === 'orthogonal' ? ConnectionLineType.SmoothStep : ConnectionLineType.Bezier}
              snapToGrid={prefs.snap}
              snapGrid={[prefs.step, prefs.step]}
              onPaneClick={() => {
                closeMenu();
                setPaneClicks((k) => k + 1);
              }}
              onNodeClick={(_, n) => {
                setNodeClicks((k) => k + 1);
                if (inspecting) inspectData({ kind: 'node', id: n.id });
              }}
              onEdgeClick={(_, e) => inspecting && inspectData({ kind: 'edge', id: e.id })}
              onMoveStart={closeMenu}
              onNodeDragStart={closeMenu}
              onNodeDrag={(ev, n) => {
                const d = 'clientX' in ev ? spliceAt(n.id, ev.clientX, ev.clientY) : null;
                if (d?.edge !== dropEdge?.edge) setDropEdge(d);
              }}
              onNodeDragStop={(ev, n) => {
                const d = 'clientX' in ev ? spliceAt(n.id, ev.clientX, ev.clientY) : null;
                setDropEdge(null);
                if (d) splice(n.id, d);
              }}
              onPaneContextMenu={(e) => {
                e.preventDefault();
                setMenu({ kind: 'pane', x: e.clientX, y: e.clientY });
              }}
              onBeforeDelete={onBeforeDelete}
              onEdgeDoubleClick={(ev, e) => {
                const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
                const rid = `reroute-${crypto.randomUUID().slice(0, 8)}`;
                setNodes((ns) => [...ns, { id: rid, type: 'reroute', position: { x: p.x - 7, y: p.y - 7 }, data: {} } as AppNode]);
                setEdges((es) => [
                  ...es.filter((x) => x.id !== e.id),
                  { id: `e-${e.source}-${e.sourceHandle ?? ''}-${rid}`, source: e.source, sourceHandle: e.sourceHandle, target: rid, targetHandle: 'in' },
                  { id: `e-${rid}-${e.target}-${e.targetHandle ?? ''}`, source: rid, sourceHandle: 'out', target: e.target, targetHandle: e.targetHandle },
                ]);
              }}
              onNodeMouseEnter={(_, n) => setHovered(n.type === 'frame' ? null : n.id)}
              onNodeMouseLeave={() => setHovered(null)}
              onNodeContextMenu={(e, n) => {
                e.preventDefault();
                // right-click on one of several selected nodes: the menu of the selection
                const sel = getNodes().filter((x) => x.selected);
                if (n.selected && sel.length > 1) setMenu({ kind: 'selection', x: e.clientX, y: e.clientY, ids: sel.map((x) => x.id) });
                else setMenu({ kind: 'node', x: e.clientX, y: e.clientY, nodeId: n.id, label: nodeTitle(n) });
              }}
              onSelectionContextMenu={(e, ns) => {
                e.preventDefault();
                setMenu({ kind: 'selection', x: e.clientX, y: e.clientY, ids: ns.map((n) => n.id) });
              }}
            >
              <Background gap={prefs.snap ? prefs.step : 20} />
              <Controls showFitView={false} orientation="horizontal">
                <ControlButton onClick={fitAll} title="Fit view" aria-label="Fit view">
                  <Maximize {...IC} />
                </ControlButton>
                <ControlButton
                  className={prefs.snap ? 'on' : ''}
                  onClick={() => setPref({ snap: !prefs.snap })}
                  title={prefs.snap ? `Snap to grid: on (${prefs.step} px), click to move freely` : 'Snap to grid: off, click to position on a grid'}
                  aria-label="Snap to grid"
                >
                  <Grid3x3 {...IC} />
                </ControlButton>
                {prefs.snap && (
                  <ControlButton onClick={() => setPref({ step: STEPS[(STEPS.indexOf(prefs.step) + 1) % STEPS.length] })} title="Grid step (click to change)" aria-label="Grid step">
                    <span className="step">{prefs.step}</span>
                  </ControlButton>
                )}
                <ControlButton
                  className={prefs.shape === 'orthogonal' ? 'on' : ''}
                  onClick={() => setPref({ shape: prefs.shape === 'orthogonal' ? 'curved' : 'orthogonal' })}
                  title={prefs.shape === 'orthogonal' ? 'Connections: right angles, click for curves' : 'Connections: curves, click for right angles'}
                  aria-label="Connection shape"
                >
                  {prefs.shape === 'orthogonal' ? <CornerDownRight {...IC} /> : <Spline {...IC} />}
                </ControlButton>
                <ControlButton className={prefs.arrows ? 'on' : ''} onClick={() => setPref({ arrows: !prefs.arrows })} title={prefs.arrows ? 'Arrows on the connections (direction of the data): on' : 'Arrows on the connections (direction of the data): off'} aria-label="Arrows">
                  <ArrowRight {...IC} />
                </ControlButton>
                <ControlButton onClick={() => setFinding(true)} title="Find a node (Ctrl+F)" aria-label="Find a node">
                  <Search {...IC} />
                </ControlButton>
                <ControlButton className={prefs.minimap ? 'on' : ''} onClick={() => setPref({ minimap: !prefs.minimap })} title={prefs.minimap ? 'Minimap: on, click to hide it' : 'Minimap: off, click to show it'} aria-label="Minimap">
                  <MapIcon {...IC} />
                </ControlButton>
              </Controls>
              {prefs.minimap && <MiniMap pannable zoomable nodeColor={miniColor} nodeStrokeColor={miniStroke} nodeBorderRadius={3} />}
              {collab && <PresenceLayer presence={collab.presence} level={level} />}
            </ReactFlow>
            {/* an empty project: where to start */}
            {nodes.length === 0 && !stack.length && (
              <div className="empty-hint">
                <b>Drop a data file here</b> (CSV, text, Excel …) to start,
                <br />
                or click Import in the Nodes panel, or open one of the Examples.
              </div>
            )}
            {RECORD && <RecordLayer api={tourApi} extra={recordExtra} />}
            {tour && tourDef && <TourPanel tour={tourDef} step={tour.step} onStep={tourStep} nodes={root.nodes} edges={root.edges} value={(id, h = 'out') => engine.results.get(id)?.outputs[h]} api={tourApi} onClose={closeTour} />}
            <div className={`panel-host${panelClosing ? ' leaving' : ''}`}>
            <Suspense fallback={null}>
              {shownPanel === 'projects' && (
                <ProjectsPanel
                  onClose={() => setPanel(null)}
                  currentId={projectId}
                  keepCurrent={() => libPut(toProject(root.nodes, root.edges, projectName, projectId), projectName.trim() || 'untitled')}
                  onRename={(id, name) => id === projectId && setProjectName(name)}
                  onNew={(name) => {
                    const p: Project = { ...EMPTY, id: newProjectId(), name };
                    load(p, name);
                    void libPut(p, name);
                  }}
                  onOpen={(p, name) => {
                    load(p, name);
                    setPanel(null);
                  }}
                />
              )}
              {shownPanel === 'collab' && <CollabPanel onClose={() => setPanel(null)} session={collab} answer={answerInfo} joinCode={joinCode} onStart={(name) => void startSession(name)} onJoin={joinSession} onRejoin={rejoinSession} onLeave={leaveSession} />}
              {shownPanel === 'docs' && <DocumentPanel onClose={() => setPanel(null)} current={projectInfo.current} id={projectId} results={rootEngine.results} />}
            </Suspense>
            </div>
            {finding && <FindNode onClose={() => setFinding(false)} />}
            {panel === 'help' && (
              <Suspense fallback={null}>
                <HelpWindow
                  onClose={() => setPanel(null)}
                  examples={examples}
                  focus={helpAt}
                  onWelcome={() => {
                    setPanel(null);
                    setWelcome(true);
                  }}
                  onExample={(name) => {
                    const ex = examples.find((e) => e.name === name);
                    setPanel(null);
                    if (ex) load(ex.make(), ex.name);
                  }}
                />
              </Suspense>
            )}
            {welcome && (
              <Welcome
                examples={examples}
                current={{ name: projectName, nodes: root.nodes.length }}
                onClose={() => setWelcome(false)}
                onImport={(files) => {
                  setWelcome(false);
                  // data files: an Import node in the middle of the canvas; a project or a figure: opened
                  const data = files.filter((f) => DATA_FILE.test(f.name));
                  const r = canvasRef.current?.getBoundingClientRect();
                  if (data.length) void importFiles(data, screenToFlowPosition(r ? { x: r.left + r.width / 3, y: r.top + r.height / 4 } : { x: 200, y: 150 }));
                  else void openAnyFile(files[0], false);
                }}
                onOpenFile={() => {
                  setWelcome(false);
                  openFile.current?.click();
                }}
                onNew={() => {
                  setWelcome(false);
                  load(EMPTY);
                }}
                onExample={(i) => {
                  const ex = examples[i];
                  setWelcome(false);
                  if (ex) load(ex.make(), ex.name);
                }}
                onTour={startTour}
                onProject={(e) => {
                  setWelcome(false);
                  void libGet(e.id).then((p) => (typeof p === 'string' ? notify(p) : load(p, e.name)));
                }}
              />
            )}
            {plotFrom && plotSource && (
              <PlotColumnsDialog
                name={plotSource.book?.name || plotSource.shown.name}
                shown={plotSource.shown}
                sheets={plotSource.book?.sheets}
                shownSheet={plotSource.book ? plotSource.shown.name : undefined}
                plots={getNodes().flatMap((n): [string, string][] => (n.type === 'plot1d' ? [[n.id, plotName(n)]] : []))}
                onClose={() => setPlotFrom(null)}
                onDone={(c) => {
                  makeFigure(plotFrom, c);
                  setPlotFrom(null);
                }}
              />
            )}
            {menu && (
              <ContextMenu
                menu={menu}
                items={menu.kind === 'connect' ? menuItems.filter((i) => fitsConnect(menu.from, GROUPS.flatMap((g) => g.items).find((q) => (q.key ?? q.type) === i.type)!)) : menuItems}
                onClose={closeMenu}
                onAdd={(type) => {
                  const t = GROUPS.flatMap((g) => g.items).find((i) => (i.key ?? i.type) === type);
                  if (t && menu.kind === 'connect') addConnected(t, menu);
                  else if (t) addNode(t, { x: menu.x, y: menu.y });
                }}
                title={nm?.title}
                actions={nm?.actions}
              />
            )}
          </div>
          </GroupNavContext.Provider>
        </EngineContext.Provider>
        </ProjectInfoContext.Provider>
        <Inspector
          current={selectedOne}
          pinned={pinnedNodes}
          onPin={pin}
          paneClicks={paneClicks}
          nodeClicks={nodeClicks}
          top={batchStepTop}
          data={{
            targets: dataTargets,
            results: engine.results,
            nodes,
            edges,
            onPin: (t, on) => setDataTargets((ts) => ts.map((x) => (x.kind === t.kind && x.id === t.id ? { ...x, pinned: on || undefined } : x))),
            onClose: (t) => setDataTargets((ts) => ts.filter((x) => !(x.kind === t.kind && x.id === t.id))),
          }}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
