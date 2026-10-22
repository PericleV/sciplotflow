// Phase digitizer: a phase diagram read off its image. The Digitizer's calibration (two points on each axis, the four
// corners, many points for a curved page) maps the image's pixels to the data; on it:
// - the frame of the diagram (its border: four corners, else the box of the calibration);
// - the phase boundaries, clicked as lines (two points: a straight line; more: a smooth curve through them, or straight
//   pieces), their ends caught on the frame and on the other lines;
// - the regions they close with the frame: the faces of the planar graph the lines make, found again whenever a line
//   moves; a region is known by its label (a point inside the face), so it keeps its name, colour and label;
// - points placed on the diagram: the lever rule (the tie line at the point's temperature to the nearest boundaries
//   left and right — in the data: straight on a turned or curved page —, the compositions of its ends, the amounts of
//   the two phases, its arms; a region named without “+” is one phase, 100 %), a point read (its region and values),
//   or a path down or up at its X (the boundaries crossed, the phases between them, the microconstituents at an
//   invariant line: the lever rule just before it, the end inside the line the constituent formed on it).
// The tables (the points, every boundary) and the figure drawn again in the data. Pure: also used by the scripts.
import { calibrate, type AxisPt, type CalMode, type Calibration, type GridFit, type GridPt, type Px } from './digitize.ts';
import type { AnnotationItem } from '../types.ts';
import { curveStyle, SHAPE_DEFAULTS, TEXT_SPEC_DEFAULTS, type Curve, type TextStyle } from '../figure/spec.ts';
import { plainText } from '../figure/draw.ts';
import { column, fmtNum, type Column, type Dataset, type Workbook } from './table.ts';

export type { Px, AxisPt, GridPt, CalMode, GridFit };

// a boundary: only a line (they are all drawn alike, the colours are the regions'); its name in the tables
export type PhaseSpline = {
  id: string;
  name: string;
  color: string; // (older nodes: not drawn)
  points: Px[]; // image pixels, in the order along the line
  smooth?: boolean; // false: straight pieces between the points (absent, older nodes: a smooth curve through them)
  closed?: boolean; // back to its first point (an island, a dome)
  corners?: number[]; // its points marked corners, or smooth (rounds), else as it turns (cornersOf)
  rounds?: number[];
  // an invariant line (eutectic, eutectoid, peritectic …): a path crossing it gives the microconstituents just before it
  // (the primary phase and the constituent formed on the line: micro, e.g. eutectic, pearlite; absent: the line's name)
  invariant?: boolean;
  micro?: string;
};

// a region: its look and its label; the face of the diagram it fills is the one its label point lies in
export type PhaseRegion = {
  id: string;
  name: string; // rich text (\alpha + L)
  color: string;
  opacity: number;
  labelPt: Px;
  textStyle?: TextStyle;
  phases?: 1 | 2; // one phase or two (the lever rule there); absent: from its name (see regionPhases)
  poly?: Px[]; // (older nodes kept the outline; it is found again from the lines)
};
// the phases of a region: chosen, else from its name — “α + L”: two; another name: one; none, or one given by Draw
// regions (R1, R2 …), or no region: two (the lever rule shown until it is named)
export const regionPhases = (r: PhaseRegion | undefined): 1 | 2 => r?.phases ?? (!r || !r.name.trim() || /^R\d+$/.test(r.name.trim()) || plainText(r.name).includes('+') ? 2 : 1);

// a point placed on the diagram: the lever rule there (the tie line, its arms a and b in their colours: colorA the left
// one, colorB the right one, absent: the point's), only the region and the values read there, or a path at its X
// (down: cooled from it, up: heated — the boundaries crossed, the phases between, the microconstituents at an
// invariant line)
export type PointKind = 'lever' | 'read' | 'path';
export type PhaseLeverPoint = { id: string; name: string; pt: Px; color?: string; kind?: PointKind; dir?: 'down' | 'up'; colorA?: string; colorB?: string };

export type PhaseCanvasNote = {
  id: string;
  kind: 'text' | 'arrow' | 'line' | 'rect';
  p1: Px;
  p2?: Px; // arrow, line, rect
  text?: string;
  color?: string;
  textStyle?: TextStyle;
};

export type PhaseDigitizerData = {
  image: string;
  fileName: string;
  w: number;
  h: number;
  // the calibration (as the Digitizer's): X1, X2, Y1, Y2 on the axes; the corners (their values: those of the axes)
  cal?: CalMode;
  axes: (AxisPt | null)[];
  corners?: (Px | null)[]; // bottom left, bottom right, top right, top left
  grid?: GridPt[];
  gridFit?: GridFit;
  xLog: boolean;
  yLog: boolean;
  // the X axis: its name (a component: B; or any quantity) and unit (wt%, at%, a mole fraction, K …: any, or none);
  // compA: the other component, its amount the rest to the total (total − X: 100 for %, 1 for a fraction; '' none)
  compA: string;
  compB: string;
  xUnit?: string;
  total?: number; // (absent: from the unit — 100 for %, 1 for a fraction —, else 100)
  massA?: number; // the molar masses of the other component and of X (g/mol): wt% ↔ at% in the tables
  massB?: number;
  yName: string;
  yUnit: string;
  // the frame of the diagram: bottom left, bottom right, top right, top left (all four, else the box of the calibration)
  border?: (Px | null)[];
  showBorder?: boolean;
  splines: PhaseSpline[];
  activeSpline: number;
  snapTol?: number; // screen px: a point clicked this near a corner, a point or a line goes onto it
  regions: PhaseRegion[];
  showRegions?: boolean;
  leverPoints: PhaseLeverPoint[];
  notes?: PhaseCanvasNote[];
  annotations?: AnnotationItem[];
  loupe?: boolean; // the magnifier beside the cursor (default shown)
};

export const SPLINE_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#e377c2', '#8c564b'];
// the regions: light colours, distinct (Okabe–Ito)
export const REGION_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#CC79A7', '#0072B2', '#D55E00', '#F0E442'];
export const regionColor = (k: number) => REGION_COLORS[((k % REGION_COLORS.length) + REGION_COLORS.length) % REGION_COLORS.length];
export const LEVER_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#9c36b5', '#f08c00', '#0c8599'];
export const leverColor = (lp: PhaseLeverPoint, k: number) => lp.color || LEVER_COLORS[k % LEVER_COLORS.length];

// ---- the data of an older node made whole (a point given as u, v; a region's name as label, its label point as
// labelPos, else inside its outline); the rest kept as it is ----
export function repairPhaseData(d: PhaseDigitizerData): PhaseDigitizerData {
  type OldPoint = Partial<PhaseLeverPoint> & Partial<Px>;
  type OldRegion = Partial<PhaseRegion> & { label?: string; labelPos?: Px };
  const pts = (d.leverPoints ?? []) as OldPoint[];
  const regs = (d.regions ?? []) as OldRegion[];
  const okPt = (p: Px | undefined): p is Px => !!p && Number.isFinite(p.u) && Number.isFinite(p.v);
  if (pts.every((p) => okPt(p.pt)) && regs.every((r) => okPt(r.labelPt) && typeof r.name === 'string') && Array.isArray(d.splines)) return d;
  const leverPoints = pts.flatMap((p, k): PhaseLeverPoint[] => {
    const pt = okPt(p.pt) ? p.pt : okPt({ u: p.u ?? NaN, v: p.v ?? NaN }) ? { u: p.u!, v: p.v! } : null;
    return pt ? [{ id: p.id ?? `lp${k + 1}`, name: p.name ?? `P${k + 1}`, pt, ...(p.color ? { color: p.color } : {}) }] : [];
  });
  const regions = regs.flatMap((r, k): PhaseRegion[] => {
    const labelPt = okPt(r.labelPt) ? r.labelPt : okPt(r.labelPos) ? r.labelPos : r.poly?.length ? polyVisualCenter(r.poly) : null;
    return labelPt ? [{ id: r.id ?? `reg${k + 1}`, name: r.name ?? r.label ?? '', color: r.color ?? regionColor(k), opacity: r.opacity ?? 0.25, labelPt, ...(r.textStyle ? { textStyle: r.textStyle } : {}), ...(r.phases ? { phases: r.phases } : {}) }] : [];
  });
  return { ...d, splines: Array.isArray(d.splines) ? d.splines : [], leverPoints, regions };
}

