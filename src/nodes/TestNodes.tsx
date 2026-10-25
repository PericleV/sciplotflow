// The statistics nodes (Normality & outliers, t-tests, ANOVA, Nonparametric, Correlation): how the data are laid out,
// the test and its options, the report in words, the main table, the outputs.
import type { ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { NodeResult } from '../engine/evaluate.ts';
import type { StatInput, StatLayout } from '../engine/statnodes.ts';
import type { AnovaData, AnovaNode, CorrData, CorrNode, NonparData, NonparNode, NormData, NormNode, TTestData, TTestNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { useNode } from './useStatNode.ts';

const LAYOUTS: Record<StatLayout, string> = { columns: 'each group a column', indexed: 'a value column + factors', subjects: 'a row per subject' };
const LAYOUT_HINT: Record<StatLayout, string> = {
  columns: 'Each group in its own column (Control | 10 mg | 20 mg …); empty cells are left out.',
  indexed: 'Every row one measurement: the value, and the group it belongs to (text or numbers) in the factor column(s).',
  subjects: 'A row per subject, a column per condition (Before | 1 h | 24 h); a row with a missing value is left out.',
};

// the data: the layout (those allowed), the columns or the value and factor columns, α
// twoFactors: factor B too (optional: “factor B (optional)”); subject: the column of the subjects (repeated measures)
function DataSection<T extends StatInput & { subject?: string }>({ data, set, names, layouts, twoFactors = false, optionalB = false, subject = false }: { data: T; set: (p: Partial<T>) => void; names: string[]; layouts: StatLayout[]; twoFactors?: boolean; optionalB?: boolean; subject?: boolean }) {
  const layout = layouts.includes(data.layout) ? data.layout : layouts[0];
  const opts: [string, string][] = [['', 'choose'], ...names.map((n): [string, string] => [n, n])];
  return (
    <details open>
      <summary>Data</summary>
      <div className="col-form">
        <span>Layout</span>
        {layouts.length > 1 ? <Select<StatLayout> value={layout} options={layouts.map((l): [StatLayout, string] => [l, LAYOUTS[l]])} onChange={(l) => set({ layout: l } as Partial<T>)} /> : <span className="muted">{LAYOUTS[layout]}</span>}
        {layout === 'indexed' ? (
          <>
            <span>Value</span>
            <Select value={data.value} options={opts} onChange={(value) => set({ value } as Partial<T>)} />
            <span>{twoFactors ? 'Factor A' : 'Factor'}</span>
            <Select value={data.factor} options={opts} onChange={(factor) => set({ factor } as Partial<T>)} />
            {twoFactors && (
              <>
                <span>{optionalB ? 'Factor B (optional)' : 'Factor B'}</span>
                <Select value={data.factor2 ?? ''} options={optionalB ? [['', 'none'], ...opts.slice(1)] : opts} onChange={(factor2) => set({ factor2 } as Partial<T>)} />
              </>
            )}
            {subject && (
              <>
                <span title="The column that says which subject (animal, patient, plate …) every value is of">Subject</span>
                <Select value={data.subject ?? ''} options={opts} onChange={(sv) => set({ subject: sv } as Partial<T>)} />
              </>
            )}
          </>
        ) : (
          <>
            <span>Columns</span>
            <ColumnsPicker value={data.cols} names={names} auto="auto: every numeric column" title="One column, or several (a list: 2, B-D, names, A*); auto: every numeric column (but those designated –)" onChange={(cols) => set({ cols } as Partial<T>)} />
          </>
        )}
        <span>α</span>
        <NumInput className="short" value={data.alpha} step={0.01} min={0.0001} max={0.5} title="The significance level (0.05: 95 % confidence)" onChange={(alpha) => set({ alpha: Math.min(0.5, Math.max(0.0001, alpha || 0.05)) } as Partial<T>)} />
      </div>
      <div className="hint">{LAYOUT_HINT[layout]}</div>
    </details>
  );
}
function Report({ r }: { r?: NodeResult }) {
  const lines = r?.view.report ?? [];
  return lines.length ? (
    <div className="stat-report">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  ) : null;
}
export function Main({ r, children }: { r?: NodeResult; children?: ReactNode }) {
  const out = r?.outputs.out;
  // in the node: the report in words; the table of the results in the panel
  return (
    <>
      <Report r={r} />
      <NodeOptions>
        {out?.t === 'dataset' && out.v.columns.length > 0 && <DataPreview columns={out.v.columns} rows={8} />}
        {children}
        <Messages result={r} />
      </NodeOptions>
      <Messages result={r} />
    </>
  );
}
const ALT: [TTestData['alt'], string][] = [
  ['two-sided', 'two-sided (≠)'],
  ['less', 'one-sided (<)'],
  ['greater', 'one-sided (>)'],
];
// the power of the test and the size needed for a target power
function PowerRow({ power, target, set, what }: { power?: boolean; target?: number; set: (p: { power?: boolean; target?: number }) => void; what: string }) {
  return (
    <div className="row wrap">
      <Check label="Power and sample size" title={`The power of the test at the effect found (${what}) (the chance of finding it when it is there), and the size needed for the target power`} value={!!power} onChange={(p) => set({ power: p || undefined })} />
      {power && (
        <Field label="target" title="The power wanted (0.8: an effect of this size found 4 times in 5)">
          <NumInput className="tiny" min={0.1} max={0.99} step={0.05} value={target ?? 0.8} onChange={(t) => set({ target: t > 0 && t < 1 ? t : undefined })} />
        </Field>
      )}
    </div>
  );
}

export function NormNodeView({ id, data }: NodeProps<NormNode>) {
  const { r, names, set } = useNode<NormData>(id);
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="The groups as columns, or a value column with a factor column" />
      <NodeOptions>
      <DataSection data={data} set={set} names={names} layouts={['columns', 'indexed']} />
      <div className="row">
        <Field label="Outliers" title="Grubbs: the value farthest from the mean (approximately normal data); Dixon's Q: 3 to 10 values">
          <Select<NormData['outliers']> seg
            value={data.outliers}
            options={[
              ['none', 'no test'],
              ['grubbs', 'Grubbs'],
              ['dixon', "Dixon's Q"],
            ]}
            onChange={(outliers) => set({ outliers })}
          />
        </Field>
      </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="tests" port="dataset" id="out" title="A row per group and test: statistic, p, significant at α" />
      <OutPort label="outliers" port="dataset" id="outliers" />
      <OutPort label="groups" port="dataset" id="groups" title="N, mean, SE, SD, CI, median, min, max of every group (mean ± SE ready for a Plot)" />
    </div>
  );
}

export function TTestNodeView({ id, data }: NodeProps<TTestNode>) {
  const { r, names, set } = useNode<TTestData>(id);
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="Two columns (or a value column with a factor of two levels); paired: a row per subject" />
      <NodeOptions>
      <div className="row wrap">
        <Field label="Test">
          <Select<TTestData['test']>
            value={data.test}
            options={[
              ['one', 'one sample (against μ)'],
              ['two', 'two independent samples'],
              ['paired', 'paired (same subjects)'],
            ]}
            onChange={(test) => set({ test, ...(test === 'paired' ? { layout: 'subjects' as const } : data.layout === 'subjects' ? { layout: 'columns' as const } : {}) })}
          />
        </Field>
        {data.test === 'one' && (
          <Field label="μ" title="The value the mean is compared with">
            <NumInput className="short" value={data.mu} onChange={(mu) => set({ mu })} />
          </Field>
        )}
        {data.test === 'two' && <Check label="Equal variances (Student)" title="Off: Welch's t (unequal variances): the safer choice" value={data.equalVar} onChange={(equalVar) => set({ equalVar })} />}
        <Select value={data.alt} options={ALT} onChange={(alt) => set({ alt })} title="Two-sided: a difference either way; one-sided: the first group (or the mean) less / greater" />
      </div>
      <PowerRow power={data.power} target={data.target} set={(p) => set(p)} what="Cohen's d" />
      <DataSection data={data} set={set} names={names} layouts={data.test === 'paired' ? ['subjects'] : ['columns', 'indexed']} />
      </NodeOptions>
      <Main r={r} />
      <OutPort label="test" port="dataset" id="out" title="t, df, p, the difference with its CI, Cohen's d (two samples: also the F and Brown–Forsythe tests of the variances)" />
      <OutPort label="groups" port="dataset" id="groups" />
      {data.power && <OutPort label="power" port="dataset" id="power" title="The effect found, the power of the test at it, and the size needed for the target power" />}
    </div>
  );
}

