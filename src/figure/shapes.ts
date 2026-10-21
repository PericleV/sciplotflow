// The geometry of the annotation shapes, in pt on the page (y down): brackets and braces in any direction, stars and
// regular polygons, arcs and sectors, bent lines. Pure: the drawing (render.tsx) and the checks use it.
import type { ShapeSpec } from './spec.ts';

export type Pt = [number, number];
const n2 = (v: number) => (Number.isFinite(v) ? +v.toFixed(2) : 0);
const P = (p: Pt) => `${n2(p[0])},${n2(p[1])}`;

// A bracket: the ends of its base (p1, p2) and the direction of its legs (n, a unit vector), from its spec and the
// mapping of its coordinates to the page.
export function bracketBase(s: ShapeSpec, X: (v: number) => number, Y: (v: number) => number): { p1: Pt; p2: Pt; n: Pt } {
  const o = s.orient ?? 'down';
  if (o === 'down' || o === 'up') return { p1: [X(s.x1), Y(s.y1)], p2: [X(s.x2), Y(s.y1)], n: [0, o === 'down' ? 1 : -1] };
  if (o === 'left' || o === 'right') return { p1: [X(s.x1), Y(s.y1)], p2: [X(s.x1), Y(s.y2)], n: [o === 'left' ? -1 : 1, 0] };
  const p1: Pt = [X(s.x1), Y(s.y1)];
  const p2: Pt = [X(s.x2), Y(s.y2)];
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
  const f = s.flip ? -1 : 1;
  return { p1, p2, n: [(-(p2[1] - p1[1]) / len) * f, ((p2[0] - p1[0]) / len) * f] };
}

// The path of a bracket over p1 → p2, its legs l1, l2 along n: square ⊓, a curly brace (as deep as l1: its ends towards
// n, its point away), a bar with ends |—|. depth: how far it reaches away from n (where its text starts).
export function bracketPath(p1: Pt, p2: Pt, n: Pt, l1: number, l2: number, style: ShapeSpec['bstyle'] = 'square'): { d: string; depth: number } {
  const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const u: Pt = L ? [(p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L] : [1, 0];
  const at = (t: number, v: number): string => P([p1[0] + u[0] * t + n[0] * v, p1[1] + u[1] * t + n[1] * v]);
  if (style === 'curly') {
    const h = Math.max(0, l1);
    const q = Math.min(h / 2, L / 4);
    return {
      d: `M${at(0, h / 2)}Q${at(0, 0)} ${at(q, 0)}L${at(L / 2 - q, 0)}Q${at(L / 2, 0)} ${at(L / 2, -h / 2)}Q${at(L / 2, 0)} ${at(L / 2 + q, 0)}L${at(L - q, 0)}Q${at(L, 0)} ${at(L, h / 2)}`,
      depth: h / 2,
    };
  }
  if (style === 'bar') return { d: `M${at(0, -l1 / 2)}L${at(0, l1 / 2)}M${at(0, 0)}L${at(L, 0)}M${at(L, -l2 / 2)}L${at(L, l2 / 2)}`, depth: Math.max(l1, l2) / 2 };
  return { d: `M${at(0, l1)}L${at(0, 0)}L${at(L, 0)}L${at(L, l2)}`, depth: 0 };
}

// Where the text of a bracket goes: past its middle away from the legs, `gap` pt beyond its depth; turned along it (kept
// readable), level, or at an angle (degrees, clockwise) — and how it sits on that point.
export function bracketTextPlace(p1: Pt, p2: Pt, n: Pt, depth: number, gap: number, dir: ShapeSpec['textDir'] = 'along', angle = 0): { x: number; y: number; rotate: number; anchor: 'start' | 'middle' | 'end'; valign: 'top' | 'middle' | 'bottom' } {
  const o: Pt = [-n[0], -n[1]];
  const x = (p1[0] + p2[0]) / 2 + o[0] * (depth + gap);
  const y = (p1[1] + p2[1]) / 2 + o[1] * (depth + gap);
  let rotate = 0;
  if (dir === 'along') {
    rotate = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
    if (rotate > 90) rotate -= 180;
    else if (rotate <= -90) rotate += 180;
    if (Math.abs(rotate) < 1e-9) rotate = 0;
  } else if (dir === 'angle') rotate = Number.isFinite(angle) ? angle : 0;
  const r = (rotate * Math.PI) / 180;
  // the text's own up and right on the page
  const up = o[0] * Math.sin(r) - o[1] * Math.cos(r);
  const right = o[0] * Math.cos(r) + o[1] * Math.sin(r);
  if (Math.abs(up) >= Math.abs(right) * 0.7) return { x, y, rotate, anchor: 'middle', valign: up > 0 ? 'bottom' : 'top' };
  return { x, y, rotate, anchor: right > 0 ? 'start' : 'end', valign: 'middle' };
}

// A star of n points (its inner corners at inner × its size) or a regular polygon of n sides in the ellipse of radii
// rx, ry around (cx, cy), a point at the top.
export function starPoints(cx: number, cy: number, rx: number, ry: number, n: number, inner: number | null): Pt[] {
  const k = Math.max(3, Math.min(64, Math.round(n) || 5));
  const m = inner === null ? k : 2 * k;
  return Array.from({ length: m }, (_, j) => {
    const a = -Math.PI / 2 + (j * 2 * Math.PI) / m;
    const r = inner !== null && j % 2 ? inner : 1;
    return [cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)] as Pt;
  });
}
export const pointsPath = (pts: Pt[]) => `M${pts.map(P).join('L')}Z`;

