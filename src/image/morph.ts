// Morphology of the Image analysis node: gray erosion, dilation, opening, closing and top-hats by a disk or a square;
// on masks (0 / 1) the same, and holes filled, the skeleton (Zhang–Suen), the distance map (exact Euclidean), the
// objects labelled (connected components) and touching objects cut apart (watershed of the distance map). Pure.
import { map1 } from './raster.ts';
import { minMaxFilter, type Shape } from './filters.ts';

export const erode = (c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk') => minMaxFilter(c, w, h, r, false, shape);
export const dilate = (c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk') => minMaxFilter(c, w, h, r, true, shape);
export const opening = (c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk') => dilate(erode(c, w, h, r, shape), w, h, r, shape);
export const closing = (c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk') => erode(dilate(c, w, h, r, shape), w, h, r, shape);
// white top-hat: the bright details smaller than the disk (the image minus its opening); black: the dark ones
export function topHat(c: Float32Array, w: number, h: number, r: number, black: boolean, shape: Shape = 'disk'): Float32Array {
  if (black) {
    const cl = closing(c, w, h, r, shape);
    return map1(c, (v, i) => cl[i] - v);
  }
  const op = opening(c, w, h, r, shape);
  return map1(c, (v, i) => v - op[i]);
}

// ---- masks ----

// The objects of a mask labelled 1, 2 … (0: background), 8-connected (4: as scipy's default structure), in the order
// of their first pixel (row by row); the number of objects
export function label(m: ArrayLike<number>, w: number, h: number, eight = true): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || labels[i]) continue;
    labels[i] = ++count;
    let top = 0;
    stack[top++] = i;
    while (top) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!eight && dx && dy)) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (m[q] && !labels[q]) {
            labels[q] = count;
            stack[top++] = q;
          }
        }
    }
  }
  return { labels, count };
}

