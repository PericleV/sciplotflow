// The classifier of Find like this ▸ Review: from the particles kept (good) and those left out (not), what tells them
// apart, learnt by one of seven methods (logistic regression, linear discriminant analysis, the k nearest neighbours,
// a random forest, Gaussian naive Bayes, a support vector machine, gradient boosting) on the features of every place found (standardized first); the probability of every other place
// being a good particle. Auto: the method most often right when every example is left out in turn and guessed from the
// others (leave-one-out). How much each feature counts: how much the probabilities move when its values are shuffled.
// Logistic regression, LDA, k-NN, naive Bayes, the SVM and boosting are as scikit-learn's (LogisticRegression C = 1;
// LinearDiscriminantAnalysis lsqr with the Ledoit–Wolf shrinkage; KNeighborsClassifier weighted by distance;
// GaussianNB; SVC with the RBF kernel, its decision values; GradientBoostingClassifier), on the same standardized
// features. Pure.

export type LearnMethod = 'logistic' | 'lda' | 'knn' | 'forest' | 'nb' | 'svm' | 'boost';
export const LEARN_METHODS: LearnMethod[] = ['logistic', 'lda', 'knn', 'forest', 'nb', 'svm', 'boost'];
export const LEARN_LABELS: Record<LearnMethod, string> = { logistic: 'Logistic', lda: 'LDA', knn: 'k-NN', forest: 'Forest', nb: 'Naive Bayes', svm: 'SVM', boost: 'Boosting' };
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