// An arc of the ellipse (radii rx, ry around (cx, cy)) from a1 to a2 degrees (0: to the right, counter-clockwise), or the
// sector it closes with the centre.
export function arcPath(cx: number, cy: number, rx: number, ry: number, a1: number, a2: number, sector: boolean): string {
  const at = (a: number): Pt => [cx + rx * Math.cos((a * Math.PI) / 180), cy - ry * Math.sin((a * Math.PI) / 180)];
  let span = (((a2 - a1) % 360) + 360) % 360;
  if (span === 0 && a1 !== a2) span = 360;
  if (span >= 359.999) {
    // a whole ellipse: two halves
    const h = `A${n2(rx)} ${n2(ry)} 0 1 0 ${P(at(a1 + 180))}A${n2(rx)} ${n2(ry)} 0 1 0 ${P(at(a1))}`;
    return `M${P(at(a1))}${h}${sector ? 'Z' : ''}`;
  }
  const arc = `A${n2(rx)} ${n2(ry)} 0 ${span > 180 ? 1 : 0} 0 ${P(at(a1 + span))}`;
  return sector ? `M${n2(cx)},${n2(cy)}L${P(at(a1))}${arc}Z` : `M${P(at(a1))}${arc}`;
}

// A line from p1 to p2 bent by `curve` (its middle pushed aside by curve × half its length; 0: straight), stopped a and
// b pt before its ends (for the heads): its path, the directions of its ends (out of the line) and its middle point.
export function bentLine(p1: Pt, p2: Pt, curve: number, a: number, b: number): { d: string; ang1: number; ang2: number; mid: Pt; side: Pt } {
  const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
  const side: Pt = [-(p2[1] - p1[1]) / L, (p2[0] - p1[0]) / L];
  const k = Number.isFinite(curve) ? curve : 0;
  const c: Pt = [(p1[0] + p2[0]) / 2 + side[0] * k * L, (p1[1] + p2[1]) / 2 + side[1] * k * L];
  const unit = (from: Pt, to: Pt): Pt => {
    const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    return [(to[0] - from[0]) / l, (to[1] - from[1]) / l];
  };
  const u1 = unit(p1, c);
  const u2 = unit(c, p2);
  const s: Pt = [p1[0] + u1[0] * a, p1[1] + u1[1] * a];
  const e: Pt = [p2[0] - u2[0] * b, p2[1] - u2[1] * b];
  const mid: Pt = [(p1[0] + 2 * c[0] + p2[0]) / 4, (p1[1] + 2 * c[1] + p2[1]) / 4];
  return { d: k ? `M${P(s)}Q${P(c)} ${P(e)}` : `M${P(s)}L${P(e)}`, ang1: Math.atan2(-u1[1], -u1[0]), ang2: Math.atan2(u2[1], u2[0]), mid, side };
}

