// The residuals panel under a node's graph (Fit, Peak analyzer): data − fit at every point, around a zero line, with
// its title and its scale (± the largest residual) — shown or hidden by the node's Residuals button.
import { fmtNum } from '../engine/table.ts';
import { maxOf } from '../engine/minmax.ts';

export const RESID_TITLE = 'Residuals (data − fit)';

// px: the points' x on the canvas (outside [l, l + w]: left out), r: their residuals
export function drawResiduals(g: CanvasRenderingContext2D, box: { l: number; t: number; w: number; h: number }, px: number[], r: number[], color: string) {
  const { l, t, w, h } = box;
  g.strokeStyle = '#999999';
  g.lineWidth = 1;
  g.strokeRect(l + 0.5, t + 0.5, w, h);
  const m = Math.max(0, maxOf(r.filter(Number.isFinite).map(Math.abs))) || 1;
  const ry = (v: number) => t + h / 2 - (v / m) * (h / 2 - 3);
  g.fillStyle = '#cccccc';
  g.fillRect(l, ry(0), w, 1);
  g.fillStyle = color;
  px.forEach((x, k) => x >= l && x <= l + w && Number.isFinite(r[k]) && g.fillRect(x - 1, ry(r[k]) - 1, 2, 2));
  g.font = '9px system-ui, sans-serif';
  // the title, on a light ground over the points
  const tw = g.measureText(RESID_TITLE).width;
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  g.fillRect(l + 2, t + 2, tw + 6, 11);
  g.fillStyle = '#555555';
  g.textAlign = 'left';
  g.fillText(RESID_TITLE, l + 5, t + 10);
  // the scale: ± the largest, 0 at the line
  g.textAlign = 'right';
  g.fillText(`+${fmtNum(m, 3)}`, l - 4, t + 9);
  g.fillText('0', l - 4, ry(0) + 3);
  g.fillText(`−${fmtNum(m, 3)}`, l - 4, t + h - 2);
}
