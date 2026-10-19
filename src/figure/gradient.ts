// The gradient of a filled shape, placed in its box (as Affinity's gradient tool): linear from a start point to an end
// point, radial from a centre out to an ellipse (a radius across and one down) — all in % of the shape's box (0: its left
// or top, 100: its right or bottom; the radii in % of its half width and half height). Without places: linear across
// the box at gradAngle degrees, radial from the middle out to the sides.
import type { ShapeSpec } from './spec.ts';

type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

// the start and end of a linear gradient (% of the box)
export function linearEnds(s: ShapeSpec): [Pt, Pt] {
  const a = ((s.gradAngle ?? 90) * Math.PI) / 180;
  const [c, sn] = [50 * Math.cos(a), 50 * Math.sin(a)];
  const r = (v: number) => Math.round(v * 100) / 100;
  return [
    [s.gradX1 ?? r(50 - c), s.gradY1 ?? r(50 - sn)],
    [s.gradX2 ?? r(50 + c), s.gradY2 ?? r(50 + sn)],
  ];
}
// the centre of a radial gradient (% of the box) and its radii (% of the half width, % of the half height)
export function radialPlace(s: ShapeSpec): { cx: number; cy: number; rx: number; ry: number } {
  const rx = s.gradR ?? 100;
  return { cx: s.gradCx ?? 50, cy: s.gradCy ?? 50, rx, ry: s.gradR2 ?? rx };
}
// % of the box ↔ pt
export const inBox = (b: Box, [u, v]: Pt): Pt => [b.x + (u / 100) * b.w, b.y + (v / 100) * b.h];

// the SVG attributes of the gradient in the box (user space, pt), turned by `turn` (a transform) with the shape
export function gradAttrs(s: ShapeSpec, b: Box, turn?: string): Record<string, string | number | undefined> {
  const n2 = (v: number) => Math.round(v * 100) / 100;
  const spread = s.gradSpread && s.gradSpread !== 'pad' ? { spreadMethod: s.gradSpread } : {};
  if (s.grad === 'radial') {
    const g = radialPlace(s);
    const [cx, cy] = inBox(b, [g.cx, g.cy]);
    const rx = Math.max(1e-3, (Math.abs(g.rx) / 100) * (b.w / 2));
    const ry = Math.max(1e-3, (Math.abs(g.ry) / 100) * (b.h / 2));
    // a circle of radius rx, squeezed down to ry
    const squeeze = Math.abs(ry - rx) > 1e-6 ? `translate(${n2(cx)} ${n2(cy)}) scale(1 ${(ry / rx).toFixed(5)}) translate(${n2(-cx)} ${n2(-cy)})` : '';
    const t = [turn, squeeze].filter(Boolean).join(' ');
    return { gradientUnits: 'userSpaceOnUse', cx: n2(cx), cy: n2(cy), r: n2(rx), ...(t ? { gradientTransform: t } : {}), ...spread };
  }
  const [p, q] = linearEnds(s).map((e) => inBox(b, e));
  return { gradientUnits: 'userSpaceOnUse', x1: n2(p[0]), y1: n2(p[1]), x2: n2(q[0]), y2: n2(q[1]), ...(turn ? { gradientTransform: turn } : {}), ...spread };
}
// the gradient's places cleared (back to the angle, or from the middle out to the sides)
export const NO_GRAD_PLACE: Partial<ShapeSpec> = { gradX1: undefined, gradY1: undefined, gradX2: undefined, gradY2: undefined, gradCx: undefined, gradCy: undefined, gradR: undefined, gradR2: undefined };
