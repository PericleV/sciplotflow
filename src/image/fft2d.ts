// Frequency (Image analysis): the image's 2D Fourier transform — its spectrum (log or linear, the zero frequency in the
// middle), a band-pass in it (ImageJ's Bandpass filter: structures larger and smaller than two sizes taken out, stripes
// along a direction too), a mask of spots (taken out: periodic noise; or the only ones kept: a Bragg filter), and the
// radial average of the spectrum (its power against the spatial frequency k and the distance d = 1/k). The image is
// padded to a square of a power of two (N), the mean taken off first; a Hann window against the edges if asked. A
// spectrum's pixel (u, v) from the middle is the frequency (u, v) / N cycles per pixel. Pure.

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// an FFT of length n (a power of two), in place; inverse: without the 1/n
export function fft1(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const [wr, wi] = [Math.cos(ang), Math.sin(ang)];
    for (let i = 0; i < n; i += len) {
      let [cr, ci] = [1, 0];
      for (let k = 0; k < len / 2; k++) {
        const [a, b] = [i + k, i + k + len / 2];
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
// The 2D FFT of N × N values (rows then columns), in place; inverse: divided by N²
export function fft2(re: Float64Array, im: Float64Array, N: number, inverse = false) {
  const [r, i] = [new Float64Array(N), new Float64Array(N)];
  for (let y = 0; y < N; y++) {
    r.set(re.subarray(y * N, y * N + N));
    i.set(im.subarray(y * N, y * N + N));
    fft1(r, i, inverse);
    re.set(r, y * N);
    im.set(i, y * N);
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) [r[y], i[y]] = [re[y * N + x], im[y * N + x]];
    fft1(r, i, inverse);
    for (let y = 0; y < N; y++) [re[y * N + x], im[y * N + x]] = [r[y], i[y]];
  }
  if (inverse)
    for (let k = 0; k < N * N; k++) {
      re[k] /= N * N;
      im[k] /= N * N;
    }
}

// The image padded into an N × N square (N ≥ its sides, a power of two): the mean taken off, a Hann window if asked;
// mirror: the padding the image mirrored (filters: no step at its edges), else zeros (the spectrum)
function padded(c: Float32Array, w: number, h: number, hann: boolean, mirror: boolean): { re: Float64Array; im: Float64Array; N: number; mean: number } {
  // (a filter: a margin of a quarter mirrored at least, up to 4096; the spectrum: its own size)
  const N = mirror ? Math.min(4096, nextPow2(Math.ceil(Math.max(w, h) * 1.25))) : nextPow2(Math.max(w, h));
  let mean = 0;
  for (let k = 0; k < w * h; k++) mean += c[k];
  mean /= w * h || 1;
  const re = new Float64Array(N * N);
  const win = (k: number, n: number) => (hann ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (k + 0.5)) / n) : 1);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let [sx, sy] = [x, y];
      if (mirror) {
        // (reflected: …, 1, 0 | 0, 1 … w − 1 | w − 1, w − 2 …)
        const fold = (t: number, n: number) => {
          const p = t % (2 * n);
          return p < n ? p : 2 * n - 1 - p;
        };
        [sx, sy] = [fold(x, w), fold(y, h)];
      } else if (x >= w || y >= h) continue;
      re[y * N + x] = (c[sy * w + sx] - mean) * (mirror ? 1 : win(x, w) * win(y, h));
    }
  return { re, im: new Float64Array(N * N), N, mean };
}

// The spectrum: its magnitude (log: log(1 + |F|)), the zero frequency in the middle; N × N
export function spectrum(c: Float32Array, w: number, h: number, o: { log: boolean; hann: boolean }): { mag: Float32Array; N: number } {
  const { re, im, N } = padded(c, w, h, o.hann, false);
  fft2(re, im, N);
  const mag = new Float32Array(N * N);
  const half = N >> 1;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = y * N + x;
      const m = Math.hypot(re[k], im[k]);
      mag[((y + half) % N) * N + ((x + half) % N)] = o.log ? Math.log1p(m) : m;
    }
  return { mag, N };
}

