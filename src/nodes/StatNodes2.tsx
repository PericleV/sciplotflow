// The nodes of the second statistics package (Adjust p-values, Contingency tables, ROC curve, Survival, Linear
// regression): their data and options, the report in words, the main table, the outputs.
import { Fragment } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ContingencyData, PAdjustData, RegressData, RocData, SurvivalData } from '../engine/statnodes2.ts';
import type { ContingencyNode, PAdjustNode, RegressNode, RocNode, SurvivalNode } from '../types.ts';
import { Check, InPort, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { Main } from './TestNodes.tsx';
import { useNode } from './useStatNode.ts';

const colOpts = (names: string[], none = 'choose'): [string, string][] => [['', none], ...names.map((n): [string, string] => [n, n])];
const Alpha = ({ value, set }: { value: number; set: (a: number) => void }) => (
  <>
    <span>α</span>
    <NumInput className="short" value={value} step={0.01} min={0.0001} max={0.5} title="The significance level (0.05: 95 % confidence)" onChange={(v) => set(Math.min(0.5, Math.max(0.0001, v || 0.05)))} />
  </>
);

export function PAdjustNodeView({ id, data }: NodeProps<PAdjustNode>) {
  const { r, names, set } = useNode<PAdjustData>(id);
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A table with a column of p-values (the output of a test, a list typed …)" />
      <NodeOptions>
        <div className="col-form">
          <span>p column</span>
          <Select value={data.col} title="The column of the p-values (auto: one named p, else the first with p in its name)" options={colOpts(names, 'auto')} onChange={(col) => set({ col })} />
          <span>Method</span>
          <Select<PAdjustData['method']>
            value={data.method}
            title="Bonferroni, Holm, Hochberg, Hommel: the chance of any false positive kept under α (the family-wise error); Benjamini–Hochberg, Benjamini–Yekutieli: the share of false positives among those found kept under α (the false discovery rate, for many tests)"
            options={[
              ['holm', 'Holm (step-down)'],
              ['bonferroni', 'Bonferroni'],
              ['hochberg', 'Hochberg (step-up)'],
              ['hommel', 'Hommel'],
              ['bh', 'Benjamini–Hochberg (FDR)'],
              ['by', 'Benjamini–Yekutieli (FDR, any dependence)'],
            ]}
            onChange={(method) => set({ method })}
          />
          <Alpha value={data.alpha} set={(alpha) => set({ alpha })} />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="adjusted" port="dataset" id="out" title="The table as it came, with the adjusted p and the significance beside every p" />
    </div>
  );
}

export function ContingencyNodeView({ id, data }: NodeProps<ContingencyNode>) {
  const { r, names, set } = useNode<ContingencyData>(id);
  const opts = colOpts(names);
  const gof = data.test === 'gof';
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per observation (two columns of categories), a table of counts, or counts with their two categories" />
      <NodeOptions>
        <div className="col-form">
          <span>Test</span>
          <Select<ContingencyData['test']>
            value={data.test}
            options={[
              ['independence', 'independence (χ², G, Fisher)'],
              ['mcnemar', 'McNemar (paired 2 × 2)'],
              ['gof', 'goodness of fit (one category)'],
            ]}
            onChange={(test) => set({ test })}
          />
          <span>Layout</span>
          <Select<ContingencyData['layout']>
            value={data.layout}
            options={[
              ['raw', 'a row per observation'],
              ['table', 'a table of counts'],
              ['counts', 'counts with their categories'],
            ]}
            onChange={(layout) => set({ layout })}
          />
          {data.layout === 'table' ? (
            <>
              <span>Row names</span>
              <Select value={data.rowCol} title="The column of the rows' names (auto: the first text column)" options={colOpts(names, 'auto')} onChange={(rowCol) => set({ rowCol })} />
              <span>Counts</span>
              <ColumnsPicker value={data.cols} names={names} auto="auto: every numeric column" title={gof ? 'The column of the observed counts' : 'The columns of the counts: a column of the table each'} onChange={(cols) => set({ cols })} />
            </>
          ) : (
            <>
              <span>{gof ? 'Category' : 'Rows'}</span>
              <Select value={data.rowCol} title={gof ? 'The category of every observation' : 'The category that makes the rows (the groups: exposed or not, treatment …)'} options={opts} onChange={(rowCol) => set({ rowCol })} />
              {!gof && (
                <>
                  <span>Columns</span>
                  <Select value={data.colCol} title="The category that makes the columns (the outcome: event or not, answer …)" options={opts} onChange={(colCol) => set({ colCol })} />
                </>
              )}
              {data.layout === 'counts' && (
                <>
                  <span>Count</span>
                  <Select value={data.count} options={opts} onChange={(count) => set({ count })} />
                </>
              )}
            </>
          )}
          {gof && (
            <>
              <span>Expected</span>
              <Select value={data.expected} title="The proportions (or counts) expected for every category; equal: the same for all" options={colOpts(names, 'equal')} onChange={(expected) => set({ expected })} />
            </>
          )}
          <Alpha value={data.alpha} set={(alpha) => set({ alpha })} />
        </div>
        {!gof && <Check label="continuity correction (2 × 2)" title="Yates's correction of χ² (independence) and the continuity correction of McNemar's χ²" value={data.yates} onChange={(yates) => set({ yates })} />}
        <div className="hint">2 × 2: the odds ratio and the risks are of the first column (the event) in the first row against the second row.</div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="tests" port="dataset" id="out" title="Every test: statistic, df, p, significant" />
      {!gof && <OutPort label="measures" port="dataset" id="measures" title="Cramér's V; 2 × 2: φ, the odds ratio, the relative risk, the risk difference with their CI" />}
      <OutPort label="cells" port="dataset" id="cells" title="Every cell: observed, expected, the % of its row, column and the total, the adjusted residual (over ±2: the cells that make the difference)" />
      {!gof && <OutPort label="table" port="dataset" id="table" title="The table of the counts with its totals" />}
    </div>
  );
}

