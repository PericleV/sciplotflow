// The Image analysis node: its settings (the image, the editing steps, the calibration, the selections and what is
// measured of them, the figure) and what it gives — the image processed as a matrix (calibrated X and Y), a figure (the
// image on a page, its selections, a scale bar), the measurements as a workbook. Pure: the evaluator (and its worker)
// and the checks run it.
import { cropBox, cropRaster, map1, packPixels, unpackPixels, type Crop, type ImgPixels, type Raster } from './raster.ts';
import { applySteps, type ImgStep } from './steps.ts';
import { measureInputs, measureRois, measureSpec, type MeasureResult, type MeasureSpec } from './measure.ts';
import { trainingExamples, trainKeyOf } from './classify.ts';
import { paintExamples, type PaintStored } from './paint.ts';
import type { ParticleOpts } from './particles.ts';
import type { MatchExample, MatchOpts, MatchModelSpec, MatchRejected } from './match.ts';
import type { LearnMethod } from './learn.ts';
import type { RegularShape } from './refine.ts';
import type { SamModel, SamOpts } from './sam.ts';
import { analyzeNetwork, NETWORK_DEFAULTS, type NetworkResult, type NetworkSpec } from './network.ts';
import { arrange, ARRANGE_DEFAULTS, type ArrangeResult, type ArrangeSpec } from './arrangement.ts';
import { radialSpectrum } from './fft2d.ts';
import { matchRings, patternCentre, planeAngle, profilePeriod, radialProfile, ringsOf, spotOf, type LatticeSpec } from './lattice.ts';
import { lineProfile } from './measure.ts';
import { arealParams, autocorrelation, heightHistogram, LENGTH_NM, profileParams, radialPSD, regionHeight, type Areal, type ProfileR, type SurfaceSpec } from './surface.ts';
import { isArea, isLine, roiCentre, roiMask, roiOutline, type Pt, type Roi } from './roi.ts';
import { astmG, boxCounting, grainsPerMm2, intercepts, orientation, orientationColours, type Orientation, type TextureSpec } from './texture.ts';
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
  // Find like this: its turns, sizes, least similarity; the edges fitted (inside: only inside the margin drawn); models:
  // the list of models, each its settings; image: the step whose image is compared (absent: the last that is not a
  // mask); useRejected: the particles left out in Review kept (rejected: their places, pixels of the original, by the
  // model they were found by) and the places like them dropped; learn: the classifier of Review (method; examples:
  // the particles said good or not; pmin: the least probability kept); truth: the group of the particles marked as true
  // (Accuracy)
  // showArea: the area compared drawn around every particle found; grow: the margin of a model picked with Segment
  // anything, its outline widened by it (px)
  match?: Partial<MatchOpts> & { fit?: boolean; inside?: boolean; models?: MatchModelSpec[]; outer?: Pt[]; image?: string; useRejected?: boolean; rejected?: MatchRejected[]; learn?: boolean; method?: LearnMethod | 'auto'; examples?: MatchExample[]; pmin?: number; truth?: string; showArea?: boolean; grow?: number };
  // Structure: the network of the mask (its skeleton's ligaments, junctions, pores) and the changes by hand
  network?: NetworkSpec;
  // Arrangement: how the particles lie (their neighbours, Delaunay, Voronoi, clusters, g(r), Ripley's L)
  arrange?: ArrangeSpec;
  tab?: 'image' | 'objects' | 'structure' | 'lattice' | 'surface' | 'results'; // the editor's panel shown last (All tools)
  // the editor's task (its numbered steps on the left; all: every panel, as the tabs of before; absent: from the tab
  // shown last), the step of it open, the way particles are found (Particles ▸ Find)
  task?: 'particles' | 'spots' | 'network' | 'lattice' | 'surface' | 'all';
  stage?: number;
  find?: 'threshold' | 'classifier' | 'like' | 'sam' | 'rays';
  // Segment anything: the model, how it is asked (a click, a box, every particle), the settings of Everything
  sam?: Partial<SamOpts> & { model?: SamModel; prompt?: 'click' | 'box' | 'all' };
  // the paint of the trainable classifier (every pixel of the original its class: the brush, the eraser, the fill)
  paint?: PaintStored;
  // Review of the particles of any way but Find like this: Learn from my choices (its method, the least probability
  // kept), the least Segment anything must be sure of a particle
  review?: { learn?: boolean; method?: LearnMethod | 'auto'; pmin?: number; sure?: number };
  // Frequency: the spectrum shown instead of the image (log or linear, a Hann window, of the result or the original);
  // radial: its radial average in the workbook
  fft?: { show?: boolean; log?: boolean; hann?: boolean; of?: 'result' | 'original'; radial?: boolean };
  // Lattice: the spots picked in the spectrum, the fringes, a diffraction pattern's rings and phases
  lattice?: LatticeSpec;
  // Surface: the image as heights (their unit), its roughness, the distributions, a step
  surface?: SurfaceSpec;
  // Structure ▸ grain size (ASTM E112), orientation, fractal dimension
  texture?: TextureSpec;
  // Calibration ▸ the scale bar read from the image (proposed, never applied without Accept); done: the image (its
  // pixelsId) whose proposal was accepted or rejected
  barRead?: { on?: boolean; done?: string };
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
  const train = steps.some((s) => s.on && s.kind === 'classify') ? [...trainingExamples(d.rois ?? [], c?.[0] ?? 0, c?.[1] ?? 0), ...paintExamples(d.paint, c)] : [];
  const key = JSON.stringify([d.crop ?? null, steps, on, trainKeyOf(train)]);
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
  const parts = (d.rois ?? []).filter((r) => isArea(r) && !r.train && !r.out && r.role !== 'background' && !r.hidden && (!group || (r.group ?? '') === group));
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
  const parts = (d.rois ?? []).filter((r) => isArea(r) && !r.train && !r.out && r.role !== 'background' && !r.hidden && (!d.arrange?.group || (r.group ?? '') === d.arrange.group));
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

