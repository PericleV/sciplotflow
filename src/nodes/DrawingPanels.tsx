// The Figure Drawing editor's panels beside its layers and options: what can be done with the objects selected (paths:
// combined, moved out or in, a line made an outline, corners rounded or cut, nodes; cut to / masked by another object;
// grouped; made a component; copied in a grid or round a circle; saved styles; the selection's colours), the drawing's
// components, the user's library of figures (in this browser), and a text written along another object.
import { useEffect, useState, type ReactNode } from 'react';
import { drawingFigure, shapeSpec } from '../engine/evaluate.ts';
import { placeComponent } from '../engine/drawingItems.ts';
import { FigureSvg } from '../figure/render.tsx';
import { breakAt, deleteNode, isClosed, joinPaths, longestSegment, parsePath, pathText, reversePath, roundCorners, setClosed, sharpAll, smoothAll, splitSegment } from '../figure/paths.ts';
import { DRAWING_DEFAULTS, newAnnotation } from '../defaults.ts';
import type { AnnotationItem, DrawingComponent, DrawingData } from '../types.ts';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';
import { circleArray, colorsOf, copiesOf, gridArray, pathArray, groupItems, ungroupItems, mapItem, newId, pathOf, recolor, toPathItem, type Rect } from './drawingOps.ts';
import { combine, offsetPath, strokeOutline, type BoolOp } from './pathOps.ts';
import { copyStyle, deleteFigure, libraryFile, pasteStyle, listFigures, listStyles, newFigureId, readLibraryFile, saveFigure, saveStyles, styleOf, type LibFigure, type SavedStyle } from './figureLibrary.ts';
import { importSvg } from './svgImport.ts';
import { describe } from './annotationNames.ts';
import { ChevronDown, ChevronRight, Plus, Split, SquaresExclude, SquaresIntersect, SquaresSubtract, SquaresUnite, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ask, notify } from '../ui/dialogStore.ts';

export type Ctx = {
  items: AnnotationItem[];
  setItems: (l: AnnotationItem[]) => void;
  sel: string[];
  setSel: (s: string[]) => void;
  data: DrawingData;
  set: (p: Partial<DrawingData>) => void;
  boxMm: (it: AnnotationItem) => Rect | null;
  selBox: Rect | null;
  pageMm: { w: number; h: number };
  nodes: number[]; // the nodes picked on the path selected
};
const nameOf = (it: AnnotationItem) => it.name || describe(it);
// a list with some objects replaced by others where the first of them was (in the order of the list)
function replaceAt(items: AnnotationItem[], gone: string[], put: AnnotationItem[]): AnnotationItem[] {
  const at = items.findIndex((it) => gone.includes(it.id));
  const rest = items.filter((it) => !gone.includes(it.id));
  const k = at < 0 ? rest.length : items.slice(0, at).filter((it) => !gone.includes(it.id)).length;
  return [...rest.slice(0, k), ...put, ...rest.slice(k)];
}
const download = (name: string, text: string, type = 'application/json') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const readFiles = (accept: string, multiple: boolean, then: (files: File[]) => void) => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.multiple = multiple;
  inp.onchange = () => then(Array.from(inp.files ?? []));
  inp.click();
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="de-section">
      <button className="nodrag de-section-head" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />} {title}
      </button>
      {open && <div className="de-section-body">{children}</div>}
    </div>
  );
}