// ---- the X axis: its name, unit, the other component and the total they make ----
// (the total from the unit: 100 for a %, 1 for a fraction; null: not known from it)
export const totalOfUnit = (unit: string): number | null => (/%/.test(unit) ? 100 : /fraction|^[xw]$/i.test(unit.trim()) ? 1 : null);
export function xAxisOf(d: PhaseDigitizerData) {
  const unit = d.xUnit?.trim() ?? '';
  const other = d.compA.trim();
  const auto = totalOfUnit(unit);
  const total = auto ?? (Number.isFinite(d.total) ? d.total! : 100);
  // wt% ↔ at% (mol%) with the molar masses of both components
  const [mA, mB] = [d.massA ?? NaN, d.massB ?? NaN];
  const wt = /^(wt|mass)\s*%$/i.test(unit);
  const at = /^(at|mol)\s*%$/i.test(unit);
  const convert =
    other && (wt || at) && mA > 0 && mB > 0
      ? {
          unit: wt ? 'at%' : 'wt%',
          f: (x: number) => {
            const [b, a] = wt ? [x / mB, (total - x) / mA] : [x * mB, (total - x) * mA];
            return (total * b) / (a + b);
          },
        }
      : null;
  return { name: d.compB.trim() || 'X', unit, other, total, totalAuto: auto !== null, convert, label: (n: string) => (unit ? `${n} (${unit})` : n) };
}

// ---- the calibration and its inverse ----
export type CalMapper = Calibration & { fromData: (x: number, y: number) => Px };

const val = (a: AxisPt | null | undefined) => (a && Number.isFinite(a.val) ? a.val : NaN);

export function createCalMapper(d: PhaseDigitizerData): CalMapper | string {
  const cal = calibrate({
    image: d.image,
    imageName: d.fileName,
    w: d.w,
    h: d.h,
    cal: d.cal ?? 'axes',
    axes: d.axes,
    corners: d.corners ?? [null, null, null, null],
    xRange: [val(d.axes[0]), val(d.axes[1])],
    yRange: [val(d.axes[2]), val(d.axes[3])],
    grid: d.grid ?? [],
    gridFit: d.gridFit ?? 'tps',
    logX: d.xLog,
    logY: d.yLog,
    xName: d.compB,
    yName: d.yName,
    sets: [],
    active: 0,
    order: 'x',
    auto: { mode: 'line', color: null, tol: 20, step: 3, minSize: 4, maxSize: 400, area: [], exclude: [] },
  });
  if (typeof cal === 'string') return cal;
  // the inverse by Newton's method on the (log) values: exact for the axes, a few steps for the corners and the grid
  const lx = (v: number) => (d.xLog ? Math.log10(v) : v);
  const ly = (v: number) => (d.yLog ? Math.log10(v) : v);
  const F = (p: Px) => {
    const q = cal.toData(p);
    return [lx(q.x), ly(q.y)];
  };
  const fromData = (x: number, y: number): Px => {
    const [tx, ty] = [lx(x), ly(y)];
    let p: Px = { u: (d.w || 600) / 2, v: (d.h || 400) / 2 };
    for (let it = 0; it < 40; it++) {
      const [fx, fy] = F(p);
      const [ex, ey] = [tx - fx, ty - fy];
      const e = 0.5;
      const [ax, ay] = F({ u: p.u + e, v: p.v });
      const [bx, by] = F({ u: p.u, v: p.v + e });
      const [j11, j21, j12, j22] = [(ax - fx) / e, (ay - fy) / e, (bx - fx) / e, (by - fy) / e];
      const det = j11 * j22 - j12 * j21;
      if (!Number.isFinite(det) || det === 0) break;
      let du = (ex * j22 - ey * j12) / det;
      let dv = (j11 * ey - j21 * ex) / det;
      // a step no longer than the image (a curved map far from its points)
      const big = Math.hypot(du, dv) / Math.max(d.w || 600, d.h || 400);
      if (big > 1) [du, dv] = [du / big, dv / big];
      p = { u: p.u + du, v: p.v + dv };
      if (Math.abs(du) + Math.abs(dv) < 1e-7) break;
    }
    return p;
  };
  return { ...cal, fromData };
}

