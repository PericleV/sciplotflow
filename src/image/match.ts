// Find like this (Image analysis; template matching): the particles that look like the one picked, wherever they are,
// turned any way and a little larger or smaller, touching others or not. The model: the image in a disc around the
// selection picked (its corners and a little of what surrounds it: that is what tells its turn); compared with every
// place by the normalized cross-correlation (1: the same up to brightness and contrast), turned and scaled; first on the
// image shrunk (the model about 12 px across), then the best places refined at full size; places closer than most of a
// particle to a better one dropped. Pure.
import type { Pt } from './roi.ts';
import { fft2, nextPow2 } from './fft2d.ts';

// symmetry: the turns that look the same (a square: 90°, a rectangle: 180°, none: 360°); step: between the turns tried
// (degrees); sizes: ± that part (0.1: 10 %); min: the least similarity kept (0–1); max: the most found; context: what is
// compared around the particle — a disc around the selection (absent, as before), only the particle and its edge
// (cluster: its neighbours, whatever they are, left out), the particle and the ground around it out to `ring` px
// (alone: a particle on its own, not one in a cluster nor a piece of the ground), or what is inside a margin drawn by
// hand around it (drawn).
// The finer settings (Advanced; absent: as before): reach, two places closer than that part of the model's radius are
// one particle (0.75); tried, how many sizes from −sizes to +sizes (3); coarse, the model's radius on the image shrunk
// for the first search (5 px); candidates, the places of that search kept for the fine one, as a part of min (0.8);
// edge, the band outside the outline compared with “only the particle” (1.5 px); brightness, the places as bright and
// as contrasted as the model too (else alike up to them); compare, what is compared: the values (brightness, as
// before), the directions of the outline (edges), or both; separate, two places are one particle when closer than reach
// (distance, as before) or when their outlines overlap more than overlap (a part of the smaller); fft: the first search
// through the FFT or not (absent: whichever costs less).
export type MatchContext = 'disc' | 'cluster' | 'alone' | 'drawn';
export type MatchOpts = { symmetry: 90 | 180 | 360; step: number; sizes: number; min: number; max: number; context?: MatchContext; ring?: number; reach?: number; tried?: number; coarse?: number; candidates?: number; edge?: number; brightness?: boolean; compare?: 'brightness' | 'edges' | 'both'; separate?: 'distance' | 'overlap'; overlap?: number; fft?: boolean };
// A model of Find like this kept in a list, each with its own settings: the selection it is (by its id), what is compared
// around it (outer: the margin drawn, its points as offsets from the model's centre, pixels of the original), its turns
// and sizes, the group its particles go in (absent: the settings and the group of all)
export type MatchModelSpec = { roi: string; context?: MatchContext; ring?: number; outer?: Pt[]; symmetry?: MatchOpts['symmetry']; sizes?: number; group?: string };
// a particle found then left out by hand (Review): the model it was found by, its place (pixels of the original), turn
// and size against the model
export type MatchRejected = { roi: string; x: number; y: number; angle: number; scale: number };
// an example for the classifier of Review: a particle found, said good or not by hand (its place, pixels of the original;
// its features, as found)
export type MatchExample = { roi: string; x: number; y: number; good: boolean; f: number[] };
// the band outside the particle's outline still compared in a cluster (its edge), pixels
export const EDGE_BAND = 1.5;
export const MATCH_DEFAULTS: MatchOpts = { symmetry: 90, step: 5, sizes: 0.1, min: 0.5, max: 2000 };
// the finer settings as they are when not given
export const MATCH_TUNING = { reach: 0.75, tried: 3, coarse: 5, candidates: 0.8, edge: EDGE_BAND, overlap: 0.3 };
// Advanced ▸ Preset: faster (fewer turns, a coarser first search) or more thorough
export const MATCH_PRESETS: Record<'fast' | 'balanced' | 'precise', Pick<MatchOpts, 'step' | 'tried' | 'coarse' | 'candidates'>> = {
  fast: { step: 10, tried: 3, coarse: 4, candidates: 0.85 },
  balanced: { step: 5, tried: 3, coarse: 5, candidates: 0.8 },
  precise: { step: 2, tried: 5, coarse: 8, candidates: 0.7 },
};
export type Match = { x: number; y: number; angle: number; scale: number; score: number };

// a value between the pixels' centres (bilinear), the edge held
function at(c: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x - 0.5));
  const fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  return (c[y0 * w + x0] * (1 - tx) + c[y0 * w + x1] * tx) * (1 - ty) + (c[y1 * w + x0] * (1 - tx) + c[y1 * w + x1] * tx) * ty;
}
// an image shrunk by f (block means)
function shrink(c: Float32Array, w: number, h: number, f: number): { c: Float32Array; w: number; h: number } {
  if (f <= 1) return { c, w, h };
  const [sw, sh] = [Math.floor(w / f), Math.floor(h / f)];
  const out = new Float32Array(sw * sh);
  for (let y = 0; y < sh * f; y++)
    for (let x = 0; x < sw * f; x++) out[Math.floor(y / f) * sw + Math.floor(x / f)] += c[y * w + x];
  for (let i = 0; i < out.length; i++) out[i] /= f * f;
  return { c: out, w: sw, h: sh };
}

