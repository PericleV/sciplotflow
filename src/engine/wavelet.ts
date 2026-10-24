// The discrete wavelet transform (orthogonal: Haar, Daubechies 2 and 4, Symlet 4 — periodized, the signal extended
// symmetrically to a multiple of 2^level and cut back) and denoising by it: the detail coefficients thresholded —
// the universal threshold σ·√(2 ln n), σ from the median of the finest details (MAD / 0.6745), soft or hard. Pure.

import { WAVELET_FILTERS } from './waveletFilters.ts';

// the low-pass decomposition filters (orthonormal: Σh = √2, Σh² = 1)
export const WAVELETS: Record<string, { label: string; h: number[] }> = {
  haar: { label: 'Haar', h: [Math.SQRT1_2, Math.SQRT1_2] },
  db2: { label: 'Daubechies 2', h: [1 - Math.sqrt(3), 3 - Math.sqrt(3), 3 + Math.sqrt(3), 1 + Math.sqrt(3)].map((v) => v / (4 * Math.SQRT2)) },
  db4: { label: 'Daubechies 4', h: [-0.010597401785069032, 0.0328830116668852, 0.030841381835560764, -0.18703481171909309, -0.027983769416859854, 0.6308807679298589, 0.7148465705529157, 0.2303778133088965] },
  sym4: { label: 'Symlet 4', h: [-0.07576571478927333, -0.02963552764599851, 0.49761866763201545, 0.8037387518059161, 0.29785779560527736, -0.09921954357684722, -0.012603967262037833, 0.0322231006040427] },
};

// the high-pass filter of an orthogonal low-pass one: g[k] = (−1)^(k+1)·h[L−1−k] (as PyWavelets' dec_hi)
export const highPass = (h: number[]) => h.map((_, k) => (k % 2 ? 1 : -1) * h[h.length - 1 - k]);

// one level, periodized as PyWavelets' mode 'periodization': a[i] = Σ h[k]·x[(2i + L/2 − k) mod n], d the same with g;
// approximation and detail, each n/2 (n even)
const at = (i: number, n: number) => ((i % n) + n) % n;
function step(x: number[], h: number[], g: number[]): [number[], number[]] {
  const n = x.length;
  const L = h.length;
  const a = new Array<number>(n / 2).fill(0);
  const d = new Array<number>(n / 2).fill(0);
  for (let i = 0; i < n / 2; i++)
    for (let k = 0; k < L; k++) {
      const v = x[at(2 * i + L / 2 - k, n)];
      a[i] += h[k] * v;
      d[i] += g[k] * v;
    }
  return [a, d];
}
// back: the transpose of the step (it is orthogonal)
function unstep(a: number[], d: number[], h: number[], g: number[]): number[] {
  const n = a.length * 2;
  const L = h.length;
  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < n / 2; i++)
    for (let k = 0; k < L; k++) x[at(2 * i + L / 2 - k, n)] += h[k] * a[i] + g[k] * d[i];
  return x;
}
// the coefficients: [the approximation at the last level, the details from the coarsest to the finest]
export function dwt(x: number[], wavelet: string, level: number): number[][] {
  const h = (WAVELETS[wavelet] ?? WAVELET_FILTERS[wavelet] ?? WAVELETS.db4).h;
  const g = highPass(h);
  let a = x.slice();
  const ds: number[][] = [];
  for (let l = 0; l < level && a.length >= 2 && a.length % 2 === 0; l++) {
    const [na, d] = step(a, h, g);
    ds.unshift(d);
    a = na;
  }
  return [a, ...ds];
}
export function idwt(c: number[][], wavelet: string): number[] {
  const h = (WAVELETS[wavelet] ?? WAVELET_FILTERS[wavelet] ?? WAVELETS.db4).h;
  const g = highPass(h);
  let a = c[0];
  for (let l = 1; l < c.length; l++) a = unstep(a, c[l], h, g);
  return a;
}

// denoising: the signal extended to a multiple of 2^level, the details thresholded, back; the threshold used
export function waveletDenoise(y: number[], wavelet: string, level: number, mode: 'soft' | 'hard', scale = 1): { y: number[]; threshold: number; level: number } {
  const n = y.length;
  const maxLevel = Math.max(1, Math.floor(Math.log2(Math.max(2, n))) - 1);
  const lv = Math.max(1, Math.min(Math.round(level), maxLevel));
  const block = 2 ** lv;
  const m = Math.ceil(n / block) * block;
  // symmetric extension at the end (… c b a | a b c …)
  const ext = y.slice();
  for (let i = 0; ext.length < m; i++) ext.push(y[n - 1 - (i % n)]);
  const c = dwt(ext, wavelet, lv);
  const finest = c[c.length - 1].map(Math.abs).sort((a, b) => a - b);
  const mad = finest.length ? (finest[(finest.length - 1) >> 1] + finest[finest.length >> 1]) / 2 : 0;
  const sigma = mad / 0.6745;
  const t = scale * sigma * Math.sqrt(2 * Math.log(m));
  for (let l = 1; l < c.length; l++) c[l] = c[l].map((v) => (mode === 'hard' ? (Math.abs(v) > t ? v : 0) : Math.sign(v) * Math.max(0, Math.abs(v) - t)));
  return { y: idwt(c, wavelet).slice(0, n), threshold: t, level: lv };
}
