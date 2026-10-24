// The Image analysis node: its settings (the image, the editing steps, the calibration, the selections and what is
// measured of them, the figure) and what it gives — the image processed as a matrix (calibrated X and Y), a figure (the
// image on a page, its selections, a scale bar), the measurements as a workbook. Pure: the evaluator (and its worker)
// and the checks run it.
import { cropBox, cropRaster, map1, packPixels, unpackPixels, type Crop, type ImgPixels, type Raster } from './raster.ts';
import { applySteps, type ImgStep } from './steps.ts';
import { measureInputs, measureRois, measureSpec, type MeasureResult, type MeasureSpec } from './measure.ts';
import { trainingExamples } from './classify.ts';
import type { ParticleOpts } from './particles.ts';
import type { MatchOpts, MatchModelSpec } from './match.ts';
import type { RegularShape } from './refine.ts';
import { analyzeNetwork, NETWORK_DEFAULTS, type NetworkResult, type NetworkSpec } from './network.ts';
import { arrange, ARRANGE_DEFAULTS, type ArrangeResult, type ArrangeSpec } from './arrangement.ts';
import { isArea, roiCentre, roiOutline, type Pt, type Roi } from './roi.ts';
import { column, type Column, type Dataset } from '../engine/table.ts';
import { pngDataUrl, toRGBA, type Lut } from './render.ts';
import type { Matrix } from '../engine/matrix.ts';
import type { PageData } from '../types.ts';

// the size of a pixel (in `unit`); line: the line drawn on the scale bar (x1, y1, x2, y2 in pixels) and its length
export type ImageCal = { size: number; unit: string; line?: [number, number, number, number]; length?: number };
export type ScaleBar = { show: boolean; length: number; at: 'br' | 'bl' | 'tr' | 'tl'; color: string; thickness: number; label: boolean; size: number };
// the figure: its width (mm; the height from the image), what it shows (the result; the original; the original with
// the result's mask over it), the colour table of a gray image, its range (NaN: the image's), the scale bar, the
// selections drawn (their outlines, with their names)
export type ImageFigure = { width: number; show: 'result' | 'original' | 'overlay'; lut: Lut; lo: number; hi: number; overlay: string; alpha: number; bar: ScaleBar; rois: 'none' | 'outlines' | 'labels' };
export type ImageAnalysisData = {
  name: string;
  pixels?: ImgPixels;
  pixelsId?: string; // the image's identity (a new id for a new image): the evaluation's cache and the decoded pixels
  steps: ImgStep[];
  // the part of the original analysed (pixels of the original: x, y, w, h; absent: all of it) — the data bar of an
  // electron microscope cut off
  crop?: Crop;
  cal?: ImageCal;
  figure?: Partial<ImageFigure>;
  page?: Partial<PageData>; // the figure's page: its name, dpi, background … (its size from the figure's width)
  rois?: Roi[]; // the selections (in pixels of the original as it came)
  measure?: Partial<MeasureSpec>; // what is measured of them, on which image
  // how particles are found (the group they are put in); Refine: the regular shapes it may make them, snapped to the
  // edges or not
  // layers: the layers of the particles estimated whenever they are found
  particles?: Partial<ParticleOpts> & { group?: string; shapes?: RegularShape[]; snap?: boolean; layers?: boolean };
  // Find like this: its turns, sizes, least similarity; the edges fitted; models: the list of models, each its settings
  match?: Partial<MatchOpts> & { fit?: boolean; models?: MatchModelSpec[] };
  // Structure: the network of the mask (its skeleton's ligaments, junctions, pores) and the changes by hand
  network?: NetworkSpec;
  // Arrangement: how the particles lie (their neighbours, Delaunay, Voronoi, clusters, g(r), Ripley's L)
  arrange?: ArrangeSpec;
  tab?: 'image' | 'objects' | 'structure' | 'results'; // the editor's panel shown last
};
export const BAR_DEFAULTS: ScaleBar = { show: true, length: NaN, at: 'br', color: '#ffffff', thickness: 3, label: true, size: 8 };
export const IMAGE_FIGURE_DEFAULTS: ImageFigure = { width: 80, show: 'result', lut: 'gray', lo: NaN, hi: NaN, overlay: '#ff3b30', alpha: 0.45, bar: BAR_DEFAULTS, rois: 'outlines' };
export const imageFigure = (f?: Partial<ImageFigure>): ImageFigure => ({ ...IMAGE_FIGURE_DEFAULTS, ...f, bar: { ...BAR_DEFAULTS, ...f?.bar } });

