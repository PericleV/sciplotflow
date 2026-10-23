// Filters of the Image analysis node over a neighbourhood: a disk (x² + y² ≤ r², as scikit-image's disk) or a square;
// the edge mirrored (scipy 'reflect') unless said. Channels one at a time: Float32Array of w × h. Pure.
import { gaussian, gaussKernel, map1, mirrorTable, reflect, separable } from './raster.ts';

// ---- neighbourhoods ----

// the half-width of every row of a disk of radius r: for dy = −R … R, the dx reached (R = ⌊r⌋)
export function diskSpans(r: number): number[] {
  const R = Math.floor(r);
  return Array.from({ length: 2 * R + 1 }, (_, k) => {
    const dy = k - R;
    return Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 1e-9);
  });
}
export type Shape = 'disk' | 'square';
const spansOf = (r: number, shape: Shape) => (shape === 'square' ? Array.from({ length: 2 * Math.floor(r) + 1 }, () => Math.floor(r)) : diskSpans(r));

// the sums of every row's mirrored values over [x − a, x + a] (prefix sums of the row with its mirrored margins)
function rowSums(c: Float32Array, w: number, h: number, a: number, sq: boolean): Float64Array {
  const out = new Float64Array(w * h);
  const pre = new Float64Array(w + 2 * a + 1);
  const mt = mirrorTable(w, a);
  for (let y = 0; y < h; y++) {
    pre[0] = 0;
    for (let i = 0; i < w + 2 * a; i++) {
      const v = c[y * w + mt[i]];
      pre[i + 1] = pre[i] + (sq ? v * v : v);
    }
    for (let x = 0; x < w; x++) out[y * w + x] = pre[x + 2 * a + 1] - pre[x];
  }
  return out;
}
// the sum (and the sum of squares) over the neighbourhood of every pixel, with the number of pixels in it
function neighbourSums(c: Float32Array, w: number, h: number, r: number, shape: Shape, sq: boolean): { s: Float64Array; n: number } {
  const spans = spansOf(r, shape);
  const R = (spans.length - 1) >> 1;
  const byA = new Map<number, Float64Array>();
  for (const a of new Set(spans)) byA.set(a, rowSums(c, w, h, a, sq));
  const s = new Float64Array(w * h);
  for (let k = 0; k < spans.length; k++) {
    const rs = byA.get(spans[k])!;
    const dy = k - R;
    for (let y = 0; y < h; y++) {
      const yy = reflect(y + dy, h) * w;
      const o = y * w;
      for (let x = 0; x < w; x++) s[o + x] += rs[yy + x];
    }
  }
  return { s, n: spans.reduce((t, a) => t + 2 * a + 1, 0) };
}
export function meanFilter(c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk'): Float32Array {
  const { s, n } = neighbourSums(c, w, h, r, shape, false);
  return map1(s, (v) => v / n);
}
// the local variance (population, as ImageJ and numpy's default); sd: its square root
export function varianceFilter(c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk', sd = false): Float32Array {
  const a = neighbourSums(c, w, h, r, shape, false);
  const b = neighbourSums(c, w, h, r, shape, true);
  const n = a.n;
  return map1(a.s, (v, i) => {
    const m = v / n;
    const q = Math.max(0, b.s[i] / n - m * m);
    return sd ? Math.sqrt(q) : q;
  });
}

// the values of the neighbourhood of (x, y), mirrored at the edge (the tables of mirrored indices, padded by R), into
// buf; their number
function gather(c: Float32Array, w: number, x: number, y: number, spans: number[], buf: Float64Array, mx: Int32Array, my: Int32Array): number {
  const R = (spans.length - 1) >> 1;
  let n = 0;
  for (let k = 0; k < spans.length; k++) {
    const yy = my[y + k] * w;
    const a = spans[k];
    for (let dx = -a; dx <= a; dx++) buf[n++] = c[yy + mx[x + dx + R]];
  }
  return n;
}
// the k-th smallest of a[0 … n) (quickselect, a reordered)
function select(a: Float64Array, n: number, k: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const p = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < p) i++;
      while (a[j] > p) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}
