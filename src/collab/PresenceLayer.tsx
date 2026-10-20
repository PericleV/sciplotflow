// The others on the canvas, while working together: each one's mouse (an arrow in their colour, with their name) and
// the nodes they have selected (outlined in their colour, their name over the outline) — only those at the level shown.
// Drawn in the canvas' coordinates, kept the same size on the screen whatever the zoom; never in the way of the mouse.
import { Fragment, useEffect, useState } from 'react';
import { useStore, ViewportPortal } from '@xyflow/react';
import type { Presence } from './presence.ts';

export function PresenceLayer({ presence, level }: { presence: Presence; level: string }) {
  const [, tick] = useState(0);
  useEffect(() => presence.onChange(() => tick((n) => n + 1)), [presence]);
  const zoom = useStore((s) => s.transform[2]);
  const lookup = useStore((s) => s.nodeLookup);
  const k = 1 / (zoom || 1);
  return (
    <ViewportPortal>
      {presence.list(level).map((o) => (
        <Fragment key={o.id}>
          {o.selected.map((id) => {
            const n = lookup.get(id);
            if (!n) return null;
            const p = n.internals.positionAbsolute;
            const w = n.measured.width ?? n.width ?? 0;
            const h = n.measured.height ?? n.height ?? 0;
            return (
              <div key={id} className="presence-sel" style={{ transform: `translate(${p.x}px, ${p.y}px)`, width: w, height: h, outline: `${2 * k}px solid ${o.color}`, outlineOffset: `${3 * k}px` }}>
                <span style={{ background: o.color, transform: `translateY(-100%) scale(${k})` }}>{o.name}</span>
              </div>
            );
          })}
          {o.cursor && (
            <div className="presence-cursor" style={{ transform: `translate(${o.cursor.x}px, ${o.cursor.y}px) scale(${k})`, color: o.color }}>
              <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
                <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="currentColor" stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span style={{ background: o.color }}>{o.name}</span>
            </div>
          )}
        </Fragment>
      ))}
    </ViewportPortal>
  );
}
