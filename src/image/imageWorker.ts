// The editor's view of an image computed off the main thread: the image kept (sent once), the steps up to one applied
// at full resolution, the pixels to show (RGBA), the histogram of what is shown, every step's note and error.
import { histogram, unpackPixels, type ImgPixels, type Raster } from './raster.ts';
import { applySteps, type ImgStep } from './steps.ts';
import { toRGBA, type Lut } from './render.ts';

export type ImgRequest = { seq: number; id?: string; pixels?: ImgPixels; steps: ImgStep[]; upTo: number; lut: Lut; lo?: number; hi?: number; overlay?: { color: string; alpha: number } };
export type ImgReply = {
  seq: number;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  hist: Float64Array; // 256 bins over [lo, hi] of the gray (RGB: luminance) result
  lo: number;
  hi: number;
  kind: Raster['kind'];
  notes: Record<string, string>;
  errors: Record<string, string>;
  // the values of the result, for reading under the mouse (the original's: decoded on the main thread)
  values: Float32Array[];
};

let kept: { id: string; r: Raster } | null = null;

self.onmessage = (e: MessageEvent<ImgRequest>) => {
  const q = e.data;
  if (q.pixels && q.id) kept = { id: q.id, r: unpackPixels(q.pixels, q.id) };
  if (!kept) return;
  const base = kept.r;
  const { r, notes, errors } = applySteps(base, q.steps, q.upTo);
  const rgba = r.kind === 'mask' && q.overlay ? toRGBA(r, { under: base, lut: q.lut, color: q.overlay.color, alpha: q.overlay.alpha }) : toRGBA(r, { lut: q.lut, lo: q.lo, hi: q.hi });
  const g = r.ch.length === 1 ? r.ch[0] : Float32Array.from(r.ch[0], (v, i) => 0.299 * v + 0.587 * r.ch[1][i] + 0.114 * r.ch[2][i]);
  const hist = histogram(g, r.lo, r.hi, 256);
  const values = r.ch.map((c) => Float32Array.from(c));
  const reply: ImgReply = { seq: q.seq, w: r.w, h: r.h, rgba, hist, lo: r.lo, hi: r.hi, kind: r.kind, notes, errors, values };
  (self as unknown as Worker).postMessage(reply, [rgba.buffer, hist.buffer, ...values.map((v) => v.buffer)]);
};
