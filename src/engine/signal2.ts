// The methods of the signal package: the measurements of a waveform (its two levels from the histogram as IEEE 181, the
// crossings of the reference levels with hysteresis, the rise and fall times, the period, the pulse widths, the duty
// cycle, the overshoot, the settling time, RMS and the crest factor), the change points of a signal in steps (PELT,
// Killick et al. 2012, and binary segmentation; a change of the mean, or of the mean and the variance), the averaging of
// the segments around triggers (the crossings of a level, marks, times given), the Hampel filter, the Lomb–Scargle
// periodogram with its false-alarm probability, the harmonics of a periodic signal (THD, SNR, SINAD, ENOB). Pure.
import { lgamma } from './dist.ts';
import { fft } from './signal.ts';

const sortedOf = (a: number[]) => [...a].sort((p, q) => p - q);
const medianOf = (a: number[]) => {
  const s = sortedOf(a);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- the levels of a two-level waveform ----
// The base and the top: the modes of the histogram of the values below and above the middle of their range (IEEE 181),
// or the minimum and the maximum
export function stateLevels(y: number[], how: 'histogram' | 'minmax', bins = 100): { base: number; top: number } {
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of y) if (Number.isFinite(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  if (how === 'minmax' || !(hi > lo)) return { base: lo, top: hi };
  const w = (hi - lo) / bins;
  const cnt = new Array<number>(bins).fill(0);
  for (const v of y) if (Number.isFinite(v)) cnt[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const half = bins >> 1;
  let [bl, bh] = [0, half];
  for (let i = 0; i < half; i++) if (cnt[i] > cnt[bl]) bl = i;
  for (let i = half; i < bins; i++) if (cnt[i] > cnt[bh]) bh = i;
  // (the mean of the values in the modal bins: the level)
  const inBin = (b: number) => y.filter((v) => Number.isFinite(v) && Math.min(bins - 1, Math.floor((v - lo) / w)) === b);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return { base: mean(inBin(bl)), top: mean(inBin(bh)) };
}

export type Edge = { kind: 'rise' | 'fall'; t: number; i: number; tLo: number; tHi: number; dur: number; overshoot: number; settle: number };
export type Wave = { base: number; top: number; amp: number; edges: Edge[]; period: number; posWidth: number; negWidth: number; duty: number; mean: number; rms: number; acRms: number; pp: number; crest: number; crossings: number };
// The crossings of `level` between samples i − 1 and i (linear between them)
const at = (x: number[], y: number[], i: number, level: number) => x[i - 1] + ((level - y[i - 1]) * (x[i] - x[i - 1])) / (y[i] - y[i - 1] || 1);
// The measurements of a waveform (x ascending): the mid-level crossings with a hysteresis (h, a fraction of the
// amplitude) are its edges; every edge its 10–90 % time (the reference levels lo, hi as fractions), its overshoot (%
// of the amplitude past the level it goes to, until the next edge) and its settling time (from the mid crossing until
// it stays within tol of that level)
export function waveform(x: number[], y: number[], lv: { base: number; top: number }, lo = 0.1, hi = 0.9, h = 0.05, tol = 0.02): Wave {
  const n = x.length;
  const { base, top } = lv;
  const amp = top - base;
  const L = (f: number) => base + f * amp;
  const mid = L(0.5);
  const edges: Edge[] = [];
  // (the state: high above mid + h, low below mid − h; an edge where it changes, at the last crossing of mid before)
  let state = 0;
  let lastCross = -1;
  for (let i = 0; i < n; i++) {
    if (i > 0 && (y[i - 1] - mid) * (y[i] - mid) <= 0 && y[i] !== y[i - 1]) lastCross = i;
    const s = y[i] > L(0.5 + h) ? 1 : y[i] < L(0.5 - h) ? -1 : 0;
    if (s && s !== state) {
      if (state && lastCross > 0) {
        const kind = s > 0 ? 'rise' : 'fall';
        const t = at(x, y, lastCross, mid);
        // (back to the crossing of the near level, on to the far one)
        const [first, last] = kind === 'rise' ? [L(lo), L(hi)] : [L(hi), L(lo)];
        let a = lastCross;
        while (a > 1 && (kind === 'rise' ? y[a - 1] > first : y[a - 1] < first)) a--;
        let b = lastCross;
        while (b < n - 1 && (kind === 'rise' ? y[b] < last : y[b] > last)) b++;
        const tLo = a > 0 ? at(x, y, a, first) : NaN;
        const tHi = b > 0 && b < n ? at(x, y, b, last) : NaN;
        edges.push({ kind, t, i: lastCross, tLo, tHi, dur: tHi - tLo, overshoot: NaN, settle: NaN });
      }
      state = s;
    }
  }
  // (the overshoot and the settling: on the part to the next edge)
  edges.forEach((e, k) => {
    const end = k + 1 < edges.length ? edges[k + 1].i : n;
    const target = e.kind === 'rise' ? top : base;
    let ext = target;
    let settledFrom = -1;
    for (let i = e.i; i < end; i++) {
      ext = e.kind === 'rise' ? Math.max(ext, y[i]) : Math.min(ext, y[i]);
      if (Math.abs(y[i] - target) > tol * Math.abs(amp)) settledFrom = -1;
      else if (settledFrom < 0) settledFrom = i;
    }
    e.overshoot = (100 * Math.abs(ext - target)) / Math.abs(amp);
    e.settle = settledFrom >= 0 && k + 1 < edges.length ? x[settledFrom] - e.t : settledFrom >= 0 ? x[settledFrom] - e.t : NaN;
  });
  // (the period from the edges of a kind; the widths from a rise to the next fall and back)
  const diffs = (kind: 'rise' | 'fall') => {
    const t = edges.filter((e) => e.kind === kind).map((e) => e.t);
    return t.slice(1).map((v, j) => v - t[j]);
  };
  const per = [...diffs('rise'), ...diffs('fall')];
  const period = per.length ? per.reduce((s, v) => s + v, 0) / per.length : NaN;
  const pos: number[] = [];
  const neg: number[] = [];
  for (let k = 0; k + 1 < edges.length; k++) (edges[k].kind === 'rise' ? pos : neg).push(edges[k + 1].t - edges[k].t);
  const posWidth = pos.length ? pos.reduce((s, v) => s + v, 0) / pos.length : NaN;
  const negWidth = neg.length ? neg.reduce((s, v) => s + v, 0) / neg.length : NaN;
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const rms = Math.sqrt(y.reduce((s, v) => s + v * v, 0) / n);
  const acRms = Math.sqrt(y.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  let [mn, mx] = [Infinity, -Infinity];
  for (const v of y) [mn, mx] = [Math.min(mn, v), Math.max(mx, v)];
  let crossings = 0;
  for (let i = 1; i < n; i++) if ((y[i - 1] - mean) * (y[i] - mean) < 0) crossings++;
  return { base, top, amp, edges, period, posWidth, negWidth, duty: (100 * posWidth) / period, mean, rms, acRms, pp: mx - mn, crest: Math.max(Math.abs(mn), Math.abs(mx)) / rms, crossings };
}

// ---- change points ----
export type CostKind = 'mean' | 'meanvar';
// the cost of every segment [a, b) from the cumulative sums: a change of the mean (the squared deviations, L2), or of
// the mean and the variance (n · ln σ²)
function costOf(y: number[], kind: CostKind) {
  const n = y.length;
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    s1[i + 1] = s1[i] + y[i];
    s2[i + 1] = s2[i] + y[i] * y[i];
  }
  return (a: number, b: number) => {
    const m = b - a;
    const sum = s1[b] - s1[a];
    const sse = Math.max(0, s2[b] - s2[a] - (sum * sum) / m);
    // (the variance with a small bias 10⁻⁶ against a segment of equal values, as ruptures)
    return kind === 'mean' ? sse : m * Math.log(sse / m + 1e-6);
  };
}
// PELT: the change points (the first index of every new segment) minimizing Σ (cost + pen) over the segments, every
// segment at least minSize points (exact; the candidates that can no longer be the last change pruned, as ruptures)
export function pelt(y: number[], kind: CostKind, pen: number, minSize = 2): number[] {
  const n = y.length;
  const c = costOf(y, kind);
  const m = Math.max(1, minSize);
  const F = new Float64Array(n + 1).fill(NaN);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = 0;
  let adm: number[] = [];
  for (let t = m; t <= n; t++) {
    adm.push(t - m);
    let best = Infinity;
    let arg = -1;
    const vals = new Map<number, number>();
    for (const s of adm) {
      if (!Number.isFinite(F[s])) continue;
      const v = F[s] + c(s, t) + pen;
      vals.set(s, v);
      if (v < best) [best, arg] = [v, s];
    }
    F[t] = best;
    last[t] = arg;
    adm = adm.filter((s) => !vals.has(s) || vals.get(s)! <= best + pen);
  }
  const cps: number[] = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  return cps.reverse();
}
// binary segmentation: the best split of the segment that gains the most, while the gain is more than pen (or until
// `count` changes)
export function binseg(y: number[], kind: CostKind, pen: number, minSize = 2, count = Infinity): number[] {
  const n = y.length;
  const c = costOf(y, kind);
  const best = (a: number, b: number) => {
    let [g, at0] = [-Infinity, -1];
    for (let t = a + minSize; t <= b - minSize; t++) {
      const v = c(a, b) - c(a, t) - c(t, b);
      if (v > g) [g, at0] = [v, t];
    }
    return { g, at: at0 };
  };
  const cps: number[] = [];
  let segs: [number, number][] = [[0, n]];
  while (cps.length < count) {
    let top = { g: -Infinity, at: -1, seg: -1 };
    segs.forEach(([a, b], k) => {
      const r = best(a, b);
      if (r.g > top.g) top = { ...r, seg: k };
    });
    if (top.at < 0 || (count === Infinity && top.g <= pen)) break;
    const [a, b] = segs[top.seg];
    segs = [...segs.slice(0, top.seg), [a, top.at], [top.at, b], ...segs.slice(top.seg + 1)];
    cps.push(top.at);
  }
  return cps.sort((p, q) => p - q);
}
// the noise σ from the differences of neighbours (their MAD / 0.6745 / √2): not raised by the steps themselves
export function noiseSigma(y: number[]): number {
  const d = y.slice(1).map((v, i) => v - y[i]);
  const m = medianOf(d);
  return medianOf(d.map((v) => Math.abs(v - m))) / 0.6744897501960817 / Math.SQRT2;
}

// ---- triggers and averaging ----
// The crossings of a level (rising or falling), at least `gap` apart in X; linear between the samples
export function crossingsOf(x: number[], y: number[], level: number, dir: 'rising' | 'falling', gap = 0): number[] {
  const out: number[] = [];
  for (let i = 1; i < x.length; i++) {
    const up = y[i - 1] < level && y[i] >= level;
    const down = y[i - 1] > level && y[i] <= level;
    if ((dir === 'rising' && up) || (dir === 'falling' && down)) {
      const t = at(x, y, i, level);
      if (!out.length || t - out[out.length - 1] >= gap) out.push(t);
    }
  }
  return out;
}
// The segments of a signal around every trigger, read on a common lag (−before … after, every `step`) by straight lines
// (a segment that does not reach both ends left out); a baseline of each (its mean before 0) subtracted if asked; the
// mean, SD, SE, N at every lag
export function averageAround(x: number[], y: number[], triggers: number[], before: number, after: number, step: number, base: boolean): { lag: number[]; segs: number[][]; used: number[]; mean: number[]; sd: number[]; se: number[]; n: number[] } {
  const m = Math.max(2, Math.round((before + after) / step) + 1);
  const lag = Array.from({ length: m }, (_, k) => -before + (k * (before + after)) / (m - 1));
  const read = (t: number) => {
    if (t < x[0] || t > x[x.length - 1]) return NaN;
    let [lo, hi] = [0, x.length - 1];
    while (hi - lo > 1) {
      const c = (lo + hi) >> 1;
      if (x[c] <= t) lo = c;
      else hi = c;
    }
    return y[lo] + ((t - x[lo]) * (y[hi] - y[lo])) / (x[hi] - x[lo] || 1);
  };
  const segs: number[][] = [];
  const used: number[] = [];
  for (const t of triggers) {
    if (t - before < x[0] || t + after > x[x.length - 1]) continue;
    let s = lag.map((l) => read(t + l));
    if (base) {
      const pre = s.filter((_, k) => lag[k] < 0);
      const b = pre.length ? pre.reduce((a, v) => a + v, 0) / pre.length : 0;
      s = s.map((v) => v - b);
    }
    segs.push(s);
    used.push(t);
  }
  const N = segs.length;
  const mean = lag.map((_, k) => segs.reduce((a, s) => a + s[k], 0) / N);
  const sd = lag.map((_, k) => (N > 1 ? Math.sqrt(segs.reduce((a, s) => a + (s[k] - mean[k]) ** 2, 0) / (N - 1)) : NaN));
  return { lag, segs, used, mean, sd, se: sd.map((v) => v / Math.sqrt(N)), n: lag.map(() => N) };
}

// ---- the Hampel filter ----
// a point farther than t scaled MADs from the median of its window (±k points) replaced by that median
export function hampel(y: number[], k: number, t: number): { y: number[]; out: number[] } {
  const n = y.length;
  const res = y.slice();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = y.slice(Math.max(0, i - k), Math.min(n, i + k + 1));
    const m = medianOf(w);
    const s = 1.4826 * medianOf(w.map((v) => Math.abs(v - m)));
    if (Math.abs(y[i] - m) > t * s) {
      res[i] = m;
      out.push(i);
    }
  }
  return { y: res, out };
}

// ---- the Lomb–Scargle periodogram ----
// The generalised one (Zechmeister and Kürster 2009: a sine and an offset fitted at every frequency, X uneven), its
// power normalised 1 − χ²/χ²₀ (0 … 1, as astropy's "standard" with the mean fitted) and the amplitude of the sine
export function lombScargle(t: number[], y: number[], freqs: number[]): { power: number[]; amp: number[] } {
  const n = t.length;
  const Y = y.reduce((s, v) => s + v, 0) / n;
  const YY = y.reduce((s, v) => s + (v - Y) ** 2, 0) / n;
  const power: number[] = [];
  const amp: number[] = [];
  for (const f of freqs) {
    const w = 2 * Math.PI * f;
    let [C, S, YC, YS, CC, SS, CS] = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const c = Math.cos(w * t[i]);
      const s = Math.sin(w * t[i]);
      const v = y[i] - Y;
      C += c;
      S += s;
      YC += v * c;
      YS += v * s;
      CC += c * c;
      SS += s * s;
      CS += c * s;
    }
    [C, S, YC, YS, CC, SS, CS] = [C / n, S / n, YC / n, YS / n, CC / n, SS / n, CS / n];
    // (YC and YS: of y − its mean, the products with C and S gone)
    const [cc, ss, cs] = [CC - C * C, SS - S * S, CS - C * S];
    const D = cc * ss - cs * cs;
    power.push(D > 0 && YY > 0 ? (ss * YC * YC + cc * YS * YS - 2 * cs * YC * YS) / (YY * D) : NaN);
    const a = (YC * ss - YS * cs) / D;
    const b = (YS * cc - YC * cs) / D;
    amp.push(D > 0 ? Math.hypot(a, b) : NaN);
  }
  return { power, amp };
}
// The frequencies (as astropy’s autofrequency): a step of 1/(points per peak · T) from half of it up to the mean
// Nyquist frequency N/(2T) (or from … to)
export function lsFrequencies(t: number[], over: number, from: number, to: number): number[] {
  const T = Math.max(...t) - Math.min(...t);
  const df = 1 / (over * T);
  const f0 = Number.isFinite(from) && from > 0 ? from : df / 2;
  const f1 = Number.isFinite(to) && to > f0 ? to : t.length / (2 * T);
  const m = Math.min(100000, 1 + Math.round((f1 - f0) / df));
  return Array.from({ length: m }, (_, k) => f0 + k * df);
}
// The false-alarm probability of a peak of power z (normalised as above) among the frequencies up to fmax: Baluev
// (2008), as astropy's "baluev": 1 − (1 − P₁) e^(−τ), P₁ = (1 − z)^((N − 3)/2) that of one frequency, τ from the
// effective span of the times
export function lsFap(z: number, t: number[], fmax: number): number {
  const N = t.length;
  const [NH, NK] = [N - 1, N - 3];
  const m = t.reduce((s, v) => s + v, 0) / N;
  const Teff = Math.sqrt(4 * Math.PI * (t.reduce((s, v) => s + v * v, 0) / N - m * m));
  const gam = Math.sqrt(2 / NH) * Math.exp(lgamma(NH / 2) - lgamma((NH - 1) / 2));
  const tau = gam * fmax * Teff * (1 - z) ** (0.5 * (NK - 1)) * Math.sqrt(0.5 * NH * z);
  const single = (1 - z) ** (0.5 * NK);
  return -Math.expm1(-tau) + single * Math.exp(-tau);
}
// the power whose false-alarm probability is p (bisection)
export function lsLevel(p: number, t: number[], fmax: number): number {
  let [lo, hi] = [0, 1];
  for (let it = 0; it < 60; it++) {
    const m = (lo + hi) / 2;
    if (lsFap(m, t, fmax) > p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// ---- harmonics: THD, SNR, SINAD, ENOB, SFDR ----
// As MATLAB's thd, snr and sinad: the periodogram with a Kaiser window (β 38, leakage below the noise of any
// converter), the power of the fundamental and of every harmonic summed over its main lobe (±13 bins), the harmonics
// above the Nyquist frequency folded back; the noise: the mean of the other bins, over the whole band
const besselI0 = (x: number) => {
  let [s, term] = [1, 1];
  for (let k = 1; k < 500; k++) {
    term *= (x / (2 * k)) ** 2;
    s += term;
    if (term < 1e-17 * s) break;
  }
  return s;
};
export type Harmonic = { k: number; f: number; amp: number; dbc: number; aliased: boolean; overlap: boolean };
export type HarmonicsResult = { f: number[]; db: number[]; harmonics: Harmonic[]; thd: number; thdPct: number; snr: number; sinad: number; enob: number; sfdr: number; noise: number; f0: number };
export function harmonics(y0: number[], dx: number, nHarm: number, f0Given: number): HarmonicsResult | string {
  const N = y0.length;
  if (N < 64) return 'Harmonics: at least 64 points.';
  const mean = y0.reduce((s, v) => s + v, 0) / N;
  const beta = 38;
  const i0b = besselI0(beta);
  const w = Array.from({ length: N }, (_, i) => besselI0(beta * Math.sqrt(Math.max(0, 1 - ((2 * i) / (N - 1) - 1) ** 2))) / i0b);
  const sw2 = w.reduce((s, v) => s + v * v, 0);
  const [Xr, Xi] = fft(
    y0.map((v, i) => (v - mean) * w[i]),
    y0.map(() => 0),
  );
  const half = Math.floor(N / 2);
  // (the mean square in every bin, one-sided)
  const P = Array.from({ length: half + 1 }, (_, k) => ((k === 0 || (N % 2 === 0 && k === half) ? 1 : 2) * (Xr[k] ** 2 + Xi[k] ** 2)) / (N * sw2));
  const df = 1 / (N * dx);
  const W = Math.ceil(Math.sqrt(1 + (beta / Math.PI) ** 2)) + 1;
  const band = (c: number): [number, number] => [Math.max(0, c - W), Math.min(half, c + W)];
  const sumOf = ([a, b]: [number, number]) => {
    let s = 0;
    for (let k = a; k <= b; k++) s += P[k];
    return s;
  };
  const peakNear = (c: number, r: number) => {
    let best = Math.max(0, Math.min(half, c));
    for (let k = Math.max(0, c - r); k <= Math.min(half, c + r); k++) if (P[k] > P[best]) best = k;
    return best;
  };
  let k1: number;
  if (Number.isFinite(f0Given) && f0Given > 0) k1 = peakNear(Math.round(f0Given / df), W);
  else {
    k1 = W + 1;
    for (let k = W + 1; k <= half; k++) if (P[k] > P[k1]) k1 = k;
  }
  if (k1 <= W) return 'Harmonics: the fundamental is too close to 0 (fewer than 14 bins: a longer record).';
  const b1 = band(k1);
  const P1 = sumOf(b1);
  let c1 = 0;
  for (let k = b1[0]; k <= b1[1]; k++) c1 += k * P[k];
  const f0 = (c1 / P1) * df;
  const fs = 1 / dx;
  const used: [number, number][] = [[0, W], b1];
  const hs: Harmonic[] = [{ k: 1, f: f0, amp: Math.sqrt(2 * P1), dbc: 0, aliased: false, overlap: false }];
  let ph = 0;
  for (let h = 2; h <= nHarm; h++) {
    let fa = (h * f0) % fs;
    const aliased = h * f0 > fs / 2;
    if (fa > fs / 2) fa = fs - fa;
    const kh = peakNear(Math.round(fa / df), 2);
    const bh = band(kh);
    const overlap = used.some(([a, b]) => bh[0] <= b && bh[1] >= a);
    const p = overlap ? NaN : sumOf(bh);
    if (!overlap) {
      used.push(bh);
      ph += p;
    }
    hs.push({ k: h, f: fa, amp: Math.sqrt(2 * p), dbc: 10 * Math.log10(p / P1), aliased, overlap });
  }
  // (the noise: the mean of the bins left, over every bin but those of 0 Hz)
  const free = P.map((_, k) => !used.some(([a, b]) => k >= a && k <= b));
  const nFree = free.filter(Boolean).length;
  const dens = P.reduce((s, v, k) => s + (free[k] ? v : 0), 0) / Math.max(1, nFree);
  const noise = dens * (half - W);
  const total = P.reduce((s, v) => s + v, 0) - sumOf([0, W]);
  // (the largest spur: the bins outside 0 Hz and the fundamental)
  let spur = -1;
  for (let k = W + 1; k <= half; k++) if ((k < b1[0] || k > b1[1]) && (spur < 0 || P[k] > P[spur])) spur = k;
  const bs = band(Math.max(spur, 0));
  let sp = 0;
  for (let k = Math.max(bs[0], W + 1); k <= bs[1]; k++) if (k < b1[0] || k > b1[1]) sp += P[k];
  const sinad = 10 * Math.log10(P1 / (total - P1));
  return {
    f: P.map((_, k) => k * df),
    db: P.map((v) => 10 * Math.log10(v)),
    harmonics: hs,
    thd: 10 * Math.log10(ph / P1),
    thdPct: 100 * Math.sqrt(ph / P1),
    snr: 10 * Math.log10(P1 / noise),
    sinad,
    enob: (sinad - 1.76) / 6.02,
    sfdr: 10 * Math.log10(P1 / sp),
    noise: Math.sqrt(noise),
    f0,
  };
}
