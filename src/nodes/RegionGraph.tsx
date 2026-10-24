// The graph of a signal node with ranges (as Differentiate / Integrate): the run shown (← → and its list), the tools —
// Add a range (dragged on the graph; its edges dragged later), the points of a baseline (placed, moved, removed with the
// mouse) when the node has them, the same ranges for every run or ranges per run, Zoom, Pan, Out, Rescale, the data
// reader, Large — the two panels (the data with what is drawn over it; the result below on the same X), the ranges as
// chips and, per run, their table.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Pt, Region } from '../engine/calculus.ts';
import { pointsOf, type RegionSpec, type RegionView } from '../engine/regionruns.ts';
import { fmtNum } from '../engine/table.ts';
import { RunRangesTable } from './FitNode.tsx';
import { RegionPlot } from './RegionPlot.tsx';
import { regionColor } from './regionColors.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { rescaleAxis, type View, type ZoomMode } from './plotZoom.ts';
import { Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ChevronLeft, ChevronRight, CircleDot, Maximize2, MoveHorizontal, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ReaderButton, ReaderOptions } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

export type RegionData = RegionSpec & { basePoints?: Pt[]; runBasePoints?: Record<string, Pt[]> };

export function RegionGraph<T extends RegionData>({ data, set, view, points = false, rangeHint, height = 430 }: { data: T; set: (p: Partial<T>) => void; view: RegionView; points?: boolean; rangeHint?: string; height?: number }) {
  const [shown, setShown] = useState(0);
  const [adding, setAdding] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const [vw, setVw] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const labels = view.labels;
  const k = Math.min(Math.max(0, shown), Math.max(0, labels.length - 1));
  const label = labels[k] ?? '';
  const several = labels.length > 1;
  const perRun = several && data.regionsBy === 'run';
  const own = perRun ? data.runRegions?.[label] : undefined;
  const regions = own?.length ? own : data.regions;
  const setRunRegions = (lab: string, rg: Region[] | undefined) => {
    const next = { ...data.runRegions };
    if (rg?.length) next[lab] = rg;
    else delete next[lab];
    set({ runRegions: next } as Partial<T>);
  };
  const setRegions = (rg: Region[]) => (perRun ? setRunRegions(label, rg) : set({ regions: rg } as Partial<T>));
  const ownPts = perRun ? data.runBasePoints?.[label] : undefined;
  const pts = pointsOf(data, label);
  const setPoints = (p: Pt[]) => {
    if (!perRun) return set({ basePoints: p } as Partial<T>);
    const next = { ...data.runBasePoints };
    if (p.length) next[label] = p;
    else delete next[label];
    set({ runBasePoints: next } as Partial<T>);
  };
  // a tool turns the others off
  const tool = (t: 'add' | 'points') => {
    setAdding(t === 'add' ? (v) => !v : false);
    setPlacing(t === 'points' ? (v) => !v : false);
    setZoom('none');
  };
  const plot = (w: number, h: number) => (
    <RegionPlot
      reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }}
      x={view.x}
      y={view.y}
      run={view.run}
      used={view.used}
      shown={k}
      regions={regions}
      onRegions={setRegions}
      adding={adding}
      onAdded={() => setAdding(false)}
      points={points ? pts : undefined}
      onPoints={points ? setPoints : undefined}
      placing={points && placing}
      base={view.base[k] ?? undefined}
      baseName={view.baseName}
      baseColor={view.baseColor}
      lower={view.lower[k] ?? undefined}
      lowerMore={view.lowerMore?.[k]}
      lowerBand={view.lowerBand?.[k] ?? undefined}
      marks={view.marks?.[k]}
      segments={view.segments?.[k]}
      lowerTitle={several ? `${view.lowerTitle} of ${label}` : view.lowerTitle}
      width={w}
      topH={view.lower.some(Boolean) ? Math.round(h * 0.58) : h}
      lowerH={view.lower.some(Boolean) ? Math.round(h * 0.42) : 0}
      xTitle={view.xName || 'row'}
      yTitle={view.yNames.length > 1 ? label : view.yNames.join(', ')}
      zoom={zoom}
      view={vw}
      onView={setVw}
      zoomOut={out}
    />
  );
  const runBar = several && (
    <div className="row fit-runs">
      <button className="nodrag ts-btn" disabled={k === 0} onClick={() => setShown(k - 1)}>
        <ChevronLeft {...IC} />
      </button>
      <select className="nodrag grow" value={k} onChange={(e) => setShown(Number(e.target.value))}>
        {labels.map((lab, j) => (
          <option key={j} value={j}>
            {j + 1}. {lab}
          </option>
        ))}
      </select>
      <button className="nodrag ts-btn" disabled={k >= labels.length - 1} onClick={() => setShown(k + 1)}>
        <ChevronRight {...IC} />
      </button>
    </div>
  );
  const tools = (
    <>
      <div className="row wrap">
        <button className={`nodrag${adding ? ' on' : ''}`} title={rangeHint ?? 'Then drag on the graph: one range (only the points inside the ranges are used); the button turns off after it. The edges of a range can be dragged at any time'} onClick={() => tool('add')}>
          <MoveHorizontal {...IC} /> Add a range
        </button>
        {points && (
          <button className={`nodrag${placing ? ' on' : ''}`} title="While on: click on the graph to place a point of the baseline, drag a point to move it, double-click it to remove it" onClick={() => tool('points')}>
            <CircleDot {...IC} /> Baseline points
          </button>
        )}
        {(perRun ? !!own?.length : data.regions.length > 0) && (
          <button className="nodrag" title={perRun ? 'This run takes the common ranges again' : 'No ranges: all X'} onClick={() => (perRun ? setRunRegions(label, undefined) : set({ regions: [] } as unknown as Partial<T>))}>
            {perRun ? 'Common ranges' : 'All X'}
          </button>
        )}
        {several && (
          <Select
            value={data.regionsBy ?? 'all'}
            title="The same ranges for every run, or ranges of its own for each run (dragged on the graph of the run shown, or typed in the table below; a run without its own takes the common ones)"
            options={[
              ['all', 'same ranges, all runs'],
              ['run', 'ranges per run'],
            ]}
            onChange={(regionsBy) => set({ regionsBy } as Partial<T>)}
          />
        )}
        <span className="grow" />
        <ZoomTools
          mode={zoom}
          setMode={(m) => {
            setZoom(m);
            if (m !== 'none') {
              setAdding(false);
              setPlacing(false);
              setRd((q) => ({ ...q, on: false }));
            }
          }}
          onRescale={() => setVw(null)}
          onRescaleAxis={(w) => setVw((v) => rescaleAxis(v, w))}
          onZoomOut={() => setOut((n) => n + 1)}
          zoomed={!!vw}
        />
        <ReaderButton
          r={rd}
          set={setRd}
          onOn={() => {
            setZoom('none');
            setAdding(false);
            setPlacing(false);
          }}
        />
        <button className="nodrag" title="The graph large" onClick={() => setBig(true)}>
          <Maximize2 {...IC} /> Large
        </button>
      </div>
      <ReaderOptions r={rd} set={setRd} names={['data', view.baseName ?? 'baseline']} />
    </>
  );
  const notes = view.notes?.[k] ?? [];
  return (
    <>
      {runBar}
      {tools}
      {plot(520, height)}
      {notes.length > 0 && (
        <div className="calc-areas">
          {notes.map((t, j) => (
            <span key={j}>{t}</span>
          ))}
        </div>
      )}
      <NodeOptions>
        {points && pts.length > 0 && (
          <div className="row wrap fit-ranges">
            <span className="muted">
              Baseline: {pts.length} point{pts.length > 1 ? 's' : ''}
              {perRun ? (ownPts?.length ? ` of “${label}”` : ' (common)') : ''}
            </span>
            <button className="nodrag" onClick={() => setPoints([])}>
              Clear points
            </button>
          </div>
        )}
        {regions.length > 0 && (
          <div className="row wrap fit-ranges">
            <span className="muted">{perRun ? (own?.length ? `Ranges of “${label}”:` : 'Common ranges:') : 'Ranges:'}</span>
            {regions.map((rg, j) => (
              <span key={j} className="chip region-chip" style={{ borderColor: regionColor(j) }}>
                <b style={{ color: regionColor(j) }}>{j + 1})</b> {Number.isFinite(rg.lo) ? fmtNum(rg.lo, 5) : '…'} – {Number.isFinite(rg.hi) ? fmtNum(rg.hi, 5) : '…'}
                <button className="nodrag ts-btn" onClick={() => (perRun && !own?.length ? set({ regions: data.regions.filter((_, i) => i !== j) } as unknown as Partial<T>) : setRegions(regions.filter((_, i) => i !== j)))}>
                  <X {...IC} />
                </button>
              </span>
            ))}
            {perRun && !!own?.length && (
              <button className="nodrag" title="These ranges for every run" onClick={() => set({ runRegions: Object.fromEntries(labels.map((lab) => [lab, own.map((q) => ({ ...q }))])) } as Partial<T>)}>
                Copy to all runs
              </button>
            )}
          </div>
        )}
        {perRun && <RunRangesTable labels={labels} common={data.regions} own={data.runRegions ?? {}} onChange={setRunRegions} onShow={setShown} shown={k} />}
      </NodeOptions>
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big">
              {runBar}
              {tools}
              {plot(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(360, Math.min((window.innerHeight || 800) * 0.74, 820)))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
