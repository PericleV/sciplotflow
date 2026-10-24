// Lattice (Image analysis, TEM): the spots of a spectrum (each a set of lattice planes: its distance d = 1/|f| and its
// direction; between two, the angle of their planes), the period of fringes along a line (the strongest frequency of
// its profile), and a diffraction pattern's rings (SAED): its centre (where the pattern is symmetric), its radial
// profile, the rings in it (their radii; d = 1 / (radius × the reciprocal size of a pixel)), each matched with the
// reflections of known phases (fcc metals, silicon) or of a list of d given. Pure.
import { fft1, fft2, nextPow2 } from './fft2d.ts';

export type LatticeSpec = {
  spots?: [number, number][]; // fx, fy (cycles per pixel of the original)
  fringes?: boolean; // the period of the fringes along every line selection
  saed?: boolean; // the image is a diffraction pattern: its rings
  recip?: number; // the size of a pixel in reciprocal units (1/unit of the calibration); absent: in px only
  centre?: [number, number]; // the pattern's centre, set by hand (absent: found)
  phases?: string[]; // the phases matched (their names in PHASES)
  own?: string; // d values of one's own (in the calibration's unit), comma separated
};

// ---- spots ----
export type Spot = { fx: number; fy: number; d: number; angle: number };
// a spot: its distance (px) and the direction of its planes' normal (0–180°, counter-clockwise from x)
export const spotOf = (fx: number, fy: number): Spot => ({ fx, fy, d: 1 / Math.hypot(fx, fy), angle: ((Math.atan2(-fy, fx) * 180) / Math.PI + 180) % 180 });
// the angle between the planes of two spots (0–90°)
export function planeAngle(a: Spot, b: Spot): number {
  const t = Math.abs(a.angle - b.angle) % 180;
  return Math.min(t, 180 - t);
}
// A spot clicked on a spectrum shown (gray values of N × N, the zero frequency in the middle): moved to the brightest
// place within r px, then to the centre of its brightness above the local level (its sub-pixel centre); fx, fy
export function refineSpot(gray: ArrayLike<number>, N: number, u: number, v: number, r = 4): [number, number] {
  const half = N >> 1;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? gray[y * N + x] : 0);
  let [bx, by, bv] = [Math.round(u + half), Math.round(v + half), -Infinity];
  for (let y = Math.round(v + half) - r; y <= Math.round(v + half) + r; y++)
    for (let x = Math.round(u + half) - r; x <= Math.round(u + half) + r; x++)
      if (at(x, y) > bv && Math.hypot(x - half, y - half) > 1.5) [bx, by, bv] = [x, y, at(x, y)];
  const ring: number[] = [];
  for (let y = by - 3; y <= by + 3; y++) for (let x = bx - 3; x <= bx + 3; x++) if (Math.max(Math.abs(x - bx), Math.abs(y - by)) === 3) ring.push(at(x, y));
  const floor = ring.length ? ring.reduce((a, b) => a + b, 0) / ring.length : 0;
  let [sx, sy, sw] = [0, 0, 0];
  for (let y = by - 2; y <= by + 2; y++)
    for (let x = bx - 2; x <= bx + 2; x++) {
      const wgt = Math.max(0, at(x, y) - floor);
      [sx, sy, sw] = [sx + wgt * x, sy + wgt * y, sw + wgt];
    }
  const [cx, cy] = sw > 0 ? [sx / sw, sy / sw] : [bx, by];
  return [(cx - half) / N, (cy - half) / N];
}

