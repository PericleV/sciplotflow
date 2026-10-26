// A trainable pixel classifier (Image analysis; as ImageJ's Trainable Weka Segmentation): the examples drawn on the image
// (selections given a class: object, background, edge …) teach a random forest what each class looks like — every
// pixel described by its value and its neighbourhood at several scales (smoothed, its gradient, the difference of two
// smoothings, the Hessian's eigenvalues, the local variance) —; then every pixel gets the class most trees give it.
// Seeded: the same examples give the same result. Pure.
import { gaussian, luminance, type Raster } from './raster.ts';
import { hessianEigen, varianceFilter } from './filters.ts';
import { fillPolygon, isArea, roiOutline, type Pt, type Roi } from './roi.ts';
import { trainBoosted, trainMlp, type PixelModel } from './pixelModels.ts';

// the colours of the classes (their examples drawn in them)
export const CLASS_COLORS = ['#ff453a', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a', '#64d2ff'];
export const classColor = (classes: string[], c: string) => CLASS_COLORS[Math.max(0, classes.indexOf(c)) % CLASS_COLORS.length];
// an example: its class, its outline (an area) or its line (pixels along it, `width` across), in pixels of the image
// classified
// px: pixels painted (their indices in the part analysed, pw wide) instead of an outline or a line; key: what tells them
// apart
export type TrainExample = { cls: string; pts: Pt[]; line: boolean; width: number; px?: Int32Array; pw?: number; key?: string };
// the examples as a key (the pixels painted by their key: not every index)
export const trainKeyOf = (ex: TrainExample[]) => JSON.stringify(ex, (k, v: unknown) => (k === 'px' ? undefined : v));

// The examples among the selections (those given a class), in pixels of the part analysed (its corner at ox, oy of the
// original): an area, or a line (any other: its points joined) 3 px wide unless it says
export function trainingExamples(rois: Roi[], ox: number, oy: number): TrainExample[] {
  return rois
    .filter((r) => r.train)
    .map((r) => {
      const pts = roiOutline(r).map(([x, y]): Pt => [x - ox, y - oy]);
      return { cls: r.train!, pts: pts.length === 1 ? [pts[0], pts[0]] : pts, line: !isArea(r), width: r.width && r.width > 1 ? r.width : 3 };
    });
}

// ---- the features ----

// (16: large particles on an enlarged image)
const SIGMAS = [1, 2, 4, 8, 16];
// every pixel's features (scale: the image is a preview shrunk by it — the scales shrunk with it)
export function pixelFeatures(r: Raster, scale = 1): { names: string[]; f: Float32Array[] } {
  const { w, h } = r;
  const g = r.ch.length === 1 ? r.ch[0] : luminance(r);
  const names: string[] = ['value'];
  const f: Float32Array[] = [g];
  if (r.ch.length === 3)
    r.ch.forEach((c, j) => {
      names.push(`channel ${'RGB'[j]}`);
      f.push(c);
    });
  const sm: Float32Array[] = [];
  for (const s0 of SIGMAS) {
    const s = Math.max(0.5, s0 * scale);
    const b = gaussian(g, w, h, s);
    sm.push(b);
    names.push(`Gaussian ${s0}`);
    f.push(b);
    // (the gradient's magnitude of the smoothed image)
    const gm = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = b[y * w + Math.min(w - 1, x + 1)] - b[y * w + Math.max(0, x - 1)];
        const dy = b[Math.min(h - 1, y + 1) * w + x] - b[Math.max(0, y - 1) * w + x];
        gm[i] = Math.sqrt(dx * dx + dy * dy) / 2;
      }
    names.push(`gradient ${s0}`);
    f.push(gm);
    if (s0 <= 4) {
      names.push(`Hessian larger ${s0}`, `Hessian smaller ${s0}`);
      f.push(hessianEigen(g, w, h, s, 'larger'), hessianEigen(g, w, h, s, 'smaller'));
    }
  }
  for (let k = 0; k + 1 < sm.length; k++) {
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = sm[k][i] - sm[k + 1][i];
    names.push(`DoG ${SIGMAS[k]}–${SIGMAS[k + 1]}`);
    f.push(d);
  }
  for (const r0 of [2, 4, 8]) {
    names.push(`variance ${r0}`);
    f.push(varianceFilter(g, w, h, Math.max(1, Math.round(r0 * scale)), 'square'));
  }
  return { names, f };
}

