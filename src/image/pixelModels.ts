// The learners of the trainable pixel classifier besides the random forest (classify.ts): extremely randomized trees,
// gradient boosted trees and a small neural network; each trained on the sampled pixels (x[f][s]: feature f of sample
// s; y: their classes) and giving the share of every class at every pixel. Seeded: the same examples give the same
// result. Pure.

export type PixelModel = { predict: (f: Float32Array[], n: number) => Float32Array[] };

export const rngOf = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---- gradient boosted trees (as LightGBM and XGBoost do it): the features cut into 32 bins by their quantiles; every
// round, for every class, a tree of depth 4 on the gradient and the curvature of the softmax's log-loss, its splits by
// the gain G²/(H + λ), its leaves −G/(H + λ) times the learning rate ----

const BINS = 32;
const LAMBDA = 1;
type BTree = { feat: Int32Array; thr: Float32Array; left: Int32Array; right: Int32Array; value: Float32Array };
export function trainBoosted(x: Float32Array[], y: Uint8Array, nc: number, rounds: number, rate = 0.3, depth = 4): PixelModel {
  const nf = x.length;
  const ns = y.length;
  // (every feature's bins: the thresholds between them, and every sample's bin)
  const edges: Float32Array[] = [];
  const bins: Uint8Array[] = [];
  for (let f = 0; f < nf; f++) {
    const sorted = Float32Array.from(x[f]).sort();
    const e: number[] = [];
    for (let b = 1; b < BINS; b++) {
      const v = sorted[Math.min(ns - 1, Math.floor((b * ns) / BINS))];
      if (!e.length || v > e[e.length - 1]) e.push(v);
    }
    edges.push(Float32Array.from(e));
    const bf = new Uint8Array(ns);
    for (let s = 0; s < ns; s++) {
      let k = 0;
      while (k < e.length && x[f][s] >= e[k]) k++;
      bf[s] = k;
    }
    bins.push(bf);
  }
  // (the start: the classes' log shares)
  const init = new Float64Array(nc);
  for (let s = 0; s < ns; s++) init[y[s]]++;
  for (let c = 0; c < nc; c++) init[c] = Math.log(Math.max(1, init[c]) / ns);
  const raw = new Float64Array(ns * nc);
  for (let s = 0; s < ns; s++) for (let c = 0; c < nc; c++) raw[s * nc + c] = init[c];
  const trees: { tree: BTree; cls: number }[] = [];
  const g = new Float64Array(ns);
  const hh = new Float64Array(ns);
  const p = new Float64Array(nc);
  const cap = 2 ** (depth + 1);
  for (let r = 0; r < rounds; r++) {
    const grads: [Float64Array, Float64Array][] = Array.from({ length: nc }, () => [new Float64Array(ns), new Float64Array(ns)]);
    for (let s = 0; s < ns; s++) {
      let m = -Infinity;
      for (let c = 0; c < nc; c++) m = Math.max(m, raw[s * nc + c]);
      let z = 0;
      for (let c = 0; c < nc; c++) z += p[c] = Math.exp(raw[s * nc + c] - m);
      for (let c = 0; c < nc; c++) {
        const q = p[c] / z;
        grads[c][0][s] = q - (y[s] === c ? 1 : 0);
        grads[c][1][s] = Math.max(1e-6, q * (1 - q));
      }
    }
    for (let c = 0; c < nc; c++) {
      g.set(grads[c][0]);
      hh.set(grads[c][1]);
      const tree: BTree = { feat: new Int32Array(cap).fill(-1), thr: new Float32Array(cap), left: new Int32Array(cap), right: new Int32Array(cap), value: new Float32Array(cap) };
      let size = 0;
      const idx = Int32Array.from({ length: ns }, (_, s) => s);
      const GH = new Float64Array(2 * BINS);
      const grow = (from: number, to: number, d: number): number => {
        const node = size++;
        let G = 0;
        let H = 0;
        for (let i = from; i < to; i++) {
          G += g[idx[i]];
          H += hh[idx[i]];
        }
        let best = { gain: 1e-9, f: -1, b: 0 };
        if (d < depth && to - from >= 10) {
          const base = (G * G) / (H + LAMBDA);
          for (let f = 0; f < nf; f++) {
            GH.fill(0);
            const bf = bins[f];
            for (let i = from; i < to; i++) {
              const s = idx[i];
              GH[2 * bf[s]] += g[s];
              GH[2 * bf[s] + 1] += hh[s];
            }
            let [gl, hl] = [0, 0];
            for (let b = 0; b < edges[f].length; b++) {
              gl += GH[2 * b];
              hl += GH[2 * b + 1];
              const [gr, hr] = [G - gl, H - hl];
              if (hl < 1e-3 || hr < 1e-3) continue;
              const gain = (gl * gl) / (hl + LAMBDA) + (gr * gr) / (hr + LAMBDA) - base;
              if (gain > best.gain) best = { gain, f, b };
            }
          }
        }
        if (best.f < 0) {
          tree.value[node] = (-G / (H + LAMBDA)) * rate;
          return node;
        }
        // (the samples in the bins up to b on the left: below the threshold between bin b and the next)
        let a = from;
        let z = to - 1;
        const bf = bins[best.f];
        while (a <= z) {
          if (bf[idx[a]] <= best.b) a++;
          else {
            const t = idx[a];
            idx[a] = idx[z];
            idx[z--] = t;
          }
        }
        tree.feat[node] = best.f;
        tree.thr[node] = edges[best.f][best.b];
        tree.left[node] = grow(from, a, d + 1);
        tree.right[node] = grow(a, to, d + 1);
        return node;
      };
      grow(0, ns, 0);
      trees.push({ tree, cls: c });
      for (let s = 0; s < ns; s++) {
        let node = 0;
        while (tree.feat[node] >= 0) node = x[tree.feat[node]][s] < tree.thr[node] ? tree.left[node] : tree.right[node];
        raw[s * nc + c] += tree.value[node];
      }
    }
  }
  return {
    predict: (f, n) => {
      const out = Array.from({ length: nc }, () => new Float32Array(n));
      const r = new Float64Array(nc);
      for (let i = 0; i < n; i++) {
        r.set(init);
        for (const { tree, cls } of trees) {
          let node = 0;
          while (tree.feat[node] >= 0) node = f[tree.feat[node]][i] < tree.thr[node] ? tree.left[node] : tree.right[node];
          r[cls] += tree.value[node];
        }
        let m = -Infinity;
        for (let c = 0; c < nc; c++) m = Math.max(m, r[c]);
        let z = 0;
        for (let c = 0; c < nc; c++) z += r[c] = Math.exp(r[c] - m);
        for (let c = 0; c < nc; c++) out[c][i] = r[c] / z;
      }
      return out;
    },
  };
}

