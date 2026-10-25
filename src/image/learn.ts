// The classifier of Find like this ▸ Review: from the particles kept (good) and those left out (not), what tells them
// apart, learnt by one of four methods (logistic regression, linear discriminant analysis, the k nearest neighbours,
// a random forest) on the features of every place found (standardized first); the probability of every other place
// being a good particle. Auto: the method most often right when every example is left out in turn and guessed from the
// others (leave-one-out). How much each feature counts: how much the probabilities move when its values are shuffled.
// Logistic regression, LDA and k-NN are as scikit-learn's (LogisticRegression C = 1; LinearDiscriminantAnalysis lsqr
// with the Ledoit–Wolf shrinkage; KNeighborsClassifier weighted by distance), on the same standardized features. Pure.

export type LearnMethod = 'logistic' | 'lda' | 'knn' | 'forest';
export const LEARN_METHODS: LearnMethod[] = ['logistic', 'lda', 'knn', 'forest'];
export const LEARN_LABELS: Record<LearnMethod, string> = { logistic: 'Logistic', lda: 'LDA', knn: 'k-NN', forest: 'Forest' };
type Predict = (x: number[]) => number;

// ---- standardized features: (x − mean) / sd, a feature that never changes left as it is (sd 1) ----
export function scaler(X: number[][]): (x: number[]) => number[] {
  const p = X[0]?.length ?? 0;
  const mean = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j], 0) / X.length);
  const sd = Array.from({ length: p }, (_, j) => {
    const v = Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / X.length);
    return v > 1e-12 ? v : 1;
  });
  return (x) => x.map((v, j) => (v - mean[j]) / sd[j]);
}

// a square system solved (Gaussian elimination, partial pivoting); null: singular
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

// ---- logistic regression: ½‖w‖² + C Σ log-loss (the intercept not penalized), by Newton's method ----
export function fitLogistic(X: number[][], y: number[], C = 1): Predict {
  const p = X[0].length;
  let beta = new Array<number>(p + 1).fill(0); // [w…, b]
  for (let it = 0; it < 100; it++) {
    const g = new Array<number>(p + 1).fill(0);
    const H = Array.from({ length: p + 1 }, () => new Array<number>(p + 1).fill(0));
    for (let j = 0; j < p; j++) {
      g[j] = beta[j];
      H[j][j] = 1;
    }
    X.forEach((x, i) => {
      const z = beta[p] + x.reduce((s, v, j) => s + v * beta[j], 0);
      const pr = sigmoid(z);
      const xe = [...x, 1];
      const r = C * (pr - y[i]);
      const wgt = C * pr * (1 - pr);
      for (let a = 0; a <= p; a++) {
        g[a] += r * xe[a];
        for (let b = 0; b <= p; b++) H[a][b] += wgt * xe[a] * xe[b];
      }
    });
    const step = solve(H, g);
    if (!step) break;
    beta = beta.map((v, k) => v - step[k]);
    if (Math.max(...step.map(Math.abs)) < 1e-10) break;
  }
  return (x) => sigmoid(beta[p] + x.reduce((s, v, j) => s + v * beta[j], 0));
}

