// Contour and heatmap (colour maps, filled levels, contour lines, images): Z over X and Y. The data: X, Y, Z columns — on a grid (found) or scattered (linear interpolation
// on their Delaunay triangles to a regular grid) —, or a matrix: a Y column and Z columns whose names
// give X (“400 nm”, “410” …). Drawn as a heatmap (the cells coloured by a map, sharp or smooth), filled levels, contour
// lines (marching squares: the crossings linear along the cells' edges) with their values, or a
// heatmap / filled levels with the lines over them. Levels: automatic (nice values, about N), a number, a step, or a
// list; a log Z. Values hidden (a threshold, values written, outside the colour range). Profiles: Z along a row (at a Y)
// and a column (at an X). Pure.
import { column, type Column, type Dataset } from './table.ts';
import { hiddenBy, type HideSpec } from './hide.ts';
import { niceStep } from '../figure/ticks.ts';
import { curveStyle, type ColorMapName, type Curve, type Dash } from '../figure/spec.ts';
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { maxOf, minOf } from './minmax.ts';

export type ContourSpec = {
  layout: 'xyz' | 'matrix';
  x: string; // xyz: the columns ('' = the designated X, Y and the next Y as Z)
  y: string;
  z: string;
  yCol: string; // matrix: the Y column ('' = the designated X, else the first)
  zs: string; // matrix: the Z columns ('' = all the others with numbers)
  xTitle?: string; // matrix: X's name ('' = from the Z columns' names: the unit after their number)
  grid: number; // scattered points: a regular grid of this many points per side
  // the map's Z (X, Y columns): a Z column; the points counted in bins² squares (a 2D histogram); their density (a
  // Gaussian kernel, its width × bandScale); the speed of the vectors; or no map (the vectors, the points alone)
  zFrom?: 'column' | 'count' | 'density' | 'speed' | 'none';
  bins?: number;
  bandScale?: number;
  // the points themselves drawn over the map (small dots)
  showPoints?: boolean;
  // the vector field: U, V columns (the vector at every X, Y — a grid, or scattered points interpolated to one), drawn as
  // arrows on every vecEvery-th point (the longest vecLength cells long) or as streamlines (vecDensity: how close they
  // run), their colour and width
  u?: string;
  v?: string;
  vectors?: 'none' | 'arrows' | 'stream';
  vecEvery?: number;
  vecLength?: number;
  vecDensity?: number;
  vecColor?: string;
  vecWidth?: number;
  draw: 'heat' | 'filled' | 'lines' | 'heatLines' | 'filledLines';
  smooth: boolean; // a heatmap smooth (bilinear) instead of sharp cells
  levels: 'auto' | 'count' | 'step' | 'list';
  nLevels: number;
  step: number;
  list: string;
  zMin: number; // NaN: the data's
  zMax: number;
  log: boolean;
  cmap: ColorMapName;
  cmapColors: string[];
  reverse: boolean;
  lineColor: string; // '' = by the map (lines alone) or black (over a map)
  lineWidth: number;
  lineLabels: boolean;
  labelDecimals: number; // NaN: automatic
  nanColor: string; // '' = not drawn
  // values left out of the map (drawn as missing): a threshold, values written, outside the colour range
  hide?: HideSpec;
  colorbar: boolean;
  zTitle: string; // '' = the Z column's name
  // the profiles of projects before the list (one row, one column): read as `profileList` when it is absent
  profileX: number; // NaN: none — a column cut at this X
  profileY: number; // a row cut at this Y
  // the profiles marked on the map (off: only the outputs), their lines' colours (row, column), dash and width
  profileShow?: boolean;
  profileColor?: string;
  profileColor2?: string;
  profileDash?: Dash;
  profileWidth?: number;
  // the profiles: as many as wanted, each a row (Z along X at a Y) or a column (Z along Y at an X), with its line
  profileList?: ContourProfile[];
  // the contour lines: their dash, the levels below 0 dashed, their values' size and colour ('' = the
  // line's), written on every N-th level
  lineDash?: Dash;
  negDash?: boolean;
  labelSize?: number;
  labelColor?: string;
  labelEvery?: number;
  // drawn with all the cells, or fast: the grid averaged into at most fastCells cells a side (the outputs keep all)
  render?: 'all' | 'fast';
  fastCells?: number;
};