// ---- a small neural network: the features standardized, one hidden layer of 24 ReLU units, a softmax out; trained by
// Adam (rate 0.01) on the log-loss with a little weight decay, in batches of 64, 25 passes over the samples ----

export function trainMlp(x: Float32Array[], y: Uint8Array, nc: number, seed: number, hidden = 24, epochs = 25): PixelModel {
  const nf = x.length;
  const ns = y.length;
  const mean = new Float64Array(nf);
  const sd = new Float64Array(nf);
  for (let f = 0; f < nf; f++) {
    let m = 0;
    for (let s = 0; s < ns; s++) m += x[f][s];
    m /= ns;
    let v = 0;
    for (let s = 0; s < ns; s++) v += (x[f][s] - m) ** 2;
    mean[f] = m;
    sd[f] = Math.sqrt(v / ns) || 1;
  }
  const X = new Float64Array(ns * nf);
  for (let s = 0; s < ns; s++) for (let f = 0; f < nf; f++) X[s * nf + f] = (x[f][s] - mean[f]) / sd[f];
  const rnd = rngOf(seed);
  const normal = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const H = hidden;
  // (the weights: W1 H × nf, b1, W2 nc × H, b2; He's start)
  const nw = H * nf + H + nc * H + nc;
  const w = new Float64Array(nw);
  for (let i = 0; i < H * nf; i++) w[i] = normal() * Math.sqrt(2 / nf);
  for (let i = 0; i < nc * H; i++) w[H * nf + H + i] = normal() * Math.sqrt(2 / H);
  const [o1, o2, o3] = [H * nf, H * nf + H, H * nf + H + nc * H];
  const m1 = new Float64Array(nw);
  const v1 = new Float64Array(nw);
  const grad = new Float64Array(nw);
  const hid = new Float64Array(H);
  const out = new Float64Array(nc);
  const dh = new Float64Array(H);
  const order = Int32Array.from({ length: ns }, (_, s) => s);
  const [lr, b1, b2, eps, decay, batch] = [0.01, 0.9, 0.999, 1e-8, 1e-4, 64];
  let t = 0;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = ns - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [order[i], order[k]] = [order[k], order[i]];
    }
    for (let from = 0; from < ns; from += batch) {
      grad.fill(0);
      const to = Math.min(ns, from + batch);
      for (let q = from; q < to; q++) {
        const s = order[q];
        const xo = s * nf;
        for (let j = 0; j < H; j++) {
          let z = w[o1 + j];
          for (let f = 0; f < nf; f++) z += w[j * nf + f] * X[xo + f];
          hid[j] = z > 0 ? z : 0;
        }
        let mx = -Infinity;
        for (let c = 0; c < nc; c++) {
          let z = w[o3 + c];
          for (let j = 0; j < H; j++) z += w[o2 + c * H + j] * hid[j];
          out[c] = z;
          mx = Math.max(mx, z);
        }
        let sum = 0;
        for (let c = 0; c < nc; c++) sum += out[c] = Math.exp(out[c] - mx);
        dh.fill(0);
        for (let c = 0; c < nc; c++) {
          const d = out[c] / sum - (y[s] === c ? 1 : 0);
          grad[o3 + c] += d;
          for (let j = 0; j < H; j++) {
            grad[o2 + c * H + j] += d * hid[j];
            dh[j] += d * w[o2 + c * H + j];
          }
        }
        for (let j = 0; j < H; j++) {
          if (hid[j] <= 0) continue;
          grad[o1 + j] += dh[j];
          for (let f = 0; f < nf; f++) grad[j * nf + f] += dh[j] * X[xo + f];
        }
      }
      t++;
      const n = to - from;
      const c1 = 1 - b1 ** t;
      const c2 = 1 - b2 ** t;
      for (let i = 0; i < nw; i++) {
        const gi = grad[i] / n + (i < o1 || (i >= o2 && i < o3) ? decay * w[i] : 0);
        m1[i] = b1 * m1[i] + (1 - b1) * gi;
        v1[i] = b2 * v1[i] + (1 - b2) * gi * gi;
        w[i] -= (lr * (m1[i] / c1)) / (Math.sqrt(v1[i] / c2) + eps);
      }
    }
  }
  return {
    predict: (fs, n) => {
      const res = Array.from({ length: nc }, () => new Float32Array(n));
      const xi = new Float64Array(nf);
      for (let i = 0; i < n; i++) {
        for (let f = 0; f < nf; f++) xi[f] = (fs[f][i] - mean[f]) / sd[f];
        for (let j = 0; j < H; j++) {
          let z = w[o1 + j];
          for (let f = 0; f < nf; f++) z += w[j * nf + f] * xi[f];
          hid[j] = z > 0 ? z : 0;
        }
        let mx = -Infinity;
        for (let c = 0; c < nc; c++) {
          let z = w[o3 + c];
          for (let j = 0; j < H; j++) z += w[o2 + c * H + j] * hid[j];
          out[c] = z;
          mx = Math.max(mx, z);
        }
        let sum = 0;
        for (let c = 0; c < nc; c++) sum += out[c] = Math.exp(out[c] - mx);
        for (let c = 0; c < nc; c++) res[c][i] = out[c] / sum;
      }
      return res;
    },
  };
}
