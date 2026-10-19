// Filter & sort rows, Clean data: the settings, the report, the rows that come out.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { AppNode, CleanData, CleanNode, FilterData, FilterNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Y_AUTO } from './xAuto.ts';
import { RowSelectControls } from './StatsNodes.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';

function useNode<T>(id: string) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  return { r, names: (r?.view.available ?? []).map((c) => c.name), set: (p: Partial<T>) => updateNodeData(id, p as Record<string, unknown>) };
}

export function FilterNodeView({ id, data }: NodeProps<FilterNode>) {
  const { r, names, set } = useNode<FilterData>(id);
  const out = r?.outputs.out;
  const cols: [string, string][] = names.map((n) => [n, n]);
  return (
    <div className="node node-clean">
      <InPort label="dataset" port="dataset" id="in" title="The rows of this dataset (every column with them)" />
      <RowSelectControls value={data.rows} onChange={(rows) => set({ rows })} hasX result={r} />
      <NodeOptions>
      <div className="col-form">
        <span>Repeated</span>
        <span className="row">
          <Select<FilterData['dup']>
            value={data.dup}
            options={[
              ['keep', 'kept'],
              ['first', 'only the first'],
              ['mean', 'merged (averaged)'],
            ]}
            onChange={(dup) => set({ dup })}
          />
          {data.dup !== 'keep' && (
            <>
              <span>Values of</span>
              <Select value={data.dupCol} options={[['', 'the X'], ...cols]} onChange={(dupCol) => set({ dupCol })} />
            </>
          )}
        </span>
        <span>Sort by</span>
        <span className="row">
          <Select value={data.sortBy} options={[['', 'not sorted'], ...cols]} onChange={(sortBy) => set({ sortBy })} />
          {data.sortBy && <Check label="Descending" value={data.desc} onChange={(desc) => set({ desc })} />}
        </span>
        <span>Keep</span>
        <span className="row">
          <span>One row in every</span>
          <NumInput className="tiny" min={1} step={1} value={data.every} onChange={(every) => set({ every: Math.max(1, Math.floor(every) || 1) })} />
        </span>
      </div>
      {(r?.view.report ?? []).map((l, i) => (
        <div key={i} className="hint">
          {l}
        </div>
      ))}
      {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={5} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" id="out" title="The rows kept, merged, sorted, thinned (every column)" />
    </div>
  );
}

export function CleanNodeView({ id, data }: NodeProps<CleanNode>) {
  const { r, names, set } = useNode<CleanData>(id);
  const out = r?.outputs.out;
  const o = data.outliers;
  return (
    <div className="node node-clean">
      <InPort label="dataset" port="dataset" id="in" title="X and the columns to clean" />
      <NodeOptions>
      <div className="col-form">
        <span>Columns</span>
        <ColumnsPicker value={data.cols} names={names} auto={Y_AUTO} title="The columns cleaned: one, or several (a list: 2, B-D, names, A*); auto: the designated Y" onChange={(cols) => set({ cols })} />
        <span>Missing</span>
        <span className="row">
          <Select<CleanData['missing']>
            value={data.missing}
            options={[
              ['keep', 'kept as they are'],
              ['remove', 'their rows removed'],
              ['linear', 'filled: straight lines'],
              ['spline', 'filled: spline'],
              ['previous', 'filled: the previous value'],
              ['next', 'filled: the next value'],
              ['constant', 'filled: a constant'],
              ['movmean', 'filled: the mean around'],
            ]}
            onChange={(missing) => set({ missing })}
          />
          {data.missing === 'constant' && <NumInput className="short" value={data.value} onChange={(value) => set({ value })} />}
        </span>
        <span>Outliers</span>
        <span className="row">
          <Select<CleanData['outliers']>
            value={o}
            options={[
              ['none', 'not looked for'],
              ['median', 'k scaled MAD from the median'],
              ['quartiles', 'k IQR beyond the quartiles'],
              ['movmedian', 'k MAD from the moving median'],
              ['grubbs', 'Grubbs (repeated)'],
              ['gesd', 'GESD (Rosner)'],
            ]}
            onChange={(outliers) => set({ outliers, k: outliers === 'quartiles' ? 1.5 : outliers === 'median' || outliers === 'movmedian' ? 3 : data.k })}
          />
          {(o === 'median' || o === 'quartiles' || o === 'movmedian') && (
            <Field label="k">
              <NumInput className="tiny" step={0.5} value={data.k} onChange={(k) => set({ k: Math.max(0.1, k || 3) })} />
            </Field>
          )}
          {(o === 'grubbs' || o === 'gesd') && (
            <Field label="α">
              <NumInput className="tiny" step={0.01} value={data.alpha} onChange={(alpha) => set({ alpha: Math.min(0.5, Math.max(0.0001, alpha || 0.05)) })} />
            </Field>
          )}
        </span>
        {(o === 'movmedian' || data.missing === 'movmean' || data.action === 'median') && (
          <>
            <span>Window</span>
            <span className="row">
              <NumInput className="tiny" min={3} step={2} value={data.window} onChange={(window) => set({ window: Math.max(3, Math.floor(window) || 5) })} />
              <span className="muted">points</span>
            </span>
          </>
        )}
        {o !== 'none' && (
          <>
            <span>Then</span>
            <Select<CleanData['action']>
              value={data.action}
              options={[
                ['mask', 'masked (kept, left out of analyses)'],
                ['remove', 'their rows removed'],
                ['linear', 'replaced: straight lines from the neighbours'],
                ['median', 'replaced: the median around'],
                ['clip', 'clipped to the bounds'],
              ]}
              onChange={(action) => set({ action })}
            />
          </>
        )}
      </div>
      {(r?.view.report ?? []).length > 0 && (
        <div className="stat-report">
          {r!.view.report!.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={4} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" id="out" title="The data cleaned" />
      <OutPort label="changes" port="dataset" id="changes" title="Every value changed: row, column, old, new, why" />
    </div>
  );
}