// a grid: X (nx) and Y (ny) increasing, Z row by row (z[j·nx + i] at xs[i], ys[j]), NaN where nothing is known
export type Grid = { xs: number[]; ys: number[]; z: Float64Array };

// ---- the grid from the data ----
// X, Y, Z: a grid when every X with every Y is there once (in any order); else null
export function asGrid(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>): Grid | null {
  const n = Math.min(x.length, y.length, z.length);
  const ux = [...new Set(Array.from({ length: n }, (_, i) => x[i]).filter(Number.isFinite))].sort((a, b) => a - b);
  const uy = [...new Set(Array.from({ length: n }, (_, i) => y[i]).filter(Number.isFinite))].sort((a, b) => a - b);
  if (ux.length < 2 || uy.length < 2 || ux.length * uy.length > n * 1.0001 + 1) return null;
  const ix = new Map(ux.map((v, i) => [v, i]));
  const iy = new Map(uy.map((v, j) => [v, j]));
  const g = new Float64Array(ux.length * uy.length).fill(NaN);
  let filled = 0;
  for (let k = 0; k < n; k++) {
    const [i, j] = [ix.get(x[k]), iy.get(y[k])];
    if (i === undefined || j === undefined) continue;
    if (Number.isNaN(g[j * ux.length + i])) filled++;
    g[j * ux.length + i] = z[k];
  }
  return filled >= 0.9 * ux.length * uy.length ? { xs: ux, ys: uy, z: g } : null;
}

// Delaunay triangles of points (Bowyer–Watson): index triples
export function delaunay(px: number[], py: number[]): [number, number, number][] {
  const n = px.length;
  const [x0, x1, y0, y1] = [minOf(px), maxOf(px), minOf(py), maxOf(py)];
  const d = Math.max(x1 - x0, y1 - y0) || 1;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  // a super triangle around everything
  const X = [...px, mx - 20 * d, mx, mx + 20 * d];
  const Y = [...py, my - d, my + 20 * d, my - d];
  type T = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const make = (a: number, b: number, c: number): T => {
    const [ax, ay, bx, by, cx, cy] = [X[a], Y[a], X[b], Y[b], X[c], Y[c]];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
    return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris: T[] = [make(n, n + 1, n + 2)];
  // the points in a shuffled-free order sorted along X (fewer triangles to check), each inserted
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => px[i] - px[j]);
  for (const p of order) {
    const bad: T[] = [];
    const keep: T[] = [];
    for (const t of tris) ((X[p] - t.cx) ** 2 + (Y[p] - t.cy) ** 2 <= t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    // the boundary of the hole: the edges of the bad triangles not shared by two of them
    const edges = new Map<string, [number, number]>();
    for (const t of bad)
      for (const [u, v] of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [u, v]);
      }
    for (const [u, v] of edges.values()) keep.push(make(u, v, p));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

// scattered points to a regular grid: Z linear on the triangle each grid point is in (NaN outside them)
export function gridFromScatter(px: number[], py: number[], pz: number[], size: number): Grid {
  const nx = Math.max(2, Math.floor(size));
  const [x0, x1, y0, y1] = [minOf(px), maxOf(px), minOf(py), maxOf(py)];
  const xs = Array.from({ length: nx }, (_, i) => x0 + ((x1 - x0) * i) / (nx - 1));
  const ys = Array.from({ length: nx }, (_, j) => y0 + ((y1 - y0) * j) / (nx - 1));
  const z = new Float64Array(nx * nx).fill(NaN);
  for (const [a, b, c] of delaunay(px, py)) {
    const [ax, ay, bx, by, cx, cy] = [px[a], py[a], px[b], py[b], px[c], py[c]];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!det) continue;
    const i0 = Math.max(0, Math.ceil(((Math.min(ax, bx, cx) - x0) / (x1 - x0 || 1)) * (nx - 1) - 1e-9));
    const i1 = Math.min(nx - 1, Math.floor(((Math.max(ax, bx, cx) - x0) / (x1 - x0 || 1)) * (nx - 1) + 1e-9));
    const j0 = Math.max(0, Math.ceil(((Math.min(ay, by, cy) - y0) / (y1 - y0 || 1)) * (nx - 1) - 1e-9));
    const j1 = Math.min(nx - 1, Math.floor(((Math.max(ay, by, cy) - y0) / (y1 - y0 || 1)) * (nx - 1) + 1e-9));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const [x, y] = [xs[i], ys[j]];
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
        const l3 = 1 - l1 - l2;
        const e = -1e-10;
        if (l1 >= e && l2 >= e && l3 >= e) z[j * nx + i] = l1 * pz[a] + l2 * pz[b] + l3 * pz[c];
      }
  }
  return { xs, ys, z };
}

