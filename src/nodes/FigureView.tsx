// A figure inside a node (1D plot, Merge): drawn at the node's width, its legend and annotations dragged with the
// mouse, “Edit layout” for the frame / boxes, a large view, colour-vision checks, and the exports. And the page
// settings both nodes share (size, default text, background, border).
import { useContext, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNodeId, useReactFlow } from '@xyflow/react';
import { figureCopied } from './figureClip.ts';
import { EDITABLE_FIGURES, makeEmbedded, type Embedded } from '../figure/embed.ts';
import { ProjectInfoContext } from '../projectInfo.ts';
import { exportPng, exportSvg, exportTiff, copyPng, printPdf, pixelSize, safeName, MAX_PIXELS } from '../figure/export.ts';
import { FigureSvg } from '../figure/render.tsx';
import { dragKeys, FocusCurve, Interactive, LayoutEdit, ThreeTurn, type DragInfo } from '../figure/interactive.ts';
import { FigureRotateLayer, type Turn } from './FigureRotate.tsx';
import { FONTS, toPt, type Figure, type LengthUnit } from '../figure/spec.ts';
import type { AnnotationItem, AppNode, PageData } from '../types.ts';
import { Select, TextInput } from './ui.tsx';
import { RichInput } from './fields.tsx';
import { FigureZoomLayer } from './FigureZoom.tsx';
import { Figure3DZoomLayer } from './Figure3DZoom.tsx';
import { Figure3DReaderLayer } from './Figure3DReader.tsx';
import { Figure3DPickLayer, type Pick3D } from './Figure3DPick.tsx';
import { LockIcon } from './icons.tsx';
import { FigurePointsLayer, type PlaceSpec } from './FigurePoints.tsx';
import { parsePoints, useShapePlacing, writePoints } from './placeStore.ts';
import { FigureReaderLayer, type ReaderMode } from './FigureReader.tsx';
import type { Pt2 } from './points.ts';
import { autoRanges, figureAxesOf, hasThree, readableCurves, withRanges, zoomOutRanges } from './figureRanges.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { focusPart } from './figureFocus.ts';
import type { ZoomMode } from './plotZoom.ts';
import { FigureRangeLayer, type XRange } from './FigureRange.tsx';
import { Crosshair, Maximize2, MoveHorizontal, Rotate3d, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { Select as MSelect, UnstyledButton } from '@mantine/core';
import { Choice, ColorField, NumPair, OpacityField, PictureGrid, Row, SliderField, TextStyleRows, Toggle, WidthField } from '../ui/props.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';

// keys pressed in the page settings are their own
const pageKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};
import { FigureQuick, type QuickAt } from './FigureQuick.tsx';
import { useQuickBar } from '../ui/quickBarStore.ts';
import { MATH_FACE_NAMES, mathFace, type MathFontChoice } from '../math/sizes.ts';
import { notify } from '../ui/dialogStore.ts';

type ViewMode = 'normal' | 'gray' | 'deutan' | 'protan' | 'tritan';
// colour-blindness simulations (Machado et al. 2009, severity 1) as SVG colour matrices
const CVD: Record<Exclude<ViewMode, 'normal' | 'gray'>, string> = {
  protan: '0.152 1.053 -0.205 0 0 0.115 0.786 0.099 0 0 -0.004 -0.048 1.052 0 0 0 0 0 1 0',
  deutan: '0.367 0.861 -0.228 0 0 0.280 0.673 0.047 0 0 -0.012 0.043 0.969 0 0 0 0 0 1 0',
  tritan: '1.256 -0.077 -0.179 0 0 -0.078 0.931 0.148 0 0 0.005 0.691 0.304 0 0 0 0 0 1 0',
};

