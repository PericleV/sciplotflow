// Structure (Image analysis): a network of ligaments (nanoporous gold, nanowires, fibres, vessels) measured from its
// mask. The mask thinned to its skeleton; the skeleton made a graph — its nodes the junctions (where three branches or
// more meet: one node for the pixels of a junction together) and the free ends, its branches the lines between them;
// the spurs (short branches to a free end, from the bumps of the outline) cut; every branch measured: its length along
// the skeleton (from node centre to node centre, or from surface to surface: the radii of its junctions taken off), its
// thickness from the distance map (twice the distance to the edge, at the points of its middle: the inscribed circles),
// its neck, how straight it is, its direction. The pores: the holes of the mask, each its area and the largest circle
// inside it. Changes by hand (branches deleted, kept, left out, drawn, erased; nodes added, merged, moved) are kept as
// places, so they apply again when the mask changes; the spurs deleted and kept by hand teach the cut. Pure.
import { distanceMap, label, skeleton } from './morph.ts';
import type { Pt } from './roi.ts';

// the changes by hand, in pixels of the original image (a crop does not move them)
export type NetworkHand = {
  del?: Pt[]; // a point on every branch deleted
  keep?: Pt[]; // branches never cut as spurs
  excl?: Pt[]; // branches left out of the statistics (drawn faint)
  add?: Pt[][]; // lines drawn (joined to the skeleton near their ends)
  erase?: { pts: Pt[]; r: number }[]; // strokes erased (r: their half-width, px)
  split?: Pt[]; // nodes added on branches
  merge?: [Pt, Pt][]; // a node dropped onto another (from, onto)
  move?: [Pt, Pt][]; // a node moved (from, to)
  order?: HandKind[]; // the kinds of the changes, in the order made (the last one undone first)
};
export type HandKind = 'del' | 'keep' | 'excl' | 'add' | 'erase' | 'split' | 'merge' | 'move';
// prune: the spurs cut — shorter than ratio × the thickness at their junction, shorter than length (px), or none;
// edge: the branches touching the image's edge left out of the statistics or kept; measure: the ligament length the
// statistics use (centre to centre, or surface to surface); colorBy: the branches drawn by their length, thickness or type
export type NetworkSpec = {
  on?: boolean;
  prune?: 'ratio' | 'length' | 'off';
  ratio?: number;
  length?: number;
  edge?: 'exclude' | 'keep';
  measure?: 'centre' | 'surface';
  colorBy?: 'length' | 'diameter' | 'type';
  hand?: NetworkHand;
};
export type NetworkSettings = Required<Pick<NetworkSpec, 'prune' | 'ratio' | 'length' | 'edge' | 'measure' | 'colorBy'>>;
export const NETWORK_DEFAULTS: NetworkSettings = { prune: 'ratio', ratio: 1, length: 0, edge: 'exclude', measure: 'centre', colorBy: 'length' };

// hand: added or moved by hand (one added on a branch is a junction of its two pieces)
export type NetNode = { id: number; x: number; y: number; degree: number; r: number; edge: boolean; hand?: boolean };
// type: junction (both ends junctions: a ligament), end (a junction and a free end), free (two free ends), loop
export type NetBranch = {
  id: number;
  a: number;
  b: number;
  path: Pt[]; // the skeleton's pixels (their centres), from node a to node b
  length: number; // centre to centre (px)
  surface: number; // surface to surface (px)
  diameter: number; // the median of the circles' diameters (px)
  mean: number;
  neck: number; // the least
  straight: number; // end-to-end over the length
  angle: number; // its direction, 0–180° (counter-clockwise from x)
  type: 'junction' | 'end' | 'free' | 'loop';
  edge: boolean;
  keep?: boolean;
  excl?: boolean;
  hand?: boolean;
  counted: boolean; // in the statistics
  steps: { straight: number; diagonal: number; ends: number }; // how its length is made
  circles: { x: number; y: number; r: number }[]; // the inscribed circles its thickness is read from
};
export type NetPore = { id: number; x: number; y: number; area: number; eq: number; inscribed: number; edge: boolean };
// examples: the end branches deleted (cut) and kept by hand, each its length over the thickness at its junction
export type NetworkResult = { w: number; h: number; nodes: NetNode[]; branches: NetBranch[]; pores: NetPore[]; solid: number; pruned: number; examples: { ratio: number; cut: boolean }[] };