// ---- levels ----
export function contourLevels(lo: number, hi: number, d: Pick<ContourSpec, 'levels' | 'nLevels' | 'step' | 'list' | 'log'>): number[] {
  if (d.levels === 'list') return d.list.split(/[,;\s]+/).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!(hi > lo)) return [lo];
  if (d.log && lo > 0) {
    // decades (and 2, 5 within them when few)
    const out: number[] = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of hi / lo <= 1e3 * (1 + 1e-9) ? [1, 2, 5] : [1]) out.push(+(m * 10 ** e).toPrecision(12));
    return out.filter((v) => v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9));
  }
  if (d.levels === 'count') {
    const n = Math.max(2, Math.floor(d.nLevels) || 10);
    return Array.from({ length: n }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / n);
  }
  const step = d.levels === 'step' && d.step > 0 && (hi - lo) / d.step <= 500 ? d.step : niceStep(hi - lo, Math.max(2, Math.floor(d.nLevels) || 8));
  const out: number[] = [];
  // every multiple of the step in the range (each computed from its index: no sums drifting)
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(k === 0 ? 0 : +(k * step).toPrecision(12));
  return out;
}

// ---- contour lines: marching squares ----
// the lines of Z = level: the crossings linear along the cells' edges, joined into polylines
export function contourLines(g: Grid, level: number): { x: number[]; y: number[] }[] {
  const { xs, ys, z } = g;
  const nx = xs.length;
  const ny = ys.length;
  const at = (i: number, j: number) => z[j * nx + i];
  // every crossing lies on an edge of the grid, numbered: across (i, j)–(i + 1, j) as j·nx + i, up (i, j)–(i, j + 1) as
  // nx·ny + j·nx + i; a segment joins two edges, and segments meet where they share an edge
  const across = (i: number, j: number) => j * nx + i;
  const up = (i: number, j: number) => nx * ny + j * nx + i;
  const point = (id: number): [number, number] => {
    const vert = id >= nx * ny;
    const k = vert ? id - nx * ny : id;
    const [i, j] = [k % nx, Math.floor(k / nx)];
    const [i1, j1] = vert ? [i, j + 1] : [i + 1, j];
    const [a, b] = [at(i, j), at(i1, j1)];
    const t = (level - a) / (b - a);
    return [xs[i] + t * (xs[i1] - xs[i]), ys[j] + t * (ys[j1] - ys[j])];
  };
  const segA: number[] = [];
  const segB: number[] = [];
  const seg = (p: number, q: number) => {
    segA.push(p);
    segB.push(q);
  };
  for (let j = 0; j + 1 < ny; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const v0 = at(i, j);
      const v1 = at(i + 1, j);
      const v2 = at(i + 1, j + 1);
      const v3 = at(i, j + 1);
      if (!(Number.isFinite(v0) && Number.isFinite(v1) && Number.isFinite(v2) && Number.isFinite(v3))) continue;
      const code = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const [B, R, T, L] = [across(i, j), up(i + 1, j), across(i, j + 1), up(i, j)];
      const centre = (v0 + v1 + v2 + v3) / 4 > level;
      switch (code) {
        case 1:
        case 14:
          seg(L, B);
          break;
        case 2:
        case 13:
          seg(B, R);
          break;
        case 3:
        case 12:
          seg(L, R);
          break;
        case 4:
        case 11:
          seg(R, T);
          break;
        case 6:
        case 9:
          seg(B, T);
          break;
        case 7:
        case 8:
          seg(L, T);
          break;
        case 5:
          // a saddle: the centre decides which corners join
          if (centre) {
            seg(L, T);
            seg(B, R);
          } else {
            seg(L, B);
            seg(R, T);
          }
          break;
        case 10:
          if (centre) {
            seg(L, B);
            seg(R, T);
          } else {
            seg(L, T);
            seg(B, R);
          }
          break;
      }
    }
  // the segments of every edge (two at most), then joined end to end
  const ends = new Map<number, number[]>();
  for (let k = 0; k < segA.length; k++)
    for (const e of [segA[k], segB[k]]) {
      const l = ends.get(e);
      if (l) l.push(k);
      else ends.set(e, [k]);
    }
  const used = new Uint8Array(segA.length);
  const lines: { x: number[]; y: number[] }[] = [];
  for (let k = 0; k < segA.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const ids = [segA[k], segB[k]];
    for (const front of [false, true]) {
      for (;;) {
        const end = front ? ids[0] : ids[ids.length - 1];
        const next = (ends.get(end) ?? []).find((q) => !used[q]);
        if (next === undefined) break;
        used[next] = 1;
        const far = segA[next] === end ? segB[next] : segA[next];
        if (front) ids.unshift(far);
        else ids.push(far);
      }
    }
    const pts = ids.map(point);
    lines.push({ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) });
  }
  return lines;
}

