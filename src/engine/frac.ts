// Fractional calculus and the fractional Fourier transform. The derivative of any order α (negative: an integral) from
// the start of the data: Grünwald–Letnikov (X even), Riemann–Liouville and Caputo by product integration of the data
// joined by straight lines (exact for them; X may be uneven), and Weyl's in the Fourier domain ((iω)^α, periodic
// data). The discrete fractional Fourier transform of order a (Candan, Kutay and Ozaktas 2000): the eigenvectors of the
// matrix S that commutes with the DFT (Hermite–Gauss-like), F^a = E·diag(e^(−iπ a l / 2))·Eᵀ — unitary, a = 1 the
// centred DFT, a = 2 the reversal, the orders adding up. The fast one (Ozaktas, Arıkan, Kutay and Bozdağı 1996):
// closer to the continuous transform, a chirp gathered into a spike. Pure.
import { lgamma } from './dist.ts';
import { fft } from './signal.ts';

const gammaFn = (x: number): number => {
  // (Γ by reflection below ½)
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  return Math.exp(lgamma(x));
};

// ---- fractional derivatives ----
export type FracMethod = 'rl' | 'caputo' | 'gl' | 'fourier';
// Grünwald–Letnikov: h^−α Σ_k w_k f(x_(n−k)), w_0 = 1, w_k = w_(k−1) (1 − (α + 1)/k)
export function fracGL(f: number[], h: number, alpha: number): number[] {
  const n = f.length;
  const w = new Float64Array(n);
  w[0] = 1;
  for (let k = 1; k < n; k++) w[k] = w[k - 1] * (1 - (alpha + 1) / k);
  const s = h ** -alpha;
  return f.map((_, i) => {
    let a = 0;
    for (let k = 0; k <= i; k++) a += w[k] * f[i - k];
    return a * s;
  });
}
// the Riemann–Liouville integral of order ν > 0 of the data joined by straight lines, from x_0: exact on every segment
// ((x − t)^(ν−1) times a line)
export function fracIntegral(x: number[], f: number[], nu: number): number[] {
  const n = x.length;
  const g = gammaFn(nu);
  return x.map((xn, i) => {
    let s = 0;
    for (let j = 0; j < i; j++) {
      const A = xn - x[j];
      const B = xn - x[j + 1];
      const sl = (f[j + 1] - f[j]) / (x[j + 1] - x[j]);
      s += ((f[j] + sl * A) * (A ** nu - B ** nu)) / nu - (sl * (A ** (nu + 1) - B ** (nu + 1))) / (nu + 1);
    }
    return n ? s / g : NaN;
  });
}
// Caputo's derivative of order 0 < α < 1 (the L1 scheme: the slope of every segment integrated against (x − t)^(−α))
function caputoLow(x: number[], f: number[], alpha: number): number[] {
  const g = gammaFn(1 - alpha);
  return x.map((xn, i) => {
    let s = 0;
    for (let j = 0; j < i; j++) {
      const sl = (f[j + 1] - f[j]) / (x[j + 1] - x[j]);
      s += (sl * ((xn - x[j]) ** (1 - alpha) - (xn - x[j + 1]) ** (1 - alpha))) / (1 - alpha);
    }
    return s / g;
  });
}
// the first derivative of uneven data: the parabola through every point and its two neighbours (at the ends the
// first or last three), exact for quadratics
function deriv(x: number[], f: number[]): number[] {
  const n = x.length;
  return f.map((_, i) => {
    const j = Math.min(Math.max(i - 1, 0), n - 3);
    const [a, b, c] = [x[j], x[j + 1], x[j + 2]];
    const t = x[i];
    return f[j] * ((2 * t - b - c) / ((a - b) * (a - c))) + f[j + 1] * ((2 * t - a - c) / ((b - a) * (b - c))) + f[j + 2] * ((2 * t - a - b) / ((c - a) * (c - b)));
  });
}
// The derivative of order α from x_0 (α < 0: the integral of order −α); Riemann–Liouville or Caputo (they differ by the
// terms of the values at the start), Grünwald–Letnikov, or Weyl's (Fourier: the mean of the data left out)
export function fracDerivative(x: number[], f: number[], alpha: number, method: FracMethod): number[] {
  const n = x.length;
  if (n < 3) return f.map(() => NaN);
  if (method === 'gl') return fracGL(f, (x[n - 1] - x[0]) / (n - 1), alpha);
  if (method === 'fourier') return weyl(f, (x[n - 1] - x[0]) / (n - 1), alpha);
  const a = x[0];
  if (alpha === 0) return f.slice();
  if (alpha < 0) return fracIntegral(x, f, -alpha);
  const m = Math.ceil(alpha);
  // (Caputo of order α: the Caputo derivative of order α − (m − 1) of the (m − 1)-th derivative)
  let g = f.slice();
  for (let k = 0; k < m - 1; k++) g = deriv(x, g);
  const frac = alpha - (m - 1);
  let cap: number[];
  if (frac === 1) cap = deriv(x, g);
  else cap = caputoLow(x, g, frac);
  if (method === 'caputo') return cap.map((v, i) => (i === 0 ? NaN : v));
  // (Riemann–Liouville: Caputo plus the start values f^(k)(a) (x − a)^(k − α) / Γ(k + 1 − α))
  const starts: number[] = [];
  let d = f.slice();
  for (let k = 0; k < m; k++) {
    starts.push(d[0]);
    d = deriv(x, d);
  }
  return cap.map((v, i) => {
    if (i === 0) return NaN;
    let s = v;
    for (let k = 0; k < m; k++) {
      const p = k - alpha;
      if (Number.isInteger(p) && p < 0) continue;
      s += (starts[k] * (x[i] - a) ** p) / gammaFn(k + 1 - alpha);
    }
    return s;
  });
}
// Weyl's derivative: (iω)^α in the Fourier domain (the principal branch), the mean left out
function weyl(f: number[], h: number, alpha: number): number[] {
  const n = f.length;
  const m = f.reduce((a, b) => a + b, 0) / n;
  const [R, I] = fft(
    f.map((v) => v - m),
    new Array<number>(n).fill(0),
  );
  const pr: number[] = [];
  const pi: number[] = [];
  for (let k = 0; k < n; k++) {
    const kk = k <= n / 2 ? k : k - n;
    const w = (2 * Math.PI * kk) / (n * h);
    if (w === 0) {
      pr.push(0);
      pi.push(0);
      continue;
    }
    const mag = Math.abs(w) ** alpha;
    const ph = (Math.sign(w) * Math.PI * alpha) / 2;
    const [c, s] = [mag * Math.cos(ph), mag * Math.sin(ph)];
    pr.push(R[k] * c - I[k] * s);
    pi.push(R[k] * s + I[k] * c);
  }
  return fft(pr, pi, true)[0];
}

