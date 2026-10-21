// Translate & resize (curves resized and moved on X / Y, columns designated here; a graph in the node where they are
// moved and resized with the mouse). Curve math: CurveMathNode.tsx.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { Maximize2, Move, Scaling, Undo2, X } from 'lucide-react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import type { AxisScale, TranslateData } from '../engine/curvemath.ts';
import { ROLE_LABELS, type ColumnRole } from '../engine/table.ts';
import type { AppNode, TranslateNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { InPort, Messages, OutPort, Select, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { maxOf } from '../engine/minmax.ts';
import { IC } from './iconProps.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { viewBox, type View } from './plotZoom.ts';
import { TranslateGraph, type GraphTool, type MoveDrag, type ResizeDrag } from './TranslateGraph.tsx';
import { AutoNumber, Choice, NumField, NumPair, Row, Section, Sections, SliderField, Toggle } from '../ui/props.tsx';

const ROLES: [ColumnRole, string][] = (['x', 'y', 'yerr', 'xerr', 'none'] as ColumnRole[]).map((k) => [k, ROLE_LABELS[k]]);
const W0 = 520;
const H0 = 240;
const NONE: AxisScale = { mode: 'none' };

// keys pressed in the panel are its own
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};

// The resize of one axis: its kind, then what it needs.
function ScaleRows({ s, set, axis }: { s: AxisScale; set: (s: AxisScale) => void; axis: 'X' | 'Y' }) {
  const put = (p: Partial<AxisScale>) => set({ ...s, ...p });
  const from = s.from ?? [NaN, NaN];
  const to = s.to ?? [NaN, NaN];
  const pts = s.pts ?? [NaN, NaN, NaN, NaN];
  return (
    <>
      <Row label="Resize" hint="None; by a factor about a point that stays; a range brought to another; two values brought to two others (a calibration)">
        <Choice<AxisScale['mode']>
          value={s.mode}
          onChange={(mode) => put({ mode })}
          options={[
            ['none', 'None'],
            ['factor', 'Factor'],
            ['range', 'Range'],
            ['points', '2 points', 'Two values brought to two others (a calibration)'],
          ]}
        />
      </Row>
      {s.mode === 'factor' && (
        <>
          <Row label="Factor" hint={`${axis} multiplied by it (below 1: shrunk, above: stretched; − : turned over); also: the Resize tool on the graph`}>
            <SliderField value={s.k ?? 1} onChange={(k) => put({ k: Number.isFinite(k) && k !== 0 ? k : 1 })} min={0.1} max={5} step={0.01} unit="×" marks={[1]} />
          </Row>
          <Row label="About" hint={`The value of ${axis} that stays where it is`}>
            <Choice<NonNullable<AxisScale['anchor']>>
              value={s.anchor ?? 'center'}
              onChange={(anchor) => put({ anchor })}
              options={[
                ['zero', '0'],
                ['first', 'First', 'The first point'],
                ['center', 'Middle', 'The middle of the data'],
                ['peak', 'Peak', 'The maximum of the curve'],
                ['value', 'Value'],
              ]}
            />
            {s.anchor === 'value' && <NumField value={s.at ?? NaN} placeholder="0" onChange={(at) => put({ at })} />}
          </Row>
        </>
      )}
      {s.mode === 'range' && (
        <>
          <Row label="From" hint="The range to resize (empty: the data's, each curve its own)">
            <NumPair a={from[0]} b={from[1]} names={['lo', 'hi']} onA={(v) => put({ from: [v, from[1]] })} onB={(v) => put({ from: [from[0], v] })} />
          </Row>
          <Row label="To" hint="Where it goes (empty: as it was)">
            <NumPair a={to[0]} b={to[1]} names={['lo', 'hi']} onA={(v) => put({ to: [v, to[1]] })} onB={(v) => put({ to: [to[0], v] })} />
          </Row>
        </>
      )}
      {s.mode === 'points' && (
        <>
          <Row label="First" hint="A value and where it goes (e.g. a peak at 532.4 that should be at 532)">
            <NumPair a={pts[0]} b={pts[2]} names={['is', 'to']} onA={(v) => put({ pts: [v, pts[1], pts[2], pts[3]] })} onB={(v) => put({ pts: [pts[0], pts[1], v, pts[3]] })} />
          </Row>
          <Row label="Second" hint="Another value and where it goes">
            <NumPair a={pts[1]} b={pts[3]} names={['is', 'to']} onA={(v) => put({ pts: [pts[0], v, pts[2], pts[3]] })} onB={(v) => put({ pts: [pts[0], pts[1], pts[2], v] })} />
          </Row>
        </>
      )}
    </>
  );
}

export function TranslateNodeView({ id, data }: NodeProps<TranslateNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<TranslateData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const tv = r?.view.translate;
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  const out = r?.outputs.out;
  const setOwn = (y: string, p: Partial<{ dx: number; dy: number }>) => set({ own: { ...data.own, [y]: { dx: data.own[y]?.dx ?? data.dx, dy: data.own[y]?.dy ?? data.dy, ...p } } });
  const sx = data.sx ?? NONE;
  const sy = data.sy ?? NONE;
  const ghost = data.ghost !== false;
  // the graph: its tool, its limits (kept with the node), shown large
  const [tool, setTool] = useState<GraphTool>('none');
  const [out2, setOut2] = useState(0);
  const [big, setBig] = useState(false);
  const view: View | null = data.plotView ?? null;
  const setView = (v: View | null) => set({ plotView: v ?? undefined });
  // a drag with the mouse: the settings when it started (each step of it from there)
  const base = useRef<TranslateData | null>(null);
  const start = () => (base.current ??= data);
  const n = tv?.curves.length ?? 1;
  const onMove = (m: MoveDrag) => {
    const b = start();
    // the sum without the tails of floating point (0.1 + 0.2)
    const add = (a: number, d: number) => +(a + d).toPrecision(12);
    if (b.mode === 'point') set({ x0: add(b.x0, m.dx), y0: add(b.y0, m.dy), moveX: b.moveX || Math.abs(m.dx) > 0, moveY: b.moveY || Math.abs(m.dy) > 0 });
    else if (b.mode === 'stagger') set({ dx: add(b.dx, m.dx / Math.max(1, n - 1)), dy: add(b.dy, m.dy / Math.max(1, n - 1)) });
    else if (m.curve) {
      const o = b.own[m.curve] ?? { dx: b.dx, dy: b.dy };
      set({ own: { ...b.own, [m.curve]: { dx: add(o.dx, m.dx), dy: add(o.dy, m.dy) } } });
    } else set({ dx: add(b.dx, m.dx), dy: add(b.dy, m.dy) });
    if (m.done) base.current = null;
  };
  const onResize = (z: ResizeDrag) => {
    const b = start();
    // a factor of its own (the kind of resize set to Factor) on the axis moved; the other as it was
    const by = (s: AxisScale | undefined, k: number): AxisScale | undefined => {
      if (Math.abs(k - 1) < 1e-6) return s;
      const cur = s?.mode === 'factor' ? s : { mode: 'factor' as const, anchor: 'center' as const };
      const next = (cur.k ?? 1) * k;
      return { ...cur, mode: 'factor', k: +next.toPrecision(5) };
    };
    set({ sx: by(b.sx, z.kx), sy: by(b.sy, z.ky) });
    if (z.done) base.current = null;
  };
  // Reset X / Y: that axis as it came in (no resize, no move of the kind of move chosen)
  const changed = (w: 'x' | 'y') => {
    const d = w === 'x' ? 'dx' : 'dy';
    if ((w === 'x' ? sx : sy).mode !== 'none') return true;
    if (data.mode === 'point') return w === 'x' ? data.moveX : data.moveY;
    return data[d] !== 0 || (data.mode === 'value' && Object.values(data.own).some((o) => o[d] !== 0));
  };
  const reset = (w: 'x' | 'y') => {
    const d = w === 'x' ? 'dx' : 'dy';
    const own = data.mode === 'value' ? Object.fromEntries(Object.entries(data.own).map(([k, o]) => [k, { ...o, [d]: 0 }])) : data.own;
    if (data.mode === 'point') set(w === 'x' ? { sx: undefined, moveX: false } : { sy: undefined, moveY: false });
    else set(w === 'x' ? { sx: undefined, dx: 0, own } : { sy: undefined, dy: 0, own });
  };
  // Rescale X / Y: that axis fitted to the curves as they come out (the other as it is)
  const fit = (w: 'x' | 'y') => {
    let [a, b] = [Infinity, -Infinity];
    for (const c of tv?.plots ?? [])
      c.x.forEach((v, i) => {
        const u = w === 'x' ? v : c.y[i];
        if (Number.isFinite(v) && Number.isFinite(c.y[i])) [a, b] = [Math.min(a, u), Math.max(b, u)];
      });
    if (!Number.isFinite(a)) return;
    if (a === b) [a, b] = [a - 1, b + 1];
    const m = (b - a) * (w === 'x' ? 0.03 : 0.07);
    const v = view ?? { x0: NaN, x1: NaN, y0: NaN, y1: NaN };
    setView(w === 'x' ? { ...v, x0: a - m, x1: b + m } : { ...v, y0: a - m, y1: b + m });
  };
  const tools = (
    <div className="row wrap translate-tools">
      <span className="tb-group">
        <Tooltip label="Move the curves with the mouse (Alt: only the curve under it; Shift: along one axis)">
          <button className={`nodrag${tool === 'move' ? ' active' : ''}`} onClick={() => setTool(tool === 'move' ? 'none' : 'move')}>
            <Move {...IC} /> Move
          </button>
        </Tooltip>
        <Tooltip label="Resize the curves with the mouse: drag across for X, up or down for Y (Shift: one axis); the wheel: X, Shift + wheel: Y">
          <button className={`nodrag${tool === 'resize' ? ' active' : ''}`} onClick={() => setTool(tool === 'resize' ? 'none' : 'resize')}>
            <Scaling {...IC} /> Resize
          </button>
        </Tooltip>
      </span>
      <span className="tb-group">
        {(['x', 'y'] as const).map((w) => (
          <Tooltip key={w} label={`${w.toUpperCase()} as it came in: no resize and no move on ${w.toUpperCase()}`}>
            <button className="nodrag" disabled={!changed(w)} onClick={() => reset(w)}>
              <Undo2 {...IC} /> Reset {w.toUpperCase()}
            </button>
          </Tooltip>
        ))}
      </span>
      <span className="grow" />
      <ZoomTools mode={tool === 'zoom' || tool === 'pan' ? tool : 'none'} setMode={(m) => setTool(m)} onRescale={() => setView(null)} onRescaleAxis={fit} onZoomOut={() => setOut2((k) => k + 1)} zoomed={!!view} fitNew />
      <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
        <Maximize2 {...IC} /> Large
      </button>
    </div>
  );
  const graph = (w: number, h: number) => tv?.plots && <TranslateGraph curves={tv.plots} xName={tv.xName ?? ''} W={w} H={h} ghost={ghost} view={view} onView={setView} zoomOut={out2} tool={tool} onMove={onMove} onResize={onResize} />;
  // the limits the graph shows by itself (for the fields of its limits)
  const autoBox = (() => {
    if (!tv?.plots) return null;
    let [a, b, c, d] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const cv of tv.plots)
      for (const [xs, ys] of ghost ? [[cv.x, cv.y], [cv.ox, cv.oy]] : [[cv.x, cv.y]])
        xs.forEach((v, i) => {
          if (Number.isFinite(v) && Number.isFinite(ys[i])) [a, b, c, d] = [Math.min(a, v), Math.max(b, v), Math.min(c, ys[i]), Math.max(d, ys[i])];
        });
    return Number.isFinite(a) ? viewBox(view, { x0: a, x1: b, y0: c, y1: d }) : null;
  })();
  const lim = (k: keyof View) => (v: number) => setView({ ...(view ?? { x0: NaN, x1: NaN, y0: NaN, y1: NaN }), [k]: v });
  return (
    <div className="node node-translate">
      <InPort label="dataset" port="dataset" id="data" title="Optional: a dataset (its designations, changed below if you wish)" />
      {Array.from({ length: count }, (_, k) => (
        <InPort key={k} label={columnLetter(k)} port="column" id={`in-${k}`} title="Optional: a column — designate it below (X, Y, ±Y …)">
          <span className="muted ellipsis">{tv?.cols.filter((c) => c.from === 'port')[k]?.name ?? 'connect a column'}</span>
        </InPort>
      ))}
      {tv?.plots && tools}
      {graph(W0, H0)}
      {big &&
        tv?.plots &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {tools}
              {graph(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(320, Math.min((window.innerHeight || 800) * 0.7, 760)))}
            </div>
          </div>,
          document.body,
        )}
      <NodeOptions>
        <div className="props-panel props-embed nodrag" onKeyDown={ownKeys}>
          <Sections panel="translate" open={['move', 'sx', 'sy']}>
            {tv && tv.cols.length > 0 && (
              <Section value="cols" title="Columns and designations" aside={`${tv.curves.length} curve${tv.curves.length === 1 ? '' : 's'}`}>
                <div className="translate-roles legacy-fields">
                  {tv.cols.map((c) => (
                    <label key={c.name} className="row">
                      <span className="ellipsis grow" title={c.name}>
                        {c.name}
                      </span>
                      <Select
                        value={c.role}
                        options={ROLES}
                        title="Every Y goes with the X on its left; ±Y / ±X with the Y on their left (resized with it, not moved)"
                        onChange={(role) => {
                          const roles = { ...data.roles };
                          roles[c.name] = role;
                          set({ roles });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </Section>
            )}
            <Section value="move" title="Move" aside={data.mode === 'point' ? 'a point to a place' : data.mode === 'stagger' ? 'in steps' : 'by values'}>
              <Row label="Move" hint="By values (for all, or each curve its own); a point of every curve to a place; in steps (curve k by k·Δ: a waterfall). Also: the Move tool on the graph">
                <Choice<TranslateData['mode']>
                  value={data.mode}
                  onChange={(mode) => set({ mode })}
                  options={[
                    ['value', 'By values'],
                    ['point', 'Point', 'A point of every curve to a place'],
                    ['stagger', 'In steps', 'Curve k moved by k·Δ (a waterfall)'],
                  ]}
                />
              </Row>
              {data.mode === 'point' ? (
                <>
                  <Row label="Point">
                    <Choice<TranslateData['point']>
                      value={data.point}
                      onChange={(point) => set({ point })}
                      options={[
                        ['max', 'Max'],
                        ['min', 'Min'],
                        ['first', 'First'],
                        ['last', 'Last'],
                        ['atx', 'At X', 'The value at an X'],
                      ]}
                    />
                    {data.point === 'atx' && <NumField value={data.atx} prefix="x" onChange={(atx) => set({ atx })} />}
                  </Row>
                  <Row label="To X₀" hint="Its X brought here">
                    <Toggle value={data.moveX} onChange={(moveX) => set({ moveX })} />
                    {data.moveX && <NumField value={data.x0} onChange={(x0) => set({ x0 })} />}
                  </Row>
                  <Row label="To Y₀" hint="Its Y brought here">
                    <Toggle value={data.moveY} onChange={(moveY) => set({ moveY })} />
                    {data.moveY && <NumField value={data.y0} onChange={(y0) => set({ y0 })} />}
                  </Row>
                </>
              ) : (
                <>
                  <Row label={data.mode === 'stagger' ? 'ΔX per curve' : 'ΔX'}>
                    <NumField value={data.dx} onChange={(dx) => set({ dx })} />
                  </Row>
                  <Row label={data.mode === 'stagger' ? 'ΔY per curve' : 'ΔY'}>
                    <NumField value={data.dy} onChange={(dy) => set({ dy })} />
                  </Row>
                </>
              )}
              {data.mode === 'value' && (tv?.curves.length ?? 0) > 1 && (
                <div className="prop-sub">
                  <div className="prop-note">Each curve its own shift (else the common one; also: Alt + drag on the graph)</div>
                  {tv!.curves.map((y) => (
                    <Row key={y} label={y}>
                      <div className="translate-own">
                        <NumPair a={data.own[y]?.dx ?? data.dx} b={data.own[y]?.dy ?? data.dy} names={['Δx', 'Δy']} onA={(dx) => setOwn(y, { dx })} onB={(dy) => setOwn(y, { dy })} />
                        {data.own[y] && (
                          <Tooltip label="The common shift again">
                            <ActionIcon
                              variant="subtle"
                              aria-label="The common shift again"
                              onClick={() => {
                                const own = { ...data.own };
                                delete own[y];
                                set({ own });
                              }}
                            >
                              <X size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </div>
                    </Row>
                  ))}
                </div>
              )}
            </Section>
            <Section value="sx" title="Resize X" aside={sx.mode === 'none' ? 'none' : sx.mode === 'factor' ? `× ${sx.k ?? 1}` : sx.mode}>
              <ScaleRows s={sx} set={(s) => set({ sx: s.mode === 'none' && !s.k && !s.from && !s.pts ? undefined : s })} axis="X" />
            </Section>
            <Section value="sy" title="Resize Y" aside={sy.mode === 'none' ? 'none' : sy.mode === 'factor' ? `× ${sy.k ?? 1}` : sy.mode}>
              <ScaleRows s={sy} set={(s) => set({ sy: s.mode === 'none' && !s.k && !s.from && !s.pts ? undefined : s })} axis="Y" />
            </Section>
            <Section value="graph" title="Graph" aside={view ? 'limits set' : 'automatic'}>
              <Row label="Before" hint="The curves as they came in: a thin grey line under the others">
                <Toggle value={ghost} onChange={(g) => set({ ghost: g ? undefined : false })} label="show the curves as they were" />
              </Row>
              <Row label="X from" hint="The graph's limits (empty: as the data): wider, to move the curves further">
                <AutoNumber value={view?.x0 ?? NaN} auto={autoBox?.x0} onChange={lim('x0')} />
              </Row>
              <Row label="X to">
                <AutoNumber value={view?.x1 ?? NaN} auto={autoBox?.x1} onChange={lim('x1')} />
              </Row>
              <Row label="Y from">
                <AutoNumber value={view?.y0 ?? NaN} auto={autoBox?.y0} onChange={lim('y0')} />
              </Row>
              <Row label="Y to">
                <AutoNumber value={view?.y1 ?? NaN} auto={autoBox?.y1} onChange={lim('y1')} />
              </Row>
            </Section>
          </Sections>
          {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={4} />}
        </div>
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" id="out" title="The curves resized and moved (the errors resized with them)" />
      <OutPort label="shifts" port="dataset" id="shifts" title="Every curve: ΔX, ΔY, and its whole change (X = factor · x + offset, the same for Y)" />
    </div>
  );
}
