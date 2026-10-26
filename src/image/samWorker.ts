// Segment anything, off the page: the model (its encoder and decoder, ONNX) and the engine that runs it fetched from
// the app's own site once, kept in this browser (its Cache Storage) and taken from there afterwards; the image read
// once by the encoder; a click, a box or a grid of points (Everything) given to the decoder, the masks made outlines.
// The image never leaves this computer.
import * as ort from 'onnxruntime-web';
import { dropNested, gridPoints, keepMasks, SAM_CACHE, lowResStats, maskOutline, maskOver, pickMask, SAM_ENGINE, SAM_LOW, SAM_MODELS, samInput, samPoints, type SamCandidate, type SamModel, type SamOpts } from './sam.ts';
import type { Pt } from './roi.ts';

export type SamRequest =
  | { type: 'load'; model: SamModel; base: string }
  | { type: 'encode'; key: string; ch: Float32Array[]; w: number; h: number; lo: number; hi: number }
  | { type: 'prompt'; seq: number; pts: [number, number, number][]; box?: [number, number, number, number] }
  | { type: 'everything'; seq: number; opts: SamOpts; rows: number };
export type SamReply =
  | { type: 'progress'; stage: string; bytes?: [number, number]; done?: number; total?: number }
  | { type: 'ready'; model: SamModel; provider: string }
  | { type: 'encoded'; key: string; ms: number }
  | { type: 'mask'; seq: number; outline: Pt[] | null; score: number }
  | { type: 'masks'; seq: number; outlines: { pts: Pt[]; score: number }[]; tried: number; ms: number }
  | { type: 'error'; message: string };

const post = (m: SamReply) => (self as unknown as Worker).postMessage(m);
let enc: ort.InferenceSession | null = null;
let dec: ort.InferenceSession | null = null;
let loaded: SamModel | null = null;
let image: { key: string; emb: ort.Tensor; w: number; h: number } | null = null;

