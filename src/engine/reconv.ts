// Reconvolution: a model of what happens after an instant (a decay) convolved with the instrument's response (IRF), as
// measured — fluorescence lifetimes (TCSPC), pump–probe, any response broadened by the instrument. On a grid of the
// IRF's step: M(t) = bg + Σ IRF(t − τ − shift)·D(τ)·Δt over τ ≥ 0, D the model, the IRF of area 1 (moved by `shift`,
// fitted or not); by FFTs. Its parameters: the model's, then shift and bg. Pure.
import type { Model, ModelCtx } from './fitModels.ts';

// a radix-2 FFT with its twiddles computed once for a length
function fftPlan(n: number) {
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) [cos[k], sin[k]] = [Math.cos((2 * Math.PI * k) / n), Math.sin((2 * Math.PI * k) / n)];
  const rev = new Uint32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    rev[i] = j;
  }
  return (re: Float64Array, im: Float64Array, inverse: boolean) => {
    for (let i = 1; i < n; i++) {
      const j = rev[i];
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const stride = n / len;
      const half = len / 2;
      for (let i = 0; i < n; i += len)
        for (let k = 0; k < half; k++) {
          const c = cos[k * stride];
          const s = inverse ? sin[k * stride] : -sin[k * stride];
          const a = i + k;
          const b = a + half;
          const vr = re[b] * c - im[b] * s;
          const vi = re[b] * s + im[b] * c;
          re[b] = re[a] - vr;
          im[b] = im[a] - vi;
          re[a] += vr;
          im[a] += vi;
        }
    }
    if (inverse)
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
  };
}

// the IRF read at t (linear between its points, 0 outside)
function reader(x: number[], y: number[]) {
  const n = x.length;
  return (t: number) => {
    if (!(t >= x[0] && t <= x[n - 1])) return 0;
    let [lo, hi] = [0, n - 1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (x[m] <= t) lo = m;
      else hi = m;
    }
    const d = x[hi] - x[lo];
    return d > 0 ? y[lo] + ((y[hi] - y[lo]) * (t - x[lo])) / d : y[lo];
  };
}

// model: of τ (the time after the instant); irf: its X and Y; range: the X of the data
export function reconvolved(model: Model, irf: { x: ArrayLike<number>; y: ArrayLike<number> }, range: [number, number], fitShift: boolean): Model | string {
  const idx = Array.from({ length: Math.min(irf.x.length, irf.y.length) }, (_, i) => i).filter((i) => Number.isFinite(irf.x[i]) && Number.isFinite(irf.y[i]));
  idx.sort((a, b) => irf.x[a] - irf.x[b]);
  const ix = idx.map((i) => irf.x[i]);
  const iy = idx.map((i) => irf.y[i]);
  if (ix.length < 3) return 'IRF: three points at least.';
  const steps = ix.slice(1).map((v, i) => v - ix[i]).filter((d) => d > 0).sort((a, b) => a - b);
  const dt = steps[steps.length >> 1];
  if (!(dt > 0)) return 'IRF: its X does not advance.';
  const t0 = Math.min(range[0], ix[0]);
  const t1 = Math.max(range[1], ix[ix.length - 1]);
  const G = Math.floor((t1 - t0) / dt) + 2;
  if (G > 1 << 16) return `IRF: ${G} steps of ${dt} over the data; too many (resample the IRF coarser).`;
  // the IRF of area 1
  let area = 0;
  for (let k = 1; k < ix.length; k++) area += ((iy[k] + iy[k - 1]) / 2) * (ix[k] - ix[k - 1]);
  if (!(Math.abs(area) > 0)) return 'IRF: its area is 0.';
  const irfAt = reader(ix, iy.map((v) => v / area));
  let N = 1;
  while (N < 2 * G) N <<= 1;
  const fft = fftPlan(N);
  const P = model.params.length;
  type Entry = { key: string; m: Float64Array };
  const cache: Entry[] = [];
  const curve = (p: number[], c: ModelCtx) => {
    const key = `${c.run}|${p.join(',')}`;
    const hit = cache.find((e) => e.key === key);
    if (hit) return hit.m;
    const shift = fitShift ? p[P] : 0;
    const ar = new Float64Array(N);
    const ai = new Float64Array(N);
    const br = new Float64Array(N);
    const bi = new Float64Array(N);
    const pm = p.slice(0, P);
    for (let k = 0; k < G; k++) {
      ar[k] = irfAt(t0 + k * dt - shift);
      const v = model.f(k * dt, pm, c);
      br[k] = Number.isFinite(v) ? v : 0;
    }
    // the trapezoid rule: τ = 0 counts half
    br[0] /= 2;
    fft(ar, ai, false);
    fft(br, bi, false);
    for (let k = 0; k < N; k++) [ar[k], ai[k]] = [ar[k] * br[k] - ai[k] * bi[k], ar[k] * bi[k] + ai[k] * br[k]];
    fft(ar, ai, true);
    const m = new Float64Array(G);
    for (let k = 0; k < G; k++) m[k] = ar[k] * dt;
    cache.unshift({ key, m });
    if (cache.length > 4) cache.pop();
    return m;
  };
  return {
    params: [...model.params, ...(fitShift ? [{ name: 'shift', kind: 'free' as const }] : []), { name: 'bg', kind: 'offset' as const }],
    note: `bg + IRF ⊗ (${model.note}), the IRF of area 1${fitShift ? ' moved by shift' : ''}; the model of the time after the instant (its offset: fix it at 0, the background is bg)`,
    f: (x, p, c) => {
      // the IRF moved by more than half the range: refused (the fit stays where the data are)
      if (fitShift && !(Math.abs(p[P]) <= (t1 - t0) / 2)) return NaN;
      const m = curve(p, c);
      const u = (x - t0) / dt;
      const k = Math.floor(u);
      if (k < 0 || k >= G - 1) return NaN;
      return p[p.length - 1] + m[k] + (m[k + 1] - m[k]) * (u - k);
    },
    guess: (runs, c, limits) => {
      const g = model.guess(runs, c, limits);
      const ys = runs.flatMap((r) => r.ys);
      let low = Infinity;
      for (const v of ys) if (v < low) low = v;
      return [...g, ...(fitShift ? [0] : []), Number.isFinite(low) ? low : 0];
    },
  };
}
