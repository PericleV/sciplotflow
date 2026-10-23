// Seeds and rays (Image analysis): touching particles found one by one, without a mask to cut — the classical idea
// behind StarDist, with no network. The seeds: the centres of the particles — the peaks of the distance map of a mask
// when the steps give one, else the bright (or dark) blobs of the image at the particles' size; from every seed, 32
// rays, each stopped at the first edge (where the image crosses half-way from the seed's level down to the lowest one
// further out, or the bottom of a narrow dip between two particles touching): the ends of the rays are the particle's outline, so two
// touching particles cannot run into each other. Pure.
import { gaussian, type Raster } from './raster.ts';
import { distanceMap } from './morph.ts';
import type { Pt } from './roi.ts';

export type RaysOpts = { size: number; light: boolean; rays: number; minContrast: number };
export const RAYS_DEFAULTS: RaysOpts = { size: 0, light: true, rays: 32, minContrast: 0.1 };

// a value between the pixels' centres (bilinear), the edge held
function at(c: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x - 0.5));
  const fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
  const [x1, y1] = [Math.min(w - 1, x0 + 1), Math.min(h - 1, y0 + 1)];
  const [tx, ty] = [fx - x0, fy - y0];
  return (c[y0 * w + x0] * (1 - tx) + c[y0 * w + x1] * tx) * (1 - ty) + (c[y1 * w + x0] * (1 - tx) + c[y1 * w + x1] * tx) * ty;
}

// the peaks of v (strictly the largest within r around them), above `least`, the largest first
function peaks(v: Float32Array, w: number, h: number, r: number, least: number): Pt[] {
  const out: { x: number; y: number; v: number }[] = [];
  const R = Math.max(1, Math.round(r));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = v[y * w + x];
      if (!(c > least)) continue;
      let top = true;
      for (let dy = -R; dy <= R && top; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if ((!dx && !dy) || dx * dx + dy * dy > R * R) continue;
          const [u, q] = [x + dx, y + dy];
          if (u < 0 || q < 0 || u >= w || q >= h) continue;
          const o = v[q * w + u];
          // (a plateau: the first of its pixels in reading order)
          if (o > c || (o === c && (dy < 0 || (dy === 0 && dx < 0)))) {
            top = false;
            break;
          }
        }
      if (top) out.push({ x: x + 0.5, y: y + 0.5, v: c });
    }
  out.sort((a, b) => b.v - a.v);
  return out.map((p) => [p.x, p.y]);
}

// The seeds: the distance map's peaks of the mask (at least a quarter of the size from the background), or the blobs
// of the image (a Gaussian at the particles' size minus a wider one: the difference's peaks), and the size used
export function seeds(img: Float32Array, w: number, h: number, mask: Float32Array | null, o: RaysOpts): { pts: Pt[]; size: number } {
  if (mask) {
    const d = distanceMap(mask, w, h);
    // (the size: twice the typical largest distance of a particle, unless given)
    let size = o.size;
    if (!(size > 0)) {
      const p = peaks(d, w, h, 2, 1);
      const vals = p.map(([x, y]) => d[Math.floor(y) * w + Math.floor(x)]).sort((a, b) => a - b);
      size = 2 * (vals[vals.length >> 1] ?? 5);
    }
    return { pts: peaks(d, w, h, size / 2.5, size / 8), size };
  }
  const size = o.size > 0 ? o.size : 20;
  const s1 = gaussian(img, w, h, size / 6);
  const s2 = gaussian(img, w, h, size / 2);
  const sign = o.light ? 1 : -1;
  const dog = Float32Array.from(s1, (v, i) => sign * (v - s2[i]));
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of img) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  return { pts: peaks(dog, w, h, size / 2.5, o.minContrast * (hi - lo || 1) * 0.25), size };
}