// A line through its points (its ends and its bends): a smooth curve (Catmull–Rom, as cubic Bézier pieces), its ends
// moved in by a and b along it (room for arrow heads); the angles of its ends (as bentLine's), the middle of every piece
// (where a bend is added).
export function throughLine(pts: Pt[], a: number, b: number): { d: string; ang1: number; ang2: number; mids: Pt[] } {
  const n = pts.length;
  const at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  const pieces = Array.from({ length: n - 1 }, (_, i) => {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return { p1, c1, c2, p2 };
  });
  const unit = (from: Pt, to: Pt): Pt => {
    const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    return [(to[0] - from[0]) / l, (to[1] - from[1]) / l];
  };
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  // the tangents at the ends (towards the first control point, from the last one)
  const u1 = unit(first.p1, Math.hypot(first.c1[0] - first.p1[0], first.c1[1] - first.p1[1]) > 1e-9 ? first.c1 : first.p2);
  const u2 = unit(Math.hypot(last.p2[0] - last.c2[0], last.p2[1] - last.c2[1]) > 1e-9 ? last.c2 : last.p1, last.p2);
  const s: Pt = [first.p1[0] + u1[0] * a, first.p1[1] + u1[1] * a];
  const e: Pt = [last.p2[0] - u2[0] * b, last.p2[1] - u2[1] * b];
  const d = pieces.map((q, i) => `${i === 0 ? `M${P(s)}` : ''}C${P(q.c1)} ${P(q.c2)} ${P(i === pieces.length - 1 ? e : q.p2)}`).join('');
  const mids = pieces.map((q): Pt => [(q.p1[0] + 3 * q.c1[0] + 3 * q.c2[0] + q.p2[0]) / 8, (q.p1[1] + 3 * q.c1[1] + 3 * q.c2[1] + q.p2[1]) / 8]);
  return { d, ang1: Math.atan2(-u1[1], -u1[0]), ang2: Math.atan2(u2[1], u2[0]), mids };
}
// the bends of a line ("x y; x y …"), and written back
export const bendPoints = (s: string | undefined): Pt[] =>
  (s ?? '')
    .split(';')
    .map((p) => p.trim().split(/[\s,]+/).map(Number))
    .filter((p): p is Pt => p.length === 2 && p.every(Number.isFinite));
export const bendText = (pts: Pt[]) => pts.map(([x, y]) => `${+x.toPrecision(6)} ${+y.toPrecision(6)}`).join('; ');

