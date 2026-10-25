// The interactive graph for Pick points: curves, dotted lines for at X / at Y rules, circles at picked points.
// Mouse tools: + X and + Y to add values with a click, drag line to move value, double click to delete.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Plus, X as XIcon } from 'lucide-react';
import type { PickGraph, PickRule } from '../engine/pick.ts';
import { fmtNum } from '../engine/table.ts';
import { niceStep } from '../figure/ticks.ts';
import { IC } from './iconProps.ts';
import { REGION_COLORS } from './regionColors.ts';
import { rescaleAxis, usePlotZoom, viewBox, zoomAt, type View, type ZoomMode } from './plotZoom.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { ReaderButton, ReaderLayer, ReaderOptions, type ReadCurve } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';
import { InPanel } from './inspectorStore.ts';
import { Select } from './ui.tsx';

const W0 = 520;
const H0 = 230;
const M = { l: 56, r: 10, t: 16, b: 30 };
const colorOf = (k: number) => REGION_COLORS[k % REGION_COLORS.length];

export type PickTool = 'none' | 'addX' | 'addY';
export type PickSnap = 'data' | 'off';

type LineRef = { kind: 'x' | 'y'; val: number; ruleIdx: number; valIdx: number };
type Drag = { kind: 'x' | 'y'; ruleIdx: number; valIdx: number; val: number } | null;

