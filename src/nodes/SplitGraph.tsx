// The graph of Split into columns: the column the blocks are found from, along the rows (each block in its colour, the
// rows not used grey, the cuts as lines — of the rule solid, placed by hand dashed —, the block numbers over them), or
// the curves (a Y over X, block by block). A block left out is grey, a piece that is not a whole cycle dashed. Zoom, pan,
// the reader, the graph large; and the edits made on it: + Cut (a click puts a cut at that row — on the curves, at the
// nearest point), a cut line dragged to another row or removed by a double-click, Blocks (a click keeps a block or
// leaves it out), Rows (dragged across the rows used).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Scissors, SquareDashedMousePointer, MousePointerClick, X as XIcon } from 'lucide-react';
import type { SplitGraph } from '../engine/reshape.ts';
import { turnPoints } from '../engine/split.ts';
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import { IC } from './iconProps.ts';
import { REGION_COLORS } from './regionColors.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';
import { Select } from './ui.tsx';

const W0 = 520;
const H0 = 230;
const M = { l: 56, r: 10, t: 16, b: 30 };
const GREY = '#c4c4c4';
const colorOf = (k: number) => REGION_COLORS[k % REGION_COLORS.length];

export type SplitTool = 'none' | 'cut' | 'pick' | 'range';
// Where a cut placed or dragged lands: on the nearest data point; on the nearest maximum and / or minimum (along the
// rows: where the column turns — a scan's vertices; on the curves: the peaks of the Y drawn), else on the nearest data
// point; or at the row under the mouse (off; Alt does the same at any time)
export type SplitSnap = 'data' | 'turns' | 'max' | 'min' | 'off';
// the reach of the snap to a maximum or minimum: around the mouse on the curves, left or right along the rows (px)
const SNAP_PX = 25;
const REACH_ROWS = 30;
export type SplitEdits = {
  addCut: (row: number) => void; // a cut at this row (from 1)
  removeCut: (c: SplitGraph['cuts'][number]) => void;
  moveCut: (c: SplitGraph['cuts'][number], row: number) => void;
  toggleBlock: (k: number) => void;
  setRange: (a: number, b: number) => void; // the rows used, from 1
};
type Drag = { kind: 'cut'; cut: SplitGraph['cuts'][number]; row: number } | { kind: 'range'; a: number; b: number } | null;

