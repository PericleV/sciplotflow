// Canny edges (as scikit-image's canny): the image smoothed by a Gaussian of σ (the edge as zeros, corrected by the
// smoothed mask), its Sobel gradient, the thin ridges kept (non-maximum suppression, read between the neighbours along
// the gradient), then the edges above `high` with what joins them above `low` (hysteresis, 8-connected). Pure.
import { gaussKernel, map1, reflect } from './raster.ts';
import { label } from './morph.ts';

// a channel filtered by kx along the rows, ky along the columns, the edge as zeros (scipy 'constant')
function separableZero(c: Float32Array, w: number, h: number, kx: Float64Array, ky: Float64Array): Float64Array {
  const a = new Float64Array(w * h);
  const rx = kx.length >> 1;
  const ry = ky.length >> 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < kx.length; j++) {
        const xx = x + j - rx;
        if (xx >= 0 && xx < w) s += kx[j] * c[y * w + xx];
      }
      a[y * w + x] = s;
    }
  const b = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < ky.length; j++) {
        const yy = y + j - ry;
        if (yy >= 0 && yy < h) s += ky[j] * a[yy * w + x];
      }
      b[y * w + x] = s;
    }
  return b;
}

// low / high: thresholds of the gradient magnitude (absent: 0.1 and 0.2 of `full`, the image's largest possible value)
export function canny(c: Float32Array, w: number, h: number, sigma: number, low: number, high: number): Float32Array {
  const g = gaussKernel(sigma);
  const num = separableZero(c, w, h, g, g);
  const den = separableZero(new Float32Array(w * h).fill(1), w, h, g, g);
  const sm = Float64Array.from(num, (v, i) => (den[i] ? v / den[i] : 0));
  // Sobel (scipy.ndimage.sobel: the edge mirrored): isobel along the rows' direction (axis 0), jsobel along x
  const at = (x: number, y: number) => sm[reflect(y, h) * w + reflect(x, w)];
  const iso = new Float64Array(w * h);
  const jso = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      jso[y * w + x] = at(x + 1, y - 1) - at(x - 1, y - 1) + 2 * (at(x + 1, y) - at(x - 1, y)) + at(x + 1, y + 1) - at(x - 1, y + 1);
      iso[y * w + x] = at(x - 1, y + 1) - at(x - 1, y - 1) + 2 * (at(x, y + 1) - at(x, y - 1)) + at(x + 1, y + 1) - at(x + 1, y - 1);
    }
  const mag = Float64Array.from(iso, (v, i) => Math.hypot(v, jso[i]));
  const M = (x: number, y: number) => mag[y * w + x];
  // non-maximum suppression, the border pixel left out
  const keep = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (!(m >= low) || m === 0) continue;
      const is = iso[i];
      const js = jso[i];
      const ai = Math.abs(is);
      const aj = Math.abs(js);
      let wgt: number;
      let n11: number;
      let n12: number;
      let n21: number;
      let n22: number;
      if ((is >= 0 && js >= 0) || (is <= 0 && js <= 0)) {
        if (ai >= aj) {
          wgt = aj / ai;
          [n11, n12, n21, n22] = [M(x, y + 1), M(x + 1, y + 1), M(x, y - 1), M(x - 1, y - 1)];
        } else {
          wgt = ai / aj;
          [n11, n12, n21, n22] = [M(x + 1, y), M(x + 1, y + 1), M(x - 1, y), M(x - 1, y - 1)];
        }
      } else if (ai <= aj) {
        wgt = ai / aj;
        [n11, n12, n21, n22] = [M(x + 1, y), M(x + 1, y - 1), M(x - 1, y), M(x - 1, y + 1)];
      } else {
        wgt = aj / ai;
        [n11, n12, n21, n22] = [M(x, y - 1), M(x + 1, y - 1), M(x, y + 1), M(x - 1, y + 1)];
      }
      const cPlus = n12 * wgt + n11 * (1 - wgt);
      const cMinus = n22 * wgt + n21 * (1 - wgt);
      if (m >= cPlus && m >= cMinus) keep[i] = 1;
    }
  // hysteresis: the pieces above low that reach high
  const { labels, count } = label(keep, w, h, true);
  const strong = new Uint8Array(count + 1);
  for (let i = 0; i < w * h; i++) if (keep[i] && mag[i] >= high) strong[labels[i]] = 1;
  return map1(labels, (l) => (l && strong[l] ? 1 : 0));
}
