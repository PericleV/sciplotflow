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
  type IsValidConnection,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ReportNodeView } from './nodes/ReportNode.tsx';
import './App.css';
import { EngineContext, useEngine } from './engine/engine.ts';
import { canConnect, isMultiInput, PORT_COLORS, sourcePort, type PortContext } from './engine/ports.ts';
import { REPORT_DEFAULTS, MATCOMP_DEFAULTS, MATRIX_DEFAULTS, COLUMNS_DEFAULTS, PEAKWIDTH_DEFAULTS, AUTOEXTRACT_DEFAULTS, CANVAS_DEFAULTS, DRAWING_DEFAULTS, COMBINE_DEFAULTS, UNSTACK_DEFAULTS, WORKBOOK_DEFAULTS, CALCULUS_DEFAULTS, FILTER_DEFAULTS, CLEAN_DEFAULTS, SMOOTH_DEFAULTS, INTERP_DEFAULTS, NORMALIZE_DEFAULTS, FFT_DEFAULTS, CONV_DEFAULTS, AVERAGE_DEFAULTS, DIGITIZER_DEFAULTS, HISTOGRAM_DEFAULTS, BARCHART_DEFAULTS, BOXVIOLIN_DEFAULTS, PROBPLOT_DEFAULTS, BLANDALTMAN_DEFAULTS, PIE_DEFAULTS, CONTOUR_DEFAULTS, POLAR_DEFAULTS, SCATTERMATRIX_DEFAULTS, TERNARY_DEFAULTS, WATERFALL_DEFAULTS, PLOT3D_DEFAULTS, CURVEMATH_DEFAULTS, TRANSLATE_DEFAULTS, PEAK_DEFAULTS, NORM_DEFAULTS, TTEST_DEFAULTS, ANOVA_DEFAULTS, NONPAR_DEFAULTS, CORR_DEFAULTS, PICK_DEFAULTS, DATAMANIP_DEFAULTS, EXTRACT_DEFAULTS, FIT_DEFAULTS, GENCOL_DEFAULTS, IMPORT_DEFAULTS, MATHCOL_DEFAULTS, PYTHON_DEFAULTS, NOTE_DEFAULTS, NOTE_SIZE,PLOT1D_DEFAULTS, STATS_DEFAULTS } from './defaults.ts';
import { NODE_HELP } from './help.ts';
import { DRAG_TYPE, NodePalette, type PaletteGroup } from './NodePalette.tsx';
// side panels: separate chunks, loaded when first opened
const ProjectsPanel = lazy(() => import('./ProjectsPanel.tsx').then((m) => ({ default: m.ProjectsPanel })));
const DocumentPanel = lazy(() => import('./DocumentPanel.tsx').then((m) => ({ default: m.DocumentPanel })));
const HelpPanel = lazy(() => import('./HelpPanel.tsx').then((m) => ({ default: m.HelpPanel })));
import { download } from './figure/export.ts';
import { PALETTE } from './figure/spec.ts';
import { ContextMenu, type MenuAction, type MenuItem, type MenuState } from './ContextMenu.tsx';
import { groupNodes, releaseChildren, removeFromGroup, ungroup } from './groups.ts';
import { useHistory } from './history.ts';
import { Inspector } from './Inspector.tsx';
import { hasPanel } from './nodes/inspectorStore.ts';
import { editCaption } from './nodes/captionStore.ts';
import { FlowEdge } from './FlowEdge.tsx';
import { withShell } from './nodes/NodeShell.tsx';
import { FrameNodeView } from './nodes/FrameNode.tsx';
import { applyTheme, loadPrefs, loadTheme, savePrefs, STEPS, type CanvasPrefs, type Theme } from './theme.ts';
import { hasRefs, withTexts } from './textStore.ts';
import { libMigrate, libPut } from './library.ts';
import { allowProject, openProject } from './python/runner.ts';
import { PythonNodeView } from './nodes/PythonNode.tsx';
import { autosave, decodeProject, encodeProject, keepLastSession, parseProject, PROJECT_VERSION, saveToBrowser, stringifyProject, toProject, type Project } from './project.ts';
import { fileProject, newProjectId, openEmbedded, projectRevision, type FigureRef } from './figure/embed.ts';
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
import { WorkbookNodeView } from './nodes/WorkbookNode.tsx';
import { CalculusNodeView } from './nodes/CalculusNode.tsx';
import { PickNodeView } from './nodes/PickNode.tsx';
import { PeakNodeView } from './nodes/PeakNode.tsx';
import { TranslateNodeView } from './nodes/CurveNodes.tsx';
import { CurveMathNodeView } from './nodes/CurveMathNode.tsx';
import { CleanNodeView, FilterNodeView } from './nodes/CleanNodes.tsx';
import { DigitizerNodeView } from './nodes/DigitizerNode.tsx';
import { HistogramNodeView } from './nodes/HistogramNode.tsx';
import { BarChartNodeView } from './nodes/BarChartNode.tsx';
import { BoxViolinNodeView } from './nodes/BoxViolinNode.tsx';
import { ProbPlotNodeView } from './nodes/ProbPlotNode.tsx';
import { BlandAltmanNodeView } from './nodes/BlandAltmanNode.tsx';
import { PieNodeView } from './nodes/PieNode.tsx';
import { ContourNodeView } from './nodes/ContourNode.tsx';
import { PolarNodeView } from './nodes/PolarNode.tsx';
import { ScatterMatrixNodeView } from './nodes/ScatterMatrixNode.tsx';
import { TernaryNodeView } from './nodes/TernaryNode.tsx';
import { WaterfallNodeView } from './nodes/WaterfallNode.tsx';
import { Plot3DNodeView } from './nodes/Plot3DNode.tsx';
import { MatCompNodeView, MatrixNodeView } from './nodes/MatrixNodes.tsx';
import { AverageNodeView, ConvNodeView, FFTNodeView, InterpNodeView, NormalizeNodeView, SmoothNodeView } from './nodes/SignalNodes.tsx';
import { AnovaNodeView, CorrNodeView, NonparNodeView, NormNodeView, TTestNodeView } from './nodes/TestNodes.tsx';
import { RerouteNodeView } from './nodes/RerouteNode.tsx';
import { GroupInNodeView, GroupNodeView, GroupOutNodeView } from './nodes/GroupNodes.tsx';
import { GroupNavContext } from './nodes/groupNav.ts';
import { forgetTemplate, listTemplates, saveTemplate, templateById, useTemplates } from './nodes/templates.ts';
import { composeRoot, makeGroup, ungroupNode, type Level } from './engine/subgraph.ts';
import type { NodeResult } from './engine/evaluate.ts';
import { canPaste, copySettings, pastedData, useClipboard } from './nodes/clipboard.ts';
import { clearDefaultStyle, defaultStyleFor, forgetStyle, saveStyle, setDefaultStyle, styledData, stylesFor, userStylesFor, withDefaultStyle } from './nodes/styles.ts';
import { FRAME_COLORS, GROUP_COLORS, NODE_COLORS, nodeColor, nodeTitle } from './nodeColors.ts';
import { FindNode } from './FindNode.tsx';
import { PlotColumnsDialog, type PlotChoice } from './PlotColumnsDialog.tsx';
import { buildFigure } from './plotBuild.ts';
import { readFiles } from './readFiles.ts';
import type { AppNode, NodeType } from './types.ts';
import { ArrowLeft, ArrowRight, CornerDownRight, Grid3x3, Map as MapIcon, Maximize, Redo2, Search, Spline, TriangleAlert, Undo2 } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';

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
  smooth: SmoothNodeView,
  interp: InterpNodeView,
  normalize: NormalizeNodeView,
  fft: FFTNodeView,
  convolve: ConvNodeView,
  average: AverageNodeView,
  report: ReportNodeView,
  translate: TranslateNodeView,
  normality: NormNodeView,
  ttest: TTestNodeView,
  anova: AnovaNodeView,
  nonparam: NonparNodeView,
  correl: CorrNodeView,
  unstack: UnstackNodeView,
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
type Template = { type: AppNode['type']; label: string; data: AppNode['data']; hidden?: boolean };