// The radial spectrum of the result (Image ▸ View): k, its power and d = 1/k (in the calibrated unit), the strongest
// peak's distance
export function radialSheet(d: ImageAnalysisData, p: Processed): Dataset {
  const r = p.out;
  const g = r.ch.length === 1 ? r.ch[0] : map1(r.ch[0], (v, i) => 0.299 * v + 0.587 * r.ch[1][i] + 0.114 * r.ch[2][i]);
  const rs = radialSpectrum(g, r.w, r.h, d.fft?.hann ?? true);
  const k = d.cal && d.cal.size > 0 ? d.cal.size : 1;
  const u = d.cal && d.cal.size > 0 ? unitText(d.cal.unit) : 'px';
  return {
    name: 'Radial spectrum',
    columns: [
      { ...column(`k (1/${u})`, Float64Array.from(rs.k, (x) => x / k)), role: 'x' },
      { ...column('Power', Float64Array.from(rs.power)), role: 'y' },
      { ...column(`d (${u})`, Float64Array.from(rs.k, (x) => k / x)), role: 'none' },
      { ...column(`Peak d (${u})`, Float64Array.from(rs.k, (_, i) => (i ? NaN : rs.peakD * k))), role: 'none' },
    ],
  };
}

// Lattice: what the node's settings ask of the result — the spots' distances and directions (and the angles between
// them), the period of the fringes along every line selection, a diffraction pattern's rings matched with phases —
// as sheets, and what is drawn over the image (the pattern's centre and its rings)
const NM: Record<string, number> = { nm: 1, Å: 0.1, A: 0.1, pm: 0.001, µm: 1000, um: 1000, mm: 1e6 };
export type LatticeView = { centre?: Pt; rings?: number[]; labels?: string[]; ringRows?: { d: number; phase: string; hkl: string; err: number }[]; fringes?: { name: string; period: number; count: number }[] };
export function latticeSheets(d: ImageAnalysisData, p: Processed): { sheets: Dataset[]; view: LatticeView; warnings: string[] } {
  const L = d.lattice ?? {};
  const k = d.cal && d.cal.size > 0 ? d.cal.size : 1;
  const u = d.cal && d.cal.size > 0 ? unitText(d.cal.unit) : 'px';
  const num = (name: string, v: number[]) => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const sheets: Dataset[] = [];
  const view: LatticeView = {};
  const warnings: string[] = [];
  const r = p.out;
  const g = r.ch.length === 1 ? r.ch[0] : map1(r.ch[0], (v, i) => 0.299 * v + 0.587 * r.ch[1][i] + 0.114 * r.ch[2][i]);
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : { w: r.w, h: r.h };
  const crop = cropBox(d.crop, full.w, full.h);
  const [ox, oy] = [crop?.[0] ?? 0, crop?.[1] ?? 0];
  // (the spots: their d in the calibrated unit, their directions; the angles between every two)
  const spots = (L.spots ?? []).map(([fx, fy]) => spotOf(fx, fy));
  if (spots.length) {
    sheets.push({
      name: 'FFT spots',
      columns: [
        txt('Spot', spots.map((_, i) => `S${i + 1}`)),
        num(`fx (1/${u})`, spots.map((s) => s.fx / k)),
        num(`fy (1/${u})`, spots.map((s) => -s.fy / k)),
        num(`d (${u})`, spots.map((s) => s.d * k)),
        num('Direction (°)', spots.map((s) => s.angle)),
      ],
    });
    if (spots.length > 1) {
      const pairs: [number, number][] = [];
      spots.forEach((_, i) => spots.forEach((__, j) => j > i && pairs.push([i, j])));
      sheets.push({ name: 'Spot angles', columns: [txt('Spots', pairs.map(([i, j]) => `S${i + 1}–S${j + 1}`)), num('Angle (°)', pairs.map(([i, j]) => planeAngle(spots[i], spots[j])))] });
    }
  }
  // (the fringes along every line selection: the period of its profile)
  if (L.fringes) {
    const lines = (d.rois ?? []).filter((q) => isLine(q) && !q.hidden && (q.pts?.length ?? 0) >= 2);
    if (!lines.length) warnings.push('Lattice: draw a line across the fringes first (a line selection).');
    const rows = lines.map((q) => {
      const pts = q.pts!.map(([x, y]): Pt => [x - ox, y - oy]);
      const prof = lineProfile(g, r.w, r.h, pts, q.width ?? 1);
      const len = prof.d[prof.d.length - 1] ?? 0;
      const per = profilePeriod(prof.v, prof.d.length > 1 ? prof.d[1] - prof.d[0] : 1);
      return { name: q.name, len, period: per, count: per > 0 ? len / per : NaN };
    });
    view.fringes = rows.map((q) => ({ name: q.name, period: q.period * k, count: q.count }));
    if (rows.length) sheets.push({ name: 'Fringes', columns: [txt('Line', rows.map((q) => q.name)), num(`Length (${u})`, rows.map((q) => q.len * k)), num(`Period (${u})`, rows.map((q) => q.period * k)), num('Fringes', rows.map((q) => q.count))] });
  }
  // (a diffraction pattern: its centre, its rings; d from the reciprocal size of a pixel; matched with the phases)
  if (L.saed) {
    const c0 = L.centre ? ([L.centre[0] - ox, L.centre[1] - oy] as Pt) : patternCentre(g, r.w, r.h);
    const rp = radialProfile(g, r.w, r.h, c0[0], c0[1]);
    const rings = ringsOf(rp);
    const recip = L.recip && L.recip > 0 ? L.recip : NaN;
    const ds = rings.map((R) => 1 / (R * recip));
    // (in nm for the phases; the d given in the calibration's unit)
    const toNm = NM[u] ?? NaN;
    const own = (L.own ?? '').split(/[\s,;]+/).map(Number).filter((x) => x > 0).map((x) => x * toNm);
    const match = Number.isFinite(recip) && Number.isFinite(toNm) ? matchRings(ds.map((x) => x * toNm), L.phases ?? [], own) : [];
    if (L.saed && !Number.isFinite(recip)) warnings.push('Lattice: give the reciprocal size of a pixel (1 px = … 1/unit) for the rings’ d.');
    view.centre = [c0[0] + ox, c0[1] + oy];
    view.rings = rings;
    view.labels = rings.map((_, i) => (match[i]?.phase ? `${match[i].phase} ${match[i].hkl}` : ''));
    view.ringRows = rings.map((_, i) => ({ d: ds[i], phase: match[i]?.phase ?? '', hkl: match[i]?.hkl ?? '', err: match[i]?.err ?? NaN }));
    sheets.push({
      name: 'Rings',
      columns: [
        txt('Ring', rings.map((_, i) => `R${i + 1}`)),
        num('Radius (px)', rings),
        num(`Radius (1/${u})`, rings.map((R) => R * recip)),
        num(`d (${u})`, ds),
        num('Ratio to the first', rings.map((R) => R / rings[0])),
        txt('Phase', match.map((m) => m.phase)),
        txt('hkl', match.map((m) => m.hkl)),
        num(`d ref (${u})`, match.map((m) => m.dRef / toNm)),
        num('Error (%)', match.map((m) => m.err)),
      ],
    });
    sheets.push({ name: 'Radial profile', columns: [{ ...num('r (px)', rp.r), role: 'x' }, { ...num('Mean', rp.mean), role: 'y' }] });
  }
  return { sheets, view, warnings };
}

