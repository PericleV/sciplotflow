// Points typed or placed on a figure (a fill line): “x, y; x, y …” ⇄ [x, y][].
export type Pt2 = [number, number];
export const parsePoints = (s: string): Pt2[] =>
  s
    .split(';')
    .map((p) => p.split(',').map((v) => Number(v.trim())))
    .filter((p): p is Pt2 => p.length === 2 && p.every(Number.isFinite));
export const pointsText = (p: Pt2[]) => p.map(([x, y]) => `${+x.toPrecision(6)}, ${+y.toPrecision(6)}`).join('; ');

