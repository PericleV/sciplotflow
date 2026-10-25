// 3D plot (surface, wireframe, bars, symbols, lines, waterfall, a contour on the floor): the scene of the 3D view — surfaces and
// bars from Z on a grid (read as the Contour reads it, made coarser for drawing), symbols and lines through X, Y, Z
// points (a curve per group), a waterfall's curves at the depth of their swept value; colours by Z on a map (a colour
// bar), by group or one colour; the view (azimuth, elevation, perspective), the box (its sides' proportions, walls,
// grid, edges), the floor's map or contour lines. Stacked maps: a flat map of every layer (reciprocal space maps of
// several samples …) at its height, the points averaged in bins or the data's grid, coloured on one scale, the values
// below a threshold (or chosen) left out. Lines and rectangles marked in the data's units. Pure: drawn by
// figure/render3d.tsx.
import { column, fmtNum } from './table.ts';
import { coarsen, contourLines, type Grid } from './contour.ts';
import { hiddenBy, type HideSpec } from './hide.ts';
import { maxOf, minOf } from './minmax.ts';
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { curveStyle, PALETTE, type ColorMapName, type Curve, type Dash, type ElementLook, type Head3D, type P3, type SymbolFill, type SymbolShape, type Axis3D, type ThreeLine, type ThreePlane, type ThreePoints, type ThreeScene } from '../figure/spec.ts';

export type Plot3DKind = 'surface' | 'wireframe' | 'bars' | 'scatter' | 'lines' | 'waterfall' | 'layers';
// A layer of stacked maps: its name, its height (NaN: the group's value, else 1, 2, 3 …), shown or not, its opacity. In
// the node's own list (layerList 'own') also where its data come from: the input (0 = A, 1 = B …), the rows where a
// column has a value (where = is) and / or rows by number ("1-2500"), its columns ('' = the node's).
export type LayerSpec = { name?: string; at?: number; show?: boolean; opacity?: number; from?: number; where?: string; is?: string; rows?: string; x?: string; y?: string; v?: string };
// A line or a rectangle in the box, in the data's units: a vertical line at (x1, y1) from z1 to z2, a line from point 1
// to point 2, a rectangle x1 … x2 by y1 … y2 at the height z1 (a missing height: the box's bottom / top).
// a mark in the box: a vertical line, a line or an arrow (its heads), a rectangle (in a plane: across X and Y at a
// height, X and Z at a Y, Y and Z at an X; its fill), a point (a symbol, a line to the floor); its look, its label, its
// projections on the floor and the back walls
export type Mark3D = {
  id: string;
  type: 'vline' | 'line' | 'arrow' | 'rect' | 'point';
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  color: string;
  width: number;
  dash: Dash;
  opacity?: number;
  head1?: Head3D;
  head2?: Head3D;
  headSize?: number;
  plane?: 'xy' | 'xz' | 'yz';
  fill?: string;
  fillOpacity?: number;
  symbol?: SymbolShape;
  size?: number;
  drop?: boolean;
  label?: string;
  labelSize?: number;
  proj?: { floor?: boolean; x?: boolean; y?: boolean };
  place?: 'depth' | 'front' | 'back'; // drawn by its depth with the data (absent), in front of them, or behind them
};
export type Plot3DSpec = {
  kind: Plot3DKind;
  // Z on a grid (surface, wireframe, bars): as the Contour — X, Y, Z columns or a matrix
  layout: 'xyz' | 'matrix';
  x: string; // also the X of scatter, lines, waterfall
  y: string;
  z: string;
  yCol: string;
  zs: string;
  xTitle?: string;
  grid: number;
  group: string; // scatter, lines: a curve per group ('' = one)
  ys: string; // waterfall: the Y columns (a curve each)
  zFrom: 'auto' | 'key' | 'name' | 'order'; // waterfall: the depth of each curve
  // the view
  azim: number;
  elev: number;
  persp: number; // 0: none
  aspectX: number;
  aspectY: number;
  aspectZ: number;
  // colours
  colorBy: 'z' | 'single' | 'group' | 'column'; // column (symbols, lines): by the values of colorCol, a 4th column
  colorCol?: string;
  cmap: ColorMapName;
  cmapColors: string[];
  reverse: boolean;
  color: string; // one colour
  colorbar: boolean;
  zMin: number; // the colour map's range (NaN: the data's)
  zMax: number;
  colors?: string[]; // of the groups / curves
  looks?: (ElementLook | null)[];
  // surfaces
  resolution: number; // at most this many cells a side drawn
  opacity: number;
  shade: number; // 0 … 1: how much the light darkens the cells turned away
  mesh: number; // the mesh every N cells (0: none)
  meshColor: string;
  meshWidth: number;
  floor: 'none' | 'map' | 'contour';
  floorLevels: number;
  // bars
  barWidth: number; // a fraction of the grid's step
  barEdge: string;
  // symbols, lines
  symbol: SymbolShape;
  symbolSize: number;
  symbolFill: SymbolFill;
  drop: boolean;
  depthShade: boolean;
  lineWidth: number;
  dash: Dash;
  walls: boolean; // waterfall: every curve filled down to the floor
  wallOpacity: number;
  // waterfall: the walls of all the curves or of the chosen ones (wallPick[j]); their colour — one for all, else each
  // curve's own (wallColors[j]), else the line's; the depth's labels: the values, the curves' names or typed (a, b, c …)
  wallsOf?: 'all' | 'chosen';
  wallPick?: boolean[];
  wallColor?: string;
  wallColors?: string[];
  depthLabels?: 'values' | 'names' | 'custom';
  depthText?: string;
  // the box
  panes: string;
  gridColor: string;
  edges: 'back' | 'all' | 'none';
  titleX: string; // '' = the data's names
  titleY: string;
  titleZ: string;
  ticks: number;
  // stacked maps: the layers' own settings; the column whose values make the layers of A ('' = a layer per port); the
  // points averaged in bins (bins a side) or the data's grid (or interpolated to one, as the Contour); the values left
  // out; the colours on a log scale; the Z axis: the layers' heights, their names or nothing
  layers?: LayerSpec[]; // auto: the settings of the layers found, by their place
  layerList?: 'auto' | 'own'; // the layers found (by port, by a column of labels) or the node's own list
  layerOwn?: LayerSpec[]; // the node's own list
  layerBy?: string; // auto: the column of the layers ('' = a column of labels, if one; '-' = none: a layer per port)
  layerDraw?: 'bins' | 'grid';
  bins?: number;
  hide?: HideSpec;
  logColor?: boolean;
  barTitle?: string; // the colour bar's title (absent: the value's name)
  layerAxis?: 'values' | 'names' | 'none';
  // the grid on every wall or only on the floor; dashed lines halfway between its lines
  gridWalls?: 'all' | 'floor';
  gridMinor?: boolean;
  marks?: Mark3D[];
  // the camera: zoomed and moved with the mouse (Zoom, Pan, the wheel; absent: the box fitted in the frame)
  cam?: { k: number; dx: number; dy: number };
  // surfaces: the fill shown or hidden (only the mesh, the projections); its colours in so many bands (0: smooth); the
  // colour of the underside; the light's direction (absent: from the eye's side) and a highlight
  surfaceFill?: 'shown' | 'none';
  bands?: number;
  backColor?: string;
  lightAz?: number;
  lightEl?: number;
  shine?: number;
  // the mesh: along both, X or Y; one colour, by Z (the map), darker than the cell; its opacity and dashes
  meshDir?: 'both' | 'x' | 'y';
  meshBy?: 'one' | 'z' | 'darker';
  meshOpacity?: number;
  meshDash?: Dash;
  // contour lines on the surface itself: so many levels, their colour ('' by the map), width
  contours?: number;
  contourColor?: string;
  contourWidth?: number;
  // the projections: on the ceiling as on the floor, on the back walls (the curves every so many rows, or the highest
  // outline filled), their opacity; the curtain — the surface's edges filled down to the floor
  ceiling?: 'none' | 'map' | 'contour';
  wallProj?: 'none' | 'lines' | 'max';
  wallEvery?: number;
  projOpacity?: number;
  curtain?: boolean;
  curtainColor?: string;
  curtainOpacity?: number;
  curtainBy?: 'surface'; // its colours those of the surface's edge, continued down (absent: one colour)
  // the axes X, Y, Z: their own look (Axes tab)
  axis3?: { x?: Axis3D; y?: Axis3D; z?: Axis3D };
  // the limits of the axes (an end null / absent: the data's); what is outside the box cut
  xLim?: [number | null, number | null];
  yLim?: [number | null, number | null];
  zLim?: [number | null, number | null];
};

