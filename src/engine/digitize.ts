// Digitizer: the values read off the image of a graph. The image's pixels (u to
// the right, v down) are mapped to the data by a calibration:
// - axes: two points on the X axis and two on the Y axis with their values — an affine map: the axes may be rotated,
//   not perpendicular, of different scales;
// - corners: the four corners of the frame with their values — a projective map (a page photographed at an angle);
// - grid: six points or more anywhere with their X and Y (ticks, grid crossings) — a polynomial of degree 2 or 3, or a
//   thin-plate spline through them (a curved page, a lens);
// each axis linear or logarithmic. The points of every set (clicked, or found by their colour in an area: a curve, or
// markers) give a dataset: X, Y and ±Y (from the error bars clicked) for every set. Pure: also used by the scripts.
import { solve } from './lm.ts';
import { column, unitOf, type Column, type Dataset } from './table.ts';
import { maxOf, minOf } from './minmax.ts';

export type Px = { u: number; v: number };
export type AxisPt = Px & { val: number };
export type GridPt = Px & { x: number; y: number };
// a point of a set, with the ends of its error bar where clicked (hi: the upper one, lo: the lower one: their Y read)
export type DigiPoint = Px & { hi?: Px; lo?: Px };
export type DigiSet = { name: string; color: string; points: DigiPoint[] };
export type CalMode = 'axes' | 'corners' | 'grid';
export type GridFit = 'poly2' | 'poly3' | 'tps';
export type AutoSpec = {
  mode: 'line' | 'markers';
  color: [number, number, number] | null; // the colour looked for (the pipette)
  tol: number; // % of the largest colour distance
  step: number; // line: one point every `step` pixels across
  minSize: number; // markers: the smallest and largest blob (pixels)
  maxSize: number;
  area: Px[]; // the polygon searched (empty: the whole image)
  exclude: Px[][]; // polygons left out (text, the legend)
};
export type DigitizerData = {
  image: string; // the image (a data URL), kept in the project
  imageName: string;
  w: number;
  h: number;
  cal: CalMode;
  axes: (AxisPt | null)[]; // X1, X2, Y1, Y2
  corners: (Px | null)[]; // bottom left, bottom right, top right, top left
  xRange: [number, number]; // corners: X at the left and right edges, Y at the bottom and the top
  yRange: [number, number];
  grid: GridPt[];
  gridFit: GridFit;
  logX: boolean;
  logY: boolean;
  xName: string;
  yName: string;
  sets: DigiSet[];
  active: number;
  order: 'x' | 'click';
  auto: AutoSpec;
  loupe?: boolean; // the magnifier beside the cursor (default shown)
  mark?: { size: number; width: number }; // the + of a point: arm length (screen px), line width (default 9, 1.5)
};
export const SET_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324'];

export type Calibration = { toData: (p: Px) => { x: number; y: number }; resid?: { dx: number; dy: number }[]; note: string };

const lg = (v: number, log: boolean) => (log ? Math.log10(v) : v);
const ex = (v: number, log: boolean) => (log ? 10 ** v : v);