// ---- a support vector machine: the RBF kernel exp(−γ‖x − z‖²), γ = 1 / (p · the variance of all the values) as
// scikit-learn's gamma 'scale', C = 1; the dual solved as libsvm does (the pair of the most violating examples by the
// second order, until the gap is below 1e-10); the probability by Platt's sigmoid fitted on the decision values of the
// examples (Lin, Lin and Weng's Newton method, its targets corrected for the priors) ----
export type Svm = { decision: (x: number[]) => number; prob: Predict };
export function fitSvm(X: number[][], y: number[], C = 1): Svm {
  const n = X.length;
  const p = X[0].length;
  let m = 0;
  for (const r of X) for (const v of r) m += v;
  m /= n * p;
  let v2 = 0;
  for (const r of X) for (const v of r) v2 += (v - m) ** 2;
  const vr = v2 / (n * p);
  const gamma = vr > 0 ? 1 / (p * vr) : 1;
  const K = (a: number[], b: number[]) => {
    let s = 0;
    for (let j = 0; j < p; j++) s += (a[j] - b[j]) ** 2;
    return Math.exp(-gamma * s);
  };
  const s = y.map((v) => (v === 1 ? 1 : -1));
  const Q = X.map((a, i) => X.map((b, j) => s[i] * s[j] * K(a, b)));
  const alpha = new Float64Array(n);
  const G = new Float64Array(n).fill(-1);
  const up = (t: number) => (s[t] === 1 ? alpha[t] < C : alpha[t] > 0);
  const low = (t: number) => (s[t] === 1 ? alpha[t] > 0 : alpha[t] < C);
  const TAU = 1e-12;
  for (let it = 0; it < 100000; it++) {
    let [Gmax, i] = [-Infinity, -1];
    for (let t = 0; t < n; t++) if (up(t) && -s[t] * G[t] >= Gmax) [Gmax, i] = [-s[t] * G[t], t];
    let [Gmin, j, best] = [Infinity, -1, Infinity];
    for (let t = 0; t < n; t++) {
      if (!low(t)) continue;
      const v = -s[t] * G[t];
      if (v < Gmin) Gmin = v;
      if (i < 0) continue;
      const b = Gmax - v;
      if (b > 0) {
        const a = Math.max(TAU, Q[i][i] + Q[t][t] - 2 * s[i] * s[t] * Q[i][t]);
        if (-(b * b) / a <= best) [best, j] = [-(b * b) / a, t];
      }
    }
    if (i < 0 || j < 0 || Gmax - Gmin < 1e-10) break;
    const [ai, aj] = [alpha[i], alpha[j]];
    if (s[i] !== s[j]) {
      const quad = Math.max(TAU, Q[i][i] + Q[j][j] + 2 * Q[i][j]);
      const delta = (-G[i] - G[j]) / quad;
      const diff = alpha[i] - alpha[j];
      alpha[i] += delta;
      alpha[j] += delta;
      if (diff > 0) {
        if (alpha[j] < 0) [alpha[j], alpha[i]] = [0, diff];
      } else if (alpha[i] < 0) [alpha[i], alpha[j]] = [0, -diff];
      if (diff > 0) {
        if (alpha[i] > C) [alpha[i], alpha[j]] = [C, C - diff];
      } else if (alpha[j] > C) [alpha[j], alpha[i]] = [C, C + diff];
    } else {
      const quad = Math.max(TAU, Q[i][i] + Q[j][j] - 2 * Q[i][j]);
      const delta = (G[i] - G[j]) / quad;
      const sum = alpha[i] + alpha[j];
      alpha[i] -= delta;
      alpha[j] += delta;
      if (sum > C) {
        if (alpha[i] > C) [alpha[i], alpha[j]] = [C, sum - C];
      } else if (alpha[j] < 0) [alpha[j], alpha[i]] = [0, sum];
      if (sum > C) {
        if (alpha[j] > C) [alpha[j], alpha[i]] = [C, sum - C];
      } else if (alpha[i] < 0) [alpha[i], alpha[j]] = [0, sum];
    }
    const [di, dj] = [alpha[i] - ai, alpha[j] - aj];
    for (let t = 0; t < n; t++) G[t] += Q[t][i] * di + Q[t][j] * dj;
  }
  // (ρ: the mean of yG over the free examples; with none, the middle of its bounds)
  let [ub, lb, sum, free] = [Infinity, -Infinity, 0, 0];
  for (let t = 0; t < n; t++) {
    const yG = s[t] * G[t];
    if (alpha[t] >= C) {
      if (s[t] === -1) ub = Math.min(ub, yG);
      else lb = Math.max(lb, yG);
    } else if (alpha[t] <= 0) {
      if (s[t] === 1) ub = Math.min(ub, yG);
      else lb = Math.max(lb, yG);
    } else {
      sum += yG;
      free++;
    }
  }
  const rho = free > 0 ? sum / free : (ub + lb) / 2;
  const sv = Array.from({ length: n }, (_, t) => t).filter((t) => alpha[t] > 0);
  const decision = (x: number[]) => sv.reduce((acc, t) => acc + s[t] * alpha[t] * K(X[t], x), 0) - rho;
  const [A, B] = plattSigmoid(X.map(decision), y);
  return { decision, prob: (x) => sigmoid(-(A * decision(x) + B)) };
}
// Platt's sigmoid P(y = 1 | f) = 1 / (1 + exp(A f + B)) fitted on decision values f (Lin, Lin and Weng 2007: the targets
// (n₊ + 1)/(n₊ + 2) and 1/(n₋ + 2), Newton's method with a backtracking line search)
export function plattSigmoid(f: number[], y: number[]): [number, number] {
  const prior1 = y.filter((v) => v === 1).length;
  const prior0 = y.length - prior1;
  const hi = (prior1 + 1) / (prior1 + 2);
  const lo = 1 / (prior0 + 2);
  const t = y.map((v) => (v === 1 ? hi : lo));
  let [A, B] = [0, Math.log((prior0 + 1) / (prior1 + 1))];
  const fval = (a: number, b: number) =>
    f.reduce((s, fi, i) => {
      const z = fi * a + b;
      return s + (z >= 0 ? t[i] * z + Math.log1p(Math.exp(-z)) : (t[i] - 1) * z + Math.log1p(Math.exp(z)));
    }, 0);
  let fv = fval(A, B);
  for (let it = 0; it < 100; it++) {
    let [h11, h22, h21, g1, g2] = [1e-12, 1e-12, 0, 0, 0];
    f.forEach((fi, i) => {
      const z = fi * A + B;
      const [pp, qq] = z >= 0 ? [Math.exp(-z) / (1 + Math.exp(-z)), 1 / (1 + Math.exp(-z))] : [1 / (1 + Math.exp(z)), Math.exp(z) / (1 + Math.exp(z))];
      const d2 = pp * qq;
      h11 += fi * fi * d2;
      h22 += d2;
      h21 += fi * d2;
      const d1 = t[i] - pp;
      g1 += fi * d1;
      g2 += d1;
    });
    if (Math.abs(g1) < 1e-5 && Math.abs(g2) < 1e-5) break;
    const det = h11 * h22 - h21 * h21;
    const [dA, dB] = [-(h22 * g1 - h21 * g2) / det, -(-h21 * g1 + h11 * g2) / det];
    const gd = g1 * dA + g2 * dB;
    let step = 1;
    while (step >= 1e-10) {
      const [nA, nB] = [A + step * dA, B + step * dB];
      const nf = fval(nA, nB);
      if (nf < fv + 1e-4 * step * gd) {
        [A, B, fv] = [nA, nB, nf];
        break;
      }
      step /= 2;
    }
    if (step < 1e-10) break;
  }
  return [A, B];
}