// a layer as read: its name, height and points (x, y, the value), or its grid (layerDraw 'grid')
export type LayerInput = { name: string; at: number; x: ArrayLike<number>; y: ArrayLike<number>; v: ArrayLike<number>; grid?: Grid; opacity?: number };
export type Plot3DInput =
  | { kind: 'grid'; g: Grid; names: { x: string; y: string; z: string } }
  | { kind: 'points'; groups: { name: string; x: number[]; y: number[]; z: number[]; c?: number[] }[]; names: { x: string; y: string; z: string; c?: string } }
  | { kind: 'curves'; curves: { name: string; depth: number; x: number[]; y: number[] }[]; names: { x: string; y: string; z: string } }
  | { kind: 'layers'; layers: LayerInput[]; names: { x: string; y: string; z: string; depth: string } };

// The maps of the layers: every one's cells (bins over the X, Y range of all, or its own grid), the values left out
// empty (NaN); the range of X and Y — of all the data, the hidden values too (the box stays as the measurement was).
export function layerPlanes(layers: LayerInput[], d: Plot3DSpec): { planes: ThreePlane[]; x: [number, number]; y: [number, number] } | string {
  const hid = hiddenBy(d.hide) ?? ((v: number) => !Number.isFinite(v));
  const nb = Math.max(4, Math.min(600, Math.round(d.bins ?? 150) || 150));
  let [xlo, xhi, ylo, yhi] = [Infinity, -Infinity, Infinity, -Infinity];
  const grids = layers.map((L) => (L.grid ? coarsen(L.grid, nb) : null));
  let shown = 0;
  layers.forEach((L, k) => {
    const g = grids[k];
    if (g) {
      [xlo, xhi, ylo, yhi] = [Math.min(xlo, minOf(g.xs)), Math.max(xhi, maxOf(g.xs)), Math.min(ylo, minOf(g.ys)), Math.max(yhi, maxOf(g.ys))];
      for (const z of g.z) if (!hid(z)) shown++;
      return;
    }
    const n = Math.min(L.x.length, L.y.length, L.v.length);
    for (let i = 0; i < n; i++) {
      const [x, y, v] = [L.x[i], L.y[i], L.v[i]];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(v)) continue;
      if (x < xlo) xlo = x;
      if (x > xhi) xhi = x;
      if (y < ylo) ylo = y;
      if (y > yhi) yhi = y;
      if (!hid(v)) shown++;
    }
  });
  if (!(xhi >= xlo)) return 'Nothing to draw: no point has X, Y and a value.';
  if (!shown) return 'Nothing to draw: every value is hidden.';
  if (!(xhi > xlo)) [xlo, xhi] = [xlo - 0.5, xhi + 0.5];
  if (!(yhi > ylo)) [ylo, yhi] = [ylo - 0.5, yhi + 0.5];
  const edges = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, k) => lo + ((hi - lo) * k) / n);
  // a grid's cells: halfway to the neighbours (the outer ones as wide as their inner half)
  const gridEdges = (a: number[]) => (a.length < 2 ? [a[0] - 0.5, a[0] + 0.5] : [a[0] - (a[1] - a[0]) / 2, ...a.slice(1).map((v, k) => (v + a[k]) / 2), a[a.length - 1] + (a[a.length - 1] - a[a.length - 2]) / 2]);
  const planes = layers.map((L, k): ThreePlane => {
    const opacity = L.opacity !== undefined && L.opacity > 0 && L.opacity < 1 ? L.opacity : 1;
    const g = grids[k];
    if (g) {
      const v = Float64Array.from(g.z, (z) => (hid(z) ? NaN : z));
      return { name: L.name, z: L.at, xe: gridEdges(g.xs), ye: gridEdges(g.ys), v, opacity };
    }
    // the points of the layer averaged in the bins (an empty bin: NaN)
    const sum = new Float64Array(nb * nb);
    const cnt = new Uint32Array(nb * nb);
    const n = Math.min(L.x.length, L.y.length, L.v.length);
    const fx = nb / (xhi - xlo);
    const fy = nb / (yhi - ylo);
    for (let i = 0; i < n; i++) {
      const v = L.v[i];
      const [x, y] = [L.x[i], L.y[i]];
      if (!Number.isFinite(x) || !Number.isFinite(y) || hid(v)) continue;
      const bi = Math.min(nb - 1, Math.max(0, Math.floor((x - xlo) * fx)));
      const bj = Math.min(nb - 1, Math.max(0, Math.floor((y - ylo) * fy)));
      sum[bj * nb + bi] += v;
      cnt[bj * nb + bi]++;
    }
    const v = Float64Array.from(sum, (s, q) => (cnt[q] ? s / cnt[q] : NaN));
    return { name: L.name, z: L.at, xe: edges(xlo, xhi, nb), ye: edges(ylo, yhi, nb), v, opacity };
  });
  return { planes, x: [xlo, xhi], y: [ylo, yhi] };
}