// Surface: the image as heights (its values × zScale, in zUnit): the areal roughness of it and of its area
// selections, the roughness along its lines, the histogram of the heights, the PSD, the autocorrelation, the step
// between two selections; as sheets, and what its panel shows
export type SurfaceView = {
  areal?: (Areal & { name: string })[];
  profiles?: (Omit<ProfileR, 'mean'> & { name: string; len: number })[];
  acf?: { lcorr: number; Sal: number; Str: number };
  step?: { a: string; b: string; ma: number; mb: number; sa: number; sb: number };
};
const surfaceKept = new WeakMap<Float32Array, { key: string; psd?: ReturnType<typeof radialPSD>; acf?: ReturnType<typeof autocorrelation> }>();
// the heights: the result (a mask: the image it was made from), gray, × zScale
export function surfaceHeights(d: ImageAnalysisData, p: Processed): Raster {
  const src = p.out.kind !== 'mask' ? p.out : p.image;
  const g = src.ch.length === 1 ? src.ch[0] : map1(src.ch[0], (v, i) => 0.299 * v + 0.587 * src.ch[1][i] + 0.114 * src.ch[2][i]);
  const zs = d.surface?.zScale && d.surface.zScale > 0 ? d.surface.zScale : 1;
  const ch = zs === 1 ? g : map1(g, (v) => v * zs);
  return { ...src, ch: [ch], kind: 'gray', lo: src.lo * zs, hi: src.hi * zs };
}
export function surfaceSheets(d: ImageAnalysisData, p: Processed): { sheets: Dataset[]; view: SurfaceView; warnings: string[] } {
  const S = d.surface ?? {};
  const hr = surfaceHeights(d, p);
  const [z, w, h] = [hr.ch[0], hr.w, hr.h];
  const k = d.cal && d.cal.size > 0 ? d.cal.size : 1;
  const u = d.cal && d.cal.size > 0 ? unitText(d.cal.unit) : 'px';
  const zu = S.zUnit?.trim() ?? '';
  const Z = (name: string) => (zu ? `${name} (${zu})` : name);
  const num = (name: string, v: number[]) => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const first = (n: number, v: number) => Array.from({ length: n }, (_, i) => (i ? NaN : v));
  const sheets: Dataset[] = [];
  const view: SurfaceView = {};
  const warnings: string[] = [];
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : { w, h };
  const crop = cropBox(d.crop, full.w, full.h);
  const [ox, oy] = [crop?.[0] ?? 0, crop?.[1] ?? 0];
  const insideOf = (r: Roi) => {
    const m = roiMask(r, w, h, ox, oy);
    return (x: number, y: number) => x >= m.x0 && y >= m.y0 && x < m.x0 + m.w && y < m.y0 + m.h && m.m[(y - m.y0) * m.w + x - m.x0] === 1;
  };
  const areas = (d.rois ?? []).filter((r) => isArea(r) && !r.hidden && !r.train && !r.out);
  // (a difference of heights between neighbours as a slope: the heights and the pixel both lengths)
  const slope = zu in LENGTH_NM && u in LENGTH_NM ? LENGTH_NM[zu] / LENGTH_NM[u] / k : NaN;
  if (S.areal) {
    if (!Number.isFinite(slope)) warnings.push('Surface: Sdq and Sdr need the heights and the calibration both in units of length.');
    const rows = [{ name: 'Image', ...arealParams(z, w, h, null, slope) }, ...areas.map((r) => ({ name: r.name, ...arealParams(z, w, h, insideOf(r), slope) }))];
    view.areal = rows;
    const col = (key: keyof Areal) => rows.map((q) => q[key]);
    sheets.push({
      name: 'Roughness',
      columns: [txt('Region', rows.map((q) => q.name)), num(`Area (${u}²)`, rows.map((q) => q.n * k * k)), num(Z('Mean'), col('mean')), num(Z('Sa'), col('Sa')), num(Z('Sq'), col('Sq')), num(Z('Sp'), col('Sp')), num(Z('Sv'), col('Sv')), num(Z('Sz'), col('Sz')), num('Ssk', col('Ssk')), num('Sku', col('Sku')), num('Sdq', col('Sdq')), num('Sdr (%)', col('Sdr'))],
    });
  }
  if (S.profile) {
    const lines = (d.rois ?? []).filter((q) => isLine(q) && !q.hidden && (q.pts?.length ?? 0) >= 2);
    if (!lines.length) warnings.push('Surface: draw a line for the profile roughness first (a line selection).');
    const lc = S.lc && S.lc > 0 ? S.lc : NaN;
    const rows = lines.map((q) => {
      const prof = lineProfile(z, w, h, q.pts!.map(([x, y]): Pt => [x - ox, y - oy]), q.width ?? 1);
      const step = (prof.d.length > 1 ? prof.d[1] - prof.d[0] : 1) * k;
      const { mean: _m, ...r } = profileParams(prof.v, step, lc);
      return { name: q.name, len: (prof.d[prof.d.length - 1] ?? 0) * k, ...r };
    });
    if (rows.some((q) => Number.isFinite(lc) && q.len < 2.5 * lc)) warnings.push('Surface: a profile shorter than 2.5 λc: its mean line is mostly the profile itself (a shorter λc).');
    view.profiles = rows;
    if (rows.length) {
      const col = (key: 'len' | 'Ra' | 'Rq' | 'Rp' | 'Rv' | 'Rt' | 'Rz' | 'Rsk' | 'Rku') => rows.map((q) => q[key]);
      sheets.push({ name: 'Profile roughness', columns: [txt('Line', rows.map((q) => q.name)), num(`Length (${u})`, col('len')), num(`λc (${u})`, rows.map(() => lc)), num(Z('Ra'), col('Ra')), num(Z('Rq'), col('Rq')), num(Z('Rp'), col('Rp')), num(Z('Rv'), col('Rv')), num(Z('Rt'), col('Rt')), num(Z('Rz'), col('Rz')), num('Rsk', col('Rsk')), num('Rku', col('Rku'))] });
    }
  }
  if (S.hist) {
    const hg = heightHistogram(z, S.bins ?? 100);
    sheets.push({ name: 'Height histogram', columns: [{ ...num(Z('Height'), hg.at), role: 'x' }, { ...num('Count', hg.count), role: 'y' }, { ...num(zu ? `Density (1/${zu})` : 'Density', hg.density), role: 'none' }, { ...num('Material ratio (%)', hg.ratio), role: 'none' }] });
  }
  // (the PSD and the autocorrelation: kept for the same heights)
  const key = JSON.stringify([k]);
  const kept = surfaceKept.get(z);
  const cache = kept && kept.key === key ? kept : { key };
  if (S.psd) {
    cache.psd ??= radialPSD(z, w, h, k);
    const ps = cache.psd;
    sheets.push({ name: 'PSD', columns: [{ ...num(`k (1/${u})`, ps.k), role: 'x' }, { ...num(zu ? `PSD (${zu}²·${u}²)` : `PSD (${u}²)`, ps.psd), role: 'y' }] });
  }
  if (S.acf) {
    cache.acf ??= autocorrelation(z, w, h, k);
    const ac = cache.acf;
    view.acf = { lcorr: ac.lcorr, Sal: ac.Sal, Str: ac.Str };
    const n = ac.r.length;
    sheets.push({ name: 'ACF', columns: [{ ...num(`r (${u})`, ac.r), role: 'x' }, { ...num('ACF', ac.acf), role: 'y' }, { ...num(`Correlation length (${u})`, first(n, ac.lcorr)), role: 'none' }, { ...num(`Sal (${u})`, first(n, ac.Sal)), role: 'none' }, { ...num('Str', first(n, ac.Str)), role: 'none' }] });
  }
  surfaceKept.set(z, cache);
  if (S.step) {
    const [A, B] = S.step.map((id) => areas.find((r) => r.id === id));
    if (!A || !B) warnings.push('Surface: choose the two area selections of the step.');
    else {
      const [a, b] = [regionHeight(z, w, h, insideOf(A)), regionHeight(z, w, h, insideOf(B))];
      view.step = { a: A.name, b: B.name, ma: a.mean, mb: b.mean, sa: a.sd, sb: b.sd };
      sheets.push({ name: 'Step height', columns: [txt('Selection', [A.name, B.name, 'Step']), num(Z('Mean'), [a.mean, b.mean, a.mean - b.mean]), num(Z('SD'), [a.sd, b.sd, NaN]), num(Z('SE'), [a.sd / Math.sqrt(a.n || 1), b.sd / Math.sqrt(b.n || 1), Math.hypot(a.sd / Math.sqrt(a.n || 1), b.sd / Math.sqrt(b.n || 1))]), num('Pixels', [a.n, b.n, NaN])] });
    }
  }
  return { sheets, view, warnings };
}

