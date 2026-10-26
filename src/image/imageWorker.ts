// The editor's view of an image computed off the main thread. The image kept (sent once; cropped as asked); the steps
// up to one applied — every step's result kept, so a change of step k computes again only from k on; first on a preview
// (the image shrunk to about a megapixel, the lengths of the steps in pixels with it: an answer at once while a slider
// moves), then, when no newer request has come, at full resolution. A newer request stops the one running between two
// steps. Sent back: the pixels to show (RGBA) and those to compare with (the original, or the image before the step
// shown), the histogram of what is shown, of what comes into the Curves and Threshold steps (the others: its range),
// every step's note and error. The values under the mouse: asked for one pixel at a time. The measurements of the
// selections and the particles of the mask (on all the steps, once the image shown is done; given up when a newer
// image is asked for), the wand's outline, the centre of a spot stamped: asked apart. The examples of a trainable
// classifier come with the steps.
import { cropRaster, dataBarApart, histogram, luminance, shrinkRaster, unpackPixels, type Crop, type ImgPixels, type Raster } from './raster.ts';
import { measureInputs, measureRois, type MeasureSpec } from './measure.ts';
import { fillPolygon, polygonArea, wand, type Pt, type Roi } from './roi.ts';
import { findParticles, PARTICLE_DEFAULTS, type ParticleOpts } from './particles.ts';
import { dropLikeRejected, findLike, fitBox, matchFeatures, MATCH_DEFAULTS, MATCH_TUNING, overlapOf, placeLike, type Match, type MatchOpts } from './match.ts';
import { fitRegular, snapToEdges, type Fitted, type RegularShape } from './refine.ts';
import { clickOutline, RAYS_DEFAULTS, seedsAndRays } from './rays.ts';
import { spectrum } from './fft2d.ts';
import { refineSpot } from './lattice.ts';
// the last spectrum's magnitudes (a spot clicked on it found on them)
let lastSpectrum: { mag: Float32Array; N: number } | null = null;
import { trainKeyOf, type TrainExample } from './classify.ts';
import type { Workbook } from '../engine/table.ts';
import { applyStep, STEP_DEFS, type ImgStep } from './steps.ts';
import { toRGBA, type Lut } from './render.ts';