// ---- linear discriminant analysis: the classes' covariance shrunk by Ledoit and Wolf, as scikit-learn's lsqr ----
// the Ledoit–Wolf covariance of samples (centred here): (1 − s) S + s μ I
function ledoitWolf(X: number[][]): number[][] {
  const [n, p] = [X.length, X[0].length];
  const mean = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n);
  const Xc = X.map((r) => r.map((v, j) => v - mean[j]));
  const S = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => Xc.reduce((s, r) => s + r[a] * r[b], 0) / n));
  if (p === 1) return S;
  const tr = Array.from({ length: p }, (_, j) => Xc.reduce((s, r) => s + r[j] * r[j], 0) / n);
  const mu = tr.reduce((s, v) => s + v, 0) / p;
  let beta_ = 0;
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) beta_ += Xc.reduce((s, r) => s + r[a] * r[a] * r[b] * r[b], 0);
  let delta_ = 0;
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) delta_ += (S[a][b] * n) ** 2;
  delta_ /= n * n;
  let beta = (beta_ / n - delta_) / (p * n);
  let delta = delta_ - 2 * mu * tr.reduce((s, v) => s + v, 0) + p * mu * mu;
  delta /= p;
  beta = Math.min(beta, delta);
  const sh = beta === 0 ? 0 : beta / delta;
  return S.map((r, a) => r.map((v, b) => (1 - sh) * v + (a === b ? sh * mu : 0)));
}
// a class's covariance: its samples standardized, shrunk, scaled back
function classCov(X: number[][]): number[][] {
  const p = X[0].length;
  const mean = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j], 0) / X.length);
  const sd = Array.from({ length: p }, (_, j) => {
    const v = Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / X.length);
    return v > 1e-12 ? v : 1;
  });
  const S = ledoitWolf(X.map((r) => r.map((v, j) => (v - mean[j]) / sd[j])));
  return S.map((r, a) => r.map((v, b) => sd[a] * v * sd[b]));
}
export function fitLDA(X: number[][], y: number[]): Predict {
  const p = X[0].length;
  const groups = [0, 1].map((c) => X.filter((_, i) => y[i] === c));
  const priors = groups.map((g) => g.length / X.length);
  const means = groups.map((g) => Array.from({ length: p }, (_, j) => g.reduce((s, r) => s + r[j], 0) / g.length));
  const covs = groups.map(classCov);
  const cov = covs[0].map((r, a) => r.map((v, b) => priors[0] * v + priors[1] * covs[1][a][b]));
  const coefs = means.map((m) => solve(cov, m) ?? new Array<number>(p).fill(0));
  const intercepts = coefs.map((cf, k) => -0.5 * cf.reduce((s, v, j) => s + v * means[k][j], 0) + Math.log(priors[k]));
  const w = coefs[1].map((v, j) => v - coefs[0][j]);
  const b = intercepts[1] - intercepts[0];
  return (x) => sigmoid(b + x.reduce((s, v, j) => s + v * w[j], 0));
}

// ---- the k nearest neighbours, each weighted by 1 / its distance (those at no distance alone) ----
export function fitKnn(X: number[][], y: number[], k = 5): Predict {
  const kk = Math.max(1, Math.min(k, X.length));
  return (x) => {
    const d = X.map((r, i) => ({ d: Math.sqrt(r.reduce((s, v, j) => s + (v - x[j]) ** 2, 0)), y: y[i] })).sort((a, b) => a.d - b.d).slice(0, kk);
    const zero = d.filter((q) => q.d === 0);
    const use = zero.length ? zero.map((q) => ({ w: 1, y: q.y })) : d.map((q) => ({ w: 1 / q.d, y: q.y }));
    const sw = use.reduce((s, q) => s + q.w, 0);
    return use.reduce((s, q) => s + q.w * q.y, 0) / sw;
  };
}

// ---- a random forest: 60 trees, each on a sample drawn with replacement, √p features tried at every split (Gini) ----
type Node = { leaf: number } | { j: number; t: number; l: Node; r: Node };
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function grow(X: number[][], y: number[], idx: number[], depth: number, mtry: number, rnd: () => number): Node {
  const pos = idx.reduce((s, i) => s + y[i], 0);
  if (depth >= 8 || idx.length < 2 || pos === 0 || pos === idx.length) return { leaf: pos / idx.length };
  const p = X[0].length;
  const feats = Array.from({ length: p }, (_, j) => j);
  for (let i = p - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [feats[i], feats[k]] = [feats[k], feats[i]];
  }
  let best: { j: number; t: number; g: number } | null = null;
  const gini = (n: number, ps: number) => (n ? 1 - (ps / n) ** 2 - (1 - ps / n) ** 2 : 0);
  for (const j of feats.slice(0, mtry)) {
    const sorted = [...idx].sort((a, b) => X[a][j] - X[b][j]);
    let lp = 0;
    for (let k = 0; k < sorted.length - 1; k++) {
      lp += y[sorted[k]];
      const [a, b] = [X[sorted[k]][j], X[sorted[k + 1]][j]];
      if (a === b) continue;
      const nl = k + 1;
      const g = (nl * gini(nl, lp) + (idx.length - nl) * gini(idx.length - nl, pos - lp)) / idx.length;
      if (!best || g < best.g) best = { j, t: (a + b) / 2, g };
    }
  }
  if (!best) return { leaf: pos / idx.length };
  const { j, t } = best;
  return { j, t, l: grow(X, y, idx.filter((i) => X[i][j] <= t), depth + 1, mtry, rnd), r: grow(X, y, idx.filter((i) => X[i][j] > t), depth + 1, mtry, rnd) };
}
const walk = (n: Node, x: number[]): number => ('leaf' in n ? n.leaf : walk(x[n.j] <= n.t ? n.l : n.r, x));
export function fitForest(X: number[][], y: number[], seed = 1): Predict {
  const rnd = rng(seed);
  const mtry = Math.max(1, Math.round(Math.sqrt(X[0].length)));
  const trees = Array.from({ length: 60 }, () => grow(X, y, Array.from({ length: X.length }, () => Math.floor(rnd() * X.length)), 0, mtry, rnd));
  return (x) => trees.reduce((s, t) => s + walk(t, x), 0) / trees.length;
}

