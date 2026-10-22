// The editor's view of an image computed off the main thread. The image kept (sent once; cropped as asked); the steps
// up to one applied — every step's result kept, so a change of step k computes again only from k on; first on a preview
// (the image shrunk to about a megapixel, the lengths of the steps in pixels with it: an answer at once while a slider
// moves), then, when no newer request has come, at full resolution. A newer request stops the one running between two
// steps. Sent back: the pixels to show (RGBA) and those to compare with (the original, or the image before the step
// shown), the histogram of what is shown, of what comes into the Curves and Threshold steps (the others: its range),
// every step's note and error. The values under the mouse: asked for one pixel at a time. The measurements of the
// selections (on all the steps, once the image shown is done; given up when a newer image is asked for), the wand's
// outline, the centre of a spot stamped: asked apart.
import { cropRaster, histogram, luminance, shrinkRaster, unpackPixels, type Crop, type ImgPixels, type Raster } from './raster.ts';
import { measureInputs, measureRois, type MeasureSpec } from './measure.ts';
import { fillPolygon, wand, type Pt, type Roi } from './roi.ts';
import type { Workbook } from '../engine/table.ts';
import { applyStep, STEP_DEFS, type ImgStep } from './steps.ts';
import { toRGBA, type Lut } from './render.ts';

// before: the image to compare with — the original, the one before the step shown (prev), none
export type ImgRequest = { type?: 'run'; seq: number; id?: string; pixels?: ImgPixels; crop?: Crop; steps: ImgStep[]; upTo: number; lut: Lut; lo?: number; hi?: number; overlay?: { color: string; alpha: number }; before?: 'original' | 'prev'; keep?: boolean };
// keep: every step's result kept at full size (the selections are measured on all of them), else only from the step
// changed on
// the values at a pixel (of the image at full size): of the original part analysed, of what it is compared with, of the
// result
export type ValueRequest = { type: 'value'; x: number; y: number };
export type ValueReply = { type: 'value'; x: number; y: number; base: number[]; before: number[]; result: number[] };
// the measurements of the selections (their places in the original; ox, oy: the crop's corner)
export type MeasureRequest = { type: 'measure'; mseq: number; steps: ImgStep[]; crop?: Crop; rois: Roi[]; spec: MeasureSpec; cal?: { size: number; unit: string }; ox: number; oy: number; name: string };
export type MeasureReply = { type: 'measure'; mseq: number; book: Workbook; summary: string };
// the wand at a point of the image shown (the part analysed): the pixels within tol of it, joined; their outline
export type WandRequest = { type: 'wand'; x: number; y: number; tol: number };
export type WandReply = { type: 'wand'; pts: Pt[] | null };
// a spot stamped: where its outline (in the part analysed) is moved to be centred on the bright (or dark) pixels under it
export type CentreRequest = { type: 'centre'; poly: Pt[]; dark: boolean; id: string };
export type CentreReply = { type: 'centre'; id: string; dx: number; dy: number };
// what comes into a step: its range, and its histograms for the steps drawn on them (gray [its values]; RGB
// [luminance, R, G, B]; others: none)
export type StepHist = { lo: number; hi: number; h: Float64Array[] };
export type ImgReply = {
  type: 'image';
  seq: number;
  scale: number; // 1: at full size; below: a preview (the image shrunk by it)
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  hist: Float64Array; // 256 bins over [lo, hi] of the gray (RGB: luminance) result
  lo: number;
  hi: number;
  kind: Raster['kind'];
  notes: Record<string, string>;
  errors: Record<string, string>;
  before?: { rgba: Uint8ClampedArray };
  stepHist: Record<string, StepHist>;
};

const PREVIEW_PIXELS = 1.1e6;
const HIST_KINDS = new Set(['curves', 'threshold', 'localthreshold']);
let kept: { id: string; r: Raster } | null = null;
// the part analysed (cropped) at full size and as a preview, for the crop asked
let bases: { key: string; full: Raster; small: Raster; scale: number } | null = null;
// every step's result kept, by size: its key (the steps up to it, as they are), what it gave
type Stage = { key: string; r: Raster; note?: string; error?: string };
const stages: Record<'full' | 'small', Stage[]> = { full: [], small: [] };
let latest = 0;
let last: { q: ImgRequest; full?: Raster; prev?: Raster; base?: Raster; result?: Raster } = { q: { seq: 0, steps: [], upTo: 0, lut: 'gray' } };

const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);
// a moment for the messages waiting (a newer request) to come in
const pause = () => new Promise<void>((res) => setTimeout(res, 0));

