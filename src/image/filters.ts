// Filters of the Image analysis node over a neighbourhood: a disk (x² + y² ≤ r², as scikit-image's disk) or a square;
// the edge mirrored (scipy 'reflect') unless said. Channels one at a time: Float32Array of w × h. Pure.
import { gaussKernel, gaussian, reflect, separable } from './raster.ts';

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
  for (let y = 0; y < h; y++) {
    pre[0] = 0;
    for (let i = 0; i < w + 2 * a; i++) {
      const v = c[y * w + reflect(i - a, w)];
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
  return Float32Array.from(s, (v) => v / n);
}
// the local variance (population, as ImageJ and numpy's default); sd: its square root
export function varianceFilter(c: Float32Array, w: number, h: number, r: number, shape: Shape = 'disk', sd = false): Float32Array {
  const a = neighbourSums(c, w, h, r, shape, false);
  const b = neighbourSums(c, w, h, r, shape, true);
  const n = a.n;
  return Float32Array.from(a.s, (v, i) => {
    const m = v / n;
    const q = Math.max(0, b.s[i] / n - m * m);
    return sd ? Math.sqrt(q) : q;
  });
}

// the values of the neighbourhood of (x, y), mirrored at the edge, into buf; their number
function gather(c: Float32Array, w: number, h: number, x: number, y: number, spans: number[], buf: Float64Array): number {
  const R = (spans.length - 1) >> 1;
  let n = 0;
  for (let k = 0; k < spans.length; k++) {
    const yy = reflect(y + k - R, h) * w;
    const a = spans[k];
    for (let dx = -a; dx <= a; dx++) buf[n++] = c[yy + reflect(x + dx, w)];
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
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = gather(c, w, h, x, y, spans, buf);
      out[y * w + x] = select(buf, n, n >> 1);
    }
  return out;
}

// the minimum (or maximum) over the neighbourhood: every row of the shape a sliding window (a monotonic queue), then
// the rows taken together — O(pixels × rows of the shape)
export function minMaxFilter(c: Float32Array, w: number, h: number, r: number, max: boolean, shape: Shape = 'disk'): Float32Array {
  const spans = spansOf(r, shape);
  const R = (spans.length - 1) >> 1;
  const better = max ? (a: number, b: number) => a >= b : (a: number, b: number) => a <= b;
  const byA = new Map<number, Float32Array>();
  const q = new Int32Array(w + 2 * w + 2);
  const row = new Float64Array(w);
  for (const a of new Set(spans)) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      // the row with its mirrored margins: values at i − a for i in [0, w + 2a)
      const at = (i: number) => c[y * w + reflect(i - a, w)];
      let head = 0;
      let tail = 0;
      const vals: number[] = [];
      for (let i = 0; i < w + 2 * a; i++) {
        const v = at(i);
        vals[i] = v;
        while (tail > head && better(v, vals[q[tail - 1]])) tail--;
        q[tail++] = i;
        if (q[head] <= i - 2 * a - 1) head++;
        if (i >= 2 * a) row[i - 2 * a] = vals[q[head]];
      }
      for (let x = 0; x < w; x++) out[y * w + x] = row[x];
    }
    byA.set(a, out);
  }
  const out = new Float32Array(w * h).fill(max ? -Infinity : Infinity);
  for (let k = 0; k < spans.length; k++) {
    const rs = byA.get(spans[k])!;
    const dy = k - R;
    for (let y = 0; y < h; y++) {
      const yy = reflect(y + dy, h) * w;
      const o = y * w;
      for (let x = 0; x < w; x++) {
        const v = rs[yy + x];
        if (max ? v > out[o + x] : v < out[o + x]) out[o + x] = v;
      }
    }
  }
  return out;
}

// the entropy (bits) of the values around every pixel, in `bins` bins over [lo, hi] (8-bit data: one bin per value)
export function entropyFilter(c: Float32Array, w: number, h: number, r: number, lo: number, hi: number, bins = 256): Float32Array {
  const spans = diskSpans(r);
  const buf = new Float64Array(spans.reduce((t, a) => t + 2 * a + 1, 0));
  const cnt = new Float64Array(bins);
  const k = bins / (hi - lo || 1);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = gather(c, w, h, x, y, spans, buf);
      cnt.fill(0);
      for (let i = 0; i < n; i++) {
        const b = Math.floor((buf[i] - lo) * k);
        cnt[b < 0 ? 0 : b >= bins ? bins - 1 : b]++;
      }
      let e = 0;
      for (const v of cnt) if (v) e -= (v / n) * Math.log2(v / n);
      out[y * w + x] = e;
    }
  return out;
}

// ---- smoothing that keeps edges ----

