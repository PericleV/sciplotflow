// Translate (curves moved on X / Y, columns designated here). Curve math: CurveMathNode.tsx.
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import type { TranslateData } from '../engine/curvemath.ts';
import { ROLE_LABELS, type ColumnRole } from '../engine/table.ts';
import type { AppNode, TranslateNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { maxOf } from '../engine/minmax.ts';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';


const ROLES: [ColumnRole, string][] = (['x', 'y', 'yerr', 'xerr', 'none'] as ColumnRole[]).map((k) => [k, ROLE_LABELS[k]]);

export function TranslateNodeView({ id, data }: NodeProps<TranslateNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<TranslateData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const tv = r?.view.translate;
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  const out = r?.outputs.out;
  const setOwn = (y: string, p: Partial<{ dx: number; dy: number }>) => set({ own: { ...data.own, [y]: { dx: data.own[y]?.dx ?? data.dx, dy: data.own[y]?.dy ?? data.dy, ...p } } });
  return (
    <div className="node node-translate">
      <InPort label="dataset" port="dataset" id="data" title="Optional: a dataset (its designations, changed below if you wish)" />
      {Array.from({ length: count }, (_, k) => (
        <InPort key={k} label={columnLetter(k)} port="column" id={`in-${k}`} title="Optional: a column — designate it below (X, Y, ±Y …)">
          <span className="muted ellipsis">{tv?.cols.filter((c) => c.from === 'port')[k]?.name ?? 'connect a column'}</span>
        </InPort>
      ))}
      <NodeOptions>
      {tv && tv.cols.length > 0 && (
        <details open>
          <summary>Columns and designations</summary>
          <div className="translate-roles">
            {tv.cols.map((c) => (
              <label key={c.name} className="row">
                <span className="ellipsis grow" title={c.name}>
                  {c.name}
                </span>
                <Select
                  value={c.role}
                  options={ROLES}
                  title="Every Y goes with the X on its left; ±Y / ±X with the Y on their left (they are not moved)"
                  onChange={(role) => {
                    const roles = { ...data.roles };
                    roles[c.name] = role;
                    set({ roles });
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <div className="row wrap">
        <Field label="Move">
          <Select<TranslateData['mode']>
            value={data.mode}
            options={[
              ['value', 'by values'],
              ['point', 'a point to a place'],
              ['stagger', 'in steps (curve k by k·Δ)'],
            ]}
            onChange={(mode) => set({ mode })}
          />
        </Field>
      </div>
      {data.mode === 'point' ? (
        <div className="col-form">
          <span>Point</span>
          <span className="row">
            <Select<TranslateData['point']>
              value={data.point}
              options={[
                ['max', 'the maximum'],
                ['min', 'the minimum'],
                ['first', 'the first point'],
                ['last', 'the last point'],
                ['atx', 'the value at X ='],
              ]}
              onChange={(point) => set({ point })}
            />
            {data.point === 'atx' && <NumInput className="short" value={data.atx} onChange={(atx) => set({ atx })} />}
          </span>
          <span>To X₀</span>
          <span className="row">
            <Check label="" value={data.moveX} onChange={(moveX) => set({ moveX })} />
            <NumInput className="short" value={data.x0} onChange={(x0) => set({ x0 })} />
          </span>
          <span>To Y₀</span>
          <span className="row">
            <Check label="" value={data.moveY} onChange={(moveY) => set({ moveY })} />
            <NumInput className="short" value={data.y0} onChange={(y0) => set({ y0 })} />
          </span>
        </div>
      ) : (
        <div className="row wrap">
          <Field label={data.mode === 'stagger' ? 'Δx per curve' : 'ΔX'}>
            <NumInput className="short" value={data.dx} onChange={(dx) => set({ dx })} />
          </Field>
          <Field label={data.mode === 'stagger' ? 'Δy per curve' : 'ΔY'}>
            <NumInput className="short" value={data.dy} onChange={(dy) => set({ dy })} />
          </Field>
        </div>
      )}
      {data.mode === 'value' && (tv?.curves.length ?? 0) > 1 && (
        <details>
          <summary>Each curve its own shift</summary>
          <div className="translate-roles">
            {tv!.curves.map((y) => (
              <div key={y} className="row">
                <span className="ellipsis grow">{y}</span>
                <NumInput className="short" value={data.own[y]?.dx ?? data.dx} title="ΔX" onChange={(dx) => setOwn(y, { dx })} />
                <NumInput className="short" value={data.own[y]?.dy ?? data.dy} title="ΔY" onChange={(dy) => setOwn(y, { dy })} />
                {data.own[y] && (
                  <button
                    className="nodrag ts-btn"
                    title="The common shift again"
                    onClick={() => {
                      const own = { ...data.own };
                      delete own[y];
                      set({ own });
                    }}
                  >
                    <X {...IC} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {out?.t === 'dataset' && <DataPreview columns={out.v.columns} rows={4} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" id="out" title="The curves moved (the errors unchanged)" />
      <OutPort label="shifts" port="dataset" id="shifts" title="ΔX and ΔY of every curve" />
    </div>
  );
}
