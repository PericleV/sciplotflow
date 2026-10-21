// The limits and the step of every axis of a Plot as they are drawn: what “auto” is in its Axes settings (Start, End,
// Every …), shown there in grey while those are left empty.
import { axesGeometry } from './axes.ts';
import { toPt, type Figure } from './spec.ts';

export type DrawnLimits = { lo: number; hi: number; step: number };

// node: the Plot (its own frame, not an inset drawn in it); by axis: bottom, left, top, right and the extra ones' ids
export function drawnLimits(fig: Figure, node: string): Record<string, DrawnLimits> {
  const ax = fig.axes.find((a) => a.node === node && !a.inset && !a.drawing && !a.overlay) ?? fig.axes.find((a) => !a.inset && !a.drawing && !a.overlay);
  if (!ax) return {};
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const p = ax.style.pos;
  const frame = { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H };
  const g = axesGeometry(ax, frame, ax.text ?? fig.text);
  const out: Record<string, DrawnLimits> = {};
  for (const d of g.drawn) {
    const sc = g.scales.get(d.key);
    // names or times: their limits are not typed as numbers
    if (!sc || sc.spec.cats?.length || sc.spec.time) continue;
    const m = d.pos.major;
    // the step between two numbers: of a linear axis only (a log axis has none)
    const step = sc.spec.scale === 'linear' && m.length > 1 ? +(m[1] - m[0]).toPrecision(10) : NaN;
    out[d.key] = { lo: sc.lo, hi: sc.hi, step };
  }
  return out;
}
