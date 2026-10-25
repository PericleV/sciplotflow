// Accuracy (Image analysis ▸ Objects): how well the particles found (by any method: Find particles, Find like this, the
// classifier) match those marked by hand as true, in the part of the image the marked ones cover (their box, grown by
// their mean radius). A particle found is right when it matches a true one: its centre inside the true one's outline, or
// the true one's centre inside its own; each true one matched once (the nearest first). Precision: the part of those
// found that are right; recall: the part of the true ones found; F1: their harmonic mean. Pure.
import type { Pt } from './roi.ts';

// a point inside an outline (even–odd)
function inPolygon(poly: Pt[], [x, y]: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const centreOf = (p: Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

export type AccuracyResult = { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; area: [number, number, number, number] };
export function accuracyOf(truth: Pt[][], found: Pt[][]): AccuracyResult | null {
  const marked = truth.filter((p) => p.length >= 3);
  if (!marked.length) return null;
  const cs = marked.map(centreOf);
  const radius = marked.reduce((s, p, k) => s + Math.max(...p.map(([x, y]) => Math.hypot(x - cs[k][0], y - cs[k][1]))), 0) / marked.length;
  const xs = marked.flat().map((q) => q[0]);
  const ys = marked.flat().map((q) => q[1]);
  const area: [number, number, number, number] = [Math.min(...xs) - radius, Math.min(...ys) - radius, Math.max(...xs) + radius, Math.max(...ys) + radius];
  const inArea = ([x, y]: Pt) => x >= area[0] && x <= area[2] && y >= area[1] && y <= area[3];
  const mine = found.filter((p) => p.length >= 3 && inArea(centreOf(p)));
  // (every pair that matches, the nearest first; each one used once)
  const pairs: { f: number; t: number; d: number }[] = [];
  mine.forEach((p, f) => {
    const c = centreOf(p);
    marked.forEach((q, t) => {
      if (inPolygon(q, c) || inPolygon(p, cs[t])) pairs.push({ f, t, d: Math.hypot(c[0] - cs[t][0], c[1] - cs[t][1]) });
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  const [usedF, usedT] = [new Set<number>(), new Set<number>()];
  for (const q of pairs)
    if (!usedF.has(q.f) && !usedT.has(q.t)) {
      usedF.add(q.f);
      usedT.add(q.t);
    }
  const tp = usedF.size;
  const fp = mine.length - tp;
  const fn = marked.length - tp;
  const precision = mine.length ? tp / mine.length : 0;
  const recall = tp / marked.length;
  return { tp, fp, fn, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, area };
}