export function medianFilter(c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk'): Float32Array {
  const spans = spansOf(r, shape);
  const buf = new Float64Array(spans.reduce((t, a) => t + 2 * a + 1, 0));
  const out = new Float32Array(w * h);
  const R = (spans.length - 1) >> 1;
  const [mx, my] = [mirrorTable(w, R), mirrorTable(h, R)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = gather(c, w, x, y, spans, buf, mx, my);
      out[y * w + x] = select(buf, n, n >> 1);
    }
  return out;
}

// the minimum (or maximum) over the neighbourhood: every row of the shape a sliding window (a monotonic queue), then
// the rows taken together — O(pixels × rows of the shape)
export function minMaxFilter(c: Float32Array, w: number, h: number, r: number, max: boolean, shape: Shape = 'disk'): Float32Array {
  const spans = spansOf(r, shape);
  const R = (spans.length - 1) >> 1;
  const byA = new Map<number, Float32Array>();
  const sgn = max ? -1 : 1; // (a maximum: the minimum of the values turned)
  for (const a of new Set(spans)) {
    const out = new Float32Array(w * h);
    const n = w + 2 * a;
    const q = new Int32Array(n);
    const vals = new Float64Array(n);
    const mt = mirrorTable(w, a);
    for (let y = 0; y < h; y++) {
      // the row with its mirrored margins: values at i − a for i in [0, w + 2a); a sliding minimum (monotonic queue)
      let head = 0;
      let tail = 0;
      const o = y * w;
      for (let i = 0; i < n; i++) {
        const v = sgn * c[o + mt[i]];
        vals[i] = v;
        while (tail > head && v <= vals[q[tail - 1]]) tail--;
        q[tail++] = i;
        if (q[head] <= i - 2 * a - 1) head++;
        if (i >= 2 * a) out[o + i - 2 * a] = sgn * vals[q[head]];
      }
    }
    byA.set(a, out);
  }
  const out = new Float32Array(w * h).fill(max ? -Infinity : Infinity);
  const my = mirrorTable(h, R);
  for (let k = 0; k < spans.length; k++) {
    const rs = byA.get(spans[k])!;
    for (let y = 0; y < h; y++) {
      const yy = my[y + k] * w;
      const o = y * w;
      if (max)
        for (let x = 0; x < w; x++) {
          const v = rs[yy + x];
          if (v > out[o + x]) out[o + x] = v;
        }
      else
        for (let x = 0; x < w; x++) {
          const v = rs[yy + x];
          if (v < out[o + x]) out[o + x] = v;
        }
    }
  }
  return out;
}

// the entropy (bits) of the values around every pixel, in `bins` bins over [lo, hi] (8-bit data: one bin per value)
export function entropyFilter(c: Float32Array, w: number, h: number, r: number, lo: number, hi: number, bins = 256): Float32Array {
  // (along each row the neighbourhood slides: for every row of the disk one value leaves on the left and one comes in
  // on the right; S = Σ count · log2 count kept as the counts change, the entropy log2 n − S / n)
  const spans = diskSpans(r);
  const R = (spans.length - 1) >> 1;
  const n = spans.reduce((t, a) => t + 2 * a + 1, 0);
  const kb = bins / (hi - lo || 1);
  const bin = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const b = Math.floor((c[i] - lo) * kb);
    bin[i] = b < 0 ? 0 : b >= bins ? bins - 1 : b;
  }
  const xlog = new Float64Array(n + 1);
  for (let m = 1; m <= n; m++) xlog[m] = m * Math.log2(m);
  const [mx, my] = [mirrorTable(w, R + 1), mirrorTable(h, R)];
  const cnt = new Int32Array(bins);
  const out = new Float32Array(w * h);
  const logn = Math.log2(n);
  for (let y = 0; y < h; y++) {
    cnt.fill(0);
    let S = 0;
    const put = (b: number, d: number) => {
      S -= xlog[cnt[b]];
      cnt[b] += d;
      S += xlog[cnt[b]];
    };
    // the first neighbourhood of the row
    for (let k = 0; k < spans.length; k++) {
      const yy = my[y + k] * w;
      for (let dx = -spans[k]; dx <= spans[k]; dx++) put(bin[yy + mx[dx + R + 1]], 1);
    }
    out[y * w] = logn - S / n;
    for (let x = 1; x < w; x++) {
      for (let k = 0; k < spans.length; k++) {
        const yy = my[y + k] * w;
        const a = spans[k];
        put(bin[yy + mx[x - a - 1 + R + 1]], -1);
        put(bin[yy + mx[x + a + R + 1]], 1);
      }
      out[y * w + x] = logn - S / n;
    }
  }
  return out;
}

