// Data manipulation: the points of two columns on a graph of their own, chosen with the mouse (click, rectangle,
// lasso) or by a condition, then masked, deleted or moved. The changes are a list of operations kept in the node; on
// request the deletions and moved values are written into the worksheet of the Import the data come from.
import { useContext, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { EngineContext, useNodeResult } from '../engine/engine.ts';
import { compile } from '../engine/expr.ts';
import { renumber, ROW_ADDED, ROW_CHANGED, ROW_DELETED, ROW_MASKED, type ManipKind, type ManipOp } from '../engine/manip.ts';
import { parseRows } from '../engine/rows.ts';
import { rowsText } from '../engine/split.ts';
import { describe } from '../engine/stats.ts';
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import type { AppNode, DataManipData, DataManipNode, ImportData } from '../types.ts';
import { Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { Maximize2, Move, Plus, SquareDashedMousePointer, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReaderProp } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';
import { ask, notify } from '../ui/dialogStore.ts';

type Tool = 'select' | 'move' | 'add';
type Box = { x0: number; x1: number; y0: number; y1: number };
const M = { l: 48, r: 10, t: 8, b: 30 };
const COLORS = { point: '#1f6fd6', line: '#9aa4b2', masked: '#b4b4b4', deleted: '#e04848', changed: '#e69f00', selected: '#d6568f', added: '#009e73' };

// The graph: points drawn on a canvas, the rectangle / lasso / move on top of it.
function ManipPlot(props: {
  x: Float64Array;
  y: Float64Array;
  state: Uint8Array;
  sel: Set<number>;
  tool: Tool;
  width: number;
  height: number;
  xTitle: string;
  yTitle: string;
  onSelect: (rows: number[], how: 'set' | 'add' | 'remove') => void;
  onMove: (dx: number, dy: number) => void;
  onHover: (row: number | null) => void;
  // the points added by hand: after the nIn input rows; added, moved (dragged), removed (double click)
  nIn: number;
  onAdd: (x: number, y: number) => void;
  onMoveAdded: (k: number, x: number, y: number) => void;
  onRemoveAdded: (k: number) => void;
  zoom?: ZoomMode;
  view?: View | null;
  onView?: (v: View | null) => void;
  zoomOut?: number;
  reader?: ReaderProp;
}) {
  const { x, y, state, sel, tool, width: W, height: H } = props;
  const cv = useRef<HTMLCanvasElement>(null);
  type Drag = { kind: 'rect' | 'lasso' | 'move' | 'addnew' | 'addmove'; pts: [number, number][]; mods: { add: boolean; remove: boolean; onlyY: boolean; onlyX: boolean }; k?: number };
  const [drag, setDragState] = useState<Drag | null>(null);
  // the drag as it is now (events can come faster than the redraws)
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  // the range of the data (deleted points too, so the view stays put)
  const auto: Box = useMemo(() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < x.length; i++) {
      if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
      x0 = Math.min(x0, x[i]);
      x1 = Math.max(x1, x[i]);
      y0 = Math.min(y0, y[i]);
      y1 = Math.max(y1, y[i]);
    }
    if (!Number.isFinite(x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    const px = (x1 - x0 || Math.abs(x0) || 1) * 0.04;
    const py = (y1 - y0 || Math.abs(y0) || 1) * 0.06;
    return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
  }, [x, y]);
  const box: Box = viewBox(props.view, auto);
  const z = usePlotZoom(props.zoom ?? 'none', { l: M.l, t: M.t, w: pw, h: ph }, box, (v) => props.onView?.(v));
  // Zoom out (the button): the view widened around its middle
  useEffect(() => {
    if (props.zoomOut) props.onView?.(zoomAt(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 1.6, 'both'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.zoomOut]);
  const fx = (v: number) => M.l + ((v - box.x0) / (box.x1 - box.x0)) * pw;
  const fy = (v: number) => M.t + (1 - (v - box.y0) / (box.y1 - box.y0)) * ph;
  const ix = (p: number) => box.x0 + ((p - M.l) / pw) * (box.x1 - box.x0);
  const iy = (p: number) => box.y0 + (1 - (p - M.t) / ph) * (box.y1 - box.y0);
  const shift = drag?.kind === 'move' && drag.pts.length > 1 ? [drag.mods.onlyY ? 0 : drag.pts[drag.pts.length - 1][0] - drag.pts[0][0], drag.mods.onlyX ? 0 : drag.pts[drag.pts.length - 1][1] - drag.pts[0][1]] : [0, 0];

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.rect(M.l, M.t, pw, ph);
    g.clip();
    const n = x.length;
    const r = n > 20000 ? 1.1 : n > 2000 ? 1.8 : 2.6;
    // the line through the points kept (in their order)
    if (n < 300000) {
      g.strokeStyle = COLORS.line;
      g.lineWidth = 0.6;
      g.beginPath();
      let on = false;
      for (let i = 0; i < n; i++) {
        if (state[i] & (ROW_DELETED | ROW_MASKED | ROW_ADDED) || !Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
        if (on) g.lineTo(fx(x[i]), fy(y[i]));
        else g.moveTo(fx(x[i]), fy(y[i]));
        on = true;
      }
      g.stroke();
    }
    const dot = (i: number, color: string, rr: number, dx = 0, dy = 0) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(fx(x[i]) + dx, fy(y[i]) + dy, rr, 0, 2 * Math.PI);
      g.fill();
    };
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
      const s = state[i];
      if (s & ROW_DELETED) {
        g.strokeStyle = COLORS.deleted;
        g.lineWidth = 1;
        const [px, py] = [fx(x[i]), fy(y[i])];
        g.beginPath();
        g.moveTo(px - r - 1, py - r - 1);
        g.lineTo(px + r + 1, py + r + 1);
        g.moveTo(px - r - 1, py + r + 1);
        g.lineTo(px + r + 1, py - r - 1);
        g.stroke();
        continue;
      }
      if (s & ROW_ADDED) {
        // a point added by hand: a square (where it is being dragged to, while dragged)
        const dragged = drag?.kind === 'addmove' && drag.k === i && drag.pts.length > 1;
        const [px, py] = dragged ? drag.pts[drag.pts.length - 1] : [fx(x[i]), fy(y[i])];
        g.fillStyle = COLORS.added;
        g.fillRect(px - r - 1, py - r - 1, 2 * r + 2, 2 * r + 2);
        continue;
      }
      dot(i, s & ROW_MASKED ? COLORS.masked : COLORS.point, r);
      if (s & ROW_CHANGED) {
        g.strokeStyle = COLORS.changed;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(fx(x[i]), fy(y[i]), r + 1.6, 0, 2 * Math.PI);
        g.stroke();
      }
    }
    for (const i of sel) {
      if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
      if (state[i] & ROW_DELETED) {
        g.strokeStyle = COLORS.selected;
        g.lineWidth = 1.8;
        g.beginPath();
        g.arc(fx(x[i]), fy(y[i]), r + 2.5, 0, 2 * Math.PI);
        g.stroke();
      } else {
        dot(i, COLORS.selected, r + 1.2, shift[0], shift[1]);
      }
    }
    g.restore();
    // the frame and the numbers
    g.strokeStyle = '#333333';
    g.lineWidth = 1;
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = '#333333';
    g.font = '10px system-ui, sans-serif';
    const tick = (lo: number, hi: number, f: (v: number) => number, horiz: boolean) => {
      const st = niceStep(hi - lo, horiz ? Math.max(3, Math.round(pw / 80)) : Math.max(3, Math.round(ph / 50)));
      for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) {
        const p = f(v);
        const t = fmtNum(Math.abs(v) < st * 1e-9 ? 0 : v, 4);
        if (horiz) {
          g.fillRect(p, M.t + ph - 4, 1, 4);
          g.textAlign = 'center';
          g.fillText(t, p, M.t + ph + 12);
        } else {
          g.fillRect(M.l, p, 4, 1);
          g.textAlign = 'right';
          g.fillText(t, M.l - 4, p + 3);
        }
      }
    };
    tick(box.x0, box.x1, fx, true);
    tick(box.y0, box.y1, fy, false);
    g.textAlign = 'center';
    g.fillText(props.xTitle, M.l + pw / 2, H - 3);
    g.save();
    g.translate(10, M.t + ph / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(props.yTitle, 0, 0);
    g.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, state, sel, W, H, box, shift[0], shift[1], props.xTitle, props.yTitle, drag]);

  const at = (e: RPointerEvent): [number, number] => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  // the point nearest the mouse: of the input rows, or (added) of the points added
  const nearest = (px: number, py: number, within = 8, added = false) => {
    let best = -1;
    let d = within * within;
    for (let i = added ? props.nIn : 0; i < (added ? x.length : props.nIn); i++) {
      const dd = (fx(x[i]) - px) ** 2 + (fy(y[i]) - py) ** 2;
      if (dd < d) [d, best] = [dd, i];
    }
    return best;
  };
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not track (nothing to capture)
    }
    const p = at(e);
    if (z.down(p[0], p[1], e)) return;
    const mods = { add: e.ctrlKey || e.metaKey, remove: e.altKey && tool === 'select', onlyY: e.shiftKey, onlyX: e.altKey };
    if (tool === 'add') {
      const k = nearest(p[0], p[1], 8, true);
      return setDrag(k >= 0 ? { kind: 'addmove', pts: [p], mods, k } : { kind: 'addnew', pts: [p], mods });
    }
    setDrag({ kind: tool === 'move' ? 'move' : e.shiftKey ? 'lasso' : 'rect', pts: [p], mods });
  };
  const move = (e: RPointerEvent) => {
    const p = at(e);
    if (z.move(p[0], p[1])) return;
    const drag = dragRef.current;
    if (!drag) {
      const k = nearest(p[0], p[1]);
      props.onHover(k >= 0 ? k : null);
      return;
    }
    setDrag({ ...drag, pts: drag.kind === 'lasso' ? [...drag.pts, p] : [drag.pts[0], p] });
  };
  const up = (e: RPointerEvent) => {
    const p = at(e);
    if (z.up(p[0], p[1])) return;
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    const [a, b] = [d.pts[0], d.pts[d.pts.length - 1]];
    const r6 = (v: number) => +v.toPrecision(6);
    if (d.kind === 'addnew') return props.onAdd(r6(ix(b[0])), r6(iy(b[1])));
    if (d.kind === 'addmove') {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 2) props.onMoveAdded(d.k! - props.nIn, r6(ix(b[0])), r6(iy(b[1])));
      return;
    }
    const how = d.mods.remove ? 'remove' : d.mods.add ? 'add' : 'set';
    if (d.kind === 'move') {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 2) return;
      props.onMove(d.mods.onlyY ? 0 : ix(b[0]) - ix(a[0]), d.mods.onlyX ? 0 : iy(b[1]) - iy(a[1]));
      return;
    }
    // a click: the nearest point
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 3 && d.pts.length < 4) {
      const k = nearest(a[0], a[1]);
      props.onSelect(k >= 0 ? [k] : [], how);
      return;
    }
    const rows: number[] = [];
    if (d.kind === 'rect') {
      const [l, r] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [t, bt] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      for (let i = 0; i < x.length; i++) {
        const [px, py] = [fx(x[i]), fy(y[i])];
        if (px >= l && px <= r && py >= t && py <= bt) rows.push(i);
      }
    } else {
      // inside the lasso (even–odd rule)
      const poly = d.pts;
      for (let i = 0; i < x.length; i++) {
        const [px, py] = [fx(x[i]), fy(y[i])];
        let inside = false;
        for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
          const [xj, yj] = poly[j];
          const [xk, yk] = poly[k];
          if (yj > py !== yk > py && px < ((xk - xj) * (py - yj)) / (yk - yj) + xj) inside = !inside;
        }
        if (inside) rows.push(i);
      }
    }
    props.onSelect(rows, how);
  };
  const [a, b] = drag ? [drag.pts[0], drag.pts[drag.pts.length - 1]] : [null, null];
  return (
    <div
      className="manip-plot nodrag nowheel"
      tabIndex={0}
      style={{ width: W, height: H, cursor: props.zoom === 'pan' ? 'grab' : tool === 'move' && props.zoom !== 'zoom' ? 'move' : tool === 'add' && props.zoom === 'none' ? 'copy' : 'crosshair' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => props.onHover(null)}
      onDoubleClick={(e) => {
        if (tool !== 'add') return;
        const p = at(e as unknown as RPointerEvent);
        const k = nearest(p[0], p[1], 8, true);
        if (k >= 0) props.onRemoveAdded(k - props.nIn);
      }}
      onWheel={(e) => {
        const p = at(e as unknown as RPointerEvent);
        z.wheel(p[0], p[1], e.deltaY, e);
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          e.stopPropagation();
          props.onView?.(null);
        }
      }}
    >
      <canvas ref={cv} style={{ width: W, height: H }} />
      <ReaderLayer reader={props.reader} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />
      <svg width={W} height={H}>
        {z.rect && <rect x={Math.min(z.rect.x0, z.rect.x1)} y={Math.min(z.rect.y0, z.rect.y1)} width={Math.abs(z.rect.x1 - z.rect.x0)} height={Math.abs(z.rect.y1 - z.rect.y0)} fill="none" stroke="#1f6fd6" strokeDasharray="4 3" />}
        {drag?.kind === 'rect' && a && b && <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill="#d6568f" fillOpacity={0.1} stroke="#d6568f" strokeDasharray="3 2" />}
        {drag?.kind === 'lasso' && <polygon points={drag.pts.map((p) => p.join(',')).join(' ')} fill="#d6568f" fillOpacity={0.1} stroke="#d6568f" strokeDasharray="3 2" />}
      </svg>
    </div>
  );
}