function basesFor(q: ImgRequest): NonNullable<typeof bases> {
  const key = `${kept!.id}|${q.crop?.join() ?? ''}`;
  if (bases?.key === key) return bases;
  const full = cropRaster(kept!.r, q.crop);
  const f = Math.max(1, Math.ceil(Math.sqrt((full.w * full.h) / PREVIEW_PIXELS)));
  bases = { key, full, small: f > 1 ? shrinkRaster(full, f) : full, scale: 1 / f };
  stages.full = [];
  stages.small = [];
  return bases;
}

// the steps up to upTo on one size: from the last result kept that is still the same; null when it is no longer
// wanted (a newer request came); outs: the image after every step
type Run = { r: Raster; prev: Raster; outs: Raster[]; notes: Record<string, string>; errors: Record<string, string>; stepHist: Record<string, StepHist> };
async function run(steps: ImgStep[], upTo: number, size: 'full' | 'small', base: Raster, scale: number, stale: () => boolean, keep = true): Promise<Run | null> {
  const kept = stages[size];
  const outs: Raster[] = [];
  const notes: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const stepHist: Record<string, StepHist> = {};
  let r = base;
  let prev = base;
  let key = '';
  let firstComputed = -1;
  for (let k = 0; k < upTo; k++) {
    const s = steps[k];
    if (k === upTo - 1) prev = r;
    if (s.on && HIST_KINDS.has(s.kind)) {
      const chans = r.ch.length === 3 ? [luminance(r), ...r.ch] : [r.ch[0]];
      stepHist[s.id] = { lo: r.lo, hi: r.hi, h: chans.map((c) => histogram(c, r.lo, r.hi, 256)) };
    } else if (s.on) stepHist[s.id] = { lo: r.lo, hi: r.hi, h: [] };
    key += `|${s.on ? JSON.stringify([s.kind, s.p]) : '-'}`;
    const hit = kept[k];
    if (hit?.key === key) {
      r = hit.r;
      outs.push(r);
      if (hit.note) notes[s.id] = hit.note;
      if (hit.error) errors[s.id] = hit.error;
      continue;
    }
    if (firstComputed < 0) firstComputed = k;
    // (a newer request: this one given up — what it computed so far stays kept)
    await pause();
    if (stale()) return null;
    kept.length = k;
    let st: Stage = { key, r };
    if (s.on && s.kind in STEP_DEFS) {
      const out = applyStep(r, s, scale);
      if (typeof out === 'string') st = { key, r, error: out };
      else st = { key, r: out.r, ...(out.note ? { note: out.note } : {}) };
    }
    kept[k] = st;
    r = st.r;
    outs.push(r);
    if (st.note) notes[s.id] = st.note;
    if (st.error) errors[s.id] = st.error;
  }
  // (full size, for the memory: the results before the step just computed again dropped, but the one coming into it —
  // the next change is most likely of the same step)
  if (size === 'full' && !keep && firstComputed > 0) for (let k = 0; k < firstComputed - 1; k++) delete kept[k];
  return { r, prev, outs, notes, errors, stepHist };
}

async function answer(q: ImgRequest) {
  const b = basesFor(q);
  const sizes: ['small' | 'full', Raster, number][] = b.scale < 1 ? [['small', b.small, b.scale], ['full', b.full, 1]] : [['full', b.full, 1]];
  for (const [size, base, scale] of sizes) {
    if (size === 'full' && b.scale < 1) {
      // (full size only once the requests have stopped for a moment)
      await new Promise((res) => setTimeout(res, 250));
      if (q.seq !== latest) return;
    }
    const out = await run(q.steps, q.upTo, size, base, scale, () => q.seq !== latest, !!q.keep);
    if (!out || q.seq !== latest) return;
    const { r, prev, notes, errors, stepHist } = out;
    const show = (x: Raster) => (x.kind === 'mask' && q.overlay ? toRGBA(x, { under: base, lut: q.lut, color: q.overlay.color, alpha: q.overlay.alpha }) : toRGBA(x, { lut: q.lut, lo: q.lo, hi: q.hi }));
    const rgba = show(r);
    const bf = q.before === 'original' ? base : q.before === 'prev' ? prev : null;
    const before = bf ? { rgba: show(bf) } : undefined;
    const g = r.ch.length === 1 ? r.ch[0] : luminance(r);
    const hist = histogram(g, r.lo, r.hi, 256);
    if (size === 'full') last = { q, base, prev, result: r };
    const reply: ImgReply = { type: 'image', seq: q.seq, scale, w: r.w, h: r.h, rgba, hist, lo: r.lo, hi: r.hi, kind: r.kind, notes, errors, ...(before ? { before } : {}), stepHist };
    post(reply, [rgba.buffer, hist.buffer, ...(before ? [before.rgba.buffer] : []), ...Object.values(stepHist).flatMap((x) => x.h.map((v) => v.buffer))]);
  }
}