// ---- smoothing that keeps edges ----

// e^(−a) for a ≥ 0 from a table (step 1/500, read between its entries: within 5·10⁻⁷ of Math.exp), 0 past a = 30 — the
// weights of the bilateral and non-local means filters, millions of them
const EXP_STEP = 500;
const EXP_MAX = 30;
const EXP_TABLE = Float64Array.from({ length: EXP_MAX * EXP_STEP + 2 }, (_, i) => Math.exp(-i / EXP_STEP));
function expNeg(a: number): number {
  if (a >= EXP_MAX) return 0;
  const f = a * EXP_STEP;
  const i = f | 0;
  return EXP_TABLE[i] + (EXP_TABLE[i + 1] - EXP_TABLE[i]) * (f - i);
}

// Bilateral: the mean of the neighbours (a square of max(5, 2⌈3 σs⌉ + 1), as scikit-image's window) weighted by their
// distance (σs) and by how far their value is (σr)
export function bilateral(c: Float32Array, w: number, h: number, sigmaS: number, sigmaR: number): Float32Array {
  const R = Math.max(5, 2 * Math.ceil(3 * sigmaS) + 1) >> 1;
  const out = new Float32Array(w * h);
  const ws = new Float64Array((2 * R + 1) ** 2);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) ws[(dy + R) * (2 * R + 1) + dx + R] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS));
  const r2 = 2 * sigmaR * sigmaR;
  const [mx, my] = [mirrorTable(w, R), mirrorTable(h, R)];
  const D = 2 * R + 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v0 = c[y * w + x];
      let s = 0;
      let t = 0;
      for (let j = 0; j < D; j++) {
        const yy = my[y + j] * w;
        const wo = j * D;
        for (let i = 0; i < D; i++) {
          const v = c[yy + mx[x + i]];
          const d = v - v0;
          const k = ws[wo + i] * expNeg((d * d) / r2);
          s += k * v;
          t += k;
        }
      }
      out[y * w + x] = s / t;
    }
  return out;
}

// Non-local means (Buades): every pixel the mean of the pixels of a search window (2·search + 1 square) weighted by how
// alike their patches (2·patch + 1 square) are: exp(−max(d² − 2σ², 0) / h²), d² the mean squared difference of the
// patches. A patch distance for every shift from the box sums of the squared differences (fast).
export function nonLocalMeans(c: Float32Array, w: number, h: number, hParam: number, patch: number, search: number, sigma = 0): Float32Array {
  const n = w * h;
  const acc = new Float64Array(n);
  const wsum = new Float64Array(n);
  const wmax = new Float64Array(n);
  const diff = new Float32Array(n);
  const h2 = hParam * hParam || 1e-12;
  const P = 2 * patch + 1;
  const area = P * P;
  const s2 = 2 * sigma * sigma;
  const [sx, sy] = [mirrorTable(w, search), mirrorTable(h, search)];
  const [px, py] = [mirrorTable(w, patch), mirrorTable(h, patch)];
  const rowBox = new Float64Array(n);
  const colSum = new Float64Array(w);
  const pre = new Float64Array(Math.max(w, h) + P + 1);
  for (let dy = -search; dy <= search; dy++)
    for (let dx = -search; dx <= search; dx++) {
      if (dx === 0 && dy === 0) continue;
      for (let y = 0; y < h; y++) {
        const yy = sy[y + dy + search] * w;
        const o = y * w;
        for (let x = 0; x < w; x++) {
          const d = c[o + x] - c[yy + sx[x + dx + search]];
          diff[o + x] = d * d;
        }
      }
      // the box sums of the squared differences over the patch: along the rows, then the columns (running sums, the
      // edge mirrored)
      for (let y = 0; y < h; y++) {
        const o = y * w;
        pre[0] = 0;
        for (let i = 0; i < w + 2 * patch; i++) pre[i + 1] = pre[i] + diff[o + px[i]];
        for (let x = 0; x < w; x++) rowBox[o + x] = pre[x + P] - pre[x];
      }
      // (down the columns row by row: the sums of P rows kept for every column, a row in, a row out)
      colSum.fill(0);
      for (let j = 0; j < P; j++) {
        const ro = py[j] * w;
        for (let x = 0; x < w; x++) colSum[x] += rowBox[ro + x];
      }
      for (let y = 0; y < h; y++) {
        const o = y * w;
        const ys = sy[y + dy + search] * w;
        for (let x = 0; x < w; x++) {
          const d2 = colSum[x] / area - s2;
          const k = d2 > 0 ? expNeg(d2 / h2) : 1;
          const i = o + x;
          acc[i] += k * c[ys + sx[x + dx + search]];
          wsum[i] += k;
          if (k > wmax[i]) wmax[i] = k;
        }
        if (y + 1 < h) {
          const [add, sub] = [py[y + P] * w, py[y] * w];
          for (let x = 0; x < w; x++) colSum[x] += rowBox[add + x] - rowBox[sub + x];
        }
      }
    }
  // the pixel itself with the largest weight of the others (Buades)
  return map1(acc, (a, i) => {
    const k0 = wmax[i] || 1;
    return (a + k0 * c[i]) / (wsum[i] + k0);
  });
}

