// Recording mode (the page opened with ?record): what scripts/gifs/record.ts drives to film the app for the README.
// window.__rec plays the same moves as Show me (the drawn pointer, a node dragged, a value typed) and does what a
// short film needs: an example opened, nodes brought into view and selected, the theme and colours changed, the box
// of the page worth filming. Nothing of it is there in normal use.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { play, Player, type Cursor } from './animate.ts';
import { buttonIn, field, nodeEl, optionButton, type Act, type TourApi } from './kit.ts';
import { Pointer } from './TourPanel.tsx';
import { uvVisText } from './first.ts';
import { SMOOTH_DEFAULTS } from '../defaults.ts';

export type RecordExtra = {
  blank: () => void;
  example: (name: string) => Promise<boolean>;
  focus: (ids: string[], room?: number) => Promise<void>;
  // one node at the top left, as large as fits beside the Options panel (a tall node: its top part)
  focusTop: (id: string, room?: number) => Promise<void>;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  setColors: (c: { select: string; accent: string }) => void;
};
type Box = { x: number; y: number; w: number; h: number };

export function RecordLayer({ api, extra }: { api: TourApi; extra: RecordExtra }) {
  const [cursor, setCursor] = useState<Cursor | null>(null);
  useEffect(() => {
    const at = { x: window.innerWidth * 0.55, y: window.innerHeight * 0.6 };
    (window as unknown as { __rec: unknown }).__rec = {
      ...extra,
      api,
      kit: { field, optionButton, nodeEl, buttonIn },
      // the example file of the first tour (an absorption spectrum of two samples); a node's starting settings
      uvVis: uvVisText(),
      defaults: { smooth: SMOOTH_DEFAULTS },
      // the moves played with the drawn pointer (it stays where it ended, for the next ones)
      play: async (acts: Act[]) => {
        const p = new Player((c) => {
          at.x = c.x;
          at.y = c.y;
          setCursor(c);
        }, at);
        try {
          await play(acts, p, api);
        } finally {
          setCursor(null);
        }
      },
      // the nodes of a type (newest last)
      ids: (type: string) => api.nodes().filter((n) => n.type === type).map((n) => n.id),
      // the box around these nodes and the Options panel when open, a margin around it, inside the page
      box: (ids: string[], margin = 16): Box | null => {
        const rs = ids.map((id) => nodeEl(document, id)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
        const ins = document.querySelector('.inspector.overlay')?.getBoundingClientRect();
        if (ins) rs.push(ins);
        if (!rs.length) return null;
        const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - margin);
        const y = Math.max(0, Math.min(...rs.map((r) => r.top)) - margin);
        const right = Math.min(window.innerWidth, Math.max(...rs.map((r) => r.right)) + margin);
        const bottom = Math.min(window.innerHeight, Math.max(...rs.map((r) => r.bottom)) + margin);
        return { x: Math.round(x), y: Math.round(y), w: Math.round(right - x), h: Math.round(bottom - y) };
      },
      wait: (ms: number) => new Promise((r) => setTimeout(r, ms)),
      // the Nodes and Options panels opened or folded (undefined: left as they are)
      panels: async (nodes?: boolean, options?: boolean) => {
        const turn = async (open: boolean | undefined, openSel: string, foldedSel: string) => {
          if (open === undefined) return;
          const isOpen = !!document.querySelector(openSel);
          if (isOpen === open) return;
          document.querySelector<HTMLElement>(`${isOpen ? openSel : foldedSel} .palette-toggle`)?.click();
          await new Promise((r) => setTimeout(r, 400));
        };
        await turn(nodes, '.palette.overlay:not(.inspector)', '.palette.folded:not(.inspector)');
        await turn(options, '.inspector.overlay', '.inspector.folded');
      },
    };
  });
  return createPortal(<div className="tour-layer">{cursor && <Pointer c={cursor} />}</div>, document.body);
}
