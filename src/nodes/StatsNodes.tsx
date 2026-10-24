// Statistics, on columns or on rows, and the choice of the rows it works on.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { Tabs } from './fields.tsx';
import { useNodeResult } from '../engine/engine.ts';
import type { NodeResult } from '../engine/evaluate.ts';
import type { RowRange, RowSelect } from '../engine/rowsel.ts';
import { STATS } from '../engine/stats.ts';
import { fmtNum, titleOf } from '../engine/table.ts';
import type { AppNode, StatsData, StatsNode } from '../types.ts';
import { Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { WhereConds } from './RowsPanel.tsx';

const NO_RANGE: RowRange = { from: NaN, to: NaN };

// Rows: all, ranges (by row number or X value; “+ break” adds a range), a list, or where (conditions, or a formula).
export function RowSelectControls({ value, onChange, hasX, result }: { value: RowSelect | undefined; onChange: (v: RowSelect) => void; hasX: boolean; result?: NodeResult }) {
  const v = value ?? { mode: 'all' };
  const ranges = v.ranges?.length ? v.ranges : [NO_RANGE];
  const byX = v.by === 'x' && hasX;
  const setRange = (k: number, p: Partial<RowRange>) => onChange({ ...v, ranges: ranges.map((r, j) => (j === k ? { ...r, ...p } : r)) });
  const sr = result?.view.statRows;
  return (
    <div className="rowsel">
      <div className="row">
        <Field label="Rows" title="The rows used: all, ranges, a list, or where conditions are true">
          <Select<RowSelect['mode']>
            value={v.mode}
            options={[
              ['all', 'all'],
              ['range', 'range'],
              ['list', 'list'],
              ['rule', 'where'],
            ]}
            onChange={(mode) => onChange({ ...v, mode, ...(mode === 'rule' && !v.conds?.length && !v.rule?.trim() ? { conds: [{ col: hasX ? '' : ((result?.view.available ?? [])[0]?.name ?? ''), op: '>', v: NaN }] } : {}) })}
          />
        </Field>
        {v.mode === 'range' && (
          <Field label="By" title="Ranges of row numbers (1 … n), or of the values of the X column">
            <Select<'row' | 'x'>
              value={byX ? 'x' : 'row'}
              options={
                hasX
                  ? [
                      ['row', 'row number'],
                      ['x', 'X value'],
                    ]
                  : [['row', 'row number']]
              }
              onChange={(by) => onChange({ ...v, by })}
            />
          </Field>
        )}
      </div>
      {v.mode === 'range' && (
        <>
          {ranges.map((r, k) => (
            <div key={k} className="row rowsel-range">
              <span className="muted">{k ? 'and' : 'From – to'}</span>
              <NumInput value={r.from} placeholder="all" title={byX ? 'From this X value (empty: the smallest)' : 'From this row (empty: the first)'} onChange={(from) => setRange(k, { from })} />
              <span>–</span>
              <NumInput value={r.to} placeholder="all" title={byX ? 'Up to this X value (empty: the largest)' : 'Up to this row (empty: the last)'} onChange={(to) => setRange(k, { to })} />
              {ranges.length > 1 && (
                <button className="nodrag ts-btn" title="Remove this range" onClick={() => onChange({ ...v, ranges: ranges.filter((_, j) => j !== k) })}>
                  <X {...IC} />
                </button>
              )}
            </div>
          ))}
          <button className="nodrag" title="Another range: the rows of all ranges are used (the gaps between them left out)" onClick={() => onChange({ ...v, ranges: [...ranges, NO_RANGE] })}>
            + Add a range
          </button>
        </>
      )}
      {v.mode === 'list' && (
        <Field label="Rows" title="Rows: 3, 7-12, 1:2:100 (every 2nd), 50-end — rows count from 1">
          <TextInput value={v.list ?? ''} placeholder="3, 7-12, 50-end" onChange={(list) => onChange({ ...v, list })} />
        </Field>
      )}
      {v.mode === 'rule' && <WhereConds value={v} onChange={onChange} names={(result?.view.available ?? []).map((c) => c.name)} hasX={hasX} />}
      {sr && v.mode !== 'all' && (
        <div className="hint ellipsis">
          {sr.used} of {sr.of} rows{sr.text ? `: ${sr.text}` : ''}
        </div>
      )}
    </div>
  );
}

// The columns of a dataset (a list as in Auto-extract) and its X.
function ColumnChoice({ cols, x, onCols, onX, result }: { cols: string; x: string; onCols: (v: string) => void; onX: (v: string) => void; result?: NodeResult }) {
  const avail = result?.view.available ?? [];
  const used = result?.view.statCols ?? [];
  return (
    <>
      <Field label="Columns" title="The columns used: 2-4, B-D (letters), names, A* (a pattern), * all, !1 (not); empty: the Y columns (their designation), else all but X">
        <TextInput value={cols} placeholder="Y columns · e.g. B-D or A*" onChange={onCols} />
      </Field>
      {used.length > 0 && (
        <div className="hint ellipsis" title={used.map((c) => c.name).join(', ')}>
          {used.length} column{used.length > 1 ? 's' : ''}: {used.map((c) => c.name).join(', ')}
        </div>
      )}
      <Field label="X" title="The X column: for ranges by X value and x in the rule; it also goes with the results of Statistics on rows">
        <select className="nodrag" value={x} onChange={(e) => onX(e.target.value)}>
          <option value="">auto (the X designated)</option>
          <option value="-">none</option>
          {x && x !== '-' && !avail.some((c) => c.name === x) && <option value={x}>{x} (missing)</option>}
          {avail.map((c) => (
            <option key={c.name} value={c.name}>
              {titleOf(c)}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

// ---- Statistics: on columns or on rows ----

export function StatsNodeView({ id, data }: NodeProps<StatsNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<StatsData>) => updateNodeData(id, p);
  const onRows = data.on === 'rows';
  // another mode: the connections from outputs it does not have are removed
  const setOn = (on: 'columns' | 'rows') => {
    if (on === (data.on ?? 'columns')) return;
    const keep = new Set<string>([...STATS.map((s) => s.key), ...(r?.view.statExtra ?? []).map((s) => s.key), ...(on === 'rows' ? ['x', 'out'] : ['table'])]);
    setEdges((es) => es.filter((e) => e.source !== id || keep.has(e.sourceHandle ?? '')));
    set({ on });
  };
  const ofDataset = !!r?.view.available;
  // (the usual statistics, then the percentiles and the confidence interval asked)
  const statList = [...STATS, ...(r?.view.statExtra ?? [])];
  const cols = r?.view.statCols ?? [];
  const shown = cols.slice(0, 3);
  const c = r?.view.statsOf;
  const s = r?.view.stats;
  const out = r?.view.statOut;
  const preview = (v: Float64Array) => `${Array.from(v.slice(0, 3), (x) => fmtNum(x, 4)).join(', ')}${v.length > 3 ? ', …' : ''}`;
  return (
    <div className="node node-stats">
      <NodeOptions>
      <Tabs
        tabs={[
          ['columns', 'On columns'],
          ['rows', 'On rows'],
        ]}
        value={data.on ?? 'columns'}
        onChange={setOn}
      />
      </NodeOptions>
      <InPort label={onRows ? 'dataset' : 'column / dataset'} port={onRows ? 'dataset' : 'column'} id="in" title={onRows ? 'A dataset: choose the columns (e.g. the replicates A1, A2, A3)' : 'A column, or a dataset (then choose its columns: every statistic is then a column, a value per column)'}>
        {c && !ofDataset && !onRows && <span className="muted ellipsis">{titleOf(c)}</span>}
      </InPort>
      <NodeOptions>
      {(onRows || ofDataset) && <ColumnChoice cols={data.cols ?? ''} x={data.x ?? ''} onCols={(v) => set({ cols: v })} onX={(v) => set({ x: v })} result={r} />}
      <RowSelectControls value={data.rows} onChange={(rows) => set({ rows })} hasX={(onRows || ofDataset) && data.x !== '-'} result={r} />
      <div className="row wrap">
        <Field label="Percentiles" title="More statistics: these percentiles (10, 50, 90: P10, P50, P90, as D10, D50, D90 of a size distribution), each an output">
          <TextInput value={data.pcts ?? ''} placeholder="e.g. 10, 50, 90" onChange={(pcts) => set({ pcts: pcts.trim() ? pcts : undefined })} />
        </Field>
        <Field label="CI of mean" title="The confidence interval of the mean (from t, N − 1): its low and high ends, two outputs">
          <Select<number>
            value={data.ci ?? 0}
            options={[
              [0, 'none'],
              [90, '90 %'],
              [95, '95 %'],
              [99, '99 %'],
            ]}
            onChange={(ci) => set({ ci: ci || undefined })}
          />
        </Field>
      </div>
      </NodeOptions>
      <Messages result={r} />
      {onRows ? (
        <>
          <div className="stats-table">
            <OutPort id="x" label="" port="column" title="The X column on the rows used (the row number without X)">
              <span className="stat-name">X</span>
              <span className="val stat-val ellipsis">{r?.outputs.x?.t === 'column' ? `${r.outputs.x.v.name}: ${preview(r.outputs.x.v.values)}` : '—'}</span>
            </OutPort>
            {statList.map((st) => (
              <OutPort key={st.key} id={st.key} label="" port="column" title={`${st.label} of every row: ${st.help}`}>
                <span className="stat-name">{st.label}</span>
                <span className="val stat-val ellipsis">{out ? preview(out[st.key]) : '—'}</span>
              </OutPort>
            ))}
          </div>
          <NodeOptions>
          <div className="row">
            <Field label="±Y in the dataset" title="The error designated ±Y next to the mean in the dataset output (a quick plot draws it as error bars)">
              <Select<'sd' | 'se'>
                value={data.err ?? 'sd'}
                options={[
                  ['sd', 'SD'],
                  ['se', 'SE of mean'],
                ]}
                onChange={(err) => set({ err })}
              />
            </Field>
          </div>
          </NodeOptions>
          <OutPort label="dataset" port="dataset" id="out" title="X, Mean (Y), SD or SE (±Y) and the other statistics — right-click ▸ Plot these columns" />
        </>
      ) : (
        <>
          <div className="stats-table">
            {ofDataset && shown.length > 0 && (
              <div className="stat-head">
                <span className="stat-name" />
                {shown.map((x) => (
                  <span key={x.name} className="stat-val ellipsis" title={titleOf(x)}>
                    {x.name}
                  </span>
                ))}
              </div>
            )}
            {statList.map((st) => (
              <OutPort key={st.key} id={st.key} label="" port={ofDataset ? 'column' : 'scalar'} title={`${st.label}: ${st.help}${ofDataset ? ' — a column: a value per column' : ''}`}>
                <span className="stat-name">{st.label}</span>
                {ofDataset ? (
                  shown.map((x) => (
                    <span key={x.name} className="val stat-val">
                      {x.stats ? fmtNum(x.stats[st.key], 5) : '—'}
                    </span>
                  ))
                ) : (
                  <span className="val stat-val">{s ? fmtNum(s[st.key], 7) : '—'}</span>
                )}
              </OutPort>
            ))}
          </div>
          {ofDataset && cols.length > shown.length && <div className="hint">+ {cols.length - shown.length} more columns in the table</div>}
          <NodeOptions>
            <div className="row wrap">
              <Field label="Control chart" title="Of the (first) column, its values in their order: individuals and moving ranges (I–MR), or the means and ranges of subgroups (X̄–R) — the centre line and the 3σ limits (σ from the ranges), the points out of control by the Western Electric rules (1: beyond 3σ; 2: 2 of 3 beyond 2σ; 3: 4 of 5 beyond 1σ; 4: 8 on one side)">
                <Select<'none' | 'imr' | 'xbar'>
                  value={data.control ?? 'none'}
                  options={[
                    ['none', 'none'],
                    ['imr', 'individuals (I–MR)'],
                    ['xbar', 'subgroup means (X̄–R)'],
                  ]}
                  onChange={(control) => set({ control: control === 'none' ? undefined : control })}
                />
              </Field>
              {data.control === 'xbar' && (
                <Field label="of" title="Values per subgroup (2 to 10), taken in order">
                  <NumInput className="tiny" min={2} max={10} step={1} value={data.subgroup ?? 5} onChange={(subgroup) => set({ subgroup: Math.max(2, Math.min(10, Math.round(subgroup) || 5)) })} />
                </Field>
              )}
            </div>
            {(r?.view.report ?? []).length > 0 && (
              <div className="stat-report">
                {r!.view.report!.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </NodeOptions>
          <OutPort label="table" port="dataset" id="table" title="A row per column (named by it), every statistic a column; Mean designated Y and SD ±Y — right-click ▸ Plot these columns" />
          {data.control && <OutPort label="control chart" port="dataset" id="control" title="Every point (or subgroup): its value, the centre line CL and the limits UCL, LCL (designated Y: a Plot draws them), the ranges and their limits, the rules broken" />}
        </>
      )}
    </div>
  );
}
