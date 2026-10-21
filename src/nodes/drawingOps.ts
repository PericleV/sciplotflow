// The objects of a Figure Drawing (shapes and texts in mm): moved, scaled, aligned and spread out, their boxes, and the
// snapping of a place to the grid and to the edges and middles of the other objects.
import { shapeSpec } from '../engine/evaluate.ts';
import type { Pt } from '../figure/shapes.ts';
import { isClosed, parsePath, pathBox, pathPolylines, shapeToPath } from '../figure/paths.ts';
import { lineLength, pointAlong } from '../figure/shapes.ts';
import { newAnnotation } from '../defaults.ts';
import { moveItem, rotateItem } from '../engine/drawingItems.ts';
import type { AnnotationItem } from '../types.ts';

export const MM = 72 / 25.4; // pt in a mm

// the objects copied (Ctrl+C), pasted in this drawing or another one
let copied: AnnotationItem[] = [];
export const copyItems = (list: AnnotationItem[]) => {
  copied = list.map((it) => structuredClone(it));
};
export const copiedItems = () => copied;
export type Rect = { x: number; y: number; w: number; h: number };

export { mapItem, moveItem, rotateItem } from '../engine/drawingItems.ts';

// The box of an object from its points (mm), when they give it (not turned, no text, no curve bulging out); else null
// (then measured on the drawing).
export function geomBox(it: AnnotationItem): Rect | null {
  if (it.type !== 'shape') return null;
  const s = shapeSpec(it.spec);
  // turned, or stuck to other shapes (its ends found when drawn): measured
  if (s.rotation || s.from || s.to) return null;
  let pts: Pt[] = [];
  switch (s.kind) {
    case 'path':
      return pathBox(parsePath(s.d));
    case 'image':
    case 'component':
      pts = [[s.x1, s.y1], [s.x2, s.y2]];
      break;
    case 'line':
    case 'arrow':
      if (s.curve && !s.bends) return null;
      if (s.bends) return null;
      pts = [[s.x1, s.y1], [s.x2, s.y2]];
      break;
    case 'rect':
    case 'ellipse':
    case 'star':
    case 'regular':
      pts = [[s.x1, s.y1], [s.x2, s.y2]];
      break;
    case 'polygon':
      if (s.smooth) return null;
      pts = s.points
        .split(';')
        .map((q) => q.trim().split(/[\s,]+/).map(Number))
        .filter((q) => q.length >= 2 && q.every(Number.isFinite))
        .map((q): Pt => [q[0], q[1]]);
      break;
    default:
      return null;
  }
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

export const union = (bs: Rect[]): Rect | null => {
  if (!bs.length) return null;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
};

// Where some places (cands) go: the nearest of the targets within tol (a guide drawn there); else, with a grid step, the
// nearest grid line (whichever place is nearest one). d: the move to add.
export function snapAxis(cands: number[], targets: number[], grid: number, tol: number): { d: number; guide: number | null } {
  let best: { d: number; guide: number } | null = null;
  for (const c of cands)
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, guide: t };
    }
  if (best) return best;
  if (grid > 0) {
    let g: number | null = null;
    for (const c of cands) {
      const d = Math.round(c / grid) * grid - c;
      if (g === null || Math.abs(d) < Math.abs(g)) g = d;
    }
    return { d: g ?? 0, guide: null };
  }
  return { d: 0, guide: null };
}

