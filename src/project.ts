// Project files: the graph (nodes with their settings and imported data, connections), saved as JSON and autosaved to
// the browser.
import type { Edge } from '@xyflow/react';
import type { AppNode } from './types.ts';
import { NODE_TITLES } from './nodeColors.ts';
import { plotsAsFigures } from './migrate4.ts';
import { eisFiguresAsPlots } from './eisPlots.ts';
import { withUnit } from './engine/table.ts';
import { columnLetter } from './engine/csv.ts';
import { withRefs } from './textStore.ts';

// name: the project's title (an example's name, a file name or typed by the user).
// repaired: set when a damaged file was opened — what was left out (not saved: a note for the user).
// id: the project's identity (given once, kept by every save; its figures in documents are found by it)
export type Project = { app: 'graph-flow'; version: typeof PROJECT_VERSION; nodes: AppNode[]; edges: Edge[]; name?: string; id?: string; repaired?: string };

// The format of project files. Saved files must keep opening in later versions: a change of the format bumps this number
// together with its conversion in MIGRATIONS, and a file of the old format joins scripts/fixtures (checked by npm run check).
// Within a format, node data only gain optional fields (the nodes read missing ones as their defaults).
export const PROJECT_VERSION = 14;
type RawNode = { id: string; type: string; data: Record<string, unknown> };
// MIGRATIONS[v] turns a file of format v into format v + 1.
const MIGRATIONS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: legends and annotations no longer connect to an Axes but to the Merge, naming the Axes they are on
  1: (p) => {
    const nodes = (Array.isArray(p.nodes) ? p.nodes : []) as RawNode[];
    const edges = (Array.isArray(p.edges) ? p.edges : []) as Edge[];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: Edge[] = [];
    for (const e of edges) {
      const t = byId.get(e.target);
      if (t?.type === 'axes' && (e.targetHandle === 'legend' || e.targetHandle === 'annotation')) {
        const src = byId.get(e.source);
        if (src && src.data && typeof src.data === 'object') src.data = { ...src.data, attach: e.target };
        for (const c of edges.filter((x) => x.source === e.target && byId.get(x.target)?.type === 'canvas'))
          out.push({ id: `${e.id}-${c.target}`, source: e.source, sourceHandle: e.sourceHandle, target: c.target, targetHandle: e.targetHandle });
        continue;
      }
      out.push(e);
    }
    return { ...p, nodes, edges: out };
  },
  // 2 → 3: a Fit has no port per parameter: each one used becomes an Extract column of its parameters table (one value
  // when the Fit has one run, as the port gave)
  2: (p) => ({ ...p, ...fitParamsToExtract(p.nodes, p.edges) }),
  // 3 → 4: a 1D plot is a whole figure (its Axes, legend and annotations in it); a Merge only assembles several Plots
  3: (p) => ({ ...p, ...plotsAsFigures(p.nodes, p.edges) }),
  // 4 → 5: a column has no unit apart from its name: the unit set on a Math / Generate column, Edit rows, Combine columns
  // goes into its name (“Signal” + “mV” → “Signal (mV)”); Import no longer splits “Wavelength (nm)” (the name stays whole)
  4: (p) => ({ ...p, nodes: unitsIntoNames(p.nodes) }),
  // 5 → 6: Statistics on columns and on rows are one node (“on”: columns / rows); the ports keep their names
  5: (p) => ({ ...p, nodes: oneStatistics(p.nodes) }),
  // 6 → 7: a long table is cut into columns only by Split into columns: the Split of Plot curves, the Runs of Fit,
  // Integrate and Pick points, the branches of Pick points go; a Fit's curves are a dataset (to the Plot's dataset port)
  6: (p) => ({ ...p, ...noSplit(p.nodes, p.edges) }),
  // 7 → 8: no “series” type (the data of a Plot curve, a Fit's residuals are datasets); Split into columns has no
  // “block values” output (every column keeps the value of its block)
  7: (p) => ({ ...p, ...noSeries(p.nodes, p.edges) }),
  // 8 → 9: a Workbook takes columns, datasets and workbooks on its inputs A, B, C …: its “view” input becomes A (the
  // empty sheets it hid behind the view go)
  8: (p) => ({ ...p, ...bookInputs(p.nodes, p.edges) }),
  // 9 → 10: no Group designation: a column designated Group is “–” (none)
  9: (p) => ({ ...p, nodes: noGroupRole(p.nodes) }),
  // 10 → 11: three nodes merged into others — Add column → Combine columns side by side, Edit rows → Math column with
  // rules for chosen rows, Plot matrix → Contour / heatmap with a matrix on its matrix port
  10: (p) => ({ ...p, ...mergedNodes(p.nodes, p.edges) }),
  // 11 → 12: a Workbook puts an input with no sheet named on its first sheet; the inputs of older files keep their own
  // sheet, “inputs”
  11: (p) => ({ ...p, nodes: inputsSheet(p.nodes, p.edges) }),
  // 12 → 13: the EIS node has no figure outputs (Nyquist, |Z|, phase, Bode): each one connected becomes a Plot of the
  // node's data (“fitted”, and the smooth fit on its new output “curve”), connected where the figure was
  12: (p) => ({ ...p, ...eisFiguresAsPlots(p.nodes, p.edges) }),
  // 13 → 14: no Report node: each one becomes a note with the texts written in it (its title, the text before, the
  // titles and texts of its blocks, the text after); its connections go
  13: (p) => ({ ...p, ...reportsAsNotes(p.nodes, p.edges) }),
};

