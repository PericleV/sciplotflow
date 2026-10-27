// The editor of an Image analysis node, over the whole window: the steps on the left (added by group, switched on and
// off, moved, each with all its parameters — Curves on the histogram of what comes into it; a click on one shows the
// image up to it), the image in the middle (zoom, pan; compared with the original or with the image before the step
// shown: the result alone, the original alone, side by side, or split by a line dragged — as photo editors do; the
// values under the mouse), the histogram, the view, the crop, the calibration, the selections (ROI manager), what is
// measured and the results on the right. Crop and Scale work on the original as it came (the data bar of an electron
// microscope cut off; a line drawn on its scale bar, with a loupe, its ends found on the bar); the selections are drawn
// on the image analysed (rectangle, ellipse, polygon, freehand, line, segmented line, points, angle, wand, rays, stamp), picked
// and edited with their handles; the particles of the mask found as selections, grouped by their shape; a trainable
// classifier taught by selections given a class. The image and the measurements are computed in a worker of its own.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import type { AppNode, ImageAnalysisData } from '../types.ts';
import { STEP_DEFS, STEP_GROUP_LABELS, STEP_GROUPS, newStep, stepClasses, type ImgStep, type StepDef, type StepKind } from '../image/steps.ts';
import { cropBox, cropRaster, dataBarApart, dataBarRows, luminance, unpackPixels, type Crop } from '../image/raster.ts';
import { autoBarLength, imageFigure, unitText } from '../image/node.ts';
import type { CentreReply, ImgReply, ImgRequest, MatchReply, MatchRequest, MeasureReply, MeasureRequest, ParticlesReply, ParticlesRequest, ProgressReply, RaysReply, RefineReply, RefineRequest, SpectrumReply, SpectrumRequest, SpotReply, SpotRequest, ValueReply, WandReply } from '../image/imageWorker.ts';
import { MATCH_DEFAULTS, MATCH_PRESETS, MATCH_TUNING, placeLike, type MatchOpts } from '../image/match.ts';
import { trainingExamples, trainKeyOf } from '../image/classify.ts';
import { classIndex, clearClass, decodePaint, emptyPaint, encodePaint, paintCounts, paintDisc, paintExamples, paintFill, paintSegment, type Box, type PaintLayer } from '../image/paint.ts';
import { groupLikeExamples, PARTICLE_DEFAULTS, SHAPE_COLORS, shapeFeatures, shapeName, type ParticleOpts } from '../image/particles.ts';
import { ClassifierEditor, type PaintTool } from './ClassifierEditor.tsx';
import { EDGE_BAND, MATCH_TUNING as TUNING, type Match, type MatchExample, type MatchModelSpec, type MatchRejected } from '../image/match.ts';
import { chooseMethod, enoughToLearn, LEARN_METHODS, learnWith, type LearnChoice, type LearnMethod } from '../image/learn.ts';
import { outOf, particleFeatures } from '../image/review.ts';
import { ReviewPanel } from './ReviewPanel.tsx';
import type { LearnReply, LearnRequest } from '../image/learnWorker.ts';
import { accuracyOf, type AccuracyResult } from '../image/accuracy.ts';
import { REGULAR_SHAPES, type RegularShape } from '../image/refine.ts';
import { estimateLayers } from '../image/layers.ts';
import { offsetDistance, offsetOutline } from '../image/roi.ts';
import { classColor } from '../image/classify.ts';
import { isArea, moveRoi, nearRoi, roiCentre, roiOutline, TOOL_HINTS, type Pt, type Roi, type RoiKind, type RoiTool } from '../image/roi.ts';
import { measureSpec, roiPerimeter, type MeasureSpec } from '../image/measure.ts';
import type { Workbook } from '../engine/table.ts';
import { Fold, MeasurePanel, ParticlesPanel, RoiOverlay, RoiPanel, ToolOptions } from './RoiManager.tsx';
import { BusyCard, MethodCards, TaskSteps, type Job } from './ImageTasks.tsx';
import { SAM_CACHE, SAM_DEFAULTS, SAM_ENGINE, SAM_MODELS, thinOutline, type SamModel } from '../image/sam.ts';
import type { SamReply, SamRequest } from '../image/samWorker.ts';
import { FIND_METHODS, TASK_ORDER, TASKS, taskLabel, taskOf, type FindMethod, type Task } from '../image/tasks.ts';
import { NetworkOverlay, NetworkPanel, type NetTool } from './NetworkPanel.tsx';
import { ArrangeOverlay, ArrangePanel } from './ArrangePanel.tsx';
import { LatticePanel, RingsOverlay, SpotsOverlay } from './LatticePanel.tsx';
import { SurfacePanel } from './SurfacePanel.tsx';
import { TextureOverlay, TexturePanel } from './TexturePanel.tsx';
import { findScaleBar, parseScale, type FoundBar } from '../image/scalebar.ts';
import type { TextureSpec } from '../image/texture.ts';
import type { SurfaceSpec } from '../image/surface.ts';
import type { LatticeSpec } from '../image/lattice.ts';
import { branchAt, midOf, type HandKind, type NetBranch, type NetworkHand, type NetworkSpec } from '../image/network.ts';
import { useNodeResult } from '../engine/engine.ts';
import { ask } from '../ui/dialogStore.ts';
import { toRGBA, type Lut } from '../image/render.ts';
import { COLOR_MAPS } from '../figure/colors.ts';
import { CurvesEditor } from './CurvesEditor.tsx';
import { ParamField, ThresholdEditor } from './ImageParams.tsx';
import { Check, NumInput, Select } from './ui.tsx';
import { ArrowDown, ArrowUp, Circle, Crop as CropIcon, Crosshair, Hand, Maximize, Minus, MousePointerClick, SquareDashedMousePointer, Pentagon, PenTool, Plus, Ruler, Slash, Spline, Square, Stamp, Sun, Triangle, Wand, X } from 'lucide-react';
import { IC } from './iconProps.ts';

const LUTS = Object.entries(COLOR_MAPS).map(([k, v]): [Lut, string] => [k as Lut, v.label]);
const UNITS = ['nm', 'µm', 'mm', 'cm', 'm', 'Å'].map((u): [string, string] => [u, u]);
const fmt = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : +v.toPrecision(5)) : 'n/a');

// ---- the histogram ----

function Histogram({ hist, lo, hi, marks }: { hist: Float64Array | null; lo: number; hi: number; marks: number[] }) {
  const W = 256;
  const H = 90;
  if (!hist) return <div className="ie-hist" />;
  // the counts on a square-root scale (a tall peak does not hide the rest)
  const top = Math.sqrt(Math.max(1, ...hist));
  const d = Array.from(hist, (v, k) => `M${k + 0.5},${H}V${(H - (Math.sqrt(v) / top) * (H - 2)).toFixed(1)}`).join('');
  return (
    <svg className="ie-hist" width={W} height={H + 14} viewBox={`0 0 ${W} ${H + 14}`}>
      <path d={d} className="ie-hist-bars" />
      {marks.map((m, k) => {
        const x = ((m - lo) / (hi - lo || 1)) * W;
        return Number.isFinite(x) && x >= 0 && x <= W ? <path key={k} d={`M${x.toFixed(1)},0V${H}`} className="ie-hist-mark" /> : null;
      })}
      <text x={0} y={H + 12} className="ie-hist-label">
        {fmt(lo)}
      </text>
      <text x={W} y={H + 12} textAnchor="end" className="ie-hist-label">
        {fmt(hi)}
      </text>
    </svg>
  );
}

// ---- the scale bar's ends: along the line drawn, the run of pixels like the one at its middle (the bar), a little
// past the ends drawn; null when it is not clearly a bar (much shorter or longer than the line) ----
function snapToBar(g: Float32Array, w: number, h: number, lo: number, hi: number, line: [number, number, number, number]): [number, number, number, number] | null {
  const [x1, y1, x2, y2] = line;
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (!(L > 4)) return null;
  const [ux, uy] = [(x2 - x1) / L, (y2 - y1) / L];
  const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
  const val = (t: number) => {
    const x = Math.round(mx + ux * t);
    const y = Math.round(my + uy * t);
    return x < 0 || y < 0 || x >= w || y >= h ? NaN : g[y * w + x];
  };
  // (the bar's value: the most common along the middle half of the line)
  const vals: number[] = [];
  for (let t = -L / 4; t <= L / 4; t++) vals.push(val(t));
  const vm = vals.filter(Number.isFinite).sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  if (!Number.isFinite(vm)) return null;
  const tol = (hi - lo) * 0.2;
  const like = (t: number) => Math.abs(val(t) - vm) <= tol;
  let a = 0;
  while (a > -L && like(a - 1)) a--;
  let b = 0;
  while (b < L && like(b + 1)) b++;
  const len = b - a + 1;
  if (len < 0.5 * L || len > 1.5 * L) return null;
  // (the outer edges of the end pixels)
  return [mx + ux * (a - 0.5), my + uy * (a - 0.5), mx + ux * (b + 0.5), my + uy * (b + 0.5)];
}

// ---- the editor ----