export type AlignHow = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
// The moves (mm) that align the boxes: to the box of them all, or to `to` (the page).
export function alignMoves(boxes: Rect[], how: AlignHow, to?: Rect): Pt[] {
  const all = to ?? union(boxes);
  if (!all) return [];
  return boxes.map((b): Pt => {
    switch (how) {
      case 'left':
        return [all.x - b.x, 0];
      case 'hcenter':
        return [all.x + all.w / 2 - (b.x + b.w / 2), 0];
      case 'right':
        return [all.x + all.w - (b.x + b.w), 0];
      case 'top':
        return [0, all.y - b.y];
      case 'vcenter':
        return [0, all.y + all.h / 2 - (b.y + b.h / 2)];
      case 'bottom':
        return [0, all.y + all.h - (b.y + b.h)];
    }
  });
}
// The moves (mm) that spread the boxes out across (h) or down (v): the first and last stay, equal gaps between them all.
export function distributeMoves(boxes: Rect[], dir: 'h' | 'v'): Pt[] {
  const n = boxes.length;
  const moves: Pt[] = boxes.map(() => [0, 0]);
  if (n < 3) return moves;
  const lo = (b: Rect) => (dir === 'h' ? b.x : b.y);
  const len = (b: Rect) => (dir === 'h' ? b.w : b.h);
  const order = boxes.map((_, k) => k).sort((a, b) => lo(boxes[a]) + len(boxes[a]) / 2 - (lo(boxes[b]) + len(boxes[b]) / 2));
  const first = boxes[order[0]];
  const last = boxes[order[n - 1]];
  const span = lo(last) + len(last) - lo(first);
  const gap = (span - order.reduce((a, k) => a + len(boxes[k]), 0)) / (n - 1);
  let at = lo(first);
  for (const k of order) {
    const d = at - lo(boxes[k]);
    moves[k] = dir === 'h' ? [d, 0] : [0, d];
    at += len(boxes[k]) + gap;
  }
  return moves;
}