// ---- Gaussian naive Bayes: every feature normal within each class, independent of the others (as scikit-learn's
// GaussianNB: the variances plus 1e-9 of the largest variance of a feature) ----
export function fitNaiveBayes(X: number[][], y: number[]): Predict {
  const p = X[0].length;
  const all = Array.from({ length: p }, (_, j) => {
    const mj = X.reduce((s, r) => s + r[j], 0) / X.length;
    return X.reduce((s, r) => s + (r[j] - mj) ** 2, 0) / X.length;
  });
  const eps = 1e-9 * Math.max(...all);
  const cls = [0, 1].map((c) => {
    const g = X.filter((_, i) => y[i] === c);
    const mean = Array.from({ length: p }, (_, j) => g.reduce((s, r) => s + r[j], 0) / g.length);
    const v = Array.from({ length: p }, (_, j) => g.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / g.length + eps);
    return { prior: g.length / X.length, mean, v };
  });
  const joint = (c: (typeof cls)[number], x: number[]) => Math.log(c.prior) - 0.5 * c.v.reduce((s, v, j) => s + Math.log(2 * Math.PI * v) + (x[j] - c.mean[j]) ** 2 / v, 0);
  return (x) => sigmoid(joint(cls[1], x) - joint(cls[0], x));
}

// ---- gradient boosting: 100 regression trees of depth 3 on the log-loss's residuals, a learning rate of 0.1, each
// leaf its Newton step, as scikit-learn's GradientBoostingClassifier (the split that most lowers Friedman's mean squared
// error, over every feature and every threshold halfway between two values) ----
type RNode = { value: number } | { j: number; t: number; l: RNode; r: RNode };
function regTree(X: number[][], res: number[], hess: number[], idx: number[], depth: number): RNode {
  const leaf = (): RNode => {
    const num = idx.reduce((s, i) => s + res[i], 0);
    const den = idx.reduce((s, i) => s + hess[i], 0);
    return { value: Math.abs(den) < 1e-150 ? 0 : num / den };
  };
  if (depth >= 3 || idx.length < 2) return leaf();
  const total = idx.reduce((s, i) => s + res[i], 0);
  const mean = total / idx.length;
  if (idx.every((i) => Math.abs(res[i] - mean) < 1e-12)) return leaf();
  const p = X[0].length;
  let best: { j: number; t: number; gain: number } | null = null;
  for (let j = 0; j < p; j++) {
    const sorted = [...idx].sort((a, b) => X[a][j] - X[b][j]);
    let sl = 0;
    for (let k = 0; k < sorted.length - 1; k++) {
      sl += res[sorted[k]];
      const [a, b] = [X[sorted[k]][j], X[sorted[k + 1]][j]];
      if (b - a <= 1e-7 * Math.max(1, Math.abs(a))) continue;
      const nl = k + 1;
      const nr = sorted.length - nl;
      const diff = sl / nl - (total - sl) / nr;
      const gain = ((nl * nr) / (nl + nr)) * diff * diff;
      if (!best || gain > best.gain) best = { j, t: a / 2 + b / 2, gain };
    }
  }
  if (!best) return leaf();
  const { j, t } = best;
  return { j, t, l: regTree(X, res, hess, idx.filter((i) => X[i][j] <= t), depth + 1), r: regTree(X, res, hess, idx.filter((i) => X[i][j] > t), depth + 1) };
}
const rwalk = (nd: RNode, x: number[]): number => ('value' in nd ? nd.value : rwalk(x[nd.j] <= nd.t ? nd.l : nd.r, x));
export function fitBoosting(X: number[][], y: number[], rounds = 100, rate = 0.1): Predict {
  const n = X.length;
  const pr = y.reduce((s, v) => s + v, 0) / n;
  const init = Math.log(pr / (1 - pr));
  const raw = new Float64Array(n).fill(init);
  const trees: RNode[] = [];
  const all = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < rounds; k++) {
    const prob = Array.from(raw, (z) => sigmoid(z));
    const res = y.map((v, i) => v - prob[i]);
    const hess = prob.map((q) => q * (1 - q));
    const tr = regTree(X, res, hess, all, 0);
    trees.push(tr);
    for (let i = 0; i < n; i++) raw[i] += rate * rwalk(tr, X[i]);
  }
  return (x) => sigmoid(trees.reduce((s, tr) => s + rate * rwalk(tr, x), init));
}

