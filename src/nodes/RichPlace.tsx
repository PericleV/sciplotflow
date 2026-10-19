// What a placed block of a Note (a figure, a picture, a text box, a table) has in the editor: a grip to drag it anywhere
// in the note, a corner to drag its width (% of the page), and its place — left, centre, right, with the text beside it
// (wrap) or not.
import type { PointerEvent as RPointerEvent, ReactNode, RefObject } from 'react';
import { GripVertical, TextAlignCenter, TextAlignEnd, TextAlignStart, TextWrap } from 'lucide-react';
import { IC } from './iconProps.ts';
import type { Place } from './richDoc.ts';

// the grip: dragged, the block goes where it is dropped
export function Grip() {
  return (
    <span className="rich-grip" contentEditable={false} draggable data-drag-handle="" title="Drag to move it in the note">
      <GripVertical {...IC} />
    </span>
  );
}

// the corner: dragged, the block's width follows (shown live, kept when let go), as % of the width it stands in
export function Resizer({ target, onWidth }: { target: RefObject<HTMLElement | null>; onWidth: (pct: number) => void }) {
  const down = (e: RPointerEvent<HTMLSpanElement>) => {
    const el = target.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer the browser does not know: a synthetic one)
    }
    const [x0, w0, W] = [e.clientX, el.getBoundingClientRect().width, box.clientWidth || 1];
    // a block on the right grows to the left
    const sign = getComputedStyle(el).float === 'right' || (getComputedStyle(el).marginLeft !== '0px' && getComputedStyle(el).marginRight === '0px') ? -1 : 1;
    let pct = Math.round((w0 / W) * 100);
    const move = (ev: PointerEvent) => {
      pct = Math.min(100, Math.max(10, Math.round(((w0 + sign * (ev.clientX - x0)) / W) * 100)));
      el.style.width = `${pct}%`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      onWidth(pct);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };
  return <span className="rich-resize" contentEditable={false} title="Drag to change its width" onPointerDown={down} />;
}

// its place: left, centre, right; the text beside it (on the left or right only)
export function PlaceTools({ place, onPlace }: { place: Place; onPlace: (p: Partial<Place>) => void }) {
  const b = (on: boolean, title: string, icon: ReactNode, run: () => void, disabled = false) => (
    <button className={`nodrag rt-btn${on ? ' on' : ''}`} title={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {icon}
    </button>
  );
  return (
    <>
      {b(place.align === 'left', 'Left', <TextAlignStart {...IC} />, () => onPlace({ align: 'left' }))}
      {b(place.align === 'center', 'Centre', <TextAlignCenter {...IC} />, () => onPlace({ align: 'center', wrap: false }))}
      {b(place.align === 'right', 'Right', <TextAlignEnd {...IC} />, () => onPlace({ align: 'right' }))}
      {b(place.wrap, place.align === 'center' ? 'Wrap the text around it: put it on the left or the right first' : 'The text beside it (wrap)', <TextWrap {...IC} />, () => onPlace({ wrap: !place.wrap }), place.align === 'center')}
      <span className="muted">{place.width} %</span>
    </>
  );
}