// the offsets of a disc of radius R (whole pixels)
function disc(R: number): Int32Array[] {
  const dx: number[] = [];
  const dy: number[] = [];
  const r = Math.floor(R);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= R * R) {
        dx.push(x);
        dy.push(y);
      }
  return [Int32Array.from(dx), Int32Array.from(dy)];
}
// the model turned by `a` (degrees, as the selections turn: clockwise as seen) and scaled by s, sampled at the disc's
// offsets, its mean taken off and scaled to a unit norm (null: flat)
function model(c: Float32Array, w: number, h: number, cx: number, cy: number, dx: Int32Array, dy: Int32Array, a: number, s: number): Float32Array | null {
  const t = (a * Math.PI) / 180;
  const [co, si] = [Math.cos(t), Math.sin(t)];
  const n = dx.length;
  const v = new Float32Array(n);
  let m = 0;
  for (let k = 0; k < n; k++) {
    // (the particle there is the model turned by a: its point o comes from the model's turned back)
    const [u, q] = [dx[k] / s, dy[k] / s];
    v[k] = at(c, w, h, cx + u * co + q * si, cy - u * si + q * co);
    m += v[k];
  }
  m /= n;
  let ss = 0;
  for (let k = 0; k < n; k++) {
    v[k] -= m;
    ss += v[k] * v[k];
  }
  if (!(ss > 1e-9)) return null;
  const sc = 1 / Math.sqrt(ss);
  for (let k = 0; k < n; k++) v[k] *= sc;
  return v;
}
// the sum and the sum of squares of the image over the disc at every place (0 where it does not fit)
function discStats(c: Float32Array, w: number, h: number, dx: Int32Array, dy: Int32Array, r: number): { s1: Float64Array; s2: Float64Array } {
  const s1 = new Float64Array(w * h);
  const s2 = new Float64Array(w * h);
  const n = dx.length;
  for (let y = r; y < h - r; y++)
    for (let x = r; x < w - r; x++) {
      let a = 0;
      let b = 0;
      for (let k = 0; k < n; k++) {
        const p = c[(y + dy[k]) * w + x + dx[k]];
        a += p;
        b += p * p;
      }
      s1[y * w + x] = a;
      s2[y * w + x] = b;
    }
  return { s1, s2 };
}
// ---- a model in the shape of the particle (and the ground around it): only the points of the disc inside it ----