export function AnovaNodeView({ id, data }: NodeProps<AnovaNode>) {
  const { r, names, set } = useNode<AnovaData>(id);
  const rm = data.design === 'repeated';
  // two-way with repeated measures, the mixed model: indexed data with the subjects
  const subj = data.design === 'two-rm' || data.design === 'mixed';
  // the groups found (for the control of Dunnett)
  const gout = r?.outputs.groups;
  const groupNames = gout?.t === 'dataset' ? (gout.v.columns[0]?.text ?? []) : [];
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="One-way: the groups as columns or indexed; two-way: indexed (value, factor A, factor B); repeated: a row per subject" />
      <NodeOptions>
      <div className="row wrap">
        <Field label="Design">
          <Select<AnovaData['design']>
            value={data.design}
            options={[
              ['one', 'one-way'],
              ['two', 'two-way (with interaction)'],
              ['repeated', 'repeated measures (one-way)'],
              ['two-rm', 'two-way, repeated measures'],
              ['mixed', 'mixed-effects model (REML)'],
            ]}
            onChange={(design) => set({ design, layout: design === 'two' || design === 'two-rm' || design === 'mixed' ? 'indexed' : design === 'repeated' ? 'subjects' : data.layout === 'subjects' ? 'columns' : data.layout })}
          />
        </Field>
        {data.design === 'one' && <Check label="Welch (unequal variances)" value={data.welch} onChange={(welch) => set({ welch })} />}
        {data.design === 'two-rm' && (
          <Field label="Repeated" title="Which factor is measured on every subject: B (A between the subjects: groups of subjects, a mixed design), or both">
            <Select<NonNullable<AnovaData['within']>>
              value={data.within ?? 'b'}
              options={[
                ['b', 'B within, A between (groups)'],
                ['both', 'both factors within'],
              ]}
              onChange={(within) => set({ within })}
            />
          </Field>
        )}
        {!subj && (
        <Field label="Post hoc" title="Every pair of groups compared (or every group against a control), the p adjusted for the number of comparisons">
          <Select<AnovaData['post']>
            value={rm && !['holm', 'bonferroni', 'dunnett', 'none'].includes(data.post) ? 'holm' : data.post}
            options={
              rm
                ? [
                    ['holm', 'paired t, Holm'],
                    ['bonferroni', 'paired t, Bonferroni'],
                    ['dunnett', 'Dunnett (against a control)'],
                    ['none', 'none'],
                  ]
                : [
                    ['tukey', 'Tukey HSD'],
                    ['dunnett', 'Dunnett (against a control)'],
                    ['games-howell', 'Games–Howell (unequal variances)'],
                    ['bonferroni', 'Bonferroni'],
                    ['holm', 'Holm'],
                    ['scheffe', 'Scheffé'],
                    ['lsd', 'Fisher LSD (unadjusted)'],
                    ['none', 'none'],
                  ]
            }
            onChange={(post) => set({ post })}
          />
        </Field>
        )}
        {!subj && data.post === 'dunnett' && (
          <Field label="Control" title="The group every other is compared with">
            <Select<string> value={data.control ?? ''} options={[['', `first${groupNames[0] ? ` (${groupNames[0]})` : ''}`], ...groupNames.map((n): [string, string] => [n, n])]} onChange={(control) => set({ control: control || undefined })} />
          </Field>
        )}
      </div>
      {data.design === 'one' && <PowerRow power={data.power} target={data.target} set={(p) => set(p)} what="Cohen's f" />}
      <DataSection data={data} set={set} names={names} layouts={data.design === 'two' || subj ? ['indexed'] : rm ? ['subjects'] : ['columns', 'indexed']} twoFactors={data.design === 'two' || subj} optionalB={data.design === 'mixed'} subject={subj} />
      {subj && <div className="hint">{data.design === 'mixed' ? 'A linear mixed model, as Prism fits for repeated measures with values missing: a random intercept per subject (REML), the fixed effects by Type III F tests with Satterthwaite’s degrees of freedom; every value of every subject used.' : 'Every subject measured at every level of B (both within: at every combination); Greenhouse–Geisser and Huynh–Feldt corrections for sphericity. Values missing: use the mixed-effects model.'}</div>}
      </NodeOptions>
      <Main r={r} />
      <OutPort label="ANOVA" port="dataset" id="out" title="Source, SS, df, MS, F, p, partial η²" />
      <OutPort label="post hoc" port="dataset" id="posthoc" title="Every pair: difference, SE, statistic, adjusted p, CI, significant" />
      <OutPort label="groups" port="dataset" id="groups" title="Every group (cell): N, mean, SE, SD, CI …; mean ± SE ready for a Plot" />
      <OutPort label="checks" port="dataset" id="checks" title="Equal variances (Brown–Forsythe), normal residuals (Shapiro–Wilk), sphericity (Mauchly)" />
      {data.power && data.design === 'one' && <OutPort label="power" port="dataset" id="power" title="The effect found (Cohen's f), the power of the test at it, and the size needed for the target power" />}
    </div>
  );
}