const NB: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
const SNAP = 6; // px: a drawn line's end joined to the skeleton this near; an edit's point finds what is this near
const NEAR = 5;

// a segment of pixels from a to b (8-connected), as pixel indices
function line(a: Pt, b: Pt, w: number, h: number, out: (i: number) => void) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let k = 0; k <= n; k++) {
    const x = Math.floor(a[0] + ((b[0] - a[0]) * k) / n);
    const y = Math.floor(a[1] + ((b[1] - a[1]) * k) / n);
    if (x >= 0 && y >= 0 && x < w && y < h) out(y * w + x);
  }
}
const segDist = ([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt) => {
  const [vx, vy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
};
const pathDist = (p: Pt, path: Pt[]) => (path.length === 1 ? Math.hypot(p[0] - path[0][0], p[1] - path[0][1]) : path.slice(1).reduce((d, q, i) => Math.min(d, segDist(p, path[i], q)), Infinity));

// The skeleton's pixels that only make a corner of a staircase (their neighbours stay joined without them) taken out:
// every line pixel then has two neighbours, every junction three or more
function thinCorners(sk: Uint8Array, w: number, h: number) {
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!sk[i]) continue;
        const nb = NB.flatMap(([dx, dy]) => {
          const [u, v] = [x + dx, y + dy];
          return u >= 0 && v >= 0 && u < w && v < h && sk[v * w + u] ? [[dx, dy] as Pt] : [];
        });
        if (nb.length < 2 || nb.length > 3) continue;
        // (the neighbours joined to one another without this pixel: one group)
        const seen = new Set([0]);
        const stack = [0];
        while (stack.length) {
          const a = nb[stack.pop()!];
          nb.forEach((b, k) => {
            if (!seen.has(k) && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1) {
              seen.add(k);
              stack.push(k);
            }
          });
        }
        if (seen.size === nb.length) sk[i] = 0;
      }
}