// ---- fringes ----
// The period of a profile sampled every `step` (its strongest frequency past the slowest ones — of two about as strong,
// the finer —: a Hann window, zeros padded, the peak between the bins by a parabola); NaN: too short
export function profilePeriod(v: ArrayLike<number>, step = 1): number {
  const n = v.length;
  if (n < 8) return NaN;
  const N = nextPow2(n) * 4;
  const mean = Array.from(v).reduce((a, b) => a + b, 0) / n;
  const re = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = (v[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
  const im = new Float64Array(N);
  fft1(re, im, false);
  const R = re;
  const I = im;
  const p = Array.from({ length: N / 2 }, (_, k) => R[k] * R[k] + I[k] * I[k]);
  // (past the slowest: at least two periods in the profile)
  const from = Math.max(1, Math.ceil((2 * N) / n));
  let top = from;
  for (let k = from; k < N / 2 - 1; k++) if (p[k] > p[top]) top = k;
  // (two sets of planes crossing the line: the finest of the strong peaks, at least half the strongest)
  let best = top;
  for (let k = top + 1; k < N / 2 - 1; k++) if (p[k] >= 0.5 * p[top] && p[k] >= p[k - 1] && p[k] >= p[k + 1]) best = k;
  const [a, b, c] = [p[best - 1] ?? 0, p[best], p[best + 1] ?? 0];
  const off = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  return (N / (best + off)) * step;
}
// ---- diffraction rings ----
// The centre of a diffraction pattern: where it is most symmetric (a point reflection: the image correlated with itself
// turned by 180°, its peak at twice the centre), on the image shrunk to at most 256 px; then where the rings are
// sharpest (the radial profile's spread largest) a few pixels around it
export function patternCentre(c: Float32Array, w: number, h: number): [number, number] {
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 256));
  const [sw, sh] = [Math.ceil(w / f), Math.ceil(h / f)];
  const small = new Float64Array(sw * sh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) small[Math.floor(y / f) * sw + Math.floor(x / f)] += c[y * w + x];
  let mean = 0;
  for (const v of small) mean += v;
  mean /= small.length;
  const N = nextPow2(2 * Math.max(sw, sh));
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) re[y * N + x] = small[y * sw + x] - mean;
  fft2(re, im, N);
  // (the convolution of the image with itself: F², back; its peak at 2·centre)
  for (let k = 0; k < N * N; k++) {
    const [a, b] = [re[k], im[k]];
    re[k] = a * a - b * b;
    im[k] = 2 * a * b;
  }
  fft2(re, im, N, true);
  let [best, at] = [-Infinity, 0];
  for (let k = 0; k < N * N; k++) if (re[k] > best) [best, at] = [re[k], k];
  let [cx, cy] = [((at % N) / 2 + 0.5) * f, (Math.floor(at / N) / 2 + 0.5) * f];
  // (refined: the sharpest radial profile)
  const sharp = (x: number, y: number) => {
    const p = radialProfile(c, w, h, x, y).mean;
    const m = p.reduce((a, b) => a + b, 0) / (p.length || 1);
    return p.reduce((a, b) => a + (b - m) ** 2, 0);
  };
  let bv = sharp(cx, cy);
  for (let step = Math.max(1, f); step >= 0.5; step /= 2)
    for (let moved = true; moved; ) {
      moved = false;
      for (const [dx, dy] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const v = sharp(cx + dx, cy + dy);
        if (v > bv) [bv, cx, cy, moved] = [v, cx + dx, cy + dy, true];
      }
    }
  return [cx, cy];
}
// The mean of the image in rings of 1 px around (cx, cy), out to the nearest edge
export function radialProfile(c: Float32Array, w: number, h: number, cx: number, cy: number): { r: number[]; mean: number[] } {
  const R = Math.floor(Math.min(cx, cy, w - cx, h - cy));
  const sum = new Float64Array(Math.max(1, R));
  const cnt = new Float64Array(Math.max(1, R));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = Math.floor(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
      if (k >= R) continue;
      sum[k] += c[y * w + x];
      cnt[k]++;
    }
  return { r: Array.from({ length: R }, (_, k) => k + 0.5), mean: Array.from(sum, (s, k) => (cnt[k] ? s / cnt[k] : NaN)) };
}
// The rings of a radial profile: its peaks over the background (the profile's lower envelope over ±w px), stronger
// than `prominence` of the strongest; their radii between the samples (a parabola), from the innermost
export function ringsOf(p: { r: number[]; mean: number[] }, prominence = 0.08, skip = 4): number[] {
  const v = p.mean.map((x) => (Number.isFinite(x) ? x : 0));
  const n = v.length;
  const win = Math.max(4, Math.round(n / 25));
  const bg = v.map((_, i) => Math.min(...v.slice(Math.max(0, i - win), i + win + 1)));
  const top = v.map((x, i) => x - bg[i]);
  const most = Math.max(...top.slice(skip));
  const out: number[] = [];
  for (let i = Math.max(1, skip); i < n - 1; i++)
    if (top[i] > prominence * most && top[i] >= top[i - 1] && top[i] > top[i + 1]) {
      const [a, b, c] = [top[i - 1], top[i], top[i + 1]];
      const off = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
      out.push(p.r[i] + off);
    }
  return out;
}

// ---- phases ----
// the lattice constants (nm) of some cubic phases; fcc: (hkl) all odd or all even; diamond: and h + k + l = 4n when even
export const PHASES: Record<string, { a: number; kind: 'fcc' | 'diamond' }> = {
  Au: { a: 0.40782, kind: 'fcc' },
  Ag: { a: 0.40853, kind: 'fcc' },
  Cu: { a: 0.36149, kind: 'fcc' },
  Pt: { a: 0.39242, kind: 'fcc' },
  Pd: { a: 0.38907, kind: 'fcc' },
  Al: { a: 0.40495, kind: 'fcc' },
  Ni: { a: 0.3524, kind: 'fcc' },
  Si: { a: 0.5431, kind: 'diamond' },
};
// a phase's reflections (d in nm, the largest first), as many as asked
export function reflections(name: string, count = 10): { hkl: string; d: number }[] {
  const ph = PHASES[name];
  if (!ph) return [];
  const out = new Map<number, string>();
  for (let h = 0; h <= 7; h++)
    for (let k = 0; k <= h; k++)
      for (let l = 0; l <= k; l++) {
        const s = h * h + k * k + l * l;
        if (!s || out.has(s)) continue;
        const odd = h % 2 && k % 2 && l % 2;
        const even = !(h % 2) && !(k % 2) && !(l % 2);
        if (!(odd || even)) continue;
        if (ph.kind === 'diamond' && even && (h + k + l) % 4 !== 0) continue;
        out.set(s, `${h}${k}${l}`);
      }
  return [...out.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, count)
    .map(([s, hkl]) => ({ hkl, d: ph.a / Math.sqrt(s) }));
}
// Every ring (its d, in nm) the nearest reflection of the phases (and of the d given, named “own”): which, its d, the
// difference in %
export function matchRings(ds: number[], phases: string[], own: number[]): { phase: string; hkl: string; dRef: number; err: number }[] {
  const refs = [...phases.flatMap((p) => reflections(p).map((r) => ({ phase: p, ...r }))), ...own.map((d) => ({ phase: 'own', hkl: '', d }))];
  return ds.map((d) => {
    let best = { phase: '', hkl: '', dRef: NaN, err: Infinity };
    for (const r of refs) {
      const err = (100 * (d - r.d)) / r.d;
      if (Math.abs(err) < Math.abs(best.err)) best = { phase: r.phase, hkl: r.hkl, dRef: r.d, err };
    }
    return best.phase ? best : { phase: '', hkl: '', dRef: NaN, err: NaN };
  });
}