// The marked lines, arrows, rectangles and points as parts of the scene: a line crossing the layers cut at their
// heights, so that every piece is drawn between the right two (the parts behind a layer hidden by it); arrow heads, a
// rectangle's fill, a label, the projections on the floor and the back walls.
function markLines(marks: Mark3D[] | undefined, zr: [number, number], cuts: number[], scene: ThreeScene): ThreeLine[] {
  const out: ThreeLine[] = [];
  for (const m of marks ?? []) {
    const color = m.color || '#000000';
    const place = m.place === 'front' || m.place === 'back' ? { place: m.place } : {};
    const look = {
      ...place,
      color,
      width: m.width > 0 ? m.width : 0.8,
      dash: m.dash || 'dash',
      ...(m.opacity !== undefined && m.opacity < 1 ? { opacity: Math.max(0, m.opacity) } : {}),
      ...(m.proj && (m.proj.floor || m.proj.x || m.proj.y) ? { proj: m.proj } : {}),
    };
    const z1 = Number.isFinite(m.z1) ? m.z1 : zr[0];
    const z2 = Number.isFinite(m.z2) ? m.z2 : zr[1];
    const label = (at: P3) => m.label?.trim() && (scene.labels ??= []).push({ at, text: m.label, color, size: m.labelSize && m.labelSize > 0 ? m.labelSize : 0, ...place });
    if (m.type === 'point') {
      const p: P3 = [m.x1, m.y1, z1];
      if (!p.every(Number.isFinite)) continue;
      scene.points.push({ pts: [p], colors: [color], symbol: m.symbol ?? 'circle', size: m.size && m.size > 0 ? m.size : 4, fill: 'filled', edge: 0.5, drop: !!m.drop, depthShade: false, ...place });
      if (look.proj) out.push({ ...look, planar: false, pts: [p, p], width: 0 });
      label(p);
      continue;
    }
    if (m.type === 'rect') {
      // in a plane: across X and Y at a height (xy), across X and Z at a Y (xz), across Y and Z at an X (yz)
      const plane = m.plane ?? 'xy';
      const ok = plane === 'xy' ? [m.x1, m.x2, m.y1, m.y2] : plane === 'xz' ? [m.x1, m.x2, m.y1] : [m.y1, m.y2, m.x1];
      if (!ok.every(Number.isFinite)) continue;
      const pts: P3[] =
        plane === 'xy'
          ? [[m.x1, m.y1, z1], [m.x2, m.y1, z1], [m.x2, m.y2, z1], [m.x1, m.y2, z1], [m.x1, m.y1, z1]]
          : plane === 'xz'
            ? [[m.x1, m.y1, z1], [m.x2, m.y1, z1], [m.x2, m.y1, z2], [m.x1, m.y1, z2], [m.x1, m.y1, z1]]
            : [[m.x1, m.y1, z1], [m.x1, m.y2, z1], [m.x1, m.y2, z2], [m.x1, m.y1, z2], [m.x1, m.y1, z1]];
      out.push({ ...look, planar: true, pts, ...(m.fill ? { area: { color: m.fill, opacity: m.fillOpacity !== undefined && m.fillOpacity >= 0 ? Math.min(1, m.fillOpacity) : 0.3 } } : {}) });
      label(pts[3]);
      continue;
    }
    const a: P3 = [m.x1, m.y1, z1];
    const b: P3 = m.type === 'vline' ? [m.x1, m.y1, z2] : [m.x2, m.y2, z2];
    if (![...a, ...b].every(Number.isFinite)) continue;
    // cut where it crosses a layer
    const ts = [0, 1, ...cuts.map((c) => (b[2] !== a[2] ? (c - a[2]) / (b[2] - a[2]) : NaN)).filter((t) => t > 1e-9 && t < 1 - 1e-9)].sort((p, q) => p - q);
    const pts = ts.map((t): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    const heads: [Head3D, Head3D] = [m.head1 ?? 'none', m.head2 ?? (m.type === 'arrow' ? 'arrow' : 'none')];
    out.push({ ...look, planar: false, pts, ...(heads[0] !== 'none' || heads[1] !== 'none' ? { heads, headSize: m.headSize && m.headSize > 0 ? m.headSize : 5 } : {}) });
    label(b);
  }
  return out;
}

const fin = (a: number[]) => a.filter(Number.isFinite);
const rangeOf = (a: number[]): [number, number] => {
  const f = fin(a);
  if (!f.length) return [0, 1];
  let [lo, hi] = [minOf(f), maxOf(f)];
  if (!(hi > lo)) [lo, hi] = [lo - 0.5, hi + 0.5];
  return [lo, hi];
};

export function plot3d(data: Plot3DInput, d: Plot3DSpec): { curves: Curve[]; colorRange: [number, number] | null; warnings: string[] } | string {
  const warnings: string[] = [];
  const stops = stopsOf(d.cmap, d.cmapColors);
  const scene: ThreeScene = {
    range: { x: [0, 1], y: [0, 1], z: [0, 1] },
    azim: Number.isFinite(d.azim) ? d.azim : -60,
    elev: Number.isFinite(d.elev) ? Math.max(-90, Math.min(90, d.elev)) : 30,
    persp: d.persp > 0 ? Math.max(1.5, d.persp) : 0,
    aspect: [d.aspectX > 0 ? d.aspectX : 1, d.aspectY > 0 ? d.aspectY : 1, d.aspectZ > 0 ? d.aspectZ : 0.75],
    // stacked maps: Z is the layers' height (titled only with their values: the name of the column of the layers)
    titles: [d.titleX || data.names.x, d.titleY || data.names.y, d.titleZ || (data.kind === 'layers' ? ((d.layerAxis ?? 'values') === 'values' ? data.names.depth : '') : data.names.z)],
    ticks: Math.max(2, Math.min(12, Math.round(d.ticks) || 5)),
    panes: d.panes,
    grid: d.gridColor,
    ...(d.gridWalls === 'floor' ? { gridWalls: [false, false, true] as [boolean, boolean, boolean] } : {}),
    ...(d.gridMinor ? { gridMinor: true } : {}),
    ...(d.axis3 ? { axes: [d.axis3.x, d.axis3.y, d.axis3.z] } : {}),
    edges: d.edges,
    edgeColor: '#000000',
    ...(d.cam && d.cam.k > 0 && (d.cam.k !== 1 || d.cam.dx || d.cam.dy) ? { cam: { k: d.cam.k, dx: d.cam.dx || 0, dy: d.cam.dy || 0 } } : {}),
    surfaces: [],
    bars: { items: [], edge: d.barEdge, edgeWidth: 0.4, opacity: d.opacity > 0 ? Math.min(1, d.opacity) : 1 },
    lines: [],
    points: [],
  };
  let zr: [number, number] | null = null;
  const legend: Curve[] = [];
  const own = (j: number) => d.colors?.[j] || PALETTE[(j + 1) % PALETTE.length];
  const empty = () => ({ name: '', x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) });
  if (data.kind === 'grid') {
    const g0 = data.g;
    const g = coarsen(g0, Math.max(4, Math.min(200, Math.round(d.resolution) || 50)));
    if (g !== g0) warnings.push(`Drawn on ${g.xs.length} × ${g.ys.length} cells (the data averaged; Resolution sets it).`);
    const zs = Array.from(g.z);
    const [lo, hi] = rangeOf(zs);
    zr = [Number.isFinite(d.zMin) ? d.zMin : lo, Number.isFinite(d.zMax) ? d.zMax : hi];
    if (!(zr[1] > zr[0])) zr = [lo, hi];
    // in bands: the colour of the middle of the band the value is in
    const nb = Math.max(0, Math.min(40, Math.round(d.bands ?? 0)));
    const tOf = (v: number) => {
      const t = mapT(v, zr![0], zr![1], false, d.reverse);
      return nb > 1 ? Math.min(nb - 1, Math.max(0, Math.floor(t * nb))) / (nb - 1) : t;
    };
    const colorOf = (v: number) => (d.colorBy === 'single' ? d.color || '#4878d0' : mapColor(stops, tOf(v)));
    const nx = g.xs.length;
    const ny = g.ys.length;
    if (d.kind === 'bars') {
      const step = (a: number[]) => (a.length > 1 ? Math.abs(a[a.length - 1] - a[0]) / (a.length - 1) : 1);
      const w = Math.max(0.05, Math.min(1, d.barWidth || 0.8));
      const base = lo <= 0 && hi >= 0 ? 0 : lo > 0 ? Math.min(0, lo) : hi;
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const v = g.z[j * nx + i];
          if (Number.isFinite(v)) scene.bars.items.push({ x: g.xs[i], y: g.ys[j], z0: base, z1: v, dx: step(g.xs) * w, dy: step(g.ys) * w, color: colorOf(v) });
        }
      const sx = step(g.xs) / 2;
      const sy = step(g.ys) / 2;
      scene.range = { x: [minOf(g.xs) - sx, maxOf(g.xs) + sx], y: [minOf(g.ys) - sy, maxOf(g.ys) + sy], z: rangeOf([...zs, base]) };
    } else {
      // a colour a cell: the mean of its corners
      const fill: string[] = [];
      for (let j = 0; j < ny - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          const m = (g.z[j * nx + i] + g.z[j * nx + i + 1] + g.z[(j + 1) * nx + i] + g.z[(j + 1) * nx + i + 1]) / 4;
          fill.push(d.kind === 'wireframe' || d.surfaceFill === 'none' ? '' : colorOf(m));
        }
      const wire = d.kind === 'wireframe';
      // the mesh: its colour at every node by Z (the map)
      const byZ = d.meshBy === 'z';
      const mesh = {
        every: wire ? Math.max(1, d.mesh || 1) : Math.max(0, Math.round(d.mesh) || 0),
        color: wire ? d.meshColor || (d.colorBy === 'single' ? d.color : '') || '#1f4e9c' : d.meshColor || '#333333',
        width: d.meshWidth > 0 ? d.meshWidth : 0.4,
        ...(d.meshDir === 'x' || d.meshDir === 'y' ? { dir: d.meshDir } : {}),
        ...(byZ ? { colors: Array.from(g.z, (v) => (Number.isFinite(v) ? mapColor(stops, mapT(v, zr![0], zr![1], false, d.reverse)) : '')) } : {}),
        ...(d.meshBy === 'darker' ? { darker: true } : {}),
        ...(d.meshOpacity !== undefined && d.meshOpacity >= 0 && d.meshOpacity < 1 ? { opacity: d.meshOpacity } : {}),
        ...(d.meshDash && d.meshDash !== 'solid' ? { dash: d.meshDash } : {}),
      };
      scene.surfaces.push({
        xs: g.xs,
        ys: g.ys,
        z: g.z,
        fill,
        opacity: d.opacity > 0 ? Math.min(1, d.opacity) : 1,
        shade: Math.max(0, Math.min(1, d.shade)),
        mesh,
        ...(d.backColor ? { back: d.backColor } : {}),
        ...(Number.isFinite(d.lightAz) || Number.isFinite(d.lightEl) ? { light: [Number.isFinite(d.lightAz) ? d.lightAz! : -60, Number.isFinite(d.lightEl) ? d.lightEl! : 45] as [number, number] } : {}),
        ...(d.shine && d.shine > 0 ? { shine: Math.min(1, d.shine) } : {}),
      });
      scene.range = { x: rangeOf(g.xs), y: rangeOf(g.ys), z: rangeOf(zs) };
      // contour lines on the surface, at their heights (drawn just over its cells)
      const nc = Math.max(0, Math.min(40, Math.round(d.contours ?? 0)));
      for (let k = 1; k <= nc; k++) {
        const lv = lo + ((hi - lo) * k) / (nc + 1);
        const color = d.contourColor || mapColor(stops, mapT(lv, zr[0], zr[1], false, d.reverse));
        for (const seg of contourLines(g0, lv)) scene.lines.push({ pts: seg.x.map((x, q): P3 => [x, seg.y[q], lv]), color, width: d.contourWidth && d.contourWidth > 0 ? d.contourWidth : 0.6, dash: 'solid', planar: false, bias: 0.03 });
      }
      // the curtain: the four edges of the surface filled down to the floor
      if (d.curtain) {
        const color = d.curtainColor || (d.colorBy === 'single' ? d.color || '#4878d0' : mapColor(stops, 0.5));
        const opacity = d.curtainOpacity !== undefined && d.curtainOpacity > 0 ? Math.min(1, d.curtainOpacity) : 0.6;
        // like the surface: every piece of the edge in the colour of its top (as the cells above it), continued down
        const bySurface = d.curtainBy === 'surface' && d.colorBy !== 'single';
        const edge = (pts: P3[]) => {
          if (!bySurface) return void scene.lines.push({ pts, color, width: 0.5, dash: 'solid', planar: true, fill: { color, opacity } });
          for (let k = 0; k < pts.length - 1; k++) {
            const top = (pts[k][2] + pts[k + 1][2]) / 2;
            if (!Number.isFinite(top)) continue;
            const c = mapColor(stops, tOf(top));
            scene.lines.push({ pts: [pts[k], pts[k + 1]], color: c, width: 0.5, dash: 'solid', planar: true, fill: { color: c, opacity } });
          }
        };
        edge(g.xs.map((x, i): P3 => [x, g.ys[0], g.z[i]]));
        edge(g.xs.map((x, i): P3 => [x, g.ys[ny - 1], g.z[(ny - 1) * nx + i]]));
        edge(g.ys.map((y, j): P3 => [g.xs[0], y, g.z[j * nx]]));
        edge(g.ys.map((y, j): P3 => [g.xs[nx - 1], y, g.z[j * nx + nx - 1]]));
      }
      // the back walls: the surface projected on them
      if (d.wallProj === 'lines' || d.wallProj === 'max') scene.walls = { mode: d.wallProj, every: Math.max(1, Math.round(d.wallEvery ?? 4) || 4), color: d.colorBy === 'single' ? d.color || '#4878d0' : mapColor(stops, 0.55) };
      if (d.projOpacity !== undefined && d.projOpacity > 0 && d.projOpacity < 1) scene.projOpacity = d.projOpacity;
      // the floor (and the ceiling): the map of Z, or its contour lines
      const projection = (kind: 'none' | 'map' | 'contour' | undefined): ThreeScene['floor'] => {
        if (kind === 'map') {
          const half = (a: number[], k: number) => [k > 0 ? (a[k - 1] + a[k]) / 2 : a[k], k < a.length - 1 ? (a[k] + a[k + 1]) / 2 : a[k]];
          const cells: NonNullable<ThreeScene['floor']>['cells'] = [];
          for (let j = 0; j < ny; j++)
            for (let i = 0; i < nx; i++) {
              const v = g.z[j * nx + i];
              if (!Number.isFinite(v)) continue;
              const [x0, x1] = half(g.xs, i);
              const [y0, y1] = half(g.ys, j);
              cells.push({ x0, x1, y0, y1, color: mapColor(stops, tOf(v)) });
            }
          return { cells };
        }
        if (kind === 'contour') {
          const n = Math.max(2, Math.min(30, Math.round(d.floorLevels) || 8));
          const lines: { pts: [number, number][]; color: string }[] = [];
          for (let k = 1; k <= n; k++) {
            const lv = lo + ((hi - lo) * k) / (n + 1);
            const color = mapColor(stops, mapT(lv, zr![0], zr![1], false, d.reverse));
            for (const seg of contourLines(g0, lv)) lines.push({ pts: seg.x.map((x, q) => [x, seg.y[q]]), color });
          }
          return { lines };
        }
        return undefined;
      };
      const top = projection(d.ceiling);
      if (top) scene.ceiling = top;
      const bottom = projection(d.floor);
      if (bottom) scene.floor = bottom;
    }
  } else if (data.kind === 'layers') {
    if (!data.layers.length) return 'No layers: connect a dataset to A (and B, C …), or choose the column that names the layers.';
    const made = layerPlanes(data.layers, d);
    if (typeof made === 'string') return made;
    // the colour range: the values drawn (a log scale: the positive ones)
    const vals: number[] = [];
    for (const p of made.planes) for (const v of p.v) if (Number.isFinite(v) && (!d.logColor || v > 0)) vals.push(v);
    if (!vals.length) return d.logColor ? 'No positive value to colour on a log scale.' : 'Nothing to draw: every value is hidden.';
    const [lo, hi] = [minOf(vals), maxOf(vals)];
    const want = (v: number) => Number.isFinite(v) && (!d.logColor || v > 0);
    zr = [want(d.zMin) ? d.zMin : lo, want(d.zMax) ? d.zMax : hi];
    if (!(zr[1] > zr[0])) zr = hi > lo ? [lo, hi] : [lo - 0.5 * Math.abs(lo || 1), hi + 0.5 * Math.abs(hi || 1)];
    // the heights: half a step of room below the lowest layer and above the highest
    const ats = made.planes.map((p) => p.z);
    const [zlo, zhi] = [minOf(ats), maxOf(ats)];
    const pad = ats.length > 1 && zhi > zlo ? (0.5 * (zhi - zlo)) / (ats.length - 1) : 0.5;
    scene.range = { x: made.x, y: made.y, z: [zlo - pad, zhi + pad] };
    scene.planes = made.planes;
    if (d.hide?.outside === 'hide') scene.outside = 'hide';
    const axis = d.layerAxis ?? 'values';
    if (axis === 'names') scene.zLabels = { at: ats, text: made.planes.map((p) => p.name) };
    else if (axis === 'none') scene.zLabels = { at: [], text: [] };
  } else if (data.kind === 'points') {
    const all = data.groups.flatMap((q) => q.z);
    const [lo, hi] = rangeOf(all);
    // coloured by Z, or by a 4th column (its values in c): the map's value of every point
    const byCol = d.colorBy === 'column' && data.groups.some((q) => q.c);
    const byZ = d.colorBy === 'z' || d.colorBy === 'column';
    const [clo, chi] = byCol ? rangeOf(data.groups.flatMap((q) => q.c ?? [])) : [lo, hi];
    zr = byZ ? [Number.isFinite(d.zMin) ? d.zMin : clo, Number.isFinite(d.zMax) ? d.zMax : chi] : null;
    const one = data.groups.length === 1;
    data.groups.forEach((q, j) => {
      const L = d.looks?.[j];
      const color = d.colorBy === 'single' ? d.color || '#4878d0' : own(j);
      const pts: P3[] = q.x.map((x, i) => [x, q.y[i], q.z[i]]);
      const val = (i: number) => (byCol ? (q.c?.[i] ?? NaN) : pts[i][2]);
      const mapped = (v: number) => (Number.isFinite(v) ? mapColor(stops, mapT(v, zr![0], zr![1], false, d.reverse)) : '#bbbbbb');
      const lineOn = d.kind === 'lines' && L?.line?.show !== false;
      const symOn = d.kind === 'scatter' ? L?.points !== false : L?.points === true;
      if (lineOn) {
        const ln: ThreeLine = { pts, color: L?.line?.color || color, width: L?.line?.width ?? d.lineWidth, dash: L?.line?.dash ?? d.dash, planar: false };
        if (byZ && zr) {
          // a line coloured by Z: piece by piece
          for (let i = 0; i < pts.length - 1; i++) scene.lines.push({ ...ln, pts: [pts[i], pts[i + 1]], color: mapped((val(i) + val(i + 1)) / 2) });
        } else scene.lines.push(ln);
      }
      if (symOn) {
        const sp: ThreePoints = { pts, colors: byZ && zr ? pts.map((_, i) => mapped(val(i))) : [color], symbol: L?.symbol ?? d.symbol, size: L?.symbolSize ?? d.symbolSize, fill: L?.symbolFill ?? d.symbolFill, edge: 0.5, drop: d.drop, depthShade: d.depthShade };
        scene.points.push(sp);
      }
      if (!one || !byZ) legend.push({ key: `3d:${j}`, label: q.name, ...(one ? { noLegend: true } : {}), series: empty(), style: curveStyle({ mode: d.kind === 'lines' ? (symOn ? 'linesymbol' : 'line') : 'scatter', color, lineWidth: d.lineWidth, symbol: d.symbol, symbolSize: d.symbolSize, symbolFill: d.symbolFill }) });
    });
    scene.range = { x: rangeOf(data.groups.flatMap((q) => q.x)), y: rangeOf(data.groups.flatMap((q) => q.y)), z: [lo, hi] };
  } else {
    // a waterfall: X across, the swept value in depth, Y up
    const cs = data.curves;
    if (!cs.length) return 'No curves: choose the Y columns.';
    const deps = cs.map((c) => c.depth);
    const [dlo, dhi] = rangeOf(deps);
    const all = cs.flatMap((c) => c.y);
    const [lo, hi] = rangeOf(all);
    const byZ = d.colorBy === 'z';
    zr = byZ ? [dlo, dhi] : null;
    cs.forEach((c, j) => {
      const L = d.looks?.[j];
      const color = L?.line?.color || (d.colorBy === 'single' ? d.color || '#4878d0' : byZ ? mapColor(stops, mapT(c.depth, dlo, dhi, false, d.reverse)) : own(j));
      const wall = d.walls && (d.wallsOf !== 'chosen' || !!d.wallPick?.[j]);
      const wallColor = d.wallColors?.[j] || d.wallColor || color;
      scene.lines.push({ pts: c.x.map((x, i) => [x, c.depth, c.y[i]]), color, width: L?.line?.width ?? d.lineWidth, dash: L?.line?.dash ?? d.dash, planar: true, ...(wall ? { fill: { color: wallColor, opacity: L?.opacity ?? (d.wallOpacity > 0 ? Math.min(1, d.wallOpacity) : 0.3) } } : {}) });
      legend.push({ key: `3d:${j}`, label: c.name, noLegend: byZ, series: empty(), style: curveStyle({ mode: 'line', color, lineWidth: d.lineWidth }) });
    });
    scene.range = { x: rangeOf(cs.flatMap((c) => c.x)), y: dhi > dlo ? [dlo, dhi] : [dlo - 0.5, dhi + 0.5], z: [lo, hi] };
    // the depth's own labels: the curves' names, or typed (comma-separated, in the curves' order: an empty one, no
    // label; the curves after the last typed, their values)
    if (d.depthLabels === 'names') scene.yLabels = { at: deps, text: cs.map((c) => c.name) };
    else if (d.depthLabels === 'custom') {
      const typed = (d.depthText ?? '').split(',').map((t) => t.trim());
      const keep = deps.map((_, j) => j >= typed.length || typed[j] !== '');
      scene.yLabels = { at: deps.filter((_, j) => keep[j]), text: deps.map((v, j) => (j < typed.length ? typed[j] : fmtNum(v, 4))).filter((_, j) => keep[j]) };
    }
  }
  // the box from the limits of the axes, what is outside it cut
  clipScene(scene, d);
  // the lines and rectangles marked (cut at the layers' heights)
  scene.lines.push(...markLines(d.marks, scene.range.z, (scene.planes ?? []).map((p) => p.z), scene));
  // a reversed axis: its range from the highest to the lowest (the box drawn the other way along it)
  if (d.axis3?.x?.reverse) scene.range.x = [scene.range.x[1], scene.range.x[0]];
  if (d.axis3?.y?.reverse) scene.range.y = [scene.range.y[1], scene.range.y[0]];
  if (d.axis3?.z?.reverse) scene.range.z = [scene.range.z[1], scene.range.z[0]];
  const layered = data.kind === 'layers';
  const colorRange = zr && (layered || (d.colorBy !== 'single' && d.colorBy !== 'group')) ? zr : null;
  const main: Curve = {
    key: 'three',
    label: '3D',
    noLegend: true,
    series: empty(),
    style: curveStyle({ color: '#000000', cmap: d.cmap, cmapColors: d.cmapColors, cmapReverse: d.reverse, ...(layered && d.logColor ? { cmapLog: true } : {}) }),
    three: scene,
    ...(colorRange ? { colorRange, group: { base: 'three', index: 0, count: 1, value: NaN, name: data.kind === 'curves' ? data.names.y : data.kind === 'points' && d.colorBy === 'column' && data.names.c ? data.names.c : data.names.z, range: colorRange, color: 'map' as const } } : {}),
  };
  return { curves: [main, ...legend], colorRange, warnings };
}