// ---- the three calibrations ----
function axesCal(d: DigitizerData): Calibration | string {
  const [p1, p2, p3, p4] = d.axes;
  if (!p1 || !p2 || !p3 || !p4) return `Place ${['X₁', 'X₂', 'Y₁', 'Y₂'].filter((_, k) => !d.axes[k]).join(', ')} on the image (the buttons, then a click).`;
  // a point placed without its value: every point read would be empty
  const unvalued = ['X₁', 'X₂', 'Y₁', 'Y₂'].filter((_, k) => !Number.isFinite(d.axes[k]!.val));
  if (unvalued.length) return `Write the value of ${unvalued.join(', ')} (the number on the axis where ${unvalued.length > 1 ? 'they were' : 'it was'} placed).`;
  if ((d.logX && (p1.val <= 0 || p2.val <= 0)) || (d.logY && (p3.val <= 0 || p4.val <= 0))) return 'A logarithmic axis needs values above 0.';
  const [X1, X2, Y1, Y2] = [lg(p1.val, d.logX), lg(p2.val, d.logX), lg(p3.val, d.logY), lg(p4.val, d.logY)];
  if (X1 === X2 || Y1 === Y2) return 'X₁ and X₂ (and Y₁ and Y₂) need different values.';
  // pixels per unit along each axis
  const e = { u: (p2.u - p1.u) / (X2 - X1), v: (p2.v - p1.v) / (X2 - X1) };
  const f = { u: (p4.u - p3.u) / (Y2 - Y1), v: (p4.v - p3.v) / (Y2 - Y1) };
  const det = e.u * f.v - e.v * f.u;
  if (Math.abs(det) < 1e-12 * Math.hypot(e.u, e.v) * Math.hypot(f.u, f.v)) return 'The X and Y axes are parallel: place X₁, X₂ along X and Y₁, Y₂ along Y.';
  // p − q = a·e + b·f: a moves along X only, b along Y only
  const coef = (p: Px, q: Px) => {
    const [du, dv] = [p.u - q.u, p.v - q.v];
    return [(du * f.v - dv * f.u) / det, (e.u * dv - e.v * du) / det];
  };
  const angle = (Math.atan2(-(p2.v - p1.v), p2.u - p1.u) * 180) / Math.PI;
  const skew = 90 - Math.abs(((Math.atan2(-(p4.v - p3.v), p4.u - p3.u) - Math.atan2(-(p2.v - p1.v), p2.u - p1.u)) * 180) / Math.PI);
  return {
    toData: (p) => ({ x: ex(X1 + coef(p, p1)[0], d.logX), y: ex(Y1 + coef(p, p3)[1], d.logY) }),
    note: `X axis turned ${Math.abs(angle) < 0.05 ? '0' : angle.toFixed(2)}°, the axes ${Math.abs(skew) < 0.05 ? 'perpendicular' : `${skew.toFixed(2)}° from perpendicular`}.`,
  };
}

// the projective map of four points onto four (h33 = 1)
function homography(src: Px[], dst: { x: number; y: number }[]): ((p: Px) => { x: number; y: number }) | null {
  const A: number[][] = [];
  const b: number[] = [];
  src.forEach((s, i) => {
    const { x, y } = dst[i];
    A.push([s.u, s.v, 1, 0, 0, 0, -x * s.u, -x * s.v]);
    b.push(x);
    A.push([0, 0, 0, s.u, s.v, 1, -y * s.u, -y * s.v]);
    b.push(y);
  });
  const h = solve(A, b);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  return (p) => {
    const w = h[6] * p.u + h[7] * p.v + 1;
    return { x: (h[0] * p.u + h[1] * p.v + h[2]) / w, y: (h[3] * p.u + h[4] * p.v + h[5]) / w };
  };
}
function cornersCal(d: DigitizerData): Calibration | string {
  if (d.corners.some((c) => !c)) return `Place the corners: ${['bottom left', 'bottom right', 'top right', 'top left'].filter((_, k) => !d.corners[k]).join(', ')}.`;
  const [x0, x1] = d.xRange;
  const [y0, y1] = d.yRange;
  if (![x0, x1, y0, y1].every(Number.isFinite) || x0 === x1 || y0 === y1) return 'Write the X at the left and right edges and the Y at the bottom and top of the frame.';
  if ((d.logX && (x0 <= 0 || x1 <= 0)) || (d.logY && (y0 <= 0 || y1 <= 0))) return 'A logarithmic axis needs values above 0.';
  const [a, b, c, e] = [lg(x0, d.logX), lg(x1, d.logX), lg(y0, d.logY), lg(y1, d.logY)];
  const H = homography(d.corners as Px[], [
    { x: a, y: c },
    { x: b, y: c },
    { x: b, y: e },
    { x: a, y: e },
  ]);
  if (!H) return 'The four corners do not make a frame (three on one line?).';
  return { toData: (p) => ((q) => ({ x: ex(q.x, d.logX), y: ex(q.y, d.logY) }))(H(p)), note: 'Perspective corrected from the four corners.' };
}