// A nice length for a scale bar about `raw` long: 1, 2 or 5 × a power of ten.
export function niceLength(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

// ---- arrows: their middle line as points (sampled where it curves), cut at the heads, moved aside, waved ----
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unitOf = (a: Pt, b: Pt): Pt => {
  const l = dist(a, b) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
// a line bent by `curve` (as bentLine), as points
export function bentPoints(p1: Pt, p2: Pt, curve: number, n = 48): Pt[] {
  if (!curve) return [p1, p2];
  const L = dist(p1, p2) || 1;
  const side: Pt = [-(p2[1] - p1[1]) / L, (p2[0] - p1[0]) / L];
  const c: Pt = [(p1[0] + p2[0]) / 2 + side[0] * curve * L, (p1[1] + p2[1]) / 2 + side[1] * curve * L];
  return Array.from({ length: n + 1 }, (_, i): Pt => {
    const t = i / n;
    return [(1 - t) ** 2 * p1[0] + 2 * (1 - t) * t * c[0] + t * t * p2[0], (1 - t) ** 2 * p1[1] + 2 * (1 - t) * t * c[1] + t * t * p2[1]];
  });
}
// a smooth line through its points (the pieces of throughLine), as points
export function throughPoints(pts: Pt[], n = 24): Pt[] {
  const m = pts.length;
  const at = (i: number) => pts[Math.max(0, Math.min(m - 1, i))];
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < m - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const a = (1 - t) ** 3;
      const b = 3 * (1 - t) ** 2 * t;
      const c = 3 * (1 - t) * t * t;
      const d = t ** 3;
      out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]]);
    }
  }
  return out;
}
export type Elbow = 'hv' | 'vh' | 'hvh' | 'vhv';
// the corners of an elbow line from p1 to p2: across then down (hv), down then across (vh), across–down–across (hvh,
// its upright piece at `at` of the way), down–across–down (vhv)
export function elbowCorners(p1: Pt, p2: Pt, route: Elbow, at = 0.5): Pt[] {
  const k = Number.isFinite(at) ? Math.max(0, Math.min(1, at)) : 0.5;
  if (route === 'hv') return [p1, [p2[0], p1[1]], p2];
  if (route === 'vh') return [p1, [p1[0], p2[1]], p2];
  if (route === 'hvh') {
    const x = p1[0] + (p2[0] - p1[0]) * k;
    return [p1, [x, p1[1]], [x, p2[1]], p2];
  }
  const y = p1[1] + (p2[1] - p1[1]) * k;
  return [p1, [p1[0], y], [p2[0], y], p2];
}
// a line through corners, each rounded by r (as points: a few on every round corner); repeated points left out
export function roundedCorners(pts: Pt[], r: number, n = 8): Pt[] {
  const clean = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-9);
  if (!(r > 0) || clean.length < 3) return clean;
  const out: Pt[] = [clean[0]];
  for (let i = 1; i < clean.length - 1; i++) {
    const [a, c, b] = [clean[i - 1], clean[i], clean[i + 1]];
    const q = Math.min(r, dist(a, c) / 2, dist(c, b) / 2);
    const s = lerp(c, a, q / (dist(a, c) || 1));
    const e = lerp(c, b, q / (dist(c, b) || 1));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push([(1 - t) ** 2 * s[0] + 2 * (1 - t) * t * c[0] + t * t * e[0], (1 - t) ** 2 * s[1] + 2 * (1 - t) * t * c[1] + t * t * e[1]]);
    }
  }
  out.push(clean[clean.length - 1]);
  return out;
}
export const lineLength = (pts: Pt[]) => pts.reduce((a, p, i) => (i ? a + dist(pts[i - 1], p) : 0), 0);
// the point at t (0 – 1) of the way along the line, and the direction there
export function pointAlong(pts: Pt[], t: number): { p: Pt; u: Pt } {
  const L = lineLength(pts);
  const want = Math.max(0, Math.min(1, t)) * L;
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (s + l >= want || i === pts.length - 1) return { p: lerp(pts[i - 1], pts[i], l ? Math.min(1, (want - s) / l) : 0), u: unitOf(pts[i - 1], pts[i]) };
    s += l;
  }
  return { p: pts[0] ?? [0, 0], u: [1, 0] };
}
// the line with a cut from its start and b from its end (along it)
export function trimLine(pts: Pt[], a: number, b: number): Pt[] {
  const L = lineLength(pts);
  if (pts.length < 2 || !(L > 0)) return pts;
  if (a + b >= L) return [pointAlong(pts, Math.min(1, a / L)).p, pointAlong(pts, Math.max(0, 1 - b / L)).p];
  const to = L - b;
  const out: Pt[] = [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    const [s0, s1] = [s, s + l];
    s = s1;
    if (s1 < a) continue;
    if (!out.length) out.push(lerp(pts[i - 1], pts[i], l ? Math.max(0, (a - s0) / l) : 0));
    if (s1 < to) out.push(pts[i]);
    else {
      out.push(lerp(pts[i - 1], pts[i], l ? (to - s0) / l : 1));
      break;
    }
  }
  return out.length >= 2 ? out : [pts[0], pts[pts.length - 1]];
}
// the line moved d to its left (its "above" when it goes to the right: y is down), its corners kept sharp
export function offsetLine(pts: Pt[], d: number): Pt[] {
  if (!d || pts.length < 2) return pts;
  const nOf = (a: Pt, b: Pt): Pt => {
    const u = unitOf(a, b);
    return [u[1], -u[0]];
  };
  return pts.map((p, i): Pt => {
    const na = i > 0 ? nOf(pts[i - 1], p) : null;
    const nb = i < pts.length - 1 ? nOf(p, pts[i + 1]) : null;
    if (!na || !nb) {
      const n = (na ?? nb)!;
      return [p[0] + n[0] * d, p[1] + n[1] * d];
    }
    const m: Pt = [na[0] + nb[0], na[1] + nb[1]];
    const ml = Math.hypot(m[0], m[1]) || 1;
    const k = 1 / Math.max(0.3, (m[0] * na[0] + m[1] * na[1]) / ml);
    return [p[0] + (m[0] / ml) * d * k, p[1] + (m[1] / ml) * d * k];
  });
}
// the line as a wave (or a zigzag) of `amp` pt either side, `wave` pt long, growing from nothing over its first half
// wave and back to nothing over its last
export function waveLine(pts: Pt[], amp: number, wave: number, zig: boolean): Pt[] {
  const L = lineLength(pts);
  const w = Math.max(0.5, wave);
  if (!(L > 0) || !(amp > 0)) return pts;
  const step = zig ? w / 4 : w / 16;
  const n = Math.max(2, Math.ceil(L / step));
  return Array.from({ length: n + 1 }, (_, i): Pt => {
    const s = (i / n) * L;
    const { p, u } = pointAlong(pts, s / L);
    const env = Math.min(1, s / (w / 2), (L - s) / (w / 2));
    const ph = (s / w) * 2 * Math.PI;
    const v = zig ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    const off = amp * Math.max(0, env) * v;
    return [p[0] + u[1] * off, p[1] - u[0] * off];
  });
}
export const pointsD = (pts: Pt[], close = false) => (pts.length ? `M${pts.map(P).join('L')}${close ? 'Z' : ''}` : '');
// the directions out of the line at its ends (as bentLine's ang1, ang2)
export function endAngles(pts: Pt[]): { ang1: number; ang2: number } {
  const n = pts.length;
  const a = pts.find((p) => dist(p, pts[0]) > 1e-6) ?? pts[n - 1];
  const b = [...pts].reverse().find((p) => dist(p, pts[n - 1]) > 1e-6) ?? pts[0];
  return { ang1: Math.atan2(pts[0][1] - a[1], pts[0][0] - a[0]), ang2: Math.atan2(pts[n - 1][1] - b[1], pts[n - 1][0] - b[0]) };
}

