// The editor of a Figure Drawing, over the whole window: on the left the tools, in groups (what the next drag on the
// page draws); on top the selection bar (the place and size of what is selected, its alignment, flips), Snap and View
// (the grid, snapping, guides), the zoom; on the right the options of what is selected, by tab (style, arrangement,
// paths, what is made of it; the page when nothing is), and under them the layers (the objects, the front one first:
// shown, locked, named, reordered), components and library; at the bottom what the tool does and where the mouse is;
// the page in the middle, with rulers in mm and the grid. Objects are selected by a click (Shift / Ctrl: more), a box dragged
// around them or in the layers; dragged to move them (snapped to the grid and to the edges and middles of the others
// and of the page: guides show it; Alt: no snapping), their handles change their points; the keyboard moves, copies
// and removes them.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { drawingView, pageText, plotMapping, shapeSpec } from '../engine/evaluate.ts';
import { PageTextContext } from '../ui/pageText.ts';
import { QuickBar } from '../ui/QuickBar.tsx';
import { setQuickBar, setQuickBarAt, useQuickBar, useQuickBarAt } from '../ui/quickBarStore.ts';
import { anchorOf } from '../engine/drawingItems.ts';
import { FigureSvg } from '../figure/render.tsx';
import { dragKeys, HandlesFor, HandleScale, Interactive, PickedNodes, type DragInfo } from '../figure/interactive.ts';
import { DASHES } from './figureOptions.ts';
import { TEXT_SPEC_DEFAULTS, toPt, type Dash, type Figure, type ShapeSpec, type TextSpec } from '../figure/spec.ts';
import { DRAWING_GRID_DEFAULTS, newAnnotation } from '../defaults.ts';
import type { AnnotationItem, AppNode, DrawingData, DrawingGrid, IsoFace, IsoPlace } from '../types.ts';
import { ShapeEditor, TextEditor } from './AnnotationsEditor.tsx';
import { describe } from './annotationNames.ts';
import { ICON, TOOL_ICONS, type ToolIcon } from './drawIconMap.ts';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  BringToFront,
  ChevronDown,
  Component,
  Copy,
  DraftingCompass,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  Layers,
  Library,
  Lock,
  LockOpen,
  Magnet,
  SendToBack,
  Trash,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ComponentsTab, IsoMaker, LibraryTab, ObjectOps, TextPathFields, type Ctx, type OpsPart } from './DrawingPanels.tsx';
import { flipAcross, flipDown, transformAll } from './drawingTransform.ts';
import { combine, regionsOf } from './pathOps.ts';
import { copyStyle, pasteStyle } from './figureLibrary.ts';
import { CORNERED, cornersOf, cornersText, deleteNode, insertNode, isClosed, parsePath, pathPolylines, pathText, radiiOf, shapeToPath, simplifyPath, toggleNode } from '../figure/paths.ts';
import { PageControls } from './FigureView.tsx';
import { OptColor } from './fields.tsx';
import { Check, Field, NumInput, Select } from './ui.tsx';
import { alignMoves, bakeIso, copiedItems, copyItems, distributeMoves, flatBox, groupItems, isoToFace, isoToPage, onFace, pathOf, toPathItem, ungroupItems, geomBox, mapItem, MM, moveItem, snapAxis, union, type AlignHow, type Rect } from './drawingOps.ts';
import { isoDeltaToPage, isoEdges } from '../engine/isoPlane.ts';
import type { Pt, StickSide } from '../figure/shapes.ts';
import { IMAGE_ACCEPT, imageUrl } from '../imageFile.ts';
import { ask, notify } from '../ui/dialogStore.ts';

type Tool = 'select' | 'corner' | 'pen' | 'pencil' | 'builder' | 'image' | 'text' | 'line' | 'arrow' | 'double' | 'curved' | 'elbow' | 'equilibrium' | 'retro' | 'dimension' | 'rect' | 'ellipse' | 'polygon' | 'polyline' | 'star' | 'regular' | 'arc' | 'pie' | 'bracket' | 'brace' | 'callout';
// what each tool draws: its first look (the points come from the drag)
const TOOLS: { tool: Tool; title: string; key?: string; spec?: Partial<ShapeSpec> }[] = [
  { tool: 'select', title: 'Select and move (V): click an object, Shift / Ctrl + click more, or drag a box around them', key: 'v' },
  { tool: 'corner', title: 'Corners (K): click a shape, then its corners (Shift: more) and drag one inward to round them; as much as you drag (its radius also typed in the options)', key: 'k' },
  { tool: 'pen', title: 'Pen (B): click for a corner, drag for a smooth node (its curve); click the first node to close the path, double-click (or Enter) to end it open', key: 'b' },
  { tool: 'pencil', title: 'Pencil (F): draw freely, the line made smooth (fewer nodes) when you let go; back on its start: closed', key: 'f' },
  { tool: 'builder', title: 'Shape builder (X): select two or more closed shapes first; then click the parts they make to join them, Alt + click a part to take it away; Apply (Enter)', key: 'x' },
  { tool: 'image', title: 'Image (I): a picture from a file (PNG, JPEG, TIFF, SVG …): also paste one (Ctrl+V) or drop it on the page', key: 'i' },
  { tool: 'text', title: 'Text (T): click where it goes', key: 't' },
  { tool: 'line', title: 'Line (L): drag from its start to its end (Shift: by 15°)', key: 'l', spec: { kind: 'line', head2: 'none' } },
  { tool: 'arrow', title: 'Arrow (A): drag from its start to its head (Shift: by 15°)', key: 'a', spec: { kind: 'arrow' } },
  { tool: 'double', title: 'Double-headed arrow: drag from one end to the other', spec: { kind: 'arrow', head1: 'triangle', head2: 'triangle' } },
  { tool: 'curved', title: 'Curved arrow: drag from its start to its head (then its middle handle bends it; + Bend: through more points)', spec: { kind: 'arrow', curve: 0.3 } },
  { tool: 'elbow', title: 'Elbow arrow (a connector): drag from one shape to another; its ends stay stuck to them when they move', spec: { kind: 'arrow', route: 'hvh' } },
  { tool: 'equilibrium', title: 'Equilibrium arrow: drag from its start to its end (Body: favouring a side; texts above and below it)', spec: { kind: 'arrow', body: 'equilibrium', head1: 'none', head2: 'none', headSize: 4, gap: 2.5 } },
  { tool: 'retro', title: 'Retrosynthetic arrow: drag from its start to its head', spec: { kind: 'arrow', body: 'retro', head1: 'none', head2: 'none', headSize: 5, gap: 3 } },
  { tool: 'dimension', title: 'Dimension: drag from one point to the other; the length is written on it (mm); its handle in the middle moves it aside', spec: { kind: 'dimension', head1: 'triangle', head2: 'triangle', headSize: 4, width: 0.5, offset: 6, unit: 'mm', dec: 1 } },
  { tool: 'rect', title: 'Rectangle (R): drag a corner to the other (Shift: a square)', key: 'r', spec: { kind: 'rect' } },
  { tool: 'ellipse', title: 'Ellipse (E): drag its box (Shift: a circle)', key: 'e', spec: { kind: 'ellipse' } },
  { tool: 'polygon', title: 'Polygon (P): click its corners, double-click (or Enter) to close it', key: 'p', spec: { kind: 'polygon', closed: true, fill: '#56B4E9', fillOpacity: 0.3, color: '#0072B2' } },
  { tool: 'polyline', title: 'Polyline: click its points, double-click (or Enter) to end it', spec: { kind: 'polygon', closed: false } },
  { tool: 'star', title: 'Star or regular polygon: drag its box (Shift: as wide as high); which of the two, its points or sides: in its options (Variant)', spec: { kind: 'star', n: 5, inner: 0.382, fill: '#E69F00', fillOpacity: 1, width: 0.5 } },
  { tool: 'arc', title: 'Arc: drag the box of its ellipse (an open line; From, To in its options)', spec: { kind: 'arc', a1: 0, a2: 270 } },
  { tool: 'pie', title: 'Pie / donut: drag the box of its ellipse (Shift: a circle), a pie slice or a donut’s: in its options (Kind; the hole, rounded corners)', spec: { kind: 'arc', a1: 0, a2: 90, sector: true, fill: '#009E73', fillOpacity: 0.5, width: 0.5 } },
  { tool: 'bracket', title: 'Bracket: drag from one end to the other', spec: { kind: 'bracket', orient: 'free', bstyle: 'square', headSize: 4, text: '*' } },
  { tool: 'brace', title: 'Curly brace: drag from one end to the other', spec: { kind: 'bracket', orient: 'free', bstyle: 'curly', headSize: 6, text: '' } },
  { tool: 'callout', title: 'Callout: drag from the box of its text to the point it shows', spec: { kind: 'callout', text: 'Note', fill: '#ffffff', fillOpacity: 1, width: 0.5, head2: 'triangle', headSize: 4, pad: 2, radius: 2 } },
];
// the tools in groups, on the left (each group shows its last tool used; held, right-clicked or its small corner: all)
const TOOL_GROUPS: { name: string; tools: Tool[] }[] = [
  { name: 'Select', tools: ['select', 'corner'] },
  { name: 'Draw', tools: ['pen', 'pencil', 'builder'] },
  { name: 'Shapes', tools: ['rect', 'ellipse', 'polygon', 'polyline', 'star', 'arc', 'pie'] },
  { name: 'Lines and arrows', tools: ['line', 'arrow', 'double', 'curved', 'elbow', 'equilibrium', 'retro', 'dimension', 'bracket', 'brace'] },
  { name: 'Text', tools: ['text', 'callout'] },
  { name: 'Picture', tools: ['image'] },
];
const toolOf = (t: Tool) => TOOLS.find((x) => x.tool === t)!;
// a tool's name (its title up to its key) and what it does (after it)
const toolName = (t: Tool) => toolOf(t).title.split(/[:(]/)[0].trim();
const toolHint = (t: Tool) => {
  const s = toolOf(t).title;
  const k = s.indexOf(': ');
  return k >= 0 ? `${toolName(t)}: ${s.slice(k + 2)}` : s;
};
const OPS_TABS: [OpsPart, string, string][] = [
  ['style', 'Style', 'Its look: line, fill, heads, text; styles copied and saved, its colours'],
  ['arrange', 'Arrange', 'Its layer, pinned to the data, transformed (flipped, turned, scaled, skewed, isometric), the same ones selected, clipped, masked, grouped'],
  ['path', 'Path', 'Converted to paths, combined, offset, simplified, corners rounded, nodes added, removed, joined'],
  ['make', 'Make', 'Blends, components, copies in a grid, along a path or round a circle, bent along a path'],
];
const keep = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const store = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage unavailable: for this visit
  }
};
// a button opening a small menu under it (closed by a click elsewhere)
function Drop({ label, title, children }: { label: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <span className="de-drop" ref={ref}>
      <button className={`nodrag${open ? ' on' : ''}`} title={title} onClick={() => setOpen(!open)}>
        {label} <ChevronDown size={12} />
      </button>
      {open && <div className="de-drop-menu">{children}</div>}
    </span>
  );
}

// The cube of the isometric mode: its faces (click: the face new objects are drawn on; Shift + click: the objects
// selected put on it), Flat (drawn on the page), × (the mode off). The face chosen filled, the selection's outlined.
const CUBE: [IsoFace, string, Pt][] = [
  ['top', '45,8 77,26.5 45,45 13,26.5', [45, 28]],
  ['left', '13,26.5 45,45 45,82 13,63.5', [29, 57]],
  ['right', '45,45 77,26.5 77,63.5 45,82', [61, 57]],
];
function IsoCube({ plane, of, pick, close }: { plane: IsoFace | null; of: IsoFace | null; pick: (f: IsoFace | 'flat', put: boolean) => void; close: () => void }) {
  return (
    <div className="de-cube nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <svg width={90} height={90} viewBox="0 0 90 90" role="group" aria-label="Isometric faces">
        {CUBE.map(([f, pts, [tx, ty]]) => (
          <g key={f} className={`de-cube-face${plane === f ? ' on' : ''}${of === f ? ' of' : ''}`} onClick={(e) => pick(f, e.shiftKey)}>
            <title>{`${f[0].toUpperCase()}${f.slice(1)}: new objects drawn on this face (Shift + click: the objects selected put on it)`}</title>
            <polygon points={pts} />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle">
              {f[0].toUpperCase() + f.slice(1)}
            </text>
          </g>
        ))}
      </svg>
      <span className="row">
        <button className={`nodrag${plane ? '' : ' on'}`} title="Draw on the page, flat (Shift + click: the objects selected taken off their face)" onClick={(e) => pick('flat', e.shiftKey)}>
          Flat
        </button>
        <button className="nodrag" title="Leave the isometric mode (the objects on faces stay on them)" onClick={close}>
          <X size={13} />
        </button>
      </span>
    </div>
  );
}

const BOXED = new Set<Tool>(['rect', 'ellipse', 'star', 'regular', 'arc', 'pie']);
// the tools that draw on the face of the isometric mode (the others: on the page, flat)
const ON_FACE = new Set<Tool>([...BOXED, 'line', 'polygon', 'polyline', 'pen', 'pencil', 'text', 'image']);
// the tools that draw lines whose ends stick to the shapes they start or end on
const LINES = new Set<Tool>(['line', 'arrow', 'double', 'curved', 'elbow', 'equilibrium', 'retro']);
const lineLike = (it: AnnotationItem | undefined) => it?.type === 'shape' && ['line', 'arrow', 'dimension', 'bracket', 'scalebar', 'vline', 'hline'].includes(shapeSpec(it.spec).kind);
const ALIGN: [AlignHow, ToolIcon, string][] = [
  ['left', AlignStartVertical, 'Align the left edges'],
  ['hcenter', AlignCenterVertical, 'Align the middles across'],
  ['right', AlignEndVertical, 'Align the right edges'],
  ['top', AlignStartHorizontal, 'Align the tops'],
  ['vcenter', AlignCenterHorizontal, 'Align the middles down'],
  ['bottom', AlignEndHorizontal, 'Align the bottoms'],
];

const fresh = (it: AnnotationItem): AnnotationItem => ({ ...structuredClone(it), id: newAnnotation(it.type).id });
const nameOf = (it: AnnotationItem) => it.name || describe(it);

// the zoom steps (screen px per pt)
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