// Bilateral: the mean of the neighbours (a square of max(5, 2⌈3 σs⌉ + 1), as scikit-image's window) weighted by their
// distance (σs) and by how far their value is (σr)
export function bilateral(c: Float32Array, w: number, h: number, sigmaS: number, sigmaR: number): Float32Array {
  const R = Math.max(5, 2 * Math.ceil(3 * sigmaS) + 1) >> 1;
  const out = new Float32Array(w * h);
  const ws = new Float64Array((2 * R + 1) ** 2);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) ws[(dy + R) * (2 * R + 1) + dx + R] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS));
  const r2 = 2 * sigmaR * sigmaR;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v0 = c[y * w + x];
      let s = 0;
      let t = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = reflect(y + dy, h) * w;
        for (let dx = -R; dx <= R; dx++) {
          const v = c[yy + reflect(x + dx, w)];
          const d = v - v0;
          const k = ws[(dy + R) * (2 * R + 1) + dx + R] * Math.exp(-(d * d) / r2);
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
  const area = (2 * patch + 1) ** 2;
  for (let dy = -search; dy <= search; dy++)
    for (let dx = -search; dx <= search; dx++) {
      if (dx === 0 && dy === 0) continue;
      for (let y = 0; y < h; y++) {
        const yy = reflect(y + dy, h) * w;
        for (let x = 0; x < w; x++) {
          const d = c[y * w + x] - c[yy + reflect(x + dx, w)];
          diff[y * w + x] = d * d;
        }
      }
      const box = separable(diff, w, h, new Float64Array(2 * patch + 1).fill(1), new Float64Array(2 * patch + 1).fill(1));
      for (let y = 0; y < h; y++) {
        const yy = reflect(y + dy, h) * w;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const d2 = box[i] / area;
          const k = Math.exp(-Math.max(d2 - 2 * sigma * sigma, 0) / h2);
          acc[i] += k * c[yy + reflect(x + dx, w)];
          wsum[i] += k;
          if (k > wmax[i]) wmax[i] = k;
        }
      }
    }
  // the pixel itself with the largest weight of the others (Buades)
  return Float32Array.from(acc, (a, i) => {
    const k0 = wmax[i] || 1;
    return (a + k0 * c[i]) / (wsum[i] + k0);
  });
}

// Anisotropic diffusion (Perona–Malik): smoothing that stops at edges; conduction exp(−(∇/κ)²) or 1 / (1 + (∇/κ)²)
export function anisotropic(c: Float32Array, w: number, h: number, iterations: number, kappa: number, step = 0.2, option: 1 | 2 = 1): Float32Array {
  let u = Float32Array.from(c);
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
  return Float32Array.from(c, (v, i) => {
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
export function rollingBall(c: Float32Array, w: number, h: number, r: number): Float32Array {
  const R = Math.ceil(r);
  // the ball's height above its rim at every offset: r − √(r² − d²) to lift it to its top
  const off: [number, number, number][] = [];
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r) off.push([dx, dy, r - Math.sqrt(r * r - d2)]);
    }
  const ero = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = Infinity;
      for (const [dx, dy, k] of off) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = c[yy * w + xx] + k;
        if (v < m) m = v;
      }
      ero[y * w + x] = m;
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (const [dx, dy, k] of off) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = ero[yy * w + xx] - k;
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  return out;
}

// The sliding paraboloid (as ImageJ): the background a paraboloid of curvature 1 / (2 r) touches from below, slid along
// rows, columns and the two diagonals in turn (the lower envelope of parabolas; exact on each line)
export function slidingParaboloid(c: Float32Array, w: number, h: number, r: number): Float32Array {
  const k = 1 / (2 * Math.max(r, 1e-6));
  let u = Float32Array.from(c);
  // one line (indices) — the largest surface y(x) ≤ f below f made of parabolas k(x − x0)²: an opening along the line
  const line = (idx: number[]) => {
    const n = idx.length;
    if (n < 2) return;
    const f = Float64Array.from(idx, (i) => u[i]);
    // erosion: e(x) = min_t f(t) + k (x − t)²; dilation: max_t e(t) − k (x − t)² (brute force on short lines is fine)
    const e = new Float64Array(n);
    for (let x = 0; x < n; x++) {
      let m = Infinity;
      for (let t = 0; t < n; t++) {
        const v = f[t] + k * (x - t) * (x - t);
        if (v < m) m = v;
      }
      e[x] = m;
    }
    for (let x = 0; x < n; x++) {
      let m = -Infinity;
      for (let t = 0; t < n; t++) {
        const v = e[t] - k * (x - t) * (x - t);
        if (v > m) m = v;
      }
      u[idx[x]] = Math.min(u[idx[x]], m);
    }
  };
  const pass = () => {
    for (let y = 0; y < h; y++) line(Array.from({ length: w }, (_, x) => y * w + x));
    for (let x = 0; x < w; x++) line(Array.from({ length: h }, (_, y) => y * w + x));
  };
  pass();
  u = Float32Array.from(u);
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
  return Float32Array.from(gx, (v, i) => Math.hypot(v, gy[i]));
}
// the Laplacian (4 neighbours, as scipy.ndimage.laplace)
export function laplace(c: Float32Array, w: number, h: number): Float32Array {
  const k = Float64Array.of(1, -2, 1);
  const one = Float64Array.of(1);
  const a = separable(c, w, h, k, one);
  const b = separable(c, w, h, one, k);
  return Float32Array.from(a, (v, i) => v + b[i]);
}
// the Laplacian of the Gaussian of σ (scipy.ndimage.gaussian_laplace)
export function laplacianOfGaussian(c: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const g0 = gaussKernel(sigma);
  const g2 = gaussKernel(sigma, 2);
  const a = separable(c, w, h, g2, g0);
  const b = separable(c, w, h, g0, g2);
  return Float32Array.from(a, (v, i) => v + b[i]);
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
  return Float32Array.from(hxx, (a, i) => {
    const b = hyy[i];
    const m = (a + b) / 2;
    const d = Math.sqrt(((a - b) / 2) ** 2 + hxy[i] ** 2);
    return s * (which === 'larger' ? m + d : m - d);
  });
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
// scipy.ndimage.convolve flips the kernel: the Gabor responses as scikit-image's gabor gives them (convolution)
export function gabor(c: Float32Array, w: number, h: number, frequency: number, theta: number, bandwidth = 1): Float32Array {
  const g = gaborKernel(frequency, theta, bandwidth);
  const flip = (k: Float64Array) => Float64Array.from(k).reverse();
  const re = correlate2d(c, w, h, flip(g.re), g.W, g.H);
  const im = correlate2d(c, w, h, flip(g.im), g.W, g.H);
  return Float32Array.from(re, (v, i) => Math.hypot(v, im[i]));
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