// ---- connectors: where a line meets a shape it is stuck to ----
// A shape's outline for that: its box (centre, size, turned rot degrees about its centre), an ellipse or a rectangle.
export type Outline = { cx: number; cy: number; w: number; h: number; rot: number; ellipse: boolean };
export type StickSide = 'auto' | 't' | 'b' | 'l' | 'r' | 'c';
const turn = (p: Pt, c: Pt, deg: number): Pt => {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180;
  const [x, y] = [p[0] - c[0], p[1] - c[1]];
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
};
// the point of the outline on a side (the middle of that side, or the centre), or (auto) where the ray from its centre
// towards `toward` leaves it; `away` further out from the centre
export function outlinePoint(o: Outline, side: StickSide, toward: Pt, away = 0): Pt {
  const c: Pt = [o.cx, o.cy];
  if (side === 'c') return c;
  const [hw, hh] = [Math.abs(o.w) / 2, Math.abs(o.h) / 2];
  let local: Pt;
  if (side !== 'auto') local = side === 't' ? [0, -hh] : side === 'b' ? [0, hh] : side === 'l' ? [-hw, 0] : [hw, 0];
  else {
    // the direction to the point, in the shape's own (unturned) frame
    const t = turn(toward, c, -o.rot);
    let [dx, dy] = [t[0] - c[0], t[1] - c[1]];
    if (!dx && !dy) dx = 1;
    if (o.ellipse) {
      const k = 1 / Math.sqrt((dx * dx) / (hw * hw || 1e-12) + (dy * dy) / (hh * hh || 1e-12));
      local = [dx * k, dy * k];
    } else {
      const k = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      local = [dx * k, dy * k];
    }
  }
  const l = Math.hypot(local[0], local[1]);
  const out: Pt = l && away ? [local[0] + (local[0] / l) * away, local[1] + (local[1] / l) * away] : local;
  return turn([c[0] + out[0], c[1] + out[1]], c, o.rot);
}
// a tapered line as an outline: w0 pt wide at its start, w1 at its end
export function taperOutline(pts: Pt[], w0: number, w1: number): Pt[] {
  const L = lineLength(pts) || 1;
  let s = 0;
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((p, i) => {
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n: Pt = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
    const h = (w0 + (w1 - w0) * (s / L)) / 2;
    left.push([p[0] + n[0] * h, p[1] + n[1] * h]);
    right.push([p[0] - n[0] * h, p[1] - n[1] * h]);
  });
  return [...left, ...right.reverse()];
}
// the side a line's text goes to ("above"): its normal pointing up the page (a line going up or down: to the right)
export function aboveOf(u: Pt): Pt {
  const n: Pt = [u[1], -u[0]];
  if (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[0] > 0)) return n;
  return [-n[0], -n[1]];
}

