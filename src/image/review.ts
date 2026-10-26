// Review of the particles found by any way (a threshold, the classifier of the pixels, Segment anything, seeds and
// rays): what is known of each (what the classifier of Learn from my choices learns from), and whether each is left
// out — by a click, by what was said of it, by what was learnt, by how sure Segment anything is of it.
import { fillPolygon, offsetOutline, pathLength, polygonArea, type Pt, type Roi } from './roi.ts';

export const PARTICLE_FEATURES = ['Size', 'Roundness', 'Mean', 'Contrast', 'Edges', 'Texture', 'Nearest', 'Sure'];
export const PARTICLE_FEATURE_TITLES = [
  'its area (log)',
  '4π · area / perimeter²: 1 a disc',
  'its mean brightness (of the image’s range)',
  'its mean against the ground around it (of the image’s range)',
  'how strong the edge is along its outline',
  'how much its brightness varies inside it',
  'the distance to the nearest other (in its radii)',
  'how sure the model is of it (Segment anything; else 1)',
];

// What is known of every particle (outlines in pixels of the image g, w × h, its values from lo to hi; scores: how sure
// Segment anything is of each, when it found them): the features above, in that order
export function particleFeatures(outlines: Pt[][], g: Float32Array, w: number, h: number, lo: number, hi: number, scores: (number | undefined)[]): number[][] {
  const range = hi - lo || 1;
  const cent: Pt[] = [];
  const radius: number[] = [];
  const rows = outlines.map((o, k) => {
    const area = Math.max(1, Math.abs(polygonArea(o)));
    const per = Math.max(1, pathLength(o, true));
    const inside = fillPolygon(o, w, h);
    let [n, s, s2, cx, cy] = [0, 0, 0, 0, 0];
    for (let y = 0; y < inside.h; y++)
      for (let x = 0; x < inside.w; x++) {
        if (!inside.m[y * inside.w + x]) continue;
        const v = g[(y + inside.y0) * w + x + inside.x0];
        [n, s, s2, cx, cy] = [n + 1, s + v, s2 + v * v, cx + x + inside.x0, cy + y + inside.y0];
      }
    const mean = n ? s / n : 0;
    const sd = n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0;
    cent.push(n ? [cx / n + 0.5, cy / n + 0.5] : o[0]);
    radius.push(Math.sqrt(area / Math.PI));
    // (the ground: a band around it, as wide as a sixth of its radius, at least 2 px)
    const band = fillPolygon(offsetOutline(o, Math.max(2, radius[k] / 6)), w, h);
    let [nb, sb] = [0, 0];
    for (let y = 0; y < band.h; y++)
      for (let x = 0; x < band.w; x++) {
        if (!band.m[y * band.w + x]) continue;
        const [X, Y] = [x + band.x0, y + band.y0];
        if (X >= inside.x0 && Y >= inside.y0 && X < inside.x0 + inside.w && Y < inside.y0 + inside.h && inside.m[(Y - inside.y0) * inside.w + X - inside.x0]) continue;
        nb++;
        sb += g[Y * w + X];
      }
    // (the edge: the gradient's size at the points of the outline)
    let [ne, se] = [0, 0];
    for (const [px, py] of o) {
      const [x, y] = [Math.round(px), Math.round(py)];
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      se += Math.hypot(g[y * w + x + 1] - g[y * w + x - 1], g[(y + 1) * w + x] - g[(y - 1) * w + x]) / 2;
      ne++;
    }
    return [Math.log(area), (4 * Math.PI * area) / (per * per), (mean - lo) / range, nb ? (mean - sb / nb) / range : 0, ne ? se / ne / range : 0, sd / range, 0, scores[k] ?? 1];
  });
  // (the nearest other: centre to centre, in radii of this one)
  rows.forEach((r, k) => {
    let d = Infinity;
    cent.forEach((c, j) => {
      if (j !== k) d = Math.min(d, Math.hypot(c[0] - cent[k][0], c[1] - cent[k][1]));
    });
    r[6] = Number.isFinite(d) ? Math.min(10, d / Math.max(1, radius[k])) : 10;
  });
  return rows;
}

// whether a particle found is left out, and why: said good, kept whatever else; said not good, left out; left out by a
// click; less probable than pmin by what was learnt; Segment anything less sure of it than sure
export type OutBy = NonNullable<Roi['out']>;
export function outOf(r: Roi, prob: number | undefined, pmin: number, sure: number): OutBy | undefined {
  if (r.said === true) return undefined;
  if (r.said === false) return 'said';
  if (r.out === 'hand') return 'hand';
  if (prob !== undefined && prob < pmin) return 'learnt';
  if (r.id.startsWith('s') && r.score !== undefined && r.score < sure) return 'score';
  return undefined;
}
