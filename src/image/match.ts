// Find like this (Image analysis; template matching): the particles that look like the one picked, wherever they are,
// turned any way and a little larger or smaller, touching others or not. The model: the image in a disc around the
// selection picked (its corners and a little of what surrounds it: that is what tells its turn); compared with every
// place by the normalized cross-correlation (1: the same up to brightness and contrast), turned and scaled; first on the
// image shrunk (the model about 12 px across), then the best places refined at full size; places closer than most of a
// particle to a better one dropped. Pure.
import type { Pt } from './roi.ts';

// symmetry: the turns that look the same (a square: 90°, a rectangle: 180°, none: 360°); step: between the turns tried
// (degrees); sizes: ± that part (0.1: 10 %); min: the least similarity kept (0–1); max: the most found
export type MatchOpts = { symmetry: 90 | 180 | 360; step: number; sizes: number; min: number; max: number };
export const MATCH_DEFAULTS: MatchOpts = { symmetry: 90, step: 5, sizes: 0.1, min: 0.5, max: 2000 };
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
// the similarity of the model (zero mean, unit norm) with the image at a place: the correlation with the image's
// values there (their own mean and spread: from their sums s1, s2)
function ncc(c: Float32Array, w: number, x: number, y: number, dx: Int32Array, dy: Int32Array, v: Float32Array, s1: number, s2: number): number {
  let s = 0;
  const n = dx.length;
  const o = y * w + x;
  for (let k = 0; k < n; k++) s += c[o + dy[k] * w + dx[k]] * v[k];
  const varr = s2 - (s1 * s1) / n;
  return varr > 1e-9 ? s / Math.sqrt(varr) : 0;
}

// The places like the model: c (w × h) the image; (cx, cy) the model's centre and R the radius of the disc it is taken
// in (pixels of the image); the places of the centres, the turn (0 … symmetry), the size against the model's, the
// similarity; the best first
export function findLike(c: Float32Array, w: number, h: number, cx: number, cy: number, R: number, o: MatchOpts): Match[] {
  // (shrunk so the model's disc is about 5 px in radius)
  const f = Math.max(1, Math.round(R / 5));
  const sm = shrink(c, w, h, f);
  const Rs = R / f;
  const step = Math.max(1, o.step);
  const angles: number[] = [];
  for (let a = 0; a < o.symmetry - 1e-9; a += step) angles.push(a);
  const scales = o.sizes > 0 ? [1 - o.sizes, 1, 1 + o.sizes] : [1];
  // (on the image shrunk: every place, its best turn and size)
  const best = new Float32Array(sm.w * sm.h).fill(-1);
  const bestA = new Float32Array(sm.w * sm.h);
  const bestS = new Float32Array(sm.w * sm.h);
  for (const s of scales) {
    const [dx, dy] = disc(Rs * s);
    const r = Math.ceil(Rs * s);
    const st = discStats(sm.c, sm.w, sm.h, dx, dy, r);
    const models = angles.map((a) => model(sm.c, sm.w, sm.h, cx / f, cy / f, dx, dy, a, s));
    for (let y = r; y < sm.h - r; y++)
      for (let x = r; x < sm.w - r; x++) {
        const i = y * sm.w + x;
        for (let k = 0; k < angles.length; k++) {
          const v = models[k];
          if (!v) continue;
          const q = ncc(sm.c, sm.w, x, y, dx, dy, v, st.s1[i], st.s2[i]);
          if (q > best[i]) [best[i], bestA[i], bestS[i]] = [q, angles[k], s];
        }
      }
  }
  // (the local maxima near the least similarity or above, the best first)
  const cand: number[] = [];
  for (let y = 1; y < sm.h - 1; y++)
    for (let x = 1; x < sm.w - 1; x++) {
      const i = y * sm.w + x;
      const b = best[i];
      if (b < o.min * 0.8) continue;
      if (b >= best[i - 1] && b >= best[i + 1] && b >= best[i - sm.w] && b >= best[i + sm.w]) cand.push(i);
    }
  cand.sort((a, b) => best[b] - best[a]);
  // (refined at full size: the place within the shrinking, the turn within a step either side at 1°, the size within
  // half its step; one in a particle's reach — two centres are at least about a side apart)
  const out: Match[] = [];
  const reach = 0.75 * R;
  const ds = o.sizes > 0 ? o.sizes / 2 : 0;
  const discs = new Map<string, [Int32Array, Int32Array]>();
  const discOf = (s: number) => {
    const key = s.toFixed(4);
    if (!discs.has(key)) discs.set(key, disc(R * s) as [Int32Array, Int32Array]);
    return discs.get(key)!;
  };
  for (const i of cand) {
    if (out.length >= o.max) break;
    const [x0, y0] = [((i % sm.w) + 0.5) * f, (Math.floor(i / sm.w) + 0.5) * f];
    if (out.some((m) => Math.hypot(m.x - x0, m.y - y0) < reach)) continue;
    let m: Match = { x: x0, y: y0, angle: bestA[i], scale: bestS[i], score: -1 };
    for (const s of ds ? [bestS[i] - ds, bestS[i], bestS[i] + ds] : [bestS[i]]) {
      const [dx, dy] = discOf(s);
      const r = Math.ceil(R * s);
      const n = dx.length;
      const turns: { a: number; v: Float32Array }[] = [];
      for (let a = bestA[i] - step; a <= bestA[i] + step + 1e-9; a += 1) {
        const v = model(c, w, h, cx, cy, dx, dy, a, s);
        if (v) turns.push({ a, v });
      }
      for (let y = Math.floor(y0 - f); y <= Math.ceil(y0 + f); y++)
        for (let x = Math.floor(x0 - f); x <= Math.ceil(x0 + f); x++) {
          if (x < r || y < r || x >= w - r || y >= h - r) continue;
          let s1 = 0;
          let s2 = 0;
          for (let k = 0; k < n; k++) {
            const p = c[(y + dy[k]) * w + x + dx[k]];
            s1 += p;
            s2 += p * p;
          }
          for (const { a, v } of turns) {
            const q = ncc(c, w, x, y, dx, dy, v, s1, s2);
            if (q > m.score) m = { x: x + 0.5, y: y + 0.5, angle: a, scale: s, score: q };
          }
        }
    }
    if (m.score < o.min || out.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < reach)) continue;
    // (the turn within 0 … symmetry)
    m.angle = ((m.angle % o.symmetry) + o.symmetry) % o.symmetry;
    out.push(m);
  }
  return out;
}

// A box found (a rectangle or a square: its centre, its turn as the selections turn, its sides) fitted to the edges
// under it: along each of its two axes the profile across it (a band of half its other side averaged), its two edges
// where it crosses half-way from inside to outside; the centre and the sides from them
export function fitBox(c: Float32Array, w: number, h: number, x: number, y: number, angle: number, bw: number, bh: number): { x: number; y: number; w: number; h: number } {
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
    const T = 0.8 * S;
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
