// A trainable pixel classifier (Image analysis; as ImageJ's Trainable Weka Segmentation): the examples drawn on the image
// (selections given a class: object, background, edge …) teach a random forest what each class looks like — every
// pixel described by its value and its neighbourhood at several scales (smoothed, its gradient, the difference of two
// smoothings, the Hessian's eigenvalues, the local variance) —; then every pixel gets the class most trees give it.
// Seeded: the same examples give the same result. Pure.
import { gaussian, luminance, type Raster } from './raster.ts';
import { hessianEigen, varianceFilter } from './filters.ts';
import { fillPolygon, isArea, roiOutline, type Pt, type Roi } from './roi.ts';

// the colours of the classes (their examples drawn in them)
export const CLASS_COLORS = ['#ff453a', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a', '#64d2ff'];
// an example: its class, its outline (an area) or its line (pixels along it, `width` across), in pixels of the image
// classified
export type TrainExample = { cls: string; pts: Pt[]; line: boolean; width: number };

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

const SIGMAS = [1, 2, 4, 8];
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

// the pixels of every example (an area: inside it; a line: along it, its width across), by class
export function examplePixels(ex: TrainExample[], w: number, h: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const e of ex) {
    const list = out.get(e.cls) ?? [];
    out.set(e.cls, list);
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
export function trainForest(x: Float32Array[], y: Uint8Array, classes: string[], o: { trees: number; depth: number; minLeaf: number; seed: number }): Forest {
  const nf = x.length;
  const nc = classes.length;
  const ns = y.length;
  const rnd = rng(o.seed);
  const mtry = Math.max(1, Math.round(Math.sqrt(nf)));
  const trees: Tree[] = [];
  for (let t = 0; t < o.trees; t++) {
    const cap = 2 * ns + 1;
    const tr: Tree = { feat: new Int32Array(cap).fill(-1), thr: new Float32Array(cap), left: new Int32Array(cap), right: new Int32Array(cap), prob: new Float32Array(cap * nc), size: 0 };
    const idx = Int32Array.from({ length: ns }, () => Math.floor(rnd() * ns));
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
          for (let q = 0; q < 8; q++) {
            const th = xf[idx[from + Math.floor(rnd() * n)]];
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
// share of the votes for every class at every pixel; null with fewer than two classes of examples
export function classifyPixels(r: Raster, ex: TrainExample[], o: { trees: number; scale?: number; perClass?: number; seed?: number }): { classes: string[]; prob: Float32Array[]; samples: number[] } | null {
  const px = examplePixels(ex, r.w, r.h);
  const classes = [...px.keys()].filter((c) => (px.get(c)?.length ?? 0) > 0);
  if (classes.length < 2) return null;
  const { f } = pixelFeatures(r, o.scale ?? 1);
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
  const forest = trainForest(x, Uint8Array.from(lab), classes, { trees: Math.max(1, Math.round(o.trees)), depth: 14, minLeaf: 2, seed: o.seed ?? 7 });
  return { classes, prob: predictForest(forest, f, r.w * r.h), samples };
}
