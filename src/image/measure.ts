// The measurements of the selections on an image (Image analysis), as ImageJ gives them: shape (area, perimeter,
// centroid, box, Feret, fitted ellipse, circularity …), intensity (mean, SD, min, max, median, mode, IntDen, skewness,
// kurtosis), the part of every selection a mask covers; its shape (corners: circle, triangle, square …); the nearest
// neighbour of every one (centre to centre, edge to edge; Clark–Evans); spots against their background (a ring, a
// region, a global one: net signal, SNR, saturated pixels; two channels: their ratio); profiles along lines; points; a
// summary by group. The examples of a trainable classifier are not measured.
// All of it as a workbook, the units of the calibration in the columns' names. Pure.
import { luminance, type Raster } from './raster.ts';
import { bounds, convexHull, isArea, isLine, pathLength, polygonArea, ringMask, roiMask, roiOutline, RING_DEFAULTS, ROI_KINDS, type Pt, type Roi, type Window } from './roi.ts';
import { alignment, clarkEvans, minAreaRect, nearestNeighbours, shapeFeatures, shapeName, tracedPerimeter } from './particles.ts';
import type { Column, Dataset, Workbook } from '../engine/table.ts';

export type MeasureKey = 'area' | 'perimeter' | 'centroid' | 'com' | 'bbox' | 'feret' | 'box' | 'ellipse' | 'shape' | 'eqdiam' | 'nnd' | 'mean' | 'sd' | 'minmax' | 'median' | 'mode' | 'intden' | 'skew' | 'covered';
// the measurements offered: key, label, what it gives
export const MEASURE_KEYS: [MeasureKey, string, string][] = [
  ['area', 'Area', 'The area (its pixels × the area of a pixel)'],
  ['perimeter', 'Perimeter', 'The length of the outline (a wand outline: its corners cut, as ImageJ)'],
  ['centroid', 'Centroid', 'X, Y: the centre of the pixels'],
  ['com', 'Centre of mass', 'XM, YM: the centre weighted by the values'],
  ['bbox', 'Bounding box', 'BX, BY, Width, Height'],
  ['feret', 'Feret (length, width)', 'The longest distance across, the length (and its angle), and the narrowest width'],
  ['box', 'Box and orientation', 'The smallest rectangle around it: its length and width (of a cube, its side) and its turn (a square: 0 to 90°, else 0 to 180°); in the summary, the mean turn and the alignment (1: all alike, 0: every way)'],
  ['ellipse', 'Fitted ellipse', 'Major, Minor axes and angle of the ellipse of the same second moments'],
  ['shape', 'Shape descriptors', 'Circularity 4π·area/perimeter², aspect ratio, roundness, solidity; the corners and the shape they make (circle, ellipse, triangle, square, rectangle, polygon, irregular)'],
  ['eqdiam', 'Eq. diameter', 'The diameter of a disc of the same area'],
  ['nnd', 'Nearest neighbours', 'The nearest selection of every one: centre to centre and edge to edge (a Distances sheet; in the summary their CV and Clark–Evans R: 1 random, < 1 clustered, > 1 regular)'],
  ['mean', 'Mean', 'The mean value'],
  ['sd', 'SD', 'The standard deviation of the values'],
  ['minmax', 'Min & max', 'The least and the largest value'],
  ['median', 'Median', 'The median value'],
  ['mode', 'Mode', 'The most frequent value'],
  ['intden', 'Integrated density', 'IntDen = area × mean; RawIntDen = the sum of the values'],
  ['skew', 'Skewness & kurtosis', 'Of the values (kurtosis: excess, 0 for a normal distribution)'],
  ['covered', 'Covered by the mask', 'The part of the selection the mask of the steps (a threshold) covers'],
];
// on: the image measured — the original (the part analysed), the result of the steps, or the image after a step (its
// id); channels (RGB): the luminance, or each channel (and the ratio of two); the background of the spots: its median
// or mean; saturated: the value from which a pixel counts as saturated (NaN: the top of the image's range); the global
// background: a selection, else a value
export type MeasureSpec = { on: string; keys: MeasureKey[]; channels: 'luminance' | 'each'; ratio: [number, number]; bgStat: 'median' | 'mean'; saturated: number; globalBg?: string; globalValue?: number };
export const MEASURE_DEFAULTS: MeasureSpec = { on: 'original', keys: ['area', 'perimeter', 'centroid', 'feret', 'box', 'shape', 'nnd', 'mean', 'sd', 'minmax', 'covered'], channels: 'luminance', ratio: [0, 1], bgStat: 'median', saturated: NaN };
export const measureSpec = (m?: Partial<MeasureSpec>): MeasureSpec => ({ ...MEASURE_DEFAULTS, ...m });
const CH_NAMES = ['R', 'G', 'B'];