// a file of the site: from the cache, else fetched (its bytes told as they come) and kept
async function fetchKept(url: string, size: number, got: (n: number) => void): Promise<ArrayBuffer> {
  const cache = typeof caches !== 'undefined' ? await caches.open(SAM_CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) {
    const b = await hit.arrayBuffer();
    got(b.byteLength);
    return b;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length')) || size;
  const parts: Uint8Array[] = [];
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
    got(Math.min(n, total));
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  await cache?.put(url, new Response(all, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {});
  return all.buffer;
}

async function load(model: SamModel, base: string) {
  if (loaded === model && enc && dec) return post({ type: 'ready', model, provider: 'kept' });
  const m = SAM_MODELS[model];
  const files: [string, number][] = [
    [SAM_ENGINE.file, SAM_ENGINE.bytes],
    [m.encoder, m.bytes - 16465907],
    [m.decoder, 16465907],
  ];
  const total = files.reduce((s, [, b]) => s + b, 0);
  const got = files.map(() => 0);
  const told = () => post({ type: 'progress', stage: 'downloading the model (once; kept in this browser)', bytes: [got.reduce((a, b) => a + b, 0), total] });
  let t = 0;
  const bufs = await Promise.all(
    files.map(([f, b], k) =>
      fetchKept(new URL(f, base).href, b, (n) => {
        got[k] = n;
        if (performance.now() - t > 150) {
          t = performance.now();
          told();
        }
      }),
    ),
  );
  told();
  post({ type: 'progress', stage: 'preparing the model' });
  ort.env.wasm.wasmPaths = { wasm: URL.createObjectURL(new Blob([bufs[0]], { type: 'application/wasm' })) };
  ort.env.wasm.numThreads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  // (WebGPU when the browser has it: the encoder many times faster; else WebAssembly)
  const gpu = 'gpu' in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  const make = async (buf: ArrayBuffer, eps: string[]) => ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: eps, graphOptimizationLevel: 'all' });
  let provider = gpu ? 'webgpu' : 'wasm';
  try {
    enc = await make(bufs[1], gpu ? ['webgpu', 'wasm'] : ['wasm']);
  } catch {
    provider = 'wasm';
    enc = await make(bufs[1], ['wasm']);
  }
  // (the decoder too: Everything asks it thousands of masks)
  try {
    dec = await make(bufs[2], provider === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm']);
  } catch {
    dec = await make(bufs[2], ['wasm']);
  }
  loaded = model;
  image = null;
  post({ type: 'ready', model, provider });
}

async function encode(q: Extract<SamRequest, { type: 'encode' }>) {
  if (!enc) throw new Error('the model is not loaded');
  if (image?.key === q.key) return post({ type: 'encoded', key: q.key, ms: 0 });
  const t0 = performance.now();
  post({ type: 'progress', stage: 'reading the image (the encoder)' });
  const x = new ort.Tensor('float32', samInput(q.ch, q.w, q.h, q.lo, q.hi), [1, 3, 1024, 1024]);
  const out = await enc.run({ image: x });
  image = { key: q.key, emb: out.embeddings, w: q.w, h: q.h };
  post({ type: 'encoded', key: q.key, ms: Math.round(performance.now() - t0) });
}

// the decoder on B prompts of n points each: their masks [B, 4, 256, 256] and how sure of each [B, 4]
async function decode(coords: Float32Array, labels: Float32Array, B: number, n: number) {
  const out = await dec!.run({ embeddings: image!.emb, point_coords: new ort.Tensor('float32', coords, [B, n, 2]), point_labels: new ort.Tensor('float32', labels, [B, n]) });
  return { masks: out.masks.data as Float32Array, iou: out.iou.data as Float32Array };
}

async function prompt(q: Extract<SamRequest, { type: 'prompt' }>) {
  if (!dec || !image) throw new Error('the image is not read yet');
  const { w, h } = image;
  const p = samPoints(w, h, q.pts, q.box);
  const { masks, iou } = await decode(p.coords, p.labels, 1, p.n);
  const k = pickMask(iou, 0, p.n);
  const off = k * SAM_LOW * SAM_LOW;
  const st = lowResStats(masks, off, w, h);
  if (!st) return post({ type: 'mask', seq: q.seq, outline: null, score: iou[k] });
  // (the mask over its box, a little wider: low-resolution pixels to the image's)
  const f = Math.max(w, h) / 256;
  const part: [number, number, number, number] = [Math.floor((st.box[0] - 1) * f), Math.floor((st.box[1] - 1) * f), Math.ceil((st.box[2] + 2) * f), Math.ceil((st.box[3] + 2) * f)];
  post({ type: 'mask', seq: q.seq, outline: maskOutline(maskOver(masks, off, w, h, part)), score: iou[k] });
}

async function everything(q: Extract<SamRequest, { type: 'everything' }>) {
  if (!dec || !image) throw new Error('the image is not read yet');
  const { w, h } = image;
  const t0 = performance.now();
  const pts = gridPoints(w, h, q.opts.perSide, q.rows);
  const BATCH = 16;
  const cands: (SamCandidate & { b: number; k: number })[] = [];
  const kept = new Map<number, { masks: Float32Array; at: number }>();
  const [lw, lh] = [Math.ceil((w * 1024) / Math.max(w, h) / 4), Math.ceil((h * 1024) / Math.max(w, h) / 4)];
  for (let s = 0; s < pts.length; s += BATCH) {
    post({ type: 'progress', stage: 'the masks of a grid of points', done: s, total: pts.length });
    const part = pts.slice(s, s + BATCH);
    const coords = new Float32Array(part.length * 4);
    const labels = new Float32Array(part.length * 2);
    part.forEach(([x, y], i) => {
      const p = samPoints(w, h, [[x, y, 1]]);
      coords.set(p.coords, i * 4);
      labels.set(p.labels, i * 2);
    });
    const { masks, iou } = await decode(coords, labels, part.length, 2);
    for (let b = 0; b < part.length; b++)
      for (let k = 1; k < 4; k++) {
        const off = (b * 4 + k) * SAM_LOW * SAM_LOW;
        const sc = iou[b * 4 + k];
        if (sc < q.opts.iou) continue;
        const st = lowResStats(masks, off, w, h);
        if (!st || st.stability < q.opts.stability) continue;
        const id = cands.length;
        cands.push({ iou: sc, stability: st.stability, box: st.box, area: st.area, edge: st.box[0] <= 0 || st.box[1] <= 0 || st.box[2] >= lw - 1 || st.box[3] >= lh - 1, b: s + b, k });
        // (its own copy: the batch's masks are not all kept)
        kept.set(id, { masks: masks.slice(off, off + SAM_LOW * SAM_LOW), at: 0 });
      }
  }
  post({ type: 'progress', stage: 'the outlines of the masks kept' });
  const f = Math.max(w, h) / 256;
  // (the sure, stable, separate ones; then not the clusters of them, nor the pieces of one)
  const sure = keepMasks(cands, q.opts, w, h);
  const bins = sure.map((i) => {
    const m = kept.get(i)!.masks;
    const b = new Uint8Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) b[y * lw + x] = m[y * SAM_LOW + x] > 0 ? 1 : 0;
    return b;
  });
  const outlines = dropNested(bins).map((j) => sure[j]).flatMap((i) => {
    const c = cands[i];
    const m = kept.get(i)!;
    const part: [number, number, number, number] = [Math.floor((c.box[0] - 1) * f), Math.floor((c.box[1] - 1) * f), Math.ceil((c.box[2] + 2) * f), Math.ceil((c.box[3] + 2) * f)];
    const o = maskOutline(maskOver(m.masks, m.at, w, h, part));
    return o && o.length > 2 ? [{ pts: o, score: c.iou }] : [];
  });
  post({ type: 'masks', seq: q.seq, outlines, tried: pts.length, ms: Math.round(performance.now() - t0) });
}

self.onmessage = (e: MessageEvent<SamRequest>) => {
  const q = e.data;
  const run = q.type === 'load' ? load(q.model, q.base) : q.type === 'encode' ? encode(q) : q.type === 'prompt' ? prompt(q) : everything(q);
  run.catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
};