// ---- the discrete fractional Fourier transform ----
// the eigenvalues and eigenvectors of a symmetric tridiagonal matrix (diagonal d, below it e; the QL method of
// JAMA's tql2, public domain): V's columns
function tql2(d0: number[], e0: number[]): { d: number[]; V: number[][] } {
  const n = d0.length;
  const d = d0.slice();
  const e = [...e0, 0];
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  let f = 0;
  let tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) {
      if (Math.abs(e[m]) <= eps * tst1) break;
      m++;
    }
    if (m > l) {
      for (let iter = 0; iter < 100; iter++) {
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1;
        let c2 = c;
        let c3 = c;
        const el1 = e[l + 1];
        let s = 0;
        let s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i];
          h = c * p;
          r = Math.hypot(p, e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            h = V[k][i + 1];
            V[k][i + 1] = s * V[k][i] + c * h;
            V[k][i] = c * V[k][i] - s * h;
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
        if (Math.abs(e[l]) <= eps * tst1) break;
      }
    }
    d[l] += f;
    e[l] = 0;
  }
  return { d, V };
}
// the eigenvectors of S (Candan's even and odd parts, each tridiagonal), in the order of the Hermite–Gauss functions
const eigCache = new Map<number, number[][]>();
export function frftBasis(N: number): number[][] {
  const hit = eigCache.get(N);
  if (hit) return hit;
  // (S: diagonal 2 cos(2πk/N) − 4, 1 beside it and in the corners)
  const r = Math.floor(N / 2);
  const even = N % 2 === 0;
  const diag = (k: number) => 2 * Math.cos((2 * Math.PI * k) / N) - 4;
  // (P: the even and odd combinations of k and N − k)
  const P = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  P[0][0] = 1;
  for (let i = 1; i <= r - (even ? 1 : 0); i++) {
    P[i][i] = Math.SQRT1_2;
    P[i][N - i] = Math.SQRT1_2;
  }
  if (even) P[r][r] = 1;
  for (let i = r + 1; i < N; i++) {
    P[i][i] = -Math.SQRT1_2;
    P[i][N - i] = Math.SQRT1_2;
  }
  // (CS = P S Pᵀ: S applied to the rows of P by its band)
  const Sx = (v: number[]) => v.map((q, k) => diag(k) * q + v[(k + 1) % N] + v[(k - 1 + N) % N]);
  const PS = P.map((row) => Sx(row));
  const CS = PS.map((row) => P.map((col) => row.reduce((a, q, k) => a + q * col[k], 0)));
  const ne = r + 1;
  const no = N - ne;
  const ev = tql2(
    Array.from({ length: ne }, (_, i) => CS[i][i]),
    Array.from({ length: ne - 1 }, (_, i) => CS[i + 1][i]),
  );
  const od = no > 0 ? tql2(
    Array.from({ length: no }, (_, i) => CS[ne + i][ne + i]),
    Array.from({ length: no - 1 }, (_, i) => CS[ne + i + 1][ne + i]),
  ) : { d: [], V: [] };
  // (every eigenvector back by Pᵀ; the even ones and the odd ones by their eigenvalues, the largest first, interleaved)
  const back = (vec: number[], off: number) => Array.from({ length: N }, (_, k) => vec.reduce((a, q, i) => a + P[off + i][k] * q, 0));
  const evIdx = ev.d.map((_, i) => i).sort((a, b) => ev.d[b] - ev.d[a]);
  const odIdx = od.d.map((_, i) => i).sort((a, b) => od.d[b] - od.d[a]);
  const evVecs = evIdx.map((i) => back(ev.V.map((row) => row[i]), 0));
  const odVecs = odIdx.map((i) => back(od.V.map((row) => row[i]), ne));
  const E: number[][] = [];
  for (let k = 0; E.length < N; k++) {
    if (k % 2 === 0) {
      if (evVecs[k / 2]) E.push(evVecs[k / 2]);
    } else if (odVecs[(k - 1) / 2]) E.push(odVecs[(k - 1) / 2]);
    if (k > 2 * N) break;
  }
  // (N even: the last even vector takes the order N, as Candan's code)
  eigCache.set(N, E);
  if (eigCache.size > 4) eigCache.delete(eigCache.keys().next().value!);
  return E;
}
// F^a x of a complex signal (re, im), its middle at index ⌊N/2⌋ (as Candan's code: the indices shifted)
export function frft(re: number[], im: number[], a: number): [number[], number[]] {
  const N = re.length;
  const E = frftBasis(N);
  const even = N % 2 === 0;
  const shift = (k: number) => (k + Math.floor(N / 2)) % N;
  // (the eigenvalue orders 0 … N − 2 and N − 1 + even)
  const ord = E.map((_, l) => (l < N - 1 ? l : N - 1 + (even ? 1 : 0)));
  const xr = Array.from({ length: N }, (_, k) => re[shift(k)]);
  const xi = Array.from({ length: N }, (_, k) => im[shift(k)]);
  const cr = E.map((v) => v.reduce((s, q, k) => s + q * xr[k], 0));
  const ci = E.map((v) => v.reduce((s, q, k) => s + q * xi[k], 0));
  const yr = new Array<number>(N).fill(0);
  const yi = new Array<number>(N).fill(0);
  E.forEach((v, l) => {
    const ph = (-Math.PI / 2) * a * ord[l];
    const [c, s] = [Math.cos(ph), Math.sin(ph)];
    const [ar, ai] = [cr[l] * c - ci[l] * s, cr[l] * s + ci[l] * c];
    for (let k = 0; k < N; k++) {
      yr[k] += v[k] * ar;
      yi[k] += v[k] * ai;
    }
  });
  const outR = new Array<number>(N);
  const outI = new Array<number>(N);
  for (let k = 0; k < N; k++) {
    outR[shift(k)] = yr[k];
    outI[shift(k)] = yi[k];
  }
  return [outR, outI];
}
// how gathered a transform is: Σ|y|⁴ / (Σ|y|²)² (1 / the number of samples it spreads over)
export const concentration = (re: number[], im: number[]) => {
  let [s2, s4] = [0, 0];
  for (let k = 0; k < re.length; k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    s2 += p;
    s4 += p * p;
  }
  return s4 / (s2 * s2 || 1);
};
export { gammaFn };