// ---- the frame of the diagram: its four corners set, else the corners of the calibration, else its box ----
export function frameOf(d: PhaseDigitizerData, m: CalMapper | string | null): Px[] | null {
  const b = d.border ?? [];
  if (b.length === 4 && b.every(Boolean)) return b as Px[];
  const c = d.corners ?? [];
  if ((d.cal ?? 'axes') === 'corners' && c.length === 4 && c.every(Boolean)) return c as Px[];
  if (!m || typeof m === 'string') return null;
  let xs = [val(d.axes[0]), val(d.axes[1])];
  let ys = [val(d.axes[2]), val(d.axes[3])];
  if ((d.cal ?? 'axes') === 'grid') {
    const g = (d.grid ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (g.length < 2) return null;
    xs = [Math.min(...g.map((p) => p.x)), Math.max(...g.map((p) => p.x))];
    ys = [Math.min(...g.map((p) => p.y)), Math.max(...g.map((p) => p.y))];
  }
  if (![...xs, ...ys].every(Number.isFinite) || xs[0] === xs[1] || ys[0] === ys[1]) return null;
  const [x1, x2] = [Math.min(...xs), Math.max(...xs)];
  const [y1, y2] = [Math.min(...ys), Math.max(...ys)];
  return [m.fromData(x1, y1), m.fromData(x2, y1), m.fromData(x2, y2), m.fromData(x1, y2)];
}

// ---- a boundary: its points joined — straight pieces, or smooth: a cubic through every point whose handles lie
// along the line of its neighbours and reach a third of each piece at most (it never loops nor swings out), a corner
// where the line turns sharply (more than 60°, or marked) — closed: back to its first point ----
export const CORNER_TURN = Math.PI / 3;
const turnAt = (a: Px, b: Px, c: Px) => {
  const [u1, v1, u2, v2] = [b.u - a.u, b.v - a.v, c.u - b.u, c.v - b.v];
  return Math.abs(Math.atan2(u1 * v2 - v1 * u2, u1 * u2 + v1 * v2));
};
// the corners of a boundary: where it turns sharply, or marked so (corners), unless marked smooth (rounds); the ends of
// an open one are not corners
export function cornersOf(s: Pick<PhaseSpline, 'points' | 'closed' | 'corners' | 'rounds'>): boolean[] {
  const n = s.points.length;
  const closed = !!s.closed && n >= 3;
  return s.points.map((p, k) => {
    if (s.corners?.includes(k)) return true;
    if (s.rounds?.includes(k)) return false;
    if (!closed && (k === 0 || k === n - 1)) return false;
    return turnAt(s.points[(k - 1 + n) % n], p, s.points[(k + 1) % n]) > CORNER_TURN;
  });
}
export function sampleSpline(pts: Px[], smooth = true, o: { corner?: boolean[]; closed?: boolean } = {}): Px[] {
  const n = pts.length;
  const closed = !!o.closed && n >= 3;
  const copy = pts.map((p) => ({ u: p.u, v: p.v }));
  if (n < 2) return copy;
  const pieces = closed ? n : n - 1;
  const len = (a: Px, b: Px) => Math.hypot(b.u - a.u, b.v - a.v);
  // the handles of every point: along the line of its neighbours, a third of the piece on each side (none at a corner)
  const hin: Px[] = [];
  const hout: Px[] = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const prev = closed || k > 0 ? pts[(k - 1 + n) % n] : null;
    const next = closed || k < n - 1 ? pts[(k + 1) % n] : null;
    const flat = !smooth || n === 2 || o.corner?.[k];
    const [a, b] = [prev ?? p, next ?? p];
    const l = len(a, b) || 1;
    const dir = flat ? { u: 0, v: 0 } : { u: (b.u - a.u) / l, v: (b.v - a.v) / l };
    hin.push(prev ? { u: (-dir.u * len(prev, p)) / 3, v: (-dir.v * len(prev, p)) / 3 } : { u: 0, v: 0 });
    hout.push(next ? { u: (dir.u * len(p, next)) / 3, v: (dir.v * len(p, next)) / 3 } : { u: 0, v: 0 });
  }
  const out: Px[] = [];
  for (let k = 0; k < pieces; k++) {
    const [p0, p3] = [pts[k], pts[(k + 1) % n]];
    const p1 = { u: p0.u + hout[k].u, v: p0.v + hout[k].v };
    const p2 = { u: p3.u + hin[(k + 1) % n].u, v: p3.v + hin[(k + 1) % n].v };
    const straight = !hout[k].u && !hout[k].v && !hin[(k + 1) % n].u && !hin[(k + 1) % n].v;
    // about a point every 3 px of the image along the piece (one: a straight piece)
    const steps = straight ? 1 : Math.min(64, Math.max(4, Math.round(len(p0, p3) / 3)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [a, b, c, e] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
      out.push(s === 0 ? { u: p0.u, v: p0.v } : { u: a * p0.u + b * p1.u + c * p2.u + e * p3.u, v: a * p0.v + b * p1.v + c * p2.v + e * p3.v });
    }
  }
  if (!closed) out.push({ u: pts[n - 1].u, v: pts[n - 1].v });
  return out;
}
export const curveOf = (s: PhaseSpline) => sampleSpline(s.points, s.smooth !== false, { corner: cornersOf(s), closed: s.closed });
// the curve with its first point again at its end when closed (to walk along it)
export const pathOf = (s: PhaseSpline) => {
  const c = curveOf(s);
  return s.closed && s.points.length >= 3 ? [...c, c[0]] : c;
};

// ---- the ends of the boundaries on the frame follow it when a corner moves: onto their edge as it is now (where they
// are when it still passes there; a corner's end with its corner) ----
export function followFrame(from: Px[], to: Px[], splines: PhaseSpline[]): PhaseSpline[] {
  const place = (p: Px) => {
    for (let i = 0; i < 4; i++) {
      const c = closestOnSeg(p, from[i], from[(i + 1) % 4]);
      if (c.dist > 0.75) continue;
      const [a, b] = [to[i], to[(i + 1) % 4]];
      if (c.t < 1e-6) return { ...a };
      if (c.t > 1 - 1e-6) return { ...b };
      const q = closestOnSeg(p, a, b);
      // (a corner moved past it: kept on the edge, a hair inside)
      const t = Math.min(1 - 1e-3, Math.max(1e-3, q.t));
      return q.t === t ? q.pt : { u: a.u + t * (b.u - a.u), v: a.v + t * (b.v - a.v) };
    }
    return null;
  };
  return splines.map((s) => {
    if (s.closed || s.points.length < 2) return s;
    const n = s.points.length;
    const [a, b] = [place(s.points[0]), place(s.points[n - 1])];
    if (!a && !b) return s;
    return { ...s, points: s.points.map((p, k) => (k === 0 && a ? a : k === n - 1 && b ? b : p)) };
  });
}

// ---- geometry ----
export function closestOnSeg(p: Px, a: Px, b: Px): { pt: Px; dist: number; t: number } {
  const [dx, dy] = [b.u - a.u, b.v - a.v];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.u - a.u) * dx + (p.v - a.v) * dy) / l2));
  const pt = { u: a.u + t * dx, v: a.v + t * dy };
  return { pt, dist: Math.hypot(p.u - pt.u, p.v - pt.v), t };
}

// the nearest point of a polyline (closed: back to its first point)
export function closestOnLine(p: Px, pts: Px[], closed = false): { pt: Px; dist: number; seg: number; t: number } | null {
  let best: { pt: Px; dist: number; seg: number; t: number } | null = null;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const c = closestOnSeg(p, pts[i], pts[(i + 1) % pts.length]);
    if (!best || c.dist < best.dist) best = { ...c, seg: i };
  }
  return best;
}

export function polySignedArea(poly: Px[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % n]];
    a += p.u * q.v - q.u * p.v;
  }
  return a / 2;
}

export function pointInPoly(p: Px, poly: Px[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.v > p.v !== b.v > p.v && p.u < ((b.u - a.u) * (p.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}

function distToEdge(p: Px, poly: Px[]) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    const [dx, dy] = [b.u - a.u, b.v - a.v];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.u - a.u) * dx + (p.v - a.v) * dy) / l2)) : 0;
    m = Math.min(m, Math.hypot(p.u - a.u - t * dx, p.v - a.v - t * dy));
  }
  return m;
}

// the point inside a polygon farthest from its edges (a label sits there, also in a thin or bent region): a grid, then
// finer grids around the best point (on the polygon thinned to 120 corners at most)
export function polyVisualCenter(poly0: Px[]): Px {
  if (!poly0.length) return { u: 0, v: 0 };
  const step = Math.ceil(poly0.length / 120);
  const poly = step > 1 ? poly0.filter((_, i) => i % step === 0) : poly0;
  const us = poly.map((p) => p.u);
  const vs = poly.map((p) => p.v);
  let [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const mid: Px = { u: (u0 + u1) / 2, v: (v0 + v1) / 2 };
  let best = mid;
  let bestD = pointInPoly(best, poly) ? distToEdge(best, poly) : -1;
  for (let round = 0; round < 3; round++) {
    const N = 12;
    const cands: { c: Px; d: number }[] = [];
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const c = { u: u0 + ((u1 - u0) * i) / N, v: v0 + ((v1 - v0) * j) / N };
        if (pointInPoly(c, poly)) cands.push({ c, d: distToEdge(c, poly) });
      }
    const top = Math.max(bestD, ...cands.map((q) => q.d));
    if (top < 0) break;
    // of the points nearly as deep (a long strip is as deep all along), the one nearest the middle
    const off = (p: Px) => Math.hypot(p.u - mid.u, p.v - mid.v);
    const pick = [{ c: best, d: bestD }, ...cands].filter((q) => q.d >= 0.9 * top).reduce((p, q) => (off(q.c) < off(p.c) ? q : p));
    [best, bestD] = [pick.c, pick.d];
    const [hu, hv] = [(u1 - u0) / 7, (v1 - v0) / 7];
    [u0, u1, v0, v1] = [best.u - hu, best.u + hu, best.v - hv, best.v + hv];
  }
  return best;
}