// A box (x1, y1, x2, y2 on the page) turned by deg degrees (clockwise) about its centre: the place of a handle (ix, iy:
// −1, 0 or 1 across and down: a corner, the middle of a side), and the box after that handle is dragged by (dx, dy) on
// the page — a side moves alone, the other one staying (ctrl: about the centre, the other side the other way); a corner
// moves its two sides (shift: as wide and as high as before, both by the larger change). The box keeps its turn.
export type Box4 = [number, number, number, number];
export function boxHandleAt(b: Box4, deg: number, ix: number, iy: number): Pt {
  const [cx, cy] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const t = (deg * Math.PI) / 180;
  const [u, v] = [(ix * Math.abs(b[2] - b[0])) / 2, (iy * Math.abs(b[3] - b[1])) / 2];
  return [cx + u * Math.cos(t) - v * Math.sin(t), cy + u * Math.sin(t) + v * Math.cos(t)];
}
export function resizeBox(b: Box4, deg: number, ix: number, iy: number, dx: number, dy: number, shift: boolean, ctrl: boolean): Box4 {
  const [cx, cy] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const t = (deg * Math.PI) / 180;
  const [co, si] = [Math.cos(t), Math.sin(t)];
  // x1, x2 and y1, y2 in the box's own frame (from its centre, before it is turned); which of each is the left / top
  const u0 = [b[0] - cx, b[2] - cx];
  const v0 = [b[1] - cy, b[3] - cy];
  const ju = (ix < 0) === b[0] <= b[2] ? 0 : 1;
  const jv = (iy < 0) === b[1] <= b[3] ? 0 : 1;
  // the move in that frame
  const du = dx * co + dy * si;
  const dv = -dx * si + dy * co;
  const u = [...u0];
  const v = [...v0];
  if (ix) {
    u[ju] += du;
    if (ctrl) u[1 - ju] -= du;
  }
  if (iy) {
    v[jv] += dv;
    if (ctrl) v[1 - jv] -= dv;
  }
  const w0 = u0[1] - u0[0];
  const h0 = v0[1] - v0[0];
  if (shift && ix && iy && Math.abs(w0) > 1e-9 && Math.abs(h0) > 1e-9) {
    const [fw, fh] = [(u[1] - u[0]) / w0, (v[1] - v[0]) / h0];
    const f = Math.max(Math.abs(fw), Math.abs(fh));
    const [w, h] = [w0 * f * (Math.sign(fw) || 1), h0 * f * (Math.sign(fh) || 1)];
    if (ctrl) [u[0], u[1], v[0], v[1]] = [-w / 2, w / 2, -h / 2, h / 2];
    else {
      if (ju === 1) u[1] = u[0] + w;
      else u[0] = u[1] - w;
      if (jv === 1) v[1] = v[0] + h;
      else v[0] = v[1] - h;
    }
  }
  // the new centre on the page (the box turned about it), the box around it
  const [um, vm] = [(u[0] + u[1]) / 2, (v[0] + v[1]) / 2];
  const [ncx, ncy] = [cx + um * co - vm * si, cy + um * si + vm * co];
  return [ncx + u[0] - um, ncy + v[0] - vm, ncx + u[1] - um, ncy + v[1] - vm];
}
