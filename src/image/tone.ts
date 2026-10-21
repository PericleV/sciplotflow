// Tone and colour steps of the Image analysis node: values mapped one by one (brightness, contrast, min / max, levels,
// curves, log, invert), by the histogram (auto-contrast, equalisation, CLAHE), and the colour of RGB images (a channel,
// HSV, L*a*b*, gray with weights, saturation, hue, balance). Pure.
import { clamp, histogram, quantile, type Raster } from './raster.ts';

const span = (r: Raster) => r.hi - r.lo || 1;

export const brightness = (r: Raster, amount: number) => r.ch.map((c) => Float32Array.from(c, (v) => v + amount * span(r)));
export const contrast = (r: Raster, factor: number) => {
  const mid = (r.lo + r.hi) / 2;
  return r.ch.map((c) => Float32Array.from(c, (v) => mid + (v - mid) * factor));
};
// [min, max] stretched over the whole range, the rest clipped
export function minMax(r: Raster, min: number, max: number): Float32Array[] {
  const k = span(r) / (max - min || 1);
  return r.ch.map((c) => Float32Array.from(c, (v) => clamp(r.lo + (v - min) * k, r.lo, r.hi)));
}
// Levels: input black and white, gamma (> 1 lightens the middle), output black and white (in the image's values)
export function levels(r: Raster, inB: number, inW: number, gamma: number, outB: number, outW: number): Float32Array[] {
  const g = 1 / (gamma > 0 ? gamma : 1);
  return r.ch.map((c) =>
    Float32Array.from(c, (v) => {
      const t = clamp((v - inB) / (inW - inB || 1), 0, 1);
      return outB + Math.pow(t, g) * (outW - outB);
    }),
  );
}

// A monotone cubic through points (x, y) in 0 … 1 (Fritsch–Carlson: no overshoot), sorted by x; a function of t
export function monotoneCurve(pts: [number, number][]): (t: number) => number {
  const p = [...pts].filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])).sort((a, b) => a[0] - b[0]);
  if (p.length === 0) return (t) => t;
  if (p.length === 1) return () => p[0][1];
  const n = p.length;
  const dx = Array.from({ length: n - 1 }, (_, i) => p[i + 1][0] - p[i][0] || 1e-12);
  const sl = Array.from({ length: n - 1 }, (_, i) => (p[i + 1][1] - p[i][1]) / dx[i]);
  const m = Array.from({ length: n }, (_, i) => (i === 0 ? sl[0] : i === n - 1 ? sl[n - 2] : sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / sl[i];
    const b = m[i + 1] / sl[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * sl[i];
      m[i + 1] = t * b * sl[i];
    }
  }
  return (t) => {
    if (t <= p[0][0]) return p[0][1];
    if (t >= p[n - 1][0]) return p[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > p[i + 1][0]) i++;
    const hh = dx[i];
    const u = (t - p[i][0]) / hh;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * hh * m[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * hh * m[i + 1];
  };
}
// Curves: points (input, output) as fractions of the range; per channel, or the same for all (RGB: [all, R, G, B])
export function curves(r: Raster, all: [number, number][], per?: [number, number][][]): Float32Array[] {
  const f = monotoneCurve(all);
  return r.ch.map((c, k) => {
    const g = per?.[k]?.length ? monotoneCurve(per[k]) : null;
    return Float32Array.from(c, (v) => {
      let t = clamp(f((v - r.lo) / span(r)), 0, 1);
      if (g) t = clamp(g(t), 0, 1);
      return r.lo + t * span(r);
    });
  });
}
// Auto-contrast: the lowest and highest `saturated` % of the values (half at each end) clipped, the rest stretched
// (all channels together, from their luminance-free pooled values)
export function autoContrast(r: Raster, saturated: number): Float32Array[] {
  const all = new Float32Array(r.ch.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of r.ch) all.set(c, (o += c.length) - c.length);
  const q = clamp(saturated / 200, 0, 0.49);
  return minMax(r, quantile(all, q), quantile(all, 1 - q));
}
// Log: lo + span · ln(1 + k t) / ln(1 + k), t the value as a fraction of the range (k: its strength); exp: its inverse
export function logTone(r: Raster, k: number, inverse = false): Float32Array[] {
  const kk = k > 0 ? k : 10;
  const L = Math.log1p(kk);
  return r.ch.map((c) =>
    Float32Array.from(c, (v) => {
      const t = clamp((v - r.lo) / span(r), 0, 1);
      return r.lo + span(r) * (inverse ? Math.expm1(t * L) / kk : Math.log1p(kk * t) / L);
    }),
  );
}
export const invert = (r: Raster) => r.ch.map((c) => Float32Array.from(c, (v) => r.lo + r.hi - v));

// Equalisation (as scikit-image's equalize_hist): every value mapped by the cumulative histogram (256 bins over the
// data; whole numbers over < 256 levels: one bin per value), read between the bin centres
export function equalize(r: Raster): Float32Array[] {
  return r.ch.map((c) => {
    let lo = Infinity;
    let hi = -Infinity;
    let integer = true;
    for (const v of c) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      if (integer && v !== Math.round(v)) integer = false;
    }
    const bins = integer && hi - lo < 256 ? hi - lo + 1 : 256;
    const hst = integer && hi - lo < 256 ? (() => {
      const h = new Float64Array(bins);
      for (const v of c) h[v - lo]++;
      return h;
    })() : histogram(c, lo, hi, bins);
    const centers = Float64Array.from({ length: bins }, (_, k) => (integer && hi - lo < 256 ? lo + k : lo + ((k + 0.5) * (hi - lo)) / bins));
    const cdf = new Float64Array(bins);
    let s = 0;
    for (let k = 0; k < bins; k++) cdf[k] = s += hst[k];
    for (let k = 0; k < bins; k++) cdf[k] /= s;
    // numpy.interp: below the first centre the first value, above the last the last
    return Float32Array.from(c, (v) => {
      let t: number;
      if (v <= centers[0]) t = cdf[0];
      else if (v >= centers[bins - 1]) t = cdf[bins - 1];
      else {
        const f = ((v - centers[0]) / (centers[bins - 1] - centers[0])) * (bins - 1);
        const k = Math.min(bins - 2, Math.floor(f));
        t = cdf[k] + (cdf[k + 1] - cdf[k]) * (f - k);
      }
      return r.lo + t * span(r);
    });
  });
}