// The features of an image kept for the next examples: they do not depend on them, and are most of the time a training
// takes (the two last images: the preview and the full size the editor computes in turn). Kept by the image's own
// arrays (the steps before give the same arrays while they do not change) and the scale
const featureCache: { key: Float32Array[]; scale: number; out: ReturnType<typeof pixelFeatures> }[] = [];
export function featuresOf(r: Raster, scale = 1): ReturnType<typeof pixelFeatures> {
  const hit = featureCache.find((e) => e.scale === scale && e.key.length === r.ch.length && e.key.every((c, j) => c === r.ch[j]));
  if (hit) return hit.out;
  const out = pixelFeatures(r, scale);
  featureCache.unshift({ key: r.ch, scale, out });
  featureCache.length = Math.min(featureCache.length, 2);
  return out;
}

// Edges made from the outlines of the objects: the pixels just outside every area example of the class `from` (within
// `ring` px of it, inside none of them) — the ring around a particle outlined, and the gap where two outlined ones touch
export function edgeRing(ex: TrainExample[], from: string, ring: number, w: number, h: number): number[] {
  const areas = ex.filter((e) => e.cls === from && !e.line);
  if (!areas.length || !(ring > 0)) return [];
  const inside = new Uint8Array(w * h);
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (const e of areas) {
    // (painted: its pixels)
    if (e.px) {
      for (const i of e.px) {
        const [gx, gy] = [i % w, Math.floor(i / w)];
        inside[i] = 1;
        [x0, y0, x1, y1] = [Math.min(x0, gx), Math.min(y0, gy), Math.max(x1, gx), Math.max(y1, gy)];
      }
      continue;
    }
    const win = fillPolygon(e.pts, w, h);
    for (let y = 0; y < win.h; y++)
      for (let x = 0; x < win.w; x++)
        if (win.m[y * win.w + x]) {
          const [gx, gy] = [win.x0 + x, win.y0 + y];
          inside[gy * w + gx] = 1;
          [x0, y0, x1, y1] = [Math.min(x0, gx), Math.min(y0, gy), Math.max(x1, gx), Math.max(y1, gy)];
        }
  }
  if (x1 < 0) return [];
  // (the offsets of a disc of the ring's radius)
  const R = Math.ceil(ring);
  const disc: [number, number][] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if ((dx || dy) && Math.hypot(dx, dy) <= ring + 0.5) disc.push([dx, dy]);
  const out: number[] = [];
  for (let y = Math.max(0, y0 - R); y <= Math.min(h - 1, y1 + R); y++)
    for (let x = Math.max(0, x0 - R); x <= Math.min(w - 1, x1 + R); x++) {
      if (inside[y * w + x]) continue;
      for (const [dx, dy] of disc) {
        const [u, v] = [x + dx, y + dy];
        if (u >= 0 && v >= 0 && u < w && v < h && inside[v * w + u]) {
          out.push(y * w + x);
          break;
        }
      }
    }
  return out;
}

// the class the edges made from the outlines go to: the one named edge (or border), else “edge”
export const edgeClassOf = (classes: string[]) => classes.find((c) => /^(edge|border)/i.test(c)) ?? 'edge';

// the pixels of every example (an area: inside it; a line: along it, its width across), by class; auto: edges made
// from the outlines of the class `from` (edgeRing), added to the class `to`
export function examplePixels(ex: TrainExample[], w: number, h: number, auto?: { from: string; to: string; ring: number }): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const e of ex) {
    const list = out.get(e.cls) ?? [];
    out.set(e.cls, list);
    if (e.px) {
      for (const i of e.px) if (i < w * h) list.push(i);
      continue;
    }
    if (!e.line) {
      const win = fillPolygon(e.pts, w, h);
      for (let y = 0; y < win.h; y++) for (let x = 0; x < win.w; x++) if (win.m[y * win.w + x]) list.push((win.y0 + y) * w + win.x0 + x);
      continue;
    }
    const seen = new Set<number>();
    const rad = Math.max(0.5, e.width / 2);
    for (let k = 1; k < e.pts.length; k++) {
      const [a, b] = [e.pts[k - 1], e.pts[k]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L * 2));
      for (let t = 0; t <= n; t++) {
        const x = a[0] + ((b[0] - a[0]) * t) / n;
        const y = a[1] + ((b[1] - a[1]) * t) / n;
        for (let yy = Math.floor(y - rad); yy <= Math.floor(y + rad); yy++)
          for (let xx = Math.floor(x - rad); xx <= Math.floor(x + rad); xx++) {
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > rad + 0.5) continue;
            const i = yy * w + xx;
            if (!seen.has(i)) {
              seen.add(i);
              list.push(i);
            }
          }
      }
    }
  }
  if (auto && auto.ring > 0) {
    const ring = edgeRing(ex, auto.from, auto.ring, w, h);
    if (ring.length) out.set(auto.to, [...new Set([...(out.get(auto.to) ?? []), ...ring])]);
  }
  return out;
}