// the terms of a polynomial in (u, v) of degree 2 or 3
const terms = (u: number, v: number, deg: number) => (deg === 2 ? [1, u, v, u * u, u * v, v * v] : [1, u, v, u * u, u * v, v * v, u * u * u, u * u * v, u * v * v, v * v * v]);
function polyFit(pts: { u: number; v: number; z: number }[], deg: number): ((u: number, v: number) => number) | null {
  const m = terms(0, 0, deg).length;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const r = new Array<number>(m).fill(0);
  for (const p of pts) {
    const t = terms(p.u, p.v, deg);
    for (let i = 0; i < m; i++) {
      r[i] += t[i] * p.z;
      for (let j = 0; j < m; j++) A[i][j] += t[i] * t[j];
    }
  }
  const c = solve(A, r);
  return c && c.every(Number.isFinite) ? (u, v) => terms(u, v, deg).reduce((s, t, i) => s + t * c[i], 0) : null;
}
// a thin-plate spline through the points: z = a0 + a1·u + a2·v + Σ wᵢ·φ(|p − pᵢ|), φ(r) = r²·ln r
function tpsFit(pts: { u: number; v: number; z: number }[]): ((u: number, v: number) => number) | null {
  const n = pts.length;
  const phi = (r2: number) => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0);
  const A = Array.from({ length: n + 3 }, () => new Array<number>(n + 3).fill(0));
  const b = new Array<number>(n + 3).fill(0);
  pts.forEach((p, i) => {
    pts.forEach((q, j) => (A[i][j] = phi((p.u - q.u) ** 2 + (p.v - q.v) ** 2)));
    [A[i][n], A[i][n + 1], A[i][n + 2]] = [1, p.u, p.v];
    [A[n][i], A[n + 1][i], A[n + 2][i]] = [1, p.u, p.v];
    b[i] = p.z;
  });
  const c = solve(A, b);
  if (!c || !c.every(Number.isFinite)) return null;
  return (u, v) => c[n] + c[n + 1] * u + c[n + 2] * v + pts.reduce((s, p, i) => s + c[i] * phi((u - p.u) ** 2 + (v - p.v) ** 2), 0);
}
function gridCal(d: DigitizerData): Calibration | string {
  const pts = d.grid.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const need = d.gridFit === 'poly3' ? 10 : 6;
  if (pts.length < need) return `${need} points at least with their X and Y (${pts.length} now): ticks on the axes, crossings of the grid, the corners.`;
  if ((d.logX && pts.some((p) => p.x <= 0)) || (d.logY && pts.some((p) => p.y <= 0))) return 'A logarithmic axis needs values above 0.';
  // the pixels scaled to about −1 … 1 (a well conditioned system)
  const cu = (minOf(pts.map((p) => p.u)) + maxOf(pts.map((p) => p.u))) / 2;
  const cv = (minOf(pts.map((p) => p.v)) + maxOf(pts.map((p) => p.v))) / 2;
  const s = Math.max(1, maxOf(pts.map((p) => Math.max(Math.abs(p.u - cu), Math.abs(p.v - cv)))));
  const n = (p: Px) => ({ u: (p.u - cu) / s, v: (p.v - cv) / s });
  const fit = (ps: GridPt[]) => {
    const X = ps.map((p) => ({ ...n(p), z: lg(p.x, d.logX) }));
    const Y = ps.map((p) => ({ ...n(p), z: lg(p.y, d.logY) }));
    const [fx, fy] = d.gridFit === 'tps' ? [tpsFit(X), tpsFit(Y)] : [polyFit(X, d.gridFit === 'poly3' ? 3 : 2), polyFit(Y, d.gridFit === 'poly3' ? 3 : 2)];
    return fx && fy ? (p: Px) => ({ x: ex(fx(n(p).u, n(p).v), d.logX), y: ex(fy(n(p).u, n(p).v), d.logY) }) : null;
  };
  const f = fit(pts);
  if (!f) return 'The points do not fix a map (too many on one line?): add points spread over the graph.';
  // the error of every point: off the map (polynomial), or the map made without it (the spline passes through all)
  const spanX = Math.abs(lg(maxOf(pts.map((p) => p.x)), d.logX) - lg(minOf(pts.map((p) => p.x)), d.logX)) || 1;
  const spanY = Math.abs(lg(maxOf(pts.map((p) => p.y)), d.logY) - lg(minOf(pts.map((p) => p.y)), d.logY)) || 1;
  const resid = d.grid.map((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { dx: NaN, dy: NaN };
    const g = d.gridFit === 'tps' ? (pts.length > need ? fit(pts.filter((q) => q !== p)) : null) : f;
    if (!g) return { dx: NaN, dy: NaN };
    const q = g(p);
    return { dx: (100 * (lg(q.x, d.logX) - lg(p.x, d.logX))) / spanX, dy: (100 * (lg(q.y, d.logY) - lg(p.y, d.logY))) / spanY };
  });
  const worst = Math.max(0, maxOf(resid.flatMap((r) => [Math.abs(r.dx), Math.abs(r.dy)]).filter(Number.isFinite)));
  return { toData: f, resid, note: `${pts.length} points, ${d.gridFit === 'tps' ? 'thin-plate spline (errors: each point left out)' : `polynomial of degree ${d.gridFit === 'poly3' ? 3 : 2}`}; the largest error ${worst < 0.01 ? 'below 0.01' : worst.toPrecision(2)} % of the range.` };
}

