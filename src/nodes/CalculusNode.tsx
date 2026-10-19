// Differentiate / Integrate: the data of the run shown with its regions (reg1, reg2 … each its colour; drawn on the graph,
// as the ranges of a Fit) and its baseline, the derivative or the integral in a panel below on the same X; the options of
// each; the area of every region.
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { Baseline, DiffMethod, Pt, Region } from '../engine/calculus.ts';
import { fmtNum } from '../engine/table.ts';
import type { AppNode, CalculusData, CalculusNode } from '../types.ts';
import { Tabs } from './fields.tsx';
import { RunRangesTable } from './FitNode.tsx';
import { RegionPlot } from './RegionPlot.tsx';
import { regionColor } from './regionColors.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { rescaleAxis, type View, type ZoomMode } from './plotZoom.ts';
import { Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { BaselineFields } from './BaselineFields.tsx';

import { ChevronLeft, ChevronRight, CircleDot, Maximize2, MoveHorizontal, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ReaderButton, ReaderOptions } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

export function CalculusNodeView({ id, data }: NodeProps<CalculusNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<CalculusData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const info = r?.view.calc;
  const names = (r?.view.available ?? []).map((c) => c.name);
  const [shown, setShown] = useState(0);
  const [adding, setAdding] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  // a tool turns the others off
  const tool = (t: 'add' | 'points' | ZoomMode) => {
    setAdding(t === 'add' ? (v) => !v : false);
    setPlacing(t === 'points' ? (v) => !v : false);
    if (t === 'add' || t === 'points') setZoom('none');
  };
  const [big, setBig] = useState(false);
  const labels = info?.labels ?? [];
  const k = Math.min(Math.max(0, shown), Math.max(0, labels.length - 1));
  const label = labels[k] ?? '';
  const several = labels.length > 1;
  const isInt = data.op === 'int';
  // the regions: common, or of the run shown (a run without its own takes the common ones)
  const perRun = several && data.regionsBy === 'run';
  const own = perRun ? data.runRegions?.[label] : undefined;
  const regions = own?.length ? own : data.regions;
  const setRunRegions = (lab: string, rg: Region[] | undefined) => {
    const next = { ...data.runRegions };
    if (rg?.length) next[lab] = rg;
    else delete next[lab];
    set({ runRegions: next });
  };
  const setRegions = (rg: Region[]) => (perRun ? setRunRegions(label, rg) : set({ regions: rg }));
  // the baseline points: common, or of the run shown (with the regions' setting)
  const byPoints = isInt && data.baseline === 'points';
  const ownPts = perRun ? data.runBasePoints?.[label] : undefined;
  const points = ownPts?.length ? ownPts : (data.basePoints ?? []);
  const setPoints = (p: Pt[]) => {
    if (!perRun) return set({ basePoints: p });
    const next = { ...data.runBasePoints };
    if (p.length) next[label] = p;
    else delete next[label];
    set({ runBasePoints: next });
  };
  const areas = (info?.areas ?? []).filter((a) => a.run === label);
  const plot = (w: number, h: number) =>
    info && (
      <RegionPlot
        reader={{ r: rd, onRead: (reading) => setRd((q) => ({ ...q, reading })) }}
        x={info.x}
        y={info.y}
        run={info.run}
        used={info.used}
        shown={k}
        regions={regions}
        onRegions={setRegions}
        adding={adding}
        onAdded={() => setAdding(false)}
        points={byPoints ? points : undefined}
        onPoints={byPoints ? setPoints : undefined}
        placing={byPoints && placing}
        base={isInt && data.baseline !== 'zero' ? info.bases[k] : undefined}
        fills={isInt ? info.fills[k] : undefined}
        lower={info.lower[k]}
        lowerTitle={several ? `${isInt ? 'Integral' : 'Derivative'} of ${label}` : `${isInt ? 'Integral' : 'Derivative'}: ${info.resName}`}
        width={w}
        topH={Math.round(h * 0.58)}
        lowerH={Math.round(h * 0.42)}
        xTitle={info.xName || 'row'}
        yTitle={info.yNames.length > 1 ? label : info.yNames.join(', ')}
        zoom={zoom}
        view={view}
        onView={setView}
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
      <button
        className={`nodrag${adding ? ' on' : ''}`}
        title="Then drag on the graph: one range (only the points inside the ranges are used); the button turns off after it. The edges of a range can be dragged at any time"
        onClick={() => tool('add')}
      >
        <MoveHorizontal {...IC} /> Add a range
      </button>
      {byPoints && (
        <button
          className={`nodrag${placing ? ' on' : ''}`}
          title="While on: click on the graph to place a point of the baseline, drag a point to move it, double-click it to remove it"
          onClick={() => tool('points')}
        >
          <CircleDot {...IC} /> Baseline points
        </button>
      )}
      {(perRun ? !!own?.length : data.regions.length > 0) && (
        <button className="nodrag" title={perRun ? 'This run takes the common ranges again' : 'No ranges: all X'} onClick={() => (perRun ? setRunRegions(label, undefined) : set({ regions: [] }))}>
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
          onChange={(regionsBy) => set({ regionsBy })}
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
        onRescale={() => setView(null)}
        onRescaleAxis={(w) => setView((v) => rescaleAxis(v, w))}
        onZoomOut={() => setOut((n) => n + 1)}
        zoomed={!!view}
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
    <ReaderOptions r={rd} set={setRd} names={['data', 'baseline']} />
    </>
  );
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="A dataset (X and the Y columns from the designations, or chosen below), e.g. the data of a Plot curve" />
      {isInt && (
        <InPort label="baseline" port="dataset" id="base" title="Optional: a curve to integrate above (Baseline ▸ another curve ▸ the baseline input): a dataset (its first X, Y) or a column (on the X of the data)">
          <span className="muted ellipsis">{data.baseline === 'curve' && data.baseFrom === 'port' ? 'the baseline curve' : 'optional: Baseline ▸ another curve'}</span>
        </InPort>
      )}
      <NodeOptions>
      <Tabs
        tabs={[
          ['diff', 'Differentiate'],
          ['int', 'Integrate'],
        ]}
        value={data.op}
        onChange={(op) => set({ op })}
      />
      {names.length > 0 && (
        <div className="grid2">
          <Field label="X">
            <Select value={data.x || '-auto'} options={[['-auto', xAutoLabel(r?.view.available)], ['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x: x === '-auto' ? '' : x })} />
          </Field>
          <Field label="Y" title="The columns: 2, B-D (letters), names, A* (a pattern); empty: the Y columns (their designation) — each gets its own result">
            <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} onChange={(ys) => set({ ys })} />
          </Field>
        </div>
      )}
      {!isInt ? (
        <div className="grid2">
          <Field label="Order">
            <Select<1 | 2>
              value={data.order}
              options={[
                [1, '1st (dy/dx)'],
                [2, '2nd (d²y/dx²)'],
              ]}
              onChange={(order) => set({ order })}
            />
          </Field>
          <Field label="Method" title="Central: the mean of the slopes to the two neighbours (one slope at the ends). Savitzky–Golay: a polynomial fitted over a window of points around each one — smooths noisy data">
            <Select<DiffMethod>
              value={data.method}
              options={[
                ['central', 'central'],
                ['sg', 'Savitzky–Golay'],
              ]}
              onChange={(method) => set({ method })}
            />
          </Field>
          {data.method === 'sg' && (
            <>
              <Field label="Window" title="Points in the window (odd; more: smoother)">
                <NumInput className="tiny" min={3} step={2} value={data.window} onChange={(window) => Number.isFinite(window) && set({ window })} />
              </Field>
              <Field label="Degree" title="The degree of the polynomial (at least the order of the derivative)">
                <NumInput className="tiny" min={1} max={6} step={1} value={data.poly} onChange={(poly) => Number.isFinite(poly) && set({ poly })} />
              </Field>
            </>
          )}
        </div>
      ) : (
        <div className="grid2">
          <Field label="Area" title="Mathematical: with its sign (below the baseline counts negative); absolute: every part positive">
            <Select
              value={data.area}
              options={[
                ['signed', 'mathematical (signed)'],
                ['abs', 'absolute'],
              ]}
              onChange={(area) => set({ area })}
            />
          </Field>
          <BaselineFields
            layout="grid"
            title="Integrated above it, in every range (found on the points of the range)"
            method={data.baseline}
            onMethod={(baseline) => set({ baseline: baseline as Baseline })}
            opts={data.baseOpt}
            onOpts={(baseOpt) => set({ baseOpt })}
            value={data.base}
            onValue={(base) => set({ base })}
            interp={data.baseInterp}
            onInterp={(baseInterp) => set({ baseInterp })}
            ends={1}
            curve={
              <>
                <Select
                  value={data.baseFrom === 'port' ? 'port' : 'column'}
                  title="Another column of the data (with its own X when it has one — e.g. the return of a scan cut by Split into columns ▸ where X changes direction: the area between the two), or the curve connected to the “baseline” port"
                  options={[
                    ['column', 'a column'],
                    ['port', 'the baseline input'],
                  ]}
                  onChange={(baseFrom) => set({ baseFrom })}
                />
                {data.baseFrom !== 'port' && <Select value={data.baseColumn ?? ''} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(baseColumn) => set({ baseColumn })} />}
              </>
            }
          />
          <Field label="Ranges" title="Separate: the integral starts from 0 in every range; combined: it goes on from one range to the next (the gaps left out)">
            <Select
              value={data.join}
              options={[
                ['separate', 'separate'],
                ['combined', 'combined'],
              ]}
              onChange={(join) => set({ join })}
            />
          </Field>
        </div>
      )}
      </NodeOptions>
      {info && (
        <>
          {runBar}
          {tools}
          {plot(520, 430)}
          <NodeOptions>
          {byPoints && points.length > 0 && (
            <div className="row wrap fit-ranges">
              <span className="muted">
                Baseline: {points.length} point{points.length > 1 ? 's' : ''}
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
                  <button className="nodrag ts-btn" onClick={() => (perRun && !own?.length ? set({ regions: data.regions.filter((_, i) => i !== j) }) : setRegions(regions.filter((_, i) => i !== j)))}>
                    <X {...IC} />
                  </button>
                </span>
              ))}
              {perRun && !!own?.length && (
                <button className="nodrag" title="These ranges for every run" onClick={() => set({ runRegions: Object.fromEntries(labels.map((lab) => [lab, own.map((q) => ({ ...q }))])) })}>
                  Copy to all runs
                </button>
              )}
            </div>
          )}
          {perRun && <RunRangesTable labels={labels} common={data.regions} own={data.runRegions ?? {}} onChange={setRunRegions} onShow={setShown} shown={k} />}
          </NodeOptions>
          {isInt && areas.length > 0 && (
            <div className="calc-areas">
              {areas.map((a, j) => (
                <span key={j}>
                  {a.index >= 0 ? <b style={{ color: regionColor(a.index) }}>{a.region}</b> : 'area'} <b>{fmtNum(a.area, 6)}</b>
                </span>
              ))}
              {areas.length > 1 && (
                <span>
                  total <b>{fmtNum(areas.reduce((s, a) => s + a.area, 0), 6)}</b>
                </span>
              )}
            </div>
          )}
        </>
      )}
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" title={`X, every Y followed by its ${isInt ? 'integral' : 'derivative'} (empty outside the ranges)`} />
      {isInt && <OutPort label="areas" port="dataset" id="areas" title="A row per range (and run): from, to, area" />}
      {isInt && <OutPort label="baseline" port="dataset" id="base" title="X and the baseline of every run (as drawn on the graph)" />}
      {isInt && <OutPort label="area" port="scalar" id="area" title="The total area of the ranges of the first run (one value)" />}
      {big &&
        info &&
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
    </div>
  );
}