// ---- what can be done with the selection ----
export function ObjectOps({ ctx }: { ctx: Ctx }) {
  const { items, setItems, sel, setSel, selBox } = ctx;
  const selected = items.filter((it) => sel.includes(it.id));
  // the shapes paths can be made of (not instances nor pictures)
  const shapes = selected.filter((it) => it.type === 'shape' && it.spec.kind !== 'component' && it.spec.kind !== 'image');
  const paths = shapes.filter((it) => it.type === 'shape' && shapeSpec(it.spec).kind === 'path');
  const closedOnes = shapes.filter((it) => {
    const d = pathOf(it);
    return !!d && isClosed(parsePath(d));
  });
  const [busy, setBusy] = useState('');
  // the nodes picked: only theirs (one path selected, already a path)
  const only = ctx.nodes.length && paths.length === 1 && selected.length === 1 ? new Set(ctx.nodes) : undefined;
  const [dist, setDist] = useState(1);
  const [corner, setCorner] = useState(1);
  const run = (what: string, f: () => Promise<void>) => {
    setBusy(what);
    f()
      .catch((e: Error) => notify(`${what}: ${e.message}`))
      .finally(() => setBusy(''));
  };
  // combined: the result where the back one was, in its look; the others gone
  const bool = (op: BoolOp) =>
    run('Combine', async () => {
      const list = items.filter((it) => sel.includes(it.id) && pathOf(it));
      const res = await combine(list.map((it) => pathOf(it)!), op);
      const base = toPathItem(list[0])!;
      const made = res.map((d, k) => ({ ...base, id: k ? newId() : base.id, spec: { ...base.spec, d, head1: 'none', head2: 'none' } }) as AnnotationItem);
      setItems(replaceAt(items, list.map((it) => it.id), made));
      setSel(made.map((it) => it.id));
    });
  const offset = (sign: number) =>
    run('Offset', async () => {
      const made: AnnotationItem[] = [];
      for (const it of closedOnes) {
        const d = await offsetPath(pathOf(it)!, sign * Math.abs(dist), 'round');
        const base = toPathItem(it)!;
        made.push({ ...base, id: newId(), name: undefined, spec: { ...base.spec, d } } as AnnotationItem);
      }
      setItems([...items, ...made]);
      setSel(made.map((it) => it.id));
    });
  const outline = () =>
    run('Stroke to path', async () => {
      let list = items;
      const made: string[] = [];
      for (const it of shapes) {
        if (it.type !== 'shape') continue;
        const s = shapeSpec(it.spec);
        const d = pathOf(it);
        if (!d || !(s.width > 0)) continue;
        const o = await strokeOutline(d, s.width / (72 / 25.4), s.cap ?? 'butt', s.join ?? 'miter');
        const base = toPathItem(it)!;
        const line = { ...base, id: newId(), spec: { ...base.spec, d: o, fill: s.color, fillOpacity: s.opacity, width: 0, head1: 'none', head2: 'none' } } as AnnotationItem;
        // a filled one keeps its fill under the outline
        const put = s.fill ? [{ ...base, spec: { ...base.spec, width: 0 } } as AnnotationItem, line] : [line];
        list = replaceAt(list, [it.id], put);
        made.push(line.id);
      }
      setItems(list);
      setSel(made);
    });
  const toPaths = () => {
    const map = new Map(shapes.map((it) => [it.id, toPathItem(it)]));
    setItems(items.map((it) => map.get(it.id) ?? it));
  };
  // node edits on the one path selected; adding nodes; breaking it; joining two
  const onePath = paths.length === 1 && selected.length === 1 ? paths[0] : null;
  const editOne = (f: (segs: ReturnType<typeof parsePath>) => ReturnType<typeof parsePath>) => {
    if (!onePath || onePath.type !== 'shape') return;
    setItems(items.map((it) => (it.id === onePath.id ? ({ ...it, spec: { ...it.spec, d: pathText(f(parsePath(onePath.spec.d))) } } as AnnotationItem) : it)));
  };
  const addNodes = () =>
    editPaths((segs) => {
      if (onePath && ctx.nodes.length) return [...ctx.nodes].sort((a, b) => b - a).reduce((acc, i) => splitSegment(acc, i + 1), segs);
      const k = longestSegment(segs);
      return k >= 0 ? splitSegment(segs, k) : segs;
    });
  const breakPath = () => {
    if (!onePath || onePath.type !== 'shape' || ctx.nodes.length !== 1) return;
    const parts = breakAt(parsePath(onePath.spec.d), ctx.nodes[0]);
    const made = parts.map((segs, k) => ({ ...onePath, id: k ? newId() : onePath.id, spec: { ...onePath.spec, d: pathText(segs) } }) as AnnotationItem);
    setItems(replaceAt(items, [onePath.id], made));
    setSel(made.map((it) => it.id));
  };
  const openOnes = shapes.filter((it) => {
    const d = pathOf(it);
    return !!d && !isClosed(parsePath(d));
  });
  const join = () => {
    if (openOnes.length !== 2) return;
    const [a, b] = openOnes;
    const base = toPathItem(a)!;
    const d = pathText(joinPaths(parsePath(pathOf(a)!), parsePath(pathOf(b)!), 0.05));
    const made = { ...base, spec: { ...base.spec, d } } as AnnotationItem;
    setItems(replaceAt(items, [a.id, b.id], [made]));
    setSel([made.id]);
  };
  const editPaths = (f: (segs: ReturnType<typeof parsePath>) => ReturnType<typeof parsePath>) =>
    setItems(
      items.map((it) => {
        if (!sel.includes(it.id) || it.type !== 'shape') return it;
        const p = shapeSpec(it.spec).kind === 'path' ? it : toPathItem(it);
        if (!p || p.type !== 'shape') return it;
        return { ...p, spec: { ...p.spec, d: pathText(f(parsePath(p.spec.d))) } } as AnnotationItem;
      }),
    );
  // clip / mask: the others by the top one (hidden: it only cuts or shows)
  const top = selected[selected.length - 1];
  const clip = (field: 'clipBy' | 'maskBy') => setItems(items.map((it) => (it.id === top.id ? { ...it, hidden: true } : sel.includes(it.id) ? { ...it, [field]: top.id } : it)));
  const release = () => {
    const used = new Set(selected.flatMap((it) => [it.clipBy, it.maskBy].filter(Boolean) as string[]));
    setItems(items.map((it) => (sel.includes(it.id) ? { ...it, clipBy: undefined, maskBy: undefined } : used.has(it.id) ? { ...it, hidden: undefined } : it)));
  };
  const group = () => setItems(groupItems(items, sel));
  const ungroup = () => setItems(ungroupItems(items, sel));
  // a component from the selection: kept once, an instance in its place
  const comps = ctx.data.components ?? [];
  const makeComponent = () => {
    if (!selBox) return;
    const id = `c${newId()}`;
    const comp: DrawingComponent = { id, name: `Component ${comps.length + 1}`, w: +selBox.w.toFixed(3) || 1, h: +selBox.h.toFixed(3) || 1, items: selected.map((it) => mapItem({ ...it, group: undefined }, ([x, y]) => [x - selBox.x, y - selBox.y])) };
    const inst = newAnnotation('shape', { kind: 'component', coords: 'data', ref: id, x1: selBox.x, y1: selBox.y, x2: selBox.x + comp.w, y2: selBox.y + comp.h, width: 0 });
    ctx.set({ components: [...comps, comp], annotations: replaceAt(items, sel, [inst]) });
    setSel([inst.id]);
  };
  const instances = selected.filter((it) => it.type === 'shape' && it.spec.kind === 'component');
  const detach = () => {
    let list = items;
    for (const it of instances) {
      if (it.type !== 'shape') continue;
      const s = shapeSpec(it.spec);
      const comp = comps.find((c) => c.id === s.ref);
      if (comp) list = replaceAt(list, [it.id], copiesOf(placeComponent(s, comp, ''), (x) => x));
    }
    setItems(list);
  };
  const [target, setTarget] = useState('');
  const updateComponent = () => {
    const comp = comps.find((c) => c.id === target);
    if (!comp || !selBox) return;
    ctx.set({ components: comps.map((c) => (c.id === comp.id ? { ...c, w: +selBox.w.toFixed(3) || 1, h: +selBox.h.toFixed(3) || 1, items: selected.map((it) => mapItem({ ...it, group: undefined }, ([x, y]) => [x - selBox.x, y - selBox.y])) } : c)) });
  };
  // arrays
  const [grid, setGrid] = useState({ rows: 2, cols: 3, dx: NaN, dy: NaN });
  const [ring, setRing] = useState({ n: 6, r: 15, turn: true });
  const doGrid = () => {
    if (!selBox) return;
    const dx = Number.isFinite(grid.dx) ? grid.dx : selBox.w + 2;
    const dy = Number.isFinite(grid.dy) ? grid.dy : selBox.h + 2;
    setItems([...items, ...gridArray(selected, Math.max(1, grid.rows), Math.max(1, grid.cols), dx, dy)]);
  };
  // along a path: the front object selected with an outline is the path, the others are copied along it
  const guide = selected.length >= 2 ? [...selected].reverse().find((it) => it.type === 'shape' && !!pathOf(it)) : undefined;
  const [along, setAlong] = useState({ n: 8, turn: true });
  const doAlong = () => {
    if (!guide) return;
    const rest = selected.filter((it) => it.id !== guide.id);
    const boxes = rest.map(ctx.boxMm).filter((b): b is Rect => !!b);
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const from: [number, number] = [(x0 + Math.max(...boxes.map((b) => b.x + b.w))) / 2, (y0 + Math.max(...boxes.map((b) => b.y + b.h))) / 2];
    const made = pathArray(rest, pathOf(guide)!, along.n, from, along.turn);
    setItems([...items, ...made]);
    setSel(made.map((it) => it.id));
  };
  const doRing = () => {
    if (!selBox) return;
    const from: [number, number] = [selBox.x + selBox.w / 2, selBox.y + selBox.h / 2];
    setItems([...items, ...circleArray(selected, Math.max(2, ring.n), [from[0], from[1] + ring.r], from, ring.turn)]);
  };
  // styles
  const [styles, setStyles] = useState<SavedStyle[]>(listStyles);
  const [styleName, setStyleName] = useState('');
  const kind = selected[0]?.type === 'text' ? 'text' : 'shape';
  const applyStyle = (st: Record<string, unknown>, k: string) => setItems(items.map((it) => (sel.includes(it.id) && it.type === k ? ({ ...it, spec: { ...it.spec, ...st } } as AnnotationItem) : it)));
  const colors = colorsOf(selected);
  return (
    <div className="de-ops">
      {busy && <div className="hint">{busy}…</div>}
      {shapes.length > 0 && (
        <Section title="Path">
          <div className="row wrap">
            {shapes.length > paths.length && (
              <button className="nodrag" title="Turn the shapes into paths: their nodes can then be moved one by one (double-click a node: remove it; Alt + click: smooth / corner; double-click the path: a node there)" onClick={toPaths}>
                Convert to path
              </button>
            )}
            <button className="nodrag" title="The line made the outline it covers, filled (Stroke to path)" onClick={outline}>
              Stroke to path
            </button>
          </div>
          {closedOnes.length >= 2 && (
            <div className="row wrap" title="Combine the closed shapes selected (the result in the look of the back one)">
              <button className="nodrag" title="Union: all of them as one" onClick={() => bool('unite')}>
                <SquaresUnite {...IC} /> Union
              </button>
              <button className="nodrag" title="Subtract: the back one minus the others" onClick={() => bool('subtract')}>
                <SquaresSubtract {...IC} /> Subtract
              </button>
              <button className="nodrag" title="Intersect: what they all cover" onClick={() => bool('intersect')}>
                <SquaresIntersect {...IC} /> Intersect
              </button>
              <button className="nodrag" title="Exclude: what an odd number of them cover" onClick={() => bool('exclude')}>
                <SquaresExclude {...IC} /> Exclude
              </button>
              <button className="nodrag" title="Divide: the back one cut into the pieces the others make of it" onClick={() => bool('divide')}>
                <Split {...IC} /> Divide
              </button>
            </div>
          )}
          {closedOnes.length > 0 && (
            <Field label="Offset" title="A copy moved out (outset) or in (inset) by this many mm, its corners round">
              <span className="row">
                <NumInput className="tiny" min={0.01} step={0.25} value={dist} onChange={(v) => setDist(v > 0 ? v : 1)} />
                <span className="muted">mm</span>
                <button className="nodrag" onClick={() => offset(1)}>
                  Outset
                </button>
                <button className="nodrag" onClick={() => offset(-1)}>
                  Inset
                </button>
              </span>
            </Field>
          )}
          <Field label={ctx.nodes.length ? `Corners (${ctx.nodes.length} node${ctx.nodes.length > 1 ? 's' : ''})` : 'Corners'} title="The corners between two straight pieces rounded (fillet, its radius) or cut (chamfer, so far from the corner), in mm — every one, or only the nodes picked (click a node; Shift + click: more)">
            <span className="row">
              <NumInput className="tiny" min={0.01} step={0.25} value={corner} onChange={(v) => setCorner(v > 0 ? v : 1)} />
              <span className="muted">mm</span>
              <button className="nodrag" onClick={() => editPaths((s) => roundCorners(s, corner, false, only))}>
                Round
              </button>
              <button className="nodrag" onClick={() => editPaths((s) => roundCorners(s, corner, true, only))}>
                Cut
              </button>
            </span>
          </Field>
          {paths.length > 0 && (
            <div className="row wrap">
              <button className="nodrag" title="Every node smooth (a curve through them)" onClick={() => editPaths(smoothAll)}>
                Smooth nodes
              </button>
              <button className="nodrag" title="Every node a corner (straight pieces)" onClick={() => editPaths(sharpAll)}>
                Sharp nodes
              </button>
              <button className="nodrag" title="Closed (a shape) or open (a line)" onClick={() => editPaths((s) => setClosed(s, !isClosed(s)))}>
                Close / open
              </button>
              <button className="nodrag" title="Drawn the other way (its heads change ends)" onClick={() => editPaths(reversePath)}>
                Reverse
              </button>
            </div>
          )}
          {paths.length > 0 && (
            <div className="row wrap" title="Nodes: picked by a click on them (Shift: more); also a double-click on the path adds one there, on a node removes it">
              <button className="nodrag" title="A node in the middle of the piece after each node picked (none picked: of its longest piece)" onClick={addNodes}>
                + Node
              </button>
              <button className="nodrag" disabled={!onePath || !ctx.nodes.length} title="The nodes picked removed (the curves either side made one)" onClick={() => editOne((s) => [...ctx.nodes].sort((a, b) => b - a).reduce((acc, i) => deleteNode(acc, i), s))}>
                − Node
              </button>
              <button className="nodrag" disabled={!onePath || ctx.nodes.length !== 1} title="The path broken at the node picked: a closed one opened there, an open one cut in two" onClick={breakPath}>
                Break at node
              </button>
              <button className="nodrag" disabled={openOnes.length !== 2} title="Two open paths (or lines) made one: their nearest ends joined — one node where they meet, else a straight piece between them" onClick={join}>
                Join
              </button>
            </div>
          )}
        </Section>
      )}
      {selected.length > 0 && (
        <Section title="Clip, mask, group">
          <div className="row wrap">
            {selected.length >= 2 && top?.type === 'shape' && (
              <>
                <button className="nodrag" title="The others cut to the outline of the front one (which is hidden)" onClick={() => clip('clipBy')}>
                  Clip
                </button>
                <button className="nodrag" title="The others seen through the front one: where it is white all of them, black none (a gradient: a fade); it is hidden" onClick={() => clip('maskBy')}>
                  Mask
                </button>
              </>
            )}
            {selected.some((it) => it.clipBy || it.maskBy) && (
              <button className="nodrag" title="No clip nor mask (the shape that cut them shown again)" onClick={release}>
                Release
              </button>
            )}
            {selected.length >= 2 && (
              <button className="nodrag" title="Group (Ctrl+G): selected and moved together (Alt + click: one of them)" onClick={group}>
                Group
              </button>
            )}
            {selected.some((it) => it.group) && (
              <button className="nodrag" title="Ungroup (Ctrl+Shift+G)" onClick={ungroup}>
                Ungroup
              </button>
            )}
          </div>
        </Section>
      )}
      {selected.length > 0 && (
        <Section title="Component">
          <div className="row wrap">
            <button className="nodrag" title="Keep these objects once, as a component: an instance takes their place; insert more from the Components tab — every instance changes with the component" onClick={makeComponent}>
              Make component
            </button>
            {instances.length > 0 && (
              <button className="nodrag" title="The instance turned back into objects of their own" onClick={detach}>
                Detach
              </button>
            )}
          </div>
          {comps.length > 0 && (
            <Field label="Update" title="The component made of the objects selected instead (every instance changes)">
              <span className="row">
                <Select value={target} options={[['', 'component…'], ...comps.map((c): [string, string] => [c.id, c.name])]} onChange={setTarget} />
                <button className="nodrag" disabled={!target} onClick={updateComponent}>
                  Update
                </button>
              </span>
            </Field>
          )}
        </Section>
      )}
      {selected.length > 0 && (
        <Section title="Array">
          <Field label="Grid" title="Copies in rows × columns, so many mm apart (empty: the size of the selection + 2 mm)">
            <span className="row wrap">
              <NumInput className="tiny" min={1} step={1} value={grid.rows} onChange={(v) => setGrid({ ...grid, rows: Math.max(1, Math.round(v) || 1) })} />×
              <NumInput className="tiny" min={1} step={1} value={grid.cols} onChange={(v) => setGrid({ ...grid, cols: Math.max(1, Math.round(v) || 1) })} />
              <NumInput className="tiny" step={0.5} value={grid.dx} placeholder="dx" onChange={(v) => setGrid({ ...grid, dx: v })} />
              <NumInput className="tiny" step={0.5} value={grid.dy} placeholder="dy" onChange={(v) => setGrid({ ...grid, dy: v })} />
              <button className="nodrag" onClick={doGrid}>
                Make
              </button>
            </span>
          </Field>
          {guide && (
            <Field label="Along a path" title={`So many copies of the other objects selected along “${nameOf(guide)}” (the front one with an outline): evenly from end to end of an open one, round a closed one — turned with it or not; the originals stay`}>
              <span className="row wrap">
                <NumInput className="tiny" min={1} step={1} value={along.n} onChange={(v) => setAlong({ ...along, n: Math.max(1, Math.round(v) || 1) })} />
                <Check label="turned" value={along.turn} onChange={(turn) => setAlong({ ...along, turn })} />
                <button className="nodrag" onClick={doAlong}>
                  Make
                </button>
              </span>
            </Field>
          )}
          <Field label="Circle" title="So many round a circle (the selection the first, at its top), its radius in mm, turned with it or not">
            <span className="row wrap">
              <NumInput className="tiny" min={2} step={1} value={ring.n} onChange={(v) => setRing({ ...ring, n: Math.max(2, Math.round(v) || 2) })} />
              <NumInput className="tiny" min={0.1} step={1} value={ring.r} onChange={(v) => setRing({ ...ring, r: v > 0 ? v : 10 })} />
              <Check label="turned" value={ring.turn} onChange={(turn) => setRing({ ...ring, turn })} />
              <button className="nodrag" onClick={doRing}>
                Make
              </button>
            </span>
          </Field>
        </Section>
      )}
      {selected.length > 0 && (
        <Section title="Style">
          <div className="row wrap">
            <button className="nodrag" title="Copy the look of the first object selected (Ctrl+Shift+C)" onClick={() => copyStyle(selected[0])}>
              Copy style
            </button>
            <button className="nodrag" title="Give the objects selected the look copied (Ctrl+Shift+V)" onClick={() => {
                const list = pasteStyle(items, sel);
                if (list) setItems(list);
              }}>
              Paste style
            </button>
          </div>
          <Field label="Saved" title="Styles kept in this browser, for any drawing">
            <span className="row wrap">
              <Select
                value=""
                options={[['', styles.filter((s) => s.kind === kind).length ? 'apply…' : 'none saved'], ...styles.filter((s) => s.kind === kind).map((s): [string, string] => [s.name, s.name])]}
                onChange={(n) => {
                  const st = styles.find((s) => s.name === n && s.kind === kind);
                  if (st) applyStyle(st.style, kind);
                }}
              />
              <TextInput className="short-text" value={styleName} placeholder="name" onChange={setStyleName} />
              <button
                className="nodrag"
                disabled={!styleName.trim()}
                title="Save the look of the first object selected under this name"
                onClick={() => {
                  const list = [...styles.filter((s) => !(s.name === styleName.trim() && s.kind === kind)), { name: styleName.trim(), kind, style: styleOf(selected[0].spec as Record<string, unknown>) } as SavedStyle];
                  saveStyles(list);
                  setStyles(list);
                  setStyleName('');
                }}
              >
                Save
              </button>
              {styles.some((s) => s.kind === kind) && (
                <Select
                  value=""
                  options={[['', 'remove…'], ...styles.filter((s) => s.kind === kind).map((s): [string, string] => [s.name, s.name])]}
                  onChange={(n) => {
                    const list = styles.filter((s) => !(s.name === n && s.kind === kind));
                    saveStyles(list);
                    setStyles(list);
                  }}
                />
              )}
            </span>
          </Field>
          {colors.length > 0 && (
            <Field label="Colours" title="The colours of the selection: change one, it changes everywhere in it">
              <span className="row wrap">
                {colors.map((c) => (
                  <input key={c} className="nodrag color" type="color" value={/^#[0-9a-f]{6}$/.test(c) ? c : '#000000'} title={c} onChange={(e) => setItems([...items.filter((it) => !sel.includes(it.id)), ...recolor(selected, c, e.target.value)].sort((a, b) => items.findIndex((x) => x.id === a.id) - items.findIndex((x) => x.id === b.id)))} />
                ))}
              </span>
            </Field>
          )}
        </Section>
      )}
    </div>
  );
}

// A text written along another object's outline.
export function TextPathFields({ it, items, set }: { it: AnnotationItem; items: AnnotationItem[]; set: (p: Record<string, unknown>) => void }) {
  if (it.type !== 'text') return null;
  const s = it.spec;
  const shapes = items.filter((x) => x.type === 'shape' && x.id !== it.id && pathOf(x));
  return (
    <>
      <Field label="Along" title="The text written along the outline of another object (a path, a line, a circle …)">
        <Select value={s.onPath ?? ''} options={[['', 'nothing (level)'], ...shapes.map((x): [string, string] => [x.id, nameOf(x)])]} onChange={(v) => set({ onPath: v || undefined })} />
      </Field>
      {s.onPath && (
        <div className="grid2">
          <Field label="From %" title="Where it starts along the outline, % of its length (with the anchor in the middle: where its middle is)">
            <NumInput className="short" min={0} max={100} step={5} value={+((s.pathAt ?? 0) * 100).toFixed(2)} onChange={(v) => set({ pathAt: Number.isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : undefined })} />
          </Field>
          <Field label="Distance" title="pt between the outline and the text (away from it on its side)">
            <NumInput className="short" step={0.5} value={s.pathGap ?? 0} onChange={(v) => set({ pathGap: Number.isFinite(v) && v !== 0 ? v : undefined })} />
          </Field>
          <Check label="Other side" title="On the other side of the outline: inside a circle instead of outside (the outline taken the other way round)" value={!!s.pathFlip} onChange={(pathFlip) => set({ pathFlip: pathFlip || undefined })} />
        </div>
      )}
    </>
  );
}

// A figure drawn small (the library's and the components' lists).
function Thumb({ items, w, h, k }: { items: AnnotationItem[]; w: number; h: number; k: string }) {
  const fig = drawingFigure(`thumb-${k}`, { ...DRAWING_DEFAULTS, width: w || 1, height: h || 1, background: 'none', annotations: items });
  const s = Math.min(56 / (w || 1), 40 / (h || 1));
  return (
    <span className="de-thumb">
      <FigureSvg fig={fig} display={{ width: Math.max(4, (w || 1) * s), height: Math.max(4, (h || 1) * s) }} idPrefix={`th-${k}`} />
    </span>
  );
}

// ---- the drawing's components ----
export function ComponentsTab({ ctx }: { ctx: Ctx }) {
  const comps = ctx.data.components ?? [];
  const used = (id: string) => ctx.items.filter((it) => it.type === 'shape' && it.spec.kind === 'component' && it.spec.ref === id).length;
  const insert = (c: DrawingComponent) => {
    const [x, y] = [(ctx.pageMm.w - c.w) / 2, (ctx.pageMm.h - c.h) / 2];
    const inst = newAnnotation('shape', { kind: 'component', coords: 'data', ref: c.id, x1: x, y1: y, x2: x + c.w, y2: y + c.h, width: 0 });
    ctx.setItems([...ctx.items, inst]);
    ctx.setSel([inst.id]);
  };
  return (
    <div className="de-list">
      {!comps.length && <div className="hint">No components yet: select objects, then Component ▸ Make component. Every instance changes with its component (Update).</div>}
      {comps.map((c) => (
        <div key={c.id} className="de-libitem">
          <Thumb items={c.items} w={c.w} h={c.h} k={c.id} />
          <span className="grow">
            <input className="nodrag" value={c.name} onChange={(e) => ctx.set({ components: comps.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} />
            <span className="muted"> {used(c.id)} placed</span>
          </span>
          <button className="nodrag ts-btn" title="Place an instance of it" onClick={() => insert(c)}>
            <Plus {...IC} />
          </button>
          <button
            className="nodrag ts-btn"
            title="Remove the component (its instances too)"
            onClick={async () => {
              if (used(c.id) && !(await ask(`Remove “${c.name}” and its ${used(c.id)} instance(s)?`, { ok: 'Remove', danger: true }))) return;
              ctx.set({ components: comps.filter((x) => x.id !== c.id), annotations: ctx.items.filter((it) => !(it.type === 'shape' && it.spec.ref === c.id)) });
            }}
          >
            <X {...IC} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---- the user's library (in this browser) ----
export function LibraryTab({ ctx }: { ctx: Ctx }) {
  const [list, setList] = useState<LibFigure[] | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const reload = () =>
    listFigures()
      .then(setList)
      .catch((e: Error) => setErr(e.message));
  useEffect(() => {
    reload();
  }, []);
  const selected = ctx.items.filter((it) => ctx.sel.includes(it.id));
  const place = (f: { items: AnnotationItem[]; w: number; h: number }) => {
    const [x, y] = [(ctx.pageMm.w - f.w) / 2, (ctx.pageMm.h - f.h) / 2];
    const g = f.items.length > 1 ? `g${newId()}` : undefined;
    const made = copiesOf(f.items, (it) => ({ ...mapItem(it, ([u, v]) => [u + x, v + y]), group: g }) as AnnotationItem);
    ctx.setItems([...ctx.items, ...made]);
    ctx.setSel(made.map((it) => it.id));
  };
  const addSelection = () => {
    const b = ctx.selBox;
    if (!b || !selected.length) return;
    // a component's instance: its objects (the library knows no components of a drawing)
    const comps = ctx.data.components ?? [];
    const flat = selected.flatMap((it) => {
      const c = it.type === 'shape' && it.spec.kind === 'component' ? comps.find((x) => x.id === it.spec.ref) : undefined;
      return c && it.type === 'shape' ? copiesOf(placeComponent(shapeSpec(it.spec), c, ''), (x) => x) : [it];
    });
    const f: LibFigure = { id: newFigureId(), name: name.trim() || `Figure ${(list?.length ?? 0) + 1}`, saved: Date.now(), w: +b.w.toFixed(3) || 1, h: +b.h.toFixed(3) || 1, items: flat.map((it) => mapItem({ ...it, group: undefined }, ([u, v]) => [u - b.x, v - b.y])) };
    saveFigure(f).then(reload, (e: Error) => setErr(e.message));
    setName('');
  };
  const svgFiles = (files: File[], into: 'library' | 'drawing') =>
    Promise.all(
      files.map((f) =>
        f.text().then(async (t): Promise<void> => {
          const r = importSvg(t);
          if (into === 'drawing') place(r);
          else await saveFigure({ id: newFigureId(), name: f.name.replace(/\.svg$/i, ''), saved: Date.now(), ...r });
        }),
      ),
    ).then(reload, (e: Error) => setErr(e.message));
  return (
    <div className="de-list">
      <div className="row wrap">
        <TextInput className="short-text" value={name} placeholder="name" onChange={setName} />
        <button className="nodrag" disabled={!selected.length} title="Keep the objects selected in your library (in this browser), to place them in any drawing" onClick={addSelection}>
          + Add selection
        </button>
      </div>
      <div className="row wrap">
        <button className="nodrag" title="SVG files read into editable paths, kept in the library" onClick={() => readFiles('.svg,image/svg+xml', true, (f) => svgFiles(f, 'library'))}>
          Import SVG…
        </button>
        <button className="nodrag" title="An SVG file read into editable paths, placed in this drawing" onClick={() => readFiles('.svg,image/svg+xml', false, (f) => svgFiles(f, 'drawing'))}>
          Place SVG…
        </button>
        <button className="nodrag" disabled={!list?.length} title="The whole library in a file (to keep it or give it to others)" onClick={() => list && download('figure-library.json', libraryFile(list))}>
          Export
        </button>
        <button
          className="nodrag"
          title="Figures from a library file added to yours"
          onClick={() =>
            readFiles('.json,application/json', false, ([f]) =>
              f
                ?.text()
                .then((t) => Promise.all(readLibraryFile(t).map(saveFigure)))
                .then(reload, (e: Error) => setErr(e.message)),
            )
          }
        >
          Import…
        </button>
      </div>
      {err && <div className="err-text">{err}</div>}
      {list && !list.length && <div className="hint">Your library is empty: add objects of a drawing, or import SVG files (e.g. icons of cells, molecules, instruments under a licence that lets you reuse them).</div>}
      {list?.map((f) => (
        <div key={f.id} className="de-libitem">
          <Thumb items={f.items} w={f.w} h={f.h} k={f.id} />
          <span className="grow">
            <input className="nodrag" defaultValue={f.name} onBlur={(e) => e.target.value.trim() && e.target.value !== f.name && saveFigure({ ...f, name: e.target.value.trim() }).then(reload)} />
          </span>
          <button className="nodrag ts-btn" title="Place it in this drawing" onClick={() => place(f)}>
            <Plus {...IC} />
          </button>
          <button className="nodrag ts-btn" title="Remove it from the library" onClick={() => void ask(`Remove “${f.name}” from your library?`, { ok: 'Remove', danger: true }).then((yes) => {
                if (yes) void deleteFigure(f.id).then(reload);
              })}>
            <X {...IC} />
          </button>
        </div>
      ))}
    </div>
  );
}
