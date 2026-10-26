// Frequency (Image analysis): the image's 2D Fourier transform — its spectrum (log or linear, the zero frequency in the
// middle), a band-pass in it (ImageJ's Bandpass filter: structures larger and smaller than two sizes taken out, stripes
// along a direction too), a mask of spots (taken out: periodic noise; or the only ones kept: a Bragg filter), and the
// radial average of the spectrum (its power against the spatial frequency k and the distance d = 1/k). The image is
// padded to a square of a power of two (N), the mean taken off first; a Hann window against the edges if asked. A
// spectrum's pixel (u, v) from the middle is the frequency (u, v) / N cycles per pixel. Pure.

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// the tables of an FFT of length n, made once: the bit-reversed order, and cos, sin of −2πk/n for k < n/2
const tables = new Map<number, { rev: Uint32Array; cos: Float64Array; sin: Float64Array }>();
function fftTables(n: number) {
  let t = tables.get(n);
  if (!t) {
    const rev = new Uint32Array(n);
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      rev[i] = j;
    }
    const cos = new Float64Array(n >> 1);
    const sin = new Float64Array(n >> 1);
    for (let k = 0; k < n >> 1; k++) {
      cos[k] = Math.cos((2 * Math.PI * k) / n);
      sin[k] = -Math.sin((2 * Math.PI * k) / n);
    }
    tables.set(n, (t = { rev, cos, sin }));
  }
  return t;
}
// an FFT of length n (a power of two), in place; inverse: without the 1/n
export function fft1(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  if (n < 2) return;
  const { rev, cos, sin } = fftTables(n);
  for (let i = 1; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  const sg = inverse ? -1 : 1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    // (the twiddle of k in this stage: that of k · n / len in the tables)
    const stride = n / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < half; k++) {
        const wr = cos[k * stride];
        const wi = sg * sin[k * stride];
        const a = i + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
  }
}
// an N × N square turned over its diagonal, in place, in blocks (a column read along a row: the memory in order)
function transpose(a: Float64Array, N: number) {
  const B = 32;
  for (let by = 0; by < N; by += B)
    for (let bx = by; bx < N; bx += B)
      for (let y = by; y < Math.min(by + B, N); y++)
        for (let x = bx === by ? y + 1 : bx; x < Math.min(bx + B, N); x++) {
          const p = y * N + x;
          const q = x * N + y;
          const t = a[p];
          a[p] = a[q];
          a[q] = t;
        }
}
// The 2D FFT of N × N values (rows, then the columns as the rows of the square turned over), in place; inverse: divided
// by N²
export function fft2(re: Float64Array, im: Float64Array, N: number, inverse = false) {
  const rows = () => {
    for (let y = 0; y < N; y++) fft1(re.subarray(y * N, y * N + N), im.subarray(y * N, y * N + N), inverse);
  };
  rows();
  transpose(re, N);
  transpose(im, N);
  rows();
  transpose(re, N);
  transpose(im, N);
  if (inverse) {
    const k2 = 1 / (N * N);
    for (let k = 0; k < N * N; k++) {
      re[k] *= k2;
      im[k] *= k2;
    }
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
  if (mirror) {
    // (reflected: …, 1, 0 | 0, 1 … w − 1 | w − 1, w − 2 …; the source column and row of every place, once)
    const fold = (t: number, n: number) => {
      const p = t % (2 * n);
      return p < n ? p : 2 * n - 1 - p;
    };
    const fx = Uint32Array.from({ length: N }, (_, x) => fold(x, w));
    for (let y = 0; y < N; y++) {
      const row = fold(y, h) * w;
      for (let x = 0, o = y * N; x < N; x++) re[o + x] = c[row + fx[x]] - mean;
    }
  } else {
    const win = (k: number, n: number) => (hann ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (k + 0.5)) / n) : 1);
    const wx = Float64Array.from({ length: w }, (_, x) => win(x, w));
    for (let y = 0; y < h; y++) {
      const wy = win(y, h);
      for (let x = 0; x < w; x++) re[y * N + x] = (c[y * w + x] - mean) * wx[x] * wy;
    }
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

// A filter of the frequencies (fx, fy in cycles per pixel; the gain real and the same at −fx, −fy) applied to the image:
// its transform multiplied, back. The image real, so its spectrum is known from half of it (X(−f) = X(f)*): the rows
// transformed two at a time (one the real part, the other the imaginary), only the columns of fx ≥ 0 transformed, and
// back the same way: half the work of a full 2D transform
function filtered(c: Float32Array, w: number, h: number, gain: (fx: number, fy: number) => number, keepMean: boolean): Float32Array {
  const { re, N, mean } = padded(c, w, h, false, true);
  const H = (N >> 1) + 1;
  // (the half spectrum by columns: column k, row y at k·N + y)
  const sr = new Float64Array(H * N);
  const si = new Float64Array(H * N);
  const zr = new Float64Array(N);
  const zi = new Float64Array(N);
  for (let y = 0; y < N; y += 2) {
    zr.set(re.subarray(y * N, y * N + N));
    zi.set(re.subarray((y + 1) * N, (y + 1) * N + N));
    fft1(zr, zi, false);
    // (A = (Z(k) + Z(−k)*) / 2 the row y, B = (Z(k) − Z(−k)*) / 2i the row y + 1)
    for (let k = 0; k < H; k++) {
      const nk = (N - k) % N;
      sr[k * N + y] = (zr[k] + zr[nk]) / 2;
      si[k * N + y] = (zi[k] - zi[nk]) / 2;
      sr[k * N + y + 1] = (zi[k] + zi[nk]) / 2;
      si[k * N + y + 1] = (zr[nk] - zr[k]) / 2;
    }
  }
  for (let k = 0; k < H; k++) {
    const [cr, ci] = [sr.subarray(k * N, k * N + N), si.subarray(k * N, k * N + N)];
    fft1(cr, ci, false);
    const fx = k / N;
    for (let y = 0; y < N; y++) {
      const g = gain(fx, (y < N / 2 ? y : y - N) / N);
      cr[y] *= g;
      ci[y] *= g;
    }
    fft1(cr, ci, true);
  }
  // (back along the rows, two at a time: Z = A + iB, its real part the row y, its imaginary part the row y + 1)
  const out = new Float32Array(w * h);
  const scale = 1 / (N * N);
  const add = keepMean ? mean : 0;
  for (let y = 0; y < Math.min(h + (h & 1), N); y += 2) {
    for (let k = 0; k < N; k++) {
      // (beyond the half kept: the conjugate of its mirror)
      const p = (k < H ? k : N - k) * N + y;
      const sg = k < H ? 1 : -1;
      zr[k] = sr[p] - sg * si[p + 1];
      zi[k] = sg * si[p] + sr[p + 1];
    }
    fft1(zr, zi, true);
    for (let x = 0; x < w; x++) {
      out[y * w + x] = zr[x] * scale + add;
      if (y + 1 < h) out[(y + 1) * w + x] = zi[x] * scale + add;
    }
  }
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