export function NonparNodeView({ id, data }: NodeProps<NonparNode>) {
  const { r, names, set } = useNode<NonparData>(id);
  const t = data.test;
  const layouts: StatLayout[] = t === 'friedman' ? ['subjects'] : t === 'wilcoxon' || t === 'sign' ? ['subjects', 'columns'] : ['columns', 'indexed'];
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="Groups as columns or indexed; paired and Friedman: a row per subject" />
      <NodeOptions>
      <div className="row wrap">
        <Field label="Test">
          <Select<NonparData['test']>
            value={t}
            options={[
              ['mw', 'Mann–Whitney U (2 groups)'],
              ['kruskal', 'Kruskal–Wallis (2+ groups)'],
              ['wilcoxon', 'Wilcoxon signed-rank'],
              ['sign', 'sign test'],
              ['friedman', 'Friedman (repeated)'],
            ]}
            onChange={(test) => set({ test, layout: test === 'friedman' ? 'subjects' : (test === 'wilcoxon' || test === 'sign') && data.layout === 'indexed' ? 'subjects' : (test === 'mw' || test === 'kruskal') && data.layout === 'subjects' ? 'columns' : data.layout })}
          />
        </Field>
        {(t === 'wilcoxon' || t === 'sign') && data.layout === 'columns' && (
          <Field label="Median μ" title="One sample: the median it is compared with">
            <NumInput className="short" value={data.mu} onChange={(mu) => set({ mu })} />
          </Field>
        )}
        {(t === 'mw' || t === 'wilcoxon') && <Select value={data.alt} options={ALT} onChange={(alt) => set({ alt })} />}
        {t === 'kruskal' && (
          <Field label="Post hoc">
            <Select<NonparData['post']>
              value={data.post}
              options={[
                ['holm', 'Dunn, Holm'],
                ['bonferroni', 'Dunn, Bonferroni'],
                ['none', 'none'],
              ]}
              onChange={(post) => set({ post })}
            />
          </Field>
        )}
      </div>
      <DataSection data={data} set={set} names={names} layouts={layouts} />
      {(t === 'wilcoxon' || t === 'sign') && <div className="hint">A row per subject: paired (two columns). Each group a column: one sample against the median μ.</div>}
      </NodeOptions>
      <Main r={r} />
      <OutPort label="test" port="dataset" id="out" />
      <OutPort label="post hoc" port="dataset" id="posthoc" title="Kruskal–Wallis: Dunn's comparisons" />
      <OutPort label="groups" port="dataset" id="groups" title="N, median, quartiles (and mean rank)" />
    </div>
  );
}