const GROUPS: { name: keyof typeof GROUP_COLORS; items: Template[] }[] = [
  {
    name: 'Data',
    items: [
      { type: 'import', label: 'Import', data: IMPORT_DEFAULTS },
      { type: 'digitizer', label: 'Digitizer', data: DIGITIZER_DEFAULTS },
      { type: 'book', label: 'Workbook', data: WORKBOOK_DEFAULTS },
      { type: 'extract', label: 'Extract column', data: EXTRACT_DEFAULTS },
      { type: 'autoextract', label: 'Auto-extract', data: AUTOEXTRACT_DEFAULTS },
      { type: 'datamanip', label: 'Data manipulation', data: DATAMANIP_DEFAULTS },
      { type: 'mathcol', label: 'Math column', data: MATHCOL_DEFAULTS },
      { type: 'gencol', label: 'Generate column', data: GENCOL_DEFAULTS },
      { type: 'matrix', label: 'Matrix', data: MATRIX_DEFAULTS },
      { type: 'columns', label: 'Columns', data: COLUMNS_DEFAULTS },
      { type: 'unstack', label: 'Split into columns', data: UNSTACK_DEFAULTS },
      { type: 'combine', label: 'Combine columns', data: COMBINE_DEFAULTS },
      { type: 'translate', label: 'Translate', data: TRANSLATE_DEFAULTS },
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
    ],
  },
  {
    name: 'Analysis',
    items: [
      { type: 'fit', label: 'Fit', data: FIT_DEFAULTS },
      { type: 'python', label: 'Python script', data: PYTHON_DEFAULTS },
      { type: 'calculus', label: 'Differentiate / Integrate', data: CALCULUS_DEFAULTS },
      { type: 'peaks', label: 'Peak analyzer', data: PEAK_DEFAULTS },
      { type: 'peakwidth', label: 'Peak width', data: PEAKWIDTH_DEFAULTS },
      { type: 'pick', label: 'Pick points', data: PICK_DEFAULTS },
      { type: 'curvemath', label: 'Curve math', data: CURVEMATH_DEFAULTS },
      { type: 'matcomp', label: 'Matrix computation', data: MATCOMP_DEFAULTS },
      { type: 'report', label: 'Report', data: REPORT_DEFAULTS },
    ],
  },
  {
    name: 'Signal',
    items: [
      { type: 'smooth', label: 'Smooth', data: SMOOTH_DEFAULTS },
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
const loadExamples = () => import('./examples.ts').then((m) => m.EXAMPLES as ExampleList);
// The page opens on the project left at the last visit (kept automatically; Projects: “Last session”).
const lastSession = keepLastSession();
const EMPTY: Project = { app: 'graph-flow', version: PROJECT_VERSION, nodes: [], edges: [] };
const initial: Project = lastSession?.project ?? EMPTY;

// a project with Python code (in groups too)
const hasPython = (nodes: AppNode[]): boolean => nodes.some((n) => n.type === 'python' || (n.type === 'subgraph' && hasPython(n.data.nodes)));

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const history = useHistory(nodes, edges, setNodes, setEdges);
  // the project's title: the example loaded, the file opened, or typed in the toolbar
  const [projectName, setProjectName] = useState(initial.name ?? '');
  // the project's identity: kept by its saves, carried by its figures (a document's figures are found by it)
  const [projectId, setProjectId] = useState(initial.id ?? newProjectId());
  // the Python code of the project open at start: runs if it was allowed (or it has none)
  useEffect(() => openProject(projectId, !hasPython(initial.nodes)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [examples, setExamples] = useState<ExampleList>([]);
  useEffect(() => {
    document.title = `${projectName || 'Untitled project'} — SciPlotFlow`;
  }, [projectName]);
  const [panel, setPanel] = useState<'projects' | 'docs' | 'help' | null>(null);
  // the clicks on the empty canvas (each folds the options panel when nothing is pinned there)
  const [paneClicks, setPaneClicks] = useState(0);
  // the clicks on a node (each unfolds the options panel, even when it was folded by hand)
  const [nodeClicks, setNodeClicks] = useState(0);
  const togglePanel = (p: 'projects' | 'docs' | 'help') => setPanel((cur) => (cur === p ? null : p));
  // the panel on the right closed with an animation
  const { shown: shownPanel, closing: panelClosing } = useLeaving(panel);
  const { screenToFlowPosition, fitBounds, fitView, getNodesBounds, getNodes, getNode, getEdges, setViewport, deleteElements, updateNodeData } = useReactFlow<AppNode>();
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
    return sel.length === 1 && hasPanel(sel[0].type) ? sel[0] : null;
  }, [nodes]);
  const pinnedNodes = useMemo(() => pins.flatMap((pid) => nodes.filter((n) => n.id === pid)), [pins, nodes]);
  const pin = (pid: string, on: boolean) => setPins((ps) => (on ? [...ps.filter((x) => x !== pid), pid] : ps.filter((x) => x !== pid)));
  const currentGroup = stack.length ? (stack[stack.length - 1].nodes.find((n) => n.id === stack[stack.length - 1].groupId) as Extract<AppNode, { type: 'subgraph' }> | undefined)?.data ?? null : null;
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
      if (lost) alert(`${lost} imported file(s) of the last session are no longer in the browser's storage: open them again in their Import nodes.`);
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
    // the project open until now: kept in Projects first (its last change too)
    if (p.id !== projectId) keepInLibrary();
    // a project kept in the browser: its big texts come back from IndexedDB first
    if (hasRefs(p)) {
      void withTexts(p).then(({ project, lost }) => {
        if (lost) alert(`${lost} imported file(s) of this project are no longer in the browser's storage: open them again in their Import nodes.`);
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
        if (typeof p === 'string') alert(p);
        else {
          load(p, p.name ?? 'Shared project');
          if (p.repaired) alert(p.repaired);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // A figure exported with its project (an SVG or PNG, from a document): the project opened at that figure — the
  // project open already (the same id): the figure shown, or its other version opened (the current one kept first)
  const [focusFig, setFocusFig] = useState<FigureRef | null>(null);
  const openFigureFile = async (file: File) => {
    const e = fileProject(new Uint8Array(await file.arrayBuffer()));
    if (!e) return alert(`“${file.name}” has no SciPlotFlow project in it: export the figure with “project inside” (SVG or PNG).`);
    const p = await openEmbedded(e);
    if (typeof p === 'string') return alert(p);
    const when = new Date(e.exported).toLocaleString();
    const afterLoad = () => {
      setFocusFig(e.figure);
      if (e.data === 'nodata') alert('This figure was exported without its imported data: open the files again in the Import nodes.');
    };
    if (e.projectId === projectId) {
      const cur = toProject(root.nodes, root.edges, projectName, projectId);
      if ((await projectRevision(cur)) === e.revision) return setFocusFig(e.figure);
      const other = confirm(`This figure comes from the open project, but from another version of it (exported ${when}).\n\nOK — open the figure's version (the current one is first kept in Projects as “${projectName || 'Untitled project'} (before)”).\nCancel — stay with the current version and show the figure in it.`);
      if (!other) return setFocusFig(e.figure);
      const kept = saveToBrowser(cur, `${projectName || 'Untitled project'} (before)`);
      if (typeof kept === 'string') return alert(`The current project could not be kept in the browser (${kept}): use Save first.`);
      load({ ...p, id: e.projectId }, p.name ?? e.projectName ?? projectName);
      return afterLoad();
    }
    if (!confirm(`Open the project of this figure (“${e.projectName || e.figure.name}”, exported ${when})?\n\nIt replaces the current project: use Save first to keep that one.`)) return;
    load({ ...p, id: e.projectId }, p.name ?? e.projectName ?? file.name.replace(/\.(svg|png)$/i, ''));
    afterLoad();
  };
  // the figure's node selected and brought into view (at the top level: its group, when it is inside one)
  useEffect(() => {
    if (!focusFig || fitPending || !initialized) return;
    const target = stack.length ? focusFig.node : (focusFig.path[0] ?? focusFig.node);
    const n = getNode(target);
    setFocusFig(null);
    if (!n) return alert(`The figure “${focusFig.name}” is not on the level shown (its node may have been removed).`);
    setNodes((ns) => ns.map((q) => (q.selected === (q.id === target) ? q : { ...q, selected: q.id === target })));
    fitBounds(getNodesBounds([n]), { padding: 0.25, duration: 300 });
  }, [focusFig, fitPending, initialized, stack.length, getNode, setNodes, fitBounds, getNodesBounds]);
  // a project file (.json) opened, a figure with its project (.svg, .png)
  const openAnyFile = async (f: File, ask: boolean) => {
    if (/\.(svg|png)$/i.test(f.name) || f.type === 'image/png' || f.type === 'image/svg+xml') return openFigureFile(f);
    if (!/\.json$/i.test(f.name)) return alert(`“${f.name}”: drop a data file (CSV, text, Excel …: an Import node is made), a project file (.json) or a figure exported with its project (.svg, .png) here.`);
    const p = parseProject(await f.text());
    if (typeof p === 'string') return alert(p);
    if (ask && !confirm(`Open the project “${p.name ?? f.name}”? It replaces the current project: use Save first to keep that one.`)) return;
    load(p, p.name ?? f.name.replace(/\.json$/i, ''));
    if (p.repaired) alert(p.repaired);
  };

  // Empty project: no nodes, no connections.
  const newProject = () => {
    const text = 'Start a new, empty project?\n\nThe current one stays in Projects (once it has been changed); Save also keeps it as a file.';
    if (confirm(text)) load(EMPTY);
  };

  const isValidConnection: IsValidConnection = useCallback(
    (c) => canConnect(getNode(c.source), getNode(c.target), c.targetHandle, c.sourceHandle, { node: getNode, edges: getEdges(), groupInputs: currentGroup?.inputs }),
    [getNode, getEdges, currentGroup],
  );

  // Single-input handles keep only the newest connection.
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) => {
        const multi = isMultiInput(getNode(c.target), c.targetHandle);
        const kept = eds.filter(
          (e) =>
            !(e.target === c.target && e.targetHandle === c.targetHandle && (!multi || e.source === c.source)),
        );
        return addEdge(c, kept);
      }),
    [setEdges, getNode],
  );

  // Colour each edge by the type of value it carries (a Reroute: the type of what reaches it).
  const colorKey = nodes.map((n) => `${n.id}:${n.type}`).join('|');
  // The nodes of this render (not getNode: right after loading a project the React Flow store does not hold the new
  // nodes yet, and the edges would stay unstyled until the next change). Rebuilt only when the nodes change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [colorKey]);
  const portCtx: PortContext = useMemo(() => ({ node: (id) => nodeById.get(id), edges, groupInputs: currentGroup?.inputs }), [nodeById, edges, currentGroup]);
  // the connections of the node under the mouse stand out (thicker)
  const [hovered, setHovered] = useState<string | null>(null);
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const s = nodeById.get(e.source);
        const p = s && sourcePort(s, e.sourceHandle, portCtx);
        const color = (p && PORT_COLORS[p]) || 'var(--muted)';
        // custom line: curved or orthogonal, arrow at the middle (direction of the data); a selected line is thicker
        // and drawn over a halo (FlowEdge)
        const lit = hovered !== null && (e.source === hovered || e.target === hovered);
        return { ...e, type: 'flow', className: lit ? 'edge-lit' : undefined, style: { stroke: color, strokeWidth: e.selected || lit ? 4.5 : 3 }, data: { arrow: prefs.arrows, shape: prefs.shape } };
      }),
    [edges, nodeById, portCtx, prefs.arrows, prefs.shape, hovered],
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
        onClick: () => {
          const name = prompt('Name of the style (kept in this browser, offered for every node of this kind):')?.trim();
          if (name && !saveStyle(n, name)) alert('The browser storage is full: the style was not saved.');
        },
      },
      {
        label: 'Use these settings for new nodes of this kind',
        onClick: () => {
          if (!setDefaultStyle(n)) alert('The browser storage is full: the default was not kept.');
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
              onClick: () => {
                const name = prompt(`Forget which style?\n${mine.map((s) => s.name).join('\n')}`)?.trim();
                if (name) forgetStyle(n.type, name);
              },
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
    if (!menu || menu.kind === 'pane') return null;
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
              const r = makeGroup(
                getNodes(),
                getEdges(),
                ids,
                (nd, h) => {
                  // a port named after its node's own name (a column's name, a label…), else the port, else the node type
                  const d = nd.data as { name?: unknown; label?: unknown; caption?: unknown; column?: unknown };
                  const own = [d.caption, d.name, d.label, d.column].find((v): v is string => typeof v === 'string' && v.trim() !== '');
                  return own ?? (h && h !== 'out' && h !== 'in' ? h : nodeTitle(nd));
                },
                (nd, h) => sourcePort(nd, h, portCtx),
              );
              if (!r) return;
              setNodes(r.nodes);
              setEdges(r.edges);
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
                onClick: () => {
                  const name = prompt('Name of the template (kept in this browser, in the Nodes panel under My templates):', n.data.name)?.trim();
                  if (name && !saveTemplate(name, n.data)) alert('The browser storage is full: the template was not saved.');
                },
              },
              ...(listTemplates().length
                ? [
                    {
                      label: 'Forget a template',
                      onClick: () => {
                        const name = prompt(`Forget which template?\n${listTemplates().map((t) => t.name).join('\n')}`)?.trim();
                        const t = listTemplates().find((x) => x.name === name);
                        if (t) forgetTemplate(t.id);
                      },
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

  const menuItems: MenuItem[] = useMemo(() => GROUPS.flatMap((g) => g.items.filter((i) => !i.hidden).map((i) => ({ type: i.type, label: i.label, group: g.name }))), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // the nodes panel (left): the sections of GROUPS with the colours of their nodes
  const templates = useTemplates();
  const paletteGroups: PaletteGroup[] = useMemo(
    () => [
      ...GROUPS.map((g) => ({ name: g.name, color: GROUP_COLORS[g.name], items: g.items.filter((t) => !t.hidden).map((t) => ({ type: t.type, label: t.label, help: NODE_HELP[t.type], color: NODE_COLORS[t.type] })) })),
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
    const m = /^template:(.+)$/.exec(type);
    if (!m) return GROUPS.flatMap((g) => g.items).find((i) => i.type === type);
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
    addNode(t, { x: e.clientX, y: e.clientY });
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
      alert(`The file could not be read: ${(err as Error).message}`);
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
  };

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand" title="SciPlotFlow — node-based data analysis and graphs">
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
            <TriangleAlert {...IC} /> not autosaved — use Save
          </span>
        )}
        <button onClick={newProject} title="Remove everything and start an empty project">New</button>
        <select
          className="examples-menu"
          value=""
          title="Open a complete example"
          onChange={(e) => {
            const ex = examples[Number(e.target.value)];
            if (ex && confirm(`Replace the current project with the “${ex.name}” example?`)) load(ex.make(), ex.name);
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
          Open
        </button>
        <button
          onClick={() =>
            download(stringifyProject(toProject(root.nodes, root.edges, projectName, projectId), 1), `${(projectName || 'sciplotflow-project').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')}.json`, 'application/json')
          }
        >
          Save
        </button>
        <button className={panel === 'projects' ? 'active' : ''} onClick={() => togglePanel('projects')} title="Several projects kept in this browser">
          Projects
        </button>
        <button className={panel === 'docs' ? 'active' : ''} onClick={() => togglePanel('docs')} title="Update the figures of this project in a Word or PowerPoint document (figures exported with “project inside”)">
          Update document…
        </button>
        <button
          title="Copy a link that opens this project (the whole project is in the link: nothing is sent to a server)"
          onClick={async () => {
            const code = await encodeProject(toProject(root.nodes, root.edges, projectName, projectId));
            const url = `${location.origin}${location.pathname}#p=${code}`;
            if (url.length > 60000) alert('The project is too large for a link (imported data): use Save and send the file.');
            else {
              try {
                await navigator.clipboard.writeText(url);
                alert('A link to this project was copied to the clipboard.');
              } catch {
                prompt('Copy this link:', url);
              }
            }
          }}
        >
          Share link
        </button>
        <button className={finding ? 'active' : ''} onClick={() => setFinding(true)} title="Find a node on the canvas by its name or type (Ctrl+F)">
          <Search {...IC} /> Find node
        </button>
        <span className="undo-redo">
          <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 {...IC} /></button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo"><Redo2 {...IC} /></button>
        </span>
        <button className={panel === 'help' ? 'active' : ''} onClick={() => togglePanel('help')} title="Getting started, the nodes, shortcuts, validation">
          Help
        </button>
        <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} title="Colour theme">
          <option value="system">Theme: system</option>
          <option value="light">Theme: light</option>
          <option value="dark">Theme: dark</option>
        </select>
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
          <div className="canvas" ref={canvasRef} onDragOver={onDragOver} onDrop={onDrop}>
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
                <span className="hint">The Group input and Group output nodes are its ports.</span>
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{ animated: true }}
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
              onNodeClick={() => setNodeClicks((k) => k + 1)}
              onMoveStart={closeMenu}
              onNodeDragStart={closeMenu}
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
              <Controls showFitView={false}>
                <ControlButton onClick={fitAll} title="Fit view" aria-label="Fit view">
                  <Maximize {...IC} />
                </ControlButton>
                <ControlButton
                  className={prefs.snap ? 'on' : ''}
                  onClick={() => setPref({ snap: !prefs.snap })}
                  title={prefs.snap ? `Snap to grid: on (${prefs.step} px) — click to move freely` : 'Snap to grid: off — click to position on a grid'}
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
                  title={prefs.shape === 'orthogonal' ? 'Connections: right angles — click for curves' : 'Connections: curves — click for right angles'}
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
                <ControlButton className={prefs.minimap ? 'on' : ''} onClick={() => setPref({ minimap: !prefs.minimap })} title={prefs.minimap ? 'Minimap: on — click to hide it' : 'Minimap: off — click to show it'} aria-label="Minimap">
                  <MapIcon {...IC} />
                </ControlButton>
              </Controls>
              {prefs.minimap && <MiniMap pannable zoomable nodeColor={miniColor} nodeStrokeColor={miniStroke} nodeBorderRadius={3} />}
            </ReactFlow>
            {/* an empty project: where to start */}
            {nodes.length === 0 && !stack.length && (
              <div className="empty-hint">
                <b>Drop a data file here</b> (CSV, text, Excel …) to start,
                <br />
                or click Import in the Nodes panel, or open one of the Examples.
              </div>
            )}
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
              {shownPanel === 'docs' && <DocumentPanel onClose={() => setPanel(null)} current={projectInfo.current} id={projectId} results={rootEngine.results} />}
              {shownPanel === 'help' && <HelpPanel onClose={() => setPanel(null)} examples={examples} focus={helpAt} />}
            </Suspense>
            </div>
            {finding && <FindNode onClose={() => setFinding(false)} />}
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
                items={menuItems}
                onClose={closeMenu}
                onAdd={(type) => {
                  const t = GROUPS.flatMap((g) => g.items).find((i) => i.type === type);
                  if (t) addNode(t, { x: menu.x, y: menu.y });
                }}
                title={nm?.title}
                actions={nm?.actions}
              />
            )}
          </div>
          </GroupNavContext.Provider>
        </EngineContext.Provider>
        </ProjectInfoContext.Provider>
        <Inspector current={selectedOne} pinned={pinnedNodes} onPin={pin} paneClicks={paneClicks} nodeClicks={nodeClicks} />
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
