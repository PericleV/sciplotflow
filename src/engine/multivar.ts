// Principal components of several columns (of their correlations — standardized —, or of their covariances): the
// eigenvalues and the % of the variance each explains, the loadings (the eigenvectors, a sign each: the largest part
// positive), the scores of every complete row; and an order of the columns by hierarchical clustering (average linkage
// on 1 − |r|): related columns next to each other, for a correlation map. Control charts of a series: individuals and
// moving ranges, or the means and ranges of subgroups (Shewhart, 3σ limits), the points out of control by the
// Western Electric rules. Pure.
import { eig, newMatrix } from './matrix.ts';

export type Pca = { values: number[]; explained: number[]; loadings: number[][]; scores: number[][]; rows: number[] };
// cols: the columns (each a list of values, the same length); rows with a missing value left out
export function pca(cols: number[][], on: 'corr' | 'cov'): Pca | string {
  const p = cols.length;
  const n = Math.min(...cols.map((c) => c.length));
  const rows = Array.from({ length: n }, (_, i) => i).filter((i) => cols.every((c) => Number.isFinite(c[i])));
  const m = rows.length;
  if (p < 2) return 'Principal components: 2 columns or more.';
  if (m <= p) return `Principal components: ${m} complete rows for ${p} columns; more rows are needed.`;
  const mean = cols.map((c) => rows.reduce((s, i) => s + c[i], 0) / m);
  const sd = cols.map((c, j) => Math.sqrt(rows.reduce((s, i) => s + (c[i] - mean[j]) ** 2, 0) / (m - 1)));
  if (on === 'corr' && sd.some((s) => !(s > 0))) return 'Principal components: a column does not vary.';
  const z = rows.map((i) => cols.map((c, j) => (c[i] - mean[j]) / (on === 'corr' ? sd[j] : 1)));
  const C = newMatrix(p, p, 'C');
  for (let a = 0; a < p; a++)
    for (let b = a; b < p; b++) {
      let s = 0;
      for (const r of z) s += r[a] * r[b];
      C.v[a * p + b] = C.v[b * p + a] = s / (m - 1);
    }
  const e = eig(C);
  if (typeof e === 'string') return e;
  // descending
  const order = Array.from({ length: p }, (_, k) => k).sort((a, b) => e.values.v[b] - e.values.v[a]);
  const values = order.map((k) => Math.max(0, e.values.v[k]));
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const loadings = order.map((k) => {
    const v = Array.from({ length: p }, (_, i) => e.vectors.v[i * p + k]);
    // the sign: the largest part positive
    let big = 0;
    for (let i = 1; i < p; i++) if (Math.abs(v[i]) > Math.abs(v[big])) big = i;
    return v[big] < 0 ? v.map((q) => -q) : v;
  });
  const scores = z.map((r) => loadings.map((l) => r.reduce((s, q, i) => s + q * l[i], 0)));
  return { values, explained: values.map((v) => (100 * v) / total), loadings, scores, rows };
}

// the leaves of an average-linkage clustering of the distances d (symmetric), in the order of the tree; two clusters
// joined by their closest ends
export function clusterOrder(d: number[][]): number[] {
  type Node = { members: number[]; order: number[] };
  let nodes: Node[] = d.map((_, i) => ({ members: [i], order: [i] }));
  const dist = (a: Node, b: Node) => {
    let t = 0;
    for (const i of a.members) for (const j of b.members) t += d[i][j];
    return t / (a.members.length * b.members.length);
  };
  while (nodes.length > 1) {
    let [bi, bj, best] = [0, 1, Infinity];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const q = dist(nodes[i], nodes[j]);
        if (q < best) [bi, bj, best] = [i, j, q];
      }
    const [a, b] = [nodes[bi].order, nodes[bj].order];
    const ra = [...a].reverse();
    const rb = [...b].reverse();
    const options = [
      [a, b],
      [a, rb],
      [ra, b],
      [ra, rb],
    ];
    const pair = options.reduce((x, o) => (d[o[0][o[0].length - 1]][o[1][0]] < d[x[0][x[0].length - 1]][x[1][0]] ? o : x));
    const joined = { members: [...nodes[bi].members, ...nodes[bj].members], order: [...pair[0], ...pair[1]] };
    nodes = nodes.filter((_, k) => k !== bi && k !== bj);
    nodes.push(joined);
  }
  return nodes[0]?.order ?? [];
}