// ---- the random forest ----

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// a tree: at every node the feature and the threshold (left: below), its children; a leaf: feature −1, the share of
// every class among the samples that reached it
type Tree = { feat: Int32Array; thr: Float32Array; left: Int32Array; right: Int32Array; prob: Float32Array; size: number };
export type Forest = { trees: Tree[]; classes: string[]; nf: number };

// trained on the samples (x[f][s]: feature f of sample s; y: their classes): trees on bootstrap samples, at every node
// √F features tried at 8 thresholds each (values of samples there) — the split that lowers the Gini impurity most
// extra: extremely randomized trees (Geurts, Ernst and Wehenkel 2006): every tree on all the samples, at every node √F
// features each tried at one threshold drawn between their least and largest value there
export function trainForest(x: Float32Array[], y: Uint8Array, classes: string[], o: { trees: number; depth: number; minLeaf: number; seed: number; extra?: boolean }): Forest {
  const nf = x.length;
  const nc = classes.length;
  const ns = y.length;
  const rnd = rng(o.seed);
  const mtry = Math.max(1, Math.round(Math.sqrt(nf)));
  const trees: Tree[] = [];
  for (let t = 0; t < o.trees; t++) {
    const cap = 2 * ns + 1;
    const tr: Tree = { feat: new Int32Array(cap).fill(-1), thr: new Float32Array(cap), left: new Int32Array(cap), right: new Int32Array(cap), prob: new Float32Array(cap * nc), size: 0 };
    const idx = Int32Array.from({ length: ns }, (_, s) => (o.extra ? s : Math.floor(rnd() * ns)));
    const counts = new Float64Array(nc);
    const cl = new Float64Array(nc);
    const grow = (from: number, to: number, depth: number): number => {
      const node = tr.size++;
      counts.fill(0);
      for (let i = from; i < to; i++) counts[y[idx[i]]]++;
      const n = to - from;
      const pure = counts.some((c) => c === n);
      let best = { gain: 0, f: -1, thr: 0 };
      if (!pure && depth < o.depth && n >= 2 * o.minLeaf) {
        let gini0 = 1;
        for (let c = 0; c < nc; c++) gini0 -= (counts[c] / n) ** 2;
        for (let m = 0; m < mtry; m++) {
          const f = Math.floor(rnd() * nf);
          const xf = x[f];
          let [lo, hi] = [Infinity, -Infinity];
          if (o.extra)
            for (let i = from; i < to; i++) {
              const v = xf[idx[i]];
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          if (o.extra && !(hi > lo)) continue;
          for (let q = 0; q < (o.extra ? 1 : 8); q++) {
            const th = o.extra ? lo + rnd() * (hi - lo) : xf[idx[from + Math.floor(rnd() * n)]];
            cl.fill(0);
            let nl = 0;
            for (let i = from; i < to; i++) {
              const s = idx[i];
              if (xf[s] < th) {
                cl[y[s]]++;
                nl++;
              }
            }
            const nr = n - nl;
            if (nl < o.minLeaf || nr < o.minLeaf) continue;
            let gl = 1;
            let gr = 1;
            for (let c = 0; c < nc; c++) {
              gl -= (cl[c] / nl) ** 2;
              gr -= ((counts[c] - cl[c]) / nr) ** 2;
            }
            const gain = gini0 - (nl / n) * gl - (nr / n) * gr;
            if (gain > best.gain) best = { gain, f, thr: th };
          }
        }
      }
      if (best.f < 0) {
        for (let c = 0; c < nc; c++) tr.prob[node * nc + c] = counts[c] / n;
        return node;
      }
      // (the samples below the threshold first)
      let a = from;
      let b = to - 1;
      const xf = x[best.f];
      while (a <= b) {
        if (xf[idx[a]] < best.thr) a++;
        else {
          const t = idx[a];
          idx[a] = idx[b];
          idx[b--] = t;
        }
      }
      tr.feat[node] = best.f;
      tr.thr[node] = best.thr;
      tr.left[node] = grow(from, a, depth + 1);
      tr.right[node] = grow(a, to, depth + 1);
      return node;
    };
    grow(0, ns, 0);
    trees.push(tr);
  }
  return { trees, classes, nf };
}

// the share of the trees' votes for every class at every pixel (f: the features of the pixels)
export function predictForest(forest: Forest, f: Float32Array[], n: number): Float32Array[] {
  const nc = forest.classes.length;
  const out = Array.from({ length: nc }, () => new Float32Array(n));
  const k = 1 / forest.trees.length;
  for (const t of forest.trees)
    for (let i = 0; i < n; i++) {
      let node = 0;
      while (t.feat[node] >= 0) node = f[t.feat[node]][i] < t.thr[node] ? t.left[node] : t.right[node];
      const o = node * nc;
      for (let c = 0; c < nc; c++) out[c][i] += t.prob[o + c] * k;
    }
  return out;
}

// The classes of the examples (in the order first met), the forest trained on at most `perClass` pixels of each, the
// share of the votes for every class at every pixel; null with fewer than two classes of examples. auto: edges made
// from the outlines (examplePixels)
// method: the learner (the random forest, extremely randomized trees, gradient boosted trees, a small neural network, or
// auto: the most often right)
export type PixelMethod = 'forest' | 'extra' | 'boost' | 'mlp';
export const PIXEL_METHODS: PixelMethod[] = ['forest', 'extra', 'boost', 'mlp'];
export const PIXEL_LABELS: Record<PixelMethod, string> = { forest: 'random forest', extra: 'extra trees', boost: 'boosted trees', mlp: 'neural network' };
export function classifyPixels(r: Raster, ex: TrainExample[], o: { trees: number; scale?: number; perClass?: number; seed?: number; auto?: { from: string; to: string; ring: number }; method?: PixelMethod | 'auto' }): { classes: string[]; prob: Float32Array[]; samples: number[]; method: PixelMethod; accuracy?: Partial<Record<PixelMethod, number>> } | null {
  const px = examplePixels(ex, r.w, r.h, o.auto);
  const classes = [...px.keys()].filter((c) => (px.get(c)?.length ?? 0) > 0);
  if (classes.length < 2) return null;
  const { f } = featuresOf(r, o.scale ?? 1);
  const rnd = rng(o.seed ?? 7);
  const per = o.perClass ?? 3000;
  const sample: number[] = [];
  const lab: number[] = [];
  const samples: number[] = [];
  classes.forEach((c, k) => {
    const list = [...px.get(c)!];
    // (at most `per` of a class: a random part of them)
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const take = list.slice(0, per);
    samples.push(take.length);
    for (const i of take) {
      sample.push(i);
      lab.push(k);
    }
  });
  const x = f.map((c) => {
    const v = new Float32Array(sample.length);
    for (let s = 0; s < sample.length; s++) v[s] = c[sample[s]];
    return v;
  });
  const y = Uint8Array.from(lab);
  const nc = classes.length;
  const trees = Math.max(1, Math.round(o.trees));
  const seed = o.seed ?? 7;
  const train = (m: PixelMethod, xs: Float32Array[], ys: Uint8Array): PixelModel => {
    if (m === 'boost') return trainBoosted(xs, ys, nc, trees);
    if (m === 'mlp') return trainMlp(xs, ys, nc, seed);
    const forest = trainForest(xs, ys, classes, { trees, depth: 14, minLeaf: 2, seed, extra: m === 'extra' });
    return { predict: (fs, n) => predictForest(forest, fs, n) };
  };
  // (auto: every method trained on three quarters of the samples, the one most often right on the quarter kept out —
  // the mean of the classes' parts right —; then trained on all of them)
  let method: PixelMethod = o.method && o.method !== 'auto' ? o.method : 'forest';
  let accuracy: Partial<Record<PixelMethod, number>> | undefined;
  if (o.method === 'auto') {
    const out = Array.from({ length: y.length }, (_, s) => s).filter((s) => s % 4 === 0);
    const kept = Array.from({ length: y.length }, (_, s) => s).filter((s) => s % 4 !== 0);
    const part = (idx: number[]) => x.map((c) => Float32Array.from(idx, (s) => c[s]));
    const [xk, xo] = [part(kept), part(out)];
    const yk = Uint8Array.from(kept, (s) => y[s]);
    accuracy = {};
    for (const m of PIXEL_METHODS) {
      const pr = train(m, xk, yk).predict(xo, out.length);
      const [right, all] = [new Float64Array(nc), new Float64Array(nc)];
      out.forEach((s, i) => {
        let best = 0;
        for (let c = 1; c < nc; c++) if (pr[c][i] > pr[best][i]) best = c;
        all[y[s]]++;
        if (best === y[s]) right[y[s]]++;
      });
      let acc = 0;
      let k = 0;
      for (let c = 0; c < nc; c++)
        if (all[c]) {
          acc += right[c] / all[c];
          k++;
        }
      accuracy[m] = k ? acc / k : 0;
      if (accuracy[m]! > accuracy[method]! || accuracy[method] === undefined) method = m;
    }
  }
  const n = r.w * r.h;
  const prob = train(method, x, y).predict(f, n);
  return { classes, prob, samples, method, ...(accuracy ? { accuracy } : {}) };
}

// ---- what is made of the votes ----

// Where the forest hesitates: 1 − (the share of the class most voted − that of the next), 0 … 1 (high: an example
// there teaches it most)
export function uncertainty(prob: Float32Array[]): Float32Array {
  const n = prob[0]?.length ?? 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let [a, b] = [0, 0];
    for (const p of prob) {
      const v = p[i];
      if (v > a) [a, b] = [v, a];
      else if (v > b) b = v;
    }
    out[i] = Math.min(1, Math.max(0, 1 - (a - b)));
  }
  return out;
}