export function calibrate(d: DigitizerData): Calibration | string {
  return d.cal === 'corners' ? cornersCal(d) : d.cal === 'grid' ? gridCal(d) : axesCal(d);
}

// ---- the dataset ----
export function digitized(d: DigitizerData): { dataset: Dataset; warnings: string[] } | string {
  if (!d.image) return 'Open an image of a graph (or paste one: Ctrl+V).';
  const cal = calibrate(d);
  if (typeof cal === 'string') return cal;
  const warnings: string[] = [];
  const sets = d.sets.filter((s) => s.points.length);
  if (!sets.length) return 'Add points to a set: click on the curve (Points), or find them by their colour (Auto).';
  const xName = d.xName.trim() || 'X';
  const yName = d.yName.trim() || 'Y';
  const unit = unitOf(yName);
  const columns: Column[] = [];
  for (const s of sets) {
    const pts = s.points.map((p) => {
      const q = cal.toData(p);
      const hi = p.hi ? cal.toData(p.hi).y : NaN;
      const lo = p.lo ? cal.toData(p.lo).y : NaN;
      const err = Number.isFinite(hi) && Number.isFinite(lo) ? Math.abs(hi - lo) / 2 : Number.isFinite(hi) ? Math.abs(hi - q.y) : Number.isFinite(lo) ? Math.abs(q.y - lo) : NaN;
      return { ...q, err };
    });
    if (d.order === 'x') pts.sort((a, b) => a.x - b.x);
    const one = sets.length === 1;
    columns.push({ ...column(one ? xName : `${xName} (${s.name})`, Float64Array.from(pts, (p) => p.x)), role: 'x' });
    columns.push({ ...column(one ? yName : unit ? `${s.name} (${unit})` : s.name, Float64Array.from(pts, (p) => p.y)), role: 'y' });
    if (pts.some((p) => Number.isFinite(p.err))) columns.push({ ...column(`±${one ? yName : s.name}`, Float64Array.from(pts, (p) => p.err)), role: 'yerr' });
  }
  return { dataset: { name: d.imageName.replace(/\.[^.]+$/, '') || 'digitized', columns }, warnings };
}

