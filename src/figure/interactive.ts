// Dragging parts of a figure on screen (the 1D plot and Merge views): the context that turns it on, and what a draggable part
// carries — its node and how a drag (dx, dy in pt) changes the node's data.
import { createContext } from 'react';

// transform: how the part looks while dragged (default: moved by dx, dy); shift: the Shift key held; live: a handle (its
// object changed as it is dragged, not only when it is let go)
export type DragInfo = { node: string; apply: (dx: number, dy: number, data: Record<string, unknown>, shift: boolean) => Record<string, unknown>; root?: boolean; transform?: (dx: number, dy: number, shift: boolean) => string; live?: boolean };
export const Interactive = createContext(false);
// “Edit layout”: a Plot's frame, or the Plots' boxes in a Merge, move and resize with the mouse
export const LayoutEdit = createContext(false);
// the data reader on a curve (its key): the other curves drawn faded and grey (on screen only, not in the exports)
export const FocusCurve = createContext<string | null>(null);
// a 3D view being turned with the mouse: the scene of this node drawn from this azimuth and elevation (on screen, until
// the node has them)
// the size of the handles of the annotations (× pt): the drawing editor keeps them one size on the screen at any zoom
export const HandleScale = createContext(1);
// the nodes picked on the path being edited (the drawing editor: its corners rounded or cut alone)
export const PickedNodes = createContext<{ item: string; nodes: number[] } | null>(null);
// the drawing editor: only these objects (their ids) drawn with their handles (the others: picked by their body; a
// drawing of many points stays quick to draw while one is dragged)
export const HandlesFor = createContext<Set<string> | null>(null);
// (or zoomed and moved: its camera)
export const ThreeTurn = createContext<{ node: string; azim: number; elev: number; cam?: { k: number; dx: number; dy: number } } | null>(null);
// the keys held during a drag that the handles read (Ctrl: a box resized about its centre); set by whatever drags them
export const dragKeys = { ctrl: false };
