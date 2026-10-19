// The Faddeeva function w(z) = exp(−z²)·erfc(−iz) in the upper half plane (Im z ≥ 0), by Weideman's rational series
// (SIAM J. Numer. Anal. 31, 1497, 1994) with N = 32 terms — about 1e-13 near the axis —, and Laplace's continued
// fraction far away. The Voigt profile (the convolution of a Gaussian and a Lorentzian, of area 1) from it. Pure.

const N = 32;
const Lw = Math.sqrt(N / Math.SQRT2);
// the coefficients a1 … aN of the series (a real FFT of exp(−t²)(L² + t²), t = L·tan(θ/2), done once)
const A: number[] = (() => {
  const M = 2 * N;
  const M2 = 2 * M;
  // f over k = −M+1 … M−1 with a 0 before, then shifted by half (fftshift)
  const f = new Float64Array(M2);
  for (let k = -M + 1; k <= M - 1; k++) {
    const t = Lw * Math.tan((k * Math.PI) / M / 2);
    f[k + M] = Math.exp(-t * t) * (Lw * Lw + t * t);
  }
  const g = new Float64Array(M2);
  for (let i = 0; i < M2; i++) g[i] = f[(i + M) % M2];
  // the real part of the DFT at 1 … N
  const a: number[] = [];
  for (let n = 1; n <= N; n++) {
    let s = 0;
    for (let i = 0; i < M2; i++) s += g[i] * Math.cos((2 * Math.PI * n * i) / M2);
    a.push(s / M2);
  }
  return a;
})();

// w(x + iy), y ≥ 0: [Re, Im]
export function faddeeva(x: number, y: number): [number, number] {
  const r2 = x * x + y * y;
  if (r2 > 1e4) {
    // far: the continued fraction w ≈ (i/√π)·1/(z − 1/2/(z − 1/(z − 3/2/(z − …))))
    let [dr, di] = [x, y];
    for (let k = 12; k >= 1; k--) {
      const q = dr * dr + di * di;
      const c = k / 2;
      [dr, di] = [x - (c * dr) / q, y + (c * di) / q];
    }
    const q = dr * dr + di * di;
    // i/(√π·d) = i·conj(d)/(√π|d|²)
    return [di / q / Math.sqrt(Math.PI), dr / q / Math.sqrt(Math.PI)];
  }
  // Z = (L + iz)/(L − iz), iz = −y + ix
  const [nr, ni] = [Lw - y, x];
  const [dr, di] = [Lw + y, -x];
  const dq = dr * dr + di * di;
  const Zr = (nr * dr + ni * di) / dq;
  const Zi = (ni * dr - nr * di) / dq;
  // p(Z) = Σ a_n Z^(n−1), by Horner from the highest
  let [pr, pi] = [0, 0];
  for (let n = N - 1; n >= 0; n--) [pr, pi] = [pr * Zr - pi * Zi + A[n], pr * Zi + pi * Zr];
  // w = 2p/(L − iz)² + 1/(√π (L − iz))
  const [sr, si] = [dr * dr - di * di, 2 * dr * di];
  const sq = sr * sr + si * si;
  const [t1r, t1i] = [(2 * (pr * sr + pi * si)) / sq, (2 * (pi * sr - pr * si)) / sq];
  const k = 1 / Math.sqrt(Math.PI) / dq;
  return [t1r + k * dr, t1i - k * di];
}

// The Voigt profile of area 1: σ the Gaussian's standard deviation, γ the Lorentzian's half width at half maximum
export function voigtProfile(x: number, sigma: number, gamma: number): number {
  const s = Math.abs(sigma);
  const g = Math.abs(gamma);
  if (s === 0) return g === 0 ? (x === 0 ? Infinity : 0) : g / Math.PI / (x * x + g * g);
  const k = s * Math.SQRT2;
  return faddeeva(x / k, g / k)[0] / (s * Math.sqrt(2 * Math.PI));
}
// σ, γ from the two FWHM (Gaussian wG, Lorentzian wL)
export const voigtSG = (wG: number, wL: number) => [Math.abs(wG) / (2 * Math.sqrt(2 * Math.LN2)), Math.abs(wL) / 2] as const;
// the FWHM of a Voigt profile, found (it falls on both sides of its top at x = 0)
export function voigtFwhm(wG: number, wL: number): number {
  const [s, g] = voigtSG(wG, wL);
  if (s === 0 && g === 0) return 0;
  const half = voigtProfile(0, s, g) / 2;
  let [a, b] = [0, Math.abs(wG) + Math.abs(wL)];
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    if (voigtProfile(m, s, g) > half) a = m;
    else b = m;
  }
  return a + b;
}