// ---- finding the points by their colour ----
// the pixels of every row inside the polygon (scanline: the spans between crossings of its edges)
function fillPolygon(poly: Px[], w: number, h: number, set: (row: number, a: number, b: number) => void) {
  if (poly.length < 3) return;
  const v0 = Math.max(0, Math.floor(minOf(poly.map((p) => p.v))));
  const v1 = Math.min(h - 1, Math.ceil(maxOf(poly.map((p) => p.v))));
  for (let r = v0; r <= v1; r++) {
    const y = r + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.v <= y !== b.v <= y) xs.push(a.u + ((y - a.v) / (b.v - a.v)) * (b.u - a.u));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) set(r, Math.max(0, Math.ceil(xs[k] - 0.5)), Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)));
  }
}
// the pixels of the colour (within tol % of the largest distance) inside the area, outside the excluded parts
export function colorMask(img: { data: ArrayLike<number>; w: number; h: number }, a: AutoSpec): Uint8Array {
  const { w, h, data } = img;
  const inside = new Uint8Array(w * h);
  if (a.area.length >= 3) fillPolygon(a.area, w, h, (r, p, q) => inside.fill(1, r * w + p, r * w + q + 1));
  else inside.fill(1);
  for (const ex of a.exclude) fillPolygon(ex, w, h, (r, p, q) => inside.fill(0, r * w + p, r * w + q + 1));
  const mask = new Uint8Array(w * h);
  if (!a.color) return mask;
  const [R, G, B] = a.color;
  const lim = ((Math.max(0, Math.min(100, a.tol)) / 100) * 441.7) ** 2;
  for (let i = 0; i < w * h; i++) {
    if (!inside[i]) continue;
    const o = 4 * i;
    if ((data[o + 3] ?? 255) < 30) continue;
    if ((data[o] - R) ** 2 + (data[o + 1] - G) ** 2 + (data[o + 2] - B) ** 2 <= lim) mask[i] = 1;
  }
  return mask;
}
// A curve: one point every `step` pixels across — the middle of the run of pixels nearest the last point (two curves
// of one colour crossing: it follows the one it was on); markers: the centre of every blob of the size given.
export function autoPoints(img: { data: ArrayLike<number>; w: number; h: number }, a: AutoSpec): Px[] {
  const { w, h } = img;
  const mask = colorMask(img, a);
  const out: Px[] = [];
  if (a.mode === 'line') {
    const st = Math.max(1, Math.floor(a.step) || 1);
    let last: number | null = null;
    for (let u0 = 0; u0 < w; u0 += st) {
      const rows: { v: number; u: number }[] = [];
      for (let v = 0; v < h; v++) for (let u = u0; u < Math.min(w, u0 + st); u++) if (mask[v * w + u]) rows.push({ v, u });
      if (!rows.length) continue;
      rows.sort((p, q) => p.v - q.v);
      // runs: pixels less than 3 apart
      const runs: (typeof rows)[] = [];
      for (const p of rows) {
        const r = runs[runs.length - 1];
        if (r && p.v - r[r.length - 1].v <= 2) r.push(p);
        else runs.push([p]);
      }
      const mid = (r: typeof rows) => r.reduce((s, p) => s + p.v, 0) / r.length;
      const run = last === null ? runs.reduce((b, r) => (r.length > b.length ? r : b)) : runs.reduce((b, r) => (Math.abs(mid(r) - last!) < Math.abs(mid(b) - last!) ? r : b));
      const v = mid(run);
      last = v;
      out.push({ u: run.reduce((s, p) => s + p.u, 0) / run.length + 0.5, v: v + 0.5 });
    }
    return out;
  }
  // markers: the blobs (8 neighbours), their centres
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    seen[i] = 1;
    stack.push(i);
    let [n, su, sv] = [0, 0, 0];
    while (stack.length) {
      const k = stack.pop()!;
      const [u, v] = [k % w, Math.floor(k / w)];
      n++;
      su += u;
      sv += v;
      for (let dv = -1; dv <= 1; dv++)
        for (let du = -1; du <= 1; du++) {
          const [uu, vv] = [u + du, v + dv];
          if (uu < 0 || vv < 0 || uu >= w || vv >= h) continue;
          const j = vv * w + uu;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    if (n >= a.minSize && n <= a.maxSize) out.push({ u: su / n + 0.5, v: sv / n + 0.5 });
  }
  return out.sort((p, q) => p.u - q.u);
}
// a polygon contains a point (even–odd rule)
export function inPolygon(poly: Px[], p: Px): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.v > p.v !== b.v > p.v && p.u < ((b.u - a.u) * (p.v - a.v)) / (b.v - a.v) + a.u) c = !c;
  }
  return c;
}