// ---- the limits of the axes: the box from them, what is outside it cut ----
type Lim = [number | null, number | null] | undefined;
const limited = (r: [number, number], l: Lim): [number, number] => {
  const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  let [a, b] = [ok(l?.[0]) ? l![0]! : r[0], ok(l?.[1]) ? l![1]! : r[1]];
  if (a > b) [a, b] = [b, a];
  if (!(b > a)) [a, b] = [a - 0.5, b + 0.5];
  return [a, b];
};
// a polyline cut into its pieces inside the box (a point outside ends a piece)
function inside(pts: P3[], R: ThreeScene['range']): P3[][] {
  const inBox = (p: P3) => p[0] >= R.x[0] && p[0] <= R.x[1] && p[1] >= R.y[0] && p[1] <= R.y[1] && p[2] >= R.z[0] && p[2] <= R.z[1];
  const out: P3[][] = [];
  let cur: P3[] = [];
  for (const p of pts) {
    if (p.every(Number.isFinite) && inBox(p)) cur.push(p);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
export function clipScene(S: ThreeScene, d: Pick<Plot3DSpec, 'xLim' | 'yLim' | 'zLim'>) {
  if (!d.xLim && !d.yLim && !d.zLim) return;
  const R = { x: limited(S.range.x, d.xLim), y: limited(S.range.y, d.yLim), z: limited(S.range.z, d.zLim) };
  S.range = R;
  const inX = (v: number) => v >= R.x[0] && v <= R.x[1];
  const inY = (v: number) => v >= R.y[0] && v <= R.y[1];
  const inZ = (v: number) => v >= R.z[0] && v <= R.z[1];
  // surfaces: the columns and rows outside left out, a Z outside empty
  S.surfaces = S.surfaces.flatMap((sf) => {
    const ii = sf.xs.map((x, i) => (inX(x) ? i : -1)).filter((i) => i >= 0);
    const jj = sf.ys.map((y, j) => (inY(y) ? j : -1)).filter((j) => j >= 0);
    if (ii.length < 2 || jj.length < 2) return [];
    const nx = sf.xs.length;
    const z = new Float64Array(ii.length * jj.length);
    jj.forEach((j, b) => ii.forEach((i, a) => (z[b * ii.length + a] = inZ(sf.z[j * nx + i]) ? sf.z[j * nx + i] : NaN)));
    const fill: string[] = [];
    for (let b = 0; b < jj.length - 1; b++) for (let a = 0; a < ii.length - 1; a++) fill.push(sf.fill[jj[b] * (nx - 1) + ii[a]] ?? '');
    return [{ ...sf, xs: ii.map((i) => sf.xs[i]), ys: jj.map((j) => sf.ys[j]), z, fill }];
  });
  // bars: those outside left out, their heights cut at the box
  S.bars.items = S.bars.items.flatMap((b) => {
    if (!inX(b.x) || !inY(b.y)) return [];
    const [z0, z1] = [Math.max(R.z[0], Math.min(R.z[1], b.z0)), Math.max(R.z[0], Math.min(R.z[1], b.z1))];
    return z0 === z1 ? [] : [{ ...b, z0, z1 }];
  });
  S.lines = S.lines.flatMap((l) => inside(l.pts, R).filter((p) => p.length > 1).map((pts) => ({ ...l, pts })));
  S.points = S.points.map((p) => {
    const keep = p.pts.map((q) => q.every(Number.isFinite) && inX(q[0]) && inY(q[1]) && inZ(q[2]));
    return { ...p, pts: p.pts.filter((_, i) => keep[i]), colors: p.colors.length > 1 ? p.colors.filter((_, i) => keep[i]) : p.colors };
  });
  for (const P of [S.floor, S.ceiling]) {
    if (!P) continue;
    if (P.cells) P.cells = P.cells.flatMap((c) => (c.x1 < R.x[0] || c.x0 > R.x[1] || c.y1 < R.y[0] || c.y0 > R.y[1] ? [] : [{ ...c, x0: Math.max(c.x0, R.x[0]), x1: Math.min(c.x1, R.x[1]), y0: Math.max(c.y0, R.y[0]), y1: Math.min(c.y1, R.y[1]) }]));
    if (P.lines)
      P.lines = P.lines.flatMap((l) =>
        inside(
          l.pts.map((q): P3 => [q[0], q[1], R.z[0]]),
          R,
        ).map((pts) => ({ ...l, pts: pts.map((q): [number, number] => [q[0], q[1]]) })),
      );
  }
  if (S.planes)
    S.planes = S.planes.flatMap((pl) => {
      if (!inZ(pl.z)) return [];
      const nx = pl.xe.length - 1;
      const v = Float64Array.from(pl.v, (val, q) => {
        const [i, j] = [q % nx, Math.floor(q / nx)];
        const [cx, cy] = [(pl.xe[i] + pl.xe[i + 1]) / 2, (pl.ye[j] + pl.ye[j + 1]) / 2];
        return inX(cx) && inY(cy) ? val : NaN;
      });
      return [{ ...pl, v }];
    });
}
