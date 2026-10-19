// Named styles: a node's settings kept under a name and applied to other nodes of the same kind (right-click menu).
// Some come built in (journal pages, usual looks of a Plot's axes, legend and curves); yours are kept in this browser.
import { CURVE_STYLE_DEFAULTS, GRID_DEFAULTS, SIDE_DEFAULTS, type CurveStyle, type SideStyle } from '../figure/spec.ts';
import type { AppNode, NodeType, Plot1DData } from '../types.ts';
import { pastedData, settingsOf } from './clipboard.ts';
import { REGION_COLORS } from './regionColors.ts';

export type NamedStyle = { name: string; type: NodeType; data: Record<string, unknown>; builtin?: boolean };
const KEY = 'graph-flow:styles';

const side = (p: Partial<SideStyle>): SideStyle => ({ ...SIDE_DEFAULTS, ...p });
const mirror = (p: Partial<SideStyle> = {}): SideStyle => side({ labels: false, showTitle: false, ...p });
const curve = (p: Partial<CurveStyle>) => p;

const PAGES: [string, object][] = [
  ['Journal, one column (85 mm, Arial 8 pt)', { width: 85, height: 65, unit: 'mm', font: 'Arial, Helvetica, sans-serif', size: 8 }],
  ['Journal, two columns (180 mm, Arial 8 pt)', { width: 180, height: 110, unit: 'mm', font: 'Arial, Helvetica, sans-serif', size: 8 }],
  ['Nature, one column (89 mm, Helvetica 7 pt)', { width: 89, height: 70, unit: 'mm', font: 'Helvetica, Arial, sans-serif', size: 7 }],
  ['Science, one column (55 mm, Helvetica 7 pt)', { width: 55, height: 50, unit: 'mm', font: 'Helvetica, Arial, sans-serif', size: 7 }],
  ['Slide 16:9 (Arial 16 pt)', { width: 25.4, height: 14.3, unit: 'cm', font: 'Arial, Helvetica, sans-serif', size: 16 }],
  ['Poster (30 × 22 cm, Arial 24 pt)', { width: 30, height: 22, unit: 'cm', font: 'Arial, Helvetica, sans-serif', size: 24 }],
];
const thick = { lineWidth: 1.5, tickWidth: 1.5, tickLen: 6, minorLen: 3 };
const BUILTINS: NamedStyle[] = [
  // pages: of a Plot, of a Merge
  ...PAGES.map(([name, page]): NamedStyle => ({ name: `Page: ${name}`, type: 'plot1d', data: { page } })),
  ...PAGES.map(([name, page]): NamedStyle => ({ name, type: 'canvas', data: page as Record<string, unknown> })),
  // axes
  { name: 'Axes: box, ticks in', type: 'plot1d', data: { axes: { sides: { bottom: side({}), left: side({}), top: mirror(), right: mirror() }, grid: { x: GRID_DEFAULTS, y: GRID_DEFAULTS } } } },
  { name: 'Axes: open (left and bottom), ticks out', type: 'plot1d', data: { axes: { sides: { bottom: side({ ticks: 'out' }), left: side({ ticks: 'out' }), top: mirror({ line: false, ticks: 'none' }), right: mirror({ line: false, ticks: 'none' }) } } } },
  { name: 'Axes: minimal (open, no minor ticks)', type: 'plot1d', data: { axes: { sides: { bottom: side({ ticks: 'out', minorTicks: false }), left: side({ ticks: 'out', minorTicks: false }), top: mirror({ line: false, ticks: 'none' }), right: mirror({ line: false, ticks: 'none' }) } } } },
  { name: 'Axes: box with a light grid', type: 'plot1d', data: { axes: { sides: { bottom: side({}), left: side({}), top: mirror(), right: mirror() }, grid: { x: { ...GRID_DEFAULTS, major: true }, y: { ...GRID_DEFAULTS, major: true } } } } },
  { name: 'Axes: thick lines (slides, posters)', type: 'plot1d', data: { axes: { sides: { bottom: side(thick), left: side(thick), top: mirror(thick), right: mirror(thick) } } } },
  // legends
  { name: 'Legend: plain (no frame)', type: 'plot1d', data: { legend: { frame: 'none', background: '' } } },
  { name: 'Legend: framed, white', type: 'plot1d', data: { legend: { frame: 'line', background: '#ffffff', bgOpacity: 1, frameWidth: 0.5 } } },
  { name: 'Legend: shadow', type: 'plot1d', data: { legend: { frame: 'shadow', background: '#ffffff', frameWidth: 0.5 } } },
  { name: 'Legend: rounded, see-through', type: 'plot1d', data: { legend: { frame: 'round', background: '#ffffff', bgOpacity: 0.8, frameWidth: 0.4 } } },
  // curves (every curve of the Plot; their colours stay)
  { name: 'Curves: lines, 1 pt', type: 'plot1d', data: { curve: curve({ mode: 'line', lineWidth: 1, dash: 'solid', connect: 'straight' }) } },
  { name: 'Curves: smooth lines, 1.25 pt', type: 'plot1d', data: { curve: curve({ mode: 'line', lineWidth: 1.25, connect: 'spline' }) } },
  { name: 'Curves: open circles', type: 'plot1d', data: { curve: curve({ mode: 'scatter', symbol: 'circle', symbolFill: 'open', symbolSize: 4, symbolEdge: 0.8 }) } },
  { name: 'Curves: line + filled circles', type: 'plot1d', data: { curve: curve({ mode: 'linesymbol', symbol: 'circle', symbolFill: 'filled', symbolSize: 3.5, lineWidth: 0.8 }) } },
  { name: 'Curves: lollipop', type: 'plot1d', data: { curve: curve({ mode: 'scatter', symbol: 'circle', symbolSize: 5, symbolFill: 'filled', drop: 'vertical' }) } },
  { name: 'Curves: line + white squares', type: 'plot1d', data: { curve: curve({ mode: 'linesymbol', symbol: 'square', symbolFill: 'white', symbolSize: 3.5, symbolEdge: 0.7, lineWidth: 0.8 }) } },
  // the curves of a Peak analyzer (by the names of their Y columns)
  { name: 'Curves: peak fit (data, peaks filled, envelope)', type: 'plot1d', data: { peakFit: true } },
];