// Dragging the parts of a figure on screen: a legend, text, shape, colour bar, frame or box follows the mouse, and its
// node gets its new place when the mouse is released.
function useFigureDrag() {
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  return (e: ReactPointerEvent) => {
    let el = e.target as Element | null;
    while (el && !(el as unknown as { __drag?: DragInfo }).__drag) el = el.parentElement;
    if (!el) return;
    const info = (el as unknown as { __drag: DragInfo }).__drag;
    const svg = (el as SVGElement).ownerSVGElement;
    const inv = svg?.getScreenCTM()?.inverse();
    if (!inv) return;
    e.preventDefault();
    e.stopPropagation();
    const user = (cx: number, cy: number) => {
      const p = new DOMPoint(cx, cy).matrixTransform(inv);
      return [p.x, p.y];
    };
    const [x0, y0] = user(e.clientX, e.clientY);
    // a frame moves with everything in it
    const target = (el as SVGElement).dataset.dragMove === 'root' ? (el.closest('[data-drag-root]') ?? el) : el;
    let d = [0, 0];
    let shift = e.shiftKey;
    // a handle: its object changed as it goes, from what it was (Ctrl read by a box's handles)
    const data0 = info.live ? (getNode(info.node)?.data as Record<string, unknown> | undefined) : undefined;
    let frame = 0;
    const move = (ev: PointerEvent) => {
      const [x, y] = user(ev.clientX, ev.clientY);
      d = [x - x0, y - y0];
      shift = ev.shiftKey;
      dragKeys.ctrl = ev.ctrlKey || ev.metaKey;
      if (data0) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => updateNodeData(info.node, info.apply(d[0], d[1], data0, shift)));
        return;
      }
      target.setAttribute('transform', info.transform ? info.transform(d[0], d[1], shift) : `translate(${d[0].toFixed(2)} ${d[1].toFixed(2)})`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cancelAnimationFrame(frame);
      target.removeAttribute('transform');
      if (Math.hypot(d[0], d[1]) < 0.3) return;
      const n = data0 ?? (getNode(info.node)?.data as Record<string, unknown> | undefined);
      if (n) updateNodeData(info.node, info.apply(d[0], d[1], n, shift));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

// The figure, its view tools and its exports. layoutTitle: what “Edit layout” moves (the frame, or the Plots' boxes).
// place: points placed with the mouse for a curve (its key), e.g. the line a fill goes to. ranges: ranges of x chosen on
// the figure as on the graph of a Fit (↔ Add a range, then drag; All X: none), with the node's own tools beside them.
// noAxes: a figure without axes (a Figure Drawing) — no layout, zoom nor reader; onPick: a click on a part of it (its node,
// the part: ann:<id>, curve:…, page)
export function FigureView({ fig, width, maxHeight = 480, page, setPage, layoutTitle, place, ranges, noAxes, onPick, pick3d }: { fig: Figure; width: number; maxHeight?: number; page: PageData; setPage: (p: Partial<PageData>) => void; layoutTitle: string; place?: { curve: string; sorted?: boolean; points: Pt2[]; onPoints: (p: Pt2[]) => void }; ranges?: { list: XRange[]; onChange: (r: XRange[]) => void; title: string; extra?: ReactNode }; noAxes?: boolean; onPick?: (node: string, part: string) => void; pick3d?: Pick3D }) {
  const drag = useFigureDrag();
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  // a polygon annotation of this figure whose points are placed with the mouse (its editor's button)
  const shapePlacing = useShapePlacing();
  const shapePlace = ((): PlaceSpec | undefined => {
    if (!shapePlacing) return undefined;
    const own = (an: Figure['annotations'][number]) => an.kind === 'shape' && an.owner?.field === 'annotations' && an.owner.node === shapePlacing.node && an.owner.item === shapePlacing.item;
    const inAxes = fig.axes.find((a) => a.annotations.some(own));
    const an = (inAxes?.annotations ?? fig.annotations).find(own);
    if (!an || an.kind !== 'shape') return undefined;
    return {
      axes: inAxes ? inAxes.key : '',
      coords: an.shape.coords,
      sorted: false,
      closed: an.shape.closed !== false,
      points: parsePoints(an.shape.points),
      onPoints: (pts) => {
        const items = ((getNode(shapePlacing.node)?.data as { annotations?: AnnotationItem[] } | undefined)?.annotations ?? []).map((it) => (it.id === shapePlacing.item && it.type === 'shape' ? { ...it, spec: { ...it.spec, points: writePoints(pts) } } : it));
        updateNodeData(shapePlacing.node, { annotations: items });
      },
    };
  })();
  const box = useRef<HTMLDivElement>(null);
  // as in Origin: a click on a part of the figure (an axis, the legend, a curve, an annotation, the frame) outlines it, a
  // double-click opens it in its node's panel (the page: anywhere else)
  const own = useNodeId();
  const { setNodes } = useReactFlow<AppNode>();
  const [picked, setPicked] = useState<{ x: number; y: number; w: number; h: number; big: boolean; n: number } | null>(null);
  // an annotation clicked: the quick bar over it (until a click elsewhere)
  const quickOn = useQuickBar();
  const [quick, setQuick] = useState<QuickAt | null>(null);
  useEffect(() => {
    if (!quick) return;
    // a press outside the figure (not in a picker the bar opened): the bar goes
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.canvas-view, .big-figure, .mantine-Popover-dropdown, .mantine-Tooltip-tooltip')) return;
      setQuick(null);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [quick]);
  const partAt = (target: EventTarget, root: HTMLElement | null) => {
    let el = target as Element | null;
    while (el && el !== root && !el.getAttribute?.('data-part')) el = el.parentElement;
    const part = el && el !== root ? el.getAttribute('data-part') : null;
    const holder = el && el !== root ? el.closest('[data-node]') : null;
    // a curve's node: the start of its key; else the nearest node named around it, else this one
    const cm = part ? /^curve:([^:]+):/.exec(part) : null;
    const node = cm?.[1] ?? holder?.getAttribute('data-node') ?? own ?? '';
    return { el: part ? el : null, part: part ?? 'page', node: getNode(node) ? node : (own ?? node) };
  };
  // the outline: a short flash (it fades out), only to show what was found
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => setPicked(null), 320);
    return () => clearTimeout(t);
  }, [picked]);
  const tooling = () => zoom !== 'none' || reader || adding || turning || !!place || !!shapePlace || layout;
  const pick = (e: React.MouseEvent, big: boolean) => {
    if (tooling()) return;
    const root = e.currentTarget as HTMLElement;
    const { el, part, node } = partAt(e.target, root);
    // the node told what was clicked (a Figure Drawing: its object, edited in its panel)
    onPick?.(node, part);
    if (!el) return setPicked(null), setQuick(null);
    // on the screen the node is scaled by the canvas's zoom: back to the figure's own pixels
    const r = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    const k = root.offsetWidth ? b.width / root.offsetWidth : 1;
    const at = { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k, big };
    setPicked((q) => ({ ...at, n: (q?.n ?? 0) + 1 }));
    setQuick(part.startsWith('ann:') ? { ...at, node, item: part.slice(4) } : null);
  };
  const open = (e: React.MouseEvent) => {
    if (tooling()) return;
    const { part, node } = partAt(e.target, e.currentTarget as HTMLElement);
    if (!node) return;
    setNodes((ns) => ns.map((n) => (n.selected === (n.id === node) ? n : { ...n, selected: n.id === node })));
    focusPart(node, part);
  };
  // zoom / pan: the limits of the Plots' axes change (Rescale: automatic again)
  const [zoom, setZoom] = useState<ZoomMode>('none');
  // the data reader: on, and what it reads
  const [reader, setReader] = useState(false);
  // ↔ Add a range: the next drag across a frame is a range
  const [adding, setAdding] = useState(false);
  const addRange = (r: XRange) => {
    if (ranges) ranges.onChange([...ranges.list, r]);
    setAdding(false);
  };
  const [reading, setReading] = useState('');
  const [readMode, setReadMode] = useState<ReaderMode>('snap');
  const [readCurve, setReadCurve] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const focused = reader && readMode === 'snap' ? focus : null;
  // ⟲ Rotate: a 3D view turned with the mouse; the turn shown until the node's new figure comes back
  const three = hasThree(fig);
  const [rotate, setRotate] = useState(false);
  const [turned, setTurned] = useState<{ t: Turn; fig: Figure } | null>(null);
  const turn = turned && turned.fig === fig ? turned.t : null;
  const setTurn = (t: Turn | null) => setTurned(t ? { t, fig } : null);
  useEffect(() => {
    if (!rotate) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setRotate(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [rotate]);
  const turning = rotate && three;
  // a 3D plot: its camera (and the limits of its axes) instead of the axes of a frame
  const threeNodes = three ? [...new Set(fig.axes.flatMap((a) => a.curves.flatMap((c) => (c.three?.node ? [c.three.node] : []))))] : [];
  const rescale = (which: 'both' | 'x' | 'y' = 'both') => {
    if (three) {
      for (const id of threeNodes) updateNodeData(id, which === 'both' ? { cam: undefined, xLim: undefined, yLim: undefined, zLim: undefined } : which === 'x' ? { xLim: undefined } : { yLim: undefined });
      return;
    }
    for (const ax of fig.axes) {
      const n = getNode(ax.node ?? fig.key ?? '');
      const d = figureAxesOf(n);
      if (n && d) updateNodeData(n.id, { axes: autoRanges(d.axes, which) });
    }
  };
  // zoom out: every Plot of the figure, its axes widened around their middle
  const zoomOut = () => {
    if (three) {
      for (const id of threeNodes) {
        const c = (getNode(id)?.data as { cam?: { k: number; dx: number; dy: number } } | undefined)?.cam ?? { k: 1, dx: 0, dy: 0 };
        updateNodeData(id, { cam: { k: +(c.k / 1.6).toPrecision(6), dx: +(c.dx / 1.6).toPrecision(6), dy: +(c.dy / 1.6).toPrecision(6) } });
      }
      return;
    }
    const W = toPt(fig.width, fig.unit);
    const H = toPt(fig.height, fig.unit);
    for (const { node, ranges } of zoomOutRanges(fig, W, H, 1.6)) {
      const n = getNode(node ?? fig.key ?? '');
      const d = figureAxesOf(n);
      if (n && d) updateNodeData(n.id, { axes: withRanges(d.axes, ranges) });
    }
  };
  const zoomed = three
    ? threeNodes.some((id) => {
        const d = getNode(id)?.data as { cam?: unknown; xLim?: unknown; yLim?: unknown; zLim?: unknown } | undefined;
        return !!(d?.cam || d?.xLim || d?.yLim || d?.zLim);
      })
    : fig.axes.some((ax) => [ax.style.x.min, ax.style.x.max, ax.style.y.min, ax.style.y.max].some(Number.isFinite));
  const pid = useId().replace(/:/g, '');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewMode>('normal');
  const [big, setBig] = useState(false);
  // “Edit layout”: the frame / boxes move and resize with the mouse (off: nothing moves by mistake)
  const [layout, setLayout] = useState(false);
  const svg = () => box.current?.querySelector('svg') ?? null;
  const name = safeName(page.name, 'figure');
  const px = pixelSize(fig, page.dpi);
  let dispW = width;
  let dispH = (width * toPt(fig.height, fig.unit)) / toPt(fig.width, fig.unit);
  if (dispH > maxHeight) [dispW, dispH] = [(dispW * maxHeight) / dispH, maxHeight];
  const run = (f: () => Promise<void>) => {
    setBusy(true);
    f()
      .catch((e: Error) => notify(e.message))
      .finally(() => setBusy(false));
  };
  // the project put in the SVG and PNG (an editable figure): this figure's node, the groups of the level shown
  const info = useContext(ProjectInfoContext);
  const nodeId = useNodeId();
  const embedMode = EDITABLE_FIGURES ? (page.embed ?? 'full') : 'none';
  const [embedSize, setEmbedSize] = useState('');
  const embedOf = async (): Promise<Embedded | undefined> => {
    if (!info || !nodeId || embedMode === 'none') return undefined;
    const e = await makeEmbedded(info.current(), info.id, { node: nodeId, path: info.path, name }, embedMode);
    const kb = e.project.length / 1024;
    setEmbedSize(kb < 1000 ? `${kb.toFixed(kb < 10 ? 1 : 0)} kB` : `${(kb / 1024).toFixed(1)} MB`);
    return e;
  };
  const filter = view === 'gray' ? 'grayscale(1)' : view === 'normal' ? undefined : `url(#${pid}-cvd)`;
  const bigW = Math.min(window.innerWidth * 0.9, (window.innerHeight * 0.84 * dispW) / dispH);
  const bigH = Math.min(window.innerHeight * 0.84, (window.innerWidth * 0.9 * dispH) / dispW);
  return (
    <div className="figure-view">
      <div className="row">
        <Select<ViewMode>
          value={view}
          title="Check the figure in grey or as seen with colour-blindness (the view only: exports are not changed)"
          options={[
            ['normal', 'view: normal'],
            ['gray', 'view: grey (print)'],
            ['deutan', 'view: deuteranopia'],
            ['protan', 'view: protanopia'],
            ['tritan', 'view: tritanopia'],
          ]}
          onChange={setView}
        />
        {!noAxes && <button
          className={`nodrag${layout ? ' btn-run' : ''}`}
          title={layoutTitle}
          onClick={() => {
            setLayout((v) => !v);
            setZoom('none');
            setRotate(false);
          }}
        >
          <LockIcon open={layout} /> {layout ? 'Edit layout: on' : 'Edit layout'}
        </button>}
        <button className="nodrag" title="Show the figure large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large view
        </button>
      </div>
      {ranges && (
        <div className="row wrap">
          <button
            className={`nodrag${adding ? ' on' : ''}`}
            title={ranges.title}
            onClick={() => {
              setAdding((v) => !v);
              setZoom('none');
              setLayout(false);
              setReader(false);
              setRotate(false);
            }}
          >
            <MoveHorizontal {...IC} /> Add a range
          </button>
          {ranges.list.length > 0 && (
            <button className="nodrag" title="No ranges: all X" onClick={() => ranges.onChange([])}>
              All X
            </button>
          )}
          {ranges.extra}
        </div>
      )}
      {!noAxes && <div className="row">
        <ZoomTools
          mode={zoom}
          setMode={(m) => {
            setZoom(m);
            if (m !== 'none') {
              setLayout(false);
              setReader(false);
              setRotate(false);
              setAdding(false);
            }
          }}
          onRescale={() => rescale()}
          onRescaleAxis={rescale}
          onZoomOut={zoomOut}
          zoomed={zoomed}
        />
        <button
          className={`nodrag${reader ? ' on' : ''}`}
          title="Data reader: a crosshair on the data point nearest the mouse — its curve, X, Y, row; click to keep it, then ← → along the curve, ↑ ↓ to another curve"
          onClick={() => {
            setReader((v) => !v);
            setAdding(false);
            setZoom('none');
            setLayout(false);
            setRotate(false);
            setReading('');
            setFocus(null);
          }}
        >
          <Crosshair {...IC} /> Reader
        </button>
        {three && (
          <button
            className={`nodrag${rotate ? ' on' : ''}`}
            title="Rotate: drag on a 3D view to turn it (across: the azimuth, up and down: the elevation; Shift: only the azimuth, Alt: only the elevation). Esc: off"
            onClick={() => {
              setRotate((v) => !v);
              setZoom('none');
              setLayout(false);
              setReader(false);
            }}
          >
            <Rotate3d {...IC} /> Rotate
          </button>
        )}
        {zoom !== 'none' && <span className="hint">the limits of the axes change (Ctrl+Z goes back)</span>}
      </div>}
      {reader && (
        <div className="row">
          <>
            <Select<ReaderMode>
              value={readMode}
              title="Snap: on the data points of a curve; free: the coordinates of any place in a frame"
              options={[
                ['snap', 'snap to data'],
                ['free', three ? 'on the surface' : 'free (any place)'],
              ]}
              onChange={(m) => {
                setReadMode(m);
                setFocus(null);
                setReading('');
              }}
            />
            {readMode === 'snap' && !three && <Select value={readCurve} title="The curve read: the nearest one, or this one" options={[['', 'nearest curve'], ...readableCurves(fig)]} onChange={setReadCurve} />}
          </>
        </div>
      )}
      {view !== 'normal' && view !== 'gray' && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={`${pid}-cvd`}>
            <feColorMatrix type="matrix" values={CVD[view]} />
          </filter>
        </svg>
      )}
      <div className={`canvas-view nodrag${fig.background === 'none' ? ' checker' : ''}`} ref={box} style={{ width: dispW, height: dispH, filter }} onPointerDown={drag} onClick={(e) => pick(e, false)} onDoubleClick={open} title={layout ? 'Drag a box to move it, its squares to resize it' : 'Click a part of the figure to outline it, double-click it to open its settings (an axis, the legend, a curve, an annotation; elsewhere: the page). Drag the legend, a text, shape or colour bar to move it'}>
        <Interactive.Provider value={true}>
          <LayoutEdit.Provider value={layout}>
            <FocusCurve.Provider value={focused}>
              <ThreeTurn.Provider value={turn}>
                <FigureSvg fig={fig} display={{ width: dispW, height: dispH }} idPrefix={pid} />
              </ThreeTurn.Provider>
            </FocusCurve.Provider>
          </LayoutEdit.Provider>
        </Interactive.Provider>
        {pick3d && zoom === 'none' && <Figure3DPickLayer fig={fig} width={dispW} height={dispH} pick={pick3d} />}
        {three ? <Figure3DZoomLayer fig={fig} width={dispW} height={dispH} mode={zoom} onTurn={setTurn} /> : <FigureZoomLayer fig={fig} width={dispW} height={dispH} mode={zoom} onRescale={() => rescale()} />}
        {turning && zoom === 'none' && <FigureRotateLayer fig={fig} onTurn={setTurn} />}
        {adding && zoom === 'none' && <FigureRangeLayer fig={fig} width={dispW} height={dispH} onAdd={addRange} />}
        {(place ?? shapePlace) && zoom === 'none' && <FigurePointsLayer fig={fig} width={dispW} height={dispH} {...(place ?? shapePlace)!} />}
        {reader && zoom === 'none' && !place && !shapePlace && (three ? <Figure3DReaderLayer fig={fig} width={dispW} height={dispH} mode={readMode} onRead={setReading} /> : <FigureReaderLayer fig={fig} width={dispW} height={dispH} mode={readMode} curve={readCurve} onRead={setReading} onFocus={setFocus} />)}
        {picked && !picked.big && <div key={picked.n} className="part-outline" style={{ left: picked.x - 2, top: picked.y - 2, width: picked.w + 4, height: picked.h + 4 }} />}
        {quickOn && quick && !quick.big && !tooling() && <FigureQuick at={quick} width={dispW} onClose={() => setQuick(null)} />}
      </div>
      {reader && <div className="reader-line mono" title="The last reading (select it to copy)">{reading || 'move the mouse over a curve'}</div>}
      {pick3d && <div className="hint">{pick3d.title} (Esc: stop)</div>}
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)} title="Click outside the figure to close">
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="big-figure" style={{ filter }} onPointerDown={drag} onClick={(e) => pick(e, true)} onDoubleClick={open}>
              <Interactive.Provider value={true}>
                <LayoutEdit.Provider value={layout}>
                  <FocusCurve.Provider value={focused}>
                    <ThreeTurn.Provider value={turn}>
                      <FigureSvg fig={fig} display={{ width: bigW, height: bigH }} idPrefix={`${pid}-big`} />
                    </ThreeTurn.Provider>
                  </FocusCurve.Provider>
                </LayoutEdit.Provider>
              </Interactive.Provider>
              {pick3d && zoom === 'none' && <Figure3DPickLayer fig={fig} width={bigW} height={bigH} pick={pick3d} />}
        {three ? <Figure3DZoomLayer fig={fig} width={bigW} height={bigH} mode={zoom} onTurn={setTurn} /> : <FigureZoomLayer fig={fig} width={bigW} height={bigH} mode={zoom} onRescale={() => rescale()} />}
              {turning && zoom === 'none' && <FigureRotateLayer fig={fig} onTurn={setTurn} />}
              {adding && zoom === 'none' && <FigureRangeLayer fig={fig} width={bigW} height={bigH} onAdd={addRange} />}
              {(place ?? shapePlace) && zoom === 'none' && <FigurePointsLayer fig={fig} width={bigW} height={bigH} {...(place ?? shapePlace)!} />}
              {reader && zoom === 'none' && !place && !shapePlace && (three ? <Figure3DReaderLayer fig={fig} width={bigW} height={bigH} mode={readMode} onRead={setReading} /> : <FigureReaderLayer fig={fig} width={bigW} height={bigH} mode={readMode} curve={readCurve} onRead={setReading} onFocus={setFocus} />)}
              {picked?.big && <div key={picked.n} className="part-outline" style={{ left: picked.x - 2, top: picked.y - 2, width: picked.w + 4, height: picked.h + 4 }} />}
              {quickOn && quick?.big && !tooling() && <FigureQuick at={quick} width={bigW} onClose={() => setQuick(null)} />}
            </div>
            {!noAxes && (
              <div className="big-tools">
                <ZoomTools mode={zoom} setMode={setZoom} onRescale={() => rescale()} onRescaleAxis={rescale} onZoomOut={zoomOut} zoomed={zoomed} />
              </div>
            )}
          </div>,
          document.body,
        )}
      <div className="row wrap export-row">
        <TextInput className="short-text" value={page.name} placeholder="figure" title="File name" onChange={(v) => setPage({ name: v })} />
        <button className="nodrag" title={`Vector figure, ${fig.width} × ${fig.height} ${fig.unit}`} onClick={() => svg() && run(async () => exportSvg(svg()!, fig, name, await embedOf()))}>
          SVG
        </button>
        <button className="nodrag" title="PDF (vector, fonts included): the browser's print window opens at the size of the figure — choose “Save as PDF”" onClick={() => svg() && printPdf(svg()!, fig, name)}>
          PDF
        </button>
        <button className="nodrag" disabled={busy} title={`${px.w} × ${px.h} pixels at ${page.dpi} dpi`} onClick={() => svg() && run(async () => exportPng(svg()!, fig, page.dpi, name, await embedOf()))}>
          PNG
        </button>
        <button className="nodrag" disabled={busy} title={`TIFF (deflate compression), ${px.w} × ${px.h} pixels at ${page.dpi} dpi — what many journals ask for`} onClick={() => svg() && run(() => exportTiff(svg()!, fig, page.dpi, name))}>
          TIFF
        </button>
        <button className="nodrag" disabled={busy} title="Copy the figure as an image (paste it into a document or a slide; into a Note of this project: the live figure)" onClick={() => svg() && run(async () => {
            await copyPng(svg()!, fig, Math.min(page.dpi, 300));
            const cp = pixelSize(fig, Math.min(page.dpi, 300));
            if (nodeId) figureCopied(nodeId, cp.w, cp.h);
          })}>
          Copy
        </button>
        <Select
          value={page.dpi}
          title="Resolution of PNG / TIFF"
          options={[
            [150, '150 dpi'],
            [300, '300 dpi'],
            [600, '600 dpi'],
            [1200, '1200 dpi'],
          ]}
          onChange={(dpi) => setPage({ dpi })}
        />
        <span className={`hint${px.w > MAX_PIXELS || px.h > MAX_PIXELS ? ' err-text' : ''}`}>
          {px.w} × {px.h} px
        </span>
        {EDITABLE_FIGURES && <Select<'full' | 'nodata' | 'none'>
          value={embedMode}
          title="An editable figure: the project inside the SVG and PNG files — in Word or PowerPoint insert the SVG (they re-encode a PNG, which loses the project); in a document, “Save as Picture”, then drop the image on SciPlotFlow: the project opens at this figure (and Update document… replaces the figure there). Without the imported data: smaller, the files are opened again. TIFF, PDF and Copy never carry it"
          options={[
            ['full', 'project inside'],
            ['nodata', 'project, no imported data'],
            ['none', 'no project'],
          ]}
          onChange={(embed) => setPage({ embed: embed === 'full' ? undefined : embed })}
        />}
        {embedMode !== 'none' && embedSize && <span className="hint" title="The project in the last SVG / PNG exported">+ {embedSize}</span>}
      </div>
    </div>
  );
}