// CLAHE (Zuiderveld): the image in tiles (about `tile` px a side), each its histogram (bins over the range) clipped at
// clip × its mean count (the excess spread over all bins) and made a mapping; every pixel from the four tiles around
// it, bilinearly
export function clahe(r: Raster, tile: number, clip: number, bins = 256): Float32Array[] {
  const { w, h } = r;
  const nx = Math.max(1, Math.round(w / Math.max(4, tile)));
  const ny = Math.max(1, Math.round(h / Math.max(4, tile)));
  const tw = w / nx;
  const th = h / ny;
  const sp = span(r);
  const binOf = (v: number) => {
    const b = Math.floor(((v - r.lo) / sp) * bins);
    return b < 0 ? 0 : b >= bins ? bins - 1 : b;
  };
  return r.ch.map((c) => {
    const maps: Float64Array[] = [];
    for (let ty = 0; ty < ny; ty++)
      for (let tx = 0; tx < nx; tx++) {
        const hst = new Float64Array(bins);
        const x0 = Math.floor(tx * tw);
        const x1 = Math.floor((tx + 1) * tw);
        const y0 = Math.floor(ty * th);
        const y1 = Math.floor((ty + 1) * th);
        let n = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            hst[binOf(c[y * w + x])]++;
            n++;
          }
        const limit = Math.max(1, clip * (n / bins));
        let excess = 0;
        for (let k = 0; k < bins; k++)
          if (hst[k] > limit) {
            excess += hst[k] - limit;
            hst[k] = limit;
          }
        const add = excess / bins;
        const m = new Float64Array(bins);
        let s = 0;
        for (let k = 0; k < bins; k++) m[k] = s += hst[k] + add;
        for (let k = 0; k < bins; k++) m[k] = n ? m[k] / n : k / (bins - 1);
        maps.push(m);
      }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      // the tile centres around this row
      const fy = clamp((y + 0.5) / th - 0.5, 0, ny - 1);
      const ya = Math.floor(fy);
      const yb = Math.min(ny - 1, ya + 1);
      const wy = fy - ya;
      for (let x = 0; x < w; x++) {
        const fx = clamp((x + 0.5) / tw - 0.5, 0, nx - 1);
        const xa = Math.floor(fx);
        const xb = Math.min(nx - 1, xa + 1);
        const wx = fx - xa;
        const b = binOf(c[y * w + x]);
        const v =
          (1 - wy) * ((1 - wx) * maps[ya * nx + xa][b] + wx * maps[ya * nx + xb][b]) + wy * ((1 - wx) * maps[yb * nx + xa][b] + wx * maps[yb * nx + xb][b]);
        out[y * w + x] = r.lo + v * sp;
      }
    }
    return out;
  });
}

// ---- colour (RGB rasters; the values as fractions of the range) ----

