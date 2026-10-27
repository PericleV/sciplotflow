// Right-click menus of the canvas: add a node (with search) on the empty canvas, node actions on a node.
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NODE_COLORS } from './nodeColors.ts';
import type { AppNode } from './types.ts';

// sub: the part of its group it is listed under; search: other words it is found by
export type MenuItem = { type: AppNode['type']; label: string; group: string; sub?: string; search?: string; color?: string };
// An entry of a node / selection menu; `colors` shows a row of swatches instead of a button.
export type MenuAction =
  | { label: string; onClick: () => void; danger?: boolean; kbd?: string }
  | { colors: string[]; current?: string; onPick: (c: string) => void }
  | { choices: { label: string; group?: string }[]; placeholder: string; onChoose: (k: number) => void };
export type MenuState =
  | { kind: 'pane'; x: number; y: number }
  | { kind: 'node'; x: number; y: number; nodeId: string; label: string }
  | { kind: 'selection'; x: number; y: number; ids: string[] }
  // a connection dragged from a port and let go on the empty canvas: the nodes that can take it (or give to it), the one
  // chosen added there and connected
  | { kind: 'connect'; x: number; y: number; from: { node: string; handle: string | null; type: 'source' | 'target' } };

// Keeps the menu inside the window.
const place = (x: number, y: number, w: number, h: number): CSSProperties => ({
  left: Math.max(4, Math.min(x, window.innerWidth - w - 4)),
  top: Math.max(4, Math.min(y, window.innerHeight - h - 4)),
});

export function ContextMenu(props: {
  menu: MenuState;
  items: MenuItem[];
  onAdd: (type: AppNode['type']) => void;
  title?: string;
  actions?: MenuAction[];
  onClose: () => void;
}) {
  const { menu, items, onAdd, title, actions = [], onClose } = props;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // (searching: the Recent ones only in their own groups)
    return q ? items.filter((i) => i.group !== 'Recent' && (i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q) || i.type.includes(q) || !!i.sub?.toLowerCase().includes(q) || !!i.search?.toLowerCase().includes(q))) : items;
  }, [items, query]);

  useEffect(() => {
    input.current?.focus();
    // a press or a wheel anywhere outside the menu closes it (capture phase: the canvas stops the bubbling)
    const close = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, { passive: true, capture: true });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  if (menu.kind !== 'pane' && menu.kind !== 'connect') {
    return (
      <div className="ctx-menu" ref={box} style={place(menu.x, menu.y, 220, 60 + 30 * actions.length)} onContextMenu={(e) => e.preventDefault()}>
        <div className="ctx-title">{title}</div>
        {actions.map((a, k) =>
          'choices' in a ? (
            <select key={k} className="ctx-select" value="" onChange={(e) => (a.onChoose(Number(e.target.value)), onClose())}>
              <option value="">{a.placeholder}</option>
              {[...new Set(a.choices.map((c) => c.group ?? ''))].map((g) => (
                <optgroup key={g} label={g || ' '}>
                  {a.choices.map((c, i) =>
                    (c.group ?? '') === g ? (
                      <option key={i} value={i}>
                        {c.label}
                      </option>
                    ) : null,
                  )}
                </optgroup>
              ))}
            </select>
          ) : 'colors' in a ? (
            <div key={k} className="ctx-colors">
              {a.colors.map((c) => (
                <button key={c} className={`ctx-color${c === a.current ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => (a.onPick(c), onClose())} />
              ))}
            </div>
          ) : (
            <button key={k} className={a.danger ? 'danger' : ''} onClick={() => (a.onClick(), onClose())}>
              {a.label} {a.kbd && <span className="kbd">{a.kbd}</span>}
            </button>
          ),
        )}
      </div>
    );
  }

  const groups = [...new Set(shown.map((i) => i.group))];
  const add = (t: AppNode['type']) => {
    onAdd(t);
    onClose();
  };
  return (
    <div className="ctx-menu add" ref={box} style={place(menu.x, menu.y, 260, 420)} onContextMenu={(e) => e.preventDefault()}>
      <input
        ref={input}
        className="ctx-search"
        placeholder="Add node… (type to search)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(shown.length - 1, a + 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
          else if (e.key === 'Enter' && shown[active]) add(shown[active].type);
          else return;
          e.preventDefault();
        }}
      />
      <div className="ctx-list">
        {!shown.length && <div className="muted ctx-empty">No node matches “{query}”.</div>}
        {groups.map((g) => (
          <div key={g}>
            <div className="ctx-group">{g}</div>
            {shown
              .filter((i) => i.group === g)
              .map((i, j, inGroup) => {
                const k = shown.indexOf(i);
                return (
                  <Fragment key={`${g}-${i.type}`}>
                  {i.sub && i.sub !== inGroup[j - 1]?.sub && <div className="ctx-sub">{i.sub}</div>}
                  <button
                    className={k === active ? 'active' : ''}
                    style={{ '--node-color': i.color ?? NODE_COLORS[i.type] } as CSSProperties}
                    onMouseEnter={() => setActive(k)}
                    onClick={() => add(i.type)}
                  >
                    <i className="ctx-swatch" />
                    {i.label}
                  </button>
                  </Fragment>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