const PRESETS: { label: string; w: number; h: number; unit: LengthUnit }[] = [
  { label: 'One column (85 × 65 mm)', w: 85, h: 65, unit: 'mm' },
  { label: 'One column, square (85 × 85 mm)', w: 85, h: 85, unit: 'mm' },
  { label: '1.5 columns (120 × 85 mm)', w: 120, h: 85, unit: 'mm' },
  { label: 'Two columns (180 × 110 mm)', w: 180, h: 110, unit: 'mm' },
  { label: 'Two columns, low (180 × 70 mm)', w: 180, h: 70, unit: 'mm' },
  { label: 'Two columns, tall (180 × 180 mm)', w: 180, h: 180, unit: 'mm' },
  { label: 'Slide 16:9 (25.4 × 14.3 cm)', w: 25.4, h: 14.3, unit: 'cm' },
];

// The page: size (fixed: the size comes from the Plots — a Merge keeping their sizes), default text, background, border.
export function PageControls({ page, set, fixed }: { page: PageData; set: (p: Partial<PageData>) => void; fixed?: string }) {
  const preset = PRESETS.findIndex((p) => p.w === page.width && p.h === page.height && p.unit === page.unit);
  const bgMode = page.background === 'none' ? 'none' : page.background === 'white' || page.background === '#ffffff' || !page.background ? 'white' : 'color';
  const size = page.size ?? 8;
  return (
    <div className="page-controls props-panel props-embed nodrag" onKeyDown={pageKeys}>
      {fixed ? (
        <div className="prop-note">{fixed}</div>
      ) : (
        <>
          <Row label="Size">
            <MSelect
              value={String(preset)}
              data={[{ value: '-1', label: 'Custom' }, ...PRESETS.map((p, k) => ({ value: String(k), label: p.label }))]}
              onChange={(v) => {
                const p = PRESETS[Number(v)];
                if (p) set({ width: p.w, height: p.h, unit: p.unit });
              }}
            />
          </Row>
          <Row label="Width, height">
            <NumPair a={page.width} b={page.height} names={['w', 'h']} onA={(width) => set({ width })} onB={(height) => set({ height })} />
            <Choice<LengthUnit>
              value={page.unit}
              onChange={(unit) => set({ unit })}
              options={[
                ['mm', 'mm'],
                ['cm', 'cm'],
                ['in', 'in'],
              ]}
            />
          </Row>
        </>
      )}
      <Row label="Text font" hint="The text of the figure: every text on “auto” (numbers, titles, legend, annotations)">
        <MSelect value={page.font} data={FONTS.map(([f, l]) => ({ value: f, label: l }))} onChange={(font) => font && set({ font })} />
      </Row>
      <Row label="Text size">
        <div className="chip-row">
          {[6, 7, 8, 9, 10, 11, 12].map((v) => (
            <UnstyledButton key={v} className={`chip${size === v ? ' on' : ''}`} onClick={() => set({ size: v })}>
              {v}
            </UnstyledButton>
          ))}
        </div>
        <SliderField value={size} onChange={(v) => set({ size: v > 0 ? v : 8 })} min={4} max={24} step={0.5} unit="pt" />
      </Row>
      <Row label="Text style">
        <div className="toggle-row">
          <UnstyledButton className={`toggle${page.bold ? ' on' : ''}`} onClick={() => set({ bold: !page.bold })} aria-label="Bold" title="Bold">
            <b>B</b>
          </UnstyledButton>
          <UnstyledButton className={`toggle${page.italic ? ' on' : ''}`} onClick={() => set({ italic: !page.italic })} aria-label="Italic" title="Italic">
            <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
          </UnstyledButton>
          <ColorField value={page.textColor ?? '#000000'} onChange={(c) => set({ textColor: c || '#000000' })} />
        </div>
      </Row>
      <Row label="Title" hint="A title over the figure, centred at the top (the frame placed under it); bold and 2 pt larger than the text unless set">
        <RichInput value={page.title ?? ''} placeholder="none" onChange={(title) => set({ title: title || undefined })} />
      </Row>
      {!!page.title && <TextStyleRows value={page.titleText ?? { bold: true }} onChange={(titleText) => set({ titleText })} />}
      <Row label="Decimal comma" hint="The numbers the figure writes (on the axes and colour bars, the values of points and bars, the parameters a node writes) with a comma: 2,5; the texts you type stay as you type them">
        <Toggle value={!!page.comma} onChange={(comma) => set({ comma: comma || undefined })} label="2,5" />
      </Row>
      <Row label="Formula font" hint="The font of the formulas you write between $ signs ($lpha^2$). Automatic picks the one that looks like the text: a sans font for Arial or Calibri, a serif one for Times or Cambria">
        <MSelect
          value={page.mathFont ?? 'auto'}
          onChange={(f) => f && set({ mathFont: f === 'auto' ? undefined : (f as Exclude<MathFontChoice, 'auto'>) })}
          data={[
            { value: 'auto', label: `Automatic (${MATH_FACE_NAMES[mathFace(page.font, 'auto')]})` },
            { value: 'sans', label: MATH_FACE_NAMES.sans },
            { value: 'serif', label: MATH_FACE_NAMES.serif },
            { value: 'latex', label: MATH_FACE_NAMES.latex },
          ]}
        />
      </Row>
      <Row label="Background">
        <Choice
          value={bgMode}
          onChange={(m) => set({ background: m === 'white' ? 'white' : m === 'none' ? 'none' : '#f4f4f4' })}
          options={[
            ['white', 'White'],
            ['none', 'None', 'Transparent'],
            ['color', 'Colour'],
          ]}
        />
        {bgMode === 'color' && <ColorField value={page.background} onChange={(background) => set({ background: background || '#f4f4f4' })} />}
      </Row>
      <Row label="Border" hint="A border around the page (in a Merge: around this Plot's place); 0: none">
        <WidthField value={page.border ?? 0} onChange={(v) => set({ border: Math.max(0, Number.isFinite(v) ? v : 0) })} max={4} />
      </Row>
      {(page.border ?? 0) > 0 && (
        <div className="prop-sub">
          <Row label="Colour">
            <ColorField value={page.borderColor ?? '#000000'} onChange={(c) => set({ borderColor: c || '#000000' })} />
          </Row>
          <Row label="Style">
            <PictureGrid value={page.borderDash ?? 'solid'} onChange={(borderDash) => set({ borderDash })} options={DASH_PICS} cols={4} />
          </Row>
          <Row label="Corners" hint="Rounded corners">
            <SliderField value={page.borderRadius ?? 0} onChange={(v) => set({ borderRadius: Math.max(0, Number.isFinite(v) ? v : 0) })} min={0} max={20} step={0.5} unit="pt" />
          </Row>
          <Row label="Opacity">
            <OpacityField value={page.borderOpacity ?? 1} onChange={(v) => set({ borderOpacity: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) })} />
          </Row>
          <Row label="Inset" hint="Its distance in from the edge of the page">
            <SliderField value={page.borderInset ?? 0} onChange={(v) => set({ borderInset: Math.max(0, v || 0) })} min={0} max={20} step={0.5} unit="pt" />
          </Row>
        </div>
      )}
    </div>
  );
}
