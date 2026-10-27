// The nodes, in a panel on the left of the canvas: sections that fold, a search field; a node is dragged onto the
// canvas (dropped where the mouse is) or clicked (added in the middle of the view). The panel folds to a thin strip.
import { Fragment, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { useLeaving } from './useLeaving.ts';
import type { AppNode } from './types.ts';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Tooltip } from '@mantine/core';
import { IC } from './nodes/iconProps.ts';

// sub: the part of its group it is listed under; search: other words it is found by
export type PaletteItem = { type: AppNode['type']; label: string; help?: string; color: string; sub?: string; search?: string };
export type PaletteGroup = { name: string; color: string; items: PaletteItem[] };

export const DRAG_TYPE = 'application/x-graphflow-node';
const KEY = 'graph-flow:palette';

type State = { open: boolean; folded: string[] };
const load = (): State => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<State>;
    return { open: s.open !== false, folded: Array.isArray(s.folded) ? s.folded : [] };
  } catch {
    return { open: true, folded: [] };
  }
};
const save = (s: State) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the layout is simply not remembered */
  }
};

export function NodePalette({ groups, onAdd }: { groups: PaletteGroup[]; onAdd: (type: AppNode['type']) => void }) {
  const [state, setState] = useState<State>(load);
  const [query, setQuery] = useState('');
  const update = (patch: Partial<State>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    });
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: q ? g.items.filter((i) => i.label.toLowerCase().includes(q) || g.name.toLowerCase().includes(q) || i.type.includes(q) || !!i.sub?.toLowerCase().includes(q) || !!i.search?.toLowerCase().includes(q)) : g.items }))
        // (searching: the Recent ones are in their own groups too)
        .filter((g) => g.items.length && !(q && g.name === 'Recent')),
    [groups, q],
  );
  const drag = (e: DragEvent, type: AppNode['type']) => {
    e.dataTransfer.setData(DRAG_TYPE, type);
    e.dataTransfer.effectAllowed = 'move';
  };

  // unfolded over the canvas (the nodes under it do not move; the canvas keeps its size), sliding in and out; its strip
  // always in its place
  const { shown: open, closing, opening } = useLeaving(state.open);
  return (
    <>
      <aside className="palette folded">
        <button className="palette-toggle" title="Show the nodes" onClick={() => update({ open: true })}>
          »
        </button>
        <span className="palette-vertical">Nodes</span>
      </aside>
      {open ? (
        <aside className={`palette overlay${closing ? ' closing' : opening ? ' opening' : ''}`} style={{ '--w': '200px' } as CSSProperties}>
          <div className="palette-head">
            <strong>Nodes</strong>
            <button className="palette-toggle" title="Hide the panel (more room for the canvas)" onClick={() => update({ open: false })}>
              «
            </button>
          </div>
          <label className="palette-search-box">
            <Search size={14} aria-hidden="true" />
            <input className="palette-search" placeholder="Search the nodes" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
            {query && (
              <button className="palette-clear" title="Clear the search" aria-label="Clear the search" onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            )}
          </label>
          <div className="palette-list">
            {shown.map((g) => {
              const folded = !q && state.folded.includes(g.name);
              return (
                <section key={g.name}>
                  <button
                    className="palette-group"
                    style={{ color: g.color }}
                    aria-expanded={!folded}
                    onClick={() => update({ folded: folded ? state.folded.filter((x) => x !== g.name) : [...state.folded, g.name] })}
                  >
                    <span className="chev">{folded ? <ChevronRight {...IC} /> : <ChevronDown {...IC} />}</span>
                    <span className="grow">{g.name}</span>
                    <span className="palette-count">{g.items.length}</span>
                  </button>
                  {!folded &&
                    g.items.map((i, k) => {
                      // (a part of the group: its title, folded with what is under it)
                      const subKey = `${g.name}/${i.sub ?? ''}`;
                      const head = i.sub && i.sub !== g.items[k - 1]?.sub;
                      const subFolded = !q && !!i.sub && state.folded.includes(subKey);
                      return (
                        <Fragment key={i.type}>
                          {head && (
                            <button className="palette-sub" aria-expanded={!subFolded} onClick={() => update({ folded: subFolded ? state.folded.filter((x) => x !== subKey) : [...state.folded, subKey] })}>
                              <span className="chev">{subFolded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
                              <span className="grow">{i.sub}</span>
                            </button>
                          )}
                          {!subFolded && (
                            <Tooltip
                              position="right"
                              openDelay={500}
                              label={
                                <>
                                  <b>{i.label}</b>
                                  {i.help && <div>{i.help}</div>}
                                  <div className="palette-tip-hint">Drag it onto the canvas, or click to add it in the middle of the view.</div>
                                </>
                              }
                            >
                              <button className="palette-item" draggable onDragStart={(e) => drag(e, i.type)} onClick={() => onAdd(i.type)} style={{ '--node-color': i.color } as CSSProperties}>
                                <span className="pi-dot" aria-hidden="true" />
                                <span className="ellipsis">{i.label}</span>
                              </button>
                            </Tooltip>
                          )}
                        </Fragment>
                      );
                    })}
                </section>
              );
            })}
            {!shown.length && <div className="muted palette-empty">No node matches “{query}”.</div>}
          </div>
          <div className="hint palette-foot">Drag a node onto the canvas, or click it. Right-click on the canvas: the same list.</div>
        </aside>
      ) : null}
    </>
  );
}