// ---- the fast fractional Fourier transform (Ozaktas, Arıkan, Kutay and Bozdağı 1996) ----
// the continuous transform approximated in O(N log N): the signal interpolated to twice the samples (sinc), multiplied
// by a chirp, convolved with a chirp, multiplied by a chirp, every other sample kept; 0.5 < a < 1.5 by the DFT steps
// around it (as their fracF). Close to the continuous transform: a chirp gathers into a spike (N even)
function cfft(re: number[], im: number[], P: number, inverse = false): [number[], number[]] {
  const r = [...re, ...new Array<number>(Math.max(0, P - re.length)).fill(0)].slice(0, P);
  const i = [...im, ...new Array<number>(Math.max(0, P - im.length)).fill(0)].slice(0, P);
  return fft(r, i, inverse);
}
// (the linear convolution of a and b, only its samples from … to: a circular one of the smallest power of two that
// leaves them free of the wrap-around; a kernel's spectrum kept by its key)
const SPECTRA = new Map<string, [number[], number[]]>();
function fconv(ar: number[], ai: number[], br: number[], bi: number[], from = 0, to = ar.length + br.length - 1, key = ''): [number[], number[]] {
  const n = ar.length + br.length - 1;
  const P = 2 ** Math.ceil(Math.log2(Math.max(to, n - from, ar.length, br.length)));
  const [Ar, Ai] = cfft(ar, ai, P);
  let B = key ? SPECTRA.get(`${key}:${P}`) : undefined;
  if (!B) {
    B = cfft(br, bi, P);
    if (key) {
      if (SPECTRA.size > 16) SPECTRA.clear();
      SPECTRA.set(`${key}:${P}`, B);
    }
  }
  const [Br, Bi] = B;
  const [r, i] = fft(
    Ar.map((v, k) => v * Br[k] - Ai[k] * Bi[k]),
    Ar.map((v, k) => v * Bi[k] + Ai[k] * Br[k]),
    true,
  );
  return [r.slice(from, to), i.slice(from, to)];
}
const sincF = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
// The fast fractional Fourier transform of order a (their fracF, N even): the order brought into 0.5 … 1.5 by a DFT,
// the signal sinc-interpolated to twice the rate, a chirp before, a chirp convolution, a chirp after, every second sample
export function fracFast(re0: number[], im0: number[], a0: number): [number[], number[]] {
  const N = re0.length;
  const sh = (k: number) => (k + Math.floor(N / 2)) % N;
  const sN = Math.sqrt(N);
  let a = ((a0 % 4) + 4) % 4;
  let re = re0.slice();
  let im = im0.slice();
  // (the centred DFT and its inverse)
  const dft = (r: number[], i: number[], inverse: boolean): [number[], number[]] => {
    const xr = Array.from({ length: N }, (_, k) => r[sh(k)]);
    const xi = Array.from({ length: N }, (_, k) => i[sh(k)]);
    const [Fr, Fi] = fft(xr, xi, inverse);
    const f = inverse ? sN : 1 / sN;
    const or = new Array<number>(N);
    const oi = new Array<number>(N);
    for (let k = 0; k < N; k++) {
      or[sh(k)] = Fr[k] * f;
      oi[sh(k)] = Fi[k] * f;
    }
    return [or, oi];
  };
  if (a === 0) return [re, im];
  if (a === 2) return [re.slice().reverse(), im.slice().reverse()];
  if (a === 1) return dft(re, im, false);
  if (a === 3) return dft(re, im, true);
  if (a > 2) {
    a -= 2;
    re = re.reverse();
    im = im.reverse();
  }
  if (a > 1.5) {
    a -= 1;
    [re, im] = dft(re, im, false);
  }
  if (a < 0.5) {
    a += 1;
    [re, im] = dft(re, im, true);
  }
  const al = (a * Math.PI) / 2;
  const tana2 = Math.tan(al / 2);
  const sina = Math.sin(al);
  // (sinc interpolation to 2N − 1 samples, N − 1 zeros on each side)
  const yr = new Array<number>(2 * N - 1).fill(0);
  const yi = new Array<number>(2 * N - 1).fill(0);
  for (let k = 0; k < N; k++) {
    yr[2 * k] = re[k];
    yi[2 * k] = im[k];
  }
  const s = Array.from({ length: 4 * N - 5 }, (_, k) => sincF((k - (2 * N - 3)) / 2));
  const [ir, ii] = fconv(yr, yi, s, s.map(() => 0), 2 * N - 3, 4 * N - 4, `sinc${N}`);
  const L = 4 * N - 3;
  const fr = [...new Array<number>(N - 1).fill(0), ...ir, ...new Array<number>(N - 1).fill(0)];
  const fi = [...new Array<number>(N - 1).fill(0), ...ii, ...new Array<number>(N - 1).fill(0)];
  // (the chirp before and after)
  const cr: number[] = [];
  const ci: number[] = [];
  for (let k = 0; k < L; k++) {
    const q = k - (2 * N - 2);
    const ph = (-Math.PI / N) * (tana2 / 4) * q * q;
    cr.push(Math.cos(ph));
    ci.push(Math.sin(ph));
  }
  const gr = fr.map((v, k) => v * cr[k] - fi[k] * ci[k]);
  const gi = fr.map((v, k) => v * ci[k] + fi[k] * cr[k]);
  const c = Math.PI / N / sina / 4;
  const kr: number[] = [];
  const ki: number[] = [];
  for (let k = 0; k < 8 * N - 7; k++) {
    const q = k - (4 * N - 4);
    kr.push(Math.cos(c * q * q));
    ki.push(Math.sin(c * q * q));
  }
  const [hr, hi] = fconv(gr, gi, kr, ki, 4 * N - 4, 8 * N - 7);
  const sc = Math.sqrt(c / Math.PI);
  const Hr = hr.map((v) => v * sc);
  const Hi = hi.map((v) => v * sc);
  const pr = Hr.map((v, k) => v * cr[k] - Hi[k] * ci[k]);
  const pi = Hr.map((v, k) => v * ci[k] + Hi[k] * cr[k]);
  const [nr, ni] = [Math.cos((-(1 - a) * Math.PI) / 4), Math.sin((-(1 - a) * Math.PI) / 4)];
  const or: number[] = [];
  const oi: number[] = [];
  for (let k = N - 1; k < pr.length - (N - 1); k += 2) {
    or.push(pr[k] * nr - pi[k] * ni);
    oi.push(pr[k] * ni + pi[k] * nr);
  }
  return [or, oi];
}