// ---- control charts ----
// the constants of the subgroup charts (n = 2 … 10): d2, D3, D4, A2
const D2 = [NaN, NaN, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.97, 3.078];
const D3 = [NaN, NaN, 0, 0, 0, 0, 0, 0.076, 0.136, 0.184, 0.223];
const D4 = [NaN, NaN, 3.267, 2.574, 2.282, 2.114, 2.004, 1.924, 1.864, 1.816, 1.777];
const A2 = [NaN, NaN, 1.88, 1.023, 0.729, 0.577, 0.483, 0.419, 0.373, 0.337, 0.308];
export type ControlChart = {
  kind: 'imr' | 'xbar';
  // the points of the first chart (individuals or subgroup means) and of the second (moving ranges or ranges)
  x: number[];
  v: number[];
  r: number[];
  cl: number;
  ucl: number;
  lcl: number;
  rcl: number;
  rucl: number;
  rlcl: number;
  sigma: number;
  // the rules each point breaks (1: beyond 3σ, 2: 2 of 3 beyond 2σ on a side, 3: 4 of 5 beyond 1σ, 4: 8 on a side)
  rules: number[][];
};
export function controlChart(values: number[], subgroup: number): ControlChart | string {
  const y = values.filter(Number.isFinite);
  const n = Math.round(subgroup);
  if (n >= 2) {
    if (n > 10) return 'Subgroups of 2 to 10 values.';
    const g = Math.floor(y.length / n);
    if (g < 2) return `${y.length} values: two subgroups of ${n} at least.`;
    const means: number[] = [];
    const ranges: number[] = [];
    for (let k = 0; k < g; k++) {
      const s = y.slice(k * n, k * n + n);
      means.push(s.reduce((a, b) => a + b, 0) / n);
      ranges.push(Math.max(...s) - Math.min(...s));
    }
    const xbb = means.reduce((a, b) => a + b, 0) / g;
    const rbar = ranges.reduce((a, b) => a + b, 0) / g;
    const sigma = rbar / D2[n] / Math.sqrt(n);
    return { kind: 'xbar', x: means.map((_, k) => k + 1), v: means, r: ranges, cl: xbb, ucl: xbb + A2[n] * rbar, lcl: xbb - A2[n] * rbar, rcl: rbar, rucl: D4[n] * rbar, rlcl: D3[n] * rbar, sigma, rules: rulesOf(means, xbb, sigma) };
  }
  if (y.length < 3) return 'A control chart: 3 values at least.';
  const mr = y.slice(1).map((v, i) => Math.abs(v - y[i]));
  const mrbar = mr.reduce((a, b) => a + b, 0) / mr.length;
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  const sigma = mrbar / D2[2];
  return { kind: 'imr', x: y.map((_, k) => k + 1), v: y, r: [NaN, ...mr], cl: mean, ucl: mean + 3 * sigma, lcl: mean - 3 * sigma, rcl: mrbar, rucl: D4[2] * mrbar, rlcl: 0, sigma, rules: rulesOf(y, mean, sigma) };
}
// the Western Electric rules broken at every point (the point that completes the pattern)
function rulesOf(v: number[], cl: number, s: number): number[][] {
  const z = v.map((q) => (q - cl) / s);
  return z.map((q, i) => {
    const out: number[] = [];
    if (Math.abs(q) > 3) out.push(1);
    for (const side of [1, -1]) {
      const last = (k: number) => z.slice(Math.max(0, i - k + 1), i + 1);
      if (i >= 2 && side * q > 2 && last(3).filter((u) => side * u > 2).length >= 2) out.push(2);
      if (i >= 4 && side * q > 1 && last(5).filter((u) => side * u > 1).length >= 4) out.push(3);
      if (i >= 7 && last(8).every((u) => side * u > 0)) out.push(4);
    }
    return [...new Set(out)];
  });
}
