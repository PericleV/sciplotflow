// Histogram: the columns counted (chosen, else the designated Y), the bins, the bars, the fits with their results (copied
// or saved as CSV); the figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { BinMode, HistFit, HistFitKind, HistNorm, HistSpec } from '../engine/histogram.ts';
import { fmtPm } from '../engine/report.ts';
import { fmtNum } from '../engine/table.ts';
import { PALETTE } from '../figure/spec.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, HistogramData, HistogramNode, PlotPage } from '../types.ts';
import { BarLookControls } from './BarLookControls.tsx';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { Y_AUTO } from './xAuto.ts';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

const BIN_MODES: [BinMode, string][] = [
  ['auto', 'automatic (the finer of Sturges and Freedman–Diaconis)'],
  ['sturges', 'Sturges'],
  ['scott', 'Scott'],
  ['fd', 'Freedman–Diaconis'],
  ['sqrt', '√n'],
  ['rice', 'Rice'],
  ['count', 'a number of bins'],
  ['width', 'a width'],
  ['edges', 'the edges written'],
];
const FIT_KINDS: [HistFitKind, string][] = [
  ['normal', 'Normal (Gaussian)'],
  ['binormal', 'Two normals (binormal)'],
  ['lorentz', 'Lorentzian (Cauchy)'],
  ['kernel', 'Kernel density'],
  ['gaussN', 'Several Gaussians (together)'],
  ['lorentzN', 'Several Lorentzians (together)'],
  ['lognormal', 'Lognormal (maximum likelihood)'],
  ['weibull', 'Weibull (maximum likelihood)'],
  ['exponential', 'Exponential (maximum likelihood)'],
  ['gamma', 'Gamma (maximum likelihood)'],
];