// a grid averaged into at most `cells` cells a side, evenly spaced over the whole range (so it stays one picture): every
// new cell takes the mean of the points whose places fall in it
export function coarsen(g: Grid, cells: number): Grid {
  const [nx, ny] = [g.xs.length, g.ys.length];
  const [mx, my] = [Math.min(nx, cells), Math.min(ny, cells)];
  if (mx === nx && my === ny) return g;
  // the cells' edges of an axis (halfway between the points, half a step past the ends), the new cell of every point
  const plan = (v: number[], m: number) => {
    const e0 = v[0] - (v[1] - v[0]) / 2;
    const e1 = v[v.length - 1] + (v[v.length - 1] - v[v.length - 2]) / 2;
    const of = Int32Array.from(v, (q) => Math.min(m - 1, Math.max(0, Math.floor(((q - e0) / (e1 - e0)) * m))));
    const centres = Array.from({ length: m }, (_, k) => e0 + ((e1 - e0) * (k + 0.5)) / m);
    return { of, centres };
  };
  const px = plan(g.xs, mx);
  const py = plan(g.ys, my);
  const sum = new Float64Array(mx * my);
  const cnt = new Float64Array(mx * my);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const v = g.z[j * nx + i];
      if (!Number.isFinite(v)) continue;
      const c = py.of[j] * mx + px.of[i];
      sum[c] += v;
      cnt[c]++;
    }
  return { xs: px.centres, ys: py.centres, z: Float64Array.from(sum, (s, c) => (cnt[c] ? s / cnt[c] : NaN)) };
}

// A profile: Z along a row (at the Y nearest `at`) or a column (at the X nearest `at`); its line on the map when shown
export type ContourProfile = { id: string; along: 'row' | 'column'; at: number; show: boolean; color: string; dash: Dash; width: number };
export function profileList(d: Pick<ContourSpec, 'profileList' | 'profileX' | 'profileY' | 'profileShow' | 'profileColor' | 'profileColor2' | 'profileDash' | 'profileWidth'>): ContourProfile[] {
  if (d.profileList) return d.profileList;
  const line = { show: !!d.profileShow, dash: d.profileDash ?? 'dash', width: d.profileWidth ?? 1 };
  return [
    ...(Number.isFinite(d.profileY) ? [{ id: 'row', along: 'row' as const, at: d.profileY, color: d.profileColor || '#ffffff', ...line }] : []),
    ...(Number.isFinite(d.profileX) ? [{ id: 'column', along: 'column' as const, at: d.profileX, color: d.profileColor2 || d.profileColor || '#ffffff', ...line }] : []),
  ];
}

// Z along a row (the nearest Y) and a column (the nearest X)
export function profiles(g: Grid, atX: number, atY: number) {
  const nearest = (v: number[], t: number) => v.reduce((b, q, k) => (Math.abs(q - t) < Math.abs(v[b] - t) ? k : b), 0);
  const nx = g.xs.length;
  const row = Number.isFinite(atY) ? nearest(g.ys, atY) : -1;
  const col = Number.isFinite(atX) ? nearest(g.xs, atX) : -1;
  return {
    row: row >= 0 ? { y: g.ys[row], x: g.xs, z: g.xs.map((_, i) => g.z[row * nx + i]) } : null,
    col: col >= 0 ? { x: g.xs[col], y: g.ys, z: g.ys.map((_, j) => g.z[j * nx + col]) } : null,
  };
}