// under: a figure connected under the drawing (its page the drawing's): in the output already, or (a guide) drawn here
// beneath the page only
// pinShift: how far the objects pinned to the data of the figure under it are drawn moved (mm)
export function DrawingEditor({ id, data, fig: figIn, under, pinShift: pinIn, onClose, first }: { id: string; data: DrawingData; fig: Figure | undefined; under?: Figure; pinShift?: Record<string, [number, number]>; onClose: () => void; first?: string }) {
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  // while an object is dragged by a handle (turned, stretched, its corners rounded): its objects as they are now, drawn
  // here at once (the drawing's node gets them when the mouse is let go)
  const [draft, setDraft] = useState<AnnotationItem[] | null>(null);
  const items = useMemo(() => draft ?? data.annotations ?? [], [draft, data.annotations]);
  // the drawing as drawn, made here (not waiting for the evaluation of the whole graph)
  const live = useMemo(() => drawingView(id, draft ? { ...data, annotations: draft } : data, under ?? null), [id, data, draft, under]);
  const fig = 'errors' in live ? figIn : live.figure;
  const pinShift = 'errors' in live ? pinIn : live.pinShift;
  // the objects shown moved (a transform on them) until the drawing is drawn where they were dropped: no jump back
  const shownMoved = useRef<Element[]>([]);
  useLayoutEffect(() => {
    for (const el of shownMoved.current) el.removeAttribute('transform');
    shownMoved.current = [];
  }, [fig]);
  const grid: DrawingGrid = { ...DRAWING_GRID_DEFAULTS, ...data.grid };
  const set = (p: Partial<DrawingData>) => updateNodeData(id, p);
  const setItems = (annotations: AnnotationItem[]) => set({ annotations });
  const [sel, setSel] = useState<string[]>(first ? [first] : []);
  const [tool, setTool] = useState<Tool>('select');
  const [toPage, setToPage] = useState(false);
  // the page: the drawing's own, or the size of the figure under it
  const W = toPt(fig?.width ?? data.width, fig?.unit ?? data.unit);
  const H = toPt(fig?.height ?? data.height, fig?.unit ?? data.unit);
  const guide = !!under && data.under === 'guide';
  // the zoom: fitted to the room (null) or chosen
  const area = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 800, h: 600 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [zoomSet, setZoom] = useState<number | null>(null);
  const fit = Math.max(0.2, Math.min((room.w - 70) / (W || 1), (room.h - 70) / (H || 1)));
  const zoom = zoomSet ?? fit;
  const [dispW, dispH] = [W * zoom, H * zoom];
  const zoomBy = (f: number) => setZoom(Math.min(24, Math.max(0.2, zoom * f)));
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(24, Math.max(0.2, (z ?? fit) * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [fit]);

  // ---- the objects' boxes (pt), measured on the drawing once it is drawn ----
  const page = useRef<HTMLDivElement>(null);
  const svgOf = () => page.current?.querySelector<SVGSVGElement>('.drawing-figure svg') ?? null;
  const partOf = (k: string) => svgOf()?.querySelector<SVGGElement>(`[data-part="ann:${k}"]`) ?? null;
  const [measured, setMeasured] = useState<Record<string, Rect>>({});
  useLayoutEffect(() => {
    // the selected objects show their handles
    svgOf()
      ?.querySelectorAll('[data-part^="ann:"]')
      .forEach((el) => el.classList.toggle('is-selected', sel.includes(el.getAttribute('data-part')!.slice(4))));
    // their boxes, once drawn (not while a handle is dragged)
    if (draft) return;
    const frame = requestAnimationFrame(() => {
      const out: Record<string, Rect> = {};
      for (const it of items) {
        const body = partOf(it.id)?.querySelector<SVGGraphicsElement>('[data-body]');
        if (!body) continue;
        try {
          const b = body.getBBox();
          const iso = it.iso;
          if (iso) {
            const cs = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => isoToPage(iso, [x / MM, y / MM]));
            const [xs, ys] = [cs.map((q) => q[0] * MM), cs.map((q) => q[1] * MM)];
            out[it.id] = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          } else out[it.id] = { x: b.x, y: b.y, w: b.width, h: b.height };
        } catch {
          // not drawn yet
        }
      }
      setMeasured((m) => (JSON.stringify(m) === JSON.stringify(out) ? m : out));
    });
    return () => cancelAnimationFrame(frame);
  }, [fig, sel, items, draft]);
  // an object's box (pt): from its points when they give it, else as drawn — where it is drawn (pinned: moved with the data)
  const shiftMm = (it: AnnotationItem): [number, number] => pinShift?.[it.id] ?? [0, 0];
  const boxPt = (it: AnnotationItem): Rect | null => {
    const g = geomBox(it);
    const b = g ? { x: g.x * MM, y: g.y * MM, w: g.w * MM, h: g.h * MM } : (measured[it.id] ?? null);
    const [sx, sy] = shiftMm(it);
    return b && (sx || sy) ? { ...b, x: b.x + sx * MM, y: b.y + sy * MM } : b;
  };
  const boxMm = (it: AnnotationItem): Rect | null => {
    const b = boxPt(it);
    return b ? { x: b.x / MM, y: b.y / MM, w: b.w / MM, h: b.h / MM } : null;
  };
  const selected = items.filter((it) => sel.includes(it.id));
  const selSet = useMemo(() => new Set(sel), [sel]);
  const selBox = union(selected.map(boxMm).filter((b): b is Rect => !!b));

  // ---- snapping: the grid step (pt), how near counts (6 px), the edges and middles of the others and of the page ----
  const step = grid.snap && !grid.iso ? (grid.unit === 'pt' ? grid.step : grid.step * MM) : 0;
  // the isometric grid's points (pt): verticals a·cos 30° apart, a point every step down them, every other one moved
  // half a step
  const isoStep = grid.snap && grid.iso ? (grid.unit === 'pt' ? grid.step : grid.step * MM) : 0;
  const isoNear = (p: Pt): Pt => {
    const ax = isoStep * Math.cos(Math.PI / 6);
    const i0 = Math.round(p[0] / ax);
    let best: Pt = p;
    let bd = Infinity;
    for (const i of [i0 - 1, i0, i0 + 1]) {
      const off = (((i % 2) + 2) % 2) * (isoStep / 2);
      const q: Pt = [i * ax, Math.round((p[1] - off) / isoStep) * isoStep + off];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) [bd, best] = [d, q];
    }
    return best;
  };
  const tol = 6 / zoom;
  // ---- the isometric mode: the face new objects are drawn on (null: the page), the guides along the edges ----
  const isoM = data.isoMode ?? {};
  const isoOn = !!isoM.on;
  const plane: IsoFace | null = isoOn && isoM.plane && isoM.plane !== 'flat' ? isoM.plane : null;
  const setIso = (p: Partial<NonNullable<DrawingData['isoMode']>>) => set({ isoMode: { ...isoM, ...p } });
  const facePlace = (face: IsoFace, upright?: boolean): IsoPlace => ({ face, at: [0, 0], ...(upright ? { upright: true } : {}) });
  // a place on the page (pt) as a point of the face drawn on (mm), when the tool draws on it; else on the page (mm)
  const drawsOnFace = (t: Tool) => !!plane && ON_FACE.has(t);
  const mmAt = (t: Tool, q: Pt): Pt => (drawsOnFace(t) ? isoToFace(facePlace(plane!), [q[0] / MM, q[1] / MM]) : [q[0] / MM, q[1] / MM]);
  const placed = (t: Tool, it: AnnotationItem): AnnotationItem => (drawsOnFace(t) ? { ...it, iso: facePlace(plane!, it.type === 'text' && isoM.upright) } : it);
  // an object's own points (pt) and the page's, for the handles of an object on a face
  const toLocal = (iso: IsoPlace | undefined, q: Pt): Pt => {
    if (!iso) return q;
    const r = isoToFace(iso, [q[0] / MM, q[1] / MM]);
    return [r[0] * MM, r[1] * MM];
  };
  const fromLocal = (iso: IsoPlace | undefined, q: Pt): Pt => {
    if (!iso) return q;
    const r = isoToPage(iso, [q[0] / MM, q[1] / MM]);
    return [r[0] * MM, r[1] * MM];
  };
  const isoGuides = data.guides?.hidden ? [] : (data.guides?.iso ?? []);
  // the nearest point of the guides along the edges within tol of p (pt); null: none
  const onIsoGuide = (p: Pt): Pt | null => {
    let best: Pt | null = null;
    let bd = tol;
    for (const g of isoGuides) {
      const a = (g.deg * Math.PI) / 180;
      const [ux, uy] = [Math.cos(a), Math.sin(a)];
      const [ox, oy] = [g.at[0] * MM, g.at[1] * MM];
      const t = (p[0] - ox) * ux + (p[1] - oy) * uy;
      const q: Pt = [ox + t * ux, oy + t * uy];
      const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dd < bd) [bd, best] = [dd, q];
    }
    return best;
  };
  // the guides (pt), shown or not
  const guideXs = data.guides?.hidden ? [] : (data.guides?.x ?? []).map((v) => v * MM);
  const guideYs = data.guides?.hidden ? [] : (data.guides?.y ?? []).map((v) => v * MM);
  const targets = (skip: string[]) => {
    const xs = [0, W / 2, W, ...guideXs];
    const ys = [0, H / 2, H, ...guideYs];
    if (data.snapObjects !== false)
      for (const it of items) {
        if (it.hidden || skip.includes(it.id)) continue;
        const b = boxPt(it);
        if (!b) continue;
        xs.push(b.x, b.x + b.w / 2, b.x + b.w);
        ys.push(b.y, b.y + b.h / 2, b.y + b.h);
      }
    return { xs, ys };
  };
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  // the nodes of the other objects (pt): the ends and corners of their outlines, the corners and middles of their boxes
  const nodesOf = useMemo(() => {
    const out = new Map<string, Pt[]>();
    for (const it of items) {
      if (it.hidden) continue;
      const pts: Pt[] = [];
      const d = it.type === 'shape' ? pathOf(it) : null;
      if (d) for (const q of parsePath(d)) if (q.c !== 'Z' && q.p.length >= 2) pts.push([q.p[q.p.length - 2] * MM, q.p[q.p.length - 1] * MM]);
      out.set(it.id, pts);
    }
    return out;
  }, [items]);
  // the nearest node or crossing of the outlines of the others within tol of p (pt); null: none
  const snapNode = (p: Pt, skip: string[]): Pt | null => {
    if (data.snapNodes === false) return null;
    let best: Pt | null = null;
    let bd = tol;
    const near = items.filter((it) => {
      if (it.hidden || skip.includes(it.id)) return false;
      const b = boxPt(it);
      return !!b && p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
    });
    for (const it of near) {
      const b = boxPt(it)!;
      for (const q of [...(nodesOf.get(it.id) ?? []), [b.x + b.w / 2, b.y + b.h / 2] as Pt]) {
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (dd < bd) [bd, best] = [dd, q];
      }
    }
    if (best) return best;
    // where two outlines cross near it (their pieces within tol of the point)
    const pieces: [Pt, Pt][] = [];
    for (const it of near) {
      const d = it.type === 'shape' ? pathOf(it) : null;
      if (!d) continue;
      for (const l of pathPolylines(parsePath(d), 8))
        for (let k = 1; k < l.length; k++) {
          const [a, c] = [[l[k - 1][0] * MM, l[k - 1][1] * MM] as Pt, [l[k][0] * MM, l[k][1] * MM] as Pt];
          if (Math.min(a[0], c[0]) - tol <= p[0] && Math.max(a[0], c[0]) + tol >= p[0] && Math.min(a[1], c[1]) - tol <= p[1] && Math.max(a[1], c[1]) + tol >= p[1]) pieces.push([a, c]);
        }
    }
    for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++) {
        const [[a, b2], [c, d2]] = [pieces[i], pieces[j]];
        const den = (b2[0] - a[0]) * (d2[1] - c[1]) - (b2[1] - a[1]) * (d2[0] - c[0]);
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c[0] - a[0]) * (d2[1] - c[1]) - (c[1] - a[1]) * (d2[0] - c[0])) / den;
        const u = ((c[0] - a[0]) * (b2[1] - a[1]) - (c[1] - a[1]) * (b2[0] - a[0])) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const q: Pt = [a[0] + t * (b2[0] - a[0]), a[1] + t * (b2[1] - a[1])];
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (dd < bd) [bd, best] = [dd, q];
      }
    return best;
  };
  const snapPoint = (p: Pt, skip: string[], free: boolean): Pt => {
    if (free) return p;
    const n = snapNode(p, skip) ?? onIsoGuide(p);
    if (n) {
      setGuides({ x: n[0], y: n[1] });
      return n;
    }
    if (isoStep > 0) {
      setGuides({ x: null, y: null });
      return isoNear(p);
    }
    const t = targets(skip);
    const sx = snapAxis([p[0]], t.xs, step, tol);
    const sy = snapAxis([p[1]], t.ys, step, tol);
    setGuides({ x: sx.guide, y: sy.guide });
    return [p[0] + sx.d, p[1] + sy.d];
  };

  // ---- the mouse on the page ----
  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = page.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [preview, setPreview] = useState<{ a: Pt; b: Pt } | null>(null);
  const [poly, setPoly] = useState<Pt[]>([]);
  // the pen's nodes so far (pt): their point, the controls of their curve in and out
  const [pen, setPen] = useState<{ p: Pt; cin?: Pt; cout?: Pt }[]>([]);
  // the nodes picked on the path selected (a click on a node; Shift: more): its corners rounded or cut alone
  const [picked, setPicked] = useState<{ item: string; nodes: number[] } | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  // the pencil's line while drawn (pt)
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  // the shape builder: the parts the shapes selected make (mm), those to join, those taken away
  const [builder, setBuilder] = useState<{ from: string[]; parts: string[]; join: number[]; drop: number[] } | null>(null);
  const startBuilder = () => {
    const shapes = items.filter((it) => sel.includes(it.id) && it.type === 'shape' && !it.locked && (() => {
      const d = pathOf(it);
      return !!d && isClosed(parsePath(d));
    })());
    if (shapes.length < 2) {
      notify('Shape builder: select two or more closed shapes first (they overlap, their parts are made from them).');
      setTool('select');
      return;
    }
    void regionsOf(shapes.map((it) => pathOf(it)!)).then(
      (parts) => setBuilder({ from: shapes.map((it) => it.id), parts, join: [], drop: [] }),
      (err: Error) => notify(`Shape builder: ${err.message}`),
    );
  };
  // applied: the parts joined one shape, the others kept but those taken away, in the look of the back shape, where it was
  const applyBuilder = async () => {
    if (!builder) return;
    const back = items.find((it) => builder.from.includes(it.id));
    const base = back ? toPathItem(bakeIso(back)) : null;
    if (!base || base.type !== 'shape') return setBuilder(null);
    const joined = builder.join.length > 1 ? await combine(builder.join.map((k) => builder.parts[k]), 'unite') : builder.join.map((k) => builder.parts[k]);
    const kept = builder.parts.filter((_, k) => !builder.join.includes(k) && !builder.drop.includes(k));
    const made = [...joined, ...kept].map((d, k) => ({ ...base, id: k ? newAnnotation('shape').id : base.id, name: undefined, spec: { ...base.spec, d, head1: 'none', head2: 'none' } }) as AnnotationItem);
    const at = items.findIndex((it) => builder.from.includes(it.id));
    const rest = items.filter((it) => !builder.from.includes(it.id));
    const k0 = items.slice(0, at).filter((it) => !builder.from.includes(it.id)).length;
    setItems([...rest.slice(0, k0), ...made, ...rest.slice(k0)]);
    setSel(made.map((it) => it.id));
    setBuilder(null);
    setTool('select');
  };
  useEffect(() => {
    if (tool === 'builder' && !builder) startBuilder();
    if (tool !== 'builder' && builder) setBuilder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  const follow = (move: (e: PointerEvent) => void, up: (e: PointerEvent) => void) => {
    const mv = (e: PointerEvent) => move(e);
    const u = (e: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', u);
      setGuides({ x: null, y: null });
      up(e);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', u);
  };
  const add = (list: AnnotationItem[]) => {
    setItems([...items, ...list]);
    setSel(list.map((it) => it.id));
  };
  const create = (t: Tool, a: Pt, b: Pt, stick: { from?: string; to?: string } = {}) => {
    const spec = TOOLS.find((x) => x.tool === t)?.spec ?? {};
    const [x1, y1, x2, y2] = [...mmAt(t, a), ...mmAt(t, b)].map((v) => +v.toFixed(3));
    const it = newAnnotation('shape', { coords: 'data', ...spec, x1, y1, x2, y2, ...stick });
    add([placed(t, it)]);
  };
  // the shape (or text) under a place on the screen that a line's end sticks to — not a line itself, nor `skip`
  const stuckAt = (cx: number, cy: number, skip?: string): string | undefined => {
    for (const el of document.elementsFromPoint(cx, cy)) {
      if (!page.current?.contains(el)) continue;
      const part = el.closest('[data-part^="ann:"]');
      const k = part?.getAttribute('data-part')?.slice(4);
      const it = k ? items.find((x) => x.id === k) : undefined;
      if (it && it.id !== skip && !lineLike(it)) return it.id;
    }
    // inside a shape not filled: the front one whose box holds the place
    const [x, y] = at({ clientX: cx, clientY: cy });
    return items
      .slice()
      .reverse()
      .find((it) => {
        const b = !it.hidden && it.id !== skip && !lineLike(it) ? boxPt(it) : null;
        return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      })?.id;
  };
  // a line's end by 15° steps, a box made square (Shift)
  const constrain = (t: Tool, a: Pt, b: Pt): Pt => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    if (BOXED.has(t)) {
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      return [a[0] + Math.sign(dx || 1) * s, a[1] + Math.sign(dy || 1) * s];
    }
    const len = Math.hypot(dx, dy);
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)];
  };

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    root.current?.focus();
    const p0 = at(e);
    const free = e.altKey;
    // (Shift: the next point by 15° steps from the last one)
    const byAngle = (q: Pt, last: Pt | undefined): Pt => {
      if (!e.shiftKey || !last) return q;
      const len = Math.hypot(q[0] - last[0], q[1] - last[1]);
      const ang = Math.round(Math.atan2(q[1] - last[1], q[0] - last[0]) / (Math.PI / 12)) * (Math.PI / 12);
      return [last[0] + len * Math.cos(ang), last[1] + len * Math.sin(ang)];
    };
    if (tool === 'polygon' || tool === 'polyline') {
      setPoly((q) => [...q, byAngle(snapPoint(p0, [], free), q[q.length - 1])]);
      return;
    }
    if (tool === 'pen') {
      const q = byAngle(snapPoint(p0, [], free), pen[pen.length - 1]?.p);
      // on the first node: the path closed
      if (pen.length >= 2 && Math.hypot(q[0] - pen[0].p[0], q[1] - pen[0].p[1]) * zoom < 7) return finishPen(true);
      setPen((l) => [...l, { p: q }]);
      // dragged: a smooth node, its controls either side
      follow(
        (ev) => {
          const r = at(ev);
          if (Math.hypot(r[0] - q[0], r[1] - q[1]) * zoom < 3) return;
          setPen((l) => [...l.slice(0, -1), { p: q, cout: r, cin: [2 * q[0] - r[0], 2 * q[1] - r[1]] }]);
        },
        () => {},
      );
      return;
    }
    if (tool === 'image' || tool === 'builder') return;
    if (tool === 'pencil') {
      const pts: Pt[] = [p0];
      setStroke(pts);
      follow(
        (ev) => {
          const q = at(ev);
          const last = pts[pts.length - 1];
          if (Math.hypot(q[0] - last[0], q[1] - last[1]) * zoom < 1.5) return;
          pts.push(q);
          setStroke([...pts]);
        },
        () => {
          setStroke(null);
          if (pts.length < 2) return;
          // (back near its start: closed)
          const closed = pts.length > 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) * zoom < 10;
          const raw = `M${pts.map((q) => mmAt('pencil', q).map((v) => +v.toFixed(3)).join(',')).join('L')}${closed ? 'Z' : ''}`;
          const d = simplifyPath(raw, Math.max(0.05, 1.2 / zoom / MM), true);
          add([placed('pencil', newAnnotation('shape', { kind: 'path', coords: 'data', d, head1: 'none', head2: 'none', fill: '', width: 1 }))]);
        },
      );
      return;
    }
    if (tool === 'corner') {
      const it = sel.length === 1 ? items.find((x) => x.id === sel[0]) : undefined;
      const nodes = it ? cornerNodes(it) : [];
      const near = nodes.find((q) => Math.hypot(q.p[0] - p0[0], q.p[1] - p0[1]) * zoom < 8);
      if (it && near) {
        const had = picked?.item === it.id ? picked.nodes : [];
        const list = e.shiftKey ? (had.includes(near.i) ? had.filter((x) => x !== near.i) : [...had, near.i]) : had.includes(near.i) ? had : [near.i];
        setPicked({ item: it.id, nodes: list });
        // dragged inward (along the middle of its corner): its radius grows by as much
        const k = nodes.indexOf(near);
        const [a, b] = [nodes[(k - 1 + nodes.length) % nodes.length].p, nodes[(k + 1) % nodes.length].p];
        const unit = (q: Pt): Pt => {
          const l = Math.hypot(q[0] - near.p[0], q[1] - near.p[1]) || 1;
          return [(q[0] - near.p[0]) / l, (q[1] - near.p[1]) / l];
        };
        const [ua, ub] = [unit(a), unit(b)];
        const bl = Math.hypot(ua[0] + ub[0], ua[1] + ub[1]) || 1;
        const bis: Pt = [(ua[0] + ub[0]) / bl, (ua[1] + ub[1]) / bl];
        const r0 = radiusAt(it, near.i);
        let done: AnnotationItem[] | null = null;
        follow(
          (ev) => {
            const q = at(ev);
            const r = Math.max(0, r0 + (q[0] - p0[0]) * bis[0] + (q[1] - p0[1]) * bis[1]);
            done = items.map((x) => (x.id === it.id ? withRadius(x, list, +r.toFixed(2)) : x));
            setDraft(done);
          },
          () => {
            if (done) setItems(done);
            setDraft(null);
          },
        );
        return;
      }
      // elsewhere: the shape under the mouse selected
      const part = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest('[data-part^="ann:"]')).find((x) => x && page.current?.contains(x));
      const hitId = part?.getAttribute('data-part')?.slice(4);
      setSel(hitId && items.some((x) => x.id === hitId) ? [hitId] : []);
      setPicked(null);
      return;
    }
    if (tool === 'text') {
      const q = snapPoint(p0, [], free);
      const [tx, ty] = mmAt('text', q);
      add([placed('text', newAnnotation('text', { coords: 'data', x: +tx.toFixed(3), y: +ty.toFixed(3), anchor: 'tl' }))]);
      setTool('select');
      return;
    }
    if (tool !== 'select') {
      const a = snapPoint(p0, [], free);
      // a line started on a shape: stuck to it
      const from = LINES.has(tool) ? stuckAt(e.clientX, e.clientY) : undefined;
      setPreview({ a, b: a });
      let b = a;
      follow(
        (ev) => {
          b = snapPoint(at(ev), [], ev.altKey);
          if (ev.shiftKey) b = constrain(tool, a, b);
          setPreview({ a, b });
        },
        (ev) => {
          setPreview(null);
          // a click without a drag: a shape of a usual size there
          const small = Math.hypot(b[0] - a[0], b[1] - a[1]) * zoom < 4;
          const end: Pt = small ? (BOXED.has(tool) || tool === 'callout' ? [a[0] + 20 * MM, a[1] + 14 * MM] : [a[0] + 20 * MM, a[1]]) : b;
          // ended on a shape (another one): stuck to it too
          const to = LINES.has(tool) && !small ? stuckAt(ev.clientX, ev.clientY) : undefined;
          create(tool, a, end, { ...(from ? { from } : {}), ...(to && to !== from ? { to } : {}) });
          setTool('select');
        },
      );
      return;
    }
    // select: what is under the mouse — an object (its body: move it with the others selected; a handle: that point);
    // a thin line found a few px away too
    const under = (target: Element | null) => {
      let el = target;
      let dragEl: Element | null = null;
      while (el && el !== page.current) {
        if (!dragEl && (el as unknown as { __drag?: DragInfo }).__drag) dragEl = el;
        if (el.getAttribute?.('data-part')?.startsWith('ann:')) return { partEl: el, dragEl };
        el = el.parentElement;
      }
      return null;
    };
    let found = under(e.target as Element);
    for (const r of [2, 4, 6])
      for (let k = 0; k < 8 && !found; k++) {
        const t = document.elementFromPoint(e.clientX + r * Math.cos((k * Math.PI) / 4), e.clientY + r * Math.sin((k * Math.PI) / 4));
        if (t && page.current?.contains(t)) found = under(t);
      }
    const partEl = found?.partEl ?? null;
    const dragEl = found?.dragEl ?? null;
    const hit = partEl ? items.find((it) => it.id === partEl.getAttribute('data-part')!.slice(4)) : undefined;
    if (!hit || hit.locked) {
      // a box around the objects to select
      const keep = e.shiftKey || e.ctrlKey || e.metaKey ? sel : [];
      if (!keep.length) setSel([]);
      follow(
        (ev) => {
          const b = at(ev);
          setMarquee({ x: Math.min(p0[0], b[0]), y: Math.min(p0[1], b[1]), w: Math.abs(b[0] - p0[0]), h: Math.abs(b[1] - p0[1]) });
        },
        (ev) => {
          const b = at(ev);
          const r = { x: Math.min(p0[0], b[0]), y: Math.min(p0[1], b[1]), w: Math.abs(b[0] - p0[0]), h: Math.abs(b[1] - p0[1]) };
          setMarquee(null);
          if (r.w * zoom < 3 && r.h * zoom < 3) return;
          const inside = items.filter((it) => {
            const q = boxPt(it);
            return !it.hidden && !it.locked && q && q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y;
          });
          setSel([...new Set([...keep, ...inside.map((it) => it.id)])]);
        },
      );
      return;
    }
    e.preventDefault();
    // a path's node, Alt + click: smooth ↔ corner
    const anchor = (e.target as Element).closest?.('[data-anchor]');
    if (anchor && e.altKey && hit.type === 'shape' && hit.spec.kind === 'path') {
      setSpec(hit.id, { d: pathText(toggleNode(parsePath(hit.spec.d), Number(anchor.getAttribute('data-anchor')))) });
      return;
    }
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    // an object of a group: the whole group (Alt: that one)
    const groupOf = (it: AnnotationItem) => (it.group && !e.altKey ? items.filter((x) => x.group === it.group).map((x) => x.id) : [it.id]);
    if (multi && sel.includes(hit.id)) {
      const g = groupOf(hit);
      setSel(sel.filter((x) => !g.includes(x)));
      return;
    }
    const ids = multi ? [...new Set([...sel, ...groupOf(hit)])] : sel.includes(hit.id) ? sel : groupOf(hit);
    setSel(ids);
    const handle = dragEl && dragEl !== partEl!.firstElementChild ? dragEl : null;
    if (handle) {
      // a handle: its point snapped, the object changed as it goes (from what it was)
      const info = (handle as unknown as { __drag: DragInfo }).__drag;
      const hb = (handle as SVGGraphicsElement).getBBox();
      const h0: Pt = [hb.x + hb.width / 2, hb.y + hb.height / 2];
      const turning = !!info.transform;
      const node0 = getNode(id)?.data as Record<string, unknown> | undefined;
      if (!node0) return;
      // a line's end: unstuck while it is dragged, stuck again to the shape it is dropped on
      const drawn = fig?.axes[0]?.annotations.find((a) => a.owner?.field === 'annotations' && a.owner.item === hit.id);
      const sh = drawn?.kind === 'shape' && (drawn.shape.kind === 'line' || drawn.shape.kind === 'arrow') ? drawn.shape : null;
      const near = (x: number, y: number) => Math.hypot(x * MM - h0[0], y * MM - h0[1]) < 1.5;
      const end = sh ? (near(sh.x1, sh.y1) ? 'from' : near(sh.x2, sh.y2) ? 'to' : null) : null;
      const data0 = end ? { ...node0, annotations: (node0.annotations as AnnotationItem[]).map((it) => (it.id === hit.id ? ({ ...it, spec: { ...it.spec, [end]: undefined } } as AnnotationItem) : it)) } : node0;
      let frame = 0;
      let last: [number, number, boolean] = [0, 0, false];
      let dragged = false;
      const anchorAt = handle.querySelector('[data-anchor]')?.getAttribute('data-anchor');
      // (on a face: the mouse in the face's own points, snapped on the page)
      const hIso = hit.iso;
      const l0 = toLocal(hIso, p0);
      follow(
        (ev) => {
          const pg = at(ev);
          if (!dragged && Math.hypot(pg[0] - p0[0], pg[1] - p0[1]) * zoom < 2) return;
          dragged = true;
          const p = toLocal(hIso, pg);
          let q: Pt = [h0[0] + p[0] - l0[0], h0[1] + p[1] - l0[1]];
          if (!turning) q = toLocal(hIso, snapPoint(fromLocal(hIso, q), [hit.id], ev.altKey));
          last = [q[0] - h0[0], q[1] - h0[1], ev.shiftKey];
          dragKeys.ctrl = ev.ctrlKey || ev.metaKey;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const patch = tidy(info.apply(last[0], last[1], data0, last[2]), hit.id);
            if (patch.annotations) setDraft(patch.annotations as AnnotationItem[]);
            else updateNodeData(id, patch);
          });
        },
        (ev) => {
          cancelAnimationFrame(frame);
          dragKeys.ctrl = ev.ctrlKey || ev.metaKey;
          // a click on a path's node: picked (Shift: one more, or one less)
          if (!dragged && anchorAt != null) {
            const n = Number(anchorAt);
            const had = picked?.item === hit.id ? picked.nodes : [];
            setPicked({ item: hit.id, nodes: ev.shiftKey ? (had.includes(n) ? had.filter((x) => x !== n) : [...had, n]) : had.length === 1 && had[0] === n ? [] : [n] });
            return;
          }
          // the last move (its frame cancelled above) kept
          setDraft(null);
          if (!end) {
            if (dragged) updateNodeData(id, tidy(info.apply(last[0], last[1], data0, last[2]), hit.id));
            return;
          }
          const target = stuckAt(ev.clientX, ev.clientY, hit.id);
          const patch = tidy(info.apply(last[0], last[1], data0, last[2]), hit.id);
          updateNodeData(id, { ...patch, annotations: (patch.annotations as AnnotationItem[]).map((it) => (it.id === hit.id ? ({ ...it, spec: { ...it.spec, [end]: target } } as AnnotationItem) : it)) });
        },
      );
      return;
    }
    // the body: every object selected moves, their box snapped (Alt: not)
    const moving = items.filter((it) => ids.includes(it.id) && !it.locked);
    const b0 = union(moving.map(boxPt).filter((b): b is Rect => !!b));
    const els = moving.flatMap((it) => Array.from(svgOf()?.querySelectorAll<SVGGElement>(`[data-part="ann:${it.id}"]`) ?? []).map((el) => ({ el, iso: it.iso })));
    const t = targets(moving.map((it) => it.id));
    let d: Pt = [0, 0];
    let started = false;
    follow(
      (ev) => {
        const p = at(ev);
        let [dx, dy] = [p[0] - p0[0], p[1] - p0[1]];
        if (!started && Math.hypot(dx, dy) * zoom < 3) return;
        started = true;
        if (b0 && !ev.altKey) {
          const sx = snapAxis([b0.x + dx, b0.x + b0.w / 2 + dx, b0.x + b0.w + dx], t.xs, step, tol);
          const sy = snapAxis([b0.y + dy, b0.y + b0.h / 2 + dy, b0.y + b0.h + dy], t.ys, step, tol);
          dx += sx.d;
          dy += sy.d;
          setGuides({ x: sx.guide, y: sy.guide });
        } else setGuides({ x: null, y: null });
        d = [dx, dy];
        for (const g of els) {
          const [ex, ey] = g.iso ? toLocal({ ...g.iso, at: [0, 0] }, [dx, dy]) : [dx, dy];
          g.el.setAttribute('transform', `translate(${ex.toFixed(3)} ${ey.toFixed(3)})`);
        }
      },
      () => {
        if (!started) {
          for (const g of els) g.el.removeAttribute('transform');
          return;
        }
        // (kept moved until the drawing is drawn there)
        shownMoved.current = els.map((g) => g.el);
        const [mx, my] = [d[0] / MM, d[1] / MM];
        setItems(items.map((it) => (moving.some((m) => m.id === it.id) ? moveItem(it, mx, my) : it)));
      },
    );
  };
  // a handle's patch: the object's places on the grid when they are a hair from it (the handles are drawn rounded), else
  // to a µm
  const tidy = (patch: Record<string, unknown>, k: string) => {
    const list = patch.annotations as AnnotationItem[] | undefined;
    if (!list) return patch;
    const g = gridMm > 0 ? gridMm : 0;
    const clean = (v: unknown) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return v;
      const q = g ? Math.round(v / g) * g : v;
      return +(Math.abs(q - v) < 0.005 ? q : v).toFixed(3);
    };
    return {
      ...patch,
      annotations: list.map((it) => {
        if (it.id !== k) return it;
        const spec = { ...it.spec } as Record<string, unknown>;
        for (const f of ['x1', 'y1', 'x2', 'y2', 'x', 'y']) if (f in spec) spec[f] = clean(spec[f]);
        return { ...it, spec } as AnnotationItem;
      }),
    };
  };
  // the pen's path (mm): straight pieces, or curves where a node has controls; closed back to its first node
  const finishPen = (close: boolean) => {
    const nodes = pen.filter((q, k) => k === 0 || Math.hypot(q.p[0] - pen[k - 1].p[0], q.p[1] - pen[k - 1].p[1]) * zoom > 2);
    const mm = (q: Pt) => mmAt('pen', q);
    const piece = (a: (typeof nodes)[number], b: (typeof nodes)[number]) => (a.cout || b.cin ? { c: 'C' as const, p: [...mm(a.cout ?? a.p), ...mm(b.cin ?? b.p), ...mm(b.p)] } : { c: 'L' as const, p: mm(b.p) });
    if (nodes.length >= 2) {
      const segs = [{ c: 'M' as const, p: mm(nodes[0].p) }, ...nodes.slice(1).map((b, k) => piece(nodes[k], b))];
      if (close && nodes.length > 2) segs.push(piece(nodes[nodes.length - 1], nodes[0]), { c: 'Z' as const, p: [] } as never);
      add([placed('pen', newAnnotation('shape', { kind: 'path', coords: 'data', d: pathText(segs), head1: 'none', head2: 'none', ...(close ? { fill: '#56B4E9', fillOpacity: 0.3, color: '#0072B2' } : {}) }))]);
    }
    setPen([]);
    setTool('select');
  };
  // the corners of a shape (pt, where it is drawn) and their numbers — of its outline as a path, without its rounding
  const cornerNodes = (it: AnnotationItem): { i: number; p: Pt }[] => {
    if (it.type !== 'shape') return [];
    const s = shapeSpec(it.spec);
    if (s.kind !== 'rect' && !CORNERED.has(s.kind)) return [];
    const d = shapeToPath({ ...s, coords: 'data', corners: undefined, radii: undefined, radius: 0 }, MM);
    const segs = parsePath(d ?? '');
    const [hx, hy] = shiftMm(it);
    const out: { i: number; p: Pt }[] = [];
    segs.forEach((q, i) => {
      if (q.c === 'Z') return;
      const p: Pt = [q.p[q.p.length - 2], q.p[q.p.length - 1]];
      // a closed outline's last node back on its first: one corner
      if (segs[i + 1]?.c === 'Z' && out.length && Math.hypot(p[0] - out[0].p[0] / MM + hx, p[1] - out[0].p[1] / MM + hy) < 1e-6) return;
      const r = it.iso ? isoToPage(it.iso, p) : p;
      out.push({ i, p: [(r[0] + hx) * MM, (r[1] + hy) * MM] });
    });
    return out;
  };
  const radiusAt = (it: AnnotationItem, i: number): number => {
    if (it.type !== 'shape') return 0;
    const s = shapeSpec(it.spec);
    if (s.kind === 'rect') return radiiOf(s.radii)?.[i] ?? s.radius ?? 0;
    const c = cornersOf(s.corners);
    return c.each.get(i) ?? c.all;
  };
  const withRadius = (it: AnnotationItem, nodes: number[], r: number): AnnotationItem => {
    if (it.type !== 'shape') return it;
    const s = shapeSpec(it.spec);
    if (s.kind === 'rect') {
      const radii = radiiOf(s.radii) ?? Array(4).fill(s.radius ?? 0);
      for (const i of nodes) if (i >= 0 && i < 4) radii[i] = r;
      return { ...it, spec: { ...it.spec, radii: radii.join(' ') } } as AnnotationItem;
    }
    const c = cornersOf(s.corners);
    for (const i of nodes) c.each.set(i, r);
    return { ...it, spec: { ...it.spec, corners: cornersText(c.all, c.each) } } as AnnotationItem;
  };
  // a picture placed in the middle of the page (40 mm wide at most), its proportions kept
  const addImage = async (file: File) => {
    if (file.size > 3e6 && !(await ask(`${file.name} is ${(file.size / 1e6).toFixed(1)} MB: it goes into the project (and its files). Place it anyway?`, { ok: 'Place it' }))) return;
    void imageUrl(file).then((href) => {
      const img = new Image();
      const place = (nw: number, nh: number) => {
        const w = Math.min(40, (W / MM) * 0.6);
        const h = nw > 0 && nh > 0 ? (w * nh) / nw : w * 0.75;
        const [x, y] = [(W / MM - w) / 2, (H / MM - h) / 2];
        add([newAnnotation('shape', { kind: 'image', coords: 'data', href, x1: +x.toFixed(2), y1: +y.toFixed(2), x2: +(x + w).toFixed(2), y2: +(y + h).toFixed(2), width: 0, head1: 'none', head2: 'none' })]);
      };
      img.onload = () => place(img.naturalWidth, img.naturalHeight);
      img.onerror = () => place(0, 0);
      img.src = href;
    }, (e: Error) => notify(`${file.name}: ${e.message}`));
  };
  const pickImage = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = IMAGE_ACCEPT;
    inp.onchange = () => inp.files?.[0] && addImage(inp.files[0]);
    inp.click();
  };
  // ---- the right-click menu: what can be done with the object under the mouse (selected), or on the empty page ----
  const [menu, setMenu] = useState<{ x: number; y: number; item: string | null; w: number; h: number } | null>(null);
  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const part = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest('[data-part^="ann:"]')).find((x) => x && page.current?.contains(x));
    const k = part?.getAttribute('data-part')?.slice(4);
    const hitIt = k ? items.find((x) => x.id === k) : undefined;
    if (hitIt && !sel.includes(hitIt.id)) setSel(hitIt.group ? items.filter((x) => x.group === hitIt.group).map((x) => x.id) : [hitIt.id]);
    const r = root.current?.getBoundingClientRect();
    setMenu({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), item: hitIt?.id ?? null, w: r?.width ?? 9999, h: r?.height ?? 9999 });
  };
  const paste = () => {
    if (copiedItems().length) add(copiedItems().map((it) => moveItem(fresh(it), 2, 2)));
  };
  const menuItems = (): ([string, () => void, string?] | null)[] => {
    if (!menu) return [];
    if (!menu.item)
      return [
        ...TOOLS.filter((t) => t.tool !== 'select' && t.tool !== 'corner').map((t): [string, () => void] => [`Add: ${t.title.split(/[:(—]/)[0].trim()}`, () => (t.tool === 'image' ? pickImage() : setTool(t.tool))]),
        null,
        ['Paste', paste, 'Ctrl+V'],
        ['Select all', () => setSel(items.filter((it) => !it.hidden && !it.locked).map((it) => it.id)), 'Ctrl+A'],
      ];
    const shapes = selected.filter((it) => it.type === 'shape');
    return [
      ['Duplicate', duplicate, 'Ctrl+D'],
      ['Copy', () => copyItems(selected), 'Ctrl+C'],
      ['Cut', () => (copyItems(selected), remove()), 'Ctrl+X'],
      ['Paste', paste, 'Ctrl+V'],
      null,
      ['Bring to the front', () => reorder('front')],
      ['One step forward', () => reorder('up')],
      ['One step back', () => reorder('down')],
      ['Send to the back', () => reorder('back')],
      null,
      ...(selected.length > 1 ? [['Group', () => setItems(groupItems(items, sel)), 'Ctrl+G'] as [string, () => void, string]] : []),
      ...(selected.some((it) => it.group) ? [['Ungroup', () => setItems(ungroupItems(items, sel)), 'Ctrl+Shift+G'] as [string, () => void, string]] : []),
      [selected.every((it) => it.locked) ? 'Unlock' : 'Lock', () => setItems(items.map((it) => (sel.includes(it.id) ? { ...it, locked: selected.every((x) => x.locked) ? undefined : true } : it)))],
      ['Hide', () => setItems(items.map((it) => (sel.includes(it.id) ? { ...it, hidden: true } : it)))],
      ...(shapes.some((it) => it.type === 'shape' && it.spec.kind !== 'path' && it.spec.kind !== 'component' && it.spec.kind !== 'image')
        ? [['Convert to path', () => setItems(items.map((it) => (sel.includes(it.id) ? (toPathItem(it) ?? it) : it)))] as [string, () => void]]
        : []),
      ...(under && !guide
        ? [[selected.every((it) => it.behind) ? 'In front of the data' : 'Behind the data', () => setItems(items.map((it) => (sel.includes(it.id) ? { ...it, behind: selected.every((x) => x.behind) ? undefined : true } : it)))] as [string, () => void]]
        : []),
      ...(mapping ? [[pinnedAll ? 'Unpin from the data' : 'Pin to the data', () => setPinned(!pinnedAll)] as [string, () => void]] : []),
      null,
      ['Delete', remove, 'Delete'],
    ];
  };
  // a double-click on the page: ends the pen or the polygon; on a path's node: removes it; on a path selected: a node
  // there; on an object of a group: that object alone
  const dbl = (e: React.MouseEvent) => {
    if (pen.length) return finishPen(false);
    if (poly.length) return finishPoly();
    const anchor = (e.target as Element).closest?.('[data-anchor]');
    const part = (e.target as Element).closest?.('[data-part^="ann:"]');
    const it = part ? items.find((x) => x.id === part.getAttribute('data-part')!.slice(4)) : undefined;
    if (!it) return;
    if (it.type === 'shape' && it.spec.kind === 'path' && sel.length === 1 && sel[0] === it.id) {
      const segs = parsePath(it.spec.d);
      const p = toLocal(it.iso, at(e));
      setSpec(it.id, { d: pathText(anchor ? deleteNode(segs, Number(anchor.getAttribute('data-anchor'))) : insertNode(segs, [p[0] / MM, p[1] / MM])) });
      setPicked(null);
      return;
    }
    if (it.group) setSel([it.id]);
  };
  const finishPoly = () => {
    // the clicks of the double-click that ends it: one point
    const pts = poly.filter((p, k) => k === 0 || Math.hypot(p[0] - poly[k - 1][0], p[1] - poly[k - 1][1]) * zoom > 2);
    if (pts.length >= 2) {
      const spec = TOOLS.find((x) => x.tool === tool)?.spec ?? {};
      const points = pts.map((q) => mmAt(tool, q).map((v) => +v.toFixed(3)).join(' ')).join('; ');
      add([placed(tool, newAnnotation('shape', { coords: 'data', ...spec, points, closed: tool === 'polygon' && pts.length > 2 }))]);
    }
    setPoly([]);
    setTool('select');
  };

  // ---- the selection: moved, aligned, spread, ordered, copied, removed ----
  // (in the isometric mode, an object on a face along the face's own edges)
  const moveSel = (dx: number, dy: number) =>
    setItems(
      items.map((it) => {
        if (!sel.includes(it.id) || it.locked) return it;
        const [mx, my] = it.iso && isoOn ? isoDeltaToPage(it.iso.face, [dx, dy]) : [dx, dy];
        return moveItem(it, mx, my);
      }),
    );
  const align = (how: AlignHow) => {
    const list = selected.filter((it) => !it.locked);
    const boxes = list.map(boxMm);
    if (boxes.some((b) => !b) || !list.length) return;
    const moves = alignMoves(boxes as Rect[], how, toPage || list.length === 1 ? { x: 0, y: 0, w: W / MM, h: H / MM } : undefined);
    setItems(items.map((it) => {
      const k = list.indexOf(it);
      return k < 0 ? it : moveItem(it, moves[k][0], moves[k][1]);
    }));
  };
  const distribute = (dir: 'h' | 'v') => {
    const list = selected.filter((it) => !it.locked);
    const boxes = list.map(boxMm);
    if (boxes.some((b) => !b) || list.length < 3) return;
    const moves = distributeMoves(boxes as Rect[], dir);
    setItems(items.map((it) => {
      const k = list.indexOf(it);
      return k < 0 ? it : moveItem(it, moves[k][0], moves[k][1]);
    }));
  };
  // the order (layers): to the front / back, one step up / down
  const reorder = (how: 'front' | 'back' | 'up' | 'down') => {
    if (!sel.length) return;
    const on = (it: AnnotationItem) => sel.includes(it.id);
    if (how === 'front') return setItems([...items.filter((it) => !on(it)), ...items.filter(on)]);
    if (how === 'back') return setItems([...items.filter(on), ...items.filter((it) => !on(it))]);
    const list = items.slice();
    if (how === 'up') {
      for (let k = list.length - 2; k >= 0; k--) if (on(list[k]) && !on(list[k + 1])) [list[k], list[k + 1]] = [list[k + 1], list[k]];
    } else for (let k = 1; k < list.length; k++) if (on(list[k]) && !on(list[k - 1])) [list[k], list[k - 1]] = [list[k - 1], list[k]];
    setItems(list);
  };
  const duplicate = () => {
    const copies = selected.map((it) => moveItem(fresh(it), 2, 2));
    if (copies.length) add(copies);
  };
  const remove = () => {
    setItems(items.filter((it) => !sel.includes(it.id)));
    setSel([]);
  };
  const setItem = (k: string, patch: object) => setItems(items.map((it) => (it.id === k ? ({ ...it, ...patch } as AnnotationItem) : it)));
  const setSpec = (k: string, patch: object) => setItems(items.map((it) => (it.id === k ? ({ ...it, spec: { ...it.spec, ...patch } } as AnnotationItem) : it)));
  // the selection's box typed: moved (x, y) or stretched from its top-left corner (w, h)
  const setBox = (p: Partial<Rect>) => {
    if (!selBox) return;
    const sx = p.w !== undefined && selBox.w > 1e-9 ? p.w / selBox.w : 1;
    const sy = p.h !== undefined && selBox.h > 1e-9 ? p.h / selBox.h : 1;
    const [nx, ny] = [p.x ?? selBox.x, p.y ?? selBox.y];
    // where each is drawn (a pinned one: moved by its shift), back to its own points
    setItems(
      items.map((it) => {
        if (!sel.includes(it.id) || it.locked) return it;
        const [hx, hy] = shiftMm(it);
        return mapItem(it, ([x, y]) => [nx + (x + hx - selBox.x) * sx - hx, ny + (y + hy - selBox.y) * sy - hy]);
      }),
    );
  };

  // ---- the keyboard (not in a field): tools, moves, copy, remove; the canvas's own keys kept out ----
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => root.current?.focus(), []);
  const key = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
      if (e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      stop();
      remove();
    } else if (e.key === 'Escape') {
      stop();
      if (pen.length) setPen([]);
      else if (poly.length) setPoly([]);
      else if (tool !== 'select') setTool('select');
      else if (sel.length) setSel([]);
      else onClose();
    } else if (e.key === 'Enter' && builder) {
      stop();
      void applyBuilder();
    } else if (e.key === 'Enter' && (poly.length || pen.length)) {
      stop();
      if (pen.length) finishPen(false);
      else finishPoly();
    } else if (mod && k === 'g') {
      stop();
      setItems(e.shiftKey ? ungroupItems(items, sel) : groupItems(items, sel));
    } else if (mod && e.shiftKey && k === 'c') {
      stop();
      copyStyle(selected[0]);
    } else if (mod && e.shiftKey && k === 'v') {
      stop();
      const list = pasteStyle(items, sel);
      if (list) setItems(list);
    } else if (e.key.startsWith('Arrow')) {
      stop();
      const s = e.altKey ? 0.1 : (grid.snap ? (grid.unit === 'pt' ? grid.step / MM : grid.step) : 0.5) * (e.shiftKey ? 10 : 1);
      moveSel(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
    } else if (mod && k === 'a') {
      stop();
      setSel(items.filter((it) => !it.hidden && !it.locked).map((it) => it.id));
    } else if (mod && k === 'd') {
      stop();
      duplicate();
    } else if (mod && (k === 'c' || k === 'x')) {
      stop();
      copyItems(selected);
      if (k === 'x') remove();
    } else if (mod && k === 'v') {
      stop();
      if (copiedItems().length) add(copiedItems().map((it) => moveItem(fresh(it), 2, 2)));
    } else if (!mod && !e.altKey) {
      const tl = TOOLS.find((x) => x.key === k);
      if (tl) {
        stop();
        if (tl.tool === 'image') pickImage();
        else setTool(tl.tool);
        setPoly([]);
        setPen([]);
      }
    }
  };

  // ---- the layers: the front object first ----
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  // the quick bar over the selection: shown (this browser's choice), not while the mouse is pressed on the page; by the
  // objects, or where it was dragged (in the room of the page)
  const quickOn = useQuickBar();
  const quickAt = useQuickBarAt();
  const body = useRef<HTMLDivElement>(null);
  const dragQuick = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !body.current) return;
    e.preventDefault();
    const bar = (e.currentTarget as HTMLElement).closest('.quick-bar')!.getBoundingClientRect();
    const room = body.current.getBoundingClientRect();
    const [ox, oy] = [e.clientX - bar.left, e.clientY - bar.top];
    const place = (ev: PointerEvent) => setQuickBarAt({ x: Math.round(Math.max(0, Math.min(room.width - 60, ev.clientX - room.left - ox))), y: Math.round(Math.max(0, Math.min(room.height - 30, ev.clientY - room.top - oy))) });
    const mv = (ev: PointerEvent) => place(ev);
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const [pressing, setPressing] = useState(false);
  useEffect(() => {
    if (!pressing) return;
    const up = () => setPressing(false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [pressing]);
  const pickLayer = (e: React.MouseEvent, it: AnnotationItem) => {
    if (e.shiftKey && sel.length) {
      // a run of layers
      const order = items.map((x) => x.id);
      const [a, b] = [order.indexOf(sel[sel.length - 1]), order.indexOf(it.id)];
      setSel(order.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else if (e.ctrlKey || e.metaKey) setSel(sel.includes(it.id) ? sel.filter((x) => x !== it.id) : [...sel, it.id]);
    else setSel([it.id]);
  };
  // a layer dropped on another: put in front of it (above it in the list)
  const dropOn = (target: string) => {
    if (!dragged || dragged === target) return;
    const moving = items.find((x) => x.id === dragged)!;
    const rest = items.filter((x) => x.id !== dragged);
    const k = rest.findIndex((x) => x.id === target);
    setItems([...rest.slice(0, k + 1), moving, ...rest.slice(k + 1)]);
    setDragged(null);
  };

  const one = selected.length === 1 ? selected[0] : null;
  // pinned to the data of the figure under the drawing: its point now, where it is drawn (unpinned: it stays there)
  const mapping = under ? plotMapping(under) : null;
  const pinnedAll = selected.length > 0 && selected.every((it) => it.pin);
  const setPinned = (on: boolean) => {
    if (!mapping) return;
    setItems(
      items.map((it) => {
        if (!sel.includes(it.id)) return it;
        if (!on) {
          const [hx, hy] = shiftMm(it);
          return { ...moveItem(it, hx, hy), pin: undefined };
        }
        if (it.pin) return it;
        const ref = anchorOf(it);
        const at = mapping.toData(ref);
        return at.every(Number.isFinite) ? { ...it, pin: { at: [+at[0].toPrecision(10), +at[1].toPrecision(10)], ref: [+ref[0].toFixed(4), +ref[1].toFixed(4)] } } : it;
      }),
    );
  };
  const [sideTab, setSideTab] = useState<'layers' | 'components' | 'library'>('layers');
  // the tab of the options (kept in this browser), the height of the list under them (px)
  const [optTab, setOptTabNow] = useState<OpsPart>(() => keep<OpsPart>('graph-flow:de-tab', 'style'));
  const setOptTab = (t: OpsPart) => (setOptTabNow(t), store('graph-flow:de-tab', t));
  const [listH, setListH] = useState(() => keep('graph-flow:de-list-h', 260));
  const dragSplit = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const [y0, h0] = [e.clientY, listH];
    let h = h0;
    follow(
      (ev) => {
        h = Math.round(Math.max(90, Math.min(window.innerHeight - 260, h0 - (ev.clientY - y0))));
        setListH(h);
      },
      () => store('graph-flow:de-list-h', h),
    );
  };
  // where the mouse is on the page (mm), written straight into the status bar
  const cursorEl = useRef<HTMLSpanElement>(null);
  const showCursor = (p: Pt | null) => {
    if (cursorEl.current) cursorEl.current.textContent = p ? `x ${(p[0] / MM).toFixed(1)}  y ${(p[1] / MM).toFixed(1)} mm` : '';
  };
  // the selection put on a face (null: taken off it), where it is drawn kept
  const putOn = (face: IsoFace | null) => setItems(items.map((it) => (sel.includes(it.id) && !it.locked && it.type !== 'colorbar' ? onFace(it, face, it.type === 'text' ? (it.iso?.upright ?? isoM.upright) : undefined) : it)));
  const selFace: IsoFace | null = selected.length && selected.every((it) => it.iso && it.iso.face === selected[0].iso?.face) ? selected[0].iso!.face : null;
  const ctx: Ctx = { items, setItems, sel, setSel, data, set, boxMm, selBox, pageMm: { w: W / MM, h: H / MM }, nodes: picked && sel.length === 1 && sel[0] === picked.item ? picked.nodes : [] };
  // a line stuck to shapes: its ends where they are drawn (found from the shapes)
  const endsOf = (it: AnnotationItem): Partial<ShapeSpec> => {
    if (it.type !== 'shape' || !(it.spec.from || it.spec.to)) return {};
    const a = fig?.axes[0]?.annotations.find((q) => q.owner?.field === 'annotations' && q.owner.item === it.id);
    const r = (v: number) => +v.toFixed(2);
    return a?.kind === 'shape' ? { x1: r(a.shape.x1), y1: r(a.shape.y1), x2: r(a.shape.x2), y2: r(a.shape.y2) } : {};
  };
  const shapesSel: AnnotationItem[] = selected.filter((it) => it.type === 'shape');
  const sMm = (v: number) => +v.toFixed(2);
  const rulerStep = zoom * MM >= 6 ? 1 : zoom * MM >= 2 ? 5 : 10;
  const mmW = W / MM;
  const mmH = H / MM;
  const gridMm = grid.unit === 'pt' ? grid.step / MM : grid.step;

  // the tools on the left: each group's tool shown (the one in use, else the last used), its flyout open (held 0.35 s,
  // right-clicked, or its small corner clicked)
  const [shown, setShown] = useState<Record<string, Tool>>({});
  useEffect(() => {
    const g = TOOL_GROUPS.find((x) => x.tools.includes(tool));
    if (g) setShown((m) => (m[g.name] === tool ? m : { ...m, [g.name]: tool }));
  }, [tool]);
  const [fly, setFly] = useState<string | null>(null);
  const toolsCol = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fly) return;
    const away = (e: PointerEvent) => {
      if (!toolsCol.current?.contains(e.target as Node)) setFly(null);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [fly]);
  const hold = useRef<{ timer: number; held: boolean }>({ timer: 0, held: false });
  const choose = (t: Tool) => {
    if (t === 'image') pickImage();
    else setTool(t);
    setPoly([]);
    setPen([]);
    setFly(null);
  };
  const tools = (
    <div className="de-tools" ref={toolsCol}>
      {TOOL_GROUPS.map((g) => {
        const t = g.tools.includes(tool) ? tool : (shown[g.name] ?? g.tools[0]);
        const I = TOOL_ICONS[t];
        const many = g.tools.length > 1;
        return (
          <div key={g.name} className="de-tool-slot">
            <button
              className={`nodrag de-tool${g.tools.includes(tool) ? ' on' : ''}`}
              title={many ? `${toolOf(t).title}\n(held, right-clicked or its corner: the other ${g.name.toLowerCase()})` : toolOf(t).title}
              onPointerDown={(e) => {
                if (e.button !== 0 || !many) return;
                hold.current.held = false;
                hold.current.timer = window.setTimeout(() => {
                  hold.current.held = true;
                  setFly(g.name);
                }, 350);
              }}
              onPointerUp={() => clearTimeout(hold.current.timer)}
              onPointerLeave={() => clearTimeout(hold.current.timer)}
              onClick={() => !hold.current.held && choose(t)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (many) setFly(fly === g.name ? null : g.name);
              }}
            >
              <I {...ICON} />
              {many && (
                <span
                  className="de-tool-more"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFly(fly === g.name ? null : g.name);
                  }}
                />
              )}
            </button>
            {fly === g.name && (
              <div className="de-flyout" role="menu" aria-label={g.name}>
                <div className="de-flyout-head">{g.name}</div>
                {g.tools.map((x) => {
                  const J = TOOL_ICONS[x];
                  const k = toolOf(x).key;
                  return (
                    <button key={x} className={`nodrag${tool === x ? ' on' : ''}`} title={toolOf(x).title} onClick={() => choose(x)}>
                      <J {...ICON} />
                      <span className="grow">{toolName(x)}</span>
                      {k && <span className="muted">{k.toUpperCase()}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
  const flipSel = (down: boolean) => {
    if (!selBox) return;
    const mid: Pt = [selBox.x + selBox.w / 2, selBox.y + selBox.h / 2];
    setItems(transformAll(items, sel, down ? flipDown(mid) : flipAcross(mid)));
  };

  const toolbar: ReactNode = (
    <div className="de-toolbar">
      <span className="de-title" title={`Figure Drawing: ${data.name || 'drawing'}`}>
        <DraftingCompass {...ICON} />
        <span className="muted">{data.name || 'drawing'}</span>
      </span>
      {selected.length > 0 && selBox ? (
        <span className="de-selbar" title="The selection: its place and size (typed: moved, or stretched from its top-left corner), aligned, flipped">
          <span className="de-selbar-name ellipsis">{one ? nameOf(one) : `${selected.length} objects`}</span>
          <span className="de-xy">
            <span className="muted">X</span>
            <NumInput className="short" step={0.5} value={sMm(selBox.x)} onChange={(x) => Number.isFinite(x) && setBox({ x })} />
            <span className="muted">Y</span>
            <NumInput className="short" step={0.5} value={sMm(selBox.y)} onChange={(y) => Number.isFinite(y) && setBox({ y })} />
            <span className="muted">W</span>
            <NumInput className="short" min={0.01} step={0.5} value={sMm(selBox.w)} onChange={(w) => w > 0 && setBox({ w })} />
            <span className="muted">H</span>
            <NumInput className="short" min={0.01} step={0.5} value={sMm(selBox.h)} onChange={(h) => h > 0 && setBox({ h })} />
            <span className="muted">mm</span>
          </span>
          <span className="de-group" title="Align the selected objects (one object: to the page)">
            {ALIGN.map(([how, I, title]) => (
              <button key={how} className="nodrag de-tool" title={title} onClick={() => align(how)}>
                <I {...ICON} />
              </button>
            ))}
            <Check label="to the page" title="Align to the page (else: to the box of the objects selected)" value={toPage} onChange={setToPage} />
            <button className="nodrag de-tool" title="Spread out across: equal gaps between them (3 objects or more)" disabled={selected.length < 3} onClick={() => distribute('h')}>
              <AlignHorizontalDistributeCenter {...ICON} />
            </button>
            <button className="nodrag de-tool" title="Spread out down: equal gaps between them (3 objects or more)" disabled={selected.length < 3} onClick={() => distribute('v')}>
              <AlignVerticalDistributeCenter {...ICON} />
            </button>
          </span>
          <span className="de-group">
            <button className="nodrag de-tool" title="Flip across: mirrored left to right, about the middle of the selection" onClick={() => flipSel(false)}>
              <FlipHorizontal2 {...ICON} />
            </button>
            <button className="nodrag de-tool" title="Flip down: mirrored top to bottom, about the middle of the selection" onClick={() => flipSel(true)}>
              <FlipVertical2 {...ICON} />
            </button>
          </span>
        </span>
      ) : (
        <span className="de-selbar muted">{tool === 'select' ? 'Nothing selected: click an object, or drag a box around several' : toolName(tool)}</span>
      )}
      <span className="grow" />
      <Drop
        label={
          <>
            <Magnet {...ICON} /> Snap
          </>
        }
        title="Snapping: to the grid, to the other objects and their nodes, to the guides"
      >
        <Check label="To the grid" title="Objects and points snapped to the grid (Alt while dragging: free)" value={grid.snap} onChange={(snap) => set({ grid: { ...grid, snap } })} />
        <span className="row">
          <span className="muted">Step</span>
          <NumInput className="tiny" min={0.01} step={0.5} value={grid.step} title="The grid's step" onChange={(v) => set({ grid: { ...grid, step: v > 0 ? v : 1 } })} />
          <Select<'mm' | 'pt'> seg
            value={grid.unit}
            options={[
              ['mm', 'mm'],
              ['pt', 'pt'],
            ]}
            onChange={(unit) => set({ grid: { ...grid, unit } })}
          />
        </span>
        <Check label="To objects" title="To the edges and middles of the other objects and of the page (guides show it)" value={data.snapObjects !== false} onChange={(snapObjects) => set({ snapObjects })} />
        <Check label="To nodes" title="A point drawn or dragged snapped to the nodes of the other objects (their ends, corners, middles) and to where their outlines cross; Shift while drawing a polygon or a path: the next point by 15°" value={data.snapNodes !== false} onChange={(snapNodes) => set({ snapNodes: snapNodes ? undefined : false })} />
        <Check label="Guides" title="Guides: drag one out of a ruler (the top one: across, the left one: down); drag it to move it, back onto its ruler to remove it; objects snap to them" value={!data.guides?.hidden} onChange={(on) => set({ guides: { ...data.guides, hidden: on ? undefined : true } })} />
        {isoOn && <Check label="Guides along the face" title="In the isometric mode, on a face: a guide out of the top ruler goes along the face's first edge, out of the left one along its other edge" value={!!isoM.guides} onChange={(guides) => setIso({ guides: guides || undefined })} />}
        {data.guides?.x?.length || data.guides?.y?.length || data.guides?.iso?.length ? (
          <button className="nodrag" title="Remove every guide" onClick={() => set({ guides: undefined })}>
            Clear guides
          </button>
        ) : null}
      </Drop>
      <Drop
        label={
          <>
            <Grid3x3 {...ICON} /> View
          </>
        }
        title="What is shown: the grid (square or isometric), the quick bar"
      >
        <Check label="Grid" title="Show the grid (only here: not drawn in the figure)" value={grid.show} onChange={(show) => set({ grid: { ...grid, show } })} />
        <Check label="Isometric grid" title="An isometric grid: lines at 30° either way and down, its points a step apart (points snapped to them)" value={!!grid.iso} onChange={(iso) => set({ grid: { ...grid, iso: iso || undefined } })} />
        <Check label="Quick bar" title="A bar over the objects selected: their colour, width, size … one click away (drag it by its handle anywhere; its × hides it)" value={quickOn} onChange={setQuickBar} />
        <Check
          label="Isometric mode"
          title="The cube of the faces: new objects drawn on the face chosen (top, left, right) or flat; the objects on a face scaled along its edges; the isometric grid"
          value={isoOn}
          onChange={(on) => {
            set({ isoMode: { ...isoM, on: on || undefined, plane: isoM.plane ?? 'top' }, ...(on ? { grid: { ...grid, iso: true, show: true } } : {}) });
          }}
        />
        {isoOn && <Check label="Texts upright" title="New texts on a face: their letters level (else slanted with the face)" value={!!isoM.upright} onChange={(upright) => setIso({ upright: upright || undefined })} />}
      </Drop>
      <span className="de-group">
        <button className="nodrag de-tool" title="Zoom out (Ctrl + wheel)" onClick={() => zoomBy(1 / 1.25)}>
          <ZoomOut {...ICON} />
        </button>
        <select className="nodrag" value={zoomSet === null ? 'fit' : String(zoomSet)} title="Zoom" onChange={(e) => setZoom(e.target.value === 'fit' ? null : Number(e.target.value))}>
          <option value="fit">fit ({Math.round((zoom / (96 / 72)) * 100)} %)</option>
          {zoomSet !== null && !ZOOMS.includes(zoomSet) && <option value={String(zoomSet)}>{Math.round((zoomSet / (96 / 72)) * 100)} %</option>}
          {ZOOMS.map((z) => (
            <option key={z} value={String(z)}>
              {Math.round((z / (96 / 72)) * 100)} %
            </option>
          ))}
        </select>
        <button className="nodrag de-tool" title="Zoom in (Ctrl + wheel)" onClick={() => zoomBy(1.25)}>
          <ZoomIn {...ICON} />
        </button>
      </span>
      <button className="nodrag de-close" title="Close the editor (Esc with nothing selected); Ctrl+Z undoes" onClick={onClose}>
        <X {...ICON} /> Close
      </button>
    </div>
  );

  const layers = (
    <div className="de-layers">
      <div className="de-head">
        <span>Layers</span>
        <span className="grow" />
        <button className="nodrag ts-btn de-ico" title="Bring to the front" disabled={!sel.length} onClick={() => reorder('front')}>
          <BringToFront {...ICON} />
        </button>
        <button className="nodrag ts-btn de-ico" title="One step forward" disabled={!sel.length} onClick={() => reorder('up')}>
          <ArrowUp {...ICON} />
        </button>
        <button className="nodrag ts-btn de-ico" title="One step back" disabled={!sel.length} onClick={() => reorder('down')}>
          <ArrowDown {...ICON} />
        </button>
        <button className="nodrag ts-btn de-ico" title="Send to the back" disabled={!sel.length} onClick={() => reorder('back')}>
          <SendToBack {...ICON} />
        </button>
        <button className="nodrag ts-btn de-ico" title="Duplicate (Ctrl+D)" disabled={!sel.length} onClick={duplicate}>
          <Copy {...ICON} />
        </button>
        <button className="nodrag ts-btn de-ico" title="Remove (Delete)" disabled={!sel.length} onClick={remove}>
          <Trash {...ICON} />
        </button>
      </div>
      <div className="de-list">
        {!items.length && <div className="hint">No objects yet: choose a tool on the left and drag on the page.</div>}
        {items
          .slice()
          .reverse()
          .map((it) => (
            <div
              key={it.id}
              className={`de-layer${sel.includes(it.id) ? ' on' : ''}${it.hidden ? ' off' : ''}${it.group ? ' grouped' : ''}${dragged && dragged !== it.id ? ' drop' : ''}`}
              draggable={renaming !== it.id}
              onDragStart={() => setDragged(it.id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(it.id)}
              onClick={(e) => pickLayer(e, it)}
              onDoubleClick={() => setRenaming(it.id)}
              title="Click: select (Shift: a run, Ctrl: more); double-click: rename; drag: put it in front of another"
            >
              <button className="nodrag ts-btn de-ico" title={it.hidden ? 'Hidden (not drawn nor exported): show it' : 'Hide it'} onClick={(e) => (e.stopPropagation(), setItem(it.id, { hidden: it.hidden ? undefined : true }))}>
                {it.hidden ? <EyeOff {...ICON} size={14} /> : <Eye {...ICON} size={14} />}
              </button>
              <button className={`nodrag ts-btn de-ico${it.locked ? ' on' : ' faint'}`} title={it.locked ? 'Locked (not moved with the mouse): unlock it' : 'Lock it'} onClick={(e) => (e.stopPropagation(), setItem(it.id, { locked: it.locked ? undefined : true }))}>
                {it.locked ? <Lock {...ICON} size={14} /> : <LockOpen {...ICON} size={14} />}
              </button>
              {renaming === it.id ? (
                <input
                  className="nodrag grow"
                  autoFocus
                  defaultValue={nameOf(it)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => (setItem(it.id, { name: e.target.value.trim() && e.target.value.trim() !== describe(it) ? e.target.value.trim() : undefined }), setRenaming(null))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                    e.stopPropagation();
                  }}
                />
              ) : (
                <span className="grow ellipsis" title={it.group ? 'In a group (selected together on the page; here: alone)' : undefined}>
                  {it.clipBy ? '✂ ' : it.maskBy ? '◐ ' : ''}
                  {nameOf(it)}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  );

  const options = (
    <div className="de-options">
      {!selected.length && (
        <>
          <div className="de-head">Page</div>
          <PageControls page={data} set={(p) => set(p)} fixed={under ? `Size: ${under.width} × ${under.height} ${under.unit}; the figure under the drawing's (${guide ? 'only a guide' : 'drawn with it'}).` : undefined} />
          <div className="hint">The grid and snapping: Snap and View in the bar above. Objects: a tool on the left, then drag on the page.</div>
          <IsoMaker ctx={ctx} />
        </>
      )}
      {selected.length > 0 && optTab === 'arrange' && (
        <>
          {under && !guide && (
            <Field label="Layer" title="Over the figure under the drawing: in front of everything, or behind its data (under its curves, over its frame's ground and grid)">
              <Select<'front' | 'behind'>
                value={selected.every((it) => it.behind) ? 'behind' : 'front'}
                options={[
                  ['front', 'in front of the data'],
                  ['behind', 'behind the data'],
                ]}
                onChange={(v) => setItems(items.map((it) => (sel.includes(it.id) ? { ...it, behind: v === 'behind' || undefined } : it)))}
              />
            </Field>
          )}
          {mapping && !selected.some((it) => it.locked) && (
            <Field label="Pinned to the data" title="The object moves with the data of the figure under the drawing: where the point it holds (an arrow's head, a text's place, a shape's middle) is on the data now, it follows it when the axes' limits change. Its own size stays in mm">
              <span className="row">
                <Check label={pinnedAll ? 'yes' : 'no'} value={pinnedAll} onChange={(on) => setPinned(on)} />
                {one?.pin && (
                  <span className="muted" title="The data point it is held at (x, y of the axes under it)">
                    at {+one.pin.at[0].toPrecision(5)}, {+one.pin.at[1].toPrecision(5)}
                  </span>
                )}
              </span>
            </Field>
          )}
          <Field label="Isometric face" title="The objects put on a face of an isometric box (their own shape kept: a rectangle stays one; its handles move along the face's edges), or taken off it (Flat); where they are stays">
            <span className="row wrap">
              {(['top', 'left', 'right'] as IsoFace[]).map((f) => (
                <button key={f} className={`nodrag${selected.every((it) => it.iso?.face === f) ? ' on' : ''}`} onClick={() => putOn(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button className={`nodrag${selected.every((it) => !it.iso) ? ' on' : ''}`} onClick={() => putOn(null)}>
                Flat
              </button>
            </span>
          </Field>
          {selected.some((it) => it.type === 'text' && it.iso) && (
            <Check
              label="Text upright"
              title="A text on a face: its letters level (else slanted with the face)"
              value={selected.filter((it) => it.type === 'text' && it.iso).every((it) => it.iso?.upright)}
              onChange={(up) => setItems(items.map((it) => (sel.includes(it.id) && it.type === 'text' && it.iso ? { ...it, iso: { ...it.iso, upright: up || undefined } } : it)))}
            />
          )}
          <ObjectOps ctx={ctx} part="arrange" />
        </>
      )}
      {selected.length > 0 && optTab === 'style' && (
        <>
          {one?.type === 'shape' && CORNERED.has(shapeSpec(one.spec).kind) && (
            <Field label="Corners" title="Their radius, pt: every corner (all), or the corners picked with the Corners tool (K: click a shape, then its corners)">
              <span className="row wrap">
                <span className="muted">all</span>
                <NumInput className="tiny" min={0} step={0.5} value={cornersOf(shapeSpec(one.spec).corners).all} onChange={(v) => setSpec(one.id, { corners: cornersText(Math.max(0, Number.isFinite(v) ? v : 0), new Map()) })} />
                {picked?.item === one.id && picked.nodes.length > 0 && (
                  <>
                    <span className="muted">picked ({picked.nodes.length})</span>
                    <NumInput className="tiny" min={0} step={0.5} value={radiusAt(one, picked.nodes[0])} onChange={(v) => setItems(items.map((x) => (x.id === one.id ? withRadius(x, picked.nodes, Math.max(0, Number.isFinite(v) ? v : 0)) : x)))} />
                  </>
                )}
              </span>
            </Field>
          )}
          {one?.type === 'shape' && (shapeSpec(one.spec).kind === 'line' || shapeSpec(one.spec).kind === 'arrow') && <StickFields it={one} items={items} set={(p) => setSpec(one.id, p)} />}
          {one?.type === 'shape' && shapeSpec(one.spec).kind !== 'component' && (
            <PageTextContext.Provider value={pageText(data)}>
              <ShapeEditor s={{ ...shapeSpec(one.spec), ...endsOf(one), coords: 'data' }} where="drawing" set={(p) => setSpec(one.id, p)} />
            </PageTextContext.Provider>
          )}
          {one?.type === 'shape' && shapeSpec(one.spec).kind === 'component' && <div className="hint">An instance of “{data.components?.find((c) => c.id === one.spec.ref)?.name ?? 'a removed component'}”: placed and sized by its box; it changes with its component (Component ▸ Update; Detach: objects of its own).</div>}
          {one?.type === 'text' && (
            <PageTextContext.Provider value={pageText(data)}>
              <TextEditor s={{ ...TEXT_SPEC_DEFAULTS, ...one.spec, coords: 'data' }} where="drawing" set={(p) => setSpec(one.id, p)} extra={<TextPathFields it={one} items={items} set={(p) => setSpec(one.id, p)} />} />
            </PageTextContext.Provider>
          )}
          {!one && shapesSel.length > 0 && <CommonStroke items={shapesSel} set={(patch) => setItems(items.map((it) => (shapesSel.includes(it) ? ({ ...it, spec: { ...it.spec, ...patch } } as AnnotationItem) : it)))} />}
          <ObjectOps ctx={ctx} part="style" />
        </>
      )}
      {selected.length > 0 && (optTab === 'path' || optTab === 'make') && (
        <>
          {selected.some((it) => it.iso) && <div className="hint">On an isometric face: what is done here takes them off it (as they are drawn).</div>}
          <ObjectOps ctx={selected.some((it) => it.iso) ? { ...ctx, items: items.map((it) => (sel.includes(it.id) && it.iso ? bakeIso(it) : it)) } : ctx} part={optTab} />
        </>
      )}
    </div>
  );

  // the quick bar over the selection (objects of one kind: the first one's), above its box (below it at the page's top)
  const quickKind = selected[0]?.type;
  const quickBar = (() => {
    if (!quickOn || pressing || !selBox || tool !== 'select' || !quickKind || quickKind === 'colorbar' || selected.some((it) => it.locked)) return null;
    const first = selected[0];
    if (first.type === 'shape' && shapeSpec(first.spec).kind === 'component') return null;
    const same = selected.filter((it) => it.type === quickKind).map((it) => it.id);
    const patch = (p: object) => setItems(items.map((it) => (same.includes(it.id) ? ({ ...it, spec: { ...it.spec, ...p } } as AnnotationItem) : it)));
    const x = 40 + selBox.x * MM * zoom;
    // above the box and its turning handle (9 pt over it)
    const yTop = 40 + selBox.y * MM * zoom - 42 - 9 * zoom - 8;
    const y = yTop >= 0 ? yTop : 40 + (selBox.y + selBox.h) * MM * zoom + 8;
    return (
      <QuickBar
        target={first.type === 'shape' ? { kind: 'shape', s: shapeSpec(first.spec) } : { kind: 'text', s: { ...TEXT_SPEC_DEFAULTS, ...first.spec } as TextSpec }}
        onShape={patch}
        onText={patch}
        front={() => reorder('front')}
        back={() => reorder('back')}
        remove={remove}
        style={quickAt ? { left: quickAt.x, top: quickAt.y } : { left: Math.max(0, x), top: y }}
        grip={dragQuick}
        unplace={quickAt ? () => setQuickBarAt(null) : undefined}
      />
    );
  })();

  // the grid (only here), in pt of the page
  const gridLines = (() => {
    if (!grid.show || !(gridMm > 0)) return null;
    if (grid.iso) {
      const a = gridMm * MM;
      const ax = a * Math.cos(Math.PI / 6);
      if (a * zoom < 4) return null;
      const t = Math.tan(Math.PI / 6);
      const d: string[] = [];
      for (let x = 0; x <= W + 1e-9; x += ax) d.push(`M${x.toFixed(2)},0V${H.toFixed(2)}`);
      // (the lines at ±30°: one every step down the left edge, from above the page to below it)
      const reach = W * t;
      for (let y0 = -reach; y0 <= H + reach + 1e-9; y0 += a) {
        d.push(`M0,${y0.toFixed(2)}L${W.toFixed(2)},${(y0 + reach).toFixed(2)}`);
        d.push(`M0,${y0.toFixed(2)}L${W.toFixed(2)},${(y0 - reach).toFixed(2)}`);
      }
      return <path d={d.join('')} fill="none" stroke="#5aa9e6" strokeOpacity={0.3} strokeWidth={0.6 / zoom} />;
    }
    // the lines of every step (when they are 5 px apart or more), every 10th one stronger
    const minor = gridMm * MM * zoom >= 5;
    const d: string[] = [];
    const dM: string[] = [];
    for (let k = 0; k * gridMm <= mmW + 1e-9; k++) (k % 10 === 0 ? dM : minor ? d : null)?.push(`M${(k * gridMm * MM).toFixed(2)},0V${H.toFixed(2)}`);
    for (let k = 0; k * gridMm <= mmH + 1e-9; k++) (k % 10 === 0 ? dM : minor ? d : null)?.push(`M0,${(k * gridMm * MM).toFixed(2)}H${W.toFixed(2)}`);
    return (
      <g fill="none">
        <path d={d.join('')} stroke="#5aa9e6" strokeOpacity={0.25} strokeWidth={0.6 / zoom} />
        <path d={dM.join('')} stroke="#5aa9e6" strokeOpacity={0.5} strokeWidth={0.8 / zoom} />
      </g>
    );
  })();
  const ruler = (len: number, horiz: boolean) => {
    const ticks: ReactNode[] = [];
    for (let v = 0; v <= len + 1e-9; v += rulerStep) {
      const at = v * MM * zoom;
      const big = Math.round(v) % 10 === 0;
      const mid = Math.round(v) % 5 === 0;
      const t = big ? 10 : mid ? 6 : 3;
      ticks.push(horiz ? <line key={v} x1={at} x2={at} y1={16} y2={16 - t} /> : <line key={v} y1={at} y2={at} x1={16} x2={16 - t} />);
      if (big)
        ticks.push(
          horiz ? (
            <text key={`t${v}`} x={at + 2} y={8}>
              {Math.round(v)}
            </text>
          ) : (
            <text key={`t${v}`} x={2} y={at - 2}>
              {Math.round(v)}
            </text>
          ),
        );
    }
    return horiz ? (
      <svg className="de-ruler h" width={dispW} height={16}>
        {ticks}
      </svg>
    ) : (
      <svg className="de-ruler v" width={16} height={dispH}>
        {ticks}
      </svg>
    );
  };
  const handleK = 9 / (5.6 * zoom);
  // a guide dragged (k: its number; −1: a new one, out of a ruler): where it goes (pt), snapped to the grid; dropped off
  // the page, removed
  const [newGuide, setNewGuide] = useState<{ axis: 'x' | 'y'; at: number } | null>(null);
  const dragGuide = (e: ReactPointerEvent, axis: 'x' | 'y', k: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const list = [...(data.guides?.[axis] ?? [])];
    const place = (ev: { clientX: number; clientY: number }) => {
      const p = at(ev)[axis === 'x' ? 0 : 1];
      const g = gridMm > 0 && grid.snap ? Math.round(p / MM / gridMm) * gridMm * MM : p;
      return { at: g, off: p < 0 || p > (axis === 'x' ? W : H) };
    };
    const rest = k >= 0 ? list.filter((_, j) => j !== k) : list;
    if (k >= 0) set({ guides: { ...data.guides, [axis]: rest } });
    follow(
      (ev) => setNewGuide({ axis, at: place(ev).at }),
      (ev) => {
        setNewGuide(null);
        const q = place(ev);
        set({ guides: { ...data.guides, hidden: undefined, [axis]: q.off ? rest : [...rest, +(q.at / MM).toFixed(3)] } });
      },
    );
  };

  // a guide along a face's edge (deg) dragged (k: its number; −1: a new one, out of a ruler): through the mouse (on the
  // isometric grid's points when snapped); dropped off the page, removed
  const [newIsoGuide, setNewIsoGuide] = useState<{ at: Pt; deg: number } | null>(null);
  const dragIsoGuide = (e: ReactPointerEvent, deg: number, k: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const list = [...(data.guides?.iso ?? [])];
    const rest = k >= 0 ? list.filter((_, j) => j !== k) : list;
    if (k >= 0) set({ guides: { ...data.guides, iso: rest } });
    const place = (ev: { clientX: number; clientY: number }) => {
      const p = at(ev);
      return { at: (isoStep > 0 ? isoNear(p) : p) as Pt, off: p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H };
    };
    follow(
      (ev) => setNewIsoGuide({ at: place(ev).at, deg }),
      (ev) => {
        setNewIsoGuide(null);
        const q = place(ev);
        set({ guides: { ...data.guides, hidden: undefined, iso: q.off ? rest : [...rest, { at: [+(q.at[0] / MM).toFixed(3), +(q.at[1] / MM).toFixed(3)], deg }] } });
      },
    );
  };
  const isoRulers = isoOn && !!isoM.guides && !!plane;
  const isoLine = (g: { at: Pt; deg: number }, mm: boolean, props: object) => {
    const a = (g.deg * Math.PI) / 180;
    const L = (W + H) * 2;
    const [ox, oy] = mm ? [g.at[0] * MM, g.at[1] * MM] : g.at;
    return <line x1={ox - L * Math.cos(a)} y1={oy - L * Math.sin(a)} x2={ox + L * Math.cos(a)} y2={oy + L * Math.sin(a)} {...props} />;
  };

  // what the tool does now (the bar at the bottom)
  const statusHint = builder
    ? 'Shape builder: click the parts to join them, Alt + click those to take away; Enter applies, Esc cancels'
    : pen.length
      ? 'Pen: click a corner, drag a curve; click the first node to close the path, Enter or a double-click ends it open'
      : poly.length
        ? `${toolName(tool)}: click the next point (Shift: by 15°); Enter or a double-click ends it`
        : tool !== 'select'
          ? toolHint(tool)
          : selected.length
            ? 'Drag to move (Alt: no snapping); the handles change it; arrows move it (Shift: ×10, Alt: 0.1 mm); right-click: more'
            : 'Click an object (Shift / Ctrl: more), or drag a box around several; right-click the page: add an object';

  const side = (
    <div className="de-side node inspector-options">
      {selected.length > 0 && (
        <>
          <div className="de-head de-side-name ellipsis">{one ? nameOf(one) : `${selected.length} objects`}</div>
          <div className="de-tabs">
            {OPS_TABS.map(([k, label, title]) => (
              <button key={k} className={`nodrag${optTab === k ? ' on' : ''}`} title={title} onClick={() => setOptTab(k)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {options}
      <div className="de-split" title="Drag: the height of the list under it" onPointerDown={dragSplit} />
      <div className="de-bottom" style={{ height: listH }}>
        <div className="de-tabs">
          {(
            [
              ['layers', 'Layers', Layers],
              ['components', `Components${data.components?.length ? ` (${data.components.length})` : ''}`, Component],
              ['library', 'Library', Library],
            ] as const
          ).map(([k, label, I]) => (
            <button key={k} className={`nodrag${sideTab === k ? ' on' : ''}`} onClick={() => setSideTab(k)}>
              <I {...ICON} size={14} /> {label}
            </button>
          ))}
        </div>
        {sideTab === 'layers' && layers}
        {sideTab === 'components' && <div className="de-layers">{<ComponentsTab ctx={ctx} />}</div>}
        {sideTab === 'library' && <div className="de-layers">{<LibraryTab ctx={ctx} />}</div>}
      </div>
    </div>
  );
  const status = (
    <div className="de-status">
      <span className="de-status-hint ellipsis">{statusHint}</span>
      <span className="grow" />
      <span ref={cursorEl} className="de-status-xy" />
      <span>{sel.length ? `${sel.length} selected` : `${items.length} object${items.length === 1 ? '' : 's'}`}</span>
    </div>
  );
  // while a handle is dragged only the drawing is drawn again: the bars and panels kept as they were (the same
  // elements: React leaves them)
  const frozen = useRef<{ toolbar: ReactNode; tools: ReactNode; side: ReactNode; status: ReactNode } | null>(null);
  if (!draft || !frozen.current) frozen.current = { toolbar, tools, side, status };
  const ui = frozen.current;

  return createPortal(
    <div
      className="drawing-editor nowheel"
      ref={root}
      tabIndex={-1}
      onKeyDown={key}
      onPaste={(e) => {
        const t = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
        const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        files.forEach(addImage);
      }}
    >
      {ui.toolbar}
      {menu && (
        <>
          <div className="de-menu-shade" onPointerDown={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))} />
          <div className="de-menu" style={{ left: Math.max(4, Math.min(menu.x, menu.w - 240)), top: Math.max(4, Math.min(menu.y, menu.h - 40 - 22 * menuItems().length)) }}>
            {menuItems().map((m, k) =>
              m ? (
                <button
                  key={k}
                  className={`nodrag${m[0] === 'Delete' ? ' danger' : ''}`}
                  onClick={() => {
                    setMenu(null);
                    m[1]();
                  }}
                >
                  <span>{m[0]}</span>
                  {m[2] && <span className="muted">{m[2]}</span>}
                </button>
              ) : (
                <hr key={k} />
              ),
            )}
          </div>
        </>
      )}
      <div className="de-body" ref={body}>
        {ui.tools}
        {quickAt && quickBar}
        {isoOn && (
          <IsoCube
            plane={plane}
            of={selFace}
            pick={(f, put) => {
              if (put && sel.length) putOn(f === 'flat' ? null : f);
              else setIso({ plane: f });
            }}
            close={() => setIso({ on: undefined })}
          />
        )}
        <div
          className="de-area"
          ref={area}
          onPointerDown={(e) => e.target === e.currentTarget && tool === 'select' && setSel([])}
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || /\.svg$/i.test(f.name));
            if (!files.length) return;
            e.preventDefault();
            e.stopPropagation();
            files.forEach(addImage);
          }}
        >
          <div className="de-stage" style={{ width: dispW + 60, height: dispH + 60 }}>
            {!quickAt && quickBar}
            {builder && (
              <div className="de-builder-bar">
                <span>
                  Shape builder: click the parts to join ({builder.join.length}), Alt + click those to take away ({builder.drop.length})
                </span>
                <button className="nodrag btn-run" disabled={!builder.join.length && !builder.drop.length} onClick={() => void applyBuilder()}>
                  Apply
                </button>
                <button className="nodrag" onClick={() => setTool('select')}>
                  Cancel
                </button>
              </div>
            )}
            <div className="de-rulers" style={{ left: 40, top: 22 }} title={isoRulers ? "Drag onto the page: a guide along the face's first edge" : 'Drag down onto the page: a guide across'} onPointerDown={(e) => (isoRulers ? dragIsoGuide(e, isoEdges(plane!)[0], -1) : dragGuide(e, 'y', -1))}>
              {ruler(mmW, true)}
            </div>
            <div className="de-rulers" style={{ left: 22, top: 40 }} title={isoRulers ? "Drag onto the page: a guide along the face's other edge" : 'Drag onto the page: a guide down'} onPointerDown={(e) => (isoRulers ? dragIsoGuide(e, isoEdges(plane!)[1], -1) : dragGuide(e, 'x', -1))}>
              {ruler(mmH, false)}
            </div>
            <div
              ref={page}
              className={`de-page tool-${tool}${data.background === 'none' ? ' checker' : ''}`}
              style={{ left: 40, top: 40, width: dispW, height: dispH }}
              onPointerDown={(e) => {
                setPressing(true);
                down(e);
              }}
              onPointerMove={(e) => {
                showCursor(at(e));
                if (((tool === 'polygon' || tool === 'polyline') && poly.length) || (tool === 'pen' && pen.length)) setHover(at(e));
              }}
              onPointerLeave={() => showCursor(null)}
              onDoubleClick={dbl}
              onContextMenu={openMenu}
            >
              {guide && under && (
                <div className="drawing-under" title="The figure under the drawing (only a guide: not in the output)">
                  <FigureSvg fig={under} display={{ width: dispW, height: dispH }} idPrefix={`de-under-${id}`} />
                </div>
              )}
              <div className="drawing-figure">
                {fig && (
                  <Interactive.Provider value={true}>
                    <HandleScale.Provider value={handleK}>
                      <PickedNodes.Provider value={picked && sel.length === 1 && sel[0] === picked.item ? picked : null}>
                        <HandlesFor.Provider value={selSet}>
                          <FigureSvg fig={guide ? { ...fig, background: 'none' } : fig} display={{ width: dispW, height: dispH }} idPrefix={`de-${id}`} />
                        </HandlesFor.Provider>
                      </PickedNodes.Provider>
                    </HandleScale.Provider>
                  </Interactive.Provider>
                )}
              </div>
              {builder && (
                <svg className="de-overlay de-builder" width={dispW} height={dispH} viewBox={`0 0 ${W.toFixed(3)} ${H.toFixed(3)}`}>
                  <g transform={`scale(${MM})`}>
                    {builder.parts.map((d, k) => (
                      <path
                        key={k}
                        d={d}
                        className={builder.join.includes(k) ? 'join' : builder.drop.includes(k) ? 'drop' : ''}
                        strokeWidth={1 / zoom / MM}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const toggle = (l: number[]) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]);
                          setBuilder(e.altKey ? { ...builder, drop: toggle(builder.drop), join: builder.join.filter((x) => x !== k) } : { ...builder, join: toggle(builder.join), drop: builder.drop.filter((x) => x !== k) });
                        }}
                      />
                    ))}
                  </g>
                </svg>
              )}
              {!data.guides?.hidden && (
                <svg className="de-overlay de-guides" width={dispW} height={dispH} viewBox={`0 0 ${W.toFixed(3)} ${H.toFixed(3)}`}>
                  {/* (each drawn thin, caught by a wide line under it: 5 px either side) */}
                  {(data.guides?.x ?? []).map((v, k) => (
                    <g key={`x${k}`} onPointerDown={(e) => dragGuide(e, 'x', k)}>
                      <title>{`x = ${+v.toFixed(2)} mm: drag it (back onto the ruler: removed)`}</title>
                      <line className="grab" x1={v * MM} x2={v * MM} y1={-40 / zoom} y2={H + 40 / zoom} strokeWidth={10 / zoom} />
                      <line x1={v * MM} x2={v * MM} y1={-40 / zoom} y2={H + 40 / zoom} strokeWidth={1 / zoom} />
                    </g>
                  ))}
                  {(data.guides?.y ?? []).map((v, k) => (
                    <g key={`y${k}`} onPointerDown={(e) => dragGuide(e, 'y', k)}>
                      <title>{`y = ${+v.toFixed(2)} mm: drag it (back onto the ruler: removed)`}</title>
                      <line className="grab" y1={v * MM} y2={v * MM} x1={-40 / zoom} x2={W + 40 / zoom} strokeWidth={10 / zoom} />
                      <line y1={v * MM} y2={v * MM} x1={-40 / zoom} x2={W + 40 / zoom} strokeWidth={1 / zoom} />
                    </g>
                  ))}
                  {/* (the guides along a face's edges cut at the page, as far out as the others) */}
                  <defs>
                    <clipPath id={`de-iso-${id}`}>
                      <rect x={-40 / zoom} y={-40 / zoom} width={W + 80 / zoom} height={H + 80 / zoom} />
                    </clipPath>
                  </defs>
                  <g clipPath={`url(#de-iso-${id})`}>
                    {isoGuides.map((g, k) => (
                      <g key={`i${k}`} onPointerDown={(e) => dragIsoGuide(e, g.deg, k)}>
                        <title>{`A guide at ${g.deg}°: drag it (off the page: removed)`}</title>
                        {isoLine(g, true, { className: 'grab', strokeWidth: 10 / zoom })}
                        {isoLine(g, true, { strokeWidth: 1 / zoom })}
                      </g>
                    ))}
                    {newIsoGuide && isoLine(newIsoGuide, false, { strokeWidth: 1 / zoom, className: 'moving' })}
                  </g>
                  {newGuide && (newGuide.axis === 'x' ? <line x1={newGuide.at} x2={newGuide.at} y1={0} y2={H} strokeWidth={1 / zoom} className="moving" /> : <line y1={newGuide.at} y2={newGuide.at} x1={0} x2={W} strokeWidth={1 / zoom} className="moving" />)}
                </svg>
              )}
              <svg className="de-overlay" width={dispW} height={dispH} viewBox={`0 0 ${W.toFixed(3)} ${H.toFixed(3)}`}>
                {gridLines}
                {selected.map((it) => {
                  const fb = it.iso ? flatBox(it) : null;
                  if (it.iso && fb) {
                    const pts = [[fb.x, fb.y], [fb.x + fb.w, fb.y], [fb.x + fb.w, fb.y + fb.h], [fb.x, fb.y + fb.h]].map(([x, y]) => isoToPage(it.iso!, [x, y]).map((v) => (v * MM).toFixed(2)).join(','));
                    return <polygon key={it.id} points={pts.join(' ')} fill="none" stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />;
                  }
                  const b = boxPt(it);
                  return b ? <rect key={it.id} x={b.x} y={b.y} width={Math.max(b.w, 0.01)} height={Math.max(b.h, 0.01)} fill="none" stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} /> : null;
                })}
                {selected.length > 1 && selBox && <rect x={selBox.x * MM} y={selBox.y * MM} width={selBox.w * MM} height={selBox.h * MM} fill="none" stroke="var(--select)" strokeOpacity={0.6} strokeWidth={1.5 / zoom} />}
                {guides.x !== null && <line x1={guides.x} x2={guides.x} y1={0} y2={H} stroke="#e6007e" strokeWidth={1 / zoom} />}
                {guides.y !== null && <line y1={guides.y} y2={guides.y} x1={0} x2={W} stroke="#e6007e" strokeWidth={1 / zoom} />}
                {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="var(--select)" fillOpacity={0.08} stroke="var(--select)" strokeWidth={1 / zoom} />}
                {preview &&
                  (BOXED.has(tool) && plane ? (
                    <polygon
                      points={(() => {
                        const [a, b] = [mmAt(tool, preview.a), mmAt(tool, preview.b)];
                        return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map((q) => isoToPage(facePlace(plane), q as Pt).map((v) => (v * MM).toFixed(2)).join(',')).join(' ');
                      })()}
                      fill="none"
                      stroke="var(--select)"
                      strokeWidth={1 / zoom}
                      strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                    />
                  ) : BOXED.has(tool) ? (
                    <rect x={Math.min(preview.a[0], preview.b[0])} y={Math.min(preview.a[1], preview.b[1])} width={Math.abs(preview.b[0] - preview.a[0])} height={Math.abs(preview.b[1] - preview.a[1])} fill="none" stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
                  ) : (
                    <line x1={preview.a[0]} y1={preview.a[1]} x2={preview.b[0]} y2={preview.b[1]} stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
                  ))}
                {stroke && <polyline points={stroke.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--select)" strokeWidth={1.2 / zoom} />}
                {poly.length > 0 && <polyline points={[...poly, ...(hover ? [hover] : [])].map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />}
                {poly.map((p, k) => (
                  <circle key={k} cx={p[0]} cy={p[1]} r={3 / zoom} fill="var(--select)" />
                ))}
                {tool === 'corner' &&
                  one &&
                  cornerNodes(one).map((q) => {
                    const on = picked?.item === one.id && picked.nodes.includes(q.i);
                    return <circle key={q.i} cx={q.p[0]} cy={q.p[1]} r={4 / zoom} fill={on ? 'var(--select)' : '#ffffff'} stroke="var(--select)" strokeWidth={1.2 / zoom} />;
                  })}
                {pen.length > 0 && (
                  <g fill="none" stroke="var(--select)" strokeWidth={1 / zoom}>
                    <path d={pen.map((q, k) => (k === 0 ? `M${q.p[0]},${q.p[1]}` : `C${(pen[k - 1].cout ?? pen[k - 1].p).join(',')} ${(q.cin ?? q.p).join(',')} ${q.p.join(',')}`)).join('') + (hover ? `L${hover[0]},${hover[1]}` : '')} />
                    {pen.map((q, k) => (
                      <g key={k}>
                        {q.cout && q.cin && <path d={`M${q.cin.join(',')}L${q.cout.join(',')}`} strokeDasharray={`${2 / zoom} ${2 / zoom}`} />}
                        <rect x={q.p[0] - 2.5 / zoom} y={q.p[1] - 2.5 / zoom} width={5 / zoom} height={5 / zoom} fill={k === 0 ? 'var(--select)' : '#ffffff'} />
                      </g>
                    ))}
                  </g>
                )}
              </svg>
            </div>
          </div>
        </div>
        {ui.side}
      </div>
      {ui.status}
    </div>,
    document.body,
  );
}

// A line's ends stuck to shapes (a connector): to which, where on them, how far off.
const SIDES: [StickSide, string][] = [
  ['auto', 'facing the other end'],
  ['t', 'top'],
  ['b', 'bottom'],
  ['l', 'left'],
  ['r', 'right'],
  ['c', 'centre'],
];
function StickFields({ it, items, set }: { it: AnnotationItem; items: AnnotationItem[]; set: (p: Partial<ShapeSpec>) => void }) {
  const s = shapeSpec(it.spec as Partial<ShapeSpec>);
  const shapes: [string, string][] = [['', 'free (not stuck)'], ...items.filter((x) => x.id !== it.id && !lineLike(x)).map((x): [string, string] => [x.id, nameOf(x)])];
  const end = (label: string, k: 'from' | 'to', at: 'fromAt' | 'toAt') => (
    <Field label={label} title="The shape this end is stuck to (it follows the shape), and where on it: also: drop the end's handle on a shape, or draw the line from one shape to another">
      <span className="row">
        <Select value={s[k] ?? ''} options={shapes} onChange={(v) => set({ [k]: v || undefined })} />
        {s[k] && <Select<StickSide> value={s[at] ?? 'auto'} options={SIDES} onChange={(v) => set({ [at]: v === 'auto' ? undefined : v })} />}
      </span>
    </Field>
  );
  return (
    <>
      {end('Start stuck to', 'from', 'fromAt')}
      {end('End stuck to', 'to', 'toAt')}
      {(s.from || s.to) && (
        <Field label="Away from them" title="pt between the shape and the line's end">
          <NumInput className="tiny" min={0} step={0.5} value={s.away ?? 0} onChange={(v) => set({ away: v > 0 ? v : undefined })} />
        </Field>
      )}
    </>
  );
}

// Several shapes selected: their line and fill set at once.
function CommonStroke({ items, set }: { items: AnnotationItem[]; set: (p: Partial<ShapeSpec>) => void }) {
  const s = shapeSpec(items[0].spec as Partial<ShapeSpec>);
  return (
    <div className="grid2">
      <Field label="Line colour">
        <input className="nodrag color" type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} />
      </Field>
      <Field label="Width" title="pt">
        <NumInput className="tiny" min={0} step={0.25} value={s.width} onChange={(v) => set({ width: Math.max(0, v || 0) })} />
      </Field>
      <Field label="Dash">
        <Select<Dash> value={s.dash} options={DASHES} onChange={(dash) => set({ dash })} />
      </Field>
      <Field label="Fill">
        <OptColor value={s.fill} onChange={(fill) => set({ fill })} />
      </Field>
    </div>
  );
}