export function RocNodeView({ id, data }: NodeProps<RocNode>) {
  const { r, names, set } = useNode<RocData>(id);
  const levels = r?.view.levels?.truth ?? [];
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per case: its true class and its score(s)" />
      <NodeOptions>
        <div className="col-form">
          <span>True class</span>
          <Select value={data.truth} title="The column of the true class (two values: diseased or not, 1 or 0 …)" options={colOpts(names)} onChange={(truth) => set({ truth })} />
          <span>Positive</span>
          <Select value={data.positive} title="The class that is positive (auto: 1, yes, positive, case … else the second)" options={colOpts(levels, 'auto')} onChange={(positive) => set({ positive })} />
          <span>Scores</span>
          <ColumnsPicker value={data.scores} names={names} auto="auto: every numeric column" title="The scores (the test's values): a curve each; two or more: compared" onChange={(scores) => set({ scores })} />
          <span>Direction</span>
          <Select<RocData['dir']>
            value={data.dir}
            title="Which way the score points to positive: auto (from the medians of the two classes), higher or lower"
            options={[
              ['auto', 'auto'],
              ['higher', 'higher = positive'],
              ['lower', 'lower = positive'],
            ]}
            onChange={(dir) => set({ dir })}
          />
          <span>Best threshold</span>
          <Select<RocData['cutoff']>
            value={data.cutoff}
            options={[
              ['youden', 'Youden (sensitivity + specificity)'],
              ['closest', 'nearest to the top-left corner'],
              ['sens', 'a sensitivity reached'],
              ['spec', 'a specificity reached'],
            ]}
            onChange={(cutoff) => set({ cutoff })}
          />
          {(data.cutoff === 'sens' || data.cutoff === 'spec') && (
            <>
              <span>at least</span>
              <NumInput className="short" min={0} max={1} step={0.05} value={data.target} title="The sensitivity (or specificity) wanted, 0 … 1" onChange={(target) => set({ target: Math.min(1, Math.max(0, target)) })} />
            </>
          )}
          <Alpha value={data.alpha} set={(alpha) => set({ alpha })} />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="AUC" port="dataset" id="out" title="Every score: AUC, its SE (DeLong), CI, p against 0.5" />
      <OutPort label="curves" port="dataset" id="curves" title="1 − specificity (X) and sensitivity (Y) of every score: to a Plot" />
      <OutPort label="thresholds" port="dataset" id="thresholds" title="Every threshold: sensitivity, specificity, PPV, NPV, accuracy, Youden's J, LR+, LR−" />
      <OutPort label="optimal" port="dataset" id="optimal" title="The best threshold of every score with its confusion matrix" />
      <OutPort label="compare" port="dataset" id="compare" title="Two scores or more: the difference of every two AUCs, DeLong's test" />
    </div>
  );
}