// rowProfile: X and a Z column per row profile; colProfile: Y and a Z column per column profile
export type ContourResult = { curves: Curve[]; grid: Grid; levels: number[]; range: [number, number]; gridSet: Dataset; rowProfile?: Dataset; colProfile?: Dataset; warnings: string[] };

const fmtLevel = (v: number, dec: number) => (Number.isFinite(dec) ? v.toFixed(Math.max(0, Math.min(8, dec))) : String(+v.toPrecision(4))).replace('-', '−');

// the cells' edges: halfway between the points, half a step past the ends (a single point: ± 0.5)
export function cellEdges(v: number[]): number[] {
  if (v.length === 1) return [v[0] - 0.5, v[0] + 0.5];
  return [v[0] - (v[1] - v[0]) / 2, ...v.slice(1).map((q, k) => (q + v[k]) / 2), v[v.length - 1] + (v[v.length - 1] - v[v.length - 2]) / 2];
}

// opts.edges: the map's extent (the axes' limits) out to the cells' edges, not their centres (a matrix)
export function contourPlot(g: Grid, d: ContourSpec, names: { x: string; y: string; z: string }, opts?: { edges?: boolean }): ContourResult | string {
  const warnings: string[] = [];
  // the values hidden (below / above a threshold, equal to values written) left out of the map, its range and its lines,
  // drawn as missing (the NaN colour, else nothing); the outputs keep them
  const hid = hiddenBy(d.hide);
  let gm = hid ? { ...g, z: Float64Array.from(g.z, (v) => (hid(v) ? NaN : v)) } : g;
  const fin = Array.from(gm.z).filter((v) => Number.isFinite(v) && (!d.log || v > 0));
  if (!fin.length) return hid && Array.from(g.z).some(Number.isFinite) ? 'Every value is hidden (Hide values).' : 'No Z values on the grid.';
  if (d.log && fin.length < Array.from(gm.z).filter(Number.isFinite).length) warnings.push('Log Z: values ≤ 0 are left out.');
  let lo = Number.isFinite(d.zMin) ? d.zMin : minOf(fin);
  let hi = Number.isFinite(d.zMax) ? d.zMax : maxOf(fin);
  if (!(hi > lo)) [lo, hi] = [lo - 0.5, hi + 0.5];
  // outside the colour range: hidden too (else in the map's end colours)
  const out = d.hide?.outside === 'hide';
  if (out) gm = { ...gm, z: Float64Array.from(gm.z, (v) => (v < lo || v > hi ? NaN : v)) };
  // the map: only the values written left out of its grid, the thresholds and the range a cut tested when drawn (so the
  // edge of what is hidden follows the threshold between the cells of a smooth map, not the cells)
  const eq = hiddenBy({ values: d.hide?.values });
  const gEq = eq ? { ...g, z: Float64Array.from(g.z, (v) => (eq(v) ? NaN : v)) } : g;
  const below = d.hide?.below ?? NaN;
  const above = d.hide?.above ?? NaN;
  const cutLo = Math.max(Number.isFinite(below) ? below : -Infinity, out ? lo : -Infinity);
  const cutHi = Math.min(Number.isFinite(above) ? above : Infinity, out ? hi : Infinity);
  const drawCut: [number, number] | undefined = cutLo > -Infinity || cutHi < Infinity ? [cutLo, cutHi] : undefined;
  const levels = contourLevels(lo, hi, d);
  const zName = d.zTitle || names.z;
  const curves: Curve[] = [];
  const map = d.draw !== 'lines';
  // what is drawn: all the cells, or (fast) the grid averaged into at most fastCells a side (the map's, the lines')
  const fast = (q: Grid) => (d.render === 'fast' ? coarsen(q, Math.max(20, Math.floor(d.fastCells ?? 300))) : q);
  const dg = fast(gm);
  const mg = gEq === gm ? dg : fast(gEq);
  if (dg !== gm) warnings.push(`Fast: drawn on ${dg.xs.length} × ${dg.ys.length} cells (the data have ${g.xs.length} × ${g.ys.length}; the outputs keep them all).`);
  // the map: a heatmap or filled levels, coloured over [lo, hi] (filled: between the levels)
  const style = curveStyle({ color: '#000000', colorBy: 'y', cmap: d.cmap, cmapColors: d.cmapColors, cmapReverse: d.reverse, cmapLog: d.log, cmapMin: lo, cmapMax: hi });
  const span = (v: number[]) => (opts?.edges ? [cellEdges(v)[0], cellEdges(v)[v.length]] : [v[0], v[v.length - 1]]);
  const box = { name: zName, x: column(names.x, Float64Array.from(span(g.xs))), y: column(names.y, Float64Array.from(span(g.ys))) };
  if (map)
    curves.push({
      key: 'map',
      label: zName,
      noLegend: true,
      series: box,
      style,
      colorRange: [lo, hi],
      grid: { xs: mg.xs, ys: mg.ys, z: mg.z, mode: d.draw === 'filled' || d.draw === 'filledLines' ? 'filled' : 'heat', smooth: d.smooth, levels, range: [lo, hi], nan: d.nanColor, ...(drawCut ? { cut: drawCut } : {}) },
    });
  // the lines: one curve a level (its pieces apart), coloured by the map when alone, else as chosen (black)
  if (d.draw === 'lines' || d.draw === 'heatLines' || d.draw === 'filledLines') {
    const stops = stopsOf(d.cmap, d.cmapColors);
    levels.forEach((L, k) => {
      const pieces = contourLines(dg, L);
      if (!pieces.length) return;
      const xs = pieces.flatMap((p, q) => (q ? [NaN, ...p.x] : p.x));
      const ys = pieces.flatMap((p, q) => (q ? [NaN, ...p.y] : p.y));
      const color = d.lineColor || (map ? '#000000' : mapColor(stops, mapT(L, lo, hi, d.log, d.reverse)));
      // the value written on its longest piece, the levels' places staggered along it (they do not stack up)
      const longest = pieces.reduce((b, p) => (p.x.length > b.x.length ? p : b), pieces[0]);
      const frac = 0.25 + (0.5 * (k % 5)) / 4;
      const mid = pieces.slice(0, pieces.indexOf(longest)).reduce((s, p) => s + p.x.length + 1, 0) + Math.floor((longest.x.length - 1) * frac);
      const every = Math.max(1, Math.floor(d.labelEvery ?? 1));
      const labelled = d.lineLabels && k % every === 0;
      const text = xs.map((_, i) => (labelled && i === mid ? fmtLevel(L, d.labelDecimals) : ''));
      const dash: Dash = d.negDash && L < 0 ? 'dash' : (d.lineDash ?? 'solid');
      curves.push({
        key: `level:${k}`,
        label: fmtLevel(L, d.labelDecimals),
        noLegend: true,
        series: { name: zName, x: column(names.x, Float64Array.from(xs)), y: column(names.y, Float64Array.from(ys)) },
        style: curveStyle({ mode: 'line', color, lineWidth: d.lineWidth, dash, ...(labelled ? { labels: 'column' as const, labelPos: 'above' as const, labelText: { color: d.labelColor || color, ...(d.labelSize && d.labelSize > 0 ? { size: d.labelSize } : {}) } } : {}) }),
        ...(labelled ? { labelValues: column('level', Float64Array.from(xs, () => NaN), text) } : {}),
      });
    });
  }
  // the profiles: marked on the map, and as datasets
  const list = profileList(d).filter((p) => Number.isFinite(p.at));
  const cut = list.map((p) => {
    const q = p.along === 'row' ? profiles(g, NaN, p.at).row! : profiles(g, p.at, NaN).col!;
    return { p, at: p.along === 'row' ? (q as { y: number }).y : (q as { x: number }).x, z: q.z };
  });
  const [x0, x1, y0, y1] = [g.xs[0], g.xs[g.xs.length - 1], g.ys[0], g.ys[g.ys.length - 1]];
  cut.forEach(({ p, at }) => {
    if (!p.show) return;
    const [x, y] = p.along === 'row' ? [[x0, x1], [at, at]] : [[at, at], [y0, y1]];
    const key = `profile ${p.id}`;
    curves.push({ key, label: key, noLegend: true, series: { name: key, x: column(names.x, Float64Array.from(x)), y: column(names.y, Float64Array.from(y)) }, style: curveStyle({ mode: 'line', color: p.color || '#ffffff', lineWidth: p.width > 0 ? p.width : 1, dash: p.dash }) });
  });
  const ds = (name: string, cols: [string, number[], Column['role']][]): Dataset => ({ name, columns: cols.map(([n, v, role]) => ({ ...column(n, Float64Array.from(v)), role })) });
  // a dataset of the rows (X, a Z column each) and one of the columns (Y, a Z column each); one profile: its Z
  // column named Z, as before the list
  const profileSet = (along: 'row' | 'column') => {
    const cs = cut.filter((c) => c.p.along === along);
    if (!cs.length) return null;
    const [axis, other] = along === 'row' ? [names.y, names.x] : [names.x, names.y];
    const title = (at: number) => `${zName} at ${axis} = ${+at.toPrecision(6)}`;
    const used = new Map<string, number>();
    const zCols = cs.map((c): [string, number[], Column['role']] => {
      let n = cs.length === 1 ? zName : title(c.at);
      const k = (used.get(n) ?? 0) + 1;
      used.set(n, k);
      if (k > 1) n = `${n} (${k})`;
      return [n, c.z, 'y'];
    });
    return ds(cs.length === 1 ? title(cs[0].at) : `${zName} ${along === 'row' ? 'rows' : 'columns'}`, [[other, along === 'row' ? g.xs : g.ys, 'x'], ...zCols]);
  };
  const flat = { x: [] as number[], y: [] as number[], z: [] as number[] };
  g.ys.forEach((y, j) =>
    g.xs.forEach((x, i) => {
      flat.x.push(x);
      flat.y.push(y);
      flat.z.push(g.z[j * g.xs.length + i]);
    }),
  );
  const rowSet = profileSet('row');
  const colSet = profileSet('column');
  return {
    curves,
    grid: g,
    levels,
    range: [lo, hi],
    gridSet: ds('grid', [
      [names.x, flat.x, 'x'],
      [names.y, flat.y, 'none'],
      [zName, flat.z, 'y'],
    ]),
    ...(rowSet ? { rowProfile: rowSet } : {}),
    ...(colSet ? { colProfile: colSet } : {}),
    warnings,
  };
}

