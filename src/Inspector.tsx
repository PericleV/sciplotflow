// The options panel, at the right of the canvas — the twin of the nodes panel at its left: a head with its title and
// » (it folds to a thin strip; folded when the app opens, unfolded by a node clicked — also after it was folded by
// hand —, folded again by a click on the empty canvas unless something is pinned), sections that fold. A section for the node clicked (the one selected) and
// one for every node pinned (the pin: it stays while other nodes are clicked, so several can be seen at once); a section
// holds its node's options (NodeOptions draws them there). Its width is dragged at its left edge and kept. Above them,
// the data inspected (Inspect: a node's outputs, or what a connection carries), each pinned or closed apart.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { useLeaving } from './useLeaving.ts';
import { nodeColor, nodeDisplayName } from './nodeColors.ts';
import { setSlot } from './nodes/inspectorStore.ts';
import { PinIcon } from './nodes/icons.tsx';
import type { AppNode } from './types.ts';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';
import { DataSection, type DataTarget } from './DataInspect.tsx';
import type { Edge } from '@xyflow/react';
import type { NodeResult } from './engine/evaluate.ts';

// the data inspected and what they are read from (the results, the nodes and connections of the graph shown)
export type InspectData = { targets: DataTarget[]; results: Map<string, NodeResult>; nodes: AppNode[]; edges: Edge[]; onPin: (t: DataTarget, on: boolean) => void; onClose: (t: DataTarget) => void };

const KEY = 'graph-flow:inspector';
const MIN_W = 300;
const MAX_W = 900;
type State = { open: boolean; width: number };
function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<State>;
    const w = Number(s.width);
    return { open: s.open !== false, width: w >= MIN_W && w <= MAX_W ? w : 420 };
  } catch {
    return { open: true, width: 420 };
  }
}
function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the layout is simply not remembered */
  }
}

function Section({ node, pinned, onPin, top }: { node: AppNode; pinned: boolean; onPin: (on: boolean) => void; top?: ReactNode }) {
  const [open, setOpen] = useState(true);
  // where the node draws its options
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!open || !el) return;
    setSlot(node.id, el);
    return () => setSlot(node.id, null);
  }, [node.id, open]);
  const color = nodeColor(node);
  return (
    <section className={`inspector-section${pinned ? ' pinned' : ''}`} data-node={node.id} style={{ '--node-color': color } as CSSProperties}>
      <div className="inspector-section-head">
        <button className="palette-group" style={{ color }} aria-expanded={open} title={open ? 'Fold' : 'Unfold'} onClick={() => setOpen((o) => !o)}>
          <span className="chev">{open ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />}</span> <span className="ellipsis">{nodeDisplayName(node)}</span>
        </button>
        <button className={`palette-toggle inspector-pin${pinned ? ' on' : ''}`} title={pinned ? 'Pinned: stays while other nodes are clicked; click to unpin' : 'Pin: keep these options while other nodes are clicked'} onClick={() => onPin(!pinned)}>
          <PinIcon />
        </button>
      </div>
      {open && top && <div className="node inspector-options inspector-top">{top}</div>}
      {open && <div ref={body} className="inspector-body" />}
    </section>
  );
}

// paneClicks: counts the clicks on the empty canvas (each folds the panel when nothing is pinned); nodeClicks: the
// clicks on a node (each unfolds it, the same node clicked again too)
// top: what goes above a node's options (a step of a Batch: its changes for every file or each its own, skipped or not)
export function Inspector({ current, pinned, onPin, paneClicks = 0, nodeClicks = 0, data, top }: { current: AppNode | null; pinned: AppNode[]; onPin: (id: string, on: boolean) => void; paneClicks?: number; nodeClicks?: number; data?: InspectData; top?: (n: AppNode) => ReactNode }) {
  // folded when the app opens; a node clicked (or chosen another way) unfolds it
  const [state, setState] = useState<State>(() => ({ ...load(), open: false }));
  const update = (patch: Partial<State>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    });
  // another node chosen, or a node clicked (the same one again too): unfolded
  const [seen, setSeen] = useState({ node: current?.id ?? null, clicks: nodeClicks });
  const node = current?.id ?? null;
  if (node !== seen.node || nodeClicks !== seen.clicks) {
    setSeen({ node, clicks: nodeClicks });
    if (!state.open && (nodeClicks !== seen.clicks || node)) setState({ ...state, open: true });
  }
  // a click on the empty canvas: folded (not by hand: the next node clicked unfolds it), unless options are pinned
  const [seenClicks, setSeenClicks] = useState(paneClicks);
  if (paneClicks !== seenClicks) {
    setSeenClicks(paneClicks);
    if (!pinned.length && !data?.targets.some((t) => t.pinned) && state.open) setState({ ...state, open: false });
  }
  const fold = (open: boolean) => update({ open });
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [width, setWidth] = useState(state.width);
  const down = (e: PointerEvent) => {
    drag.current = { x: e.clientX, w: width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (drag.current) setWidth(Math.min(MAX_W, Math.max(MIN_W, drag.current.w + drag.current.x - e.clientX)));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    update({ width });
  };
  const sections = [...(current && !pinned.some((p) => p.id === current.id) ? [current] : []), ...pinned];

  // unfolded over the canvas (the nodes under it do not move; the canvas keeps its size), sliding in and out; its strip
  // always in its place; the same places in the tree, so the options keep their state
  const { shown: open, closing, opening } = useLeaving(state.open);
  return (
    <>
      <aside className="palette inspector folded">
        <button className="palette-toggle" title="Show the options" onClick={() => fold(true)}>
          «
        </button>
        <span className="palette-vertical">Options</span>
      </aside>
      {open ? (
        <aside className={`palette inspector nokey overlay${closing ? ' closing' : opening ? ' opening' : ''}`} style={{ width, '--w': `${width}px` } as CSSProperties}>
          <div className="inspector-resize" title="Drag to change the width of the panel" onPointerDown={down} onPointerMove={move} onPointerUp={up} />
          <div className="palette-head">
            <strong>Options</strong>
            <button className="palette-toggle" title="Hide the panel (more room for the canvas)" onClick={() => fold(false)}>
              »
            </button>
          </div>
          <div className="palette-list">
            {data?.targets.map((t) => (
              <DataSection key={`${t.kind}-${t.id}`} target={t} results={data.results} nodes={data.nodes} edges={data.edges} onPin={(on) => data.onPin(t, on)} onClose={() => data.onClose(t)} />
            ))}
            {sections.map((n) => (
              <Section key={n.id} node={n} pinned={pinned.some((p) => p.id === n.id)} onPin={(on) => onPin(n.id, on)} top={top?.(n)} />
            ))}
            {!sections.length && !data?.targets.length && <div className="muted palette-empty">Click a node: its options appear here.</div>}
          </div>
          <div className="hint palette-foot">Click a node to see its options; the pin keeps them while you click others.</div>
        </aside>
      ) : null}
    </>
  );
}