export function CorrNodeView({ id, data }: NodeProps<CorrNode>) {
  const { r, names, set } = useNode<CorrData>(id);
  return (
    <div className="node node-stattest">
      <InPort label="dataset" port="dataset" id="in" title="Two columns or more: every pair correlated" />
      <NodeOptions>
      <div className="col-form">
        <span>Columns</span>
        <ColumnsPicker value={data.cols} names={names} auto="auto: every numeric column" onChange={(cols) => set({ cols })} />
        <span>Method</span>
        <Select<CorrData['method']>
          value={data.method}
          options={[
            ['pearson', 'Pearson r (linear)'],
            ['spearman', 'Spearman ρ (ranks)'],
            ['kendall', 'Kendall τ-b (ranks)'],
          ]}
          onChange={(method) => set({ method })}
        />
        <span>α</span>
        <NumInput className="short" value={data.alpha} step={0.01} onChange={(alpha) => set({ alpha: Math.min(0.5, Math.max(0.0001, alpha || 0.05)) })} />
        <span>Matrix order</span>
        <Select<'given' | 'cluster'>
          value={data.order ?? 'given'}
          title="The columns of the matrix as given, or ordered by a clustering of 1 − |r| (average linkage): related columns next to each other; for a correlation map"
          options={[
            ['given', 'as given'],
            ['cluster', 'clustered (related together)'],
          ]}
          onChange={(order) => set({ order: order === 'given' ? undefined : order })}
        />
      </div>
      <div className="row wrap">
        <Check label="Principal components (PCA)" title="The directions of the largest variance: the eigenvalues and the % of the variance each explains, the loadings of the columns, the scores of every complete row (a biplot: the scores PC1 against PC2)" value={!!data.pca} onChange={(pca) => set({ pca: pca || undefined })} />
        {data.pca && (
          <Select<'corr' | 'cov'>
            value={data.pcaOn ?? 'corr'}
            title="Of the correlations (every column standardized: different units), or of the covariances (the same units)"
            options={[
              ['corr', 'of the correlations'],
              ['cov', 'of the covariances'],
            ]}
            onChange={(pcaOn) => set({ pcaOn })}
          />
        )}
      </div>
      </NodeOptions>
      <Main r={r} />
      <OutPort label="pairs" port="dataset" id="out" title="Every pair: r, p, N (Pearson: its CI), significant" />
      <OutPort label="matrix" port="dataset" id="matrix" title="The matrix of r (in the order chosen)" />
      {data.pca && <OutPort label="components" port="dataset" id="pca" title="Every component: its eigenvalue, % of the variance, cumulative %" />}
      {data.pca && <OutPort label="loadings" port="dataset" id="loadings" title="Every column: its loading on each component" />}
      {data.pca && <OutPort label="scores" port="dataset" id="scores" title="Every complete row: its scores on the components (PC1 X, PC2 Y: a scores plot)" />}
    </div>
  );
}