// Anisotropic diffusion (Perona–Malik): smoothing that stops at edges; conduction exp(−(∇/κ)²) or 1 / (1 + (∇/κ)²)
export function anisotropic(c: Float32Array, w: number, h: number, iterations: number, kappa: number, step = 0.2, option: 1 | 2 = 1): Float32Array {
  let u = c.slice();
  const g = option === 1 ? (d: number) => Math.exp(-((d / kappa) ** 2)) : (d: number) => 1 / (1 + (d / kappa) ** 2);
  for (let it = 0; it < iterations; it++) {
    const v = new Float32Array(u.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = u[i];
        const dn = u[reflect(y - 1, h) * w + x] - p;
        const ds = u[reflect(y + 1, h) * w + x] - p;
        const de = u[y * w + reflect(x + 1, w)] - p;
        const dw = u[y * w + reflect(x - 1, w)] - p;
        v[i] = p + step * (g(dn) * dn + g(ds) * ds + g(de) * de + g(dw) * dw);
      }
    u = v;
  }
  return u;
}

// Outliers (as ImageJ's Remove Outliers): a pixel brighter (darker) than the median around it by more than `t` takes
// the median
export function removeOutliers(c: Float32Array, w: number, h: number, r: number, t: number, which: 'bright' | 'dark' | 'both'): Float32Array {
  const med = medianFilter(c, w, h, r);
  return map1(c, (v, i) => {
    const d = v - med[i];
    return (which !== 'dark' && d > t) || (which !== 'bright' && -d > t) ? med[i] : v;
  });
}

// Scan lines (SEM): every row (or column) moved by its own offset — its median (or mean) minus that of the whole image
export function scanLines(c: Float32Array, w: number, h: number, along: 'rows' | 'cols', how: 'median' | 'mean'): Float32Array {
  const lines = along === 'rows' ? h : w;
  const len = along === 'rows' ? w : h;
  const at = (l: number, k: number) => (along === 'rows' ? l * w + k : k * w + l);
  const level = (vals: Float64Array) => (how === 'mean' ? vals.reduce((a, b) => a + b, 0) / vals.length : select(Float64Array.from(vals), vals.length, vals.length >> 1));
  const offs = new Float64Array(lines);
  const buf = new Float64Array(len);
  for (let l = 0; l < lines; l++) {
    for (let k = 0; k < len; k++) buf[k] = c[at(l, k)];
    offs[l] = level(buf);
  }
  const all = level(Float64Array.from(offs));
  const out = new Float32Array(c.length);
  for (let l = 0; l < lines; l++) for (let k = 0; k < len; k++) out[at(l, k)] = c[at(l, k)] - offs[l] + all;
  return out;
}