const inPoly = (poly: Pt[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const distPoly = (poly: Pt[], x: number, y: number) => {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const [vx, vy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
  }
  return d;
};
// The model turned by a and scaled by s in the shape of the region (`inside`: its points, in the coordinates of the
// model's centre): the offsets of the disc whose point of the model falls in it, the model's values there (zero mean,
// unit norm), their own mean and spread; null: flat or empty
type Region = { dx: Int32Array; dy: Int32Array; v: Float32Array; m: number; sd: number };
function regionModel(c: Float32Array, w: number, h: number, cx: number, cy: number, dx: Int32Array, dy: Int32Array, a: number, s: number, inside: (x: number, y: number) => boolean): Region | null {
  const t = (a * Math.PI) / 180;
  const [co, si] = [Math.cos(t), Math.sin(t)];
  const ox: number[] = [];
  const oy: number[] = [];
  const vals: number[] = [];
  for (let k = 0; k < dx.length; k++) {
    const [u, q] = [dx[k] / s, dy[k] / s];
    const [mx, my] = [cx + u * co + q * si, cy - u * si + q * co];
    if (!inside(mx, my)) continue;
    ox.push(dx[k]);
    oy.push(dy[k]);
    vals.push(at(c, w, h, mx, my));
  }
  const n = vals.length;
  if (n < 6) return null;
  const m = vals.reduce((a2, b) => a2 + b, 0) / n;
  let ss = 0;
  const v = Float32Array.from(vals, (x) => x - m);
  for (const x of v) ss += x * x;
  if (!(ss > 1e-9)) return null;
  const sc = 1 / Math.sqrt(ss);
  for (let k = 0; k < n; k++) v[k] *= sc;
  return { dx: Int32Array.from(ox), dy: Int32Array.from(oy), v, m, sd: Math.sqrt(ss / n) };
}
// how alike a place is to the model in brightness and contrast (1 the same): the ratio of their spreads, and the
// difference of their means against the model's spread
const brightAlike = (s1: number, s2: number, n: number, ref: { m: number; sd: number }) => {
  const m = s1 / n;
  const sd = Math.sqrt(Math.max(0, s2 / n - m * m));
  return sd > 0 && ref.sd > 0 ? Math.min(sd / ref.sd, ref.sd / sd) * Math.exp(-Math.abs(m - ref.m) / ref.sd) : 0;
};
// the similarity of the model (zero mean, unit norm) with the image at a place: the correlation with the image's
// values there (their own mean and spread: from their sums s1, s2); ref: the model's own mean and spread, when the
// brightness counts too
function ncc(c: Float32Array, w: number, x: number, y: number, dx: Int32Array, dy: Int32Array, v: Float32Array, s1: number, s2: number, ref?: { m: number; sd: number }): number {
  let s = 0;
  const n = dx.length;
  const o = y * w + x;
  for (let k = 0; k < n; k++) s += c[o + dy[k] * w + dx[k]] * v[k];
  const varr = s2 - (s1 * s1) / n;
  const q = varr > 1e-9 ? s / Math.sqrt(varr) : 0;
  return ref ? q * brightAlike(s1, s2, n, ref) : q;
}

// What is compared around a model, when it is not the disc: the points inside the margin drawn, or the outline and
// `extra` px around it (only the particle and its edge; the particle and the ground); R: the radius of the disc that holds
// them, around the model's centre (cx, cy); null: the disc
export function comparedRegion(o: MatchOpts, cx: number, cy: number, poly?: Pt[], outer?: Pt[]): { inside: (x: number, y: number) => boolean; R: number } | null {
  if (o.context === 'drawn' && outer && outer.length >= 3) return { inside: (x, y) => inPoly(outer, x, y), R: Math.max(...outer.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 1 };
  if (!poly || poly.length < 3 || (o.context !== 'cluster' && o.context !== 'alone')) return null;
  const band = o.edge ?? MATCH_TUNING.edge;
  const extra = o.context === 'alone' ? Math.max(band, o.ring ?? 0) : band;
  return { inside: (x, y) => inPoly(poly, x, y) || distPoly(poly, x, y) <= extra, R: Math.max(...poly.map(([x, y]) => Math.hypot(x - cx, y - cy))) + extra + 1 };
}

// ---- edges: the direction of the outline at every pixel ----

// Sobel's gradient of an image (its edges held), and its direction as a unit vector (0 where the image is flat)
export type Grad = { gx: Float32Array; gy: Float32Array; ux: Float32Array; uy: Float32Array };
// the weak gradients left without a direction: below this many times their median (noise rather than edges)
const EDGE_FLOOR = 1.5;
export function gradients(c: Float32Array, w: number, h: number): Grad {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const ux = new Float32Array(w * h);
  const uy = new Float32Array(w * h);
  const v = (x: number, y: number) => c[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  let max = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gx[i] = v(x + 1, y - 1) + 2 * v(x + 1, y) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x - 1, y) - v(x - 1, y + 1);
      gy[i] = v(x - 1, y + 1) + 2 * v(x, y + 1) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x, y - 1) - v(x + 1, y - 1);
      max = Math.max(max, Math.hypot(gx[i], gy[i]));
    }
  // (the weak gradients, noise rather than edges, left without a direction: k × their median)
  const mags = Float32Array.from(gx, (x, i) => Math.hypot(x, gy[i]));
  const sorted = Float32Array.from(mags).sort();
  const eps = Math.max(1e-6 * max, EDGE_FLOOR * sorted[sorted.length >> 1]);
  for (let i = 0; i < w * h; i++) {
    const m = mags[i];
    if (m > eps) [ux[i], uy[i]] = [gx[i] / m, gy[i] / m];
  }
  return { gx, gy, ux, uy };
}

// ---- a template: the model turned by a and sized by s, as it is compared at a place ----

// the offsets compared (of a disc, or only those whose point of the model is in the region); the model's values there
// (zero mean, unit norm; null: flat) with their own mean and spread; full: every offset of the disc (the image's sums
// over it the same for every turn); its edges: the offsets where the model's outline is strong (a third of the
// strongest or more) and the outline's direction there, as it lies at the place (unit vectors)
type Tpl = { dx: Int32Array; dy: Int32Array; v: Float32Array | null; m: number; sd: number; full: boolean; ek: Int32Array; ex: Float32Array; ey: Float32Array };
function template(c: Float32Array, w: number, h: number, g: Grad | null, cx: number, cy: number, dx0: Int32Array, dy0: Int32Array, a: number, s: number, inside: ((x: number, y: number) => boolean) | null): Tpl | null {
  const t = (a * Math.PI) / 180;
  const [co, si] = [Math.cos(t), Math.sin(t)];
  const ox: number[] = [];
  const oy: number[] = [];
  const vals: number[] = [];
  const gxs: number[] = [];
  const gys: number[] = [];
  for (let k = 0; k < dx0.length; k++) {
    // (the particle there is the model turned by a: its point comes from the model's turned back)
    const [u, q] = [dx0[k] / s, dy0[k] / s];
    const [mx, my] = [cx + u * co + q * si, cy - u * si + q * co];
    if (inside && !inside(mx, my)) continue;
    ox.push(dx0[k]);
    oy.push(dy0[k]);
    vals.push(at(c, w, h, mx, my));
    if (g) {
      // (the model's gradient there, turned as the place is: ∇place = Mᵀ ∇model)
      const [gmx, gmy] = [at(g.gx, w, h, mx, my), at(g.gy, w, h, mx, my)];
      gxs.push(co * gmx - si * gmy);
      gys.push(si * gmx + co * gmy);
    }
  }
  const n = vals.length;
  if (n < 6) return null;
  const m = vals.reduce((p, q) => p + q, 0) / n;
  let ss = 0;
  for (const x of vals) ss += (x - m) * (x - m);
  const v = ss > 1e-9 ? Float32Array.from(vals, (x) => (x - m) / Math.sqrt(ss)) : null;
  const ek: number[] = [];
  const ex: number[] = [];
  const ey: number[] = [];
  if (g) {
    const mags = gxs.map((x, k) => Math.hypot(x, gys[k]));
    const thr = (Math.max(...mags) || 0) / 3;
    mags.forEach((mg, k) => {
      if (thr > 0 && mg >= thr) {
        ek.push(k);
        ex.push(gxs[k] / mg);
        ey.push(gys[k] / mg);
      }
    });
  }
  return { dx: Int32Array.from(ox), dy: Int32Array.from(oy), v, m, sd: Math.sqrt(ss / n), full: !inside, ek: Int32Array.from(ek), ex: Float32Array.from(ex), ey: Float32Array.from(ey) };
}

export type MatchCompare = 'brightness' | 'edges' | 'both';
// the least number of the model's edge points for its edges to be compared
const EDGE_POINTS = 6;
// A template's similarity at a place (x, y: it fits): of the values (the correlation; bright: the brightness and the
// contrast too), of the edges (the mean agreement of the outline's directions, 1 the same), or both (their mean); s1,
// s2: the image's sums over the template's offsets when known (a full disc)
function scoreAt(c: Float32Array, w: number, g: Grad | null, x: number, y: number, t: Tpl, mode: MatchCompare, bright: boolean, s1?: number, s2?: number): number {
  const o = y * w + x;
  const n = t.dx.length;
  let qi = 0;
  if (mode !== 'edges') {
    if (!t.v) return -1;
    let s = 0;
    let [a1, a2] = [s1 ?? 0, s2 ?? 0];
    const own = s1 === undefined;
    for (let k = 0; k < n; k++) {
      const p = c[o + t.dy[k] * w + t.dx[k]];
      s += p * t.v[k];
      if (own) {
        a1 += p;
        a2 += p * p;
      }
    }
    const varr = a2 - (a1 * a1) / n;
    qi = varr > 1e-9 ? s / Math.sqrt(varr) : 0;
    if (bright) qi *= brightAlike(a1, a2, n, t);
    if (mode === 'brightness') return qi;
  }
  const ne = t.ek.length;
  if (!g || ne < EDGE_POINTS) return mode === 'edges' ? -1 : qi;
  let se = 0;
  for (let j = 0; j < ne; j++) {
    const k = t.ek[j];
    const p = o + t.dy[k] * w + t.dx[k];
    se += t.ex[j] * g.ux[p] + t.ey[j] * g.uy[p];
  }
  const qe = se / ne;
  return mode === 'edges' ? qe : (qi + qe) / 2;
}

// ---- the same at every place at once, through the FFT (for large templates on large images) ----

type Spec2 = { re: Float64Array; im: Float64Array };
// an image (w × h) padded with zeros into N × N, its 2D FFT
function spec2(c: Float32Array | Float64Array, w: number, h: number, N: number, f: (v: number) => number = (v) => v): Spec2 {
  const re = new Float64Array(N * N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) re[y * N + x] = f(c[y * w + x]);
  const im = new Float64Array(N * N);
  fft2(re, im, N);
  return { re, im };
}
// the correlation of an image (its FFT) with values at offsets: Σ_k vals_k · img(x + dx_k, y + dy_k), at every place
function corrAt(F: Spec2, N: number, dx: Int32Array, dy: Int32Array, idx: ArrayLike<number> | null, vals: ArrayLike<number> | null): Float64Array {
  const re = new Float64Array(N * N);
  const n = idx ? idx.length : dx.length;
  for (let j = 0; j < n; j++) {
    const k = idx ? idx[j] : j;
    re[(((dy[k] % N) + N) % N) * N + (((dx[k] % N) + N) % N)] += vals ? vals[j] : 1;
  }
  const im = new Float64Array(N * N);
  fft2(re, im, N);
  // (the image's spectrum times the conjugate of the template's)
  for (let i = 0; i < N * N; i++) {
    const [a, b, cc, d] = [F.re[i], F.im[i], re[i], -im[i]];
    re[i] = a * cc - b * d;
    im[i] = a * d + b * cc;
  }
  fft2(re, im, N, true);
  return re;
}
// what the FFT is given of an image once: its values, their squares, the directions of its edges
type FftImg = { N: number; I?: Spec2; I2?: Spec2; ux?: Spec2; uy?: Spec2 };
function fftImage(c: Float32Array, w: number, h: number, g: Grad | null, mode: MatchCompare, region: boolean): FftImg {
  const N = nextPow2(Math.max(w, h));
  const fi: FftImg = { N };
  if (mode !== 'edges') {
    fi.I = spec2(c, w, h, N);
    if (region) fi.I2 = spec2(c, w, h, N, (v) => v * v);
  }
  if (mode !== 'brightness' && g) {
    fi.ux = spec2(g.ux, w, h, N);
    fi.uy = spec2(g.uy, w, h, N);
  }
  return fi;
}
// A template's similarity at every place where it fits (r from the edges), as scoreAt; discS: the image's sums over a
// full disc, when known
function scoreMap(fi: FftImg, w: number, h: number, r: number, t: Tpl, mode: MatchCompare, bright: boolean, discS?: { s1: Float64Array; s2: Float64Array }): Float32Array {
  const N = fi.N;
  const out = new Float32Array(w * h).fill(-1);
  const n = t.dx.length;
  let A: Float64Array | null = null;
  let S1: Float64Array | null = null;
  let S2: Float64Array | null = null;
  if (mode !== 'edges' && t.v && fi.I) {
    A = corrAt(fi.I, N, t.dx, t.dy, null, t.v);
    if (!(t.full && discS)) {
      S1 = corrAt(fi.I, N, t.dx, t.dy, null, null);
      S2 = corrAt(fi.I2 ?? fi.I, N, t.dx, t.dy, null, null);
    }
  }
  const ne = t.ek.length;
  const E = mode !== 'brightness' && fi.ux && fi.uy && ne >= EDGE_POINTS ? corrAt(fi.ux, N, t.dx, t.dy, t.ek, t.ex) : null;
  if (E) {
    const Ey = corrAt(fi.uy!, N, t.dx, t.dy, t.ek, t.ey);
    for (let i = 0; i < E.length; i++) E[i] += Ey[i];
  }
  for (let y = r; y < h - r; y++)
    for (let x = r; x < w - r; x++) {
      const i = y * w + x;
      const p = y * N + x;
      let qi = 0;
      if (mode !== 'edges') {
        if (!A) continue;
        const [a1, a2] = t.full && discS ? [discS.s1[i], discS.s2[i]] : [S1![p], S2![p]];
        const varr = a2 - (a1 * a1) / n;
        qi = varr > 1e-9 ? A[p] / Math.sqrt(varr) : 0;
        if (bright) qi *= brightAlike(a1, a2, n, t);
        if (mode === 'brightness') {
          out[i] = qi;
          continue;
        }
      }
      if (!E) {
        out[i] = mode === 'edges' ? -1 : qi;
        continue;
      }
      const qe = E[p] / ne;
      out[i] = mode === 'edges' ? qe : (qi + qe) / 2;
    }
  return out;
}

// ---- how much two particles found overlap ----

// the part of the smaller of two outlines that the other covers (counted on a grid of about 400 points over each)
export function overlapOf(a: Pt[], b: Pt[]): number {
  const box = (p: Pt[]) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
  const [ba, bb] = [box(a), box(b)];
  if (ba[2] < bb[0] || bb[2] < ba[0] || ba[3] < bb[1] || bb[3] < ba[1]) return 0;
  const count = (p: Pt[], q: Pt[], bx: number[]) => {
    const step = Math.max((bx[2] - bx[0]) / 20, (bx[3] - bx[1]) / 20, 1e-6);
    let [inP, both] = [0, 0];
    for (let y = bx[1] + step / 2; y < bx[3]; y += step)
      for (let x = bx[0] + step / 2; x < bx[2]; x += step)
        if (inPoly(p, x, y)) {
          inP++;
          if (inPoly(q, x, y)) both++;
        }
    return inP ? both / inP : 0;
  };
  return Math.max(count(a, b, ba), count(b, a, bb));
}
// a circle as an outline (a model without one)
const circle = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 16 }, (_, k): Pt => [cx + r * Math.cos((k * Math.PI) / 8), cy + r * Math.sin((k * Math.PI) / 8)]);

