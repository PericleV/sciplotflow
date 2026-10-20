// The editor of a Figure Drawing, over the whole window: the tools on top (what the next drag on the page draws, the
// alignment, the grid and snapping, the zoom); on the left the layers (the objects, the front one first: shown,
// locked, named, reordered) and the options of what is selected (the page and the grid when nothing is); the page in
// the middle, with rulers in mm and the grid. Objects are selected by a click (Shift / Ctrl: more), a box dragged
// around them or in the layers; dragged to move them (snapped to the grid and to the edges and middles of the others
// and of the page: guides show it; Alt: no snapping), their handles change their points; the keyboard moves, copies
// and removes them.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { plotMapping, shapeSpec } from '../engine/evaluate.ts';
import { anchorOf } from '../engine/drawingItems.ts';
import { FigureSvg } from '../figure/render.tsx';
import { HandleScale, Interactive, PickedNodes, type DragInfo } from '../figure/interactive.ts';
import { DASHES } from './figureOptions.ts';
import { TEXT_SPEC_DEFAULTS, toPt, type Dash, type Figure, type ShapeSpec } from '../figure/spec.ts';
import { DRAWING_GRID_DEFAULTS, newAnnotation } from '../defaults.ts';
import type { AnnotationItem, AppNode, DrawingData, DrawingGrid } from '../types.ts';
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
  Component,
  Copy,
  DraftingCompass,
  Eye,
  EyeOff,
  Layers,
  Library,
  Lock,
  LockOpen,
  SendToBack,
  Trash,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ComponentsTab, LibraryTab, ObjectOps, TextPathFields, type Ctx } from './DrawingPanels.tsx';
import { copyStyle, pasteStyle } from './figureLibrary.ts';
import { CORNERED, cornersOf, cornersText, deleteNode, insertNode, parsePath, pathText, radiiOf, shapeToPath, toggleNode } from '../figure/paths.ts';
import { PageControls } from './FigureView.tsx';
import { OptColor } from './fields.tsx';
import { Check, Field, NumInput, Select } from './ui.tsx';
import { alignMoves, copiedItems, copyItems, distributeMoves, groupItems, toPathItem, ungroupItems, geomBox, mapItem, MM, moveItem, snapAxis, union, type AlignHow, type Rect } from './drawingOps.ts';
import type { Pt, StickSide } from '../figure/shapes.ts';
import { IMAGE_ACCEPT, imageUrl } from '../imageFile.ts';

