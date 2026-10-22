// The Image analysis node: its settings (the image, the editing steps, the calibration, the selections and what is
// measured of them, the figure) and what it gives — the image processed as a matrix (calibrated X and Y), a figure (the
// image on a page, its selections, a scale bar), the measurements as a workbook. Pure: the evaluator (and its worker)
// and the checks run it.
import { cropBox, cropRaster, map1, packPixels, unpackPixels, type Crop, type ImgPixels, type Raster } from './raster.ts';
import { applySteps, type ImgStep } from './steps.ts';
import { measureInputs, measureRois, measureSpec, type MeasureResult, type MeasureSpec } from './measure.ts';
import type { Roi } from './roi.ts';
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
export type Processed = { base: Raster; out: Raster; notes: Record<string, string>; errors: Record<string, string>; image: Raster; mask: Raster | null };
const processed = new Map<string, { key: string; p: Processed }>();
export function processImage(d: ImageAnalysisData): Processed | null {
  // no image, or its pixels not back yet from the browser's storage
  if (!d.pixels?.data) return null;
  const steps = d.steps ?? [];
  const on = measureSpec(d.measure).on;
  const key = JSON.stringify([d.crop ?? null, steps, on]);
  const hit = d.pixelsId ? processed.get(d.pixelsId) : undefined;
  if (hit && hit.key === key) return hit.p;
  const base = cropRaster(unpackPixels(d.pixels, d.pixelsId), d.crop);
  // (what comes into every step: the image after the one before it)
  const ins: Raster[] = [];
  const { r, notes, errors } = applySteps(base, steps, steps.length, (k, x) => (ins[k] = x));
  const outs = steps.map((_, k) => ins[k + 1] ?? r);
  const p: Processed = { base, out: r, notes, errors, ...measureInputs(base, outs, steps, on) };
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
