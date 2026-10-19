// The options panel: where, in the panel, the options of every node shown there are drawn (a card each — the node
// clicked, and the nodes pinned). A node puts its options there through NodeOptions (a portal), so they stay part of
// the node: its result, its connections and its settings work as when they were drawn in it.
import { createContext, useSyncExternalStore } from 'react';

// True inside a node's options drawn in the panel: a port there would be cut off from its node (Port refuses it).
export const InPanel = createContext(false);

const slots = new Map<string, HTMLElement>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setSlot(id: string, el: HTMLElement | null) {
  if (el) {
    if (slots.get(id) === el) return;
    slots.set(id, el);
  } else if (!slots.delete(id)) return;
  changed();
}
export const useSlot = (id: string | null): HTMLElement | null => useSyncExternalStore(subscribe, () => (id ? (slots.get(id) ?? null) : null));

// The node types with no options for the panel (a frame has its own; a reroute point, the groups and their ports): every
// other node shows its options there when it is clicked — a note its whole document, in the editor.
const NO_PANEL = new Set<string>(['reroute', 'subgraph', 'groupin', 'groupout']);
export const hasPanel = (type: string | undefined) => !!type && !NO_PANEL.has(type);
