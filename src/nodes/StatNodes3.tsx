// The nodes of the third statistics package (Power & sample size, Bootstrap & permutation, Distribution fit,
// Agreement & reliability, Method comparison, Logistic regression): their data and options, the report in words, the
// main table, the outputs.
import { Fragment } from 'react';
import type { NodeProps } from '@xyflow/react';
import { DIST_LABEL, EFFECT_NAMES, perGroup, type AgreeData, type DistFitData, type FitDist, type LogisticData, type MethCompData, type PowerData, type ResampleData } from '../engine/statnodes3.ts';
import type { AgreeNode, DistFitNode, LogisticNode, MethCompNode, PowerNode, ResampleNode } from '../types.ts';
import { Check, InPort, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { Main } from './TestNodes.tsx';
import { useNode } from './useStatNode.ts';

const colOpts = (names: string[], none = 'choose'): [string, string][] => [['', none], ...names.map((n): [string, string] => [n, n])];
const Level = ({ value, set }: { value: number; set: (v: number) => void }) => (
  <>
    <span>Confidence</span>
    <NumInput className="short" value={value} step={0.01} min={0.5} max={0.999} title="The level of the intervals (0.95: 95 %)" onChange={(v) => set(Math.min(0.999, Math.max(0.5, v || 0.95)))} />
  </>
);

export function PowerNodeView({ id, data }: NodeProps<PowerNode>) {
  const { r, set } = useNode<PowerData>(id);
  const unit = perGroup(data.test) ? (data.test === 'anova' || data.ratio === 1 ? 'n per group' : 'n (group 1)') : 'N';
  return (
    <div className="node node-stattest">
      <NodeOptions>
        <div className="col-form">
          <span>Test</span>
          <Select<PowerData['test']>
            value={data.test}
            options={[
              ['t2', 't-test, two samples'],
              ['paired', 't-test, paired'],
              ['t1', 't-test, one sample'],
              ['anova', 'one-way ANOVA'],
              ['prop', 'two proportions'],
              ['corr', 'correlation'],
              ['chi2', 'χ² (goodness of fit, table)'],
              ['logrank', 'log-rank (survival)'],
            ]}
            onChange={(test) => set({ test })}
          />
          <span>Find</span>
          <Select<PowerData['solve']>
            value={data.solve}
            title="What is found from the other two"
            options={[
              ['n', 'the size'],
              ['power', 'the power'],
              ['effect', 'the smallest effect'],
            ]}
            onChange={(solve) => set({ solve })}
          />
          {data.test === 'prop' && (
            <>
              <span>p1</span>
              <NumInput className="short" value={data.p1} step={0.05} min={0.001} max={0.999} title="The proportion in the first group (the control)" onChange={(p1) => set({ p1 })} />
            </>
          )}
          {data.solve !== 'effect' && (
            <>
              <span>{EFFECT_NAMES[data.test]}</span>
              <NumInput
                className="short"
                value={data.effect}
                step={data.test === 'logrank' ? 0.05 : 0.1}
                title={
                  {
                    t1: 'Cohen’s d: the difference in SDs (0.2 small, 0.5 medium, 0.8 large)',
                    paired: 'Cohen’s d of the differences (their mean / their SD)',
                    t2: 'Cohen’s d: the difference of the means in SDs (0.2 small, 0.5 medium, 0.8 large)',
                    anova: 'Cohen’s f: the SD of the group means / the SD within (0.1 small, 0.25 medium, 0.4 large)',
                    prop: 'The proportion in the second group',
                    corr: 'The correlation to be found (0.1 small, 0.3 medium, 0.5 large)',
                    chi2: 'Cohen’s w (0.1 small, 0.3 medium, 0.5 large)',
                    logrank: 'The hazard ratio of the second group to the first (0.7: 30 % fewer events at any time)',
                  }[data.test]
                }
                onChange={(effect) => set({ effect })}
              />
            </>
          )}
          {data.solve !== 'n' && (
            <>
              <span>{unit}</span>
              <NumInput className="short" value={data.n} step={1} min={2} onChange={(n) => set({ n: Math.max(2, Math.round(n)) })} />
            </>
          )}
          {data.solve !== 'power' && (
            <>
              <span>Power</span>
              <NumInput className="short" value={data.power} step={0.05} min={0.05} max={0.999} title="The chance of finding the effect when it is there (0.8 or 0.9)" onChange={(power) => set({ power })} />
            </>
          )}
          {(data.test === 't2' || data.test === 'prop' || data.test === 'logrank') && (
            <>
              <span>Ratio n2 / n1</span>
              <NumInput className="short" value={data.ratio} step={0.5} min={0.1} title="The second group's size to the first's (1: equal)" onChange={(ratio) => set({ ratio })} />
            </>
          )}
          {(data.test === 'anova' || data.test === 'chi2') && (
            <>
              <span>{data.test === 'anova' ? 'Groups' : 'df'}</span>
              <NumInput className="short" value={data.k} step={1} min={data.test === 'anova' ? 2 : 1} title={data.test === 'anova' ? 'The number of groups' : 'The degrees of freedom: categories − 1 (goodness of fit), (rows − 1)(columns − 1) (a table)'} onChange={(k) => set({ k: Math.round(k) })} />
            </>
          )}
          {data.test === 'logrank' && (
            <>
              <span>With the event</span>
              <NumInput className="short" value={data.events} step={0.05} min={0.01} max={1} title="The share of all the subjects expected to reach the event during the study" onChange={(events) => set({ events })} />
            </>
          )}
          <span>α</span>
          <NumInput className="short" value={data.alpha} step={0.01} min={0.0001} max={0.5} onChange={(alpha) => set({ alpha })} />
          <span>Sides</span>
          <Select<PowerData['alt']> seg
            value={data.alt}
            options={[
              ['two-sided', 'two-sided'],
              ['one-sided', 'one-sided'],
            ]}
            onChange={(alt) => set({ alt })}
          />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="result" port="dataset" id="out" title="The test, α, the effect, the size, the power (the one found marked)" />
      <OutPort label="power curve" port="dataset" id="curve" title="The power against the size: to a Plot" />
    </div>
  );
}

export function ResampleNodeView({ id, data }: NodeProps<ResampleNode>) {
  const { r, names, set } = useNode<ResampleData>(id);
  const opts = colOpts(names);
  const two = data.stat === 'diffmean' || data.stat === 'diffmedian' || data.stat === 'ratiomean';
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="The sample(s) as columns, or a value column with a factor of two groups" />
      <NodeOptions>
        <div className="col-form">
          <span>Do</span>
          <Select<ResampleData['mode']>
            value={data.mode}
            options={[
              ['bootstrap', 'a bootstrap interval'],
              ['permutation', 'a permutation test'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          <span>Statistic</span>
          <Select<ResampleData['stat']>
            value={data.stat}
            options={[
              ['mean', 'mean'],
              ['median', 'median'],
              ['sd', 'SD'],
              ['cv', 'CV (%)'],
              ['pct', 'a percentile'],
              ['diffmean', 'difference of two means'],
              ['diffmedian', 'difference of two medians'],
              ['ratiomean', 'ratio of two means'],
              ['pearson', 'Pearson r (pairs)'],
              ['spearman', 'Spearman ρ (pairs)'],
            ]}
            onChange={(stat) => set({ stat })}
          />
          {data.stat === 'pct' && (
            <>
              <span>Percentile</span>
              <NumInput className="short" value={data.q} step={0.05} min={0.01} max={0.99} title="0.9: the 90th percentile" onChange={(q) => set({ q })} />
            </>
          )}
          <span>Layout</span>
          <Select<ResampleData['layout']>
            value={data.layout}
            options={[
              ['columns', 'each sample a column'],
              ['indexed', 'a value column + a factor'],
            ]}
            onChange={(layout) => set({ layout })}
          />
          {data.layout === 'indexed' ? (
            <>
              <span>Value</span>
              <Select value={data.value} options={opts} onChange={(value) => set({ value })} />
              <span>Factor</span>
              <Select value={data.factor} title="Two groups" options={opts} onChange={(factor) => set({ factor })} />
            </>
          ) : (
            <>
              <span>Columns</span>
              <ColumnsPicker value={data.cols} names={names} auto="auto: the first numeric" title={two ? 'Two columns: the samples compared' : 'One column (two: the pairs of a correlation)'} onChange={(cols) => set({ cols })} />
            </>
          )}
          <span>Resamples</span>
          <NumInput className="short" value={data.B} step={1000} min={99} title="How many resamples (permutations: every one when they are fewer)" onChange={(B) => set({ B: Math.round(B) })} />
          {data.mode === 'bootstrap' ? (
            <>
              <span>Interval</span>
              <Select<ResampleData['ci']>
                value={data.ci}
                title="BCa: corrected for bias and skewness (the best in general); percentile; basic"
                options={[
                  ['bca', 'BCa'],
                  ['percentile', 'percentile'],
                  ['basic', 'basic'],
                ]}
                onChange={(ci) => set({ ci })}
              />
              <Level value={data.level} set={(level) => set({ level })} />
            </>
          ) : (
            <>
              <span>Sides</span>
              <Select<ResampleData['alt']>
                value={data.alt}
                options={[
                  ['two-sided', 'two-sided'],
                  ['greater', 'one-sided (>)'],
                  ['less', 'one-sided (<)'],
                ]}
                onChange={(alt) => set({ alt })}
              />
            </>
          )}
          <span>Seed</span>
          <NumInput className="short" value={data.seed} step={1} title="The start of the random draws: the same seed, the same result" onChange={(seed) => set({ seed: Math.round(seed) })} />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="result" port="dataset" id="out" title="The estimate with its interval (bootstrap), or its p (permutation)" />
      <OutPort label="distribution" port="dataset" id="distribution" title="The resampled values: to a Histogram" />
    </div>
  );
}

const ALL_DISTS = Object.keys(DIST_LABEL) as FitDist[];
export function DistFitNodeView({ id, data }: NodeProps<DistFitNode>) {
  const { r, names, set } = useNode<DistFitData>(id);
  const on = data.dists.length ? data.dists : ALL_DISTS;
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A column of values (and a column of their status, for life data)" />
      <NodeOptions>
        <div className="col-form">
          <span>Values</span>
          <Select value={data.col} options={colOpts(names, 'auto: the first numeric')} onChange={(col) => set({ col })} />
          <span>Status</span>
          <Select value={data.censor} title="Life data: 1 / F failed, 0 / S suspended (still running when the test stopped); none: all failed" options={colOpts(names, 'none')} onChange={(censor) => set({ censor })} />
          <Level value={data.level} set={(level) => set({ level })} />
        </div>
        <div className="row wrap">
          {ALL_DISTS.map((k) => (
            <Check key={k} label={DIST_LABEL[k]} value={on.includes(k)} onChange={(v) => set({ dists: v ? [...on, k] : on.filter((q) => q !== k) })} />
          ))}
        </div>
        <div className="hint">The positive ones (Lognormal, Exponential, Weibull, Gamma) with their location at 0; Beta for values between 0 and 1.</div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="ranking" port="dataset" id="out" title="Every distribution: its parameters, log-likelihood, AIC, ΔAIC, Akaike weight, BIC, Kolmogorov–Smirnov, Anderson–Darling; the best first" />
      <OutPort label="parameters" port="dataset" id="parameters" title="Every parameter with its interval" />
      <OutPort label="curves" port="dataset" id="curves" title="The PDF (Y) and the CDF of every distribution over the values: to a Plot, over a histogram" />
    </div>
  );
}

export function AgreeNodeView({ id, data }: NodeProps<AgreeNode>) {
  const { r, names, set } = useNode<AgreeData>(id);
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per subject, a column per rater (or item)" />
      <NodeOptions>
        <div className="col-form">
          <span>Measure</span>
          <Select<AgreeData['mode']>
            value={data.mode}
            options={[
              ['kappa', 'κ: raters of categories'],
              ['icc', 'ICC: raters of numbers'],
              ['alpha', 'Cronbach’s α: the items of a scale'],
              ['ccc', 'Lin’s concordance: two measurements'],
            ]}
            onChange={(mode) => set({ mode })}
          />
          <span>Columns</span>
          <ColumnsPicker value={data.cols} names={names} auto="auto: every column" title="The raters (or items): a column each" onChange={(cols) => set({ cols })} />
          {data.mode === 'kappa' && (
            <>
              <span>Weights</span>
              <Select<AgreeData['weights']>
                value={data.weights}
                title="Ordered categories (mild < moderate < severe): a near miss counts in part, linearly or by the square of the distance (two raters)"
                options={[
                  ['none', 'none (categories)'],
                  ['linear', 'linear (ordered)'],
                  ['quadratic', 'quadratic (ordered)'],
                ]}
                onChange={(weights) => set({ weights })}
              />
            </>
          )}
          <Level value={data.level} set={(level) => set({ level })} />
        </div>
        <div className="hint">κ: two raters Cohen’s, three or more Fleiss’s. ICC: all six forms; ICC(A,1) for raters who must give the same values, ICC(C,1) when a constant shift does not matter.</div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="result" port="dataset" id="out" title="κ, the ICC, α or ρc with their intervals and tests" />
      {data.mode === 'kappa' && <OutPort label="table" port="dataset" id="table" title="Two raters: the table of their ratings" />}
      {data.mode === 'alpha' && <OutPort label="items" port="dataset" id="items" title="Every item: mean, SD, its correlation with the rest, α without it" />}
    </div>
  );
}

export function MethCompNodeView({ id, data }: NodeProps<MethCompNode>) {
  const { r, names, set } = useNode<MethCompData>(id);
  const opts = colOpts(names);
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per sample: its value by the reference method and by the other" />
      <NodeOptions>
        <div className="col-form">
          <span>Reference (X)</span>
          <Select value={data.x} options={opts} onChange={(x) => set({ x })} />
          <span>Compared (Y)</span>
          <Select value={data.y} options={opts} onChange={(y) => set({ y })} />
          <span>Method</span>
          <Select<MethCompData['method']>
            value={data.method}
            title="Passing–Bablok: no assumption on the errors, robust to outliers; Deming: the errors of both normal, their ratio λ known"
            options={[
              ['both', 'Passing–Bablok and Deming'],
              ['pb', 'Passing–Bablok'],
              ['deming', 'Deming'],
            ]}
            onChange={(method) => set({ method })}
          />
          {data.method !== 'pb' && (
            <>
              <span>λ</span>
              <NumInput className="short" value={data.lambda} step={0.1} min={0.001} title="The ratio of the error variances of Y to X (1: the methods as precise; from their repeatability SDs: SDy² / SDx²)" onChange={(lambda) => set({ lambda })} />
            </>
          )}
          <Level value={data.level} set={(level) => set({ level })} />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="regression" port="dataset" id="out" title="Slope and intercept with their intervals (Passing–Bablok: the linearity test too)" />
      <OutPort label="lines" port="dataset" id="line" title="The lines and y = x over the range of X: to a Plot with the data" />
      <OutPort label="residuals" port="dataset" id="residuals" title="X and the residuals of every method" />
    </div>
  );
}