// Structure ▸ grain size (the intercepts of test lines with the mask's boundaries, ASTM E112), orientation (the
// structure tensor: the dominant direction, the coherency, the distribution; the image coloured by them), fractal
// dimension (box counting): as sheets, and what is drawn and shown (the test lines and their crossings in pixels of
// the original)
export type TextureView = {
  grains?: { paths: { pts: Pt[]; closed: boolean }[]; marks: Pt[]; rows: { name: string; length: number; hits: number; l: number; G: number }[] };
  orient?: { dominant: number; coherency: number; png?: string };
  fractal?: { D: number; r2: number };
};
const orientKept = new WeakMap<Float32Array, { sigma: number; o: Orientation; png?: string }>();
export function textureSheets(d: ImageAnalysisData, p: Processed): { sheets: Dataset[]; view: TextureView; warnings: string[] } {
  const T = d.texture ?? {};
  const k = d.cal && d.cal.size > 0 ? d.cal.size : 1;
  const u = d.cal && d.cal.size > 0 ? unitText(d.cal.unit) : 'px';
  const num = (name: string, v: number[]) => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]): Column => column(name, new Float64Array(v.length).fill(NaN), v);
  const first = (n: number, v: number) => Array.from({ length: n }, (_, i) => (i ? NaN : v));
  const sheets: Dataset[] = [];
  const view: TextureView = {};
  const warnings: string[] = [];
  const mk = p.out.kind === 'mask' ? p.out : p.mask;
  const full = d.pixels ? { w: d.pixels.w, h: d.pixels.h } : { w: p.out.w, h: p.out.h };
  const crop = cropBox(d.crop, full.w, full.h);
  const [ox, oy] = [crop?.[0] ?? 0, crop?.[1] ?? 0];
  const mm = u in LENGTH_NM ? LENGTH_NM[u] / 1e6 : NaN;
  if (T.grains?.on) {
    if (!mk) warnings.push('Grain size: make a mask of the boundaries (or of the grains) in the steps first.');
    else {
      const g = intercepts(mk.ch[0], mk.w, mk.h, T.grains.of ?? 'boundaries', T.grains.lines ?? 'grid', T.grains.n ?? 5);
      const sets = g.sets.length > 1 ? [...g.sets, { name: 'All', length: g.sets.reduce((a, s) => a + s.length, 0), hits: g.sets.reduce((a, s) => a + s.hits, 0) }] : g.sets;
      const rows = sets.map((s) => {
        const l = s.hits > 0 ? (s.length * k) / s.hits : NaN;
        return { name: s.name, length: s.length * k, hits: s.hits, l, G: Number.isFinite(mm) ? astmG(l * mm) : NaN };
      });
      if (!Number.isFinite(mm)) warnings.push('Grain size: calibrate the image in a unit of length for the ASTM grain size number.');
      const sh = (q: Pt[]) => q.map(([x, y]): Pt => [x + ox, y + oy]);
      view.grains = { paths: g.paths.map((q) => ({ pts: sh(q.pts), closed: q.closed })), marks: sh(g.marks), rows };
      sheets.push({ name: 'Grain size', columns: [txt('Lines', rows.map((r) => r.name)), num(`Length (${u})`, rows.map((r) => r.length)), num('Intersections', rows.map((r) => r.hits)), num(`Mean intercept (${u})`, rows.map((r) => r.l)), num('ASTM G', rows.map((r) => r.G)), num('Grains per mm²', rows.map((r) => grainsPerMm2(r.G)))] });
    }
  }
  if (T.orient?.on) {
    const src = p.out.kind !== 'mask' ? p.out : p.image;
    const g = src.ch.length === 1 ? src.ch[0] : map1(src.ch[0], (v, i) => 0.299 * v + 0.587 * src.ch[1][i] + 0.114 * src.ch[2][i]);
    const sigma = T.orient.sigma ?? 4;
    const kept = orientKept.get(g);
    const hit = kept && kept.sigma === sigma ? kept : { sigma, o: orientation(g, src.w, src.h, sigma) };
    const o = hit.o;
    if (T.orient.show && !hit.png) hit.png = pngDataUrl(orientationColours(o, g, src.lo, src.hi), src.w, src.h);
    orientKept.set(g, hit);
    view.orient = { dominant: o.dominant, coherency: o.coherency, ...(T.orient.show ? { png: hit.png } : {}) };
    sheets.push({ name: 'Orientation', columns: [{ ...num('Angle (°)', o.hist.map((_, i) => i - 89.5)), role: 'x' }, { ...num('Weight (%)', o.hist), role: 'y' }, { ...num('Dominant (°)', first(180, o.dominant)), role: 'none' }, { ...num('Coherency', first(180, o.coherency)), role: 'none' }] });
  }
  if (T.fractal?.on) {
    if (!mk) warnings.push('Fractal dimension: make a mask in the steps first.');
    else {
      const f = boxCounting(mk.ch[0], mk.w, mk.h, T.fractal.of ?? 'edges');
      view.fractal = { D: f.D, r2: f.r2 };
      const n = f.sizes.length;
      sheets.push({ name: 'Fractal', columns: [{ ...num(`Box size (${u})`, f.sizes.map((s) => s * k)), role: 'x' }, { ...num('Boxes', f.counts), role: 'y' }, { ...num('D', first(n, f.D)), role: 'none' }, { ...num('R²', first(n, f.r2)), role: 'none' }] });
    }
  }
  return { sheets, view, warnings };
}