function Graph({ g, view, W, H, zoom, box: zbox, onView, zoomOut, tool, snap, tol, edits, yAt, reader }: { g: SplitGraph; view: 'rows' | 'curves'; W: number; H: number; zoom: ZoomMode; box: View | null; onView: (v: View | null) => void; zoomOut: number; tool: SplitTool; snap: SplitSnap; tol: number; edits: SplitEdits; yAt: number; reader: { r: ReaderState; onRead: (t: string) => void } }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState('default');
  const [drag, setDrag] = useState<Drag>(null);
  // the row a cut would land on (shown by a marker while cutting or dragging a cut)
  const [hover, setHover] = useState<number | null>(null);
  const rowsView = view === 'rows';
  const Y = g.ys[Math.min(yAt, g.ys.length - 1)];
  // the points of a block: (row, F) along the rows, or (X, Y)
  const px = (i: number) => (rowsView ? i + 1 : g.x.values[i]);
  const py = (i: number) => (rowsView ? g.f.values[i] : (Y?.values[i] ?? NaN));
  // the maxima and minima a cut snaps to: where the column turns (with the tolerance of Turns), or the peaks of Y in
  // every block
  const extremes = useMemo(() => {
    const tolFrac = tol / 100;
    if (rowsView) {
      const idx: number[] = [];
      for (let i = 0; i < g.n; i++) if (Number.isFinite(g.f.values[i])) idx.push(i);
      return turnPoints(g.f.values, idx, tolFrac).map((t) => ({ i: idx[t.k], top: t.top }));
    }
    const out: { i: number; top: boolean }[] = [];
    if (!Y) return out;
    for (const b of g.blocks) {
      const idx = b.rows.filter((i) => Number.isFinite(Y.values[i]));
      for (const t of turnPoints(Y.values, idx, tolFrac)) out.push({ i: idx[t.k], top: t.top });
    }
    return out;
  }, [g, rowsView, Y, tol]);
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  if (rowsView) {
    [x0, x1] = [1, Math.max(2, g.n)];
    for (const v of g.f.values) if (Number.isFinite(v)) [y0, y1] = [Math.min(y0, v), Math.max(y1, v)];
  } else
    for (const b of g.blocks)
      for (const i of b.rows) {
        const [u, v] = [px(i), py(i)];
        if (Number.isFinite(u) && Number.isFinite(v)) [x0, x1, y0, y1] = [Math.min(x0, u), Math.max(x1, u), Math.min(y0, v), Math.max(y1, v)];
      }
  if (y1 === y0) [y0, y1] = [y0 - 1, y1 + 1];
  if (x1 === x0) [x0, x1] = [x0 - 1, x1 + 1];
  const pad = (y1 - y0) * 0.06;
  const okBox = [x0, x1, y0, y1].every(Number.isFinite);
  const auto = okBox ? { x0, x1, y0: y0 - pad, y1: y1 + pad } : { x0: 0, x1: 1, y0: 0, y1: 1 };
  const box = viewBox(zbox, auto);
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const z = usePlotZoom(zoom, { l: M.l, t: M.t, w: pw, h: ph }, box, onView);
  useEffect(() => {
    if (zoomOut) onView(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOut]);
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  const ix = (p: number) => box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
  const iy = (p: number) => box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
  const cutsShown = rowsView && g.contiguous;
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    if (!okBox) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, pw, ph);
    ctx.clip();
    // the rows not used (outside Rows): shaded
    if (rowsView && g.rows) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(M.l, M.t, fx(g.rows[0]) - M.l, ph);
      ctx.fillRect(fx(g.rows[1]), M.t, M.l + pw - fx(g.rows[1]), ph);
    }
    const line = (rows: ArrayLike<number>, dots: boolean) => {
      if (dots) {
        const r = rows.length > 3000 ? 1 : 1.6;
        for (let p = 0; p < rows.length; p++) {
          const [u, v] = [px(rows[p]), py(rows[p])];
          if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
          ctx.beginPath();
          ctx.arc(fx(u), fy(v), r, 0, 2 * Math.PI);
          ctx.fill();
        }
        return;
      }
      ctx.beginPath();
      let on = false;
      for (let p = 0; p < rows.length; p++) {
        const [u, v] = [px(rows[p]), py(rows[p])];
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
          on = false;
          continue;
        }
        ctx[on ? 'lineTo' : 'moveTo'](fx(u), fy(v));
        on = true;
      }
      ctx.stroke();
    };
    // along the rows: every row grey first (those in no block stay so), then the blocks in their colours
    if (rowsView) {
      ctx.strokeStyle = GREY;
      ctx.lineWidth = 1;
      line(Array.from({ length: g.n }, (_, i) => i), false);
    }
    const dots = !g.contiguous && rowsView;
    g.blocks.forEach((b, k) => {
      const col = b.kept ? colorOf(k) : GREY;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = b.kept ? 1.5 : 1;
      ctx.setLineDash(b.part ? [4, 3] : []);
      line(b.rows, dots);
    });
    ctx.setLineDash([]);
    // the cuts: of the rule solid, by hand dashed red; the one dragged
    if (cutsShown) {
      for (const cut of g.cuts) {
        if (drag?.kind === 'cut' && drag.cut === cut) continue;
        ctx.strokeStyle = cut.hand ? '#d62728' : '#555555';
        ctx.setLineDash(cut.hand ? [5, 3] : []);
        ctx.lineWidth = 1;
        const x = Math.round(fx(cut.row)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, M.t);
        ctx.lineTo(x, M.t + ph);
        ctx.stroke();
      }
      if (drag?.kind === 'cut') {
        ctx.strokeStyle = '#d62728';
        ctx.setLineDash([2, 2]);
        const x = Math.round(fx(drag.row)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, M.t);
        ctx.lineTo(x, M.t + ph);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (drag?.kind === 'range') {
      ctx.fillStyle = 'rgba(31, 111, 214, 0.15)';
      const [a, b] = [fx(Math.min(drag.a, drag.b)), fx(Math.max(drag.a, drag.b))];
      ctx.fillRect(a, M.t, Math.max(1, b - a), ph);
    }
    // where the cut would land: a diamond on the point (and, along the rows, a guide line)
    if (hover !== null && (tool === 'cut' || drag?.kind === 'cut')) {
      const [u, v] = [px(hover - 1), py(hover - 1)];
      if (rowsView && drag?.kind !== 'cut') {
        ctx.strokeStyle = 'rgba(214, 39, 40, 0.5)';
        ctx.setLineDash([2, 3]);
        const x = Math.round(fx(hover)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, M.t);
        ctx.lineTo(x, M.t + ph);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (Number.isFinite(u) && Number.isFinite(v)) {
        const [cx, cy] = [fx(u), fy(v)];
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d62728';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 5);
        ctx.lineTo(cx + 5, cy);
        ctx.lineTo(cx, cy + 5);
        ctx.lineTo(cx - 5, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    // the block numbers over the frame (along the rows), when there is room for them
    if (rowsView && g.contiguous && g.blocks.length && pw / g.blocks.length >= 12) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      g.blocks.forEach((b, k) => {
        const mid = (b.rows[0] + b.rows[b.rows.length - 1]) / 2 + 1;
        const x = fx(mid);
        if (x < M.l || x > M.l + pw) return;
        ctx.fillStyle = b.kept ? colorOf(k) : '#999999';
        ctx.fillText(`${k + 1}${b.part ? '*' : ''}`, x, M.t - 4);
      });
    }
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    ctx.fillStyle = '#333333';
    ctx.font = '10px system-ui, sans-serif';
    const sx = niceStep(box.x1 - box.x0, Math.max(3, Math.round(pw / 80)));
    ctx.textAlign = 'center';
    for (let v = Math.ceil(box.x0 / sx) * sx; v <= box.x1 + sx * 1e-9; v += sx) ctx.fillText(fmtNum(Math.abs(v) < sx * 1e-9 ? 0 : v, 4), fx(v), H - M.b + 12);
    const sy = niceStep(box.y1 - box.y0, Math.max(3, Math.round(ph / 40)));
    ctx.textAlign = 'right';
    for (let v = Math.ceil(box.y0 / sy) * sy; v <= box.y1 + sy * 1e-9; v += sy) ctx.fillText(fmtNum(Math.abs(v) < sy * 1e-9 ? 0 : v, 4), M.l - 4, fy(v) + 3);
    ctx.textAlign = 'center';
    ctx.fillText(rowsView ? `row — ${g.f.name || 'X'} along the rows` : `${g.x.name || 'X'} — ${Y?.name ?? ''}`, M.l + pw / 2, H - 3);
    if (z.rect) {
      ctx.strokeStyle = '#1f6fd6';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(z.rect.x0, z.rect.x1) + 0.5, Math.min(z.rect.y0, z.rect.y1) + 0.5, Math.abs(z.rect.x1 - z.rect.x0), Math.abs(z.rect.y1 - z.rect.y0));
      ctx.setLineDash([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, view, yAt, W, H, box.x0, box.x1, box.y0, box.y1, z.rect, drag, hover, tool]);

  const at = (e: { currentTarget: EventTarget; clientX: number; clientY: number }): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const rowAt = (p: number) => Math.max(1, Math.min(g.n, Math.round(ix(p))));
  const nearCut = (p: number) => (cutsShown ? g.cuts.find((c) => Math.abs(fx(c.row) - p) <= 5) : undefined);
  // the row of the point nearest the mouse (on the curves: any block's; along the rows: the row under it)
  const nearestRow = (qx: number, qy: number): number | null => {
    if (rowsView) return rowAt(qx);
    let best: number | null = null;
    let d = 15 * 15;
    for (const b of g.blocks)
      for (const i of b.rows) {
        const [u, v] = [px(i), py(i)];
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
        const e = (fx(u) - qx) ** 2 + (fy(v) - qy) ** 2;
        if (e < d) [d, best] = [e, i + 1];
      }
    return best;
  };
  // the row a cut lands on (from 1), by the snap: the nearest maximum / minimum within reach, else the nearest data
  // point (along the rows: among the rows near the mouse); off or `free` (Alt): the row under the mouse
  const snapRow = (qx: number, qy: number, free: boolean): number | null => {
    if (free || snap === 'off') return nearestRow(qx, qy);
    const dist = (i: number) => {
      const [u, v] = [px(i), py(i)];
      return Number.isFinite(u) && Number.isFinite(v) ? (fx(u) - qx) ** 2 + (fy(v) - qy) ** 2 : Infinity;
    };
    if (snap !== 'data') {
      // along the rows a maximum or minimum is found across: within reach left or right, wherever the mouse is up or
      // down; on the curves, within reach around the mouse
      let best: number | null = null;
      let d = rowsView ? REACH_ROWS : SNAP_PX * SNAP_PX;
      for (const e of extremes) {
        if ((snap === 'max' && !e.top) || (snap === 'min' && e.top)) continue;
        const q = rowsView ? Math.abs(fx(px(e.i)) - qx) : dist(e.i);
        if (q <= d) [d, best] = [q, e.i + 1];
      }
      if (best !== null) return best;
    }
    if (!rowsView) return nearestRow(qx, qy);
    const [a, b] = [rowAt(qx - 25), rowAt(qx + 25)];
    let best = rowAt(qx);
    let d = Infinity;
    for (let r = a; r <= b; r++) {
      const q = dist(r - 1);
      if (q < d) [d, best] = [q, r];
    }
    return best;
  };
  // the block of a row (the later one of a point two blocks share — the one it starts)
  const blockOfRow = (row: number) => {
    let found = -1;
    g.blocks.forEach((b, k) => {
      if (b.rows.includes(row - 1)) found = k;
    });
    return found;
  };
  const curves: ReadCurve[] = g.blocks.map((b, k) => ({ name: b.name, color: b.kept ? colorOf(k) : GREY, x: Array.from(b.rows, px), y: Array.from(b.rows, py) }));
  return (
    <div className="reader-host nodrag nowheel">
      <canvas
        ref={cv}
        className="signal-graph"
        tabIndex={0}
        style={{ width: W, height: H, cursor }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          const [qx, qy] = at(e);
          if (z.down(qx, qy, e)) return;
          if (tool === 'range' && rowsView) return setDrag({ kind: 'range', a: rowAt(qx), b: rowAt(qx) });
          const cut = tool !== 'pick' ? nearCut(qx) : undefined;
          if (cut) return setDrag({ kind: 'cut', cut, row: cut.row });
          if (tool === 'cut') {
            const r = snapRow(qx, qy, e.altKey);
            if (r !== null) edits.addCut(r);
          } else if (tool === 'pick') {
            const r = nearestRow(qx, qy);
            const k = r === null ? -1 : blockOfRow(r);
            if (k >= 0) edits.toggleBlock(k);
          }
        }}
        onPointerMove={(e) => {
          const [qx, qy] = at(e);
          if (z.move(qx, qy)) return setCursor(zoom === 'pan' ? 'grab' : 'crosshair');
          if (drag?.kind === 'cut') {
            const row = snapRow(qx, qy, e.altKey) ?? rowAt(qx);
            setDrag({ ...drag, row });
            setHover(row);
          } else if (drag?.kind === 'range') setDrag({ ...drag, b: rowAt(qx) });
          else if (tool === 'cut') setHover(nearCut(qx) ? null : snapRow(qx, qy, e.altKey));
          setCursor(drag?.kind === 'cut' || (tool !== 'pick' && nearCut(qx)) ? 'ew-resize' : tool === 'cut' ? 'copy' : tool === 'pick' ? 'pointer' : tool === 'range' && rowsView ? 'col-resize' : 'default');
        }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(e) => {
          if (z.up(...at(e))) return;
          if (drag?.kind === 'cut' && drag.row !== drag.cut.row) edits.moveCut(drag.cut, drag.row);
          if (drag?.kind === 'range' && drag.a !== drag.b) edits.setRange(Math.min(drag.a, drag.b), Math.max(drag.a, drag.b));
          setDrag(null);
          if (drag?.kind === 'cut') setHover(null);
        }}
        onDoubleClick={(e) => {
          const cut = nearCut(at(e)[0]);
          if (cut) edits.removeCut(cut);
        }}
        onContextMenu={(e) => {
          // a right-click on a cut removes it (as a double-click)
          const cut = nearCut(at(e)[0]);
          if (!cut) return;
          e.preventDefault();
          e.stopPropagation();
          edits.removeCut(cut);
        }}
        onWheel={(e) => z.wheel(...at(e), e.deltaY, e)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            e.stopPropagation();
            onView(null);
          }
        }}
      />
      {reader.r.on && <ReaderLayer reader={{ ...reader, curves }} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />}
    </div>
  );
}

// The graph with its tools: the view (along the rows / the curves, and the Y drawn), zoom, pan, the reader, the edits,
// the graph large
// (tol: the turn tolerance of the node, % of the range — the maxima and minima a cut snaps to)
export function SplitGraphView({ g, view, setView, edits, tol }: { g: SplitGraph; view: 'rows' | 'curves'; setView: (v: 'rows' | 'curves') => void; edits: SplitEdits; tol: number }) {
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [snap, setSnap] = useState<SplitSnap>('data');
  const [box, setBox] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [tool, setTool] = useState<SplitTool>('none');
  const [yAt, setYAt] = useState(0);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  useEffect(() => {
    if (tool === 'none') return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setTool('none');
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [tool]);
  const pickTool = (t: SplitTool) => {
    setTool((now) => (now === t ? 'none' : t));
    setZoom('none');
    setRd((q) => ({ ...q, on: false }));
  };
  const toolBtn = (t: SplitTool, icon: ReactNode, label: string, title: string, disabled = false) => (
    <button className={`nodrag${tool === t ? ' on' : ''}`} disabled={disabled} title={title} onClick={() => pickTool(t)}>
      {icon} {label}
    </button>
  );
  const tools = (
    <>
      <div className="row wrap">
        <Select<'rows' | 'curves'>
          value={view}
          title="Along the rows: the column the blocks are found from, row by row (the cycles, jumps and cuts are seen there); the curves: a Y over X, block by block"
          options={[
            ['rows', `${g.f.name || 'X'} along the rows`],
            ['curves', 'the curves'],
          ]}
          onChange={(v) => {
            // another view: all of it again
            setBox(null);
            setView(v);
          }}
        />
        {view === 'curves' && g.ys.length > 1 && (
          <Select<number>
            value={Math.min(yAt, g.ys.length - 1)}
            title="The Y drawn"
            options={g.ys.map((c, k): [number, string] => [k, c.name])}
            onChange={(k) => {
              setBox(null);
              setYAt(k);
            }}
          />
        )}
        <span className="grow" />
        {toolBtn('cut', <Scissors {...IC} />, 'Cut', 'A click puts a cut where the marker shows (Snap). On a cut line: drag it to another row; a double-click or a right-click removes it (a cut of the rule too). Esc: off', !g.contiguous)}
        {g.contiguous && (
          <Select<SplitSnap>
            value={snap}
            title="Where a cut placed or dragged lands — data: the nearest data point; max & min, max, min: the nearest one within reach (along the rows: where the column turns, a scan's vertices; on the curves: the peaks of the Y drawn — the tolerance of Turns), else the nearest data point; off: the row under the mouse. Alt: off while held"
            options={[
              ['data', 'snap: data'],
              ['turns', 'snap: max & min'],
              ['max', 'snap: max'],
              ['min', 'snap: min'],
              ['off', 'snap: off'],
            ]}
            onChange={setSnap}
          />
        )}
        {toolBtn('pick', <MousePointerClick {...IC} />, 'Blocks', 'A click on a block keeps it or leaves it out (Keep). Esc: off')}
        {toolBtn('range', <SquareDashedMousePointer {...IC} />, 'Rows', 'Drag across the rows to use (along the rows). Esc: off', view !== 'rows')}
      </div>
      <div className="row wrap">
        <span className="grow" />
        <ZoomTools
          mode={zoom}
          setMode={(m) => {
            setZoom(m);
            if (m !== 'none') {
              setTool('none');
              setRd((q) => ({ ...q, on: false }));
            }
          }}
          onRescale={() => setBox(null)}
          onRescaleAxis={(w) => setBox((v) => rescaleAxis(v, w))}
          onZoomOut={() => setOut((n) => n + 1)}
          zoomed={!!box}
        />
        <ReaderButton
          r={rd}
          set={setRd}
          onOn={() => {
            setZoom('none');
            setTool('none');
          }}
        />
        <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
      <ReaderOptions r={rd} set={setRd} names={g.blocks.map((b) => b.name)} />
    </>
  );
  const graph = (w: number, h: number) => <Graph g={g} view={view} W={w} H={h} zoom={zoom} box={box} onView={setBox} zoomOut={out} tool={tool} snap={snap} tol={tol} edits={edits} yAt={yAt} reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }} />;
  return (
    <>
      {tools}
      {graph(W0, H0)}
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <XIcon {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {graph(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(320, Math.min((window.innerHeight || 800) * 0.7, 760)))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