// RGB (0 … 1) to HSV (each 0 … 1), as scikit-image's rgb2hsv
export function rgbToHsv(R: number, G: number, B: number): [number, number, number] {
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const d = mx - mn;
  const v = mx;
  const s = mx === 0 ? 0 : d / mx;
  let hh = 0;
  if (d !== 0) {
    // ties as scikit-image: B over G over R
    if (mx === B) hh = 4 + (R - G) / d;
    else if (mx === G) hh = 2 + (B - R) / d;
    else hh = (G - B) / d;
    hh = (hh / 6) % 1;
    if (hh < 0) hh += 1;
  }
  return [hh, s, v];
}
export function hsvToRgb(hh: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}
// sRGB (0 … 1) to CIE L*a*b* (D65, 2°), as scikit-image's rgb2lab
export function rgbToLab(R: number, G: number, B: number): [number, number, number] {
  const lin = (u: number) => (u > 0.04045 ? Math.pow((u + 0.055) / 1.055, 2.4) : u / 12.92);
  const [r, g, b] = [lin(R), lin(G), lin(B)];
  const X = (0.412453 * r + 0.35758 * g + 0.180423 * b) / 0.95047;
  const Y = 0.212671 * r + 0.71516 * g + 0.072169 * b;
  const Z = (0.019334 * r + 0.119193 * g + 0.950227 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  const L = Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y;
  return [L, 500 * (fx - fy), 200 * (fy - fz)];
}

export type ChannelPick = 'r' | 'g' | 'b' | 'h' | 's' | 'v' | 'L' | 'a' | 'bb' | 'luma' | 'average';
// One channel of an RGB raster as a gray one: R, G, B in the image's values; H, S, V in 0 … 1; L* 0 … 100, a* b*
// about −128 … 127; luminance (0.299, 0.587, 0.114) or the average of the three, in the image's values
export function pickChannel(r: Raster, which: ChannelPick): Raster {
  if (r.ch.length === 1) return r;
  const [R, G, B] = r.ch;
  const n = r.w * r.h;
  const sp = span(r);
  const out = new Float32Array(n);
  let lo = r.lo;
  let hi = r.hi;
  if (which === 'r' || which === 'g' || which === 'b') out.set(which === 'r' ? R : which === 'g' ? G : B);
  else if (which === 'luma') for (let i = 0; i < n; i++) out[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  else if (which === 'average') for (let i = 0; i < n; i++) out[i] = (R[i] + G[i] + B[i]) / 3;
  else if (which === 'h' || which === 's' || which === 'v') {
    const k = which === 'h' ? 0 : which === 's' ? 1 : 2;
    for (let i = 0; i < n; i++) out[i] = rgbToHsv((R[i] - r.lo) / sp, (G[i] - r.lo) / sp, (B[i] - r.lo) / sp)[k];
    [lo, hi] = [0, 1];
  } else {
    const k = which === 'L' ? 0 : which === 'a' ? 1 : 2;
    for (let i = 0; i < n; i++) out[i] = rgbToLab(clamp((R[i] - r.lo) / sp, 0, 1), clamp((G[i] - r.lo) / sp, 0, 1), clamp((B[i] - r.lo) / sp, 0, 1))[k];
    [lo, hi] = k === 0 ? [0, 100] : [-128, 127];
  }
  return { w: r.w, h: r.h, ch: [out], kind: 'gray', lo, hi };
}
// gray with weights of R, G, B (normalised to sum 1)
export function weightedGray(r: Raster, wr: number, wg: number, wb: number): Raster {
  if (r.ch.length === 1) return r;
  const s = wr + wg + wb || 1;
  const [R, G, B] = r.ch;
  return { ...r, kind: 'gray', ch: [Float32Array.from(R, (v, i) => (wr * v + wg * G[i] + wb * B[i]) / s)] };
}
// saturation × factor and hue + degrees, through HSV
export function hueSaturation(r: Raster, satFactor: number, hueShift: number): Float32Array[] {
  if (r.ch.length === 1) return r.ch;
  const [R, G, B] = r.ch;
  const sp = span(r);
  const out = [new Float32Array(R.length), new Float32Array(R.length), new Float32Array(R.length)];
  for (let i = 0; i < R.length; i++) {
    const [hh, s, v] = rgbToHsv((R[i] - r.lo) / sp, (G[i] - r.lo) / sp, (B[i] - r.lo) / sp);
    const [a, b, c] = hsvToRgb((((hh + hueShift / 360) % 1) + 1) % 1, clamp(s * satFactor, 0, 1), v);
    out[0][i] = r.lo + a * sp;
    out[1][i] = r.lo + b * sp;
    out[2][i] = r.lo + c * sp;
  }
  return out;
}
export const balance = (r: Raster, gains: [number, number, number]) => r.ch.map((c, k) => Float32Array.from(c, (v) => clamp(r.lo + (v - r.lo) * (gains[k] ?? 1), r.lo, r.hi)));