// the measurements: once the image asked for last is done, on all the steps at full size
let imageRun: Promise<void> = Promise.resolve();
let latestMeasure = 0;
async function measure(m: MeasureRequest) {
  const seqAt = latest;
  const stale = () => m.mseq !== latestMeasure || latest !== seqAt;
  await imageRun;
  if (stale() || !kept) return;
  const b = basesFor({ seq: latest, steps: m.steps, upTo: 0, lut: 'gray', ...(m.crop ? { crop: m.crop } : {}) });
  const out = await run(m.steps, m.steps.length, 'full', b.full, 1, stale);
  if (!out || stale()) return;
  const { image, mask } = measureInputs(b.full, out.outs, m.steps, m.spec.on);
  const res = measureRois({ image, mask, ox: m.ox, oy: m.oy, cal: m.cal, rois: m.rois, spec: m.spec, name: m.name });
  post({ type: 'measure', mseq: m.mseq, book: res.book, summary: res.summary } satisfies MeasureReply);
}
// the gray of the image shown at full size (its luminance)
const shownGray = () => (last.result ? (last.result.ch.length === 1 ? last.result.ch[0] : luminance(last.result)) : null);

self.onmessage = (e: MessageEvent<ImgRequest | ValueRequest | MeasureRequest | WandRequest | CentreRequest>) => {
  const q = e.data;
  if (q.type === 'measure') {
    latestMeasure = q.mseq;
    void measure(q);
    return;
  }
  if (q.type === 'wand') {
    const g = shownGray();
    const r = last.result;
    post({ type: 'wand', pts: g && r ? wand(g, r.w, r.h, q.x, q.y, r.kind === 'mask' ? 0 : q.tol) : null } satisfies WandReply);
    return;
  }
  if (q.type === 'centre') {
    const g = shownGray();
    const r = last.result;
    let [dx, dy] = [0, 0];
    // (three times: around the outline — its search area half as large again —, the centre of the pixels brighter
    // (darker) than the area's median, weighed by how much; the outline's centre moved there)
    const pc = q.poly.reduce<Pt>((a, p) => [a[0] + p[0] / q.poly.length, a[1] + p[1] / q.poly.length], [0, 0]);
    const area = q.poly.map(([x, y]): Pt => [pc[0] + 1.5 * (x - pc[0]), pc[1] + 1.5 * (y - pc[1])]);
    for (let it = 0; g && r && it < 3; it++) {
      const win = fillPolygon(
        area.map(([x, y]): Pt => [x + dx, y + dy]),
        r.w,
        r.h,
      );
      const vals: number[] = [];
      for (let y = 0; y < win.h; y++) for (let x = 0; x < win.w; x++) if (win.m[y * win.w + x]) vals.push(g[(win.y0 + y) * r.w + win.x0 + x]);
      if (!vals.length) break;
      const med = vals.sort((a, b) => a - b)[vals.length >> 1];
      let [sw, sx, sy] = [0, 0, 0];
      for (let y = 0; y < win.h; y++)
        for (let x = 0; x < win.w; x++)
          if (win.m[y * win.w + x]) {
            const v = g[(win.y0 + y) * r.w + win.x0 + x];
            const wt = Math.max(0, q.dark ? med - v : v - med);
            sw += wt;
            sx += wt * (win.x0 + x + 0.5);
            sy += wt * (win.y0 + y + 0.5);
          }
      if (!(sw > 0)) break;
      [dx, dy] = [sx / sw - pc[0], sy / sw - pc[1]];
    }
    post({ type: 'centre', id: q.id, dx, dy } satisfies CentreReply);
    return;
  }
  if (q.type === 'value') {
    const { base, prev, result } = last;
    if (!base || !result) return;
    const [x, y] = [Math.floor(q.x), Math.floor(q.y)];
    if (x < 0 || y < 0 || x >= base.w || y >= base.h) return;
    const i = y * base.w + x;
    const at = (r?: Raster) => (r && r.w === base.w ? r.ch.map((c) => c[i]) : []);
    post({ type: 'value', x, y, base: at(base), before: at(last.q.before === 'prev' ? prev : base), result: at(result) } satisfies ValueReply);
    return;
  }
  if (q.pixels && q.id) kept = { id: q.id, r: unpackPixels(q.pixels, q.id) };
  if (!kept) return;
  latest = q.seq;
  imageRun = answer(q);
};