export function SurvivalNodeView({ id, data }: NodeProps<SurvivalNode>) {
  const { r, names, set } = useNode<SurvivalData>(id);
  const opts = colOpts(names);
  const levels = r?.view.levels?.event ?? [];
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per subject: the time, whether the event happened (else censored), the group" />
      <NodeOptions>
        <div className="col-form">
          <span>Time</span>
          <Select value={data.time} title="The time to the event, or to the last follow-up (censored)" options={opts} onChange={(time) => set({ time })} />
          <span>Event</span>
          <Select value={data.event} title="Whether the event happened (1) or the subject was censored (0: lost, the study ended)" options={opts} onChange={(event) => set({ event })} />
          <span>Event is</span>
          <Select value={data.eventIs} title="The value that means the event (auto: any number but 0; yes, dead, event …)" options={colOpts(levels, 'auto')} onChange={(eventIs) => set({ eventIs })} />
          <span>Group</span>
          <Select value={data.group} title="The groups compared (a curve each); none: one curve" options={colOpts(names, 'none')} onChange={(group) => set({ group })} />
          <span>Test</span>
          <Select<SurvivalData['test']>
            value={data.test}
            title="Log-rank: every time alike; Gehan–Breslow–Wilcoxon: the early times weigh more (the number at risk); Tarone–Ware: between them"
            options={[
              ['logrank', 'log-rank (Mantel–Cox)'],
              ['gehan', 'Gehan–Breslow–Wilcoxon'],
              ['tarone', 'Tarone–Ware'],
            ]}
            onChange={(test) => set({ test })}
          />
          <span>Interval</span>
          <Select<SurvivalData['ci']> seg
            value={data.ci}
            title="The interval of S(t) from Greenwood's variance: on the log–log scale (within 0 … 1, the usual), log or plain"
            options={[
              ['loglog', 'log–log'],
              ['log', 'log'],
              ['plain', 'plain'],
            ]}
            onChange={(ci) => set({ ci })}
          />
          <span>Times</span>
          <TextInput value={data.at} placeholder="auto: round" title="The times of S(t) in the summary and of the numbers at risk (e.g. 0, 12, 24, 36)" onChange={(at) => set({ at })} />
          <Alpha value={data.alpha} set={(alpha) => set({ alpha })} />
        </div>
        <Check label="every two groups compared (Holm)" title="Three groups or more: the test of every pair, its p adjusted by Holm" value={data.pairs} onChange={(pairs) => set({ pairs })} />
        <div className="hint">To a Plot: the curves output, Time as X and Survival as Y in the step mode; the censored output as + symbols; Lower and Upper: the interval (dashed).</div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="test" port="dataset" id="out" title="The comparison of the curves (and of every two groups); one group: the summary" />
      <OutPort label="curves" port="dataset" id="curves" title="Every group: Time (X), Survival (Y), Lower, Upper, from (0, 1): to a Plot as steps" />
      <OutPort label="censored" port="dataset" id="censored" title="The censored times on their curve (the + marks)" />
      <OutPort label="summary" port="dataset" id="summary" title="Every group: N, events, censored, the median survival with its CI, S at the times" />
      <OutPort label="at risk" port="dataset" id="atrisk" title="The number at risk of every group at the times" />
      <OutPort label="hazard ratio" port="dataset" id="hazard" title="Two groups: the hazard ratio of the second to the first (Mantel–Haenszel) with its CI" />
    </div>
  );
}

export function RegressNodeView({ id, data }: NodeProps<RegressNode>) {
  const { r, names, set } = useNode<RegressData>(id);
  const factors = r?.view.levels ?? {};
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per observation: Y and the predictors (numbers, or categories)" />
      <NodeOptions>
        <div className="col-form">
          <span>Y</span>
          <Select value={data.y} title="The column explained" options={colOpts(names)} onChange={(y) => set({ y })} />
          <span>Predictors</span>
          <ColumnsPicker value={data.xs} names={names} auto="choose" title="The columns that explain Y (a list: B, C, names …)" onChange={(xs) => set({ xs })} />
          <span>Categories</span>
          <ColumnsPicker value={data.factors} names={names} auto="only the text columns" title="The predictors read as categories (dose 0, 10, 20 as groups); text columns always are" onChange={(factors) => set({ factors })} />
          {Object.entries(factors).map(([f, lv]) => (
            <Fragment key={f}>
              <span>Reference of {f}</span>
              <Select value={data.refs?.[f] ?? ''} title={`The level of ${f} the others are compared with`} options={colOpts(lv, 'the first in order')} onChange={(v) => set({ refs: { ...data.refs, [f]: v || undefined } as Record<string, string> })} />
            </Fragment>
          ))}
          <span>Weights</span>
          <Select value={data.weights} title="A column of σ: every row weighted 1/σ² (weighted least squares); none: all alike" options={colOpts(names, 'none')} onChange={(weights) => set({ weights })} />
          <Alpha value={data.alpha} set={(alpha) => set({ alpha })} />
        </div>
        <div className="row wrap">
          <Check label="interactions (every two)" title="The effect of one predictor changes with another: their products (a factor and a number: ANCOVA with different slopes)" value={data.interact} onChange={(interact) => set({ interact })} />
          <Check label="intercept" title="A constant in the model (without: the line through 0)" value={data.intercept} onChange={(intercept) => set({ intercept })} />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="coefficients" port="dataset" id="out" title="Every term: estimate, SE, t, p, CI, standardized β, VIF" />
      <OutPort label="ANOVA" port="dataset" id="anova" title="Every predictor (Type II): SS, df, MS, F, p; the residual" />
      <OutPort label="model" port="dataset" id="model" title="R², adjusted R², RMSE, F and p, AIC, BIC, Durbin–Watson, Breusch–Pagan, Shapiro–Wilk of the residuals" />
      <OutPort label="fitted" port="dataset" id="fitted" title="Every row: Y, predicted (X), residual (Y): a residual plot; studentized residual, leverage, Cook's distance, influential" />
    </div>
  );
}