// (13 → 14) in a graph and in the groups inside it; also used on the templates kept in the browser (no version). Only
// Report nodes change, so it can run again on a converted graph.
export function reportsAsNotes(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const nodes = ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n): RawNode => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    if (n.type === 'subgraph') return { ...n, data: { ...n.data, ...reportsAsNotes(n.data.nodes, n.data.edges) } };
    if (n.type !== 'report') return n;
    const d = n.data;
    const items = d.items && typeof d.items === 'object' ? (d.items as Record<string, { title?: unknown; text?: unknown }>) : {};
    const blocks = Object.keys(items)
      .sort((a, b) => Number(a) - Number(b))
      .flatMap((k) => {
        const [t, x] = [str(items[k]?.title), str(items[k]?.text)];
        return t || x ? [[t, x].filter(Boolean).join('\n')] : [];
      });
    const text = [str(d.title), str(d.intro), ...blocks, str(d.outro)].filter(Boolean).join('\n\n');
    return { ...n, type: 'note', data: { text: text || 'Report' } };
  });
  const reports = new Set(((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).filter((n) => n?.type === 'report').map((n) => n.id));
  const edges = ((Array.isArray(rawEdges) ? rawEdges : []) as Edge[]).filter((e) => !reports.has(e.source) && !reports.has(e.target));
  return { nodes, edges };
}

// (11 → 12) in a graph and in the groups inside it
function inputsSheet(rawNodes: unknown, rawEdges: unknown): RawNode[] {
  const edges = (Array.isArray(rawEdges) ? rawEdges : []) as Edge[];
  return ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n) => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    if (n.type === 'subgraph') return { ...n, data: { ...n.data, nodes: inputsSheet(n.data.nodes, n.data.edges) } };
    if (n.type !== 'book') return n;
    const ports = edges.flatMap((e) => (e.target === n.id ? [Number(/^in-(\d+)$/.exec(e.targetHandle ?? '')?.[1] ?? -1)] : [])).filter((k) => k >= 0);
    if (!ports.length) return n;
    const into = Array.isArray(n.data.into) ? (n.data.into as unknown[]).map((v) => (typeof v === 'string' ? v : '')) : [];
    for (const k of ports) if (!into[k]?.trim()) into[k] = 'inputs';
    return { ...n, data: { ...n.data, into: Array.from({ length: into.length }, (_, k) => into[k] ?? '') } };
  });
}