const OP_TEXT: Record<ManipKind, string> = { mask: 'masked', unmask: 'unmasked', delete: 'deleted', move: 'moved', scale: 'scaled', set: 'set', restore: 'restored' };
const opText = (op: ManipOp) => {
  const count = (() => {
    const r = parseRows(op.rows, op.n);
    return typeof r === 'string' ? '?' : String(r.length);
  })();
  const what = op.kind === 'move' ? ` by ${op.dx ? `ΔX ${fmtNum(op.dx, 4)}` : ''}${op.dx && op.dy ? ', ' : ''}${op.dy ? `ΔY ${fmtNum(op.dy, 4)}` : ''}` : op.kind === 'scale' ? ` ${op.axis?.toUpperCase()} × ${op.factor}` : op.kind === 'set' ? ` ${op.axis?.toUpperCase()} = ${op.value}` : '';
  return `${OP_TEXT[op.kind]} ${count} point${count === '1' ? '' : 's'}${what} (rows ${op.rows})`;
};

export function DataManipNodeView({ id, data }: NodeProps<DataManipNode>) {
  const { updateNodeData, getNode, getEdges } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const engine = useContext(EngineContext);
  const set = (patch: Partial<DataManipData>) => updateNodeData(id, patch);
  const m = r?.view.manip;
  const avail = r?.view.available ?? [];
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [big, setBig] = useState(false);
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const [cond, setCond] = useState('');
  const [condErr, setCondErr] = useState('');
  const [d, setD] = useState({ dx: NaN, dy: NaN, factor: NaN, value: NaN, axis: 'y' as 'x' | 'y' });
  const n = m?.nIn ?? 0;
  const live = [...sel].filter((i) => i < n && !(m!.state[i] & ROW_DELETED));
  const canRestore = [...sel].some((i) => i < n && (m!.state[i] & (ROW_MASKED | ROW_DELETED)));
  const onRestore = () => {
    const rows = [...sel].filter((i) => i < n);
    if (!rows.length) return;
    set({ ops: [...data.ops, { kind: 'restore', rows: rowsText(rows.map((i) => i + 1)), n }] });
  };
  const added = data.added ?? [];
  const setAdded = (a: { x: number; y: number }[]) => set({ added: a });
  const addOp = (op: Omit<ManipOp, 'rows' | 'n'>) => {
    if (!live.length) return;
    set({ ops: [...data.ops, { ...op, rows: rowsText(live.map((i) => i + 1)), n }] });
    if (op.kind === 'delete') setSel(new Set());
  };
  const onSelect = (rows: number[], how: 'set' | 'add' | 'remove') =>
    setSel((s) => {
      if (how === 'set') return new Set(rows);
      const next = new Set(s);
      for (const k of rows) {
        if (how === 'add') next.add(k);
        else next.delete(k);
      }
      return next;
    });
  // points chosen by a condition on x, y, i (the row), n and the means / SDs
  const byCondition = () => {
    if (!m) return;
    const f = compile(cond);
    if (typeof f === 'string') return setCondErr(f);
    const kept = Array.from({ length: n }, (_, i) => i).filter((i) => !(m.state[i] & ROW_DELETED));
    const sx = describe(kept.map((i) => m.x[i]));
    const sy = describe(kept.map((i) => m.y[i]));
    const known = ['x', 'y', 'i', 'n', 'xmean', 'xsd', 'ymean', 'ysd'];
    const bad = f.names.filter((v) => !known.includes(v));
    if (bad.length) return setCondErr(`Unknown name${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: use x, y, i (the row), n, xmean, xsd, ymean, ysd.`);
    const v = { x: 0, y: 0, i: 0, n, xmean: sx.mean, xsd: sx.sd, ymean: sy.mean, ysd: sy.sd };
    const rows = kept.filter((i) => {
      v.x = m.x[i];
      v.y = m.y[i];
      v.i = i + 1;
      return f.fn(v) > 0;
    });
    setCondErr(rows.length ? '' : 'No point meets the condition.');
    setSel(new Set(rows));
  };
  // the Import the data come from (directly, or through reroutes): deletions and moved values can be written there
  const source = (() => {
    let e = getEdges().find((x) => x.target === id && x.targetHandle === 'in');
    for (let k = 0; e && k < 20; k++) {
      const s = getNode(e.source);
      if (s?.type === 'import') return e.sourceHandle === 'out' || !e.sourceHandle ? s : null;
      if (s?.type !== 'reroute') return null;
      e = getEdges().find((x) => x.target === s.id);
    }
    return null;
  })();
  const applyToImport = async () => {
    if (!m || !source || source.type !== 'import') return;
    const res = engine.results.get(source.id);
    const map = res?.view.sheet;
    const ds = res?.outputs.out?.t === 'dataset' ? res.outputs.out.v : null;
    if (!map || !ds) return;
    const deleted = new Set<number>();
    for (let i = 0; i < n; i++) if (m.state[i] & ROW_DELETED) deleted.add(i);
    const cx = ds.columns.findIndex((c) => c.name === m.xName);
    const cy = ds.columns.findIndex((c) => c.name === m.yName);
    const cells: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      if (!(m.state[i] & ROW_CHANGED) || deleted.has(i)) continue;
      if (cx >= 0 && m.x[i] !== ds.columns[cx].values[i]) cells[`${map.rows[i]}:${map.cols[cx]}`] = String(m.x[i]);
      if (cy >= 0 && m.y[i] !== ds.columns[cy].values[i]) cells[`${map.rows[i]}:${map.cols[cy]}`] = String(m.y[i]);
    }
    const nCells = Object.keys(cells).length;
    if (!deleted.size && !nCells) return notify('Nothing to write: masks stay in this node (the Import has no masks).');
    if (!(await ask(`Write into the worksheet of “${source.data.name || source.data.fileName || 'Import'}”: ${deleted.size} deleted row${deleted.size === 1 ? '' : 's'} and ${nCells} changed value${nCells === 1 ? '' : 's'}? (There they can be undone: Undo all changes, or Ctrl+Z.) The masks stay in this node.`, { ok: 'Write' }))) return;
    const d0 = source.data as ImportData;
    const sheet = d0.sheets?.length ? d0.sheets[Math.min(d0.sheets.length - 1, Math.max(0, d0.sheet ?? 0))].name : null;
    const e0 = (sheet ? d0.sheetEdits?.[sheet] : d0.edits) ?? {};
    const e1 = { ...e0, cells: { ...e0.cells, ...cells }, delRows: [...(e0.delRows ?? []), ...[...deleted].map((i) => map.rows[i])] };
    updateNodeData(source.id, sheet ? { sheetEdits: { ...d0.sheetEdits, [sheet]: e1 } } : { edits: e1 });
    // here: the masks only, their rows counted again without the deleted ones
    set({ ops: renumber(data.ops.filter((o) => o.kind === 'mask' || o.kind === 'unmask'), deleted, n) });
    setSel(new Set());
  };
  const names = avail.map((c) => c.name);
  const plotW = 520;
  const counts = useMemo(() => {
    if (!m) return { masked: 0, deleted: 0, changed: 0 };
    let [a, b, c] = [0, 0, 0];
    for (const s of m.state) {
      if (s & ROW_DELETED) b++;
      else {
        if (s & ROW_MASKED) a++;
        if (s & ROW_CHANGED) c++;
      }
    }
    return { masked: a, deleted: b, changed: c };
  }, [m]);
  const plot = (w: number, h: number) =>
    m && (
      <ManipPlot
        reader={{ r: rd, curves: [{ name: m.yName || 'data', color: '#1f6fd6', x: m.x, y: m.y }], onRead: (reading) => setRd((q) => ({ ...q, reading })) }}
        x={m.x}
        y={m.y}
        state={m.state}
        sel={sel}
        tool={tool}
        width={w}
        height={h}
        xTitle={m.xName || 'row'}
        yTitle={m.yName}
        onSelect={onSelect}
        onMove={(dx, dy) => addOp({ kind: 'move', dx, dy })}
        onHover={setHover}
        nIn={m.nIn}
        onAdd={(x, y) => setAdded([...added, { x, y }])}
        onMoveAdded={(k, x, y) => setAdded(added.map((p, j) => (j === k ? { x, y } : p)))}
        onRemoveAdded={(k) => setAdded(added.filter((_, j) => j !== k))}
        zoom={zoom}
        view={view}
        onView={setView}
        zoomOut={out}
      />
    );
  const readout = hover !== null && m ? `row ${hover + 1}: x = ${fmtNum(m.x[hover])}, y = ${fmtNum(m.y[hover])}${m.state[hover] & ROW_MASKED ? ' (masked)' : ''}` : `${live.length} selected · ${counts.masked} masked · ${counts.deleted} deleted · ${counts.changed} moved${added.length ? ` · ${added.length} added` : ''}`;
  const quickActions = (
    <div className="row wrap manip-actions" style={{ marginTop: 4, marginBottom: 4 }}>
      <button className="nodrag" disabled={!live.length} title="Kept, but grey or hidden in Plot and left out of statistics, fits, smoothing" onClick={() => addOp({ kind: 'mask' })}>
        Mask
      </button>
      <button className="nodrag danger" disabled={!live.length} title="The rows leave the output of this node" onClick={() => addOp({ kind: 'delete' })}>
        Delete
      </button>
      <button className="nodrag" disabled={!canRestore} title="Selected points become normal again (unmasked and undeleted)" onClick={onRestore}>
        Restore
      </button>
      <button className="nodrag" disabled={!data.ops.length} title="Undo the last operation" onClick={() => set({ ops: data.ops.slice(0, -1) })}>
        Undo last
      </button>
    </div>
  );
  const toolbar = (
    <>
    <div className="row wrap manip-tools">
      <button
        className={`nodrag${tool === 'select' && zoom === 'none' ? ' on' : ''}`}
        title="Select: click a point, drag a rectangle, Shift + drag a lasso; Ctrl adds to the selection, Alt takes away"
        onClick={() => {
          setTool('select');
          setZoom('none');
        }}
      >
        <SquareDashedMousePointer {...IC} /> Select
      </button>
      <button
        className={`nodrag${tool === 'move' && zoom === 'none' ? ' on' : ''}`}
        title="Move the selected points: drag (Shift: only Y, Alt: only X)"
        onClick={() => {
          setTool('move');
          setZoom('none');
        }}
      >
        <Move {...IC} /> Move
      </button>
      <button
        className={`nodrag${tool === 'add' && zoom === 'none' ? ' on' : ''}`}
        title="Add points by hand: click where a point goes, drag an added point to move it, double-click it to remove it"
        onClick={() => {
          setTool('add');
          setZoom('none');
        }}
      >
        <Plus {...IC} /> Add
      </button>
      <button className="nodrag" title="Select every point" onClick={() => setSel(new Set(Array.from({ length: n }, (_, i) => i)))}>
        All
      </button>
      <button className="nodrag" title="Select the others" onClick={() => setSel((s) => new Set(Array.from({ length: n }, (_, i) => i).filter((i) => !s.has(i))))}>
        Invert
      </button>
      <button className="nodrag" onClick={() => setSel(new Set())}>
        None
      </button>
      <span className="grow" />
      <ZoomTools
        mode={zoom}
        setMode={(m) => {
          setZoom(m);
          if (m !== 'none') setRd((q) => ({ ...q, on: false }));
        }}
        onRescale={() => setView(null)}
        onRescaleAxis={(w) => setView((v) => rescaleAxis(v, w))}
        onZoomOut={() => setOut((n) => n + 1)}
        zoomed={!!view}
      />
      <ReaderButton r={rd} set={setRd} onOn={() => setZoom('none')} />
    </div>
    <ReaderOptions r={rd} set={setRd} names={[m?.yName || 'data']} />
    </>
  );
  return (
    <div className="node node-datamanip">
      <InPort label="dataset" port="dataset" id="in" title="The data to change (Import, Auto-extract, Combine columns …)" />
      <NodeOptions>
      <div className="grid2">
        <Field label="X">
          <Select value={m ? m.xName || '-' : data.x} options={[['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x, y: data.y || m?.yName || '' })} />
        </Field>
        <Field label="Y">
          <Select value={m?.yName ?? data.y} options={names.map((nm): [string, string] => [nm, nm])} onChange={(y) => set({ y, x: data.x || m?.xName || '-' })} />
        </Field>
      </div>
      </NodeOptions>
      {m && (
        <>
          {toolbar}
          {plot(plotW, 300)}
          {quickActions}
          <div className="row">
            <span className="muted ellipsis grow">{readout}</span>
            <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
              <Maximize2 {...IC} /> Large
            </button>
          </div>
          <NodeOptions>
          <div className="row">
            <TextInput className="mono grow" value={cond} placeholder="select where: y > 1.2 or abs(y - ymean) > 3*ysd" onChange={setCond} />
            <button className="nodrag" disabled={!cond.trim()} onClick={byCondition}>
              Select
            </button>
          </div>
          {condErr && <div className="msg warn">{condErr}</div>}
          {(tool === 'add' || added.length > 0) && (
            <div className="row wrap manip-actions">
              <span className="muted">{added.length} point{added.length === 1 ? '' : 's'} added (green squares), placed</span>
              <Select<'end' | 'start' | 'sorted'>
                value={data.addAt ?? 'sorted'}
                title="Where the rows of the points added go in the output"
                options={[
                  ['sorted', 'in the order of X (the other columns interpolated)'],
                  ['end', 'at the end'],
                  ['start', 'at the start'],
                ]}
                onChange={(addAt) => set({ addAt })}
              />
              {added.length > 0 && (
                <button className="nodrag" onClick={() => setAdded([])}>
                  Clear
                </button>
              )}
            </div>
          )}
          <div className="row wrap manip-actions">
            <button className="nodrag" disabled={!live.length} title="Kept, but grey or hidden in Plot and left out of statistics, fits, smoothing" onClick={() => addOp({ kind: 'mask' })}>
              Mask
            </button>
            <button className="nodrag" disabled={!live.length} onClick={() => addOp({ kind: 'unmask' })}>
              Unmask
            </button>
            <button className="nodrag danger" disabled={!live.length} title="The rows leave the output of this node (Apply to the Import to delete them there too)" onClick={() => addOp({ kind: 'delete' })}>
              Delete
            </button>
            <button className="nodrag" disabled={!canRestore} title="Selected points become normal again (unmasked and undeleted)" onClick={onRestore}>
              Restore
            </button>
          </div>
          <div className="row wrap manip-actions">
            <span className="muted">Move by</span>
            <span>ΔX</span>
            <NumInput className="tiny" value={d.dx} onChange={(dx) => setD({ ...d, dx })} />
            <span>ΔY</span>
            <NumInput className="tiny" value={d.dy} onChange={(dy) => setD({ ...d, dy })} />
            <button className="nodrag" disabled={!live.length || !(Number.isFinite(d.dx) || Number.isFinite(d.dy))} onClick={() => addOp({ kind: 'move', dx: Number.isFinite(d.dx) ? d.dx : 0, dy: Number.isFinite(d.dy) ? d.dy : 0 })}>
              Move
            </button>
          </div>
          <div className="row wrap manip-actions">
            <Select seg
              value={d.axis}
              options={[
                ['y', 'Y'],
                ['x', 'X'],
              ]}
              onChange={(axis) => setD({ ...d, axis })}
            />
            <span>×</span>
            <NumInput className="tiny" value={d.factor} onChange={(factor) => setD({ ...d, factor })} />
            <button className="nodrag" disabled={!live.length || !Number.isFinite(d.factor)} onClick={() => addOp({ kind: 'scale', axis: d.axis, factor: d.factor })}>
              Scale
            </button>
            <span>=</span>
            <NumInput className="tiny" value={d.value} onChange={(value) => setD({ ...d, value })} />
            <button className="nodrag" disabled={!live.length || !Number.isFinite(d.value)} onClick={() => addOp({ kind: 'set', axis: d.axis, value: d.value })}>
              Set
            </button>
          </div>
          <details open className="manip-ops">
            <summary>Operations ({data.ops.length})</summary>
            {data.ops.length === 0 && <div className="hint">None yet: select points, then Mask, Delete or Move.</div>}
            {data.ops.map((op, k) => (
              <div
                key={k}
                className="manip-op"
                style={{ cursor: 'pointer' }}
                title="Click to select these points on the graph"
                onClick={() => {
                  const rows = parseRows(op.rows, n);
                  if (typeof rows !== 'string') setSel(new Set(rows));
                }}
              >
                <span className="ellipsis" title={opText(op)}>
                  {k + 1}. {opText(op)}
                </span>
                <button
                  className="nodrag ts-btn"
                  title="Undo this operation"
                  onClick={(e) => {
                    e.stopPropagation();
                    set({ ops: data.ops.filter((_, j) => j !== k) });
                  }}
                >
                  <X {...IC} />
                </button>
              </div>
            ))}
            <div className="row wrap">
              {data.ops.length > 0 && (
                <button className="nodrag" onClick={() => void ask('Undo every operation of this node?', { ok: 'Undo all', danger: true }).then((yes) => yes && set({ ops: [] }))}>
                  Clear all
                </button>
              )}
              <button className="nodrag" disabled={!source || (!counts.deleted && !counts.changed)} title={source ? 'Write the deleted rows and the moved values into the worksheet of the Import (the masks stay here)' : 'Only when the dataset comes straight from an Import (its “dataset” output)'} onClick={applyToImport}>
                Apply to the Import
              </button>
            </div>
          </details>
          </NodeOptions>
        </>
      )}
      {big &&
        m &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {toolbar}
              {plot(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(320, Math.min((window.innerHeight || 800) * 0.72, 800)))}
              {quickActions}
              <div className="muted">{readout}</div>
            </div>
          </div>,
          document.body,
        )}
      <Messages result={r} />
      <OutPort label={`dataset${m ? ` (${n - counts.deleted + added.length} rows)` : ''}`} port="dataset" title={m ? `${m.yName || '—'}: masked rows are marked in the columns` : undefined} />
    </div>
  );
}
