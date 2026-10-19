// Copy / paste of settings: a whole node's settings onto another node of the same kind (right-click menu), and the
// style of one curve onto another (in the Plot). Kept for the session (and in the browser, so it survives a reload).
import { useSyncExternalStore } from 'react';
import type { AppNode, NodeType } from '../types.ts';
import { axesStyle, type AxesStyle, type CurveStyle, type Side } from '../figure/spec.ts';

export type Clip = { kind: 'node'; type: NodeType; data: Record<string, unknown> } | { kind: 'curve'; style: Partial<CurveStyle> };
const KEY = 'graph-flow:clipboard';
let clip: Clip | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Clip | null;
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();
const set = (c: Clip) => {
  clip = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // storage unavailable: kept for this session only
  }
  listeners.forEach((l) => l());
};
export const useClipboard = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => clip,
  );

// What is copied of a node: its settings, not its data, links or place (the file of an Import, the column of an
// Extract, the label above it; a Plot keeps its annotations and the file name of its figure, a Merge its Plots).
const OWN: Partial<Record<NodeType, string[]>> = {
  import: ['text', 'textId', 'fileName', 'name'],
  extract: ['column', 'index'],
  plot1d: ['label', 'annotations'],
  canvas: ['name', 'items', 'annotations'],
};
// the parts of a Plot kept by the Plot pasted on: its frame's place, scales (they follow its data), extra axes and
// panel label; its legend entries (its own curves); its file name
const OWN_PART: Record<string, string[]> = { axes: ['pos', 'panelLabel', 'x', 'y', 'extra', 'free'], legend: ['entries'], page: ['name'] };
// A node's settings without its own data and place.
export function settingsOf(n: AppNode): Record<string, unknown> {
  const { caption: _c, collapsed: _k, ...rest } = structuredClone(n.data) as Record<string, unknown>;
  for (const k of OWN[n.type] ?? []) delete rest[k];
  if (n.type === 'plot1d' || n.type === 'histogram' || n.type === 'barchart' || n.type === 'boxviolin' || n.type === 'probplot' || n.type === 'blandaltman' || n.type === 'pie' || n.type === 'contour' || n.type === 'polar' || n.type === 'scattermatrix' || n.type === 'ternary' || n.type === 'waterfall' || n.type === 'plot3d')
    for (const [part, keys] of Object.entries(OWN_PART)) {
      const o = rest[part] as Record<string, unknown> | undefined;
      if (o) for (const k of keys) delete o[k];
    }
  return rest;
}
export const copySettings = (n: AppNode) => set({ kind: 'node', type: n.type, data: settingsOf(n) });
export const canPaste = (c: Clip | null, n: AppNode) => c?.kind === 'node' && c.type === n.type;
// The data of `n` with the copied settings (its own data kept). Plot: the rows' styles, not their legend texts.
export function pastedData(c: Clip | null, n: AppNode): Record<string, unknown> | null {
  if (!c || c.kind !== 'node' || c.type !== n.type) return null;
  const own = n.data as Record<string, unknown>;
  const data = { ...own, ...structuredClone(c.data) };
  if (n.type === 'plot1d') {
    // the parts are merged: what was not copied (the frame's place, the legend's entries …) stays
    for (const part of ['axes', 'legend', 'page'])
      if (own[part] && c.data[part]) data[part] = { ...(own[part] as object), ...(structuredClone(c.data[part]) as object) };
    // the Plot keeps its own axis titles
    if ((c.data.axes as { sides?: object } | undefined)?.sides) {
      const mine = axesStyle(own.axes as Partial<AxesStyle>);
      const st = data.axes as AxesStyle;
      st.sides = Object.fromEntries((Object.keys(st.sides) as Side[]).map((k) => [k, { ...st.sides[k], title: mine.sides[k].title }])) as AxesStyle['sides'];
    }
    if (c.data.rows || c.data.style) {
      const ownRows = (own as { rows?: { label: string }[] }).rows ?? [];
      const rows = (c.data.rows as { label: string; style: unknown }[] | undefined) ?? [];
      data.rows = rows.map((r, k) => ({ ...r, label: ownRows[k]?.label ?? '' }));
    }
    data.label = own.label;
  }
  return data;
}

export const copyCurveStyle = (style: Partial<CurveStyle>) => set({ kind: 'curve', style: structuredClone(style) });
export const curveClip = (c: Clip | null) => (c?.kind === 'curve' ? c.style : null);