// a filter of the frequencies (fx, fy in cycles per pixel) applied to the image: its transform multiplied, back
function filtered(c: Float32Array, w: number, h: number, gain: (fx: number, fy: number) => number, keepMean: boolean): Float32Array {
  const { re, im, N, mean } = padded(c, w, h, false, true);
  fft2(re, im, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const fx = (x < N / 2 ? x : x - N) / N;
      const fy = (y < N / 2 ? y : y - N) / N;
      const g = gain(fx, fy);
      re[y * N + x] *= g;
      im[y * N + x] *= g;
    }
  fft2(re, im, N, true);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = re[y * N + x] + (keepMean ? mean : 0);
  return out;
}

// Band-pass (as ImageJ): structures larger than `large` px and smaller than `small` px taken out (Gaussian edges in
// frequency); stripes: along rows ('h', the horizontal stripes) or columns ('v') taken out too, those within `tol` % of
// the axis
export function bandpass(c: Float32Array, w: number, h: number, large: number, small: number, stripes: 'none' | 'h' | 'v', tol: number): Float32Array {
  const fl = large > 0 ? 1 / large : 0;
  const fs = small > 0 ? 1 / small : Infinity;
  const st = Math.max(1e-6, tol / 100);
  return filtered(
    c,
    w,
    h,
    (fx, fy) => {
      const f2 = fx * fx + fy * fy;
      let g = (fl > 0 ? 1 - Math.exp(-f2 / (fl * fl)) : 1) * (Number.isFinite(fs) ? Math.exp(-f2 / (fs * fs)) : 1);
      // (horizontal stripes: their frequencies along y, near fx = 0)
      if (stripes === 'h' && fy !== 0) g *= 1 - Math.exp(-(fx * fx) / (st * st * Math.max(fy * fy, 1e-12)));
      if (stripes === 'v' && fx !== 0) g *= 1 - Math.exp(-(fy * fy) / (st * st * Math.max(fx * fx, 1e-12)));
      return g;
    },
    true,
  );
}

// A mask of spots (fx, fy in cycles per pixel; each with its mirror −fx, −fy): taken out, or the only ones kept (with
// the zero frequency: the mean); r: their radius in cycles per pixel, with soft edges
export function spotMask(c: Float32Array, w: number, h: number, spots: [number, number][], r: number, keep: boolean): Float32Array {
  const rr = Math.max(1e-4, r);
  const near = (fx: number, fy: number) => {
    let g = 0;
    for (const [sx, sy] of spots)
      for (const s of [1, -1]) {
        const d2 = (fx - s * sx) ** 2 + (fy - s * sy) ** 2;
        g = Math.max(g, Math.exp(-d2 / (2 * rr * rr)));
      }
    return g;
  };
  return filtered(c, w, h, (fx, fy) => (keep ? near(fx, fy) : 1 - near(fx, fy)), true);
}

// The radial average of the spectrum's power (|F|²) in rings of one spectrum pixel: k (cycles per pixel), power; and the
// distance of its strongest peak away from the middle (1 / k, px; NaN: none clear)
export function radialSpectrum(c: Float32Array, w: number, h: number, hann = true): { k: number[]; power: number[]; peakD: number } {
  const { re, im, N } = padded(c, w, h, hann, false);
  fft2(re, im, N);
  const half = N >> 1;
  const sum = new Float64Array(half);
  const cnt = new Float64Array(half);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x < half ? x : x - N;
      const v = y < half ? y : y - N;
      const r = Math.round(Math.hypot(u, v));
      if (r >= half) continue;
      sum[r] += re[y * N + x] ** 2 + im[y * N + x] ** 2;
      cnt[r]++;
    }
  const k: number[] = [];
  const power: number[] = [];
  for (let r = 1; r < half; r++) {
    k.push(r / N);
    power.push(cnt[r] ? sum[r] / cnt[r] : NaN);
  }
  // (the peak: k·power highest past the first few rings, a local maximum standing over its surroundings)
  let best = -1;
  let bv = 0;
  const kp = power.map((p, i) => p * k[i] * k[i]);
  for (let i = 3; i < kp.length - 2; i++) if (kp[i] > kp[i - 1] && kp[i] >= kp[i + 1] && kp[i] > bv) [best, bv] = [i, kp[i]];
  const around = kp.slice(Math.max(3, best - 8), best + 9).filter((_, j, a) => j < 4 || j > a.length - 5);
  const base = around.length ? around.reduce((a, b) => a + b, 0) / around.length : 0;
  return { k, power, peakD: best >= 0 && bv > 1.5 * base ? 1 / k[best] : NaN };
}
