// Segment anything (Image analysis ▸ Find): the image prepared for the encoder of a Segment Anything model with a
// ViT-Tiny encoder (micro-sam's vit_t_em_organelles, or MobileSAM), the decoder's masks chosen, enlarged to the image
// and judged (how sure the model is, how stable the mask is), the masks of a grid of points (Everything) kept or not —
// as Segment Anything's own predictor and automatic mask generator do. The networks themselves run in samWorker.ts.
import type { Pt } from './roi.ts';
import { findParticles, PARTICLE_DEFAULTS } from './particles.ts';

// the cache of this browser the files are kept in
export const SAM_CACHE = 'sciplotflow-models-v1';
export const SAM_SIZE = 1024; // the encoder's square: the image's longest side made this
export const SAM_LOW = 256; // the decoder's masks (logits): a quarter of it
const MEAN = [123.675, 116.28, 103.53];
const STD = [58.395, 57.12, 57.375];

// the models, served by the app (public/models): their files, what they weigh, where they come from
export type SamModel = 'em' | 'general';
export const SAM_MODELS: Record<SamModel, { label: string; encoder: string; decoder: string; bytes: number; title: string; credit: string }> = {
  em: {
    label: 'micro-SAM EM (tiny)',
    encoder: 'models/microsam-em-tiny-encoder.onnx',
    decoder: 'models/microsam-em-tiny-decoder.onnx',
    bytes: 27982939 + 16465907,
    title: 'Segment Anything finetuned on electron microscopy (mitochondria and nuclei) by micro-sam, its encoder a ViT-Tiny',
    credit: 'micro-sam vit_t_em_organelles: Archit et al., Segment Anything for Microscopy (doi:10.1101/2023.08.21.554208); weights CC BY 4.0 (Zenodo 10.5281/zenodo.11110950), converted to ONNX',
  },
  general: {
    label: 'MobileSAM (general)',
    encoder: 'models/mobilesam-encoder.onnx',
    decoder: 'models/mobilesam-decoder.onnx',
    bytes: 27982939 + 16465907,
    title: 'Segment Anything made small (MobileSAM): trained on everyday photos, for any kind of object',
    credit: 'MobileSAM: Zhang et al., Faster Segment Anything (arXiv:2306.14289); Apache-2.0, converted to ONNX',
  },
};
// the engine that runs them (onnxruntime-web, its WebAssembly; WebGPU when the browser has it)
export const SAM_ENGINE = { file: 'ort/ort-wasm-simd-threaded.jsep.wasm', bytes: 28312028 };

// Everything: a grid of points (perSide × perSide), the masks the model is sure of (iou: its own guess of how good the
// mask is) and that are stable (stability: the mask hardly changes when its threshold moves by 1), the overlapping ones
// (their boxes more than nms alike) one; minArea (px²), maxFrac (of the image): the smallest and largest kept;
// edges: those touching the image's edge left out
export type SamOpts = { perSide: number; iou: number; stability: number; nms: number; minArea: number; maxFrac: number; edges: boolean };
export const SAM_DEFAULTS: SamOpts = { perSide: 24, iou: 0.86, stability: 0.92, nms: 0.7, minArea: 30, maxFrac: 0.2, edges: false };

// ---- the image for the encoder ----

// a resampling of n values to m along one axis, as PyTorch's bilinear interpolation with antialias (PIL's): a
// triangle as wide as the shrinking; every output its first input and weights
function resampler(n: number, m: number): { first: Int32Array; count: Int32Array; w: Float32Array; span: number } {
  const scale = n / m;
  const support = scale >= 1 ? scale : 1;
  const inv = scale >= 1 ? 1 / scale : 1;
  const span = Math.ceil(support) * 2 + 1;
  const first = new Int32Array(m);
  const count = new Int32Array(m);
  const w = new Float32Array(m * span);
  for (let i = 0; i < m; i++) {
    const c = scale * (i + 0.5);
    const a = Math.max(Math.floor(c - support + 0.5), 0);
    const b = Math.min(Math.floor(c + support + 0.5), n);
    let s = 0;
    for (let j = a; j < b; j++) {
      const v = Math.max(0, 1 - Math.abs((j - c + 0.5) * inv));
      w[i * span + j - a] = v;
      s += v;
    }
    for (let j = 0; j < b - a; j++) w[i * span + j] /= s || 1;
    first[i] = a;
    count[i] = b - a;
  }
  return { first, count, w, span };
}
// one channel w × h resized to nw × nh
export function resizeAA(src: Float32Array, w: number, h: number, nw: number, nh: number): Float32Array {
  const rx = resampler(w, nw);
  const ry = resampler(h, nh);
  const tmp = new Float32Array(nw * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < nw; x++) {
      let s = 0;
      for (let j = 0, o = y * w + rx.first[x]; j < rx.count[x]; j++) s += src[o + j] * rx.w[x * rx.span + j];
      tmp[y * nw + x] = s;
    }
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      let s = 0;
      for (let j = 0; j < ry.count[y]; j++) s += tmp[(ry.first[y] + j) * nw + x] * ry.w[y * ry.span + j];
      out[y * nw + x] = s;
    }
  return out;
}
// the size the image is made (its longest side 1024)
export const samSize = (w: number, h: number): [number, number] => {
  const s = SAM_SIZE / Math.max(w, h);
  return [Math.floor(w * s + 0.5), Math.floor(h * s + 0.5)];
};
// the encoder's input: the channels (one: gray, three: RGB) stretched from lo … hi to 0 … 255, resized, made the
// standard of the model (the mean and spread of its training images), the rest of the square 0; [1, 3, 1024, 1024]
export function samInput(ch: Float32Array[], w: number, h: number, lo: number, hi: number): Float32Array {
  const [nw, nh] = samSize(w, h);
  const k = hi > lo ? 255 / (hi - lo) : 1;
  const out = new Float32Array(3 * SAM_SIZE * SAM_SIZE);
  const done: Float32Array[] = [];
  for (let c = 0; c < 3; c++) {
    const src = ch[Math.min(c, ch.length - 1)];
    let r = done[ch.length === 1 ? 0 : c];
    if (!r) {
      const st = new Float32Array(w * h);
      for (let i = 0; i < st.length; i++) st[i] = Math.min(255, Math.max(0, (src[i] - lo) * k));
      r = resizeAA(st, w, h, nw, nh);
      done[ch.length === 1 ? 0 : c] = r;
    }
    const o = c * SAM_SIZE * SAM_SIZE;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[o + y * SAM_SIZE + x] = (r[y * nw + x] - MEAN[c]) / STD[c];
  }
  return out;
}

