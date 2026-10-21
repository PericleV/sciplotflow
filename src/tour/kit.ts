// What the guided tours are made of: a tour (a project of its own, chapters of steps), a step (what to do, the element
// to use lit, when it is done, how Show me plays it), and the helpers the tours share. Pure but for the helpers that
// look in the page; the checks run the rest. The tours themselves are in first.ts, prepare.ts …; Show me is played by
// animate.ts.
import type { Edge } from '@xyflow/react';
import type { AppNode, NodeType } from '../types.ts';
import type { Value } from '../engine/evaluate.ts';

// what a step sees: the nodes and connections now and when it began, the files saved since it began, and what a node
// gives on an output (as last computed)
export type TourState = { nodes: AppNode[]; edges: Edge[]; start: AppNode[]; downloads: string[]; value?: (id: string, handle?: string) => Value | undefined };
// a node added by Show me: its type and data, the outputs connected to its inputs, its size (a note)
// (near: the node it goes beside when nothing is connected to it)
export type Wire = { id: string; handle?: string; to: string };
export type AddSpec = { type: NodeType; data: unknown; from: Wire[]; size?: { width: number; height: number }; near?: string };
type Patch = (d: Record<string, unknown>) => Record<string, unknown>;
// what Show me can do in the app: an Import node with a file, its columns plotted, a node added where it goes and
// connected, a node's data changed, a node selected, nodes put in a frame; where a place of the canvas is on the screen
export type TourApi = {
  importText: (name: string, text: string) => void;
  plot: (sourceId: string) => void;
  place: (spec: AddSpec) => { x: number; y: number };
  add: (spec: AddSpec, at?: { x: number; y: number }) => string;
  connect: (from: Wire, to: string) => void;
  setData: (id: string, f: Patch) => void;
  select: (id: string) => void;
  frame: (ids: string[], name: string) => void;
  nodes: () => AppNode[];
  edges: () => Edge[];
  toScreen: (p: { x: number; y: number }) => { x: number; y: number };
  reveal: (p: { x: number; y: number }) => Promise<void>;
};
// one move of Show me: a node taken from the Nodes panel and connected; a node clicked (selected); a button pressed;
// a value put in a field (shown being typed, then applied); the pointer resting on something
type Find = (doc: Document, g: { nodes: AppNode[]; edges: Edge[] }) => Element | null;
export type Act =
  | { kind: 'add'; spec: AddSpec; palette: string }
  | { kind: 'select'; id: string }
  | { kind: 'click'; at: Find; soft?: boolean } // soft: not waited for (pressed only when there, a section to open)
  // (a select: the text of the option `value` shown, when no text is given)
  | { kind: 'set'; at: Find; text?: string; value?: string; apply?: { id: string; f: Patch } }
  | { kind: 'point'; at: Find; ms?: number };
export type Step = {
  title: string;
  // paragraphs (a blank line between them); **bold**
  text: string;
  target?: (doc: Document, s: TourState) => Element | null;
  done?: (s: TourState) => boolean;
  // Show me: the moves played, or (not animated) what is done
  demo?: (s: TourState) => Act[] | null;
  show?: (api: TourApi, s: TourState) => void;
  // a button of its own beside Show me (the example file)
  action?: { label: string; run: (api: TourApi, s: TourState) => void };
};
export type Chapter = { title: string; steps: Step[] };
// project: the nodes the tour starts with (none: an empty canvas)
export type Tour = { id: string; title: string; level: string; minutes: number; desc: string; chapters: Chapter[]; project?: () => { nodes: AppNode[]; edges: Edge[] } };
export type FlatStep = Step & { chapter: string; chapterNo: number };
export const stepsOf = (t: Tour): FlatStep[] => t.chapters.flatMap((c, k) => c.steps.map((s) => ({ ...s, chapter: c.title, chapterNo: k + 1 })));
// a step's Show me done at once, without the moves (the checks): the nodes added and connected, the values applied
export function doStep(step: Step, g: { nodes: AppNode[]; edges: Edge[] }, s: TourState, id: (type: string) => string, api?: Partial<TourApi>): { nodes: AppNode[]; edges: Edge[] } {
  if (step.show && api) step.show(api as TourApi, s);
  for (const a of step.demo?.(s) ?? []) {
    if (a.kind === 'add') g = withAdded(g.nodes, g.edges, a.spec, id(a.spec.type));
    else if (a.kind === 'set' && a.apply) {
      const { id: target, f } = a.apply;
      g = { ...g, nodes: g.nodes.map((n) => (n.id === target ? ({ ...n, data: f(n.data as Record<string, unknown>) } as AppNode) : n)) };
    }
  }
  return g;
}
// a button (a tab) of the Options panel, by its text
export const optionButton = (text: string): Find => (doc) => [...doc.querySelectorAll('.inspector.overlay button')].find((b) => b.textContent?.trim() === text) ?? null;
// a field by its label (the select or input beside it): in the Options panel, else in the selected node itself (some
// nodes keep their main setting there, as the rows of Filter & sort rows)
export const field = (label: string): Find => (doc) => {
  const find = (root: string) => [...doc.querySelectorAll(`${root} label`)].find((l) => l.firstElementChild?.textContent?.trim() === label);
  const lab = find('.inspector.overlay') ?? find('.react-flow__node.selected');
  const got = lab?.querySelector('.field-ctl select, .field-ctl input, .field-ctl textarea, select, input');
  if (got) return got;
  // a row of the new panels: its label, its control (a field, else a button: a colour, a choice)
  for (const root of ['.inspector.overlay', '.react-flow__node.selected']) {
    const row = [...doc.querySelectorAll(`${root} .prop-row`)].find((r) => r.querySelector('.prop-label')?.textContent?.trim() === label);
    const ctl = row?.querySelector('.prop-ctl input:not([type="hidden"]), .prop-ctl textarea, .prop-ctl select') ?? row?.querySelector('.prop-ctl button');
    if (ctl) return ctl;
  }
  // a two-column form: the label a span, its control the next element (or inside it)
  for (const root of ['.inspector.overlay', '.react-flow__node.selected']) {
    const next = [...doc.querySelectorAll(`${root} .col-form > span`)].find((e) => e.textContent?.trim() === label)?.nextElementSibling;
    const ctl = next?.matches('select, input, textarea') ? next : next?.querySelector('select, input, textarea');
    if (ctl) return ctl;
  }
  return null;
};

