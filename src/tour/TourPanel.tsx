// The window of a guided tour, over the whole app (dialogs too): the chapter and step, what to do, Back / Show me /
// Next. The element to use is lit (the rest of the page dimmed a little, an arrow pointing at it); the window moves to
// another corner when it would cover it. Show me plays the step with a drawn mouse pointer (animate.ts). A step done
// (the nodes show it, a figure was saved) is ticked and the tour goes on by itself, unless it was done already when
// the step began (going back).
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Edge } from '@xyflow/react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { IC } from '../nodes/iconProps.ts';
import type { AppNode } from '../types.ts';
import { stepsOf, type Tour, type TourApi, type TourState } from './kit.ts';
import { play, Player, Stopped, type Cursor } from './animate.ts';

// **bold** in a line of text
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((p, k) => (
        <p key={k}>
          {p.split(/\*\*(.+?)\*\*/).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : <Fragment key={j}>{part}</Fragment>))}
        </p>
      ))}
    </>
  );
}

type Box = { x: number; y: number; w: number; h: number };
const W = 360;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// the corners the window may stand in (bottom left first), as boxes of its size
const corners = (h: number): Box[] => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return [
    { x: 16, y: vh - h - 16, w: W, h },
    { x: vw - W - 16, y: vh - h - 16, w: W, h },
    { x: vw - W - 16, y: 90, w: W, h },
    { x: 16, y: 90, w: W, h },
  ];
};

// the drawn pointer, the node being dragged, the wire being drawn, the text being typed
export function Pointer({ c }: { c: Cursor }) {
  if (!c.on) return null;
  return (
    <>
      {c.wire && (
        <svg className="tour-wire" width="100%" height="100%">
          <path d={`M ${c.wire.x} ${c.wire.y} C ${c.wire.x + 80} ${c.wire.y}, ${c.x - 80} ${c.y}, ${c.x} ${c.y}`} />
          <circle cx={c.wire.x} cy={c.wire.y} r={5} />
        </svg>
      )}
      {c.ghost && (
        <div className="tour-ghost" style={{ left: c.x + 14, top: c.y + 10 }}>
          {c.ghost}
        </div>
      )}
      {c.bubble && (
        <div className="tour-bubble" style={{ left: c.bubble.x, top: c.bubble.y }}>
          {c.bubble.text}
          <i />
        </div>
      )}
      <div className={`tour-pointer${c.down ? ' down' : ''}`} style={{ left: c.x, top: c.y }}>
        <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true">
          <path d="M3 2 L3 24 L9 18.5 L13 27.5 L17 25.8 L13 17 L21 17 Z" />
        </svg>
      </div>
    </>
  );
}