export function analyzeNetwork(mask: Float32Array, w: number, h: number, spec: NetworkSpec, ox = 0, oy = 0): NetworkResult {
  const s = { ...NETWORK_DEFAULTS, ...spec };
  const hand = spec.hand ?? {};
  const loc = ([x, y]: Pt): Pt => [x - ox, y - oy];
  const m = Float32Array.from(mask, (v) => (v > 0 ? 1 : 0));
  const dist = distanceMap(m, w, h);
  const sk = Uint8Array.from(skeleton(m, w, h), (v) => (v > 0 ? 1 : 0));
  // ---- the changes by hand on the skeleton: strokes erased, lines drawn (their ends joined to it) ----
  for (const e of hand.erase ?? []) {
    const pts = e.pts.map(loc);
    const r = Math.max(0.5, e.r);
    const [x0, y0] = [Math.floor(Math.min(...pts.map((p) => p[0])) - r), Math.floor(Math.min(...pts.map((p) => p[1])) - r)];
    const [x1, y1] = [Math.ceil(Math.max(...pts.map((p) => p[0])) + r), Math.ceil(Math.max(...pts.map((p) => p[1])) + r)];
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) if (sk[y * w + x] && pathDist([x + 0.5, y + 0.5], pts) <= r) sk[y * w + x] = 0;
  }
  const nearestOn = (p: Pt, not?: Set<number>): Pt | null => {
    let best: Pt | null = null;
    let bd = SNAP;
    for (let y = Math.max(0, Math.floor(p[1] - SNAP)); y <= Math.min(h - 1, Math.ceil(p[1] + SNAP)); y++)
      for (let x = Math.max(0, Math.floor(p[0] - SNAP)); x <= Math.min(w - 1, Math.ceil(p[0] + SNAP)); x++) {
        const d = Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1]);
        if (sk[y * w + x] && d < bd && !not?.has(y * w + x)) [best, bd] = [[x + 0.5, y + 0.5], d];
      }
    return best;
  };
  const drawn: Pt[][] = [];
  for (const raw of hand.add ?? []) {
    const pts = raw.map(loc);
    if (pts.length < 2) continue;
    const own = new Set<number>();
    const ends = [nearestOn(pts[0]), nearestOn(pts[pts.length - 1])];
    const all = [...(ends[0] ? [ends[0]] : []), ...pts, ...(ends[1] ? [ends[1]] : [])];
    for (let k = 1; k < all.length; k++) line(all[k - 1], all[k], w, h, (i) => own.add(i));
    for (const i of own) sk[i] = 1;
    drawn.push(all);
  }
  thinCorners(sk, w, h);
  // ---- the graph ----
  const deg = (i: number) => {
    const [x, y] = [i % w, Math.floor(i / w)];
    let n = 0;
    for (const [dx, dy] of NB) {
      const [u, v] = [x + dx, y + dy];
      if (u >= 0 && v >= 0 && u < w && v < h && sk[v * w + u]) n++;
    }
    return n;
  };
  const isNode = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (sk[i] && deg(i) !== 2) isNode[i] = 1;
  // (the nodes added by hand: the skeleton's pixel nearest each)
  const splitAt: number[] = [];
  for (const p of hand.split ?? []) {
    const q = nearestOn(loc(p));
    if (q) splitAt.push(Math.floor(q[1]) * w + Math.floor(q[0]));
  }
  for (const i of splitAt) isNode[i] = 1;
  const lab = label(isNode, w, h, true);
  type N = { pix: number[]; x: number; y: number; end: boolean; gone?: boolean; moved?: boolean };
  const nodes: N[] = Array.from({ length: lab.count }, () => ({ pix: [], x: 0, y: 0, end: false }));
  for (let i = 0; i < w * h; i++) if (lab.labels[i] > 0) nodes[lab.labels[i] - 1].pix.push(i);
  for (const i of splitAt) nodes[lab.labels[i] - 1].moved = true;
  for (const n of nodes) {
    n.x = n.pix.reduce((a, i) => a + (i % w) + 0.5, 0) / n.pix.length;
    n.y = n.pix.reduce((a, i) => a + Math.floor(i / w) + 0.5, 0) / n.pix.length;
  }
  type B = { a: number; b: number; path: Pt[]; keep?: boolean; excl?: boolean; hand?: boolean; gone?: boolean };
  const branches: B[] = [];
  const seen = new Uint8Array(w * h);
  const at = (i: number): Pt => [(i % w) + 0.5, Math.floor(i / w) + 0.5];
  const nbOf = (i: number) =>
    NB.flatMap(([dx, dy]) => {
      const [u, v] = [(i % w) + dx, Math.floor(i / w) + dy];
      return u >= 0 && v >= 0 && u < w && v < h && sk[v * w + u] ? [v * w + u] : [];
    });
  // (from every node, along every line pixel next to it, to the node at its other end)
  const trace = (from: number, start: number) => {
    const path: number[] = [];
    let [prev, cur] = [from, start];
    for (let guard = 0; guard < w * h; guard++) {
      if (lab.labels[cur] > 0) return { end: lab.labels[cur] - 1, path };
      seen[cur] = 1;
      path.push(cur);
      const next = nbOf(cur).find((j) => j !== prev && !path.includes(j) && (lab.labels[j] > 0 || !seen[j]));
      if (next === undefined) return { end: -1, path };
      [prev, cur] = [cur, next];
    }
    return { end: -1, path };
  };
  nodes.forEach((n, k) => {
    for (const p of n.pix)
      for (const j of nbOf(p)) {
        if (lab.labels[j] > 0 || seen[j]) continue;
        const t = trace(p, j);
        // (a pixel between two pixels of the same junction: no branch)
        if (t.end >= 0 && !(t.end === k && t.path.length < 3)) branches.push({ a: k, b: t.end, path: t.path.map(at) });
      }
  });
  // (the lines with no node: loops, a node made on each)
  for (let i = 0; i < w * h; i++) {
    if (!sk[i] || seen[i] || lab.labels[i] > 0) continue;
    const k = nodes.push({ pix: [i], x: at(i)[0], y: at(i)[1], end: false }) - 1;
    seen[i] = 1;
    const j = nbOf(i).find((q) => !seen[q]);
    if (j === undefined) continue;
    const t = trace(i, j);
    branches.push({ a: k, b: k, path: t.path.map(at) });
  }
  const live = () => branches.filter((b) => !b.gone);
  // (every node's number of branch ends, counted once for the branches as they are)
  const degrees = () => {
    const d = new Map<number, number>();
    for (const b of live()) {
      d.set(b.a, (d.get(b.a) ?? 0) + 1);
      d.set(b.b, (d.get(b.b) ?? 0) + 1);
    }
    return d;
  };
  const nearNode = (p: Pt) => {
    let best = -1;
    let bd = NEAR + 3;
    nodes.forEach((n, k) => {
      const d = Math.hypot(n.x - p[0], n.y - p[1]);
      if (!n.gone && d < bd) [best, bd] = [k, d];
    });
    return best;
  };
  const nearBranch = (p: Pt) => {
    let best: B | null = null;
    let bd = NEAR;
    for (const b of live()) {
      const d = pathDist(p, [[nodes[b.a].x, nodes[b.a].y], ...b.path, [nodes[b.b].x, nodes[b.b].y]]);
      if (d < bd) [best, bd] = [b, d];
    }
    return best as B | null;
  };
  // ---- nodes merged and moved by hand ----
  for (const [from, onto] of hand.merge ?? []) {
    const [a, b] = [nearNode(loc(from)), nearNode(loc(onto))];
    if (a < 0 || b < 0 || a === b) continue;
    for (const br of live()) {
      if ((br.a === a && br.b === b) || (br.a === b && br.b === a)) br.gone = true;
      if (br.a === a) [br.a, br.hand] = [b, true];
      if (br.b === a) [br.b, br.hand] = [b, true];
    }
    nodes[a].gone = true;
    nodes[b].moved = true;
  }
  for (const [from, to] of hand.move ?? []) {
    const k = nearNode(loc(from));
    if (k < 0) continue;
    [nodes[k].x, nodes[k].y, nodes[k].moved] = [loc(to)[0], loc(to)[1], true];
    for (const br of live()) if (br.a === k || br.b === k) br.hand = true;
  }
  // (a node of two branches is no junction: the two made one; not a node added or moved by hand)
  const joinTwos = () => {
    // (the branches at every node, kept up to date as they are joined)
    const atNode = new Map<number, B[]>();
    const put = (k: number, b: B) => atNode.set(k, [...(atNode.get(k) ?? []), b]);
    for (const b of live()) {
      put(b.a, b);
      if (b.b !== b.a) put(b.b, b);
    }
    for (let k = 0; k < nodes.length; k++) {
      if (nodes[k].gone || nodes[k].moved) continue;
      const at2 = (atNode.get(k) ?? []).filter((b) => !b.gone);
      if (at2.length !== 2 || at2[0] === at2[1] || (at2[0].a === k && at2[0].b === k)) continue;
      const [p, q] = at2;
      const pin = p.b === k ? p.path : [...p.path].reverse();
      const qout = q.a === k ? q.path : [...q.path].reverse();
      const pa = p.b === k ? p.a : p.b;
      const qb = q.a === k ? q.b : q.a;
      const mid: Pt = [nodes[k].x, nodes[k].y];
      const nb: B = { a: pa, b: qb, path: [...pin, mid, ...qout], keep: p.keep || q.keep, excl: p.excl || q.excl, hand: p.hand || q.hand };
      branches.push(nb);
      p.gone = q.gone = true;
      put(pa, nb);
      if (qb !== pa) put(qb, nb);
      nodes[k].gone = true;
    }
  };
  // ---- the thickness at a node, the length of a branch ----
  const dAt = ([x, y]: Pt) => dist[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))];
  // (the diameter at a pixel of the skeleton: 2d − 1 across an odd width; an even width has a twin of the same d beside
  // the skeleton, not on it: 2d)
  const diaAt = ([x, y]: Pt) => {
    const [px, py] = [Math.floor(x), Math.floor(y)];
    const i = py * w + px;
    const d = dist[i];
    const twin = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const [u, v] = [px + dx, py + dy];
      return u >= 0 && v >= 0 && u < w && v < h && !sk[v * w + u] && dist[v * w + u] >= d;
    });
    return 2 * d - (twin ? 0 : 1);
  };
  const nodeD = (k: number) => {
    const n = nodes[k];
    return Math.max(dAt([n.x, n.y]), ...n.pix.map((i) => dist[i]));
  };
  const lengthOf = (b: B) => {
    const pts: Pt[] = [[nodes[b.a].x, nodes[b.a].y], ...b.path, [nodes[b.b].x, nodes[b.b].y]];
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  };
  // (an end branch: its length over the thickness at its junction)
  const endRatio = (b: B, dg: Map<number, number>) => {
    const [da, db] = [dg.get(b.a) ?? 0, dg.get(b.b) ?? 0];
    const j = da === 1 && db >= 3 ? b.b : db === 1 && da >= 3 ? b.a : -1;
    return j < 0 ? null : lengthOf(b) / Math.max(1, 2 * nodeD(j) - 1);
  };
  for (const [list, flag] of [
    [hand.keep, 'keep'],
    [hand.excl, 'excl'],
  ] as const)
    for (const p of list ?? []) {
      const b = nearBranch(loc(p));
      if (b) b[flag] = true;
    }
  // ---- deleted by hand (each an example of a spur when it was one), then the spurs cut ----
  const examples: { ratio: number; cut: boolean }[] = [];
  const dg0 = degrees();
  for (const p of hand.del ?? []) {
    const b = nearBranch(loc(p));
    if (!b) continue;
    const r = endRatio(b, dg0);
    if (r !== null) examples.push({ ratio: r, cut: true });
    b.gone = true;
  }
  joinTwos();
  let pruned = 0;
  if (s.prune !== 'off')
    for (let round = 0; round < 20; round++) {
      const dg = degrees();
      const cut = live().filter((b) => {
        if (b.keep || b.a === b.b) return false;
        const r = endRatio(b, dg);
        if (r === null) return false;
        return s.prune === 'length' ? lengthOf(b) < s.length : r < s.ratio;
      });
      if (!cut.length) break;
      for (const b of cut) b.gone = true;
      pruned += cut.length;
      joinTwos();
    }
  // (the branches kept by hand: examples of what is no spur, as they are once the spurs are cut)
  const dgKept = degrees();
  for (const b of live())
    if (b.keep) {
      const r = endRatio(b, dgKept);
      if (r !== null) examples.push({ ratio: r, cut: false });
    }
  // ---- the nodes left, the branches measured ----
  const used = [...new Set(live().flatMap((b) => [b.a, b.b]))].sort((a, b) => a - b);
  const dgEnd = degrees();
  const id = new Map(used.map((k, i) => [k, i]));
  // (on the image's edge: a pixel by it; a node as near it as the mask around it is thick — a free end cut by the edge)
  const onEdge = ([x, y]: Pt, d = 0) => Math.min(x, y, w - x, h - y) < 1.5 + d;
  const outNodes: NetNode[] = used.map((k, i) => {
    const n = nodes[k];
    return { id: i, x: n.x + ox, y: n.y + oy, degree: dgEnd.get(k) ?? 0, r: Math.max(0, nodeD(k) - 0.5), edge: onEdge([n.x, n.y], nodeD(k)), ...(n.moved ? { hand: true } : {}) };
  });
  const drawnNear = (path: Pt[]) => drawn.some((d) => path.some((p) => pathDist(p, d) < 1.5));
  const outBranches: NetBranch[] = live().map((b, i) => {
    const A = outNodes[id.get(b.a)!];
    const Bn = outNodes[id.get(b.b)!];
    const L = lengthOf(b);
    // (how the length is made: the steps along the skeleton, and the two ends to the nodes' centres)
    let [st, dg] = [0, 0];
    for (let k = 1; k < b.path.length; k++) {
      const d = Math.hypot(b.path[k][0] - b.path[k - 1][0], b.path[k][1] - b.path[k - 1][1]);
      if (d > 1.2) dg++;
      else st++;
    }
    const ends = L - st - dg * Math.SQRT2;
    const [ja, jb] = [A.degree >= 3 || !!A.hand, Bn.degree >= 3 || !!Bn.hand];
    const type: NetBranch['type'] = b.a === b.b ? 'loop' : ja && jb ? 'junction' : ja || jb ? 'end' : 'free';
    const ra = ja ? A.r : 0;
    const rb = jb ? Bn.r : 0;
    // (the thickness: inscribed circles on its middle, away from its junctions)
    const mid = b.path.filter(([x, y]) => (!ja || Math.hypot(x + ox - A.x, y + oy - A.y) > A.r + 0.5) && (!jb || Math.hypot(x + ox - Bn.x, y + oy - Bn.y) > Bn.r + 0.5));
    const use = mid.length ? mid : b.path;
    const ds = use.map(diaAt).filter((v) => v > 0);
    const sorted = [...ds].sort((p, q) => p - q);
    const diameter = sorted.length ? sorted[sorted.length >> 1] : NaN;
    const every = Math.max(1, Math.round((Number.isFinite(diameter) ? diameter : 2) / 2));
    const circles = use.filter((_, k) => k % every === 0).map(([x, y]) => ({ x: x + ox, y: y + oy, r: Math.max(0.5, dAt([x, y]) - 0.5) }));
    const chord = Math.hypot(Bn.x - A.x, Bn.y - A.y);
    const ang = ((Math.atan2(-(Bn.y - A.y), Bn.x - A.x) * 180) / Math.PI + 180) % 180;
    const edge = A.edge || Bn.edge || b.path.some((p) => onEdge(p));
    const hand2 = !!b.hand || drawnNear(b.path);
    return {
      id: i,
      a: A.id,
      b: Bn.id,
      path: b.path.map(([x, y]): Pt => [x + ox, y + oy]),
      length: L,
      surface: Math.max(0, L - ra - rb),
      diameter,
      mean: ds.length ? ds.reduce((p, q) => p + q, 0) / ds.length : NaN,
      neck: sorted.length ? sorted[0] : NaN,
      straight: L > 0 ? Math.min(1, chord / L) : NaN,
      angle: ang,
      type,
      edge,
      ...(b.keep ? { keep: true } : {}),
      ...(b.excl ? { excl: true } : {}),
      ...(hand2 ? { hand: true } : {}),
      counted: type === 'junction' && !b.excl && !(edge && s.edge === 'exclude'),
      steps: { straight: st, diagonal: dg, ends },
      circles,
    };
  });
  // ---- the pores: the holes of the mask, each its largest inscribed circle ----
  const bg = Float32Array.from(m, (v) => 1 - v);
  const pl = label(bg, w, h, false);
  const pd = distanceMap(bg, w, h);
  const acc = Array.from({ length: pl.count }, () => ({ n: 0, sx: 0, sy: 0, d: 0, edge: false }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = pl.labels[y * w + x];
      if (!l) continue;
      const q = acc[l - 1];
      q.n++;
      q.sx += x + 0.5;
      q.sy += y + 0.5;
      q.d = Math.max(q.d, pd[y * w + x]);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) q.edge = true;
    }
  const pores: NetPore[] = acc.map((q, i) => ({ id: i, x: q.sx / q.n + ox, y: q.sy / q.n + oy, area: q.n, eq: Math.sqrt((4 * q.n) / Math.PI), inscribed: Math.max(1, 2 * q.d - 1), edge: q.edge }));
  const solid = m.reduce((a, v) => a + v, 0) / (w * h || 1);
  return { w, h, nodes: outNodes, branches: outBranches, pores, solid, pruned, examples };
}