// The objects split by the edges: seeds where the target class is sure (most votes and few for the edge class), grown
// over the pixels of the target or the edge class in the order of the edge's share (a watershed on it: two objects
// meet on its crest), then the pixels of the target class kept, a line of none where two objects meet (so they are not
// joined, not even by a corner). Without an edge class: the target's pixels, those of two seeds kept apart all the same.
export function splitByEdges(prob: Float32Array[], target: number, edge: number, w: number, h: number): { mask: Float32Array; objects: number } {
  const n = w * h;
  const best = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let b = 0;
    for (let c = 1; c < prob.length; c++) if (prob[c][i] > prob[b][i]) b = c;
    best[i] = b;
  }
  const pe = edge >= 0 ? prob[edge] : new Float32Array(n);
  const region = (i: number) => best[i] === target || (edge >= 0 && best[i] === edge);
  // the seeds: the sure pixels of the target, joined (4-neighbours); the tiny ones left out
  const label = new Int32Array(n);
  const sure = (i: number) => best[i] === target && pe[i] < 0.25;
  let objects = 0;
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (label[s] || !sure(s)) continue;
    const id = ++objects;
    const members = [s];
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const [x, y] = [i % w, (i / w) | 0];
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && !label[j] && sure(j)) {
          label[j] = id;
          members.push(j);
          stack.push(j);
        }
    }
    if (members.length < 4) {
      for (const i of members) label[i] = -1;
      objects--;
    }
  }
  // (the labels numbered again without the tiny seeds)
  const renum = new Map<number, number>();
  for (let i = 0; i < n; i++) if (label[i] > 0) label[i] = renum.get(label[i]) ?? (renum.set(label[i], renum.size + 1), renum.size);
  for (let i = 0; i < n; i++) if (label[i] < 0) label[i] = 0;
  // the watershed: a queue by the edge's share (256 levels), the lowest first
  const buckets: number[][] = Array.from({ length: 256 }, () => []);
  const lvl = (i: number) => Math.min(255, Math.max(0, Math.round(pe[i] * 255)));
  const queued = new Uint8Array(n);
  const push = (i: number) => {
    if (!queued[i]) {
      queued[i] = 1;
      buckets[lvl(i)].push(i);
    }
  };
  for (let i = 0; i < n; i++) if (label[i]) push(i);
  for (let b = 0; b < 256; b++) {
    const q = buckets[b];
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const [x, y] = [i % w, (i / w) | 0];
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || label[j] || !region(j)) continue;
        label[j] = label[i];
        // (a pixel lower than the one it came from: taken at this level, so the flood keeps to the valley)
        if (lvl(j) <= b) {
          queued[j] = 1;
          q.push(j);
        } else push(j);
      }
    }
    q.length = 0;
  }
  // the target's pixels of an object, none where an 8-neighbour belongs to another object
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!label[i] || best[i] !== target) continue;
    const [x, y] = [i % w, (i / w) | 0];
    let apart = true;
    for (let dy = -1; dy <= 1 && apart; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const [u, v] = [x + dx, y + dy];
        if (u < 0 || v < 0 || u >= w || v >= h) continue;
        const l = label[v * w + u];
        if (l && l !== label[i] && l < label[i]) {
          apart = false;
          break;
        }
      }
    if (apart) mask[i] = 1;
  }
  return { mask, objects: renum.size };
}