export const BUILTIN_STYLES: NamedStyle[] = BUILTINS.map((s) => ({ ...s, builtin: true }));

function load(): NamedStyle[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as NamedStyle[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
const save = (list: NamedStyle[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

export const stylesFor = (type: NodeType): NamedStyle[] => [...BUILTIN_STYLES.filter((s) => s.type === type), ...load().filter((s) => s.type === type)];
export const userStylesFor = (type: NodeType) => load().filter((s) => s.type === type);

export function saveStyle(n: AppNode, name: string): boolean {
  const list = load().filter((s) => !(s.type === n.type && s.name === name));
  return save([...list, { name, type: n.type, data: settingsOf(n) }]);
}
export const forgetStyle = (type: NodeType, name: string) => save(load().filter((s) => !(s.type === type && s.name === name)));

// The settings every new node of a kind starts with (a node's, chosen as the default; kept in this browser).
const DEFAULT_KEY = 'graph-flow:default-styles';
function loadDefaults(): Partial<Record<NodeType, NamedStyle>> {
  try {
    const v = JSON.parse(localStorage.getItem(DEFAULT_KEY) ?? '{}') as Partial<Record<NodeType, NamedStyle>>;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
const saveDefaults = (d: Partial<Record<NodeType, NamedStyle>>) => {
  try {
    localStorage.setItem(DEFAULT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
};
export const defaultStyleFor = (type: NodeType): NamedStyle | null => loadDefaults()[type] ?? null;
export const setDefaultStyle = (n: AppNode) => saveDefaults({ ...loadDefaults(), [n.type]: { name: 'default', type: n.type, data: settingsOf(n) } });
export function clearDefaultStyle(type: NodeType) {
  const d = loadDefaults();
  delete d[type];
  return saveDefaults(d);
}
// a new node's data with the default settings of its kind (none: as it is)
export function withDefaultStyle<T extends AppNode>(n: T): T {
  const st = defaultStyleFor(n.type);
  const d = st ? styledData(n, st) : null;
  return d ? ({ ...n, data: d } as T) : n;
}

// The data of `n` with a style applied. A built-in curve style goes on every curve of a Plot (their colours stay).
export function styledData(n: AppNode, st: NamedStyle): Record<string, unknown> | null {
  if (st.type !== n.type) return null;
  if (n.type === 'plot1d' && st.data.peakFit) return peakFitData(n.data as Plot1DData);
  if (n.type === 'plot1d' && 'curve' in st.data) {
    const d = n.data as Plot1DData;
    const patch = st.data.curve as Partial<CurveStyle>;
    const on = (s: Partial<CurveStyle>) => ({ ...CURVE_STYLE_DEFAULTS, ...s, ...patch, color: s.color ?? CURVE_STYLE_DEFAULTS.color });
    return { ...d, style: on(d.style), rows: (d.rows ?? []).map((r) => ({ ...r, style: on(r.style) })) };
  }
  return pastedData({ kind: 'node', type: st.type, data: st.data }, n);
}

// Peak fit: the curves of a Peak analyzer told apart by the names of their Y columns — peak k filled in its colour (the
// colours of the Peak analyzer) down to the baseline curve when there is one, else to y = 0; the envelope a black line;
// the baseline dashed grey; the data grey dots.
function peakFitData(d: Plot1DData): Record<string, unknown> {
  const rows = [{ label: d.label, style: d.style, cols: d.cols }, ...(d.rows ?? [])];
  const yOf = (k: number) => rows[k].cols?.y ?? '';
  const base = rows.findIndex((_, k) => /^baseline\b/.test(yOf(k)));
  const looks = rows.map((r, k) => {
    const y = yOf(k);
    const pk = /^peak (\d+)\b/.exec(y);
    const s0 = { ...CURVE_STYLE_DEFAULTS, ...r.style };
    if (pk) {
      const color = REGION_COLORS[(Number(pk[1]) - 1) % REGION_COLORS.length];
      return { ...s0, mode: 'line' as const, color, lineWidth: 1.2, dash: 'solid' as const, fill: base >= 0 ? ('curve' as const) : ('zero' as const), fillCurve: base + 1, fillColor: '', fillOpacity: 0.25 };
    }
    if (/^envelope\b/.test(y)) return { ...s0, mode: 'line' as const, color: '#111111', lineWidth: 1.4, dash: 'solid' as const, fill: 'none' as const };
    if (k === base) return { ...s0, mode: 'line' as const, color: '#555555', lineWidth: 1, dash: 'dash' as const, fill: 'none' as const };
    return { ...s0, mode: 'scatter' as const, color: '#7f7f7f', symbol: 'circle' as const, symbolFill: 'filled' as const, symbolSize: 2.5, fill: 'none' as const };
  });
  return { ...d, style: looks[0], rows: (d.rows ?? []).map((r, k) => ({ ...r, style: looks[k + 1] })) };
}