// The places like the model: c (w × h) the image; (cx, cy) the model's centre and R0 the radius of the disc it is taken
// in (pixels of the image); the places of the centres, the turn (0 … symmetry), the size against the model's, the
// similarity; the best first. poly: the model's outline (pixels of the image) — with the context cluster or alone, only
// it (and its edge, or the ground around it) is compared; with “overlap”, two places are one particle when their outlines
// overlap; outer: the margin drawn around it (pixels of the image), with the context drawn: what is inside it is compared
export function findLike(c: Float32Array, w: number, h: number, cx: number, cy: number, R0: number, o: MatchOpts, poly?: Pt[], outer?: Pt[]): Match[] {
  const region = comparedRegion(o, cx, cy, poly, outer);
  const inside = region?.inside ?? null;
  const R = region?.R ?? R0;
  const mode: MatchCompare = o.compare ?? 'brightness';
  const bright = !!o.brightness;
  // (shrunk so the model's disc is about `coarse` px in radius)
  const f = Math.max(1, Math.round(R / Math.max(1, o.coarse ?? MATCH_TUNING.coarse)));
  const sm = shrink(c, w, h, f);
  const Rs = R / f;
  const gFull = mode === 'brightness' ? null : gradients(c, w, h);
  const gSm = mode === 'brightness' ? null : f === 1 ? gFull : gradients(sm.c, sm.w, sm.h);
  // (a shaped model: the turns tried every 10° on the image shrunk unless a step is chosen, refined at 1° after — it
  // costs more a place)
  const step = Math.max(1, inside && o.step === MATCH_DEFAULTS.step ? 10 : o.step);
  const angles: number[] = [];
  for (let a = 0; a < o.symmetry - 1e-9; a += step) angles.push(a);
  // (the sizes tried: from −sizes to +sizes, an odd number of them)
  const tried = Math.max(1, Math.round(o.tried ?? MATCH_TUNING.tried));
  const nSizes = o.sizes > 0 ? (tried % 2 ? tried : tried + 1) : 1;
  const scales = nSizes > 1 ? Array.from({ length: nSizes }, (_, k) => 1 - o.sizes + (2 * o.sizes * k) / (nSizes - 1)) : [1];
  // (on the image shrunk: every place, its best turn and size)
  const best = new Float32Array(sm.w * sm.h).fill(-1);
  const bestA = new Float32Array(sm.w * sm.h);
  const bestS = new Float32Array(sm.w * sm.h);
  let fi: FftImg | null = null;
  for (const s of scales) {
    const [dx, dy] = disc(Rs * s);
    const r = Math.ceil(Rs * s);
    const tpls = angles.map((a) => template(sm.c, sm.w, sm.h, gSm, cx / f, cy / f, dx, dy, a, s, inside ? (x, y) => inside(x * f, y * f) : null));
    // (every place: directly, or through the FFT when that costs less — a large template on a large image; the costs
    // as measured: a product and a sum a point of the template a place, against two FFTs of N × N a correlation)
    const places = Math.max(0, sm.w - 2 * r) * Math.max(0, sm.h - 2 * r);
    const N = nextPow2(Math.max(sm.w, sm.h));
    const t0 = tpls.find((t) => !!t);
    const direct = places * ((mode !== 'edges' ? (t0?.dx.length ?? 0) : 0) + (mode !== 'brightness' ? (t0?.ek.length ?? 0) : 0));
    const perTpl = (mode !== 'edges' ? (inside ? 3 : 1) : 0) + (mode !== 'brightness' ? 2 : 0);
    const viaFft = 2 * perTpl * N * N * Math.log2(N) * 10;
    const useFft = o.fft ?? (viaFft < 0.6 * direct && N <= 2048);
    const discS = !inside && mode !== 'edges' ? discStats(sm.c, sm.w, sm.h, dx, dy, r) : undefined;
    if (useFft) fi ??= fftImage(sm.c, sm.w, sm.h, gSm, mode, !!inside);
    tpls.forEach((t, k) => {
      if (!t) return;
      if (useFft) {
        const map = scoreMap(fi!, sm.w, sm.h, r, t, mode, bright, discS);
        for (let i = 0; i < map.length; i++) if (map[i] > best[i]) [best[i], bestA[i], bestS[i]] = [map[i], angles[k], s];
        return;
      }
      for (let y = r; y < sm.h - r; y++)
        for (let x = r; x < sm.w - r; x++) {
          const i = y * sm.w + x;
          const q = t.full && discS ? scoreAt(sm.c, sm.w, gSm, x, y, t, mode, bright, discS.s1[i], discS.s2[i]) : scoreAt(sm.c, sm.w, gSm, x, y, t, mode, bright);
          if (q > best[i]) [best[i], bestA[i], bestS[i]] = [q, angles[k], s];
        }
    });
  }
  // (the local maxima near the least similarity or above, the best first)
  const cand: number[] = [];
  for (let y = 1; y < sm.h - 1; y++)
    for (let x = 1; x < sm.w - 1; x++) {
      const i = y * sm.w + x;
      const b = best[i];
      if (b < o.min * (o.candidates ?? MATCH_TUNING.candidates)) continue;
      if (b >= best[i - 1] && b >= best[i + 1] && b >= best[i - sm.w] && b >= best[i + sm.w]) cand.push(i);
    }
  cand.sort((a, b) => best[b] - best[a]);
  // (two places one particle: closer than reach × R, or, by overlap, their outlines covering each other more than asked)
  const reach = (o.reach ?? MATCH_TUNING.reach) * R;
  const byOverlap = o.separate === 'overlap';
  const shape = poly && poly.length >= 3 ? poly : circle(cx, cy, 0.7 * R0);
  const placed = (m: Match) => placeLike(shape, cx, cy, m.angle, m.scale, m.x, m.y);
  const outlines = new Map<Match, Pt[]>();
  const clash = (m: Match, p: Match) => {
    if (!byOverlap) return Math.hypot(p.x - m.x, p.y - m.y) < reach;
    if (Math.hypot(p.x - m.x, p.y - m.y) > 2 * R * Math.max(m.scale, p.scale)) return false;
    if (!outlines.has(m)) outlines.set(m, placed(m));
    if (!outlines.has(p)) outlines.set(p, placed(p));
    return overlapOf(outlines.get(m)!, outlines.get(p)!) > (o.overlap ?? MATCH_TUNING.overlap);
  };
  // (refined at full size: the place within the shrinking, the turn within a step either side at 1°, the size within
  // half its step)
  const out: Match[] = [];
  const ds = nSizes > 1 ? o.sizes / (nSizes - 1) : 0;
  const cache = new Map<string, Tpl | null>();
  for (const i of cand) {
    if (out.length >= o.max) break;
    const [x0, y0] = [((i % sm.w) + 0.5) * f, (Math.floor(i / sm.w) + 0.5) * f];
    // (a place found already very near: never two there)
    if (out.some((m) => Math.hypot(m.x - x0, m.y - y0) < (byOverlap ? 0.25 : 1) * reach)) continue;
    let m: Match = { x: x0, y: y0, angle: bestA[i], scale: bestS[i], score: -1 };
    for (const s of ds ? [bestS[i] - ds, bestS[i], bestS[i] + ds] : [bestS[i]]) {
      const [dx, dy] = disc(R * s);
      const r = Math.ceil(R * s);
      const fits = (x: number, y: number) => x >= r && y >= r && x < w - r && y < h - r;
      const turns: { a: number; t: Tpl }[] = [];
      for (let a = bestA[i] - step; a <= bestA[i] + step + 1e-9; a += 1) {
        const key = `${a}|${s.toFixed(4)}`;
        if (!cache.has(key)) cache.set(key, template(c, w, h, gFull, cx, cy, dx, dy, a, s, inside));
        const t = cache.get(key);
        if (t) turns.push({ a, t });
      }
      if (!turns.length) continue;
      if (!inside) {
        // (a disc: every place within the shrinking at every turn; the image's sums over the disc once a place)
        for (let y = Math.floor(y0 - f); y <= Math.ceil(y0 + f); y++)
          for (let x = Math.floor(x0 - f); x <= Math.ceil(x0 + f); x++) {
            if (!fits(x, y)) continue;
            let [s1, s2] = [0, 0];
            if (mode !== 'edges')
              for (let k = 0; k < dx.length; k++) {
                const p = c[(y + dy[k]) * w + x + dx[k]];
                s1 += p;
                s2 += p * p;
              }
            for (const { a, t } of turns) {
              const q = mode === 'edges' ? scoreAt(c, w, gFull, x, y, t, mode, bright) : scoreAt(c, w, gFull, x, y, t, mode, bright, s1, s2);
              if (q > m.score) m = { x: x + 0.5, y: y + 0.5, angle: a, scale: s, score: q };
            }
          }
        continue;
      }
      // (in steps, each a fraction of all the places × turns: the place at the turn found on the image shrunk, the turn
      // at that place, the place again within a pixel)
      let bt = turns.reduce((p, q) => (Math.abs(q.a - bestA[i]) < Math.abs(p.a - bestA[i]) ? q : p), turns[0]);
      let [bx, by, bq] = [Math.round(x0), Math.round(y0), -2];
      for (let y = Math.floor(y0 - f); y <= Math.ceil(y0 + f); y++)
        for (let x = Math.floor(x0 - f); x <= Math.ceil(x0 + f); x++) {
          if (!fits(x, y)) continue;
          const q = scoreAt(c, w, gFull, x, y, bt.t, mode, bright);
          if (q > bq) [bx, by, bq] = [x, y, q];
        }
      if (!fits(bx, by)) continue;
      for (const t of turns) {
        const q = scoreAt(c, w, gFull, bx, by, t.t, mode, bright);
        if (q > bq) [bt, bq] = [t, q];
      }
      const [cx0, cy0] = [bx, by];
      for (let y = cy0 - 1; y <= cy0 + 1; y++)
        for (let x = cx0 - 1; x <= cx0 + 1; x++) {
          if (!fits(x, y)) continue;
          const q = scoreAt(c, w, gFull, x, y, bt.t, mode, bright);
          if (q > bq) [bx, by, bq] = [x, y, q];
        }
      if (bq > m.score) m = { x: bx + 0.5, y: by + 0.5, angle: bt.a, scale: s, score: bq };
    }
    if (m.score < o.min || out.some((p) => clash(m, p))) continue;
    // (the turn within 0 … symmetry)
    m.angle = ((m.angle % o.symmetry) + o.symmetry) % o.symmetry;
    out.push(m);
  }
  return out;
}