function parseRuleValues(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const v = Number(part.replace(',', '.'));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function Graph({
  g,
  rules,
  W,
  H,
  zoom,
  box: zbox,
  onView,
  zoomOut,
  tool,
  snap,
  onAddVal,
  onUpdateVal,
  onRemoveVal,
  reader,
}: {
  g: PickGraph;
  rules: PickRule[];
  W: number;
  H: number;
  zoom: ZoomMode;
  box: View | null;
  onView: (v: View | null) => void;
  zoomOut: number;
  tool: PickTool;
  snap: PickSnap;
  onAddVal: (kind: 'x' | 'y', val: number) => void;
  onUpdateVal: (kind: 'x' | 'y', ruleIdx: number, valIdx: number, val: number) => void;
  onRemoveVal: (kind: 'x' | 'y', ruleIdx: number, valIdx: number) => void;
  reader: { r: ReaderState; onRead: (t: string) => void };
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState('default');
  const [drag, setDrag] = useState<Drag>(null);

  // Compute bounding box across all curves
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of g.curves) {
    const n = Math.min(c.x.length, c.y.length);
    for (let i = 0; i < n; i++) {
      const u = c.x[i];
      const v = c.y[i];
      if (Number.isFinite(u) && Number.isFinite(v)) {
        x0 = Math.min(x0, u);
        x1 = Math.max(x1, u);
        y0 = Math.min(y0, v);
        y1 = Math.max(y1, v);
      }
    }
  }
  // Include points picked
  for (const p of g.points) {
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
  }

  if (y1 === y0) [y0, y1] = [y0 - 1, y1 + 1];
  if (x1 === x0) [x0, x1] = [x0 - 1, x1 + 1];
  const padY = (y1 - y0) * 0.06;
  const padX = (x1 - x0) * 0.04;
  const okBox = [x0, x1, y0, y1].every(Number.isFinite);
  const auto = okBox ? { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY } : { x0: 0, x1: 1, y0: 0, y1: 1 };
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

  // Parse lines from rules
  const lines: LineRef[] = useMemo(() => {
    const list: LineRef[] = [];
    rules.forEach((r, ruleIdx) => {
      const kind = r.kind;
      if (kind === 'x' || kind === 'y') {
        const vals = parseRuleValues(r.value);
        vals.forEach((val, valIdx) => {
          list.push({ kind, val, ruleIdx, valIdx });
        });
      }
    });
    return list;
  }, [rules]);

  // Find nearest line to pointer
  const nearLine = (px: number, py: number): LineRef | null => {
    let best: LineRef | null = null;
    let minD = 6;
    for (const l of lines) {
      const d = l.kind === 'x' ? Math.abs(fx(l.val) - px) : Math.abs(fy(l.val) - py);
      if (d < minD) {
        minD = d;
        best = l;
      }
    }
    return best;
  };

  // Find nearest point on curve for Snap
  const snapVal = (px: number, py: number, kind: 'x' | 'y', altHeld: boolean): number => {
    const raw = kind === 'x' ? ix(px) : iy(py);
    if (snap === 'off' || altHeld) return raw;
    let bestVal = raw;
    let minD = 25 * 25; // 25px radius
    for (const c of g.curves) {
      const n = Math.min(c.x.length, c.y.length);
      for (let i = 0; i < n; i++) {
        const u = c.x[i];
        const v = c.y[i];
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
        const d = (fx(u) - px) ** 2 + (fy(v) - py) ** 2;
        if (d < minD) {
          minD = d;
          bestVal = kind === 'x' ? u : v;
        }
      }
    }
    return bestVal;
  };

  // Render to canvas
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

    // Frame clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, pw, ph);
    ctx.clip();

    // Draw grid
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    const tickX = niceStep(box.x1 - box.x0, Math.max(3, Math.round(pw / 80)));
    for (let v = Math.ceil(box.x0 / tickX) * tickX; v <= box.x1 + tickX * 1e-9; v += tickX) {
      const p = fx(v);
      ctx.beginPath();
      ctx.moveTo(p, M.t);
      ctx.lineTo(p, M.t + ph);
      ctx.stroke();
    }
    const tickY = niceStep(box.y1 - box.y0, Math.max(3, Math.round(ph / 50)));
    for (let v = Math.ceil(box.y0 / tickY) * tickY; v <= box.y1 + tickY * 1e-9; v += tickY) {
      const p = fy(v);
      ctx.beginPath();
      ctx.moveTo(M.l, p);
      ctx.lineTo(M.l + pw, p);
      ctx.stroke();
    }

    // Draw curves
    g.curves.forEach((curve, k) => {
      ctx.strokeStyle = colorOf(k);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let first = true;
      const n = Math.min(curve.x.length, curve.y.length);
      for (let i = 0; i < n; i++) {
        const u = curve.x[i];
        const v = curve.y[i];
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
          first = true;
          continue;
        }
        const px = fx(u);
        const py = fy(v);
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    });

    // Draw dotted lines for at X and at Y
    lines.forEach((l) => {
      const isDragged = drag?.kind === l.kind && drag.ruleIdx === l.ruleIdx && drag.valIdx === l.valIdx;
      const val = isDragged ? drag.val : l.val;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = isDragged ? '#ef4444' : '#2563eb';
      ctx.beginPath();
      if (l.kind === 'x') {
        const px = fx(val);
        ctx.moveTo(px, M.t);
        ctx.lineTo(px, M.t + ph);
      } else {
        const py = fy(val);
        ctx.moveTo(M.l, py);
        ctx.lineTo(M.l + pw, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw circles at picked points
    g.points.forEach((pt) => {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const px = fx(pt.x);
      const py = fy(pt.y);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();

    // Frame border and ticks
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);

    ctx.fillStyle = '#333333';
    ctx.font = '10px system-ui, sans-serif';

    // X numbers
    ctx.textAlign = 'center';
    for (let v = Math.ceil(box.x0 / tickX) * tickX; v <= box.x1 + tickX * 1e-9; v += tickX) {
      const p = fx(v);
      ctx.fillRect(p, M.t + ph - 4, 1, 4);
      ctx.fillText(fmtNum(Math.abs(v) < tickX * 1e-9 ? 0 : v, 4), p, M.t + ph + 12);
    }
    // Y numbers
    ctx.textAlign = 'right';
    for (let v = Math.ceil(box.y0 / tickY) * tickY; v <= box.y1 + tickY * 1e-9; v += tickY) {
      const p = fy(v);
      ctx.fillRect(M.l, p, 4, 1);
      ctx.fillText(fmtNum(Math.abs(v) < tickY * 1e-9 ? 0 : v, 4), M.l - 4, p + 3);
    }

    // Axis titles
    ctx.textAlign = 'center';
    ctx.fillText(g.xName || 'X', M.l + pw / 2, H - 3);
    ctx.save();
    ctx.translate(12, M.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(g.yName || 'Y', 0, 0);
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, box, g, lines, drag, pw, ph]);

  const at = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };

  const curves: ReadCurve[] = g.curves.map((c, k) => ({
    name: c.name,
    color: colorOf(k),
    x: Array.from(c.x),
    y: Array.from(c.y),
  }));

  return (
    <div className="reader-host nodrag nowheel" style={{ position: 'relative' }}>
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
          const nl = nearLine(qx, qy);
          if (nl) {
            setDrag({ kind: nl.kind, ruleIdx: nl.ruleIdx, valIdx: nl.valIdx, val: nl.val });
            return;
          }
          if (tool === 'addX') {
            const v = snapVal(qx, qy, 'x', e.altKey);
            onAddVal('x', v);
          } else if (tool === 'addY') {
            const v = snapVal(qx, qy, 'y', e.altKey);
            onAddVal('y', v);
          }
        }}
        onPointerMove={(e) => {
          const [qx, qy] = at(e);
          if (z.move(qx, qy)) return setCursor(zoom === 'pan' ? 'grab' : 'crosshair');
          if (drag) {
            const v = snapVal(qx, qy, drag.kind, e.altKey);
            setDrag({ ...drag, val: v });
            setCursor(drag.kind === 'x' ? 'ew-resize' : 'ns-resize');
            return;
          }
          const nl = nearLine(qx, qy);
          if (nl) {
            setCursor(nl.kind === 'x' ? 'ew-resize' : 'ns-resize');
          } else if (tool === 'addX' || tool === 'addY') {
            setCursor('copy');
          } else {
            setCursor('default');
          }
        }}
        onPointerUp={(e) => {
          const [qx, qy] = at(e);
          if (z.up(qx, qy)) return;
          if (drag) {
            onUpdateVal(drag.kind, drag.ruleIdx, drag.valIdx, drag.val);
            setDrag(null);
          }
        }}
        onDoubleClick={(e) => {
          const [qx, qy] = at(e);
          const nl = nearLine(qx, qy);
          if (nl) {
            onRemoveVal(nl.kind, nl.ruleIdx, nl.valIdx);
          }
        }}
        onContextMenu={(e) => {
          const [qx, qy] = at(e);
          const nl = nearLine(qx, qy);
          if (nl) {
            e.preventDefault();
            e.stopPropagation();
            onRemoveVal(nl.kind, nl.ruleIdx, nl.valIdx);
          }
        }}
        onWheel={(e) => z.wheel(...at(e), e.deltaY, e)}
      />
      {reader.r.on && <ReaderLayer reader={{ ...reader, curves }} W={W} H={H} map={{ fx, fy, ix, iy, frame: { l: M.l, t: M.t, w: pw, h: ph } }} />}
    </div>
  );
}

export function PickGraphView({
  g,
  rules,
  setRules,
}: {
  g: PickGraph;
  rules: PickRule[];
  setRules: (rules: PickRule[]) => void;
}) {
  const inPanel = useContext(InPanel);
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelW, setPanelW] = useState<number>(W0);

  useEffect(() => {
    if (!inPanel || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(([entry]) => {
      if (entry?.contentRect?.width) {
        setPanelW(Math.round(entry.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inPanel]);

  const curW = inPanel ? Math.max(260, panelW) : W0;

  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [snap, setSnap] = useState<PickSnap>('data');
  const [box, setBox] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const [tool, setTool] = useState<PickTool>('none');
  const [rd, setRd] = useState<ReaderState>(READER_OFF);

  useEffect(() => {
    if (tool === 'none') return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setTool('none');
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [tool]);

  const pickTool = (t: PickTool) => {
    setTool((now) => (now === t ? 'none' : t));
    setZoom('none');
    setRd((q) => ({ ...q, on: false }));
  };

  const onAddVal = (kind: 'x' | 'y', val: number) => {
    const formatted = fmtNum(val, 4);
    const existingIdx = rules.findIndex((r) => r.kind === kind);
    if (existingIdx >= 0) {
      const r = rules[existingIdx];
      const trimmed = r.value.trim();
      const updatedVal = trimmed ? `${trimmed}, ${formatted}` : formatted;
      setRules(rules.map((rule, idx) => (idx === existingIdx ? { ...rule, value: updatedVal } : rule)));
    } else {
      setRules([...rules, { kind, value: formatted, which: 'all' }]);
    }
  };

  const onUpdateVal = (_kind: 'x' | 'y', ruleIdx: number, valIdx: number, val: number) => {
    const r = rules[ruleIdx];
    if (!r) return;
    const parts = r.value.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    parts[valIdx] = fmtNum(val, 4);
    const updatedVal = parts.join(', ');
    setRules(rules.map((rule, idx) => (idx === ruleIdx ? { ...rule, value: updatedVal } : rule)));
  };

  const onRemoveVal = (_kind: 'x' | 'y', ruleIdx: number, valIdx: number) => {
    const r = rules[ruleIdx];
    if (!r) return;
    const parts = r.value.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    parts.splice(valIdx, 1);
    if (parts.length === 0) {
      setRules(rules.filter((_, idx) => idx !== ruleIdx));
    } else {
      const updatedVal = parts.join(', ');
      setRules(rules.map((rule, idx) => (idx === ruleIdx ? { ...rule, value: updatedVal } : rule)));
    }
  };

  const tools = (
    <>
      <div className="row wrap">
        <button
          className={`nodrag${tool === 'addX' ? ' on' : ''}`}
          title="Click on the graph to add a value at X. Esc: off"
          onClick={() => pickTool('addX')}
        >
          <Plus {...IC} /> X
        </button>
        <button
          className={`nodrag${tool === 'addY' ? ' on' : ''}`}
          title="Click on the graph to add a value at Y. Esc: off"
          onClick={() => pickTool('addY')}
        >
          <Plus {...IC} /> Y
        </button>
        <Select<PickSnap> seg
          value={snap}
          title="Where a line lands: on the nearest data point (data), or at the exact mouse location (off). Alt: off while held"
          options={[
            ['data', 'snap: data'],
            ['off', 'snap: off'],
          ]}
          onChange={setSnap}
        />
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
      <ReaderOptions r={rd} set={setRd} names={g.curves.map((c) => c.name)} />
    </>
  );

  const graph = (w: number, h: number) => (
    <Graph
      g={g}
      rules={rules}
      W={w}
      H={h}
      zoom={zoom}
      box={box}
      onView={setBox}
      zoomOut={out}
      tool={tool}
      snap={snap}
      onAddVal={onAddVal}
      onUpdateVal={onUpdateVal}
      onRemoveVal={onRemoveVal}
      reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }}
    />
  );

  return (
    <div ref={containerRef} style={{ width: '100%', minWidth: 0, marginTop: 4, marginBottom: 8 }}>
      {tools}
      {graph(curW, H0)}
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
    </div>
  );
}
