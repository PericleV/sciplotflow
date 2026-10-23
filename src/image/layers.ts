// Layers (Image analysis, a curiosity, a toggle): which particles lie on others. Where two particles touch, the one on
// top keeps its own outline there (its edge runs along its convex hull), the one under it is cut by it (its outline
// goes in, away from its hull); when that does not tell, the brighter one (an electron microscope shows the upper
// layer brighter). A particle's layer: 1 when nothing lies on it, else one more than the deepest of those on it. Pure.
import { convexHull, type Pt } from './roi.ts';

// an outline with a point every pixel or so along it
function dense(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    const [a, b] = [p[i], p[(i + 1) % p.length]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
const distToPoly = (poly: Pt[], [x, y]: Pt) => {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const [vx, vy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
  }
  return d;
};
const inside = (poly: Pt[], [x, y]: Pt) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// The layer of every particle (outlines in pixels of the image img, w × h) and the pairs found one on the other
// ([upper, lower])
export function estimateLayers(outlines: Pt[][], img: Float32Array | null, w: number, h: number, touch = 2.5): { layer: number[]; above: [number, number][] } {
  const n = outlines.length;
  const pts = outlines.map(dense);
  const hulls = outlines.map((o) => convexHull(o));
  const box = outlines.map((o) => [Math.min(...o.map((p) => p[0])), Math.min(...o.map((p) => p[1])), Math.max(...o.map((p) => p[0])), Math.max(...o.map((p) => p[1]))]);
  // the mean brightness inside every particle (sampled at its points pulled a little inwards)
  const bright = outlines.map((_, i) => {
    if (!img) return NaN;
    const [cx, cy] = [(box[i][0] + box[i][2]) / 2, (box[i][1] + box[i][3]) / 2];
    let [s, c] = [0, 0];
    for (const [x, y] of pts[i]) {
      const [px, py] = [Math.floor(cx + (x - cx) * 0.6), Math.floor(cy + (y - cy) * 0.6)];
      if (px >= 0 && py >= 0 && px < w && py < h) [s, c] = [s + img[py * w + px], c + 1];
    }
    return c ? s / c : NaN;
  });
  let [lo, hi] = [Infinity, -Infinity];
  if (img) for (const v of img) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  const above: [number, number][] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      if (box[a][0] > box[b][2] + touch || box[b][0] > box[a][2] + touch || box[a][1] > box[b][3] + touch || box[b][1] > box[a][3] + touch) continue;
      // (the points of each that touch the other, and how many of them lie on its own hull)
      const onHull = (i: number, j: number) => {
        const near = pts[i].filter((p) => distToPoly(outlines[j], p) <= touch || inside(outlines[j], p));
        if (near.length < 3) return NaN;
        return near.filter((p) => distToPoly(hulls[i], p) <= 1).length / near.length;
      };
      const [ca, cb] = [onHull(a, b), onHull(b, a)];
      if (!Number.isFinite(ca) || !Number.isFinite(cb)) continue;
      if (Math.abs(ca - cb) > 0.2) above.push(ca > cb ? [a, b] : [b, a]);
      else if (img && Math.abs(bright[a] - bright[b]) > 0.05 * (hi - lo || 1)) above.push(bright[a] > bright[b] ? [a, b] : [b, a]);
    }
  // (one more than the deepest on it; a loop of contradicting pairs: broken after n rounds)
  const layer = new Array(n).fill(1);
  for (let round = 0; round < n; round++) {
    let changed = false;
    for (const [u, l] of above)
      if (layer[l] < layer[u] + 1 && layer[u] + 1 <= n) {
        layer[l] = layer[u] + 1;
        changed = true;
      }
    if (!changed) break;
  }
  return { layer, above };
}