type Cmp = 'edited' | 'original' | 'side' | 'split';
// (brush, eraser: the trainable classifier's strokes and their eraser, with a class picked; its Fill is the freehand tool)
// (sam, sambox: Segment anything asked by a click, by a box)
// (sammodel: the model of Find like this picked with Segment anything)
type Tool = 'pan' | 'scale' | 'crop' | 'brush' | 'eraser' | 'sam' | 'sambox' | 'sammodel' | RoiTool;
// the selection tools of the toolbar
const ROI_TOOLS: [RoiTool, typeof Square, string][] = [
  ['rect', Square, 'Rectangle'],
  ['ellipse', Circle, 'Ellipse'],
  ['polygon', Pentagon, 'Polygon'],
  ['freehand', PenTool, 'Freehand'],
  ['line', Slash, 'Line'],
  ['polyline', Spline, 'Segmented line'],
  ['points', Crosshair, 'Points'],
  ['angle', Triangle, 'Angle'],
  ['wand', Wand, 'Wand'],
  ['rays', Sun, 'Rays'],
  ['stamp', Stamp, 'Stamp'],
];
// the panels of the side: the image (its histogram, view, crop, calibration), its objects (selections, particles),
// Structure (the network of the mask), the results (what is measured, the tables)
type SideTab = NonNullable<ImageAnalysisData['tab']>;
const SIDE_TABS: [SideTab, string, string][] = [
  ['image', 'Image', 'The histogram, the view, the crop, the calibration'],
  ['objects', 'Objects', 'Selections, particles found, Find like this, Refine, layers'],
  ['structure', 'Structure', 'The network of the mask: ligaments, junctions, pores (skeleton analysis), changed by hand; the grain size (ASTM E112), the orientation, the fractal dimension'],
  ['lattice', 'Lattice', 'TEM: the spots of the spectrum (d, angles; a Bragg filter), the fringes along a line, the rings of a diffraction pattern'],
  ['surface', 'Surface', 'AFM: the image as heights; their roughness (ISO 25178, ISO 4287), histogram, PSD, autocorrelation, a step height'],
  ['results', 'Results', 'What is measured and the tables'],
];
// the widths of the steps (left) and of the panels (right), dragged by the bars between them and the image: kept in
// this browser for every image
const PANELS: [number, number] = [300, 280];
const PANELS_KEY = 'graph-flow:image-editor-panels';
const savedPanels = (): [number, number] => {
  try {
    const v = JSON.parse(localStorage.getItem(PANELS_KEY) ?? 'null') as unknown;
    return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && x > 0) ? (v as [number, number]) : PANELS;
  } catch {
    return PANELS;
  }
};
let stepSeq = 0;
let roiSeq = 0;
export function ImageEditor({ id, data, onClose }: { id: string; data: ImageAnalysisData; onClose: () => void }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<ImageAnalysisData>) => updateNodeData(id, p);
  const [panels, setPanels] = useState<[number, number]>(savedPanels);
  const clampPanel = (w: number) => Math.round(Math.max(220, Math.min(window.innerWidth * 0.45, w)));
  const setPanelWidth = (k: 0 | 1, w: number) =>
    setPanels((cur) => {
      const next: [number, number] = k === 0 ? [clampPanel(w), cur[1]] : [cur[0], clampPanel(w)];
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(next));
      } catch {
        // (the widths not kept: the browser's storage refused)
      }
      return next;
    });
  // (a bar dragged: the left panel grows to the right, the right one to the left)
  const dragPanel = (e: React.PointerEvent, k: 0 | 1) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = panels[k];
    const move = (m: PointerEvent) => setPanelWidth(k, w0 + (k === 0 ? m.clientX - x0 : x0 - m.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // the panel shown (kept in the node); Structure: the network found (the node's result), its tools, the branch picked
  const tab: SideTab = data.tab ?? 'image';
  const setTab = (t: SideTab) => {
    set({ tab: t === 'image' ? undefined : t });
    if (t === 'structure') setTool('pan');
  };
  // the task (its steps on the left; All tools: the panels of before, as tabs) and its step open
  const task: Task = taskOf(data);
  const taskStep = Math.max(0, Math.min(3, data.stage ?? 0));
  const setTask = (t: Task) => {
    set({ task: t, stage: undefined });
    if (t === 'network') setTool('pan');
  };
  const setStage = (k: number) => set({ stage: k || undefined });
  // (what the panels of before drew over the image, by the task: the network, the rings, the arrangement)
  const vtab: SideTab = task === 'all' ? tab : ({ particles: 'objects', spots: 'objects', network: 'structure', lattice: 'lattice', surface: 'surface' } as const)[task];
  // (the selection tools of a task: its own, or all of them)
  const [moreTools, setMoreTools] = useState(false);
  // (the calibration: the size of a pixel and its unit; none: pixels)
  const calK = data.cal && data.cal.size > 0 ? data.cal.size : 1;
  const calU = data.cal && data.cal.size > 0 ? unitText(data.cal.unit) : 'px';
  const nodeRes = useNodeResult(id);
  const net = nodeRes?.view.network;
  const netError = data.network?.on ? nodeRes?.warnings.find((w) => w.startsWith('Structure:')) : undefined;
  const [netTool, setNetTool] = useState<NetTool>('select');
  const [netSel, setNetSel] = useState<Pt | null>(null);
  const [eraseR, setEraseR] = useState(1.5);
  const setNet = (p: Partial<NetworkSpec>) => set({ network: { ...data.network, ...p } });
  const hand: NetworkHand = data.network?.hand ?? {};
  const addEdit = (kind: HandKind, v: unknown) => setNet({ hand: { ...hand, [kind]: [...((hand[kind] as unknown[] | undefined) ?? []), v], order: [...(hand.order ?? []), kind] } });
  const undoEdit = () => {
    const order = [...(hand.order ?? [])];
    const kind = order.pop();
    if (!kind) return;
    const list = [...((hand[kind] as unknown[] | undefined) ?? [])];
    list.pop();
    setNet({ hand: { ...hand, [kind]: list.length ? list : undefined, order: order.length ? order : undefined } });
  };
  // (keep, leave out: on again takes the branch's mark off)
  const toggleEdit = (kind: 'keep' | 'excl', b: NetBranch) => {
    const list = hand[kind] ?? [];
    const at = list.findIndex((q) => branchAt(net, q)?.id === b.id);
    if (at < 0) return addEdit(kind, midOf(b));
    const order = [...(hand.order ?? [])];
    const last = order.lastIndexOf(kind);
    if (last >= 0) order.splice(last, 1);
    const rest = list.filter((_, j) => j !== at);
    setNet({ hand: { ...hand, [kind]: rest.length ? rest : undefined, order: order.length ? order : undefined } });
  };
  // the selections (in pixels of the original), the one picked, the one being drawn or edited (shown in its place)
  const rois = useMemo(() => data.rois ?? [], [data.rois]);
  const setRois = (r: Roi[]) => set({ rois: r });
  // (one more, or one changed: from the node's data as it is — the worker's answers come between renders)
  const putRoi = (r: Roi) => updateNodeData(id, (n) => {
    const now = (n.data as ImageAnalysisData).rois ?? [];
    return { rois: now.some((q) => q.id === r.id) ? now.map((q) => (q.id === r.id ? r : q)) : [...now, r] };
  });
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Roi | null>(null);
  const [group, setGroup] = useState('');
  const [labels, setLabels] = useState(true);
  const [rings, setRings] = useState(true);
  const [wandTol, setWandTol] = useState(0);
  const [raysOf, setRaysOf] = useState<'auto' | 'bright' | 'dark'>('auto');
  const [centre, setCentre] = useState<'off' | 'bright' | 'dark'>('bright');
  const [book, setBook] = useState<Workbook | null>(null);
  const [sheet, setSheet] = useState('Selections');
  const spec = measureSpec(data.measure);
  const setSpec = (p: Partial<MeasureSpec>) => set({ measure: { ...data.measure, ...p } });
  const steps = useMemo(() => data.steps ?? [], [data.steps]);
  const setSteps = (s: ImgStep[]) => set({ steps: s });
  const setStep = (sid: string, p: Partial<ImgStep>) => setSteps(steps.map((s) => (s.id === sid ? { ...s, ...p } : s)));
  // the step the image is shown up to (absent: all; 0: the original image)
  const [upTo, setUpTo] = useState<string | null>(null);
  // the comparison: the result, the original (or the image before the step shown), side by side, split; held: B, \
  const [cmp, setCmp] = useState<Cmp>('edited');
  const [held, setHeld] = useState(false);
  const [before, setBefore] = useState<'original' | 'prev'>('original');
  const [split, setSplit] = useState(0.5);
  const [splitDir, setSplitDir] = useState<'v' | 'h'>('v');
  const [lut, setLut] = useState<Lut>(data.figure?.lut ?? 'gray');
  const [overlay, setOverlay] = useState(true);
  const [tool, setTool] = useState<Tool>('pan');
  // the class of the trainable classifier painted (whatever is drawn meanwhile is an example of it) and the brush's width
  const [paint, setPaintCls] = useState<string | null>(null);
  const [brush, setBrush] = useState(12);
  // how the classifier's examples are drawn: filled outlines, strokes, or taken away
  const [paintTool, setPaintToolState] = useState<PaintTool>('fill');
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [reply, setReply] = useState<ImgReply | null>(null);
  // the spectrum shown instead of the image (Image ▸ View): asked of the worker after every result
  const [spectrumImg, setSpectrumImg] = useState<SpectrumReply | null>(null);
  const [busy, setBusy] = useState(false);
  // the values under the mouse (asked of the worker, a pixel at a time)
  const [vals, setVals] = useState<ValueReply | null>(null);
  const [hover, setHover] = useState<{ p: [number, number]; sx: number; sy: number } | null>(null);
  const [line, setLine] = useState<[number, number, number, number] | null>(data.cal?.line ?? null);
  const [snap, setSnap] = useState(true);
  const [snapped, setSnapped] = useState<boolean | null>(null);
  const [known, setKnown] = useState<number>(data.cal?.length ?? NaN);
  const [unit, setUnit] = useState<string>(unitText(data.cal?.unit ?? 'µm'));
  const [cropDraft, setCropDraft] = useState<Crop | null>(null);
  // the original as it came (Crop and Scale draw on it), and the part analysed
  const full = useMemo(() => (data.pixels ? unpackPixels(data.pixels, data.pixelsId) : null), [data.pixels, data.pixelsId]);
  const crop = full ? cropBox(data.crop, full.w, full.h) : null;
  const base = useMemo(() => (full ? cropRaster(full, crop ?? undefined) : null), [full, crop?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const fullGray = useMemo(() => (full ? (full.ch.length === 1 ? full.ch[0] : luminance(full)) : null), [full]);
  const barRows = useMemo(() => (full ? dataBarRows(full) : 0), [full]);
  // (a data bar clearly apart from the image above it: the one Next speaks of)
  const barApart = useMemo(() => (full ? dataBarApart(full) : 0), [full]);
  const onOriginal = tool === 'scale' || tool === 'crop';
  const roiTool = tool in TOOL_HINTS || tool === 'brush' || tool === 'eraser' || tool === 'sambox';
  // the corner of the part analysed in the original (the selections' places are in the original's pixels)
  const [ox, oy] = crop ? [crop[0], crop[1]] : [0, 0];
  // the steps give a mask (its coverage measured)
  const masks = steps.some((s) => s.on && (s.kind === 'threshold' || s.kind === 'localthreshold'));
  const measuring = rois.length > 0 || masks;
  // the examples of a trainable classifier (in the part analysed), sent with the steps when one is on
  const classifying = steps.some((s) => s.on && s.kind === 'classify');
  const trainAll = useMemo(() => (classifying ? [...trainingExamples(rois, ox, oy), ...paintExamples(data.paint, crop)] : []), [classifying, rois, ox, oy, data.paint, crop?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // (Live update off: the examples of the last update, until Update now)
  const [liveTrain, setLiveTrain] = useState(true);
  const frozen = useRef(trainAll);
  const [, setFrozenAt] = useState(0);
  if (liveTrain) frozen.current = trainAll;
  const train = frozen.current;
  const trainKey = trainKeyOf(train);
  const trainPending = !liveTrain && trainKeyOf(trainAll) !== trainKey;
  const updateTrain = () => {
    frozen.current = trainAll;
    setFrozenAt((n) => n + 1);
  };
  // the particles: how they are found, the group they go in, what the last search found
  const partOpts: ParticleOpts = { ...PARTICLE_DEFAULTS, ...data.particles };
  const partGroup = data.particles?.group ?? 'particles';
  const setPart = (p: Partial<ParticleOpts> & { group?: string; shapes?: RegularShape[]; snap?: boolean; layers?: boolean }) => set({ particles: { ...data.particles, ...p } });
  const [partMsg, setPartMsg] = useState('');
  // Find like this: its options
  type MatchData = NonNullable<ImageAnalysisData['match']>;
  const matchOpts: MatchOpts & MatchData & { fit: boolean } = { ...MATCH_DEFAULTS, fit: true, ...data.match };
  const setMatch = (p: Partial<MatchData>) => set({ match: { ...data.match, ...p } });
  // the list of models (those whose selection is still there), each with its own settings
  const modelList = (data.match?.models ?? []).filter((m) => rois.some((r) => r.id === m.roi));
  const setModels = (models: MatchModelSpec[]) => setMatch({ models: models.length ? models : undefined });
  // a model's settings: its own over those of all
  const specOf = (rid: string): MatchModelSpec => ({ roi: rid, context: matchOpts.context, ring: matchOpts.ring, ...(data.match?.outer ? { outer: data.match.outer } : {}), symmetry: matchOpts.symmetry, sizes: matchOpts.sizes, ...modelList.find((m) => m.roi === rid) });
  // the margin drawn around a model: its own (offsets from its centre), else the dashed line of the ground around it,
  // thinned to points that can be dragged; kept as offsets from the model's centre (it follows the model when moved)
  const outerOf = (t: Roi, sp: MatchModelSpec): Pt[] => {
    const [cx, cy] = roiCentre(t);
    if (sp.outer && sp.outer.length >= 3) return sp.outer.map(([u, v]): Pt => [cx + u, cy + v]);
    const off = offsetOutline(roiOutline(t), Math.max(EDGE_BAND, sp.ring ?? 6));
    const every = Math.max(1, Math.ceil(off.length / 24));
    return off.filter((_, i) => i % every === 0);
  };
  const setOuter = (t: Roi, pts: Pt[] | undefined) => {
    const [cx, cy] = roiCentre(t);
    const outer = pts?.map(([x, y]): Pt => [+(x - cx).toFixed(2), +(y - cy).toFixed(2)]);
    if (modelList.some((m) => m.roi === t.id)) setModels(modelList.map((m) => (m.roi === t.id ? { ...m, outer } : m)));
    else setMatch({ outer });
  };
  // the margin's points shown with handles (dragged; a double-click takes one off; those between the points add one)
  const [editMargin, setEditMargin] = useState(false);
  // Review ▸ Learn from my choices: the examples (the particles said good or not, by their places, with their features),
  // the classifier learnt from them (none with fewer than 3 of a kind), the probability of every place of the last search
  const examples = useMemo(() => data.match?.examples ?? [], [data.match?.examples]);
  // (how often each method is right, and so the method Auto takes, worked out off the page — a fit for every example left
  // out, for every method —; the page fits the one chosen on all the examples)
  const [choice, setChoice] = useState<LearnChoice | null>(null);
  const learnWorker = useRef<Worker | null>(null);
  const learnSeq = useRef(0);
  useEffect(() => {
    const y = examples.map((e) => (e.good ? 1 : 0));
    if (!data.match?.learn || !enoughToLearn(y)) return;
    const X = examples.map((e) => e.f);
    const method = data.match?.method ?? 'auto';
    const seq = ++learnSeq.current;
    if (!learnWorker.current)
      try {
        learnWorker.current = new Worker(new URL('../image/learnWorker.ts', import.meta.url), { type: 'module' });
      } catch {
        learnWorker.current = null;
      }
    const w = learnWorker.current;
    if (!w) return setChoice(chooseMethod(X, y, method));
    w.onmessage = (ev: MessageEvent<LearnReply>) => {
      if (ev.data.seq === learnSeq.current) setChoice(ev.data.choice);
    };
    w.postMessage({ seq, X, y, method } satisfies LearnRequest);
  }, [data.match?.learn, data.match?.method, examples]);
  useEffect(() => () => learnWorker.current?.terminate(), []);
  const learnt = useMemo(() => {
    const y = examples.map((e) => (e.good ? 1 : 0));
    if (!data.match?.learn || !enoughToLearn(y)) return null;
    const method = data.match?.method ?? 'auto';
    // (until the worker answers: the method asked for, or the one Auto chose last, with the accuracies last known)
    const m = method !== 'auto' ? method : (choice?.method ?? 'logistic');
    const accuracy = choice?.accuracy ?? (Object.fromEntries(LEARN_METHODS.map((k) => [k, NaN])) as Record<LearnMethod, number>);
    return learnWith(examples.map((e) => e.f), y, { method: m, accuracy });
  }, [data.match?.learn, data.match?.method, examples, choice]);
  const pmin = data.match?.pmin ?? 0.5;
  // (what placing the particles needs of it, kept current for the answers of the worker)
  const learnRef = useRef<{ examples: MatchExample[]; prob: ((f: number[]) => number) | null; pmin: number } | null>(null);
  learnRef.current = data.match?.learn ? { examples, prob: learnt?.predict ?? null, pmin } : null;
  // the example at a place found (within a pixel and a half)
  const labelAt = (q: { x: number; y: number; x0?: number; y0?: number }, list: MatchExample[]) => list.find((e) => Math.hypot(e.x - ((q.x0 ?? q.x) + ox), e.y - ((q.y0 ?? q.y) + oy)) < 1.5);
  // the examples or the classifier changed: the particles of the last search placed again
  const learnKey = `${data.match?.learn ? 1 : 0}|${learnt?.method ?? ''}|${pmin}|${examples.length}|${examples.filter((e) => e.good).length}`;
  useEffect(() => {
    if (lastMatch.current) placeMatches(matchOpts.min, rejected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnKey]);
  // Show the unsure ones: the places the classifier is least sure of (their probability nearest ½), not said yet
  const [unsure, setUnsure] = useState(false);
  const unsureOf = () => {
    const lm = lastMatch.current;
    if (!unsure || !learnt || !lm) return [];
    return lm.list
      .map((q, i) => ({ i, d: q.f ? Math.abs(learnt.predict(q.f) - 0.5) : 9, said: !!labelAt(q, examples) }))
      .filter((x) => !x.said && x.d < 9)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map((x) => x.i);
  };
  // Accuracy: the particles found against those marked as true (a group of selections), in the part they cover
  const [acc, setAcc] = useState<AccuracyResult | null>(null);
  const truthGroup = data.match?.truth ?? 'truth';
  const checkAccuracy = () => {
    const truth = rois.filter((r) => r.group === truthGroup && isArea(r) && !r.auto).map(roiOutline);
    const found = rois.filter((r) => r.auto && !r.out && r.group !== truthGroup && isArea(r)).map(roiOutline);
    const a = accuracyOf(truth, found);
    setAcc(a);
    if (!a) setPartMsg(`Accuracy: mark the true particles first (selections in the group “${truthGroup}”)`);
  };
  // Advanced: the preset the settings are (custom: changed by hand), how many settings are not as they are by default
  const tuned = { step: matchOpts.step, tried: matchOpts.tried ?? MATCH_TUNING.tried, coarse: matchOpts.coarse ?? MATCH_TUNING.coarse, candidates: matchOpts.candidates ?? MATCH_TUNING.candidates };
  const matchPreset = (Object.entries(MATCH_PRESETS).find(([, v]) => v.step === tuned.step && v.tried === tuned.tried && v.coarse === tuned.coarse && v.candidates === tuned.candidates)?.[0] as string | undefined) ?? 'custom';
  const advancedChanged = [!!matchOpts.compare, matchOpts.step !== MATCH_DEFAULTS.step, matchOpts.tried !== undefined, matchOpts.coarse !== undefined, matchOpts.candidates !== undefined, matchOpts.edge !== undefined, matchOpts.max !== MATCH_DEFAULTS.max, !!matchOpts.brightness, !!matchOpts.image].filter(Boolean).length;
  const MODEL_COLORS = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a'];
  // (the models of the last search, their matches turned into selections when they come)
  const models = useRef<Roi[]>([]);
  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const canvasO = useRef<HTMLCanvasElement>(null);
  const canvasS = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const mode: Cmp = held ? 'original' : cmp;
  const needBefore = mode !== 'edited';

  // the worker: the image sent once, the steps every time they change
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const mseq = useRef(0);
  const sentId = useRef<string | null>(null);
  // the full-size images answered (the measurements asked again after each)
  const [fullSeq, setFullSeq] = useState(0);
  // the answers that need this render's state (a wand's outline, a stamp centred, the measurements)
  const onAnswer = useRef<(m: MeasureReply | WandReply | RaysReply | SpectrumReply | SpotReply | CentreReply | ParticlesReply | MatchReply | RefineReply) => void>(() => {});
  // a long piece of work (shown over the image), the time now (its clock), when the image's work started
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(0);
  const imgT0 = useRef(0);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const jobOn = !!job;
  useEffect(() => {
    if (!jobOn) return;
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [jobOn]);
  type FromWorker = ImgReply | ValueReply | MeasureReply | WandReply | RaysReply | SpectrumReply | SpotReply | CentreReply | ParticlesReply | MatchReply | RefineReply | ProgressReply;
  const onWorker = useRef<(m: FromWorker) => void>(() => {});
  onWorker.current = (m) => {
    if (m.type === 'value') return setVals(m);
    // (how far: the work running told; the image's steps at full size shown as a work of their own)
    if (m.type === 'progress')
      return setJob((j) => (j && j.of === m.of ? { ...j, stage: m.stage, done: m.done, total: m.total, step: m.step } : !j && m.of === 'image' && busyRef.current ? { of: 'image', label: 'Computing the image', stage: m.stage, done: m.done, total: m.total, step: m.step, t0: imgT0.current } : j));
    if (m.type === 'particles' || m.type === 'match' || m.type === 'refine') setJob((j) => (j?.of === m.type ? null : j));
    if (m.type !== 'image') return onAnswer.current(m);
    if (m.seq !== seq.current) return;
    setReply(m);
    // (a preview first: still computing the full size)
    if (m.scale === 1) {
      setBusy(false);
      setFullSeq((n) => n + 1);
      setJob((j) => (j?.of === 'image' ? null : j));
    }
  };
  // (a new worker: the image sent to it again)
  const [gen, setGen] = useState(0);
  const startWorker = () => {
    const w = new Worker(new URL('../image/imageWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FromWorker>) => onWorker.current(e.data);
    worker.current = w;
    sentId.current = null;
  };
  useEffect(() => {
    startWorker();
    return () => worker.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cancel: the worker stopped (and made again); the image's steps: the one being computed turned off, else it would
  // start again at once
  const cancelWork = () => {
    const j = job;
    if (j?.of === 'sam') {
      samW.current?.terminate();
      samW.current = null;
      samLoaded.current = null;
      samRead.current = '';
      samWait.current?.fail(new Error('cancelled'));
      samWait.current = null;
      setJob(null);
      setPartMsg('cancelled');
      return;
    }
    worker.current?.terminate();
    startWorker();
    setGen((g) => g + 1);
    setBusy(false);
    setJob(null);
    if (j?.of === 'image' && j.step) setStep(j.step, { on: false });
    setPartMsg(j?.of === 'image' ? 'stopped: the step being computed turned off' : 'cancelled');
  };
  const upToIndex = upTo === '__none' ? 0 : upTo ? steps.findIndex((s) => s.id === upTo) + 1 : steps.length;
  useEffect(() => {
    const w = worker.current;
    if (!w || !data.pixels) return;
    const t = setTimeout(() => {
      const q: ImgRequest = { seq: ++seq.current, steps, upTo: upToIndex, lut, ...(crop ? { crop } : {}), ...(overlay ? { overlay: { color: data.figure?.overlay ?? '#ff3b30', alpha: data.figure?.alpha ?? 0.45 } } : {}), ...(needBefore ? { before } : {}), ...(measuring ? { keep: true } : {}), ...(train.length ? { train } : {}) };
      if (sentId.current !== data.pixelsId) {
        q.pixels = data.pixels;
        q.id = data.pixelsId ?? 'img';
        sentId.current = data.pixelsId ?? 'img';
      }
      if (!busyRef.current) imgT0.current = performance.now();
      setBusy(true);
      w.postMessage(q);
    }, 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, upToIndex, lut, overlay, data.pixels, data.pixelsId, data.figure?.overlay, data.figure?.alpha, crop?.join(), needBefore, before, measuring, trainKey, gen]);
  // the measurements: asked when the selections or what is measured change, and after every full-size image (the
  // steps or the crop changed)
  useEffect(() => {
    const w = worker.current;
    if (!w || !data.pixels) return;
    if (!measuring) {
      setBook(null);
      return;
    }
    const t = setTimeout(() => {
      const q: MeasureRequest = { type: 'measure', mseq: ++mseq.current, steps, ...(crop ? { crop } : {}), ...(train.length ? { train } : {}), rois, spec, ...(data.cal ? { cal: data.cal } : {}), ox, oy, name: `${data.name.replace(/\.[a-z0-9]+$/i, '') || 'image'} measurements` };
      w.postMessage(q);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rois, data.measure, data.cal, fullSeq, measuring]);
  // the pixels drawn: the result, what it is compared with, the original as it came (for Crop and Scale)
  useEffect(() => {
    const put = (c: HTMLCanvasElement | null, rgba: Uint8ClampedArray | undefined, w: number, h: number) => {
      // (a reply of another size — the crop just changed — waits for the next one)
      if (!c || !rgba || rgba.length !== 4 * w * h) return;
      c.width = w;
      c.height = h;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    };
    if (!reply) return;
    put(canvas.current, reply.rgba, reply.w, reply.h);
    // (what it is compared with: the same size as the result)
    if (reply.before) put(canvasB.current, reply.before.rgba, reply.w, reply.h);
    // (drawn again when the view changes: the original shown for Crop and Scale, the spectrum, the comparison make new
    // canvases, else blank until the next result)
  }, [reply, mode, onOriginal, data.fft?.show]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = canvasO.current;
    if (!c || !full || !onOriginal) return;
    c.width = full.w;
    c.height = full.h;
    c.getContext('2d')!.putImageData(new ImageData(toRGBA(full, { lut: 'gray' }) as Uint8ClampedArray<ArrayBuffer>, full.w, full.h), 0, 0);
  }, [full, onOriginal]);

  // the spectrum: asked after every result (and when its settings change), shown instead of the image
  const fft = data.fft ?? {};
  const specOn = !!fft.show && !onOriginal;
  useEffect(() => {
    if (!specOn || !reply || reply.scale !== 1) return;
    worker.current?.postMessage({ type: 'spectrum', log: fft.log ?? true, hann: fft.hann ?? true, of: fft.of ?? 'result' } satisfies SpectrumRequest);
  }, [specOn, reply, fft.log, fft.hann, fft.of]);
  useEffect(() => {
    const c = canvasS.current;
    if (!c || !spectrumImg || !specOn) return;
    c.width = spectrumImg.N;
    c.height = spectrumImg.N;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(spectrumImg.rgba), spectrumImg.N, spectrumImg.N), 0, 0);
  }, [spectrumImg, specOn]);
  // the zoom that fits the view (zoom 0: fit) — side by side: half of it — measured when the view or the image changes
  const shown = specOn && spectrumImg ? { w: spectrumImg.N, h: spectrumImg.N } : onOriginal ? full : base;
  const [box, setBox] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const measure = () => setBox([v.clientWidth, v.clientHeight]);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);
  const side = mode === 'side' && !onOriginal;
  const paneW = side ? (box[0] - 6) / 2 : box[0];
  // (not below a tiny zoom: before the view is measured its size is not known)
  const fit = shown ? Math.max(0.02, Math.min((paneW - 20) / shown.w, (box[1] - 20) / shown.h)) : 1;
  const k = zoom || fit;
  const zoomAt = (f: number, cx?: number, cy?: number) => {
    const v = view.current;
    const nk = Math.min(64, Math.max(0.02, k * f));
    if (v && cx !== undefined && cy !== undefined) {
      const r = v.getBoundingClientRect();
      // (side by side: around the middle of the pane under the mouse)
      const left = side && cx - r.left > paneW ? r.left + paneW + 6 : r.left;
      const mx = cx - left - paneW / 2 - pan[0];
      const my = cy - r.top - r.height / 2 - pan[1];
      setPan([pan[0] - mx * (nk / k - 1), pan[1] - my * (nk / k - 1)]);
    }
    setZoom(nk);
  };
  // a point of the image under the mouse (pixels, fractional), from the canvas under it
  const imgAt = (e: { clientX: number; clientY: number }): [number, number] => {
    const els = [canvas.current, canvasB.current, canvasO.current].filter((c): c is HTMLCanvasElement => !!c && c.offsetParent !== null);
    const c = els.find((q) => {
      const r = q.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }) ?? els[0];
    const r = c.getBoundingClientRect();
    const im = onOriginal ? full : base;
    return [((e.clientX - r.left) / r.width) * (im?.w ?? 1), ((e.clientY - r.top) / r.height) * (im?.h ?? 1)];
  };
  const drag = useRef<{ x: number; y: number; pan: [number, number]; kind: 'pan' | 'line' | 'crop' | 'split' | 'draw' | 'move' | 'handle' | 'erase' | 'paint'; at?: [number, number]; roi?: Roi; handle?: string } | null>(null);
  // ---- the selections: drawn, picked, moved, edited ----
  const toOrig = (p: Pt): Pt => [p[0] + ox, p[1] + oy];
  const nextName = (taken: Roi[] = rois) => `R${1 + taken.reduce((m, r) => Math.max(m, Number(/^R(\d+)$/.exec(r.name)?.[1] ?? 0)), 0)}`;
  const newRoi = (kind: RoiKind, extra: Partial<Roi>): Roi => ({ id: `r${Date.now().toString(36)}${(roiSeq++).toString(36)}`, name: nextName(), kind, ...(group ? { group } : {}), ...extra });
  // the classifier (its classes give the examples painted their colour)
  const classifier = steps.find((s) => s.kind === 'classify');
  const toolOf = (t: PaintTool): Tool => (t === 'fill' ? 'freehand' : t);
  // (t: the tool it is started with — a tool button pressed before a class was picked)
  const setPaint = (c: string | null, t: PaintTool = paintTool) => {
    setPaintCls(c);
    if (c) setTool(toolOf(t));
    else if (tool === 'brush' || tool === 'eraser' || (paint && tool === 'freehand')) setTool('pan');
    setDraft(null);
  };
  const setPaintTool = (t: PaintTool) => {
    setPaintToolState(t);
    if (paint) setTool(toolOf(t));
  };
  // ---- the paint of the classifier: every pixel of the original its class (the brush, the eraser, the fill), drawn over
  // the image in the colours of the classes, kept in the node when a stroke ends ----
  // (the layer holds the paint kept as layerRle; a stroke kept is pending until the node's data has it — a render of
  // the data before it, while strokes follow fast, does not undo it; a paint that comes otherwise, an undo, another
  // image, is the layer's again)
  const layerRef = useRef<PaintLayer | null>(null);
  const layerRle = useRef<string | undefined>(data.paint?.rle);
  const pendingPaint = useRef<{ rle?: string } | null>(null);
  if (pendingPaint.current) {
    if (data.paint?.rle === pendingPaint.current.rle) pendingPaint.current = null;
  } else if (data.paint?.rle !== layerRle.current) {
    layerRef.current = null;
    layerRle.current = data.paint?.rle;
  }
  const layerNow = (): PaintLayer | null => {
    if (!full) return null;
    if (!layerRef.current || layerRef.current.w !== full.w || layerRef.current.h !== full.h) {
      layerRef.current = data.paint && data.paint.w === full.w && data.paint.h === full.h ? decodePaint(data.paint) : emptyPaint(full.w, full.h);
      layerRle.current = data.paint?.rle;
    }
    return layerRef.current;
  };
  const paintCanvases = useRef(new Set<HTMLCanvasElement>());
  const paintClasses = classifier ? stepClasses(classifier, rois) : [];
  // the paint of a box of the original (absent: all of the part analysed) drawn on the canvases over the image
  const drawPaint = (box?: Box) => {
    const l = layerNow();
    if (!l || !base) return;
    const rgb = l.classes.map((c) => {
      const hex = classColor(paintClasses, c).replace('#', '');
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    });
    const [bx0, by0, bx1, by1] = box ? [Math.max(0, box[0] - ox), Math.max(0, box[1] - oy), Math.min(base.w - 1, box[2] - ox), Math.min(base.h - 1, box[3] - oy)] : [0, 0, base.w - 1, base.h - 1];
    if (bx1 < bx0 || by1 < by0) return;
    const [bw, bh] = [bx1 - bx0 + 1, by1 - by0 + 1];
    const img = new ImageData(bw, bh);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const v = l.px[(y + by0 + oy) * l.w + x + bx0 + ox];
        if (!v || !rgb[v - 1]) continue;
        const o = (y * bw + x) * 4;
        [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]] = [rgb[v - 1][0], rgb[v - 1][1], rgb[v - 1][2], 115];
      }
    for (const c of paintCanvases.current) {
      if (c.width !== base.w || c.height !== base.h) {
        c.width = base.w;
        c.height = base.h;
        if (box) return drawPaint();
      }
      c.getContext('2d')!.putImageData(img, bx0, by0);
    }
  };
  const paintRef = (c: HTMLCanvasElement | null) => {
    if (!c) return;
    paintCanvases.current.add(c);
    requestAnimationFrame(() => drawPaint());
  };
  useEffect(() => {
    for (const c of [...paintCanvases.current]) if (!c.isConnected) paintCanvases.current.delete(c);
    drawPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.paint, full, crop?.join(), paintClasses.join()]);
  // the paint kept in the node (none painted: none kept)
  const commitPaint = () => {
    const l = layerNow();
    if (!l) return;
    const st = l.px.some((v) => v > 0) ? encodePaint(l) : undefined;
    layerRle.current = st?.rle;
    pendingPaint.current = { rle: st?.rle };
    set({ paint: st });
  };
  const painted = useMemo(() => (data.paint ? paintCounts(decodePaint(data.paint)) : {}), [data.paint]);
  const clearPaint = (cls: string) => {
    const l = layerNow();
    if (!l) return;
    clearClass(l, cls);
    drawPaint();
    commitPaint();
  };
  // the value a stroke paints (the class's number; the eraser: 0)
  const strokeVal = useRef(0);
  // the examples of the classifier under the eraser at q (pixels of the original)
  const eraseAt = (q: Pt) => {
    const gone = rois.filter((r) => r.train && nearRoi(r, q, brush / 2));
    if (gone.length) setRois(rois.filter((r) => !gone.includes(r)));
  };
  const commit = (r0: Roi) => {
    // (Fill while a class is painted: its inside painted)
    const l = paint && classifier && r0.kind === 'freehand' && !rois.some((x) => x.id === r0.id) ? layerNow() : null;
    if (l && paint && r0.pts && r0.pts.length >= 3) {
      drawPaint(paintFill(l, r0.pts, classIndex(l, paint)));
      commitPaint();
      setDraft(null);
      return;
    }
    // (a new selection while a class is painted: an example of it)
    const painted = paint && classifier && !rois.some((x) => x.id === r0.id);
    const r = painted ? { ...r0, train: paint, color: classColor(stepClasses(classifier, rois), paint), group: undefined } : r0;
    putRoi(r);
    setSel(r.id);
    setDraft(null);
  };
  const shownRois = draft ? (rois.some((r) => r.id === draft.id) ? rois.map((r) => (r.id === draft.id ? draft : r)) : [...rois, draft]) : rois;
  const pendingStamp = useRef(new Map<string, Roi>());
  // Find like this: every match found (down to a floor of similarity, so the least kept is changed live), the models, the
  // matches left out by a click (by their place in the list); review: a click on a particle found leaves it out (or back)
  const lastMatch = useRef<{ seq: string; list: (Match & { model: number; w?: number; h?: number; x0?: number; y0?: number; f?: number[] })[]; ms: Roi[]; specs: MatchModelSpec[]; took?: number; dropped?: number; note?: string } | null>(null);
  const [rejected, setRejected] = useState<number[]>([]);
  const [review, setReview] = useState(false);
  const MATCH_FLOOR = 0.3;
  // the names of the particles found: P1, P2 … but those the selections kept already have (the examples made of them)
  const particleNames = (n: number) => {
    const taken = new Set(rois.filter((r) => !r.auto).map((r) => r.name));
    const out: string[] = [];
    for (let k = 1; out.length < n; k++) if (!taken.has(`P${k}`)) out.push(`P${k}`);
    return out;
  };
  onAnswer.current = (m) => {
    if (m.type === 'measure') {
      if (m.mseq === mseq.current) setBook(m.book);
    } else if (m.type === 'spectrum') {
      setSpectrumImg(m);
    } else if (m.type === 'spot') {
      setLattice({ spots: [...(data.lattice?.spots ?? []), [m.fx, m.fy]] });
    } else if (m.type === 'wand') {
      if (m.pts && m.pts.length > 2) commit(newRoi('traced', { pts: m.pts.map(toOrig) }));
    } else if (m.type === 'rays') {
      // (a polygon: its corners dragged by hand)
      if (m.pts && m.pts.length > 2) commit(newRoi('polygon', { pts: m.pts.map(toOrig) }));
      else setPartMsg('Rays: no edge around the point clicked');
    } else if (m.type === 'match') {
      const ms = models.current;
      if (!ms.length) return;
      // (the models' own matches left out: they stay as they are)
      const list = m.matches.filter((q) => !ms.some((t) => Math.hypot(q.x + ox - roiCentre(t)[0], q.y + oy - roiCentre(t)[1]) < 0.5 * modelRadius(t)));
      lastMatch.current = { seq: Date.now().toString(36), list, ms, specs: modelSpecs.current, took: m.ms, dropped: m.dropped, ...(m.note ? { note: m.note } : {}) };
      setRejected([]);
      const placed = placeMatches(matchOpts.min, []);
      if (data.particles?.layers) layersFor(placed);
    } else if (m.type === 'refine') {
      // (every particle its shape: a square or rectangle as a box, a circle or ellipse as one, the others as polygons;
      // its turn, its sides; changed by hand no longer)
      const ids = refining.current;
      const made = new Map<string, Partial<Roi>>();
      const counts = new Map<string, number>();
      m.fits.forEach((f, k) => {
        if (!f) return;
        counts.set(f.shape, (counts.get(f.shape) ?? 0) + 1);
        const [cx, cy] = [f.cx + ox, f.cy + oy];
        const geo: Partial<Roi> =
          f.shape === 'square' || f.shape === 'rectangle' ? { kind: 'rect', box: [cx, cy, f.w, f.h], angle: f.angle, pts: undefined }
          : f.shape === 'circle' || f.shape === 'ellipse' ? { kind: 'ellipse', box: [cx, cy, f.w, f.h], angle: f.angle, pts: undefined }
          : { kind: 'polygon', pts: f.pts.map(([x, y]): Pt => [x + ox, y + oy]), box: undefined, angle: undefined };
        made.set(ids[k], { ...geo, shape: f.shape, hand: undefined });
      });
      updateNodeData(id, (n) => ({ rois: ((n.data as ImageAnalysisData).rois ?? []).map((r) => (made.has(r.id) ? ({ ...r, ...made.get(r.id) } as Roi) : r)) }));
      setPartMsg(`${made.size} refined: ${[...counts].map(([s, c]) => `${c} ${s}${c === 1 ? '' : 's'}`).join(', ')}`);
    } else if (m.type === 'particles') {
      if (m.error) return setPartMsg(m.error);
      // (those found before replaced; named P1, P2 … in the order met, row after row)
      const names = particleNames(m.outlines.length);
      const found: Roi[] = m.outlines.map((o, i) => ({ id: `p${Date.now().toString(36)}${i.toString(36)}`, name: names[i], kind: 'traced', pts: o.map(toOrig), group: partGroup, auto: true }));
      updateNodeData(id, (n) => ({ rois: [...((n.data as ImageAnalysisData).rois ?? []).filter((r) => !r.auto), ...found] }));
      if (data.particles?.layers) layersFor(found);
      setSel(null);
      setPartMsg(`${m.found} particle${m.found === 1 ? '' : 's'}${m.found > found.length ? ` (the first ${found.length} kept)` : ''}`);
    } else {
      const st = pendingStamp.current.get(m.id);
      pendingStamp.current.delete(m.id);
      if (st) putRoi(moveRoi(st, m.dx, m.dy));
    }
  };
  // a match as a selection: the shape of the model it is like, placed, turned and scaled as found (its edges fitted)
  const matchRoi = (q: Match & { model: number; w?: number; h?: number }, i: number, seq: string, ms: Roi[]): Roi => {
    const t = ms[q.model];
    const [tx, ty] = roiCentre(t);
    const spec = lastMatch.current?.specs[q.model];
    const listed = modelList.findIndex((m) => m.roi === spec?.roi);
    const color = listed >= 0 ? MODEL_COLORS[listed % MODEL_COLORS.length] : t.color;
    const base = { id: `m${seq}-${i}`, name: '', group: spec?.group?.trim() || partGroup, auto: true, score: +q.score.toFixed(4), ...(color ? { color } : {}) };
    if (t.box) return { ...base, kind: t.kind, box: [q.x + ox, q.y + oy, q.w ?? t.box[2] * q.scale, q.h ?? t.box[3] * q.scale], angle: (t.angle ?? 0) + q.angle };
    return { ...base, kind: 'polygon', pts: placeLike(roiOutline(t), tx, ty, q.angle, q.scale, q.x + ox, q.y + oy) };
  };
  // the matches as alike as `min` or more, not left out: the particles found (named P1, P2 … in the group of particles)
  const placeMatches = (min: number, out: number[]): Roi[] => {
    const lm = lastMatch.current;
    if (!lm) return [];
    // (learning: those said not good left out, and those the classifier finds less probable than asked)
    const lr = learnRef.current;
    const bad = lr ? lm.list.flatMap((q, i) => (labelAt(q, lr.examples)?.good === false ? [i] : [])) : [];
    out = lr ? bad : out;
    const keepIt = (q: (typeof lm.list)[number]) => (lr?.prob && q.f ? lr.prob(q.f) >= lr.pmin : q.score >= min);
    const keep = lm.list.map((q, i) => ({ q, i })).filter(({ q, i }) => keepIt(q) && !out.includes(i));
    const names = particleNames(keep.length);
    const found = keep.map(({ q, i }, k) => ({ ...matchRoi(q, i, lm.seq, lm.ms), name: names[k] }));
    updateNodeData(id, (n) => ({ rois: [...((n.data as ImageAnalysisData).rois ?? []).filter((r) => !r.auto), ...found] }));
    const below = lm.list.filter((q) => !keepIt(q)).length;
    const took = lm.took === undefined ? '' : ` · ${lm.took < 1000 ? `${lm.took} ms` : `${(lm.took / 1000).toFixed(1)} s`}`;
    const likeOut = lm.dropped ? `, ${lm.dropped} like those left out dropped` : '';
    setPartMsg(`${found.length} like ${lm.ms.length === 1 ? lm.ms[0].name : `the ${lm.ms.length} models`}${out.length ? `, ${out.length} left out by hand` : ''}${likeOut}${below ? ` (${below} ${lr?.prob ? `less probable than ${lr.pmin}` : `less alike than ${min}`})` : ''}${took}${lm.note ? `; ${lm.note}` : ''}`);
    return found;
  };
  // the least similarity changed: the particles found again from the matches already there
  const setMatchMin = (min: number) => {
    setMatch({ min });
    placeMatches(min, rejected);
  };
  // a particle found left out (or one left out put back) by a click while reviewing; learning: said not good, good,
  // then neither (an example of the classifier, by its place, with its features)
  const toggleMatch = (i: number) => {
    const lm = lastMatch.current;
    if (matchOpts.learn && lm) {
      const q = lm.list[i];
      if (!q) return;
      const had = labelAt(q, examples);
      const rest = examples.filter((e) => e !== had);
      // (one the classifier left out as less probable: the first click says it is good)
      const dropped = !had && !!learnt && !!q.f && learnt.predict(q.f) < pmin;
      const next: MatchExample[] = had?.good === false ? [...rest, { ...had, good: true }] : had ? rest : [...rest, { roi: lm.specs[q.model]?.roi ?? '', x: +((q.x0 ?? q.x) + ox).toFixed(2), y: +((q.y0 ?? q.y) + oy).toFixed(2), good: dropped, f: q.f ?? [] }];
      setMatch({ examples: next.length ? next : undefined });
      return;
    }
    const out = rejected.includes(i) ? rejected.filter((x) => x !== i) : [...rejected, i];
    setRejected(out);
    placeMatches(matchOpts.min, out);
  };
  // a polygon or segmented line drawn ended (its last point, following the mouse, left out; a double-click's repeats too)
  const finishDraft = () => {
    if (!draft?.pts) return;
    const pts = draft.pts.slice(0, -1).filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 0.5 / k);
    if ((draft.kind === 'polygon' && pts.length >= 3) || (draft.kind === 'polyline' && pts.length >= 2)) commit({ ...draft, kind: draft.kind === 'polyline' && pts.length === 2 ? 'line' : draft.kind, pts });
    else setDraft(null);
  };
  // the radius of the disc a model is taken in: its corners and a little around them
  const modelRadius = (t: Roi) => (t.box ? 0.5 * Math.hypot(t.box[2], t.box[3]) : Math.max(...roiOutline(t).map(([x, y]) => Math.hypot(x - roiCentre(t)[0], y - roiCentre(t)[1]))));
  // the models: the selection picked, and the others drawn in its group (not found ones, not examples, not background)
  const modelsOf = (t: Roi) => (t.group ? rois.filter((r) => r.group === t.group && isArea(r) && !r.auto && !r.train && r.role !== 'background') : [t]);
  // the settings of every model of the last search (the list's own, else those of all)
  const modelSpecs = useRef<MatchModelSpec[]>([]);
  const findWith = (ms: Roi[], specs: MatchModelSpec[] = ms.map((r) => specOf(r.id)), rejectedAll: MatchRejected[] = []) => {
    models.current = ms;
    modelSpecs.current = specs;
    const { fit, inside, models: _list, outer: _outer, image, useRejected: _use, rejected: _rej, ...opts } = matchOpts;
    const q: MatchRequest = {
      type: 'match',
      steps,
      ...(crop ? { crop } : {}),
      ...(train.length ? { train } : {}),
      models: ms.map((r, j) => {
        const [cx, cy] = roiCentre(r);
        const sp = specs[j] ?? specOf(r.id);
        const shaped = (sp.context ?? 'disc') !== 'disc';
        const own = { context: sp.context ?? 'disc', ...(sp.ring !== undefined ? { ring: sp.ring } : {}), ...(sp.symmetry ? { symmetry: sp.symmetry } : {}), ...(sp.sizes !== undefined ? { sizes: sp.sizes } : {}) };
        const rej = rejectedAll.filter((q) => q.roi === sp.roi).map((q) => ({ x: q.x - ox, y: q.y - oy, angle: q.angle, scale: q.scale }));
        return {
          cx: cx - ox,
          cy: cy - oy,
          R: modelRadius(r),
          ...(fit && r.box ? { box: { w: r.box[2], h: r.box[3], angle: r.angle ?? 0 } } : {}),
          ...(shaped || opts.separate === 'overlap' ? { poly: roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy]) } : {}),
          ...(sp.context === 'drawn' ? { outer: outerOf(r, sp).map(([x, y]): Pt => [x - ox, y - oy]) } : {}),
          ...(rej.length ? { rejected: rej } : {}),
          opts: own,
        };
      }),
      // (every match down to a floor: the least similarity is then changed live)
      opts: { ...opts, min: Math.min(opts.min, MATCH_FLOOR) },
      ...(image ? { image } : {}),
      ...(inside ? { inside: true } : {}),
    };
    setPartMsg('finding…');
    setJob({ of: 'match', label: 'Find like this', stage: 'the image steps', t0: performance.now() });
    worker.current?.postMessage(q);
  };
  // the particles left out in Review (kept with those of the searches before) when they are to be used: the places like
  // them dropped
  const rejectedNow = (): MatchRejected[] => {
    const lm = lastMatch.current;
    if (!lm || !matchOpts.useRejected) return [];
    return rejected.flatMap((i) => {
      const q = lm.list[i];
      const roi = q ? lm.specs[q.model]?.roi : undefined;
      // (the place the search found, not the one the edges were fitted to: as the next search finds it)
      return q && roi ? [{ roi, x: +((q.x0 ?? q.x) + ox).toFixed(2), y: +((q.y0 ?? q.y) + oy).toFixed(2), angle: q.angle, scale: q.scale }] : [];
    });
  };
  const findLikePicked = () => {
    const now = rejectedNow();
    const all = matchOpts.useRejected ? [...(data.match?.rejected ?? []), ...now] : [];
    if (now.length) setMatch({ rejected: all });
    // (the list of models when there is one; else the selection picked, with its group)
    if (modelList.length) return findWith(modelList.map((m) => rois.find((r) => r.id === m.roi)!), modelList.map((m) => specOf(m.roi)), all);
    const t = rois.find((r) => r.id === sel && isArea(r) && !r.train);
    if (!t) return setPartMsg('pick a selection around one particle first');
    findWith(modelsOf(t), undefined, all);
  };
  // the selection picked added to the list of models, with the settings of all
  const addModel = () => {
    const t = rois.find((r) => r.id === sel && isArea(r) && !r.train);
    if (!t || modelList.some((m) => m.roi === t.id)) return;
    setModels([...modelList, { roi: t.id, context: matchOpts.context ?? 'disc', ring: matchOpts.ring, symmetry: matchOpts.symmetry, sizes: matchOpts.sizes }]);
  };
  // again, with particles found as models too: of the surer half (as alike as the median of those found or more, not
  // cut by the image's edge), the least alike — they differ most from the first model; the least alike of all, near
  // the least similarity, are the doubtful ones, and as models they find more of their own mistakes
  const findMore = () => {
    const lm = lastMatch.current;
    if (!lm) return;
    const inImage = (r: Roi) => !base || roiOutline(r).every(([x, y]) => x >= ox && y >= oy && x <= ox + base.w && y <= oy + base.h);
    const found = rois.filter((r) => r.auto && r.id.startsWith(`m${lm.seq}-`) && inImage(r));
    const score = (r: Roi) => lm.list[Number(r.id.split('-')[1])]?.score ?? 1;
    const median = found.map(score).sort((a, b) => a - b)[found.length >> 1] ?? 1;
    const more = found
      .filter((r) => score(r) >= median)
      .sort((a, b) => score(a) - score(b))
      .slice(0, 4);
    // (each with the settings of the model it was found by)
    const specOf2 = (r: Roi) => ({ ...lm.specs[lm.list[Number(r.id.split('-')[1])]?.model ?? 0], roi: r.id });
    findWith([...lm.ms, ...more.map((r) => ({ ...r, auto: undefined }))], [...lm.specs, ...more.map(specOf2)]);
  };
  // Layers: the particles given, each its layer (1: nothing on it) and the colour of its layer
  const LAYER_COLORS = ['#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff'];
  const layersFor = (list: Roi[]) => {
    const parts = list.filter((r) => isArea(r));
    if (!parts.length || !base) return;
    const g = base.ch.length === 1 ? base.ch[0] : luminance(base);
    const res = estimateLayers(parts.map((r) => roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy])), g, base.w, base.h);
    const of = new Map(parts.map((r, k) => [r.id, res.layer[k]]));
    updateNodeData(id, (n) => ({ rois: ((n.data as ImageAnalysisData).rois ?? []).map((r) => (of.has(r.id) ? { ...r, layer: of.get(r.id), color: LAYER_COLORS[(of.get(r.id)! - 1) % LAYER_COLORS.length] } : r)) }));
    const counts = res.layer.reduce<Record<number, number>>((a, l) => ((a[l] = (a[l] ?? 0) + 1), a), {});
    setPartMsg(`layers: ${Object.entries(counts).map(([l, c]) => `${c} in layer ${l}`).join(', ')}`);
  };
  // Refine: the particles found (but those changed by hand, unless asked) made regular shapes; the answer applied to
  // the same particles (by their ids, kept while it works)
  const refining = useRef<string[]>([]);
  const refineParticles = (alsoHand: boolean) => {
    const list = rois.filter((r) => r.auto && !r.out && (alsoHand || !r.hand));
    if (!list.length) return setPartMsg('find particles first');
    refining.current = list.map((r) => r.id);
    const q: RefineRequest = { type: 'refine', steps, ...(crop ? { crop } : {}), ...(train.length ? { train } : {}), outlines: list.map((r) => roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy])), shapes: data.particles?.shapes ?? REGULAR_SHAPES, snap: data.particles?.snap ?? true };
    setPartMsg('refining…');
    setJob({ of: 'refine', label: 'Refining the shapes', t0: performance.now() });
    worker.current?.postMessage(q);
  };
  const findParticles = () => {
    const q: ParticlesRequest = { type: 'particles', steps, ...(crop ? { crop } : {}), ...(train.length ? { train } : {}), opts: partOpts };
    setPartMsg('finding…');
    setJob({ of: 'particles', label: 'Finding the particles', t0: performance.now() });
    worker.current?.postMessage(q);
  };
  // the way the particles are found (Particles ▸ Find): the one picked, else from what the node holds
  const thrStep = steps.find((q) => q.kind === 'threshold' || q.kind === 'localthreshold');
  const clsStep = steps.find((q) => q.kind === 'classify');
  const findM: FindMethod = data.find ?? (data.particles?.method === 'rays' ? 'rays' : data.match?.models?.length || rois.some((r) => r.auto && r.id.startsWith('m')) ? 'like' : clsStep && !thrStep ? 'classifier' : 'threshold');
  // ---- Segment anything: its worker (made when first used), the model it loaded, the image it read ----
  // (a setting back to its default is kept as undefined: those left out, not put over the defaults)
  const samSpec = { ...SAM_DEFAULTS, model: 'general' as SamModel, prompt: 'click' as 'click' | 'box' | 'all', ...Object.fromEntries(Object.entries(data.sam ?? {}).filter(([, v]) => v !== undefined)) };
  const setSam = (p: NonNullable<ImageAnalysisData['sam']>) => set({ sam: { ...data.sam, ...p } });
  const samW = useRef<Worker | null>(null);
  const samWait = useRef<{ want: SamReply['type']; ok: (m: SamReply) => void; fail: (e: Error) => void } | null>(null);
  const samLoaded = useRef<SamModel | null>(null);
  const samRead = useRef('');
  const [samCached, setSamCached] = useState<Partial<Record<SamModel, boolean>>>({});
  const [samEngine, setSamEngine] = useState('');
  const onSam = useRef<(m: SamReply) => void>(() => {});
  onSam.current = (m) => {
    if (m.type === 'progress') return setJob((j) => (j?.of === 'sam' ? { ...j, stage: m.stage, bytes: m.bytes, done: m.done, total: m.total } : j));
    const w = samWait.current;
    if (!w) return;
    samWait.current = null;
    if (m.type === 'error') w.fail(new Error(m.message));
    else if (m.type === w.want) w.ok(m);
  };
  const samAsk = <T extends SamReply['type']>(q: SamRequest, want: T): Promise<Extract<SamReply, { type: T }>> =>
    new Promise((ok, fail) => {
      if (!samW.current) {
        samW.current = new Worker(new URL('../image/samWorker.ts', import.meta.url), { type: 'module' });
        samW.current.onmessage = (e: MessageEvent<SamReply>) => onSam.current(e.data);
      }
      samWait.current = { want, ok: ok as (m: SamReply) => void, fail };
      samW.current.postMessage(q);
    });
  useEffect(() => () => samW.current?.terminate(), []);
  // (the files of a model kept in this browser already: no download, nothing asked)
  const samUrls = (m: SamModel) => [SAM_ENGINE.file, SAM_MODELS[m].encoder, SAM_MODELS[m].decoder].map((f) => new URL(f, document.baseURI).href);
  const samIsCached = async (m: SamModel) => {
    try {
      const c = await caches.open(SAM_CACHE);
      return (await Promise.all(samUrls(m).map((u) => c.match(u)))).every(Boolean);
    } catch {
      return false;
    }
  };
  useEffect(() => {
    if (data.find !== 'sam') return;
    let live = true;
    void samIsCached(samSpec.model).then((v) => live && setSamCached((c) => ({ ...c, [samSpec.model]: v })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.find, samSpec.model]);
  const samForget = async () => {
    try {
      const c = await caches.open(SAM_CACHE);
      // (the engine kept while the other model still needs it)
      const other: SamModel = samSpec.model === 'em' ? 'general' : 'em';
      const keepEngine = await samIsCached(other);
      await Promise.all(samUrls(samSpec.model).filter((_, i) => i > 0 || !keepEngine).map((u) => c.delete(u)));
    } catch {
      // (nothing kept)
    }
    setSamCached((c) => ({ ...c, [samSpec.model]: false }));
  };
  const samKey = `${data.pixelsId ?? 'img'}|${crop?.join() ?? ''}`;
  // the model loaded (asked first when it is not kept in this browser) and the image read; false: not (said why)
  const samReady = async (): Promise<boolean> => {
    const model = samSpec.model;
    const m = SAM_MODELS[model];
    try {
      if (samLoaded.current !== model) {
        const kept = await samIsCached(model);
        if (!kept) {
          const mb = (b: number) => Math.round(b / 1048576);
          const yes = await ask(`Download ${m.label} to find the particles? About ${mb(m.bytes + SAM_ENGINE.bytes)} MB (the model ${mb(m.bytes)} MB, the engine that runs it ${mb(SAM_ENGINE.bytes)} MB), from this site, once: kept in this browser for the next times. The image never leaves this computer. ${m.credit}.`, { ok: 'Download' });
          if (!yes) return false;
        }
        setJob({ of: 'sam', label: kept ? `${m.label}: loading` : `Downloading ${m.label}`, t0: performance.now() });
        const r = await samAsk({ type: 'load', model, base: new URL('./', document.baseURI).href }, 'ready');
        samLoaded.current = model;
        samRead.current = '';
        setSamEngine(r.provider === 'webgpu' ? 'on the graphics card (WebGPU)' : r.provider === 'wasm' ? 'on the processor (WebAssembly)' : '');
        setSamCached((c) => ({ ...c, [model]: true }));
      }
      if (samRead.current !== samKey && base) {
        setJob({ of: 'sam', label: 'Segment anything', stage: 'reading the image (the encoder)', t0: performance.now() });
        await samAsk({ type: 'encode', key: samKey, ch: base.ch, w: base.w, h: base.h, lo: base.lo, hi: base.hi }, 'encoded');
        samRead.current = samKey;
      }
      setJob((j) => (j?.of === 'sam' ? null : j));
      return true;
    } catch (e) {
      setJob((j) => (j?.of === 'sam' ? null : j));
      if ((e as Error).message !== 'cancelled') setPartMsg(`Segment anything: ${(e as Error).message}`);
      return false;
    }
  };
  // the next name of a particle (P and the next number)
  const nextParticle = () => `P${1 + rois.reduce((m, r) => Math.max(m, Number(/^P(\d+)$/.exec(r.name)?.[1] ?? 0)), 0)}`;
  // a click (on the image analysed, its pixels): a particle; Shift-click: a part added to the last one, Alt-click: a
  // part taken off it
  const samObj = useRef<{ pts: [number, number, number][]; roi: string | null; name: string }>({ pts: [], roi: null, name: '' });
  // Find like this ▸ Pick with SAM: a click on a good particle, its outline a selection picked as the model, compared
  // with its margin (the outline widened by grow px, then edited as one drawn)
  const samGrow = data.match?.grow ?? 6;
  const samModelClick = async (p: Pt) => {
    if (!(await samReady())) return;
    try {
      const r = await samAsk({ type: 'prompt', seq: 0, pts: [[p[0], p[1], 1]] }, 'mask');
      if (!r.outline) return setPartMsg('Segment anything: nothing found there');
      const roi = newRoi('polygon', { pts: thinOutline(r.outline.map(toOrig)) });
      const [cx, cy] = roiCentre(roi);
      const off = offsetOutline(roiOutline(roi), Math.max(0.5, samGrow));
      const every = Math.max(1, Math.ceil(off.length / 24));
      const outer = off.filter((_, i) => i % every === 0).map(([x, y]): Pt => [+(x - cx).toFixed(2), +(y - cy).toFixed(2)]);
      putRoi(roi);
      setSel(roi.id);
      if (modelList.length) setModels([...modelList, { roi: roi.id, context: 'drawn', ring: samGrow, outer, symmetry: matchOpts.symmetry, sizes: matchOpts.sizes }]);
      else setMatch({ context: 'drawn', outer, ring: samGrow });
      setTool('pan');
      setPartMsg(`${roi.name}: the model, from Segment anything (${(Math.min(1, r.score) * 100).toFixed(0)} % sure); its margin the outline + ${samGrow} px (Compared area: edit it). Then Find like this`);
    } catch (e) {
      setPartMsg(`Segment anything: ${(e as Error).message}`);
    }
  };
  const samClick = async (p: Pt, mod: { shiftKey: boolean; altKey: boolean }) => {
    if (!(await samReady())) return;
    const more = (mod.shiftKey || mod.altKey) && !!samObj.current.roi && rois.some((r) => r.id === samObj.current.roi);
    const cur = more ? samObj.current : { pts: [], roi: null, name: '' };
    const pts: [number, number, number][] = [...cur.pts, [p[0], p[1], mod.altKey ? 0 : 1]];
    try {
      const r = await samAsk({ type: 'prompt', seq: 0, pts }, 'mask');
      if (!r.outline) return setPartMsg('Segment anything: nothing found there');
      samPut(r.outline, r.score, cur.roi, cur.name, pts);
    } catch (e) {
      setPartMsg(`Segment anything: ${(e as Error).message}`);
    }
  };
  // a box drawn (pixels of the original): the particle in it
  const samBoxFrom = async (b: [number, number, number, number]) => {
    const [cx, cy, bw, bh] = b;
    const box: [number, number, number, number] = [cx - bw / 2 - ox, cy - bh / 2 - oy, cx + bw / 2 - ox, cy + bh / 2 - oy];
    if (!(await samReady())) return;
    try {
      const r = await samAsk({ type: 'prompt', seq: 0, pts: [], box }, 'mask');
      if (!r.outline) return setPartMsg('Segment anything: nothing found in the box');
      samPut(r.outline, r.score, null, '', []);
    } catch (e) {
      setPartMsg(`Segment anything: ${(e as Error).message}`);
    }
  };
  const samPut = (outline: Pt[], score: number, rid: string | null, name0: string, pts: [number, number, number][]) => {
    const id = rid ?? `s${Date.now().toString(36)}${(roiSeq++).toString(36)}`;
    const name = name0 || nextParticle();
    // (the model's guess of how good a mask is may pass 1 a little)
    putRoi({ id, name, kind: 'traced', pts: outline.map(toOrig), group: partGroup, auto: true, score: +Math.min(1, score).toFixed(4) });
    samObj.current = { pts, roi: id, name };
    setPartMsg(`${name}: the model ${(Math.min(1, score) * 100).toFixed(0)} % sure of it${pts.length ? ' (Shift-click: a part added, Alt-click: a part taken off)' : ''}`);
  };
  // Everything: every particle, from a grid of points (those found before replaced)
  const samAll = async () => {
    if (!(await samReady()) || !base) return;
    setJob({ of: 'sam', label: 'Segment anything: every particle', t0: performance.now() });
    try {
      const { perSide, iou, stability, nms, minArea, maxFrac, edges } = samSpec;
      // (the data bar under the image, when not cut: no points on it)
      const rows = !crop && barRows > 0 ? base.h - barRows : base.h;
      const r = await samAsk({ type: 'everything', seq: 0, opts: { perSide, iou, stability, nms, minArea, maxFrac, edges }, rows }, 'masks');
      setJob((j) => (j?.of === 'sam' ? null : j));
      const names = particleNames(r.outlines.length);
      const found: Roi[] = r.outlines.map((o, i) => ({ id: `s${Date.now().toString(36)}${i.toString(36)}`, name: names[i], kind: 'traced', pts: o.pts.map(toOrig), group: partGroup, auto: true, score: +Math.min(1, o.score).toFixed(4) }));
      updateNodeData(id, (n) => ({ rois: [...((n.data as ImageAnalysisData).rois ?? []).filter((q) => !q.auto), ...found] }));
      if (data.particles?.layers) layersFor(found);
      setSel(null);
      setPartMsg(`${found.length} particle${found.length === 1 ? '' : 's'} from ${r.tried} points · ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}`);
    } catch (e) {
      setJob((j) => (j?.of === 'sam' ? null : j));
      if ((e as Error).message !== 'cancelled') setPartMsg(`Segment anything: ${(e as Error).message}`);
    }
  };
  // ---- Review of the particles found by any way but Find like this (it has its own): a click leaves one out or puts it
  // back; learning: said not good, good, neither; what was learnt and how sure Segment anything is leave others out ----
  const rv = data.review ?? {};
  const setRv = (p: NonNullable<ImageAnalysisData['review']>) => set({ review: { ...data.review, ...p } });
  const genReview = task === 'particles' && findM !== 'like';
  const [checking, setChecking] = useState(false);
  const [unsureG, setUnsureG] = useState(false);
  const autoRois = useMemo(() => rois.filter((r) => r.auto && isArea(r)), [rois]);
  const grayBase = useMemo(() => (base ? (base.ch.length === 1 ? base.ch[0] : luminance(base)) : null), [base]);
  // (what is known of every particle: made again when the particles or their outlines change, not when said or left out)
  const autoKey = autoRois.map((r) => `${r.id}:${r.pts?.length ?? 0}:${r.pts?.[0]?.join() ?? ''}:${r.box?.join() ?? ''}`).join('|');
  const feats = useMemo(() => {
    if (!genReview || !grayBase || !base || !autoRois.length) return null;
    const f = particleFeatures(autoRois.map((r) => roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy])), grayBase, base.w, base.h, base.lo, base.hi, autoRois.map((r) => (r.id.startsWith('s') ? r.score : undefined)));
    return new Map(autoRois.map((r, i) => [r.id, f[i]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, grayBase, genReview]);
  const saidList = autoRois.filter((r) => r.said !== undefined && feats?.has(r.id));
  const saidKey = `${saidList.map((r) => `${r.id}${r.said ? 1 : 0}`).join()}|${feats ? autoKey : ''}`;
  // (how often each method is right, the method Auto takes: off the page, as Find like this's)
  const [gChoice, setGChoice] = useState<LearnChoice | null>(null);
  const gWorker = useRef<Worker | null>(null);
  const gSeq = useRef(0);
  useEffect(() => {
    const y = saidList.map((r) => (r.said ? 1 : 0));
    if (!rv.learn || !feats || !enoughToLearn(y)) return;
    const X = saidList.map((r) => feats.get(r.id)!);
    const method = rv.method ?? 'auto';
    const seq = ++gSeq.current;
    if (!gWorker.current)
      try {
        gWorker.current = new Worker(new URL('../image/learnWorker.ts', import.meta.url), { type: 'module' });
      } catch {
        gWorker.current = null;
      }
    const w = gWorker.current;
    if (!w) return setGChoice(chooseMethod(X, y, method));
    w.onmessage = (ev: MessageEvent<LearnReply>) => {
      if (ev.data.seq === gSeq.current) setGChoice(ev.data.choice);
    };
    w.postMessage({ seq, X, y, method } satisfies LearnRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rv.learn, rv.method, saidKey]);
  useEffect(() => () => gWorker.current?.terminate(), []);
  const gLearnt = useMemo(() => {
    const y = saidList.map((r) => (r.said ? 1 : 0));
    if (!rv.learn || !feats || !enoughToLearn(y)) return null;
    const method = rv.method ?? 'auto';
    const m = method !== 'auto' ? method : (gChoice?.method ?? 'logistic');
    const accuracy = gChoice?.accuracy ?? (Object.fromEntries(LEARN_METHODS.map((q) => [q, NaN])) as Record<LearnMethod, number>);
    return learnWith(saidList.map((r) => feats.get(r.id)!), y, { method: m, accuracy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rv.learn, rv.method, saidKey, gChoice]);
  const gProb = useMemo(() => (gLearnt && feats ? new Map([...feats].map(([rid, f]) => [rid, gLearnt.predict(f)])) : null), [gLearnt, feats]);
  const gPmin = rv.pmin ?? 0.5;
  const gSure = rv.sure ?? 0;
  // (every particle left out or not, as said, clicked, learnt and how sure: changed only where it differs)
  useEffect(() => {
    if (!genReview) return;
    const want = (r: Roi) => outOf(r, gProb?.get(r.id), gPmin, gSure);
    if (!rois.some((r) => r.auto && want(r) !== r.out)) return;
    updateNodeData(id, (n) => ({ rois: ((n.data as ImageAnalysisData).rois ?? []).map((r) => (r.auto && want(r) !== r.out ? { ...r, out: want(r) } : r)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rois, gProb, gPmin, gSure, genReview]);
  // a click while reviewing: learning, said not good, good, then neither; else left out, or put back (one left out by
  // what was learnt or by how sure: kept, as said good)
  const reviewClick = (r: Roi) => {
    if (rv.learn) return putRoi({ ...r, said: r.said === undefined ? false : r.said === false ? true : undefined });
    if (!r.out) putRoi({ ...r, out: 'hand', said: undefined });
    else if (r.out === 'hand') putRoi({ ...r, out: undefined });
    else putRoi({ ...r, said: true });
  };
  const unsureIds = useMemo(() => {
    if (!unsureG || !gProb) return undefined;
    return new Set(
      autoRois
        .filter((r) => r.said === undefined && gProb.has(r.id))
        .sort((a, b) => Math.abs(gProb.get(a.id)! - 0.5) - Math.abs(gProb.get(b.id)! - 0.5))
        .slice(0, 5)
        .map((r) => r.id),
    );
  }, [unsureG, gProb, autoRois]);
  // the particles grouped (and coloured): by their shape, or like the examples (the particles given another group by
  // hand: their colour too)
  const shapes = () => new Map(rois.filter((r) => r.auto).map((r) => [r.id, shapeFeatures(r, roiOutline(r), roiPerimeter(r))]));
  const groupByShape = () => {
    const f = shapes();
    setRois(
      rois.map((r) => {
        if (!f.has(r.id)) return r;
        const g = shapeName(f.get(r.id)!);
        return { ...r, group: g, color: SHAPE_COLORS[g] };
      }),
    );
  };
  const groupLike = () => {
    const f = shapes();
    const g = groupLikeExamples(
      rois.filter((r) => f.has(r.id)).map((r) => ({ id: r.id, group: r.group ?? '', f: f.get(r.id)! })),
      partGroup,
    );
    if (!g.size) return setPartMsg(`first give a few particles a group other than “${partGroup}” (in the list)`);
    const colour = new Map(rois.filter((r) => f.has(r.id) && r.group !== partGroup).map((r) => [r.group ?? '', r.color]));
    setRois(rois.map((r) => (g.has(r.id) ? { ...r, group: g.get(r.id), color: colour.get(g.get(r.id)!) ?? r.color } : r)));
  };
  const removeRoi = (rid: string) => {
    setRois(rois.filter((r) => r.id !== rid));
    if (sel === rid) setSel(null);
  };
  const duplicate = () => {
    const r = rois.find((q) => q.id === sel);
    if (!r) return;
    const c = { ...moveRoi(r, 10, 10), id: `r${Date.now().toString(36)}${(roiSeq++).toString(36)}`, name: nextName() };
    setRois([...rois, c]);
    setSel(c.id);
  };
  const roiDown = (q: Pt, p: Pt) => {
    const w = worker.current;
    switch (tool) {
      case 'eraser':
      case 'brush': {
        // (a stroke on the paint: the class picked, or erased; an example drawn as a selection, as before, erased too)
        const l = layerNow();
        if (!l) return;
        strokeVal.current = tool === 'brush' && paint ? classIndex(l, paint) : 0;
        if (tool === 'eraser') eraseAt(q);
        drawPaint(paintDisc(l, q[0], q[1], brush / 2, strokeVal.current));
        drag.current = { x: 0, y: 0, pan, kind: 'paint', at: q };
        return;
      }
      case 'sambox': {
        const r = newRoi('rect', { box: [q[0], q[1], 0, 0], angle: 0 });
        setDraft(r);
        drag.current = { x: 0, y: 0, pan, kind: 'draw', at: q, roi: r };
        return;
      }
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'freehand': {
        const r = tool === 'rect' || tool === 'ellipse' ? newRoi(tool, { box: [q[0], q[1], 0, 0], angle: 0 }) : newRoi(tool, { pts: tool === 'line' ? [q, q] : [q] });
        setDraft(r);
        drag.current = { x: 0, y: 0, pan, kind: 'draw', at: q, roi: r };
        return;
      }
      case 'polygon':
      case 'polyline':
      case 'angle': {
        if (draft && draft.kind === tool && draft.pts) {
          const pts = draft.pts;
          // (a click on the first corner closes a polygon)
          if (tool === 'polygon' && pts.length > 3 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) * k < 8) return finishDraft();
          const next: Pt[] = [...pts.slice(0, -1), q, q];
          if (tool === 'angle' && next.length > 3) return commit({ ...draft, pts: next.slice(0, 3) });
          setDraft({ ...draft, pts: next });
        } else setDraft(newRoi(tool, { pts: [q, q] }));
        return;
      }
      case 'points': {
        const cur = rois.find((r) => r.id === sel && r.kind === 'points');
        commit(cur ? { ...cur, pts: [...(cur.pts ?? []), q] } : newRoi('points', { pts: [q] }));
        return;
      }
      case 'wand':
        w?.postMessage({ type: 'wand', x: p[0], y: p[1], tol: wandTol });
        return;
      case 'rays':
        w?.postMessage({ type: 'rays', x: p[0], y: p[1], ...(raysOf === 'auto' ? {} : { light: raysOf === 'bright' }) });
        return;
      case 'stamp': {
        const tpl = rois.find((r) => r.id === sel && isArea(r));
        if (!tpl) return;
        const [cx, cy] = roiCentre(tpl);
        const copy: Roi = { ...moveRoi(tpl, q[0] - cx, q[1] - cy), id: `r${Date.now().toString(36)}${(roiSeq++).toString(36)}`, name: nextName([...rois, ...pendingStamp.current.values()]) };
        if (centre !== 'off' && w) {
          pendingStamp.current.set(copy.id, copy);
          w.postMessage({ type: 'centre', id: copy.id, poly: roiOutline(copy).map(([x, y]): Pt => [x - ox, y - oy]), dark: centre === 'dark' });
        } else putRoi(copy);
        return;
      }
    }
  };
  // the selection being drawn or edited, as the mouse moves
  const roiMove = (e: RPointerEvent, d: NonNullable<typeof drag.current>) => {
    const q = toOrig(imgAt(e));
    const r = d.roi!;
    const a = d.at!;
    if (d.kind === 'move') return setDraft(moveRoi(r, q[0] - a[0], q[1] - a[1]));
    if (d.kind === 'draw') {
      if (r.kind === 'rect' || r.kind === 'ellipse') {
        let [dx, dy] = [q[0] - a[0], q[1] - a[1]];
        if (e.shiftKey) {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          [dx, dy] = [Math.sign(dx) * m, Math.sign(dy) * m];
        }
        return setDraft({ ...r, box: [a[0] + dx / 2, a[1] + dy / 2, Math.abs(dx), Math.abs(dy)] });
      }
      if (r.kind === 'line') {
        let end = q;
        if (e.shiftKey) {
          const L = Math.hypot(q[0] - a[0], q[1] - a[1]);
          const t = Math.round(Math.atan2(q[1] - a[1], q[0] - a[0]) / (Math.PI / 4)) * (Math.PI / 4);
          end = [a[0] + L * Math.cos(t), a[1] + L * Math.sin(t)];
        }
        return setDraft({ ...r, pts: [a, end] });
      }
      // freehand: a point every pixel or so of the screen
      return setDraft((cur) => {
        const pts = cur?.pts ?? [];
        const last = pts[pts.length - 1];
        return cur && (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) * k >= 2) ? { ...cur, pts: [...pts, q] } : cur;
      });
    }
    // a handle: the turn, a side or a corner of a box (the opposite one kept), a point
    const h = d.handle ?? '';
    if (h === 'rot' && r.box) {
      let ang = (Math.atan2(q[1] - r.box[1], q[0] - r.box[0]) * 180) / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      return setDraft({ ...r, angle: ((ang + 540) % 360) - 180 });
    }
    if (h[0] === 'b' && r.box) {
      const [sx, sy] = h.slice(1).split(',').map(Number);
      const [cx, cy, bw, bh] = r.box;
      const t = ((r.angle ?? 0) * Math.PI) / 180;
      const [c, s] = [Math.cos(t), Math.sin(t)];
      const [dx, dy] = [q[0] - cx, q[1] - cy];
      const [lu, lv] = [dx * c + dy * s, -dx * s + dy * c];
      const [fu, fv] = [(-sx * Math.abs(bw)) / 2, (-sy * Math.abs(bh)) / 2];
      const nw = sx ? Math.max(1, Math.abs(lu - fu)) : Math.abs(bw);
      const nh = sy ? Math.max(1, Math.abs(lv - fv)) : Math.abs(bh);
      const [cu, cv] = [sx ? (lu + fu) / 2 : 0, sy ? (lv + fv) / 2 : 0];
      return setDraft({ ...r, box: [cx + cu * c - cv * s, cy + cu * s + cv * c, nw, nh] });
    }
    if (h[0] === 'v' && r.pts) {
      const i = Number(h.slice(1));
      return setDraft({ ...r, pts: r.pts.map((pt, j) => (j === i ? q : pt)) });
    }
  };
  const onDouble = (e: React.MouseEvent) => {
    if ((tool === 'polygon' || tool === 'polyline') && draft) return finishDraft();
    // a point of the selection picked taken off
    const hd = (e.target as Element).closest('[data-handle]') as SVGElement | null;
    const r = rois.find((q) => q.id === sel);
    const h = hd?.dataset.handle ?? '';
    if (!r?.pts || h[0] !== 'v') return;
    const pts = r.pts.filter((_, j) => j !== Number(h.slice(1)));
    const least = r.kind === 'polygon' ? 3 : r.kind === 'points' ? 1 : r.kind === 'angle' ? 3 : 2;
    if (pts.length >= least) setRois(rois.map((q) => (q.id === r.id ? { ...r, pts } : q)));
    else if (r.kind === 'points') removeRoi(r.id);
  };
  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // (the spectrum shown: the mouse moves it only; its spots are picked over it, in the Lattice tab)
    if (specOn) {
      drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'pan' };
      return;
    }
    const p = imgAt(e);
    if ((e.target as Element).closest('.ie-split-handle')) {
      drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'split' };
      return;
    }
    if (!onOriginal && e.button === 0) {
      const t = e.target as Element;
      const hd = t.closest('[data-handle]') as SVGElement | null;
      const rg = t.closest('[data-roi]') as SVGElement | null;
      const q = toOrig(p);
      const picked = rois.find((r) => r.id === sel);
      // (a handle of the selection picked: whatever the tool)
      if (hd && picked && rg?.dataset.roi === sel) {
        drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'handle', at: q, roi: picked, handle: hd.dataset.handle };
        return;
      }
      // (reviewing the matches: a click on one found leaves it out, on one left out puts it back)
      const back = t.closest('[data-rejected]') as SVGElement | null;
      if (review && back) return toggleMatch(Number(back.dataset.rejected));
      // (Review of the particles of any other way)
      if (checking && genReview && rg) {
        const r = rois.find((x) => x.id === rg.dataset.roi);
        if (r?.auto) return reviewClick(r);
      }
      if (review && rg && lastMatch.current && rg.dataset.roi?.startsWith(`m${lastMatch.current.seq}-`)) return toggleMatch(Number(rg.dataset.roi.split('-')[1]));
      if (tool === 'pan' && rg) {
        const r = rois.find((x) => x.id === rg.dataset.roi);
        if (r) {
          setSel(r.id);
          drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'move', at: q, roi: r };
          return;
        }
      }
      if (tool === 'sam') return void samClick(p, e);
      if (tool === 'sammodel') return void samModelClick(p);
      if (roiTool) return roiDown(q, p);
    }
    if (tool === 'scale' && e.button === 0) {
      setLine([p[0], p[1], p[0], p[1]]);
      setSnapped(null);
      drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'line' };
      return;
    }
    if (tool === 'crop' && e.button === 0) {
      setCropDraft([p[0], p[1], 0, 0]);
      drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'crop', at: p };
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'pan' };
  };
  const asked = useRef<string>('');
  const onMove = (e: RPointerEvent) => {
    const im = onOriginal ? full : base;
    if (im) {
      const p = imgAt(e);
      const v = view.current!.getBoundingClientRect();
      const inside = p[0] >= 0 && p[1] >= 0 && p[0] < im.w && p[1] < im.h;
      setHover(inside ? { p, sx: e.clientX - v.left, sy: e.clientY - v.top } : null);
      const key = `${Math.floor(p[0])},${Math.floor(p[1])}`;
      if (inside && !onOriginal && key !== asked.current) {
        asked.current = key;
        worker.current?.postMessage({ type: 'value', x: p[0], y: p[1] });
      }
    }
    const d = drag.current;
    // (a polygon, segmented line or angle being drawn: its last point follows the mouse)
    if (!d && draft?.pts && (draft.kind === 'polygon' || draft.kind === 'polyline' || draft.kind === 'angle') && !onOriginal) {
      const q = toOrig(imgAt(e));
      setDraft({ ...draft, pts: [...draft.pts.slice(0, -1), q] });
    }
    if (!d) return;
    if (d.kind === 'erase') return eraseAt(toOrig(imgAt(e)));
    if (d.kind === 'paint') {
      const l = layerNow();
      const q = toOrig(imgAt(e));
      if (!l || !d.at) return;
      drawPaint(paintSegment(l, d.at, q, brush / 2, strokeVal.current));
      if (strokeVal.current === 0) eraseAt(q);
      d.at = q;
      return;
    }
    if (d.kind === 'draw' || d.kind === 'move' || d.kind === 'handle') return roiMove(e, d);
    if (d.kind === 'split') {
      const v = view.current!.getBoundingClientRect();
      setSplit(Math.min(0.98, Math.max(0.02, splitDir === 'v' ? (e.clientX - v.left) / v.width : (e.clientY - v.top) / v.height)));
      return;
    }
    if (d.kind === 'line') {
      const p = imgAt(e);
      // Shift: horizontal or vertical
      setLine((l) => (l ? (e.shiftKey ? (Math.abs(p[0] - l[0]) > Math.abs(p[1] - l[1]) ? [l[0], l[1], p[0], l[1]] : [l[0], l[1], l[0], p[1]]) : [l[0], l[1], p[0], p[1]]) : l));
      return;
    }
    if (d.kind === 'crop' && d.at) {
      const p = imgAt(e);
      setCropDraft([Math.min(d.at[0], p[0]), Math.min(d.at[1], p[1]), Math.abs(p[0] - d.at[0]), Math.abs(p[1] - d.at[1])]);
      return;
    }
    setPan([d.pan[0] + e.clientX - d.x, d.pan[1] + e.clientY - d.y]);
  };
  const onUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'paint') {
      // (the stroke ended: kept, and the classifier learns from it)
      commitPaint();
    } else if (d?.kind === 'draw' && draft && tool === 'sambox') {
      // (Box (SAM): the particle in the box, not a selection)
      if (draft.box && draft.box[2] * k >= 3 && draft.box[3] * k >= 3) void samBoxFrom(draft.box);
      setDraft(null);
    } else if (d?.kind === 'draw' && draft) {
      // (a click without a drag draws nothing)
      const big = draft.box ? draft.box[2] * k >= 3 && draft.box[3] * k >= 3 : draft.kind === 'freehand' ? (draft.pts?.length ?? 0) >= 3 : Math.hypot(draft.pts![1][0] - draft.pts![0][0], draft.pts![1][1] - draft.pts![0][1]) * k >= 3;
      if (big) commit(draft);
      else setDraft(null);
    }
    if ((d?.kind === 'move' || d?.kind === 'handle') && draft) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 1) commit(draft.auto ? { ...draft, hand: true } : draft);
      else setDraft(null);
    }
    // (a click on the image, not on a selection: none picked)
    if (d?.kind === 'pan' && tool === 'pan' && e.button === 0 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) setSel(null);
    if (d?.kind === 'line' && line && snap && full && fullGray) {
      // the ends found on the bar (else the line as drawn)
      const s = snapToBar(fullGray, full.w, full.h, full.lo, full.hi, line);
      if (s) setLine(s);
      setSnapped(!!s);
    }
    if (d?.kind === 'crop' && cropDraft && full) {
      const c = cropBox(cropDraft, full.w, full.h);
      // (a part chosen: the result of it shown at once)
      if (cropDraft[2] > 3 && cropDraft[3] > 3) {
        set({ crop: c ?? undefined });
        setTool('pan');
      }
      setCropDraft(null);
    }
  };
  // Calibration ▸ read the scale bar: the bar found in the original, its label read (OCR, loaded on demand), a proposal
  // the user accepts (the calibration set) or rejects; asked once for every image
  type BarProposal = { bar: FoundBar; value: number; unit: string; busy: boolean; text?: string; err?: string };
  const [barProp, setBarProp] = useState<BarProposal | 'none' | null>(null);
  const barAsk = !!data.barRead?.on && data.barRead.done !== (data.pixelsId ?? 'image');
  useEffect(() => {
    if (!barAsk || !full || !fullGray) {
      setBarProp(null);
      return;
    }
    const bar = findScaleBar(fullGray, full.w, full.h, full.lo, full.hi);
    if (!bar) {
      setBarProp('none');
      return;
    }
    const yc = (bar.y0 + bar.y1 + 1) / 2;
    setLine([bar.x0, yc, bar.x1 + 1, yc]);
    setSnapped(true);
    setBarProp({ bar, value: NaN, unit, busy: true });
    let live = true;
    import('../image/ocr.ts')
      .then((m) => m.readBarLabel(fullGray, full.w, full.h, full.lo, full.hi, bar))
      .then(
        (text) => {
          if (!live) return;
          const s = parseScale(text);
          setBarProp({ bar, value: s?.value ?? NaN, unit: s?.unit ?? unit, busy: false, text: text.replace(/\s+/g, ' ').trim() });
        },
        (e) => live && setBarProp({ bar, value: NaN, unit, busy: false, err: (e as Error).message }),
      );
    return () => {
      live = false;
    };
  }, [barAsk, full, fullGray]); // eslint-disable-line react-hooks/exhaustive-deps
  const barDone = () => set({ barRead: { ...data.barRead, done: data.pixelsId ?? 'image' } });
  const acceptBar = () => {
    if (!barProp || barProp === 'none' || !(barProp.value > 0)) return;
    const b = barProp.bar;
    const yc = (b.y0 + b.y1 + 1) / 2;
    set({ cal: { size: barProp.value / (b.x1 - b.x0 + 1), unit: barProp.unit, line: [b.x0, yc, b.x1 + 1, yc], length: barProp.value }, barRead: { ...data.barRead, done: data.pixelsId ?? 'image' } });
    setKnown(barProp.value);
    setUnit(barProp.unit);
  };
  const lineLen = line ? Math.hypot(line[2] - line[0], line[3] - line[1]) : 0;
  const applyScale = () => {
    if (!(lineLen > 0) || !(known > 0)) return;
    set({ cal: { size: known / lineLen, unit, line: line!, length: known } });
  };
  // the values under the mouse: what it is compared with (or the original) and the result's
  const readout = (() => {
    if (!hover || !base || !reply) return null;
    const x = Math.floor(hover.p[0]);
    const y = Math.floor(hover.p[1]);
    const cal = data.cal && data.cal.size > 0 ? ` = ${fmt(x * data.cal.size)}, ${fmt(y * data.cal.size)} ${unitText(data.cal.unit)}` : '';
    if (onOriginal && full) {
      const i = y * full.w + x;
      return `x ${x}, y ${y}${cal} · original ${full.ch.map((c) => fmt(c[i])).join(' / ')}`;
    }
    // (the values once the worker has them for this pixel)
    const v = vals && vals.x === x && vals.y === y ? vals : null;
    const o = v ? (before === 'prev' && needBefore ? v.before : v.base) : [];
    return `x ${x}, y ${y}${cal}${v ? ` · ${before === 'prev' && needBefore ? 'before' : 'original'} ${o.map(fmt).join(' / ')} · result ${v.result.map(fmt).join(' / ')}` : ''}${reply.scale < 1 ? ' · preview' : ''}`;
  })();
  // the loupe (Scale, Crop): the original around the mouse, enlarged
  useEffect(() => {
    const c = loupe.current;
    const src = canvasO.current;
    if (!c || !src || !hover || !onOriginal) return;
    const g = c.getContext('2d')!;
    const n = 24; // pixels of the image across
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(src, hover.p[0] - n / 2, hover.p[1] - n / 2, n, n, 0, 0, c.width, c.height);
    g.strokeStyle = '#ffd60a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(c.width / 2, 0);
    g.lineTo(c.width / 2, c.height);
    g.moveTo(0, c.height / 2);
    g.lineTo(c.width, c.height / 2);
    g.stroke();
  }, [hover, onOriginal]);
  // the histogram on the right: of the image shown — a mask: of what came into the threshold that made it, its
  // threshold (or range) marked
  const thr = reply?.kind === 'mask' ? [...steps.slice(0, upToIndex)].reverse().find((s) => s.on && (s.kind === 'threshold' || s.kind === 'localthreshold') && reply.stepHist[s.id]) : undefined;
  const sideHist = thr && reply ? { h: reply.stepHist[thr.id].h[0], lo: reply.stepHist[thr.id].lo, hi: reply.stepHist[thr.id].hi } : reply ? { h: reply.hist, lo: reply.lo, hi: reply.hi } : null;
  const marks: number[] = [];
  if (thr) {
    const m = /: (-?[\d.e+-]+)$/.exec(reply?.notes[thr.id] ?? '');
    if (m) marks.push(Number(m[1]));
    else if (thr.p.method === 'manual') marks.push(Number(thr.p.low), Number(thr.p.high));
  }
  const add = (kind: StepKind) => {
    const s = newStep(kind, `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`);
    // added after the step shown (else at the end), and shown
    const at = upTo && upTo !== '__none' ? steps.findIndex((q) => q.id === upTo) + 1 : steps.length;
    setSteps([...steps.slice(0, at), s, ...steps.slice(at)]);
    setUpTo(null);
  };
  // Lattice ▸ Bragg filter: the spots picked into a Spectrum mask step (kept, or taken out): the one there, else a new
  // one at the end, shown
  const setLattice = (p: Partial<LatticeSpec>) => set({ lattice: { ...data.lattice, ...p } });
  const bragg = (mode: 'keep' | 'remove') => {
    const spots = data.lattice?.spots ?? [];
    const had = steps.find((q) => q.kind === 'fftmask');
    if (had) setSteps(steps.map((q) => (q.id === had.id ? { ...q, on: true, p: { ...q.p, spots, mode } } : q)));
    else {
      const s = newStep('fftmask', `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`);
      setSteps([...steps, { ...s, p: { ...s.p, spots, mode } }]);
    }
    setUpTo(null);
    set({ fft: { ...data.fft, show: undefined }, lattice: data.lattice });
  };
  // Surface ▸ Level: a Level step (a plane) at the start of the steps, shown
  const setSurface = (p: Partial<SurfaceSpec>) => set({ surface: { ...data.surface, ...p } });
  const levelIt = () => {
    const had = steps.find((q) => q.kind === 'level');
    if (had) setSteps(steps.map((q) => (q.id === had.id ? { ...q, on: true } : q)));
    else setSteps([newStep('level', `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`), ...steps]);
    setUpTo(null);
  };
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= steps.length) return;
    const s = [...steps];
    [s[k], s[j]] = [s[j], s[k]];
    setSteps(s);
  };
  const key = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    const picked = rois.find((r) => r.id === sel);
    if (e.key === 'Escape') {
      if (draft) setDraft(null);
      else if (paint) setPaint(null);
      else if (tool !== 'pan') setTool('pan');
      else onClose();
    } else if ((e.key === '[' || e.key === ']') && (tool === 'brush' || tool === 'eraser')) {
      setBrush((b) => Math.min(100, Math.max(1, e.key === ']' ? Math.max(b + 1, Math.round(b * 1.25)) : Math.min(b - 1, Math.round(b / 1.25)))));
    } else if (/^[1-9]$/.test(e.key) && classifier && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // (the classifier's classes: 1, 2, 3 … paints that one; again: stops)
      const c = stepClasses(classifier, rois)[Number(e.key) - 1];
      if (!c) return;
      setPaint(paint === c ? null : c);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && vtab === 'structure' && netSel) {
      const b = branchAt(net, netSel);
      if (b) addEdit('del', midOf(b));
      setNetSel(null);
    } else if (e.key === 'Enter' && draft) finishDraft();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && picked) removeRoi(picked.id);
    else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && picked) duplicate();
    else if (e.key.startsWith('Arrow') && picked) {
      const m = e.shiftKey ? 10 : 1;
      const [dx, dy] = { ArrowLeft: [-m, 0], ArrowRight: [m, 0], ArrowUp: [0, -m], ArrowDown: [0, m] }[e.key] ?? [0, 0];
      setRois(rois.map((r) => (r.id === picked.id ? { ...moveRoi(r, dx, dy), ...(r.auto ? { hand: true } : {}) } : r)));
    } else if (e.key === 'b' || e.key === 'B') setHeld(true);
    else if (e.key === '\\') setCmp(cmp === 'original' ? 'edited' : 'original');
    else if (e.key === 'y' || e.key === 'Y') setCmp(cmp === 'side' ? 'edited' : 'side');
    else if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-') zoomAt(0.8);
    else if (e.key === '0') {
      setZoom(0);
      setPan([0, 0]);
    } else return;
    e.preventDefault();
  };
  useEffect(() => root.current?.focus(), []);
  // the steps offered, by group
  const addOptions = STEP_GROUPS.map((g): [string, [StepKind, StepDef][]] => [g, (Object.entries(STEP_DEFS) as [StepKind, StepDef][]).filter(([, d]) => d.group === g)]);
  const beforeLabel = before === 'prev' ? (upToIndex > 0 ? `before step ${upToIndex}` : 'original') : 'original';
  const W = (shown?.w ?? 0) * k;
  const H = (shown?.h ?? 0) * k;
  const stage = (c: React.RefObject<HTMLCanvasElement | null>, label?: string, extra?: React.ReactNode, style?: React.CSSProperties) => (
    <div className="ie-stage" style={{ transform: `translate(${pan[0]}px, ${pan[1]}px)`, ...style }}>
      <canvas ref={c} style={{ width: W, height: H }} />
      {extra}
      {label && <span className="ie-pane-label">{label}</span>}
    </div>
  );
  const scaleLine = line && (
    <svg className="ie-overlay" width={W} height={H}>
      <line x1={line[0] * k} y1={line[1] * k} x2={line[2] * k} y2={line[3] * k} className="ie-scale-line" />
      {[0, 2].map((j) => (
        <line key={j} x1={line[j] * k} y1={line[j + 1] * k - 6} x2={line[j] * k} y2={line[j + 1] * k + 6} className="ie-scale-line" />
      ))}
    </svg>
  );
  const cropShown = cropDraft ?? crop;
  const cropRect = full && cropShown && (
    <svg className="ie-overlay" width={W} height={H}>
      <path d={`M0,0H${W}V${H}H0Z M${cropShown[0] * k},${cropShown[1] * k}v${cropShown[3] * k}h${cropShown[2] * k}v${-cropShown[3] * k}Z`} className="ie-crop-shade" fillRule="evenodd" />
      <rect x={cropShown[0] * k} y={cropShown[1] * k} width={cropShown[2] * k} height={cropShown[3] * k} className="ie-crop-rect" />
    </svg>
  );
  const roiLayer = !onOriginal && shownRois.length > 0 && <RoiOverlay rois={shownRois} sel={sel} k={k} ox={ox} oy={oy} W={W} H={H} labels={labels} interactive={tool === 'pan'} rings={rings} unsure={genReview ? unsureIds : undefined} whole={review || (checking && genReview)} />;
  // Find like this: around the selection picked, what is compared (a disc; the particle and its edge; the particle and
  // the ground out to the ring, whose handle drags it); the matches left out by hand, faint (a click puts one back)
  const modelPicked = !onOriginal && rois.find((r) => r.id === sel && isArea(r) && !r.train);
  const pickedSpec = modelPicked ? specOf(modelPicked.id) : null;
  const context = pickedSpec?.context ?? 'disc';
  const dragRing = (e: RPointerEvent) => {
    if (!modelPicked) return;
    e.stopPropagation();
    e.preventDefault();
    const outline = roiOutline(modelPicked);
    const move = (m: PointerEvent) => {
      const q = toOrig(imgAt(m));
      const ring = Math.max(1, Math.round(offsetDistance(outline, q)));
      // (a model of the list: its own ring; else that of all)
      if (modelList.some((m) => m.roi === modelPicked.id)) setModels(modelList.map((m) => (m.roi === modelPicked.id ? { ...m, ring } : m)));
      else setMatch({ ring });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const contextLayer = (() => {
    if (!modelPicked) return null;
    const P = (pts: Pt[]) => pts.map(([x, y]) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`).join(' ');
    if (context === 'disc') {
      const [cx, cy] = roiCentre(modelPicked);
      return (
        <svg className="ie-overlay ie-context" width={W} height={H}>
          <circle cx={(cx - ox) * k} cy={(cy - oy) * k} r={modelRadius(modelPicked) * k} />
        </svg>
      );
    }
    if (context === 'drawn' && pickedSpec) {
      const pts = outerOf(modelPicked, pickedSpec);
      // a point dragged (i: its place; list: the points with it, a new one put in between too)
      const dragOuter = (e: RPointerEvent, i: number, list: Pt[]) => {
        e.stopPropagation();
        e.preventDefault();
        const move = (m: PointerEvent) => setOuter(modelPicked, list.map((q, j) => (j === i ? toOrig(imgAt(m)) : q)));
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
      return (
        <svg className="ie-overlay ie-context" width={W} height={H}>
          <polygon points={P(pts)} />
          {editMargin &&
            pts.map((q, i) => {
              const n = pts[(i + 1) % pts.length];
              const mid: Pt = [(q[0] + n[0]) / 2, (q[1] + n[1]) / 2];
              return (
                <circle key={`m${i}`} className="ie-context-handle mid" cx={(mid[0] - ox) * k} cy={(mid[1] - oy) * k} r={3.5} onPointerDown={(e) => dragOuter(e, i + 1, [...pts.slice(0, i + 1), mid, ...pts.slice(i + 1)])}>
                  <title>Drag: a new point of the margin</title>
                </circle>
              );
            })}
          {editMargin &&
            pts.map((q, i) => (
              <circle key={`p${i}`} className="ie-context-handle" cx={(q[0] - ox) * k} cy={(q[1] - oy) * k} r={5} onPointerDown={(e) => dragOuter(e, i, pts)} onDoubleClick={(e) => (e.stopPropagation(), pts.length > 3 && setOuter(modelPicked, pts.filter((_, j) => j !== i)))}>
                <title>Drag: the margin compared around the particle; double-click: this point taken off</title>
              </circle>
            ))}
        </svg>
      );
    }
    const d = context === 'alone' ? Math.max(EDGE_BAND, pickedSpec?.ring ?? 6) : EDGE_BAND;
    const off = offsetOutline(roiOutline(modelPicked), d);
    const top = off.reduce((a, b) => (b[1] < a[1] ? b : a), off[0]);
    return (
      <svg className="ie-overlay ie-context" width={W} height={H}>
        <polygon points={P(off)} />
        {context === 'alone' && <circle className="ie-context-handle" cx={(top[0] - ox) * k} cy={(top[1] - oy) * k} r={5} onPointerDown={dragRing}><title>Drag: how much of the ground around the particle is compared ({d} px)</title></circle>}
      </svg>
    );
  })();
  // the margin of the model picked: its outline widened by px, thinned to points that can be dragged
  const marginFromOutline = (px: number) => {
    if (!modelPicked) return;
    const off = offsetOutline(roiOutline(modelPicked), Math.max(0.5, px));
    const every = Math.max(1, Math.ceil(off.length / 24));
    setOuter(modelPicked, off.filter((_, i) => i % every === 0));
  };
  // every model of the list given the compared area of the one picked
  const pickedListed = modelPicked ? modelList.find((m) => m.roi === modelPicked.id) : undefined;
  const sameMarginForAll = pickedListed && modelList.length > 1 ? () => setModels(modelList.map((m) => ({ ...m, context: pickedListed.context, ring: pickedListed.ring, outer: pickedListed.outer }))) : undefined;
  // the area compared around every particle found: its model's, turned, scaled and placed as the particle was found
  const areaLayer = (() => {
    const lm = lastMatch.current;
    if (!data.match?.showArea || !lm || onOriginal) return null;
    const regions = lm.ms.map((t, j) => {
      const sp = lm.specs[j] ?? specOf(t.id);
      const ctx = sp.context ?? 'disc';
      const [cx, cy] = roiCentre(t);
      const R = modelRadius(t);
      const pts: Pt[] =
        ctx === 'disc' ? Array.from({ length: 48 }, (_, a): Pt => [cx + R * Math.cos((a * Math.PI) / 24), cy + R * Math.sin((a * Math.PI) / 24)])
        : ctx === 'drawn' ? outerOf(t, sp)
        : offsetOutline(roiOutline(t), ctx === 'alone' ? Math.max(EDGE_BAND, sp.ring ?? 6) : (matchOpts.edge ?? TUNING.edge));
      return { pts, cx, cy };
    });
    const at = (pts: Pt[]) => pts.map(([x, y]) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`).join(' ');
    return (
      <svg className="ie-overlay ie-context ie-areas" width={W} height={H}>
        {rois
          .filter((r) => r.auto && r.id.startsWith(`m${lm.seq}-`))
          .map((r) => {
            const q = lm.list[Number(r.id.split('-')[1])];
            const g = q && regions[q.model];
            return g ? <polygon key={r.id} points={at(placeLike(g.pts, g.cx, g.cy, q.angle, q.scale, (q.x0 ?? q.x) + ox, (q.y0 ?? q.y) + oy))} /> : null;
          })}
      </svg>
    );
  })();
  const badNow = matchOpts.learn && lastMatch.current ? lastMatch.current.list.flatMap((q, i) => (labelAt(q, examples)?.good === false ? [i] : [])) : rejected;
  const goodNow = matchOpts.learn && lastMatch.current ? lastMatch.current.list.flatMap((q, i) => (labelAt(q, examples)?.good ? [i] : [])) : [];
  // (learning: those the classifier left out as less probable, not said yet: shown faint while reviewing, to be said good)
  const droppedNow = matchOpts.learn && learnt && lastMatch.current ? lastMatch.current.list.flatMap((q, i) => (q.f && learnt.predict(q.f) < pmin && !labelAt(q, examples) ? [i] : [])) : [];
  const P = (pts: Pt[]) => pts.map(([x, y]) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`).join(' ');
  const unsureIdx = unsureOf();
  const labelsLayer =
    !onOriginal && lastMatch.current && (goodNow.length > 0 || unsureIdx.length > 0) ? (
      <svg className="ie-overlay ie-labels" width={W} height={H}>
        {goodNow.map((i) => {
          const lm = lastMatch.current!;
          const q = lm.list[i];
          return q ? (
            <text key={`g${i}`} className="good" x={(q.x + ox - ox) * k} y={(q.y + oy - oy) * k} textAnchor="middle" dominantBaseline="central">
              ✓
            </text>
          ) : null;
        })}
        {unsureIdx.map((i) => {
          const lm = lastMatch.current!;
          const q = lm.list[i];
          return q ? (
            <polygon key={`u${i}`} className="unsure" points={P(roiOutline(matchRoi(q, i, lm.seq, lm.ms)))}>
              <title>The classifier is unsure of this one: click it while reviewing</title>
            </polygon>
          ) : null;
        })}
      </svg>
    ) : null;
  const rejectedLayer = !onOriginal && review && lastMatch.current && badNow.length + droppedNow.length > 0 && (
    <svg className="ie-overlay ie-rejected" width={W} height={H}>
      {badNow.map((i) => {
        const lm = lastMatch.current!;
        const q = lm.list[i];
        if (!q) return null;
        const pts = roiOutline(matchRoi(q, i, lm.seq, lm.ms));
        return <polygon key={i} data-rejected={i} points={P(pts)}><title>{matchOpts.learn ? 'Said not good: click to say it is good' : 'Left out: click to put it back'}</title></polygon>;
      })}
      {droppedNow.map((i) => {
        const lm = lastMatch.current!;
        const q = lm.list[i];
        if (!q) return null;
        return <polygon key={`d${i}`} className="dropped" data-rejected={i} points={P(roiOutline(matchRoi(q, i, lm.seq, lm.ms)))}><title>Left out as less probable: click to say it is good</title></polygon>;
      })}
    </svg>
  );
  // (Structure: the network over the image, instead of the selections; the grain size's lines, the orientation)
  const texView = nodeRes?.view.texture;
  const layers =
    vtab === 'structure' ? (
      <>
        {texView && !onOriginal && nodeRes && <TextureOverlay view={texView} spec={data.texture ?? {}} k={k} ox={ox} oy={oy} W={W} H={H} w={nodeRes.view.image?.w ?? 0} h={nodeRes.view.image?.h ?? 0} />}
        {net && !onOriginal && data.network?.on && <NetworkOverlay net={net} spec={data.network} k={k} ox={ox} oy={oy} W={W} H={H} tool={netTool} sel={netSel} eraseR={eraseR} onSelect={setNetSel} onEdit={addEdit} />}
      </>
    ) : (
      <>
        {vtab === 'lattice' && nodeRes?.view.lattice?.centre && nodeRes.view.lattice.rings && !onOriginal && <RingsOverlay centre={nodeRes.view.lattice.centre} rings={nodeRes.view.lattice.rings} labels={nodeRes.view.lattice.labels ?? []} k={k} ox={ox} oy={oy} W={W} H={H} />}
        {vtab === 'objects' && data.arrange?.on && (data.arrange.show ?? 'nearest') !== 'off' && nodeRes?.view.arrange && !onOriginal && <ArrangeOverlay res={nodeRes.view.arrange} spec={data.arrange} k={k} W={W} H={H} />}
        {classifier && !onOriginal && <canvas ref={paintRef} className="ie-overlay ie-paint" style={{ width: W, height: H }} />}
        {roiLayer}
        {areaLayer}
        {contextLayer}
        {rejectedLayer}
        {labelsLayer}
      </>
    );
  const cmpButton = (m: Cmp, label: string, title: string) => (
    <button className={`nodrag${cmp === m ? ' on' : ''}`} disabled={onOriginal} title={title} onClick={() => setCmp(m)}>
      {label}
    </button>
  );

  // ---- the pieces of the panels: shown as the tabs of before (All tools), or in the steps of a task ----
  const stepCard = (s: ImgStep, k: number) => {
            const d = STEP_DEFS[s.kind];
            const isShown = upTo && upTo !== '__none' ? s.id === upTo : upTo !== '__none' && k === steps.length - 1;
            const err = reply?.errors[s.id];
            const note = reply?.notes[s.id];
            return (
              <div key={s.id} className={`ie-step${isShown ? ' shown' : ''}${s.on ? '' : ' off'}${k >= upToIndex && upToIndex < steps.length ? ' after' : ''}`}>
                <div className="row ie-step-head">
                  <input className="nodrag" type="checkbox" checked={s.on} title="On (off: passed over)" onChange={(e) => setStep(s.id, { on: e.target.checked })} />
                  <button className="nodrag ie-step-name grow" title={`${d?.title ?? ''} (click: show the image up to this step)`} onClick={() => setUpTo(upTo === s.id ? null : s.id)}>
                    {k + 1}. {d?.label ?? s.kind}
                  </button>
                  <button className="nodrag ts-btn" title="Up" disabled={k === 0} onClick={() => move(k, -1)}>
                    <ArrowUp {...IC} />
                  </button>
                  <button className="nodrag ts-btn" title="Down" disabled={k === steps.length - 1} onClick={() => move(k, 1)}>
                    <ArrowDown {...IC} />
                  </button>
                  <button className="nodrag ts-btn" title="Remove this step" onClick={() => (setSteps(steps.filter((q) => q.id !== s.id)), upTo === s.id && setUpTo(null))}>
                    <X {...IC} />
                  </button>
                </div>
                {s.kind === 'curves' ? (
                  <CurvesEditor p={s.p} rgb={(base?.ch.length ?? 1) === 3} hist={reply?.stepHist[s.id]} set={(key, v) => setStep(s.id, { p: { ...s.p, [key]: v } })} />
                ) : s.kind === 'classify' ? (
                  <ClassifierEditor s={s} set={(patch) => setStep(s.id, { p: { ...s.p, ...(patch as ImgStep['p']) } })} rois={rois} sel={sel} setRois={setRois} note={reply?.notes[s.id]} hist={reply?.stepHist[s.id]} paint={paint} setPaint={setPaint} tool={paintTool} setTool={setPaintTool} brush={brush} setBrush={setBrush} painted={painted} clearPaint={clearPaint} live={liveTrain} setLive={(on) => (setLiveTrain(on), on && updateTrain())} pending={trainPending} updateNow={updateTrain} />
                ) : s.kind === 'threshold' ? (
                  <ThresholdEditor p={s.p} hist={reply?.stepHist[s.id]} note={reply?.notes[s.id]} set={(patch) => setStep(s.id, { p: { ...s.p, ...(patch as ImgStep['p']) } })} />
                ) : (
                  d &&
                  d.params.length > 0 && (
                    <div className="ie-params">
                      {d.params.map((q) => (
                        <ParamField key={q.key} q={q} value={s.p[q.key]} hist={reply?.stepHist[s.id]} set={(v) => setStep(s.id, { p: { ...s.p, [q.key]: v as never } })} />
                      ))}
                    </div>
                  )
                )}
                {note && s.kind !== 'threshold' && s.kind !== 'classify' && <div className="hint">{note}</div>}
                {err && <div className="hint ie-err">{err}</div>}
              </div>
            );
  };
  const chain = (
    <>
          <button className={`nodrag ie-step-head ie-original${upToIndex === 0 ? ' shown' : ''}`} title="Show the original image (the part analysed)" onClick={() => setUpTo(upTo === '__none' ? null : '__none')}>
            Original image
          </button>
          <div className="row">
            <select
              className="nodrag grow"
              value=""
              title="Add a step: an adjustment of the image, or one that finds the objects (a threshold, the trainable classifier); after the one shown, else at the end"
              onChange={(e) => {
                if (e.target.value) add(e.target.value as StepKind);
                e.target.value = '';
              }}
            >
              <option value="">+ Add a step…</option>
              {addOptions.map(([g, items]) => (
                <optgroup key={g} label={STEP_GROUP_LABELS[g as keyof typeof STEP_GROUP_LABELS] ?? g}>
                  {items.map(([kind, d]) => (
                    <option key={kind} value={kind} title={d.title}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {steps.map((s, k) => stepCard(s, k))}
          {!steps.length && <div className="hint">Add a step: prepare the image (tone and colour, noise, background, edges, texture), then a threshold or a trainable classifier (a mask) and its morphology. Each works on what the steps above give.</div>}
    </>
  );
  const histView = (
    <>
          <div className="ie-section">Histogram{thr ? ' (into the threshold)' : upToIndex < steps.length ? ` (up to step ${upToIndex})` : ''}</div>
          <Histogram hist={sideHist?.h ?? null} lo={sideHist?.lo ?? 0} hi={sideHist?.hi ?? 1} marks={marks} />
          <div className="ie-section">View</div>
          <div className="row wrap">
            <Select<Lut> value={lut} options={LUTS} title="The colour table of a gray image (the view; the figure has its own in the options)" onChange={setLut} />
            {reply?.kind === 'mask' && <Check label="mask over the image" title="A mask shown in a colour over the original, else white on black" value={overlay} onChange={setOverlay} />}
          </div>
          <div className="row wrap">
            <Select<'image' | 'spectrum'>
              value={fft.show ? 'spectrum' : 'image'}
              title="What is shown: the image, or its spectrum (its 2D Fourier transform: the zero frequency in the middle, a periodic pattern a spot at 1 / its period from it)"
              options={[
                ['image', 'the image'],
                ['spectrum', 'its FFT spectrum'],
              ]}
              onChange={(v) => set({ fft: { ...data.fft, show: v === 'spectrum' || undefined } })}
            />
            {fft.show && (
              <>
                <Check label="log" title="The magnitude on a log scale (the weak spots seen beside the strong ones), else linear" value={fft.log ?? true} onChange={(log) => set({ fft: { ...data.fft, log: log ? undefined : false } })} />
                <Check label="Hann window" title="The image's edges faded first: no cross through the middle from them" value={fft.hann ?? true} onChange={(hann) => set({ fft: { ...data.fft, hann: hann ? undefined : false } })} />
                <Select<'result' | 'original'>
                  value={fft.of ?? 'result'}
                  title="The spectrum of the result of the steps, or of the original"
                  options={[
                    ['result', 'of the result'],
                    ['original', 'of the original'],
                  ]}
                  onChange={(of) => set({ fft: { ...data.fft, of: of === 'result' ? undefined : of } })}
                />
              </>
            )}
          </div>
          <Check label="radial spectrum in the workbook" title="The spectrum's power averaged in rings, against the spatial frequency k and the distance d = 1/k (a sheet Radial spectrum), with the distance of its strongest peak: the period the image repeats most" value={!!fft.radial} onChange={(radial) => set({ fft: { ...data.fft, radial: radial || undefined } })} />
    </>
  );
  const cropBlock = (
    <>
          <div className="ie-section">Crop</div>
          <div className="hint">{crop ? `The part analysed: x ${crop[0]}, y ${crop[1]}, ${crop[2]} × ${crop[3]} px of ${full?.w} × ${full?.h}.` : 'The whole image is analysed.'}</div>
          <div className="row wrap">
            {barRows > 0 && full && (
              <button className="nodrag" title={`A data bar found under the image (${barRows} rows of the microscope's settings): cut off`} onClick={() => set({ crop: [0, 0, full.w, full.h - barRows] })}>
                Cut the data bar ({barRows} px)
              </button>
            )}
            <button className={`nodrag${tool === 'crop' ? ' on' : ''}`} title="Drag the part to analyse on the original" onClick={() => setTool(tool === 'crop' ? 'pan' : 'crop')}>
              Draw
            </button>
            {crop && (
              <button className="nodrag" title="The whole image analysed" onClick={() => set({ crop: undefined })}>
                No crop
              </button>
            )}
          </div>
    </>
  );
  const calBlock = (
    <>
          <div className="ie-section">Calibration</div>
          <div className="hint">{data.cal && data.cal.size > 0 ? `1 px = ${fmt(data.cal.size)} ${unitText(data.cal.unit)} (${fmt(1 / data.cal.size)} px per ${unitText(data.cal.unit)})` : 'Not calibrated: the results in pixels.'}</div>
          <div className="hint">On the scale bar: Scale, draw a line along it (a loupe follows the mouse; its ends found on the bar), give its length.</div>
          <div className="row wrap">
            <span className="muted">{lineLen > 0 ? `line ${fmt(lineLen)} px${snapped === true ? ' (on the bar)' : snapped === false ? ' (as drawn)' : ''} =` : 'no line yet'}</span>
            <NumInput className="short" min={0} value={known} placeholder="length" onChange={setKnown} />
            <Select<string> value={unit} options={UNITS} onChange={setUnit} />
            <button className="nodrag btn-run" disabled={!(lineLen > 0) || !(known > 0)} title="The size of a pixel from the line" onClick={applyScale}>
              Set
            </button>
          </div>
          <Check label="Find the bar's ends" title="When the line is let go, its ends moved to the ends of the bar under it (its pixels like those under its middle); else the line as drawn" value={snap} onChange={setSnap} />
          <Check label="Read the scale bar" title="The scale bar found in the image and its label read (OCR: its engine downloaded once, about 5 MB; the image stays here), as a proposal: nothing changes until you accept it" value={!!data.barRead?.on} onChange={(on) => set({ barRead: on ? { on: true } : undefined })} />
          {data.barRead?.on && !barAsk && (
            <div className="row wrap">
              <span className="hint grow">The scale bar of this image: answered.</span>
              <button className="nodrag" onClick={() => set({ barRead: { on: true } })}>
                Read again
              </button>
            </div>
          )}
          {barAsk && barProp === 'none' && <div className="hint">No scale bar found: draw a line on it (Scale).</div>}
          {barAsk && barProp && barProp !== 'none' && (
            <div className="ie-bar-proposal">
              <div className="hint">
                A {barProp.bar.bright ? 'white' : 'black'} bar of <b>{barProp.bar.x1 - barProp.bar.x0 + 1} px</b> at x {barProp.bar.x0}, y {barProp.bar.y0}
                {barProp.busy ? ': reading its label …' : barProp.text ? `, its label read: “${barProp.text.slice(0, 60)}”` : ': no label read, give its length'}
                {barProp.err ? ` (the reader could not start: ${barProp.err})` : ''}
              </div>
              <div className="row wrap">
                <span className="muted">{barProp.bar.x1 - barProp.bar.x0 + 1} px =</span>
                <NumInput className="short" min={0} value={barProp.value} placeholder="length" onChange={(value) => setBarProp({ ...barProp, value })} />
                <Select<string> value={barProp.unit} options={UNITS.some(([u]) => u === barProp.unit) ? UNITS : [...UNITS, [barProp.unit, barProp.unit]]} onChange={(u) => setBarProp({ ...barProp, unit: u })} />
              </div>
              {barProp.value > 0 && (
                <div className="hint">
                  1 px = {fmt(barProp.value / (barProp.bar.x1 - barProp.bar.x0 + 1))} {barProp.unit}
                </div>
              )}
              <div className="row wrap">
                <button className="nodrag btn-run" disabled={!(barProp.value > 0)} title="The calibration set from the bar and its length" onClick={acceptBar}>
                  Accept
                </button>
                <button className="nodrag" title="Nothing changed" onClick={barDone}>
                  Reject
                </button>
                <button className="nodrag" title="The original shown with the bar's line (the Scale tool)" onClick={() => setTool('scale')}>
                  Show it
                </button>
              </div>
            </div>
          )}
          {data.cal && data.cal.size > 0 && base && (() => {
            // the scale bar the figure gets (the node's Figure settings: shown, its length)
            const f = imageFigure(data.figure);
            const len = f.bar.length > 0 ? f.bar.length : autoBarLength(base.w, data.cal);
            return (
              <div className="row wrap">
                <span className="hint grow">{f.bar.show ? `On the figure: a scale bar of ${+len.toPrecision(6)} ${unitText(data.cal.unit)}${f.bar.length > 0 ? '' : ' (its length: the bar calibrated on, or a round one)'}.` : 'On the figure: no scale bar.'}</span>
                <button className="nodrag" title="The scale bar drawn on the figure of the node, or not (its length, place and look: the node's Figure settings)" onClick={() => set({ figure: { ...data.figure, bar: { ...f.bar, show: !f.bar.show } } })}>
                  {f.bar.show ? 'Hide it' : 'Show it'}
                </button>
              </div>
            );
          })()}
          <div className="hint">Or the size of a pixel, known:</div>
          <div className="row wrap">
            <span className="muted">1 px =</span>
            <NumInput className="short" min={0} step={0.001} value={data.cal?.size ?? NaN} placeholder="none" onChange={(size) => set({ cal: size > 0 ? { unit: data.cal?.unit ?? unit, ...data.cal, size, line: undefined, length: undefined } : undefined })} />
            <Select<string> value={unitText(data.cal?.unit ?? unit)} options={UNITS} onChange={(u) => (setUnit(u), data.cal && set({ cal: { ...data.cal, unit: u } }))} />
            {data.cal && (
              <button className="nodrag" title="No calibration: the results in pixels" onClick={() => (set({ cal: undefined }), setLine(null))}>
                Remove
              </button>
            )}
          </div>
    </>
  );
  const keysBlock = (
    <>
          <div className="ie-section">Keys</div>
          <div className="hint">Wheel: zoom · drag: move · \ original / edited · Y side by side · B: the original while held · + − 0: zoom, fit · Esc: the drawing, then the tool off, then close · a selection picked: Delete removes it, Ctrl+D copies it, the arrows move it (Shift: by 10)</div>
    </>
  );
  const roiPanel = (bare: boolean) => (
          <RoiPanel
            bare={bare}
            rois={rois}
            sel={sel}
            setSel={setSel}
            setRois={setRois}
            tool={tool}
            group={group}
            setGroup={setGroup}
            labels={labels}
            setLabels={setLabels}
            rings={rings}
            setRings={setRings}
            wandTol={wandTol}
            setWandTol={setWandTol}
            raysOf={raysOf}
            setRaysOf={setRaysOf}
            centre={centre}
            setCentre={setCentre}
            duplicate={duplicate}
            clearAll={() => void ask(`Remove all ${rois.length} selections?`, { ok: 'Remove' }).then((y) => y && (setRois([]), setSel(null)))}
          />
  );
  const particlesPanel = (part?: 'mask' | 'like' | 'check' | 'refine' | 'layers' | 'accuracy') => (
          <ParticlesPanel
            part={part}
            marginFromOutline={marginFromOutline}
            sameMarginForAll={sameMarginForAll}
            showArea={!!data.match?.showArea}
            setShowArea={(on) => setMatch({ showArea: on || undefined })}
            samPick={task === 'particles' || task === 'all' ? { on: tool === 'sammodel', toggle: () => setTool(tool === 'sammodel' ? 'pan' : 'sammodel'), grow: samGrow, setGrow: (grow) => setMatch({ grow: grow === 6 ? undefined : grow }) } : undefined}
            opts={partOpts}
            set={setPart}
            group={partGroup}
            setGroup={(g) => setPart({ group: g || 'particles' })}
            k={data.cal && data.cal.size > 0 ? data.cal.size : 1}
            u={data.cal && data.cal.size > 0 ? unitText(data.cal.unit) : 'px'}
            find={findParticles}
            msg={partMsg}
            count={rois.filter((r) => r.auto).length}
            byShape={groupByShape}
            likeExamples={groupLike}
            match={matchOpts}
            setMatch={setMatch}
            canMatch={rois.some((r) => r.id === sel && isArea(r) && !r.train)}
            models={(() => {
              const t = rois.find((r) => r.id === sel && isArea(r) && !r.train);
              return t ? modelsOf(t).length : 0;
            })()}
            findLike={findLikePicked}
            setMin={setMatchMin}
            modelList={modelList.map((m) => ({ ...specOf(m.roi), name: rois.find((r) => r.id === m.roi)?.name ?? '?' }))}
            canAdd={!!rois.find((r) => r.id === sel && isArea(r) && !r.train && !modelList.some((m) => m.roi === r.id))}
            addModel={addModel}
            setModel={(k, p) => setModels(modelList.map((m, j) => (j === k ? { ...m, ...p } : m)))}
            removeModel={(k) => setModels(modelList.filter((_, j) => j !== k))}
            pickModel={(k) => setSel(modelList[k]?.roi ?? sel)}
            modelColors={MODEL_COLORS}
            review={review}
            setReview={setReview}
            canMore={!!lastMatch.current && rois.some((r) => r.auto)}
            findMore={findMore}
            pickedContext={pickedSpec?.context}
            editMargin={editMargin}
            setEditMargin={setEditMargin}
            resetMargin={() => modelPicked && setOuter(modelPicked, undefined)}
            scores={lastMatch.current?.list.map((q) => q.score) ?? []}
            fit={matchOpts.fit}
            inside={matchOpts.inside}
            setInside={(on) => setMatch({ inside: on || undefined })}
            negCount={(data.match?.rejected?.length ?? 0) + (matchOpts.useRejected ? rejected.length : 0)}
            clearRejected={() => setMatch({ rejected: undefined })}
            useRejected={matchOpts.useRejected}
            setUseRejected={(on) => setMatch({ useRejected: on || undefined })}
            preset={matchPreset}
            setPreset={(name) => setMatch(name === 'balanced' ? { step: MATCH_DEFAULTS.step, tried: undefined, coarse: undefined, candidates: undefined } : MATCH_PRESETS[name])}
            changed={advancedChanged}
            resetAdvanced={() => setMatch({ compare: undefined, step: MATCH_DEFAULTS.step, tried: undefined, coarse: undefined, candidates: undefined, edge: undefined, max: MATCH_DEFAULTS.max, brightness: undefined, image: undefined })}
            steps={steps.map((st, j): [string, string] => [st.id, `after ${j + 1}. ${STEP_DEFS[st.kind]?.label ?? st.kind}`])}
            image={matchOpts.image}
            setImage={(image) => setMatch({ image })}
            learnOn={!!matchOpts.learn}
            setLearn={(on) => setMatch({ learn: on || undefined })}
            method={matchOpts.method ?? 'auto'}
            setMethod={(method) => setMatch({ method: method === 'auto' ? undefined : method })}
            goodCount={examples.filter((e) => e.good).length}
            badCount={examples.filter((e) => !e.good).length}
            learnt={learnt}
            probs={learnt && lastMatch.current ? lastMatch.current.list.map((q) => (q.f ? learnt.predict(q.f) : 0)) : null}
            pmin={pmin}
            setPmin={(v) => setMatch({ pmin: v === 0.5 ? undefined : v })}
            unsure={unsure}
            setUnsure={setUnsure}
            clearExamples={() => setMatch({ examples: undefined })}
            truth={truthGroup}
            setTruth={(g) => setMatch({ truth: g === 'truth' ? undefined : g })}
            groups={[...new Set(rois.filter((r) => !r.auto && r.group).map((r) => r.group!))]}
            check={checkAccuracy}
            acc={acc}
            refine={refineParticles}
            shapes={data.particles?.shapes ?? REGULAR_SHAPES}
            setShapes={(shapes) => setPart({ shapes: shapes.length === REGULAR_SHAPES.length ? undefined : shapes })}
            snap={data.particles?.snap ?? true}
            setSnap={(snap) => setPart({ snap: snap ? undefined : false })}
            handCount={rois.filter((r) => r.auto && r.hand).length}
            layers={!!data.particles?.layers}
            setLayers={(on) => {
              setPart({ layers: on || undefined });
              if (on) layersFor(rois.filter((r) => r.auto));
            }}
          />
  );
  const arrangePanel = (
          <ArrangePanel
            spec={data.arrange ?? {}}
            set={(a) => set({ arrange: { ...data.arrange, ...a } })}
            res={nodeRes?.view.arrange}
            error={data.arrange?.on ? nodeRes?.warnings.find((w) => w.startsWith('Arrangement:')) : undefined}
            groups={[...new Set(rois.filter((r) => isArea(r) && !r.train && r.role !== 'background').map((r) => r.group ?? '').filter(Boolean))]}
            k={calK}
            u={calU}
          />
  );
  const networkPanel = (
            <NetworkPanel
              net={net}
              error={netError}
              spec={data.network ?? {}}
              set={setNet}
              k={calK}
              u={calU}
              tool={netTool}
              setTool={setNetTool}
              sel={netSel}
              setSel={setNetSel}
              eraseR={eraseR}
              setEraseR={setEraseR}
              onEdit={addEdit}
              toggle={toggleEdit}
              undo={undoEdit}
            />
  );
  const texturePanel = <TexturePanel spec={data.texture ?? {}} set={(p: Partial<TextureSpec>) => set({ texture: { ...data.texture, ...p } })} view={nodeRes?.view.texture} u={calU} />;
  const latticePanel = (part?: 'spots' | 'fringes' | 'rings') => (
            <LatticePanel
              part={part}
              spec={data.lattice ?? {}}
              set={setLattice}
              k={calK}
              u={calU}
              showing={!!fft.show}
              showSpectrum={(on) => set({ fft: { ...data.fft, show: on || undefined } })}
              bragg={bragg}
              fringes={nodeRes?.view.lattice?.fringes}
              ringRows={nodeRes?.view.lattice?.ringRows}
              centre={nodeRes?.view.lattice?.centre}
            />
  );
  const surfacePanel = (part?: 'heights' | 'areal' | 'profile' | 'step') => (
            <SurfacePanel
              part={part}
              spec={data.surface ?? {}}
              set={setSurface}
              u={calU}
              areas={rois.filter((r) => isArea(r) && !r.hidden && !r.train).map((r) => ({ id: r.id, name: r.name }))}
              view={nodeRes?.view.surface}
              levelled={steps.some((q) => q.kind === 'level' && q.on)}
              level={levelIt}
            />
  );
  const measureOf = (part?: 'measure' | 'spots') => <MeasurePanel spec={spec} set={setSpec} steps={steps} rgb={(base?.ch.length ?? 1) === 3} rois={rois} book={book} sheet={sheet} setSheet={setSheet} pick={(name) => setSel(rois.find((r) => r.name === name)?.id ?? sel)} part={part} />;
  const measurePanel = measureOf();
  // the selection tools shown: all of them (All tools, More), else those of the task
  const shownTools = task === 'all' || moreTools ? ROI_TOOLS : ROI_TOOLS.filter(([t]) => TASKS[task].tools.includes(t) || tool === t);
  // ---- a task: its steps, the one open ----
  const autoCount = rois.filter((r) => r.auto && !r.out).length;
  const outCount = rois.filter((r) => r.auto && r.out).length;
  const pickFind = (m: FindMethod) =>
    set({ find: m, ...(m === 'rays' ? { particles: { ...data.particles, method: 'rays' as const } } : m !== 'like' && data.particles?.method === 'rays' ? { particles: { ...data.particles, method: undefined } } : {}) });
  // (a mask made cleaner: a step of Morphology added at the end)
  const MORPH = (Object.entries(STEP_DEFS) as [StepKind, StepDef][]).filter(([, d]) => d.group === 'Morphology');
  const cleanMask = (
    <div className="row">
      <select
        className="nodrag grow"
        value=""
        title="A step after the mask: holes filled, small bits taken off, touching ones cut apart (Morphology; at the end of the image steps)"
        onChange={(e) => {
          if (e.target.value) setSteps([...steps, newStep(e.target.value as StepKind, `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`)]);
          e.target.value = '';
        }}
      >
        <option value="">+ Clean the mask…</option>
        {MORPH.map(([kind, d]) => (
          <option key={kind} value={kind} title={d.title}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
  // the mask of a threshold or of the classifier: its step (as in the list of Prepare), or one added
  const thresholdCard = thrStep ? (
    <>
      {stepCard(thrStep, steps.indexOf(thrStep))}
      <div className="hint">A step of the image steps (Prepare): what comes before it is what it thresholds.</div>
    </>
  ) : (
    <div className="row wrap">
      <button className="nodrag" title="A Threshold step at the end of the image steps: one value for the whole image (Otsu, or another method)" onClick={() => add('threshold')}>
        + Add a threshold
      </button>
      <button className="nodrag" title="A Local threshold step: a value for every place, from the pixels around it (an uneven ground)" onClick={() => add('localthreshold')}>
        + Local threshold
      </button>
    </div>
  );
  const classifierCard = clsStep ? (
    <>
      <ClassifierEditor s={clsStep} set={(patch) => setStep(clsStep.id, { p: { ...clsStep.p, ...(patch as ImgStep['p']) } })} rois={rois} sel={sel} setRois={setRois} note={reply?.notes[clsStep.id]} hist={reply?.stepHist[clsStep.id]} paint={paint} setPaint={setPaint} tool={paintTool} setTool={setPaintTool} brush={brush} setBrush={setBrush} painted={painted} clearPaint={clearPaint} live={liveTrain} setLive={(on) => (setLiveTrain(on), on && updateTrain())} pending={trainPending} updateNow={updateTrain} />
      <label className="row">
        <input className="nodrag" type="checkbox" checked={clsStep.on} onChange={(e) => setStep(clsStep.id, { on: e.target.checked })} />
        <span>on (a step of the image steps, in Prepare)</span>
      </label>
    </>
  ) : (
    <>
      <div className="hint">A classifier of the pixels (as ImageJ’s Trainable Weka Segmentation): draw examples of the particles, the ground and their edges; it makes the mask the particles are found in.</div>
      <div className="row">
        <button className="nodrag" title="Add the trainable classifier as a step (at the end of the image steps)" onClick={() => add('classify')}>
          + Add a pixel classifier
        </button>
      </div>
    </>
  );
  const samModel = SAM_MODELS[samSpec.model];
  const samCard = (
    <>
      <div className="ie-params">
        <span className="ie-label">Model</span>
        <Select<SamModel> value={samSpec.model} title={`${SAM_MODELS.em.label}: ${SAM_MODELS.em.title}. ${SAM_MODELS.general.label}: ${SAM_MODELS.general.title}`} options={(['general', 'em'] as SamModel[]).map((m): [SamModel, string] => [m, SAM_MODELS[m].label])} onChange={(model) => setSam({ model: model === 'general' ? undefined : model })} />
        <span className="ie-label">Prompt</span>
        <Select<'click' | 'box' | 'all'>
          seg
          value={samSpec.prompt}
          title="How the model is asked: a click on a particle, a box around one, or every particle at once (a grid of points)"
          options={[
            ['click', 'Click'],
            ['box', 'Box'],
            ['all', 'Everything'],
          ]}
          onChange={(prompt) => {
            setSam({ prompt: prompt === 'click' ? undefined : prompt });
            setTool(prompt === 'click' ? 'sam' : prompt === 'box' ? 'sambox' : 'pan');
          }}
        />
      </div>
      <div className="hint">
        {samCached[samSpec.model] ? `Kept in this browser${samEngine ? `; runs ${samEngine}` : ''}.` : `Not downloaded yet: about ${Math.round((samModel.bytes + SAM_ENGINE.bytes) / 1048576)} MB, once, asked first. The image never leaves this computer.`}
      </div>
      {samSpec.prompt === 'click' && (
        <div className="row wrap">
          <button className={`nodrag${tool === 'sam' ? ' on' : ''}`} title="The Point (SAM) tool: click a particle" onClick={() => setTool(tool === 'sam' ? 'pan' : 'sam')}>
            <MousePointerClick {...IC} /> Point (SAM)
          </button>
          <span className="hint">Click a particle: its outline. Shift-click adds a part to it, Alt-click takes one off.</span>
        </div>
      )}
      {samSpec.prompt === 'box' && (
        <div className="row wrap">
          <button className={`nodrag${tool === 'sambox' ? ' on' : ''}`} title="The Box (SAM) tool: drag a box around a particle" onClick={() => setTool(tool === 'sambox' ? 'pan' : 'sambox')}>
            <SquareDashedMousePointer {...IC} /> Box (SAM)
          </button>
          <span className="hint">Drag a box around a particle: its outline.</span>
        </div>
      )}
      {samSpec.prompt === 'all' && (
        <>
          <div className="ie-params">
            <span className="ie-label">Points</span>
            <Select<string> value={String(samSpec.perSide)} title="The grid of points the model is asked at (each point: the object under it); more, the small particles found too, slower" options={[16, 24, 32, 48].map((n): [string, string] => [String(n), `${n} × ${n}`])} onChange={(v) => setSam({ perSide: Number(v) === SAM_DEFAULTS.perSide ? undefined : Number(v) })} />
            <span className="ie-label">Sure</span>
            <span className="row" title="The least the model's own guess of how good a mask is (0 … 1): higher, fewer and better">
              <NumInput className="tiny" min={0} max={1} step={0.02} value={samSpec.iou} onChange={(v) => setSam({ iou: Number.isFinite(v) && v !== SAM_DEFAULTS.iou ? Math.min(1, Math.max(0, v)) : undefined })} />
              <span className="muted">stable</span>
              <NumInput className="tiny" min={0} max={1} step={0.02} value={samSpec.stability} title="The least stability of a mask: how little it changes when its threshold moves (0 … 1)" onChange={(v) => setSam({ stability: Number.isFinite(v) && v !== SAM_DEFAULTS.stability ? Math.min(1, Math.max(0, v)) : undefined })} />
            </span>
            <span className="ie-label">Size ({calU}²)</span>
            <span className="row">
              <NumInput className="short" min={0} value={+(samSpec.minArea * calK * calK).toPrecision(6)} title="The least area kept" onChange={(v) => setSam({ minArea: Number.isFinite(v) && v >= 0 ? v / (calK * calK) : undefined })} />
              <span className="muted">to</span>
              <NumInput className="tiny" min={1} max={100} step={1} value={Math.round(samSpec.maxFrac * 100)} title="The largest kept, in % of the image (the ground or a whole cluster left out)" onChange={(v) => setSam({ maxFrac: Number.isFinite(v) && v > 0 ? Math.min(1, v / 100) : undefined })} />
              <span className="muted">% of it</span>
            </span>
          </div>
          <Check label="leave out those on the image's edge" title="Particles cut by the edge of the image left out (their size is not known)" value={samSpec.edges} onChange={(edges) => setSam({ edges: edges || undefined })} />
          <div className="row wrap">
            <button className="nodrag btn-run" title="Every particle found, from a grid of points (those found before replaced)" onClick={() => void samAll()}>
              Segment all
            </button>
            <span className="muted">{partMsg}</span>
          </div>
        </>
      )}
      {samSpec.prompt !== 'all' && partMsg && <div className="muted">{partMsg}</div>}
      <div className="hint">{samModel.credit}.</div>
      {samCached[samSpec.model] && (
        <div className="row">
          <button className="nodrag" title="The model's files taken out of this browser (downloaded again when next used)" onClick={() => void samForget()}>
            Remove it from this browser
          </button>
        </div>
      )}
    </>
  );
  const prepare = (
    <>
      {task === 'surface' && surfacePanel('heights')}
      {cropBlock}
      {calBlock}
      <div className="ie-section">Image steps</div>
      {chain}
    </>
  );
  const pane = (() => {
    if (task === 'all') return null;
    if (taskStep === 0) return prepare;
    if (task === 'particles') {
      if (taskStep === 1)
        return (
          <MethodCards methods={FIND_METHODS} value={findM} onPick={pickFind}>
            {findM === 'threshold' && (
              <>
                {thresholdCard}
                {cleanMask}
                {particlesPanel('mask')}
              </>
            )}
            {findM === 'classifier' && (
              <>
                {classifierCard}
                {cleanMask}
                {particlesPanel('mask')}
              </>
            )}
            {findM === 'like' && particlesPanel('like')}
            {findM === 'sam' && samCard}
            {findM === 'rays' && (
              <>
                <div className="hint">A seed in every particle (the mask's centres when the image steps make one, else the bright or dark blobs at their size), from each 32 rays stopped at the first edge. The Rays tool does it for one particle, with a click.</div>
                {particlesPanel('mask')}
              </>
            )}
          </MethodCards>
        );
      if (taskStep === 2)
        return (
          <>
            <div className="row wrap">
              <b>{autoCount} found</b>
              {outCount > 0 && <span className="muted">· {outCount} left out</span>}
              {partMsg && <span className="muted">· {partMsg}</span>}
            </div>
            {findM === 'like' ? (
              particlesPanel('check')
            ) : (
              <>
                <ReviewPanel
                  reviewing={checking}
                  setReviewing={(on) => {
                    setChecking(on);
                    if (on) setTool('pan');
                  }}
                  count={autoRois.length}
                  out={{ hand: autoRois.filter((r) => r.out === 'hand').length, said: autoRois.filter((r) => r.out === 'said').length, learnt: autoRois.filter((r) => r.out === 'learnt').length, score: autoRois.filter((r) => r.out === 'score').length }}
                  putBack={() => setRois(rois.map((r) => (r.out === 'hand' ? { ...r, out: undefined } : r)))}
                  learnOn={!!rv.learn}
                  setLearn={(on) => setRv({ learn: on || undefined })}
                  method={rv.method ?? 'auto'}
                  setMethod={(method) => setRv({ method: method === 'auto' ? undefined : method })}
                  good={saidList.filter((r) => r.said).length}
                  bad={saidList.filter((r) => !r.said).length}
                  learnt={gLearnt}
                  probs={gProb ? [...gProb.values()] : null}
                  pmin={gPmin}
                  setPmin={(v) => setRv({ pmin: v === 0.5 ? undefined : v })}
                  unsure={unsureG}
                  setUnsure={setUnsureG}
                  forget={() => setRois(rois.map((r) => (r.said !== undefined ? { ...r, said: undefined } : r)))}
                  scores={autoRois.filter((r) => r.id.startsWith('s') && r.score !== undefined).map((r) => r.score!)}
                  sure={gSure}
                  setSure={(v) => setRv({ sure: v <= 0.5 ? undefined : v })}
                />
                {particlesPanel('accuracy')}
              </>
            )}
            {particlesPanel('refine')}
          </>
        );
      return (
        <>
          {measurePanel}
          {arrangePanel}
          <Fold id="task-texture" title="Texture" aside="grain size, orientation, fractal">
            {texturePanel}
          </Fold>
        </>
      );
    }
    if (task === 'spots') {
      if (taskStep === 1)
        return (
          <>
            <div className="hint">Draw an ellipse (or a rectangle) on one spot, then with Stamp click every other spot: a copy of the one picked, centred on the bright pixels under it (Centre on, on the right). Give the spots of a replicate a group (New ones in group): the summary is by group.</div>
            {roiPanel(true)}
          </>
        );
      if (taskStep === 2)
        return (
          <>
            <div className="hint">Every spot its own background, taken off its signal: pick a spot (step 2) and choose a ring around it (its gap and width), a region drawn, or the global one; Same for its group gives it to all of its group. A selection can itself be a region of background.</div>
            {measureOf('spots')}
          </>
        );
      return measureOf('measure');
    }
    if (task === 'network') {
      if (taskStep === 1)
        return (
          <MethodCards methods={FIND_METHODS.filter(([m]) => m === 'threshold' || m === 'classifier')} value={findM === 'classifier' ? 'classifier' : 'threshold'} onPick={(m) => set({ find: m })}>
            {findM === 'classifier' ? classifierCard : thresholdCard}
            {cleanMask}
          </MethodCards>
        );
      return taskStep === 2 ? networkPanel : texturePanel;
    }
    if (task === 'lattice') return latticePanel(taskStep === 1 ? 'spots' : taskStep === 2 ? 'fringes' : 'rings');
    return surfacePanel(taskStep === 1 ? 'areal' : taskStep === 2 ? 'profile' : 'step');
  })();
  // what was done in each step of the task (its number marked)
  const done: boolean[] =
    task === 'particles' ? [!!data.cal || !!crop || steps.length > 0, autoCount > 0, examples.length > 0 || rois.some((r) => r.auto && r.shape) || !!acc, false]
    : task === 'spots' ? [!!data.cal || !!crop || steps.length > 0, rois.some((r) => isArea(r) && !r.auto && !r.train && r.role !== 'background'), rois.some((r) => !!r.bg && r.bg.mode !== 'none') || !!spec.globalBg, false]
    : task === 'network' ? [!!data.cal || !!crop, !!thrStep || !!clsStep, !!data.network?.on, !!(data.texture && Object.values(data.texture).some(Boolean))]
    : task === 'lattice' ? [!!data.cal || !!crop, (data.lattice?.spots?.length ?? 0) > 0, !!data.lattice?.fringes, !!data.lattice?.saed]
    : task === 'surface' ? [steps.some((q) => q.kind === 'level' && q.on), !!data.surface?.areal, !!data.surface?.profile, !!data.surface?.step]
    : [];
  // ---- the panel on the right of a task: what it found so far, what to do next ----
  const summary = (() => {
    if (task === 'particles') {
      const ds = rois.filter((r) => r.auto && !r.out && isArea(r)).map((r) => {
        const pts = roiOutline(r);
        let a = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
        return 2 * Math.sqrt(Math.abs(a) / 2 / Math.PI) * calK;
      });
      const mean = ds.length ? ds.reduce((x, y) => x + y, 0) / ds.length : NaN;
      const [lo, hi] = ds.length ? [Math.min(...ds), Math.max(...ds)] : [0, 1];
      const bins = new Array<number>(12).fill(0);
      for (const d of ds) bins[Math.min(11, Math.floor(((d - lo) / (hi - lo || 1)) * 12))]++;
      const top = Math.max(1, ...bins);
      const next =
        !data.pixels ? ''
        : barApart > 0 && !crop ? 'Cut the data bar under the image (step 1, Crop).'
        : !data.cal ? 'Set the scale (step 1, Calibration): else the sizes are in pixels.'
        : !autoCount ? 'Find the particles (step 2).'
        : lastMatch.current && !examples.length && !rejected.length ? 'Check those found (step 3): Review leaves out the wrong ones.'
        : 'Measure them (step 4): the sizes, the shapes, how they lie.';
      return (
        <>
          <div className="ie-sum-label">Found</div>
          <div className="ie-sum-value">{autoCount}</div>
          {ds.length > 0 && (
            <>
              <div className="muted">
                mean d {+mean.toPrecision(3)} {calU} ({+lo.toPrecision(3)} to {+hi.toPrecision(3)})
              </div>
              <svg className="ie-sum-hist" viewBox="0 0 120 36" preserveAspectRatio="none" aria-label="The sizes of the particles found">
                {bins.map((c, i) => (
                  <rect key={i} x={i * 10 + 0.5} y={36 - (c / top) * 34} width={9} height={(c / top) * 34} />
                ))}
              </svg>
              <div className="muted">their sizes (the diameter of a disc as large)</div>
            </>
          )}
          {next && (
            <>
              <div className="ie-sum-label">Next</div>
              <div className="hint">{next}</div>
            </>
          )}
        </>
      );
    }
    if (task === 'spots') {
      const spots = rois.filter((r) => isArea(r) && !r.train && !r.out && r.role !== 'background');
      const ringed = spots.filter((r) => r.bg && r.bg.mode !== 'none').length;
      const regions = rois.filter((r) => r.role === 'background').length;
      const groups = new Set(spots.map((r) => r.group ?? '')).size;
      const next = !spots.length
        ? 'Place the spots (step 2): an ellipse on one, then Stamp on the others.'
        : !ringed
          ? 'Give the spots a background (step 2: pick one, Background; Same for its group).'
          : (base?.ch.length ?? 1) === 3 && spec.channels !== 'each'
            ? 'Measure each channel and their ratio (step 4: Channels, each and a ratio).'
            : 'Read the Spots sheet (step 4), or take it out of the node’s workbook.';
      return (
        <>
          <div className="ie-sum-label">Spots</div>
          <div className="ie-sum-value">{spots.length}</div>
          <div className="muted">
            {ringed} with a background of their own{groups > 1 ? ` · ${groups} groups` : ''}
            {regions ? ` · ${regions} background region${regions === 1 ? '' : 's'}` : ''}
          </div>
          <div className="ie-sum-label">Next</div>
          <div className="hint">{next}</div>
        </>
      );
    }
    if (task === 'network') {
      const ligaments = net?.branches.filter((b) => b.type === 'junction').length ?? 0;
      return (
        <>
          <div className="ie-sum-label">Network</div>
          {net && data.network?.on ? (
            <div className="muted">
              {ligaments} ligaments · {net.nodes.filter((n) => n.degree >= 3).length} junctions · {net.pores.length} pores
            </div>
          ) : (
            <div className="hint">{thrStep || clsStep ? 'Measure the network of the mask (step 3).' : 'Make a mask first (step 2): a threshold or the classifier.'}</div>
          )}
          {netError && <div className="hint ie-err">{netError}</div>}
        </>
      );
    }
    if (task === 'lattice') {
      const sp = data.lattice?.spots ?? [];
      return (
        <>
          <div className="ie-sum-label">Spots</div>
          <div className="muted">{sp.length ? `${sp.length} picked (their d and angles: step 2)` : 'none yet: show the spectrum and click its spots (step 2)'}</div>
          {(nodeRes?.view.lattice?.fringes?.length ?? 0) > 0 && <div className="muted">{nodeRes!.view.lattice!.fringes!.length} lines across the fringes</div>}
          {(nodeRes?.view.lattice?.ringRows?.length ?? 0) > 0 && <div className="muted">{nodeRes!.view.lattice!.ringRows!.length} rings of the pattern</div>}
        </>
      );
    }
    const a = nodeRes?.view.surface?.areal?.[0];
    const zu = data.surface?.zUnit ? ` ${data.surface.zUnit}` : '';
    return (
      <>
        <div className="ie-sum-label">Roughness</div>
        {a ? (
          <div className="muted">
            Sa {fmt(a.Sa)}
            {zu} · Sq {fmt(a.Sq)}
            {zu} · Sz {fmt(a.Sz)}
            {zu}
          </div>
        ) : (
          <div className="hint">{steps.some((q) => q.kind === 'level' && q.on) ? 'Measure it (step 2).' : 'Level the image first (step 1).'}</div>
        )}
      </>
    );
  })();
  return createPortal(
    <div className="image-editor nowheel" ref={root} tabIndex={-1} onKeyDown={key} onKeyUp={(e) => (e.key === 'b' || e.key === 'B') && setHeld(false)}>
      <div className="ie-toolbar">
        <b className="ellipsis">{data.name || 'image'}</b>
        <span className="muted">
          {base ? `${base.w} × ${base.h}` : ''}
          {crop && full ? ` (of ${full.w} × ${full.h})` : ''}
          {busy ? (reply && reply.scale < 1 ? ' · preview, computing the full size…' : ' · computing…') : ''}
        </span>
        <span className="ie-group ie-tasks" title="What you are doing: its steps on the left, in the order they are done; All tools: every panel, as before">
          {TASK_ORDER.map((t) => (
            <button key={t} className={`nodrag${task === t ? ' on' : ''}`} title={t === 'all' ? 'Every tool and panel at once (the image steps on the left, the panels as tabs on the right)' : TASKS[t].title} onClick={() => setTask(t)}>
              {taskLabel(t)}
            </button>
          ))}
        </span>
        <span className="grow" />
        <span className="ie-group" title="Compare the result with the original (or with the image before the step shown)">
          {cmpButton('edited', 'Edited', 'The result alone')}
          {cmpButton('original', 'Original', 'The original alone (\\ switches; B: while held)')}
          {cmpButton('side', 'Side by side', 'The original and the result side by side, moved and zoomed together (Y)')}
          {cmpButton('split', 'Split', 'One image, the original on one side of a line, the result on the other: drag the line')}
          {cmp === 'split' && (
            <button className="nodrag" disabled={onOriginal} title="The line vertical or horizontal" onClick={() => setSplitDir(splitDir === 'v' ? 'h' : 'v')}>
              {splitDir === 'v' ? '⇆' : '⇅'}
            </button>
          )}
          <Select<'original' | 'prev'>
            value={before}
            title="Compared with the original, or with the image before the step shown (what that step changes)"
            options={[
              ['original', 'vs the original'],
              ['prev', 'vs before the step'],
            ]}
            onChange={setBefore}
          />
        </span>
        <span className="ie-group">
          <button className={`nodrag${tool === 'pan' ? ' on' : ''}`} title="Move the image (drag); the wheel zooms" onClick={() => setTool('pan')}>
            <Hand {...IC} />
          </button>
          <button className={`nodrag${tool === 'crop' ? ' on' : ''}`} title="Crop: the part of the original analysed (drag a rectangle on the original as it came; the data bar of a microscope cut off)" onClick={() => setTool(tool === 'crop' ? 'pan' : 'crop')}>
            <CropIcon {...IC} /> Crop
          </button>
          <button className={`nodrag${tool === 'scale' ? ' on' : ''}`} title="Set the scale: draw a line along the scale bar of the original (Shift: straight; its ends found on the bar), then give its length" onClick={() => setTool(tool === 'scale' ? 'pan' : 'scale')}>
            <Ruler {...IC} /> Scale
          </button>
        </span>
        <span className="ie-group" title="Selections: draw on the image analysed">
          {shownTools.map(([t, Icon, label]) => (
            <button
              key={t}
              className={`nodrag${tool === t ? ' on' : ''}`}
              title={`${label}. ${TOOL_HINTS[t]}${t === 'stamp' && !rois.some((r) => r.id === sel && isArea(r)) ? ' Pick the selection to copy first.' : ''}`}
              onClick={() => {
                setTool(tool === t ? 'pan' : t);
                setDraft(null);
              }}
            >
              <Icon {...IC} />
            </button>
          ))}
          {(task === 'particles' || task === 'all') &&
            ([
              ['sam', MousePointerClick, 'Point (SAM): click a particle, its outline found by Segment anything (Shift-click: a part added, Alt-click: a part taken off)'],
              ['sambox', SquareDashedMousePointer, 'Box (SAM): drag a box around a particle, its outline found by Segment anything'],
            ] as const).map(([t, Icon, title]) => (
              <button key={t} className={`nodrag${tool === t ? ' on' : ''}`} title={title} onClick={() => (setTool(tool === t ? 'pan' : t), setDraft(null))}>
                <Icon {...IC} />
              </button>
            ))}
          {task !== 'all' && (
            <button className={`nodrag${moreTools ? ' on' : ''}`} title={moreTools ? 'Only the tools of this task' : 'Every selection tool'} onClick={() => setMoreTools(!moreTools)}>
              {moreTools ? 'Fewer' : 'More'}
            </button>
          )}
        </span>
        <button className="nodrag" title="Zoom out (−)" onClick={() => zoomAt(0.8)}>
          <Minus {...IC} />
        </button>
        <span className="muted ie-zoom">{Math.round(k * 100)} %</span>
        <button className="nodrag" title="Zoom in (+)" onClick={() => zoomAt(1.25)}>
          <Plus {...IC} />
        </button>
        <button className="nodrag" title="Fit the window (0)" onClick={() => (setZoom(0), setPan([0, 0]))}>
          <Maximize {...IC} />
        </button>
        <button className="nodrag" title="1 image pixel = 1 screen pixel" onClick={() => setZoom(1)}>
          1:1
        </button>
        <button className="nodrag ie-close" title="Close the editor (Esc); Ctrl+Z undoes" onClick={onClose}>
          <X {...IC} />
        </button>
      </div>
      <div className="ie-body" style={{ gridTemplateColumns: `${panels[0]}px 5px minmax(0, 1fr) 5px ${panels[1]}px` }}>
        <div className="ie-steps">
          {task === 'all' ? (
            chain
          ) : (
            <>
              <TaskSteps steps={TASKS[task].steps} stage={taskStep} done={done} onPick={setStage} />
              <div className="ie-task-pane">{pane}</div>
            </>
          )}
        </div>
        <div className="ie-split-bar nodrag" title="Drag: the width of the steps (double-click: as it was)" onPointerDown={(e) => dragPanel(e, 0)} onDoubleClick={() => setPanelWidth(0, PANELS[0])} />
        <div
          className={`ie-view${tool !== 'pan' ? ' scale' : ''}${side ? ' side' : ''}`}
          ref={view}
          onWheel={(e) => (e.altKey && (tool === 'brush' || tool === 'eraser') ? setBrush((b) => Math.min(100, Math.max(1, e.deltaY < 0 ? Math.max(b + 1, Math.round(b * 1.15)) : Math.min(b - 1, Math.round(b / 1.15))))) : zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY))}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={onDouble}
          onPointerLeave={() => setHover(null)}
        >
          {specOn ? (
            <>
              {stage(
                canvasS,
                spectrumImg ? `spectrum${(fft.log ?? true) ? ' (log)' : ''}, ${spectrumImg.N} × ${spectrumImg.N}` : 'spectrum: computing …',
                spectrumImg && vtab === 'lattice' && <SpotsOverlay spots={data.lattice?.spots ?? []} N={spectrumImg.N} k={k} pick onClick={(u, v) => worker.current?.postMessage({ type: 'spot', u, v } satisfies SpotRequest)} />,
              )}
              <canvas ref={canvas} hidden />
              <canvas ref={canvasB} hidden />
            </>
          ) : onOriginal ? (
            <>
              {stage(canvasO, tool === 'crop' ? 'original: drag the part to analyse' : 'original: draw along the scale bar', tool === 'crop' ? cropRect : scaleLine)}
              <canvas ref={canvas} hidden />
              <canvas ref={canvasB} hidden />
            </>
          ) : mode === 'side' ? (
            <>
              <div className="ie-pane">{stage(canvasB, beforeLabel, layers)}</div>
              <div className="ie-pane">{stage(canvas, 'edited', layers)}</div>
            </>
          ) : mode === 'split' ? (
            <div className="ie-pane">
              {stage(canvas, undefined, layers)}
              <div className="ie-split-before" style={{ clipPath: splitDir === 'v' ? `inset(0 ${(1 - split) * 100}% 0 0)` : `inset(0 0 ${(1 - split) * 100}% 0)` }}>
                {stage(canvasB)}
              </div>
              <div className={`ie-split-line ${splitDir}`} style={splitDir === 'v' ? { left: `${split * 100}%` } : { top: `${split * 100}%` }}>
                <span className="ie-split-handle" title="Drag the line">
                  {splitDir === 'v' ? '⇆' : '⇅'}
                </span>
              </div>
              <span className="ie-pane-label left">{beforeLabel}</span>
              <span className="ie-pane-label">edited</span>
            </div>
          ) : (
            <div className="ie-pane">
              {mode === 'original' ? stage(canvasB, beforeLabel, layers) : stage(canvas, undefined, layers)}
              {mode === 'original' ? <canvas ref={canvas} hidden /> : <canvas ref={canvasB} hidden />}
            </div>
          )}
          {onOriginal && hover && <canvas ref={loupe} className="ie-loupe" width={144} height={144} style={{ left: hover.sx + 18, top: hover.sy + 18 }} />}
          {readout && <div className="ie-readout">{readout}</div>}
          {(tool === 'brush' || tool === 'eraser') && paint && hover && !onOriginal && (
            <div className={`ie-brush-cursor${tool === 'eraser' ? ' erase' : ''}`} style={{ left: hover.sx, top: hover.sy, width: Math.max(4, brush * k), height: Math.max(4, brush * k), ...(tool === 'brush' ? { borderColor: classColor(paintClasses, paint) } : {}) }} />
          )}
          {job && now - job.t0 > (job.of === 'image' ? 1000 : 250) && (
            <BusyCard job={job} now={now} cancel={cancelWork} cancelLabel={job.of === 'image' ? 'Stop' : 'Cancel'} cancelTitle={job.of === 'image' ? 'Stop: the step being computed turned off (turn it on again with other settings)' : 'Stop the search: nothing found is kept'} />
          )}
        </div>
        <div className="ie-split-bar nodrag" title="Drag: the width of the panels on the right (double-click: as it was)" onPointerDown={(e) => dragPanel(e, 1)} onDoubleClick={() => setPanelWidth(1, PANELS[1])} />
        <div className="ie-side">
          <div className="hint ellipsis ie-cal-line" title="The size of a pixel (Image ▸ Calibration)">{data.cal && data.cal.size > 0 ? `1 px = ${fmt(data.cal.size)} ${unitText(data.cal.unit)}` : 'not calibrated: the results in pixels'}</div>
          {task === 'all' ? (
            <>
              <div className="ie-tabs">
                {SIDE_TABS.map(([t, label, title]) => (
                  <button key={t} className={`nodrag${tab === t ? ' on' : ''}`} title={title} onClick={() => setTab(t)}>
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'image' && (
                <>
                  {histView}
                  {cropBlock}
                  {calBlock}
                </>
              )}
              {tab === 'objects' && (
                <>
                  {roiPanel(false)}
          {(() => {
            // the trainable classifier of the steps, here too (it stays a step: its place in the order matters)
            const cls = steps.find((st) => st.kind === 'classify');
            return (
              <Fold id="pixel-classifier" title="Pixel classifier" aside={cls ? `${stepClasses(cls, rois).length} classes${cls.on ? '' : ' · off'}` : 'none'}>
                {cls ? (
                  <>
                    <div className="hint">The trainable classifier, a step of the list on the left (in Find the objects): it learns the classes from what you draw, and makes the mask the particles are found in.</div>
                    <ClassifierEditor s={cls} set={(patch) => setStep(cls.id, { p: { ...cls.p, ...(patch as ImgStep['p']) } })} rois={rois} sel={sel} setRois={setRois} note={reply?.notes[cls.id]} hist={reply?.stepHist[cls.id]} paint={paint} setPaint={setPaint} tool={paintTool} setTool={setPaintTool} brush={brush} setBrush={setBrush} painted={painted} clearPaint={clearPaint} live={liveTrain} setLive={(on) => (setLiveTrain(on), on && updateTrain())} pending={trainPending} updateNow={updateTrain} />
                    <div className="row">
                      <button className="nodrag" title="Show the image up to this step (its card on the left)" onClick={() => setUpTo(cls.id)}>
                        Open its step
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="hint">A classifier of the pixels (as ImageJ’s Trainable Weka Segmentation): draw examples of the particles, the ground and their edges; it makes the mask the particles are found in.</div>
                    <div className="row">
                      <button className="nodrag" title="Add the trainable classifier as a step (at the end of the list on the left)" onClick={() => add('classify')}>
                        + Add a pixel classifier
                      </button>
                    </div>
                  </>
                )}
              </Fold>
            );
          })()}
                  {particlesPanel()}
                  {arrangePanel}
                </>
              )}
              {tab === 'structure' && networkPanel}
              {tab === 'structure' && texturePanel}
              {tab === 'lattice' && latticePanel()}
              {tab === 'surface' && surfacePanel()}
              {tab === 'results' && measurePanel}
              {tab === 'image' && keysBlock}
            </>
          ) : (
            <>
              <div className="ie-summary">{summary}</div>
              {tool in TOOL_HINTS && (
                <div className="ie-tool-opts">
                  <ToolOptions tool={tool} wandTol={wandTol} setWandTol={setWandTol} raysOf={raysOf} setRaysOf={setRaysOf} centre={centre} setCentre={setCentre} />
                </div>
              )}
              <Fold id="side-view" title="View and histogram" opened>
                {histView}
              </Fold>
              {task !== 'spots' && (
                <Fold id="side-selections" title="Selections" aside={rois.length ? `${rois.length}` : 'none'}>
                  {roiPanel(true)}
                </Fold>
              )}
              {task === 'particles' && autoCount > 0 && (
                <Fold id="side-layers" title="Layers" aside={data.particles?.layers ? 'on' : undefined}>
                  {particlesPanel('layers')}
                </Fold>
              )}
              {task !== 'particles' && task !== 'spots' && (
                <Fold id="side-measure" title="Measurements" aside="of the selections">
                  {measurePanel}
                </Fold>
              )}
              <Fold id="side-keys" title="Keys">
          <div className="hint">Wheel: zoom · drag: move · \ original / edited · Y side by side · B: the original while held · + − 0: zoom, fit · Esc: the drawing, then the tool off, then close · a selection picked: Delete removes it, Ctrl+D copies it, the arrows move it (Shift: by 10)</div>
              </Fold>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