// the unit written with µ (“um”, “micron” as µm)
export const unitText = (u: string) => (/^(um|µm|micron|microns|micrometer)$/i.test(u.trim()) ? 'µm' : u.trim() || 'px');

// A round length for a scale bar: 1, 2 or 5 × 10ⁿ, about a fifth of the image's width
export function niceBar(widthUnits: number): number {
  const target = widthUnits / 5;
  if (!(target > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const m = target / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

// The image read and processed: the raster at the end of the steps, the original, every step's note and error; the
// image measured and the mask that covers (measure.ts). Kept for the same image, crop and steps (a selection moved
// measures again, the steps do not run again)
// solid: the last mask of the steps that is not a skeleton or a distance map (what Structure measures)
export type Processed = { base: Raster; out: Raster; notes: Record<string, string>; errors: Record<string, string>; image: Raster; mask: Raster | null; solid: Raster | null };
const processed = new Map<string, { key: string; p: Processed }>();
export function processImage(d: ImageAnalysisData): Processed | null {
  // no image, or its pixels not back yet from the browser's storage
  if (!d.pixels?.data) return null;
  const steps = d.steps ?? [];
  const on = measureSpec(d.measure).on;
  // (the examples of a trainable classifier: in the part analysed)
  const c = cropBox(d.crop, d.pixels.w, d.pixels.h);
  const train = steps.some((s) => s.on && s.kind === 'classify') ? trainingExamples(d.rois ?? [], c?.[0] ?? 0, c?.[1] ?? 0) : [];
  const key = JSON.stringify([d.crop ?? null, steps, on, train]);
  const hit = d.pixelsId ? processed.get(d.pixelsId) : undefined;
  if (hit && hit.key === key) return hit.p;
  const base = cropRaster(unpackPixels(d.pixels, d.pixelsId), d.crop);
  // (what comes into every step: the image after the one before it)
  const ins: Raster[] = [];
  const { r, notes, errors } = applySteps(base, steps, steps.length, (k, x) => (ins[k] = x), 1, { train });
  const outs = steps.map((_, k) => ins[k + 1] ?? r);
  const solidAt = outs.map((o, k) => (o.kind === 'mask' && steps[k].kind !== 'skeleton' && steps[k].kind !== 'distance' ? k : -1)).filter((k) => k >= 0).pop();
  const p: Processed = { base, out: r, notes, errors, ...measureInputs(base, outs, steps, on), solid: solidAt !== undefined ? outs[solidAt] : null };
  if (d.pixelsId) {
    // (a few images kept: those of the nodes worked on)
    processed.delete(d.pixelsId);
    processed.set(d.pixelsId, { key, p });
    if (processed.size > 4) processed.delete(processed.keys().next().value!);
  }
  return p;
}

// The measurements of the node's selections (and the mask's coverage of the image), or null when there is nothing to
// measure
export function imageMeasurements(d: ImageAnalysisData, p: Processed): MeasureResult | null {
  const rois = d.rois ?? [];
  if (!rois.length && !p.mask) return null;
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : { w: p.base.w, h: p.base.h };
  const c = cropBox(d.crop, full.w, full.h);
  return measureRois({ image: p.image, mask: p.mask, ox: c?.[0] ?? 0, oy: c?.[1] ?? 0, cal: d.cal, rois, spec: measureSpec(d.measure), name: `${d.name.replace(/\.[a-z0-9]+$/i, '') || 'image'} measurements` });
}

// Structure: the network of the last mask (its solid), kept while the mask and the settings are the same; a text: why
// there is none
const networks = new WeakMap<Processed, { key: string; res: NetworkResult }>();
export function imageNetwork(d: ImageAnalysisData, p: Processed): NetworkResult | string {
  if (!p.solid) return 'Structure: make a mask in the steps first (a threshold or a trainable classifier).';
  const key = JSON.stringify([d.network ?? {}, d.crop ?? null]);
  const hit = networks.get(p);
  if (hit && hit.key === key) return hit.res;
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : { w: p.base.w, h: p.base.h };
  const c = cropBox(d.crop, full.w, full.h);
  const res = analyzeNetwork(p.solid.ch[0], p.solid.w, p.solid.h, d.network ?? {}, c?.[0] ?? 0, c?.[1] ?? 0);
  networks.set(p, { key, res });
  return res;
}
// its tables: the network's numbers, the ligaments (every branch), the junctions, the pores (in the calibrated unit)
export function networkSheets(r: NetworkResult, d: ImageAnalysisData): Dataset[] {
  const s = { ...NETWORK_DEFAULTS, ...d.network };
  const k = d.cal && d.cal.size > 0 ? d.cal.size : 1;
  const u = d.cal && d.cal.size > 0 ? unitText(d.cal.unit) : 'px';
  const num = (name: string, v: number[]) => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const B = r.branches;
  const mid = (b: NetworkResult['branches'][number]) => b.path[b.path.length >> 1] ?? [NaN, NaN];
  const TYPE = { junction: 'junction–junction', end: 'junction–end', free: 'end–end', loop: 'loop' };
  const ligaments: Dataset = {
    name: 'Ligaments',
    columns: [
      txt('Ligament', B.map((b) => `L${b.id + 1}`)),
      txt('Type', B.map((b) => TYPE[b.type])),
      txt('From', B.map((b) => `J${b.a + 1}`)),
      txt('To', B.map((b) => `J${b.b + 1}`)),
      num(`Length (${u})`, B.map((b) => b.length * k)),
      num(`Surface length (${u})`, B.map((b) => b.surface * k)),
      num(`Diameter (${u})`, B.map((b) => b.diameter * k)),
      num(`Mean diameter (${u})`, B.map((b) => b.mean * k)),
      num(`Neck (${u})`, B.map((b) => b.neck * k)),
      num('Straightness', B.map((b) => b.straight)),
      num('Angle (°)', B.map((b) => b.angle)),
      txt('Counted', B.map((b) => (b.counted ? 'yes' : 'no'))),
      txt('Edge', B.map((b) => (b.edge ? 'yes' : ''))),
      txt('By hand', B.map((b) => [b.hand ? '✎' : '', b.keep ? 'kept' : '', b.excl ? 'left out' : ''].filter(Boolean).join(' '))),
      num(`X (${u})`, B.map((b) => mid(b)[0] * k)),
      num(`Y (${u})`, B.map((b) => mid(b)[1] * k)),
    ],
  };
  const junctions: Dataset = {
    name: 'Junctions',
    columns: [
      txt('Node', r.nodes.map((n) => `J${n.id + 1}`)),
      num(`X (${u})`, r.nodes.map((n) => n.x * k)),
      num(`Y (${u})`, r.nodes.map((n) => n.y * k)),
      num('Degree', r.nodes.map((n) => n.degree)),
      num(`Diameter (${u})`, r.nodes.map((n) => 2 * n.r * k)),
      txt('Edge', r.nodes.map((n) => (n.edge ? 'yes' : ''))),
      txt('By hand', r.nodes.map((n) => (n.hand ? '✎' : ''))),
    ],
  };
  const P = r.pores;
  const pores: Dataset = {
    name: 'Pores',
    columns: [
      txt('Pore', P.map((p) => `P${p.id + 1}`)),
      num(`X (${u})`, P.map((p) => p.x * k)),
      num(`Y (${u})`, P.map((p) => p.y * k)),
      num(`Area (${u}²)`, P.map((p) => p.area * k * k)),
      num(`Equivalent diameter (${u})`, P.map((p) => p.eq * k)),
      num(`Inscribed diameter (${u})`, P.map((p) => p.inscribed * k)),
      txt('Edge', P.map((p) => (p.edge ? 'yes' : ''))),
    ],
  };
  // (the numbers: of the ligaments counted — both ends junctions, not left out, off the edge when asked)
  const C = B.filter((b) => b.counted);
  const L = C.map((b) => (s.measure === 'surface' ? b.surface : b.length) * k);
  const D = C.map((b) => b.diameter * k).filter(Number.isFinite);
  const stat = (v: number[]) => {
    const n = v.length;
    const mean = n ? v.reduce((a, b) => a + b, 0) / n : NaN;
    const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
    const sorted = [...v].sort((a, b) => a - b);
    return { mean, sd, median: n ? sorted[n >> 1] : NaN };
  };
  const [sl, sd] = [stat(L), stat(D)];
  const area = r.w * r.h * k * k;
  const inner = P.filter((p) => !p.edge).map((p) => p.inscribed * k);
  const junctionCount = r.nodes.filter((n) => n.degree >= 3).length;
  const rows: [string, number, string][] = [
    ['Solid fraction', r.solid, ''],
    ['Ligaments counted', C.length, ''],
    ['Junctions', junctionCount, ''],
    [`Ligament length, mean (${s.measure === 'surface' ? 'surface to surface' : 'centre to centre'})`, sl.mean, u],
    ['Ligament length, SD', sl.sd, u],
    ['Ligament length, median', sl.median, u],
    ['Ligament diameter, mean', sd.mean, u],
    ['Ligament diameter, SD', sd.sd, u],
    ['Ligament diameter, median', sd.median, u],
    ['Skeleton length per area', (B.reduce((a, b) => a + b.length, 0) * k) / area, `${u}⁻¹`],
    ['Junctions per area', junctionCount / area, `${u}⁻²`],
    ['Pores inside the image', inner.length, ''],
    ['Pore inscribed diameter, mean', stat(inner).mean, u],
    ['Spurs cut', r.pruned, ''],
  ];
  const network: Dataset = { name: 'Network', columns: [txt('Quantity', rows.map((q) => q[0])), num('Value', rows.map((q) => q[1])), txt('Unit', rows.map((q) => q[2]))] };
  return [network, ligaments, junctions, pores];
}

// Arrangement: of the particles (every selection of an area, not of background, not an example; of the group asked),
// kept while the selections and the settings are the same; null: fewer than 3
const arrangements = new WeakMap<Processed, { key: string; res: ArrangeResult; names: string[]; groups: string[] }>();
export function imageArrangement(d: ImageAnalysisData, p: Processed): { res: ArrangeResult; names: string[]; groups: string[] } | null {
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : { w: p.base.w, h: p.base.h };
  const c = cropBox(d.crop, full.w, full.h);
  const [ox, oy] = [c?.[0] ?? 0, c?.[1] ?? 0];
  const group = d.arrange?.group ?? '';
  const parts = (d.rois ?? []).filter((r) => isArea(r) && !r.train && r.role !== 'background' && !r.hidden && (!group || (r.group ?? '') === group));
  if (parts.length < 3) return null;
  const key = JSON.stringify([d.arrange ?? {}, d.crop ?? null, parts.map((r) => [r.id, r.kind, r.box, r.pts?.length, r.pts?.[0], r.angle])]);
  const hit = arrangements.get(p);
  if (hit && hit.key === key) return hit;
  const res = arrange(
    parts.map((r) => {
      const [cx, cy] = roiCentre(r);
      return { name: r.name, group: r.group, c: [cx - ox, cy - oy] as Pt, poly: roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy]) };
    }),
    p.base.w,
    p.base.h,
    d.arrange ?? {},
  );
  const out = { key, res, names: parts.map((r) => r.name), groups: parts.map((r) => r.group ?? '') };
  arrangements.set(p, out);
  return out;
}
// its tables: every particle's neighbours, the numbers of all of them, g(r), Ripley's L(r) − r with the band at random,
// the nearest-neighbour distances against those at random (in the calibrated unit)
export function arrangementSheets(a: { res: ArrangeResult; names: string[]; groups: string[] }, d: ImageAnalysisData): Dataset[] {
  const { res } = a;
  const s = { ...ARRANGE_DEFAULTS, ...d.arrange };
  const k = d.cal && d.cal.size > 0 ? d.cal.size : 1;
  const u = d.cal && d.cal.size > 0 ? unitText(d.cal.unit) : 'px';
  const num = (name: string, v: number[]) => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const R = res.rows;
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : null;
  const c = full ? cropBox(d.crop, full.w, full.h) : null;
  const [ox, oy] = [c?.[0] ?? 0, c?.[1] ?? 0];
  const parts = (d.rois ?? []).filter((r) => isArea(r) && !r.train && r.role !== 'background' && !r.hidden && (!d.arrange?.group || (r.group ?? '') === d.arrange.group));
  const xy = parts.map((r) => roiCentre(r));
  const neighbours: Dataset = {
    name: 'Neighbours',
    columns: [
      txt('Name', a.names),
      txt('Group', a.groups),
      num(`X (${u})`, xy.map((q) => (q[0] - ox) * k)),
      num(`Y (${u})`, xy.map((q) => (q[1] - oy) * k)),
      txt('Nearest', R.map((r) => a.names[r.nearest] ?? '')),
      num(`NND (${u})`, R.map((r) => r.nnd * k)),
      num(`NND edge (${u})`, R.map((r) => r.edge * k)),
      num(`Mean of ${s.k} nearest (${u})`, R.map((r) => r.knn * k)),
      num('Neighbours (Delaunay)', R.map((r) => r.coord)),
      num(`Voronoi area (${u}²)`, R.map((r) => r.cell * k * k)),
      num('ψ6', R.map((r) => r.psi6)),
      num('Cluster', R.map((r) => r.cluster)),
      num('Cluster size', R.map((r) => r.clusterSize)),
      txt('Edge', R.map((r) => (r.onEdge ? 'yes' : ''))),
    ],
  };
  const m = res.summary;
  const how = !Number.isFinite(m.R) ? '' : m.p >= 0.05 ? 'random (no difference)' : m.R < 1 ? 'clustered' : 'regular';
  const rows: [string, number, string][] = [
    ['Particles', m.n, ''],
    ['Density', m.density / (k * k), `${u}⁻²`],
    ['NND, mean', m.nnd * k, u],
    ['NND, SD', m.nndSd * k, u],
    ['NND, CV', (100 * m.nndSd) / m.nnd, '%'],
    ['NND edge to edge, mean', m.edge * k, u],
    ['Clark–Evans R', m.R, ''],
    ['Clark–Evans z', m.z, ''],
    ['Clark–Evans p', m.p, ''],
    ['Neighbours (Delaunay), mean', m.coord, ''],
    ['Voronoi area CV', m.cellCv, ''],
    ['ψ6, mean', m.psi6, ''],
    ['Clusters', m.clusters, ''],
    ['Isolated particles', m.isolated, ''],
    ['Cluster size, mean', m.meanCluster, ''],
    ['Largest cluster', m.largest, ''],
    ['g(r) first peak', m.peak * k, u],
  ];
  const summary: Dataset = { name: 'Arrangement', columns: [txt('Quantity', [...rows.map((q) => q[0]), 'Pattern']), num('Value', [...rows.map((q) => q[1]), NaN]), txt('Unit', [...rows.map((q) => q[2]), how])] };
  const g: Dataset = { name: 'g(r)', columns: [{ ...num(`r (${u})`, res.g.r.map((v) => v * k)), role: 'x' }, { ...num('g(r)', res.g.g), role: 'y' }] };
  const L: Dataset = {
    name: 'Ripley L',
    columns: [
      { ...num(`r (${u})`, res.L.r.map((v) => v * k)), role: 'x' },
      { ...num(`L(r) − r (${u})`, res.L.L.map((v) => v * k)), role: 'y' },
      { ...num(`At random, low (${u})`, res.L.lo.map((v) => v * k)), role: 'y' },
      { ...num(`At random, high (${u})`, res.L.hi.map((v) => v * k)), role: 'y' },
    ],
  };
  const h: Dataset = {
    name: 'NND distribution',
    columns: [{ ...num(`NND (${u})`, res.nndHist.r.map((v) => v * k)), role: 'x' }, { ...num('Count', res.nndHist.count), role: 'y' }, { ...num('At random', res.nndHist.csr), role: 'y' }],
  };
  return [summary, neighbours, g, L, h];
}

// the result as a matrix: gray (RGB: its luminance), X and Y of every column and row in the calibrated unit
export function imageMatrix(r: Raster, name: string, cal?: ImageCal): Matrix {
  const c = r.ch.length === 1 ? r.ch[0] : map1(r.ch[0], (v, i) => 0.299 * v + 0.587 * r.ch[1][i] + 0.114 * r.ch[2][i]);
  const k = cal && cal.size > 0 ? cal.size : 1;
  const u = cal && cal.size > 0 ? unitText(cal.unit) : 'px';
  return {
    name,
    rows: r.h,
    cols: r.w,
    v: Float64Array.from(c),
    xs: Array.from({ length: r.w }, (_, j) => +(j * k).toPrecision(12)),
    ys: Array.from({ length: r.h }, (_, i) => +(i * k).toPrecision(12)),
    xName: `X (${u})`,
    yName: `Y (${u})`,
  };
}

// The pixels the figure shows (RGBA) and its scale bar: what it shows, through its colour table
export function figurePixels(p: { base: Raster; out: Raster }, f: ImageFigure): Uint8ClampedArray {
  const lim = (r: Raster) => ({ lo: Number.isFinite(f.lo) ? f.lo : r.lo, hi: Number.isFinite(f.hi) ? f.hi : r.hi });
  if (f.show === 'original') return toRGBA(p.base, { lut: f.lut, ...lim(p.base) });
  if (f.show === 'overlay' && p.out.kind === 'mask') return toRGBA(p.out, { under: p.base, lut: f.lut, color: f.overlay, alpha: f.alpha });
  return toRGBA(p.out, { lut: f.lut, ...lim(p.out) });
}

// the PNG of the figure's image, kept for the same raster and settings (a figure drawn again is not encoded again)
const pngs = new WeakMap<Raster, { key: string; url: string }>();
export function figurePng(p: { base: Raster; out: Raster }, f: ImageFigure): string {
  const key = JSON.stringify([f.show, f.lut, f.lo, f.hi, f.overlay, f.alpha]);
  const hit = pngs.get(p.out);
  if (hit && hit.key === key) return hit.url;
  const url = pngDataUrl(figurePixels(p, f), p.out.w, p.out.h);
  pngs.set(p.out, { key, url });
  return url;
}

// The scale bar on the page (mm): its line (x1, y1, x2, y2) and its label's place, or null (no calibration, hidden)
export function scaleBarPlace(w: number, h: number, pageW: number, cal: ImageCal | undefined, bar: ScaleBar): { len: number; x1: number; x2: number; y: number; tx: number; ty: number; text: string } | null {
  if (!bar.show || !cal || !(cal.size > 0)) return null;
  const units = w * cal.size;
  const len = bar.length > 0 ? bar.length : niceBar(units);
  const mmPerUnit = pageW / units;
  const L = len * mmPerUnit;
  const pageH = (pageW * h) / w;
  const m = pageW * 0.04;
  const right = bar.at === 'br' || bar.at === 'tr';
  const bottom = bar.at === 'br' || bar.at === 'bl';
  const x1 = right ? pageW - m - L : m;
  const textGap = bar.label ? (bar.size * 25.4) / 72 + 0.8 : 0;
  const y = bottom ? pageH - m : m + textGap;
  return { len, x1, x2: x1 + L, y, tx: x1 + L / 2, ty: bottom ? y - (bar.thickness * 25.4) / 72 / 2 - 0.6 : y - (bar.thickness * 25.4) / 72 / 2 - 0.6, text: `${+len.toPrecision(6)} ${unitText(cal.unit)}` };
}

export { packPixels };