// the holes of a mask filled: background not reached from the image's edge (4-connected, as scipy's binary_fill_holes)
export function fillHoles(m: Float32Array, w: number, h: number): Float32Array {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!m[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  return map1(m, (v, i) => (v || !outside[i] ? 1 : 0));
}

// the Zhang–Suen table: for the 8 neighbours (weights 1 … 128 from the top-left, clockwise), whether the pixel may go
// in the first sub-iteration (1), the second (2) or both (3) — from the conditions of the paper (1984)
const ZS = (() => {
  const L = new Uint8Array(256);
  for (let idx = 0; idx < 256; idx++) {
    const [P9, P2, P3, P4, P5, P6, P7, P8] = Array.from({ length: 8 }, (_, k) => (idx >> k) & 1);
    const seq = [P2, P3, P4, P5, P6, P7, P8, P9, P2];
    let A = 0;
    for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++;
    const B = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9;
    if (B < 2 || B > 6 || A !== 1) continue;
    L[idx] = (P2 * P4 * P6 === 0 && P4 * P6 * P8 === 0 ? 1 : 0) | (P2 * P4 * P8 === 0 && P2 * P6 * P8 === 0 ? 2 : 0);
  }
  return L;
})();
// The skeleton of a mask (Zhang–Suen): thinned to lines one pixel wide, the shapes' connections kept
export function skeleton(m: Float32Array, w: number, h: number): Float32Array {
  const W = w + 2;
  const sk = new Uint8Array(W * (h + 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sk[(y + 1) * W + x + 1] = m[y * w + x] ? 1 : 0;
  const rm: number[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const pass of [1, 2]) {
      rm.length = 0;
      for (let y = 1; y <= h; y++)
        for (let x = 1; x <= w; x++) {
          const i = y * W + x;
          if (!sk[i]) continue;
          const idx = sk[i - W - 1] | (sk[i - W] << 1) | (sk[i - W + 1] << 2) | (sk[i + 1] << 3) | (sk[i + W + 1] << 4) | (sk[i + W] << 5) | (sk[i + W - 1] << 6) | (sk[i - 1] << 7);
          if (ZS[idx] & pass) rm.push(i);
        }
      for (const i of rm) sk[i] = 0;
      if (rm.length) changed = true;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = sk[(y + 1) * W + x + 1];
  return out;
}

// the squared distance along a line to the nearest zero of f (f: 0 at the sites, ∞ elsewhere) — Felzenszwalb &
// Huttenlocher's lower envelope of parabolas
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    if (f[q] === Infinity) continue;
    if (f[v[k]] === Infinity) {
      v[k] = q;
      continue;
    }
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = f[v[k]] === Infinity ? Infinity : (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
// The distance map of a mask: every object pixel its Euclidean distance (in pixels) to the nearest background pixel
// (as scipy's distance_transform_edt); a mask without background: the distance stays ∞ (given as the largest size)
export function distanceMap(m: Float32Array, w: number, h: number): Float32Array {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = m[y * w + x] ? Infinity : 0;
    edt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Number.isFinite(d[x]) ? Math.sqrt(d[x]) : n;
  }
  return out;
}

// The regional maxima of a map inside a mask, as markers: the plateaux higher than every neighbour, kept when they rise
// at least `tolerance` above the saddle to a higher one (a flooding from the top: the peaks of a dynamics ≥ tolerance)
export function maximaMarkers(dmap: Float32Array, m: Float32Array, w: number, h: number, tolerance: number): Int32Array {
  const n = w * h;
  const order = Array.from({ length: n }, (_, i) => i)
    .filter((i) => m[i])
    .sort((a, b) => dmap[b] - dmap[a] || a - b);
  // flooding from the highest: every pixel joins the basin of a neighbour already flooded (the highest peak wins);
  // a basin meeting a higher one keeps its own marker only if its peak is `tolerance` above that level
  const basin = new Int32Array(n).fill(-1);
  const peak: number[] = [];
  const alive: boolean[] = [];
  const root = (b: number): number => {
    while (parent[b] !== b) b = parent[b] = parent[parent[b]];
    return b;
  };
  const parent: number[] = [];
  for (const i of order) {
    const x = i % w;
    const y = (i - x) / w;
    const near = new Set<number>();
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const b = basin[yy * w + xx];
        if (b >= 0) near.add(root(b));
      }
    if (!near.size) {
      const b = peak.length;
      peak.push(dmap[i]);
      alive.push(true);
      parent.push(b);
      basin[i] = b;
      continue;
    }
    const bs = [...near].sort((a, b) => peak[b] - peak[a] || a - b);
    basin[i] = bs[0];
    for (const b of bs.slice(1)) {
      // a lower basin meets the highest at this level: merged when its peak is not `tolerance` above it
      if (peak[b] - dmap[i] < tolerance) {
        alive[b] = false;
        parent[b] = bs[0];
      }
    }
  }
  const markers = new Int32Array(n);
  let k = 0;
  const id = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (basin[i] < 0) continue;
    const b = basin[i];
    // the marker: the pixels of a living peak at its top level
    if (alive[b] && dmap[i] === peak[b]) {
      if (!id.has(b)) id.set(b, ++k);
      markers[i] = id.get(b)!;
    }
  }
  return markers;
}

// Marker-controlled watershed: every pixel of the mask joins the marker it is reached from first, flooding from the
// lowest (here: the highest distance first, the map negated), 8-connected; labels, 0 outside the mask
export function watershed(height: Float32Array, markers: Int32Array, m: Float32Array, w: number, h: number): Int32Array {
  const n = w * h;
  const lab = Int32Array.from(markers);
  // a binary heap of (height, order, pixel)
  const hp: number[] = [];
  const ho: number[] = [];
  const hi: number[] = [];
  let seq = 0;
  const less = (a: number, b: number) => hp[a] < hp[b] || (hp[a] === hp[b] && ho[a] < ho[b]);
  const swap = (a: number, b: number) => {
    [hp[a], hp[b]] = [hp[b], hp[a]];
    [ho[a], ho[b]] = [ho[b], ho[a]];
    [hi[a], hi[b]] = [hi[b], hi[a]];
  };
  const push = (v: number, i: number) => {
    hp.push(v);
    ho.push(seq++);
    hi.push(i);
    let k = hp.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(k, p)) break;
      swap(k, p);
      k = p;
    }
  };
  const pop = () => {
    const top = hi[0];
    const last = hp.length - 1;
    swap(0, last);
    hp.pop();
    ho.pop();
    hi.pop();
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let s = k;
      if (l < hp.length && less(l, s)) s = l;
      if (r < hp.length && less(r, s)) s = r;
      if (s === k) break;
      swap(k, s);
      k = s;
    }
    return top;
  };
  const queued = new Uint8Array(n);
  const visit = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (m[q] && !lab[q] && !queued[q]) {
          queued[q] = 1;
          push(height[q], q);
        }
      }
  };
  for (let i = 0; i < n; i++) if (lab[i]) visit(i);
  while (hp.length) {
    const i = pop();
    // the label of the first labelled neighbour reached (the lowest)
    const x = i % w;
    const y = (i - x) / w;
    let L = 0;
    let best = Infinity;
    for (let dy = -1; dy <= 1 && true; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (lab[q] && height[q] < best) [best, L] = [height[q], lab[q]];
      }
    lab[i] = L;
    visit(i);
  }
  return lab;
}

// Touching objects of a mask cut apart (as ImageJ's Watershed): the distance map's peaks (a dynamics of `tolerance`
// pixels) flooded, a line of background between the basins that meet
export function separate(m: Float32Array, w: number, h: number, tolerance = 0.5): Float32Array {
  const dm = distanceMap(m, w, h);
  const markers = maximaMarkers(dm, m, w, h, tolerance);
  const neg = map1(dm, (v) => -v);
  const lab = watershed(neg, markers, m, w, h);
  // the line, one pixel wide: a pixel whose right or lower neighbour is of another basin; then a pixel still touching
  // another basin across a diagonal (the objects would stay 8-connected there)
  const out = map1(lab, (l) => (l ? 1 : 0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!lab[i]) continue;
      if ((x < w - 1 && lab[i + 1] && lab[i + 1] !== lab[i]) || (y < h - 1 && lab[i + w] && lab[i + w] !== lab[i])) out[i] = 0;
    }
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!out[i]) continue;
      for (const q of [x < w - 1 ? i + w + 1 : -1, x > 0 ? i + w - 1 : -1])
        if (q >= 0 && out[q] && lab[q] !== lab[i]) {
          out[i] = 0;
          break;
        }
    }
  return out;
}