// ---- what the steps look for ----
export const ofType = <T extends NodeType>(s: { nodes: AppNode[] }, t: T) => s.nodes.filter((n): n is Extract<AppNode, { type: T }> => n.type === t);
// a node of a type fed (on any input) by a node of one of these types; ok: its own settings as the step wants them
export function fedBy<T extends NodeType>(s: { nodes: AppNode[]; edges: Edge[] }, t: T, from: NodeType[], ok: (n: Extract<AppNode, { type: T }>) => boolean = () => true) {
  const src = new Map(s.nodes.map((n) => [n.id, n.type]));
  return ofType(s, t).find((n) => ok(n) && s.edges.some((e) => e.target === n.id && from.includes(src.get(e.source) as NodeType)));
}
// the node that came of a step (the newest of its type fed so)
export const byId = (s: { nodes: AppNode[] }, id: string | undefined) => s.nodes.find((n) => n.id === id);

// ---- where new nodes go: right of their first input (or of the node named), else under all the others; down until
// the room is free (the nodes' measured sizes; a new one taken as 560 × 360) ----
const sizeOf = (n: AppNode) => ({ w: n.measured?.width ?? n.width ?? 560, h: n.measured?.height ?? n.height ?? 360 });
export function placeAfter(nodes: AppNode[], fromId: string | undefined): { x: number; y: number } {
  const top = nodes.filter((n) => !n.parentId);
  const from = nodes.find((n) => n.id === fromId);
  let p = from ? { x: from.position.x + sizeOf(from).w + 80, y: from.position.y } : { x: 0, y: top.length ? Math.max(...top.map((n) => n.position.y + sizeOf(n).h)) + 80 : 0 };
  const taken = (q: { x: number; y: number }) => top.some((n) => q.x < n.position.x + sizeOf(n).w + 40 && n.position.x < q.x + 560 + 40 && q.y < n.position.y + sizeOf(n).h + 40 && n.position.y < q.y + 360 + 40);
  for (let k = 0; k < 80 && taken(p); k++) p = { x: p.x, y: p.y + 60 };
  return p;
}
export const placeOf = (nodes: AppNode[], spec: AddSpec) => placeAfter(nodes, spec.from[0]?.id ?? spec.near);
export const wireEdge = (f: Wire, id: string): Edge => ({ id: `e-${f.id}-${f.handle ?? 'out'}-${id}-${f.to}`, source: f.id, sourceHandle: f.handle ?? 'out', target: id, targetHandle: f.to });
// a node added and connected (its id given; where it goes, unless given): the nodes and connections after it, the new
// one selected
export function withAdded(nodes: AppNode[], edges: Edge[], spec: AddSpec, id: string, at = placeOf(nodes, spec)): { nodes: AppNode[]; edges: Edge[] } {
  const node = { id, type: spec.type, position: at, data: spec.data, selected: true, ...(spec.size ?? {}) } as AppNode;
  return { nodes: [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node], edges: [...edges, ...spec.from.map((f) => wireEdge(f, id))] };
}

// ---- where (in the page) ----
export const nodeEl = (doc: Document, id: string | undefined) => (id ? doc.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`) : null);
export const buttonIn = (root: Element | null, text: RegExp) => (root ? ([...root.querySelectorAll('button')].find((b) => text.test(b.textContent?.trim() ?? '')) ?? null) : null);
// a button of the Options panel — or, while it is folded, the button that opens it
export const inOptions = (doc: Document, text: RegExp) => {
  const open = doc.querySelector('.inspector.overlay');
  return open ? buttonIn(open, text) : doc.querySelector('.inspector.folded .palette-toggle');
};
// a button of a node's options: the node first, until it is selected
export const optionsOf = (doc: Document, s: TourState, id: string | undefined, text: RegExp) => {
  const n = byId(s, id);
  if (!n) return null;
  return n.selected ? inOptions(doc, text) : nodeEl(doc, n.id);
};
// a node of the Nodes panel (by its title) — or, while the panel is folded, the button that opens it
// (the folded strip is always there; the panel open is another element over the canvas)
export const paletteItem = (doc: Document, title: string) => {
  const open = doc.querySelector('.palette.overlay:not(.inspector)');
  if (!open) return doc.querySelector('.palette.folded:not(.inspector) .palette-toggle');
  return [...open.querySelectorAll('.palette-item')].find((b) => b.textContent?.trim() === title) ?? open.querySelector('.palette-search');
};
// the node made in a step when there is one, else where to take it from in the Nodes panel
export const nodeOrPalette = (doc: Document, node: AppNode | undefined, title: string) => (node ? nodeEl(doc, node.id) : paletteItem(doc, title));

// a little noise, the same every time (the example data)
export const wiggle = (a: number, b: number) => Math.sin(a * 12.9898 + b * 78.233) * Math.cos(a * 0.731 + b);