// ---- background ----

// The rolling ball (as ImageJ's Subtract Background, without its shrinking): the surface a ball of radius r touches
// rolled under the image — an opening (erosion, then dilation) by the ball. Outside the image is not reached.
// a large ball (r > 10 px) rolled as ImageJ does: under the image shrunk (each block of s × s its minimum: the ball
// stays below), a ball of r / s, the background brought back to full size between the blocks' centres — the same
// background to a few % of the range, many times faster; exact: always on every pixel
export function rollingBall(c: Float32Array, w: number, h: number, r: number, exact = false): Float32Array {
  if (!exact && r > 10) {
    const s = r <= 30 ? 2 : r <= 100 ? 4 : 8;
    const [sw, sh] = [Math.ceil(w / s), Math.ceil(h / s)];
    const small = new Float32Array(sw * sh).fill(Infinity);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = Math.floor(y / s) * sw + Math.floor(x / s);
        if (c[y * w + x] < small[k]) small[k] = c[y * w + x];
      }
    const bg = rollingBall(small, sw, sh, r / s, true);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(sh - 1, Math.max(0, (y - (s - 1) / 2) / s));
      const y0 = Math.floor(fy);
      const y1 = Math.min(sh - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(sw - 1, Math.max(0, (x - (s - 1) / 2) / s));
        const x0 = Math.floor(fx);
        const x1 = Math.min(sw - 1, x0 + 1);
        const tx = fx - x0;
        const top = bg[y0 * sw + x0] * (1 - tx) + bg[y0 * sw + x1] * tx;
        const bot = bg[y1 * sw + x0] * (1 - tx) + bg[y1 * sw + x1] * tx;
        // (never above the image: a background is under it)
        out[y * w + x] = Math.min(c[y * w + x], top * (1 - ty) + bot * ty);
      }
    }
    return out;
  }
  const R = Math.ceil(r);
  // the ball's height above its rim at every offset: r − √(r² − d²) to lift it to its top
  const off: [number, number, number][] = [];
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r) off.push([dx, dy, r - Math.sqrt(r * r - d2)]);
    }
  const ero = new Float32Array(w * h).fill(Infinity);
  for (const [dx, dy, k] of off)
    for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) {
      const o = y * w;
      const so = (y + dy) * w + dx;
      for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x++) {
        const v = c[so + x] + k;
        if (v < ero[o + x]) ero[o + x] = v;
      }
    }
  const out = new Float32Array(w * h).fill(-Infinity);
  for (const [dx, dy, k] of off)
    for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) {
      const o = y * w;
      const so = (y + dy) * w + dx;
      for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x++) {
        const v = ero[so + x] - k;
        if (v > out[o + x]) out[o + x] = v;
      }
    }
  return out;
}

// The sliding paraboloid (as ImageJ): the background a paraboloid of curvature 1 / (2 r) touches from below, slid along
// rows, columns and the two diagonals in turn (the lower envelope of parabolas; exact on each line)
export function slidingParaboloid(c: Float32Array, w: number, h: number, r: number): Float32Array {
  const k = 1 / (2 * Math.max(r, 1e-6));
  let u = c.slice();
  // one line (indices) — the largest surface y(x) ≤ f below f made of parabolas k(x − x0)²: an opening along the line
  const N = Math.max(w, h);
  const f = new Float64Array(N);
  const e = new Float64Array(N);
  const g = new Float64Array(N);
  const v = new Int32Array(N);
  const z = new Float64Array(N + 1);
  // the lower envelope of the parabolas k (x − t)² + a(t): out(x) = min_t a(t) + k (x − t)² — exact, in linear time
  const envelope = (a: Float64Array, out: Float64Array, n: number) => {
    let j = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (a[q] + k * q * q - (a[v[j]] + k * v[j] * v[j])) / (2 * k * (q - v[j]));
      while (s <= z[j]) {
        j--;
        s = (a[q] + k * q * q - (a[v[j]] + k * v[j] * v[j])) / (2 * k * (q - v[j]));
      }
      j++;
      v[j] = q;
      z[j] = s;
      z[j + 1] = Infinity;
    }
    j = 0;
    for (let q = 0; q < n; q++) {
      while (z[j + 1] < q) j++;
      out[q] = a[v[j]] + k * (q - v[j]) * (q - v[j]);
    }
  };
  // one line (its start and step): erosion e(x) = min_t f(t) + k (x − t)², dilation max_t e(t) − k (x − t)² (= −the
  // envelope of −e); the line kept under the image
  const line = (start: number, step: number, n: number) => {
    if (n < 2) return;
    for (let t = 0; t < n; t++) f[t] = u[start + t * step];
    envelope(f, e, n);
    for (let t = 0; t < n; t++) e[t] = -e[t];
    envelope(e, g, n);
    for (let t = 0; t < n; t++) {
      const i = start + t * step;
      if (-g[t] < u[i]) u[i] = -g[t];
    }
  };
  const pass = () => {
    for (let y = 0; y < h; y++) line(y * w, 1, w);
    for (let x = 0; x < w; x++) line(x, w, h);
  };
  pass();
  u = u.slice();
  pass();
  return u;
}