// ---- what is known of every particle found (what the classifier of Review learns from) ----

export const FEATURE_NAMES = ['Brightness', 'Edges', 'Mean', 'Contrast', 'Size', 'Turn', 'Texture', 'Nearest'];
// Of every place found: how alike the model it is by its values and by its edges (over what is compared), its mean
// against the model's (in the model's spreads), its contrast against the model's (log), its size and turn against the
// model's, its texture (the entropy of its values, 16 levels over the image's range), the distance to the nearest other
// place (in model radii)
export function matchFeatures(c: Float32Array, w: number, h: number, cx: number, cy: number, R0: number, o: MatchOpts, found: Match[], poly?: Pt[], outer?: Pt[]): number[][] {
  const region = comparedRegion(o, cx, cy, poly, outer);
  const inside = region?.inside ?? null;
  const R = region?.R ?? R0;
  const g = gradients(c, w, h);
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of c) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  const span = hi - lo || 1;
  const [odx, ody] = disc(R);
  const own = template(c, w, h, null, cx, cy, odx, ody, 0, 1, inside);
  return found.map((m) => {
    const [dx, dy] = disc(R * m.scale);
    const t = template(c, w, h, g, cx, cy, dx, dy, m.angle, m.scale, inside);
    const [x, y] = [Math.floor(m.x), Math.floor(m.y)];
    const r = Math.ceil(R * m.scale);
    const near = found.reduce((d, p) => (p === m ? d : Math.min(d, Math.hypot(p.x - m.x, p.y - m.y))), Infinity);
    const turn = Math.min(m.angle, o.symmetry - m.angle) / o.symmetry;
    if (!t || x < r || y < r || x >= w - r || y >= h - r) return [m.score, 0, 0, 0, m.scale, turn, 0, Number.isFinite(near) ? near / R : 10];
    const qi = scoreAt(c, w, g, x, y, t, 'brightness', false);
    const qe = scoreAt(c, w, g, x, y, t, 'edges', false);
    let [s1, s2] = [0, 0];
    const bins = new Array<number>(16).fill(0);
    for (let k = 0; k < t.dx.length; k++) {
      const p = c[(y + t.dy[k]) * w + x + t.dx[k]];
      s1 += p;
      s2 += p * p;
      bins[Math.min(15, Math.max(0, Math.floor(((p - lo) / span) * 16)))]++;
    }
    const n = t.dx.length;
    const mean = s1 / n;
    const sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    const ref = own ?? t;
    const entropy = -bins.reduce((e, b) => (b ? e + (b / n) * Math.log2(b / n) : e), 0);
    return [qi, qe < -1 ? 0 : qe, ref.sd > 0 ? (mean - ref.m) / ref.sd : 0, ref.sd > 0 && sd > 0 ? Math.log(sd / ref.sd) : 0, m.scale, turn, entropy, Number.isFinite(near) ? near / R : 10];
  });
}