// the branch whose path passes nearest a point (within 4 px of the image)
export function branchAt(net: NetworkResult | undefined, p: Pt | null): NetBranch | undefined {
  if (!net || !p) return undefined;
  let best: NetBranch | undefined;
  let bd = 4;
  for (const b of net.branches)
    for (const [x, y] of b.path) {
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bd) [best, bd] = [b, d];
    }
  return best;
}
// a branch's point to remember it by (its middle pixel: found again after the network is made again)
export const midOf = (b: NetBranch): Pt => b.path[b.path.length >> 1] ?? [NaN, NaN];

// The cut learnt from the spurs deleted and the end branches kept by hand: the ratio (length over the thickness at the
// junction) between them that sorts most of them right (the middle of the widest gap); null: no spur deleted
export function learnRatio(examples: { ratio: number; cut: boolean }[]): { ratio: number; right: number; of: number } | null {
  if (!examples.some((e) => e.cut)) return null;
  const xs = [...new Set(examples.map((e) => e.ratio))].sort((a, b) => a - b);
  const cands = [xs[0] - 0.01, ...xs.slice(1).map((x, k) => (x + xs[k]) / 2), xs[xs.length - 1] + 0.01];
  let best = { ratio: 1, right: -1, gap: -1 };
  for (const c of cands) {
    const right = examples.filter((e) => (e.ratio < c) === e.cut).length;
    const below = xs.filter((x) => x < c);
    const above = xs.filter((x) => x >= c);
    const gap = (above[0] ?? c + 1) - (below[below.length - 1] ?? c - 1);
    if (right > best.right || (right === best.right && gap > best.gap)) best = { ratio: c, right, gap };
  }
  return { ratio: Math.max(0.05, +best.ratio.toFixed(3)), right: best.right, of: examples.length };
}