export function LogisticNodeView({ id, data }: NodeProps<LogisticNode>) {
  const { r, names, set } = useNode<LogisticData>(id);
  const levels = r?.view.levels ?? {};
  const outcome = levels.outcome ?? [];
  const factors = Object.entries(levels).filter(([k]) => k !== 'outcome');
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="A row per observation: the outcome (two values) and the predictors" />
      <NodeOptions>
        <div className="col-form">
          <span>Outcome (Y)</span>
          <Select value={data.y} title="Two values: yes / no, 1 / 0, died / alive …" options={colOpts(names)} onChange={(y) => set({ y })} />
          <span>Event</span>
          <Select value={data.positive} title="The value whose probability is modelled (auto: 1, yes, event … else the second)" options={colOpts(outcome, 'auto')} onChange={(positive) => set({ positive })} />
          <span>Predictors</span>
          <ColumnsPicker value={data.xs} names={names} auto="choose" onChange={(xs) => set({ xs })} />
          <span>Categories</span>
          <ColumnsPicker value={data.factors} names={names} auto="only the text columns" title="The predictors read as categories; text columns always are" onChange={(factors) => set({ factors })} />
          {factors.map(([f, lv]) => (
            <Fragment key={f}>
              <span>Reference of {f}</span>
              <Select value={data.refs?.[f] ?? ''} options={colOpts(lv, 'the first in order')} onChange={(v) => set({ refs: { ...data.refs, [f]: v || undefined } as Record<string, string> })} />
            </Fragment>
          ))}
          <span>Threshold</span>
          <NumInput className="short" value={data.threshold} step={0.05} min={0.01} max={0.99} title="A row is predicted the event when its probability is at least this" onChange={(threshold) => set({ threshold })} />
          <span>α</span>
          <NumInput className="short" value={data.alpha} step={0.01} min={0.0001} max={0.5} onChange={(alpha) => set({ alpha })} />
        </div>
        <div className="row wrap">
          <Check label="interactions (every two)" value={data.interact} onChange={(interact) => set({ interact })} />
          <Check label="intercept" value={data.intercept} onChange={(intercept) => set({ intercept })} />
        </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="coefficients" port="dataset" id="out" title="Every term: estimate, SE, z, p, CI, the odds ratio with its CI" />
      <OutPort label="model" port="dataset" id="model" title="Log-likelihoods, the LR test, pseudo-R² (McFadden, Cox–Snell, Nagelkerke), AIC, BIC, Hosmer–Lemeshow" />
      <OutPort label="classification" port="dataset" id="classification" title="Observed against predicted at the threshold, % correct" />
      <OutPort label="fitted" port="dataset" id="fitted" title="Every row: observed, probability, predicted, residuals (Observed and Probability to a ROC curve)" />
    </div>
  );
}