// ---- catching a point on what is near: the frame's corners and the points of the other lines first, then the frame's
// edges and the other lines (tol in image px) ----
export type Snap = { pt: Px; kind: 'corner' | 'point' | 'border' | 'line' };
export function snapPoint(p: Px, frame: Px[] | null, splines: PhaseSpline[], skip: number, tol: number): Snap | null {
  const found: { snap: Snap | null; dist: number } = { snap: null, dist: tol };
  const take = (q: Px, kind: Snap['kind']) => {
    const dd = Math.hypot(p.u - q.u, p.v - q.v);
    if (dd <= found.dist) [found.dist, found.snap] = [dd, { pt: { u: q.u, v: q.v }, kind }];
  };
  frame?.forEach((c) => take(c, 'corner'));
  splines.forEach((s, i) => i !== skip && s.points.forEach((q) => take(q, 'point')));
  if (found.snap) return found.snap;
  if (frame) {
    const c = closestOnLine(p, frame, true);
    if (c) take(c.pt, 'border');
  }
  splines.forEach((s, i) => {
    if (i === skip || s.points.length < 2) return;
    const c = closestOnLine(p, curveOf(s), !!s.closed && s.points.length >= 3);
    if (c) take(c.pt, 'line');
  });
  return found.snap;
}

// ---- the faces of the diagram: the frame and the lines as a planar graph ----
export type Face = { poly: Px[]; area: number; inner: Px };

function segHit(a1: Px, a2: Px, b1: Px, b2: Px): { ta: number; tb: number } | null {
  const [dax, day, dbx, dby] = [a2.u - a1.u, a2.v - a1.v, b2.u - b1.u, b2.v - b1.v];
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-12) return null;
  const [dx, dy] = [b1.u - a1.u, b1.v - a1.v];
  const ta = (dx * dby - dy * dbx) / den;
  const tb = (dx * day - dy * dax) / den;
  const e = 1e-9;
  return ta >= -e && ta <= 1 + e && tb >= -e && tb <= 1 + e ? { ta: Math.min(1, Math.max(0, ta)), tb: Math.min(1, Math.max(0, tb)) } : null;
}

const boxOf = (pts: Px[], pad = 0) => {
  const us = pts.map((p) => p.u);
  const vs = pts.map((p) => p.v);
  return [Math.min(...us) - pad, Math.min(...vs) - pad, Math.max(...us) + pad, Math.max(...vs) + pad];
};
const boxesMeet = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// tol: image px — an end of a line this near another line goes onto it (a gap closed)
export function phaseFaces(frame: Px[], splines: PhaseSpline[], tol = 6): Face[] {
  type Line = { pts: Px[]; closed: boolean };
  const lines: Line[] = [{ pts: frame.map((p) => ({ ...p })), closed: true }, ...splines.filter((s) => s.points.length >= 2).map((s) => ({ pts: curveOf(s), closed: !!s.closed && s.points.length >= 3 }))];
  const nSeg = (l: Line) => (l.closed ? l.pts.length : l.pts.length - 1);
  const segA = (l: Line, i: number) => l.pts[i];
  const segB = (l: Line, i: number) => l.pts[(i + 1) % l.pts.length];
  // the nodes: the crossings and the ends, one where several meet (0.5 px)
  const nodes: Px[] = [];
  const nodeAt = (p: Px) => {
    const k = nodes.findIndex((q) => Math.hypot(q.u - p.u, q.v - p.v) <= 0.5);
    if (k >= 0) return k;
    nodes.push({ u: p.u, v: p.v });
    return nodes.length - 1;
  };
  // the places a line is cut at: its segment + the fraction along it, the node there
  const cuts: { at: number; node: number }[][] = lines.map(() => []);
  // 1. the ends of the lines: onto the nearest other line within tol (a line clicked short of another, or past it)
  for (let li = 1; li < lines.length; li++) {
    const l = lines[li];
    if (l.closed) continue;
    for (const end of [0, l.pts.length - 1]) {
      let best: { lj: number; seg: number; t: number; pt: Px; dist: number } | null = null;
      for (let lj = 0; lj < lines.length; lj++) {
        if (lj === li) continue;
        const c = closestOnLine(l.pts[end], lines[lj].pts, lines[lj].closed);
        if (c && c.dist <= tol && (!best || c.dist < best.dist)) best = { lj, ...c };
      }
      if (best) l.pts[end] = { ...best.pt };
      const node = nodeAt(l.pts[end]);
      cuts[li].push({ at: end, node });
      // every other line through that point is cut there (an end on a corner of the frame and on another line)
      for (let lj = 0; lj < lines.length; lj++) {
        if (lj === li) continue;
        const c = closestOnLine(l.pts[end], lines[lj].pts, lines[lj].closed);
        if (c && c.dist <= 0.5) cuts[lj].push({ at: c.seg + c.t, node });
      }
    }
  }
  // 2. the crossings of every two lines (a box around each line first)
  const boxes = lines.map((l) => boxOf(l.pts, 1));
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      if (!boxesMeet(boxes[i], boxes[j])) continue;
      const [A, B] = [lines[i], lines[j]];
      for (let s = 0; s < nSeg(A); s++) {
        const [a1, a2] = [segA(A, s), segB(A, s)];
        // (a little wider: a line ending exactly on another one, but for the rounding)
        const ba = [Math.min(a1.u, a2.u) - 1e-6, Math.min(a1.v, a2.v) - 1e-6, Math.max(a1.u, a2.u) + 1e-6, Math.max(a1.v, a2.v) + 1e-6];
        if (!boxesMeet(ba, boxes[j])) continue;
        for (let r = 0; r < nSeg(B); r++) {
          const [b1, b2] = [segA(B, r), segB(B, r)];
          if (Math.max(b1.u, b2.u) < ba[0] || Math.min(b1.u, b2.u) > ba[2] || Math.max(b1.v, b2.v) < ba[1] || Math.min(b1.v, b2.v) > ba[3]) continue;
          const h = segHit(a1, a2, b1, b2);
          if (!h) continue;
          const node = nodeAt({ u: a1.u + h.ta * (a2.u - a1.u), v: a1.v + h.ta * (a2.v - a1.v) });
          cuts[i].push({ at: s + h.ta, node });
          cuts[j].push({ at: r + h.tb, node });
        }
      }
    }
  // 3. the edges: each line cut into pieces from node to node (the frame, closed: around)
  type Edge = { a: number; b: number; pts: Px[] };
  const edges: Edge[] = [];
  lines.forEach((l, li) => {
    const cs = cuts[li].slice().sort((p, q) => p.at - q.at);
    if (l.closed && !cs.length) cs.push({ at: 0, node: nodeAt(l.pts[0]) });
    const n = l.pts.length;
    const span = (from: number, to: number) => {
      // the vertices strictly between two places (to may pass the end of a closed line)
      const out: Px[] = [];
      for (let k = Math.floor(from) + 1; k < to - 1e-9; k++) if (k > from + 1e-9) out.push(l.pts[k % n]);
      return out;
    };
    const m = l.closed ? cs.length : cs.length - 1;
    for (let k = 0; k < m; k++) {
      const c0 = cs[k];
      const c1 = k + 1 < cs.length ? cs[k + 1] : { at: cs[0].at + n, node: cs[0].node };
      const pts = [nodes[c0.node], ...span(c0.at, c1.at), nodes[c1.node]];
      let len = 0;
      for (let q = 1; q < pts.length; q++) len += Math.hypot(pts[q].u - pts[q - 1].u, pts[q].v - pts[q - 1].v);
      if (len < 0.5) continue;
      if (c0.node === c1.node && pts.length < 4) continue;
      edges.push({ a: c0.node, b: c1.node, pts });
    }
  });
  // 4. the loose ends left out (a line that closes nothing), again until none
  const alive = edges.map(() => true);
  const deg = new Array<number>(nodes.length).fill(0);
  edges.forEach((e) => {
    deg[e.a]++;
    deg[e.b]++;
  });
  for (let changed = true; changed; ) {
    changed = false;
    edges.forEach((e, k) => {
      if (alive[k] && e.a !== e.b && (deg[e.a] === 1 || deg[e.b] === 1)) {
        alive[k] = false;
        deg[e.a]--;
        deg[e.b]--;
        changed = true;
      }
    });
  }
  // 5. the faces: half edges around every node by their angle; each face walked keeping it on the same side
  type Half = { from: number; to: number; pts: Px[]; ang: number };
  const halves: Half[] = [];
  const dir = (pts: Px[]) => {
    const p = pts[0];
    const q = pts.find((r) => Math.hypot(r.u - p.u, r.v - p.v) >= 1.5) ?? pts[pts.length - 1];
    return Math.atan2(q.v - p.v, q.u - p.u);
  };
  edges.forEach((e, k) => {
    if (!alive[k]) return;
    const rev = e.pts.slice().reverse();
    halves.push({ from: e.a, to: e.b, pts: e.pts, ang: dir(e.pts) }, { from: e.b, to: e.a, pts: rev, ang: dir(rev) });
  });
  const out = new Map<number, number[]>();
  halves.forEach((h, k) => out.set(h.from, [...(out.get(h.from) ?? []), k]));
  for (const list of out.values()) list.sort((p, q) => halves[p].ang - halves[q].ang);
  const seen = new Uint8Array(halves.length);
  const faces: Face[] = [];
  for (let k0 = 0; k0 < halves.length; k0++) {
    if (seen[k0]) continue;
    const poly: Px[] = [];
    let k = k0;
    for (let guard = 0; guard < halves.length + 1 && !seen[k]; guard++) {
      seen[k] = 1;
      const h = halves[k];
      poly.push(...h.pts.slice(0, -1));
      const list = out.get(h.to)!;
      const twin = k % 2 === 0 ? k + 1 : k - 1;
      k = list[(list.indexOf(twin) + 1) % list.length];
    }
    if (poly.length >= 3) faces.push({ poly, area: polySignedArea(poly), inner: { u: 0, v: 0 } });
  }
  if (!faces.length) return [];
  // the face around everything (the largest) runs the other way round: the regions are the faces turning as the others
  const outer = faces.reduce((p, q) => (Math.abs(q.area) > Math.abs(p.area) ? q : p));
  const sign = -Math.sign(outer.area);
  const minArea = Math.max(2, Math.abs(polySignedArea(frame)) * 1e-5);
  return faces
    .filter((f) => Math.sign(f.area) === sign && Math.abs(f.area) >= minArea)
    .map((f) => ({ poly: f.poly, area: Math.abs(f.area), inner: polyVisualCenter(f.poly) }))
    .filter((f) => pointInPoly(f.inner, frame))
    .sort((p, q) => q.area - p.area);
}

