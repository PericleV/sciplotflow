// Bland–Altman: the two methods (and the groups for the colours), what X and Y are, the limits and their intervals, the
// regression and the line of equality, the values on the lines; the look of every group and every line (⚙); the
// statistics; the figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { BA_LINE_COLORS, BA_LINES, type BASpec } from '../engine/blandaltman.ts';
import { fmtNum } from '../engine/table.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { Curve, SymbolFill } from '../figure/spec.ts';
import type { AppNode, BlandAltmanData, BlandAltmanNode, PlotPage } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';

// the lines as swatches (their names, their keys)
const LINE_SWATCHES = BA_LINES.map((label, k) => ({ key: `line${k}`, label }) as Curve);

export function BlandAltmanNodeView({ id, data: d }: NodeProps<BlandAltmanNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [groupOpen, setGroupOpen] = useState<number | null>(null);
  const [lineOpen, setLineOpen] = useState<number | null>(null);
  const set = (p: Partial<BlandAltmanData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const groups = (r?.view.figure?.axes[0]?.curves ?? []).filter((c) => /^ba:\d+$/.test(c.key));
  const rows = r?.view.ba ?? [];
  const np = d.loa === 'nonparametric';
  // a + b·x written with its sign
  const lin = (a: number, b: number) => `${fmtNum(a, 4)} ${b < 0 ? '−' : '+'} ${fmtNum(Math.abs(b), 4)}·x`;
  const ci = (v: [number, number]) => (Number.isFinite(v[0]) ? ` (${fmtNum(v[0], 4)} to ${fmtNum(v[1], 4)})` : '');
  return (
    <div className="node node-plot1d node-blandaltman">
      <InPort label="dataset" port="dataset" id="dataset" title="Two columns measured by two methods (A and B), and optionally a column of groups" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>Method A</span>
          <Select value={d.a} options={[['', 'auto: the first Y'], ...cols]} onChange={(a) => set({ a })} />
          <span>Method B</span>
          <Select value={d.b} options={[['', 'auto: the next Y'], ...cols]} onChange={(b) => set({ b })} />
          <span>Groups</span>
          <Select value={d.group} title="A column whose values colour the points (the limits are of all the pairs)" options={[['', 'none'], ...cols]} onChange={(group) => set({ group })} />
        </div>
      </details>
      <details open>
        <summary>Bland–Altman</summary>
        <div className="col-form">
          <span>X</span>
          <Select<BASpec['x']>
            value={d.x}
            options={[
              ['mean', 'the mean of A and B'],
              ['a', 'A (the reference method)'],
              ['b', 'B (the reference method)'],
              ['gmean', 'the geometric mean'],
            ]}
            onChange={(x) => set({ x })}
          />
          <span>Y</span>
          <Select<BASpec['y']>
            value={d.y}
            options={[
              ['diff', 'the difference A − B'],
              ['pct', 'the difference in % of the mean'],
              ['ratio', 'the ratio A / B (log axis)'],
            ]}
            onChange={(y) => set({ y })}
          />
          <span>Limits</span>
          <span className="row wrap">
            <Select<BASpec['loa']>
              value={d.loa}
              title="Parametric: bias ± z·SD; nonparametric: the median and percentiles; regression: the bias and the spread as lines of X (Bland & Altman 1999)"
              options={[
                ['parametric', 'bias ± z·SD'],
                ['nonparametric', 'median, percentiles'],
                ['regression', 'from a regression on X'],
              ]}
              onChange={(loa) => set({ loa })}
            />
            <Field label="Level %" title="95: bias ± 1.96·SD (or the 2.5th and 97.5th percentiles)">
              <NumInput className="tiny" min={50} max={99.9} step={1} value={d.level} onChange={(level) => set({ level: Math.min(99.9, Math.max(50, level || 95)) })} />
            </Field>
          </span>
          {!np && (
            <>
              <span>Intervals</span>
              <span className="row wrap">
                <Select<BASpec['ci']>
                  value={d.ci}
                  title="The confidence intervals of the bias and the limits: approximate (Bland & Altman 1999) or exact for the limits (Carkeet 2015, the noncentral t)"
                  options={[
                    ['none', 'none'],
                    ['approx', 'approximate'],
                    ['exact', 'exact (Carkeet)'],
                  ]}
                  onChange={(c) => set({ ci: c })}
                />
                {d.ci !== 'none' && (
                  <>
                    <Field label="Level %">
                      <NumInput className="tiny" min={50} max={99.9} step={1} value={d.ciLevel} onChange={(ciLevel) => set({ ciLevel: Math.min(99.9, Math.max(50, ciLevel || 95)) })} />
                    </Field>
                    <Field label="Shading" title="The opacity of the bands (0: not drawn)">
                      <NumInput className="tiny" min={0} max={1} step={0.05} value={d.ciOpacity} onChange={(ciOpacity) => set({ ciOpacity: Math.min(1, Math.max(0, Number.isFinite(ciOpacity) ? ciOpacity : 0.15)) })} />
                    </Field>
                  </>
                )}
              </span>
            </>
          )}
          <span>Show</span>
          <span className="row wrap">
            <Check label="Regression on X" title="The differences regressed on X: a slope says the bias grows with the size (proportional bias)" value={d.regLine} onChange={(regLine) => set({ regLine })} />
            <Check label="Line of equality" value={d.zeroLine} onChange={(zeroLine) => set({ zeroLine })} />
            <Check label="Values on the lines" value={d.labels} onChange={(labels) => set({ labels })} />
          </span>
          {groups.length > 0 && (
            <>
              <span>Groups</span>
              <span className="row wrap">
                <ColorSwatches swatches={groups} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={groupOpen} onOpen={setGroupOpen} />
              </span>
              <LookPanel swatches={groups} looks={d.looks} fields={['points']} open={groupOpen} onChange={(looks) => set({ looks })} />
            </>
          )}
          <span>Lines</span>
          <span className="row wrap">
            <ColorSwatches swatches={LINE_SWATCHES} defaults={BA_LINE_COLORS} colors={d.lineColors} onChange={({ colors }) => set({ lineColors: colors })} gradient={false} looks={d.lineLooks} open={lineOpen} onOpen={setLineOpen} />
          </span>
          <LookPanel swatches={LINE_SWATCHES} looks={d.lineLooks} fields={['style']} open={lineOpen} onChange={(lineLooks) => set({ lineLooks })} />
          <span title="For every group and line (⚙: one's own)">Symbols</span>
          <span className="row wrap">
            <Select value={d.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
            <Field label="Size">
              <NumInput className="tiny" min={0.5} step={0.5} value={d.symbolSize} onChange={(symbolSize) => set({ symbolSize: Math.max(0.5, symbolSize || 5) })} />
            </Field>
            <Select<SymbolFill> seg
              value={d.symbolFill}
              options={[
                ['filled', 'filled'],
                ['open', 'open'],
                ['white', 'white'],
                ['dot', 'dot'],
              ]}
              onChange={(symbolFill) => set({ symbolFill })}
            />
            <Field label="Line width" title="Every line, pt (⚙ beside a line: its own)">
              <NumInput className="tiny" min={0.25} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.25, lineWidth || 1) })} />
            </Field>
          </span>
        </div>
        {rows.map((q) => (
          <div key={q.group} className="stat-report prob-result">
            <div>
              <b>{q.group === 'all' ? 'All pairs' : q.group}</b>, n = {q.n}
            </div>
            <div className="mono">
              {np ? 'median' : 'bias'} = {fmtNum(q.bias, 5)}
              {ci(q.biasCI)}
              {d.loa !== 'regression' && (
                <>
                  ; limits {fmtNum(q.lower, 5)}
                  {ci(q.lowerCI)} and {fmtNum(q.upper, 5)}
                  {ci(q.upperCI)}
                </>
              )}
            </div>
            <div className="muted">
              {d.loa === 'regression' && q.reg ? `bias line ${lin(q.reg.b0, q.reg.b1)}, |residual| ${lin(q.reg.c0, q.reg.c1)}; ` : ''}
              {d.y === 'ratio' ? 'SD of ln' : 'SD'} = {fmtNum(q.sd, 4)}; slope on X = {fmtNum(q.slope, 4)}, p = {fmtNum(q.pSlope, 3)}
            </div>
          </div>
        ))}
      </details>
      </NodeOptions>
      {fig && <FigureView fig={fig} width={600} page={page} setPage={(p) => set({ page: { ...page, ...p } })} layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move." />}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={r?.view.legendCurves ?? []} pos={fig?.axes[0]?.style.pos} port={false} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, or as an inset of a Plot" />
      <OutPort label="stats" port="dataset" id="stats" title="All the pairs (and every group): N, the bias, SD, the limits, their intervals, the regression on X (slope, intercept, r, p)" />
      <OutPort label="points" port="dataset" id="points" title="Every pair: its group, A, B, X and Y (designated X and Y)" />
    </div>
  );
}