// a matrix: the Y column and the Z columns whose names give X (a number in each name)
// X's and Z's names from a matrix's Z columns: “R 400 nm”, “R 410 nm” → X “X (nm)”, Z “R”
export function matrixNames(zCols: Column[]): { x: string; z: string } {
  const parts = zCols.map((c) => /^(.*?)([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)(.*)$/.exec(c.name.trim()));
  const same = (k: 1 | 3) => (parts.every((p) => p && p[k].trim() === parts[0]![k].trim()) ? parts[0]![k].trim() : '');
  const unit = same(3).replace(/^[([]\s*|\s*[)\]]$/g, '');
  return { x: unit ? `X (${unit})` : 'X', z: same(1).replace(/[\s([]+$/, '') || 'Z' };
}
export function gridFromMatrix(yCol: Column, zCols: Column[]): Grid | string {
  const xv = zCols.map((c) => Number(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(c.name)?.[0]));
  if (xv.some((v) => !Number.isFinite(v))) return `Matrix: every Z column's name must hold its X (a number): ${zCols.filter((_, k) => !Number.isFinite(xv[k])).map((c) => `“${c.name}”`).join(', ')}.`;
  const rows = Array.from({ length: yCol.values.length }, (_, j) => j).filter((j) => Number.isFinite(yCol.values[j]));
  const ox = xv.map((v, k) => ({ v, k })).sort((a, b) => a.v - b.v);
  const oy = rows.sort((a, b) => yCol.values[a] - yCol.values[b]);
  const z = new Float64Array(ox.length * oy.length);
  oy.forEach((r, j) => ox.forEach((o, i) => (z[j * ox.length + i] = zCols[o.k].values[r])));
  return { xs: ox.map((o) => o.v), ys: oy.map((r) => yCol.values[r]), z };
}