// ---- a method fitted, its features standardized on the examples given ----
export function fitMethod(method: LearnMethod, X: number[][], y: number[]): Predict {
  const sc = scaler(X);
  const Z = X.map(sc);
  const f = method === 'logistic' ? fitLogistic(Z, y) : method === 'lda' ? fitLDA(Z, y) : method === 'knn' ? fitKnn(Z, y) : method === 'nb' ? fitNaiveBayes(Z, y) : method === 'svm' ? fitSvm(Z, y).prob : method === 'boost' ? fitBoosting(Z, y) : fitForest(Z, y);
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

// How often a method is right on examples it was not fitted on: every one left out in turn (up to LOO_MOST examples), or
// with more of them ten parts, each left out in turn and guessed from the nine others (in the order the examples came,
// every tenth one a part): the cost no longer grows with the square of the examples (it runs at every click of Review)
export const LOO_MOST = 30;
export function cvAccuracy(method: LearnMethod, X: number[][], y: number[]): number {
  if (X.length <= LOO_MOST) return looAccuracy(method, X, y);
  if (Math.min(y.filter((v) => v === 1).length, y.filter((v) => v === 0).length) < 2) return NaN;
  let right = 0;
  for (let part = 0; part < 10; part++) {
    const keep = X.map((_, k) => k).filter((k) => k % 10 !== part);
    // (a part whose others hold one class only: its examples guessed by the share of good ones)
    const ys = keep.map((k) => y[k]);
    const f = ys.includes(0) && ys.includes(1) ? fitMethod(method, keep.map((k) => X[k]), ys) : () => ys.reduce((s, v) => s + v, 0) / ys.length;
    for (let i = part; i < X.length; i += 10) if ((f(X[i]) >= 0.5 ? 1 : 0) === y[i]) right++;
  }
  return right / X.length;
}

export const LEAST_EXAMPLES = 3;
// Enough examples to learn from: LEAST_EXAMPLES of each kind (y: 1 good, 0 not)
export const enoughToLearn = (y: number[]) => y.filter((v) => v === 1).length >= LEAST_EXAMPLES && y.filter((v) => v === 0).length >= LEAST_EXAMPLES;
// How often each method is right on the examples, and the method chosen (auto: the most often right; of those as
// accurate, the first of the list: the simplest) — the costly part, run off the page (learnWorker.ts)
export type LearnChoice = { method: LearnMethod; accuracy: Record<LearnMethod, number> };
export function chooseMethod(X: number[][], y: number[], method: LearnMethod | 'auto'): LearnChoice | null {
  if (!enoughToLearn(y)) return null;
  const accuracy = Object.fromEntries(LEARN_METHODS.map((m) => [m, cvAccuracy(m, X, y)])) as Record<LearnMethod, number>;
  return { method: method === 'auto' ? LEARN_METHODS.reduce((b, m) => (accuracy[m] > accuracy[b] ? m : b), LEARN_METHODS[0]) : method, accuracy };
}
// The classifier of a method chosen, fitted on all the examples, with how much each feature counts (quick: one fit)
export function learnWith(X: number[][], y: number[], choice: LearnChoice): { method: LearnMethod; accuracy: Record<LearnMethod, number>; importance: number[]; predict: Predict } {
  const predict = fitMethod(choice.method, X, y);
  return { ...choice, importance: importance(predict, X), predict };
}
// The classifier learnt from the examples: the method (auto: the most often right), how often each is right, how much
// each feature counts; null: fewer than LEAST_EXAMPLES of a kind
export function learn(X: number[][], y: number[], method: LearnMethod | 'auto'): { method: LearnMethod; accuracy: Record<LearnMethod, number>; importance: number[]; predict: Predict } | null {
  const choice = chooseMethod(X, y, method);
  return choice ? learnWith(X, y, choice) : null;
}
