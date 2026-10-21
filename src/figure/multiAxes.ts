// Several Y (and X) axes in a 1D plot, as in Origin: the axes a curve can be on, a new one made for it (the right / top
// axis given its own scale first, then more axes moved out from the frame), and the layouts of the Plot dialog (double
// Y, one left and the others right, left and right in turn, all on the left). Pure.
import { AXIS_DEFAULTS, axisKind, axesStyle, type AxesStyle, type ExtraAxis, type Side } from './spec.ts';

// how far an axis added on a side is moved out from the frame (pt), for every axis already there
export const AXIS_STEP = 40;

// the added axes in the order of their numbers (Y3, Y4 …), whatever order they were made in
export const byNumber = (list: ExtraAxis[]) => [...list].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.id.localeCompare(b.id));

// the axes a curve can be on (id, label), Y or X
export function axisChoices(st: AxesStyle, kind: 'x' | 'y'): [string, string][] {
  const main: [string, string][] = kind === 'y' ? [['left', 'Y1'], ['right', 'Y2']] : [['bottom', 'X1'], ['top', 'X2']];
  return [...main, ...byNumber(st.extra.filter((e) => axisKind(e.side) === kind)).map((e): [string, string] => [e.id, e.id.toUpperCase()])];
}

// A new axis on a side for curves of their own: the right (top) axis itself when it only mirrors the left (bottom) one
// — given its own scale, its numbers and title shown —, else an axis moved out from the frame. Coloured as its curve.
export function addAxis(st: AxesStyle, side: Side): { st: AxesStyle; id: string } {
  const kind = axisKind(side);
  if ((side === 'right' || side === 'top') && st[side].mode === 'mirror') {
    return { id: side, st: { ...st, [side]: { ...st[side], mode: 'own' }, sides: { ...st.sides, [side]: { ...st.sides[side], labels: true, showTitle: true, curveColor: true } } } };
  }
  let n = 3;
  while (st.extra.some((e) => e.id === `${kind}${n}`)) n++;
  const id = `${kind}${n}`;
  const base = st.sides[kind === 'x' ? 'bottom' : 'left'];
  const axis: ExtraAxis = { id, side, scale: AXIS_DEFAULTS, style: { ...base, labels: true, showTitle: true, title: '', offset: freeOffset(st, side), curveColor: true } };
  return { id, st: { ...st, extra: [...st.extra, axis] } };
}

// Where a new axis goes on a side (pt out from the frame): the first place, every AXIS_STEP, that no axis there takes —
// the frame's edge (the main axis, or its mirror line), the main one where it is moved to, every added one at its
// offset. A place left by an axis taken away is used again (counting them instead put a new axis over one further out).
export function freeOffset(st: AxesStyle, side: Side): number {
  const taken = [0, st.sides[side].offset, ...st.extra.filter((e) => e.side === side).map((e) => e.style.offset)];
  for (let k = 0; ; k++) if (!taken.some((t) => Math.abs(t - AXIS_STEP * k) < AXIS_STEP / 2)) return AXIS_STEP * k;
}

// An added axis taken away (Axes ▸ Remove this axis); the others on its side moved in to close the gap. An axis is never
// taken away by itself: one a curve leaves stays, as it was added, until it is removed here (the right / top one: set
// back to a mirror in Axes).
export function removeAxis(st: AxesStyle, id: string): AxesStyle {
  const gone = st.extra.find((e) => e.id === id);
  return gone ? closeUp({ ...st, extra: st.extra.filter((e) => e.id !== id) }, gone.side) : st;
}

// The added axes of a side moved in, in their order, to the places left free (an axis taken away leaves no gap).
function closeUp(st: AxesStyle, side: Side): AxesStyle {
  const mine = st.extra.filter((e) => e.side === side).sort((a, b) => a.style.offset - b.style.offset);
  let packed: AxesStyle = { ...st, extra: st.extra.filter((e) => e.side !== side) };
  const at = new Map<string, number>();
  for (const e of mine) {
    const off = freeOffset(packed, side);
    at.set(e.id, off);
    packed = { ...packed, extra: [...packed.extra, { ...e, style: { ...e.style, offset: off } }] };
  }
  return { ...st, extra: st.extra.map((e) => (at.has(e.id) && at.get(e.id) !== e.style.offset ? { ...e, style: { ...e.style, offset: at.get(e.id)! } } : e)) };
}

// the layouts of several Y axes, and of several X axes
export type YLayout = 'one' | 'double' | 'leftRight' | 'alternate' | 'allLeft';
export type XLayout = 'one' | 'bottomTop' | 'allBottom';
export const Y_LAYOUTS: [YLayout, string][] = [
  ['one', 'one Y axis'],
  ['double', 'double Y (left, right)'],
  ['leftRight', 'one left, the others right'],
  ['alternate', 'left and right in turn'],
  ['allLeft', 'all on the left'],
];
export const X_LAYOUTS: [XLayout, string][] = [
  ['one', 'one X axis'],
  ['bottomTop', 'bottom and top in turn'],
  ['allBottom', 'all at the bottom'],
];

// the side of the axis of the k-th curve (0: the first), in a layout
function ySide(k: number, l: YLayout): Side {
  if (l === 'allLeft' || k === 0) return 'left';
  if (l === 'alternate') return k % 2 ? 'right' : 'left';
  return 'right';
}
const xSide = (k: number, l: XLayout): Side => (l === 'bottomTop' && k % 2 ? 'top' : 'bottom');

// The axes of a new Plot of n curves laid out so, and the axes of every curve: each curve its own axis (double Y: the
// first on the left, all the others on the right axis together).
export function layoutAxes(n: number, yl: YLayout, xl: XLayout, from?: Partial<AxesStyle>): { axes: AxesStyle; on: { axisX: string; axisY: string }[] } {
  let st = axesStyle(from);
  const on = Array.from({ length: n }, () => ({ axisX: 'bottom', axisY: 'left' }));
  if (n > 1 && yl !== 'one') {
    // the first curve keeps the left axis, coloured as it
    st = { ...st, sides: { ...st.sides, left: { ...st.sides.left, curveColor: true } } };
    for (let k = 1; k < n; k++) {
      if (yl === 'double' && k > 1) {
        on[k].axisY = on[1].axisY;
        continue;
      }
      const r = addAxis(st, ySide(k, yl));
      st = r.st;
      on[k].axisY = r.id;
    }
  }
  if (n > 1 && xl !== 'one') {
    st = { ...st, sides: { ...st.sides, bottom: { ...st.sides.bottom, curveColor: true } } };
    for (let k = 1; k < n; k++) {
      const r = addAxis(st, xSide(k, xl));
      st = r.st;
      on[k].axisX = r.id;
    }
  }
  return { axes: st, on };
}
