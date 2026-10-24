// Structure ▸ grain size, orientation, fractal dimension (Image analysis). The grain size by the intercept method of
// ASTM E112: test lines (a grid of horizontal and vertical lines, or three circles) laid over the mask, the boundaries
// they cross counted (a crossing at a line's end a half), the mean lineal intercept ℓ = the length / the crossings,
// the ASTM grain size number G and the grains per mm². The orientation of the structures as OrientationJ finds it:
// the structure tensor of the gradient averaged over a window σ, at every pixel its direction and its coherency (1: one
// direction, 0: none), the dominant direction of the whole image and the distribution of the directions. The fractal
// dimension by box counting: boxes of 1, 2, 4 … px over the mask (or its edges), D the slope of log N against log 1/s.
// Pure.
import { gaussian } from './raster.ts';
import type { Pt } from './roi.ts';

export type TextureSpec = {
  // grain size: the mask is the boundaries, or the grains (the boundaries what is between them); test lines: a grid of
  // n horizontal and n vertical lines, or three circles; show: drawn over the image with the crossings
  grains?: { on?: boolean; of?: 'boundaries' | 'grains'; lines?: 'grid' | 'circles'; n?: number; show?: boolean };
  // orientation: the window σ (px); show: the image coloured by the direction (hue) and the coherency (saturation)
  orient?: { on?: boolean; sigma?: number; show?: boolean };
  // fractal dimension: of the mask, or of its edges
  fractal?: { on?: boolean; of?: 'edges' | 'mask' };
};

// ---- grain size (ASTM E112, intercepts) ----
export type InterceptSet = { name: string; length: number; hits: number };
export type Intercepts = { sets: InterceptSet[]; paths: { pts: Pt[]; closed: boolean }[]; marks: Pt[] };
export function intercepts(m: ArrayLike<number>, w: number, h: number, of: 'boundaries' | 'grains', lines: 'grid' | 'circles', n: number): Intercepts {
  const isB = (x: number, y: number) => {
    const [i, j] = [Math.floor(x), Math.floor(y)];
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    const v = m[j * w + i] > 0.5;
    return of === 'boundaries' ? v : !v;
  };
  const sets: InterceptSet[] = [];
  const paths: { pts: Pt[]; closed: boolean }[] = [];
  const marks: Pt[] = [];
  // (along a path sampled every half pixel: the runs of boundary, each a crossing, a half at an open path's end)
  const walk = (at: (t: number) => Pt, L: number, closed: boolean): number => {
    const N = Math.max(2, Math.ceil(L * 2));
    const on = Array.from({ length: N }, (_, i) => isB(...at((i / N) * L)));
    let hits = 0;
    // (a closed path: started where it is not on a boundary)
    const s0 = closed ? Math.max(0, on.indexOf(false)) : 0;
    if (closed && on.every(Boolean)) return 0;
    for (let k = 0; k < N; ) {
      const i = (s0 + k) % N;
      if (!on[i]) {
        k++;
        continue;
      }
      let e = k;
      while (e + 1 < N && on[(s0 + e + 1) % N]) e++;
      const atEnd = !closed && (k === 0 || e === N - 1);
      hits += atEnd ? 0.5 : 1;
      marks.push(at((((s0 + (k + e) / 2) % N) / N) * L));
      k = e + 1;
    }
    return hits;
  };
  const k = Math.max(1, Math.round(n));
  if (lines === 'grid') {
    let [hl, hh, vl, vh] = [0, 0, 0, 0];
    for (let i = 0; i < k; i++) {
      const y = (h * (i + 0.5)) / k;
      hh += walk((t) => [t, y], w, false);
      hl += w;
      paths.push({ pts: [[0, y], [w, y]], closed: false });
      const x = (w * (i + 0.5)) / k;
      vh += walk((t) => [x, t], h, false);
      vl += h;
      paths.push({ pts: [[x, 0], [x, h]], closed: false });
    }
    sets.push({ name: 'Horizontal', length: hl, hits: hh }, { name: 'Vertical', length: vl, hits: vh });
  } else {
    const R = 0.45 * Math.min(w, h);
    const [cx, cy] = [w / 2, h / 2];
    let [len, hits] = [0, 0];
    for (const f of [1, 2 / 3, 1 / 3]) {
      const r = R * f;
      const L = 2 * Math.PI * r;
      hits += walk((t) => [cx + r * Math.cos(t / r), cy + r * Math.sin(t / r)], L, true);
      len += L;
      paths.push({ pts: Array.from({ length: 96 }, (_, j): Pt => [cx + r * Math.cos((2 * Math.PI * j) / 96), cy + r * Math.sin((2 * Math.PI * j) / 96)]), closed: true });
    }
    sets.push({ name: 'Circles', length: len, hits });
  }
  return { sets, paths, marks };
}
// ASTM E112: the grain size number of a mean lineal intercept (mm), and the grains per mm² it means
export const astmG = (lMm: number) => -6.643856 * Math.log10(lMm) - 3.288;
export const grainsPerMm2 = (G: number) => 2 ** (G - 1) * 15.5;