type Tool = 'select' | 'corner' | 'pen' | 'image' | 'text' | 'line' | 'arrow' | 'double' | 'curved' | 'elbow' | 'equilibrium' | 'retro' | 'dimension' | 'rect' | 'ellipse' | 'polygon' | 'polyline' | 'star' | 'regular' | 'arc' | 'bracket' | 'brace' | 'callout';
// what each tool draws: its first look (the points come from the drag)
const TOOLS: { tool: Tool; title: string; key?: string; spec?: Partial<ShapeSpec> }[] = [
  { tool: 'select', title: 'Select and move (V): click an object, Shift / Ctrl + click more, or drag a box around them', key: 'v' },
  { tool: 'corner', title: 'Corners (K): click a shape, then its corners (Shift: more) and drag one inward to round them — as much as you drag (its radius also typed in the options)', key: 'k' },
  { tool: 'pen', title: 'Pen (B): click for a corner, drag for a smooth node (its curve); click the first node to close the path, double-click (or Enter) to end it open', key: 'b' },
  { tool: 'image', title: 'Image (I): a picture from a file (PNG, JPEG, TIFF, SVG …) — also paste one (Ctrl+V) or drop it on the page', key: 'i' },
  { tool: 'text', title: 'Text (T): click where it goes', key: 't' },
  { tool: 'line', title: 'Line (L): drag from its start to its end (Shift: by 15°)', key: 'l', spec: { kind: 'line', head2: 'none' } },
  { tool: 'arrow', title: 'Arrow (A): drag from its start to its head (Shift: by 15°)', key: 'a', spec: { kind: 'arrow' } },
  { tool: 'double', title: 'Double-headed arrow: drag from one end to the other', spec: { kind: 'arrow', head1: 'triangle', head2: 'triangle' } },
  { tool: 'curved', title: 'Curved arrow: drag from its start to its head (then its middle handle bends it; + Bend: through more points)', spec: { kind: 'arrow', curve: 0.3 } },
  { tool: 'elbow', title: 'Elbow arrow (a connector): drag from one shape to another — its ends stay stuck to them when they move', spec: { kind: 'arrow', route: 'hvh' } },
  { tool: 'equilibrium', title: 'Equilibrium arrow: drag from its start to its end (Body: favouring a side; texts above and below it)', spec: { kind: 'arrow', body: 'equilibrium', head1: 'none', head2: 'none', headSize: 4, gap: 2.5 } },
  { tool: 'retro', title: 'Retrosynthetic arrow: drag from its start to its head', spec: { kind: 'arrow', body: 'retro', head1: 'none', head2: 'none', headSize: 5, gap: 3 } },
  { tool: 'dimension', title: 'Dimension: drag from one point to the other — the length is written on it (mm); its handle in the middle moves it aside', spec: { kind: 'dimension', head1: 'triangle', head2: 'triangle', headSize: 4, width: 0.5, offset: 6, unit: 'mm', dec: 1 } },
  { tool: 'rect', title: 'Rectangle (R): drag a corner to the other (Shift: a square)', key: 'r', spec: { kind: 'rect' } },
  { tool: 'ellipse', title: 'Ellipse (E): drag its box (Shift: a circle)', key: 'e', spec: { kind: 'ellipse' } },
  { tool: 'polygon', title: 'Polygon (P): click its corners, double-click (or Enter) to close it', key: 'p', spec: { kind: 'polygon', closed: true, fill: '#56B4E9', fillOpacity: 0.3, color: '#0072B2' } },
  { tool: 'polyline', title: 'Polyline: click its points, double-click (or Enter) to end it', spec: { kind: 'polygon', closed: false } },
  { tool: 'star', title: 'Star or regular polygon: drag its box (Shift: as wide as high) — which of the two, its points or sides: in its options (Variant)', spec: { kind: 'star', n: 5, inner: 0.382, fill: '#E69F00', fillOpacity: 1, width: 0.5 } },
  { tool: 'arc', title: 'Arc / sector: drag the box of its ellipse', spec: { kind: 'arc', a1: 0, a2: 90, sector: true, fill: '#009E73', fillOpacity: 0.5, width: 0.5 } },
  { tool: 'bracket', title: 'Bracket: drag from one end to the other', spec: { kind: 'bracket', orient: 'free', bstyle: 'square', headSize: 4, text: '*' } },
  { tool: 'brace', title: 'Curly brace: drag from one end to the other', spec: { kind: 'bracket', orient: 'free', bstyle: 'curly', headSize: 6, text: '' } },
  { tool: 'callout', title: 'Callout: drag from the box of its text to the point it shows', spec: { kind: 'callout', text: 'Note', fill: '#ffffff', fillOpacity: 1, width: 0.5, head2: 'triangle', headSize: 4, pad: 2, radius: 2 } },
];
const BOXED = new Set<Tool>(['rect', 'ellipse', 'star', 'regular', 'arc']);
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
export function DrawingEditor({ id, data, fig, under, pinShift, onClose, first }: { id: string; data: DrawingData; fig: Figure | undefined; under?: Figure; pinShift?: Record<string, [number, number]>; onClose: () => void; first?: string }) {
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  const items = useMemo(() => data.annotations ?? [], [data.annotations]);
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
    // their boxes, once drawn
    const frame = requestAnimationFrame(() => {
      const out: Record<string, Rect> = {};
      for (const it of items) {
        const body = partOf(it.id)?.querySelector<SVGGraphicsElement>('[data-body]');
        if (!body) continue;
        try {
          const b = body.getBBox();
          out[it.id] = { x: b.x, y: b.y, w: b.width, h: b.height };
        } catch {
          // not drawn yet
        }
      }
      setMeasured((m) => (JSON.stringify(m) === JSON.stringify(out) ? m : out));
    });
    return () => cancelAnimationFrame(frame);
  }, [fig, sel, items]);
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
  const selBox = union(selected.map(boxMm).filter((b): b is Rect => !!b));

  // ---- snapping: the grid step (pt), how near counts (6 px), the edges and middles of the others and of the page ----
  const step = grid.snap ? (grid.unit === 'pt' ? grid.step : grid.step * MM) : 0;
  const tol = 6 / zoom;
  const targets = (skip: string[]) => {
    const xs = [0, W / 2, W];
    const ys = [0, H / 2, H];
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
  const snapPoint = (p: Pt, skip: string[], free: boolean): Pt => {
    if (free) return p;
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
    const [x1, y1, x2, y2] = [a[0] / MM, a[1] / MM, b[0] / MM, b[1] / MM].map((v) => +v.toFixed(3));
    const it = newAnnotation('shape', { coords: 'data', ...spec, x1, y1, x2, y2, ...stick });
    add([it]);
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
    if (tool === 'polygon' || tool === 'polyline') {
      setPoly((q) => [...q, snapPoint(p0, [], free)]);
      return;
    }
    if (tool === 'pen') {
      const q = snapPoint(p0, [], free);
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
    if (tool === 'image') return;
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
        follow(
          (ev) => {
            const q = at(ev);
            const r = Math.max(0, r0 + (q[0] - p0[0]) * bis[0] + (q[1] - p0[1]) * bis[1]);
            setItems(items.map((x) => (x.id === it.id ? withRadius(x, list, +r.toFixed(2)) : x)));
          },
          () => {},
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
      add([newAnnotation('text', { coords: 'data', x: +(q[0] / MM).toFixed(3), y: +(q[1] / MM).toFixed(3), anchor: 'tl' })]);
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
      follow(
        (ev) => {
          const p = at(ev);
          if (!dragged && Math.hypot(p[0] - p0[0], p[1] - p0[1]) * zoom < 2) return;
          dragged = true;
          let q: Pt = [h0[0] + p[0] - p0[0], h0[1] + p[1] - p0[1]];
          if (!turning) q = snapPoint(q, [hit.id], ev.altKey);
          last = [q[0] - h0[0], q[1] - h0[1], ev.shiftKey];
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => updateNodeData(id, tidy(info.apply(last[0], last[1], data0, last[2]), hit.id)));
        },
        (ev) => {
          cancelAnimationFrame(frame);
          // a click on a path's node: picked (Shift: one more, or one less)
          if (!dragged && anchorAt != null) {
            const n = Number(anchorAt);
            const had = picked?.item === hit.id ? picked.nodes : [];
            setPicked({ item: hit.id, nodes: ev.shiftKey ? (had.includes(n) ? had.filter((x) => x !== n) : [...had, n]) : had.length === 1 && had[0] === n ? [] : [n] });
            return;
          }
          // the last move (its frame cancelled above) kept
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
    const els = moving.flatMap((it) => Array.from(svgOf()?.querySelectorAll<SVGGElement>(`[data-part="ann:${it.id}"]`) ?? []));
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
        for (const g of els) g.setAttribute('transform', `translate(${dx.toFixed(3)} ${dy.toFixed(3)})`);
      },
      () => {
        for (const g of els) g.removeAttribute('transform');
        if (!started) return;
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
    const mm = (q: Pt) => [q[0] / MM, q[1] / MM];
    const piece = (a: (typeof nodes)[number], b: (typeof nodes)[number]) => (a.cout || b.cin ? { c: 'C' as const, p: [...mm(a.cout ?? a.p), ...mm(b.cin ?? b.p), ...mm(b.p)] } : { c: 'L' as const, p: mm(b.p) });
    if (nodes.length >= 2) {
      const segs = [{ c: 'M' as const, p: mm(nodes[0].p) }, ...nodes.slice(1).map((b, k) => piece(nodes[k], b))];
      if (close && nodes.length > 2) segs.push(piece(nodes[nodes.length - 1], nodes[0]), { c: 'Z' as const, p: [] } as never);
      add([newAnnotation('shape', { kind: 'path', coords: 'data', d: pathText(segs), head1: 'none', head2: 'none', ...(close ? { fill: '#56B4E9', fillOpacity: 0.3, color: '#0072B2' } : {}) })]);
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
      out.push({ i, p: [(p[0] + hx) * MM, (p[1] + hy) * MM] });
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
  const addImage = (file: File) => {
    if (file.size > 3e6 && !confirm(`${file.name} is ${(file.size / 1e6).toFixed(1)} MB: it goes into the project (and its files). Place it anyway?`)) return;
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
    }, (e: Error) => alert(`${file.name}: ${e.message}`));
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
      const p = at(e);
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
      const points = pts.map(([x, y]) => `${+(x / MM).toFixed(3)} ${+(y / MM).toFixed(3)}`).join('; ');
      add([newAnnotation('shape', { coords: 'data', ...spec, points, closed: tool === 'polygon' && pts.length > 2 })]);
    }
    setPoly([]);
    setTool('select');
  };

  // ---- the selection: moved, aligned, spread, ordered, copied, removed ----
  const moveSel = (dx: number, dy: number) => setItems(items.map((it) => (sel.includes(it.id) && !it.locked ? moveItem(it, dx, dy) : it)));
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

  const toolbar: ReactNode = (
    <div className="de-toolbar">
      <span className="de-title" title={`Figure Drawing — ${data.name || 'drawing'}`}>
        <DraftingCompass {...ICON} />
        <span>Figure Drawing</span>
        <span className="muted">— {data.name || 'drawing'}</span>
      </span>
      <span className="de-group">
        {TOOLS.map((t) => (
          <button key={t.tool} className={`nodrag de-tool${tool === t.tool ? ' on' : ''}`} title={t.title} onClick={() => (t.tool === 'image' ? pickImage() : setTool(t.tool), setPoly([]), setPen([]))}>
            {(() => {
              const I = TOOL_ICONS[t.tool];
              return <I {...ICON} />;
            })()}
          </button>
        ))}
      </span>
      <span className="de-group" title="Align the selected objects (one object: to the page)">
        {ALIGN.map(([how, I, title]) => (
          <button key={how} className="nodrag de-tool" title={title} disabled={!sel.length} onClick={() => align(how)}>
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
        <Check label="Grid" title="Show the grid (only here: not drawn in the figure)" value={grid.show} onChange={(show) => set({ grid: { ...grid, show } })} />
        <Check label="Snap" title="Objects and points snapped to the grid (Alt while dragging: free)" value={grid.snap} onChange={(snap) => set({ grid: { ...grid, snap } })} />
        <NumInput className="tiny" min={0.01} step={0.5} value={grid.step} title="The grid's step" onChange={(v) => set({ grid: { ...grid, step: v > 0 ? v : 1 } })} />
        <Select<'mm' | 'pt'>
          value={grid.unit}
          options={[
            ['mm', 'mm'],
            ['pt', 'pt'],
          ]}
          onChange={(unit) => set({ grid: { ...grid, unit } })}
        />
        <Check label="Snap to objects" title="To the edges and middles of the other objects and of the page (guides show it)" value={data.snapObjects !== false} onChange={(snapObjects) => set({ snapObjects })} />
      </span>
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
      <span className="grow" />
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
        {!items.length && <div className="hint">No objects yet: choose a tool above and drag on the page.</div>}
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
          <PageControls page={data} set={(p) => set(p)} fixed={under ? `Size: ${under.width} × ${under.height} ${under.unit} — the figure under the drawing's (${guide ? 'only a guide' : 'drawn with it'}).` : undefined} />
          <div className="hint">The grid: in the bar above (shown, snapped, its step). Objects: a tool, then drag on the page.</div>
        </>
      )}
      {selected.length > 0 && (
        <>
          <div className="de-head">{one ? nameOf(one) : `${selected.length} objects`}</div>
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
          {selBox && (
            <Field label="Box x, y, w, h mm" title="The place and size of the selection (typed: moved, or stretched from its top-left corner)">
              <span className="row">
                <NumInput className="short" step={0.5} value={sMm(selBox.x)} onChange={(x) => Number.isFinite(x) && setBox({ x })} />
                <NumInput className="short" step={0.5} value={sMm(selBox.y)} onChange={(y) => Number.isFinite(y) && setBox({ y })} />
                <NumInput className="short" min={0.01} step={0.5} value={sMm(selBox.w)} onChange={(w) => w > 0 && setBox({ w })} />
                <NumInput className="short" min={0.01} step={0.5} value={sMm(selBox.h)} onChange={(h) => h > 0 && setBox({ h })} />
              </span>
            </Field>
          )}
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
          {one?.type === 'shape' && shapeSpec(one.spec).kind !== 'component' && <ShapeEditor s={{ ...shapeSpec(one.spec), ...endsOf(one), coords: 'data' }} where="drawing" set={(p) => setSpec(one.id, p)} />}
          {one?.type === 'shape' && shapeSpec(one.spec).kind === 'component' && <div className="hint">An instance of “{data.components?.find((c) => c.id === one.spec.ref)?.name ?? 'a removed component'}”: placed and sized by its box; it changes with its component (Component ▸ Update; Detach: objects of its own).</div>}
          {one?.type === 'text' && <TextEditor s={{ ...TEXT_SPEC_DEFAULTS, ...one.spec, coords: 'data' }} where="drawing" set={(p) => setSpec(one.id, p)} extra={<TextPathFields it={one} items={items} set={(p) => setSpec(one.id, p)} />} />}
          <ObjectOps ctx={ctx} />
          {!one && shapesSel.length > 0 && <CommonStroke items={shapesSel} set={(patch) => setItems(items.map((it) => (shapesSel.includes(it) ? ({ ...it, spec: { ...it.spec, ...patch } } as AnnotationItem) : it)))} />}
        </>
      )}
    </div>
  );

  // the grid (only here), in pt of the page
  const gridLines = (() => {
    if (!grid.show || !(gridMm > 0)) return null;
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
      {toolbar}
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
      <div className="de-body">
        <div className="de-side node inspector-options">
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
          {options}
        </div>
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
            <div className="de-rulers" style={{ left: 40, top: 22 }}>
              {ruler(mmW, true)}
            </div>
            <div className="de-rulers" style={{ left: 22, top: 40 }}>
              {ruler(mmH, false)}
            </div>
            <div
              ref={page}
              className={`de-page tool-${tool}${data.background === 'none' ? ' checker' : ''}`}
              style={{ left: 40, top: 40, width: dispW, height: dispH }}
              onPointerDown={down}
              onPointerMove={(e) => (((tool === 'polygon' || tool === 'polyline') && poly.length) || (tool === 'pen' && pen.length)) && setHover(at(e))}
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
                        <FigureSvg fig={guide ? { ...fig, background: 'none' } : fig} display={{ width: dispW, height: dispH }} idPrefix={`de-${id}`} />
                      </PickedNodes.Provider>
                    </HandleScale.Provider>
                  </Interactive.Provider>
                )}
              </div>
              <svg className="de-overlay" width={dispW} height={dispH} viewBox={`0 0 ${W.toFixed(3)} ${H.toFixed(3)}`}>
                {gridLines}
                {selected.map((it) => {
                  const b = boxPt(it);
                  return b ? <rect key={it.id} x={b.x} y={b.y} width={Math.max(b.w, 0.01)} height={Math.max(b.h, 0.01)} fill="none" stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} /> : null;
                })}
                {selected.length > 1 && selBox && <rect x={selBox.x * MM} y={selBox.y * MM} width={selBox.w * MM} height={selBox.h * MM} fill="none" stroke="var(--select)" strokeOpacity={0.6} strokeWidth={1.5 / zoom} />}
                {guides.x !== null && <line x1={guides.x} x2={guides.x} y1={0} y2={H} stroke="#e6007e" strokeWidth={1 / zoom} />}
                {guides.y !== null && <line y1={guides.y} y2={guides.y} x1={0} x2={W} stroke="#e6007e" strokeWidth={1 / zoom} />}
                {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="var(--select)" fillOpacity={0.08} stroke="var(--select)" strokeWidth={1 / zoom} />}
                {preview &&
                  (BOXED.has(tool) ? (
                    <rect x={Math.min(preview.a[0], preview.b[0])} y={Math.min(preview.a[1], preview.b[1])} width={Math.abs(preview.b[0] - preview.a[0])} height={Math.abs(preview.b[1] - preview.a[1])} fill="none" stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
                  ) : (
                    <line x1={preview.a[0]} y1={preview.a[1]} x2={preview.b[0]} y2={preview.b[1]} stroke="var(--select)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
                  ))}
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
      </div>
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
    <Field label={label} title="The shape this end is stuck to (it follows the shape), and where on it — also: drop the end's handle on a shape, or draw the line from one shape to another">
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