// ---- the prompts and the masks ----

// a prompt in pixels of the image made the decoder's points: those clicked (1: the object, 0: not), a box's corners
// (labels 2, 3); without a box, a point that is none (as the predictor adds)
export function samPoints(w: number, h: number, pts: [number, number, number][], box?: [number, number, number, number]): { coords: Float32Array; labels: Float32Array; n: number } {
  const s = SAM_SIZE / Math.max(w, h);
  const list: [number, number, number][] = pts.map(([x, y, l]) => [x * s, y * s, l]);
  if (box) list.push([box[0] * s, box[1] * s, 2], [box[2] * s, box[3] * s, 3]);
  else list.push([0, 0, -1]);
  return { coords: Float32Array.from(list.flatMap(([x, y]) => [x, y])), labels: Float32Array.from(list.map(([, , l]) => l)), n: list.length };
}
// the mask the decoder gives for a prompt of n points (the padding point or the box's corners counted): one point (or a
// box) is ambiguous, the best of its three masks; more, its single mask (as Segment Anything's ONNX model does)
export function pickMask(iou: ArrayLike<number>, at: number, n: number): number {
  if (n >= 3) return 0;
  let best = 1;
  for (let k = 2; k < 4; k++) if (iou[at + k] > iou[at + best]) best = k;
  return best;
}
// a mask of the decoder (logits, 256 × 256 at off) judged on its part that is the image: how stable it is (the pixels
// above 1 over those above −1), its box (low-resolution pixels) and area; null when empty
export function lowResStats(m: Float32Array, off: number, w: number, h: number): { stability: number; box: [number, number, number, number]; area: number } | null {
  const [nw, nh] = samSize(w, h);
  const [lw, lh] = [Math.ceil(nw / 4), Math.ceil(nh / 4)];
  let [hi, lo, area] = [0, 0, 0];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const v = m[off + y * SAM_LOW + x];
      if (v > 1) hi++;
      if (v > -1) lo++;
      if (v > 0) {
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  return area ? { stability: lo ? hi / lo : 0, box: [x0, y0, x1, y1], area } : null;
}
export function boxIou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const iw = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 1;
  const ih = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 1;
  if (iw <= 0 || ih <= 0) return 0;
  const i = iw * ih;
  return i / ((a[2] - a[0] + 1) * (a[3] - a[1] + 1) + (b[2] - b[0] + 1) * (b[3] - b[1] + 1) - i);
}
// a mask of the decoder enlarged to the image (bilinear from 256 × 256: the square of 1024 is the image enlarged and
// padded) over the part given (x0, y0, x1, y1: pixels of the image; absent: all of it): 1 inside, 0 outside
export function maskOver(m: Float32Array, off: number, w: number, h: number, part?: [number, number, number, number]): { mask: Float32Array; x0: number; y0: number; mw: number; mh: number } {
  const s = SAM_SIZE / Math.max(w, h);
  const [x0, y0, x1, y1] = part ? [Math.max(0, part[0]), Math.max(0, part[1]), Math.min(w - 1, part[2]), Math.min(h - 1, part[3])] : [0, 0, w - 1, h - 1];
  const [mw, mh] = [x1 - x0 + 1, y1 - y0 + 1];
  const mask = new Float32Array(Math.max(0, mw * mh));
  const f = (s * SAM_LOW) / SAM_SIZE;
  for (let y = 0; y < mh; y++) {
    const v = Math.min(SAM_LOW - 1, Math.max(0, (y + y0 + 0.5) * f - 0.5));
    const j = Math.min(SAM_LOW - 2, Math.floor(v));
    const fy = v - j;
    for (let x = 0; x < mw; x++) {
      const u = Math.min(SAM_LOW - 1, Math.max(0, (x + x0 + 0.5) * f - 0.5));
      const i = Math.min(SAM_LOW - 2, Math.floor(u));
      const fx = u - i;
      const o = off + j * SAM_LOW + i;
      const val = (m[o] * (1 - fx) + m[o + 1] * fx) * (1 - fy) + (m[o + SAM_LOW] * (1 - fx) + m[o + SAM_LOW + 1] * fx) * fy;
      mask[y * mw + x] = val > 0 ? 1 : 0;
    }
  }
  return { mask, x0, y0, mw, mh };
}
// the outline of a mask (its largest piece, its holes filled), in pixels of the image
export function maskOutline(mk: { mask: Float32Array; x0: number; y0: number; mw: number; mh: number }): Pt[] | null {
  if (mk.mw < 2 || mk.mh < 2) return null;
  const { outlines } = findParticles(mk.mask, mk.mw, mk.mh, { ...PARTICLE_DEFAULTS, minSize: 1 });
  let best: Pt[] | null = null;
  let bestA = 0;
  for (const o of outlines) {
    let a = 0;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) a += (o[j][0] + o[i][0]) * (o[j][1] - o[i][1]);
    if (Math.abs(a) > bestA) [best, bestA] = [o, Math.abs(a)];
  }
  return best ? best.map(([x, y]): Pt => [x + mk.x0, y + mk.y0]) : null;
}
// the points of Everything, in pixels of the image (rows: those above the data bar)
export function gridPoints(w: number, h: number, n: number, rows = h): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [x, y] = [((i + 0.5) / n) * w, ((j + 0.5) / n) * h];
      if (y < rows) out.push([x, y]);
    }
  return out;
}
// Everything: of the candidates (every point's three masks), those sure, stable, not too small or large, the best of
// those that overlap (by their boxes, the surer first); their indices
export type SamCandidate = { iou: number; stability: number; box: [number, number, number, number]; area: number; edge: boolean };
export function keepMasks(c: SamCandidate[], o: SamOpts, w: number, h: number): number[] {
  const [nw, nh] = samSize(w, h);
  // (a low-resolution pixel's area in pixels of the image)
  const px = ((4 * Math.max(w, h)) / SAM_SIZE) ** 2;
  const full = Math.ceil(nw / 4) * Math.ceil(nh / 4);
  const ok = c
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.iou >= o.iou && q.stability >= o.stability && q.area * px >= o.minArea && q.area <= o.maxFrac * full && !(o.edges && q.edge))
    .sort((a, b) => b.q.iou - a.q.iou);
  const kept: { q: SamCandidate; i: number }[] = [];
  for (const k of ok) if (!kept.some((p) => boxIou(p.q.box, k.q.box) > o.nms)) kept.push(k);
  return kept.map((k) => k.i);
}
// of the masks kept (low resolution, 1 inside), those that are not one particle: a mask that holds two or more of the
// others (most of each inside it) is a cluster of them, left out; a mask inside a single other is a piece of it, left
// out; their indices kept
export function dropNested(masks: Uint8Array[]): number[] {
  const area = masks.map((m) => m.reduce((s, v) => s + v, 0));
  const inside = masks.map(() => [] as number[]);
  for (let a = 0; a < masks.length; a++)
    for (let b = 0; b < masks.length; b++) {
      if (a === b || area[b] >= area[a] || !area[b]) continue;
      let both = 0;
      const [ma, mb] = [masks[a], masks[b]];
      for (let i = 0; i < ma.length; i++) both += ma[i] & mb[i];
      if (both > 0.8 * area[b]) inside[a].push(b);
    }
  const out = new Set<number>();
  inside.forEach((list, a) => {
    if (list.length >= 2) out.add(a);
  });
  inside.forEach((list, a) => {
    if (list.length === 1 && !out.has(a)) out.add(list[0]);
  });
  return masks.map((_, i) => i).filter((i) => !out.has(i));
}
// an outline of a mask (a staircase of pixels) thinned to the points that matter (Douglas–Peucker, eps px): a polygon
// whose points can be dragged
export function thinOutline(pts: Pt[], eps = 0.75): Pt[] {
  if (pts.length < 4) return pts;
  let far = 0;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  const dp = (p: Pt[]): Pt[] => {
    if (p.length < 3) return p;
    const [a, b] = [p[0], p[p.length - 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let [d, at] = [-1, 0];
    for (let i = 1; i < p.length - 1; i++) {
      const q = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L;
      if (q > d) [d, at] = [q, i];
    }
    return d > eps ? [...dp(p.slice(0, at + 1)).slice(0, -1), ...dp(p.slice(at))] : [a, b];
  };
  const one = dp(pts.slice(0, far + 1));
  const two = dp([...pts.slice(far), pts[0]]);
  return [...one.slice(0, -1), ...two.slice(0, -1)];
}