// before: the image to compare with — the original, the one before the step shown (prev), none
export type ImgRequest = { type?: 'run'; seq: number; id?: string; pixels?: ImgPixels; crop?: Crop; steps: ImgStep[]; upTo: number; lut: Lut; lo?: number; hi?: number; overlay?: { color: string; alpha: number }; before?: 'original' | 'prev'; keep?: boolean; train?: TrainExample[] };
// keep: every step's result kept at full size (the selections are measured on all of them), else only from the step
// changed on
// the values at a pixel (of the image at full size): of the original part analysed, of what it is compared with, of the
// result
export type ValueRequest = { type: 'value'; x: number; y: number };
export type ValueReply = { type: 'value'; x: number; y: number; base: number[]; before: number[]; result: number[] };
// the measurements of the selections (their places in the original; ox, oy: the crop's corner)
export type MeasureRequest = { type: 'measure'; mseq: number; steps: ImgStep[]; crop?: Crop; train?: TrainExample[]; rois: Roi[]; spec: MeasureSpec; cal?: { size: number; unit: string }; ox: number; oy: number; name: string };
// the particles of the last mask the steps give (their outlines in the part analysed), or why there are none
export type ParticlesRequest = { type: 'particles'; steps: ImgStep[]; crop?: Crop; train?: TrainExample[]; opts: Partial<ParticleOpts> };
export type ParticlesReply = { type: 'particles'; outlines: Pt[][]; found: number; error?: string };
// Find like this: the models (each its centre and the radius of its disc, in the part analysed; box: a rectangle or
// ellipse whose edges are fitted — its sides and turn), on the last image of the steps that is not a mask; every match
// the model it is like (its place in the list)
// poly: its outline (in the part analysed), for a context other than the disc; outer: the margin drawn around it (in the
// part analysed); rejected: the places of its particles left out by hand, those like them dropped
// opts: its own settings (over those of the request)
export type MatchModel = { cx: number; cy: number; R: number; box?: { w: number; h: number; angle: number }; poly?: Pt[]; outer?: Pt[]; rejected?: { x: number; y: number; angle: number; scale: number }[]; opts?: Partial<MatchOpts> };
// image: the step whose image is compared (absent: the last that is not a mask); inside: the edges fitted only inside the
// margin drawn
export type MatchRequest = { type: 'match'; steps: ImgStep[]; crop?: Crop; train?: TrainExample[]; models: MatchModel[]; opts: Partial<MatchOpts>; image?: string; inside?: boolean };
// ms: how long the search took; note: what to say about it (the image chosen a mask …)
// (x0, y0: the place the search found, before the edges were fitted; f: its features, for the classifier of Review)
export type MatchReply = { type: 'match'; matches: (Match & { model: number; w?: number; h?: number; x0?: number; y0?: number; f?: number[] })[]; ms: number; dropped: number; note?: string };
// Refine: the particles' outlines (in the part analysed), each made the regular shape most like it among those chosen,
// snapped to the edges of the last image of the steps that is not a mask if asked; null: none fits
export type RefineRequest = { type: 'refine'; steps: ImgStep[]; crop?: Crop; train?: TrainExample[]; outlines: Pt[][]; shapes: RegularShape[]; snap: boolean };
export type RefineReply = { type: 'refine'; fits: (Fitted | null)[] };
export type MeasureReply = { type: 'measure'; mseq: number; book: Workbook; summary: string };
// the wand at a point of the image shown (the part analysed): the pixels within tol of it, joined; their outline
export type WandRequest = { type: 'wand'; x: number; y: number; tol: number };
export type WandReply = { type: 'wand'; pts: Pt[] | null };
// the spectrum of the image shown (or of the original part analysed): N × N, drawn in gray (log: from its median up,
// linear: from 0, the strongest few saturated)
export type SpectrumRequest = { type: 'spectrum'; log: boolean; hann: boolean; of: 'result' | 'original' };
export type SpectrumReply = { type: 'spectrum'; N: number; rgba: Uint8ClampedArray; w: number; h: number };
// a spot clicked on the spectrum shown (u, v: spectrum px from its middle), moved onto its peak (on the magnitudes)
export type SpotRequest = { type: 'spot'; u: number; v: number };
export type SpotReply = { type: 'spot'; fx: number; fy: number };
// the Rays tool at a point of the image shown: the outline of the particle clicked (light: bright on a dark ground;
// absent: as the pixel clicked)
export type RaysRequest = { type: 'rays'; x: number; y: number; light?: boolean };
export type RaysReply = { type: 'rays'; pts: Pt[] | null };
// a spot stamped: where its outline (in the part analysed) is moved to be centred on the bright (or dark) pixels under it
export type CentreRequest = { type: 'centre'; poly: Pt[]; dark: boolean; id: string };
export type CentreReply = { type: 'centre'; id: string; dx: number; dy: number };
// what comes into a step: its range, and its histograms for the steps drawn on them (gray [its values]; RGB
// [luminance, R, G, B]; others: none)
// how far a long piece of work is (the page shows it over the image): of: the work (the image's steps at full size, the
// particles, Find like this, Refine); what it is doing; done of total when they can be counted; step: the step being
// computed (its id)
export type ProgressReply = { type: 'progress'; of: 'image' | 'particles' | 'match' | 'refine'; stage: string; done?: number; total?: number; step?: string };
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
// (of: the work it is part of, told of every step computed at full size)
async function run(steps: ImgStep[], upTo: number, size: 'full' | 'small', base: Raster, scale: number, stale: () => boolean, keep = true, train: TrainExample[] = [], of?: ProgressReply['of']): Promise<Run | null> {
  // (a trainable classifier's key: its examples too)
  const trainKey = trainKeyOf(train);
  const kept = stages[size];
  const outs: Raster[] = [];
  const notes: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const stepHist: Record<string, StepHist> = {};
  let r = base;
  let prev = base;
  // (the last image that is not a mask: the one a mask was made from)
  let under = base;
  let key = '';
  let firstComputed = -1;
  for (let k = 0; k < upTo; k++) {
    const s = steps[k];
    if (k === upTo - 1) prev = r;
    if (s.on && HIST_KINDS.has(s.kind)) {
      const chans = r.ch.length === 3 ? [luminance(r), ...r.ch] : [r.ch[0]];
      stepHist[s.id] = { lo: r.lo, hi: r.hi, h: chans.map((c) => histogram(c, r.lo, r.hi, 256)) };
    } else if (s.on) stepHist[s.id] = { lo: r.lo, hi: r.hi, h: [] };
    key += `|${s.on ? JSON.stringify([s.kind, s.p]) : '-'}${s.on && s.kind === 'classify' ? trainKey : ''}`;
    const hit = kept[k];
    if (hit?.key === key) {
      r = hit.r;
      if (r.kind !== 'mask') under = r;
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
      if (of && size === 'full') post({ type: 'progress', of, stage: `step ${k + 1} of ${upTo}: ${STEP_DEFS[s.kind].label}`, done: k, total: upTo, step: s.id } satisfies ProgressReply);
      const out = applyStep(r, s, scale, { train, under });
      if (typeof out === 'string') st = { key, r, error: out };
      else st = { key, r: out.r, ...(out.note ? { note: out.note } : {}) };
    }
    kept[k] = st;
    r = st.r;
    if (r.kind !== 'mask') under = r;
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
    const out = await run(q.steps, q.upTo, size, base, scale, () => q.seq !== latest, !!q.keep, q.train, 'image');
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
  const out = await run(m.steps, m.steps.length, 'full', b.full, 1, stale, true, m.train);
  if (!out || stale()) return;
  const { image, mask } = measureInputs(b.full, out.outs, m.steps, m.spec.on);
  const res = measureRois({ image, mask, ox: m.ox, oy: m.oy, cal: m.cal, rois: m.rois, spec: m.spec, name: m.name });
  post({ type: 'measure', mseq: m.mseq, book: res.book, summary: res.summary } satisfies MeasureReply);
}
// the particles: as the measurements, then from the last mask
async function particles(m: ParticlesRequest) {
  await imageRun;
  if (!kept) return;
  const b = basesFor({ seq: latest, steps: m.steps, upTo: 0, lut: 'gray', ...(m.crop ? { crop: m.crop } : {}) });
  const out = await run(m.steps, m.steps.length, 'full', b.full, 1, () => false, true, m.train, 'particles');
  post({ type: 'progress', of: 'particles', stage: m.opts.method === 'rays' ? 'seeds and rays' : 'the particles of the mask' } satisfies ProgressReply);
  const mask = out ? measureInputs(b.full, out.outs, m.steps, 'original').mask : null;
  // seeds and rays: on the last image of the steps that is not a mask (its seeds from the mask when there is one)
  if (m.opts.method === 'rays') {
    const img = [...(out?.outs ?? [])].reverse().find((x) => x.kind !== 'mask') ?? b.full;
    const gray: Raster = img.ch.length === 1 ? img : { ...img, ch: [luminance(img)], kind: 'gray' };
    if (!mask && !(m.opts.size && m.opts.size > 0)) {
      post({ type: 'particles', outlines: [], found: 0, error: 'seeds and rays: give the particles’ size (or put a Threshold in the steps for their seeds)' } satisfies ParticlesReply);
      return;
    }
    const res = seedsAndRays(gray, mask, { ...RAYS_DEFAULTS, size: m.opts.size ?? 0, light: m.opts.light ?? true });
    const minA = m.opts.minSize ?? PARTICLE_DEFAULTS.minSize;
    const outlines = res.outlines.filter((o) => Math.abs(polygonArea(o)) >= minA);
    post({ type: 'particles', outlines, found: outlines.length } satisfies ParticlesReply);
    return;
  }
  if (!mask) {
    post({ type: 'particles', outlines: [], found: 0, error: 'no mask: put a Threshold (or a trainable classifier) in the steps' } satisfies ParticlesReply);
    return;
  }
  const res = findParticles(mask.ch[0], mask.w, mask.h, { ...PARTICLE_DEFAULTS, ...m.opts });
  post({ type: 'particles', ...res } satisfies ParticlesReply);
}
// Find like this: as the measurements, then on the last image that is not a mask
async function match(m: MatchRequest) {
  await imageRun;
  if (!kept) return;
  const t0 = performance.now();
  const b = basesFor({ seq: latest, steps: m.steps, upTo: 0, lut: 'gray', ...(m.crop ? { crop: m.crop } : {}) });
  const out = await run(m.steps, m.steps.length, 'full', b.full, 1, () => false, true, m.train, 'match');
  // (the image of the step chosen, unless it is a mask; else the last that is not one)
  const at = m.image ? m.steps.findIndex((s) => s.id === m.image) : -1;
  const chosen = at >= 0 ? out?.outs[at] : undefined;
  const note = chosen?.kind === 'mask' ? 'the step chosen gives a mask: compared on the last image that is not one' : at < 0 && m.image ? 'the step chosen is not there any more: compared on the last image that is not a mask' : undefined;
  const img0 = (chosen && chosen.kind !== 'mask' ? chosen : undefined) ?? [...(out?.outs ?? [])].reverse().find((x) => x.kind !== 'mask') ?? b.full;
  // (the data bar of an electron microscope under the image, when it was not cut: left out — its dark band and white
  // text, next to the ground, look like a particle's edge; only the places whose compared area is above it)
  const bar = dataBarApart(b.full);
  const img = bar ? { ...img0, h: img0.h - bar, ch: img0.ch.map((c) => c.subarray(0, img0.w * (img0.h - bar))) } : img0;
  const g = img.ch.length === 1 ? img.ch[0] : luminance(img);
  // (every model's matches, those like a place left out by hand dropped; where several models found the same particle,
  // the most alike kept)
  let dropped = 0;
  const all = m.models.flatMap((md, k) => {
    const o = { ...MATCH_DEFAULTS, ...m.opts, ...md.opts };
    const of = m.models.length > 1 ? `model ${k + 1} of ${m.models.length}: ` : '';
    const found = findLike(g, img.w, img.h, md.cx, md.cy, md.R, o, md.poly, md.outer, (stage, done, total) =>
      post({ type: 'progress', of: 'match', stage: `${of}${stage === 'first' ? 'the first search, on the image shrunk' : 'the candidates looked at closely'}`, done, total } satisfies ProgressReply),
    );
    const kept2 = md.rejected?.length ? dropLikeRejected(g, img.w, img.h, found, md.rejected, md.R, o, md.cx, md.cy, md.poly, md.outer) : found;
    dropped += found.length - kept2.length;
    return kept2.map((f) => ({ ...f, model: k }));
  });
  all.sort((a, b) => b.score - a.score);
  const reach = m.opts.reach ?? MATCH_TUNING.reach;
  // (two models finding the same particle: closer than reach, or their outlines overlapping, as asked)
  const outline = (q: (typeof all)[number]) => {
    const md = m.models[q.model];
    return md.poly ? placeLike(md.poly, md.cx, md.cy, q.angle, q.scale, q.x, q.y) : null;
  };
  const same = (q: (typeof all)[number], f: (typeof all)[number]) => {
    if (m.opts.separate !== 'overlap') return Math.hypot(q.x - f.x, q.y - f.y) < reach * Math.min(m.models[q.model].R, m.models[f.model].R);
    const [a, b] = [outline(q), outline(f)];
    return a && b ? overlapOf(a, b) > (m.opts.overlap ?? MATCH_TUNING.overlap) : Math.hypot(q.x - f.x, q.y - f.y) < 0.25 * Math.min(m.models[q.model].R, m.models[f.model].R);
  };
  const best: typeof all = [];
  for (const f of all) if (!best.some((q) => same(q, f))) best.push(f);
  post({ type: 'progress', of: 'match', stage: 'what each particle found is like (for Review)' } satisfies ProgressReply);
  // (every place its features, against its model)
  const feats = new Map<(typeof all)[number], number[]>();
  m.models.forEach((md, k) => {
    const mine = best.filter((f) => f.model === k);
    if (!mine.length) return;
    const fs = matchFeatures(g, img.w, img.h, md.cx, md.cy, md.R, { ...MATCH_DEFAULTS, ...m.opts, ...md.opts }, mine, md.poly, md.outer);
    mine.forEach((f, i) => feats.set(f, fs[i]));
  });
  const matches = best.map((f) => {
    const md = m.models[f.model];
    const box = md.box;
    const ff = feats.get(f);
    if (!box) return { ...f, ...(ff ? { f: ff } : {}) };
    // (only inside the margin drawn: how far it reaches from the centre along the box's two sides)
    const t = (box.angle * Math.PI) / 180;
    const limit: [number, number] | undefined =
      m.inside && md.outer && md.outer.length >= 3
        ? [0, 1].map((ax) => {
            const [ux, uy] = ax === 0 ? [Math.cos(t), Math.sin(t)] : [-Math.sin(t), Math.cos(t)];
            return f.scale * Math.max(...md.outer!.map(([x, y]) => Math.abs((x - md.cx) * ux + (y - md.cy) * uy)));
          }) as [number, number]
        : undefined;
    const fb = fitBox(g, img.w, img.h, f.x, f.y, box.angle + f.angle, box.w * f.scale, box.h * f.scale, limit);
    return { ...f, x: fb.x, y: fb.y, w: fb.w, h: fb.h, x0: f.x, y0: f.y, ...(ff ? { f: ff } : {}) };
  });
  const said = [note, bar ? `the data bar under the image (${bar} px) left out` : ''].filter(Boolean).join('; ');
  post({ type: 'match', matches, ms: Math.round(performance.now() - t0), dropped, ...(said ? { note: said } : {}) } satisfies MatchReply);
}
async function refine(m: RefineRequest) {
  await imageRun;
  if (!kept) return;
  const b = basesFor({ seq: latest, steps: m.steps, upTo: 0, lut: 'gray', ...(m.crop ? { crop: m.crop } : {}) });
  const out = await run(m.steps, m.steps.length, 'full', b.full, 1, () => false, true, m.train, 'refine');
  const img = [...(out?.outs ?? [])].reverse().find((x) => x.kind !== 'mask') ?? b.full;
  const g = img.ch.length === 1 ? img.ch[0] : luminance(img);
  let told = 0;
  const fits = m.outlines.map((o, i) => {
    if (performance.now() - told > 100) {
      told = performance.now();
      post({ type: 'progress', of: 'refine', stage: 'the shapes fitted', done: i, total: m.outlines.length } satisfies ProgressReply);
    }
    const f = fitRegular(o, m.shapes);
    return f && m.snap ? snapToEdges(f, g, img.w, img.h) : f;
  });
  post({ type: 'refine', fits } satisfies RefineReply);
}
// the gray of the image shown at full size (its luminance)
const shownGray = () => (last.result ? (last.result.ch.length === 1 ? last.result.ch[0] : luminance(last.result)) : null);

self.onmessage = (e: MessageEvent<ImgRequest | ValueRequest | MeasureRequest | WandRequest | RaysRequest | SpectrumRequest | SpotRequest | CentreRequest | ParticlesRequest | MatchRequest | RefineRequest>) => {
  const q = e.data;
  if (q.type === 'refine') {
    void refine(q);
    return;
  }
  if (q.type === 'match') {
    void match(q);
    return;
  }
  if (q.type === 'particles') {
    void particles(q);
    return;
  }
  if (q.type === 'measure') {
    latestMeasure = q.mseq;
    void measure(q);
    return;
  }
  if (q.type === 'spot') {
    if (!lastSpectrum) return;
    const [fx, fy] = refineSpot(lastSpectrum.mag, lastSpectrum.N, q.u, q.v);
    post({ type: 'spot', fx, fy } satisfies SpotReply);
    return;
  }
  if (q.type === 'spectrum') {
    const r = q.of === 'original' ? last.base : last.result;
    if (!r) return;
    const g = r.ch.length === 1 ? r.ch[0] : luminance(r);
    const sp0 = spectrum(g, r.w, r.h, { log: false, hann: q.hann });
    lastSpectrum = sp0;
    const sp = q.log ? { N: sp0.N, mag: Float32Array.from(sp0.mag, (v) => Math.log1p(v)) } : sp0;
    const sorted = Float32Array.from(sp.mag).sort();
    // (log: from the median, the noise floor grey, the spots above it; linear: from 0, the strongest few saturated)
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    const [lo, hi] = q.log ? [at(0.5), at(0.9998)] : [0, at(0.999)];
    const rgba = new Uint8ClampedArray(4 * sp.N * sp.N);
    for (let i = 0; i < sp.N * sp.N; i++) {
      const v = Math.round((255 * (sp.mag[i] - lo)) / (hi - lo || 1));
      rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = v;
      rgba[4 * i + 3] = 255;
    }
    post({ type: 'spectrum', N: sp.N, rgba, w: r.w, h: r.h } satisfies SpectrumReply);
    return;
  }
  if (q.type === 'wand') {
    const g = shownGray();
    const r = last.result;
    post({ type: 'wand', pts: g && r ? wand(g, r.w, r.h, q.x, q.y, r.kind === 'mask' ? 0 : q.tol) : null } satisfies WandReply);
    return;
  }
  if (q.type === 'rays') {
    const g = shownGray();
    const r = last.result;
    post({ type: 'rays', pts: g && r ? clickOutline(g, r.w, r.h, [q.x, q.y], q.light) : null } satisfies RaysReply);
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