// ---- a method fitted, its features standardized on the examples given ----
export function fitMethod(method: LearnMethod, X: number[][], y: number[]): Predict {
  const sc = scaler(X);
  const Z = X.map(sc);
  const f = method === 'logistic' ? fitLogistic(Z, y) : method === 'lda' ? fitLDA(Z, y) : method === 'knn' ? fitKnn(Z, y) : fitForest(Z, y);
  return (x) => f(sc(x));
}
// how often a method is right on every example left out in turn (fitted on the others); NaN: too few of a class
export function looAccuracy(method: LearnMethod, X: number[][], y: number[]): number {
  if (Math.min(y.filter((v) => v === 1).length, y.filter((v) => v === 0).length) < 2) return NaN;
  let right = 0;
  for (let i = 0; i < X.length; i++) {
    const keep = X.map((_, k) => k).filter((k) => k !== i);
    const f = fitMethod(method, keep.map((k) => X[k]), keep.map((k) => y[k]));
    if ((f(X[i]) >= 0.5 ? 1 : 0) === y[i]) right++;
  }
  return right / X.length;
}
// how much each feature counts: the mean change of the probabilities when its values are shuffled (5 times), the parts
// of the whole
export function importance(f: Predict, X: number[][]): number[] {
  const p = X[0].length;
  const base = X.map(f);
  const rnd = rng(7);
  const raw = Array.from({ length: p }, (_, j) => {
    let s = 0;
    for (let rep = 0; rep < 5; rep++) {
      const col = X.map((r) => r[j]);
      for (let i = col.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        [col[i], col[k]] = [col[k], col[i]];
      }
      s += X.reduce((t, r, i) => t + Math.abs(f(r.map((v, jj) => (jj === j ? col[i] : v))) - base[i]), 0) / X.length;
    }
    return s / 5;
  });
  const sum = raw.reduce((s, v) => s + v, 0);
  return raw.map((v) => (sum > 0 ? v / sum : 1 / p));
}

export const LEAST_EXAMPLES = 3;
// The classifier learnt from the examples (y: 1 good, 0 not): the method (auto: the most often right), how often each
// is right, how much each feature counts; null: fewer than LEAST_EXAMPLES of a kind
export function learn(X: number[][], y: number[], method: LearnMethod | 'auto'): { method: LearnMethod; accuracy: Record<LearnMethod, number>; importance: number[]; predict: Predict } | null {
  const [good, bad] = [y.filter((v) => v === 1).length, y.filter((v) => v === 0).length];
  if (good < LEAST_EXAMPLES || bad < LEAST_EXAMPLES) return null;
  const accuracy = Object.fromEntries(LEARN_METHODS.map((m) => [m, looAccuracy(m, X, y)])) as Record<LearnMethod, number>;
  // (auto: the most accurate; of those as accurate, the first of the list: the simplest)
  const chosen = method === 'auto' ? LEARN_METHODS.reduce((b, m) => (accuracy[m] > accuracy[b] ? m : b), LEARN_METHODS[0]) : method;
  const predict = fitMethod(chosen, X, y);
  return { method: chosen, accuracy, importance: importance(predict, X), predict };
}