// ---- orientation (the structure tensor) ----
export type Orientation = { theta: Float32Array; coh: Float32Array; energy: Float32Array; dominant: number; coherency: number; hist: number[] };
// at every pixel: the direction of the structures (degrees, counter-clockwise from x as seen, −90 … 90), its coherency
// and the energy of the gradient; the dominant direction and the coherency of the whole image; the distribution of the
// directions in 1° bins from −90 (each pixel weighted by its coherency, those of little energy left out), in %
export function orientation(c: Float32Array, w: number, h: number, sigma: number): Orientation {
  const n = w * h;
  const [gxx, gyy, gxy] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // (Scharr's differences: the same in every direction, a turned pattern read without a bias)
      const at = (i: number, j: number) => c[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
      const gx = (3 * (at(x + 1, y - 1) - at(x - 1, y - 1)) + 10 * (at(x + 1, y) - at(x - 1, y)) + 3 * (at(x + 1, y + 1) - at(x - 1, y + 1))) / 32;
      const gy = (3 * (at(x - 1, y + 1) - at(x - 1, y - 1)) + 10 * (at(x, y + 1) - at(x, y - 1)) + 3 * (at(x + 1, y + 1) - at(x + 1, y - 1))) / 32;
      const k = y * w + x;
      [gxx[k], gyy[k], gxy[k]] = [gx * gx, gy * gy, gx * gy];
    }
  const [Jxx, Jyy, Jxy] = [gaussian(gxx, w, h, sigma), gaussian(gyy, w, h, sigma), gaussian(gxy, w, h, sigma)];
  // (the gradient's main direction φ; the structures across it; y down in the image, up as seen)
  const dir = (a: number, b: number, cxy: number) => {
    const phi = 0.5 * Math.atan2(2 * cxy, a - b);
    let t = (-(phi + Math.PI / 2) * 180) / Math.PI;
    while (t <= -90) t += 180;
    while (t > 90) t -= 180;
    return t;
  };
  const theta = new Float32Array(n);
  const coh = new Float32Array(n);
  const energy = new Float32Array(n);
  let [sxx, syy, sxy, eSum] = [0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    const [a, b, cxy] = [Jxx[k], Jyy[k], Jxy[k]];
    theta[k] = dir(a, b, cxy);
    energy[k] = a + b;
    coh[k] = a + b > 1e-12 ? Math.sqrt((a - b) ** 2 + 4 * cxy * cxy) / (a + b) : 0;
    [sxx, syy, sxy, eSum] = [sxx + a, syy + b, sxy + cxy, eSum + a + b];
  }
  const hist = new Array<number>(180).fill(0);
  const floor = (0.1 * eSum) / n;
  let tot = 0;
  for (let k = 0; k < n; k++) {
    if (energy[k] < floor) continue;
    const b = Math.min(179, Math.max(0, Math.floor(theta[k] + 90)));
    hist[b] += coh[k];
    tot += coh[k];
  }
  return {
    theta,
    coh,
    energy,
    dominant: dir(sxx, syy, sxy),
    coherency: sxx + syy > 0 ? Math.sqrt((sxx - syy) ** 2 + 4 * sxy * sxy) / (sxx + syy) : 0,
    hist: hist.map((v) => (tot ? (100 * v) / tot : 0)),
  };
}
// The image coloured as OrientationJ does: the hue the direction, the saturation the coherency, the brightness the
// image's own (RGBA)
export function orientationColours(o: Orientation, c: Float32Array, lo: number, hi: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(c.length * 4);
  const sp = hi - lo || 1;
  for (let k = 0; k < c.length; k++) {
    const hue = ((o.theta[k] + 90) / 180) * 6;
    const s = Math.min(1, o.coh[k]);
    const v = Math.max(0, Math.min(1, (c[k] - lo) / sp));
    const i = Math.floor(hue) % 6;
    const f = hue - Math.floor(hue);
    const [p, q, t] = [v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))];
    const [r, g, b] = [
      [v, q, p, p, t, v][i],
      [t, v, v, q, p, p][i],
      [p, p, t, v, v, q][i],
    ];
    out[4 * k] = r * 255;
    out[4 * k + 1] = g * 255;
    out[4 * k + 2] = b * 255;
    out[4 * k + 3] = 255;
  }
  return out;
}

// ---- fractal dimension (box counting) ----
export function boxCounting(m: ArrayLike<number>, w: number, h: number, of: 'edges' | 'mask'): { sizes: number[]; counts: number[]; D: number; r2: number } {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] > 0.5;
  const set = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (on(x, y) && (of === 'mask' || !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) set[y * w + x] = 1;
  const sizes: number[] = [];
  const counts: number[] = [];
  for (let s = 1; s <= Math.min(w, h) / 4; s *= 2) {
    const [bw, bh] = [Math.ceil(w / s), Math.ceil(h / s)];
    const box = new Uint8Array(bw * bh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (set[y * w + x]) box[Math.floor(y / s) * bw + Math.floor(x / s)] = 1;
    let N = 0;
    for (const b of box) N += b;
    sizes.push(s);
    counts.push(N);
  }
  // (log N against log 1/s, by least squares)
  const pts = sizes.map((s, i) => [Math.log(1 / s), Math.log(counts[i])]).filter(([, y]) => Number.isFinite(y));
  const k = pts.length;
  if (k < 2) return { sizes, counts, D: NaN, r2: NaN };
  const [mx, my] = [pts.reduce((a, p) => a + p[0], 0) / k, pts.reduce((a, p) => a + p[1], 0) / k];
  let [sxx, sxy, syy] = [0, 0, 0];
  for (const [x, y] of pts) [sxx, sxy, syy] = [sxx + (x - mx) ** 2, sxy + (x - mx) * (y - my), syy + (y - my) ** 2];
  return { sizes, counts, D: sxy / sxx, r2: syy ? (sxy * sxy) / (sxx * syy) : NaN };
}