// ---- the regions on the faces: a face takes the look of the first region whose label lies in it (the smallest face
// holding the label: an island over the region around it) ----
const smallestFace = (p: Px, faces: Face[]) => {
  let best = -1;
  faces.forEach((f, k) => {
    if ((best < 0 || f.area < faces[best].area) && pointInPoly(p, f.poly)) best = k;
  });
  return best;
};
// the region of every face (-1: none)
function faceOwners(faces: Face[], regions: PhaseRegion[]): number[] {
  const owner = new Array<number>(faces.length).fill(-1);
  regions.forEach((r, ri) => {
    const k = smallestFace(r.labelPt, faces);
    if (k >= 0 && owner[k] < 0) owner[k] = ri;
  });
  return owner;
}
export type RegionFill = { poly: Px[]; region: number };
export function regionFills(faces: Face[], regions: PhaseRegion[]): RegionFill[] {
  const owner = faceOwners(faces, regions);
  // the larger faces first (an island drawn over the region around it)
  return faces.map((f, k) => ({ poly: f.poly, region: owner[k] })).filter((f) => f.region >= 0);
}

// the faces without a label get one (at the point farthest from their edges); the regions kept
export function detectRegions(faces: Face[], regions: PhaseRegion[]): PhaseRegion[] {
  const out = regions.slice();
  const taken = new Set(regionFills(faces, regions).map((f) => f.poly));
  let next = regions.reduce((m, r) => Math.max(m, Number(/^reg(\d+)$/.exec(r.id)?.[1] ?? 0)), 0);
  for (const f of faces.slice().sort((a, b) => a.inner.v - b.inner.v || a.inner.u - b.inner.u)) {
    if (taken.has(f.poly)) continue;
    next++;
    out.push({ id: `reg${next}`, name: `R${out.length + 1}`, color: regionColor(out.length), opacity: 0.25, labelPt: { u: +f.inner.u.toFixed(1), v: +f.inner.v.toFixed(1) } });
  }
  return out;
}

// the region at a point (-1: none)
export function regionAt(p: Px, faces: Face[], regions: PhaseRegion[]): number {
  const k = smallestFace(p, faces);
  return k < 0 ? -1 : faceOwners(faces, regions)[k];
}

// ---- the points: the lever rule, a value read, a path ----
export type LeverEnd = { x: number; px: Px; source: string; color: string; phase: string; frac: number; axis: Px };
// a path's microconstituents at an invariant line it crosses: just before it the primary phase and the constituent
// formed on the line (the lever rule there, the end inside the line renamed), just after it the phases in all
export type Micro = { line: string; y: number; before: [LeverEnd, LeverEnd] | null; after: [LeverEnd, LeverEnd] | null; primary: number; constituent: string };
export type PathEval = {
  end: Px; // where the path stops (the frame's bottom, or its top going up)
  yEnd: number;
  cross: { y: number; px: Px; source: string; color: string }[]; // the boundaries crossed, in the path's order
  steps: { from: number; to: number; region: string }[]; // the phases between them
  micro: Micro[];
};
export type LeverEvalResult = {
  id: string;
  name: string;
  kind: PointKind;
  color: string; // the point's
  armA: string; // the left arm's, the right arm's
  armB: string;
  pt: Px;
  x0: number;
  y0: number;
  axis0: Px; // under the point on the bottom of the frame
  region: string; // the region's name at the point (rich text; '' none)
  ends: [LeverEnd, LeverEnd] | null; // the lever rule: the two phases (null: one phase, the region's; a point read; a path)
  path?: PathEval;
};

// what the points need of the diagram: the lines and the frame's edges in the data (the paths cross them), the
// outlines of the faces in the data (a tie line runs to the frontier of its region), the bottom and top of the frame
type Ctx = { d: PhaseDigitizerData; m: CalMapper; faces: Face[]; faceData: { x: number; y: number }[][]; cands: { name: string; color: string; spline: number; pts: { x: number; y: number }[] }[]; yB: number; yT: number; drop: (x: number) => Px };
function pointCtx(d: PhaseDigitizerData, m: CalMapper, frame: Px[] | null, faces: Face[]): Ctx {
  const fd = frame?.map((p) => m.toData(p));
  const yB = fd ? (fd[0].y + fd[1].y) / 2 : val(d.axes[2]);
  const yT = fd ? (fd[2].y + fd[3].y) / 2 : val(d.axes[3]);
  const cands: Ctx['cands'] = [];
  if (fd) for (let i = 0; i < 4; i++) cands.push({ name: 'frame', color: '#555555', spline: -1, pts: [fd[i], fd[(i + 1) % 4]] });
  d.splines.forEach((s, si) => s.points.length >= 2 && cands.push({ name: s.name || `line ${si + 1}`, color: s.color, spline: si, pts: pathOf(s).map((p) => m.toData(p)) }));
  return { d, m, faces, faceData: faces.map((f) => f.poly.map((p) => m.toData(p))), cands, yB, yT, drop: (x) => m.fromData(x, yB) };
}
const regionOf = (c: Ctx, p: Px) => {
  const j = regionAt(p, c.faces, c.d.regions);
  return j >= 0 ? c.d.regions[j] : undefined;
};

