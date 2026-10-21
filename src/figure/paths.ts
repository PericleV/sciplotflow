// Paths (a Figure Drawing's free shapes): SVG path text read into absolute moves, lines and cubic curves (arcs and
// quadratic curves turned into cubic ones), written back, moved point by point; every annotation shape as such a path
// (to edit its nodes, combine it with others, cut with it, write along it); corners rounded or cut. Pure.
import { bendPoints, elbowCorners, piePath, starPoints, type Pt } from './shapes.ts';
import type { ShapeSpec } from './spec.ts';

export type Seg = { c: 'M' | 'L' | 'C' | 'Z'; p: number[] };
const r4 = (v: number) => (Number.isFinite(v) ? +v.toFixed(4) : 0);

// ---- reading and writing ----
// SVG path text → M, L, C, Z with absolute points (H, V, S, Q, T, A and relative commands too)
export function parsePath(d: string | undefined): Seg[] {
  const out: Seg[] = [];
  const tokens = (d ?? '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let prevC: Pt | null = null; // the last cubic control (for S)
  let prevQ: Pt | null = null; // the last quadratic control (for T)
  const num = () => Number(tokens[i++]);
  const more = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    out.push({ c: 'C', p: [x1, y1, x2, y2, ex, ey] });
    [x, y] = [ex, ey];
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'Z') {
      out.push({ c: 'Z', p: [] });
      [x, y] = [sx, sy];
      prevC = prevQ = null;
      cmd = '';
      continue;
    }
    if (!more()) {
      cmd = '';
      continue;
    }
    switch (C) {
      case 'M': {
        [x, y] = [ox + num(), oy + num()];
        [sx, sy] = [x, y];
        out.push({ c: 'M', p: [x, y] });
        cmd = rel ? 'l' : 'L';
        prevC = prevQ = null;
        continue;
      }
      case 'L':
        [x, y] = [ox + num(), oy + num()];
        out.push({ c: 'L', p: [x, y] });
        prevC = prevQ = null;
        break;
      case 'H':
        x = (rel ? x : 0) + num();
        out.push({ c: 'L', p: [x, y] });
        prevC = prevQ = null;
        break;
      case 'V':
        y = (rel ? y : 0) + num();
        out.push({ c: 'L', p: [x, y] });
        prevC = prevQ = null;
        break;
      case 'C': {
        const [x1, y1, x2, y2, ex, ey] = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
        cubic(x1, y1, x2, y2, ex, ey);
        prevC = [x2, y2];
        prevQ = null;
        break;
      }
      case 'S': {
        const [x1, y1] = prevC ? [2 * x - prevC[0], 2 * y - prevC[1]] : [x, y];
        const [x2, y2, ex, ey] = [ox + num(), oy + num(), ox + num(), oy + num()];
        cubic(x1, y1, x2, y2, ex, ey);
        prevC = [x2, y2];
        prevQ = null;
        break;
      }
      case 'Q':
      case 'T': {
        let qx = x;
        let qy = y;
        if (C === 'Q') [qx, qy] = [ox + num(), oy + num()];
        else if (prevQ) [qx, qy] = [2 * x - prevQ[0], 2 * y - prevQ[1]];
        const [ex, ey] = [ox + num(), oy + num()];
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        prevQ = [qx, qy];
        prevC = null;
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep, ex, ey] = [num(), num(), num(), num(), num(), ox + num(), oy + num()];
        for (const c of arcToCubics(x, y, rx, ry, rot, !!large, !!sweep, ex, ey)) cubic(c[0], c[1], c[2], c[3], c[4], c[5]);
        [x, y] = [ex, ey];
        prevC = prevQ = null;
        break;
      }
      default:
        i++;
    }
  }
  return out;
}
// an elliptical arc (SVG's endpoint form) as cubic pieces of at most 90°
function arcToCubics(x1: number, y1: number, rx0: number, ry0: number, deg: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  if (x1 === x2 && y1 === y2) return [];
  let [rx, ry] = [Math.abs(rx0), Math.abs(ry0)];
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (deg * Math.PI) / 180;
  const [cs, sn] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cs * dx + sn * dy;
  const y1p = -sn * dx + cs * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) [rx, ry] = [rx * Math.sqrt(lam), ry * Math.sqrt(lam)];
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2;
  const cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const kk = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => [cx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, cy + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs];
  const der = (t: number): Pt => [-rx * Math.sin(t) * cs - ry * Math.cos(t) * sn, -rx * Math.sin(t) * sn + ry * Math.cos(t) * cs];
  const out: number[][] = [];
  for (let j = 0; j < n; j++) {
    const [a, b] = [t1 + j * step, t1 + (j + 1) * step];
    const [p0, p3, d0, d3] = [at(a), at(b), der(a), der(b)];
    out.push([p0[0] + kk * d0[0], p0[1] + kk * d0[1], p3[0] - kk * d3[0], p3[1] - kk * d3[1], j === n - 1 ? x2 : p3[0], j === n - 1 ? y2 : p3[1]]);
  }
  return out;
}
export const pathText = (segs: Seg[]) => segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.p.map(r4).join(' ')}`)).join(' ');
// every point (ends and controls) through f
export const mapSegs = (segs: Seg[], f: (p: Pt) => Pt): Seg[] =>
  segs.map((s) => {
    const p: number[] = [];
    for (let k = 0; k < s.p.length; k += 2) p.push(...f([s.p[k], s.p[k + 1]]));
    return { c: s.c, p };
  });
export const mapPath = (d: string, f: (p: Pt) => Pt) => pathText(mapSegs(parsePath(d), f));
// the end point of a segment (the start of the next), and the subpaths' starts
export const endOf = (s: Seg): Pt => [s.p[s.p.length - 2], s.p[s.p.length - 1]];
// points along the path (curves sampled), each subpath on its own
export function pathPolylines(segs: Seg[], n = 16): Pt[][] {
  const lines: Pt[][] = [];
  let cur: Pt[] = [];
  let start: Pt = [0, 0];
  for (const s of segs) {
    if (s.c === 'M') {
      if (cur.length) lines.push(cur);
      start = [s.p[0], s.p[1]];
      cur = [start];
    } else if (s.c === 'L') cur.push([s.p[0], s.p[1]]);
    else if (s.c === 'C') {
      const p0 = cur[cur.length - 1] ?? start;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const [a, b, c, d] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3];
        cur.push([a * p0[0] + b * s.p[0] + c * s.p[2] + d * s.p[4], a * p0[1] + b * s.p[1] + c * s.p[3] + d * s.p[5]]);
      }
    } else if (s.c === 'Z') cur.push(start);
  }
  if (cur.length) lines.push(cur);
  return lines;
}
export function pathBox(segs: Seg[]): { x: number; y: number; w: number; h: number } | null {
  const pts = pathPolylines(segs).flat();
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}
export const isClosed = (segs: Seg[]) => segs.some((s) => s.c === 'Z');

// ---- shapes as paths ----
const K = 0.5522847498; // a quarter ellipse as one cubic
const turnAbout = (c: Pt, deg: number) => {
  const a = (deg * Math.PI) / 180;
  const [cs, sn] = [Math.cos(a), Math.sin(a)];
  return ([x, y]: Pt): Pt => (deg ? [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs] : [x, y]);
};
const polyD = (pts: Pt[], close: boolean) => (pts.length ? `M${pts.map((p) => `${r4(p[0])} ${r4(p[1])}`).join(' L')}${close ? ' Z' : ''}` : '');
// a closed smooth curve through points (as the renderer's smooth polygon)
const smoothClosed = (pts: Pt[]) => {
  const n = pts.length;
  let d = `M${r4(pts[0][0])} ${r4(pts[0][1])}`;
  for (let k = 0; k < n; k++) {
    const [p0, p1, p2, p3] = [pts[(k - 1 + n) % n], pts[k], pts[(k + 1) % n], pts[(k + 2) % n]];
    d += ` C${[p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(r4).join(' ')}`;
  }
  return `${d} Z`;
};
// open: Catmull–Rom through the points (the ends' tangents to their neighbours)
const smoothOpen = (pts: Pt[]) => {
  const n = pts.length;
  const at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${r4(pts[0][0])} ${r4(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C${[p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(r4).join(' ')}`;
  }
  return d;
};
// a rectangle with a radius for each corner (top-left, top-right, bottom-right, bottom-left), each at most half its sides
export function roundedRectD(x: number, y: number, w: number, h: number, radii: number[]): string {
  const m = Math.min(w, h) / 2;
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(m, radii[i] ?? 0)));
  const q = (r: number) => r * (1 - K);
  let p = `M${r4(x + a)} ${r4(y)} L${r4(x + w - b)} ${r4(y)}`;
  if (b) p += ` C${[x + w - q(b), y, x + w, y + q(b), x + w, y + b].map(r4).join(' ')}`;
  p += ` L${r4(x + w)} ${r4(y + h - c)}`;
  if (c) p += ` C${[x + w, y + h - q(c), x + w - q(c), y + h, x + w - c, y + h].map(r4).join(' ')}`;
  p += ` L${r4(x + d)} ${r4(y + h)}`;
  if (d) p += ` C${[x + q(d), y + h, x, y + h - q(d), x, y + h - d].map(r4).join(' ')}`;
  p += ` L${r4(x)} ${r4(y + a)}`;
  if (a) p += ` C${[x, y + q(a), x + q(a), y, x + a, y].map(r4).join(' ')}`;
  return `${p} Z`;
}
export const radiiOf = (s: string | undefined): number[] | null => {
  const r = (s ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  return r.length === 4 && r.every((v) => Number.isFinite(v) && v >= 0) ? r : null;
};

// A shape's corners (`corners`): every one's radius and those of their own
export function cornersOf(s: string | undefined): { all: number; each: Map<number, number> } {
  const each = new Map<number, number>();
  let all = 0;
  for (const part of (s ?? '').split(';')) {
    const [k, v] = part.trim().split(/\s+/);
    const r = Number(v);
    if (!Number.isFinite(r) || r < 0) continue;
    if (k === '*') all = r;
    else if (/^\d+$/.test(k ?? '')) each.set(Number(k), r);
  }
  return { all, each };
}
export const cornersText = (all: number, each: Map<number, number>): string | undefined => {
  const parts = [...(all > 0 ? [`* ${+all.toFixed(3)}`] : []), ...[...each].filter(([, r]) => r !== all).sort((a, b) => a[0] - b[0]).map(([k, r]) => `${k} ${+r.toFixed(3)}`)];
  return parts.length ? parts.join('; ') : undefined;
};
export const CORNERED = new Set(['polygon', 'star', 'regular', 'path']);

// A shape's outline as a path, in its own units (unitPt: pt in one unit — for the corner radius given in pt); null when
// it has none (a band, a text …). A line or arrow: its middle line (without heads).
export function shapeToPath(s: ShapeSpec, unitPt = 1): string | null {
  const d = shapeOutline(s, unitPt);
  // its corners rounded as asked (pt)
  if (!d || !s.corners || !CORNERED.has(s.kind)) return d;
  const c = cornersOf(s.corners);
  return pathText(roundCorners(parsePath(d), (i) => (c.each.get(i) ?? c.all) / unitPt, false));
}
function shapeOutline(s: ShapeSpec, unitPt = 1): string | null {
  const [x1, y1, x2, y2] = [s.x1, s.y1, s.x2, s.y2];
  const c: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
  const [rx, ry] = [Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2];
  const t = turnAbout(c, s.rotation || 0);
  const tr = (d: string) => (s.rotation ? mapPath(d, t) : d);
  switch (s.kind) {
    case 'path':
      return s.d ? tr(s.d) : null;
    case 'rect': {
      const [x, y, w, h] = [Math.min(x1, x2), Math.min(y1, y2), 2 * rx, 2 * ry];
      const own = radiiOf(s.radii);
      if (own) return tr(roundedRectD(x, y, w, h, own.map((v) => v / unitPt)));
      const r = Math.min((s.radius || 0) / unitPt, w / 2, h / 2);
      if (!(r > 0)) return tr(polyD([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true));
      const q = r * (1 - K);
      return tr(
        `M${r4(x + r)} ${r4(y)} L${r4(x + w - r)} ${r4(y)} C${[x + w - q, y, x + w, y + q, x + w, y + r].map(r4).join(' ')} L${r4(x + w)} ${r4(y + h - r)} C${[x + w, y + h - q, x + w - q, y + h, x + w - r, y + h].map(r4).join(' ')} L${r4(x + r)} ${r4(y + h)} C${[x + q, y + h, x, y + h - q, x, y + h - r].map(r4).join(' ')} L${r4(x)} ${r4(y + r)} C${[x, y + q, x + q, y, x + r, y].map(r4).join(' ')} Z`,
      );
    }
    case 'ellipse': {
      const [cx, cy] = c;
      const [kx, ky] = [rx * K, ry * K];
      return tr(
        `M${r4(cx + rx)} ${r4(cy)} C${[cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry].map(r4).join(' ')} C${[cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy].map(r4).join(' ')} C${[cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry].map(r4).join(' ')} C${[cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy].map(r4).join(' ')} Z`,
      );
    }
    case 'star':
    case 'regular':
      return tr(polyD(starPoints(c[0], c[1], rx, ry, s.n ?? (s.kind === 'star' ? 5 : 6), s.kind === 'star' ? Math.min(1, Math.max(0.05, s.inner ?? 0.382)) : null), true));
    case 'arc': {
      // as the renderer: 0° to the right, counter-clockwise (y down: up the page)
      const at = (a: number): Pt => [c[0] + rx * Math.cos((a * Math.PI) / 180), c[1] - ry * Math.sin((a * Math.PI) / 180)];
      const a1 = s.a1 ?? 0;
      // a donut's slice, or one with its corners rounded: its arcs (read as curves)
      if (s.sector && ((s.hole ?? 0) > 0 || s.radius > 0)) return tr(pathText(parsePath(piePath(c[0], c[1], rx, ry, a1, s.a2 ?? 90, (s.hole ?? 0) / 100, (s.radius || 0) / unitPt, (v) => v))));
      let span = ((((s.a2 ?? 90) - a1) % 360) + 360) % 360;
      if (span === 0 && (s.a2 ?? 90) !== a1) span = 360;
      const n = Math.max(1, Math.ceil(span / 90));
      const st = span / n;
      let d = `M${r4(at(a1)[0])} ${r4(at(a1)[1])}`;
      for (let j = 0; j < n; j++) {
        const [a, b] = [a1 + j * st, a1 + (j + 1) * st];
        const k = (4 / 3) * Math.tan((st * Math.PI) / 720);
        const der = (q: number): Pt => [-rx * Math.sin((q * Math.PI) / 180), -ry * Math.cos((q * Math.PI) / 180)];
        const [p0, p3, d0, d3] = [at(a), at(b), der(a), der(b)];
        d += ` C${[p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]].map(r4).join(' ')}`;
      }
      return tr(s.sector ? `${d} L${r4(c[0])} ${r4(c[1])} Z` : d);
    }
    case 'polygon': {
      const pts = s.points
        .split(';')
        .map((q) => q.trim().split(/[\s,]+/).map(Number))
        .filter((q) => q.length >= 2 && q.every(Number.isFinite))
        .map((q): Pt => [q[0], q[1]]);
      if (pts.length < 2) return null;
      const closed = s.closed !== false && pts.length > 2;
      const pc: Pt = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
      const d = s.smooth && pts.length > 2 ? (closed ? smoothClosed(pts) : smoothOpen(pts)) : polyD(pts, closed);
      return s.rotation ? mapPath(d, turnAbout(pc, s.rotation)) : d;
    }
    case 'line':
    case 'arrow':
    case 'dimension': {
      const p1: Pt = [x1, y1];
      const p2: Pt = [x2, y2];
      if (s.kind === 'dimension') return polyD([p1, p2], false);
      if (s.route && s.route !== 'line') {
        const pts = elbowCorners(p1, p2, s.route, s.elbowAt ?? 0.5);
        const r = (s.radius || 0) / unitPt;
        if (!(r > 0)) return polyD(pts, false);
        let d = `M${r4(pts[0][0])} ${r4(pts[0][1])}`;
        for (let i = 1; i < pts.length - 1; i++) {
          const [a, cc, b] = [pts[i - 1], pts[i], pts[i + 1]];
          const la = Math.hypot(cc[0] - a[0], cc[1] - a[1]) || 1;
          const lb = Math.hypot(b[0] - cc[0], b[1] - cc[1]) || 1;
          const q = Math.min(r, la / 2, lb / 2);
          const s0: Pt = [cc[0] + ((a[0] - cc[0]) / la) * q, cc[1] + ((a[1] - cc[1]) / la) * q];
          const e0: Pt = [cc[0] + ((b[0] - cc[0]) / lb) * q, cc[1] + ((b[1] - cc[1]) / lb) * q];
          d += ` L${r4(s0[0])} ${r4(s0[1])} C${[s0[0] + (2 / 3) * (cc[0] - s0[0]), s0[1] + (2 / 3) * (cc[1] - s0[1]), e0[0] + (2 / 3) * (cc[0] - e0[0]), e0[1] + (2 / 3) * (cc[1] - e0[1]), e0[0], e0[1]].map(r4).join(' ')}`;
        }
        const e = pts[pts.length - 1];
        return `${d} L${r4(e[0])} ${r4(e[1])}`;
      }
      const bends = bendPoints(s.bends);
      if (bends.length) return smoothOpen([p1, ...bends, p2]);
      if (s.curve) {
        const L = Math.hypot(x2 - x1, y2 - y1) || 1;
        const side: Pt = [-(y2 - y1) / L, (x2 - x1) / L];
        const q: Pt = [(x1 + x2) / 2 + side[0] * s.curve * L, (y1 + y2) / 2 + side[1] * s.curve * L];
        return `M${r4(x1)} ${r4(y1)} C${[x1 + (2 / 3) * (q[0] - x1), y1 + (2 / 3) * (q[1] - y1), x2 + (2 / 3) * (q[0] - x2), y2 + (2 / 3) * (q[1] - y2), x2, y2].map(r4).join(' ')}`;
      }
      return polyD([p1, p2], false);
    }
    case 'image':
    case 'component':
      return tr(polyD([[Math.min(x1, x2), Math.min(y1, y2)], [Math.max(x1, x2), Math.min(y1, y2)], [Math.max(x1, x2), Math.max(y1, y2)], [Math.min(x1, x2), Math.max(y1, y2)]], true));
    default:
      return null;
  }
}

// ---- corners rounded (fillet) or cut (chamfer): every corner between two straight pieces ----
export function roundCorners(segs: Seg[], r: number | ((node: number) => number), cut: boolean, only?: Set<number>): Seg[] {
  if (typeof r === 'number' && !(r > 0)) return segs;
  // the subpaths as lists of nodes: their points, and whether the piece into each is straight
  const out: Seg[] = [];
  let i = 0;
  while (i < segs.length) {
    if (segs[i].c !== 'M') {
      out.push(segs[i++]);
      continue;
    }
    let j = i + 1;
    while (j < segs.length && segs[j].c !== 'M') j++;
    const sub = segs.slice(i, j);
    i = j;
    const closed = sub[sub.length - 1].c === 'Z';
    const body = sub.slice(1).filter((s) => s.c !== 'Z');
    const pts: Pt[] = [[sub[0].p[0], sub[0].p[1]], ...body.map(endOf)];
    // a closed one ends back at its start: that point once, the closing piece a straight line
    if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 1e-9) body.push({ c: 'L', p: [pts[0][0], pts[0][1]] });
    else if (closed) pts.pop();
    const n = closed ? body.length : body.length + 1;
    const segAt = (k: number) => body[(k + body.length) % body.length]; // the piece ending at node k + 1 (closed: wraps)
    const node = (k: number): Pt => endOf(closed ? segAt(k - 1) : k === 0 ? sub[0] : body[k - 1]);
    const straight = (k: number) => segAt(k).c === 'L';
    // for every node: where its corner starts and ends (null: kept as it is)
    const subStart = i - sub.length;
    const corner = Array.from({ length: n }, (_, k): [Pt, Pt] | null => {
      if (!closed && (k === 0 || k === n - 1)) return null;
      // only the nodes asked for (a node: the end of its segment; the first one: the subpath's start), each its radius
      const at = k === 0 ? subStart : subStart + k;
      if (only && !only.has(at)) return null;
      const rr = typeof r === 'number' ? r : r(at);
      if (!(rr > 0)) return null;
      const into = closed ? k - 1 : k - 1;
      const outOf = k;
      if (!straight(into) || !straight(outOf)) return null;
      const [a, c, b] = [node(k - 1), node(k), node(k + 1)];
      const la = Math.hypot(a[0] - c[0], a[1] - c[1]);
      const lb = Math.hypot(b[0] - c[0], b[1] - c[1]);
      if (!(la > 0) || !(lb > 0)) return null;
      const ua: Pt = [(a[0] - c[0]) / la, (a[1] - c[1]) / la];
      const ub: Pt = [(b[0] - c[0]) / lb, (b[1] - c[1]) / lb];
      const cosT = ua[0] * ub[0] + ua[1] * ub[1];
      if (cosT < -0.9999) return null; // straight on
      // a fillet of radius r: its ends r / tan(θ/2) from the corner; a chamfer r from it
      const th = Math.acos(Math.max(-1, Math.min(1, cosT)));
      const q = Math.min(cut ? rr : rr / Math.tan(th / 2), la / 2, lb / 2);
      return [
        [c[0] + ua[0] * q, c[1] + ua[1] * q],
        [c[0] + ub[0] * q, c[1] + ub[1] * q],
      ];
    });
    const pt = (p: Pt) => p.map(r4);
    const startNode = closed ? 0 : 0;
    const first = corner[startNode];
    out.push({ c: 'M', p: pt(first ? first[1] : node(startNode)) });
    for (let k = 1; k <= (closed ? n : n - 1); k++) {
      const kk = k % n;
      const seg = segAt(k - 1);
      const cr = corner[kk];
      const target = cr ? cr[0] : node(kk);
      if (seg.c === 'C') out.push({ c: 'C', p: [...seg.p.slice(0, 4), ...target].map(r4) });
      else out.push({ c: 'L', p: pt(target) });
      if (cr && (closed || kk !== 0)) {
        const c = node(kk);
        if (cut) out.push({ c: 'L', p: pt(cr[1]) });
        else out.push({ c: 'C', p: [cr[0][0] + (2 / 3) * (c[0] - cr[0][0]), cr[0][1] + (2 / 3) * (c[1] - cr[0][1]), cr[1][0] + (2 / 3) * (c[0] - cr[1][0]), cr[1][1] + (2 / 3) * (c[1] - cr[1][1]), cr[1][0], cr[1][1]].map(r4) });
      }
    }
    if (closed) out.push({ c: 'Z', p: [] });
  }
  return out;
}

// ---- editing nodes (a node: the end of a segment; its controls: the curve into it and the one out of it) ----
const cp = (segs: Seg[]) => segs.map((s) => ({ c: s.c, p: s.p.slice() }));
const subRange = (segs: Seg[], i: number) => {
  let a = i;
  while (a > 0 && segs[a].c !== 'M') a--;
  let b = a + 1;
  while (b < segs.length && segs[b].c !== 'M') b++;
  return { a, b, closed: segs[b - 1]?.c === 'Z' };
};
// a node taken away (its neighbours joined; a curve on both sides: one curve)
export function deleteNode(segs: Seg[], i: number): Seg[] {
  const out = cp(segs);
  const s = out[i];
  if (!s || s.c === 'Z') return out;
  const { a, b, closed } = subRange(out, i);
  const drawn = out.slice(a + 1, closed ? b - 1 : b).length;
  if (drawn < (closed ? 2 : 1)) return [...out.slice(0, a), ...out.slice(b)];
  if (s.c === 'M') {
    const nx = out[i + 1];
    out.splice(i, 2, { c: 'M', p: endOf(nx) });
    return out;
  }
  const nx = out[i + 1];
  if (s.c === 'C' && nx?.c === 'C') nx.p.splice(0, 2, s.p[0], s.p[1]);
  out.splice(i, 1);
  return out;
}
// a node added on the path where it passes nearest `at` (the segment there split, its shape kept)
export function insertNode(segs: Seg[], at: Pt): Seg[] {
  let best = { i: -1, t: 0, d: Infinity };
  let prev: Pt = [0, 0];
  let start: Pt = [0, 0];
  segs.forEach((s, i) => {
    if (s.c === 'M') {
      prev = start = [s.p[0], s.p[1]];
      return;
    }
    const e: Pt = s.c === 'Z' ? start : endOf(s);
    for (let k = 1; k < 40; k++) {
      const t = k / 40;
      const q: Pt =
        s.c === 'C'
          ? [(1 - t) ** 3 * prev[0] + 3 * (1 - t) ** 2 * t * s.p[0] + 3 * (1 - t) * t * t * s.p[2] + t ** 3 * e[0], (1 - t) ** 3 * prev[1] + 3 * (1 - t) ** 2 * t * s.p[1] + 3 * (1 - t) * t * t * s.p[3] + t ** 3 * e[1]]
          : [prev[0] + (e[0] - prev[0]) * t, prev[1] + (e[1] - prev[1]) * t];
      const d = Math.hypot(q[0] - at[0], q[1] - at[1]);
      if (d < best.d) best = { i, t, d };
    }
    prev = e;
  });
  if (best.i < 0) return segs;
  const out = cp(segs);
  const s = out[best.i];
  // where it starts
  let p0: Pt = [0, 0];
  for (let j = best.i - 1; j >= 0; j--)
    if (out[j].c !== 'Z') {
      p0 = endOf(out[j]);
      break;
    }
  const t = best.t;
  const lerp = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (s.c === 'C') {
    const [p1, p2, p3]: Pt[] = [
      [s.p[0], s.p[1]],
      [s.p[2], s.p[3]],
      [s.p[4], s.p[5]],
    ];
    const [a, b, c] = [lerp(p0, p1), lerp(p1, p2), lerp(p2, p3)];
    const [d, e] = [lerp(a, b), lerp(b, c)];
    const f = lerp(d, e);
    out.splice(best.i, 1, { c: 'C', p: [...a, ...d, ...f].map(r4) }, { c: 'C', p: [...e, ...c, ...p3].map(r4) });
  } else if (s.c === 'L') out.splice(best.i, 1, { c: 'L', p: lerp(p0, [s.p[0], s.p[1]]).map(r4) }, s);
  else {
    // the closing line: a node on it, before Z
    const { a } = subRange(out, best.i - 1);
    out.splice(best.i, 0, { c: 'L', p: lerp(p0, [out[a].p[0], out[a].p[1]]).map(r4) });
  }
  return out;
}
// the nodes before and after node i (the end of segment i), in its subpath (wrapping round when it is closed)
function around(segs: Seg[], i: number): { prev: Pt | null; next: Pt | null; nextSeg: number | null } {
  const { a, b, closed } = subRange(segs, i);
  const lastDrawn = closed ? b - 2 : b - 1;
  const atStart = i === a || (closed && i === lastDrawn && Math.hypot(endOf(segs[lastDrawn])[0] - segs[a].p[0], endOf(segs[lastDrawn])[1] - segs[a].p[1]) < 1e-9);
  const prevIdx = i === a ? (closed ? lastDrawn - (atStart && lastDrawn > a ? 1 : 0) : -1) : i - 1;
  const nextIdx = i === lastDrawn ? (closed ? a + 1 : -1) : i + 1;
  return { prev: prevIdx >= a && prevIdx !== i ? endOf(segs[prevIdx]) : null, next: nextIdx > a && nextIdx < b && segs[nextIdx].c !== 'Z' ? endOf(segs[nextIdx]) : null, nextSeg: nextIdx > a && nextIdx < b && segs[nextIdx].c !== 'Z' ? nextIdx : null };
}
// a node made smooth (its controls in line, a third of the way to its neighbours) or a corner (no controls)
export function toggleNode(segs: Seg[], i: number, smooth?: boolean): Seg[] {
  const out = cp(segs);
  const s = out[i];
  if (!s || s.c === 'Z') return out;
  const node = endOf(s);
  const { prev, next, nextSeg } = around(out, i);
  const ns = nextSeg !== null ? out[nextSeg] : null;
  const curved = (s.c === 'C' && Math.hypot(s.p[2] - node[0], s.p[3] - node[1]) > 1e-9) || (ns?.c === 'C' && Math.hypot(ns.p[0] - node[0], ns.p[1] - node[1]) > 1e-9);
  const makeSmooth = smooth ?? !curved;
  if (!makeSmooth) {
    if (s.c === 'C') s.p.splice(2, 2, ...node);
    if (ns?.c === 'C') ns.p.splice(0, 2, ...node);
    return out;
  }
  if (!prev && !next) return out;
  const P = prev ?? node;
  const N = next ?? node;
  const tl = Math.hypot(N[0] - P[0], N[1] - P[1]) || 1;
  const u: Pt = [(N[0] - P[0]) / tl, (N[1] - P[1]) / tl];
  const din = Math.hypot(node[0] - P[0], node[1] - P[1]) / 3;
  const dout = Math.hypot(N[0] - node[0], N[1] - node[1]) / 3;
  const cin: Pt = [node[0] - u[0] * din, node[1] - u[1] * din];
  const cout: Pt = [node[0] + u[0] * dout, node[1] + u[1] * dout];
  if (prev && s.c !== 'M') out[i] = { c: 'C', p: s.c === 'C' ? [s.p[0], s.p[1], ...cin, ...node].map(r4) : [...prev, ...cin, ...node].map(r4) };
  if (ns && nextSeg !== null) out[nextSeg] = { c: 'C', p: ns.c === 'C' ? [...cout, ns.p[2], ns.p[3], ns.p[4], ns.p[5]].map(r4) : [...cout, ...endOf(ns), ...endOf(ns)].map(r4) };
  return out;
}
export function smoothAll(segs: Seg[]): Seg[] {
  let out = segs;
  segs.forEach((s, i) => {
    if (s.c !== 'Z') out = toggleNode(out, i, true);
  });
  return out;
}
export const sharpAll = (segs: Seg[]): Seg[] => segs.map((s) => (s.c === 'C' ? { c: 'L', p: [s.p[4], s.p[5]] } : s));
// every subpath drawn the other way (its heads change ends)
export function reversePath(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  let i = 0;
  while (i < segs.length) {
    const { a, b, closed } = subRange(segs, i);
    const body = segs.slice(a + 1, closed ? b - 1 : b);
    const nodes: Pt[] = [[segs[a].p[0], segs[a].p[1]], ...body.map(endOf)];
    out.push({ c: 'M', p: nodes[nodes.length - 1] });
    for (let j = body.length - 1; j >= 0; j--) {
      const s = body[j];
      out.push(s.c === 'C' ? { c: 'C', p: [s.p[2], s.p[3], s.p[0], s.p[1], ...nodes[j]] } : { c: 'L', p: nodes[j] });
    }
    if (closed) out.push({ c: 'Z', p: [] });
    i = b;
  }
  return out;
}
// closed (every subpath) or open
export function setClosed(segs: Seg[], closed: boolean): Seg[] {
  const open = segs.filter((s) => s.c !== 'Z');
  if (!closed) return open;
  const out: Seg[] = [];
  open.forEach((s, i) => {
    out.push(s);
    if (i === open.length - 1 || open[i + 1].c === 'M') out.push({ c: 'Z', p: [] });
  });
  return out;
}

// ---- nodes added, paths joined and broken ----
// the start point of segment i (the end of the one before it; a closing Z: back to its subpath's start)
const startOf = (segs: Seg[], i: number): Pt => {
  for (let j = i - 1; j >= 0; j--) if (segs[j].c !== 'Z') return endOf(segs[j]);
  return [0, 0];
};
// segment i split in two at t (a line at its point, a curve by de Casteljau): a node there
export function splitSegment(segs: Seg[], i: number, t = 0.5): Seg[] {
  const s = segs[i];
  if (!s || (s.c !== 'L' && s.c !== 'C')) return segs;
  const p0 = startOf(segs, i);
  const lerp = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const out = cp(segs);
  if (s.c === 'L') {
    out.splice(i, 0, { c: 'L', p: lerp(p0, [s.p[0], s.p[1]]).map(r4) });
    return out;
  }
  const [p1, p2, p3]: Pt[] = [
    [s.p[0], s.p[1]],
    [s.p[2], s.p[3]],
    [s.p[4], s.p[5]],
  ];
  const [a, b, c] = [lerp(p0, p1), lerp(p1, p2), lerp(p2, p3)];
  const [d, e] = [lerp(a, b), lerp(b, c)];
  const f = lerp(d, e);
  out.splice(i, 1, { c: 'C', p: [...a, ...d, ...f].map(r4) }, { c: 'C', p: [...e, ...c, ...p3].map(r4) });
  return out;
}
// the longest piece (a line or a curve) of the path: its number
export function longestSegment(segs: Seg[]): number {
  let best = -1;
  let len = -1;
  segs.forEach((s, i) => {
    if (s.c !== 'L' && s.c !== 'C') return;
    const one = pathPolylines([{ c: 'M', p: startOf(segs, i) }, s], 12)[0];
    let l = 0;
    for (let k = 1; k < one.length; k++) l += Math.hypot(one[k][0] - one[k - 1][0], one[k][1] - one[k - 1][1]);
    if (l > len) [best, len] = [i, l];
  });
  return best;
}
// two open paths made one: the nearest ends joined (each taken the other way round if that brings them nearer) — at the
// same point (within tol) one node, else a straight piece between them
export function joinPaths(a: Seg[], b: Seg[], tol = 1e-6): Seg[] {
  const open = (s: Seg[]) => s.filter((q) => q.c !== 'Z');
  const A0 = open(a);
  const B0 = open(b);
  if (!A0.length || !B0.length) return a;
  const first = (s: Seg[]): Pt => [s[0].p[0], s[0].p[1]];
  const last = (s: Seg[]): Pt => endOf(s[s.length - 1]);
  const d = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const options: [Seg[], Seg[]][] = [
    [A0, B0],
    [A0, reversePath(B0)],
    [reversePath(A0), B0],
    [reversePath(A0), reversePath(B0)],
  ];
  const [A, B] = options.reduce((best, o) => (d(last(o[0]), first(o[1])) < d(last(best[0]), first(best[1])) ? o : best));
  const gap = d(last(A), first(B));
  return [...cp(A), ...(gap > tol ? [{ c: 'L' as const, p: first(B).map(r4) }] : []), ...cp(B).slice(1)];
}
// a path broken at node i (the end of segment i): a closed one opened there (that node its two ends), an open one cut
// in two (none at its ends)
export function breakAt(segs: Seg[], i: number): Seg[][] {
  const { a, b, closed } = subRange(segs, i);
  const before = segs.slice(0, a);
  const after = segs.slice(b);
  const body = cp(segs.slice(a + 1, closed ? b - 1 : b));
  const start: Pt = [segs[a].p[0], segs[a].p[1]];
  if (closed) {
    // the closing line made a piece of its own (unless it ends on its start already)
    const lastEnd = body.length ? endOf(body[body.length - 1]) : start;
    if (Math.hypot(lastEnd[0] - start[0], lastEnd[1] - start[1]) > 1e-9) body.push({ c: 'L', p: start });
    const k = i - a; // the node: 0 its start, else the end of body[k − 1]
    const at: Pt = k === 0 ? start : endOf(body[k - 1]);
    const opened: Seg[] = [{ c: 'M', p: at }, ...body.slice(k), ...body.slice(0, k)];
    return [[...before, ...opened, ...after]];
  }
  const k = i - a;
  if (k <= 0 || k >= body.length) return [segs];
  const at = endOf(body[k - 1]);
  return [
    [...before, { c: 'M', p: start }, ...body.slice(0, k)],
    [{ c: 'M', p: at }, ...body.slice(k), ...after],
  ];
}