// ---- edges ----

// the gradient by a 3 × 3 operator (Sobel [1 2 1], Prewitt [1 1 1], Scharr [3 10 3] across, [−1 0 1] along; not
// normalised, as scipy.ndimage): its magnitude, or its X / Y part
export function gradient(c: Float32Array, w: number, h: number, op: 'sobel' | 'prewitt' | 'scharr', part: 'magnitude' | 'x' | 'y' = 'magnitude'): Float32Array {
  const s = op === 'sobel' ? [1, 2, 1] : op === 'prewitt' ? [1, 1, 1] : [3, 10, 3];
  const S = Float64Array.from(s);
  const D = Float64Array.of(-1, 0, 1);
  const gx = separable(c, w, h, D, S);
  const gy = separable(c, w, h, S, D);
  if (part === 'x') return gx;
  if (part === 'y') return gy;
  return map1(gx, (v, i) => Math.hypot(v, gy[i]));
}
// the Laplacian (4 neighbours, as scipy.ndimage.laplace)
export function laplace(c: Float32Array, w: number, h: number): Float32Array {
  const k = Float64Array.of(1, -2, 1);
  const one = Float64Array.of(1);
  const a = separable(c, w, h, k, one);
  const b = separable(c, w, h, one, k);
  return map1(a, (v, i) => v + b[i]);
}
// the Laplacian of the Gaussian of σ (scipy.ndimage.gaussian_laplace)
export function laplacianOfGaussian(c: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const g0 = gaussKernel(sigma);
  const g2 = gaussKernel(sigma, 2);
  const a = separable(c, w, h, g2, g0);
  const b = separable(c, w, h, g0, g2);
  return map1(a, (v, i) => v + b[i]);
}
// the eigenvalues of the Hessian of the Gaussian of σ (the larger, the smaller), scaled by σ² when asked
export function hessianEigen(c: Float32Array, w: number, h: number, sigma: number, which: 'larger' | 'smaller', scaled = true): Float32Array {
  const g0 = gaussKernel(sigma);
  const g1 = gaussKernel(sigma, 1);
  const g2 = gaussKernel(sigma, 2);
  const hxx = separable(c, w, h, g2, g0);
  const hyy = separable(c, w, h, g0, g2);
  const hxy = separable(c, w, h, g1, g1);
  const s = scaled ? sigma * sigma : 1;
  return map1(hxx, (a, i) => {
    const b = hyy[i];
    const m = (a + b) / 2;
    const d = Math.sqrt(((a - b) / 2) ** 2 + hxy[i] ** 2);
    return s * (which === 'larger' ? m + d : m - d);
  });
}