// the fit results as a table: a row per parameter (tab-separated for the clipboard, comma-separated for a file)
function fitRows(fits: NonNullable<ReturnType<typeof useNodeResult>>['view']['hist']): string[][] {
  const out: string[][] = [['column', 'fit', 'method', 'parameter', 'value', 'error']];
  for (const f of fits?.fits ?? []) {
    const extra: [string, number][] = [
      ['chi2', f.chi2],
      ['dof', f.dof],
      ['p (chi2)', f.p],
      ['R2', f.r2],
      ['AIC', f.aic],
    ];
    const fit = f.range ? `${f.fit} (${f.range})` : f.fit;
    for (const q of f.params) out.push([f.series, fit, f.method, q.name, String(q.value), Number.isFinite(q.error) ? String(q.error) : '']);
    for (const [k, v] of extra) if (Number.isFinite(v)) out.push([f.series, fit, f.method, k, String(v), '']);
  }
  return out;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function HistogramNodeView({ id, data: d }: NodeProps<HistogramNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<HistogramData>) => updateNodeData(id, p);
  const setBins = (p: Partial<HistSpec['bins']>) => set({ bins: { ...d.bins, ...p } });
  const setFit = (k: number, p: Partial<HistFit>) => set({ fits: d.fits.map((f, j) => (j === k ? { ...f, ...p } : f)) });
  // the fit ranges (as in Fit): dragged on the figure, listed here; a range removed: the fits on it take all of them again
  const ranges = d.ranges ?? [];
  const removeRange = (j: number) => set({ ranges: ranges.filter((_, i) => i !== j), fits: d.fits.map((f) => (f.on === undefined || f.on < j ? f : f.on === j ? { ...f, on: undefined } : { ...f, on: f.on - 1 })) });
  const rangeText = (q: { lo: number; hi: number }) => `${Number.isFinite(q.lo) ? fmtNum(q.lo, 5) : '…'} – ${Number.isFinite(q.hi) ? fmtNum(q.hi, 5) : '…'}`;
  const names = (r?.view.available ?? []).map((c) => c.name);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const bars = (r?.view.figure?.axes[0]?.curves ?? []).filter((c) => c.key.startsWith('hist:'));
  const hist = r?.view.hist;
  const b = d.bins;
  const copy = () => void navigator.clipboard.writeText(fitRows(hist).map((row) => row.join('\t')).join('\n'));
  const save = () => {
    const blob = new Blob([fitRows(hist).map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'histogram fits.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="node node-plot1d node-histogram">
      <InPort label="dataset" port="dataset" id="dataset" title="The columns of values to count (chosen below, else the designated Y)" />
      <NodeOptions>
      <details open>
        <summary>Data and bins</summary>
        <div className="col-form">
          <span>Columns</span>
          <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="One column, or several (a list: 2, B-D, names, A*); auto: the designated Y (else the first column of numbers)" onChange={(ys) => set({ ys })} />
          <span>Bins</span>
          <span className="row wrap">
            <Select<BinMode> value={b.mode} options={BIN_MODES} onChange={(mode) => setBins({ mode })} />
            {b.mode === 'count' && <NumInput className="tiny" min={1} step={1} value={b.count} onChange={(count) => setBins({ count: Math.max(1, Math.floor(count) || 10) })} />}
            {b.mode === 'width' && (
              <>
                <NumInput className="short" value={b.width} placeholder="width" onChange={(width) => setBins({ width })} />
                <NumInput className="short" value={b.start} placeholder="from (auto)" title="Where a bin starts (empty: at the smallest value)" onChange={(start) => setBins({ start })} />
              </>
            )}
            {b.mode === 'edges' && <TextInput className="mono" value={b.edges} placeholder="0, 1, 2.5, 5" onChange={(edges) => setBins({ edges })} />}
            {b.mode !== 'edges' && <Check label="log scale" value={!!b.log} onChange={(log) => setBins({ log: log || undefined })} />}
          </span>
          <span title="A column of weights: every value counted that many times (a table already counted, sample weights)">Weights</span>
          <Select value={d.weights ?? ''} options={[['', 'none (each value once)'], ...names.map((n): [string, string] => [n, n])]} onChange={(weights) => set({ weights: weights || undefined })} />
          {b.mode !== 'edges' && (
            <>
              <span>Range</span>
              <span className="row">
                <NumInput className="short" value={b.from} placeholder="data" onChange={(from) => setBins({ from })} />
                <span>–</span>
                <NumInput className="short" value={b.to} placeholder="data" onChange={(to) => setBins({ to })} />
                {hist && <span className="muted">{`${hist.bins} bins, ${fmtNum(hist.from, 5)} – ${fmtNum(hist.to, 5)}`}</span>}
              </span>
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>Bars</summary>
        <div className="col-form">
          <span>Height</span>
          <span className="row">
            <Select<HistNorm>
              value={d.norm}
              options={[
                ['count', 'count'],
                ['percent', 'percent'],
                ['probability', 'probability (adds up to 1)'],
                ['density', 'density (area 1)'],
              ]}
              onChange={(norm) => set({ norm })}
            />
            <Check label="Cumulative" value={d.cumulative} onChange={(cumulative) => set({ cumulative })} />
          </span>
          <span title="A vertical line at the mean (dashed) and the median (dotted) of every column, its value in the legend">Marks</span>
          <span className="row">
            <Check label="mean" value={!!d.marks?.mean} onChange={(mean) => set({ marks: { ...d.marks, mean: mean || undefined } })} />
            <Check label="median" value={!!d.marks?.median} onChange={(median) => set({ marks: { ...d.marks, median: median || undefined } })} />
            <Check label="rug" title="Every value a short tick along the bottom of the frame (where the values really are, inside the bins)" value={!!d.rug} onChange={(rug) => set({ rug: rug || undefined })} />
          </span>
          <span>Drawn as</span>
          <span className="row wrap">
            <Select<HistSpec['look']>
              value={d.look}
              options={[
                ['bars', 'bars'],
                ['stepfilled', 'steps, filled'],
                ['step', 'steps, outline'],
              ]}
              onChange={(look) => set({ look })}
            />
            {bars.length > 1 && (
              <Select<HistSpec['multi']>
                value={d.multi}
                options={[
                  ['overlap', 'overlapped'],
                  ['stack', 'stacked'],
                  ['side', 'side by side'],
                ]}
                onChange={(multi) => set({ multi })}
              />
            )}
          </span>
          <span>Look</span>
          <span className="row wrap">
            <Field label="Gap %" title="The part of every bin left empty between the bars">
              <NumInput className="tiny" min={0} max={90} step={5} value={Math.round((d.gap || 0) * 100)} onChange={(g) => set({ gap: Math.min(0.9, Math.max(0, (g || 0) / 100)) })} />
            </Field>
            <Field label="Opacity">
              <NumInput className="tiny" min={0} max={1} step={0.1} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 0.6)) })} />
            </Field>
            <Field label="Edge" title="The line around the bars: colour, width (pt; 0 = none)">
              <input className="nodrag color" type="color" value={d.edgeColor || '#000000'} onChange={(e) => set({ edgeColor: e.target.value })} />
              <NumInput className="tiny" min={0} step={0.25} value={d.edgeWidth} onChange={(edgeWidth) => set({ edgeWidth: Math.max(0, edgeWidth || 0) })} />
            </Field>
          </span>
          <BarLookControls value={d.barLook} onChange={(barLook) => set({ barLook })} />
          {bars.length > 0 && (
            <>
              <span>Colours</span>
              <span className="row wrap">
                <ColorSwatches swatches={bars} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
              </span>
              <LookPanel swatches={bars} looks={d.looks} fields={['opacity', 'edge', 'hatch', ...(d.fits.length ? (['fits'] as const) : [])]} fitNames={d.fits.map((f) => `${FIT_KINDS.find(([k]) => k === f.kind)?.[1] ?? f.kind}${f.kind === 'kernel' ? '' : f.method === 'data' ? ', from the data' : ', fitted to the bars'}`)} open={lookOf} onChange={(looks) => set({ looks })} />
            </>
          )}
        </div>
      </details>
      <details open>
        <summary>Fits{d.fits.length ? ` (${d.fits.length})` : ''}</summary>
        {ranges.length > 0 && (
          <div className="row wrap fit-ranges">
            <span className="muted">Ranges:</span>
            {ranges.map((q, j) => (
              <span key={j} className="chip">
                {ranges.length > 1 ? `${j + 1}) ` : ''}
                {rangeText(q)}
                <button className="nodrag ts-btn" title="Remove this range" onClick={() => removeRange(j)}>
                  <X {...IC} />
                </button>
              </span>
            ))}
          </div>
        )}
        {d.fits.map((f, k) => {
          const many = f.kind === 'gaussN' || f.kind === 'lorentzN';
          return (
            <div key={k} className="hist-fit-item">
              <div className="row wrap hist-fit">
                <Select<HistFitKind> value={f.kind} options={FIT_KINDS} onChange={(kind) => setFit(k, { kind })} />
                {many ? (
                  <>
                    <NumInput className="tiny" min={2} max={6} step={1} value={f.peaks ?? 2} title="How many peaks, fitted together to the bars" onChange={(v) => setFit(k, { peaks: Math.max(2, Math.min(6, Math.round(v) || 2)) })} />
                    <TextInput className="short" value={f.starts ?? ''} placeholder="start: auto" title="Where the peaks start (x, separated by commas); empty: at the highest bars" onChange={(starts) => setFit(k, { starts })} />
                  </>
                ) : f.kind !== 'kernel' ? (
                  <Select<HistFit['method']>
                    value={f.method}
                    title="From the data: the values themselves (mean and SD; maximum likelihood) — not changed by the bins. Fitted to the bars: least squares on the heights of the bins"
                    options={[
                      ['data', 'from the data'],
                      ['bars', 'fitted to the bars'],
                    ]}
                    onChange={(method) => setFit(k, { method })}
                  />
                ) : (
                  <>
                    <Select<NonNullable<HistFit['bandwidth']>>
                      value={f.bandwidth ?? 'scott'}
                      options={[
                        ['scott', 'Scott'],
                        ['silverman', 'Silverman'],
                        ['value', 'a width'],
                      ]}
                      onChange={(bandwidth) => setFit(k, { bandwidth })}
                    />
                    {f.bandwidth === 'value' && <NumInput className="tiny" min={0} value={f.bw ?? NaN} title="The width of the kernel (its σ)" onChange={(bw) => setFit(k, { bw })} />}
                  </>
                )}
                {f.kind !== 'kernel' && (f.method === 'bars' || many) && <Check label="Offset y0" value={!!f.offset} onChange={(offset) => setFit(k, { offset })} />}
                {many && <Check label="Each peak" title="Every peak drawn too (dashed)" value={!!f.parts} onChange={(parts) => setFit(k, { parts: parts || undefined })} />}
                <input className="nodrag color" type="color" value={f.color || PALETTE[(k + 2) % PALETTE.length]} title="The colour of the curve" onChange={(e) => setFit(k, { color: e.target.value })} />
                <button className="nodrag ts-btn" title="Remove this fit" onClick={() => set({ fits: d.fits.filter((_, j) => j !== k) })}>
                  <X {...IC} />
                </button>
              </div>
              {ranges.length > 0 && (
                <div className="row wrap hist-fit">
                  <span className="muted">on</span>
                  <Select<number>
                    value={f.on !== undefined && f.on < ranges.length ? f.on : -1}
                    title="The ranges it takes: as the histogram says (each one on its own with A fit per range, else all of them together), or one of them"
                    options={[[-1, d.rangeFits && ranges.length > 1 ? 'each range on its own' : ranges.length > 1 ? 'all the ranges together' : 'the range'], ...ranges.map((q, j): [number, string] => [j, `range ${j + 1}: ${rangeText(q)}`])]}
                    onChange={(on) => setFit(k, { on: on < 0 ? undefined : on })}
                  />
                  <Check label="Curve over all" title="Its curve drawn over all the bins (else over its ranges only)" value={!!f.drawAll} onChange={(drawAll) => setFit(k, { drawAll: drawAll || undefined })} />
                </div>
              )}
            </div>
          );
        })}
        <div className="row wrap">
          <button className="nodrag" onClick={() => set({ fits: [...d.fits, { kind: 'normal', method: 'data' }] })}>
            + Fit
          </button>
          <span className="grow" />
          {!!hist?.fits.length && (
            <>
              <button className="nodrag" title="The results as a table (tab-separated: paste into a spreadsheet)" onClick={copy}>
                Copy
              </button>
              <button className="nodrag" title="The results as a CSV file" onClick={save}>
                Save CSV
              </button>
            </>
          )}
        </div>
        {hist?.fits.map((f, k) => (
          <div key={k} className="stat-report hist-result">
            <div>
              <b>{f.fit}</b>
              {f.range ? ` (${f.range})` : ''} — {f.method}
              {bars.length > 1 ? ` · ${f.series}` : ''}
            </div>
            {f.params.map((q) => (
              <div key={q.name} className="mono">
                {q.name} = {fmtPm(q.value, q.error)}
              </div>
            ))}
            <div className="muted">
              χ² = {fmtNum(f.chi2, 4)}, dof {f.dof}, p = {fmtNum(f.p, 3)}
              {Number.isFinite(f.r2) ? `, R² = ${fmtNum(f.r2, 5)}` : ''}
              {Number.isFinite(f.aic) ? `, AIC = ${fmtNum(f.aic, 5)}` : ''}
            </div>
          </div>
        ))}
      </details>
      </NodeOptions>
      {fig && (
        <FigureView
          fig={fig}
          width={600}
          page={page}
          setPage={(p) => set({ page: { ...page, ...p } })}
          layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move."
          ranges={{
            list: ranges,
            onChange: (r) => set({ ranges: r, ...(r.length ? {} : { fits: d.fits.map((f) => (f.on === undefined ? f : { ...f, on: undefined })) }) }),
            title: 'Then drag on the figure: one fit range (only the values or the bars inside the ranges are fitted); the button turns off after it. The edges of a range can be dragged at any time',
            extra: ranges.length > 1 && <Check label="A fit per range" title="Every range fitted on its own (its own parameters and curve), else one fit of the values of all the ranges together; a fit can also take one range only (on, in its row)" value={!!d.rangeFits} onChange={(rangeFits) => set({ rangeFits })} />,
          }}
        />
      )}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={r?.view.legendCurves ?? []} pos={fig?.axes[0]?.style.pos} port={false} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, or as an inset of a Plot" />
      <OutPort label="bins" port="dataset" id="bins" title="Every bin: its centre, from, to, and for every column its count and height" />
      <OutPort label="fits" port="dataset" id="fits" title="The fit results: a row per parameter (column, fit, parameter, value, error), χ², p, R², AIC" />
      <OutPort label="curves" port="dataset" id="curves" title="X and every fitted curve (as drawn)" />
    </div>
  );
}