// The image measured and the mask that covers: outs[k] is the image after step k (the same as before it when it is off
// or cannot run); the mask: the last one the steps give
export function measureInputs(base: Raster, outs: Raster[], steps: { id: string }[], on: string): { image: Raster; mask: Raster | null } {
  const last = outs.length ? outs[outs.length - 1] : base;
  const k = steps.findIndex((s) => s.id === on);
  const image = on === 'original' ? base : on === 'result' ? last : k >= 0 && outs[k] ? outs[k] : base;
  let mask: Raster | null = null;
  for (let j = outs.length - 1; j >= 0 && !mask; j--) if (outs[j].kind === 'mask') mask = outs[j];
  return { image, mask: mask && mask.w === image.w && mask.h === image.h ? mask : null };
}

// ---- the statistics of a set of values ----

type Stats = { n: number; mean: number; sd: number; min: number; max: number; median: number; mode: number; sum: number; skew: number; kurt: number };
export function valueStats(v: Float64Array): Stats {
  const n = v.length;
  if (!n) return { n, mean: NaN, sd: NaN, min: NaN, max: NaN, median: NaN, mode: NaN, sum: 0, skew: NaN, kurt: NaN };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let ints = true;
  for (let i = 0; i < n; i++) {
    const x = v[i];
    sum += x;
    if (x < min) min = x;
    if (x > max) max = x;
    if (ints && x !== Math.round(x)) ints = false;
  }
  const mean = sum / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = v[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  const sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : NaN;
  // (skewness and excess kurtosis from the moments about the mean, as scipy.stats does by default)
  const [p2, p3, p4] = [m2 / n, m3 / n, m4 / n];
  const s = [...v].sort((a, b) => a - b);
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  // the mode: the most frequent value (whole numbers), else the middle of the fullest of 256 bins
  let mode = s[0];
  if (ints && max - min <= 65536) {
    let best = 0;
    for (let i = 0; i < n; ) {
      let j = i;
      while (j < n && s[j] === s[i]) j++;
      if (j - i > best) [best, mode] = [j - i, s[i]];
      i = j;
    }
  } else if (max > min) {
    const h = new Uint32Array(256);
    for (let i = 0; i < n; i++) h[Math.min(255, Math.floor(((v[i] - min) / (max - min)) * 256))]++;
    let b = 0;
    for (let i = 1; i < 256; i++) if (h[i] > h[b]) b = i;
    mode = min + ((b + 0.5) * (max - min)) / 256;
  }
  return { n, mean, sd, min, max, median, mode, sum, skew: p2 > 0 ? p3 / p2 ** 1.5 : NaN, kurt: p2 > 0 ? p4 / (p2 * p2) - 3 : NaN };
}

// ---- the sheets, built a cell at a time (the columns in a fixed order, whatever the rows have) ----

class Sheet {
  cols = new Map<string, { rank: number; v: (number | string | undefined)[] }>();
  n = 0;
  row() {
    return this.n++;
  }
  set(i: number, name: string, v: number | string, rank: number) {
    let c = this.cols.get(name);
    if (!c) this.cols.set(name, (c = { rank, v: [] }));
    c.v[i] = v;
  }
  dataset(name: string): Dataset {
    const n = this.n;
    const columns = [...this.cols].sort((a, b) => a[1].rank - b[1].rank).map(([nm, { v }]): Column => {
      if (v.some((x) => typeof x === 'string')) return { name: nm, values: new Float64Array(n).fill(NaN), text: Array.from({ length: n }, (_, i) => (v[i] === undefined ? '' : String(v[i]))) };
      return { name: nm, values: Float64Array.from({ length: n }, (_, i) => (typeof v[i] === 'number' ? (v[i] as number) : NaN)) };
    });
    return { name, columns };
  }
}

// the values of a channel under a window's pixels (on an image of width w)
function under(c: Float32Array, w: number, win: Window): Float64Array {
  let n = 0;
  for (let i = 0; i < win.m.length; i++) n += win.m[i];
  const out = new Float64Array(n);
  let k = 0;
  for (let y = 0; y < win.h; y++) {
    const ro = (win.y0 + y) * w + win.x0;
    const mo = y * win.w;
    for (let x = 0; x < win.w; x++) if (win.m[mo + x]) out[k++] = c[ro + x];
  }
  return out;
}
// a value between the pixels' centres (bilinear), the edge held
function sample(c: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x - 0.5));
  const fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  return (c[y0 * w + x0] * (1 - tx) + c[y0 * w + x1] * tx) * (1 - ty) + (c[y1 * w + x0] * (1 - tx) + c[y1 * w + x1] * tx) * ty;
}