// (10 → 11) in a graph and in the groups inside it; also used on the templates kept in the browser (no version). Only
// the three old types change, so it can run again on a converted graph.
export function mergedNodes(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const list = (Array.isArray(rawNodes) ? rawNodes : []) as RawNode[];
  const addcols = new Set(list.filter((n) => n?.type === 'addcol').map((n) => n.id));
  const nodes = list.map((n): RawNode => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    const d = n.data;
    if (n.type === 'subgraph') return { ...n, data: { ...d, ...mergedNodes(d.nodes, d.edges) } };
    if (n.type === 'addcol') {
      const pos = d.position === 'start' || d.position === 'after' || d.position === 'replace' ? d.position : 'ports';
      return { ...n, type: 'combine', data: { how: 'side', at: 0, match: 'name', x: '', dup: 'all', name: '', where: pos, ref: typeof d.ref === 'string' ? d.ref : '', names: typeof d.name === 'string' ? d.name : '' } };
    }
    if (n.type === 'editrows') {
      const others = d.others === 'nan' || d.others === 'value' ? d.others : undefined;
      return { ...n, type: 'mathcol', data: { name: typeof d.name === 'string' ? d.name : '', formula: columnLetter(Math.max(0, Math.floor(Number(d.target) || 0))), rules: Array.isArray(d.rules) ? d.rules : [], ...(others ? { others, otherValue: Number(d.otherValue) || 0 } : {}) } };
    }
    if (n.type === 'plotmatrix') return { ...n, type: 'contour' };
    return n;
  });
  // Add column's ports: the dataset → A, the column → B
  const edges = ((Array.isArray(rawEdges) ? rawEdges : []) as Edge[]).map((e) => (addcols.has(e.target) && (e.targetHandle === 'data' || e.targetHandle === 'col') ? { ...e, targetHandle: e.targetHandle === 'data' ? 'in-0' : 'in-1' } : e));
  return { nodes, edges };
}

// (9 → 10) every designation Group in the data of the nodes (worksheet changes, rules …), groups inside included
function noGroupRole(v: unknown): RawNode[] {
  const walk = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(walk);
    if (!o || typeof o !== 'object') return o;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = k === 'role' && x === 'group' ? 'none' : walk(x);
    return out;
  };
  return ((Array.isArray(v) ? v : []) as RawNode[]).map((n) => (n && n.data && typeof n.data === 'object' ? { ...n, data: walk(n.data) as Record<string, unknown> } : n));
}

// (8 → 9) in a graph and in the groups inside it
function bookInputs(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const edges = (Array.isArray(rawEdges) ? rawEdges : []) as Edge[];
  const viewed = new Set<string>();
  const list = (Array.isArray(rawNodes) ? rawNodes : []) as RawNode[];
  const books = new Set(list.filter((n) => n?.type === 'book').map((n) => n.id));
  const moved = edges.map((e) => {
    if (!books.has(e.target) || e.targetHandle !== 'in') return e;
    viewed.add(e.target);
    return { ...e, id: `${e.id}-a`, targetHandle: 'in-0' };
  });
  const nodes = list.map((n) => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    if (n.type === 'subgraph') return { ...n, data: { ...n.data, ...bookInputs(n.data.nodes, n.data.edges) } };
    if (n.type !== 'book' || !viewed.has(n.id) || !Array.isArray(n.data.sheets)) return n;
    const sheets = (n.data.sheets as { text?: string; edits?: { cells?: unknown } }[]).filter((q) => q.text || q.edits?.cells);
    return { ...n, data: { ...n.data, sheets, sheet: 0 } };
  });
  return { nodes, edges: moved };
}

// (7 → 8) in a graph and in the groups inside it
function noSeries(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const ports = (list: unknown) => (Array.isArray(list) ? (list as Record<string, unknown>[]).map((q) => (q && q.type === 'series' ? { ...q, type: 'dataset' } : q)) : list);
  const nodes = ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n) => {
    if (!n || !n.data || typeof n.data !== 'object' || n.type !== 'subgraph') return n;
    const d = n.data;
    return { ...n, data: { ...d, ...noSeries(d.nodes, d.edges), inputs: ports(d.inputs), outputs: ports(d.outputs) } };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = ((Array.isArray(rawEdges) ? rawEdges : []) as Edge[]).filter((e) => !(byId.get(e.source)?.type === 'unstack' && e.sourceHandle === 'values'));
  return { nodes, edges };
}