// Ridges at several scales (as Frangi's vesselness, in 2-D): at every σ, a pixel on a line has the Hessian's
// eigenvalue across it large (positive for a dark line, negative for a bright one) and the one along it small; the
// response exp(−Rb²/2β²)·(1 − exp(−S²/2c²)) — Rb the ratio of the two, S their norm, β = 0.5, c half the largest S —
// the largest over the scales, 0 … 1
export function frangi(c: Float32Array, w: number, h: number, sigmas: number[], dark: boolean): Float32Array {
  const out = new Float32Array(w * h);
  for (const s of sigmas) {
    const big = hessianEigen(c, w, h, s, 'larger');
    const small = hessianEigen(c, w, h, s, 'smaller');
    let smax = 0;
    for (let i = 0; i < out.length; i++) smax = Math.max(smax, Math.hypot(big[i], small[i]));
    const c2 = 2 * (0.5 * smax || 1) ** 2;
    for (let i = 0; i < out.length; i++) {
      const across = dark ? big[i] : small[i];
      const along = dark ? small[i] : big[i];
      if (dark ? across <= 0 : across >= 0) continue;
      const rb = along / across;
      const S2 = big[i] ** 2 + small[i] ** 2;
      const v = Math.exp(-(rb * rb) / 0.5) * (1 - Math.exp(-S2 / c2));
      if (v > out[i]) out[i] = v;
    }
  }
  return out;
}

// ---- texture ----

// Gabor (as scikit-image's gabor_kernel / gabor): a Gaussian envelope (σx, σy; from the bandwidth when not given)
// times a wave of `frequency` along θ; the magnitude of the real and imaginary responses
export function gaborKernel(frequency: number, theta: number, bandwidth = 1, sigmaX?: number, sigmaY?: number) {
  const sb = (1 / Math.PI) * Math.sqrt(Math.log(2) / 2) * ((2 ** bandwidth + 1) / (2 ** bandwidth - 1));
  const sx = sigmaX ?? sb / frequency;
  const sy = sigmaY ?? sb / frequency;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const x0 = Math.ceil(Math.max(Math.abs(3 * sx * ct), Math.abs(3 * sy * st), 1));
  const y0 = Math.ceil(Math.max(Math.abs(3 * sy * ct), Math.abs(3 * sx * st), 1));
  const W = 2 * x0 + 1;
  const H = 2 * y0 + 1;
  const re = new Float64Array(W * H);
  const im = new Float64Array(W * H);
  for (let yy = -y0; yy <= y0; yy++)
    for (let xx = -x0; xx <= x0; xx++) {
      const rx = xx * ct + yy * st;
      const ry = -xx * st + yy * ct;
      const g = Math.exp(-0.5 * (rx * rx / (sx * sx) + ry * ry / (sy * sy))) / (2 * Math.PI * sx * sy);
      const ph = 2 * Math.PI * frequency * rx;
      re[(yy + y0) * W + xx + x0] = g * Math.cos(ph);
      im[(yy + y0) * W + xx + x0] = g * Math.sin(ph);
    }
  return { re, im, W, H };
}
// a channel correlated with a 2D kernel (W × H, centred), the edge mirrored
export function correlate2d(c: Float32Array, w: number, h: number, k: Float64Array, W: number, H: number): Float32Array {
  const out = new Float32Array(w * h);
  const ox = W >> 1;
  const oy = H >> 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < H; j++) {
        const yy = reflect(y + j - oy, h) * w;
        for (let i = 0; i < W; i++) s += k[j * W + i] * c[yy + reflect(x + i - ox, w)];
      }
      out[y * w + x] = s;
    }
  return out;
}
// scipy.ndimage.convolve flips the kernel: the Gabor responses as scikit-image's gabor gives them (convolution). With
// σx = σy (from the bandwidth) the kernel is a product g(x) e^{iax} · g(y) e^{iby} over its box: filtered along the rows
// then the columns with complex 1D kernels — the same responses, in a small part of the time
export function gabor(c: Float32Array, w: number, h: number, frequency: number, theta: number, bandwidth = 1): Float32Array {
  const g = gaborKernel(frequency, theta, bandwidth);
  const sb = (1 / Math.PI) * Math.sqrt(Math.log(2) / 2) * ((2 ** bandwidth + 1) / (2 ** bandwidth - 1));
  const sg = sb / frequency;
  {
    const [ct, st] = [Math.cos(theta), Math.sin(theta)];
    const [x0, y0] = [g.W >> 1, g.H >> 1];
    // the 1D kernels (flipped: a convolution), the 2D one's normalisation on the first
    const one = (n0: number, cs: number, norm: number) => {
      const re = new Float64Array(2 * n0 + 1);
      const im = new Float64Array(2 * n0 + 1);
      for (let t = -n0; t <= n0; t++) {
        const gg = (Math.exp((-0.5 * t * t) / (sg * sg)) * norm);
        const ph = 2 * Math.PI * frequency * cs * t;
        // (flipped: index n0 − t)
        re[n0 - t] = gg * Math.cos(ph);
        im[n0 - t] = gg * Math.sin(ph);
      }
      return { re, im };
    };
    const kx = one(x0, ct, 1 / (2 * Math.PI * sg * sg));
    const ky = one(y0, st, 1);
    // complex separable: (a + ib) along the rows, then (c + id) along the columns
    const ar = separable(c, w, h, kx.re, Float64Array.of(1));
    const ai = separable(c, w, h, kx.im, Float64Array.of(1));
    const one1 = Float64Array.of(1);
    const rr = separable(ar, w, h, one1, ky.re);
    const ii = separable(ai, w, h, one1, ky.im);
    const ri = separable(ar, w, h, one1, ky.im);
    const ir = separable(ai, w, h, one1, ky.re);
    return map1(rr, (v, i) => Math.hypot(v - ii[i], ri[i] + ir[i]));
  }
}
// the Gabor responses by the full 2D kernel (any σx, σy): the reference of the separable one
export function gabor2d(c: Float32Array, w: number, h: number, frequency: number, theta: number, bandwidth = 1): Float32Array {
  const g = gaborKernel(frequency, theta, bandwidth);
  const flip = (k: Float64Array) => Float64Array.from(k).reverse();
  const re = correlate2d(c, w, h, flip(g.re), g.W, g.H);
  const im = correlate2d(c, w, h, flip(g.im), g.W, g.H);
  return map1(re, (v, i) => Math.hypot(v, im[i]));
}