// The profile along a line (or segmented line): a sample about every pixel of its length, averaged across its width
export function lineProfile(c: Float32Array, w: number, h: number, pts: Pt[], width = 1): { d: Float64Array; v: Float64Array } {
  const L = pathLength(pts, false);
  const n = Math.max(2, Math.round(L) + 1);
  const d = new Float64Array(n);
  const v = new Float64Array(n);
  const lens = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
  const across = Math.max(1, Math.round(width));
  let seg = 0;
  let before = 0;
  for (let i = 0; i < n; i++) {
    const t = (L * i) / (n - 1);
    while (seg < lens.length - 1 && t > before + lens[seg]) before += lens[seg++];
    const [a, b] = [pts[seg], pts[seg + 1] ?? pts[seg]];
    const len = lens[seg] || 1;
    const f = Math.min(1, Math.max(0, (t - before) / len));
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    // (across the line: its normal)
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    let s = 0;
    for (let j = 0; j < across; j++) {
      const o = j - (across - 1) / 2;
      s += sample(c, w, h, x + nx * o, y + ny * o);
    }
    d[i] = t;
    v[i] = s / across;
  }
  return { d, v };
}

// the perimeter of a closed selection (px)
export function roiPerimeter(r: Roi): number {
  if (r.kind === 'rect') return 2 * (Math.abs(r.box![2]) + Math.abs(r.box![3]));
  if (r.kind === 'ellipse') {
    // (Ramanujan)
    const a = Math.abs(r.box![2]) / 2;
    const b = Math.abs(r.box![3]) / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  if (r.kind === 'traced') return tracedPerimeter(r.pts ?? []);
  return pathLength(r.pts ?? [], true);
}
// the angle of a direction as seen (counterclockwise from the x axis, y up), degrees in [0, 180)
const axisAngle = (dx: number, dy: number) => {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
};
// Feret: the longest distance between two points of the outline's hull, its angle; the least width (calipers)
export function feret(poly: Pt[]): { max: number; angle: number; min: number } {
  const h = convexHull(poly);
  let max = 0;
  let angle = 0;
  for (let i = 0; i < h.length; i++)
    for (let j = i + 1; j < h.length; j++) {
      const d = Math.hypot(h[j][0] - h[i][0], h[j][1] - h[i][1]);
      if (d > max) [max, angle] = [d, axisAngle(h[j][0] - h[i][0], h[j][1] - h[i][1])];
    }
  let min = h.length < 3 ? 0 : Infinity;
  for (let i = 0; i < h.length && h.length >= 3; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!L) continue;
    let far = 0;
    for (const q of h) far = Math.max(far, Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L);
    if (far < min) min = far;
  }
  return { max, angle, min };
}

// ---- the measurements ----

export type MeasureInput = {
  image: Raster; // the image measured (the part analysed)
  mask: Raster | null; // the mask that covers, if the steps give one
  ox: number; // the part analysed: its place in the original (the selections' places are in the original's pixels)
  oy: number;
  cal?: { size: number; unit: string };
  rois: Roi[];
  spec: MeasureSpec;
  name: string;
};
export type MeasureResult = { book: Workbook; summary: string; covered: number };

