// The limits of the axes of a figure changed by zoom and pan (FigureZoom): the frame under the mouse with its scales,
// and a Plot's axes with new limits.
import { axesGeometry, type Box, type Scale } from '../figure/axes.ts';
import { axesStyle, axisKind, type AxesFig, type AxesStyle, type Figure } from '../figure/spec.ts';

// The nodes that draw a whole figure from their own axes (1D plot, Histogram, Bar chart): zoom, pan and rescale change
// those axes.
const FIGURE_NODES = new Set(['plot1d', 'histogram', 'barchart', 'boxviolin', 'probplot', 'blandaltman', 'pie', 'contour', 'polar']);
export const figureAxesOf = (n: { type?: string; data: unknown } | undefined): { axes?: Partial<AxesStyle> } | null => (n?.type && FIGURE_NODES.has(n.type) ? (n.data as { axes?: Partial<AxesStyle> }) : null);

export type Hit = { ax: AxesFig; frame: Box; scales: Map<string, Scale>; xKeys: string[]; yKeys: string[] };
export type Ranges = Record<string, [number, number]>;

// The frame under a point (pt) and its scales.
export function hitAt(fig: Figure, W: number, H: number, x: number, y: number): Hit | null {
  for (let k = fig.axes.length - 1; k >= 0; k--) {
    const ax = fig.axes[k];
    if (ax.drawing) continue;
    const p = ax.style.pos;
    const frame = { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H };
    if (x < frame.x || x > frame.x + frame.w || y < frame.y || y > frame.y + frame.h) continue;
    const st = ax.style;
    const { scales } = axesGeometry(ax, frame, ax.text ?? fig.text);
    const xKeys = ['bottom', ...(st.top.mode === 'own' ? ['top'] : []), ...st.extra.filter((e) => axisKind(e.side) === 'x').map((e) => e.id)];
    const yKeys = ['left', ...(st.right.mode === 'own' ? ['right'] : []), ...st.extra.filter((e) => axisKind(e.side) === 'y').map((e) => e.id)];
    return { ax, frame, scales, xKeys, yKeys };
  }
  return null;
}
// the limits between two places (pt) on a scale, in order
export const between = (s: Scale, a: number, b: number): [number, number] => {
  const [u, v] = [s.inv(a), s.inv(b)];
  return u < v ? [u, v] : [v, u];
};
const clean = (v: number) => +v.toPrecision(7);

// The axes of a Plot with new limits (NaN: automatic) on the scales named.
export function withRanges(axes: Partial<AxesStyle> | undefined, r: Ranges): Partial<AxesStyle> {
  const st = axesStyle(axes);
  const lim = <T extends { min: number; max: number }>(spec: T, key: string): T => (r[key] ? { ...spec, min: clean(r[key][0]), max: clean(r[key][1]) } : spec);
  return {
    ...axes,
    x: lim(st.x, 'bottom'),
    y: lim(st.y, 'left'),
    top: { ...st.top, scale: lim(st.top.scale, 'top') },
    right: { ...st.right, scale: lim(st.right.scale, 'right') },
    extra: st.extra.map((e) => ({ ...e, scale: lim(e.scale, e.id) })),
  };
}

// The axes of a Plot with every limit automatic again (Rescale).
export function autoRanges(axes: Partial<AxesStyle> | undefined, which: 'both' | 'x' | 'y' = 'both'): Partial<AxesStyle> {
  const st = axesStyle(axes);
  // the axes of X (bottom, top, the extra X) or of Y (left, right, the extra Y), or all
  const xs = ['bottom', 'top', ...st.extra.filter((e) => axisKind(e.side) === 'x').map((e) => e.id)];
  const ys = ['left', 'right', ...st.extra.filter((e) => axisKind(e.side) === 'y').map((e) => e.id)];
  const keys = which === 'x' ? xs : which === 'y' ? ys : [...xs, ...ys];
  return withRanges(axes, Object.fromEntries(keys.map((k) => [k, [NaN, NaN] as [number, number]])));
}

// Zoom out: every frame of the figure, every axis of it widened f times around its middle — the new limits of each Plot.
export function zoomOutRanges(fig: Figure, W: number, H: number, f: number): { node?: string; ranges: Ranges }[] {
  return fig.axes.flatMap((ax) => {
    const p = ax.style.pos;
    const hit = hitAt(fig, W, H, ((p.x + p.w / 2) / 100) * W, ((p.y + p.h / 2) / 100) * H);
    if (!hit || hit.ax !== ax) return [];
    const { frame: fr, scales } = hit;
    const ranges: Ranges = {};
    const [cx, cy] = [fr.x + fr.w / 2, fr.y + fr.h / 2];
    for (const key of hit.xKeys) ranges[key] = between(scales.get(key)!, cx - (fr.w / 2) * f, cx + (fr.w / 2) * f);
    for (const key of hit.yKeys) ranges[key] = between(scales.get(key)!, cy + (fr.h / 2) * f, cy - (fr.h / 2) * f);
    return [{ node: ax.node, ranges }];
  });
}

// a 3D view in the figure (a Merge may hold several): turned with the mouse (FigureRotate)
export const hasThree = (fig: Figure) => fig.axes.some((a) => a.curves.some((c) => c.three?.node));

// the curves shown on a figure (key, name), for the choice of the curve the data reader reads
export const readableCurves = (fig: Figure): [string, string][] =>
  fig.axes.flatMap((ax, a) => ax.curves.filter((c) => c.style.show !== false).map((c): [string, string] => [readKey(a, c.key), `${fig.axes.length > 1 ? `${a + 1}: ` : ''}${c.label || c.series.y.name}`]));
// a curve of a figure for the reader: its frame and its key
export const readKey = (axes: number, key: string) => `${axes}|${key}`;