// Local binary patterns (as scikit-image's local_binary_pattern): P points on a circle of radius R (bilinear values,
// the image's edge read as 0); 'uniform': the rotation-invariant uniform code (0 … P + 1), 'default': the raw code
export function lbp(c: Float32Array, w: number, h: number, P: number, R: number, method: 'uniform' | 'default' = 'uniform'): Float32Array {
  const rp = Array.from({ length: P }, (_, p) => -R * Math.sin((2 * Math.PI * p) / P));
  const cp = Array.from({ length: P }, (_, p) => R * Math.cos((2 * Math.PI * p) / P));
  // as scikit-image: coordinates rounded to 5 decimals
  const rr = rp.map((v) => Math.round(v * 1e5) / 1e5);
  const cc = cp.map((v) => Math.round(v * 1e5) / 1e5);
  const px = (y: number, x: number) => (y < 0 || x < 0 || y >= h || x >= w ? 0 : c[y * w + x]);
  const bil = (y: number, x: number) => {
    const y0 = Math.floor(y);
    const x0 = Math.floor(x);
    const fy = y - y0;
    const fx = x - x0;
    return (1 - fy) * ((1 - fx) * px(y0, x0) + fx * px(y0, x0 + 1)) + fy * ((1 - fx) * px(y0 + 1, x0) + fx * px(y0 + 1, x0 + 1));
  };
  const out = new Float32Array(w * h);
  const bits = new Int8Array(P);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v0 = c[y * w + x];
      for (let p = 0; p < P; p++) bits[p] = bil(y + rr[p], x + cc[p]) - v0 >= 0 ? 1 : 0;
      if (method === 'default') {
        let code = 0;
        for (let p = 0; p < P; p++) code += bits[p] << p;
        out[y * w + x] = code;
      } else {
        let changes = 0;
        for (let p = 0; p < P - 1; p++) changes += bits[p] !== bits[p + 1] ? 1 : 0;
        let ones = 0;
        for (let p = 0; p < P; p++) ones += bits[p];
        out[y * w + x] = changes <= 2 ? ones : P + 1;
      }
    }
  return out;
}

export { gaussian };