// A box found (a rectangle or a square: its centre, its turn as the selections turn, its sides) fitted to the edges
// under it: along each of its two axes the profile across it (a band of half its other side averaged), its two edges
// where it crosses half-way from inside to outside; the centre and the sides from them. limit: how far from the centre
// the edges are looked for along each axis (the margin drawn; absent: 0.8 of the side)
export function fitBox(c: Float32Array, w: number, h: number, x: number, y: number, angle: number, bw: number, bh: number, limit?: [number, number]): { x: number; y: number; w: number; h: number } {
  const t = (angle * Math.PI) / 180;
  const ax: Pt[] = [
    [Math.cos(t), Math.sin(t)],
    [-Math.sin(t), Math.cos(t)],
  ];
  const sides = [bw, bh];
  const shift: number[] = [];
  const len: number[] = [];
  for (let k = 0; k < 2; k++) {
    const [ux, uy] = ax[k];
    const [vx, vy] = ax[1 - k];
    const S = sides[k];
    const across = Math.max(1, Math.round(sides[1 - k] / 4));
    // (never closer than just past the side: the ground must be met)
    const T = limit ? Math.min(0.8 * S, Math.max(0.55 * S, limit[k])) : 0.8 * S;
    const n = Math.max(8, Math.round(2 * T * 2));
    const prof = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const tt = -T + (2 * T * i) / n;
      let sum = 0;
      for (let j = -across; j <= across; j++) sum += at(c, w, h, x + ux * tt + vx * j, y + uy * tt + vy * j);
      prof[i] = sum / (2 * across + 1);
    }
    // (the inside's level: the median of the middle half; the ground's: the farthest from it in the outer parts on
    // either side; the edge: where the profile, going out from the middle, first crosses half-way between them, to the
    // part of a sample — touching a neighbour, the profile may not get there: the bottom of the gap between them)
    const idx = (tt: number) => Math.round(((tt + T) / (2 * T)) * n);
    const mid = Array.from(prof.subarray(idx(-0.25 * S), idx(0.25 * S) + 1)).sort((a, b) => a - b);
    const inside = mid[mid.length >> 1];
    const far = (a: number, b: number) => {
      let at = a;
      for (let i = a; i <= b; i++) if (Math.abs(prof[i] - inside) > Math.abs(prof[at] - inside)) at = i;
      return at;
    };
    const outer = [far(0, idx(-0.45 * S)), far(idx(0.45 * S), n)];
    const ground = Math.abs(prof[outer[0]] - inside) > Math.abs(prof[outer[1]] - inside) ? prof[outer[0]] : prof[outer[1]];
    const half = (inside + ground) / 2;
    const sgn = Math.sign(inside - half);
    const edge = (dir: 1 | -1) => {
      const stop = outer[dir > 0 ? 1 : 0];
      for (let i = idx(0); dir > 0 ? i < stop : i > stop; i += dir) {
        const [p0, p1] = [prof[i], prof[i + dir]];
        if (sgn * (p0 - half) >= 0 && sgn * (p1 - half) < 0) return -T + (2 * T * (i + (dir * (p0 - half)) / (p0 - p1))) / n;
      }
      return -T + (2 * T * stop) / n;
    };
    const lo = edge(-1);
    const hi = edge(1);
    // (an edge not found: the side as it was)
    const ok = Number.isFinite(lo) && Number.isFinite(hi);
    len.push(ok ? hi - lo : S);
    shift.push(ok ? (hi + lo) / 2 : 0);
  }
  return { x: x + ax[0][0] * shift[0] + ax[1][0] * shift[1], y: y + ax[0][1] * shift[0] + ax[1][1] * shift[1], w: len[0], h: len[1] };
}