export function measureRois(q0: MeasureInput): MeasureResult {
  const q = { ...q0, rois: q0.rois.filter((r) => !r.train) };
  const { image, mask, ox, oy, spec } = q;
  const { w: W, h: H } = image;
  const k = q.cal && q.cal.size > 0 ? q.cal.size : 1;
  const u = q.cal && q.cal.size > 0 ? unitName(q.cal.unit) : 'px';
  const has = (key: MeasureKey) => spec.keys.includes(key);
  const gray = image.ch.length === 1 ? image.ch[0] : luminance(image);
  const each = spec.channels === 'each' && image.ch.length === 3;
  const chans = each ? image.ch.map((c, j) => ({ name: ` ${CH_NAMES[j]}`, c })) : [{ name: '', c: gray }];
  const sat = Number.isFinite(spec.saturated) ? spec.saturated : image.hi;
  const covers = (i: number) => mask!.ch[0][i] > 0.5;
  const sel = new Sheet();
  const spots = new Sheet();
  const prof = new Sheet();
  const points = new Sheet();
  const rows: { roi: Roi; i: number }[] = [];
  const winOf = new Map<string, Window>();
  const winFor = (r: Roi) => {
    let wv = winOf.get(r.id);
    if (!wv) winOf.set(r.id, (wv = roiMask(r, W, H, ox, oy)));
    return wv;
  };
  // (the pixels of the spots — the selections with a background —: left out of the rings around the others)
  let taken: Uint8Array | null = null;
  const takenMask = () => {
    if (taken) return taken;
    taken = new Uint8Array(W * H);
    for (const r of q.rois)
      if (isArea(r) && r.role !== 'background' && r.bg && r.bg.mode !== 'none') {
        const wv = winFor(r);
        for (let y = 0; y < wv.h; y++) for (let x = 0; x < wv.w; x++) if (wv.m[y * wv.w + x]) taken[(wv.y0 + y) * W + wv.x0 + x] = 1;
      }
    return taken;
  };
  const byId = new Map(q.rois.map((r) => [r.id, r]));
  const globalRoi = spec.globalBg ? byId.get(spec.globalBg) : undefined;
  const globalWin = globalRoi && isArea(globalRoi) ? winFor(globalRoi) : null;
  let profCol = 0;
  // the selections whose neighbours are measured: their row, centre, outline (px of the part analysed)
  const placed: { i: number; r: Roi; c: Pt; poly: Pt[] }[] = [];
  // the turn of every selection's smallest rectangle (its row; 4: a square, 2 otherwise)
  const turns = new Map<number, { t: number; n: number }>();
  for (const r of q.rois) {
    const i = sel.row();
    rows.push({ roi: r, i });
    sel.set(i, 'Name', r.name, 0);
    sel.set(i, 'Group', r.group ?? '', 1);
    sel.set(i, 'Type', r.role === 'background' ? 'background' : r.auto ? 'particle' : kindName(r), 2);
    const intensity = (vals: Float64Array[], area: number) => {
      vals.forEach((v, j) => {
        const st = valueStats(v);
        const nm = chans[j].name;
        const R = 100 + j * 20;
        if (has('mean')) sel.set(i, `Mean${nm}`, st.mean, R);
        if (has('sd')) sel.set(i, `SD${nm}`, st.sd, R + 1);
        if (has('minmax')) {
          sel.set(i, `Min${nm}`, st.min, R + 2);
          sel.set(i, `Max${nm}`, st.max, R + 3);
        }
        if (has('median')) sel.set(i, `Median${nm}`, st.median, R + 4);
        if (has('mode')) sel.set(i, `Mode${nm}`, st.mode, R + 5);
        if (has('intden') && area >= 0) {
          sel.set(i, `IntDen${nm}`, area * st.mean, R + 6);
          sel.set(i, `RawIntDen${nm}`, st.sum, R + 7);
        }
        if (has('skew')) {
          sel.set(i, `Skewness${nm}`, st.skew, R + 8);
          sel.set(i, `Kurtosis${nm}`, st.kurt, R + 9);
        }
      });
      if (each && has('mean')) {
        const [a, b] = spec.ratio;
        const ra = valueStats(vals[a]).mean / valueStats(vals[b]).mean;
        sel.set(i, `Ratio ${CH_NAMES[a]}/${CH_NAMES[b]}`, ra, 170);
        sel.set(i, `log2 ratio ${CH_NAMES[a]}/${CH_NAMES[b]}`, Math.log2(ra), 171);
      }
    };
    if (isArea(r)) {
      const wv = winFor(r);
      const poly = roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy]);
      let n = 0;
      let sx = 0;
      let sy = 0;
      let wsum = 0;
      let wx = 0;
      let wy = 0;
      let cov = 0;
      for (let y = 0; y < wv.h; y++)
        for (let x = 0; x < wv.w; x++) {
          if (!wv.m[y * wv.w + x]) continue;
          const [px, py] = [wv.x0 + x + 0.5, wv.y0 + y + 0.5];
          const j = (wv.y0 + y) * W + wv.x0 + x;
          n++;
          sx += px;
          sy += py;
          wsum += gray[j];
          wx += gray[j] * px;
          wy += gray[j] * py;
          if (mask && covers(j)) cov++;
        }
      const area = n * k * k;
      const [cx, cy] = [sx / n, sy / n];
      if (has('area')) sel.set(i, `Area (${u}²)`, area, 10);
      const perim = roiPerimeter(r);
      if (has('perimeter')) sel.set(i, `Perimeter (${u})`, perim * k, 11);
      if (has('centroid')) {
        sel.set(i, `X (${u})`, cx * k, 20);
        sel.set(i, `Y (${u})`, cy * k, 21);
      }
      if (has('com')) {
        sel.set(i, `XM (${u})`, (wx / wsum) * k, 22);
        sel.set(i, `YM (${u})`, (wy / wsum) * k, 23);
      }
      if (has('bbox')) {
        const [x0, y0, x1, y1] = bounds(poly);
        sel.set(i, `BX (${u})`, x0 * k, 24);
        sel.set(i, `BY (${u})`, y0 * k, 25);
        sel.set(i, `Width (${u})`, (x1 - x0) * k, 26);
        sel.set(i, `Height (${u})`, (y1 - y0) * k, 27);
      }
      const fe = feret(poly);
      if (has('feret')) {
        sel.set(i, `Feret (${u})`, fe.max * k, 30);
        sel.set(i, 'FeretAngle (°)', fe.angle, 31);
        sel.set(i, `MinFeret (${u})`, fe.min * k, 32);
      }
      // the ellipse of the same second moments of the pixels' centres
      let [m20, m02, m11] = [0, 0, 0];
      for (let y = 0; y < wv.h; y++)
        for (let x = 0; x < wv.w; x++) {
          if (!wv.m[y * wv.w + x]) continue;
          const dx = wv.x0 + x + 0.5 - cx;
          const dy = wv.y0 + y + 0.5 - cy;
          m20 += dx * dx;
          m02 += dy * dy;
          m11 += dx * dy;
        }
      [m20, m02, m11] = [m20 / n, m02 / n, m11 / n];
      const tr = (m20 + m02) / 2;
      const det = Math.sqrt(((m20 - m02) / 2) ** 2 + m11 * m11);
      const major = 4 * Math.sqrt(Math.max(0, tr + det));
      const minor = 4 * Math.sqrt(Math.max(0, tr - det));
      if (has('ellipse')) {
        sel.set(i, `Major (${u})`, major * k, 40);
        sel.set(i, `Minor (${u})`, minor * k, 41);
        sel.set(i, 'Ellipse angle (°)', axisAngle(Math.cos(0.5 * Math.atan2(2 * m11, m20 - m02)), Math.sin(0.5 * Math.atan2(2 * m11, m20 - m02))), 42);
      }
      if (has('shape')) {
        sel.set(i, 'Circ.', perim > 0 ? Math.min(1, (4 * Math.PI * n) / (perim * perim)) : NaN, 50);
        sel.set(i, 'AR', minor > 0 ? major / minor : NaN, 51);
        sel.set(i, 'Round', major > 0 ? (4 * n) / (Math.PI * major * major) : NaN, 52);
        const hull = polygonArea(convexHull(poly));
        sel.set(i, 'Solidity', hull > 0 ? Math.min(1, n / hull) : NaN, 53);
        const sf = shapeFeatures(r, poly, perim);
        sel.set(i, 'Corners', r.kind === 'ellipse' ? 0 : sf.corners, 54);
        sel.set(i, 'Shape', shapeName(sf), 49);
      }
      if (r.layer) sel.set(i, 'Layer', r.layer, 60);
      if (r.role !== 'background' && n > 0) placed.push({ i, r, c: [cx, cy], poly });
      if (has('eqdiam')) sel.set(i, `Eq. diameter (${u})`, 2 * Math.sqrt(n / Math.PI) * k, 55);
      if (has('box')) {
        const b = minAreaRect(poly);
        // (about square: its turn within 90°, the four sides alike)
        const square = b.width > 0 && b.length / b.width < 1.15;
        const t = square ? b.angle % 90 : b.angle;
        sel.set(i, `Box length (${u})`, b.length * k, 33);
        sel.set(i, `Box width (${u})`, b.width * k, 34);
        sel.set(i, 'Orientation (°)', t, 35);
        if (r.role !== 'background') turns.set(i, { t, n: square ? 4 : 2 });
      }
      intensity(
        chans.map((ch) => under(ch.c, W, wv)),
        area,
      );
      if (has('covered') && mask) sel.set(i, 'Covered (%)', n ? (100 * cov) / n : NaN, 180);
      // a spot: its background
      const bg = r.bg;
      if (bg && bg.mode !== 'none' && r.role !== 'background') {
        let bwin: Window | null = null;
        let fixed = NaN;
        if (bg.mode === 'ring') bwin = ringMask(r, W, H, ox, oy, bg.gap ?? RING_DEFAULTS.gap, bg.width ?? RING_DEFAULTS.width, takenMask());
        else if (bg.mode === 'region') {
          const rr = bg.region ? byId.get(bg.region) : undefined;
          if (rr && isArea(rr)) bwin = winFor(rr);
        } else if (spec.globalBg && byId.get(spec.globalBg) && isArea(byId.get(spec.globalBg)!)) bwin = winFor(byId.get(spec.globalBg)!);
        else fixed = spec.globalValue ?? NaN;
        const s = spots.row();
        spots.set(s, 'Name', r.name, 0);
        spots.set(s, 'Group', r.group ?? '', 1);
        spots.set(s, 'Background', bg.mode === 'ring' ? 'ring' : bg.mode === 'region' ? `region ${bg.region ? (byId.get(bg.region)?.name ?? '?') : '?'}` : 'global', 2);
        spots.set(s, `Area (${u}²)`, area, 3);
        spots.set(s, 'B pixels', bwin ? bwin.m.reduce((a, b) => a + b, 0) : 0, 4);
        const nets: number[] = [];
        chans.forEach((ch, j) => {
          const F = valueStats(under(ch.c, W, wv));
          const B = bwin ? valueStats(under(ch.c, W, bwin)) : { mean: fixed, median: fixed, sd: NaN };
          const b = spec.bgStat === 'mean' ? B.mean : B.median;
          const net = F.mean - b;
          nets.push(net);
          const nm = ch.name;
          const R = 10 + j * 20;
          let satN = 0;
          const fv = under(ch.c, W, wv);
          for (let t = 0; t < fv.length; t++) if (fv[t] >= sat) satN++;
          spots.set(s, `F mean${nm}`, F.mean, R);
          spots.set(s, `F median${nm}`, F.median, R + 1);
          spots.set(s, `B mean${nm}`, B.mean, R + 2);
          spots.set(s, `B median${nm}`, B.median, R + 3);
          spots.set(s, `B SD${nm}`, B.sd, R + 4);
          spots.set(s, `Net${nm}`, net, R + 5);
          spots.set(s, `SNR${nm}`, net / B.sd, R + 6);
          spots.set(s, `Net IntDen${nm}`, net * area, R + 7);
          spots.set(s, `Saturated (%)${nm}`, fv.length ? (100 * satN) / fv.length : NaN, R + 8);
          // (a global background besides a spot's own: both, to compare)
          if (bg.mode !== 'global' && (globalWin || Number.isFinite(spec.globalValue))) {
            const G = globalWin ? valueStats(under(ch.c, W, globalWin)) : { mean: spec.globalValue!, median: spec.globalValue! };
            const g = spec.bgStat === 'mean' ? G.mean : G.median;
            spots.set(s, `B global${nm}`, g, R + 9);
            spots.set(s, `Net global${nm}`, F.mean - g, R + 10);
          }
        });
        if (each) {
          const [a, b] = spec.ratio;
          spots.set(s, `Ratio ${CH_NAMES[a]}/${CH_NAMES[b]}`, nets[a] / nets[b], 90);
          spots.set(s, `log2 ratio ${CH_NAMES[a]}/${CH_NAMES[b]}`, Math.log2(nets[a] / nets[b]), 91);
        }
      }
    } else if (isLine(r)) {
      const pts = (r.pts ?? []).map(([x, y]): Pt => [x - ox, y - oy]);
      const L = pathLength(pts, false);
      sel.set(i, `Length (${u})`, L * k, 12);
      const [a, b] = [pts[0] ?? [0, 0], pts[pts.length - 1] ?? [0, 0]];
      // (ImageJ: from the first point to the last, counterclockwise as seen, −180 to 180)
      sel.set(i, 'Line angle (°)', (Math.atan2(a[1] - b[1], b[0] - a[0]) * 180) / Math.PI, 13);
      const pr = chans.map((ch) => lineProfile(ch.c, W, H, pts, r.width ?? 1));
      intensity(
        pr.map((p) => p.v),
        -1,
      );
      const base = profCol;
      profCol += chans.length + 1;
      pr[0].d.forEach((d, t) => {
        while (prof.n <= t) prof.row();
        prof.set(t, `${r.name} distance (${u})`, d * k, base);
        pr.forEach((p, j) => prof.set(t, `${r.name}${chans[j].name || ' value'}`, p.v[t], base + 1 + j));
      });
    } else if (r.kind === 'angle') {
      const p = r.pts ?? [];
      if (p.length === 3) {
        const a1 = Math.atan2(p[0][1] - p[1][1], p[0][0] - p[1][0]);
        const a2 = Math.atan2(p[2][1] - p[1][1], p[2][0] - p[1][0]);
        let d = Math.abs(a1 - a2);
        if (d > Math.PI) d = 2 * Math.PI - d;
        sel.set(i, 'Angle (°)', (d * 180) / Math.PI, 14);
      }
    } else if (r.kind === 'points') {
      const p = r.pts ?? [];
      sel.set(i, 'Count', p.length, 15);
      p.forEach(([x, y], t) => {
        const j = points.row();
        points.set(j, 'Name', r.name, 0);
        points.set(j, 'Group', r.group ?? '', 1);
        points.set(j, 'Point', t + 1, 2);
        points.set(j, `X (${u})`, (x - ox) * k, 3);
        points.set(j, `Y (${u})`, (y - oy) * k, 4);
        const [px, py] = [Math.floor(x - ox), Math.floor(y - oy)];
        chans.forEach((ch, c) => points.set(j, `Value${ch.name}`, px >= 0 && py >= 0 && px < W && py < H ? ch.c[py * W + px] : NaN, 5 + c));
      });
    }
  }

  // the nearest neighbour of every selection (not of background): in its row, and a Distances sheet
  const dist = new Sheet();
  let nnd: { centre: number[]; n: number } | null = null;
  if (has('nnd') && placed.length > 1) {
    const nn = nearestNeighbours(
      placed.map((x) => x.c),
      placed.map((x) => x.poly),
    );
    placed.forEach((x, t) => {
      const near = nn[t];
      sel.set(x.i, `NND (${u})`, near.centre * k, 60);
      sel.set(x.i, `NND edge (${u})`, near.edge * k, 61);
      const d = dist.row();
      dist.set(d, 'Name', x.r.name, 0);
      dist.set(d, 'Group', x.r.group ?? '', 1);
      dist.set(d, 'Nearest', placed[near.j]?.r.name ?? '', 2);
      dist.set(d, `NND (${u})`, near.centre * k, 3);
      dist.set(d, `NND edge (${u})`, near.edge * k, 4);
    });
    nnd = { centre: nn.map((x) => x.centre * k), n: placed.length };
  }

  // the summary: by group (and all), the selections that are not background — their count, the area they cover
  // together (overlaps once) and the part of it the mask covers, the mean and SD of every measurement; the image
  const selSet = sel.dataset('Selections');
  const sum = new Sheet();
  const groups = [...new Set(q.rois.filter((r) => r.role !== 'background').map((r) => r.group ?? ''))];
  const skip = /^(Name|Group|Type|X|Y|XM|YM|BX|BY) |^(Name|Group|Type|Orientation \(°\)|FeretAngle \(°\)|Ellipse angle \(°\))$/;
  const numeric = selSet.columns.filter((c) => !c.text && !skip.test(c.name));
  const union = (rs: Roi[]) => {
    const m = new Uint8Array(W * H);
    let n = 0;
    let cov = 0;
    for (const r of rs) {
      if (!isArea(r)) continue;
      const wv = winFor(r);
      for (let y = 0; y < wv.h; y++)
        for (let x = 0; x < wv.w; x++) {
          const j = (wv.y0 + y) * W + wv.x0 + x;
          if (!wv.m[y * wv.w + x] || m[j]) continue;
          m[j] = 1;
          n++;
          if (mask && covers(j)) cov++;
        }
    }
    return { n, cov };
  };
  const summaryRow = (label: string, rs: Roi[]) => {
    const s = sum.row();
    sum.set(s, 'Group', label, 0);
    sum.set(s, 'Count', rs.length, 1);
    const un = union(rs);
    sum.set(s, `Area total (${u}²)`, un.n * k * k, 2);
    if (mask) sum.set(s, 'Covered (%)', un.n ? (100 * un.cov) / un.n : NaN, 3);
    const idx = rows.filter((x) => rs.includes(x.roi)).map((x) => x.i);
    numeric.forEach((c, j) => {
      const v = Float64Array.from(idx.map((t) => c.values[t]).filter(Number.isFinite));
      const st = valueStats(v);
      sum.set(s, `${c.name} mean`, st.mean, 10 + 2 * j);
      sum.set(s, `${c.name} SD`, st.sd, 11 + 2 * j);
    });
    // (the turns: their circular mean and how alike they are, with the symmetry most of them have)
    const tt = idx.map((t) => turns.get(t)).filter((x): x is { t: number; n: number } => !!x);
    if (tt.length) {
      const n = tt.filter((x) => x.n === 4).length * 2 >= tt.length ? 4 : 2;
      const al = alignment(
        tt.map((x) => x.t),
        n,
      );
      sum.set(s, 'Orientation mean (°)', al.mean, 6);
      sum.set(s, 'Alignment', al.order, 7);
    }
  };
  const counted = q.rois.filter((r) => r.role !== 'background');
  if (groups.length > 1 || (groups.length === 1 && groups[0] !== '')) for (const g of groups) summaryRow(g || '(no group)', counted.filter((r) => (r.group ?? '') === g));
  if (counted.length) summaryRow('all', counted);
  // (all of them: how evenly they are spread — the CV of their nearest-neighbour distances, Clark–Evans' R in the part
  // analysed)
  if (nnd && sum.n) {
    const s = sum.n - 1;
    const st = valueStats(Float64Array.from(nnd.centre));
    sum.set(s, 'NND CV (%)', (100 * st.sd) / st.mean, 4);
    sum.set(s, 'Clark–Evans R', clarkEvans(st.mean, nnd.n, W * H * k * k, 2 * (W + H) * k), 5);
  }
  let covered = NaN;
  if (mask) {
    let c = 0;
    for (let j = 0; j < W * H; j++) if (covers(j)) c++;
    covered = (100 * c) / (W * H);
    const s = sum.row();
    sum.set(s, 'Group', 'image', 0);
    sum.set(s, `Area total (${u}²)`, W * H * k * k, 2);
    sum.set(s, 'Covered (%)', covered, 3);
  }
  const sheets: Dataset[] = [];
  if (sel.n) sheets.push(selSet);
  if (spots.n) sheets.push(spots.dataset('Spots'));
  if (dist.n) sheets.push(dist.dataset('Distances'));
  if (prof.n) sheets.push(prof.dataset('Profiles'));
  if (points.n) sheets.push(points.dataset('Points'));
  if (sum.n) sheets.push(sum.dataset('Summary'));
  const nSel = q.rois.length;
  const summary = [nSel ? `${nSel} selection${nSel === 1 ? '' : 's'}` : '', Number.isFinite(covered) ? `coverage ${covered.toFixed(1)} %` : ''].filter(Boolean).join(' · ');
  return { book: { name: q.name, sheets }, summary, covered };
}

const kindName = (r: Roi) => ROI_KINDS[r.kind];
// the unit written with µ (as node.ts writes it; not imported from there: it imports this)
const unitName = (u: string) => (/^(um|µm|micron|microns|micrometer)$/i.test(u.trim()) ? 'µm' : u.trim() || 'px');
