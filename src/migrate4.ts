// Project format 3 → 4: a 1D plot is a whole figure. The Axes it went into becomes its axes, the legend and the
// annotations set on that Axes become its own, and the Canvas its page when it held only this Axes (the Canvas goes);
// a Canvas of several Axes stays and takes the Plots' figures — in its grid when it had one, else each Plot on a page
// of the Canvas' size with its frame where it was. Several Plots into one Axes become one Plot (curves appended).
// Legends and annotations on the page go to a Plot (in % of its frame) or stay on the Canvas.
import type { Edge } from '@xyflow/react';

type Raw = { id: string; type: string; data: Record<string, unknown>; position?: { x: number; y: number }; parentId?: string };
type Pos = { x: number; y: number; w: number; h: number };
const ROW = /^(x|y|yerr|ylo|xerr|color|size|label|group|series)(?:-(\d+))?$/;
const handle = (port: string, k: number) => (k === 0 ? port : `${port}-${k}`);
const DEFAULT_POS: Pos = { x: 17, y: 5, w: 78, h: 74 };

export function plotsAsFigures(rawNodes: unknown, rawEdges: unknown): { nodes: Raw[]; edges: Edge[] } {
  let nodes = ((Array.isArray(rawNodes) ? rawNodes : []) as Raw[]).map((n) =>
    n?.type === 'subgraph' && n.data && typeof n.data === 'object' ? { ...n, data: { ...n.data, ...plotsAsFigures(n.data.nodes, n.data.edges) } } : n,
  );
  let edges = [...((Array.isArray(rawEdges) ? rawEdges : []) as Edge[])];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // a source seen through Reroutes
  const sourceOf = (e: Edge): string => {
    let id = e.source;
    for (let k = 0; k < 50 && byId.get(id)?.type === 'reroute'; k++) {
      const up = edges.find((x) => x.target === id);
      if (!up) break;
      id = up.source;
    }
    return id;
  };
  const gone = new Set<string>();
  const pageOf = (c: Raw) => {
    const d = c.data;
    return { width: d.width, height: d.height, unit: d.unit, font: d.font, size: d.size, bold: d.bold, italic: d.italic, textColor: d.textColor, background: d.background, border: d.border, borderColor: d.borderColor, dpi: d.dpi, name: d.name };
  };
  const toFrame = (v: number, p: Pos, axis: 'x' | 'y') => +(((v - (axis === 'x' ? p.x : p.y)) / (axis === 'x' ? p.w : p.h)) * 100).toFixed(2);
  // a legend / annotation node as an item of a Plot or Canvas (coordinates of the page moved to the frame `p`)
  const asItem = (n: Raw, p: Pos | null) => {
    const { attach: _a, ...spec } = n.data;
    const s = spec as Record<string, unknown>;
    if (p && s.coords !== 'data') {
      for (const k of ['x', 'x1', 'x2'] as const) if (typeof s[k] === 'number') s[k] = toFrame(s[k] as number, p, 'x');
      for (const k of ['y', 'y1', 'y2'] as const) if (typeof s[k] === 'number') s[k] = toFrame(s[k] as number, p, 'y');
    }
    return { id: n.id, type: n.type === 'colorbar' ? 'colorbar' : n.type === 'text' ? 'text' : 'shape', spec: s };
  };
  const ANNOT = new Set(['shape', 'text', 'colorbar']);
  const added: Edge[] = [];
  for (const cv of nodes.filter((n) => n.type === 'canvas')) {
    const axesIds = edges.filter((e) => e.target === cv.id && e.targetHandle === 'axes').map(sourceOf);
    const onCanvas = (h: string) => edges.filter((e) => e.target === cv.id && e.targetHandle === h).map((e) => byId.get(sourceOf(e))).filter((n): n is Raw => !!n);
    const legends = onCanvas('legend');
    const annots = onCanvas('annotation').filter((n) => ANNOT.has(n.type));
    const layout = cv.data.layout as { grid?: boolean; rows?: number; cols?: number; shareX?: string; shareY?: string; inner?: boolean } | undefined;
    const single = axesIds.length === 1;
    const plots: string[] = [];
    for (const aid of axesIds) {
      const ax = byId.get(aid);
      if (!ax || ax.type !== 'axes') continue;
      const style = { ...(ax.data.style as Record<string, unknown>) };
      const pos = { ...DEFAULT_POS, ...(style.pos as Partial<Pos> | undefined) };
      delete style.free;
      const fed = edges.filter((e) => e.target === aid && e.targetHandle === 'curves').map(sourceOf);
      const [pid, ...others] = [...new Set(fed)].filter((id) => byId.get(id)?.type === 'plot1d');
      if (!pid) continue;
      const P = byId.get(pid)!;
      const pd = { ...P.data } as Record<string, unknown> & { rows?: Record<string, unknown>[] };
      // other Plots of this Axes: their curves appended to the first one (ports and keys renumbered)
      const keyMap = new Map<string, string>();
      for (const oid of others) {
        const O = byId.get(oid)!;
        const od = O.data as Record<string, unknown> & { rows?: Record<string, unknown>[] };
        const theirs = [{ label: od.label, style: od.style, cols: od.cols, split: od.split, rowSel: od.rowSel }, ...(od.rows ?? [])];
        const offset = 1 + (pd.rows?.length ?? 0);
        pd.rows = [...(pd.rows ?? []), ...theirs.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)))];
        const hasData = edges.some((e) => e.target === pid && e.targetHandle === 'dataset');
        edges = edges.flatMap((e) => {
          const m = e.target === oid ? ROW.exec(e.targetHandle ?? '') : null;
          if (m) return [{ ...e, id: `${e.id}~m`, target: pid, targetHandle: handle(m[1], offset + (m[2] ? Number(m[2]) : 0)) }];
          if (e.target === oid && e.targetHandle === 'dataset') return hasData ? [] : [{ ...e, id: `${e.id}~m`, target: pid }];
          const s = e.source === oid ? ROW.exec(e.sourceHandle ?? '') : null;
          if (s && s[1] === 'series') return [{ ...e, id: `${e.id}~m`, source: pid, sourceHandle: handle('series', offset + (s[2] ? Number(s[2]) : 0)) }];
          return [e];
        });
        theirs.forEach((_, k) => keyMap.set(`${oid}:${k}`, `${pid}:${offset + k}`));
        gone.add(oid);
      }
      pd.axes = { ...style, pos };
      // its legend: the first one set on this Axes, else one on the page listing its curves
      const own = legends.find((l) => l.data.attach === aid) ?? legends.find((l) => !l.data.attach && edges.some((e) => e.target === l.id && fed.includes(sourceOf(e))));
      if (own) {
        const { attach: _a, ...lg } = own.data;
        const L = lg as Record<string, unknown> & { entries?: { key: string }[]; x?: number; y?: number };
        if (!own.data.attach && typeof L.x === 'number' && typeof L.y === 'number') [L.x, L.y] = [toFrame(L.x, pos, 'x'), toFrame(L.y, pos, 'y')];
        if (L.entries) L.entries = L.entries.map((e) => ({ ...e, key: keyMap.get(e.key) ?? e.key }));
        pd.legend = { ...L, show: true };
        gone.add(own.id);
      } else pd.legend = { show: false };
      // its annotations (those on the page too when the Canvas held only this Axes)
      const mine = annots.filter((a) => a.data.attach === aid || (single && !a.data.attach));
      pd.annotations = mine.map((a) => asItem(a, a.data.attach ? null : pos));
      mine.forEach((a) => gone.add(a.id));
      const grid = !single && layout?.grid;
      pd.page = single || !grid ? { ...pageOf(cv), frame: 'manual' } : { ...pageOf(cv), width: +((cv.data.width as number) / Math.max(1, layout?.cols ?? 1)).toFixed(1), height: +((cv.data.height as number) / Math.max(1, layout?.rows ?? 1)).toFixed(1), frame: 'auto' };
      P.data = pd;
      plots.push(pid);
      gone.add(aid);
    }
    if (single && plots.length) gone.add(cv.id);
    else if (plots.length) {
      // the Canvas keeps the figures: in its grid, or each Plot on a page of the Canvas' size, where it was
      const grid = layout?.grid;
      cv.data = {
        ...cv.data,
        layout: { rows: layout?.rows ?? 1, cols: layout?.cols ?? 2, sizing: 'fit', hgap: 0, vgap: 0, margin: 0, shareX: layout?.shareX ?? 'none', shareY: layout?.shareY ?? 'none', inner: layout?.inner ?? false },
        items: grid ? [] : plots.map((key) => ({ key, free: { x: 0, y: 0, w: 100, h: 100 } })),
        annotations: annots.filter((a) => !gone.has(a.id) && !a.data.attach).map((a) => asItem(a, null)),
        panelX: 2,
        panelY: 2,
      };
      delete cv.data.attach;
      for (const pid of plots) added.push({ id: `${pid}-figure-${cv.id}`, source: pid, sourceHandle: 'figure', target: cv.id, targetHandle: 'figures' });
      for (const a of annots) if (!a.data.attach) gone.add(a.id);
    }
  }
  // the nodes of the old figure chain are gone (Axes, Legends, annotations not placed anywhere)
  for (const n of nodes) if (['axes', 'legend', 'shape', 'text', 'colorbar'].includes(n.type)) gone.add(n.id);
  nodes = nodes.filter((n) => !gone.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  edges = [...edges, ...added].filter((e) => ids.has(e.source) && ids.has(e.target) && !(byId.get(e.target)?.type === 'canvas' && e.targetHandle !== 'figures'));
  return { nodes, edges };
}
