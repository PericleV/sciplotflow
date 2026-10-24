// Peak width: the data of the run shown with its regions (reg1, reg2 … drawn on the graph, as in Integrate), the
// baseline of every region, the extremum marked and its width at half height; peak / dip / auto, the baseline; the
// results of the run (place, value, height, FWHM, Q, min, max).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { Pt, Region } from '../engine/calculus.ts';
import type { Baseline, WidthKind } from '../engine/measure.ts';
import { fmtNum } from '../engine/table.ts';
import type { AppNode, PeakWidthData, PeakWidthNode } from '../types.ts';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { RunRangesTable } from './FitNode.tsx';
import { rescaleAxis, type View, type ZoomMode } from './plotZoom.ts';
import { RegionPlot } from './RegionPlot.tsx';
import { regionColor } from './regionColors.ts';
import { Field, InPort, Messages, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { ZoomTools } from './ZoomTools.tsx';
import { BaselineFields } from './BaselineFields.tsx';
import { ChevronLeft, ChevronRight, CircleDot, Maximize2, MoveHorizontal, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ReaderButton, ReaderOptions } from './CanvasReader.tsx';
import { READER_OFF, type ReaderState } from './readerState.ts';

const f = (v: number) => (Number.isFinite(v) ? fmtNum(v, 5) : '—');

export function PeakWidthNodeView({ id, data }: NodeProps<PeakWidthNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<PeakWidthData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const info = r?.view.widths;
  const names = (r?.view.available ?? []).map((c) => c.name);
  const [shown, setShown] = useState(0);
  const [adding, setAdding] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('none');
  const [rd, setRd] = useState<ReaderState>(READER_OFF);
  const [view, setView] = useState<View | null>(null);
  const [out, setOut] = useState(0);
  const [big, setBig] = useState(false);
  const labels = info?.labels ?? [];
  const k = Math.min(Math.max(0, shown), Math.max(0, labels.length - 1));
  const label = labels[k] ?? '';
  const several = labels.length > 1;
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
  const byPoints = data.base === 'points';
  const ownPts = perRun ? data.runBasePoints?.[label] : undefined;
  const points = ownPts?.length ? ownPts : (data.basePoints ?? []);
  const setPoints = (p: Pt[]) => {
    if (!perRun) return set({ basePoints: p });
    const next = { ...data.runBasePoints };
    if (p.length) next[label] = p;
    else delete next[label];
    set({ runBasePoints: next });
  };
  const results = (info?.results ?? []).filter((q) => q.run === k);
  const color = (j: number) => (j >= 0 ? regionColor(j) : '#d62728');
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
        base={data.base === 'zero' && !regions.length ? undefined : info.bases[k]}
        marks={results.map((q) => ({ x: q.x, y: q.y, color: color(q.region), down: q.kind === 'peak' }))}
        segments={results.map((q) => ({ x0: q.left, y0: q.leftY, x1: q.right, y1: q.rightY, color: color(q.region) }))}
        lowerTitle=""
        width={w}
        topH={h}
        lowerH={0}
        xTitle={info.xName || 'row'}
        yTitle={label}
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
      <button className={`nodrag${adding ? ' on' : ''}`} title="Then drag on the graph: one range (a peak or a dip in each); the button turns off after it. The edges of a range can be dragged at any time" onClick={() => (setAdding((v) => !v), setPlacing(false), setZoom('none'))}>
        <MoveHorizontal {...IC} /> Add a range
      </button>
      {byPoints && (
        <button
          className={`nodrag${placing ? ' on' : ''}`}
          title="While on: click on the graph to place a point of the baseline, drag a point to move it, double-click it to remove it"
          onClick={() => (setPlacing((v) => !v), setAdding(false), setZoom('none'))}
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
          title="The same ranges for every run, or ranges of its own for each run (a run without its own takes the common ones)"
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
    <div className="node node-calculus node-peakwidth">
      <InPort label="dataset" port="dataset" id="in" title="A dataset (X and the Y columns from the designations, or chosen below)" />
      <NodeOptions>
      {names.length > 0 && (
        <div className="grid2">
          <Field label="X">
            <Select value={data.x || '-auto'} options={[['-auto', xAutoLabel(r?.view.available)], ['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x: x === '-auto' ? '' : x })} />
          </Field>
          <Field label="Y" title="The columns: 2, B-D (letters), names, A* (a pattern); empty: the Y columns (their designation): each measured on its own">
            <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} onChange={(ys) => set({ ys })} />
          </Field>
        </div>
      )}
      <div className="grid2">
        <Field label="Measure" title="A peak (a maximum over the baseline), a dip (a minimum under it), or the larger of the two in each range">
          <Select<WidthKind>
            value={data.kind}
            options={[
              ['auto', 'auto (the larger)'],
              ['peak', 'a peak'],
              ['dip', 'a dip'],
            ]}
            onChange={(kind) => set({ kind })}
          />
        </Field>
        <BaselineFields
          layout="grid"
          title="The height (or depth) and its half are measured from it, in every range (found on the points of the range): e.g. the straight line between the ends of the range (a dip in a reflectance: its level on both sides)"
          method={data.base}
          onMethod={(base) => set({ base: base as Baseline['kind'] })}
          opts={data.baseOpt}
          onOpts={(baseOpt) => set({ baseOpt })}
          value={data.baseValue}
          onValue={(baseValue) => set({ baseValue })}
          interp={data.baseInterp}
          onInterp={(baseInterp) => set({ baseInterp })}
          ends={1}
          autoUnder={data.kind === 'dip' ? 'dips' : 'peaks'}
          curve={<Select value={data.baseColumn ?? ''} title="Another column of the data (with its own X when it has one)" options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(baseColumn) => set({ baseColumn })} />}
        />
      </div>
      </NodeOptions>
      {info && (
        <>
          {runBar}
          {tools}
          {plot(520, 300)}
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
          <NodeOptions>
          {results.length > 0 && (
            <table className="width-table">
              <thead>
                <tr>
                  <th />
                  <th title="The extremum: its place (refined by a parabola)">X</th>
                  <th>{results.every((q) => q.kind === 'dip') ? 'depth' : 'height'}</th>
                  <th>FWHM</th>
                  <th title="X / FWHM">Q</th>
                  <th title="The minimum: its X and value">min (at X)</th>
                  <th title="The maximum: its X and value">max (at X)</th>
                  <th title="The points in the range, and their part of all the points of the curve (masked ones left out)">points (%)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((q, j) => (
                  <tr key={j}>
                    <td>
                      <b style={{ color: color(q.region) }}>{q.region >= 0 ? `range ${q.region + 1}` : 'all'}</b> {q.kind}
                    </td>
                    <td>{f(q.x)}</td>
                    <td>{f(q.kind === 'dip' ? -q.height : q.height)}</td>
                    <td>{f(q.fwhm)}</td>
                    <td>{f(q.x / q.fwhm)}</td>
                    <td>
                      {f(q.min)} ({f(q.xMin)})
                    </td>
                    <td>
                      {f(q.max)} ({f(q.xMax)})
                    </td>
                    <td>
                      {q.count} ({q.of ? fmtNum((100 * q.count) / q.of, 3) : '—'} %)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </NodeOptions>
        </>
      )}
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" title="A row per run and range: the run (its block's value), its range (the column “region”), from, to, peak / dip, X, Y, height / depth, FWHM (Y), left, right, Q, X at min, min, X at max, max, points, % of points" />
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
              {plot(Math.max(480, Math.min((window.innerWidth || 1200) * 0.86, 1400)), Math.max(320, Math.min((window.innerHeight || 800) * 0.7, 760)))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