// (6 → 7) in a graph and in the groups inside it
function noSplit(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const without = (o: unknown, ...keys: string[]) => {
    if (!o || typeof o !== 'object') return o;
    const c = { ...(o as Record<string, unknown>) };
    for (const k of keys) delete c[k];
    return c;
  };
  const nodes = ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n) => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    const d = n.data;
    if (n.type === 'subgraph') return { ...n, data: { ...d, ...noSplit(d.nodes, d.edges) } };
    if (n.type === 'plot1d') {
      const rows = Array.isArray(d.rows) ? (d.rows as Record<string, unknown>[]).map((r) => ({ ...(without(r, 'split') as object), ...(r.cols ? { cols: without(r.cols, 'group') } : {}) })) : d.rows;
      return { ...n, data: { ...(without(d, 'split') as object), ...(d.cols ? { cols: without(d.cols, 'group') } : {}), ...(rows ? { rows } : {}) } as Record<string, unknown> };
    }
    if (n.type === 'fit' || n.type === 'calculus') return { ...n, data: without(d, 'split', ...(d.baseFrom === 'branch' ? ['baseFrom'] : [])) as Record<string, unknown> };
    if (n.type === 'pick') return { ...n, data: without(d, 'split', 'branch') as Record<string, unknown> };
    return n;
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const edges = ((Array.isArray(rawEdges) ? rawEdges : []) as Edge[]).flatMap((e) => {
    const t = byId.get(e.target);
    if (t?.type === 'plot1d' && /^group(-\d+)?$/.test(e.targetHandle ?? '')) return [];
    // a Fit's curve on a Plot curve's series port: the Fit's curves are now a dataset
    const out = byId.get(e.source)?.type === 'fit' && e.sourceHandle === 'fit' && t?.type === 'plot1d' && /^series(-\d+)?$/.test(e.targetHandle ?? '') ? { ...e, id: `${e.id}-ds`, targetHandle: 'dataset' } : e;
    const key = `${out.source}|${out.sourceHandle}|${out.target}|${out.targetHandle}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [out];
  });
  return { nodes, edges };
}

// (5 → 6) in a graph and in the groups inside it
function oneStatistics(rawNodes: unknown): RawNode[] {
  return ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n) => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    if (n.type === 'subgraph') return { ...n, data: { ...n.data, nodes: oneStatistics(n.data.nodes) } };
    return n.type === 'statsrows' ? { ...n, type: 'stats', data: { ...n.data, on: 'rows' } } : n;
  });
}

// (4 → 5) in a graph and in the groups inside it
function unitsIntoNames(rawNodes: unknown): RawNode[] {
  return ((Array.isArray(rawNodes) ? rawNodes : []) as RawNode[]).map((n) => {
    if (!n || !n.data || typeof n.data !== 'object') return n;
    if (n.type === 'subgraph') return { ...n, data: { ...n.data, nodes: unitsIntoNames(n.data.nodes) } };
    if (n.type === 'import' && n.data.csv && typeof n.data.csv === 'object') {
      const { unitsInName: _u, ...csv } = n.data.csv as Record<string, unknown>;
      return { ...n, data: { ...n.data, csv } };
    }
    if (n.type !== 'mathcol' && n.type !== 'gencol' && n.type !== 'editrows' && n.type !== 'combine') return n;
    const { unit, ...data } = n.data;
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    // the name the column had when none is set (Edit rows, Combine: the input's, which carries its own unit)
    const own = name || (n.type === 'mathcol' && typeof data.formula === 'string' ? data.formula.trim() : n.type === 'gencol' ? 'Generated' : '');
    return { ...n, data: { ...data, ...(typeof unit === 'string' && unit.trim() && own ? { name: withUnit(own, unit) } : {}) } };
  });
}

// (2 → 3) in a graph and in the groups inside it
type RawPlaced = RawNode & { position?: { x: number; y: number }; parentId?: string };
function fitParamsToExtract(rawNodes: unknown, rawEdges: unknown): { nodes: RawNode[]; edges: Edge[] } {
  const nodes = ((Array.isArray(rawNodes) ? rawNodes : []) as RawPlaced[]).map((n) =>
    n?.type === 'subgraph' && n.data && typeof n.data === 'object' ? { ...n, data: { ...n.data, ...fitParamsToExtract(n.data.nodes, n.data.edges) } } : n,
  );
  const edges = (Array.isArray(rawEdges) ? rawEdges : []) as Edge[];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const added = new Map<string, string>();
  const out: Edge[] = [];
  for (const e of edges) {
    const fit = byId.get(e.source);
    if (fit?.type !== 'fit' || !e.sourceHandle?.startsWith('p:')) {
      out.push(e);
      continue;
    }
    const name = e.sourceHandle.slice(2);
    const key = `${fit.id} ${name}`;
    let id = added.get(key);
    if (!id) {
      id = `${fit.id}-param-${added.size + 1}`;
      added.set(key, id);
      const d = fit.data as { split?: { mode?: string }; ys?: unknown[] };
      const one = (d.split?.mode ?? 'none') === 'none' && (d.ys?.length ?? 1) <= 1;
      const pos = fit.position ?? { x: 0, y: 0 };
      nodes.push({ id, type: 'extract', position: { x: pos.x + 620, y: pos.y + 200 * added.size }, data: { column: name, index: 0, ...(one ? { value: true, row: 1 } : {}) }, ...(fit.parentId ? { parentId: fit.parentId } : {}) });
      out.push({ id: `${id}-in`, source: fit.id, sourceHandle: 'params', target: id, targetHandle: 'in' });
    }
    out.push({ ...e, source: id, sourceHandle: 'out' });
  }
  return { nodes, edges: out };
}

const STORAGE_KEY = 'graph-flow:project';

export function toProject(nodes: AppNode[], edges: Edge[], name?: string, id?: string): Project {
  return {
    app: 'graph-flow',
    version: PROJECT_VERSION,
    ...(name ? { name } : {}),
    ...(id ? { id } : {}),
    // group frames and resized notes keep their size; grouped nodes their frame (positions relative to it)
    nodes: nodes.map(({ id, type, position, data, parentId, width, height }) =>
      ({ id, type, position, data, ...(parentId ? { parentId } : {}), ...(type === 'frame' || (type === 'note' && width !== undefined && height !== undefined) ? { width, height } : {}) }) as AppNode,
    ),
    edges: edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle })),
  };
}

// JSON has no NaN / ±Infinity (they would become null): numbers that are not finite are written as {"$num": "NaN"}.
const NONFINITE = '$num';
export const stringifyProject = (p: Project, indent?: number) =>
  JSON.stringify({ ...p, repaired: undefined }, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? { [NONFINITE]: String(v) } : v), indent);
const revive = (_: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && NONFINITE in v ? Number((v as Record<string, string>)[NONFINITE]) : v;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

// A damaged file must not stop the application: nodes without an id, a known type or data are left out (with their
// connections), a missing position becomes (0, 0), connections to missing nodes and unknown group frames are removed.
function checked(nodes: unknown[], edges: unknown[]): { nodes: AppNode[]; edges: Edge[]; repaired?: string } {
  const valid = nodes.filter((n): n is Record<string, unknown> & { id: string } => isObj(n) && typeof n.id === 'string' && typeof n.type === 'string' && n.type in NODE_TITLES && isObj(n.data));
  const ids = new Set(valid.map((n) => n.id));
  const kept = edges.filter((e): e is Edge => isObj(e) && typeof e.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string' && ids.has(e.source) && ids.has(e.target));
  // what was left out, for the user (a node of a type this version does not know, a broken connection)
  const unknown = [...new Set(nodes.filter((n) => isObj(n) && typeof n.type === 'string' && !(n.type in NODE_TITLES)).map((n) => (n as { type: string }).type))];
  const lostN = nodes.length - valid.length;
  const lostE = edges.length - kept.length;
  const repaired = lostN || lostE ? `The file was repaired: ${[lostN ? `${lostN} node${lostN > 1 ? 's' : ''} left out${unknown.length ? ` (unknown type${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')})` : ''}` : '', lostE ? `${lostE} connection${lostE > 1 ? 's' : ''} left out` : ''].filter(Boolean).join(', ')}.` : undefined;
  return {
    nodes: valid.map((n) => {
      const out: Record<string, unknown> = { ...n, position: isObj(n.position) && finite(n.position.x) && finite(n.position.y) ? n.position : { x: 0, y: 0 } };
      if (!(typeof n.parentId === 'string' && ids.has(n.parentId))) delete out.parentId;
      return out as AppNode;
    }),
    edges: kept,
    ...(repaired ? { repaired } : {}),
  };
}

export function parseProject(text: string): Project | string {
  try {
    let p = JSON.parse(text, revive) as Record<string, unknown>;
    if (!isObj(p) || p.app !== 'graph-flow') return 'Not a SciPlotFlow project file.';
    const v0 = p.version;
    if (typeof v0 !== 'number') return 'Not a SciPlotFlow project file (no format version).';
    if (v0 > PROJECT_VERSION) return `This project was saved by a newer version of SciPlotFlow (format ${v0}; this page reads up to ${PROJECT_VERSION}). Reload the page to get the latest version.`;
    for (let v = v0; v < PROJECT_VERSION; v++) {
      if (!MIGRATIONS[v]) return `This project was saved by an older version of SciPlotFlow (format ${v0}); it cannot be opened.`;
      p = { ...MIGRATIONS[v](p), version: v + 1 };
    }
    if (!Array.isArray(p.nodes) || !Array.isArray(p.edges)) return 'Not a SciPlotFlow project file.';
    return { app: 'graph-flow', version: PROJECT_VERSION, ...checked(p.nodes, p.edges), ...(typeof p.name === 'string' && p.name ? { name: p.name } : {}), ...(typeof p.id === 'string' && p.id ? { id: p.id } : {}) };
  } catch {
    return 'The file is not valid JSON.';
  }
}

export function loadAutosave(): Project | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    const p = text ? parseProject(text) : null;
    return typeof p === 'string' ? null : p;
  } catch {
    return null;
  }
}

// false: the browser storage is full or unavailable (the page tells the user: a reload would lose the changes)
export function autosave(p: Project): boolean {
  try {
    // the big texts as references (kept once in IndexedDB): saving after every change stays instant
    localStorage.setItem(STORAGE_KEY, stringifyProject(withRefs(p)));
    return true;
  } catch {
    return false;
  }
}

// ---- The last session: the page starts with an empty project (or Welcome), so the project open when the page was
// left is kept aside at start — from the autosave, only when it has nodes (a reload of an empty page keeps the older one) ----
const LAST_KEY = 'graph-flow:last-session';
export type LastSession = { project: Project; saved: number };
export function keepLastSession(): LastSession | null {
  const p = loadAutosave();
  try {
    if (p && p.nodes.length) localStorage.setItem(LAST_KEY, JSON.stringify({ saved: Date.now(), text: stringifyProject(p) }));
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const { saved, text } = JSON.parse(raw) as { saved: number; text: string };
    const q = parseProject(text);
    return typeof q === 'string' ? null : { project: q, saved };
  } catch {
    return p && p.nodes.length ? { project: p, saved: Date.now() } : null;
  }
}

// ---- Share links: the project, compressed (deflate), in the URL fragment (#p=…) — nothing is sent to a server ----

const toBase64Url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (code: string) => {
  const s = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
};
const pipe = (bytes: Uint8Array, t: CompressionStream | DecompressionStream) => new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(t));

export async function encodeProject(p: Project): Promise<string> {
  const bytes = new TextEncoder().encode(stringifyProject(p));
  return toBase64Url(new Uint8Array(await pipe(bytes, new CompressionStream('deflate-raw')).arrayBuffer()));
}

export async function decodeProject(code: string): Promise<Project | string> {
  try {
    return parseProject(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')).text());
  } catch {
    return 'The link does not contain a valid SciPlotFlow project.';
  }
}

// ---- Projects kept in this browser (several, by name), besides the autosave of the current one ----

export type SavedEntry = { id: string; name: string; saved: number; size: number };
const INDEX_KEY = 'graph-flow:projects';
const entryKey = (id: string) => `graph-flow:saved:${id}`;

export function listSaved(): SavedEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as SavedEntry[];
    return Array.isArray(v) ? v.sort((a, b) => b.saved - a.saved) : [];
  } catch {
    return [];
  }
}

// Saves under `name` (replacing a project of the same name); returns an error message when the storage is full.
export function saveToBrowser(p: Project, name: string): SavedEntry | string {
  const list = listSaved();
  const old = list.find((e) => e.name === name);
  const entry: SavedEntry = { id: old?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, saved: Date.now(), size: 0 };
  const text = stringifyProject(withRefs({ ...p, name }));
  entry.size = text.length;
  try {
    localStorage.setItem(entryKey(entry.id), text);
    localStorage.setItem(INDEX_KEY, JSON.stringify([entry, ...list.filter((e) => e.id !== entry.id)]));
    return entry;
  } catch {
    return 'The browser storage is full: delete some saved projects, or use Save (a file).';
  }
}

export function loadFromBrowser(id: string): Project | string {
  try {
    const text = localStorage.getItem(entryKey(id));
    return text ? parseProject(text) : 'This saved project is missing.';
  } catch {
    return 'The browser storage is not available.';
  }
}

export function deleteFromBrowser(id: string) {
  try {
    localStorage.removeItem(entryKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(listSaved().filter((e) => e.id !== id)));
  } catch {
    // storage unavailable: nothing to delete
  }
}