// One particle from its seed: the end of every ray (the first crossing half-way from the seed's level to the lowest
// one beyond it), the radii smoothed (a lone long or short ray is a spike or a notch); null: no edge on most rays (an
// edge: a fall of more than least)
export function rayOutline(img: Float32Array, w: number, h: number, [sx, sy]: Pt, size: number, o: RaysOpts, least = 0): Pt[] | null {
  const n = Math.max(8, Math.round(o.rays));
  const R = size;
  const step = 0.5;
  const sign = o.light ? 1 : -1;
  const radii: number[] = [];
  let found = 0;
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    const [ux, uy] = [Math.cos(t), Math.sin(t)];
    const prof: number[] = [];
    for (let r = 0; r <= R; r += step) prof.push(sign * at(img, w, h, sx + ux * r, sy + uy * r));
    const near = prof.slice(0, Math.max(2, Math.round((0.15 * size) / step))).sort((a, b) => a - b);
    const top = near[near.length >> 1];
    const low = Math.min(...prof.slice(Math.round((0.2 * size) / step)));
    const half = (top + low) / 2;
    let end = -1;
    // (where it crosses v going down from sample i - 1 to i, between the two)
    const cross = (i: number, v: number) => (i - 1 + (prof[i - 1] - v) / (prof[i - 1] - prof[i] || 1)) * step;
    const depth = top - low;
    for (let i = Math.round((0.15 * size) / step); i < prof.length; i++) {
      if (prof[i] < half) {
        end = cross(i, half);
        break;
      }
      // (a narrow gap to a particle touching it: a dip of more than a quarter of the depth that rises again by more than
      // a sixth of it before falling half-way; the edge at its bottom, between the two)
      if (i + 1 < prof.length && prof[i] <= prof[i - 1] && prof[i] < prof[i + 1] && top - prof[i] > 0.25 * depth) {
        let up = prof[i];
        for (let j = i + 1; j < prof.length && prof[j] >= half; j++) up = Math.max(up, prof[j]);
        if (up - prof[i] > depth / 6) {
          // (its bottom between the samples: the parabola through the three)
          const [a, b, c] = [prof[i - 1], prof[i], prof[i + 1]];
          end = (i + (a - c) / (2 * (a - 2 * b + c) || 1)) * step;
          break;
        }
      }
    }
    if (end > 0 && top - low > least) found++;
    radii.push(end > 0 ? end : R * 0.5);
  }
  if (found < n * 0.6) return null;
  // (every radius the median of it and its neighbours: one on each side for 32 rays, as many more as the rays are more)
  const m = Math.max(1, Math.round(n / 32));
  const sm = radii.map((_, k) => Array.from({ length: 2 * m + 1 }, (_, j) => radii[(k + j - m + n) % n]).sort((a, b) => a - b)[m]);
  return sm.map((r, k): Pt => [sx + r * Math.cos((2 * Math.PI * k) / n), sy + r * Math.sin((2 * Math.PI * k) / n)]);
}

const inside = (poly: Pt[], [x, y]: Pt) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// Every particle: a seed each, its outline by rays; two seeds of one particle (their outlines mostly the same): one kept
export function seedsAndRays(img: Raster, mask: Raster | null, o: RaysOpts): { outlines: Pt[][]; size: number } {
  const g = img.ch[0];
  const { pts, size } = seeds(g, img.w, img.h, mask && mask.w === img.w && mask.h === img.h ? mask.ch[0] : null, o);
  const sm = gaussian(g, img.w, img.h, Math.max(0.5, size / 16));
  const out: { pts: Pt[]; c: Pt; r: number }[] = [];
  for (const s of pts) {
    // (a seed inside a particle already outlined: the same particle)
    if (out.some((q) => Math.hypot(q.c[0] - s[0], q.c[1] - s[1]) < 0.5 * q.r || inside(q.pts, s))) continue;
    const p = rayOutline(sm, img.w, img.h, s, size, o);
    if (!p) continue;
    const r = p.reduce((a, [x, y]) => a + Math.hypot(x - s[0], y - s[1]), 0) / p.length;
    out.push({ pts: p, c: s, r });
  }
  return { outlines: out.map((q) => q.pts), size };
}

// The Rays tool: one particle from a click inside it, its size not given: the rays as long as two and a half times the
// outline's mean radius, found again until it stays (from 8 px, longer while most rays find no edge); bright or dark: as
// given, else as the pixel clicked against the middle value around it. The outline in pixels of img; null: no edge
export function clickOutline(img: Float32Array, w: number, h: number, [sx, sy]: Pt, light?: boolean): Pt[] | null {
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of img) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  const least = 0.08 * (hi - lo || 1);
  if (light === undefined) {
    const R = 48;
    const around: number[] = [];
    for (let y = Math.max(0, Math.floor(sy - R)); y < Math.min(h, sy + R); y += 2)
      for (let x = Math.max(0, Math.floor(sx - R)); x < Math.min(w, sx + R); x += 2) around.push(img[y * w + x]);
    around.sort((a, b) => a - b);
    light = at(img, w, h, sx, sy) >= (around[around.length >> 1] ?? 0);
  }
  const o: RaysOpts = { ...RAYS_DEFAULTS, light, rays: 64 };
  const most = Math.max(w, h);
  let size = 8;
  let best: Pt[] | null = null;
  for (let round = 0; round < 12 && size <= most; round++) {
    // (the part of the image the rays reach, smoothed at a sixteenth of their length)
    const m = Math.ceil(size + 4);
    const [x0, y0] = [Math.max(0, Math.floor(sx) - m), Math.max(0, Math.floor(sy) - m)];
    const [x1, y1] = [Math.min(w, Math.floor(sx) + m + 1), Math.min(h, Math.floor(sy) + m + 1)];
    const [cw, ch] = [x1 - x0, y1 - y0];
    const part = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) part.set(img.subarray((y + y0) * w + x0, (y + y0) * w + x1), y * cw);
    const sm = gaussian(part, cw, ch, Math.max(0.5, size / 32));
    const p = rayOutline(sm, cw, ch, [sx - x0, sy - y0], size, o, least);
    if (!p) {
      if (best) break;
      size *= 1.6;
      continue;
    }
    best = p.map(([x, y]): Pt => [x + x0, y + y0]);
    const r = p.reduce((a, [x, y]) => a + Math.hypot(x - (sx - x0), y - (sy - y0)), 0) / p.length;
    const next = Math.max(8, 2.5 * r);
    if (Math.abs(next - size) < 0.15 * size) break;
    size = next;
  }
  return best;
}