// the tie line at (x0, y0) in the data: to the frontier of the region it is in, left and right (the outline of its
// face: the lines and the frame around it; outside every face, the nearest lines); the phases past its ends — the
// one-phase regions over the frontier, else the parts of the name of its region “α + β”, left to right
function tieLine(c: Ctx, x0: number, y0: number, px?: Px): [LeverEnd, LeverEnd] | null {
  const p = px ?? c.m.fromData(x0, y0);
  const k = smallestFace(p, c.faces);
  const polys = k >= 0 ? [[...c.faceData[k], c.faceData[k][0]]] : c.cands.map((q) => q.pts);
  let L: number | null = null;
  let R: number | null = null;
  for (const pts of polys)
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      if ((a.y - y0) * (b.y - y0) > 0 || a.y === b.y) continue;
      const x = a.x + ((y0 - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x < x0 && (L === null || x > L)) L = x;
      if (x > x0 && (R === null || x < R)) R = x;
    }
  if (L === null || R === null) return null;
  const span = R - L;
  const f1 = span > 0 ? ((R - x0) / span) * 100 : 50;
  const dx = Math.max(1e-9, Math.abs(span) * 0.02);
  const nameAt = (x: number) => {
    const r = regionOf(c, c.m.fromData(x, y0));
    return r && regionPhases(r) === 1 ? r.name : '';
  };
  const parts = (regionOf(c, p)?.name ?? '').split('+').map((q) => q.trim());
  let [n1, n2] = [nameAt(L - dx), nameAt(R + dx)];
  if (parts.length === 2) {
    const other = (n: string) => parts.find((q) => plainText(q) !== plainText(n)) ?? '';
    if (!n1 && n2) n1 = other(n2);
    else if (!n2 && n1) n2 = other(n1);
    else if (!n1 && !n2) [n1, n2] = parts;
  }
  const end = (x: number, phase: string, frac: number): LeverEnd => ({ x, source: 'frontier', color: '', px: c.m.fromData(x, y0), phase, frac, axis: c.drop(x) });
  return [end(L, n1 || 'phase 1', f1), end(R, n2 || 'phase 2', 100 - f1)];
}

// the path at X = x0 from y0 to the frame's bottom (down) or top (up): the lines crossed, the phases between them, the
// microconstituents at the invariant lines
function pathAt(c: Ctx, x0: number, y0: number, dir: 'down' | 'up'): PathEval {
  const yEnd = dir === 'up' ? c.yT : c.yB;
  const sgn = Math.sign(yEnd - y0) || -1;
  const span = Math.abs(c.yT - c.yB) || 1;
  const cross: (PathEval['cross'][number] & { spline: number })[] = [];
  for (const cd of c.cands) {
    if (cd.spline < 0) continue;
    for (let i = 0; i < cd.pts.length - 1; i++) {
      const [a, b] = [cd.pts[i], cd.pts[i + 1]];
      if ((a.x - x0) * (b.x - x0) > 0 || a.x === b.x) continue;
      const y = a.y + ((x0 - a.x) / (b.x - a.x)) * (b.y - a.y);
      if ((y - y0) * sgn <= span * 1e-6 || (yEnd - y) * sgn <= span * 1e-6) continue;
      // a point where two lines meet (or two pieces of one): once
      if (cross.some((q) => Math.abs(q.y - y) < span * 1e-5)) continue;
      cross.push({ y, px: c.m.fromData(x0, y), source: cd.name, color: cd.color, spline: cd.spline });
    }
  }
  cross.sort((p, q) => (p.y - q.y) * sgn);
  const ys = [y0, ...cross.map((q) => q.y), yEnd];
  const steps = ys.slice(1).map((to, k) => ({ from: ys[k], to, region: regionOf(c, c.m.fromData(x0, (ys[k] + to) / 2))?.name ?? '' }));
  const micro: Micro[] = [];
  const xs = c.cands.filter((q) => q.spline < 0).flatMap((q) => q.pts.map((p) => p.x));
  const tolX = (Math.max(...xs) - Math.min(...xs) || 1) * 0.01;
  for (const q of cross) {
    const s = c.d.splines[q.spline];
    if (!s?.invariant) continue;
    // (a hair from the line: the compositions at its temperature, as the textbooks read them)
    const dy = span * 1e-4;
    const at = (y: number) => {
      const px = c.m.fromData(x0, y);
      return regionPhases(regionOf(c, px)) === 1 ? null : tieLine(c, x0, y, px);
    };
    const before = at(q.y - sgn * dy);
    const after = at(q.y + sgn * dy);
    // the end at an end of the invariant line: the primary phase; the other (inside the line): the constituent
    const lx = curveOf(s).map((p) => c.m.toData(p).x);
    const [xa, xb] = [Math.min(...lx), Math.max(...lx)];
    const atEnd = (x: number) => Math.abs(x - xa) < tolX || Math.abs(x - xb) < tolX;
    const constituent = s.micro?.trim() || s.name || 'constituent';
    let primary = -1;
    if (before) {
      const [p, r] = before.map((e) => atEnd(e.x));
      primary = p && !r ? 0 : r && !p ? 1 : -1;
      if (primary >= 0) before[1 - primary] = { ...before[1 - primary], phase: constituent };
    }
    micro.push({ line: s.name, y: q.y, before, after, primary, constituent });
  }
  return { end: c.m.fromData(x0, yEnd), yEnd, cross: cross.map((q) => ({ y: q.y, px: q.px, source: q.source, color: q.color })), steps, micro };
}

export function evalLeverPoint(lp: PhaseLeverPoint, k: number, d: PhaseDigitizerData, m: CalMapper, frame: Px[] | null, faces: Face[], ctx?: Ctx): LeverEvalResult {
  const c = ctx ?? pointCtx(d, m, frame, faces);
  const { x: x0, y: y0 } = m.toData(lp.pt);
  const reg = regionOf(c, lp.pt);
  const region = reg?.name ?? '';
  const color = leverColor(lp, k);
  const kind = lp.kind ?? 'lever';
  const base = { id: lp.id, name: lp.name, kind, color, armA: lp.colorA || color, armB: lp.colorB || color, pt: lp.pt, x0, y0, axis0: c.drop(x0), region };
  if (kind === 'read') return { ...base, ends: null };
  if (kind === 'path') return { ...base, ends: null, path: pathAt(c, x0, y0, lp.dir ?? 'down') };
  // a region of one phase: no tie line
  return { ...base, ends: regionPhases(reg) === 1 ? null : tieLine(c, x0, y0, lp.pt) };
}
export function evalPoints(d: PhaseDigitizerData, m: CalMapper, frame: Px[] | null, faces: Face[]): LeverEvalResult[] {
  const c = pointCtx(d, m, frame, faces);
  return d.leverPoints.map((lp, k) => evalLeverPoint(lp, k, d, m, frame, faces, c));
}
// the arms of the lever: a (the point to the left end) and b (the right end to the point)
export const armsOf = (e: LeverEvalResult) => (e.ends ? { a: e.x0 - e.ends[0].x, b: e.ends[1].x - e.x0 } : null);
// a path in words: “L → α + L at 1310 → α at 1220”
export const pathText = (p: PathEval, fmt: (v: number) => string) => p.steps.map((s, k) => `${plainText(s.region) || '?'}${k ? ` at ${fmt(s.from)}` : ''}`).join(' → ');