export function TourPanel({ tour, step, onStep, nodes, edges, value, api, onClose }: { tour: Tour; step: number; onStep: (k: number) => void; nodes: AppNode[]; edges: Edge[]; value: TourState['value']; api: TourApi; onClose: (finished: boolean) => void }) {
  const steps = useMemo(() => stepsOf(tour), [tour]);
  const s = steps[Math.min(step, steps.length - 1)];
  // the nodes when the step began, whether it was done then; the files saved since
  const [start, setStart] = useState(() => ({ step, nodes, done: !!s.done?.({ nodes, edges, start: nodes, downloads: [] }) }));
  if (start.step !== step) setStart({ step, nodes, done: !!s.done?.({ nodes, edges, start: nodes, downloads: [] }) });
  const [saved, setSaved] = useState<{ step: number; files: string[] }>({ step, files: [] });
  useEffect(() => {
    const on = (e: Event) => setSaved((d) => ({ step, files: [...(d.step === step ? d.files : []), (e as CustomEvent<string>).detail] }));
    window.addEventListener('graph-flow:downloaded', on);
    return () => window.removeEventListener('graph-flow:downloaded', on);
  }, [step]);
  const state: TourState = { nodes, edges, start: start.nodes, downloads: saved.step === step ? saved.files : [], value };
  const done = !!s.done?.(state);
  const last = step >= steps.length - 1;
  // Show me being played: its pointer; Stop ends it
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const player = useRef<Player | null>(null);
  const playing = cursor !== null;
  // done now (not when it began): on to the next step a moment later (after Show me has finished)
  useEffect(() => {
    if (!done || start.done || last || playing) return;
    const t = setTimeout(() => onStep(step + 1), 1100);
    return () => clearTimeout(t);
  }, [done, start.done, last, step, onStep, playing]);
  useEffect(() => () => player.current?.stop(), []);
  const box = useRef<HTMLDivElement>(null);
  const showMe = async () => {
    const acts = s.demo?.(state);
    if (!acts) return s.show?.(api, state);
    const r = box.current?.getBoundingClientRect();
    const p = new Player(setCursor, r ? { x: r.left + r.width / 2, y: r.top } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    player.current = p;
    try {
      await play(acts, p, api);
    } catch (e) {
      if (!(e instanceof Stopped)) console.error(e);
    } finally {
      p.hide();
      player.current = null;
      setCursor(null);
    }
  };
  const stop = () => player.current?.stop();
  useEffect(() => {
    if (!playing) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && player.current?.stop();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [playing]);

  // the element to use (looked for again and again: it may appear later, or move), its box for the light and arrow
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const [lit, setLit] = useState<Box | null>(null);
  useEffect(() => {
    const look = () => {
      try {
        return s.target?.(document, stateRef.current) ?? null;
      } catch {
        return null; // nothing lit rather than the app stopped
      }
    };
    const tick = () => {
      const el = look();
      const r = el?.getBoundingClientRect();
      const b = r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
      setLit((o) => (o && b && Math.abs(o.x - b.x) + Math.abs(o.y - b.y) + Math.abs(o.w - b.w) + Math.abs(o.h - b.h) < 1 ? o : b));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [s]);

  // moved by its title bar (kept while the tour lasts); else in a corner that leaves the lit element free
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [folded, setFolded] = useState(false);
  const [height, setHeight] = useState(240);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight((h) => (Math.abs(el.offsetHeight - h) > 2 ? el.offsetHeight : h)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const corner = useMemo(() => {
    const cs = corners(height);
    return (lit && cs.find((c) => !overlaps(c, { x: lit.x - 12, y: lit.y - 12, w: lit.w + 24, h: lit.h + 24 }))) || cs[0];
  }, [lit, height]);
  const place = pos ?? corner;
  const drag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (m: PointerEvent) => setPos({ x: Math.max(0, Math.min(window.innerWidth - r.width, m.clientX - dx)), y: Math.max(0, Math.min(window.innerHeight - 40, m.clientY - dy)) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // the arrow: left of the lit element when there is room, else above it, pointing at it
  const arrow = lit && !playing ? (lit.x > 70 ? { x: lit.x - 52, y: lit.y + lit.h / 2 - 14, dir: 'right' } : { x: lit.x + Math.min(lit.w / 2, 60) - 14, y: lit.y - 50, dir: 'down' }) : null;
  return createPortal(
    <div className="tour-layer">
      {lit && !playing && <div className="tour-spot" style={{ left: lit.x - 6, top: lit.y - 6, width: lit.w + 12, height: lit.h + 12 }} />}
      {arrow && (
        <div className={`tour-arrow ${arrow.dir}`} style={{ left: arrow.x, top: arrow.y }}>
          <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
            <path d="M2 14 H30 M22 5 L32 14 L22 23" />
          </svg>
        </div>
      )}
      <div ref={box} className="tour" role="dialog" aria-label={`Tour: ${tour.title}`} style={{ left: place.x, top: place.y }}>
        <div className="tour-head" onPointerDown={drag} title="Drag me by this bar">
          <b>{tour.title}</b>
          <span className="tour-count">
            {step + 1} / {steps.length}
          </span>
          <button onClick={() => setFolded(!folded)} title={folded ? 'Unfold' : 'Fold'} aria-label={folded ? 'Unfold' : 'Fold'}>
            {folded ? <ChevronUp {...IC} /> : <ChevronDown {...IC} />}
          </button>
          <button
            onClick={() => {
              stop();
              onClose(false);
            }}
            title="Close the tour. You can pick it up again from the Welcome window." aria-label="Close the tour">
            <X {...IC} />
          </button>
        </div>
        <div className="tour-bar">
          <i style={{ width: `${((step + (done ? 1 : 0)) / steps.length) * 100}%` }} />
        </div>
        {!folded && (
          <div className="tour-body">
            <div className="tour-chapter">
              Chapter {s.chapterNo} of {tour.chapters.length} · {s.chapter}
            </div>
            <h4>
              {s.title}
              {done && (
                <span className="tour-done">
                  <Check {...IC} /> Done
                </span>
              )}
            </h4>
            <Rich text={s.text} />
            <div className="tour-buttons">
              {playing ? (
                <button className="primary" onClick={stop} title="Stop the animation (Esc)">
                  Stop
                </button>
              ) : (
                <>
                  <button onClick={() => onStep(step - 1)} disabled={step === 0}>
                    Back
                  </button>
                  {s.action && !done && <button onClick={() => s.action!.run(api, state)}>{s.action.label}</button>}
                  {(s.show || s.demo) && !done && !s.action && (
                    <button onClick={() => void showMe()} title="Watch it being done for you">
                      Show me
                    </button>
                  )}
                </>
              )}
              <span className="tour-gap" />
              {!playing &&
                (last ? (
                  <button className="primary" onClick={() => onClose(true)}>
                    Finish
                  </button>
                ) : (
                  <button className={done || !s.done ? 'primary' : ''} onClick={() => onStep(step + 1)} title={s.done && !done ? 'Skip this step' : 'Next step'}>
                    Next
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
      {cursor && <Pointer c={cursor} />}
    </div>,
    document.body,
  );
}
