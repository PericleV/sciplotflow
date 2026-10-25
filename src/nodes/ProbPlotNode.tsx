// Probability plot: the groups (a column each, or raw values by group), the kind (ECDF, Q-Q, P-P, probability), the
// distribution (fitted or given), the plotting positions, the line and its band, the look; every group's statistics;
// the figure with the same tabs as a Plot.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { DIST_NAMES, PARAM_NAMES, type PlotPositions, type ProbDist, type ProbSpec } from '../engine/probplot.ts';
import { fmtNum } from '../engine/table.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { SymbolFill } from '../figure/spec.ts';
import type { AppNode, PlotPage, ProbPlotData, ProbPlotNode } from '../types.ts';
import { ColorSwatches, LookPanel } from './ColorSwatches.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { OptColor } from './fields.tsx';
import { DASHES, SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { Y_AUTO } from './xAuto.ts';
import { axesStyle, type AxesStyle } from '../figure/spec.ts';

const DISTS = Object.entries(DIST_NAMES) as [ProbDist, string][];
// the distributions of positive values: a threshold γ can be fitted (3 parameters)
const POSITIVE_DISTS: ProbDist[] = ['weibull', 'lognormal', 'exponential', 'gamma'];
// the axes with their major grid lines on (a probability paper)
const withGrid = (axes: Partial<AxesStyle> | undefined): Partial<AxesStyle> => {
  const st = axesStyle(axes);
  return { ...axes, grid: { x: { ...st.grid.x, major: true }, y: { ...st.grid.y, major: true } } };
};

export function ProbPlotNodeView({ id, data: d }: NodeProps<ProbPlotNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const [lookOf, setLookOf] = useState<number | null>(null);
  const set = (p: Partial<ProbPlotData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const raw = d.mode === 'raw';
  const k = d.kind;
  const pnames = PARAM_NAMES[d.dist];
  const rows = r?.view.prob ?? [];
  // the groups' own curves (their points or steps), for their colours
  const swatches = (r?.view.figure?.axes[0]?.curves ?? []).filter((c) => /^pp:\d+$/.test(c.key));
  const lineOptions: [ProbSpec['line'], string][] =
    k === 'ecdf'
      ? [
          ['dist', 'the distribution’s CDF'],
          ['none', 'none'],
        ]
      : k === 'pp'
        ? [
            ['identity', 'y = x'],
            ['none', 'none'],
          ]
        : [
            ['quartiles', 'through the quartiles'],
            ['lsq', 'least squares'],
            ['dist', 'the distribution'],
            ...(k === 'qq' ? [['identity', 'y = x'] as [ProbSpec['line'], string]] : []),
            ['none', 'none'],
          ];
  const line = lineOptions.some(([v]) => v === d.line) ? d.line : lineOptions[0][0];
  const bandOptions: [ProbSpec['band'], string][] =
    k === 'ecdf'
      ? [
          ['none', 'none'],
          ['pointwise', 'pointwise'],
          ['dkw', 'simultaneous (DKW)'],
        ]
      : k === 'pp'
        ? [
            ['none', 'none'],
            ['dkw', 'simultaneous (DKW)'],
          ]
        : [
            ['none', 'none'],
            ['pointwise', 'pointwise'],
          ];
  const band = bandOptions.some(([v]) => v === d.band) ? d.band : d.band === 'none' ? 'none' : bandOptions[1][0];
  return (
    <div className="node node-plot1d node-probplot">
      <InPort label="dataset" port="dataset" id="dataset" title="A column per group, or raw values with the column of their groups" />
      <NodeOptions>
      <details open>
        <summary>Data</summary>
        <div className="col-form">
          <span>The data</span>
          <Select<ProbSpec['mode']>
            value={d.mode}
            options={[
              ['table', 'a column per group'],
              ['raw', 'values with their groups'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          {!raw ? (
            <>
              <span>Groups</span>
              <ColumnsPicker value={d.ys} names={names} auto={Y_AUTO} title="The columns, each a group (a list: 2, B-D, names, A*)" onChange={(ys) => set({ ys })} />
            </>
          ) : (
            <>
              <span>Values</span>
              <Select value={d.value} options={[['', 'auto: the first Y'], ...cols]} onChange={(value) => set({ value })} />
              <span>Groups</span>
              <Select
                value={d.group}
                options={[
                  ['', 'auto: the first column of text'],
                  ['-', 'none (one group)'],
                  ...cols,
                ]}
                onChange={(group) => set({ group })}
              />
            </>
          )}
          <span title="Life data: a column with the status of every value; 1 (or F, failed) failed, 0 (or S, suspended, censored) still running when the test stopped">Status</span>
          <Select value={d.censor ?? ''} options={[['', 'none (all failed)'], ...cols]} onChange={(censor) => set({ censor: censor || undefined })} />
        </div>
      </details>
      <details open>
        <summary>Probability plot</summary>
        <div className="col-form">
          <span>Kind</span>
          <span className="row wrap">
            <Select<ProbSpec['kind']>
              value={k}
              options={[
                ['ecdf', 'ECDF (cumulative)'],
                ['qq', 'Q-Q (quantiles)'],
                ['pp', 'P-P (probabilities)'],
                ['prob', 'probability (probability axis)'],
              ]}
              onChange={(kind) =>
                // a probability paper: the fitted line, the grid, the parameters in a corner (once, when chosen)
                set({ kind, ...(kind === 'prob' && d.kind !== 'prob' ? { ...(d.line === 'quartiles' ? { line: 'dist' as const } : {}), paramBox: d.paramBox ?? 'br', axes: withGrid(d.axes) } : {}) })
              }
            />
            <Check label="Swap X and Y" value={d.swap} onChange={(swap) => set({ swap })} />
          </span>
          <span>Distribution</span>
          <span className="row wrap">
            <Select<ProbDist> value={d.dist} options={DISTS} onChange={(dist) => set({ dist })} />
            <Select<ProbSpec['params']>
              value={d.params}
              title="Fitted: maximum likelihood (the location 0 for the positive distributions)"
              options={[
                ['fit', 'fitted to each group'],
                ['given', 'with given parameters'],
              ]}
              onChange={(params) => set({ params })}
            />
          </span>
          {d.params === 'fit' && (
            <>
              <span>Estimation</span>
              <span className="row wrap">
                <Select<NonNullable<ProbSpec['method']>>
                  value={d.method ?? 'mle'}
                  title="The parameters: maximum likelihood (with the suspended values), or rank regression on the probability scale: X on Y (RRX) or Y on X (RRY), the usual Weibull ways"
                  options={[
                    ['mle', 'maximum likelihood'],
                    ['rrx', 'rank regression X on Y'],
                    ['rry', 'rank regression Y on X'],
                  ]}
                  onChange={(method) => set({ method: method === 'mle' ? undefined : method })}
                />
                {POSITIVE_DISTS.includes(d.dist) && <Check label="threshold γ (3 parameters)" value={!!d.threshold} onChange={(threshold) => set({ threshold: threshold || undefined })} />}
              </span>
              <span title="The values by which these percents failed (B10: 10 %), with their intervals (Fisher matrix, the level of the band)">B lives (%)</span>
              <TextInput className="short-text" value={d.bLives ?? ''} placeholder="e.g. 1, 10" onChange={(bLives) => set({ bLives: bLives || undefined })} />
            </>
          )}
          {k === 'prob' && (
            <>
              <span>On the figure</span>
              <span className="row wrap">
                <Select<NonNullable<ProbSpec['paramBox']>>
                  value={d.paramBox ?? 'none'}
                  title="The parameters of every group (and γ, the B lives) written in a corner of the frame"
                  options={[
                    ['none', 'no parameters'],
                    ['tl', 'parameters top left'],
                    ['tr', 'parameters top right'],
                    ['bl', 'parameters bottom left'],
                    ['br', 'parameters bottom right'],
                  ]}
                  onChange={(paramBox) => set({ paramBox })}
                />
                <Check label={d.dist === 'weibull' ? '63.2 % line (η)' : '50 % line (median)'} value={!!d.refLine} onChange={(refLine) => set({ refLine: refLine || undefined })} />
              </span>
            </>
          )}
          {d.params === 'given' && (
            <>
              <span>Parameters</span>
              <span className="row wrap">
                <Field label={pnames[0]}>
                  <NumInput className="short" value={d.p1} onChange={(p1) => set({ p1 })} />
                </Field>
                {pnames[1] && (
                  <Field label={pnames[1]}>
                    <NumInput className="short" value={d.p2} onChange={(p2) => set({ p2 })} />
                  </Field>
                )}
              </span>
            </>
          )}
          {k !== 'ecdf' && (
            <>
              <span>Positions</span>
              <span className="row wrap">
                <Select<PlotPositions>
                  value={d.positions}
                  title="The probability of the i-th of n sorted values: (i − a)/(n + 1 − 2a)"
                  options={[
                    ['blom', 'Blom (i − 3/8)/(n + 1/4)'],
                    ['benard', 'Benard (i − 0.3)/(n + 0.4)'],
                    ['hazen', 'Hazen (i − 0.5)/n'],
                    ['vdw', 'Van der Waerden i/(n + 1)'],
                    ['filliben', 'Filliben'],
                  ]}
                  onChange={(positions) => set({ positions })}
                />
                {k === 'qq' && (
                  <Select<ProbSpec['qqAxis']>
                    value={d.qqAxis}
                    title="The theoretical quantiles: of the standard distribution (location 0, scale 1, the fitted shape), or of the fitted one, in the data's units"
                    options={[
                      ['standard', 'standard quantiles'],
                      ['data', 'in the data’s units'],
                    ]}
                    onChange={(qqAxis) => set({ qqAxis })}
                  />
                )}
              </span>
            </>
          )}
          {k === 'ecdf' && (
            <>
              <span>ECDF</span>
              <span className="row wrap">
                <Select<ProbSpec['ecdfY']>
                  value={d.ecdfY}
                  options={[
                    ['probability', 'probability'],
                    ['percent', 'percent'],
                    ['count', 'count'],
                  ]}
                  onChange={(ecdfY) => set({ ecdfY })}
                />
                <Select<ProbSpec['ecdfLook']>
                  value={d.ecdfLook}
                  options={[
                    ['steps', 'steps'],
                    ['points', 'points'],
                    ['both', 'steps and points'],
                  ]}
                  onChange={(ecdfLook) => set({ ecdfLook })}
                />
                <Check label="1 − F (survival)" value={d.complementary} onChange={(complementary) => set({ complementary })} />
              </span>
            </>
          )}
          <span>Line</span>
          <span className="row wrap" title="Its look for every group (⚙ beside a group's colour: that group's own)">
            <Select<ProbSpec['line']> value={line} options={lineOptions} onChange={(l) => set({ line: l })} />
            {(line !== 'none' || band !== 'none') && <OptColor value={d.lineColor} none="auto" title="The line and the band of every group (auto: red for one group, else the group's colour)" onChange={(lineColor) => set({ lineColor })} />}
            {(line !== 'none' || k === 'ecdf') && (
              <Field label="Width" title={k === 'ecdf' ? 'The steps and the line, pt' : 'pt'}>
                <NumInput className="tiny" min={0.25} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.25, lineWidth || 1) })} />
              </Field>
            )}
            {line !== 'none' && <Select value={d.lineDash} title="The line" options={DASHES} onChange={(lineDash) => set({ lineDash })} />}
          </span>
          <span>Band</span>
          <span className="row wrap">
            <Select<ProbSpec['band']>
              value={band}
              title="Pointwise: Q-Q and probability; the standard error of an order statistic around the line; ECDF: F ± z·√(F(1 − F)/n). Simultaneous: Dvoretzky–Kiefer–Wolfowitz, F ± √(ln(2/α)/(2n))"
              options={bandOptions}
              onChange={(b) => set({ band: b })}
            />
            {band !== 'none' && (
              <>
                <Field label="Level %">
                  <NumInput className="tiny" min={50} max={99.9} step={1} value={d.level} onChange={(level) => set({ level: Math.min(99.9, Math.max(50, level || 95)) })} />
                </Field>
                <Select value={d.bandDash} title="The band's line, for every group (⚙: one group's own)" options={DASHES} onChange={(bandDash) => set({ bandDash })} />
              </>
            )}
          </span>
          <span>Colours</span>
          <span className="row wrap">
            <ColorSwatches swatches={swatches} colors={d.colors} onChange={set} gradient={false} looks={d.looks} open={lookOf} onOpen={setLookOf} />
          </span>
          <LookPanel swatches={swatches} looks={d.looks} fields={k === 'ecdf' && d.ecdfLook === 'steps' ? ['line', 'band'] : ['points', 'line', 'band']} open={lookOf} onChange={(looks) => set({ looks })} />
          {(k !== 'ecdf' || d.ecdfLook !== 'steps') && (
            <>
              <span title="For every group (⚙ beside a group's colour: that group's own)">Symbols</span>
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
              </span>
            </>
          )}
        </div>
        {rows.map((q) => (
          <div key={q.group} className="stat-report prob-result">
            <div>
              <b>{q.group}</b>: {DIST_NAMES[d.dist]}, n = {q.n}
            </div>
            <div className="mono">{pnames.map((nm, j) => `${nm} = ${fmtNum(q.params[j], 5)}`).join(', ')}</div>
            <div className="muted">
              r = {fmtNum(q.r, 5)}, A² = {fmtNum(q.a2, 4)}
              {Number.isFinite(q.p) ? `, p = ${fmtNum(q.p, 3)}` : ''}
              {Number.isFinite(q.crit5) ? ` (5 %: ${fmtNum(q.crit5, 3)})` : ''}, KS D = {fmtNum(q.ks, 4)}
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
      <OutPort label="stats" port="dataset" id="stats" title="Every group: N, the parameters, r (PPCC), the least-squares slope and intercept, Anderson–Darling A² (p or the 5 % critical value), Kolmogorov–Smirnov D" />
      <OutPort label="points" port="dataset" id="points" title="Every value: its group, position, theoretical and standard quantiles, the CDF and the ECDF" />
    </div>
  );
}