// ---- the node: the tables, the figure's curves and annotations ----
export function runPhaseDigitizer(d0: PhaseDigitizerData): {
  dataset: Dataset;
  workbook: Workbook;
  curves: Curve[];
  annotations: AnnotationItem[];
  evals: LeverEvalResult[];
  xRange: [number, number];
  yRange: [number, number];
  xLabel: string;
  yLabel: string;
  note: string;
} | string {
  if (!d0.image && !d0.w) return 'Open the image of a phase diagram (or paste one: Ctrl+V).';
  const d = repairPhaseData(d0);
  const m = createCalMapper(d);
  if (typeof m === 'string') return m;
  const frame = frameOf(d, m);
  const faces = frame ? phaseFaces(frame, d.splines) : [];
  const evals = evalPoints(d, m, frame, faces);
  const { name: B, unit, other: A, total, convert, label } = xAxisOf(d);
  const xLabel = label(B);
  const yName = d.yName.trim() || 'T';
  const yUnit = d.yUnit.trim();
  const yLabel = yUnit ? `${yName} (${yUnit})` : yName;
  const num = (name: string, vals: number[]): Column => column(name, Float64Array.from(vals));
  const txt = (name: string, vals: string[]): Column => column(name, new Float64Array(vals.length).fill(NaN), vals);
  const r4 = (v: number) => (Number.isFinite(v) ? +v.toFixed(4) : NaN);
  const conv = (name: string, vals: number[]) => (convert ? [num(`${name} (${convert.unit})`, vals.map((v) => r4(convert.f(v))))] : []);

  // the lever rule and the points read: a row a point
  const lv = evals.filter((e) => e.kind !== 'path');
  const e1 = (e: LeverEvalResult) => e.ends?.[0];
  const e2 = (e: LeverEvalResult) => e.ends?.[1];
  const x1 = lv.map((e) => e1(e)?.x ?? e.x0);
  const x2 = lv.map((e) => e2(e)?.x ?? NaN);
  // (only points read or in one phase: no second phase, no arms)
  const tie = lv.some((e) => e.ends);
  const dataset: Dataset = {
    name: 'Lever rule',
    columns: [
      { ...txt('Point', lv.map((e) => e.name)), role: 'label' },
      txt('Region', lv.map((e) => plainText(e.region))),
      { ...num(xLabel, lv.map((e) => r4(e.x0))), role: 'x' },
      // the other component (when named): the rest to the total
      ...(A ? [num(label(A), lv.map((e) => r4(total - e.x0)))] : []),
      ...conv(B, lv.map((e) => e.x0)),
      { ...num(yLabel, lv.map((e) => r4(e.y0))), role: 'y' },
      txt('Phase 1', lv.map((e) => plainText(e1(e)?.phase ?? e.region))),
      num(label(`Phase 1 ${B}`), x1.map(r4)),
      ...(A ? [num(label(`Phase 1 ${A}`), x1.map((x) => r4(total - x)))] : []),
      ...conv(`Phase 1 ${B}`, x1),
      num('Phase 1 amount (%)', lv.map((e) => r4(e1(e)?.frac ?? 100))),
      ...(tie
        ? [
            txt('Phase 2', lv.map((e) => plainText(e2(e)?.phase ?? ''))),
            num(label(`Phase 2 ${B}`), x2.map(r4)),
            ...(A ? [num(label(`Phase 2 ${A}`), x2.map((x) => r4(total - x)))] : []),
            ...conv(`Phase 2 ${B}`, x2),
            num('Phase 2 amount (%)', lv.map((e) => r4(e2(e)?.frac ?? NaN))),
            // the arms of the lever (the amount of a phase: the arm opposite it over both)
            num(label('Arm a'), lv.map((e) => r4(armsOf(e)?.a ?? NaN))),
            num(label('Arm b'), lv.map((e) => r4(armsOf(e)?.b ?? NaN))),
          ]
        : []),
    ],
  };
  // the paths: a row for every stretch between the boundaries crossed; the microconstituents at the invariant lines
  const paths = evals.filter((e) => e.kind === 'path' && e.path);
  const steps = paths.flatMap((e) => e.path!.steps.map((s) => ({ e, s })));
  const pathSheet: Dataset | null = paths.length
    ? {
        name: 'Paths',
        columns: [
          { ...txt('Point', steps.map((q) => q.e.name)), role: 'label' },
          num(xLabel, steps.map((q) => r4(q.e.x0))),
          { ...num(`From ${yLabel}`, steps.map((q) => r4(q.s.from))), role: 'x' },
          num(`To ${yLabel}`, steps.map((q) => r4(q.s.to))),
          txt('Phases', steps.map((q) => plainText(q.s.region))),
        ],
      }
    : null;
  const micros = paths.flatMap((e) => e.path!.micro.map((mc) => ({ e, mc })));
  const pick = (mc: Micro, which: 'before' | 'after', j: number) => mc[which]?.[j];
  const microSheet: Dataset | null = micros.length
    ? {
        name: 'Microconstituents',
        columns: [
          { ...txt('Point', micros.map((q) => q.e.name)), role: 'label' },
          num(xLabel, micros.map((q) => r4(q.e.x0))),
          txt('Line', micros.map((q) => q.mc.line)),
          num(yLabel, micros.map((q) => r4(q.mc.y))),
          txt('Before: phase 1', micros.map((q) => plainText(pick(q.mc, 'before', 0)?.phase ?? ''))),
          num('Before: amount 1 (%)', micros.map((q) => r4(pick(q.mc, 'before', 0)?.frac ?? NaN))),
          txt('Before: phase 2', micros.map((q) => plainText(pick(q.mc, 'before', 1)?.phase ?? ''))),
          num('Before: amount 2 (%)', micros.map((q) => r4(pick(q.mc, 'before', 1)?.frac ?? NaN))),
          txt('After: phase 1', micros.map((q) => plainText(pick(q.mc, 'after', 0)?.phase ?? ''))),
          num('After: amount 1 (%)', micros.map((q) => r4(pick(q.mc, 'after', 0)?.frac ?? NaN))),
          txt('After: phase 2', micros.map((q) => plainText(pick(q.mc, 'after', 1)?.phase ?? ''))),
          num('After: amount 2 (%)', micros.map((q) => r4(pick(q.mc, 'after', 1)?.frac ?? NaN))),
        ],
      }
    : null;
  // every boundary: its points read along it (a sheet each)
  const lines = d.splines.filter((s) => s.points.length >= 2);
  const sheets: Dataset[] = lines.map((s, k) => {
    const pts = pathOf(s).map((p) => m.toData(p));
    return { name: s.name.trim() || `line ${k + 1}`, columns: [{ ...num(xLabel, pts.map((p) => r4(p.x))), role: 'x' }, { ...num(yLabel, pts.map((p) => r4(p.y))), role: 'y' }] };
  });
  const workbook: Workbook = { name: d.fileName || 'Phase digitizer', sheets: [dataset, ...(pathSheet ? [pathSheet] : []), ...(microSheet ? [microSheet] : []), ...sheets] };

  // the figure: the frame's range, the regions under the lines, the lines, the points over them
  const fd = frame?.map((p) => m.toData(p));
  const xs = fd ? fd.map((p) => p.x) : [val(d.axes[0]), val(d.axes[1])];
  const ys = fd ? fd.map((p) => p.y) : [val(d.axes[2]), val(d.axes[3])];
  const xRange: [number, number] = [Math.min(...xs), Math.max(...xs)];
  const yRange: [number, number] = [Math.min(...ys), Math.max(...ys)];
  const curves: Curve[] = [];
  const annotations: AnnotationItem[] = [];
  const series = (px: number[], py: number[], name: string) => ({ name, x: num(xLabel, px), y: num(name, py) });
  const shape = (id: string, spec: object): AnnotationItem => ({ id, type: 'shape', spec: { ...SHAPE_DEFAULTS, coords: 'data', ...spec } });
  const text = (id: string, spec: object): AnnotationItem => ({ id, type: 'text', spec: { ...TEXT_SPEC_DEFAULTS, coords: 'data', ...spec } });
  const data = (p: Px) => m.toData(p);
  const pts = (ps: Px[]) => ps.map((p) => `${r4(data(p).x)} ${r4(data(p).y)}`).join('; ');
  const line = (key: string, label: string, px: number[], py: number[], style: Parameters<typeof curveStyle>[0]) => curves.push({ key, label, noLegend: true, series: series(px, py, label), style: curveStyle(style) });

  if (d.showRegions !== false)
    regionFills(faces, d.regions).forEach((f, k) => {
      const r = d.regions[f.region];
      annotations.push(shape(`pd-region-${k}`, { kind: 'polygon', points: pts(f.poly), closed: true, fill: r.color, fillOpacity: r.opacity, width: 0, z: -2 }));
    });
  d.regions.forEach((r, k) => {
    if (!r.name.trim()) return;
    const p = data(r.labelPt);
    annotations.push(text(`pd-label-${k}`, { text: r.name, x: p.x, y: p.y, anchor: 'c', style: { size: 9, bold: true, color: '#222222', ...r.textStyle }, z: 1 }));
  });
  lines.forEach((s, k) => {
    const q = pathOf(s).map(data);
    // the boundaries alike, black (the colours are the regions')
    curves.push({ key: `pd:line:${k}`, label: s.name, noLegend: true, series: series(q.map((p) => p.x), q.map((p) => p.y), s.name), style: curveStyle({ mode: 'line', color: '#000000', lineWidth: 1.2 }) });
  });
  const fmt = (v: number, n = 1) => (Number.isFinite(v) ? v.toFixed(n) : '—');
  const xs4 = (x: number) => `${B} ${fmtNum(x, 4)}${unit ? ` ${unit}` : ''}`;
  const ys4 = (y: number) => `${fmtNum(y, 4)}${yUnit ? ` ${yUnit}` : ''}`;
  const yB = yRange[0];
  const right = (x: number) => x > (xRange[0] + xRange[1]) / 2;
  evals.forEach((e, k) => {
    let body: string;
    if (e.kind === 'path' && e.path) {
      const p = e.path;
      line(`pd:path:${k}`, `${e.name} path`, [e.x0, e.x0], [e.y0, p.yEnd], { mode: 'line', color: e.color, lineWidth: 1, arrowEnd: 'triangle' });
      p.cross.forEach((q, j) => {
        line(`pd:cross:${k}:${j}`, `${e.name} crossing`, [e.x0], [q.y], { mode: 'scatter', color: e.color, symbol: 'circle', symbolSize: 4, symbolFill: 'white', symbolEdge: 1.2 });
        annotations.push(text(`pd-cross-${k}-${j}`, { text: ys4(q.y), x: e.x0 + (xRange[1] - xRange[0]) * 0.012, y: q.y, anchor: 'l', style: { size: 6.5, color: e.color }, z: 4 }));
      });
      const micro = p.micro.flatMap((mc) => {
        const before = mc.before ? `${mc.line}: ${mc.before.map((q) => `${q.phase} ${fmt(q.frac)} %`).join(', ')}` : '';
        const after = mc.after ? `below: ${mc.after.map((q) => `${q.phase} ${fmt(q.frac)} %`).join(', ')}` : '';
        return [before, after].filter(Boolean);
      });
      body = [pathText(p, (v) => fmtNum(v, 4)), ...micro].join('\n');
    } else if (e.kind === 'read') {
      body = `${e.region || '—'}\n${xs4(e.x0)}, ${d.yName || 'Y'} ${ys4(e.y0)}`;
    } else {
      const drops: [number, string][] = [[e.x0, e.color], ...(e.ends ? ([[e.ends[0].x, e.armA], [e.ends[1].x, e.armB]] as [number, string][]) : [])];
      drops.forEach(([x, col], j) => line(`pd:drop:${k}:${j}`, `${e.name} drop`, [x, x], [e.y0, yB], { mode: 'line', color: col, lineWidth: 0.6, dash: 'dash' }));
      if (e.ends) {
        const [p, q] = e.ends;
        const ar = armsOf(e)!;
        line(`pd:armA:${k}`, `${e.name} arm a`, [p.x, e.x0], [e.y0, e.y0], { mode: 'line', color: e.armA, lineWidth: 1.4 });
        line(`pd:armB:${k}`, `${e.name} arm b`, [e.x0, q.x], [e.y0, e.y0], { mode: 'line', color: e.armB, lineWidth: 1.4 });
        e.ends.forEach((q, j) => line(`pd:end:${k}:${j}`, `${e.name} end`, [q.x], [e.y0], { mode: 'scatter', color: j ? e.armB : e.armA, symbol: 'circle', symbolSize: 4.5, symbolFill: 'white', symbolEdge: 1.2 }));
        // the arms named over their middles
        annotations.push(text(`pd-arma-${k}`, { text: `a = ${fmtNum(ar.a, 3)}`, x: (p.x + e.x0) / 2, y: e.y0, anchor: 'b', style: { size: 6.5, color: e.armA }, z: 4 }));
        annotations.push(text(`pd-armb-${k}`, { text: `b = ${fmtNum(ar.b, 3)}`, x: (q.x + e.x0) / 2, y: e.y0, anchor: 'b', style: { size: 6.5, color: e.armB }, z: 4 }));
      }
      body = e.ends ? e.ends.map((q) => `${q.phase}: ${xs4(q.x)}, ${fmt(q.frac)} %`).join('\n') : `${e.region || 'one phase'}: 100 %`;
    }
    line(`pd:pt:${k}`, e.name, [e.x0], [e.y0], { mode: 'scatter', color: e.color, symbol: 'diamond', symbolSize: 6, symbolFill: 'filled' });
    annotations.push(text(`pd-pt-${k}`, { text: `${e.name}\n${body}`, x: e.x0, y: e.y0, anchor: right(e.x0) ? 'br' : 'bl', style: { size: 7, color: '#000000' }, box: 'both', boxColor: '#ffffff', borderColor: e.color, borderWidth: 0.8, padding: 2, z: 5 }));
  });
  (d.notes ?? []).forEach((n, k) => {
    const p = data(n.p1);
    if (n.kind === 'text') {
      if (n.text?.trim()) annotations.push(text(`pd-note-${k}`, { text: n.text, x: p.x, y: p.y, anchor: 'c', style: { size: 9, color: n.color || '#222222', ...n.textStyle }, z: 3 }));
    } else if (n.p2) {
      const q = data(n.p2);
      annotations.push(shape(`pd-note-${k}`, { kind: n.kind, x1: p.x, y1: p.y, x2: q.x, y2: q.y, color: n.color || '#1971c2', width: 1, head1: 'none', head2: n.kind === 'arrow' ? 'triangle' : 'none', z: 3 }));
    }
  });
  return { dataset, workbook, curves, annotations: [...annotations, ...(d.annotations ?? [])], evals, xRange, yRange, xLabel, yLabel, note: m.note };
}