// the result as a matrix: gray (RGB: its luminance), X and Y of every column and row in the calibrated unit; heights:
// the values × their scale, the unit in its name
export function imageMatrix(r: Raster, name: string, cal?: ImageCal, z?: { scale: number; unit: string }): Matrix {
  const g = r.ch.length === 1 ? r.ch[0] : map1(r.ch[0], (v, i) => 0.299 * v + 0.587 * r.ch[1][i] + 0.114 * r.ch[2][i]);
  const c = z && z.scale !== 1 ? map1(g, (v) => v * z.scale) : g;
  const k = cal && cal.size > 0 ? cal.size : 1;
  const u = cal && cal.size > 0 ? unitText(cal.unit) : 'px';
  return {
    name: z?.unit ? `${name} (${z.unit})` : name,
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

// The bar's length when none is given: the length of the microscope's bar the image was calibrated on (when it fits,
// at most 3/5 of the image's width), else a round one
export const autoBarLength = (w: number, cal: ImageCal) => {
  const units = w * cal.size;
  return cal.length && cal.length > 0 && cal.length <= units * 0.6 ? cal.length : niceBar(units);
};
// The scale bar on the page (mm): its line (x1, y1, x2, y2) and its label's place, or null (no calibration, hidden)
export function scaleBarPlace(w: number, h: number, pageW: number, cal: ImageCal | undefined, bar: ScaleBar): { len: number; x1: number; x2: number; y: number; tx: number; ty: number; text: string } | null {
  if (!bar.show || !cal || !(cal.size > 0)) return null;
  const units = w * cal.size;
  const len = bar.length > 0 ? bar.length : autoBarLength(w, cal);
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