// a selection's points turned by a (degrees, clockwise as seen) and scaled by s about (cx, cy), then moved to (x, y)
export function placeLike(pts: Pt[], cx: number, cy: number, a: number, s: number, x: number, y: number): Pt[] {
  const t = (a * Math.PI) / 180;
  const [co, si] = [Math.cos(t), Math.sin(t)];
  return pts.map(([px, py]) => {
    const [u, v] = [(px - cx) * s, (py - cy) * s];
    return [x + u * co - v * si, y + u * si + v * co];
  });
}

// The places found that look more like a place left out by hand (in Review) than like the model, dropped: at each place
// its values compared with the model and with every place left out, both turned and sized as the place, over what the
// search compares (the disc, or the region: the margin drawn, the outline and around it); every turn that looks the same
// tried for those left out; within a pixel of the place, as two searches do not put a particle at the very same pixel.
// (cx, cy): the model's centre, R0: the radius of its disc; poly, outer: as for findLike
export function dropLikeRejected(c: Float32Array, w: number, h: number, found: Match[], rejected: { x: number; y: number; angle: number; scale: number }[], R0: number, o: MatchOpts, cx: number, cy: number, poly?: Pt[], outer?: Pt[]): Match[] {
  if (!rejected.length) return found;
  const region = comparedRegion(o, cx, cy, poly, outer);
  const R = region?.R ?? R0;
  const turns = Math.max(1, Math.round(360 / o.symmetry));
  return found.filter((m) => {
    const [ddx, ddy] = disc(R * m.scale);
    // (the offsets compared: the disc's, or those whose point of the model falls in the region)
    const rm = region ? regionModel(c, w, h, cx, cy, ddx, ddy, m.angle, m.scale, region.inside) : null;
    const [dx, dy] = rm ? [rm.dx, rm.dy] : [ddx, ddy];
    const own = rm ? rm.v : model(c, w, h, cx, cy, dx, dy, m.angle, m.scale);
    if (!own) return true;
    const r = Math.ceil(R * m.scale);
    const negs = rejected.flatMap((q) => Array.from({ length: turns }, (_, t) => model(c, w, h, q.x, q.y, dx, dy, m.angle - q.angle + t * o.symmetry, m.scale / q.scale)).filter((v): v is Float32Array => !!v));
    let [likeModel, likeOut] = [-2, -2];
    for (let y = Math.floor(m.y) - 1; y <= Math.floor(m.y) + 1; y++)
      for (let x = Math.floor(m.x) - 1; x <= Math.floor(m.x) + 1; x++) {
        if (x < r || y < r || x >= w - r || y >= h - r) continue;
        let [s1, s2] = [0, 0];
        for (let k = 0; k < dx.length; k++) {
          const p = c[(y + dy[k]) * w + x + dx[k]];
          s1 += p;
          s2 += p * p;
        }
        likeModel = Math.max(likeModel, ncc(c, w, x, y, dx, dy, own, s1, s2));
        for (const v of negs) likeOut = Math.max(likeOut, ncc(c, w, x, y, dx, dy, v, s1, s2));
      }
    return !(likeOut > likeModel);
  });
}