// ---- paths, colours, arrays ----
// an object's outline as a path (mm): a shape's own, a path's; a text has none
export function pathOf(it: AnnotationItem): string | null {
  if (it.type !== 'shape') return null;
  return shapeToPath({ ...shapeSpec(it.spec), coords: 'data' }, MM);
}
// a shape turned into a path (its look kept; its corners, turn and curves in the points)
export function toPathItem(it: AnnotationItem): AnnotationItem | null {
  const d = pathOf(it);
  if (!d || it.type !== 'shape') return null;
  const s = shapeSpec(it.spec);
  const keep = Object.fromEntries(Object.entries(it.spec).filter(([k]) => !['x1', 'y1', 'x2', 'y2', 'points', 'bends', 'curve', 'route', 'elbowAt', 'body', 'n', 'inner', 'a1', 'a2', 'sector', 'hole', 'smooth', 'closed', 'rotation', 'radius', 'from', 'to', 'fromAt', 'toAt', 'text', 'text2', 'orient', 'bstyle', 'offset', 'dec', 'unit', 'href', 'ref'].includes(k)));
  const open = !isClosed(parsePath(d));
  return { ...it, spec: { ...keep, kind: 'path', d, ...(open ? { head1: s.head1, head2: s.head2 } : { head1: 'none', head2: 'none' }) } } as AnnotationItem;
}
export const newId = () => newAnnotation('shape').id;
export const fresh = (it: AnnotationItem): AnnotationItem => ({ ...structuredClone(it), id: newId() });
// copies of a set of objects, each set in a new group when the objects were in one (their links kept among them)
export function copiesOf(list: AnnotationItem[], f: (it: AnnotationItem) => AnnotationItem): AnnotationItem[] {
  const ids = new Map(list.map((it) => [it.id, newId()]));
  const groups = new Map<string, string>();
  return list.map((it) => {
    const c = f({ ...structuredClone(it), id: ids.get(it.id)! });
    const g = it.group ? (groups.get(it.group) ?? groups.set(it.group, `g${newId()}`).get(it.group)) : undefined;
    const relink = (k: string | undefined) => (k && ids.has(k) ? ids.get(k) : k);
    const spec = c.type === 'shape' ? { ...c.spec, from: relink(c.spec.from), to: relink(c.spec.to) } : c.type === 'text' ? { ...c.spec, onPath: relink(c.spec.onPath) } : c.spec;
    return { ...c, spec, ...(g ? { group: g } : {}), ...(c.clipBy ? { clipBy: relink(c.clipBy) } : {}), ...(c.maskBy ? { maskBy: relink(c.maskBy) } : {}) } as AnnotationItem;
  });
}
// a grid of copies (rows × cols, dx, dy mm apart; the objects themselves the first)
export function gridArray(list: AnnotationItem[], rows: number, cols: number, dx: number, dy: number): AnnotationItem[] {
  const out: AnnotationItem[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r || c) out.push(...copiesOf(list, (it) => moveItem(it, c * dx, r * dy)));
  return out;
}
// n round a circle about c (the objects themselves the first), turned with it or not
export function circleArray(list: AnnotationItem[], n: number, c: Pt, from: Pt, turn: boolean): AnnotationItem[] {
  const out: AnnotationItem[] = [];
  for (let k = 1; k < n; k++) {
    const deg = (k * 360) / n;
    const a = (deg * Math.PI) / 180;
    const to: Pt = [c[0] + (from[0] - c[0]) * Math.cos(a) - (from[1] - c[1]) * Math.sin(a), c[1] + (from[0] - c[0]) * Math.sin(a) + (from[1] - c[1]) * Math.cos(a)];
    out.push(...copiesOf(list, (it) => (turn ? rotateItem(it, c, deg) : moveItem(it, to[0] - from[0], to[1] - from[1]))));
  }
  return out;
}
// the colours of objects (lines, fills, texts …), and one of them changed everywhere in them
const SHAPE_COLORS = ['color', 'fill', 'fill2', 'hatchColor', 'shadowColor'];
const TEXT_COLORS = ['boxColor', 'borderColor'];
export function colorsOf(list: AnnotationItem[]): string[] {
  const out = new Set<string>();
  for (const it of list) {
    const s = it.spec as Record<string, unknown>;
    for (const k of it.type === 'shape' ? SHAPE_COLORS : TEXT_COLORS) if (typeof s[k] === 'string' && s[k]) out.add((s[k] as string).toLowerCase());
    const st = (it.type === 'shape' ? s.textStyle : s.style) as { color?: string } | undefined;
    if (st?.color) out.add(st.color.toLowerCase());
  }
  return [...out];
}
export function recolor(list: AnnotationItem[], from: string, to: string): AnnotationItem[] {
  const f = from.toLowerCase();
  return list.map((it) => {
    const s = { ...(it.spec as Record<string, unknown>) };
    for (const k of it.type === 'shape' ? SHAPE_COLORS : TEXT_COLORS) if (typeof s[k] === 'string' && (s[k] as string).toLowerCase() === f) s[k] = to;
    const sk = it.type === 'shape' ? 'textStyle' : 'style';
    const st = s[sk] as { color?: string } | undefined;
    if (st?.color?.toLowerCase() === f) s[sk] = { ...st, color: to };
    return { ...it, spec: s } as AnnotationItem;
  });
}
// a group of the objects selected: together, where the front one of them was; and none
export function groupItems(items: AnnotationItem[], sel: string[]): AnnotationItem[] {
  if (sel.length < 2) return items;
  const g = `g${newId()}`;
  const list = items.filter((it) => sel.includes(it.id)).map((it) => ({ ...it, group: g }));
  const at = Math.max(...sel.map((k) => items.findIndex((it) => it.id === k)));
  return [...items.slice(0, at + 1).filter((it) => !sel.includes(it.id)), ...list, ...items.slice(at + 1).filter((it) => !sel.includes(it.id))];
}
export const ungroupItems = (items: AnnotationItem[], sel: string[]) => items.map((it) => (sel.includes(it.id) ? { ...it, group: undefined } : it));
// n copies of a set of objects along a path (mm; its longest part): their middle `from` on evenly spaced points — the
// ends of an open one included, round a closed one — turned with it or not
export function pathArray(list: AnnotationItem[], d: string, n: number, from: Pt, turn: boolean): AnnotationItem[] {
  const segs = parsePath(d);
  const lines = pathPolylines(segs, 24);
  if (!lines.length || n < 1) return [];
  const line = lines.reduce((a, b) => (lineLength(b) > lineLength(a) ? b : a));
  const closed = isClosed(segs) && Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]) < 1e-6;
  const out: AnnotationItem[] = [];
  for (let k = 0; k < n; k++) {
    const t = closed ? k / n : n === 1 ? 0.5 : k / (n - 1);
    const { p, u } = pointAlong(line, t);
    const deg = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
    out.push(...copiesOf(list, (it) => {
      const moved = moveItem(it, p[0] - from[0], p[1] - from[1]);
      return turn && Math.abs(deg) > 1e-9 ? rotateItem(moved, p, deg) : moved;
    }));
  }
  return out;
}
