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
import { STEP_DEFS, STEP_GROUPS, newStep, stepClasses, type ImgStep, type StepDef, type StepKind } from '../image/steps.ts';
import { cropBox, cropRaster, dataBarRows, luminance, unpackPixels, type Crop } from '../image/raster.ts';
import { unitText } from '../image/node.ts';
import type { CentreReply, ImgReply, ImgRequest, MatchReply, MatchRequest, MeasureReply, MeasureRequest, ParticlesReply, ParticlesRequest, RaysReply, RefineReply, RefineRequest, ValueReply, WandReply } from '../image/imageWorker.ts';
import { MATCH_DEFAULTS, placeLike, type MatchOpts } from '../image/match.ts';
import { trainingExamples } from '../image/classify.ts';
import { groupLikeExamples, PARTICLE_DEFAULTS, SHAPE_COLORS, shapeFeatures, shapeName, type ParticleOpts } from '../image/particles.ts';
import { ClassifierEditor, type PaintTool } from './ClassifierEditor.tsx';
import { EDGE_BAND, type Match, type MatchModelSpec } from '../image/match.ts';
import { REGULAR_SHAPES, type RegularShape } from '../image/refine.ts';
import { estimateLayers } from '../image/layers.ts';
import { offsetDistance, offsetOutline } from '../image/roi.ts';
import { classColor } from '../image/classify.ts';
import { isArea, moveRoi, nearRoi, roiCentre, roiOutline, TOOL_HINTS, type Pt, type Roi, type RoiKind, type RoiTool } from '../image/roi.ts';
import { measureSpec, roiPerimeter, type MeasureSpec } from '../image/measure.ts';
import type { Workbook } from '../engine/table.ts';
import { MeasurePanel, ParticlesPanel, RoiOverlay, RoiPanel } from './RoiManager.tsx';
import { NetworkOverlay, NetworkPanel, type NetTool } from './NetworkPanel.tsx';
import { ArrangeOverlay, ArrangePanel } from './ArrangePanel.tsx';
import { branchAt, midOf, type HandKind, type NetBranch, type NetworkHand, type NetworkSpec } from '../image/network.ts';
import { useNodeResult } from '../engine/engine.ts';
import { ask } from '../ui/dialogStore.ts';
import { toRGBA, type Lut } from '../image/render.ts';
import { COLOR_MAPS } from '../figure/colors.ts';
import { CurvesEditor } from './CurvesEditor.tsx';
import { ParamField, ThresholdEditor } from './ImageParams.tsx';
import { Check, NumInput, Select } from './ui.tsx';
import { ArrowDown, ArrowUp, Circle, Crop as CropIcon, Crosshair, Hand, Maximize, Minus, Pentagon, PenTool, Plus, Ruler, Slash, Spline, Square, Stamp, Sun, Triangle, Wand, X } from 'lucide-react';
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
type Tool = 'pan' | 'scale' | 'crop' | 'brush' | 'eraser' | RoiTool;
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
  ['structure', 'Structure', 'The network of the mask: ligaments, junctions, pores (skeleton analysis), changed by hand'],
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
  const [brush, setBrush] = useState(4);
  // how the classifier's examples are drawn: filled outlines, strokes, or taken away
  const [paintTool, setPaintToolState] = useState<PaintTool>('fill');
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [reply, setReply] = useState<ImgReply | null>(null);
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
  const onOriginal = tool === 'scale' || tool === 'crop';
  const roiTool = tool in TOOL_HINTS || tool === 'brush' || tool === 'eraser';
  // the corner of the part analysed in the original (the selections' places are in the original's pixels)
  const [ox, oy] = crop ? [crop[0], crop[1]] : [0, 0];
  // the steps give a mask (its coverage measured)
  const masks = steps.some((s) => s.on && (s.kind === 'threshold' || s.kind === 'localthreshold'));
  const measuring = rois.length > 0 || masks;
  // the examples of a trainable classifier (in the part analysed), sent with the steps when one is on
  const classifying = steps.some((s) => s.on && s.kind === 'classify');
  const train = useMemo(() => (classifying ? trainingExamples(rois, ox, oy) : []), [classifying, rois, ox, oy]);
  const trainKey = JSON.stringify(train);
  // the particles: how they are found, the group they go in, what the last search found
  const partOpts: ParticleOpts = { ...PARTICLE_DEFAULTS, ...data.particles };
  const partGroup = data.particles?.group ?? 'particles';
  const setPart = (p: Partial<ParticleOpts> & { group?: string; shapes?: RegularShape[]; snap?: boolean; layers?: boolean }) => set({ particles: { ...data.particles, ...p } });
  const [partMsg, setPartMsg] = useState('');
  // Find like this: its options
  const matchOpts: MatchOpts & { fit: boolean; models?: MatchModelSpec[] } = { ...MATCH_DEFAULTS, fit: true, ...data.match };
  const setMatch = (p: Partial<MatchOpts> & { fit?: boolean; models?: MatchModelSpec[] }) => set({ match: { ...data.match, ...p } });
  // the list of models (those whose selection is still there), each with its own settings
  const modelList = (data.match?.models ?? []).filter((m) => rois.some((r) => r.id === m.roi));
  const setModels = (models: MatchModelSpec[]) => setMatch({ models: models.length ? models : undefined });
  // a model's settings: its own over those of all
  const specOf = (rid: string): MatchModelSpec => ({ roi: rid, context: matchOpts.context, ring: matchOpts.ring, symmetry: matchOpts.symmetry, sizes: matchOpts.sizes, ...modelList.find((m) => m.roi === rid) });
  const MODEL_COLORS = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a'];
  // (the models of the last search, their matches turned into selections when they come)
  const models = useRef<Roi[]>([]);
  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const canvasO = useRef<HTMLCanvasElement>(null);
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
  const onAnswer = useRef<(m: MeasureReply | WandReply | RaysReply | CentreReply | ParticlesReply | MatchReply | RefineReply) => void>(() => {});
  useEffect(() => {
    const w = new Worker(new URL('../image/imageWorker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<ImgReply | ValueReply | MeasureReply | WandReply | RaysReply | CentreReply | ParticlesReply | MatchReply | RefineReply>) => {
      if (e.data.type === 'value') return setVals(e.data);
      if (e.data.type !== 'image') return onAnswer.current(e.data);
      if (e.data.seq !== seq.current) return;
      setReply(e.data);
      // (a preview first: still computing the full size)
      if (e.data.scale === 1) {
        setBusy(false);
        setFullSeq((n) => n + 1);
      }
    };
    return () => w.terminate();
  }, []);
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
      setBusy(true);
      w.postMessage(q);
    }, 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, upToIndex, lut, overlay, data.pixels, data.pixelsId, data.figure?.overlay, data.figure?.alpha, crop?.join(), needBefore, before, measuring, trainKey]);
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
  }, [reply, mode]);
  useEffect(() => {
    const c = canvasO.current;
    if (!c || !full || !onOriginal) return;
    c.width = full.w;
    c.height = full.h;
    c.getContext('2d')!.putImageData(new ImageData(toRGBA(full, { lut: 'gray' }) as Uint8ClampedArray<ArrayBuffer>, full.w, full.h), 0, 0);
  }, [full, onOriginal]);

  // the zoom that fits the view (zoom 0: fit) — side by side: half of it — measured when the view or the image changes
  const shown = onOriginal ? full : base;
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
  const drag = useRef<{ x: number; y: number; pan: [number, number]; kind: 'pan' | 'line' | 'crop' | 'split' | 'draw' | 'move' | 'handle' | 'erase'; at?: [number, number]; roi?: Roi; handle?: string } | null>(null);
  // ---- the selections: drawn, picked, moved, edited ----
  const toOrig = (p: Pt): Pt => [p[0] + ox, p[1] + oy];
  const nextName = (taken: Roi[] = rois) => `R${1 + taken.reduce((m, r) => Math.max(m, Number(/^R(\d+)$/.exec(r.name)?.[1] ?? 0)), 0)}`;
  const newRoi = (kind: RoiKind, extra: Partial<Roi>): Roi => ({ id: `r${Date.now().toString(36)}${(roiSeq++).toString(36)}`, name: nextName(), kind, ...(group ? { group } : {}), ...extra });
  // the classifier (its classes give the examples painted their colour)
  const classifier = steps.find((s) => s.kind === 'classify');
  const toolOf = (t: PaintTool): Tool => (t === 'fill' ? 'freehand' : t);
  const setPaint = (c: string | null) => {
    setPaintCls(c);
    if (c) setTool(toolOf(paintTool));
    else if (tool === 'brush' || tool === 'eraser' || (paint && tool === 'freehand')) setTool('pan');
    setDraft(null);
  };
  const setPaintTool = (t: PaintTool) => {
    setPaintToolState(t);
    if (paint) setTool(toolOf(t));
  };
  // the examples of the classifier under the eraser at q (pixels of the original)
  const eraseAt = (q: Pt) => {
    const gone = rois.filter((r) => r.train && nearRoi(r, q, brush / 2));
    if (gone.length) setRois(rois.filter((r) => !gone.includes(r)));
  };
  const commit = (r0: Roi) => {
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
  const lastMatch = useRef<{ seq: string; list: (Match & { model: number; w?: number; h?: number })[]; ms: Roi[]; specs: MatchModelSpec[] } | null>(null);
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
      lastMatch.current = { seq: Date.now().toString(36), list, ms, specs: modelSpecs.current };
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
    const base = { id: `m${seq}-${i}`, name: '', group: spec?.group?.trim() || partGroup, auto: true, ...(color ? { color } : {}) };
    if (t.box) return { ...base, kind: t.kind, box: [q.x + ox, q.y + oy, q.w ?? t.box[2] * q.scale, q.h ?? t.box[3] * q.scale], angle: (t.angle ?? 0) + q.angle };
    return { ...base, kind: 'polygon', pts: placeLike(roiOutline(t), tx, ty, q.angle, q.scale, q.x + ox, q.y + oy) };
  };
  // the matches as alike as `min` or more, not left out: the particles found (named P1, P2 … in the group of particles)
  const placeMatches = (min: number, out: number[]): Roi[] => {
    const lm = lastMatch.current;
    if (!lm) return [];
    const keep = lm.list.map((q, i) => ({ q, i })).filter(({ q, i }) => q.score >= min && !out.includes(i));
    const names = particleNames(keep.length);
    const found = keep.map(({ q, i }, k) => ({ ...matchRoi(q, i, lm.seq, lm.ms), name: names[k] }));
    updateNodeData(id, (n) => ({ rois: [...((n.data as ImageAnalysisData).rois ?? []).filter((r) => !r.auto), ...found] }));
    const below = lm.list.filter((q) => q.score < min).length;
    setPartMsg(`${found.length} like ${lm.ms.length === 1 ? lm.ms[0].name : `the ${lm.ms.length} models`}${out.length ? `, ${out.length} left out by hand` : ''}${below ? ` (${below} less alike than ${min})` : ''}`);
    return found;
  };
  // the least similarity changed: the particles found again from the matches already there
  const setMatchMin = (min: number) => {
    setMatch({ min });
    placeMatches(min, rejected);
  };
  // a particle found left out (or one left out put back) by a click while reviewing
  const toggleMatch = (i: number) => {
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
  const findWith = (ms: Roi[], specs: MatchModelSpec[] = ms.map((r) => specOf(r.id))) => {
    models.current = ms;
    modelSpecs.current = specs;
    const { fit, models: _list, ...opts } = matchOpts;
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
        return { cx: cx - ox, cy: cy - oy, R: modelRadius(r), ...(fit && r.box ? { box: { w: r.box[2], h: r.box[3], angle: r.angle ?? 0 } } : {}), ...(shaped ? { poly: roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy]) } : {}), opts: own };
      }),
      // (every match down to a floor: the least similarity is then changed live)
      opts: { ...opts, min: Math.min(opts.min, MATCH_FLOOR) },
    };
    setPartMsg('finding…');
    worker.current?.postMessage(q);
  };
  const findLikePicked = () => {
    // (the list of models when there is one; else the selection picked, with its group)
    if (modelList.length) return findWith(modelList.map((m) => rois.find((r) => r.id === m.roi)!), modelList.map((m) => specOf(m.roi)));
    const t = rois.find((r) => r.id === sel && isArea(r) && !r.train);
    if (!t) return setPartMsg('pick a selection around one particle first');
    findWith(modelsOf(t));
  };
  // the selection picked added to the list of models, with the settings of all
  const addModel = () => {
    const t = rois.find((r) => r.id === sel && isArea(r) && !r.train);
    if (!t || modelList.some((m) => m.roi === t.id)) return;
    setModels([...modelList, { roi: t.id, context: matchOpts.context ?? 'disc', ring: matchOpts.ring, symmetry: matchOpts.symmetry, sizes: matchOpts.sizes }]);
  };
  // again, with the particles found as models too: the least alike of them (they differ most from the first model)
  const findMore = () => {
    const lm = lastMatch.current;
    if (!lm) return;
    const found = rois.filter((r) => r.auto && r.id.startsWith(`m${lm.seq}-`));
    const score = (r: Roi) => lm.list[Number(r.id.split('-')[1])]?.score ?? 1;
    const more = [...found].sort((a, b) => score(a) - score(b)).slice(0, 4);
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
    const list = rois.filter((r) => r.auto && (alsoHand || !r.hand));
    if (!list.length) return setPartMsg('find particles first');
    refining.current = list.map((r) => r.id);
    const q: RefineRequest = { type: 'refine', steps, ...(crop ? { crop } : {}), ...(train.length ? { train } : {}), outlines: list.map((r) => roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy])), shapes: data.particles?.shapes ?? REGULAR_SHAPES, snap: data.particles?.snap ?? true };
    setPartMsg('refining…');
    worker.current?.postMessage(q);
  };
  const findParticles = () => {
    const q: ParticlesRequest = { type: 'particles', steps, ...(crop ? { crop } : {}), ...(train.length ? { train } : {}), opts: partOpts };
    setPartMsg('finding…');
    worker.current?.postMessage(q);
  };
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
        eraseAt(q);
        drag.current = { x: 0, y: 0, pan, kind: 'erase' };
        return;
      case 'brush': {
        // (a stroke: a line as wide as the brush, a point every pixel or so of the screen)
        const r = newRoi('polyline', { pts: [q], width: brush });
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
      if (review && rg && lastMatch.current && rg.dataset.roi?.startsWith(`m${lastMatch.current.seq}-`)) return toggleMatch(Number(rg.dataset.roi.split('-')[1]));
      if (tool === 'pan' && rg) {
        const r = rois.find((x) => x.id === rg.dataset.roi);
        if (r) {
          setSel(r.id);
          drag.current = { x: e.clientX, y: e.clientY, pan, kind: 'move', at: q, roi: r };
          return;
        }
      }
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
    if (d?.kind === 'draw' && draft && tool === 'brush' && draft.pts) {
      // (a click of the brush: a dot)
      commit(draft.pts.length > 1 ? draft : { ...draft, pts: [draft.pts[0], draft.pts[0]] });
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
      if (cropDraft[2] > 3 && cropDraft[3] > 3) set({ crop: c ?? undefined });
      setCropDraft(null);
    }
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
    } else if (/^[1-9]$/.test(e.key) && classifier && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // (the classifier's classes: 1, 2, 3 … paints that one; again: stops)
      const c = stepClasses(classifier, rois)[Number(e.key) - 1];
      if (!c) return;
      setPaint(paint === c ? null : c);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && tab === 'structure' && netSel) {
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
  const roiLayer = !onOriginal && shownRois.length > 0 && <RoiOverlay rois={shownRois} sel={sel} k={k} ox={ox} oy={oy} W={W} H={H} labels={labels} interactive={tool === 'pan'} rings={rings} />;
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
  const rejectedLayer = !onOriginal && review && lastMatch.current && rejected.length > 0 && (
    <svg className="ie-overlay ie-rejected" width={W} height={H}>
      {rejected.map((i) => {
        const lm = lastMatch.current!;
        const q = lm.list[i];
        if (!q) return null;
        const pts = roiOutline(matchRoi(q, i, lm.seq, lm.ms));
        return <polygon key={i} data-rejected={i} points={pts.map(([x, y]) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`).join(' ')}><title>Left out: click to put it back</title></polygon>;
      })}
    </svg>
  );
  // (Structure: the network over the image, instead of the selections)
  const layers =
    tab === 'structure' ? (
      net && !onOriginal && data.network?.on && <NetworkOverlay net={net} spec={data.network} k={k} ox={ox} oy={oy} W={W} H={H} tool={netTool} sel={netSel} eraseR={eraseR} onSelect={setNetSel} onEdit={addEdit} />
    ) : (
      <>
        {tab === 'objects' && data.arrange?.on && (data.arrange.show ?? 'nearest') !== 'off' && nodeRes?.view.arrange && !onOriginal && <ArrangeOverlay res={nodeRes.view.arrange} spec={data.arrange} k={k} W={W} H={H} />}
        {roiLayer}
        {contextLayer}
        {rejectedLayer}
      </>
    );
  const cmpButton = (m: Cmp, label: string, title: string) => (
    <button className={`nodrag${cmp === m ? ' on' : ''}`} disabled={onOriginal} title={title} onClick={() => setCmp(m)}>
      {label}
    </button>
  );

  return createPortal(
    <div className="image-editor nowheel" ref={root} tabIndex={-1} onKeyDown={key} onKeyUp={(e) => (e.key === 'b' || e.key === 'B') && setHeld(false)}>
      <div className="ie-toolbar">
        <b className="ellipsis">{data.name || 'image'}</b>
        <span className="muted">
          {base ? `${base.w} × ${base.h}` : ''}
          {crop && full ? ` (of ${full.w} × ${full.h})` : ''}
          {busy ? (reply && reply.scale < 1 ? ' · preview, computing the full size…' : ' · computing…') : ''}
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
          {ROI_TOOLS.map(([t, Icon, label]) => (
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
          <button className={`nodrag ie-step-head ie-original${upToIndex === 0 ? ' shown' : ''}`} title="Show the original image (the part analysed)" onClick={() => setUpTo(upTo === '__none' ? null : '__none')}>
            Original image
          </button>
          <div className="row">
            <select
              className="nodrag grow"
              value=""
              title="Add an adjustment or any other step (after the one shown, else at the end)"
              onChange={(e) => {
                if (e.target.value) add(e.target.value as StepKind);
                e.target.value = '';
              }}
            >
              <option value="">+ Adjust…</option>
              {addOptions.map(([g, items]) => (
                <optgroup key={g} label={g}>
                  {items.map(([kind, d]) => (
                    <option key={kind} value={kind} title={d.title}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {steps.map((s, k) => {
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
                  <ClassifierEditor s={s} set={(patch) => setStep(s.id, { p: { ...s.p, ...(patch as ImgStep['p']) } })} rois={rois} sel={sel} setRois={setRois} note={reply?.notes[s.id]} hist={reply?.stepHist[s.id]} paint={paint} setPaint={setPaint} tool={paintTool} setTool={setPaintTool} brush={brush} setBrush={setBrush} />
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
          })}
          {!steps.length && <div className="hint">Adjust: add steps to prepare the image (tone and colour, noise, background, edges, texture), then a threshold or a trainable classifier (a mask) and its morphology. Each works on what the steps above give.</div>}
        </div>
        <div className="ie-split-bar nodrag" title="Drag: the width of the steps (double-click: as it was)" onPointerDown={(e) => dragPanel(e, 0)} onDoubleClick={() => setPanelWidth(0, PANELS[0])} />
        <div
          className={`ie-view${tool !== 'pan' ? ' scale' : ''}${side ? ' side' : ''}`}
          ref={view}
          onWheel={(e) => zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={onDouble}
          onPointerLeave={() => setHover(null)}
        >
          {onOriginal ? (
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
        </div>
        <div className="ie-split-bar nodrag" title="Drag: the width of the panels on the right (double-click: as it was)" onPointerDown={(e) => dragPanel(e, 1)} onDoubleClick={() => setPanelWidth(1, PANELS[1])} />
        <div className="ie-side">
          <div className="hint ellipsis ie-cal-line" title="The size of a pixel (Image ▸ Calibration)">{data.cal && data.cal.size > 0 ? `1 px = ${fmt(data.cal.size)} ${unitText(data.cal.unit)}` : 'not calibrated: the results in pixels'}</div>
          <div className="ie-tabs">
            {SIDE_TABS.map(([t, label, title]) => (
              <button key={t} className={`nodrag${tab === t ? ' on' : ''}`} title={title} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'image' && (
            <>
          <div className="ie-section">Histogram{thr ? ' (into the threshold)' : upToIndex < steps.length ? ` (up to step ${upToIndex})` : ''}</div>
          <Histogram hist={sideHist?.h ?? null} lo={sideHist?.lo ?? 0} hi={sideHist?.hi ?? 1} marks={marks} />
          <div className="ie-section">View</div>
          <div className="row wrap">
            <Select<Lut> value={lut} options={LUTS} title="The colour table of a gray image (the view; the figure has its own in the options)" onChange={setLut} />
            {reply?.kind === 'mask' && <Check label="mask over the image" title="A mask shown in a colour over the original, else white on black" value={overlay} onChange={setOverlay} />}
          </div>
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
          )}
          {tab === 'objects' && (
            <>
          <RoiPanel
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
          <ParticlesPanel
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
          <ArrangePanel
            spec={data.arrange ?? {}}
            set={(a) => set({ arrange: { ...data.arrange, ...a } })}
            res={nodeRes?.view.arrange}
            error={data.arrange?.on ? nodeRes?.warnings.find((w) => w.startsWith('Arrangement:')) : undefined}
            groups={[...new Set(rois.filter((r) => isArea(r) && !r.train && r.role !== 'background').map((r) => r.group ?? '').filter(Boolean))]}
            k={calK}
            u={calU}
          />
            </>
          )}
          {tab === 'structure' && (
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
          )}
          {tab === 'results' && <MeasurePanel spec={spec} set={setSpec} steps={steps} rgb={(base?.ch.length ?? 1) === 3} rois={rois} book={book} sheet={sheet} setSheet={setSheet} pick={(name) => setSel(rois.find((r) => r.name === name)?.id ?? sel)} />}
          {tab === 'image' && (
            <>
          <div className="ie-section">Keys</div>
          <div className="hint">Wheel: zoom · drag: move · \ original / edited · Y side by side · B: the original while held · + − 0: zoom, fit · Esc: the drawing, then the tool off, then close · a selection picked: Delete removes it, Ctrl+D copies it, the arrows move it (Shift: by 10)</div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
